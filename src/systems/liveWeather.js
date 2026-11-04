// Bengaluru's real weather, from Open-Meteo (https://open-meteo.com: free, no key, data under
// CC BY 4.0). Every 10 minutes it asks for the current conditions over Majestic and sets the
// game's rain and cloud cover to match: a dry evening is dry, a downpour is a downpour, and a
// thunderstorm brings the lightning. Offline, or with "Live weather" off in the settings, the
// monsoon comes and goes on its own schedule as before.
const URL = 'https://api.open-meteo.com/v1/forecast?latitude=12.9767&longitude=77.5713'
  + '&current=temperature_2m,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,is_day&timezone=Asia%2FKolkata';
const POLL = 600; // seconds

// WMO weather codes: drizzle 51-57, rain 61-67, showers 80-82, thunderstorm 95-99.
const RAINY = (c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;

export function describe(now) {
  if (!now) return null;
  const c = now.weather_code;
  const what = c >= 95 ? '⛈ Thunderstorm' : c >= 80 ? '🌧 Showers' : c >= 61 ? '🌧 Rain' : c >= 51 ? '🌦 Drizzle'
    : c >= 45 && c <= 48 ? '🌫 Mist' : now.cloud_cover > 70 ? '☁ Overcast' : now.cloud_cover > 30 ? (now.is_day ? '⛅ Cloudy' : '☁ Cloudy') : now.is_day ? '☀ Clear' : '🌙 Clear';
  return `${what} ${Math.round(now.temperature_2m)}°C`;
}

export class LiveWeather {
  constructor(env, settings) {
    this.env = env;
    this.settings = settings;
    this.now = null; // the latest reading, or null when there isn't one
    this.t = 0;
    this.busy = false;
    this.paused = false; // K pressed: you're making your own weather this session
  }

  get on() { return this.settings.get('liveWeather') !== false && !this.paused && !!this.now; }

  async poll() {
    if (this.busy || this.paused || this.settings.get('liveWeather') === false || typeof fetch !== 'function') return;
    this.busy = true;
    try {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => ctl?.abort(), 8000);
      const r = await fetch(URL, { signal: ctl?.signal });
      clearTimeout(timer);
      if (r.ok) { this.now = (await r.json()).current || null; this.apply(); }
    } catch { /* offline: the monsoon keeps its own schedule */ }
    this.busy = false;
  }

  // Rain from the last 15 minutes' precipitation (mm), cloud cover from the sky over the city.
  apply() {
    const n = this.now, env = this.env;
    if (!n || this.paused || this.settings.get('liveWeather') === false) return;
    const mm = Math.max(n.precipitation || 0, (n.rain || 0) + (n.showers || 0));
    let rain = !RAINY(n.weather_code) && mm < 0.05 ? 0 : Math.min(1, 0.3 + mm * 0.35);
    if (n.weather_code >= 95) rain = Math.max(rain, 0.85);
    env.rainTarget = rain;
    env.weatherTimer = Infinity; // no random showers while the real sky is in charge
    env.clouds = Math.min(0.55, Math.max(0.1, (n.cloud_cover / 100) * 0.55));
    env.cloudsLocked = true;
  }

  // Let the random monsoon run again (live weather switched off, or K pressed for a shower).
  release() {
    this.env.cloudsLocked = false;
    if (this.env.weatherTimer === Infinity) this.env.weatherTimer = 200 + Math.random() * 200;
  }

  update(dt) {
    if ((this.t -= dt) > 0) return;
    this.t = POLL;
    if (this.settings.get('liveWeather') === false) { if (this.now) { this.now = null; this.release(); } return; }
    this.poll();
  }
}
