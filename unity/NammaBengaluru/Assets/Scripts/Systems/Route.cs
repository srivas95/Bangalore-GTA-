// Shortest paths over the road network (port of src/systems/route.js): the GPS line, and the
// routes that hired autos and BMTC buses drive. A* over junctions, entering and leaving the
// network on the nearest roads.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.World;

namespace NammaBengaluru.Systems
{
    public class PlanResult { public EdgeHit? hs; public EdgeHit ht; public List<NetNode> nodes; }
    public class DrivePlan { public List<DirEdge> route; public DirEdge stopEdge; public double stopS; }

    public static class Route
    {
        // Junctions from (x, z) to (tx, tz). `fromNode`/`avoid` force the start: set off from a
        // junction without turning back along the undirected edge `avoid` (no U-turns unless it's
        // a dead end). Returns null when either end is off the network.
        public static PlanResult PlanNodes(Layout layout, double x, double z, double tx, double tz, NetNode fromNode = null, NetEdge avoid = null)
        {
            EdgeHit? hs = fromNode != null ? null : layout.EdgeAt(x, z);
            var htq = layout.EdgeAt(tx, tz);
            if ((fromNode == null && hs == null) || htq == null) return null;
            var ht = htq.Value;
            double ptx = ht.e.a.x + (ht.e.b.x - ht.e.a.x) * ht.t, ptz = ht.e.a.z + (ht.e.b.z - ht.e.a.z) * ht.t;
            double Heur(NetNode n) => Math.Sqrt((n.x - ptx) * (n.x - ptx) + (n.z - ptz) * (n.z - ptz));
            var g = new Dictionary<NetNode, double>(); var prev = new Dictionary<NetNode, NetNode>(); var done = new HashSet<NetNode>();
            var heap = new Heap<NetNode>();
            void Open(NetNode n, double cost, NetNode p)
            {
                if (cost >= (g.TryGetValue(n, out var c) ? c : double.PositiveInfinity)) return;
                g[n] = cost; prev[n] = p;
                heap.Push(cost + Heur(n), n);
            }
            if (fromNode != null) Open(fromNode, 0, null);
            else { var h = hs.Value; Open(h.e.a, h.t * h.e.len, null); Open(h.e.b, (1 - h.t) * h.e.len, null); }
            var goalCost = new Dictionary<NetNode, double> { [ht.e.a] = ht.t * ht.e.len };
            goalCost[ht.e.b] = (1 - ht.t) * ht.e.len;
            NetNode best = null; double bestCost = double.PositiveInfinity;
            while (heap.Count > 0)
            {
                var n = heap.Pop();
                if (!done.Add(n)) continue;
                double c = g[n];
                if (c + Heur(n) >= bestCost) break;
                if (goalCost.TryGetValue(n, out var gc) && c + gc < bestCost && !(fromNode != null && n == fromNode && avoid == ht.e && n.adj.Count > 1)) { bestCost = c + gc; best = n; }
                foreach (var h in n.adj)
                {
                    if (fromNode != null && n == fromNode && h.e == avoid && n.adj.Count > 1) continue;
                    var m = h.e.a == n ? h.e.b : h.e.a;
                    if (!done.Contains(m)) Open(m, c + h.e.len, n);
                }
            }
            if (best == null) return null;
            var nodes = new List<NetNode>();
            for (var n = best; n != null; n = prev[n]) nodes.Add(n);
            nodes.Reverse();
            return new PlanResult { hs = hs, ht = ht, nodes = nodes };
        }

        // The directed traffic edges joining consecutive junctions.
        public static List<DirEdge> NodesToEdges(List<NetNode> nodes)
        {
            var output = new List<DirEdge>();
            for (int i = 1; i < nodes.Count; i++)
            {
                var d = nodes[i - 1].outEdges.FirstOrDefault(e => e.to == nodes[i]);
                if (d == null) return null;
                output.Add(d);
            }
            return output;
        }

        // How far along a directed edge's lane path (which starts `cut` metres in from the
        // junction) a point lies, clamped to the drivable part.
        public static double SAlong(DirEdge e, double x, double z)
        {
            double a = Math.Min(e.cutFrom + 1.5, e.len * 0.45), b = Math.Min(e.cutTo + 1.5, e.len * 0.45);
            double along = (x - e.from.x) * e.dirX + (z - e.from.z) * e.dirZ;
            double len = e.len - a - b;
            return Math.Max(Math.Min(2, len / 2), Math.Min(len - 2, along - a));
        }

        // A driving plan for a vehicle on directed edge `edge` (at distance `s` along its lane path)
        // to (tx, tz): the edges to take after this one, and where to stop on the last of them.
        public static DrivePlan PlanDrive(Layout layout, DirEdge edge, double s, double tx, double tz)
        {
            var htq = layout.EdgeAt(tx, tz);
            if (htq == null) return null;
            var ht = htq.Value;
            if (ht.e == edge.und && SAlong(edge, tx, tz) > s + 6) return new DrivePlan { route = new List<DirEdge>(), stopEdge = edge, stopS = SAlong(edge, tx, tz) };
            var r = PlanNodes(layout, 0, 0, tx, tz, edge.to, edge.und);
            if (r == null) return null;
            var route = NodesToEdges(r.nodes);
            if (route == null) return null;
            var last = r.nodes[r.nodes.Count - 1];
            var fin = last.outEdges.FirstOrDefault(e => e.und == ht.e);
            if (fin == null) return null;
            route.Add(fin);
            return new DrivePlan { route = route, stopEdge = fin, stopS = SAlong(fin, tx, tz) };
        }

        public static double RouteLength(IEnumerable<DirEdge> route) => route.Sum(e => e.len);
    }

    // Minimal binary min-heap of (priority, item), as route.js's Heap.
    public class Heap<T>
    {
        readonly List<double> P = new List<double>(); readonly List<T> V = new List<T>();
        public int Count => V.Count;
        public void Push(double p, T v)
        {
            int i = V.Count; P.Add(p); V.Add(v);
            while (i > 0)
            {
                int j = (i - 1) >> 1;
                if (P[j] <= P[i]) break;
                (P[i], P[j]) = (P[j], P[i]); (V[i], V[j]) = (V[j], V[i]);
                i = j;
            }
        }
        public T Pop()
        {
            var top = V[0];
            double lp = P[P.Count - 1]; var lv = V[V.Count - 1];
            P.RemoveAt(P.Count - 1); V.RemoveAt(V.Count - 1);
            if (V.Count > 0)
            {
                P[0] = lp; V[0] = lv;
                int i = 0;
                for (; ; )
                {
                    int l = 2 * i + 1, r = l + 1, m = i;
                    if (l < V.Count && P[l] < P[m]) m = l;
                    if (r < V.Count && P[r] < P[m]) m = r;
                    if (m == i) break;
                    (P[i], P[m]) = (P[m], P[i]); (V[i], V[m]) = (V[m], V[i]);
                    i = m;
                }
            }
            return top;
        }
    }

    // GPS (port of src/systems/gps.js): a waypoint set on the big map, and the shortest route to
    // it along the road network, recalculated when you stray from it.
    public class Gps
    {
        readonly Layout layout;
        public (double x, double z)? target;
        public List<(double x, double z)> route; // from you to the waypoint
        public double length, recalcT;

        public Gps(Layout layout) { this.layout = layout; }

        public void Set(double x, double z) { target = (x, z); route = null; recalcT = 0; }
        public void Clear() { target = null; route = null; }

        // True when you reach the waypoint (which then clears).
        public bool Update(double dt, double x, double z)
        {
            if (target == null) return false;
            var t = target.Value;
            if (Math.Sqrt((t.x - x) * (t.x - x) + (t.z - z) * (t.z - z)) < 25) { Clear(); return true; }
            recalcT -= dt;
            if (route == null || recalcT <= 0 || (recalcT < 1.5 && OffRoute(x, z) > 30)) { route = Plan(x, z, t.x, t.z); recalcT = 3; }
            else if (route.Count > 1)
            {
                // Keep the line starting at you: drop route points you've passed.
                route[0] = (x, z);
                while (route.Count > 2 && Math.Sqrt((route[1].x - x) * (route[1].x - x) + (route[1].z - z) * (route[1].z - z)) < 12) route.RemoveAt(1);
            }
            length = 0;
            for (int i = 1; i < route.Count; i++) length += Math.Sqrt((route[i].x - route[i - 1].x) * (route[i].x - route[i - 1].x) + (route[i].z - route[i - 1].z) * (route[i].z - route[i - 1].z));
            return false;
        }

        double OffRoute(double x, double z)
        {
            double best = double.PositiveInfinity;
            for (int i = 1; i < route.Count; i++)
            {
                var (ax, az) = route[i - 1]; var (bx, bz) = route[i];
                double dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; if (l2 == 0) l2 = 1;
                double t = Math.Max(0, Math.Min(1, ((x - ax) * dx + (z - az) * dz) / l2));
                best = Math.Min(best, Math.Sqrt((ax + dx * t - x) * (ax + dx * t - x) + (az + dz * t - z) * (az + dz * t - z)));
            }
            return best;
        }

        // Shortest route, entering and leaving the network at the nearest points on the nearest roads.
        List<(double x, double z)> Plan(double x, double z, double tx, double tz)
        {
            var r = Route.PlanNodes(layout, x, z, tx, tz);
            if (r == null) return new List<(double, double)> { (x, z), (tx, tz) };
            (double, double) Proj(EdgeHit h) => (h.e.a.x + (h.e.b.x - h.e.a.x) * h.t, h.e.a.z + (h.e.b.z - h.e.a.z) * h.t);
            var ps = Proj(r.hs.Value); var pt = Proj(r.ht);
            if (r.hs.Value.e == r.ht.e) return new List<(double, double)> { (x, z), ps, pt, (tx, tz) };
            var output = new List<(double x, double z)> { (x, z), ps };
            output.AddRange(r.nodes.Select(n => (n.x, n.z)));
            output.Add(pt); output.Add((tx, tz));
            return output;
        }
    }
}
