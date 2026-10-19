// The sky: a time-of-day gradient with a sun-side glow band, sun and moon discs, twinkling stars
// and drifting clouds that thicken into monsoon overcast. Colours come from keyframes on the sun's
// elevation, so dusk and dawn get proper twilight instead of going black the moment the sun sets.
// Also the distant skyline ring that fills the horizon beyond the fog.
import * as THREE from 'three';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // On the far plane, so it never clips the city and is drawn only where nothing else was.
  gl_Position = p.xyww;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const SKY_FRAG = /* glsl */`
uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uGround, uGlow, uSunDisc, uCloudLit, uCloudDark;
uniform float uTime, uStars, uCloud, uMoon, uSunVis, uEnvGain;
uniform vec3 uEnvFloor, uEnvGround;
varying vec3 vDir;
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
  col = mix(col, uGround, smoothstep(0.0, -0.25, h));
  float cs = dot(d, uSunDir);
  // Warm band along the horizon on the sun's side, plus a halo round the sun.
  vec2 dh = normalize(d.xz + 1e-5), sh = normalize(uSunDir.xz + 1e-5);
  float side = max(dot(dh, sh), 0.0);
  float band = exp(-max(h, 0.0) * 5.0) * pow(side, 3.0) * smoothstep(-0.3, 0.05, h);
  col += uGlow * (band + pow(max(cs, 0.0), 12.0) * 0.6 + pow(max(cs, 0.0), 200.0) * 1.5);
  // Clouds on a dome.
  float ca = 0.0;
  vec3 cc = vec3(0.0);
  if (h > 0.0 && uCloud > 0.01) {
    vec2 uv = d.xz / (h + 0.15) * 1.4 + vec2(uTime * 0.005, uTime * 0.002);
    float n = fbm(uv);
    float cov = mix(0.78, 0.3, uCloud);
    ca = smoothstep(cov, cov + 0.22, n) * smoothstep(0.0, 0.1, h) * min(1.0, uCloud * 3.0);
    float thick = smoothstep(cov, cov + 0.6, n);
    cc = mix(uCloudLit, uCloudDark, thick * 0.8 + uCloud * 0.2) + uGlow * (band * 1.4 + pow(max(cs, 0.0), 6.0) * 0.8) * (1.0 - thick * 0.6);
  }
  col += uSunDisc * smoothstep(0.99955, 0.9998, cs) * uSunVis * (1.0 - ca);
  if (uStars > 0.002 && h > 0.0) {
    vec3 q = d * 300.0, cell = floor(q);
    float s = hash3(cell);
    float tw = 0.6 + 0.4 * sin(uTime * (1.5 + s * 5.0) + s * 50.0);
    float star = step(0.9965, s) * smoothstep(0.42, 0.1, length(fract(q) - 0.5)) * tw;
    col += vec3(0.9, 0.93, 1.0) * star * uStars * smoothstep(0.03, 0.25, h) * (1.0 - ca);
  }
  float cm = dot(d, uMoonDir);
  col += vec3(0.9, 0.92, 0.96) * smoothstep(0.99925, 0.9995, cm) * uMoon * (1.0 - ca * 0.85);
  col += vec3(0.18, 0.22, 0.32) * pow(max(cm, 0.0), 220.0) * uMoon;
  col = mix(col, cc, ca);
  #ifdef ENV
    // The copy baked into image-based lighting: sunlit ground below the horizon (warm bounce light
    // on walls), brighter, and with a moonlit floor so streets stay readable at night without
    // washing out the visible sky.
    col = mix(col, uEnvGround, smoothstep(0.0, -0.2, h));
    col = max(col * uEnvGain, uEnvFloor);
  #endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const C = (hex) => new THREE.Color(hex);
// [sun elevation°, zenith, horizon, sun-side glow (added light)]
const KEYS = [
  [-18, C(0x03060e), C(0x0a1120), C(0x000000)],
  [-10, C(0x060c1e), C(0x152240), C(0x05060c)],
  [-6, C(0x0f1d3e), C(0x33405e), C(0x2a1420)],
  [-2.5, C(0x22407a), C(0x9a7480), C(0x7a2e14)],
  [0.5, C(0x335c9a), C(0xe09a72), C(0xa64818)],
  [5, C(0x4370ac), C(0xeec29c), C(0x7a4818)],
  [14, C(0x4c80c0), C(0xcfd9e2), C(0x2e2618)],
  [35, C(0x3d7ace), C(0xbad0e6), C(0x221e16)],
];
// Overcast palettes (day / night), blended in with the rain.
const GREY_DAY = { z: C(0x6c747c), h: C(0x9aa1a6) };
const GREY_NIGHT = { z: C(0x111418), h: C(0x1b1f25) };

const _a = new THREE.Color(), _b = new THREE.Color();
function sample(elev, idx) {
  if (elev <= KEYS[0][0]) return _a.copy(KEYS[0][idx]);
  for (let k = 1; k < KEYS.length; k++) {
    if (elev <= KEYS[k][0]) {
      const t = (elev - KEYS[k - 1][0]) / (KEYS[k][0] - KEYS[k - 1][0]);
      return _a.copy(KEYS[k - 1][idx]).lerp(KEYS[k][idx], t * t * (3 - 2 * t));
    }
  }
  return _a.copy(KEYS[KEYS.length - 1][idx]);
}

export class Sky {
  constructor() {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() }, uSunDisc: { value: new THREE.Color(1, 0.95, 0.85).multiplyScalar(30) },
      uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
      uTime: { value: 0 }, uStars: { value: 0 }, uCloud: { value: 0.25 }, uMoon: { value: 0 }, uSunVis: { value: 1 },
      uEnvGain: { value: 1.6 }, uEnvFloor: { value: new THREE.Color() }, uEnvGround: { value: new THREE.Color() },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.geometry = new THREE.SphereGeometry(10, 32, 16);
    this.mesh = this.makeMesh();
    // Drawn after all the opaque city, so only uncovered pixels run the sky shader.
    this.mesh.renderOrder = 1000;
    this.horizon = new THREE.Color();
    this.zenith = new THREE.Color();
  }

  makeMesh(env = false) {
    const mat = env ? new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, defines: { ENV: '' },
      side: THREE.BackSide, depthWrite: false, fog: false,
    }) : this.material;
    const m = new THREE.Mesh(this.geometry, mat);
    m.frustumCulled = false;
    return m;
  }

  // elev: sun elevation in degrees; rain 0..1; clouds: fair-weather cover 0..1.
  update(sunDir, elev, rain, time, clouds = 0.25) {
    const u = this.uniforms;
    u.uSunDir.value.copy(sunDir);
    u.uMoonDir.value.copy(sunDir).negate();
    u.uTime.value = time;
    const dayness = Math.min(1, Math.max(0, (elev + 6) / 12));
    _b.copy(GREY_NIGHT.z).lerp(GREY_DAY.z, dayness);
    this.zenith.copy(sample(elev, 1)).lerp(_b, rain * 0.9);
    _b.copy(GREY_NIGHT.h).lerp(GREY_DAY.h, dayness);
    this.horizon.copy(sample(elev, 2)).lerp(_b, rain * 0.9);
    u.uZenith.value.copy(this.zenith);
    u.uHorizon.value.copy(this.horizon);
    u.uGround.value.copy(this.horizon).multiplyScalar(0.55);
    u.uGlow.value.copy(sample(elev, 3)).multiplyScalar(1 - rain * 0.85);
    u.uSunVis.value = elev > -1.5 ? 1 - rain : 0;
    u.uStars.value = Math.min(1, Math.max(0, (-elev - 7) / 6)) * (1 - rain);
    u.uMoon.value = Math.min(1, Math.max(0, (-elev - 3) / 6)) * (1 - rain * 0.9);
    u.uCloud.value = clouds + (1 - clouds) * rain;
    u.uEnvGain.value = 1 + 1.1 * dayness;
    // Saturated, because materials take only part of the sky light's colour (see main.js).
    u.uEnvFloor.value.setRGB(0.36, 0.46, 0.86).lerp(_b.setRGB(0.36, 0.38, 0.4), dayness);
    const sunlit = Math.min(1, Math.max(0, (elev + 2) / 14)) * (1 - rain * 0.7);
    u.uEnvGround.value.copy(this.horizon).multiplyScalar(0.3 * (1 - sunlit)).add(_b.setRGB(0.3, 0.27, 0.22).multiplyScalar(sunlit));
    // Clouds: white and sunlit by day, warm at dusk, dim blue-grey at night.
    u.uCloudLit.value.copy(this.horizon).lerp(_b.setRGB(1, 1, 1), 0.55 * dayness).multiplyScalar(0.25 + 0.95 * dayness);
    u.uCloudDark.value.copy(this.zenith).lerp(_b.setRGB(0.35, 0.37, 0.4), 0.6).multiplyScalar(0.3 + 0.6 * dayness);
  }
}

// A ring of distant building silhouettes just inside the far plane, so the city doesn't end at a
// flat fog wall. Tinted with the haze; a few windows light up at night.
export function makeSkyline(seed = 11) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const W = 2048, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  // Two layers: far (lighter) then near (darker), each building with water tanks; a few towers.
  for (const [layer, shade, hMin, hMax] of [[0, 150, 8, 30], [1, 95, 6, 22]]) {
    for (let x = rnd() * 10; x < W;) {
      const w = 5 + rnd() * 22, tall = rnd() < (layer ? 0.03 : 0.07);
      const h = tall ? 40 + rnd() * 70 : hMin + rnd() * (hMax - hMin);
      const r = shade + rnd() * 25;
      ctx.fillStyle = `rgb(${r | 0},0,0)`;
      ctx.fillRect(x, H - h, w, h);
      if (!tall && rnd() < 0.5) ctx.fillRect(x + w * 0.3, H - h - 3, 3, 3);
      // Lit windows go in the green channel.
      for (let k = 0; k < (tall ? 14 : 3); k++) {
        if (rnd() < 0.5) continue;
        ctx.fillStyle = `rgb(${r | 0},255,0)`;
        ctx.fillRect(x + 1 + rnd() * (w - 3), H - h + 2 + rnd() * (h - 4), 1.5, 1.5);
      }
      x += w + (rnd() < 0.2 ? rnd() * 14 : 0);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.colorSpace = THREE.NoColorSpace;
  const N = 96, pos = [], uv = [], idx = [];
  for (let k = 0; k <= N; k++) {
    const a = (k / N) * Math.PI * 2;
    pos.push(Math.cos(a), -0.02, Math.sin(a), Math.cos(a), 0.075, Math.sin(a));
    uv.push((k / N) * 3, 0, (k / N) * 3, 1);
    if (k < N) { const b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const uniforms = { map: { value: tex }, uHaze: { value: new THREE.Color() }, uTone: { value: new THREE.Color() }, uNight: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide, fog: false,
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform vec3 uHaze, uTone; uniform float uNight; varying vec2 vUv;
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.5) discard;
        vec3 col = mix(uHaze, uTone, (1.0 - t.r) * 0.9);
        col += vec3(1.0, 0.75, 0.45) * t.g * uNight * 0.5;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 999;
  mesh.userData.uniforms = uniforms;
  return mesh;
}
