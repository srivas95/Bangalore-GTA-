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
  }
  return { name: 'Kempegowda Bus Station', x: cx, z: tz + 12 };
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

export const LANDMARKS = {
  vidhanaSoudha, highCourt, library, bandstand, stadium, cathedral, skyTower, statue,
  ibcPlatinumCity, busStand, iskcon, wtc, glassHouse, forumMall, silkBoardOffice,
};
