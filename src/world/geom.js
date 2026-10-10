// Polygon helpers for MeshBuilder: filled ground polygons, kerb/wall faces and sloped quads.
import * as THREE from 'three';
import { polyArea } from './roadnet.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();

// Triangle facing up (flips winding if needed).
function upTri(b, p, q, r, uv, color) {
  _a.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  _b.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]);
  _n.crossVectors(_a, _b);
  if (_n.y < 0) { [q, r] = [r, q]; _n.negate(); }
  _n.normalize();
  b.tri(p, q, r, [_n.x, _n.y, _n.z], uv(p[0], p[2]), uv(q[0], q[2]), uv(r[0], r[2]), color);
}

export function triangulate(poly, holes = []) {
  const v = (pts) => pts.map(([x, z]) => new THREE.Vector2(x, z));
  return THREE.ShapeUtils.triangulateShape(v(poly), holes.map(v));
}

// Flat polygon (optionally with holes) at height y, or yFn(x, z).
export function fillPoly(b, poly, y, color = 0xffffff, uv = (x, z) => [x, -z], holes = []) {
  const tris = triangulate(poly, holes);
  const all = holes.length ? poly.concat(...holes) : poly;
  const Y = typeof y === 'function' ? y : () => y;
  for (const [i, j, k] of tris) {
    const p = all[i], q = all[j], r = all[k];
    upTri(b, [p[0], Y(p[0], p[1]), p[1]], [q[0], Y(q[0], q[1]), q[1]], [r[0], Y(r[0], r[1]), r[1]], uv, color);
  }
}

// Fan around a centre point (for star-shaped polygons such as junctions).
export function fanPoly(b, cx, cz, poly, y, color = 0xffffff, uv = (x, z) => [x, -z]) {
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    upTri(b, [cx, y, cz], [p[0], y, p[1]], [q[0], y, q[1]], uv, color);
  }
}

// Vertical faces along a polygon's edges, facing outward (or inward), from y0 to y1.
export function polyWalls(b, poly, y0, y1, color = 0xffffff, { inward = false, tile = 2, skip } = {}) {
  const sgn = Math.sign(polyArea(poly)) * (inward ? -1 : 1);
  for (let i = 0; i < poly.length; i++) {
    if (skip && skip(i)) continue;
    const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
    const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz);
    if (l < 1e-3) continue;
    // Outward normal: inside is to the right of travel for positive area (x right, z down).
    const nx = (dz / l) * sgn, nz = (-dx / l) * sgn;
    const a = [x1, y0, z1], c = [x2, y0, z2], d = [x2, y1, z2], e = [x1, y1, z1];
    // a, c, d, e winds towards (-dz, dx); flip it if the outward normal points the other way.
    const u1 = l / tile, v1 = (y1 - y0) / tile;
    if ((-dz) * nx + dx * nz > 0) b.quad4(a, c, d, e, [nx, 0, nz], [0, 0], [u1, 0], [u1, v1], [0, v1], color);
    else b.quad4(c, a, e, d, [nx, 0, nz], [0, 0], [u1, 0], [u1, v1], [0, v1], color);
  }
}

// Quad from four points with its normal computed (facing up if nearly horizontal).
export function quadPts(b, p, q, r, s, uvs, color) {
  _a.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  _b.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]);
  _n.crossVectors(_a, _b);
  let uv = uvs;
  if (_n.y < 0) { [q, s] = [s, q]; uv = [uvs[0], uvs[3], uvs[2], uvs[1]]; _n.negate(); }
  _n.normalize();
  b.quad4(p, q, r, s, [_n.x, _n.y, _n.z], uv[0], uv[1], uv[2], uv[3], color);
}

// Point-in-polygon and rectangle-overlap tests (SAT) for lot placement.
export function rectCorners(cx, cz, ux, uz, hw, hd) {
  const vx = -uz, vz = ux;
  return [
    [cx - ux * hw - vx * hd, cz - uz * hw - vz * hd], [cx + ux * hw - vx * hd, cz + uz * hw - vz * hd],
    [cx + ux * hw + vx * hd, cz + uz * hw + vz * hd], [cx - ux * hw + vx * hd, cz - uz * hw + vz * hd],
  ];
}

export function rectsOverlap(A, B) {
  for (const P of [A, B]) {
    for (let i = 0; i < 2; i++) {
      const ax = P[i + 1][0] - P[i][0], az = P[i + 1][1] - P[i][1];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, z] of A) { const d = x * ax + z * az; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const [x, z] of B) { const d = x * ax + z * az; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      if (a1 <= b0 || b1 <= a0) return false;
    }
  }
  return true;
}
