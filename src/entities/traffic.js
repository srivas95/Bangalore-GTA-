// AI traffic: a dense population streamed around the player that follows the road graph,
// keeps LEFT, obeys (mostly) the signals, filters between lanes on two-wheelers, honks a lot,
// and drowns its engine in flooded underpasses.
import { Vehicle } from './vehicle.js';
import { mulberry32 } from '../world/textures.js';

const rng = mulberry32(4242);
const BASE_MIX = {
  scooter: 0.2, delivery: 0.07, bike: 0.07, auto: 0.16, goodsAuto: 0.03, hatch: 0.1, sedan: 0.06, taxi: 0.07,
  suv: 0.05, tempo: 0.025, miniTruck: 0.03, bus: 0.055, schoolBus: 0.015, lorry: 0.015, tanker: 0.012, hoysala: 0.008,
};
const HEAVY = new Set(['bus', 'schoolBus', 'lorry', 'tanker', 'tempo', 'goodsAuto', 'miniTruck']);
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
      v.x = p.x; v.z = p.z; v.heading = p.h; v.y = 0; v.vx = v.vz = 0;
      v.driver = 'ai';
      v.stalled = false;
      if (!v.rider) v.addRider(rng);
      this.scene.add(v.group);
      const two = v.spec.twoWheeler;
      const a = {
        v, edge: e, lane, path, s, speed: 0, turning: false,
        cruise: v.spec.maxSpeed * (two ? 0.55 : HEAVY.has(type) ? 0.5 : 0.45) * (0.8 + rng() * 0.4),
        stuck: 0, ghost: 0, honkCd: rng() * 3, lat: 0, latTarget: 0, stunned: 0,
        jumper: rng() < (two ? 0.3 : type === 'auto' ? 0.25 : HEAVY.has(type) ? 0.05 : 0.1),
        impatience: rng(),
      };
      this.agents.push(a);
      this.addToGrid(a);
      return a;
    }
    return null;
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

  edgePath(e, lane) {
    const L = this.layout;
    const off = L.laneOffset(e.road, lane);
    const lx = e.dir.z, lz = -e.dir.x;
    const a = L.crossHalfWidth(e.from, e.road) + 1.5;
    const b = L.crossHalfWidth(e.to, e.road) + 1.5;
    const p0 = { x: e.from.x + e.dir.x * a + lx * off, z: e.from.z + e.dir.z * a + lz * off };
    const p1 = { x: e.to.x - e.dir.x * b + lx * off, z: e.to.z - e.dir.z * b + lz * off };
    return makePath([p0, p1]);
  }

  turnPath(from, d1, e2, lane2) {
    const start = from.points[from.points.length - 1];
    const next = this.edgePath(e2, lane2);
    const end = next.points[0];
    let cx, cz;
    if (Math.abs(d1.x * e2.dir.x + d1.z * e2.dir.z) > 0.5) { cx = (start.x + end.x) / 2; cz = (start.z + end.z) / 2; }
    else if (d1.x !== 0) { cx = end.x; cz = start.z; } else { cx = start.x; cz = end.z; }
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
    const straight = opts.find((e) => e.dir.x === a.edge.dir.x && e.dir.z === a.edge.dir.z);
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
      return;
    }
    const e2 = this.chooseNext(a);
    const straight = e2.dir.x === a.edge.dir.x && e2.dir.z === a.edge.dir.z;
    const lane2 = straight && e2.road.lanes === a.edge.road.lanes ? a.lane : this.chooseLane(e2, a.v.type, !straight);
    const { turn, next } = this.turnPath(a.path, a.edge.dir, e2, lane2);
    a.edge = e2;
    a.lane = lane2;
    a.path = turn;
    a.nextPath = next;
    a.turning = true;
    a.s = 0;
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
    let gap = Infinity, blocker = null;
    const test = (px, pz, py, r, who) => {
      if (Math.abs(py - v.y) > 2.5) return;
      const dx = px - ox, dz = pz - oz;
      const ahead = dx * fx + dz * fz;
      if (ahead <= 0 || ahead > look) return;
      const latd = Math.abs(dx * lx + dz * lz);
      if (latd > myHalf + r + 0.3) return;
      const g = ahead - v.spec.length / 2 - r;
      if (g < gap) { gap = g; blocker = who; }
    };
    const span = Math.ceil((look + 8) / CELL);
    for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) {
      const l = this.grid.get(this.key(v.x + i * CELL, v.z + j * CELL));
      if (!l) continue;
      for (const b of l) {
        if (b === a) continue;
        const dot = Math.sin(b.v.heading) * fx + Math.cos(b.v.heading) * fz;
        if (dot < -0.7) continue; // oncoming
        const ad = Math.abs(dot);
        test(b.v.x, b.v.z, b.v.y, (b.v.spec.length / 2) * ad + (b.v.spec.width / 2) * (1 - ad), b);
      }
    }
    for (const o of obstacles) test(o.x, o.z, o.y ?? v.y, o.r, o);
    return { gap, blocker };
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
      if (distP > this.radius + 70) { this.despawn(a); continue; }
      const two = v.spec.twoWheeler;
      const look = 6 + a.speed * 1.6 + v.spec.length / 2;

      let { gap, blocker } = this.gapAhead(a, a.lat, look, obstacles);
      // Two-wheelers squeeze through gaps between larger vehicles.
      if (two && gap < 6 + a.speed) {
        let best = a.latTarget, bestGap = gap;
        const maxLat = 1.4;
        for (const cand of [-maxLat, -0.7, 0, 0.7, maxLat]) {
          const r = this.gapAhead(a, cand, look, obstacles);
          if (r.gap > bestGap + 1.5) { bestGap = r.gap; best = cand; }
        }
        a.latTarget = best;
      } else if (two && gap > 25) a.latTarget *= 0.98;

      let target = (a.turning ? Math.min(a.cruise, 6.5) : a.cruise) * rainSlow;
      a.waitingSignal = false;
      // Signals.
      if (!a.turning && a.edge.to.signal && !(a.edge.flyover && a.lane === 0)) {
        const st = sig.state(a.edge.to, a.edge.road.axis);
        if (st !== 'green') {
          const creep = two ? 2.4 : 0;
          const d = a.path.length + creep - a.s - (two ? 0 : 1.0);
          const jump = a.jumper && (st === 'amber' || sig.redAge(a.edge.to, a.edge.road.axis) < 2.5 + a.impatience * 2);
          const committed = st === 'amber' && d < a.speed * 1.1;
          if (!jump && !committed && d < look + 10) {
            target = Math.min(target, Math.max(0, (d - 0.3) * 1.2));
            a.waitingSignal = true;
          }
        }
      }
      if (a.ghost > 0) a.ghost -= dt;
      else if (gap < Infinity) {
        const safe = (two ? 1.0 : 2.0) + a.speed * 0.55;
        if (gap < safe) target = Math.min(target, Math.max(0, (gap - (two ? 0.4 : 1.0)) * 1.5));
      }
      if (blocker && blocker.waitingSignal) a.waitingSignal = true;
      if (a.stunned > 0) { a.stunned -= dt; target = 0; }
      // Flood water.
      const depth = world.waterDepth(v.x, v.z, v.y);
      v.waterDepth = depth;
      if (depth > 0.12) target = Math.min(target, 3);
      if (depth > v.spec.stall) { v.stalled = true; target = 0; }
      else if (depth < 0.05) v.stalled = false;

      const acc = target > a.speed ? v.spec.accel * 0.8 : v.spec.brake;
      a.speed += Math.sign(target - a.speed) * Math.min(Math.abs(target - a.speed), acc * dt);

      // Stuck: honk, and eventually squeeze through anyway (but not at a red light or in water).
      if (a.speed < 0.5 && target < 0.5 && a.stunned <= 0) {
        a.stuck += dt;
        a.honkCd -= dt;
        if (a.honkCd <= 0 && (blocker || a.waitingSignal) && distP < 160) {
          a.honkCd = (a.waitingSignal ? 3 : 1.2) + rng() * 2.5;
          if (!a.waitingSignal || rng() < 0.4) audio?.horn(v.spec.horn, v.x, v.z, camera, v.hornPitch);
        }
        if (a.stuck > 5 && !a.waitingSignal && !v.stalled && !(blocker && (blocker.isPlayer || blocker.isCop))) { a.ghost = 2.5; a.stuck = 0; }
        if (a.stuck > 45 && distP > 120) { this.despawn(a); continue; }
      } else a.stuck = Math.max(0, a.stuck - dt);
      if (a.speed > 3 && distP < 160 && rng() < dt * 0.03) audio?.horn(v.spec.horn, v.x, v.z, camera, v.hornPitch);

      a.s += a.speed * dt;
      while (a.s >= a.path.length) {
        a.s -= a.path.length;
        this.advance(a);
      }
      const p = sample(a.path, a.s);
      a.lat += Math.sign(a.latTarget - a.lat) * Math.min(Math.abs(a.latTarget - a.lat), 1.2 * dt);
      const nh = p.h;
      const prevX = v.x, prevZ = v.z;
      v.x = p.x + Math.cos(nh) * a.lat;
      v.z = p.z - Math.sin(nh) * a.lat;
      let dh = nh - v.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      v.yawRate = dt > 0 ? (dh / dt) * 0.5 : 0;
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
