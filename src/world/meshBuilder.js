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
    // Optional shared frame {ref: {xf}}: xf = {ox, oz, c, s} places local (x, z) at
    // (ox + x*c + z*s, oz - x*s + z*c), i.e. a rotation about +y by atan2(s, c).
    this.ref = opts.ref || null;
  }

  get empty() {
    return this.pos.length === 0;
  }

  _vert(p, n, u, v, c) {
    const f = this.ref && this.ref.xf;
    if (f) {
      this.pos.push(f.ox + p[0] * f.c + p[2] * f.s, p[1], f.oz - p[0] * f.s + p[2] * f.c);
      this.nor.push(n[0] * f.c + n[2] * f.s, n[1], -n[0] * f.s + n[2] * f.c);
    } else {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
    }
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

  // Triangle with an explicit UV per corner.
  tri(a, b, c, n, ua, ub, uc, color) {
    const col = color instanceof THREE.Color ? color : _c.set(color ?? 0xffffff);
    this._vert(a, n, ua[0], ua[1], col); this._vert(b, n, ub[0], ub[1], col); this._vert(c, n, uc[0], uc[1], col);
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
    const f = this.ref && this.ref.xf;
    for (let k = 0; k < p.count; k++) {
      _v.fromBufferAttribute(p, k).applyMatrix4(matrix);
      _n.fromBufferAttribute(n, k).applyMatrix3(_m3).normalize();
      if (f) {
        this.pos.push(f.ox + _v.x * f.c + _v.z * f.s, _v.y, f.oz - _v.x * f.s + _v.z * f.c);
        this.nor.push(_n.x * f.c + _n.z * f.s, _n.y, -_n.x * f.s + _n.z * f.c);
      } else {
        this.pos.push(_v.x, _v.y, _v.z);
        this.nor.push(_n.x, _n.y, _n.z);
      }
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

// A local coordinate frame: origin (ox, oz) and rotation `ang` about +y (three.js convention,
// so local +x maps to (cos, -sin) and local +z to (sin, cos)).
export function makeFrame(ox, oz, ang) {
  return { ox, oz, c: Math.cos(ang), s: Math.sin(ang), ang };
}
export function frameToWorld(f, x, z) {
  return f ? [f.ox + x * f.c + z * f.s, f.oz - x * f.s + z * f.c] : [x, z];
}
export function worldToFrame(f, x, z) {
  const dx = x - f.ox, dz = z - f.oz;
  return [dx * f.c - dz * f.s, dx * f.s + dz * f.c];
}

// Growable typed array.
class Grow {
  constructor(Type, cap = 1024) { this.Type = Type; this.a = new Type(cap); this.n = 0; }
  reserve(k) {
    if (this.n + k <= this.a.length) return;
    let cap = this.a.length * 2;
    while (cap < this.n + k) cap *= 2;
    const b = new this.Type(cap); b.set(this.a.subarray(0, this.n)); this.a = b;
  }
  view() { return this.a.slice(0, this.n); }
}

// Compact builder for the static world: indexed quads (4 vertices, not 6), 8-bit colours and
// normals, and geometry routed into square chunks as it's added (no copying to split later).
// Same drawing API as MeshBuilder (box, quad, quad4, tri, rect, addGeometry).
export class ChunkBuilder extends MeshBuilder {
  constructor(opts = {}) {
    super(opts);
    this.size = opts.chunk || 0;
    this.chunks = new Map();
    this.cur = null;
  }

  get empty() { for (const c of this.chunks.values()) if (c.count) return false; return true; }

  // Pick the chunk for a primitive whose first vertex is at local (x, z).
  begin(x, z) {
    const f = this.ref && this.ref.xf;
    const wx = f ? f.ox + x * f.c + z * f.s : x, wz = f ? f.oz - x * f.s + z * f.c : z;
    const key = this.size ? `${Math.floor(wx / this.size)},${Math.floor(wz / this.size)}` : '0';
    let c = this.chunks.get(key);
    if (!c) this.chunks.set(key, (c = { pos: new Grow(Float32Array), nor: new Grow(Int8Array), uv: new Grow(Float32Array), col: new Grow(Uint8Array), idx: new Grow(Uint32Array), count: 0 }));
    this.cur = c;
    return c;
  }

  _vert(p, n, u, v, col) {
    const c = this.cur, f = this.ref && this.ref.xf;
    c.pos.reserve(3); c.nor.reserve(3); c.uv.reserve(2); c.col.reserve(3);
    let px = p[0], pz = p[2], nx = n[0], nz = n[2];
    if (f) { const x = px; px = f.ox + x * f.c + pz * f.s; pz = f.oz - x * f.s + pz * f.c; const q = nx; nx = q * f.c + nz * f.s; nz = -q * f.s + nz * f.c; }
    const P = c.pos.a, k = c.pos.n; P[k] = px; P[k + 1] = p[1]; P[k + 2] = pz; c.pos.n += 3;
    const N = c.nor.a, j = c.nor.n; N[j] = Math.round(nx * 127); N[j + 1] = Math.round(n[1] * 127); N[j + 2] = Math.round(nz * 127); c.nor.n += 3;
    const U = c.uv.a, i = c.uv.n; U[i] = u; U[i + 1] = v; c.uv.n += 2;
    const C = c.col.a, h = c.col.n; C[h] = Math.round(Math.min(1, col.r) * 255); C[h + 1] = Math.round(Math.min(1, col.g) * 255); C[h + 2] = Math.round(Math.min(1, col.b) * 255); c.col.n += 3;
    return c.count++;
  }

  _index(...ids) {
    const I = this.cur.idx; I.reserve(ids.length);
    for (const id of ids) I.a[I.n++] = id;
  }

  quad(a, b, c, d, n, uv, color) {
    const col = color instanceof THREE.Color ? color : _c.set(color ?? 0xffffff);
    const [u0, v0, u1, v1] = uv;
    this.begin(a[0], a[2]);
    const i = this._vert(a, n, u0, v0, col); this._vert(b, n, u1, v0, col); this._vert(c, n, u1, v1, col); this._vert(d, n, u0, v1, col);
    this._index(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  quad4(a, b, c, d, n, ua, ub, uc, ud, color) {
    const col = color instanceof THREE.Color ? color : _c.set(color ?? 0xffffff);
    this.begin(a[0], a[2]);
    const i = this._vert(a, n, ua[0], ua[1], col); this._vert(b, n, ub[0], ub[1], col); this._vert(c, n, uc[0], uc[1], col); this._vert(d, n, ud[0], ud[1], col);
    this._index(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  tri(a, b, c, n, ua, ub, uc, color) {
    const col = color instanceof THREE.Color ? color : _c.set(color ?? 0xffffff);
    this.begin(a[0], a[2]);
    const i = this._vert(a, n, ua[0], ua[1], col); this._vert(b, n, ub[0], ub[1], col); this._vert(c, n, uc[0], uc[1], col);
    this._index(i, i + 1, i + 2);
  }

  rect(minX, maxX, minZ, maxZ, y, color, uvFn = (x, z) => [x, -z]) {
    const col = color instanceof THREE.Color ? color : _c.set(color ?? 0xffffff);
    const n = [0, 1, 0];
    this.begin(minX, maxZ);
    const pts = [[minX, maxZ], [maxX, maxZ], [maxX, minZ], [minX, minZ]];
    const i = this.cur.count;
    for (const [x, z] of pts) { const [u, v] = uvFn(x, z); this._vert([x, y, z], n, u, v, col); }
    this._index(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  addGeometry(geo, matrix, color) {
    const p = geo.attributes.position, nm = geo.attributes.normal, uv = geo.attributes.uv;
    const col = color instanceof THREE.Color ? color : _c.set(color ?? 0xffffff);
    _m3.getNormalMatrix(matrix);
    this.begin(matrix.elements[12], matrix.elements[14]);
    const base = this.cur.count;
    const vp = [0, 0, 0], vn = [0, 0, 0];
    for (let k = 0; k < p.count; k++) {
      _v.fromBufferAttribute(p, k).applyMatrix4(matrix);
      _n.fromBufferAttribute(nm, k).applyMatrix3(_m3).normalize();
      vp[0] = _v.x; vp[1] = _v.y; vp[2] = _v.z; vn[0] = _n.x; vn[1] = _n.y; vn[2] = _n.z;
      this._vert(vp, vn, uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0, col);
    }
    const I = this.cur.idx;
    if (geo.index) { const src = geo.index.array; I.reserve(src.length); for (let k = 0; k < src.length; k++) I.a[I.n++] = base + src[k]; }
    else { I.reserve(p.count); for (let k = 0; k < p.count; k++) I.a[I.n++] = base + k; }
  }

  split() { return [this]; }

  // One geometry per chunk.
  geometries() {
    const out = [];
    for (const c of this.chunks.values()) {
      if (!c.count) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(c.pos.view(), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(c.nor.view(), 3, true));
      g.setAttribute('uv', new THREE.BufferAttribute(c.uv.view(), 2));
      g.setAttribute('color', new THREE.BufferAttribute(c.col.view(), 3, true));
      const idx = c.count < 65536 ? Uint16Array.from(c.idx.a.subarray(0, c.idx.n)) : c.idx.view();
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      out.push(g);
    }
    this.chunks.clear();
    return out;
  }
}

// Frees the CPU copy of a geometry's data once it's on the GPU.
const release = function () { this.array = null; };

export class BuilderSet {
  // opts.chunk: route geometry into square cells of this size (frustum/distance culling).
  // opts.release: drop the CPU-side arrays after upload (static geometry nobody edits later).
  constructor(opts = {}) {
    this.map = new Map();
    this.ref = { xf: null }; // shared by every builder in the set
    this.opts = opts;
  }
  get xf() { return this.ref.xf; }
  set xf(f) { this.ref.xf = f; }
  get(key) {
    if (!this.map.has(key)) this.map.set(key, new ChunkBuilder({ ref: this.ref, chunk: this.opts.chunk }));
    return this.map.get(key);
  }
  buildAll(materials, group, shadowOpts = {}) {
    for (const [key, b] of this.map) {
      if (b.empty) continue;
      const mat = materials[key];
      if (!mat) throw new Error(`No material for builder "${key}"`);
      for (const g of b.geometries()) {
        if (this.opts.release) for (const a of [...Object.values(g.attributes), g.index]) a.onUpload(release);
        const mesh = new THREE.Mesh(g, mat);
        const so = shadowOpts[key] || {};
        mesh.castShadow = so.castShadow ?? true;
        mesh.receiveShadow = so.receiveShadow ?? true;
        mesh.name = key;
        group.add(mesh);
      }
    }
    this.map.clear();
  }
}
