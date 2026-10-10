// All sound is synthesised with WebAudio: engines, horns, city ambience, cows, impacts.
const HORNS = {
  scooter: { f: [520, 660], type: 'square', dur: 0.18, vol: 0.18 },
  auto: { f: [740, 880], type: 'square', dur: 0.14, vol: 0.2 },
  car: { f: [410, 520], type: 'sawtooth', dur: 0.3, vol: 0.2 },
  bus: { f: [220, 277, 330], type: 'sawtooth', dur: 0.55, vol: 0.28 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
  }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.comp = this.ctx.createDynamicsCompressor();
    this.master.connect(this.comp).connect(this.ctx.destination);
    this.enabled = true;
    this.noiseBuf = this.makeNoise();
    this.startAmbience();
    this.startEngine();
    this.holdHorn = null;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let k = 0; k < len; k++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[k] = last * 6; }
    return buf;
  }

  startAmbience() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500;
    const g = c.createGain();
    g.gain.value = 0.12;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this.ambience = g;
  }

  startEngine() {
    const c = this.ctx;
    this.eOsc = c.createOscillator();
    this.eOsc.type = 'sawtooth';
    this.eOsc2 = c.createOscillator();
    this.eOsc2.type = 'square';
    this.eFilter = c.createBiquadFilter();
    this.eFilter.type = 'lowpass';
    this.eFilter.frequency.value = 600;
    // Amplitude modulation gives the two-stroke "putt-putt" of an auto rickshaw.
    this.eAM = c.createGain();
    this.eLfo = c.createOscillator();
    this.eLfoGain = c.createGain();
    this.eLfo.connect(this.eLfoGain).connect(this.eAM.gain);
    this.eGain = c.createGain();
    this.eGain.gain.value = 0;
    this.eOsc.connect(this.eFilter);
    this.eOsc2.connect(this.eFilter);
    this.eFilter.connect(this.eAM).connect(this.eGain).connect(this.master);
    this.eOsc.start(); this.eOsc2.start(); this.eLfo.start();
  }

  engine(vehicle) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    if (!vehicle) { this.eGain.gain.setTargetAtTime(0, t, 0.1); return; }
    const s = vehicle.spec.sound;
    const sp = Math.abs(vehicle.forwardSpeed) / vehicle.spec.maxSpeed;
    // Fake gear changes for cars.
    const gears = s === 'car' ? 5 : s === 'bus' ? 4 : 1;
    const g = Math.min(gears - 1, Math.floor(sp * gears));
    const rpm = gears > 1 ? (sp * gears - g) * 0.7 + 0.3 : sp;
    const base = { scooter: 90, auto: 55, car: 60, bus: 38 }[s];
    const freq = base * (1 + rpm * 2.2);
    this.eOsc.frequency.setTargetAtTime(freq, t, 0.05);
    this.eOsc2.frequency.setTargetAtTime(freq * 0.5, t, 0.05);
    this.eFilter.frequency.setTargetAtTime(300 + rpm * 1400, t, 0.05);
    const am = s === 'auto' ? 0.9 : s === 'scooter' ? 0.4 : 0.15;
    this.eLfo.frequency.setTargetAtTime(freq / 6, t, 0.05);
    this.eLfoGain.gain.setTargetAtTime(am * 0.5, t, 0.05);
    this.eAM.gain.setTargetAtTime(1 - am * 0.5, t, 0.05);
    this.eGain.gain.setTargetAtTime(s === 'bus' ? 0.16 : 0.1, t, 0.1);
  }

  distGain(x, z, camera, ref = 25) {
    if (!camera) return 1;
    const d = Math.hypot(x - camera.position.x, z - camera.position.z);
    return Math.min(1, ref / (ref + d * 1.5));
  }

  tone(freqs, type, dur, vol) {
    const c = this.ctx, t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + dur - 0.03);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(this.master);
    for (const f of freqs) {
      const o = c.createOscillator();
      o.type = type; o.frequency.value = f * (0.97 + Math.random() * 0.06);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      o.connect(lp).connect(g);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  horn(kind, x, z, camera) {
    if (!this.enabled) return;
    const h = HORNS[kind] || HORNS.car;
    const v = h.vol * this.distGain(x, z, camera);
    if (v < 0.01) return;
    // Bengaluru drivers rarely honk just once.
    const n = Math.random() < 0.5 ? 1 : Math.random() < 0.7 ? 2 : 3;
    for (let k = 0; k < n; k++) setTimeout(() => this.tone(h.f, h.type, h.dur, v), k * (h.dur * 1000 + 60));
  }

  hornHold(kind, on) {
    if (!this.enabled) return;
    if (on && !this.holdHorn) {
      const h = HORNS[kind] || HORNS.car;
      const c = this.ctx;
      const g = c.createGain();
      g.gain.value = h.vol * 1.2;
      g.connect(this.master);
      const oscs = h.f.map((f) => { const o = c.createOscillator(); o.type = h.type; o.frequency.value = f; const lp = c.createBiquadFilter(); lp.frequency.value = 2400; o.connect(lp).connect(g); o.start(); return o; });
      this.holdHorn = { g, oscs };
    } else if (!on && this.holdHorn) {
      const { g, oscs } = this.holdHorn;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      oscs.forEach((o) => o.stop(this.ctx.currentTime + 0.1));
      this.holdHorn = null;
    }
  }

  noiseBurst(vol, freq, dur) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur);
  }

  thud(strength = 0.5) {
    if (!this.enabled) return;
    this.noiseBurst(0.6 * strength + 0.2, 400, 0.35);
    this.tone([60], 'sine', 0.2, 0.3 * strength);
  }

  door() {
    if (!this.enabled) return;
    this.noiseBurst(0.3, 900, 0.12);
  }

  moo(x, z, camera) {
    if (!this.enabled) return;
    const v = 0.25 * this.distGain(x, z, camera, 15);
    if (v < 0.02) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(110, t + 0.9); o.frequency.linearRampToValueAtTime(95, t + 1.3);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.2); g.gain.linearRampToValueAtTime(0, t + 1.3);
    o.connect(f).connect(g).connect(this.master);
    o.start(t); o.stop(t + 1.4);
  }

  ping() {
    if (!this.enabled) return;
    this.tone([880], 'sine', 0.1, 0.2);
    setTimeout(() => this.tone([1320], 'sine', 0.15, 0.2), 110);
  }

  cash() {
    if (!this.enabled) return;
    [1046, 1318, 1568, 2093].forEach((f, k) => setTimeout(() => this.tone([f], 'triangle', 0.12, 0.18), k * 70));
  }

  // Simple generative "radio": a tabla-ish beat with a drone, only while driving.
  radio(on) {
    if (!this.enabled) return;
    if (on && !this.radioTimer) {
      let step = 0;
      const scale = [0, 2, 4, 7, 9, 12, 14];
      const root = 196;
      this.radioTimer = setInterval(() => {
        const c = this.ctx, t = c.currentTime;
        if (step % 4 === 0 || step % 8 === 3) this.drum(t, 90, 0.25);
        if (step % 4 === 2) this.drum(t, 320, 0.12);
        if (step % 2 === 0 && Math.random() < 0.7) {
          const n = scale[Math.floor(Math.random() * scale.length)];
          this.tone([root * Math.pow(2, n / 12)], 'triangle', 0.22, 0.05);
        }
        step++;
      }, 160);
    } else if (!on && this.radioTimer) {
      clearInterval(this.radioTimer);
      this.radioTimer = null;
    }
  }

  drum(t, f, v) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.3);
  }
}
