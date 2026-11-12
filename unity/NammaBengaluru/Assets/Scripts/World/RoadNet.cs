// Turns road polylines into a planar road graph and city blocks (port of src/world/roadnet.js).
// 1. Roads: real arterials plus a street grid that fills the neighbourhoods (kept out of parks,
//    lakes and away from arterials running alongside).
// 2. Every crossing becomes a junction node; nearby nodes are merged, dead ends pruned.
// 3. Faces of the planar graph are the city blocks, inset by half the road widths.
// Faithful to the JS, including its orderings (insertion-ordered maps, stable sorts) and its
// in-place point snapping, so the C# city is the same city. No UnityEngine dependency.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace NammaBengaluru.World
{
    public class Road
    {
        public string name;
        public int lanes;
        public double median, width;
        public List<double[]> pts;
        public bool grid, rural, boundary;
        public int id;
    }

    public class Half
    {
        public NetEdge e;
        public NetNode to;
        public double ang;
        public double ux, uz, w; // set by Layout: unit direction and half the road width
    }

    public class Corner { public double x, z, gap, s, t; public int a, b; }

    public class NetNode
    {
        public int id;
        public double x, z;
        public List<Half> adj = new List<Half>();
        // Layout fields.
        public List<DirEdge> outEdges = new List<DirEdge>();
        public Dictionary<int, double> cut = new Dictionary<int, double>();
        public List<Corner> corners = new List<Corner>();
        public bool through, signal;
        public string name;
        // Signals: approach group per undirected edge id, groups, cycle length and phase offset.
        public Dictionary<int, int> sigGroup;
        public int sigN;
        public double cycle, sigOffset;
    }

    public class NetEdge
    {
        public int id;
        public NetNode a, b;
        public Road r;
        public double len;
        public DirEdge[] dirs;
        public List<Underpass> underpasses;
    }

    public struct FaceHalf { public NetNode node; public NetEdge e; }

    public class RoadNetResult
    {
        public List<Road> roads;
        public List<NetNode> nodes;
        public List<NetEdge> edges;
        public List<List<FaceHalf>> faces;
    }

    public class RoadNetConfig
    {
        public Rect2 world, gridWorld;
        public List<RoadDef> arterials;
        public List<List<double[]>> avoid, urban;
        public Func<double> rng;
        public double spacing = 150, ruralSpacing = 650;
    }

    public static class RoadNet
    {
        public const double LANE_W = 3.4, SIDEWALK_W = 4;
        public static double RoadWidth(Road r) => r.boundary ? 0 : r.lanes * 2 * LANE_W + r.median;

        static readonly string[] VILLAGES = { "Kogilu", "Bagalur", "Chokkanahalli", "Hunasamaranahalli", "Bettahalasur", "Doddajala", "Kannur", "Avalahalli", "Mittaganahalli",
            "Budigere", "Bidarahalli", "Kadusonnappanahalli", "Rampura", "Sonnenahalli", "Hirandahalli", "Kattigenahalli", "Shettigere", "Arebinnamangala" };

        static string Ord(int n)
        {
            if (n % 100 >= 11 && n % 100 <= 13) return n + "th";
            string[] s = { "th", "st", "nd", "rd" };
            return n + (n % 10 < 4 ? s[n % 10] : "th");
        }

        public static bool PointInPoly(double x, double z, IList<double[]> poly)
        {
            bool inside = false;
            for (int i = 0, j = poly.Count - 1; i < poly.Count; j = i++)
            {
                double xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
                if ((zi > z) != (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
            }
            return inside;
        }

        public static double PolyArea(IList<double[]> poly)
        {
            double a = 0;
            for (int i = 0; i < poly.Count; i++)
            {
                var p = poly[i]; var q = poly[(i + 1) % poly.Count];
                a += p[0] * q[1] - q[0] * p[1];
            }
            return a / 2;
        }

        static double Hypot(double a, double b) => Math.Sqrt(a * a + b * b);
        static double Or1(double v) => v == 0 || double.IsNaN(v) ? 1 : v; // JS `x || 1`

        static double SegDist(double px, double pz, double ax, double az, double bx, double bz)
        {
            double abx = bx - ax, abz = bz - az, l2 = Or1(abx * abx + abz * abz);
            double t = Math.Max(0, Math.Min(1, ((px - ax) * abx + (pz - az) * abz) / l2));
            return Hypot(ax + abx * t - px, az + abz * t - pz);
        }

        // Proper segment intersection: (t, u) params, or null.
        static double[] Intersect(double[] a, double[] b, double[] c, double[] d)
        {
            double r0 = b[0] - a[0], r1 = b[1] - a[1], s0 = d[0] - c[0], s1 = d[1] - c[1];
            double den = r0 * s1 - r1 * s0;
            if (Math.Abs(den) < 1e-9) return null;
            double q0 = c[0] - a[0], q1 = c[1] - a[1];
            double t = (q0 * s1 - q1 * s0) / den, u = (q0 * r1 - q1 * r0) / den;
            if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
            return new[] { t, u };
        }

        // ---------- the street grid ----------
        struct GridLine { public char axis; public double pos; public int k; }

        static List<Road> MakeGrid(RoadNetConfig cfg, List<RoadDef> arterials, bool rural)
        {
            var world = cfg.world;
            // Lines are laid out from gridWorld (the world as first drawn) and carry on evenly spaced
            // beyond it, so growing the world doesn't move every street in the city.
            var gw = cfg.gridWorld ?? world;
            var urban = cfg.urban;
            Func<double, double, bool> inUrban = (x, z) => urban == null || urban.Any(p => PointInPoly(x, z, p));
            double spacing = rural ? cfg.ruralSpacing : cfg.spacing;
            var lines = new List<GridLine>();
            void AxisLines(char axis)
            {
                double lo = axis == 'x' ? gw.minX : gw.minZ, hi = axis == 'x' ? gw.maxX : gw.maxZ;
                double wlo = axis == 'x' ? world.minX : world.minZ, whi = axis == 'x' ? world.maxX : world.maxZ;
                int k = 0; double p = lo + spacing * 0.55;
                for (; p < hi - 40; p += spacing * (0.88 + cfg.rng() * 0.24)) lines.Add(new GridLine { axis = axis, pos = p, k = k++ });
                for (; p < whi - 40; p += spacing) lines.Add(new GridLine { axis = axis, pos = p, k = k++ });
                for (double q = lo + spacing * 0.55 - spacing; q > wlo + 40; q -= spacing) lines.Add(new GridLine { axis = axis, pos = q, k = k++ });
            }
            AxisLines('x'); AxisLines('z');
            var arts = new List<(double[] a, double[] b)>();
            foreach (var a in arterials) for (int i = 0; i < a.pts.Count - 1; i++) arts.Add((a.pts[i], a.pts[i + 1]));
            var roads = new List<Road>();
            bool Blocked(double x, double z, double dirX, double dirZ)
            {
                // City streets inside the built-up areas; village roads outside them.
                if (urban != null && inUrban(x, z) != !rural) return true;
                foreach (var poly in cfg.avoid) if (PointInPoly(x, z, poly)) return true;
                foreach (var (a, b) in arts)
                {
                    double dx = b[0] - a[0], dz = b[1] - a[1], l = Or1(Hypot(dx, dz));
                    double par = Math.Abs((dx * dirX + dz * dirZ) / l);
                    double d = SegDist(x, z, a[0], a[1], b[0], b[1]);
                    if (par > 0.88 && d < 62) return true; // an arterial runs alongside: don't double it
                    if (d < 9) return true; // don't run along on top of one
                }
                return false;
            }
            foreach (var L in lines)
            {
                double dirX = L.axis == 'x' ? 0 : 1, dirZ = L.axis == 'x' ? 1 : 0;
                double lo = L.axis == 'x' ? world.minZ : world.minX, hi = L.axis == 'x' ? world.maxZ : world.maxX;
                double glo = L.axis == 'x' ? gw.minZ : gw.minX;
                double? start = null;
                double[] P(double t) => L.axis == 'x' ? new[] { L.pos, t } : new[] { t, L.pos };
                void Flush(double end)
                {
                    if (start != null && end - start.Value > (rural ? 200 : 70))
                    {
                        if (rural)
                            roads.Add(new Road { name = VILLAGES[(L.k * 7 + (L.axis == 'x' ? 3 : 0)) % VILLAGES.Length] + " Road", lanes = 1, median = 0, pts = new List<double[]> { P(start.Value), P(end) }, grid = true, rural = true });
                        else
                            roads.Add(new Road { name = Ord(L.k % 24 + 1) + (L.axis == 'x' ? " Main Road" : " Cross Road"), lanes = L.k % 5 == 2 ? 2 : 1, median = 0, pts = new List<double[]> { P(start.Value), P(end) }, grid = true });
                    }
                    start = null;
                }
                // Same 6 m steps as from gridWorld.
                for (double t = glo - Math.Floor((glo - lo) / 6) * 6; t <= hi; t += 6)
                {
                    double x = L.axis == 'x' ? L.pos : t, z = L.axis == 'x' ? t : L.pos;
                    if (Blocked(x, z, dirX, dirZ)) Flush(t - 6); else if (start == null) start = t;
                }
                Flush(hi);
            }
            return roads;
        }

        // ---------- graph ----------
        class Seg { public Road r; public int i; public double[] a, b; public List<(double t, double[] p)> cuts = new List<(double, double[])>(); }
        class Merge { public double xs, zs; public int k; }

        static long CellKey(long x, long z) => (x << 32) ^ (z & 0xffffffffL);
        static string Fx(double v) => v.ToString("F2", CultureInfo.InvariantCulture);

        public static RoadNetResult Build(RoadNetConfig cfg)
        {
            var W = cfg.world;
            var roads = new List<Road>();
            // Arterial copies share their point arrays with the map data, as {...r} does in JS.
            foreach (var r in cfg.arterials) roads.Add(new Road { name = r.name, lanes = r.lanes, median = r.median, pts = r.pts });
            roads.AddRange(MakeGrid(cfg, cfg.arterials, false));
            if (cfg.urban != null) roads.AddRange(MakeGrid(cfg, cfg.arterials, true));
            // World boundary closes the outer blocks.
            roads.Add(new Road { name = "boundary", boundary = true, lanes = 0, median = 0, pts = new List<double[]> { new[] { W.minX, W.minZ }, new[] { W.maxX, W.minZ }, new[] { W.maxX, W.maxZ }, new[] { W.minX, W.maxZ }, new[] { W.minX, W.minZ } } });
            for (int i = 0; i < roads.Count; i++) { roads[i].id = i; roads[i].width = RoadWidth(roads[i]); }

            // Clip polylines to the world rectangle.
            bool InWorld(double[] p) => p[0] >= W.minX - 1 && p[0] <= W.maxX + 1 && p[1] >= W.minZ - 1 && p[1] <= W.maxZ + 1;
            foreach (var r in roads)
            {
                if (r.boundary) continue;
                var outPts = new List<double[]>();
                for (int i = 0; i < r.pts.Count; i++)
                {
                    var p = r.pts[i];
                    if (InWorld(p)) { outPts.Add(p); continue; }
                    // Replace an outside point by the crossing with the boundary from its inside neighbour.
                    double[] q = i > 0 && InWorld(r.pts[i - 1]) ? r.pts[i - 1] : i + 1 < r.pts.Count && InWorld(r.pts[i + 1]) ? r.pts[i + 1] : null;
                    if (q == null) continue;
                    double t = 1;
                    foreach (var (k, lim) in new[] { (0, W.minX), (0, W.maxX), (1, W.minZ), (1, W.maxZ) })
                    {
                        double d = p[k] - q[k];
                        if (Math.Abs(d) < 1e-9) continue;
                        double tt = (lim - q[k]) / d;
                        if (tt > 0 && tt < t) t = tt;
                    }
                    outPts.Add(new[] { q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t });
                }
                r.pts = outPts;
            }

            // Segments and their intersections.
            var segs = new List<Seg>();
            foreach (var r in roads) for (int i = 0; i < r.pts.Count - 1; i++) segs.Add(new Seg { r = r, i = i, a = r.pts[i], b = r.pts[i + 1] });
            const double CELL = 120;
            var hash = new Dictionary<long, List<int>>();
            var hashOrder = new List<long>();
            for (int k = 0; k < segs.Count; k++)
            {
                var s = segs[k];
                long x0 = (long)Math.Floor(Math.Min(s.a[0], s.b[0]) / CELL), x1 = (long)Math.Floor(Math.Max(s.a[0], s.b[0]) / CELL);
                long z0 = (long)Math.Floor(Math.Min(s.a[1], s.b[1]) / CELL), z1 = (long)Math.Floor(Math.Max(s.a[1], s.b[1]) / CELL);
                for (long x = x0; x <= x1; x++) for (long z = z0; z <= z1; z++)
                {
                    long c = CellKey(x, z);
                    if (!hash.TryGetValue(c, out var list)) { hash[c] = list = new List<int>(); hashOrder.Add(c); }
                    list.Add(k);
                }
            }
            var seen = new HashSet<long>();
            foreach (var c in hashOrder)
            {
                var list = hash[c];
                for (int i = 0; i < list.Count; i++) for (int j = i + 1; j < list.Count; j++)
                {
                    var A = segs[list[i]]; var Bs = segs[list[j]];
                    long key = list[i] < list[j] ? (long)list[i] * 1000003L + list[j] : (long)list[j] * 1000003L + list[i];
                    if (!seen.Add(key)) continue;
                    if (A.r == Bs.r && Math.Abs(A.i - Bs.i) <= 1) continue;
                    var hit = Intersect(A.a, A.b, Bs.a, Bs.b);
                    if (hit == null) continue;
                    var p = new[] { A.a[0] + (A.b[0] - A.a[0]) * hit[0], A.a[1] + (A.b[1] - A.a[1]) * hit[0] };
                    A.cuts.Add((hit[0], p)); Bs.cuts.Add((hit[1], p));
                }
            }
            // Near misses: a road ending just short of (or just past) another becomes a T-junction.
            foreach (var r in roads)
            {
                if (r.boundary) continue;
                foreach (var end in new[] { r.pts[0], r.pts[r.pts.Count - 1] })
                {
                    Seg best = null; double bt = 0, bd = 25;
                    foreach (var s in segs)
                    {
                        if (s.r == r) continue;
                        double abx = s.b[0] - s.a[0], abz = s.b[1] - s.a[1], l2 = Or1(abx * abx + abz * abz);
                        double t = Math.Max(0, Math.Min(1, ((end[0] - s.a[0]) * abx + (end[1] - s.a[1]) * abz) / l2));
                        double d = Hypot(s.a[0] + abx * t - end[0], s.a[1] + abz * t - end[1]);
                        if (d < bd) { bd = d; best = s; bt = t; }
                    }
                    if (best != null && bd > 0.01)
                    {
                        var p = new[] { best.a[0] + (best.b[0] - best.a[0]) * bt, best.a[1] + (best.b[1] - best.a[1]) * bt };
                        best.cuts.Add((bt, p));
                        end[0] = p[0]; end[1] = p[1];
                    }
                }
            }

            // Nodes (snapped), then edges along each road between consecutive points.
            var nodes = new List<NetNode>();
            var NH = new Dictionary<long, List<NetNode>>();
            const double SNAP = 9;
            NetNode NodeAt(double[] p)
            {
                long cx = (long)Math.Floor(p[0] / SNAP), cz = (long)Math.Floor(p[1] / SNAP);
                for (long dx = -1; dx <= 1; dx++) for (long dz = -1; dz <= 1; dz++)
                    if (NH.TryGetValue(CellKey(cx + dx, cz + dz), out var l))
                        foreach (var nn in l) if (Hypot(nn.x - p[0], nn.z - p[1]) < SNAP) return nn;
                var n = new NetNode { id = nodes.Count, x = p[0], z = p[1] };
                nodes.Add(n);
                long key = CellKey(cx, cz);
                if (!NH.TryGetValue(key, out var lst)) NH[key] = lst = new List<NetNode>();
                lst.Add(n);
                return n;
            }
            var edgeMap = new Dictionary<long, NetEdge>();
            var edges = new List<NetEdge>();
            void Link(NetNode a, NetNode b, Road r)
            {
                if (a == b) return;
                long key = a.id < b.id ? (long)a.id * 10000019L + b.id : (long)b.id * 10000019L + a.id;
                if (edgeMap.TryGetValue(key, out var old)) { if (!r.boundary && (old.r.boundary || RoadWidth(r) > RoadWidth(old.r))) old.r = r; return; }
                var e = new NetEdge { id = edges.Count, a = a, b = b, r = r };
                edges.Add(e); edgeMap[key] = e;
            }
            var segsByRoad = segs.GroupBy(s => s.r).ToDictionary(g => g.Key, g => g.ToList());
            foreach (var r in roads)
            {
                var pts = new List<(double d, double[] p)>();
                if (segsByRoad.TryGetValue(r, out var rs))
                    foreach (var s in rs)
                    {
                        double L = Hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
                        pts.Add((s.i * 1e6, s.a));
                        foreach (var c in s.cuts) pts.Add((s.i * 1e6 + c.t * L, c.p));
                        pts.Add((s.i * 1e6 + L, s.b));
                    }
                NetNode prev = null;
                foreach (var q in pts.OrderBy(u => u.d)) { var n = NodeAt(q.p); if (prev != null) Link(prev, n, r); prev = n; }
            }

            // Collapse very short edges (two crossings a few metres apart become one junction).
            var parent = nodes.Select(n => n.id).ToArray();
            int Find(int i) => parent[i] == i ? i : (parent[i] = Find(parent[i]));
            foreach (var e in edges) if (!e.r.boundary && Hypot(e.a.x - e.b.x, e.a.z - e.b.z) < 14) parent[Find(e.a.id)] = Find(e.b.id);
            var merged = new Dictionary<int, Merge>();
            var mergedOrder = new List<int>();
            foreach (var n in nodes)
            {
                int root = Find(n.id);
                if (!merged.TryGetValue(root, out var m)) { merged[root] = m = new Merge(); mergedOrder.Add(root); }
                m.xs += n.x; m.zs += n.z; m.k++;
            }
            var keepNodes = new Dictionary<int, NetNode>();
            foreach (var root in mergedOrder) { var m = merged[root]; keepNodes[root] = new NetNode { id = 0, x = m.xs / m.k, z = m.zs / m.k }; }
            var em2 = new Dictionary<string, NetEdge>();
            var edges2 = new List<NetEdge>();
            foreach (var e in edges)
            {
                var a = keepNodes[Find(e.a.id)]; var b = keepNodes[Find(e.b.id)];
                if (a == b) continue;
                string ka = Fx(a.x) + "," + Fx(a.z), kb = Fx(b.x) + "," + Fx(b.z);
                string key = string.CompareOrdinal(ka, kb) <= 0 ? ka + "|" + kb : kb + "|" + ka;
                if (em2.TryGetValue(key, out var old)) { if (!e.r.boundary && (old.r.boundary || RoadWidth(e.r) > RoadWidth(old.r))) old.r = e.r; continue; }
                var ne = new NetEdge { a = a, b = b, r = e.r };
                em2[key] = ne;
                edges2.Add(ne);
            }
            edges = edges2;
            var nodeList = mergedOrder.Select(r => keepNodes[r]).ToList();

            // Prune dead ends (except on the world boundary), repeatedly.
            bool OnBoundary(NetNode n) => n.x <= W.minX + 1 || n.x >= W.maxX - 1 || n.z <= W.minZ + 1 || n.z >= W.maxZ - 1;
            for (;;)
            {
                var deg = new Dictionary<NetNode, int>();
                foreach (var e in edges) { deg.TryGetValue(e.a, out int da); deg[e.a] = da + 1; deg.TryGetValue(e.b, out int db); deg[e.b] = db + 1; }
                int before = edges.Count;
                edges = edges.Where(e => !((deg[e.a] == 1 && !OnBoundary(e.a)) || (deg[e.b] == 1 && !OnBoundary(e.b)))).ToList();
                if (edges.Count == before) break;
            }
            var used = new HashSet<NetNode>();
            foreach (var e in edges) { used.Add(e.a); used.Add(e.b); }
            nodeList = nodeList.Where(n => used.Contains(n)).ToList();
            for (int i = 0; i < nodeList.Count; i++) { nodeList[i].id = i; nodeList[i].adj = new List<Half>(); }
            for (int i = 0; i < edges.Count; i++)
            {
                var e = edges[i];
                e.id = i;
                e.len = Hypot(e.b.x - e.a.x, e.b.z - e.a.z);
                e.a.adj.Add(new Half { e = e, to = e.b, ang = Math.Atan2(e.b.z - e.a.z, e.b.x - e.a.x) });
                e.b.adj.Add(new Half { e = e, to = e.a, ang = Math.Atan2(e.a.z - e.b.z, e.a.x - e.b.x) });
            }
            foreach (var n in nodeList) n.adj = n.adj.OrderBy(h => h.ang).ToList();

            // Faces: walk half-edges keeping the face on the same side.
            var visited = new HashSet<(int, int, int)>();
            var faces = new List<List<FaceHalf>>();
            foreach (var n in nodeList)
            {
                foreach (var h0 in n.adj)
                {
                    if (visited.Contains((n.id, h0.to.id, h0.e.id))) continue;
                    var loop = new List<FaceHalf>();
                    var from = n; var h = h0; int guard = 0;
                    while (guard++ < 2000)
                    {
                        if (!visited.Add((from.id, h.to.id, h.e.id))) break;
                        loop.Add(new FaceHalf { node = from, e = h.e });
                        var v = h.to;
                        // Arriving at v from `from`: take the next edge clockwise from the way back.
                        int back = v.adj.FindIndex(q => q.to == from && q.e == h.e);
                        var next = v.adj[(back - 1 + v.adj.Count) % v.adj.Count];
                        from = v; h = next;
                    }
                    if (loop.Count >= 3) faces.Add(loop);
                }
            }
            return new RoadNetResult { roads = roads, nodes = nodeList, edges = edges, faces = faces };
        }

        // ---------- blocks ----------
        // Inset a polygon with per-edge distances (any winding); d[i] for edge i->i+1. Null if it collapses.
        public static List<double[]> InsetPolygon(IList<double[]> poly, IList<double> d)
        {
            int n = poly.Count;
            double sgn = Math.Sign(PolyArea(poly)); if (sgn == 0) sgn = 1;
            var lines = new (double px, double pz, double dx, double dz)[n];
            for (int i = 0; i < n; i++)
            {
                double x1 = poly[i][0], z1 = poly[i][1], x2 = poly[(i + 1) % n][0], z2 = poly[(i + 1) % n][1];
                double dx = x2 - x1, dz = z2 - z1, l = Or1(Hypot(dx, dz));
                // Inward normal: for positive (x right, z down) area, inside is to the right of travel.
                double nx = -dz / l * sgn, nz = dx / l * sgn;
                lines[i] = (x1 + nx * d[i], z1 + nz * d[i], dx / l, dz / l);
            }
            var outPts = new List<double[]>(n);
            for (int i = 0; i < n; i++)
            {
                var A = lines[(i - 1 + n) % n]; var B = lines[i];
                double den = A.dx * B.dz - A.dz * B.dx;
                if (Math.Abs(den) < 0.08) { outPts.Add(new[] { B.px, B.pz }); continue; } // nearly straight: no mitre needed
                double t = ((B.px - A.px) * B.dz - (B.pz - A.pz) * B.dx) / den;
                double x = A.px + A.dx * t, z = A.pz + A.dz * t;
                // Clamp spiky mitres at very sharp corners.
                double ox = poly[i][0], oz = poly[i][1], md = Math.Max(d[i], d[(i - 1 + n) % n]) * 3 + 2;
                double m = Hypot(x - ox, z - oz);
                if (m > md) { x = ox + (x - ox) / m * md; z = oz + (z - oz) / m * md; }
                outPts.Add(new[] { x, z });
            }
            // Reject if any edge flipped direction or the winding changed.
            for (int i = 0; i < n; i++)
            {
                var a = poly[i]; var b = poly[(i + 1) % n]; var p = outPts[i]; var q = outPts[(i + 1) % n];
                if ((b[0] - a[0]) * (q[0] - p[0]) + (b[1] - a[1]) * (q[1] - p[1]) <= 0) return null;
            }
            double area = PolyArea(outPts);
            if (Math.Sign(area) != sgn || Math.Abs(area) < 40) return null;
            return outPts;
        }

        public class LoopPoint { public double x, z, w; public NetEdge e; public NetNode node; }

        // Drop vertices on (nearly) straight runs where both sides are the same road width.
        public static List<LoopPoint> SimplifyLoop(List<FaceHalf> loop)
        {
            var pts = loop.Select(h => new LoopPoint { x = h.node.x, z = h.node.z, w = h.e.r.boundary ? 0 : h.e.r.width, e = h.e, node = h.node }).ToList();
            bool changed = true;
            while (changed && pts.Count > 3)
            {
                changed = false;
                for (int i = 0; i < pts.Count && pts.Count > 3; i++)
                {
                    var a = pts[(i - 1 + pts.Count) % pts.Count]; var b = pts[i]; var c = pts[(i + 1) % pts.Count];
                    double a1 = Math.Atan2(b.z - a.z, b.x - a.x), a2 = Math.Atan2(c.z - b.z, c.x - b.x);
                    double da = Math.Abs(a2 - a1); if (da > Math.PI) da = 2 * Math.PI - da;
                    if (da < 0.1 && Math.Abs(a.w - b.w) < 0.1) { pts.RemoveAt(i); changed = true; }
                }
            }
            return pts;
        }
    }
}
