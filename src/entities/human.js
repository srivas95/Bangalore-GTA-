// Procedural low-detail people with simple limb animation.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MeshBuilder } from '../world/meshBuilder.js';
import { put } from '../world/landmarks.js';

const SKIN = [0x8d5524, 0xa8693c, 0xc68642, 0x7a4a2a, 0xb5784a, 0x9c6236, 0x6b4226];
const SHIRTS = [0xffffff, 0x2e5e9e, 0x9e2e2e, 0x5a8a4a, 0xe8c070, 0x7a5aa0, 0x404040, 0xd0d8e8, 0xf0a060, 0x4aa0b0];
const PANTS = [0x2a3040, 0x3a3a3a, 0x5a4a3a, 0x1f2a4a, 0x8a8070, 0x2a2a2a];
const SAREES = [0xc0182a, 0xe8a020, 0x1a7a4a, 0x8a1a7a, 0x2a4ac0, 0xf06a9a, 0xe05a1a, 0x0a8a8a];

export const humanMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

const G = {
  torso: new RoundedBoxGeometry(0.4, 0.58, 0.22, 1, 0.06),
  head: new THREE.SphereGeometry(0.115, 10, 7),
  hair: new THREE.SphereGeometry(0.122, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.55),
  limb: new THREE.BoxGeometry(1, 1, 1),
  skirt: new THREE.CylinderGeometry(0.2, 0.3, 1, 10, 1, true),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  helmet: new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
  bag: new RoundedBoxGeometry(0.42, 0.42, 0.26, 1, 0.04),
};

const pick = (a, r) => a[Math.floor(r() * a.length)];

// opts.outfit: 'shirt' | 'kurta' | 'saree' | 'lungi' | 'office' | 'police'
export function createHuman(opts = {}, r = Math.random) {
  const outfit = opts.outfit || pick(['shirt', 'shirt', 'shirt', 'kurta', 'saree', 'saree', 'lungi', 'office'], r);
  const skin = opts.skin ?? pick(SKIN, r);
  let top = opts.top ?? pick(SHIRTS, r);
  let bottom = opts.bottom ?? pick(PANTS, r);
  if (outfit === 'police') { top = 0xb8a070; bottom = 0xb8a070; }
  if (outfit === 'office') { top = pick([0xffffff, 0xd0d8e8, 0xb0c8e8], r); bottom = pick([0x2a2a2a, 0x2a3040], r); }
  if (outfit === 'lungi') bottom = pick([0xffffff, 0x2a6a4a, 0x3a4aa0, 0xa03a3a], r);
  const saree = outfit === 'saree' ? pick(SAREES, r) : null;
  const kurta = outfit === 'kurta';
  if (kurta) { top = pick([0xffffff, 0xf0e0c0, 0x9ab8d8, 0xe8a0a0, 0x7a9a5a], r); bottom = 0xf4f0e8; }

  const group = new THREE.Group();
  const body = new MeshBuilder();
  put(body, G.torso, 0, 1.2, 0, saree ? pick([0xd8a020, 0x2a2a6a, 0x8a1a1a], r) : top);
  put(body, G.head, 0, 1.64, 0.01, skin, 0, 1, 1.1, 1);
  put(body, G.cyl, 0, 1.51, 0, skin, 0, 0.06, 0.08, 0.06);
  if (opts.helmet) put(body, G.helmet, 0, 1.66, 0, opts.helmet === true ? pick([0x111111, 0xc0182a, 0xf0f0f0, 0x2a4ac0], r) : opts.helmet);
  else if (outfit === 'police') { put(body, G.cyl, 0, 1.75, 0, 0x8a6a3a, 0, 0.13, 0.08, 0.13); put(body, G.hair, 0, 1.65, -0.005, 0x111111); }
  else put(body, G.hair, 0, 1.66, -0.01, 0x15100c, 0, 1, saree ? 1.05 : 0.95, 1.05);
  if (saree) {
    put(body, G.skirt, 0, 0.48, 0, saree, 0, 1, 0.96, 1);
    put(body, G.limb, 0.02, 1.22, 0.115, saree, 0, 0.12, 0.62, 0.02, 0, 0.5); // pallu across the chest
    put(body, G.head, 0, 1.66, -0.13, 0x15100c, 0, 0.6, 0.6, 0.6); // bun
  }
  if (kurta) put(body, G.skirt, 0, 0.76, 0, top, 0, 1.05, 0.34, 0.95);
  if (opts.bag) put(body, G.bag, 0, 1.22, -0.25, opts.bag);
  const torso = body.build(humanMaterial);
  group.add(torso);

  const limb = (w, h, d, color, x, y, extra) => {
    const b = new MeshBuilder();
    put(b, G.limb, 0, -h / 2, 0, color, 0, w, h, d);
    if (extra) extra(b);
    const m = b.build(humanMaterial);
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(m);
    group.add(pivot);
    return pivot;
  };
  const legColor = bottom;
  const legs = [-1, 1].map((s) => limb(0.14, 0.9, 0.15, legColor, s * 0.095, 0.92, (b) => {
    if (outfit === 'lungi') put(b, G.limb, 0, -0.78, 0, skin, 0, 0.12, 0.25, 0.12);
    put(b, G.limb, 0, -0.88, 0.05, opts.shoes ?? 0x2a2018, 0, 0.13, 0.08, 0.26);
  }));
  if (saree) legs.forEach((l) => (l.visible = false));
  const sleeve = kurta || outfit === 'office' || outfit === 'police';
  const arms = [-1, 1].map((s) => limb(0.09, 0.6, 0.1, sleeve ? top : skin, s * 0.25, 1.46, (b) => {
    if (!sleeve) put(b, G.limb, 0, -0.1, 0, saree ? pick([0xd8a020, 0x2a2a6a], r) : top, 0, 0.11, 0.22, 0.12);
    else put(b, G.limb, 0, -0.58, 0, skin, 0, 0.08, 0.1, 0.09);
  }));

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return { group, legs, arms, torso, phase: r() * 6, outfit };
}

// t: walk phase advance in radians-ish; speed scales stride.
export function animateWalk(h, dt, speed) {
  const stride = Math.min(1, speed / 2.5);
  h.phase += dt * (3 + speed * 2.2);
  const s = Math.sin(h.phase) * 0.6 * stride;
  h.legs[0].rotation.x = s;
  h.legs[1].rotation.x = -s;
  h.arms[0].rotation.x = -s * 0.8;
  h.arms[1].rotation.x = s * 0.8;
  h.arms[0].rotation.z = 0.05;
  h.arms[1].rotation.z = -0.05;
  h.torso.position.y = Math.abs(Math.cos(h.phase)) * 0.04 * stride;
}

export function poseIdle(h, t) {
  const b = Math.sin(t * 1.5 + h.phase) * 0.03;
  for (const l of h.legs) l.rotation.x *= 0.8;
  h.arms[0].rotation.x = b; h.arms[1].rotation.x = -b;
  h.torso.position.y = 0;
}

export function poseSit(h) {
  h.legs[0].rotation.x = h.legs[1].rotation.x = -0.85; // angled down to the footwell
  h.arms[0].rotation.x = h.arms[1].rotation.x = -1.0;
  h.arms[0].rotation.z = 0.15;
  h.arms[1].rotation.z = -0.15;
  h.torso.position.y = 0;
}

export function poseDown(h) {
  h.legs[0].rotation.x = 0.2; h.legs[1].rotation.x = -0.1;
  h.arms[0].rotation.z = 1.2; h.arms[1].rotation.z = -1.2;
}
