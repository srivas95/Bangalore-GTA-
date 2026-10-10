// Street life: footpath walkers streamed around the player, crowds that bunch up at signals
// (and jaywalk), chai-stall regulars, cows, and how people react when you hit them.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createHuman, animateWalk, poseIdle, poseDown, poseWait, posePunch, poseFight, poseHandsUp } from './human.js';
import { MeshBuilder, BuilderSet } from '../world/meshBuilder.js';
import { put } from '../world/landmarks.js';
import { mulberry32 } from '../world/textures.js';
import { SIDEWALK_W, CURB_H, LINES } from '../config.js';

const rng = mulberry32(99);
const rand = (a = 0, b = 1) => a + (b - a) * rng();
const pickLine = (list) => list[Math.floor(rng() * list.length)];

function loopFor(block) {
  const o = block.outer, m = SIDEWALK_W * 0.5;
  const r = { minX: o.minX + m, maxX: o.maxX - m, minZ: o.minZ + m, maxZ: o.maxZ - m };
  const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
  return { ...r, w, d, len: 2 * (w + d), cx: (r.minX + r.maxX) / 2, cz: (r.minZ + r.maxZ) / 2, zone: block.zone };
}

function loopPoint(L, t, lat) {
  t = ((t % L.len) + L.len) % L.len;
  if (t < L.w) return { x: L.minX + t, z: L.minZ - lat };
  t -= L.w;
  if (t < L.d) return { x: L.maxX + lat, z: L.minZ + t };
  t -= L.d;
  if (t < L.w) return { x: L.maxX - t, z: L.maxZ + lat };
  t -= L.w;
  return { x: L.minX - lat, z: L.maxZ - t };
}

function nearestT(L, x, z) {
  const c = [
    [Math.max(0, Math.min(L.w, x - L.minX)), Math.abs(z - L.minZ)],
    [L.w + Math.max(0, Math.min(L.d, z - L.minZ)), Math.abs(x - L.maxX)],
    [L.w + L.d + Math.max(0, Math.min(L.w, L.maxX - x)), Math.abs(z - L.maxZ)],
    [2 * L.w + L.d + Math.max(0, Math.min(L.d, L.maxZ - z)), Math.abs(x - L.minX)],
  ];
  c.sort((a, b) => a[1] - b[1]);
  return c[0][0];
}

const turnTo = (h, target, k) => {
  let d = target - h.group.rotation.y;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  h.group.rotation.y += d * Math.min(1, k);
};

export class StreetLife {
  constructor(scene, layout, colliders, signals) {
    this.scene = scene;
    this.layout = layout;
    this.colliders = colliders;
    this.signals = signals;
    this.peds = [];
    this.cows = [];
    this.pool = [];
    this.walkerTarget = 110;
    this.loops = layout.blocks.filter((b) => !b.edge && b.zone !== 'lake').map(loopFor);
    this.crowdNodes = new Map();
    this.stalls = [];
    this.buildChaiStalls();
    this.cowTarget = 8;
  }

  takeHuman() {
    const h = this.pool.pop() || createHuman({}, rng);
    h.group.visible = true;
    h.group.rotation.set(0, 0, 0);
    this.scene.add(h.group);
    return h;
  }

  freePed(p, index) {
    this.scene.remove(p.h.group);
    if (this.pool.length < 80 && !p.temp) this.pool.push(p.h);
    if (index >= 0) this.peds.splice(index, 1);
  }

  newPed(h, props) {
    const p = { h, x: 0, z: 0, y: CURB_H, vx: 0, vy: 0, vz: 0, timer: 0, r: 0.3, health: 100, state: 'walk', speed: 1.3, ...props };
    this.peds.push(p);
    return p;
  }

  spawnWalker(focus, initial) {
    for (let tries = 0; tries < 10; tries++) {
      const L = this.loops[Math.floor(rng() * this.loops.length)];
      const d = Math.hypot(L.cx - focus.x, L.cz - focus.z);
      if (d > 230 || (!initial && d < 60)) continue;
      const p = this.newPed(this.takeHuman(), { kind: 'walker', L, t: rand(0, L.len), dir: rng() < 0.5 ? 1 : -1, speed: rand(1.0, 1.6), lat: rand(-1.2, 1.2) });
      const q = loopPoint(L, p.t, p.lat);
      p.x = q.x; p.z = q.z;
      return p;
    }
    return null;
  }

  buildChaiStalls() {
    const B = new BuilderSet();
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10), cone = new THREE.ConeGeometry(1, 1, 10);
    const candidates = this.loops.filter((l) => ['commercial', 'market', 'mixed', 'towers', 'industrial'].includes(l.zone));
    candidates.forEach((L, k) => {
      if (k % 3) return;
      const q = loopPoint(L, rand(0, L.len), 0.6);
      const m = B.get('m');
      m.box(q.x, CURB_H, q.z, 1.4, 0.9, 0.8, 0x6a4a2a);
      m.box(q.x, CURB_H + 0.9, q.z, 1.5, 0.08, 0.9, 0xc0c0c0);
      put(m, cyl, q.x - 0.3, CURB_H + 1.1, q.z, 0xb0b0b0, 0, 0.15, 0.3, 0.15);
      put(m, cyl, q.x, CURB_H + 1.7, q.z, 0x555555, 0, 0.03, 1.5, 0.03);
      put(m, cone, q.x, CURB_H + 2.5, q.z, rng() < 0.5 ? 0xd03a2a : 0x2a6ad0, 0, 1.3, 0.5, 1.3);
      this.colliders.addCentered(q.x, q.z, 1.4, 0.8, 1.2, 'prop');
      this.stalls.push({ x: q.x, z: q.z, peds: [] });
    });
    B.buildAll({ m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }) }, this.scene, {}, 320);
  }

  spawnCow(focus) {
    for (let tries = 0; tries < 10; tries++) {
      const roads = this.layout.roads;
      const r = roads[Math.floor(rng() * roads.length)];
      const along = (r.axis === 'x' ? focus.z : focus.x) + rand(-300, 300);
      const lat = (r.width / 2 - 1.2) * (rng() < 0.5 ? -1 : 1);
      const x = r.axis === 'x' ? r.pos + lat : along, z = r.axis === 'x' ? along : r.pos + lat;
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d < 90 || d > 330 || this.layout.underpassAt(x, z) || this.layout.flyoverAt(x, z)) continue;
      const group = makeCow();
      group.position.set(x, 0, z);
      group.rotation.y = r.axis === 'x' ? 0 : Math.PI / 2;
      this.scene.add(group);
      this.cows.push({ group, x, z, y: 0, h: group.rotation.y, r: 1.0, timer: rand(2, 10), moving: false, isCow: true });
      return;
    }
  }

  // A carjacked driver bolts away from the player.
  spawnFleeing(x, z, fromX, fromZ, opts = {}) {
    const h = createHuman(opts, rng);
    this.scene.add(h.group);
    const a = Math.atan2(x - fromX, z - fromZ);
    return this.newPed(h, { kind: 'temp', temp: true, state: 'flee', x, z, y: this.layout.groundHeight(x, z), vx: Math.sin(a) * 4.5, vz: Math.cos(a) * 4.5, timer: 7 });
  }

  knock(p, vx, vz, audio) {
    if (p.state === 'down') return;
    p.state = 'down';
    p.vx = vx * 0.7 + rand(-1, 1);
    p.vz = vz * 0.7 + rand(-1, 1);
    p.vy = 2.5 + Math.min(8, Math.hypot(vx, vz) * 0.15);
    p.timer = 4.5;
    p.health = Math.max(p.health, 40);
    audio?.thud(0.6);
  }

  // Player melee lands on a pedestrian.
  hit(p, dmg, dirX, dirZ, world, kick) {
    p.health -= dmg;
    world.audio?.punch(kick);
    world.audio?.grunt(p.h.female);
    if (p.health <= 0 || kick) {
      this.knock(p, dirX * (kick ? 7 : 4), dirZ * (kick ? 7 : 4));
      p.afterDown = rng() < 0.2 && !p.h.female ? 'angry' : 'flee';
    } else {
      p.state = 'stagger'; p.timer = 0.45;
      p.vx = dirX * 2.5; p.vz = dirZ * 2.5;
      p.afterStagger = rng() < (p.h.female ? 0.08 : 0.3) ? 'angry' : 'flee';
    }
    world.hud?.say(`"${pickLine(LINES.punched)}"`, 2);
    // Nearby people scatter; someone always calls 112.
    for (const q of this.peds) {
      if (q === p || q.state === 'down') continue;
      if (Math.abs(q.x - p.x) < 12 && Math.abs(q.z - p.z) < 12 && rng() < 0.7) this.scare(q, p.x, p.z);
    }
  }

  scare(q, fromX, fromZ) {
    if (q.state === 'angry') return;
    if (q.kind === 'crowd' || q.kind === 'stall') this.detach(q);
    const a = Math.atan2(q.x - fromX, q.z - fromZ) + rand(-0.5, 0.5);
    q.state = 'flee'; q.timer = rand(3, 6);
    q.vx = Math.sin(a) * 4.5; q.vz = Math.cos(a) * 4.5;
  }

  // Crowd/stall people become ordinary walkers once disturbed.
  detach(q) {
    if (q.group) q.group.peds = q.group.peds.filter((x) => x !== q);
    q.kind = 'walker';
    q.L = this.nearestLoop(q.x, q.z);
    q.t = nearestT(q.L, q.x, q.z);
    q.dir = rng() < 0.5 ? 1 : -1; q.lat = 0; q.speed = rand(1, 1.5);
  }

  nearestLoop(x, z) {
    let best = this.loops[0], bd = Infinity;
    for (const L of this.loops) { const d = Math.abs(L.cx - x) + Math.abs(L.cz - z); if (d < bd) { bd = d; best = L; } }
    return best;
  }

  // ---------- Signal crowds ----------
  updateCrowds(focus) {
    const sig = this.signals;
    const near = sig.nodes.filter((n) => Math.abs(n.x - focus.x) < 200 && Math.abs(n.z - focus.z) < 200)
      .sort((a, b) => Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z)).slice(0, 3);
    const keep = new Set(near);
    for (const [n, g] of this.crowdNodes) {
      if (keep.has(n)) continue;
      for (const p of g.peds) { const i = this.peds.indexOf(p); if (i >= 0) this.freePed(p, i); }
      this.crowdNodes.delete(n);
    }
    for (const n of near) {
      if (this.crowdNodes.has(n)) continue;
      const g = { node: n, peds: [] };
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const count = 3 + Math.floor(rng() * 4);
        for (let k = 0; k < count; k++) {
          const p = this.newPed(this.takeHuman(), { kind: 'crowd', state: 'wait', group: g, node: n, sx, sz, impatience: rng() });
          this.placeAtCorner(p);
          g.peds.push(p);
        }
      }
      this.crowdNodes.set(n, g);
    }
  }

  cornerPos(n, sx, sz, spill = 0) {
    // Impatient people spill off the kerb onto the carriageway.
    return { x: n.x + sx * (n.hx + 1.6 - spill) + rand(-1.2, 1.2), z: n.z + sz * (n.hz + 1.6 - spill) + rand(-1.2, 1.2) };
  }

  placeAtCorner(p) {
    const spill = p.impatience > 0.75 ? rand(0.8, 2.0) : 0;
    const c = this.cornerPos(p.node, p.sx, p.sz, spill);
    p.x = c.x; p.z = c.z;
    p.h.group.rotation.y = Math.atan2(p.node.x - p.x, p.node.z - p.z) + rand(-0.6, 0.6);
    p.crossed = false;
  }

  startCrossing(p, overX) {
    const n = p.node;
    const zebraZ = n.z + p.sz * (n.hz + 2.1), zebraX = n.x + p.sx * (n.hx + 2.1);
    const pts = overX
      ? [{ x: n.x + p.sx * (n.hx + 0.3), z: zebraZ }, { x: n.x - p.sx * (n.hx + 0.3), z: zebraZ }]
      : [{ x: zebraX, z: n.z + p.sz * (n.hz + 0.3) }, { x: zebraX, z: n.z - p.sz * (n.hz + 0.3) }];
    if (overX) p.sx = -p.sx; else p.sz = -p.sz;
    const end = this.cornerPos(n, p.sx, p.sz);
    p.route = [...pts, end];
    p.state = 'cross';
  }

  update(dt, world) {
    const { focus, vehicles, audio, hud } = world;
    const t = performance.now() / 1000;
    const sig = this.signals;
    this.frame = (this.frame || 0) + 1;

    // Streaming.
    this.updateCrowds(focus);
    const walkers = this.peds.reduce((n, p) => n + (p.kind === 'walker' ? 1 : 0), 0);
    let budget = 6;
    while (walkers + (6 - budget) < this.walkerTarget * (world.pedScale ?? 1) && budget-- > 0) this.spawnWalker(focus, world.initialFill);
    for (const s of this.stalls) {
      const near = Math.abs(s.x - focus.x) < 150 && Math.abs(s.z - focus.z) < 150;
      if (near && !s.peds.length && !s.cool) {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + rand(0, 1);
          const p = this.newPed(this.takeHuman(), { kind: 'stall', state: 'idle', group: s, x: s.x + Math.cos(a) * 1.4, z: s.z + Math.sin(a) * 1.2 });
          p.h.group.rotation.y = Math.atan2(s.x - p.x, s.z - p.z);
          s.peds.push(p);
        }
      } else if (!near && s.peds.length) {
        for (const p of s.peds) { const i = this.peds.indexOf(p); if (i >= 0) this.freePed(p, i); }
        s.peds = [];
      }
    }
    if (this.cows.length < this.cowTarget && rng() < dt) this.spawnCow(focus);

    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      const dist = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (p.kind === 'walker' && dist > 260) { this.freePed(p, i); continue; }
      if (p.temp && dist > 200) { this.freePed(p, i); continue; }
      const vis = dist < 170;
      p.h.group.visible = vis;
      if (!vis && p.state === 'walk') { p.t += p.dir * p.speed * dt; continue; }

      if (p.state !== 'down') this.checkVehicleHits(p, vehicles, world);

      switch (p.state) {
        case 'walk': {
          p.t += p.dir * p.speed * dt;
          const q = loopPoint(p.L, p.t, p.lat);
          const dx = q.x - p.x, dz = q.z - p.z;
          p.x = q.x; p.z = q.z;
          if (dx * dx + dz * dz > 1e-6) turnTo(p.h, Math.atan2(dx, dz), dt * 8);
          // Distant walkers animate at a third of the rate.
          if (dist < 70) animateWalk(p.h, dt, p.speed);
          else if ((this.frame + i) % 3 === 0) animateWalk(p.h, dt * 3, p.speed);
          if (rng() < dt * 0.01) p.dir *= -1;
          break;
        }
        case 'idle':
          poseIdle(p.h, t);
          break;
        case 'wait': {
          const n = p.node;
          if (sig.pedPhase(n) && !p.crossed && rng() < dt * 1.5) { p.crossed = true; this.startCrossing(p, rng() < 0.5); }
          // Jaywalking: the impatient don't wait for the walk phase.
          else if (!sig.pedPhase(n) && p.impatience > 0.85 && rng() < dt * 0.02) { this.startCrossing(p, rng() < 0.5); p.jaywalk = true; }
          if (!sig.pedPhase(n)) p.crossed = false;
          poseWait(p.h, t, p.impatience);
          break;
        }
        case 'cross': {
          const tgt = p.route[0];
          const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
          const sp = p.jaywalk ? 3.2 : sig.pedTimeLeft(p.node) < 4 ? 2.6 : 1.5;
          if (d < 0.3) { p.route.shift(); if (!p.route.length) { p.state = 'wait'; p.jaywalk = false; p.crossed = true; } break; }
          p.x += (dx / d) * sp * dt; p.z += (dz / d) * sp * dt;
          turnTo(p.h, Math.atan2(dx, dz), dt * 10);
          animateWalk(p.h, dt, sp);
          break;
        }
        case 'dodge':
        case 'flee': {
          p.x += p.vx * dt; p.z += p.vz * dt;
          const hit = this.colliders.resolveCircle(p.x, p.z, p.r, p.y);
          if (hit) { p.x = hit.x; p.z = hit.z; if (p.state === 'flee') { const a = Math.atan2(p.vx, p.vz) + (rng() < 0.5 ? 1.2 : -1.2); p.vx = Math.sin(a) * 4.5; p.vz = Math.cos(a) * 4.5; } }
          p.h.group.rotation.y = Math.atan2(p.vx, p.vz);
          animateWalk(p.h, dt, Math.hypot(p.vx, p.vz));
          p.timer -= dt;
          if (p.timer <= 0) {
            if (p.temp) { this.freePed(p, i); continue; }
            if (p.kind !== 'walker') this.detach(p);
            p.state = 'walk'; p.t = nearestT(p.L, p.x, p.z); p.lat = 0;
          }
          break;
        }
        case 'stagger':
          p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 0.9; p.vz *= 0.9;
          p.timer -= dt;
          poseIdle(p.h, t);
          p.h.bones.spine.rotation.x = -0.4;
          if (p.timer <= 0) {
            if (p.afterStagger === 'angry') { p.state = 'angry'; p.timer = 15; hud?.say(`"${pickLine(LINES.fightBack)}"`, 2); }
            else this.scare(p, world.player.x, world.player.z);
          }
          break;
        case 'angry': this.updateAngry(p, dt, world, t); break;
        case 'cower':
          poseHandsUp(p.h, t);
          p.timer -= dt;
          if (p.timer <= 0) this.scare(p, world.player.x, world.player.z);
          break;
        case 'down': {
          p.vy -= 9.8 * dt;
          p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
          const g = this.layout.groundHeight(p.x, p.z, p.y);
          if (p.y <= g) { p.y = g; p.vy = 0; p.vx *= Math.exp(-6 * dt); p.vz *= Math.exp(-6 * dt); }
          const hit = this.colliders.resolveCircle(p.x, p.z, p.r, p.y);
          if (hit) { p.x = hit.x; p.z = hit.z; p.vx *= -0.3; p.vz *= -0.3; }
          p.h.group.rotation.x += (-Math.PI / 2 - p.h.group.rotation.x) * Math.min(1, dt * 8);
          poseDown(p.h);
          p.timer -= dt;
          if (p.timer <= 0) {
            p.h.group.rotation.x = 0;
            p.health = 60;
            if (p.afterDown === 'angry') { p.state = 'angry'; p.timer = 12; p.afterDown = null; }
            else this.scare(p, world.player.x, world.player.z);
          }
          break;
        }
      }
      if (p.state !== 'down') p.y = this.layout.groundHeight(p.x, p.z, p.y);
      p.h.group.position.set(p.x, p.y, p.z);
      if (p.health < 100 && p.state !== 'down') p.health = Math.min(100, p.health + dt * 3);
    }
    this.updateCows(dt, world, t);
  }

  updateAngry(p, dt, world, t) {
    const pl = world.player;
    const dx = pl.x - p.x, dz = pl.z - p.z, d = Math.hypot(dx, dz);
    p.timer -= dt;
    if (p.timer <= 0 || pl.vehicle || d > 25 || pl.dead) { this.scare(p, pl.x, pl.z); return; }
    turnTo(p.h, Math.atan2(dx, dz), dt * 10);
    if (p.attack > 0) {
      p.attack -= dt;
      const k = 1 - p.attack / 0.55;
      posePunch(p.h, k, -1);
      if (!p.landed && k > 0.4) { p.landed = true; if (d < 1.4) pl.damage(9, p.x, p.z, world); else world.audio?.whoosh(); }
      return;
    }
    if (d > 1.1) {
      const sp = 3.6;
      p.x += (dx / d) * sp * dt; p.z += (dz / d) * sp * dt;
      const hit = this.colliders.resolveCircle(p.x, p.z, p.r, p.y);
      if (hit) { p.x = hit.x; p.z = hit.z; }
      animateWalk(p.h, dt, sp);
    } else {
      poseFight(p.h, t);
      if (rng() < dt * 1.8) { p.attack = 0.55; p.landed = false; }
    }
  }

  checkVehicleHits(p, vehicles, world) {
    for (const v of vehicles) {
      if (v.speed < 3) continue;
      const dx = p.x - v.x, dz = p.z - v.z;
      if (dx * dx + dz * dz > 64 || Math.abs(p.y - v.y) > 2) continue;
      for (const c of v.circles(this._c || (this._c = []))) {
        if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < (c.r + p.r) ** 2) {
          this.knock(p, v.vx, v.vz, world.audio);
          if (p.kind !== 'walker' && !p.temp) this.detach(p);
          if (v.driver === 'player') {
            if (rng() < 0.6) world.hud?.say(`"${pickLine(LINES.bumped)}"`, 2.5);
            world.crime?.('Hit a pedestrian', p.x, p.z, 1);
          }
          return;
        }
      }
    }
    // Dodge a fast vehicle heading straight at us.
    if (p.state === 'walk' || p.state === 'idle' || p.state === 'wait') {
      for (const v of vehicles) {
        if (v.driver !== 'player' || v.speed < 6) continue;
        const dx = p.x - v.x, dz = p.z - v.z, d2 = dx * dx + dz * dz;
        if (d2 > 64) continue;
        const ahead = (dx * v.vx + dz * v.vz) / v.speed;
        if (ahead > 0) {
          if (p.kind !== 'walker') this.detach(p);
          p.state = 'dodge'; p.timer = 0.6;
          const lx = v.vz / v.speed, lz = -v.vx / v.speed;
          const s = Math.sign(dx * lx + dz * lz) || 1;
          p.vx = lx * s * 5; p.vz = lz * s * 5;
        }
      }
    }
  }

  updateCows(dt, world, t) {
    const { focus, audio } = world;
    for (let i = this.cows.length - 1; i >= 0; i--) {
      const c = this.cows[i];
      if (Math.hypot(c.x - focus.x, c.z - focus.z) > 380) { this.scene.remove(c.group); this.cows.splice(i, 1); continue; }
      c.timer -= dt;
      if (c.timer <= 0) {
        c.moving = !c.moving && rng() < 0.5;
        c.timer = c.moving ? rand(3, 8) : rand(5, 15);
        if (rng() < 0.3) audio?.moo(c.x, c.z, world.camera);
      }
      if (c.moving) {
        const nx = c.x + Math.sin(c.h) * 0.4 * dt, nz = c.z + Math.cos(c.h) * 0.4 * dt;
        if (this.layout.roadAt(nx, nz) && !this.layout.underpassAt(nx, nz)) { c.x = nx; c.z = nz; } else c.h += Math.PI;
        c.group.position.set(c.x, 0, c.z);
        c.group.rotation.y = c.h;
      }
      const head = c.group.userData.head;
      if (head) head.rotation.x = c.moving ? Math.sin(t * 3) * 0.08 : 0.25 + Math.sin(t * 0.7 + c.x) * 0.15;
    }
  }

  // Obstacles traffic must yield to: cows, and anyone standing on the carriageway.
  collectObstacles(out) {
    for (const c of this.cows) out.push(c);
    for (const p of this.peds) if (p.h.group.visible && this.layout.groundHeight(p.x, p.z) < 0.05 && p.state !== 'walk') out.push(p);
  }

  // People in melee range in front of (x, z) facing `heading`.
  targetsInFront(x, z, heading, range) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const out = [];
    for (const p of this.peds) {
      if (p.state === 'down' || !p.h.group.visible) continue;
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
      if (d < range && (dx * fx + dz * fz) / (d || 1) > 0.4) out.push(p);
    }
    return out;
  }

  cowsInFront(x, z, heading, range) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    return this.cows.filter((c) => { const dx = c.x - x, dz = c.z - z, d = Math.hypot(dx, dz); return d < range + 0.8 && (dx * fx + dz * fz) / (d || 1) > 0.3; });
  }
}

function makeCow() {
  const b = new MeshBuilder();
  const white = rng() < 0.7 ? 0xece8e0 : 0x8a6a4a;
  const rb = new RoundedBoxGeometry(1, 1, 1, 2, 0.25);
  put(b, rb, 0, 1.05, 0, white, 0, 0.75, 0.75, 1.7);
  put(b, rb, 0, 1.5, 0.45, white, 0, 0.45, 0.35, 0.45); // zebu hump
  for (const [x, z] of [[-0.25, 0.6], [0.25, 0.6], [-0.25, -0.6], [0.25, -0.6]]) put(b, rb, x, 0.4, z, white, 0, 0.14, 0.85, 0.14);
  put(b, rb, 0, 0.8, -0.86, white, 0, 0.06, 0.6, 0.06, 0.3);
  const body = b.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  const hb = new MeshBuilder();
  put(hb, rb, 0, 0, 0.3, white, 0, 0.32, 0.36, 0.6);
  put(hb, rb, 0, -0.05, 0.62, 0x6a5a50, 0, 0.26, 0.24, 0.12);
  for (const s of [-1, 1]) {
    put(hb, new THREE.ConeGeometry(0.04, 0.32, 6), s * 0.14, 0.26, 0.15, 0xd8c8a8, 0, 1, 1, 1, 0, -s * 0.5);
    put(hb, rb, s * 0.22, 0.06, 0.12, white, 0, 0.18, 0.06, 0.1);
  }
  // Painted horns and a marigold garland: a well-loved temple cow.
  if (rng() < 0.4) for (let k = 0; k < 9; k++) { const a = (k / 8) * Math.PI; put(hb, rb, Math.cos(a) * 0.2, -0.2 - Math.sin(a) * 0.12, 0.05, 0xf0a020, 0, 0.07, 0.07, 0.07); }
  const head = hb.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  head.position.set(0, 1.25, 0.85);
  const g = new THREE.Group();
  g.add(body, head);
  g.userData.head = head;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
