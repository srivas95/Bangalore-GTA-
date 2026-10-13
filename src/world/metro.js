// Namma Metro: the Purple and Green lines on their real alignments. Elevated viaducts over the
// arterials, underground halls in the city centre, stations with street entrances, and BEML
// trainsets running in both directions and stopping at every station.
import * as THREE from 'three';
import { BuilderSet, makeFrame, frameToWorld } from './meshBuilder.js';
import { put } from './landmarks.js';
import { textTexture } from './textures.js';
import { textScale } from './detail.js';
import { withAO } from './ao.js';
import { Path } from './path.js';
import { METRO } from './mapdata.js';

export const DECK_Y = 9.5;
export const UG_Y = -12; // underground platform level (the Green Line runs a level deeper)
const ST_HALF = 34;
const TRACK = 2.2; // lateral offset of each track (left-hand running)
const CAR = 20;
const CARS = 3;
export const TRAIN_LEN = CARS * CAR + (CARS - 1) * 0.6;
const DWELL = 11;

// Route data without any geometry: shared with the city (to keep buildings clear of viaducts)
// and the ride system.
// Ramps between elevated and underground track: a steady grade, placed where the low part of
// the ramp (the covered cutting and the tunnel mouth) sits on land rather than in a road.
const RAMP_GRADE = 0.05;
const PORTAL_Y = 3.5; // deck height where the covered ramp (tunnel mouth) begins
const NEAR_GROUND = [-7, 6]; // track heights where the ramp structure is at street level

export function metroRoutes(layout = null) {
  if (layout && layout._metroRoutes) return layout._metroRoutes;
  const onLand = (x, z) => { const b = layout.blockContaining(x, z); return b && !b.island; };
  const routes = METRO.map((line) => {
    const st0 = line.stations;
    const n = st0.length;
    const dirs = st0.map((s, i) => {
      const a = st0[Math.max(0, i - 1)], b = st0[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      return { x: dx / l, z: dz / l };
    });
    const ug = st0.map((s) => s.underground);
    // Two lines cross at Majestic, one above the other.
    const UG = line.short === 'green' ? UG_Y - 8 : UG_Y;
    function rampY(r, s, s1 = r.s1) {
      const k = Math.min(1, Math.max(0, (s - s1) / r.L));
      return r.up ? UG + (DECK_Y - UG) * k : DECK_Y + (UG - DECK_Y) * k;
    }
    // Lateral clearance of a stretch of track [sA, sB] shifted sideways by d: points off the land.
    const offLand = (path, sA, sB, d = 0) => {
      let bad = 0;
      for (let s = sA; s <= sB + 1e-6; s += 5) {
        const p = path.at(s), px = -p.dz, pz = p.dx;
        for (const o of [-5.5, 0, 5.5]) if (!onLand(p.x + px * (o + d), p.z + pz * (o + d))) bad++;
      }
      return bad;
    };
    // The street-level part of a ramp starting at s1: track between NEAR_GROUND heights.
    const lowPart = (r, s1) => {
      const at = (h) => { const k = (h - (r.up ? UG : DECK_Y)) / ((r.up ? DECK_Y : UG) - (r.up ? UG : DECK_Y)); return s1 + Math.min(1, Math.max(0, k)) * r.L; };
      const a = at(NEAR_GROUND[0]), b = at(NEAR_GROUND[1]);
      return [Math.min(a, b), Math.max(a, b)];
    };

    // Build the route through the stations; legs[i] = extra points between station i and i+1.
    const build = (legs = {}, fixed = {}) => {
      // Each station sits on a straight run of track (real platforms are straight): the route
      // passes through two points either side of it instead of bending at the station itself.
      const pts = [], sAt = [];
      const push = (x, z) => pts.push([x, z]);
      const tail = 70;
      push(st0[0].x - dirs[0].x * (ST_HALF + tail), st0[0].z - dirs[0].z * (ST_HALF + tail));
      st0.forEach((s, i) => {
        const gap = (j) => (j < 0 || j >= n ? Infinity : Math.hypot(st0[j].x - s.x, st0[j].z - s.z));
        const L = Math.min(ST_HALF + 6, 0.35 * Math.min(gap(i - 1), gap(i + 1)));
        sAt.push(pts.length);
        push(s.x - dirs[i].x * L, s.z - dirs[i].z * L);
        push(s.x + dirs[i].x * L, s.z + dirs[i].z * L);
        dirs[i].L = L;
        for (const p of legs[i] || []) push(p[0], p[1]);
      });
      push(st0[n - 1].x + dirs[n - 1].x * (ST_HALF + tail), st0[n - 1].z + dirs[n - 1].z * (ST_HALF + tail));
      const path = new Path(pts);
      const stations = st0.map((s, i) => ({ ...s, idx: i, s: path.cum[sAt[i]] + dirs[i].L, dir: { x: dirs[i].x, z: dirs[i].z }, line }));
      // Ramps between an underground and an elevated station: where each starts (s1), how long
      // it is, which way it climbs; placed so its street-level part is on land if possible.
      const ramps = [];
      for (let i = 0; i < n - 1; i++) {
        if (ug[i] === ug[i + 1]) continue;
        const sA = stations[i].s + ST_HALF + 15, sB = stations[i + 1].s - ST_HALF - 15;
        const L = Math.min((DECK_Y - UG) / RAMP_GRADE, Math.max(40, sB - sA));
        const ramp = { i, L, up: ug[i], s1: (sA + sB - L) / 2, bad: 0 };
        if (fixed[i]) { const p = path.project(fixed[i][0], fixed[i][1]).s; ramp.s1 = Math.max(sA, Math.min(sB - L, p)); }
        else if (layout && sB - sA > L) {
          let best = Infinity;
          for (let s1 = sA; s1 <= sB - L + 1e-6; s1 += 10) {
            const [la, lb] = lowPart(ramp, s1);
            const score = offLand(path, la, lb) * 100 + Math.abs(s1 - (sA + sB - L) / 2) / 100;
            if (score < best) { best = score; ramp.s1 = s1; }
          }
        }
        if (layout) { const [la, lb] = lowPart(ramp, ramp.s1); ramp.bad = offLand(path, la, lb); }
        ramps.push(ramp);
      }
      return { path, stations, ramps };
    };

    let { path, stations, ramps } = build();
    // A ramp whose street-level part would sit in a road: bend the line sideways into the
    // neighbouring block for that stretch (underground it can curve back under the road).
    if (layout) {
      const legs = {}, fixed = {};
      for (const r of ramps) {
        if (!r.bad) continue;
        const lo = stations[r.i].s + ST_HALF + 5, hi = stations[r.i + 1].s - ST_HALF - 5;
        // Every ramp position along the run, with every sideways shift: the least off-land wins
        // (then the smallest shift).
        let bestD = null, bestBad = r.bad, bestS1 = r.s1;
        for (let s1 = lo + 10; s1 <= hi - 10 - r.L + 1e-6; s1 += 10) {
          const [la, lb] = lowPart(r, s1);
          for (const d of [12, -12, 16, -16, 20, -20, 25, -25, 30, -30]) {
            const bad = offLand(path, la, lb, d);
            if (bad < bestBad) { bestBad = bad; bestD = d; bestS1 = s1; }
          }
        }
        if (bestD === null) continue;
        r.s1 = bestS1;
        const [la, lb] = lowPart(r, r.s1);
        const a = Math.max(lo, la - 45), b = Math.min(hi, lb + 45);
        const shifted = (s, d) => { const p = path.at(s); return [p.x - p.dz * d, p.z + p.dx * d]; };
        const leg = [shifted(a, 0)];
        for (let s = la; s <= lb + 1e-6; s += 10) leg.push(shifted(s, bestD));
        leg.push(shifted(lb, bestD), shifted(b, 0));
        legs[r.i] = leg;
        const p1 = path.at(r.s1);
        fixed[r.i] = [p1.x, p1.z];
      }
      if (Object.keys(legs).length) ({ path, stations, ramps } = build(legs, fixed));
    }

    // Track height along the route: deck height, or underground, ramping between.
    const yAt = (s) => {
      if (s <= stations[0].s) return ug[0] ? UG : DECK_Y;
      const last = stations.length - 1;
      if (s >= stations[last].s) return ug[last] ? UG : DECK_Y;
      let i = 0;
      while (i < last - 1 && stations[i + 1].s <= s) i++;
      if (ug[i] === ug[i + 1]) return ug[i] ? UG : DECK_Y;
      return rampY(ramps.find((r) => r.i === i), s);
    };
    const elevated = [];
    for (let i = 0; i < stations.length - 1; i++) if (!ug[i] || !ug[i + 1]) elevated.push([[stations[i].x, stations[i].z], [stations[i + 1].x, stations[i + 1].z]]);
    const route = { ...line, path, stations, yAt, elevated, ramps, ugY: UG };
    for (const st of stations) st.line = route;
    return route;
  });
  if (layout) layout._metroRoutes = routes;
  return routes;
}

// Where a train's head stops so the whole rake sits at the platform.
export const stopPoint = (st, dir) => st.s + dir * TRAIN_LEN / 2;

export function buildMetro(scene, layout, colliders) {
  const group = new THREE.Group();
  group.name = 'metro';
  scene.add(group);
  const mats = {
    concrete: withAO(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })),
    paint: withAO(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.55 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  const routes = metroRoutes(layout);
  // Piers stand on land, or in a road's median: never in a traffic lane. Null if neither.
  const pierSpot = (x, z) => {
    if (layout.blockContaining(x, z)) return [x, z];
    const h = layout.edgeAt(x, z);
    if (!h || h.d > h.e.r.width / 2 + 0.3) return [x, z];
    const e = h.e;
    // (Only if the median is under the deck: a pier more than 3.5 m off the track centre would miss it.)
    return (e.r.median || 0) >= 1 && h.d < 3.5 ? [e.a.x + (e.b.x - e.a.x) * h.t, e.a.z + (e.b.z - e.a.z) * h.t] : null;
  };
  const B = new BuilderSet({ chunk: 320, release: true });
  const con = B.get('concrete'), paint = B.get('paint'), metal = B.get('metal'), glass = B.get('glass'), glow = B.get('glow');
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 16);
  const concrete = 0xbfbab0;
  const boards = [];
  const inJunction = (x, z) => {
    const n = layout.nearestNode(x, z);
    if (!n || n.through) return false;
    const r = Math.max(...n.adj.map((h) => (n.cut.get(h.e.id) || 0))) + 3;
    return Math.hypot(n.x - x, n.z - z) < r;
  };
  const onRoadCentre = (x, z) => { const h = layout.edgeAt(x, z); return h && h.d < 3; };

  for (const line of routes) {
    const P = line.path;
    const at = {};
    const isStation = (s) => line.stations.some((st) => Math.abs(st.s - s) < ST_HALF);
    // Each ramp's covered section: from the portal (where the deck is PORTAL_Y up, or lower if a
    // street crosses there, so the street passes under the deck) until the track is underground.
    const landAt = (x, z) => { const b = layout.blockContaining(x, z); return b && !b.island; };
    for (const r of line.ramps) {
      const sAtY = (h) => { const k = (h - (r.up ? line.ugY : DECK_Y)) / ((r.up ? DECK_Y : line.ugY) - (r.up ? line.ugY : DECK_Y)); return r.s1 + Math.min(1, Math.max(0, k)) * r.L; };
      r.sAtY = sAtY;
      let portalY = PORTAL_Y;
      const a = sAtY(PORTAL_Y), b = sAtY(1), step = Math.sign(b - a) * 2;
      for (let s = a; step && (b - s) * step >= 0; s += step) {
        P.at(s, at);
        if (!landAt(at.x, at.z)) portalY = Math.min(portalY, line.yAt(s) - 0.6);
      }
      r.portalY = Math.max(0.5, portalY);
      r.sHi = sAtY(r.portalY); r.sLo = sAtY(-5.5);
    }
    const covered = (s) => line.ramps.some((r) => (s - r.sHi) * (s - r.sLo) <= 0);

    // ---------- Viaduct ----------
    const PIECE = 10;
    for (let s = 0; s < P.length - 1e-6; s += PIECE) {
      const l = Math.min(PIECE, P.length - s);
      const y = line.yAt(s + l / 2);
      if (y < 0.5 || covered(s + l / 2)) continue; // inside a covered ramp, or underground
      P.at(s + l / 2, at);
      const f = makeFrame(at.x, at.z, Math.atan2(-at.dz, at.dx));
      B.xf = f;
      con.box(0, y, 0, l + 0.05, 1.6, 9.5, concrete, { bottom: true });
      if (y < 6) {
        // Too low for piers near the portal: a solid wall carries the deck on land; over a street
        // it's a short bridge (cars pass under, the deck itself still blocks anything taller).
        if (landAt(at.x, at.z)) { con.box(0, 0, 0, l + 0.05, y, 6.5, 0xb4afa5); colliders.framed(f).addCentered(0, 0, l, 6.5, y, 'wall'); }
        else colliders.framed(f).addCentered(0, 0, l, 9.5, y + 1.6, 'wall', y);
      }
      for (const sd of [-1, 1]) {
        con.box(0, y + 1.6, sd * 4.6, l + 0.05, 1.1, 0.3, 0xd8d4cc);
        paint.box(0, y + 1.0, sd * 4.76, l + 0.05, 0.35, 0.02, line.color, { top: false });
      }
      for (const tz of [-TRACK, TRACK]) for (const o of [-0.75, 0.75]) metal.box(0, y + 1.6, tz + o, l + 0.05, 0.15, 0.1, 0x7a7a7a);
      B.xf = null;
    }
    // ---------- Covered ramps and tunnel portals ----------
    // From where the deck gets low (PORTAL_Y) until the track is below ground, it runs inside a
    // concrete box whose roof follows it down; trains vanish into a dark portal at the high end.
    for (const r of line.ramps) {
      const yOf = (s) => line.yAt(s);
      const { sHi, sLo } = r;
      const dir = sLo > sHi ? 1 : -1; // from the portal into the tunnel
      const len = Math.abs(sLo - sHi), n = Math.max(1, Math.ceil(len / 4));
      for (let k = 0; k < n; k++) {
        const sm = sHi + dir * (k + 0.5) * (len / n);
        const roof = Math.max(0.5, yOf(sm) + 6.4);
        P.at(sm, at);
        const f = makeFrame(at.x, at.z, Math.atan2(-at.dz, at.dx));
        B.xf = f;
        con.box(0, 0, 0, len / n + 0.1, roof, 11, 0xb8b3a8);
        for (const sd of [-1, 1]) paint.box(0, Math.max(0, roof - 0.9), sd * 5.52, len / n + 0.1, 0.4, 0.04, line.color, { top: false });
        colliders.framed(f).addCentered(0, 0, len / n, 11, roof, 'wall');
      }
      // The portal: a dark opening the size of a train, framed, with the line's colour on the lintel.
      const yHi = yOf(sHi);
      P.at(sHi, at);
      B.xf = makeFrame(at.x, at.z, Math.atan2(-at.dz, at.dx));
      glow.box(-dir * 0.06, yHi + 1.5, 0, 0.12, 4.9, 8.6, 0x040404);
      con.box(-dir * 0.35, yHi + 6.4, 0, 0.7, 1.2, 11.6, 0xc8c3b8);
      paint.box(-dir * 0.72, yHi + 6.7, 0, 0.04, 0.6, 9, line.color, { top: false });
      for (const sd of [-1, 1]) con.box(-dir * 0.35, 0, sd * 5.1, 0.7, yHi + 6.4, 1.4, 0xc8c3b8);
      B.xf = null;
    }
    // Piers, kept out of junctions and traffic lanes.
    for (let s = 15; s < P.length - 5; s += 30) {
      const y = line.yAt(s);
      if (y < 4 || isStation(s)) continue;
      let spot = null;
      for (const d of [0, 6, -6, 12, -12]) {
        P.at(s + d, at);
        if (inJunction(at.x, at.z)) continue;
        spot = pierSpot(at.x, at.z);
        if (spot) break;
      }
      if (!spot) continue;
      const [px, pz] = spot;
      put(con, cyl, px, y / 2, pz, concrete, 0, 0.95, y, 0.95);
      B.xf = makeFrame(px, pz, Math.atan2(-at.dz, at.dx));
      con.box(0, y - 1.2, 0, 2.4, 1.2, 7, concrete);
      B.xf = null;
      colliders.addCentered(px, pz, 1.9, 1.9, y, 'pier');
    }
    // ---------- Stations ----------
    for (const st of line.stations) {
      // Interchange (Majestic): each line has its own hall; the street entrances are shared.
      const twin = routes.filter((r) => r !== line).map((r) => r.stations.find((q) => q.en === st.en)).find(Boolean);
      if (twin) { st.interchange = true; twin.interchange = true; }
      const ang = Math.atan2(-st.dir.z, st.dir.x);
      const f = makeFrame(st.x, st.z, ang);
      const col = colliders.framed(f);
      const hex = '#' + line.color.toString(16).padStart(6, '0');
      B.xf = f;
      if (!st.underground) {
        const Y = DECK_Y;
        st.platformY = Y + 1.6;
        con.box(0, Y - 1.5, 0, ST_HALF * 2, 1.5, 22, 0xd0ccc4, { bottom: true });
        for (const sd of [-1, 1]) {
          con.box(0, Y + 0.0, sd * 6.2, ST_HALF * 2, 1.6, 4.6, 0xd8d2c8); // platforms
          paint.box(0, Y + 1.6, sd * 4.05, ST_HALF * 2, 0.02, 0.3, 0xf2c200, { top: true, sides: false });
          paint.box(0, Y, sd * 11.05, ST_HALF * 2, 1.2, 0.1, line.color, { top: false });
          glass.box(0, Y + 1.6, sd * 10.9, ST_HALF * 2, 4.4, 0.1, 0x9fb8c8, { top: false });
        }
        paint.box(0, Y + 7.2, 0, ST_HALF * 2 + 2, 0.6, 24, 0xf2f2f2);
        for (let x = -ST_HALF + 4; x <= ST_HALF - 4; x += 12) for (const sd of [-1, 1]) put(metal, cyl, x, Y + 4.4, sd * 8, 0x8a9aa8, 0, 0.15, 5.6, 0.15);
        // (Station piers that would land in a traffic lane are left out.)
        const clearOfLanes = (lx, lz) => { const [wx, wz] = frameToWorld(f, lx, lz); const p = pierSpot(wx, wz); return p && Math.hypot(p[0] - wx, p[1] - wz) < 0.5; };
        for (const px of [-ST_HALF + 6, ST_HALF - 6]) {
          for (const sd of [-1, 1]) {
            const pz = sd * 9;
            if (!clearOfLanes(px, pz)) continue;
            put(con, cyl, px, Y / 2, pz, concrete, 0, 0.7, Y, 0.7);
            col.addCentered(px, pz, 1.4, 1.4, Y, 'pier');
          }
          if (!clearOfLanes(px, 0)) continue;
          put(con, cyl, px, Y / 2, 0, concrete, 0, 0.9, Y, 0.9);
          col.addCentered(px, 0, 1.8, 1.8, Y, 'pier');
        }
        for (const sd of [-1, 1]) boards.push({ text: [st.kn, st.en.toUpperCase()], bg: hex, x: 0, y: Y + 5.5, z: sd * 12.1, rot: sd < 0 ? Math.PI : 0, w: 16, h: 3.5, f });
        // Platform name boards inside.
        for (const sd of [-1, 1]) for (const x of [-18, 18]) boards.push({ text: [st.kn, st.en], bg: '#1a1a1a', fg: '#ffffff', x, y: Y + 4.3, z: sd * 10.7, rot: sd < 0 ? 0 : Math.PI, w: 6, h: 1.2, f });
      } else {
        // Underground hall: platforms either side of the two tracks.
        const Y = line.ugY;
        st.platformY = Y + 1.6;
        con.box(0, Y - 0.6, 0, ST_HALF * 2 + 4, 0.6, 26, 0x9a9488);
        con.box(0, Y, 0, ST_HALF * 2 + 4, 1.45, 7.8, 0x6e665e);
        for (const tz of [-TRACK, TRACK]) for (const o of [-0.75, 0.75]) metal.box(0, Y + 1.45, tz + o, ST_HALF * 2 + 4, 0.15, 0.1, 0x7a7a7a);
        for (const sd of [-1, 1]) {
          con.box(0, Y, sd * 6.95, ST_HALF * 2, 1.6, 6.1, 0xe0dcd4);
          paint.box(0, Y + 1.6, sd * 4.2, ST_HALF * 2, 0.02, 0.3, 0xf2c200, { sides: false });
          con.box(0, Y, sd * 12.8, ST_HALF * 2 + 4, 6, 0.4, 0xd8d2c8);
          paint.box(0, Y + 1.6, sd * 12.55, ST_HALF * 2, 0.5, 0.1, line.color, { top: false });
        }
        for (const ex of [-1, 1]) con.box(ex * (ST_HALF + 2), Y, 0, 0.4, 6, 26, 0xd8d2c8);
        con.box(0, Y + 6, 0, ST_HALF * 2 + 4, 0.4, 26, 0xc8c2b8, { bottom: true });
        for (let x = -ST_HALF + 3; x <= ST_HALF - 3; x += 6) for (const sd of [-1, 1]) glow.box(x, Y + 5.7, sd * 7, 3.6, 0.1, 0.4, 0xf8f4e8);
        for (const sd of [-1, 1]) for (const x of [-20, 0, 20]) boards.push({ text: [st.kn, st.en], bg: hex, x, y: Y + 3.6, z: sd * 12.5, rot: sd < 0 ? 0 : Math.PI, w: 7, h: 1.4, f });
      }
      B.xf = null;
      // Street entrances: the nearest footpath on either side of the station.
      if (twin && twin.entrances) { st.entrances = twin.entrances; continue; }
      st.entrances = [];
      for (const sd of [-1, 1]) {
        for (let d = 8; d < 40; d += 2) {
          const ex = st.x - st.dir.z * d * sd, ez = st.z + st.dir.x * d * sd;
          const blk = layout.blockContaining(ex, ez);
          const ef = makeFrame(ex, ez, ang + (sd < 0 ? 0 : Math.PI));
          // The whole kiosk on the footpath, not hanging over the road.
          const onLand = [[-2.7, -2.2], [2.7, -2.2], [2.7, 1.8], [-2.7, 1.8]].every(([lx, lz]) => { const [x, z] = frameToWorld(ef, lx, lz); const b = layout.blockContaining(x, z); return b && !b.island; });
          if (blk && !blk.island && onLand && !colliders.pointBlocked(ex, ez, 1)) {
            B.xf = ef;
            con.box(0, 0.15, 0, 5, 3.2, 3, 0xe8e4dc);
            paint.box(0, 3.35, 0, 5.4, 0.5, 3.4, line.color);
            glass.box(0, 0.15, 1.52, 3, 2.6, 0.05, 0x9fb8c8, { top: false });
            B.xf = null;
            colliders.framed(ef).addCentered(0, -0.6, 5, 1.8, 3.4, 'building');
            boards.push({ text: ['ನಮ್ಮ ಮೆಟ್ರೋ', 'NAMMA METRO · ' + st.en.toUpperCase()], bg: hex, x: 0, y: 4.2, z: 1.72, rot: 0, w: 5.4, h: 1.1, f: ef });
            const [fx, fz] = [ex + Math.sin(ef.ang) * 2.8, ez + Math.cos(ef.ang) * 2.8];
            st.entrances.push({ x: fx, z: fz });
            break;
          }
        }
      }
      if (!st.entrances.length) st.entrances.push({ x: st.x, z: st.z });
    }
  }
  B.buildAll(mats, group);
  const boardMats = new Map();
  for (const bd of boards) {
    const key = bd.text.join('|') + bd.bg;
    if (!boardMats.has(key)) boardMats.set(key, new THREE.MeshBasicMaterial({ map: textTexture(bd.text, { bg: bd.bg, fg: bd.fg || '#ffffff', w: 1024, h: Math.round(1024 * bd.h / bd.w), scale: textScale(bd.w) }), toneMapped: false }));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(bd.w, bd.h), boardMats.get(key));
    const f = bd.f;
    m.position.set(f.ox + bd.x * f.c + bd.z * f.s, bd.y, f.oz - bd.x * f.s + bd.z * f.c);
    m.rotation.y = f.ang + bd.rot;
    group.add(m);
  }

  // ---------- Trains ----------
  const cars = carGeometries(mats);
  const trains = [];
  for (const line of routes) {
    const n = 3; // per direction
    for (let k = 0; k < n; k++) {
      for (const dir of [1, -1]) {
        const s = dir > 0 ? (line.path.length * (k + 0.15)) / n : (line.path.length * (k + 0.65)) / n;
        trains.push(makeTrain(cars, group, line, dir, s));
      }
    }
  }
  const tmp = {};
  const update = (dt, world) => {
    for (const t of trains) {
      const P = t.line.path;
      if (t.wait > 0) {
        t.wait -= dt;
        t.doors = t.wait > 2 && t.wait < DWELL - 1.5;
        if (t.wait <= 0) { t.doors = false; if (t.reverse) { t.reverse = false; t.s -= t.dir * TRAIN_LEN; t.dir = -t.dir; } }
      } else {
        // The next stop ahead.
        let next = null, nd = Infinity;
        for (const st of t.line.stations) {
          const d = (stopPoint(st, t.dir) - t.s) * t.dir;
          if (d > 0.3 && d < nd) { nd = d; next = st; }
        }
        let target = t.cruise;
        if (next && nd < 260) target = Math.min(target, Math.max(1.2, Math.sqrt(2 * 1.8 * nd)));
        t.speed += Math.sign(target - t.speed) * Math.min(Math.abs(target - t.speed), (target > t.speed ? 2.2 : 2.6) * dt);
        t.s += t.speed * t.dir * dt;
        t.at = null;
        if (next && (stopPoint(next, t.dir) - t.s) * t.dir < 0.4) {
          t.s = stopPoint(next, t.dir); t.speed = 0; t.wait = DWELL; t.at = next;
          // The far terminus: the rear cab takes over for the return run.
          if ((t.dir > 0 && next.idx === t.line.stations.length - 1) || (t.dir < 0 && next.idx === 0)) t.reverse = true;
        }
      }
      const off = t.dir > 0 ? TRACK : -TRACK; // left-hand running
      for (const c of t.cars) {
        const s = t.s - t.dir * c.off;
        P.at(s, tmp);
        const y = t.line.yAt(s);
        c.mesh.position.set(tmp.x + tmp.dz * off, y + 1.6, tmp.z - tmp.dx * off);
        c.mesh.rotation.y = Math.atan2(-tmp.dz * t.dir, tmp.dx * t.dir);
        c.mesh.visible = y > -1 || !world || Math.hypot(tmp.x - world.focus.x, tmp.z - world.focus.z) < 150;
      }
      P.at(t.s - t.dir * TRAIN_LEN / 2, tmp);
      t.x = tmp.x + tmp.dz * off; t.z = tmp.z - tmp.dx * off; t.y = t.line.yAt(t.s - t.dir * TRAIN_LEN / 2) + 1.6;
      t.hx = tmp.dx * t.dir; t.hz = tmp.dz * t.dir;
    }
  };
  update(0);
  return { update, group, trains, routes };
}

// One car along local +x (length CAR), with optional cab at +x.
function carGeometries(mats) {
  const build = (color, cab) => {
    const B = new BuilderSet();
    const p = B.get('paint'), g = B.get('glass'), m = B.get('metal');
    const len = CAR, Y = 0;
    const steel = 0xb8bcc0, doorCol = 0xa2a6aa, dark = 0x3a3d42;
    m.box(0, Y + 0.7, 0, len, 2.7, 2.9, steel, { bottom: true });
    p.box(0, Y + 0.4, 0, len, 0.32, 2.86, 0x55595e, { top: false });
    p.box(0, Y + 3.4, 0, len - 0.4, 0.1, 2.5, 0x8a8e92);
    for (const rx of [-5, 3]) p.box(rx, Y + 3.5, 0, 2.4, 0.3, 1.6, 0x9a9ea2);
    p.box(0, Y + 1.35, 0, len, 0.14, 2.94, color, { top: false });
    for (const dx of [-7.5, -2.5, 2.5, 7.5]) {
      p.box(dx, Y + 0.73, 0, 1.4, 2.3, 2.92, doorCol, { top: false });
      p.box(dx, Y + 1.35, 0, 1.4, 0.14, 2.95, color, { top: false });
      for (const o of [-0.33, 0.33]) g.box(dx + o, Y + 1.65, 0, 0.5, 1.15, 2.96, 0x161c22, { top: false });
    }
    for (const wx of [-5, 0, 5]) g.box(wx, Y + 1.7, 0, 2.6, 1.0, 2.94, 0x161c22, { top: false });
    for (const bx of [-6.5, 6.5]) p.box(bx, Y + 0.1, 0, 2.6, 0.45, 2.2, 0x2a2a2a, { top: false });
    if (cab) {
      const at = (d) => len / 2 + d;
      m.box(at(0.25), Y + 0.4, 0, 0.5, 0.6, 2.8, steel);
      p.box(at(0.4), Y + 0.45, 0, 0.3, 0.25, 0.6, 0x2a2a2a);
      p.box(at(0.12), Y + 1.0, 0, 0.24, 2.4, 2.9, color);
      p.box(at(0.25), Y + 1.1, 0, 0.06, 0.75, 2.4, dark);
      g.box(at(0.25), Y + 1.95, 0, 0.06, 1.25, 2.3, 0x10161c);
      p.box(at(0.29), Y + 3.0, 0, 0.03, 0.18, 0.9, 0xffa020);
      for (const hz of [-0.95, -0.72, 0.72, 0.95]) p.box(at(0.29), Y + 1.35, hz, 0.03, 0.13, 0.13, 0xf8f6ee);
    } else p.box(len / 2 + 0.3, Y + 0.7, 0, 0.7, 2.6, 2.2, 0x2a2a2a);
    const group = new THREE.Group();
    B.buildAll({ paint: mats.paint, glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.6 }), metal: mats.metal }, group);
    return group;
  };
  const out = {};
  for (const l of METRO) out[l.short] = { cab: build(l.color, true), mid: build(l.color, false) };
  return out;
}

function makeTrain(cars, group, line, dir, s) {
  const set = cars[line.short];
  const list = [];
  for (let k = 0; k < CARS; k++) {
    const front = k === 0, back = k === CARS - 1;
    const mesh = (front || back ? set.cab : set.mid).clone();
    // The rear cab faces backwards.
    const inner = mesh;
    if (back) { const g = new THREE.Group(); inner.rotation.y = Math.PI; g.add(inner); list.push({ mesh: g, off: CAR / 2 + k * (CAR + 0.6) }); group.add(g); continue; }
    list.push({ mesh, off: CAR / 2 + k * (CAR + 0.6) });
    group.add(mesh);
  }
  return { line, cars: list, s, dir, speed: 0, cruise: 22 + Math.random() * 2, wait: 0, at: null, doors: false, reverse: false, x: 0, z: 0, y: 0 };
}
