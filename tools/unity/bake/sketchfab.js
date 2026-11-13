// Turns Sketchfab vehicles (CC0 / CC BY, downloaded by sketchfab_fetch.py into sketchfab_cache/)
// into templates of the same shape as packVehicles.js bakes from the traffic-cars pack, so
// buildPackModel and the rest of the vehicle bake take them as they are:
//  - oriented in the vehicle frame (nose towards +z, wheels on y = 0, centred) and scaled to the
//    game type's length;
//  - wheels found by shape (round, ground-touching pieces of mesh) and made bones that spin, the
//    front ones also steering; a model whose wheels aren't separate pieces keeps them still;
//  - every texture the model uses packed into one atlas (glTF convention, v down), each part's
//    texture coordinates moved into it; parts whose coordinates tile, and untextured parts, take
//    their colour from the vertex colours instead;
//  - roughness, metalness and glow per vertex (the vehicle shader's "pbr" attribute).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEHICLE_TYPES } from '/src/entities/vehicleModels.js';

// Atlas size: 1024 px, or 2048 for vehicles over 6 m (a bus's livery needs the pixels); each
// texture keeps up to 1024 px.
let ATLAS_MAX = 1024;
const TEX_MAX = 1024;

// Parts of a model, in model space: [{ geo (non-indexed, position/normal/uv/color), mat }].
function collectParts(root) {
  const parts = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    g.applyMatrix4(o.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    const groups = Array.isArray(o.material) && g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
    for (const gr of groups) {
      const sub = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'uv', 'color']) {
        const a = g.attributes[k];
        if (!a) continue;
        const arr = new Float32Array(gr.count * a.itemSize);
        for (let i = 0; i < gr.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(gr.start + i, c); // (handles interleaved and normalised data)
        sub.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
      }
      parts.push({ geo: sub, mat: mats[gr.materialIndex] || mats[0] });
    }
  });
  return parts;
}

const boxOf = (geo) => { geo.computeBoundingBox(); return geo.boundingBox.clone(); };

// Connected pieces of a triangle soup (vertices welded by position): [{ tris: [triangle index], box }].
function islands(geo) {
  const P = geo.attributes.position, n = P.count, tri = n / 3;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const key = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(P.getX(i) * 2000)},${Math.round(P.getY(i) * 2000)},${Math.round(P.getZ(i) * 2000)}`;
    const j = key.get(k);
    if (j === undefined) key.set(k, i); else union(i, j);
  }
  for (let t = 0; t < tri; t++) { union(t * 3, t * 3 + 1); union(t * 3, t * 3 + 2); }
  const byRoot = new Map();
  for (let t = 0; t < tri; t++) {
    const r = find(t * 3);
    let isl = byRoot.get(r);
    if (!isl) byRoot.set(r, (isl = { tris: [], box: new THREE.Box3() }));
    isl.tris.push(t);
    for (let c = 0; c < 3; c++) isl.box.expandByPoint(new THREE.Vector3(P.getX(t * 3 + c), P.getY(t * 3 + c), P.getZ(t * 3 + c)));
  }
  return [...byRoot.values()];
}

// Wheels: round, ground-touching pieces, clustered by hub (a tyre and its rim are often separate
// pieces). Returns [{ box, members: [[part, island]] }].
function findWheels(parts, H, twoWheeler) {
  const cands = [], all = [];
  parts.forEach((p, pi) => {
    for (const isl of islands(p.geo)) {
      const s = isl.box.getSize(new THREE.Vector3());
      all.push({ pi, isl, s });
      const round = Math.abs(s.y - s.z) < 0.22 * Math.max(s.y, s.z);
      const sized = s.y > H * (twoWheeler ? 0.25 : 0.12) && s.y < H * (twoWheeler ? 0.75 : 0.6);
      const thin = s.x < 0.75 * s.y;
      const low = isl.box.min.y < H * 0.08;
      if (round && sized && thin && low) cands.push({ pi, isl, s });
    }
  });
  const wheels = [];
  for (const c of cands.sort((a, b) => b.s.y - a.s.y)) {
    const ctr = c.isl.box.getCenter(new THREE.Vector3());
    const w = wheels.find((q) => q.box.containsPoint(ctr) || q.box.getCenter(new THREE.Vector3()).distanceTo(ctr) < 0.3 * c.s.y);
    if (w) { w.box.union(c.isl.box); w.members.push([c.pi, c.isl]); } else wheels.push({ box: c.isl.box.clone(), members: [[c.pi, c.isl]] });
  }
  // Rims, hubcaps and bolts: smaller pieces sitting inside a wheel.
  for (const a of all) {
    if (wheels.some((w) => w.members.some(([pi, isl]) => isl === a.isl))) continue;
    const ctr = a.isl.box.getCenter(new THREE.Vector3());
    const w = wheels.find((q) => {
      const big = q.box.clone().expandByScalar(0.02);
      return big.containsBox(a.isl.box) && q.box.getCenter(new THREE.Vector3()).distanceTo(ctr) < 0.35 * q.box.getSize(new THREE.Vector3()).y;
    });
    if (w) w.members.push([a.pi, a.isl]);
  }
  // A plausible set: 2 for a two-wheeler, 3+ (an auto) otherwise, and not a whole side of the body.
  if (twoWheeler ? wheels.length !== 2 : wheels.length < 3) return [];
  return wheels;
}

function imageOf(tex) { return tex && tex.image && (tex.image.width || tex.image.videoWidth) ? tex.image : null; }

// Average colour of an image (linear), for parts whose coordinates tile.
function averageColour(img) {
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(d[0] / 255, d[1] / 255, d[2] / 255, THREE.SRGBColorSpace);
}

// Shelf-packs images into one canvas no bigger than ATLAS_MAX; returns { canvas, rects: Map(img -> [x, y, w, h] in 0..1), white: [u, v] }.
function packAtlas(images) {
  for (let scale = 1; scale > 0.05; scale *= 0.8) {
    const items = images.map((img) => {
      const k = Math.min(1, TEX_MAX / Math.max(img.width, img.height)) * scale;
      return { img, w: Math.max(8, Math.round(img.width * k)), h: Math.max(8, Math.round(img.height * k)) };
    }).sort((a, b) => b.h - a.h);
    items.push({ img: null, w: 8, h: 8 }); // white, for untextured parts
    let x = 0, y = 0, rowH = 0, ok = true;
    for (const it of items) {
      if (x + it.w > ATLAS_MAX) { x = 0; y += rowH; rowH = 0; }
      if (y + it.h > ATLAS_MAX) { ok = false; break; }
      it.x = x; it.y = y; x += it.w; rowH = Math.max(rowH, it.h);
    }
    if (!ok) continue;
    const H = Math.min(ATLAS_MAX, 1 << Math.ceil(Math.log2(Math.max(16, y + rowH))));
    const W = Math.min(ATLAS_MAX, 1 << Math.ceil(Math.log2(Math.max(16, Math.max(...items.map((i) => i.x + i.w))))));
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    const rects = new Map();
    let white = [0, 0];
    for (const it of items) {
      if (it.img) { g.drawImage(it.img, it.x, it.y, it.w, it.h); rects.set(it.img, [it.x / W, it.y / H, it.w / W, it.h / H]); }
      else { g.fillStyle = '#fff'; g.fillRect(it.x, it.y, it.w, it.h); white = [(it.x + 4) / W, (it.y + 4) / H]; }
    }
    return { canvas, rects, white, W, H };
  }
  throw new Error('atlas packing failed');
}

// Every texture the parts use into one atlas, and per vertex: colour (material colour, times the
// texture's average where its coordinates tile), atlas coordinates, and roughness / metalness / glow.
export function bakeMaterials(parts) {
  const imgs = [...new Set(parts.map((p) => imageOf(p.mat.map)).filter(Boolean))];
  const uvInRange = (geo) => { const U = geo.attributes.uv; if (!U) return false; for (let i = 0; i < U.count; i++) { const u = U.getX(i), v = U.getY(i); if (u < -0.02 || u > 1.02 || v < -0.02 || v > 1.02) return false; } return true; };
  const atlased = imgs.filter((img) => parts.some((p) => imageOf(p.mat.map) === img && uvInRange(p.geo)));
  const atlas = packAtlas(atlased);
  const avg = new Map();
  for (const p of parts) {
    const g = p.geo, n = g.attributes.position.count, m = p.mat, img = imageOf(m.map);
    const useTex = img && atlas.rects.has(img) && uvInRange(g);
    const base = (m.color ? m.color.clone() : new THREE.Color(1, 1, 1));
    if (img && !useTex) { if (!avg.has(img)) avg.set(img, averageColour(img)); base.multiply(avg.get(img)); }
    // Glass (see-through) is drawn opaque here: darken it so windows read as windows.
    if ((m.transparent && (m.opacity ?? 1) < 0.9) || /glass|window|windshield|windscreen|vidro|cristal/i.test(m.name || '')) base.lerp(new THREE.Color(0.05, 0.07, 0.09), 0.65);
    const VC = g.attributes.color;
    const col = new Float32Array(n * 3), uv = new Float32Array(n * 2), pbr = new Float32Array(n * 3);
    const [rx, ry, rw, rh] = useTex ? atlas.rects.get(img) : [0, 0, 0, 0];
    const eu = 0.5 / atlas.W, ev = 0.5 / atlas.H;
    // Glow only for lamps: an emissive material named like one (some models mark their whole body
    // emissive, which would light the vehicle up white at night).
    const lampName = /light|lamp|blink|indicat|beacon|siren|amber|brake|tail|head|lykta|strlkast/i.test(m.name || '');
    const glow = lampName && m.emissive ? Math.max(m.emissive.r, m.emissive.g, m.emissive.b) * (m.emissiveIntensity ?? 1) : 0;
    for (let i = 0; i < n; i++) {
      const k = VC ? [VC.getX(i), VC.getY(i), VC.getZ(i)] : [1, 1, 1];
      col.set([base.r * k[0], base.g * k[1], base.b * k[2]], i * 3);
      if (useTex) {
        const u = Math.min(1 - eu, Math.max(eu, g.attributes.uv.getX(i))), v = Math.min(1 - ev, Math.max(ev, g.attributes.uv.getY(i)));
        uv.set([rx + u * rw, ry + v * rh], i * 2);
      } else uv.set(atlas.white, i * 2);
      pbr.set([Math.min(1, Math.max(0.05, m.roughness ?? 0.6)), Math.min(1, m.metalness ?? 0.1), glow > 0.3 ? 0.6 : 0], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('pbr', new THREE.BufferAttribute(pbr, 3));
  }

  return atlas;
}

// One model -> a template for buildPackModel. cfg: { uid, type, yaw (degrees, after the automatic
// turn that lays the length along z), lift }.
export async function bakeVehicle(cfg) {
  const spec = VEHICLE_TYPES[cfg.type];
  const gltf = await new GLTFLoader().loadAsync(`/tools/unity/bake/sketchfab_cache/${cfg.uid}.glb`);
  let parts = collectParts(gltf.scene);
  // Drop display stands and ground planes: flat pieces covering most of the footprint.
  const full = new THREE.Box3(); parts.forEach((p) => full.union(boxOf(p.geo)));
  const fs = full.getSize(new THREE.Vector3());
  parts = parts.filter((p) => { const s = boxOf(p.geo).getSize(new THREE.Vector3()); return !(s.y < 0.01 * Math.max(s.x, s.z) && s.x * s.z > 0.6 * fs.x * fs.z); });
  // Into the vehicle frame: length along z (turned automatically), then the configured turn, scaled to the type's length.
  const box = new THREE.Box3(); parts.forEach((p) => box.union(boxOf(p.geo)));
  let size = box.getSize(new THREE.Vector3());
  const M = new THREE.Matrix4();
  if (size.x > size.z) M.premultiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  if (cfg.yaw) M.premultiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(cfg.yaw)));
  parts.forEach((p) => p.geo.applyMatrix4(M));
  const b2 = new THREE.Box3(); parts.forEach((p) => b2.union(boxOf(p.geo)));
  size = b2.getSize(new THREE.Vector3());
  const s = (cfg.length || spec.length) / size.z;
  const T = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-(b2.min.x + b2.max.x) / 2, -b2.min.y + (cfg.lift || 0), -(b2.min.z + b2.max.z) / 2));
  parts.forEach((p) => { p.geo.applyMatrix4(T); p.geo.computeBoundingBox(); });
  const vb = new THREE.Box3(); parts.forEach((p) => vb.union(p.geo.boundingBox));
  const vs = vb.getSize(new THREE.Vector3());

  ATLAS_MAX = (cfg.length || spec.length) > 6 ? 2048 : 1024;
  const atlas = bakeMaterials(parts);
  ATLAS_MAX = 1024;

  // Wheels -> bones (body 0; front wheels steer then spin; rear wheels spin).
  const wheels = findWheels(parts, vs.y, !!spec.twoWheeler);
  const boneOfTri = parts.map((p) => new Uint8Array(p.geo.attributes.position.count / 3));
  let bone = 1;
  const wl = wheels.map((w) => {
    const hub = w.box.getCenter(new THREE.Vector3());
    const front = hub.z > 0;
    const out = { hub, r: Math.max(0.12, w.box.getSize(new THREE.Vector3()).y / 2), front, steerIdx: front ? bone++ : -1, spinIdx: bone++ };
    for (const [pi, isl] of w.members) for (const t of isl.tris) boneOfTri[pi][t] = out.spinIdx;
    return out;
  });
  for (let pi = 0; pi < parts.length; pi++) {
    const g = parts[pi].geo, n = g.attributes.position.count, si = new Uint8Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = boneOfTri[pi][Math.floor(i / 3)]; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  const geometry = mergeGeometries(parts.map((p) => p.geo));
  geometry.computeBoundingBox();
  const fr = wl.filter((w) => w.front), rr = wl.filter((w) => !w.front);
  const fz = fr.length ? fr.reduce((t, w) => t + w.hub.z, 0) / fr.length : vs.z * 0.3;
  const rz = rr.length ? rr.reduce((t, w) => t + w.hub.z, 0) / rr.length : -vs.z * 0.3;
  return {
    name: 'sf:' + cfg.uid, geometry, material: new THREE.MeshBasicMaterial(), atlas: atlas.canvas,
    wheels: wl, length: vs.z, width: vs.x, height: vs.y, wheelbase: Math.max(0.8, fz - rz),
  };
}

// A review picture of a template: three-quarter view from the front left, wheels tinted red.
// End-on pictures: from the front (+z, left) and from the back (right), to check which way it faces.
export function reviewEnds(t, renderer) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdddddd);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
  const tex = new THREE.CanvasTexture(t.atlas); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  const g = t.geometry.clone(), c = g.attributes.color.clone(), si = g.attributes.skinIndex;
  for (let i = 0; i < c.count; i++) if (si.getX(i) > 0 && t.wheels.find((w) => w.spinIdx === si.getX(i) && w.front)) c.setXYZ(i, 1, 0, 0); // steering wheels red
  g.setAttribute('color', c);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.6 }));
  scene.add(mesh);
  const L = Math.max(t.width, t.height) * 1.6;
  const out = [];
  for (const z of [1, -1]) {
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    cam.position.set(L * 0.35, t.height * 0.6, z * (t.length / 2 + L * 1.4)); cam.lookAt(0, t.height * 0.45, 0);
    renderer.setSize(240, 240); renderer.render(scene, cam);
    out.push(renderer.domElement.toDataURL('image/jpeg', 0.85));
  }
  return out;
}

export function reviewImage(t, renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdddddd);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
  const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(3, 5, 4); scene.add(d);
  const g = t.geometry.clone();
  const c = g.attributes.color.clone(), si = g.attributes.skinIndex;
  for (let i = 0; i < c.count; i++) if (si.getX(i) > 0) c.setXYZ(i, 1, 0, 0);
  g.setAttribute('color', c);
  const tex = new THREE.CanvasTexture(t.atlas); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.6 })));
  // Ground and a "front" arrow (+z).
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x999999 })));
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.05, t.length / 2 + 0.2), 1.2, 0x0044ff, 0.4, 0.3); scene.add(arrow);
  const L = Math.max(t.length, t.height * 1.6);
  const cam = new THREE.PerspectiveCamera(35, 4 / 3, 0.1, 200);
  cam.position.set(L * 1.15, L * 0.55, L * 1.3); cam.lookAt(0, t.height * 0.4, 0);
  renderer.setSize(320, 240);
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL('image/jpeg', 0.85);
}
