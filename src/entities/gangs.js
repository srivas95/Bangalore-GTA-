// Armed hostiles: rowdy-sheeters with machetes and chains, and the odd one with a katta.
// Missions spawn them as targets and crews; a few loiter around markets at night and only
// turn on you when provoked.
import { createHuman, animateWalk, poseIdle, poseFight, posePunch, poseLathi, poseSwing, poseAim, poseDown, poseStagger } from './human.js';
import { WEAPONS, equip, npcFire } from '../systems/weapons.js';
import { LINES } from '../config.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const TAUNTS = ['Yaarlé nee?!', 'Hodeeri avanna!', 'Bidbedi, maga!', 'Ivanige buddhi kalisi!', 'Area nammdu, gothaa?'];

export class Gangs {
  constructor(scene, layout, colliders) {
    this.scene = scene;
    this.layout = layout;
    this.colliders = colliders;
    this.members = [];
  }

  // opts: weapon, health, hostile (attack on sight), crew (shared alert tag), name, outfit, accuracy.
  spawn(x, z, opts = {}) {
    const weapon = opts.weapon || pick(['machete', 'machete', 'chain', 'knife', 'sickle', 'bat']);
    const h = createHuman({ outfit: opts.outfit || pick(['lungi', 'shirt', 'tshirt', 'shirt']), top: opts.top, female: false, ...opts.look });
    equip(h, weapon);
    this.scene.add(h.group);
    const y = this.layout.groundHeight(x, z);
    const w = WEAPONS[weapon];
    const m = {
      h, x, z, y, r: 0.32, heading: opts.heading ?? Math.random() * 6.28,
      weapon, health: opts.health ?? 100, maxHealth: opts.health ?? 100,
      state: opts.hostile ? 'chase' : 'idle', hostile: !!opts.hostile, crew: opts.crew || null, name: opts.name,
      attack: 0, landed: false, fireCd: 1 + Math.random(), clip: w.clip || 0, reloadT: 0, accuracy: opts.accuracy ?? 0.4,
      isGang: true, dead: false, deadT: 0, vx: 0, vz: 0, timer: 0, taunt: 2 + Math.random() * 3, home: { x, z },
    };
    h.group.position.set(x, y, z);
    h.owner = m;
    this.members.push(m);
    return m;
  }

  remove(m) {
    const i = this.members.indexOf(m);
    if (i >= 0) this.members.splice(i, 1);
    this.scene.remove(m.h.group);
  }

  alive(crew) { return this.members.filter((m) => !m.dead && (!crew || m.crew === crew)); }

  // Wake up the whole crew.
  alert(m, world) {
    for (const o of this.members) if (!o.dead && (o === m || (m.crew && o.crew === m.crew))) { o.hostile = true; if (o.state === 'idle') o.state = 'chase'; }
  }

  inFront(x, z, heading, range) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    return this.members.filter((m) => {
      if (m.dead) return false;
      const dx = m.x - x, dz = m.z - z, d = Math.hypot(dx, dz);
      return d < range && (dx * fx + dz * fz) / (d || 1) > 0.35;
    });
  }

  hit(m, dmg, fx, fz, world, lethal = true, knock = false) {
    if (m.dead) return;
    m.health -= dmg;
    world.audio?.grunt(false, m.x, m.z);
    this.alert(m, world);
    if (m.health <= 0) {
      m.dead = true; m.state = 'down'; m.vx = fx * 4; m.vz = fz * 4; m.deadT = 0;
      if (lethal || Math.random() < 0.5) world.particles?.burst('blood', m.x, m.y + 1.1, m.z, 8, 2, 0.6);
      // Their weapon clatters to the ground.
      if (m.weapon !== 'fists') world.pickups?.add(m.weapon, m.x + fx * 0.8, m.z + fz * 0.8, m.y);
      m.h.weaponMesh && (m.h.weaponMesh.visible = false);
      world.onGangDown?.(m);
    } else if (knock) { m.state = 'stagger'; m.timer = m.staggerT = 0.6; m.vx = fx * 4; m.vz = fz * 4; }
    else { m.state = 'stagger'; m.timer = m.staggerT = 0.4; m.vx = fx * 2; m.vz = fz * 2; }
  }

  update(dt, world) {
    const pl = world.player;
    const t = performance.now() / 1000;
    for (let i = this.members.length - 1; i >= 0; i--) {
      const m = this.members[i];
      const h = m.h;
      const dist = Math.hypot(m.x - world.focus.x, m.z - world.focus.z);
      if (m.dead) {
        m.deadT += dt;
        m.x += m.vx * dt; m.z += m.vz * dt; m.vx *= Math.exp(-5 * dt); m.vz *= Math.exp(-5 * dt);
        h.group.rotation.x += (-Math.PI / 2 - h.group.rotation.x) * Math.min(1, dt * 8);
        poseDown(h);
        h.group.position.set(m.x, m.y + 0.1, m.z);
        if ((m.deadT > 90 && dist > 60) || dist > 400) this.remove(m);
        continue;
      }
      if (!m.crew && dist > 300) { this.remove(m); continue; }
      h.group.visible = dist < 180;
      const tgt = pl.vehicle || pl;
      const dx = tgt.x - m.x, dz = tgt.z - m.z, d = Math.hypot(dx, dz);
      const w = WEAPONS[m.weapon];
      // Getting run over.
      for (const v of world.vehicles) {
        if (v.speed < 4 || Math.abs(v.x - m.x) > 4 || Math.abs(v.z - m.z) > 4) continue;
        for (const c of v.circles(this._c || (this._c = []))) {
          if ((m.x - c.x) ** 2 + (m.z - c.z) ** 2 < (c.r + m.r) ** 2) {
            const sp = v.speed;
            this.hit(m, sp * 6, v.vx / sp, v.vz / sp, world, sp > 12, true);
            if (v.driver === 'player') world.crime?.(sp > 12 ? 'Vehicular manslaughter' : 'Hit a pedestrian', m.x, m.z, sp > 12 ? 2 : 1);
            break;
          }
        }
        if (m.dead) break;
      }
      if (m.dead) continue;
      if (m.state === 'stagger') {
        m.timer -= dt;
        m.x += m.vx * dt; m.z += m.vz * dt; m.vx *= 0.9; m.vz *= 0.9;
        poseStagger(h, 1 - m.timer / (m.staggerT || 0.5));
        if (m.timer <= 0) m.state = 'chase';
      } else if (m.state === 'idle') {
        poseIdle(h, t);
        // Provoked by a drawn gun pointed their way, or by the player starting trouble nearby.
        if (m.hostile && d < 30 && !pl.dead) m.state = 'chase';
      } else if (pl.dead) {
        poseIdle(h, t);
      } else if (w.kind === 'gun') {
        this.gunner(m, w, dt, world, tgt, d, dx, dz, t);
      } else {
        this.brawler(m, w, dt, world, tgt, d, dx, dz, t);
      }
      m.taunt -= dt;
      if (m.taunt <= 0 && m.state !== 'idle' && d < 18) { m.taunt = 5 + Math.random() * 6; world.hud?.say(`${m.name || 'Rowdy'}: "${pick(TAUNTS)}"`, 2); }
      const hit = this.colliders.resolveCircle(m.x, m.z, m.r, m.y);
      if (hit) { m.x = hit.x; m.z = hit.z; }
      m.y = this.layout.groundHeight(m.x, m.z, m.y);
      h.group.position.set(m.x, m.y, m.z);
      h.group.rotation.y = m.heading;
    }
  }

  brawler(m, w, dt, world, tgt, d, dx, dz, t) {
    const h = m.h;
    m.heading = Math.atan2(dx, dz);
    const reach = w.range * 0.85 + (world.player.vehicle ? world.player.vehicle.spec.width / 2 : 0);
    if (m.attack > 0) {
      m.attack -= dt;
      const k = 1 - m.attack / w.t;
      if (w.pose === 'overhead') poseLathi(h, k); else if (w.pose === 'swing') poseSwing(h, k); else posePunch(h, k, -1);
      if (!m.landed && k > 0.55) {
        m.landed = true;
        if (d < reach + 0.4) {
          if (world.player.vehicle) world.player.vehicle.takeDamage(w.dmg * 0.12, m.x, m.z, world);
          else { world.player.damage(w.dmg * 0.32, m.x, m.z, world); if (w.lethal) world.particles?.burst('blood', world.player.x, 1.2, world.player.z, 5, 1.5); }
          world.audio?.punch(false);
        } else world.audio?.whoosh();
      }
      return;
    }
    if (d > reach) {
      const sp = 4.6;
      m.x += (dx / d) * sp * dt; m.z += (dz / d) * sp * dt;
      animateWalk(h, dt, sp);
    } else {
      poseFight(h, t);
      if (Math.random() < dt * 1.6) { m.attack = w.t; m.landed = false; }
    }
  }

  gunner(m, w, dt, world, tgt, d, dx, dz, t) {
    const h = m.h;
    m.heading = Math.atan2(dx, dz);
    // Keep a working distance, close in if they can't see you.
    const los = world.police ? world.police.lineOfSight(m.x, m.z, tgt.x, tgt.z) : true;
    if (d > 16 || !los) {
      const sp = 4.2;
      m.x += (dx / d) * sp * dt; m.z += (dz / d) * sp * dt;
      animateWalk(h, dt, sp);
      return;
    }
    if (d < 5) { m.x -= (dx / d) * 2.5 * dt; m.z -= (dz / d) * 2.5 * dt; }
    if (m.reloadT > 0) { m.reloadT -= dt; poseIdle(h, t); if (m.reloadT <= 0) m.clip = w.clip; return; }
    m.fireCd -= dt;
    poseAim(h, Math.atan2(1.0, d) * 0.3, Math.max(0, m.fireCd - w.rate * 2) * 2);
    if (m.fireCd <= 0) {
      m.fireCd = w.rate * 3 + 0.6 + Math.random() * 0.8;
      if (Math.random() < (w.misfire || 0)) { world.audio?.click?.(); return; }
      m.clip--;
      if (m.clip <= 0) m.reloadT = w.reload;
      npcFire(world, h, m, m.weapon, m.accuracy);
    }
  }

  clear(crew) {
    for (const m of this.members.slice()) if (!crew || m.crew === crew) this.remove(m);
  }
}

export { TAUNTS, LINES };
