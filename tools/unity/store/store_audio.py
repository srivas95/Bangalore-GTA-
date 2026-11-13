# Turns the picked Asset Store recordings into game sound-bank entries:
#   unity/NammaBengaluru/Assets/StoreAssets/Resources/StoreAudio/<key>.ogg + bank.json
# (StoreAssets is gitignored: these go into builds only). Every clip is matched in loudness to the
# game's own clip it replaces, or to the clips of the pool it joins, so the mix stays balanced.
import json, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get("STORE_RAW", os.path.join(HERE, "raw"))  # the extracted recordings (pkgget.py)
GAME = os.path.join(HERE, "../../../unity/NammaBengaluru/Assets")
OUT = os.path.join(GAME, "StoreAssets/Resources/StoreAudio")
os.makedirs(OUT, exist_ok=True)
BANK = json.load(open(os.path.join(GAME, "Resources/Data/soundBank.json")))
SR = 44100

def decode(path, ch):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", str(ch), "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).copy()

def encode(x, key):
    ch = x.shape[1]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", str(ch), "-ar", str(SR), "-i", "-", "-c:a", "libvorbis", "-q:a", "5", os.path.join(OUT, key + ".ogg")],
                   input=np.ascontiguousarray(x, dtype=np.float32).tobytes(), check=True)

def active_rms(x):
    m = x.mean(axis=1)
    n = int(SR * 0.05)
    frames = m[: len(m) // n * n].reshape(-1, n) if len(m) >= n else m.reshape(1, -1)
    r = np.sqrt((frames ** 2).mean(axis=1) + 1e-12)
    loud = r[r > r.max() * 0.1]
    return float(np.sqrt((loud ** 2).mean())) if len(loud) else float(r.max())

_ref = {}
def ref_rms(keys):
    vals = []
    for k in keys:
        if k not in _ref:
            f = os.path.join(GAME, "Resources/Audio", BANK[k]["file"] + ".mp3")
            _ref[k] = active_rms(decode(f, 1)) if os.path.exists(f) else None
        if _ref[k]: vals.append(_ref[k])
    return float(np.median(vals)) if vals else None

def match(x, keys):
    r = ref_rms(keys)
    if r: x = x * (r / max(active_rms(x), 1e-6))
    peak = np.abs(x).max()
    return x * (0.95 / peak) if peak > 0.95 else x

def trim(x, db=-45, cap=None, fade=0.03):
    m = np.abs(x).max(axis=1)
    thr = m.max() * 10 ** (db / 20)
    idx = np.where(m > thr)[0]
    if len(idx): x = x[max(0, idx[0] - int(0.005 * SR)): idx[-1] + int(0.05 * SR)]
    if cap: x = x[: int(cap * SR)]
    f = min(len(x), int(fade * SR))
    x[-f:] *= np.linspace(1, 0, f)[:, None]
    return x

def seamless(x, start, length, xfade=2.0):
    a, L, X = int(start * SR), int(length * SR), int(xfade * SR)
    seg = x[a: a + L + X]
    if len(seg) < L + X:  # short recording: use what there is
        L = len(seg) - X
    y = seg[:L].copy()
    t = np.linspace(0, np.pi / 2, X)[:, None]
    y[:X] = seg[:X] * np.sin(t) + seg[L: L + X] * np.cos(t)
    return y, L / SR

def f0_of(x, lo, hi):
    m = x.mean(axis=1)[: SR * 4]
    m = m - m.mean()
    ac = np.correlate(m, m, mode="full")[len(m) - 1:]
    a, b = int(SR / hi), int(SR / lo)
    lag = a + int(np.argmax(ac[a:b]))
    return SR / lag

bank, report = {}, []
def add(key, x, entry_extra=None, like=None):
    encode(x, key)
    e = {"file": key, "store": True}
    if entry_extra: e.update(entry_extra)
    if like and "g" in BANK.get(like, {}): e["g"] = BANK[like]["g"]
    bank[key] = e
    report.append(f"{key:22} {len(x) / SR:6.2f}s {json.dumps(entry_extra or {})}")

def next_keys(prefix, n):
    used = {int(k.rsplit("_", 1)[1]) for k in BANK if k.startswith(prefix + "_") and k.rsplit("_", 1)[1].isdigit()}
    k, out = 0, []
    while len(out) < n:
        if k not in used: out.append(f"{prefix}_{k}")
        k += 1
    return out

def group(prefix): return [k for k in BANK if k.startswith(prefix + "_") and k.rsplit("_", 1)[1].isdigit()]

# ---- ambience beds (seamless 45 s stereo loops) ----
BEDS = [
    ("amb_city", "AMBUrbn_InsJ_Ambience_Busy-Street_Guildford_01-01_LOOP.wav", 4),
    ("amb_traffic", "Ambience_BRT_Morning_C01_Town_LOOP.wav", 2),
    ("rain_city", "City Ambience - Traffic - Street - Cars drive by on a rainy street.wav", 2),
    ("amb_walla_0", "Crowd - Mall ambience.wav", 20),
    ("amb_park", "AMBBird_InsJ_Ambience_Birds_Dawn-Chorus_01-01_LOOP.wav", 2),
    ("amb_night", "ANMLInsc_InsJ_Ambience_Cricket-Insect_06-01_LOOP.wav", 1),
    ("amb_metro", "Ambience_London-Waterloo_Train-Station_01_LOOP.wav", 5),
    ("rain_light", "RAIN_InsJ_Ambience_Rain_Light_01_LOOP.wav", 2),
    ("rain_heavy", "Ambience_Rain_Moderate_01_LOOP.wav", 2),
    ("rain_storm", "Rain - Falling on a metal roof.wav", 5),
]
for key, src, start in BEDS:
    x = decode(os.path.join(RAW, src), 2)
    y, L = seamless(x, start, 45)
    add(key, match(y, [key]), {"loop": [0.0, round(L, 4)]})

# ---- thunder ----
for key, src, cap in [("thunder_near", "Thunder_Very-Close_01.wav", 12), ("thunder_near_b", "THUN_InsJ_Thunder_Close_Rain_01.wav", 14),
                      ("thunder_far", "Rain - Distant thunder.wav", 14), ("thunder_far_b", "Thunder - Lightning - II - Without rain, wind, background noise.wav", 14)]:
    x = trim(decode(os.path.join(RAW, src), 2), cap=cap, fade=1.5)
    add(key, match(x, [key]))

# ---- car engine layers (idle, ~1000 rpm, ~2000 rpm) with their firing frequency ----
for key, src, lo, hi in [("eng_car_0", "nox/Vehicle_Car_Engine_Idle_Exterior_Loop_01.wav", 18, 45), ("eng_car_1", "nox/Vehicle_Car_Engine_1000_RPM_Front_Exterior_Loop.wav", 25, 60),
                         ("eng_car_2", "nox/Vehicle_Car_Engine_2000_RPM_Front_Exterior_Loop.wav", 45, 110)]:
    x = decode(os.path.join(RAW, src), 1)
    y, L = seamless(x, 0.5, 4.0, xfade=0.3)
    add(key, match(y, [key]), {"loop": [0.0, round(L, 4)], "f0": round(f0_of(y, lo, hi), 1)})

# ---- car horn: attack, then a sustain region the game repeats while the horn is held ----
x = trim(decode(os.path.join(RAW, "nox/Vehicle_Car_Horn_Exterior.wav"), 1), db=-35, cap=2.0)
w = int(0.01 * SR)
env = np.sqrt(np.convolve(x[:, 0] ** 2, np.ones(w) / w, mode="same"))
on = np.where(env > env.max() * 0.5)[0]
s0, s1 = on[0] / SR + 0.02, on[-1] / SR - 0.02
seg = x[int(s0 * SR): int(s1 * SR)]
spec = np.abs(np.fft.rfft(seg[:, 0] * np.hanning(len(seg))))
freqs = np.fft.rfftfreq(len(seg), 1 / SR)
band = (freqs > 250) & (freqs < 900)
add("horn_car", match(x, ["horn_car"]), {"sustain": [round(s0, 3), round(s1, 3)], "f0": round(float(freqs[band][np.argmax(spec[band])]), 1)})

# ---- doors ----
for key, src in [("door_open", "nox/Vehicle_Car_Door_Opening_Exterior_01.wav"), ("door_close", "nox/Vehicle_Car_Door_Closing_Exterior_01.wav"),
                 ("door_open_b", "nox/Vehicle_Van_Door_Opening_Exterior_01.wav"), ("door_close_b", "nox/Vehicle_Van_Door_Closing_Exterior_01.wav"),
                 ("door_slam", "nox/Vehicle_Car_Door_Closing_Exterior_03.wav")]:
    add(key, match(trim(decode(os.path.join(RAW, src), 1), cap=2.5), [key]))

# ---- new variants joining the game's pools ----
def pool(prefix, srcs, cap):
    keys = next_keys(prefix, len(srcs))
    ref = group(prefix)
    for key, src in zip(keys, srcs):
        add(key, match(trim(decode(os.path.join(RAW, src), 1), cap=cap), ref), like=ref[0] if ref else None)

nox = sorted(os.listdir(os.path.join(RAW, "nox")))
def nx(pattern, n):
    import re
    l = [f"nox/{f}" for f in nox if re.search(pattern, f)]
    step = max(1, len(l) // n)
    return l[::step][:n]

pool("vo_hit_m", nx(r"Male_V\d_Hit_Short_Mono", 10), 1.5)
pool("vo_hit_f", nx(r"Female_V\d_Hit_Short_Mono", 10), 1.5)
pool("vo_effort_m", nx(r"Male_V\d_(Effort|Attack_Short)_Mono", 10), 1.5)
pool("vo_effort_f", nx(r"Female_V\d_(Effort|Attack)_Mono", 10), 1.5)
pool("vo_gasp_m", nx(r"Male_V\d_Breath_Gasp_Mono", 6), 2.0)
pool("vo_death_m", nx(r"Male_V\d_Pain_Mono", 5), 3.0)
pool("vo_death_f", nx(r"Female_V\d_Pain_Mono", 5), 3.0)
pool("punch", ["Bloody punch.wav", "Indiana Jones Punch.wav"], 1.0)
pool("crash", ["Heavy Object Impact 10.wav", "Heavy Object Impact 4.wav", "CERMImpt_InsJ_Bricks_Impact_Single_01-02.wav"], 3.0)
pool("metal", ["Metal Impact 7.wav", "Metal impact 5.wav", "CHAINImpt_InsJ_Chains_Metal_Dropping_Close_01-01.wav", "Bullet Impact 14.wav", "Bullet Impact 21.wav"], 2.0)
pool("glass", ["Smashing_Glass_Bottle_01.wav", "GLASCrsh_InsJ_Glass_Shards_Dropping_Close_01-01.wav"], 2.5)
pool("explosion", ["Explosion 1.wav", "Explosion 2.wav", "Explosion 8.wav"], 6.0)
pool("step", ["Footsteps_Concrete_Single_03.wav", "Footsteps_Stone_Single_15.wav", "FEETHmn_InsJ_Footsteps_Ceramic_Jogging_Trainers_01-01_Single-01.wav", "FEETHmn_InsJ_Footsteps_Gravel_Jogging_Trainers_01-01_Single-02.wav"], 0.6)

# ---- guns (the game's two pistols and the distant report) ----
for key, src in [("gun_revolver", "Hand Gun 1.wav"), ("gun_katta", "Hand Gun 3.wav"), ("gun_far", "Hand Gun_6.wav")]:
    add(key, match(trim(decode(os.path.join(RAW, src), 1), cap=2.5), [key]))

json.dump(bank, open(os.path.join(OUT, "bank.json"), "w"), indent=1)
print("\n".join(report))
print(len(bank), "entries")
