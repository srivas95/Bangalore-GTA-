// Arc-length parametrised polyline in the ground plane, for trains and anything else that
// follows a route.
export class Path {
  constructor(pts) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.length = this.cum[this.cum.length - 1];
  }

  segAt(s) {
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    return lo;
  }

  // Position and unit direction at distance s (clamped to the ends).
  at(s, out = {}) {
    s = Math.max(0, Math.min(this.length, s));
    const i = Math.min(this.segAt(s), this.pts.length - 2);
    const [ax, az] = this.pts[i], [bx, bz] = this.pts[i + 1];
    const l = this.cum[i + 1] - this.cum[i] || 1, t = (s - this.cum[i]) / l;
    out.x = ax + (bx - ax) * t; out.z = az + (bz - az) * t;
    out.dx = (bx - ax) / l; out.dz = (bz - az) / l;
    out.i = i;
    return out;
  }

  // Closest point: {s, d}.
  project(x, z) {
    let best = { s: 0, d: Infinity };
    for (let i = 0; i < this.pts.length - 1; i++) {
      const [ax, az] = this.pts[i], [bx, bz] = this.pts[i + 1];
      const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / l2));
      const d = Math.hypot(ax + abx * t - x, az + abz * t - z);
      if (d < best.d) best = { s: this.cum[i] + t * Math.sqrt(l2), d };
    }
    return best;
  }
}

// Distance from a point to a polyline.
export function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / l2));
    best = Math.min(best, Math.hypot(ax + abx * t - x, az + abz * t - z));
  }
  return best;
}
