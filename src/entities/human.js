// Procedural people: one rigidly-skinned mesh per person (a single draw call) with a
// 13-bone skeleton, so crowds stay cheap while limbs bend at knees and elbows.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MeshBuilder, buildSkinned } from '../world/meshBuilder.js';
import { put } from '../world/landmarks.js';

const SKIN = [0x8d5524, 0xa8693c, 0xc68642, 0x7a4a2a, 0xb5784a, 0x9c6236, 0x6b4226, 0xd09a6a];
const SHIRTS = [0xffffff, 0x2e5e9e, 0x9e2e2e, 0x5a8a4a, 0xe8c070, 0x7a5aa0, 0x404040, 0xd0d8e8, 0xf0a060, 0x4aa0b0, 0x2a2a2a, 0xc04a7a];
const PANTS = [0x2a3040, 0x3a3a3a, 0x5a4a3a, 0x1f2a4a, 0x8a8070, 0x2a2a2a, 0x4a5a7a];
const SAREES = [0xc0182a, 0xe8a020, 0x1a7a4a, 0x8a1a7a, 0x2a4ac0, 0xf06a9a, 0xe05a1a, 0x0a8a8a, 0x6a1a2a, 0xd0b020];

export const humanMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });

const G = {
  rbox: new RoundedBoxGeometry(1, 1, 1, 1, 0.25),
  box: new THREE.BoxGeometry(1, 1, 1),
  limb: new THREE.CylinderGeometry(1, 0.85, 1, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  head: new THREE.SphereGeometry(1, 12, 9),
  cap: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
  cone: new THREE.CylinderGeometry(1, 1.4, 1, 12, 1, true),
  sphere: new THREE.SphereGeometry(1, 6, 4),
};

// Bone indices.
export const B = { root: 0, hips: 1, spine: 2, chest: 3, neck: 4, shL: 5, elL: 6, shR: 7, elR: 8, thL: 9, knL: 10, thR: 11, knR: 12 };
const HIP_Y = 0.92;

function makeBones() {
  const mk = (x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); return b; };
  const bones = [
    mk(0, 0, 0), mk(0, HIP_Y, 0), mk(0, 0.16, 0), mk(0, 0.24, 0), mk(0, 0.18, 0),
    mk(0.2, 0.14, 0), mk(0, -0.29, 0), mk(-0.2, 0.14, 0), mk(0, -0.29, 0),
    mk(0.095, 0, 0), mk(0, -0.45, 0), mk(-0.095, 0, 0), mk(0, -0.45, 0),
  ];
  const [root, hips, spine, chest, neck, shL, elL, shR, elR, thL, knL, thR, knR] = bones;
  root.add(hips); hips.add(spine, thL, thR); spine.add(chest); chest.add(neck, shL, shR);
  shL.add(elL); shR.add(elR); thL.add(knL); thR.add(knR);
  return bones;
}

const pick = (a, r) => a[Math.floor(r() * a.length)];

// opts: outfit ('shirt'|'kurta'|'saree'|'lungi'|'office'|'police'|'churidar'|'tshirt'), skin, top, bottom,
// helmet (true|colour), bag (colour), lathi (bool), shoes.
export function createHuman(opts = {}, r = Math.random) {
  const outfit = opts.outfit || pick(['shirt', 'shirt', 'tshirt', 'kurta', 'saree', 'saree', 'churidar', 'lungi', 'office', 'office'], r);
  const female = opts.female ?? (outfit === 'saree' || outfit === 'churidar' || (['tshirt', 'office'].includes(outfit) && r() < 0.35));
  const skin = opts.skin ?? pick(SKIN, r);
  let top = opts.top ?? pick(SHIRTS, r);
  let bottom = opts.bottom ?? pick(PANTS, r);
  if (outfit === 'police') { top = 0xb59a62; bottom = 0xb59a62; }
  if (outfit === 'office') { top = opts.top ?? pick([0xffffff, 0xd0d8e8, 0xb0c8e8, 0xf0e0e8], r); bottom = opts.bottom ?? pick([0x2a2a2a, 0x2a3040], r); }
  if (outfit === 'lungi') bottom = pick([0xffffff, 0x2a6a4a, 0x3a4aa0, 0xa03a3a, 0xf0e8d0], r);
  if (outfit === 'kurta') { top = pick([0xffffff, 0xf0e0c0, 0x9ab8d8, 0xe8a0a0, 0x7a9a5a], r); bottom = 0xf4f0e8; }
  const saree = outfit === 'saree' ? pick(SAREES, r) : null;
  if (outfit === 'churidar') { top = pick(SAREES, r); bottom = pick([0xf4f0e8, 0x2a2a2a, 0xe8c070], r); }
  const blouse = saree ? pick([0xd8a020, 0x2a2a6a, 0x8a1a1a, saree], r) : top;
  const shoes = opts.shoes ?? (outfit === 'police' ? 0x1a1208 : pick([0x2a2018, 0x111111, 0x6a4a2a, 0xe8e8e8], r));
  const hair = r() < 0.12 && !female ? 0x8a8a88 : 0x15100c;

  const b = new MeshBuilder({ skin: true });
  const at = (bone, geo, x, y, z, color, sx, sy, sz, rx = 0, rz = 0, ry = 0) => { b.bone = bone; put(b, geo, x, y, z, color, ry, sx, sy, sz, rx, rz); };

  // Pelvis, abdomen, chest.
  at(B.hips, G.rbox, 0, 0.9, 0, saree ? saree : bottom, 0.33, 0.2, 0.2);
  if (outfit === 'police') at(B.hips, G.box, 0, 0.99, 0, 0x3a2414, 0.35, 0.05, 0.215);
  at(B.spine, G.rbox, 0, 1.1, 0, blouse, 0.32, 0.26, 0.19);
  at(B.chest, G.rbox, 0, 1.34, 0, blouse, female ? 0.35 : 0.39, 0.3, female ? 0.22 : 0.21);
  if (outfit === 'office' && r() < 0.6) at(B.chest, G.box, 0.06, 1.3, 0.112, 0xf0f0f0, 0.05, 0.07, 0.01); // ID badge
  if (outfit === 'police') at(B.chest, G.box, -0.08, 1.38, 0.11, 0x2a2a6a, 0.06, 0.02, 0.01); // name tag
  // Neck and head.
  at(B.neck, G.cyl, 0, 1.53, 0, skin, 0.05, 0.08, 0.05);
  at(B.neck, G.head, 0, 1.64, 0.005, skin, 0.1, 0.12, 0.11);
  at(B.neck, G.box, 0, 1.625, 0.105, skin, 0.022, 0.04, 0.03); // nose
  for (const s of [-1, 1]) at(B.neck, G.sphere, s * 0.037, 1.66, 0.095, 0x1a1410, 0.014, 0.012, 0.01);
  if (!female && r() < 0.55) at(B.neck, G.box, 0, 1.597, 0.104, hair, 0.065, 0.014, 0.012); // moustache
  if (!female && r() < 0.15) at(B.neck, G.cap, 0, 1.6, 0.02, hair, 0.105, 0.07, 0.11, Math.PI); // beard
  if (opts.helmet) at(B.neck, G.cap, 0, 1.655, 0, opts.helmet === true ? pick([0x111111, 0xc0182a, 0xf0f0f0, 0x2a4ac0, 0xe8c020], r) : opts.helmet, 0.145, 0.15, 0.155);
  else if (outfit === 'police') { at(B.neck, G.cap, 0, 1.7, 0, 0x2a2a6a, 0.13, 0.06, 0.135, -0.1); at(B.neck, G.cap, 0, 1.665, -0.005, hair, 0.115, 0.08, 0.115); }
  else {
    at(B.neck, G.cap, 0, 1.665, -0.01, hair, 0.113, female ? 0.12 : 0.09, 0.118);
    if (female) {
      if (r() < 0.6) { // long plait down the back, often with jasmine
        at(B.neck, G.cyl, 0, 1.4, -0.11, hair, 0.035, 0.42, 0.03, 0.12);
        if (r() < 0.6) for (let k = 0; k < 5; k++) at(B.neck, G.sphere, (k % 2 ? 0.03 : -0.03), 1.6 - k * 0.025, -0.12, 0xfafaf0, 0.02, 0.02, 0.02);
      } else at(B.neck, G.head, 0, 1.67, -0.12, hair, 0.06, 0.055, 0.05); // bun
    }
  }
  // Clothing pieces bound to the hips.
  if (saree) {
    at(B.hips, G.cone, 0, 0.5, 0, saree, 0.19, 0.9, 0.19);
    at(B.chest, G.box, 0.02, 1.27, 0.115, saree, 0.13, 0.56, 0.02, 0, 0.55); // pallu over the shoulder
    at(B.chest, G.box, 0.12, 1.25, -0.11, saree, 0.13, 0.5, 0.02, 0, 0.2);
  }
  if (outfit === 'kurta' || outfit === 'churidar') at(B.hips, G.cone, 0, 0.74, 0, top, 0.18, 0.34, 0.15);
  if (outfit === 'lungi') at(B.hips, G.cone, 0, 0.55, 0, bottom, 0.185, 0.72, 0.14);
  if (opts.bag) { at(B.chest, G.rbox, 0, 1.25, -0.26, opts.bag, 0.42, 0.42, 0.28); at(B.chest, G.box, 0, 1.25, -0.115, 0x222222, 0.36, 0.05, 0.02); }

  // Arms.
  const sleeveLong = ['kurta', 'office', 'police', 'churidar'].includes(outfit) || (outfit === 'shirt' && r() < 0.4);
  for (const s of [-1, 1]) {
    const sh = s > 0 ? B.shL : B.shR, el = s > 0 ? B.elL : B.elR;
    const x = s * 0.2;
    at(sh, G.limb, x, 1.32, 0, sleeveLong || outfit !== 'saree' ? blouse : skin, 0.05, 0.29, 0.05);
    if (outfit === 'saree' || outfit === 'tshirt') at(sh, G.limb, x, 1.28, 0, skin, 0.042, 0.2, 0.042);
    at(el, G.limb, x, 1.045, 0, sleeveLong ? blouse : skin, 0.042, 0.25, 0.042);
    if (sleeveLong) at(el, G.limb, x, 0.94, 0, skin, 0.038, 0.06, 0.038);
    at(el, G.head, x, 0.885, 0.01, skin, 0.042, 0.055, 0.03); // hand
    if (s > 0 && opts.bangles !== false && female) at(el, G.cyl, x, 0.94, 0, 0xd4a017, 0.046, 0.02, 0.046);
  }
  if (opts.lathi) at(B.elR, G.cyl, -0.2, 0.86, 0.32, 0x8a5a2a, 0.018, 0.95, 0.018, Math.PI / 2 - 0.3);
  // Legs.
  const legColor = outfit === 'lungi' ? skin : saree ? saree : bottom;
  for (const s of [-1, 1]) {
    const th = s > 0 ? B.thL : B.thR, kn = s > 0 ? B.knL : B.knR;
    const x = s * 0.095;
    at(th, G.limb, x, 0.695, 0, legColor, saree ? 0.06 : 0.072, 0.45, saree ? 0.06 : 0.075);
    at(kn, G.limb, x, 0.26, 0, outfit === 'lungi' || saree ? skin : legColor, 0.055, 0.42, 0.058);
    at(kn, G.rbox, x, 0.04, 0.045, shoes, 0.1, 0.07, 0.25);
  }

  const bones = makeBones();
  const mesh = buildSkinned(b, humanMaterial, bones);
  mesh.receiveShadow = false;
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.blob = { w: 1.2, l: 1.2 };
  const bn = {};
  for (const [k, i] of Object.entries(B)) bn[k] = bones[i];
  return {
    group, mesh, bones: bn, phase: r() * 6, outfit, female, gait: saree ? 0.6 : 1,
    // Back-compat handles used by older code paths.
    legs: [bn.thL, bn.thR], arms: [bn.shL, bn.shR], torso: mesh,
  };
}

function reset(h) {
  const b = h.bones;
  for (const k in b) b[k].rotation.set(0, 0, 0);
  b.hips.position.y = HIP_Y;
}

export function animateWalk(h, dt, speed) {
  reset(h);
  const b = h.bones;
  const run = speed > 3.2;
  h.phase += dt * (run ? 4 + speed * 1.2 : 2.4 + speed * 2.2);
  const amp = Math.min(1, speed / 1.6) * (run ? 0.85 : 0.5) * h.gait;
  const s = Math.sin(h.phase), c = Math.cos(h.phase);
  b.thL.rotation.x = -s * amp;
  b.thR.rotation.x = s * amp;
  b.knL.rotation.x = Math.max(0, c) * amp * (run ? 1.8 : 1.2);
  b.knR.rotation.x = Math.max(0, -c) * amp * (run ? 1.8 : 1.2);
  b.shL.rotation.x = s * amp * 0.9;
  b.shR.rotation.x = -s * amp * 0.9;
  b.elL.rotation.x = b.elR.rotation.x = run ? -1.3 : -0.25;
  b.shL.rotation.z = 0.06; b.shR.rotation.z = -0.06;
  b.spine.rotation.x = run ? 0.18 : 0.03;
  b.chest.rotation.y = s * 0.12 * amp;
  b.hips.position.y = HIP_Y + Math.abs(c) * (run ? 0.06 : 0.025);
}

export function poseIdle(h, t) {
  reset(h);
  const b = h.bones, br = Math.sin(t * 1.6 + h.phase);
  b.shL.rotation.z = 0.08 + br * 0.015; b.shR.rotation.z = -0.08 - br * 0.015;
  b.elL.rotation.x = b.elR.rotation.x = -0.15;
  b.chest.rotation.x = br * 0.015;
  b.neck.rotation.y = Math.sin(t * 0.3 + h.phase) * 0.3;
}

// Waiting at a signal: arms folded or hands on hips, shifting weight, looking at traffic.
export function poseWait(h, t, impatient = 0) {
  reset(h);
  const b = h.bones;
  if ((h.phase * 10 | 0) % 2) { // arms folded
    b.shL.rotation.x = b.shR.rotation.x = -0.55;
    b.shL.rotation.z = -0.35; b.shR.rotation.z = 0.35;
    b.elL.rotation.x = b.elR.rotation.x = -1.7;
  } else { // hands on hips
    b.shL.rotation.z = 0.55; b.shR.rotation.z = -0.55;
    b.elL.rotation.x = b.elR.rotation.x = -1.2;
    b.elL.rotation.z = -0.9; b.elR.rotation.z = 0.9;
  }
  const sway = Math.sin(t * 0.8 + h.phase);
  b.hips.rotation.z = sway * 0.04;
  b.neck.rotation.y = Math.sin(t * (0.5 + impatient) + h.phase * 3) * (0.5 + impatient * 0.3);
  if (impatient > 0.5) { b.thL.rotation.x = -0.25 * Math.max(0, Math.sin(t * 6)); } // tapping, ready to dash
}

export function poseSit(h) {
  reset(h);
  const b = h.bones;
  b.thL.rotation.x = b.thR.rotation.x = -1.45;
  b.knL.rotation.x = b.knR.rotation.x = 1.4;
  b.thL.rotation.z = 0.08; b.thR.rotation.z = -0.08;
  b.shL.rotation.x = b.shR.rotation.x = -0.85;
  b.elL.rotation.x = b.elR.rotation.x = -0.45;
  b.shL.rotation.z = -0.1; b.shR.rotation.z = 0.1;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (v) => 1 - (1 - clamp01(v)) ** 3;
const easeInOut = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
// 0 → 1 over [a, b] with an ease, used to sequence the phases of a move.
const seg = (k, a, b, ease = easeInOut) => ease((k - a) / (b - a));

// Boxer's guard and stance (lead with the left), the base every strike starts and ends in.
function guard(b, side = 1, crouch = 1) {
  b.shL.rotation.x = b.shR.rotation.x = -0.95;
  b.elL.rotation.x = b.elR.rotation.x = -2.0;
  b.shL.rotation.z = -0.15; b.shR.rotation.z = 0.15;
  b.thL.rotation.x = -0.32 * crouch; b.knL.rotation.x = 0.4 * crouch;
  b.thR.rotation.x = 0.22 * crouch; b.knR.rotation.x = 0.3 * crouch;
  b.hips.rotation.y = 0.25 * side * crouch;
  b.chest.rotation.y = -0.15 * side * crouch;
  b.hips.position.y = HIP_Y - 0.05 * crouch;
}

// k: 0..1 progress of a punch with the given hand (+1 left, -1 right).
// Wind-up, a snapped strike with the hips and shoulders turning through, a beat, then back to guard.
export function posePunch(h, k, side = -1) {
  reset(h);
  const b = h.bones;
  guard(b);
  const wind = seg(k, 0, 0.18) * (1 - seg(k, 0.18, 0.3));
  const ext = seg(k, 0.18, 0.32, easeOut) * (1 - seg(k, 0.5, 1));
  const [sh, el] = side < 0 ? [b.shR, b.elR] : [b.shL, b.elL];
  sh.rotation.x = -0.95 + wind * 0.35 - ext * 0.7;
  el.rotation.x = -2.0 - wind * 0.3 + ext * 1.95;
  sh.rotation.z = side * (-0.15 + 0.25 * ext);
  // Turn into it: chest and hips rotate towards the punching side, weight onto the front foot.
  b.chest.rotation.y = side * (0.25 * wind - 0.55 * ext);
  b.hips.rotation.y = 0.25 + side * (0.1 * wind - 0.3 * ext);
  b.spine.rotation.x = 0.12 * ext;
  b.thL.rotation.x = -0.32 - 0.15 * ext; b.knL.rotation.x = 0.4 + 0.15 * ext;
  b.thR.rotation.x = 0.22 + 0.15 * ext;
  b.neck.rotation.y = -side * 0.2 * ext;
}

// Chamber the knee, snap the leg out, retract and put it down; arms counterbalance.
export function poseKick(h, k) {
  reset(h);
  const b = h.bones;
  guard(b, 1, 1 - seg(k, 0, 0.2));
  const chamber = seg(k, 0, 0.22) * (1 - seg(k, 0.75, 1));
  const ext = seg(k, 0.22, 0.38, easeOut) * (1 - seg(k, 0.5, 0.72));
  b.thR.rotation.x = -1.35 * chamber - 0.25 * ext;
  b.knR.rotation.x = 1.9 * chamber * (1 - ext) + 0.05;
  b.thL.rotation.x = 0.05; b.knL.rotation.x = 0.25 * chamber;
  b.spine.rotation.x = -0.35 * ext - 0.08 * chamber;
  b.hips.rotation.y = -0.2 * ext;
  b.hips.position.y = HIP_Y - 0.03 * chamber;
  b.shL.rotation.x = -0.95 + 0.6 * ext; b.shR.rotation.x = -0.95 + 0.9 * ext;
  b.shL.rotation.z = -0.15 + 0.7 * ext; b.shR.rotation.z = 0.15 - 0.9 * ext;
  b.elL.rotation.x = b.elR.rotation.x = -2.0 + 1.1 * ext;
}

// Taking a hit: k 0..1 over the stagger. Snaps back, then sags and recovers.
export function poseStagger(h, k) {
  reset(h);
  const b = h.bones;
  const hit = seg(k, 0, 0.15, easeOut) * (1 - seg(k, 0.35, 1));
  b.spine.rotation.x = -0.45 * hit;
  b.neck.rotation.x = -0.5 * hit;
  b.chest.rotation.y = 0.35 * hit;
  // Arms flung out and back.
  b.shL.rotation.x = 0.35 * hit; b.shR.rotation.x = -0.3 * hit;
  b.shL.rotation.z = 1.0 * hit; b.shR.rotation.z = -1.2 * hit;
  b.elL.rotation.x = b.elR.rotation.x = -0.8 * hit;
  b.thL.rotation.x = 0.25 * hit; b.knL.rotation.x = 0.35 * hit;
  b.thR.rotation.x = -0.35 * hit; b.knR.rotation.x = 0.5 * hit;
  b.hips.position.y = HIP_Y - 0.08 * hit;
}

// Getting into a car through the driver's door: reach for the handle, duck, slide onto the seat.
export function poseEnterCar(h, k) {
  reset(h);
  const b = h.bones;
  const reach = seg(k, 0, 0.3) * (1 - seg(k, 0.45, 0.6));
  const duck = seg(k, 0.3, 0.75);
  b.shR.rotation.x = -1.1 * reach; b.elR.rotation.x = -0.4 * reach;
  b.spine.rotation.x = 0.55 * duck; b.neck.rotation.x = 0.25 * duck;
  b.thL.rotation.x = b.thR.rotation.x = -1.2 * duck;
  b.knL.rotation.x = b.knR.rotation.x = 1.3 * duck;
  b.hips.position.y = HIP_Y - 0.35 * duck;
  b.shL.rotation.x = -0.5 * duck; b.elL.rotation.x = -0.6 * duck;
}

// Throwing a leg over a scooter or bike (from its left), then settling onto the seat.
export function poseMount(h, k) {
  reset(h);
  const b = h.bones;
  const lift = seg(k, 0, 0.45) * (1 - seg(k, 0.55, 0.8));
  const sit = seg(k, 0.5, 1);
  b.thR.rotation.x = -0.9 * lift - 1.45 * sit;
  b.thR.rotation.z = -0.9 * lift - 0.08 * sit;
  b.knR.rotation.x = 1.1 * lift + 1.4 * sit;
  b.thL.rotation.x = -1.45 * sit; b.knL.rotation.x = 1.4 * sit; b.thL.rotation.z = 0.08 * sit;
  b.spine.rotation.x = 0.25 * lift;
  b.shL.rotation.x = b.shR.rotation.x = -0.5 * lift - 0.85 * sit;
  b.elL.rotation.x = b.elR.rotation.x = -0.45 * sit;
  b.hips.position.y = HIP_Y - 0.05 * lift;
}

// A Bengaluru constable's lathi swing (raised overhead, brought down).
export function poseLathi(h, k) {
  reset(h);
  const b = h.bones;
  const down = k < 0.4 ? 0 : Math.min(1, (k - 0.4) / 0.3);
  b.shR.rotation.x = -2.6 + down * 2.0;
  b.elR.rotation.x = -0.6 + down * 0.4;
  b.shL.rotation.x = -0.4; b.elL.rotation.x = -0.8;
  b.chest.rotation.y = 0.3 - down * 0.5;
  b.thL.rotation.x = -0.3; b.knL.rotation.x = 0.3;
}

export function poseFight(h, t) {
  reset(h);
  const b = h.bones, bob = Math.sin(t * 7 + h.phase) * 0.03;
  guard(b);
  // Bounce on the balls of the feet, hands circling a little.
  b.hips.position.y += bob;
  b.shL.rotation.x += Math.sin(t * 3.5 + h.phase) * 0.06;
  b.shR.rotation.x += Math.sin(t * 3.5 + h.phase + 1.7) * 0.06;
  b.chest.rotation.y += Math.sin(t * 2 + h.phase) * 0.05;
}

export function poseDown(h) {
  reset(h);
  const b = h.bones;
  b.shL.rotation.z = 1.3; b.shR.rotation.z = -1.1;
  b.elL.rotation.x = -0.4;
  b.thL.rotation.x = -0.3; b.knL.rotation.x = 0.6; b.thR.rotation.z = -0.15;
}

export function poseHandsUp(h, t) {
  reset(h);
  const b = h.bones;
  b.shL.rotation.z = 2.6; b.shR.rotation.z = -2.6;
  b.elL.rotation.z = -0.3; b.elR.rotation.z = 0.3;
  b.neck.rotation.x = Math.sin(t * 3) * 0.05;
}

// Pointing a pistol: right arm straight out at the target, left hand cupping the grip.
// pitch: radians above (+) or below (-) horizontal.
export function poseAim(h, pitch = 0, recoil = 0) {
  reset(h);
  const b = h.bones;
  b.shR.rotation.x = -Math.PI / 2 - pitch - recoil * 0.25;
  b.elR.rotation.x = -0.05 - recoil * 0.3;
  b.shL.rotation.x = -Math.PI / 2 - pitch + 0.15;
  b.shL.rotation.z = -0.55;
  b.elL.rotation.x = -0.35;
  b.elL.rotation.z = 0.5;
  b.chest.rotation.y = 0.2;
  b.thL.rotation.x = -0.15; b.thR.rotation.x = 0.1;
}

// A flat, two-handed swing (bat, chain, sickle): wind up behind the right shoulder, sweep across.
export function poseSwing(h, k) {
  reset(h);
  const b = h.bones;
  const wind = k < 0.35 ? k / 0.35 : 1;
  const sweep = k < 0.35 ? 0 : Math.min(1, (k - 0.35) / 0.3);
  b.shR.rotation.x = -1.3 - 0.4 * wind + sweep * 0.3;
  b.shR.rotation.z = 0.9 * wind - sweep * 1.6;
  b.elR.rotation.x = -1.0 + sweep * 0.8;
  b.shL.rotation.x = -1.2; b.elL.rotation.x = -1.2; b.shL.rotation.z = -0.3 - sweep * 0.5;
  b.chest.rotation.y = 0.7 * wind - sweep * 1.4;
  b.thL.rotation.x = -0.35; b.knL.rotation.x = 0.35; b.thR.rotation.x = 0.2;
}
