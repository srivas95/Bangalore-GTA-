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
// mpp = metres per pixel.
export function bakeAO(world, { boxes = [], trees = [], strips = [] }, mpp = 2.5) {
  // (Kept within 4096 px a side: the most many phone GPUs take.)
  mpp = Math.max(mpp, (world.maxX - world.minX) / 4096, (world.maxZ - world.minZ) / 4096);
  const W = Math.ceil((world.maxX - world.minX) / mpp), H = Math.ceil((world.maxZ - world.minZ) / mpp);
  const a = document.createElement('canvas');
  a.width = W; a.height = H;
  const ctx = a.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(1 / mpp, 0, 0, 1 / mpp, -world.minX / mpp, -world.minZ / mpp);
  // Shapes are drawn in batches, one path per shade, so overlaps don't darken twice.
  const fillBatch = (alpha, draw) => { ctx.fillStyle = `rgba(0,0,0,${alpha})`; ctx.beginPath(); draw(); ctx.fill(); };
  for (const s of strips) {
    ctx.strokeStyle = `rgba(0,0,0,${s.alpha})`;
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    s.pts.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
    ctx.stroke();
  }
  fillBatch(0.35, () => { for (const t of trees) { const r = 2.8 * t.s; ctx.moveTo(t.x + r, t.z); ctx.arc(t.x, t.z, r, 0, Math.PI * 2); } });
  const box = (b, grow) => {
    if (b.rot) {
      const { cx, cz, c, s, hw, hd } = b.rot, w = hw + grow, d = hd + grow;
      [[-w, -d], [w, -d], [w, d], [-w, d]].forEach(([lx, lz], i) => {
        const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c;
        if (i) ctx.lineTo(x, z); else ctx.moveTo(x, z);
      });
      ctx.closePath();
    } else ctx.rect(b.minX - grow, b.minZ - grow, b.maxX - b.minX + 2 * grow, b.maxZ - b.minZ + 2 * grow);
  };
  const low = boxes.filter((b) => b.y0 <= 1); // raised boxes: traffic passes underneath
  fillBatch(0.55, () => { for (const b of low) if (b.tag === 'wall' || b.tag === 'pier') box(b, 0.9); });
  fillBatch(0.8, () => { for (const b of low) if ((b.tag === 'building' || b.tag === 'plinth') && b.h < 12) box(b, 2.0); });
  fillBatch(0.92, () => { for (const b of low) if ((b.tag === 'building' || b.tag === 'plinth') && b.h >= 12) box(b, 2.0); });
  const px = ctx.getImageData(0, 0, W, H).data;
  a.width = a.height = 1;
  const data = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) data[k] = px[k * 4];
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
