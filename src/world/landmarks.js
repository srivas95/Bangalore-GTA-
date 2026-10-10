// Stylised versions of central Bengaluru landmarks, built from primitives.
import * as THREE from 'three';
import { FACADE_TILE, GLASS_TILE } from './textures.js';

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

export const LANDMARKS = { vidhanaSoudha, highCourt, library, bandstand, stadium, cathedral, skyTower, statue };
