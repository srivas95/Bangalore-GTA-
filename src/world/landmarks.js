// Stylised versions of central Bengaluru landmarks, built from primitives.
import * as THREE from 'three';
import { FACADE_TILE, GLASS_TILE } from './textures.js';
import { BuilderSet, makeFrame } from './meshBuilder.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function put(builder, geo, x, y, z, color, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  builder.addGeometry(geo, _m, color);
}

const G = {
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 16),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  dome: new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  sphere: new THREE.SphereGeometry(1, 16, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
};

// Paint on the ground (runway, pitch and parking markings), with a stronger depth offset than the
// asphalt, plaza and grass under it, which are themselves pulled towards the camera.
function groundPaint(ctx) {
  if (!ctx.mats.paint) ctx.mats.paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const b = ctx.B.get('paint');
  return (x, y, z, w, d, c = 0xf2f2f2) => b.rect(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y, c);
}

function centre(block) {
  const b = block.inner;
  return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX, d: b.maxZ - b.minZ };
}

// Vidhana Soudha: neo-Dravidian seat of the state legislature. Faces south.
function vidhanaSoudha(ctx, block) {
  const { B, colliders, signs } = ctx;
  const { cx, cz } = centre(block);
  const stone = B.get('stone'), her = B.get('heritage'), roof = B.get('roof');
  const granite = 0xe4dccd, light = 0xefe8da;
  stone.box(cx, 0.15, cz, 98, 2, 58, 0xcfc6b6);
  for (let k = 0; k < 6; k++) stone.box(cx, 0.15, cz + 29 + k * 1.2 + 0.6, 40 - k * 1.5, 2 - k * 0.33, 1.2, 0xd8cfbf);
  her.box(cx, 2.15, cz, 90, 16, 50, granite, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 10, topColor: 0xbdb6aa });
  stone.box(cx, 18.15, cz, 92, 1.2, 52, light);
  // Portico with twelve columns.
  const pz = cz + 28;
  stone.box(cx, 2.15, pz, 40, 2, 8, 0xd8cfbf);
  for (let k = 0; k < 12; k++) {
    const x = cx - 16.5 + k * 3;
    put(stone, G.cyl, x, 11.15, pz + 2.5, light, 0, 0.8, 14, 0.8);
    put(stone, G.box, x, 4.65, pz + 2.5, 0xd8cfbf, 0, 1.8, 1, 1.8);
  }
  stone.box(cx, 18.15, pz, 40, 3, 8, light);
  stone.box(cx, 21.15, pz, 30, 2.5, 6, granite);
  // "Government work is God's work" inscription.
  signs.push({ key: 'vsInscription', text: ['ಸರ್ಕಾರದ ಕೆಲಸ ದೇವರ ಕೆಲಸ', "GOVERNMENT WORK IS GOD'S WORK"], x: cx, y: 19.6, z: pz + 4.05, w: 30, h: 2.6, face: 's' });
  // Central dome on a drum with the national emblem on top.
  stone.box(cx, 19.35, cz, 26, 2, 26, light);
  put(stone, G.cyl, cx, 25.35, cz, granite, 0, 10, 10, 10);
  put(stone, G.dome, cx, 30.35, cz, light, 0, 10.4, 11, 10.4);
  put(stone, G.cyl, cx, 42.35, cz, 0xc9a640, 0, 0.8, 2.5, 0.8);
  put(stone, G.sphere, cx, 44.35, cz, 0xd9b44a, 0, 1.2, 1.2, 1.2);
  // Corner and wing domes (chhatris).
  const domes = [[-40, -20], [40, -20], [-40, 20], [40, 20], [-22, 22], [22, 22]];
  for (const [dx, dz] of domes) {
    const x = cx + dx, z = cz + dz;
    for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) put(stone, G.cyl8, x + ox, 21, z + oz, light, 0, 0.3, 4, 0.3);
    stone.box(x, 23, z, 5.5, 0.6, 5.5, granite);
    put(stone, G.dome, x, 23.6, z, light, 0, 3, 3.6, 3);
    put(stone, G.cone, x, 27.6, z, 0xc9a640, 0, 0.3, 1.2, 0.3);
  }
  colliders.addCentered(cx, cz, 98, 58, 45, 'building');
  colliders.addCentered(cx, pz + 2, 40, 10, 22, 'building');
  ctx.lawn(block, 0x5f7f3f);
  return { name: 'Vidhana Soudha', x: cx, z: cz + 45 };
}

// Attara Kacheri (the red High Court building).
function highCourt(ctx, block) {
  const { B, colliders } = ctx;
  const { cx, cz } = centre(block);
  const her = B.get('heritage'), stone = B.get('stone'), roof = B.get('roof');
  const red = 0xb5483a;
  her.box(cx, 0.15, cz, 70, 13, 26, red, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 10 });
  stone.box(cx, 13.15, cz, 72, 1, 28, 0xe8e0d0);
  for (let k = 0; k < 8; k++) put(stone, G.cyl, cx - 10.5 + k * 3, 6.15, cz + 15, 0xf0ebe0, 0, 0.6, 12, 0.6);
  stone.box(cx, 12.15, cz + 15, 26, 2, 4, red);
  put(stone, G.cone4, cx, 15.65, cz + 15, red, Math.PI / 4, 18, 3, 3);
  put(stone, G.dome, cx, 14.15, cz, 0xe8e0d0, 0, 5, 5, 5);
  colliders.addCentered(cx, cz + 1, 72, 32, 20, 'building');
  ctx.lawn(block, 0x5f7f3f);
  return { name: 'High Court', x: cx, z: cz + 25 };
}

// Seshadri Iyer Memorial Library (State Central Library) in Cubbon Park.
function library(ctx, block) {
  const { B, colliders } = ctx;
  const { cx, cz } = centre(block);
  const her = B.get('heritage'), stone = B.get('stone'), roof = B.get('roof');
  const red = 0xa8463a;
  her.box(cx, 0.15, cz, 32, 9, 18, red, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 8 });
  stone.box(cx, 9.15, cz, 33, 0.8, 19, 0xece4d4);
  put(stone, G.cone4, cx, 12, cz, red, Math.PI / 4, 16, 5, 9);
  for (const [dx, dz] of [[-16, -9], [16, -9], [-16, 9], [16, 9]]) {
    put(stone, G.cyl8, cx + dx, 6, cz + dz, red, 0, 1.4, 12, 1.4);
    put(stone, G.cone, cx + dx, 13.5, cz + dz, 0x6a3a30, 0, 1.6, 3, 1.6);
  }
  colliders.addCentered(cx, cz, 34, 20, 14, 'building');
  return { name: 'State Central Library', x: cx, z: cz + 14 };
}

// Government Museum and Venkatappa Art Gallery on Kasturba Road: Pompeian red with white
// pilasters and a pedimented porch.
function museum(ctx, block) {
  const { B, colliders, signs } = ctx;
  const { cx, cz } = centre(block);
  const her = B.get('heritage'), stone = B.get('stone'), roof = B.get('roof');
  const red = 0xa83a2c, white = 0xf2ece0;
  her.box(cx, 0.15, cz, 60, 10, 16, red, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 8 });
  stone.box(cx, 10.15, cz, 61, 0.9, 17, white); // cornice
  stone.box(cx, 0.15, cz, 61, 0.9, 17, 0xd8d0c0); // plinth
  for (let x = -28; x <= 28; x += 4) stone.box(cx + x, 0.15, cz + 8.05, 0.9, 10, 0.3, white); // pilasters
  // Porch with columns and a pediment.
  stone.box(cx, 0.15, cz + 11, 16, 0.6, 6, 0xd8d0c0);
  for (let x = -6; x <= 6; x += 3) put(stone, G.cyl8, cx + x, 5.2, cz + 13.4, white, 0, 0.45, 10, 0.45);
  stone.box(cx, 10.15, cz + 11, 17, 1, 6.4, white);
  put(stone, G.cone4, cx, 12.4, cz + 11, red, Math.PI / 4, 12.5, 3.2, 5);
  colliders.addCentered(cx, cz, 61, 17, 12, 'building');
  colliders.addCentered(cx, cz + 11, 17, 6, 11, 'building');
  signs.push({ key: 'museum', text: ['ಸರ್ಕಾರಿ ವಸ್ತುಸಂಗ್ರಹಾಲಯ', 'GOVERNMENT MUSEUM · ESTD. 1865'], x: cx, y: 8.6, z: cz + 14.25, w: 13, h: 1.6, face: 's', bg: '#f2ece0', fg: '#7a1a10' });
  return { name: 'Government Museum', x: cx, z: cz + 20 };
}

// Jawahar Bal Bhavan: the toy train going round its little oval track under the trees.
function balBhavan(ctx, block) {
  const { B, colliders, signs } = ctx;
  const { cx, cz } = centre(block);
  const stone = B.get('stone'), metal = B.get('metal');
  const A = 30, Bz = 16, N = 64;
  const pt = (k) => { const a = (k / N) * Math.PI * 2; return [cx + Math.cos(a) * A, cz + Math.sin(a) * Bz]; };
  for (let k = 0; k < N; k++) {
    const [x0, z0] = pt(k), [x1, z1] = pt(k + 1);
    const l = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    for (const o of [-0.35, 0.35]) put(metal, G.box, (x0 + x1) / 2 + Math.cos(ang) * o, 0.22, (z0 + z1) / 2 - Math.sin(ang) * o, 0x7a7a7a, ang, 0.06, 0.08, l + 0.05);
    put(stone, G.box, (x0 + x1) / 2, 0.16, (z0 + z1) / 2, 0x6e5a48, ang, 1.4, 0.06, l + 0.05);
  }
  // The train: a little red engine and three open coaches, stopped by the platform.
  const cars = [[0xc0181a, 2.6, 1.7], [0xf2c200, 2.4, 1.2], [0x1a5aa8, 2.4, 1.2], [0x2a9a3a, 2.4, 1.2]];
  let x = cx - 6;
  for (const [c, l, h] of cars) {
    stone.box(x, 0.3, cz + Bz, l, h, 1.1, c);
    stone.box(x, 0.3 + h, cz + Bz, l + 0.1, 0.08, 1.2, 0xf4f0e8);
    x += l + 0.3;
  }
  put(metal, G.cyl8, cx - 6.8, 2.6, cz + Bz, 0x1a1a1a, 0, 0.18, 0.9, 0.18); // chimney
  colliders.addCentered(cx - 1.5, cz + Bz, 11, 1.3, 2, 'building');
  // Station shelter and the gate.
  stone.box(cx, 0.15, cz + Bz + 3, 10, 0.35, 3, 0xd8d0c0);
  stone.box(cx, 3, cz + Bz + 3, 11, 0.2, 3.6, 0xc8402a);
  for (const sx of [-4.8, 4.8]) put(stone, G.cyl8, cx + sx, 1.6, cz + Bz + 3, 0xf4f0e8, 0, 0.12, 2.9, 0.12);
  signs.push({ key: 'balbhavan', text: ['ಜವಾಹರ ಬಾಲ ಭವನ', 'JAWAHAR BAL BHAVAN · TOY TRAIN'], x: cx, y: 3.9, z: cz + Bz + 4.85, w: 9, h: 1.3, face: 's', bg: '#f2c200', fg: '#7a1a10' });
  ctx.trees(cx, cz, 9, 8); // trees in the middle of the loop
  return { name: 'Jawahar Bal Bhavan', x: cx, z: cz + Bz + 8 };
}

function bandstand(ctx, block) {
  const { B, colliders } = ctx;
  const { cx, cz } = centre(block);
  const stone = B.get('stone');
  put(stone, G.cyl8, cx, 0.65, cz, 0xd8cfbf, 0, 7, 1, 7);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    put(stone, G.cyl8, cx + Math.cos(a) * 6, 3.6, cz + Math.sin(a) * 6, 0xf4f0e8, 0, 0.25, 5, 0.25);
  }
  put(stone, G.cone, cx, 7.6, cz, 0x8a3a2a, Math.PI / 8, 7.6, 3, 7.6);
  colliders.addCentered(cx, cz, 12, 12, 1.2, 'low');
  return { name: 'Cubbon Park Bandstand', x: cx, z: cz + 10 };
}

// M. Chinnaswamy Stadium.
function stadium(ctx, block) {
  const { B, colliders } = ctx;
  const { cx, cz, w, d } = centre(block);
  const R = Math.min(w, d) / 2 - 3;
  const stone = B.get('stone'), glow = B.get('glow');
  const wall = new THREE.LatheGeometry([new THREE.Vector2(R, 0), new THREE.Vector2(R, 20), new THREE.Vector2(R - 0.5, 20.5)], 48);
  put(stone, wall, cx, 0.15, cz, 0xd9d4ca);
  // Tiered stands in alternating team colours.
  const tiers = 6, cols = [0xb8323a, 0xd4a017, 0x2a2a2a];
  for (let k = 0; k < tiers; k++) {
    const r0 = R - 0.5 - (k / tiers) * (R * 0.38 - 0.5), r1 = R - 0.5 - ((k + 1) / tiers) * (R * 0.38 - 0.5);
    const y0 = 20.5 - (k / tiers) * 15.5, y1 = 20.5 - ((k + 1) / tiers) * 15.5;
    put(stone, new THREE.LatheGeometry([new THREE.Vector2(r0, y0), new THREE.Vector2(r1, y1)], 48), cx, 0.15, cz, cols[k % 3]);
  }
  put(stone, new THREE.LatheGeometry([new THREE.Vector2(R * 0.62, 5), new THREE.Vector2(R * 0.6, 5), new THREE.Vector2(R * 0.6, 0)], 48), cx, 0.15, cz, 0x2f6a8a);
  const canopy = new THREE.LatheGeometry([new THREE.Vector2(R + 1, 22.5), new THREE.Vector2(R * 0.78, 25), new THREE.Vector2(R * 0.78, 25.3), new THREE.Vector2(R + 1, 23)], 48);
  put(stone, canopy, cx, 0.15, cz, 0xf2f2f2);
  put(stone, G.cyl, cx, 0.2, cz, 0x4f9a42, 0, R * 0.6, 0.1, R * 0.6);
  put(stone, G.cyl, cx, 0.21, cz, 0x5aa84a, 0, R * 0.25, 0.1, R * 0.25);
  stone.box(cx, 0.26, cz, 3, 0.05, 20, 0xc8b48a); // pitch
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + sx * (R + 2), z = cz + sz * (R + 2);
    put(stone, G.cyl8, x, 22, z, 0x9a9a9a, 0, 0.6, 44, 0.6);
    stone.box(x, 44, z, 6, 4, 0.6, 0x555555);
    glow.box(x, 44.4, z - sz * 0.35, 5.4, 3.2, 0.1, 0xfffbe8, { top: false });
    colliders.addCentered(x, z, 1.4, 1.4, 45, 'pole');
  }
  colliders.addCentered(cx, cz, R * 2, R * 2, 22, 'building');
  ctx.signs.push({ key: 'stadium', text: ['M. CHINNASWAMY STADIUM', 'ಚಿನ್ನಸ್ವಾಮಿ ಕ್ರೀಡಾಂಗಣ'], x: cx, y: 14, z: cz + R + 0.1, w: 24, h: 4, face: 's', bg: '#b8323a' });
  return { name: 'Chinnaswamy Stadium', x: cx, z: cz + R + 8 };
}

// St. Mark's Cathedral.
function cathedral(ctx, x, z) {
  const { B, colliders } = ctx;
  const her = B.get('heritage'), stone = B.get('stone'), roof = B.get('roof');
  const cream = 0xf2ead8;
  her.box(x, 0.15, z, 34, 11, 16, cream, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 8 });
  put(stone, G.cone4, x, 13.65, z, 0x9a8a78, Math.PI / 4, 25, 5, 12);
  put(stone, G.cyl, x, 14, z, cream, 0, 5, 6, 5);
  put(stone, G.dome, x, 17, z, cream, 0, 5.2, 6, 5.2);
  stone.box(x, 23, z, 0.4, 3, 0.4, 0xd9b44a);
  stone.box(x, 23.9, z, 1.6, 0.35, 0.35, 0xd9b44a);
  her.box(x - 19, 0.15, z, 6, 22, 6, cream, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof });
  put(stone, G.cone4, x - 19, 24.15, z, 0x9a8a78, Math.PI / 4, 4.5, 5, 4.5);
  colliders.addCentered(x - 2, z, 40, 18, 25, 'building');
  return { name: "St. Mark's Cathedral", x, z: z + 14 };
}

// A glass tower with a crown, in the spirit of UB City.
function skyTower(ctx, x, z) {
  const { B, colliders } = ctx;
  const glass = B.get('glass'), stone = B.get('stone'), roof = B.get('roof'), glow = B.get('glow');
  const h = 102.4;
  stone.box(x, 0.15, z, 30, 8, 30, 0xd8d0c4, { topBuilder: roof });
  glass.box(x, 8.15, z, 22, h, 22, 0xc8d8e8, { tileW: GLASS_TILE.w, tileH: GLASS_TILE.h, top: false });
  stone.box(x, h + 8.15, z, 24, 2, 24, 0xe8e4dc);
  glass.box(x, h + 10.15, z, 16, 10, 16, 0xd8e0e8, { tileW: GLASS_TILE.w, tileH: GLASS_TILE.h, top: false });
  put(stone, G.cone4, x, h + 26.15, z, 0xe8e4dc, Math.PI / 4, 12, 12, 12);
  put(stone, G.cyl8, x, h + 38, z, 0xcccccc, 0, 0.3, 12, 0.3);
  glow.box(x, h + 44, z, 0.8, 0.8, 0.8, 0xff3030);
  colliders.addCentered(x, z, 30, 30, h + 40, 'building');
  return { name: 'Sky Tower', x, z };
}

// Queen Victoria's statue at the Cubbon Park corner on MG Road.
function statue(ctx, x, z) {
  const { B, colliders } = ctx;
  const stone = B.get('stone');
  stone.box(x, 0.15, z, 5, 1, 5, 0xbdb6aa);
  stone.box(x, 1.15, z, 3, 3.5, 3, 0xd8d0c4);
  put(stone, G.cyl8, x, 5.4, z, 0x3d4a3a, 0, 0.9, 2, 0.9);
  put(stone, G.cone, x, 5.6, z, 0x3d4a3a, 0, 1.2, 1.5, 1.2);
  put(stone, G.sphere, x, 6.8, z, 0x3d4a3a, 0, 0.35, 0.4, 0.35);
  colliders.addCentered(x, z, 5, 5, 7, 'building');
}

// ---------------------------------------------------------------------------------------------
// Peenya / Yeshwanthpur / Rajajinagar / Koramangala / Silk Board landmarks.

// IBC Platinum City, HMT Main Road: a gated high-rise township of lettered residential blocks
// around a clubhouse, pool and central garden. (Stylised: block count and heights approximate.)
function ibcPlatinumCity(ctx, block) {
  const { B, colliders, signs, plaza } = ctx;
  const i = block.inner;
  const { cx, cz, w, d } = centre(block);
  plaza(block, 0xe0d8cc);
  const apt = B.get('apartment'), roof = B.get('roof'), stone = B.get('stone'), grass = B.get('grass');
  // Central garden.
  grass.rect(cx - 26, cx + 26, cz - 26, cz + 26, 0.17, 0xffffff, (x, z) => [x / 6, -z / 6]);
  // Compound wall with a gate on the HMT Main Road (east) side.
  const wallC = 0xd8cbb4, wh = 2.2;
  stone.box(cx, 0.15, i.minZ + 0.2, w, wh, 0.4, wallC); colliders.addCentered(cx, i.minZ + 0.2, w, 0.4, wh, 'wall');
  stone.box(cx, 0.15, i.maxZ - 0.2, w, wh, 0.4, wallC); colliders.addCentered(cx, i.maxZ - 0.2, w, 0.4, wh, 'wall');
  stone.box(i.minX + 0.2, 0.15, cz, 0.4, wh, d, wallC); colliders.addCentered(i.minX + 0.2, cz, 0.4, d, wh, 'wall');
  const gate = 9;
  for (const [z0, z1] of [[i.minZ, cz - gate], [cz + gate, i.maxZ]]) {
    stone.box(i.maxX - 0.2, 0.15, (z0 + z1) / 2, 0.4, wh, z1 - z0, wallC);
    colliders.addCentered(i.maxX - 0.2, (z0 + z1) / 2, 0.4, z1 - z0, wh, 'wall');
  }
  for (const s of [-1, 1]) { stone.box(i.maxX - 0.6, 0.15, cz + s * gate, 1.4, 7, 1.4, 0xb5523a); colliders.addCentered(i.maxX - 0.6, cz + s * gate, 1.4, 1.4, 7, 'pole'); }
  stone.box(i.maxX - 0.6, 7.15, cz, 1.6, 1.4, gate * 2 + 1.4, 0xb5523a);
  signs.push({ key: 'ibcGate', text: ['IBC PLATINUM CITY', 'ಐಬಿಸಿ ಪ್ಲಾಟಿನಂ ಸಿಟಿ'], x: i.maxX + 0.25, y: 7.85, z: cz, w: 16, h: 1.3, face: 'e', bg: '#1d2a44', fg: '#e8d8a8' });
  // Towers: plus-shaped plans, cream with terracotta accents, lettered A–I.
  const letters = 'ABCDEFGHI';
  let k = 0;
  for (const fz of [-1, 0, 1]) {
    for (const fx of [-1, 0, 1]) {
      const tx = cx + fx * (w * 0.33), tz = cz + fz * (d * 0.33);
      const letter = letters[k++];
      if (fx === 0 && fz === 0) continue;
      const floors = 14 + ((k * 7) % 4);
      const H = floors * 3.1;
      apt.box(tx, 0.15, tz, 24, H, 13, 0xf3ead8, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 10 });
      apt.box(tx, 0.15, tz, 13, H, 24, 0xf0e4cc, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 10 });
      for (const [ox, oz] of [[-12.05, 0], [12.05, 0]]) stone.box(tx + ox, 0.15, tz + oz, 0.3, H + 1.5, 4, 0xb5523a);
      for (const [ox, oz] of [[0, -12.05], [0, 12.05]]) stone.box(tx + ox, 0.15, tz + oz, 4, H + 1.5, 0.3, 0xb5523a);
      stone.box(tx, H + 0.15, tz, 8, 4, 8, 0xe8dcc4); // lift machine room
      stone.box(tx, H + 4.15, tz, 9, 0.4, 9, 0xb5523a);
      put(stone, G.cyl, tx + 6, H + 0.9, tz + 6, 0x1a1a1a, 0, 1, 1.5, 1);
      put(stone, G.cyl, tx - 6, H + 0.9, tz - 6, 0x1a1a1a, 0, 1, 1.5, 1);
      signs.push({ key: 'ibc' + letter, text: [letter + ' BLOCK'], x: tx, y: H - 2, z: tz + 12.25, w: 5, h: 1.6, face: 's', bg: '#b5523a', fg: '#fff8e8' });
      colliders.addCentered(tx, tz, 24.4, 13.4, H + 4, 'building');
      colliders.addCentered(tx, tz, 13.4, 24.4, H + 4, 'building');
    }
  }
  // Clubhouse and pool in the middle of the garden.
  B.get('glass').box(cx - 8, 0.15, cz - 8, 18, 7, 12, 0xd8e8f0, { tileW: GLASS_TILE.w, tileH: GLASS_TILE.h, topBuilder: roof });
  colliders.addCentered(cx - 8, cz - 8, 18, 12, 8, 'building');
  stone.box(cx + 10, 0.15, cz + 10, 16, 0.25, 9, 0xd8d0c0);
  stone.box(cx + 10, 0.4, cz + 10, 14, 0.02, 7, 0x2a9ad0);
  ctx.trees(cx, cz, 26, 14);
  return { name: 'IBC Platinum City', x: i.maxX + 4, z: cz };
}

// Kempegowda Bus Station, Majestic: rows of platform canopies over bus bays, a terminal block
// with the BMTC/KSRTC enquiry counters and the big bilingual name board.
function busStand(ctx, block) {
  const { B, colliders, signs, plaza } = ctx;
  const i = block.inner;
  const { cx, cz, w, d } = centre(block);
  plaza(block, 0xc8c2b8);
  const stone = B.get('stone'), metal = B.get('metal'), her = B.get('plaster'), roof = B.get('roof');
  const bw = Math.min(w - 8, 150);
  // Terminal building along the north side.
  const tz = i.minZ + 9;
  her.box(cx, 0.15, tz, bw, 8, 12, 0xe8e0d0, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 10 });
  stone.box(cx, 8.15, tz, bw + 1, 0.6, 13, 0x9a2a2a);
  colliders.addCentered(cx, tz, bw, 12, 9, 'building');
  signs.push({ key: 'kbs', text: ['ಕೆಂಪೇಗೌಡ ಬಸ್ ನಿಲ್ದಾಣ', 'KEMPEGOWDA BUS STATION · MAJESTIC'], x: cx, y: 10.3, z: tz + 6.1, w: 26, h: 3.2, face: 's', bg: '#9a2a2a', fg: '#fff6d8' });
  signs.push({ key: 'kbsN', text: ['ಕೆಂಪೇಗೌಡ ಬಸ್ ನಿಲ್ದಾಣ', 'KEMPEGOWDA BUS STATION'], x: cx, y: 10.3, z: tz - 6.1, w: 22, h: 3, face: 'n', bg: '#9a2a2a', fg: '#fff6d8' });
  // Platform islands with canopies, bays between them.
  const rows = Math.max(1, Math.floor((d - 24) / 16));
  const bays = [], crowds = [];
  for (let r = 0; r < rows; r++) {
    const pz = tz + 16 + r * 16;
    if (pz > i.maxZ - 6) break;
    stone.box(cx, 0.15, pz, bw - 10, 0.35, 3, 0xd0c8b8);
    for (let x = cx - bw / 2 + 8; x <= cx + bw / 2 - 8; x += 10) {
      put(metal, G.cyl8, x, 2.6, pz, 0x6a7a8a, 0, 0.18, 5, 0.18);
      colliders.addCentered(x, pz, 0.5, 0.5, 5, 'pole');
    }
    metal.box(cx, 5.1, pz, bw - 8, 0.25, 7, 0x8a9aa8);
    stone.box(cx, 5.35, pz, bw - 8, 0.12, 7.2, 0xc0182a, { top: false });
    signs.push({ key: 'kbsP' + r, text: [`PLATFORM ${r * 2 + 1}–${r * 2 + 2}`, 'ವೇದಿಕೆ'], x: cx - bw / 2 + 6, y: 4.2, z: pz + 0.4, w: 3.2, h: 0.9, face: 's', bg: '#1a3a6a', fg: '#fff' });
    // An LED departures board hanging under the canopy.
    const dests = [['500D', 'HEBBAL'], ['335E', 'WHITEFIELD'], ['13', 'BANASHANKARI'], ['401', 'YELAHANKA'], ['KBS-8', 'JAYANAGAR'], ['G-3', 'ELECTRONIC CITY']];
    const [n1, d1] = dests[(r * 2) % dests.length], [n2, d2] = dests[(r * 2 + 1) % dests.length];
    signs.push({ key: 'kbsLed' + r, text: [`${n1}  ${d1}   ${r * 2 + 1}`, `${n2}  ${d2}   ${r * 2 + 2}`], x: cx + bw / 4, y: 4.1, z: pz + 0.35, w: 7, h: 1.2, face: 's', bg: '#0a0a0a', fg: '#ff9a1a' });
    // People waiting along the platform.
    for (let k = 0; k < 3; k++) crowds.push({ x: cx - bw / 2 + 14 + (k + 0.5) * ((bw - 28) / 3), z: pz, spread: [((bw - 28) / 3 - 4) / 2, 1.2], n: 5 });
    // Buses nose-in to the platform in the bays to its south.
    if (pz + 16 <= i.maxZ - 6) for (let x = cx - bw / 2 + 12; x <= cx + bw / 2 - 12; x += 5) bays.push({ x, z: pz + 8.4, heading: Math.PI });
  }
  // Kiosks by the terminal: milk booth and a chai counter.
  for (const [kx, label, bg, fg] of [[cx - bw / 2 + 14, ['ನಂದಿನಿ', 'NANDINI MILK'], '#0a5cad', '#ffffff'], [cx + bw / 2 - 14, ['ಚಹಾ · ಕಾಫಿ', 'TEA · COFFEE · SNACKS'], '#ffd200', '#3a1d0f']]) {
    her.box(kx, 0.15, tz + 8.5, 4, 2.6, 2.4, 0xe8e0d0);
    stone.box(kx, 2.75, tz + 8.5, 4.6, 0.2, 3, 0x9a2a2a);
    colliders.addCentered(kx, tz + 8.5, 4, 2.4, 2.8, 'building');
    signs.push({ key: 'kbsK' + label[1], text: label, x: kx, y: 2.2, z: tz + 9.75, w: 3.6, h: 0.8, face: 's', bg, fg });
  }
  return { name: 'Kempegowda Bus Station', x: cx, z: tz + 12, busBays: bays, crowds };
}

// ISKCON temple on its hillock at Rajajinagar: tall gold-and-glass tower over a stepped plinth.
function iskcon(ctx, block) {
  const { B, colliders, signs, lawn } = ctx;
  const { cx, cz } = centre(block);
  lawn(block, 0x6a8a4a);
  const stone = B.get('stone'), glass = B.get('glass'), metal = B.get('metal');
  for (let k = 0; k < 4; k++) stone.box(cx, 0.15 + k * 1.2, cz, 70 - k * 8, 1.2, 56 - k * 7, 0xe8dcc8 - k * 0x050505);
  stone.box(cx, 4.95, cz, 34, 10, 24, 0xf4ecdc);
  glass.box(cx, 14.95, cz, 14, 10, 14, 0xf0c860, { tileW: GLASS_TILE.w, tileH: GLASS_TILE.h, top: false });
  for (let k = 0; k < 5; k++) put(metal, G.box, cx, 24.95 + k * 2.6, cz, 0xe0b040, Math.PI / 4 * (k % 2), 12 - k * 2.2, 2.6, 12 - k * 2.2);
  put(metal, G.cone, cx, 40, cz, 0xf0c040, 0, 1.2, 4, 1.2);
  put(metal, G.sphere, cx, 42.6, cz, 0xf0c040, 0, 0.8, 0.8, 0.8);
  for (const sx of [-1, 1]) {
    stone.box(cx + sx * 13, 14.95, cz, 6, 4, 6, 0xf4ecdc);
    put(metal, G.cone4, cx + sx * 13, 21, cz, 0xe0b040, Math.PI / 4, 4, 8, 4);
  }
  colliders.addCentered(cx, cz, 70, 56, 4.8, 'plinth');
  colliders.addCentered(cx, cz, 34, 24, 40, 'building');
  signs.push({ key: 'iskcon', text: ['ISKCON SRI RADHA KRISHNA TEMPLE', 'ಇಸ್ಕಾನ್'], x: cx, y: 6.5, z: cz + 12.05, w: 18, h: 2, face: 's', bg: '#7a1a1a', fg: '#f8e0a0' });
  ctx.trees(cx, cz, 0, 0, block);
  return { name: 'ISKCON Temple', x: cx, z: cz + 34 };
}

// World Trade Center Bengaluru at Brigade Gateway, with its mall podium.
function wtc(ctx, x, z) {
  const { B, colliders, signs } = ctx;
  const glass = B.get('glass'), stone = B.get('stone'), roof = B.get('roof'), glow = B.get('glow');
  stone.box(x, 0.15, z, 60, 14, 40, 0xe8e0d4, { topBuilder: roof });
  glass.box(x, 0.15, z + 20.05, 50, 12, 0.2, 0xb0c8e0, { tileW: GLASS_TILE.w, tileH: GLASS_TILE.h, top: false });
  const H = 124;
  glass.box(x + 8, 14.15, z - 4, 24, H, 24, 0xa8c4dc, { tileW: GLASS_TILE.w, tileH: GLASS_TILE.h, top: false });
  stone.box(x + 8, H + 14.15, z - 4, 25, 1.5, 25, 0xe8e8e8);
  put(stone, G.cyl8, x + 8, H + 22, z - 4, 0xcccccc, 0, 0.4, 14, 0.4);
  glow.box(x + 8, H + 29, z - 4, 1, 1, 1, 0xff3030);
  colliders.addCentered(x, z, 60, 40, 15, 'building');
  colliders.addCentered(x + 8, z - 4, 24, 24, H + 20, 'building');
  signs.push({ key: 'wtc', text: ['WORLD TRADE CENTER', 'BENGALURU'], x: x + 8, y: H + 8, z: z + 8.05, w: 16, h: 3, face: 's', bg: '#1a2a40', fg: '#e8f0ff' });
  signs.push({ key: 'gatewayMall', text: ['GATEWAY MALL', 'ಮಾಲ್'], x, y: 11, z: z + 20.2, w: 18, h: 2.5, face: 's', bg: '#c0182a', fg: '#fff' });
  return { name: 'World Trade Center', x, z: z + 26 };
}

// Lalbagh Glass House: a Victorian conservatory with a glazed barrel roof and dome.
function glassHouse(ctx, block) {
  const { B, colliders, signs } = ctx;
  const { cx, cz } = centre(block);
  const glass = B.get('glass'), stone = B.get('stone');
  const barrel = new THREE.CylinderGeometry(1, 1, 1, 20, 1, false, 0, Math.PI);
  stone.box(cx, 0.15, cz, 64, 0.6, 18, 0xd8d0c0);
  for (const [w, x] of [[60, 0]]) {
    glass.box(cx + x, 0.75, cz, w, 5, 14, 0xd0e8f0, { tileW: GLASS_TILE.w / 2, tileH: GLASS_TILE.h / 2, top: false });
    put(glass, barrel, cx + x, 5.75, cz, 0xd0e8f0, 0, 7, w, 7, 0, Math.PI / 2);
  }
  for (let k = -30; k <= 30; k += 5) put(stone, new THREE.TorusGeometry(7, 0.12, 4, 16, Math.PI), cx + k, 5.75, cz, 0xf8f8f8, Math.PI / 2);
  stone.box(cx, 0.75, cz, 18, 6, 18, 0xf8f8f8, { top: false });
  put(glass, G.dome, cx, 6.75, cz, 0xd0e8f0, 0, 9.5, 9, 9.5);
  put(stone, G.sphere, cx, 15.9, cz, 0xf8f8f8, 0, 0.6, 0.6, 0.6);
  colliders.addCentered(cx, cz, 64, 18, 12, 'building');
  signs.push({ key: 'lalbagh', text: ['LALBAGH GLASS HOUSE', 'ಲಾಲ್‌ಬಾಗ್ ಗಾಜಿನ ಮನೆ'], x: cx, y: 2, z: cz + 9.3, w: 10, h: 1.6, face: 's', bg: '#1f5a2a', fg: '#fff' });
  return { name: 'Lalbagh Glass House', x: cx, z: cz + 20 };
}

// The Forum, Koramangala: the city's original big mall.
function forumMall(ctx, block) {
  const { B, colliders, signs, plaza } = ctx;
  const { cx, cz, w, d } = centre(block);
  plaza(block, 0xe8e4dc);
  const stone = B.get('stone'), glass = B.get('glass'), roof = B.get('roof');
  const mw = w - 30, md = d - 40;
  stone.box(cx, 0.15, cz - 8, mw, 22, md, 0xe8e0d0, { topBuilder: roof, topTile: 10 });
  glass.box(cx, 0.15, cz - 8 + md / 2 + 0.05, mw * 0.6, 18, 0.3, 0x9ab8d0, { tileW: GLASS_TILE.w, tileH: GLASS_TILE.h, top: false });
  stone.box(cx, 18.15, cz - 8 + md / 2 + 3, mw * 0.7, 1, 6, 0xc0182a);
  for (let k = -2; k <= 2; k++) put(stone, G.cyl, cx + k * 12, 9, cz - 8 + md / 2 + 5, 0xf0f0f0, 0, 0.5, 18, 0.5);
  colliders.addCentered(cx, cz - 8, mw, md, 23, 'building');
  signs.push({ key: 'forum', text: ['THE FORUM', 'ಫೋರಮ್ ಮಾಲ್'], x: cx, y: 20, z: cz - 8 + md / 2 + 6.05, w: 20, h: 3.2, face: 's', bg: '#c0182a', fg: '#fff' });
  return { name: 'Forum Mall', x: cx, z: cz + d / 2 - 2 };
}

// Central Silk Board office, which gave India's most infamous junction its name.
function silkBoardOffice(ctx, block) {
  const { B, colliders, signs, lawn } = ctx;
  const { cx, cz } = centre(block);
  lawn(block, 0x7a8a5a);
  const her = B.get('plaster'), stone = B.get('stone'), roof = B.get('roof');
  her.box(cx, 0.15, cz, 64, 16, 26, 0xe8dcc0, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 10 });
  stone.box(cx, 16.15, cz, 66, 1, 28, 0x9a6a3a);
  stone.box(cx, 0.15, cz + 14, 20, 6, 3, 0xd8c8a8);
  colliders.addCentered(cx, cz, 66, 30, 17, 'building');
  signs.push({ key: 'csb', text: ['ಕೇಂದ್ರ ರೇಷ್ಮೆ ಮಂಡಳಿ', 'CENTRAL SILK BOARD'], x: cx, y: 13.5, z: cz + 13.05, w: 18, h: 3, face: 's', bg: '#5a1a3a', fg: '#f8e0a0' });
  ctx.trees(cx, cz, 0, 0, block);
  return { name: 'Central Silk Board', x: cx, z: cz + 30 };
}


// ---------------------------------------------------------------------------------------------
// Kempegowda International Airport: runway, taxiway, apron with parked jets, Terminal 1, the
// "terminal in a garden" (T2), the control tower, a perimeter fence, and departures that taxi,
// roll and climb out every minute or so.
const LIVERIES = [
  { body: 0xf4f4f4, tail: 0x1c2a8a, belly: 0x1c2a8a, name: 'IndiGo' },
  { body: 0xf4f4f4, tail: 0xd8202a, belly: 0xd8202a, name: 'Air India' },
  { body: 0xf6f2ea, tail: 0xf07a20, belly: 0xf07a20, name: 'Akasa Air' },
  { body: 0xf4f4f4, tail: 0x5a2a7a, belly: 0x6a6a6a, name: 'Air India Express' },
];

// A narrow-body jet along local +x (nose at +x), wheels at y = 0.
export function buildPlane(b, liv) {
  const L = 37, R = 2.0, cy = 3.2;
  put(b, G.cyl, 0, cy, 0, liv.body, 0, R, L - 6, R, 0, Math.PI / 2);
  put(b, G.sphere, (L - 6) / 2, cy, 0, liv.body, 0, 3.2, R, R);
  put(b, G.sphere, -(L - 6) / 2, cy + 0.4, 0, liv.body, 0, 4.5, R * 0.75, R * 0.85);
  b.box(0, cy - 1.6, 0, L - 12, 0.6, 2.4, liv.belly); // belly stripe
  b.box(L / 2 - 4.2, cy + 0.6, 0, 1.4, 0.5, 3.2, 0x1a2228); // cockpit windows
  for (let x = -12; x <= 12; x += 1.6) b.box(x, cy + 0.6, 0, 0.5, 0.45, 4.02, 0x1a2228);
  // Wings, swept back, with engines.
  for (const sd of [-1, 1]) {
    put(b, G.box, -1.5, cy - 0.9, sd * 8.5, liv.body, sd * 0.45, 5.5, 0.4, 16, 0, 0);
    put(b, G.cyl, 2.2, cy - 2.1, sd * 5.6, 0xd8d8d8, 0, 1.0, 3.6, 1.0, 0, Math.PI / 2);
    put(b, G.box, -16.5, cy + 0.6, sd * 3.6, liv.body, sd * 0.5, 2.6, 0.25, 6, 0, 0); // tailplane
  }
  put(b, G.box, -16, cy + 4.2, 0, liv.tail, 0, 6, 7, 0.4, 0, -0.5); // fin
  // Landing gear.
  b.box(L / 2 - 6, 0.5, 0, 0.4, 1.4, 0.4, 0x333333);
  for (const sd of [-1, 1]) b.box(-1, 0.6, sd * 2.6, 1.2, 1.2, 0.6, 0x222222);
}

function airport(ctx, block) {
  const { B, colliders, signs, group } = ctx;
  const i = block.inner;
  ctx.lawn(block, 0x8a9a50);
  const stone = B.get('stone'), asphalt = B.get('junction'), plaza = B.get('plaza'), glass = B.get('glass'), roof = B.get('roof');
  const W = i.maxX - i.minX, y = 0.17;
  // Runway along the north of the site, taxiway and apron south of it.
  const rz = i.minZ + 70, rw = 45, rx0 = i.minX + 30, rx1 = i.maxX - 30;
  asphalt.rect(rx0, rx1, rz - rw / 2, rz + rw / 2, y, 0x4a4a4a, (x, z) => [x / 8, -z / 8]);
  const mark = groundPaint(ctx);
  for (let x = rx0 + 60; x < rx1 - 60; x += 30) mark(x, y + 0.02, rz, 15, 0.9);
  for (const end of [rx0 + 8, rx1 - 8]) for (let k = -4; k <= 4; k++) if (k) mark(end, y + 0.02, rz + k * 4.4, 18, 1.8);
  for (const sd of [-1, 1]) mark((rx0 + rx1) / 2, y + 0.02, rz + sd * (rw / 2 - 1), rx1 - rx0, 0.5);
  const tz = rz + 80;
  asphalt.rect(rx0 + 40, rx1 - 40, tz - 12, tz + 12, y, 0x555555, (x, z) => [x / 8, -z / 8]);
  for (let x = rx0 + 40; x < rx1 - 40; x += 6) mark(x, y + 0.02, tz, 3, 0.3, 0xf2c200);
  for (const x of [rx0 + 60, (rx0 + rx1) / 2, rx1 - 60]) asphalt.rect(x - 12, x + 12, rz + rw / 2, tz - 12, y, 0x555555, (px, pz) => [px / 8, -pz / 8]);
  const az0 = tz + 20, az1 = i.maxZ - 120;
  plaza.rect(i.minX + 120, i.maxX - 120, az0, az1, y, 0xc8c4bc, (x, z) => [x / 6, -z / 6]);
  // Terminal 1 and Terminal 2 along the south side, facing the forecourt road.
  const termZ = i.maxZ - 70;
  const t1x = i.minX + 260, t2x = i.minX + 560;
  stone.box(t1x, 0.15, termZ, 220, 18, 46, 0xe8e4dc, { topBuilder: roof, topTile: 10 });
  glass.box(t1x, 0.15, termZ + 23.05, 210, 15, 0.2, 0x9ab8d0, { tileW: GLASS_TILE.w, tileH: GLASS_TILE.h, top: false });
  stone.box(t1x, 18.15, termZ + 8, 236, 1.2, 70, 0xf4f2ee); // the big canopy roof
  for (let x = t1x - 105; x <= t1x + 105; x += 15) put(stone, G.cyl8, x, 9.6, termZ + 38, 0xdcdcdc, 0, 0.5, 18, 0.5);
  colliders.addCentered(t1x, termZ, 220, 46, 19, 'building');
  // T2: timber-and-glass, with a green roof garden and hanging plants.
  glass.box(t2x, 0.15, termZ, 240, 16, 50, 0xb8d0c8, { tileW: GLASS_TILE.w, tileH: GLASS_TILE.h, top: false });
  stone.box(t2x, 16.15, termZ, 252, 1.2, 62, 0x9a6a3a);
  B.get('grass').rect(t2x - 120, t2x + 120, termZ - 28, termZ + 28, 17.4, 0x6a9a3a, (x, z) => [x / 6, -z / 6]);
  for (let x = t2x - 110; x <= t2x + 110; x += 12) { put(stone, G.cyl8, x, 8, termZ + 26, 0xb08050, 0, 0.6, 16, 0.6); put(stone, G.sphere, x, 14.5, termZ + 26, 0x4a8a2a, 0, 2.2, 1.6, 2.2); }
  colliders.addCentered(t2x, termZ, 240, 50, 17, 'building');
  signs.push({ key: 'kia1', text: ['ಕೆಂಪೇಗೌಡ ಅಂತರರಾಷ್ಟ್ರೀಯ ವಿಮಾನ ನಿಲ್ದಾಣ', 'KEMPEGOWDA INTERNATIONAL AIRPORT BENGALURU'], x: t1x, y: 21.5, z: termZ + 43.1, w: 120, h: 6, face: 's', bg: '#0f2a4a', fg: '#ffffff' });
  signs.push({ key: 'kia2', text: ['TERMINAL 2', 'ಟರ್ಮಿನಲ್ 2'], x: t2x, y: 19.2, z: termZ + 31.1, w: 40, h: 5, face: 's', bg: '#3a5a2a', fg: '#f4f0e0' });
  signs.push({ key: 'kia3', text: ['TERMINAL 1 · DEPARTURES', 'ನಿರ್ಗಮನ'], x: t1x, y: 15, z: termZ + 23.3, w: 40, h: 4, face: 's', bg: '#1a1a1a', fg: '#f2c200' });
  // Control tower.
  const cx = i.minX + 410, cz = az1 - 30;
  put(stone, G.cyl, cx, 26, cz, 0xe8e4dc, 0, 3.5, 52, 3.5);
  put(glass, G.cyl8, cx, 55, cz, 0x406080, 0, 7, 6, 7);
  put(stone, G.cyl8, cx, 58.5, cz, 0xf2f2f2, 0, 7.6, 1, 7.6);
  colliders.addCentered(cx, cz, 8, 8, 60, 'building');
  // Parked jets at the stands in front of the terminals.
  const stands = [];
  for (let k = 0; k < 9; k++) stands.push({ x: i.minX + 170 + k * 52, z: termZ - 62 });
  stands.forEach((st, k) => {
    const f = makeFrame(st.x, st.z, -Math.PI / 2); // nose towards the terminal (+z)
    B.xf = f;
    buildPlane(B.get('stone'), LIVERIES[k % LIVERIES.length]);
    B.xf = null;
    colliders.addCentered(st.x, st.z, 5, 36, 6, 'building');
    colliders.addCentered(st.x, st.z - 1.5, 34, 6, 4, 'low');
  });
  // Perimeter fence with the gate on the forecourt side.
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    B.xf = makeFrame((x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0));
    B.get('metal').box(0, 0.15, 0, len, 2.6, 0.08, 0x9aa0a6);
    B.xf = null;
    colliders.addSegment(x0, z0, x1, z1, 0.3, 2.8, 'wall');
  };
  fence(i.minX, i.minZ, i.maxX, i.minZ); fence(i.maxX, i.minZ, i.maxX, i.maxZ); fence(i.minX, i.minZ, i.minX, i.maxZ);
  fence(i.minX, az1 + 10, t1x - 120, az1 + 10); fence(t2x + 130, az1 + 10, i.maxX, az1 + 10);
  // Departures: one jet at a time taxis onto the runway, rolls, rotates and climbs away.
  const pb = new BuilderSet();
  buildPlane(pb.get('m'), LIVERIES[0]);
  const plane = new THREE.Group();
  plane.userData.dynamic = true;
  pb.buildAll({ m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 }) }, plane, { m: { castShadow: false } });
  group.add(plane);
  let t = 20, liv = 0;
  const paint = (k) => {
    const L = LIVERIES[k], old = LIVERIES[(k + LIVERIES.length - 1) % LIVERIES.length];
    plane.traverse((o) => {
      if (!o.isMesh) return;
      const c = o.geometry.attributes.color;
      for (const [from, to] of [[old.tail, L.tail], [old.belly, L.belly]]) {
        const a = new THREE.Color(from), b2 = new THREE.Color(to);
        for (let q = 0; q < c.count; q++) if (Math.abs(c.getX(q) - a.r) < 0.004 && Math.abs(c.getY(q) - a.g) < 0.004 && Math.abs(c.getZ(q) - a.b) < 0.004) c.setXYZ(q, b2.r, b2.g, b2.b);
      }
      c.needsUpdate = true;
    });
  };
  ctx.anims.push((dt) => {
    t += dt;
    const cycle = 90;
    if (t > cycle) { t = 0; liv = (liv + 1) % LIVERIES.length; paint(liv); }
    const roll = rx1 - rx0 - 200;
    let x, yy = 0, pitch = 0, vis = true;
    plane.rotation.order = 'YZX';
    let yaw = 0;
    if (t < 25) {
      // Taxi north from the taxiway onto the runway, then line up facing east.
      x = rx0 + 60; vis = t > 2;
      plane.position.set(x, 0.17, tz + (rz - tz) * Math.min(1, t / 20));
      yaw = t < 20 ? Math.PI / 2 : (Math.PI / 2) * (1 - (t - 20) / 5);
    } else {
      const tt = t - 25, a = 2.2, d = 0.5 * a * tt * tt;
      x = rx0 + 60 + Math.min(d, roll + 3000);
      if (d > roll) { const over = d - roll; yy = over * Math.tan(0.14); pitch = Math.min(0.16, over / 150); }
      vis = yy < 900;
      plane.position.set(x, 0.17 + yy, rz);
    }
    plane.rotation.set(0, yaw, pitch);
    plane.visible = vis;
  });
  return { name: 'Kempegowda International Airport', x: t1x, z: termZ + 50 };
}

// International Tech Park Bangalore (ITPL), Whitefield: glass towers named after explorers.
function itpl(ctx, block) {
  const { B, colliders, signs, plaza } = ctx;
  const { cx, cz, w, d } = centre(block);
  plaza(block, 0xe4e0d8);
  const glass = B.get('glass'), stone = B.get('stone'), roof = B.get('roof');
  const names = ['DISCOVERER', 'INNOVATOR', 'CREATOR', 'VOYAGER'];
  const cells = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
  cells.forEach(([fx, fz], k) => {
    const x = cx + fx * w, z = cz + fz * d, H = 38 + k * 9;
    const s = Math.min(w, d) * 0.32;
    glass.box(x, 0.15, z, s, H, s * 0.8, [0xa8c4dc, 0xb8d4c8, 0xc0c8dc, 0xa0b8d0][k], { tileW: GLASS_TILE.w, tileH: GLASS_TILE.h, topBuilder: roof });
    stone.box(x, H + 0.15, z, s + 0.6, 1.2, s * 0.8 + 0.6, 0xe8e8e8);
    colliders.addCentered(x, z, s, s * 0.8, H + 2, 'building');
    signs.push({ key: 'itpl' + k, text: [names[k]], x, y: H - 3, z: z + s * 0.4 + 0.05, w: s * 0.8, h: 2.4, face: 's', bg: '#0f2a4a', fg: '#ffffff' });
  });
  signs.push({ key: 'itplGate', text: ['ITPL', 'INTERNATIONAL TECH PARK BANGALORE'], x: cx, y: 4, z: block.inner.maxZ - 1, w: 16, h: 3, face: 's', bg: '#ffffff', fg: '#0f2a4a' });
  stone.box(cx, 0.15, block.inner.maxZ - 1.2, 18, 2.4, 0.6, 0x2a2a2a);
  return { name: 'ITPL', x: cx, z: block.inner.maxZ + 3 };
}

// ---------------------------------------------------------------------------------------------
// Palaces, temples, a stadium, campuses and the exhibition centre.
const BARREL = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, 0, Math.PI); // half cylinder: an arch along x after rz = PI/2
const TAPER = new THREE.CylinderGeometry(0.8, 1, 1, 16);
const TORUS = new THREE.TorusGeometry(1, 0.18, 6, 20);
const ARCH = new THREE.TorusGeometry(1, 0.1, 4, 12, Math.PI);
const FLAG = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 2.6), new THREE.Vector2(4.2, 1.3)]));
const _up = new THREE.Vector3(0, 1, 0);

// A cylinder (or any y-aligned unit geometry) from one point to another, r thick.
function seg(b, geo, x0, y0, z0, x1, y1, z1, r, color) {
  _s.set(x1 - x0, y1 - y0, z1 - z0);
  const l = _s.length();
  _q.setFromUnitVectors(_up, _s.normalize());
  _m.compose(_p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _q, _s.set(r, l, r));
  b.addGeometry(geo, _m, color);
}

// Centre for a w x d footprint at the block's real site (clamped inside it), for big rural blocks.
function siteCentre(block, w, d) {
  const i = block.inner, [sx, sz] = block.siteAt || [(i.minX + i.maxX) / 2, (i.minZ + i.maxZ) / 2];
  const cl = (v, a, b) => (a > b ? (a + b) / 2 : Math.min(b, Math.max(a, v)));
  return { cx: cl(sx, i.minX + w / 2, i.maxX - w / 2), cz: cl(sz, i.minZ + d / 2, i.maxZ - d / 2) };
}

// Merlons along the top edges of a w x d box.
function battlements(b, cx, cz, w, d, y, color, step = 2) {
  for (let x = -w / 2 + step / 4; x < w / 2; x += step) for (const s of [-1, 1]) b.box(cx + x + step / 4, y, cz + s * (d / 2 - 0.3), step / 2, 1.1, 0.6, color);
  for (let z = -d / 2 + step * 1.25; z < d / 2 - step; z += step) for (const s of [-1, 1]) b.box(cx + s * (w / 2 - 0.3), y, cz + z, 0.6, 1.1, step / 2, color);
}

// A round tower with a corbelled, crenellated top and a conical roof.
function turret(b, x, z, r, h, wall, roofC, roofH) {
  put(b, G.cyl8, x, 0.15 + h / 2, z, wall, 0, r, h, r);
  put(b, G.cyl8, x, h + 0.15, z, wall, 0, r + 0.4, 0.8, r + 0.4);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; put(b, G.box, x + Math.cos(a) * (r + 0.1), h + 1.1, z + Math.sin(a) * (r + 0.1), wall, -a, 0.5, 1.2, 0.9); }
  if (roofH) put(b, G.cone, x, h + 0.55 + roofH / 2, z, roofC, 0, r * 0.95, roofH, r * 0.95);
}

function kalasha(b, x, y, z) {
  put(b, G.sphere, x, y + 0.3, z, 0xd8a838, 0, 0.32, 0.32, 0.32);
  put(b, G.cone, x, y + 0.85, z, 0xd8a838, 0, 0.14, 0.6, 0.14);
}

// A south-facing Dravidian gateway tower: the doorway storey, receding tiers with cornices and
// rows of little shrines, then a barrel-vaulted crown with kalashas. Returns the top height.
function gopuram(b, x, y, z, w, d, tiers, color, accent) {
  const bh = 4.2;
  b.box(x, y, z, w, bh, d, color);
  for (const s of [-1, 1]) b.box(x, y, z + s * (d / 2 + 0.02), w * 0.32, bh * 0.75, 0.06, 0x2a2018); // doorways
  let yy = y + bh, tw = w, td = d;
  for (let k = 0; k < tiers; k++) {
    const th = 2.1 - k * 0.12;
    b.box(x, yy, z, tw + 0.4, 0.35, td + 0.4, accent);
    tw *= 0.87; td *= 0.85;
    b.box(x, yy + 0.35, z, tw, th, td, color);
    const n = Math.max(2, Math.round(tw / 1.6));
    for (let q = 0; q < n; q++) for (const s of [-1, 1]) b.box(x - tw / 2 + (q + 0.5) * (tw / n), yy + 0.35 + th, z + s * (td / 2 - 0.25), 0.5, 0.6, 0.5, q % 2 ? accent : color);
    yy += 0.35 + th;
  }
  put(b, BARREL, x, yy, z, color, 0, 1.6, tw * 0.95, td / 2, 0, Math.PI / 2);
  const n = Math.max(3, Math.round(tw / 1.5)) | 1;
  for (let q = 0; q < n; q++) kalasha(b, x - tw * 0.42 + (q * tw * 0.84) / (n - 1), yy + 1.5, z);
  return yy + 2.4;
}

// Bangalore Palace: Tudor-style granite, battlements, round towers with slate cones. In the
// Palace Grounds, facing south.
function bangalorePalace(ctx, block) {
  const { B, colliders, signs } = ctx;
  const { cx, cz } = centre(block);
  const her = B.get('heritage'), stone = B.get('stone'), roof = B.get('roof');
  const wall = 0xb4a68e, trim = 0xe6dcc6, slate = 0x4c525e, dark = 0x2a2622;
  const ht = { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 10 };
  stone.box(cx, 0.15, cz - 2, 64, 0.8, 30, 0x8f8676);
  // Main range and the two deeper end wings.
  her.box(cx, 0.15, cz, 52, 13, 16, wall, ht);
  stone.box(cx, 6.8, cz, 52.4, 0.45, 16.4, trim);
  battlements(stone, cx, cz, 52, 16, 13.15, wall);
  colliders.addCentered(cx, cz, 52, 16, 14, 'building');
  for (const s of [-1, 1]) {
    her.box(cx + s * 24, 0.15, cz - 3, 12, 15, 26, wall, ht);
    stone.box(cx + s * 24, 7.6, cz - 3, 12.4, 0.45, 26.4, trim);
    battlements(stone, cx + s * 24, cz - 3, 12, 26, 15.15, wall);
    colliders.addCentered(cx + s * 24, cz - 3, 12, 26, 16, 'building');
    turret(stone, cx + s * 30, cz + 10, 3.4, 19, wall, slate, 7);
    turret(stone, cx + s * 30, cz - 16, 3, 17, wall, slate, 6);
    turret(stone, cx + s * 6.5, cz + 9.5, 1.6, 21, wall, slate, 5); // slender turrets either side of the entrance
    colliders.addCentered(cx + s * 30, cz + 10, 7, 7, 20, 'building');
    colliders.addCentered(cx + s * 30, cz - 16, 6, 6, 18, 'building');
    colliders.addCentered(cx + s * 6.5, cz + 9.5, 3.2, 3.2, 21, 'building');
  }
  // Entrance tower and the porch below it.
  her.box(cx, 0.15, cz + 4, 11, 22, 11, wall, ht);
  stone.box(cx, 11.4, cz + 4, 11.4, 0.45, 11.4, trim);
  battlements(stone, cx, cz + 4, 11, 11, 22.15, wall);
  put(stone, G.cone4, cx, 26.8, cz + 4, slate, Math.PI / 4, 6.5, 8, 6.5);
  stone.box(cx, 0.15, cz + 12.5, 10, 6.5, 6, wall);
  battlements(stone, cx, cz + 12.5, 10, 6, 6.65, wall, 1.6);
  stone.box(cx, 0.15, cz + 15.52, 4.2, 4.6, 0.08, dark);
  for (const s of [-1, 1]) stone.box(cx + s * 5.02, 0.15, cz + 12.5, 0.06, 4.2, 2.8, dark);
  colliders.addCentered(cx, cz + 7, 11, 17, 23, 'building');
  // Name board on the drive.
  stone.box(cx, 0.15, cz + 26, 11, 2.7, 0.4, 0x6a5a48);
  signs.push({ key: 'palace', text: ['ಬೆಂಗಳೂರು ಅರಮನೆ', 'BANGALORE PALACE'], x: cx, y: 1.85, z: cz + 26.25, w: 10, h: 1.9, face: 's', bg: '#3a2a1a', fg: '#f0deb0' });
  colliders.addCentered(cx, cz + 26, 11, 0.5, 2.8, 'wall');
  return { name: 'Bangalore Palace', x: cx, z: cz + 32 };
}

// Dodda Basavana Gudi (the Bull Temple), Basavanagudi: a granite shrine on Bugle Rock with the
// great black monolithic Nandi in its pillared hall.
function bullTemple(ctx, block) {
  const { B, colliders, signs } = ctx;
  const { cx, cz } = centre(block);
  ctx.lawn(block, 0x8a9a5a);
  const stone = B.get('stone');
  const granite = 0x9c968a, plaster = 0xf0e6cc, ochre = 0xc0703a, black = 0x232325;
  // Bugle Rock: boulders round the back of the temple.
  const rocks = [[-20, -14, 7, 4], [-12, -20, 8, 5], [0, -22, 9, 5.5], [13, -19, 7, 4.5], [21, -12, 6, 3.5], [-24, -2, 5, 3], [24, 0, 4.5, 2.6], [-6, -27, 6, 3.6], [8, -28, 5, 3]];
  rocks.forEach(([dx, dz, r, h], k) => {
    put(stone, G.sphere, cx + dx, 0.15, cz + dz, k % 2 ? 0x6e6a62 : 0x7e7970, k, r, h, r * 0.8);
    colliders.addCentered(cx + dx, cz + dz, r * 1.4, r * 1.2, h, 'building');
  });
  // Granite platform with steps up from the street.
  stone.box(cx, 0.15, cz, 26, 1.6, 30, granite);
  for (let k = 0; k < 4; k++) stone.box(cx, 0.15, cz + 15 + k * 0.8 + 0.4, 8, 1.6 - (k + 1) * 0.4, 0.8, granite);
  colliders.addCentered(cx, cz, 26, 30, 1.6, 'plinth');
  const y0 = 1.75;
  // Sanctum with its vimana.
  stone.box(cx, y0, cz - 9, 10, 6, 10, granite);
  for (let k = 0; k < 3; k++) stone.box(cx, y0 + 6 + k * 1.6, cz - 9, 8.6 - k * 2.2, 1.6, 8.6 - k * 2.2, k % 2 ? plaster : 0xe6dcc4);
  put(stone, G.sphere, cx, y0 + 10.8, cz - 9, plaster, 0, 2.2, 1.8, 2.2);
  kalasha(stone, cx, y0 + 12.4, cz - 9);
  colliders.addCentered(cx, cz - 9, 10, 10, 14, 'building');
  // The pillared mandapa, open at the sides.
  const mz = cz + 0.5;
  stone.box(cx, y0, mz, 12, 0.4, 10, granite);
  stone.box(cx, y0 + 5.4, mz, 13, 0.7, 11, granite);
  stone.box(cx, y0 + 6.1, mz, 12, 0.6, 10, plaster);
  for (const [x, z] of [[-5.4, -4], [5.4, -4], [-5.4, 0.5], [5.4, 0.5], [-5.4, 4.5], [5.4, 4.5], [-1.8, 4.5], [1.8, 4.5]]) {
    put(stone, G.box, cx + x, y0 + 2.9, mz + z, granite, 0, 0.7, 5, 0.7);
    colliders.addCentered(cx + x, mz + z, 0.8, 0.8, 7, 'pole');
  }
  // Nandi, seated, garlanded with marigolds.
  const ny = y0 + 0.4;
  stone.box(cx, ny, mz, 4.4, 0.6, 6.4, granite);
  put(stone, G.box, cx, ny + 1.1, mz, black, 0, 3.4, 1.1, 5.0);
  put(stone, G.sphere, cx, ny + 2.0, mz - 0.4, black, 0, 1.7, 1.6, 2.9);
  put(stone, G.sphere, cx, ny + 3.2, mz + 1.2, black, 0, 1.0, 0.9, 1.0);
  put(stone, G.sphere, cx, ny + 3.4, mz + 2.5, black, 0, 0.75, 0.95, 1.0);
  put(stone, G.sphere, cx, ny + 3.0, mz + 3.2, black, 0, 0.55, 0.5, 0.6);
  for (const s of [-1, 1]) {
    put(stone, G.cone, cx + s * 0.6, ny + 4.5, mz + 2.3, black, 0, 0.18, 0.9, 0.18, 0, -s * 0.5);
    put(stone, G.sphere, cx + s * 0.95, ny + 3.8, mz + 2.4, black, 0, 0.35, 0.18, 0.25);
  }
  put(stone, TORUS, cx, ny + 2.9, mz + 2.0, 0xf09a20, 0, 1.0, 1.0, 1.2, 0.3);
  colliders.addCentered(cx, mz, 4.4, 6.4, 5, 'building');
  // Gopuram over the entrance at the top of the steps.
  gopuram(stone, cx, y0, cz + 11.5, 9, 5, 5, plaster, ochre);
  colliders.addCentered(cx - 3.2, cz + 11.5, 2.6, 5, 16, 'building');
  colliders.addCentered(cx + 3.2, cz + 11.5, 2.6, 5, 16, 'building');
  stone.box(cx + 10, 0.15, cz + 18.8, 8.4, 2.4, 0.3, 0x5a1a12);
  signs.push({ key: 'bullTemple', text: ['ದೊಡ್ಡ ಬಸವನ ಗುಡಿ', 'DODDA BASAVANA GUDI · BULL TEMPLE'], x: cx + 10, y: 1.5, z: cz + 18.98, w: 8, h: 1.6, face: 's', bg: '#7a1a12', fg: '#f8e0a0' });
  colliders.addCentered(cx + 10, cz + 18.8, 8.4, 0.4, 2.5, 'wall');
  ctx.trees(cx, cz, 0, 0, block);
  return { name: 'Bull Temple', x: cx, z: cz + 24 };
}

// Tipu Sultan's Summer Palace, near K.R. Market: two storeys of teak pillars and cusped arches
// on a stone plinth, with little minarets at the corners of the roof.
function tipuPalace(ctx, block) {
  const { B, colliders, signs } = ctx;
  const i = block.inner;
  const { cx, cz } = centre(block);
  ctx.lawn(block, 0x6f8f48);
  const stone = B.get('stone'), plaster = B.get('plaster');
  const teak = 0x6b3f22, wall = 0x9c5434, cream = 0xe8dcc0;
  const W = 36, D = 18, y0 = 1.35;
  stone.box(cx, 0.15, cz, W + 4, 1.2, D + 4, 0xb4a488);
  for (let k = 0; k < 3; k++) stone.box(cx, 0.15, cz + D / 2 + 2 + k * 0.6 + 0.3, 8, 0.9 - k * 0.3, 0.6, 0xb4a488);
  const ft = { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, top: false };
  plaster.box(cx, y0, cz, W - 6, 5, D - 6, wall, ft);
  stone.box(cx, y0 + 5, cz, W, 0.6, D, teak);
  plaster.box(cx, y0 + 5.6, cz, W - 8, 4.4, D - 8, wall, ft);
  stone.box(cx, y0 + 10, cz, W + 0.6, 0.5, D + 0.6, teak);
  stone.box(cx, y0 + 10.5, cz, W - 1, 0.1, D - 1, 0x8a6a4a);
  // Verandahs: pillars and cusped arches on both floors, all the way round.
  for (const [y, h, r] of [[y0, 5, 0.32], [y0 + 5.6, 4.4, 0.26]]) {
    const bx = (W - 1.2) / 12, bz = (D - 1.2) / 6;
    for (let k = 0; k <= 12; k++) {
      const x = cx - W / 2 + 0.6 + k * bx;
      for (const s of [-1, 1]) {
        put(stone, G.cyl8, x, y + h / 2, cz + s * (D / 2 - 0.6), teak, 0, r, h, r);
        if (k < 12) put(stone, ARCH, x + bx / 2, y + h - bx / 2 - 0.15, cz + s * (D / 2 - 0.6), teak, 0, bx / 2, bx / 2, 1.5);
      }
    }
    for (let k = 0; k <= 6; k++) {
      const z = cz - D / 2 + 0.6 + k * bz;
      for (const s of [-1, 1]) {
        if (k > 0 && k < 6) put(stone, G.cyl8, cx + s * (W / 2 - 0.6), y + h / 2, z, teak, 0, r, h, r);
        if (k < 6) put(stone, ARCH, cx + s * (W / 2 - 0.6), y + h - bz / 2 - 0.15, z + bz / 2, teak, Math.PI / 2, bz / 2, bz / 2, 1.5);
      }
    }
  }
  // Balustrade round the upper floor.
  for (const s of [-1, 1]) {
    stone.box(cx, y0 + 5.6, cz + s * (D / 2 - 0.6), W - 1.2, 0.9, 0.12, teak);
    stone.box(cx + s * (W / 2 - 0.6), y0 + 5.6, cz, 0.12, 0.9, D - 1.2, teak);
    stone.box(cx, y0 + 10.5, cz + s * (D / 2 + 0.1), W + 0.6, 0.7, 0.3, cream);
    stone.box(cx + s * (W / 2 + 0.1), y0 + 10.5, cz, 0.3, 0.7, D + 0.6, cream);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = cx + sx * (W / 2 - 0.1), z = cz + sz * (D / 2 - 0.1);
    put(stone, G.cyl8, x, y0 + 11.6, z, cream, 0, 0.45, 2.2, 0.45);
    put(stone, G.sphere, x, y0 + 12.9, z, cream, 0, 0.6, 0.75, 0.6);
    put(stone, G.cone, x, y0 + 13.9, z, 0xc8a040, 0, 0.12, 0.8, 0.12);
  }
  colliders.addCentered(cx, cz, W + 4, D + 4, 1.35, 'plinth');
  colliders.addCentered(cx, cz, W, D, 14, 'building');
  // Garden path from the street, and the board.
  B.get('plaza').rect(cx - 2.5, cx + 2.5, cz + D / 2 + 4, i.maxZ, 0.17, 0xc8a080, (x, z) => [x / 4, -z / 4]);
  const sz = Math.min(i.maxZ - 3, cz + D / 2 + 9);
  stone.box(cx + 7, 0.15, sz, 9.6, 2.4, 0.3, 0x3a2a1a);
  signs.push({ key: 'tipuPalace', text: ['ಟಿಪ್ಪು ಸುಲ್ತಾನನ ಬೇಸಿಗೆ ಅರಮನೆ', "TIPU SULTAN'S SUMMER PALACE"], x: cx + 7, y: 1.5, z: sz + 0.18, w: 9.2, h: 1.6, face: 's', bg: '#4a2a14', fg: '#f4e2b0' });
  colliders.addCentered(cx + 7, sz, 9.6, 0.4, 2.5, 'wall');
  for (const [dx, dz] of [[-24, -10], [-24, 8], [24, -10], [24, 8], [-12, 16], [14, 16]]) ctx.trees(cx + dx, cz + dz, 0, 1);
  return { name: "Tipu Sultan's Summer Palace", x: cx, z: cz + D / 2 + 12 };
}

// Sir Puttanna Chetty Town Hall: neoclassical, on a podium with a grand flight of steps and a
// colonnaded portico.
function townHall(ctx, block) {
  const { B, colliders, signs } = ctx;
  const { cx, cz } = centre(block);
  ctx.plaza(block, 0xd8d2c4);
  const her = B.get('heritage'), stone = B.get('stone'), roof = B.get('roof');
  const cream = 0xf0e8d6, grey = 0xc8c0b0, white = 0xf8f4ea;
  stone.box(cx, 0.15, cz, 46, 2.2, 32, grey);
  for (let k = 0; k < 7; k++) stone.box(cx, 0.15, cz + 16 + k * 0.9 + 0.45, 30, 2.2 - (k + 1) * 0.3, 0.9, k % 2 ? grey : 0xd0c8b8);
  colliders.addCentered(cx, cz, 46, 32, 2.2, 'plinth');
  const y0 = 2.35;
  her.box(cx, y0, cz - 3, 40, 13, 24, cream, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 10 });
  stone.box(cx, y0 + 13, cz - 3, 41, 1.2, 25, white);
  stone.box(cx, y0 + 14.2, cz - 3, 40, 1.0, 24, cream);
  for (const k of [-1, 0, 1]) stone.box(cx + k * 7, y0, cz + 9.05, 2.8, 5, 0.1, 0x3a2a1a);
  colliders.addCentered(cx, cz - 3, 41, 25, 16, 'building');
  // Portico: eight columns under the entablature, and an attic over it.
  const pz = cz + 13;
  for (let k = 0; k < 8; k++) {
    const x = cx - 14 + k * 4;
    stone.box(x, y0, pz, 2, 0.8, 2, grey);
    put(stone, G.cyl, x, y0 + 5.6, pz, white, 0, 0.75, 9.6, 0.75);
    stone.box(x, y0 + 10.4, pz, 2, 1, 2, white);
    colliders.addCentered(x, pz, 1.6, 1.6, 12, 'pole');
  }
  stone.box(cx, y0 + 11.4, pz - 2.5, 32, 2.2, 7, white);
  stone.box(cx, y0 + 13.6, pz - 1.5, 20, 2.6, 2, cream);
  signs.push({ key: 'townHall', text: ['ಸರ್ ಪುಟ್ಟಣ್ಣ ಚೆಟ್ಟಿ ಪುರಭವನ', 'SIR PUTTANNA CHETTY TOWN HALL'], x: cx, y: y0 + 12.5, z: pz + 1.05, w: 24, h: 1.8, face: 's', bg: '#f8f4ea', fg: '#5a3a1a' });
  // Lamp posts flanking the steps.
  for (const s of [-1, 1]) {
    const x = cx + s * 17, z = cz + 20;
    put(stone, G.cyl8, x, 2.4, z, 0x222222, 0, 0.14, 4.5, 0.14);
    put(stone, G.sphere, x, 4.9, z, 0xfff4d0, 0, 0.45, 0.45, 0.45);
    colliders.addCentered(x, z, 0.5, 0.5, 5, 'pole');
  }
  ctx.trees(cx, cz, 0, 0, block);
  return { name: 'Town Hall', x: cx, z: cz + 30 };
}

// Stadium-shaped outline (two straights of length L joined by semicircles of radius r), flat.
const ovalPts = (L, r, n = 20) => {
  const pts = [];
  for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + (k / n) * Math.PI; pts.push(new THREE.Vector2(L / 2 + Math.cos(a) * r, Math.sin(a) * r)); }
  for (let k = 0; k <= n; k++) { const a = Math.PI / 2 + (k / n) * Math.PI; pts.push(new THREE.Vector2(-L / 2 + Math.cos(a) * r, Math.sin(a) * r)); }
  return pts;
};
function ovalGeo(L, r0, r1) {
  const s = new THREE.Shape(ovalPts(L, r1));
  if (r0 > 0) s.holes.push(new THREE.Path(ovalPts(L, r0).reverse()));
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  return g;
}

// Sree Kanteerava Stadium: the athletics stadium by Cubbon Park. A red eight-lane track round a
// football pitch, a covered grandstand on the north side, open terraces and floodlights.
function kanteerava(ctx, block) {
  const { B, colliders, signs } = ctx;
  const { cx, cz } = centre(block);
  // No plaza fill: its depth offset would win over the track. The block's paving shows instead.
  const stone = B.get('stone'), metal = B.get('metal'), glow = B.get('glow');
  const L = 60, r = 25, R = 33, y = 0.22, white = 0xf2f2f2;
  const conc = 0xb8b2a8, seat = 0x2a5a9a, seat2 = 0xc8c0b4;
  put(stone, ovalGeo(L, R, R + 3), cx, y, cz, 0xa8a49c);
  put(stone, ovalGeo(L, r, R), cx, y, cz, 0xb5523a);
  put(stone, ovalGeo(L, 0, r), cx, y, cz, 0x4f9a42);
  for (let k = 0; k <= 8; k++) put(stone, ovalGeo(L, r + k - 0.06, r + k + 0.06), cx, y + 0.04, cz, white);
  // The football pitch in the middle.
  for (const s of [-1, 1]) {
    stone.box(cx + s * 34, y + 0.02, cz, 0.15, 0.02, 44, white, { sides: false });
    stone.box(cx, y + 0.02, cz + s * 22, 68, 0.02, 0.15, white, { sides: false });
    stone.box(cx + s * 34.6, y, cz, 0.2, 2.4, 7.3, 0xf4f4f4, { top: false });
    stone.box(cx + s * 34.6, y + 2.4, cz, 0.2, 0.15, 7.3, 0xf4f4f4);
  }
  stone.box(cx, y + 0.02, cz, 0.15, 0.02, 44, white, { sides: false });
  put(stone, new THREE.RingGeometry(6.8, 7, 32).rotateX(-Math.PI / 2), cx, y + 0.04, cz, white);
  // Covered grandstand along the north straight.
  const r0 = R + 3, gateW = 10;
  for (let k = 0; k < 6; k++) stone.box(cx, 0.15, cz - (r0 + k * 2 + 1), L + 10, 1.2 + k * 1.6, 2, k % 2 ? seat : conc);
  const gz = cz - (r0 + 13);
  stone.box(cx, 0.15, gz, L + 12, 14, 1.2, conc);
  for (let x = -L / 2 - 4; x <= L / 2 + 4; x += 8) put(metal, G.cyl8, cx + x, 7.2, gz + 1, 0x8a9aa8, 0, 0.3, 14, 0.3);
  metal.box(cx, 14.15, gz + 6, L + 14, 0.5, 15, 0xe8e8e8);
  colliders.addCentered(cx, cz - (r0 + 6.5), L + 12, 14, 14, 'building');
  // Open terraces along the south straight, either side of the gate, and round the curved ends.
  const sw = (L + 8 - gateW) / 2;
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) stone.box(cx + s * (gateW / 2 + sw / 2), 0.15, cz + r0 + k * 2 + 1, sw, 1 + k * 1.1, 2, k % 2 ? seat2 : conc);
  for (const s of [-1, 1]) colliders.addCentered(cx + s * (gateW / 2 + sw / 2), cz + r0 + 5, sw, 10, 5.5, 'building');
  for (const s of [-1, 1]) {
    const N = 10;
    for (let q = 0; q < N; q++) {
      const a = -Math.PI / 2 + ((q + 0.5) / N) * Math.PI;
      for (let k = 0; k < 4; k++) {
        const rr = r0 + k * 2 + 1, h = 1 + k * 1.1;
        put(stone, G.box, cx + s * (L / 2 + Math.cos(a) * rr), 0.15 + h / 2, cz + Math.sin(a) * rr, k % 2 ? seat2 : conc, s > 0 ? -a : a + Math.PI, 2, h, (Math.PI * rr) / N + 0.4);
      }
    }
    colliders.addCentered(cx + s * (L / 2 + r0 + 4), cz, 8, 2 * (r0 + 4), 5.5, 'building');
    for (const sz of [-1, 1]) colliders.addCentered(cx + s * (L / 2 + (r0 + 4) * 0.72), cz + sz * (r0 + 4) * 0.72, 10, 10, 5.5, 'building');
  }
  // The gate arch.
  const az = cz + r0 + 11;
  for (const s of [-1, 1]) { stone.box(cx + s * (gateW / 2 + 1), 0.15, az, 2, 8, 2, 0xd8cfbf); colliders.addCentered(cx + s * (gateW / 2 + 1), az, 2, 2, 8, 'pole'); }
  stone.box(cx, 8.15, az, gateW + 4, 2.4, 2, 0xd8cfbf);
  signs.push({ key: 'kanteerava', text: ['ಶ್ರೀ ಕಂಠೀರವ ಕ್ರೀಡಾಂಗಣ', 'SREE KANTEERAVA STADIUM'], x: cx, y: 9.35, z: az + 1.05, w: 13, h: 2, face: 's', bg: '#1a4a8a', fg: '#ffffff' });
  signs.push({ key: 'kanteeravaN', text: ['ಶ್ರೀ ಕಂಠೀರವ ಕ್ರೀಡಾಂಗಣ', 'SREE KANTEERAVA STADIUM'], x: cx, y: 10.5, z: gz - 0.65, w: 26, h: 3.6, face: 'n', bg: '#1a4a8a', fg: '#ffffff' });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + sx * (L / 2 + R + 8), z = cz + sz * (R + 12);
    put(stone, G.cyl8, x, 16, z, 0x9a9a9a, 0, 0.5, 32, 0.5);
    stone.box(x, 32, z, 5, 3, 0.5, 0x555555);
    glow.box(x, 32.3, z - sz * 0.3, 4.4, 2.4, 0.1, 0xfffbe8, { top: false });
    colliders.addCentered(x, z, 1.2, 1.2, 33, 'pole');
  }
  return { name: 'Sree Kanteerava Stadium', x: cx, z: az + 6 };
}

// Manyata Embassy Business Park, Nagawara: banded glass office blocks round a green with a pond.
function manyata(ctx, block) {
  const { B, colliders, signs } = ctx;
  const i = block.inner;
  const { cx, cz, w, d } = centre(block);
  ctx.plaza(block, 0xe0dcd2);
  const glass = B.get('glass'), stone = B.get('stone'), roof = B.get('roof');
  B.get('grass').rect(cx - 36, cx + 36, cz - 20, cz + 30, 0.17, 0xffffff, (x, z) => [x / 6, -z / 6]);
  stone.box(cx, 0.15, cz + 6, 32, 0.4, 18, 0xbcb4a6);
  B.get('water').rect(cx - 15, cx + 15, cz - 2, cz + 14, 0.56, 0xffffff, (x, z) => [x / 40, -z / 40]);
  colliders.addCentered(cx, cz + 6, 32, 18, 0.6, 'low');
  const names = ['PINE', 'CEDAR', 'MAGNOLIA', 'MULBERRY', 'SILVER OAK'];
  const tints = [0x9ab8d0, 0xa8c4d8, 0x90b0c8, 0xb0c8d4, 0x98bcc8];
  const spots = [[-0.31, -0.3], [0, -0.33], [0.31, -0.3], [-0.33, 0.2], [0.33, 0.2]];
  spots.forEach(([fx, fz], k) => {
    const x = cx + fx * w, z = cz + fz * d, H = 30 + ((k * 3) % 5) * 4;
    const bw = Math.min(38, w * 0.25), bd = 20;
    stone.box(x, 0.15, z, bw + 4, 5, bd + 4, 0xe8e4dc, { topBuilder: roof });
    glass.box(x, 5.15, z, bw, H - 5, bd, tints[k], { tileW: GLASS_TILE.w, tileH: GLASS_TILE.h, topBuilder: roof, topTile: 10 });
    for (let yy = 9.15; yy < H; yy += 4) stone.box(x, yy, z, bw + 0.3, 0.45, bd + 0.3, 0xf4f4f0, { top: false });
    stone.box(x, H + 0.15, z, bw * 0.4, 3, bd * 0.4, 0xe0dcd4);
    colliders.addCentered(x, z, bw + 4, bd + 4, H + 3, 'building');
    signs.push({ key: 'manyata' + k, text: [names[k]], x, y: H - 2.5, z: z + bd / 2 + 0.2, w: Math.min(12, bw * 0.45), h: 2.2, face: 's', bg: '#12324a', fg: '#ffffff' });
  });
  // Gate on the south side.
  const gz = i.maxZ - 2;
  for (const s of [-1, 1]) { stone.box(cx + s * 10, 0.15, gz, 1.6, 6, 1.6, 0x2a3a4a); colliders.addCentered(cx + s * 10, gz, 1.6, 1.6, 6, 'pole'); }
  stone.box(cx, 6.15, gz, 21.6, 1.8, 1.4, 0x2a3a4a);
  signs.push({ key: 'manyataGate', text: ['ಮಾನ್ಯತಾ ಎಂಬಸಿ ಬಿಸಿನೆಸ್ ಪಾರ್ಕ್', 'MANYATA EMBASSY BUSINESS PARK'], x: cx, y: 7.05, z: gz + 0.75, w: 20, h: 1.6, face: 's', bg: '#2a3a4a', fg: '#ffffff' });
  ctx.trees(cx, cz + 6, 28, 12);
  return { name: 'Manyata Tech Park', x: cx, z: gz + 6 };
}

// The Shivoham Shiva temple behind Kemp Fort on Old Airport Road: a 65-foot Shiva seated in
// meditation before a rocky Mount Kailash, with a pond in front.
function kempfortShiva(ctx, block) {
  const { B, colliders, signs } = ctx;
  const { cx, cz } = centre(block);
  ctx.plaza(block, 0xd8d0c0);
  const stone = B.get('stone');
  const rock = 0x8c8a84, skin = 0x86a2c8, hair = 0x26282c, tiger = 0xc8883a;
  // Mount Kailash: a heap of rock with snow on top.
  const peaks = [[0, -15, 14, 24], [-11, -12, 10, 17], [11, -12, 10, 16], [-19, -6, 7, 10], [19, -6, 7, 9], [-6, -19, 9, 20], [7, -19, 9, 19]];
  peaks.forEach(([dx, dz, r, h], k) => put(stone, G.sphere, cx + dx, 0.15, cz + dz, k % 2 ? rock : 0x9a978e, k * 0.7, r, h, r * 0.85));
  put(stone, G.sphere, cx, 21.6, cz - 15, 0xf2f2ee, 0, 5, 3, 4.5);
  colliders.addCentered(cx, cz - 14, 46, 16, 22, 'building');
  // The statue on its rock seat.
  const sx = cx, sz = cz - 2, yb = 4.15;
  put(stone, G.cyl8, sx, 2.15, sz, rock, 0, 7.5, 4, 6.5);
  colliders.addCentered(sx, sz, 14, 12, 20, 'building');
  put(stone, G.sphere, sx, yb + 1.6, sz + 0.8, tiger, 0, 6.8, 2.0, 4.2); // crossed legs in tiger skin
  for (const s of [-1, 1]) put(stone, G.sphere, sx + s * 3.6, yb + 1.9, sz + 2.8, skin, 0, 1.4, 1.1, 1.3); // feet
  put(stone, TAPER, sx, yb + 6.2, sz, skin, 0, 2.8, 6.6, 2.0, Math.PI); // torso, broad at the chest
  put(stone, G.sphere, sx, yb + 9.6, sz, skin, 0, 3.8, 1.5, 2.2); // shoulders
  put(stone, G.cyl, sx, yb + 10.9, sz, skin, 0, 0.9, 1.6, 0.9);
  put(stone, TORUS, sx, yb + 10.8, sz, 0x3a5a3a, 0, 1.15, 1.15, 1.6, Math.PI / 2); // Vasuki round the neck
  put(stone, G.sphere, sx, yb + 12.8, sz + 0.1, skin, 0, 1.6, 2.0, 1.7);
  put(stone, G.sphere, sx, yb + 13.9, sz - 0.5, hair, 0, 1.75, 1.4, 1.6);
  put(stone, G.cone, sx, yb + 15.6, sz - 0.3, hair, 0, 1.3, 2.8, 1.3); // the jata
  put(stone, TORUS, sx + 0.9, yb + 15.2, sz + 0.4, 0xf4f0e0, 0, 0.5, 0.5, 0.6); // crescent moon
  for (const s of [-1, 1]) {
    seg(stone, G.cyl, sx + s * 3.5, yb + 9.6, sz, sx + s * 4.5, yb + 6.4, sz + 0.9, 0.75, skin);
    seg(stone, G.cyl, sx + s * 4.5, yb + 6.4, sz + 0.9, sx + s * 3.9, yb + 3.4, sz + 2.9, 0.6, skin);
    put(stone, G.sphere, sx + s * 3.9, yb + 3.3, sz + 3.1, skin, 0, 0.7, 0.5, 0.8);
  }
  // The trishul planted beside him, with its damaru.
  const tx = sx + 8, tz = sz + 1, steel = 0xb8b8b8;
  put(stone, G.cyl8, tx, 9, tz, 0x9a9a9a, 0, 0.18, 18, 0.18);
  stone.box(tx, 16.6, tz, 2.6, 0.3, 0.3, steel);
  put(stone, G.cone, tx, 18.4, tz, steel, 0, 0.3, 2.6, 0.14);
  for (const s of [-1, 1]) { seg(stone, G.cyl8, tx + s * 1.2, 16.7, tz, tx + s * 1.25, 18.2, tz, 0.13, steel); put(stone, G.cone, tx + s * 1.25, 18.6, tz, steel, 0, 0.16, 0.9, 0.1); }
  put(stone, G.cyl8, tx + 0.35, 14.6, tz, 0x8a5a2a, 0, 0.32, 0.7, 0.32);
  colliders.addCentered(tx, tz, 0.6, 0.6, 18, 'pole');
  // Pond in front, and the entrance arch.
  stone.box(cx, 0.15, cz + 12, 28, 0.5, 9, 0xb8b0a0);
  B.get('water').rect(cx - 13, cx + 13, cz + 8, cz + 16, 0.66, 0xffffff, (x, z) => [x / 40, -z / 40]);
  colliders.addCentered(cx, cz + 12, 28, 9, 0.7, 'low');
  const az = cz + 23;
  for (const s of [-1, 1]) { stone.box(cx + s * 7, 0.15, az, 1.6, 6, 1.6, 0x8a2a1a); colliders.addCentered(cx + s * 7, az, 1.6, 1.6, 6, 'pole'); }
  stone.box(cx, 6.15, az, 16, 1.8, 1.6, 0x8a2a1a);
  for (let k = 0; k < 3; k++) kalasha(stone, cx - 5 + k * 5, 7.95, az);
  signs.push({ key: 'kempfortShiva', text: ['ಶಿವೋಹಂ ಶಿವ ದೇವಾಲಯ', 'SHIVOHAM SHIVA TEMPLE'], x: cx, y: 7.05, z: az + 0.85, w: 14, h: 1.5, face: 's', bg: '#8a2a1a', fg: '#ffe8a0' });
  return { name: 'Kempfort Shiva Statue', x: cx, z: az + 6 };
}

// Indian Institute of Science: the grey stone Main Building with its central clock tower and
// domed cupola, J.N. Tata's statue on the lawn in front, and a lot of trees.
function iisc(ctx, block) {
  const { B, colliders, signs } = ctx;
  const i = block.inner;
  const { cx, cz } = centre(block);
  ctx.lawn(block, 0x5f8a3f);
  const her = B.get('heritage'), stone = B.get('stone'), roof = B.get('roof');
  const granite = 0x9e9a90, trim = 0xd8d2c4, slate = 0x6a6660;
  const ht = { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 10 };
  const bz = cz - 10;
  her.box(cx, 0.15, bz, 76, 12, 14, granite, ht);
  stone.box(cx, 12.15, bz, 77, 0.8, 15, trim);
  colliders.addCentered(cx, bz, 77, 15, 13, 'building');
  for (const s of [-1, 1]) {
    her.box(cx + s * 32, 0.15, bz + 6, 12, 13, 26, granite, ht);
    stone.box(cx + s * 32, 13.15, bz + 6, 13, 0.8, 27, trim);
    put(stone, G.cone4, cx + s * 32, 15.6, bz + 6, slate, Math.PI / 4, 8.8, 3.6, 18.6);
    colliders.addCentered(cx + s * 32, bz + 6, 13, 27, 16, 'building');
  }
  // Central tower: clock faces on all four sides and a domed cupola.
  const tz = bz + 7.5;
  her.box(cx, 0.15, tz, 11, 26, 11, granite, ht);
  stone.box(cx, 26.15, tz, 12, 0.8, 12, trim);
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const x = cx + nx * 5.56, z = tz + nz * 5.56;
    put(stone, G.cyl, x, 21, z, 0xf4f0e6, 0, 2.3, 0.1, 2.3, nz ? Math.PI / 2 : 0, nx ? Math.PI / 2 : 0);
    const hx = x + nx * 0.08, hz = z + nz * 0.08;
    stone.box(hx, 21, hz, nz ? 0.18 : 0.08, 1.5, nx ? 0.18 : 0.08, 0x1a1a1a);
    stone.box(hx + (nz ? 0.75 : 0), 20.9, hz + (nx ? 0.75 : 0), nz ? 1.5 : 0.08, 0.16, nx ? 1.5 : 0.08, 0x1a1a1a);
  }
  put(stone, G.cyl8, cx, 28.95, tz, granite, 0, 4.2, 4, 4.2);
  put(stone, G.dome, cx, 30.95, tz, 0x8a8478, 0, 4.4, 5, 4.4);
  put(stone, G.cone, cx, 36.6, tz, 0xc8a040, 0, 0.3, 1.6, 0.3);
  for (const k of [-1, 0, 1]) stone.box(cx + k * 3.2, 0.15, tz + 5.55, 2.2, 4.6, 0.1, 0x2a2622);
  colliders.addCentered(cx, tz, 11, 11, 34, 'building');
  // Drive, statue and the gate.
  B.get('plaza').rect(cx - 3, cx + 3, tz + 6, i.maxZ, 0.17, 0xc8bca8, (x, z) => [x / 4, -z / 4]);
  const sz = Math.min(i.maxZ - 14, tz + 24);
  stone.box(cx - 9, 0.15, sz, 3.2, 2.8, 3.2, 0xc8c0b0);
  put(stone, G.cone, cx - 9, 4.1, sz, 0x4a3e2c, 0, 0.8, 2.6, 0.6);
  put(stone, G.sphere, cx - 9, 5.7, sz, 0x4a3e2c, 0, 0.36, 0.42, 0.36);
  colliders.addCentered(cx - 9, sz, 3.2, 3.2, 6, 'building');
  const gz = i.maxZ - 1.5;
  for (const s of [-1, 1]) { stone.box(cx + s * 6, 0.15, gz, 1.4, 4.2, 1.4, granite); colliders.addCentered(cx + s * 6, gz, 1.4, 1.4, 4.2, 'pole'); }
  stone.box(cx, 4.35, gz, 13.4, 1.4, 1, granite);
  signs.push({ key: 'iisc', text: ['ಭಾರತೀಯ ವಿಜ್ಞಾನ ಸಂಸ್ಥೆ', 'INDIAN INSTITUTE OF SCIENCE'], x: cx, y: 5.05, z: gz + 0.55, w: 12.6, h: 1.25, face: 's', bg: '#2a2a2a', fg: '#f0e6c8' });
  ctx.trees(cx, cz, 0, 0, block);
  for (const s of [-1, 1]) for (let z = tz + 10; z < i.maxZ - 6; z += 9) ctx.trees(cx + s * 7, z, 0, 1);
  return { name: 'Indian Institute of Science', x: cx, z: i.maxZ + 3 };
}

// Gurudwara Sri Guru Singh Sabha by Ulsoor Lake: white marble, a golden onion dome and corner
// kiosks, and the saffron Nishan Sahib.
function gurudwara(ctx, block) {
  const { B, colliders, signs } = ctx;
  const { cx, cz } = centre(block);
  ctx.plaza(block, 0xeee8dc);
  const stone = B.get('stone');
  const marble = 0xf6f4ee, ledge = 0xe2dccc, gold = 0xd8a838, saffron = 0xf08a1c, dark = 0x3a3428;
  stone.box(cx, 0.15, cz, 30, 1.2, 28, 0xe4ded2);
  for (let k = 0; k < 3; k++) stone.box(cx, 0.15, cz + 14 + k * 0.6 + 0.3, 10, 0.9 - k * 0.3, 0.6, 0xe4ded2);
  colliders.addCentered(cx, cz, 30, 28, 1.35, 'plinth');
  stone.box(cx, 1.35, cz, 24, 7, 20, marble);
  stone.box(cx, 8.35, cz, 25, 0.6, 21, ledge);
  stone.box(cx, 8.95, cz, 16, 5, 14, marble);
  stone.box(cx, 13.95, cz, 17, 0.5, 15, ledge);
  colliders.addCentered(cx, cz, 25, 21, 16, 'building');
  // Arched openings with gilded arches over them.
  for (let k = -3; k <= 3; k++) {
    if (k) { stone.box(cx + k * 3.2, 1.35, cz + 10.04, 1.6, 3.2, 0.1, dark); put(stone, ARCH, cx + k * 3.2, 4.55, cz + 10.08, gold, 0, 0.8, 0.8, 0.6); }
    for (const s of [-1, 1]) if (Math.abs(k) < 3) { stone.box(cx + s * 12.04, 1.35, cz + k * 2.8, 0.1, 3.2, 1.6, dark); put(stone, ARCH, cx + s * 12.08, 4.55, cz + k * 2.8, gold, Math.PI / 2, 0.8, 0.8, 0.6); }
  }
  stone.box(cx, 1.35, cz + 10.04, 2.6, 4.2, 0.1, dark);
  // Central dome on its drum, and the corner kiosks on both roofs.
  put(stone, G.cyl, cx, 15.2, cz, marble, 0, 4.4, 2, 4.4);
  put(stone, G.sphere, cx, 18.6, cz, gold, 0, 4.8, 5.2, 4.8);
  put(stone, G.cone, cx, 24.6, cz, gold, 0, 1.0, 2.6, 1.0);
  put(stone, G.sphere, cx, 26.2, cz, gold, 0, 0.35, 0.35, 0.35);
  for (const [hx, hz, y, k] of [[10.5, 8.5, 8.95, 1], [6.8, 5.8, 14.45, 0.75]]) {
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
      const x = cx + s1 * hx, z = cz + s2 * hz;
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(stone, G.cyl8, x + ox * 0.8 * k, y + 1.2 * k, z + oz * 0.8 * k, marble, 0, 0.12 * k, 2.4 * k, 0.12 * k);
      stone.box(x, y + 2.4 * k, z, 2.2 * k, 0.3 * k, 2.2 * k, marble);
      put(stone, G.sphere, x, y + 2.7 * k, z, gold, 0, 1.0 * k, 1.3 * k, 1.0 * k);
      put(stone, G.cone, x, y + 4.2 * k, z, gold, 0, 0.15 * k, 0.8 * k, 0.15 * k);
    }
  }
  // Nishan Sahib.
  const fx = cx + 21, fz = cz + 10;
  stone.box(fx, 0.15, fz, 3.4, 1, 3.4, marble);
  put(stone, G.cyl8, fx, 13.15, fz, saffron, 0, 0.22, 25, 0.22);
  put(stone, FLAG, fx + 0.2, 21.8, fz, saffron);
  put(stone, G.cone, fx, 26.4, fz, 0x6a7078, 0, 0.35, 1.4, 0.08);
  stone.box(fx, 25.8, fz, 1.2, 0.15, 0.15, 0x6a7078);
  colliders.addCentered(fx, fz, 3.4, 3.4, 26, 'building');
  signs.push({ key: 'gurudwara', text: ['ಶ್ರೀ ಗುರು ಸಿಂಗ್ ಸಭಾ ಗುರುದ್ವಾರ', 'GURUDWARA SRI GURU SINGH SABHA'], x: cx, y: 6.7, z: cz + 10.08, w: 15, h: 1.5, face: 's', bg: '#1a3a7a', fg: '#f8d860' });
  ctx.trees(cx, cz, 0, 0, block);
  return { name: 'Ulsoor Gurudwara', x: cx, z: cz + 22 };
}

// Bangalore International Exhibition Centre (BIEC), Madavara on Tumkur Road: three big halls
// with barrel roofs behind a glazed concourse, a row of flags and acres of parking.
function biec(ctx, block) {
  const { B, colliders, signs } = ctx;
  ctx.lawn(block, 0x9aa060);
  const { cx, cz } = siteCentre(block, 190, 160);
  const stone = B.get('stone'), sheet = B.get('sheet'), glass = B.get('glass'), metal = B.get('metal'), mark = groundPaint(ctx);
  B.get('plaza').rect(cx - 95, cx + 95, cz - 62, cz + 78, 0.17, 0xd4cfc4, (x, z) => [x / 5, -z / 5]);
  for (let x = cx - 86; x <= cx + 86; x += 3) for (const z of [cz + 52, cz + 68]) mark(x, 0.19, z, 0.15, 5);
  for (const k of [-1, 0, 1]) {
    const hx = cx + k * 58, hz = cz - 20;
    stone.box(hx, 0.15, hz, 54, 11, 80, 0xeef0f2);
    stone.box(hx, 9.15, hz, 54.3, 1.4, 80.3, 0x1f4f8f, { top: false });
    put(sheet, BARREL, hx, 11.15, hz, 0xc0c8d0, Math.PI / 2, 7, 80, 27, 0, Math.PI / 2);
    colliders.addCentered(hx, hz, 54, 80, 18, 'building');
    signs.push({ key: 'biecHall' + k, text: [`HALL ${k + 2}`], x: hx, y: 6, z: hz - 40.1, w: 8, h: 1.6, face: 'n', bg: '#1f4f8f', fg: '#ffffff' });
  }
  // Glazed concourse and its canopy along the front.
  glass.box(cx, 0.15, cz + 26, 176, 12, 10, 0xa8c4d8, { tileW: GLASS_TILE.w, tileH: GLASS_TILE.h, top: false });
  stone.box(cx, 12.15, cz + 28, 182, 0.8, 16, 0xf0f0f0);
  for (let x = -84; x <= 84; x += 12) put(metal, G.cyl8, cx + x, 6.15, cz + 35, 0xd8d8d8, 0, 0.35, 12, 0.35);
  colliders.addCentered(cx, cz + 26, 176, 10, 13, 'building');
  signs.push({ key: 'biec', text: ['ಬೆಂಗಳೂರು ಅಂತರರಾಷ್ಟ್ರೀಯ ಪ್ರದರ್ಶನ ಕೇಂದ್ರ', 'BANGALORE INTERNATIONAL EXHIBITION CENTRE'], x: cx, y: 13.6, z: cz + 36.1, w: 60, h: 3, face: 's', bg: '#1f4f8f', fg: '#ffffff' });
  // A pylon by the road and a row of flags across the forecourt.
  stone.box(cx - 80, 0.15, cz + 74, 6, 16, 1.4, 0x1f4f8f);
  signs.push({ key: 'biecPylon', text: ['BIEC', 'ಬಿಐಇಸಿ'], x: cx - 80, y: 12, z: cz + 74.75, w: 5.4, h: 5, face: 's', bg: '#1f4f8f', fg: '#ffffff' });
  colliders.addCentered(cx - 80, cz + 74, 6, 1.4, 16, 'building');
  const flags = [0xff9933, 0xffffff, 0x138808, 0x1f4f8f, 0xd8202a, 0xf2c200, 0x2a8a8a, 0x8a2a8a];
  flags.forEach((c, k) => {
    const x = cx - 42 + k * 12, z = cz + 44;
    put(metal, G.cyl8, x, 6, z, 0xe8e8e8, 0, 0.1, 12, 0.1);
    stone.box(x + 1.3, 10, z, 2.6, 1.7, 0.04, c);
    colliders.addCentered(x, z, 0.4, 0.4, 12, 'pole');
  });
  return { name: 'BIEC', x: cx, z: cz + 80 };
}

// ---------------------------------------------------------------------------------------------
// Air Force Station Yelahanka: runway 09/27 with markings and lights, the parallel taxiway, an
// apron with IAF jets, hangars, the control tower, the boundary wall, the main gate on the
// airport road with a MiG-21 gate guardian, and a Surya Kiran formation circling overhead.

// IAF jets, low-poly, nose along +x, wheels at y = 0, placed by the matrix P.
const IAF = { saffron: 0xff8f1c, white: 0xf6f6f2, green: 0x1a8a2a };
const _pm = new THREE.Matrix4();
function part(b, P, geo, x, y, z, color, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  _pm.multiplyMatrices(P, _m);
  b.addGeometry(geo, _pm, color);
}
const DELTA = (() => {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(3, 0), new THREE.Vector2(-3.6, 4.1), new THREE.Vector2(-4.6, 4.1), new THREE.Vector2(-4.6, -4.1), new THREE.Vector2(-3.6, -4.1)]), { depth: 0.2, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // flat, span along z, top at y = 0
  return g;
})();
const jetFrame = (x, y, z, yaw, pitch = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, pitch, 'YZX')), new THREE.Vector3(1, 1, 1));

// Saffron-white-green roundel: on top of a wing (nz = 0) or on the side of the fuselage (nz = +-1).
function roundel(b, P, x, y, z, r, nz = 0) {
  [[1, IAF.saffron], [0.64, IAF.white], [0.3, IAF.green]].forEach(([k, c], n) => {
    const o = 0.012 * (n + 1);
    if (nz) part(b, P, G.cyl, x, y, z + nz * o, c, 0, r * k, 0.02, r * k, Math.PI / 2);
    else part(b, P, G.cyl, x, y + o, z, c, 0, r * k, 0.02, r * k);
  });
}
// Tricolour fin flash on a fin swept back by `sweep`, centred at (x, y).
function finFlash(b, P, x, y, sweep) {
  [IAF.green, IAF.white, IAF.saffron].forEach((c, n) => {
    const t = (n - 1) * 0.3;
    part(b, P, G.box, x + t * Math.cos(sweep), y + t * Math.sin(sweep), 0, c, 0, 0.3, 0.7, 0.2, 0, sweep);
  });
}
function gear(b, P, nose, main, track, h) {
  for (const [x, z] of [[nose, 0], [main, -track], [main, track]]) {
    part(b, P, G.cyl8, x, h / 2 + 0.15, z, 0x9a9a9a, 0, 0.06, h, 0.06);
    part(b, P, G.cyl, x, 0.3, z, 0x1a1a1a, 0, 0.3, 0.16, 0.3, Math.PI / 2);
  }
}

// BAE Hawk (the Surya Kiran aerobatic team flies these).
function buildHawk(b, P, liv, wheels = true) {
  const y = 1.9;
  part(b, P, G.cyl, 0.2, y, 0, liv.body, 0, 0.72, 8.2, 0.72, 0, Math.PI / 2);
  part(b, P, G.cone, 5.6, y - 0.05, 0, liv.body, 0, 0.7, 2.6, 0.64, 0, -Math.PI / 2);
  part(b, P, G.cone, -5.0, y + 0.1, 0, liv.body, 0, 0.68, 2.2, 0.6, 0, Math.PI / 2);
  part(b, P, G.sphere, 2.4, y + 0.6, 0, 0x22303c, 0, 1.9, 0.55, 0.5);
  part(b, P, G.box, 0.6, y - 0.6, 0, liv.belly, 0, 7, 0.22, 0.95);
  for (const sd of [-1, 1]) {
    part(b, P, G.box, 1.0, y - 0.05, sd * 0.8, liv.body, 0, 2.0, 0.8, 0.45);
    part(b, P, G.box, -0.6, y - 0.5, sd * 2.6, liv.body, -sd * 0.3, 2.2, 0.16, 4.4);
    part(b, P, G.box, -1.3, y - 0.5, sd * 4.4, liv.accent, -sd * 0.3, 1.5, 0.18, 0.9);
    part(b, P, G.box, -5.0, y + 0.25, sd * 1.3, liv.body, -sd * 0.4, 1.2, 0.1, 2.0);
    roundel(b, P, -0.9, y - 0.42, sd * 3.0, 0.5);
    roundel(b, P, -2.4, y + 0.1, sd * 0.72, 0.34, sd);
  }
  part(b, P, G.box, -4.9, y + 1.55, 0, liv.body, 0, 1.9, 2.2, 0.14, 0, 0.45);
  finFlash(b, P, -5.15, y + 2.05, 0.45);
  if (wheels) gear(b, P, 3.6, -0.6, 1.3, 1.3);
}

// HAL Tejas: tailless compound delta.
function buildTejas(b, P, liv) {
  const y = 2.0;
  part(b, P, G.cyl, 0.4, y, 0, liv.body, 0, 0.82, 9.4, 0.82, 0, Math.PI / 2);
  part(b, P, G.cone, 6.5, y, 0, 0x50565e, 0, 0.8, 2.8, 0.8, 0, -Math.PI / 2);
  part(b, P, G.cyl, -4.8, y, 0, 0x34383e, 0, 0.62, 1.0, 0.62, 0, Math.PI / 2);
  part(b, P, G.sphere, 3.6, y + 0.62, 0, 0x2a3440, 0, 1.5, 0.6, 0.52);
  part(b, P, DELTA, 0, y - 0.15, 0, liv.body);
  for (const sd of [-1, 1]) {
    part(b, P, G.box, 1.4, y - 0.45, sd * 0.98, liv.body, 0, 3.2, 0.95, 0.6);
    roundel(b, P, -2.2, y - 0.15, sd * 2.7, 0.5);
    roundel(b, P, 1.2, y - 0.45, sd * 1.29, 0.33, sd);
  }
  part(b, P, G.box, -3.4, y + 1.85, 0, liv.body, 0, 2.8, 2.8, 0.16, 0, 0.55);
  finFlash(b, P, -3.8, y + 2.4, 0.55);
  gear(b, P, 4.2, -1.2, 1.4, 1.4);
}

// MiG-21, the classic gate guardian: silver, nose intake with its shock cone.
function buildMig21(b, P) {
  const c = 0xb4b8bc, dk = 0x3a3e44;
  part(b, P, G.cyl, 0, 0, 0, c, 0, 0.78, 11, 0.78, 0, Math.PI / 2);
  part(b, P, G.cyl, 5.65, 0, 0, dk, 0, 0.66, 0.3, 0.66, 0, Math.PI / 2);
  part(b, P, G.cone, 6.1, 0, 0, 0x6a6e74, 0, 0.42, 1.4, 0.42, 0, -Math.PI / 2);
  part(b, P, G.cyl, -5.8, 0, 0, dk, 0, 0.6, 0.8, 0.6, 0, Math.PI / 2);
  part(b, P, G.sphere, 2.4, 0.7, 0, 0x30404c, 0, 1.4, 0.45, 0.45);
  part(b, P, G.box, -0.5, 0.75, 0, c, 0, 6, 0.35, 0.4);
  part(b, P, DELTA, -1.8, -0.3, 0, c, 0, 0.8, 1, 0.72);
  for (const sd of [-1, 1]) {
    part(b, P, G.box, -4.6, 0, sd * 1.4, c, -sd * 0.5, 1.4, 0.1, 1.8);
    roundel(b, P, -3.4, -0.3, sd * 2.1, 0.45);
  }
  part(b, P, G.box, -4.3, 1.5, 0, c, 0, 2.6, 2.4, 0.14, 0, 0.6);
  finFlash(b, P, -4.6, 2.0, 0.6);
}

const SURYA_KIRAN = { body: 0xc8202a, accent: 0xf6f6f2, belly: 0xf6f6f2 };
const IAF_GREY = { body: 0x8a929a, accent: 0x6e767e, belly: 0x7e868e };

function airForceStation(ctx, block) {
  const { B, colliders, signs, group } = ctx;
  const i = block.inner;
  ctx.lawn(block, 0x8f9a58);
  const stone = B.get('stone'), asphalt = B.get('junction'), conc = B.get('plaza'), glass = B.get('glass'), roof = B.get('roof');
  const glow = B.get('glow'), sheet = B.get('sheet'), plaster = B.get('plaster'), metal = B.get('metal');
  const y = 0.17, mx = (i.minX + i.maxX) / 2;
  const auv = (x, z) => [x / 8, -z / 8];
  const paintOn = groundPaint(ctx), mark = (x, z, w, d, c) => paintOn(x, y + 0.02, z, w, d, c);
  // Runway along the north of the site.
  const rz = i.minZ + 110, rw = 45, rx0 = i.minX + 50, rx1 = i.maxX - 50;
  asphalt.rect(rx0, rx1, rz - rw / 2, rz + rw / 2, y, 0x484846, auv);
  for (let x = rx0 + 70; x < rx1 - 70; x += 30) mark(x, rz, 15, 0.9);
  for (const sd of [-1, 1]) mark((rx0 + rx1) / 2, rz + sd * (rw / 2 - 1), rx1 - rx0 - 4, 0.6);
  for (const [end, dir] of [[rx0, 1], [rx1, -1]]) {
    mark(end + dir * 2.5, rz, 1.5, rw - 3);
    for (let k = -5; k <= 5; k++) if (k) mark(end + dir * 15, rz + k * 3.8, 22, 1.8); // threshold "piano keys"
    for (const sd of [-1, 1]) mark(end + dir * 110, rz + sd * 7, 40, 5); // aiming points
    for (const [at, n] of [[60, 3], [170, 2], [230, 2], [290, 1]]) for (const sd of [-1, 1]) for (let q = 0; q < n; q++) mark(end + dir * at, rz + sd * (4.5 + q * 2.6), 18, 1.4); // touchdown zone
    // Approach lights on short posts beyond the threshold, and the green threshold bar.
    for (let k = 1; k <= 4; k++) { stone.box(end - dir * k * 10, 0.15, rz, 0.3, 0.8, 0.3, 0x555555); glow.box(end - dir * k * 10, 0.95, rz, 0.4, 0.3, 12 - k * 1.5, 0xfff2c8); }
    for (let k = -5; k <= 5; k++) glow.box(end - dir * 1.5, y, rz + k * 4.2, 0.4, 0.3, 0.4, 0x40ff60);
  }
  for (let x = rx0; x <= rx1; x += 60) for (const sd of [-1, 1]) glow.box(x, y, rz + sd * (rw / 2 + 1.5), 0.35, 0.3, 0.35, 0xfff4d0);
  // Parallel taxiway, its connectors and holding points.
  const tz = rz + 80, tw = 22;
  asphalt.rect(rx0 + 40, rx1 - 40, tz - tw / 2, tz + tw / 2, y, 0x555553, auv);
  for (let x = rx0 + 40; x < rx1 - 40; x += 6) mark(x, tz, 3, 0.3, 0xf2c200);
  for (const x of [rx0 + 51, mx - 230, mx + 170, rx1 - 51]) {
    asphalt.rect(x - 11, x + 11, rz + rw / 2, tz - tw / 2, y, 0x555553, auv);
    for (let z = rz + rw / 2 + 1; z < tz - tw / 2; z += 6) mark(x, z, 0.3, 3, 0xf2c200);
    for (const o of [0, 1.2]) mark(x, rz + rw / 2 + 14 + o, 21, 0.35, 0xf2c200);
    stone.box(x + 14, 0.15, rz + rw / 2 + 14.6, 2.8, 1.5, 0.25, 0x222222);
    signs.push({ key: 'afsHold', text: ['09 - 27'], x: x + 14, y: 1.15, z: rz + rw / 2 + 14.75, w: 2.6, h: 0.9, face: 's', bg: '#c0181a', fg: '#ffffff' });
    colliders.addCentered(x + 14, rz + rw / 2 + 14.6, 2.8, 0.4, 1.6, 'pole');
  }
  // Windsock by the runway.
  const wx = mx - 60, wz = rz + rw / 2 + 30;
  put(stone, G.cyl8, wx, 4.15, wz, 0xdddddd, 0, 0.1, 8, 0.1);
  put(stone, G.cone, wx - 1.6, 7.6, wz, 0xf07a20, 0, 0.6, 3, 0.6, 0, Math.PI / 2);
  colliders.addCentered(wx, wz, 0.4, 0.4, 8, 'pole');
  // Apron.
  const az0 = tz + tw / 2, az1 = az0 + 130, ax0 = mx - 250, ax1 = mx + 250;
  conc.rect(ax0, ax1, az0, az1, y, 0xc4c0b6, (x, z) => [x / 6, -z / 6]);
  // Parked jets: the Surya Kiran line-up, a flight of Tejas and two grey Hawks, noses to the runway.
  const parked = [];
  for (let k = 0; k < 5; k++) parked.push(['hawk', mx - 210 + k * 16, az0 + 40, SURYA_KIRAN]);
  for (let k = 0; k < 3; k++) parked.push(['tejas', mx - 70 + k * 22, az0 + 46, IAF_GREY]);
  parked.push(['hawk', mx + 80, az0 + 44, IAF_GREY], ['hawk', mx + 100, az0 + 44, IAF_GREY]);
  for (const [type, x, z, liv] of parked) {
    const P = jetFrame(x, y, z, Math.PI / 2);
    if (type === 'hawk') buildHawk(stone, P, liv); else buildTejas(stone, P, liv);
    mark(x, (az0 + z) / 2 - 3, 0.25, z - az0 - 6, 0xf2c200); // lead-in line from the taxiway
    colliders.addCentered(x, z, type === 'hawk' ? 9.4 : 8.4, 13, 4.5, 'building');
  }
  signs.push({ key: 'afsSk', text: ['SURYA KIRAN AEROBATIC TEAM', 'ಸೂರ್ಯ ಕಿರಣ್'], x: mx - 178, y: 1.7, z: az0 + 52.1, w: 12, h: 1.6, face: 's', bg: '#c8202a', fg: '#ffffff' });
  stone.box(mx - 178, 0.15, az0 + 51.9, 12.4, 2.6, 0.3, 0x222222);
  colliders.addCentered(mx - 178, az0 + 51.9, 12.4, 0.4, 2.6, 'wall');
  // Hangars along the south side of the apron, doors to the north.
  const HW = 50, HD = 44, HH = 15, hz = az1 + HD / 2 + 4;
  for (let k = 0; k < 4; k++) {
    const hx = mx + 20 + k * 58;
    put(sheet, BARREL, hx, 0.15, hz, k % 2 ? 0x7f8a7c : 0x8c948a, Math.PI / 2, HH, HD, HW / 2, 0, Math.PI / 2);
    stone.box(hx, 0.15, hz - HD / 2 - 0.06, HW * 0.76, HH * 0.7, 0.12, 0x353b42);
    for (let q = -3; q <= 3; q++) stone.box(hx + q * (HW * 0.76) / 7, 0.15, hz - HD / 2 - 0.14, 0.12, HH * 0.7, 0.06, 0x262b30); // door panel seams
    signs.push({ key: 'afsH' + k, text: [`HANGAR ${k + 1}`], x: hx, y: HH * 0.78, z: hz - HD / 2 - 0.2, w: 9, h: 1.5, face: 'n', bg: '#2a3a2a', fg: '#f0f0e0' });
    conc.rect(hx - HW * 0.38, hx + HW * 0.38, az1, hz - HD / 2, y, 0xc4c0b6, (x, z) => [x / 6, -z / 6]);
    colliders.addCentered(hx, hz, HW, HD, HH, 'building');
  }
  // Control tower and the operations block, west of the hangars.
  const twx = mx - 165, twz = az1 + 30;
  stone.box(twx, 0.15, twz, 6, 20, 6, 0xd8d4cc);
  stone.box(twx, 20.15, twz, 9.6, 0.4, 9.6, 0xf2f2f2);
  glass.box(twx, 20.55, twz, 9, 3.6, 9, 0x4a6a88, { tileW: GLASS_TILE.w, tileH: GLASS_TILE.h, top: false });
  stone.box(twx, 24.15, twz, 10, 0.6, 10, 0xf2f2f2);
  put(stone, G.cyl8, twx + 2, 27, twz + 2, 0xcccccc, 0, 0.12, 5, 0.12);
  glow.box(twx + 2, 29.6, twz + 2, 0.5, 0.5, 0.5, 0xff3030);
  for (let k = 0; k < 6; k++) stone.box(twx, 3 + k * 3, twz + 3.02, 6, 1.5, 0.04, k % 2 ? 0xf2f2f2 : 0xd83a2a); // red-white bands
  colliders.addCentered(twx, twz, 10, 10, 25, 'building');
  plaster.box(twx + 28, 0.15, twz, 34, 8, 14, 0xe8e2d2, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 10 });
  colliders.addCentered(twx + 28, twz, 34, 14, 9, 'building');
  // Station roads: in from the airport road (the nearest kerb west of the gate), along the south,
  // and up to the apron.
  const gz = Math.min(i.maxZ - 40, az1 + 92);
  let gx = i.minX - 18;
  const P = block.innerPoly || block.poly;
  P.forEach(([ax, az], k) => {
    const [bx, bz] = P[(k + 1) % P.length];
    if ((az > gz) === (bz > gz)) return;
    const x = ax + ((gz - az) / (bz - az)) * (bx - ax);
    if (x < i.minX - 18 && (gx === i.minX - 18 || x > gx)) gx = x;
  });
  asphalt.rect(gx, mx + 250, gz - 5, gz + 5, y, 0x555553, auv);
  asphalt.rect(mx - 105, mx - 95, az1, gz - 5, y, 0x555553, auv);
  for (let x = i.minX + 20; x < mx + 240; x += 24) for (const sd of [-1, 1]) if (Math.abs(x - (mx - 100)) > 12) ctx.trees(x, gz + sd * 9, 0, 1);
  // Barracks and messes south of the road.
  for (let k = 0; k < 5; k++) {
    const bx = i.minX + 110 + k * 64, bz = gz + 32;
    if (bz + 8 > i.maxZ) break;
    plaster.box(bx, 0.15, bz, 44, 8, 14, k % 2 ? 0xe8dcc0 : 0xf0e8d8, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 10 });
    colliders.addCentered(bx, bz, 44, 14, 9, 'building');
  }
  // Boundary wall, with the main gate on the airport road (west) side.
  const wallH = 2.6, wallC = 0xd8d2c4;
  const wall = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    B.xf = makeFrame((x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0));
    stone.box(0, 0.15, 0, len, wallH, 0.3, wallC);
    stone.box(0, 0.15 + wallH, 0, len, 0.22, 0.5, 0xb8b2a4);
    for (const o of [0.35, 0.6]) metal.box(0, wallH + 0.15 + o, 0, len, 0.04, 0.04, 0x4a4a4a);
    B.xf = null;
    colliders.addSegment(x0, z0, x1, z1, 0.4, wallH + 0.8, 'wall');
  };
  const gw = 8;
  wall(i.minX, i.minZ, i.maxX, i.minZ); wall(i.maxX, i.minZ, i.maxX, i.maxZ); wall(i.minX, i.maxZ, i.maxX, i.maxZ);
  wall(i.minX, i.minZ, i.minX, gz - gw); wall(i.minX, gz + gw, i.minX, i.maxZ);
  for (const s of [-1, 1]) {
    stone.box(i.minX, 0.15, gz + s * gw, 2.2, 8, 2.2, 0x1a2a5a);
    roundel(stone, jetFrame(i.minX - 1.1, 5.2, gz + s * gw, Math.PI / 2), 0, 0, 0, 0.85, -1);
    colliders.addCentered(i.minX, gz + s * gw, 2.2, 2.2, 8, 'pole');
  }
  stone.box(i.minX, 8.15, gz, 1.6, 2.6, gw * 2 + 2.2, 0x1a2a5a);
  signs.push({ key: 'afsGate', text: ['ವಾಯುಪಡೆ ನಿಲ್ದಾಣ ಯಲಹಂಕ', 'AIR FORCE STATION YELAHANKA'], x: i.minX - 0.85, y: 9.45, z: gz, w: 16, h: 2.3, face: 'w', bg: '#1a2a5a', fg: '#ffffff' });
  signs.push({ key: 'afsGateIn', text: ['ವಾಯುಪಡೆ ನಿಲ್ದಾಣ ಯಲಹಂಕ', 'AIR FORCE STATION YELAHANKA'], x: i.minX + 0.85, y: 9.45, z: gz, w: 16, h: 2.3, face: 'e', bg: '#1a2a5a', fg: '#ffffff' });
  // Guard post and a raised boom.
  stone.box(i.minX + 6, 0.15, gz + gw + 4, 3, 2.8, 3, 0xe8e2d2, { topBuilder: roof });
  stone.box(i.minX + 6, 2.95, gz + gw + 4, 3.6, 0.25, 3.6, 0x3a5a3a);
  colliders.addCentered(i.minX + 6, gz + gw + 4, 3, 3, 3, 'building');
  stone.box(i.minX + 3, 0.15, gz + gw - 1.5, 0.6, 1.2, 0.6, 0x333333);
  for (let k = 0; k < 6; k++) put(stone, G.box, i.minX + 3, 1.6 + k * 1.0, gz + gw - 1.5 - k * 0.12, k % 2 ? 0xf2f2f2 : 0xd82020, 0, 0.18, 1.0, 0.18, 0.12);
  // The MiG-21 gate guardian on its plinth, nose up towards the road.
  const mgx = i.minX + 34, mgz = gz - 26;
  stone.box(mgx, 0.15, mgz, 3, 3.4, 2.2, 0xd8d2c4);
  stone.box(mgx, 0.15, mgz, 9, 0.5, 6, 0xb8b2a4);
  buildMig21(stone, jetFrame(mgx, 4.6, mgz, Math.PI, 0.32));
  signs.push({ key: 'afsMig', text: ['MiG-21 · GATE GUARDIAN', 'ಮಿಗ್-21'], x: mgx - 1.52, y: 1.9, z: mgz, w: 2.1, h: 0.9, face: 'w', bg: '#1a2a5a', fg: '#ffffff' });
  colliders.addCentered(mgx, mgz, 13, 9, 7, 'building');
  // Surya Kiran: a five-ship formation looping round the station.
  const fb = new BuilderSet();
  for (const [ox, oz] of [[0, 0], [-16, -14], [-16, 14], [-32, -28], [-32, 28]]) buildHawk(fb.get('m'), new THREE.Matrix4().makeTranslation(ox, 0, oz), SURYA_KIRAN, false);
  const form = new THREE.Group();
  form.userData.dynamic = true;
  fb.buildAll({ m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 }) }, form, { m: { castShadow: false } });
  group.add(form);
  form.rotation.order = 'YXZ';
  const ocx = mx, ocz = (i.minZ + i.maxZ) / 2, A = (i.maxX - i.minX) * 0.55, Bz = (i.maxZ - i.minZ) * 0.7;
  let ph = 0;
  ctx.anims.push((dt) => {
    ph += dt * 0.12;
    const dx = -A * Math.sin(ph), dz = Bz * Math.cos(ph);
    form.position.set(ocx + A * Math.cos(ph), 150 + 15 * Math.sin(ph * 2), ocz + Bz * Math.sin(ph));
    form.rotation.set(0.45, Math.atan2(-dz, dx), 0);
  });
  return { name: 'Air Force Station Yelahanka', x: i.minX - 14, z: gz };
}

export const LANDMARKS = {
  vidhanaSoudha, highCourt, library, bandstand, stadium, cathedral, skyTower, statue,
  ibcPlatinumCity, busStand, airport, itpl, iskcon, wtc, glassHouse, forumMall, silkBoardOffice, museum, balBhavan,
  bangalorePalace, bullTemple, tipuPalace, townHall, kanteerava, manyata, kempfortShiva, iisc, gurudwara, biec, airForceStation,
};
