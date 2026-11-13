// The game's sound (port of src/systems/audio.js), built from the same recordings
// (Resources/Audio, see SOUND_CREDITS.md) and mixed the same way:
//  - engines: recorded RPM layers per class, crossfaded and re-pitched with the revs, for your
//    vehicle and the nearest traffic (with Doppler); a starter when you get on a motorbike;
//  - horns (attack, then the sustain looped for as long as the blast lasts) and the siren,
//    placed in the stereo field and muffled with distance;
//  - ambience beds mixed by time of day, weather and place (parks, lakes, crowds), street dogs
//    after dark; rolling noise (road roar in a closed car, tyres, scraping);
//  - one-shots: crashes, hits, doors, footsteps, voices, thunder, splashes, cows;
//  - the musical cues (ping, cash, sting) and the generative radio, synthesised as in audioSynth.js.
// Web Audio's per-sound gain, pan and low-pass become an AudioSource (2D, panned) with an
// AudioLowPassFilter; setTargetAtTime becomes per-frame exponential smoothing; loop points are cut
// into their own clips at load. (The small convolution reverb is not ported.)
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.Entities;
using NammaBengaluru.World;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace NammaBengaluru.Systems
{
    // A gain envelope applied on the audio thread: a short attack at `start`, a release after `end`
    // (DSP times), so scheduled blasts start and stop without clicks.
    public class Envelope : MonoBehaviour
    {
        public double start = double.NegativeInfinity, end = double.PositiveInfinity, attack = 0.006, release = 0.05;
        int rate;
        void Awake() { rate = AudioSettings.outputSampleRate; }
        void OnAudioFilterRead(float[] data, int ch)
        {
            double t0 = AudioSettings.dspTime, s = start, e = end;
            int n = data.Length / ch;
            double t1 = t0 + (double)n / rate;
            if (t0 >= s + attack && t1 <= e) return;
            for (int i = 0; i < n; i++)
            {
                double t = t0 + (double)i / rate, g = 1;
                if (t < s + attack) g = Math.Max(0, (t - s) / attack);
                if (t > e) g = Math.Max(0, 1 - (t - e) / release);
                if (g == 1) continue;
                for (int c = 0; c < ch; c++) data[i * ch + c] *= (float)g;
            }
        }
    }

    public class GameAudio : MonoBehaviour
    {
        public static GameAudio I { get; private set; }
        static double Clamp(double v, double a, double b) => Math.Max(a, Math.Min(b, v));
        static double Smooth(double a, double b, double v) { double t = Clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
        static readonly System.Random R = new System.Random();
        static double Rnd() => R.NextDouble();

        // Engine classes: idle and redline firing pitch (Hz), gear count and loudness.
        class Eng { public double idle, max, vol; public int gears; }
        static readonly Dictionary<string, Eng> ENG = new Dictionary<string, Eng> {
            ["scooter"] = new Eng { idle = 48.9, max = 132, gears = 1, vol = 0.5 },
            ["bike"] = new Eng { idle = 9.3, max = 50, gears = 4, vol = 0.75 },
            ["sport"] = new Eng { idle = 39.9, max = 205, gears = 6, vol = 0.6 },
            ["auto"] = new Eng { idle = 30.6, max = 96, gears = 4, vol = 0.7 },
            ["car"] = new Eng { idle = 22.7, max = 118, gears = 5, vol = 0.55 },
            ["bus"] = new Eng { idle = 25.45, max = 140, gears = 4, vol = 0.85 },
        };

        // Horns: which recording, pitch, level and how long a blast lasts. Bengaluru honks in bursts.
        class HornDef { public string s; public double p, v, step, @ref = 10; public double[] d, tune; public bool once; public int repeat; }
        static readonly Dictionary<string, HornDef> HORNS = new Dictionary<string, HornDef> {
            ["scooter"] = new HornDef { s = "horn_small", p = 1.0, v = 0.5, d = new[] { 0.11, 0.2 } },
            ["scooterHi"] = new HornDef { s = "horn_small", p = 1.2, v = 0.45, d = new[] { 0.09, 0.16 } },
            ["bike"] = new HornDef { s = "horn_moto", p = 0.9, v = 0.6, d = new[] { 0.16, 0.3 } },
            ["sport"] = new HornDef { s = "horn_moto2", p = 1.0, v = 0.55, d = new[] { 0.1, 0.2 } },
            ["auto"] = new HornDef { s = "horn_small", p = 1.32, v = 0.55, d = new[] { 0.12, 0.22 } },
            ["autoLow"] = new HornDef { s = "horn_small", p = 1.08, v = 0.55, d = new[] { 0.14, 0.26 } },
            ["car"] = new HornDef { s = "horn_car", p = 1.0, v = 0.6, d = new[] { 0.16, 0.34 } },
            ["car2"] = new HornDef { s = "horn_car2", p = 1.0, v = 0.6, d = new[] { 0.18, 0.38 } },
            ["carHi"] = new HornDef { s = "horn_car", p = 1.18, v = 0.55, d = new[] { 0.14, 0.28 } },
            ["suv"] = new HornDef { s = "horn_low", p = 1.25, v = 0.7, d = new[] { 0.28, 0.5 } },
            ["police"] = new HornDef { s = "horn_car2", p = 0.92, v = 0.65, d = new[] { 0.22, 0.4 } },
            ["tempo"] = new HornDef { s = "horn_low", p = 1.55, v = 0.6, d = new[] { 0.2, 0.34 } },
            ["ace"] = new HornDef { s = "horn_small", p = 1.5, v = 0.45, d = new[] { 0.07, 0.1 }, repeat = 3 },
            ["lorry"] = new HornDef { s = "horn_truck", p = 0.5 / 408, v = 0.7, tune = new double[] { 523, 659, 784, 659, 523, 784, 1046 }, step = 0.13 },
            ["air"] = new HornDef { s = "horn_air", p = 1.0, v = 0.85, d = new[] { 0.7, 1.2 }, once = true },
            ["bus"] = new HornDef { s = "horn_bus", p = 1.0, v = 0.85, d = new[] { 0.4, 0.8 }, once = true },
            ["schoolBus"] = new HornDef { s = "horn_bus", p = 1.3, v = 0.75, d = new[] { 0.3, 0.5 } },
            ["train"] = new HornDef { s = "horn_train", p = 1.0, v = 1.0, d = new[] { 1.6, 2.8 }, once = true, @ref = 40 },
        };

        class BankEntry { public string file; public double[] loop, sustain; public double f0, gain = 1; public string g; public bool store; }
        Dictionary<string, BankEntry> bank;
        readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>(); // whole recordings
        readonly Dictionary<string, AudioClip> loops = new Dictionary<string, AudioClip>(); // just the loop region
        readonly Dictionary<string, AudioClip> sustained = new Dictionary<string, AudioClip>(); // attack + repeated sustain
        readonly Dictionary<string, List<string>> prefixes = new Dictionary<string, List<string>>();

        // ---------- voices ----------
        class Src
        {
            public GameObject go; public AudioSource a; public AudioLowPassFilter lp; public Envelope env;
            public double busyUntil;
            public double vol, pan, cut = 18000, pitch = 1; // smoothed targets (set per frame)
        }
        readonly List<Src> pool = new List<Src>();

        Src NewSrc(string name)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            var s = new Src { go = go, a = go.AddComponent<AudioSource>(), lp = go.AddComponent<AudioLowPassFilter>(), env = go.AddComponent<Envelope>() };
            s.a.playOnAwake = false; s.a.spatialBlend = 0; s.a.dopplerLevel = 0;
            s.lp.cutoffFrequency = 22000; s.lp.lowpassResonanceQ = 0.7f;
            return s;
        }

        Src Free()
        {
            double now = AudioSettings.dspTime;
            foreach (var s in pool) if (!s.a.isPlaying && s.busyUntil < now) return s;
            if (pool.Count >= 64) return null;
            var n = NewSrc("sfx" + pool.Count); pool.Add(n); return n;
        }

        static float Exp(double dt, double tc) => (float)(1 - Math.Exp(-dt / Math.Max(1e-4, tc)));

        // Placement: gain, pan and air-absorption cutoff for a sound at (x, z) heard from the camera.
        struct Place { public double g, pan, lp, d; }
        double lisX, lisZ, lisVX, lisVZ, lisRX = 1, lisRZ;
        bool hasListener;
        Place At(double? x, double? z, double @ref = 8, double roll = 1)
        {
            if (x == null || z == null || !hasListener) return new Place { g = 1, pan = 0, lp = 20000, d = 0 };
            double dx = x.Value - lisX, dz = z.Value - lisZ, d = Math.Sqrt(dx * dx + dz * dz);
            double g = d <= @ref ? 1 : @ref / (@ref + (d - @ref) * roll);
            double pan = d > 0.5 ? Clamp((dx * lisRX + dz * lisRZ) / d, -1, 1) * Math.Min(1, d / 5) * 0.8 : 0;
            double lp = Clamp(18000 / (1 + d / 35), 900, 18000);
            return new Place { g = g, pan = pan, lp = lp, d = d };
        }

        // Bus levels (the Web Audio graph's gain nodes).
        double trafficBus = 0.8, trafficBusT = 0.8, ambLP = 18000, ambLPT = 18000;
        const double SFX = 1, ENGBUS = 1;

        // Play a sound once. Returns the source, or null when it's inaudible or unknown.
        Src Play(string key, double vol = 1, double rate = 1, double? x = null, double? z = null, double @ref = 8, double roll = 1, double delay = 0,
                 double bus = SFX, double dur = 0, bool sustain = false, double attack = 0.002, double release = 0.01)
        {
            if (!enabledAudio) return null;
            var clip = sustain ? Sustained(key) : Clip(key);
            if (clip == null) return null;
            var p = At(x, z, @ref, roll);
            double gv = vol * p.g * bus;
            if (gv < 0.003) return null;
            var s = Free();
            if (s == null) return null;
            s.a.clip = clip; s.a.loop = false;
            s.a.volume = (float)Math.Min(1, gv); s.a.pitch = (float)Clamp(rate, 0.05, 3); s.a.panStereo = (float)p.pan;
            s.lp.cutoffFrequency = (float)Math.Min(22000, p.lp < 17000 ? p.lp : 22000);
            double t = AudioSettings.dspTime + 0.02 + delay;
            s.env.start = t; s.env.attack = attack; s.env.release = release;
            double len = clip.length / s.a.pitch;
            s.env.end = dur > 0 ? t + dur : double.PositiveInfinity;
            s.a.PlayScheduled(t);
            if (dur > 0) s.a.SetScheduledEndTime(t + dur + release + 0.01);
            s.busyUntil = t + (dur > 0 ? dur + release + 0.02 : len + 0.05);
            return s;
        }

        // ---------- clips ----------
        AudioClip Clip(string key)
        {
            if (clips.TryGetValue(key, out var c)) return c;
            if (bank == null || !bank.TryGetValue(key, out var info)) return null;
            c = Resources.Load<AudioClip>((info.store ? "StoreAudio/" : "Audio/") + info.file);
            if (c != null && c.loadState != AudioDataLoadState.Loaded) c.LoadAudioData();
            clips[key] = c;
            return c;
        }

        // The loop region [loop0, loop1) as a clip of its own, so an AudioSource can loop it.
        AudioClip Loop(string key)
        {
            if (loops.TryGetValue(key, out var l)) return l;
            var c = Clip(key);
            if (c == null) return null;
            var info = bank[key];
            if (info.loop == null) { loops[key] = c; return c; }
            int ch = c.channels, f = c.frequency;
            int a = (int)(info.loop[0] * f), b = Math.Min(c.samples, (int)(info.loop[1] * f));
            var all = new float[c.samples * ch]; c.GetData(all, 0);
            var seg = new float[(b - a) * ch];
            Array.Copy(all, a * ch, seg, 0, seg.Length);
            l = AudioClip.Create(key + "_loop", b - a, ch, f, false);
            l.SetData(seg, 0);
            loops[key] = l;
            return l;
        }

        // A horn: its attack, then the sustain region repeated to 12 s (blasts are cut short by
        // the envelope; a horn held longer starts over).
        AudioClip Sustained(string key)
        {
            if (sustained.TryGetValue(key, out var l)) return l;
            var c = Clip(key);
            if (c == null) return null;
            var info = bank[key];
            if (info.sustain == null) { sustained[key] = c; return c; }
            int ch = c.channels, f = c.frequency;
            int s0 = (int)(info.sustain[0] * f), s1 = Math.Min(c.samples, (int)(info.sustain[1] * f));
            var all = new float[c.samples * ch]; c.GetData(all, 0);
            int total = Math.Max(s1, 12 * f);
            var o = new float[total * ch];
            Array.Copy(all, 0, o, 0, s1 * ch);
            for (int i = s1; i < total; i += s1 - s0) Array.Copy(all, s0 * ch, o, i * ch, Math.Min(s1 - s0, total - i) * ch);
            l = AudioClip.Create(key + "_sus", total, ch, f, false);
            l.SetData(o, 0);
            sustained[key] = l;
            return l;
        }

        string Pick(string prefix, string gender = null)
        {
            if (!prefixes.TryGetValue(prefix, out var keys))
                prefixes[prefix] = keys = bank.Keys.Where(k => k.StartsWith(prefix + "_")).ToList();
            var ks = keys;
            if (gender != null) { var g = keys.Where(k => bank[k].g == gender).ToList(); if (g.Count > 0) ks = g; }
            return ks.Count > 0 ? ks[R.Next(ks.Count)] : null;
        }

        // ---------- engines ----------
        class EngineVoice
        {
            public string cls;
            public readonly List<(Src s, double b)> layers = new List<(Src, double)>();
            public double vol, lp = 3000, pan, f = 1, dop = 1;
            public bool stopping; public double stopTc;
        }
        static string[] EngineLayers(Dictionary<string, BankEntry> bank, string cls) =>
            new[] { $"eng_{cls}_idle", $"eng_{cls}_0", $"eng_{cls}_1", $"eng_{cls}_2" }.Where(bank.ContainsKey).ToArray();

        EngineVoice NewEngine(string cls)
        {
            var e = new EngineVoice { cls = cls };
            foreach (var key in EngineLayers(bank, cls))
            {
                var s = NewSrc("eng_" + key);
                var clip = Loop(key);
                s.a.clip = clip; s.a.loop = true; s.a.volume = 0;
                s.a.timeSamples = R.Next(Math.Max(1, clip.samples));
                s.a.Play();
                e.layers.Add((s, bank[key].f0));
            }
            return e;
        }

        // f: firing pitch (Hz); vol: level; lp: cutoff; pan; doppler pitch factor. Smoothed with tc.
        void SetEngine(EngineVoice e, double f, double vol, double lp, double pan, double dop, double tc, double dt)
        {
            var L = e.layers;
            int i = 0;
            while (i < L.Count - 1 && f > L[i + 1].b) i++;
            var w = new double[L.Count];
            if (f <= L[0].b) w[0] = 1;
            else if (i == L.Count - 1) w[i] = 1;
            else { double p = Math.Log(f / L[i].b) / Math.Log(L[i + 1].b / L[i].b); w[i] = Math.Cos(p * Math.PI / 2); w[i + 1] = Math.Sin(p * Math.PI / 2); }
            float k = Exp(dt, tc), kv = Exp(dt, 0.08), kp = Exp(dt, 0.05);
            e.vol += (vol - e.vol) * kv; e.lp += (lp - e.lp) * k; e.pan += (pan - e.pan) * kp;
            for (int j = 0; j < L.Count; j++)
            {
                var s = L[j].s;
                s.pitch += (Clamp(f / L[j].b * dop, 0.25, 3) - s.pitch) * k;
                s.vol += (w[j] - s.vol) * k;
                s.a.pitch = (float)s.pitch; s.a.volume = (float)Math.Min(1, s.vol * e.vol); s.a.panStereo = (float)e.pan;
                s.lp.cutoffFrequency = (float)Math.Min(22000, e.lp);
            }
        }

        void StopEngine(EngineVoice e, double fade) { e.stopping = true; e.stopTc = fade / 3; dying.Add(e); }
        readonly List<EngineVoice> dying = new List<EngineVoice>();
        void FadeDying(double dt)
        {
            for (int i = dying.Count - 1; i >= 0; i--)
            {
                var e = dying[i];
                e.vol *= 1 - Exp(dt, e.stopTc);
                foreach (var (s, _) in e.layers) s.a.volume = (float)(s.vol * e.vol);
                if (e.vol < 0.002) { foreach (var (s, _) in e.layers) Destroy(s.go); dying.RemoveAt(i); }
            }
        }

        // Revs (0 idle .. 1 redline) from road speed through a simple gearbox.
        static double Revs(VehicleSpec spec, string cls, double speed, double thr)
        {
            var e = ENG[cls];
            double sp = Clamp(Math.Abs(speed) / spec.maxSpeed, 0, 1);
            if (sp < 0.03) return thr > 0.1 ? 0.18 + 0.2 * thr : 0;
            double r;
            if (e.gears > 1)
            {
                double pos = Math.Min(sp * e.gears * 1.05, e.gears - 0.001); int g = (int)Math.Floor(pos); double within = pos - g;
                r = g == 0 ? 0.12 + within * 0.75 : 0.38 + within * 0.55;
            }
            else r = 0.12 + sp * 0.82;
            return Clamp(r + thr * 0.07, 0, 1);
        }

        // ---------- state ----------
        bool enabledAudio;
        public double rainLevel;
        double busy, crowd, dogT = 8, crowdT, rpm;
        EngineVoice pEng; Vehicle pEngV;
        readonly Dictionary<Vehicle, EngineVoice> traffic = new Dictionary<Vehicle, EngineVoice>();
        readonly Dictionary<Vehicle, double> prevSpeed = new Dictionary<Vehicle, double>();
        readonly Dictionary<Vehicle, double> passed = new Dictionary<Vehicle, double>();
        readonly HashSet<Vehicle> passedOnce = new HashSet<Vehicle>();
        class Bed { public Src s; public double quiet; }
        readonly Dictionary<string, Bed> beds = new Dictionary<string, Bed>();
        class LoopV { public string key; public Src s; public int quiet; }
        readonly Dictionary<string, LoopV> loopVoices = new Dictionary<string, LoopV>();
        List<(double x, double z, double r, string kind)> zones;
        int? stepIdx; double lastPhase;
        Src hornHeld; bool hornTune; double hornTuneNext; HornDef hornTuneDef; double hornTunePitch;
        Src[] sirens;
        double sirenNear, sirenFar;
        public double volume = 0.8;

        public static GameAudio Create(MapData md)
        {
            var go = new GameObject("Audio");
            var a = go.AddComponent<GameAudio>();
            a.Init(md);
            return a;
        }

        void Init(MapData md)
        {
            I = this;
            var json = JObject.Parse(Resources.Load<TextAsset>("Data/soundBank").text);
            bank = new Dictionary<string, BankEntry>();
            foreach (var p in json.Properties())
            {
                var o = (JObject)p.Value;
                bank[p.Name] = new BankEntry
                {
                    file = (string)o["file"], loop = o["loop"]?.ToObject<double[]>(), sustain = o["sustain"]?.ToObject<double[]>(),
                    f0 = (double?)o["f0"] ?? 0, gain = (double?)o["gain"] ?? 1, g = (string)o["g"],
                };
            }
            // Recordings from Unity Asset Store packs, when this build has them (Assets/StoreAssets is
            // kept out of the public repository): they replace the game's own under the same key, and
            // new numbered keys join the pools (punch_10 is picked with the other punches).
            var store = Resources.Load<TextAsset>("StoreAudio/bank");
            if (store != null)
                foreach (var p in JObject.Parse(store.text).Properties())
                {
                    var o = (JObject)p.Value;
                    bank[p.Name] = new BankEntry
                    {
                        file = (string)o["file"], loop = o["loop"]?.ToObject<double[]>(), sustain = o["sustain"]?.ToObject<double[]>(),
                        f0 = (double?)o["f0"] ?? 0, gain = (double?)o["gain"] ?? 1, g = (string)o["g"], store = true,
                    };
                }
            (double, double, double) Circle(List<double[]> poly)
            {
                double x = poly.Average(q => q[0]), z = poly.Average(q => q[1]), r = 0;
                foreach (var q in poly) r = Math.Max(r, Math.Sqrt((q[0] - x) * (q[0] - x) + (q[1] - z) * (q[1] - z)));
                return (x, z, r);
            }
            zones = md.PARKS.Select(p => { var (x, z, r) = Circle(p.poly); return (x, z, r, "park"); })
                .Concat(md.LAKES.Select(l => { var (x, z, r) = Circle(l.poly); return (x, z, r, "lake"); })).ToList();
            AudioListener.volume = (float)(0.9 * volume);
            enabledAudio = true;
            // Load the engines and horns up front (the web game preloads everything but the beds).
            foreach (var cls in ENG.Keys) foreach (var k in EngineLayers(bank, cls)) Loop(k);
            foreach (var h in HORNS.Values) Sustained(h.s);
        }

        void OnDestroy() { if (I == this) I = null; }

        // ---------- every frame ----------
        public void Tick(double dt, Camera cam, Player player, List<Vehicle> vehicles, StreetLife street, Environment env, Layout layout)
        {
            if (!enabledAudio || cam == null) return;
            var p = cam.transform.position; var r = cam.transform.right;
            double px = p.x, pz = -p.z;
            if (hasListener && dt > 0) { lisVX = (px - lisX) / dt; lisVZ = (pz - lisZ) / dt; }
            lisX = px; lisZ = pz;
            double rl = Math.Sqrt(r.x * r.x + r.z * r.z); if (rl < 1e-6) rl = 1;
            lisRX = r.x / rl; lisRZ = -r.z / rl;
            hasListener = true;
            trafficBus += (trafficBusT - trafficBus) * Exp(dt, 0.3);
            ambLP += (ambLPT - ambLP) * Exp(dt, 0.3);
            UpdateTraffic(dt, player, vehicles);
            UpdateAmbience(dt, player, street, env);
            UpdateFootsteps(player, dt);
            UpdateTyres(dt, player.vehicle, layout);
            FadeDying(dt);
            UpdateHornTune();
            UpdateRadio();
        }

        // The nearest moving traffic gets real engines; the rest of the city is the ambience bed.
        void UpdateTraffic(double dt, Player player, List<Vehicle> vehicles)
        {
            const int max = 8; const double RR = 65;
            var cand = new List<(Vehicle v, double d)>();
            var pv = player.vehicle;
            bool exposed = pv == null || pv.spec.twoWheeler || pv.spec.engine == "auto";
            int moving = 0;
            foreach (var v in vehicles)
            {
                if (v == null || v == pv || v.driver == null || v.wrecked || v.engineDead || !(v.view is VehicleView vv) || !vv.Go.activeSelf) continue;
                double d = Math.Sqrt((v.x - lisX) * (v.x - lisX) + (v.z - lisZ) * (v.z - lisZ)), sp = v.Speed;
                if (d < 45 && sp > 3) moving++;
                if (d < RR) cand.Add((v, d));
                // A lorry or bus thundering past within a few metres of you on foot (or a bike).
                if (v.spec.engine == "bus" && exposed && d < 7 && sp > 7)
                {
                    if (passed.TryGetValue(v, out double was) && d > was + 0.05 && was < 5.5 && !passedOnce.Contains(v))
                    { passedOnce.Add(v); Play("passby_truck", 0.75 * Smooth(7, 16, sp), 0.9 + sp / 80, v.x, v.z, 6); }
                    passed[v] = d;
                }
                else if (d > 12) { passed.Remove(v); passedOnce.Remove(v); }
            }
            busy += (Math.Min(1, moving / 10.0) - busy) * Math.Min(1, dt * 0.8);
            cand.Sort((a, b) => a.d.CompareTo(b.d));
            var keep = new HashSet<Vehicle>(cand.Take(max).Select(c => c.v));
            foreach (var v in traffic.Keys.ToList()) if (!keep.Contains(v)) { StopEngine(traffic[v], 0.3); traffic.Remove(v); prevSpeed.Remove(v); }
            foreach (var (v, d) in cand.Take(max))
            {
                string cls = v.spec.engine;
                if (cls == null || !ENG.ContainsKey(cls)) continue;
                if (!traffic.TryGetValue(v, out var voice)) traffic[v] = voice = NewEngine(cls);
                double sp = v.Speed;
                double prev = prevSpeed.TryGetValue(v, out var pp) ? pp : sp;
                prevSpeed[v] = sp;
                double thr = dt > 0 ? Clamp((sp - prev) / dt / (v.spec.accel * 0.6), 0, 1) : 0;
                double rv = Revs(v.spec, cls, sp, thr);
                var E = ENG[cls];
                double f = E.idle * Math.Pow(E.max / E.idle, rv);
                var pl = At(v.x, v.z, 5, 1);
                double dx = v.x - lisX, dz = v.z - lisZ, dd = Math.Max(0.5, d);
                double vr = ((v.vx - lisVX) * dx + (v.vz - lisVZ) * dz) / dd;
                double dop = Clamp(343 / (343 + vr), 0.88, 1.12);
                SetEngine(voice, f, E.vol * (0.45 + 0.4 * thr + 0.15 * rv) * pl.g * 0.9 * trafficBus, Math.Min(pl.lp, 1200 + 5000 * (0.35 + 0.65 * Math.Max(thr, rv))), pl.pan, dop, 0.08, dt);
            }
        }

        void UpdateAmbience(double dt, Player player, StreetLife street, Environment env)
        {
            double night = env?.night ?? 0, day = 1 - night, hour = env?.hour ?? 12, rain = rainLevel;
            double park = 0, lake = 0;
            foreach (var z in zones)
            {
                double k = Clamp(1 - (Math.Sqrt((lisX - z.x) * (lisX - z.x) + (lisZ - z.z) * (lisZ - z.z)) - z.r * 0.7) / 90, 0, 1);
                if (z.kind == "park") park = Math.Max(park, k); else lake = Math.Max(lake, k);
            }
            // Dawn and dusk chorus: birds and temple bells around 6-8 am and 5-7 pm.
            double chorus = Math.Max(Smooth(5, 6.5, hour) * (1 - Smooth(8, 9.5, hour)), Smooth(16.5, 17.5, hour) * (1 - Smooth(18.7, 19.5, hour)));
            void Level(string key, double v, double tc = 1.2)
            {
                beds.TryGetValue(key, out var b);
                bool lazy = key != "amb_city";
                if (b != null && v < 0.005 && lazy)
                {
                    // Unheard for a minute: let it go.
                    if ((b.quiet += dt) > 60) { Destroy(b.s.go); beds.Remove(key); return; }
                }
                else if (b != null) b.quiet = 0;
                if (b == null)
                {
                    if (v < 0.005) return;
                    var clip = Loop(key);
                    if (clip == null) return;
                    var s = NewSrc("bed_" + key);
                    s.a.clip = clip; s.a.loop = true; s.a.volume = 0; s.a.timeSamples = R.Next(Math.Max(1, clip.samples)); s.a.Play();
                    beds[key] = b = new Bed { s = s };
                }
                b.s.vol += (v - b.s.vol) * Exp(dt, tc);
                b.s.a.volume = (float)Math.Min(1, b.s.vol);
                b.s.lp.cutoffFrequency = (float)Math.Min(22000, ambLP);
            }
            double open = 1 - 0.6 * Math.Max(park, lake);
            Level("amb_city", (0.5 * day + 0.14) * (1 - 0.45 * rain) * open);
            Level("amb_city_night", 0.4 * Smooth(0.3, 0.9, night) * (1 - 0.5 * rain) * open);
            Level("amb_traffic", 0.5 * Smooth(0.05, 0.8, busy) * (1 - 0.4 * rain) * open, 0.8);
            int n = 0;
            if (street != null) foreach (var p in street.peds) if (Math.Abs(p.x - lisX) < 30 && Math.Abs(p.z - lisZ) < 30) n++;
            crowd += (Math.Min(1, n / 14.0) - crowd) * Math.Min(1, dt);
            Level("amb_walla_0", 0.55 * crowd * (0.4 + 0.6 * day) * (1 - 0.7 * rain));
            Level("amb_park", (0.55 * Math.Max(park, lake * 0.6) * day + 0.25 * chorus) * (1 - 0.7 * rain));
            Level("amb_night", 0.45 * Smooth(0.3, 0.9, night) * (1 - 0.8 * rain) * (1 - 0.5 * lake));
            Level("amb_frogs", 0.6 * lake * Smooth(0.4, 0.9, night + rain * 0.5));
            Level("rain_light", 0.55 * Smooth(0.02, 0.4, rain));
            Level("rain_heavy", 0.55 * Smooth(0.45, 1, rain));
            Level("rain_city", 0.6 * Smooth(0.08, 0.5, rain) * open);
            Level("rain_storm", 0.7 * Smooth(0.7, 1, rain));
            // Street dogs set each other off after dark.
            if (night > 0.6 && rain < 0.5 && (dogT -= dt) <= 0)
            {
                dogT = 12 + Rnd() * 35;
                double a = Rnd() * Math.PI * 2, d = 25 + Rnd() * 60, x = lisX + Math.Cos(a) * d, z = lisZ + Math.Sin(a) * d;
                int k = 1 + (int)Math.Floor(Rnd() * 3);
                for (int j = 0; j < k; j++) { var key = Pick("dog"); if (key != null) Play(key, 0.45, 0.9 + Rnd() * 0.25, x, z, 12, 1, j * (0.35 + Rnd() * 0.4)); }
            }
            // A closed car muffles the street; an auto or a two-wheeler doesn't.
            var v = player.vehicle;
            bool cabin = v != null && !v.spec.twoWheeler && v.spec.engine != "auto";
            bool under = (v != null ? v.y : player.y) < -1.6;
            ambLPT = cabin ? 1400 : under ? 5000 : 18000;
            trafficBusT = cabin ? 0.45 : 0.8;
        }

        void UpdateFootsteps(Player player, double dt)
        {
            var h = player.human;
            if (h == null || player.vehicle != null || player.InTransition || !player.grounded) { stepIdx = null; return; }
            // A foot lands each time the walk cycle passes a stride extreme.
            int idx = (int)Math.Floor((h.phase - Math.PI / 2) / Math.PI);
            if (stepIdx != null && idx != stepIdx && h.phase != lastPhase)
            {
                bool run = dt > 0 && (h.phase - lastPhase) / dt > 8;
                var k = Pick("step");
                if (k != null) Play(k, run ? 0.5 : 0.32, 0.9 + Rnd() * 0.2);
            }
            stepIdx = idx; lastPhase = h.phase;
        }

        // A named running loop: started once it's audible, then level, pitch and place follow
        // every frame; released after a few seconds of silence.
        void LoopSet(string name, string key, double vol, double rate, Place? p, double dt, double bus = SFX)
        {
            loopVoices.TryGetValue(name, out var l);
            if (l != null && l.key != key) { Destroy(l.s.go); loopVoices.Remove(name); l = null; }
            if (l == null)
            {
                if (vol < 0.005) return;
                var clip = Loop(key);
                if (clip == null) return;
                var s = NewSrc("loop_" + name);
                s.a.clip = clip; s.a.loop = true; s.a.volume = 0; s.a.timeSamples = R.Next(Math.Max(1, clip.samples)); s.a.Play();
                loopVoices[name] = l = new LoopV { key = key, s = s };
            }
            float k = Exp(dt, 0.08);
            l.s.vol += (vol * (p?.g ?? 1) * bus - l.s.vol) * k;
            l.s.pitch += (rate - l.s.pitch) * k;
            l.s.a.volume = (float)Math.Min(1, l.s.vol); l.s.a.pitch = (float)Clamp(l.s.pitch, 0.05, 3);
            l.s.a.panStereo = (float)(p?.pan ?? 0);
            l.s.lp.cutoffFrequency = (float)Math.Min(22000, p?.lp ?? 22000);
            if (vol >= 0.005) l.quiet = 0;
            else if (++l.quiet > 180) { Destroy(l.s.go); loopVoices.Remove(name); }
        }

        // Tyres: tarmac screech, gravel off the road, a motorbike's rear wheel; bodywork scraping
        // along a wall; road roar in a closed car.
        void UpdateTyres(double dt, Vehicle v, Layout layout)
        {
            double level = 0, scrape = 0, roar = 0, sp = 0; string key = "skid";
            if (v != null && v.driver == "player" && v.y > -5)
            {
                sp = v.Speed;
                double wet = (v.waterDepth > 0.1 ? 0 : 1) * (1 - 0.6 * rainLevel);
                if (v.spec.twoWheeler) { key = "skid_moto"; level = Smooth(0.1, 0.32, v.slip) * Smooth(4, 10, sp) * wet; }
                else
                {
                    level = Smooth(0.14, 0.4, v.slip) * Smooth(4, 12, sp) * wet;
                    var b = level > 0.01 ? layout.BlockContaining(v.x, v.z) : null;
                    if (b != null && (b.zone == "park" || b.zone == "rural" || b.zone == "lake")) key = "skid_gravel";
                }
                scrape = v.touchT > 0 ? Smooth(1.5, 10, sp) : 0;
                if (!v.spec.twoWheeler) roar = Smooth(2, 24, sp) * (v.spec.engine == "auto" ? 0.35 : 0.5);
            }
            foreach (var k in new[] { "skid", "skid_gravel", "skid_moto" }) LoopSet(k, k, k == key ? level * 0.55 : 0, 0.9 + 0.2 * level, null, dt);
            LoopSet("scrape", "scrape", scrape * 0.6, 0.8 + 0.4 * Smooth(2, 20, sp), null, dt);
            LoopSet("cabin_road", "cabin_road", roar, 0.75 + 0.45 * Smooth(0, 30, sp), null, dt, ENGBUS);
        }

        // ---------- the player's engine ----------
        public void Engine(Vehicle vehicle, double dt)
        {
            if (!enabledAudio) return;
            if (vehicle == null) { StopPlayerEngine(); return; }
            string cls = vehicle.spec.engine;
            if (cls == null || !ENG.ContainsKey(cls)) return;
            if (vehicle.stalled || vehicle.engineDead || vehicle.wrecked) { if (pEng != null) { StopEngine(pEng, 0.4); pEng = null; } return; }
            if (pEng == null || pEng.cls != cls || pEngV != vehicle)
            {
                if (pEng != null) StopEngine(pEng, 0.2);
                // Getting on a motorbike: the starter and the first catch of the engine.
                if (pEngV != vehicle && (cls == "sport" || cls == "bike")) Play(cls == "sport" ? "start_sport" : "start_moto", 0.55, cls == "bike" ? 0.8 : 1);
                pEng = NewEngine(cls);
                pEngV = vehicle;
                rpm = 0;
            }
            double thr = Math.Abs(vehicle.throttleIn);
            double target = Revs(vehicle.spec, cls, vehicle.ForwardSpeed, thr);
            rpm += (target - rpm) * Math.Min(1, Math.Min(0.1, dt) * (target > rpm ? 7 : 5));
            var E = ENG[cls];
            double f = E.idle * Math.Pow(E.max / E.idle, rpm);
            double load = 0.35 + 0.65 * thr;
            SetEngine(pEng, f, E.vol * (0.55 + 0.45 * load) * ENGBUS, 900 + 7000 * load * (0.4 + 0.6 * rpm), 0, 1, 0.04, dt);
        }

        public void StopPlayerEngine() { if (pEng != null) { StopEngine(pEng, 0.5); pEng = null; } pEngV = null; }

        // ---------- horns & siren ----------
        void BlastAt(HornDef h, double pitch, double vol, double at, double dur, double? x, double? z)
        {
            Play(h.s, vol, h.p * pitch, x, z, h.@ref, 1, at, SFX, dur, true, 0.006, 0.05);
        }

        public void Horn(string kind, double x, double z, double pitch = 1)
        {
            if (!enabledAudio) return;
            if (kind == null || !HORNS.TryGetValue(kind, out var h)) h = HORNS["car"];
            if (At(x, z, h.@ref).g * h.v < 0.01) return;
            if (h.tune != null) { for (int k = 0; k < h.tune.Length; k++) BlastAt(h, h.tune[k] * pitch, h.v, k * h.step, h.step * 0.85, x, z); return; }
            double Rd(double[] a) => a[0] + Rnd() * (a[1] - a[0]);
            if (h.once) { BlastAt(h, pitch, h.v, 0, Rd(h.d), x, z); return; }
            int n = h.repeat > 0 ? h.repeat : Rnd() < 0.45 ? 1 : Rnd() < 0.7 ? 2 : 3;
            double at = 0;
            for (int k = 0; k < n; k++)
            {
                double d = Rd(h.d) * (k == n - 1 && Rnd() < 0.4 ? 1.8 : 1);
                BlastAt(h, pitch, h.v, at, d, x, z);
                at += d + 0.06 + Rnd() * 0.06;
            }
        }

        // The player's horn, held for as long as the key is.
        public void HornHold(string kind, bool on, double pitch = 1)
        {
            if (!enabledAudio) return;
            if (kind == null || !HORNS.TryGetValue(kind, out var h)) h = HORNS["car"];
            bool holding = hornHeld != null || hornTune;
            if (on && !holding)
            {
                if (h.tune != null) { hornTune = true; hornTuneDef = h; hornTunePitch = pitch; hornTuneNext = 0; UpdateHornTune(); }
                else
                {
                    hornHeld = Play(h.s, h.v * 1.1, h.p * pitch, null, null, 10, 1, 0, SFX, 0, true, 0.006, 0.05);
                    if (hornHeld != null) { hornHeld.a.loop = true; hornHeld.busyUntil = double.PositiveInfinity; }
                }
            }
            else if (!on && holding)
            {
                if (hornHeld != null)
                {
                    double t = AudioSettings.dspTime;
                    hornHeld.env.end = t; hornHeld.a.SetScheduledEndTime(t + 0.1); hornHeld.busyUntil = t + 0.15; hornHeld.a.loop = false;
                    hornHeld = null;
                }
                hornTune = false;
            }
        }

        void UpdateHornTune()
        {
            if (!hornTune) return;
            double now = AudioSettings.dspTime;
            if (now < hornTuneNext) return;
            var h = hornTuneDef;
            for (int k = 0; k < h.tune.Length; k++) BlastAt(h, h.tune[k] * hornTunePitch, h.v * 1.1, k * h.step, h.step * 0.85, null, null);
            hornTuneNext = now + h.tune.Length * h.step + 0.2;
        }

        // Loudness of the nearest wailing Hoysala (0..1): the close recording near, the distant one far.
        public void Siren(double level, double dt)
        {
            if (!enabledAudio) return;
            if (sirens == null && level <= 0) return;
            if (sirens == null)
                sirens = new[] { "siren_near", "siren_far" }.Select(k =>
                {
                    var s = NewSrc(k); var c = Loop(k);
                    s.a.clip = c; s.a.loop = true; s.a.volume = 0; s.a.Play();
                    return s;
                }).ToArray();
            double near = level * level, far = Clamp(level * (1 - level) * 2.2, 0, 1) * 0.9;
            float k2 = Exp(dt, 0.15);
            sirenNear += (near * 0.75 - sirenNear) * k2; sirenFar += (far * 0.75 - sirenFar) * k2;
            sirens[0].a.volume = (float)sirenNear; sirens[1].a.volume = (float)sirenFar;
        }

        public void SetRain(double intensity) => rainLevel = intensity;

        // ---------- one-shots ----------
        public void Thud(double strength = 0.5)
        {
            var k = strength < 0.35 ? Pick("metal") : Pick("crash");
            if (k != null) Play(k, 0.3 + 0.7 * strength, 1.05 - strength * 0.2 + Rnd() * 0.12);
        }

        public void Crunch(double strength = 0.5)
        {
            var k = Pick("metal");
            if (k != null) Play(k, 0.25 + 0.6 * strength, 0.85 + Rnd() * 0.3);
            if (strength > 0.55) { var g = Pick("glass"); if (g != null) Play(g, 0.5 * strength, 0.9 + Rnd() * 0.2, null, null, 8, 1, 0.03); }
        }

        public void Explosion(double x, double z)
        {
            var k = Pick("explosion");
            if (k != null) Play(k, 1, 0.85 + Rnd() * 0.15, x, z, 30, 0.5);
            var c = Pick("crash");
            if (c != null) Play(c, 0.5, 0.7, x, z, 20, 1, 0.25);
        }

        public void Gunshot(string kind, double? x = null, double? z = null)
        {
            string key = kind == "katta" ? "gun_katta" : "gun_revolver";
            var p = At(x, z, 15, 0.7);
            Play(key, 0.95, 0.95 + Rnd() * 0.1, x, z, 15, 0.7);
            // Far away you mostly hear the crack bouncing off the buildings.
            if (p.d > 40) Play("gun_far", 0.5 * Clamp((p.d - 40) / 80, 0, 1), 1, x, z, 60, 0.5);
        }

        public void Click() => Play("gun_click", 0.55, 1 + Rnd() * 0.1);
        public void Punch(bool kick = false) { var k = Pick("punch"); if (k != null) Play(k, kick ? 0.9 : 0.75, (kick ? 0.82 : 0.95) + Rnd() * 0.15); }
        public void Whoosh() { var k = Pick("whoosh"); if (k != null) Play(k, 0.35, 0.9 + Rnd() * 0.3); }

        // A recorded voice: a random take of a key prefix, placed in the world (or right here).
        public bool Voice(string prefix, double? x = null, double? z = null, double vol = 0.9, double @ref = 6, double? rate = null, string gender = null)
        {
            var key = Pick(prefix, gender);
            if (key == null) return false;
            Play(key, vol * bank[key].gain, rate ?? 0.97 + Rnd() * 0.06, x, z, @ref, 1.4);
            return true;
        }
        public void Grunt(bool high = false, double? x = null, double? z = null) => Voice(high ? "vo_hit_f" : "vo_hit_m", x, z);
        public void Effort(bool high = false) { if (Rnd() < 0.6) Voice(high ? "vo_effort_f" : "vo_effort_m", null, null, 0.7); }
        public void Scream(bool high, double x, double z) => Voice(high ? "vo_scream_f" : "vo_scream_m", x, z, 0.8, 10);
        public void Death(bool high, double x, double z) => Voice(high ? "vo_death_f" : "vo_death_m", x, z);
        public void CrowdScream(double x, double z)
        {
            if (Time.time < crowdT) return;
            if (Voice("vo_crowd_scream", x, z, 0.7, 14)) crowdT = Time.time + 8;
        }
        public void Splash() => Play("splash", 0.5, 0.85 + Rnd() * 0.35);

        // kind: open, close, exit (open, step out, shut) or mount (swinging onto a two-wheeler).
        public void Door(string kind = "close")
        {
            if (kind == "mount") { var k = Pick("step"); if (k != null) Play(k, 0.35, 0.8); return; }
            string Alt(string k) => Rnd() < 0.5 && bank.ContainsKey(k + "_b") ? k + "_b" : k;
            if (kind == "open" || kind == "exit") Play(Alt("door_open"), 0.55, 0.95 + Rnd() * 0.1);
            if (kind == "close") Play(Alt("door_close"), 0.7, 0.95 + Rnd() * 0.1);
            if (kind == "exit") Play(Alt("door_close"), 0.7, 0.95 + Rnd() * 0.1, null, null, 8, 1, 0.65);
        }

        public void Moo(double x, double z) { var k = Pick("moo"); if (k != null) Play(k, 0.6, 0.92 + Rnd() * 0.16, x, z, 10); }

        public void Thunder(double delay = 1, double strength = 1)
        {
            string b = strength > 0.85 ? "thunder_near" : "thunder_far";
            string key = Rnd() < 0.5 && bank.ContainsKey(b + "_b") ? b + "_b" : b;
            Play(key, 0.45 + 0.5 * strength, 0.9 + Rnd() * 0.2, null, null, 8, 1, delay);
        }

        public void MetroDoors() => Play("metro_chime", 0.6);

        // ---------- the synthesised cues (audioSynth.js) ----------
        readonly Dictionary<string, AudioClip> synth = new Dictionary<string, AudioClip>();

        // An oscillator note with a 10 ms attack and 30 ms release, as tone() in audioSynth.js.
        AudioClip Tone(string type, double freq, double dur)
        {
            string key = $"{type}:{freq:F1}:{dur:F2}";
            if (synth.TryGetValue(key, out var c)) return c;
            int rate = 44100, n = (int)((dur + 0.05) * rate);
            var d = new float[n];
            for (int i = 0; i < n; i++)
            {
                double t = (double)i / rate, ph = (t * freq) % 1;
                double w = type == "sine" ? Math.Sin(ph * 2 * Math.PI) : type == "triangle" ? 1 - 4 * Math.Abs(ph - 0.5) : 2 * ph - 1;
                double g = t < 0.01 ? t / 0.01 : t > dur ? 0 : t > Math.Max(0.02, dur - 0.03) ? (dur - t) / Math.Max(1e-3, dur - Math.Max(0.02, dur - 0.03)) : 1;
                d[i] = (float)(w * g);
            }
            c = AudioClip.Create(key, n, 1, rate, false); c.SetData(d, 0);
            synth[key] = c;
            return c;
        }

        void PlayTone(double[] freqs, string type, double dur, double vol, double lp, double at)
        {
            foreach (var fr in freqs)
            {
                var s = Free(); if (s == null) return;
                s.a.clip = Tone(type, fr, dur); s.a.loop = false;
                s.a.volume = (float)vol; s.a.pitch = (float)(0.985 + Rnd() * 0.03); s.a.panStereo = 0;
                s.lp.cutoffFrequency = (float)lp;
                double t = AudioSettings.dspTime + 0.02 + at;
                s.env.start = double.NegativeInfinity; s.env.end = double.PositiveInfinity;
                s.a.PlayScheduled(t); s.busyUntil = t + dur + 0.1;
            }
        }

        public void Ping() { PlayTone(new[] { 880.0 }, "sine", 0.1, 0.2, 2400, 0); PlayTone(new[] { 1320.0 }, "sine", 0.15, 0.2, 2400, 0.11); }
        public void Cash() { var f = new[] { 1046.0, 1318, 1568, 2093 }; for (int k = 0; k < 4; k++) PlayTone(new[] { f[k] }, "triangle", 0.12, 0.18, 4000, k * 0.07); }
        public void Sting(bool bad = true)
        {
            var notes = bad ? new double[] { 392, 370, 349, 262 } : new double[] { 523, 659, 784 };
            for (int k = 0; k < notes.Length; k++) PlayTone(new[] { notes[k], notes[k] / 2 }, "sawtooth", 0.35, 0.12, 1500, k * 0.25);
        }

        // Generative "radio": a tabla-ish beat with a melody, only while driving.
        bool radioOn; int radioStep; double radioNext;
        static readonly int[] SCALE = { 0, 2, 4, 7, 9, 12, 14 };
        public void Radio(bool on) { if (on && !radioOn) { radioStep = 0; radioNext = AudioSettings.dspTime + 0.05; } radioOn = on; }

        AudioClip Drum(double f)
        {
            string key = "drum" + f;
            if (synth.TryGetValue(key, out var c)) return c;
            int rate = 44100, n = (int)(0.3 * rate);
            var d = new float[n]; double ph = 0;
            for (int i = 0; i < n; i++)
            {
                double t = (double)i / rate;
                double fr = t < 0.08 ? f * 2 * Math.Pow(0.5, t / 0.08) : f;
                ph += fr / rate;
                d[i] = (float)(Math.Sin(ph * 2 * Math.PI) * Math.Max(0.001, Math.Pow(0.001, t / 0.25)));
            }
            c = AudioClip.Create(key, n, 1, rate, false); c.SetData(d, 0);
            synth[key] = c;
            return c;
        }

        void UpdateRadio()
        {
            if (!radioOn) return;
            double now = AudioSettings.dspTime;
            while (radioNext < now + 0.2)
            {
                double at = Math.Max(0, radioNext - now);
                void DrumAt(double f, double v)
                {
                    var s = Free(); if (s == null) return;
                    s.a.clip = Drum(f); s.a.loop = false; s.a.volume = (float)v; s.a.pitch = 1; s.a.panStereo = 0; s.lp.cutoffFrequency = 22000;
                    s.env.start = double.NegativeInfinity; s.env.end = double.PositiveInfinity;
                    s.a.PlayScheduled(now + at); s.busyUntil = now + at + 0.35;
                }
                if (radioStep % 4 == 0 || radioStep % 8 == 3) DrumAt(90, 0.25);
                if (radioStep % 4 == 2) DrumAt(320, 0.12);
                if (radioStep % 2 == 0 && Rnd() < 0.7) PlayTone(new[] { 196 * Math.Pow(2, SCALE[R.Next(SCALE.Length)] / 12.0) }, "triangle", 0.22, 0.05, 2400, at - 0.02);
                radioStep++;
                radioNext += 0.16;
            }
        }
    }
}
