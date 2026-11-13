// Namma Metro route data without any geometry (metroRoutes in src/world/metro.js), shared by the
// city (to keep buildings clear of viaducts), the metro builder and the ride system; and the
// arc-length polyline trains follow (src/world/path.js). No UnityEngine dependency.
using System;
using System.Collections.Generic;
using System.Linq;

namespace NammaBengaluru.World
{
    // An arc-length parametrised polyline in the ground plane (Path in path.js).
    public class PolyPath
    {
        public readonly List<double[]> pts;
        public readonly List<double> cum = new List<double> { 0 };
        public readonly double length;
        public struct At { public double x, z, dx, dz; public int i; }

        public PolyPath(List<double[]> pts)
        {
            this.pts = pts;
            for (int i = 1; i < pts.Count; i++) cum.Add(cum[i - 1] + Math.Sqrt((pts[i][0] - pts[i - 1][0]) * (pts[i][0] - pts[i - 1][0]) + (pts[i][1] - pts[i - 1][1]) * (pts[i][1] - pts[i - 1][1])));
            length = cum[cum.Count - 1];
        }

        int SegAt(double s)
        {
            int lo = 0, hi = cum.Count - 1;
            while (hi - lo > 1) { int m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
            return lo;
        }

        // Position and unit direction at distance s (clamped to the ends).
        public At AtS(double s)
        {
            s = Math.Max(0, Math.Min(length, s));
            int i = Math.Min(SegAt(s), pts.Count - 2);
            double ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
            double l = cum[i + 1] - cum[i]; if (l == 0) l = 1;
            double t = (s - cum[i]) / l;
            return new At { x = ax + (bx - ax) * t, z = az + (bz - az) * t, dx = (bx - ax) / l, dz = (bz - az) / l, i = i };
        }

        // Closest point: (s, d).
        public (double s, double d) Project(double x, double z)
        {
            double bs = 0, bd = double.PositiveInfinity;
            for (int i = 0; i < pts.Count - 1; i++)
            {
                double ax = pts[i][0], az = pts[i][1], abx = pts[i + 1][0] - ax, abz = pts[i + 1][1] - az, l2 = abx * abx + abz * abz; if (l2 == 0) l2 = 1;
                double t = Math.Max(0, Math.Min(1, ((x - ax) * abx + (z - az) * abz) / l2));
                double d = Math.Sqrt((ax + abx * t - x) * (ax + abx * t - x) + (az + abz * t - z) * (az + abz * t - z));
                if (d < bd) { bd = d; bs = cum[i] + t * Math.Sqrt(l2); }
            }
            return (bs, bd);
        }
    }

    public class MetroRamp { public int i; public double L, s1, sAtYPortal; public bool up; public int bad; public double portalY, sHi, sLo; }

    public class MetroStop
    {
        public string en, kn; public double x, z; public bool underground;
        public int idx; public double s, dirX, dirZ, L, platformY;
        public MetroRoute line; public bool interchange;
        public List<(double x, double z)> entrances;
    }

    public class MetroRoute
    {
        public string name, @short; public int color;
        public PolyPath path; public List<MetroStop> stations; public List<MetroRamp> ramps; public double ugY;
        public double YAt(double s)
        {
            if (s <= stations[0].s) return stations[0].underground ? ugY : MetroRoutes.DECK_Y;
            int last = stations.Count - 1;
            if (s >= stations[last].s) return stations[last].underground ? ugY : MetroRoutes.DECK_Y;
            int i = 0;
            while (i < last - 1 && stations[i + 1].s <= s) i++;
            if (stations[i].underground == stations[i + 1].underground) return stations[i].underground ? ugY : MetroRoutes.DECK_Y;
            return MetroRoutes.RampY(this, ramps.First(r => r.i == i), s);
        }
        // Distance along the ramp where the track is at height h.
        public double SAtY(MetroRamp r, double h)
        {
            double from = r.up ? ugY : MetroRoutes.DECK_Y, to = r.up ? MetroRoutes.DECK_Y : ugY;
            double k = (h - from) / (to - from);
            return r.s1 + Math.Min(1, Math.Max(0, k)) * r.L;
        }
    }

    public static class MetroRoutes
    {
        public const double DECK_Y = 9.5, UG_Y = -12, ST_HALF = 34, TRACK = 2.2, CAR = 20, DWELL = 11;
        public const int CARS = 3;
        public const double TRAIN_LEN = CARS * CAR + (CARS - 1) * 0.6;
        // Ramps between elevated and underground track: a steady grade, placed where the low part
        // of the ramp (the covered cutting and the tunnel mouth) sits on land rather than in a road.
        const double RAMP_GRADE = 0.05;
        public const double PORTAL_Y = 3.5; // deck height where the covered ramp (tunnel mouth) begins
        static readonly double[] NEAR_GROUND = { -7, 6 }; // track heights where the ramp structure is at street level

        public static double RampY(MetroRoute line, MetroRamp r, double s) => RampY(line.ugY, r, s, r.s1);
        static double RampY(double UG, MetroRamp r, double s, double s1)
        {
            double k = Math.Min(1, Math.Max(0, (s - s1) / r.L));
            return r.up ? UG + (DECK_Y - UG) * k : DECK_Y + (UG - DECK_Y) * k;
        }

        // Where a train's head stops so the whole rake sits at the platform.
        public static double StopPoint(MetroStop st, int dir) => st.s + dir * TRAIN_LEN / 2;

        static readonly Dictionary<Layout, List<MetroRoute>> cache = new Dictionary<Layout, List<MetroRoute>>();
        public static void ResetStatics() => cache.Clear();

        public static List<MetroRoute> Routes(Layout layout, MapData md)
        {
            if (cache.TryGetValue(layout, out var have)) return have;
            bool OnLand(double x, double z) { var b = layout.BlockContaining(x, z); return b != null && !b.island; }
            var routes = new List<MetroRoute>();
            foreach (var line in md.METRO)
            {
                var st0 = line.stations; int n = st0.Count;
                var dirs = new List<double[]>(); // x, z, L
                for (int i = 0; i < n; i++)
                {
                    var a = st0[Math.Max(0, i - 1)]; var b = st0[Math.Min(n - 1, i + 1)];
                    double dx = b.x - a.x, dz = b.z - a.z, l = Math.Sqrt(dx * dx + dz * dz); if (l == 0) l = 1;
                    dirs.Add(new[] { dx / l, dz / l, 0 });
                }
                var ug = st0.Select(s => s.underground).ToList();
                // Two lines cross at Majestic, one above the other.
                double UG = line.@short == "green" ? UG_Y - 8 : UG_Y;

                // Lateral clearance of a stretch of track [sA, sB] shifted sideways by d: points off the land.
                int OffLand(PolyPath path, double sA, double sB, double d = 0)
                {
                    int bad = 0;
                    for (double s = sA; s <= sB + 1e-6; s += 5)
                    {
                        var p = path.AtS(s); double px = -p.dz, pz = p.dx;
                        foreach (var o in new[] { -5.5, 0, 5.5 }) if (!OnLand(p.x + px * (o + d), p.z + pz * (o + d))) bad++;
                    }
                    return bad;
                }
                // The street-level part of a ramp starting at s1: track between NEAR_GROUND heights.
                (double, double) LowPart(MetroRamp r, double s1)
                {
                    double At(double h) { double from = r.up ? UG : DECK_Y, to = r.up ? DECK_Y : UG; double k = (h - from) / (to - from); return s1 + Math.Min(1, Math.Max(0, k)) * r.L; }
                    double a = At(NEAR_GROUND[0]), b = At(NEAR_GROUND[1]);
                    return (Math.Min(a, b), Math.Max(a, b));
                }

                // Build the route through the stations; legs[i] = extra points between station i and i+1.
                (PolyPath path, List<MetroStop> stations, List<MetroRamp> ramps) Build(Dictionary<int, List<double[]>> legs, Dictionary<int, double[]> fixedAt)
                {
                    // Each station sits on a straight run of track (real platforms are straight): the
                    // route passes through two points either side of it instead of bending at it.
                    var pts = new List<double[]>(); var sAt = new List<int>();
                    void Push(double x, double z) => pts.Add(new[] { x, z });
                    const double tail = 70;
                    Push(st0[0].x - dirs[0][0] * (ST_HALF + tail), st0[0].z - dirs[0][1] * (ST_HALF + tail));
                    for (int i = 0; i < n; i++)
                    {
                        var s = st0[i];
                        double Gap(int j) => j < 0 || j >= n ? double.PositiveInfinity : Math.Sqrt((st0[j].x - s.x) * (st0[j].x - s.x) + (st0[j].z - s.z) * (st0[j].z - s.z));
                        double L = Math.Min(ST_HALF + 6, 0.35 * Math.Min(Gap(i - 1), Gap(i + 1)));
                        sAt.Add(pts.Count);
                        Push(s.x - dirs[i][0] * L, s.z - dirs[i][1] * L);
                        Push(s.x + dirs[i][0] * L, s.z + dirs[i][1] * L);
                        dirs[i][2] = L;
                        if (legs != null && legs.TryGetValue(i, out var leg)) foreach (var p in leg) Push(p[0], p[1]);
                    }
                    Push(st0[n - 1].x + dirs[n - 1][0] * (ST_HALF + tail), st0[n - 1].z + dirs[n - 1][1] * (ST_HALF + tail));
                    var path = new PolyPath(pts);
                    var stations = st0.Select((s, i) => new MetroStop { en = s.en, kn = s.kn, x = s.x, z = s.z, underground = s.underground, idx = i, s = path.cum[sAt[i]] + dirs[i][2], dirX = dirs[i][0], dirZ = dirs[i][1], L = dirs[i][2] }).ToList();
                    // Ramps between an underground and an elevated station: where each starts (s1),
                    // how long it is, which way it climbs; its street-level part on land if possible.
                    var ramps = new List<MetroRamp>();
                    for (int i = 0; i < n - 1; i++)
                    {
                        if (ug[i] == ug[i + 1]) continue;
                        double sA = stations[i].s + ST_HALF + 15, sB = stations[i + 1].s - ST_HALF - 15;
                        double L = Math.Min((DECK_Y - UG) / RAMP_GRADE, Math.Max(40, sB - sA));
                        var ramp = new MetroRamp { i = i, L = L, up = ug[i], s1 = (sA + sB - L) / 2 };
                        if (fixedAt != null && fixedAt.TryGetValue(i, out var fx)) { double p = path.Project(fx[0], fx[1]).s; ramp.s1 = Math.Max(sA, Math.Min(sB - L, p)); }
                        else if (sB - sA > L)
                        {
                            double best = double.PositiveInfinity;
                            for (double s1 = sA; s1 <= sB - L + 1e-6; s1 += 10)
                            {
                                var (la, lb) = LowPart(ramp, s1);
                                double score = OffLand(path, la, lb) * 100 + Math.Abs(s1 - (sA + sB - L) / 2) / 100;
                                if (score < best) { best = score; ramp.s1 = s1; }
                            }
                        }
                        { var (la, lb) = LowPart(ramp, ramp.s1); ramp.bad = OffLand(path, la, lb); }
                        ramps.Add(ramp);
                    }
                    return (path, stations, ramps);
                }

                var built = Build(null, null);
                // A ramp whose street-level part would sit in a road: bend the line sideways into
                // the neighbouring block for that stretch (underground it can curve back under the road).
                var legsAll = new Dictionary<int, List<double[]>>(); var fixedAll = new Dictionary<int, double[]>();
                foreach (var r in built.ramps)
                {
                    if (r.bad == 0) continue;
                    double lo = built.stations[r.i].s + ST_HALF + 5, hi = built.stations[r.i + 1].s - ST_HALF - 5;
                    // Every ramp position along the run, with every sideways shift: the least off-land wins.
                    double? bestD = null; int bestBad = r.bad; double bestS1 = r.s1;
                    for (double s1 = lo + 10; s1 <= hi - 10 - r.L + 1e-6; s1 += 10)
                    {
                        var (la, lb) = LowPart(r, s1);
                        foreach (var d in new double[] { 12, -12, 16, -16, 20, -20, 25, -25, 30, -30 })
                        {
                            int bad = OffLand(built.path, la, lb, d);
                            if (bad < bestBad) { bestBad = bad; bestD = d; bestS1 = s1; }
                        }
                    }
                    if (bestD == null) continue;
                    r.s1 = bestS1;
                    var (la2, lb2) = LowPart(r, r.s1);
                    double a = Math.Max(lo, la2 - 45), b = Math.Min(hi, lb2 + 45);
                    double[] Shifted(double s, double d) { var p = built.path.AtS(s); return new[] { p.x - p.dz * d, p.z + p.dx * d }; }
                    var leg = new List<double[]> { Shifted(a, 0) };
                    for (double s = la2; s <= lb2 + 1e-6; s += 10) leg.Add(Shifted(s, bestD.Value));
                    leg.Add(Shifted(lb2, bestD.Value)); leg.Add(Shifted(b, 0));
                    legsAll[r.i] = leg;
                    var p1 = built.path.AtS(r.s1);
                    fixedAll[r.i] = new[] { p1.x, p1.z };
                }
                if (legsAll.Count > 0) built = Build(legsAll, fixedAll);
                var route = new MetroRoute { name = line.name, @short = line.@short, color = line.color, path = built.path, stations = built.stations, ramps = built.ramps, ugY = UG };
                foreach (var st in route.stations) st.line = route;
                routes.Add(route);
            }
            cache[layout] = routes;
            return routes;
        }
    }
}
