// Roads on the real network: carriageway strips per edge (mitred at gentle bends), junction
// pads with zebra crossings, raised medians, underpasses (with floodable water), flyovers and the
// elevated airport road (with Hebbal's loops), and dead-end barricades at the edge of the map.
import * as THREE from 'three';
import { makeFrame } from './meshBuilder.js';
import { put } from './landmarks.js';
import { fanPoly, quadPts } from './geom.js';
import * as T from './textures.js';
import { CURB_H } from '../config.js';
import { buildRailway } from './railway.js';
import { DETAIL } from './detail.js';
import { withAO } from './ao.js';

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
    if (!mats[key]) mats[key] = withAO(new THREE.MeshStandardMaterial({ map: tex(T.roadTexture({ lanes, median, width })), roughness: 0.88 }));
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
    for (const c of e.flyCuts || []) cuts.push(c);
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

  // ---------- Flyovers: the inner lanes on a deck over the junctions, on piers in the median ----------
  // Stations every few metres along a polyline, with the across-axis (local +x, as in frameAlong)
  // mitred at its corners.
  const stations = (pts, cum, step) => {
    const out = [];
    const axis = (i) => { const p = pts[i], q = pts[i + 1], l = Math.hypot(q.x - p.x, q.z - p.z) || 1; return { x: (q.z - p.z) / l, z: -(q.x - p.x) / l }; };
    for (let i = 0; i < pts.length - 1; i++) {
      const a0 = cum[i], a1 = cum[i + 1], n = Math.max(1, Math.ceil((a1 - a0) / step)), ax = axis(i);
      for (let k = 0; k < n; k++) {
        const t = k / n, s = a0 + (a1 - a0) * t;
        let px = ax.x, pz = ax.z, m = 1;
        if (k === 0 && i > 0) {
          const b = axis(i - 1), mx = b.x + ax.x, mz = b.z + ax.z, ml = Math.hypot(mx, mz) || 1;
          px = mx / ml; pz = mz / ml; m = 1 / Math.max(0.5, px * ax.x + pz * ax.z);
        }
        out.push({ s, x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, z: pts[i].z + (pts[i + 1].z - pts[i].z) * t, px, pz, m });
      }
    }
    const l = pts.length - 1, ax = axis(l - 1);
    out.push({ s: cum[l], x: pts[l].x, z: pts[l].z, px: ax.x, pz: ax.z, m: 1 });
    return out;
  };
  const PARAPET = 1.05, LOW = 4;
  // One elevated carriageway: deck, fascias, parapets (left out where `open(side, s)`), soffit,
  // colliders. `hAt(s)` is the deck height; `edges(s)` its two sides as offsets across it.
  const elevated = (st, hw, surf, hAt, open, edges = () => [-hw, hw]) => {
    for (let k = 0; k < st.length - 1; k++) {
      const A = st[k], Bq = st[k + 1], ya = hAt(A.s), yb = hAt(Bq.s), eA = edges(A.s), eB = edges(Bq.s);
      if (eA[1] - eA[0] < 0.05 && eB[1] - eB[0] < 0.05) continue;
      const P = (q, off, y) => [q.x + q.px * off * q.m, y, q.z + q.pz * off * q.m];
      const ux = Bq.x - A.x, uz = Bq.z - A.z, ul = Math.hypot(ux, uz) || 1, slope = (yb - ya) / ul;
      const nl = Math.hypot(slope, 1), n = [(-slope * ux) / ul / nl, 1 / nl, (-slope * uz) / ul / nl];
      const U = (x) => (x + hw) / (2 * hw);
      surf.quad4(P(Bq, eB[0], yb + 0.02), P(Bq, eB[1], yb + 0.02), P(A, eA[1], ya + 0.02), P(A, eA[0], ya + 0.02), n,
        [U(eB[0]), -Bq.s / ROAD_TILE], [U(eB[1]), -Bq.s / ROAD_TILE], [U(eA[1]), -A.s / ROAD_TILE], [U(eA[0]), -A.s / ROAD_TILE]);
      const lowA = ya < LOW ? 0 : ya - 1.3, lowB = yb < LOW ? 0 : yb - 1.3;
      const hMax = Math.max(ya, yb), hMin = Math.min(ya, yb), mid = (A.s + Bq.s) / 2;
      const y0 = hMax < LOW ? -100 : hMin - 0.7;
      for (const side of [1, -1]) {
        const gap = open(side, mid), top = gap ? 0 : PARAPET, i = side > 0 ? 1 : 0;
        const xa = eA[i], xb = eB[i], xia = xa - side * 0.25, xib = xb - side * 0.25;
        // Across-axis of this stretch of edge (it slants where the deck tapers).
        const ex = (Bq.x + Bq.px * xb * Bq.m) - (A.x + A.px * xa * A.m), ez = (Bq.z + Bq.pz * xb * Bq.m) - (A.z + A.pz * xa * A.m), el = Math.hypot(ex, ez) || 1;
        const pn = [ez / el, 0, -ex / el], nn = [-ez / el, 0, ex / el];
        // Outer face, down to the soffit (or the ground, low down where the ramp is solid).
        if (side > 0) concrete.quad4(P(Bq, xb, lowB), P(A, xa, lowA), P(A, xa, ya + top), P(Bq, xb, yb + top), pn, [0, 0], [1, 0], [1, 1], [0, 1], 0xbab4aa);
        else concrete.quad4(P(A, xa, lowA), P(Bq, xb, lowB), P(Bq, xb, yb + top), P(A, xa, ya + top), nn, [0, 0], [1, 0], [1, 1], [0, 1], 0xbab4aa);
        if (gap) continue;
        // Inner face and the yellow-painted top.
        if (side > 0) {
          concrete.quad4(P(A, xia, ya), P(Bq, xib, yb), P(Bq, xib, yb + PARAPET), P(A, xia, ya + PARAPET), nn, [0, 0], [1, 0], [1, 1], [0, 1], 0xc4beb4);
          concrete.quad4(P(Bq, xib, yb + PARAPET), P(Bq, xb, yb + PARAPET), P(A, xa, ya + PARAPET), P(A, xia, ya + PARAPET), [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1], 0xf2c200);
        } else {
          concrete.quad4(P(Bq, xib, yb), P(A, xia, ya), P(A, xia, ya + PARAPET), P(Bq, xib, yb + PARAPET), pn, [0, 0], [1, 0], [1, 1], [0, 1], 0xc4beb4);
          concrete.quad4(P(Bq, xb, yb + PARAPET), P(Bq, xib, yb + PARAPET), P(A, xia, ya + PARAPET), P(A, xa, ya + PARAPET), [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1], 0xf2c200);
        }
        const [ax, , az] = P(A, xa - side * 0.1, 0), [bx, , bz] = P(Bq, xb - side * 0.1, 0);
        colliders.addSegment(ax, az, bx, bz, 0.3, hMax + PARAPET, 'wall', y0);
      }
      if (ya >= LOW || yb >= LOW) concrete.quad4(P(A, eA[0], lowA), P(A, eA[1], lowA), P(Bq, eB[1], lowB), P(Bq, eB[0], lowB), [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1], 0x8a857c);
    }
  };
  // Where the deck comes down to `LOW` on a ramp: a wall underneath stops you driving into it.
  const lowWall = (st, hw, hAt, from, dir) => {
    let k = from;
    while (k >= 0 && k < st.length && hAt(st[k].s) > LOW) k += dir;
    const q = st[Math.max(0, Math.min(st.length - 1, k))];
    colliders.addSegment(q.x - q.px * hw, q.z - q.pz * hw, q.x + q.px * hw, q.z + q.pz * hw, 0.6, 3.0, 'wall');
  };
  const pier = (x, z, ux, uz, h, capW) => {
    put(concrete, CYL, x, (h - 1.3) / 2, z, 0xb0aaa0, 0, 0.9, h - 1.3, 0.9);
    B.xf = frameAlong(x, z, ux, uz);
    concrete.box(0, h - 2.1, 0, capW, 0.8, 1.8, 0xa8a298);
    B.xf = null;
    colliders.addCentered(x, z, 1.9, 1.9, h - 1.3, 'pier');
  };
  const gantry = (q, h, hw, sides, key) => {
    B.xf = frameAlong(q.x, q.z, -q.pz, q.px); // local +z along the deck
    for (const x of [-hw + 0.35, hw - 0.35]) concrete.box(x, h, 0, 0.35, 6.2, 0.35, 0x6d7075);
    concrete.box(0, h + 5.8, 0, hw * 2, 0.45, 0.45, 0x6d7075);
    for (const g of sides) {
      const x = g.dir * (g.cx || 0);
      ctx.sign({ key, text: g.text, bg: '#1f6a3a', fg: '#fff', x, y: h + 4.9, z: -g.dir * 0.3, w: g.w, h: 1.6, face: g.dir > 0 ? 'n' : 's' });
    }
    B.xf = null;
  };

  for (const f of layout.flyovers) {
    const surf = B.get(ensureRoadMat(f.lanes, f.median, f.hw * 2));
    const st = stations(f.pts, f.cum, 3);
    const hAt = (s) => layout.deckHeight(f, s);
    elevated(st, f.hw, surf, hAt, (side, s) => f.gaps.some((g) => g.side === side && s > g.s0 && s < g.s1));
    lowWall(st, f.hw, hAt, 0, 1);
    lowWall(st, f.hw, hAt, st.length - 1, -1);
    // A crash barrier down the middle.
    if (f.median > 0) {
      for (let k = 0; k < st.length - 1; k++) {
        const A = st[k], Bq = st[k + 1], ya = hAt(A.s), yb = hAt(Bq.s);
        const P = (q, off, y) => [q.x + q.px * off * q.m, y, q.z + q.pz * off * q.m];
        concrete.quad4(P(Bq, 0.25, yb), P(A, 0.25, ya), P(A, 0.25, ya + 0.85), P(Bq, 0.25, yb + 0.85), [A.px, 0, A.pz], [0, 0], [1, 0], [1, 1], [0, 1], 0xc8c2b8);
        concrete.quad4(P(A, -0.25, ya), P(Bq, -0.25, yb), P(Bq, -0.25, yb + 0.85), P(A, -0.25, ya + 0.85), [-A.px, 0, -A.pz], [0, 0], [1, 0], [1, 1], [0, 1], 0xc8c2b8);
        concrete.quad4(P(Bq, -0.25, yb + 0.85), P(Bq, 0.25, yb + 0.85), P(A, 0.25, ya + 0.85), P(A, -0.25, ya + 0.85), [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1], 0xd8d2c8);
        const hMin = Math.min(ya, yb);
        colliders.addSegment(A.x, A.z, Bq.x, Bq.z, 0.5, Math.max(ya, yb) + 0.85, 'wall', hMin < 1.2 ? -100 : hMin - 0.5);
      }
    }
    // Piers in the median, clear of the junctions it passes over.
    const inner = f.nodes.slice(1, -1);
    for (let s = 12; s < f.len; s += 24) {
      const h = hAt(s);
      if (h < 4.5) continue;
      const i = Math.max(0, f.cum.findIndex((c) => c > s) - 1), p = f.pts[i], q = f.pts[i + 1], t = (s - f.cum[i]) / f.seg[i];
      const x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t;
      if (inner.some((n) => n.adj.length > 2 && Math.hypot(n.x - x, n.z - z) < Math.max(...n.cut.values()) + 6)) continue;
      if (layout.underpassAt(x, z)) continue;
      pier(x, z, (q.x - p.x) / f.seg[i], (q.z - p.z) / f.seg[i], h, f.hw * 2 - 1.5);
    }
    // Direction signs on gantries, or the flyover's name at each end.
    const half = f.median / 2 + (f.lanes * 3.4) / 2, w = f.lanes * 3.4 + 0.4;
    const signs = f.gantries.length ? f.gantries : [{ at: (f.rampA * 0.85) / f.len, dir: 1, text: [f.name.toUpperCase(), 'ಮೇಲ್ಸೇತುವೆ'] }, { at: 1 - (f.rampB * 0.85) / f.len, dir: -1, text: [f.name.toUpperCase(), 'ಮೇಲ್ಸೇತುವೆ'] }];
    for (const g of signs) {
      const q = st.reduce((b, c) => (Math.abs(c.s - g.at * f.len) < Math.abs(b.s - g.at * f.len) ? c : b));
      gantry(q, hAt(q.s), f.hw, [{ ...g, cx: half, w }], 'fo_' + f.name + g.at);
    }
  }

  // ---------- Slip roads curling up onto a deck (Hebbal's loops) ----------
  for (const r of layout.ramps) {
    const surf = B.get(ensureRoadMat(1, 0, r.hw * 2));
    const st = stations(r.pts, r.cum, 3);
    const yAt = (s) => {
      let j = 0;
      while (j < r.cum.length - 2 && r.cum[j + 1] < s) j++;
      const t = Math.max(0, Math.min(1, (s - r.cum[j]) / (r.cum[j + 1] - r.cum[j] || 1)));
      return r.pts[j].y + (r.pts[j + 1].y - r.pts[j].y) * t;
    };
    const sMerge = r.cum[r.curve - 1], sEnd = r.cum[r.cum.length - 1];
    // No parapets on the first few metres (you swing in from the kerb lane), nor along the deck it
    // joins; there it tapers away, its outer parapet steering you on.
    elevated(st, r.hw, surf, yAt, (side, s) => s < 6 || (side < 0 && s > sMerge), (s) => layout.rampEdges(r, s));
    for (let s = 20; s < sEnd - 4; s += 20) {
      const h = yAt(s);
      if (h < 4.5) continue;
      const q = st.reduce((b, c) => (Math.abs(c.s - s) < Math.abs(b.s - s) ? c : b));
      if (layout.roadAt(q.x, q.z) || layout.flyoverAt(q.x, q.z)) continue;
      pier(q.x, q.z, -q.pz, q.px, h, r.hw * 2 - 1);
    }
    const q = st.reduce((b, c) => (Math.abs(c.s - sMerge * 0.55) < Math.abs(b.s - sMerge * 0.55) ? c : b));
    B.xf = frameAlong(q.x, q.z, -q.pz, q.px);
    for (const x of [-r.hw + 0.3, r.hw - 0.3]) concrete.box(x, yAt(q.s), 0, 0.3, 5.6, 0.3, 0x6d7075);
    concrete.box(0, yAt(q.s) + 5.3, 0, r.hw * 2, 0.4, 0.4, 0x6d7075);
    ctx.sign({ key: 'loop_' + r.name, text: [r.name.toUpperCase(), 'ಹೆಬ್ಬಾಳ ಮೇಲ್ಸೇತುವೆ'], bg: '#1f6a3a', fg: '#fff', x: 0, y: yAt(q.s) + 4.5, z: -0.3, w: r.hw * 2 - 1, h: 1.4, face: 'n' });
    B.xf = null;
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
