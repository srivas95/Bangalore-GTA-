// Namma Metro (port of buildMetro in src/world/metro.js): the Purple and Green lines on their real
// alignments. Elevated viaducts over the arterials, covered ramps down to tunnel portals,
// underground halls in the city centre, stations with street entrances and name boards, and
// BEML trainsets running in both directions and stopping at every station.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.World;
using UnityEngine;

namespace NammaBengaluru.Render
{
    public class MetroWorld
    {
        public class Train
        {
            public MetroRoute line; public List<(Transform t, double off)> cars = new List<(Transform, double)>();
            public double s, speed, cruise, wait, x, y, z, hx, hz; public int dir; public MetroStop at; public bool doors, reverse;
        }
        public List<MetroRoute> routes;
        public readonly List<Train> trains = new List<Train>();
        public Transform group;

        public void Update(double dt, double fx = double.NaN, double fz = double.NaN)
        {
            const double TRACK = MetroRoutes.TRACK, TRAIN_LEN = MetroRoutes.TRAIN_LEN, DWELL = MetroRoutes.DWELL;
            foreach (var t in trains)
            {
                var P = t.line.path;
                if (t.wait > 0)
                {
                    t.wait -= dt;
                    t.doors = t.wait > 2 && t.wait < DWELL - 1.5;
                    if (t.wait <= 0) { t.doors = false; if (t.reverse) { t.reverse = false; t.s -= t.dir * TRAIN_LEN; t.dir = -t.dir; } }
                }
                else
                {
                    // The next stop ahead.
                    MetroStop next = null; double nd = double.PositiveInfinity;
                    foreach (var st in t.line.stations)
                    {
                        double d = (MetroRoutes.StopPoint(st, t.dir) - t.s) * t.dir;
                        if (d > 0.3 && d < nd) { nd = d; next = st; }
                    }
                    double target = t.cruise;
                    if (next != null && nd < 260) target = Math.Min(target, Math.Max(1.2, Math.Sqrt(2 * 1.8 * nd)));
                    t.speed += Math.Sign(target - t.speed) * Math.Min(Math.Abs(target - t.speed), (target > t.speed ? 2.2 : 2.6) * dt);
                    t.s += t.speed * t.dir * dt;
                    t.at = null;
                    if (next != null && (MetroRoutes.StopPoint(next, t.dir) - t.s) * t.dir < 0.4)
                    {
                        t.s = MetroRoutes.StopPoint(next, t.dir); t.speed = 0; t.wait = DWELL; t.at = next;
                        // The far terminus: the rear cab takes over for the return run.
                        if ((t.dir > 0 && next.idx == t.line.stations.Count - 1) || (t.dir < 0 && next.idx == 0)) t.reverse = true;
                    }
                }
                double off = t.dir > 0 ? TRACK : -TRACK; // left-hand running
                if (group != null)
                    foreach (var (tr, co) in t.cars)
                    {
                        double s = t.s - t.dir * co;
                        var a = P.AtS(s);
                        double y = t.line.YAt(s);
                        tr.localPosition = Game.ToUnity(a.x + a.dz * off, y + 1.6, a.z - a.dx * off);
                        tr.localRotation = Quaternion.AngleAxis((float)(-Math.Atan2(-a.dz * t.dir, a.dx * t.dir) * Mathf.Rad2Deg), Vector3.up);
                        bool vis = y > -1 || double.IsNaN(fx) || Math.Sqrt((a.x - fx) * (a.x - fx) + (a.z - fz) * (a.z - fz)) < 150;
                        if (tr.gameObject.activeSelf != vis) tr.gameObject.SetActive(vis);
                    }
                var m = P.AtS(t.s - t.dir * TRAIN_LEN / 2);
                t.x = m.x + m.dz * off; t.z = m.z - m.dx * off; t.y = t.line.YAt(t.s - t.dir * TRAIN_LEN / 2) + 1.6;
                t.hx = m.dx * t.dir; t.hz = m.dz * t.dir;
            }
        }
    }

    public static class Metro
    {
        public static MetroWorld Build(Layout layout, MapData md, Colliders colliders, Transform parent, List<Poi> landmarkPois = null)
        {
            const double DECK_Y = MetroRoutes.DECK_Y, ST_HALF = MetroRoutes.ST_HALF, TRACK = MetroRoutes.TRACK, PORTAL_Y = MetroRoutes.PORTAL_Y;
            var group = new GameObject("metro").transform;
            group.SetParent(parent, false);
            var mats = new Dictionary<string, Material>
            {
                ["concrete"] = CityMaterials.Make("metroConcrete", new CityMaterials.Spec { roughness = 0.9f }),
                ["paint"] = CityMaterials.Make("metroPaint", new CityMaterials.Spec { roughness = 0.5f }),
                ["metal"] = CityMaterials.Make("metroMetal", new CityMaterials.Spec { roughness = 0.3f, metallic = 0.9f }),
                ["glass"] = CityMaterials.Make("metroGlass", new CityMaterials.Spec { roughness = 0.1f, metallic = 0.6f }), // (opaque here; the web game's is 55% see-through)
                ["glow"] = CityMaterials.Glow("metroGlow"),
            };
            var routes = MetroRoutes.Routes(layout, md);
            // Piers stand on land, or in a road's median: never in a traffic lane. Null if neither.
            double[] PierSpot(double x, double z)
            {
                if (layout.BlockContaining(x, z) != null) return new[] { x, z };
                var hq = layout.EdgeAt(x, z);
                if (hq == null || hq.Value.d > hq.Value.e.r.width / 2 + 0.3) return new[] { x, z };
                var h = hq.Value; var e = h.e;
                // (Only if the median is under the deck: a pier more than 3.5 m off the track centre would miss it.)
                return e.r.median >= 1 && h.d < 3.5 ? new[] { e.a.x + (e.b.x - e.a.x) * h.t, e.a.z + (e.b.z - e.a.z) * h.t } : null;
            }
            var B = new BuilderSet(320);
            var con = B.Get("concrete"); var paint = B.Get("paint"); var metal = B.Get("metal"); var glass = B.Get("glass"); var glow = B.Get("glow");
            var cyl = Primitives.Cylinder(1, 1, 1, 16);
            const int concrete = 0xbfbab0;
            var boards = new List<TextSign>();
            bool InJunction(double x, double z)
            {
                var n = layout.NearestNode(x, z);
                if (n == null || n.through) return false;
                double r = n.adj.Max(h => n.cut.TryGetValue(h.e.id, out var c) ? c : 0) + 3;
                return Math.Sqrt((n.x - x) * (n.x - x) + (n.z - z) * (n.z - z)) < r;
            }
            bool LandAt(double x, double z) { var b = layout.BlockContaining(x, z); return b != null && !b.island; }
            void Board(string[] text, int bgHex, string bg, string fg, double x, double y, double z, double rot, double w, double h, Frame f)
            {
                f.ToWorld(x, z, out double wx, out double wz);
                boards.Add(new TextSign { key = "metro_" + string.Join("|", text) + (bg ?? ""), text = text, bg = bg, fg = fg ?? "#ffffff", x = wx, y = y, z = wz, rotY = f.ang + rot, w = w, h = h, basic = true });
            }

            foreach (var line in routes)
            {
                var P = line.path;
                bool IsStation(double s) => line.stations.Any(st => Math.Abs(st.s - s) < ST_HALF);
                // Each ramp's covered section: from the portal (where the deck is PORTAL_Y up, or lower
                // if a street crosses there) until the track is underground.
                foreach (var r in line.ramps)
                {
                    double portalY = PORTAL_Y;
                    double a = line.SAtY(r, PORTAL_Y), b = line.SAtY(r, 1), step = Math.Sign(b - a) * 2;
                    for (double s = a; step != 0 && (b - s) * step >= 0; s += step)
                    {
                        var at = P.AtS(s);
                        if (!LandAt(at.x, at.z)) portalY = Math.Min(portalY, line.YAt(s) - 0.6);
                    }
                    r.portalY = Math.Max(0.5, portalY);
                    r.sHi = line.SAtY(r, r.portalY); r.sLo = line.SAtY(r, -5.5);
                }
                bool Covered(double s) => line.ramps.Any(r => (s - r.sHi) * (s - r.sLo) <= 0);

                // ---------- Viaduct ----------
                const double PIECE = 10;
                for (double s = 0; s < P.length - 1e-6; s += PIECE)
                {
                    double l = Math.Min(PIECE, P.length - s);
                    double y = line.YAt(s + l / 2);
                    if (y < 0.5 || Covered(s + l / 2)) continue; // inside a covered ramp, or underground
                    var at = P.AtS(s + l / 2);
                    var f = new Frame(at.x, at.z, Math.Atan2(-at.dz, at.dx));
                    B.xf = f;
                    con.Box(0, y, 0, l + 0.05, 1.6, 9.5, concrete, new BoxOpts { bottom = true });
                    if (y < 6)
                    {
                        // Too low for piers near the portal: a solid wall carries the deck on land; over a
                        // street it's a short bridge (cars pass under, the deck itself still blocks).
                        if (LandAt(at.x, at.z)) { con.Box(0, 0, 0, l + 0.05, y, 6.5, 0xb4afa5); colliders.Framed(f).AddCentered(0, 0, l, 6.5, y, "wall"); }
                        else colliders.Framed(f).AddCentered(0, 0, l, 9.5, y + 1.6, "wall", y);
                    }
                    foreach (var sd in new[] { -1, 1 })
                    {
                        con.Box(0, y + 1.6, sd * 4.6, l + 0.05, 1.1, 0.3, 0xd8d4cc);
                        paint.Box(0, y + 1.0, sd * 4.76, l + 0.05, 0.35, 0.02, line.color, new BoxOpts { top = false });
                    }
                    foreach (var tz in new[] { -TRACK, TRACK }) foreach (var o in new[] { -0.75, 0.75 }) metal.Box(0, y + 1.6, tz + o, l + 0.05, 0.15, 0.1, 0x7a7a7a);
                    B.xf = null;
                }
                // ---------- Covered ramps and tunnel portals ----------
                foreach (var r in line.ramps)
                {
                    double sHi = r.sHi, sLo = r.sLo;
                    int dir = sLo > sHi ? 1 : -1; // from the portal into the tunnel
                    double len = Math.Abs(sLo - sHi); int n = Math.Max(1, (int)Math.Ceiling(len / 4));
                    for (int k = 0; k < n; k++)
                    {
                        double sm = sHi + dir * (k + 0.5) * (len / n);
                        double roof = Math.Max(0.5, line.YAt(sm) + 6.4);
                        var at = P.AtS(sm);
                        var f = new Frame(at.x, at.z, Math.Atan2(-at.dz, at.dx));
                        B.xf = f;
                        con.Box(0, 0, 0, len / n + 0.1, roof, 11, 0xb8b3a8);
                        foreach (var sd in new[] { -1, 1 }) paint.Box(0, Math.Max(0, roof - 0.9), sd * 5.52, len / n + 0.1, 0.4, 0.04, line.color, new BoxOpts { top = false });
                        colliders.Framed(f).AddCentered(0, 0, len / n, 11, roof, "wall");
                    }
                    // The portal: a dark opening the size of a train, framed, the line's colour on the lintel.
                    double yHi = line.YAt(sHi);
                    var ap = P.AtS(sHi);
                    B.xf = new Frame(ap.x, ap.z, Math.Atan2(-ap.dz, ap.dx));
                    glow.Box(-dir * 0.06, yHi + 1.5, 0, 0.12, 4.9, 8.6, 0x040404);
                    con.Box(-dir * 0.35, yHi + 6.4, 0, 0.7, 1.2, 11.6, 0xc8c3b8);
                    paint.Box(-dir * 0.72, yHi + 6.7, 0, 0.04, 0.6, 9, line.color, new BoxOpts { top = false });
                    foreach (var sd in new[] { -1, 1 }) con.Box(-dir * 0.35, 0, sd * 5.1, 0.7, yHi + 6.4, 1.4, 0xc8c3b8);
                    B.xf = null;
                }
                // Piers, kept out of junctions and traffic lanes.
                for (double s = 15; s < P.length - 5; s += 30)
                {
                    double y = line.YAt(s);
                    if (y < 4 || IsStation(s)) continue;
                    double[] spot = null; PolyPath.At at = default;
                    foreach (var d in new double[] { 0, 6, -6, 12, -12 })
                    {
                        at = P.AtS(s + d);
                        if (InJunction(at.x, at.z)) continue;
                        spot = PierSpot(at.x, at.z);
                        if (spot != null) break;
                    }
                    if (spot == null) continue;
                    double px = spot[0], pz = spot[1];
                    con.Put(cyl, px, y / 2, pz, concrete, 0, 0.95, y, 0.95);
                    B.xf = new Frame(px, pz, Math.Atan2(-at.dz, at.dx));
                    con.Box(0, y - 1.2, 0, 2.4, 1.2, 7, concrete);
                    B.xf = null;
                    colliders.AddCentered(px, pz, 1.9, 1.9, y, "pier");
                }
                // ---------- Stations ----------
                foreach (var st in line.stations)
                {
                    // Interchange (Majestic): each line has its own hall; the street entrances are shared.
                    var twin = routes.Where(r => r != line).Select(r => r.stations.FirstOrDefault(q => q.en == st.en)).FirstOrDefault(q => q != null);
                    if (twin != null) { st.interchange = true; twin.interchange = true; }
                    double ang = Math.Atan2(-st.dirZ, st.dirX);
                    var f = new Frame(st.x, st.z, ang);
                    var col = colliders.Framed(f);
                    string hex = "#" + line.color.ToString("x6");
                    B.xf = f;
                    if (!st.underground)
                    {
                        double Y = DECK_Y;
                        st.platformY = Y + 1.6;
                        con.Box(0, Y - 1.5, 0, ST_HALF * 2, 1.5, 22, 0xd0ccc4, new BoxOpts { bottom = true });
                        foreach (var sd in new[] { -1, 1 })
                        {
                            con.Box(0, Y + 0.0, sd * 6.2, ST_HALF * 2, 1.6, 4.6, 0xd8d2c8); // platforms
                            paint.Box(0, Y + 1.6, sd * 4.05, ST_HALF * 2, 0.02, 0.3, 0xf2c200, new BoxOpts { top = true, sides = false });
                            paint.Box(0, Y, sd * 11.05, ST_HALF * 2, 1.2, 0.1, line.color, new BoxOpts { top = false });
                            glass.Box(0, Y + 1.6, sd * 10.9, ST_HALF * 2, 4.4, 0.1, 0x9fb8c8, new BoxOpts { top = false });
                        }
                        paint.Box(0, Y + 7.2, 0, ST_HALF * 2 + 2, 0.6, 24, 0xf2f2f2);
                        for (double x = -ST_HALF + 4; x <= ST_HALF - 4; x += 12) foreach (var sd in new[] { -1, 1 }) metal.Put(cyl, x, Y + 4.4, sd * 8, 0x8a9aa8, 0, 0.15, 5.6, 0.15);
                        // (Station piers that would land in a traffic lane are left out.)
                        bool ClearOfLanes(double lx, double lz) { f.ToWorld(lx, lz, out double wx, out double wz); var p = PierSpot(wx, wz); return p != null && Math.Sqrt((p[0] - wx) * (p[0] - wx) + (p[1] - wz) * (p[1] - wz)) < 0.5; }
                        foreach (var px in new[] { -ST_HALF + 6, ST_HALF - 6 })
                        {
                            foreach (var sd in new[] { -1, 1 })
                            {
                                double pz = sd * 9;
                                if (!ClearOfLanes(px, pz)) continue;
                                con.Put(cyl, px, Y / 2, pz, concrete, 0, 0.7, Y, 0.7);
                                col.AddCentered(px, pz, 1.4, 1.4, Y, "pier");
                            }
                            if (!ClearOfLanes(px, 0)) continue;
                            con.Put(cyl, px, Y / 2, 0, concrete, 0, 0.9, Y, 0.9);
                            col.AddCentered(px, 0, 1.8, 1.8, Y, "pier");
                        }
                        foreach (var sd in new[] { -1, 1 }) Board(new[] { st.kn, st.en.ToUpperInvariant() }, line.color, hex, null, 0, Y + 5.5, sd * 12.1, sd < 0 ? Math.PI : 0, 16, 3.5, f);
                        // Platform name boards inside.
                        foreach (var sd in new[] { -1, 1 }) foreach (var x in new double[] { -18, 18 }) Board(new[] { st.kn, st.en }, 0, "#1a1a1a", "#ffffff", x, Y + 4.3, sd * 10.7, sd < 0 ? 0 : Math.PI, 6, 1.2, f);
                    }
                    else
                    {
                        // Underground hall: platforms either side of the two tracks.
                        double Y = line.ugY;
                        st.platformY = Y + 1.6;
                        con.Box(0, Y - 0.6, 0, ST_HALF * 2 + 4, 0.6, 26, 0x9a9488);
                        con.Box(0, Y, 0, ST_HALF * 2 + 4, 1.45, 7.8, 0x6e665e);
                        foreach (var tz in new[] { -TRACK, TRACK }) foreach (var o in new[] { -0.75, 0.75 }) metal.Box(0, Y + 1.45, tz + o, ST_HALF * 2 + 4, 0.15, 0.1, 0x7a7a7a);
                        foreach (var sd in new[] { -1, 1 })
                        {
                            con.Box(0, Y, sd * 6.95, ST_HALF * 2, 1.6, 6.1, 0xe0dcd4);
                            paint.Box(0, Y + 1.6, sd * 4.2, ST_HALF * 2, 0.02, 0.3, 0xf2c200, new BoxOpts { sides = false });
                            con.Box(0, Y, sd * 12.8, ST_HALF * 2 + 4, 6, 0.4, 0xd8d2c8);
                            paint.Box(0, Y + 1.6, sd * 12.55, ST_HALF * 2, 0.5, 0.1, line.color, new BoxOpts { top = false });
                        }
                        foreach (var ex in new[] { -1, 1 }) con.Box(ex * (ST_HALF + 2), Y, 0, 0.4, 6, 26, 0xd8d2c8);
                        con.Box(0, Y + 6, 0, ST_HALF * 2 + 4, 0.4, 26, 0xc8c2b8, new BoxOpts { bottom = true });
                        for (double x = -ST_HALF + 3; x <= ST_HALF - 3; x += 6) foreach (var sd in new[] { -1, 1 }) glow.Box(x, Y + 5.7, sd * 7, 3.6, 0.1, 0.4, 0xf8f4e8);
                        foreach (var sd in new[] { -1, 1 }) foreach (var x in new double[] { -20, 0, 20 }) Board(new[] { st.kn, st.en }, line.color, hex, null, x, Y + 3.6, sd * 12.5, sd < 0 ? 0 : Math.PI, 7, 1.4, f);
                    }
                    B.xf = null;
                    // Street entrances: the nearest footpath on either side of the station.
                    if (twin != null && twin.entrances != null) { st.entrances = twin.entrances; continue; }
                    st.entrances = new List<(double x, double z)>();
                    foreach (var sd in new[] { -1, 1 })
                    {
                        for (double d = 8; d < 40; d += 2)
                        {
                            double ex = st.x - st.dirZ * d * sd, ez = st.z + st.dirX * d * sd;
                            var blk = layout.BlockContaining(ex, ez);
                            var ef = new Frame(ex, ez, ang + (sd < 0 ? 0 : Math.PI));
                            // The whole kiosk on the footpath, not hanging over the road.
                            bool onLand = new[] { (-2.7, -2.2), (2.7, -2.2), (2.7, 1.8), (-2.7, 1.8) }.All(q => { ef.ToWorld(q.Item1, q.Item2, out double x, out double z); var b = layout.BlockContaining(x, z); return b != null && !b.island; });
                            if (blk != null && !blk.island && onLand && !colliders.PointBlocked(ex, ez, 1))
                            {
                                B.xf = ef;
                                con.Box(0, 0.15, 0, 5, 3.2, 3, 0xe8e4dc);
                                paint.Box(0, 3.35, 0, 5.4, 0.5, 3.4, line.color);
                                glass.Box(0, 0.15, 1.52, 3, 2.6, 0.05, 0x9fb8c8, new BoxOpts { top = false });
                                B.xf = null;
                                colliders.Framed(ef).AddCentered(0, -0.6, 5, 1.8, 3.4, "building");
                                Board(new[] { "ನಮ್ಮ ಮೆಟ್ರೋ", "NAMMA METRO · " + st.en.ToUpperInvariant() }, line.color, hex, null, 0, 4.2, 1.72, 0, 5.4, 1.1, ef);
                                st.entrances.Add((ex + Math.Sin(ef.ang) * 2.8, ez + Math.Cos(ef.ang) * 2.8));
                                break;
                            }
                        }
                    }
                    if (st.entrances.Count == 0) st.entrances.Add((st.x, st.z));
                }
            }
            B.BuildAll(mats, group);
            TextSigns.Build(boards, group);

            // ---------- Trains ----------
            var world = new MetroWorld { routes = routes, group = group };
            var trainMats = new Dictionary<string, Material> { ["paint"] = mats["paint"], ["glass"] = CityMaterials.Make("metroTrainGlass", new CityMaterials.Spec { roughness = 0.1f, metallic = 0.6f }), ["metal"] = mats["metal"] };
            var cars = new Dictionary<string, (List<(string, Mesh)> cab, List<(string, Mesh)> mid)>();
            foreach (var l in md.METRO) cars[l.@short] = (CarMeshes(l.color, true), CarMeshes(l.color, false));
            var tg = new GameObject("trains").transform;
            tg.SetParent(group, false);
            var rnd = new System.Random();
            foreach (var line in routes)
            {
                const int n = 3; // per direction
                for (int k = 0; k < n; k++)
                    foreach (var dir in new[] { 1, -1 })
                    {
                        double s = dir > 0 ? line.path.length * (k + 0.15) / n : line.path.length * (k + 0.65) / n;
                        var t = new MetroWorld.Train { line = line, s = s, dir = dir, cruise = 22 + rnd.NextDouble() * 2 };
                        var set = cars[line.@short];
                        for (int c = 0; c < MetroRoutes.CARS; c++)
                        {
                            bool front = c == 0, back = c == MetroRoutes.CARS - 1;
                            var go = new GameObject("car"); go.transform.SetParent(tg, false);
                            var inner = new GameObject("body").transform; inner.SetParent(go.transform, false);
                            if (back) inner.localRotation = Quaternion.AngleAxis(180, Vector3.up); // the rear cab faces backwards
                            foreach (var (key, mesh) in front || back ? set.cab : set.mid)
                            {
                                var m = new GameObject(key); m.transform.SetParent(inner, false);
                                m.AddComponent<MeshFilter>().sharedMesh = mesh;
                                var mr = m.AddComponent<MeshRenderer>(); mr.sharedMaterial = trainMats[key];
                                mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; // trains move
                            }
                            t.cars.Add((go.transform, MetroRoutes.CAR / 2 + c * (MetroRoutes.CAR + 0.6)));
                        }
                        world.trains.Add(t);
                    }
            }
            world.Update(0);
            return world;
        }

        // One car along local +x (length CAR), with optional cab at +x.
        static List<(string, Mesh)> CarMeshes(int color, bool cab)
        {
            var B = new BuilderSet();
            var p = B.Get("paint"); var g = B.Get("glass"); var m = B.Get("metal");
            const double len = MetroRoutes.CAR, Y = 0;
            int steel = 0xb8bcc0, doorCol = 0xa2a6aa, dark = 0x3a3d42;
            var noTop = new BoxOpts { top = false };
            m.Box(0, Y + 0.7, 0, len, 2.7, 2.9, steel, new BoxOpts { bottom = true });
            p.Box(0, Y + 0.4, 0, len, 0.32, 2.86, 0x55595e, noTop);
            p.Box(0, Y + 3.4, 0, len - 0.4, 0.1, 2.5, 0x8a8e92);
            foreach (var rx in new double[] { -5, 3 }) p.Box(rx, Y + 3.5, 0, 2.4, 0.3, 1.6, 0x9a9ea2);
            p.Box(0, Y + 1.35, 0, len, 0.14, 2.94, color, noTop);
            foreach (var dx in new[] { -7.5, -2.5, 2.5, 7.5 })
            {
                p.Box(dx, Y + 0.73, 0, 1.4, 2.3, 2.92, doorCol, noTop);
                p.Box(dx, Y + 1.35, 0, 1.4, 0.14, 2.95, color, noTop);
                foreach (var o in new[] { -0.33, 0.33 }) g.Box(dx + o, Y + 1.65, 0, 0.5, 1.15, 2.96, 0x161c22, noTop);
            }
            foreach (var wx in new double[] { -5, 0, 5 }) g.Box(wx, Y + 1.7, 0, 2.6, 1.0, 2.94, 0x161c22, noTop);
            foreach (var bx in new[] { -6.5, 6.5 }) p.Box(bx, Y + 0.1, 0, 2.6, 0.45, 2.2, 0x2a2a2a, noTop);
            if (cab)
            {
                double At(double d) => len / 2 + d;
                m.Box(At(0.25), Y + 0.4, 0, 0.5, 0.6, 2.8, steel);
                p.Box(At(0.4), Y + 0.45, 0, 0.3, 0.25, 0.6, 0x2a2a2a);
                p.Box(At(0.12), Y + 1.0, 0, 0.24, 2.4, 2.9, color);
                p.Box(At(0.25), Y + 1.1, 0, 0.06, 0.75, 2.4, dark);
                g.Box(At(0.25), Y + 1.95, 0, 0.06, 1.25, 2.3, 0x10161c);
                p.Box(At(0.29), Y + 3.0, 0, 0.03, 0.18, 0.9, 0xffa020);
                foreach (var hz in new[] { -0.95, -0.72, 0.72, 0.95 }) p.Box(At(0.29), Y + 1.35, hz, 0.03, 0.13, 0.13, 0xf8f6ee);
            }
            else p.Box(len / 2 + 0.3, Y + 0.7, 0, 0.7, 2.6, 2.2, 0x2a2a2a);
            var output = new List<(string, Mesh)>();
            foreach (var key in new[] { "paint", "glass", "metal" }) foreach (var mesh in B.Get(key).Meshes(key)) output.Add((key, mesh));
            return output;
        }
    }
}
