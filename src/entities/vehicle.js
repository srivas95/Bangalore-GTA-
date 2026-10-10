// A drivable vehicle: arcade physics, static collision, visuals (wheels, lean).
import * as THREE from 'three';
import { buildVehicleModel, VEHICLE_TYPES } from './vehicleModels.js';
import { createHuman, poseSit } from './human.js';

let nextId = 1;

export class Vehicle {
  constructor(type, { x = 0, z = 0, heading = 0, rng = Math.random, color, livery, rider = false } = {}) {
    this.id = nextId++;
    this.type = type;
    this.spec = VEHICLE_TYPES[type];
    this.model = buildVehicleModel(type, rng, { color, livery });
    this.group = this.model.group;
    this.group.userData.vehicle = this;
    this.x = x; this.z = z; this.y = 0;
    this.heading = heading;
    this.vx = 0; this.vz = 0;
    this.steer = 0;
    this.lean = 0;
    this.driver = null; // 'player' | 'ai' | null
    this.radius = this.spec.width / 2;
    this.mass = this.spec.mass;
    this.rider = null;
    this.lightsOn = false;
    if (rider) this.addRider(rng);
    this.syncVisual(0);
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  // Signed forward speed.
  get forwardSpeed() {
    return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
  }

  addRider(rng = Math.random) {
    if (this.rider || !(this.type === 'scooter' || this.type === 'auto')) return;
    const h = createHuman({ helmet: this.type === 'scooter' ? true : undefined, outfit: this.type === 'auto' ? 'shirt' : undefined, top: this.type === 'auto' ? 0x8a6a3a : undefined }, rng);
    poseSit(h);
    if (this.type === 'scooter') h.group.position.set(0, this.spec.seatY - 0.86, -0.25);
    else h.group.position.set(0, this.spec.seatY - 0.86, 0.3);
    this.model.body.add(h.group);
    this.rider = h;
  }

  removeRider() {
    if (!this.rider) return;
    this.model.body.remove(this.rider.group);
    this.rider = null;
  }

  // Collision circles along the vehicle's length.
  circles(out = []) {
    out.length = 0;
    const n = Math.max(1, Math.round(this.spec.length / this.spec.width));
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const span = this.spec.length - this.spec.width;
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : (k / (n - 1) - 0.5) * span;
      out.push({ x: this.x + fx * t, z: this.z + fz * t, r: this.radius, off: t });
    }
    return out;
  }

  // input: {throttle -1..1, steer -1..1 (left positive), handbrake bool}
  update(dt, input, world) {
    const s = this.spec;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const lx = fz, lz = -fx;
    let vF = this.vx * fx + this.vz * fz;
    let vL = this.vx * lx + this.vz * lz;
    const thr = input ? input.throttle : 0;
    const hb = input ? input.handbrake : true;

    if (thr > 0) {
      if (vF < -0.3) vF = Math.min(0, vF + s.brake * dt);
      else vF += s.accel * thr * Math.max(0, 1 - Math.max(0, vF) / s.maxSpeed) * dt;
    } else if (thr < 0) {
      if (vF > 0.3) vF = Math.max(0, vF - s.brake * dt);
      else vF = Math.max(-s.reverse, vF - s.accel * 0.6 * dt);
    } else {
      const coast = (1.0 + Math.abs(vF) * 0.06) * dt;
      vF -= Math.sign(vF) * Math.min(Math.abs(vF), coast);
    }
    if (hb) vF -= Math.sign(vF) * Math.min(Math.abs(vF), (input ? 5 : 8) * dt);

    const steerIn = input ? input.steer : 0;
    const target = steerIn * s.steer / (1 + Math.abs(vF) * 0.045);
    this.steer += (target - this.steer) * Math.min(1, dt * 6);
    let yaw = (vF / s.wheelbase) * Math.tan(this.steer);
    if (hb && input && Math.abs(vF) > 5) yaw *= 1.5;
    const grip = hb && input ? s.grip * 0.12 : s.grip;
    vL *= Math.exp(-grip * dt);

    this.vx = fx * vF + lx * vL;
    this.vz = fz * vF + lz * vL;
    this.heading += yaw * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.yawRate = yaw;

    this.impact = world ? this.collideStatic(world.colliders) : 0;
    this.syncVisual(dt, world);
    return this.impact;
  }

  collideStatic(colliders) {
    let impact = 0;
    const circles = this.circles(this._c || (this._c = []));
    for (const c of circles) {
      const hit = colliders.resolveCircle(c.x, c.z, c.r, this.y);
      if (!hit) continue;
      const dx = hit.x - c.x, dz = hit.z - c.z;
      this.x += dx; this.z += dz;
      const vn = this.vx * hit.nx + this.vz * hit.nz;
      if (vn < 0) {
        this.vx -= hit.nx * vn * 1.25;
        this.vz -= hit.nz * vn * 1.25;
        // Scrub some tangential speed and spin the vehicle a little.
        this.vx *= 0.9; this.vz *= 0.9;
        impact = Math.max(impact, -vn);
        if (Math.abs(c.off) > 0.1) this.heading += Math.sign(c.off) * (hit.nx * Math.cos(this.heading) - hit.nz * Math.sin(this.heading)) * Math.min(0.15, -vn * 0.01);
      }
      // Refresh circle positions after the push.
      this.circles(circles);
    }
    return impact;
  }

  syncVisual(dt, world) {
    const ground = world ? world.layout.groundHeight(this.x, this.z) : 0;
    this.y += (ground - this.y) * Math.min(1, dt * 12 || 1);
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
    const vF = this.forwardSpeed;
    if (this.spec.twoWheeler) {
      const target = -THREE.MathUtils.clamp((this.yawRate || 0) * vF * 0.08, -0.6, 0.6);
      this.lean += (target - this.lean) * Math.min(1, dt * 6);
      this.group.rotation.z = this.lean;
    } else {
      // Body roll and pitch for weight.
      const roll = THREE.MathUtils.clamp(-(this.yawRate || 0) * vF * 0.006, -0.06, 0.06);
      this.model.body.rotation.z += (roll - this.model.body.rotation.z) * Math.min(1, dt * 5);
    }
    for (const w of this.model.wheels) {
      w.wheel.rotation.x += (vF / w.r) * dt;
      if (w.steer) w.pivot.rotation.y = this.steer;
    }
  }

  setLights(on) {
    if (this.lightsOn === on) return;
    this.lightsOn = on;
  }
}
