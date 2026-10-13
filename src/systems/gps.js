// GPS: a waypoint set on the big map, and the shortest route to it along the road network,
// recalculated when you stray from it. Drawn on the minimap and the big map.

export class GPS {
  constructor(layout) {
    this.layout = layout;
    this.target = null; // {x, z}
    this.route = null; // [[x, z], ...] from you to the waypoint
    this.length = 0;
    this.recalcT = 0;
  }

  set(x, z) { this.target = { x, z }; this.route = null; this.recalcT = 0; }
  clear() { this.target = null; this.route = null; }

  // Returns 'arrived' when you reach the waypoint (which then clears).
  update(dt, x, z) {
    if (!this.target) return null;
    if (Math.hypot(this.target.x - x, this.target.z - z) < 25) { this.clear(); return 'arrived'; }
    this.recalcT -= dt;
    if (!this.route || this.recalcT <= 0 || (this.recalcT < 1.5 && this.offRoute(x, z) > 30)) {
      this.route = this.plan(x, z, this.target.x, this.target.z);
      this.recalcT = 3;
    } else if (this.route.length > 1) {
      // Keep the line starting at you: drop route points you've passed.
      this.route[0] = [x, z];
      while (this.route.length > 2 && Math.hypot(this.route[1][0] - x, this.route[1][1] - z) < 12) this.route.splice(1, 1);
    }
    this.length = 0;
    for (let i = 1; i < this.route.length; i++) this.length += Math.hypot(this.route[i][0] - this.route[i - 1][0], this.route[i][1] - this.route[i - 1][1]);
    return null;
  }

  // Distance from (x, z) to the current route line.
  offRoute(x, z) {
    let best = Infinity;
    const R = this.route;
    for (let i = 1; i < R.length; i++) {
      const [ax, az] = R[i - 1], [bx, bz] = R[i];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
    }
    return best;
  }

  // A* over junctions, entering and leaving the network at the nearest points on the nearest roads.
  plan(x, z, tx, tz) {
    const L = this.layout;
    const hs = L.edgeAt(x, z), ht = L.edgeAt(tx, tz);
    if (!hs || !ht) return [[x, z], [tx, tz]];
    const proj = (h) => [h.e.a.x + (h.e.b.x - h.e.a.x) * h.t, h.e.a.z + (h.e.b.z - h.e.a.z) * h.t];
    const ps = proj(hs), pt = proj(ht);
    if (hs.e === ht.e) return [[x, z], ps, pt, [tx, tz]];
    const heur = (n) => Math.hypot(n.x - pt[0], n.z - pt[1]);
    const g = new Map(), prev = new Map(), done = new Set();
    const heap = new Heap();
    const open = (n, cost, from) => {
      if (cost >= (g.get(n) ?? Infinity)) return;
      g.set(n, cost); prev.set(n, from);
      heap.push(cost + heur(n), n);
    };
    open(hs.e.a, hs.t * hs.e.len, null);
    open(hs.e.b, (1 - hs.t) * hs.e.len, null);
    const goalCost = new Map([[ht.e.a, ht.t * ht.e.len], [ht.e.b, (1 - ht.t) * ht.e.len]]);
    let best = null, bestCost = Infinity;
    while (heap.size) {
      const n = heap.pop();
      if (done.has(n)) continue;
      done.add(n);
      const c = g.get(n);
      if (c + heur(n) >= bestCost) break;
      if (goalCost.has(n) && c + goalCost.get(n) < bestCost) { bestCost = c + goalCost.get(n); best = n; }
      for (const h of n.adj) {
        const m = h.e.a === n ? h.e.b : h.e.a;
        if (!done.has(m)) open(m, c + h.e.len, n);
      }
    }
    if (!best) return [[x, z], [tx, tz]];
    const nodes = [];
    for (let n = best; n; n = prev.get(n)) nodes.push([n.x, n.z]);
    nodes.reverse();
    return [[x, z], ps, ...nodes, pt, [tx, tz]];
  }
}

// Minimal binary min-heap of (priority, item).
class Heap {
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
