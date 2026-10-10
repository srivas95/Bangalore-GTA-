// The player: walking, running, jumping, punching, kicking, swimming through floods,
// and getting in and out of any vehicle.
import { createHuman, animateWalk, poseIdle, poseSit, posePunch, poseKick, poseDown } from './human.js';
import { LINES } from '../config.js';

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
    if (this.vehicle) return this.drive(dt, input, world);

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

    // Melee.
    if (!this.attack && (input.hit('Mouse0', 'KeyZ') || input.hit('Mouse2', 'KeyX'))) {
      const kick = input.hit('Mouse2', 'KeyX');
      this.punchSide = -this.punchSide;
      this.attack = { kind: kick ? 'kick' : 'punch', t: 0, side: this.punchSide, landed: false };
      // Face what we're aiming at.
      const target = this.nearestTarget(world, 2.2);
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
    let speed = len > 0 ? (running ? RUN : WALK) : 0;
    if (depth > 0.3) speed *= swimming ? 0.6 : 0.55;
    if (this.attack) speed *= 0.15;
    if (len > 0) {
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
    else if (speed > 0) animateWalk(h, dt, speed);
    else poseIdle(h, performance.now() / 1000);
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
    const dur = a.kind === 'kick' ? KICK_T : PUNCH_T;
    a.t += dt;
    const k = a.t / dur;
    if (a.kind === 'kick') poseKick(this.human, k); else posePunch(this.human, k, a.side);
    if (!a.landed && k > (a.kind === 'kick' ? 0.38 : 0.32)) {
      a.landed = true;
      const range = a.kind === 'kick' ? 1.7 : 1.35;
      const dmg = a.kind === 'kick' ? 45 : 26;
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      let any = false;
      for (const p of world.streetLife.targetsInFront(this.x, this.z, this.heading, range)) {
        world.streetLife.hit(p, dmg, fx, fz, world, a.kind === 'kick');
        world.crime?.('Assault', p.x, p.z, 1);
        any = true;
      }
      for (const c of world.police?.copsInFront(this.x, this.z, this.heading, range) || []) {
        world.police.hitCop(c, dmg, fx, fz, a.kind === 'kick');
        world.crime?.('Assaulting a police officer', c.x, c.z, 2);
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
    if (impact > 4) { world.audio?.thud(Math.min(1, impact / 15)); world.shake?.(Math.min(0.6, impact / 25)); }
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
