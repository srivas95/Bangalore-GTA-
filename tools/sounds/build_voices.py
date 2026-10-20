# Cut, trim, loudness-match and encode the game's recorded voices.
#   python3 tools/sounds/build_voices.py <raw dir> <out dir>
# Downloads any source listed in voices.txt that is missing from <raw dir> (Sonniss bundles on
# archive.org, OpenGameArt, Wikimedia Commons / Lingua Libre), then writes <out>/audio/*.mp3 and
# <out>/manifest.json (key -> file, dur, gain, text, lang, source, author, licence, url).
# Every clip is checked after encoding (duration, peak, onset); clips that fail are dropped.
import json, os, subprocess, sys, time, urllib.parse, urllib.request, urllib.error
import numpy as np

RAW, OUT = sys.argv[1], sys.argv[2]
SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(OUT, 'audio'), exist_ok=True)
UA = {'User-Agent': 'NammaBengaluruGame/0.6 (game sound build; https://github.com/srivas95) python-urllib'}

# ---- Sources ----
SOURCES = {}
for line in open(os.path.join(HERE, 'voices.txt'), encoding='utf-8'):
    if line.startswith('#') or not line.strip(): continue
    name, kind, ref, path, author, lic = [f.strip() for f in line.split('|')]
    if kind == 'sonniss':
        url = f'https://archive.org/download/sonniss-gdc-{ref}-game-audio-bundle-normalized/' + urllib.parse.quote(path)
        page = url
    elif kind == 'commons':
        url, page = path, 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(ref.replace(' ', '_'), safe='/:')
    else:
        url, page = path, ref
    ext = os.path.splitext(urllib.parse.unquote(url))[1].lower()
    # Any already-downloaded <name>.wav/.ogg/.mp3 will do: Lingua Libre's per-language dataset zips
    # (https://archive.lingualibre.org/datasets/) hold the same recordings as .ogg, which helps when
    # upload.wikimedia.org is rate-limiting.
    have = [os.path.join(RAW, name + e) for e in (ext, '.wav', '.ogg', '.mp3') if os.path.exists(os.path.join(RAW, name + e))]
    SOURCES[name] = dict(kind=kind, ref=ref, path=path, url=url, page=page, author=author, licence=lic,
                         file=have[0] if have else os.path.join(RAW, name + ext))

def fetch():
    """Download what is missing. upload.wikimedia.org rate-limits hard, so Commons files are spaced
    out and a 429 waits for its Retry-After."""
    for name, s in SOURCES.items():
        if os.path.exists(s['file']) and os.path.getsize(s['file']) > 0: continue
        while True:
            try:
                data = urllib.request.urlopen(urllib.request.Request(s['url'], headers=UA), timeout=120).read(); break
            except urllib.error.HTTPError as e:
                if e.code not in (429, 503): raise
                wait = int(e.headers.get('Retry-After') or 60) + 10
                print(f'  {name}: HTTP {e.code}, waiting {wait}s'); time.sleep(wait)
        open(s['file'], 'wb').write(data)
        print('  fetched', name)
        if s['kind'] == 'commons': time.sleep(6)

_cache = {}
def load(name):
    if name not in _cache:
        pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', SOURCES[name]['file'], '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                             check=True, capture_output=True).stdout
        _cache[name] = np.frombuffer(pcm, dtype=np.float32).copy()
    return _cache[name]

def cut(name, t=0.0, dur=None):
    x = load(name)
    a = int(t * SR)
    return x[a:] if dur is None else x[a:a + int(dur * SR)]

# ---- DSP helpers (same style as build_sounds.py) ----
def db(v): return 20 * np.log10(v + 1e-12)
def rms_db(x): return db(np.sqrt((x ** 2).mean()))
def peak_db(x): return db(np.abs(x).max())

def highpass(x, fc):
    # Second-order-ish high-pass in the frequency domain (removes rumble, DC and mic thumps).
    n = len(x)
    X = np.fft.rfft(x)
    r = (np.fft.rfftfreq(n, 1 / SR) / fc) ** 2
    return np.fft.irfft(X * r / (1 + r), n).astype(np.float32)

def envelope(x, hop):
    n = len(x) // hop
    return np.abs(x[:n * hop]).reshape(n, hop).max(1)

def frames_rms(x, hop):
    n = len(x) // hop
    return np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12)

def main_part(x, gap=0.15, quieter=12):
    """Drop stray breaths, lip clicks and chair noises before/after the word: sound islands that are
    more than `gap` s away from the loudest island and either `quieter` dB below it or shorter than
    40 ms (clicks). Gaps inside a word, like the "tt" closure in "matte", are shorter than `gap`, and
    real syllables are long and loud enough to stay."""
    hop = int(0.01 * SR)
    f = db(frames_rms(x, hop))
    act = f > max(f.max() - 40, np.percentile(f, 5) + 10)
    isl, i = [], 0
    while i < len(act):
        if act[i]:
            j = i
            while j < len(act) and act[j]: j += 1
            isl.append([i, j, f[i:j].max()]); i = j
        else: i += 1
    k = max(range(len(isl)), key=lambda n: isl[n][2])
    a, b = k, k
    def keep(n, d): return d * 0.01 <= gap or (isl[n][2] > f.max() - quieter and isl[n][1] - isl[n][0] >= 4)
    while a > 0 and keep(a - 1, isl[a][0] - isl[a - 1][1]): a -= 1
    while b < len(isl) - 1 and keep(b + 1, isl[b + 1][0] - isl[b][1]): b += 1
    return x[max(0, (isl[a][0] - 3) * hop):min(len(x), (isl[b][1] + 8) * hop)]

def trim(x, start_rel=-30, end_rel=-42, pre=0.004, post=0.04, floor_margin=10):
    """Start just before the voice onset and end after the decay. Thresholds are relative to the clip's
    peak but never below the noise floor + floor_margin dB, so room noise isn't mistaken for voice."""
    hop = int(0.001 * SR)
    env = envelope(x, hop)
    floor = np.percentile(frames_rms(x, int(0.01 * SR)), 5) * 1.41  # rms -> rough peak level of the noise
    pk = env.max()
    t0 = max(pk * 10 ** (start_rel / 20), floor * 10 ** (floor_margin / 20))
    t1 = max(pk * 10 ** (end_rel / 20), floor * 10 ** (floor_margin / 20))
    a = np.nonzero(env > t0)[0][0]
    a = max(0, a * hop - int(pre * SR))
    b = min(len(x), (np.nonzero(env > t1)[0][-1] + 1) * hop + int(post * SR))
    return x[a:b]

def fade(x, fin=0.002, fout=0.05):
    x = x.copy()
    a, b = int(fin * SR), min(int(fout * SR), len(x) // 2)
    if a: x[:a] *= np.linspace(0, 1, a)
    if b: x[-b:] *= np.linspace(1, 0, b) ** 2
    return x

def voiced_rms_db(x):
    """RMS over the 10 ms frames within 20 dB of the loudest one: the voice, not the gaps around it."""
    f = frames_rms(x, int(0.01 * SR))
    return db(np.sqrt((f[f > f.max() * 0.1] ** 2).mean()))

def limit(x, ceil_db=-1.5, max_gr_db=4.0):
    """Gentle peak limiter: per-sample gain that keeps |x| under the ceiling, held over 3 ms and
    smoothed, so short transients lose a few dB instead of the whole clip getting quieter."""
    ceil = 10 ** (ceil_db / 20)
    need = np.minimum(1.0, ceil / (np.abs(x) + 1e-9))
    w = int(0.003 * SR)
    held = np.lib.stride_tricks.sliding_window_view(np.pad(need, (w // 2, w - w // 2 - 1), mode='edge'), w).min(1)
    k = np.hanning(w // 2 * 2 + 1); k /= k.sum()
    g = np.minimum(np.convolve(held, k, mode='same'), held)
    g = np.maximum(g, 10 ** (-max_gr_db / 20))
    y = x * g
    pk = np.abs(y).max()
    return y * min(1.0, ceil / pk) if pk > ceil else y

def loudness(x, target_db):
    x = x * 10 ** ((target_db - voiced_rms_db(x)) / 20)
    return limit(x)

def encode(key, x, kbps=96):
    path = os.path.join(OUT, 'audio', key + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', path], input=np.clip(x, -1, 1).astype(np.float32).tobytes(), check=True)
    return path

def decode(path):
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], check=True, capture_output=True).stdout
    return np.frombuffer(pcm, dtype=np.float32)

def seamless(x, L, xf):
    """x holds at least L+xf(+search) seconds. Find the loop length near L whose tail best matches
    the head, then crossfade the tail into the head. Returns a loop of that length."""
    n0, nx = int(L * SR), int(xf * SR)
    head = x[:nx]
    best, bn = -2, n0
    span = int(0.12 * SR)
    for n in range(max(nx * 2, n0 - span), min(len(x) - nx, n0 + span), 7):
        tail = x[n:n + nx]
        c = np.dot(head, tail) / (np.linalg.norm(head) * np.linalg.norm(tail) + 1e-9)
        if c > best: best, bn = c, n
    out = x[:bn].copy()
    t = np.linspace(0, np.pi / 2, nx)
    out[:nx] = x[:nx] * np.sin(t) + x[bn:bn + nx] * np.cos(t)
    return out, best

# ---- Output + checks ----
manifest, report, dropped = {}, [], []
source_of = {}  # key -> source name, for the credits
PAD = 0.1

def title(s):
    if s['kind'] == 'sonniss': return f"Sonniss GDC {s['ref']} bundle: {s['path']}"
    if s['kind'] == 'oga': return 'OpenGameArt: ' + s['ref'].rstrip('/').rsplit('/', 1)[-1].replace('-', ' ').capitalize()
    return s['ref']

def credit(src):
    s = SOURCES[src]
    return dict(source=title(s), author=s['author'], licence=s['licence'], url=s['url'] if s['kind'] == 'sonniss' else s['page'])

def shot(key, src, x, dur=(0.1, 2.5), gain=1.0, **meta):
    """Encode a one-shot, then decode it and check what the game will actually play."""
    path = encode(key, x)
    y = decode(path)
    d, pk = len(y) / SR, peak_db(y)
    env = envelope(y, int(0.001 * SR))
    lead = np.nonzero(env > env.max() * 10 ** (-40 / 20))[0][0] / 1000  # ms resolution; -40 dB counts soft "s"/"h" onsets
    problems = []
    if not dur[0] <= d <= dur[1]: problems.append(f'duration {d:.2f}s')
    if pk > -0.9: problems.append(f'peak {pk:.1f} dBFS')
    if lead > 0.010: problems.append(f'onset at {lead * 1000:.0f} ms')
    if problems:
        os.remove(path); dropped.append(f'{key} ({src}): ' + ', '.join(problems)); return
    manifest[key] = dict(file=f'audio/{key}.mp3', dur=round(d, 3), gain=gain, **meta, **credit(src))
    source_of[key] = src
    floor = db(np.percentile(frames_rms(y, int(0.01 * SR)), 5))
    report.append(f'{key}: {d:.2f}s peak {pk:.1f} voiced {voiced_rms_db(y):.1f} floor {floor:.0f} onset {lead * 1000:.0f}ms')

def loop(key, src, x, gain=1.0, **meta):
    """Store a loop with PAD seconds of its own wrap-around on both sides (as build_sounds.py does), so
    the loop points land in continuous audio whatever priming the MP3 decoder leaves in."""
    p = int(PAD * SR)
    encode(key, np.concatenate([x[-p:], x, x[:p]]))
    manifest[key] = dict(file=f'audio/{key}.mp3', dur=round(len(x) / SR, 3), loop=[PAD, round(PAD + len(x) / SR, 4)], gain=gain,
                         **meta, **credit(src))
    source_of[key] = src
    report.append(f'{key}: loop {len(x) / SR:.2f}s rms {rms_db(x):.1f}')

def vocal(key, src, t=0.0, dur=None, maxdur=0.8, hp=80, start_rel=-26, end_rel=-40, target=-20, gain=1.0, check=(0.12, 0.9), gap=0.04, **meta):
    """One short vocal sound: cut a window around it, trim to the onset and decay, cap the length,
    normalise the voiced part to `target` dBFS RMS with peaks under -1.5 dBFS. Grunts start where they
    get loud (start_rel), so a hit or punch sound lands on the frame it is played."""
    x = highpass(cut(src, t, dur), hp)
    x = trim(main_part(x, gap), start_rel, end_rel)
    if len(x) > maxdur * SR: x = x[:int(maxdur * SR)]
    x = fade(x, 0.002, min(0.08, len(x) / SR * 0.3))
    shot(key, src, loudness(x, target), check, gain, **meta)

if '--no-fetch' not in sys.argv: fetch()

# ---- 1. Getting hit: short pain grunts. ----
# Male: VoiceBosch damage grunts (OpenGameArt) + two Sonniss pain grunts.
HIT = dict(maxdur=0.7, end_rel=-34)  # stop before the breath that follows the grunt
for i, n in enumerate([1, 2, 5, 6, 7, 9, 13, 14, 16, 18]):
    vocal(f'vo_hit_m_{i}', f'vb_damage_{n:02d}', **HIT)
vocal('vo_hit_m_10', 'brfx_m_pain', **HIT)
vocal('vo_hit_m_11', 'a344_soldier_grunts', **HIT)
# Female: one actress's 50 s reel of medium "getting hit" grunts, ~1.8 s apart. Start times of the
# chosen takes (found by energy segmentation, picked to avoid near-identical ones).
for i, t in enumerate([3.91, 9.36, 14.80, 16.53, 23.68, 25.42, 37.97, 41.56]):
    vocal(f'vo_hit_f_{i}', 'grunts_f1_hit', t - 0.08, 0.9, **HIT)

# ---- 2. Effort: throwing a punch / kick. ----
EFF = dict(maxdur=0.6, start_rel=-20, end_rel=-36)  # start on the burst, not the breath before it
for i, n in enumerate([1, 3, 6, 10, 21, 28]):
    vocal(f'vo_effort_m_{i}', f'vb_effort_{n:02d}', **EFF)
vocal('vo_effort_m_6', 'a344_m_yell', **EFF)
vocal('vo_effort_m_7', 'gm_m_shout', **{**EFF, 'maxdur': 0.75})
vocal('vo_effort_f_0', 'as_f_grunt', **{**EFF, 'maxdur': 0.7})
vocal('vo_effort_f_1', 'gm_f_attack', **EFF)
for i, t in enumerate([8.02, 35.06, 39.60]):  # jump/land efforts from another actress's reel
    vocal(f'vo_effort_f_{i + 2}', 'grunts_f3_jump', t - 0.08, 0.8, **EFF)

# ---- 3. Panic screams (pedestrians fleeing gunfire). ----
SCREAM = dict(maxdur=2.0, target=-19, check=(0.3, 2.1))
vocal('vo_scream_m_0', 'brfx_m_scream', **SCREAM)
vocal('vo_scream_m_1', 'a344_m_shock', **SCREAM)
vocal('vo_scream_m_2', 'sb_m_pain', **SCREAM)
vocal('vo_scream_f_0', 'sb_f_scream', **SCREAM)
vocal('vo_scream_f_1', 'a344_f_pain', **SCREAM)
vocal('vo_scream_f_2', 'a344_f_yell', **SCREAM)
vocal('vo_scream_f_3', 'a344_f_warrior', **SCREAM)
# Group scream: a 3.6 s stretch of a crowd-scream loop around its loudest swell.
x = fade(highpass(cut('a344_crowd', 2.95, 3.6), 80), 0.01, 0.5)
shot('vo_crowd_scream_0', 'a344_crowd', loudness(x, -20), (2.0, 4.0))

# ---- 4. Deaths. ----
DEATH = dict(maxdur=1.6, end_rel=-38, check=(0.3, 1.7), gap=0.9)  # keep the final breath after a pause
vocal('vo_death_m_0', 'gm_m_death', 0, 1.15, **DEATH)
vocal('vo_death_m_1', 'bard_death_pain_grunts', 36.0, 1.5, **DEATH)
vocal('vo_death_m_2', 'bard_death_pain_grunts', 47.4, 1.6, **DEATH)
vocal('vo_death_f_0', 'esm_f_dying', 0, 1.6, **DEATH)
vocal('vo_death_f_1', 'nv_female_hurt', 9.36, 1.0, **DEATH)

# ---- 5. Gasps (shocked / out of breath). ----
for i, t in enumerate([2.33, 12.07, 39.20]):
    vocal(f'vo_gasp_m_{i}', 'grunts_m1_gasp', t - 0.1, 0.9, maxdur=0.7, start_rel=-34)
vocal('vo_gasp_m_3', 'ud_m_gasp', maxdur=0.7, start_rel=-34)
vocal('vo_gasp_m_4', 'esm_m_gasp', maxdur=0.7, start_rel=-34)

# ---- 6. Kannada and Hindi words (Lingua Libre speakers on Wikimedia Commons). ----
sys.path.insert(0, HERE)
from voice_words import KN, HI, SPEAKERS
for name, s in SOURCES.items():
    if s['kind'] != 'commons' or not s['ref'].startswith('File:LL-'): continue
    if not os.path.exists(s['file']): dropped.append(f'{name}: not downloaded'); continue
    lang = 'kn' if '(kan)' in s['ref'] else 'hi'
    word = s['ref'].split('-', 3)[3].rsplit('.', 1)[0]  # "File:LL-Q33673 (kan)-<speaker>-<word>.wav"
    rom, meaning = (KN if lang == 'kn' else HI)[word]
    letter, gender = SPEAKERS[s['author']]
    # Pronunciation recordings: let soft consonants in (lower start threshold), keep a natural tail.
    vocal(f'vo_{lang}_{rom}_{letter}', name, maxdur=1.8, hp=70, start_rel=-36, end_rel=-40, target=-20, check=(0.15, 1.9),
          gap=0.15, text=f'{word} ({rom.replace("_", " ")}): {meaning}', lang=lang, speaker=s['author'], gender=gender)

# ---- 7. Indian crowd walla: seamless loops from the North India train station recording (stretches
# without the train horn or the PA announcements). ----
for i, (t, L) in enumerate([(6.0, 24.0), (82.0, 24.0)]):
    x = highpass(cut('fn_station', t, L + 2.5), 60)
    lp, corr = seamless(x, L, 2.0)
    lp *= 10 ** ((-26 - rms_db(lp)) / 20)
    loop(f'amb_walla_{i}', 'fn_station', lp)
    report[-1] += f' match={corr:.2f}'

# ---- 8. Whistles: samba whistle blasts (traffic police / conductor style) and a man's mouth whistle. ----
for i, (t, d) in enumerate([(0.10, 1.70), (5.40, 1.65), (8.10, 1.60)]):
    x = fade(highpass(cut('ca_samba_whistle', t, d), 300), 0.003, 0.06)
    shot(f'sfx_whistle_{i}', 'ca_samba_whistle', loudness(trim(x, -30, -50), -22), (0.8, 1.8), gain=0.6)
x = fade(highpass(trim(cut('sbvh_whistle', 0.7, 1.7), -30, -50), 300), 0.003, 0.08)
shot('sfx_whistle_3', 'sbvh_whistle', loudness(x, -22), (0.8, 1.8), gain=0.6)

# ---- 9. Street vendor calls, cut from field recordings (Commons, Subhashish Panigrahi). The calls are
# the loudest voice-band stretches; the street noise under them stays, quieter. ----
def band(x, lo=300, hi=3000):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * ((f > lo) & (f < hi)), len(x)).astype(np.float32)

def calls(x, n, min_len=0.5, max_len=3.0):
    """Start/end times (s) of the n loudest voice-band islands at least 1 s apart."""
    hop = int(0.05 * SR)
    e = db(frames_rms(band(x), hop))
    act = e > np.median(e) + 10
    isl, i = [], 0
    while i < len(act):
        if act[i]:
            j = i
            while j < len(act) and (act[j] or act[j:j + 5].any()): j += 1  # bridge gaps up to 0.25 s
            if min_len <= (j - i) * 0.05 <= max_len: isl.append((e[i:j].max(), i * 0.05, j * 0.05))
            i = j
        else: i += 1
    out = []
    for pk, a, b in sorted(isl, reverse=True):
        if all(b + 1 < a2 or a > b2 + 1 for a2, b2 in out): out.append((a, b))
        if len(out) == n: break
    return sorted(out)

# (recording, how many calls, language, what is being called)
VENDORS = [('vend_greens', 4, 'kn', 'Kannada greens seller: soppu (leafy greens), kottambari (coriander), menthya (fenugreek), pudina (mint), hoovu (flowers)'),
           ('vend_puffedrice', 3, 'kn', 'Kannada puffed-rice seller (kadlepuri / mandakki)'),
           ('vend_paper', 2, 'kn', 'Bengaluru scrap-paper buyer calling "paper!"'),
           ('vend_groundnut_bus', 2, 'or', 'Odia groundnut seller in a bus: "badamo monji" (groundnuts)'),
           ('vend_books_bus', 1, 'or', 'Odia book hawker in a bus')]
k = 0
for src, n, lang, text in VENDORS:
    if not os.path.exists(SOURCES[src]['file']): dropped.append(f'{src}: not downloaded'); continue
    x = highpass(load(src), 120)
    for a, b in calls(x, n):
        y = x[int(max(0, a - 0.15) * SR):int((b + 0.25) * SR)]
        y = fade(trim(y, -24, -30, pre=0.01, post=0.1), 0.004, 0.15)
        key = f'vo_vendor_{k}'
        shot(key, src, loudness(y, -20), (0.4, 3.5), lang=lang, text=text, speaker='street vendor')
        if key in manifest: report[-1] += f'  [{src} {a:.2f}-{b:.2f}]'; k += 1

json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---- Credits snippet for SOUND_CREDITS.md ----
FAMILY = [('vo_hit_m', 'Pain grunts (men)'), ('vo_hit_f', 'Pain grunts (women)'), ('vo_effort_m', 'Punch and kick efforts (men)'),
          ('vo_effort_f', 'Punch and kick efforts (women)'), ('vo_scream_m', 'Panic screams (men)'), ('vo_scream_f', 'Panic screams (women)'),
          ('vo_crowd_scream', 'Crowd scream'), ('vo_death_m', 'Deaths (men)'), ('vo_death_f', 'Deaths (women)'), ('vo_gasp_m', 'Gasps'),
          ('vo_vendor', 'Street vendor calls'), ('amb_walla', 'Indian crowd walla'), ('sfx_whistle', 'Whistles'),
          ('vo_kn', 'Kannada words'), ('vo_hi', 'Hindi words')]
def family(key): return next(label for pre, label in FAMILY if key.startswith(pre))
uses = {}
for key, src in source_of.items(): uses.setdefault(src, []).append(key)
rows = {}  # publisher -> (families, library names)
for src, keys in uses.items():
    s = SOURCES[src]
    if s['kind'] != 'sonniss': continue
    lib = s['path'].split('/')[0]  # "<Publisher> - <Library>"
    rec = lib.split(' - ', 1)[1].strip() if ' - ' in lib else lib
    r = rows.setdefault(s['author'], [set(), []])
    r[0].update(family(k) for k in keys)
    if rec not in r[1]: r[1].append(rec)
md = ['<!-- generated by tools/sounds/build_voices.py -->', '', '| Used for | Recording | Publisher / recordist |', '|---|---|---|']
for pub, (fams, recs) in rows.items():
    md.append(f"| {', '.join(f for _, f in FAMILY if f in fams)} | {'; '.join(recs)} | {pub} |")
md += ['', '### Voices from Wikimedia Commons, Lingua Libre and OpenGameArt', '',
       'Some voices are not from the Sonniss bundles. They are free recordings, mostly under Creative Commons',
       'licences that require credit: **CC BY / CC BY-SA** files must name the author and link the source, and the',
       'trimmed, loudness-matched versions we ship of **CC BY-SA** files are themselves shared under the same licence',
       '(CC BY-SA 3.0/4.0). CC0 files need no credit; we list them anyway.', '',
       'Kannada and Hindi words were recorded by native speakers for [Lingua Libre](https://lingualibre.org) and are',
       'hosted on Wikimedia Commons (each link goes to the file page with its licence):', '']
by_speaker = {}
for src, keys in uses.items():
    s = SOURCES[src]
    if s['kind'] == 'commons' and s['ref'].startswith('File:LL-'):
        word = s['ref'].split('-', 3)[3].rsplit('.', 1)[0]
        by_speaker.setdefault((s['author'], 'Kannada' if '(kan)' in s['ref'] else 'Hindi', s['licence']), []).append(f"[{word}]({s['page']})")
for (who, lang, lic), links in sorted(by_speaker.items(), key=lambda kv: (kv[0][1] != 'Kannada', kv[0][0])):
    md.append(f"- **{who}** ({lang}, {lic}): {', '.join(sorted(links))}")
md += ['', 'Other recordings:', '', '| Used for | File | Author | Licence |', '|---|---|---|---|']
other = {}
for src, keys in uses.items():
    s = SOURCES[src]
    if s['kind'] == 'sonniss' or s['ref'].startswith('File:LL-'): continue
    name = s['ref'][5:] if s['kind'] == 'commons' else title(s)[len('OpenGameArt: '):]
    fams = other.setdefault((name, s['page'], s['author'], s['licence']), [])
    for f in map(family, keys):
        if f not in fams: fams.append(f)
for (name, page, who, lic), fams in other.items():
    md.append(f"| {', '.join(fams)} | [{name}]({page}) | {who} | {lic} |")
open(os.path.join(OUT, 'CREDITS_SNIPPET.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')

print('\n'.join(report))
if dropped: print('DROPPED:\n  ' + '\n  '.join(dropped))
size = sum(os.path.getsize(os.path.join(OUT, v['file'])) for v in manifest.values())
print(f'TOTAL {size / 1e6:.2f} MB in {len(manifest)} files')
