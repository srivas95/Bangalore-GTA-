// Graphics, gameplay and control settings, with quality presets. Saved in localStorage and shown
// as a panel from the pause screen.
const KEY = 'namma-bengaluru-settings-v1';

export const PRESETS = {
  // shadows: 'off', 'near' (a small area round the player, cheap enough for phones) or 'full'.
  // Phones default to Low: sharp (most of the frame cost was rooftop tanks, since fixed), with
  // the savings in shadow range, haze distance and crowds.
  low: { resScale: 0.85, shadows: 'near', bloom: false, drawDist: 0.7, traffic: 0.6, peds: 0.5 },
  medium: { resScale: 0.8, shadows: 'full', bloom: false, drawDist: 0.75, traffic: 0.8, peds: 0.75 },
  // Bloom is optional everywhere: lights get their glow from halos, so every device looks alike.
  high: { resScale: 1, shadows: 'full', bloom: false, drawDist: 1, traffic: 1, peds: 1 },
};

export const isTouchDevice = () => typeof window !== 'undefined' && (matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);

const defaults = () => ({
  quality: isTouchDevice() ? 'low' : 'high', ...PRESETS[isTouchDevice() ? 'low' : 'high'],
  sensitivity: 1, invertY: false, volume: 0.8, radioVol: 0.7, voices: 'auto', touch: 'auto', detail: 'auto',
});

export class Settings {
  constructor() {
    this.values = defaults();
    try { Object.assign(this.values, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage blocked */ }
    // Older saves stored shadows as on/off.
    if (this.values.shadows === true) this.values.shadows = 'full';
    if (this.values.shadows === false) this.values.shadows = 'off';
    this.listeners = [];
  }

  get(k) { return this.values[k]; }

  set(patch, silent = false) {
    Object.assign(this.values, patch);
    // Touching an individual graphics option makes the preset "custom".
    if (!('quality' in patch) && Object.keys(patch).some((k) => k in PRESETS.high)) this.values.quality = 'custom';
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* ignore */ }
    if (!silent) for (const f of this.listeners) f(this.values);
  }

  preset(name) {
    if (PRESETS[name]) this.set({ quality: name, ...PRESETS[name] });
  }

  onChange(f) { this.listeners.push(f); f(this.values); }

  // World detail for the next start: 'full' on computers, 'lite' on phones (see world/detail.js).
  get detailLevel() {
    const ok = (d) => d === 'full' || d === 'lite' || d === 'min';
    // The desktop app's "restart with lighter graphics" passes ?detail=lite.
    const q = typeof location !== 'undefined' && new URLSearchParams(location.search).get('detail');
    if (ok(q)) return q;
    const d = this.values.detail;
    if (ok(d)) return d;
    // Auto: phones and computers with little memory (deviceMemory is in GB, capped at 8) get Lite.
    const mem = typeof navigator !== 'undefined' && navigator.deviceMemory;
    return isTouchDevice() || (mem && mem < 8) ? 'lite' : 'full';
  }

  get touchEnabled() { return this.values.touch === 'on' || (this.values.touch === 'auto' && isTouchDevice()); }

  // The panel: built on demand inside the pause screen.
  buildPanel(parent) {
    const el = document.createElement('div');
    el.id = 'settings';
    parent.appendChild(el);
    this.panel = el;
    const row = (label, control) => `<label class="srow"><span>${label}</span>${control}</label>`;
    const slider = (k, min, max, step) => `<input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}"><output data-o="${k}"></output>`;
    const check = (k) => `<input type="checkbox" data-k="${k}">`;
    el.innerHTML = `
      <h2>Settings</h2>
      ${row('Quality', `<select data-k="quality"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="custom" disabled>Custom</option></select>`)}
      ${row('Resolution', slider('resScale', 0.4, 1, 0.05))}
      ${row('Shadows', `<select data-k="shadows"><option value="off">Off</option><option value="near">Near you</option><option value="full">Full</option></select>`)}
      ${row('Bloom (extra glow)', check('bloom'))}
      ${row('Draw distance', slider('drawDist', 0.4, 1, 0.05))}
      ${row('Traffic', slider('traffic', 0.2, 1.2, 0.05))}
      ${row('Pedestrians', slider('peds', 0.2, 1.2, 0.05))}
      ${row('Look sensitivity', slider('sensitivity', 0.3, 2.5, 0.05))}
      ${row('Invert look up/down', check('invertY'))}
      ${row('Volume', slider('volume', 0, 1, 0.05))}
      ${row('Radio volume', slider('radioVol', 0, 1, 0.05))}
      ${row('Voices <small data-o="voicesInfo"></small>', `<select data-k="voices"><option value="auto">Device voices</option><option value="synth">Synthesised</option><option value="off">Off</option></select>`)}
      ${row('World detail <small>(after restart)</small>', `<select data-k="detail"><option value="auto">Auto</option><option value="full">Full</option><option value="lite">Lite (phones)</option><option value="min">Minimum</option></select>`)}
      ${row('Touch controls', `<select data-k="touch"><option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option></select>`)}
      <div class="sbtns"><button data-act="close">Done</button><button data-act="reset" class="ghost">Reset save game</button></div>`;
    const sync = () => {
      for (const c of el.querySelectorAll('[data-k]')) {
        const v = this.values[c.dataset.k];
        if (c.type === 'checkbox') c.checked = !!v; else c.value = v;
      }
      for (const o of el.querySelectorAll('[data-o]')) {
        const k = o.dataset.o, v = this.values[k];
        if (k === 'voicesInfo') { o.textContent = this.voicesInfo ? `(${this.voicesInfo()})` : ''; continue; }
        o.textContent = k === 'resScale' || k === 'drawDist' || k === 'traffic' || k === 'peds' || k === 'volume' || k === 'radioVol' ? `${Math.round(v * 100)}%` : `${(+v).toFixed(2)}×`;
      }
    };
    el.addEventListener('input', (e) => {
      const c = e.target, k = c.dataset.k;
      if (!k) return;
      if (k === 'quality') this.preset(c.value);
      else this.set({ [k]: c.type === 'checkbox' ? c.checked : c.type === 'range' ? +c.value : c.value });
      sync();
    });
    el.addEventListener('click', (e) => {
      const act = e.target.dataset?.act;
      if (act === 'close') this.toggle(false);
      if (act === 'reset' && confirm('Erase your story progress and money?')) { this.onReset?.(); e.target.textContent = 'Save erased'; }
    });
    sync();
    this.sync = sync;
  }

  toggle(show) {
    if (!this.panel) return;
    const on = show ?? !this.panel.classList.contains('show');
    this.panel.classList.toggle('show', on);
    if (on) this.sync();
  }
}
