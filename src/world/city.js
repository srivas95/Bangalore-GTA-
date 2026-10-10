// Builds the static city: ground, footpaths, buildings, trees, props and landmarks.
// Roads, underpasses, the flyover and the railway live in infrastructure.js.
import * as THREE from 'three';
import { BuilderSet, sharedUniforms } from './meshBuilder.js';
import * as T from './textures.js';
import { LANDMARKS, put } from './landmarks.js';
import { buildInfrastructure } from './infrastructure.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB_H, WORLD_MIN, WORLD_MAX, SHOP_SIGNS, RAILWAY, FUEL_BRANDS, HOTELS } from '../config.js';

const rng = T.mulberry32(20240607);
const rand = (a = 0, b = 1) => a + (b - a) * rng();
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

const PASTELS = [0xf3e9d2, 0xe8d5b5, 0xf0c9a0, 0xd9e4dd, 0xf5e1e9, 0xe3d7f0, 0xfff6d5, 0xcfe0f5, 0xf2c6b4, 0xe6e6e6, 0xd4ecc8, 0xf7d9a8, 0xffffff];
const BRIGHTS = [0xf4a6a6, 0x9fd3c7, 0xf7dc6f, 0xaed6f1, 0xd7bde2, 0xf5cba7, 0xa9dfbf, 0xf0b27a];
const FLOOR_H = 3.2;
const SHOP_H = 4;
const CHUNK = 320;

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
  const pois = { food: [], homes: [], landmarks: [], parking: [], industrial: [] };
  const signCount = T.SIGN_COLS * T.SIGN_ROWS;
  const pools = { general: [], pub: [], industrial: [] };
  for (let k = 0; k < signCount; k++) {
    const s = SHOP_SIGNS[k % SHOP_SIGNS.length];
    if (s.industrial) pools.industrial.push(k); else pools.general.push(k);
    if (s.pub) pools.pub.push(k);
  }
  const poolIdx = { general: 0, pub: 0, industrial: 0 };
  // Famous brands open their first branch in their home neighbourhood.
  const homeBrands = SHOP_SIGNS.map((s, k) => ({ s, k })).filter((h) => h.s.home);
  const stations = []; // fuel stations placed so far
  let fuelIdx = 0;

  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (t) => { t.anisotropy = Math.min(8, aniso); return t; };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const facade = (style, map, extra = {}) => std({ map: tex(map), vertexColors: true, emissiveMap: T.windowGlow(style), emissive: 0xffe2b0, emissiveIntensity: 0, ...extra });
  const mats = {
    ground: std({ map: tex(T.soilTexture()), roughness: 1 }),
    sidewalk: std({ map: tex(T.paverTexture()), roughness: 0.95, vertexColors: true }),
    grass: std({ map: tex(T.grassTexture()), roughness: 1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    plaza: std({ map: tex(T.concreteTexture()), roughness: 0.95, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    junction: std({ map: tex(T.asphaltTexture()), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    zebra: std({ map: tex(T.zebraTexture()), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    plaster: facade('plaster', T.plasterFacade(), { roughness: 0.9 }),
    apartment: facade('apartment', T.apartmentFacade(), { roughness: 0.9 }),
    heritage: facade('heritage', T.heritageFacade(), { roughness: 0.85 }),
    glass: facade('glass', T.glassFacade(), { roughness: 0.12, metalness: 0.65, envMapIntensity: 1.2 }),
    shop: facade('shop', T.shopfrontTexture(), { roughness: 0.85 }),
    roof: std({ map: tex(T.roofTexture()), roughness: 0.95, vertexColors: true }),
    stone: std({ roughness: 0.75, vertexColors: true, side: THREE.DoubleSide }),
    metal: std({ roughness: 0.4, metalness: 0.7, vertexColors: true }),
    sheet: std({ roughness: 0.45, metalness: 0.6, vertexColors: true, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    signs: std({ map: T.signAtlas(), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.08, vertexColors: true }),
    water: std({ color: 0x4f7f86, roughness: 0.06, metalness: 0.2, normalMap: T.waterNormal(), normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.3 }),
  };
  mats.signs.emissiveMap = mats.signs.map;
  mats.water.normalMap.repeat.set(12, 12);
  // Materials whose emissive brightens at night: [material, day, night].
  const nightMats = [
    [mats.plaster, 0, 0.9], [mats.apartment, 0, 0.9], [mats.heritage, 0, 0.7], [mats.glass, 0, 0.8], [mats.shop, 0, 0.55], [mats.signs, 0.08, 0.9],
  ];
  // Road-like surfaces that turn dark and reflective in the rain.
  const roadMats = new Set([mats.junction, mats.zebra]);
  const wetMats = [mats.sidewalk, mats.plaza];

  // ---------- Ground (only outside the city: inside, blocks and roads cover everything) ----------
  const gb = new BuilderSet();
  const pad = 1600, g = gb.get('ground');
  const A = WORLD_MIN - pad, Z = WORLD_MAX + pad;
  const gy = -0.05, uv = (x, z) => [x / 8, -z / 8];
  g.rect(A, Z, A, WORLD_MIN, gy, 0xffffff, uv);
  g.rect(A, Z, WORLD_MAX, Z, gy, 0xffffff, uv);
  g.rect(A, WORLD_MIN, WORLD_MIN, WORLD_MAX, gy, 0xffffff, uv);
  g.rect(WORLD_MAX, Z, WORLD_MIN, WORLD_MAX, gy, 0xffffff, uv);
  gb.buildAll({ ground: mats.ground }, group, { ground: { castShadow: false } });

  // ---------- Helpers shared with landmarks ----------
  const lawn = (block, color = 0xffffff) => {
    const i = block.inner;
    B.get('grass').rect(i.minX, i.maxX, i.minZ, i.maxZ, CURB_H + 0.01, color, (x, z) => [x / 6, -z / 6]);
  };
  const plaza = (block, color = 0xffffff) => {
    const i = block.inner;
    B.get('plaza').rect(i.minX, i.maxX, i.minZ, i.maxZ, CURB_H + 0.01, color, (x, z) => [x / 5, -z / 5]);
  };
  // Scatter trees: in a ring around (cx, cz), or around a block's margins if `block` is given.
  const scatterTrees = (cx, cz, radius, n, block) => {
    if (block) {
      const i = block.inner;
      for (let k = 0; k < 18; k++) {
        const x = rand(i.minX + 3, i.maxX - 3), z = rand(i.minZ + 3, i.maxZ - 3);
        if (Math.abs(x - cx) < 40 && Math.abs(z - cz) < 34) continue;
        trees.push({ x, z, s: rand(0.9, 1.4), t: rng() < 0.2 ? 1 : 0 });
      }
      return;
    }
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      trees.push({ x: cx + Math.cos(a) * radius, z: cz + Math.sin(a) * radius, s: rand(0.7, 1.0), t: k % 3 === 0 ? 1 : 0 });
    }
  };
  const ctx = { B, colliders, signs, lawn, plaza, pois, trees: scatterTrees, layout, mats, tex, group, roadMats };

  // ---------- Roads, underpasses, flyover, railway ----------
  const infra = buildInfrastructure(ctx);

  // ---------- Blocks ----------
  const railZ = RAILWAY.z;
  for (const block of layout.blocks) {
    const o = block.outer;
    B.get('sidewalk').box((o.minX + o.maxX) / 2, 0, (o.minZ + o.maxZ) / 2, o.maxX - o.minX, CURB_H, o.maxZ - o.minZ,
      0xd0ccc4, { tileW: 2, tileH: 2, topTile: 2.2, topColor: 0xffffff });
    avenueTrees(block);
    streetLamps(block);
    const crossesRail = railZ > o.minZ && railZ < o.maxZ && block.inner.maxX > RAILWAY.from && block.inner.minX < RAILWAY.to;
    if (block.landmark === 'yeshwanthpurStation') { pois.landmarks.push(LANDMARKS.yeshwanthpurStation(ctx, block, railZ)); continue; }
    if (crossesRail) {
      // Build on either side of the tracks.
      const i = block.inner;
      for (const sub of [{ ...i, maxZ: railZ - 9 }, { ...i, minZ: railZ + 9 }]) {
        if (sub.maxZ - sub.minZ < 20) continue;
        buildZone({ ...block, inner: sub, landmark: null });
      }
      continue;
    }
    buildZone(block);
  }

  function buildZone(block) {
    switch (block.zone) {
      case 'park': buildPark(block); break;
      case 'lake': buildLake(block); break;
      case 'landmark': pois.landmarks.push(LANDMARKS[block.landmark](ctx, block)); break;
      case 'towers': buildTowers(block); break;
      case 'gov': buildGov(block); break;
      case 'residential': buildResidential(block); break;
      case 'industrial': buildIndustrial(block); break;
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
    if (maxD < 4) return lots;
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
      B.get('stone').box(cx, y - 0.25, cz, w + 0.6, 0.3, d + 0.6, 0xcfc8ba, { top: true });
      addSign(lot, y + 0.1, block);
    }
    const tile = style === 'glass' ? T.GLASS_TILE : T.FACADE_TILE;
    const h = floors * FLOOR_H;
    if (floors > 0) B.get(style).box(cx, y, cz, w, h, d, tint, { tileW: tile.w, tileH: tile.h, topBuilder: roofB, topTile: 10 });
    const top = y + h;
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

  function nextSign(block) {
    if (block.zone !== 'industrial') {
      const h = homeBrands.find((h) => !h.placed && h.s.home === block.district);
      if (h) { h.placed = true; return h.k; }
    }
    const kind = block.zone === 'industrial' ? 'industrial' : block.pubs && rng() < 0.55 ? 'pub' : 'general';
    const pool = pools[kind];
    return pool[poolIdx[kind]++ % pool.length];
  }

  function addSign(lot, y, block) {
    const along = lot.face === 'n' || lot.face === 's';
    const a0 = along ? lot.minX : lot.minZ, a1 = along ? lot.maxX : lot.maxZ;
    const len = Math.min(a1 - a0 - 0.8, 6);
    if (len < 2) return;
    const mid = (a0 + a1) / 2;
    const k = nextSign(block);
    faceQuad(B.get('signs'), lot.face, lot, mid - len / 2, mid + len / 2, y, y + len / 4, 0.32, T.signUV(k), 0xffffff);
    const sign = SHOP_SIGNS[k % SHOP_SIGNS.length];
    if (sign.food) {
      const p = frontPoint(lot, 2.2);
      pois.food.push({ name: sign.en, x: p.x, z: p.z, district: block.district });
    }
  }

  function hotelFor(block) {
    const o = block.outer;
    return HOTELS.find((h) => h.at[0] > o.minX && h.at[0] < o.maxX && h.at[1] > o.minZ && h.at[1] < o.maxZ);
  }

  // A hotel tower (or a mall) with its name lit up on all four sides of the crown.
  function brandedTower(lot, h, block) {
    const top = building(lot, { style: h.style || (h.mall ? 'plaster' : 'glass'), floors: h.floors, tint: h.tint, block });
    const w = lot.maxX - lot.minX, d = lot.maxZ - lot.minZ;
    const cx = (lot.minX + lot.maxX) / 2, cz = (lot.minZ + lot.maxZ) / 2;
    const sh = h.mall ? 3.6 : 4.2, y = top + (h.mall ? -sh / 2 - 0.6 : sh / 2 + 0.6);
    const key = `brand_${h.name}`;
    B.get('stone').box(cx, top, cz, w * 0.8, h.mall ? 0.4 : sh + 1.2, d * 0.8, 0x2a2a2a);
    const sw = Math.min(Math.min(w, d) * 0.78, sh * 6);
    for (const [face, x, z, depth] of [['n', cx, lot.minZ - 0.06, d], ['s', cx, lot.maxZ + 0.06, d], ['e', lot.maxX + 0.06, cz, w], ['w', lot.minX - 0.06, cz, w]]) {
      const inset = h.mall ? 0 : 0.1 * depth; // the crown is 80% of the footprint
      const px = face === 'e' ? x - inset : face === 'w' ? x + inset : x, pz = face === 's' ? z - inset : face === 'n' ? z + inset : z;
      signs.push({ key, text: [h.name, h.sub], bg: h.bg, fg: h.fg, x: px, y, z: pz, w: sw, h: sh, face, fonts: [`bold ${h.mall ? 72 : 96}px "Oswald", Arial, sans-serif`, `${h.mall ? 34 : 40}px "Oswald", Arial, sans-serif`] });
    }
    pois.landmarks.push({ name: h.label, x: cx, z: cz });
  }

  // Fuel stations: a branded canopy over two pump islands, a kiosk at the back and a totem sign.
  function fuelStation(lot, block) {
    if (!lot.face || (block.edge && isWorldEdge(block, lot.face))) return false;
    const along = lot.face === 'n' || lot.face === 's';
    const a0 = along ? lot.minX : lot.minZ, a1 = along ? lot.maxX : lot.maxZ;
    const D = along ? lot.maxZ - lot.minZ : lot.maxX - lot.minX;
    if (a1 - a0 < 14 || D < 12 || rng() > 0.12) return false;
    const cx0 = (lot.minX + lot.maxX) / 2, cz0 = (lot.minZ + lot.maxZ) / 2;
    if (stations.some((s) => Math.hypot(s.x - cx0, s.z - cz0) < 800)) return false;
    stations.push({ x: cx0, z: cz0 });
    const brand = FUEL_BRANDS[[0, 1, 0, 2][fuelIdx++ % 4]];
    // Local frame: a along the frontage, d inward from the road edge.
    const M = (a, d) => {
      switch (lot.face) {
        case 'n': return [a, lot.minZ + d];
        case 's': return [a, lot.maxZ - d];
        case 'e': return [lot.maxX - d, a];
        default: return [lot.minX + d, a];
      }
    };
    const box = (b, a, d, la, ld, y, h, col, opts) => { const [x, z] = M(a, d); b.box(x, y, z, along ? la : ld, h, along ? ld : la, col, opts); };
    const st = B.get('stone');
    const am = (a0 + a1) / 2;
    box(st, am, D / 2, a1 - a0, D, CURB_H, 0.03, 0xb4b0a8);
    // Canopy.
    const ca = Math.min(a1 - a0 - 3, 16), cd = Math.min(D * 0.55, 9), cdm = 1.5 + cd / 2;
    box(st, am, cdm, ca, cd, 5.0, 0.35, 0xf2f2f2);
    box(st, am, cdm, ca + 0.15, cd + 0.15, 5.3, 0.55, brand.canopy);
    box(st, am, cdm, ca + 0.2, cd + 0.2, 5.42, 0.12, brand.stripe, { top: false });
    for (const sa of [-1, 1]) for (const sd of [-1, 1]) {
      const a = am + sa * (ca / 2 - 1.2), d = cdm + sd * (cd / 2 - 1.2);
      box(st, a, d, 0.4, 0.4, CURB_H, 5.0, 0xe8e8e8);
      const [x, z] = M(a, d);
      colliders.addCentered(x, z, 0.5, 0.5, 5, 'pole');
    }
    // Pump islands.
    for (const sa of [-1, 1]) {
      const a = am + sa * ca * 0.22;
      box(st, a, cdm, 1.1, 3.2, CURB_H, 0.2, 0xd8d4cc);
      for (const sd of [-0.8, 0.8]) {
        box(st, a, cdm + sd, 0.5, 0.7, CURB_H + 0.2, 1.7, brand.canopy);
        box(st, a, cdm + sd, 0.52, 0.72, CURB_H + 1.45, 0.25, 0xffffff, { top: false });
      }
      const [x, z] = M(a, cdm);
      colliders.addCentered(x, z, along ? 1.1 : 3.2, along ? 3.2 : 1.1, 1.9, 'pole');
    }
    // Kiosk at the back.
    const kd = Math.min(5, D - cd - 2);
    if (kd > 2.5) {
      const [k0x, k0z] = M(am - 4.5, D - kd), [k1x, k1z] = M(am + 4.5, D);
      building({ minX: Math.min(k0x, k1x), maxX: Math.max(k0x, k1x), minZ: Math.min(k0z, k1z), maxZ: Math.max(k0z, k1z), face: lot.face }, { style: 'plaster', floors: 1, tint: 0xf6f6f6, block });
    }
    // Branding: the canopy fascia facing the road, and a totem by the kerb.
    const [fx, fz] = M(am, 1.5 - 0.1);
    signs.push({ key: `fuel_${brand.key}_fascia`, text: [brand.name], bg: brand.bg, fg: brand.fg, x: fx, y: 5.37, z: fz, w: 4, h: 0.5, face: lot.face, font: 'bold 92px "Oswald", Arial, sans-serif' });
    const ta = a1 - 1.2;
    box(st, ta, 0.8, 0.3, 0.3, CURB_H, 4.2, 0x888888);
    box(st, ta, 0.8, 1.7, 0.25, CURB_H + 3.2, 3.0, 0x222222);
    const [tx, tz] = M(ta, 0.8 - 0.14);
    signs.push({ key: `fuel_${brand.key}_totem`, text: [brand.name, brand.full, 'PETROL · DIESEL'], bg: brand.bg, fg: brand.fg, x: tx, y: CURB_H + 4.7, z: tz, w: 1.6, h: 2.8, face: lot.face, fonts: ['bold 300px "Oswald", Arial, sans-serif', 'bold 84px "Noto Sans Kannada", "Oswald", sans-serif', 'bold 84px "Oswald", Arial, sans-serif'] });
    const [px, pz] = M(ta, 0.8);
    colliders.addCentered(px, pz, 0.6, 0.6, 7, 'pole');
    const [qx, qz] = M(am, -2);
    pois.fuel = pois.fuel || [];
    pois.fuel.push({ name: brand.name, x: qx, z: qz, face: lot.face });
    return true;
  }

  function buildStreetBlock(block, o) {
    const lots = lotsAround(block.inner, o.frontage, o.depth, o.sides || 'nsew');
    for (const lot of lots) {
      const shop = rng() < o.shop && lot.face && !(block.edge && isWorldEdge(block, lot.face));
      if (block.zone !== 'market' && fuelStation(lot, block)) continue;
      building(lot, { style: pick(o.styles), floors: Math.round(rand(...o.floors)), shop, tint: pick(o.tints), block });
    }
    const i = block.inner;
    const inset = o.depth[1] + 3;
    if (i.maxX - i.minX > inset * 2 + 10 && i.maxZ - i.minZ > inset * 2 + 10) {
      const cx = (i.minX + i.maxX) / 2, cz = (i.minZ + i.maxZ) / 2;
      const hw = (i.maxX - i.minX) / 2 - inset, hd = (i.maxZ - i.minZ) / 2 - inset;
      const hotel = hotelFor(block);
      if (hotel) brandedTower({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd }, hotel, block);
      else if (rng() < 0.6) building({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd }, { style: pick(o.styles), floors: Math.round(rand(o.floors[0] + 1, o.floors[1] + 3)), tint: pick(o.tints), block });
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
    buildStreetBlock(block, { frontage: [8, 15], depth: [12, 18], floors: block.pubs ? [2, 5] : [2, 6], shop: 0.9, tints: block.pubs ? BRIGHTS.concat(PASTELS) : PASTELS, styles: ['plaster', 'apartment', 'plaster'] });
  }

  function buildTowers(block) {
    plaza(block, 0xf0ece4);
    const i = block.inner;
    const cx = (i.minX + i.maxX) / 2, cz = (i.minZ + i.maxZ) / 2;
    if (block.landmark === 'skyTower') {
      pois.landmarks.push(LANDMARKS.skyTower(ctx, cx + 20, cz + 15));
      building({ minX: i.minX + 6, maxX: i.minX + 34, minZ: i.minZ + 6, maxZ: i.minZ + 34, face: 'n' }, { style: 'glass', floors: 18, shop: false, tint: 0xd0e0ff, block });
      building({ minX: i.minX + 6, maxX: i.minX + 40, minZ: i.maxZ - 26, maxZ: i.maxZ - 4, face: 's' }, { style: 'plaster', floors: 6, shop: true, tint: 0xf4efe6, block });
      return;
    }
    if (block.landmark === 'wtc') {
      pois.landmarks.push(LANDMARKS.wtc(ctx, cx, cz + 10));
      const mall = hotelFor(block);
      if (mall) brandedTower({ minX: i.minX + 4, maxX: i.minX + 46, minZ: i.minZ + 4, maxZ: i.minZ + 34 }, mall, block);
      else building({ minX: i.minX + 4, maxX: i.minX + 30, minZ: i.minZ + 4, maxZ: i.minZ + 30, face: 'n' }, { style: 'glass', floors: 12, tint: 0xd8e4f0, block });
      return;
    }
    const cells = [[0.25, 0.25], [0.72, 0.3], [0.3, 0.75], [0.72, 0.75]];
    const hotel = hotelFor(block);
    for (const [fx, fz] of cells) {
      const x = i.minX + (i.maxX - i.minX) * fx, z = i.minZ + (i.maxZ - i.minZ) * fz;
      const s = rand(12, 18);
      if (hotel && fx === 0.25) { brandedTower({ minX: x - 15, maxX: x + 15, minZ: z - 12, maxZ: z + 12 }, hotel, block); continue; }
      building({ minX: x - s, maxX: x + s, minZ: z - s * 0.8, maxZ: z + s * 0.8 }, { style: 'glass', floors: Math.round(rand(10, 26)), tint: pick([0xd0e0ff, 0xe0f0e8, 0xf0e8d8, 0xc8d8f0]), block });
    }
  }

  function buildGov(block) {
    lawn(block);
    const lots = lotsAround(block.inner, [22, 40], [16, 22]);
    for (const lot of lots) {
      if (rng() < 0.25) { trees.push({ x: (lot.minX + lot.maxX) / 2, z: (lot.minZ + lot.maxZ) / 2, s: 1.3, t: 0 }); continue; }
      const sb = 4;
      const l = { ...lot };
      if (l.face === 'n') l.minZ += sb; if (l.face === 's') l.maxZ -= sb; if (l.face === 'e') l.maxX -= sb; if (l.face === 'w') l.minX += sb;
      building(l, { style: rng() < 0.7 ? 'heritage' : 'plaster', floors: Math.round(rand(2, 4)), tint: pick([0xf2ead8, 0xe8dcc8, 0xf5f0e6, 0xd9b8a0]), block });
    }
    const i = block.inner;
    for (let k = 0; k < 14; k++) trees.push({ x: rand(i.minX + 25, i.maxX - 25), z: rand(i.minZ + 25, i.maxZ - 25), s: rand(1, 1.5), t: 0 });
  }

  function compoundWall(lot, colour, gateFrac = 0.7, gateHalf = 1.5, h = 1.3) {
    const st = B.get('stone');
    const along = lot.face === 'n' || lot.face === 's';
    const wz = lot.face === 'n' ? lot.minZ + 0.15 : lot.face === 's' ? lot.maxZ - 0.15 : null;
    const wx = lot.face === 'w' ? lot.minX + 0.15 : lot.face === 'e' ? lot.maxX - 0.15 : null;
    const a0 = along ? lot.minX : lot.minZ, a1 = along ? lot.maxX : lot.maxZ;
    const gate = a0 + (a1 - a0) * gateFrac;
    for (const [s0, s1] of [[a0, gate - gateHalf], [gate + gateHalf, a1]]) {
      if (s1 - s0 < 0.5) continue;
      const m = (s0 + s1) / 2, len = s1 - s0;
      if (along) { st.box(m, CURB_H, wz, len, h, 0.3, colour); colliders.addCentered(m, wz, len, 0.3, h + 0.2, 'wall'); }
      else { st.box(wx, CURB_H, m, 0.3, h, len, colour); colliders.addCentered(wx, m, 0.3, len, h + 0.2, 'wall'); }
    }
    return gate;
  }

  function buildResidential(block) {
    lawn(block, 0xb8b090);
    const lots = lotsAround(block.inner, [10, 15], [12, 16]);
    for (const lot of lots) {
      const sb = 3;
      const l = { ...lot };
      if (lot.face === 'n') l.minZ += sb; if (lot.face === 's') l.maxZ -= sb; if (lot.face === 'e') l.maxX -= sb; if (lot.face === 'w') l.minX += sb;
      compoundWall(lot, pick([0xe8e0d0, 0xd8c8b0, 0xf0e8e0]));
      building(l, { style: rng() < 0.6 ? 'plaster' : 'apartment', floors: Math.round(rand(1, 3.4)), tint: pick(PASTELS), block });
      if (rng() < 0.5) {
        const p = frontPoint(lot, -1.5);
        trees.push({ x: p.x + rand(-2, 2), z: p.z + rand(-1, 1), s: rand(0.5, 0.8), t: rng() < 0.3 ? 1 : 2 });
      }
      const door = frontPoint(lot, 2.2);
      pois.homes.push({ name: `#${Math.floor(rand(1, 999))}, ${block.district}`, x: door.x, z: door.z, district: block.district });
    }
  }

  // Peenya: factory sheds with sawtooth roofs, chimneys, compound walls and painted name boards.
  function buildIndustrial(block) {
    plaza(block, 0xb8b0a0);
    const lots = lotsAround(block.inner, [26, 44], [26, 40]);
    const metal = B.get('sheet'), st = B.get('stone');
    for (const lot of lots) {
      const sb = 6;
      const l = { ...lot };
      if (lot.face === 'n') l.minZ += sb; if (lot.face === 's') l.maxZ -= sb; if (lot.face === 'e') l.maxX -= sb; if (lot.face === 'w') l.minX += sb;
      const gateA = compoundWall(lot, pick([0xc8c0b0, 0xa8b0b8, 0xd8d0c0]), 0.5, 3.5, 2.2);
      const w = l.maxX - l.minX, d = l.maxZ - l.minZ;
      if (w < 8 || d < 8) continue;
      const cx = (l.minX + l.maxX) / 2, cz = (l.minZ + l.maxZ) / 2;
      const H = rand(7, 10);
      const tint = pick([0xd8dce0, 0xc8d0d8, 0xe0d8c8, 0xb8c8d8]);
      B.get('plaster').box(cx, CURB_H, cz, w, H, d, tint, { tileW: 14, tileH: 12.8, top: false });
      st.box(cx, CURB_H + 2.2, cz, w + 0.04, 0.6, d + 0.04, pick([0x2a5a9a, 0x9a2a2a, 0x2a7a4a]), { top: false });
      // Sawtooth roof: teeth run along x, repeating along z.
      const teeth = Math.max(2, Math.round(d / 6)), td = d / teeth;
      for (let k = 0; k < teeth; k++) {
        const z0 = l.minZ + k * td;
        put(metal, BOXG, cx, CURB_H + H + 1.2, z0 + td / 2, 0x8a9098, 0, w, 0.08, Math.hypot(td, 2.4), Math.atan2(2.4, td));
        B.get('glass').box(cx, CURB_H + H, z0 + td - 0.05, w, 2.4, 0.1, 0x8aa0b0, { top: false, tileW: 8, tileH: 12.8 });
      }
      colliders.add(l.minX, l.maxX, l.minZ, l.maxZ, CURB_H + H + 2.4, 'building');
      if (rng() < 0.3) {
        const chx = l.minX + 3, chz = l.minZ + 3;
        for (let k = 0; k < 6; k++) put(st, CHIMNEY, chx, CURB_H + k * 4 + 2, chz, k % 2 ? 0xd02020 : 0xf0f0f0, 0, 1.0 - k * 0.06, 4, 1.0 - k * 0.06);
        colliders.addCentered(chx, chz, 2.2, 2.2, 25, 'pole');
      }
      // Name board over the gate.
      const fake = { ...lot };
      const along = lot.face === 'n' || lot.face === 's';
      const k = nextSign(block);
      const a = gateA;
      if (along) { fake.minX = a - 3; fake.maxX = a + 3; } else { fake.minZ = a - 3; fake.maxZ = a + 3; }
      faceQuad(B.get('signs'), lot.face, fake, along ? a - 3 : a - 3, along ? a + 3 : a + 3, CURB_H + 2.4, CURB_H + 3.9, -0.1, T.signUV(k), 0xffffff);
      const pk = frontPoint(lot, -3);
      pois.industrial.push({ x: pk.x, z: pk.z, face: lot.face });
    }
  }

  function buildPark(block) {
    lawn(block);
    const i = block.inner;
    const cx = (i.minX + i.maxX) / 2, cz = (i.minZ + i.maxZ) / 2;
    const path = B.get('plaza');
    path.rect(cx - 2, cx + 2, i.minZ, i.maxZ, CURB_H + 0.02, 0xc8a080, (x, z) => [x / 4, -z / 4]);
    path.rect(i.minX, i.maxX, cz - 2, cz + 2, CURB_H + 0.02, 0xc8a080, (x, z) => [x / 4, -z / 4]);
    let clear = 0;
    if (block.landmark === 'statue') LANDMARKS.statue(ctx, i.maxX - 10, i.maxZ - 10);
    else if (block.landmark) { pois.landmarks.push(LANDMARKS[block.landmark](ctx, block)); clear = block.landmark === 'library' || block.landmark === 'glassHouse' ? 36 : 12; }
    for (let k = 0; k < 70; k++) {
      const x = rand(i.minX + 3, i.maxX - 3), z = rand(i.minZ + 3, i.maxZ - 3);
      if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4) continue;
      if (clear && Math.abs(x - cx) < clear && Math.abs(z - cz) < clear * 0.6) continue;
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
    const ix = (wMinX + wMaxX) / 2 + 10, iz = (wMinZ + wMaxZ) / 2 - 5;
    put(B.get('stone'), new THREE.CylinderGeometry(1, 1.15, 1, 20), ix, 0, iz, 0x6a7a3a, 0, 9, 0.5, 7);
    for (let k = 0; k < 6; k++) trees.push({ x: ix + rand(-6, 6), z: iz + rand(-4, 4), s: rand(0.8, 1.2), t: 0, noCollide: true });
    for (let x = i.minX + 3; x < i.maxX - 3; x += 9) { trees.push({ x, z: i.minZ + 2.5, s: rand(0.9, 1.3), t: 0 }); trees.push({ x, z: i.maxZ - 2.5, s: rand(0.9, 1.3), t: 0 }); }
    pois.landmarks.push({ name: block.lakeName || 'Lake', x: (wMinX + wMaxX) / 2, z: i.maxZ + 2 });
  }

  // Rain trees and gulmohars line nearly every Bengaluru street.
  function nearRail(x, z) {
    return Math.abs(z - railZ) < 10 && x > RAILWAY.from - 5 && x < RAILWAY.to + 5;
  }
  function avenueTrees(block) {
    if (block.zone === 'lake') return;
    const o = block.outer;
    const cbd = Math.abs(block.cx) < 460 && Math.abs(block.cz) < 460;
    const spacing = block.zone === 'commercial' || block.zone === 'market' || block.zone === 'industrial' ? 30 : cbd ? 16 : 22;
    const inset = 1.0;
    const sides = [];
    if (block.j > 0) sides.push([o.minX, o.maxX, o.minZ + inset, 'x']);
    if (block.j < layout.zRoads.length) sides.push([o.minX, o.maxX, o.maxZ - inset, 'x']);
    if (block.i > 0) sides.push([o.minZ, o.maxZ, o.minX + inset, 'z']);
    if (block.i < layout.xRoads.length) sides.push([o.minZ, o.maxZ, o.maxX - inset, 'z']);
    for (const [a0, a1, c, ax] of sides) {
      for (let a = a0 + 6 + rand(0, 4); a < a1 - 6; a += spacing + rand(-3, 3)) {
        const t = rng() < 0.18 ? 1 : 0;
        const p = ax === 'x' ? { x: a, z: c } : { x: c, z: a };
        if (nearRail(p.x, p.z)) continue;
        trees.push({ ...p, s: rand(0.8, 1.3), t });
      }
    }
  }

  function streetLamps(block) {
    const o = block.outer;
    const sides = [];
    if (block.j > 0) sides.push([o.minX, o.maxX, o.minZ + 0.4, 'x']);
    if (block.i > 0) sides.push([o.minZ, o.maxZ, o.minX + 0.4, 'z']);
    for (const [a0, a1, c, ax] of sides) {
      for (let a = a0 + 12; a < a1 - 8; a += 34) {
        const p = ax === 'x' ? [a, c, 0] : [c, a, Math.PI / 2];
        if (nearRail(p[0], p[1])) continue;
        lamps.push(p);
      }
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
  colliders.add(WORLD_MIN - 10, WORLD_MIN, WORLD_MIN - 10, WORLD_MAX + 10, 300, 'bound');
  colliders.add(WORLD_MAX, WORLD_MAX + 10, WORLD_MIN - 10, WORLD_MAX + 10, 300, 'bound');
  colliders.add(WORLD_MIN - 10, WORLD_MAX + 10, WORLD_MIN - 10, WORLD_MIN, 300, 'bound');
  colliders.add(WORLD_MIN - 10, WORLD_MAX + 10, WORLD_MAX, WORLD_MAX + 10, 300, 'bound');

  // ---------- Bake merged meshes ----------
  B.buildAll(mats, group, {
    junction: { castShadow: false }, zebra: { castShadow: false }, grass: { castShadow: false }, plaza: { castShadow: false },
    signs: { castShadow: false }, glow: { castShadow: false },
  }, CHUNK);
  for (const m of group.children) if (m.name.startsWith('road_')) m.castShadow = false;

  const treeLod = buildInstancedTrees(group, trees, colliders);
  const lampPools = buildLamps(group, lamps, colliders);
  buildTanks(group, tanks);
  const textSignMats = buildTextSigns(group, signs);
  for (const m of textSignMats) nightMats.push([m, 0.05, 0.8]);

  const update = (dt, t, camera) => {
    mats.water.normalMap.offset.set(t * 0.01, t * 0.006);
    treeLod(camera);
  };
  // Drive night glow and rain wetness from the environment system.
  const setLighting = (night, wet) => {
    for (const [m, d, n] of nightMats) m.emissiveIntensity = d + (n - d) * night;
    lampPools.material.opacity = night * 0.85;
    lampPools.visible = night > 0.02;
    for (const m of roadMats) { m.roughness = 0.88 - wet * 0.72; m.color.setScalar(1 - wet * 0.45); }
    for (const m of wetMats) { m.roughness = 0.95 - wet * 0.55; m.color.setScalar(1 - wet * 0.3); }
  };
  sharedUniforms.uWet.value = 0;
  return { group, pois, update, setLighting, materials: mats, lampPositions: lamps, rail: infra.rail };
}

const BOXG = new THREE.BoxGeometry(1, 1, 1);
const CHIMNEY = new THREE.CylinderGeometry(1, 1, 1, 12);

// Trees are instanced per type and 320 m chunk, with a cheap canopy for distant chunks.
function buildInstancedTrees(group, trees, colliders) {
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.4, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 });
  const canopy = (wide, detail, n) => {
    const parts = [];
    const r = T.mulberry32(wide ? 3 : 9);
    for (let k = 0; k < n; k++) {
      const g = new THREE.IcosahedronGeometry(1, detail);
      g.deleteAttribute('uv');
      const a = (k / n) * Math.PI * 2;
      const rad = k === 0 ? 0 : (wide ? 2.2 : 1.4) * (0.6 + r() * 0.4);
      const s = (wide ? 2.2 : 1.7) * (0.7 + r() * 0.4) * (n < 5 ? 1.25 : 1);
      g.scale(s, s * (wide ? 0.6 : 0.8), s);
      g.translate(Math.cos(a) * rad, (r() - 0.5) * 0.8, Math.sin(a) * rad);
      parts.push(g);
    }
    const g = mergeVertices(mergeGeometries(parts));
    const pa = g.attributes.position;
    for (let k = 0; k < pa.count; k++) {
      const x = pa.getX(k), y = pa.getY(k), z = pa.getZ(k);
      const f = 1 + Math.sin(x * 3.1 + z * 2.3) * Math.cos(y * 2.7 + x) * 0.12;
      pa.setXYZ(k, x * f, y * f, z * f);
    }
    g.computeVertexNormals();
    return g;
  };
  const hi = [canopy(true, 1, 6), canopy(false, 1, 5), canopy(false, 1, 4)];
  const lo = [canopy(true, 0, 3), canopy(false, 0, 3), canopy(false, 0, 2)];
  const trunkH = [4.2, 3.2, 1.8];
  const colours = [
    [0x3f6a2a, 0x4a7a30, 0x557d33, 0x3a5f28, 0x5e8a3a],
    [0xd8452a, 0xe25a2a, 0xc93a22, 0xe86a30],
    [0x4c8a3a, 0x5a9a40, 0xa04aa0, 0x8a5ac8],
  ];
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const buckets = new Map();
  for (const t of trees) {
    const key = `${t.t}:${Math.floor(t.x / CHUNK)}:${Math.floor(t.z / CHUNK)}`;
    if (!buckets.has(key)) buckets.set(key, { type: t.t, list: [], cx: (Math.floor(t.x / CHUNK) + 0.5) * CHUNK, cz: (Math.floor(t.z / CHUNK) + 0.5) * CHUNK });
    buckets.get(key).list.push(t);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const r = T.mulberry32(77);
  const chunks = [];
  const trunkChunks = new Map();
  for (const { type, list, cx, cz } of buckets.values()) {
    const ih = new THREE.InstancedMesh(hi[type], mat, list.length);
    const il = new THREE.InstancedMesh(lo[type], mat, list.length);
    const tkey = `${cx},${cz}`;
    if (!trunkChunks.has(tkey)) trunkChunks.set(tkey, { list: [], cx, cz });
    list.forEach((t, k) => {
      const h = trunkH[type] * t.s;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      m.compose(p.set(t.x, h + 0.8 * t.s + (t.y || 0), t.z), q, s.set(t.s, t.s, t.s));
      ih.setMatrixAt(k, m); il.setMatrixAt(k, m);
      const pal = colours[type];
      c.setHex(pal[Math.floor(r() * pal.length)]).offsetHSL(0, 0, (r() - 0.5) * 0.06);
      ih.setColorAt(k, c); il.setColorAt(k, c);
      m.compose(p.set(t.x, 0.1 + (t.y || 0), t.z), q, s.set(t.s, h + 0.8, t.s));
      trunkChunks.get(tkey).list.push(m.clone());
      if (!t.noCollide && type !== 2) colliders.addCentered(t.x, t.z, 0.7 * t.s, 0.7 * t.s, 6, 'tree');
    });
    for (const im of [ih, il]) { im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true; group.add(im); }
    il.castShadow = false;
    chunks.push({ ih, il, cx, cz });
  }
  for (const { list } of trunkChunks.values()) {
    const tm = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    list.forEach((mm, k) => tm.setMatrixAt(k, mm));
    tm.castShadow = true;
    tm.computeBoundingSphere();
    group.add(tm);
  }
  // Swap canopy detail by distance from the camera.
  return (camera) => {
    if (!camera) return;
    for (const ch of chunks) {
      const near = Math.abs(ch.cx - camera.position.x) < CHUNK * 1.1 && Math.abs(ch.cz - camera.position.z) < CHUNK * 1.1;
      ch.ih.visible = near; ch.il.visible = !near;
    }
  };
}

function buildLamps(group, lamps, colliders) {
  const b = new BuilderSet();
  const pole = b.get('metal');
  const head = b.get('glow');
  const cyl = new THREE.CylinderGeometry(0.08, 0.12, 1, 6);
  for (const [x, z, rot] of lamps) {
    put(pole, cyl, x, 4.15, z, 0x6a6e72, 0, 1, 8, 1);
    const dx = rot ? -1.6 : 0, dz = rot ? 0 : -1.6;
    put(pole, cyl, x + dx / 2, 8.1, z + dz / 2, 0x6a6e72, 0, 0.7, 1.7, 0.7, rot ? 0 : Math.PI / 2, rot ? Math.PI / 2 : 0);
    head.box(x + dx, 7.85, z + dz, 0.6, 0.15, 0.6, 0xfff2cc);
    colliders.addCentered(x, z, 0.3, 0.3, 8, 'pole');
  }
  b.buildAll({ metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 }), glow: new THREE.MeshBasicMaterial({ vertexColors: true }) }, group, { glow: { castShadow: false } }, CHUNK);
  // Pools of sodium light on the road, only visible at night.
  const poolMat = new THREE.MeshBasicMaterial({ map: T.lightPoolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false });
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(geo, poolMat, lamps.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(14, 1, 14), p = new THREE.Vector3();
  lamps.forEach(([x, z, rot], k) => {
    const dx = rot ? -3.5 : 0, dz = rot ? 0 : -3.5;
    m.compose(p.set(x + dx, 0.2, z + dz), q, s);
    pools.setMatrixAt(k, m);
  });
  pools.computeBoundingSphere();
  pools.renderOrder = 1;
  pools.visible = false;
  group.add(pools);
  return pools;
}

function buildTanks(group, tanks) {
  const geo = new THREE.CylinderGeometry(0.6, 0.6, 1.3, 10);
  geo.translate(0, 0.65, 0);
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }), tanks.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  tanks.forEach(([x, y, z, sc], k) => { m.compose(p.set(x, y, z), q, s.set(sc, sc, sc)); inst.setMatrixAt(k, m); });
  inst.castShadow = true;
  inst.computeBoundingSphere();
  group.add(inst);
}

function buildTextSigns(group, signs) {
  const cache = new Map();
  for (const sg of signs) {
    let mat = cache.get(sg.key);
    if (!mat) {
      const t = T.textTexture(sg.text, { bg: sg.bg || '#2a2622', fg: sg.fg || '#f2e6c8', w: 1024, h: Math.max(64, Math.round(1024 * sg.h / sg.w)), ...(sg.font && { font: sg.font }), fonts: sg.fonts });
      mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.05 });
      cache.set(sg.key, mat);
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, sg.h), mat);
    mesh.position.set(sg.x, sg.y, sg.z);
    mesh.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[sg.face];
    group.add(mesh);
  }
  return [...cache.values()];
}
