# Streams a .unitypackage from Google Drive (it's a gzipped tar) and lists its assets with sizes,
# without saving the package: usage pkglist.py <drive id> <out.json>
import json, subprocess, sys, tarfile
fid, out = sys.argv[1], sys.argv[2]
p = subprocess.Popen(["curl", "-sSL", f"https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t"], stdout=subprocess.PIPE)
paths, sizes = {}, {}
with tarfile.open(fileobj=p.stdout, mode="r|gz") as t:
    for m in t:
        d, _, leaf = m.name.partition("/")
        if leaf == "pathname": paths[d] = t.extractfile(m).read().decode("utf-8", "replace").splitlines()[0]
        elif leaf == "asset": sizes[d] = m.size
res = sorted(((paths.get(d, "?"), sizes.get(d, 0), d) for d in paths), key=lambda x: x[0])
json.dump(res, open(out, "w"), indent=0)
print(len(res), "assets,", round(sum(s for _, s, _ in res) / 1e6), "MB")
