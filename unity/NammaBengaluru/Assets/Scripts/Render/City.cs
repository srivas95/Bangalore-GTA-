// Builds the static city on the real road network: ground, roads and junctions, kerbed footpaths
// around polygon blocks, buildings on lots that face their road, trees, lamps and water tanks.
// Port of buildCity (src/world/city.js) and buildInfrastructure (src/world/infrastructure.js),
// drawing from the same seeded RNG in the same order.
// The landmarks are replayed from the web game's own builders and Cubbon Park is ported in
// City.Landmarks.cs; the railway is in City.Railway.cs. The Poly Haven street props' spots are
// collected in `props` (StreetProps draws them); text signs are collected in `signs` and put up
// by TextSigns.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.World;
using UnityEngine;

namespace NammaBengaluru.Render
{
    public class Lot { public Frame f; public double minX, maxX, minZ, maxZ; public string face = "s"; public bool road; public double roadW; }
    public class TreeSpec { public double x, z, s, y; public int t; public bool noCollide; }
    public class TextSign
    {
        public string key, bg, fg, font, face; public string[] text, fonts; public double x, y, z, w, h, rotY;
        public int texH;             // canvas height for textTexture (default: 1024 * h / w, at least 64)
        public float emissive = 0.05f; // MeshStandardMaterial emissiveIntensity
        public bool basic;           // MeshBasicMaterial (metro boards): unlit
    }
    public class Poi
    {
        public string name, district; public double x, z, heading;
        public List<Poi> busBays;       // the bus stand: bays a parked bus can nose into
        public List<CrowdSpot> crowds;  // ... and people waiting on its platforms
    }
    public class CrowdSpot { public double x, z; public int n; public double[] spread; public double? face; }
    public class Pois
    {
        public List<Poi> food = new List<Poi>(), homes = new List<Poi>(), landmarks = new List<Poi>(), parking = new List<Poi>(), industrial = new List<Poi>(), fuel = new List<Poi>(), garages = new List<Poi>();
    }
    public class PropSpot { public string k; public double x, y, z, ry; }

    public class CityResult
    {
        public List<LandmarkAnim> anims; // the landmarks that move (the airport's jet, the Surya Kiran)
        public Pois pois;
        public List<TreeSpec> trees;
        public List<double[]> lamps; // x, z, armX, armZ, run
        public List<double[]> lampHeads;
        public List<double[]> tanks; // x, y, z, scale
        public List<TextSign> signs;
        public List<PropSpot> props;
        public Dictionary<string, Material> materials;
        public Transform root;
        public RailWorld rail;
    }

    public partial class City
    {
        static readonly int[] PASTELS = { 0xf2ead8, 0xeedfc0, 0xe6cfa4, 0xe3c494, 0xd9ad84, 0xdba48a, 0xcdd2b4, 0xbccad4, 0xdcd8d0, 0xeac6b6, 0xe2d8e6, 0xd2e0d6, 0xf4eee2, 0xe8dcc8 };
        static readonly int[] BRIGHTS = { 0xe6a878, 0x9cc6b6, 0xe4cc6a, 0xa8c2e0, 0xd0aed2, 0xeaae9e, 0xa8cfa4, 0xe4b062, 0xd8846a };
        const double FLOOR_H = 3.2, SHOP_H = 4, CHUNK = 320, ROAD_TILE = 12;
        const double CURB_H = GameConfig.CURB_H;
        static readonly double[] FACADE_TILE = { 7, 6.4 }, GLASS_TILE = { 8, 12.8 }, SHOP_TILE = { 8, 4 };
        const int SIGN_COLS = 4, SIGN_ROWS = 16;
        static readonly Dictionary<string, double> FACE_ROT = new Dictionary<string, double> { ["s"] = 0, ["n"] = Math.PI, ["e"] = Math.PI / 2, ["w"] = -Math.PI / 2 };

        readonly Layout layout;
        readonly Colliders colliders;
        readonly MapData md;
        readonly GameConfig cfg;
        readonly Mulberry32 rng = new Mulberry32(20240607);
        readonly BuilderSet B = new BuilderSet(CHUNK);
        readonly Dictionary<string, Material> mats;
        readonly Transform group;

        readonly List<TreeSpec> trees = new List<TreeSpec>();
        readonly List<double[]> lamps = new List<double[]>();
        readonly List<double[]> tanks = new List<double[]>();
        readonly List<TextSign> signs = new List<TextSign>();
        readonly List<PropSpot> props = new List<PropSpot>();
        readonly Pois pois = new Pois();
        int runId;
        readonly Dictionary<string, List<int>> pools = new Dictionary<string, List<int>> { ["general"] = new List<int>(), ["pub"] = new List<int>(), ["industrial"] = new List<int>() };
        readonly Dictionary<string, int> poolIdx = new Dictionary<string, int> { ["general"] = 0, ["pub"] = 0, ["industrial"] = 0 };
        readonly List<(ShopSign s, int k, bool placed)> homeBrands = new List<(ShopSign, int, bool)>();
        readonly List<double[]> stations = new List<double[]>();
        int fuelIdx;
        // Rail (and, later, metro) corridors in a coarse grid for nearRail.
        const double RC = 64;
        readonly Dictionary<long, List<double[]>> railGrid = new Dictionary<long, List<double[]>>();

        double Rand(double a = 0, double b = 1) => a + (b - a) * rng.Next();
        T Pick<T>(IList<T> arr) => arr[(int)Math.Floor(rng.Next() * arr.Count)];
        static double JRound(double v) => Math.Floor(v + 0.5); // Math.round in JS
        static double Hypot(double a, double b) => Math.Sqrt(a * a + b * b);

        City(Layout layout, Colliders colliders, MapData md, GameConfig cfg, Transform parent)
        {
            this.layout = layout; this.colliders = colliders; this.md = md; this.cfg = cfg;
            var go = new GameObject("city");
            go.transform.SetParent(parent, false);
            group = go.transform;
            mats = CityMaterials.Build();
            int signCount = SIGN_COLS * SIGN_ROWS;
            for (int k = 0; k < signCount; k++)
            {
                var s = cfg.SHOP_SIGNS[k % cfg.SHOP_SIGNS.Count];
                if (s.industrial) pools["industrial"].Add(k); else pools["general"].Add(k);
                if (s.pub) pools["pub"].Add(k);
            }
            for (int k = 0; k < cfg.SHOP_SIGNS.Count; k++) if (cfg.SHOP_SIGNS[k].home != null) homeBrands.Add((cfg.SHOP_SIGNS[k], k, false));
        }

        public static CityResult Build(Layout layout, Colliders colliders, MapData md, GameConfig cfg, Transform parent)
        {
            var c = new City(layout, colliders, md, cfg, parent);
            return c.Run();
        }

        // ---------- frames ----------
        void W(double x, double z, out double wx, out double wz) { var f = B.xf; if (f == null) { wx = x; wz = z; } else f.ToWorld(x, z, out wx, out wz); }
        bool OnCarriageway(double x, double z, double pad = 0, bool withMedian = true)
        {
            var h = layout.EdgeAt(x, z);
            if (h == null) return false;
            var r = h.Value.e.r;
            return h.Value.d < r.width / 2 + pad && (withMedian || h.Value.d > r.median / 2 - 0.2);
        }
        IColliderSink Col() => colliders.Framed(B.xf);
        void Sign(TextSign sg)
        {
            W(sg.x, sg.z, out double x, out double z);
            sg.x = x; sg.z = z; sg.rotY = FACE_ROT[sg.face] + (B.xf != null ? B.xf.ang : 0);
            signs.Add(sg);
        }
        void TreeAt(double x, double z, double s, int t) { W(x, z, out double wx, out double wz); trees.Add(new TreeSpec { x = wx, z = wz, s = s, t = t }); }

        CityResult Run()
        {
            // ---------- Ground: soil everywhere, with holes where roads dip into underpasses ----------
            {
                var gb = new BuilderSet();
                var Wd = layout.world; double pad = 1600;
                var outer = new List<double[]> { new[] { Wd.minX - pad, Wd.minZ - pad }, new[] { Wd.maxX + pad, Wd.minZ - pad }, new[] { Wd.maxX + pad, Wd.maxZ + pad }, new[] { Wd.minX - pad, Wd.maxZ + pad } };
                var holes = new List<IList<double[]>>();
                foreach (var u in layout.underpasses)
                {
                    double px = -u.uz, pz = u.ux, a = u.half, w = u.hw + 0.3;
                    holes.Add(new List<double[]> {
                        new[] { u.cx - u.ux * a - px * w, u.cz - u.uz * a - pz * w }, new[] { u.cx + u.ux * a - px * w, u.cz + u.uz * a - pz * w },
                        new[] { u.cx + u.ux * a + px * w, u.cz + u.uz * a + pz * w }, new[] { u.cx - u.ux * a + px * w, u.cz - u.uz * a + pz * w } });
                }
                Geom.FillPoly(gb.Get("ground"), outer, -0.05, LinColor.White, (x, z) => (x / 8, -z / 8), holes);
                gb.BuildAll(mats, group, new Dictionary<string, bool> { ["ground"] = false });
            }

            Infrastructure();
            foreach (var r in layout.rails) AddSegs(r.pts, 0);
            // Keep the ground under metro viaducts and stations clear too.
            foreach (var m in MetroSegs()) AddSegs(m.pts, m.r - 9);

            // Park landmarks go to the largest blocks of each park.
            foreach (var p in layout.blocks.Where(b => b.park != null).Select(b => b.park).Distinct())
            {
                var bl = layout.blocks.Where(b => b.park == p).OrderByDescending(b => b.area).ToList();
                if (p.landmarks != null) for (int k = 0; k < p.landmarks.Count; k++) if (k < bl.Count) bl[k].landmark = p.landmarks[k];
            }

            // ---------- Blocks ----------
            var sw = B.Get("sidewalk");
            foreach (var block in layout.blocks.Concat(layout.islands))
            {
                Geom.FillPoly(sw, block.poly, CURB_H, LinColor.White, (x, z) => (x / 2.2, -z / 2.2));
                Geom.PolyWalls(sw, block.poly, 0, CURB_H, 0xd0ccc4, tile: 2);
                if (block.island) { if (block.innerPoly != null) Lawn(block, 0xa8b878); continue; }
                AvenueTrees(block);
                StreetLamps(block);
                StreetProps(block);
                block.placed = new List<double[][]>();
                BuildZone(block);
            }

            // ---------- Bake merged meshes ----------
            B.xf = null;
            var noShadow = new Dictionary<string, bool> { ["junction"] = false, ["zebra"] = false, ["grass"] = false, ["plaza"] = false, ["signs"] = false, ["glow"] = false, ["sidewalk"] = false };
            foreach (var k in mats.Keys) if (k.StartsWith("road_")) noShadow[k] = false;
            B.BuildAll(mats, group, noShadow);

            var lampHeads = new List<double[]>();
            BuildLamps(lampHeads);
            var forest = group.gameObject.AddComponent<InstancedForest>();
            forest.Init(trees.Where(t => !OnCarriageway(t.x, t.z, 0.6, false)).ToList(), tanks, mats, colliders);

            return new CityResult { anims = anims, pois = pois, trees = trees, lamps = lamps, lampHeads = lampHeads, tanks = tanks, signs = signs, props = props, materials = mats, root = group, rail = rail };
        }

        // ---------- helpers shared with landmarks ----------
        static List<double[]> RectPoly(BBox r) => new List<double[]> { new[] { r.minX, r.minZ }, new[] { r.maxX, r.minZ }, new[] { r.maxX, r.maxZ }, new[] { r.minX, r.maxZ } };
        void Lawn(Block block, LinColor? color = null) => Geom.FillPoly(B.Get("grass"), block.innerPoly ?? RectPoly(block.inner), CURB_H + 0.01, color ?? LinColor.White, (x, z) => (x / 6, -z / 6));
        void Plaza(Block block, LinColor? color = null) => Geom.FillPoly(B.Get("plaza"), block.innerPoly ?? RectPoly(block.inner), CURB_H + 0.01, color ?? LinColor.White, (x, z) => (x / 5, -z / 5));

        // The metro's footprint (city.js): along the track between any two stations that aren't
        // both underground, the wider covered ramps, and the elevated station boxes.
        List<(List<double[]> pts, double r)> MetroSegs()
        {
            var output = new List<(List<double[]>, double)>();
            foreach (var line in MetroRoutes.Routes(layout, md))
            {
                for (int i = 0; i < line.stations.Count - 1; i++)
                {
                    var a = line.stations[i]; var b = line.stations[i + 1];
                    if (a.underground && b.underground) continue;
                    var pts = new List<double[]>();
                    for (double s = a.s; s <= b.s + 1e-6; s += 10) { var p = line.path.AtS(Math.Min(s, b.s)); pts.Add(new[] { p.x, p.z }); }
                    output.Add((pts, 5.5));
                }
                foreach (var r in line.ramps)
                {
                    var pts = new List<double[]>();
                    for (double s = r.s1 - 20; s <= r.s1 + r.L + 20; s += 10) { var p = line.path.AtS(s); pts.Add(new[] { p.x, p.z }); }
                    output.Add((pts, 9));
                }
                foreach (var st in line.stations)
                {
                    if (st.underground) continue;
                    var a = line.path.AtS(st.s - 5); var b = line.path.AtS(st.s + 5);
                    double dx = b.x - a.x, dz = b.z - a.z, l = Math.Sqrt(dx * dx + dz * dz); if (l == 0) l = 1;
                    output.Add((new List<double[]> { new[] { st.x - dx / l * 38, st.z - dz / l * 38 }, new[] { st.x + dx / l * 38, st.z + dz / l * 38 } }, 13));
                }
            }
            return output;
        }

        void AddSegs(IList<double[]> pts, double pad)
        {
            for (int i = 0; i < pts.Count - 1; i++)
            {
                double ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
                var seg = new[] { ax, az, bx, bz, pad };
                for (long gi = (long)Math.Floor(Math.Min(ax, bx) / RC); gi <= (long)Math.Floor(Math.Max(ax, bx) / RC); gi++)
                    for (long gj = (long)Math.Floor(Math.Min(az, bz) / RC); gj <= (long)Math.Floor(Math.Max(az, bz) / RC); gj++)
                    {
                        long k = gi * 100003 + gj;
                        if (!railGrid.TryGetValue(k, out var l)) railGrid[k] = l = new List<double[]>();
                        l.Add(seg);
                    }
            }
        }

        static double SegDist(double x, double z, double[] g)
        {
            double abx = g[2] - g[0], abz = g[3] - g[1], l2 = abx * abx + abz * abz; if (l2 == 0) l2 = 1;
            double t = Math.Max(0, Math.Min(1, ((x - g[0]) * abx + (z - g[1]) * abz) / l2));
            return Hypot(g[0] + abx * t - x, g[1] + abz * t - z);
        }

        bool NearRail(double x, double z, double d)
        {
            double reach = d + 8;
            for (long gi = (long)Math.Floor((x - reach) / RC); gi <= (long)Math.Floor((x + reach) / RC); gi++)
                for (long gj = (long)Math.Floor((z - reach) / RC); gj <= (long)Math.Floor((z + reach) / RC); gj++)
                    if (railGrid.TryGetValue(gi * 100003 + gj, out var list))
                        foreach (var g in list) if (SegDist(x, z, g) < g[4] + d) return true;
            return false;
        }

        // =====================================================================================
        // Infrastructure (src/world/infrastructure.js): carriageways, junction pads, zebras, medians,
        // underpasses, flyovers, the toll plaza, dead ends and the world bounds.
        // =====================================================================================
        string EnsureRoadMat(int lanes, double median)
        {
            string key = CityMaterials.RoadKey(lanes, median);
            if (!mats.ContainsKey(key)) mats[key] = CityMaterials.Road(key);
            return key;
        }
        static Frame FrameAlong(double cx, double cz, double ux, double uz) => new Frame(cx, cz, Math.Atan2(ux, uz));

        // A road strip along local z (x0..x1 across), following yFn(z).
        void StripZ(ChunkBuilder b, double x0, double x1, double a0, double a1, Func<double, double> yFn, double step = 2.5)
        {
            for (double a = a0; a < a1 - 1e-6; a += step)
            {
                double za = a, zb = Math.Min(a + step, a1), ya = yFn(za), yb = yFn(zb);
                double slope = (yb - ya) / (zb - za), l = Math.Sqrt(1 + slope * slope);
                var n = new[] { 0, 1 / l, -slope / l };
                b.Quad4(new[] { x0, yb, zb }, new[] { x1, yb, zb }, new[] { x1, ya, za }, new[] { x0, ya, za }, n,
                    new[] { 0, -zb / ROAD_TILE }, new[] { 1, -zb / ROAD_TILE }, new[] { 1, -za / ROAD_TILE }, new[] { 0, -za / ROAD_TILE }, LinColor.White);
            }
        }

        void Infrastructure()
        {
            var concrete = B.Get("stone");
            // ---------- Carriageways ----------
            foreach (var e in layout.undirected)
            {
                var r = e.r; double w = r.width / 2;
                var b = B.Get(EnsureRoadMat(r.lanes, r.median));
                var a = e.a; double len = e.len;
                double ux = (e.b.x - a.x) / len, uz = (e.b.z - a.z) / len, px = -uz, pz = ux;
                a.cut.TryGetValue(e.id, out double cutA); e.b.cut.TryGetValue(e.id, out double cutB);
                double ta = cutA, tb = len - cutB;
                if (tb - ta < 0.5) continue;
                var Ea = layout.EdgeEnd(a, e); var Eb = layout.EdgeEnd(e.b, e);
                var ups = (e.underpasses ?? new List<Underpass>()).OrderBy(p => p.at).ToList();
                var st = new List<double>();
                void Push(double t) { if (st.Count == 0 || t - st[st.Count - 1] > 0.05) st.Add(t); }
                Push(ta);
                double tt = ta;
                foreach (var u in ups)
                {
                    for (double s = tt + 60; s < u.at - u.half - 5; s += 60) Push(s);
                    for (double s = u.at - u.half; s <= u.at + u.half + 1e-6; s += 2.5) Push(s);
                    tt = u.at + u.half;
                }
                for (double s = tt + 60; s < tb - 5; s += 60) Push(s);
                Push(tb);
                if (st.Count < 2) continue;
                double HAt(double s) { foreach (var u in ups) if (Math.Abs(s - u.at) < u.half) return layout.Dip(u, s - u.at) + 0.01; return 0.01; }
                double[] Pt(double s, double side) => new[] { a.x + ux * s + px * w * side, a.z + uz * s + pz * w * side };
                double[] UV(double x, double z) { double dx = x - a.x, dz = z - a.z; return new[] { (dx * px + dz * pz + w) / (2 * w), -(dx * ux + dz * uz) / ROAD_TILE }; }
                for (int k = 0; k < st.Count - 1; k++)
                {
                    double s0 = st[k], s1 = st[k + 1];
                    var L0 = k == 0 ? Ea[0] : Pt(s0, 1); var R0 = k == 0 ? Ea[1] : Pt(s0, -1);
                    var L1 = k == st.Count - 2 ? Eb[1] : Pt(s1, 1); var R1 = k == st.Count - 2 ? Eb[0] : Pt(s1, -1);
                    double y0 = HAt(s0), y1 = HAt(s1);
                    var P = new[] { new[] { R0[0], y0, R0[1] }, new[] { R1[0], y1, R1[1] }, new[] { L1[0], y1, L1[1] }, new[] { L0[0], y0, L0[1] } };
                    Geom.QuadPts(b, P[0], P[1], P[2], P[3], P.Select(q => UV(q[0], q[2])).ToArray(), LinColor.White);
                }
            }

            // ---------- Junction pads and zebra crossings ----------
            var jb = B.Get("junction"); var zb = B.Get("zebra");
            foreach (var n in layout.nodes)
            {
                if (n.through) continue;
                var poly = new List<double[]>();
                for (int i = 0; i < n.adj.Count; i++)
                {
                    var ends = layout.EdgeEnd(n, n.adj[i].e);
                    poly.Add(ends[1]); poly.Add(ends[0]);
                    if (i < n.corners.Count && n.adj.Count > 1) poly.Add(new[] { n.corners[i].x, n.corners[i].z });
                }
                Geom.FanPoly(jb, n.x, n.z, poly, 0.02, LinColor.White, (x, z) => (x / 8, -z / 8));
                if (n.adj.Count < 3) continue;
                foreach (var h in n.adj)
                {
                    n.cut.TryGetValue(h.e.id, out double cut);
                    if (h.e.len < cut + 12) continue;
                    double px = -h.uz, pz = h.ux;
                    double[] P(double al, double lat) => new[] { n.x + h.ux * al + px * lat, 0.025, n.z + h.uz * al + pz * lat };
                    var q = new[] { P(cut + 0.6, -h.w), P(cut + 3.6, -h.w), P(cut + 3.6, h.w), P(cut + 0.6, h.w) };
                    var zuv = new[] { new[] { -h.w / 8, 0.6 / 8 }, new[] { -h.w / 8, 3.6 / 8 }, new[] { h.w / 8, 3.6 / 8 }, new[] { h.w / 8, 0.6 / 8 } };
                    Geom.QuadPts(zb, q[0], q[1], q[2], q[3], zuv, LinColor.White);
                }
            }

            // ---------- Raised medians, gaps at junctions (none under flyovers or in underpasses) ----------
            var sw = B.Get("sidewalk"); var grass = B.Get("grass"); var stone = B.Get("stone");
            var shrub = Primitives.Icosahedron(1);
            foreach (var e in layout.undirected)
            {
                var r = e.r;
                if (r.median == 0) continue;
                var a = e.a; double len = e.len;
                double ux = (e.b.x - a.x) / len, uz = (e.b.z - a.z) / len;
                a.cut.TryGetValue(e.id, out double ca); e.b.cut.TryGetValue(e.id, out double cb);
                double gapA = a.through ? 0 : ca + 4, gapB = e.b.through ? 0 : cb + 4;
                var cuts = new List<double[]>();
                if (e.underpasses != null) foreach (var u in e.underpasses) cuts.Add(new[] { u.at - u.half - 2, u.at + u.half + 2 });
                foreach (var f in layout.flyovers) { if (f.node == a) cuts.Add(new[] { -1, f.half }); if (f.node == e.b) cuts.Add(new[] { len - f.half, len + 1 }); }
                cuts = cuts.OrderBy(c => c[0]).ToList();
                cuts.Add(new[] { len - gapB, len + 1e9 });
                double s = gapA;
                foreach (var c in cuts)
                {
                    double end = Math.Min(c[0], len - gapB);
                    if (end > s + 1)
                    {
                        double mid = (s + end) / 2, l = end - s, mw = r.median - 0.4;
                        var f = FrameAlong(a.x + ux * mid, a.z + uz * mid, ux, uz);
                        B.xf = f;
                        sw.Box(0, 0, 0, mw, 0.35, l, 0xb0aaa0, new BoxOpts { tileW = 2, tileH = 2, topBuilder = grass, topTile = 4 });
                        colliders.Framed(f).AddCentered(0, 0, mw, l, 0.9, "median");
                        for (double k = -l / 2 + 4; k < l / 2 - 3; k += 9) stone.Put(shrub, 0, 0.75, k, 0x4f7a32, k, 0.8, 0.55, 0.8);
                        B.xf = null;
                    }
                    s = Math.Max(s, c[1]);
                }
            }

            // ---------- Underpasses ----------
            foreach (var u in layout.underpasses)
            {
                var r = u.road; double hw = r.width / 2;
                var f = FrameAlong(u.cx, u.cz, u.ux, u.uz);
                var col = colliders.Framed(f);
                B.xf = f;
                double top = CURB_H + 1.0, step = 2.5;
                foreach (var (x, inward) in new[] { (-hw, 1.0), (hw, -1.0) })
                {
                    for (double a = -u.half; a < u.half - 1e-6; a += step)
                    {
                        double za = a, zb2 = a + step, ya = layout.Dip(u, za), yb = layout.Dip(u, zb2), xi = x + inward * 0.02;
                        var n = new[] { inward, 0, 0 };
                        if (inward < 0) concrete.Quad4(new[] { xi, ya, za }, new[] { xi, yb, zb2 }, new[] { xi, top, zb2 }, new[] { xi, top, za }, n, new double[] { 0, 0 }, new double[] { 1, 0 }, new double[] { 1, 1 }, new double[] { 0, 1 }, 0x9a958c);
                        else concrete.Quad4(new[] { xi, yb, zb2 }, new[] { xi, ya, za }, new[] { xi, top, za }, new[] { xi, top, zb2 }, n, new double[] { 0, 0 }, new double[] { 1, 0 }, new double[] { 1, 1 }, new double[] { 0, 1 }, 0x9a958c);
                    }
                    double wx = x - inward * 0.15;
                    concrete.Box(wx, CURB_H, 0, 0.3, top - CURB_H, u.half * 2, 0xb0aaa0);
                    for (double a = -u.half; a < u.half; a += 2) concrete.Box(wx, top, a + 0.5, 0.32, 0.12, 1, 0xf2c200);
                    col.AddCentered(wx, 0, 0.3, u.half * 2, top + 0.05, "wall");
                }
                // Deck: a road bridge crossing square above, or the railway bridge along the track.
                double deckW = 15, span = r.width + 1.2;
                if (u.type == "rail")
                {
                    deckW = 11;
                    double rl = Hypot(u.railDirX, u.railDirZ); if (rl == 0) rl = 1;
                    double sin = Math.Max(0.35, Math.Abs((u.railDirX * u.uz - u.railDirZ * u.ux) / rl));
                    span = (r.width + 1.2) / sin + 4;
                    B.xf = new Frame(u.cx, u.cz, Math.Atan2(-u.railDirZ, u.railDirX));
                    concrete.Box(0, -1.1, 0, span, CURB_H + 1.35, deckW, 0x8f8a82, new BoxOpts { bottom = true });
                    foreach (var s in new[] { -1, 1 }) concrete.Box(0, CURB_H + 0.25, s * (deckW / 2 - 0.2), span, 1.0, 0.4, 0xb8b2a8);
                    B.xf = f;
                    deckW /= sin;
                }
                else
                {
                    concrete.Box(0, -1.1, 0, span, CURB_H + 1.35, deckW, 0x8f8a82, new BoxOpts { bottom = true });
                    foreach (var s in new[] { -1, 1 }) concrete.Box(0, CURB_H + 0.25, s * (deckW / 2 - 0.2), span, 1.0, 0.4, 0xb8b2a8);
                    B.Get(EnsureRoadMat(1, 0)).Rect(-hw - 0.6, hw + 0.6, -3.4, 3.4, CURB_H + 0.26, LinColor.White, (x, z) => ((z + 3.4) / 6.8, x / ROAD_TILE));
                }
                foreach (var s in new[] { -1, 1 })
                    Sign(new TextSign { key = "up_" + u.name, text = new[] { u.name.ToUpperInvariant(), "ಕೆಳಸೇತುವೆ · HEIGHT 4.2 m" }, bg = "#1f4e8c", fg = "#fff", x = 0, y = -0.5, z = s * (deckW / 2 + 0.05), w = Math.Min(r.width, 12), h = 1.1, face = s < 0 ? "n" : "s" });
                B.xf = null;
            }

            // ---------- Flyovers: the inner lanes climb over the junction, one straight arm each side ----------
            var cyl12 = Primitives.Cylinder(1, 1, 1, 12);
            foreach (var f in layout.flyovers)
            {
                var r = f.road;
                string key = EnsureRoadMat(1, r.median);
                double x0 = -f.hw, x1 = f.hw;
                for (int ai = 0; ai < f.arms.Count; ai++)
                {
                    var arm = f.arms[ai];
                    var fr = FrameAlong(f.cx, f.cz, arm.ux, arm.uz);
                    var col = colliders.Framed(fr);
                    B.xf = fr;
                    double Deck(double z) => layout.DeckHeight(f, z, arm);
                    StripZ(B.Get(key), x0, x1, 0, arm.half, z => Deck(z) + 0.02, 3);
                    // Near the junction an arm's parapet can cross the other arm's deck at a bend: leave it out there.
                    var other = f.arms[1 - ai];
                    bool OnOther(double lx, double lz)
                    {
                        fr.ToWorld(lx, lz, out double wx, out double wz);
                        double dx = wx - f.cx, dz = wz - f.cz, al = dx * other.ux + dz * other.uz, lt = -dx * other.uz + dz * other.ux;
                        return al > -f.hw && al < other.half && Math.Abs(lt) < f.hw - 0.05;
                    }
                    double step = 3;
                    for (double a = 0; a < arm.half - 1e-6; a += step)
                    {
                        double za = a, zbb = Math.Min(a + step, arm.half), ya = Deck(za), yb = Deck(zbb);
                        double lowA = ya < 4 ? 0 : ya - 1.3, lowB = yb < 4 ? 0 : yb - 1.3;
                        bool skip1 = OnOther(x1, (za + zbb) / 2), skip0 = OnOther(x0, (za + zbb) / 2);
                        double[] U0 = { 0, 0 }, U1 = { 1, 0 }, U2 = { 1, 1 }, U3 = { 0, 1 };
                        if (!skip1) concrete.Quad4(new[] { x1, lowB, zbb }, new[] { x1, lowA, za }, new[] { x1, ya + 1.05, za }, new[] { x1, yb + 1.05, zbb }, new double[] { 1, 0, 0 }, U0, U1, U2, U3, 0xbab4aa);
                        if (!skip0) concrete.Quad4(new[] { x0, lowA, za }, new[] { x0, lowB, zbb }, new[] { x0, yb + 1.05, zbb }, new[] { x0, ya + 1.05, za }, new double[] { -1, 0, 0 }, U0, U1, U2, U3, 0xbab4aa);
                        if (ya >= 4 || yb >= 4) concrete.Quad4(new[] { x0, lowA, za }, new[] { x1, lowA, za }, new[] { x1, lowB, zbb }, new[] { x0, lowB, zbb }, new double[] { 0, -1, 0 }, U0, U1, U2, U3, 0x8a857c);
                        double hMax = Math.Max(ya, yb), hMin = Math.Min(ya, yb), y0 = hMax < 4 ? -100 : hMin - 0.7, ym = Deck((za + zbb) / 2) + 1.05;
                        if (!skip0) { col.Add(x0 - 0.3, x0, za, zbb, hMax + 1.05, "wall", y0); concrete.Box(x0 + 0.15, ym - 0.12, (za + zbb) / 2, 0.3, 0.12, zbb - za - 0.2, 0xf2c200); }
                        if (!skip1) { col.Add(x1, x1 + 0.3, za, zbb, hMax + 1.05, "wall", y0); concrete.Box(x1 - 0.15, ym - 0.12, (za + zbb) / 2, 0.3, 0.12, zbb - za - 0.2, 0xf2c200); }
                    }
                    double aa = 0;
                    while (Deck(aa) > 4 && aa < arm.half) aa += 0.5;
                    // Blocks traffic beneath where the span gets low; cars on the deck pass over it.
                    col.Add(x0, x1, aa, aa + 0.6, 3.0, "wall");
                    for (double p = 22; p < aa - 4; p += 18)
                    {
                        double h = Deck(p) - 1.3;
                        concrete.Put(cyl12, 0, h / 2, p, 0xb0aaa0, 0, 0.8, h, 0.8);
                        concrete.Box(0, h - 0.8, p, f.hw * 2, 0.8, 1.6, 0xb0aaa0);
                        col.AddCentered(0, p, 1.7, 1.7, h, "pier");
                    }
                    if (ai == 0) Sign(new TextSign { key = "fo_" + f.name, text = new[] { f.name.ToUpperInvariant(), "ಮೇಲ್ಸೇತುವೆ" }, bg = "#1f6a3a", fg = "#fff", x = 0, y = Deck(arm.half * 0.6) + 3.2, z = arm.half * 0.6, w = f.hw * 2 - 0.6, h = 1.4, face = "s" });
                    B.xf = null;
                }
                // Fill the wedge where the two arms meet, and close its parapets.
                var A = f.arms[0]; var Bm = f.arms[1];
                double[] P2(FlyoverArm arm, double s) => new[] { f.cx - arm.uz * f.hw * s, f.cz + arm.ux * f.hw * s };
                var pts = new[] { P2(A, 1), P2(A, -1), P2(Bm, 1), P2(Bm, -1) }.OrderBy(p => Math.Atan2(p[1] - f.cz, p[0] - f.cx)).ToList();
                Geom.FanPoly(B.Get(key), f.cx, f.cz, pts, f.height + 0.02, LinColor.White, (x, z) => (0.5, -z / ROAD_TILE));
                foreach (var (p, q) in new[] { (P2(A, 1), P2(Bm, -1)), (P2(A, -1), P2(Bm, 1)) })
                {
                    if (Hypot(p[0] - q[0], p[1] - q[1]) < 0.2) continue;
                    double mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
                    bool inside = f.arms.Any(arm => { double dx = mx - f.cx, dz = mz - f.cz, al = dx * arm.ux + dz * arm.uz, lt = -dx * arm.uz + dz * arm.ux; return al > 0 && Math.Abs(lt) < f.hw - 0.3; });
                    if (inside) continue;
                    colliders.AddSegment(p[0], p[1], q[0], q[1], 0.4, f.height + 1.05, "wall", f.height - 0.7);
                    B.xf = new Frame(mx, mz, Math.Atan2(-(q[1] - p[1]), q[0] - p[0]));
                    concrete.Box(0, f.height - 1.3, 0, Hypot(q[0] - p[0], q[1] - p[1]) + 0.3, 2.35, 0.3, 0xbab4aa);
                    B.xf = null;
                }
            }

            // ---------- Toll plazas: a canopy over the carriageway, booths on the median and the verges ----------
            foreach (var tp in md.TOLL_PLAZAS)
            {
                NetEdge e = null; double bd = 400;
                foreach (var q in layout.undirected)
                {
                    if (q.r.name != tp.road || q.len < 90) continue;
                    double d = Hypot((q.a.x + q.b.x) / 2 - tp.near[0], (q.a.z + q.b.z) / 2 - tp.near[1]);
                    if (d < bd) { bd = d; e = q; }
                }
                if (e == null) continue;
                var r = e.r; double hw = r.width / 2, H = 6.4;
                double ux = (e.b.x - e.a.x) / e.len, uz = (e.b.z - e.a.z) / e.len;
                var f = FrameAlong((e.a.x + e.b.x) / 2, (e.a.z + e.b.z) / 2, ux, uz);
                var col = colliders.Framed(f); var glow = B.Get("glow");
                B.xf = f;
                concrete.Box(0, H, 0, r.width + 10, 1.1, 14, 0xf2f2f2, new BoxOpts { bottom = true });
                foreach (var s in new[] { -1, 1 }) concrete.Box(0, H + 0.15, s * 7.02, r.width + 10, 0.8, 0.06, 0xc8202a, new BoxOpts { top = false });
                foreach (var x in new[] { -(hw + 2.5), 0, hw + 2.5 })
                {
                    foreach (var s in new[] { -1, 1 }) { concrete.Put(cyl12, x, H / 2, s * 5, 0xd8d8d8, 0, 0.4, H, 0.4); col.AddCentered(x, s * 5, 0.9, 0.9, H, "pole"); }
                    concrete.Box(x, 0.15, 0, 1.8, 2.6, 3.2, 0xe8e4dc);
                    concrete.Box(x, 1.3, 0, 1.84, 0.9, 2.2, 0x2a3a4a);
                    concrete.Box(x, 2.75, 0, 2.2, 0.2, 3.8, 0xc8202a);
                    col.AddCentered(x, 0, 1.8, 3.2, 3, "building");
                }
                for (int k = 0; k < r.lanes; k++) foreach (var s in new[] { -1, 1 }) glow.Box(-s * layout.LaneOffset(r, k), H - 0.35, s * 7.05, 0.7, 0.45, 0.06, 0x30e060, new BoxOpts { top = false });
                foreach (var s in new[] { -1, 1 }) Sign(new TextSign { key = "toll_" + tp.name, text = new[] { "ನೈಸ್ ರಸ್ತೆ ಸುಂಕ ಕೇಂದ್ರ", tp.name.ToUpperInvariant() }, bg = "#c8202a", fg = "#ffffff", x = 0, y = H + 0.55, z = s * 7.1, w = Math.Min(r.width, 22), h = 0.75, face = s < 0 ? "n" : "s" });
                B.xf = null;
            }

            // ---------- Dead ends at the edge of the map ----------
            var Wd = layout.world;
            foreach (var n in layout.nodes)
            {
                if (n.adj.Count != 1) continue;
                bool nearEdge = n.x < Wd.minX + 30 || n.x > Wd.maxX - 30 || n.z < Wd.minZ + 30 || n.z > Wd.maxZ - 30;
                var h = n.adj[0];
                var f = FrameAlong(n.x + h.ux * 2, n.z + h.uz * 2, h.ux, h.uz);
                B.xf = f;
                for (int k = 0; k < Math.Ceiling(h.w); k++) stone.Box(-h.w + 1 + k * 2, 0, 0, 2, 1.2, 0.6, k % 2 == 1 ? 0x222222 : 0xf2c200);
                colliders.Framed(f).AddCentered(0, 0, h.w * 2 + 2, 1, 3, "wall");
                Sign(new TextSign { key = "metroWork", text = nearEdge ? new[] { "ROAD CLOSED · METRO WORK", "ಮೆಟ್ರೋ ಕಾಮಗಾರಿ" } : new[] { "DEAD END", "ಮುಂದೆ ದಾರಿ ಇಲ್ಲ" }, bg = "#f2c200", fg = "#111", x = 0, y = 1.4, z = 0.31, w = 6, h = 1.5, face = "s" });
                B.xf = null;
            }
            // World bounds.
            colliders.Add(Wd.minX - 10, Wd.minX, Wd.minZ - 10, Wd.maxZ + 10, 300, "bound");
            colliders.Add(Wd.maxX, Wd.maxX + 10, Wd.minZ - 10, Wd.maxZ + 10, 300, "bound");
            colliders.Add(Wd.minX - 10, Wd.maxX + 10, Wd.minZ - 10, Wd.minZ, 300, "bound");
            colliders.Add(Wd.minX - 10, Wd.maxX + 10, Wd.maxZ, Wd.maxZ + 10, 300, "bound");

            // ---------- Railway ----------
            rail = BuildRailway();
        }
        RailWorld rail;

        // =====================================================================================
        // Blocks
        // =====================================================================================
        void BuildZone(Block block)
        {
            switch (block.zone)
            {
                case "park": BuildPark(block); break;
                case "rural": BuildRural(block); break;
                case "lake": BuildLake(block); break;
                case "landmark": pois.landmarks.Add(Landmark(block.landmark, block)); ReserveInner(block); break;
                case "towers": BuildTowers(block); break;
                case "gov": BuildGov(block); break;
                case "residential": BuildResidential(block); break;
                case "industrial": BuildIndustrial(block); break;
                case "market": BuildStreetBlock(block, new[] { 5.0, 9 }, new[] { 10.0, 15 }, new[] { 2.0, 4 }, 1, BRIGHTS, new[] { "plaster", "apartment" }); break;
                case "commercial": BuildCommercial(block); break;
                default: BuildStreetBlock(block, new[] { 9.0, 18 }, new[] { 12.0, 20 }, block.edge ? new[] { 4.0, 9 } : new[] { 2.0, 6 }, 0.5, PASTELS, new[] { "plaster", "apartment", "plaster" }); break;
            }
        }


        void ReserveInner(Block block, double pad = 0)
        {
            var i = block.inner;
            block.placed.Add(new[] { new[] { i.minX - pad, i.minZ - pad }, new[] { i.maxX + pad, i.minZ - pad }, new[] { i.maxX + pad, i.maxZ + pad }, new[] { i.minX - pad, i.maxZ + pad } });
        }
        void ReserveRect(Block block, double cx, double cz, double w, double d)
            => block.placed.Add(new[] { new[] { cx - w / 2, cz - d / 2 }, new[] { cx + w / 2, cz - d / 2 }, new[] { cx + w / 2, cz + d / 2 }, new[] { cx - w / 2, cz + d / 2 } });

        // ---------- Lots: rectangles along each inner edge, in that edge's frame ----------
        // Local frame per edge: +x along the edge, +z out towards the road. A lot spans x in
        // [minX, maxX], z in [-depth, 0] and faces 's' (its maxZ side is the road frontage).
        class EdgeFrame { public Frame f; public double a0, a1, len, w; public bool road; public int i; }

        List<EdgeFrame> EdgeFrames(Block block, List<double[]> P = null, int ring = 0)
        {
            P ??= block.innerPoly;
            int n = P.Count; double sgn = Math.Sign(RoadNet.PolyArea(P));
            var output = new List<EdgeFrame>();
            for (int i = 0; i < n; i++)
            {
                double x1 = P[i][0], z1 = P[i][1], x2 = P[(i + 1) % n][0], z2 = P[(i + 1) % n][1];
                double dx = x2 - x1, dz = z2 - z1, len = Hypot(dx, dz);
                if (len < 6) continue;
                double nx = dz / len * sgn, nz = -dx / len * sgn; // outward
                var f = new Frame(x1, z1, Math.Atan2(nx, nz));
                double a = dx * f.c - dz * f.s; // local x of the far end (±len)
                double w = ring != 0 ? 0 : block.edgeWidths[i];
                output.Add(new EdgeFrame { f = f, a0 = Math.Min(0, a), a1 = Math.Max(0, a), len = len, road = w > 0, w = w, i = i });
            }
            return output;
        }

        double[][] Fits(Block block, Frame f, double minX, double maxX, double minZ, double maxZ)
        {
            var P = block.innerPoly;
            var local = new[] { (minX, minZ), (maxX, minZ), (maxX, maxZ - 0.3), (minX, maxZ - 0.3), ((minX + maxX) / 2, minZ) };
            var pts = new double[5][];
            for (int k = 0; k < 5; k++) { f.ToWorld(local[k].Item1, local[k].Item2, out double x, out double z); pts[k] = new[] { x, z }; }
            foreach (var p in pts) if (!RoadNet.PointInPoly(p[0], p[1], P)) return null;
            var corners = pts.Take(4).ToArray();
            foreach (var q in block.placed) if (Geom.RectsOverlap(corners, q)) return null;
            double cx = (pts[0][0] + pts[2][0]) / 2, cz = (pts[0][1] + pts[2][1]) / 2, r = Hypot(maxX - minX, maxZ - minZ) / 2;
            if (NearRail(cx, cz, r + 9)) return null;
            return corners;
        }

        // Lots along the block's frontage, then rings further in (facing internal lanes) so that
        // big blocks don't end up hollow.
        List<Lot> LotsAlong(Block block, double[] frontage, double[] depth, double gapChance = 0.2, int rings = 3)
        {
            var lots = new List<Lot>();
            if (block.innerPoly == null) return lots;
            var frames = EdgeFrames(block);
            for (int k = 1; k <= rings; k++)
            {
                var P = RoadNet.InsetPolygon(block.innerPoly, block.innerPoly.Select(_ => k * (depth[1] + 7)).ToList());
                if (P == null || Math.Abs(RoadNet.PolyArea(P)) < 900) break;
                frames.AddRange(EdgeFrames(block, P, k));
            }
            foreach (var E in frames)
            {
                double a = E.a0 + 0.5;
                while (a < E.a1 - frontage[0])
                {
                    double fw = Rand(frontage[0], frontage[1]);
                    if (E.a1 - (a + fw) < frontage[0] * 0.8) fw = E.a1 - a - 0.5;
                    if (fw < frontage[0] * 0.7) break;
                    double d = Rand(depth[0], depth[1]);
                    double[][] ok = null;
                    for (int tries = 0; tries < 2 && ok == null; tries++, d *= 0.65) ok = d >= 4 ? Fits(block, E.f, a, a + fw, -d, 0) : null;
                    if (ok == null) { a += 2; continue; }
                    block.placed.Add(ok);
                    // As in the JS, d has been scaled once more after the lot fitted: the building is
                    // a little shallower than its reserved footprint.
                    lots.Add(new Lot { f = E.f, minX = a, maxX = a + fw, minZ = -d, maxZ = 0, face = "s", road = E.road, roadW = E.w });
                    a += fw + (rng.Next() < gapChance ? Rand(0.5, 2) : 0);
                }
            }
            return lots;
        }

        // A rectangle in the middle of the block, aligned with its longest edge.
        Lot CentreLot(Block block, double margin, double maxSize = 80)
        {
            if (block.innerPoly == null) return null;
            var E = EdgeFrames(block).OrderByDescending(p => p.len).FirstOrDefault();
            if (E == null) return null;
            double cx = 0, cz = 0;
            foreach (var p in block.innerPoly) { cx += p[0]; cz += p[1]; }
            cx /= block.innerPoly.Count; cz /= block.innerPoly.Count;
            if (!RoadNet.PointInPoly(cx, cz, block.innerPoly)) return null;
            var f = new Frame(cx, cz, E.f.ang);
            double hw = Math.Min(maxSize, (block.inner.maxX - block.inner.minX) / 2 - margin), hd = Math.Min(maxSize, (block.inner.maxZ - block.inner.minZ) / 2 - margin);
            for (int k = 0; k < 6 && hw > 5 && hd > 5; k++, hw *= 0.8, hd *= 0.8)
            {
                var ok = Fits(block, f, -hw, hw, -hd, hd + 0.3);
                if (ok != null) { block.placed.Add(ok); return new Lot { f = f, minX = -hw, maxX = hw, minZ = -hd, maxZ = hd, face = "s" }; }
            }
            return null;
        }

        // ---------- Building helpers (local frame coordinates) ----------
        static readonly LinColor GREY = 0xb8b4ac;

        double Building(Lot lot, string style, double floors, bool shop, LinColor tint, Block block)
        {
            double w = lot.maxX - lot.minX, d = lot.maxZ - lot.minZ;
            if (w < 3 || d < 3) return CURB_H;
            double cx = (lot.minX + lot.maxX) / 2, cz = (lot.minZ + lot.maxZ) / 2;
            // A lot that strays onto a carriageway (where an arterial cuts across a block) stays empty.
            foreach (var (x, z) in new[] { (lot.minX, lot.minZ), (lot.maxX, lot.minZ), (lot.maxX, lot.maxZ), (lot.minX, lot.maxZ), (cx, cz) })
            { W(x, z, out double wx, out double wz); if (OnCarriageway(wx, wz, 0.5)) return CURB_H; }
            double y = CURB_H;
            var roofB = B.Get("roof");
            if (shop)
            {
                // The red channel seeds which shop types this frontage gets (see the shader's _SURF_SHOP).
                B.Get("shop").Box(cx, y, cz, w, SHOP_H, d, new LinColor(rng.Next(), 1, 1), new BoxOpts { tileW = SHOP_TILE[0], tileH = SHOP_TILE[1], top = floors == 0, topBuilder = roofB, topTile = 10, topColor = LinColor.White, snapU = true });
                y += SHOP_H;
                B.Get("stone").Box(cx, y - 0.25, cz, w + 0.6, 0.3, d + 0.6, 0xcfc8ba);
                AddSign(lot, y + 0.1, block);
            }
            var tile = style == "glass" ? GLASS_TILE : FACADE_TILE;
            double h = floors * FLOOR_H;
            if (floors > 0) B.Get(style).Box(cx, y, cz, w, h, d, tint, new BoxOpts { tileW = tile[0], tileH = tile[1], topBuilder = roofB, topTile = 10, topColor = LinColor.White, snapU = true });
            double top = y + h;
            if (floors > 0 && style != "glass")
            {
                var st = B.Get("stone");
                // Parapets in a dirtier, greyer shade of the wall colour.
                var pc = tint.Lerp(GREY, 0.35).Mul(0.82);
                Parapet(st, lot, top, 0.9, 0.25, pc);
                // Black Sintex water tanks and the stair headroom: a Bengaluru skyline staple.
                int n = rng.Next() < 0.8 ? 1 + (int)Math.Floor(Rand(0, 2.5)) : 0;
                for (int k = 0; k < n; k++)
                {
                    double tx = Rand(lot.minX + 1.2, lot.maxX - 1.2), tz = Rand(lot.minZ + 1.2, lot.maxZ - 1.2);
                    W(tx, tz, out double wx, out double wz);
                    tanks.Add(new[] { wx, top, wz, Rand(0.8, 1.1) });
                }
                if (rng.Next() < 0.5 && w > 6 && d > 6)
                {
                    double hx = cx + Rand(-w / 4, w / 4), hz = cz + Rand(-d / 4, d / 4);
                    B.Get("stone").Box(hx, top, hz, 3, 2.6, 3, pc, new BoxOpts { topBuilder = roofB, topTile = 10, topColor = LinColor.White });
                }
            }
            Col().Add(lot.minX, lot.maxX, lot.minZ, lot.maxZ, top + 1, "building");
            return top;
        }

        // Roof parapet as one hollow ring.
        static void Parapet(ChunkBuilder st, Lot lot, double y, double h, double t, LinColor color)
        {
            double x0 = lot.minX, x1 = lot.maxX, z0 = lot.minZ, z1 = lot.maxZ;
            double xi0 = x0 + t, xi1 = x1 - t, zi0 = z0 + t, zi1 = z1 - t, y1 = y + h;
            double[] uv = { 0, 0, 1, 1 };
            double[] V(double a, double b, double c) => new[] { a, b, c };
            st.Quad(V(x0, y, z1), V(x1, y, z1), V(x1, y1, z1), V(x0, y1, z1), V(0, 0, 1), uv, color);
            st.Quad(V(x1, y, z0), V(x0, y, z0), V(x0, y1, z0), V(x1, y1, z0), V(0, 0, -1), uv, color);
            st.Quad(V(x1, y, z1), V(x1, y, z0), V(x1, y1, z0), V(x1, y1, z1), V(1, 0, 0), uv, color);
            st.Quad(V(x0, y, z0), V(x0, y, z1), V(x0, y1, z1), V(x0, y1, z0), V(-1, 0, 0), uv, color);
            st.Quad(V(xi1, y, zi1), V(xi0, y, zi1), V(xi0, y1, zi1), V(xi1, y1, zi1), V(0, 0, -1), uv, color);
            st.Quad(V(xi0, y, zi0), V(xi1, y, zi0), V(xi1, y1, zi0), V(xi0, y1, zi0), V(0, 0, 1), uv, color);
            st.Quad(V(xi1, y, zi0), V(xi1, y, zi1), V(xi1, y1, zi1), V(xi1, y1, zi0), V(-1, 0, 0), uv, color);
            st.Quad(V(xi0, y, zi1), V(xi0, y, zi0), V(xi0, y1, zi0), V(xi0, y1, zi1), V(1, 0, 0), uv, color);
            st.Quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, zi1), V(x0, y1, zi1), V(0, 1, 0), uv, color);
            st.Quad(V(x0, y1, zi0), V(x1, y1, zi0), V(x1, y1, z0), V(x0, y1, z0), V(0, 1, 0), uv, color);
            st.Quad(V(xi1, y1, zi1), V(x1, y1, zi1), V(x1, y1, zi0), V(xi1, y1, zi0), V(0, 1, 0), uv, color);
            st.Quad(V(x0, y1, zi1), V(xi0, y1, zi1), V(xi0, y1, zi0), V(x0, y1, zi0), V(0, 1, 0), uv, color);
        }

        // Quad on a lot face, a0..a1 along it.
        static void FaceQuad(ChunkBuilder b, string face, Lot lot, double a0, double a1, double y0, double y1, double off, double[] uv, LinColor color)
        {
            switch (face)
            {
                case "n": { double z = lot.minZ - off; b.Quad(new[] { a1, y0, z }, new[] { a0, y0, z }, new[] { a0, y1, z }, new[] { a1, y1, z }, new double[] { 0, 0, -1 }, uv, color); break; }
                case "s": { double z = lot.maxZ + off; b.Quad(new[] { a0, y0, z }, new[] { a1, y0, z }, new[] { a1, y1, z }, new[] { a0, y1, z }, new double[] { 0, 0, 1 }, uv, color); break; }
                case "e": { double x = lot.maxX + off; b.Quad(new[] { x, y0, a1 }, new[] { x, y0, a0 }, new[] { x, y1, a0 }, new[] { x, y1, a1 }, new double[] { 1, 0, 0 }, uv, color); break; }
                case "w": { double x = lot.minX - off; b.Quad(new[] { x, y0, a0 }, new[] { x, y0, a1 }, new[] { x, y1, a1 }, new[] { x, y1, a0 }, new double[] { -1, 0, 0 }, uv, color); break; }
            }
        }

        void FrontPoint(Lot lot, double dist, out double x, out double z) => W((lot.minX + lot.maxX) / 2, lot.maxZ + dist, out x, out z);

        static double[] SignUV(int k)
        {
            int col = k % SIGN_COLS, row = k / SIGN_COLS % SIGN_ROWS;
            return new[] { (double)col / SIGN_COLS, 1 - (double)(row + 1) / SIGN_ROWS, (double)(col + 1) / SIGN_COLS, 1 - (double)row / SIGN_ROWS };
        }

        int NextSign(Block block)
        {
            if (block.zone != "industrial")
                for (int i = 0; i < homeBrands.Count; i++)
                    if (!homeBrands[i].placed && homeBrands[i].s.home == block.district) { homeBrands[i] = (homeBrands[i].s, homeBrands[i].k, true); return homeBrands[i].k; }
            string kind = block.zone == "industrial" ? "industrial" : block.pubs && rng.Next() < 0.55 ? "pub" : "general";
            var pool = pools[kind];
            return pool[poolIdx[kind]++ % pool.Count];
        }

        void AddSign(Lot lot, double y, Block block)
        {
            double len = Math.Min(lot.maxX - lot.minX - 0.8, 6);
            if (len < 2) return;
            double mid = (lot.minX + lot.maxX) / 2;
            int k = NextSign(block);
            FaceQuad(B.Get("signs"), "s", lot, mid - len / 2, mid + len / 2, y, y + len / 4, 0.32, SignUV(k), LinColor.White);
            var s = cfg.SHOP_SIGNS[k % cfg.SHOP_SIGNS.Count];
            if (s.food) { FrontPoint(lot, 2.2, out double px, out double pz); pois.food.Add(new Poi { name = s.en, x = px, z = pz, district = block.district }); }
        }

        HotelSite HotelFor(Block block) => block.hotel != null && !usedHotels.Contains(block.hotel) ? block.hotel : null;
        readonly HashSet<HotelSite> usedHotels = new HashSet<HotelSite>();

        // A hotel tower (or a mall) with its name lit up on all four sides of the crown.
        void BrandedTower(Lot lot, HotelSite h, Block block)
        {
            usedHotels.Add(h);
            double top = Building(lot, h.style ?? (h.mall ? "plaster" : "glass"), h.floors, false, h.tint, block);
            double w = lot.maxX - lot.minX, d = lot.maxZ - lot.minZ, cx = (lot.minX + lot.maxX) / 2, cz = (lot.minZ + lot.maxZ) / 2;
            double sh = h.mall ? 3.6 : 4.2, y = top + (h.mall ? -sh / 2 - 0.6 : sh / 2 + 0.6);
            string key = "brand_" + h.name;
            B.Get("stone").Box(cx, top, cz, w * 0.8, h.mall ? 0.4 : sh + 1.2, d * 0.8, 0x2a2a2a);
            foreach (var (face, x, z, depth) in new[] { ("n", cx, lot.minZ - 0.06, d), ("s", cx, lot.maxZ + 0.06, d), ("e", lot.maxX + 0.06, cz, w), ("w", lot.minX - 0.06, cz, w) })
            {
                double sw2 = Math.Min((face == "n" || face == "s" ? w : d) * 0.7, sh * 6), inset = h.mall ? 0 : 0.1 * depth;
                double px = face == "e" ? x - inset : face == "w" ? x + inset : x, pz = face == "s" ? z - inset : face == "n" ? z + inset : z;
                Sign(new TextSign { key = $"{key}_{JRound(sw2)}", text = new[] { h.name, h.sub }, bg = h.bg, fg = h.fg, x = px, y = y, z = pz, w = sw2, h = sh, face = face,
                    fonts = new[] { $"bold {(h.mall ? 72 : 96)}px \"Oswald\", Arial, sans-serif", $"{(h.mall ? 34 : 40)}px \"Oswald\", Arial, sans-serif" } });
            }
            W(cx, cz, out double wx, out double wz);
            pois.landmarks.Add(new Poi { name = h.label, x = wx, z = wz });
        }

        // Fuel stations: a branded canopy over two pump islands, a kiosk at the back and a totem sign.
        bool FuelStation(Lot lot, Block block)
        {
            if (!lot.road) return false;
            double a0 = lot.minX, a1 = lot.maxX, D = lot.maxZ - lot.minZ;
            if (a1 - a0 < 14 || D < 12 || rng.Next() > 0.12) return false;
            W((a0 + a1) / 2, (lot.minZ + lot.maxZ) / 2, out double cx0, out double cz0);
            if (stations.Any(s => Hypot(s[0] - cx0, s[1] - cz0) < 800)) return false;
            stations.Add(new[] { cx0, cz0 });
            var brand = cfg.FUEL_BRANDS[new[] { 0, 1, 0, 2 }[fuelIdx++ % 4]];
            (double, double) M(double a, double dd) => (a, lot.maxZ - dd);
            void Bx(ChunkBuilder b, double a, double dd, double la, double ld, double y, double hh, LinColor c, BoxOpts o = null) { var (x, z) = M(a, dd); b.Box(x, y, z, la, hh, ld, c, o); }
            var st = B.Get("stone");
            double am = (a0 + a1) / 2;
            Bx(st, am, D / 2, a1 - a0, D, CURB_H, 0.03, 0xb4b0a8);
            double ca = Math.Min(a1 - a0 - 3, 16), cd = Math.Min(D * 0.55, 9), cdm = 1.5 + cd / 2;
            Bx(st, am, cdm, ca, cd, 5.0, 0.35, 0xf2f2f2);
            Bx(st, am, cdm, ca + 0.15, cd + 0.15, 5.3, 0.55, brand.canopy);
            Bx(st, am, cdm, ca + 0.2, cd + 0.2, 5.42, 0.12, brand.stripe, new BoxOpts { top = false });
            foreach (var sa in new[] { -1, 1 }) foreach (var sd in new[] { -1, 1 })
                {
                    double a = am + sa * (ca / 2 - 1.2), dd = cdm + sd * (cd / 2 - 1.2);
                    Bx(st, a, dd, 0.4, 0.4, CURB_H, 5.0, 0xe8e8e8);
                    var (x, z) = M(a, dd);
                    Col().AddCentered(x, z, 0.5, 0.5, 5, "pole");
                }
            foreach (var sa in new[] { -1, 1 })
            {
                double a = am + sa * ca * 0.22;
                Bx(st, a, cdm, 1.1, 3.2, CURB_H, 0.2, 0xd8d4cc);
                foreach (var sd in new[] { -0.8, 0.8 })
                {
                    Bx(st, a, cdm + sd, 0.5, 0.7, CURB_H + 0.2, 1.7, brand.canopy);
                    Bx(st, a, cdm + sd, 0.52, 0.72, CURB_H + 1.45, 0.25, 0xffffff, new BoxOpts { top = false });
                }
                var (x, z) = M(a, cdm);
                Col().AddCentered(x, z, 1.1, 3.2, 1.9, "pole");
            }
            double kd = Math.Min(5, D - cd - 2);
            if (kd > 2.5) Building(new Lot { f = lot.f, minX = am - 4.5, maxX = am + 4.5, minZ = lot.maxZ - D, maxZ = lot.maxZ - D + kd }, "plaster", 1, false, 0xf6f6f6, block);
            var (fx, fz) = M(am, 1.5 - 0.1);
            Sign(new TextSign { key = $"fuel_{brand.key}_fascia", text = new[] { brand.name }, bg = brand.bg, fg = brand.fg, x = fx, y = 5.37, z = fz, w = 4, h = 0.5, face = "s", font = "bold 92px \"Oswald\", Arial, sans-serif" });
            double ta = a1 - 1.2;
            Bx(st, ta, 0.8, 0.3, 0.3, CURB_H, 4.2, 0x888888);
            Bx(st, ta, 0.8, 1.7, 0.25, CURB_H + 3.2, 3.0, 0x222222);
            var (tx, tz) = M(ta, 0.8 - 0.14);
            Sign(new TextSign { key = $"fuel_{brand.key}_totem", text = new[] { brand.name, brand.full, "PETROL · DIESEL" }, bg = brand.bg, fg = brand.fg, x = tx, y = CURB_H + 4.7, z = tz, w = 1.6, h = 2.8, face = "s",
                fonts = new[] { "bold 300px \"Oswald\", Arial, sans-serif", "bold 84px \"Noto Sans Kannada\", \"Oswald\", sans-serif", "bold 84px \"Oswald\", Arial, sans-serif" } });
            var (ppx, ppz) = M(ta, 0.8);
            Col().AddCentered(ppx, ppz, 0.6, 0.6, 7, "pole");
            var (mx, mz) = M(am, -2);
            W(mx, mz, out double qx, out double qz);
            pois.fuel.Add(new Poi { name = brand.name, x = qx, z = qz });
            return true;
        }

        void EachLot(IEnumerable<Lot> lots, Action<Lot> fn) { foreach (var lot in lots) { B.xf = lot.f; fn(lot); B.xf = null; } }

        void BuildStreetBlock(Block block, double[] frontage, double[] depth, double[] floors, double shopChance, int[] tints, string[] styles)
        {
            var lots = LotsAlong(block, frontage, depth);
            var hotel = HotelFor(block);
            // A hotel goes in the middle of the block; the widest street lot is kept for it in case there's no room.
            Lot spare = null;
            if (hotel != null) foreach (var l in lots) if (spare == null || l.maxX - l.minX > spare.maxX - spare.minX) spare = l;
            void Street(Lot lot)
            {
                bool shop = rng.Next() < shopChance && lot.road;
                if (block.zone != "market" && FuelStation(lot, block)) return;
                Building(lot, Pick(styles), JRound(Rand(floors[0], floors[1])), shop, LinColor.Hex(Pick(tints)), block);
            }
            EachLot(lots.Where(l => l != spare), Street);
            var c = CentreLot(block, depth[1] + 3, hotel != null ? 22 : 40);
            if (spare != null) EachLot(new[] { spare }, lot => { if (c != null) Street(lot); else BrandedTower(lot, hotel, block); });
            if (c == null) return;
            EachLot(new[] { c }, lot =>
            {
                if (hotel != null && !usedHotels.Contains(hotel)) BrandedTower(lot, hotel, block);
                else if (rng.Next() < 0.6) Building(lot, Pick(styles), JRound(Rand(floors[0] + 1, floors[1] + 3)), false, LinColor.Hex(Pick(tints)), block);
                else for (int k = 0; k < 6; k++) TreeAt(Rand(lot.minX, lot.maxX), Rand(lot.minZ, lot.maxZ), Rand(0.8, 1.2), 0);
            });
        }

        void BuildCommercial(Block block)
        {
            Plaza(block, 0xe8e4dc);
            if (block.landmark == "cathedral")
            {
                Mid(block, out double cx, out double cz);
                ReserveRect(block, cx - 2, cz, 44, 24);
                pois.landmarks.Add(Landmark("cathedral", null, cx, cz));
            }
            BuildStreetBlock(block, new[] { 8.0, 15 }, new[] { 12.0, 18 }, block.pubs ? new[] { 2.0, 5 } : new[] { 2.0, 6 }, 0.9, block.pubs ? BRIGHTS.Concat(PASTELS).ToArray() : PASTELS, new[] { "plaster", "apartment", "plaster" });
        }

        void BuildTowers(Block block)
        {
            Plaza(block, 0xf0ece4);
            Mid(block, out double cx, out double cz);
            if (block.landmark == "skyTower") { ReserveRect(block, cx, cz, 34, 34); pois.landmarks.Add(Landmark("skyTower", null, cx, cz)); }
            if (block.landmark == "wtc") { ReserveRect(block, cx, cz, 64, 44); pois.landmarks.Add(Landmark("wtc", null, cx, cz)); }
            var hotel = HotelFor(block);
            var lots = LotsAlong(block, new[] { 22.0, 36 }, new[] { 18.0, 28 }, 0.6);
            Lot site = null;
            if (hotel != null) foreach (var l in lots) if (site == null || l.maxX - l.minX > site.maxX - site.minX) site = l;
            EachLot(lots, lot =>
            {
                if (lot == site) { BrandedTower(lot, hotel, block); return; }
                if (rng.Next() < 0.15) { TreeAt((lot.minX + lot.maxX) / 2, (lot.minZ + lot.maxZ) / 2, 1.2, 0); return; }
                string style = rng.Next() < 0.75 ? "glass" : "apartment";
                double fl = JRound(Rand(8, 24));
                bool shop = rng.Next() < 0.3;
                Building(lot, style, fl, shop, LinColor.Hex(Pick(new[] { 0xd0e0ff, 0xe0f0e8, 0xf0e8d8, 0xc8d8f0 })), block);
            });
            if (block.landmark == null)
            {
                var c = CentreLot(block, 30, 24);
                if (c != null) EachLot(new[] { c }, lot => { double fl = JRound(Rand(14, 30)); Building(lot, "glass", fl, false, LinColor.Hex(Pick(new[] { 0xd0e0ff, 0xc8d8f0 })), block); });
            }
        }

        void BuildGov(Block block)
        {
            Lawn(block);
            var lots = LotsAlong(block, new[] { 22.0, 40 }, new[] { 16.0, 22 });
            EachLot(lots, lot =>
            {
                if (rng.Next() < 0.25) { TreeAt((lot.minX + lot.maxX) / 2, (lot.minZ + lot.maxZ) / 2, 1.3, 0); return; }
                string style = rng.Next() < 0.7 ? "heritage" : "plaster";
                double fl = JRound(Rand(2, 4));
                Building(new Lot { f = lot.f, minX = lot.minX, maxX = lot.maxX, minZ = lot.minZ, maxZ = lot.maxZ - 4 }, style, fl, false, LinColor.Hex(Pick(new[] { 0xf2ead8, 0xe8dcc8, 0xf5f0e6, 0xd9b8a0 })), block);
            });
            ScatterInBlock(block, 14, 0, 25);
        }

        double CompoundWall(Lot lot, LinColor colour, double gateFrac = 0.7, double gateHalf = 1.5, double h = 1.3)
        {
            var st = B.Get("stone");
            double wz = lot.maxZ - 0.15, a0 = lot.minX, a1 = lot.maxX, gate = a0 + (a1 - a0) * gateFrac;
            foreach (var (s0, s1) in new[] { (a0, gate - gateHalf), (gate + gateHalf, a1) })
            {
                if (s1 - s0 < 0.5) continue;
                double m = (s0 + s1) / 2, len = s1 - s0;
                st.Box(m, CURB_H, wz, len, h, 0.3, colour);
                Col().AddCentered(m, wz, len, 0.3, h + 0.2, "wall");
            }
            return gate;
        }

        void BuildResidential(Block block)
        {
            Lawn(block, 0xb8b090);
            var lots = LotsAlong(block, new[] { 10.0, 15 }, new[] { 12.0, 16 });
            EachLot(lots, lot =>
            {
                CompoundWall(lot, LinColor.Hex(Pick(new[] { 0xe8e0d0, 0xd8c8b0, 0xf0e8e0 })));
                string style = rng.Next() < 0.6 ? "plaster" : "apartment";
                double fl = JRound(Rand(1, 3.4));
                Building(new Lot { f = lot.f, minX = lot.minX, maxX = lot.maxX, minZ = lot.minZ, maxZ = lot.maxZ - 3 }, style, fl, false, LinColor.Hex(Pick(PASTELS)), block);
                if (rng.Next() < 0.5) { double tx = (lot.minX + lot.maxX) / 2 + Rand(-2, 2), ts = Rand(0.5, 0.8); TreeAt(tx, lot.maxZ - 1.5, ts, rng.Next() < 0.3 ? 1 : 2); }
                FrontPoint(lot, 2.2, out double dx, out double dz);
                pois.homes.Add(new Poi { name = $"#{Math.Floor(Rand(1, 999))}, {block.district}", x = dx, z = dz, district = block.district });
            });
            var c = CentreLot(block, 20, 30);
            if (c != null) EachLot(new[] { c }, lot =>
            {
                if (rng.Next() < 0.5) { double fl = JRound(Rand(3, 6)); Building(lot, "apartment", fl, false, LinColor.Hex(Pick(PASTELS)), block); }
                else for (int k = 0; k < 5; k++) TreeAt(Rand(lot.minX, lot.maxX), Rand(lot.minZ, lot.maxZ), Rand(0.8, 1.3), 0);
            });
        }

        // Peenya: factory sheds with sawtooth roofs, chimneys, compound walls and painted name boards.
        void BuildIndustrial(Block block)
        {
            Plaza(block, 0xb8b0a0);
            var lots = LotsAlong(block, new[] { 26.0, 44 }, new[] { 26.0, 40 });
            var metal = B.Get("sheet"); var st = B.Get("stone");
            var boxG = Primitives.Box(); var chimney = Primitives.Cylinder(1, 1, 1, 12);
            EachLot(lots, lot =>
            {
                double gateA = CompoundWall(lot, LinColor.Hex(Pick(new[] { 0xc8c0b0, 0xa8b0b8, 0xd8d0c0 })), 0.5, 3.5, 2.2);
                double lMinX = lot.minX, lMaxX = lot.maxX, lMinZ = lot.minZ, lMaxZ = lot.maxZ - 6;
                double w = lMaxX - lMinX, d = lMaxZ - lMinZ;
                if (w < 8 || d < 8) return;
                double cx = (lMinX + lMaxX) / 2, cz = (lMinZ + lMaxZ) / 2, H = Rand(7, 10);
                var tint = LinColor.Hex(Pick(new[] { 0xd8dce0, 0xc8d0d8, 0xe0d8c8, 0xb8c8d8 }));
                B.Get("plaster").Box(cx, CURB_H, cz, w, H, d, tint, new BoxOpts { tileW = 14, tileH = 12.8, top = false });
                st.Box(cx, CURB_H + 2.2, cz, w + 0.04, 0.6, d + 0.04, LinColor.Hex(Pick(new[] { 0x2a5a9a, 0x9a2a2a, 0x2a7a4a })), new BoxOpts { top = false });
                int teeth = Math.Max(2, (int)JRound(d / 6)); double td = d / teeth;
                for (int k = 0; k < teeth; k++)
                {
                    double z0 = lMinZ + k * td;
                    metal.Put(boxG, cx, CURB_H + H + 1.2, z0 + td / 2, 0x8a9098, 0, w, 0.08, Hypot(td, 2.4), Math.Atan2(2.4, td));
                    B.Get("glass").Box(cx, CURB_H + H, z0 + td - 0.05, w, 2.4, 0.1, 0x8aa0b0, new BoxOpts { top = false, tileW = 8, tileH = 12.8 });
                }
                Col().Add(lMinX, lMaxX, lMinZ, lMaxZ, CURB_H + H + 2.4, "building");
                if (rng.Next() < 0.3)
                {
                    double chx = lMinX + 3, chz = lMinZ + 3;
                    for (int k = 0; k < 6; k++) st.Put(chimney, chx, CURB_H + k * 4 + 2, chz, k % 2 == 1 ? 0xd02020 : 0xf0f0f0, 0, 1.0 - k * 0.06, 4, 1.0 - k * 0.06);
                    Col().AddCentered(chx, chz, 2.2, 2.2, 25, "pole");
                }
                int sk = NextSign(block);
                FaceQuad(B.Get("signs"), "s", lot, gateA - 3, gateA + 3, CURB_H + 2.4, CURB_H + 3.9, -0.1, SignUV(sk), LinColor.White);
                FrontPoint(lot, -3, out double pkx, out double pkz);
                pois.industrial.Add(new Poi { x = pkx, z = pkz, heading = Math.Atan2(lot.f.c, -lot.f.s) });
            });
        }

        static void Mid(Block block, out double cx, out double cz) { var i = block.inner; cx = (i.minX + i.maxX) / 2; cz = (i.minZ + i.maxZ) / 2; }

        // Trees scattered inside the block, away from reserved footprints.
        void ScatterInBlock(Block block, int n, double pinkChance = 0.15, double margin = 3, double[] size = null)
        {
            size ??= new[] { 0.9, 1.6 };
            var P = block.innerPoly; var bb = block.bbox;
            int placed = 0;
            for (int k = 0; k < n * 4 && placed < n; k++)
            {
                double x = Rand(bb.minX + margin, bb.maxX - margin), z = Rand(bb.minZ + margin, bb.maxZ - margin);
                if (!RoadNet.PointInPoly(x, z, P)) continue;
                if (block.placed.Any(q => RoadNet.PointInPoly(x, z, q))) continue;
                if (NearRail(x, z, 9)) continue;
                double s = Rand(size[0], size[1]);
                trees.Add(new TreeSpec { x = x, z = z, s = s, t = rng.Next() < pinkChance ? 1 : 0 });
                placed++;
            }
        }

        void BuildPark(Block block)
        {
            Lawn(block);
            Mid(block, out double cx, out double cz);
            if (block.park != null && block.park.name == "Cubbon Park") { BuildCubbon(block, cx, cz); return; }
            // Footpaths from the middle out to each side.
            var path = B.Get("plaza");
            if (block.innerPoly != null && RoadNet.PointInPoly(cx, cz, block.innerPoly))
                foreach (var E in EdgeFrames(block))
                {
                    E.f.ToWorld((E.a0 + E.a1) / 2, 0, out double ex, out double ez);
                    double dx = ex - cx, dz = ez - cz, l = Hypot(dx, dz);
                    if (l < 10) continue;
                    B.xf = new Frame((cx + ex) / 2, (cz + ez) / 2, Math.Atan2(dx, dz));
                    path.Rect(-2, 2, -l / 2, l / 2, CURB_H + 0.02, 0xc8a080, (x, z) => (x / 4, -z / 4));
                    B.xf = null;
                    block.placed.Add(Geom.RectCorners((cx + ex) / 2, (cz + ez) / 2, dz / l, -dx / l, 3, l / 2));
                }
            if (block.landmark == "statue") { Landmark("statue", null, cx + 14, cz + 14); ReserveRect(block, cx + 14, cz + 14, 10, 10); }
            else if (block.landmark != null) { pois.landmarks.Add(Landmark(block.landmark, block)); ReserveRect(block, cx, cz, 76, 40); }
            ScatterInBlock(block, Math.Min(160, (int)JRound(block.area / 220)));
            pois.parking.Add(new Poi { x = block.poly[0][0], z = block.poly[0][1] });
            if (block.park != null && !labelledParks.Contains(block.park)) { labelledParks.Add(block.park); pois.landmarks.Add(new Poi { name = block.park.name, x = cx, z = cz }); }
        }
        readonly HashSet<Park> labelledParks = new HashSet<Park>();

        void BuildLake(Block block)
        {
            var water = block.innerPoly != null ? RoadNet.InsetPolygon(block.innerPoly, block.innerPoly.Select(_ => 9.0).ToList()) : null;
            if (water == null) { BuildPark(block); return; }
            Geom.FillPoly(B.Get("grass"), block.innerPoly, CURB_H + 0.01, LinColor.White, (x, z) => (x / 6, -z / 6), new List<IList<double[]>> { water });
            Geom.PolyWalls(B.Get("stone"), water, -0.6, CURB_H + 0.02, 0x8a8478, inward: true, tile: 2);
            Geom.FillPoly(B.Get("stone"), water, -0.6, 0x5a5448);
            var wb = new BuilderSet();
            Geom.FillPoly(wb.Get("water"), water, 0.05, LinColor.White, (x, z) => (x / 40, -z / 40));
            wb.BuildAll(mats, group, new Dictionary<string, bool> { ["water"] = false });
            for (int i = 0; i < water.Count; i++) colliders.AddSegment(water[i][0], water[i][1], water[(i + 1) % water.Count][0], water[(i + 1) % water.Count][1], 1.0, 2, "water");
            // Trees around the bund.
            var P = block.innerPoly;
            for (int i = 0; i < P.Count; i++)
            {
                double ax = P[i][0], az = P[i][1], bx = P[(i + 1) % P.Count][0], bz = P[(i + 1) % P.Count][1], l = Hypot(bx - ax, bz - az);
                for (double s = 6; s < l - 4; s += 10)
                {
                    double t = s / l, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
                    Towards(x, z, block.cx, block.cz, 3.5, out double wx, out double wz);
                    trees.Add(new TreeSpec { x = wx, z = wz, s = Rand(0.9, 1.3), t = 0 });
                }
            }
            pois.landmarks.Add(new Poi { name = block.lakeName ?? "Lake", x = block.cx, z = block.cz });
        }

        static void Towards(double x, double z, double cx, double cz, double d, out double ox, out double oz)
        {
            double dx = cx - x, dz = cz - z, l = Hypot(dx, dz); if (l == 0) l = 1;
            ox = x + dx / l * d; oz = z + dz / l * d;
        }

        // ---------- Street trees and lamps along the kerbs ----------
        class KerbRun { public double x1, z1, ux, uz, len, nx, nz, w, inset; public void At(double s, out double x, out double z) { x = x1 + ux * s - nx * inset; z = z1 + uz * s - nz * inset; } }

        static void KerbRuns(Block block, double inset, Action<KerbRun> fn)
        {
            var P = block.poly; double sgn = Math.Sign(RoadNet.PolyArea(P));
            for (int i = 0; i < P.Count; i++)
            {
                double w = block.edgeWidths[i];
                if (w == 0) continue;
                double x1 = P[i][0], z1 = P[i][1], x2 = P[(i + 1) % P.Count][0], z2 = P[(i + 1) % P.Count][1];
                double dx = x2 - x1, dz = z2 - z1, len = Hypot(dx, dz);
                if (len < 16) continue;
                fn(new KerbRun { x1 = x1, z1 = z1, ux = dx / len, uz = dz / len, len = len, nx = dz / len * sgn, nz = -dx / len * sgn, w = w, inset = inset });
            }
        }

        // Countryside: a patchwork of fields, the odd farmhouse, coconut and eucalyptus trees.
        void BuildRural(Block block)
        {
            Lawn(block, 0xb0b070);
            int[] FIELDS = { 0x8aa040, 0x9ab048, 0xb8a860, 0x7a9a3a, 0xa89858, 0xc0b878, 0x6a8a30 };
            var lots = LotsAlong(block, new[] { 40.0, 90 }, new[] { 35.0, 70 }, 0.5, 2);
            var g = B.Get("grass");
            EachLot(lots, lot =>
            {
                g.Rect(lot.minX + 0.5, lot.maxX - 0.5, lot.minZ + 0.5, lot.maxZ - 0.5, CURB_H + 0.02, LinColor.Hex(Pick(FIELDS)), (x, z) => (x / 5, -z / 5));
                if (lot.road && rng.Next() < 0.18)
                {
                    double w = Math.Min(10, lot.maxX - lot.minX - 4), m = (lot.minX + lot.maxX) / 2;
                    double fl = rng.Next() < 0.7 ? 1 : 2;
                    Building(new Lot { f = lot.f, minX = m - w / 2, maxX = m + w / 2, minZ = lot.maxZ - 12, maxZ = lot.maxZ - 3 }, "plaster", fl, false, LinColor.Hex(Pick(PASTELS)), block);
                    for (int k = 0; k < 4; k++) { double tx = lot.minX + Rand(1, 6), tz = lot.maxZ - Rand(2, 14); TreeAt(tx, tz, Rand(0.8, 1.2), 0); }
                }
                else if (rng.Next() < 0.35)
                    for (double x = lot.minX + 3; x < lot.maxX - 2; x += Rand(6, 10)) TreeAt(x, lot.minZ + 1.5, Rand(0.8, 1.3), 0);
            });
            ScatterInBlock(block, Math.Min(40, (int)JRound(block.area / 6000)), 0.05, 8);
        }

        void AvenueTrees(Block block)
        {
            if (block.zone == "lake" || block.zone == "rural") return;
            bool cbd = Math.Abs(block.cx - md.CBD.x) < md.CBD.r * 0.77 && Math.Abs(block.cz - md.CBD.z) < md.CBD.r * 0.7;
            double bas = block.zone == "commercial" || block.zone == "market" || block.zone == "industrial" ? 30 : cbd ? 16 : 22;
            KerbRuns(block, 1.0, k =>
            {
                double spacing = k.w > 14 ? bas : bas * 1.5; // side streets are sparser
                for (double s = 7 + Rand(0, 4); s < k.len - 7; s += spacing + Rand(-3, 3))
                {
                    k.At(s, out double x, out double z);
                    if (NearRail(x, z, 10)) continue;
                    double sc = Rand(0.8, 1.3);
                    trees.Add(new TreeSpec { x = x, z = z, s = sc, t = rng.Next() < 0.18 ? 1 : 0 });
                }
            });
        }

        void StreetLamps(Block block)
        {
            if (block.zone == "rural") return;
            KerbRuns(block, 0.4, k =>
            {
                double spacing = k.w > 14 ? 36 : 58;
                runId++;
                for (double s = 12 + Rand(0, 10); s < k.len - 8; s += spacing)
                {
                    k.At(s, out double x, out double z);
                    if (NearRail(x, z, 10)) continue;
                    lamps.Add(new[] { x, z, k.nx, k.nz, runId });
                }
            });
        }

        // Street furniture positions (Render/StreetProps.cs draws them).
        void StreetProps(Block block)
        {
            string z = block.zone;
            if (z == "rural" || z == "lake" || z == "landmark") return;
            bool shops = z == "market" || z == "commercial" || z == null || z == "mixed";
            (string, double)[] mix = z == "park" ? new[] { ("painted_wooden_bench", 5.0), ("planter_pot_clay", 1), ("trashbag", 1) }
                : z == "industrial" ? new[] { ("barrel_03", 4.0), ("old_tyre", 4), ("utility_box_01", 2), ("trashbag", 2) }
                : shops ? new[] { ("plastic_monobloc_chair_01", 4.0), ("trashbag", 3), ("utility_box_01", 2), ("planter_pot_clay", 2), ("barrel_03", 1) }
                : new[] { ("planter_pot_clay", 3.0), ("utility_box_01", 3), ("trashbag", 2), ("old_tyre", 1) };
            double total = mix.Sum(m => m.Item2);
            double spacing = z == "park" ? 34 : shops ? 30 : 48;
            KerbRuns(block, 3.0, k =>
            {
                for (double s = 10 + Rand(0, 12); s < k.len - 10; s += spacing + Rand(-8, 12))
                {
                    double r = Rand(0, total); string kind = mix[0].Item1;
                    foreach (var (n, w) in mix) if ((r -= w) <= 0) { kind = n; break; }
                    k.At(s, out double x, out double zz);
                    if (NearRail(x, zz, 6) || colliders.PointBlocked(x, zz, 1)) continue;
                    double face = Math.Atan2(k.nx, k.nz);
                    int n2 = kind == "plastic_monobloc_chair_01" ? 2 + (int)Math.Floor(Rand(0, 2)) : kind == "old_tyre" || kind == "barrel_03" ? 1 + (int)Math.Floor(Rand(0, 3)) : 1;
                    for (int j = 0; j < n2; j++)
                    {
                        double along = (j - (n2 - 1) / 2.0) * (kind == "plastic_monobloc_chair_01" ? 0.75 : 0.9);
                        double px = x + k.ux * along, pz = zz + k.uz * along;
                        double ry = kind == "painted_wooden_bench" || kind == "utility_box_01" ? face : face + Rand(-0.6, 0.6);
                        props.Add(new PropSpot { k = kind, x = px, y = CURB_H, z = pz, ry = ry });
                        if (kind == "utility_box_01" || kind == "barrel_03") colliders.AddCentered(px, pz, kind == "utility_box_01" ? 1.2 : 0.7, kind == "utility_box_01" ? 1.2 : 0.7, kind == "utility_box_01" ? 1.6 : 1.0, "static");
                        if (kind == "painted_wooden_bench") colliders.AddOriented(px, pz, 0.9, 0.3, face, 0.8, "static");
                    }
                }
            });
        }

        // Lamps: poles with an arm reaching out over the road, cables strung along each kerb run.
        void BuildLamps(List<double[]> heads)
        {
            var b = new BuilderSet(CHUNK);
            var pole = b.Get("metal"); var head = b.Get("glow"); var cable = b.Get("cable");
            var cyl = Primitives.Cylinder(0.08, 0.12, 1, 6, 1, true);
            var r = new Mulberry32(91);
            for (int k = 1; k < lamps.Count; k++)
            {
                double x1 = lamps[k - 1][0], z1 = lamps[k - 1][1], ax = lamps[k - 1][2], az = lamps[k - 1][3], run1 = lamps[k - 1][4];
                double x2 = lamps[k][0], z2 = lamps[k][1], run2 = lamps[k][4];
                double span = Hypot(x2 - x1, z2 - z1);
                if (run1 != run2 || span > 65 || span < 8) continue;
                int n = 3 + (r.Next() < 0.4 ? 1 : 0), segs = 7;
                for (int c = 0; c < n; c++)
                {
                    double off = -0.25 - c * 0.12, y0 = 6.5 + c * 0.22, sag = (0.5 + span * 0.016) * (0.7 + r.Next() * 0.7);
                    double ox = -ax * off, oz = -az * off, wdt = 0.035;
                    for (int s = 0; s < segs; s++)
                    {
                        double ta = (double)s / segs, tb = (double)(s + 1) / segs;
                        double[] pa = { x1 + (x2 - x1) * ta + ox, y0 - sag * 4 * ta * (1 - ta), z1 + (z2 - z1) * ta + oz };
                        double[] pb = { x1 + (x2 - x1) * tb + ox, y0 - sag * 4 * tb * (1 - tb), z1 + (z2 - z1) * tb + oz };
                        double lx = -(z2 - z1) / span * wdt, lz = (x2 - x1) / span * wdt;
                        cable.Quad(new[] { pa[0] - lx, pa[1], pa[2] - lz }, new[] { pb[0] - lx, pb[1], pb[2] - lz }, new[] { pb[0] + lx, pb[1], pb[2] + lz }, new[] { pa[0] + lx, pa[1], pa[2] + lz }, new double[] { 0, 1, 0 }, new double[] { 0, 0, 1, 1 }, 0x1c1c1c);
                        cable.Quad(new[] { pa[0], pa[1] - wdt, pa[2] }, new[] { pb[0], pb[1] - wdt, pb[2] }, new[] { pb[0], pb[1] + wdt, pb[2] }, new[] { pa[0], pa[1] + wdt, pa[2] }, new[] { lx / wdt, 0, lz / wdt }, new double[] { 0, 0, 1, 1 }, 0x1c1c1c);
                    }
                }
            }
            foreach (var l in lamps)
            {
                double x = l[0], z = l[1], ax = l[2], az = l[3];
                pole.Put(cyl, x, 4.15, z, 0x6a6e72, 0, 1, 8, 1);
                b.xf = new Frame(x, z, Math.Atan2(ax, az));
                pole.Put(cyl, 0, 8.1, 0.8, 0x6a6e72, 0, 0.7, 1.7, 0.7, Math.PI / 2, 0);
                head.Box(0, 7.85, 1.6, 0.6, 0.15, 0.6, 0xfff2cc);
                b.xf.ToWorld(0, 1.6, out double hx, out double hz);
                heads.Add(new[] { hx, 7.75, hz });
                b.xf = null;
                colliders.AddCentered(x, z, 0.3, 0.3, 8, "pole");
            }
            b.BuildAll(mats, group, new Dictionary<string, bool> { ["glow"] = false, ["cable"] = false });
        }
    }
}
