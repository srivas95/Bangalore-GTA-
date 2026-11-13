# Downloads Poly Haven (CC0, https://polyhaven.com) PBR texture sets used as the Unity city's
# world-space surface detail: colour, OpenGL normal and roughness at 1K, into
# unity/NammaBengaluru/Assets/Resources/Detail/<set>_{col,nor,rough}.jpg, and writes detail.json
# with each colour map's mean luminance and each roughness map's mean (the shader detail-blends
# around those, so the base textures' tone is kept).
# usage: python3 tools/unity/detail/fetch_detail.py
import io, json, os, subprocess
from PIL import Image
SETS = {  # game set -> Poly Haven asset
    "asphalt": "asphalt_02",           # roads, junctions
    "pavement": "concrete_floor_02",   # footpaths, plazas, kerbs
    "plaster": "painted_plaster_wall", # facades
    "concrete": "concrete_wall_003",   # roofs, parapets
    "grass": "grass_ground",           # lawns, parks
    "soil": "brown_mud_dry",           # bare ground
}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../unity/NammaBengaluru/Assets/Resources/Detail")
os.makedirs(OUT, exist_ok=True)
def get(url): return subprocess.run(["curl", "-sSL", "--fail", "--max-time", "120", url], capture_output=True, check=True).stdout
info = {}
for name, asset in SETS.items():
    files = json.loads(get(f"https://api.polyhaven.com/files/{asset}"))
    maps = {"col": files["Diffuse"]["1k"]["jpg"]["url"], "nor": files["nor_gl"]["1k"]["jpg"]["url"], "rough": files["Rough"]["1k"]["jpg"]["url"]}
    stats = {"asset": asset, "url": f"https://polyhaven.com/a/{asset}"}
    for k, url in maps.items():
        im = Image.open(io.BytesIO(get(url)))
        if k == "rough": im = im.convert("L")
        im.save(os.path.join(OUT, f"{name}_{k}.jpg"), quality=90)
        mean = lambda g: round(sum(g.resize((64, 64)).tobytes()) / 4096 / 255, 4)
        if k == "col": stats["meanLum"] = mean(im.convert("L"))
        if k == "rough": stats["meanRough"] = mean(im)
    info[name] = stats
    print(name, asset, stats)
json.dump(info, open(os.path.join(OUT, "detail.json"), "w"), indent=1)
