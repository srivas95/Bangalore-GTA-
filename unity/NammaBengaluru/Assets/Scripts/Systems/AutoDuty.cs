// Driving an auto for a living (port of src/systems/autoDuty.js): in any auto (bought, borrowed or
// stolen) press J to go on duty. People on the footpaths wave you down; pull up beside one, they
// climb in the back and say where they're going, and the meter runs at the Bengaluru tariff until
// you drop them off. Drive gently and they tip; scare them and they make you stop and walk off
// without paying.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.Entities;
using NammaBengaluru.Render;
using UnityEngine;

namespace NammaBengaluru.Systems
{
    public class AutoDuty
    {
        class Pax { public string who, line; public double hurry; }
        static readonly Pax[] PASSENGERS = {
            new Pax { who = "Techie with a laptop bag", line = "Meter haaki, guru. And please avoid Silk Board.", hurry = 0.6 },
            new Pax { who = "Aunty with vegetables", line = "Swalpa fast-aagi hogappa, my pressure cooker is on!", hurry = 0.8 },
            new Pax { who = "College student", line = "Bro, can you do it in fifty? I only have UPI.", hurry = 0.4 },
            new Pax { who = "Startup founder", line = "Let's disrupt this route. Take the shortcut.", hurry = 0.7 },
            new Pax { who = "Tourist", line = "Is this the famous Bangalore traffic? Amazing!", hurry = 0.1 },
            new Pax { who = "Grandfather with an umbrella", line = "Nidhaana-vaagi hogappa. I am in no hurry, you are in no hurry.", hurry = 0 },
            new Pax { who = "Nurse after a night shift", line = "Please hurry, anna, I have to sleep before the next shift.", hurry = 0.9 },
            new Pax { who = "Two schoolkids", line = "Uncle, tuition is starting! Bega, bega!", hurry = 1 },
            new Pax { who = "Man on the phone", line = "...haan, haan, I'm in the auto only, five minutes. (He has said this for an hour.)", hurry = 0.5 },
            new Pax { who = "Shopkeeper with a sack", line = "Sack-u hindge idtini, OK? Sari, hogona.", hurry = 0.3 },
        };
        static readonly string[] SCARED = { "Ayyo! Nidhaana!", "Swalpa slow maadi, please!", "Anna, jeeva ide nange!", "Eh! Gaadi nodi, gaadi!" };
        static readonly string[] BAIL = { "Nillisi! Illi ilisi, naanu nadkond hogthini!", "Stop the auto! I'll walk from here!", "Saaku! Illi nillisi!" };
        static readonly string[] THANKS = { "Thank you, anna!", "Sari, thanks guru.", "Dhanyavaada!", "Change ittkoli." };
        static readonly System.Random R = new System.Random();
        static double Rnd() => R.NextDouble();
        static double Hyp(double a, double b) => Math.Sqrt(a * a + b * b);

        // Meter: ₹30 for the first 2 km, ₹15 a km after that, one-and-a-half times between 10 pm and
        // 5 am. Distances on the map are scaled down, so the meter counts real-world kilometres.
        public static double AutoFare(double metres, double hour, double scale)
        {
            double km = metres * scale / 1000;
            double f = 30 + Math.Max(0, km - 2) * 15;
            return f * (hour >= 22 || hour < 5 ? 1.5 : 1);
        }

        class Hailer { public Ped p; public Marker marker; public double t; }
        class Fare
        {
            public string stage; public Human h; public Pax pax; public Poi dest;
            public double t, fromX, fromZ, metres, comfort = 100, health, scaredT, lastX, lastZ;
            public int wanted; public (double x, double z)? prevWaypoint;
        }

        readonly Game game;
        readonly List<Poi> places;
        public bool on;
        readonly List<Hailer> hailers = new List<Hailer>();
        readonly Marker[] markers;
        readonly Marker destMarker;
        Fare fare;
        double hailT = 3, earned;
        int trips;
        readonly HashSet<Vehicle> hinted = new HashSet<Vehicle>();
        public bool HasFare => fare != null;

        public AutoDuty(Game game, Transform parent)
        {
            this.game = game;
            var pois = game.city.pois;
            places = pois.landmarks.Concat(pois.food).Concat(pois.homes).Where(q => q.name != null).ToList();
            markers = new[] { new Marker(parent, 0xffd21a), new Marker(parent, 0xffd21a) };
            destMarker = new Marker(parent, 0x30e070);
        }

        public IEnumerable<UI.MapMarker> MapMarkers
        {
            get
            {
                foreach (var h in hailers) yield return new UI.MapMarker { x = h.p.x, z = h.p.z, color = UI.Hud.CssColor(0xffd21a) };
                if (fare != null && fare.stage == "riding") yield return new UI.MapMarker { x = fare.dest.x, z = fare.dest.z, color = UI.Hud.CssColor(0x30e070) };
            }
        }

        public void Update(double dt, GameInput input, Player player)
        {
            var v = player.vehicle;
            bool inAuto = v != null && v.type == "auto" && v.driver == "player";
            if (!inAuto)
            {
                if (on) Stop(player.vehicle != null ? null : "You left the auto.");
                return;
            }
            if (!on)
            {
                if (hinted.Add(v)) game.Say("An auto of your own! Press J to go on duty and pick up fares.", 4);
                if (input.Hit("KeyJ")) Start();
                return;
            }
            if (input.Hit("KeyJ") && fare == null) { Stop(null); return; }
            double t = Time.time;
            foreach (var m in markers) m.Update(t);
            destMarker.Update(t);
            if (fare != null) UpdateFare(dt, v); else UpdateHailers(dt, v);
        }

        void Start()
        {
            on = true;
            hailT = 2;
            game.missions.offer = null;
            game.hud.Phone(null);
            game.Say("On duty. Watch the footpaths for people waving you down, and pull up next to them.", 4);
            GameAudio.I?.Click();
        }

        void Stop(string reason)
        {
            if (fare != null) Abandon(reason ?? "Off duty with a passenger aboard?");
            foreach (var h in hailers.ToList()) DropHailer(h);
            on = false;
            game.hud.Mission(null);
            if (reason == null) game.Say($"Off duty. {trips} trip{(trips == 1 ? "" : "s")}, ₹{Math.Round(earned)} earned.", 3);
        }

        // ---------- finding fares ----------
        void UpdateHailers(double dt, Vehicle v)
        {
            double fx = Math.Sin(v.heading), fz = Math.Cos(v.heading);
            // Rain and rush hour: everyone wants an auto.
            double h = game.hour;
            bool busy = game.env.rain > 0.3 || (h >= 8 && h < 11) || (h >= 17 && h < 21);
            hailT -= dt;
            if (hailT <= 0 && hailers.Count < 2 && game.police.level == 0)
            {
                hailT = (busy ? 4 : 9) + Rnd() * 8;
                var cands = game.streetLife.peds.Where(p =>
                {
                    if (p.kind != "walker" || p.state != "walk" || p.dead || hailers.Any(q => q.p == p)) return false;
                    double dx = p.x - v.x, dz = p.z - v.z, d = Hyp(dx, dz);
                    return d > 30 && d < 110 && (dx * fx + dz * fz) / d > 0.4;
                }).ToList();
                if (cands.Count > 0)
                {
                    var p = cands[R.Next(cands.Count)];
                    game.streetLife.Hail(p);
                    var marker = markers.First(m => !hailers.Any(q => q.marker == m));
                    hailers.Add(new Hailer { p = p, marker = marker });
                    GameAudio.I?.Voice("vo_kn_he", p.x, p.z, @ref: 10, gender: p.h.female ? "f" : "m");
                    game.Say("Someone up ahead is waving you down: \"Auto!\"", 2.5);
                }
            }
            for (int i = hailers.Count - 1; i >= 0; i--)
            {
                var hl = hailers[i]; var p = hl.p;
                hl.t += dt;
                // Gone (scared off, streamed out, or tired of waiting)?
                if (p.state != "hail" || !game.streetLife.peds.Contains(p) || hl.t > 50 || game.police.level > 0) { DropHailer(hl); continue; }
                hl.marker.Place(p.x, p.z, p.y + 0.05);
                if (Hyp(p.x - v.x, p.z - v.z) < 6.5 && v.Speed < 1.5) { PickUp(hl, v); return; }
            }
            game.hud.Mission("On duty", hailers.Count > 0 ? "Pull up next to the person waving (yellow)." : "Cruise around and watch the footpaths for fares.", null);
        }

        void DropHailer(Hailer hl)
        {
            game.streetLife.Unhail(hl.p);
            hl.marker.Hide();
            hailers.Remove(hl);
        }

        void PickUp(Hailer hl, Vehicle v)
        {
            foreach (var q in hailers.ToList()) if (q != hl) DropHailer(q);
            hailers.Clear();
            hl.marker.Hide();
            var p = hl.p;
            var h = game.streetLife.Take(p);
            var pax = PASSENGERS[R.Next(PASSENGERS.Length)];
            fare = new Fare
            {
                stage = "boarding", h = h, pax = pax, dest = PickDestination(v), fromX = p.x, fromZ = p.z,
                health = v.health, wanted = game.police.level, prevWaypoint = game.gps.target,
            };
            GameAudio.I?.Voice("vo_kn_namaskara", gender: h.female ? "f" : "m");
        }

        Poi PickDestination(Vehicle v)
        {
            var ok = places.Where(q => { double d = Hyp(q.x - v.x, q.z - v.z); return d > 250 && d < 1400 && game.layout.EdgeAt(q.x, q.z) != null; }).ToList();
            return ok.Count > 0 ? ok[R.Next(ok.Count)] : places[R.Next(places.Count)];
        }

        // ---------- with a passenger ----------
        void UpdateFare(double dt, Vehicle v)
        {
            var f = fare;
            f.t += dt;
            if (f.stage == "boarding")
            {
                // Walk round to the open side of the auto and climb in the back.
                double lx = Math.Cos(v.heading), lz = -Math.Sin(v.heading);
                double doorX = v.x + lx * 1.0, doorZ = v.z + lz * 1.0;
                double k = Math.Min(1, f.t / 1.3);
                f.h.x = f.fromX + (doorX - f.fromX) * k; f.h.z = f.fromZ + (doorZ - f.fromZ) * k; f.h.y = v.y + 0.15;
                f.h.heading = Math.Atan2(doorX - f.fromX, doorZ - f.fromZ); f.h.tiltX = 0;
                f.h.AnimateWalk(dt, 1.6);
                f.h.Apply();
                if (v.Speed > 2) { game.Say("\"Hey! Wait for me!\" Your passenger walks off.", 3); Release(f.fromX, f.fromZ); fare = null; return; }
                if (k >= 1)
                {
                    f.h.PoseSit();
                    f.h.go.transform.SetParent(((VehicleView)v.view).rig.body, false);
                    f.h.x = 0; f.h.y = -0.05; f.h.z = -0.62; f.h.heading = 0;
                    f.h.Apply();
                    f.stage = "riding";
                    f.lastX = v.x; f.lastZ = v.z;
                    game.gps.Set(f.dest.x, f.dest.z);
                    destMarker.Place(f.dest.x, f.dest.z, 0.15);
                    GameAudio.I?.Voice("vo_kn_hogi", gender: f.h.female ? "f" : "m");
                    game.Say($"{f.pax.who}: \"{f.dest.name}, please. {f.pax.line}\"", 5);
                }
                return;
            }
            // Meter: by distance actually driven.
            f.metres += Hyp(v.x - f.lastX, v.z - f.lastZ);
            f.lastX = v.x; f.lastZ = v.z;
            double meter = AutoFare(f.metres, game.hour, game.md.SCALE);
            // Comfort: knocks, speeding, police chases.
            double hit = f.health - v.health;
            if (hit > 0.5) { f.comfort -= hit * 4; Scared(); }
            f.health = v.health;
            double sp = v.Speed, fast = sp > 14 ? (sp - 14) * 0.8 : 0;
            f.comfort += (f.pax.hurry * 1.2 - fast * (1.2 - f.pax.hurry)) * dt;
            if (game.police.level > f.wanted) { f.comfort -= 40; f.wanted = game.police.level; Scared(); }
            f.comfort = Math.Min(100, f.comfort);
            f.scaredT -= dt;
            double left = Hyp(f.dest.x - v.x, f.dest.z - v.z);
            if (v.wrecked || v.fireT > 0) { Abandon("Your passenger scrambles out of the burning auto!"); return; }
            if (f.comfort < 25 && f.stage == "riding")
            {
                f.stage = "bailing";
                GameAudio.I?.Voice("vo_kn_nillisi", gender: f.h.female ? "f" : "m");
                game.Say($"{f.pax.who}: \"{BAIL[R.Next(BAIL.Length)]}\"", 4);
            }
            if (f.stage == "bailing")
            {
                game.hud.Mission("Passenger wants out", "Stop and let them off. (No fare for that ride.)", null);
                if (sp < 1.2) DropOff(v, 0);
                return;
            }
            string mood = f.comfort > 75 ? "☺" : f.comfort > 45 ? "–" : "☹";
            game.hud.Mission("Meter running", $"₹{meter:F1} · {f.metres * game.md.SCALE / 1000:F1} km · {mood} · to {f.dest.name} ({Math.Round(left)} m)", null);
            if (left < 16 && sp < 1.2)
            {
                int tip = f.comfort > 70 ? (int)Math.Round(meter * (0.05 + Rnd() * 0.15) + f.pax.hurry * 10) : 0;
                DropOff(v, (int)Math.Round(meter) + tip, tip);
            }
        }

        void Scared()
        {
            var f = fare;
            if (f.scaredT > 0) return;
            f.scaredT = 4;
            if (!f.h.female) GameAudio.I?.Voice("vo_gasp_m");
            else GameAudio.I?.Voice("vo_kn_swalpa", gender: "f");
            game.Say($"\"{SCARED[R.Next(SCARED.Length)]}\"", 2);
        }

        void DropOff(Vehicle v, int pay, int tip = 0)
        {
            var f = fare;
            double lx = Math.Cos(v.heading), lz = -Math.Sin(v.heading);
            double x = v.x + lx * 1.6, z = v.z + lz * 1.6;
            Finish();
            Release(x, z);
            var m = game.missions;
            if (pay > 0)
            {
                game.AddMoney(pay);
                GameAudio.I?.Cash();
                trips++;
                earned += pay;
                m.rating = Math.Min(5, m.rating + (f.comfort > 70 ? 0.05 : 0.01));
                GameAudio.I?.Voice("vo_kn_dhanyavadagalu", gender: f.h.female ? "f" : "m");
                game.hud.Toast($"+₹{pay}", $"Meter ₹{pay - tip}{(tip > 0 ? $" · tip ₹{tip}" : "")} · ★ {m.rating:F1}");
                game.Say($"{f.pax.who}: \"{THANKS[R.Next(THANKS.Length)]}\"", 2.5);
            }
            else
            {
                m.rating = Math.Max(1, m.rating - 0.3);
                game.hud.Toast("No fare", $"★ {m.rating:F1}");
            }
        }

        void Abandon(string reason)
        {
            var f = fare;
            game.Say($"{reason} ★ rating down.", 3);
            game.missions.rating = Math.Max(1, game.missions.rating - 0.3);
            var at = f.h.go.transform.position;
            Finish();
            Release(at.x, -at.z);
        }

        void Finish()
        {
            var f = fare;
            destMarker.Hide();
            if (f.prevWaypoint != null) game.gps.Set(f.prevWaypoint.Value.x, f.prevWaypoint.Value.z); else game.gps.Clear();
            game.hud.Mission(null);
        }

        // Back to the footpath.
        void Release(double x, double z)
        {
            var f = fare;
            game.streetLife.Adopt(f.h, x, z);
            fare = null;
            hailT = 5;
        }
    }
}
