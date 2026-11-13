// Indian Railways lines out of KSR Bengaluru City (port of src/world/railway.js): ballasted double
// track along real alignments, overhead electrification, boundary walls, level crossings, three
// stations and long-distance trains (a WAP-7 with red LHB coaches) shuttling between the ends.
// Built with the city's builders (buildInfrastructure calls it last), so it lives in City.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.World;
using UnityEngine;

namespace NammaBengaluru.Render
{
    public class RailWorld
    {
        public class Line { public string name; public PolyPath path; }
        public class Station { public RailStation def; public Line line; public double s, x, z; public string name => def.name; }
        public class Crossing { public LevelCrossing lc; public double s, open = 1; public Line line; public List<(Transform arm, int sd)> booms = new List<(Transform, int)>(); public List<MeshRenderer> lamps = new List<MeshRenderer>(); public List<ColliderBox> cols = new List<ColliderBox>(); }
        public class Train
        {
            public Line line; public List<(Transform t, double off)> cars = new List<(Transform, double)>();
            public double s, lat, speed = 10, wait, len, x, z, dx, dz; public int dir; public bool honked; public Station stoppedAt;
        }
        public readonly List<Line> lines = new List<Line>();
        public readonly List<Station> stations = new List<Station>();
        public readonly List<Crossing> crossings = new List<Crossing>();
        public readonly List<Train> trains = new List<Train>();
        public Material lampOn, lampOff;
        public Action<Train, double, double> hitByTrain; // the train, and the direction to knock someone

        public void Update(double dt, double fx, double fz)
        {
            UpdateCrossings(dt);
            foreach (var t in trains)
            {
                var P = t.line.path;
                if (t.wait > 0) t.wait -= dt;
                else
                {
                    double end = t.dir > 0 ? P.length - 15 : 15, toEnd = (end - t.s) * t.dir, target = 16;
                    foreach (var sn in stations)
                    {
                        if (sn.line != t.line) continue;
                        double d = (sn.s + t.dir * t.len / 2 - t.s) * t.dir;
                        if (d > 0 && d < 160 && t.stoppedAt != sn) target = Math.Min(target, Math.Max(1.5, d * 0.12));
                        if (Math.Abs(d) < 1 && t.stoppedAt != sn) { t.stoppedAt = sn; t.wait = 20; t.speed = 0; }
                    }
                    if (toEnd < 140) target = Math.Min(target, Math.Max(1.5, toEnd * 0.12));
                    t.speed += Math.Sign(target - t.speed) * Math.Min(Math.Abs(target - t.speed), 1.4 * dt);
                    t.s += t.speed * t.dir * dt;
                    // Reverse at the terminus: the last coach becomes the front (push-pull rake).
                    if (toEnd <= 0.5) { t.s -= t.dir * t.len; t.dir *= -1; t.wait = 25; t.speed = 0; t.honked = false; t.stoppedAt = null; t.lat = -t.lat; }
                }
                // Place every car along the curve.
                foreach (var (tr, off) in t.cars)
                {
                    var a = P.AtS(t.s - t.dir * off);
                    double ang = Math.Atan2(-a.dz * t.dir, a.dx * t.dir);
                    tr.localPosition = new Vector3((float)(a.x - a.dz * t.lat), 0.3f, (float)-(a.z + a.dx * t.lat));
                    tr.localRotation = Quaternion.AngleAxis((float)(-ang * Mathf.Rad2Deg), Vector3.up);
                }
                var c = P.AtS(t.s - t.dir * t.len / 2);
                t.x = c.x - c.dz * t.lat; t.z = c.z + c.dx * t.lat; t.dx = c.dx; t.dz = c.dz;
                double dd = Math.Sqrt((fx - t.x) * (fx - t.x) + (fz - t.z) * (fz - t.z));
                if (dd < 260 && !t.honked && t.speed > 5) { t.honked = true; Systems.GameAudio.I?.Horn("train", t.x, t.z); }
                if (dd > 400) t.honked = false;
                // Anyone standing on the track gets knocked aside.
                if (hitByTrain != null && t.speed > 2 && dd < t.len / 2 + 2)
                {
                    var pr = P.Project(fx, fz); var q = P.AtS(pr.s);
                    double lat = (fx - q.x) * -q.dz + (fz - q.z) * q.dx;
                    double sg = Math.Sign(lat - t.lat); if (sg == 0) sg = 1;
                    if (Math.Abs(lat - t.lat) < 2 && Math.Abs(pr.s - (t.s - t.dir * t.len / 2)) < t.len / 2 + 1) hitByTrain(t, -q.dz * sg, q.dx * sg);
                }
            }
        }

        void UpdateCrossings(double dt)
        {
            int blink = (int)(Time.time / 0.4) % 2;
            foreach (var c in crossings)
            {
                // Closed while a train is within 110 m of the crossing (either end of it).
                bool closed = false;
                foreach (var t in trains)
                {
                    if (t.line != c.line) continue;
                    double a = t.s, b = t.s - t.dir * t.len;
                    if (c.s > Math.Min(a, b) - 110 && c.s < Math.Max(a, b) + 110) { closed = true; break; }
                }
                c.lc.closed = closed;
                double target = closed ? 0 : 1;
                c.open += Math.Sign(target - c.open) * Math.Min(Math.Abs(target - c.open), dt * 0.5);
                foreach (var (arm, sd) in c.booms) arm.localRotation = Quaternion.AngleAxis((float)(-sd * 90 * 0.92 * c.open), Vector3.forward);
                foreach (var box in c.cols) box.off = c.open > 0.35;
                for (int i = 0; i < c.lamps.Count; i++) { var m = closed && (blink + i) % 2 == 1 ? lampOn : lampOff; if (c.lamps[i].sharedMaterial != m) c.lamps[i].sharedMaterial = m; }
            }
        }
    }

    public partial class City
    {
        const double RAIL_PIECE = 8;
        static readonly double[] RAIL_TRACKS = { -2.5, 2.5 };

        RailWorld BuildRailway()
        {
            var rw = new RailWorld();
            var st = B.Get("stone"); var metal = B.Get("metal");
            var CYL = Primitives.Cylinder(1, 1, 1, 8); var CONE4 = Primitives.Cone(1, 1, 4);
            double CURB = GameConfig.CURB_H;
            foreach (var l in layout.rails) rw.lines.Add(new RailWorld.Line { name = l.name, path = new PolyPath(l.pts) });
            bool OnRoad(double x, double z) => layout.BlockContaining(x, z) == null && layout.UnderpassAt(x, z) == null;
            bool InBlock(double x, double z) { var b = layout.BlockContaining(x, z); return b != null && !b.island; }
            // Where roads cross each line (level crossings and rail underpasses), as distances along it.
            List<double> RoadCrossings(RailWorld.Line line)
            {
                var output = new List<double>();
                foreach (var lc in layout.levelCrossings) if (lc.rail.name == line.name) output.Add(line.path.Project(lc.x, lc.z).s);
                foreach (var u in layout.underpasses) if (u.type == "rail" && line.path.Project(u.cx, u.cz).d < 20) output.Add(line.path.Project(u.cx, u.cz).s);
                return output;
            }
            // A station needs ~132 m of track clear of roads for its 130 m platforms, and land beside
            // it for the building; slide it along the line to the nearest such spot.
            bool StationFits(RailWorld.Line line, double s)
            {
                if (s < 90 || s > line.path.length - 90) return false;
                var at = line.path.AtS(s);
                int side = new[] { 1, -1 }.FirstOrDefault(k => InBlock(at.x - at.dz * 20 * k, at.z + at.dx * 20 * k));
                if (side == 0) return false;
                for (double a = -66; a <= 66; a += 3)
                {
                    var p = line.path.AtS(Math.Max(0, Math.Min(line.path.length, s + a)));
                    foreach (var off in new double[] { -9, 0, 9, side * 12, side * 19, side * 27 })
                    {
                        if (Math.Abs(off) > 10 && Math.Abs(a) > 37) continue; // the building is 72 m long
                        if (!InBlock(p.x - p.dz * off, p.z + p.dx * off)) return false;
                    }
                }
                return true;
            }
            foreach (var st0 in md.RAIL_STATIONS)
            {
                var line = rw.lines[st0.line];
                double s0 = line.path.Project(st0.at[0], st0.at[1]).s;
                var xs = RoadCrossings(line);
                // Prefer spots whose platforms end well short of a crossing, near the real station.
                bool Clear(double s, double gap) => xs.All(x => Math.Abs(x - s) > gap);
                double best = s0; bool found = false;
                foreach (var (gap, reach) in new[] { (140.0, 60.0), (80.0, 120.0), (0.0, 600.0) })
                {
                    for (double d = 0; d <= reach && !found; d += 5)
                        foreach (var s in d > 0 ? new[] { s0 + d, s0 - d } : new[] { s0 })
                            if (Clear(s, gap) && StationFits(line, s)) { best = s; found = true; break; }
                    if (found) break;
                }
                rw.stations.Add(new RailWorld.Station { def = st0, line = line, s = best });
            }
            bool NearStation(RailWorld.Line line, double s, double pad = 0) => rw.stations.Any(q => q.line == line && Math.Abs(q.s - s) < 75 + pad);

            foreach (var line in rw.lines)
            {
                var P = line.path;
                var walls = new Dictionary<int, double[]> { [-1] = null, [1] = null };
                void FlushWall(int side)
                {
                    var w = walls[side];
                    if (w == null) return;
                    double len = Math.Sqrt((w[2] - w[0]) * (w[2] - w[0]) + (w[3] - w[1]) * (w[3] - w[1]));
                    if (len > 2)
                    {
                        B.xf = new Frame((w[0] + w[2]) / 2, (w[1] + w[3]) / 2, Math.Atan2(-(w[3] - w[1]), w[2] - w[0]));
                        st.Box(0, CURB, 0, len, 2, 0.3, 0xc8bca8);
                        B.xf = null;
                        colliders.AddSegment(w[0], w[1], w[2], w[3], 0.3, 2.2, "wall");
                    }
                    walls[side] = null;
                }
                for (double s = 0; s < P.length - 1e-6; s += RAIL_PIECE)
                {
                    double l = Math.Min(RAIL_PIECE, P.length - s);
                    var at = P.AtS(s + l / 2);
                    var f = new Frame(at.x, at.z, Math.Atan2(-at.dz, at.dx));
                    bool road = OnRoad(at.x, at.z);
                    B.xf = f;
                    if (road)
                    {
                        // Level crossing: rails set flush into the road.
                        foreach (var tz in RAIL_TRACKS) foreach (var o in new[] { -0.72, 0.72 }) metal.Box(0, 0.01, tz + o, l, 0.05, 0.08, 0x8a8a8a);
                    }
                    else
                    {
                        st.Box(0, CURB, 0, l + 0.05, 0.28, 10, 0x6e665e);
                        foreach (var tz in RAIL_TRACKS)
                        {
                            if (!Detail.lite) for (double x = -l / 2 + 0.5; x < l / 2; x += 1.2) st.Box(x, CURB + 0.28, tz, 0.25, 0.12, 2.5, 0x5a4a3a, new BoxOpts { sides = false });
                            foreach (var o in new[] { -0.72, 0.72 }) metal.Box(0, CURB + 0.4, tz + o, l + 0.05, 0.14, 0.08, 0x8a8a8a);
                        }
                        foreach (var tz in RAIL_TRACKS) metal.Box(0, CURB + 6.3, tz, l + 0.05, 0.03, 0.03, 0x333333);
                    }
                    B.xf = null;
                    // Boundary walls inside blocks, broken at stations.
                    foreach (var side in new[] { -1, 1 })
                    {
                        double ox = -at.dz * 8 * side, oz = at.dx * 8 * side;
                        double ax = at.x - at.dx * l / 2 + ox, az = at.z - at.dz * l / 2 + oz, bx = at.x + at.dx * l / 2 + ox, bz = at.z + at.dz * l / 2 + oz;
                        bool ok = !NearStation(line, s);
                        for (int k = 0; ok && k <= 4; k++) ok = InBlock(ax + (bx - ax) * k / 4, az + (bz - az) * k / 4);
                        if (!ok) { FlushWall(side); continue; }
                        var w = walls[side];
                        double wl = w != null ? Math.Sqrt((w[2] - w[0]) * (w[2] - w[0]) + (w[3] - w[1]) * (w[3] - w[1])) : 1; if (wl == 0) wl = 1;
                        if (w != null && Math.Abs((bx - w[0]) * -(w[3] - w[1]) + (bz - w[1]) * (w[2] - w[0])) / wl < 0.3) { w[2] = bx; w[3] = bz; }
                        else { FlushWall(side); walls[side] = new[] { ax, az, bx, bz }; }
                    }
                }
                FlushWall(-1); FlushWall(1);
                // Overhead line masts.
                for (double s = 20; s < P.length; s += 45)
                {
                    var at = P.AtS(s);
                    double mx = at.x + at.dz * 5.4, mz = at.z - at.dx * 5.4;
                    if (!InBlock(mx, mz) || !InBlock(at.x, at.z)) continue;
                    B.xf = new Frame(at.x, at.z, Math.Atan2(-at.dz, at.dx));
                    metal.Put(CYL, 0, CURB + 3.5, -5.4, 0x7a7a7a, 0, 0.12, 7, 0.12);
                    metal.Box(0, CURB + 6.7, -2.5, 0.1, 0.1, 6, 0x7a7a7a);
                    B.xf = null;
                    colliders.AddCentered(mx, mz, 0.3, 0.3, 7, "pole");
                }
            }

            // Level crossings: a full-width boom on each side that comes down when a train is near,
            // with flashing red lamps. Closed booms block the road (and traffic waits for them).
            var dyn = new GameObject("railway").transform;
            dyn.SetParent(group, false);
            var boomMat = CityMaterials.Make("boom", new CityMaterials.Spec { roughness = 0.6f });
            rw.lampOn = CityMaterials.Glow("lampOn"); rw.lampOn.SetColor("_BaseColor", CityMaterials.Hex(0xff2010));
            rw.lampOff = CityMaterials.Make("lampOff", new CityMaterials.Spec { color = 0x401010, roughness = 0.5f });
            var lampMesh = new ChunkBuilder(); lampMesh.Put(Primitives.Sphere(0.13, 8, 6), 0, 0, 0, 0xffffff);
            var lampM = lampMesh.Meshes("lamp")[0];
            foreach (var lc in layout.levelCrossings)
            {
                var e = lc.edge; double ux = (e.b.x - e.a.x) / e.len, uz = (e.b.z - e.a.z) / e.len, hw = e.r.width / 2;
                var f = new Frame(lc.x, lc.z, Math.Atan2(ux, uz));
                var line = rw.lines.FirstOrDefault(l => l.name == lc.rail.name) ?? rw.lines[0];
                var c = new RailWorld.Crossing { lc = lc, s = line.path.Project(lc.x, lc.z).s, line = line };
                B.xf = f;
                foreach (var sd in new[] { -1, 1 })
                {
                    double side = sd * (hw + 0.8);
                    st.Put(CYL, side, 0.8, sd * 9, 0x333333, 0, 0.18, 1.6, 0.18);
                    st.Box(side, 1.6, sd * 9, 0.5, 0.5, 0.5, 0x222222);
                    colliders.Framed(f).AddCentered(side, sd * 9, 0.4, 0.4, 3, "pole");
                    // The boom: a pivot at the post, a striped arm reaching across the road.
                    double L = hw * 2 + 0.6;
                    var bb = new ChunkBuilder();
                    int n = Math.Max(3, (int)Math.Round(L / 1.2));
                    for (int k = 0; k < n; k++) bb.Box(-sd * (0.3 + (k + 0.5) * (L / n)), -0.07, 0, L / n, 0.14, 0.12, k % 2 == 1 ? 0xf2f2f2 : 0xd02020);
                    f.ToWorld(side, sd * 9, out double px, out double pz);
                    var pivot = new GameObject("boom").transform;
                    pivot.SetParent(dyn, false);
                    pivot.localPosition = Game.ToUnity(px, 1.25, pz);
                    pivot.localRotation = Quaternion.AngleAxis((float)(-f.ang * Mathf.Rad2Deg), Vector3.up);
                    var arm = new GameObject("arm").transform;
                    arm.SetParent(pivot, false);
                    foreach (var m in bb.Meshes("boom"))
                    {
                        var go = new GameObject("m"); go.transform.SetParent(arm, false);
                        go.AddComponent<MeshFilter>().sharedMesh = m;
                        var mr = go.AddComponent<MeshRenderer>(); mr.sharedMaterial = boomMat; mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                    }
                    c.booms.Add((arm, sd));
                    var lamp = new GameObject("lamp");
                    lamp.transform.SetParent(dyn, false);
                    lamp.transform.localPosition = Game.ToUnity(px, 2.0, pz);
                    lamp.AddComponent<MeshFilter>().sharedMesh = lampM;
                    var lr = lamp.AddComponent<MeshRenderer>(); lr.sharedMaterial = rw.lampOff;
                    c.lamps.Add(lr);
                    var box = colliders.Framed(f).AddCentered(0, sd * 9, L, 0.4, 1.5, "wall");
                    box.off = true;
                    c.cols.Add(box);
                }
                Sign(new TextSign { key = "lc", text = new[] { "LEVEL CROSSING", "ಲೆವೆಲ್ ಕ್ರಾಸಿಂಗ್ · STOP LOOK GO" }, bg = "#f2c200", fg = "#111", x = hw + 1.2, y = 2.2, z = -12, w = 2.6, h = 1.0, face = "s" });
                Sign(new TextSign { key = "lc", text = new[] { "LEVEL CROSSING", "ಲೆವೆಲ್ ಕ್ರಾಸಿಂಗ್ · STOP LOOK GO" }, bg = "#f2c200", fg = "#111", x = -hw - 1.2, y = 2.2, z = 12, w = 2.6, h = 1.0, face = "n" });
                B.xf = null;
                rw.crossings.Add(c);
            }

            // Stations: two platforms, a station building and yellow name boards.
            foreach (var sn in rw.stations)
            {
                var at = sn.line.path.AtS(sn.s);
                var f = new Frame(at.x, at.z, Math.Atan2(-at.dz, at.dx));
                var col = colliders.Framed(f);
                B.xf = f;
                const double pl = 130, PS = 10;
                // Built in 10 m pieces, leaving out any that would sit on a road.
                bool Land(double lx, double lz) { f.ToWorld(lx, lz, out double x, out double z); return !OnRoad(x, z); }
                foreach (var s in new[] { -1, 1 })
                {
                    double pz = s * 7;
                    for (double x0 = -pl / 2; x0 < pl / 2 - 1e-6; x0 += PS)
                    {
                        double xm = x0 + PS / 2;
                        if (!Land(x0 + 0.5, pz) || !Land(x0 + PS - 0.5, pz) || !Land(xm, pz)) continue;
                        st.Box(xm, 0.15, pz, PS, 0.75, 4, 0xc8bca8);
                        st.Box(xm, 0.9, pz - s * 1.85, PS, 0.02, 0.3, 0xf2c200);
                        metal.Put(CYL, xm, 3.5, pz, 0x5a6a7a, 0, 0.12, 5.2, 0.12);
                        metal.Box(xm, 6, pz, PS, 0.15, 5, 0x8a9aaa);
                        col.AddCentered(xm, pz, PS, 4, 0.9, "platform");
                    }
                    Sign(new TextSign { key = "rs_" + sn.name, text = new[] { sn.def.kn, sn.def.@short ?? sn.name.ToUpperInvariant() }, x = 25, y = 3, z = pz + s * 1.6, w = 6, h = 1.4, face = s < 0 ? "n" : "s", bg = "#f2c200", fg = "#111" });
                }
                // Building on whichever side has land for all of it (none if neither side does).
                bool Fits(int k) => new double[] { -36, -18, 0, 18, 36 }.All(x => new double[] { 11, 19, 27 }.All(z => Land(x, k * z)));
                int side = Fits(1) ? 1 : Fits(-1) ? -1 : 0;
                double bz = (side != 0 ? side : 1) * 19;
                var tileOpts = new BoxOpts { tileW = FACADE_TILE[0], tileH = FACADE_TILE[1], topBuilder = B.Get("roof"), topTile = 10 };
                if (side != 0 && sn.name.StartsWith("Krantivira"))
                {
                    // KSR Bengaluru City: a long cream-and-maroon front with an arcade of arches, a
                    // clock tower over the entrance and the station's name in Kannada and English.
                    var her = B.Get("heritage");
                    int cream = 0xf2e4c4, maroon = 0x8a2a22, s2 = side;
                    her.Box(0, CURB, bz, 72, 11, 14, cream, tileOpts);
                    st.Box(0, CURB + 11, bz, 73, 1.2, 15, maroon);
                    st.Box(0, CURB + 4.6, bz + s2 * 7.05, 72, 0.6, 0.3, maroon); // string course
                    for (double x = -33; x <= 33; x += 6)
                    { // the arcade: dark arches between cream piers
                        st.Box(x, CURB, bz + s2 * 7.1, 3.6, 3.4, 0.2, 0x2a2420);
                        st.Put(CYL, x, CURB + 3.4, bz + s2 * 7.1, 0x2a2420, 0, 1.8, 0.2, 1.8, Math.PI / 2);
                    }
                    // Clock tower.
                    her.Box(0, CURB, bz, 12, 24, 12, cream, new BoxOpts { tileW = FACADE_TILE[0], tileH = FACADE_TILE[1], topBuilder = B.Get("roof") });
                    st.Box(0, CURB + 24, bz, 13, 1, 13, maroon);
                    st.Put(CONE4, 0, CURB + 27.5, bz, maroon, Math.PI / 4, 10, 6, 10);
                    double fz = s2 * 6.1;
                    st.Put(CYL, 0, CURB + 19.5, bz + fz, 0xf8f4e8, 0, 2.4, 0.2, 2.4, Math.PI / 2);
                    st.Box(0, CURB + 20.2, bz + fz + s2 * 0.12, 0.18, 1.6, 0.05, 0x111111);
                    st.Box(0.45, CURB + 19.5, bz + fz + s2 * 0.12, 1.1, 0.16, 0.05, 0x111111);
                    col.AddCentered(0, bz, 73, 15, 26, "building");
                    Sign(new TextSign { key = "rsb_" + sn.name, text = new[] { "ಕ್ರಾಂತಿವೀರ ಸಂಗೊಳ್ಳಿ ರಾಯಣ್ಣ ಬೆಂಗಳೂರು ನಿಲ್ದಾಣ", "KSR BENGALURU CITY RAILWAY STATION" }, x = 0, y = CURB + 8.4, z = bz + s2 * 7.3, w = 30, h = 2.6, face = s2 > 0 ? "s" : "n", bg = "#8a2a22", fg = "#fff4d8" });
                }
                else if (side != 0)
                {
                    var her = B.Get("heritage");
                    her.Box(0, CURB, bz, 70, 9, 14, 0xf0e2c8, tileOpts);
                    st.Box(0, CURB + 9, bz, 72, 1, 16, 0xa8302a);
                    her.Box(0, CURB, bz, 18, 14, 16, 0xf0e2c8, new BoxOpts { tileW = FACADE_TILE[0], tileH = FACADE_TILE[1], topBuilder = B.Get("roof") });
                    st.Put(CONE4, 0, CURB + 16.4, bz, 0xa8302a, Math.PI / 4, 12, 5, 12);
                    col.AddCentered(0, bz, 72, 16, 15, "building");
                    Sign(new TextSign { key = "rsb_" + sn.name, text = new[] { sn.def.kn, sn.def.board ?? sn.name.ToUpperInvariant() }, x = 0, y = CURB + 11.5, z = bz + side * 8.05, w = 16, h = 3.2, face = side > 0 ? "s" : "n", bg = "#f2c200", fg = "#111" });
                }
                B.xf = null;
                double ex = at.x - at.dz * (bz + (side != 0 ? side : 1) * 10), ez = at.z + at.dx * (bz + (side != 0 ? side : 1) * 10);
                pois.landmarks.Add(new Poi { name = sn.name, x = ex, z = ez });
                sn.x = at.x; sn.z = at.z;
            }

            // ---------- Trains ----------
            var (loco, coach) = TrainGeometry();
            var trains = new GameObject("trains").transform;
            trains.SetParent(group, false);
            for (int i = 0; i < rw.lines.Count; i++)
            {
                var line = rw.lines[i];
                rw.trains.Add(MakeTrain(loco, coach, trains, line, 1, 260 + i * 300, RAIL_TRACKS[1]));
                rw.trains.Add(MakeTrain(loco, coach, trains, line, -1, line.path.length - 260, RAIL_TRACKS[0]));
            }
            rw.Update(0, 1e9, 1e9);
            return rw;
        }

        // Shared geometry: locomotive and coach, each built along local +x.
        (List<Mesh> loco, List<Mesh> coach) TrainGeometry()
        {
            double CURB = GameConfig.CURB_H;
            var loco = new ChunkBuilder();
            loco.Box(0, CURB + 1.0, 0, 20, 3.2, 3.1, 0xe8e4dc);
            loco.Box(0, CURB + 1.6, 0, 20.02, 0.5, 3.12, 0xc0182a, new BoxOpts { top = false });
            loco.Box(9.6, CURB + 2.6, 0, 0.8, 1.2, 3.0, 0x1a2228);
            loco.Box(0, CURB + 4.2, 0, 14, 0.4, 2.4, 0x555555);
            loco.Box(0, CURB + 0.4, 0, 17, 0.6, 2.6, 0x222222, new BoxOpts { top = false });
            loco.Box(9.9, CURB + 3.2, 0, 0.2, 0.8, 2.6, 0x1a2228);
            var coach = new ChunkBuilder();
            const double L = 23.5;
            coach.Box(0, CURB + 1.0, 0, L, 3.3, 3.15, 0xa8282a);
            coach.Box(0, CURB + 1.35, 0, L + 0.02, 0.18, 3.17, 0xe8e0d0, new BoxOpts { top = false });
            coach.Box(0, CURB + 2.6, 0, L - 2, 0.8, 3.18, 0x1a2228, new BoxOpts { top = false });
            coach.Box(0, CURB + 4.3, 0, L - 0.5, 0.25, 2.8, 0xb8b8b8);
            coach.Box(0, CURB + 0.6, 0, L - 3, 0.4, 2.6, 0x222222, new BoxOpts { top = false });
            return (loco.Meshes("loco"), coach.Meshes("coach"));
        }

        static Material trainMat;
        internal static void ResetStatics() { trainMat = null; }
        RailWorld.Train MakeTrain(List<Mesh> loco, List<Mesh> coach, Transform parent, RailWorld.Line line, int dir, double s, double lat)
        {
            if (trainMat == null) trainMat = CityMaterials.Make("train", new CityMaterials.Spec { roughness = 0.45f, metallic = 0.2f });
            const int n = 7; const double C = 23.5;
            var t = new RailWorld.Train { line = line, s = s, dir = dir, lat = lat, len = 20.8 + n * (C + 0.8) };
            Transform Car(List<Mesh> ms)
            {
                var go = new GameObject("car"); go.transform.SetParent(parent, false);
                foreach (var m in ms)
                {
                    var c = new GameObject("m"); c.transform.SetParent(go.transform, false);
                    c.AddComponent<MeshFilter>().sharedMesh = m;
                    var mr = c.AddComponent<MeshRenderer>(); mr.sharedMaterial = trainMat;
                }
                return go.transform;
            }
            t.cars.Add((Car(loco), 10));
            for (int k = 0; k < n; k++) t.cars.Add((Car(coach), 20.8 + k * (C + 0.8) + C / 2));
            return t;
        }
    }
}
