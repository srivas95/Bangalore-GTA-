// Indian Railways lines out of KSR Bengaluru City: ballasted double track along real
// alignments, overhead electrification, boundary walls, level crossings, three stations and
// long-distance trains (a WAP-7 with red LHB coaches) shuttling between the ends.
import * as THREE from 'three';
import { BuilderSet, makeFrame } from './meshBuilder.js';
import { put } from './landmarks.js';
import { Path } from './path.js';
import { FACADE_TILE } from './textures.js';
import { RAIL_STATIONS } from './mapdata.js';
import { CURB_H } from '../config.js';

const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const CONE4 = new THREE.ConeGeometry(1, 1, 4);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const PIECE = 8;
const TRACKS = [-2.5, 2.5];

export function buildRailway(ctx) {
  const { B, layout, colliders, group } = ctx;
  const st = B.get('stone'), metal = B.get('metal');
  const lines = layout.rails.map((l) => ({ ...l, path: new Path(l.pts) }));
  const stations = RAIL_STATIONS.map((s) => {
    const line = lines[s.line];
    const pr = line.path.project(s.at[0], s.at[1]);
    return { ...s, line, s: pr.s };
  });
  const nearStation = (line, s, pad = 0) => stations.some((q) => q.line === line && Math.abs(q.s - s) < 75 + pad);
  const onRoad = (x, z) => !layout.blockContaining(x, z) && !layout.underpassAt(x, z);
  const inBlock = (x, z) => { const b = layout.blockContaining(x, z); return b && !b.island; };

  for (const line of lines) {
    const P = line.path;
    const walls = { '-1': null, 1: null };
    const flushWall = (side) => {
      const w = walls[side];
      if (!w) return;
      const len = Math.hypot(w.bx - w.ax, w.bz - w.az);
      if (len > 2) {
        const f = makeFrame((w.ax + w.bx) / 2, (w.az + w.bz) / 2, Math.atan2(-(w.bz - w.az), w.bx - w.ax));
        B.xf = f;
        st.box(0, CURB_H, 0, len, 2, 0.3, 0xc8bca8);
        B.xf = null;
        colliders.addSegment(w.ax, w.az, w.bx, w.bz, 0.3, 2.2, 'wall');
      }
      walls[side] = null;
    };
    const at = {};
    for (let s = 0; s < P.length - 1e-6; s += PIECE) {
      const l = Math.min(PIECE, P.length - s);
      P.at(s + l / 2, at);
      const f = makeFrame(at.x, at.z, Math.atan2(-at.dz, at.dx));
      const road = onRoad(at.x, at.z);
      B.xf = f;
      if (road) {
        // Level crossing: rails set flush into the road.
        for (const tz of TRACKS) for (const o of [-0.72, 0.72]) metal.box(0, 0.01, tz + o, l, 0.05, 0.08, 0x8a8a8a);
      } else {
        st.box(0, CURB_H, 0, l + 0.05, 0.28, 10, 0x6e665e);
        for (const tz of TRACKS) {
          for (let x = -l / 2 + 0.5; x < l / 2; x += 1.2) st.box(x, CURB_H + 0.28, tz, 0.25, 0.12, 2.5, 0x5a4a3a, { sides: false });
          for (const o of [-0.72, 0.72]) metal.box(0, CURB_H + 0.4, tz + o, l + 0.05, 0.14, 0.08, 0x8a8a8a);
        }
        for (const tz of TRACKS) metal.box(0, CURB_H + 6.3, tz, l + 0.05, 0.03, 0.03, 0x333333);
      }
      B.xf = null;
      // Boundary walls inside blocks, broken at stations.
      for (const side of [-1, 1]) {
        const ox = -at.dz * 8 * side, oz = at.dx * 8 * side;
        const ax = at.x - at.dx * l / 2 + ox, az = at.z - at.dz * l / 2 + oz, bx = at.x + at.dx * l / 2 + ox, bz = at.z + at.dz * l / 2 + oz;
        const ok = inBlock(ax, az) && inBlock(bx, bz) && inBlock((ax + bx) / 2, (az + bz) / 2) && !nearStation(line, s);
        if (!ok) { flushWall(side); continue; }
        const w = walls[side];
        if (w && Math.abs((bx - w.ax) * -(w.bz - w.az) + (bz - w.az) * (w.bx - w.ax)) / (Math.hypot(w.bx - w.ax, w.bz - w.az) || 1) < 0.3) { w.bx = bx; w.bz = bz; }
        else { flushWall(side); walls[side] = { ax, az, bx, bz }; }
      }
    }
    flushWall(-1); flushWall(1);
    // Overhead line masts.
    for (let s = 20; s < P.length; s += 45) {
      P.at(s, at);
      const mx = at.x + at.dz * 5.4, mz = at.z - at.dx * 5.4;
      if (!inBlock(mx, mz) || !inBlock(at.x, at.z)) continue;
      const f = makeFrame(at.x, at.z, Math.atan2(-at.dz, at.dx));
      B.xf = f;
      put(metal, CYL, 0, CURB_H + 3.5, -5.4, 0x7a7a7a, 0, 0.12, 7, 0.12);
      metal.box(0, CURB_H + 6.7, -2.5, 0.1, 0.1, 6, 0x7a7a7a);
      B.xf = null;
      colliders.addCentered(mx, mz, 0.3, 0.3, 7, 'pole');
    }
  }

  // Level crossing booms (raised) on both sides of the track.
  for (const lc of layout.levelCrossings) {
    const e = lc.edge, ux = (e.b.x - e.a.x) / e.len, uz = (e.b.z - e.a.z) / e.len, hw = e.r.width / 2;
    const f = makeFrame(lc.x, lc.z, Math.atan2(ux, uz));
    B.xf = f;
    for (const s of [-1, 1]) {
      const side = s * (hw + 0.8);
      put(st, CYL, side, 0.8, s * 9, 0x333333, 0, 0.18, 1.6, 0.18);
      for (let k = 0; k < 5; k++) put(st, BOX, side - s * 0.3, 2.0 + k * 0.85, s * 9, k % 2 ? 0xf2f2f2 : 0xd02020, 0, 0.12, 0.85, 0.12);
      colliders.framed(f).addCentered(side, s * 9, 0.4, 0.4, 3, 'pole');
    }
    ctx.sign({ key: 'lc', text: ['LEVEL CROSSING', 'ಲೆವೆಲ್ ಕ್ರಾಸಿಂಗ್ · STOP LOOK GO'], bg: '#f2c200', fg: '#111', x: hw + 1.2, y: 2.2, z: -12, w: 2.6, h: 1.0, face: 's' });
    ctx.sign({ key: 'lc', text: ['LEVEL CROSSING', 'ಲೆವೆಲ್ ಕ್ರಾಸಿಂಗ್ · STOP LOOK GO'], bg: '#f2c200', fg: '#111', x: -hw - 1.2, y: 2.2, z: 12, w: 2.6, h: 1.0, face: 'n' });
    B.xf = null;
  }

  // Stations: two platforms, a station building and yellow name boards.
  for (const sn of stations) {
    const at = sn.line.path.at(sn.s);
    const f = makeFrame(at.x, at.z, Math.atan2(-at.dz, at.dx));
    const col = colliders.framed(f);
    B.xf = f;
    const pl = 130;
    for (const s of [-1, 1]) {
      const pz = s * 7;
      st.box(0, 0.15, pz, pl, 0.75, 4, 0xc8bca8);
      st.box(0, 0.9, pz - s * 1.85, pl, 0.02, 0.3, 0xf2c200);
      for (let x = -pl / 2 + 6; x < pl / 2 - 4; x += 12) put(metal, CYL, x, 3.5, pz, 0x5a6a7a, 0, 0.12, 5.2, 0.12);
      metal.box(0, 6, pz, pl, 0.15, 5, 0x8a9aaa);
      col.addCentered(0, pz, pl, 4, 0.9, 'platform');
      ctx.sign({ key: 'rs_' + sn.name, text: [sn.kn, sn.short || sn.name.toUpperCase()], x: 25, y: 3, z: pz + s * 1.6, w: 6, h: 1.4, face: s < 0 ? 'n' : 's', bg: '#f2c200', fg: '#111' });
    }
    // Building on whichever side has land.
    const side = [1, -1].find((s) => inBlock(at.x - at.dz * 20 * s, at.z + at.dx * 20 * s)) || 1;
    const bz = side * 19;
    const her = B.get('heritage'), roof = B.get('roof');
    her.box(0, CURB_H, bz, 70, 9, 14, 0xf0e2c8, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 10 });
    st.box(0, CURB_H + 9, bz, 72, 1, 16, 0xa8302a);
    her.box(0, CURB_H, bz, 18, 14, 16, 0xf0e2c8, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof });
    put(st, CONE4, 0, CURB_H + 16.4, bz, 0xa8302a, Math.PI / 4, 12, 5, 12);
    col.addCentered(0, bz, 72, 16, 15, 'building');
    ctx.sign({ key: 'rsb_' + sn.name, text: [sn.kn, sn.board || sn.name.toUpperCase()], x: 0, y: CURB_H + 11.5, z: bz + side * 8.05, w: 16, h: 3.2, face: side > 0 ? 's' : 'n', bg: '#f2c200', fg: '#111' });
    B.xf = null;
    const [ex, ez] = [at.x - at.dz * (bz + side * 10), at.z + at.dx * (bz + side * 10)];
    ctx.pois.landmarks.push({ name: sn.name, x: ex, z: ez });
    sn.x = at.x; sn.z = at.z;
  }

  // ---------- Trains ----------
  const parts = trainGeometry();
  const trains = [];
  lines.forEach((line, i) => {
    trains.push(makeTrain(parts, group, line, 1, 260 + i * 300, TRACKS[1]));
    trains.push(makeTrain(parts, group, line, -1, line.path.length - 260, TRACKS[0]));
  });
  const tmp = {};
  const update = (dt, world) => {
    for (const t of trains) {
      const P = t.line.path;
      if (t.wait > 0) { t.wait -= dt; } else {
        const end = t.dir > 0 ? P.length - 15 : 15;
        const toEnd = (end - t.s) * t.dir;
        let target = 16;
        for (const sn of stations) {
          if (sn.line !== t.line) continue;
          const d = (sn.s + t.dir * t.len / 2 - t.s) * t.dir;
          if (d > 0 && d < 160 && t.stoppedAt !== sn) target = Math.min(target, Math.max(1.5, d * 0.12));
          if (Math.abs(d) < 1 && t.stoppedAt !== sn) { t.stoppedAt = sn; t.wait = 20; t.speed = 0; }
        }
        if (toEnd < 140) target = Math.min(target, Math.max(1.5, toEnd * 0.12));
        t.speed += Math.sign(target - t.speed) * Math.min(Math.abs(target - t.speed), 1.4 * dt);
        t.s += t.speed * t.dir * dt;
        // Reverse at the terminus: the last coach becomes the front (push-pull rake).
        if (toEnd <= 0.5) { t.s -= t.dir * t.len; t.dir *= -1; t.wait = 25; t.speed = 0; t.honked = false; t.stoppedAt = null; t.lat = -t.lat; }
      }
      // Place every car along the curve.
      for (const c of t.cars) {
        const s = t.s - t.dir * c.off;
        P.at(s, tmp);
        const ang = Math.atan2(-tmp.dz * t.dir, tmp.dx * t.dir);
        c.mesh.position.set(tmp.x - tmp.dz * t.lat, 0.3, tmp.z + tmp.dx * t.lat);
        c.mesh.rotation.y = ang;
      }
      P.at(t.s - t.dir * t.len / 2, tmp);
      t.x = tmp.x - tmp.dz * t.lat; t.z = tmp.z + tmp.dx * t.lat; t.dx = tmp.dx; t.dz = tmp.dz;
      if (!world) continue;
      const p = world.focus, d = Math.hypot(p.x - t.x, p.z - t.z);
      if (d < 260 && !t.honked && t.speed > 5) { t.honked = true; world.audio?.horn('train', t.x, t.z, world.camera); }
      if (d > 400) t.honked = false;
      // Anyone standing on the track gets knocked aside.
      if (world.hitByTrain && t.speed > 2 && d < t.len / 2 + 2) {
        const pr = P.project(p.x, p.z);
        const lat = (p.x - P.at(pr.s, tmp).x) * -tmp.dz + (p.z - tmp.z) * tmp.dx;
        if (Math.abs(lat - t.lat) < 2 && Math.abs(pr.s - (t.s - t.dir * t.len / 2)) < t.len / 2 + 1) world.hitByTrain(t, -tmp.dz * Math.sign(lat - t.lat || 1), tmp.dx * Math.sign(lat - t.lat || 1));
      }
    }
  };
  update(0);
  return { update, trains, lines, stations };
}

// Shared geometry: locomotive and coach, each built along local +x.
function trainGeometry() {
  const mats = {
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.7 }),
  };
  const build = (fill) => {
    const B = new BuilderSet();
    fill(B.get('paint'), B.get('glass'));
    const g = new THREE.Group();
    B.buildAll(mats, g);
    return g;
  };
  const loco = build((p, g) => {
    p.box(0, CURB_H + 1.0, 0, 20, 3.2, 3.1, 0xe8e4dc);
    p.box(0, CURB_H + 1.6, 0, 20.02, 0.5, 3.12, 0xc0182a, { top: false });
    p.box(9.6, CURB_H + 2.6, 0, 0.8, 1.2, 3.0, 0x1a2228);
    p.box(0, CURB_H + 4.2, 0, 14, 0.4, 2.4, 0x555555);
    p.box(0, CURB_H + 0.4, 0, 17, 0.6, 2.6, 0x222222, { top: false });
    g.box(9.9, CURB_H + 3.2, 0, 0.2, 0.8, 2.6, 0x1a2228);
  });
  const coach = build((p, g) => {
    const L = 23.5;
    p.box(0, CURB_H + 1.0, 0, L, 3.3, 3.15, 0xa8282a);
    p.box(0, CURB_H + 1.35, 0, L + 0.02, 0.18, 3.17, 0xe8e0d0, { top: false });
    g.box(0, CURB_H + 2.6, 0, L - 2, 0.8, 3.18, 0x1a2228, { top: false });
    p.box(0, CURB_H + 4.3, 0, L - 0.5, 0.25, 2.8, 0xb8b8b8);
    p.box(0, CURB_H + 0.6, 0, L - 3, 0.4, 2.6, 0x222222, { top: false });
  });
  return { loco, coach };
}

function makeTrain(parts, group, line, dir, s, lat) {
  const n = 7, coach = 23.5;
  const cars = [{ mesh: parts.loco.clone(), off: 10 }];
  for (let k = 0; k < n; k++) cars.push({ mesh: parts.coach.clone(), off: 20.8 + k * (coach + 0.8) + coach / 2 });
  for (const c of cars) group.add(c.mesh);
  const len = 20.8 + n * (coach + 0.8);
  return { line, cars, s, dir, lat, speed: 10, wait: 0, len, honked: false, stoppedAt: null, x: 0, z: 0 };
}
