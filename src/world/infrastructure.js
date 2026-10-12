// Roads on the real network: carriageway strips per edge (mitred at gentle bends), junction
// pads with zebra crossings, raised medians, underpasses (with floodable water), the Silk Board
// and Hebbal flyovers, and dead-end barricades at the edge of the map.
import * as THREE from 'three';
import { makeFrame } from './meshBuilder.js';
import { put } from './landmarks.js';
import { fanPoly, quadPts } from './geom.js';
import * as T from './textures.js';
import { CURB_H } from '../config.js';
import { buildRailway } from './railway.js';
import { DETAIL } from './detail.js';

const SHRUB = new THREE.IcosahedronGeometry(1, 0);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const ROAD_TILE = 12;

export const floodMaterial = new THREE.MeshStandardMaterial({
  color: 0x6b5a3e, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.86,
  normalMap: T.waterNormal(), normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.2,
});
floodMaterial.normalMap.repeat.set(6, 6);

export function roadMaterialKey(lanes, median) {
  return `road_${lanes}_${median || 0}`;
}

// Draws a road strip running along local z (x0..x1 across), following yFn(z).
function stripZ(b, x0, x1, a0, a1, yFn, step = 2.5) {
  for (let a = a0; a < a1 - 1e-6; a += step) {
    const za = a, zb = Math.min(a + step, a1);
    const ya = yFn(za), yb = yFn(zb);
    const slope = (yb - ya) / (zb - za);
    const n = new THREE.Vector3(0, 1, -slope).normalize().toArray();
    b.quad4([x0, yb, zb], [x1, yb, zb], [x1, ya, za], [x0, ya, za], n,
      [0, -zb / ROAD_TILE], [1, -zb / ROAD_TILE], [1, -za / ROAD_TILE], [0, -za / ROAD_TILE]);
  }
}

export function buildInfrastructure(ctx) {
  const { B, layout, colliders, mats, tex, group } = ctx;
  const ensureRoadMat = (lanes, median, width) => {
    const key = roadMaterialKey(lanes, median);
    if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial({ map: tex(T.roadTexture({ lanes, median, width })), roughness: 0.88 });
    ctx.roadMats.add(mats[key]);
    return key;
  };
  const concrete = B.get('stone');
  // Work in a frame aligned with direction (ux, uz) as local +z.
  const frameAlong = (cx, cz, ux, uz) => makeFrame(cx, cz, Math.atan2(ux, uz));

  // ---------- Carriageways ----------
  for (const e of layout.undirected) {
    const r = e.r, w = r.width / 2;
    const b = B.get(ensureRoadMat(r.lanes, r.median, r.width));
    const a = e.a, len = e.len;
    const ux = (e.b.x - a.x) / len, uz = (e.b.z - a.z) / len, px = -uz, pz = ux;
    const ta = a.cut.get(e.id) || 0, tb = len - (e.b.cut.get(e.id) || 0);
    if (tb - ta < 0.5) continue;
    const Ea = layout.edgeEnd(a, e), Eb = layout.edgeEnd(e.b, e);
    const ups = (e.underpasses || []).slice().sort((p, q) => p.at - q.at);
    // Stations along the edge: [t, height]. Underpasses get fine steps for the dip.
    const st = [];
    const push = (t) => { if (!st.length || t - st[st.length - 1] > 0.05) st.push(t); };
    push(ta);
    let t = ta;
    for (const u of ups) {
      for (let s = t + 60; s < u.at - u.half - 5; s += 60) push(s);
      for (let s = u.at - u.half; s <= u.at + u.half + 1e-6; s += 2.5) push(s);
      t = u.at + u.half;
    }
    for (let s = t + 60; s < tb - 5; s += 60) push(s);
    push(tb);
    if (st.length < 2) continue;
    const hAt = (s) => {
      for (const u of ups) if (Math.abs(s - u.at) < u.half) return layout.dip(u, s - u.at) + 0.01;
      return 0.01;
    };
    const pt = (s, side) => [a.x + ux * s + px * w * side, a.z + uz * s + pz * w * side];
    const uv = (x, z) => {
      const dx = x - a.x, dz = z - a.z;
      return [((dx * px + dz * pz) + w) / (2 * w), -(dx * ux + dz * uz) / ROAD_TILE];
    };
    for (let k = 0; k < st.length - 1; k++) {
      const s0 = st[k], s1 = st[k + 1];
      const L0 = k === 0 ? Ea[0] : pt(s0, 1), R0 = k === 0 ? Ea[1] : pt(s0, -1);
      const L1 = k === st.length - 2 ? Eb[1] : pt(s1, 1), R1 = k === st.length - 2 ? Eb[0] : pt(s1, -1);
      const y0 = hAt(s0), y1 = hAt(s1);
      const P = [[R0[0], y0, R0[1]], [R1[0], y1, R1[1]], [L1[0], y1, L1[1]], [L0[0], y0, L0[1]]];
      quadPts(b, P[0], P[1], P[2], P[3], P.map((q) => uv(q[0], q[2])), 0xffffff);
    }
  }

  // ---------- Junction pads and zebra crossings ----------
  const jb = B.get('junction'), zb = B.get('zebra');
  for (const n of layout.nodes) {
    if (n.through) continue;
    const poly = [];
    n.adj.forEach((h, i) => {
      const [L, R] = layout.edgeEnd(n, h.e);
      poly.push(R, L);
      const c = n.corners[i];
      if (c && n.adj.length > 1) poly.push([c.x, c.z]);
    });
    fanPoly(jb, n.x, n.z, poly, 0.02, 0xffffff, (x, z) => [x / 8, -z / 8]);
    if (n.adj.length < 3) continue;
    for (const h of n.adj) {
      const cut = n.cut.get(h.e.id) || 0;
      if (h.e.len < cut + 12) continue;
      const px = -h.u.z, pz = h.u.x;
      const P = (al, lat) => [n.x + h.u.x * al + px * lat, 0.025, n.z + h.u.z * al + pz * lat];
      const q = [P(cut + 0.6, -h.w), P(cut + 3.6, -h.w), P(cut + 3.6, h.w), P(cut + 0.6, h.w)];
      const zuv = [[-h.w / 8, 0.6 / 8], [-h.w / 8, 3.6 / 8], [h.w / 8, 3.6 / 8], [h.w / 8, 0.6 / 8]];
      quadPts(zb, q[0], q[1], q[2], q[3], zuv, 0xffffff);
    }
  }

  // ---------- Raised medians, gaps at junctions (and none under flyovers or in underpasses) ----------
  const sw = B.get('sidewalk'), grass = B.get('grass'), stone = B.get('stone');
  for (const e of layout.undirected) {
    const r = e.r;
    if (!r.median) continue;
    const a = e.a, len = e.len;
    const ux = (e.b.x - a.x) / len, uz = (e.b.z - a.z) / len;
    const gapA = a.through ? 0 : (a.cut.get(e.id) || 0) + 4, gapB = e.b.through ? 0 : (e.b.cut.get(e.id) || 0) + 4;
    const cuts = [];
    for (const u of e.underpasses || []) cuts.push([u.at - u.half - 2, u.at + u.half + 2]);
    for (const f of layout.flyovers) {
      if (f.node === a) cuts.push([-1, f.half]);
      if (f.node === e.b) cuts.push([len - f.half, len + 1]);
    }
    cuts.sort((p, q) => p[0] - q[0]);
    let s = gapA;
    for (const [c0, c1] of [...cuts, [len - gapB, len + 1e9]]) {
      const end = Math.min(c0, len - gapB);
      if (end > s + 1) {
        const mid = (s + end) / 2, l = end - s, mw = r.median - 0.4;
        const f = frameAlong(a.x + ux * mid, a.z + uz * mid, ux, uz);
        B.xf = f;
        sw.box(0, 0, 0, mw, 0.35, l, 0xb0aaa0, { tileW: 2, tileH: 2, topBuilder: grass, topTile: 4 });
        colliders.framed(f).addCentered(0, 0, mw, l, 0.9, 'median');
        if (!DETAIL.lite) for (let k = -l / 2 + 4; k < l / 2 - 3; k += 9) put(stone, SHRUB, 0, 0.75, k, 0x4f7a32, k, 0.8, 0.55, 0.8);
        B.xf = null;
      }
      s = Math.max(s, c1);
    }
  }

  // ---------- Underpasses ----------
  for (const u of layout.underpasses) {
    const r = u.road, hw = r.width / 2;
    const f = frameAlong(u.cx, u.cz, u.ux, u.uz);
    const col = colliders.framed(f);
    B.xf = f;
    const top = CURB_H + 1.0;
    const step = 2.5;
    for (const [x, inward] of [[-hw, 1], [hw, -1]]) {
      for (let a = -u.half; a < u.half - 1e-6; a += step) {
        const za = a, zb = a + step, ya = layout.dip(u, za), yb = layout.dip(u, zb);
        const xi = x + inward * 0.02;
        const n = [inward, 0, 0];
        if (inward < 0) concrete.quad4([xi, ya, za], [xi, yb, zb], [xi, top, zb], [xi, top, za], n, [0, 0], [1, 0], [1, 1], [0, 1], 0x9a958c);
        else concrete.quad4([xi, yb, zb], [xi, ya, za], [xi, top, za], [xi, top, zb], n, [0, 0], [1, 0], [1, 1], [0, 1], 0x9a958c);
      }
      const wx = x - inward * 0.15;
      concrete.box(wx, CURB_H, 0, 0.3, top - CURB_H, u.half * 2, 0xb0aaa0);
      for (let a = -u.half; a < u.half; a += 2) concrete.box(wx, top, a + 0.5, 0.32, 0.12, 1, 0xf2c200);
      col.addCentered(wx, 0, 0.3, u.half * 2, top + 0.05, 'wall');
    }
    // Deck: a road bridge crossing square above, or the railway bridge along the track.
    let deckW = 15, span = r.width + 1.2;
    if (u.type === 'rail') {
      deckW = 11;
      const rl = Math.hypot(u.railDir.x, u.railDir.z) || 1;
      const sin = Math.max(0.35, Math.abs((u.railDir.x * u.uz - u.railDir.z * u.ux) / rl));
      span = (r.width + 1.2) / sin + 4;
      B.xf = makeFrame(u.cx, u.cz, Math.atan2(-u.railDir.z, u.railDir.x));
      concrete.box(0, -1.1, 0, span, CURB_H + 1.35, deckW, 0x8f8a82, { bottom: true });
      for (const s of [-1, 1]) concrete.box(0, CURB_H + 0.25, s * (deckW / 2 - 0.2), span, 1.0, 0.4, 0xb8b2a8);
      B.xf = f;
      deckW = deckW / sin;
    } else {
      concrete.box(0, -1.1, 0, span, CURB_H + 1.35, deckW, 0x8f8a82, { bottom: true });
      for (const s of [-1, 1]) concrete.box(0, CURB_H + 0.25, s * (deckW / 2 - 0.2), span, 1.0, 0.4, 0xb8b2a8);
      B.get(ensureRoadMat(1, 0, 6.8)).rect(-hw - 0.6, hw + 0.6, -3.4, 3.4, CURB_H + 0.26, 0xffffff, (x, z) => [(z + 3.4) / 6.8, x / ROAD_TILE]);
    }
    for (const s of [-1, 1]) {
      ctx.sign({ key: 'up_' + u.name, text: [u.name.toUpperCase(), 'ಕೆಳಸೇತುವೆ · HEIGHT 4.2 m'], bg: '#1f4e8c', fg: '#fff', x: 0, y: -0.5, z: s * (deckW / 2 + 0.05), w: Math.min(r.width, 12), h: 1.1, face: s < 0 ? 'n' : 's' });
    }
    B.xf = null;
    // Flood water that rises during monsoon rain.
    const g = new THREE.PlaneGeometry(r.width, u.half * 2);
    g.rotateX(-Math.PI / 2);
    g.rotateY(f.ang);
    const water = new THREE.Mesh(g, floodMaterial);
    water.position.set(u.cx, u.waterLevel, u.cz);
    water.visible = false;
    water.renderOrder = 2;
    group.add(water);
    u.waterMesh = water;
  }

  // ---------- Flyovers: the inner lanes climb over the junction, one straight arm each side ----------
  for (const f of layout.flyovers) {
    const r = f.road;
    const key = ensureRoadMat(1, r.median || 0, f.hw * 2);
    const x0 = -f.hw, x1 = f.hw;
    f.arms.forEach((arm, ai) => {
      const fr = frameAlong(f.cx, f.cz, arm.ux, arm.uz);
      const col = colliders.framed(fr);
      B.xf = fr;
      const deck = (z) => layout.deckHeight(f, z, arm);
      stripZ(B.get(key), x0, x1, 0, arm.half, (z) => deck(z) + 0.02, 3);
      // Near the junction an arm's parapet can cross the other arm's deck at a bend: leave it out there.
      const other = f.arms[1 - ai];
      const onOther = (lx, lz) => {
        const [wx, wz] = [fr.ox + lx * fr.c + lz * fr.s, fr.oz - lx * fr.s + lz * fr.c];
        const dx = wx - f.cx, dz = wz - f.cz;
        const al = dx * other.ux + dz * other.uz, lt = -dx * other.uz + dz * other.ux;
        return al > -f.hw && al < other.half && Math.abs(lt) < f.hw - 0.05;
      };
      const step = 3;
      for (let a = 0; a < arm.half - 1e-6; a += step) {
        const za = a, zb = Math.min(a + step, arm.half), ya = deck(za), yb = deck(zb);
        const lowA = ya < 4 ? 0 : ya - 1.3, lowB = yb < 4 ? 0 : yb - 1.3;
        const skip1 = onOther(x1, (za + zb) / 2), skip0 = onOther(x0, (za + zb) / 2);
        if (!skip1) concrete.quad4([x1, lowB, zb], [x1, lowA, za], [x1, ya + 1.05, za], [x1, yb + 1.05, zb], [1, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1], 0xbab4aa);
        if (!skip0) concrete.quad4([x0, lowA, za], [x0, lowB, zb], [x0, yb + 1.05, zb], [x0, ya + 1.05, za], [-1, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1], 0xbab4aa);
        if (ya >= 4 || yb >= 4) concrete.quad4([x0, lowA, za], [x1, lowA, za], [x1, lowB, zb], [x0, lowB, zb], [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1], 0x8a857c);
        const hMax = Math.max(ya, yb), hMin = Math.min(ya, yb);
        const y0 = hMax < 4 ? -100 : hMin - 0.7;
        const ym = deck((za + zb) / 2) + 1.05;
        if (!skip0) { col.add(x0 - 0.3, x0, za, zb, hMax + 1.05, 'wall', y0); concrete.box(x0 + 0.15, ym - 0.12, (za + zb) / 2, 0.3, 0.12, zb - za - 0.2, 0xf2c200); }
        if (!skip1) { col.add(x1, x1 + 0.3, za, zb, hMax + 1.05, 'wall', y0); concrete.box(x1 - 0.15, ym - 0.12, (za + zb) / 2, 0.3, 0.12, zb - za - 0.2, 0xf2c200); }
      }
      let a = 0;
      while (deck(a) > 4 && a < arm.half) a += 0.5;
      // Blocks traffic beneath where the span gets low; cars on the deck pass over it.
      col.add(x0, x1, a, a + 0.6, 3.0, 'wall');
      for (let p = 22; p < a - 4; p += 18) {
        const h = deck(p) - 1.3;
        put(concrete, CYL, 0, h / 2, p, 0xb0aaa0, 0, 0.8, h, 0.8);
        concrete.box(0, h - 0.8, p, f.hw * 2, 0.8, 1.6, 0xb0aaa0);
        col.addCentered(0, p, 1.7, 1.7, h, 'pier');
      }
      if (ai === 0) ctx.sign({ key: 'fo_' + f.name, text: [f.name.toUpperCase(), 'ಮೇಲ್ಸೇತುವೆ'], bg: '#1f6a3a', fg: '#fff', x: 0, y: deck(arm.half * 0.6) + 3.2, z: arm.half * 0.6, w: f.hw * 2 - 0.6, h: 1.4, face: 's' });
      B.xf = null;
    });
    // Fill the wedge where the two arms meet, and close its parapets.
    const [A, Bm] = f.arms;
    const P = (arm, s) => [f.cx - arm.uz * f.hw * s, f.cz + arm.ux * f.hw * s];
    const pts = [P(A, 1), P(A, -1), P(Bm, 1), P(Bm, -1)].sort((p, q) => Math.atan2(p[1] - f.cz, p[0] - f.cx) - Math.atan2(q[1] - f.cz, q[0] - f.cx));
    fanPoly(B.get(key), f.cx, f.cz, pts, f.height + 0.02, 0xffffff, (x, z) => [0.5, -z / ROAD_TILE]);
    // Close the outer side of the bend (the inner side's parapets meet by themselves).
    for (const [p, q] of [[P(A, 1), P(Bm, -1)], [P(A, -1), P(Bm, 1)]]) {
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.2) continue;
      const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
      const inside = f.arms.some((arm) => { const dx = mx - f.cx, dz = mz - f.cz; const al = dx * arm.ux + dz * arm.uz, lt = -dx * arm.uz + dz * arm.ux; return al > 0 && Math.abs(lt) < f.hw - 0.3; });
      if (inside) continue;
      colliders.addSegment(p[0], p[1], q[0], q[1], 0.4, f.height + 1.05, 'wall', f.height - 0.7);
      const fr = makeFrame(mx, mz, Math.atan2(-(q[1] - p[1]), q[0] - p[0]));
      B.xf = fr;
      concrete.box(0, f.height - 1.3, 0, Math.hypot(q[0] - p[0], q[1] - p[1]) + 0.3, 2.35, 0.3, 0xbab4aa);
      B.xf = null;
    }
  }

  // ---------- Dead ends at the edge of the map ----------
  const W = layout.world;
  for (const n of layout.nodes) {
    if (n.adj.length !== 1) continue;
    const nearEdge = n.x < W.minX + 30 || n.x > W.maxX - 30 || n.z < W.minZ + 30 || n.z > W.maxZ - 30;
    const h = n.adj[0];
    const f = frameAlong(n.x + h.u.x * 2, n.z + h.u.z * 2, h.u.x, h.u.z);
    B.xf = f;
    for (let k = 0; k < Math.ceil(h.w); k++) stone.box(-h.w + 1 + k * 2, 0, 0, 2, 1.2, 0.6, k % 2 ? 0x222222 : 0xf2c200);
    colliders.framed(f).addCentered(0, 0, h.w * 2 + 2, 1, 3, 'wall');
    ctx.sign({ key: 'metroWork', text: nearEdge ? ['ROAD CLOSED · METRO WORK', 'ಮೆಟ್ರೋ ಕಾಮಗಾರಿ'] : ['DEAD END', 'ಮುಂದೆ ದಾರಿ ಇಲ್ಲ'], bg: '#f2c200', fg: '#111', x: 0, y: 1.4, z: 0.31, w: 6, h: 1.5, face: 's' });
    B.xf = null;
  }
  // World bounds.
  colliders.add(W.minX - 10, W.minX, W.minZ - 10, W.maxZ + 10, 300, 'bound');
  colliders.add(W.maxX, W.maxX + 10, W.minZ - 10, W.maxZ + 10, 300, 'bound');
  colliders.add(W.minX - 10, W.maxX + 10, W.minZ - 10, W.minZ, 300, 'bound');
  colliders.add(W.minX - 10, W.maxX + 10, W.maxZ, W.maxZ + 10, 300, 'bound');

  // ---------- Railway ----------
  const rail = buildRailway(ctx);
  return { rail };
}
