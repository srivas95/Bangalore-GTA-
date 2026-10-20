// Shortest paths over the road network: the GPS line, and the routes that hired autos and BMTC
// buses drive. A* over junctions, entering and leaving the network on the nearest roads.

// Junctions from (x, z) to (tx, tz). `from` forces the start: {node, avoid} sets off from a
// junction without turning back along the undirected edge `avoid` (no U-turns unless it's a dead
// end). Returns {hs, ht, nodes} (hs/ht: the start and target roads from layout.edgeAt) or null.
export function planNodes(layout, x, z, tx, tz, from = null) {
  const hs = from ? null : layout.edgeAt(x, z), ht = layout.edgeAt(tx, tz);
  if ((!from && !hs) || !ht) return null;
  const pt = [ht.e.a.x + (ht.e.b.x - ht.e.a.x) * ht.t, ht.e.a.z + (ht.e.b.z - ht.e.a.z) * ht.t];
  const heur = (n) => Math.hypot(n.x - pt[0], n.z - pt[1]);
  const g = new Map(), prev = new Map(), done = new Set();
  const heap = new Heap();
  const open = (n, cost, p) => {
    if (cost >= (g.get(n) ?? Infinity)) return;
    g.set(n, cost); prev.set(n, p);
    heap.push(cost + heur(n), n);
  };
  if (from) open(from.node, 0, null);
  else {
    open(hs.e.a, hs.t * hs.e.len, null);
    open(hs.e.b, (1 - hs.t) * hs.e.len, null);
  }
  const goalCost = new Map([[ht.e.a, ht.t * ht.e.len], [ht.e.b, (1 - ht.t) * ht.e.len]]);
  let best = null, bestCost = Infinity;
  while (heap.size) {
    const n = heap.pop();
    if (done.has(n)) continue;
    done.add(n);
    const c = g.get(n);
    if (c + heur(n) >= bestCost) break;
    if (goalCost.has(n) && c + goalCost.get(n) < bestCost && !(from && n === from.node && from.avoid === ht.e && n.adj.length > 1)) {
      bestCost = c + goalCost.get(n); best = n;
    }
    for (const h of n.adj) {
      if (from && n === from.node && h.e === from.avoid && n.adj.length > 1) continue;
      const m = h.e.a === n ? h.e.b : h.e.a;
      if (!done.has(m)) open(m, c + h.e.len, n);
    }
  }
  if (!best) return null;
  const nodes = [];
  for (let n = best; n; n = prev.get(n)) nodes.push(n);
  nodes.reverse();
  return { hs, ht, nodes };
}

// The directed traffic edges joining consecutive junctions.
export function nodesToEdges(nodes) {
  const out = [];
  for (let i = 1; i < nodes.length; i++) {
    const d = nodes[i - 1].out.find((e) => e.to === nodes[i]);
    if (!d) return null;
    out.push(d);
  }
  return out;
}

// How far along a directed edge's lane path (which starts `cut` metres in from the junction) a
// point lies, clamped to the drivable part.
export function sAlong(e, x, z) {
  const a = Math.min(e.cutFrom + 1.5, e.len * 0.45), b = Math.min(e.cutTo + 1.5, e.len * 0.45);
  const along = (x - e.from.x) * e.dir.x + (z - e.from.z) * e.dir.z;
  const len = e.len - a - b;
  return Math.max(Math.min(2, len / 2), Math.min(len - 2, along - a));
}

// A driving plan for a vehicle on directed edge `edge` (at distance `s` along its lane path) to
// (tx, tz): the edges to take after this one, and where to stop on the last of them.
export function planDrive(layout, edge, s, tx, tz) {
  const ht = layout.edgeAt(tx, tz);
  if (!ht) return null;
  if (ht.e === edge.und && sAlong(edge, tx, tz) > s + 6) return { route: [], stopEdge: edge, stopS: sAlong(edge, tx, tz) };
  const r = planNodes(layout, 0, 0, tx, tz, { node: edge.to, avoid: edge.und });
  if (!r) return null;
  const route = nodesToEdges(r.nodes);
  if (!route) return null;
  const last = r.nodes[r.nodes.length - 1];
  const fin = last.out.find((e) => e.und === ht.e);
  if (!fin) return null;
  route.push(fin);
  return { route, stopEdge: fin, stopS: sAlong(fin, tx, tz) };
}

// Total length of a route's edges.
export function routeLength(route) { return route.reduce((n, e) => n + e.len, 0); }

// Minimal binary min-heap of (priority, item).
export class Heap {
  constructor() { this.p = []; this.v = []; }
  get size() { return this.v.length; }
  push(p, v) {
    const P = this.p, V = this.v;
    let i = V.length;
    P.push(p); V.push(v);
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (P[j] <= P[i]) break;
      [P[i], P[j]] = [P[j], P[i]]; [V[i], V[j]] = [V[j], V[i]];
      i = j;
    }
  }
  pop() {
    const P = this.p, V = this.v, top = V[0];
    const lp = P.pop(), lv = V.pop();
    if (V.length) {
      P[0] = lp; V[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < V.length && P[l] < P[m]) m = l;
        if (r < V.length && P[r] < P[m]) m = r;
        if (m === i) break;
        [P[i], P[m]] = [P[m], P[i]]; [V[i], V[m]] = [V[m], V[i]];
        i = m;
      }
    }
    return top;
  }
}
