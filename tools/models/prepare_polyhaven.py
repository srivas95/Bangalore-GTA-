#!/usr/bin/env python3
"""Fetch the Poly Haven street props and textures the game uses (all CC0: https://polyhaven.com/license)
and pack them for the browser.

- Props: each prop's 1k glTF; only the colour (diffuse) maps are kept, shrunk to 512 px and packed
  into one atlas, and all props go into one GLB, public/models/street-props.glb. Every material
  records where its map went (`extras.rect`, as in prepare_traffic_cars.py); props.js remaps UVs.
- Textures: the colour map of each, shrunk to 512 px, into public/textures/ph/<name>.jpg. The
  canvas-painted road, footpath and wall textures (src/world/textures.js) are drawn over them.

    python3 tools/models/prepare_polyhaven.py <download cache folder>
"""
import io
import json
import struct
import sys
import urllib.request
from pathlib import Path

from PIL import Image

PROPS = ['painted_wooden_bench', 'plastic_monobloc_chair_01', 'utility_box_01', 'barrel_03', 'old_tyre', 'planter_pot_clay', 'trashbag']
TEXTURES = ['asphalt_02', 'concrete_floor_02', 'concrete_wall_003']
# How each texture is used: (target mean grey, keep colour?). The road photo is drawn as the
# asphalt itself, at the painted asphalt's tone; the others are blended in as an 'overlay', which
# leaves mid-grey (128) unchanged, so only their grain shows.
TONE = {'asphalt_02': (74, True), 'concrete_floor_02': (128, False), 'concrete_wall_003': (128, False)}
API = 'https://api.polyhaven.com/files/'
ROOT = Path(__file__).resolve().parents[2]


def fetch(url, cache):
    p = cache / url.split('/')[-1]
    if not p.exists():
        req = urllib.request.Request(url, headers={'User-Agent': 'namma-bengaluru-asset-script'})
        p.write_bytes(urllib.request.urlopen(req, timeout=120).read())
    return p


def api(name, cache):
    req = urllib.request.Request(API + name, headers={'User-Agent': 'namma-bengaluru-asset-script'})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def pack_props(cache):
    out = {'asset': {'version': '2.0', 'generator': 'prepare_polyhaven.py'}, 'scene': 0, 'scenes': [{'nodes': []}],
           'nodes': [], 'meshes': [], 'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': [], 'images': [], 'textures': [], 'samplers': [{}]}
    blob = bytearray()
    maps = []  # (material index, image)
    for name in PROPS:
        info = api(name, cache)['gltf']['1k']['gltf']
        g = json.loads(fetch(info['url'], cache).read_text())
        for rel, f in info['include'].items():
            fetch(f['url'], cache)
        bins = {b['uri']: (cache / b['uri'].split('/')[-1]).read_bytes() for b in g['buffers']}
        # Copy buffer views (re-based into one blob) and accessors.
        bv0, acc0, mat0, mesh0 = len(out['bufferViews']), len(out['accessors']), len(out['materials']), len(out['meshes'])
        bases = []
        for b in g['buffers']:
            while len(blob) % 4:
                blob.append(0)
            bases.append(len(blob))
            blob += bins[b['uri']]
        for v in g['bufferViews']:
            v = dict(v)
            v['byteOffset'] = v.get('byteOffset', 0) + bases[v.get('buffer', 0)]
            v['buffer'] = 0
            out['bufferViews'].append(v)
        for a in g['accessors']:
            a = dict(a)
            if 'bufferView' in a:
                a['bufferView'] += bv0
            out['accessors'].append(a)
        for m in g['materials']:
            m = {'name': m.get('name', name), 'pbrMetallicRoughness': dict(m.get('pbrMetallicRoughness', {}))}
            t = m['pbrMetallicRoughness'].pop('baseColorTexture', None)
            m['pbrMetallicRoughness'].pop('metallicRoughnessTexture', None)
            if t:
                uri = g['images'][g['textures'][t['index']]['source']]['uri']
                maps.append((len(out['materials']), Image.open(cache / uri.split('/')[-1]).convert('RGB').resize((512, 512), Image.LANCZOS)))
            out['materials'].append(m)
        for mesh in g['meshes']:
            mesh = json.loads(json.dumps(mesh))
            for p in mesh['primitives']:
                p['attributes'] = {k: v + acc0 for k, v in p['attributes'].items() if k in ('POSITION', 'NORMAL', 'TEXCOORD_0')}
                if 'indices' in p:
                    p['indices'] += acc0
                if 'material' in p:
                    p['material'] += mat0
            out['meshes'].append(mesh)
        # One node per prop, holding its meshes with their transforms baked in by the loader.
        node0 = len(out['nodes'])
        children = []
        for n in g['nodes']:
            if 'mesh' not in n:
                continue
            n2 = {k: n[k] for k in ('translation', 'rotation', 'scale', 'matrix') if k in n}
            n2['mesh'] = n['mesh'] + mesh0
            out['nodes'].append(n2)
            children.append(len(out['nodes']) - 1)
        out['nodes'].append({'name': name, 'children': children})
        out['scenes'][0]['nodes'].append(len(out['nodes']) - 1)
    # The atlas: 512 px maps in rows of four.
    cols = 4
    rows = (len(maps) + cols - 1) // cols
    sheet = Image.new('RGB', (512 * cols, 512 * rows), (200, 200, 200))
    W, H = sheet.size
    for k, (mi, im) in enumerate(maps):
        x, y = (k % cols) * 512, (k // cols) * 512
        sheet.paste(im, (x, y))
        out['materials'][mi].setdefault('extras', {})['rect'] = [x / W, y / H, 512 / W, 512 / H]
        out['materials'][mi]['pbrMetallicRoughness']['baseColorTexture'] = {'index': 0}
    buf = io.BytesIO()
    sheet.save(buf, 'JPEG', quality=86, optimize=True)
    while len(blob) % 4:
        blob.append(0)
    out['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(buf.getvalue())})
    blob += buf.getvalue()
    out['images'].append({'bufferView': len(out['bufferViews']) - 1, 'mimeType': 'image/jpeg'})
    out['textures'].append({'source': 0, 'sampler': 0})
    while len(blob) % 4:
        blob.append(0)
    out['buffers'].append({'byteLength': len(blob)})
    js = json.dumps(out, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    glb += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    dest = ROOT / 'public/models/street-props.glb'
    dest.write_bytes(glb)
    print(f'{dest.relative_to(ROOT)}: {len(glb) / 1e6:.1f} MB, {len(PROPS)} props, atlas {W}x{H}')


def tone(im, mean, colour):
    from PIL import ImageEnhance, ImageStat
    if not colour:
        im = im.convert('L').convert('RGB')
    else:
        im = ImageEnhance.Color(im).enhance(0.5)
    m = sum(ImageStat.Stat(im.convert('L')).mean) or 1
    return im.point(lambda v: max(0, min(255, round(v * mean / m))))


def textures(cache):
    dest = ROOT / 'public/textures/ph'
    dest.mkdir(parents=True, exist_ok=True)
    for name in TEXTURES:
        url = api(name, cache)['Diffuse']['1k']['jpg']['url']
        im = Image.open(fetch(url, cache)).convert('RGB').resize((512, 512), Image.LANCZOS)
        im = tone(im, *TONE[name])
        im.save(dest / f'{name}.jpg', 'JPEG', quality=85, optimize=True)
        print(f'public/textures/ph/{name}.jpg')


if __name__ == '__main__':
    cache = Path(sys.argv[1])
    cache.mkdir(parents=True, exist_ok=True)
    pack_props(cache)
    textures(cache)
