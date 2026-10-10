// Builds the static city: ground, roads, footpaths, buildings, trees, props and landmarks.
import * as THREE from 'three';
import { BuilderSet } from './meshBuilder.js';
import * as T from './textures.js';
import { LANDMARKS, put } from './landmarks.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB_H, SIDEWALK_W, WORLD_MIN, WORLD_MAX, SHOP_SIGNS } from '../config.js';

const rng = T.mulberry32(20240607);
const rand = (a = 0, b = 1) => a + (b - a) * rng();
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

const PASTELS = [0xf3e9d2, 0xe8d5b5, 0xf0c9a0, 0xd9e4dd, 0xf5e1e9, 0xe3d7f0, 0xfff6d5, 0xcfe0f5, 0xf2c6b4, 0xe6e6e6, 0xd4ecc8, 0xf7d9a8, 0xffffff];
const BRIGHTS = [0xf4a6a6, 0x9fd3c7, 0xf7dc6f, 0xaed6f1, 0xd7bde2, 0xf5cba7, 0xa9dfbf, 0xf0b27a];
const FLOOR_H = 3.2;
const SHRUB = new THREE.SphereGeometry(1, 8, 6);
const SHOP_H = 4;

export function buildCity(scene, layout, colliders, renderer) {
  T.resetRandom(7);
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);
  const B = new BuilderSet();
  const trees = [];
  const lamps = [];
  const tanks = [];
  const signs = [];
  const pois = { food: [], homes: [], landmarks: [], parking: [] };
  let signIndex = 0;

  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (t) => { t.anisotropy = Math.min(8, aniso); return t; };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const roadTex = new Map();
  const mats = {
    ground: std({ map: tex(T.soilTexture()), roughness: 1 }),
    sidewalk: std({ map: tex(T.paverTexture()), roughness: 0.95, vertexColors: true }),
    grass: std({ map: tex(T.grassTexture()), roughness: 1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    plaza: std({ map: tex(T.concreteTexture()), roughness: 0.95, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    junction: std({ map: tex(T.asphaltTexture()), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    zebra: std({ map: tex(T.zebraTexture()), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    plaster: std({ map: tex(T.plasterFacade()), roughness: 0.9, vertexColors: true }),
    apartment: std({ map: tex(T.apartmentFacade()), roughness: 0.9, vertexColors: true }),
    heritage: std({ map: tex(T.heritageFacade()), roughness: 0.85, vertexColors: true }),
    glass: std({ map: tex(T.glassFacade()), roughness: 0.12, metalness: 0.65, vertexColors: true, envMapIntensity: 1.2 }),
    shop: std({ map: tex(T.shopfrontTexture()), roughness: 0.85, vertexColors: true }),
    roof: std({ map: tex(T.roofTexture()), roughness: 0.95, vertexColors: true }),
    stone: std({ roughness: 0.75, vertexColors: true, side: THREE.DoubleSide }),
    metal: std({ roughness: 0.4, metalness: 0.7, vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    signs: std({ map: T.signAtlas(), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.08, vertexColors: true }),
    water: std({ color: 0x4f7f86, roughness: 0.06, metalness: 0.2, normalMap: T.waterNormal(), normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.3 }),
  };
  mats.signs.emissiveMap = mats.signs.map;
  mats.water.normalMap.repeat.set(12, 12);

  // ---------- Ground ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  mats.ground.map.repeat.set(300, 300);
  group.add(ground);

  // ---------- Roads ----------
  for (const r of layout.roads) {
    const key = `road_${r.lanes}_${r.median || 0}`;
    if (!roadTex.has(key)) {
      const t = tex(T.roadTexture(r));
      roadTex.set(key, t);
      mats[key] = std({ map: t, roughness: 0.88 });
    }
    const b = B.get(key);
    const L = 12, half = r.width / 2, lo = r.pos - half;
    if (r.axis === 'x') b.rect(r.pos - half, r.pos + half, WORLD_MIN, WORLD_MAX, 0.01, 0xffffff, (x, z) => [(x - lo) / r.width, -z / L]);
    else b.rect(WORLD_MIN, WORLD_MAX, r.pos - half, r.pos + half, 0.01, 0xffffff, (x, z) => [(z - lo) / r.width, x / L]);
  }
  for (const n of layout.nodes) {
    const xr = layout.xRoads[n.xi], zr = layout.zRoads[n.zj];
    const hx = xr.width / 2, hz = zr.width / 2;
    B.get('junction').rect(n.x - hx, n.x + hx, n.z - hz, n.z + hz, 0.02, 0xffffff, (x, z) => [x / 8, -z / 8]);
    // Zebra crossings on all four approaches.
    const zb = B.get('zebra');
    for (const s of [-1, 1]) {
      const z0 = n.z + s * (hz + 0.6), z1 = n.z + s * (hz + 3.6);
      zb.rect(n.x - hx, n.x + hx, Math.min(z0, z1), Math.max(z0, z1), 0.025, 0xffffff, (x, z) => [x / 8, z / 8]);
      const x0 = n.x + s * (hx + 0.6), x1 = n.x + s * (hx + 3.6);
      zb.rect(Math.min(x0, x1), Math.max(x0, x1), n.z - hz, n.z + hz, 0.025, 0xffffff, (x, z) => [z / 8, x / 8]);
    }
  }
  // Raised medians (MG Road) with gaps at junctions.
  for (const r of layout.zRoads) {
    if (!r.median) continue;
    const cuts = layout.xRoads.map((x) => [x.pos - x.width / 2 - 4, x.pos + x.width / 2 + 4]);
    let start = WORLD_MIN;
    for (const [a, b] of [...cuts, [WORLD_MAX, WORLD_MAX]]) {
      if (a > start + 1) {
        const len = a - start, cx = (start + a) / 2;
        B.get('sidewalk').box(cx, 0, r.pos, len, 0.35, r.median - 0.4, 0xb0aaa0, { tileW: 2, tileH: 2, topBuilder: B.get('grass'), topTile: 4 });
        colliders.addCentered(cx, r.pos, len, r.median - 0.4, 0.9, 'median');
        for (let x = start + 3; x < a - 2; x += 6) put(B.get('stone'), SHRUB, x, 0.6, r.pos, 0x4f7a32, 0, 0.9, 0.6, 0.9);
      }
      start = b;
    }
  }

  // ---------- Blocks ----------
  const lawn = (block, color = 0xffffff) => {
    const i = block.inner;
    B.get('grass').rect(i.minX, i.maxX, i.minZ, i.maxZ, CURB_H + 0.01, color, (x, z) => [x / 6, -z / 6]);
  };
  const plaza = (block, color = 0xffffff) => {
    const i = block.inner;
    B.get('plaza').rect(i.minX, i.maxX, i.minZ, i.maxZ, CURB_H + 0.01, color, (x, z) => [x / 5, -z / 5]);
  };
  const ctx = { B, colliders, signs, lawn, plaza, pois };

  for (const block of layout.blocks) {
    const o = block.outer;
    // Footpath slab (the whole block is raised by the kerb height).
    B.get('sidewalk').box((o.minX + o.maxX) / 2, 0, (o.minZ + o.maxZ) / 2, o.maxX - o.minX, CURB_H, o.maxZ - o.minZ,
      0xd0ccc4, { tileW: 2, tileH: 2, topTile: 2.2, topColor: 0xffffff });
    avenueTrees(block);
    streetLamps(block);
    switch (block.zone) {
      case 'park': buildPark(block); break;
      case 'lake': buildLake(block); break;
      case 'landmark': pois.landmarks.push(LANDMARKS[block.landmark](ctx, block)); break;
      case 'towers': buildTowers(block); break;
      case 'gov': buildGov(block); break;
      case 'residential': buildResidential(block); break;
      case 'market': buildStreetBlock(block, { frontage: [5, 9], depth: [10, 15], floors: [2, 4], shop: 1, tints: BRIGHTS, styles: ['plaster', 'apartment'] }); break;
      case 'commercial': buildCommercial(block); break;
      default: buildStreetBlock(block, { frontage: [9, 18], depth: [12, 20], floors: block.edge ? [4, 9] : [2, 6], shop: 0.5, tints: PASTELS, styles: ['plaster', 'apartment', 'plaster'] });
    }
  }

  // ---------- Building helpers ----------
  function lotsAround(inner, frontage, depth, sides = 'nsew') {
    const lots = [];
    const W = inner.maxX - inner.minX, D = inner.maxZ - inner.minZ;
    const maxD = Math.min(depth[1], D / 2 - 1, W / 2 - 1);
    const dN = sides.includes('n') ? Math.min(rand(...depth), maxD) : 0;
    const dS = sides.includes('s') ? Math.min(rand(...depth), maxD) : 0;
    const run = (a0, a1, make) => {
      let a = a0;
      while (a < a1 - 4) {
        let f = rand(...frontage);
        if (a1 - (a + f) < frontage[0]) f = a1 - a;
        make(a, Math.min(a + f, a1));
        a += f + (rng() < 0.2 ? rand(0.5, 2) : 0);
      }
    };
    if (dN) run(inner.minX, inner.maxX, (a, b) => lots.push({ minX: a, maxX: b, minZ: inner.minZ, maxZ: inner.minZ + dN * rand(0.75, 1), face: 'n' }));
    if (dS) run(inner.minX, inner.maxX, (a, b) => lots.push({ minX: a, maxX: b, minZ: inner.maxZ - dS * rand(0.75, 1), maxZ: inner.maxZ, face: 's' }));
    const z0 = inner.minZ + dN + 1, z1 = inner.maxZ - dS - 1;
    const dW = Math.min(rand(...depth), maxD), dE = Math.min(rand(...depth), maxD);
    if (sides.includes('w')) run(z0, z1, (a, b) => lots.push({ minX: inner.minX, maxX: inner.minX + dW * rand(0.75, 1), minZ: a, maxZ: b, face: 'w' }));
    if (sides.includes('e')) run(z0, z1, (a, b) => lots.push({ minX: inner.maxX - dE * rand(0.75, 1), maxX: inner.maxX, minZ: a, maxZ: b, face: 'e' }));
    return lots;
  }

  function building(lot, { style = 'plaster', floors = 3, shop = false, tint = 0xffffff, block }) {
    const w = lot.maxX - lot.minX, d = lot.maxZ - lot.minZ;
    if (w < 3 || d < 3) return;
    const cx = (lot.minX + lot.maxX) / 2, cz = (lot.minZ + lot.maxZ) / 2;
    let y = CURB_H;
    const roofB = B.get('roof');
    if (shop) {
      B.get('shop').box(cx, y, cz, w, SHOP_H, d, 0xffffff, { tileW: T.SHOP_TILE.w, tileH: T.SHOP_TILE.h, top: floors === 0, topBuilder: roofB, topTile: 10 });
      y += SHOP_H;
      // Overhang slab between shop and upper floors.
      B.get('stone').box(cx, y - 0.25, cz, w + 0.6, 0.3, d + 0.6, 0xcfc8ba, { top: true });
      addSign(lot, y + 0.1, block);
    }
    const tile = style === 'glass' ? T.GLASS_TILE : T.FACADE_TILE;
    const h = floors * FLOOR_H;
    if (floors > 0) {
      B.get(style).box(cx, y, cz, w, h, d, tint, { tileW: tile.w, tileH: tile.h, topBuilder: roofB, topTile: 10 });
    }
    const top = y + h;
    // Parapet.
    if (floors > 0 && style !== 'glass') {
      const p = 0.25, ph = 0.9, st = B.get('stone');
      st.box(cx, top, lot.minZ + p / 2, w, ph, p, tint);
      st.box(cx, top, lot.maxZ - p / 2, w, ph, p, tint);
      st.box(lot.minX + p / 2, top, cz, p, ph, d - 2 * p, tint);
      st.box(lot.maxX - p / 2, top, cz, p, ph, d - 2 * p, tint);
      // Black Sintex water tanks and the stair headroom: a Bengaluru skyline staple.
      const n = rng() < 0.8 ? 1 + Math.floor(rand(0, 2.5)) : 0;
      for (let k = 0; k < n; k++) tanks.push([rand(lot.minX + 1.2, lot.maxX - 1.2), top, rand(lot.minZ + 1.2, lot.maxZ - 1.2), rand(0.8, 1.1)]);
      if (rng() < 0.5 && w > 6 && d > 6) {
        B.get('plaster').box(cx + rand(-w / 4, w / 4), top, cz + rand(-d / 4, d / 4), 3, 2.6, 3, tint, { tileW: T.FACADE_TILE.w, tileH: T.FACADE_TILE.h, topBuilder: roofB, topTile: 10 });
      }
    }
    colliders.add(lot.minX, lot.maxX, lot.minZ, lot.maxZ, top + 1, 'building');
    return top;
  }

  function faceQuad(builder, face, lot, a0, a1, y0, y1, off, uv, color) {
    switch (face) {
      case 'n': { const z = lot.minZ - off; builder.quad([a1, y0, z], [a0, y0, z], [a0, y1, z], [a1, y1, z], [0, 0, -1], uv, color); break; }
      case 's': { const z = lot.maxZ + off; builder.quad([a0, y0, z], [a1, y0, z], [a1, y1, z], [a0, y1, z], [0, 0, 1], uv, color); break; }
      case 'e': { const x = lot.maxX + off; builder.quad([x, y0, a1], [x, y0, a0], [x, y1, a0], [x, y1, a1], [1, 0, 0], uv, color); break; }
      case 'w': { const x = lot.minX - off; builder.quad([x, y0, a0], [x, y0, a1], [x, y1, a1], [x, y1, a0], [-1, 0, 0], uv, color); break; }
    }
  }

  function frontPoint(lot, dist) {
    const cx = (lot.minX + lot.maxX) / 2, cz = (lot.minZ + lot.maxZ) / 2;
    switch (lot.face) {
      case 'n': return { x: cx, z: lot.minZ - dist };
      case 's': return { x: cx, z: lot.maxZ + dist };
      case 'e': return { x: lot.maxX + dist, z: cz };
      default: return { x: lot.minX - dist, z: cz };
    }
  }

  function addSign(lot, y, block) {
    const along = lot.face === 'n' || lot.face === 's';
    const a0 = along ? lot.minX : lot.minZ, a1 = along ? lot.maxX : lot.maxZ;
    const len = Math.min(a1 - a0 - 0.8, 6);
    if (len < 2) return;
    const mid = (a0 + a1) / 2;
    const k = signIndex++ % (T.SIGN_COLS * T.SIGN_ROWS);
    faceQuad(B.get('signs'), lot.face, lot, mid - len / 2, mid + len / 2, y, y + len / 4, 0.32, T.signUV(k), 0xffffff);
    const sign = SHOP_SIGNS[k % SHOP_SIGNS.length];
    if (sign.food) {
      const p = frontPoint(lot, 2.2);
      pois.food.push({ name: sign.en, x: p.x, z: p.z, district: block.district });
    }
  }

  function buildStreetBlock(block, o) {
    const lots = lotsAround(block.inner, o.frontage, o.depth, o.sides || 'nsew');
    for (const lot of lots) {
      const shop = rng() < o.shop && lot.face && !(block.edge && isWorldEdge(block, lot.face));
      building(lot, { style: pick(o.styles), floors: Math.round(rand(...o.floors)), shop, tint: pick(o.tints), block });
    }
    // Courtyard filler.
    const i = block.inner;
    const inset = o.depth[1] + 3;
    if (i.maxX - i.minX > inset * 2 + 10 && i.maxZ - i.minZ > inset * 2 + 10) {
      const cx = (i.minX + i.maxX) / 2, cz = (i.minZ + i.maxZ) / 2;
      const hw = (i.maxX - i.minX) / 2 - inset, hd = (i.maxZ - i.minZ) / 2 - inset;
      if (rng() < 0.6) building({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd }, { style: pick(o.styles), floors: Math.round(rand(o.floors[0] + 1, o.floors[1] + 3)), tint: pick(o.tints), block });
      else for (let k = 0; k < 6; k++) trees.push({ x: cx + rand(-hw, hw), z: cz + rand(-hd, hd), s: rand(0.8, 1.2), t: 0 });
    }
  }

  function isWorldEdge(block, face) {
    return (face === 'n' && block.j === 0) || (face === 's' && block.j === layout.zRoads.length) ||
      (face === 'w' && block.i === 0) || (face === 'e' && block.i === layout.xRoads.length);
  }

  function buildCommercial(block) {
    if (block.landmark === 'cathedral') {
      buildStreetBlock(block, { frontage: [9, 16], depth: [12, 16], floors: [2, 5], shop: 0.8, tints: PASTELS, styles: ['plaster', 'apartment'], sides: 'se' });
      const i = block.inner;
      lawn({ inner: { minX: i.minX, maxX: i.maxX - 20, minZ: i.minZ, maxZ: i.maxZ - 20 } });
      pois.landmarks.push(LANDMARKS.cathedral(ctx, i.minX + 50, i.minZ + 40));
      return;
    }
    plaza(block, 0xe8e4dc);
    buildStreetBlock(block, { frontage: [9, 16], depth: [12, 18], floors: [2, 6], shop: 0.85, tints: PASTELS, styles: ['plaster', 'apartment', 'plaster'] });
  }

  function buildTowers(block) {
    plaza(block, 0xf0ece4);
    const i = block.inner;
    if (block.landmark === 'skyTower') {
      pois.landmarks.push(LANDMARKS.skyTower(ctx, (i.minX + i.maxX) / 2 + 20, (i.minZ + i.maxZ) / 2 + 15));
      building({ minX: i.minX + 6, maxX: i.minX + 34, minZ: i.minZ + 6, maxZ: i.minZ + 34, face: 'n' }, { style: 'glass', floors: 18, shop: false, tint: 0xd0e0ff, block });
      building({ minX: i.minX + 6, maxX: i.minX + 40, minZ: i.maxZ - 26, maxZ: i.maxZ - 4, face: 's' }, { style: 'plaster', floors: 6, shop: true, tint: 0xf4efe6, block });
      return;
    }
    const cells = [[0.25, 0.25], [0.72, 0.3], [0.3, 0.75], [0.72, 0.75]];
    for (const [fx, fz] of cells) {
      const cx = i.minX + (i.maxX - i.minX) * fx, cz = i.minZ + (i.maxZ - i.minZ) * fz;
      const s = rand(12, 18);
      building({ minX: cx - s, maxX: cx + s, minZ: cz - s * 0.8, maxZ: cz + s * 0.8 }, { style: 'glass', floors: Math.round(rand(10, 26)), tint: pick([0xd0e0ff, 0xe0f0e8, 0xf0e8d8, 0xc8d8f0]), block });
    }
  }

  function buildGov(block) {
    lawn(block);
    const lots = lotsAround(block.inner, [22, 40], [16, 22]);
    for (const lot of lots) {
      if (rng() < 0.25) { trees.push({ x: (lot.minX + lot.maxX) / 2, z: (lot.minZ + lot.maxZ) / 2, s: 1.3, t: 0 }); continue; }
      // Set back from the road behind a lawn.
      const sb = 4;
      const l = { ...lot };
      if (l.face === 'n') l.minZ += sb; if (l.face === 's') l.maxZ -= sb; if (l.face === 'e') l.maxX -= sb; if (l.face === 'w') l.minX += sb;
      building(l, { style: rng() < 0.7 ? 'heritage' : 'plaster', floors: Math.round(rand(2, 4)), tint: pick([0xf2ead8, 0xe8dcc8, 0xf5f0e6, 0xd9b8a0]), block });
    }
    const i = block.inner;
    for (let k = 0; k < 14; k++) trees.push({ x: rand(i.minX + 25, i.maxX - 25), z: rand(i.minZ + 25, i.maxZ - 25), s: rand(1, 1.5), t: 0 });
  }

  function buildResidential(block) {
    lawn(block, 0xb8b090);
    const lots = lotsAround(block.inner, [10, 15], [12, 16]);
    for (const lot of lots) {
      const sb = 3; // front setback with compound wall
      const l = { ...lot };
      const st = B.get('stone');
      const wallC = pick([0xe8e0d0, 0xd8c8b0, 0xf0e8e0]);
      const along = lot.face === 'n' || lot.face === 's';
      if (lot.face === 'n') l.minZ += sb; if (lot.face === 's') l.maxZ -= sb; if (lot.face === 'e') l.maxX -= sb; if (lot.face === 'w') l.minX += sb;
      // Compound wall along the frontage, with a gate gap.
      const wz = lot.face === 'n' ? lot.minZ + 0.15 : lot.face === 's' ? lot.maxZ - 0.15 : null;
      const wx = lot.face === 'w' ? lot.minX + 0.15 : lot.face === 'e' ? lot.maxX - 0.15 : null;
      const a0 = along ? lot.minX : lot.minZ, a1 = along ? lot.maxX : lot.maxZ;
      const gate = a0 + (a1 - a0) * 0.7;
      for (const [s0, s1] of [[a0, gate - 1.5], [gate + 1.5, a1]]) {
        if (s1 - s0 < 0.5) continue;
        const m = (s0 + s1) / 2, len = s1 - s0;
        if (along) { st.box(m, CURB_H, wz, len, 1.3, 0.3, wallC); colliders.addCentered(m, wz, len, 0.3, 1.5, 'wall'); }
        else { st.box(wx, CURB_H, m, 0.3, 1.3, len, wallC); colliders.addCentered(wx, m, 0.3, len, 1.5, 'wall'); }
      }
      building(l, { style: rng() < 0.6 ? 'plaster' : 'apartment', floors: Math.round(rand(1, 3.4)), tint: pick(PASTELS), block });
      if (rng() < 0.5) {
        const p = frontPoint(lot, -1.5);
        trees.push({ x: p.x + rand(-2, 2), z: p.z + rand(-1, 1), s: rand(0.5, 0.8), t: rng() < 0.3 ? 1 : 2 });
      }
      const door = frontPoint(lot, 2.2);
      pois.homes.push({ name: `#${Math.floor(rand(1, 999))}, ${block.district}`, x: door.x, z: door.z, district: block.district });
    }
  }

  function buildPark(block) {
    lawn(block);
    const i = block.inner;
    const cx = (i.minX + i.maxX) / 2, cz = (i.minZ + i.maxZ) / 2;
    const path = B.get('plaza');
    path.rect(cx - 2, cx + 2, i.minZ, i.maxZ, CURB_H + 0.02, 0xc8a080, (x, z) => [x / 4, -z / 4]);
    path.rect(i.minX, i.maxX, cz - 2, cz + 2, CURB_H + 0.02, 0xc8a080, (x, z) => [x / 4, -z / 4]);
    if (block.landmark) pois.landmarks.push(LANDMARKS[block.landmark](ctx, block));
    if (block.i === 3 && block.j === 3) LANDMARKS.statue(ctx, i.maxX - 10, i.maxZ - 10);
    const clear = block.landmark ? (block.landmark === 'library' ? 24 : 12) : 0;
    for (let k = 0; k < 70; k++) {
      const x = rand(i.minX + 3, i.maxX - 3), z = rand(i.minZ + 3, i.maxZ - 3);
      if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4) continue;
      if (clear && Math.abs(x - cx) < clear && Math.abs(z - cz) < clear) continue;
      trees.push({ x, z, s: rand(0.9, 1.6), t: rng() < 0.15 ? 1 : 0 });
    }
    pois.parking.push({ x: cx + 6, z: i.maxZ + 2 });
  }

  function buildLake(block) {
    lawn(block);
    const i = block.inner;
    const m = 9;
    const wMinX = i.minX + m, wMaxX = i.maxX - m, wMinZ = i.minZ + m, wMaxZ = i.maxZ - m;
    B.get('plaza').rect(i.minX + 4, i.maxX - 4, i.minZ + 4, i.maxZ - 4, CURB_H + 0.02, 0xd8c0a0, (x, z) => [x / 4, -z / 4]);
    B.get('stone').box((wMinX + wMaxX) / 2, -0.6, (wMinZ + wMaxZ) / 2, wMaxX - wMinX + 1, 0.85, wMaxZ - wMinZ + 1, 0x8a8478, { top: false });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(wMaxX - wMinX, wMaxZ - wMinZ), mats.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set((wMinX + wMaxX) / 2, 0.05, (wMinZ + wMaxZ) / 2);
    water.receiveShadow = true;
    group.add(water);
    colliders.add(wMinX, wMaxX, wMinZ, wMaxZ, 2, 'water');
    // Island with trees.
    const ix = (wMinX + wMaxX) / 2 + 10, iz = (wMinZ + wMaxZ) / 2 - 5;
    put(B.get('stone'), new THREE.CylinderGeometry(1, 1.15, 1, 20), ix, 0, iz, 0x6a7a3a, 0, 9, 0.5, 7);
    for (let k = 0; k < 6; k++) trees.push({ x: ix + rand(-6, 6), z: iz + rand(-4, 4), s: rand(0.8, 1.2), t: 0, noCollide: true });
    for (let x = i.minX + 3; x < i.maxX - 3; x += 9) { trees.push({ x, z: i.minZ + 2.5, s: rand(0.9, 1.3), t: 0 }); trees.push({ x, z: i.maxZ - 2.5, s: rand(0.9, 1.3), t: 0 }); }
    pois.landmarks.push({ name: 'Ulsoor Lake', x: (wMinX + wMaxX) / 2, z: i.maxZ + 2 });
    mats.water.userData.animate = true;
  }

  // Rain trees and gulmohars line nearly every Bengaluru street.
  function avenueTrees(block) {
    if (block.zone === 'lake') return;
    const o = block.outer;
    const spacing = block.zone === 'commercial' || block.zone === 'market' ? 26 : 16;
    const inset = 1.0;
    const sides = [];
    if (block.j > 0) sides.push([o.minX, o.maxX, o.minZ + inset, 'x']);
    if (block.j < layout.zRoads.length) sides.push([o.minX, o.maxX, o.maxZ - inset, 'x']);
    if (block.i > 0) sides.push([o.minZ, o.maxZ, o.minX + inset, 'z']);
    if (block.i < layout.xRoads.length) sides.push([o.minZ, o.maxZ, o.maxX - inset, 'z']);
    for (const [a0, a1, c, ax] of sides) {
      for (let a = a0 + 6 + rand(0, 4); a < a1 - 6; a += spacing + rand(-3, 3)) {
        const t = rng() < 0.18 ? 1 : 0;
        trees.push(ax === 'x' ? { x: a, z: c, s: rand(0.8, 1.3), t } : { x: c, z: a, s: rand(0.8, 1.3), t });
      }
    }
  }

  function streetLamps(block) {
    const o = block.outer;
    const sides = [];
    if (block.j > 0) sides.push([o.minX, o.maxX, o.minZ + 0.4, 'x', 1]);
    if (block.i > 0) sides.push([o.minZ, o.maxZ, o.minX + 0.4, 'z', 1]);
    for (const [a0, a1, c, ax] of sides) {
      for (let a = a0 + 12; a < a1 - 8; a += 32) lamps.push(ax === 'x' ? [a, c, 0] : [c, a, Math.PI / 2]);
    }
  }

  // ---------- Road-end barricades and world bounds ----------
  for (const r of layout.roads) {
    for (const end of [WORLD_MIN + 2, WORLD_MAX - 2]) {
      const st = B.get('stone');
      for (let k = 0; k < Math.ceil(r.width / 2); k++) {
        const off = -r.width / 2 + 1 + k * 2;
        const col = k % 2 ? 0x222222 : 0xf2c200;
        if (r.axis === 'x') st.box(r.pos + off, 0, end, 2, 1.2, 0.6, col); else st.box(end, 0, r.pos + off, 0.6, 1.2, 2, col);
      }
      if (r.axis === 'x') colliders.addCentered(r.pos, end, r.width, 1, 3, 'wall'); else colliders.addCentered(end, r.pos, 1, r.width, 3, 'wall');
      signs.push({ key: 'metroWork', text: ['ROAD CLOSED · METRO WORK', 'ಮೆಟ್ರೋ ಕಾಮಗಾರಿ'], bg: '#f2c200', fg: '#111',
        x: r.axis === 'x' ? r.pos : end + (end < 0 ? 0.31 : -0.31), z: r.axis === 'x' ? end + (end < 0 ? 0.31 : -0.31) : r.pos, y: 1.4, w: 6, h: 1.5,
        face: r.axis === 'x' ? (end < 0 ? 's' : 'n') : (end < 0 ? 'e' : 'w') });
    }
  }
  colliders.add(WORLD_MIN - 10, WORLD_MIN, WORLD_MIN - 10, WORLD_MAX + 10, 100, 'bound');
  colliders.add(WORLD_MAX, WORLD_MAX + 10, WORLD_MIN - 10, WORLD_MAX + 10, 100, 'bound');
  colliders.add(WORLD_MIN - 10, WORLD_MAX + 10, WORLD_MIN - 10, WORLD_MIN, 100, 'bound');
  colliders.add(WORLD_MIN - 10, WORLD_MAX + 10, WORLD_MAX, WORLD_MAX + 10, 100, 'bound');

  // ---------- Bake merged meshes ----------
  B.buildAll(mats, group, {
    junction: { castShadow: false }, zebra: { castShadow: false }, grass: { castShadow: false }, plaza: { castShadow: false },
    signs: { castShadow: false }, glow: { castShadow: false },
  }, 160);
  for (const m of group.children) if (m.name.startsWith('road_')) m.castShadow = false;

  buildInstancedTrees(group, trees, colliders);
  buildLamps(group, lamps, colliders);
  buildTanks(group, tanks);
  buildTextSigns(group, signs);

  const update = (dt, t) => {
    if (mats.water.normalMap) mats.water.normalMap.offset.set(t * 0.01, t * 0.006);
  };
  return { group, pois, update, materials: mats, lampPositions: lamps };
}

function buildInstancedTrees(group, trees, colliders) {
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.4, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 });
  // Canopy: a cluster of jittered blobs merged into one smooth, indexed geometry per tree type.
  const canopy = (wide) => {
    const parts = [];
    const r = T.mulberry32(wide ? 3 : 9);
    const n = wide ? 7 : 5;
    for (let k = 0; k < n; k++) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      g.deleteAttribute('uv');
      const a = (k / n) * Math.PI * 2;
      const rad = k === 0 ? 0 : (wide ? 2.2 : 1.4) * (0.6 + r() * 0.4);
      const s = (wide ? 2.1 : 1.6) * (0.7 + r() * 0.4);
      g.scale(s, s * (wide ? 0.6 : 0.8), s);
      g.translate(Math.cos(a) * rad, (r() - 0.5) * 0.8, Math.sin(a) * rad);
      parts.push(g);
    }
    let g = mergeVertices(mergeGeometries(parts));
    const pa = g.attributes.position;
    for (let k = 0; k < pa.count; k++) {
      const x = pa.getX(k), y = pa.getY(k), z = pa.getZ(k);
      const n = 1 + Math.sin(x * 3.1 + z * 2.3) * Math.cos(y * 2.7 + x) * 0.12;
      pa.setXYZ(k, x * n, y * n, z * n);
    }
    g.computeVertexNormals();
    return g;
  };
  const geos = [canopy(true), canopy(false), canopy(false)];
  const trunkH = [4.2, 3.2, 1.8];
  const colours = [
    [0x3f6a2a, 0x4a7a30, 0x557d33, 0x3a5f28, 0x5e8a3a], // rain tree / avenue greens
    [0xd8452a, 0xe25a2a, 0xc93a22, 0xe86a30], // gulmohar in bloom
    [0x4c8a3a, 0x5a9a40, 0xa04aa0, 0x8a5ac8], // garden shrubs, bougainvillea, jacaranda
  ];
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: false });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  // Bucket by type and 160 m chunk so instanced meshes can be frustum-culled.
  const buckets = new Map();
  for (const t of trees) {
    const key = `${t.t}:${Math.floor(t.x / 160)}:${Math.floor(t.z / 160)}`;
    if (!buckets.has(key)) buckets.set(key, { type: t.t, list: [] });
    buckets.get(key).list.push(t);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const r = T.mulberry32(77);
  let ti = 0;
  for (const { type, list } of buckets.values()) {
    const inst = new THREE.InstancedMesh(geos[type], mat, list.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    list.forEach((t, k) => {
      const h = trunkH[type] * t.s;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      m.compose(p.set(t.x, h + 0.8 * t.s, t.z), q, s.set(t.s, t.s, t.s));
      inst.setMatrixAt(k, m);
      const pal = colours[type];
      inst.setColorAt(k, c.setHex(pal[Math.floor(r() * pal.length)]).offsetHSL(0, 0, (r() - 0.5) * 0.06));
      m.compose(p.set(t.x, 0.1, t.z), q, s.set(t.s, h + 0.8, t.s));
      trunks.setMatrixAt(ti++, m);
      if (!t.noCollide && type !== 2) colliders.addCentered(t.x, t.z, 0.7 * t.s, 0.7 * t.s, 6, 'tree');
    });
    inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  trunks.count = ti;
  trunks.computeBoundingSphere();
  group.add(trunks);
}

function buildLamps(group, lamps, colliders) {
  const b = new BuilderSet();
  const pole = b.get('metal');
  const head = b.get('glow');
  const cyl = new THREE.CylinderGeometry(0.08, 0.12, 1, 6);
  for (const [x, z, rot] of lamps) {
    put(pole, cyl, x, 4.15, z, 0x6a6e72, 0, 1, 8, 1);
    const dx = rot ? -1.6 : 0, dz = rot ? 0 : -1.6;
    // Arm reaching over the carriageway.
    put(pole, cyl, x + dx / 2, 8.1, z + dz / 2, 0x6a6e72, 0, 0.7, 1.7, 0.7, rot ? 0 : Math.PI / 2, rot ? Math.PI / 2 : 0);
    head.box(x + dx, 7.85, z + dz, 0.6, 0.15, 0.6, 0xfff2cc);
    colliders.addCentered(x, z, 0.3, 0.3, 8, 'pole');
  }
  b.buildAll({ metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 }), glow: new THREE.MeshBasicMaterial({ vertexColors: true }) }, group, { glow: { castShadow: false } });
}

function buildTanks(group, tanks) {
  const geo = new THREE.CylinderGeometry(0.6, 0.6, 1.3, 12);
  geo.translate(0, 0.65, 0);
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }), tanks.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  tanks.forEach(([x, y, z, sc], k) => { m.compose(p.set(x, y, z), q, s.set(sc, sc, sc)); inst.setMatrixAt(k, m); });
  inst.castShadow = true;
  group.add(inst);
}

function buildTextSigns(group, signs) {
  const cache = new Map();
  for (const sg of signs) {
    let mat = cache.get(sg.key);
    if (!mat) {
      const t = T.textTexture(sg.text, { bg: sg.bg || '#2a2622', fg: sg.fg || '#f2e6c8', w: 1024, h: Math.round(1024 * sg.h / sg.w) });
      mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
      cache.set(sg.key, mat);
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, sg.h), mat);
    mesh.position.set(sg.x, sg.y, sg.z);
    mesh.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[sg.face];
    group.add(mesh);
  }
}
