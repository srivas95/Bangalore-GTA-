// Roads, junctions, medians, underpasses (with floodable water), the Silk Board flyover,
// and the Yeshwanthpur railway with its trains.
import * as THREE from 'three';
import { BuilderSet } from './meshBuilder.js';
import { put } from './landmarks.js';
import * as T from './textures.js';
import { RAILWAY, CURB_H, WORLD_MIN, WORLD_MAX } from '../config.js';

const SHRUB = new THREE.SphereGeometry(1, 8, 6);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const ROAD_TILE = 12;

export const floodMaterial = new THREE.MeshStandardMaterial({
  color: 0x6b5a3e, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.86,
  normalMap: T.waterNormal(), normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.2,
});
floodMaterial.normalMap.repeat.set(6, 6);

export function roadMaterialKey(lanes, median) {
  return `road_${lanes}_${median || 0}`;
}

// Draws a road strip for an x-road (running along z) between a0 and a1, following yFn(z).
function stripX(b, x0, x1, a0, a1, yFn, step = 2.5) {
  const w = x1 - x0;
  if (!yFn) {
    // Short segments keep depth interpolation precise.
    for (let a = a0; a < a1 - 1e-6; a += 80) b.rect(x0, x1, a, Math.min(a + 80, a1), 0.01, 0xffffff, (x, z) => [(x - x0) / w, -z / ROAD_TILE]);
    return;
  }
  for (let a = a0; a < a1 - 1e-6; a += step) {
    const za = a, zb = Math.min(a + step, a1);
    const ya = yFn(za), yb = yFn(zb);
    const slope = (yb - ya) / (zb - za);
    const n = new THREE.Vector3(0, 1, -slope).normalize().toArray();
    b.quad4([x0, yb, zb], [x1, yb, zb], [x1, ya, za], [x0, ya, za], n,
      [0, -zb / ROAD_TILE], [1, -zb / ROAD_TILE], [1, -za / ROAD_TILE], [0, -za / ROAD_TILE]);
  }
}

export function buildInfrastructure(ctx) {
  const { B, layout, colliders, mats, tex, group } = ctx;
  const ensureRoadMat = (lanes, median, width) => {
    const key = roadMaterialKey(lanes, median);
    if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial({ map: tex(T.roadTexture({ lanes, median, width })), roughness: 0.88 });
    ctx.roadMats.add(mats[key]);
    return key;
  };

  // ---------- Road surfaces (dipping through underpasses) ----------
  for (const r of layout.roads) {
    const key = ensureRoadMat(r.lanes, r.median, r.width);
    const b = B.get(key);
    const hw = r.width / 2, lo = r.pos - hw, hi = r.pos + hw;
    if (r.axis === 'x') {
      const ups = layout.underpasses.filter((u) => u.road === r).sort((p, q) => p.at - q.at);
      let a = WORLD_MIN;
      for (const u of ups) {
        stripX(b, lo, hi, a, u.at - u.half);
        stripX(b, lo, hi, u.at - u.half, u.at + u.half, (z) => layout.dip(u, z) + 0.01);
        a = u.at + u.half;
      }
      stripX(b, lo, hi, a, WORLD_MAX);
    } else {
      for (let a = WORLD_MIN; a < WORLD_MAX; a += 80) b.rect(a, Math.min(a + 80, WORLD_MAX), lo, hi, 0.01, 0xffffff, (x, z) => [(z - lo) / r.width, x / ROAD_TILE]);
    }
  }
  // Junctions and zebra crossings.
  for (const n of layout.nodes) {
    const { hx, hz } = n;
    B.get('junction').rect(n.x - hx, n.x + hx, n.z - hz, n.z + hz, 0.02, 0xffffff, (x, z) => [x / 8, -z / 8]);
    const zb = B.get('zebra');
    for (const s of [-1, 1]) {
      const z0 = n.z + s * (hz + 0.6), z1 = n.z + s * (hz + 3.6);
      zb.rect(n.x - hx, n.x + hx, Math.min(z0, z1), Math.max(z0, z1), 0.025, 0xffffff, (x, z) => [x / 8, z / 8]);
      const x0 = n.x + s * (hx + 0.6), x1 = n.x + s * (hx + 3.6);
      zb.rect(Math.min(x0, x1), Math.max(x0, x1), n.z - hz, n.z + hz, 0.025, 0xffffff, (x, z) => [z / 8, x / 8]);
    }
  }
  // Raised medians with gaps at junctions (and none under the flyover).
  for (const r of layout.roads) {
    if (!r.median) continue;
    const cross = r.axis === 'z' ? layout.xRoads : layout.zRoads;
    const cuts = cross.map((c) => [c.pos - c.width / 2 - 4, c.pos + c.width / 2 + 4]);
    for (const f of layout.flyovers) if (f.road === r) cuts.push([f.at - f.half, f.at + f.half]);
    cuts.sort((p, q) => p[0] - q[0]);
    let start = WORLD_MIN;
    for (const [a, b2] of [...cuts, [WORLD_MAX, WORLD_MAX]]) {
      if (a > start + 1) {
        const len = a - start, c = (start + a) / 2, mw = r.median - 0.4;
        const [cx, cz, w, d] = r.axis === 'z' ? [c, r.pos, len, mw] : [r.pos, c, mw, len];
        B.get('sidewalk').box(cx, 0, cz, w, 0.35, d, 0xb0aaa0, { tileW: 2, tileH: 2, topBuilder: B.get('grass'), topTile: 4 });
        colliders.addCentered(cx, cz, w, d, 0.9, 'median');
        for (let t = start + 3; t < a - 2; t += 6) {
          if (r.axis === 'z') put(B.get('stone'), SHRUB, t, 0.6, r.pos, 0x4f7a32, 0, 0.9, 0.6, 0.9);
          else put(B.get('stone'), SHRUB, r.pos, 0.6, t, 0x4f7a32, 0, 0.9, 0.6, 0.9);
        }
      }
      start = Math.max(start, b2);
    }
  }

  // ---------- Underpasses ----------
  const concrete = B.get('stone');
  for (const u of layout.underpasses) {
    const r = u.road;
    const hw = r.width / 2, lo = r.pos - hw, hi = r.pos + hw;
    const top = CURB_H + 1.0;
    // Retaining walls with a parapet, following the dip.
    const step = 2.5;
    for (const [x, inward] of [[lo, 1], [hi, -1]]) {
      for (let a = u.at - u.half; a < u.at + u.half - 1e-6; a += step) {
        const za = a, zb = a + step, ya = layout.dip(u, za), yb = layout.dip(u, zb);
        const xi = x + inward * 0.02;
        const n = [inward, 0, 0];
        if (inward < 0) concrete.quad4([xi, ya, za], [xi, yb, zb], [xi, top, zb], [xi, top, za], n, [0, 0], [1, 0], [1, 1], [0, 1], 0x9a958c);
        else concrete.quad4([xi, yb, zb], [xi, ya, za], [xi, top, za], [xi, top, zb], n, [0, 0], [1, 0], [1, 1], [0, 1], 0x9a958c);
      }
      const wx = x - inward * 0.15;
      concrete.box(wx, CURB_H, u.at, 0.3, top - CURB_H, u.half * 2, 0xb0aaa0);
      // Black-and-yellow hazard stripes at the parapet top.
      for (let a = u.at - u.half; a < u.at + u.half; a += 2) concrete.box(wx, top, a + 0.5, 0.32, 0.12, 1, 0xf2c200);
      colliders.addCentered(wx, u.at, 0.3, u.half * 2, top + 0.05, 'wall');
    }
    // Deck: railway bridge or a road bridge crossing above.
    const deckW = u.type === 'rail' ? 11 : 15;
    concrete.box(r.pos, -1.1, u.at, r.width + 1.2, CURB_H + 1.35, deckW, 0x8f8a82, { bottom: true });
    concrete.box(r.pos, CURB_H + 0.25, u.at - deckW / 2 + 0.2, r.width + 1.2, 1.0, 0.4, 0xb8b2a8);
    concrete.box(r.pos, CURB_H + 0.25, u.at + deckW / 2 - 0.2, r.width + 1.2, 1.0, 0.4, 0xb8b2a8);
    if (u.type !== 'rail') B.get(ensureRoadMat(1, 0, 6.8)).rect(r.pos - hw - 0.6, r.pos + hw + 0.6, u.at - 3.4, u.at + 3.4, CURB_H + 0.26, 0xffffff, (x, z) => [(z - u.at + 3.4) / 6.8, x / ROAD_TILE]);
    for (const s of [-1, 1]) {
      ctx.signs.push({ key: 'up_' + u.name, text: [u.name.toUpperCase(), 'ಕೆಳಸೇತುವೆ · HEIGHT 4.2 m'], bg: '#1f4e8c', fg: '#fff', x: r.pos, y: -0.5, z: u.at + s * (deckW / 2 + 0.01), w: Math.min(r.width, 12), h: 1.1, face: s < 0 ? 'n' : 's' });
    }
    // Flood water that rises during monsoon rain.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(r.width, u.half * 2), floodMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.set(r.pos, u.waterLevel, u.at);
    water.visible = false;
    water.renderOrder = 2;
    group.add(water);
    u.waterMesh = water;
  }

  // ---------- Flyovers ----------
  for (const f of layout.flyovers) {
    const r = f.road;
    const x0 = r.pos - f.hw, x1 = r.pos + f.hw;
    const key = ensureRoadMat(1, r.median || 0, f.hw * 2);
    const deck = (z) => layout.deckHeight(f, z);
    stripX(B.get(key), x0, x1, f.at - f.half, f.at + f.half, (z) => deck(z) + 0.02, 3);
    const step = 3;
    for (let a = f.at - f.half; a < f.at + f.half - 1e-6; a += step) {
      const za = a, zb = a + step, ya = deck(za), yb = deck(zb);
      const lowA = ya < 4 ? 0 : ya - 1.3, lowB = yb < 4 ? 0 : yb - 1.3;
      // Outer side faces from the slab bottom (or ground on the ramps) to the parapet top.
      concrete.quad4([x1, lowB, zb], [x1, lowA, za], [x1, ya + 1.05, za], [x1, yb + 1.05, zb], [1, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1], 0xbab4aa);
      concrete.quad4([x0, lowA, za], [x0, lowB, zb], [x0, yb + 1.05, zb], [x0, ya + 1.05, za], [-1, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1], 0xbab4aa);
      // Underside of the elevated span.
      if (ya >= 4 || yb >= 4) concrete.quad4([x0, lowA, za], [x1, lowA, za], [x1, lowB, zb], [x0, lowB, zb], [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1], 0x8a857c);
      // Parapet colliders: solid to the ground on the ramps, overhead (passable beneath) on the span.
      const hMax = Math.max(ya, yb), hMin = Math.min(ya, yb);
      const y0 = hMax < 4 ? -100 : hMin - 0.7;
      colliders.add(x0 - 0.3, x0, za, zb, hMax + 1.05, 'wall', y0);
      colliders.add(x1, x1 + 0.3, za, zb, hMax + 1.05, 'wall', y0);
    }
    // Inner parapet tops in yellow-black.
    for (let a = f.at - f.half; a < f.at + f.half; a += 3) {
      const y = deck(a + 1.5) + 1.05;
      concrete.box(x0 + 0.15, y - 0.12, a + 1.5, 0.3, 0.12, 2.8, 0xf2c200);
      concrete.box(x1 - 0.15, y - 0.12, a + 1.5, 0.3, 0.12, 2.8, 0xf2c200);
    }
    // Where the span gets too low to drive under, block ground traffic.
    for (const s of [-1, 1]) {
      let a = f.at;
      while (deck(a) > 4 && Math.abs(a - f.at) < f.half) a += s * 0.5;
      // Top at 3 m: blocks traffic underneath, while cars on the deck (y > 4) pass over it.
      colliders.add(x0, x1, Math.min(a, a + s * 0.6), Math.max(a, a + s * 0.6), 3.0, 'wall');
      // Piers under the span.
      for (let p = f.at; Math.abs(p - f.at) < Math.abs(a - f.at) - 4; p += s * 18) {
        if (s > 0 && p === f.at) continue;
        const h = deck(p) - 1.3;
        if (Math.abs(p - f.at) < 14) continue; // keep the junction itself clear
        put(concrete, CYL, r.pos, h / 2, p, 0xb0aaa0, 0, 0.8, h, 0.8);
        concrete.box(r.pos, h - 0.8, p, f.hw * 2, 0.8, 1.6, 0xb0aaa0);
        colliders.addCentered(r.pos, p, 1.7, 1.7, h, 'pier');
      }
    }
    ctx.signs.push({ key: 'fo_' + f.name, text: [f.name.toUpperCase(), 'ಮೇಲ್ಸೇತುವೆ · ELECTRONIC CITY →'], bg: '#1f6a3a', fg: '#fff', x: r.pos, y: deck(f.at) + 2.2, z: f.at - f.half * 0.6, w: f.hw * 2 - 0.6, h: 1.4, face: 'n' });
  }

  // ---------- Railway ----------
  const rail = buildRailway(ctx);
  return { rail };
}

// Yeshwanthpur line: two tracks on ballast with overhead electrification and shuttling trains.
function buildRailway(ctx) {
  const { B, layout, colliders, group } = ctx;
  const z = RAILWAY.z, x0 = RAILWAY.from, x1 = RAILWAY.to;
  const len = x1 - x0, cx = (x0 + x1) / 2;
  const st = B.get('stone'), metal = B.get('metal');
  st.box(cx, CURB_H, z, len, 0.28, 10, 0x6e665e);
  const tracks = [z - 2.5, z + 2.5];
  for (const tz of tracks) {
    for (let x = x0 + 0.4; x < x1; x += 0.7) st.box(x, CURB_H + 0.28, tz, 0.25, 0.12, 2.5, 0x5a4a3a);
    for (const o of [-0.72, 0.72]) metal.box(cx, CURB_H + 0.4, tz + o, len, 0.14, 0.08, 0x8a8a8a);
  }
  // Overhead line masts.
  for (let x = x0 + 20; x < x1; x += 45) {
    if (layout.underpassAt(x, z)) continue;
    put(metal, CYL, x, CURB_H + 3.5, z - 5.4, 0x7a7a7a, 0, 0.12, 7, 0.12);
    metal.box(x, CURB_H + 6.7, z - 2.5, 0.1, 0.1, 6, 0x7a7a7a);
    colliders.addCentered(x, z - 5.4, 0.3, 0.3, 7, 'pole');
  }
  for (const tz of tracks) metal.box(cx, CURB_H + 6.3, tz, len, 0.03, 0.03, 0x333333);
  // Boundary walls inside block interiors (footpaths can still cross the tracks).
  for (const b of layout.blocks) {
    if (z < b.outer.minZ || z > b.outer.maxZ || b.inner.maxX < x0 || b.inner.minX > x1 || b.landmark === 'yeshwanthpurStation') continue;
    const a = Math.max(b.inner.minX, x0), c = Math.min(b.inner.maxX, x1);
    for (const s of [-1, 1]) {
      st.box((a + c) / 2, CURB_H, z + s * 8, c - a, 2, 0.3, 0xc8bca8);
      colliders.addCentered((a + c) / 2, z + s * 8, c - a, 0.3, 2.2, 'wall');
    }
  }
  st.box(x1 + 2, CURB_H, z, 1, 1.4, 10, 0xc81010); // buffer stops
  colliders.addCentered(x1 + 2, z, 1, 10, 1.5, 'wall');

  // Trains: a WAP-7 hauling red LHB coaches, shuttling along the line.
  const stationX = (() => { const b = layout.blocks.find((q) => q.landmark === 'yeshwanthpurStation'); return b ? (b.outer.minX + b.outer.maxX) / 2 : -980; })();
  const trains = [makeTrain(tracks[0], 1, x0 + 200), makeTrain(tracks[1], -1, x1 - 250)];
  trains.forEach((t) => group.add(t.group));
  const update = (dt, world) => {
    for (const t of trains) {
      if (t.wait > 0) { t.wait -= dt; continue; }
      const toStation = (stationX - t.x) * t.dir;
      const end = t.dir > 0 ? x1 - 20 - t.len / 2 : x0 + t.len / 2;
      const toEnd = (end - t.x) * t.dir;
      let target = 16;
      if (toStation > 0 && toStation < 160 && !t.stopped) target = Math.max(1.5, toStation * 0.12);
      if (toEnd < 140) target = Math.min(target, Math.max(1.5, toEnd * 0.12));
      t.speed += Math.sign(target - t.speed) * Math.min(Math.abs(target - t.speed), 1.4 * dt);
      t.x += t.speed * t.dir * dt;
      if (!t.stopped && Math.abs(t.x - stationX) < 1) { t.stopped = true; t.wait = 20; t.speed = 0; }
      if (Math.abs(t.x - stationX) > 30) t.stopped = false;
      if (toEnd <= 0.5) { t.dir *= -1; t.wait = 25; t.speed = 0; t.group.rotation.y = t.dir > 0 ? 0 : Math.PI; t.honked = false; }
      t.group.position.x = t.x;
      // Horn when approaching the player.
      if (world) {
        const p = world.focus, d = Math.hypot(p.x - t.x, p.z - z);
        if (d < 260 && !t.honked && t.speed > 5) { t.honked = true; world.audio?.horn('train', t.x, z, world.camera); }
        if (d > 400) t.honked = false;
        // Anyone standing on the track gets knocked aside.
        if (world.hitByTrain && Math.abs(p.z - t.z) < 2 && Math.abs(p.x - t.x) < t.len / 2 + 1 && t.speed > 2) world.hitByTrain(t);
      }
    }
  };
  return { update, trains, z, x0, x1 };
}

function makeTrain(tz, dir, x) {
  const B = new BuilderSet();
  const p = B.get('paint'), g = B.get('glass');
  const coach = 23.5, n = 7;
  const len = 20 + n * (coach + 0.8);
  // Locomotive at the front (+x end when dir = +1).
  const lx = len / 2 - 10;
  p.box(lx, CURB_H + 1.0, 0, 20, 3.2, 3.1, 0xe8e4dc);
  p.box(lx, CURB_H + 1.6, 0, 20.02, 0.5, 3.12, 0xc0182a, { top: false });
  p.box(lx + 9.6, CURB_H + 2.6, 0, 0.8, 1.2, 3.0, 0x1a2228);
  p.box(lx, CURB_H + 4.2, 0, 14, 0.4, 2.4, 0x555555);
  g.box(lx + 9.9, CURB_H + 3.2, 0, 0.2, 0.8, 2.6, 0x1a2228);
  for (let k = 0; k < n; k++) {
    const c = len / 2 - 20.8 - k * (coach + 0.8) - coach / 2;
    p.box(c, CURB_H + 1.0, 0, coach, 3.3, 3.15, 0xa8282a);
    p.box(c, CURB_H + 1.35, 0, coach + 0.02, 0.18, 3.17, 0xe8e0d0, { top: false });
    g.box(c, CURB_H + 2.6, 0, coach - 2, 0.8, 3.18, 0x1a2228, { top: false });
    p.box(c, CURB_H + 4.3, 0, coach - 0.5, 0.25, 2.8, 0xb8b8b8);
    p.box(c, CURB_H + 0.6, 0, coach - 3, 0.4, 2.6, 0x222222, { top: false });
  }
  const group = new THREE.Group();
  B.buildAll({
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.7 }),
  }, group);
  group.position.set(x, 0.3, tz);
  group.rotation.y = dir > 0 ? 0 : Math.PI;
  return { group, x, z: tz, dir, speed: 10, wait: 0, len, stopped: false, honked: false };
}

