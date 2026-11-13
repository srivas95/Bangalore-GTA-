// Story missions (port of src/systems/story.js). A mission is a script of steps (go somewhere,
// talk, fight a crew, lose the police, collect, steal and deliver a vehicle...). Mission givers wait
// at marked places on the map; walk into the marker to start. Progress is saved (each game starts
// with ₹1000). The missions themselves (steps, lines, places) are exported from story.js by
// tools/unity/export_story.mjs to Resources/Data/story.json and run here. The story is fiction:
// see docs/STORY.md.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NammaBengaluru.Entities;
using NammaBengaluru.World;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace NammaBengaluru.Systems
{
    public class Story
    {
        const string SAVE_KEY = "namma-bengaluru-save-v1";
        static readonly System.Random R = new System.Random();

        class Op { public string op, key, text, type, place, var; public int n; public double h, d; }
        class Line { public string who, text; }
        class Member { public string weapon, name; public double? health, accuracy, r; public bool? hostile; public bool boss; }
        class Step
        {
            public string type, place, text, vehicleVar, failText, crew, reason, vtype, who;
            public double radius = 3.5, secs; public double? timer; public bool slow = true; public int stars;
            public List<Line> lines; public List<Op> ops; public List<Member> members; public List<string> places; public List<List<Op>> each;
        }
        class AfterToast { public string title, sub; }
        class Mission { public string id, title, act, giver; public int reward; public List<Step> steps; public AfterToast after; }
        class Data { public Dictionary<string, double[]> places; public List<Mission> missions; }

        // A running step's state (the step objects in story.js keep theirs on `this`).
        class Run
        {
            public Step s; public int i; public double t; public double? timer; public (double x, double z) p;
            public List<(string k, (double x, double z) p, double t)> left; public int n; public string crew; public string objective;
            public bool Points => s.type == "collect" || s.type == "getIn";
        }
        class Active { public Mission def; public int idx = -1; public Run step; public Dictionary<string, Vehicle> vars = new Dictionary<string, Vehicle>(); }

        readonly Game game;
        readonly Data data;
        readonly Marker marker, giver;
        readonly Dictionary<string, (double x, double z)> places = new Dictionary<string, (double, double)>();
        Active active;
        public List<string> done = new List<string>();
        public string look = "raghu";
        double collectT = 90, saveT = 30;
        bool armed = true; // a giver triggers only after you've walked away from the last one
        readonly List<(double t, Action a)> later = new List<(double, Action)>();
        public bool IsActive => active != null;

        public Story(Game game, Transform parent)
        {
            this.game = game;
            data = JsonConvert.DeserializeObject<Data>(Resources.Load<TextAsset>("Data/story").text);
            marker = new Marker(parent, 0xff4fa0);
            giver = new Marker(parent, 0xff4fa0);
            Load();
        }

        void After(double secs, Action a) => later.Add((secs, a));

        (double x, double z) Place(string key)
        {
            if (!places.TryGetValue(key, out var p))
            {
                var ll = data.places[key];
                var g = game.md.Geo(ll[0], ll[1]);
                places[key] = p = game.FootpathNear(g[0], g[1]);
            }
            return p;
        }

        // ---------- save / load ----------
        void Load()
        {
            try
            {
                var s = PlayerPrefs.GetString(SAVE_KEY, "");
                if (s == "") return;
                done = JObject.Parse(s)["done"]?.ToObject<List<string>>() ?? new List<string>();
                // In the middle of Act III you're Vinay.
                if (done.Contains("vinay") && !done.Contains("deal")) { look = "vinay"; After(0, () => game.player.SetLook("vinay")); }
                // Story progress carries over; money doesn't: every game starts with ₹1000 in your pocket.
                if (done.Count > 0) After(4, () => game.Say($"Save loaded: {done.Count} story mission{(done.Count > 1 ? "s" : "")} done.", 3));
            }
            catch { /* unreadable save: play without it */ }
        }

        public void Save()
        {
            try { PlayerPrefs.SetString(SAVE_KEY, JsonConvert.SerializeObject(new { done, t = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() })); PlayerPrefs.Save(); } catch { /* ignore */ }
        }

        public void Reset()
        {
            done.Clear();
            if (look == "vinay") { look = "raghu"; game.player.SetLook("player"); }
            PlayerPrefs.DeleteKey(SAVE_KEY);
        }

        Mission Next => data.missions.FirstOrDefault(m => !done.Contains(m.id));

        public IEnumerable<UI.MapMarker> Markers
        {
            get
            {
                var pink = UI.Hud.CssColor(0xff4fa0);
                if (active != null)
                {
                    var st = active.step;
                    if (st != null && st.s.type == "collect") foreach (var q in st.left) yield return new UI.MapMarker { x = q.p.x, z = q.p.z, color = pink };
                    else if (marker.Visible) yield return marker.ToMap();
                    if (st?.crew != null) foreach (var g in game.gangs.Alive(st.crew)) yield return new UI.MapMarker { x = g.x, z = g.z, color = UI.Hud.CssColor(g.boss ? 0xff2020 : 0xe05050) };
                    if (active.vars.TryGetValue("lorry", out var v) && v != null && game.player.vehicle != v && !v.wrecked) yield return new UI.MapMarker { x = v.x, z = v.z, color = UI.Hud.CssColor(0x4fc0ff) };
                    if (active.vars.TryGetValue("target", out var t) && t != null && !t.wrecked && !t.engineDead) yield return new UI.MapMarker { x = t.x, z = t.z, color = UI.Hud.CssColor(0xff2020) };
                }
                else if (giver.Visible) yield return giver.ToMap();
            }
        }

        // ---------- running ----------
        void Start(Mission def)
        {
            giver.Hide();
            active = new Active { def = def };
            var gigs = game.missions;
            gigs.paused = true;
            if (gigs.offer != null) { gigs.offer = null; game.hud.Phone(null); }
            if (gigs.job != null) gigs.CleanupJob();
            game.hud.Toast(def.title, def.act);
            GameAudio.I?.Sting(false);
            Advance();
        }

        void Advance()
        {
            var a = active;
            marker.Hide();
            a.idx++;
            if (a.idx >= a.def.steps.Count) { Complete(); return; }
            a.step = new Run { s = a.def.steps[a.idx] };
            Enter(a.step);
        }

        void Complete()
        {
            var def = active.def;
            Cleanup();
            done.Add(def.id);
            game.AddMoney(def.reward);
            GameAudio.I?.Cash();
            game.hud.Mission(null);
            game.hud.ShowScreen("MISSION PASSED", $"{def.title} · +₹{def.reward.ToString("#,##,##0", CultureInfo.GetCultureInfo("en-IN"))}", UI.Hud.CssColor(0xf0c040));
            After(3.5, () => { if (!game.player.dead) game.hud.HideScreen(); });
            if (def.after != null) game.hud.Toast(def.after.title, def.after.sub);
            armed = false;
            Save();
        }

        public void Fail(string reason)
        {
            if (active == null) return;
            var def = active.def;
            Cleanup();
            game.hud.Mission(null);
            armed = false;
            game.hud.ShowScreen("MISSION FAILED", reason ?? def.title, UI.Hud.CssColor(0xe05050));
            After(3, () => { if (!game.player.dead) game.hud.HideScreen(); });
        }

        void Cleanup()
        {
            var a = active;
            if (a.vars.TryGetValue("target", out var tv) && tv != null) { var ag = game.traffic.FindAgent(tv); if (ag != null) ag.keep = false; }
            foreach (var m in game.gangs.members.ToList()) if (m.crew != null && m.crew.StartsWith(a.def.id + ":")) game.gangs.Remove(m);
            marker.Hide();
            active = null;
            game.missions.paused = false;
        }

        // ---------- steps ----------
        void Enter(Run r)
        {
            var s = r.s;
            switch (s.type)
            {
                case "talk": r.i = -1; r.t = 0; NextLine(r); break;
                case "go": r.p = Place(s.place); r.timer = s.timer; marker.Place(r.p.x, r.p.z, 0.15); break;
                case "act": foreach (var op in s.ops) DoOp(op); break;
                case "wanted":
                {
                    var P = game.police; var pos = game.player.Pos;
                    P.Crime(s.reason, pos.x, pos.z, s.stars, game);
                    if (P.level < s.stars) { P.level = s.stars; P.seenT = 0; game.hud.SetStars(s.stars, false); game.Say($"★ Wanted: {s.reason}", 2.5); }
                    break;
                }
                case "wait": r.t = s.secs; break;
                case "fight":
                {
                    var p = Place(s.place);
                    r.crew = $"{active.def.id}:{s.crew}";
                    for (int k = 0; k < s.members.Count; k++)
                    {
                        var m = s.members[k];
                        double a = (double)k / s.members.Count * Math.PI * 2 + R.NextDouble() * 0.5;
                        double rr = m.r ?? 6 + R.NextDouble() * 4;
                        var q = game.FootpathNear(p.x + Math.Cos(a) * rr, p.z + Math.Sin(a) * rr);
                        var g = game.gangs.Spawn(game, q.x, q.z, m.weapon, m.health ?? 100, m.hostile ?? true, r.crew, m.name, m.accuracy ?? 0.4);
                        g.boss = m.boss;
                    }
                    break;
                }
                case "collect": r.left = s.places.Select(k => (k, Place(k), 0.0)).ToList(); r.n = 0; break;
                case "stop":
                {
                    var p = Place(s.place);
                    DirEdge best = null; double bd = double.PositiveInfinity;
                    foreach (var e in game.layout.edges) { double d = Math.Sqrt((e.from.x - p.x) * (e.from.x - p.x) + (e.from.z - p.z) * (e.from.z - p.z)); if (d < bd && e.len > 40 && e.flyover == null) { bd = d; best = e; } }
                    var ag = game.traffic.SpawnOn(s.vtype, best, 5);
                    if (ag != null) { ag.keep = true; ag.rush = true; ag.cruise *= 1.3; active.vars["target"] = ag.v; }
                    break;
                }
                case "become":
                    game.player.SetLook(s.who == "vinay" ? "vinay" : "player");
                    look = s.who;
                    game.hud.Toast(s.who == "vinay" ? "You are Vinay" : "You are Raghu", s.who == "vinay" ? "A delivery rider who would do anything for Raghu-anna" : "Home again");
                    break;
            }
        }

        void DoOp(Op op)
        {
            switch (op.op)
            {
                case "give": game.player.Give(op.key, op.n); break;
                case "setHour": game.hour = op.h; break;
                case "say": game.Say(op.text, op.d > 0 ? op.d : 3); break;
                case "cash": GameAudio.I?.Cash(); break;
                case "park":
                {
                    var p = Place(op.place);
                    var v = game.Park(op.type, p.x, p.z, R.NextDouble() * 6.28);
                    if (op.var != null) active.vars[op.var] = v;
                    break;
                }
            }
        }

        void NextLine(Run r)
        {
            r.i++;
            if (r.i >= r.s.lines.Count) return;
            var l = r.s.lines[r.i];
            r.t = Math.Min(7, Math.Max(2.6, l.text.Length * 0.055 + 1.4));
            game.Say(l.who != null ? $"{l.who}: {l.text}" : l.text, r.t + 0.3);
        }

        // 'done', a fail reason, or null to carry on.
        string Update(Run r, double dt, GameInput input, out string fail)
        {
            fail = null;
            var s = r.s; var pl = game.player;
            switch (s.type)
            {
                case "talk":
                    r.t -= dt;
                    if (r.t <= 0 || input.Hit("Enter", "KeyE")) NextLine(r);
                    return r.i >= s.lines.Count ? "done" : null;
                case "go":
                {
                    if (r.timer != null) { r.timer -= dt; if (r.timer <= 0) { fail = s.failText ?? "Too slow."; return null; } }
                    var pos = pl.Pos;
                    if (s.vehicleVar != null)
                    {
                        active.vars.TryGetValue(s.vehicleVar, out var v);
                        if (v == null || v.wrecked || v.engineDead) { fail = "The vehicle is wrecked."; return null; }
                        if (pl.vehicle != v) { r.objective = $"Get back in the {v.spec.label}."; return null; }
                    }
                    r.objective = s.text;
                    bool fast = pl.vehicle != null && pl.vehicle.Speed > 4;
                    if (Math.Sqrt((pos.x - r.p.x) * (pos.x - r.p.x) + (pos.z - r.p.z) * (pos.z - r.p.z)) < s.radius + (pl.vehicle != null ? 3 : 0) && (!s.slow || !fast)) return "done";
                    return null;
                }
                case "act": case "wanted": case "become": return "done";
                case "wait": r.t -= dt; return r.t <= 0 ? "done" : null;
                case "fight": r.objective = s.text; return game.gangs.Alive(r.crew).Count == 0 ? "done" : null;
                case "escape": r.objective = s.text; return game.police.level == 0 ? "done" : null;
                case "collect":
                {
                    for (int k = 0; k < r.left.Count; k++)
                    {
                        var q = r.left[k];
                        if (pl.vehicle != null || Math.Sqrt((pl.x - q.p.x) * (pl.x - q.p.x) + (pl.z - q.p.z) * (pl.z - q.p.z)) > 3.5) { r.left[k] = (q.k, q.p, 0); continue; }
                        q.t += dt; r.left[k] = q;
                        if (q.t > 1.2)
                        {
                            r.left.RemoveAt(k);
                            r.n++;
                            foreach (var op in s.each[r.n - 1]) DoOp(op);
                            break;
                        }
                    }
                    r.objective = $"{s.text} ({r.n}/{s.places.Count})";
                    return r.left.Count == 0 ? "done" : null;
                }
                case "stop":
                {
                    r.objective = s.text;
                    if (!active.vars.TryGetValue("target", out var v) || v == null) return "done";
                    var pos = pl.Pos;
                    if (v.engineDead || v.wrecked || (v.driver != "ai" && v.Speed < 1)) return "done";
                    if (Math.Sqrt((v.x - pos.x) * (v.x - pos.x) + (v.z - pos.z) * (v.z - pos.z)) > 450) fail = "They got away.";
                    return null;
                }
                case "getIn":
                {
                    r.objective = s.text;
                    active.vars.TryGetValue(s.vehicleVar, out var v);
                    if (v == null || v.wrecked || v.engineDead) { fail = "The vehicle is wrecked."; return null; }
                    return pl.vehicle == v ? "done" : null;
                }
            }
            return "done";
        }

        // ---------- per frame ----------
        public void Update(double dt, GameInput input)
        {
            for (int i = later.Count - 1; i >= 0; i--)
            {
                var (t, a) = later[i];
                t -= dt;
                if (t <= 0) { later.RemoveAt(i); a(); } else later[i] = (t, a);
            }
            double now = Time.time;
            marker.Update(now);
            giver.Update(now);
            var pl = game.player;
            // Daily collections once Majestic is yours.
            if (done.Contains("majestic"))
            {
                collectT -= dt;
                if (collectT <= 0)
                {
                    collectT = 120;
                    int n = 150 + (int)Math.Round(R.NextDouble() * 100);
                    game.AddMoney(n);
                    game.hud.Phone($"<b><color=#ffc400>Chikka</color></b>\nCollections from Majestic: ₹{n}");
                    After(4, () => game.hud.Phone(null));
                }
            }
            if ((saveT -= dt) <= 0) { saveT = 30; Save(); }
            if (active == null)
            {
                var m = Next;
                if (m == null || game.metroRide.Active) return;
                var p = Place(m.giver);
                giver.Place(p.x, p.z, 0.15);
                var pos = pl.Pos;
                double d = Math.Sqrt((pos.x - p.x) * (pos.x - p.x) + (pos.z - p.z) * (pos.z - p.z));
                if (d > 8) armed = true;
                bool near = armed && d < 2.6 && (pl.vehicle == null || pl.vehicle.Speed < 3);
                if (near && !pl.dead && game.police.level == 0) Start(m);
                else if (near && game.police.level > 0) game.hud.Prompt("Lose the police first");
                return;
            }
            var st = active.step;
            var res = Update(st, dt, input, out string fail);
            if (res == "done") Advance();
            else if (fail != null) Fail(fail);
            if (active != null)
            {
                var obj = active.step.objective ?? (active.step.s.type == "talk" ? null : active.step.s.text);
                game.hud.Mission(obj != null ? active.def.title : null, obj ?? "", obj != null ? active.step.timer : null);
            }
        }
    }
}
