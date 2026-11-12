// Garages (port of src/systems/garages.js): roadside puncture-and-service stalls all over town,
// and Chikka Motors in Gandhinagar. Drive into a bay to repair or respray (a new colour can shake
// off a low wanted level if no one saw you go in). Chikka Motors also sells vehicles; anything you
// buy is yours, saved, and can be called to any garage.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NammaBengaluru.Entities;
using NammaBengaluru.Render;
using NammaBengaluru.World;
using Newtonsoft.Json;
using UnityEngine;

namespace NammaBengaluru.Systems
{
    public class Garages
    {
        const string SAVE_KEY = "namma-bengaluru-garage-v1";
        public class SiteDef { public string name, kn; public double lat, lon; public bool dealer; }
        static readonly SiteDef[] SITES = {
            new SiteDef { name = "Chikka Motors", kn = "ಚಿಕ್ಕ ಮೋಟಾರ್ಸ್", lat = 12.9768, lon = 77.579, dealer = true },
            new SiteDef { name = "Sri Manjunatha Puncture", kn = "ಶ್ರೀ ಮಂಜುನಾಥ ಪಂಕ್ಚರ್", lat = 12.9295, lon = 77.5835 },
            new SiteDef { name = "Koramangala Auto Works", kn = "ಕೋರಮಂಗಲ ಆಟೋ ವರ್ಕ್ಸ್", lat = 12.9352, lon = 77.6225 },
            new SiteDef { name = "Indiranagar Car Care", kn = "ಇಂದಿರಾನಗರ ಕಾರ್ ಕೇರ್", lat = 12.9712, lon = 77.6395 },
            new SiteDef { name = "Yeshwanthpur Tyre Point", kn = "ಯಶವಂತಪುರ ಟೈರ್ ಪಾಯಿಂಟ್", lat = 13.0245, lon = 77.5505 },
            new SiteDef { name = "Rajajinagar Service Centre", kn = "ರಾಜಾಜಿನಗರ ಸರ್ವಿಸ್", lat = 12.9925, lon = 77.5545 },
            new SiteDef { name = "Banashankari Puncture Shop", kn = "ಬನಶಂಕರಿ ಪಂಕ್ಚರ್", lat = 12.9185, lon = 77.5655 },
            new SiteDef { name = "Hebbal Motor Garage", kn = "ಹೆಬ್ಬಾಳ ಮೋಟಾರ್ ಗ್ಯಾರೇಜ್", lat = 13.0395, lon = 77.5935 },
            new SiteDef { name = "Mysore Road Tyre Works", kn = "ಮೈಸೂರು ರಸ್ತೆ ಟೈರ್", lat = 12.9505, lon = 77.5395 },
            new SiteDef { name = "HSR Car Clinic", kn = "ಎಚ್‌ಎಸ್‌ಆರ್ ಕಾರ್ ಕ್ಲಿನಿಕ್", lat = 12.9125, lon = 77.6445 },
            new SiteDef { name = "Marathahalli Auto Garage", kn = "ಮಾರತ್ತಹಳ್ಳಿ ಆಟೋ ಗ್ಯಾರೇಜ್", lat = 12.9575, lon = 77.6985 },
            new SiteDef { name = "Whitefield Car Spa", kn = "ವೈಟ್‌ಫೀಲ್ಡ್ ಕಾರ್ ಸ್ಪಾ", lat = 12.9705, lon = 77.7445 },
            new SiteDef { name = "Yelahanka Puncture & Service", kn = "ಯಲಹಂಕ ಪಂಕ್ಚರ್", lat = 13.1005, lon = 77.5975 },
        };

        // What Chikka sells: label, type, model, price.
        public static readonly (string label, string type, string model, int price)[] FOR_SALE = {
            ("Honda Activa (scooter)", "scooter", "activa", 3000), ("Ola S1 Pro (electric scooter)", "scooter", "ola", 4500), ("Ather 450X (electric scooter)", "scooter", "ather", 5000),
            ("Royal Enfield Bullet", "bike", null, 8500), ("KTM Duke (sports bike)", "sportBike", null, 14000), ("Bajaj auto rickshaw", "auto", null, 6000),
            ("Maruti Omni (van)", "van", "omni", 7500), ("Maruti Eeco (van)", "van", "eeco", 10500), ("Maruti Alto", "hatch", "alto", 11000), ("Tata Tiago", "hatch", "tiago", 13500),
            ("Hyundai i10", "hatch", "i10", 14000), ("Maruti Swift", "hatch", "swift", 16000), ("Maruti Baleno", "hatch", "baleno", 17500), ("Hyundai i20", "hatch", "i20", 18500),
            ("Maruti Swift Dzire", "sedan", "dzire", 19000), ("Toyota Etios", "sedan", "etios", 19500), ("Tata Punch", "suv", "punch", 20000), ("Honda City", "sedan", "city", 26000),
            ("Hyundai Venue", "suv", "venue", 26500), ("Maruti Brezza", "suv", "brezza", 27500), ("Toyota Innova", "suv", "innova", 34000), ("Hyundai Creta", "suv", "creta", 38000),
            ("Kia Seltos", "suv", "seltos", 39000), ("Kia Carens", "suv", "carens", 36000), ("Mahindra Scorpio", "suv", "scorpio", 42000), ("Mahindra Thar", "suv", "thar", 45000),
            ("MG Hector", "suv", "hector", 47000), ("Mahindra XUV700", "suv", "xuv700", 52000), ("Toyota Fortuner", "suv", "fortuner", 62000),
        };
        static readonly int[] PAINTS = { 0xf2f2f2, 0x1a1a1a, 0xb01c22, 0x1c3a7a, 0x8a8e92, 0x2f6a3a, 0xe0a020, 0x6a2a6a, 0x3a8ab0, 0xc87a30 };

        public class Owned { public string label, type, model; public int color; }
        public class Site { public SiteDef def; public double x, z, nx, nz, ux, uz, bayX, bayZ; public Renderer ring; public string name => def.name; }

        static readonly System.Random R = new System.Random();
        readonly Game game;
        public List<Owned> owned = new List<Owned>();
        public readonly List<Site> sites = new List<Site>();
        readonly Dictionary<Owned, Vehicle> live = new Dictionary<Owned, Vehicle>();
        public bool menu, nearStall;
        Site site;
        string page;
        int sel;
        double cool;
        Material ringMat;

        public Garages(Game game, Transform parent)
        {
            this.game = game;
            try { owned = JsonConvert.DeserializeObject<List<Owned>>(PlayerPrefs.GetString(SAVE_KEY, "[]")) ?? new List<Owned>(); } catch { owned = new List<Owned>(); }
            var group = new GameObject("garages").transform;
            group.SetParent(parent, false);
            var B = new BuilderSet();
            var signs = new List<TextSign>();
            ringMat = Marker.BeamMat(CityMaterials.Hex(0x40d0ff), 0.55f, false);
            foreach (var s in SITES)
            {
                var st = Place(s);
                if (st == null) continue;
                sites.Add(st);
                BuildStall(B, st, signs, group);
                game.city.pois.garages.Add(new Poi { name = s.name, x = st.x, z = st.z });
            }
            B.BuildAll(new Dictionary<string, Material> { ["m"] = CityMaterials.Make("garage", new CityMaterials.Spec { roughness = 0.7f, doubleSided = true }) }, group);
            TextSigns.Build(signs, group);
            // Your most recent purchase waits outside Chikka Motors.
            if (owned.Count > 0 && sites.Count > 0) Deliver(owned[owned.Count - 1], sites[0], false);
        }

        void Save() { try { PlayerPrefs.SetString(SAVE_KEY, JsonConvert.SerializeObject(owned)); PlayerPrefs.Save(); } catch { /* ignore */ } }
        public void Reset() { owned.Clear(); Save(); }

        // Put the stall on the footpath facing the nearest road, with the service bay on the road.
        Site Place(SiteDef s)
        {
            var g = game.md.Geo(s.lat, s.lon);
            var L = game.layout;
            for (int tries = 0; tries < 40; tries++)
            {
                double x = g[0] + (tries > 0 ? Math.Cos(tries * 2.4) * tries * 4 : 0), z = g[1] + (tries > 0 ? Math.Sin(tries * 2.4) * tries * 4 : 0);
                var hq = L.EdgeAt(x, z);
                if (hq == null || hq.Value.e.r.boundary) continue;
                var h = hq.Value; var e = h.e;
                double ux = (e.b.x - e.a.x) / e.len, uz = (e.b.z - e.a.z) / e.len;
                double t = Math.Max(0.25, Math.Min(0.75, h.t)) * e.len;
                double cx = e.a.x + ux * t, cz = e.a.z + uz * t;
                double nx = -uz, nz = ux;
                if ((x - cx) * nx + (z - cz) * nz < 0) { nx = -nx; nz = -nz; }
                double w = e.r.width / 2;
                double sx = cx + nx * (w + 2.3), sz = cz + nz * (w + 2.3);
                var blk = L.BlockContaining(sx, sz);
                if (blk == null || blk.island || game.colliders.PointBlocked(sx, sz, 1) || L.UnderpassAt(cx, cz) != null || L.FlyoverAt(cx, cz) != null) continue;
                if (Math.Min(t, e.len - t) < (e.a.cut.TryGetValue(e.id, out var cut) ? cut : 0) + 12) continue;
                return new Site { def = s, x = sx, z = sz, nx = nx, nz = nz, ux = ux, uz = uz, bayX = cx + nx * (w - 2.0), bayZ = cz + nz * (w - 2.0) };
            }
            return null;
        }

        void BuildStall(BuilderSet B, Site s, List<TextSign> signs, Transform group)
        {
            var f = new Frame(s.x, s.z, Math.Atan2(s.nx, s.nz) + Math.PI); // local +z faces the road
            B.xf = f;
            var m = B.Get("m");
            bool dealer = s.def.dealer;
            int tarp = dealer ? 0xc0182a : 0x1f5fb0;
            double W = dealer ? 7 : 4.2;
            m.Box(0, 3.0, -0.2, W + 0.4, 0.12, 3.4, tarp);
            foreach (var sx in new[] { -1, 1 }) m.Box(sx * W / 2, 0.15, 1.2, 0.12, 2.9, 0.12, 0x555555);
            m.Box(0, 0.15, -1.4, W, 2.9, 0.15, dealer ? 0xe8e4dc : 0x777b80);
            // Stacked tyres and a compressor.
            var torus = Primitives.Torus(0.32, 0.13, 6, 12);
            for (int k = 0; k < 4; k++) m.Put(torus, -W / 2 + 0.6, 0.3 + k * 0.24, 0.2, 0x1a1a1a, 0, 1, 1, 1, Math.PI / 2);
            for (int k = 0; k < 3; k++) m.Put(torus, -W / 2 + 1.4, 0.3 + k * 0.24, -0.4, 0x1a1a1a, 0, 1, 1, 1, Math.PI / 2);
            m.Box(W / 2 - 0.7, 0.15, -0.6, 0.7, 0.8, 0.5, 0xd02020);
            B.xf = null;
            game.colliders.Framed(f).AddCentered(-W / 2 + 1, -0.1, 1.9, 1.2, 1.2, "prop");
            // Sign board over the stall.
            double wx = s.x + s.nx * 1.25, wz = s.z + s.nz * 1.25;
            signs.Add(new TextSign
            {
                key = "garage_" + s.def.name, text = new[] { s.def.kn, s.def.name.ToUpperInvariant(), dealer ? "SALES · SERVICE · RESPRAY" : "PUNCTURE · SERVICE · RESPRAY" },
                bg = dealer ? "#c0182a" : "#f2c200", fg = dealer ? "#ffffff" : "#111111", texH = 300, emissive = 0.15f,
                x = wx, y = 3.0 + W * 150 / 1024 + 0.1, z = wz, w = W, h = W * 300 / 1024, rotY = f.ang,
            });
            // The bay: a painted ring on the road.
            var rb = new ChunkBuilder();
            rb.Put(Primitives.Ring(1.9, 2.3, 32), 0, 0, 0, 0xffffff, 0, 1, 1, 1, -Math.PI / 2);
            var ring = new GameObject("bay");
            ring.transform.SetParent(group, false);
            ring.transform.localPosition = Game.ToUnity(s.bayX, 0.06, s.bayZ);
            ring.AddComponent<MeshFilter>().sharedMesh = rb.Meshes("bay")[0];
            s.ring = ring.AddComponent<MeshRenderer>();
            s.ring.sharedMaterial = ringMat;
        }

        // ---------- menu ----------
        class Item { public string label, act; public int price; public bool off; }

        void Open(Site s) { site = s; page = "main"; sel = 0; menu = true; Render(); }
        void Close() { menu = false; game.hud.HideMenu(); cool = 1.5; }

        static string Rs(int n) => "₹" + n.ToString("#,##,##0", CultureInfo.GetCultureInfo("en-IN"));

        List<Item> Items()
        {
            var v = game.player.vehicle;
            int money = game.money;
            var output = new List<Item>();
            if (page == "buy") { output.AddRange(FOR_SALE.Select(f => new Item { label = f.label, price = f.price, act = "buy" })); output.Add(new Item { label = "Back", act = "back" }); }
            else if (page == "call") { output.AddRange(owned.Select(o => new Item { label = o.label, price = 200, act = "call" })); output.Add(new Item { label = "Back", act = "back" }); }
            else
            {
                if (v != null)
                {
                    double dmg = 100 - v.health;
                    int cost = Math.Max(50, (int)Math.Round(dmg * 9 + (v.engineDead ? 300 : 0) + (v.fireT > 0 ? 400 : 0)));
                    bool nothing = dmg < 0.5 && !v.engineDead;
                    output.Add(new Item { label = nothing ? "Repair (nothing to fix)" : $"Repair ({Math.Round(v.health)}% → 100%)", price = nothing ? 0 : cost, act = "repair", off = nothing });
                    if (!v.spec.police) output.Add(new Item { label = "Respray (new colour; loses a low wanted level)", price = 400, act = "respray" });
                }
                if (site.def.dealer) output.Add(new Item { label = "Buy a vehicle…", act = "shop" });
                if (owned.Count > 0 && v == null) output.Add(new Item { label = "Have one of your vehicles brought here…", act = "callmenu" });
                output.Add(new Item { label = "Leave", act = "close" });
            }
            foreach (var it in output) if (it.price > money) it.off = true;
            return output;
        }

        void Render()
        {
            var its = Items();
            sel = Math.Min(sel, its.Count - 1);
            string title = page == "buy" ? "Chikka Motors · showroom" : page == "call" ? "Your vehicles" : site.def.name;
            var rows = its.Select((it, i) => (it.label, it.price > 0 ? Rs(it.price) : "", i == sel, it.off)).ToList();
            game.hud.ShowMenu(title, "", rows, // (no Kannada subtitle: TextMeshPro cannot shape Kannada)
                 $"W/S choose · E select · Q leave · You have {Rs(game.money)}", 0x40d0ff);
        }

        void Choose(Item it, int idx)
        {
            var pl = game.player; var v = pl.vehicle;
            if (it.off) { GameAudio.I?.Click(); return; }
            switch (it.act)
            {
                case "close": Close(); return;
                case "back": page = "main"; sel = 0; break;
                case "shop": page = "buy"; sel = 0; break;
                case "callmenu": page = "call"; sel = 0; break;
                case "repair":
                    game.AddMoney(-it.price);
                    v.Repair();
                    GameAudio.I?.Cash();
                    game.Say("Mechanic: \"Done, sir. Drive slowly next time.\" (He knows you won't.)", 3);
                    break;
                case "respray":
                {
                    game.AddMoney(-400);
                    var view = (VehicleView)v.view;
                    int cur = view.paint ?? view.rig.def.color ?? -1;
                    var choices = PAINTS.Where(c => c != cur).ToArray();
                    view.Recolor(choices[R.Next(choices.Length)]);
                    GameAudio.I?.Cash();
                    var P = game.police;
                    bool seen = P.units.Any(u => Math.Sqrt((u.v.x - v.x) * (u.v.x - v.x) + (u.v.z - v.z) * (u.v.z - v.z)) < 70);
                    if (P.level > 0 && P.level <= 3 && !seen) { P.Clear(game); game.Say("New paint, new plates. The Hoysalas drive straight past.", 3.5); }
                    else if (P.level > 0) game.Say(seen ? "A Hoysala saw you drive in. The new colour won't fool them." : "Too hot for a paint job to help. Lose them first.", 3.5);
                    else game.Say("Fresh paint. Looks almost new.", 2.5);
                    break;
                }
                case "buy":
                {
                    var f = FOR_SALE[idx];
                    game.AddMoney(-f.price);
                    var rec = new Owned { label = f.label, type = f.type, model = f.model, color = PAINTS[R.Next(PAINTS.Length)] };
                    owned.Add(rec);
                    Save();
                    Deliver(rec, site, true);
                    GameAudio.I?.Cash();
                    game.hud.Toast(f.label, "Yours. Saved to your garage.");
                    Close();
                    return;
                }
                case "call":
                    game.AddMoney(-200);
                    Deliver(owned[idx], site, true);
                    game.Say($"Chikka: \"Sending the {owned[idx].label} over. Don't scratch it.\"", 3);
                    Close();
                    return;
            }
            Render();
        }

        void Deliver(Owned rec, Site s, bool announce)
        {
            // An earlier delivery of the same vehicle is towed away.
            if (live.TryGetValue(rec, out var old) && old != game.player.vehicle) { UnityEngine.Object.Destroy(((VehicleView)old.view).Go); game.free.Remove(old); }
            double heading = Math.Atan2(s.ux, s.uz);
            double x = s.bayX + s.ux * 6, z = s.bayZ + s.uz * 6;
            var v = game.ParkModel(rec.type, rec.model ?? (rec.type == "scooter" ? "activa" : null), rec.color, x, z, heading); // older saves: a petrol Activa
            live[rec] = v;
            if (announce) game.Say($"Your {rec.label} is parked outside {s.def.name}.", 3);
        }

        // ---------- per frame ----------
        public void Update(double dt, GameInput input)
        {
            var pl = game.player;
            float t = Time.time;
            var c = CityMaterials.Hex(0x40d0ff); c.a = 0.35f + Mathf.Sin(t * 3) * 0.2f;
            ringMat.SetColor("_Color", c);
            if (menu)
            {
                var its = Items();
                if (input.Hit("KeyW", "ArrowUp")) { sel = (sel - 1 + its.Count) % its.Count; Render(); }
                if (input.Hit("KeyS", "ArrowDown")) { sel = (sel + 1) % its.Count; Render(); }
                if (input.Hit("KeyQ", "Backspace", "Escape")) { if (page != "main") { page = "main"; sel = 0; Render(); } else Close(); return; }
                if (input.Hit("KeyE", "Enter")) { var it = its[sel]; if (it != null) Choose(it, sel); }
                return;
            }
            if (cool > 0) { cool -= dt; return; }
            var v = pl.vehicle;
            foreach (var s in sites)
            {
                if (v != null)
                {
                    if (Math.Sqrt((v.x - s.bayX) * (v.x - s.bayX) + (v.z - s.bayZ) * (v.z - s.bayZ)) < 3.5 && v.Speed < 3 && v.driver == "player") { Open(s); return; }
                }
                else if (Math.Sqrt((pl.x - s.x) * (pl.x - s.x) + (pl.z - s.z) * (pl.z - s.z)) < 3.8 || Math.Sqrt((pl.x - s.bayX) * (pl.x - s.bayX) + (pl.z - s.bayZ) * (pl.z - s.bayZ)) < 3)
                {
                    // Anywhere at the stall front, or on foot in its service ring.
                    game.hud.Prompt($"E  {s.def.name}");
                    if (input.Hit("KeyE")) { input.pressed.Remove("KeyE"); Open(s); }
                    nearStall = true;
                    return;
                }
            }
            nearStall = false;
        }
    }
}
