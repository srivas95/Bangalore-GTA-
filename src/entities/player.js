// The player: walking, running, jumping, and getting in and out of any vehicle.
import { createHuman, animateWalk, poseIdle, poseSit } from './human.js';
import { LINES } from '../config.js';

const WALK = 2.2, RUN = 6.0, GRAVITY = 14, JUMP = 5;

export class Player {
  constructor(scene, x, z) {
    this.scene = scene;
    this.human = createHuman({ outfit: 'shirt', top: 0x3a6ea5, bottom: 0x22304a, skin: 0xa8693c, shoes: 0xeeeeee });
    this.bagHuman = null;
    scene.add(this.human.group);
    this.x = x; this.z = z; this.y = 0; this.vy = 0;
    this.heading = 0;
    this.vehicle = null;
    this.r = 0.35;
    this.isPlayer = true;
    this.grounded = true;
  }

  get pos() {
    return this.vehicle ? { x: this.vehicle.x, z: this.vehicle.z } : { x: this.x, z: this.z };
  }

  update(dt, input, camYaw, world) {
    if (input.hit('KeyF', 'KeyE', 'Enter')) {
      if (this.vehicle) this.exitVehicle(world);
      else this.tryEnter(world);
    }
    if (this.vehicle) return this.drive(dt, input, world);

    const f = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const s = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const running = input.down('ShiftLeft', 'ShiftRight');
    // Camera looks along -(sin yaw, cos yaw).
    const dx = -Math.sin(camYaw), dz = -Math.cos(camYaw);
    const rx = -dz, rz = dx;
    let mx = dx * f + rx * s, mz = dz * f + rz * s;
    const len = Math.hypot(mx, mz);
    const speed = len > 0 ? (running ? RUN : WALK) : 0;
    if (len > 0) {
      mx /= len; mz /= len;
      const target = Math.atan2(mx, mz);
      let dh = target - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += dh * Math.min(1, dt * 12);
    }
    this.x += mx * speed * dt;
    this.z += mz * speed * dt;

    const g = world.layout.groundHeight(this.x, this.z);
    if (input.hit('Space') && this.grounded) { this.vy = JUMP; this.grounded = false; }
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y <= g) { this.y = g; this.vy = 0; this.grounded = true; }

    const hit = world.colliders.resolveCircle(this.x, this.z, this.r, this.y);
    if (hit) { this.x = hit.x; this.z = hit.z; }
    // Don't walk through vehicles.
    for (const v of world.vehicles) {
      if (Math.abs(v.x - this.x) > 8 || Math.abs(v.z - this.z) > 8) continue;
      for (const c of v.circles(this._c || (this._c = []))) {
        const ddx = this.x - c.x, ddz = this.z - c.z, d = Math.hypot(ddx, ddz), min = c.r + this.r;
        if (d < min && d > 1e-4) { this.x += (ddx / d) * (min - d); this.z += (ddz / d) * (min - d); }
      }
    }

    const h = this.human;
    h.group.position.set(this.x, this.y, this.z);
    h.group.rotation.y = this.heading;
    if (speed > 0) animateWalk(h, dt, speed); else poseIdle(h, performance.now() / 1000);
    if (!this.grounded) { h.legs[0].rotation.x = -0.6; h.legs[1].rotation.x = 0.3; }
    this.speed = speed;
  }

  drive(dt, input, world) {
    const v = this.vehicle;
    const ctrl = {
      throttle: input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']),
      steer: input.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']),
      handbrake: input.down('Space'),
    };
    const impact = v.update(dt, ctrl, world);
    if (impact > 4) { world.audio?.thud(Math.min(1, impact / 15)); world.shake?.(Math.min(0.6, impact / 25)); }
    if (input.down('KeyH', 'KeyQ')) world.audio?.hornHold(v.spec.sound, true);
    else world.audio?.hornHold(v.spec.sound, false);
    this.x = v.x; this.z = v.z;
  }

  tryEnter(world) {
    let best = null, bestD = 3.0;
    for (const v of world.vehicles) {
      if (Math.abs(v.x - this.x) > 10 || Math.abs(v.z - this.z) > 10) continue;
      for (const c of v.circles(this._c || (this._c = []))) {
        const d = Math.hypot(c.x - this.x, c.z - this.z) - c.r;
        if (d < bestD) { bestD = d; best = v; }
      }
    }
    if (!best) return false;
    const v = best;
    if (v.driver === 'ai') {
      const agent = world.traffic.findAgent(v);
      if (agent) world.traffic.release(agent);
      if (v.type !== 'bus' && Math.random() < 0.9) {
        const opts = v.rider ? { outfit: v.rider.outfit } : {};
        v.removeRider();
        world.streetLife.spawnFleeing(v.x + Math.cos(v.heading) * -1.5, v.z + Math.sin(v.heading) * 1.5, this.x, this.z, opts);
        world.hud.say(LINES.carjacked[Math.floor(Math.random() * LINES.carjacked.length)], 3);
      } else if (v.type === 'bus') {
        world.hud.say('Conductor: "Ticket ticket! ...oh. You\'re DRIVING it?"', 3);
      }
      world.wanted?.add(1, 'Vehicle theft');
    }
    v.removeRider();
    v.driver = 'player';
    this.vehicle = v;
    this.seat(v);
    world.audio?.door();
    world.hud.vehicleEntered(v);
    return true;
  }

  // Show the player in open vehicles (scooters, autos); hide inside cars and buses.
  seat(v) {
    const h = this.human;
    if (v.type === 'scooter' || v.type === 'auto') {
      poseSit(h);
      v.model.body.add(h.group);
      h.group.position.set(0, v.spec.seatY - 0.86, v.type === 'scooter' ? -0.25 : 0.3);
      h.group.rotation.set(0, 0, 0);
      h.group.visible = true;
    } else h.group.visible = false;
  }

  exitVehicle(world) {
    const v = this.vehicle;
    if (v.speed > 8) return; // too fast to bail out safely
    const h = this.human;
    if (h.group.parent !== this.scene) this.scene.add(h.group);
    h.group.visible = true;
    h.group.rotation.set(0, 0, 0);
    // India is right-hand drive: get out on the right (-left) side, else the left.
    const lx = Math.cos(v.heading), lz = -Math.sin(v.heading);
    const off = v.spec.width / 2 + 0.6;
    let x = v.x - lx * off, z = v.z - lz * off;
    if (world.colliders.pointBlocked(x, z, 0.5)) { x = v.x + lx * off; z = v.z + lz * off; }
    this.x = x; this.z = z; this.y = world.layout.groundHeight(x, z);
    this.heading = v.heading;
    v.driver = null;
    world.audio?.hornHold(v.spec.sound, false);
    this.vehicle = null;
    world.audio?.door();
    world.hud.vehicleExited();
  }
}
