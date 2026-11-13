// Records the web game's landmark builders (src/world/landmarks.js) as they run inside the real
// buildCity: each call gets a context whose builders, sign list and colliders are fresh recorders
// (trees and everything else pass through, so the city's RNG runs exactly as in the game), and
// the geometry, collider boxes, signs, tree calls and POI it produced are handed to
// landmarks.mjs. The Unity city replays them at the same call sites.
import * as THREE from 'three';
import * as T from '/src/world/textures.js';
import { Layout } from '/src/world/layout.js';
import { Colliders } from '/src/systems/colliders.js';
import { BuilderSet, frameToWorld } from '/src/world/meshBuilder.js';
import { LANDMARKS } from '/src/world/landmarks.js';
import { buildCity } from '/src/world/city.js';
import { fillPoly } from '/src/world/geom.js';
import { CURB_H } from '/src/config.js';

const FACE_ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
const b64 = (arr) => { const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

window.bake = async () => {
  try {
    await Promise.race([Promise.all(['26px "Noto Sans Kannada"', '40px "Oswald"'].map((f) => document.fonts.load(f, 'ಕನ್ನಡ Aa'))), new Promise((r) => setTimeout(r, 6000))]);
  } catch { /* ignore */ }
  try { await T.loadPhotos(); } catch { /* the photos only tint textures */ }
  const records = [];
  const calls = {};
  for (const key of Object.keys(LANDMARKS)) {
    const f = LANDMARKS[key];
    LANDMARKS[key] = (ctx, ...args) => {
      const B2 = new BuilderSet();
      const rec = { key, call: calls[key] = (calls[key] ?? -1) + 1, args: args.map((a) => (a && a.poly ? { block: a.id } : a)), trees: [], signs: [], cols: [], geo: {} };
      const rectPoly = (r) => [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]];
      const n0 = ctx.colliders.all.length;
      const ctx2 = {
        ...ctx,
        B: B2,
        lawn: (block, color = 0xffffff) => fillPoly(B2.get('grass'), block.innerPoly || rectPoly(block.inner), CURB_H + 0.01, color, (x, z) => [x / 6, -z / 6]),
        plaza: (block, color = 0xffffff) => fillPoly(B2.get('plaza'), block.innerPoly || rectPoly(block.inner), CURB_H + 0.01, color, (x, z) => [x / 5, -z / 5]),
        trees: (...a) => { rec.trees.push(a.map((x) => (x && x.poly ? { block: x.id } : x ?? null))); return ctx.trees(...a); },
        sign: (sg) => {
          const xf = B2.xf;
          const [x, z] = xf ? frameToWorld(xf, sg.x, sg.z) : [sg.x, sg.z];
          rec.signs.push({ ...sg, x, z, rotY: (sg.rotY ?? FACE_ROT[sg.face]) + (xf ? xf.ang : 0) });
        },
        // (Some landmarks push straight into the list, already in world coordinates.)
        signs: { push: (...sgs) => { for (const sg of sgs) rec.signs.push({ ...sg, rotY: sg.rotY ?? FACE_ROT[sg.face] }); } },
        anims: [],
      };
      const poi = f(ctx2, ...args);
      rec.poi = poi ? { name: poi.name, x: poi.x, z: poi.z } : null;
      rec.cols = ctx.colliders.all.slice(n0).map((b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, h: b.h, y0: b.y0, tag: b.tag, rot: b.rot || null }));
      for (const [mk, cb] of B2.map) {
        if (cb.empty) continue;
        rec.geo[mk] = cb.geometries().map((g) => {
          const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, U = g.attributes.uv, n = P.count;
          const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), nor = new Int8Array(n * 3), col = new Uint8Array(n * 3);
          for (let i = 0; i < n; i++) {
            pos[i * 3] = P.getX(i); pos[i * 3 + 1] = P.getY(i); pos[i * 3 + 2] = P.getZ(i);
            nor[i * 3] = Math.round(N.getX(i) * 127); nor[i * 3 + 1] = Math.round(N.getY(i) * 127); nor[i * 3 + 2] = Math.round(N.getZ(i) * 127);
            col[i * 3] = Math.round(C.getX(i) * 255); col[i * 3 + 1] = Math.round(C.getY(i) * 255); col[i * 3 + 2] = Math.round(C.getZ(i) * 255);
            uv[i * 2] = U.getX(i); uv[i * 2 + 1] = U.getY(i);
          }
          const idx = Uint32Array.from(g.index.array);
          return { n, pos: b64(pos), nor: b64(nor), col: b64(col), uv: b64(uv), idx: b64(idx) };
        });
      }
      records.push(rec);
      return poi;
    };
  }
  const scene = new THREE.Scene();
  const layout = new Layout();
  const colliders = new Colliders();
  const renderer = { capabilities: { getMaxAnisotropy: () => 8 }, getPixelRatio: () => 1 };
  buildCity(scene, layout, colliders, renderer);
  return records;
};
window.ready = true;
