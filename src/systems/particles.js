// Pooled point-sprite particles: engine smoke, fire, sparks, dust, explosions, muzzle flash.
// Two draw calls in total: one alpha-blended (smoke, dust) and one additive (fire, sparks).
import * as THREE from 'three';

const KINDS = {
  smoke: { life: [1.6, 2.6], size: [0.6, 2.4], c0: [0.75, 0.75, 0.75], c1: [0.55, 0.55, 0.55], a: 0.45, drag: 1.2, lift: 1.4, add: false },
  blackSmoke: { life: [2.2, 3.6], size: [0.8, 3.6], c0: [0.12, 0.12, 0.12], c1: [0.2, 0.2, 0.2], a: 0.7, drag: 1.0, lift: 2.0, add: false },
  dust: { life: [0.5, 1.0], size: [0.3, 1.4], c0: [0.6, 0.55, 0.48], c1: [0.6, 0.55, 0.48], a: 0.35, drag: 3, lift: 0.3, add: false },
  spray: { life: [0.4, 0.8], size: [0.2, 1.0], c0: [0.8, 0.82, 0.85], c1: [0.8, 0.82, 0.85], a: 0.35, drag: 2, lift: -2, add: false },
  fire: { life: [0.4, 0.9], size: [0.9, 0.2], c0: [1.0, 0.75, 0.3], c1: [0.9, 0.2, 0.05], a: 0.9, drag: 1.5, lift: 3.5, add: true },
  spark: { life: [0.2, 0.5], size: [0.12, 0.05], c0: [1, 0.9, 0.5], c1: [1, 0.4, 0.1], a: 1, drag: 0.5, lift: -9, add: true },
  flash: { life: [0.05, 0.08], size: [0.7, 0.9], c0: [1, 0.9, 0.6], c1: [1, 0.7, 0.3], a: 1, drag: 0, lift: 0, add: true },
  blast: { life: [0.5, 0.9], size: [2.5, 6], c0: [1, 0.85, 0.5], c1: [0.8, 0.25, 0.05], a: 0.9, drag: 2.5, lift: 2, add: true },
  blood: { life: [0.3, 0.6], size: [0.12, 0.25], c0: [0.55, 0.02, 0.02], c1: [0.35, 0, 0], a: 0.9, drag: 1, lift: -9, add: false },
};

class Pool {
  constructor(scene, max, additive) {
    this.max = max;
    this.n = 0;
    this.p = []; // live particles
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 400 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale;
        void main() {
          vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec4 vC;
        void main() {
          vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0;
          if (r > 1.0) discard;
          gl_FragColor = vec4(vC.rgb, vC.a * (1.0 - r) * (1.0 - r));
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
    scene.add(this.points);
  }
}

export class Particles {
  constructor(scene) {
    this.normal = new Pool(scene, 1400, false);
    this.add = new Pool(scene, 900, true);
  }

  emit(kind, x, y, z, vx = 0, vy = 0, vz = 0, scale = 1) {
    const k = KINDS[kind];
    const pool = k.add ? this.add : this.normal;
    if (pool.p.length >= pool.max) pool.p.shift();
    const life = k.life[0] + Math.random() * (k.life[1] - k.life[0]);
    pool.p.push({ k, x, y, z, vx, vy, vz, t: 0, life, s: scale });
  }

  // A burst of n particles with random velocities.
  burst(kind, x, y, z, n, speed, up = 0.5, scale = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * up;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.emit(kind, x, y, z, Math.cos(a) * sp, (e + Math.random() * 0.3) * sp, Math.sin(a) * sp, scale);
    }
  }

  update(dt, camera, renderer) {
    const h = renderer ? renderer.domElement.height : 720;
    const scale = (h * camera.projectionMatrix.elements[5]) / 2;
    for (const pool of [this.normal, this.add]) {
      pool.uniforms.uScale.value = scale;
      let n = 0;
      const keep = [];
      for (const q of pool.p) {
        q.t += dt;
        if (q.t >= q.life) continue;
        keep.push(q);
        const k = q.k, f = q.t / q.life;
        const drag = Math.exp(-k.drag * dt);
        q.vx *= drag; q.vz *= drag; q.vy = q.vy * drag + k.lift * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        if (q.y < 0.02 && k.lift < 0) { q.y = 0.02; q.vy = 0; q.vx *= 0.5; q.vz *= 0.5; }
        pool.pos[n * 3] = q.x; pool.pos[n * 3 + 1] = q.y; pool.pos[n * 3 + 2] = q.z;
        pool.col[n * 4] = k.c0[0] + (k.c1[0] - k.c0[0]) * f;
        pool.col[n * 4 + 1] = k.c0[1] + (k.c1[1] - k.c0[1]) * f;
        pool.col[n * 4 + 2] = k.c0[2] + (k.c1[2] - k.c0[2]) * f;
        pool.col[n * 4 + 3] = k.a * (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85);
        pool.size[n] = (k.size[0] + (k.size[1] - k.size[0]) * f) * q.s;
        n++;
      }
      pool.p = keep;
      const g = pool.points.geometry;
      g.setDrawRange(0, n);
      g.attributes.position.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
      g.attributes.size.needsUpdate = true;
    }
  }
}
