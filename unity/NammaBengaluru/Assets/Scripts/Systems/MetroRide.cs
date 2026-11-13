// Riding Namma Metro (port of src/systems/metroRide.js): buy a token at a station entrance, pick a
// destination (changing lines at Majestic if needed), wait on the platform for a real train, ride
// it in real time and get off at the other end. T skips the wait or the ride.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.Entities;
using NammaBengaluru.Render;
using NammaBengaluru.World;
using UnityEngine;

namespace NammaBengaluru.Systems
{
    public class MetroRide
    {
        static int Fare(int n) => Math.Min(60, 10 + n * 3);
        public class Entrance { public double x, z; public MetroStop st; public MetroRoute line; }
        class Leg { public MetroRoute line; public MetroStop from, to; public int dir; }
        class Trip { public List<Leg> legs; public int leg; public MetroStop dest; }
        struct Stand { public double x, z, y, fx, fz, lx, lz; }

        readonly Game game;
        readonly MetroWorld metro;
        readonly List<MetroRoute> routes;
        public readonly List<Entrance> entrances = new List<Entrance>();
        public string state; // null | menu | platform | riding
        MetroStop here;
        int lineIdx, sel;
        Trip trip;
        Stand stand;
        MetroWorld.Train train;
        Vector3 camPos, camLook;
        public bool Active => state != null;
        public bool Riding => state == "riding";
        public double tunnel; // 0..1: how dark the screen is in the tunnel

        public MetroRide(Game game, MetroWorld metro)
        {
            this.game = game; this.metro = metro; routes = metro.routes;
            foreach (var line in routes) foreach (var st in line.stations) foreach (var e in st.entrances ?? new List<(double x, double z)>()) entrances.Add(new Entrance { x = e.x, z = e.z, st = st, line = line });
        }

        // The entrance within reach, if any.
        public Entrance NearEntrance((double x, double z) p)
        {
            Entrance best = null; double bd = 3.2;
            foreach (var e in entrances) { double d = Math.Sqrt((e.x - p.x) * (e.x - p.x) + (e.z - p.z) * (e.z - p.z)); if (d < bd) { bd = d; best = e; } }
            return best;
        }

        // ---------- trip planning ----------
        List<Leg> Plan(MetroStop from, MetroStop to)
        {
            if (from.line == to.line) return new List<Leg> { new Leg { line = from.line, from = from, to = to, dir = Math.Sign(to.idx - from.idx) } };
            // Change at the interchange (Majestic).
            var x1 = from.line.stations.First(s => s.interchange); var x2 = to.line.stations.First(s => s.interchange);
            var legs = new List<Leg>();
            if (x1 != from) legs.Add(new Leg { line = from.line, from = from, to = x1, dir = Math.Sign(x1.idx - from.idx) });
            if (x2 != to) legs.Add(new Leg { line = to.line, from = x2, to = to, dir = Math.Sign(to.idx - x2.idx) });
            return legs;
        }
        static int Stops(List<Leg> legs) => legs.Sum(l => Math.Abs(l.to.idx - l.from.idx));

        // ---------- menu ----------
        public void Open(Entrance e)
        {
            if (game.police.level > 0) { game.Say("Metro security won't let you through with the police on your tail.", 3); return; }
            state = "menu";
            here = e.st;
            lineIdx = routes.IndexOf(e.line);
            sel = (here.idx + 1) % e.line.stations.Count;
            RenderMenu();
        }

        void RenderMenu()
        {
            var line = routes[lineIdx];
            string col = "#" + line.color.ToString("x6");
            var rows = new List<(string, string, string, string)> { ($"{line.name}{(routes.Count > 1 ? "  ◀ ▶" : "")}", null, null, col) };
            foreach (var s in line.stations)
            {
                bool isHere = s.en == here.en;
                var legs = Plan(here.line == s.line ? here : routes.SelectMany(r => r.stations).FirstOrDefault(q => q.en == here.en && q.line == s.line) ?? here, s);
                rows.Add((s.en, legs.Count > 1 ? "change at Majestic" : null, isHere ? "YOU ARE HERE" : $"₹{Fare(Stops(legs))}", null));
            }
            game.hud.ShowList("NAMMA METRO", $"You are at {here.en}", rows, sel + 1, "W/S choose · A/D line · E buy token · Q cancel", line.color);
        }

        void MenuInput(GameInput input)
        {
            var line = routes[lineIdx];
            if (input.Hit("KeyW", "ArrowUp")) { sel = (sel - 1 + line.stations.Count) % line.stations.Count; RenderMenu(); }
            if (input.Hit("KeyS", "ArrowDown")) { sel = (sel + 1) % line.stations.Count; RenderMenu(); }
            if (input.Hit("KeyA", "ArrowLeft", "KeyD", "ArrowRight"))
            {
                lineIdx = (lineIdx + 1) % routes.Count;
                sel = Math.Min(sel, routes[lineIdx].stations.Count - 1);
                RenderMenu();
            }
            if (input.Hit("KeyQ", "Backspace")) { Close(); return; }
            if (input.Hit("KeyE", "Enter"))
            {
                var to = routes[lineIdx].stations[sel];
                if (to.en == here.en) { game.Say("You're already here.", 1.5); return; }
                var from = here.line == to.line ? here : routes.SelectMany(r => r.stations).FirstOrDefault(s => s.en == here.en && s.line == to.line) ?? here;
                var legs = Plan(from, to);
                int fare = Fare(Stops(legs));
                if (game.money < fare) { game.Say($"A token to {to.en} is ₹{fare}. You can't afford it.", 2.5); return; }
                game.AddMoney(-fare);
                GameAudio.I?.Click();
                game.hud.HideMenu();
                trip = new Trip { legs = legs, leg = 0, dest = to };
                game.Say($"Token to {to.en} (₹{fare}). {(legs.Count > 1 ? "Change at Majestic. " : "")}Head up to the platform.", 3.5);
                ToPlatform();
            }
        }

        void Close() { game.hud.HideMenu(); state = null; }

        // ---------- platform ----------
        Leg CurLeg => trip.legs[trip.leg];

        void ToPlatform()
        {
            var leg = CurLeg; var st = leg.from;
            // Stand on the side platform of the track this direction uses (left-hand running).
            double dx = st.dirX * leg.dir, dz = st.dirZ * leg.dir, lx = dz, lz = -dx;
            stand = new Stand { x = st.x + lx * 6.4, z = st.z + lz * 6.4, y = st.platformY, fx = dx, fz = dz, lx = lx, lz = lz };
            state = "platform";
            train = null;
            var p = game.player;
            if (p.vehicle != null) p.ExitVehicle(game, true);
            p.x = stand.x; p.z = stand.z; p.y = stand.y; p.vy = 0;
            p.heading = Math.Atan2(-lx, -lz); // facing the track
            var h = p.human; h.go.SetActive(true); h.tiltX = 0;
            h.x = p.x; h.y = p.y; h.z = p.z; h.heading = p.heading; h.PoseIdle(0); h.Apply();
            camPos = Game.ToUnity(p.x + lx * 3.5 - dx * 6, p.y + 2.4, p.z + lz * 3.5 - dz * 6);
            camLook = Game.ToUnity(p.x + dx * 18, p.y + 1.2, p.z + dz * 18);
        }

        // A train at this platform, doors open, going our way (or about to reverse into our way).
        MetroWorld.Train TrainHere()
        {
            var leg = CurLeg;
            return metro.trains.FirstOrDefault(t => t.line == leg.line && t.at == leg.from && t.wait > 2.5 && (t.reverse ? -t.dir : t.dir) == leg.dir);
        }

        // Run the metro alone until done() (skipping time).
        void FastForward(Func<bool> done, double limit = 2400)
        {
            double s = 0;
            while (s < limit && !done()) { metro.Update(0.25); s += 0.25; }
            game.env.Skip(s * 0.25); // time flies when you doze off on the metro
        }

        // ---------- riding ----------
        void Board(MetroWorld.Train t)
        {
            train = t;
            state = "riding";
            game.player.human.go.SetActive(false);
            GameAudio.I?.MetroDoors();
            var l = CurLeg.line;
            game.Say($"Doors closing. {l.name} towards {(CurLeg.dir > 0 ? l.stations[l.stations.Count - 1].en : l.stations[0].en)}.", 3);
        }

        void Alight()
        {
            trip.leg++;
            if (trip.leg < trip.legs.Count) { game.Say("Change here for the " + CurLeg.line.name + ".", 3); ToPlatform(); return; }
            // Out to the street.
            var st = trip.dest;
            var e = st.entrances != null && st.entrances.Count > 0 ? st.entrances[0] : (st.x, st.z);
            var p = game.player;
            p.x = e.x; p.z = e.z; p.y = game.layout.GroundHeight(e.x, e.z, null); p.vy = 0;
            p.human.go.SetActive(true);
            state = null; trip = null; train = null; tunnel = 0;
            game.hud.HideBanner();
            game.rig.first = true;
            game.hud.Toast(st.en, "Namma Metro");
            game.Reseed();
        }

        // ---------- per frame ----------
        // Returns true while the ride holds the camera.
        public bool Update(double dt, GameInput input, Camera cam)
        {
            if (state == "menu") { MenuInput(input); return false; }
            var p = game.player;
            if (state == "platform")
            {
                p.x = stand.x; p.z = stand.z; p.y = stand.y;
                p.human.x = p.x; p.human.y = p.y; p.human.z = p.z; p.human.PoseIdle(Time.time); p.human.Apply();
                var t = TrainHere();
                if (t != null) { Board(t); return true; }
                if (input.Hit("KeyT")) FastForward(() => TrainHere() != null);
                if (input.Hit("KeyQ")) { game.Say("Leaving the station.", 1.5); trip.dest = CurLeg.from; trip.leg = trip.legs.Count - 1; Alight(); return false; }
                Banner($"Platform · {CurLeg.from.en}", $"Waiting for a {CurLeg.line.name} train towards {TerminusName()}…", "T skip wait · Q leave");
                FollowCamera(dt, cam);
                return true;
            }
            if (state == "riding")
            {
                var t = train; var leg = CurLeg;
                bool AtDest() => t.at == leg.to && t.wait > 2;
                if (input.Hit("KeyT")) FastForward(AtDest);
                p.x = t.x; p.z = t.z; p.y = t.y;
                if (AtDest()) { Alight(); return false; }
                // Next stop.
                double mid = t.s - t.dir * MetroRoutes.TRAIN_LEN / 2;
                var next = leg.line.stations.Where(s => (s.s - mid) * t.dir > -1).OrderBy(s => (s.s - mid) * t.dir).FirstOrDefault();
                int left = Math.Abs(leg.to.idx - (next != null ? next.idx : leg.to.idx)) + 1;
                Banner($"{leg.line.name} → {leg.to.en}", t.at != null ? $"Now at {t.at.en}" : $"Next: {(next != null ? next.en : leg.to.en)} · {left} stop{(left > 1 ? "s" : "")} to {leg.to.en}", "T skip ride");
                tunnel = t.y < -2 && t.at == null ? 0.88 : 0;
                FollowCamera(dt, cam);
                return true;
            }
            return false;
        }

        string TerminusName() { var l = CurLeg.line; return CurLeg.dir > 0 ? l.stations[l.stations.Count - 1].en : l.stations[0].en; }
        void Banner(string title, string text, string keys) => game.hud.Banner(trip != null ? CurLeg.line.color : 0x777777, title, text, keys);

        void FollowCamera(double dt, Camera cam)
        {
            Vector3 want, look;
            if (state == "riding")
            {
                var t = train;
                double mid = t.s - t.dir * MetroRoutes.TRAIN_LEN / 2, half = MetroRoutes.TRAIN_LEN / 2;
                bool inStation = t.line.stations.Any(st => Math.Abs(st.s - mid) < 50);
                if (inStation && t.y > -2)
                {
                    // Under the station roof: watch from the platform (left of travel).
                    want = Game.ToUnity(t.x - t.hx * (half + 4) + t.hz * 4.5, t.y + 1.9, t.z - t.hz * (half + 4) - t.hx * 4.5);
                    look = Game.ToUnity(t.x + t.hx * 8, t.y + 1.2, t.z + t.hz * 8);
                }
                else if (t.y < -2)
                {
                    // Underground: stay low, inside the hall or tunnel.
                    want = Game.ToUnity(t.x - t.hx * (half + 6) + t.hz * 3.2, t.y + 2.4, t.z - t.hz * (half + 6) - t.hx * 3.2);
                    look = Game.ToUnity(t.x + t.hx * 10, t.y + 1.2, t.z + t.hz * 10);
                }
                else
                {
                    want = Game.ToUnity(t.x - t.hx * (half + 22) + t.hz * 10, t.y + 10, t.z - t.hz * (half + 22) - t.hx * 10);
                    look = Game.ToUnity(t.x + t.hx * 14, t.y + 1, t.z + t.hz * 14);
                }
            }
            else
            {
                var s = stand;
                want = Game.ToUnity(s.x + s.lx * 3.2 - s.fx * 7, s.y + 2.6, s.z + s.lz * 3.2 - s.fz * 7);
                look = Game.ToUnity(s.x - s.lx * 2 + s.fx * 18, s.y + 1.2, s.z - s.lz * 2 + s.fz * 18);
            }
            float k = Mathf.Min(1, (float)dt * 3);
            camPos = Vector3.Lerp(camPos, want, (camPos - want).magnitude > 60 ? 1 : k);
            camLook = Vector3.Lerp(camLook, look, (camLook - look).magnitude > 60 ? 1 : k);
            cam.transform.position = camPos;
            cam.transform.LookAt(camLook);
        }
    }
}
