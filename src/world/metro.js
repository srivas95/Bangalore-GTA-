// Namma Metro: the Purple and Green lines on their real alignments. Elevated viaducts over the
// arterials, underground halls in the city centre, stations with street entrances, and BEML
// trainsets running in both directions and stopping at every station.
import * as THREE from 'three';
import { BuilderSet, MeshBuilder, makeFrame, frameToWorld, makePbrMaterial } from './meshBuilder.js';
import { put } from './landmarks.js';
import { paintText } from './textures.js';
import { SignAtlas } from './signAtlas.js';
import { textScale } from './detail.js';
import { withAO } from './ao.js';
import { Path } from './path.js';
import { METRO } from './mapdata.js';

export const DECK_Y = 9.5;
export const UG_Y = -12; // underground platform level (the Green Line runs a level deeper)
const ST_HALF = 34;
const PLAT = 2.2; // platform top above the deck (or the hall floor): level with the train's floor
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
const CURVE_R = 150; // radius the route's bends are eased into
const VERTICAL_CURVE = 36; // length of the eased change of grade at each end of a ramp

// Round a polyline's corners into curves: a cubic Bézier between the tangent points of each
// bend, sampled every couple of metres. Segments listed in `platforms` (station straights) keep
// a straight middle as long as a train, so trains still stand straight at the platform.
function roundCorners(pts0, platforms0) {
  // Drop points that only follow a straight line (the ramp detours come as 10 m polylines), so
  // each real bend has its whole neighbouring straights to curve over. Platform ends stay.
  const keep = new Set([0, pts0.length - 1]);
  for (const i of platforms0) { keep.add(i); keep.add(i + 1); }
  const kept = simplify(pts0, keep, 0.8);
  const pts = kept.map((i) => pts0[i]);
  const platforms = new Set();
  kept.forEach((i, k) => { if (platforms0.has(i) && kept[k + 1] === i + 1) platforms.add(k); });
  const out = [pts[0]];
  const len = (i) => Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  const room = (i) => (platforms.has(i) ? Math.max(1.5, len(i) / 2 - ST_HALF - 1) : len(i) * 0.48);
  for (let k = 1; k < pts.length - 1; k++) {
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k], [cx, cz] = pts[k + 1];
    const l1 = Math.hypot(bx - ax, bz - az) || 1, l2 = Math.hypot(cx - bx, cz - bz) || 1;
    const d1x = (bx - ax) / l1, d1z = (bz - az) / l1, d2x = (cx - bx) / l2, d2z = (cz - bz) / l2;
    const turn = Math.acos(Math.max(-1, Math.min(1, d1x * d2x + d1z * d2z)));
    if (turn < 0.004) { out.push(pts[k]); continue; }
    const want = CURVE_R * Math.tan(Math.min(turn, 2.6) / 2);
    const tIn = Math.min(want, room(k - 1)), tOut = Math.min(want, room(k));
    const p0 = [bx - d1x * tIn, bz - d1z * tIn], p3 = [bx + d2x * tOut, bz + d2z * tOut];
    // Control arms inside the corner's triangle (a near-circular arc when the trims match), so
    // the curve can't loop.
    const p1 = [p0[0] + d1x * tIn * 0.55, p0[1] + d1z * tIn * 0.55], p2 = [p3[0] - d2x * tOut * 0.55, p3[1] - d2z * tOut * 0.55];
    const n = Math.max(2, Math.ceil((tIn + tOut) / 2.5));
    for (let j = 0; j <= n; j++) {
      const t = j / n, u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
  }
  out.push(pts[pts.length - 1]);
  // Drop repeated points (zero-length segments).
  return out.filter((p, i) => i === 0 || Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 1e-3);
}

// Douglas-Peucker: indices of the points to keep (always those in `keep`) so that the polyline
// stays within `tol` metres of the original.
function simplify(pts, keep, tol) {
  const idx = [...keep].sort((a, b) => a - b), out = new Set(idx);
  const dist = (p, a, b) => {
    const abx = b[0] - a[0], abz = b[1] - a[1], l2 = abx * abx + abz * abz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2));
    return Math.hypot(a[0] + abx * t - p[0], a[1] + abz * t - p[1]);
  };
  const run = (i, j) => {
    let worst = -1, wd = tol;
    for (let k = i + 1; k < j; k++) { const d = dist(pts[k], pts[i], pts[j]); if (d > wd) { wd = d; worst = k; } }
    if (worst < 0) return;
    out.add(worst); run(i, worst); run(worst, j);
  };
  for (let k = 0; k < idx.length - 1; k++) run(idx[k], idx[k + 1]);
  return [...out].sort((a, b) => a - b);
}

// How far up a ramp of length L a point x along it is (0..1): linear, with the change of grade
// at each end eased over a parabolic vertical curve (a moving average of the straight ramp).
function rampFrac(x, L) {
  const h = Math.min(VERTICAL_CURVE, L * 0.4) / 2;
  const F = (u) => (u <= 0 ? 0 : u >= L ? L / 2 + (u - L) : (u * u) / (2 * L));
  return (F(x + h) - F(x - h)) / (2 * h);
}

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
      const k = rampFrac(s - s1, r.L);
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
        // (Long enough that the track can start curving beyond the platform's end.)
        const L = Math.min(ST_HALF + 26, 0.3 * Math.min(gap(i - 1), gap(i + 1)));
        sAt.push(pts.length);
        push(s.x - dirs[i].x * L, s.z - dirs[i].z * L);
        push(s.x + dirs[i].x * L, s.z + dirs[i].z * L);
        dirs[i].L = L;
        for (const p of legs[i] || []) push(p[0], p[1]);
      });
      push(st0[n - 1].x + dirs[n - 1].x * (ST_HALF + tail), st0[n - 1].z + dirs[n - 1].z * (ST_HALF + tail));
      const path = new Path(roundCorners(pts, new Set(sAt)));
      const stations = st0.map((s, i) => ({ ...s, idx: i, s: path.project(s.x, s.z).s, dir: { x: dirs[i].x, z: dirs[i].z }, line }));
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
        // (Beyond the stations' straights, or the route would double back on itself.)
        const lo = stations[r.i].s + Math.max(ST_HALF + 5, dirs[r.i].L + 2), hi = stations[r.i + 1].s - Math.max(ST_HALF + 5, dirs[r.i + 1].L + 2);
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
    // Ten-metre pieces on the straights, short ones round the bends so the deck follows the curve.
    const t0 = {}, t1 = {};
    for (let s = 0, piece = 10; s < P.length - 1e-6; s += piece) {
      P.at(s, t0); P.at(Math.min(P.length, s + 10), t1);
      piece = t0.dx * t1.dx + t0.dz * t1.dz < 0.9995 ? 2.5 : 10;
      const l = Math.min(piece, P.length - s);
      const y = line.yAt(s + l / 2);
      if (y < 0.5 || covered(s + l / 2)) continue; // inside a covered ramp, or underground
      P.at(s + l / 2, at);
      const f = makeFrame(at.x, at.z, Math.atan2(-at.dz, at.dx));
      B.xf = f;
      con.box(0, y, 0, l + 0.12, 1.6, 9.5, concrete, { bottom: true });
      if (y < 6) {
        // Too low for piers near the portal: a solid wall carries the deck on land; over a street
        // it's a short bridge (cars pass under, the deck itself still blocks anything taller).
        if (landAt(at.x, at.z)) { con.box(0, 0, 0, l + 0.12, y, 6.5, 0xb4afa5); colliders.framed(f).addCentered(0, 0, l, 6.5, y, 'wall'); }
        else colliders.framed(f).addCentered(0, 0, l, 9.5, y + 1.6, 'wall', y);
      }
      for (const sd of [-1, 1]) {
        con.box(0, y + 1.6, sd * 4.6, l + 0.12, 1.1, 0.3, 0xd8d4cc);
        paint.box(0, y + 1.0, sd * 4.76, l + 0.12, 0.35, 0.02, line.color, { top: false });
      }
      for (const tz of [-TRACK, TRACK]) for (const o of [-0.75, 0.75]) metal.box(0, y + 1.6, tz + o, l + 0.12, 0.15, 0.1, 0x7a7a7a);
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
        st.platformY = Y + PLAT;
        con.box(0, Y - 1.5, 0, ST_HALF * 2, 1.5, 22, 0xd0ccc4, { bottom: true });
        for (const sd of [-1, 1]) {
          con.box(0, Y + 0.0, sd * 6.2, ST_HALF * 2, PLAT, 4.6, 0xd8d2c8); // platforms
          paint.box(0, Y + PLAT, sd * 4.05, ST_HALF * 2, 0.02, 0.3, 0xf2c200, { top: true, sides: false });
          paint.box(0, Y, sd * 11.05, ST_HALF * 2, 1.2, 0.1, line.color, { top: false });
          glass.box(0, Y + PLAT, sd * 10.9, ST_HALF * 2, 3.8, 0.1, 0x9fb8c8, { top: false });
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
        st.platformY = Y + PLAT;
        con.box(0, Y - 0.6, 0, ST_HALF * 2 + 4, 0.6, 26, 0x9a9488);
        con.box(0, Y, 0, ST_HALF * 2 + 4, 1.6, 7.8, 0x6e665e);
        for (const tz of [-TRACK, TRACK]) for (const o of [-0.75, 0.75]) metal.box(0, Y + 1.6, tz + o, ST_HALF * 2 + 4, 0.15, 0.1, 0x7a7a7a);
        for (const sd of [-1, 1]) {
          con.box(0, Y, sd * 6.95, ST_HALF * 2, PLAT, 6.1, 0xe0dcd4);
          paint.box(0, Y + PLAT, sd * 4.2, ST_HALF * 2, 0.02, 0.3, 0xf2c200, { sides: false });
          con.box(0, Y, sd * 12.8, ST_HALF * 2 + 4, 6, 0.4, 0xd8d2c8);
          paint.box(0, Y + PLAT, sd * 12.55, ST_HALF * 2, 0.5, 0.1, line.color, { top: false });
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
  // Station boards: one shared atlas (lit, so not tone-mapped).
  const atlas = new SignAtlas();
  for (const bd of boards) {
    const key = bd.text.join('|') + bd.bg, sc = textScale(bd.w), W = 1024, H = Math.round((1024 * bd.h) / bd.w);
    const slot = atlas.slot(key, W * sc, H * sc, (ctx, pw, ph) => paintText(ctx, bd.text, pw, ph, { bg: bd.bg, fg: bd.fg || '#ffffff', w: W, h: H }));
    const f = bd.f;
    atlas.quad(slot, bd.w, bd.h, f.ox + bd.x * f.c + bd.z * f.s, bd.y, f.oz - bd.x * f.s + bd.z * f.c, f.ang + bd.rot);
  }
  atlas.build(group, (t) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), { name: 'boards' });

  // ---------- Trains ----------
  // Each car rides on two bogies 14 m apart that follow the track: the car body is the chord
  // between them (so it overhangs the curve), pitched on ramps and canted into bends. Bogies,
  // gangways and the platform-side door leaves are instanced (one draw call each).
  const trainMat = makePbrMaterial({ envMapIntensity: 1.1 });
  const geos = {};
  for (const l of METRO) geos[l.short] = { front: carGeometry(l.color, 'front'), mid: carGeometry(l.color, 'mid'), rear: carGeometry(l.color, 'rear') };
  const trains = [];
  for (const line of routes) {
    const n = 3; // per direction
    for (let k = 0; k < n; k++) {
      for (const dir of [1, -1]) {
        const s = dir > 0 ? (line.path.length * (k + 0.15)) / n : (line.path.length * (k + 0.65)) / n;
        trains.push(makeTrain(geos, trainMat, group, line, dir, s));
      }
    }
  }
  const nCars = trains.length * CARS;
  const parts = {
    bogie: new THREE.InstancedMesh(bogieGeometry(), trainMat, nCars * 2),
    gangway: new THREE.InstancedMesh(gangwayGeometry(), trainMat, trains.length * (CARS - 1)),
    leaf: new THREE.InstancedMesh(leafGeometry(), trainMat, nCars * DOORS.length * 2),
  };
  for (const m of Object.values(parts)) {
    m.frustumCulled = false;
    m.castShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
  }
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YZX';
  const local = new THREE.Matrix4(), mat = new THREE.Matrix4();
  const bA = {}, bB = {}, tmp = {};
  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  // A point on this train's track, at rail height.
  const trackAt = (t, s, out) => {
    const off = t.dir > 0 ? TRACK : -TRACK; // left-hand running
    t.line.path.at(s, out);
    out.x += out.dz * off; out.z -= out.dx * off;
    out.y = t.line.yAt(s) + RAIL;
    return out;
  };
  // The train ahead of `t` on its track (same line, same direction): gap from t's head to its tail.
  const ahead = (t, s = t.s) => {
    let gap = Infinity, who = null;
    for (const o of trains) {
      if (o === t || o.line !== t.line || o.dir !== t.dir) continue;
      const g = (o.s - o.dir * TRAIN_LEN - s) * t.dir;
      if (g > -TRAIN_LEN && g < gap) { gap = g; who = o; }
    }
    return { gap, who };
  };
  const behind = (t, s = t.s) => {
    let gap = Infinity, who = null;
    for (const o of trains) {
      if (o === t || o.line !== t.line || o.dir !== t.dir) continue;
      const g = (s - t.dir * TRAIN_LEN - o.s) * t.dir;
      if (g > -TRAIN_LEN && g < gap) { gap = g; who = o; }
    }
    return { gap, who };
  };

  // Service trains: run to the next stop, dwell, reverse at the termini, and keep a safe
  // distance behind whatever is ahead on the same track (moving-block signalling).
  const driveAI = (t, dt) => {
    if (t.wait > 0) {
      t.wait -= dt;
      t.doors = t.wait > 2 && t.wait < DWELL - 1.5 && !!t.at;
      if (t.wait <= 0) { t.doors = false; if (t.reverse) { t.reverse = false; t.s -= t.dir * TRAIN_LEN; t.dir = -t.dir; } }
      return;
    }
    let next = null, nd = Infinity;
    for (const st of t.line.stations) {
      const d = (stopPoint(st, t.dir) - t.s) * t.dir;
      if (d > 0.3 && d < nd) { nd = d; next = st; }
    }
    // Past the last station (left there by a hijacker): turn back.
    if (!next) { t.speed = 0; t.wait = 4; t.reverse = true; t.at = null; return; }
    let target = t.cruise;
    if (nd < 260) target = Math.min(target, Math.max(1.2, Math.sqrt(2 * 1.8 * nd)));
    const { gap } = ahead(t);
    if (gap < 400) target = Math.min(target, Math.sqrt(2 * 1.6 * Math.max(0, gap - 30)));
    if (t.stunned > 0) { t.stunned -= dt; target = 0; }
    t.speed = Math.max(0, t.speed + Math.sign(target - t.speed) * Math.min(Math.abs(target - t.speed), (target > t.speed ? 2.2 : 2.6) * dt));
    t.s += t.speed * t.dir * dt;
    t.at = null;
    if ((stopPoint(next, t.dir) - t.s) * t.dir < 0.4) {
      t.s = stopPoint(next, t.dir); t.speed = 0; t.wait = DWELL; t.at = next;
      // The far terminus: the rear cab takes over for the return run.
      if ((t.dir > 0 && next.idx === t.line.stations.length - 1) || (t.dir < 0 && next.idx === 0)) t.reverse = true;
    }
  };

  // A train driven by the player (see systems/metroDrive.js): t.ctrl = {throttle -1..1, ebrake}.
  // Speed is signed (negative = backing up). Buffers at the line's ends and other trains on the
  // same track stop it, hard if it's going fast.
  const drivePlayer = (t, dt) => {
    const c = t.ctrl || {}, v = t.speed;
    let a;
    if (c.ebrake) a = -Math.sign(v) * 3.6;
    else if (c.throttle > 0.05) a = v < -0.1 ? 1.9 * c.throttle : 1.4 * c.throttle * Math.max(0, 1 - Math.max(0, v) / 31);
    else if (c.throttle < -0.05) a = v > 0.1 ? 1.9 * c.throttle : v > -6 ? 0.7 * c.throttle : 0;
    else a = -Math.sign(v) * 0.1; // rolling resistance
    let nv = v + a * dt;
    if (a * v < 0 && nv * v < 0) nv = 0; // brakes stop the train, they don't reverse it
    let ns = t.s + nv * t.dir * dt;
    let impact = 0, hit = null;
    // Buffer stops.
    const P = t.line.path;
    const lo = Math.min(ns, ns - t.dir * TRAIN_LEN), hi = Math.max(ns, ns - t.dir * TRAIN_LEN);
    if (lo < 0) { ns -= lo; impact = Math.abs(nv); nv = 0; }
    else if (hi > P.length) { ns -= hi - P.length; impact = Math.abs(nv); nv = 0; }
    // Trains ahead (going forward) or behind (backing up).
    if (nv > 0 || (nv === 0 && v > 0)) {
      const { gap, who } = ahead(t, ns);
      if (who && gap < 0.2) { ns -= (0.2 - gap) * t.dir; impact = Math.max(impact, Math.abs(nv) + (who.speed || 0)); hit = who; nv = 0; }
    } else if (nv < 0) {
      const { gap, who } = behind(t, ns);
      if (who && gap < 0.2) { ns += (0.2 - gap) * t.dir; impact = Math.max(impact, Math.abs(nv)); hit = who; nv = 0; }
    }
    if (hit) { hit.speed = 0; hit.stunned = 4; }
    t.s = ns; t.speed = nv;
    t.at = null; t.wait = 0; t.doors = false; t.reverse = false;
    if (impact > 1.5) t.onCrash?.(impact, hit);
  };

  const update = (dt, world) => {
    for (const t of trains) { if (t.driver === 'player') drivePlayer(t, dt); else driveAI(t, dt); }
    const cam = world?.camera?.position || world?.focus;
    let bi = 0, gi = 0, li = 0;
    for (const t of trains) {
      t.doorK = Math.max(0, Math.min(1, (t.doorK || 0) + (t.doors ? dt : -dt) * 1.4));
      const open = t.doorK * t.doorK * (3 - 2 * t.doorK);
      const near = !cam || Math.hypot(t.x - cam.x, t.z - cam.z) < 260;
      let prev = null;
      for (let k = 0; k < t.cars.length; k++) {
        const c = t.cars[k];
        const sc = t.s - t.dir * c.off;
        const f = trackAt(t, sc + t.dir * BOGIE, bA), r = trackAt(t, sc - t.dir * BOGIE, bB);
        const hx = f.x - r.x, hz = f.z - r.z, hl = Math.hypot(hx, hz) || 1;
        const yaw = Math.atan2(-hz, hx), pitch = Math.atan2(f.y - r.y, hl);
        // Cant: the track is banked into bends, so the car leans into them.
        const turn = f.dx * r.dz - f.dz * r.dx; // > 0: bending left
        const roll = -Math.max(-0.05, Math.min(0.05, (turn / (2 * BOGIE)) * 6));
        const m = c.mesh;
        m.position.set((f.x + r.x) / 2, (f.y + r.y) / 2, (f.z + r.z) / 2);
        m.rotation.set(roll, yaw, pitch);
        m.updateMatrix();
        m.visible = f.y > -1 || !world || (cam && Math.hypot(m.position.x - cam.x, m.position.z - cam.z) < 160);
        const ux = hx / hl, uz = hz / hl;
        c.yaw = yaw; c.pitch = pitch;
        c.front = [m.position.x + ux * CAR / 2, m.position.y + Math.sin(pitch) * CAR / 2, m.position.z + uz * CAR / 2];
        c.back = [m.position.x - ux * CAR / 2, m.position.y - Math.sin(pitch) * CAR / 2, m.position.z - uz * CAR / 2];
        const show = near && m.visible;
        // Bogies, each turned to the track under it.
        for (const b of [f, r]) {
          if (show) {
            dummy.position.set(b.x, b.y, b.z);
            dummy.rotation.set(0, Math.atan2(-b.dz * t.dir, b.dx * t.dir), pitch);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            parts.bogie.setMatrixAt(bi++, dummy.matrix);
          }
        }
        // Platform-side (left) door leaves, sliding apart at stations.
        for (const dx of DOORS) for (const sd of [-1, 1]) {
          if (show) {
            local.makeTranslation(dx + sd * (LEAF / 2 + open * (LEAF - 0.06)), 0, -(HALF_W + 0.012));
            parts.leaf.setMatrixAt(li++, mat.multiplyMatrices(m.matrix, local));
          }
        }
        // The flexible gangway to the car ahead, stretched between the two car ends.
        if (prev) {
          const a = prev.back, b = c.front;
          const gx = a[0] - b[0], gy = a[1] - b[1], gz = a[2] - b[2], gl = Math.hypot(gx, gz) || 0.01;
          if (show) {
            dummy.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
            dummy.rotation.set(roll, Math.atan2(-gz, gx), Math.atan2(gy, gl));
            dummy.scale.set(gl + 0.25, 1, 1);
            dummy.updateMatrix();
            parts.gangway.setMatrixAt(gi++, dummy.matrix);
          }
        }
        prev = c;
      }
      // Where the train is (its middle) and which way it's going, for riding and following it.
      const mid = t.s - t.dir * TRAIN_LEN / 2;
      trackAt(t, mid, tmp);
      t.x = tmp.x; t.z = tmp.z; t.y = t.line.yAt(mid) + 1.6;
      t.hx = tmp.dx * t.dir; t.hz = tmp.dz * t.dir;
      // The cab: the front of the leading car.
      const lead = t.cars[0];
      t.head = lead.front; t.headYaw = wrap(lead.yaw);
    }
    // Only the trains near the camera are packed in (the rest aren't drawn at all).
    parts.bogie.count = bi; parts.gangway.count = gi; parts.leaf.count = li;
    for (const m of Object.values(parts)) { m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true; }
  };
  update(0);
  return { update, group, trains, routes, trackAt };
}

// ---------- Train models ----------
// Dimensions (metres) of the BEML cars: local +x is the direction of travel, +z the right-hand
// side, y = 0 the top of the rail.
const RAIL = 1.75; // rail top above the deck
const BOGIE = 7; // bogie centres either side of the middle of a car
const HALF_W = 1.44;
const NOSE = 1.6;
const DOORS = [-7.5, -2.5, 2.5, 7.5];
const LEAF = 0.68;
const PROFILE = [[-1.3, 0.42], [-1.42, 0.85], [-1.44, 1.35], [-1.43, 2.85], [-1.36, 3.25], [-1.18, 3.5], [-0.75, 3.63], [0, 3.67], [0.75, 3.63], [1.18, 3.5], [1.36, 3.25], [1.43, 2.85], [1.44, 1.35], [1.42, 0.85], [1.3, 0.42]];
// Per-vertex [roughness, metalness, emissive] (see makePbrMaterial).
const PB = { steel: [0.3, 0.85, 0], paint: [0.35, 0.25, 0], dark: [0.7, 0.3, 0], glass: [0.06, 0.6, 0.55], lamp: [0.2, 0, 1.6], rubber: [0.9, 0, 0], led: [0.4, 0, 1.1] };
const UV0 = [0, 0, 1, 1];

// A quad whose winding is fixed up to face `n`.
function face(b, a, p, q, d, n, color, pbr) {
  b.pbr = pbr;
  const ux = p[0] - a[0], uy = p[1] - a[1], uz = p[2] - a[2], vx = q[0] - a[0], vy = q[1] - a[1], vz = q[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) b.quad(d, q, p, a, n, UV0, color); else b.quad(a, p, q, d, n, UV0, color);
}

// Profile segment k -> colour and finish of the body shell.
function shellPaint(k, y) {
  if (k === PROFILE.length - 1) return [0x2a2c30, PB.dark]; // underside
  if (k === 0 || k === PROFILE.length - 2) return [0x4c5156, PB.dark]; // skirts
  if (y > 3.45) return [0xb4b8bc, PB.paint]; // roof
  return [0xc8ccd0, PB.steel];
}

// A ring of profile points at x (each [x, y, z]); quads between two rings.
function ring(x, sz = 1, sy = 1, lean = 0) {
  return PROFILE.map(([z, y]) => { const yy = 0.42 + (y - 0.42) * sy; return [x - Math.max(0, yy - 1.3) * lean, yy, z * sz]; });
}
function loft(b, A, B, paint) {
  const n = PROFILE.length;
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    const a = A[k], p = B[k], q = B[k2], d = A[k2];
    // Outward normal: across the edge and along the loft.
    const ex = q[0] - a[0], ey = q[1] - a[1], ez = q[2] - a[2], fx = d[0] - p[0], fy = d[1] - p[1], fz = d[2] - p[2];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const mx = (a[1] + q[1]) / 2 - 2, mz = (a[2] + q[2]) / 2; // from the car's axis
    if (nx * 0 + ny * mx + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    const [col, pbr] = paint(k, (a[1] + d[1]) / 2);
    face(b, a, p, q, d, [nx / l, ny / l, nz / l], col, pbr);
  }
}
// Close a ring with horizontal strips between its left and right points.
function cap(b, R, sx, paint) {
  const n = PROFILE.length;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    const L0 = R[i], L1 = R[i + 1], R0 = R[n - 1 - i], R1 = R[n - 2 - i];
    const [col, pbr] = paint((L0[1] + L1[1]) / 2);
    face(b, L0, R0, R1, L1, [sx, 0, 0], col, pbr);
  }
}

function carGeometry(lineColor, kind) {
  const b = new MeshBuilder({ pbr: true });
  const half = CAR / 2;
  const x0 = kind === 'rear' ? -half + NOSE : -half, x1 = kind === 'front' ? half - NOSE : half;
  // The shell: one long extrusion of the profile.
  loft(b, ring(x0), ring(x1), shellPaint);
  // Cab noses: lofted forward, narrowing, the roof dropping to a raked windscreen.
  const nose = (sx) => {
    const base = sx > 0 ? x1 : x0;
    let prevRing = ring(base);
    for (let j = 1; j <= 6; j++) {
      const t = j / 6;
      const R = ring(0, 1 - 0.07 * t - 0.12 * t ** 4, 1 - 0.17 * t ** 1.6, 0.55 * t * t).map((p) => [base + sx * (NOSE * t + p[0]), p[1], p[2]]);
      loft(b, prevRing, R, (k, y) => {
        if (k === PROFILE.length - 1) return [0x2a2c30, PB.dark];
        if (j >= 4 && y > 1.85 && y < 3.2) return [0x1a2028, PB.glass];
        if (j >= 3 && y < 1.75) return [lineColor, PB.paint];
        return shellPaint(k, y);
      });
      prevRing = R;
    }
    cap(b, prevRing, sx, (y) => (y < 1.7 ? [lineColor, PB.paint] : y < 1.85 ? [0x111316, PB.dark] : y < 2.95 ? [0x1a2028, PB.glass] : [0xb4b8bc, PB.paint]));
    // Lamps (white at the head of the train, red at the tail), coupler, destination display.
    const tip = base + sx * (NOSE + 0.02);
    for (const sz of [-1, 1]) face(b, [tip, 1.02, sz * 0.72], [tip, 1.02, sz * 1.02], [tip, 1.2, sz * 1.02], [tip, 1.2, sz * 0.72], [sx, 0, 0], sx > 0 ? 0xfff6e0 : 0xff2a20, PB.lamp);
    // (The destination display sits on the raked screen: the cap leans back 0.55 m per metre up.)
    const ledX = (y) => base + sx * (NOSE + 0.02 - Math.max(0, y - 1.3) * 0.55);
    face(b, [ledX(2.96), 2.96, -0.6], [ledX(2.96), 2.96, 0.6], [ledX(3.08), 3.08, 0.6], [ledX(3.08), 3.08, -0.6], [sx * 0.88, 0.48, 0], 0xffa018, PB.led);
    b.pbr = PB.dark;
    b.box(tip + sx * 0.1, 0.32, 0, 0.35, 0.3, 0.5, 0x1a1a1a);
  };
  if (kind === 'front') nose(1);
  if (kind === 'rear') nose(-1);
  // Plain ends: the end wall and the gangway's rubber frame.
  for (const [x, sx, plain] of [[x1, 1, kind !== 'front'], [x0, -1, kind !== 'rear']]) {
    if (!plain) continue;
    cap(b, ring(x), sx, () => [0x9a9ea2, PB.steel]);
    face(b, [x + sx * 0.01, 0.62, -1.08], [x + sx * 0.01, 0.62, 1.08], [x + sx * 0.01, 3.02, 1.08], [x + sx * 0.01, 3.02, -1.08], [sx, 0, 0], 0x1a1c1e, PB.rubber);
  }
  // Sides: the line's livery bands, windows between the doors, and the doors.
  for (const side of [-1, 1]) {
    const z = side * (HALF_W + 0.006), n = [0, 0, side];
    const strip = (xa, xb, ya, yb, col, pbr, dz = 0) => face(b, [xa, ya, z + side * dz], [xb, ya, z + side * dz], [xb, yb, z + side * dz], [xa, yb, z + side * dz], n, col, pbr);
    strip(x0 + 0.1, x1 - 0.1, 1.45, 1.62, lineColor, PB.paint);
    strip(x0 + 0.1, x1 - 0.1, 2.9, 2.97, lineColor, PB.paint);
    const edges = [x0 + 0.5, ...DOORS.flatMap((d) => [d - LEAF - 0.14, d + LEAF + 0.14]), x1 - 0.5];
    for (let i = 0; i < edges.length; i += 2) if (edges[i + 1] - edges[i] > 0.6) strip(edges[i] + 0.12, edges[i + 1] - 0.12, 1.75, 2.62, 0x343c46, PB.glass, 0.002);
    for (const d of DOORS) {
      if (d - LEAF < x0 || d + LEAF > x1) continue;
      if (side < 0) strip(d - LEAF - 0.02, d + LEAF + 0.02, 0.6, 2.9, 0x0b0e12, PB.dark, 0.003); // doorway (the leaves are instanced)
      else for (const s of [-1, 1]) { // closed leaves on the off side
        strip(d + s * 0.012, d + s * LEAF, 0.6, 2.88, 0xb0b4b8, PB.steel, 0.004);
        strip(d + s * 0.2, d + s * (LEAF - 0.14), 1.72, 2.5, 0x343c46, PB.glass, 0.006);
      }
    }
  }
  // Roof air-conditioning units and the underframe equipment between the bogies.
  b.pbr = PB.paint;
  for (const x of [-5.2, 5.2]) b.box(x, 3.6, 0, 3.4, 0.3, 1.9, 0xa8acb0);
  b.pbr = PB.dark;
  b.box(0, 0.12, 0, 7.6, 0.32, 2.0, 0x2a2d31);
  return b.geometry();
}

function bogieGeometry() {
  const b = new MeshBuilder({ pbr: true });
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  b.pbr = PB.dark;
  b.box(0, 0.28, 0, 2.5, 0.26, 1.6, 0x26292d);
  for (const sz of [-1, 1]) b.box(0, 0.16, sz * 0.8, 2.8, 0.36, 0.14, 0x1e2124);
  b.pbr = PB.steel;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put(b, cyl, sx * 1.05, 0.36, sz * 0.73, 0x55595e, 0, 0.36, 0.11, 0.36, Math.PI / 2);
    b.box(sx * 1.05, 0.24, sz * 0.9, 0.32, 0.24, 0.12, 0x3a3d40);
    put(b, cyl, sx * 1.05, 0.62, sz * 0.8, 0x6a6e72, 0, 0.09, 0.22, 0.09);
  }
  b.pbr = PB.dark;
  b.box(0, 0.06, -0.98, 0.6, 0.07, 0.16, 0x161616); // third-rail shoe
  return b.geometry();
}

function gangwayGeometry() {
  const b = new MeshBuilder({ pbr: true });
  b.pbr = PB.rubber;
  b.box(0, 0.66, 0, 1, 2.3, 1.62, 0x2e3133);
  for (const y of [0.95, 1.45, 1.95, 2.45]) b.box(0, y, 0, 1, 0.07, 1.66, 0x45484b); // folds of the bellows
  return b.geometry();
}

function leafGeometry() {
  const b = new MeshBuilder({ pbr: true });
  b.pbr = PB.steel;
  b.box(0, 0.6, 0, LEAF - 0.02, 2.28, 0.03, 0xb4b8bc);
  b.pbr = PB.glass;
  b.box(0, 1.72, 0, LEAF - 0.3, 0.78, 0.04, 0x343c46);
  b.pbr = PB.rubber;
  b.box(0, 0.6, 0, 0.03, 2.28, 0.04, 0x111111);
  return b.geometry();
}

function makeTrain(geos, material, group, line, dir, s) {
  const set = geos[line.short];
  const cars = [];
  for (let k = 0; k < CARS; k++) {
    const geo = k === 0 ? set.front : k === CARS - 1 ? set.rear : set.mid;
    const mesh = new THREE.Mesh(geo, material);
    mesh.rotation.order = 'YZX';
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    cars.push({ mesh, off: CAR / 2 + k * (CAR + 0.6) });
  }
  return { line, cars, s, dir, speed: 0, cruise: 22 + Math.random() * 2, wait: 0, at: null, doors: false, doorK: 0, reverse: false, x: 0, z: 0, y: 0, driver: null };
}
