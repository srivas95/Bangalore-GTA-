// Derived map data on the real road network: junctions (with corner geometry), directed traffic
// edges, polygon city blocks, underpasses, flyovers, the railway, and spatial queries.
// Port of src/world/layout.js. No UnityEngine dependency.
using System;
using System.Collections.Generic;
using System.Linq;

namespace NammaBengaluru.World
{
    public class DirEdge
    {
        public int id;
        public NetNode from, to;
        public Road road;
        public NetEdge und;
        public double dirX, dirZ, len, cutFrom, cutTo;
        public DirEdge rev;
        public Flyover flyover;
    }

    public class BBox { public double minX, maxX, minZ, maxZ; }

    public class Block
    {
        public int id;
        public List<double[]> poly, innerPoly, roadPoly;
        public List<double> edgeWidths;
        public double cx, cz, area;
        public BBox bbox, inner, outer;
        public bool edge, island;
        // Zone and district.
        public string zone, district, lakeName, landmark;
        public bool pubs, special, airportSite;
        public Park park;
        public Lake lake;
        public double[] siteAt;
        public HotelSite hotel;
        // Set while the city is built: footprints already taken (lot rectangles, reserved sites).
        public List<double[][]> placed;
    }

    public class Underpass
    {
        public NetEdge edge;
        public Road road;
        public string type, name;
        public double at, half, depth, flat, waterLevel, cx, cz, ux, uz, hw;
        public double railDirX, railDirZ;
    }

    public class LevelCrossing { public NetEdge edge; public double x, z; public Road rail; public bool closed; }

    public class FlyoverArm { public double ux, uz, half; }

    public class Flyover
    {
        public string name;
        public NetNode node;
        public Road road;
        public List<FlyoverArm> arms;
        public double cx, cz, half, height, flat, hw;
    }

    public struct EdgeHit { public NetEdge e; public double t, d; }
    public struct FlyoverHit { public Flyover f; public FlyoverArm arm; public double along; }

    public class Layout
    {
        const int RASTER = 4;
        readonly int[] _seen = new int[9]; // scratch for BlockContaining

        public readonly MapData md;
        public readonly GameConfig cfg;
        public Rect2 world;
        public RoadNetResult net;
        public List<Road> roads, rails;
        public List<NetNode> nodes;
        public List<DirEdge> edges;
        public List<NetEdge> undirected;
        public List<Block> blocks, islands, allBlocks;
        public List<Underpass> underpasses;
        public List<LevelCrossing> levelCrossings;
        public List<Flyover> flyovers;
        public int rw, rh;
        public int[] raster;
        public const double EC = 40, NC = 80;
        Dictionary<long, List<NetEdge>> edgeCells;
        Dictionary<long, List<NetNode>> nodeCells;
        double seed = 1203;

        public double Rng() => (seed = seed * 16807 % 2147483647) / 2147483647;

        static double Hypot(double a, double b) => Math.Sqrt(a * a + b * b);
        static long Key(long x, long z) => (x << 32) ^ (z & 0xffffffffL);
        static double Smooth(double a, double b, double x) { double t = Math.Min(1, Math.Max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

        public Layout(MapData md, GameConfig cfg)
        {
            this.md = md; this.cfg = cfg;
            world = md.WORLD;
            var avoid = md.PARKS.Select(p => p.poly).Concat(md.LAKES.Select(l => l.poly)).ToList();
            avoid.Add(md.AIRPORT.poly); avoid.Add(md.AIRBASE.poly);
            net = RoadNet.Build(new RoadNetConfig
            {
                world = world, gridWorld = md.GRID_WORLD, arterials = md.ARTERIALS, avoid = avoid, rng = Rng,
                spacing = md.STREET_SPACING, urban = md.URBAN, ruralSpacing = md.RURAL_SPACING,
            });
            roads = net.roads.Where(r => !r.boundary).ToList();
            BuildGraph();
            BuildBlocks();
            BuildFeatures();
            BuildIndex();
        }

        public Road FindRoad(string name) => roads.FirstOrDefault(r => r.name == name);
        public double LaneOffset(Road road, int lane) => road.median / 2 + (lane + 0.5) * RoadNet.LANE_W;

        // ---------- junctions and traffic edges ----------
        void BuildGraph()
        {
            nodes = net.nodes;
            foreach (var n in nodes)
            {
                n.adj = n.adj.Where(h => !h.e.r.boundary).Select(h =>
                {
                    double dx = h.to.x - n.x, dz = h.to.z - n.z, l = Hypot(dx, dz); if (l == 0) l = 1;
                    return new Half { e = h.e, to = h.to, ang = h.ang, ux = dx / l, uz = dz / l, w = h.e.r.width / 2 };
                }).ToList();
                n.outEdges = new List<DirEdge>();
                n.cut = new Dictionary<int, double>();
                n.corners = new List<Corner>();
            }
            nodes = nodes.Where(n => n.adj.Count > 0).ToList();
            for (int i = 0; i < nodes.Count; i++) nodes[i].id = i;
            // Corner points between neighbouring roads, and how far back each road must stop.
            foreach (var n in nodes)
            {
                int k = n.adj.Count;
                var need = new double[k];
                for (int i = 0; i < k; i++)
                {
                    var A = n.adj[i]; var Bh = n.adj[(i + 1) % k];
                    if (k == 1) break;
                    double gap = Math.Atan2(Bh.uz, Bh.ux) - Math.Atan2(A.uz, A.ux);
                    while (gap <= 0) gap += Math.PI * 2;
                    double pax = -A.uz, paz = A.ux, pbx = Bh.uz, pbz = -Bh.ux; // kerb sides facing each other
                    double s = 0, t = 0, cx, cz;
                    if (gap < Math.PI * 0.94 || k == 2)
                    {
                        // Solve n + uA s + pa wA = n + uB t + pb wB.
                        double rx = pbx * Bh.w - pax * A.w, rz = pbz * Bh.w - paz * A.w;
                        double det = A.ux * -Bh.uz - A.uz * -Bh.ux;
                        if (Math.Abs(det) > 0.05)
                        {
                            s = (rx * -Bh.uz - rz * -Bh.ux) / det;
                            t = (A.ux * rz - A.uz * rx) / det;
                        }
                    }
                    s = Math.Max(0, Math.Min(60, s)); t = Math.Max(0, Math.Min(60, t));
                    cx = n.x + A.ux * s + pax * A.w; cz = n.z + A.uz * s + paz * A.w;
                    if (gap >= Math.PI * 0.94 && k > 2) { cx = n.x + pax * A.w; cz = n.z + paz * A.w; }
                    n.corners.Add(new Corner { x = cx, z = cz, a = i, b = (i + 1) % k, gap = gap, s = s, t = t });
                    need[i] = Math.Max(need[i], s); need[(i + 1) % k] = Math.Max(need[(i + 1) % k], t);
                }
                // A gentle bend with two roads is a "through" node: the carriageways just meet.
                bool straight = false;
                if (k == 2)
                {
                    double d = Math.Acos(Math.Max(-1, Math.Min(1, n.adj[0].ux * n.adj[1].ux + n.adj[0].uz * n.adj[1].uz)));
                    straight = d > Math.PI - 0.45 && Math.Abs(n.adj[0].w - n.adj[1].w) < 0.1;
                }
                n.through = straight || k == 1;
                double maxW = n.adj.Max(q => q.w);
                for (int i = 0; i < k; i++)
                {
                    var h = n.adj[i];
                    double cut = n.through ? 0 : Math.Min(need[i] + 1.5, h.e.len * 0.42);
                    n.cut[h.e.id] = Math.Max(n.through ? 0 : Math.Min(h.e.len * 0.42, maxW * 0.8), cut);
                }
                // Signals where arterials meet (a side street joining an arterial just merges).
                var arts = n.adj.Where(h => !h.e.r.grid).ToList();
                n.signal = !n.through && k >= 3 && (arts.Select(h => h.e.r.name).Distinct().Count() >= 2 || arts.Count >= 3);
            }
            foreach (var jn in md.JunctionNames)
            {
                var p = md.Geo(jn.lat, jn.lon);
                NetNode best = null; double bd = 70;
                foreach (var n in nodes) { double d = Hypot(n.x - p[0], n.z - p[1]); if (d < bd && !n.through) { bd = d; best = n; } }
                if (best != null) { best.name = jn.name; if (best.adj.Count >= 3) best.signal = true; }
            }
            // Directed edges for traffic.
            edges = new List<DirEdge>();
            var nodeSet = new HashSet<NetNode>(nodes);
            foreach (var e in net.edges)
            {
                if (e.r.boundary || !nodeSet.Contains(e.a) || !nodeSet.Contains(e.b)) continue;
                DirEdge Mk(NetNode from, NetNode to)
                {
                    double dx = to.x - from.x, dz = to.z - from.z, l = Hypot(dx, dz); if (l == 0) l = 1;
                    from.cut.TryGetValue(e.id, out double cf); to.cut.TryGetValue(e.id, out double ct);
                    var d = new DirEdge { id = edges.Count, from = from, to = to, road = e.r, und = e, dirX = dx / l, dirZ = dz / l, len = l, cutFrom = cf, cutTo = ct };
                    edges.Add(d);
                    from.outEdges.Add(d);
                    return d;
                }
                var ab = Mk(e.a, e.b); var ba = Mk(e.b, e.a);
                ab.rev = ba; ba.rev = ab;
                e.dirs = new[] { ab, ba };
            }
            undirected = net.edges.Where(e => e.dirs != null).ToList();
        }

        // The kerb corner points where edge `e` meets node `n`: [left, right] seen leaving the node.
        public double[][] EdgeEnd(NetNode n, NetEdge e)
        {
            int i = n.adj.FindIndex(h0 => h0.e == e);
            var h = n.adj[i];
            n.cut.TryGetValue(e.id, out double cut);
            double px = -h.uz, pz = h.ux;
            if (n.through && n.adj.Count == 2)
            {
                var cA = n.corners[i]; var cB = n.corners[(i - 1 + n.adj.Count) % n.adj.Count];
                return new[] { new[] { cA.x, cA.z }, new[] { cB.x, cB.z } };
            }
            return new[] {
                new[] { n.x + h.ux * cut + px * h.w, n.z + h.uz * cut + pz * h.w },
                new[] { n.x + h.ux * cut - px * h.w, n.z + h.uz * cut - pz * h.w } };
        }

        // ---------- city blocks ----------
        void BuildBlocks()
        {
            var areas = net.faces.Select(f => RoadNet.PolyArea(f.Select(h => new[] { h.node.x, h.node.z }).ToList())).ToList();
            int outer = 0;
            for (int i = 0; i < areas.Count; i++) if (Math.Abs(areas[i]) > Math.Abs(areas[outer])) outer = i;
            int sign = -Math.Sign(areas[outer]);
            blocks = new List<Block>();
            islands = new List<Block>();
            var W = world;
            for (int i = 0; i < net.faces.Count; i++)
            {
                if (i == outer || Math.Sign(areas[i]) != sign) continue;
                var pts = RoadNet.SimplifyLoop(net.faces[i]);
                var poly = pts.Select(p => new[] { p.x, p.z }).ToList();
                var outPoly = RoadNet.InsetPolygon(poly, pts.Select(p => p.w / 2).ToList());
                if (outPoly == null) continue;
                var inner = RoadNet.InsetPolygon(outPoly, pts.Select(p => p.w != 0 ? RoadNet.SIDEWALK_W : 0).ToList());
                double cx = 0, cz = 0;
                foreach (var q in outPoly) { cx += q[0]; cz += q[1]; }
                cx /= outPoly.Count; cz /= outPoly.Count;
                var bbox = new BBox { minX = outPoly.Min(q => q[0]), maxX = outPoly.Max(q => q[0]), minZ = outPoly.Min(q => q[1]), maxZ = outPoly.Max(q => q[1]) };
                var block = new Block
                {
                    id = blocks.Count, poly = outPoly, innerPoly = inner, edgeWidths = pts.Select(p => p.w).ToList(), roadPoly = poly,
                    cx = cx, cz = cz, bbox = bbox, area = Math.Abs(RoadNet.PolyArea(outPoly)),
                    edge = pts.Any(p => p.w == 0) || bbox.minX < W.minX + 1 || bbox.maxX > W.maxX - 1 || bbox.minZ < W.minZ + 1 || bbox.maxZ > W.maxZ - 1,
                };
                if (inner == null || block.area < 600) { block.island = true; islands.Add(block); continue; }
                BlockInfo(block);
                // Axis-aligned rectangle inside the block, for landmarks and other square layouts.
                block.inner = InnerRect(inner, cx, cz);
                block.outer = bbox;
                blocks.Add(block);
            }
            AssignSpecials();
        }

        static readonly Dictionary<string, double[]> NEED = new Dictionary<string, double[]>
        {
            ["vidhanaSoudha"] = new double[] { 104, 84 }, ["highCourt"] = new double[] { 80, 40 }, ["stadium"] = new double[] { 60, 60 }, ["iskcon"] = new double[] { 74, 60 },
            ["wtc"] = new double[] { 66, 46 }, ["ibcPlatinumCity"] = new double[] { 84, 96 }, ["forumMall"] = new double[] { 80, 80 }, ["silkBoardOffice"] = new double[] { 70, 34 },
            ["cathedral"] = new double[] { 46, 26 }, ["skyTower"] = new double[] { 36, 36 }, ["busStand"] = new double[] { 100, 60 }, ["airport"] = new double[] { 600, 380 },
            ["itpl"] = new double[] { 90, 90 }, ["bullTemple"] = new double[] { 50, 50 }, ["tipuPalace"] = new double[] { 50, 36 }, ["townHall"] = new double[] { 60, 44 },
            ["kanteerava"] = new double[] { 160, 104 }, ["manyata"] = new double[] { 150, 110 }, ["kempfortShiva"] = new double[] { 44, 44 }, ["iisc"] = new double[] { 96, 70 },
            ["gurudwara"] = new double[] { 56, 40 }, ["biec"] = new double[] { 200, 170 },
        };

        // Landmarks go in the block at their real location, or the nearest one big enough to hold them.
        void AssignSpecials()
        {
            // Fenced sites the street grid stays out of: the landmark takes the whole site.
            var SITES = new Dictionary<string, Site> { ["airport"] = md.AIRPORT, ["airForceStation"] = md.AIRBASE };
            bool Fits(Block b, SpecialBlock s)
            {
                var nd = NEED.TryGetValue(s.landmark ?? "", out var v) ? v : new double[] { 30, 30 };
                return !b.special && b.zone != "park" && b.zone != "lake" && b.inner.maxX - b.inner.minX >= nd[0] && b.inner.maxZ - b.inner.minZ >= nd[1];
            }
            // siteAt: the real location, for a landmark in a big (rural) block to stand at rather than mid-block.
            void Put(Block b, SpecialBlock s)
            {
                if (s.zone != null) b.zone = s.zone;
                if (s.landmark != null) b.landmark = s.landmark;
                if (s.district != null) b.district = s.district;
                b.special = true; b.siteAt = s.at;
            }
            // First the ones whose own block can hold them, then the rest go to the nearest that can.
            var rest = new List<SpecialBlock>();
            foreach (var s in md.SPECIAL_BLOCKS)
            {
                if (s.landmark != null && SITES.TryGetValue(s.landmark, out var site))
                {
                    // An airfield takes its whole fenced site, whatever shape the block around it is.
                    var ab = blocks.FirstOrDefault(q => RoadNet.PointInPoly(s.at[0], s.at[1], q.poly));
                    if (ab == null) continue;
                    Put(ab, s);
                    double x0 = site.poly[0][0], z0 = site.poly[0][1], x1 = site.poly[2][0], z1 = site.poly[2][1];
                    ab.inner = new BBox { minX = x0 + 20, maxX = x1 - 20, minZ = Math.Max(world.minZ + 20, z0 + 20), maxZ = z1 - 20 };
                    ab.airportSite = true;
                    continue;
                }
                var b = blocks.FirstOrDefault(q => RoadNet.PointInPoly(s.at[0], s.at[1], q.poly));
                if (b != null && Fits(b, s)) Put(b, s); else rest.Add(s);
            }
            foreach (var s in rest)
            {
                Block best = null; double bd = 380;
                foreach (var b in blocks)
                {
                    if (!Fits(b, s)) continue;
                    double d = Hypot(b.cx - s.at[0], b.cz - s.at[1]);
                    if (d < bd) { bd = d; best = b; }
                }
                if (best != null) Put(best, s);
            }
            // Hotels and malls: the block at the site, or the nearest one that can take a tower (it becomes a towers block).
            string[] notTowers = { "park", "lake", "rural", "landmark", "gov" };
            bool Takes(Block b) => !b.edge && b.hotel == null && !notTowers.Contains(b.zone) && (b.landmark == null || b.zone == "towers") &&
                b.inner.maxX - b.inner.minX >= 36 && b.inner.maxZ - b.inner.minZ >= 26;
            // Nearest pairs first, so two sites close together don't push each other a block too far.
            var pairs = new List<(HotelSite h, Block b, double d)>();
            foreach (var h in md.HOTEL_SITES)
                foreach (var b in blocks)
                {
                    if (!Takes(b)) continue;
                    double d = RoadNet.PointInPoly(h.at[0], h.at[1], b.poly) ? 0 : Hypot(b.cx - h.at[0], b.cz - h.at[1]);
                    if (d < 300) pairs.Add((h, b, d));
                }
            var placed = new HashSet<HotelSite>();
            foreach (var (h, b, _) in pairs.OrderBy(p => p.d))
            {
                if (placed.Contains(h) || b.hotel != null) continue;
                placed.Add(h);
                b.hotel = h;
                if (b.zone != "commercial") b.zone = "towers";
            }
        }

        void BlockInfo(Block b)
        {
            foreach (var p in md.PARKS) if (RoadNet.PointInPoly(b.cx, b.cz, p.poly)) { b.zone = "park"; b.district = p.name; b.park = p; return; }
            foreach (var l in md.LAKES) if (RoadNet.PointInPoly(b.cx, b.cz, l.poly)) { b.zone = "lake"; b.district = l.name; b.lakeName = l.name; b.lake = l; return; }
            // Countryside outside the built-up areas.
            bool urban = md.URBAN.Any(p => RoadNet.PointInPoly(b.cx, b.cz, p));
            var list = urban ? md.DISTRICTS : md.RURAL_DISTRICTS;
            var best = list[0]; double bd = double.PositiveInfinity;
            foreach (var d in list) { double dd = Hypot(d.x - b.cx, d.z - b.cz); if (dd < bd) { bd = dd; best = d; } }
            b.zone = best.zone; b.district = best.name; b.pubs = best.pubs;
        }

        // The largest axis-aligned rectangle (with the block's aspect) found around a few centres.
        BBox InnerRect(List<double[]> poly, double cx, double cz)
        {
            double minX = poly.Min(p => p[0]), maxX = poly.Max(p => p[0]), minZ = poly.Min(p => p[1]), maxZ = poly.Max(p => p[1]);
            double hw0 = (maxX - minX) / 2, hd0 = (maxZ - minZ) / 2;
            int[,] probes = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 }, { 0, -1 }, { 1, 0 }, { 0, 1 }, { -1, 0 } };
            double Fit(double ox, double oz)
            {
                bool Ok(double k)
                {
                    double hw = hw0 * k, hd = hd0 * k;
                    for (int i = 0; i < 8; i++) if (!RoadNet.PointInPoly(ox + probes[i, 0] * hw, oz + probes[i, 1] * hd, poly)) return false;
                    return true;
                }
                double lo = 0, hi = 1;
                for (int it = 0; it < 12; it++) { double m = (lo + hi) / 2; if (Ok(m)) lo = m; else hi = m; }
                return lo;
            }
            double bk = Fit(cx, cz), bx = cx, bz = cz;
            // Concave blocks: try other centres on a coarse grid.
            if (bk < 0.45 && poly.Count > 4)
                for (int i = 1; i < 6; i++) for (int j = 1; j < 6; j++)
                {
                    double ox = minX + (maxX - minX) * i / 6, oz = minZ + (maxZ - minZ) * j / 6;
                    if (!RoadNet.PointInPoly(ox, oz, poly)) continue;
                    double k = Fit(ox, oz);
                    if (k > bk) { bk = k; bx = ox; bz = oz; }
                }
            return new BBox { minX = bx - hw0 * bk, maxX = bx + hw0 * bk, minZ = bz - hd0 * bk, maxZ = bz + hd0 * bk };
        }

        // ---------- underpasses, flyovers, railway ----------
        void BuildFeatures()
        {
            underpasses = new List<Underpass>();
            levelCrossings = new List<LevelCrossing>();
            rails = md.RAIL_LINES.Select(l => new Road { name = l.name, pts = l.pts }).ToList();
            var UP = cfg.UNDERPASS;
            Underpass AddUnderpass(NetEdge e, double t, string type, string name)
            {
                double ax = e.a.x, az = e.a.z;
                double dx = (e.b.x - ax) / e.len, dz = (e.b.z - az) / e.len;
                double at = t * e.len;
                e.a.cut.TryGetValue(e.id, out double ca); e.b.cut.TryGetValue(e.id, out double cb);
                double room = Math.Min(at - ca, e.len - at - cb);
                double half = Math.Min(UP.half, room - 4);
                if (half < 32) return null;
                var u = new Underpass
                {
                    edge = e, road = e.r, type = type, name = name, at = at, half = half, depth = UP.depth, flat = UP.flat, waterLevel = -UP.depth - 0.5,
                    cx = ax + dx * at, cz = az + dz * at, ux = dx, uz = dz, hw = e.r.width / 2,
                };
                (e.underpasses ??= new List<Underpass>()).Add(u);
                underpasses.Add(u);
                return u;
            }
            // Where roads cross the railway: an underpass if there's room, else a level crossing.
            foreach (var rail in rails)
                for (int i = 0; i < rail.pts.Count - 1; i++)
                {
                    var p = rail.pts[i]; var q = rail.pts[i + 1];
                    foreach (var e in undirected)
                    {
                        var r = SegX(new[] { e.a.x, e.a.z }, new[] { e.b.x, e.b.z }, p, q);
                        if (r == null) continue;
                        var u = AddUnderpass(e, r[0], "rail", e.r.name + " Railway Underpass");
                        if (u != null) { u.railDirX = q[0] - p[0]; u.railDirZ = q[1] - p[1]; continue; }
                        levelCrossings.Add(new LevelCrossing { edge = e, x = e.a.x + (e.b.x - e.a.x) * r[0], z = e.a.z + (e.b.z - e.a.z) * r[0], rail = rail });
                    }
                }
            foreach (var ru in md.ROAD_UNDERPASSES)
            {
                NetEdge best = null; double bt = 0, bd = 140;
                foreach (var e in undirected)
                {
                    if (e.r.name != ru.road) continue;
                    double t = ProjT(ru.near[0], ru.near[1], e);
                    double d = Hypot(e.a.x + (e.b.x - e.a.x) * t - ru.near[0], e.a.z + (e.b.z - e.a.z) * t - ru.near[1]);
                    if (d < bd && e.underpasses == null) { bd = d; best = e; bt = Math.Max(0.3, Math.Min(0.7, t)); }
                }
                if (best != null) AddUnderpass(best, bt, "road", ru.name);
            }
            flyovers = new List<Flyover>();
            foreach (var fs in md.FLYOVER_SITES)
            {
                NetNode node = null; double bd = 80;
                foreach (var n in nodes) { double d = Hypot(n.x - fs.at[0], n.z - fs.at[1]); if (d < bd && n.adj.Count >= 3) { bd = d; node = n; } }
                if (node == null) continue;
                var along = node.adj.Where(h => h.e.r.name == fs.road).ToList();
                if (along.Count < 2) continue;
                // Two straight arms, one along each approach, so the deck follows a road that bends here.
                var arms = along.Take(2).Select(h => new FlyoverArm { ux = h.ux, uz = h.uz, half = Math.Min(fs.half, h.e.len - 18) }).ToList();
                if (arms.Any(a => a.half < 60)) continue;
                var road = along[0].e.r;
                var f = new Flyover { name = fs.name, node = node, road = road, arms = arms, cx = node.x, cz = node.z, half = arms.Max(a => a.half), height = fs.height, flat = 0.45, hw = road.median / 2 + RoadNet.LANE_W };
                flyovers.Add(f);
                foreach (var h in along) foreach (var d in h.e.dirs) d.flyover = f;
            }
        }

        // Road surface height inside an underpass, as a function of distance along its road.
        public double Dip(Underpass u, double along) => -u.depth * (1 - Smooth(u.flat, 1, Math.Abs(along) / u.half));
        public double DeckHeight(Flyover f, double along, FlyoverArm arm = null) => f.height * (1 - Smooth(f.flat, 1, Math.Abs(along) / (arm ?? f.arms[0]).half));

        public void Local(Underpass o, double x, double z, out double along, out double lat)
        {
            double dx = x - o.cx, dz = z - o.cz;
            along = dx * o.ux + dz * o.uz; lat = -dx * o.uz + dz * o.ux;
        }

        public Underpass UnderpassAt(double x, double z)
        {
            foreach (var u in underpasses)
            {
                if (Math.Abs(x - u.cx) > u.half + 12 || Math.Abs(z - u.cz) > u.half + 12) continue;
                Local(u, x, z, out double along, out double lat);
                if (Math.Abs(along) < u.half && Math.Abs(lat) < u.hw) return u;
            }
            return null;
        }

        // The deck under/over (x, z), if any.
        public FlyoverHit? FlyoverAt(double x, double z)
        {
            foreach (var f in flyovers)
            {
                if (Math.Abs(x - f.cx) > f.half + 12 || Math.Abs(z - f.cz) > f.half + 12) continue;
                double dx = x - f.cx, dz = z - f.cz;
                foreach (var arm in f.arms)
                {
                    double along = dx * arm.ux + dz * arm.uz, lat = -dx * arm.uz + dz * arm.ux;
                    if (along > -f.hw && along < arm.half && Math.Abs(lat) < f.hw) return new FlyoverHit { f = f, arm = arm, along = Math.Max(0, along) };
                }
            }
            return null;
        }

        // ---------- spatial index ----------
        void BuildIndex()
        {
            var W = world;
            rw = (int)Math.Ceiling((W.maxX - W.minX) / RASTER); rh = (int)Math.Ceiling((W.maxZ - W.minZ) / RASTER);
            raster = new int[rw * rh];
            for (int i = 0; i < raster.Length; i++) raster[i] = -1;
            allBlocks = blocks.Concat(islands).ToList();
            var xsI = new List<double>();
            for (int idx = 0; idx < allBlocks.Count; idx++)
            {
                var p = allBlocks[idx].poly;
                int z0 = Math.Max(0, (int)Math.Floor((p.Min(q => q[1]) - W.minZ) / RASTER));
                int z1 = Math.Min(rh - 1, (int)Math.Floor((p.Max(q => q[1]) - W.minZ) / RASTER));
                for (int j = z0; j <= z1; j++)
                {
                    double z = W.minZ + (j + 0.5) * RASTER;
                    xsI.Clear();
                    for (int i = 0; i < p.Count; i++)
                    {
                        double xa = p[i][0], za = p[i][1], xb = p[(i + 1) % p.Count][0], zb = p[(i + 1) % p.Count][1];
                        if ((za > z) != (zb > z)) xsI.Add(xa + (z - za) / (zb - za) * (xb - xa));
                    }
                    xsI.Sort();
                    for (int k = 0; k + 1 < xsI.Count; k += 2)
                    {
                        int i0 = Math.Max(0, (int)Math.Ceiling((xsI[k] - W.minX) / RASTER - 0.5)), i1 = Math.Min(rw - 1, (int)Math.Floor((xsI[k + 1] - W.minX) / RASTER - 0.5));
                        for (int i = i0; i <= i1; i++) raster[j * rw + i] = idx;
                    }
                }
            }
            // Edges by cell for "which road am I on".
            edgeCells = new Dictionary<long, List<NetEdge>>();
            var keys = new HashSet<long>();
            foreach (var e in undirected)
            {
                int n = (int)Math.Ceiling(e.len / 10);
                keys.Clear();
                for (int k = 0; k <= n; k++)
                {
                    double x = e.a.x + (e.b.x - e.a.x) * k / n, z = e.a.z + (e.b.z - e.a.z) * k / n;
                    for (int dx = -1; dx <= 1; dx++) for (int dz = -1; dz <= 1; dz++) keys.Add(Key((long)Math.Floor(x / EC) + dx, (long)Math.Floor(z / EC) + dz));
                }
                foreach (var key in keys) { if (!edgeCells.TryGetValue(key, out var l)) edgeCells[key] = l = new List<NetEdge>(); l.Add(e); }
            }
            nodeCells = new Dictionary<long, List<NetNode>>();
            foreach (var n in nodes)
            {
                long key = Key((long)Math.Floor(n.x / NC), (long)Math.Floor(n.z / NC));
                if (!nodeCells.TryGetValue(key, out var l)) nodeCells[key] = l = new List<NetNode>();
                l.Add(n);
            }
        }

        public int BlockIndexAt(double x, double z)
        {
            int i = (int)Math.Floor((x - world.minX) / RASTER), j = (int)Math.Floor((z - world.minZ) / RASTER);
            if (i < 0 || j < 0 || i >= rw || j >= rh) return -1;
            return raster[j * rw + i];
        }

        // Exact: is (x, z) on a footpath/block (rather than the road)?
        public Block BlockContaining(double x, double z)
        {
            int i = (int)Math.Floor((x - world.minX) / RASTER), j = (int)Math.Floor((z - world.minZ) / RASTER);
            int ns = 0;
            for (int dj = -1; dj <= 1; dj++) for (int di = -1; di <= 1; di++)
            {
                int ii = i + di, jj = j + dj;
                if (ii < 0 || jj < 0 || ii >= rw || jj >= rh) continue;
                int idx = raster[jj * rw + ii];
                if (idx < 0) continue;
                bool dup = false;
                for (int q = 0; q < ns; q++) if (_seen[q] == idx) { dup = true; break; }
                if (dup) continue;
                _seen[ns++] = idx;
                if (di == 0 && dj == 0 && InteriorCell(ii, jj, idx)) return allBlocks[idx];
                if (RoadNet.PointInPoly(x, z, allBlocks[idx].poly)) return allBlocks[idx];
            }
            return null;
        }

        // A raster cell whose four neighbours all lie in the same block is safely inside it.
        bool InteriorCell(int i, int j, int idx)
        {
            int At(int ii, int jj) => ii < 0 || jj < 0 || ii >= rw || jj >= rh ? -1 : raster[jj * rw + ii];
            return At(i - 1, j) == idx && At(i + 1, j) == idx && At(i, j - 1) == idx && At(i, j + 1) == idx;
        }

        public Block BlockAt(double x, double z)
        {
            var b = BlockContaining(x, z);
            if (b != null && !b.island) return b;
            // On a road: the nearest block in the raster, searching outwards ring by ring.
            int ci = (int)Math.Floor((x - world.minX) / RASTER), cj = (int)Math.Floor((z - world.minZ) / RASTER);
            for (int r = 0; r <= 24; r++)
                for (int dj = -r; dj <= r; dj++) for (int di = -r; di <= r; di++)
                {
                    if (Math.Max(Math.Abs(di), Math.Abs(dj)) != r) continue;
                    int i = ci + di, j = cj + dj;
                    if (i < 0 || j < 0 || i >= rw || j >= rh) continue;
                    int idx = raster[j * rw + i];
                    if (idx >= 0 && !allBlocks[idx].island) return allBlocks[idx];
                }
            Block best = blocks[0]; double bd = double.PositiveInfinity;
            foreach (var q in blocks) { double d = Math.Abs(q.cx - x) + Math.Abs(q.cz - z); if (d < bd) { bd = d; best = q; } }
            return best;
        }

        public EdgeHit? EdgeAt(double x, double z)
        {
            if (!edgeCells.TryGetValue(Key((long)Math.Floor(x / EC), (long)Math.Floor(z / EC)), out var list)) return null;
            EdgeHit? best = null; double bd = double.PositiveInfinity;
            foreach (var e in list)
            {
                double t = ProjT(x, z, e);
                double px = e.a.x + (e.b.x - e.a.x) * t, pz = e.a.z + (e.b.z - e.a.z) * t;
                double d = Hypot(px - x, pz - z);
                if (d < bd) { bd = d; best = new EdgeHit { e = e, t = t, d = d }; }
            }
            return best;
        }

        public Road RoadAt(double x, double z)
        {
            var h = EdgeAt(x, z);
            return h != null && h.Value.d <= h.Value.e.r.width / 2 + 0.5 ? h.Value.e.r : null;
        }

        public NetNode NearestNode(double x, double z)
        {
            long cx = (long)Math.Floor(x / NC), cz = (long)Math.Floor(z / NC);
            NetNode best = null; double bd = double.PositiveInfinity;
            void Scan(long kx, long kz)
            {
                if (!nodeCells.TryGetValue(Key(kx, kz), out var l)) return;
                foreach (var n in l) { double d = Hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
            }
            for (int r = 0; r < 6 && best == null; r++)
            {
                for (int dx = -r; dx <= r; dx++) for (int dz = -r; dz <= r; dz++)
                {
                    if (Math.Max(Math.Abs(dx), Math.Abs(dz)) != r) continue;
                    Scan(cx + dx, cz + dz);
                }
                if (best != null && r == 0) { r++; for (int dx = -1; dx <= 1; dx++) for (int dz = -1; dz <= 1; dz++) Scan(cx + dx, cz + dz); } // check the first ring too
            }
            return best ?? nodes[0];
        }

        public string JunctionNear(double x, double z, double radius = 30)
        {
            var n = NearestNode(x, z);
            return n != null && n.name != null && Hypot(n.x - x, n.z - z) < radius ? n.name : null;
        }

        // Surface height. Pass the current height `y` to choose between levels on a flyover.
        public double GroundHeight(double x, double z, double? y = null)
        {
            if (BlockContaining(x, z) != null) return GameConfig.CURB_H;
            double g = 0;
            var u = underpasses.Count > 0 ? UnderpassAt(x, z) : null;
            if (u != null) { Local(u, x, z, out double along, out _); g = Dip(u, along); }
            if (y != null && flyovers.Count > 0)
            {
                var hit = FlyoverAt(x, z);
                if (hit != null)
                {
                    double h = DeckHeight(hit.Value.f, hit.Value.along, hit.Value.arm);
                    if (h > 0.02 && y.Value > h - 1.6) g = Math.Max(g, h);
                }
            }
            return g;
        }

        public static double ProjT(double x, double z, NetEdge e)
        {
            double abx = e.b.x - e.a.x, abz = e.b.z - e.a.z, l2 = abx * abx + abz * abz; if (l2 == 0) l2 = 1;
            return Math.Max(0, Math.Min(1, ((x - e.a.x) * abx + (z - e.a.z) * abz) / l2));
        }

        static double[] SegX(double[] a, double[] b, double[] c, double[] d)
        {
            double r0 = b[0] - a[0], r1 = b[1] - a[1], s0 = d[0] - c[0], s1 = d[1] - c[1];
            double den = r0 * s1 - r1 * s0;
            if (Math.Abs(den) < 1e-9) return null;
            double q0 = c[0] - a[0], q1 = c[1] - a[1];
            double t = (q0 * s1 - q1 * s0) / den, u = (q0 * r1 - q1 * r0) / den;
            return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? new[] { t, u } : null;
        }
    }
}
