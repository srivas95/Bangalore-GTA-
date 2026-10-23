// Tyre marks: dark streaks laid on the road wherever tyres slide (a rear stepping out, wheels
// locked under hard braking, wheelspin), fading over a couple of minutes. One mesh, a ring of quads.
import * as THREE from 'three';
import { DETAIL } from './detail.js';

const LIFE = 120; // seconds a mark takes to fade away
const MIN_STEP = 0.7; // metres between quads of a streak

export class SkidMarks {
  constructor(scene) {
    this.max = DETAIL.lite ? 700 : 1600;
    this.head = 0;
    this.live = 0;
    this.born = new Float32Array(this.max);
    this.alpha = new Float32Array(this.max);
    this.time = 0;
    this.fadeT = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(this.max * 12), 3);
    this.col = new THREE.BufferAttribute(new Float32Array(this.max * 16), 4);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.col.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.max * 4; i++) this.col.setXYZW(i, 0.05, 0.05, 0.05, 0);
    const idx = new Uint32Array(this.max * 6);
    for (let q = 0; q < this.max; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    g.setAttribute('position', this.pos);
    g.setAttribute('color', this.col);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'skids';
    this.mesh.visible = false;
    g.setDrawRange(0, 0);
    scene.add(this.mesh);
  }

  quad(ax, az, bx, bz, y, w, a) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, px = (-dz / l) * w, pz = (dx / l) * w;
    const q = this.head, P = this.pos.array, o = q * 12;
    P[o] = ax - px; P[o + 1] = y; P[o + 2] = az - pz;
    P[o + 3] = ax + px; P[o + 4] = y; P[o + 5] = az + pz;
    P[o + 6] = bx + px; P[o + 7] = y; P[o + 8] = bz + pz;
    P[o + 9] = bx - px; P[o + 10] = y; P[o + 11] = bz - pz;
    for (let k = 0; k < 4; k++) this.col.array[q * 16 + k * 4 + 3] = a;
    this.born[q] = this.time; this.alpha[q] = a;
    this.pos.addUpdateRange(o, 12); this.pos.needsUpdate = true;
    this.col.addUpdateRange(q * 16, 16); this.col.needsUpdate = true;
    this.head = (q + 1) % this.max;
    this.live = Math.min(this.max, this.live + 1);
    this.mesh.geometry.setDrawRange(0, this.live * 6);
    this.mesh.visible = true;
  }

  // Lay marks under a vehicle's sliding tyres (rear pair, all four when the brakes lock up).
  track(v) {
    const s = v.spec;
    const on = v.skid > 0.15 && !v.airborne && !v.tipped && v.surface === 1 && (v.waterDepth || 0) < 0.05;
    if (!on) { v._skidAt = null; return; }
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading), lx = fz, lz = -fx;
    const rear = -s.wheelbase * 0.5, front = s.wheelbase * 0.5;
    const track = s.twoWheeler ? [0] : [-1, 1].map((k) => k * (s.width / 2 - 0.25));
    const wheels = [];
    for (const t of track) {
      wheels.push([v.x + fx * rear + lx * t, v.z + fz * rear + lz * t]);
      if (v.braking && !s.twoWheeler) wheels.push([v.x + fx * front + lx * t, v.z + fz * front + lz * t]);
    }
    const prev = v._skidAt;
    if (prev && prev.length === wheels.length && Math.hypot(wheels[0][0] - prev[0][0], wheels[0][1] - prev[0][1]) < MIN_STEP) return;
    if (prev && prev.length === wheels.length && Math.hypot(wheels[0][0] - prev[0][0], wheels[0][1] - prev[0][1]) < 6) {
      const a = 0.25 + 0.4 * Math.min(1, v.skid), w = s.twoWheeler ? 0.07 : s.length > 7 ? 0.17 : 0.12;
      for (let k = 0; k < wheels.length; k++) this.quad(prev[k][0], prev[k][1], wheels[k][0], wheels[k][1], v.y + 0.03, w, a);
    }
    v._skidAt = wheels;
  }

  update(dt) {
    this.time += dt;
    if (!this.live || (this.fadeT -= dt) > 0) return;
    this.fadeT = 1;
    const C = this.col.array;
    let any = false;
    for (let q = 0; q < this.live; q++) {
      if (this.alpha[q] <= 0) continue;
      const a = this.alpha[q] * Math.max(0, 1 - (this.time - this.born[q]) / LIFE);
      if (a <= 0.004) this.alpha[q] = 0;
      else any = true;
      for (let k = 0; k < 4; k++) C[q * 16 + k * 4 + 3] = a;
    }
    this.mesh.visible = any;
    this.col.clearUpdateRanges();
    this.col.needsUpdate = true;
  }
}
