// Footpath pedestrians, chai stalls and the city's most important road users: cows.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createHuman, animateWalk, poseIdle, poseDown } from './human.js';
import { MeshBuilder, BuilderSet } from '../world/meshBuilder.js';
import { put } from '../world/landmarks.js';
import { mulberry32 } from '../world/textures.js';
import { SIDEWALK_W, CURB_H, LINES } from '../config.js';

const rng = mulberry32(99);
const rand = (a = 0, b = 1) => a + (b - a) * rng();

function loopFor(block) {
  const o = block.outer, m = SIDEWALK_W * 0.5;
  const r = { minX: o.minX + m, maxX: o.maxX - m, minZ: o.minZ + m, maxZ: o.maxZ - m };
  const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
  return { ...r, w, d, len: 2 * (w + d) };
}

function loopPoint(L, t, lat) {
  t = ((t % L.len) + L.len) % L.len;
  // Clockwise from the NW corner; lateral offset pushes outward toward the kerb.
  if (t < L.w) return { x: L.minX + t, z: L.minZ - lat, h: Math.PI / 2 };
  t -= L.w;
  if (t < L.d) return { x: L.maxX + lat, z: L.minZ + t, h: 0 };
  t -= L.d;
  if (t < L.w) return { x: L.maxX - t, z: L.maxZ + lat, h: -Math.PI / 2 };
  t -= L.w;
  return { x: L.minX - lat, z: L.maxZ - t, h: Math.PI };
}

function nearestT(L, x, z) {
  const cands = [
    [Math.max(0, Math.min(L.w, x - L.minX)), Math.abs(z - L.minZ)],
    [L.w + Math.max(0, Math.min(L.d, z - L.minZ)), Math.abs(x - L.maxX)],
    [L.w + L.d + Math.max(0, Math.min(L.w, L.maxX - x)), Math.abs(z - L.maxZ)],
    [2 * L.w + L.d + Math.max(0, Math.min(L.d, L.maxZ - z)), Math.abs(x - L.minX)],
  ];
  cands.sort((a, b) => a[1] - b[1]);
  return cands[0][0];
}

export class StreetLife {
  constructor(scene, layout, colliders, count = 90) {
    this.scene = scene;
    this.layout = layout;
    this.colliders = colliders;
    this.peds = [];
    this.cows = [];
    this.loops = layout.blocks.filter((b) => !b.edge).map((b) => ({ block: b, L: loopFor(b) }));
    for (let k = 0; k < count; k++) this.spawnWalker();
    this.buildChaiStalls();
    for (let k = 0; k < 9; k++) this.spawnCow();
  }

  spawnWalker() {
    const lp = this.loops[Math.floor(rng() * this.loops.length)];
    const h = createHuman({}, rng);
    this.scene.add(h.group);
    const p = {
      h, L: lp.L, t: rand(0, lp.L.len), dir: rng() < 0.5 ? 1 : -1, speed: rand(1.0, 1.6), lat: rand(-1.2, 1.2),
      state: 'walk', x: 0, z: 0, y: CURB_H, vx: 0, vy: 0, vz: 0, timer: 0, r: 0.3,
    };
    const q = loopPoint(p.L, p.t, p.lat);
    p.x = q.x; p.z = q.z;
    this.peds.push(p);
    return p;
  }

  // People standing around a tea cart.
  buildChaiStalls() {
    const B = new BuilderSet();
    const stalls = this.loops.filter((l) => ['commercial', 'market', 'mixed', 'towers'].includes(l.block.zone)).slice(0, 40).filter((_, k) => k % 2 === 0);
    for (const lp of stalls) {
      const t = rand(0, lp.L.len);
      const q = loopPoint(lp.L, t, 0.6);
      const m = B.get('m');
      m.box(q.x, CURB_H, q.z, 1.4, 0.9, 0.8, 0x6a4a2a);
      m.box(q.x, CURB_H + 0.9, q.z, 1.5, 0.08, 0.9, 0xc0c0c0);
      put(m, new THREE.CylinderGeometry(0.15, 0.15, 0.3, 10), q.x - 0.3, CURB_H + 1.1, q.z, 0xb0b0b0);
      put(m, new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), q.x, CURB_H + 1.7, q.z, 0x555555);
      put(m, new THREE.ConeGeometry(1.3, 0.5, 10), q.x, CURB_H + 2.5, q.z, rng() < 0.5 ? 0xd03a2a : 0x2a6ad0);
      this.colliders.addCentered(q.x, q.z, 1.4, 0.8, 1.2, 'prop');
      for (let k = 0; k < 3; k++) {
        const h = createHuman({}, rng);
        const a = (k / 3) * Math.PI * 2 + rand(0, 1);
        const p = { h, L: lp.L, t, dir: 1, speed: 0, lat: 0, state: 'idle', x: q.x + Math.cos(a) * 1.4, z: q.z + Math.sin(a) * 1.2, y: CURB_H, vx: 0, vy: 0, vz: 0, timer: 0, r: 0.3 };
        h.group.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
        this.scene.add(h.group);
        this.peds.push(p);
      }
    }
    B.buildAll({ m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }) }, this.scene);
  }

  spawnCow() {
    const roads = this.layout.roads;
    const r = roads[Math.floor(rng() * roads.length)];
    const along = rand(-380, 380);
    const lat = (r.width / 2 - 1.2) * (rng() < 0.5 ? -1 : 1);
    const x = r.axis === 'x' ? r.pos + lat : along, z = r.axis === 'x' ? along : r.pos + lat;
    const group = makeCow();
    group.position.set(x, 0, z);
    group.rotation.y = r.axis === 'x' ? 0 : Math.PI / 2;
    this.scene.add(group);
    this.cows.push({ group, x, z, h: group.rotation.y, r: 1.0, timer: rand(2, 10), moving: false, isCow: true });
  }

  // A carjacked driver bolts away from the player.
  spawnFleeing(x, z, fromX, fromZ, opts = {}) {
    const h = createHuman(opts, rng);
    this.scene.add(h.group);
    const a = Math.atan2(x - fromX, z - fromZ);
    const p = { h, L: null, t: 0, dir: 1, speed: 4.5, lat: 0, state: 'flee', x, z, y: 0, vx: Math.sin(a) * 4.5, vz: Math.cos(a) * 4.5, vy: 0, timer: 7, r: 0.3, temp: true };
    this.peds.push(p);
    return p;
  }

  knock(p, vx, vz, audio) {
    if (p.state === 'down') return;
    p.state = 'down';
    p.vx = vx * 0.7 + rand(-1, 1);
    p.vz = vz * 0.7 + rand(-1, 1);
    p.vy = 2.5 + Math.hypot(vx, vz) * 0.15;
    p.timer = 4;
    audio?.thud(0.6);
  }

  update(dt, world) {
    const { focus, vehicles, audio, hud } = world;
    const t = performance.now() / 1000;
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      const far = Math.abs(p.x - focus.x) > 160 || Math.abs(p.z - focus.z) > 160;
      p.h.group.visible = !far;
      if (far && p.state !== 'flee') {
        if (p.state === 'walk') p.t += p.dir * p.speed * dt;
        continue;
      }
      // Vehicle hits.
      if (p.state !== 'down') {
        for (const v of vehicles) {
          if (v.speed < 3) continue;
          const dx = p.x - v.x, dz = p.z - v.z;
          if (dx * dx + dz * dz > 49) continue;
          for (const c of v.circles(this._c || (this._c = []))) {
            if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < (c.r + p.r) ** 2) {
              this.knock(p, v.vx, v.vz, audio);
              if (v.driver === 'player' && rng() < 0.6) hud?.say(LINES.bumped[Math.floor(rng() * LINES.bumped.length)], 2.5);
              break;
            }
          }
          if (p.state === 'down') break;
        }
        // Dodge fast vehicles heading at us.
        if (p.state === 'walk' || p.state === 'idle') {
          for (const v of vehicles) {
            if (v.driver !== 'player' || v.speed < 6) continue;
            const dx = p.x - v.x, dz = p.z - v.z, d2 = dx * dx + dz * dz;
            if (d2 > 64) continue;
            const ahead = (dx * v.vx + dz * v.vz) / v.speed;
            if (ahead > 0) { p.state = 'dodge'; p.timer = 0.6; const lx = v.vz / v.speed, lz = -v.vx / v.speed; const s = Math.sign(dx * lx + dz * lz) || 1; p.vx = lx * s * 5; p.vz = lz * s * 5; }
          }
        }
      }

      switch (p.state) {
        case 'walk': {
          p.t += p.dir * p.speed * dt;
          const q = loopPoint(p.L, p.t, p.lat);
          const dx = q.x - p.x, dz = q.z - p.z;
          p.x = q.x; p.z = q.z;
          if (dx * dx + dz * dz > 1e-6) {
            const target = Math.atan2(dx, dz);
            let dh = target - p.h.group.rotation.y;
            while (dh > Math.PI) dh -= Math.PI * 2;
            while (dh < -Math.PI) dh += Math.PI * 2;
            p.h.group.rotation.y += dh * Math.min(1, dt * 8);
          }
          animateWalk(p.h, dt, p.speed);
          if (rng() < dt * 0.01) p.dir *= -1;
          break;
        }
        case 'idle':
          poseIdle(p.h, t);
          break;
        case 'dodge':
        case 'flee': {
          p.x += p.vx * dt; p.z += p.vz * dt;
          const hit = this.colliders.resolveCircle(p.x, p.z, p.r, 0);
          if (hit) { p.x = hit.x; p.z = hit.z; if (p.state === 'flee') { const a = Math.atan2(p.vx, p.vz) + (rng() < 0.5 ? 1.2 : -1.2); p.vx = Math.sin(a) * 4.5; p.vz = Math.cos(a) * 4.5; } }
          p.h.group.rotation.y = Math.atan2(p.vx, p.vz);
          animateWalk(p.h, dt, Math.hypot(p.vx, p.vz));
          p.timer -= dt;
          if (p.timer <= 0) {
            if (p.temp) { this.scene.remove(p.h.group); this.peds.splice(i, 1); continue; }
            p.state = 'walk';
            p.t = nearestT(p.L, p.x, p.z);
            p.lat = 0;
          }
          break;
        }
        case 'down': {
          p.vy -= 9.8 * dt;
          p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
          const g = this.layout.groundHeight(p.x, p.z);
          if (p.y <= g) { p.y = g; p.vy = 0; p.vx *= Math.exp(-6 * dt); p.vz *= Math.exp(-6 * dt); }
          const hit = this.colliders.resolveCircle(p.x, p.z, p.r, 0);
          if (hit) { p.x = hit.x; p.z = hit.z; p.vx *= -0.3; p.vz *= -0.3; }
          p.h.group.rotation.x += (-Math.PI / 2 - p.h.group.rotation.x) * Math.min(1, dt * 8);
          poseDown(p.h);
          p.timer -= dt;
          if (p.timer <= 0) {
            p.h.group.rotation.x = 0;
            p.h.arms[0].rotation.z = p.h.arms[1].rotation.z = 0;
            if (p.L) { p.state = 'flee'; p.timer = 3; const a = rng() * Math.PI * 2; p.vx = Math.sin(a) * 4; p.vz = Math.cos(a) * 4; }
            else { p.state = 'flee'; p.timer = 4; }
          }
          break;
        }
      }
      if (p.state !== 'down') p.y = this.layout.groundHeight(p.x, p.z);
      p.h.group.position.set(p.x, p.y, p.z);
    }

    for (const c of this.cows) {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.moving = !c.moving && rng() < 0.5;
        c.timer = c.moving ? rand(3, 8) : rand(5, 15);
        if (rng() < 0.3) audio?.moo(c.x, c.z, world.camera);
      }
      if (c.moving) {
        const nx = c.x + Math.sin(c.h) * 0.4 * dt, nz = c.z + Math.cos(c.h) * 0.4 * dt;
        if (this.layout.roadAt(nx, nz)) { c.x = nx; c.z = nz; } else c.h += Math.PI;
        c.group.position.set(c.x, 0, c.z);
        c.group.rotation.y = c.h;
      }
      // Gentle head bob.
      const head = c.group.userData.head;
      if (head) head.rotation.x = c.moving ? Math.sin(t * 3) * 0.08 : 0.25 + Math.sin(t * 0.7 + c.x) * 0.15;
    }
  }

  // Obstacles that traffic must yield to (people on the road, cows).
  collectObstacles(out) {
    for (const c of this.cows) out.push(c);
    // Pedestrians on the carriageway (footpaths are raised by the kerb height).
    for (const p of this.peds) if (p.h.group.visible && p.y < 0.05) out.push(p);
  }
}

function makeCow() {
  const b = new MeshBuilder();
  const white = rng() < 0.7 ? 0xece8e0 : 0x8a6a4a;
  const rb = new RoundedBoxGeometry(1, 1, 1, 2, 0.25);
  put(b, rb, 0, 1.05, 0, white, 0, 0.75, 0.75, 1.7);
  put(b, rb, 0, 1.5, 0.45, white, 0, 0.45, 0.35, 0.45); // zebu hump
  for (const [x, z] of [[-0.25, 0.6], [0.25, 0.6], [-0.25, -0.6], [0.25, -0.6]]) put(b, rb, x, 0.4, z, white, 0, 0.14, 0.85, 0.14);
  put(b, rb, 0, 0.8, -0.86, white, 0, 0.06, 0.6, 0.06, 0.3);
  const body = b.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  const hb = new MeshBuilder();
  put(hb, rb, 0, 0, 0.3, white, 0, 0.32, 0.36, 0.6);
  put(hb, rb, 0, -0.05, 0.62, 0x6a5a50, 0, 0.26, 0.24, 0.12);
  for (const s of [-1, 1]) {
    put(hb, new THREE.ConeGeometry(0.04, 0.32, 6), s * 0.14, 0.26, 0.15, 0xd8c8a8, 0, 1, 1, 1, 0, -s * 0.5);
    put(hb, rb, s * 0.22, 0.06, 0.12, white, 0, 0.18, 0.06, 0.1);
  }
  const head = hb.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  head.position.set(0, 1.25, 0.85);
  const g = new THREE.Group();
  g.add(body, head);
  g.userData.head = head;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
