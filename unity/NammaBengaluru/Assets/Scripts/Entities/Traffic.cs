// AI traffic (port of src/entities/traffic.js): a dense population streamed around the player
// that follows the road graph, keeps LEFT, obeys (mostly) the signals and honks a lot. Cars and
// buses keep to their lanes; autos and two-wheelers weave across the carriageway, squeeze through
// gaps and now and then ride on the wrong side. They crash too: a vehicle waits before crossing
// the path of someone already in a junction, but when two meet hard enough they dent each other
// and the lighter one is knocked loose into the physics.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.Systems;
using NammaBengaluru.World;

namespace NammaBengaluru.Entities
{
    public class TPath
    {
        public readonly List<(double x, double z)> points;
        public readonly double[] cum;
        public readonly double length;
        public TPath(List<(double x, double z)> pts)
        {
            points = pts; cum = new double[pts.Count];
            for (int k = 1; k < pts.Count; k++) cum[k] = cum[k - 1] + Math.Sqrt((pts[k].x - pts[k - 1].x) * (pts[k].x - pts[k - 1].x) + (pts[k].z - pts[k - 1].z) * (pts[k].z - pts[k - 1].z));
            length = cum[cum.Length - 1];
        }
        public (double x, double z, double h) Sample(double s)
        {
            s = Math.Max(0, Math.Min(s, length));
            int k = 1;
            while (k < cum.Length - 1 && cum[k] < s) k++;
            var a = points[k - 1]; var b = points[k];
            double seg = cum[k] - cum[k - 1]; if (seg == 0) seg = 1;
            double t = (s - cum[k - 1]) / seg;
            return (a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, Math.Atan2(b.x - a.x, b.z - a.z));
        }
    }

    // Something traffic must not drive into: the player, people, parked vehicles' body circles.
    public class Obstacle { public double x, z, r, y; public bool isPlayer, isCop, isCow, parked, shoo; public object owner; }

    public class Plan { public DirEdge e2; public int lane2; public TPath turn, next, path; public List<DirEdge> route; }

    public class Agent
    {
        public int id;
        public Vehicle v;
        public DirEdge edge, fromEdge;
        public int lane;
        public TPath path, nextPath;
        public double s, speed, cruise, stuck, ghost, honkCd, lat, latTarget, latVel, stunned, impatience, weaveT, surge = 1, surgeT, junctionWait, bypassT, backed, lastSpeed = double.NaN;
        public bool turning, jumper, erratic, wrongProne, wrong, wrongNow, stopped, hold, keep, rush, forced, hardGhost, waitingSignal;
        public List<DirEdge> route;
        public (DirEdge edge, double s)? stop;
        public Plan plan;
        public NetNode occNode, appNode;
        public object lastBlocker;
    }

    public interface ITrafficWorld
    {
        (double x, double z) Focus { get; }
        List<Obstacle> Obstacles { get; }
        double Hour { get; }
        double Rain { get; }
        double TrafficScale { get; }
        bool InitialFill { get; }
        double WaterDepth(double x, double z, double y);
        IVehicleWorld VehicleWorld { get; }
        void Release(Vehicle v); // knocked loose: it joins the free vehicles
        void ThrowRider(Vehicle v, double fromX, double fromZ, double kx, double kz); // a two-wheeler's rider goes flying
        Vehicle NewVehicle(string type, Func<double> rng);    // a pooled vehicle needs building
        void Show(Vehicle v, bool on);
        void Sync(Vehicle v, double dt);
        void Horn(Vehicle v);
    }

    public class Traffic
    {
        static readonly Mulberry32 rng = new Mulberry32(4242);
        static double R() => rng.Next();
        static readonly (string, double)[] BASE_MIX = {
            ("scooter", 0.2), ("delivery", 0.07), ("bike", 0.06), ("sportBike", 0.03), ("auto", 0.16), ("goodsAuto", 0.03), ("hatch", 0.1), ("sedan", 0.06), ("taxi", 0.07),
            ("suv", 0.05), ("tempo", 0.025), ("miniTruck", 0.03), ("bus", 0.055), ("schoolBus", 0.015), ("lorry", 0.015), ("tanker", 0.012), ("hoysala", 0.008),
            ("van", 0.025), ("ksrtc", 0.012), ("garbage", 0.006), ("ambulance", 0.004),
            ("luxury", 0.012), ("cityBus", 0.02), ("evCar", 0.012), ("evMini", 0.01), ("policeVan", 0.004), ("fireTruck", 0.003) };
        public static readonly HashSet<string> HEAVY = new HashSet<string> { "bus", "schoolBus", "lorry", "tanker", "tempo", "goodsAuto", "miniTruck", "ksrtc", "garbage", "cityBus", "fireTruck" };
        static readonly HashSet<string> AUTOS = new HashSet<string> { "auto", "goodsAuto" };
        const double CELL = 24, LANE_W = RoadNet.LANE_W;

        static string PickType(double hour, bool industrial)
        {
            var mix = BASE_MIX.ToDictionary(p => p.Item1, p => p.Item2);
            bool night = hour < 6 || hour >= 22;
            // Lorries are banned from the city by day, so they come out at night (and live in Peenya).
            if (night) { mix["lorry"] *= 4; mix["tanker"] *= 2; mix["schoolBus"] = 0; mix["delivery"] *= 1.5; }
            if (hour < 7 || hour > 18) mix["schoolBus"] = 0;
            if (industrial) { mix["lorry"] *= 4; mix["goodsAuto"] *= 3; mix["miniTruck"] *= 3; mix["tempo"] *= 2; }
            double total = 0;
            foreach (var (k, _) in BASE_MIX) total += mix[k];
            double r = R() * total;
            foreach (var (k, _) in BASE_MIX) if ((r -= mix[k]) <= 0) return k;
            return "hatch";
        }

        readonly Layout layout;
        readonly Signals signals;
        public readonly List<Agent> agents = new List<Agent>();
        readonly Dictionary<string, List<Vehicle>> pool = new Dictionary<string, List<Vehicle>>();
        public int target = 170;
        public double radius = 380, edgeTimer;
        readonly Dictionary<long, List<Agent>> grid = new Dictionary<long, List<Agent>>();
        List<DirEdge> nearEdges = new List<DirEdge>();
        int nextId, builtThisFrame;
        double buildCd;
        readonly Dictionary<NetNode, List<Agent>> occ = new Dictionary<NetNode, List<Agent>>();
        readonly Dictionary<NetNode, HashSet<Agent>> app = new Dictionary<NetNode, HashSet<Agent>>();
        ITrafficWorld world;

        public Traffic(Layout layout, Signals signals) { this.layout = layout; this.signals = signals; }

        static double Hypot(double a, double b) => Math.Sqrt(a * a + b * b);

        // Edges with at least one end within range of the player.
        void RefreshNearEdges((double x, double z) f)
        {
            double r = radius + 60;
            nearEdges = layout.edges.Where(e => Math.Min(Hypot(e.from.x - f.x, e.from.z - f.z), Hypot(e.to.x - f.x, e.to.z - f.z)) < r).ToList();
        }

        // Build a stock of vehicles up front so the first seconds of play don't stutter.
        public void Prewarm(int n, double hour, ITrafficWorld w)
        {
            for (int k = 0; k < n; k++)
            {
                string type = PickType(hour, false);
                if (!pool.TryGetValue(type, out var list)) pool[type] = list = new List<Vehicle>();
                var v = w.NewVehicle(type, R);
                w.Show(v, false);
                list.Add(v);
            }
        }

        Vehicle Acquire(string type, bool build)
        {
            if (pool.TryGetValue(type, out var list) && list.Count > 0) { var v = list[list.Count - 1]; list.RemoveAt(list.Count - 1); return v; }
            if (!build || builtThisFrame >= 1 || buildCd > 0) return null;
            builtThisFrame++;
            buildCd = 0.5;
            return world.NewVehicle(type, R);
        }

        Agent Spawn(bool initial)
        {
            var focus = world.Focus;
            if (nearEdges.Count == 0) return null;
            bool shortOf = agents.Count < target * world.TrafficScale * 0.8;
            for (int tries = 0; tries < 13; tries++)
            {
                bool build = tries == 12 && (initial || shortOf || buildCd < -2);
                if (tries == 12 && !build) break;
                var e = nearEdges[(int)Math.Floor(R() * nearEdges.Count)];
                var blk = layout.BlockAt(e.from.x, e.from.z);
                string type = PickType(world.Hour, blk.zone == "industrial");
                int lane = ChooseLane(e, type);
                var path = EdgePath(e, lane);
                double s = R() * Math.Max(0, path.length - 8);
                var p = path.Sample(s);
                double d = Hypot(p.x - focus.x, p.z - focus.z);
                if (d > radius || d < (initial ? 25 : 140)) continue;
                if (Occupied(p.x, p.z, 9)) continue;
                var v = Acquire(type, build);
                if (v == null) continue;
                return AddAgent(v, e, lane, path, s, p);
            }
            return null;
        }

        Agent AddAgent(Vehicle v, DirEdge e, int lane, TPath path, double s, (double x, double z, double h) p)
        {
            string type = v.type;
            v.x = p.x; v.z = p.z; v.heading = p.h; v.y = 0; v.vx = v.vz = 0;
            v.driver = "ai"; v.stalled = false;
            world.Show(v, true);
            bool two = v.spec.twoWheeler, erratic = two || AUTOS.Contains(type);
            var a = new Agent
            {
                id = ++nextId, v = v, edge = e, lane = lane, path = path, s = s,
                cruise = v.spec.maxSpeed * (two ? 0.55 : HEAVY.Contains(type) ? 0.5 : 0.45) * (0.8 + R() * 0.4),
                honkCd = R() * 3,
                jumper = R() < (two ? 0.3 : type == "auto" ? 0.25 : HEAVY.Contains(type) ? 0.05 : 0.1),
                impatience = R(),
                erratic = erratic, weaveT = R() * 2, surgeT = R() * 4,
            };
            a.wrongProne = erratic && R() < (two ? 0.3 : 0.18);
            if (erratic) { var (lo, hi) = Band(a); a.lat = a.latTarget = lo + R() * (hi - lo); }
            agents.Add(a);
            AddToGrid(a);
            return a;
        }

        // A vehicle of this type on a given road, s metres along its lane (hired autos, route buses).
        public Agent SpawnOn(string type, DirEdge e, double s)
        {
            int lane = ChooseLane(e, type);
            var path = EdgePath(e, lane);
            s = Math.Max(0, Math.Min(path.length - 1, s));
            Vehicle v = pool.TryGetValue(type, out var list) && list.Count > 0 ? list[list.Count - 1] : world.NewVehicle(type, R);
            if (list != null && list.Count > 0 && list[list.Count - 1] == v) list.RemoveAt(list.Count - 1);
            return AddAgent(v, e, lane, path, s, path.Sample(s));
        }

        // Where to sit across the carriageway to pull in at the kerb.
        public double KerbLat(Agent a) { var (_, hi) = Band(a); return hi - Math.Max(0, a.v.spec.width / 2 - 0.55); }

        int ChooseLane(DirEdge e, string type, bool fromTurn = false)
        {
            int n = e.road.lanes;
            if (n == 1) return 0;
            // Buses and lorries hug the kerb (outer lane); others pick freely.
            int lane = HEAVY.Contains(type) ? n - 1 : (int)Math.Floor(R() * n);
            // Vehicles turning onto a flyover approach stay off the flyover lane.
            if (e.flyover != null && fromTurn && lane == 0) lane = 1;
            return lane;
        }

        // Lateral range (relative to the agent's lane centre) of its own side of the carriageway.
        (double lo, double hi) Band(Agent a)
        {
            var r = a.edge.road; double half = r.median / 2, off = layout.LaneOffset(r, a.lane);
            double lo = half + 0.7, hi = half + r.lanes * LANE_W - 0.75;
            // Flyover approaches: the inner lane climbs the deck, so stay on whichever side you're on.
            if (a.edge.flyover != null) { if (a.lane == 0) hi = half + LANE_W - 0.6; else lo = half + LANE_W + 0.6; }
            return (lo - off, Math.Max(lo, hi) - off);
        }

        // The oncoming side of an undivided road, for riding against the traffic.
        (double lo, double hi) WrongBand(Agent a)
        {
            var r = a.edge.road; double off = layout.LaneOffset(r, a.lane);
            return (-(r.lanes * LANE_W - 0.7) - off, -0.8 - off);
        }

        void MaybeGoWrong(Agent a)
        {
            a.wrong = false;
            var r = a.edge.road;
            if (!a.wrongProne || r.median != 0 || a.edge.flyover != null || a.path.length < 90 || R() > 0.4) return;
            a.wrong = true;
            var (lo, hi) = WrongBand(a);
            // Most hug the far kerb; a few ride the centre line.
            a.latTarget = R() < 0.7 ? lo + R() * 0.8 : hi - R() * 0.8;
            a.weaveT = 3 + R() * 3;
        }

        public TPath EdgePath(DirEdge e, int lane)
        {
            double off = layout.LaneOffset(e.road, lane), lx = e.dirZ, lz = -e.dirX;
            double a = Math.Min(e.cutFrom + 1.5, e.len * 0.45), b = Math.Min(e.cutTo + 1.5, e.len * 0.45);
            return new TPath(new List<(double, double)> {
                (e.from.x + e.dirX * a + lx * off, e.from.z + e.dirZ * a + lz * off),
                (e.to.x - e.dirX * b + lx * off, e.to.z - e.dirZ * b + lz * off) });
        }

        (TPath turn, TPath next) TurnPath(TPath from, double d1x, double d1z, DirEdge e2, int lane2)
        {
            var start = from.points[from.points.Count - 1];
            var next = EdgePath(e2, lane2);
            var end = next.points[0];
            // Control point where the two lanes' lines meet (or halfway, for a near-straight run).
            double cx = (start.x + end.x) / 2, cz = (start.z + end.z) / 2;
            double det = d1x * -e2.dirZ - d1z * -e2.dirX;
            if (Math.Abs(det) > 0.25)
            {
                double rx = end.x - start.x, rz = end.z - start.z;
                double t = (rx * -e2.dirZ - rz * -e2.dirX) / det, gap = Hypot(rx, rz);
                if (t > 0 && t < gap * 1.5) { cx = start.x + d1x * t; cz = start.z + d1z * t; }
            }
            var pts = new List<(double, double)>();
            for (int k = 0; k <= 8; k++)
            {
                double t = k / 8.0, u = 1 - t;
                pts.Add((u * u * start.x + 2 * u * t * cx + t * t * end.x, u * u * start.z + 2 * u * t * cz + t * t * end.z));
            }
            return (new TPath(pts), next);
        }

        DirEdge ChooseNext(Agent a)
        {
            if (a.route != null)
            {
                var next = a.route.Count > 0 ? a.route[0] : null;
                if (next != null && next.from == a.edge.to) { a.route.RemoveAt(0); return next; }
                if (next != null) a.route = null; // knocked off the route: wander from here
            }
            var node = a.edge.to;
            var opts = node.outEdges.Where(e => e.to != a.edge.from).ToList();
            if (opts.Count == 0) opts = node.outEdges;
            DirEdge straight = null; double bd = 0.85;
            foreach (var e in opts) { double d = e.dirX * a.edge.dirX + e.dirZ * a.edge.dirZ; if (d > bd) { bd = d; straight = e; } }
            // On the flyover lane you can only go straight over the junction.
            if (a.edge.flyover != null && a.lane == 0 && straight != null && straight.flyover != null) return straight;
            if (straight != null && R() < 0.45) return straight;
            return opts[(int)Math.Floor(R() * opts.Count)];
        }

        Plan PlanTurn(Agent a)
        {
            var route = a.route; // (a new route set after this means re-plan)
            var e2 = ChooseNext(a);
            bool straight = e2.dirX * a.edge.dirX + e2.dirZ * a.edge.dirZ > 0.85;
            int lane2 = straight && e2.road.lanes == a.edge.road.lanes ? a.lane : ChooseLane(e2, a.v.type, !straight);
            var (turn, next) = TurnPath(a.path, a.edge.dirX, a.edge.dirZ, e2, lane2);
            return new Plan { e2 = e2, lane2 = lane2, turn = turn, next = next, route = route, path = a.path };
        }

        public void LeaveJunction(Agent a)
        {
            if (a.appNode != null && app.TryGetValue(a.appNode, out var ap)) ap.Remove(a);
            a.appNode = null;
            if (a.occNode != null && occ.TryGetValue(a.occNode, out var oc)) oc.Remove(a);
            a.occNode = null;
        }

        static double SegSegDist((double x, double z) p, (double x, double z) q, (double x, double z) r, (double x, double z) t)
        {
            double D(double ax, double az, double bx, double bz, double x, double z)
            {
                double abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz; if (l2 == 0) l2 = 1;
                double k = Math.Max(0, Math.Min(1, ((x - ax) * abx + (z - az) * abz) / l2));
                return Hypot(ax + abx * k - x, az + abz * k - z);
            }
            int O(double ax, double az, double bx, double bz, double cx, double cz) => Math.Sign((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
            if (O(p.x, p.z, q.x, q.z, r.x, r.z) * O(p.x, p.z, q.x, q.z, t.x, t.z) < 0 && O(r.x, r.z, t.x, t.z, p.x, p.z) * O(r.x, r.z, t.x, t.z, q.x, q.z) < 0) return 0;
            return Math.Min(Math.Min(D(p.x, p.z, q.x, q.z, r.x, r.z), D(p.x, p.z, q.x, q.z, t.x, t.z)), Math.Min(D(r.x, r.z, t.x, t.z, p.x, p.z), D(r.x, r.z, t.x, t.z, q.x, q.z)));
        }

        // Can `a` start its planned turn, or would it cut across someone already in the junction?
        bool JunctionClear(Agent a)
        {
            if (!occ.TryGetValue(a.edge.to, out var oc) || oc.Count == 0) return true;
            var mine = a.plan.turn.points; double w = a.v.spec.width / 2;
            for (int n = oc.Count - 1; n >= 0; n--)
            {
                var o = oc[n];
                if (!o.turning || o.occNode != a.edge.to || o.v.driver != "ai") { oc.RemoveAt(n); continue; }
                if (o == a || o.fromEdge == a.edge) continue; // following them through: GapAhead's job
                if (o.s > o.path.length - o.v.spec.length * 0.5) continue; // all but out
                var pts = o.path.points; double reach = w + o.v.spec.width / 2 + (a.erratic && o.erratic ? 0.2 : 0.7);
                for (int i = Math.Max(0, (int)Math.Floor(o.s / o.path.length * (pts.Count - 1)) - 1); i < pts.Count - 1; i++)
                    for (int k = 0; k < mine.Count - 1; k++) if (SegSegDist(pts[i], pts[i + 1], mine[k], mine[k + 1]) < reach) return false;
            }
            return true;
        }

        // Someone on another approach who'll reach the junction first, on a crossing line, has the right of way.
        bool ApproachClear(Agent a)
        {
            if (!app.TryGetValue(a.edge.to, out var ap) || ap.Count < 2) return true;
            double myT = (a.path.length - a.s) / Math.Max(0.5, a.speed); var mine = a.plan.turn.points; double w = a.v.spec.width / 2;
            foreach (var o in ap)
            {
                if (o == a || o.edge == a.edge || o.turning || o.plan == null || o.v.driver != "ai" || o.edge.to != a.edge.to) continue;
                double left = o.path.length - o.s;
                if (left > 12 || o.junctionWait > 0) continue;
                double t = left / Math.Max(0.5, o.speed);
                if (t > myT || (t == myT && o.id > a.id)) continue;
                var pts = o.plan.turn.points; double reach = w + o.v.spec.width / 2 + 0.5;
                for (int i = 0; i < pts.Count - 1; i++) for (int k = 0; k < mine.Count - 1; k++) if (SegSegDist(pts[i], pts[i + 1], mine[k], mine[k + 1]) < reach) return false;
            }
            return true;
        }

        // Is there room on the road out of the junction for this vehicle?
        bool ExitClear(Agent a)
        {
            var next = a.plan.next; double need = a.v.spec.length + 1.5;
            var p = next.Sample(Math.Min(next.length, need * 0.6)); double r = need * 0.6;
            for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++)
                if (grid.TryGetValue(Key(p.x + i * CELL, p.z + j * CELL), out var l))
                    foreach (var b in l) if (b != a && b.speed < 2 && Math.Abs(b.v.x - p.x) < r && Math.Abs(b.v.z - p.z) < r && b.edge == a.plan.e2) return false;
            return true;
        }

        void Advance(Agent a)
        {
            if (a.turning)
            {
                LeaveJunction(a);
                a.turning = false;
                a.path = a.nextPath;
                a.s = 0;
                if (a.erratic) { a.weaveT = 0; MaybeGoWrong(a); }
                return;
            }
            a.forced = a.junctionWait >= 10 && a.plan != null && !JunctionClear(a); // gave up waiting: noses in at a crawl
            a.junctionWait = 0;
            LeaveJunction(a);
            var plan = a.plan != null && a.plan.route == a.route && a.plan.path == a.path ? a.plan : PlanTurn(a);
            a.plan = null;
            a.fromEdge = a.edge;
            var node = a.edge.to;
            if (!occ.TryGetValue(node, out var oc)) occ[node] = oc = new List<Agent>();
            oc.Add(a);
            a.occNode = node;
            a.edge = plan.e2; a.lane = plan.lane2; a.path = plan.turn; a.nextPath = plan.next;
            a.turning = true; a.s = 0;
            // Through the junction, stay roughly on the turning line.
            a.wrong = false;
            a.latTarget = Math.Max(-1.2, Math.Min(1.2, a.latTarget));
        }

        public Vehicle Release(Agent a)
        {
            agents.Remove(a);
            LeaveJunction(a);
            a.plan = null;
            a.v.driver = null;
            double fx = Math.Sin(a.v.heading), fz = Math.Cos(a.v.heading);
            a.v.vx = fx * a.speed; a.v.vz = fz * a.speed;
            return a.v;
        }

        public void Despawn(Agent a)
        {
            agents.Remove(a);
            LeaveJunction(a);
            a.plan = null;
            world.Show(a.v, false);
            a.v.siren = false;
            a.v.Repair(); // back to the pool showroom-fresh
            if (!pool.TryGetValue(a.v.type, out var list)) pool[a.v.type] = list = new List<Vehicle>();
            if (list.Count < 30) list.Add(a.v);
        }

        public Agent FindAgent(Vehicle v) => agents.FirstOrDefault(a => a.v == v);

        // ---------- spatial hash ----------
        static long Key(double x, double z) => ((long)Math.Floor(x / CELL) << 32) ^ ((long)Math.Floor(z / CELL) & 0xffffffffL);
        void AddToGrid(Agent a) { long k = Key(a.v.x, a.v.z); if (!grid.TryGetValue(k, out var l)) grid[k] = l = new List<Agent>(); l.Add(a); }
        void RebuildGrid() { foreach (var l in grid.Values) l.Clear(); foreach (var a in agents) AddToGrid(a); }
        bool Occupied(double x, double z, double r)
        {
            for (int dx = -1; dx <= 1; dx++) for (int dz = -1; dz <= 1; dz++)
                if (grid.TryGetValue(Key(x + dx * CELL, z + dz * CELL), out var l))
                    foreach (var b in l) if (Math.Abs(b.v.x - x) < r && Math.Abs(b.v.z - z) < r) return true;
            return false;
        }

        // Is a vehicle level with `a` on side `dir` (+1: towards +lat), close enough that moving
        // that way would run into it?
        bool Alongside(Agent a, double dir)
        {
            var v = a.v; double fx = Math.Sin(v.heading), fz = Math.Cos(v.heading), myHalf = v.spec.width / 2, halfLen = v.spec.length / 2;
            for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++)
            {
                if (!grid.TryGetValue(Key(v.x + i * CELL, v.z + j * CELL), out var l)) continue;
                foreach (var b in l)
                {
                    if (b == a) continue;
                    var bv = b.v;
                    if (Math.Abs(bv.y - v.y) > 2.5) continue;
                    double dx = bv.x - v.x, dz = bv.z - v.z, side = (dx * fz - dz * fx) * dir;
                    if (side <= 0 || side > myHalf + bv.spec.width / 2 + 0.35) continue;
                    if (Math.Abs(dx * fx + dz * fz) < halfLen + bv.spec.length / 2 + 0.2) return true;
                }
            }
            return false;
        }

        // Distance to the nearest thing ahead within `look`, for a vehicle at lateral offset `lat`.
        // ghost 1: breaking a deadlock (crossing and oncoming traffic ignored); ghost 2: ignore all traffic.
        (double gap, object blocker) GapAhead(Agent a, double lat, double look, List<Obstacle> obstacles, int ghost = 0)
        {
            var v = a.v;
            double fx = Math.Sin(v.heading), fz = Math.Cos(v.heading), lx = fz, lz = -fx;
            double ox = v.x + lx * (lat - a.lat), oz = v.z + lz * (lat - a.lat);
            double myHalf = v.spec.width / 2, margin = a.erratic ? 0.12 : 0.3, halfLen = v.spec.length / 2;
            double gap = double.PositiveInfinity; object blocker = null;
            int span = (int)Math.Ceiling((look + 8) / CELL);
            for (int i = -span; i <= span; i++) for (int j = -span; j <= span; j++)
            {
                if (!grid.TryGetValue(Key(v.x + i * CELL, v.z + j * CELL), out var l)) continue;
                foreach (var b in l)
                {
                    if (b == a) continue;
                    var bv = b.v;
                    if (Math.Abs(bv.y - v.y) > 2.5) continue;
                    double dot = Math.Sin(bv.heading) * fx + Math.Cos(bv.heading) * fz;
                    if (ghost == 2 || (ghost != 0 && dot < 0.7)) continue;
                    // Oncoming traffic only matters when someone is on the wrong side, or inside a junction.
                    bool oncoming = dot < -0.7;
                    if (oncoming && !a.wrongNow && !b.wrongNow && !a.turning && !b.turning) continue;
                    double closing = oncoming ? b.speed : 0;
                    double dx = bv.x - ox, dz = bv.z - oz, ahead = dx * fx + dz * fz, ad = Math.Abs(dot);
                    double hl = bv.spec.length / 2, hw = bv.spec.width / 2;
                    double side = Math.Abs(dx * lx + dz * lz), reach = myHalf + hw * ad + hl * (1 - ad);
                    if (ahead <= 0)
                    {
                        // Level and overlapping, where neither sees the other ahead: the newer vehicle gives way.
                        if (ghost == 0 && dot > 0.3 && b.id < a.id && side < reach - 0.1 && ahead > -(halfLen + hl) * 0.8 && gap > 0
                            && (v.x - bv.x) * Math.Sin(bv.heading) + (v.z - bv.z) * Math.Cos(bv.heading) <= 0) { gap = 0; blocker = b; }
                        continue;
                    }
                    if (ahead > look + closing * 2) continue;
                    if (side > reach + margin) continue;
                    // Someone coming head-on closes the gap twice as fast: plan for where they'll be.
                    double g = ahead - halfLen - (hl * ad + hw * (1 - ad)) - closing * 1.5;
                    if (g < gap) { gap = g; blocker = b; }
                }
            }
            foreach (var o in obstacles)
            {
                if (ghost != 0 && !o.isPlayer) continue;
                if (Math.Abs(o.y - v.y) > 2.5) continue;
                double dx = o.x - ox, dz = o.z - oz, ahead = dx * fx + dz * fz;
                if (ahead <= 0 || ahead > look) continue;
                if (Math.Abs(dx * lx + dz * lz) > myHalf + o.r + margin) continue;
                double g = ahead - halfLen - o.r;
                if (g < gap) { gap = g; blocker = o; }
            }
            return (gap, blocker);
        }

        // Put an agent's vehicle back where its path says it is.
        void Place(Agent a) { var p = a.path.Sample(a.s); a.v.x = p.x + Math.Cos(p.h) * a.lat; a.v.z = p.z - Math.Sin(p.h) * a.lat; }

        readonly List<Circle> ca = new List<Circle>(), cb = new List<Circle>();

        // Traffic vehicles that overlap after moving. Meeting hard is a crash; a gentle touch just
        // stops whoever drove into the other, so nothing passes through anything in sight.
        void ResolveContacts()
        {
            RebuildGrid();
            var focus = world.Focus;
            foreach (var a in agents.ToList())
            {
                if (a.v.driver != "ai") continue;
                var A = a.v;
                for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++)
                {
                    if (!grid.TryGetValue(Key(A.x + i * CELL, A.z + j * CELL), out var cell)) continue;
                    foreach (var b in cell.ToList())
                    {
                        if (b.id <= a.id || b.v.driver != "ai" || a.v.driver != "ai") continue;
                        if (a.ghost > 0 || b.ghost > 0) continue;
                        var Bv = b.v; double reach = (A.spec.length + Bv.spec.length) / 2 + 0.5;
                        if (Math.Abs(A.x - Bv.x) > reach || Math.Abs(A.z - Bv.z) > reach || Math.Abs(A.y - Bv.y) > 2) continue;
                        A.Circles(ca); Bv.Circles(cb);
                        double pen = 0, nx = 0, nz = 0, cx = 0, cz = 0;
                        foreach (var p in ca) foreach (var q in cb)
                        {
                            double dx = p.x - q.x, dz = p.z - q.z, d = Hypot(dx, dz), m = (p.r + q.r) * 0.92;
                            if (d < m && m - d > pen && d > 1e-4) { pen = m - d; nx = dx / d; nz = dz / d; cx = q.x + nx * q.r; cz = q.z + nz * q.r; }
                        }
                        if (pen <= 0) continue;
                        double vax = Math.Sin(A.heading) * a.speed, vaz = Math.Cos(A.heading) * a.speed;
                        double vbx = Math.Sin(Bv.heading) * b.speed, vbz = Math.Cos(Bv.heading) * b.speed;
                        double closing = -((vax - vbx) * nx + (vaz - vbz) * nz);
                        if (closing > 5 && Hypot(cx - focus.x, cz - focus.z) < 160) Crash(a, b, nx, nz, closing, cx, cz);
                        else
                        {
                            double fa = (Bv.x - A.x) * Math.Sin(A.heading) + (Bv.z - A.z) * Math.Cos(A.heading);
                            double fb = (A.x - Bv.x) * Math.Sin(Bv.heading) + (A.z - Bv.z) * Math.Cos(Bv.heading);
                            double intoA = -(vax * nx + vaz * nz), intoB = vbx * nx + vbz * nz;
                            var x = fa > 0.5 && fb <= 0.5 ? a : fb > 0.5 && fa <= 0.5 ? b : intoA > intoB + 0.05 ? a : intoB > intoA + 0.05 ? b : a.id > b.id ? a : b;
                            PushBack(x, x == a ? nx : -nx, x == a ? nz : -nz, pen);
                        }
                    }
                }
            }
        }

        // Move an agent `pen` metres out of an overlap within its own path: sideways where it can,
        // back along its path for the rest. It stops there.
        void PushBack(Agent a, double nx, double nz, double pen)
        {
            double h = a.path.Sample(a.s).h, f = nx * Math.Sin(h) + nz * Math.Cos(h), l = nx * Math.Cos(h) - nz * Math.Sin(h);
            double lo, hi;
            if (a.turning) { lo = -1.5; hi = 1.5; } else { lo = Math.Min(Band(a).lo, WrongBand(a).lo); hi = Band(a).hi; }
            double lat = Math.Max(Math.Min(lo, a.lat), Math.Min(Math.Max(hi, a.lat), a.lat + l * pen));
            double back = Math.Max(0, -f) * pen + Math.Max(0, Math.Abs(l) * pen - Math.Abs(lat - a.lat));
            a.lat = a.latTarget = lat; a.latVel = 0;
            a.s = Math.Max(0, a.s - back);
            a.speed = 0;
            Place(a);
        }

        void Crash(Agent a, Agent b, double nx, double nz, double closing, double cx, double cz)
        {
            var A = a.v; var Bv = b.v; double ia = 1 / A.mass, ib = 1 / Bv.mass;
            double j = 1.25 * closing / (ia + ib);
            double Share(double m1, double m2) => Math.Min(1.6, 2 * m2 / (m1 + m2));
            A.TakeDamage(Vehicle.DamageFromSpeed(closing * Share(A.mass, Bv.mass) * 0.75), cx, cz);
            Bv.TakeDamage(Vehicle.DamageFromSpeed(closing * Share(Bv.mass, A.mass) * 0.75), cx, cz);
            double near = Math.Max(0, 1 - Hypot(cx - world.Focus.x, cz - world.Focus.z) / 140);
            if (near > 0) Systems.GameAudio.I?.Crunch(Math.Min(1, closing / 18) * near);
            foreach (var (x, sgn, dv) in new[] { (a, 1.0, j * ia), (b, -1.0, j * ib) })
            {
                var v = x.v;
                if (v.driver != "ai") continue;
                bool knocked = v.engineDead || dv > 2.5 || (v.spec.twoWheeler && dv > 1.2);
                // Never throw out a hired auto or a bus with the player aboard: it just stops dead.
                if (!knocked || x.keep) { x.stunned = 2 + R() * 2.5; x.speed = Math.Max(0, x.speed - dv) * 0.3; continue; }
                Release(x);
                v.ApplyImpulse(nx * j * sgn, nz * j * sgn, cx - v.x, cz - v.z);
                v.temp = true; // tidied away once the player is far off
                world.Release(v);
                if (v.spec.twoWheeler) { var o = x == a ? b : a; world.ThrowRider(v, o.v.x, o.v.z, nx * sgn * Math.Min(9, 3 + dv), nz * sgn * Math.Min(9, 3 + dv)); }
            }
            if (Hypot(cx - world.Focus.x, cz - world.Focus.z) < 140)
                foreach (var x in new[] { a, b }) if (x.v.driver == "ai" && R() < 0.7) { x.honkCd = 0.4 + R(); world.Horn(x.v); }
        }

        // A crashed vehicle that's no longer needed goes back to the pool.
        public void Recycle(Vehicle v)
        {
            world.Show(v, false);
            v.temp = false; v.siren = false; v.vx = v.vz = v.angVel = 0;
            v.Repair();
            if (!pool.TryGetValue(v.type, out var list)) pool[v.type] = list = new List<Vehicle>();
            if (list.Count < 30) list.Add(v);
        }

        public void Update(double dt, ITrafficWorld w)
        {
            world = w;
            var obstacles = w.Obstacles; var focus = w.Focus;
            builtThisFrame = 0;
            buildCd = w.InitialFill ? 0 : buildCd - dt;
            edgeTimer -= dt;
            if (edgeTimer <= 0) { RefreshNearEdges(focus); edgeTimer = 1.5; }
            RebuildGrid();
            double rainSlow = 1 - w.Rain * 0.25;

            for (int ai = agents.Count - 1; ai >= 0; ai--)
            {
                if (ai >= agents.Count) continue;
                var a = agents[ai];
                var v = a.v;
                double distP = Hypot(v.x - focus.x, v.z - focus.z);
                if (distP > radius + 70 && !a.keep) { Despawn(a); continue; }
                bool two = v.spec.twoWheeler;
                double look = 6 + a.speed * 1.6 + a.speed * a.speed / (2 * v.spec.brake * 0.6) + v.spec.length / 2;
                double fx0Pre = Math.Sin(v.heading), fz0Pre = Math.Cos(v.heading);
                var (gap, blocker) = GapAhead(a, a.lat, look, obstacles, a.ghost > 0 ? (a.hardGhost ? 2 : 1) : 0);
                double surge = 1;
                if (a.erratic)
                {
                    var (lo, hi) = a.turning ? (-1.2, 1.2) : Band(a);
                    double left0 = a.path.length - a.s;
                    // A wrong-side run ends well before the junction: cut back across to your own side.
                    if (a.wrong && !a.turning && left0 < 40) { a.wrong = false; a.weaveT = 0; }
                    a.weaveT -= dt;
                    if (a.weaveT <= 0 && !a.turning)
                    {
                        if (a.wrong) { var (wl, wh) = WrongBand(a); a.latTarget = Math.Max(wl, Math.Min(wh, a.latTarget + (R() - 0.5) * 1.5)); a.weaveT = 1.5 + R() * 2; }
                        else { a.latTarget = Math.Max(lo, Math.Min(hi, a.lat + (R() - 0.5) * (two ? 5 : 3.5))); a.weaveT = (two ? 0.8 : 1.5) + R() * (two ? 2.5 : 3.5); }
                    }
                    // Squeeze through any gap: sample across the whole road (both sides when riding wrong).
                    if (gap < 7 + a.speed * 1.2)
                    {
                        double best = a.latTarget, bestGap = gap;
                        double from = a.wrong ? WrongBand(a).lo : lo; int steps = a.wrong ? 9 : 6;
                        for (int k = 0; k <= steps; k++)
                        {
                            double cand = from + (hi - from) * k / steps;
                            var r2 = GapAhead(a, cand, look, obstacles);
                            double score = r2.gap - Math.Abs(cand - a.lat) * 0.4;
                            if (score > bestGap + 1.2) { bestGap = score; best = cand; }
                        }
                        a.latTarget = best;
                    }
                    // Bursts of speed and sudden slow-downs.
                    a.surgeT -= dt;
                    if (a.surgeT <= 0) { a.surge = 0.75 + R() * 0.55; a.surgeT = 2 + R() * 4; }
                    surge = a.surge;
                }

                double tgt = a.rush ? (a.turning ? Math.Min(a.cruise, 10) : a.cruise * Math.Max(1, surge)) * rainSlow
                    : (a.turning ? Math.Min(a.cruise, 6.5) : a.cruise * surge) * rainSlow;
                if (a.turning && a.forced) tgt = Math.Min(tgt, 2.5);
                a.waitingSignal = false;
                // Signals.
                if (!a.turning && a.edge.to.signal && !(a.edge.flyover != null && a.lane == 0))
                {
                    var st = signals.State(a.edge.to, a.edge.und.id);
                    if (st != Signals.Light.Green)
                    {
                        double creep = two ? 2.4 : a.erratic ? 1.2 : 0;
                        double d = a.path.length + creep - a.s - (two ? 0 : 1.0);
                        bool jump = a.jumper && (st == Signals.Light.Amber || signals.RedAge(a.edge.to, a.edge.und.id) < 2.5 + a.impatience * 2);
                        bool committed = st == Signals.Light.Amber && d < a.speed * 1.1;
                        if (!jump && !committed && d < look + 10) { tgt = Math.Min(tgt, Math.Max(0, (d - 0.3) * 1.2)); a.waitingSignal = true; }
                    }
                }
                // Level crossing gates down: wait behind them.
                foreach (var lc in layout.levelCrossings)
                {
                    if (!lc.closed || a.edge.und != lc.edge) continue;
                    double d = (lc.x - v.x) * Math.Sin(v.heading) + (lc.z - v.z) * Math.Cos(v.heading);
                    if (d > 10.5 && d < look + 20) { tgt = Math.Min(tgt, Math.Max(0, (d - 11.5) * 1.2)); a.waitingSignal = true; } // already past the gate: clear the tracks
                }
                // Junctions: choose the turn before the stop line, and wait there while it would cut
                // across someone already in the junction (after a long wait, nose in anyway).
                if (!a.turning && !(a.edge.flyover != null && a.lane == 0))
                {
                    double left = a.path.length - a.s;
                    if (left < 14 + a.speed * 1.5)
                    {
                        if (a.plan == null || a.plan.route != a.route || a.plan.path != a.path) a.plan = PlanTurn(a);
                        var node = a.edge.to;
                        if (a.appNode != node)
                        {
                            if (a.appNode != null && app.TryGetValue(a.appNode, out var oldAp)) oldAp.Remove(a);
                            if (!app.TryGetValue(node, out var ap)) app[node] = ap = new HashSet<Agent>();
                            ap.Add(a); a.appNode = node;
                        }
                        occ.TryGetValue(node, out var oc);
                        oc ??= new List<Agent>();
                        bool mayForce = a.junctionWait >= 10 && oc.Count < 4 && !oc.Any(o => o.forced && o.turning && o.occNode == node);
                        if (!ExitClear(a) || (!mayForce && (!JunctionClear(a) || (left < 10 && !ApproachClear(a)))))
                        {
                            a.junctionWait += dt;
                            tgt = Math.Min(tgt, Math.Max(0, (left - 0.8) * 1.2));
                            a.waitingSignal = true;
                        }
                    }
                }
                if (a.ghost > 0 && (a.ghost -= dt) <= 0) a.hardGhost = false;
                var ba = blocker as Agent;
                if (gap < double.PositiveInfinity)
                {
                    // Never faster than you can stop in the gap, and behind a moving vehicle keep a time gap.
                    double minGap = two ? 0.6 : a.erratic ? 0.9 : 1.6;
                    double lead = ba != null && ba.speed > 0.3 ? Math.Max(0, ba.speed * (Math.Sin(ba.v.heading) * fx0Pre + Math.Cos(ba.v.heading) * fz0Pre)) : 0;
                    double stopV = Math.Sqrt(lead * lead + 2 * v.spec.brake * 0.6 * Math.Max(0, gap - minGap));
                    double headway = two ? 0.35 : a.erratic ? 0.5 : 0.9;
                    tgt = Math.Min(tgt, Math.Min(stopV, lead + Math.Max(0, gap - minGap - a.speed * headway) * 0.8 + (gap > minGap + a.speed * headway ? 1 : 0)));
                    if (ba != null && ba.wrongNow && gap < 25 && distP < 150 && (a.honkCd -= dt * 4) <= 0) { a.honkCd = 1 + R() * 2; w.Horn(v); }
                }
                // Stuck behind something that isn't going anywhere: edge round it.
                bool blockerWaiting = ba != null && ba.waitingSignal;
                bool blockerStill = blocker != null && !blockerWaiting && (ba == null || ba.v.driver != "ai" || ba.stunned > 0);
                if ((!a.erratic || a.turning) && a.stuck > (a.turning ? 1.5 : 3) && blockerStill)
                {
                    var r0 = a.edge.road; bool wide = r0.median == 0 && a.edge.flyover == null;
                    double lo, hi;
                    if (a.turning) { lo = -1.8; hi = 1.8; } else { lo = wide ? Math.Min(Band(a).lo, WrongBand(a).lo) : Band(a).lo; hi = Band(a).hi; }
                    double best = a.latTarget, bestGap = gap;
                    for (int k = 0; k <= 6; k++) { double cand = lo + (hi - lo) * k / 6; var r2 = GapAhead(a, cand, look, obstacles); if (r2.gap > bestGap + 2) { bestGap = r2.gap; best = cand; } }
                    if (best != a.latTarget) a.bypassT = 6;
                    a.latTarget = best;
                }
                if (a.bypassT > 0 && (a.bypassT -= dt) <= 0 && !a.erratic && !a.turning) a.latTarget = 0;
                if (blockerWaiting) a.waitingSignal = true;
                a.lastBlocker = blocker;
                if (blocker is Obstacle ob && ob.isCow && a.stuck > 4) ob.shoo = true;
                // Vehicles each waiting for the next in a ring: the newest of them backs off a few metres.
                bool ringNewest = false;
                if (a.stuck > 4 && ba != null && ba.v.driver == "ai")
                {
                    object bb = ba; int newest = a.id;
                    for (int n = 0; n < 8 && bb is Agent b2 && b2 != a && b2.v.driver == "ai"; n++) { newest = Math.Max(newest, b2.id); bb = b2.lastBlocker; }
                    ringNewest = bb == a && newest == a.id;
                }
                if (ringNewest && a.backed < 6 && a.s > 0.5) { double back = Math.Min(a.s, 1.2 * dt); a.s -= back; a.backed += back; }
                else if (a.speed > 1) a.backed = 0;
                if (a.stunned > 0) { a.stunned -= dt; tgt = 0; }
                // Flood water: everyone slows down and wades through.
                double fx0 = Math.Sin(v.heading), fz0 = Math.Cos(v.heading);
                double depth = w.WaterDepth(v.x, v.z, v.y), depthAhead = Math.Max(depth, w.WaterDepth(v.x + fx0 * 10, v.z + fz0 * 10, v.y));
                v.waterDepth = depth; v.stalled = false;
                if (depthAhead > 0.06) tgt = Math.Min(tgt, Math.Max(2.2, 7.5 - depthAhead * (two ? 7 : 5)));
                // Pull in at a stop on this stretch and wait there.
                if (a.stop != null && !a.turning && a.edge == a.stop.Value.edge)
                {
                    double d = a.stop.Value.s - a.s;
                    if (d > -2)
                    {
                        if (d < 45) a.latTarget = KerbLat(a);
                        tgt = Math.Min(tgt, a.rush ? Math.Sqrt(2 * v.spec.brake * 0.6 * Math.Max(0, d - 0.5)) : Math.Max(0, d * 0.7));
                        if (d < 1.5 && a.speed < 0.5) a.stopped = true;
                    }
                }
                if (a.hold) tgt = 0;
                double acc = tgt > a.speed ? v.spec.accel * (a.rush ? 1.6 : 0.8) : v.spec.brake;
                a.speed += Math.Sign(tgt - a.speed) * Math.Min(Math.Abs(tgt - a.speed), acc * dt);

                // Stuck: honk, and eventually squeeze through anyway (but not at a red light).
                if (a.speed < 0.5 && tgt < 0.5 && a.stunned <= 0 && !a.stopped && !a.hold)
                {
                    a.stuck += dt;
                    a.honkCd -= dt;
                    if (a.honkCd <= 0 && (blocker != null || a.waitingSignal) && distP < 160)
                    {
                        a.honkCd = (a.waitingSignal ? 3 : 1.2) + R() * 2.5;
                        if (!a.waitingSignal || R() < 0.4) w.Horn(v);
                    }
                    bool queued = ba != null && (Math.Sin(ba.v.heading) * fx0 + Math.Cos(ba.v.heading) * fz0 > 0.7 || ba.ghost > 0);
                    var bo = blocker as Obstacle;
                    bool mayPass = !a.waitingSignal && !(bo != null && (bo.isPlayer || bo.isCop));
                    bool unseen = distP > 140;
                    if (unseen && a.stuck > ((ba != null && ba.wrongNow) || a.wrongNow ? 2.5 : 5) && mayPass && !queued) { a.ghost = 2.5; a.stuck = 0; }
                    else if (unseen && a.stuck > 15 && mayPass) { a.ghost = 2.5; a.hardGhost = true; a.stuck = 0; }
                    if (a.stuck > 45 && distP > 120 && !a.keep) { Despawn(a); continue; }
                }
                else a.stuck = Math.Max(0, a.stuck - dt);
                if (a.speed > 3 && distP < 160 && R() < dt * 0.03) w.Horn(v);

                a.s += a.speed * dt;
                for (int n = 0; a.s >= a.path.length && n < 4; n++) { a.s -= a.path.length; Advance(a); }
                a.s = Math.Min(a.s, a.path.length);
                var p = a.path.Sample(a.s);
                // Sideways moves: weavers dart across, everyone else drifts gently.
                double latSpeed = two ? 2.6 : a.erratic ? 1.8 : 1.2, cap = latSpeed * Math.Min(1, 0.1 + a.speed / 4);
                double wantVel = Math.Max(-cap, Math.Min(cap, (a.latTarget - a.lat) * 2));
                // Never slide sideways into someone alongside: hold the line until they've gone by.
                if (Math.Abs(wantVel) > 0.05 || Math.Abs(a.latVel) > 0.05)
                {
                    double dir = Math.Sign(Math.Abs(wantVel) > 0.05 ? wantVel : a.latVel);
                    if (Alongside(a, dir)) { wantVel = 0; a.latVel *= 0.5; a.latTarget = a.lat; }
                }
                a.latVel += (wantVel - a.latVel) * Math.Min(1, dt * 4);
                a.lat += a.latVel * dt;
                a.wrongNow = !a.turning && layout.LaneOffset(a.edge.road, a.lane) + a.lat < 0;
                // Point the vehicle where it's actually going, so weaving reads as steering.
                double nh = p.h + Math.Atan2(a.latVel, Math.Max(2.5, a.speed)) * (a.speed > 0.3 ? 1 : 0);
                double prevX = v.x, prevZ = v.z;
                v.x = p.x + Math.Cos(p.h) * a.lat;
                v.z = p.z - Math.Sin(p.h) * a.lat;
                double dh = Math.Atan2(Math.Sin(nh - v.heading), Math.Cos(nh - v.heading));
                v.yawRate = dt > 0 ? dh / dt * 0.5 : 0;
                v.ay = dt > 0 ? dh / dt * a.speed * 0.6 : 0;
                v.ax = dt > 0 && !double.IsNaN(a.lastSpeed) ? (a.speed - a.lastSpeed) / dt : 0;
                a.lastSpeed = a.speed;
                v.heading += dh * Math.Min(1, dt * 10);
                v.vx = dt > 0 ? (v.x - prevX) / dt : 0;
                v.vz = dt > 0 ? (v.z - prevZ) / dt : 0;
                bool far = distP > 280;
                w.Show(v, !far);
                if (!far || ai % 4 == 0) { v.FollowGround(dt, w.VehicleWorld); w.Sync(v, dt); }
            }
            ResolveContacts();
            // Top up the population around the player.
            int want = (int)Math.Round(target * w.TrafficScale);
            int budget = agents.Count < want * 0.5 ? 12 : 3;
            while (agents.Count < want && budget-- > 0) Spawn(w.InitialFill);
        }
    }
}
