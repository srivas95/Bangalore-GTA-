// Start-up and the main loop (port of init() and update() in src/main.js, built up phase by
// phase; see unity/PORTING.md). Builds the world from the data exported from the web game, puts
// the player at Majestic with a scooter, a bike and an auto waiting, parks vehicles around town,
// and runs the player, free vehicles, their contacts and the camera.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using NammaBengaluru.Entities;
using NammaBengaluru.Render;
using NammaBengaluru.Systems;
using NammaBengaluru.World;
using UnityEngine;
using Debug = UnityEngine.Debug;

namespace NammaBengaluru
{
    [DefaultExecutionOrder(-100)]
    public class Game : MonoBehaviour, IPlayerWorld, ITrafficWorld, IStreetWorld
    {
        public static Game Instance { get; private set; }

        public MapData md;
        public GameConfig cfg;
        public Layout layout;
        public Colliders colliders;
        public CityResult city;
        public Player player;
        public CameraRig rig;
        public GameInput input;
        public Signals signals;
        public Traffic traffic;
        public StreetLife streetLife;
        public UI.Hud hud;
        public GameAudio audio;
        public bool radioOn = true;
        Vehicle radioVehicle;
        Vehicle hudVehicle;
        public readonly List<Obstacle> obstacles = new List<Obstacle>();
        public Systems.Environment env;
        public double hour { get => env != null ? env.hour : 16.5; set { if (env != null) env.hour = value; } } // 4:30 PM, as the web game starts
        public readonly List<Vehicle> free = new List<Vehicle>();     // parked, abandoned and the player's
        public readonly List<Vehicle> vehicles = new List<Vehicle>(); // everything this frame
        public string lastSay;
        public double elapsed;
        readonly System.Random rnd = new System.Random(4242);
        Transform root;

        [Tooltip("Fly the free camera instead of playing (for looking at the city).")]
        public bool freeCam;

        // Game coordinates (right-handed, +z south) to Unity (left-handed, +z north).
        public static Vector3 ToUnity(double x, double y, double z) => new Vector3((float)x, (float)y, (float)-z);

        // ---------- IPlayerWorld ----------
        public Layout Layout => layout;
        public Colliders Colliders => colliders;
        public List<Vehicle> Vehicles => vehicles;
        public Transform Root => root;
        public double Wetness => env.wetness;
        public double WaterDepth(double x, double z, double y) => env.WaterDepth(x, z, y);
        public double GroundHeight(double x, double z, double y) => layout.GroundHeight(x, z, y);
        public void Say(string text, double seconds) { lastSay = text; hud?.Say(text, seconds); }
        public void Shake(double a) => rig?.Shake(a);

        // ---------- ITrafficWorld ----------
        public (double x, double z) Focus => player.Pos;
        public List<Obstacle> Obstacles => obstacles;
        public double Hour => hour;
        public double Rain => env.rain;
        public double TrafficScale => (hour >= 8 && hour < 11) || (hour >= 17 && hour < 21) ? 1.3 : hour >= 23 || hour < 5 ? 0.4 : 1; // rush hour is real
        public bool InitialFill => elapsed <= 3;
        public IVehicleWorld VehicleWorld => this;
        public void Release(Vehicle v) { if (!free.Contains(v)) free.Add(v); }
        public void Show(Vehicle v, bool on) => ((VehicleView)v.view).SetVisible(on);
        public void Sync(Vehicle v, double dt) => ((VehicleView)v.view).Sync(dt);
        public void Horn(Vehicle v) => audio?.Horn(v.spec.horn, v.x, v.z, v.hornPitch);

        static readonly HashSet<string> OPEN = new HashSet<string> { "scooter", "delivery", "bike", "sportBike", "auto", "goodsAuto" };

        // A new traffic vehicle, with a rider on anything open (Vehicle.addRider in the JS).
        public Vehicle NewVehicle(string type, Func<double> r)
        {
            var def = ModelLibrary.Pick(type, r);
            var v = new Vehicle(type, def.spec, 0, 0, 0, r);
            var view = new VehicleView(v, ModelLibrary.BuildVehicle(type, r, def), root);
            if (OPEN.Contains(type))
            {
                var humans = ModelLibrary.Humans;
                bool two = v.spec.twoWheeler;
                var hd = two && r() < 0.85 ? ModelLibrary.HumanNamed("helmet" + (int)Math.Floor(r() * 4)) : humans[1 + (int)Math.Floor(r() * 48)];
                view.SetRider(new Human(hd, r));
            }
            return v;
        }

        // The player takes a vehicle out of traffic: its driver bolts (not off a bus).
        public void TakeOver(Vehicle v)
        {
            var agent = traffic.FindAgent(v);
            if (agent != null) traffic.Release(agent);
            var rider = ((VehicleView)v.view).RemoveRider();
            if (!free.Contains(v)) free.Add(v);
            if (!v.type.Contains("us"))
                streetLife.SpawnFleeing(v.x - Math.Cos(v.heading) * 1.5, v.z + Math.Sin(v.heading) * 1.5, player.x, player.z, rider?.rig.def);
        }

        // Knocked off a two-wheeler in a crash: the rider tumbles, gets up and runs.
        public void ThrowRider(Vehicle v, double fromX, double fromZ, double kx, double kz)
        {
            var rider = ((VehicleView)v.view).RemoveRider();
            if (rider == null) return;
            var p = streetLife.SpawnFleeing(v.x, v.z, fromX, fromZ, rider.rig.def);
            streetLife.Knock(p, kx, kz);
        }

        // ---------- IStreetWorld ----------
        Player IStreetWorld.Player => player;
        public IPlayerWorld PlayerWorld => this;
        public double PedScale => hour >= 23 || hour < 5 ? 0.35 : env.rain > 0.5 ? 0.5 : 1;
        public void Crime(string what, double x, double z, int stars) { } // wanted levels come with the police port

        void Awake()
        {
            Instance = this;
            root = transform;
            var sw = Stopwatch.StartNew();
            md = MapData.Load(Resources.Load<TextAsset>("Data/mapdata").text);
            cfg = GameConfig.Load(Resources.Load<TextAsset>("Data/config").text);
            layout = new Layout(md, cfg);
            long tLayout = sw.ElapsedMilliseconds;
            colliders = new Colliders();
            city = City.Build(layout, colliders, md, cfg, transform);
            long tCity = sw.ElapsedMilliseconds - tLayout;
            SetupEnvironment();

            // The player at Majestic bus stand, on the footpath.
            var spawn = FootpathNear(md.SPAWN[0], md.SPAWN[1]);
            player = new Player(this, spawn.x, spawn.z) { heading = Math.PI, y = GameConfig.CURB_H };
            ParkVehicles(spawn);
            signals = new Signals(layout, root, city.materials);
            traffic = new Traffic(layout, signals);
            streetLife = new StreetLife(layout, colliders, signals, cfg, root, city.materials);
            traffic.Prewarm(150, hour, this);
            input = new GameInput();
            hud = new UI.Hud(layout, city.pois);
            hud.SetMoney(1000, true); // START_MONEY
            var cam = Camera.main;
            cam.farClipPlane = 1400; cam.nearClipPlane = 0.2f; cam.fieldOfView = 62;
            rig = new CameraRig(cam) { yaw = 0 };
            if (freeCam && cam.GetComponent<FreeCamera>() == null) cam.gameObject.AddComponent<FreeCamera>();
            Debug.Log($"[Game] Layout {tLayout} ms, city {tCity} ms, total {sw.ElapsedMilliseconds} ms: {layout.blocks.Count} blocks, {city.trees.Count} trees, " +
                      $"{city.lamps.Count} lamps, {city.tanks.Count} tanks, {colliders.all.Count} colliders, {free.Count} parked vehicles");
        }

        // The day/night cycle and the monsoon (environment.js).
        void SetupEnvironment()
        {
            env = new Systems.Environment(layout, root, city.materials);
            audio = GameAudio.Create(md);
            env.onThunder = d => audio.Thunder(d, 0.6 + rnd.NextDouble() * 0.4);
        }

        // A point on a footpath near a place (footpathNear in main.js).
        public (double x, double z) FootpathNear(double x, double z)
        {
            for (double r = 0; r < 120; r += 2)
                for (int k = 0; k < 12; k++)
                {
                    double a = k / 12.0 * Math.PI * 2, px = x + Math.Cos(a) * r, pz = z + Math.Sin(a) * r;
                    var b = layout.BlockContaining(px, pz);
                    if (b != null && !b.island && !colliders.PointBlocked(px, pz, 1) && colliders.ResolveCircle(px, pz, 1.2, GameConfig.CURB_H) == null) return (px, pz);
                }
            return (x, z);
        }

        public Vehicle Park(string type, double x, double z, double heading)
        {
            var def = ModelLibrary.Pick(type, rnd.NextDouble);
            var v = new Vehicle(type, def.spec, x, z, heading, rnd.NextDouble);
            var hit = colliders.ResolveCircle(v.x, v.z, v.radius + 0.2, 0);
            if (hit != null) { v.x = hit.Value.x; v.z = hit.Value.z; }
            v.y = layout.GroundHeight(v.x, v.z, null);
            new VehicleView(v, ModelLibrary.BuildVehicle(type, rnd.NextDouble, def), root);
            free.Add(v);
            return v;
        }

        // Footpath parking: a spot t (0..1) along edge k of a block, 2 m in from the kerb.
        static (double x, double z, double heading) KerbSpot(Block b, int k, double t, double inset = 2.2)
        {
            var P = b.poly; var a = P[k % P.Count]; var c = P[(k + 1) % P.Count];
            double x = a[0] + (c[0] - a[0]) * t, z = a[1] + (c[1] - a[1]) * t;
            double dx = b.cx - x, dz = b.cz - z, l = Math.Sqrt(dx * dx + dz * dz); if (l == 0) l = 1;
            return (x + dx / l * inset, z + dz / l * inset, Math.Atan2(c[0] - a[0], c[1] - a[1]));
        }

        void ParkVehicles((double x, double z) spawn)
        {
            // A scooter, a bike and an auto waiting at the start.
            var h = layout.EdgeAt(spawn.x, spawn.z);
            double ux = 1, uz = 0;
            if (h != null) { var e = h.Value.e; ux = (e.b.x - e.a.x) / e.len; uz = (e.b.z - e.a.z) / e.len; }
            double heading = Math.Atan2(ux, uz);
            foreach (var (type, d) in new[] { ("scooter", 3.0), ("bike", 6.0), ("auto", 10.0) })
            {
                var p = FootpathNear(spawn.x + ux * d, spawn.z + uz * d);
                Park(type, p.x, p.z, heading);
            }
            // More scattered around town, denser in the CBD.
            string[] types = { "scooter", "scooter", "bike", "sportBike", "auto", "hatch", "sedan", "taxi", "suv", "delivery" };
            var r = new Mulberry32(99);
            foreach (var b in layout.blocks)
            {
                if (b.edge || b.zone == "lake" || b.zone == "park" || b.zone == "industrial" || b.zone == "landmark" || b.zone == "rural") continue;
                bool cbd = Math.Sqrt((b.cx - md.CBD.x) * (b.cx - md.CBD.x) + (b.cz - md.CBD.z) * (b.cz - md.CBD.z)) < md.CBD.r;
                if (r.Next() > (cbd ? 0.3 : 0.06)) continue;
                int k = (int)Math.Floor(r.Next() * b.poly.Count);
                if (b.edgeWidths[k] == 0) continue;
                var p = KerbSpot(b, k, 0.3 + r.Next() * 0.4);
                if (colliders.PointBlocked(p.x, p.z, 1)) continue;
                Park(types[(int)Math.Floor(r.Next() * types.Length)], p.x, p.z, p.heading);
            }
            // Lorries and mini trucks outside the Peenya factories.
            for (int i = 0; i < city.pois.industrial.Count && i < 14 * 4; i += 4)
            {
                var p = city.pois.industrial[i];
                Park(r.Next() < 0.6 ? "lorry" : "miniTruck", p.x, p.z, p.heading);
            }
        }

        void Update()
        {
            input.Poll();
            if (input.Hit("Mouse0") && !input.locked && !freeCam && !hud.MapOpen) input.Lock(true);
            if (input.Hit("KeyM")) { bool open = hud.ToggleMap(); if (open) input.Lock(false); }
            if (input.Hit("Escape")) input.Lock(false);
            // K brings on (or stops) the rain; T speeds the clock up 30× (debug keys in main.js).
            if (input.Hit("KeyK")) { env.SetRain(!env.Raining); Say(env.Raining ? "Dark clouds roll in over Bengaluru…" : "The rain eases off.", 2.5); }
            if (input.Hit("KeyR")) { radioOn = !radioOn; Say(radioOn ? "Radio on" : "Radio off", 1.2); audio.Radio(radioOn && player.vehicle != null); }
            if (input.Hit("KeyT")) { env.timeScale = env.timeScale > 1 ? 1 : 30; Say(env.timeScale > 1 ? "Time ×30" : "Time normal", 1.5); }
            Tick(Math.Min(Time.deltaTime, 1.0 / 20));
        }

        // Advance the simulation n frames of dt without waiting for rendering, as
        // window.__game.step(n) does in the web game (the automated tests drive it this way).
        public void Step(int n, double dt = 1.0 / 60)
        {
            foreach (var v in input.virtualHit) input.pressed.Add(v);
            input.virtualHit.Clear();
            for (int k = 0; k < n; k++) { Tick(dt); input.pressed.Clear(); }
        }

        void Tick(double dt)
        {
            elapsed += dt;

            vehicles.Clear();
            foreach (var a in traffic.agents) vehicles.Add(a.v);
            vehicles.AddRange(free);

            if (!freeCam) player.Update(dt, input, rig.yaw, this);

            var pv = player.vehicle;
            if (pv != null && !free.Contains(pv)) free.Add(pv);
            var focus = player.Pos;
            foreach (var v in free)
            {
                if (v != pv && (v.Speed > 0.05 || Math.Abs(v.angVel) > 0.02)) v.Update(dt, null, this);
                var view = (VehicleView)v.view;
                view.SetVisible(Math.Abs(v.x - focus.x) < 300 && Math.Abs(v.z - focus.z) < 300);
                if (view.Go.activeSelf) view.Sync(dt);
            }
            // Wrecks from traffic crashes are tidied away once you're well clear of them.
            for (int i = free.Count - 1; i >= 0; i--)
            {
                var v = free[i];
                if (v.temp && v != pv && (Math.Abs(v.x - focus.x) > 340 || Math.Abs(v.z - focus.z) > 340)) { free.RemoveAt(i); traffic.Recycle(v); }
            }
            ResolveVehicleContacts();
            // What traffic must not drive into: the player, and vehicles as their body circles.
            obstacles.Clear();
            void VehObstacles(Vehicle v, bool isPlayer)
            {
                foreach (var c in v.Circles(new List<Circle>())) obstacles.Add(new Obstacle { x = c.x, z = c.z, r = c.r, y = v.y, isPlayer = isPlayer, parked = !isPlayer, owner = v });
            }
            if (pv != null) VehObstacles(pv, true);
            else if (player.y < 0.05) obstacles.Add(new Obstacle { x = player.x, z = player.z, r = player.r, y = player.y, isPlayer = true, owner = player });
            foreach (var v in free) if (v != pv && Math.Abs(v.x - focus.x) < 450 && Math.Abs(v.z - focus.z) < 450) VehObstacles(v, false);
            streetLife.CollectObstacles(obstacles);
            signals.Update(dt, focus.x, focus.z);
            traffic.Update(dt, this);
            streetLife.Update(dt, this);
            if (!freeCam) rig.Update(dt, input, player, colliders);
            env.Update(dt, focus.x, focus.z, pv, rig.camera);
            UpdateHud(dt);
            if (player.vehicle != radioVehicle) { radioVehicle = player.vehicle; audio.Radio(radioVehicle != null && radioOn); }
            audio.SetRain(env.rain);
            audio.Engine(player.vehicle, dt);
            audio.Tick(dt, rig.camera, player, vehicles, streetLife, env, layout);
        }

        static readonly UI.MapMarker[] NoMarkers = new UI.MapMarker[0];

        void UpdateHud(double dt)
        {
            var pv = player.vehicle;
            if (pv != hudVehicle && !player.InTransition)
            {
                if (pv != null) hud.VehicleEntered(pv); else hud.VehicleExited();
                hudVehicle = pv;
            }
            // What F (or H) would do here (main.js).
            if (pv == null && !player.InTransition)
            {
                Vehicle near = null; double nd = 0;
                foreach (var v in vehicles)
                {
                    double d = Math.Sqrt((v.x - player.x) * (v.x - player.x) + (v.z - player.z) * (v.z - player.z)) - v.spec.length / 2;
                    if (d < 2.2 && Math.Abs(v.y - player.y) < 2 && (near == null || d < nd)) { near = v; nd = d; }
                }
                hud.Prompt(near != null ? (near.driver == "ai" || near.driver == "police" ? $"F  \"Borrow\" the {near.spec.label}" : $"F  Get in the {near.spec.label}") : "");
            }
            else hud.Prompt(pv != null && pv.Speed <= 8 ? (pv.spec.police || pv.spec.siren ? "F  Get out  ·  G  Siren" : "F  Get out") : "");
            hud.Update(dt, player, rig.yaw, NoMarkers);
            hud.SetClock(env.ClockString(), env.rain > 0.6 ? "☂ Monsoon" : env.rain > 0.1 ? "☂ Rain" : env.night > 0.5 ? "☾ Clear" : "☀ Clear");
        }

        // ---------- Vehicle-vehicle contacts (resolveVehicleContacts in main.js) ----------
        readonly List<Circle> ca = new List<Circle>(), cb = new List<Circle>();
        void ResolveVehicleContacts()
        {
            foreach (var a in free.ToArray())
            {
                if (a.Speed < 0.05 && a != player.vehicle) continue;
                foreach (var b in vehicles)
                {
                    if (a == b) continue;
                    double reach = (a.spec.length + b.spec.length) / 2 + 1;
                    if (Math.Abs(a.x - b.x) > reach || Math.Abs(a.z - b.z) > reach || Math.Abs(a.y - b.y) > 2) continue;
                    a.Circles(ca); b.Circles(cb);
                    for (int i = 0; i < ca.Count; i++)
                        for (int j = 0; j < cb.Count; j++)
                        {
                            var c1 = ca[i]; var c2 = cb[j];
                            double nx = c1.x - c2.x, nz = c1.z - c2.z, d = Math.Sqrt(nx * nx + nz * nz), min = c1.r + c2.r;
                            if (d >= min || d < 1e-5) continue;
                            nx /= d; nz /= d;
                            double pen = min - d;
                            // Contact point and its offset from each centre of mass; relative velocity there.
                            double cx = c2.x + nx * c2.r, cz = c2.z + nz * c2.r;
                            double pax = cx - a.x, paz = cz - a.z, pbx = cx - b.x, pbz = cz - b.z;
                            double avx = a.vx + a.angVel * paz, avz = a.vz - a.angVel * pax;
                            double bvx = b.vx + b.angVel * pbz, bvz = b.vz - b.angVel * pbx;
                            double vn = (avx - bvx) * nx + (avz - bvz) * nz;
                            double ta = Math.Pow(paz * nx - pax * nz, 2) / a.inertia, tb = Math.Pow(pbz * nx - pbx * nz, 2) / b.inertia;
                            double ia = 1 / a.mass, ib = 1 / b.mass;
                            // Momentum shared by mass: a bus that clips a scooter barely notices; the scooter flies.
                            double jj = vn < 0 ? -1.25 * vn / (ia + ib + ta + tb) : 0;
                            if (b.driver == "ai")
                            {
                                // Traffic is on rails until something knocks it hard enough to lose control.
                                var agent = traffic.FindAgent(b);
                                double dvB = jj * ib;
                                bool loses = agent != null && !Traffic.HEAVY.Contains(b.type) && (dvB > 4 || (b.spec.twoWheeler && dvB > 2) || (a.mass > 2.5 * b.mass && -vn > 1.5));
                                a.x += nx * pen * (loses ? ia / (ia + ib) : 1); a.z += nz * pen * (loses ? ia / (ia + ib) : 1);
                                if (vn < 0) a.ApplyImpulse(nx * jj, nz * jj, pax, paz);
                                if (loses)
                                {
                                    traffic.Release(agent);
                                    b.x -= nx * pen * ib / (ia + ib); b.z -= nz * pen * ib / (ia + ib);
                                    b.ApplyImpulse(-nx * jj, -nz * jj, pbx, pbz);
                                    if (b.spec.twoWheeler) ThrowRider(b, a.x, a.z, -nx * Math.Min(9, 3 + dvB), -nz * Math.Min(9, 3 + dvB));
                                    b.temp = true;
                                    free.Add(b);
                                }
                                else if (agent != null)
                                {
                                    agent.stunned = 2;
                                    if (a.driver == "player" && -vn > 3 && rnd.NextDouble() < 0.5) Say(cfg.LINES["bumped"][rnd.Next(cfg.LINES["bumped"].Count)], 2.5);
                                }
                            }
                            else
                            {
                                a.x += nx * pen * ia / (ia + ib); a.z += nz * pen * ia / (ia + ib);
                                b.x -= nx * pen * ib / (ia + ib); b.z -= nz * pen * ib / (ia + ib);
                                if (vn < 0) { a.ApplyImpulse(nx * jj, nz * jj, pax, paz); b.ApplyImpulse(-nx * jj, -nz * jj, pbx, pbz); }
                            }
                            if (-vn > 3) audio.Thud(Math.Min(1, -vn / 15));
                            if (-vn > 4) audio.Crunch(Math.Min(1, -vn / 18));
                            if (-vn > 2)
                            {
                                double share(double m1, double m2) => 2 * m2 / (m1 + m2);
                                a.TakeDamage(Vehicle.DamageFromSpeed(-vn * Math.Min(1.6, share(a.mass, b.mass)) * 0.75), cx, cz);
                                b.TakeDamage(Vehicle.DamageFromSpeed(-vn * Math.Min(1.6, share(b.mass, a.mass)) * 0.75), cx, cz);
                            }
                            if (-vn > 3 && (a.driver == "player" || b.driver == "player")) Shake(Math.Min(0.5, jj * ia / 20));
                            a.Circles(ca); b.Circles(cb);
                        }
                }
            }
        }
    }
}
