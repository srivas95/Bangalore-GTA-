// Synthesised sounds: the fallback used until the recorded samples (audio.js) have loaded, or
// if they can't be fetched, plus the musical UI cues (ping, cash, stings) and the car radio.

// Horn profiles. kind: beep (single/dual tone), bulb (rubber squeeze horn with a pitch drop),
// air (vibrato chord through a lowpass), tune (multi-note musical lorry horn).
const HORNS = {
  scooter: { kind: 'beep', f: [610, 770], type: 'square', dur: 0.15, vol: 0.14, lp: 2600 },
  scooterHi: { kind: 'beep', f: [760, 960], type: 'square', dur: 0.11, vol: 0.13, lp: 3000 },
  bike: { kind: 'beep', f: [355, 450], type: 'sawtooth', dur: 0.24, vol: 0.2, lp: 1500 },
  auto: { kind: 'bulb', f: [930], type: 'square', dur: 0.17, vol: 0.18, lp: 2400 },
  autoLow: { kind: 'bulb', f: [690], type: 'square', dur: 0.2, vol: 0.18, lp: 2000 },
  car: { kind: 'beep', f: [415, 505], type: 'sawtooth', dur: 0.28, vol: 0.17, lp: 2200 },
  car2: { kind: 'beep', f: [440, 554], type: 'sawtooth', dur: 0.3, vol: 0.17, lp: 2000 },
  carHi: { kind: 'beep', f: [520, 655], type: 'sawtooth', dur: 0.22, vol: 0.16, lp: 2600 },
  suv: { kind: 'beep', f: [330, 415], type: 'sawtooth', dur: 0.42, vol: 0.2, lp: 1700 },
  police: { kind: 'beep', f: [470, 590], type: 'sawtooth', dur: 0.3, vol: 0.2, lp: 2200 },
  tempo: { kind: 'beep', f: [540, 680], type: 'square', dur: 0.26, vol: 0.16, lp: 1300 },
  ace: { kind: 'beep', f: [1020], type: 'square', dur: 0.09, vol: 0.13, lp: 3200, repeat: 3 },
  lorry: { kind: 'tune', notes: [523, 659, 784, 659, 523, 784, 1046], step: 0.12, type: 'square', vol: 0.17, lp: 2000 },
  air: { kind: 'air', f: [175, 220, 262], dur: 0.8, vol: 0.26, lp: 1400 },
  bus: { kind: 'air', f: [220, 277, 330], dur: 0.6, vol: 0.25, lp: 1600 },
  schoolBus: { kind: 'beep', f: [300, 378], type: 'sawtooth', dur: 0.4, vol: 0.2, lp: 1500 },
  train: { kind: 'air', f: [262, 330], dur: 1.6, vol: 0.32, lp: 1200 },
};

export class SynthAudio {
  // Shares the real engine's context and output.
  attach(ctx, out) {
    this.ctx = ctx;
    this.master = out;
    this.enabled = true;
    this.noiseBuf = this.makeNoise(false);
    this.whiteBuf = this.makeNoise(true);
    this.ambience = this.loopNoise(this.noiseBuf, 'lowpass', 500, 0.12);
    this.rain = this.loopNoise(this.whiteBuf, 'highpass', 1200, 0);
    this.startEngine();
    this.startSiren();
    this.holdHorn = null;
  }

  makeNoise(white) {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let k = 0; k < len; k++) {
      const w = Math.random() * 2 - 1;
      if (white) d[k] = w * 0.5; else { last = last * 0.97 + w * 0.03; d[k] = last * 6; }
    }
    return buf;
  }

  loopNoise(buf, type, freq, vol) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return g;
  }

  // Once the recordings are in, the synthesised beds, engine and siren fall silent for good.
  silence() {
    if (!this.enabled || this.quiet) return;
    this.quiet = true;
    const t = this.ctx.currentTime;
    for (const g of [this.rain, this.ambience, this.eGain, this.sGain]) g.gain.setTargetAtTime(0, t, 0.3);
  }

  setRain(intensity) {
    if (!this.enabled || this.quiet) return;
    this.rain.gain.setTargetAtTime(intensity * 0.22, this.ctx.currentTime, 0.5);
    this.ambience.gain.setTargetAtTime(0.12 - intensity * 0.05, this.ctx.currentTime, 0.5);
  }

  startEngine() {
    const c = this.ctx;
    this.eOsc = c.createOscillator(); this.eOsc.type = 'sawtooth';
    this.eOsc2 = c.createOscillator(); this.eOsc2.type = 'square';
    this.eFilter = c.createBiquadFilter(); this.eFilter.type = 'lowpass'; this.eFilter.frequency.value = 600;
    // Amplitude modulation gives the two-stroke "putt-putt" of an auto and the Bullet's "dug-dug".
    this.eAM = c.createGain();
    this.eLfo = c.createOscillator();
    this.eLfoGain = c.createGain();
    this.eLfo.connect(this.eLfoGain).connect(this.eAM.gain);
    this.eGain = c.createGain(); this.eGain.gain.value = 0;
    this.eOsc.connect(this.eFilter); this.eOsc2.connect(this.eFilter);
    this.eFilter.connect(this.eAM).connect(this.eGain).connect(this.master);
    this.eOsc.start(); this.eOsc2.start(); this.eLfo.start();
  }

  engine(vehicle) {
    if (!this.enabled || this.quiet) return;
    const t = this.ctx.currentTime;
    if (!vehicle || vehicle.stalled) { this.eGain.gain.setTargetAtTime(0, t, 0.1); return; }
    const s = vehicle.spec.engine;
    const sp = Math.abs(vehicle.forwardSpeed) / vehicle.spec.maxSpeed;
    const gears = s === 'car' ? 5 : s === 'bus' ? 4 : s === 'bike' ? 4 : 1;
    const g = Math.min(gears - 1, Math.floor(sp * gears));
    const rpm = gears > 1 ? (sp * gears - g) * 0.7 + 0.3 : sp;
    const base = { scooter: 90, bike: 42, auto: 55, car: 60, bus: 38 }[s];
    const freq = base * (1 + rpm * 2.2);
    this.eOsc.frequency.setTargetAtTime(freq, t, 0.05);
    this.eOsc2.frequency.setTargetAtTime(freq * 0.5, t, 0.05);
    this.eFilter.frequency.setTargetAtTime(300 + rpm * 1400, t, 0.05);
    const am = { auto: 0.9, bike: 0.95, scooter: 0.4, car: 0.15, bus: 0.2 }[s];
    this.eLfo.frequency.setTargetAtTime(s === 'bike' ? 6 + rpm * 14 : freq / 6, t, 0.05);
    this.eLfoGain.gain.setTargetAtTime(am * 0.5, t, 0.05);
    this.eAM.gain.setTargetAtTime(1 - am * 0.5, t, 0.05);
    this.eGain.gain.setTargetAtTime(s === 'bus' ? 0.16 : s === 'bike' ? 0.14 : 0.1, t, 0.1);
  }

  startSiren() {
    const c = this.ctx;
    this.sOsc = c.createOscillator(); this.sOsc.type = 'sawtooth';
    this.sLfo = c.createOscillator(); this.sLfo.type = 'triangle'; this.sLfo.frequency.value = 0.38;
    const depth = c.createGain(); depth.gain.value = 420;
    this.sLfo.connect(depth).connect(this.sOsc.frequency);
    this.sOsc.frequency.value = 980;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
    this.sGain = c.createGain(); this.sGain.gain.value = 0;
    this.sOsc.connect(f).connect(this.sGain).connect(this.master);
    this.sOsc.start(); this.sLfo.start();
  }

  // Loudness of the nearest wailing Hoysala (0..1).
  siren(level) {
    if (!this.enabled || this.quiet) return;
    this.sGain.gain.setTargetAtTime(level * 0.11, this.ctx.currentTime, 0.15);
  }

  distGain(x, z, camera, ref = 25) {
    if (!camera) return 1;
    const d = Math.hypot(x - camera.position.x, z - camera.position.z);
    return Math.min(1, ref / (ref + d * 1.5));
  }

  tone(freqs, type, dur, vol, lp = 2400, at = 0) {
    const c = this.ctx, t = c.currentTime + at;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.03));
    g.gain.linearRampToValueAtTime(0, t + dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    f.connect(g).connect(this.master);
    for (const fr of freqs) {
      const o = c.createOscillator();
      o.type = type; o.frequency.value = fr * (0.985 + Math.random() * 0.03);
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  // One blast of a horn profile.
  blast(h, pitch, vol, at = 0) {
    const c = this.ctx, t0 = c.currentTime + at;
    if (h.kind === 'beep') return this.tone(h.f.map((f) => f * pitch), h.type, h.dur, vol, h.lp, at);
    if (h.kind === 'tune') {
      h.notes.forEach((n, k) => this.tone([n * pitch, n * pitch * 1.5], h.type, h.step * 0.9, vol, h.lp, at + k * h.step));
      return;
    }
    if (h.kind === 'bulb') {
      // Rubber bulb horn: "paa-paap" with a squeezed pitch drop.
      const o = c.createOscillator(); o.type = h.type;
      const f0 = h.f[0] * pitch;
      o.frequency.setValueAtTime(f0 * 1.15, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.72, t0 + h.dur);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * 1.5; bp.Q.value = 1.2;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol * 1.4, t0 + 0.015); g.gain.linearRampToValueAtTime(0, t0 + h.dur);
      o.connect(bp).connect(g).connect(this.master);
      o.start(t0); o.stop(t0 + h.dur + 0.05);
      return;
    }
    if (h.kind === 'air') {
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.06);
      g.gain.setValueAtTime(vol, t0 + h.dur - 0.1); g.gain.linearRampToValueAtTime(0, t0 + h.dur);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = h.lp;
      lp.connect(g).connect(this.master);
      const vib = c.createOscillator(); vib.frequency.value = 5.5;
      const vd = c.createGain(); vd.gain.value = 3;
      vib.connect(vd);
      for (const f of h.f) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * pitch;
        vd.connect(o.frequency);
        o.connect(lp); o.start(t0); o.stop(t0 + h.dur + 0.05);
      }
      vib.start(t0); vib.stop(t0 + h.dur + 0.05);
    }
  }

  horn(kind, x, z, camera, pitch = 1) {
    if (!this.enabled) return;
    const h = HORNS[kind] || HORNS.car;
    const v = h.vol * this.distGain(x, z, camera);
    if (v < 0.01) return;
    if (h.kind === 'tune' || h.kind === 'air') return this.blast(h, pitch, v);
    // Bengaluru drivers rarely honk just once.
    const n = h.repeat || (Math.random() < 0.45 ? 1 : Math.random() < 0.7 ? 2 : 3);
    const dur = h.kind === 'bulb' ? h.dur + 0.05 : h.dur + 0.06;
    for (let k = 0; k < n; k++) this.blast(h, pitch, v, k * dur);
  }

  // The player's horn: held down for continuous tones, repeated for bulb/tune/air horns.
  hornHold(kind, on, pitch = 1) {
    if (!this.enabled) return;
    const h = HORNS[kind] || HORNS.car;
    const c = this.ctx;
    if (on && !this.holdHorn) {
      if (h.kind === 'beep') {
        const g = c.createGain(); g.gain.value = h.vol * 1.2;
        const lp = c.createBiquadFilter(); lp.frequency.value = h.lp;
        lp.connect(g).connect(this.master);
        const oscs = h.f.map((f) => { const o = c.createOscillator(); o.type = h.type; o.frequency.value = f * pitch; o.connect(lp); o.start(); return o; });
        this.holdHorn = { g, oscs };
      } else {
        const period = h.kind === 'tune' ? h.notes.length * h.step + 0.15 : h.dur + 0.08;
        this.blast(h, pitch, h.vol * 1.2);
        const timer = setInterval(() => this.blast(h, pitch, h.vol * 1.2), period * 1000);
        this.holdHorn = { timer };
      }
    } else if (!on && this.holdHorn) {
      const hh = this.holdHorn;
      if (hh.timer) clearInterval(hh.timer);
      if (hh.g) { hh.g.gain.setTargetAtTime(0, c.currentTime, 0.02); hh.oscs.forEach((o) => o.stop(c.currentTime + 0.1)); }
      this.holdHorn = null;
    }
  }

  noiseBurst(vol, freq, dur, type = 'lowpass', at = 0) {
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
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

  punch(kick = false) {
    if (!this.enabled) return;
    this.noiseBurst(kick ? 0.7 : 0.5, kick ? 700 : 1100, 0.12);
    this.tone([kick ? 85 : 120], 'sine', 0.1, 0.35);
  }

  whoosh() {
    if (!this.enabled) return;
    this.noiseBurst(0.15, 1800, 0.15, 'bandpass');
  }

  // A short exhale through the teeth ("hff"), for effort and pain.
  grunt(high = false) {
    if (!this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.whiteBuf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = high ? 1400 : 950; bp.Q.value = 1.6;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.025); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.26);
  }

  thunder(delay = 1, strength = 1) {
    if (!this.enabled) return;
    this.noiseBurst(0.9 * strength, 180, 2.8, 'lowpass', delay);
    this.noiseBurst(0.5 * strength, 90, 4.0, 'lowpass', delay + 0.3);
  }

  explosion(x, z, camera) {
    if (!this.enabled) return;
    const g = camera ? this.distGain(x, z, camera, 60) : 1;
    this.noiseBurst(1.0 * g, 140, 2.6, 'lowpass');
    this.noiseBurst(0.7 * g, 900, 0.5, 'lowpass');
    this.noiseBurst(0.4 * g, 60, 3.5, 'lowpass', 0.1);
  }

  // Metal on metal.
  crunch(strength = 0.5) {
    if (!this.enabled) return;
    this.noiseBurst(0.35 * strength, 1800, 0.18, 'bandpass');
    this.noiseBurst(0.5 * strength, 220, 0.25, 'lowpass');
  }

  // A sharp crack with a body; the katta is a cruder, boomier bang.
  gunshot(kind = 'revolver', x, z, camera) {
    if (!this.enabled) return;
    const g = x !== undefined && camera ? this.distGain(x, z, camera, 40) : 1;
    this.noiseBurst(0.7 * g, 3200, 0.07, 'highpass');
    this.noiseBurst((kind === 'katta' ? 0.9 : 0.6) * g, kind === 'katta' ? 260 : 420, kind === 'katta' ? 0.5 : 0.3, 'lowpass');
  }

  click() {
    if (!this.enabled) return;
    this.noiseBurst(0.15, 4000, 0.03, 'highpass');
  }

  splash() {
    if (!this.enabled) return;
    this.noiseBurst(0.25, 2500, 0.4, 'bandpass');
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
    this.tone([1320], 'sine', 0.15, 0.2, 2400, 0.11);
  }

  cash() {
    if (!this.enabled) return;
    [1046, 1318, 1568, 2093].forEach((f, k) => this.tone([f], 'triangle', 0.12, 0.18, 4000, k * 0.07));
  }

  sting(bad = true) {
    if (!this.enabled) return;
    const notes = bad ? [392, 370, 349, 262] : [523, 659, 784];
    notes.forEach((f, k) => this.tone([f, f / 2], 'sawtooth', 0.35, 0.12, 1500, k * 0.25));
  }

  // Generative "radio": a tabla-ish beat with a melody, only while driving.
  radio(on) {
    if (!this.enabled) return;
    if (on && !this.radioTimer) {
      let step = 0;
      const scale = [0, 2, 4, 7, 9, 12, 14];
      const root = 196;
      this.radioTimer = setInterval(() => {
        const t = this.ctx.currentTime;
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
