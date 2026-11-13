// Street life (port of src/entities/pedestrians.js): footpath walkers streamed around the
// player, crowds that bunch up at signals (and jaywalk), chai-stall regulars, cows, and how
// people react when you hit them. Same seed (99) and the same order of random draws as the JS.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.Render;
using NammaBengaluru.Systems;
using NammaBengaluru.World;
using UnityEngine;

namespace NammaBengaluru.Entities
{
    public interface IStreetWorld
    {
        (double x, double z) Focus { get; }
        List<Vehicle> Vehicles { get; }
        Player Player { get; }
        IPlayerWorld PlayerWorld { get; }
        bool InitialFill { get; }
        double PedScale { get; }
        void Say(string text, double seconds);
        void Crime(string what, double x, double z, int stars);
    }

    // A walking loop around a block, half a footpath in from the kerb.
    public class WalkLoop
    {
        public class Seg { public double x, z, ux, uz, nx, nz, l, t0; }
        public readonly List<Seg> segs = new List<Seg>();
        public double len, cx, cz;
        public string zone;
    }

    public class CrowdGroup { public NetNode node; public readonly List<Ped> peds = new List<Ped>(); }

    // A chai stall (or, later, a waiting crowd on a bus platform).
    public class Stall
    {
        public double x, z;
        public int n;
        public double[] spread;
        public double? face;
        public bool cool;
        public readonly List<Ped> peds = new List<Ped>();
    }

    public class Ped : Obstacle
    {
        public Human h;
        public double vx, vy, vz, timer, health = 100, speed = 1.3, t, lat, impatience, attack, deadT;
        public int dir = 1, ci;
        public string state = "walk", kind, afterDown, afterStagger;
        public bool temp, crossed, jaywalk, landed, dead;
        public WalkLoop L;
        public CrowdGroup crowd;
        public Stall stall;
        public NetNode node;
        public List<(double x, double z)> route;
        public bool Visible => h.go.activeSelf;
    }

    public class Cow : Obstacle
    {
        public GameObject go;
        public Transform head;
        public double h, timer;
        public bool moving;
        public readonly List<Mesh> meshes = new List<Mesh>();
    }

    public class StreetLife
    {
        readonly Mulberry32 rng = new Mulberry32(99);
        double Rand(double a = 0, double b = 1) => a + (b - a) * rng.Next();
        string PickLine(List<string> list) => list[(int)Math.Floor(rng.Next() * list.Count)];

        readonly Layout layout;
        readonly Colliders colliders;
        readonly Signals signals;
        readonly GameConfig cfg;
        readonly Transform root;
        public readonly List<Ped> peds = new List<Ped>();
        public readonly List<Cow> cows = new List<Cow>();
        readonly List<Human> pool = new List<Human>();
        public int walkerTarget = 110, cowTarget = 8;
        public readonly List<WalkLoop> loops;
        readonly Dictionary<NetNode, CrowdGroup> crowdNodes = new Dictionary<NetNode, CrowdGroup>();
        public readonly List<Stall> stalls = new List<Stall>();
        readonly List<Circle> tmpC = new List<Circle>();
        static Material cowMat;
        internal static void ResetStatics() { cowMat = null; }
        int frame;
        double clock;

        public StreetLife(Layout layout, Colliders colliders, Signals signals, GameConfig cfg, Transform parent, Dictionary<string, Material> mats)
        {
            this.layout = layout; this.colliders = colliders; this.signals = signals; this.cfg = cfg;
            root = new GameObject("streetLife").transform;
            root.SetParent(parent, false);
            loops = layout.blocks.Where(b => b.zone != "lake" && b.zone != "rural" && !b.airportSite).Select(LoopFor).Where(l => l != null).ToList();
            if (cowMat == null) cowMat = CityMaterials.Make("cow", new CityMaterials.Spec { roughness = 0.9f });
            BuildChaiStalls(mats);
        }

        static WalkLoop LoopFor(Block block)
        {
            var pts = RoadNet.InsetPolygon(block.poly, block.poly.Select(_ => GameConfig.SIDEWALK_W * 0.5).ToList());
            if (pts == null) return null;
            double sgn = Math.Sign(RoadNet.PolyArea(pts));
            var L = new WalkLoop { cx = block.cx, cz = block.cz, zone = block.zone };
            for (int i = 0; i < pts.Count; i++)
            {
                double x1 = pts[i][0], z1 = pts[i][1], x2 = pts[(i + 1) % pts.Count][0], z2 = pts[(i + 1) % pts.Count][1];
                double l = Math.Sqrt((x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1));
                if (l < 1e-3) continue;
                double ux = (x2 - x1) / l, uz = (z2 - z1) / l;
                L.segs.Add(new WalkLoop.Seg { x = x1, z = z1, ux = ux, uz = uz, nx = uz * sgn, nz = -ux * sgn, l = l, t0 = L.len });
                L.len += l;
            }
            return L.segs.Count > 0 ? L : null;
        }

        static WalkLoop.Seg SegAt(WalkLoop L, ref double t)
        {
            t = ((t % L.len) + L.len) % L.len;
            var s = L.segs[L.segs.Count - 1];
            foreach (var q in L.segs) if (t < q.t0 + q.l) { s = q; break; }
            return s;
        }

        // Point at distance t round the loop, `lat` metres out towards the road.
        static (double x, double z) LoopPoint(WalkLoop L, double t, double lat)
        {
            var s = SegAt(L, ref t);
            double d = t - s.t0;
            return (s.x + s.ux * d + s.nx * lat, s.z + s.uz * d + s.nz * lat);
        }

        static WalkLoop.Seg LoopNormal(WalkLoop L, double t) => SegAt(L, ref t);

        static double NearestT(WalkLoop L, double x, double z)
        {
            double best = 0, bd = double.PositiveInfinity;
            foreach (var s in L.segs)
            {
                double d = Math.Max(0, Math.Min(s.l, (x - s.x) * s.ux + (z - s.z) * s.uz));
                double ex = s.x + s.ux * d - x, ez = s.z + s.uz * d - z, e = Math.Sqrt(ex * ex + ez * ez);
                if (e < bd) { bd = e; best = s.t0 + d; }
            }
            return best;
        }

        static void TurnTo(Human h, double target, double k)
        {
            double d = target - h.heading;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            h.heading += d * Math.Min(1, k);
        }

        Human TakeHuman()
        {
            Human h;
            if (pool.Count > 0) { h = pool[pool.Count - 1]; pool.RemoveAt(pool.Count - 1); }
            else
            {
                // createHuman({}, rng) draws a random person; here, one of the 48 baked passers-by.
                var humans = ModelLibrary.Humans;
                h = new Human(ModelLibrary.Ped((int)Math.Floor(rng.Next() * 48)), rng.Next);
                h.go.transform.SetParent(root, false);
            }
            h.go.SetActive(true);
            h.heading = 0; h.tiltX = 0;
            return h;
        }

        void FreePed(Ped p, int index)
        {
            p.h.go.SetActive(false);
            if (pool.Count < 80 && !p.temp) pool.Add(p.h);
            else UnityEngine.Object.Destroy(p.h.go);
            if (index >= 0) peds.RemoveAt(index);
        }

        Ped NewPed(Human h, Ped p)
        {
            p.h = h; p.y = GameConfig.CURB_H; p.r = 0.3;
            peds.Add(p);
            return p;
        }

        Ped SpawnWalker((double x, double z) focus, bool initial)
        {
            for (int tries = 0; tries < 10; tries++)
            {
                var L = loops[(int)Math.Floor(rng.Next() * loops.Count)];
                double d = Math.Sqrt((L.cx - focus.x) * (L.cx - focus.x) + (L.cz - focus.z) * (L.cz - focus.z));
                if (d > 230 || (!initial && d < 60)) continue;
                var h = TakeHuman();
                var p = NewPed(h, new Ped { kind = "walker", L = L });
                p.t = Rand(0, L.len); p.dir = rng.Next() < 0.5 ? 1 : -1; p.speed = Rand(1.0, 1.6); p.lat = Rand(-1.2, 1.2);
                var q = LoopPoint(L, p.t, p.lat);
                p.x = q.x; p.z = q.z;
                return p;
            }
            return null;
        }

        void BuildChaiStalls(Dictionary<string, Material> mats)
        {
            var B = new BuilderSet(320);
            var cyl = Primitives.Cylinder(1, 1, 1, 10); var cone = Primitives.Cone(1, 1, 10);
            var zones = new HashSet<string> { "commercial", "market", "mixed", "towers", "industrial" };
            var candidates = loops.Where(l => zones.Contains(l.zone)).ToList();
            for (int k = 0; k < candidates.Count; k++)
            {
                if (k % 3 != 0) continue;
                var L = candidates[k];
                var q = LoopPoint(L, Rand(0, L.len), 0.6);
                var m = B.Get("m");
                double C = GameConfig.CURB_H;
                m.Box(q.x, C, q.z, 1.4, 0.9, 0.8, 0x6a4a2a);
                m.Box(q.x, C + 0.9, q.z, 1.5, 0.08, 0.9, 0xc0c0c0);
                m.Put(cyl, q.x - 0.3, C + 1.1, q.z, 0xb0b0b0, 0, 0.15, 0.3, 0.15);
                m.Put(cyl, q.x, C + 1.7, q.z, 0x555555, 0, 0.03, 1.5, 0.03);
                m.Put(cone, q.x, C + 2.5, q.z, rng.Next() < 0.5 ? 0xd03a2a : 0x2a6ad0, 0, 1.3, 0.5, 1.3);
                colliders.AddCentered(q.x, q.z, 1.4, 0.8, 1.2, "prop");
                stalls.Add(new Stall { x = q.x, z = q.z });
            }
            var go = new GameObject("chaiStalls");
            go.transform.SetParent(root, false);
            B.BuildAll(new Dictionary<string, Material> { ["m"] = CityMaterials.Make("stall", new CityMaterials.Spec { roughness = 0.8f }) }, go.transform);
        }

        void SpawnCow((double x, double z) focus)
        {
            for (int tries = 0; tries < 10; tries++)
            {
                var hit = layout.EdgeAt(focus.x + Rand(-300, 300), focus.z + Rand(-300, 300));
                if (hit == null) continue;
                var e = hit.Value.e;
                double ux = (e.b.x - e.a.x) / e.len, uz = (e.b.z - e.a.z) / e.len;
                double t = Rand(0.25, 0.75) * e.len, lat = (e.r.width / 2 - 1.2) * (rng.Next() < 0.5 ? -1 : 1);
                double x = e.a.x + ux * t - uz * lat, z = e.a.z + uz * t + ux * lat;
                double d = Math.Sqrt((x - focus.x) * (x - focus.x) + (z - focus.z) * (z - focus.z));
                if (d < 90 || d > 330 || layout.UnderpassAt(x, z) != null || layout.FlyoverAt(x, z) != null) continue;
                var c = MakeCow();
                c.x = x; c.z = z; c.y = 0; c.h = Math.Atan2(ux, uz);
                c.timer = Rand(2, 10);
                PlaceCow(c, 0);
                cows.Add(c);
                return;
            }
        }

        void PlaceCow(Cow c, double y)
        {
            c.go.transform.localPosition = Game.ToUnity(c.x, y, c.z);
            c.go.transform.localRotation = Quaternion.AngleAxis((float)(-c.h * Mathf.Rad2Deg), Vector3.up);
        }

        // A carjacked driver bolts away from the player.
        public Ped SpawnFleeing(double x, double z, double fromX, double fromZ, HumanModelDef who = null)
        {
            var h = new Human(who ?? ModelLibrary.Ped((int)Math.Floor(rng.Next() * 48)), rng.Next);
            h.go.transform.SetParent(root, false);
            double a = Math.Atan2(x - fromX, z - fromZ);
            var p = NewPed(h, new Ped { kind = "temp", temp = true, state = "flee", vx = Math.Sin(a) * 4.5, vz = Math.Cos(a) * 4.5, timer = 7 });
            p.x = x; p.z = z; p.y = layout.GroundHeight(x, z, null);
            return p;
        }

        public void Knock(Ped p, double vx, double vz)
        {
            if (p.state == "down") return;
            p.state = "down";
            p.vx = vx * 0.7 + Rand(-1, 1);
            p.vz = vz * 0.7 + Rand(-1, 1);
            p.vy = 2.5 + Math.Min(8, Math.Sqrt(vx * vx + vz * vz) * 0.15);
            p.timer = 4.5;
            p.health = Math.Max(p.health, 40);
            GameAudio.I?.Thud(0.6);
        }

        // Killed: down for good.
        public void Kill(Ped p, double vx, double vz)
        {
            if (p.dead) return;
            GameAudio.I?.Death(p.h.female, p.x, p.z);
            if (p.kind == "crowd" || p.kind == "stall") Detach(p);
            p.state = "walk"; // so Knock() takes effect
            Knock(p, vx, vz);
            p.dead = true; p.deadT = 0; p.health = 0;
        }

        // Gunfire or a blade nearby: everyone runs.
        public void Panic(double x, double z, double r)
        {
            int screams = 0, n = 0;
            foreach (var q in peds.ToList())
            {
                if (q.state == "down" || q.dead) continue;
                if (Math.Abs(q.x - x) < r && Math.Abs(q.z - z) < r)
                {
                    if (q.state != "flee" && screams < 2 && rng.Next() < 0.35) { screams++; GameAudio.I?.Scream(q.h.female, q.x, q.z); }
                    Scare(q, x, z);
                    n++;
                }
            }
            if (n > 6) GameAudio.I?.CrowdScream(x, z);
        }

        // (After Panic's loop:) more than six people running makes the crowd scream.
        // Player melee (or a bullet) lands on a pedestrian.
        public void Hit(Ped p, double dmg, double dirX, double dirZ, IStreetWorld world, bool kick, bool lethal = false)
        {
            if (p.dead) return;
            p.health -= dmg;
            GameAudio.I?.Punch(kick);
            GameAudio.I?.Grunt(p.h.female, p.x, p.z);
            if (lethal && p.health <= 0)
            {
                Kill(p, dirX * 5, dirZ * 5);
                Panic(p.x, p.z, 30);
                return;
            }
            if (p.health <= 0 || (kick && !lethal))
            {
                Knock(p, dirX * (kick ? 7 : 4), dirZ * (kick ? 7 : 4));
                p.afterDown = rng.Next() < 0.2 && !p.h.female ? "angry" : "flee";
            }
            else
            {
                p.state = "stagger"; p.timer = 0.45;
                p.vx = dirX * 2.5; p.vz = dirZ * 2.5;
                p.afterStagger = rng.Next() < (p.h.female ? 0.08 : 0.3) ? "angry" : "flee";
            }
            world.Say($"\"{PickLine(cfg.LINES["punched"])}\"", 2);
            // Nearby people scatter.
            foreach (var q in peds.ToList())
            {
                if (q == p || q.state == "down") continue;
                if (Math.Abs(q.x - p.x) < 12 && Math.Abs(q.z - p.z) < 12 && rng.Next() < 0.7) Scare(q, p.x, p.z);
            }
        }

        public void Scare(Ped q, double fromX, double fromZ)
        {
            if (q.state == "angry") return;
            if (q.kind == "crowd" || q.kind == "stall") Detach(q);
            double a = Math.Atan2(q.x - fromX, q.z - fromZ) + Rand(-0.5, 0.5);
            q.state = "flee"; q.timer = Rand(3, 6);
            q.vx = Math.Sin(a) * 4.5; q.vz = Math.Cos(a) * 4.5;
        }

        // Someone waving down an auto at the kerb (until they're picked up, or give up and walk on).
        public void Hail(Ped p) { if (p.kind != "walker") Detach(p); p.state = "hail"; }
        public void Unhail(Ped p) { if (p.state == "hail") { p.state = "walk"; p.lat = 0; } }

        // They got into a vehicle: off the street, and their figure goes with them.
        public Human Take(Ped p) { peds.Remove(p); return p.h; }

        // Back on the street after a ride: walk off along the nearest footpath.
        public Ped Adopt(Human h, double x, double z)
        {
            h.go.transform.SetParent(root, false);
            h.go.SetActive(true);
            h.heading = 0; h.tiltX = 0;
            var L = NearestLoop(x, z);
            var p = NewPed(h, new Ped { kind = "walker", L = L, x = x, z = z });
            p.t = NearestT(L, x, z); p.dir = rng.Next() < 0.5 ? 1 : -1; p.speed = Rand(1.1, 1.5); p.lat = 0;
            return p;
        }

        // Crowd/stall people become ordinary walkers once disturbed.
        void Detach(Ped q)
        {
            q.crowd?.peds.Remove(q); q.crowd = null;
            q.stall?.peds.Remove(q); q.stall = null;
            q.kind = "walker";
            q.L = NearestLoop(q.x, q.z);
            q.t = NearestT(q.L, q.x, q.z);
            q.dir = rng.Next() < 0.5 ? 1 : -1; q.lat = 0; q.speed = Rand(1, 1.5);
        }

        WalkLoop NearestLoop(double x, double z)
        {
            WalkLoop best = loops[0]; double bd = double.PositiveInfinity;
            foreach (var L in loops) { double d = Math.Abs(L.cx - x) + Math.Abs(L.cz - z); if (d < bd) { bd = d; best = L; } }
            return best;
        }

        // ---------- Signal crowds ----------
        void UpdateCrowds((double x, double z) focus)
        {
            var near = signals.nodes.Where(n => Math.Abs(n.x - focus.x) < 200 && Math.Abs(n.z - focus.z) < 200)
                .OrderBy(n => Math.Sqrt((n.x - focus.x) * (n.x - focus.x) + (n.z - focus.z) * (n.z - focus.z))).Take(3).ToList();
            var keep = new HashSet<NetNode>(near);
            foreach (var n in crowdNodes.Keys.ToList())
            {
                if (keep.Contains(n)) continue;
                foreach (var p in crowdNodes[n].peds) { int i = peds.IndexOf(p); if (i >= 0) FreePed(p, i); }
                crowdNodes.Remove(n);
            }
            foreach (var n in near)
            {
                if (crowdNodes.ContainsKey(n)) continue;
                var g = new CrowdGroup { node = n };
                for (int ci = 0; ci < n.corners.Count; ci++)
                {
                    if (n.corners[ci].gap > Math.PI * 0.9) continue;
                    int count = 3 + (int)Math.Floor(rng.Next() * 4);
                    for (int k = 0; k < count; k++)
                    {
                        var h = TakeHuman();
                        var p = NewPed(h, new Ped { kind = "crowd", state = "wait", crowd = g, node = n, ci = ci });
                        p.impatience = rng.Next();
                        PlaceAtCorner(p);
                        g.peds.Add(p);
                    }
                }
                crowdNodes[n] = g;
            }
        }

        // On the footpath behind the kerb corner; impatient people spill off it onto the carriageway.
        (double x, double z) CornerPos(NetNode n, int ci, double spill = 0)
        {
            var c = n.corners[ci];
            double dx = c.x - n.x, dz = c.z - n.z, l = Math.Sqrt(dx * dx + dz * dz);
            if (l == 0) l = 1;
            double d = 2.2 - spill;
            double x = c.x + (dx / l) * d + Rand(-1.0, 1.0);
            return (x, c.z + (dz / l) * d + Rand(-1.0, 1.0));
        }

        void PlaceAtCorner(Ped p)
        {
            double spill = p.impatience > 0.75 ? Rand(0.8, 2.0) : 0;
            var c = CornerPos(p.node, p.ci, spill);
            p.x = c.x; p.z = c.z;
            p.h.heading = Math.Atan2(p.node.x - p.x, p.node.z - p.z) + Rand(-0.6, 0.6);
            p.crossed = false;
        }

        // Cross one of the two roads either side of this corner, along its zebra.
        void StartCrossing(Ped p, bool forward)
        {
            var n = p.node; int k = n.corners.Count;
            var c = n.corners[p.ci];
            var h = n.adj[forward ? c.b : c.a];
            double cut = n.cut.TryGetValue(h.e.id, out var cv) ? cv : 0;
            double px = -h.uz, pz = h.ux, s = forward ? -1 : 1;
            (double, double) Z(double side) => (n.x + h.ux * (cut + 2.1) + px * (h.w + 0.3) * side, n.z + h.uz * (cut + 2.1) + pz * (h.w + 0.3) * side);
            var a = Z(s); var b = Z(-s);
            p.ci = forward ? (p.ci + 1) % k : (p.ci - 1 + k) % k;
            if (n.corners[p.ci].gap > Math.PI * 0.9) p.ci = forward ? (p.ci + 1) % k : (p.ci - 1 + k) % k;
            var end = CornerPos(n, p.ci);
            p.route = new List<(double x, double z)> { a, b, end };
            p.state = "cross";
        }

        public void Update(double dt, IStreetWorld world)
        {
            var focus = world.Focus;
            var vehicles = world.Vehicles;
            clock += dt;
            double t = clock;
            frame++;

            // Streaming.
            UpdateCrowds(focus);
            int walkers = 0;
            foreach (var p in peds) if (p.kind == "walker") walkers++;
            int budget = 6;
            while (walkers + (6 - budget) < walkerTarget * world.PedScale && budget-- > 0) SpawnWalker(focus, world.InitialFill);
            foreach (var s in stalls)
            {
                bool near = Math.Abs(s.x - focus.x) < 150 && Math.Abs(s.z - focus.z) < 150;
                if (near && s.peds.Count == 0 && !s.cool)
                {
                    // Chai stalls get a ring of three; waiting crowds (bus platforms) stand scattered over `spread`.
                    int n = s.n > 0 ? s.n : 3;
                    for (int k = 0; k < n; k++)
                    {
                        double a = (double)k / n * Math.PI * 2 + Rand(0, 1);
                        double x = s.spread != null ? s.x + Rand(-s.spread[0], s.spread[0]) : s.x + Math.Cos(a) * 1.4;
                        double z = s.spread != null ? s.z + Rand(-s.spread[1], s.spread[1]) : s.z + Math.Sin(a) * 1.2;
                        var p = NewPed(TakeHuman(), new Ped { kind = "stall", state = "idle", stall = s });
                        p.x = x; p.z = z;
                        p.h.heading = s.spread != null ? (s.face ?? 0) + Rand(-0.8, 0.8) : Math.Atan2(s.x - p.x, s.z - p.z);
                        s.peds.Add(p);
                    }
                }
                else if (!near && s.peds.Count > 0)
                {
                    foreach (var p in s.peds) { int i = peds.IndexOf(p); if (i >= 0) FreePed(p, i); }
                    s.peds.Clear();
                }
            }
            if (cows.Count < cowTarget && rng.Next() < dt) SpawnCow(focus);

            var pl = world.Player;
            for (int i = peds.Count - 1; i >= 0; i--)
            {
                if (i >= peds.Count) continue;
                var p = peds[i];
                double dist = Math.Sqrt((p.x - focus.x) * (p.x - focus.x) + (p.z - focus.z) * (p.z - focus.z));
                if (p.kind == "walker" && dist > 260) { FreePed(p, i); continue; }
                if (p.temp && dist > 200) { FreePed(p, i); continue; }
                bool vis = dist < 170;
                if (p.h.go.activeSelf != vis) p.h.go.SetActive(vis);
                if (!vis && p.state == "walk") { p.t += p.dir * p.speed * dt; continue; }

                if (p.state != "down") CheckVehicleHits(p, vehicles, world);

                switch (p.state)
                {
                    case "walk":
                    {
                        p.t += p.dir * p.speed * dt;
                        var q = LoopPoint(p.L, p.t, p.lat);
                        double dx = q.x - p.x, dz = q.z - p.z;
                        p.x = q.x; p.z = q.z;
                        if (dx * dx + dz * dz > 1e-6) TurnTo(p.h, Math.Atan2(dx, dz), dt * 8);
                        // Distant walkers animate at a third of the rate.
                        if (dist < 70) p.h.AnimateWalk(dt, p.speed);
                        else if ((frame + i) % 3 == 0) p.h.AnimateWalk(dt * 3, p.speed);
                        if (rng.Next() < dt * 0.01) p.dir *= -1;
                        break;
                    }
                    case "idle":
                        p.h.PoseIdle(t);
                        break;
                    case "hail":
                    {
                        p.lat += (1.75 - p.lat) * Math.Min(1, dt * 2);
                        var q = LoopPoint(p.L, p.t, p.lat); var n = LoopNormal(p.L, p.t);
                        p.x = q.x; p.z = q.z;
                        TurnTo(p.h, Math.Atan2(n.nx, n.nz), dt * 6);
                        p.h.PoseHail(t);
                        break;
                    }
                    case "wait":
                    {
                        var n = p.node;
                        if (signals.PedPhase(n) && !p.crossed && rng.Next() < dt * 1.5) { p.crossed = true; StartCrossing(p, rng.Next() < 0.5); }
                        // Jaywalking: the impatient don't wait for the walk phase.
                        else if (!signals.PedPhase(n) && p.impatience > 0.85 && rng.Next() < dt * 0.02) { StartCrossing(p, rng.Next() < 0.5); p.jaywalk = true; }
                        if (!signals.PedPhase(n)) p.crossed = false;
                        p.h.PoseWait(t, p.impatience);
                        break;
                    }
                    case "cross":
                    {
                        var tgt = p.route[0];
                        double dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.Sqrt(dx * dx + dz * dz);
                        double sp = p.jaywalk ? 3.2 : signals.PedTimeLeft(p.node) < 4 ? 2.6 : 1.5;
                        if (d < 0.3) { p.route.RemoveAt(0); if (p.route.Count == 0) { p.state = "wait"; p.jaywalk = false; p.crossed = true; } break; }
                        p.x += (dx / d) * sp * dt; p.z += (dz / d) * sp * dt;
                        TurnTo(p.h, Math.Atan2(dx, dz), dt * 10);
                        p.h.AnimateWalk(dt, sp);
                        break;
                    }
                    case "dodge":
                    case "flee":
                    {
                        p.x += p.vx * dt; p.z += p.vz * dt;
                        var hit = colliders.ResolveCircle(p.x, p.z, p.r, p.y);
                        if (hit != null)
                        {
                            p.x = hit.Value.x; p.z = hit.Value.z;
                            if (p.state == "flee") { double a = Math.Atan2(p.vx, p.vz) + (rng.Next() < 0.5 ? 1.2 : -1.2); p.vx = Math.Sin(a) * 4.5; p.vz = Math.Cos(a) * 4.5; }
                        }
                        p.h.heading = Math.Atan2(p.vx, p.vz);
                        p.h.AnimateWalk(dt, Math.Sqrt(p.vx * p.vx + p.vz * p.vz));
                        p.timer -= dt;
                        if (p.timer <= 0)
                        {
                            if (p.temp) { FreePed(p, i); continue; }
                            if (p.kind != "walker") Detach(p);
                            p.state = "walk"; p.t = NearestT(p.L, p.x, p.z); p.lat = 0;
                        }
                        break;
                    }
                    case "stagger":
                        p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 0.9; p.vz *= 0.9;
                        p.timer -= dt;
                        p.h.PoseStagger(1 - p.timer / 0.45);
                        if (p.timer <= 0)
                        {
                            if (p.afterStagger == "angry") { p.state = "angry"; p.timer = 15; world.Say($"\"{PickLine(cfg.LINES["fightBack"])}\"", 2); }
                            else Scare(p, pl.x, pl.z);
                        }
                        break;
                    case "angry": UpdateAngry(p, dt, world, t); break;
                    case "cower":
                        p.h.PoseHandsUp(t);
                        p.timer -= dt;
                        if (p.timer <= 0) Scare(p, pl.x, pl.z);
                        break;
                    case "down":
                    {
                        p.vy -= 9.8 * dt;
                        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
                        double g = layout.GroundHeight(p.x, p.z, p.y);
                        if (p.y <= g) { p.y = g; p.vy = 0; p.vx *= Math.Exp(-6 * dt); p.vz *= Math.Exp(-6 * dt); }
                        var hit = colliders.ResolveCircle(p.x, p.z, p.r, p.y);
                        if (hit != null) { p.x = hit.Value.x; p.z = hit.Value.z; p.vx *= -0.3; p.vz *= -0.3; }
                        p.h.tiltX += (-Math.PI / 2 - p.h.tiltX) * Math.Min(1, dt * 8);
                        p.h.PoseDown();
                        if (p.dead) { p.deadT += dt; if (p.deadT > 60 && dist > 50) { FreePed(p, i); continue; } break; }
                        p.timer -= dt;
                        if (p.timer <= 0)
                        {
                            p.h.tiltX = 0;
                            p.health = 60;
                            if (p.afterDown == "angry") { p.state = "angry"; p.timer = 12; p.afterDown = null; }
                            else Scare(p, pl.x, pl.z);
                        }
                        break;
                    }
                }
                if (p.state != "down") p.y = layout.GroundHeight(p.x, p.z, p.y);
                p.h.x = p.x; p.h.y = p.y; p.h.z = p.z;
                if (p.h.go.activeSelf) p.h.Apply();
                if (p.health < 100 && p.state != "down" && !p.dead) p.health = Math.Min(100, p.health + dt * 3);
            }
            UpdateCows(dt, world, t);
        }

        void UpdateAngry(Ped p, double dt, IStreetWorld world, double t)
        {
            var pl = world.Player;
            double dx = pl.x - p.x, dz = pl.z - p.z, d = Math.Sqrt(dx * dx + dz * dz);
            p.timer -= dt;
            if (p.timer <= 0 || pl.vehicle != null || d > 25 || pl.dead) { Scare(p, pl.x, pl.z); return; }
            TurnTo(p.h, Math.Atan2(dx, dz), dt * 10);
            if (p.attack > 0)
            {
                p.attack -= dt;
                double k = 1 - p.attack / 0.55;
                p.h.PosePunch(k, -1);
                if (!p.landed && k > 0.4) { p.landed = true; if (d < 1.4) pl.Damage(9, p.x, p.z, world.PlayerWorld); }
                return;
            }
            if (d > 1.1)
            {
                const double sp = 3.6;
                p.x += (dx / d) * sp * dt; p.z += (dz / d) * sp * dt;
                var hit = colliders.ResolveCircle(p.x, p.z, p.r, p.y);
                if (hit != null) { p.x = hit.Value.x; p.z = hit.Value.z; }
                p.h.AnimateWalk(dt, sp);
            }
            else
            {
                p.h.PoseFight(t);
                if (rng.Next() < dt * 1.8) { p.attack = 0.55; p.landed = false; }
            }
        }

        void CheckVehicleHits(Ped p, List<Vehicle> vehicles, IStreetWorld world)
        {
            foreach (var v in vehicles)
            {
                double speed = v.Speed;
                if (speed < 3) continue;
                double dx = p.x - v.x, dz = p.z - v.z;
                if (dx * dx + dz * dz > 64 || Math.Abs(p.y - v.y) > 2) continue;
                foreach (var c in v.Circles(tmpC))
                {
                    if ((p.x - c.x) * (p.x - c.x) + (p.z - c.z) * (p.z - c.z) < (c.r + p.r) * (c.r + p.r))
                    {
                        if (p.kind != "walker" && !p.temp) Detach(p);
                        if (speed > 15) Kill(p, v.vx, v.vz); else Knock(p, v.vx, v.vz);
                        if (v.driver == "player")
                        {
                            if (rng.Next() < 0.6) world.Say($"\"{PickLine(cfg.LINES["bumped"])}\"", 2.5);
                            world.Crime("Hit a pedestrian", p.x, p.z, 1);
                        }
                        return;
                    }
                }
            }
            // Dodge a fast vehicle heading straight at us.
            if (p.state == "walk" || p.state == "idle" || p.state == "wait")
            {
                foreach (var v in vehicles)
                {
                    double speed = v.Speed;
                    if (v.driver != "player" || speed < 6) continue;
                    double dx = p.x - v.x, dz = p.z - v.z, d2 = dx * dx + dz * dz;
                    if (d2 > 64) continue;
                    double ahead = (dx * v.vx + dz * v.vz) / speed;
                    if (ahead > 0)
                    {
                        if (p.kind != "walker") Detach(p);
                        p.state = "dodge"; p.timer = 0.6;
                        double lx = v.vz / speed, lz = -v.vx / speed;
                        double s = Math.Sign(dx * lx + dz * lz); if (s == 0) s = 1;
                        p.vx = lx * s * 5; p.vz = lz * s * 5;
                    }
                }
            }
        }

        void UpdateCows(double dt, IStreetWorld world, double t)
        {
            var focus = world.Focus;
            for (int i = cows.Count - 1; i >= 0; i--)
            {
                var c = cows[i];
                if (Math.Sqrt((c.x - focus.x) * (c.x - focus.x) + (c.z - focus.z) * (c.z - focus.z)) > 380)
                {
                    UnityEngine.Object.Destroy(c.go);
                    foreach (var m in c.meshes) UnityEngine.Object.Destroy(m);
                    cows.RemoveAt(i);
                    continue;
                }
                c.timer -= dt;
                if (c.timer <= 0)
                {
                    c.moving = !c.moving && rng.Next() < 0.5;
                    c.timer = c.moving ? Rand(3, 8) : Rand(5, 15);
                    if (rng.Next() < 0.3) GameAudio.I?.Moo(c.x, c.z);
                }
                if (c.shoo)
                {
                    // Honked at: off the carriageway onto the footpath, at a cow's idea of a hurry.
                    var hh = layout.EdgeAt(c.x, c.z);
                    if (hh == null || hh.Value.d > hh.Value.e.r.width / 2 + 1.2) { c.shoo = false; c.moving = false; c.timer = Rand(20, 40); }
                    else
                    {
                        var h = hh.Value;
                        double px = h.e.a.x + (h.e.b.x - h.e.a.x) * h.t, pz = h.e.a.z + (h.e.b.z - h.e.a.z) * h.t;
                        double ox = c.x - px, oz = c.z - pz, l = Math.Sqrt(ox * ox + oz * oz);
                        if (l < 0.1) { ox = -(h.e.b.z - h.e.a.z); oz = h.e.b.x - h.e.a.x; l = Math.Sqrt(ox * ox + oz * oz); }
                        c.x += (ox / l) * 0.9 * dt; c.z += (oz / l) * 0.9 * dt;
                        double want = Math.Atan2(ox, oz);
                        c.h += Math.Atan2(Math.Sin(want - c.h), Math.Cos(want - c.h)) * Math.Min(1, dt * 3);
                        PlaceCow(c, layout.GroundHeight(c.x, c.z, null));
                    }
                }
                else if (c.moving)
                {
                    double nx = c.x + Math.Sin(c.h) * 0.4 * dt, nz = c.z + Math.Cos(c.h) * 0.4 * dt;
                    // They amble along the edge of the carriageway, short of the junctions, so traffic can get round them.
                    var hh = layout.EdgeAt(nx, nz); double w = hh != null ? hh.Value.e.r.width / 2 : 0;
                    if (hh != null && hh.Value.d <= w + 0.5 && hh.Value.d >= w - 1.8 && hh.Value.t > 0.12 && hh.Value.t < 0.88 && layout.UnderpassAt(nx, nz) == null) { c.x = nx; c.z = nz; }
                    else c.h += Math.PI;
                    PlaceCow(c, 0);
                }
                if (c.head != null)
                {
                    double hx = c.moving ? Math.Sin(t * 3) * 0.08 : 0.25 + Math.Sin(t * 0.7 + c.x) * 0.15;
                    c.head.localRotation = Quaternion.AngleAxis((float)(-hx * Mathf.Rad2Deg), Vector3.right);
                }
            }
        }

        // Obstacles traffic must yield to: cows, and anyone standing on the carriageway.
        public void CollectObstacles(List<Obstacle> output)
        {
            foreach (var c in cows) output.Add(c);
            foreach (var p in peds) if (p.Visible && layout.GroundHeight(p.x, p.z, null) < 0.05 && p.state != "walk") output.Add(p);
        }

        // People in melee range in front of (x, z) facing `heading`.
        public List<Ped> TargetsInFront(double x, double z, double heading, double range)
        {
            double fx = Math.Sin(heading), fz = Math.Cos(heading);
            var output = new List<Ped>();
            foreach (var p in peds)
            {
                if (p.state == "down" || !p.Visible) continue;
                double dx = p.x - x, dz = p.z - z, d = Math.Sqrt(dx * dx + dz * dz);
                if (d < range && (dx * fx + dz * fz) / (d == 0 ? 1 : d) > 0.4) output.Add(p);
            }
            return output;
        }

        public List<Cow> CowsInFront(double x, double z, double heading, double range)
        {
            double fx = Math.Sin(heading), fz = Math.Cos(heading);
            return cows.Where(c => { double dx = c.x - x, dz = c.z - z, d = Math.Sqrt(dx * dx + dz * dz); return d < range + 0.8 && (dx * fx + dz * fz) / (d == 0 ? 1 : d) > 0.3; }).ToList();
        }

        // A zebu: white or brown, with a hump and sometimes painted horns and a marigold garland.
        // (The JS rounds the boxes' edges; plain boxes here.)
        Cow MakeCow()
        {
            int white = rng.Next() < 0.7 ? 0xece8e0 : 0x8a6a4a;
            var rb = Primitives.Box(1, 1, 1);
            var b = new ChunkBuilder();
            b.Put(rb, 0, 1.05, 0, white, 0, 0.75, 0.75, 1.7);
            b.Put(rb, 0, 1.5, 0.45, white, 0, 0.45, 0.35, 0.45); // zebu hump
            foreach (var (x, z) in new[] { (-0.25, 0.6), (0.25, 0.6), (-0.25, -0.6), (0.25, -0.6) }) b.Put(rb, x, 0.4, z, white, 0, 0.14, 0.85, 0.14);
            b.Put(rb, 0, 0.8, -0.86, white, 0, 0.06, 0.6, 0.06, 0.3);
            var hb = new ChunkBuilder();
            hb.Put(rb, 0, 0, 0.3, white, 0, 0.32, 0.36, 0.6);
            hb.Put(rb, 0, -0.05, 0.62, 0x6a5a50, 0, 0.26, 0.24, 0.12);
            foreach (var s in new[] { -1.0, 1.0 })
            {
                hb.Put(Primitives.Cone(0.04, 0.32, 6), s * 0.14, 0.26, 0.15, 0xd8c8a8, 0, 1, 1, 1, 0, -s * 0.5);
                hb.Put(rb, s * 0.22, 0.06, 0.12, white, 0, 0.18, 0.06, 0.1);
            }
            // Painted horns and a marigold garland: a well-loved temple cow.
            if (rng.Next() < 0.4) for (int k = 0; k < 9; k++) { double a = k / 8.0 * Math.PI; hb.Put(rb, Math.Cos(a) * 0.2, -0.2 - Math.Sin(a) * 0.12, 0.05, 0xf0a020, 0, 0.07, 0.07, 0.07); }
            var c = new Cow { isCow = true, r = 0.8 };
            c.go = new GameObject("cow");
            c.go.transform.SetParent(root, false);
            Attach(c, b, c.go.transform, "body");
            var head = new GameObject("head").transform;
            head.SetParent(c.go.transform, false);
            head.localPosition = Game.ToUnity(0, 1.25, 0.85);
            Attach(c, hb, head, "head");
            c.head = head;
            return c;
        }

        static void Attach(Cow c, ChunkBuilder b, Transform parent, string name)
        {
            foreach (var mesh in b.Meshes(name))
            {
                var go = new GameObject(name);
                go.transform.SetParent(parent, false);
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                go.AddComponent<MeshRenderer>().sharedMaterial = cowMat;
                c.meshes.Add(mesh);
            }
        }
    }
}
