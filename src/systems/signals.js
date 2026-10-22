// Traffic signals at major junctions: approaches are grouped by direction (opposite arms share
// a phase), each group gets green in turn, then an all-red pedestrian phase.
import * as THREE from 'three';
import { BuilderSet } from '../world/meshBuilder.js';
import { put } from '../world/landmarks.js';
import { createHuman } from '../entities/human.js';
import { withAO } from '../world/ao.js';
import { mulberry32 } from '../world/textures.js';

// Per group: green, amber, all-red. Then the pedestrian phase.
const G = 18, A = 3, AR = 2, PED = 10;
const SLOT = G + A + AR;
const rng = mulberry32(31337);

export class Signals {
  constructor(scene, layout) {
    this.layout = layout;
    this.nodes = layout.nodes.filter((n) => n.signal);
    this.time = 0;
    for (const n of this.nodes) {
      // Opposite arms (roughly 180° apart) share a group.
      n.sigGroup = new Map();
      let g = 0;
      const left = n.adj.slice();
      while (left.length) {
        const h = left.shift();
        n.sigGroup.set(h.e.id, g);
        let best = -1, bd = -0.6;
        left.forEach((q, i) => { const d = -(h.u.x * q.u.x + h.u.z * q.u.z); if (d > bd + 0.0) { bd = d; best = i; } });
        if (best >= 0 && bd > 0.6) n.sigGroup.set(left.splice(best, 1)[0].e.id, g);
        g++;
      }
      n.sigN = g;
      n.cycle = g * SLOT + PED;
      n.sigOffset = rng() * n.cycle;
    }
    this.buildVisuals(scene);
  }

  phaseTime(node) {
    return (this.time + node.sigOffset) % node.cycle;
  }

  // State for traffic arriving at `node` along undirected edge `edgeId`.
  state(node, edgeId) {
    if (!node.signal) return 'green';
    const t = this.phaseTime(node);
    const g = typeof edgeId === 'number' && node.sigGroup.has(edgeId) ? node.sigGroup.get(edgeId) : edgeId === 'first' ? 0 : -1;
    if (g < 0) return 'green';
    const k = Math.floor(t / SLOT), u = t - k * SLOT;
    if (k !== g) return 'red';
    return u < G ? 'green' : u < G + A ? 'amber' : 'red';
  }

  // Seconds since this approach turned red (large if not red).
  redAge(node, edgeId) {
    if (this.state(node, edgeId) !== 'red') return 999;
    const g = node.sigGroup.get(edgeId) ?? 0;
    const redStart = g * SLOT + G + A;
    return (this.phaseTime(node) - redStart + node.cycle) % node.cycle;
  }

  pedPhase(node) {
    return node.signal && this.phaseTime(node) >= node.cycle - PED;
  }

  pedTimeLeft(node) {
    return node.cycle - this.phaseTime(node);
  }

  buildVisuals(scene) {
    const B = new BuilderSet({ chunk: 320, release: true });
    const pole = B.get('metal');
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 6);
    this.heads = []; // {node, axis, base index}
    const bulbs = [];
    for (const n of this.nodes) {
      // One signal per approach, on the left kerb before the junction (traffic keeps left),
      // facing the oncoming traffic.
      for (const h of n.adj) {
        const cut = n.cut.get(h.e.id) || 0;
        const px = -h.u.z, pz = h.u.x;
        const a = { axis: h.e.id, x: n.x + h.u.x * (cut + 4.5) + px * (h.w + 1.0), z: n.z + h.u.z * (cut + 4.5) + pz * (h.w + 1.0) };
        put(pole, cyl, a.x, 2.3, a.z, 0x2a2a2a, 0, 0.08, 4.4, 0.08);
        const fx = h.u.x, fz = h.u.z;
        pole.box(a.x + fx * 0.12, 3.6, a.z + fz * 0.12, 0.38, 1.15, 0.38, 0x1a1a1a);
        const head = { node: n, axis: a.axis, base: bulbs.length };
        for (let k = 0; k < 3; k++) bulbs.push([a.x + fx * 0.32, 4.0 - k * 0.37, a.z + fz * 0.32]);
        this.heads.push(head);
      }
      if (n.name) this.addTrafficCop(scene, n);
    }
    B.buildAll({ metal: withAO(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 })) }, scene);
    const geo = new THREE.IcosahedronGeometry(0.13, 0); // (unlit: only the outline shows, so 20 faces will do)
    this.bulbs = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), bulbs.length);
    const m = new THREE.Matrix4();
    bulbs.forEach((p, k) => { m.makeTranslation(p[0], p[1], p[2]); this.bulbs.setMatrixAt(k, m); this.bulbs.setColorAt(k, new THREE.Color(0x222222)); });
    this.bulbs.computeBoundingSphere();
    scene.add(this.bulbs);
    this.cOn = [new THREE.Color(3, 0.15, 0.1), new THREE.Color(3, 1.6, 0.1), new THREE.Color(0.1, 2.6, 0.6)];
    this.bulbPos = bulbs;
    this.haloCol = [new THREE.Color(1, 0.08, 0.04), new THREE.Color(1, 0.5, 0.04), new THREE.Color(0.08, 1, 0.35)];
    this.cOff = [new THREE.Color(0.18, 0.04, 0.04), new THREE.Color(0.18, 0.12, 0.03), new THREE.Color(0.03, 0.14, 0.05)];
  }

  // A traffic constable on a raised platform under an umbrella, waving traffic through.
  addTrafficCop(scene, n) {
    const h = createHuman({ outfit: 'police' }, rng);
    const c = n.corners[0];
    const dx = c.x - n.x, dz = c.z - n.z, l = Math.hypot(dx, dz) || 1;
    const x = c.x + (dx / l) * 2.2, z = c.z + (dz / l) * 2.2;
    h.group.position.set(x, 0.6, z);
    h.group.rotation.y = Math.atan2(n.x - x, n.z - z);
    const b = new BuilderSet();
    put(b.get('m'), new THREE.CylinderGeometry(1, 1.1, 1, 10), x, 0.3, z, 0xf2f2f2, 0, 0.9, 0.6, 0.9);
    put(b.get('m'), new THREE.CylinderGeometry(1, 1, 1, 6), x, 2.0, z, 0x555555, 0, 0.04, 2.8, 0.04);
    put(b.get('m'), new THREE.ConeGeometry(1, 1, 8), x, 3.5, z, 0xd02a2a, 0, 1.3, 0.5, 1.3);
    b.buildAll({ m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }) }, scene);
    scene.add(h.group);
    (this.cops || (this.cops = [])).push({ h, n });
  }

  // The lit bulb of every signal head within r of (x, z): f(x, y, z, colour).
  forLitBulbs(x, z, r, f) {
    for (const head of this.heads) {
      if (Math.abs(head.node.x - x) > r || Math.abs(head.node.z - z) > r) continue;
      const s = this.state(head.node, head.axis);
      const on = s === 'red' ? 0 : s === 'amber' ? 1 : 2;
      const p = this.bulbPos[head.base + on];
      f(p[0], p[1], p[2], this.haloCol[on]);
    }
  }

  update(dt, focus) {
    this.time += dt;
    const col = this.bulbs.instanceColor;
    for (const head of this.heads) {
      if (Math.abs(head.node.x - focus.x) > 400 || Math.abs(head.node.z - focus.z) > 400) continue;
      const s = this.state(head.node, head.axis);
      const on = s === 'red' ? 0 : s === 'amber' ? 1 : 2;
      for (let k = 0; k < 3; k++) this.bulbs.setColorAt(head.base + k, k === on ? this.cOn[k] : this.cOff[k]);
    }
    col.needsUpdate = true;
    if (this.cops) {
      const t = this.time;
      for (const c of this.cops) {
        const b = c.h.bones;
        for (const k in b) b[k].rotation.set(0, 0, 0);
        // Wave the green-light direction through.
        const go = this.state(c.n, 'first') === 'green';
        b.shR.rotation.z = -1.5; b.elR.rotation.y = Math.sin(t * 3) * 0.8;
        b.shL.rotation.x = go ? -1.4 : -0.2; b.chest.rotation.y = go ? 0.6 : -0.6;
      }
    }
  }
}
