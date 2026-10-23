// AI traffic: a dense population streamed around the player that follows the road graph,
// keeps LEFT, obeys (mostly) the signals and honks a lot. Cars and buses keep to their lanes;
// autos and two-wheelers ignore lane markings, weave across the carriageway, squeeze through
// gaps and now and then ride on the wrong side of the road. Everyone wades through floods.
import { Vehicle } from './vehicle.js';
import { mulberry32 } from '../world/textures.js';
import { LANE_W } from '../config.js';

const rng = mulberry32(4242);
const BASE_MIX = {
  scooter: 0.17, delivery: 0.07, eScooter: 0.035, bike: 0.06, sportsBike: 0.02, auto: 0.16, goodsAuto: 0.03, hatch: 0.1, sedan: 0.06, taxi: 0.07,
  suv: 0.06, tempo: 0.025, miniTruck: 0.03, bus: 0.055, schoolBus: 0.015, lorry: 0.015, tanker: 0.012, hoysala: 0.008, ambulance: 0.006,
};
const HEAVY = new Set(['bus', 'schoolBus', 'lorry', 'tanker', 'tempo', 'goodsAuto', 'miniTruck', 'ambulance']);
const AUTOS = new Set(['auto', 'goodsAuto']);
const CELL = 24;

function pickType(hour, industrial) {
  const mix = { ...BASE_MIX };
  const night = hour < 6 || hour >= 22;
  // Lorries are banned from the city by day, so they come out at night (and live in Peenya).
  if (night) { mix.lorry *= 4; mix.tanker *= 2; mix.schoolBus = 0; mix.delivery *= 1.5; }
  if (hour < 7 || hour > 18) mix.schoolBus = 0;
  if (industrial) { mix.lorry *= 4; mix.goodsAuto *= 3; mix.miniTruck *= 3; mix.tempo *= 2; }
  let total = 0;
  for (const k in mix) total += mix[k];
  let r = rng() * total;
  for (const k in mix) { if ((r -= mix[k]) <= 0) return k; }
  return 'hatch';
}

export class Traffic {
  constructor(scene, layout, signals) {
    this.scene = scene;
    this.layout = layout;
    this.signals = signals;
    this.agents = [];
    this.pool = new Map();
    this.target = 170;
    this.radius = 380;
    this.grid = new Map();
    this.nearEdges = [];
    this.edgeTimer = 0;
    this.cand = { lat: new Float32Array(256), lim: new Float32Array(256), g: new Float32Array(256), who: [], n: 0 };
  }

  // Edges with at least one end within range of the player.
  refreshNearEdges(focus) {
    const r = this.radius + 60;
    this.nearEdges = this.layout.edges.filter((e) => Math.min(Math.hypot(e.from.x - focus.x, e.from.z - focus.z), Math.hypot(e.to.x - focus.x, e.to.z - focus.z)) < r);
  }

  // Build a stock of vehicles up front so the first seconds of play don't stutter.
  prewarm(n, hour = 12) {
    for (let k = 0; k < n; k++) {
      const type = pickType(hour, false);
      const list = this.pool.get(type) || [];
      list.push(new Vehicle(type, { rng, rider: true, pink: type === 'hoysala' && rng() < 0.25 }));
      this.pool.set(type, list);
    }
  }

  // Reuse pooled vehicles; building a new one is costly, so allow at most one per frame.
  acquire(type) {
    const list = this.pool.get(type);
    if (list && list.length) return list.pop();
    if (this.builtThisFrame >= 1) return null;
    this.builtThisFrame++;
    return new Vehicle(type, { rng, rider: true, pink: type === 'hoysala' && rng() < 0.25 });
  }

  spawn(world, initial = false) {
    const focus = world.focus;
    const edges = this.nearEdges;
    if (!edges.length) return null;
    for (let tries = 0; tries < 12; tries++) {
      const e = edges[Math.floor(rng() * edges.length)];
      const blk = this.layout.blockAt(e.from.x, e.from.z);
      const type = pickType(world.hour ?? 12, blk.zone === 'industrial');
      const lane = this.chooseLane(e, type);
      const path = this.edgePath(e, lane);
      const s = rng() * Math.max(0, path.length - 8);
      const p = sample(path, s);
      const d = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (d > this.radius || d < (initial ? 25 : 140)) continue;
      if (this.occupied(p.x, p.z, 9)) continue;
      const v = this.acquire(type);
      if (!v) continue;
      return this.addAgent(v, e, lane, path, s);
    }
    return null;
  }

  // A vehicle joining the traffic on the road nearest (x, z): mission targets. With keep, it
  // isn't despawned for being far from the player.
  spawnNear(type, x, z, { keep = null, opts = {} } = {}) {
    let best = null;
    for (const e of this.layout.edges) {
      if (e.flyover || e.len < 40) continue;
      const t = Math.max(0.1, Math.min(0.7, ((x - e.from.x) * e.dir.x + (z - e.from.z) * e.dir.z) / e.len));
      const d = Math.hypot(e.from.x + e.dir.x * e.len * t - x, e.from.z + e.dir.z * e.len * t - z);
      if (!best || d < best.d) best = { d, e, t };
    }
    if (!best) return null;
    const { e, t } = best, lane = this.chooseLane(e, type), path = this.edgePath(e, lane);
    const a = this.addAgent(new Vehicle(type, { rng, rider: true, ...opts }), e, lane, path, t * path.length);
    a.keep = keep;
    return a;
  }

  addAgent(v, e, lane, path, s) {
    const type = v.type;
    const p = sample(path, s);
    v.x = p.x; v.z = p.z; v.heading = p.h; v.vx = v.vz = 0;
    // Joining up on a deck: start on it, not on the road beneath.
    const hit = e.flyover && lane < e.flyover.lanes ? this.layout.flyoverAt(p.x, p.z) : null;
    v.y = hit ? this.layout.deckHeight(hit.f, hit.s) : 0;
    v.driver = 'ai';
    v.stalled = false;
    if (!v.rider) v.addRider(rng);
    this.scene.add(v.group);
    const two = v.spec.twoWheeler;
    const erratic = two || AUTOS.has(type);
    const a = {
      v, edge: e, lane, path, s, speed: 0, turning: false,
      cruise: Math.min(two ? 16 : 99, v.spec.maxSpeed * (two ? 0.55 : HEAVY.has(type) ? 0.5 : 0.45)) * (0.8 + rng() * 0.4),
      stuck: 0, bypassT: 0, honkCd: rng() * 3, lat: 0, latTarget: 0, latVel: 0, stunned: 0,
      jumper: rng() < (two ? 0.3 : type === 'auto' ? 0.25 : HEAVY.has(type) ? 0.05 : 0.1),
      impatience: rng(),
      // Lane-ignoring weavers, and the ones who'll happily ride against the traffic.
      erratic, weaveT: rng() * 2, surge: 1, surgeT: rng() * 4,
      wrongProne: erratic && rng() < (two ? 0.3 : 0.18), wrong: false, wrongNow: false,
    };
    if (erratic) {
      const [lo, hi] = this.band(a);
      a.lat = a.latTarget = lo + rng() * (hi - lo);
    }
    a.fx = Math.sin(p.h); a.fz = Math.cos(p.h);
    this.agents.push(a);
    this.addToGrid(a);
    return a;
  }

  chooseLane(e, type, fromTurn = false) {
    const n = e.road.lanes;
    if (n === 1) return 0;
    // Buses and lorries hug the kerb (outer lane); others pick freely.
    let lane = HEAVY.has(type) ? n - 1 : Math.floor(rng() * n);
    // Vehicles turning onto a flyover approach stay off the lanes that climb it; where a slip road
    // leaves from the kerb lane, keep out of that.
    if (e.flyover && fromTurn && lane < e.flyover.lanes) lane = Math.min(n - 1, e.flyover.lanes);
    if (e.kerbShut && lane === n - 1) lane = n - 2;
    return lane;
  }

  // Lateral range (relative to the agent's lane centre) of its own side of the carriageway.
  band(a) {
    const r = a.edge.road, half = (r.median || 0) / 2, off = this.layout.laneOffset(r, a.lane);
    let lo = half + 0.7, hi = half + r.lanes * LANE_W - 0.75;
    // Flyover approaches: the inner lanes climb the deck, so stay on whichever side you're on.
    const fl = a.edge.flyover?.lanes;
    if (fl) {
      if (a.lane < fl) hi = half + fl * LANE_W - 0.6;
      else lo = half + fl * LANE_W + 0.6;
    }
    if (a.edge.kerbShut) hi = Math.min(hi, half + (r.lanes - 1) * LANE_W - 0.75);
    return [lo - off, Math.max(lo, hi) - off];
  }

  // The oncoming side of an undivided road, for riding against the traffic.
  wrongBand(a) {
    const r = a.edge.road, off = this.layout.laneOffset(r, a.lane);
    return [-(r.lanes * LANE_W - 0.7) - off, -0.8 - off];
  }

  // Start a wrong-side run along this road? Only on undivided roads with room to do it.
  maybeGoWrong(a) {
    a.wrong = false;
    const r = a.edge.road;
    if (!a.wrongProne || r.median || a.edge.flyover || a.path.length < 90 || rng() > 0.4) return;
    a.wrong = true;
    const [lo, hi] = this.wrongBand(a);
    // Most hug the far kerb; a few ride the centre line.
    a.latTarget = rng() < 0.7 ? lo + rng() * 0.8 : hi - rng() * 0.8;
    a.weaveT = 3 + rng() * 3;
  }

  edgePath(e, lane) {
    const L = this.layout;
    const off = L.laneOffset(e.road, lane);
    const lx = e.dir.z, lz = -e.dir.x;
    const a = Math.min(e.cutFrom + 1.5, e.len * 0.45);
    const b = Math.min(e.cutTo + 1.5, e.len * 0.45);
    const p0 = { x: e.from.x + e.dir.x * a + lx * off, z: e.from.z + e.dir.z * a + lz * off };
    const p1 = { x: e.to.x - e.dir.x * b + lx * off, z: e.to.z - e.dir.z * b + lz * off };
    return makePath([p0, p1]);
  }

  // With `onLine`, the path keeps to the two lanes' lines and turns where they meet (along a deck
  // through a bend, where a curve cutting the corner would leave the deck).
  turnPath(from, d1, e2, lane2, onLine = false) {
    const start = from.points[from.points.length - 1];
    const next = this.edgePath(e2, lane2);
    const end = next.points[0];
    // Control point where the two lanes' lines meet (or halfway, for a near-straight run).
    let cx = (start.x + end.x) / 2, cz = (start.z + end.z) / 2;
    const det = d1.x * -e2.dir.z - d1.z * -e2.dir.x;
    if (Math.abs(det) > 0.25) {
      const rx = end.x - start.x, rz = end.z - start.z;
      const t = (rx * -e2.dir.z - rz * -e2.dir.x) / det;
      const gap = Math.hypot(rx, rz);
      if (t > 0 && t < gap * 1.5) { cx = start.x + d1.x * t; cz = start.z + d1.z * t; }
    }
    if (onLine) return { turn: makePath([start, { x: cx, z: cz }, end]), next };
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, u = 1 - t;
      pts.push({ x: u * u * start.x + 2 * u * t * cx + t * t * end.x, z: u * u * start.z + 2 * u * t * cz + t * t * end.z });
    }
    return { turn: makePath(pts), next };
  }

  chooseNext(a) {
    const node = a.edge.to;
    let opts = node.out.filter((e) => e.to !== a.edge.from);
    if (!opts.length) opts = node.out;
    let straight = null, bd = 0.85;
    for (const e of opts) { const d = e.dir.x * a.edge.dir.x + e.dir.z * a.edge.dir.z; if (d > bd) { bd = d; straight = e; } }
    // Up on a flyover you can only carry on along it.
    if (onDeck(a) && a.edge.flyNext) return a.edge.flyNext;
    if (straight && rng() < 0.45) return straight;
    return opts[Math.floor(rng() * opts.length)];
  }

  advance(a) {
    if (a.turning) {
      a.turning = false;
      a.path = a.nextPath;
      a.s = 0;
      if (a.erratic) {
        a.weaveT = 0;
        this.maybeGoWrong(a);
      }
      return;
    }
    const e2 = a.plan || this.chooseNext(a);
    a.plan = null;
    a.fromUnd = a.edge.und; // the approach it's turning from (for yielding at the junction)
    const straight = e2.dir.x * a.edge.dir.x + e2.dir.z * a.edge.dir.z > 0.85;
    let lane2 = (straight && e2.road.lanes === a.edge.road.lanes) || (e2 === a.edge.flyNext && onDeck(a)) ? a.lane : this.chooseLane(e2, a.v.type, !straight);
    if (e2.kerbShut && lane2 === e2.road.lanes - 1 && lane2 > 0) lane2--;
    const { turn, next } = this.turnPath(a.path, a.edge.dir, e2, lane2, e2 === a.edge.flyNext && lane2 < e2.flyover.lanes);
    a.edge = e2;
    a.lane = lane2;
    a.path = turn;
    a.nextPath = next;
    a.turning = true;
    a.s = 0;
    // Through the junction, stay roughly on the turning line.
    a.wrong = false;
    a.latTarget = Math.max(-1.2, Math.min(1.2, a.latTarget));
  }

  release(a) {
    const i = this.agents.indexOf(a);
    if (i >= 0) this.agents.splice(i, 1);
    a.released = true;
    a.v.driver = null;
    a.v.loose = performance.now(); // out of the traffic for good: towed away once you're clear of it
    const fx = Math.sin(a.v.heading), fz = Math.cos(a.v.heading);
    a.v.vx = fx * a.speed; a.v.vz = fz * a.speed;
    return a.v;
  }

  despawn(a) {
    const i = this.agents.indexOf(a);
    if (i >= 0) this.agents.splice(i, 1);
    this.scene.remove(a.v.group);
    a.v.siren = false;
    a.v.repair(); // back to the pool showroom-fresh
    const list = this.pool.get(a.v.type) || [];
    if (list.length < 30) { list.push(a.v); this.pool.set(a.v.type, list); }
    else {
      a.v.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.skeleton?.dispose(); } });
    }
  }

  findAgent(vehicle) {
    return this.agents.find((a) => a.v === vehicle);
  }

  // ---------- spatial hash ----------
  key(x, z) { return (Math.floor(x / CELL) * 73856093) ^ (Math.floor(z / CELL) * 19349663); }
  addToGrid(a) {
    const k = this.key(a.v.x, a.v.z);
    let l = this.grid.get(k);
    if (!l) this.grid.set(k, (l = []));
    l.push(a);
  }
  rebuildGrid() {
    if (this.grid.size > 3000) this.grid.clear(); // (cells are reused, but not kept forever)
    for (const l of this.grid.values()) l.length = 0;
    for (const a of this.agents) { a.fx = Math.sin(a.v.heading); a.fz = Math.cos(a.v.heading); this.addToGrid(a); }
  }
  occupied(x, z, r) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const l = this.grid.get(this.key(x + dx * CELL, z + dz * CELL));
      if (l) for (const b of l) if (Math.abs(b.v.x - x) < r && Math.abs(b.v.z - z) < r) return true;
    }
    return false;
  }

  // Everything that could be ahead of `a` within `look`, gathered once a frame: the squeeze
  // search tries a dozen sideways offsets, all against the same handful of candidates.
  // For each one: its sideways offset from our centre line, how close it may come sideways
  // before it's in our way, and the gap to it if it is.
  gather(a, look, obstacles) {
    const v = a.v, C = this.cand;
    const fx = a.fx, fz = a.fz, lx = fz, lz = -fx;
    const lim0 = v.spec.width / 2 + (a.erratic ? 0.12 : 0.3), front = v.spec.length / 2;
    let n = 0;
    const push = (lat, lim, g, who) => {
      if (n === C.lat.length) for (const k of ['lat', 'lim', 'g']) { const b = new Float32Array(n * 2); b.set(C[k]); C[k] = b; }
      C.lat[n] = lat; C.lim[n] = lim; C.g[n] = g; C.who[n] = who; n++;
    };
    const span = Math.ceil((look + 8) / CELL), ix = Math.floor(v.x / CELL), iz = Math.floor(v.z / CELL);
    const B = C.behind || (C.behind = []);
    B.length = 0;
    for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) {
      const l = this.grid.get(((ix + i) * 73856093) ^ ((iz + j) * 19349663));
      if (!l) continue;
      for (const b of l) {
        if (b === a) continue;
        const bv = b.v;
        if (Math.abs(bv.y - v.y) > 2.5) continue;
        const dx = bv.x - v.x, dz = bv.z - v.z, ahead = dx * fx + dz * fz;
        // Coming up behind in the same direction, faster: remember it (don't cut in front of it).
        if (ahead <= 0 && ahead > -25 && b.speed > a.speed + 1 && b.fx * fx + b.fz * fz > 0.7) {
          B.push({ lat: dx * lx + dz * lz, lim: lim0 + bv.spec.width / 2 + 0.3, room: -ahead - v.spec.length / 2 - bv.spec.length / 2, close: b.speed - a.speed });
        }
        if (ahead <= 0 || ahead > look + 50) continue;
        const dot = b.fx * fx + b.fz * fz;
        // Oncoming traffic only matters when someone is on the wrong side; then it closes the
        // gap twice as fast, so plan for where they'll be.
        const oncoming = dot < -0.7;
        if (oncoming && !a.wrongNow && !b.wrongNow) continue;
        const closing = oncoming ? b.speed : 0;
        if (ahead > look + closing * 2) continue;
        const ad = Math.abs(dot), hl = bv.spec.length / 2, hw = bv.spec.width / 2;
        push(dx * lx + dz * lz, lim0 + hw * ad + hl * (1 - ad), ahead - front - (hl * ad + hw * (1 - ad)) - closing * 1.5, b);
      }
    }
    for (const o of obstacles) {
      if (Math.abs((o.y ?? v.y) - v.y) > 2.5) continue;
      const dx = o.x - v.x, dz = o.z - v.z, ahead = dx * fx + dz * fz;
      if (ahead <= 0 || ahead > look) continue;
      push(dx * lx + dz * lz, lim0 + o.r, ahead - front - o.r, o);
    }
    C.n = n;
  }

  // Would moving `shift` sideways put us right in front of someone faster coming up behind?
  cutsIn(shift) {
    for (const b of this.cand.behind || []) if (Math.abs(b.lat - shift) <= b.lim && b.room < 2 + b.close * 1.5) return true;
    return false;
  }

  // Gap to the nearest gathered candidate for a vehicle shifted `shift` sideways (blocker in this.blocker).
  gapAt(shift) {
    const C = this.cand;
    let gap = Infinity, who = null;
    for (let k = 0; k < C.n; k++) if (C.g[k] < gap && Math.abs(C.lat[k] - shift) <= C.lim[k]) { gap = C.g[k]; who = C.who[k]; }
    this.blocker = who;
    return gap;
  }

  // Is the junction at the end of a's edge busy with someone from another approach? Those
  // already crossing it, or (at a tie) arriving at the same moment with the right of way.
  boxBusy(a) {
    const node = a.edge.to, ix = Math.floor(node.x / CELL), iz = Math.floor(node.z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = this.grid.get(((ix + i) * 73856093) ^ ((iz + j) * 19349663));
      if (!l) continue;
      for (const b of l) {
        if (b === a || b.released || onDeck(b)) continue;
        if (b.turning && b.edge.from === node && b.fromUnd !== a.edge.und && b.s < b.path.length - 1.5) return true;
        // Both about to arrive from different roads: the one that gets there first goes.
        if (!b.turning && b.edge.to === node && b.edge.und !== a.edge.und && b.speed > 0.8 && !b.waitingSignal) {
          const tb = (b.path.length - b.s) / b.speed, ta = (a.path.length - a.s) / Math.max(1, a.speed);
          if (tb < 2.5 && (tb < ta - 0.3 || (Math.abs(tb - ta) <= 0.3 && b.v.id < a.v.id))) return true;
        }
      }
    }
    return false;
  }

  // Steer round a blocker: the clearest line across the carriageway (both sides of an undivided
  // road), judged against what's ahead (gather() has just run for this agent).
  bypass(a) {
    const r = a.edge.road, off = this.layout.laneOffset(r, a.lane), half = (r.median || 0) / 2;
    let lo = !r.median && !a.edge.flyover && !a.turning ? -(r.lanes * LANE_W - 0.9) - off : half + 0.9 - off;
    let hi = half + r.lanes * LANE_W - 0.9 - off;
    if (!a.turning && (a.edge.flyover || a.edge.kerbShut)) { const [bl, bh] = this.band(a); lo = Math.max(lo, bl); hi = Math.min(hi, bh); }
    let best = null, bestGap = this.gapAt(0) + 4;
    for (let k = 0; k <= 10; k++) {
      const cand = lo + ((hi - lo) * k) / 10, g = this.gapAt(cand - a.lat);
      if (g > bestGap) { bestGap = g; best = cand; }
    }
    if (best === null) return false;
    a.latTarget = best; a.bypassT = 5;
    return true;
  }

  // Vehicles in the traffic that run into each other. At speed it's a crash: both leave the
  // traffic as loose vehicles and take the hit. At a crawl they're eased apart instead of
  // passing through each other.
  collide(world) {
    const box = (v, ax, az) => {
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      return (v.spec.length * 0.47) * Math.abs(fx * ax + fz * az) + (v.spec.width * 0.47) * Math.abs(fz * ax - fx * az);
    };
    const crashes = [];
    for (const a of this.agents) {
      if (a.released) continue;
      const va = a.v, ix = Math.floor(va.x / CELL), iz = Math.floor(va.z / CELL);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const l = this.grid.get(((ix + i) * 73856093) ^ ((iz + j) * 19349663));
        if (!l) continue;
        for (const b of l) {
          if (b === a || b.released || b.v.id < va.id) continue;
          const vb = b.v, dx = va.x - vb.x, dz = va.z - vb.z;
          const reach = (va.spec.length + vb.spec.length) * 0.5;
          if (Math.abs(dx) > reach || Math.abs(dz) > reach || Math.abs(va.y - vb.y) > 2) continue;
          // Separating-axis test on the two footprints; n points from b to a.
          let pen = Infinity, nx = 0, nz = 0;
          for (const h of [va.heading, vb.heading]) {
            for (const [ax, az] of [[Math.sin(h), Math.cos(h)], [Math.cos(h), -Math.sin(h)]]) {
              const d = dx * ax + dz * az, o = box(va, ax, az) + box(vb, ax, az) - Math.abs(d);
              if (o <= 0) { pen = -1; break; }
              if (o < pen) { pen = o; nx = d >= 0 ? ax : -ax; nz = d >= 0 ? az : -az; }
            }
            if (pen < 0) break;
          }
          if (pen <= 0) continue;
          // (From how they're driving, not from frame-to-frame positions: nudges move them too.)
          const vel = (g) => [g.fx * g.speed + g.fz * (g.latVel || 0), g.fz * g.speed - g.fx * (g.latVel || 0)];
          const [ax0, az0] = vel(a), [bx0, bz0] = vel(b);
          const closing = -((ax0 - bx0) * nx + (az0 - bz0) * nz);
          if (closing > 3.5 && closing <= 8) {
            // A fender-bender: a dent, a scrape of sparks, both stop to shout and honk, and
            // then carry on (they stay in the traffic).
            if (!a.bumpT && !b.bumpT) {
              const cx = (va.x + vb.x) / 2, cz = (va.z + vb.z) / 2, dmg = (closing - 2) * 2.5;
              va.takeDamage(dmg, cx, cz, world); vb.takeDamage(dmg, cx, cz, world);
              world.particles?.burst('spark', cx, 0.6, cz, 5, 3, 0.5);
              if (Math.hypot(cx - world.focus.x, cz - world.focus.z) < 120) { world.audio?.crunch?.(Math.min(1, closing / 14)); world.audio?.horn(va.spec.horn, va.x, va.z, world.camera, va.hornPitch); }
              this.bumps = (this.bumps || 0) + 1;
            }
            for (const g of [a, b]) { g.stunned = Math.max(g.stunned, 1.5 + rng()); g.bumpT = 3; g.speed *= 0.3; }
          }
          if (closing > 8) {
            crashes.push([a, b, nx, nz, pen, closing]);
            continue;
          }
          // A nudge (after a bump too): whoever is driving into the other backs off (and slows to its pace), and a
          // side-by-side overlap is pushed apart.
          for (const [x, y, s] of [[a, b, 1], [b, a, -1]]) {
            const fx = Math.sin(x.v.heading), fz = Math.cos(x.v.heading);
            const ahead = (y.v.x - x.v.x) * fx + (y.v.z - x.v.z) * fz;
            const side = (nz * -fx + nx * fz) * s; // push direction (towards +n for a) in x's lateral axis
            if (Math.abs(side) > 0.7) x.lat += side * pen * 0.5;
            else if (ahead > 0) { x.s = Math.max(0, x.s - pen); x.speed = Math.min(x.speed, y.speed * 0.8); }
          }
        }
      }
    }
    for (const [a, b, nx, nz, pen, closing] of crashes) {
      if (a.released || b.released) continue;
      const va = a.v, vb = b.v;
      for (const g of [a, b]) { this.release(g); if (!world.free.includes(g.v)) world.free.push(g.v); }
      const ia = 1 / va.mass, ib = 1 / vb.mass;
      va.x += nx * pen * ia / (ia + ib); va.z += nz * pen * ia / (ia + ib);
      vb.x -= nx * pen * ib / (ia + ib); vb.z -= nz * pen * ib / (ia + ib);
      const cx = (va.x + vb.x) / 2, cz = (va.z + vb.z) / 2, j = (1.3 * closing) / (ia + ib);
      va.applyImpulse(nx * j, nz * j, cx - va.x, cz - va.z);
      vb.applyImpulse(-nx * j, -nz * j, cx - vb.x, cz - vb.z);
      world.onVehicleImpact?.(va, vb, closing, cx, cz);
      // Riders come off their two-wheelers.
      for (const v of [va, vb]) {
        if (!v.rider || !v.spec.twoWheeler || !world.streetLife) continue;
        const opts = { outfit: v.rider.outfit, helmet: true };
        v.removeRider();
        const p = world.streetLife.spawnFleeing(v.x, v.z, cx, cz, opts);
        world.streetLife.knock(p, v.vx * 0.6, v.vz * 0.6, world.audio);
      }
      this.crashes = (this.crashes || 0) + 1;
      const d = Math.hypot(cx - world.focus.x, cz - world.focus.z);
      if (d < 150) world.audio?.horn(va.spec.horn, va.x, va.z, world.camera, va.hornPitch);
    }
  }

  update(dt, world) {
    const { obstacles, audio, camera, focus } = world;
    this.builtThisFrame = 0;
    this.edgeTimer -= dt;
    if (this.edgeTimer <= 0) { this.refreshNearEdges(focus); this.edgeTimer = 1.5; }
    this.rebuildGrid();
    const rainSlow = 1 - (world.rain || 0) * 0.25;
    const sig = this.signals;

    for (let ai = this.agents.length - 1; ai >= 0; ai--) {
      const a = this.agents[ai];
      const v = a.v;
      const distP = Math.hypot(v.x - focus.x, v.z - focus.z);
      if (distP > this.radius + 70 && !a.keep) { this.despawn(a); continue; }
      const two = v.spec.twoWheeler;
      const look = 6 + a.speed * 1.6 + v.spec.length / 2;

      this.gather(a, look, obstacles);
      let gap = this.gapAt(0), blocker = this.blocker;
      // Someone on foot standing in the road ahead (you, flagging it down): stop for them
      // rather than weave round.
      const hailed = !!blocker?.human;
      let surge = 1;
      if (a.erratic) {
        const [lo, hi] = a.turning ? [-1.2, 1.2] : this.band(a);
        const left = a.path.length - a.s;
        // A wrong-side run ends well before the junction: cut back across to your own side.
        if (a.wrong && !a.turning && left < 40) { a.wrong = false; a.weaveT = 0; }
        a.weaveT -= dt;
        if (a.weaveT <= 0 && !a.turning) {
          if (a.wrong) {
            const [wl, wh] = this.wrongBand(a);
            a.latTarget = Math.max(wl, Math.min(wh, a.latTarget + (rng() - 0.5) * 1.5));
            a.weaveT = 1.5 + rng() * 2;
          } else {
            // Drift somewhere else across the carriageway; lane markings are a suggestion (but a
            // mirror isn't: not into the path of someone faster coming up behind).
            const cand = Math.max(lo, Math.min(hi, a.lat + (rng() - 0.5) * (two ? 5 : 3.5)));
            if (!this.cutsIn(cand - a.lat)) a.latTarget = cand;
            a.weaveT = (two ? 0.8 : 1.5) + rng() * (two ? 2.5 : 3.5);
          }
        }
        // Squeeze through any gap: sample across the whole road (both sides when riding wrong).
        if (gap < 7 + a.speed * 1.2 && !hailed) {
          let best = a.latTarget, bestGap = gap;
          const [wl] = this.wrongBand(a);
          const from = a.wrong ? wl : lo, steps = a.wrong ? 9 : 6;
          for (let k = 0; k <= steps; k++) {
            const cand = from + ((hi - from) * k) / steps;
            if (this.cutsIn(cand - a.lat)) continue;
            const score = this.gapAt(cand - a.lat) - Math.abs(cand - a.lat) * 0.4;
            if (score > bestGap + 1.2) { bestGap = score; best = cand; }
          }
          a.latTarget = best;
        }
        // Bursts of speed and sudden slow-downs.
        a.surgeT -= dt;
        if (a.surgeT <= 0) { a.surge = 0.75 + rng() * 0.55; a.surgeT = 2 + rng() * 4; }
        surge = a.surge;
      }

      let target = (a.turning ? Math.min(a.cruise, 6.5) : a.cruise * surge) * rainSlow;
      if (a.wrongNow) target = Math.min(target, 6); // riding against the traffic, they at least go slowly
      a.waitingSignal = false;
      // Signals.
      if (!a.turning && a.edge.to.signal && !onDeck(a)) {
        const st = sig.state(a.edge.to, a.edge.und.id);
        if (st !== 'green') {
          const creep = two ? 2.4 : a.erratic ? 1.2 : 0;
          const d = a.path.length + creep - a.s - (two ? 0 : 1.0);
          const jump = a.jumper && (st === 'amber' || sig.redAge(a.edge.to, a.edge.und.id) < 2.5 + a.impatience * 2);
          const committed = st === 'amber' && d < a.speed * 1.1;
          if (!jump && !committed && d < look + 10) {
            target = Math.min(target, Math.max(0, (d - 0.3) * 1.2));
            a.waitingSignal = true;
          }
        }
      }
      // Coming up to the junction: slow for the turn ahead, and wait at the line while someone
      // from another road is still crossing it.
      if (!a.turning && !onDeck(a)) {
        const left = a.path.length - a.s;
        if (!a.plan && left < 60) a.plan = this.chooseNext(a);
        const turnAhead = a.plan && a.plan.dir.x * a.edge.dir.x + a.plan.dir.z * a.edge.dir.z < 0.85;
        if (turnAhead) target = Math.min(target, Math.sqrt(36 + 2 * 3 * Math.max(0, left - 2)));
        if (left < 9 + a.speed * 1.4 && this.boxBusy(a)) { target = Math.min(target, Math.max(0, (left - 2.5) * 1.2)); a.waitingSignal = true; }
      }
      // Level crossing gates down: wait behind them.
      for (const lc of this.layout.levelCrossings) {
        if (!lc.closed || a.edge.und !== lc.edge) continue;
        const d = (lc.x - v.x) * Math.sin(v.heading) + (lc.z - v.z) * Math.cos(v.heading);
        if (d > 10.5 && d < look + 20) { target = Math.min(target, Math.max(0, (d - 11.5) * 1.2)); a.waitingSignal = true; } // already past the gate: clear the tracks
      }
      if (a.bypassT > 0 && (a.bypassT -= dt) <= 0 && !a.erratic) a.latTarget = 0; // back into lane
      if (gap < Infinity) {
        const safe = (two ? 1.0 : a.erratic ? 1.4 : 2.0) + a.speed * (a.erratic ? 0.4 : 0.55);
        if (gap < safe) target = Math.min(target, Math.max(0, (gap - (two ? 0.4 : 1.0)) * 1.5));
        // And never so fast you couldn't brake down to the speed of whatever's ahead in the gap
        // you have (the rule above only tightens up in a queue).
        const lead = blocker && blocker.fx !== undefined ? Math.max(0, blocker.speed * (blocker.fx * a.fx + blocker.fz * a.fz)) : 0;
        target = Math.min(target, Math.sqrt(lead * lead + 1.1 * v.spec.brake * Math.max(0, gap - (two ? 0.6 : 1.2))));
        // Somebody's coming at you on your side of the road: lean on the horn.
        if (blocker?.wrongNow && gap < 25 && distP < 150 && (a.honkCd -= dt * 4) <= 0) {
          a.honkCd = 1 + rng() * 2;
          audio?.horn(v.spec.horn, v.x, v.z, camera, v.hornPitch);
        }
      }
      if (blocker && blocker.waitingSignal) a.waitingSignal = true;
      if (a.stunned > 0) { a.stunned -= dt; target = 0; }
      if (a.bumpT > 0) a.bumpT -= dt;
      // Flood water: everyone slows down and wades through (and eases off before reaching it).
      const fx0 = Math.sin(v.heading), fz0 = Math.cos(v.heading);
      const depth = world.waterDepth(v.x, v.z, v.y);
      const depthAhead = Math.max(depth, world.waterDepth(v.x + fx0 * 10, v.z + fz0 * 10, v.y));
      v.waterDepth = depth;
      v.stalled = false;
      if (depthAhead > 0.06) target = Math.min(target, Math.max(2.2, 7.5 - depthAhead * (two ? 7 : 5)));

      // (Something suddenly in the way: stand on the brakes.)
      const acc = target > a.speed ? v.spec.accel * 0.8 : v.spec.brake * (a.speed - target > 6 ? 1.8 : 1);
      a.speed += Math.sign(target - a.speed) * Math.min(Math.abs(target - a.speed), acc * dt);

      // Stuck: honk, and eventually squeeze through anyway (but not at a red light or in water).
      if (a.speed < 0.5 && target < 0.5 && a.stunned <= 0) {
        a.stuck += dt;
        a.honkCd -= dt;
        if (a.honkCd <= 0 && (blocker || a.waitingSignal) && distP < 160) {
          a.honkCd = (a.waitingSignal ? 3 : 1.2) + rng() * 2.5;
          if (!a.waitingSignal || rng() < 0.4) audio?.horn(v.spec.horn, v.x, v.z, camera, v.hornPitch);
        }
        if (a.stuck > (blocker?.wrongNow || a.wrongNow ? 2.5 : 5) && !a.waitingSignal && !(blocker && (blocker.isPlayer || blocker.isCop || blocker.human))) {
          // A jam nobody's watching just clears; otherwise go round whatever's in the way if
          // there's room anywhere across the road, or sit and honk. (Nobody drives through.)
          if (distP > 90 && !a.keep) { this.despawn(a); continue; }
          this.bypass(a);
          a.stuck = 0;
        }
        if (a.stuck > 45 && distP > 120 && !a.keep) { this.despawn(a); continue; }
      } else a.stuck = Math.max(0, a.stuck - dt);
      if (a.speed > 3 && distP < 160 && rng() < dt * 0.03) audio?.horn(v.spec.horn, v.x, v.z, camera, v.hornPitch);

      a.s += a.speed * dt;
      while (a.s >= a.path.length) {
        a.s -= a.path.length;
        this.advance(a);
      }
      const p = sample(a.path, a.s);
      // Sideways moves: weavers dart across, everyone else drifts gently.
      const latSpeed = two ? 2.6 : a.erratic ? 1.8 : 1.2;
      const cap = latSpeed * Math.min(1, 0.1 + a.speed / 4); // no sliding sideways at a standstill
      const wantVel = Math.max(-cap, Math.min(cap, (a.latTarget - a.lat) * 2));
      a.latVel += (wantVel - a.latVel) * Math.min(1, dt * 4);
      a.lat += a.latVel * dt;
      if (!a.turning && (a.edge.flyover || a.edge.kerbShut)) {
        // Never drift between a deck and the road beneath it (nor into a slip road's kerb lane).
        const [lo, hi] = this.band(a);
        if (a.lat < lo - 0.3 || a.lat > hi + 0.3) { a.lat = Math.max(lo - 0.3, Math.min(hi + 0.3, a.lat)); a.latVel = 0; }
      }
      a.wrongNow = !a.turning && this.layout.laneOffset(a.edge.road, a.lane) + a.lat < 0;
      // Point the vehicle where it's actually going, so weaving reads as steering.
      const nh = p.h + Math.atan2(a.latVel, Math.max(2.5, a.speed)) * (a.speed > 0.3 ? 1 : 0);
      const prevX = v.x, prevZ = v.z;
      v.x = p.x + Math.cos(p.h) * a.lat;
      v.z = p.z - Math.sin(p.h) * a.lat;
      let dh = nh - v.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      v.yawRate = dt > 0 ? (dh / dt) * 0.5 : 0;
      v.ay = dt > 0 ? (dh / dt) * a.speed * 0.6 : 0; // drives the body-roll spring
      v.ax = dt > 0 ? (a.speed - (a.lastSpeed ?? a.speed)) / dt : 0;
      a.lastSpeed = a.speed;
      v.heading += dh * Math.min(1, dt * 10);
      v.vx = dt > 0 ? (v.x - prevX) / dt : 0;
      v.vz = dt > 0 ? (v.z - prevZ) / dt : 0;
      const far = distP > 280;
      v.group.visible = !far;
      v.flatGround = !a.edge.flyover && !a.edge.und.underpasses; // (ramps only on those edges)
      if (!far || ai % 4 === 0) v.syncVisual(dt, world);
    }
    if (world.free) this.collide(world);
    // Top up the population around the player.
    const want = Math.round(this.target * (world.trafficScale ?? 1));
    let budget = this.agents.length < want * 0.5 ? 12 : 3;
    while (this.agents.length < want && budget-- > 0) this.spawn(world, world.initialFill);
  }
}

// On a flyover's deck lanes (which skip the junctions' signals and only go on along it).
function onDeck(a) {
  return !!a.edge.flyover && a.lane < a.edge.flyover.lanes;
}

function makePath(points) {
  const cum = [0];
  for (let k = 1; k < points.length; k++) cum.push(cum[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].z - points[k - 1].z));
  return { points, cum, length: cum[cum.length - 1] };
}

function sample(path, s) {
  const { points, cum } = path;
  s = Math.max(0, Math.min(s, path.length));
  let k = 1;
  while (k < cum.length - 1 && cum[k] < s) k++;
  const a = points[k - 1], b = points[k];
  const seg = cum[k] - cum[k - 1] || 1;
  const t = (s - cum[k - 1]) / seg;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: Math.atan2(b.x - a.x, b.z - a.z) };
}

export { makePath, sample };
