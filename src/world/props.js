// Street props from Poly Haven (CC0, see MODEL_CREDITS.md), packed by tools/models/prepare_polyhaven.py:
// benches, plastic monobloc chairs outside shops, roadside utility boxes, barrels and old tyres in
// the industrial areas, clay planters, bags of rubbish at the kerb. The city lays out where they go
// (city.js `streetProps`); each kind is ONE instanced mesh holding only the placements nearest the
// camera, refilled a few times a second, so a city full of them costs a handful of draw calls.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DETAIL } from './detail.js';

export const PROP_KINDS = ['painted_wooden_bench', 'plastic_monobloc_chair_01', 'utility_box_01', 'barrel_03', 'old_tyre', 'planter_pot_clay', 'trashbag'];
const shapes = {}; // kind -> { geometry, material, radius }

export async function loadProps(url = './models/street-props.glb') {
  let gltf;
  try { gltf = await new GLTFLoader().loadAsync(url); } catch (e) { console.warn('Street props not loaded:', e.message); return 0; }
  let tex = null;
  try { tex = await gltf.parser.getDependency('texture', 0); } catch { /* untextured */ }
  if (tex) tex.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.05 });
  gltf.scene.updateMatrixWorld(true);
  for (const kind of PROP_KINDS) {
    const node = gltf.scene.getObjectByName(kind);
    if (!node) continue;
    const geos = [];
    node.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      g.applyMatrix4(o.matrixWorld);
      if (!g.attributes.normal) g.computeVertexNormals();
      const [rx, ry, rw, rh] = o.material.userData.rect || [0, 0, 1, 1], uv = g.attributes.uv;
      if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, rx + Math.min(1, Math.max(0, uv.getX(i))) * rw, ry + Math.min(1, Math.max(0, uv.getY(i))) * rh);
      else g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      geos.push(g);
    });
    if (!geos.length) continue;
    const geometry = mergeGeometries(geos);
    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    geometry.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); // centred, standing on y = 0
    geometry.computeBoundingSphere();
    shapes[kind] = { geometry, material, size: b.getSize(new THREE.Vector3()) };
  }
  return Object.keys(shapes).length;
}

export function propSize(kind) { return shapes[kind]?.size; }

const CELL = 64;

export class PropField {
  // places: [{ k: kind, x, y, z, ry }]
  constructor(scene, places) {
    this.radius = DETAIL.lite ? 70 : 110;
    this.cap = DETAIL.lite ? 16 : 30;
    this.cells = new Map();
    for (const p of places) {
      if (!shapes[p.k]) continue;
      const key = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL);
      let l = this.cells.get(key);
      if (!l) this.cells.set(key, (l = []));
      l.push(p);
    }
    this.meshes = {};
    for (const [kind, s] of Object.entries(shapes)) {
      const m = new THREE.InstancedMesh(s.geometry, s.material, this.cap);
      m.count = 0;
      m.castShadow = !DETAIL.lite;
      m.receiveShadow = true;
      m.frustumCulled = false; // (instances move around the camera)
      m.name = 'props_' + kind;
      scene.add(m);
      this.meshes[kind] = m;
    }
    this.t = 0;
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.one = new THREE.Vector3(1, 1, 1);
    this.pos = new THREE.Vector3();
  }

  update(dt, camera) {
    if (!camera || (this.t -= dt) > 0) return;
    this.t = 0.3;
    const cx = camera.position.x, cz = camera.position.z, R = this.radius;
    for (const m of Object.values(this.meshes)) m.count = 0;
    const c0 = Math.floor((cx - R) / CELL), c1 = Math.floor((cx + R) / CELL), r0 = Math.floor((cz - R) / CELL), r1 = Math.floor((cz + R) / CELL);
    // Nearest cells first, so the cap keeps the closest props.
    const cells = [];
    for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) {
      const l = this.cells.get(i + ',' + j);
      if (l) cells.push([Math.hypot((i + 0.5) * CELL - cx, (j + 0.5) * CELL - cz), l]);
    }
    cells.sort((a, b) => a[0] - b[0]);
    for (const [, l] of cells) {
      for (const p of l) {
        const m = this.meshes[p.k];
        if (m.count >= this.cap || Math.abs(p.x - cx) > R || Math.abs(p.z - cz) > R) continue;
        this.q.setFromAxisAngle(this.up, p.ry);
        this.m4.compose(this.pos.set(p.x, p.y, p.z), this.q, this.one);
        m.setMatrixAt(m.count++, this.m4);
      }
    }
    for (const m of Object.values(this.meshes)) m.instanceMatrix.needsUpdate = true;
  }
}
