// Baked ambient shading, the same on every device and free at run time:
//  - walls darken towards their foot (a height gradient in the shader), and
//  - the ground darkens next to buildings and walls, under trees and under the metro viaduct,
//    from one small top-down shading map of the whole city painted once at load.
import * as THREE from 'three';

const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
white.needsUpdate = true;

export const aoUniforms = {
  uAOMap: { value: white },
  uAOXform: { value: new THREE.Vector4(0, 0, 1, 1) }, // world minX, minZ, 1/width, 1/depth
  uAOWall: { value: 0.42 }, // brightness at the foot of a wall
};

const VERT_HEAD = 'varying vec3 vAOPos;\nvarying float vAONy;';
const VERT_BODY = `
  {
    vec4 aoW = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      aoW = instanceMatrix * aoW;
    #endif
    vAOPos = (modelMatrix * aoW).xyz;
    vAONy = normalize(mat3(modelMatrix) * objectNormal).y;
  }`;
const FRAG_HEAD = `uniform sampler2D uAOMap;
uniform vec4 uAOXform;
uniform float uAOWall;
varying vec3 vAOPos;
varying float vAONy;
float aoFactor() {
  // Walls: darker over the first couple of metres above street level.
  float wh = clamp(abs(vAOPos.y - 0.15) / 3.5, 0.0, 1.0);
  float wall = mix(uAOWall, 1.0, sqrt(wh));
  // Ground: the shading map, only near street level (not on roofs or decks).
  float g = texture2D(uAOMap, (vAOPos.xz - uAOXform.xy) * uAOXform.zw).r;
  float low = smoothstep(-1.6, -0.8, vAOPos.y) * (1.0 - smoothstep(0.8, 2.5, vAOPos.y));
  float flatness = smoothstep(0.55, 0.85, abs(vAONy));
  return mix(wall, mix(1.0, g, low), flatness);
}`;

// Add the shading to a material (any built-in material that uses <color_fragment>).
export function withAO(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    Object.assign(s.uniforms, aoUniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${VERT_BODY}`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= aoFactor();');
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}+ao`;
  return mat;
}

// Paint the top-down shading map. shapes: { boxes: colliders.all, trees: [{x, z, s}], strips: [{pts, width, alpha}] }.
// mpp = metres per pixel (raised if need be so the map fits in a 4096 texture, which every GPU takes).
// Rasterised straight into a byte array: a canvas path of a quarter of a million rectangles took
// tens of seconds to fill on a slow machine.
export function bakeAO(world, { boxes = [], trees = [], strips = [] }, mpp = 2.5) {
  mpp = Math.max(mpp, (world.maxX - world.minX) / 4096, (world.maxZ - world.minZ) / 4096);
  const W = Math.ceil((world.maxX - world.minX) / mpp), H = Math.ceil((world.maxZ - world.minZ) / mpp);
  const data = new Uint8Array(W * H).fill(255);
  const mask = new Uint8Array(W * H);
  const X = (x) => (x - world.minX) / mpp, Z = (z) => (z - world.minZ) / mpp;
  // Each shade is one mask, applied once, so overlapping shapes don't darken twice.
  const shade = (alpha, draw) => {
    mask.fill(0);
    draw();
    const k = 1 - alpha;
    for (let i = 0; i < mask.length; i++) if (mask[i]) data[i] *= k;
  };
  const span = (y, x0, x1) => {
    if (y < 0 || y >= H) return;
    const a = Math.max(0, Math.ceil(x0 - 0.5)), b = Math.min(W - 1, Math.floor(x1 - 0.5));
    if (b >= a) mask.fill(1, y * W + a, y * W + b + 1);
  };
  const rect = (x0, z0, x1, z1) => {
    const ya = Math.max(0, Math.ceil(Z(z0) - 0.5)), yb = Math.min(H - 1, Math.floor(Z(z1) - 0.5));
    for (let y = ya; y <= yb; y++) span(y, X(x0), X(x1));
  };
  // Convex polygon (pixel coordinates) by scanlines.
  const poly = (P) => {
    let ya = Infinity, yb = -Infinity;
    for (const [, y] of P) { ya = Math.min(ya, y); yb = Math.max(yb, y); }
    for (let y = Math.max(0, Math.ceil(ya - 0.5)); y <= Math.min(H - 1, Math.floor(yb - 0.5)); y++) {
      const yc = y + 0.5;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < P.length; i++) {
        const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
        if ((ay <= yc) === (by <= yc)) continue;
        const x = ax + ((yc - ay) / (by - ay)) * (bx - ax);
        lo = Math.min(lo, x); hi = Math.max(hi, x);
      }
      if (hi >= lo) span(y, lo, hi);
    }
  };
  const disc = (cx, cz, r) => {
    const px = X(cx), pz = Z(cz), pr = r / mpp;
    for (let y = Math.max(0, Math.ceil(pz - pr - 0.5)); y <= Math.min(H - 1, Math.floor(pz + pr - 0.5)); y++) {
      const dy = y + 0.5 - pz, h = Math.sqrt(Math.max(0, pr * pr - dy * dy));
      span(y, px - h, px + h);
    }
  };
  const box = (b, grow) => {
    if (b.rot) {
      const { cx, cz, c, s, hw, hd } = b.rot, w = hw + grow, d = hd + grow;
      poly([[-w, -d], [w, -d], [w, d], [-w, d]].map(([lx, lz]) => [X(cx + lx * c + lz * s), Z(cz - lx * s + lz * c)]));
    } else rect(b.minX - grow, b.minZ - grow, b.maxX + grow, b.maxZ + grow);
  };
  for (const st of strips) {
    shade(st.alpha, () => {
      const r = st.width / 2;
      for (let i = 0; i < st.pts.length - 1; i++) {
        const [ax, az] = st.pts[i], [bx, bz] = st.pts[i + 1];
        const l = Math.hypot(bx - ax, bz - az) || 1, nx = (-(bz - az) / l) * r, nz = ((bx - ax) / l) * r;
        poly([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]].map(([x, z]) => [X(x), Z(z)]));
        disc(ax, az, r);
      }
      const [ex, ez] = st.pts[st.pts.length - 1];
      disc(ex, ez, r);
    });
  }
  shade(0.35, () => { for (const t of trees) disc(t.x, t.z, 2.8 * t.s); });
  const low = boxes.filter((b) => b.y0 <= 1); // raised boxes: traffic passes underneath
  shade(0.55, () => { for (const b of low) if (b.tag === 'wall' || b.tag === 'pier') box(b, 0.9); });
  shade(0.8, () => { for (const b of low) if ((b.tag === 'building' || b.tag === 'plinth') && b.h < 12) box(b, 2.0); });
  shade(0.92, () => { for (const b of low) if ((b.tag === 'building' || b.tag === 'plinth') && b.h >= 12) box(b, 2.0); });
  // Soften: two box-blur passes in each direction (close to a Gaussian), radius ~3 m.
  blur(data, W, H, Math.max(1, Math.round(3 / mpp / 1.5)));
  blur(data, W, H, Math.max(1, Math.round(3 / mpp / 1.5)));
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  // Free the CPU copy once it's on the GPU.
  tex.onUpdate = () => { tex.image.data = null; };
  aoUniforms.uAOMap.value = tex;
  aoUniforms.uAOXform.value.set(world.minX, world.minZ, 1 / (W * mpp), 1 / (H * mpp));
  return tex;
}

// Separable running-sum box blur, in place.
function blur(d, W, H, r) {
  const n = 2 * r + 1, line = new Uint8Array(Math.max(W, H));
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) line[x] = d[o + x];
    let sum = line[0] * (r + 1);
    for (let k = 1; k <= r; k++) sum += line[Math.min(W - 1, k)];
    for (let x = 0; x < W; x++) {
      d[o + x] = sum / n;
      sum += line[Math.min(W - 1, x + r + 1)] - line[Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) line[y] = d[y * W + x];
    let sum = line[0] * (r + 1);
    for (let k = 1; k <= r; k++) sum += line[Math.min(H - 1, k)];
    for (let y = 0; y < H; y++) {
      d[y * W + x] = sum / n;
      sum += line[Math.min(H - 1, y + r + 1)] - line[Math.max(0, y - r)];
    }
  }
}
