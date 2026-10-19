// Weapons of the Bengaluru underworld: mostly blades and sticks, the odd country-made
// pistol. Stats, hand-held models, bullet hit-tests, and pickups lying around the city.
import * as THREE from 'three';
import { MeshBuilder } from '../world/meshBuilder.js';
import { put } from '../world/landmarks.js';

// kind: melee | gun. pose: punch | overhead | swing | stab. lethal weapons kill instead of
// knocking people down. Guns: clip, reload (s), rate (s between shots), spread (rad), misfire.
export const WEAPONS = {
  fists: { name: 'Fists', kind: 'melee', dmg: 26, range: 1.35, t: 0.42, pose: 'punch' },
  lathi: { name: 'Lathi', kn: 'ಲಾಠಿ', kind: 'melee', dmg: 34, range: 2.0, t: 0.62, pose: 'overhead' },
  bat: { name: 'Cricket Bat', kn: 'ಬ್ಯಾಟ್', kind: 'melee', dmg: 42, range: 1.9, t: 0.6, pose: 'swing' },
  chain: { name: 'Cycle Chain', kn: 'ಚೈನ್', kind: 'melee', dmg: 26, range: 2.1, t: 0.42, pose: 'swing' },
  knife: { name: 'Chaaku', kn: 'ಚಾಕು', kind: 'melee', dmg: 50, range: 1.35, t: 0.34, pose: 'stab', lethal: true },
  sickle: { name: 'Kudugolu (Sickle)', kn: 'ಕುಡುಗೋಲು', kind: 'melee', dmg: 60, range: 1.6, t: 0.5, pose: 'swing', lethal: true },
  machete: { name: '"Long" (Machete)', kn: 'ಲಾಂಗ್', kind: 'melee', dmg: 78, range: 1.95, t: 0.66, pose: 'overhead', lethal: true },
  katta: { name: 'Nadan Katta', kn: 'ಕಟ್ಟಾ', kind: 'gun', dmg: 75, range: 32, spread: 0.05, clip: 1, reload: 2.3, rate: 0.5, misfire: 0.12, lethal: true },
  revolver: { name: '.32 Revolver', kn: 'ರಿವಾಲ್ವರ್', kind: 'gun', dmg: 46, range: 45, spread: 0.022, clip: 6, reload: 2.6, rate: 0.32, misfire: 0, lethal: true },
};
export const WEAPON_ORDER = ['fists', 'lathi', 'bat', 'chain', 'knife', 'sickle', 'machete', 'katta', 'revolver'];

// ---------- models ----------
// Melee weapons extend along +z from the fist (perpendicular to the forearm); guns point
// along -y, down the forearm, so an outstretched arm aims them.
const geo = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 8) };
const weaponMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 });
const meshCache = new Map();

function weaponGeometry(key) {
  const b = new MeshBuilder();
  const steel = 0xc8ccd0, wood = 0x7a4a24, black = 0x1a1a1a;
  const along = (g, c, z0, len, w, h, x = 0, y = 0) => (g === geo.cyl
    ? put(b, g, x, y, z0 + len / 2, c, 0, w, len, w, Math.PI / 2) // cylinders stand along y: lay them down
    : put(b, g, x, y, z0 + len / 2, c, 0, w, h, len));
  switch (key) {
    case 'lathi': along(geo.cyl, 0x9a6a32, -0.2, 1.05, 0.018, 0.018); break;
    case 'bat':
      along(geo.cyl, 0x2a2a2a, -0.05, 0.28, 0.018, 0.018);
      along(geo.box, 0xe6d3a3, 0.22, 0.56, 0.1, 0.035);
      break;
    case 'chain':
      for (let k = 0; k < 10; k++) put(b, geo.box, 0, -0.01 * k * k * 0.06, 0.05 + k * 0.06, k % 2 ? 0x555555 : 0x777777, 0, 0.02, 0.012, 0.07);
      along(geo.cyl, black, -0.06, 0.1, 0.02, 0.02);
      break;
    case 'knife':
      along(geo.box, black, -0.04, 0.11, 0.025, 0.03);
      along(geo.box, steel, 0.07, 0.17, 0.006, 0.03, 0, 0.002);
      break;
    case 'sickle': {
      along(geo.cyl, wood, -0.06, 0.16, 0.017, 0.017);
      // A crescent blade: short segments around an arc.
      for (let k = 0; k < 7; k++) {
        const a = -0.3 + k * 0.42, r = 0.13;
        put(b, geo.box, 0, Math.sin(a) * r + 0.02, 0.1 + 0.13 + Math.cos(a) * r * 0.9 - 0.1, steel, 0, 0.006, 0.03, 0.07, a);
      }
      break;
    }
    case 'machete':
      along(geo.box, wood, -0.05, 0.14, 0.03, 0.035);
      along(geo.box, steel, 0.09, 0.5, 0.006, 0.06, 0, 0.01);
      put(b, geo.box, 0, 0.02, 0.6, steel, 0, 0.006, 0.08, 0.04);
      break;
    case 'katta':
      // Crude: a pipe barrel, a wooden grip, a wire trigger guard.
      put(b, geo.cyl, 0, -0.1, 0.02, 0x4a4a48, 0, 0.016, 0.22, 0.016);
      put(b, geo.box, 0, 0.02, -0.04, wood, 0, 0.03, 0.06, 0.1, -0.5);
      put(b, geo.box, 0, -0.02, 0.0, 0x333333, 0, 0.005, 0.04, 0.03);
      break;
    case 'revolver':
      put(b, geo.cyl, 0, -0.1, 0.03, black, 0, 0.011, 0.14, 0.011);
      put(b, geo.cyl, 0, -0.02, 0.03, 0x2a2a2a, 0, 0.022, 0.05, 0.022);
      put(b, geo.box, 0, 0.03, -0.03, 0x5a3a20, 0, 0.026, 0.05, 0.09, -0.45);
      break;
    default: return null;
  }
  return b.geometry();
}

export function weaponMesh(key) {
  if (!meshCache.has(key)) meshCache.set(key, weaponGeometry(key));
  const g = meshCache.get(key);
  if (!g) return null;
  const m = new THREE.Mesh(g, weaponMat);
  return m;
}

// Put a weapon in a human's right hand (replacing whatever was there).
export function equip(human, key) {
  if (human.weaponMesh) { human.weaponMesh.parent?.remove(human.weaponMesh); human.weaponMesh = null; }
  const m = weaponMesh(key);
  if (!m) return;
  m.position.set(0, -0.285, 0.02); // in the fist, relative to the right elbow bone
  human.bones.elR.add(m);
  human.weaponMesh = m;
}

// World position of the gun muzzle (or the hand).
const _v = new THREE.Vector3();
export function muzzle(human) {
  const m = human.weaponMesh || human.bones.elR;
  m.updateWorldMatrix(true, false);
  return _v.set(0, human.weaponMesh ? -0.22 : -0.29, 0.02).applyMatrix4(m.matrixWorld).clone();
}

// ---------- bullets ----------
// Trace a ray against people (vertical capsules), vehicles (oriented boxes), buildings and
// the ground. Returns {t, x, y, z, kind: 'person'|'vehicle'|'wall'|'ground', target, head}.
export function raycast(world, o, d, maxT, ignore) {
  let best = { t: maxT, kind: null };
  const consider = (t, kind, target, extra) => { if (t > 0.05 && t < best.t) best = { t, kind, target, ...extra }; };
  const people = [];
  for (const p of world.streetLife.peds) if (p.h.group.visible) people.push(p);
  for (const c of world.police?.cops || []) people.push(c);
  for (const e of world.gangs?.members || []) people.push(e);
  if (world.player && !world.player.vehicle) people.push(world.player);
  for (const p of people) {
    if (p === ignore) continue;
    // Closest approach of the ray to the person's vertical axis.
    const px = p.x - o.x, pz = p.z - o.z;
    const dh = d.x * d.x + d.z * d.z;
    if (dh < 1e-6) continue;
    const t = (px * d.x + pz * d.z) / dh;
    if (t < 0 || t > best.t) continue;
    const cx = o.x + d.x * t - p.x, cz = o.z + d.z * t - p.z;
    const down = p.state === 'down' || p.dead;
    const r = down ? 0.5 : 0.32;
    if (cx * cx + cz * cz > r * r) continue;
    const y = o.y + d.y * t, py = p.y ?? 0;
    if (y < py - 0.05 || y > py + (down ? 0.45 : 1.8)) continue;
    consider(t, 'person', p, { head: !down && y > py + 1.48 });
  }
  for (const v of world.vehicles) {
    if (v === ignore) continue;
    const dx = v.x - o.x, dz = v.z - o.z;
    if (dx * dx + dz * dz > (maxT + 6) ** 2) continue;
    // Slab test in the vehicle's frame.
    const s = Math.sin(v.heading), c = Math.cos(v.heading);
    const ox = -dx, oz = -dz;
    const lo = [ox * c - oz * s, o.y - v.y, ox * s + oz * c], ld = [d.x * c - d.z * s, d.y, d.x * s + d.z * c];
    const half = [v.spec.width / 2, 0, v.spec.length / 2];
    const top = v.spec.length > 7 ? 3.2 : v.spec.twoWheeler ? 1.2 : 1.6;
    let t0 = 0, t1 = best.t, ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      const mn = k === 1 ? 0.2 : -half[k], mx = k === 1 ? top : half[k];
      if (Math.abs(ld[k]) < 1e-6) { if (lo[k] < mn || lo[k] > mx) ok = false; continue; }
      let ta = (mn - lo[k]) / ld[k], tb = (mx - lo[k]) / ld[k];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) ok = false;
    }
    if (ok) consider(t0, 'vehicle', v);
  }
  // Buildings and walls: march the ray.
  for (let t = 0.3; t < best.t; t += 0.4) {
    const y = o.y + d.y * t;
    if (y <= 0) { consider(t, 'ground'); break; }
    if (world.colliders.pointBlocked(o.x + d.x * t, o.z + d.z * t, y)) { consider(t, 'wall'); break; }
  }
  if (!best.kind) return null;
  best.x = o.x + d.x * best.t; best.y = o.y + d.y * best.t; best.z = o.z + d.z * best.t;
  return best;
}

// An NPC fires at the player (or the player's vehicle). Accuracy falls off with range and
// against a fast-moving car.
export function npcFire(world, human, from, key, accuracy) {
  const w = WEAPONS[key];
  const pl = world.player;
  const tgt = pl.vehicle || pl;
  const o = muzzle(human);
  world.particles?.emit('flash', o.x, o.y, o.z, 0, 0, 0, 0.8);
  world.audio?.gunshot?.(key, from.x, from.z, world.camera);
  world.gunfire?.(from.x, from.z, true);
  const d = Math.hypot(tgt.x - from.x, tgt.z - from.z);
  const moving = pl.vehicle ? Math.min(1, pl.vehicle.speed / 15) : Math.min(1, (pl.speed || 0) / 8) * 0.5;
  const chance = accuracy * Math.max(0.1, 1 - d / (w.range * 1.3)) * (1 - moving * 0.5);
  const ty = pl.vehicle ? pl.vehicle.y + 1.0 : pl.y + 1.2;
  let dir = { x: tgt.x - o.x, y: ty - o.y, z: tgt.z - o.z };
  const l = Math.hypot(dir.x, dir.y, dir.z);
  const miss = Math.random() > chance ? (0.04 + Math.random() * 0.08) : 0;
  dir = { x: dir.x / l + (Math.random() - 0.5) * miss * 2, y: dir.y / l + (Math.random() - 0.3) * miss, z: dir.z / l + (Math.random() - 0.5) * miss * 2 };
  const dl = Math.hypot(dir.x, dir.y, dir.z);
  dir.x /= dl; dir.y /= dl; dir.z /= dl;
  const hit = raycast(world, o, dir, w.range, human.owner);
  if (hit) world.bulletHit?.(hit, w, dir, human.owner);
}

// ---------- pickups ----------
// Weapons (and ammo and cash) lying around: a slowly turning model over a glowing ring.
const ringGeo = new THREE.RingGeometry(0.35, 0.45, 24).rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false });

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  // what: weapon key, or 'ammo:katta', 'cash:500', 'health'.
  add(what, x, z, y = 0, opts = {}) {
    const group = new THREE.Group();
    const key = what.split(':')[0];
    const w = WEAPONS[key];
    const m = weaponMesh(w ? key : what.startsWith('ammo') ? what.split(':')[1] : 'none');
    if (m) { m.rotation.x = w && w.kind === 'gun' ? Math.PI / 2 : 0; m.position.y = 0.55; group.add(m); }
    else {
      const box = new THREE.Mesh(geo.box, new THREE.MeshStandardMaterial({ color: key === 'cash' ? 0x3a9a4a : 0xe03030 }));
      box.scale.set(0.3, 0.18, 0.2); box.position.y = 0.5; group.add(box);
    }
    group.add(new THREE.Mesh(ringGeo, ringMat));
    group.position.set(x, y + 0.05, z);
    this.scene.add(group);
    const item = { what, x, z, y, group, respawn: opts.respawn ?? 0, timer: 0, taken: false };
    this.items.push(item);
    return item;
  }

  update(dt, world) {
    const pl = world.player;
    const t = performance.now() / 1000;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.taken) {
        if (!it.respawn) { this.scene.remove(it.group); this.items.splice(i, 1); continue; }
        it.timer -= dt;
        if (it.timer <= 0) { it.taken = false; it.group.visible = true; }
        continue;
      }
      const near = Math.abs(it.x - world.focus.x) < 150 && Math.abs(it.z - world.focus.z) < 150;
      it.group.visible = near;
      if (!near) continue;
      it.group.children[0].rotation.y = t * 1.5;
      it.group.children[0].position.y = 0.55 + Math.sin(t * 2 + i) * 0.06;
      if (!pl.vehicle && !pl.dead && Math.hypot(pl.x - it.x, pl.z - it.z) < 1.0 && Math.abs(pl.y - it.y) < 1.5) {
        if (pl.collect(it.what, world)) {
          it.taken = true; it.group.visible = false; it.timer = it.respawn;
          world.audio?.ping();
        }
      }
    }
  }
}
