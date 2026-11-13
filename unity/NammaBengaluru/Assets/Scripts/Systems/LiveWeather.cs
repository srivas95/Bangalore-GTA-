// Bengaluru's real weather (port of src/systems/liveWeather.js), from Open-Meteo
// (https://open-meteo.com: free, no key, data under CC BY 4.0). Every 10 minutes it asks for the
// current conditions over Majestic and sets the game's rain to match: a dry evening is dry, a
// downpour is a downpour, and a thunderstorm brings the lightning. Offline, or with "Live
// weather" off in the settings, the monsoon comes and goes on its own schedule.
using System;
using System.Collections;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace NammaBengaluru.Systems
{
    public class LiveWeather
    {
        const string URL = "https://api.open-meteo.com/v1/forecast?latitude=12.9767&longitude=77.5713"
            + "&current=temperature_2m,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,is_day&timezone=Asia%2FKolkata";
        const double POLL = 600; // seconds

        public class Now { public double temperature_2m, precipitation, rain, showers, cloud_cover; public int weather_code, is_day; }

        readonly Environment env;
        readonly Settings settings;
        readonly MonoBehaviour host;
        public Now now; // the latest reading, or null when there isn't one
        double t;
        bool busy;
        public bool paused; // K pressed: you're making your own weather this session

        public LiveWeather(Environment env, Settings settings, MonoBehaviour host) { this.env = env; this.settings = settings; this.host = host; }

        public bool On => settings.values.liveWeather && !paused && now != null;

        // WMO weather codes: drizzle 51-57, rain 61-67, showers 80-82, thunderstorm 95-99.
        static bool Rainy(int c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;

        public static string Describe(Now n)
        {
            if (n == null) return null;
            int c = n.weather_code;
            // (The web game's weather emoji are replaced by symbols the HUD font has.)
            string what = c >= 95 ? "☂ Thunderstorm" : c >= 80 ? "☂ Showers" : c >= 61 ? "☂ Rain" : c >= 51 ? "☂ Drizzle"
                : c >= 45 && c <= 48 ? "≈ Mist" : n.cloud_cover > 70 ? "☁ Overcast" : n.cloud_cover > 30 ? "☁ Cloudy" : n.is_day == 1 ? "☀ Clear" : "☾ Clear";
            return $"{what} {Math.Round(n.temperature_2m)}°C";
        }

        IEnumerator Poll()
        {
            if (busy || paused || !settings.values.liveWeather) yield break;
            busy = true;
            using (var req = UnityWebRequest.Get(URL))
            {
                req.timeout = 8;
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success)
                {
                    try { now = JObject.Parse(req.downloadHandler.text)["current"]?.ToObject<Now>(); Apply(); }
                    catch { /* unexpected reply: keep the monsoon's own schedule */ }
                }
            }
            busy = false;
        }

        // Rain from the last 15 minutes' precipitation (mm).
        void Apply()
        {
            var n = now;
            if (n == null || paused || !settings.values.liveWeather) return;
            double mm = Math.Max(n.precipitation, n.rain + n.showers);
            double rain = !Rainy(n.weather_code) && mm < 0.05 ? 0 : Math.Min(1, 0.3 + mm * 0.35);
            if (n.weather_code >= 95) rain = Math.Max(rain, 0.85);
            env.rainTarget = rain;
            env.weatherTimer = double.PositiveInfinity; // no random showers while the real sky is in charge
        }

        // Let the random monsoon run again (live weather switched off, or K pressed for a shower).
        public void Release()
        {
            if (double.IsPositiveInfinity(env.weatherTimer)) env.weatherTimer = 200 + UnityEngine.Random.value * 200;
        }

        public void Restart() { paused = false; t = 0; }

        public void Update(double dt)
        {
            if ((t -= dt) > 0) return;
            t = POLL;
            if (!settings.values.liveWeather) { if (now != null) { now = null; Release(); } return; }
            host.StartCoroutine(Poll());
        }
    }
}
