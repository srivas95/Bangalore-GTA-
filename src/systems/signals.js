// Traffic signals at major junctions: a fixed cycle with an all-red pedestrian phase.
import * as THREE from 'three';
import { BuilderSet } from '../world/meshBuilder.js';
import { put } from '../world/landmarks.js';
import { createHuman } from '../entities/human.js';
import { mulberry32 } from '../world/textures.js';

// Cycle (seconds): x-road green, amber, all-red, z-road green, amber, pedestrian phase.
const G = 18, A = 3, AR = 2, PED = 10;
const CYCLE = G + A + AR + G + A + PED;
const rng = mulberry32(31337);

export class Signals {
  constructor(scene, layout) {
    this.layout = layout;
    this.nodes = layout.nodes.filter((n) => n.signal);
    this.time = 0;
    for (const n of this.nodes) n.sigOffset = rng() * CYCLE;
    this.buildVisuals(scene);
  }

  phaseTime(node) {
    return (this.time + node.sigOffset) % CYCLE;
  }

  // State for traffic travelling along a road with the given axis ('x' = north-south road).
  state(node, axis) {
    if (!node.signal) return 'green';
    const t = this.phaseTime(node);
    const first = axis === 'x';
    if (t < G) return first ? 'green' : 'red';
    if (t < G + A) return first ? 'amber' : 'red';
    if (t < G + A + AR) return 'red';
    if (t < G + A + AR + G) return first ? 'red' : 'green';
    if (t < G + A + AR + G + A) return first ? 'red' : 'amber';
    return 'red';
  }

  // Seconds since this approach turned red (large if not red).
  redAge(node, axis) {
    const t = this.phaseTime(node);
    const redStart = axis === 'x' ? G + A : G + A + AR + G + A;
    const age = (t - redStart + CYCLE) % CYCLE;
    return this.state(node, axis) === 'red' ? age : 999;
  }

  pedPhase(node) {
    return node.signal && this.phaseTime(node) >= CYCLE - PED;
  }

  pedTimeLeft(node) {
    return CYCLE - this.phaseTime(node);
  }

  buildVisuals(scene) {
    const B = new BuilderSet();
    const pole = B.get('metal');
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 6);
    this.heads = []; // {node, axis, base index}
    const bulbs = [];
    for (const n of this.nodes) {
      // One signal per approach, on the left kerb before the junction (traffic keeps left).
      const appr = [
        { axis: 'x', x: n.x + n.hx + 1.0, z: n.z - n.hz - 4.5, face: Math.PI },      // southbound traffic, from the north
        { axis: 'x', x: n.x - n.hx - 1.0, z: n.z + n.hz + 4.5, face: 0 },            // northbound, from the south
        { axis: 'z', x: n.x - n.hx - 4.5, z: n.z - n.hz - 1.0, face: -Math.PI / 2 }, // eastbound, from the west
        { axis: 'z', x: n.x + n.hx + 4.5, z: n.z + n.hz + 1.0, face: Math.PI / 2 },  // westbound, from the east
      ];
      for (const a of appr) {
        put(pole, cyl, a.x, 2.3, a.z, 0x2a2a2a, 0, 0.08, 4.4, 0.08);
        const fx = Math.sin(a.face), fz = Math.cos(a.face);
        pole.box(a.x + fx * 0.12, 3.6, a.z + fz * 0.12, 0.38, 1.15, 0.38, 0x1a1a1a);
        const head = { node: n, axis: a.axis, base: bulbs.length };
        for (let k = 0; k < 3; k++) bulbs.push([a.x + fx * 0.32, 4.0 - k * 0.37, a.z + fz * 0.32]);
        this.heads.push(head);
      }
      if (n.name) this.addTrafficCop(scene, n);
    }
    B.buildAll({ metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }) }, scene, {}, 320);
    const geo = new THREE.SphereGeometry(0.13, 8, 6);
    this.bulbs = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), bulbs.length);
    const m = new THREE.Matrix4();
    bulbs.forEach((p, k) => { m.makeTranslation(p[0], p[1], p[2]); this.bulbs.setMatrixAt(k, m); this.bulbs.setColorAt(k, new THREE.Color(0x222222)); });
    this.bulbs.computeBoundingSphere();
    scene.add(this.bulbs);
    this.cOn = [new THREE.Color(3, 0.15, 0.1), new THREE.Color(3, 1.6, 0.1), new THREE.Color(0.1, 2.6, 0.6)];
    this.cOff = [new THREE.Color(0.18, 0.04, 0.04), new THREE.Color(0.18, 0.12, 0.03), new THREE.Color(0.03, 0.14, 0.05)];
  }

  // A traffic constable on a raised platform under an umbrella, waving traffic through.
  addTrafficCop(scene, n) {
    const h = createHuman({ outfit: 'police' }, rng);
    const x = n.x + n.hx + 2.5, z = n.z + n.hz + 2.5;
    h.group.position.set(x, 0.6, z);
    h.group.rotation.y = -Math.PI * 0.75;
    const b = new BuilderSet();
    put(b.get('m'), new THREE.CylinderGeometry(1, 1.1, 1, 10), x, 0.3, z, 0xf2f2f2, 0, 0.9, 0.6, 0.9);
    put(b.get('m'), new THREE.CylinderGeometry(1, 1, 1, 6), x, 2.0, z, 0x555555, 0, 0.04, 2.8, 0.04);
    put(b.get('m'), new THREE.ConeGeometry(1, 1, 8), x, 3.5, z, 0xd02a2a, 0, 1.3, 0.5, 1.3);
    b.buildAll({ m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }) }, scene);
    scene.add(h.group);
    (this.cops || (this.cops = [])).push({ h, n });
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
        const go = this.state(c.n, 'x') === 'green';
        b.shR.rotation.z = -1.5; b.elR.rotation.y = Math.sin(t * 3) * 0.8;
        b.shL.rotation.x = go ? -1.4 : -0.2; b.chest.rotation.y = go ? 0.6 : -0.6;
      }
    }
  }
}
