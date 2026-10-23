// Indian Railways lines out of KSR Bengaluru City: ballasted double track along real
// alignments, overhead electrification, boundary walls, level crossings, three stations and
// long-distance trains (a WAP-7 with red LHB coaches) shuttling between the ends.
import * as THREE from 'three';
import { BuilderSet, makeFrame, frameToWorld } from './meshBuilder.js';
import { put } from './landmarks.js';
import { Path } from './path.js';
import { FACADE_TILE } from './textures.js';
import { RAIL_STATIONS } from './mapdata.js';
import { CURB_H } from '../config.js';
import { DETAIL } from './detail.js';

const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const CONE4 = new THREE.ConeGeometry(1, 1, 4);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const PIECE = 8;
const TRACKS = [-2.5, 2.5];

export function buildRailway(ctx) {
  const { B, layout, colliders, group } = ctx;
  const st = B.get('stone'), metal = B.get('metal');
  const lines = layout.rails.map((l) => ({ ...l, path: new Path(l.pts) }));
  // On a carriageway (not just outside every block: past the edge of the road network the
  // line runs across open land, which wants ballast, not rails set in asphalt).
  const onRoad = (x, z) => !layout.blockContaining(x, z) && !layout.underpassAt(x, z) && !!layout.roadAt(x, z);
  const inBlock = (x, z) => { const b = layout.blockContaining(x, z); return b && !b.island; };
  // Where roads cross each line (level crossings and rail underpasses), as distances along it.
  const roadCrossings = (line) => {
    const out = [];
    for (const lc of layout.levelCrossings) if (lc.rail.name === line.name) out.push(line.path.project(lc.x, lc.z).s);
    for (const u of layout.underpasses) if (u.type === 'rail' && line.path.project(u.cx, u.cz).d < 20) out.push(line.path.project(u.cx, u.cz).s);
    return out;
  };
  // A station needs ~140 m of track clear of roads for its platforms, and land beside it for the
  // building; slide it along the line to the nearest such spot (stations used to straddle roads).
  const stationFits = (line, s) => {
    if (s < 90 || s > line.path.length - 90) return false;
    const at = line.path.at(s);
    const side = [1, -1].find((k) => inBlock(at.x - at.dz * 20 * k, at.z + at.dx * 20 * k));
    if (!side) return false;
    for (let a = -70; a <= 70; a += 3) {
      const p = line.path.at(Math.max(0, Math.min(line.path.length, s + a)));
      for (const off of [-9, 0, 9, side * 12, side * 19, side * 27]) {
        if (Math.abs(off) > 10 && Math.abs(a) > 37) continue; // the building is 72 m long
        if (!inBlock(p.x - p.dz * off, p.z + p.dx * off)) return false;
      }
    }
    return true;
  };
  const stations = RAIL_STATIONS.map((st0) => {
    const line = lines[st0.line];
    const s0 = line.path.project(st0.at[0], st0.at[1]).s;
    const xs = roadCrossings(line);
    // Prefer spots whose platforms end well short of a crossing (stopped trains keep its gates down).
    const clear = (s, gap) => xs.every((x) => Math.abs(x - s) > gap);
    let best = s0;
    search: for (const gap of [140, 80, 0]) {
      for (let d = 0; d <= 600; d += 5) {
        for (const s of d ? [s0 + d, s0 - d] : [s0]) if (clear(s, gap) && stationFits(line, s)) { best = s; break search; }
      }
    }
    return { ...st0, line, s: best };
  });
  const nearStation = (line, s, pad = 0) => stations.some((q) => q.line === line && Math.abs(q.s - s) < 75 + pad);

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
    // Does the bed of a piece centred at `at` (l long, 10 m wide) reach onto a road?
    const bedOnRoad = (l) => {
      for (const a of [-l / 2, 0, l / 2]) for (const off of [-5, 0, 5]) if (onRoad(at.x + at.dx * a - at.dz * off, at.z + at.dz * a + at.dx * off)) return true;
      return false;
    };
    for (let s = 0, step = PIECE; s < P.length - 1e-6; s += step) {
      // Where the line meets a road, lay it in short pieces, so the ballast stops at the kerb
      // and the rails run flush across the road (an 8 m piece crossing at an angle used to stick
      // out onto the carriageway).
      step = PIECE;
      P.at(s + Math.min(PIECE, P.length - s) / 2, at);
      if (bedOnRoad(PIECE)) step = 2;
      const l = Math.min(step, P.length - s);
      P.at(s + l / 2, at);
      const f = makeFrame(at.x, at.z, Math.atan2(-at.dz, at.dx));
      const road = step < PIECE ? bedOnRoad(l) : onRoad(at.x, at.z);
      B.xf = f;
      if (road) {
        // Level crossing: rails set flush into the road.
        for (const tz of TRACKS) for (const o of [-0.72, 0.72]) metal.box(0, 0.01, tz + o, l, 0.05, 0.08, 0x8a8a8a);
      } else {
        st.box(0, CURB_H, 0, l + 0.05, 0.28, 10, 0x6e665e);
        for (const tz of TRACKS) {
          if (!DETAIL.lite) for (let x = -l / 2 + 0.5; x < l / 2; x += 1.2) st.box(x, CURB_H + 0.28, tz, 0.25, 0.12, 2.5, 0x5a4a3a, { sides: false });
          for (const o of [-0.72, 0.72]) metal.box(0, CURB_H + 0.4, tz + o, l + 0.05, 0.14, 0.08, 0x8a8a8a);
        }
        for (const tz of TRACKS) metal.box(0, CURB_H + 6.3, tz, l + 0.05, 0.03, 0.03, 0x333333);
      }
      B.xf = null;
      // Boundary walls inside blocks, broken at stations.
      for (const side of [-1, 1]) {
        const ox = -at.dz * 8 * side, oz = at.dx * 8 * side;
        const ax = at.x - at.dx * l / 2 + ox, az = at.z - at.dz * l / 2 + oz, bx = at.x + at.dx * l / 2 + ox, bz = at.z + at.dz * l / 2 + oz;
        // Every couple of metres must be off the road (narrow lanes used to slip between samples).
        let ok = !nearStation(line, s);
        for (let k = 0; ok && k <= 4; k++) ok = inBlock(ax + (bx - ax) * k / 4, az + (bz - az) * k / 4);
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

  // Level crossings: a full-width boom on each side that comes down when a train is near, with
  // flashing red lamps. Closed booms block the road (and traffic waits for them).
  const boomMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const lampOn = new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false }), lampOff = new THREE.MeshBasicMaterial({ color: 0x401010 });
  const crossings = [];
  for (const lc of layout.levelCrossings) {
    const e = lc.edge, ux = (e.b.x - e.a.x) / e.len, uz = (e.b.z - e.a.z) / e.len, hw = e.r.width / 2;
    const f = makeFrame(lc.x, lc.z, Math.atan2(ux, uz));
    const line = lines.find((l) => l.name === lc.rail.name) || lines[0];
    const c = { lc, s: line.path.project(lc.x, lc.z).s, line, open: 1, booms: [], lamps: [], cols: [] };
    B.xf = f;
    for (const sd of [-1, 1]) {
      const side = sd * (hw + 0.8);
      put(st, CYL, side, 0.8, sd * 9, 0x333333, 0, 0.18, 1.6, 0.18);
      st.box(side, 1.6, sd * 9, 0.5, 0.5, 0.5, 0x222222);
      colliders.framed(f).addCentered(side, sd * 9, 0.4, 0.4, 3, 'pole');
      // The boom: a pivot at the post, striped arm reaching across the road.
      const L = hw * 2 + 0.6;
      const bb = new BuilderSet();
      const n = Math.max(3, Math.round(L / 1.2));
      for (let k = 0; k < n; k++) bb.get('m').box(-sd * (0.3 + (k + 0.5) * (L / n)), -0.07, 0, L / n, 0.14, 0.12, k % 2 ? 0xf2f2f2 : 0xd02020);
      const arm = new THREE.Group();
      bb.buildAll({ m: boomMat }, arm, { m: { castShadow: true } });
      const pivot = new THREE.Group();
      const [px, pz] = [f.ox + side * f.c + sd * 9 * f.s, f.oz - side * f.s + sd * 9 * f.c];
      pivot.position.set(px, 1.25, pz);
      pivot.rotation.y = f.ang;
      pivot.add(arm);
      group.add(pivot);
      c.booms.push({ arm, sd });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), lampOff);
      lamp.position.set(px, 2.0, pz);
      group.add(lamp);
      c.lamps.push(lamp);
      const box = colliders.framed(f).addCentered(0, sd * 9, L, 0.4, 1.5, 'wall');
      box.off = true;
      c.cols.push(box);
    }
    ctx.sign({ key: 'lc', text: ['LEVEL CROSSING', 'ಲೆವೆಲ್ ಕ್ರಾಸಿಂಗ್ · STOP LOOK GO'], bg: '#f2c200', fg: '#111', x: hw + 1.2, y: 2.2, z: -12, w: 2.6, h: 1.0, face: 's' });
    ctx.sign({ key: 'lc', text: ['LEVEL CROSSING', 'ಲೆವೆಲ್ ಕ್ರಾಸಿಂಗ್ · STOP LOOK GO'], bg: '#f2c200', fg: '#111', x: -hw - 1.2, y: 2.2, z: 12, w: 2.6, h: 1.0, face: 'n' });
    B.xf = null;
    crossings.push(c);
  }
  const updateCrossings = (dt) => {
    const blink = Math.floor(performance.now() / 400) % 2;
    for (const c of crossings) {
      // Closed while a train is within 110 m of the crossing (either end of it).
      let closed = false;
      for (const t of trains) {
        if (t.line !== c.line) continue;
        const a = t.s, b = t.s - t.dir * t.len;
        if (c.s > Math.min(a, b) - 110 && c.s < Math.max(a, b) + 110) { closed = true; break; }
      }
      c.lc.closed = closed;
      const target = closed ? 0 : 1;
      c.open += Math.sign(target - c.open) * Math.min(Math.abs(target - c.open), dt * 0.5);
      for (const b of c.booms) b.arm.rotation.z = -b.sd * (Math.PI / 2) * 0.92 * c.open;
      for (const box of c.cols) box.off = c.open > 0.35;
      c.lamps.forEach((l, i) => { l.material = closed && (blink + i) % 2 ? lampOn : lampOff; });
    }
  };

  // Stations: two platforms, a station building and yellow name boards.
  for (const sn of stations) {
    const at = sn.line.path.at(sn.s);
    const f = makeFrame(at.x, at.z, Math.atan2(-at.dz, at.dx));
    const col = colliders.framed(f);
    B.xf = f;
    const pl = 130, PS = 10;
    // Built in 10 m pieces, leaving out any that would sit on a road (the KSR terminus, where
    // the line starts right at Magadi Road).
    const land = (lx, lz) => { const [x, z] = frameToWorld(f, lx, lz); return !onRoad(x, z); };
    for (const s of [-1, 1]) {
      const pz = s * 7;
      for (let x0 = -pl / 2; x0 < pl / 2 - 1e-6; x0 += PS) {
        const xm = x0 + PS / 2;
        if (!land(x0 + 0.5, pz) || !land(x0 + PS - 0.5, pz) || !land(xm, pz)) continue;
        st.box(xm, 0.15, pz, PS, 0.75, 4, 0xc8bca8);
        st.box(xm, 0.9, pz - s * 1.85, PS, 0.02, 0.3, 0xf2c200);
        put(metal, CYL, xm, 3.5, pz, 0x5a6a7a, 0, 0.12, 5.2, 0.12);
        metal.box(xm, 6, pz, PS, 0.15, 5, 0x8a9aaa);
        col.addCentered(xm, pz, PS, 4, 0.9, 'platform');
      }
      ctx.sign({ key: 'rs_' + sn.name, text: [sn.kn, sn.short || sn.name.toUpperCase()], x: 25, y: 3, z: pz + s * 1.6, w: 6, h: 1.4, face: s < 0 ? 'n' : 's', bg: '#f2c200', fg: '#111' });
    }
    // Building on whichever side has land for all of it (none if neither side does).
    const fits = (k) => [-36, -18, 0, 18, 36].every((x) => [11, 19, 27].every((z) => land(x, k * z)));
    const side = [1, -1].find(fits);
    const bz = (side || 1) * 19;
    if (side) {
      const her = B.get('heritage'), roof = B.get('roof');
      her.box(0, CURB_H, bz, 70, 9, 14, 0xf0e2c8, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof, topTile: 10 });
      st.box(0, CURB_H + 9, bz, 72, 1, 16, 0xa8302a);
      her.box(0, CURB_H, bz, 18, 14, 16, 0xf0e2c8, { tileW: FACADE_TILE.w, tileH: FACADE_TILE.h, topBuilder: roof });
      put(st, CONE4, 0, CURB_H + 16.4, bz, 0xa8302a, Math.PI / 4, 12, 5, 12);
      col.addCentered(0, bz, 72, 16, 15, 'building');
      ctx.sign({ key: 'rsb_' + sn.name, text: [sn.kn, sn.board || sn.name.toUpperCase()], x: 0, y: CURB_H + 11.5, z: bz + side * 8.05, w: 16, h: 3.2, face: side > 0 ? 's' : 'n', bg: '#f2c200', fg: '#111' });
    }
    B.xf = null;
    const [ex, ez] = [at.x - at.dz * (bz + (side || 1) * 10), at.z + at.dx * (bz + (side || 1) * 10)];
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
    updateCrossings(dt);
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
