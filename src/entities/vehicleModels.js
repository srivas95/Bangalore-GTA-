// Procedural vehicle models. All face +z. Index-coloured parts merged per material.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BuilderSet } from '../world/meshBuilder.js';
import { put } from '../world/landmarks.js';

export const VEHICLE_TYPES = {
  scooter: { label: 'Scooter', length: 1.85, width: 0.75, wheelbase: 1.25, maxSpeed: 22, accel: 6.5, brake: 12, reverse: 1.5, steer: 0.6, grip: 10, mass: 130, twoWheeler: true, cam: 4.2, sound: 'scooter', seatY: 0.78 },
  auto: { label: 'Auto Rickshaw', length: 2.65, width: 1.35, wheelbase: 1.9, maxSpeed: 15.5, accel: 3.8, brake: 9, reverse: 3, steer: 0.65, grip: 8, mass: 350, cam: 5.2, sound: 'auto', seatY: 0.92 },
  hatch: { label: 'Hatchback', length: 3.8, width: 1.7, wheelbase: 2.4, maxSpeed: 40, accel: 7, brake: 14, reverse: 6, steer: 0.55, grip: 9, mass: 1000, cam: 6.5, sound: 'car' },
  taxi: { label: 'City Cab', length: 4.3, width: 1.72, wheelbase: 2.6, maxSpeed: 42, accel: 7.5, brake: 14, reverse: 6, steer: 0.52, grip: 9, mass: 1150, cam: 6.8, sound: 'car' },
  suv: { label: 'SUV', length: 4.6, width: 1.86, wheelbase: 2.75, maxSpeed: 45, accel: 8, brake: 14, reverse: 6, steer: 0.5, grip: 8.5, mass: 1800, cam: 7.2, sound: 'car' },
  bus: { label: 'BMTC Bus', length: 11.5, width: 2.55, wheelbase: 6.2, maxSpeed: 20, accel: 2.2, brake: 7, reverse: 3, steer: 0.55, grip: 7, mass: 11000, cam: 15, sound: 'bus' },
};

export const vehicleMaterials = {
  paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.45, envMapIntensity: 1.1 }),
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.4 }),
  chrome: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 1.0 }),
  light: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.0 }),
};

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 2, 0.12),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  sphere: new THREE.SphereGeometry(1, 10, 6),
};

// Box whose top face is narrowed/shifted: good for windscreens and cabins.
function taperedBox(w, h, d, topX, topZ, shiftZ, rounded = true) {
  const g = rounded ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.12, h * 0.25)) : new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const t = (p.getY(k) + h / 2) / h;
    p.setX(k, p.getX(k) * (1 + (topX - 1) * t));
    p.setZ(k, p.getZ(k) * (1 + (topZ - 1) * t) + shiftZ * t);
  }
  g.computeVertexNormals();
  return g;
}

const CAR_COLOURS = [0xf2f2f2, 0xf2f2f2, 0xc0c4c8, 0x8a8e92, 0x202224, 0xb01c22, 0x1c3a7a, 0xe0d8c8, 0x5a2a1a, 0x2a5a4a];
const pick = (a, r) => a[Math.floor(r() * a.length)];

function makeWheel(radius, width, hubColor = 0xa8a8a8) {
  const b = new BuilderSet();
  const tyre = new THREE.CylinderGeometry(radius, radius, width, 14);
  tyre.rotateZ(Math.PI / 2);
  b.get('matte').addGeometry(tyre, new THREE.Matrix4(), 0x161616);
  const hub = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 8);
  hub.rotateZ(Math.PI / 2);
  b.get('chrome').addGeometry(hub, new THREE.Matrix4(), hubColor);
  const g = new THREE.Group();
  b.buildAll(vehicleMaterials, g);
  g.children.forEach((m) => (m.castShadow = true));
  return g;
}

function plate(B, z, y, yellow, w = 0.5) {
  B.get('matte').box(0, y, z, w, 0.13, 0.02, yellow ? 0xf2c200 : 0xf4f4f4);
}

function finish(B, spec, wheelDefs, extra = {}) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const body = new THREE.Group();
  B.buildAll(vehicleMaterials, body);
  body.children.forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
  group.add(body);
  const wheels = wheelDefs.map(([x, y, z, r, w, steer]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const wheel = makeWheel(r, w);
    pivot.add(wheel);
    body.add(pivot);
    return { pivot, wheel, steer, r };
  });
  return { group, body, wheels, spec, ...extra };
}

function buildCar(type, r, opts) {
  const spec = VEHICLE_TYPES[type];
  const B = new BuilderSet();
  const L = spec.length, W = spec.width;
  const colour = opts.color ?? (type === 'taxi' ? pick([0xf2f2f2, 0xf2f2f2, 0xd8d8d8, 0xf2c200], r) : pick(CAR_COLOURS, r));
  const suv = type === 'suv';
  const lowH = suv ? 0.85 : 0.7, cabH = suv ? 0.72 : 0.6;
  const y0 = suv ? 0.42 : 0.3;
  const p = B.get('paint'), g = B.get('glass'), m = B.get('matte'), l = B.get('light'), c = B.get('chrome');
  put(p, G.rbox, 0, y0 + lowH / 2, 0, colour, 0, W, lowH, L);
  const cabL = type === 'hatch' ? L * 0.6 : L * 0.5;
  const cabZ = type === 'hatch' ? -L * 0.1 : -L * 0.04;
  const cab = taperedBox(W * 0.94, cabH, cabL, suv ? 0.95 : 0.88, suv ? 0.85 : 0.7, suv ? 0 : -0.05);
  put(g, cab, 0, y0 + lowH + cabH / 2 - 0.02, cabZ, 0x1a2228);
  // Roof and pillars in body colour.
  put(p, taperedBox(W * 0.9, 0.06, cabL * (suv ? 0.85 : 0.7), 1, 1, 0), 0, y0 + lowH + cabH, cabZ + (suv ? 0 : -0.05), colour);
  for (const sx of [-1, 1]) {
    put(p, G.box, sx * W * 0.455, y0 + lowH + cabH / 2, cabZ, colour, 0, 0.04, cabH * 0.9, 0.1);
    put(p, G.box, sx * W * 0.5, y0 + lowH + 0.08, cabZ + cabL / 2 - 0.1, colour, 0, 0.12, 0.08, 0.16); // mirrors
  }
  if (suv) put(m, G.box, 0, y0 + lowH + cabH + 0.08, cabZ, 0x222222, 0, W * 0.8, 0.05, cabL * 0.6); // roof rails
  // Bumpers, grille, lights.
  put(m, G.rbox, 0, y0 + 0.12, L / 2 - 0.05, 0x1e1e1e, 0, W * 0.98, 0.24, 0.16);
  put(m, G.rbox, 0, y0 + 0.12, -L / 2 + 0.05, 0x1e1e1e, 0, W * 0.98, 0.24, 0.16);
  put(m, G.box, 0, y0 + lowH * 0.55, L / 2 + 0.005, 0x111111, 0, W * 0.4, 0.14, 0.02);
  for (const sx of [-1, 1]) {
    put(l, G.rbox, sx * W * 0.36, y0 + lowH * 0.65, L / 2 - 0.02, 0xfff8e0, 0, W * 0.2, 0.12, 0.06);
    put(l, G.rbox, sx * W * 0.38, y0 + lowH * 0.7, -L / 2 + 0.02, 0xc81010, 0, W * 0.18, 0.14, 0.06);
  }
  put(c, G.box, 0, y0 + 0.3, -L / 2 - 0.01, 0xcccccc, 0, 0.3, 0.03, 0.02);
  plate(B, L / 2 + 0.04, y0 + 0.2, type === 'taxi');
  plate(B, -L / 2 - 0.04, y0 + 0.3, type === 'taxi');
  if (type === 'taxi' && r() < 0.5) put(l, G.rbox, 0, y0 + lowH + cabH + 0.12, cabZ, 0xffe040, 0, 0.5, 0.16, 0.2);
  const wr = suv ? 0.38 : 0.31, ww = suv ? 0.26 : 0.21;
  const wz = spec.wheelbase / 2, wx = W / 2 - ww / 2 + 0.02;
  return finish(B, spec, [[wx, wr, wz, wr, ww, true], [-wx, wr, wz, wr, ww, true], [wx, wr, -wz, wr, ww, false], [-wx, wr, -wz, wr, ww, false]], { color: colour });
}

function buildAuto(r, opts) {
  const spec = VEHICLE_TYPES.auto;
  const B = new BuilderSet();
  const p = B.get('paint'), m = B.get('matte'), g = B.get('glass'), l = B.get('light'), c = B.get('chrome');
  const green = 0x1f7a3a, yellow = opts.color ?? 0xf2c200, black = 0x151515;
  // Rear passenger tub.
  put(p, G.rbox, 0, 0.5, -0.45, green, 0, 1.3, 0.42, 1.5);
  put(p, G.rbox, 0, 0.82, -0.45, yellow, 0, 1.32, 0.26, 1.52);
  // Front cowl / nose.
  put(p, taperedBox(0.95, 0.5, 0.7, 0.85, 0.7, -0.08), 0, 0.5, 0.75, green);
  put(p, taperedBox(0.82, 0.35, 0.48, 0.85, 0.8, -0.1), 0, 0.92, 0.66, yellow);
  put(m, G.box, 0, 0.3, 0.3, 0x222222, 0, 0.7, 0.08, 1.3); // floor
  // Canopy and frame.
  put(m, G.rbox, 0, 1.73, -0.18, black, 0, 1.36, 0.1, 2.1);
  put(m, taperedBox(1.32, 0.95, 0.06, 1, 1, 0, false), 0, 1.22, -1.2, black);
  for (const sx of [-1, 1]) {
    put(c, G.cyl, sx * 0.62, 1.32, 0.78, 0x888888, 0, 0.025, 0.85, 0.025, -0.15);
    put(c, G.cyl, sx * 0.64, 1.25, -0.05, 0x888888, 0, 0.025, 0.95, 0.025);
    put(m, G.box, sx * 0.62, 1.55, -0.45, black, 0, 0.03, 0.32, 1.4); // side flaps rolled up
  }
  put(g, G.box, 0, 1.38, 0.86, 0x2a3a40, 0, 1.1, 0.62, 0.03, -0.18);
  put(m, G.rbox, 0, 0.82, -0.62, 0x2a2a2a, 0, 1.15, 0.2, 0.55); // rear seat
  put(m, G.rbox, 0, 1.08, -0.9, 0x2a2a2a, 0, 1.15, 0.5, 0.15);
  put(m, G.rbox, 0, 0.98, 0.38, 0x2a2a2a, 0, 0.45, 0.12, 0.4); // driver seat
  put(c, G.cyl, 0, 1.15, 0.76, 0x999999, 0, 0.02, 0.6, 0.02, 0, Math.PI / 2); // handlebar
  put(l, G.sphere, 0, 0.8, 1.13, 0xfff8e0, 0, 0.1, 0.1, 0.06); // headlamp
  put(l, G.box, 0.45, 0.6, -1.22, 0xc81010, 0, 0.12, 0.08, 0.03);
  put(l, G.box, -0.45, 0.6, -1.22, 0xc81010, 0, 0.12, 0.08, 0.03);
  put(m, G.box, 0.38, 1.25, 0.62, 0xd8d8d8, 0, 0.14, 0.16, 0.08); // fare meter
  plate(B, -1.23, 0.42, true, 0.4);
  return finish(B, spec, [[0, 0.22, 0.95, 0.22, 0.12, true], [0.58, 0.22, -0.8, 0.22, 0.14, false], [-0.58, 0.22, -0.8, 0.22, 0.14, false]], { driverSeat: [0, 0.98, 0.38] });
}

function buildScooter(r, opts) {
  const spec = VEHICLE_TYPES.scooter;
  const B = new BuilderSet();
  const p = B.get('paint'), m = B.get('matte'), l = B.get('light'), c = B.get('chrome');
  const colour = opts.color ?? pick([0xf2f2f2, 0x202224, 0xb01c22, 0x1c3a7a, 0x8a8e92, 0x3a6a3a, 0xe0a020], r);
  put(p, taperedBox(0.4, 0.95, 0.22, 0.7, 1, 0.08), 0, 0.72, 0.58, colour); // front apron
  put(m, G.box, 0, 0.32, 0.1, 0x222222, 0, 0.36, 0.06, 0.65); // floorboard
  put(p, taperedBox(0.42, 0.42, 0.8, 0.9, 0.85, 0.02), 0, 0.52, -0.42, colour); // rear body
  put(m, G.rbox, 0, 0.8, -0.3, 0x1a1a1a, 0, 0.32, 0.1, 0.72); // seat
  put(c, G.cyl, 0, 1.12, 0.62, 0x999999, 0, 0.02, 0.62, 0.02, 0, Math.PI / 2); // handlebar
  put(p, G.rbox, 0, 1.12, 0.66, colour, 0, 0.3, 0.12, 0.16);
  put(l, G.sphere, 0, 1.08, 0.75, 0xfff8e0, 0, 0.07, 0.07, 0.04);
  put(p, G.rbox, 0, 0.38, 0.62, colour, 0, 0.16, 0.12, 0.42); // front mudguard
  put(l, G.box, 0, 0.62, -0.84, 0xc81010, 0, 0.18, 0.06, 0.03);
  plate(B, -0.86, 0.45, false, 0.24);
  return finish(B, spec, [[0, 0.24, 0.62, 0.24, 0.1, true], [0, 0.24, -0.62, 0.24, 0.12, false]], { color: colour });
}

function buildBus(r, opts) {
  const spec = VEHICLE_TYPES.bus;
  const B = new BuilderSet();
  const p = B.get('paint'), m = B.get('matte'), g = B.get('glass'), l = B.get('light');
  const livery = opts.livery ?? pick(['vajra', 'ordinary', 'green'], r);
  const [main, stripe] = livery === 'vajra' ? [0x1f4e9c, 0xf2f2f2] : livery === 'green' ? [0x2a8a4a, 0xf2f2f2] : [0xb02a2a, 0xf0e2c0];
  const L = spec.length, W = spec.width;
  put(p, new RoundedBoxGeometry(W, 2.9, L, 3, 0.2), 0, 1.85, 0, main);
  put(p, G.box, 0, 1.2, 0, stripe, 0, W + 0.02, 0.35, L - 0.4);
  put(g, G.box, 0, 2.45, -0.3, 0x1a2228, 0, W + 0.03, 1.05, L - 1.6);
  put(g, G.box, 0, 2.2, L / 2 + 0.005, 0x1a2228, 0, W - 0.2, 1.6, 0.04);
  put(l, G.box, 0, 3.05, L / 2 + 0.01, 0xff9a20, 0, W - 0.5, 0.28, 0.04); // destination board
  put(g, G.box, 0, 2.5, -L / 2 - 0.005, 0x1a2228, 0, W - 0.4, 0.9, 0.04);
  // Doors on the kerb (left) side, which is +x for a vehicle facing +z.
  for (const dz of [3.6, -2.2]) put(m, G.box, W / 2 + 0.01, 1.55, dz, 0x2a2a2a, 0, 0.03, 2.3, 1.1);
  put(m, G.box, 0, 0.55, L / 2 + 0.05, 0x222222, 0, W, 0.35, 0.15);
  put(m, G.box, 0, 0.55, -L / 2 - 0.05, 0x222222, 0, W, 0.35, 0.15);
  put(m, G.box, 0, 3.4, -1, 0xd8d8d8, 0, 1.6, 0.25, 3); // roof AC unit
  for (const sx of [-1, 1]) {
    put(l, G.box, sx * 0.95, 0.85, L / 2 + 0.02, 0xfff8e0, 0, 0.3, 0.16, 0.04);
    put(l, G.box, sx * 1.05, 0.95, -L / 2 - 0.02, 0xc81010, 0, 0.2, 0.3, 0.04);
  }
  plate(B, L / 2 + 0.08, 0.5, true, 0.55);
  const wz = 3.3, wz2 = -2.9;
  return finish(B, spec, [[1.0, 0.5, wz, 0.5, 0.32, true], [-1.0, 0.5, wz, 0.5, 0.32, true], [1.0, 0.5, wz2, 0.5, 0.42, false], [-1.0, 0.5, wz2, 0.5, 0.42, false]], { livery });
}

export function buildVehicleModel(type, r = Math.random, opts = {}) {
  switch (type) {
    case 'auto': return buildAuto(r, opts);
    case 'scooter': return buildScooter(r, opts);
    case 'bus': return buildBus(r, opts);
    default: return buildCar(type, r, opts);
  }
}
