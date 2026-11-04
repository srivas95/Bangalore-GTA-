// Vehicles from the "Bus Simulator India - Traffic Cars" pack by Villanueva-Jonatan-32621
// (Sketchfab, CC-BY-4.0: see MODEL_CREDITS.md), packed by tools/models/prepare_traffic_cars.py.
// Loaded once at start-up. Each vehicle is baked, like the game's own, into ONE skinned mesh
// (wheels are bones) with one material per texture atlas, in the vehicle frame: facing +z, kerb
// side (left) +x, wheels on y = 0. Every vehicle built from it gets its own copy of the geometry,
// so dents and scorching work as on the procedural models.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DETAIL } from '../world/detail.js';

// Which pack vehicles stand in for which of the game's types, and how often (the rest of the
// time a type gets its own procedural model).
export const PACK_TYPES = {
  IN_Hatchback_01: 'hatch', IN_Hatchback_02: 'hatch', IN_Hatchback_03: 'hatch', IN_Hatchback_04: 'sedan',
  IN_Luxury_01: 'sedan', IN_Luxury_02: 'sedan', IN_Luxury_03: 'sedan', IN_Luxury_04: 'luxury',
  IN_SUV_01: 'suv', IN_SUV_02: 'suv', IN_SUV_03: 'suv', IN_SUV_04: 'suv',
  IN_Rickshaw_01: 'auto', IN_Rickshaw_02: 'auto', IN_Rickshaw_03: 'auto', IN_Rickshaw_04: 'auto',
  IN_Motorbike_01: 'scooter', IN_Motorbike_02: 'bike', IN_Motorbike_03: 'bike', HDR_motorbike_01: 'sportBike',
  IN_Bus_01: 'cityBus', IN_Bus_02: 'cityBus', IN_Bus_03: 'cityBus',
  IN_Truck_01: 'lorry', IN_Truck_02: 'lorry', IN_Truck_03: 'lorry',
  IN_Emergency_01: 'policeVan', IN_Emergency_02: 'ambulance', IN_Emergency_03: 'fireTruck',
  IN_EV_01: 'evMini', IN_EV_02: 'evCar',
};
export const PACK_SHARE = { hatch: 0.45, sedan: 0.45, suv: 0.45, auto: 0.35, scooter: 0.25, bike: 0.35, sportBike: 0.3, lorry: 0.6, ambulance: 0.4 };

const templates = {}; // game type -> [template]
const HIDE = /light_?break|turn_?[lr]\b|turn_[lr]_|legdown|legup/i;
const WHEEL = /wheel|_front(_+[lr](_\d+)?)?$|_rear(_+[lr](_\d+)?)?$|_back(_+[lr])?$/i;

export function packTemplates(type) { return templates[type] || []; }

export async function loadPackVehicles(url = './models/traffic-cars.glb') {
  let gltf;
  try { gltf = await new GLTFLoader().loadAsync(url); } catch (e) { console.warn('Vehicle pack not loaded:', e.message); return 0; }
  const whites = gltf.userData.whites || [];
  const mats = await atlasMaterials(gltf);
  const root = gltf.scene.getObjectByName('IN_TRAFFIC_CARS');
  if (!root) return 0;
  gltf.scene.updateMatrixWorld(true);
  let n = 0;
  for (const veh of root.children) {
    const type = PACK_TYPES[veh.name];
    if (!type) continue;
    const t = bake(veh, mats, whites);
    if (!t) continue;
    t.name = veh.name;
    (templates[type] || (templates[type] = [])).push(t);
    n++;
  }
  return n;
}

// One material per atlas (on phones, the atlases at half size).
async function atlasMaterials(gltf) {
  const out = [];
  for (let i = 0; i < gltf.parser.json.textures.length; i++) {
    let tex = null;
    try { tex = await gltf.parser.getDependency('texture', i); } catch { /* left untextured */ }
    if (tex && DETAIL.lite && tex.image) {
      const c = document.createElement('canvas');
      c.width = Math.max(64, tex.image.width >> 1); c.height = Math.max(64, tex.image.height >> 1);
      c.getContext('2d').drawImage(tex.image, 0, 0, c.width, c.height);
      const t2 = new THREE.CanvasTexture(c);
      t2.flipY = false; t2.colorSpace = THREE.SRGBColorSpace; t2.wrapS = t2.wrapT = THREE.ClampToEdgeWrapping;
      tex.dispose(); tex = t2;
    }
    if (tex) tex.anisotropy = 4;
    out.push(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.5, metalness: 0.15, envMapIntensity: 1.1 }));
  }
  return out;
}

function bake(veh, mats, whites) {
  const parts = [];
  veh.traverse((o) => {
    if (!o.isMesh) return;
    let wheel = null;
    for (let p = o; p && p !== veh; p = p.parent) {
      if (HIDE.test(p.name)) return;
      if (!wheel && !/light/i.test(p.name) && WHEEL.test(p.name)) wheel = p;
    }
    const prims = Array.isArray(o.material) ? null : o.material;
    if (!prims) return;
    parts.push({ o, wheel, mat: o.material });
  });
  if (!parts.length) return null;
  // The vehicle's atlas: the one most of its textured parts use.
  const votes = {};
  for (const p of parts) if (!p.mat.userData.plain) votes[p.mat.userData.atlas] = (votes[p.mat.userData.atlas] || 0) + 1;
  const atlas = +Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
  const geos = [];
  const box = new THREE.Box3();
  for (const p of parts) {
    const g = p.o.geometry.clone();
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.applyMatrix4(p.o.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    // Texture coordinates into the atlas (half a texel in from the edges: no padding there).
    const ud = p.mat.userData, uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2);
    const [rx, ry, rw, rh] = ud.rect || [0, 0, 1, 1], wht = whites[atlas] || [0, 0];
    const eu = 0.5 / 1024, ev = 0.5 / 1024;
    for (let i = 0; i < uv.count; i++) {
      if (ud.plain || ud.atlas !== atlas) { uv.setXY(i, wht[0], wht[1]); continue; }
      const u = Math.min(1 - eu, Math.max(eu, uv.getX(i))), v = Math.min(1 - ev, Math.max(ev, uv.getY(i)));
      uv.setXY(i, rx + u * rw, ry + v * rh);
    }
    g.setAttribute('uv', uv);
    // Base colour (glass and other plain parts are only a colour) as vertex colours, which
    // dents and scorching darken.
    const c = p.mat.color || new THREE.Color(1, 1, 1), col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingBox();
    box.union(g.boundingBox);
    geos.push({ g, wheel: p.wheel });
  }
  // Into the vehicle frame: centred, on the ground, nose towards +z.
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, y0 = box.min.y;
  const hubs = new Map();
  for (const { g, wheel } of geos) {
    if (!wheel) continue;
    const h = hubs.get(wheel) || { box: new THREE.Box3(), front: /front/i.test(wheel.name) };
    h.box.union(g.boundingBox);
    hubs.set(wheel, h);
  }
  const fronts = [...hubs.values()].filter((h) => h.front), rears = [...hubs.values()].filter((h) => !h.front);
  const zOf = (l) => l.reduce((s, h) => s + (h.box.min.z + h.box.max.z) / 2, 0) / l.length;
  const flip = fronts.length && rears.length ? zOf(fronts) < zOf(rears) : false;
  const F = new THREE.Matrix4().makeTranslation(-cx, -y0, -cz);
  if (flip) F.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
  const wheelList = [...hubs.entries()];
  const bonesOf = new Map();
  let bone = 1;
  const wheels = wheelList.map(([node, h]) => {
    const b = h.box.clone().applyMatrix4(F), hub = b.getCenter(new THREE.Vector3());
    const w = { hub, r: Math.max(0.15, (b.max.y - b.min.y) / 2), front: h.front, steerIdx: h.front ? bone++ : -1, spinIdx: bone++ };
    bonesOf.set(node, w.spinIdx);
    return w;
  });
  for (const { g, wheel } of geos) {
    g.applyMatrix4(F);
    const n = g.attributes.position.count, si = new Uint8Array(n * 4), sw = new Float32Array(n * 4);
    const b = wheel ? bonesOf.get(wheel) : 0;
    for (let i = 0; i < n; i++) { si[i * 4] = b; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  const geometry = mergeGeometries(geos.map((x) => x.g));
  for (const x of geos) x.g.dispose();
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const fz = fronts.length ? wheels.filter((w) => w.front).reduce((s, w) => s + w.hub.z, 0) / fronts.length : size.z * 0.3;
  const rz = rears.length ? wheels.filter((w) => !w.front).reduce((s, w) => s + w.hub.z, 0) / rears.length : -size.z * 0.3;
  return { geometry, material: mats[atlas], wheels, length: size.z, width: size.x, height: size.y, wheelbase: Math.max(0.8, fz - rz) };
}

// A vehicle model from a template: the same shape as vehicleModels.js returns.
export function buildPackModel(t, spec) {
  const root = new THREE.Bone();
  const bones = [root];
  const wheels = [];
  for (const w of t.wheels) {
    let parent = root, steer = null;
    if (w.front) {
      steer = new THREE.Bone(); steer.position.copy(w.hub);
      parent.add(steer); bones[w.steerIdx] = steer; parent = steer;
    }
    const spin = new THREE.Bone();
    if (!steer) spin.position.copy(w.hub);
    parent.add(spin); bones[w.spinIdx] = spin;
    wheels.push({ steer, spin, r: w.r });
  }
  for (let i = 0; i < bones.length; i++) if (!bones[i]) bones[i] = new THREE.Bone(); // (never: every index is a wheel)
  // Its own positions and colours (dents and scorching change them); everything else shared, so
  // a hundred of them cost one copy of the normals, texture coordinates and bone weights.
  const geo = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(t.geometry.attributes)) geo.setAttribute(k, k === 'position' || k === 'color' ? a.clone() : a);
  geo.setIndex(t.geometry.index);
  const mesh = new THREE.SkinnedMesh(geo, t.material);
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.geometry.computeBoundingSphere();
  mesh.boundingSphere = mesh.geometry.boundingSphere.clone();
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  group.add(mesh);
  const s = { ...spec, length: +t.length.toFixed(2), width: +t.width.toFixed(2), wheelbase: +t.wheelbase.toFixed(2) };
  const extra = spec.siren || spec.police ? { lightBar: { w: Math.min(0.6, t.width * 0.3), y: t.height + 0.02, z: t.length * 0.12 } } : {};
  return { group, mesh, decalMesh: null, wheels, spec: s, body: group, pack: t.name, ...extra };
}
