// Turns road polylines into a planar road graph and city blocks.
// 1. Roads: real arterials plus a street grid that fills the neighbourhoods (kept out of parks,
//    lakes and away from arterials running alongside).
// 2. Every crossing becomes a junction node; nearby nodes are merged, dead ends pruned.
// 3. Faces of the planar graph are the city blocks, inset by half the road widths.
// Pure JS (no three.js), so it can be tested in Node.

export const LANE_W = 3.4;
export const SIDEWALK_W = 4;
export const roadWidth = (r) => (r.boundary ? 0 : r.lanes * 2 * LANE_W + (r.median || 0));

const VILLAGES = ['Kogilu', 'Bagalur', 'Chokkanahalli', 'Hunasamaranahalli', 'Bettahalasur', 'Doddajala', 'Kannur', 'Avalahalli', 'Mittaganahalli',
  'Budigere', 'Bidarahalli', 'Kadusonnappanahalli', 'Rampura', 'Sonnenahalli', 'Hirandahalli', 'Kattigenahalli', 'Shettigere', 'Arebinnamangala'];
const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length]; a += x1 * z2 - x2 * z1; }
  return a / 2;
}

function segDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / l2));
  return Math.hypot(ax + abx * t - px, az + abz * t - pz);
}

// Proper segment intersection: returns [t, u] params or null.
function intersect(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const qp = [c[0] - a[0], c[1] - a[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return [t, u];
}

// ---------- the street grid ----------
function makeGrid(cfg, arterials, rural = false) {
  const { world, avoid, rng } = cfg;
  const urban = cfg.urban || null;
  const inUrban = (x, z) => !urban || urban.some((p) => pointInPoly(x, z, p));
  const spacing = rural ? cfg.ruralSpacing || 650 : cfg.spacing || 150;
  const lines = [];
  const axisLines = (axis) => {
    const [lo, hi] = axis === 'x' ? [world.minX, world.maxX] : [world.minZ, world.maxZ];
    let k = 0;
    for (let p = lo + spacing * 0.55; p < hi - 40; p += spacing * (0.88 + rng() * 0.24)) lines.push({ axis, pos: p, k: k++ });
  };
  axisLines('x'); axisLines('z');
  const arts = [];
  for (const a of arterials) for (let i = 0; i < a.pts.length - 1; i++) arts.push([a.pts[i], a.pts[i + 1]]);
  const roads = [];
  const blocked = (x, z, dirX, dirZ) => {
    // City streets inside the built-up areas; village roads outside them.
    if (urban && inUrban(x, z) !== !rural) return true;
    for (const poly of avoid) if (pointInPoly(x, z, poly)) return true;
    for (const [a, b] of arts) {
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const par = Math.abs((dx * dirX + dz * dirZ) / l);
      const d = segDist(x, z, a[0], a[1], b[0], b[1]);
      if (par > 0.88 && d < 62) return true; // an arterial runs alongside: don't double it
      if (d < 9) return true; // don't run along on top of one
    }
    return false;
  };
  for (const L of lines) {
    const [dirX, dirZ] = L.axis === 'x' ? [0, 1] : [1, 0];
    const [lo, hi] = L.axis === 'x' ? [world.minZ, world.maxZ] : [world.minX, world.maxX];
    let start = null;
    const flush = (end) => {
      if (start !== null && end - start > (rural ? 200 : 70)) {
        const p = (t) => (L.axis === 'x' ? [L.pos, t] : [t, L.pos]);
        if (rural) roads.push({ name: `${VILLAGES[(L.k * 7 + (L.axis === 'x' ? 3 : 0)) % VILLAGES.length]} Road`, lanes: 1, median: 0, pts: [p(start), p(end)], grid: true, rural: true });
        else roads.push({ name: `${ORD((L.k % 24) + 1)} ${L.axis === 'x' ? 'Main Road' : 'Cross Road'}`, lanes: L.k % 5 === 2 ? 2 : 1, median: 0, pts: [p(start), p(end)], grid: true });
      }
      start = null;
    };
    for (let t = lo; t <= hi; t += 6) {
      const [x, z] = L.axis === 'x' ? [L.pos, t] : [t, L.pos];
      if (blocked(x, z, dirX, dirZ)) flush(t - 6); else if (start === null) start = t;
    }
    flush(hi);
  }
  return roads;
}

// ---------- graph ----------
export function buildRoadNet(cfg) {
  const { world, arterials } = cfg;
  const roads = [...arterials.map((r) => ({ ...r })), ...makeGrid(cfg, arterials), ...(cfg.urban ? makeGrid(cfg, arterials, true) : [])];
  // World boundary closes the outer blocks.
  const W = world;
  roads.push({ name: 'boundary', boundary: true, lanes: 0, median: 0, pts: [[W.minX, W.minZ], [W.maxX, W.minZ], [W.maxX, W.maxZ], [W.minX, W.maxZ], [W.minX, W.minZ]] });
  roads.forEach((r, i) => { r.id = i; r.width = roadWidth(r); });

  // Clip polylines to the world rectangle.
  const inWorld = (p) => p[0] >= W.minX - 1 && p[0] <= W.maxX + 1 && p[1] >= W.minZ - 1 && p[1] <= W.maxZ + 1;
  for (const r of roads) {
    if (r.boundary) continue;
    const out = [];
    for (let i = 0; i < r.pts.length; i++) {
      const p = r.pts[i];
      if (inWorld(p)) { out.push(p); continue; }
      // Replace an outside point by the crossing with the boundary from its inside neighbour.
      const q = r.pts[i - 1] && inWorld(r.pts[i - 1]) ? r.pts[i - 1] : r.pts[i + 1] && inWorld(r.pts[i + 1]) ? r.pts[i + 1] : null;
      if (!q) continue;
      let t = 1;
      for (const [k, lim] of [[0, W.minX], [0, W.maxX], [1, W.minZ], [1, W.maxZ]]) {
        const d = p[k] - q[k];
        if (Math.abs(d) < 1e-9) continue;
        const tt = (lim - q[k]) / d;
        if (tt > 0 && tt < t) t = tt;
      }
      out.push([q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t]);
    }
    r.pts = out;
  }

  // Segments and their intersections.
  const segs = [];
  for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) segs.push({ r, i, a: r.pts[i], b: r.pts[i + 1], cuts: [] });
  const CELL = 120, hash = new Map();
  const cellsOf = (s) => {
    const out = [];
    const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / CELL), x1 = Math.floor(Math.max(s.a[0], s.b[0]) / CELL);
    const z0 = Math.floor(Math.min(s.a[1], s.b[1]) / CELL), z1 = Math.floor(Math.max(s.a[1], s.b[1]) / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) out.push(x + ',' + z);
    return out;
  };
  segs.forEach((s, k) => { for (const c of cellsOf(s)) { if (!hash.has(c)) hash.set(c, []); hash.get(c).push(k); } });
  const seen = new Set();
  for (const list of hash.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = segs[list[i]], Bs = segs[list[j]];
      const key = list[i] < list[j] ? list[i] + ':' + list[j] : list[j] + ':' + list[i];
      if (seen.has(key)) continue;
      seen.add(key);
      if (A.r === Bs.r && Math.abs(A.i - Bs.i) <= 1) continue;
      const hit = intersect(A.a, A.b, Bs.a, Bs.b);
      if (!hit) continue;
      const p = [A.a[0] + (A.b[0] - A.a[0]) * hit[0], A.a[1] + (A.b[1] - A.a[1]) * hit[0]];
      A.cuts.push({ t: hit[0], p }); Bs.cuts.push({ t: hit[1], p });
    }
  }
  // Near misses: a road ending just short of (or just past) another becomes a T-junction.
  for (const r of roads) {
    if (r.boundary) continue;
    for (const end of [r.pts[0], r.pts[r.pts.length - 1]]) {
      let best = null, bd = 25;
      for (const s of segs) {
        if (s.r === r) continue;
        const abx = s.b[0] - s.a[0], abz = s.b[1] - s.a[1], l2 = abx * abx + abz * abz || 1;
        const t = Math.max(0, Math.min(1, ((end[0] - s.a[0]) * abx + (end[1] - s.a[1]) * abz) / l2));
        const d = Math.hypot(s.a[0] + abx * t - end[0], s.a[1] + abz * t - end[1]);
        if (d < bd) { bd = d; best = { s, t }; }
      }
      if (best && bd > 0.01) {
        const p = [best.s.a[0] + (best.s.b[0] - best.s.a[0]) * best.t, best.s.a[1] + (best.s.b[1] - best.s.a[1]) * best.t];
        best.s.cuts.push({ t: best.t, p });
        end[0] = p[0]; end[1] = p[1];
      }
    }
  }

  // Nodes (snapped), then edges along each road between consecutive points.
  const nodes = [];
  const NH = new Map(), SNAP = 9;
  const nodeAt = (p) => {
    const cx = Math.floor(p[0] / SNAP), cz = Math.floor(p[1] / SNAP);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const n of NH.get((cx + dx) + ',' + (cz + dz)) || []) if (Math.hypot(n.x - p[0], n.z - p[1]) < SNAP) return n;
    }
    const n = { id: nodes.length, x: p[0], z: p[1], adj: [] };
    nodes.push(n);
    const k = cx + ',' + cz;
    if (!NH.has(k)) NH.set(k, []);
    NH.get(k).push(n);
    return n;
  };
  const edgeMap = new Map();
  let edges = [];
  const link = (a, b, r) => {
    if (a === b) return;
    const key = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
    const old = edgeMap.get(key);
    if (old) { if (!r.boundary && (old.r.boundary || roadWidth(r) > roadWidth(old.r))) old.r = r; return; }
    const e = { id: edges.length, a, b, r };
    edges.push(e); edgeMap.set(key, e);
  };
  for (const r of roads) {
    const pts = [];
    for (const s of segs.filter((q) => q.r === r)) {
      const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      pts.push({ d: s.i * 1e6, p: s.a });
      for (const c of s.cuts) pts.push({ d: s.i * 1e6 + c.t * L, p: c.p });
      pts.push({ d: s.i * 1e6 + L, p: s.b });
    }
    pts.sort((u, v) => u.d - v.d);
    let prev = null;
    for (const q of pts) { const n = nodeAt(q.p); if (prev) link(prev, n, r); prev = n; }
  }

  // Collapse very short edges (two crossings a few metres apart become one junction).
  const parent = nodes.map((n) => n.id);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const e of edges) if (!e.r.boundary && Math.hypot(e.a.x - e.b.x, e.a.z - e.b.z) < 14) parent[find(e.a.id)] = find(e.b.id);
  const merged = new Map();
  for (const n of nodes) {
    const root = find(n.id);
    if (!merged.has(root)) merged.set(root, { xs: 0, zs: 0, k: 0 });
    const m = merged.get(root); m.xs += n.x; m.zs += n.z; m.k++;
  }
  const keepNodes = new Map();
  for (const [root, m] of merged) keepNodes.set(root, { id: 0, x: m.xs / m.k, z: m.zs / m.k, adj: [] });
  const em2 = new Map();
  const edges2 = [];
  for (const e of edges) {
    const a = keepNodes.get(find(e.a.id)), b = keepNodes.get(find(e.b.id));
    if (a === b) continue;
    const key = [a, b].map((n) => `${n.x.toFixed(2)},${n.z.toFixed(2)}`).sort().join('|');
    const old = em2.get(key);
    if (old) { if (!e.r.boundary && (old.r.boundary || roadWidth(e.r) > roadWidth(old.r))) old.r = e.r; continue; }
    const ne = { a, b, r: e.r };
    em2.set(key, ne);
    edges2.push(ne);
  }
  edges = edges2;
  let nodeList = [...keepNodes.values()];

  // Prune dead ends (except on the world boundary), repeatedly.
  const onBoundary = (n) => n.x <= W.minX + 1 || n.x >= W.maxX - 1 || n.z <= W.minZ + 1 || n.z >= W.maxZ - 1;
  for (;;) {
    const deg = new Map();
    for (const e of edges) { deg.set(e.a, (deg.get(e.a) || 0) + 1); deg.set(e.b, (deg.get(e.b) || 0) + 1); }
    const before = edges.length;
    edges = edges.filter((e) => !((deg.get(e.a) === 1 && !onBoundary(e.a)) || (deg.get(e.b) === 1 && !onBoundary(e.b))));
    if (edges.length === before) break;
  }
  const used = new Set();
  for (const e of edges) { used.add(e.a); used.add(e.b); }
  nodeList = nodeList.filter((n) => used.has(n));
  nodeList.forEach((n, i) => { n.id = i; n.adj = []; });
  edges.forEach((e, i) => {
    e.id = i;
    e.len = Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z);
    e.a.adj.push({ e, to: e.b, ang: Math.atan2(e.b.z - e.a.z, e.b.x - e.a.x) });
    e.b.adj.push({ e, to: e.a, ang: Math.atan2(e.a.z - e.b.z, e.a.x - e.b.x) });
  });
  for (const n of nodeList) n.adj.sort((p, q) => p.ang - q.ang);

  // Faces: walk half-edges keeping the face on the same side.
  const visited = new Set();
  const faces = [];
  for (const n of nodeList) {
    for (const h0 of n.adj) {
      const k0 = n.id + '>' + h0.to.id + '#' + h0.e.id;
      if (visited.has(k0)) continue;
      const loop = [];
      let from = n, h = h0, guard = 0;
      while (guard++ < 2000) {
        const key = from.id + '>' + h.to.id + '#' + h.e.id;
        if (visited.has(key)) break;
        visited.add(key);
        loop.push({ node: from, e: h.e });
        const v = h.to;
        // Arriving at v from `from`: take the next edge clockwise from the way back.
        const back = v.adj.findIndex((q) => q.to === from && q.e === h.e);
        const next = v.adj[(back - 1 + v.adj.length) % v.adj.length];
        from = v; h = next;
      }
      if (loop.length >= 3) faces.push(loop);
    }
  }
  return { roads, nodes: nodeList, edges, faces };
}

// ---------- blocks ----------
// Inset a polygon with per-edge distances. poly: [[x,z]...] (any winding); d[i] for edge i->i+1.
export function insetPolygon(poly, d) {
  const n = poly.length;
  const sgn = Math.sign(polyArea(poly)) || 1;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % n];
    const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz) || 1;
    // Inward normal: for positive (x right, z down) area, inside is to the right of travel.
    const nx = (-dz / l) * sgn, nz = (dx / l) * sgn;
    lines.push({ px: x1 + nx * d[i], pz: z1 + nz * d[i], dx: dx / l, dz: dz / l, nx, nz });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const A = lines[(i - 1 + n) % n], Bl = lines[i];
    const den = A.dx * Bl.dz - A.dz * Bl.dx;
    if (Math.abs(den) < 0.08) { out.push([Bl.px, Bl.pz]); continue; } // nearly straight: no mitre needed
    const t = ((Bl.px - A.px) * Bl.dz - (Bl.pz - A.pz) * Bl.dx) / den;
    let x = A.px + A.dx * t, z = A.pz + A.dz * t;
    // Clamp spiky mitres at very sharp corners.
    const ox = poly[i][0], oz = poly[i][1], md = Math.max(d[i], d[(i - 1 + n) % n]) * 3 + 2;
    const m = Math.hypot(x - ox, z - oz);
    if (m > md) { x = ox + ((x - ox) / m) * md; z = oz + ((z - oz) / m) * md; }
    out.push([x, z]);
  }
  // Reject if any edge flipped direction or the winding changed.
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], p = out[i], q = out[(i + 1) % n];
    if ((b[0] - a[0]) * (q[0] - p[0]) + (b[1] - a[1]) * (q[1] - p[1]) <= 0) return null;
  }
  if (Math.sign(polyArea(out)) !== sgn || Math.abs(polyArea(out)) < 40) return null;
  return out;
}

// Drop vertices on (nearly) straight runs where both sides are the same road width.
export function simplifyLoop(loop) {
  let pts = loop.map((h) => ({ x: h.node.x, z: h.node.z, w: h.e.r.boundary ? 0 : h.e.r.width, e: h.e, node: h.node }));
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const a1 = Math.atan2(b.z - a.z, b.x - a.x), a2 = Math.atan2(c.z - b.z, c.x - b.x);
      let da = Math.abs(a2 - a1); if (da > Math.PI) da = 2 * Math.PI - da;
      if (da < 0.1 && Math.abs(a.w - b.w) < 0.1) { pts.splice(i, 1); changed = true; }
    }
  }
  return pts;
}
