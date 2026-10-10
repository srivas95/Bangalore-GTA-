// Procedural vehicle models. Each vehicle is ONE skinned mesh (wheels are bones) using a
// shared material whose roughness/metalness/glow come from vertex attributes.
// All models face +z. Kerb side (left, India) is +x.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MeshBuilder, buildSkinned, makePbrMaterial } from '../world/meshBuilder.js';
import { put } from '../world/landmarks.js';
import { textTexture } from '../world/textures.js';
import { decalAtlas, decalUV, BUS_LIVERIES, pickBusLivery } from './liveries.js';

// horn: profile key in systems/audio.js. stall: water depth (m) that floods the engine.
export const VEHICLE_TYPES = {
  scooter: { label: 'Scooter', length: 1.85, width: 0.72, wheelbase: 1.25, maxSpeed: 22, accel: 6.5, brake: 12, reverse: 1.5, steer: 0.6, grip: 10, mass: 130, twoWheeler: true, cam: 4.2, horn: 'scooter', engine: 'scooter', seatY: 0.78, stall: 0.35 },
  delivery: { label: 'Delivery Scooter', length: 1.85, width: 0.72, wheelbase: 1.25, maxSpeed: 23, accel: 6.8, brake: 12, reverse: 1.5, steer: 0.6, grip: 10, mass: 135, twoWheeler: true, cam: 4.4, horn: 'scooterHi', engine: 'scooter', seatY: 0.78, stall: 0.35 },
  bike: { label: 'Royal Bullet', length: 2.15, width: 0.8, wheelbase: 1.4, maxSpeed: 31, accel: 7.5, brake: 13, reverse: 1.5, steer: 0.55, grip: 10, mass: 195, twoWheeler: true, cam: 4.6, horn: 'bike', engine: 'bike', seatY: 0.8, stall: 0.45 },
  auto: { label: 'Auto Rickshaw', length: 2.65, width: 1.35, wheelbase: 1.9, maxSpeed: 15.5, accel: 3.8, brake: 9, reverse: 3, steer: 0.65, grip: 8, mass: 350, cam: 5.2, horn: 'auto', engine: 'auto', seatY: 0.92, stall: 0.45 },
  goodsAuto: { label: 'Goods Auto', length: 3.1, width: 1.45, wheelbase: 2.0, maxSpeed: 13, accel: 3, brake: 9, reverse: 3, steer: 0.6, grip: 8, mass: 520, cam: 5.8, horn: 'autoLow', engine: 'auto', seatY: 0.95, stall: 0.5 },
  hatch: { label: 'Hatchback', length: 3.8, width: 1.7, wheelbase: 2.4, maxSpeed: 40, accel: 7, brake: 14, reverse: 6, steer: 0.55, grip: 9, mass: 1000, cam: 6.5, horn: 'car', engine: 'car', stall: 0.55 },
  sedan: { label: 'Sedan', length: 4.4, width: 1.75, wheelbase: 2.65, maxSpeed: 44, accel: 7.5, brake: 14, reverse: 6, steer: 0.52, grip: 9, mass: 1200, cam: 6.8, horn: 'car2', engine: 'car', stall: 0.55 },
  taxi: { label: 'City Cab', length: 4.3, width: 1.72, wheelbase: 2.6, maxSpeed: 42, accel: 7.5, brake: 14, reverse: 6, steer: 0.52, grip: 9, mass: 1150, cam: 6.8, horn: 'carHi', engine: 'car', stall: 0.55 },
  suv: { label: 'SUV', length: 4.6, width: 1.86, wheelbase: 2.75, maxSpeed: 45, accel: 8, brake: 14, reverse: 6, steer: 0.5, grip: 8.5, mass: 1800, cam: 7.2, horn: 'suv', engine: 'car', stall: 0.8 },
  hoysala: { label: 'Hoysala (Ertiga)', length: 4.4, width: 1.73, wheelbase: 2.74, maxSpeed: 45, accel: 8.5, brake: 15, reverse: 6, steer: 0.55, grip: 9.5, mass: 1250, cam: 7, horn: 'police', engine: 'car', stall: 0.6, police: true },
  tempo: { label: 'Tempo Traveller', length: 5.6, width: 2.0, wheelbase: 3.35, maxSpeed: 26, accel: 4, brake: 10, reverse: 4, steer: 0.5, grip: 8, mass: 2800, cam: 9, horn: 'tempo', engine: 'car', stall: 0.8 },
  miniTruck: { label: 'Mini Truck', length: 3.8, width: 1.5, wheelbase: 2.1, maxSpeed: 20, accel: 4, brake: 10, reverse: 4, steer: 0.55, grip: 8, mass: 1300, cam: 7, horn: 'ace', engine: 'car', stall: 0.6 },
  lorry: { label: 'Lorry', length: 8.6, width: 2.5, wheelbase: 4.8, maxSpeed: 18, accel: 2, brake: 7, reverse: 3, steer: 0.5, grip: 7, mass: 9000, cam: 13, horn: 'lorry', engine: 'bus', stall: 1.1 },
  tanker: { label: 'Water Tanker', length: 8.0, width: 2.5, wheelbase: 4.6, maxSpeed: 17, accel: 2, brake: 7, reverse: 3, steer: 0.5, grip: 7, mass: 10000, cam: 13, horn: 'air', engine: 'bus', stall: 1.1 },
  bus: { label: 'BMTC Bus', length: 11.5, width: 2.55, wheelbase: 6.2, maxSpeed: 20, accel: 2.2, brake: 7, reverse: 3, steer: 0.55, grip: 7, mass: 11000, cam: 15, horn: 'bus', engine: 'bus', stall: 1.2 },
  schoolBus: { label: 'School Bus', length: 9.5, width: 2.4, wheelbase: 5.0, maxSpeed: 19, accel: 2.4, brake: 8, reverse: 3, steer: 0.55, grip: 7, mass: 7500, cam: 13, horn: 'schoolBus', engine: 'bus', stall: 1.0 },
};

// Per-vertex [roughness, metalness, emissive].
const P = {
  paint: [0.3, 0.5, 0], matte: [0.85, 0.05, 0], plastic: [0.55, 0, 0], glass: [0.04, 0.95, 0],
  chrome: [0.18, 1, 0], rubber: [0.92, 0, 0], head: [0.2, 0, 1.2], tail: [0.3, 0, 0.7], cloth: [0.95, 0, 0],
};

export const vehicleMaterial = makePbrMaterial({ envMapIntensity: 1.15 });

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 2, 0.12),
  rboxS: new RoundedBoxGeometry(1, 1, 1, 2, 0.3),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  sphere: new THREE.SphereGeometry(1, 10, 6),
};

// Builder wrapper: tracks bones, PBR preset and adds decals.
class VB {
  constructor() {
    this.b = new MeshBuilder({ pbr: true, skin: true });
    const root = new THREE.Bone();
    this.bones = [root];
    this.wheels = [];
    this.decals = new MeshBuilder();
  }
  add(geo, pbr, color, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, ry = 0, bone = 0) {
    this.b.pbr = pbr; this.b.bone = bone;
    put(this.b, geo, x, y, z, color, ry, sx, sy, sz, rx, rz);
  }
  // Wheel with tyre and hub. steer: front wheel on a steering bone. extra(boneIndex) adds parts that steer with it.
  wheel(x, y, z, r, w, steer, opts = {}) {
    let parent = this.bones[0], steerIdx = -1;
    if (steer) {
      const s = new THREE.Bone(); s.position.set(x, y, z);
      parent.add(s); this.bones.push(s); steerIdx = this.bones.length - 1; parent = s;
    }
    const spin = new THREE.Bone();
    if (steer) spin.position.set(0, 0, 0); else spin.position.set(x, y, z);
    parent.add(spin); this.bones.push(spin);
    const spinIdx = this.bones.length - 1;
    const tyre = new THREE.CylinderGeometry(r, r, w, 16); tyre.rotateZ(Math.PI / 2);
    this.add(tyre, P.rubber, 0x161616, x, y, z, 1, 1, 1, 0, 0, 0, spinIdx);
    const hub = new THREE.CylinderGeometry(r * (opts.hub || 0.58), r * (opts.hub || 0.58), w + 0.02, 10); hub.rotateZ(Math.PI / 2);
    this.add(hub, P.chrome, opts.hubColor ?? 0xb0b4b8, x, y, z, 1, 1, 1, 0, 0, 0, spinIdx);
    // Spokes make rotation visible.
    for (let k = 0; k < 4; k++) this.add(G.box, P.matte, 0x3a3a3a, x, y, z, w + 0.03, r * 1.05, 0.03, (k / 4) * Math.PI, 0, 0, spinIdx);
    this.wheels.push({ steerIdx, spinIdx, r });
    return steerIdx;
  }
  // Decal from the livery atlas. Faces: L (+x side), R (-x side), F (front), B (back), T (top, reads from the front).
  decal(name, x, y, z, w, h, face) {
    const [u0, v0, u1, v1] = decalUV(name);
    const d = this.decals, hw = w / 2, hh = h / 2;
    if (face === 'L') d.quad([x, y - hh, z + hw], [x, y - hh, z - hw], [x, y + hh, z - hw], [x, y + hh, z + hw], [1, 0, 0], [u0, v0, u1, v1]); // +x side, read front-to-back
    if (face === 'R') d.quad([x, y - hh, z - hw], [x, y - hh, z + hw], [x, y + hh, z + hw], [x, y + hh, z - hw], [-1, 0, 0], [u0, v0, u1, v1]);
    if (face === 'B') d.quad([x + hw, y - hh, z], [x - hw, y - hh, z], [x - hw, y + hh, z], [x + hw, y + hh, z], [0, 0, -1], [u0, v0, u1, v1]);
    if (face === 'F') d.quad([x - hw, y - hh, z], [x + hw, y - hh, z], [x + hw, y + hh, z], [x - hw, y + hh, z], [0, 0, 1], [u0, v0, u1, v1]);
    if (face === 'T') d.quad([x - hw, y, z + hh], [x + hw, y, z + hh], [x + hw, y, z - hh], [x - hw, y, z - hh], [0, 1, 0], [u0, v0, u1, v1]);
  }
  // Side decal that hugs a curved body: halfWidth(z) gives the body's half-width along its length.
  decalWrap(name, side, y, h, z0, z1, halfWidth, segs = 16) {
    const [u0, v0, u1, v1] = decalUV(name);
    const s = side === 'L' ? 1 : -1, y0 = y - h / 2, y1 = y + h / 2;
    for (let k = 0; k < segs; k++) {
      // Walk from the front (z1) to the rear (z0): u runs front-to-back on the L side, back-to-front on R.
      const za = z1 - ((z1 - z0) * k) / segs, zb = z1 - ((z1 - z0) * (k + 1)) / segs;
      const xa = s * (halfWidth(za) + 0.014), xb = s * (halfWidth(zb) + 0.014);
      const ta = k / segs, tb = (k + 1) / segs;
      const dx = xb - xa, dz = zb - za, nl = Math.hypot(dx, dz) || 1;
      const n = [-s * dz / nl, 0, s * dx / nl]; // outward, perpendicular to the strip
      if (side === 'L') {
        const ua = u0 + (u1 - u0) * ta, ub = u0 + (u1 - u0) * tb;
        this.decals.quad4([xa, y0, za], [xb, y0, zb], [xb, y1, zb], [xa, y1, za], n, [ua, v0], [ub, v0], [ub, v1], [ua, v1]);
      } else {
        const ua = u1 - (u1 - u0) * ta, ub = u1 - (u1 - u0) * tb;
        this.decals.quad4([xb, y0, zb], [xa, y0, za], [xa, y1, za], [xb, y1, zb], n, [ub, v0], [ua, v0], [ua, v1], [ub, v1]);
      }
    }
  }
  finish(spec, extra = {}) {
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    const mesh = buildSkinned(this.b, vehicleMaterial, this.bones);
    group.add(mesh);
    if (!this.decals.empty) {
      const dm = this.decals.build(decalAtlas(), { castShadow: false });
      group.add(dm);
    }
    const wheels = this.wheels.map((w) => ({ steer: w.steerIdx >= 0 ? this.bones[w.steerIdx] : null, spin: this.bones[w.spinIdx], r: w.r }));
    return { group, mesh, wheels, spec, body: group, ...extra };
  }
}

// Box whose top face is narrowed/shifted: good for windscreens and cabins.
function tapered(w, h, d, topX, topZ, shiftZ, rounded = true) {
  const g = rounded ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.1, h * 0.25)) : new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const t = (p.getY(k) + h / 2) / h;
    p.setX(k, p.getX(k) * (1 + (topX - 1) * t));
    p.setZ(k, p.getZ(k) * (1 + (topZ - 1) * t) + shiftZ * t);
  }
  g.computeVertexNormals();
  return g;
}

const CAR_COLOURS = [0xf2f2f2, 0xf2f2f2, 0xf2f2f2, 0xc0c4c8, 0x8a8e92, 0x202224, 0xb01c22, 0x1c3a7a, 0xe0d8c8, 0x5a2a1a, 0x2a5a4a, 0xd06a1a, 0x3a3a46];
const pick = (a, r) => a[Math.floor(r() * a.length)];

function plate(v, z, y, yellow, w = 0.5, face = 1) {
  v.add(G.box, P.plastic, yellow ? 0xf2c200 : 0xf4f4f4, 0, y, z, w, 0.12, 0.02);
  v.add(G.box, P.matte, 0x222222, 0, y, z + face * 0.011, w * 0.8, 0.05, 0.005);
}

// Hatchbacks, sedans, cabs, SUVs and the Hoysala Ertiga share one parametric body.
function buildCar(type, r, opts) {
  const spec = VEHICLE_TYPES[type];
  const v = new VB();
  const L = spec.length, W = spec.width;
  const police = type === 'hoysala';
  const pink = police && opts.pink;
  let colour = opts.color ?? (type === 'taxi' ? pick([0xf2f2f2, 0xf2f2f2, 0xd8d8d8, 0xf2c200], r) : pick(CAR_COLOURS, r));
  if (police) colour = pink ? 0xe86aa6 : 0xf6f6f4;
  const mpv = police, suv = type === 'suv', hatch = type === 'hatch';
  const y0 = suv ? 0.42 : 0.3;
  const lowH = suv ? 0.82 : mpv ? 0.74 : 0.66;
  const cabH = suv ? 0.72 : mpv ? 0.68 : 0.58;
  // Lower body with a crease line.
  v.add(G.rbox, P.paint, colour, 0, y0 + lowH / 2, 0, W, lowH, L);
  v.add(G.box, P.matte, 0x111111, W / 2 + 0.002, y0 + lowH * 0.62, 0, 0.004, 0.015, L * 0.8);
  v.add(G.box, P.matte, 0x111111, -W / 2 - 0.002, y0 + lowH * 0.62, 0, 0.004, 0.015, L * 0.8);
  // Bonnet slope.
  const bonnetL = hatch ? L * 0.26 : L * 0.28;
  v.add(tapered(W * 0.98, 0.08, bonnetL, 0.96, 1, -0.05), P.paint, colour, 0, y0 + lowH + 0.02, L / 2 - bonnetL / 2 - 0.05);
  // Cabin glasshouse.
  const cabL = hatch ? L * 0.56 : mpv ? L * 0.62 : suv ? L * 0.6 : L * 0.46;
  const cabZ = hatch ? -L * 0.12 : mpv ? -L * 0.1 : suv ? -L * 0.08 : -L * 0.04;
  const glass = tapered(W * 0.94, cabH, cabL, suv ? 0.95 : 0.88, suv || mpv ? 0.84 : 0.7, suv || mpv ? -0.08 : -0.05);
  v.add(glass, P.glass, 0x161c22, 0, y0 + lowH + cabH / 2 - 0.02, cabZ);
  const roofL = cabL * (suv || mpv ? 0.84 : 0.68);
  v.add(tapered(W * 0.9 * (suv ? 0.95 : 0.88), 0.07, roofL, 1, 1, 0), P.paint, colour, 0, y0 + lowH + cabH, cabZ - (suv || mpv ? 0.08 : 0.05));
  // Pillars (A, B, C and D for MPVs).
  const pillars = mpv || suv ? [-0.42, -0.12, 0.18, 0.42] : [-0.38, 0.0, 0.38];
  for (const s of [-1, 1]) {
    for (const f of pillars) v.add(G.box, P.paint, police ? 0x111111 : colour, s * W * 0.445, y0 + lowH + cabH / 2, cabZ + f * cabL * 0.95, 0.04, cabH * 0.95, 0.07);
    v.add(G.rbox, P.paint, colour, s * W * 0.52, y0 + lowH + 0.07, cabZ + cabL / 2 - 0.12, 0.12, 0.09, 0.17); // mirror
    v.add(G.box, P.glass, 0x222a30, s * W * 0.575, y0 + lowH + 0.07, cabZ + cabL / 2 - 0.12, 0.005, 0.07, 0.13);
    // Door seams and handles.
    for (const dz of [cabZ + cabL * 0.32, cabZ - cabL * 0.02, cabZ - cabL * 0.36].slice(0, hatch ? 2 : 3)) {
      v.add(G.box, P.matte, 0x111111, s * (W / 2 + 0.003), y0 + lowH * 0.55, dz, 0.004, lowH * 0.7, 0.012);
      v.add(G.box, P.chrome, 0xc0c0c0, s * (W / 2 + 0.01), y0 + lowH * 0.78, dz - 0.18, 0.02, 0.025, 0.12);
    }
  }
  if (!hatch && !mpv && !suv) v.add(tapered(W * 0.97, 0.06, L * 0.2, 0.95, 1, 0.02), P.paint, colour, 0, y0 + lowH + 0.01, -L / 2 + L * 0.1 + 0.05); // boot
  if (suv) { v.add(G.box, P.matte, 0x222222, 0, y0 + lowH + cabH + 0.09, cabZ, W * 0.8, 0.04, roofL * 0.9); v.add(G.rbox, P.matte, 0x222222, 0, y0 + lowH + 0.2, -L / 2 - 0.12, 0.5, 0.5, 0.18); }
  // Bumpers, grille, lamps.
  v.add(G.rbox, police ? P.paint : P.plastic, police ? colour : 0x1e1e1e, 0, y0 + 0.14, L / 2 - 0.04, W * 0.99, 0.26, 0.18);
  if (police) {
    // Ertiga face: gloss-black grille and a black lower intake in a body-colour bumper.
    v.add(G.box, P.plastic, 0x111111, 0, y0 + 0.1, L / 2 + 0.055, W * 0.6, 0.12, 0.02);
    for (const s of [-1, 1]) v.add(G.box, P.plastic, 0x111111, s * W * 0.36, y0 + 0.12, L / 2 + 0.05, 0.2, 0.1, 0.02); // fog-lamp housings
  }
  v.add(G.rbox, P.plastic, 0x1e1e1e, 0, y0 + 0.14, -L / 2 + 0.04, W * 0.99, 0.26, 0.18);
  v.add(G.rbox, P.chrome, police ? 0x0c0c0c : 0x2a2a2a, 0, y0 + lowH * 0.58, L / 2 + 0.005, W * (police ? 0.46 : 0.42), police ? 0.2 : 0.16, 0.03);
  for (let k = 0; k < 3; k++) v.add(G.box, P.chrome, police ? 0x3a3a3a : 0x9a9a9a, 0, y0 + lowH * 0.52 + k * 0.045, L / 2 + 0.02, W * 0.38, 0.01, 0.01);
  for (const s of [-1, 1]) {
    v.add(G.rbox, P.head, 0xfff6dc, s * W * 0.36, y0 + lowH * 0.66, L / 2 - 0.02, W * 0.22, 0.12, 0.07);
    v.add(G.rbox, P.tail, 0xd01010, s * W * 0.38, y0 + lowH * 0.72, -L / 2 + 0.02, W * 0.18, 0.15, 0.07);
    v.add(G.box, P.tail, 0xff8a10, s * W * 0.43, y0 + lowH * 0.5, L / 2 - 0.03, 0.12, 0.05, 0.05); // indicators
  }
  plate(v, L / 2 + 0.06, y0 + 0.2, type === 'taxi', 0.5, 1);
  plate(v, -L / 2 - 0.06, y0 + 0.32, type === 'taxi', 0.5, -1);
  if (type === 'taxi') v.decal('cab', W / 2 + 0.012, y0 + lowH * 0.45, -0.2, 1.1, 0.27, 'L');
  if (police) {
    // Hoysala livery (painted in liveries.js): blue swoosh over the front door and wheel, blue
    // rear quarter, the 112 roundel, BENGALURU CITY POLICE / ಪೊಲೀಸ್, POLICE on the bonnet.
    // The lower body is a scaled rounded box: its sides curve in over the last ~12% at each end.
    const halfW = (z) => { const d = Math.min(0.12, Math.max(0, Math.abs(z) / L - 0.38)); return W * (0.38 + Math.sqrt(0.0144 - d * d)); };
    v.decalWrap(pink ? 'pinkL' : 'hoysalaL', 'L', y0 + lowH / 2, lowH * 0.97, -L * 0.49, L * 0.49, halfW);
    v.decalWrap(pink ? 'pinkR' : 'hoysalaR', 'R', y0 + lowH / 2, lowH * 0.97, -L * 0.49, L * 0.49, halfW);
    v.decal('bonnet', 0, y0 + lowH + 0.066, L / 2 - bonnetL / 2 - 0.05, W * 0.62, bonnetL * 0.62, 'T');
    v.decal(pink ? 'pinkText' : 'police', 0, y0 + lowH * 0.62, -L / 2 - 0.13, 1.3, 0.32, 'B');
    // Light bar: red, white and blue lamps on a black base.
    v.add(G.box, P.chrome, 0x222222, 0, y0 + lowH + cabH + 0.08, cabZ + 0.2, W * 0.78, 0.08, 0.3);
    v.add(G.box, P.plastic, 0xe8e8f0, 0, y0 + lowH + cabH + 0.17, cabZ + 0.2, W * 0.14, 0.1, 0.24);
  }
  const wr = suv ? 0.37 : mpv ? 0.33 : 0.31, ww = suv ? 0.25 : 0.21;
  const wz = spec.wheelbase / 2, wx = W / 2 - ww / 2 + 0.02;
  // Wheel arches.
  for (const z of [wz, -wz]) for (const s of [-1, 1]) v.add(G.cyl, P.matte, 0x0e0e0e, s * (W / 2 - 0.05), y0 + 0.05, z, wr + 0.06, 0.12, wr + 0.06, 0, Math.PI / 2);
  v.wheel(wx, wr, wz, wr, ww, true); v.wheel(-wx, wr, wz, wr, ww, true);
  v.wheel(wx, wr, -wz, wr, ww, false); v.wheel(-wx, wr, -wz, wr, ww, false);
  const extra = { color: colour };
  if (police) extra.lightBar = { y: y0 + lowH + cabH + 0.17, z: cabZ + 0.2, w: W * 0.3 };
  return v.finish(spec, extra);
}

function buildAuto(type, r, opts) {
  const spec = VEHICLE_TYPES[type];
  const goods = type === 'goodsAuto';
  const v = new VB();
  const green = 0x1f7a3a, yellow = opts.color ?? 0xf2c200, black = 0x151515;
  const cabCol = goods ? pick([0x2a6ab0, 0x2a8a4a, 0xe8e8e8], r) : green;
  // Front cowl / nose.
  v.add(tapered(0.95, 0.5, 0.7, 0.85, 0.7, -0.08), P.paint, cabCol, 0, 0.5, goods ? 1.15 : 0.75);
  v.add(tapered(0.82, 0.35, 0.48, 0.85, 0.8, -0.1), P.paint, goods ? cabCol : yellow, 0, 0.92, goods ? 1.06 : 0.66);
  v.add(G.box, P.matte, 0x222222, 0, 0.3, goods ? 0.7 : 0.3, 0.7, 0.08, 1.3);
  if (goods) {
    // Cargo bed with sides, often overloaded.
    v.add(G.box, P.matte, 0x5a4a3a, 0, 0.62, -0.55, 1.45, 0.08, 1.8);
    for (const s of [-1, 1]) v.add(G.box, P.paint, cabCol, s * 0.71, 0.82, -0.55, 0.04, 0.38, 1.8);
    v.add(G.box, P.paint, cabCol, 0, 0.82, -1.44, 1.45, 0.38, 0.04);
    v.add(G.rbox, P.cloth, pick([0xd0b080, 0x8a6a4a, 0x3a6a3a, 0xc04a2a], r), 0, 1.05, -0.5, 1.3, 0.5, 1.6);
    v.add(G.rbox, P.matte, black, 0, 1.72, 0.65, 1.2, 0.08, 0.95);
    v.add(G.box, P.glass, 0x2a3a40, 0, 1.38, 1.18, 1.0, 0.6, 0.03, -0.18);
    v.add(G.box, P.matte, cabCol, 0, 1.25, 0.2, 1.2, 0.95, 0.05);
  } else {
    // Rear passenger tub and the iconic canopy.
    v.add(G.rbox, P.paint, green, 0, 0.5, -0.45, 1.3, 0.42, 1.5);
    v.add(G.rbox, P.paint, yellow, 0, 0.82, -0.45, 1.32, 0.26, 1.52);
    v.add(G.rbox, P.cloth, black, 0, 1.73, -0.18, 1.36, 0.1, 2.1);
    v.add(tapered(1.32, 0.95, 0.06, 1, 1, 0, false), P.cloth, black, 0, 1.22, -1.2);
    for (const s of [-1, 1]) {
      v.add(G.cyl, P.chrome, 0x888888, s * 0.62, 1.32, 0.78, 0.025, 0.85, 0.025, -0.15);
      v.add(G.cyl, P.chrome, 0x888888, s * 0.64, 1.25, -0.05, 0.025, 0.95, 0.025);
      v.add(G.box, P.cloth, black, s * 0.62, 1.55, -0.45, 0.03, 0.32, 1.4);
    }
    v.add(G.box, P.glass, 0x2a3a40, 0, 1.38, 0.86, 1.1, 0.62, 0.03, -0.18);
    v.add(G.rbox, P.cloth, 0x2a2a2a, 0, 0.82, -0.62, 1.15, 0.2, 0.55);
    v.add(G.rbox, P.cloth, 0x2a2a2a, 0, 1.08, -0.9, 1.15, 0.5, 0.15);
    v.add(G.box, P.plastic, 0xd8d8d8, 0.38, 1.25, 0.62, 0.14, 0.16, 0.08); // fare meter
    v.add(G.box, P.head, 0xff3030, 0.38, 1.3, 0.665, 0.1, 0.03, 0.005);
  }
  v.add(G.rbox, P.cloth, 0x2a2a2a, 0, 0.98, goods ? 0.75 : 0.38, 0.45, 0.12, 0.4);
  v.add(G.sphere, P.head, 0xfff8e0, 0, 0.8, goods ? 1.53 : 1.13, 0.1, 0.1, 0.06);
  v.add(G.box, P.tail, 0xc81010, 0.45, 0.6, goods ? -1.47 : -1.22, 0.12, 0.08, 0.03);
  v.add(G.box, P.tail, 0xc81010, -0.45, 0.6, goods ? -1.47 : -1.22, 0.12, 0.08, 0.03);
  plate(v, goods ? -1.48 : -1.23, 0.42, true, 0.4, -1);
  const fz = goods ? 1.3 : 0.95, rz = goods ? -0.85 : -0.8;
  const s = v.wheel(0, 0.22, fz, 0.22, 0.12, true);
  v.add(G.cyl, P.chrome, 0x999999, 0, 1.15, fz - 0.19, 0.02, 0.6, 0.02, 0, Math.PI / 2, 0, s); // handlebar steers
  v.wheel(0.6, 0.22, rz, 0.22, 0.14, false); v.wheel(-0.6, 0.22, rz, 0.22, 0.14, false);
  return v.finish(spec, { driverSeat: [0, 0.98, goods ? 0.75 : 0.38] });
}

function buildTwoWheeler(type, r, opts) {
  const spec = VEHICLE_TYPES[type];
  const v = new VB();
  if (type === 'bike') {
    const colour = opts.color ?? pick([0x111111, 0x5a1a1a, 0x1a2a4a, 0x3a4a2a, 0x8a8a8a], r);
    v.add(tapered(0.3, 0.22, 0.55, 0.8, 0.9, 0), P.paint, colour, 0, 0.95, 0.15); // fuel tank
    v.add(G.box, P.chrome, 0xd0d0d0, 0, 0.98, 0.15, 0.02, 0.2, 0.5); // tank stripe
    v.add(G.rbox, P.cloth, 0x2a1a10, 0, 0.88, -0.35, 0.3, 0.1, 0.62);
    v.add(G.box, P.matte, 0x2a2a2a, 0, 0.55, 0, 0.26, 0.35, 0.5); // engine
    v.add(G.cyl, P.chrome, 0xc0c0c0, 0, 0.6, 0, 0.12, 0.3, 0.12, 0, Math.PI / 2);
    v.add(G.cyl, P.chrome, 0xd0d0d0, -0.2, 0.38, -0.45, 0.05, 0.9, 0.05, Math.PI / 2 - 0.15); // exhaust
    v.add(G.rbox, P.paint, colour, 0, 0.78, -0.78, 0.18, 0.06, 0.45); // rear mudguard
    v.add(G.box, P.tail, 0xc81010, 0, 0.8, -1.02, 0.12, 0.06, 0.04);
    const s = v.wheel(0, 0.33, 0.7, 0.33, 0.1, true, { hub: 0.25 });
    v.add(G.cyl, P.chrome, 0xb0b0b0, 0.07, 0.75, 0.62, 0.02, 0.8, 0.02, -0.3, 0, 0, s);
    v.add(G.cyl, P.chrome, 0xb0b0b0, -0.07, 0.75, 0.62, 0.02, 0.8, 0.02, -0.3, 0, 0, s);
    v.add(G.cyl, P.chrome, 0x999999, 0, 1.12, 0.5, 0.018, 0.72, 0.018, 0, Math.PI / 2, 0, s);
    v.add(G.cyl, P.head, 0xfff8e0, 0, 1.0, 0.68, 0.09, 0.06, 0.09, Math.PI / 2, 0, 0, s);
    v.wheel(0, 0.33, -0.72, 0.33, 0.13, false, { hub: 0.25 });
    plate(v, -1.04, 0.66, false, 0.24, -1);
    return v.finish(spec, { color: colour });
  }
  const colour = opts.color ?? pick([0xf2f2f2, 0x202224, 0xb01c22, 0x1c3a7a, 0x8a8e92, 0x3a6a3a, 0xe0a020, 0x6aa0c0], r);
  v.add(G.box, P.matte, 0x222222, 0, 0.32, 0.1, 0.36, 0.06, 0.65); // floorboard
  v.add(tapered(0.42, 0.42, 0.8, 0.9, 0.85, 0.02), P.paint, colour, 0, 0.52, -0.42);
  v.add(G.rbox, P.cloth, 0x1a1a1a, 0, 0.8, -0.3, 0.32, 0.1, 0.72);
  v.add(G.box, P.tail, 0xc81010, 0, 0.62, -0.84, 0.18, 0.06, 0.03);
  plate(v, -0.86, 0.45, false, 0.24, -1);
  if (type === 'delivery') {
    // Insulated food box on the back.
    const boxCol = opts.boxColor ?? pick([0xe8601a, 0xd0202a, 0x2a2a2a, 0x18a050], r);
    v.add(G.rbox, P.plastic, boxCol, 0, 1.12, -0.62, 0.45, 0.42, 0.42);
    v.add(G.box, P.matte, 0x111111, 0, 0.88, -0.62, 0.3, 0.06, 0.3);
  }
  const s = v.wheel(0, 0.24, 0.62, 0.24, 0.1, true, { hub: 0.5 });
  v.add(tapered(0.4, 0.95, 0.22, 0.7, 1, 0.08), P.paint, colour, 0, 0.72, 0.58, 1, 1, 1, 0, 0, 0, s); // front apron
  v.add(G.cyl, P.chrome, 0x999999, 0, 1.12, 0.62, 0.02, 0.62, 0.02, 0, Math.PI / 2, 0, s);
  v.add(G.rbox, P.paint, colour, 0, 1.12, 0.66, 0.3, 0.12, 0.16, 0, 0, 0, s);
  v.add(G.sphere, P.head, 0xfff8e0, 0, 1.08, 0.75, 0.07, 0.07, 0.04, 0, 0, 0, s);
  v.add(G.rbox, P.paint, colour, 0, 0.38, 0.62, 0.16, 0.12, 0.42, 0, 0, 0, s);
  for (const x of [-0.22, 0.22]) v.add(G.box, P.glass, 0x333a40, x, 1.32, 0.6, 0.06, 0.04, 0.01, 0, 0, 0, s); // mirrors
  v.wheel(0, 0.24, -0.62, 0.24, 0.12, false, { hub: 0.5 });
  return v.finish(spec, { color: colour });
}

// BMTC buses in their real liveries: blue Ordinary, red Volvo Vajra, teal Vayu Vajra (airport),
// white-green-blue electric and orange-blue Metro Feeder. The sides are painted in liveries.js.
function buildBmtc(r, opts) {
  const spec = VEHICLE_TYPES.bus;
  const v = new VB();
  const L = spec.length, W = spec.width, H = 2.9, base = 0.4;
  const livery = opts.livery ?? pickBusLivery(r);
  const lv = BUS_LIVERIES[livery];
  v.add(new RoundedBoxGeometry(W, H, L, 2, 0.2), P.paint, lv.body, 0, base + H / 2, 0);
  // Glass band (the side decals leave the panes clear), windscreen and rear window.
  v.add(G.box, P.glass, 0x141a20, 0, base + H * 0.7, -0.3, W + 0.03, H * 0.34, L - 1.6);
  v.add(G.box, P.glass, 0x141a20, 0, base + H * 0.62, L / 2 + 0.005, W - 0.16, H * 0.5, 0.04);
  v.add(G.box, P.glass, 0x141a20, 0, base + H * 0.75, -L / 2 - 0.005, W - 0.4, H * 0.3, 0.04);
  // Front: livery-coloured lower panel, black bumper, roof cap.
  v.add(G.box, P.paint, lv.frontLow, 0, base + H * 0.2, L / 2 + 0.012, W - 0.06, H * 0.34, 0.02);
  if (livery === 'vajra') v.add(G.box, P.paint, 0xffffff, 0, base + H * 0.33, L / 2 + 0.024, W - 0.3, 0.05, 0.01);
  if (livery === 'ev') v.add(G.box, P.paint, 0x1f4ea8, 0, base + H * 0.05, L / 2 + 0.024, W - 0.1, 0.16, 0.01);
  if (livery === 'feeder') v.add(G.box, P.paint, 0xffffff, 0, base + H * 0.37, L / 2 + 0.024, W - 0.1, 0.05, 0.01);
  v.add(G.box, P.paint, lv.roof, 0, base + H * 0.93, L / 2 + 0.012, W - 0.06, H * 0.12, 0.02);
  // Roof-mounted AC (electric buses carry battery pods up there too).
  v.add(G.rbox, P.plastic, lv.ac, 0, base + H + 0.14, -1, 1.7, 0.28, livery === 'ev' ? 4.2 : 3);
  if (livery === 'ev') v.add(G.rbox, P.plastic, lv.ac, 0, base + H + 0.12, 3.2, 1.9, 0.24, 1.6);
  v.add(G.box, P.matte, 0x222222, 0, base + 0.15, L / 2 + 0.05, W, 0.35, 0.15);
  v.add(G.box, P.matte, 0x222222, 0, base + 0.15, -L / 2 - 0.05, W, 0.35, 0.15);
  for (const s of [-1, 1]) {
    v.add(G.box, P.head, 0xfff8e0, s * (W / 2 - 0.35), base + 0.45, L / 2 + 0.03, 0.34, 0.14, 0.04);
    v.add(G.box, P.tail, 0xc81010, s * (W / 2 - 0.25), base + 0.55, -L / 2 - 0.02, 0.2, 0.3, 0.04);
    v.add(G.rbox, P.matte, 0x222222, s * (W / 2 + 0.2), base + H * 0.7, L / 2 - 0.2, 0.08, 0.4, 0.06); // mirrors
  }
  plate(v, L / 2 + 0.09, base + 0.1, true, 0.55, 1);
  v.decal(`bus_${livery}_L`, W / 2 + 0.02, base + H / 2, 0, L - 0.2, H - 0.06, 'L');
  v.decal(`bus_${livery}_R`, -W / 2 - 0.02, base + H / 2, 0, L - 0.2, H - 0.06, 'R');
  v.decal(pick(lv.boards, r).name, 0, base + H * 0.93, L / 2 + 0.03, 2.0, 0.34, 'F');
  // Wheels sit flush with the body side, in black wheel wells.
  const wr = 0.5, ww = 0.32;
  const wz = spec.wheelbase / 2 + 0.2, wz2 = -spec.wheelbase / 2 + 0.2;
  for (const z of [wz, wz2]) for (const s of [-1, 1]) v.add(G.cyl, P.matte, 0x0c0c0c, s * (W / 2 + 0.004), wr, z, 0.6, 0.01, 0.6, 0, Math.PI / 2);
  const x1 = W / 2 - ww / 2 + 0.012, x2 = W / 2 - (ww + 0.1) / 2 + 0.012;
  v.wheel(x1, wr, wz, wr, ww, true, { hub: 0.62 }); v.wheel(-x1, wr, wz, wr, ww, true, { hub: 0.62 });
  v.wheel(x2, wr, wz2, wr, ww + 0.1, false, { hub: 0.62 }); v.wheel(-x2, wr, wz2, wr, ww + 0.1, false, { hub: 0.62 });
  return v.finish(spec, { livery });
}

// School buses and tempo travellers.
function buildBus(type, r, opts) {
  if (type === 'bus') return buildBmtc(r, opts);
  const spec = VEHICLE_TYPES[type];
  const v = new VB();
  const L = spec.length, W = spec.width;
  const school = type === 'schoolBus', tempo = type === 'tempo';
  const livery = school ? 'school' : 'tempo';
  const [main, stripe] = { school: [0xf2b800, 0x2a2a2a], tempo: [0xf2f2f2, 0x1c3a7a] }[livery];
  const H = tempo ? 2.2 : 2.9, base = tempo ? 0.35 : 0.4;
  v.add(new RoundedBoxGeometry(W, H, L, 2, tempo ? 0.25 : 0.2), P.paint, main, 0, base + H / 2, 0);
  if (tempo) v.add(tapered(W * 0.96, 0.6, 1.2, 0.9, 0.6, -0.2), P.paint, main, 0, base + 0.55, L / 2 + 0.3);
  v.add(G.box, P.paint, stripe, 0, base + H * 0.28, 0, W + 0.02, 0.3, L - 0.4);
  v.add(G.box, P.glass, 0x1a2228, 0, base + H * 0.7, -0.3, W + 0.03, H * 0.34, L - 1.6);
  for (let z = -L / 2 + 1.5; z < L / 2 - 1; z += tempo ? 1.0 : 1.3) for (const s of [-1, 1]) v.add(G.box, P.paint, main, s * (W / 2 + 0.017), base + H * 0.7, z, 0.01, H * 0.34, 0.08);
  v.add(G.box, P.glass, 0x1a2228, 0, base + H * 0.62, L / 2 + 0.005, W - 0.2, H * 0.5, 0.04);
  v.add(G.box, P.glass, 0x1a2228, 0, base + H * 0.75, -L / 2 - 0.005, W - 0.4, H * 0.3, 0.04);
  if (school) {
    v.add(G.box, P.matte, 0x2a2a2a, W / 2 + 0.01, base + H * 0.45, L / 2 - 1.2, 0.03, H * 0.8, 1.1); // kerb-side door
    v.add(G.box, P.plastic, 0xd8d8d8, 0, base + H + 0.12, -1, 1.6, 0.25, 3); // roof AC unit
  }
  v.add(G.box, P.matte, 0x222222, 0, base + 0.15, L / 2 + 0.05, W, 0.35, 0.15);
  v.add(G.box, P.matte, 0x222222, 0, base + 0.15, -L / 2 - 0.05, W, 0.35, 0.15);
  for (const s of [-1, 1]) {
    v.add(G.box, P.head, 0xfff8e0, s * (W / 2 - 0.35), base + 0.45, L / 2 + 0.02, 0.3, 0.16, 0.04);
    v.add(G.box, P.tail, 0xc81010, s * (W / 2 - 0.25), base + 0.55, -L / 2 - 0.02, 0.2, 0.3, 0.04);
    v.add(G.rbox, P.matte, 0x222222, s * (W / 2 + 0.2), base + H * 0.7, L / 2 - 0.2, 0.08, 0.4, 0.06); // mirrors
  }
  plate(v, L / 2 + 0.09, base + 0.1, !school || true, 0.55, 1);
  if (school) { v.decal('school', W / 2 + 0.02, base + H * 0.42, 0, 2.6, 0.62, 'L'); v.decal('school', -W / 2 - 0.02, base + H * 0.42, 0, 2.6, 0.62, 'R'); v.decal('school', 0, base + H * 0.95, L / 2 + 0.03, 1.6, 0.38, 'F'); }
  const wr = tempo ? 0.38 : 0.5, ww = tempo ? 0.24 : 0.32;
  const wz = spec.wheelbase / 2 + (tempo ? 0.1 : 0.2), wz2 = -spec.wheelbase / 2 + (tempo ? 0.1 : 0.2);
  v.wheel(W / 2 - 0.3, wr, wz, wr, ww, true); v.wheel(-W / 2 + 0.3, wr, wz, wr, ww, true);
  v.wheel(W / 2 - 0.3, wr, wz2, wr, ww + 0.1, false); v.wheel(-W / 2 + 0.3, wr, wz2, wr, ww + 0.1, false);
  return v.finish(spec, { livery });
}

// Lorries, water tankers and Tata Ace-style mini trucks.
function buildTruck(type, r, opts) {
  const spec = VEHICLE_TYPES[type];
  const v = new VB();
  const L = spec.length, W = spec.width;
  const mini = type === 'miniTruck', tanker = type === 'tanker';
  const cabCol = opts.color ?? (mini ? pick([0xf2f2f2, 0xe8e0d0, 0x2a6ab0], r) : pick([0xd06a1a, 0x2a6ab0, 0xc0182a, 0x2a8a4a, 0xf2c200], r));
  const cabL = mini ? 1.25 : 2.0, cabH = mini ? 1.25 : 1.9, base = mini ? 0.35 : 0.6;
  const cz = L / 2 - cabL / 2;
  v.add(G.rbox, P.paint, cabCol, 0, base + cabH / 2, cz, W, cabH, cabL);
  v.add(G.box, P.glass, 0x1a2228, 0, base + cabH * 0.72, L / 2 + 0.005, W * 0.86, cabH * 0.36, 0.04, -0.08);
  for (const s of [-1, 1]) v.add(G.box, P.glass, 0x1a2228, s * (W / 2 + 0.005), base + cabH * 0.7, cz + 0.1, 0.02, cabH * 0.32, cabL * 0.5);
  if (!mini) {
    // Painted truck art: a garland of colour across the cab top, chrome grille, mud flaps.
    v.add(G.box, P.paint, 0xf2c200, 0, base + cabH + 0.15, cz + 0.2, W * 1.02, 0.3, cabL * 0.8);
    for (let k = 0; k < 6; k++) v.add(G.box, P.paint, [0xc0182a, 0x18a050, 0x2a4ac0][k % 3], -W / 2 + 0.2 + k * (W - 0.4) / 5, base + cabH + 0.3, cz + cabL * 0.42, 0.18, 0.12, 0.05);
    v.add(G.box, P.chrome, 0xd0d0d0, 0, base + 0.5, L / 2 + 0.01, W * 0.7, 0.5, 0.04);
  }
  const bedL = L - cabL - 0.2, bz = -L / 2 + bedL / 2;
  v.add(G.box, P.matte, 0x2a2a2a, 0, base + 0.05, bz, W * 0.8, 0.2, bedL + 0.2); // chassis
  if (tanker) {
    const t = new THREE.CylinderGeometry(1, 1, 1, 18); t.rotateX(Math.PI / 2);
    v.add(t, P.paint, opts.tankColor ?? pick([0x2a6ab0, 0xe8e0d0, 0x2a8a4a], r), 0, base + 1.15, bz, W * 0.46, 0.95, bedL);
    v.decal('water', W * 0.47, base + 1.2, bz, 3.2, 0.8, 'L');
    v.decal('water', -W * 0.47, base + 1.2, bz, 3.2, 0.8, 'R');
  } else {
    const bedCol = mini ? cabCol : pick([0x2a6ab0, 0xd06a1a, 0x2a8a4a], r);
    const sideH = mini ? 0.45 : 1.3;
    v.add(G.box, P.matte, 0x5a4a3a, 0, base + 0.2, bz, W, 0.1, bedL);
    for (const s of [-1, 1]) v.add(G.box, P.paint, bedCol, s * W / 2, base + 0.25 + sideH / 2, bz, 0.05, sideH, bedL);
    v.add(G.box, P.paint, bedCol, 0, base + 0.25 + sideH / 2, -L / 2 + 0.03, W, sideH, 0.05);
    // Load under a tarp.
    v.add(G.rboxS, P.cloth, pick([0x2a4a8a, 0x8a6a4a, 0x3a6a3a, 0xd0b080, 0xb02a2a], r), 0, base + 0.25 + sideH * 0.7, bz, W * 0.95, sideH * (mini ? 1.3 : 1.0), bedL * 0.95);
    if (!mini) v.decal('hornOk', 0, base + 0.55, -L / 2 - 0.01, 1.8, 0.45, 'B');
  }
  for (const s of [-1, 1]) {
    v.add(G.box, P.head, 0xfff8e0, s * (W / 2 - 0.3), base + 0.35, L / 2 + 0.02, 0.24, 0.14, 0.04);
    v.add(G.box, P.tail, 0xc81010, s * (W / 2 - 0.2), base + 0.3, -L / 2 - 0.04, 0.18, 0.14, 0.04);
  }
  plate(v, -L / 2 - 0.06, base + 0.15, true, 0.5, -1);
  plate(v, L / 2 + 0.05, base + 0.2, true, 0.5, 1);
  const wr = mini ? 0.3 : 0.52, ww = mini ? 0.18 : 0.32;
  const wz = L / 2 - cabL * 0.55, wz2 = wz - spec.wheelbase;
  v.wheel(W / 2 - 0.25, wr, wz, wr, ww, true); v.wheel(-W / 2 + 0.25, wr, wz, wr, ww, true);
  v.wheel(W / 2 - 0.25, wr, wz2, wr, ww + 0.12, false); v.wheel(-W / 2 + 0.25, wr, wz2, wr, ww + 0.12, false);
  return v.finish(spec, { color: cabCol });
}

export function buildVehicleModel(type, r = Math.random, opts = {}) {
  switch (type) {
    case 'auto': case 'goodsAuto': return buildAuto(type, r, opts);
    case 'scooter': case 'delivery': case 'bike': return buildTwoWheeler(type, r, opts);
    case 'bus': case 'schoolBus': case 'tempo': return buildBus(type, r, opts);
    case 'lorry': case 'tanker': case 'miniTruck': return buildTruck(type, r, opts);
    default: return buildCar(type, r, opts);
  }
}

export { textTexture };
