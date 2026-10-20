// GPS: a waypoint set on the big map, and the shortest route to it along the road network,
// recalculated when you stray from it. Drawn on the minimap and the big map.
import { planNodes } from './route.js';

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

  // Shortest route, entering and leaving the network at the nearest points on the nearest roads.
  plan(x, z, tx, tz) {
    const r = planNodes(this.layout, x, z, tx, tz);
    if (!r) return [[x, z], [tx, tz]];
    const proj = (h) => [h.e.a.x + (h.e.b.x - h.e.a.x) * h.t, h.e.a.z + (h.e.b.z - h.e.a.z) * h.t];
    const ps = proj(r.hs), pt = proj(r.ht);
    if (r.hs.e === r.ht.e) return [[x, z], ps, pt, [tx, tz]];
    return [[x, z], ps, ...r.nodes.map((n) => [n.x, n.z]), pt, [tx, tz]];
  }
}
