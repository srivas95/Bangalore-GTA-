// Voices: carjacked drivers, people you hit or knock over, drivers you bump, passers-by chatting,
// constables and radio presenters, each in their own language (Kannada, Tamil, Telugu, Hindi,
// Dakhni, Malayalam or Bangalore English; see LANGS and SPEECH in config.js).
//  - With a text-to-speech voice for the language on the device (Android and Edge have Kannada,
//    Tamil, Telugu, Hindi and Malayalam; most systems have Hindi), the line is read in its own script.
//  - Otherwise an Indian English voice reads the romanised line.
//  - With no speech synthesis at all (the Android app's web view), or with Voices set to
//    "Synthesised", a formant "babble" voice says something with the rhythm and tune of the line.
// Everyone keeps the language and voice they were first heard with.
import { LANGS, SPEECH } from '../config.js';

const KEYS = Object.keys(LANGS);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function pickLang(r = Math.random) {
  let t = r();
  for (const k of KEYS) { t -= LANGS[k].share; if (t <= 0) return k; }
  return 'kn';
}

// Vowel formants (F1, F2 in Hz, adult male) for the babble voice.
const VOWELS = { a: [740, 1180], e: [500, 1850], i: [320, 2250], o: [560, 880], u: [340, 870] };

export class Voices {
  constructor(audio, hud) {
    this.audio = audio;
    this.hud = hud;
    this.mode = 'auto'; // 'auto' | 'synth' | 'off'
    this.volume = 1;
    this.tts = typeof window !== 'undefined' && window.speechSynthesis && window.SpeechSynthesisUtterance ? window.speechSynthesis : null;
    this.list = [];
    this.cache = new Map();
    this.last = {};
    this.chatterT = 8;
    this.fleeT = 0;
    this.babbleUntil = 0;
    if (this.tts) {
      const load = () => { try { this.list = this.tts.getVoices() || []; } catch { this.list = []; } this.cache.clear(); };
      load();
      if (this.tts.addEventListener) this.tts.addEventListener('voiceschanged', load);
      else this.tts.onvoiceschanged = load;
    }
  }

  setMode(m) { this.mode = m || 'auto'; if (this.mode === 'off') this.stop(); }

  stop() { try { this.tts?.cancel(); } catch { /* ignore */ } }

  // The device's voice for a language: an exact xx-IN match first, then any voice of the language.
  voiceFor(lang) {
    if (this.cache.has(lang)) return this.cache.get(lang);
    const want = LANGS[lang].tts.toLowerCase(), base = want.slice(0, 2);
    const norm = (v) => (v.lang || '').replace('_', '-').toLowerCase();
    let v = this.list.find((x) => norm(x) === want) || this.list.find((x) => norm(x).startsWith(base + '-') || norm(x) === base) || null;
    if (!v && lang === 'en') v = this.list.find((x) => /india/i.test(x.name)) || this.list.find((x) => norm(x).startsWith('en')) || null;
    this.cache.set(lang, v);
    return v;
  }

  // What the device can do, for the settings panel: e.g. "Kannada, Hindi · others in English".
  describe() {
    if (!this.tts || !this.list.length) return 'synthesised (no speech voices on this device)';
    const have = KEYS.filter((k) => k !== 'en' && k !== 'dk' && this.voiceFor(k)).map((k) => LANGS[k].name);
    return have.length ? `${have.join(', ')}${have.length < 5 ? ' · the rest read in English' : ''}` : 'read in English (no Indian-language voices installed)';
  }

  pickLine(cat, lang) {
    const byLang = SPEECH[cat];
    if (!byLang) return null;
    let use = lang, pool = byLang[lang];
    if (!pool || !pool.length) { use = byLang.kn ? 'kn' : Object.keys(byLang)[0]; pool = byLang[use]; }
    let i = Math.floor(Math.random() * pool.length);
    const key = cat + use;
    if (pool.length > 1 && i === this.last[key]) i = (i + 1) % pool.length;
    this.last[key] = i;
    const [rom, native, gloss] = pool[i];
    return { lang: use, rom, native, gloss };
  }

  // A line from category `cat` said by `who` (anything with x, z; a pedestrian, a driver):
  // subtitled with its language and meaning, and spoken.
  speak(cat, who = {}, { priority = false, subtitle = true, dur = 3, prefix = '', volume = 1 } = {}) {
    if (!who.lang) who.lang = SPEECH[cat]?.[who.langHint] ? who.langHint : pickLang();
    const female = !!(who.female ?? who.h?.female);
    if (who.voicePitch === undefined) who.voicePitch = (female ? 1.15 : 0.9) + (Math.random() - 0.5) * 0.2;
    const line = this.pickLine(cat, who.lang);
    if (!line) return null;
    if (subtitle && this.hud) {
      const name = LANGS[line.lang].name;
      this.hud.say(`${prefix}“${line.rom}”`, dur, line.gloss ? `${name} · ${line.gloss}` : name);
    }
    this.voice(line, who, { priority, female, volume });
    return line;
  }

  voice(line, who, { priority = false, female = false, volume = 1 } = {}) {
    const au = this.audio;
    if (this.mode === 'off' || !au.enabled || au.paused) return;
    const p = au.place(who.x, who.z, 7, 1.2);
    const vol = clamp(p.g * 1.1, 0, 1) * volume * this.volume;
    if (vol < 0.06) return;
    if (this.mode !== 'synth' && this.tts && this.list.length) {
      const own = this.voiceFor(line.lang);
      const v = own || this.voiceFor('en');
      if (v) {
        let busy = false;
        try { busy = this.tts.speaking || this.tts.pending; } catch { /* ignore */ }
        if (busy) { if (!priority) return; this.stop(); }
        try {
          const u = new SpeechSynthesisUtterance(own ? line.native : line.rom);
          u.voice = v; u.lang = v.lang;
          u.volume = vol;
          u.rate = 1.02 + Math.random() * 0.12;
          u.pitch = clamp(who.voicePitch ?? 1, 0.5, 1.8);
          this.tts.speak(u);
          return;
        } catch { /* fall through to the babble */ }
      }
    }
    this.babble(line.rom, who.voicePitch ?? 1, vol, p.pan, female, priority);
  }

  // A wordless voice with the line's syllables, stresses and tune: a glottal buzz through two
  // vowel formants, with noise for the consonants. (Like the "Simlish" of other games.)
  babble(text, pitch = 1, vol = 1, pan = 0, female = false, priority = false) {
    const au = this.audio, c = au.ctx, noise = au.synth?.whiteBuf;
    if (!c || !noise) return;
    if (c.currentTime < this.babbleUntil && !priority) return;
    const syl = text.toLowerCase().replace(/[^a-z\s!?.,']/g, ' ').match(/[^aeiou\s!?.,']*[aeiou]+|[!?.,]/g) || [];
    if (!syl.length) return;
    const t0 = c.currentTime + 0.03;
    const f0 = (female ? 200 : 115) * pitch;
    const src = c.createOscillator(); src.type = 'sawtooth'; src.frequency.value = f0;
    const vib = c.createOscillator(); vib.frequency.value = 5.2;
    const vibG = c.createGain(); vibG.gain.value = f0 * 0.012;
    vib.connect(vibG).connect(src.frequency);
    const F1 = c.createBiquadFilter(); F1.type = 'bandpass'; F1.Q.value = 4.5;
    const F2 = c.createBiquadFilter(); F2.type = 'bandpass'; F2.Q.value = 6;
    const f2g = c.createGain(); f2g.gain.value = 0.55;
    const vg = c.createGain(); vg.gain.value = 0;
    src.connect(F1).connect(vg); src.connect(F2).connect(f2g).connect(vg);
    const ns = c.createBufferSource(); ns.buffer = noise; ns.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2600;
    const ng = c.createGain(); ng.gain.value = 0;
    ns.connect(nf).connect(ng);
    const out = c.createGain(); out.gain.value = vol * 2.6;
    vg.connect(out); ng.connect(out);
    let dest = out;
    if (pan && c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = pan; out.connect(pn); dest = pn; }
    dest.connect(au.sfx);
    const question = /\?\s*$/.test(text), excl = text.includes('!');
    const fk = female ? 1.17 : 1;
    let t = t0;
    const n = syl.length;
    for (let i = 0; i < n; i++) {
      const s = syl[i];
      if (/[!?.,]/.test(s)) { t += 0.13; continue; }
      const m = s.match(/^([^aeiou]*)([aeiou]+)$/);
      const cons = m ? m[1] : '', vow = m ? m[2] : 'a';
      if (cons) {
        if (/s|h|z|j|f|ch/.test(cons)) { // fricative: a hiss
          ng.gain.setTargetAtTime(0.32, t, 0.01); ng.gain.setTargetAtTime(0, t + 0.045, 0.01); t += 0.055;
        } else if (!/^[mnlrvwy]+$/.test(cons)) { // plosive: a tick
          ng.gain.setTargetAtTime(0.45, t, 0.002); ng.gain.setTargetAtTime(0, t + 0.012, 0.006); t += 0.028;
        }
      }
      const k = i / Math.max(1, n - 1);
      let f = f0 * (1.12 - 0.22 * k) * (excl ? 1.12 : 1) * (1 + (Math.random() - 0.5) * 0.1);
      if (question && k > 0.7) f *= 1.28;
      if (i === 0 || Math.random() < 0.25) f *= 1.08; // stress
      const dur = (vow.length > 1 ? 0.17 : 0.1) * (0.9 + Math.random() * 0.25);
      const [a, b] = VOWELS[vow[0]] || VOWELS.a;
      src.frequency.setTargetAtTime(f, t, 0.03);
      F1.frequency.setTargetAtTime(a * fk, t, 0.022);
      F2.frequency.setTargetAtTime(b * fk, t, 0.022);
      vg.gain.setTargetAtTime(1, t, 0.014);
      vg.gain.setTargetAtTime(0.06, t + dur * 0.78, 0.025);
      t += dur;
    }
    vg.gain.setTargetAtTime(0, t, 0.04);
    for (const s of [src, vib, ns]) { s.start(t0); s.stop(t + 0.35); }
    this.babbleUntil = t;
  }

  // Passers-by talk among themselves (and to you) when you walk past.
  update(dt, world) {
    if (this.mode === 'off') return;
    this.fleeT -= dt;
    if ((this.chatterT -= dt) > 0) return;
    this.chatterT = 6 + Math.random() * 9;
    const pl = world.player;
    if (pl.vehicle && pl.vehicle.speed > 4) return;
    if (this.hud && this.hud.subT > 0) return; // don't talk over the story
    const px = pl.pos.x, pz = pl.pos.z;
    let best = null, bd = Infinity;
    for (const p of world.streetLife.peds) {
      if (!p.h.group.visible || !(p.state === 'walk' || p.state === 'idle' || p.state === 'wait')) continue;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < 2 || d > 11) continue;
      const score = d + Math.random() * 5;
      if (score < bd) { bd = score; best = p; }
    }
    if (best) this.speak('chatter', best, { dur: 3.5 });
  }

  // Someone in a panicking crowd shouts (not every one of them).
  flee(who) {
    if (this.fleeT > 0) return;
    this.fleeT = 4;
    this.speak('flee', who, { dur: 2.2 });
  }
}
