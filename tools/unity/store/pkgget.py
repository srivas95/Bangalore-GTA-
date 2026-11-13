# Streams a .unitypackage from Google Drive and saves only the assets whose path ends with one of
# the given names: usage pkgget.py <drive id> <out dir> <name> [<name> ...]
import os, subprocess, sys, tarfile
fid, out, names = sys.argv[1], sys.argv[2], sys.argv[3:]
os.makedirs(out, exist_ok=True)
p = subprocess.Popen(["curl", "-sSL", f"https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t"], stdout=subprocess.PIPE)
pending = {}  # hash dir -> asset bytes (assets can come before their pathname)
paths = {}
def save(d, data):
    name = os.path.basename(paths[d]); open(os.path.join(out, name), "wb").write(data); print("saved", name, len(data))
with tarfile.open(fileobj=p.stdout, mode="r|gz") as t:
    for m in t:
        d, _, leaf = m.name.partition("/")
        if leaf == "pathname":
            path = t.extractfile(m).read().decode("utf-8", "replace").splitlines()[0]
            if any(path.endswith(n) for n in names):
                paths[d] = path
                if d in pending: save(d, pending.pop(d))
        elif leaf == "asset":
            if d in paths: save(d, t.extractfile(m).read())
            elif m.size < 60_000_000: pending[d] = t.extractfile(m).read()  # (its pathname may come next)
            if len(pending) > 40: pending.pop(next(iter(pending)))
