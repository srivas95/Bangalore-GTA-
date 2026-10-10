// Accumulates triangles (with world-unit UVs and vertex colours) so a whole city
// can be drawn with a handful of draw calls.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const _m3 = new THREE.Matrix3();

export class MeshBuilder {
  // opts.pbr: store per-vertex [roughness, metalness, emissive] (see makePbrMaterial).
  // opts.skin: store a rigid bone index per vertex for SkinnedMesh rigs.
  constructor(opts = {}) {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.usePbr = !!opts.pbr;
    this.useSkin = !!opts.skin;
    this.pbrArr = [];
    this.boneArr = [];
    this.pbr = [0.6, 0, 0];
    this.bone = 0;
  }

  get empty() {
    return this.pos.length === 0;
  }

  _vert(p, n, u, v, c) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    if (this.usePbr) this.pbrArr.push(this.pbr[0], this.pbr[1], this.pbr[2]);
    if (this.useSkin) this.boneArr.push(this.bone);
  }

  // a,b,c,d counter-clockwise when viewed from the front. uv = [u0, v0, u1, v1].
  quad(a, b, c, d, n, uv, color) {
    const col = color instanceof THREE.Color ? color : _c.set(color ?? 0xffffff);
    const [u0, v0, u1, v1] = uv;
    this._vert(a, n, u0, v0, col);
    this._vert(b, n, u1, v0, col);
    this._vert(c, n, u1, v1, col);
    this._vert(a, n, u0, v0, col);
    this._vert(c, n, u1, v1, col);
    this._vert(d, n, u0, v1, col);
  }

  // Quad with an explicit UV per corner.
  quad4(a, b, c, d, n, ua, ub, uc, ud, color) {
    const col = color instanceof THREE.Color ? color : _c.set(color ?? 0xffffff);
    this._vert(a, n, ua[0], ua[1], col); this._vert(b, n, ub[0], ub[1], col); this._vert(c, n, uc[0], uc[1], col);
    this._vert(a, n, ua[0], ua[1], col); this._vert(c, n, uc[0], uc[1], col); this._vert(d, n, ud[0], ud[1], col);
  }

  // Axis-aligned box with UVs measured in tiles of tileW x tileH metres.
  // Opts: top, bottom, sides (bools), topTile (metres), vOffset (tiles), topBuilder (separate builder for the roof).
  box(cx, y0, cz, w, h, d, color, opts = {}) {
    const { tileW = 1, tileH = 1, top = true, bottom = false, sides = true, topTile = 1, vOffset = 0, topBuilder = this, topColor = color } = opts;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const v0 = vOffset, v1 = vOffset + h / tileH;
    if (sides) {
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [0, v0, w / tileW, v1], color);
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [0, v0, w / tileW, v1], color);
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [0, v0, d / tileW, v1], color);
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [0, v0, d / tileW, v1], color);
    }
    if (top) {
      topBuilder.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0],
        [x0 / topTile, -z1 / topTile, x1 / topTile, -z0 / topTile], topColor);
    }
    if (bottom) {
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [0, 0, 1, 1], color);
    }
  }

  // Horizontal rectangle facing up. uvFn(x, z) -> [u, v]; defaults to world-space tiles of 1 m.
  rect(minX, maxX, minZ, maxZ, y, color, uvFn = (x, z) => [x, -z]) {
    const col = color instanceof THREE.Color ? color : _c.set(color ?? 0xffffff);
    const n = [0, 1, 0];
    const corners = [[minX, maxZ], [maxX, maxZ], [maxX, minZ], [minX, maxZ], [maxX, minZ], [minX, minZ]];
    for (const [x, z] of corners) {
      const [u, v] = uvFn(x, z);
      this._vert([x, y, z], n, u, v, col);
    }
  }

  // Add an arbitrary three.js geometry transformed by `matrix`.
  addGeometry(geo, matrix, color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const col = color instanceof THREE.Color ? color.clone() : new THREE.Color(color ?? 0xffffff);
    _m3.getNormalMatrix(matrix);
    for (let k = 0; k < p.count; k++) {
      _v.fromBufferAttribute(p, k).applyMatrix4(matrix);
      _n.fromBufferAttribute(n, k).applyMatrix3(_m3).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
      if (uv) this.uv.push(uv.getX(k), uv.getY(k));
      else this.uv.push(0, 0);
      this.col.push(col.r, col.g, col.b);
      if (this.usePbr) this.pbrArr.push(this.pbr[0], this.pbr[1], this.pbr[2]);
      if (this.useSkin) this.boneArr.push(this.bone);
    }
    if (g !== geo) g.dispose();
  }

  // Distribute triangles into cells by centroid.
  split(size) {
    const cells = new Map();
    const P = this.pos, N = this.nor, U = this.uv, C = this.col;
    for (let t = 0; t < P.length / 9; t++) {
      const cx = (P[t * 9] + P[t * 9 + 3] + P[t * 9 + 6]) / 3;
      const cz = (P[t * 9 + 2] + P[t * 9 + 5] + P[t * 9 + 8]) / 3;
      const key = `${Math.floor(cx / size)},${Math.floor(cz / size)}`;
      let b = cells.get(key);
      if (!b) cells.set(key, (b = new MeshBuilder()));
      for (let k = 0; k < 9; k++) { b.pos.push(P[t * 9 + k]); b.nor.push(N[t * 9 + k]); b.col.push(C[t * 9 + k]); }
      for (let k = 0; k < 6; k++) b.uv.push(U[t * 6 + k]);
    }
    return [...cells.values()];
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.usePbr) g.setAttribute('pbr', new THREE.Float32BufferAttribute(this.pbrArr, 3));
    if (this.useSkin) {
      const n = this.boneArr.length;
      const idx = new Uint16Array(n * 4), w = new Float32Array(n * 4);
      for (let k = 0; k < n; k++) { idx[k * 4] = this.boneArr[k]; w[k * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  build(material, { castShadow = true, receiveShadow = true } = {}) {
    const mesh = new THREE.Mesh(this.geometry(), material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    return mesh;
  }
}

// Rigid-skinned mesh: `bones` is an array of THREE.Bone with bones[0] as root, already
// positioned in bind pose relative to the mesh origin.
export function buildSkinned(builder, material, bones, { castShadow = true, receiveShadow = true } = {}) {
  const mesh = new THREE.SkinnedMesh(builder.geometry(), material);
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  // Bounding sphere is computed in bind pose; pad it for animated limbs.
  mesh.geometry.computeBoundingSphere();
  mesh.boundingSphere = mesh.geometry.boundingSphere.clone();
  mesh.boundingSphere.radius += 1;
  return mesh;
}

// Global uniforms shared by procedural materials (driven by the day/night system).
export const sharedUniforms = { uNight: { value: 0 }, uWet: { value: 0 } };

// MeshStandardMaterial whose roughness/metalness/emissive come from the per-vertex `pbr` attribute.
// Emissive parts (lamps) glow softly by day and brightly at night.
export function makePbrMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, ...opts });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uNight = sharedUniforms.uNight;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 pbr;\nvarying vec3 vPbr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPbr;\nuniform float uNight;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPbr.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPbr.y;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = vColor.rgb * vPbr.z * (0.25 + uNight * 2.5);');
  };
  mat.customProgramCacheKey = () => 'pbr-vertex';
  return mat;
}

export class BuilderSet {
  constructor() {
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) this.map.set(key, new MeshBuilder());
    return this.map.get(key);
  }
  // chunk: split large builders into square cells of this size so meshes can be frustum-culled.
  buildAll(materials, group, shadowOpts = {}, chunk = 0) {
    for (const [key, b] of this.map) {
      if (b.empty) continue;
      const mat = materials[key];
      if (!mat) throw new Error(`No material for builder "${key}"`);
      const parts = chunk ? b.split(chunk) : [b];
      for (const part of parts) {
        const mesh = part.build(mat, shadowOpts[key] || {});
        mesh.name = key;
        group.add(mesh);
      }
    }
  }
}
