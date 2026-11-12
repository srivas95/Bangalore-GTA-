// Getting around without wheels of your own (port of src/systems/rides.js). Wave down an auto from
// any roadside (H), tell the driver where to go and pay the meter; or catch a BMTC bus at one of the
// shelters along its route (E at the stop), buy a ticket from the conductor and ride it stop by
// stop. Both are driven by the traffic AI through the real traffic, with the camera following.
// T skips ahead.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.Entities;
using NammaBengaluru.Render;
using NammaBengaluru.World;
using UnityEngine;

namespace NammaBengaluru.Systems
{
    public class Rides
    {
        // Route number, from, to (both directions run). Numbers after real BMTC routes.
        static readonly (string num, string a, string b)[] BUS_ROUTES = {
            ("500D", "Hebbal", "Silk Board"), ("335E", "Majestic", "Whitefield"), ("13", "Majestic", "Banashankari"), ("201", "Shivajinagar", "Koramangala"),
            ("252", "Majestic", "Yeshwanthpur"), ("G-3", "Majestic", "Electronic City Road"), ("226", "Vijayanagar", "Indiranagar"), ("401", "Yelahanka", "Majestic"),
            ("KBS-8", "Majestic", "Jayanagar"),
        };
        const double STOP_EVERY = 380;
        static readonly string[] STOP_SUFFIX = { " Main Road", " Cross", " Market", " Circle", " Post Office", " Temple", " Park", " 2nd Stage", " Signal", " Bus Depot" };
        static readonly System.Random R = new System.Random();
        static double Rnd() => R.NextDouble();
        static T Pick<T>(IList<T> l) => l[R.Next(l.Count)];
        static double Hyp(double a, double b) => Math.Sqrt(a * a + b * b);

        public class BusRoute { public string num, from, to; public List<DirEdge> edges; public List<Stop> stops = new List<Stop>(); public double length; }
        public class Stop { public BusRoute route; public int idx; public DirEdge edge; public double s, at; public Shelter shelter; }
        public class Shelter { public double x, z, lx, lz; public string name; public List<Stop> serves = new List<Stop>(); }
        class Item { public string text, sub, fare, header, name; public double x, z; public Stop from, to; }

        readonly Game game;
        readonly Layout layout;
        readonly Traffic traffic;
        public readonly List<BusRoute> routes = new List<BusRoute>();
        public readonly List<Shelter> shelters = new List<Shelter>();
        public string state; // hail | menu | board | ride | stopMenu | wait | busBoard | busRide
        string kind;
        Agent agent;
        double t, waitT, standX, standZ, faceRoad, fromX, fromZ, metres, lastX, lastZ, dwell;
        int extra;
        bool retried, stopping, getOff;
        List<Item> items; int sel;
        Item dest; DrivePlan destPlan;
        Shelter shelter;
        (Stop from, Stop to, BusRoute route, int fare)? trip;
        List<Stop> busStops;
        Stop busStopQ; // the stop the bus is pulling in at
        string menuTitle, menuSub, menuFoot; int menuAccent;

        public bool Active => state != null;
        // Menus, boarding and riding take over the player; waving down an auto or waiting for a bus don't.
        public bool Blocking => state != null && state != "hail" && state != "wait";
        // Aboard (the player is carried, not walking).
        public bool Carrying => state == "ride" || state == "busRide" || state == "board" || state == "busBoard";
        static int BusFare(double metres, double scale) => Math.Min(30, 6 * Math.Max(1, (int)Math.Ceiling(metres * scale / 2000)));
        string RealKm(double m) => (m * game.md.SCALE / 1000).ToString("F1");

        public Rides(Game game, Transform parent)
        {
            this.game = game; layout = game.layout; traffic = game.traffic;
            BuildRoutes();
            BuildShelters(parent);
        }

        // ---------- BMTC network ----------
        void BuildRoutes()
        {
            var byName = new Dictionary<string, District>();
            foreach (var d in game.md.DISTRICTS) byName[d.name] = d;
            foreach (var (num, a, b) in BUS_ROUTES)
            {
                if (!byName.TryGetValue(a, out var A) || !byName.TryGetValue(b, out var B)) continue;
                foreach (var (from, to) in new[] { (A, B), (B, A) })
                {
                    var r = Route.PlanNodes(layout, from.x, from.z, to.x, to.z);
                    var edges = r != null ? Route.NodesToEdges(r.nodes) : null;
                    if (edges == null || edges.Count < 3) continue;
                    routes.Add(new BusRoute { num = num, from = from.name, to = to.name, edges = edges });
                }
            }
        }

        static double PathLen(DirEdge e) => Math.Max(0, e.len - Math.Min(e.cutFrom + 1.5, e.len * 0.45) - Math.Min(e.cutTo + 1.5, e.len * 0.45));

        // Stops every few hundred metres on the left kerb, with a shelter on the footpath. Routes
        // sharing a stretch of road share the shelters.
        void BuildShelters(Transform parent)
        {
            var named = new Dictionary<string, int>();
            foreach (var route in routes)
            {
                double next = 60, dist = 0;
                for (int i = 0; i < route.edges.Count; i++)
                {
                    var e = route.edges[i];
                    double pathLen = PathLen(e);
                    while (next < dist + pathLen - 10)
                    {
                        double s = Math.Max(10, next - dist);
                        var st = AddStop(route, i, e, s, named);
                        if (st != null) route.stops.Add(st);
                        next += STOP_EVERY;
                    }
                    dist += pathLen;
                    route.length = dist;
                }
                // Distance along the route to each stop, for fares and waiting times.
                double acc = 0; var startOf = new List<double>();
                foreach (var e in route.edges) { startOf.Add(acc); acc += PathLen(e); }
                foreach (var st in route.stops) st.at = startOf[st.idx] + st.s;
            }
            BuildShelterMeshes(parent);
        }

        Stop AddStop(BusRoute route, int idx, DirEdge e, double s, Dictionary<string, int> named)
        {
            double a = Math.Min(e.cutFrom + 1.5, e.len * 0.45);
            double lx = e.dirZ, lz = -e.dirX;
            double off = e.road.width / 2 + GameConfig.SIDEWALK_W * 0.55;
            foreach (var ds in new double[] { 0, 15, -15, 30 })
            {
                double ss = s + ds;
                if (ss < 8 || ss > e.len - a - 8) continue;
                double cx = e.from.x + e.dirX * (a + ss), cz = e.from.z + e.dirZ * (a + ss);
                double x = cx + lx * off, z = cz + lz * off;
                if (game.colliders.PointBlocked(x, z, 0.5)) continue;
                // Share an existing shelter on the same side of the same road.
                var sh = shelters.FirstOrDefault(q => Hyp(q.x - x, q.z - z) < 30 && q.lx * lx + q.lz * lz > 0.7);
                if (sh == null) { sh = new Shelter { x = x, z = z, lx = lx, lz = lz, name = StopName(x, z, named) }; shelters.Add(sh); }
                var st = new Stop { route = route, idx = idx, edge = e, s = ss, shelter = sh };
                sh.serves.Add(st);
                return st;
            }
            return null;
        }

        // A named junction gives its name to the first stop there; other stops take the district's
        // name, then the district's with a suffix ("Jayanagar Main Road", "Jayanagar Cross", ...).
        string StopName(double x, double z, Dictionary<string, int> named)
        {
            string junction = null; double bd = 120;
            foreach (var n in layout.nodes)
            {
                if (n.name == null) continue;
                double d = Hyp(n.x - x, n.z - z);
                if (d < bd) { bd = d; junction = System.Text.RegularExpressions.Regex.Replace(n.name, " junction$", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase); }
            }
            string district = layout.BlockAt(x, z)?.district ?? "Bengaluru";
            foreach (var b in new[] { junction, district }) if (b != null && !named.ContainsKey(b)) { named[b] = 1; return b; }
            int k = named[district];
            named[district] = k + 1;
            var ok = STOP_SUFFIX.Where(sfx => !district.Contains(sfx.Trim())).ToList();
            return k <= ok.Count ? district + ok[k - 1] : $"{district} Stop {k}";
        }

        // One shelter per stop, local +z facing the road: a blue roof on three posts, an advert
        // panel, side screens, a steel bench and a BMTC sign on a pole.
        void BuildShelterMeshes(Transform parent)
        {
            var B = new BuilderSet(320);
            var m = B.Get("m");
            foreach (var sh in shelters)
            {
                double gy = layout.GroundHeight(sh.x, sh.z, 2);
                var f = new Frame(sh.x, sh.z, Math.Atan2(-sh.lx, -sh.lz));
                B.xf = f;
                void Box(double w, double h, double d, double x, double y, double z, int col) => m.Box(x, gy + y - h / 2, z, w, h, d, col);
                Box(4.4, 0.1, 2.0, 0, 2.55, 0.05, 0x1f5fae);
                foreach (var x in new[] { -2.0, 0, 2 }) Box(0.09, 2.5, 0.09, x, 1.25, -0.85, 0x9aa0a6);
                Box(4.0, 1.7, 0.05, 0, 1.45, -0.86, 0xe9e2cf);
                Box(1.6, 1.2, 0.06, -1.0, 1.5, -0.82, 0xd8452a);
                Box(1.6, 1.2, 0.06, 1.0, 1.5, -0.82, 0x2a8a4a);
                foreach (var x in new[] { -2.12, 2.12 }) Box(0.04, 1.5, 1.0, x, 1.35, -0.38, 0x8fb2c4);
                Box(3.2, 0.06, 0.45, 0, 0.5, -0.55, 0x8a8f96);
                foreach (var x in new[] { -1.4, 1.4 }) Box(0.06, 0.5, 0.4, x, 0.25, -0.55, 0x6a6e72);
                Box(0.07, 3.0, 0.07, 2.7, 1.5, 0.85, 0x9aa0a6);
                Box(0.7, 0.45, 0.05, 2.7, 2.75, 0.85, 0x1f4ea8);
                Box(0.5, 0.1, 0.06, 2.7, 2.75, 0.88, 0xffffff);
                B.xf = null;
                // Behind the bench is solid; the front is open.
                double bx = sh.x - sh.lx * 0.85, bz = sh.z - sh.lz * 0.85;
                game.colliders.AddOriented(bx, bz, 2.2, 0.15, Math.Atan2(-sh.lx, -sh.lz), 2.6, "shelter");
            }
            var group = new GameObject("busShelters").transform;
            group.SetParent(parent, false);
            B.BuildAll(new Dictionary<string, Material> { ["m"] = CityMaterials.Make("shelter", new CityMaterials.Spec { roughness = 0.6f, metallic = 0.2f }) }, group);
        }

        public Shelter NearShelter((double x, double z) p)
        {
            Shelter best = null; double bd = 4;
            foreach (var sh in shelters) { double d = Hyp(sh.x - p.x, sh.z - p.z); if (d < bd) { bd = d; best = sh; } }
            return best;
        }

        // Shelters near you, for the minimap.
        public IEnumerable<UI.MapMarker> MapMarkers(double x, double z)
        {
            foreach (var sh in shelters) if (Math.Abs(sh.x - x) < 220 && Math.Abs(sh.z - z) < 220) yield return new UI.MapMarker { x = sh.x, z = sh.z, color = UI.Hud.CssColor(0x2fa8ff) };
        }

        // ---------- menus ----------
        void OpenMenu(string title, string sub, List<Item> its, string foot, int accent)
        {
            items = its; sel = its.FindIndex(i => i.header == null);
            menuTitle = title; menuSub = sub; menuFoot = foot; menuAccent = accent;
            RenderMenu();
        }

        void RenderMenu() => game.hud.ShowList(menuTitle, menuSub, items.Select(i => (i.text, i.sub, i.fare, i.header)).ToList(), sel, menuFoot, menuAccent);

        // W/S to move, E to pick, Q to cancel. Returns the picked item, the cancel marker, or null.
        static readonly Item CANCEL = new Item();
        Item MenuInput(GameInput input)
        {
            void Step(int d) { int i = sel; do { i = (i + d + items.Count) % items.Count; } while (items[i].header != null); sel = i; RenderMenu(); }
            if (input.Hit("KeyW", "ArrowUp")) Step(-1);
            if (input.Hit("KeyS", "ArrowDown")) Step(1);
            if (input.Hit("KeyQ", "Backspace")) return CANCEL;
            if (input.Hit("KeyE", "Enter")) return items[sel];
            return null;
        }

        void CloseMenu() => game.hud.HideMenu();

        // ---------- autos ----------
        // On a road or its footpath (somewhere an auto could pull in)?
        public EdgeHit? Roadside((double x, double z) p)
        {
            var h = layout.EdgeAt(p.x, p.z);
            return h != null && h.Value.e.dirs != null && h.Value.e.dirs.Length == 2 && h.Value.e.dirs[0] != null && h.Value.e.dirs[1] != null && h.Value.d <= h.Value.e.r.width / 2 + GameConfig.SIDEWALK_W + 1.5 ? h : null;
        }

        // H on foot: wave down an auto from the roadside. You keep control while it comes: stand
        // still and you wave; it stops by you (or as near as the traffic lets it) and waits for you.
        public void HailAuto(bool retry = false)
        {
            var p = game.player;
            if (game.police.level > 0) { game.Say("No auto will stop for someone with the police after them.", 3); return; }
            var hq = Roadside((p.x, p.z));
            if (hq == null) { game.Say(retry ? "No auto in sight. Try again from the roadside." : "Walk to the roadside to wave down an auto.", 2.5); if (retry) Release(); return; }
            var h = hq.Value;
            // The direction of travel that has you on its left kerb (India keeps left).
            var d1 = h.e.dirs[0]; var d2 = h.e.dirs[1];
            double px = h.e.a.x + (h.e.b.x - h.e.a.x) * h.t, pz = h.e.a.z + (h.e.b.z - h.e.a.z) * h.t;
            double Side(DirEdge d) => (p.x - px) * d.dirZ + (p.z - pz) * -d.dirX;
            var dd = Side(d1) >= Side(d2) ? d1 : d2;
            double stopS = Route.SAlong(dd, p.x, p.z);
            // Bring one in from 45-odd metres back (less on a retry), round the corner if need be.
            var edge = dd; double s = stopS - (retry ? 30 : 45); var route = new List<DirEdge>();
            if (s < 0)
            {
                var ins = dd.from.outEdges.Select(e => e.rev).Where(e => e != null && e != dd.rev).ToList();
                if (ins.Count > 0) { edge = Pick(ins); s = Math.Max(0, PathLen(edge) + s); route = new List<DirEdge> { dd }; }
                else s = 0;
            }
            FreeAgent();
            var a = traffic.SpawnOn("auto", edge, s);
            if (a == null) { game.Say("No auto in sight.", 2); return; }
            a.keep = true; a.route = route; a.stop = (dd, stopS); a.cruise = Math.Max(a.cruise, 7); a.wrongProne = false;
            agent = a; kind = "auto"; state = "hail"; t = 0; retried = retry; waitT = 0;
            standX = p.x; standZ = p.z;
            faceRoad = Math.Atan2(px - p.x, pz - p.z);
            if (retry) game.Say("That one got stuck in traffic. Another auto is coming.", 2.5);
            else { game.Say("You stick your arm out: \"Auto!\"", 2); GameAudio.I?.Voice("vo_kn_he", gender: "m"); }
        }

        void AutoMenu()
        {
            var v = agent.v; var its = new List<Item>();
            double Est(double x, double z) => AutoDuty.AutoFare(Hyp(x - v.x, z - v.z) * 1.3, game.hour, game.md.SCALE);
            if (game.gps.target != null)
            {
                var tg = game.gps.target.Value;
                its.Add(new Item { text = "Your map waypoint", sub = $"{RealKm(Hyp(tg.x - v.x, tg.z - v.z) * 1.3)} km", fare = $"~₹{Math.Round(Est(tg.x, tg.z))}", x = tg.x, z = tg.z, name = "your waypoint" });
            }
            foreach (var d in game.md.DISTRICTS.Select(d => (d, dist: Hyp(d.x - v.x, d.z - v.z))).Where(q => q.dist > 180).OrderBy(q => q.dist))
                its.Add(new Item { text = d.d.name, sub = $"{RealKm(d.dist * 1.3)} km", fare = $"~₹{Math.Round(Est(d.d.x, d.d.z))}", x = d.d.x, z = d.d.z, name = d.d.name });
            OpenMenu("AUTO", $"Driver: \"{Pick(new[] { "Ellige saar?", "Yelli hogbeku?", "Where to, saar?" })}\"", its, "W/S choose · E go · Q never mind", 0xe0b000);
            GameAudio.I?.Voice("vo_kn_elli", gender: "m");
        }

        void ChooseAuto(Item item)
        {
            var a = agent; var v = a.v;
            bool far = Hyp(item.x - v.x, item.z - v.z) > 1900;
            if (far && Rnd() < 0.3)
            {
                game.Say($"Driver: \"{item.name}? Illa saar, return sikkalla.\" He drives off.", 3.5);
                GameAudio.I?.Voice("vo_kn_illa", gender: "m");
                Release(); return;
            }
            var plan = Route.PlanDrive(layout, a.edge, a.s, item.x, item.z);
            if (plan == null) { game.Say("Driver: \"Gothilla saar, that place.\" He shrugs.", 2.5); Release(); return; }
            extra = Rnd() < 0.25 ? 20 : 0;
            if (extra > 0) game.Say($"Driver: \"{Pick(new[] { "Meter mele twenty kodi, saar.", "Twenty extra, traffic jaasti.", game.cfg.LINES["autoDriver"][2] })}\" You shrug and get in.", 3.5);
            else game.Say($"Driver: \"{Pick(new[] { "Sari, kooti.", "Baa, hogona.", "OK saar, sit." })}\"", 2.5);
            GameAudio.I?.Voice("vo_kn_sari", gender: "m");
            dest = item; destPlan = plan;
            metres = 0; lastX = v.x; lastZ = v.z;
            BoardStart();
        }

        // ---------- buses ----------
        public void StopMenu(Shelter sh)
        {
            if (game.police.level > 0) { game.Say("The conductor eyes the police behind you and waves the bus on.", 3); return; }
            var its = new List<Item>();
            foreach (var st in sh.serves)
            {
                var r = st.route; int k = r.stops.IndexOf(st);
                var later = r.stops.Skip(k + 1).ToList();
                if (later.Count == 0) continue;
                its.Add(new Item { header = "#5fa0ff", text = $"{r.num} → {r.to}" });
                foreach (var q in later) its.Add(new Item { text = q.shelter.name, sub = $"{RealKm(q.at - st.at)} km", fare = $"₹{BusFare(q.at - st.at, game.md.SCALE)}", from = st, to = q });
            }
            if (its.Count == 0) { game.Say("End of the line here. Try the stop across the road.", 2.5); return; }
            shelter = sh; kind = "bus"; state = "stopMenu";
            OpenMenu($"BMTC · {sh.name}", "Pick your stop", its, "W/S choose · E wait for the bus · Q cancel", 0x1f4ea8);
        }

        bool ChooseBus(Item item)
        {
            int fare = BusFare(item.to.at - item.from.at, game.md.SCALE);
            if (game.money < fare) { game.Say($"A ticket is ₹{fare}. You can't afford it.", 2.5); return false; }
            trip = (item.from, item.to, item.from.route, fare);
            state = "wait"; t = 0;
            var p = game.player;
            standX = p.x; standZ = p.z;
            faceRoad = Math.Atan2(-shelter.lx, -shelter.lz);
            SpawnBus(220);
            game.Say($"Waiting for the {trip.Value.route.num} to {trip.Value.route.to}.", 3);
            return true;
        }

        // Put the trip's bus on its route `back` metres before our stop, stopping at every stop.
        void SpawnBus(double back)
        {
            FreeAgent();
            var r = trip.Value.route; var st = trip.Value.from;
            int i = st.idx; double s = st.s - back;
            while (s < 0 && i > 0) { i--; s += PathLen(r.edges[i]); }
            s = Math.Max(0, s);
            var a = traffic.SpawnOn("bus", r.edges[i], s);
            if (a == null) return;
            a.keep = true;
            a.route = r.edges.Skip(i + 1).ToList();
            a.cruise = Math.Max(a.cruise, 8);
            agent = a;
            int ii = i; double s0 = s;
            busStops = r.stops.Where(q => q.idx > ii || (q.idx == ii && q.s > s0 + 3)).ToList();
            NextBusStop();
        }

        void NextBusStop()
        {
            Stop q = null;
            if (busStops.Count > 0) { q = busStops[0]; busStops.RemoveAt(0); }
            busStopQ = q;
            agent.stop = q != null ? (q.edge, q.s) : ((DirEdge, double)?)null;
            agent.stopped = false;
            dwell = 0;
        }

        // ---------- boarding, riding, getting off ----------
        void BoardStart()
        {
            CloseMenu();
            state = kind == "bus" ? "busBoard" : "board";
            t = 0;
            fromX = game.player.x; fromZ = game.player.z;
            agent.hold = true;
        }

        (double x, double z) DoorPoint()
        {
            var v = agent.v;
            double lx = Math.Cos(v.heading), lz = -Math.Sin(v.heading), fx = Math.Sin(v.heading), fz = Math.Cos(v.heading);
            double fwd = kind == "bus" ? v.spec.length / 2 - 1.6 : -0.2;
            return (v.x + lx * (v.spec.width / 2 + 0.45) + fx * fwd, v.z + lz * (v.spec.width / 2 + 0.45) + fz * fwd);
        }

        void SeatPlayer()
        {
            var h = game.player.human; var v = agent.v;
            if (kind == "auto")
            {
                h.PoseSit();
                h.go.transform.SetParent(((VehicleView)v.view).rig.body, false);
                h.x = 0; h.y = -0.05; h.z = -0.62; h.heading = 0; h.tiltX = 0;
                h.Apply();
            }
            else h.go.SetActive(false);
        }

        void Alight(double x, double z)
        {
            var p = game.player; var h = p.human; var a = agent;
            h.go.transform.SetParent(game.Root, false);
            h.go.SetActive(true);
            h.tiltX = 0;
            h.PoseIdle(0);
            p.x = x; p.z = z; p.y = layout.GroundHeight(x, z, 2);
            p.vy = 0;
            if (a != null) p.heading = a.v.heading;
            h.x = p.x; h.y = p.y; h.z = p.z; h.heading = p.heading; h.Apply();
            game.rig.first = true;
            Release();
        }

        // Let the vehicle go back to being ordinary traffic.
        void FreeAgent()
        {
            var a = agent;
            if (a != null) { a.keep = false; a.stop = null; a.route = null; a.hold = false; a.stopped = false; a.rush = false; }
            agent = null;
            busStopQ = null;
        }

        // Give up on a ride that hasn't started (or has just ended).
        void Release()
        {
            FreeAgent();
            state = null;
            CloseMenu();
            game.hud.HideBanner();
        }

        public void Abort()
        {
            if (state == null) return;
            if (Carrying) { var v = agent?.v; Alight(v?.x ?? game.player.x, v?.z ?? game.player.z); }
            else Release();
        }

        void Pay(int amount, string what)
        {
            if (game.money >= amount) { game.AddMoney(-amount); GameAudio.I?.Cash(); game.hud.Toast($"−₹{amount}", what); return; }
            int had = game.money;
            game.AddMoney(-had);
            game.hud.Toast($"−₹{had}", $"{what} (₹{amount - had} short)");
            game.Say("You're short. The driver takes everything you have and tells you what he thinks of you.", 3.5);
        }

        // ---------- per frame ----------
        // Returns the vehicle for the camera to follow while aboard, else null.
        public Vehicle Update(double dt, GameInput input)
        {
            var p = game.player; var h = p.human;
            double tt = Time.time;
            t += dt;
            var a = agent;
            // The vehicle was taken away (stolen by someone else, despawned): give up.
            if (a != null && !traffic.agents.Contains(a)) { game.Say("Your ride has gone.", 2); Abort(); return null; }
            bool moved = input.Down("KeyW") || input.Down("KeyA") || input.Down("KeyS") || input.Down("KeyD");
            switch (state)
            {
                case "hail":
                {
                    var v = a.v; double d = Hyp(v.x - p.x, v.z - p.z);
                    bool still = !moved && p.vehicle == null;
                    // Standing still: arm out, facing the road.
                    if (still && waitT == 0) { p.heading = faceRoad; h.heading = faceRoad; h.PoseHail(tt); h.Apply(); }
                    // Pulled in at your spot, or stopped close by because the traffic won't let it any nearer.
                    bool here = a.stopped || (t > 2 && a.speed < 0.8 && d < 14 && !a.turning);
                    if (here && !a.hold) { a.hold = true; GameAudio.I?.Voice("vo_kn_elli", gender: "m"); }
                    if (a.hold)
                    {
                        if (d < 9 && p.vehicle == null)
                        {
                            // Climb up to it: the destination menu.
                            p.heading = Math.Atan2(v.x - p.x, v.z - p.z);
                            state = "menu";
                            game.hud.HideBanner();
                            AutoMenu();
                            break;
                        }
                        waitT += dt;
                        if (waitT > 30) { game.Say("The auto driver got tired of waiting and drove off.", 2.5); Release(); break; }
                        game.hud.Banner(0xe0b000, "Your auto is waiting", $"Walk over to it ({Math.Round(d)} m)", "Q never mind");
                    }
                    else
                    {
                        // Taking too long (stuck behind something): one more auto, a bit closer.
                        if (t > (retried ? 60 : 35) || (a.stuck > 10 && d > 25))
                        {
                            if (retried) { game.Say("No luck. The autos all have passengers.", 2.5); Release(); break; }
                            HailAuto(true);
                            break;
                        }
                        game.hud.Banner(0xe0b000, "Waving down an auto", d < 60 ? $"One is pulling in… {Math.Round(d)} m" : "Watch the traffic for a free one…", "Q give up");
                    }
                    // Giving up: Q, getting into something, the police, or walking off.
                    bool off = Hyp(p.x - standX, p.z - standZ) > 40 && d > 25;
                    if (input.Hit("KeyQ") || p.vehicle != null || game.police.level > 0 || off)
                    {
                        if (off) game.Say("You walked off. The auto goes on its way.", 2);
                        else if (game.police.level > 0) game.Say("The auto driver sees the police and keeps going.", 2.5);
                        Release();
                    }
                    break;
                }
                case "menu":
                {
                    h.PoseIdle(tt); h.Apply();
                    var r = MenuInput(input);
                    if (r == CANCEL) { game.Say("Driver: \"Sari.\" He pulls away.", 2); Release(); }
                    else if (r != null) ChooseAuto(r);
                    break;
                }
                case "stopMenu":
                {
                    h.PoseIdle(tt); h.Apply();
                    var r = MenuInput(input);
                    if (r == CANCEL) { state = null; CloseMenu(); }
                    else if (r != null) { if (ChooseBus(r)) CloseMenu(); }
                    break;
                }
                case "wait":
                {
                    if (a == null) { Release(); break; }
                    var tr = trip.Value; var st = tr.from; var v = a.v;
                    double d = Hyp(v.x - p.x, v.z - p.z), fromStop = Hyp(p.x - standX, p.z - standZ);
                    if (a.stopped && busStopQ == st)
                    {
                        // At your stop: get on if you're there; it waits a few seconds if you're not.
                        if (d < 14 && p.vehicle == null) { Pay(tr.fare, $"BMTC {tr.route.num} ticket"); BoardStart(); break; }
                        dwell += dt;
                        game.hud.Banner(0x1f4ea8, "Your bus is here!", $"The {tr.route.num} is at {st.shelter.name}: get to the door ({Math.Round(d)} m)", "Q give up");
                        if (dwell > 10) { game.Say($"You missed the {tr.route.num}.", 2.5); Release(); }
                        break;
                    }
                    if (a.stopped) { dwell += dt; if (dwell > 3) NextBusStop(); }
                    if (input.Hit("KeyT")) SpawnBus(35);
                    if (input.Hit("KeyQ") || p.vehicle != null || fromStop > 30)
                    {
                        if (fromStop > 30) game.Say("You wandered off from the bus stop.", 2);
                        Release();
                        break;
                    }
                    double away = Math.Max(0, st.at - RouteAt(agent));
                    game.hud.Banner(0x1f4ea8, st.shelter.name, $"{tr.route.num} to {tr.route.to}: {(away < 40 ? "arriving" : $"{Math.Max(1, Math.Round(away / 150))} min away")}", "T skip the wait · Q give up");
                    break;
                }
                case "board":
                case "busBoard":
                {
                    var door = DoorPoint(); double k = Math.Min(1, t / 1.1);
                    p.x = fromX + (door.x - fromX) * k; p.z = fromZ + (door.z - fromZ) * k;
                    h.x = p.x; h.y = p.y; h.z = p.z; h.heading = Math.Atan2(door.x - fromX, door.z - fromZ);
                    h.AnimateWalk(dt, 1.8); h.Apply();
                    if (k >= 1)
                    {
                        SeatPlayer();
                        a.hold = false;
                        if (kind == "auto")
                        {
                            a.route = destPlan.route;
                            a.stop = (destPlan.stopEdge, destPlan.stopS);
                            a.stopped = false;
                            // With a fare on board, the driver floors it: flat out, quick round
                            // corners, through the end of the amber and the start of the red.
                            a.rush = true;
                            a.cruise = a.v.spec.maxSpeed * 1.3;
                            a.jumper = true;
                            state = "ride";
                        }
                        else
                        {
                            state = "busRide";
                            dwell = 0;
                            game.Say($"Conductor: \"{Pick(new[] { "Ticket, ticket! Munde banni!", "Hattiri, hattiri! Swalpa munde hogi!", "Change illa, saar. UPI maadi." })}\"", 3);
                            GameAudio.I?.Voice("sfx_whistle");
                            GameAudio.I?.Voice("vo_hi_tikat", vol: 0.8);
                        }
                        t = 0;
                    }
                    break;
                }
                case "ride": return RideAuto(input);
                case "busRide": return RideBus(dt, input);
            }
            return null;
        }

        // Distance along the trip's route of a bus agent (approximate: by edge).
        double RouteAt(Agent a)
        {
            double acc = 0;
            foreach (var e in trip.Value.route.edges)
            {
                if (e == a.edge) return acc + (a.turning ? 0 : a.s);
                acc += PathLen(e);
            }
            return 0;
        }

        void Follow(Vehicle v) { var p = game.player; p.x = v.x; p.z = v.z; p.y = v.y; }

        Vehicle RideAuto(GameInput input)
        {
            var a = agent; var v = a.v;
            metres += Hyp(v.x - lastX, v.z - lastZ);
            lastX = v.x; lastZ = v.z;
            double fare = AutoDuty.AutoFare(metres, game.hour, game.md.SCALE);
            // Knocked off the route, or missed the turn: the driver finds another way.
            var stop = a.stop;
            bool lost = a.route == null || (!a.turning && a.route.Count == 0 && a.edge != stop?.edge) || (stop != null && a.edge == stop.Value.edge && !a.turning && a.s > stop.Value.s + 4 && !a.stopped);
            if (lost && !a.turning && dest != null)
            {
                var plan = Route.PlanDrive(layout, a.edge, a.s, dest.x, dest.z);
                if (plan != null) { a.route = plan.route; a.stop = (plan.stopEdge, plan.stopS); }
            }
            if (input.Hit("KeyF", "KeyE") && !stopping)
            {
                stopping = true;
                game.Say("You: \"Illi nillisi, anna.\" (Stop here.)", 2);
                GameAudio.I?.Voice("vo_kn_nillisi", gender: "m");
            }
            if (stopping && !a.turning && (a.stop == null || a.stop.Value.edge != a.edge || a.stop.Value.s > a.s + 12)) a.stop = (a.edge, Math.Min(a.path.length - 1, a.s + 10));
            if (input.Hit("KeyT") && dest != null && a.stop != null) SkipTo(a.stop.Value.edge, a.stop.Value.s, () => { metres += Hyp(dest.x - v.x, dest.z - v.z) * 1.3; });
            if (a.stopped)
            {
                int total = (int)Math.Round(AutoDuty.AutoFare(metres, game.hour, game.md.SCALE)) + extra;
                Pay(total, $"Auto: meter ₹{total - extra}{(extra > 0 ? " + ₹20" : "")}");
                game.Say($"Driver: \"{Pick(new[] { "Sari saar, banni.", "Thank you saar.", "Bartini saar." })}\"", 2.5);
                GameAudio.I?.Voice("vo_kn_sari", gender: "m");
                double lx = Math.Cos(v.heading), lz = -Math.Sin(v.heading);
                stopping = false;
                dest = null;
                Alight(v.x + lx * 1.5, v.z + lz * 1.5);
                return null;
            }
            double left = dest != null ? Hyp(dest.x - v.x, dest.z - v.z) : 0;
            game.hud.Banner(0xe0b000, $"Auto{(dest != null ? $" to {dest.name}" : "")}", $"Meter ₹{fare:F1}{(extra > 0 ? " (+₹20)" : "")} · {RealKm(metres)} km{(stopping ? " · pulling over" : $" · {RealKm(left)} km to go")}", "T skip ride · F stop here");
            Follow(v);
            return v;
        }

        Vehicle RideBus(double dt, GameInput input)
        {
            var a = agent; var v = a.v; var tr = trip.Value;
            var at = busStopQ;
            if (a.stopped)
            {
                dwell += dt;
                if (at == tr.to || (getOff && dwell > 0.5))
                {
                    game.Say($"{(at != null ? at.shelter.name : "Your stop")}. You hop off.", 2);
                    var sh = at?.shelter;
                    double lx = Math.Cos(v.heading), lz = -Math.Sin(v.heading), fx = Math.Sin(v.heading), fz = Math.Cos(v.heading);
                    double x = sh != null ? sh.x + sh.lx * 0.2 : v.x + lx * 2.2 + fx * (v.spec.length / 2 - 1.6);
                    double z = sh != null ? sh.z + sh.lz * 0.2 : v.z + lz * 2.2 + fz * (v.spec.length / 2 - 1.6);
                    getOff = false;
                    trip = null;
                    Alight(x, z);
                    return null;
                }
                if (dwell > 3.5) { NextBusStop(); GameAudio.I?.Voice("sfx_whistle"); }
            }
            if (input.Hit("KeyE", "KeyF") && !getOff) { getOff = true; game.Say("You ring the bell: next stop.", 2); }
            if (input.Hit("KeyT"))
            {
                var to = tr.to;
                busStops = new List<Stop>();
                SkipTo(to.edge, to.s, () => { });
                a.stop = (to.edge, to.s); busStopQ = to;
                a.route = tr.route.edges.Skip(to.idx + 1).ToList();
            }
            var next = busStopQ;
            int n = next != null ? tr.route.stops.IndexOf(tr.to) - tr.route.stops.IndexOf(next) : 0;
            game.hud.Banner(0x1f4ea8, $"{tr.route.num} → {tr.route.to}",
                $"{(a.stopped && at != null ? $"At {at.shelter.name}" : $"Next: {(next != null ? next.shelter.name : tr.to.shelter.name)}")} · {(n <= 0 ? "your stop" : $"{n + 1} stops to {tr.to.shelter.name}")}",
                $"T skip to your stop · E get off at the next stop{(getOff ? " ✓" : "")}");
            Follow(v);
            return v;
        }

        // Doze off and wake up just short of the stop: move the vehicle there, wind the clock on.
        void SkipTo(DirEdge edge, double s, Action before)
        {
            var a = agent; var v = a.v;
            double d = Hyp(edge.from.x + edge.dirX * s - v.x, edge.from.z + edge.dirZ * s - v.z) * 1.3;
            before();
            int lane = a.lane < edge.road.lanes ? a.lane : edge.road.lanes - 1;
            traffic.LeaveJunction(a); // (or it would still be holding up the junction it was in)
            a.plan = null;
            a.edge = edge; a.lane = lane; a.path = traffic.EdgePath(edge, lane); a.turning = false;
            a.s = Math.Max(0, s - 1); a.speed = 0; a.route = new List<DirEdge>();
            var q = a.path.points; double k = Math.Min(1, a.s / a.path.length);
            v.x = q[0].x + (q[q.Count - 1].x - q[0].x) * k; v.z = q[0].z + (q[q.Count - 1].z - q[0].z) * k;
            v.heading = Math.Atan2(edge.dirX, edge.dirZ);
            a.lat = a.latTarget = traffic.KerbLat(a);
            game.env.Skip(d / 7);
            game.player.x = v.x; game.player.z = v.z;
            game.Reseed();
            game.rig.first = true;
            lastX = v.x; lastZ = v.z;
            game.Say("You doze off…", 1.5);
        }
    }
}
