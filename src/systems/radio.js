// The car radio: five stations of Indian music, generated as it plays. Each station has its own
// sound: Kannada film songs (dholak, strings, flute, nadaswaram and a singer), Bollywood dance
// (bhangra dhol, tumbi, synth stabs), Tamil kuthu (thappu drums and nadaswaram), Carnatic
// classical (tanpura drone, veena and mridangam, from a free alapana into the composition) and
// lo-fi (sitar and electric piano over a lazy beat). Melodies are written in a raga, phrase by
// phrase (call, answer, a second theme, back to the first), with slides and shakes between notes.
// Presenters introduce the station between songs.
//
// Nothing is recorded. Every note is synthesised and scheduled a little ahead on the audio clock
// (a look-ahead scheduler), so the music keeps time whatever the frame rate is doing.

const LOOKAHEAD = 0.35;
const TICK_MS = 50;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Ragas (and plain scales) as semitones above Sa.
const RAGA = {
  shankarabharanam: [0, 2, 4, 5, 7, 9, 11],
  kharaharapriya: [0, 2, 3, 5, 7, 9, 10],
  mayamalavagowla: [0, 1, 4, 5, 7, 8, 11],
  natabhairavi: [0, 2, 3, 5, 7, 8, 10],
  kalyani: [0, 2, 4, 6, 7, 9, 11],
  hamsadhwani: [0, 2, 4, 7, 11],
  mohanam: [0, 2, 4, 7, 9],
  hindolam: [0, 3, 5, 8, 10],
  abheri: [0, 3, 5, 7, 10],
};

export const STATIONS = [
  { key: 'namma', name: 'Namma FM', freq: '91.1', tag: 'Kannada film hits · ಕನ್ನಡ ಹಾಡುಗಳು', color: '#f2c200', style: 'sandalwood' },
  { key: 'bolly', name: 'Bolly Bajao', freq: '94.3', tag: 'Bollywood dance floor', color: '#ff4fa0', style: 'bollywood' },
  { key: 'machi', name: 'Machi Kuthu', freq: '98.3', tag: 'Tamil kuthu & gaana', color: '#2ab0ff', style: 'kuthu' },
  { key: 'raaga', name: 'Raaga Sudha', freq: '101.3', tag: 'Carnatic classical · ಶಾಸ್ತ್ರೀಯ ಸಂಗೀತ', color: '#ff7a4a', style: 'carnatic' },
  { key: 'kaapi', name: 'Filter Kaapi Lo-fi', freq: '104.0', tag: 'Lo-fi beats & sitar', color: '#d8a878', style: 'lofi' },
];

// Presenters between songs: [language, romanised, native script].
const RJ = {
  namma: [
    ['kn', 'Namaskara Bengaluru! Neevu kelthaa iddeera Namma FM, tombattu ondu point ondu!', 'ನಮಸ್ಕಾರ ಬೆಂಗಳೂರು! ನೀವು ಕೇಳ್ತಾ ಇದ್ದೀರಾ ನಮ್ಮ ಎಫ್ಎಂ, ತೊಂಬತ್ತೊಂದು ಪಾಯಿಂಟ್ ಒಂದು!'],
    ['kn', 'Silk Board alli traffic jaam, aadre Namma FM alli songs jaam!', 'ಸಿಲ್ಕ್ ಬೋರ್ಡ್ ಅಲ್ಲಿ ಟ್ರಾಫಿಕ್ ಜಾಮ್, ಆದ್ರೆ ನಮ್ಮ ಎಫ್ಎಂ ಅಲ್ಲಿ ಸಾಂಗ್ಸ್ ಜಾಮ್!'],
    ['kn', 'Siri gannadam gelge! Siri gannadam baalge!', 'ಸಿರಿಗನ್ನಡಂ ಗೆಲ್ಗೆ! ಸಿರಿಗನ್ನಡಂ ಬಾಳ್ಗೆ!'],
    ['kn', 'Mundina haadu, nimma ella auto anna avrige!', 'ಮುಂದಿನ ಹಾಡು, ನಿಮ್ಮ ಎಲ್ಲಾ ಆಟೋ ಅಣ್ಣ ಅವ್ರಿಗೆ!'],
  ],
  bolly: [
    ['hi', 'Aap sun rahe hain Bolly Bajao, chauraanve point teen! Volume badhaao!', 'आप सुन रहे हैं बॉली बजाओ, चौरानवे पॉइंट तीन! वॉल्यूम बढ़ाओ!'],
    ['hi', 'Traffic mein phanse ho? Koi baat nahin, naacho!', 'ट्रैफिक में फँसे हो? कोई बात नहीं, नाचो!'],
    ['en', 'Bolly Bajao, ninety four point three. Non-stop masala, Bengaluru!', 'Bolly Bajao, ninety four point three. Non-stop masala, Bengaluru!'],
  ],
  machi: [
    ['ta', 'Vanakkam machi! Idhu Machi Kuthu, thonnootti ettu point moonu!', 'வணக்கம் மச்சி! இது மச்சி குத்து, தொண்ணூற்றி எட்டு பாயிண்ட் மூணு!'],
    ['ta', 'Semma mass song varudhu, volume-a yethu!', 'செம்ம மாஸ் சாங் வருது, வால்யூம யேத்து!'],
    ['en', 'Machi Kuthu, ninety eight point three. Kuthu all the way to Hosur Road!', 'Machi Kuthu, ninety eight point three. Kuthu all the way to Hosur Road!'],
  ],
  raaga: [
    ['kn', 'Raaga Sudha, nooru ondu point mooru. Shaastreeya sangeethada sudhe.', 'ರಾಗ ಸುಧಾ, ನೂರ ಒಂದು ಪಾಯಿಂಟ್ ಮೂರು. ಶಾಸ್ತ್ರೀಯ ಸಂಗೀತದ ಸುಧೆ.'],
    ['en', 'You are listening to Raaga Sudha. Next, a composition in raga Hamsadhwani.', 'You are listening to Raaga Sudha. Next, a composition in raga Hamsadhwani.'],
  ],
  kaapi: [
    ['en', 'Filter Kaapi Lo-fi, one oh four. Sip slow, drive slower. Silk Board will wait.', 'Filter Kaapi Lo-fi, one oh four. Sip slow, drive slower. Silk Board will wait.'],
    ['en', 'Beats to study, code and sit in traffic to.', 'Beats to study, code and sit in traffic to.'],
    ['kn', 'Ondu kaapi, ondu haadu. Bengaluru male, nimma jote.', 'ಒಂದು ಕಾಫಿ, ಒಂದು ಹಾಡು. ಬೆಂಗಳೂರು ಮಳೆ, ನಿಮ್ಮ ಜೊತೆ.'],
  ],
};

// Percussion grids: one bar of sixteenths, a digit is the velocity (0-9), '.' is silence.
const GRIDS = {
  sandalwood: { ge: '8..5..6.8..5.6..', na: '..6.5..6..6.5.7.', ta: '....8.......8...', shaker: '4242424242424242', kick: '7.......6.......' },
  bollywood: { kick: '9...9...9...9...', dagga: '9.....8...9.....', tilli: '...7..7.7..7..7.', clap: '....9.......9...', hat: '.5.5.5.5.5.5.5.5' },
  kuthu: { kick: '9.....9.9.....9.', thappu: '8.78.78.8.78.787', dang: '9..9..9...9..9..', clap: '....9.......9...' },
  lofi: { kick: '9......5..9.....', snare: '....8.......8...', hat: '6.4.6.4.6.4.6.4.' },
};
const vel = (grid, i) => { const ch = grid[i % 16]; return ch === '.' ? 0 : +ch / 9; };

const STYLES = {
  sandalwood: { bpm: [92, 112], ragas: ['shankarabharanam', 'kharaharapriya', 'mayamalavagowla'], root: [196, 247], leads: ['flute', 'voice', 'reed'], pad: 'strings', bass: 'round', chords: [[0, 5, 3, 4], [0, 3, 4, 0], [5, 3, 0, 4]], busy: 0.55, vowel: ['a', 'o'], mix: { drums: 0.6, lead: 1.6, harm: 1, bass: 0.9 } },
  bollywood: { bpm: [100, 108], ragas: ['kharaharapriya', 'natabhairavi', 'abheri'], root: [207, 247], leads: ['voice', 'tumbi', 'voice'], pad: 'stabs', bass: 'synth', chords: [[0, 6, 5, 6], [0, 5, 3, 4], [0, 3, 6, 4]], busy: 0.6, vowel: ['a', 'e'], mix: { drums: 0.45, lead: 2.2, harm: 2, bass: 0.8 } },
  kuthu: { bpm: [124, 134], ragas: ['natabhairavi', 'mayamalavagowla', 'hindolam'], root: [220, 262], leads: ['reed', 'voice', 'reed'], pad: null, bass: 'synth', chords: [[0, 0, 5, 4], [0, 6, 5, 4]], busy: 0.75, vowel: ['a', 'a'], mix: { drums: 0.36, lead: 2.8, harm: 1, bass: 0.7 } },
  carnatic: { bpm: [64, 82], ragas: ['hamsadhwani', 'mohanam', 'kalyani', 'mayamalavagowla', 'hindolam'], root: [138, 165], leads: ['veena'], pad: null, bass: null, drone: true, alapana: true, busy: 0.5, mix: { drums: 0.85, lead: 1, harm: 1, bass: 1 } },
  lofi: { bpm: [72, 82], ragas: ['kalyani', 'kharaharapriya', 'abheri'], root: [196, 233], leads: ['sitar'], pad: 'rhodes', bass: 'soft', chords: [[0, 5, 3, 4], [1, 4, 0, 5]], busy: 0.35, swing: 0.16, crackle: true, mix: { drums: 0.85, lead: 1.8, harm: 1, bass: 1.1 } },
};

function rngFrom(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];

// ---------- instruments ----------
// Karplus-Strong plucked string rendered once into a buffer; `buzz` adds the jawari of a sitar,
// veena or tanpura bridge.
function pluckBuffer(c, f0, sec, { damp = 0.996, bright = 0.5, buzz = 0 } = {}) {
  const sr = c.sampleRate, n = Math.floor(sr * sec), N = Math.max(2, Math.round(sr / f0));
  const buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0), line = new Float32Array(N);
  let lp = 0, mean = 0;
  for (let i = 0; i < N; i++) { lp += (Math.random() * 2 - 1 - lp) * bright; line[i] = lp; mean += lp; }
  mean /= N;
  for (let i = 0; i < N; i++) line[i] -= mean;
  let idx = 0, peak = 1e-6;
  for (let i = 0; i < n; i++) {
    const a = line[idx], b = line[(idx + 1) % N];
    line[idx] = damp * 0.5 * (a + b);
    const y = buzz ? a + buzz * Math.tanh(5 * a) * 0.5 : a;
    d[i] = y;
    if (Math.abs(y) > peak) peak = Math.abs(y);
    idx = (idx + 1) % N;
  }
  const k = 0.8 / peak;
  for (let i = 0; i < n; i++) d[i] *= k;
  return { buf, f0: sr / N };
}

class Kit {
  constructor(c, out) {
    this.c = c;
    this.out = out;
    const n = c.sampleRate;
    this.noise = c.createBuffer(1, n, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.plucks = {
      veena: [pluckBuffer(c, 196, 2.2, { damp: 0.997, bright: 0.45, buzz: 0.35 }), pluckBuffer(c, 392, 1.6, { damp: 0.996, bright: 0.5, buzz: 0.35 })],
      sitar: [pluckBuffer(c, 220, 2.0, { damp: 0.996, bright: 0.7, buzz: 0.75 }), pluckBuffer(c, 440, 1.5, { damp: 0.995, bright: 0.7, buzz: 0.75 })],
      tumbi: [pluckBuffer(c, 660, 0.9, { damp: 0.993, bright: 0.85, buzz: 0.2 })],
      tanpura: [pluckBuffer(c, 130, 4.5, { damp: 0.9988, bright: 0.4, buzz: 0.9 })],
    };
  }

  gain(t, v) { const g = this.c.createGain(); g.gain.setValueAtTime(v, t); return g; }

  // Pitched noise burst through a filter, for drums.
  hiss(t, vol, type, freq, q, decay, dest = this.out) {
    const c = this.c, s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0, t + 0.002, decay / 3);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.8); s.stop(t + decay * 2 + 0.05);
  }

  // A tuned membrane: a sine whose pitch glides f0 -> f1, with an exponential decay.
  tone(t, vol, f0, f1, glide, decay, type = 'sine', dest = this.out) {
    const c = this.c, o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + glide);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0, t + 0.003, decay / 3);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + decay * 2 + 0.05);
  }

  drum(kind, t, v) {
    if (v <= 0) return;
    switch (kind) {
      case 'kick': this.tone(t, 0.95 * v, 140, 45, 0.11, 0.35); break;
      case 'ge': this.tone(t, 0.75 * v, 92, 138, 0.16, 0.42); break; // dholak bass, pitch bending up
      case 'na': this.tone(t, 0.32 * v, 540, 520, 0.05, 0.2); this.tone(t, 0.12 * v, 1080, 1060, 0.05, 0.12); this.hiss(t, 0.15 * v, 'bandpass', 3000, 2, 0.02); break;
      case 'ta': this.hiss(t, 0.5 * v, 'bandpass', 1300, 1.4, 0.09); this.tone(t, 0.25 * v, 320, 260, 0.04, 0.07); break;
      case 'shaker': this.hiss(t, 0.09 * v, 'highpass', 6000, 0.7, 0.05); break;
      case 'dagga': this.tone(t, 0.9 * v, 105, 62, 0.09, 0.3); this.hiss(t, 0.3 * v, 'lowpass', 400, 0.8, 0.08); break;
      case 'tilli': this.hiss(t, 0.45 * v, 'bandpass', 2400, 2.2, 0.06); this.tone(t, 0.2 * v, 430, 400, 0.03, 0.05); break;
      case 'clap': for (let k = 0; k < 3; k++) this.hiss(t + k * 0.011, 0.45 * v, 'bandpass', 1500, 1.1, k === 2 ? 0.14 : 0.02); break;
      case 'hat': this.hiss(t, 0.16 * v, 'highpass', 7500, 0.8, 0.035); break;
      case 'snare': this.hiss(t, 0.45 * v, 'bandpass', 1800, 0.8, 0.13); this.tone(t, 0.3 * v, 220, 180, 0.03, 0.08, 'triangle'); break;
      case 'thappu': this.hiss(t, 0.6 * v, 'bandpass', 1850, 1.1, 0.07); this.tone(t, 0.35 * v, 280, 210, 0.04, 0.08); break;
      case 'dang': this.tone(t, 0.85 * v, 125, 70, 0.1, 0.3); this.hiss(t, 0.35 * v, 'lowpass', 600, 0.7, 0.07); break;
      // Mridangam strokes.
      case 'T': this.tone(t, 0.8 * v, 82, 62, 0.12, 0.38); break; // thom
      case 'N': this.tone(t, 0.35 * v, 330, 328, 0.2, 0.32); this.tone(t, 0.16 * v, 660, 655, 0.2, 0.22); this.tone(t, 0.08 * v, 990, 985, 0.2, 0.16); break; // nam
      case 'D': this.tone(t, 0.4 * v, 330, 330, 0.3, 0.55); this.tone(t, 0.12 * v, 495, 495, 0.3, 0.35); break; // dhi
      case 'C': this.tone(t, 0.3 * v, 990, 985, 0.2, 0.25); this.tone(t, 0.12 * v, 1485, 1480, 0.2, 0.18); break; // chapu
      case 'k': this.hiss(t, 0.25 * v, 'bandpass', 850, 1.5, 0.04); break; // muted
      case 'bell': for (const f of [3150, 4630, 5880]) this.tone(t, 0.05 * v, f, f, 0.5, 0.6); break; // manjira
      case 'crackle': this.hiss(t, 0.06 * v, 'highpass', 3000, 0.5, 0.004); break;
    }
  }

  pluck(kind, t, f, dur, v, from = 0) {
    const c = this.c, set = this.plucks[kind];
    const p = set.length > 1 && f > set[0].f0 * 1.45 ? set[1] : set[0];
    const s = c.createBufferSource();
    s.buffer = p.buf;
    const rate = f / p.f0;
    if (from) { s.playbackRate.setValueAtTime(from / p.f0, t); s.playbackRate.setTargetAtTime(rate, t + 0.03, 0.035); } // meend
    else s.playbackRate.setValueAtTime(rate, t);
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.setTargetAtTime(0, t + Math.max(0.05, dur), kind === 'tanpura' ? 0.9 : 0.25);
    s.connect(g).connect(this.out);
    s.start(t); s.stop(t + dur + (kind === 'tanpura' ? 4 : 1.2));
    return s;
  }

  // Melodic voices with glides from the previous note, delayed vibrato and an optional shake
  // (the Carnatic kampita) on long notes.
  sustained(kind, t, f, dur, v, from = 0, vowel = 'a') {
    const c = this.c;
    const o = c.createOscillator(), o2 = c.createOscillator();
    const lfo = c.createOscillator(), lg = c.createGain();
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    const attack = kind === 'flute' ? 0.06 : kind === 'voice' ? 0.045 : 0.025;
    env.gain.linearRampToValueAtTime(v, t + attack);
    env.gain.setTargetAtTime(v * 0.8, t + attack, 0.2);
    env.gain.setTargetAtTime(0, t + dur, kind === 'flute' ? 0.08 : 0.06);
    const f0 = from || f;
    for (const [osc, mul] of [[o, 1], [o2, kind === 'voice' ? 1.004 : kind === 'flute' ? 2 : 1]]) {
      osc.frequency.setValueAtTime(f0 * mul, t);
      if (from) osc.frequency.setTargetAtTime(f * mul, t + 0.01, kind === 'voice' ? 0.05 : 0.035);
    }
    lfo.frequency.value = kind === 'reed' ? 6.2 : 5.4;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * (kind === 'flute' ? 0.006 : 0.011), t + Math.min(0.35, dur * 0.6));
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    let out;
    if (kind === 'flute') {
      o.type = 'sine'; o2.type = 'sine';
      const g2 = c.createGain(); g2.gain.value = 0.12; o2.connect(g2);
      const sum = c.createGain(); o.connect(sum); g2.connect(sum);
      // breath
      const b = c.createBufferSource(); b.buffer = this.noise;
      const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = f * 2; bf.Q.value = 2.5;
      const bg = c.createGain(); bg.gain.value = 0.18;
      b.connect(bf).connect(bg).connect(sum);
      b.start(t, Math.random() * 0.5); b.stop(t + dur + 0.4);
      out = sum;
    } else if (kind === 'reed') {
      // Nadaswaram / shehnai: a bright, nasal double reed.
      o.type = 'sawtooth'; o2.type = 'square';
      const g2 = c.createGain(); g2.gain.value = 0.3; o2.connect(g2);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1350; bp.Q.value = 0.9;
      const pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2900; pk.gain.value = 6; pk.Q.value = 1.5;
      o.connect(bp); g2.connect(bp); bp.connect(pk);
      out = pk;
    } else {
      // A wordless singer: a buzz through the formants of a sung vowel.
      o.type = 'sawtooth'; o2.type = 'sawtooth';
      const F = { a: [850, 1250, 2800], o: [450, 820, 2700], e: [500, 1900, 2700] }[vowel] || [850, 1250, 2800];
      const sum = c.createGain();
      [[F[0], 6, 1], [F[1], 8, 0.6], [F[2], 10, 0.25]].forEach(([fr, q, a]) => {
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q;
        const g = c.createGain(); g.gain.value = a * 2.2;
        o.connect(bp); o2.connect(bp); bp.connect(g).connect(sum);
      });
      out = sum;
    }
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'flute' ? 4000 : 5200;
    out.connect(lp).connect(env).connect(this.out);
    const end = t + dur + 0.5;
    for (const s of [o, o2, lfo]) { s.start(t); s.stop(end); }
  }

  pad(t, freqs, dur, v) {
    const c = this.c;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 0.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.3); g.gain.setTargetAtTime(0, t + dur, 0.25);
    lp.connect(g).connect(this.out);
    for (const f of freqs) for (const det of [-7, 7]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 1.2);
    }
  }

  stab(t, freqs, v) {
    const c = this.c;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.18);
    const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.setTargetAtTime(0, t + 0.08, 0.05);
    lp.connect(g).connect(this.out);
    for (const f of freqs) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + 0.4); }
  }

  rhodes(t, freqs, dur, v) {
    for (const f of freqs) {
      this.tone(t, v * 0.5, f, f, 1, Math.min(2.2, dur + 0.6));
      this.tone(t, v * 0.12, f * 2, f * 2, 1, 0.5);
      this.tone(t, v * 0.05, f * 3.01, f * 3.01, 1, 0.18);
    }
  }

  bass(kind, t, f, dur, v) {
    const c = this.c, o = c.createOscillator(), g = c.createGain();
    o.type = kind === 'synth' ? 'sawtooth' : 'triangle';
    o.frequency.setValueAtTime(f, t);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'synth' ? 520 : 900;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.setTargetAtTime(0, t + dur * 0.8, 0.08);
    o.connect(lp).connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + 0.5);
    const sub = c.createOscillator(); sub.frequency.value = f; const sg = c.createGain(); sg.gain.setValueAtTime(v * 0.7, t); sg.gain.setTargetAtTime(0, t + dur * 0.8, 0.08);
    sub.connect(sg).connect(this.out); sub.start(t); sub.stop(t + dur + 0.5);
  }

  // Tuning between stations: a sweep of static.
  tuneStatic(t, vol = 0.5) {
    const c = this.c, s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(4000, t + 0.45);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + 0.55);
    s.connect(f).connect(g).connect(this.out);
    s.start(t); s.stop(t + 0.6);
  }
}

// ---------- songs ----------
class Song {
  constructor(style, seed) {
    const S = STYLES[style], r = rngFrom(seed);
    this.style = style;
    this.S = S;
    this.r = r;
    this.bpm = S.bpm[0] + r() * (S.bpm[1] - S.bpm[0]);
    this.sixteenth = 60 / this.bpm / 4;
    this.ragaName = pick(r, S.ragas);
    this.scale = RAGA[this.ragaName];
    this.root = S.root[0] * Math.pow(S.root[1] / S.root[0], r());
    this.chords = S.chords ? pick(r, S.chords) : null;
    const n = this.scale.length;
    this.pa = this.scale.indexOf(7) >= 0 ? this.scale.indexOf(7) : Math.floor(n / 2);
    // The form, in bars.
    const plan = S.alapana
      ? [['alap', 8], ['A', 8], ['A', 8], ['B', 8], ['A', 8], ['korvai', 2], ['outro', 2]]
      : [['intro', 4], ['A', 8], ['B', 8], ['A', 8], ['bridge', 4], ['B', 8], ['A', 8], ['outro', 4]];
    this.bars = [];
    let secIdx = 0;
    for (const [sec, len] of plan) { for (let b = 0; b < len; b++) this.bars.push({ sec, b, len, idx: secIdx }); secIdx++; }
    this.length = this.bars.length * 16;
    // Themes: a two-bar call and its answer; a second theme higher up.
    const A = this.phrase(0, 1), B = this.phrase(Math.floor(n * 0.6), 1);
    this.themes = { A: [A, this.answer(A, 0), A, this.answer(A, 0)], B: [B, this.answer(B, this.pa), B, this.answer(A, 0)] };
    this.alap = [this.phrase(0, 0.35), this.phrase(2, 0.35), this.phrase(n, 0.3), this.answer(this.phrase(1, 0.35), 0)];
    this.mridangam = this.mridangamBar();
    this.prevF = 0;
  }

  freq(deg, oct = 0) {
    const n = this.scale.length, o = Math.floor(deg / n), i = ((deg % n) + n) % n;
    return this.root * Math.pow(2, (this.scale[i] + 12 * (o + oct)) / 12);
  }

  // Two bars of melody: notes as {at, len, deg}, rising then falling, ending on Sa or Pa.
  phrase(start, density) {
    const r = this.r, n = this.scale.length, busy = this.S.busy * density;
    const cells = [[4], [2, 2], [3, 1], [1, 1, 2], [2, 1, 1], [1, 1, 1, 1], [6, 2], [8]];
    const weights = [3 - busy * 2, 3, 2, 2 * busy + 0.5, 2 * busy + 0.5, 3 * busy, 1, 1.2 - busy];
    const out = [];
    let at = 0, deg = start + (r() < 0.5 ? 0 : this.pa);
    while (at < 28) {
      let t = r() * weights.reduce((a, b) => a + b, 0), ci = 0;
      while ((t -= weights[ci]) > 0 && ci < cells.length - 1) ci++;
      for (const len of cells[ci]) {
        if (at >= 28) break;
        if (r() < 0.08 && out.length) { at += len; continue; } // a breath
        const rise = at < 16 ? 0.62 : 0.36;
        const s = r();
        const step = s < 0.12 ? 0 : s < 0.72 ? 1 : s < 0.92 ? 2 : 3;
        deg += r() < rise ? step : -step;
        deg = clamp(deg, start - 3, start + n + 2);
        out.push({ at, len, deg });
        at += len;
      }
    }
    // Land on a resting note for the last beat.
    const rest = Math.abs(deg - start) < Math.abs(deg - (start + this.pa)) ? start : start + this.pa;
    out.push({ at: 28, len: 4, deg: rest });
    return out;
  }

  // Same opening, a new ending that resolves to `home`.
  answer(p, home) {
    const keep = p.filter((x) => x.at < 20);
    const tail = this.phrase(home, 1).filter((x) => x.at >= 20);
    if (tail.length) tail[tail.length - 1].deg = home;
    return keep.concat(tail);
  }

  mridangamBar() {
    const cells = ['TkDk', 'N.Dk', 'TkNk', 'D.N.', 'TNDN', 'C.kN', 'T.D.', 'NkDk', 'TkTk', 'NDkN'];
    return [0, 1, 2, 3].map(() => pick(this.r, cells)).join('');
  }

  stepDur(i) {
    const sw = this.S.swing || 0;
    return this.sixteenth * (i % 2 === 0 ? 1 + sw : 1 - sw);
  }

  chordAt(barNo) {
    if (!this.chords) return null;
    const d = this.chords[barNo % this.chords.length];
    return [d, d + 2, d + 4].map((x) => this.freq(x, -1));
  }

  play(i, t, kit, lead) {
    const bar = this.bars[Math.floor(i / 16)], pos = i % 16, S = this.S, st = this.style;
    const barNo = Math.floor(i / 16);
    const sec = bar.sec;
    const fadeOut = sec === 'outro' ? 1 - (bar.b * 16 + pos) / (bar.len * 16) : 1;
    const M = S.mix, dr = M.drums * fadeOut;
    // Percussion.
    if (st === 'carnatic') {
      if (sec !== 'alap') {
        const pat = sec === 'korvai' ? 'TkDkNkDkTkNkC...' : this.mridangam;
        const ch = pat[pos];
        if (ch && ch !== '.') kit.drum(ch, t, (pos % 4 === 0 ? 1 : 0.7) * dr);
      }
      // Tanpura: Pa, Sa, Sa, low Sa, round and round.
      if (pos % 4 === 0) kit.pluck('tanpura', t, [this.root * 0.75, this.root, this.root, this.root / 2][(i / 4) % 4], 3, 0.32 * fadeOut);
    } else {
      const G = GRIDS[st];
      const sparse = sec === 'intro' || sec === 'bridge';
      for (const k in G) {
        if (sparse && (k === 'kick' || k === 'clap' || k === 'snare') && sec === 'intro' && bar.b < 2) continue;
        const v = vel(G[k], pos);
        if (v) kit.drum(k, t, v * dr * (sparse ? 0.7 : 1));
      }
      if (st === 'sandalwood' && pos === 0 && barNo % 2 === 0) kit.drum('bell', t, 0.8 * dr);
      if (S.crackle && kit.r() < 0.35) kit.drum('crackle', t + kit.r() * this.sixteenth, 0.5 + kit.r() * 0.5);
      // A fill on the last bar of every section.
      if (bar.b === bar.len - 1 && pos >= 12 && st !== 'lofi') kit.drum(st === 'kuthu' ? 'thappu' : st === 'bollywood' ? 'dagga' : 'ge', t + this.sixteenth / 2, 0.6 * dr);
    }
    // Chords and bass.
    const chord = this.chordAt(barNo);
    if (chord && pos === 0 && sec !== 'outro') {
      if (S.pad === 'strings') kit.pad(t, chord, this.sixteenth * 16, 0.05 * M.harm);
      if (S.pad === 'rhodes') kit.rhodes(t, chord, this.sixteenth * 16, 0.22 * M.harm);
    }
    if (chord && S.pad === 'stabs' && (sec === 'B' || sec === 'bridge') && (pos === 2 || pos === 6 || pos === 10 || pos === 14)) kit.stab(t, chord.map((f) => f * 2), 0.07 * M.harm);
    if (chord && S.bass && sec !== 'intro') {
      const pat = S.bass === 'soft' ? [0, 10] : st === 'kuthu' ? [0, 3, 6, 8, 11, 14] : [0, 6, 8, 11];
      if (pat.includes(pos)) kit.bass(S.bass, t, chord[0] / 2, this.sixteenth * (pos === 0 ? 3 : 2), (S.bass === 'soft' ? 0.18 : 0.22) * fadeOut * M.bass);
    }
    // Melody.
    let phrases = null;
    if (sec === 'alap') phrases = this.alap;
    else if (sec === 'A' || sec === 'B') phrases = this.themes[sec];
    else if (sec === 'korvai') phrases = [this.themes.A[1]];
    if (!phrases) {
      // Intros and bridges: the lead plays the theme's opening, in a lower register.
      if ((sec === 'intro' && bar.b >= 2) || sec === 'bridge') phrases = [this.themes.A[0]];
      else return;
    }
    const phrase = phrases[Math.floor(bar.b / 2) % phrases.length];
    const local = (bar.b % 2) * 16 + pos;
    const slow = sec === 'alap' ? 2 : 1; // the alapana is free and slow: notes stretch out
    for (const note of phrase) {
      if (note.at * slow !== local) continue;
      const leadKind = S.leads[(bar.idx + (sec === 'B' ? 1 : 0)) % S.leads.length];
      const oct = sec === 'intro' || sec === 'bridge' ? -1 : 0;
      const f = this.freq(note.deg, oct + (leadKind === 'tumbi' ? 1 : 0));
      const dur = note.len * this.sixteenth * slow * 0.95;
      const glide = this.prevF && Math.abs(Math.log2(f / this.prevF)) < 0.35 && this.r() < (st === 'carnatic' ? 0.55 : 0.4) ? this.prevF : 0;
      const v = (sec === 'intro' || sec === 'bridge' ? 0.6 : 1) * fadeOut * M.lead;
      if (leadKind === 'veena' || leadKind === 'sitar' || leadKind === 'tumbi') {
        kit.pluck(leadKind, t, f, dur, (leadKind === 'tumbi' ? 0.32 : 0.42) * v, glide);
        // Kampita: a long Carnatic note is shaken against the note above.
        if (st === 'carnatic' && note.len >= 4 && this.r() < 0.6) kit.pluck(leadKind, t + dur * 0.45, this.freq(note.deg + 1), dur * 0.3, 0.12 * v, f);
      } else kit.sustained(leadKind, t, f, dur, (leadKind === 'reed' ? 0.11 : leadKind === 'flute' ? 0.16 : 0.12) * v, glide, S.vowel ? S.vowel[bar.idx % S.vowel.length] : 'a');
      this.prevF = f;
    }
  }
}

// ---------- the radio ----------
export class Radio {
  constructor(audio, voices, hud) {
    this.audio = audio;
    this.voices = voices;
    this.hud = hud;
    this.station = -1; // index into STATIONS, -1 = off
    this.playing = false;
    this.volume = 0.7;
    this.seed = (Math.random() * 1e9) | 0;
  }

  get current() { return STATIONS[this.station] || null; }

  ensure() {
    const c = this.audio.ctx;
    if (!c || this.kit) return !!this.kit;
    this.ctx = c;
    // A broadcast sound: rumble cut, a little presence, gently compressed.
    this.input = c.createGain(); this.input.gain.value = 0.55;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 55;
    const pres = c.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2600; pres.gain.value = 2; pres.Q.value = 0.8;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; comp.knee.value = 10;
    this.out = c.createGain(); this.out.gain.value = 0;
    this.input.connect(hp).connect(pres).connect(comp).connect(this.out).connect(this.audio.master);
    this.kit = new Kit(c, this.input);
    this.kit.r = Math.random;
    return true;
  }

  setVolume(v) { this.volume = v; if (this.out && this.playing) this.out.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.1); }
  level() { return 0.42 * this.volume; }

  // Every vehicle has the station it was last tuned to (a random one the first time).
  enter(vehicle) {
    if (vehicle.radio === undefined) vehicle.radio = Math.floor(Math.random() * STATIONS.length);
    this.tune(vehicle.radio, false);
  }

  // Next station (then off, then the first again).
  next(vehicle) {
    const i = this.station + 1 >= STATIONS.length ? -1 : this.station + 1;
    if (vehicle) vehicle.radio = i;
    this.tune(i, true);
  }

  tune(i, announce) {
    const changed = i !== this.station;
    this.station = i;
    if (changed) { this.song = null; if (this.kit && this.playing) this.kit.tuneStatic(this.ctx.currentTime, 0.35); }
    if (announce || changed) this.hud?.radioStation(this.current);
  }

  // Called every frame. on: the player is in a vehicle (and not paused, wasted or on the metro).
  update(dt, on) {
    const want = on && this.station >= 0;
    if (want && !this.ensure()) return;
    if (want && !this.playing) {
      this.playing = true;
      this.out.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.15);
      this.nextT = this.ctx.currentTime + 0.08;
      this.timer = setInterval(() => this.schedule(), TICK_MS);
    } else if (!want && this.playing) {
      this.playing = false;
      clearInterval(this.timer);
      this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      this.song = null; // tune back in mid-programme, not where you left
    }
    if (this.playing) this.schedule();
  }

  newSong(midway) {
    const st = this.current;
    this.song = new Song(st.style, this.seed++);
    // Tuning in: join the song partway through, on a bar line.
    this.step = midway ? 16 * Math.floor(Math.random() * (this.song.bars.length * 0.6)) : 0;
    this.ident = 0;
  }

  schedule() {
    if (!this.playing || !this.ctx) return;
    const c = this.ctx;
    if (this.nextT < c.currentTime - 0.25) this.nextT = c.currentTime + 0.05; // after a suspend
    while (this.nextT < c.currentTime + LOOKAHEAD) {
      if (!this.song) this.newSong(true);
      if (this.ident > 0) {
        // Between songs: a jingle and the presenter.
        this.jingle(this.nextT);
        const delay = Math.max(0, (this.nextT - c.currentTime + 0.9) * 1000);
        const key = this.current.key;
        setTimeout(() => this.presenter(key), delay);
        this.nextT += 4.2;
        this.newSong(false);
        continue;
      }
      this.song.play(this.step, this.nextT, this.kit);
      this.nextT += this.song.stepDur(this.step);
      this.step++;
      if (this.step >= this.song.length) this.ident = 1;
    }
  }

  jingle(t) {
    const s = this.song || new Song(this.current.style, 1);
    [0, 2, 4, 7].forEach((d, k) => this.kit.rhodes(t + k * 0.14, [s.freq(d)], 0.6, 0.3));
    this.kit.drum('bell', t + 0.56, 1);
  }

  presenter(key) {
    if (!this.playing || this.current?.key !== key || !this.voices) return;
    const [lang, rom, native] = pick(Math.random, RJ[key]);
    this.voices.voice({ lang, rom, native }, { voicePitch: key === 'raaga' ? 0.95 : 1.05 }, { priority: false, volume: 0.9 * this.volume });
    const st = this.current;
    if (this.hud) this.hud.radioStation(st, rom);
  }
}
