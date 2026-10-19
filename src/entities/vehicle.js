// A drivable vehicle: arcade physics, static collision, flood water, visuals (wheels, lean, lights).
import * as THREE from 'three';
import { buildVehicleModel, VEHICLE_TYPES } from './vehicleModels.js';
import { createHuman, poseSit } from './human.js';

let nextId = 1;

// Damage points for a hit at a given closing speed (m/s): a 50 km/h wall costs ~45 of 100.
export const damageFromSpeed = (s) => (s > 3 ? Math.pow(s - 3, 1.5) * 1.15 : 0);
const TOUGHNESS = { bus: 0.3, schoolBus: 0.35, lorry: 0.3, tanker: 0.3, tempo: 0.6, miniTruck: 0.7, suv: 0.8, hoysala: 0.8 };

// Police light-bar lamps flash in sync across all Hoysalas.
export const policeLampMats = {
  red: new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }),
  blue: new THREE.MeshBasicMaterial({ color: 0x2050ff, toneMapped: false }),
  off: new THREE.MeshStandardMaterial({ color: 0x552222, roughness: 0.3 }),
};
const LAMP_GEO = new THREE.BoxGeometry(1, 1, 1);
const baseUpdateMatrixWorld = THREE.Object3D.prototype.updateMatrixWorld;
function skipWhenHidden(force) { if (this.visible) baseUpdateMatrixWorld.call(this, force); }

export class Vehicle {
  constructor(type, { x = 0, z = 0, heading = 0, rng = Math.random, color, livery, model, rider = false, pink = false } = {}) {
    this.id = nextId++;
    this.type = type;
    this.spec = VEHICLE_TYPES[type];
    this.model = buildVehicleModel(type, rng, { color, livery, pink, model });
    if (this.model.spec && this.model.spec !== this.spec) this.spec = this.model.spec; // real car dimensions
    this.group = this.model.group;
    this.group.userData.vehicle = this;
    // Moving things don't cast into the (static, cached) sun shadow map: they get contact shadows.
    this.group.traverse((o) => { o.castShadow = false; });
    // Nothing to update for vehicles out of sight.
    this.group.updateMatrixWorld = skipWhenHidden;
    this.group.userData.blob = { w: this.spec.width * 1.6, l: this.spec.length * 1.2 };
    this.x = x; this.z = z; this.y = 0;
    this.heading = heading;
    this.vx = 0; this.vz = 0;
    this.steer = 0;
    this.lean = 0;
    this.roll = 0;
    this.pitch = 0;
    this.rollVel = 0; this.pitchVel = 0;
    this.angVel = 0; // yaw rate, rad/s (left +)
    this.ax = 0; this.ay = 0; this.slip = 0;
    this.driver = null; // 'player' | 'ai' | 'police' | null
    this.radius = this.spec.width / 2;
    this.mass = this.spec.mass;
    this.inertia = (this.mass * (this.spec.length ** 2 + this.spec.width ** 2)) / 12;
    this.rider = null;
    this.hornPitch = 0.93 + rng() * 0.14;
    this.stalled = false;
    this.waterDepth = 0;
    this.siren = false;
    // Damage: 100 = showroom, 0 = engine dead; below that it can catch fire.
    this.health = 100;
    this.engineDead = false;
    this.fireT = 0;
    this.wrecked = false;
    this.smokeT = 0;
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

  // Collision circles along the body (the out array and its objects are reused).
  circles(out = []) {
    const n = Math.max(1, Math.round(this.spec.length / this.spec.width));
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const span = this.spec.length - this.spec.width;
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : (k / (n - 1) - 0.5) * span;
      const c = out[k] || (out[k] = { x: 0, z: 0, r: 0, off: 0 });
      c.x = this.x + fx * t; c.z = this.z + fz * t; c.r = this.radius; c.off = t;
    }
    out.length = n;
    return out;
  }

  // Physics: a planar rigid body on four tyres (a "bicycle model" with front and rear axles).
  // Tyres make lateral force from their slip angle up to a friction limit that depends on the
  // load on that axle, so braking shifts grip to the nose, throttle to the tail, and the
  // handbrake lets the rear step out. input: {throttle -1..1, steer -1..1 (left +), handbrake}.
  update(dt, input, world) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    let impact = 0;
    for (let k = 0; k < n; k++) impact = Math.max(impact, this.step(dt / n, input, world));
    // AI police drive like maniacs; their cars are built (and forgiven) accordingly.
    if (impact > 3 && this.lastHit) this.takeDamage(damageFromSpeed(impact) * (this.driver === 'police' ? 0.3 : 1), this.lastHit.x, this.lastHit.z, world);
    this.syncVisual(dt, world);
    return impact;
  }

  step(dt, input, world) {
    const s = this.spec;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const lx = fz, lz = -fx;
    let u = this.vx * fx + this.vz * fz; // forward speed
    let v = this.vx * lx + this.vz * lz; // sideways speed (left +)
    let r = this.angVel; // yaw rate (left +)
    let thr = input ? input.throttle : 0;
    const hb = input ? input.handbrake : true;
    const dead = this.engineDead;

    // Flood water: drag, and (for the player) a drowned engine if it's too deep.
    const depth = world ? world.waterDepth(this.x, this.z, this.y) : 0;
    this.waterDepth = depth;
    if (depth > s.stall && this.driver === 'player') this.stalled = true;
    else if (depth < 0.05) this.stalled = false;
    if (this.stalled || dead) thr = Math.min(0, thr) * (dead ? 0.6 : 0.15); // can still brake
    this.throttleIn = thr; // for the engine sound

    const m = this.mass, L = s.wheelbase, a = L * 0.47, b = L - a, g = 9.81;
    const I = this.inertia;
    const hcg = s.twoWheeler ? 0.6 : s.length > 7 ? 1.3 : 0.55;
    const wet = world ? world.wetness || 0 : 0;
    const mu = (s.grip / 9) * (1 - wet * 0.22) * (depth > 0.1 ? 0.75 : 1) * (s.twoWheeler ? 1.05 : 1);
    // Load transfer from last step's longitudinal acceleration.
    const dN = Math.max(-0.35, Math.min(0.35, (this.ax * hcg) / (g * L))) * m * g;
    const Nf = Math.max(0.1 * m * g, (m * g * b) / L - dN), Nr = Math.max(0.1 * m * g, (m * g * a) / L + dN);

    // Steering: quick, but less lock at speed (like any arcade-sim racer).
    const lock = s.steer / (1 + Math.abs(u) * (s.twoWheeler ? 0.22 : s.length > 7 ? 0.035 : 0.05));
    const target = (input ? input.steer : 0) * lock;
    const rate = (Math.abs(target) < Math.abs(this.steer) ? 6 : 3.2) * s.steer;
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));
    const d = this.steer;

    // Longitudinal: engine, brakes, reverse.
    let Fdrive = 0, Fbrake = 0;
    if (thr > 0) {
      if (u < -0.5) Fbrake = m * s.brake * thr;
      else Fdrive = m * s.accel * thr * Math.pow(Math.max(0, 1 - Math.max(0, u) / s.maxSpeed), 0.6) * (1 + 0.3 * Math.max(0, 1 - Math.abs(u) / 6));
    } else if (thr < 0) {
      if (u > 0.5) Fbrake = m * s.brake * -thr;
      else Fdrive = u > -s.reverse ? m * s.accel * 0.6 * thr : 0;
    }
    if (!input) Fbrake += m * 7; // nobody at the wheel: parked, in gear
    if (this.stalled || dead) Fdrive = 0;

    // Tyres. Slip angle in each axle's own frame; a softened Pacejka-style curve.
    const curve = (al) => Math.sin(1.25 * Math.atan(18 * al)); // peaks near 10 degrees of slip
    // Front axle.
    const vfx = u, vfy = v + a * r;
    const cd = Math.cos(d), sd = Math.sin(d);
    const wLong = vfx * cd + vfy * sd, wLat = -vfx * sd + vfy * cd;
    const sp = Math.hypot(u, v);
    const low = Math.min(1, sp / 3); // below walking pace, tyres just roll
    let Ffl = -mu * Nf * curve(Math.atan2(wLat, Math.abs(wLong) + 0.5)) * low;
    // Rear axle.
    const vry = v - b * r;
    const rearMu = mu * (hb && input ? (s.twoWheeler ? 0.85 : 0.42) : s.twoWheeler ? 1 : 1.15); // a planted rear = stable
    let Frl = -rearMu * Nr * curve(Math.atan2(vry, Math.abs(u) + 0.5)) * low;
    // Brakes split 60/40 front/rear; drive goes through the front (most Indian cars are FWD).
    const sgn = Math.sign(u) || 1;
    let Fxf = Fdrive * 0.7 - Fbrake * 0.6 * sgn * Math.min(1, Math.abs(u) / 0.4);
    let Fxr = Fdrive * 0.3 - (Fbrake * 0.4 + (hb && input ? m * 5 : 0)) * sgn * Math.min(1, Math.abs(u) / 0.4);
    // Friction circle per axle: hard braking or wheelspin steals cornering grip.
    const circle = (Fx, Fy, Fmax) => { const t = Math.hypot(Fx, Fy); return t > Fmax ? Fmax / t : 1; };
    const kf = circle(Fxf, Ffl, mu * Nf * 1.05), kr = circle(Fxr, Frl, rearMu * Nr * 1.05);
    Fxf *= kf; Ffl *= kf; Fxr *= kr; Frl *= kr;
    // Body-frame forces.
    const Fx = Fxf * cd - Ffl * sd + Fxr;
    const Fy = Fxf * sd + Ffl * cd + Frl;
    const Mz = a * (Fxf * sd + Ffl * cd) - b * Frl;
    // Resistance: rolling, aero, and wading through water.
    const drag = 0.012 * m * u + 0.0004 * m * u * Math.abs(u) + (depth > 0.04 ? m * Math.min(6, depth * 3.5) * u * 0.25 : 0);

    // Velocity is re-projected onto the (rotating) body axes every step, so the frame's
    // rotation is already accounted for: no Coriolis terms here.
    const ax = (Fx - drag) / m;
    const ay = Fy / m;
    u += ax * dt;
    v += ay * dt;
    r += (Mz / I) * dt;
    if (s.twoWheeler) {
      // Bikes lean rather than slide: they follow their front wheel, up to the grip limit.
      const rk = (u * Math.tan(d)) / L, rMax = (mu * g) / Math.max(2, Math.abs(u));
      r = Math.max(-rMax, Math.min(rMax, rk));
      v *= Math.exp(-8 * dt);
    } else {
      // Stability assist: rein in yaw beyond what the tyres can hold, so a car slides and
      // recovers instead of spinning, unless you're deliberately on the handbrake.
      const ai = this.driver && this.driver !== 'player';
      const rMax = (mu * g * 1.15) / Math.max(2, Math.abs(u)) + (hb && input ? 2.5 : ai ? 0.05 : 0.35);
      if (Math.abs(r) > rMax) r -= (Math.abs(r) - rMax) * Math.sign(r) * Math.min(1, dt * (ai ? 12 : 4));
    }
    if (low < 1) { // near standstill blend to pure rolling so cars don't drift at 2 km/h
      const rk = (u * Math.tan(d)) / L;
      r += (rk - r) * (1 - low);
      v *= 1 - (1 - low) * Math.min(1, dt * 12);
    }
    // Coast to a stop rather than creeping forever.
    if (!thr && Math.abs(u) < 0.25 && sp < 0.3) { u = 0; v = 0; r *= 0.5; }
    this.ax = ax; this.ay = ay;
    this.slip = Math.abs(Math.atan2(vry, Math.abs(u) + 0.5));
    this.vx = fx * u + lx * v;
    this.vz = fz * u + lz * v;
    this.angVel = r;
    this.heading += r * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.yawRate = r;
    this.impact = world ? this.collideStatic(world.colliders) : 0;
    return this.impact;
  }

  // Push out of buildings and walls; the impulse also spins the car about its centre.
  collideStatic(colliders) {
    let impact = 0;
    const circles = this.circles(this._c || (this._c = []));
    for (const c of circles) {
      const hit = colliders.resolveCircle(c.x, c.z, c.r, this.y);
      if (!hit) continue;
      this.x += hit.x - c.x; this.z += hit.z - c.z;
      // Velocity of the contact point (body velocity plus rotation).
      const px = c.x - this.x, pz = c.z - this.z;
      const cvx = this.vx + this.angVel * pz, cvz = this.vz - this.angVel * px;
      const vn = cvx * hit.nx + cvz * hit.nz;
      if (vn < 0) {
        const j = (-1.25 * vn) / (1 / this.mass + (px * hit.nz - pz * hit.nx) ** 2 / this.inertia);
        this.applyImpulse(hit.nx * j, hit.nz * j, px, pz);
        // Scrape: friction along the wall.
        this.vx *= 0.92; this.vz *= 0.92;
        if (-vn > impact) { impact = -vn; this.lastHit = { x: c.x - hit.nx * c.r, z: c.z - hit.nz * c.r }; }
      }
      this.circles(circles);
    }
    return impact;
  }

  // Impulse (jx, jz) applied at offset (px, pz) from the centre of mass.
  applyImpulse(jx, jz, px, pz) {
    this.vx += jx / this.mass;
    this.vz += jz / this.mass;
    this.angVel += (pz * jx - px * jz) / this.inertia;
  }

  // ---------- damage ----------
  takeDamage(amount, wx, wz, world) {
    if (amount < 1 || this.wrecked) return;
    amount *= TOUGHNESS[this.type] ?? (this.spec.twoWheeler ? 1.4 : 1);
    const was = this.health;
    this.health -= amount;
    this.dent(wx, wz, amount);
    if (this.health <= 0 && !this.engineDead) {
      this.engineDead = true;
      this.siren = false;
      if (this.driver === 'player') world?.hud?.say('The engine is dead. Get out and find another ride.', 3);
      if (Math.random() < 0.3) this.ignite(world);
    } else if (this.health <= -35 && was > -35 && !this.fireT) this.ignite(world);
  }

  ignite(world) {
    if (this.fireT || this.wrecked) return;
    this.fireT = 7 + Math.random() * 4;
    this.engineDead = true;
    if (this.driver === 'player') world?.hud?.say('It\'s on fire! Get out!', 3);
  }

  // Remember the factory-fresh mesh the first time we bend it.
  snapshot() {
    if (this._orig) return;
    const g = this.model.mesh.geometry;
    const d = this.model.decalMesh?.geometry;
    this._orig = { pos: g.attributes.position.array.slice(), col: g.attributes.color.array.slice(), pbr: g.attributes.pbr?.array.slice(), dpos: d?.attributes.position.array.slice() };
  }

  // Crumple the bodywork around a world-space contact point.
  dent(wx, wz, amount) {
    this.snapshot();
    const dx = wx - this.x, dz = wz - this.z;
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const lz = dx * s + dz * c, lx = dx * c - dz * s; // contact in local coordinates
    const ln = Math.hypot(lx, lz) || 1, nx = -lx / ln, nz = -lz / ln; // push towards the centre
    const R = 0.45 + Math.min(0.7, amount * 0.012), depth = Math.min(0.16, amount * 0.0035);
    const bend = (geo, bodyOnly) => {
      const pos = geo.attributes.position, col = geo.attributes.color, pbr = geo.attributes.pbr, skin = geo.attributes.skinIndex;
      for (let i = 0; i < pos.count; i++) {
        if (bodyOnly && skin && skin.getX(i) !== 0) continue; // leave the wheels round
        const px = pos.getX(i), pz = pos.getZ(i);
        const d = Math.hypot(px - lx, pz - lz);
        if (d > R) continue;
        const w = (1 - d / R) ** 2;
        pos.setX(i, px + nx * w * depth);
        pos.setZ(i, pz + nz * w * depth);
        pos.setY(i, pos.getY(i) - w * depth * 0.3);
        if (col) { col.setX(i, col.getX(i) * (1 - w * 0.12)); col.setY(i, col.getY(i) * (1 - w * 0.12)); col.setZ(i, col.getZ(i) * (1 - w * 0.12)); }
        if (pbr && amount > 10) pbr.setZ(i, pbr.getZ(i) * (1 - w)); // smashed lamps go dark
      }
      pos.needsUpdate = true;
      if (col) col.needsUpdate = true;
      if (pbr) pbr.needsUpdate = true;
    };
    bend(this.model.mesh.geometry, true);
    if (this.model.decalMesh) bend(this.model.decalMesh.geometry, false);
    this.model.mesh.geometry.computeBoundingSphere();
  }

  // Burnt-out shell.
  scorch() {
    this.snapshot();
    const g = this.model.mesh.geometry, col = g.attributes.color, pbr = g.attributes.pbr;
    for (let i = 0; i < col.count; i++) {
      const k = 0.03 + 0.03 * Math.random(); // charcoal, with a ghost of the old paint
      col.setXYZ(i, col.getX(i) * k + 0.02, col.getY(i) * k + 0.018, col.getZ(i) * k + 0.016);
      if (pbr) pbr.setXYZ(i, 0.95, 0.1, 0);
    }
    col.needsUpdate = true;
    if (pbr) pbr.needsUpdate = true;
    if (this.model.decalMesh) this.model.decalMesh.visible = false;
  }

  // Factory reset (garages, and vehicles going back to the traffic pool).
  repair() {
    this.health = 100; this.engineDead = false; this.fireT = 0; this.wrecked = false;
    if (!this._orig) return;
    const g = this.model.mesh.geometry, o = this._orig;
    g.attributes.position.array.set(o.pos); g.attributes.position.needsUpdate = true;
    g.attributes.color.array.set(o.col); g.attributes.color.needsUpdate = true;
    if (o.pbr) { g.attributes.pbr.array.set(o.pbr); g.attributes.pbr.needsUpdate = true; }
    if (o.dpos) { const d = this.model.decalMesh.geometry; d.attributes.position.array.set(o.dpos); d.attributes.position.needsUpdate = true; this.model.decalMesh.visible = true; }
    this._orig = null;
  }

  // Smoke from a sick engine, then flames, then the bang.
  effects(dt, world) {
    const P = world?.particles;
    if (!P || this.wrecked && this.fireT <= 0 && this.smokeT <= 0) return;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const heavy = this.spec.length > 7;
    const eo = heavy ? -this.spec.length * 0.4 : this.spec.length * 0.32; // engine bay
    const ex = this.x + fx * eo, ez = this.z + fz * eo, ey = this.y + (heavy ? 1.6 : this.spec.twoWheeler ? 0.6 : 1.0);
    if (this.fireT > 0) {
      this.fireT -= dt;
      for (let k = 0; k < 3; k++) P.emit('fire', ex + (Math.random() - 0.5) * 0.8, ey, ez + (Math.random() - 0.5) * 0.8, 0, 1, 0, heavy ? 2 : 1.3);
      if (Math.random() < dt * 8) P.emit('blackSmoke', ex, ey + 0.8, ez, 0, 1.5, 0, 1.4);
      if (this.fireT <= 0) { world.explode?.(this.x, this.y + 0.8, this.z, this); this.wrecked = true; this.smokeT = 40; this.scorch(); }
      return;
    }
    if (this.wrecked) {
      this.smokeT -= dt;
      if (Math.random() < dt * 4) P.emit('blackSmoke', ex, ey, ez, 0, 1, 0, 1.2);
      return;
    }
    if (this.health < 45) {
      this.smokeT -= dt;
      const rate = this.health < 0 ? 14 : this.health < 20 ? 9 : 4;
      if (this.smokeT <= 0) {
        this.smokeT = 1 / rate;
        P.emit(this.health < 20 ? 'blackSmoke' : 'smoke', ex + (Math.random() - 0.5) * 0.4, ey, ez + (Math.random() - 0.5) * 0.4, this.vx * 0.3, 0.8, this.vz * 0.3, heavy ? 1.5 : 0.9);
      }
    }
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
    } else if (dt > 0) {
      // Suspension: the body rolls out of corners, dives under braking and squats under power,
      // on a lightly damped spring so it bobs a little.
      const heavy = this.spec.length > 7 ? 1.6 : 1;
      const rollT = THREE.MathUtils.clamp((this.ay || 0) * 0.011 * heavy, -0.09, 0.09);
      const pitchT = THREE.MathUtils.clamp(-(this.ax || 0) * 0.007 * heavy, -0.07, 0.07);
      const k = 90, c = 11, h = Math.min(dt, 1 / 30);
      this.rollVel += ((rollT - this.roll) * k - this.rollVel * c) * h;
      this.pitchVel += ((pitchT - this.pitch) * k - this.pitchVel * c) * h;
      this.roll += this.rollVel * h;
      this.pitch += this.pitchVel * h;
      this.group.rotation.z = this.roll;
      this.group.rotation.x = this.pitch;
    }
    if (dt > 0) this.effects(dt, world);
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
