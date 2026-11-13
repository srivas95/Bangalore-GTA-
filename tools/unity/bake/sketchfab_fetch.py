# Downloads the Sketchfab models listed in a picks file (sketchfab_vehicles.json, ...) as GLB into
# tools/unity/bake/sketchfab_cache/ (gitignored: the bake reads them from there). Each model's
# licence is re-read from the model itself; anything other than CC0 or CC BY is skipped.
# Needs a Sketchfab API token, sent as "Authorization: Token <token>" (in this repo's cloud
# sessions a network proxy adds it; elsewhere set SKETCHFAB_TOKEN).
# usage: python3 tools/unity/bake/sketchfab_fetch.py tools/unity/bake/sketchfab_vehicles.json
import json, os, subprocess, sys, time

ALLOWED = {"cc0", "by"}
here = os.path.dirname(os.path.abspath(__file__))
cache = os.path.join(here, "sketchfab_cache")
os.makedirs(cache, exist_ok=True)
token = os.environ.get("SKETCHFAB_TOKEN")

def curl(url, out=None, auth=True):
    args = ["curl", "-sS", "--fail", "--max-time", "300", "-L"]
    if auth and token: args += ["-H", f"Authorization: Token {token}"]
    if out: args += ["-o", out]
    r = subprocess.run(args + [url], capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr.strip())
    return r.stdout

picks_path = sys.argv[1]
picks = json.load(open(picks_path))
for m in picks:
    f = os.path.join(cache, m["uid"] + ".glb")
    info = json.loads(curl(f"https://api.sketchfab.com/v3/models/{m['uid']}"))
    lic = (info.get("license") or {}).get("slug")
    m["license"] = (info.get("license") or {}).get("label", m.get("license"))
    m["licenseSlug"] = lic
    if lic not in ALLOWED:
        print("skip (licence %s): %s" % (lic, m["name"])); m["skip"] = True; continue
    m.pop("skip", None)
    if os.path.exists(f): continue
    # The download endpoint is rate-limited (HTTP 429): pace the requests and back off.
    for attempt in range(8):
        try:
            dl = json.loads(curl(f"https://api.sketchfab.com/v3/models/{m['uid']}/download"))
            curl(dl["glb"]["url"], out=f, auth=False)  # (a signed storage link: no token)
            print("ok %6.1f MB  %s" % (os.path.getsize(f) / 1e6, m["name"]), flush=True)
            break
        except Exception as e:
            if "429" not in str(e) or attempt == 7:
                print("FAILED", m["name"], e, flush=True); break
            time.sleep(60 * (attempt + 1))
    time.sleep(8)
json.dump(picks, open(picks_path, "w"), indent=1, ensure_ascii=False)
