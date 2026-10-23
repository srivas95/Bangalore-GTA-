// Derived map data on the real road network: junctions (with corner geometry), directed traffic
// edges, polygon city blocks, underpasses, flyovers, the railway, and spatial queries.
import { buildRoadNet, insetPolygon, simplifyLoop, polyArea, pointInPoly, LANE_W, SIDEWALK_W } from './roadnet.js';
import * as MD from './mapdata.js';
import { CURB_H, UNDERPASS } from '../config.js';

const FLY_CELL = 40;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const RASTER = 4;

export class Layout {
  constructor() {
    let seed = 1203;
    this.rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.world = MD.WORLD;
    this.floors = [];
    const avoid = [...MD.PARKS.map((p) => p.poly), ...MD.LAKES.map((l) => l.poly), MD.AIRPORT.poly];
    const net = buildRoadNet({ world: this.world, arterials: MD.ARTERIALS, avoid, rng: this.rng, spacing: 150, urban: MD.URBAN, ruralSpacing: 650 });
    this.net = net;
    this.roads = net.roads.filter((r) => !r.boundary);
    this.buildGraph(net);
    this.buildBlocks(net);
    this.buildFeatures();
    this.buildIndex();
  }

  findRoad(name) { return this.roads.find((r) => r.name === name); }
  roadName(r) { return r.name; }
  laneOffset(road, lane) { return (road.median || 0) / 2 + (lane + 0.5) * LANE_W; }

  // ---------- junctions and traffic edges ----------
  buildGraph(net) {
    this.nodes = net.nodes;
    for (const n of this.nodes) {
      n.adj = n.adj.filter((h) => !h.e.r.boundary).map((h) => {
        const dx = h.to.x - n.x, dz = h.to.z - n.z, l = Math.hypot(dx, dz) || 1;
        return { ...h, u: { x: dx / l, z: dz / l }, w: h.e.r.width / 2 };
      });
      n.out = [];
      n.cut = new Map();
      n.corners = [];
    }
    this.nodes = this.nodes.filter((n) => n.adj.length > 0);
    this.nodes.forEach((n, i) => { n.id = i; });
    // Corner points between neighbouring roads, and how far back each road must stop.
    for (const n of this.nodes) {
      const k = n.adj.length;
      const need = new Array(k).fill(0);
      for (let i = 0; i < k; i++) {
        const A = n.adj[i], Bh = n.adj[(i + 1) % k];
        if (k === 1) break;
        let gap = Math.atan2(Bh.u.z, Bh.u.x) - Math.atan2(A.u.z, A.u.x);
        while (gap <= 0) gap += Math.PI * 2;
        const pa = { x: -A.u.z, z: A.u.x }, pb = { x: Bh.u.z, z: -Bh.u.x }; // kerb sides facing each other
        let s = 0, t = 0, cx, cz;
        if (gap < Math.PI * 0.94 || k === 2) {
          // Solve n + uA s + pa wA = n + uB t + pb wB.
          const rx = pb.x * Bh.w - pa.x * A.w, rz = pb.z * Bh.w - pa.z * A.w;
          const det = A.u.x * -Bh.u.z - A.u.z * -Bh.u.x;
          if (Math.abs(det) > 0.05) {
            s = (rx * -Bh.u.z - rz * -Bh.u.x) / det;
            t = (A.u.x * rz - A.u.z * rx) / det;
          }
        }
        s = Math.max(0, Math.min(60, s)); t = Math.max(0, Math.min(60, t));
        cx = n.x + A.u.x * s + pa.x * A.w; cz = n.z + A.u.z * s + pa.z * A.w;
        if (gap >= Math.PI * 0.94 && k > 2) { cx = n.x + pa.x * A.w; cz = n.z + pa.z * A.w; }
        n.corners.push({ x: cx, z: cz, a: i, b: (i + 1) % k, gap, s, t });
        need[i] = Math.max(need[i], s); need[(i + 1) % k] = Math.max(need[(i + 1) % k], t);
      }
      // A gentle bend with two roads is a "through" node: the carriageways just meet.
      let straight = false;
      if (k === 2) {
        const d = Math.acos(Math.max(-1, Math.min(1, n.adj[0].u.x * n.adj[1].u.x + n.adj[0].u.z * n.adj[1].u.z)));
        straight = d > Math.PI - 0.45 && Math.abs(n.adj[0].w - n.adj[1].w) < 0.1;
      }
      n.through = straight || k === 1;
      n.adj.forEach((h, i) => {
        const cut = n.through ? 0 : Math.min(need[i] + 1.5, h.e.len * 0.42);
        n.cut.set(h.e.id, Math.max(n.through ? 0 : Math.min(h.e.len * 0.42, Math.max(...n.adj.map((q) => q.w)) * 0.8), cut));
      });
      // Signals where arterials meet (a side street joining an arterial just merges).
      const arts = n.adj.filter((h) => !h.e.r.grid);
      n.signal = !n.through && k >= 3 && (new Set(arts.map((h) => h.e.r.name)).size >= 2 || arts.length >= 3);
    }
    for (const [name, lat, lon] of MD.JUNCTION_NAMES) {
      const [x, z] = MD.geo(lat, lon);
      let best = null, bd = 70;
      for (const n of this.nodes) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd && !n.through) { bd = d; best = n; } }
      if (best) { best.name = name; if (best.adj.length >= 3) best.signal = true; }
    }
    // Directed edges for traffic.
    this.edges = [];
    for (const e of net.edges) {
      if (e.r.boundary || !this.nodes.includes(e.a) || !this.nodes.includes(e.b)) continue;
      const mk = (from, to) => {
        const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
        const d = { id: this.edges.length, from, to, road: e.r, und: e, dir: { x: dx / l, z: dz / l }, len: l, cutFrom: from.cut.get(e.id) || 0, cutTo: to.cut.get(e.id) || 0 };
        this.edges.push(d);
        from.out.push(d);
        return d;
      };
      const ab = mk(e.a, e.b), ba = mk(e.b, e.a);
      ab.rev = ba; ba.rev = ab;
      e.dirs = [ab, ba];
    }
    this.undirected = net.edges.filter((e) => e.dirs);
  }

  // The kerb corner points where edge `e` meets node `n`: [left, right] seen leaving the node.
  edgeEnd(n, e) {
    const i = n.adj.findIndex((h) => h.e === e);
    const h = n.adj[i];
    const cut = n.cut.get(e.id) || 0;
    const p = { x: -h.u.z, z: h.u.x };
    if (n.through && n.adj.length === 2) {
      const cA = n.corners[i], cB = n.corners[(i - 1 + n.adj.length) % n.adj.length];
      return [[cA.x, cA.z], [cB.x, cB.z]];
    }
    return [[n.x + h.u.x * cut + p.x * h.w, n.z + h.u.z * cut + p.z * h.w], [n.x + h.u.x * cut - p.x * h.w, n.z + h.u.z * cut - p.z * h.w]];
  }

  // ---------- city blocks ----------
  buildBlocks(net) {
    const areas = net.faces.map((f) => polyArea(f.map((h) => [h.node.x, h.node.z])));
    let outer = 0;
    areas.forEach((a, i) => { if (Math.abs(a) > Math.abs(areas[outer])) outer = i; });
    const sign = -Math.sign(areas[outer]);
    this.blocks = [];
    this.islands = [];
    const W = this.world;
    net.faces.forEach((f, i) => {
      if (i === outer || Math.sign(areas[i]) !== sign) return;
      const pts = simplifyLoop(f);
      const poly = pts.map((p) => [p.x, p.z]);
      const out = insetPolygon(poly, pts.map((p) => p.w / 2));
      if (!out) return;
      const inner = insetPolygon(out, pts.map((p) => (p.w ? SIDEWALK_W : 0)));
      let cx = 0, cz = 0;
      for (const [x, z] of out) { cx += x; cz += z; }
      cx /= out.length; cz /= out.length;
      const xs = out.map((p) => p[0]), zs = out.map((p) => p[1]);
      const bbox = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
      const block = {
        id: this.blocks.length, poly: out, innerPoly: inner, edgeWidths: pts.map((p) => p.w), roadPoly: poly,
        cx, cz, bbox, area: Math.abs(polyArea(out)),
        edge: pts.some((p) => p.w === 0) || bbox.minX < W.minX + 1 || bbox.maxX > W.maxX - 1 || bbox.minZ < W.minZ + 1 || bbox.maxZ > W.maxZ - 1,
      };
      if (!inner || block.area < 600) { block.island = true; this.islands.push(block); return; }
      Object.assign(block, this.blockInfo(block));
      // Axis-aligned rectangle inside the block, for landmarks and other square layouts.
      block.inner = this.innerRect(inner, cx, cz);
      block.outer = bbox;
      this.blocks.push(block);
    });
    this.assignSpecials();
  }

  // Landmarks go in the block at their real location, or the nearest one big enough to hold them.
  assignSpecials() {
    const NEED = { vidhanaSoudha: [104, 84], highCourt: [80, 40], stadium: [60, 60], iskcon: [74, 60], wtc: [66, 46], ibcPlatinumCity: [100, 100],
      forumMall: [80, 80], silkBoardOffice: [70, 34], cathedral: [46, 26], skyTower: [36, 36], busStand: [100, 60], airport: [600, 380], itpl: [90, 90],
      tipuPalace: [48, 40], bullTemple: [26, 40], shivaTemple: [30, 34], planetarium: [32, 34], infosys: [120, 96], halMuseum: [120, 100] };
    const fits = (b, s) => { const [nw, nd] = NEED[s.landmark] || [30, 30]; return !b.special && b.zone !== 'park' && b.zone !== 'lake' && b.inner.maxX - b.inner.minX >= nw && b.inner.maxZ - b.inner.minZ >= nd; };
    const put = (b, s) => { const { at, ...rest } = s; Object.assign(b, rest, { special: true }); };
    // First the ones whose own block can hold them, then the rest go to the nearest that can.
    const rest = [];
    for (const s of MD.SPECIAL_BLOCKS) {
      if (s.landmark === 'airport') {
        // The airport takes its whole fenced site, whatever shape the block around it is.
        const b = this.blocks.find((q) => pointInPoly(s.at[0], s.at[1], q.poly));
        if (!b) continue;
        put(b, s);
        const [[x0, z0], , [x1, z1]] = MD.AIRPORT.poly;
        b.inner = { minX: x0 + 20, maxX: x1 - 20, minZ: Math.max(this.world.minZ + 20, z0 + 20), maxZ: z1 - 20 };
        b.airportSite = true;
        continue;
      }
      const b = this.blocks.find((q) => pointInPoly(s.at[0], s.at[1], q.poly));
      if (b && fits(b, s)) put(b, s); else rest.push(s);
    }
    for (const s of rest) {
      let best = null, bd = 380;
      for (const b of this.blocks) {
        if (!fits(b, s)) continue;
        const d = Math.hypot(b.cx - s.at[0], b.cz - s.at[1]);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) put(best, s);
    }
  }

  blockInfo(b) {
    for (const p of MD.PARKS) if (pointInPoly(b.cx, b.cz, p.poly)) return { zone: 'park', district: p.name, park: p };
    for (const l of MD.LAKES) if (pointInPoly(b.cx, b.cz, l.poly)) return { zone: 'lake', district: l.name, lakeName: l.name, lake: l };
    // Countryside outside the built-up areas.
    const urban = MD.URBAN.some((p) => pointInPoly(b.cx, b.cz, p));
    const list = urban ? MD.DISTRICTS : MD.RURAL_DISTRICTS;
    let best = list[0], bd = Infinity;
    for (const d of list) { const dd = Math.hypot(d.x - b.cx, d.z - b.cz); if (dd < bd) { bd = dd; best = d; } }
    return { zone: best.zone, district: best.name, pubs: !!best.pubs };
  }

  // The largest axis-aligned rectangle (with the block's aspect) found around a few centres.
  innerRect(poly, cx, cz) {
    const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const hw0 = (maxX - minX) / 2, hd0 = (maxZ - minZ) / 2;
    const fit = (ox, oz) => {
      const ok = (k) => {
        const hw = hw0 * k, hd = hd0 * k;
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]]) if (!pointInPoly(ox + sx * hw, oz + sz * hd, poly)) return false;
        return true;
      };
      let lo = 0, hi = 1;
      for (let it = 0; it < 12; it++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
      return lo;
    };
    let best = { k: fit(cx, cz), x: cx, z: cz };
    // Concave blocks: try other centres on a coarse grid.
    if (best.k < 0.45 && poly.length > 4) {
      for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
        const ox = minX + ((maxX - minX) * i) / 6, oz = minZ + ((maxZ - minZ) * j) / 6;
        if (!pointInPoly(ox, oz, poly)) continue;
        const k = fit(ox, oz);
        if (k > best.k) best = { k, x: ox, z: oz };
      }
    }
    return { minX: best.x - hw0 * best.k, maxX: best.x + hw0 * best.k, minZ: best.z - hd0 * best.k, maxZ: best.z + hd0 * best.k };
  }

  // ---------- underpasses, flyovers, railway ----------
  buildFeatures() {
    this.underpasses = [];
    this.levelCrossings = [];
    this.rails = MD.RAIL_LINES.map((l) => ({ ...l, pts: this.clearOfRoads(l.pts) }));
    const addUnderpass = (e, t, type, name) => {
      const ax = e.a.x, az = e.a.z;
      const dx = (e.b.x - ax) / e.len, dz = (e.b.z - az) / e.len;
      const at = t * e.len;
      const room = Math.min(at - (e.a.cut?.get(e.id) || 0), e.len - at - (e.b.cut?.get(e.id) || 0));
      const half = Math.min(UNDERPASS.half, room - 4);
      if (half < 32) return null;
      const u = { edge: e, road: e.r, type, name, at, half, depth: UNDERPASS.depth, flat: UNDERPASS.flat, waterLevel: -UNDERPASS.depth - 0.5,
        cx: ax + dx * at, cz: az + dz * at, ux: dx, uz: dz, hw: e.r.width / 2 };
      (e.underpasses || (e.underpasses = [])).push(u);
      this.underpasses.push(u);
      return u;
    };
    // Where roads cross the railway: an underpass if there's room, else a level crossing.
    for (const rail of this.rails) {
      for (let i = 0; i < rail.pts.length - 1; i++) {
        const [p, q] = [rail.pts[i], rail.pts[i + 1]];
        for (const e of this.undirected) {
          const r = segX([e.a.x, e.a.z], [e.b.x, e.b.z], p, q);
          if (!r) continue;
          const u = addUnderpass(e, r[0], 'rail', `${e.r.name} Railway Underpass`);
          if (u) { u.railDir = { x: q[0] - p[0], z: q[1] - p[1] }; continue; }
          this.levelCrossings.push({ edge: e, x: e.a.x + (e.b.x - e.a.x) * r[0], z: e.a.z + (e.b.z - e.a.z) * r[0], rail });
        }
      }
    }
    for (const ru of MD.ROAD_UNDERPASSES) {
      let best = null, bd = 140;
      for (const e of this.undirected) {
        if (e.r.name !== ru.road) continue;
        const t = projT(ru.near[0], ru.near[1], e);
        const d = Math.hypot(e.a.x + (e.b.x - e.a.x) * t - ru.near[0], e.a.z + (e.b.z - e.a.z) * t - ru.near[1]);
        if (d < bd && !e.underpasses) { bd = d; best = { e, t: Math.max(0.3, Math.min(0.7, t)) }; }
      }
      if (best) addUnderpass(best.e, best.t, 'road', ru.name);
    }
    this.flyovers = [];
    this.flyCells = new Map();
    this.ramps = [];
    for (const fs of MD.FLYOVER_SITES) this.addFlyover(fs);
  }

  // A flyover is a chain of road edges along `fs.roads` whose inner `fs.lanes` lanes each way run
  // on a deck: up a ramp inside the chain's first edge, level over every junction in between, and
  // down inside the last edge, so no ramp ever spans a junction. A junction flyover (`at`) reaches
  // out each way until an edge has room for its ramp; an elevated road runs from the junction
  // nearest `from` to the one nearest `to`.
  addFlyover(fs) {
    const roads = new Set(fs.roads);
    const cutOf = (n, e) => n.cut.get(e.id) || 0;
    const room = (n, h) => h.e.len - cutOf(n, h.e) - cutOf(h.to, h.e) - 7; // ramp length an edge can take
    const onward = (n, u, prev) => {
      let best = null, bd = 0.5;
      for (const h of n.adj) { if (h.e === prev || !roads.has(h.e.r.name)) continue; const d = h.u.x * u.x + h.u.z * u.z; if (d > bd) { bd = d; best = h; } }
      return best;
    };
    const nodeNear = (p, junction) => {
      let best = null, bd = 90;
      for (const n of this.nodes) {
        const d = Math.hypot(n.x - p[0], n.z - p[1]);
        if (d < bd && (!junction || n.adj.length >= 3) && n.adj.some((h) => roads.has(h.e.r.name))) { bd = d; best = n; }
      }
      return best;
    };
    let nodes;
    if (fs.at) {
      const c = nodeNear(fs.at, true);
      if (!c) return null;
      const along = c.adj.filter((h) => roads.has(h.e.r.name));
      let pair = null, pd = -0.3;
      for (const a of along) for (const b of along) { const d = -(a.u.x * b.u.x + a.u.z * b.u.z); if (a !== b && d > pd) { pd = d; pair = [a, b]; } }
      if (!pair) return null;
      const walk = (h) => {
        const out = [];
        let n = c;
        for (let k = 0; k < 12 && h; k++) {
          out.push(h.to);
          if (room(n, h) >= 60) return out;
          const prev = h.e; n = h.to; h = onward(n, h.u, prev);
        }
        return null;
      };
      const back = walk(pair[0]), fwd = walk(pair[1]);
      if (!back || !fwd) return null;
      nodes = [...back.reverse(), c, ...fwd];
    } else {
      const S = nodeNear(fs.from), E = nodeNear(fs.to);
      if (!S || !E) return null;
      nodes = [S];
      let n = S, prev = null, u = { x: E.x - S.x, z: E.z - S.z };
      const l = Math.hypot(u.x, u.z); u = { x: u.x / l, z: u.z / l };
      for (let k = 0; k < 80 && n !== E; k++) {
        const h = onward(n, u, prev);
        if (!h) return null;
        nodes.push(h.to); prev = h.e; n = h.to; u = h.u;
      }
      if (n !== E) return null;
    }
    const k = nodes.length - 1;
    const edges = [];
    for (let i = 0; i < k; i++) edges.push(nodes[i].adj.find((h) => h.to === nodes[i + 1]).e);
    const first = nodes[0].adj.find((h) => h.e === edges[0]), last = nodes[k - 1].adj.find((h) => h.e === edges[k - 1]);
    const rampA = Math.min(fs.ramp || 100, room(nodes[0], first)), rampB = Math.min(fs.ramp || 100, room(nodes[k - 1], last));
    if (rampA < 50 || rampB < 50) return null;
    // The deck is level from just outside the first and last junctions it passes over.
    const inA = cutOf(nodes[1], edges[0]) + 3, inB = cutOf(nodes[k - 1], edges[k - 1]) + 3;
    const towards = (n, m, d) => { const l = Math.hypot(m.x - n.x, m.z - n.z); return { x: n.x + ((m.x - n.x) / l) * d, z: n.z + ((m.z - n.z) / l) * d }; };
    const pts = [towards(nodes[1], nodes[0], inA + rampA), ...nodes.slice(1, k).map((n) => ({ x: n.x, z: n.z })), towards(nodes[k - 1], nodes[k], inB + rampB)];
    const cum = [0], seg = [];
    for (let i = 1; i < pts.length; i++) { seg.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); cum.push(cum[i - 1] + seg[i - 1]); }
    const median = Math.max(...edges.map((e) => e.r.median || 0));
    const f = {
      name: fs.name, lanes: fs.lanes || 1, height: fs.height, rampA, rampB, pts, cum, seg, len: cum[cum.length - 1],
      nodes, edges, median, hw: median / 2 + (fs.lanes || 1) * LANE_W, gaps: [], gantries: fs.gantries || [],
    };
    // Which stretch of each edge the deck covers (the medians stop there), and the way on for traffic up top.
    edges.forEach((e, i) => {
      const a = e.a === nodes[i];
      let t0 = -1, t1 = e.len + 1;
      if (i === 0) { const d = e.len - inA - rampA; if (a) t0 = d; else t1 = e.len - d; }
      if (i === k - 1) { const d = inB + rampB; if (a) t1 = d; else t0 = e.len - d; }
      (e.flyCuts || (e.flyCuts = [])).push([t0, t1]);
      const fwd = e.dirs.find((d) => d.from === nodes[i]);
      fwd.flyover = fwd.rev.flyover = f;
      if (i > 0) { const pf = edges[i - 1].dirs.find((d) => d.to === nodes[i]); pf.flyNext = fwd; fwd.rev.flyNext = pf.rev; }
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], r = f.hw + 2;
      for (let cx = Math.floor((Math.min(p.x, q.x) - r) / FLY_CELL); cx <= Math.floor((Math.max(p.x, q.x) + r) / FLY_CELL); cx++) {
        for (let cz = Math.floor((Math.min(p.z, q.z) - r) / FLY_CELL); cz <= Math.floor((Math.max(p.z, q.z) + r) / FLY_CELL); cz++) {
          const key = cx * 73856093 ^ cz * 19349663;
          let l = this.flyCells.get(key);
          if (!l) this.flyCells.set(key, (l = []));
          l.push(f, i);
        }
      }
    }
    this.flyovers.push(f);
    for (const lp of fs.loops || []) this.addLoop(f, lp);
    return f;
  }

  // A slip road curling up from a crossing road onto the deck (Hebbal's newest loops). It leaves
  // that road's kerb lane `lp.out` metres from the junction and runs alongside the deck for its
  // last `lp.merge` metres, where the deck's parapet opens. Traffic keeps out of that kerb lane.
  addLoop(f, lp) {
    let hub = null, bd = 120;
    for (const n of f.nodes) { const d = Math.hypot(n.x - lp.hub[0], n.z - lp.hub[1]); if (d < bd) { bd = d; hub = n; } }
    if (!hub) return;
    const i = f.nodes.indexOf(hub);
    const side = hub.adj.filter((h) => h.e.r.name === lp.road).sort((p, q) => (q.u.x * lp.dir[0] + q.u.z * lp.dir[1]) - (p.u.x * lp.dir[0] + p.u.z * lp.dir[1]))[0];
    const toward = lp.onto === 'back' ? f.nodes[i - 1] : f.nodes[i + 1];
    const arm = toward && hub.adj.find((h) => h.to === toward);
    if (!side || !arm) return;
    const lft = (t) => ({ x: t.z, z: -t.x }); // the kerb side of a carriageway heading along t
    const t0 = { x: -side.u.x, z: -side.u.z }, t1 = arm.u;
    const w0 = this.laneOffset(side.e.r, side.e.r.lanes - 1), hw = 4, w1 = f.hw + hw;
    const P0 = { x: hub.x + side.u.x * lp.out + lft(t0).x * w0, z: hub.z + side.u.z * lp.out + lft(t0).z * w0 };
    const R = lp.out - w1;
    const P1 = { x: hub.x + t1.x * (R + w0) + lft(t1).x * w1, z: hub.z + t1.z * (R + w0) + lft(t1).z * w1 };
    const kk = 0.5523 * R;
    const C0 = { x: P0.x + t0.x * kk, z: P0.z + t0.z * kk }, C1 = { x: P1.x - t1.x * kk, z: P1.z - t1.z * kk };
    const pts = [];
    for (let j = 0; j <= 36; j++) {
      const t = j / 36, u = 1 - t;
      pts.push({ x: u * u * u * P0.x + 3 * u * u * t * C0.x + 3 * u * t * t * C1.x + t * t * t * P1.x, z: u * u * u * P0.z + 3 * u * u * t * C0.z + 3 * u * t * t * C1.z + t * t * t * P1.z });
    }
    const curve = pts.length;
    for (let j = 1; j <= 6; j++) pts.push({ x: P1.x + t1.x * (lp.merge * j) / 6, z: P1.z + t1.z * (lp.merge * j) / 6 });
    // Main-deck distance along at a point beside it.
    const sOn = (p) => { let best = 0, b2 = Infinity; for (let j = 0; j < f.pts.length - 1; j++) { const a = f.pts[j], q = f.pts[j + 1], L = f.seg[j]; const t = Math.max(0, Math.min(1, ((p.x - a.x) * (q.x - a.x) + (p.z - a.z) * (q.z - a.z)) / (L * L))); const d = Math.hypot(p.x - a.x - (q.x - a.x) * t, p.z - a.z - (q.z - a.z) * t); if (d < b2) { b2 = d; best = f.cum[j] + t * L; } } return best; };
    const s1 = sOn(P1), s2 = sOn(pts[pts.length - 1]);
    const cum = [0];
    for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j].x - pts[j - 1].x, pts[j].z - pts[j - 1].z));
    const top = this.deckHeight(f, s1);
    pts.forEach((p, j) => { p.y = j < curve ? top * smooth(0, cum[curve - 1], cum[j]) : this.deckHeight(f, sOn(p)); });
    // Which side of the deck it joins, in the deck's own across-axis (see infrastructure.js).
    const j0 = Math.max(0, f.cum.findIndex((c) => c > s1) - 1), a = f.pts[j0], b = f.pts[j0 + 1];
    const ux = (b.x - a.x) / f.seg[j0], uz = (b.z - a.z) / f.seg[j0];
    const sideOn = Math.sign(lft(t1).x * uz - lft(t1).z * ux) || 1;
    f.gaps.push({ s0: Math.min(s1, s2), s1: Math.max(s1, s2), side: sideOn });
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
    const ramp = { name: lp.name, f, pts, cum, hw, curve, sMerge: cum[curve - 1], sEnd: cum[cum.length - 1], minX: Math.min(...xs) - hw, maxX: Math.max(...xs) + hw, minZ: Math.min(...zs) - hw, maxZ: Math.max(...zs) + hw };
    this.ramps.push(ramp);
    side.e.dirs.find((d) => d.to === hub).kerbShut = true;
  }

  // A slip road's two edges at distance s along it, as offsets across it (+ away from the deck it
  // joins): full width up the curve, then tapering into the deck alongside.
  rampEdges(r, s) {
    const t = Math.max(0, Math.min(1, (s - r.sMerge) / (r.sEnd - r.sMerge)));
    return [-r.hw, r.hw - 2 * r.hw * t];
  }

  // Height of a slip road's surface at (x, z), or -Infinity off it.
  rampAt(x, z) {
    let best = -Infinity, bd = Infinity;
    for (const r of this.ramps) {
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      for (let j = 0; j < r.pts.length - 1; j++) {
        const p = r.pts[j], q = r.pts[j + 1], sx = q.x - p.x, sz = q.z - p.z, l2 = sx * sx + sz * sz;
        const t = Math.max(0, Math.min(1, ((x - p.x) * sx + (z - p.z) * sz) / l2));
        const dx = x - p.x - sx * t, dz = z - p.z - sz * t, d = Math.hypot(dx, dz);
        if (d >= r.hw || d >= bd) continue;
        const lat = (dx * sz - dz * sx) / Math.sqrt(l2), [x0, x1] = this.rampEdges(r, r.cum[j] + t * Math.sqrt(l2));
        if (lat < x0 || lat > x1) continue;
        bd = d; best = p.y + (q.y - p.y) * t;
      }
    }
    return best;
  }

  // A railway alignment eased sideways off any road running alongside it (the real lines hug the
  // Tumkur Road and the roads out to Whitefield), so the track never runs along a carriageway; it
  // still crosses roads where it really does (those meet it at an angle and don't push).
  clearOfRoads(pts0) {
    const pts = [];
    for (let i = 0; i < pts0.length - 1; i++) {
      const [ax, az] = pts0[i], [bx, bz] = pts0[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 12));
      for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    pts.push([...pts0[pts0.length - 1]]);
    const edges = this.undirected;
    for (let iter = 0; iter < 6; iter++) {
      const push = pts.map(() => [0, 0]);
      for (let i = 1; i < pts.length - 1; i++) {
        const [x, z] = pts[i];
        let tx = pts[i + 1][0] - pts[i - 1][0], tz = pts[i + 1][1] - pts[i - 1][1];
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        for (const e of edges) {
          const need = e.r.width / 2 + 9;
          if (x < Math.min(e.a.x, e.b.x) - need || x > Math.max(e.a.x, e.b.x) + need || z < Math.min(e.a.z, e.b.z) - need || z > Math.max(e.a.z, e.b.z) + need) continue;
          const ex = (e.b.x - e.a.x) / e.len, ez = (e.b.z - e.a.z) / e.len;
          if (Math.abs(ex * tx + ez * tz) < 0.82) continue; // crossing, not running alongside
          const t = Math.max(0, Math.min(e.len, (x - e.a.x) * ex + (z - e.a.z) * ez));
          const qx = e.a.x + ex * t, qz = e.a.z + ez * t, d = Math.hypot(x - qx, z - qz);
          if (d >= need) continue;
          let nx = -ez, nz = ex; // away from the road, on whichever side we already are
          if ((x - qx) * nx + (z - qz) * nz < 0) { nx = -nx; nz = -nz; }
          push[i][0] += nx * (need - d); push[i][1] += nz * (need - d);
        }
      }
      for (let i = 1; i < pts.length - 1; i++) { pts[i][0] += push[i][0] * 0.6; pts[i][1] += push[i][1] * 0.6; }
      // Keep the curve smooth (trains take it at speed).
      for (let i = 1; i < pts.length - 1; i++) {
        pts[i][0] += ((pts[i - 1][0] + pts[i + 1][0]) / 2 - pts[i][0]) * 0.35;
        pts[i][1] += ((pts[i - 1][1] + pts[i + 1][1]) / 2 - pts[i][1]) * 0.35;
      }
    }
    return pts;
  }

  // Road surface height inside an underpass, as a function of distance along its road.
  dip(u, along) {
    const t = Math.abs(along) / u.half;
    return -u.depth * (1 - smooth(u.flat, 1, t));
  }

  // Deck height at distance s along a flyover.
  deckHeight(f, s) {
    return f.height * smooth(0, f.rampA, s) * smooth(0, f.rampB, f.len - s);
  }

  local(o, x, z) {
    const dx = x - o.cx, dz = z - o.cz;
    return { along: dx * o.ux + dz * o.uz, lat: -dx * o.uz + dz * o.ux };
  }

  underpassAt(x, z) {
    for (const u of this.underpasses) {
      if (Math.abs(x - u.cx) > u.half + 12 || Math.abs(z - u.cz) > u.half + 12) continue;
      const l = this.local(u, x, z);
      if (Math.abs(l.along) < u.half && Math.abs(l.lat) < u.hw) return u;
    }
    return null;
  }

  // {f, s, d} if (x, z) is under/over a flyover deck: s along it, d from its centre line.
  flyoverAt(x, z) {
    const l = this.flyCells.get(Math.floor(x / FLY_CELL) * 73856093 ^ Math.floor(z / FLY_CELL) * 19349663);
    if (!l) return null;
    let best = null, bd = Infinity;
    for (let k = 0; k < l.length; k += 2) {
      const f = l[k], i = l[k + 1], p = f.pts[i], q = f.pts[i + 1], L = f.seg[i];
      const sx = q.x - p.x, sz = q.z - p.z;
      const t = Math.max(0, Math.min(1, ((x - p.x) * sx + (z - p.z) * sz) / (L * L)));
      const d = Math.hypot(x - p.x - sx * t, z - p.z - sz * t);
      if (d < f.hw && d < bd) { bd = d; best = { f, s: f.cum[i] + t * L, d }; }
    }
    return best;
  }

  // ---------- spatial index ----------
  buildIndex() {
    const W = this.world;
    this.rw = Math.ceil((W.maxX - W.minX) / RASTER); this.rh = Math.ceil((W.maxZ - W.minZ) / RASTER);
    this.raster = new Int32Array(this.rw * this.rh).fill(-1);
    const all = [...this.blocks, ...this.islands];
    this.allBlocks = all;
    all.forEach((b, idx) => {
      const p = b.poly;
      const z0 = Math.max(0, Math.floor((Math.min(...p.map((q) => q[1])) - W.minZ) / RASTER));
      const z1 = Math.min(this.rh - 1, Math.floor((Math.max(...p.map((q) => q[1])) - W.minZ) / RASTER));
      for (let j = z0; j <= z1; j++) {
        const z = W.minZ + (j + 0.5) * RASTER;
        const xsI = [];
        for (let i = 0; i < p.length; i++) {
          const [xa, za] = p[i], [xb, zb] = p[(i + 1) % p.length];
          if ((za > z) !== (zb > z)) xsI.push(xa + ((z - za) / (zb - za)) * (xb - xa));
        }
        xsI.sort((a, c) => a - c);
        for (let k = 0; k + 1 < xsI.length; k += 2) {
          const i0 = Math.max(0, Math.ceil((xsI[k] - W.minX) / RASTER - 0.5)), i1 = Math.min(this.rw - 1, Math.floor((xsI[k + 1] - W.minX) / RASTER - 0.5));
          for (let i = i0; i <= i1; i++) this.raster[j * this.rw + i] = idx;
        }
      }
    });
    // Edges by cell for "which road am I on".
    this.EC = 40;
    this.edgeCells = new Map();
    for (const e of this.undirected) {
      const n = Math.ceil(e.len / 10);
      const keys = new Set();
      for (let k = 0; k <= n; k++) {
        const x = e.a.x + ((e.b.x - e.a.x) * k) / n, z = e.a.z + ((e.b.z - e.a.z) * k) / n;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) keys.add((Math.floor(x / this.EC) + dx) + ',' + (Math.floor(z / this.EC) + dz));
      }
      for (const key of keys) { if (!this.edgeCells.has(key)) this.edgeCells.set(key, []); this.edgeCells.get(key).push(e); }
    }
    this.NC = 80;
    this.nodeCells = new Map();
    for (const n of this.nodes) { const key = Math.floor(n.x / this.NC) + ',' + Math.floor(n.z / this.NC); if (!this.nodeCells.has(key)) this.nodeCells.set(key, []); this.nodeCells.get(key).push(n); }
  }

  blockIndexAt(x, z) {
    const W = this.world;
    const i = Math.floor((x - W.minX) / RASTER), j = Math.floor((z - W.minZ) / RASTER);
    if (i < 0 || j < 0 || i >= this.rw || j >= this.rh) return -1;
    return this.raster[j * this.rw + i];
  }

  // Exact: is (x, z) on a footpath/block (rather than the road)?
  blockContaining(x, z) {
    const W = this.world;
    const i = Math.floor((x - W.minX) / RASTER), j = Math.floor((z - W.minZ) / RASTER);
    const seen = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= this.rw || jj >= this.rh) continue;
      const idx = this.raster[jj * this.rw + ii];
      if (idx < 0 || seen.includes(idx)) continue;
      seen.push(idx);
      if (di === 0 && dj === 0 && this.allBlocks[idx] && interiorCell(this, ii, jj, idx)) return this.allBlocks[idx];
      if (pointInPoly(x, z, this.allBlocks[idx].poly)) return this.allBlocks[idx];
    }
    return null;
  }

  blockAt(x, z) {
    const b = this.blockContaining(x, z);
    if (b && !b.island) return b;
    // On a road: the nearest block in the raster, searching outwards ring by ring.
    const W = this.world;
    const ci = Math.floor((x - W.minX) / RASTER), cj = Math.floor((z - W.minZ) / RASTER);
    for (let r = 0; r <= 24; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= this.rw || j >= this.rh) continue;
        const idx = this.raster[j * this.rw + i];
        if (idx >= 0 && !this.allBlocks[idx].island) return this.allBlocks[idx];
      }
    }
    let best = this.blocks[0], bd = Infinity;
    for (const q of this.blocks) {
      const d = Math.abs(q.cx - x) + Math.abs(q.cz - z);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  edgeAt(x, z) {
    const list = this.edgeCells.get(Math.floor(x / this.EC) + ',' + Math.floor(z / this.EC));
    if (!list) return null;
    let best = null, bd = Infinity;
    for (const e of list) {
      const t = projT(x, z, e);
      const px = e.a.x + (e.b.x - e.a.x) * t, pz = e.a.z + (e.b.z - e.a.z) * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { e, t, d }; }
    }
    return best;
  }

  roadAt(x, z) {
    const h = this.edgeAt(x, z);
    return h && h.d <= h.e.r.width / 2 + 0.5 ? h.e.r : null;
  }

  nearestNode(x, z) {
    const cx = Math.floor(x / this.NC), cz = Math.floor(z / this.NC);
    let best = null, bd = Infinity;
    for (let r = 0; r < 6 && !best; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (const n of this.nodeCells.get((cx + dx) + ',' + (cz + dz)) || []) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
      }
      if (best && r === 0) { /* check the first ring too */ r++; for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const n of this.nodeCells.get((cx + dx) + ',' + (cz + dz)) || []) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } } }
    }
    return best || this.nodes[0];
  }

  junctionNear(x, z, radius = 30) {
    const n = this.nearestNode(x, z);
    return n && n.name && Math.hypot(n.x - x, n.z - z) < radius ? n.name : null;
  }

  // Surface height. Pass the current height `y` to choose between levels on a flyover.
  groundHeight(x, z, y) {
    // Extra floors (the walk-in shop interiors, built off the map).
    for (const f of this.floors) if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) return f.y;
    let g = 0;
    if (this.blockContaining(x, z)) g = CURB_H;
    else {
      const u = this.underpasses.length ? this.underpassAt(x, z) : null;
      if (u) g = this.dip(u, this.local(u, x, z).along);
    }
    if (y !== undefined && this.flyovers.length) {
      const hit = this.flyoverAt(x, z);
      if (hit) {
        const h = this.deckHeight(hit.f, hit.s);
        if (h > 0.02 && y > h - 1.6) g = Math.max(g, h);
      }
      if (this.ramps.length) {
        const h = this.rampAt(x, z);
        if (h > 0.02 && y > h - 1.6) g = Math.max(g, h);
      }
    }
    return g;
  }
}

// A raster cell whose four corners all lie in the same block is safely inside it.
function interiorCell(L, i, j, idx) {
  const at = (ii, jj) => (ii < 0 || jj < 0 || ii >= L.rw || jj >= L.rh ? -1 : L.raster[jj * L.rw + ii]);
  return at(i - 1, j) === idx && at(i + 1, j) === idx && at(i, j - 1) === idx && at(i, j + 1) === idx;
}

function projT(x, z, e) {
  const abx = e.b.x - e.a.x, abz = e.b.z - e.a.z, l2 = abx * abx + abz * abz || 1;
  return Math.max(0, Math.min(1, ((x - e.a.x) * abx + (z - e.a.z) * abz) / l2));
}

function segX(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const qp = [c[0] - a[0], c[1] - a[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}

export { LANE_W, SIDEWALK_W };
