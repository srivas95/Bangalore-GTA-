// The player: walking, running, jumping, punching, kicking, swimming through floods,
// and getting in and out of any vehicle.
import * as THREE from 'three';
import { createHuman, animateWalk, poseIdle, poseSit, posePunch, poseKick, poseDown, poseLathi, poseSwing, poseAim } from './human.js';
import { LINES } from '../config.js';
import { WEAPONS, WEAPON_ORDER, equip, muzzle, raycast } from '../systems/weapons.js';

const WALK = 2.2, RUN = 6.0, GRAVITY = 14, JUMP = 5;
const PUNCH_T = 0.42, KICK_T = 0.62;

export class Player {
  constructor(scene, x, z) {
    this.scene = scene;
    this.human = createHuman({ outfit: 'shirt', top: 0x3a6ea5, bottom: 0x22304a, skin: 0xa8693c, shoes: 0xeeeeee, female: false });
    scene.add(this.human.group);
    this.x = x; this.z = z; this.y = 0; this.vy = 0;
    this.heading = 0;
    this.vehicle = null;
    this.r = 0.35;
    this.isPlayer = true;
    this.grounded = true;
    this.health = 100;
    this.hurtCooldown = 0;
    this.attack = null; // {kind, t, side, landed}
    this.punchSide = -1;
    this.knock = 0;
    this.dead = false;
    this.kx = 0; this.kz = 0;
    // Weapons: what you own, rounds in the gun, rounds in your pocket.
    this.weapons = new Set(['fists']);
    this.weapon = 'fists';
    this.clip = {}; this.ammo = {};
    this.aiming = false;
    this.fireCd = 0; this.reloadT = 0; this.recoil = 0;
    this.cheat = '';
  }

  // ---------- weapons ----------
  give(key, rounds = 0, select = true) {
    const w = WEAPONS[key];
    if (!w) return;
    this.weapons.add(key);
    if (w.kind === 'gun') {
      this.ammo[key] = (this.ammo[key] || 0) + rounds;
      if (this.clip[key] === undefined) { const n = Math.min(w.clip, this.ammo[key]); this.clip[key] = n; this.ammo[key] -= n; }
    }
    if (select) this.select(key);
  }

  select(key) {
    if (!this.weapons.has(key)) return;
    this.weapon = key;
    this.attack = null; this.reloadT = 0;
    equip(this.human, key);
    if (this.vehicle && this.human.weaponMesh) this.human.weaponMesh.visible = false;
  }

  // Walking over a pickup.
  collect(what, world) {
    const [key, n] = what.split(':');
    if (key === 'ammo') { if (!this.weapons.has(n)) return false; this.ammo[n] = (this.ammo[n] || 0) + (n === 'katta' ? 4 : 12); world.hud?.say(`+ ${WEAPONS[n].name} rounds`, 1.5); return true; }
    if (key === 'cash') { world.money?.(+n); world.hud?.say(`+ ₹${n}`, 1.5); return true; }
    if (key === 'health') { if (this.health >= 100) return false; this.health = 100; return true; }
    const w = WEAPONS[key];
    if (!w) return false;
    const had = this.weapons.has(key);
    this.give(key, w.kind === 'gun' ? (key === 'katta' ? 3 : 12) : 0, !had);
    world.hud?.say(had ? `${w.name}: more rounds` : `Picked up: ${w.name}${w.kn ? ` (${w.kn})` : ''}`, 2);
    return true;
  }

  cycleWeapon(dir = 1) {
    const owned = WEAPON_ORDER.filter((k) => this.weapons.has(k));
    const i = owned.indexOf(this.weapon);
    this.select(owned[(i + dir + owned.length) % owned.length]);
  }

  // Fire the current gun. Aiming: down the camera's line of sight; from the hip: at the nearest
  // threat in front, else straight ahead.
  shoot(world) {
    const w = WEAPONS[this.weapon];
    if (this.reloadT > 0 || this.fireCd > 0) return;
    if (!this.clip[this.weapon]) {
      if (this.ammo[this.weapon] > 0) this.reload();
      else { world.audio?.click?.(); world.hud?.say('Out of rounds.', 1.2); this.fireCd = 0.4; }
      return;
    }
    this.fireCd = w.rate;
    this.clip[this.weapon]--;
    if (Math.random() < (w.misfire || 0)) { world.audio?.click?.(); world.hud?.say('Misfire! Country-made, after all.', 1.5); if (!this.clip[this.weapon]) this.reload(); return; }
    const o = muzzle(this.human);
    let dir;
    const cam = world.camera;
    if (this.aiming) {
      // The point under the crosshair, then from the muzzle to it.
      const cd = cam.getWorldDirection(new THREE.Vector3());
      const back = Math.hypot(cam.position.x - this.x, cam.position.z - this.z) + 0.5;
      const aimHit = raycast(world, { x: cam.position.x + cd.x * back, y: cam.position.y + cd.y * back, z: cam.position.z + cd.z * back }, cd, w.range, this);
      const tp = aimHit || { x: cam.position.x + cd.x * w.range, y: cam.position.y + cd.y * w.range, z: cam.position.z + cd.z * w.range };
      dir = { x: tp.x - o.x, y: tp.y - o.y, z: tp.z - o.z };
    } else {
      const t = this.softTarget(world, w.range * 0.7);
      dir = t ? { x: t.x - o.x, y: (t.y ?? 0) + 1.2 - o.y, z: t.z - o.z } : { x: Math.sin(this.heading), y: 0, z: Math.cos(this.heading) };
      if (t) this.heading = Math.atan2(t.x - this.x, t.z - this.z);
    }
    const spread = w.spread * (this.aiming ? 1 : 2.5) * (this.speed > 3 ? 1.6 : 1);
    let l = Math.hypot(dir.x, dir.y, dir.z);
    dir = { x: dir.x / l + (Math.random() - 0.5) * spread, y: dir.y / l + (Math.random() - 0.5) * spread, z: dir.z / l + (Math.random() - 0.5) * spread };
    l = Math.hypot(dir.x, dir.y, dir.z);
    dir.x /= l; dir.y /= l; dir.z /= l;
    world.particles?.emit('flash', o.x + dir.x * 0.1, o.y + dir.y * 0.1, o.z + dir.z * 0.1, 0, 0, 0, this.weapon === 'katta' ? 1.2 : 0.8);
    world.particles?.emit('smoke', o.x, o.y, o.z, dir.x, 0.3, dir.z, 0.25);
    world.audio?.gunshot?.(this.weapon);
    world.shake?.(this.weapon === 'katta' ? 0.12 : 0.06);
    this.recoil = 1;
    const hit = raycast(world, o, dir, w.range, this);
    if (hit) world.bulletHit?.(hit, w, dir, this);
    world.gunfire?.(this.x, this.z);
    if (!this.clip[this.weapon] && this.ammo[this.weapon] > 0) this.reload();
  }

  reload() {
    const w = WEAPONS[this.weapon];
    if (w.kind !== 'gun' || this.reloadT > 0 || !(this.ammo[this.weapon] > 0) || this.clip[this.weapon] >= w.clip) return;
    this.reloadT = w.reload;
  }

  softTarget(world, range) {
    let best = null, bd = range;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const consider = (o, pri) => {
      if (o.dead || o.state === 'down') return;
      const dx = o.x - this.x, dz = o.z - this.z, d = Math.hypot(dx, dz);
      if (d > bd || (dx * fx + dz * fz) / (d || 1) < 0.5) return;
      const score = d - pri;
      if (score < bd) { bd = score; best = o; }
    };
    for (const m of world.gangs?.members || []) consider(m, m.hostile ? 15 : 5);
    for (const c of world.police?.cops || []) consider(c, 4);
    for (const p of world.streetLife.peds) if (p.h.group.visible) consider(p, 0);
    return best;
  }

  // Typed cheat codes (on foot): GUNDA = every weapon and a pocketful of rounds.
  checkCheat(input, world) {
    for (const code of input.pressed) if (/^Key[A-Z]$/.test(code)) this.cheat = (this.cheat + code[3]).slice(-8);
    if (this.cheat.endsWith('GUNDA')) {
      this.cheat = '';
      for (const k of WEAPON_ORDER) this.give(k, k === 'katta' ? 10 : k === 'revolver' ? 36 : 0, false);
      this.select('revolver');
      world.hud?.say('Cheat: the full Majestic arsenal.', 2.5);
    }
  }

  get pos() {
    return this.vehicle ? { x: this.vehicle.x, z: this.vehicle.z } : { x: this.x, z: this.z };
  }

  damage(n, fromX, fromZ, world) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - n);
    this.hurtCooldown = 6;
    world?.hud?.flashDamage();
    world?.audio?.grunt(false);
    if (!this.vehicle && fromX !== undefined) {
      const a = Math.atan2(this.x - fromX, this.z - fromZ);
      this.kx = Math.sin(a) * 3; this.kz = Math.cos(a) * 3;
    }
    if (this.health <= 0) world?.onPlayerDown?.();
  }

  update(dt, input, camYaw, world) {
    if (this.dead) return;
    if (this.hurtCooldown > 0) this.hurtCooldown -= dt;
    else if (this.health < 100) this.health = Math.min(100, this.health + dt * 4);

    if (input.hit('KeyF', 'KeyE', 'Enter') && !this.attack && this.knock <= 0) {
      if (this.vehicle) this.exitVehicle(world);
      else this.tryEnter(world);
    }
    this.checkCheat(input, world);
    if (this.fireCd > 0) this.fireCd -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const w = WEAPONS[this.weapon], need = w.clip - (this.clip[this.weapon] || 0), n = Math.min(need, this.ammo[this.weapon] || 0);
        this.clip[this.weapon] = (this.clip[this.weapon] || 0) + n; this.ammo[this.weapon] -= n;
        world.audio?.click?.();
      }
    }
    if (input.hit('Tab')) this.cycleWeapon(input.down('ShiftLeft') ? -1 : 1);
    for (let k = 1; k <= 9; k++) if (input.hit(`Digit${k}`)) { const key = WEAPON_ORDER[k - 1]; if (this.weapons.has(key)) this.select(key); }
    if (this.vehicle) { this.aiming = false; return this.drive(dt, input, world); }

    const h = this.human;
    // Knocked over (by a cow, a car or a lathi).
    if (this.knock > 0) {
      this.knock -= dt;
      this.x += this.kx * dt; this.z += this.kz * dt;
      this.kx *= Math.exp(-4 * dt); this.kz *= Math.exp(-4 * dt);
      h.group.rotation.x += (-Math.PI / 2 - h.group.rotation.x) * Math.min(1, dt * 8);
      poseDown(h);
      if (this.knock <= 0) h.group.rotation.x = 0;
      this.finishMove(dt, world);
      return;
    }

    const wpn = WEAPONS[this.weapon];
    const gun = wpn.kind === 'gun';
    // Guns: hold the right mouse button to aim over the shoulder, left to fire.
    this.aiming = gun && input.down('Mouse2') && this.knock <= 0;
    if (gun && (input.hit('Mouse0', 'KeyZ') || (this.weapon === 'revolver' && input.down('Mouse0') && this.aiming))) this.shoot(world);
    if (gun && input.hit('KeyR') && input.down('ShiftLeft')) this.reload();
    // Melee (fists or a weapon), and kicks.
    const wantKick = input.hit('KeyX') || (!gun && input.hit('Mouse2'));
    const wantSwing = !gun && input.hit('Mouse0', 'KeyZ');
    if (!this.attack && (wantKick || wantSwing)) {
      this.punchSide = -this.punchSide;
      this.attack = { kind: wantKick ? 'kick' : this.weapon === 'fists' ? 'punch' : 'weapon', t: 0, side: this.punchSide, landed: false };
      // Face what we're aiming at.
      const target = this.nearestTarget(world, 2.4);
      if (target) this.heading = Math.atan2(target.x - this.x, target.z - this.z);
      world.audio?.whoosh();
    }

    const f = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const s = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const depth = world.waterDepth(this.x, this.z, this.y);
    const swimming = depth > 1.3;
    const running = input.down('ShiftLeft', 'ShiftRight') && depth < 0.5;
    const dx = -Math.sin(camYaw), dz = -Math.cos(camYaw);
    const rx = -dz, rz = dx;
    let mx = dx * f + rx * s, mz = dz * f + rz * s;
    const len = Math.hypot(mx, mz);
    let speed = len > 0 ? (running && !this.aiming ? RUN : WALK) : 0;
    if (depth > 0.3) speed *= swimming ? 0.6 : 0.55;
    if (this.attack) speed *= 0.15;
    if (this.aiming) {
      // Strafe, always facing where the camera looks.
      this.heading = camYaw + Math.PI;
      if (len > 0) { mx /= len; mz /= len; }
    } else if (len > 0) {
      mx /= len; mz /= len;
      if (!this.attack) {
        let dh = Math.atan2(mx, mz) - this.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        this.heading += dh * Math.min(1, dt * 12);
      }
    }
    this.x += mx * speed * dt + this.kx * dt;
    this.z += mz * speed * dt + this.kz * dt;
    this.kx *= Math.exp(-6 * dt); this.kz *= Math.exp(-6 * dt);

    if (input.hit('Space') && this.grounded && !swimming) { this.vy = JUMP; this.grounded = false; }
    this.finishMove(dt, world, swimming ? depth : 0);

    // Animate.
    h.group.position.set(this.x, this.y, this.z);
    h.group.rotation.y = this.heading;
    if (this.attack) this.updateAttack(dt, world);
    else if (this.aiming) {
      if (speed > 0) animateWalk(h, dt, speed);
      const legs = [h.bones.thL.rotation.x, h.bones.knL.rotation.x, h.bones.thR.rotation.x, h.bones.knR.rotation.x];
      poseAim(h, -(world.rigPitch ?? 0.3) + 0.25, this.recoil);
      if (speed > 0) [h.bones.thL.rotation.x, h.bones.knL.rotation.x, h.bones.thR.rotation.x, h.bones.knR.rotation.x] = legs;
    } else if (speed > 0) animateWalk(h, dt, speed);
    else poseIdle(h, performance.now() / 1000);
    if (gun && this.reloadT > 0) { h.bones.shR.rotation.x = -0.8; h.bones.elR.rotation.x = -1.2; h.bones.shL.rotation.x = -0.9; h.bones.elL.rotation.x = -1.4; }
    if (!this.grounded && !this.attack) { h.bones.thL.rotation.x = -0.7; h.bones.knL.rotation.x = 0.9; h.bones.thR.rotation.x = 0.3; }
    if (swimming) { h.bones.shL.rotation.x = h.bones.shR.rotation.x = -2.6 + Math.sin(performance.now() / 300) * 0.6; }
    this.speed = speed;
  }

  finishMove(dt, world, swimDepth = 0) {
    const g = world.layout.groundHeight(this.x, this.z, this.y);
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (swimDepth > 0) { const surface = g + swimDepth - 1.25; if (this.y < surface) { this.y = surface; this.vy = 0; this.grounded = true; } }
    if (this.y <= g) { this.y = g; this.vy = 0; this.grounded = true; }
    const hit = world.colliders.resolveCircle(this.x, this.z, this.r, this.y);
    if (hit) { this.x = hit.x; this.z = hit.z; }
    for (const v of world.vehicles) {
      if (Math.abs(v.x - this.x) > 8 || Math.abs(v.z - this.z) > 8 || Math.abs(v.y - this.y) > 2) continue;
      for (const c of v.circles(this._c || (this._c = []))) {
        const ddx = this.x - c.x, ddz = this.z - c.z, d = Math.hypot(ddx, ddz), min = c.r + this.r;
        if (d < min && d > 1e-4) {
          this.x += (ddx / d) * (min - d); this.z += (ddz / d) * (min - d);
          // Getting run over hurts.
          const rel = Math.hypot(v.vx, v.vz);
          if (rel > 5 && this.hurtCooldown < 5.5) { this.damage(Math.min(60, rel * 3), c.x, c.z, world); this.knock = 1.8; this.kx = v.vx * 0.6; this.kz = v.vz * 0.6; world.audio?.thud(0.8); }
        }
      }
    }
  }

  nearestTarget(world, range) {
    let best = null, bd = range;
    const consider = (o) => { const d = Math.hypot(o.x - this.x, o.z - this.z); if (d < bd) { bd = d; best = o; } };
    for (const p of world.streetLife.peds) if (p.state !== 'down' && p.h.group.visible) consider(p);
    for (const c of world.police?.cops || []) if (c.state !== 'down') consider(c);
    return best;
  }

  updateAttack(dt, world) {
    const a = this.attack;
    const w = WEAPONS[this.weapon];
    const armed = a.kind === 'weapon';
    const dur = a.kind === 'kick' ? KICK_T : armed ? w.t : PUNCH_T;
    a.t += dt;
    const k = a.t / dur;
    if (a.kind === 'kick') poseKick(this.human, k);
    else if (armed && w.pose === 'overhead') poseLathi(this.human, k);
    else if (armed && w.pose === 'swing') poseSwing(this.human, k);
    else posePunch(this.human, k, armed ? -1 : a.side);
    const strike = a.kind === 'kick' ? 0.38 : armed ? (w.pose === 'stab' ? 0.32 : 0.55) : 0.32;
    if (!a.landed && k > strike) {
      a.landed = true;
      const range = a.kind === 'kick' ? 1.7 : armed ? w.range : 1.35;
      const dmg = a.kind === 'kick' ? 45 : armed ? w.dmg : 26;
      const lethal = armed && w.lethal;
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      let any = false;
      for (const p of world.streetLife.targetsInFront(this.x, this.z, this.heading, range)) {
        world.streetLife.hit(p, dmg, fx, fz, world, a.kind === 'kick' || (armed && w.pose !== 'stab'), lethal);
        if (lethal) world.particles?.burst('blood', p.x, (p.y || 0) + 1.1, p.z, 6, 1.6, 0.5);
        world.crime?.(p.dead ? 'Murder' : armed ? 'Assault with a weapon' : 'Assault', p.x, p.z, p.dead ? 3 : armed ? 2 : 1);
        any = true;
      }
      for (const c of world.police?.copsInFront(this.x, this.z, this.heading, range) || []) {
        world.police.hitCop(c, dmg, fx, fz, a.kind === 'kick', lethal);
        world.crime?.(c.dead ? 'Killing a police officer' : 'Assaulting a police officer', c.x, c.z, c.dead ? 4 : 2);
        any = true;
      }
      for (const m of world.gangs?.inFront(this.x, this.z, this.heading, range) || []) {
        world.gangs.hit(m, dmg, fx, fz, world, lethal, a.kind === 'kick');
        if (lethal) world.particles?.burst('blood', m.x, m.y + 1.1, m.z, 6, 1.6, 0.5);
        any = true;
      }
      const cows = world.streetLife.cowsInFront(this.x, this.z, this.heading, range);
      if (cows.length && a.kind === 'kick') {
        // The cow is not impressed.
        world.audio?.moo(cows[0].x, cows[0].z, world.camera);
        world.hud?.say('The cow is unimpressed. You, however, are on the ground.', 3);
        this.knock = 1.6; this.kx = -fx * 5; this.kz = -fz * 5;
        this.damage(10, cows[0].x, cows[0].z, world);
        any = true;
      }
      if (!any) world.audio?.whoosh();
    }
    if (k >= 1) this.attack = null;
  }

  drive(dt, input, world) {
    const v = this.vehicle;
    const ctrl = {
      throttle: input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']),
      steer: input.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']),
      handbrake: input.down('Space'),
    };
    const wasStalled = v.stalled;
    const impact = v.update(dt, ctrl, world);
    if (v.stalled && !wasStalled) world.hud?.say(`Engine flooded! ${LINES.flood[Math.floor(Math.random() * LINES.flood.length)]}`, 3);
    if (impact > 4) {
      world.audio?.thud(Math.min(1, impact / 15));
      world.audio?.crunch?.(Math.min(1, impact / 18));
      world.shake?.(Math.min(0.6, impact / 25));
      if (impact > 7 && v.lastHit) world.particles?.burst('spark', v.lastHit.x, v.y + 0.6, v.lastHit.z, Math.min(16, Math.round(impact)), 4, 0.8);
    }
    // Tyre smoke when you hang the tail out.
    if (!v.spec.twoWheeler && v.speed > 6 && (v.slip > 0.22 || (ctrl.handbrake && v.speed > 9)) && world.particles) {
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading), lx = fz, lz = -fx;
      const back = -v.spec.wheelbase / 2, side = v.spec.width / 2 - 0.15;
      for (const sd of [-1, 1]) if (Math.random() < dt * 30) world.particles.emit('smoke', v.x + fx * back + lx * side * sd, v.y + 0.25, v.z + fz * back + lz * side * sd, -v.vx * 0.1, 0.4, -v.vz * 0.1, 0.8);
    }
    if (v.engineDead && ctrl.throttle > 0 && !this._deadNag) { this._deadNag = true; world.hud?.say(v.fireT > 0 ? 'It\'s on fire! Get out!' : 'The engine won\'t turn over. It\'s finished.', 2.5); }
    if (!v.engineDead) this._deadNag = false;
    world.audio?.hornHold(v.spec.horn, input.down('KeyH', 'KeyQ'), v.hornPitch);
    if (v.spec.police && input.hit('KeyG')) v.siren = !v.siren; // your own Hoysala's siren
    if (v.waterDepth > 0.5 && v.speed > 3 && Math.random() < dt * 3) world.audio?.splash();
    this.x = v.x; this.z = v.z; this.y = v.y;
  }

  tryEnter(world) {
    let best = null, bestD = 3.0;
    for (const v of world.vehicles) {
      if (Math.abs(v.x - this.x) > 12 || Math.abs(v.z - this.z) > 12 || Math.abs(v.y - this.y) > 2) continue;
      for (const c of v.circles(this._c || (this._c = []))) {
        const d = Math.hypot(c.x - this.x, c.z - this.z) - c.r;
        if (d < bestD) { bestD = d; best = v; }
      }
    }
    if (!best) return false;
    const v = best;
    if (v.driver === 'ai' || v.driver === 'police') {
      if (v.driver === 'police') world.police?.vehicleStolen(v);
      else { const agent = world.traffic.findAgent(v); if (agent) world.traffic.release(agent); }
      if (v.type !== 'bus' && v.type !== 'schoolBus') {
        const opts = v.rider ? { outfit: v.rider.outfit, female: v.rider.female } : {};
        v.removeRider();
        world.streetLife.spawnFleeing(v.x - Math.cos(v.heading) * 1.5, v.z + Math.sin(v.heading) * 1.5, this.x, this.z, opts);
        world.hud.say(`"${LINES.carjacked[Math.floor(Math.random() * LINES.carjacked.length)]}"`, 3);
      } else world.hud.say('Conductor: "Ticket ticket! ...oh. You\'re DRIVING it?"', 3);
      world.crime?.(v.spec.police ? 'Stealing a Hoysala' : 'Vehicle theft', v.x, v.z, v.spec.police ? 2 : 1);
    }
    v.removeRider();
    v.driver = 'player';
    this.vehicle = v;
    if (this.human.weaponMesh) this.human.weaponMesh.visible = false;
    this.attack = null;
    this.seat(v);
    world.audio?.door();
    world.hud.vehicleEntered(v);
    return true;
  }

  seat(v) {
    const h = this.human;
    if (['scooter', 'delivery', 'bike', 'auto', 'goodsAuto'].includes(v.type)) {
      poseSit(h);
      v.seatHuman(h);
      h.group.visible = true;
    } else h.group.visible = false;
  }

  exitVehicle(world, force = false) {
    const v = this.vehicle;
    if (!force && v.speed > 8) return;
    const h = this.human;
    this.scene.add(h.group);
    h.group.visible = true;
    h.group.rotation.set(0, 0, 0);
    // India is right-hand drive: get out on the right (-left) side, else the left.
    const lx = Math.cos(v.heading), lz = -Math.sin(v.heading);
    const off = v.spec.width / 2 + 0.6;
    let x = v.x - lx * off, z = v.z - lz * off;
    if (world.colliders.pointBlocked(x, z, v.y + 0.5)) { x = v.x + lx * off; z = v.z + lz * off; }
    this.x = x; this.z = z; this.y = v.y;
    this.heading = v.heading;
    v.driver = null;
    v.siren = false;
    world.audio?.hornHold(v.spec.horn, false);
    this.vehicle = null;
    if (this.human.weaponMesh) this.human.weaponMesh.visible = true;
    world.audio?.door();
    world.hud.vehicleExited();
  }

  respawn(x, z) {
    if (this.vehicle) { this.vehicle.driver = null; this.vehicle = null; }
    this.scene.add(this.human.group);
    this.human.group.visible = true;
    this.human.group.rotation.set(0, 0, 0);
    this.x = x; this.z = z; this.y = 0.15; this.vy = 0;
    this.health = 100; this.dead = false; this.knock = 0; this.attack = null; this.kx = this.kz = 0;
  }
}
