// Bengaluru City Police: wanted level, Hoysala (Maruti Ertiga) pursuit units that route through
// the road graph and ram on sight, and lathi-wielding constables who chase you on foot.
import { Vehicle } from '../entities/vehicle.js';
import { createHuman, animateWalk, poseLathi, poseDown, poseIdle } from '../entities/human.js';
import { LINES } from '../config.js';

const MAX_UNITS = [0, 1, 2, 3, 4, 5];
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Police {
  constructor(scene, layout, colliders, hud, audio) {
    this.scene = scene;
    this.layout = layout;
    this.colliders = colliders;
    this.hud = hud;
    this.audio = audio;
    this.units = [];
    this.cops = [];
    this.level = 0;
    this.cool = 0;
    this.seenT = 0;
    this.searching = false;
    this.bustT = 0;
    this.spawnCd = 0;
    hud.setStars(0, false);
  }

  get vehicles() {
    return this.units.map((u) => u.v);
  }

  // A crime was committed at (x, z). Witnessed by police nearby, or reported by the public.
  crime(reason, x, z, stars, world) {
    let witnessed = this.units.some((u) => Math.hypot(u.v.x - x, u.v.z - z) < 70) || this.cops.some((c) => Math.hypot(c.x - x, c.z - z) < 50);
    // Patrol Hoysalas in traffic also respond.
    if (world) {
      for (const a of world.traffic.agents) {
        if (a.v.type === 'hoysala' && Math.hypot(a.v.x - x, a.v.z - z) < 90) {
          witnessed = true;
          const v = world.traffic.release(a);
          this.addUnit(v);
          break;
        }
      }
    }
    const before = this.level;
    if (witnessed || Math.random() < 0.6 || this.level > 0) this.level = Math.min(5, this.level + stars);
    if (this.level > before) {
      this.cool = 0;
      this.hud.say(`★ Wanted: ${reason}${witnessed ? '' : ' (someone called 112)'}`, 2.5);
    }
    if (this.level > 0) { this.seenT = 0; this.lastKnown = { x, z }; }
    this.hud.setStars(this.level, false);
  }

  clear() {
    this.level = 0;
    this.hud.setStars(0, false);
    for (const u of this.units) u.state = 'leave';
  }

  addUnit(v) {
    v.driver = 'police';
    v.siren = true;
    v.removeRider();
    if (!v.group.parent) this.scene.add(v.group);
    const u = { v, state: 'pursue', path: [], replan: 0, stuck: 0, reverse: 0, officers: 2, onFoot: [] };
    this.units.push(u);
    return u;
  }

  spawnUnit(world) {
    const p = world.player.pos;
    const L = this.layout;
    const ring = L.nodes.filter((n) => { const d = Math.hypot(n.x - p.x, n.z - p.z); return d > 130 && d < 280; });
    for (let tries = 0; tries < 10 && ring.length; tries++) {
      const n = ring[Math.floor(Math.random() * ring.length)];
      const e = n.out[Math.floor(Math.random() * n.out.length)];
      const off = L.laneOffset(e.road, 0);
      const x = n.x + e.dir.x * (L.crossHalfWidth(n, e.road) + 8) + e.dir.z * off;
      const z = n.z + e.dir.z * (L.crossHalfWidth(n, e.road) + 8) - e.dir.x * off;
      const v = new Vehicle('hoysala', { x, z, heading: Math.atan2(e.dir.x, e.dir.z), pink: Math.random() < 0.2 });
      v.syncVisual(0, world);
      return this.addUnit(v);
    }
    return null;
  }

  // Shortest route over the junction graph (BFS), as a list of junction positions.
  route(fromX, fromZ, toX, toZ) {
    const L = this.layout;
    const a = L.nearestNode(fromX, fromZ), b = L.nearestNode(toX, toZ);
    const prev = new Map([[a.id, null]]);
    const q = [a];
    while (q.length) {
      const n = q.shift();
      if (n === b) break;
      for (const e of n.out) if (!prev.has(e.to.id)) { prev.set(e.to.id, n); q.push(e.to); }
    }
    const path = [];
    for (let n = b; n; n = prev.get(n.id)) path.unshift({ x: n.x, z: n.z });
    return path;
  }

  lineOfSight(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), steps = Math.ceil(d / 5);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      if (this.colliders.pointBlocked(ax + (bx - ax) * t, az + (bz - az) * t, 1.2, 'building')) return false;
    }
    return true;
  }

  vehicleStolen(v) {
    const u = this.units.find((q) => q.v === v);
    if (u) { this.units.splice(this.units.indexOf(u), 1); v.siren = false; }
  }

  // ---------- officers on foot ----------
  spawnCops(u, world) {
    const v = u.v;
    for (let k = 0; k < u.officers; k++) {
      const h = createHuman({ outfit: 'police', lathi: true });
      const side = k === 0 ? -1 : 1;
      const x = v.x + Math.cos(v.heading) * side * (v.spec.width / 2 + 0.6), z = v.z - Math.sin(v.heading) * side * (v.spec.width / 2 + 0.6);
      h.group.position.set(x, v.y, z);
      this.scene.add(h.group);
      const c = { h, x, z, y: v.y, r: 0.32, unit: u, state: 'chase', health: 100, attack: 0, isCop: true, shout: Math.random() * 3 };
      this.cops.push(c);
      u.onFoot.push(c);
    }
    u.officers = 0;
    u.state = 'parked';
    world.hud.say(`Constable: "${LINES.cop[Math.floor(Math.random() * LINES.cop.length)]}"`, 2.5);
  }

  copsInFront(x, z, heading, range) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    return this.cops.filter((c) => {
      if (c.state === 'down') return false;
      const dx = c.x - x, dz = c.z - z, d = Math.hypot(dx, dz);
      return d < range && (dx * fx + dz * fz) / (d || 1) > 0.4;
    });
  }

  hitCop(c, dmg, fx, fz, kick) {
    c.health -= dmg;
    this.audio?.punch(kick);
    this.audio?.grunt(false);
    if (c.health <= 0 || kick) { c.state = 'down'; c.timer = 5; c.vx = fx * (kick ? 6 : 3); c.vz = fz * (kick ? 6 : 3); }
    else { c.x += fx * 0.6; c.z += fz * 0.6; }
  }

  updateCop(c, dt, world) {
    const pl = world.player;
    const t = performance.now() / 1000;
    const h = c.h;
    if (c.state === 'down') {
      c.x += c.vx * dt; c.z += c.vz * dt; c.vx *= Math.exp(-5 * dt); c.vz *= Math.exp(-5 * dt);
      h.group.rotation.x += (-Math.PI / 2 - h.group.rotation.x) * Math.min(1, dt * 8);
      poseDown(h);
      c.timer -= dt;
      if (c.timer <= 0) { c.state = 'chase'; c.health = 70; h.group.rotation.x = 0; }
    } else {
      // Chase the player on foot, or head back to the car.
      const target = (this.level > 0 && !pl.vehicle && !pl.dead) || (this.level > 0 && pl.vehicle && Math.hypot(pl.x - c.x, pl.z - c.z) < 12) ? pl : c.unit && this.units.includes(c.unit) && !c.unit.v.engineDead ? c.unit.v : null;
      if (!target) { c.state = 'leave'; }
      const tx = target ? target.x : c.x + 1, tz = target ? target.z : c.z;
      const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
      h.group.rotation.y = Math.atan2(dx, dz);
      if (target === pl && d < 1.25) {
        if (c.attack <= 0 && Math.random() < dt * 1.6) c.attack = 0.7;
      }
      if (c.attack > 0) {
        c.attack -= dt;
        const k = 1 - c.attack / 0.7;
        poseLathi(h, k);
        if (!c.landed && k > 0.6) { c.landed = true; if (d < 1.6) { pl.damage(11, c.x, c.z, world); world.audio?.punch(false); } }
        if (c.attack <= 0) c.landed = false;
      } else if (d > (target === pl ? 1.0 : 2.0)) {
        const sp = target === pl ? 5.0 : 3.5;
        c.x += (dx / d) * sp * dt; c.z += (dz / d) * sp * dt;
        const hit = this.colliders.resolveCircle(c.x, c.z, c.r, c.y);
        if (hit) { c.x = hit.x; c.z = hit.z; }
        animateWalk(h, dt, sp);
      } else if (target && target !== pl) {
        // Back in the car.
        c.state = 'gone';
        const u = c.unit;
        u.officers++;
        u.onFoot = u.onFoot.filter((q) => q !== c);
        if (!u.onFoot.length) u.state = this.level > 0 ? 'pursue' : 'leave';
      } else poseIdle(h, t);
      c.shout -= dt;
      if (c.shout <= 0 && target === pl && d < 20) { c.shout = 4 + Math.random() * 4; world.hud.say(`Constable: "${LINES.cop[Math.floor(Math.random() * LINES.cop.length)]}"`, 2); }
    }
    c.y = this.layout.groundHeight(c.x, c.z, c.y);
    h.group.position.set(c.x, c.y, c.z);
  }

  // ---------- vehicles ----------
  updateUnit(u, dt, world) {
    const v = u.v;
    const pl = world.player;
    const tgt = pl.vehicle || pl;
    const px = tgt.x, pz = tgt.z;
    const d = Math.hypot(px - v.x, pz - v.z);
    let aimX, aimZ, throttle = 1;
    // A wrecked Hoysala: the constables bail out and carry on on foot.
    if (v.engineDead) {
      v.siren = false;
      if (u.officers > 0 && u.state !== 'parked') this.spawnCops(u, world);
      u.state = 'parked';
      v.update(dt, { throttle: 0, steer: 0, handbrake: true }, world);
      return;
    }
    if (u.state === 'leave') {
      v.siren = false;
      if (!u.path.length || u.replan <= 0) { u.path = this.route(v.x, v.z, v.x + (v.x - px), v.z + (v.z - pz)); u.replan = 5; }
    } else if (u.state === 'parked') {
      v.update(dt, { throttle: 0, steer: 0, handbrake: true }, world);
      return;
    }
    u.replan -= dt;
    const los = d < 70 && this.lineOfSight(v.x, v.z, px, pz);
    if (u.state === 'pursue' && los) {
      // Lead the target a little and ram.
      aimX = px + (tgt.vx || 0) * 0.5; aimZ = pz + (tgt.vz || 0) * 0.5;
      if (!pl.vehicle && d < 14) throttle = d < 8 ? -0.6 : 0.3;
    } else {
      if (u.replan <= 0 || !u.path.length) { u.path = u.state === 'leave' ? u.path : this.route(v.x, v.z, px, pz); u.replan = 2.5; }
      // Drop reached junctions, or ones we're already past (driving along the next road segment).
      while (u.path.length > 1) {
        const a = u.path[0], b = u.path[1];
        const abx = b.x - a.x, abz = b.z - a.z, L = Math.hypot(abx, abz) || 1;
        const t = ((v.x - a.x) * abx + (v.z - a.z) * abz) / (L * L);
        const off = Math.abs((v.x - a.x) * abz - (v.z - a.z) * abx) / L;
        if (Math.hypot(a.x - v.x, a.z - v.z) < 9 || (t > 0 && t < 1 && off < 9)) u.path.shift();
        else break;
      }
      const wp = u.path[0] || { x: px, z: pz };
      aimX = wp.x; aimZ = wp.z;
    }
    let diff = wrap(Math.atan2(aimX - v.x, aimZ - v.z) - v.heading);
    let steer = Math.max(-1, Math.min(1, diff * 2.2));
    if (Math.abs(diff) > 1.3 && v.speed > 9) throttle = 0.2;
    if (v.speed > (los ? 30 : 26)) throttle = Math.min(throttle, 0); // ~95 km/h through town
    // Slow for the turn at the next junction.
    if (!los && u.path.length > 1 && Math.hypot(aimX - v.x, aimZ - v.z) < 35 && v.speed > 12) throttle = -0.3;
    if (Math.abs(diff) > 2.4 && d < 25 && v.speed < 4) { throttle = -0.8; steer = -steer; }
    // Unstick by reversing.
    if (u.reverse > 0) { u.reverse -= dt; throttle = -1; steer = -u.revSteer; }
    else if (throttle > 0.5 && v.speed < 1.2) { u.stuck += dt; if (u.stuck > 1.4) { u.reverse = 1.3; u.revSteer = steer || 1; u.stuck = 0; } }
    else u.stuck = Math.max(0, u.stuck - dt);
    v.update(dt, { throttle, steer, handbrake: false }, world);

    // Officers get out to arrest a player on foot.
    if (u.state === 'pursue' && !pl.vehicle && !pl.dead && d < 15 && v.speed < 2.5 && u.officers > 0) this.spawnCops(u, world);
  }

  update(dt, world) {
    const pl = world.player;
    const p = pl.pos;
    this.spawnCd -= dt;
    // Keep the right number of units chasing.
    const active = this.units.filter((u) => u.state !== 'leave').length;
    if (this.level > 0 && active < MAX_UNITS[this.level] && this.spawnCd <= 0) { this.spawnUnit(world); this.spawnCd = 4; }

    // Is anyone watching you?
    const seen = this.units.some((u) => Math.hypot(u.v.x - p.x, u.v.z - p.z) < 110 && this.lineOfSight(u.v.x, u.v.z, p.x, p.z))
      || this.cops.some((c) => c.state !== 'down' && Math.hypot(c.x - p.x, c.z - p.z) < 40);
    if (this.level > 0) {
      if (seen) { this.seenT = 0; this.lastKnown = { x: p.x, z: p.z }; } else this.seenT += dt;
      // Lose them: stay out of sight to drop a star every 12 s.
      if (this.seenT > 12) {
        this.seenT = 0;
        this.level--;
        if (this.level === 0) { this.clear(); this.hud.say('You lost the Hoysalas. Wanted level cleared.', 3); this.audio?.sting(false); }
      }
      this.hud.setStars(this.level, !seen);
    }

    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.v.driver === 'player') { this.units.splice(i, 1); continue; }
      if (this.level === 0 && u.state === 'pursue') u.state = 'leave';
      this.updateUnit(u, dt, world);
      const d = Math.hypot(u.v.x - p.x, u.v.z - p.z);
      if ((u.state === 'leave' && d > 220) || d > 600) {
        if (!u.onFoot.length) { this.scene.remove(u.v.group); this.units.splice(i, 1); }
      }
    }
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i];
      this.updateCop(c, dt, world);
      const far = Math.hypot(c.x - p.x, c.z - p.z) > 150;
      if (c.state === 'gone' || (c.state === 'leave' && far) || (far && this.level === 0)) {
        this.scene.remove(c.h.group);
        this.cops.splice(i, 1);
        if (c.unit) c.unit.onFoot = c.unit.onFoot.filter((q) => q !== c);
      }
    }

    // Busted?
    if (this.level > 0 && !pl.dead) {
      let pinned = false;
      if (pl.vehicle) {
        if (pl.vehicle.speed < 1.5) pinned = this.units.some((u) => Math.hypot(u.v.x - p.x, u.v.z - p.z) < 7) || this.cops.some((c) => c.state !== 'down' && Math.hypot(c.x - p.x, c.z - p.z) < 3);
      } else {
        pinned = this.cops.some((c) => c.state !== 'down' && Math.hypot(c.x - p.x, c.z - p.z) < 1.4) && (pl.speed || 0) < 3 && !pl.attack;
      }
      this.bustT = pinned ? this.bustT + dt : Math.max(0, this.bustT - dt * 2);
      if (this.bustT > (pl.vehicle ? 3 : 1.6)) { this.bustT = 0; world.onBusted?.(); }
    }

    // Siren volume from the nearest wailing Hoysala.
    let nearest = Infinity;
    for (const u of this.units) if (u.v.siren) nearest = Math.min(nearest, Math.hypot(u.v.x - p.x, u.v.z - p.z));
    if (pl.vehicle?.siren) nearest = 5;
    this.audio?.siren(nearest < 350 ? Math.min(1, 40 / (nearest + 10)) : 0);
  }

  // Everyone stands down (after busted / wasted).
  reset() {
    this.level = 0;
    this.hud.setStars(0, false);
    for (const u of this.units) this.scene.remove(u.v.group);
    for (const c of this.cops) this.scene.remove(c.h.group);
    this.units = [];
    this.cops = [];
    this.bustT = 0;
  }
}
