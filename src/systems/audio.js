// The game's sound, built from real recordings (see SOUND_CREDITS.md):
//  - engines: three recorded RPM layers per vehicle class (scooter, Bullet, auto, car, diesel),
//    crossfaded and re-pitched with the revs, for your vehicle and the nearest traffic;
//  - horns and the Hoysala siren, placed in the stereo field and muffled with distance;
//  - ambience beds for the city by day, parks, crickets at night, frogs by the lakes, rain, and the
//    inside of a metro train, mixed by time of day, weather and where you are;
//  - hits, crashes, guns, doors, footsteps, tyre screech, thunder, cows;
//  - a small room reverb that opens up in underpasses and the metro.
// Everything decodes off the main thread while the city builds. Until a sound is ready (or if the
// files can't be fetched) the old synthesised version plays instead.
import BANK from './soundBank.json';
import { SynthAudio } from './audioSynth.js';
import { PARKS, LAKES } from '../world/mapdata.js';
import { DETAIL } from '../world/detail.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Engine classes: idle and redline firing pitch (Hz), gear count and loudness.
const ENG = {
  scooter: { idle: 48.9, max: 132, gears: 1, vol: 0.5 },
  bike: { idle: 9.3, max: 50, gears: 4, vol: 0.75 },
  auto: { idle: 30.6, max: 96, gears: 4, vol: 0.7 },
  car: { idle: 22.7, max: 118, gears: 5, vol: 0.55 },
  bus: { idle: 50.2, max: 140, gears: 4, vol: 0.85 },
};

// Horns: which recording, pitch, level and how long a blast lasts. Bengaluru honks in bursts.
const HORNS = {
  scooter: { s: 'horn_small', p: 1.0, v: 0.5, d: [0.11, 0.2] },
  scooterHi: { s: 'horn_small', p: 1.2, v: 0.45, d: [0.09, 0.16] },
  bike: { s: 'horn_small', p: 0.8, v: 0.6, d: [0.16, 0.3] },
  auto: { s: 'horn_small', p: 1.32, v: 0.55, d: [0.12, 0.22] },
  autoLow: { s: 'horn_small', p: 1.08, v: 0.55, d: [0.14, 0.26] },
  car: { s: 'horn_car', p: 1.0, v: 0.6, d: [0.16, 0.34] },
  car2: { s: 'horn_car2', p: 1.0, v: 0.6, d: [0.18, 0.38] },
  carHi: { s: 'horn_car', p: 1.18, v: 0.55, d: [0.14, 0.28] },
  suv: { s: 'horn_low', p: 1.25, v: 0.7, d: [0.28, 0.5] },
  police: { s: 'horn_car2', p: 0.92, v: 0.65, d: [0.22, 0.4] },
  tempo: { s: 'horn_low', p: 1.55, v: 0.6, d: [0.2, 0.34] },
  ace: { s: 'horn_small', p: 1.5, v: 0.45, d: [0.07, 0.1], repeat: 3 },
  lorry: { s: 'horn_truck', p: 0.5 / 408, v: 0.7, tune: [523, 659, 784, 659, 523, 784, 1046], step: 0.13 },
  air: { s: 'horn_air', p: 1.0, v: 0.85, d: [0.7, 1.2], once: true },
  bus: { s: 'horn_bus', p: 1.0, v: 0.85, d: [0.4, 0.8], once: true },
  schoolBus: { s: 'horn_bus', p: 1.3, v: 0.75, d: [0.3, 0.5] },
  train: { s: 'horn_train', p: 1.0, v: 1.0, d: [1.6, 2.8], once: true, ref: 40 },
};

// Loaded on first use rather than at start. Ambience beds other than the city's are also dropped
// again after a while unheard, to keep memory down on phones.
const LAZY = /^(thunder|amb_(?!city)|rain_|metro_chime|explosion)/;
const VOICES = () => (DETAIL.min ? 3 : DETAIL.lite ? 5 : 8);

// Parks and lakes as rough circles, for the ambience.
const ZONES = [...PARKS.map((p) => ({ ...circle(p.poly), kind: 'park' })), ...LAKES.map((l) => ({ ...circle(l.poly), kind: 'lake' }))];
function circle(poly) {
  let x = 0, z = 0;
  for (const [px, pz] of poly) { x += px; z += pz; }
  x /= poly.length; z /= poly.length;
  let r = 0;
  for (const [px, pz] of poly) r = Math.max(r, Math.hypot(px - x, pz - z));
  return { x, z, r };
}

// Fetch a file next to index.html. fetch() can't read file:// (the desktop app), so fall back to XHR.
function loadBytes(url) {
  return fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).catch(() => new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.responseType = 'arraybuffer';
    x.onload = () => (x.response && (x.status === 0 || x.status === 200) ? res(x.response) : rej(new Error('load ' + url)));
    x.onerror = () => rej(new Error('load ' + url));
    x.send();
  }));
}

// Decode at a modest sample rate (memory matters on phones). An OfflineAudioContext needs no user
// gesture, so this can run before the player presses Start.
function decodeAt(bytes, rate) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let oc;
  try { oc = new OAC(1, 1, rate); } catch { oc = new OAC(1, 1, 44100); } // older Safari: 22.05-96 kHz only
  return new Promise((res, rej) => {
    const p = oc.decodeAudioData(bytes, res, rej);
    if (p?.then) p.then(res, rej);
  });
}

// Fold a stereo buffer down to mono (half the memory).
function mono(ab) {
  const opts = { numberOfChannels: 1, length: ab.length, sampleRate: ab.sampleRate };
  const out = window.AudioBuffer && AudioBuffer.length !== undefined ? new AudioBuffer(opts) : null;
  if (!out) return ab;
  const d = out.getChannelData(0), l = ab.getChannelData(0), r = ab.getChannelData(1);
  for (let i = 0; i < d.length; i++) d[i] = (l[i] + r[i]) * 0.5;
  return out;
}

// One running engine: three looping RPM layers -> low-pass -> level -> pan.
class EngineVoice {
  constructor(au, cls, dest) {
    const c = au.ctx;
    this.cls = cls;
    this.out = c.createGain(); this.out.gain.value = 0;
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 3000; this.lp.Q.value = 0.5;
    this.pan = c.createStereoPanner ? c.createStereoPanner() : null;
    this.lp.connect(this.out);
    if (this.pan) this.out.connect(this.pan).connect(dest); else this.out.connect(dest);
    this.layers = [0, 1, 2].map((i) => {
      const key = `eng_${cls}_${i}`, info = BANK[key];
      const src = c.createBufferSource();
      src.buffer = au.buf[key];
      src.loop = true;
      src.loopStart = info.loop[0]; src.loopEnd = info.loop[1];
      const g = c.createGain(); g.gain.value = 0;
      src.connect(g).connect(this.lp);
      src.start(c.currentTime, info.loop[0] + Math.random() * (info.loop[1] - info.loop[0]));
      return { src, g, b: info.f0 };
    });
    this.ctx = c;
  }

  // f: firing pitch (Hz); vol: output level; lp: filter cutoff; pan -1..1; doppler: pitch factor.
  set(f, vol, lp, pan = 0, doppler = 1, tc = 0.05) {
    const t = this.ctx.currentTime, L = this.layers;
    let i = 0;
    while (i < L.length - 1 && f > L[i + 1].b) i++;
    const w = [0, 0, 0];
    if (f <= L[0].b) w[0] = 1;
    else if (i === L.length - 1) w[i] = 1;
    else {
      const p = Math.log(f / L[i].b) / Math.log(L[i + 1].b / L[i].b);
      w[i] = Math.cos(p * Math.PI / 2); w[i + 1] = Math.sin(p * Math.PI / 2);
    }
    L.forEach((l, k) => {
      l.src.playbackRate.setTargetAtTime(clamp((f / l.b) * doppler, 0.25, 3), t, tc);
      l.g.gain.setTargetAtTime(w[k], t, tc);
    });
    this.lp.frequency.setTargetAtTime(lp, t, tc);
    this.out.gain.setTargetAtTime(vol, t, 0.08);
    if (this.pan) this.pan.pan.setTargetAtTime(pan, t, 0.05);
  }

  stop(fade = 0.15) {
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, fade / 3);
    for (const l of this.layers) l.src.stop(t + fade + 0.05);
    setTimeout(() => this.pan?.disconnect(), (fade + 0.2) * 1000);
  }
}

// Revs (0 idle .. 1 redline) from road speed through a simple gearbox.
function revs(spec, cls, speed, thr) {
  const e = ENG[cls];
  const sp = clamp(Math.abs(speed) / spec.maxSpeed, 0, 1);
  if (sp < 0.03) return thr > 0.1 ? 0.18 + 0.2 * thr : 0; // idling, or revving to pull away
  let r;
  if (e.gears > 1) {
    const pos = Math.min(sp * e.gears * 1.05, e.gears - 0.001), g = Math.floor(pos), within = pos - g;
    r = g === 0 ? 0.12 + within * 0.75 : 0.38 + within * 0.55;
  } else r = 0.12 + sp * 0.82; // scooters: a CVT holds the revs up
  return clamp(r + thr * 0.07, 0, 1);
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.buf = {};
    this.loading = {};
    this.synth = new SynthAudio();
    this.rainLevel = 0;
    this.traffic = new Map(); // vehicle -> EngineVoice
    this.prevSpeed = new WeakMap();
    this.beds = {};
    this.lis = null;
    this.stepIdx = null;
    // Start fetching and decoding straight away; no audio context is needed for that.
    if (window.OfflineAudioContext || window.webkitOfflineAudioContext) this.preload();
  }

  preload() {
    const keys = Object.keys(BANK).filter((k) => !LAZY.test(k));
    let next = 0;
    const worker = () => {
      if (next >= keys.length) return Promise.resolve();
      return this.load(keys[next++]).catch(() => {}).then(worker);
    };
    this.ready = Promise.all([worker(), worker(), worker()]).then(() => { this.loaded = true; });
  }

  load(key) {
    if (this.buf[key] || this.loading[key]) return this.loading[key] || Promise.resolve(this.buf[key]);
    const info = BANK[key];
    const rate = key.startsWith('amb_') || key.startsWith('rain_') ? (DETAIL.min ? 16000 : 22050) : (DETAIL.min ? 24000 : 32000);
    this.loading[key] = loadBytes(`./audio/${info.file}.mp3`).then((b) => decodeAt(b, rate)).then((ab) => {
      if (DETAIL.lite && ab.numberOfChannels > 1) ab = mono(ab);
      this.buf[key] = ab;
      delete this.loading[key];
      return ab;
    }).catch((err) => { this.failed = true; console.warn('sound', key, err); delete this.loading[key]; throw err; });
    return this.loading[key];
  }

  // The decoded buffer, or null (starting a load if it's one of the lazy ones).
  get(key) {
    const b = this.buf[key];
    if (!b && BANK[key] && !this.loading[key]) this.load(key).catch(() => {});
    return b || null;
  }

  has(...keys) { return keys.every((k) => this.buf[k]); }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = 0.9 * v;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain();
    this.master.gain.value = 0.9 * (this.volume ?? 0.8);
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 12; this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(c.destination);
    // Buses: world sounds (with reverb send), engines, traffic, ambience (with a cabin filter).
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.engBus = c.createGain(); this.engBus.connect(this.master);
    this.trafficBus = c.createGain(); this.trafficBus.gain.value = 0.8; this.trafficBus.connect(this.master);
    this.ambLP = c.createBiquadFilter(); this.ambLP.type = 'lowpass'; this.ambLP.frequency.value = 18000;
    this.ambIn = c.createGain(); this.ambIn.connect(this.ambLP).connect(this.master);
    this.verbIn = c.createGain();
    this.verb = c.createConvolver();
    this.verb.buffer = this.impulse(1.9);
    this.verbOut = c.createGain(); this.verbOut.gain.value = 0.35;
    this.verbIn.connect(this.verb).connect(this.verbOut).connect(this.master);
    const tSend = c.createGain(); tSend.gain.value = 0.12;
    this.trafficBus.connect(tSend).connect(this.verbIn);
    this.synth.attach(c, this.master);
    this.enabled = true;
    if (!this.ready) this.preload();
    this.ready.then(() => { if (!this.failed || this.has('amb_city', 'eng_car_0')) this.synth.silence(); });
  }

  // A synthetic room: early reflections off the buildings, then a smooth exponential tail.
  impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const ir = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / c.sampleRate;
        lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4; // a little darker than white noise
        d[i] = lp * Math.pow(10, (-60 / 20) * (t / sec)) * smooth(0, 0.012, t);
      }
      for (const [at, g] of [[0.011, 0.5], [0.023, 0.35], [0.037, 0.3], [0.052, 0.22]]) d[Math.floor((at + ch * 0.003) * c.sampleRate)] += g;
    }
    return ir;
  }

  // ---------- placing sounds ----------
  // Gain, pan and air-absorption cutoff for a sound at (x, z) heard from the camera.
  place(x, z, ref = 8, roll = 1) {
    const L = this.lis;
    if (x === undefined || x === null || !L) return { g: 1, pan: 0, lp: 20000, d: 0 };
    const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
    const g = d <= ref ? 1 : ref / (ref + (d - ref) * roll);
    const pan = d > 0.5 ? clamp((dx * L.rx + dz * L.rz) / d, -1, 1) * Math.min(1, d / 5) * 0.8 : 0;
    const lp = clamp(18000 / (1 + d / 35), 900, 18000);
    return { g, pan, lp, d };
  }

  // Play a buffer once. Returns { src, g } or null.
  play(key, { vol = 1, rate = 1, x, z, ref = 8, roll = 1, delay = 0, verb = 0.12, bus, offset = 0, loop = null, dur = 0 } = {}) {
    if (!this.enabled) return null;
    const buf = this.get(key);
    if (!buf) return null;
    const c = this.ctx, t = c.currentTime + delay;
    const p = this.place(x, z, ref, roll);
    const gv = vol * p.g;
    if (gv < 0.003) return null;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    if (loop) { src.loop = true; src.loopStart = loop[0]; src.loopEnd = loop[1]; }
    let node = src;
    if (p.lp < 17000) { const f = c.createBiquadFilter(); f.frequency.value = p.lp; node.connect(f); node = f; }
    const g = c.createGain(); g.gain.value = gv;
    node.connect(g);
    let out = g;
    if (p.pan && c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = p.pan; g.connect(pn); out = pn; }
    out.connect(bus || this.sfx);
    if (verb > 0) { const s = c.createGain(); s.gain.value = verb * (0.6 + Math.min(1, p.d / 50)); out.connect(s).connect(this.verbIn); }
    src.start(t, offset);
    if (dur) src.stop(t + dur);
    return { src, g, t, gv };
  }

  pick(prefix, gender) {
    let keys = Object.keys(BANK).filter((k) => k.startsWith(prefix + '_') && this.buf[k]);
    if (gender) { const g = keys.filter((k) => BANK[k].g === gender); if (g.length) keys = g; }
    return keys.length ? keys[Math.floor(Math.random() * keys.length)] : null;
  }

  // A recorded voice: a random take of a key prefix (such as 'vo_hit_m'), placed in the world, or
  // close by when no position is given. False when there's no recording for it (yet).
  // gender 'm' or 'f' prefers that speaker's takes.
  voice(prefix, { x, z, vol = 0.9, ref = 6, rate, gender } = {}) {
    if (!this.enabled) return false;
    const key = this.pick(prefix, gender);
    if (!key) return false;
    this.play(key, { vol: vol * (BANK[key].gain ?? 1), x, z, ref, roll: 1.4, rate: rate ?? 0.97 + Math.random() * 0.06, verb: 0.08 });
    return true;
  }

  distGain(x, z, camera, ref = 25) {
    if (!camera) return 1;
    const d = Math.hypot(x - camera.position.x, z - camera.position.z);
    return Math.min(1, ref / (ref + d * 1.5));
  }

  // ---------- every frame ----------
  // s: { world, camera, env, player, metro: 'riding' | ..., dt }
  update(dt, s) {
    if (!this.enabled) return;
    const { camera, player } = s;
    const e = camera.matrixWorld.elements;
    const rl = Math.hypot(e[0], e[2]) || 1;
    const px = camera.position.x, pz = camera.position.z;
    const L = this.lis || (this.lis = { x: px, z: pz, vx: 0, vz: 0 });
    if (dt > 0) { L.vx = (px - L.x) / dt; L.vz = (pz - L.z) / dt; }
    L.x = px; L.z = pz; L.rx = e[0] / rl; L.rz = e[2] / rl;
    const riding = s.metro === 'riding';
    this.updateTraffic(dt, s, riding);
    this.updateAmbience(dt, s, riding);
    this.updateFootsteps(player, riding, dt);
    if (!this.synth.quiet && this.has('amb_city', 'eng_car_0', 'siren_near')) this.synth.silence();
    this.updateSkid(player.vehicle);
    // Reverb: a hint on the street, a lot in underpasses and inside the metro.
    const under = player.vehicle ? player.vehicle.y : player.y;
    const wet = riding ? 0.5 : under < -1.6 ? 0.9 : 0.3;
    this.verbOut.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.4);
  }

  // The nearest moving traffic gets real engines; the rest of the city is the ambience bed.
  updateTraffic(dt, s, riding) {
    if (!this.has('eng_car_0')) return;
    const { world, player } = s;
    const L = this.lis, max = riding ? 0 : VOICES(), R = 65;
    const cand = [];
    const consider = (v) => {
      if (!v || v === player.vehicle || !v.driver || v.wrecked || v.engineDead || !v.group?.visible) return;
      const d = Math.hypot(v.x - L.x, v.z - L.z);
      if (d < R) cand.push({ v, d });
    };
    for (const v of world.vehicles) consider(v);
    for (const v of world.dynamic) consider(v);
    cand.sort((a, b) => a.d - b.d);
    const keep = new Set(cand.slice(0, max).map((c) => c.v));
    for (const [v, voice] of this.traffic) if (!keep.has(v)) { voice.stop(0.3); this.traffic.delete(v); }
    for (const { v, d } of cand.slice(0, max)) {
      const cls = v.spec.engine;
      if (!ENG[cls] || !this.has(`eng_${cls}_0`, `eng_${cls}_1`, `eng_${cls}_2`)) continue;
      let voice = this.traffic.get(v);
      if (!voice) { voice = new EngineVoice(this, cls, this.trafficBus); this.traffic.set(v, voice); }
      const sp = v.speed;
      const prev = this.prevSpeed.get(v) ?? sp;
      this.prevSpeed.set(v, sp);
      const thr = dt > 0 ? clamp((sp - prev) / dt / (v.spec.accel * 0.6), 0, 1) : 0;
      const r = revs(v.spec, cls, sp, thr);
      const E = ENG[cls];
      const f = E.idle * Math.pow(E.max / E.idle, r);
      const p = this.place(v.x, v.z, 5, 1);
      // Doppler from the closing speed (sound at 343 m/s).
      const dx = v.x - L.x, dz = v.z - L.z, dd = Math.max(0.5, d);
      const vr = ((v.vx - L.vx) * dx + (v.vz - L.vz) * dz) / dd;
      const dop = clamp(343 / (343 + vr), 0.88, 1.12);
      voice.set(f, E.vol * (0.45 + 0.4 * thr + 0.15 * r) * p.g * 0.9, Math.min(p.lp, 1200 + 5000 * (0.35 + 0.65 * Math.max(thr, r))), p.pan, dop, 0.08);
    }
  }

  updateAmbience(dt, s, riding) {
    if (!this.has('amb_city')) return;
    const { env, player } = s;
    const t = this.ctx.currentTime, L = this.lis;
    const night = env?.night ?? 0, day = 1 - night, hour = env?.hour ?? 12;
    const rain = this.rainLevel;
    let park = 0, lake = 0;
    for (const z of ZONES) {
      const k = clamp(1 - (Math.hypot(L.x - z.x, L.z - z.z) - z.r * 0.7) / 90, 0, 1);
      if (z.kind === 'park') park = Math.max(park, k); else lake = Math.max(lake, k);
    }
    // Dawn and dusk chorus: birds and temple bells around 6-8 am and 5-7 pm.
    const chorus = Math.max(smooth(5, 6.5, hour) * (1 - smooth(8, 9.5, hour)), smooth(16.5, 17.5, hour) * (1 - smooth(18.7, 19.5, hour)));
    const duck = riding ? 0.12 : 1;
    const level = (key, v, tc = 1.2) => {
      v *= duck;
      let b = this.beds[key];
      if (b && v < 0.005 && LAZY.test(key)) {
        // Unheard for a minute: let it go.
        if ((b.quiet = (b.quiet || 0) + dt) > 60) { b.src.stop(); delete this.beds[key]; delete this.buf[key]; return; }
      } else if (b) b.quiet = 0;
      if (!b) {
        if (v < 0.005) return;
        const buf = this.get(key);
        if (!buf) return;
        const info = BANK[key], c = this.ctx;
        const src = c.createBufferSource();
        src.buffer = buf; src.loop = true; src.loopStart = info.loop[0]; src.loopEnd = info.loop[1];
        const g = c.createGain(); g.gain.value = 0;
        src.connect(g).connect(this.ambIn);
        src.start(t, info.loop[0] + Math.random() * (info.loop[1] - info.loop[0]));
        b = this.beds[key] = { src, g };
      }
      b.g.gain.setTargetAtTime(v, t, tc);
    };
    level('amb_city', (0.5 * day + 0.14) * (1 - 0.45 * rain) * (1 - 0.6 * Math.max(park, lake)));
    // Chatter of the crowds you're among (signal corners, chai stalls, markets).
    let crowd = 0;
    for (const p of s.world?.streetLife?.peds || []) if (Math.abs(p.x - L.x) < 30 && Math.abs(p.z - L.z) < 30) crowd++;
    this.crowd = (this.crowd || 0) + (Math.min(1, crowd / 14) - (this.crowd || 0)) * Math.min(1, dt);
    level('amb_walla_0', 0.55 * this.crowd * (0.4 + 0.6 * day) * (1 - 0.7 * rain));
    level('amb_park', (0.55 * Math.max(park, lake * 0.6) * day + 0.25 * chorus) * (1 - 0.7 * rain));
    level('amb_night', 0.45 * smooth(0.3, 0.9, night) * (1 - 0.8 * rain) * (1 - 0.5 * lake));
    level('amb_frogs', 0.6 * lake * smooth(0.4, 0.9, night + rain * 0.5));
    level('rain_light', 0.75 * smooth(0.02, 0.4, rain));
    level('rain_heavy', 0.8 * smooth(0.45, 1, rain));
    // Inside the metro the city goes quiet and the train takes over.
    if (riding || this.beds.amb_metro) level('amb_metro', riding ? 0.8 / duck : 0, 0.5);
    // A closed car muffles the street; an auto or a two-wheeler doesn't.
    const v = player.vehicle;
    const cabin = v && !v.spec.twoWheeler && v.spec.engine !== 'auto';
    const under = (v ? v.y : player.y) < -1.6;
    this.ambLP.frequency.setTargetAtTime(cabin ? 1400 : under ? 5000 : 18000, t, 0.3);
    this.trafficBus.gain.setTargetAtTime(cabin ? 0.45 : 0.8, t, 0.3);
  }

  updateFootsteps(player, riding, dt) {
    const h = player.human;
    if (!h || player.vehicle || riding || player.transition || !player.grounded) { this.stepIdx = null; return; }
    // A foot lands each time the walk cycle passes a stride extreme.
    const idx = Math.floor((h.phase - Math.PI / 2) / Math.PI);
    if (this.stepIdx !== null && idx !== this.stepIdx && h.phase !== this.lastPhase) {
      const run = dt > 0 && (h.phase - this.lastPhase) / dt > 8;
      const k = this.pick('step');
      if (k) this.play(k, { vol: run ? 0.5 : 0.32, rate: 0.9 + Math.random() * 0.2, verb: 0.2 });
    }
    this.stepIdx = idx;
    this.lastPhase = h.phase;
  }

  updateSkid(v) {
    if (!this.buf.skid) return;
    const t = this.ctx.currentTime;
    let level = 0;
    if (v && v.driver === 'player' && !v.spec.twoWheeler && (v.y ?? 0) > -5) {
      level = smooth(0.14, 0.4, v.slip || 0) * smooth(4, 12, v.speed) * (v.waterDepth > 0.1 ? 0 : 1) * (1 - 0.6 * this.rainLevel);
    }
    if (!this.skid && level > 0.01) {
      const info = BANK.skid;
      this.skid = this.play('skid', { vol: 1, loop: info.loop, offset: info.loop[0], verb: 0.15 });
      if (this.skid) this.skid.g.gain.value = 0;
    }
    if (this.skid) {
      this.skid.g.gain.setTargetAtTime(level * 0.55, t, level > 0 ? 0.04 : 0.12);
      this.skid.src.playbackRate.setTargetAtTime(0.9 + 0.2 * level, t, 0.1);
    }
  }

  // ---------- the player's engine ----------
  // dt: game time since the last call.
  engine(vehicle, dt = 1 / 60) {
    if (!this.enabled) return;
    if (!vehicle) { this.stopEngine(); this.synth.engine(null); return; }
    const cls = vehicle.spec.engine;
    if (!this.has(`eng_${cls}_0`, `eng_${cls}_1`, `eng_${cls}_2`)) { this.synth.engine(vehicle); return; }
    if (!this.synth.quiet) this.synth.engine(null);
    if (vehicle.stalled || vehicle.engineDead || vehicle.wrecked) {
      if (this.pEng) { this.pEng.stop(0.4); this.pEng = null; }
      return;
    }
    if (!this.pEng || this.pEng.cls !== cls || this.pEngV !== vehicle) {
      this.pEng?.stop(0.2);
      this.pEng = new EngineVoice(this, cls, this.engBus);
      this.pEngV = vehicle;
      this.rpm = 0;
    }
    const thr = Math.abs(vehicle.throttleIn ?? 0);
    const target = revs(vehicle.spec, cls, vehicle.forwardSpeed, thr);
    this.rpm += (target - this.rpm) * Math.min(1, Math.min(0.1, dt) * (target > this.rpm ? 7 : 5));
    const E = ENG[cls];
    const f = E.idle * Math.pow(E.max / E.idle, this.rpm);
    const load = 0.35 + 0.65 * thr;
    this.pEng.set(f, E.vol * (0.55 + 0.45 * load), 900 + 7000 * load * (0.4 + 0.6 * this.rpm), 0, 1, 0.04);
  }

  // Called by main when you leave a vehicle (engine() gets null).
  stopEngine() { if (this.pEng) { this.pEng.stop(0.5); this.pEng = null; } }

  // ---------- horns & siren ----------
  blastAt(h, pitch, vol, at, dur, pos) {
    const info = BANK[h.s];
    const p = this.play(h.s, { vol, rate: h.p * pitch, x: pos?.x, z: pos?.z, ref: h.ref || 10, delay: at, loop: info.sustain, verb: 0.18 });
    if (!p) return;
    const g = p.g.gain, t = p.t, v = p.gv;
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(v, t + 0.006);
    g.setValueAtTime(v, t + dur); g.linearRampToValueAtTime(0, t + dur + 0.05);
    p.src.stop(t + dur + 0.06);
  }

  horn(kind, x, z, camera, pitch = 1) {
    if (!this.enabled) return;
    const h = HORNS[kind] || HORNS.car;
    if (!this.buf[h.s]) return this.synth.horn(kind, x, z, camera, pitch);
    const pos = { x, z };
    if (this.place(x, z, h.ref || 10).g * h.v < 0.01) return;
    if (h.tune) { h.tune.forEach((n, k) => this.blastAt(h, n * pitch, h.v, k * h.step, h.step * 0.85, pos)); return; }
    const rnd = (a) => a[0] + Math.random() * (a[1] - a[0]);
    if (h.once) { this.blastAt(h, pitch, h.v, 0, rnd(h.d), pos); return; }
    const n = h.repeat || (Math.random() < 0.45 ? 1 : Math.random() < 0.7 ? 2 : 3);
    let at = 0;
    for (let k = 0; k < n; k++) {
      const d = rnd(h.d) * (k === n - 1 && Math.random() < 0.4 ? 1.8 : 1);
      this.blastAt(h, pitch, h.v, at, d, pos);
      at += d + 0.06 + Math.random() * 0.06;
    }
  }

  // The player's horn, held for as long as the key is.
  hornHold(kind, on, pitch = 1) {
    if (!this.enabled) return;
    const h = HORNS[kind] || HORNS.car;
    if (!this.buf[h.s] && !this.hold) return this.synth.hornHold(kind, on, pitch);
    if (on && !this.hold) {
      if (h.tune) {
        const tune = () => h.tune.forEach((n, k) => this.blastAt(h, n * pitch, h.v * 1.1, k * h.step, h.step * 0.85));
        tune();
        this.hold = { timer: setInterval(tune, (h.tune.length * h.step + 0.2) * 1000) };
      } else {
        const p = this.play(h.s, { vol: h.v * 1.1, rate: h.p * pitch, loop: BANK[h.s].sustain, verb: 0.15 });
        this.hold = p ? { p } : null;
      }
    } else if (!on && this.hold) {
      const hh = this.hold, t = this.ctx.currentTime;
      if (hh.timer) clearInterval(hh.timer);
      if (hh.p) { hh.p.g.gain.setTargetAtTime(0, t, 0.015); hh.p.src.stop(t + 0.1); }
      this.hold = null;
    }
  }

  // Loudness of the nearest wailing Hoysala (0..1): the close recording near, the distant one far.
  siren(level) {
    if (!this.enabled) return;
    if (!this.has('siren_near', 'siren_far')) return this.synth.siren(level);
    if (!this.synth.quiet) this.synth.siren(0);
    if (!this.sirens && level <= 0) return;
    const t = this.ctx.currentTime;
    if (!this.sirens) {
      this.sirens = ['siren_near', 'siren_far'].map((k) => {
        const p = this.play(k, { vol: 1, loop: BANK[k].loop, offset: BANK[k].loop[0], verb: 0.25 });
        p.g.gain.value = 0;
        return p;
      });
    }
    const near = level * level, far = clamp(level * (1 - level) * 2.2, 0, 1) * 0.9;
    this.sirens[0].g.gain.setTargetAtTime(near * 0.75, t, 0.15);
    this.sirens[1].g.gain.setTargetAtTime(far * 0.75, t, 0.15);
  }

  setRain(intensity) {
    this.rainLevel = intensity;
    if (!this.has('amb_city')) this.synth.setRain(intensity);
  }

  // ---------- one-shots ----------
  thud(strength = 0.5) {
    if (!this.enabled) return;
    const k = strength < 0.35 ? this.pick('metal') : this.pick('crash');
    if (!k) return this.synth.thud(strength);
    this.play(k, { vol: 0.3 + 0.7 * strength, rate: 1.05 - strength * 0.2 + Math.random() * 0.12, verb: 0.15 });
  }

  // Metal on metal, and glass when it's a big one.
  crunch(strength = 0.5) {
    if (!this.enabled) return;
    const k = this.pick('metal');
    if (!k) return this.synth.crunch(strength);
    this.play(k, { vol: 0.25 + 0.6 * strength, rate: 0.85 + Math.random() * 0.3 });
    if (strength > 0.55) { const g = this.pick('glass'); if (g) this.play(g, { vol: 0.5 * strength, delay: 0.03, rate: 0.9 + Math.random() * 0.2 }); }
  }

  explosion(x, z, camera) {
    if (!this.enabled) return;
    const k = this.pick('explosion');
    if (!k) { this.get('explosion_0'); return this.synth.explosion(x, z, camera); }
    this.play(k, { vol: 1, x, z, ref: 30, roll: 0.5, verb: 0.35, rate: 0.85 + Math.random() * 0.15 });
    const c = this.pick('crash');
    if (c) this.play(c, { vol: 0.5, x, z, ref: 20, delay: 0.25, rate: 0.7 });
  }

  gunshot(kind = 'revolver', x, z, camera) {
    if (!this.enabled) return;
    const key = kind === 'katta' ? 'gun_katta' : 'gun_revolver';
    if (!this.buf[key]) return this.synth.gunshot(kind, x, z, camera);
    const p = this.place(x, z, 15, 0.7);
    this.play(key, { vol: 0.95, x, z, ref: 15, roll: 0.7, rate: 0.95 + Math.random() * 0.1, verb: 0.3 });
    // Far away you mostly hear the crack bouncing off the buildings.
    if (p.d > 40 && this.buf.gun_far) this.play('gun_far', { vol: 0.5 * clamp((p.d - 40) / 80, 0, 1), x, z, ref: 60, roll: 0.5, verb: 0.2 });
  }

  click() {
    if (!this.enabled) return;
    if (!this.buf.gun_click) return this.synth.click();
    this.play('gun_click', { vol: 0.55, rate: 1 + Math.random() * 0.1, verb: 0 });
  }

  punch(kick = false) {
    if (!this.enabled) return;
    const k = this.pick('punch');
    if (!k) return this.synth.punch(kick);
    this.play(k, { vol: kick ? 0.9 : 0.75, rate: (kick ? 0.82 : 0.95) + Math.random() * 0.15, verb: 0.1 });
  }

  whoosh() {
    if (!this.enabled) return;
    const k = this.pick('whoosh');
    if (!k) return this.synth.whoosh();
    this.play(k, { vol: 0.35, rate: 0.9 + Math.random() * 0.3, verb: 0 });
  }

  // Voices: recorded takes (see SOUND_CREDITS.md), with the synthesised grunt as a fallback.
  // high: a woman's voice. x, z: where it comes from (else right here).
  grunt(high = false, x, z) { if (this.enabled && !this.voice(high ? 'vo_hit_f' : 'vo_hit_m', { x, z })) this.synth.grunt(high); }
  effort(high = false) { if (this.enabled && Math.random() < 0.6) this.voice(high ? 'vo_effort_f' : 'vo_effort_m', { vol: 0.7 }); }
  scream(high, x, z) { if (this.enabled) this.voice(high ? 'vo_scream_f' : 'vo_scream_m', { x, z, ref: 10, vol: 0.8 }); }
  death(high, x, z) { if (this.enabled && !this.voice(high ? 'vo_death_f' : 'vo_death_m', { x, z })) this.synth.grunt(high); }
  crowdScream(x, z) {
    if (!this.enabled || this.ctx.currentTime < (this.crowdT || 0)) return;
    if (this.voice('vo_crowd_scream', { x, z, ref: 14, vol: 0.7 })) this.crowdT = this.ctx.currentTime + 8;
  }

  splash() {
    if (!this.enabled) return;
    if (!this.buf.splash) return this.synth.splash();
    this.play('splash', { vol: 0.5, rate: 0.85 + Math.random() * 0.35 });
  }

  // kind: 'open', 'close', 'exit' (open, step out, shut) or 'mount' (swinging onto a two-wheeler).
  door(kind = 'close') {
    if (!this.enabled) return;
    if (kind === 'mount') { const k = this.pick('step'); if (k) this.play(k, { vol: 0.35, rate: 0.8 }); return; }
    if (!this.buf.door_open) return this.synth.door();
    if (kind === 'open' || kind === 'exit') this.play('door_open', { vol: 0.55, rate: 0.95 + Math.random() * 0.1 });
    if (kind === 'close') this.play('door_close', { vol: 0.7, rate: 0.95 + Math.random() * 0.1 });
    if (kind === 'exit') this.play('door_close', { vol: 0.7, delay: 0.65, rate: 0.95 + Math.random() * 0.1 });
  }

  moo(x, z, camera) {
    if (!this.enabled) return;
    const k = this.pick('moo');
    if (!k) return this.synth.moo(x, z, camera);
    this.play(k, { vol: 0.6, x, z, ref: 10, rate: 0.92 + Math.random() * 0.16, verb: 0.15 });
  }

  thunder(delay = 1, strength = 1) {
    if (!this.enabled) return;
    const key = strength > 0.85 ? 'thunder_near' : 'thunder_far';
    if (!this.buf[key]) { this.get(key); return this.synth.thunder(delay, strength); }
    this.play(key, { vol: 0.45 + 0.5 * strength, delay, rate: 0.9 + Math.random() * 0.2, verb: 0, bus: this.ambIn });
  }

  // Namma Metro doors: the chime and the doors sliding shut.
  metroDoors() {
    if (!this.enabled) return;
    if (!this.buf.metro_chime) { this.get('metro_chime'); return this.synth.click(); }
    this.play('metro_chime', { vol: 0.6, verb: 0.3 });
  }

  // Musical cues and the radio stay synthesised.
  ping() { if (this.enabled) this.synth.ping(); }
  cash() { if (this.enabled) this.synth.cash(); }
  sting(bad = true) { if (this.enabled) this.synth.sting(bad); }
  radio(on) { if (this.enabled) this.synth.radio(on); }
}
