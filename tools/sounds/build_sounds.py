# Cut, loop, normalise and encode the game's sounds from the downloaded recordings.
# Writes <out>/audio/*.mp3 and <out>/soundBank.json (loop points, base pitches, gains).
import json, subprocess, sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import enrich as enrich_mod

RAW, OUT = sys.argv[1], sys.argv[2]
SR = 44100
os.makedirs(os.path.join(OUT, 'audio'), exist_ok=True)
_cache = {}

def load(name, stereo=False):
    key = (name, stereo)
    if key not in _cache:
        ch = 2 if stereo else 1
        pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(RAW, name + '.mp3'), '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-'],
                             check=True, capture_output=True).stdout
        x = np.frombuffer(pcm, dtype=np.float32).reshape(-1, ch)
        _cache[key] = x
    return _cache[key]

def cut(name, t, dur, stereo=False):
    x = load(name, stereo)
    a, b = int(t * SR), int((t + dur) * SR)
    return x[a:b].copy()

def f0(x, lo, hi):
    s = x[:, 0] if x.ndim > 1 else x
    s = s - s.mean()
    n = len(s)
    F = np.fft.rfft(s * np.hanning(n), 2 * n)
    ac = np.fft.irfft(F * np.conj(F))[:n]
    ac /= ac[0] + 1e-9
    a, b = int(SR / hi), int(SR / lo)
    k = a + np.argmax(ac[a:b])
    return SR / k

def frames_f0(x, lo, hi, step=0.2):
    n = int(step * SR)
    return [f0(x[i:i + n], lo, hi) for i in range(0, len(x) - n, n)]

def seamless(x, L, xf):
    """x holds at least L+xf(+search) seconds. Find the loop length near L whose tail best matches
    the head, then crossfade the tail into the head. Returns a loop of that length."""
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

def rms_db(x): return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)
def peak_db(x): return 20 * np.log10(np.abs(x).max() + 1e-9)

def fade(x, fin=0.003, fout=0.03):
    x = x.copy()
    a, b = int(fin * SR), int(fout * SR)
    if a: x[:a] *= np.linspace(0, 1, a)[:, None]
    if b: x[-b:] *= np.linspace(1, 0, b)[:, None] ** 2
    return x

def highpass(x, fc):
    # Second-order-ish high-pass applied in the frequency domain (removes rumble and DC).
    n = len(x)
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(n, 1 / SR)[:, None]
    r = (f / fc) ** 2
    X *= r / (1 + r)
    return np.fft.irfft(X, n, axis=0).astype(np.float32)

def encode(name, x, kbps):
    ch = x.shape[1]
    path = os.path.join(OUT, 'audio', name + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', path], input=np.clip(x, -1, 1).astype(np.float32).tobytes(), check=True)
    return os.path.getsize(path)

bank = {}
PAD = 0.1

def loop_asset(key, x, kbps, **meta):
    """Store a loop with PAD seconds of its own wrap-around on both sides, so the loop points land in
    continuous audio whatever priming the MP3 decoder leaves in."""
    p = int(PAD * SR)
    data = np.concatenate([x[-p:], x, x[:p]])
    size = encode(key, data, kbps)
    bank[key] = dict(file=f'audio/{key}.mp3', loop=[PAD, PAD + len(x) / SR], **meta)
    return size

def shot_asset(key, x, kbps, **meta):
    size = encode(key, x, kbps)
    bank[key] = dict(file=f'audio/{key}.mp3', **meta)
    return size

total = 0
report = []

# ---- Engines: three RPM layers per class, each a seamless loop with its measured pitch. ----
# (recording, start, loop length, firing pitch measured over that stretch with 1 s analysis windows)
ENGINES = {
    'auto':    [('auto_drive', 173.4, 1.6, 30.6), ('auto_drive', 157.0, 1.6, 58.0), ('auto_drive', 116.6, 2.0, 89.3)],
    'bike':    [('bullet_slow', 8.0, 3.6, 9.3), ('rajdoot_ride', 24.2, 1.4, 26.0), ('rajdoot_ride', 97.4, 1.4, 46.9)],
    'scooter': [('moped_onboard', 2.2, 1.4, 48.9), ('moped_onboard', 20.4, 1.4, 81.4), ('moped_onboard', 35.8, 1.4, 124.6)],
    'car':     [('car_octavia', 73.0, 3.2, 22.7), ('car_octavia', 167.0, 2.4, 50.1), ('car_golf', 97.0, 1.4, 112.2)],
    'bus':     [('ural_drive', 6.2, 1.4, 50.2), ('ural_drive', 57.4, 1.4, 101.4), ('ural_drive', 72.6, 1.4, 137.4)],
}
for cls, layers in ENGINES.items():
    for i, (src, t, L, base) in enumerate(layers):
        x = cut(src, t, L + 0.5)
        x = highpass(x, 25)
        lp, corr = seamless(x, L, 0.12)
        lp *= 10 ** ((-18 - rms_db(lp)) / 20)
        key = f'eng_{cls}_{i}'
        extra = {}
        if key in enrich_mod.LAYERS:
            # Intake/cab recordings with nothing a small speaker can play: add harmonics and rattle.
            lp = enrich_mod.enrich(lp[:, 0], base, *enrich_mod.LAYERS[key])[:, None]
            extra['enriched'] = True
        total += loop_asset(key, lp, 80, f0=round(base, 2), **extra)
        report.append(f'{key}: {len(lp)/SR:.2f}s f0={base:.1f} match={corr:.2f}')

# ---- Ambience beds (stereo). ----
AMB = {
    'amb_city': ('amb_mumbai', 275.0, 30),
    'amb_park': ('amb_park', 94.0, 30),
    'amb_night': ('amb_crickets', 10.0, 30),
    'amb_frogs': ('amb_night', 77.0, 24),
    'amb_metro': ('metro_inside', 140.0, 26),
}
for key, (src, t, L) in AMB.items():
    x = cut(src, t, L + 2.5, stereo=True)
    x = highpass(x, 30)
    lp, corr = seamless(x, L, 2.0)
    lp *= 10 ** ((-22 - rms_db(lp)) / 20)
    total += loop_asset(key, lp, 96)
    report.append(f'{key}: {len(lp)/SR:.2f}s match={corr:.2f}')
for key, src, L in [('rain_light', 'rain_loop', 30.0), ('rain_heavy', 'rain_hard', 19.7)]:
    x = load(src, True)
    # Designed as loops already: crossfade the last 1.5 s into the start anyway for safety.
    lp, corr = seamless(x, len(x) / SR - 1.6, 1.5)
    lp *= 10 ** ((-22 - rms_db(lp)) / 20)
    total += loop_asset(key, lp, 96)
    report.append(f'{key}: {len(lp)/SR:.2f}s match={corr:.2f}')

# ---- Siren (loops of whole wail cycles) ----
for key, src, a, b in [('siren_near', 'siren_close', 1.40, 7.45), ('siren_far', 'siren_far', 3.95, 9.30)]:
    x = cut(src, a, b - a + 0.3)
    lp, corr = seamless(x, b - a, 0.03)
    lp *= 10 ** ((-16 - rms_db(lp)) / 20)
    total += loop_asset(key, lp, 80)
    report.append(f'{key}: {len(lp)/SR:.2f}s match={corr:.2f}')

# ---- Tyre screech (loop, faded in by slip) ----
x = highpass(cut('skid_circles', 7.0, 3.6), 120)
lp, corr = seamless(x, 3.0, 0.3)
lp *= 10 ** ((-16 - rms_db(lp)) / 20)
total += loop_asset('skid', lp, 72)
report.append(f'skid: {len(lp)/SR:.2f}s match={corr:.2f}')

# ---- Horns: attack + a sustain region that can loop while the horn is held. ----
HORNS = {
    'horn_small': ('horn_kodiak', 6.40, 0.90, 400, 500),   # scooter / bike / auto
    'horn_car':   ('horn_mini', 0.78, 0.66, 300, 500),
    'horn_car2':  ('horn_fiat', 0.00, 0.76, 300, 500),
    'horn_low':   ('horn_toyota', 2.16, 0.86, 120, 250),   # SUVs, tempos
    'horn_truck': ('horn_ram', 10.30, 1.96, 150, 600),
    'horn_bus':   ('horn_coach', 59.88, 1.02, 100, 250),
    'horn_air':   ('ural_horn', 7.70, 3.20, 100, 1000),
    'horn_train': ('amb_station', 60.05, 4.2, 150, 600),
}
for key, (src, t, dur, lo, hi) in HORNS.items():
    x = highpass(cut(src, t, dur), 60)
    x = fade(x, 0.004, 0.06)
    x *= 10 ** ((-1 - peak_db(x)) / 20)
    n = len(x) / SR
    # Sustain: the steadiest stretch in the middle.
    sus = [round(min(0.12, n * 0.3), 3), round(n - max(0.1, n * 0.2), 3)]
    pitch = f0(x[int(sus[0] * SR):int(sus[1] * SR)], lo, hi)
    total += shot_asset(key, x, 80, sustain=sus, f0=round(pitch, 1))
    report.append(f'{key}: {n:.2f}s f0={pitch:.1f} sustain={sus}')

# ---- One-shots ----
SHOTS = {
    'punch_0': ('punch1', 0, 0.5), 'punch_1': ('punch2', 0, 0.55), 'punch_2': ('punch3', 0, 0.5),
    'punch_3': ('punch4', 0.04, 0.5), 'punch_4': ('punch5', 0.08, 0.6),
    'gun_revolver': ('gun_revolver', 0, 2.2), 'gun_katta': ('gun_flintlock', 0.3, 2.2),
    'gun_far': ('gun_warehouse', 6.8, 2.0), 'gun_click': ('gun_dry', 2.2, 0.25),
    'crash_0': ('crash_drop', 0, 2.2), 'crash_1': ('crash_plates', 0, 1.7), 'crash_2': ('crash_chassis', 2.9, 2.2),
    'crash_3': ('crash_chassis', 11.3, 2.0), 'metal_0': ('crash_metal1', 0.25, 1.0), 'metal_1': ('crash_metal2', 0, 0.8),
    'glass_0': ('glass1', 0, 1.0), 'glass_1': ('glass2', 0, 0.64),
    'explosion_0': ('explosion1', 0, 4.0), 'explosion_1': ('explosion2', 0, 2.6),
    'door_open': ('door_opel', 0.72, 0.5), 'door_close': ('door_opel', 2.32, 0.6), 'door_slam': ('door_car', 1.80, 0.9),
    'splash': ('splash1', 0, 1.2),
    'moo_0': ('cow', 3.3, 3.0), 'moo_1': ('cow', 14.62, 2.6), 'moo_2': ('cow', 37.55, 2.2),
    'whoosh_0': ('whoosh1', 0.36, 0.5), 'whoosh_1': ('whoosh2', 0.04, 0.4), 'whoosh_2': ('whoosh2', 6.04, 0.4),
    'metro_chime': ('train_door', 6.9, 3.6),
    'thunder_far': ('thunder_far', 0.5, 14.0), 'thunder_near': ('thunder_close', 1.0, 9.0),
}
for i, t in enumerate([0.30, 0.62, 0.94, 1.24, 1.56, 2.82]):
    SHOTS[f'step_{i}'] = ('steps_asphalt', t, 0.2)
for key, (src, t, dur) in SHOTS.items():
    x = highpass(cut(src, t, dur), 40)
    x = fade(x, 0.002, min(0.25, dur * 0.3))
    x *= 10 ** ((-1 - peak_db(x)) / 20)
    total += shot_asset(key, x, 96 if key.startswith(('thunder', 'explosion')) else 72)
    report.append(f'{key}: {len(x)/SR:.2f}s')

json.dump(bank, open(os.path.join(OUT, 'soundBank.json'), 'w'), indent=1)
print('\n'.join(report))
print(f'TOTAL {total/1e6:.2f} MB in {len(bank)} files')
