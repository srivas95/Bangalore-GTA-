// A drivable vehicle: arcade physics, static collision, flood water, visuals (wheels, lean, lights).
import * as THREE from 'three';
import { buildVehicleModel, VEHICLE_TYPES } from './vehicleModels.js';
import { createHuman, poseSit } from './human.js';

let nextId = 1;

// Police light-bar lamps flash in sync across all Hoysalas.
export const policeLampMats = {
  red: new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }),
  blue: new THREE.MeshBasicMaterial({ color: 0x2050ff, toneMapped: false }),
  off: new THREE.MeshStandardMaterial({ color: 0x552222, roughness: 0.3 }),
};
const LAMP_GEO = new THREE.BoxGeometry(1, 1, 1);

export class Vehicle {
  constructor(type, { x = 0, z = 0, heading = 0, rng = Math.random, color, livery, rider = false, pink = false } = {}) {
    this.id = nextId++;
    this.type = type;
    this.spec = VEHICLE_TYPES[type];
    this.model = buildVehicleModel(type, rng, { color, livery, pink });
    this.group = this.model.group;
    this.group.userData.vehicle = this;
    this.x = x; this.z = z; this.y = 0;
    this.heading = heading;
    this.vx = 0; this.vz = 0;
    this.steer = 0;
    this.lean = 0;
    this.roll = 0;
    this.driver = null; // 'player' | 'ai' | 'police' | null
    this.radius = this.spec.width / 2;
    this.mass = this.spec.mass;
    this.rider = null;
    this.hornPitch = 0.93 + rng() * 0.14;
    this.stalled = false;
    this.waterDepth = 0;
    this.siren = false;
    if (this.model.lightBar) this.buildLightBar();
    if (rider) this.addRider(rng);
    this.syncVisual(0);
  }

  buildLightBar() {
    const lb = this.model.lightBar;
    this.lamps = [];
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(LAMP_GEO, policeLampMats.off);
      m.scale.set(lb.w * 0.85, 0.1, 0.24);
      m.position.set(s * lb.w * 0.75, lb.y, lb.z);
      m.userData.colour = s < 0 ? 'red' : 'blue';
      this.group.add(m);
      this.lamps.push(m);
    }
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  get forwardSpeed() {
    return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
  }

  addRider(rng = Math.random, opts) {
    const open = ['scooter', 'delivery', 'bike', 'auto', 'goodsAuto'].includes(this.type);
    if (this.rider || !open) return;
    const two = this.spec.twoWheeler;
    const o = opts || {
      helmet: two ? (rng() < 0.85 ? true : undefined) : undefined,
      outfit: this.type === 'auto' ? 'shirt' : this.type === 'delivery' ? 'tshirt' : undefined,
      top: this.type === 'auto' ? 0x8a6a3a : this.type === 'delivery' ? [0xe8601a, 0xd0202a, 0x18a050][Math.floor(rng() * 3)] : undefined,
      female: this.type === 'scooter' && rng() < 0.3 ? true : undefined,
    };
    const h = createHuman(o, rng);
    poseSit(h);
    this.seatHuman(h);
    this.rider = h;
    // Pillion riders are common on scooters and bikes.
    if (two && rng() < 0.3) {
      const p = createHuman({ helmet: rng() < 0.3 ? true : undefined }, rng);
      poseSit(p);
      p.group.position.set(0, this.spec.seatY - 0.86 + 0.04, -0.62);
      this.group.add(p.group);
      this.pillion = p;
    }
  }

  seatHuman(h) {
    const two = this.spec.twoWheeler;
    const seatZ = two ? -0.22 : (this.model.driverSeat ? this.model.driverSeat[2] : 0.3);
    h.group.position.set(0, (this.spec.seatY || 0.9) - 0.86, seatZ);
    h.group.rotation.set(0, 0, 0);
    this.group.add(h.group);
  }

  removeRider() {
    if (this.rider) { this.group.remove(this.rider.group); this.rider = null; }
    if (this.pillion) { this.group.remove(this.pillion.group); this.pillion = null; }
  }

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
    let thr = input ? input.throttle : 0;
    const hb = input ? input.handbrake : true;

    // Flood water: drag, and (for the player) a drowned engine if it's too deep.
    const depth = world ? world.waterDepth(this.x, this.z, this.y) : 0;
    this.waterDepth = depth;
    if (depth > s.stall && this.driver === 'player') this.stalled = true;
    else if (depth < 0.05) this.stalled = false;
    if (this.stalled) thr = Math.min(0, thr) * 0.15;

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
    if (depth > 0.04) {
      const drag = Math.exp(-Math.min(6, depth * 3.5 + Math.abs(vF) * depth * 0.4) * dt);
      vF *= drag; vL *= drag;
    }
    // Wet roads are slippery.
    const wet = world ? world.wetness || 0 : 0;

    const steerIn = input ? input.steer : 0;
    const target = steerIn * s.steer / (1 + Math.abs(vF) * 0.045);
    this.steer += (target - this.steer) * Math.min(1, dt * 6);
    let yaw = (vF / s.wheelbase) * Math.tan(this.steer);
    if (hb && input && Math.abs(vF) > 5) yaw *= 1.5;
    const grip = (hb && input ? s.grip * 0.12 : s.grip) * (1 - wet * 0.35);
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
      this.x += hit.x - c.x; this.z += hit.z - c.z;
      const vn = this.vx * hit.nx + this.vz * hit.nz;
      if (vn < 0) {
        this.vx -= hit.nx * vn * 1.25;
        this.vz -= hit.nz * vn * 1.25;
        this.vx *= 0.9; this.vz *= 0.9;
        impact = Math.max(impact, -vn);
        if (Math.abs(c.off) > 0.1) this.heading += Math.sign(c.off) * (hit.nx * Math.cos(this.heading) - hit.nz * Math.sin(this.heading)) * Math.min(0.15, -vn * 0.01);
      }
      this.circles(circles);
    }
    return impact;
  }

  syncVisual(dt, world) {
    const ground = world ? world.layout.groundHeight(this.x, this.z, this.y) : this.y;
    // Fall quickly, climb smoothly.
    const k = ground < this.y - 0.5 ? dt * 6 : dt * 12;
    this.y += (ground - this.y) * Math.min(1, k || 1);
    // Sinks a little into deep water.
    const sink = Math.min(0.4, Math.max(0, this.waterDepth - 0.6) * 0.3);
    this.group.position.set(this.x, this.y - sink, this.z);
    this.group.rotation.y = this.heading;
    const vF = this.forwardSpeed;
    if (this.spec.twoWheeler) {
      const target = -THREE.MathUtils.clamp((this.yawRate || 0) * vF * 0.08, -0.6, 0.6);
      this.lean += (target - this.lean) * Math.min(1, dt * 6);
      // Parked two-wheelers rest on their side stand.
      this.group.rotation.z = this.driver ? this.lean : -0.12;
    } else {
      const roll = THREE.MathUtils.clamp(-(this.yawRate || 0) * vF * 0.006, -0.05, 0.05);
      this.roll += (roll - this.roll) * Math.min(1, dt * 5);
      this.group.rotation.z = this.roll;
    }
    for (const w of this.model.wheels) {
      w.spin.rotation.x += (vF / w.r) * dt;
      if (w.steer) w.steer.rotation.y = this.steer;
    }
    if (this.lamps) {
      const on = this.siren;
      const phase = Math.floor(performance.now() / 120) % 4;
      this.lamps.forEach((m, i) => {
        m.material = !on ? policeLampMats.off : (phase < 2 ? (i === 0 ? policeLampMats.red : policeLampMats.off) : (i === 1 ? policeLampMats.blue : policeLampMats.off));
      });
    }
  }
}
