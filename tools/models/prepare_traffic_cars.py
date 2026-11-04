#!/usr/bin/env python3
"""Pack the "Bus Simulator India - Traffic Cars" glTF (Sketchfab, CC-BY-4.0, see MODEL_CREDITS.md)
into one GLB for the game.

Textures are halved (a 2048 atlas becomes 1024, and so on) and every set of textures that the same
vehicles use together (the cars share their lamps and wheels, a bus has body, parts and lamps) is
packed into one atlas, so each vehicle can be drawn as one mesh with one material, like the game's
own. Each material records where its texture went (`extras.atlas` = atlas image, `extras.rect` =
[x, y, w, h] as fractions of the atlas, y down like glTF UVs); src/entities/packVehicles.js remaps
the UVs. A small white patch in each atlas is for parts that have only a colour (glass).

    python3 tools/models/prepare_traffic_cars.py <unzipped folder with scene.gltf> public/models/traffic-cars.glb
"""
import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image



def vehicles(g):
    nodes = g['nodes']
    root = next(i for i, n in enumerate(nodes) if n.get('name') == 'IN_TRAFFIC_CARS')

    def images_under(i, out):
        n = nodes[i]
        if 'mesh' in n:
            for p in g['meshes'][n['mesh']]['primitives']:
                t = g['materials'][p.get('material', 0)].get('pbrMetallicRoughness', {}).get('baseColorTexture')
                if t:
                    out.add(g['textures'][t['index']]['source'])
        for c in n.get('children', []):
            images_under(c, out)
        return out

    return [images_under(v, set()) for v in nodes[root]['children']]


def groups(sets):
    # Images used together by any vehicle end up in the same atlas.
    out = []
    for s in sets:
        s = set(s)
        for o in [o for o in out if o & s]:
            s |= o
            out.remove(o)
        out.append(s)
    return out


def pack(sizes):
    # Shelf packing, biggest first, into a strip twice as wide as the largest image if there are
    # two that big (no padding: the UVs are pulled half a texel inside each image instead).
    order = sorted(sizes, key=lambda k: (-sizes[k][1], -sizes[k][0]))
    big = max(w for w, _ in sizes.values())
    W = big * (2 if sum(1 for w, _ in sizes.values() if w == big) > 1 else 1)
    x = y = shelf = 0
    at = {}
    for k in order:
        w, h = sizes[k]
        if x + w > W:
            x, y, shelf = 0, y + shelf, 0
        at[k] = (x, y)
        x += w
        shelf = max(shelf, h)
    return W, y + shelf, at


def main(src, out):
    src = Path(src)
    g = json.loads((src / 'scene.gltf').read_text())
    bin_data = bytearray((src / g['buffers'][0]['uri']).read_bytes())
    ims = []
    for img in g['images']:
        im = Image.open(src / img['uri']).convert('RGB')
        ims.append(im.resize((max(64, im.width // 2), max(64, im.height // 2)), Image.LANCZOS))
    atlases, where = [], {}
    for s in groups(vehicles(g)):
        sizes = {k: ims[k].size for k in s}
        sizes['white'] = (16, 16)
        W, H, at = pack(sizes)
        sheet = Image.new('RGB', (W, H), (128, 128, 128))
        for k, (x, y) in at.items():
            if k == 'white':
                sheet.paste((255, 255, 255), (x, y, x + 16, y + 16))
            else:
                sheet.paste(ims[k], (x, y))
                where[k] = (len(atlases), x, y)
        atlases.append((sheet, at['white']))
    # Materials: point at their atlas and say where their texture sits in it.
    for m in g['materials']:
        pbr = m.setdefault('pbrMetallicRoughness', {})
        t = pbr.get('baseColorTexture')
        if t:
            a, x, y = where[g['textures'][t['index']]['source']]
            w, h = ims[g['textures'][t['index']]['source']].size
        else:
            # Colour only: owned by the first atlas any vehicle with it uses (fixed up at load), white patch.
            a, (x, y), w, h = 0, atlases[0][1], 16, 16
            m.setdefault('extras', {})['plain'] = True
        W, H = atlases[a][0].size
        m.setdefault('extras', {}).update({'atlas': a, 'rect': [x / W, y / H, w / W, h / H]})
        pbr['baseColorTexture'] = {'index': a}
    # Where each atlas's white patch is (centre, as fractions), for the colour-only parts.
    g.setdefault('extras', {})['whites'] = [[(wx + 8) / s.width, (wy + 8) / s.height] for s, (wx, wy) in atlases]
    g['images'], g['textures'] = [], []
    for sheet, _ in atlases:
        buf = io.BytesIO()
        sheet.save(buf, 'JPEG', quality=86, optimize=True)
        while len(bin_data) % 4:
            bin_data.append(0)
        g['bufferViews'].append({'buffer': 0, 'byteOffset': len(bin_data), 'byteLength': len(buf.getvalue())})
        bin_data += buf.getvalue()
        g['images'].append({'bufferView': len(g['bufferViews']) - 1, 'mimeType': 'image/jpeg'})
        g['textures'].append({'source': len(g['images']) - 1, 'sampler': 0})
    g['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]
    while len(bin_data) % 4:
        bin_data.append(0)
    g['buffers'] = [{'byteLength': len(bin_data)}]
    js = json.dumps(g, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_data))
    glb += struct.pack('<II', len(js), 0x4E4F534A) + js
    glb += struct.pack('<II', len(bin_data), 0x004E4942) + bytes(bin_data)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_bytes(glb)
    print(f'{out}: {len(glb) / 1e6:.1f} MB, {len(atlases)} atlases: ' + ', '.join(f'{s.width}x{s.height}' for s, _ in atlases))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
