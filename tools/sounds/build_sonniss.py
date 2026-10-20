# Sounds from the Sonniss #GameAudioGDC 2026 bundle (royalty-free; see SOUND_CREDITS.md).
# usage: python3 build_sonniss.py <dir with the extracted .wav files> <repo root>
# Cuts, loops, normalises and encodes them into public/audio/*.mp3 and merges their entries into
# src/systems/soundBank.json (the rest of the bank comes from build_sounds.py and build_voices.py).
import glob, json, os, subprocess, sys
import numpy as np

RAW, ROOT = sys.argv[1], sys.argv[2]
OUT = os.path.join(ROOT, 'public', 'audio')
BANK = os.path.join(ROOT, 'src', 'systems', 'soundBank.json')
SR = 44100

# Short names for the recordings used (a glob on the original file name).
SRC = {
    'zx10r_leave': 'VEHMoto_Kawasaki Ninja ZX 10R Engine Start Leave*',
    'cb500_burnout': 'VEHSkid_Honda CB500F Engine Start Tires Skidding Stop*',
    'boat_diesel': 'BOATMotr_Diesel Engine Boat Idle*',
    'horn_cb500': 'VEHHorn_Honda CB500F Horn Long*',
    'horn_zx10r': 'VEHHorn_Kawasaki Ninja ZX 10R Horn Single*',
    'gravel': 'VEHSkid_Tire Skids on Gravel*',
    'door_mustang': 'VEHDoor_Car Foley Car Door Open and Close*',
    'cabin': 'VEHCar_TownDrivingAmbience06*',
    'traffic_pass': 'AMBTraf_Traffic Multiple Cars Passing By*',
    'truck_pass': 'VEHFrght_Freight Truck Pass By*',
    'train_electric': 'TRNElec_Train Electric Passenger By Close*',
    'train_pass': 'TRNMisc_Pass By Train*',
    'madrid': 'AMBUrbn_Ambience, City, Madrid*',
    'city_rain': 'RAINConc_Rain Medium Exterior Splatter City Traffic*',
    'city_storm': 'SBsna_City Block Square Storm*',
    'texas_storm': 'STORM_Texas Rain Thunder*',
    'int_thunder': 'THUN_Interior Thunder Rumble*',
    'punch4': 'FGHTImpt_4 x Punch, Body*',
    'punch_smack': 'FGHTImpt_Combat Punch Impact*',
    'metal_thud': 'DSGNImpt_Metal Hit Thud Thump*',
    'metal_swing': 'METLImpt_METAL SWING HIT*',
    'tire_iron': 'METLImpt_Metal Old File Impact*',
    'metal_bangs': 'METLImpt_Metal Bangs, Metal Hits*',
    'glass_shards': 'GLASMvmt_Whoosh Glass Crystal*',
    'scrape': 'DSGNTonl_Metal Scrape Low Tonal*',
    'dogs': 'ANMLDog_Dog Barks, Multiple*',
}
_cache = {}

def path(name):
    hits = glob.glob(os.path.join(RAW, SRC[name]))
    if not hits: raise SystemExit(f'missing recording for {name}: {SRC[name]}')
    return hits[0]

def load(name, stereo=False):
    key = (name, stereo)
    if key not in _cache:
        ch = 2 if stereo else 1
        pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', path(name), '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-'],
                             check=True, capture_output=True).stdout
        _cache[key] = np.frombuffer(pcm, dtype=np.float32).reshape(-1, ch)
    return _cache[key]

def cut(name, t, dur, stereo=False):
    x = load(name, stereo)
    return x[int(t * SR):int((t + dur) * SR)].copy()

def autocorr_f0(s, lo, hi):
    s = s - s.mean(); n = len(s)
    F = np.fft.rfft(s * np.hanning(n), 2 * n)
    ac = np.fft.irfft(F * np.conj(F))[:n]; ac /= ac[0] + 1e-9
    a, b = int(SR / hi), min(n - 1, int(SR / lo))
    k = a + np.argmax(ac[a:b])
    return SR / k

def rms_db(x): return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)
def peak_db(x): return 20 * np.log10(np.abs(x).max() + 1e-9)

def highpass(x, fc):
    n = len(x)
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(n, 1 / SR)[:, None]
    r = (f / fc) ** 2
    X *= r / (1 + r)
    return np.fft.irfft(X, n, axis=0).astype(np.float32)

def lowpass(x, fc):
    n = len(x)
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(n, 1 / SR)[:, None]
    X /= 1 + (f / fc) ** 4
    return np.fft.irfft(X, n, axis=0).astype(np.float32)

def fade(x, fin=0.003, fout=0.03):
    x = x.copy()
    a, b = int(fin * SR), int(fout * SR)
    if a: x[:a] *= np.linspace(0, 1, a)[:, None]
    if b: x[-b:] *= np.linspace(1, 0, b)[:, None] ** 2
    return x

def level_out(x, win=0.05):
    """Divide out the slow loudness envelope (a bike riding away gets quieter as it revs)."""
    n = int(win * SR)
    e = np.sqrt(np.convolve((x[:, 0] ** 2), np.ones(n) / n, mode='same')) + 1e-4
    return (x / e[:, None] * e.mean()).astype(np.float32)

def seamless(x, L, xf):
    """Find the loop length near L whose tail best matches the head; crossfade it into the head."""
    n0, nx = int(L * SR), int(xf * SR)
    head = x[:nx, 0]
    best, bn = -2, n0
    span = int(0.12 * SR)
    for n in range(max(nx * 2, n0 - span), min(len(x) - nx, n0 + span), 7):
        tail = x[n:n + nx, 0]
        c = np.dot(head, tail) / (np.linalg.norm(head) * np.linalg.norm(tail) + 1e-9)
        if c > best: best, bn = c, n
    out = x[:bn].copy()
    t = np.linspace(0, np.pi / 2, nx)[:, None]
    out[:nx] = x[:nx] * np.sin(t) + x[bn:bn + nx] * np.cos(t)
    return out, best

def flatten_pitch(x, f_guess, lo, hi, hop=0.04, win=0.12):
    """Re-time a stretch whose firing pitch drifts (an engine revving up) so it plays at one
    constant pitch: track the pitch, smooth it, then resample along the accumulated phase."""
    s = x[:, 0]; n, h = int(win * SR), int(hop * SR)
    ts, fs, prev = [], [], f_guess
    for i in range(0, len(s) - n, h):
        f = autocorr_f0(s[i:i + n], max(lo, prev * 0.75), min(hi, prev * 1.33))
        ts.append((i + n / 2) / SR); fs.append(f); prev = f
    ts, fs = np.array(ts), np.array(fs)
    fit = np.polyval(np.polyfit(ts, fs, 2), np.arange(len(s)) / SR)
    phase = np.cumsum(fit) / SR                 # cycles elapsed at each input sample
    fc = float(np.median(fs))
    m = int(phase[-1] / fc * SR)
    tau = np.interp(np.arange(m) / SR * fc, phase, np.arange(len(s)))
    out = np.stack([np.interp(tau, np.arange(len(s)), x[:, c]) for c in range(x.shape[1])], axis=1)
    return out.astype(np.float32), fc, float(fs.min()), float(fs.max())

def steadiest(name, L, stereo=True, skip=2.0):
    """Start of the L-second window with the most even loudness and no big transients."""
    x = load(name, stereo)[:, 0]
    sec = np.array([rms_db(x[i:i + SR]) for i in range(0, len(x) - SR, SR // 2)])
    best, bt = 1e9, skip
    for k in range(int(skip * 2), len(sec) - int(L * 2) - 4):
        w = sec[k:k + int(L * 2)]
        score = w.std() + max(0, w.max() - np.median(w) - 6) * 2
        if score < best: best, bt = score, k / 2
    return bt

def encode(key, x, kbps):
    ch = x.shape[1]
    p = os.path.join(OUT, key + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', p], input=np.clip(x, -1, 1).astype(np.float32).tobytes(), check=True)
    return os.path.getsize(p)

bank = json.load(open(BANK))
added, total, report = {}, 0, []
PAD = 0.1

def loop_asset(key, x, kbps, **meta):
    global total
    p = int(PAD * SR)
    total += encode(key, np.concatenate([x[-p:], x, x[:p]]), kbps)
    added[key] = dict(file=key, loop=[PAD, round(PAD + len(x) / SR, 4)], **meta)

def shot_asset(key, x, kbps, **meta):
    global total
    total += encode(key, x, kbps)
    added[key] = dict(file=key, **meta)

def norm_loop(x, db): return x * 10 ** ((db - rms_db(x)) / 20)
def norm_peak(x, db=-1): return x * 10 ** ((db - peak_db(x)) / 20)

# ---- Sports bike engine: idle, plus two pitch-flattened stretches of the ZX-10R pulling away. ----
x = highpass(cut('zx10r_leave', 2.8, 1.2), 25)
idle_f0 = autocorr_f0(x[:, 0], 30, 60)
lp, c = seamless(x, 0.8, 0.08)   # (start and length searched for the cleanest seam)
loop_asset('eng_sport_0', norm_loop(lp, -18), 80, f0=round(idle_f0, 2))
report.append(f'eng_sport_0: idle {idle_f0:.1f} Hz match={c:.2f}')
for i, (t, d, g) in enumerate([(3.75, 1.0, 58), (4.65, 0.95, 82)], 1):
    x = level_out(highpass(cut('zx10r_leave', t, d), 25))
    flat, fc, f_lo, f_hi = flatten_pitch(x, g, 35, 140)
    lp, c = seamless(flat, len(flat) / SR - 0.14, 0.06)
    loop_asset(f'eng_sport_{i}', norm_loop(lp, -18), 80, f0=round(fc, 2))
    report.append(f'eng_sport_{i}: {f_lo:.0f}-{f_hi:.0f} Hz flattened to {fc:.1f} Hz, {len(lp)/SR:.2f}s match={c:.2f}')

# ---- Heavy diesel idle below the existing bus/lorry layers. ----
x = highpass(cut('boat_diesel', 6.0, 2.4), 18)
f = autocorr_f0(x[:, 0], 18, 40)
lp, c = seamless(x, 1.9, 0.12)
loop_asset('eng_bus_idle', norm_loop(lp, -18), 80, f0=round(f, 2))
report.append(f'eng_bus_idle: {f:.1f} Hz match={c:.2f}')

# ---- Engine starts (one-shots when you get on). ----
shot_asset('start_sport', norm_peak(fade(highpass(cut('zx10r_leave', 0.0, 2.3), 30), 0.002, 0.5)), 80)
shot_asset('start_moto', norm_peak(fade(highpass(cut('cb500_burnout', 0.0, 2.4), 30), 0.002, 0.5)), 80)

# ---- Horns for the motorbikes (attack plus a loopable sustain while held). ----
for key, src, t, dur in [('horn_moto', 'horn_cb500', 0.0, 1.2), ('horn_moto2', 'horn_zx10r', 0.0, 0.38)]:
    x = norm_peak(fade(highpass(cut(src, t, dur), 60), 0.004, 0.05))
    n = len(x) / SR
    sus = [round(min(0.08, n * 0.25), 3), round(n - max(0.06, n * 0.2), 3)]
    pitch = autocorr_f0(x[int(sus[0] * SR):int(sus[1] * SR), 0], 150, 900)
    shot_asset(key, x, 80, sustain=sus, f0=round(pitch, 1))
    report.append(f'{key}: {n:.2f}s f0={pitch:.0f} sustain={sus}')

# ---- Tyres: a motorbike's rear wheel lighting up, gravel under a sliding car, metal grinding. ----
x = highpass(cut('cb500_burnout', 4.0, 3.6), 900)       # keep the tyre, lose most of the engine
lp, c = seamless(x, 3.0, 0.3)
loop_asset('skid_moto', norm_loop(lp, -16), 72)
report.append(f'skid_moto: match={c:.2f}')
t0 = steadiest('gravel', 3.6, stereo=False, skip=1.0)
lp, c = seamless(highpass(cut('gravel', t0, 3.6), 80), 3.0, 0.3)
loop_asset('skid_gravel', norm_loop(lp, -16), 72)
report.append(f'skid_gravel: from {t0}s match={c:.2f}')
lp, c = seamless(highpass(cut('scrape', 0.8, 3.2), 60), 2.6, 0.25)
loop_asset('scrape', norm_loop(lp, -16), 72)
report.append(f'scrape: match={c:.2f}')

# ---- Rolling noise: road roar inside a closed car, and trains on the move. ----
t0 = steadiest('cabin', 14, skip=3)
lp, c = seamless(highpass(cut('cabin', t0, 15.5, True), 220), 14, 1.2)
loop_asset('cabin_road', norm_loop(lp, -20), 80)
report.append(f'cabin_road: from {t0}s match={c:.2f}')
for key, src, L in [('train_run', 'train_electric', 5.0), ('rail_run', 'train_pass', 4.0)]:
    x = load(src, True)
    env = np.array([rms_db(x[i:i + SR // 2, 0]) for i in range(0, len(x) - SR // 2, SR // 4)])
    k = int(np.argmax(np.convolve(env, np.ones(int(L * 4)) / (L * 4), mode='valid')))
    t0 = k / 4
    lp, c = seamless(level_out(highpass(cut(src, t0, L + 0.8, True), 40), 0.4), L, 0.5)
    loop_asset(key, norm_loop(lp, -18), 80)
    report.append(f'{key}: from {t0}s match={c:.2f}')

# ---- Pass-bys and street beds. ----
x = norm_peak(fade(highpass(cut('truck_pass', 0.0, 5.2, True), 30), 0.3, 0.8), -2)
shot_asset('passby_truck', x, 80)
lp, c = seamless(highpass(cut('traffic_pass', 0.5, 17.0, True), 35), 15.5, 1.2)
loop_asset('amb_traffic', norm_loop(lp, -22), 96)
report.append(f'amb_traffic: match={c:.2f}')
for key, src, L, db, hp in [('amb_city_night', 'madrid', 30, -24, 40), ('rain_city', 'city_rain', 30, -22, 40), ('rain_storm', 'city_storm', 30, -21, 30)]:
    t0 = steadiest(src, L + 2.5)
    lp, c = seamless(highpass(cut(src, t0, L + 2.5, True), hp), L, 2.0)
    loop_asset(key, norm_loop(lp, db), 96)
    report.append(f'{key}: from {t0}s match={c:.2f}')
shot_asset('thunder_near_b', norm_peak(fade(cut('texas_storm', 2.9, 12.0, True), 0.05, 3.0)), 96)
shot_asset('thunder_far_b', norm_peak(fade(lowpass(cut('int_thunder', 1.2, 12.0, True), 2500), 0.2, 3.0)), 96)

# ---- Impacts. ----
SHOTS = {
    'punch_5': ('punch4', 0.15, 0.45), 'punch_6': ('punch4', 1.10, 0.5), 'punch_7': ('punch4', 2.15, 0.45),
    'punch_8': ('punch4', 3.15, 0.45), 'punch_9': ('punch_smack', 0.0, 0.7),
    'metal_2': ('metal_thud', 0.0, 1.8), 'metal_3': ('metal_swing', 0.0, 2.0), 'metal_4': ('tire_iron', 0.1, 0.36),
    'crash_4': ('metal_bangs', 19.30, 1.3), 'crash_5': ('metal_bangs', 50.05, 1.0), 'crash_6': ('metal_bangs', 63.60, 1.7),
    'glass_2': ('glass_shards', 1.85, 0.7),
    'door_open_b': ('door_mustang', 0.02, 0.45), 'door_close_b': ('door_mustang', 1.80, 0.5),
    'dog_0': ('dogs', 0.20, 0.6), 'dog_1': ('dogs', 1.60, 0.6), 'dog_2': ('dogs', 3.48, 0.6), 'dog_3': ('dogs', 4.85, 0.7),
}
for key, (src, t, dur) in SHOTS.items():
    x = highpass(cut(src, t, dur), 40)
    x = norm_peak(fade(x, 0.002, min(0.25, dur * 0.3)))
    shot_asset(key, x, 72)
    report.append(f'{key}: {len(x)/SR:.2f}s')

bank.update(added)
# One compact line per sound, as the rest of the bank is written.
with open(BANK, 'w') as fh:
    fh.write('{\n' + ',\n'.join(f' {json.dumps(k)}: {json.dumps(v, separators=(",", ":"))}' for k, v in bank.items()) + '\n}\n')
print('\n'.join(report))
print(f'ADDED {len(added)} sounds, {total/1e6:.2f} MB')
