// Day/night cycle and monsoon weather (port of src/systems/environment.js and the colours of
// src/world/sky.js): a 24-minute day with the sun and a bright blue moon, sky and fog colours,
// rain that comes and goes on its own (K forces it), lightning, wet roads, and flood water that
// fills the underpasses and then the roads themselves.
using System;
using System.Collections.Generic;
using NammaBengaluru.Render;
using NammaBengaluru.World;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace NammaBengaluru.Systems
{
    public class Environment
    {
        const double DAY_MINUTES = 24, UNDERPASS_MAX_WATER = 1.0;
        static double Smooth(double a, double b, double x) { double t = Math.Min(1, Math.Max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
        static double Lerp(double a, double b, double t) => a + (b - a) * t;
        static Color C(int hex) => CityMaterials.Hex(hex);
        // Sunlight colour by elevation: deep orange at the horizon to near-white at midday.
        static readonly (double e, Color c)[] SUN_KEYS = { (0, C(0xff8a4a)), (4, C(0xffb070)), (10, C(0xffd2a0)), (20, C(0xffe8c8)), (40, C(0xfff4e4)) };
        static readonly Color MOON = C(0xb0c4ee);
        // [sun elevation°, zenith, horizon, sun-side glow]
        static readonly (double e, Color z, Color h, Color g)[] KEYS = {
            (-18, C(0x03060e), C(0x0a1120), C(0x000000)), (-10, C(0x060c1e), C(0x152240), C(0x05060c)), (-6, C(0x0f1d3e), C(0x33405e), C(0x2a1420)),
            (-2.5, C(0x22407a), C(0x9a7480), C(0x7a2e14)), (0.5, C(0x335c9a), C(0xe09a72), C(0xa64818)), (5, C(0x4370ac), C(0xeec29c), C(0x7a4818)),
            (14, C(0x4c80c0), C(0xcfd9e2), C(0x2e2618)), (35, C(0x3d7ace), C(0xbad0e6), C(0x221e16)) };
        static readonly Color GREY_DAY_Z = C(0x6c747c), GREY_DAY_H = C(0x9aa1a6), GREY_NIGHT_Z = C(0x111418), GREY_NIGHT_H = C(0x1b1f25);

        public double hour = 16.5, timeScale = 1, rain, rainTarget, weatherTimer, wetness, accum, roadFlood, flash, nextLightning = 8, night, elev, time;
        public Color zenith, horizon, glow;
        public Action<double> onThunder;
        readonly Layout layout;
        readonly Light sun;
        readonly Material skyMat;
        readonly ColorAdjustments grade;
        readonly Light headlight;
        readonly Dictionary<Underpass, GameObject> water = new Dictionary<Underpass, GameObject>();
        readonly GameObject flood;
        readonly ParticleSystem rainFx;
        readonly Material glowMat;
        readonly System.Random rnd = new System.Random();

        public Environment(Layout layout, Transform parent, Dictionary<string, Material> mats)
        {
            this.layout = layout;
            weatherTimer = 150 + rnd.NextDouble() * 120; // real seconds until the first shower
            sun = RenderSettings.sun != null ? RenderSettings.sun : UnityEngine.Object.FindAnyObjectByType<Light>();
            sun.type = LightType.Directional; sun.shadows = LightShadows.Soft;
            RenderSettings.sun = sun;
            skyMat = new Material(Resources.Load<Shader>("Shaders/Sky") ?? Shader.Find("NammaBengaluru/Sky"));
            RenderSettings.skybox = skyMat;
            RenderSettings.fog = true; RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            var vol = UnityEngine.Object.FindAnyObjectByType<Volume>();
            if (vol != null && vol.profile.TryGet(out ColorAdjustments ca)) grade = ca;
            glowMat = mats["glow"];
            // Flood water: a sheet in each underpass, and one following the player over the roads.
            var floodMat = CityMaterials.Make("flood", new CityMaterials.Spec { color = 0x6b5a3e, roughness = 0.08f, metallic = 0.1f, normal = "water_normal", normalScale = 0.25f, mapScale = new Vector2(6, 6) });
            foreach (var u in layout.underpasses)
            {
                var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
                UnityEngine.Object.Destroy(go.GetComponent<Collider>());
                go.name = "flood_" + u.name;
                go.transform.SetParent(parent, false);
                go.transform.localScale = new Vector3((float)u.road.width, (float)(u.half * 2), 1);
                go.transform.rotation = Quaternion.AngleAxis((float)(-Math.Atan2(u.ux, u.uz) * Mathf.Rad2Deg), Vector3.up) * Quaternion.Euler(90, 0, 0);
                go.GetComponent<MeshRenderer>().sharedMaterial = floodMat;
                go.SetActive(false);
                water[u] = go;
            }
            flood = GameObject.CreatePrimitive(PrimitiveType.Quad);
            UnityEngine.Object.Destroy(flood.GetComponent<Collider>());
            flood.name = "roadFlood";
            flood.transform.SetParent(parent, false);
            flood.transform.localScale = new Vector3(900, 900, 1);
            flood.transform.rotation = Quaternion.Euler(90, 0, 0);
            flood.GetComponent<MeshRenderer>().sharedMaterial = floodMat;
            flood.SetActive(false);
            // Rain streaks: a particle system that rides along with the camera.
            var rgo = new GameObject("rain");
            rainFx = rgo.AddComponent<ParticleSystem>();
            var main = rainFx.main; main.startLifetime = 0.9f; main.startSpeed = 0; main.startSize = 0.03f; main.maxParticles = 6000;
            main.simulationSpace = ParticleSystemSimulationSpace.World; main.startColor = new Color(0.75f, 0.8f, 0.85f, 0.35f);
            var vel = rainFx.velocityOverLifetime; vel.enabled = true; vel.space = ParticleSystemSimulationSpace.World; vel.x = 0; vel.y = -24; vel.z = 0;
            var sh = rainFx.shape; sh.shapeType = ParticleSystemShapeType.Box; sh.scale = new Vector3(60, 1, 60); sh.position = new Vector3(0, 18, 0);
            var em = rainFx.emission; em.rateOverTime = 0;
            var pr = rgo.GetComponent<ParticleSystemRenderer>();
            pr.renderMode = ParticleSystemRenderMode.Stretch; pr.velocityScale = 0.06f; pr.lengthScale = 1;
            pr.sharedMaterial = new Material(Shader.Find("Universal Render Pipeline/Particles/Unlit")) { color = new Color(0.8f, 0.85f, 0.9f, 0.4f) };
            // Lamp heads and lit signs brighten at night (the glow shader's _Boost).
            glowMat.SetFloat("_Boost", 1.5f);
            // The player's headlights.
            headlight = new GameObject("headlight").AddComponent<Light>();
            headlight.type = LightType.Spot; headlight.range = 70; headlight.spotAngle = 63; headlight.color = C(0xfff2d8); headlight.intensity = 0;
            headlight.shadows = LightShadows.None;
        }

        public void Skip(double secs) => hour = (hour + secs / (DAY_MINUTES * 60 / 24)) % 24;
        public bool Raining => rainTarget > 0;

        public void SetRain(bool on)
        {
            rainTarget = on ? 0.75 + rnd.NextDouble() * 0.25 : 0;
            weatherTimer = on ? 150 + rnd.NextDouble() * 120 : 200 + rnd.NextDouble() * 200;
        }

        // Water depth at a point (y disambiguates the flyover deck from the road beneath).
        public double WaterDepth(double x, double z, double y)
        {
            double g = layout.GroundHeight(x, z, y), d = 0;
            var u = layout.UnderpassAt(x, z);
            if (u != null) d = Math.Max(d, u.waterLevel - g);
            if (roadFlood > 0.005 && g < 0.06 && g > -0.5) d = Math.Max(d, roadFlood - g);
            return Math.Max(0, d);
        }

        static Color Sample(double e, int idx)
        {
            Color Pick(int k) => idx == 1 ? KEYS[k].z : idx == 2 ? KEYS[k].h : KEYS[k].g;
            if (e <= KEYS[0].e) return Pick(0);
            for (int k = 1; k < KEYS.Length; k++)
                if (e <= KEYS[k].e)
                {
                    double t = (e - KEYS[k - 1].e) / (KEYS[k].e - KEYS[k - 1].e);
                    return Color.Lerp(Pick(k - 1), Pick(k), (float)(t * t * (3 - 2 * t)));
                }
            return Pick(KEYS.Length - 1);
        }

        public string ClockString()
        {
            int h = (int)Math.Floor(hour), m = (int)Math.Floor((hour - h) * 60);
            return $"{(h + 11) % 12 + 1}:{m:00} {(h >= 12 ? "PM" : "AM")}";
        }

        public void Update(double dt, double fx, double fz, Entities.Vehicle playerVehicle, Camera cam)
        {
            hour = (hour + dt * timeScale / (DAY_MINUTES * 60 / 24)) % 24;
            time += dt;
            weatherTimer -= dt;
            if (weatherTimer <= 0) SetRain(!Raining);
            rain += Math.Sign(rainTarget - rain) * Math.Min(Math.Abs(rainTarget - rain), dt / 12);

            // Sun: rises in the east, sets in the west (game coordinates: +x east, +z south).
            elev = Math.Sin((hour - 6) / 12 * Math.PI) * 72;
            double az = (90 + (hour - 6) / 12 * 180) * Math.PI / 180, phi = (90 - elev) * Math.PI / 180;
            double sx = Math.Sin(phi) * Math.Sin(az), sy = Math.Cos(phi), sz = Math.Sin(phi) * Math.Cos(az);
            night = 1 - Smooth(-8, 3, elev);
            double day = 1 - night;
            double dayness = Math.Min(1, Math.Max(0, (elev + 6) / 12));
            zenith = Color.Lerp(Sample(elev, 1), Color.Lerp(GREY_NIGHT_Z, GREY_DAY_Z, (float)dayness), (float)(rain * 0.9));
            horizon = Color.Lerp(Sample(elev, 2), Color.Lerp(GREY_NIGHT_H, GREY_DAY_H, (float)dayness), (float)(rain * 0.9));
            glow = Sample(elev, 3) * (float)(1 - rain * 0.85);

            // Sun by day, moon by night (same light).
            Vector3 lightDir;
            if (elev > -1)
            {
                int k = 1;
                while (k < SUN_KEYS.Length - 1 && elev > SUN_KEYS[k].e) k++;
                sun.color = Color.Lerp(SUN_KEYS[k - 1].c, SUN_KEYS[k].c, (float)Math.Min(1, Math.Max(0, (elev - SUN_KEYS[k - 1].e) / (SUN_KEYS[k].e - SUN_KEYS[k - 1].e))));
                // (three.js intensity 3.5 at exposure 0.9 reads like about 1.7 here.)
                sun.intensity = (float)(1.7 * Smooth(-1, 8, elev) * (1 - rain * 0.8));
                lightDir = Game.ToUnity(sx, sy, sz);
            }
            else
            {
                // A bright, blue moon: night should read as night but stay playable.
                sun.color = MOON;
                sun.intensity = (float)(0.55 * Smooth(-1, -6, elev) * (1 - rain * 0.6));
                var d = -Game.ToUnity(sx, sy, sz); d.y = Mathf.Abs(d.y) + 0.3f;
                lightDir = d.normalized;
            }
            sun.transform.rotation = Quaternion.LookRotation(-lightDir);

            // Ambient from the sky itself: a pale sky tint from above, warm ground bounce below; bluer by night.
            var c1 = Color.Lerp(zenith, horizon, 0.35f);
            float lum = Mathf.Max(1e-4f, c1.r * 0.3f + c1.g * 0.59f + c1.b * 0.11f);
            c1 = Color.Lerp(c1, new Color(lum, lum, lum), (float)(0.55 * day));
            var hemi = Color.Lerp(c1 * Mathf.Min(4, 0.62f / lum), new Color(0.55f, 0.62f, 0.8f), (float)(night * 0.6));
            float hemiI = (float)(Lerp(0.8, 0.55, day) * (1 - rain * 0.3) + flash * 2.5) / 0.7f;
            RenderSettings.ambientSkyColor = hemi * hemiI;
            RenderSettings.ambientEquatorColor = Color.Lerp(hemi, horizon, 0.5f) * hemiI * 0.8f;
            RenderSettings.ambientGroundColor = Color.HSVToRGB(0.08f, 0.45f, (float)Lerp(0.2, 0.36, day) * 1.4f) * hemiI;
            if (grade != null) grade.postExposure.value = (float)(Math.Log(Lerp(0.95, 1.5, night) + flash * 0.6, 2) - 0.08);

            // Fog takes the horizon's colour exactly, so the city fades into the sky.
            RenderSettings.fogColor = horizon;
            float far = (float)Lerp(Lerp(800, 560, night), 240, rain);
            RenderSettings.fogEndDistance = far;
            RenderSettings.fogStartDistance = Mathf.Min((float)Lerp(150, 25, rain), far * 0.5f);
            skyMat.SetColor("_Zenith", zenith); skyMat.SetColor("_Horizon", horizon); skyMat.SetColor("_Glow", glow);
            skyMat.SetVector("_SunDir", Game.ToUnity(sx, sy, sz));
            skyMat.SetFloat("_SunVis", elev > -1.5 ? (float)(1 - rain) : 0);
            skyMat.SetFloat("_Stars", (float)(Math.Min(1, Math.Max(0, (-elev - 7) / 6)) * (1 - rain)));
            skyMat.SetFloat("_Moon", (float)(Math.Min(1, Math.Max(0, (-elev - 3) / 6)) * (1 - rain * 0.9)));

            // Lightning (and thunder) in heavy rain.
            flash = Math.Max(0, flash - dt * 5);
            if (rain > 0.6 && (nextLightning -= dt) <= 0) { flash = 1; nextLightning = 6 + rnd.NextDouble() * 14; onThunder?.Invoke(0.4 + rnd.NextDouble() * 2.5); }

            // Rain streaks around the camera.
            if (cam != null) rainFx.transform.position = cam.transform.position;
            var em = rainFx.emission; em.rateOverTime = (float)(5000 * Math.Min(1, rain * 1.2));
            if (rain > 0.02 && !rainFx.isPlaying) rainFx.Play();

            // Wet roads and flooding: underpasses collect up to a metre of water after a long
            // shower, enough to drown a scooter but not to swallow a bus.
            wetness += ((rain > 0.1 ? 1 : 0) - wetness) * Math.Min(1, dt / (rain > 0.1 ? 25 : 120));
            if (rain > 0.1) accum = Math.Min(1, accum + rain * dt / 210); else accum = Math.Max(0, accum - dt / 400);
            foreach (var u in layout.underpasses)
            {
                u.waterLevel = -u.depth - 0.08 + Smooth(0, 1, accum) * (UNDERPASS_MAX_WATER + 0.08);
                var go = water[u];
                bool on = u.waterLevel > -u.depth + 0.02;
                if (go.activeSelf != on) go.SetActive(on);
                if (on) go.transform.position = Game.ToUnity(u.cx, u.waterLevel, u.cz);
            }
            roadFlood = Smooth(0.6, 1, accum) * 0.08;
            flood.SetActive(roadFlood > 0.01);
            if (flood.activeSelf) flood.transform.position = Game.ToUnity(fx, Math.Max(0.02, roadFlood), fz);
            Shader.SetGlobalFloat("_NB_Night", (float)night);
            Shader.SetGlobalFloat("_NB_Wet", (float)wetness);

            // The player's headlights at night (and in heavy rain).
            var v = playerVehicle;
            if (v != null && (night > 0.3 || rain > 0.5))
            {
                double hx = Math.Sin(v.heading), hz = Math.Cos(v.heading);
                headlight.transform.position = Game.ToUnity(v.x + hx * v.spec.length * 0.5, v.y + 1.0, v.z + hz * v.spec.length * 0.5);
                headlight.transform.LookAt(Game.ToUnity(v.x + hx * 25, v.y, v.z + hz * 25));
                headlight.intensity = (float)(30 * Math.Max(night, rain * 0.6));
            }
            else headlight.intensity = 0;
        }
    }
}
