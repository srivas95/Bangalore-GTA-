// Builds the static city on the real road network: ground, kerbed footpaths around polygon
// blocks, buildings on lots that face their road, trees, lamps, props and landmarks.
// Roads, underpasses, flyovers and the railway live in infrastructure.js / railway.js.
import * as THREE from 'three';
import { BuilderSet, sharedUniforms, makeFrame, frameToWorld } from './meshBuilder.js';
import * as T from './textures.js';
import { LANDMARKS, put } from './landmarks.js';
import { buildInfrastructure } from './infrastructure.js';
import { fillPoly, polyWalls, rectCorners, rectsOverlap } from './geom.js';
import { pointInPoly, polyArea, insetPolygon } from './roadnet.js';
import { HOTEL_SITES } from './mapdata.js';
import { metroRoutes } from './metro.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB_H, SHOP_SIGNS, FUEL_BRANDS } from '../config.js';
import { DETAIL, textScale } from './detail.js';
import { withAO } from './ao.js';

const rng = T.mulberry32(20240607);
const rand = (a = 0, b = 1) => a + (b - a) * rng();
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

const PASTELS = [0xf3e9d2, 0xe8d5b5, 0xf0c9a0, 0xd9e4dd, 0xf5e1e9, 0xe3d7f0, 0xfff6d5, 0xcfe0f5, 0xf2c6b4, 0xe6e6e6, 0xd4ecc8, 0xf7d9a8, 0xffffff];
const BRIGHTS = [0xf4a6a6, 0x9fd3c7, 0xf7dc6f, 0xaed6f1, 0xd7bde2, 0xf5cba7, 0xa9dfbf, 0xf0b27a];
const FLOOR_H = 3.2;
const SHOP_H = 4;
const CHUNK = 320;
const FACE_ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

export function buildCity(scene, layout, colliders, renderer) {
  T.resetRandom(7);
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);
  const B = new BuilderSet({ chunk: CHUNK, release: true });
  const trees = [];
  const lamps = [];
  const tanks = [];
  const signs = [];
  const pois = { food: [], homes: [], landmarks: [], parking: [], industrial: [], fuel: [] };
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
  // Facades get a normal map from their own painting, so window recesses and ledges catch the light.
  const facade = (style, map, extra = {}, bump = 0) => std({
    map: tex(map), vertexColors: true, emissiveMap: T.windowGlow(style), emissive: 0xffe2b0, emissiveIntensity: 0,
    ...(bump && { normalMap: tex(T.normalFromTexture(map, bump, DETAIL.min ? 256 : 512)), normalScale: new THREE.Vector2(1, 1) }), ...extra,
  });
  const mats = {
    ground: std({ map: tex(T.soilTexture()), roughness: 1 }),
    sidewalk: std({ map: tex(T.paverTexture()), roughness: 0.95, vertexColors: true }),
    grass: std({ map: tex(T.grassTexture()), roughness: 1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    plaza: std({ map: tex(T.concreteTexture()), roughness: 0.95, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    junction: std({ map: tex(T.asphaltTexture()), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    zebra: std({ map: tex(T.zebraTexture()), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    plaster: facade('plaster', T.plasterFacade(), { roughness: 0.9 }, 3),
    apartment: facade('apartment', T.apartmentFacade(), { roughness: 0.9 }, 3),
    heritage: facade('heritage', T.heritageFacade(), { roughness: 0.85 }, 3),
    glass: facade('glass', T.glassFacade(), { roughness: 0.12, metalness: 0.65, envMapIntensity: 1.2 }),
    shop: facade('shop', T.shopfrontTexture(), { roughness: 0.85 }, 2),
    roof: std({ map: tex(T.roofTexture()), roughness: 0.95, vertexColors: true }),
    stone: std({ roughness: 0.75, vertexColors: true, side: THREE.DoubleSide }),
    metal: std({ roughness: 0.4, metalness: 0.7, vertexColors: true }),
    sheet: std({ roughness: 0.45, metalness: 0.6, vertexColors: true, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    signs: std({ map: T.signAtlas(), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.08, vertexColors: true }),
    water: std({ color: 0x4f7f86, roughness: 0.06, metalness: 0.2, normalMap: T.waterNormal(), normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.3 }),
  };
  mats.signs.emissiveMap = mats.signs.map;
  for (const k of Object.keys(mats)) if (k !== 'glow' && k !== 'signs' && k !== 'water') withAO(mats[k]);
  mats.water.normalMap.repeat.set(12, 12);
  // Materials whose emissive brightens at night: [material, day, night].
  const nightMats = [
    [mats.plaster, 0, 0.9], [mats.apartment, 0, 0.9], [mats.heritage, 0, 0.7], [mats.glass, 0, 0.8], [mats.shop, 0, 0.55], [mats.signs, 0.08, 0.9],
  ];
  // Road-like surfaces that turn dark and reflective in the rain.
  const roadMats = new Set([mats.junction, mats.zebra]);
  const wetMats = [mats.sidewalk, mats.plaza];

  // ---------- Frames: buildings are authored in a lot's local frame ----------
  const W = (x, z) => frameToWorld(B.xf, x, z);
  // On a road's carriageway (traffic lanes, or its median if withMedian), within pad metres.
  const onCarriageway = (x, z, pad = 0, withMedian = true) => {
    const h = layout.edgeAt(x, z);
    if (!h) return false;
    const r = h.e.r;
    return h.d < r.width / 2 + pad && (withMedian || h.d > (r.median || 0) / 2 - 0.2);
  };
  const col = () => colliders.framed(B.xf);
  const sign = (sg) => {
    const [x, z] = W(sg.x, sg.z);
    signs.push({ ...sg, x, z, rotY: FACE_ROT[sg.face] + (B.xf ? B.xf.ang : 0) });
  };
  const treeAt = (x, z, s, t, extra) => { const [wx, wz] = W(x, z); trees.push({ x: wx, z: wz, s, t, ...extra }); };

  // ---------- Ground: soil everywhere, with holes where roads dip into underpasses ----------
  {
    const gb = new BuilderSet({ release: true });
    const Wd = layout.world, pad = 1600;
    const outer = [[Wd.minX - pad, Wd.minZ - pad], [Wd.maxX + pad, Wd.minZ - pad], [Wd.maxX + pad, Wd.maxZ + pad], [Wd.minX - pad, Wd.maxZ + pad]];
    const holes = layout.underpasses.map((u) => {
      const px = -u.uz, pz = u.ux, a = u.half, w = u.hw + 0.3;
      return [[u.cx - u.ux * a - px * w, u.cz - u.uz * a - pz * w], [u.cx + u.ux * a - px * w, u.cz + u.uz * a - pz * w],
        [u.cx + u.ux * a + px * w, u.cz + u.uz * a + pz * w], [u.cx - u.ux * a + px * w, u.cz - u.uz * a + pz * w]];
    });
    fillPoly(gb.get('ground'), outer, -0.05, 0xffffff, (x, z) => [x / 8, -z / 8], holes);
    gb.buildAll({ ground: mats.ground }, group, { ground: { castShadow: false } });
  }

  // ---------- Helpers shared with landmarks ----------
  const lawn = (block, color = 0xffffff) => fillPoly(B.get('grass'), block.innerPoly || rectPoly(block.inner), CURB_H + 0.01, color, (x, z) => [x / 6, -z / 6]);
  const plaza = (block, color = 0xffffff) => fillPoly(B.get('plaza'), block.innerPoly || rectPoly(block.inner), CURB_H + 0.01, color, (x, z) => [x / 5, -z / 5]);
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
  const anims = []; // per-frame updates registered by landmarks (the airport's planes)
  const ctx = { B, colliders, signs, sign, lawn, plaza, pois, trees: scatterTrees, layout, mats, tex, group, roadMats, anims };

  // ---------- Roads, underpasses, flyovers, railway ----------
  const infra = buildInfrastructure(ctx);
  const railPts = layout.rails.map((r) => r.pts);
  // Keep the railway corridor clear, and the ground under metro viaducts and stations.
  const metroSegs = [];
  for (const line of metroRoutes(layout)) {
    // Along the track itself (it bends off the road where a ramp needs land), between any two
    // stations that aren't both underground.
    for (let i = 0; i < line.stations.length - 1; i++) {
      const a = line.stations[i], b = line.stations[i + 1];
      if (a.underground && b.underground) continue;
      const pts = [];
      for (let s = a.s; s <= b.s + 1e-6; s += 10) { const p = line.path.at(Math.min(s, b.s)); pts.push([p.x, p.z]); }
      metroSegs.push({ pts, r: 5.5 });
    }
    // The covered ramp down to the tunnel is wider than the viaduct.
    for (const r of line.ramps) {
      const pts = [];
      for (let s = r.s1 - 20; s <= r.s1 + r.L + 20; s += 10) { const p = line.path.at(s); pts.push([p.x, p.z]); }
      metroSegs.push({ pts, r: 9 });
    }
    for (const st of line.stations) {
      if (st.underground) continue;
      // Same orientation as the station box (see metro.js).
      const a = line.path.at(st.s - 5), b = line.path.at(st.s + 5);
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      metroSegs.push({ pts: [[st.x - (dx / l) * 38, st.z - (dz / l) * 38], [st.x + (dx / l) * 38, st.z + (dz / l) * 38]], r: 13 });
    }
  }
  const nearRail = (x, z, d) => railPts.some((pts) => distToPolyline(x, z, pts) < d) || metroSegs.some((m) => distToPolyline(x, z, m.pts) < m.r + d - 9);

  // Park landmarks go to the largest blocks of each park.
  for (const p of new Set(layout.blocks.filter((b) => b.park).map((b) => b.park))) {
    const bl = layout.blocks.filter((b) => b.park === p).sort((a, b) => b.area - a.area);
    (p.landmarks || []).forEach((lm, k) => { if (bl[k]) bl[k].landmark = lm; });
  }

  // ---------- Blocks ----------
  const sw = B.get('sidewalk');
  for (const block of [...layout.blocks, ...layout.islands]) {
    fillPoly(sw, block.poly, CURB_H, 0xffffff, (x, z) => [x / 2.2, -z / 2.2]);
    polyWalls(sw, block.poly, 0, CURB_H, 0xd0ccc4, { tile: 2 });
    if (block.island) { if (block.innerPoly) lawn(block, 0xa8b878); continue; }
    avenueTrees(block);
    streetLamps(block);
    block.placed = [];
    buildZone(block);
  }

  function buildZone(block) {
    switch (block.zone) {
      case 'park': buildPark(block); break;
      case 'rural': buildRural(block); break;
      case 'lake': buildLake(block); break;
      case 'landmark': pois.landmarks.push(LANDMARKS[block.landmark](ctx, block)); reserveInner(block); break;
      case 'towers': buildTowers(block); break;
      case 'gov': buildGov(block); break;
      case 'residential': buildResidential(block); break;
      case 'industrial': buildIndustrial(block); break;
      case 'market': buildStreetBlock(block, { frontage: [5, 9], depth: [10, 15], floors: [2, 4], shop: 1, tints: BRIGHTS, styles: ['plaster', 'apartment'] }); break;
      case 'commercial': buildCommercial(block); break;
      default: buildStreetBlock(block, { frontage: [9, 18], depth: [12, 20], floors: block.edge ? [4, 9] : [2, 6], shop: 0.5, tints: PASTELS, styles: ['plaster', 'apartment', 'plaster'] });
    }
  }

  function reserveInner(block, pad = 0) {
    const i = block.inner;
    block.placed.push([[i.minX - pad, i.minZ - pad], [i.maxX + pad, i.minZ - pad], [i.maxX + pad, i.maxZ + pad], [i.minX - pad, i.maxZ + pad]]);
  }
  function reserveRect(block, cx, cz, w, d) {
    block.placed.push([[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]]);
  }

  // ---------- Lots: rectangles along each inner edge, in that edge's frame ----------
  // Local frame per edge: +x along the edge, +z out towards the road. A lot spans
  // x in [minX, maxX], z in [-depth, 0] and faces 's' (its maxZ side is the road frontage).
  function edgeFrames(block, P = block.innerPoly, ring = 0) {
    const n = P.length, sgn = Math.sign(polyArea(P));
    const out = [];
    for (let i = 0; i < n; i++) {
      const [x1, z1] = P[i], [x2, z2] = P[(i + 1) % n];
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
      if (len < 6) continue;
      const nx = (dz / len) * sgn, nz = (-dx / len) * sgn; // outward
      const f = makeFrame(x1, z1, Math.atan2(nx, nz));
      const a = dx * f.c - dz * f.s; // local x of the far end (±len)
      const w = ring ? 0 : block.edgeWidths[i];
      out.push({ f, a0: Math.min(0, a), a1: Math.max(0, a), len, road: w > 0, w, i });
    }
    return out;
  }

  function fits(block, f, minX, maxX, minZ, maxZ) {
    const P = block.innerPoly;
    const pts = [[minX, minZ], [maxX, minZ], [maxX, maxZ - 0.3], [minX, maxZ - 0.3], [(minX + maxX) / 2, minZ]].map(([x, z]) => frameToWorld(f, x, z));
    for (const [x, z] of pts) if (!pointInPoly(x, z, P)) return null;
    const corners = pts.slice(0, 4);
    for (const q of block.placed) if (rectsOverlap(corners, q)) return null;
    const cx = (pts[0][0] + pts[2][0]) / 2, cz = (pts[0][1] + pts[2][1]) / 2;
    const r = Math.hypot(maxX - minX, maxZ - minZ) / 2;
    if (nearRail(cx, cz, r + 9)) return null;
    return corners;
  }

  // Lots along the block's frontage, then rings further in (facing internal lanes) so that
  // big blocks don't end up hollow.
  function lotsAlong(block, frontage, depth, { gapChance = 0.2, rings = 3 } = {}) {
    const lots = [];
    if (!block.innerPoly) return lots;
    const frames = edgeFrames(block);
    for (let k = 1; k <= rings; k++) {
      const P = insetPolygon(block.innerPoly, block.innerPoly.map(() => k * (depth[1] + 7)));
      if (!P || Math.abs(polyArea(P)) < 900) break;
      frames.push(...edgeFrames(block, P, k));
    }
    for (const E of frames) {
      let a = E.a0 + 0.5;
      while (a < E.a1 - frontage[0]) {
        let fw = rand(...frontage);
        if (E.a1 - (a + fw) < frontage[0] * 0.8) fw = E.a1 - a - 0.5;
        if (fw < frontage[0] * 0.7) break;
        let d = rand(...depth), ok = null;
        for (let tries = 0; tries < 2 && !ok; tries++, d *= 0.65) ok = d >= 4 && fits(block, E.f, a, a + fw, -d, 0);
        if (!ok) { a += 2; continue; }
        block.placed.push(ok);
        lots.push({ f: E.f, minX: a, maxX: a + fw, minZ: -d, maxZ: 0, face: 's', road: E.road, roadW: E.w });
        a += fw + (rng() < gapChance ? rand(0.5, 2) : 0);
      }
    }
    return lots;
  }

  // A rectangle in the middle of the block, aligned with its longest edge.
  function centreLot(block, margin, maxSize = 80) {
    if (!block.innerPoly) return null;
    const E = edgeFrames(block).sort((p, q) => q.len - p.len)[0];
    if (!E) return null;
    let cx = 0, cz = 0;
    for (const [x, z] of block.innerPoly) { cx += x; cz += z; }
    cx /= block.innerPoly.length; cz /= block.innerPoly.length;
    if (!pointInPoly(cx, cz, block.innerPoly)) return null;
    const f = makeFrame(cx, cz, E.f.ang);
    let hw = Math.min(maxSize, (block.inner.maxX - block.inner.minX) / 2 - margin), hd = Math.min(maxSize, (block.inner.maxZ - block.inner.minZ) / 2 - margin);
    for (let k = 0; k < 6 && hw > 5 && hd > 5; k++, hw *= 0.8, hd *= 0.8) {
      const ok = fits(block, f, -hw, hw, -hd, hd + 0.3);
      if (ok) { block.placed.push(ok); return { f, minX: -hw, maxX: hw, minZ: -hd, maxZ: hd, face: 's' }; }
    }
    return null;
  }

  // ---------- Building helpers (local frame coordinates) ----------
  function building(lot, { style = 'plaster', floors = 3, shop = false, tint = 0xffffff, block }) {
    const w = lot.maxX - lot.minX, d = lot.maxZ - lot.minZ;
    if (w < 3 || d < 3) return CURB_H;
    const cx = (lot.minX + lot.maxX) / 2, cz = (lot.minZ + lot.maxZ) / 2;
    // A lot that strays onto a carriageway (where an arterial cuts across a block) stays empty.
    if ([[lot.minX, lot.minZ], [lot.maxX, lot.minZ], [lot.maxX, lot.maxZ], [lot.minX, lot.maxZ], [cx, cz]].some(([x, z]) => onCarriageway(...W(x, z), 0.5))) return CURB_H;
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
      // Roof parapets: about a third of the city's triangles, so phones skip them.
      if (!DETAIL.lite) {
        st.box(cx, top, lot.minZ + p / 2, w, ph, p, tint);
        st.box(cx, top, lot.maxZ - p / 2, w, ph, p, tint);
        st.box(lot.minX + p / 2, top, cz, p, ph, d - 2 * p, tint);
        st.box(lot.maxX - p / 2, top, cz, p, ph, d - 2 * p, tint);
      }
      // Black Sintex water tanks and the stair headroom: a Bengaluru skyline staple.
      const n = rng() < 0.8 ? 1 + Math.floor(rand(0, 2.5)) : 0;
      for (let k = 0; k < n; k++) { const [x, z] = W(rand(lot.minX + 1.2, lot.maxX - 1.2), rand(lot.minZ + 1.2, lot.maxZ - 1.2)); tanks.push([x, top, z, rand(0.8, 1.1)]); }
      if (rng() < 0.5 && w > 6 && d > 6) {
        // (Random numbers drawn either way so the city is the same at every detail level.)
        const hx = cx + rand(-w / 4, w / 4), hz = cz + rand(-d / 4, d / 4);
        if (!DETAIL.lite) B.get('plaster').box(hx, top, hz, 3, 2.6, 3, tint, { tileW: T.FACADE_TILE.w, tileH: T.FACADE_TILE.h, topBuilder: roofB, topTile: 10 });
      }
    }
    col().add(lot.minX, lot.maxX, lot.minZ, lot.maxZ, top + 1, 'building');
    return top;
  }

  // Quad on a lot face, a0..a1 along it (lots face 's' in their frame; landmarks may use any face).
  function faceQuad(builder, face, lot, a0, a1, y0, y1, off, uv, color) {
    switch (face) {
      case 'n': { const z = lot.minZ - off; builder.quad([a1, y0, z], [a0, y0, z], [a0, y1, z], [a1, y1, z], [0, 0, -1], uv, color); break; }
      case 's': { const z = lot.maxZ + off; builder.quad([a0, y0, z], [a1, y0, z], [a1, y1, z], [a0, y1, z], [0, 0, 1], uv, color); break; }
      case 'e': { const x = lot.maxX + off; builder.quad([x, y0, a1], [x, y0, a0], [x, y1, a0], [x, y1, a1], [1, 0, 0], uv, color); break; }
      case 'w': { const x = lot.minX - off; builder.quad([x, y0, a0], [x, y0, a1], [x, y1, a1], [x, y1, a0], [-1, 0, 0], uv, color); break; }
    }
  }

  // World point in front of a lot (dist > 0: towards the road).
  function frontPoint(lot, dist) {
    const [x, z] = W((lot.minX + lot.maxX) / 2, lot.maxZ + dist);
    return { x, z };
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
    const len = Math.min(lot.maxX - lot.minX - 0.8, 6);
    if (len < 2) return;
    const mid = (lot.minX + lot.maxX) / 2;
    const k = nextSign(block);
    faceQuad(B.get('signs'), 's', lot, mid - len / 2, mid + len / 2, y, y + len / 4, 0.32, T.signUV(k), 0xffffff);
    const s = SHOP_SIGNS[k % SHOP_SIGNS.length];
    if (s.food) {
      const p = frontPoint(lot, 2.2);
      pois.food.push({ name: s.en, x: p.x, z: p.z, district: block.district });
    }
  }

  function hotelFor(block) {
    return HOTEL_SITES.find((h) => !h.used && pointInPoly(h.at[0], h.at[1], block.poly));
  }

  // A hotel tower (or a mall) with its name lit up on all four sides of the crown.
  function brandedTower(lot, h, block) {
    h.used = true;
    const top = building(lot, { style: h.style || (h.mall ? 'plaster' : 'glass'), floors: h.floors, tint: h.tint, block });
    const w = lot.maxX - lot.minX, d = lot.maxZ - lot.minZ;
    const cx = (lot.minX + lot.maxX) / 2, cz = (lot.minZ + lot.maxZ) / 2;
    const sh = h.mall ? 3.6 : 4.2, y = top + (h.mall ? -sh / 2 - 0.6 : sh / 2 + 0.6);
    const key = `brand_${h.name}`;
    B.get('stone').box(cx, top, cz, w * 0.8, h.mall ? 0.4 : sh + 1.2, d * 0.8, 0x2a2a2a);
    const sw2 = Math.min(Math.min(w, d) * 0.78, sh * 6);
    for (const [face, x, z, depth] of [['n', cx, lot.minZ - 0.06, d], ['s', cx, lot.maxZ + 0.06, d], ['e', lot.maxX + 0.06, cz, w], ['w', lot.minX - 0.06, cz, w]]) {
      const inset = h.mall ? 0 : 0.1 * depth;
      const px = face === 'e' ? x - inset : face === 'w' ? x + inset : x, pz = face === 's' ? z - inset : face === 'n' ? z + inset : z;
      sign({ key, text: [h.name, h.sub], bg: h.bg, fg: h.fg, x: px, y, z: pz, w: sw2, h: sh, face, fonts: [`bold ${h.mall ? 72 : 96}px "Oswald", Arial, sans-serif`, `${h.mall ? 34 : 40}px "Oswald", Arial, sans-serif`] });
    }
    const [wx, wz] = W(cx, cz);
    pois.landmarks.push({ name: h.label, x: wx, z: wz });
  }

  // Fuel stations: a branded canopy over two pump islands, a kiosk at the back and a totem sign.
  function fuelStation(lot, block) {
    if (!lot.road) return false;
    const a0 = lot.minX, a1 = lot.maxX, D = lot.maxZ - lot.minZ;
    if (a1 - a0 < 14 || D < 12 || rng() > 0.12) return false;
    const [cx0, cz0] = W((a0 + a1) / 2, (lot.minZ + lot.maxZ) / 2);
    if (stations.some((s) => Math.hypot(s.x - cx0, s.z - cz0) < 800)) return false;
    stations.push({ x: cx0, z: cz0 });
    const brand = FUEL_BRANDS[[0, 1, 0, 2][fuelIdx++ % 4]];
    // a along the frontage, d inward from the road edge.
    const M = (a, d) => [a, lot.maxZ - d];
    const box = (b, a, d, la, ld, y, h, c, opts) => { const [x, z] = M(a, d); b.box(x, y, z, la, h, ld, c, opts); };
    const st = B.get('stone');
    const am = (a0 + a1) / 2;
    box(st, am, D / 2, a1 - a0, D, CURB_H, 0.03, 0xb4b0a8);
    const ca = Math.min(a1 - a0 - 3, 16), cd = Math.min(D * 0.55, 9), cdm = 1.5 + cd / 2;
    box(st, am, cdm, ca, cd, 5.0, 0.35, 0xf2f2f2);
    box(st, am, cdm, ca + 0.15, cd + 0.15, 5.3, 0.55, brand.canopy);
    box(st, am, cdm, ca + 0.2, cd + 0.2, 5.42, 0.12, brand.stripe, { top: false });
    for (const sa of [-1, 1]) for (const sd of [-1, 1]) {
      const a = am + sa * (ca / 2 - 1.2), d = cdm + sd * (cd / 2 - 1.2);
      box(st, a, d, 0.4, 0.4, CURB_H, 5.0, 0xe8e8e8);
      const [x, z] = M(a, d);
      col().addCentered(x, z, 0.5, 0.5, 5, 'pole');
    }
    for (const sa of [-1, 1]) {
      const a = am + sa * ca * 0.22;
      box(st, a, cdm, 1.1, 3.2, CURB_H, 0.2, 0xd8d4cc);
      for (const sd of [-0.8, 0.8]) {
        box(st, a, cdm + sd, 0.5, 0.7, CURB_H + 0.2, 1.7, brand.canopy);
        box(st, a, cdm + sd, 0.52, 0.72, CURB_H + 1.45, 0.25, 0xffffff, { top: false });
      }
      const [x, z] = M(a, cdm);
      col().addCentered(x, z, 1.1, 3.2, 1.9, 'pole');
    }
    const kd = Math.min(5, D - cd - 2);
    if (kd > 2.5) building({ minX: am - 4.5, maxX: am + 4.5, minZ: lot.maxZ - D, maxZ: lot.maxZ - D + kd, face: 's' }, { style: 'plaster', floors: 1, tint: 0xf6f6f6, block });
    const [fx, fz] = M(am, 1.5 - 0.1);
    sign({ key: `fuel_${brand.key}_fascia`, text: [brand.name], bg: brand.bg, fg: brand.fg, x: fx, y: 5.37, z: fz, w: 4, h: 0.5, face: 's', font: 'bold 92px "Oswald", Arial, sans-serif' });
    const ta = a1 - 1.2;
    box(st, ta, 0.8, 0.3, 0.3, CURB_H, 4.2, 0x888888);
    box(st, ta, 0.8, 1.7, 0.25, CURB_H + 3.2, 3.0, 0x222222);
    const [tx, tz] = M(ta, 0.8 - 0.14);
    sign({ key: `fuel_${brand.key}_totem`, text: [brand.name, brand.full, 'PETROL · DIESEL'], bg: brand.bg, fg: brand.fg, x: tx, y: CURB_H + 4.7, z: tz, w: 1.6, h: 2.8, face: 's', fonts: ['bold 300px "Oswald", Arial, sans-serif', 'bold 84px "Noto Sans Kannada", "Oswald", sans-serif', 'bold 84px "Oswald", Arial, sans-serif'] });
    const [px, pz] = M(ta, 0.8);
    col().addCentered(px, pz, 0.6, 0.6, 7, 'pole');
    const [qx, qz] = W(...M(am, -2));
    pois.fuel.push({ name: brand.name, x: qx, z: qz });
    return true;
  }

  // Runs `fn` for each lot with the builders in that lot's frame.
  function eachLot(lots, fn) {
    for (const lot of lots) { B.xf = lot.f; fn(lot); B.xf = null; }
  }

  function buildStreetBlock(block, o) {
    const lots = lotsAlong(block, o.frontage, o.depth);
    eachLot(lots, (lot) => {
      const shop = rng() < o.shop && lot.road;
      if (block.zone !== 'market' && fuelStation(lot, block)) return;
      building(lot, { style: pick(o.styles), floors: Math.round(rand(...o.floors)), shop, tint: pick(o.tints), block });
    });
    const hotel = hotelFor(block);
    const c = centreLot(block, o.depth[1] + 3, hotel ? 22 : 40);
    if (!c) return;
    eachLot([c], (lot) => {
      if (hotel) brandedTower(lot, hotel, block);
      else if (rng() < 0.6) building(lot, { style: pick(o.styles), floors: Math.round(rand(o.floors[0] + 1, o.floors[1] + 3)), tint: pick(o.tints), block });
      else for (let k = 0; k < 6; k++) treeAt(rand(lot.minX, lot.maxX), rand(lot.minZ, lot.maxZ), rand(0.8, 1.2), 0);
    });
  }

  function buildCommercial(block) {
    plaza(block, 0xe8e4dc);
    if (block.landmark === 'cathedral') {
      const { cx, cz } = mid(block);
      reserveRect(block, cx - 2, cz, 44, 24);
      pois.landmarks.push(LANDMARKS.cathedral(ctx, cx, cz));
    }
    buildStreetBlock(block, { frontage: [8, 15], depth: [12, 18], floors: block.pubs ? [2, 5] : [2, 6], shop: 0.9, tints: block.pubs ? BRIGHTS.concat(PASTELS) : PASTELS, styles: ['plaster', 'apartment', 'plaster'] });
  }

  function buildTowers(block) {
    plaza(block, 0xf0ece4);
    const { cx, cz } = mid(block);
    if (block.landmark === 'skyTower') { reserveRect(block, cx, cz, 34, 34); pois.landmarks.push(LANDMARKS.skyTower(ctx, cx, cz)); }
    if (block.landmark === 'wtc') { reserveRect(block, cx, cz, 64, 44); pois.landmarks.push(LANDMARKS.wtc(ctx, cx, cz)); }
    const hotel = hotelFor(block);
    const lots = lotsAlong(block, [22, 36], [18, 28], { gapChance: 0.6 });
    let first = true;
    eachLot(lots, (lot) => {
      if (hotel && first && lot.maxX - lot.minX > 20) { first = false; brandedTower(lot, hotel, block); return; }
      if (rng() < 0.15) { treeAt((lot.minX + lot.maxX) / 2, (lot.minZ + lot.maxZ) / 2, 1.2, 0); return; }
      building(lot, { style: rng() < 0.75 ? 'glass' : 'apartment', floors: Math.round(rand(8, 24)), shop: rng() < 0.3, tint: pick([0xd0e0ff, 0xe0f0e8, 0xf0e8d8, 0xc8d8f0]), block });
    });
    if (!block.landmark) {
      const c = centreLot(block, 30, 24);
      if (c) eachLot([c], (lot) => building(lot, { style: 'glass', floors: Math.round(rand(14, 30)), tint: pick([0xd0e0ff, 0xc8d8f0]), block }));
    }
  }

  function buildGov(block) {
    lawn(block);
    const lots = lotsAlong(block, [22, 40], [16, 22]);
    eachLot(lots, (lot) => {
      if (rng() < 0.25) { treeAt((lot.minX + lot.maxX) / 2, (lot.minZ + lot.maxZ) / 2, 1.3, 0); return; }
      building({ ...lot, maxZ: lot.maxZ - 4 }, { style: rng() < 0.7 ? 'heritage' : 'plaster', floors: Math.round(rand(2, 4)), tint: pick([0xf2ead8, 0xe8dcc8, 0xf5f0e6, 0xd9b8a0]), block });
    });
    scatterInBlock(block, 14, 0, 25);
  }

  function compoundWall(lot, colour, gateFrac = 0.7, gateHalf = 1.5, h = 1.3) {
    const st = B.get('stone');
    const wz = lot.maxZ - 0.15;
    const a0 = lot.minX, a1 = lot.maxX;
    const gate = a0 + (a1 - a0) * gateFrac;
    for (const [s0, s1] of [[a0, gate - gateHalf], [gate + gateHalf, a1]]) {
      if (s1 - s0 < 0.5) continue;
      const m = (s0 + s1) / 2, len = s1 - s0;
      st.box(m, CURB_H, wz, len, h, 0.3, colour);
      col().addCentered(m, wz, len, 0.3, h + 0.2, 'wall');
    }
    return gate;
  }

  function buildResidential(block) {
    lawn(block, 0xb8b090);
    const lots = lotsAlong(block, [10, 15], [12, 16]);
    eachLot(lots, (lot) => {
      compoundWall(lot, pick([0xe8e0d0, 0xd8c8b0, 0xf0e8e0]));
      building({ ...lot, maxZ: lot.maxZ - 3 }, { style: rng() < 0.6 ? 'plaster' : 'apartment', floors: Math.round(rand(1, 3.4)), tint: pick(PASTELS), block });
      if (rng() < 0.5) treeAt((lot.minX + lot.maxX) / 2 + rand(-2, 2), lot.maxZ - 1.5, rand(0.5, 0.8), rng() < 0.3 ? 1 : 2);
      const door = frontPoint(lot, 2.2);
      pois.homes.push({ name: `#${Math.floor(rand(1, 999))}, ${block.district}`, x: door.x, z: door.z, district: block.district });
    });
    const c = centreLot(block, 20, 30);
    if (c) eachLot([c], (lot) => {
      if (rng() < 0.5) building(lot, { style: 'apartment', floors: Math.round(rand(3, 6)), tint: pick(PASTELS), block });
      else for (let k = 0; k < 5; k++) treeAt(rand(lot.minX, lot.maxX), rand(lot.minZ, lot.maxZ), rand(0.8, 1.3), 0);
    });
  }

  // Peenya: factory sheds with sawtooth roofs, chimneys, compound walls and painted name boards.
  function buildIndustrial(block) {
    plaza(block, 0xb8b0a0);
    const lots = lotsAlong(block, [26, 44], [26, 40]);
    const metal = B.get('sheet'), st = B.get('stone');
    eachLot(lots, (lot) => {
      const gateA = compoundWall(lot, pick([0xc8c0b0, 0xa8b0b8, 0xd8d0c0]), 0.5, 3.5, 2.2);
      const l = { ...lot, maxZ: lot.maxZ - 6 };
      const w = l.maxX - l.minX, d = l.maxZ - l.minZ;
      if (w < 8 || d < 8) return;
      const cx = (l.minX + l.maxX) / 2, cz = (l.minZ + l.maxZ) / 2;
      const H = rand(7, 10);
      const tint = pick([0xd8dce0, 0xc8d0d8, 0xe0d8c8, 0xb8c8d8]);
      B.get('plaster').box(cx, CURB_H, cz, w, H, d, tint, { tileW: 14, tileH: 12.8, top: false });
      st.box(cx, CURB_H + 2.2, cz, w + 0.04, 0.6, d + 0.04, pick([0x2a5a9a, 0x9a2a2a, 0x2a7a4a]), { top: false });
      const teeth = Math.max(2, Math.round(d / 6)), td = d / teeth;
      for (let k = 0; k < teeth; k++) {
        const z0 = l.minZ + k * td;
        put(metal, BOXG, cx, CURB_H + H + 1.2, z0 + td / 2, 0x8a9098, 0, w, 0.08, Math.hypot(td, 2.4), Math.atan2(2.4, td));
        B.get('glass').box(cx, CURB_H + H, z0 + td - 0.05, w, 2.4, 0.1, 0x8aa0b0, { top: false, tileW: 8, tileH: 12.8 });
      }
      col().add(l.minX, l.maxX, l.minZ, l.maxZ, CURB_H + H + 2.4, 'building');
      if (rng() < 0.3) {
        const chx = l.minX + 3, chz = l.minZ + 3;
        for (let k = 0; k < 6; k++) put(st, CHIMNEY, chx, CURB_H + k * 4 + 2, chz, k % 2 ? 0xd02020 : 0xf0f0f0, 0, 1.0 - k * 0.06, 4, 1.0 - k * 0.06);
        col().addCentered(chx, chz, 2.2, 2.2, 25, 'pole');
      }
      const k = nextSign(block);
      faceQuad(B.get('signs'), 's', lot, gateA - 3, gateA + 3, CURB_H + 2.4, CURB_H + 3.9, -0.1, T.signUV(k), 0xffffff);
      const pk = frontPoint(lot, -3);
      pois.industrial.push({ x: pk.x, z: pk.z, heading: Math.atan2(lot.f.c, -lot.f.s) });
    });
  }

  function mid(block) {
    const i = block.inner;
    return { cx: (i.minX + i.maxX) / 2, cz: (i.minZ + i.maxZ) / 2 };
  }

  // Trees scattered inside the block, away from reserved footprints.
  function scatterInBlock(block, n, pinkChance = 0.15, margin = 3) {
    const P = block.innerPoly, i = block.inner, bb = block.bbox;
    let placed = 0;
    for (let k = 0; k < n * 4 && placed < n; k++) {
      const x = rand(bb.minX + margin, bb.maxX - margin), z = rand(bb.minZ + margin, bb.maxZ - margin);
      if (!pointInPoly(x, z, P)) continue;
      if (block.placed.some((q) => pointInPoly(x, z, q))) continue;
      if (nearRail(x, z, 9)) continue;
      void i;
      trees.push({ x, z, s: rand(0.9, 1.6), t: rng() < pinkChance ? 1 : 0 });
      placed++;
    }
  }

  function buildPark(block) {
    lawn(block);
    const { cx, cz } = mid(block);
    // Footpaths from the middle out to each side.
    const path = B.get('plaza');
    if (block.innerPoly && pointInPoly(cx, cz, block.innerPoly)) {
      for (const E of edgeFrames(block)) {
        const [ex, ez] = frameToWorld(E.f, (E.a0 + E.a1) / 2, 0);
        const dx = ex - cx, dz = ez - cz, l = Math.hypot(dx, dz);
        if (l < 10) continue;
        const f = makeFrame((cx + ex) / 2, (cz + ez) / 2, Math.atan2(dx, dz));
        B.xf = f;
        path.rect(-2, 2, -l / 2, l / 2, CURB_H + 0.02, 0xc8a080, (x, z) => [x / 4, -z / 4]);
        B.xf = null;
        block.placed.push(rectCorners((cx + ex) / 2, (cz + ez) / 2, dz / l, -dx / l, 3, l / 2));
      }
    }
    if (block.landmark === 'statue') { LANDMARKS.statue(ctx, cx + 14, cz + 14); reserveRect(block, cx + 14, cz + 14, 10, 10); }
    else if (block.landmark) { pois.landmarks.push(LANDMARKS[block.landmark](ctx, block)); reserveRect(block, cx, cz, 76, 40); }
    scatterInBlock(block, Math.min(160, Math.round(block.area / 220)));
    const [px, pz] = [block.poly[0][0], block.poly[0][1]];
    pois.parking.push({ x: px, z: pz });
    if (block.park && !block.park.labelled) { block.park.labelled = true; pois.landmarks.push({ name: block.park.name, x: cx, z: cz }); }
  }

  function buildLake(block) {
    const water = block.innerPoly && insetPolygon(block.innerPoly, block.innerPoly.map(() => 9));
    if (!water) { buildPark(block); return; }
    fillPoly(B.get('grass'), block.innerPoly, CURB_H + 0.01, 0xffffff, (x, z) => [x / 6, -z / 6], [water]);
    polyWalls(B.get('stone'), water, -0.6, CURB_H + 0.02, 0x8a8478, { inward: true, tile: 2 });
    fillPoly(B.get('stone'), water, -0.6, 0x5a5448);
    const wb = new BuilderSet({ release: true });
    fillPoly(wb.get('water'), water, 0.05, 0xffffff, (x, z) => [x / 40, -z / 40]);
    wb.buildAll({ water: mats.water }, group, { water: { castShadow: false } });
    for (let i = 0; i < water.length; i++) {
      const [ax, az] = water[i], [bx, bz] = water[(i + 1) % water.length];
      colliders.addSegment(ax, az, bx, bz, 1.0, 2, 'water');
    }
    // Trees around the bund.
    const P = block.innerPoly;
    for (let i = 0; i < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], l = Math.hypot(bx - ax, bz - az);
      for (let s = 6; s < l - 4; s += 10) {
        const t = s / l, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const [wx, wz] = towards(x, z, block.cx, block.cz, 3.5);
        trees.push({ x: wx, z: wz, s: rand(0.9, 1.3), t: 0 });
      }
    }
    pois.landmarks.push({ name: block.lakeName || 'Lake', x: block.cx, z: block.cz });
  }

  function towards(x, z, cx, cz, d) {
    const dx = cx - x, dz = cz - z, l = Math.hypot(dx, dz) || 1;
    return [x + (dx / l) * d, z + (dz / l) * d];
  }

  // ---------- Street trees and lamps along the kerbs ----------
  function kerbRuns(block, inset, fn) {
    const P = block.poly, sgn = Math.sign(polyArea(P));
    for (let i = 0; i < P.length; i++) {
      const w = block.edgeWidths[i];
      if (!w) continue;
      const [x1, z1] = P[i], [x2, z2] = P[(i + 1) % P.length];
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
      if (len < 16) continue;
      const nx = (dz / len) * sgn, nz = (-dx / len) * sgn; // outward, towards the road
      fn({ x1, z1, ux: dx / len, uz: dz / len, len, nx, nz, w, at: (s) => [x1 + (dx / len) * s - nx * inset, z1 + (dz / len) * s - nz * inset] });
    }
  }

  // Countryside: a patchwork of fields, the odd farmhouse, coconut and eucalyptus trees.
  function buildRural(block) {
    lawn(block, 0xb0b070);
    const FIELDS = [0x8aa040, 0x9ab048, 0xb8a860, 0x7a9a3a, 0xa89858, 0xc0b878, 0x6a8a30];
    const lots = lotsAlong(block, [40, 90], [35, 70], { gapChance: 0.5, rings: 2 });
    const g = B.get('grass');
    eachLot(lots, (lot) => {
      g.rect(lot.minX + 0.5, lot.maxX - 0.5, lot.minZ + 0.5, lot.maxZ - 0.5, CURB_H + 0.02, pick(FIELDS), (x, z) => [x / 5, -z / 5]);
      if (lot.road && rng() < 0.18) {
        const w = Math.min(10, lot.maxX - lot.minX - 4);
        building({ minX: (lot.minX + lot.maxX) / 2 - w / 2, maxX: (lot.minX + lot.maxX) / 2 + w / 2, minZ: lot.maxZ - 12, maxZ: lot.maxZ - 3, face: 's' }, { style: 'plaster', floors: rng() < 0.7 ? 1 : 2, tint: pick(PASTELS), block });
        for (let k = 0; k < 4; k++) treeAt(lot.minX + rand(1, 6), lot.maxZ - rand(2, 14), rand(0.8, 1.2), 0);
      } else if (rng() < 0.35) {
        // A line of trees along the field boundary.
        for (let x = lot.minX + 3; x < lot.maxX - 2; x += rand(6, 10)) treeAt(x, lot.minZ + 1.5, rand(0.8, 1.3), 0);
      }
    });
    scatterInBlock(block, Math.min(40, Math.round(block.area / 6000)), 0.05, 8);
  }

  function avenueTrees(block) {
    if (block.zone === 'lake' || block.zone === 'rural') return;
    const cbd = Math.abs(block.cx - 300) < 500 && Math.abs(block.cz) < 450;
    const base = block.zone === 'commercial' || block.zone === 'market' || block.zone === 'industrial' ? 30 : cbd ? 16 : 22;
    kerbRuns(block, 1.0, (k) => {
      const spacing = k.w > 14 ? base : base * 1.5; // side streets are sparser
      for (let s = 7 + rand(0, 4); s < k.len - 7; s += spacing + rand(-3, 3)) {
        const [x, z] = k.at(s);
        if (nearRail(x, z, 10)) continue;
        trees.push({ x, z, s: rand(0.8, 1.3), t: rng() < 0.18 ? 1 : 0 });
      }
    });
  }

  function streetLamps(block) {
    if (block.zone === 'rural') return;
    kerbRuns(block, 0.4, (k) => {
      const spacing = k.w > 14 ? 36 : 58;
      for (let s = 12 + rand(0, 10); s < k.len - 8; s += spacing) {
        const [x, z] = k.at(s);
        if (nearRail(x, z, 10)) continue;
        lamps.push([x, z, k.nx, k.nz]);
      }
    });
  }

  // ---------- Bake merged meshes ----------
  B.xf = null;
  B.buildAll(mats, group, {
    junction: { castShadow: false }, zebra: { castShadow: false }, grass: { castShadow: false }, plaza: { castShadow: false },
    signs: { castShadow: false }, glow: { castShadow: false }, sidewalk: { castShadow: false },
  });
  for (const m of group.children) if (m.name.startsWith('road_')) m.castShadow = false;

  // Trees never stand in a traffic lane (avenue trees on a curving road could drift into one).
  const treeLod = buildInstancedTrees(group, trees.filter((t) => !onCarriageway(t.x, t.z, 0.6, false)), colliders);
  const lampHeads = [];
  const lampPools = buildLamps(group, lamps, colliders, lampHeads);
  const tankLod = buildTanks(group, DETAIL.min ? [] : tanks);
  const textSignMats = buildTextSigns(group, signs);
  for (const m of textSignMats) nightMats.push([m, 0.05, 0.8]);

  // Nothing beyond the fog is drawn: cull chunked meshes by distance every few frames.
  const cullable = group.children.filter((m) => m.geometry && m.name !== 'ground' && !m.isInstancedMesh);
  for (const m of cullable) { m.geometry.computeBoundingSphere(); m.userData.c = m.geometry.boundingSphere.center.clone(); m.userData.r = m.geometry.boundingSphere.radius; }
  let cullT = 0;
  const update = (dt, t, camera) => {
    for (const a of anims) a(dt, t, camera);
    mats.water.normalMap.offset.set(t * 0.01, t * 0.006);
    treeLod(camera);
    if (camera) tankLod(camera);
    if (camera && (cullT -= dt) <= 0) {
      cullT = 0.25;
      const px = camera.position.x, pz = camera.position.z, far = (camera.far > 900 ? 900 : camera.far);
      for (const m of cullable) m.visible = Math.hypot(m.userData.c.x - px, m.userData.c.z - pz) - m.userData.r < far;
    }
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
  return { group, pois, update, setLighting, materials: mats, lampPositions: lamps, rail: infra.rail, trees, lampHeads };
}

function rectPoly(r) {
  return [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]];
}

function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    if (Math.min(ax, bx) - 40 > x || Math.max(ax, bx) + 40 < x || Math.min(az, bz) - 40 > z || Math.max(az, bz) + 40 < z) continue;
    const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / l2));
    best = Math.min(best, Math.hypot(ax + abx * t - x, az + abz * t - z));
  }
  return best;
}

const BOXG = new THREE.BoxGeometry(1, 1, 1);
const CHIMNEY = new THREE.CylinderGeometry(1, 1, 1, 12);

// Trees are instanced per type and 320 m chunk, with a cheap canopy for distant chunks.
function buildInstancedTrees(group, trees, colliders) {
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.4, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = withAO(new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }));
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
  const hi = DETAIL.lite ? [canopy(true, 1, 4), canopy(false, 1, 3), canopy(false, 0, 3)] : [canopy(true, 1, 6), canopy(false, 1, 5), canopy(false, 1, 4)];
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
  const trunkMeshes = [];
  for (const { list, cx, cz } of trunkChunks.values()) {
    const tm = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    list.forEach((mm, k) => tm.setMatrixAt(k, mm));
    tm.castShadow = true;
    tm.computeBoundingSphere();
    group.add(tm);
    trunkMeshes.push({ mesh: tm, cx, cz });
  }
  // Swap canopy detail by distance from the camera; nothing past the fog.
  const nearRange = DETAIL.lite ? 40 : 140;
  return (camera) => {
    if (!camera) return;
    for (const ch of chunks) {
      const dx = Math.abs(ch.cx - camera.position.x), dz = Math.abs(ch.cz - camera.position.z);
      // Detailed canopies only in chunks within nearRange of the camera (they're most of the
      // triangles drawn); simple ones out to the fog.
      const near = Math.hypot(Math.max(0, dx - CHUNK / 2), Math.max(0, dz - CHUNK / 2)) < nearRange;
      const far = Math.hypot(dx, dz) > 900 + CHUNK * 0.7;
      ch.ih.visible = near; ch.il.visible = !near && !far;
    }
    for (const tc of trunkMeshes) tc.mesh.visible = Math.hypot(tc.cx - camera.position.x, tc.cz - camera.position.z) < 900 + CHUNK * 0.7;
  };
}

// Lamps: [x, z, armDirX, armDirZ] with the arm reaching out over the road.
function buildLamps(group, lamps, colliders, heads) {
  const b = new BuilderSet({ chunk: CHUNK, release: true });
  const pole = b.get('metal');
  const head = b.get('glow');
  // Open-ended: the caps are never seen.
  const cyl = new THREE.CylinderGeometry(0.08, 0.12, 1, DETAIL.lite ? 4 : 6, 1, true);
  if (DETAIL.min) lamps = lamps.filter((_, k) => k % 2 === 0);
  for (const [x, z, ax, az] of lamps) {
    put(pole, cyl, x, 4.15, z, 0x6a6e72, 0, 1, 8, 1);
    b.xf = makeFrame(x, z, Math.atan2(ax, az));
    put(pole, cyl, 0, 8.1, 0.8, 0x6a6e72, 0, 0.7, 1.7, 0.7, Math.PI / 2, 0);
    head.box(0, 7.85, 1.6, 0.6, 0.15, 0.6, 0xfff2cc);
    const [hx, hz] = frameToWorld(b.xf, 0, 1.6);
    heads.push([hx, 7.75, hz]);
    b.xf = null;
    colliders.addCentered(x, z, 0.3, 0.3, 8, 'pole');
  }
  b.buildAll({ metal: withAO(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 })), glow: new THREE.MeshBasicMaterial({ vertexColors: true }) }, group, { glow: { castShadow: false } });
  // Pools of sodium light on the road, only visible at night.
  const poolMat = new THREE.MeshBasicMaterial({ map: T.lightPoolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false });
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(geo, poolMat, Math.max(1, lamps.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(14, 1, 14), p = new THREE.Vector3();
  lamps.forEach(([x, z, ax, az], k) => {
    m.compose(p.set(x + ax * 3.5, 0.2, z + az * 3.5), q, s);
    pools.setMatrixAt(k, m);
  });
  pools.count = lamps.length;
  pools.computeBoundingSphere();
  pools.renderOrder = 1;
  pools.visible = false;
  group.add(pools);
  return pools;
}

// Black Sintex tanks on the roofs: tens of thousands of them, so instanced per chunk and only
// drawn within tankRange of the camera.
function buildTanks(group, tanks) {
  if (!tanks.length) return () => {};
  const geo = new THREE.CylinderGeometry(0.6, 0.6, 1.3, DETAIL.lite ? 6 : 8);
  geo.translate(0, 0.65, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  const buckets = new Map();
  for (const t of tanks) {
    const key = `${Math.floor(t[0] / CHUNK)},${Math.floor(t[2] / CHUNK)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const chunks = [];
  for (const [key, list] of buckets) {
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z, sc], k) => { m.compose(p.set(x, y, z), q, s.set(sc, sc, sc)); inst.setMatrixAt(k, m); });
    inst.castShadow = true;
    inst.computeBoundingSphere();
    group.add(inst);
    const [cx, cz] = key.split(',').map((v) => (+v + 0.5) * CHUNK);
    chunks.push({ inst, cx, cz });
  }
  const range = DETAIL.lite ? 260 : 450;
  return (camera) => {
    for (const c of chunks) {
      const dx = Math.max(0, Math.abs(c.cx - camera.position.x) - CHUNK / 2), dz = Math.max(0, Math.abs(c.cz - camera.position.z) - CHUNK / 2);
      c.inst.visible = Math.hypot(dx, dz) < range;
    }
  };
}

function buildTextSigns(group, signs) {
  const cache = new Map();
  for (const sg of signs) {
    let mat = cache.get(sg.key);
    if (!mat) {
      const t = T.textTexture(sg.text, { bg: sg.bg || '#2a2622', fg: sg.fg || '#f2e6c8', w: 1024, h: Math.max(64, Math.round(1024 * sg.h / sg.w)), scale: textScale(sg.w), ...(sg.font && { font: sg.font }), fonts: sg.fonts });
      mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.05 });
      cache.set(sg.key, mat);
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, sg.h), mat);
    mesh.position.set(sg.x, sg.y, sg.z);
    mesh.rotation.y = sg.rotY ?? FACE_ROT[sg.face];
    group.add(mesh);
  }
  return [...cache.values()];
}
