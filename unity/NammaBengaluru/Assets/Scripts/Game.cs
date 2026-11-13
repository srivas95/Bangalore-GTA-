// Start-up and the main loop (port of init() and update() in src/main.js, built up phase by
// phase; see unity/PORTING.md). Builds the world from the data exported from the web game, puts
// the player at Majestic with a scooter, a bike and an auto waiting, parks vehicles around town,
// and runs the player, free vehicles, their contacts and the camera.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
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
        public Particles particles;
        public Police police;
        public Gangs gangs;
        public Pickups pickups;
        public Gps gps;
        public Missions missions;
        public Garages garages;
        public AutoDuty autoDuty;
        public Rides rides;
        public MetroWorld metro;
        public MetroRide metroRide;
        public Story story;
        public Settings settings;
        public LiveWeather liveWeather;
        bool started, paused = true;
        double trafficMul = 1;
        SettingsValues beforeLow;
        UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset urp;
        float urpScale, urpShadowDist;
        MetroRide.Entrance entranceNear;
        Rides.Shelter shelterNear;
        public int money = 1000; // START_MONEY
        public Halos halos;
        public StreetProps props;
        public StoreDecor decor; // (Asset Store pack decoration, when the build has it)
        public readonly List<Vehicle> dynamic = new List<Vehicle>(); // free vehicles and the police
        List<Place> policeStations, hospitals;
        double screenT, rowdyT = 5;
        List<Place> pending;
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
        public double TrafficScale => ((hour >= 8 && hour < 11) || (hour >= 17 && hour < 21) ? 1.3 : hour >= 23 || hour < 5 ? 0.4 : 1) * trafficMul; // rush hour is real
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
                var hd = two && r() < 0.85 ? ModelLibrary.HumanNamed("helmet" + (int)Math.Floor(r() * 4)) : ModelLibrary.Ped((int)Math.Floor(r() * 48));
                view.SetRider(new Human(hd, r));
            }
            return v;
        }

        // The player takes a vehicle out of traffic: its driver bolts (not off a bus).
        public void TakeOver(Vehicle v)
        {
            if (v.driver == "police") police.VehicleStolen(v);
            else { var agent = traffic.FindAgent(v); if (agent != null) traffic.Release(agent); }
            var rider = ((VehicleView)v.view).RemoveRider();
            if (!free.Contains(v)) free.Add(v);
            bool bus = v.type == "bus" || v.type == "schoolBus" || v.type == "ksrtc" || v.type == "cityBus";
            if (!bus)
            {
                streetLife.SpawnFleeing(v.x - Math.Cos(v.heading) * 1.5, v.z + Math.Sin(v.heading) * 1.5, player.x, player.z, rider?.rig.def);
                var lines = cfg.LINES["carjacked"];
                Say($"\"{lines[rnd.Next(lines.Count)]}\"", 3);
                audio.Voice(rnd.NextDouble() < 0.5 ? "vo_hi_chor" : "vo_kn_nanage_sahaya_madi", v.x, v.z, gender: rider != null && rider.female ? "f" : "m");
            }
            else Say("Conductor: \"Ticket ticket! ...oh. You're DRIVING it?\"", 3);
            Crime(v.spec.police ? "Stealing a Hoysala" : "Vehicle theft", v.x, v.z, v.spec.police ? 2 : 1);
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
            // World detail is fixed at build time. If the last start never got as far as drawing the
            // city (a phone running out of memory kills the app), step down a level (main.js).
            settings = new Settings();
            string level = settings.DetailLevel;
            if (PlayerPrefs.GetString(BOOT_KEY, "") == "starting" && level != "min")
            {
                level = level == "full" ? "lite" : "min";
                fellBack = true;
                settings.Preset("low");
                settings.Set("detail", level);
            }
            PlayerPrefs.SetString(BOOT_KEY, "starting");
            PlayerPrefs.Save();
            Detail.Set(level);
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
            // Majestic: crowds waiting on the bus station's platforms (main.js).
            foreach (var lm in city.pois.landmarks)
                if (lm.crowds != null) foreach (var c in lm.crowds) streetLife.stalls.Add(new Stall { x = c.x, z = c.z, n = c.n, spread = c.spread, face = c.face });
            traffic.Prewarm(150, hour, this);
            input = new GameInput();
            hud = new UI.Hud(layout, city.pois);
            hud.SetMoney(money, true); // START_MONEY
            particles = new Particles();
            VehicleView.particles = particles;
            VehicleView.explode = v => Explode(v.x, v.y + 0.8, v.z, v);
            police = new Police(layout, colliders);
            gangs = new Gangs(layout, colliders);
            pickups = new Pickups(root);
            policeStations = md.POLICE_STATIONS.Select(p => { var f = FootpathNear(p.x, p.z); return new Place { name = p.name, x = f.x, z = f.z }; }).ToList();
            hospitals = md.HOSPITALS.Select(p => { var f = FootpathNear(p.x, p.z); return new Place { name = p.name, x = f.x, z = f.z }; }).ToList();
            PlacePickups();
            TextSigns.Build(city.signs, root);
            gps = new Gps(layout);
            missions = new Missions(this, root);
            garages = new Garages(this, root);
            autoDuty = new AutoDuty(this, root);
            rides = new Rides(this, root);
            metro = Metro.Build(layout, md, colliders, root);
            metroRide = new MetroRide(this, metro);
            // Baked ground shading next to buildings, walls, trees and under the metro viaducts.
            halos = new Halos(city.lampHeads);
            props = new StreetProps(city.props, Detail.lite);
            decor = StoreDecor.TryBuild(layout, colliders);
            if (decor != null) Debug.Log($"[Game] Store decoration: {decor.count} pieces");
            GroundShading.Bake(layout.world, colliders.all, city.trees, GroundShading.MetroStrips(metro.routes), Detail.lite ? 3 : 2.5);
            story = new Story(this, root);
            // Settings, the pause screen and the touch controls.
            liveWeather = new LiveWeather(env, settings, this);
            hud.BuildMenus(settings);
            hud.touchInput = input;
            hud.onPlay = Play;
            hud.onPause = Pause;
            settings.onReset = () => { story.Reset(); money = 1000; hud.SetMoney(money, true); garages.Reset(); };
            urp = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline as UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset;
            if (urp != null) { urpScale = urp.renderScale; urpShadowDist = urp.shadowDistance; }
            settings.OnChange(ApplySettings);
            hud.ShowPause(true, false);
            city.rail.hitByTrain = (t, nx, nz) =>
            {
                if (player.vehicle != null || player.knock > 0) return;
                player.Damage(70, player.x - nx, player.z - nz, this);
                player.knock = 2; player.kx = nx * 8; player.kz = nz * 8;
                Say("Indian Railways always wins.", 3);
            };
            hud.onMapTap = (x, z, slop) =>
            {
                if (gps.target != null && Math.Sqrt((gps.target.Value.x - x) * (gps.target.Value.x - x) + (gps.target.Value.z - z) * (gps.target.Value.z - z)) < Math.Max(25, slop)) { gps.Clear(); Say("Waypoint cleared", 1.5); return; }
                gps.Set(x, z);
                Say("Waypoint set. Follow the purple line.", 2);
            };
            var cam = Camera.main;
            cam.farClipPlane = 1400; cam.nearClipPlane = 0.2f; cam.fieldOfView = 62;
            rig = new CameraRig(cam) { yaw = 0 };
            ApplySettings(settings.values);
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

        // A particular model in a particular paint (garage stock, and the red start scooter).
        public Vehicle ParkModel(string type, string model, int color, double x, double z, double heading)
        {
            var def = ModelLibrary.GarageModel(type, model) ?? ModelLibrary.Pick(type, rnd.NextDouble);
            var v = new Vehicle(type, def.spec, x, z, heading, rnd.NextDouble);
            v.y = layout.GroundHeight(v.x, v.z, null);
            var view = new VehicleView(v, ModelLibrary.BuildVehicle(type, rnd.NextDouble, def), root);
            if (def.garage && color != 0xb01c22) view.Recolor(color);
            free.Add(v);
            return v;
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
                // The scooter you start with is a red one (main.js: { color: 0xb01c22 }).
                if (type == "scooter") ParkModel("scooter", "activa", 0xb01c22, p.x, p.z, heading);
                else Park(type, p.x, p.z, heading);
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
            // Majestic: BMTC buses nosed into the bus station's bays.
            foreach (var lm in city.pois.landmarks)
                if (lm.busBays != null) for (int k = 0; k < lm.busBays.Count; k++) if (k % 3 == 1) Park("bus", lm.busBays[k].x, lm.busBays[k].z, lm.busBays[k].heading);
        }

        void Update()
        {
            input.Poll();
            if (paused)
            {
                // The pause screen: Enter (or the Play button) plays; Esc closes the settings first.
                if (input.Hit("Enter")) Play();
                if (input.Hit("Escape")) hud.ShowSettings(false);
                return;
            }
            bool touch = settings.TouchEnabled;
            if (input.Hit("Mouse0") && !input.locked && !freeCam && !hud.MapOpen && !touch) input.Lock(true);
            if (input.Hit("KeyM")) { bool open = hud.ToggleMap(); if (open) input.Lock(false); else if (!touch) input.Lock(true); }
            if (input.Hit("Escape")) { if (hud.MapOpen) hud.ToggleMap(); else { Pause(); return; } }
            // K brings on (or stops) the rain; T speeds the clock up 30×; O is performance mode (main.js).
            if (input.Hit("KeyK")) { liveWeather.paused = true; liveWeather.Release(); env.SetRain(!env.Raining); Say(env.Raining ? "Dark clouds roll in over Bengaluru…" : "The rain eases off.", 2.5); }
            if (input.Hit("KeyR")) { radioOn = !radioOn; Say(radioOn ? "Radio on" : "Radio off", 1.2); audio.Radio(radioOn && player.vehicle != null); }
            if (input.Hit("KeyT") && !metroRide.Active && !rides.Active) { env.timeScale = env.timeScale > 1 ? 1 : 30; Say(env.timeScale > 1 ? "Time ×30" : "Time normal", 1.5); }
            if (input.Hit("KeyO"))
            {
                if (settings.values.quality == "low" && beforeLow != null) { settings.Replace(beforeLow); beforeLow = null; Say("Performance mode OFF", 2); }
                else { beforeLow = settings.values.Clone(); settings.Preset("low"); Say("Performance mode ON (Low preset; see Settings)", 2.5); }
            }
            liveWeather.Update(Time.deltaTime);
            Tick(Math.Min(Time.deltaTime, 1.0 / 20));
        }

        public void Play()
        {
            if (!started && fellBack) Say($"The last start ran out of memory, so the city is now built with {(Detail.min ? "minimum" : "lite")} detail (Settings → World detail).", 6);
            started = true; paused = false;
            hud.ShowPause(false, true);
            if (!settings.TouchEnabled && !freeCam) input.Lock(true);
        }

        public void Pause()
        {
            paused = true;
            input.Lock(false);
            hud.ShowPause(true, started);
        }

        // Settings (settings.js onChange in main.js).
        // A wreck left lying in the road is pushed to the side by passers-by once it has come to
        // rest, so one crash doesn't stop a junction for as long as you're around. Straight out
        // from the road to just past the kerb, at a walking pace. True while it's being moved.
        bool ClearWreck(Vehicle v, double dt)
        {
            if (v.cleared || v.driver != null || v.y > 1) return false;
            if (v.clearTo == null)
            {
                if (v.Speed > 0.3) { v.restT = 0; return false; }
                if ((v.restT += dt) < 6) return false;
                if (layout.RoadAt(v.x, v.z) == null) { v.cleared = true; return false; } // not on a carriageway
                // The nearest spot clear of every carriageway (in a junction, one road's kerb can be
                // another road's lane), with room for the vehicle and nothing built there.
                double half = v.spec.width / 2 + 0.4;
                (double x, double z)? best = null;
                for (int d = 2; d <= 16 && best == null; d++)
                    for (int k = 0; k < 16; k++)
                    {
                        double a = k / 16.0 * Math.PI * 2, x = v.x + Math.Cos(a) * d, z = v.z + Math.Sin(a) * d;
                        if (layout.RoadAt(x, z) != null || layout.RoadAt(x + Math.Cos(a) * -half, z + Math.Sin(a) * -half) != null || colliders.PointBlocked(x, z, 1)) continue;
                        best = (x, z); break;
                    }
                if (best == null) { v.cleared = true; return false; }
                v.clearTo = best;
            }
            var to = v.clearTo.Value;
            double dx = to.x - v.x, dz = to.z - v.z, dist = Math.Sqrt(dx * dx + dz * dz), step = Math.Min(dist, 2 * dt);
            if (dist < 0.05) { v.clearTo = null; v.cleared = true; return false; }
            v.x += dx / dist * step; v.z += dz / dist * step;
            v.vx = v.vz = v.angVel = 0;
            var view = (VehicleView)v.view;
            view.SetVisible(true);
            view.Sync(dt);
            return true;
        }

        // ---------- Dynamic resolution (main.js) ----------
        // When frames take clearly longer than the display's refresh interval for a while, render
        // fewer pixels (down to 80% of the chosen resolution: lower looked smeared when driving);
        // creep back up when there's headroom again.
        double dynScale = 1, frameAvg = 1 / 60.0, frameTarget = 1 / 60.0, winMin = 1, winT, resT, slowT, fastT;
        bool dynRes = true;

        void AdaptResolution(double raw)
        {
            if (!dynRes || paused || raw > 0.25 || raw <= 0 || urp == null) return;
            frameAvg += (raw - frameAvg) * 0.05;
            // Aim for the display's refresh rate (the shortest frames seen in a 5 s window), but
            // never above 60 fps.
            winMin = Math.Min(winMin, raw); winT += raw;
            if (winT > 5) { frameTarget = Math.Min(1 / 50.0, Math.Max(1 / 61.0, winMin)); winMin = 1; winT = 0; }
            resT -= raw;
            if (frameAvg > frameTarget * 1.45) { slowT += raw; fastT = 0; } else if (frameAvg < frameTarget * 1.12) { fastT += raw; slowT = 0; } else { slowT = Math.Max(0, slowT - raw); fastT = 0; }
            if (resT > 0) return;
            if (slowT > 2.5 && dynScale > 0.8) { dynScale = Math.Max(0.8, dynScale - 0.1); urp.renderScale = (float)(settings.values.resScale * dynScale); resT = 4; slowT = 0; }
            else if (fastT > 5 && dynScale < 1) { dynScale = Math.Min(1, dynScale + 0.1); urp.renderScale = (float)(settings.values.resScale * dynScale); resT = 4; fastT = 0; }
        }

        void ApplySettings(SettingsValues v)
        {
            if (urp != null)
            {
                dynRes = v.dynamicRes;
                if (!dynRes) dynScale = 1;
                urp.renderScale = (float)(v.resScale * dynScale);
                urp.shadowDistance = v.shadows == "near" ? 60 : urpShadowDist;
            }
            var cam = Camera.main;
            if (cam != null)
            {
                var data = cam.GetComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>();
                if (data != null) data.renderShadows = v.shadows != "off";
                cam.farClipPlane = 1400 * v.drawDist;
            }
            var vol = FindAnyObjectByType<UnityEngine.Rendering.Volume>();
            if (vol != null)
            {
                if (!vol.profile.TryGet(out UnityEngine.Rendering.Universal.Bloom bloom)) bloom = vol.profile.Add<UnityEngine.Rendering.Universal.Bloom>(true);
                bloom.active = v.bloom;
            }
            trafficMul = v.traffic;
            streetLife.walkerTarget = (int)Math.Round(110 * v.peds);
            if (rig != null) { rig.sens = v.sensitivity; rig.invert = v.invertY; }
            audio.volume = v.volume; AudioListener.volume = 0.9f * v.volume;
            if (!v.liveWeather) liveWeather.Release(); else liveWeather.Restart();
        }

        // The URP asset is project data: put back what the settings changed.
        void OnDestroy()
        {
            if (urp != null) { urp.renderScale = urpScale; urp.shadowDistance = urpShadowDist; }
            halos?.Destroy();
            props?.Destroy();
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
            foreach (var u in police.units) if (!free.Contains(u.v)) vehicles.Add(u.v);

            // Busted or wasted: the screen holds for a few seconds, then you're back on your feet.
            if (player.dead)
            {
                screenT -= dt;
                if (screenT <= 0 && pending != null) Respawn();
            }

            // Namma Metro: entrances on the street, and the ride itself.
            entranceNear = player.vehicle == null && pending == null && !metroRide.Active && !rides.Active ? metroRide.NearEntrance(player.Pos) : null;
            if (entranceNear != null && input.Hit("KeyE")) { input.pressed.Remove("KeyE"); metroRide.Open(entranceNear); }
            // BMTC shelters (E) and waving down an auto (H), on foot.
            bool onFoot = player.vehicle == null && pending == null && !rides.Active && !metroRide.Active && !player.InTransition && !garages.menu;
            shelterNear = onFoot && entranceNear == null && !garages.nearStall ? rides.NearShelter(player.Pos) : null;
            if (shelterNear != null && input.Hit("KeyE")) { input.pressed.Remove("KeyE"); rides.StopMenu(shelterNear); }
            if (onFoot && input.Hit("KeyH")) rides.HailAuto();
            // A ride's menus and boarding, or a garage menu, take the keys; otherwise you play on.
            Vehicle rideCam = null;
            bool metroCam = false;
            if (metroRide.Active) metroCam = metroRide.Update(dt, input, rig.camera);
            else if (rides.Blocking) rideCam = rides.Update(dt, input);
            else if (garages.menu) garages.Update(dt, input);
            else
            {
                garages.Update(dt, input);
                if (!freeCam) player.Update(dt, input, rig.yaw, this);
                if (rides.Active) rideCam = rides.Update(dt, input);
            }

            var pv = player.vehicle;
            if (pv != null && !free.Contains(pv)) free.Add(pv);
            var focus = player.Pos;
            foreach (var v in free)
            {
                if (v != pv && v.temp && ClearWreck(v, dt)) continue;
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
            dynamic.Clear(); dynamic.AddRange(free);
            foreach (var u in police.units) if (!dynamic.Contains(u.v)) dynamic.Add(u.v);
            ResolveVehicleContacts();
            // What traffic must not drive into: the player, and vehicles as their body circles.
            obstacles.Clear();
            void VehObstacles(Vehicle v, bool isPlayer, bool isCop = false)
            {
                foreach (var c in v.Circles(new List<Circle>())) obstacles.Add(new Obstacle { x = c.x, z = c.z, r = c.r, y = v.y, isPlayer = isPlayer, isCop = isCop, parked = !isPlayer && !isCop, owner = v });
            }
            if (pv != null) VehObstacles(pv, true);
            else if (player.y < 0.05 && !rides.Carrying) obstacles.Add(new Obstacle { x = player.x, z = player.z, r = player.r, y = player.y, isPlayer = true, owner = player });
            foreach (var v in free) if (v != pv && Math.Abs(v.x - focus.x) < 450 && Math.Abs(v.z - focus.z) < 450) VehObstacles(v, false);
            foreach (var u in police.units) if (u.v != pv && !free.Contains(u.v)) VehObstacles(u.v, false, true);
            foreach (var c in police.cops) obstacles.Add(c);
            streetLife.CollectObstacles(obstacles);
            signals.Update(dt, focus.x, focus.z);
            traffic.Update(dt, this);
            streetLife.Update(dt, this);
            police.Update(dt, this);
            gangs.Update(dt, this);
            pickups.Update(dt, this);
            SpawnRowdies(dt);
            missions.busy = rides.Active || metroRide.Active;
            missions.Update(dt, input, player);
            autoDuty.Update(dt, input, player);
            story.Update(dt, input);
            if (gps.Update(dt, player.Pos.x, player.Pos.z)) { Say("You have arrived.", 2.5); audio.Click(); }
            player.rigPitch = rig.pitch;
            if (!freeCam && !metroCam) rig.Update(dt, input, player, colliders, rideCam);
            metro.Update(dt, focus.x, focus.z);
            foreach (var a in city.anims) a.Update(dt);
            { var cp = Camera.main.transform.position; props.Update(dt, cp.x, -cp.z); }
            city.rail.Update(dt, focus.x, focus.z);
            hud.SetTunnel(metroRide.tunnel);
            env.Update(dt, focus.x, focus.z, pv, rig.camera);
            UpdateHud(dt);
            if (player.vehicle != radioVehicle) { radioVehicle = player.vehicle; audio.Radio(radioVehicle != null && radioOn); }
            audio.SetRain(env.rain);
            audio.Engine(player.vehicle, dt);
            audio.Tick(dt, rig.camera, player, vehicles, streetLife, env, layout);
            particles.Step(dt, rig.camera);
        }

        // (Renamed from "namma-bengaluru-boot": the first builds stopped during start-up for an
        // unrelated reason and left that flag set, which would wrongly drop the city to minimum detail.)
        const string BOOT_KEY = "namma-bengaluru-boot-2";
        bool fellBack, bootOk;

        void LateUpdate()
        {
            // The city got drawn: this start didn't run out of memory.
            if (!bootOk) { bootOk = true; PlayerPrefs.DeleteKey(BOOT_KEY); PlayerPrefs.Save(); }
            AdaptResolution(Time.unscaledDeltaTime);
            particles?.Draw();
            var cam = Camera.main;
            BlobShadows.Draw(cam);
            props?.Draw();
            decor?.Draw(cam);
            if (env != null) halos?.Draw(cam, env.night, signals);
        }

        // ---------- money, crime, gunfire, bullets, explosions (main.js) ----------
        public void AddMoney(int n) { money = Math.Max(0, money + n); hud.SetMoney(money); }

        public void Crime(string what, double x, double z, int stars) => police.Crime(what, x, z, stars, this);

        public void Gunfire(double x, double z, bool npc)
        {
            streetLife.Panic(x, z, 45);
            if (!npc) Crime("Firing a gun", x, z, 2);
        }

        // shooter: the NPC who fired, or null for the player.
        public void BulletHitAt(BulletHit hit, WeaponDef w, (double x, double y, double z) dir, Ped shooter)
        {
            bool byPlayer = shooter == null;
            double? sx = shooter?.x, sz = shooter?.z;
            if (hit.kind == "player")
            {
                particles.Burst("blood", hit.x, hit.y, hit.z, 6, 2, 0.4);
                player.Damage(w.dmg * (hit.head ? 0.55 : 0.32), sx, sz, this);
            }
            else if (hit.kind == "person")
            {
                var p = hit.person;
                double dmg = w.dmg * (hit.head ? 2 : 1);
                particles.Burst("blood", hit.x, hit.y, hit.z, 6, 2, 0.4);
                if (p is Cop c) { police.HitCop(c, dmg, dir.x, dir.z, true, true); if (byPlayer) Crime(c.dead ? "Killing a police officer" : "Shooting a police officer", c.x, c.z, c.dead ? 4 : 3); }
                else if (p is GangMember m) gangs.Hit(m, dmg, dir.x, dir.z, this, true, true);
                else { streetLife.Hit(p, dmg, dir.x, dir.z, this, true, true); if (byPlayer) Crime(p.dead ? "Murder" : "Shooting someone", p.x, p.z, p.dead ? 3 : 2); }
            }
            else if (hit.kind == "vehicle")
            {
                var v = hit.vehicle;
                v.TakeDamage(w.dmg * 0.2, hit.x, hit.z);
                particles.Burst("spark", hit.x, hit.y, hit.z, 6, 3, 0.6);
                audio.Crunch(0.15);
                if (v == player.vehicle && rnd.NextDouble() < 0.35) player.Damage(w.dmg * 0.2, sx, sz, this);
                if (byPlayer && v.driver == "police") Crime("Shooting at the police", v.x, v.z, 3);
            }
            else if (hit.kind == "wall") particles.Burst("spark", hit.x, hit.y, hit.z, 5, 2.5, 0.6);
            else particles.Burst("dust", hit.x, 0.1, hit.z, 4, 1.5, 0.8);
        }

        public void Explode(double x, double y, double z, Vehicle src)
        {
            particles.Burst("blast", x, y, z, 26, 7, 0.9);
            particles.Burst("fire", x, y, z, 30, 5, 1.2, 1.6);
            particles.Burst("spark", x, y, z, 40, 14, 1.0);
            for (int k = 0; k < 14; k++) particles.Emit("blackSmoke", x + (rnd.NextDouble() - 0.5) * 3, y + rnd.NextDouble() * 2, z + (rnd.NextDouble() - 0.5) * 3, 0, 2 + rnd.NextDouble() * 2, 0, 2.2);
            audio.Explosion(x, z);
            var pp = player.Pos;
            double pd = Math.Sqrt((pp.x - x) * (pp.x - x) + (pp.z - z) * (pp.z - z));
            rig.Shake(Math.Max(0, 1.2 - pd / 40));
            // Blast damage: the player, people, other vehicles.
            if (pd < 7)
            {
                double hurt = 95 * (1 - pd / 7);
                if (player.vehicle == src && src != null) player.Damage(120, x, z, this);
                else if (player.vehicle != null) player.Damage(hurt * 0.4, x, z, this);
                else { player.Damage(hurt, x, z, this); player.knock = 1.6; double a = Math.Atan2(player.x - x, player.z - z); player.kx = Math.Sin(a) * 9; player.kz = Math.Cos(a) * 9; }
            }
            foreach (var p in streetLife.peds.ToList())
            {
                double d = Math.Sqrt((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z));
                if (d < 8 && p.state != "down") streetLife.Knock(p, (p.x - x) / (d == 0 ? 1 : d) * 8, (p.z - z) / (d == 0 ? 1 : d) * 8);
                else if (d < 30) streetLife.Scare(p, x, z);
            }
            foreach (var v in vehicles)
            {
                if (v == src) continue;
                double d = Math.Sqrt((v.x - x) * (v.x - x) + (v.z - z) * (v.z - z));
                if (d > 9) continue;
                v.TakeDamage(70 * (1 - d / 9), x, z);
                if (v.driver != "ai") { double k = (1 - d / 9) * 9000 / v.mass; v.vx += (v.x - x) / (d == 0 ? 1 : d) * k; v.vz += (v.z - z) / (d == 0 ? 1 : d) * k; v.angVel += (rnd.NextDouble() - 0.5) * k * 0.4; }
            }
        }

        // ---------- busted / wasted ----------
        static Place NearestOf(List<Place> list, (double x, double z) p) => list.OrderBy(s => (s.x - p.x) * (s.x - p.x) + (s.z - p.z) * (s.z - p.z)).First();

        public void OnBusted()
        {
            if (pending != null) return;
            int fine = Math.Min(money, 100 + police.level * 150);
            AddMoney(-fine);
            hud.ShowScreen("BUSTED", $"The Hoysala crew fined you ₹{fine}. \"Next time, swalpa adjust maadi.\"", UI.Hud.CssColor(0x4a8ff0));
            audio.Sting(true);
            pending = policeStations;
            screenT = 4;
            player.dead = true;
        }

        public void OnPlayerDown()
        {
            if (pending != null) return;
            if (police.level > 0 && police.cops.Any(c => Math.Sqrt((c.x - player.x) * (c.x - player.x) + (c.z - player.z) * (c.z - player.z)) < 3)) { OnBusted(); return; }
            int bill = Math.Min(money, Math.Max(200, (int)Math.Round(money * 0.1)));
            AddMoney(-bill);
            hud.ShowScreen("WASTED", $"Hospital bill: ₹{bill}. Bengaluru is not for the faint-hearted.", UI.Hud.CssColor(0xe03a2a));
            audio.Sting(true);
            pending = hospitals;
            screenT = 4;
            player.dead = true;
        }

        // Repopulate the streets around a new location straight away (after a respawn, a skipped
        // ride or a metro trip).
        public void Reseed()
        {
            var p = player.Pos;
            elapsed = 0;
            traffic.edgeTimer = 0;
            foreach (var a in traffic.agents.ToList()) if (Math.Sqrt((a.v.x - p.x) * (a.v.x - p.x) + (a.v.z - p.z) * (a.v.z - p.z)) > traffic.radius && !a.keep) traffic.Despawn(a);
        }

        void Respawn()
        {
            var p = NearestOf(pending, player.Pos);
            bool hospital = pending == hospitals;
            if (player.vehicle != null) player.ExitVehicle(this, true);
            rides.Abort();
            player.Respawn(p.x, p.z, this);
            if (missions.job != null) missions.Fail("You missed the job.");
            if (story.IsActive) story.Fail(hospital ? "You were wasted." : "You were busted.");
            police.Reset(this);
            rig.first = true;
            Reseed();
            hud.HideScreen();
            hud.Toast(p.name, "Bengaluru");
            pending = null;
        }

        // ---------- weapons lying around, and rowdies (main.js) ----------
        // Bats in the parks, blades in the markets, machetes in the industrial yards, and a
        // couple of kattas if you know where to look.
        void PlacePickups()
        {
            int n = 0, ind = 0, mk = 0;
            foreach (var b in layout.blocks)
            {
                if (b.edge) continue;
                if (b.zone == "park" && n++ % 2 == 0) { var c = KerbSpot(b, n, 0.04, 1.8); pickups.Add(n % 4 == 0 ? "lathi" : "bat", c.x, c.z, GameConfig.CURB_H, 180); }
                if (b.zone == "market") { var c = KerbSpot(b, mk, 0.04, 1.8); pickups.Add(new[] { "knife", "chain", "sickle" }[mk++ % 3], c.x, c.z, GameConfig.CURB_H, 180); }
                if (b.zone == "industrial")
                {
                    var c = KerbSpot(b, ind, 0.04, 1.8);
                    string what = ind == 2 || ind == 9 ? "katta" : ind == 5 ? "ammo:katta" : ind % 3 == 0 ? "machete" : null;
                    if (what != null) pickups.Add(what, c.x, c.z, GameConfig.CURB_H, 240);
                    ind++;
                }
            }
            // One revolver, at the back of the Yeshwanthpur APMC yard.
            var g = md.Geo(13.0305, 77.5345);
            var apmc = FootpathNear(g[0], g[1]);
            pickups.Add("revolver", apmc.x, apmc.z, GameConfig.CURB_H, 300);
        }

        // Rowdies hang about the markets and yards after dark, and don't like being bothered.
        void SpawnRowdies(double dt)
        {
            rowdyT -= dt;
            if (rowdyT > 0) return;
            rowdyT = 20;
            bool night = hour >= 20 || hour < 5;
            int loose = gangs.members.Count(m => m.crew == null && !m.dead);
            if (loose >= (night ? 6 : 2)) return;
            var f = Focus;
            var blocks = layout.blocks.Where(b => (b.zone == "market" || b.zone == "industrial" || (night && b.zone == "mixed"))
                && Math.Sqrt((b.cx - f.x) * (b.cx - f.x) + (b.cz - f.z) * (b.cz - f.z)) < 220 && Math.Sqrt((b.cx - f.x) * (b.cx - f.x) + (b.cz - f.z) * (b.cz - f.z)) > 70).ToList();
            if (blocks.Count == 0) return;
            var bl = blocks[rnd.Next(blocks.Count)];
            var p = KerbSpot(bl, rnd.Next(bl.poly.Count), 0.2 + rnd.NextDouble() * 0.6, 2.5);
            int k = 2 + rnd.Next(2);
            for (int i = 0; i < k; i++) gangs.Spawn(this, p.x + rnd.NextDouble() * 1.5, p.z + i * 1.2, rnd.NextDouble() < 0.08 ? "katta" : null, name: "Rowdy");
        }

        readonly List<UI.MapMarker> markers = new List<UI.MapMarker>();

        void UpdateHud(double dt)
        {
            var pv = player.vehicle;
            if (pv != hudVehicle && !player.InTransition)
            {
                if (pv != null) hud.VehicleEntered(pv); else hud.VehicleExited();
                hudVehicle = pv;
            }
            // What F (or H) would do here (main.js).
            if (metroRide.Active || garages.menu || rides.Blocking) hud.Prompt("");
            else if (rides.Active) hud.Prompt("Q  Give up waiting");
            else if (garages.nearStall) { /* the garage set its own prompt */ }
            else if (entranceNear != null) hud.Prompt($"E  Namma Metro · {entranceNear.st.en}");
            else if (shelterNear != null) hud.Prompt($"E  BMTC bus stop · {shelterNear.name}");
            else if (pv == null && !player.InTransition)
            {
                Vehicle near = null; double nd = 0;
                foreach (var v in vehicles)
                {
                    double d = Math.Sqrt((v.x - player.x) * (v.x - player.x) + (v.z - player.z) * (v.z - player.z)) - v.spec.length / 2;
                    if (d < 2.2 && Math.Abs(v.y - player.y) < 2 && (near == null || d < nd)) { near = v; nd = d; }
                }
                hud.Prompt(near != null ? (near.driver == "ai" || near.driver == "police" ? $"F  \"Borrow\" the {near.spec.label}" : $"F  Get in the {near.spec.label}") : rides.Roadside(player.Pos) != null ? "H  Wave down an auto" : "");
            }
            else hud.Prompt(pv != null && pv.Speed <= 8 ? (pv.spec.police || pv.spec.siren ? "F  Get out  ·  G  Siren" : "F  Get out") : "");
            markers.Clear();
            markers.AddRange(missions.Markers);
            markers.AddRange(story.Markers);
            markers.AddRange(autoDuty.MapMarkers);
            if (pv == null && !rides.Active) markers.AddRange(rides.MapMarkers(player.x, player.z));
            if (gps.target != null) markers.Add(new UI.MapMarker { x = gps.target.Value.x, z = gps.target.Value.z, color = UI.Hud.CssColor(0xc050ff) });
            hud.route = gps.route; hud.routeLength = gps.length;
            foreach (var u in police.units) markers.Add(new UI.MapMarker { x = u.v.x, z = u.v.z, color = (int)(elapsed * 4) % 2 == 1 ? UI.Hud.CssColor(0xe02020) : UI.Hud.CssColor(0x2050ff) });
            hud.Update(dt, player, rig.yaw, markers);
            var w = Weapons.WEAPONS[player.weapon];
            hud.SetWeapon(w.name, player.clip.TryGetValue(player.weapon, out var cl) ? cl : 0, player.ammo.TryGetValue(player.weapon, out var am) ? am : 0, player.reloadT > 0, player.aiming, w.Gun);
            hud.SetClock(env.ClockString(), liveWeather.On ? LiveWeather.Describe(liveWeather.now) + " · live" : env.rain > 0.6 ? "☂ Monsoon" : env.rain > 0.1 ? "☂ Rain" : env.night > 0.5 ? "☾ Clear" : "☀ Clear");
            var w2 = Weapons.WEAPONS[player.weapon];
            hud.UpdateTouch(new UI.Hud.TouchContext
            {
                driving = player.vehicle != null, gun = w2.Gun, police = player.vehicle != null && (player.vehicle.spec.police || player.vehicle.spec.siren),
                use = entranceNear != null || shelterNear != null || story.IsActive || garages.nearStall || garages.menu, offer = missions.offer != null, metro = metroRide.Active,
                ride = rides.Blocking ? rides.state : null, waiting = rides.Active && !rides.Blocking ? rides.state : null,
                hail = player.vehicle == null && entranceNear == null && shelterNear == null, duty = player.vehicle != null && player.vehicle.type == "auto" && !autoDuty.HasFare,
            });
        }

        // ---------- Vehicle-vehicle contacts (resolveVehicleContacts in main.js) ----------
        readonly List<Circle> ca = new List<Circle>(), cb = new List<Circle>();
        void ResolveVehicleContacts()
        {
            foreach (var a in dynamic.ToArray())
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
