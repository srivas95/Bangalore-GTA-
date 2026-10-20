// AI traffic: a dense population streamed around the player that follows the road graph,
// keeps LEFT, obeys (mostly) the signals and honks a lot. Cars and buses keep to their lanes;
// autos and two-wheelers ignore lane markings, weave across the carriageway, squeeze through
// gaps and now and then ride on the wrong side of the road. Everyone wades through floods.
import { Vehicle } from './vehicle.js';
import { mulberry32 } from '../world/textures.js';
import { LANE_W } from '../config.js';

const rng = mulberry32(4242);
const BASE_MIX = {
  scooter: 0.2, delivery: 0.07, bike: 0.07, auto: 0.16, goodsAuto: 0.03, hatch: 0.1, sedan: 0.06, taxi: 0.07,
  suv: 0.05, tempo: 0.025, miniTruck: 0.03, bus: 0.055, schoolBus: 0.015, lorry: 0.015, tanker: 0.012, hoysala: 0.008,
};
const HEAVY = new Set(['bus', 'schoolBus', 'lorry', 'tanker', 'tempo', 'goodsAuto', 'miniTruck']);
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
      return this.addAgent(v, e, lane, path, s, p);
    }
    return null;
  }

  addAgent(v, e, lane, path, s, p) {
    const type = v.type;
    v.x = p.x; v.z = p.z; v.heading = p.h; v.y = 0; v.vx = v.vz = 0;
    v.driver = 'ai';
    v.stalled = false;
    if (!v.rider) v.addRider(rng);
    this.scene.add(v.group);
    const two = v.spec.twoWheeler;
    const erratic = two || AUTOS.has(type);
    const a = {
      v, edge: e, lane, path, s, speed: 0, turning: false,
      cruise: v.spec.maxSpeed * (two ? 0.55 : HEAVY.has(type) ? 0.5 : 0.45) * (0.8 + rng() * 0.4),
      stuck: 0, ghost: 0, honkCd: rng() * 3, lat: 0, latTarget: 0, latVel: 0, stunned: 0,
      jumper: rng() < (two ? 0.3 : type === 'auto' ? 0.25 : HEAVY.has(type) ? 0.05 : 0.1),
      impatience: rng(),
      // Lane-ignoring weavers, and the ones who'll happily ride against the traffic.
      erratic, weaveT: rng() * 2, surge: 1, surgeT: rng() * 4,
      wrongProne: erratic && rng() < (two ? 0.3 : 0.18), wrong: false, wrongNow: false,
      // Hired autos and route buses: the edges still to drive (else wander), a stop to pull in
      // at {edge, s}, held at a standstill, and never despawned while the player needs them.
      route: null, stop: null, stopped: false, hold: false, keep: false,
      // In a hurry (a hired auto with the player aboard): no dawdling, fast corners, hard acceleration.
      rush: false,
    };
    if (erratic) {
      const [lo, hi] = this.band(a);
      a.lat = a.latTarget = lo + rng() * (hi - lo);
    }
    this.agents.push(a);
    this.addToGrid(a);
    return a;
  }

  // A vehicle of this type on a given road, `s` metres along its lane (hired autos and route
  // buses). Built straight away if the pool has none.
  spawnOn(type, e, s) {
    const lane = this.chooseLane(e, type);
    const path = this.edgePath(e, lane);
    s = Math.max(0, Math.min(path.length - 1, s));
    const list = this.pool.get(type);
    const v = list && list.length ? list.pop() : new Vehicle(type, { rng, rider: true });
    return this.addAgent(v, e, lane, path, s, sample(path, s));
  }

  // Where to sit across the carriageway to pull in at the kerb.
  kerbLat(a) {
    const [, hi] = this.band(a);
    return hi - Math.max(0, a.v.spec.width / 2 - 0.55);
  }

  chooseLane(e, type, fromTurn = false) {
    const n = e.road.lanes;
    if (n === 1) return 0;
    // Buses and lorries hug the kerb (outer lane); others pick freely.
    let lane = HEAVY.has(type) ? n - 1 : Math.floor(rng() * n);
    // Vehicles turning onto a flyover approach stay off the flyover lane.
    if (e.flyover && fromTurn && lane === 0) lane = 1;
    return lane;
  }

  // Lateral range (relative to the agent's lane centre) of its own side of the carriageway.
  band(a) {
    const r = a.edge.road, half = (r.median || 0) / 2, off = this.layout.laneOffset(r, a.lane);
    let lo = half + 0.7, hi = half + r.lanes * LANE_W - 0.75;
    // Flyover approaches: the inner lane climbs the deck, so stay on whichever side you're on.
    if (a.edge.flyover) {
      if (a.lane === 0) hi = half + LANE_W - 0.6;
      else lo = half + LANE_W + 0.6;
    }
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

  turnPath(from, d1, e2, lane2) {
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
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, u = 1 - t;
      pts.push({ x: u * u * start.x + 2 * u * t * cx + t * t * end.x, z: u * u * start.z + 2 * u * t * cz + t * t * end.z });
    }
    return { turn: makePath(pts), next };
  }

  chooseNext(a) {
    if (a.route) {
      const next = a.route[0];
      if (next && next.from === a.edge.to) { a.route.shift(); return next; }
      if (next) a.route = null; // knocked off the route: wander from here
    }
    const node = a.edge.to;
    let opts = node.out.filter((e) => e.to !== a.edge.from);
    if (!opts.length) opts = node.out;
    let straight = null, bd = 0.85;
    for (const e of opts) { const d = e.dir.x * a.edge.dir.x + e.dir.z * a.edge.dir.z; if (d > bd) { bd = d; straight = e; } }
    // On the flyover lane you can only go straight over the junction.
    if (a.edge.flyover && a.lane === 0 && straight && straight.flyover) return straight;
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
    const e2 = this.chooseNext(a);
    const straight = e2.dir.x * a.edge.dir.x + e2.dir.z * a.edge.dir.z > 0.85;
    const lane2 = straight && e2.road.lanes === a.edge.road.lanes ? a.lane : this.chooseLane(e2, a.v.type, !straight);
    const { turn, next } = this.turnPath(a.path, a.edge.dir, e2, lane2);
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
    a.v.driver = null;
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
    this.grid.clear();
    for (const a of this.agents) this.addToGrid(a);
  }
  occupied(x, z, r) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const l = this.grid.get(this.key(x + dx * CELL, z + dz * CELL));
      if (l) for (const b of l) if (Math.abs(b.v.x - x) < r && Math.abs(b.v.z - z) < r) return true;
    }
    return false;
  }

  // Distance to the nearest thing ahead within `look`, for a vehicle at lateral offset `lat`.
  gapAhead(a, lat, look, obstacles) {
    const v = a.v;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const lx = fz, lz = -fx;
    const ox = v.x + lx * (lat - a.lat), oz = v.z + lz * (lat - a.lat);
    const myHalf = v.spec.width / 2;
    const margin = a.erratic ? 0.12 : 0.3;
    const halfLen = v.spec.length / 2;
    let gap = Infinity, blocker = null;
    // (Inlined rather than a helper closure: captured numbers would be re-boxed on every write.)
    const span = Math.ceil((look + 8) / CELL);
    for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) {
      const l = this.grid.get(this.key(v.x + i * CELL, v.z + j * CELL));
      if (!l) continue;
      for (let n = 0; n < l.length; n++) {
        const b = l[n];
        if (b === a) continue;
        const bv = b.v;
        if (Math.abs(bv.y - v.y) > 2.5) continue;
        const dot = Math.sin(bv.heading) * fx + Math.cos(bv.heading) * fz;
        // Oncoming traffic only matters when someone is on the wrong side.
        const oncoming = dot < -0.7;
        if (oncoming && !a.wrongNow && !b.wrongNow) continue;
        const closing = oncoming ? b.speed : 0;
        const dx = bv.x - ox, dz = bv.z - oz;
        const ahead = dx * fx + dz * fz;
        if (ahead <= 0 || ahead > look + closing * 2) continue;
        const ad = Math.abs(dot);
        const hl = bv.spec.length / 2, hw = bv.spec.width / 2;
        if (Math.abs(dx * lx + dz * lz) > myHalf + hw * ad + hl * (1 - ad) + margin) continue;
        // Someone coming head-on closes the gap twice as fast: plan for where they'll be.
        const g = ahead - halfLen - (hl * ad + hw * (1 - ad)) - closing * 1.5;
        if (g < gap) { gap = g; blocker = b; }
      }
    }
    for (let n = 0; n < obstacles.length; n++) {
      const o = obstacles[n];
      if (Math.abs((o.y ?? v.y) - v.y) > 2.5) continue;
      const dx = o.x - ox, dz = o.z - oz;
      const ahead = dx * fx + dz * fz;
      if (ahead <= 0 || ahead > look) continue;
      if (Math.abs(dx * lx + dz * lz) > myHalf + o.r + margin) continue;
      const g = ahead - halfLen - o.r;
      if (g < gap) { gap = g; blocker = o; }
    }
    const res = this._gapRes || (this._gapRes = { gap: 0, blocker: null });
    res.gap = gap; res.blocker = blocker;
    return res;
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

      let { gap, blocker } = this.gapAhead(a, a.lat, look, obstacles);
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
            // Drift somewhere else across the carriageway; lane markings are a suggestion.
            a.latTarget = Math.max(lo, Math.min(hi, a.lat + (rng() - 0.5) * (two ? 5 : 3.5)));
            a.weaveT = (two ? 0.8 : 1.5) + rng() * (two ? 2.5 : 3.5);
          }
        }
        // Squeeze through any gap: sample across the whole road (both sides when riding wrong).
        if (gap < 7 + a.speed * 1.2) {
          let best = a.latTarget, bestGap = gap;
          const [wl] = this.wrongBand(a);
          const from = a.wrong ? wl : lo, steps = a.wrong ? 9 : 6;
          for (let k = 0; k <= steps; k++) {
            const cand = from + ((hi - from) * k) / steps;
            const r = this.gapAhead(a, cand, look, obstacles);
            const score = r.gap - Math.abs(cand - a.lat) * 0.4;
            if (score > bestGap + 1.2) { bestGap = score; best = cand; }
          }
          a.latTarget = best;
        }
        // Bursts of speed and sudden slow-downs.
        a.surgeT -= dt;
        if (a.surgeT <= 0) { a.surge = 0.75 + rng() * 0.55; a.surgeT = 2 + rng() * 4; }
        surge = a.surge;
      }

      let target = a.rush ? (a.turning ? Math.min(a.cruise, 10) : a.cruise * Math.max(1, surge)) * rainSlow
        : (a.turning ? Math.min(a.cruise, 6.5) : a.cruise * surge) * rainSlow;
      a.waitingSignal = false;
      // Signals.
      if (!a.turning && a.edge.to.signal && !(a.edge.flyover && a.lane === 0)) {
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
      // Level crossing gates down: wait behind them.
      for (const lc of this.layout.levelCrossings) {
        if (!lc.closed || a.edge.und !== lc.edge) continue;
        const d = (lc.x - v.x) * Math.sin(v.heading) + (lc.z - v.z) * Math.cos(v.heading);
        if (d > 10.5 && d < look + 20) { target = Math.min(target, Math.max(0, (d - 11.5) * 1.2)); a.waitingSignal = true; } // already past the gate: clear the tracks
      }
      if (a.ghost > 0) a.ghost -= dt;
      else if (gap < Infinity) {
        const safe = (two ? 1.0 : a.erratic ? 1.4 : 2.0) + a.speed * (a.erratic ? 0.4 : 0.55);
        if (gap < safe) target = Math.min(target, Math.max(0, (gap - (two ? 0.4 : 1.0)) * 1.5));
        // Somebody's coming at you on your side of the road: lean on the horn.
        if (blocker?.wrongNow && gap < 25 && distP < 150 && (a.honkCd -= dt * 4) <= 0) {
          a.honkCd = 1 + rng() * 2;
          audio?.horn(v.spec.horn, v.x, v.z, camera, v.hornPitch);
        }
      }
      if (blocker && blocker.waitingSignal) a.waitingSignal = true;
      if (a.stunned > 0) { a.stunned -= dt; target = 0; }
      // Flood water: everyone slows down and wades through (and eases off before reaching it).
      const fx0 = Math.sin(v.heading), fz0 = Math.cos(v.heading);
      const depth = world.waterDepth(v.x, v.z, v.y);
      const depthAhead = Math.max(depth, world.waterDepth(v.x + fx0 * 10, v.z + fz0 * 10, v.y));
      v.waterDepth = depth;
      v.stalled = false;
      if (depthAhead > 0.06) target = Math.min(target, Math.max(2.2, 7.5 - depthAhead * (two ? 7 : 5)));

      // Pull in at a stop on this stretch (a fare, a passenger, a bus stop) and wait there.
      if (a.stop && !a.turning && a.edge === a.stop.edge) {
        const d = a.stop.s - a.s;
        if (d > -2) {
          if (d < 45) a.latTarget = this.kerbLat(a);
          // (In a rush: brake late and hard, but still stop on the spot.)
          target = Math.min(target, a.rush ? Math.sqrt(2 * v.spec.brake * 0.6 * Math.max(0, d - 0.5)) : Math.max(0, d * 0.7));
          if (d < 1.5 && a.speed < 0.5) a.stopped = true;
        }
      }
      if (a.hold) target = 0;
      const acc = target > a.speed ? v.spec.accel * (a.rush ? 1.6 : 0.8) : v.spec.brake;
      a.speed += Math.sign(target - a.speed) * Math.min(Math.abs(target - a.speed), acc * dt);

      // Stuck: honk, and eventually squeeze through anyway (but not at a red light or in water).
      if (a.speed < 0.5 && target < 0.5 && a.stunned <= 0 && !a.stopped && !a.hold) {
        a.stuck += dt;
        a.honkCd -= dt;
        if (a.honkCd <= 0 && (blocker || a.waitingSignal) && distP < 160) {
          a.honkCd = (a.waitingSignal ? 3 : 1.2) + rng() * 2.5;
          if (!a.waitingSignal || rng() < 0.4) audio?.horn(v.spec.horn, v.x, v.z, camera, v.hornPitch);
        }
        if (a.stuck > (blocker?.wrongNow || a.wrongNow ? 2.5 : 5) && !a.waitingSignal && !(blocker && (blocker.isPlayer || blocker.isCop))) { a.ghost = 2.5; a.stuck = 0; }
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
      if (!far || ai % 4 === 0) v.syncVisual(dt, world);
    }
    // Top up the population around the player.
    const want = Math.round(this.target * (world.trafficScale ?? 1));
    let budget = this.agents.length < want * 0.5 ? 12 : 3;
    while (this.agents.length < want && budget-- > 0) this.spawn(world, world.initialFill);
  }
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
