# Make low engine recordings audible on small speakers.
#
# Some engine layers were recorded with the microphone at the intake or under the cab: almost all
# their energy is the firing pulse itself (30 Hz for the Ape auto at idle), below anything a phone
# or laptop speaker can play, so on those devices the auto, the buses and lorries, and the idle of
# the car and the Bullet were silent. This adds what the ear expects to hear on top: harmonics of
# the recording's own waveform (a gentle asymmetric soft clip), and a band of mechanical rattle
# gated by the firing envelope so it "putts" in time with the engine. The low end is kept.
#
# Every filter works on the loop as one circular period (FFT), and the rattle noise is generated
# for exactly one period, so a seamless loop stays seamless.
#
#   python3 tools/sounds/enrich.py public/audio src/systems/soundBank.json   (re-runs from the built files)
#
# build_sounds.py calls enrich() on the same layers when the sounds are rebuilt from the originals.
import json, os, subprocess, sys
import numpy as np

SR = 44100
PAD = 0.1

# key: (rattle amount, rattle band Hz, drive, keep of the original low end)
LAYERS = {
    'eng_auto_0': (0.9, (550, 3400), 4.0, 0.55),
    'eng_auto_1': (0.8, (600, 3600), 3.5, 0.55),
    'eng_auto_2': (0.65, (650, 3800), 3.0, 0.6),
    'eng_bus_0': (0.7, (900, 4200), 3.0, 0.6),
    'eng_bus_1': (0.55, (900, 4200), 2.6, 0.65),
    'eng_bus_2': (0.5, (1000, 4500), 2.4, 0.65),
    'eng_car_0': (0.35, (450, 2600), 2.5, 0.65),
    'eng_bike_0': (0.6, (300, 1900), 3.0, 0.6),
}


def _circ(x, gain_fn):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * gain_fn(f), len(x))


def _band(f, lo, hi, order=2):
    hp = (f / lo) ** (2 * order)
    return np.sqrt(hp / (1 + hp) / (1 + (f / hi) ** (2 * order)))


def _rms(a):
    return np.sqrt(np.mean(a ** 2)) + 1e-12


def enrich(x, f0, rattle, band, drive, keep, seed=1):
    """x: one period of a seamless mono loop (float array). Returns the enriched period."""
    x = np.asarray(x, dtype=np.float64)
    base = x / (np.max(np.abs(x)) + 1e-9)
    # The firing envelope: the low band, rectified and smoothed to a few times the firing rate.
    low = _circ(base, lambda f: 1 / (1 + (f / (f0 * 3.5)) ** 4))
    env = np.maximum(_circ(np.abs(low), lambda f: 1 / (1 + (f / (f0 * 4)) ** 4)), 0)
    env = (env / (env.max() + 1e-9)) ** 1.5
    noise = _circ(np.random.default_rng(seed).standard_normal(len(x)), lambda f: _band(f, *band))
    rattle_sig = noise / _rms(noise) * env
    # Harmonics from the recording's own waveform.
    b = 0.25
    harm = np.tanh(drive * (base + b)) - np.tanh(drive * b)
    harm = _circ(harm, lambda f: _band(f, 90, 5000, 1))
    mid = harm / _rms(harm) + rattle_sig / _rms(rattle_sig) * rattle
    mid = _circ(mid, lambda f: _band(f, 110, 6500, 1))
    y = base / _rms(base) * keep + mid / _rms(mid) * (1 - keep * 0.5)
    y *= 10 ** (-18 / 20) / _rms(y)  # same loudness as the other layers (-18 dB RMS)
    peak = np.max(np.abs(y))
    if peak > 0.89:
        y *= 0.89 / peak
    return y.astype(np.float32)


def audible_db(x):
    X = np.abs(np.fft.rfft(x)) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return 10 * np.log10(X[f >= 300].sum() / X.sum() * np.mean(x ** 2) + 1e-12)


def _decode(path):
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(pcm, dtype=np.float32)


def _encode(path, x, kbps=80):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', path], input=np.clip(x, -1, 1).astype(np.float32).tobytes(), check=True)


def main(audio_dir, bank_path):
    bank = json.load(open(bank_path))
    p = int(PAD * SR)
    for key, (rattle, band, drive, keep) in LAYERS.items():
        info = bank[key]
        if info.get('enriched'):
            print(f'{key}: already enriched')
            continue
        n = int(round((info['loop'][1] - info['loop'][0]) * SR))
        path = os.path.join(audio_dir, key + '.mp3')
        data = _decode(path)
        period = data[p:p + n]
        before = audible_db(period)
        y = enrich(period, info['f0'], rattle, band, drive, keep)
        _encode(path, np.concatenate([y[-p:], y, y[:p]]))
        info['loop'] = [PAD, round(PAD + n / SR, 6)]
        info['enriched'] = True
        print(f'{key}: audible (>300 Hz) {before:6.1f} dB -> {audible_db(y):6.1f} dB')
    with open(bank_path, 'w') as fh:
        fh.write('{\n' + ',\n'.join(f' {json.dumps(k)}: {json.dumps(v, separators=(",", ":"))}' for k, v in bank.items()) + '\n}\n')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
