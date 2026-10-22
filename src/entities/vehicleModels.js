// Procedural vehicle models. Each vehicle is ONE skinned mesh (wheels are bones) using a
// shared material whose roughness/metalness/glow come from vertex attributes.
// All models face +z. Kerb side (left, India) is +x.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MeshBuilder, buildSkinned, makePbrMaterial } from '../world/meshBuilder.js';
import { put } from '../world/landmarks.js';
import { textTexture } from '../world/textures.js';
import { decalAtlas, decalUV, BUS_LIVERIES, pickBusLivery } from './liveries.js';
import { CAR_MODELS, TYPE_MODELS, buildCarShell } from './carBodies.js';

// horn: profile key in systems/audio.js. stall: water depth (m) that floods the engine.
export const VEHICLE_TYPES = {
  scooter: { label: 'Scooter', length: 1.85, width: 0.72, wheelbase: 1.25, maxSpeed: 22, accel: 6.5, brake: 12, reverse: 1.5, steer: 0.6, grip: 10, mass: 130, twoWheeler: true, cam: 4.2, horn: 'scooter', engine: 'scooter', seatY: 0.78, stall: 0.35 },
  delivery: { label: 'Delivery Scooter', length: 1.85, width: 0.72, wheelbase: 1.25, maxSpeed: 23, accel: 6.8, brake: 12, reverse: 1.5, steer: 0.6, grip: 10, mass: 135, twoWheeler: true, cam: 4.4, horn: 'scooterHi', engine: 'scooter', seatY: 0.78, stall: 0.35 },
  eScooter: { label: 'Ather Electric Scooter', length: 1.84, width: 0.74, wheelbase: 1.3, maxSpeed: 25, accel: 8.5, brake: 12.5, reverse: 1.5, steer: 0.6, grip: 10.5, mass: 118, twoWheeler: true, cam: 4.2, horn: 'scooterHi', engine: 'ev', seatY: 0.78, stall: 0.3 },
  sportsBike: { label: 'KTM Duke', length: 2.0, width: 0.82, wheelbase: 1.36, maxSpeed: 42, accel: 10, brake: 15, reverse: 1.5, steer: 0.55, grip: 11, mass: 172, twoWheeler: true, cam: 4.6, horn: 'bike', engine: 'sport', seatY: 0.84, stall: 0.45 },
  bike: { label: 'Royal Bullet', length: 2.15, width: 0.8, wheelbase: 1.4, maxSpeed: 31, accel: 7.5, brake: 13, reverse: 1.5, steer: 0.55, grip: 10, mass: 195, twoWheeler: true, cam: 4.6, horn: 'bike', engine: 'bike', seatY: 0.8, stall: 0.45 },
  auto: { label: 'Auto Rickshaw', length: 2.65, width: 1.35, wheelbase: 1.9, maxSpeed: 15.5, accel: 3.8, brake: 9, reverse: 3, steer: 0.65, grip: 8, mass: 350, cam: 5.2, horn: 'auto', engine: 'auto', seatY: 0.92, stall: 0.45 },
  goodsAuto: { label: 'Goods Auto', length: 3.1, width: 1.45, wheelbase: 2.0, maxSpeed: 13, accel: 3, brake: 9, reverse: 3, steer: 0.6, grip: 8, mass: 520, cam: 5.8, horn: 'autoLow', engine: 'auto', seatY: 0.95, stall: 0.5 },
  hatch: { label: 'Hatchback', length: 3.8, width: 1.7, wheelbase: 2.4, maxSpeed: 40, accel: 7, brake: 14, reverse: 6, steer: 0.55, grip: 9, mass: 1000, cam: 6.5, horn: 'car', engine: 'car', stall: 0.55 },
  sedan: { label: 'Sedan', length: 4.4, width: 1.75, wheelbase: 2.65, maxSpeed: 44, accel: 7.5, brake: 14, reverse: 6, steer: 0.52, grip: 9, mass: 1200, cam: 6.8, horn: 'car2', engine: 'car', stall: 0.55 },
  taxi: { label: 'City Cab', length: 4.3, width: 1.72, wheelbase: 2.6, maxSpeed: 42, accel: 7.5, brake: 14, reverse: 6, steer: 0.52, grip: 9, mass: 1150, cam: 6.8, horn: 'carHi', engine: 'car', stall: 0.55 },
  suv: { label: 'SUV', length: 4.6, width: 1.86, wheelbase: 2.75, maxSpeed: 45, accel: 8, brake: 14, reverse: 6, steer: 0.5, grip: 8.5, mass: 1800, cam: 7.2, horn: 'suv', engine: 'car', stall: 0.8 },
  hoysala: { label: 'Hoysala (Ertiga)', length: 4.4, width: 1.73, wheelbase: 2.74, maxSpeed: 45, accel: 8.5, brake: 15, reverse: 6, steer: 0.55, grip: 9.5, mass: 1250, cam: 7, horn: 'police', engine: 'car', stall: 0.6, police: true },
  ambulance: { label: '108 Ambulance', length: 5.2, width: 1.95, wheelbase: 3.05, maxSpeed: 34, accel: 5.2, brake: 11, reverse: 4, steer: 0.5, grip: 8.5, mass: 2600, cam: 8.5, horn: 'tempo', engine: 'car', stall: 0.8, siren: true },
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
    let decalMesh = null;
    if (!this.decals.empty) {
      decalMesh = this.decals.build(decalAtlas(), { castShadow: false });
      group.add(decalMesh);
    }
    const wheels = this.wheels.map((w) => ({ steer: w.steerIdx >= 0 ? this.bones[w.steerIdx] : null, spin: this.bones[w.spinIdx], r: w.r }));
    return { group, mesh, decalMesh, wheels, spec, body: group, ...extra };
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

// Cars are real Indian models (carBodies.js): lofted shells plus lamps, grilles and trim.
const C = (hex) => new THREE.Color(hex);
const pickWeighted = (list, r) => { let t = list.reduce((s, [, w]) => s + w, 0) * r(); for (const [k, w] of list) if ((t -= w) <= 0) return k; return list[0][0]; };

function buildCar(type, r, opts) {
  const key = opts.model ?? pickWeighted(TYPE_MODELS[type] || TYPE_MODELS.sedan, r);
  const m = CAR_MODELS[key];
  const spec = { ...VEHICLE_TYPES[type], length: m.L, width: m.W, wheelbase: m.WB, label: type === 'hoysala' ? 'Hoysala (Maruti Suzuki Ertiga)' : type === 'taxi' ? `${m.label} (cab)` : m.label };
  const v = new VB();
  const police = type === 'hoysala';
  const pink = police && opts.pink;
  const taxi = type === 'taxi';
  let colour = opts.color ?? (taxi ? pick([0xf4f4f2, 0xf4f4f2, 0xf4f4f2, 0xd8d8d8], r) : pick(m.colours || CAR_COLOURS, r));
  if (police) colour = pink ? 0xe86aa6 : 0xf6f6f4;
  const black = { colour: C(0x0e0f10), pbr: P.plastic };
  const mats = { paint: { pbr: P.paint }, glass: { colour: C(0x141a20), pbr: P.glass }, black };
  const prof = buildCarShell(v.b, m, C(colour), mats);
  const { zf, zr, hw, top, bottom, zFA, zRA, zWs, roofY } = prof;
  const W = m.W, L = m.L;
  const yNose = top(zf - 0.12);
  // Wheel wells, so you can't see daylight through the arches.
  for (const zc of [zFA, zRA]) v.add(G.box, P.matte, 0x0a0a0a, 0, m.wr + 0.12, zc, W - 0.22, m.wr * 1.3, prof.archR * 1.9);
  // Front: lamps, grille, intake, fog lamps.
  const hx = hw(zf - 0.1) * 0.66;
  for (const s of [-1, 1]) {
    if (m.lights === 'round') v.add(G.cyl, P.head, 0xfff6dc, s * hx, yNose - 0.1, zf - 0.03, 0.11, 0.08, 0.11, Math.PI / 2);
    else {
      const lh = m.lights === 'tall' ? 0.2 : m.lights === 'square' ? 0.13 : 0.1;
      const lw = m.lights === 'square' ? W * 0.2 : W * 0.25;
      v.add(G.box, P.head, 0xfff6dc, s * hx, yNose - lh / 2 - 0.03, zf - 0.11, lw, lh, 0.12, 0, 0, s * -0.32);
    }
    v.add(G.box, P.tail, 0xff8a10, s * hw(zf - 0.2) * 0.98, yNose - 0.12, zf - 0.2, 0.02, 0.04, 0.1); // side indicator
    v.add(G.cyl, P.head, 0xfff0d0, s * W * 0.33, 0.36, zf - 0.02, 0.05, 0.04, 0.05, Math.PI / 2); // fog lamp
  }
  const gy = yNose - 0.16;
  switch (m.grille) {
    case 'hex': v.add(G.box, P.plastic, 0x0c0c0c, 0, gy, zf - 0.01, W * 0.4, 0.16, 0.06); v.add(G.box, P.chrome, 0xc0c0c0, 0, gy + 0.02, zf + 0.02, 0.14, 0.07, 0.01); break;
    case 'chromeBar': v.add(G.box, P.plastic, 0x0c0c0c, 0, gy, zf - 0.01, W * 0.42, 0.15, 0.06); v.add(G.box, P.chrome, 0xd0d0d0, 0, gy + 0.05, zf + 0.025, W * 0.44, 0.03, 0.01); break;
    case 'toyota': v.add(G.box, P.chrome, 0xc8c8c8, 0, gy + 0.05, zf, W * 0.3, 0.05, 0.03); v.add(G.box, P.plastic, 0x0c0c0c, 0, 0.42, zf - 0.01, W * 0.5, 0.16, 0.06); break;
    case 'toyotaBig': v.add(G.box, P.chrome, 0x8a8a8a, 0, gy - 0.04, zf - 0.01, W * 0.5, 0.26, 0.06); for (let k = 0; k < 4; k++) v.add(G.box, P.chrome, 0xd8d8d8, 0, gy - 0.12 + k * 0.06, zf + 0.025, W * 0.48, 0.015, 0.01); break;
    case 'cascade': v.add(G.box, P.plastic, 0x111111, 0, gy - 0.05, zf - 0.01, W * 0.48, 0.25, 0.06); break;
    case 'mahindra': v.add(G.box, P.plastic, 0x111111, 0, gy, zf - 0.01, W * 0.42, 0.24, 0.06); for (let k = -3; k <= 3; k++) v.add(G.box, P.chrome, 0xd0d0d0, k * W * 0.055, gy, zf + 0.025, 0.025, 0.22, 0.01); break;
    case 'tata': v.add(G.box, P.plastic, 0x0c0c0c, 0, gy, zf - 0.01, W * 0.44, 0.14, 0.06); v.add(G.box, P.chrome, 0xc0c0c0, 0, gy + 0.09, zf + 0.02, W * 0.6, 0.02, 0.01); break;
    default: v.add(G.box, P.plastic, 0x111111, 0, gy, zf - 0.01, W * 0.3, 0.08, 0.05);
  }
  v.add(G.box, P.plastic, 0x0c0c0c, 0, 0.3, zf - 0.04, W * 0.6, 0.12, 0.08); // lower intake
  v.add(G.box, P.plastic, 0x111111, 0, 0.24, zr + 0.05, W * 0.8, 0.08, 0.08); // rear diffuser strip
  // Rear lamps: on the boot lid for sedans, tall in the tailgate pillars for SUVs and MPVs.
  const yTail = top(zr + 0.15);
  for (const s of [-1, 1]) {
    if (m.style === 'sedan') v.add(G.box, P.tail, 0xc81010, s * hw(zr + 0.1) * 0.68, yTail - 0.09, zr + 0.06, W * 0.26, 0.12, 0.1);
    else if (m.style === 'hatch') v.add(G.box, P.tail, 0xc81010, s * hw(zr + 0.1) * 0.78, yTail - 0.02, zr + 0.08, 0.2, 0.22, 0.12);
    else v.add(G.box, P.tail, 0xc81010, s * hw(zr + 0.1) * 0.82, yTail + 0.1, zr + 0.06, 0.16, 0.36, 0.1);
    // Mirrors.
    v.add(G.box, P.paint, police || m.blackPillars ? 0x111111 : colour, s * (hw(zWs - 0.12) + 0.09), m.belt + 0.08, zWs - 0.12, 0.16, 0.1, 0.12);
    // Door shut lines and handles.
    const doors = m.style === 'hatch' && m.L < 3.6 ? [zWs - 0.05, zWs - 1.05] : [zWs - 0.05, zWs - 1.0, zWs - 1.85];
    for (const dz of doors) {
      if (dz < zRA + prof.archR + 0.02 && dz !== doors[0]) continue;
      v.add(G.box, P.matte, 0x111111, s * (hw(dz) + 0.004), (bottom(dz) + m.belt) / 2, dz, 0.004, m.belt - bottom(dz) - 0.06, 0.012);
      v.add(G.box, P.chrome, police ? 0x222222 : 0xbdbdbd, s * (hw(dz - 0.2) + 0.01), m.belt - 0.09, dz - 0.2, 0.02, 0.03, 0.12);
    }
    // SUV cladding over the arches and along the sills.
    if (m.cladding) {
      v.add(G.box, P.plastic, 0x1a1a1a, s * (hw(0) + 0.005), 0.36, (zFA + zRA) / 2, 0.02, 0.1, zFA - zRA - prof.archR * 2);
      for (const zc of [zFA, zRA]) v.add(G.cyl, P.plastic, 0x1a1a1a, s * (hw(zc) - 0.03), m.wr, zc, prof.archR + 0.05, 0.08, prof.archR + 0.05, 0, Math.PI / 2);
    }
    if (m.rails) v.add(G.box, P.chrome, 0x2a2a2a, s * (hw(0) * m.taper * 0.92), roofY + 0.04, (prof.zRoofEnd + prof.zWsTop) / 2, 0.04, 0.05, (prof.zWsTop - prof.zRoofEnd) * 0.9);
  }
  if (m.spare || m.label.includes('Bolero')) v.add(G.cyl, P.rubber, 0x161616, 0, 0.8, zr - 0.1, 0.32, 0.2, 0.32, Math.PI / 2); // spare wheel on the tailgate
  if (key === 'ambassador') {
    // The old warhorse: chrome bumpers and a rounded hump of a boot lid.
    v.add(G.box, P.chrome, 0xd8d8d8, 0, 0.36, zf + 0.02, W * 0.92, 0.1, 0.1);
    v.add(G.box, P.chrome, 0xd8d8d8, 0, 0.38, zr - 0.02, W * 0.92, 0.1, 0.1);
  }
  plate(v, zf + 0.01, 0.42, taxi, 0.5, 1);
  plate(v, zr - 0.01, m.style === 'sedan' ? yTail - 0.25 : 0.55, taxi, 0.5, -1);
  if (taxi) for (const s of [-1, 1]) v.decal('cab', s * (hw(-0.4) + 0.012), (bottom(-0.4) + m.belt) / 2 + 0.05, -0.4, 1.1, 0.27, s > 0 ? 'L' : 'R');
  if (police) {
    // Hoysala livery (painted in liveries.js) wrapped around the curved body.
    const y0 = 0.33, y1 = m.belt;
    v.decalWrap(pink ? 'pinkL' : 'hoysalaL', 'L', (y0 + y1) / 2, y1 - y0, zr + 0.06, zf - 0.06, hw);
    v.decalWrap(pink ? 'pinkR' : 'hoysalaR', 'R', (y0 + y1) / 2, y1 - y0, zr + 0.06, zf - 0.06, hw);
    const zb = (zWs + zf) / 2 - 0.05;
    v.decal('bonnet', 0, top(zb) + 0.012, zb, W * 0.55, (zf - zWs) * 0.42, 'T');
    v.decal(pink ? 'pinkText' : 'police', 0, yTail - 0.25, zr - 0.02, 1.2, 0.3, 'B');
    const lbz = (prof.zRoofEnd + prof.zWsTop) / 2 + 0.25;
    v.add(G.box, P.chrome, 0x222222, 0, roofY + 0.05, lbz, W * 0.78, 0.08, 0.3);
    v.add(G.box, P.plastic, 0xe8e8f0, 0, roofY + 0.14, lbz, W * 0.14, 0.1, 0.24);
  }
  // Wheels: alloys on newer cars, steel with covers on taxis and Boleros.
  const ww = m.W > 1.75 ? 0.23 : 0.2;
  const hub = { hub: 0.62, hubColor: taxi || m.label.includes('Bolero') ? 0x8a8e92 : 0xc8ccd0 };
  for (const zc of [zFA, zRA]) {
    const x = hw(zc) - ww / 2 + 0.01;
    v.wheel(x, m.wr, zc, m.wr, ww, zc === zFA, hub); v.wheel(-x, m.wr, zc, m.wr, ww, zc === zFA, hub);
  }
  const extra = { color: colour, spec, modelKey: key };
  if (police) extra.lightBar = { y: roofY + 0.14, z: (prof.zRoofEnd + prof.zWsTop) / 2 + 0.25, w: W * 0.3 };
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
  if (type === 'sportsBike') {
    // A naked street bike: angular tank and shrouds, a high stubby tail, an exhaust tucked under
    // the belly, upside-down forks and a small sharp headlamp.
    const colour = opts.color ?? pick([0xf26a10, 0xf26a10, 0x111111, 0xf2f2f2, 0x1c3a9a], r);
    const trim = colour === 0xf26a10 ? 0x111111 : 0xf26a10;
    v.add(tapered(0.34, 0.24, 0.5, 0.75, 0.8, -0.04), P.paint, colour, 0, 1.0, 0.18); // tank
    for (const sx of [-1, 1]) v.add(G.box, P.paint, trim, sx * 0.17, 0.92, 0.36, 0.03, 0.2, 0.3, 0, sx * 0.25); // shrouds
    v.add(G.rbox, P.cloth, 0x1a1a1a, 0, 0.92, -0.25, 0.26, 0.08, 0.42);
    v.add(tapered(0.22, 0.12, 0.42, 0.6, 0.8, -0.06), P.paint, colour, 0, 0.98, -0.6, 1, 1, 1, -0.25); // tail
    v.add(G.box, P.matte, 0x2a2a2a, 0, 0.55, 0.02, 0.24, 0.32, 0.45); // engine
    v.add(G.box, P.paint, trim, 0, 0.62, 0.05, 0.3, 0.06, 0.6); // trellis frame
    v.add(G.rbox, P.chrome, 0x3a3a3a, 0, 0.33, -0.15, 0.2, 0.14, 0.42); // belly exhaust
    v.add(G.box, P.tail, 0xc81010, 0, 1.02, -0.83, 0.1, 0.04, 0.03);
    const s = v.wheel(0, 0.31, 0.68, 0.31, 0.11, true, { hub: 0.22, hubColor: colour === 0xf26a10 ? 0xf26a10 : 0x222222 });
    for (const sx of [-1, 1]) v.add(G.cyl, P.paint, 0xf26a10, sx * 0.075, 0.74, 0.6, 0.028, 0.82, 0.028, -0.4, 0, 0, s);
    v.add(G.cyl, P.chrome, 0x222222, 0, 1.13, 0.47, 0.016, 0.72, 0.016, 0, Math.PI / 2, 0, s);
    v.add(tapered(0.18, 0.16, 0.12, 0.7, 1, 0.02), P.paint, 0x1a1a1a, 0, 1.0, 0.68, 1, 1, 1, 0, 0, 0, s);
    v.add(G.box, P.head, 0xfff8e0, 0, 1.0, 0.745, 0.11, 0.06, 0.02, 0, 0, 0, s);
    v.wheel(0, 0.31, -0.68, 0.31, 0.15, false, { hub: 0.22, hubColor: colour === 0xf26a10 ? 0xf26a10 : 0x222222 });
    v.add(G.cyl, P.paint, trim, 0, 0.45, -0.38, 0.03, 0.62, 0.03, Math.PI / 2 + 0.2); // swingarm
    plate(v, -0.92, 0.82, false, 0.22, -1);
    return v.finish(spec, { color: colour });
  }
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
  const ev = type === 'eScooter';
  const colour = opts.color ?? (ev ? pick([0xf2f3f2, 0x8a9096, 0x2a2d30, 0x3cc47c, 0xb01c22], r) : pick([0xf2f2f2, 0x202224, 0xb01c22, 0x1c3a7a, 0x8a8e92, 0x3a6a3a, 0xe0a020, 0x6aa0c0], r));
  v.add(G.box, P.matte, 0x222222, 0, 0.32, 0.1, 0.36, 0.06, 0.65); // floorboard
  if (ev) {
    // Electric: the battery under the floor, a slim LED tail and the brand on both side panels.
    v.add(G.rbox, P.plastic, 0x2a2d30, 0, 0.24, 0.0, 0.32, 0.12, 0.8);
    v.decal('ather', 0.215, 0.6, -0.42, 0.42, 0.06, 'L');
    v.decal('ather', -0.215, 0.6, -0.42, 0.42, 0.06, 'R');
    v.add(G.box, P.tail, 0xc81010, 0, 0.74, -0.84, 0.3, 0.025, 0.03);
  }
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
  if (ev) v.add(G.box, P.head, 0x6ad0ff, 0, 1.2, 0.6, 0.16, 0.01, 0.1, -0.5, 0, 0, s); // touchscreen dash
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
  const amb = type === 'ambulance';
  const school = type === 'schoolBus', tempo = type === 'tempo' || amb;
  const livery = school ? 'school' : amb ? 'ambulance' : 'tempo';
  const [main, stripe] = { school: [0xf2b800, 0x2a2a2a], tempo: [0xf2f2f2, 0x1c3a7a], ambulance: [0xf6f6f4, 0xd4151f] }[livery];
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
  if (amb) {
    // 108: the red band carries the name, the bonnet the mirror-written word, a light bar on the roof.
    v.decal('amb108', W / 2 + 0.02, base + H * 0.28, -0.2, L - 1.4, 0.3, 'L');
    v.decal('amb108', -W / 2 - 0.02, base + H * 0.28, -0.2, L - 1.4, 0.3, 'R');
    v.decal('ambFront', 0, base + H * 0.935, L / 2 + 0.02, 1.1, 0.13, 'F');
    v.add(G.box, P.chrome, 0x222222, 0, base + H + 0.02, L / 2 - 0.9, W * 0.8, 0.08, 0.3);
    v.add(G.box, P.plastic, 0xe8e8f0, 0, base + H + 0.1, L / 2 - 0.9, W * 0.12, 0.1, 0.24);
  }
  if (school) { v.decal('school', W / 2 + 0.02, base + H * 0.42, 0, 2.6, 0.62, 'L'); v.decal('school', -W / 2 - 0.02, base + H * 0.42, 0, 2.6, 0.62, 'R'); v.decal('school', 0, base + H * 0.95, L / 2 + 0.03, 1.6, 0.38, 'F'); }
  const wr = tempo ? 0.38 : 0.5, ww = tempo ? 0.24 : 0.32;
  const wz = spec.wheelbase / 2 + (tempo ? 0.1 : 0.2), wz2 = -spec.wheelbase / 2 + (tempo ? 0.1 : 0.2);
  v.wheel(W / 2 - 0.3, wr, wz, wr, ww, true); v.wheel(-W / 2 + 0.3, wr, wz, wr, ww, true);
  v.wheel(W / 2 - 0.3, wr, wz2, wr, ww + 0.1, false); v.wheel(-W / 2 + 0.3, wr, wz2, wr, ww + 0.1, false);
  return v.finish(spec, { livery, ...(amb && { lightBar: { y: base + H + 0.1, z: L / 2 - 0.9, w: W * 0.3 } }) });
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
    case 'scooter': case 'delivery': case 'bike': case 'eScooter': case 'sportsBike': return buildTwoWheeler(type, r, opts);
    case 'bus': case 'schoolBus': case 'tempo': case 'ambulance': return buildBus(type, r, opts);
    case 'lorry': case 'tanker': case 'miniTruck': return buildTruck(type, r, opts);
    default: return buildCar(type, r, opts);
  }
}

export { textTexture };
