// AI traffic that follows the road graph, keeping LEFT, and honks a lot.
import { Vehicle } from './vehicle.js';
import { mulberry32 } from '../world/textures.js';

const rng = mulberry32(4242);
const MIX = [
  ['scooter', 0.36], ['auto', 0.24], ['hatch', 0.14], ['taxi', 0.1], ['suv', 0.07], ['bus', 0.09],
];
function pickType() {
  let r = rng();
  for (const [t, p] of MIX) { if ((r -= p) <= 0) return t; }
  return 'hatch';
}

export class Traffic {
  constructor(scene, layout, count = 55) {
    this.scene = scene;
    this.layout = layout;
    this.agents = [];
    this.target = count;
    for (let k = 0; k < count; k++) this.spawn();
  }

  spawn(avoid) {
    const L = this.layout;
    for (let tries = 0; tries < 20; tries++) {
      const e = L.edges[Math.floor(rng() * L.edges.length)];
      const type = pickType();
      const lane = type === 'bus' ? 0 : Math.floor(rng() * e.road.lanes);
      const path = this.edgePath(e, lane);
      const s = rng() * Math.max(0, path.length - 10);
      const p = sample(path, s);
      if (avoid && Math.hypot(p.x - avoid.x, p.z - avoid.z) < 120) continue;
      if (this.agents.some((a) => Math.hypot(a.v.x - p.x, a.v.z - p.z) < 12)) continue;
      const v = new Vehicle(type, { x: p.x, z: p.z, heading: p.h, rng, rider: true });
      v.driver = 'ai';
      this.scene.add(v.group);
      const a = {
        v, edge: e, lane, path, s, speed: 0, cruise: v.spec.maxSpeed * (type === 'scooter' ? 0.55 : 0.45) * (0.8 + rng() * 0.4),
        stuck: 0, ghost: 0, honkCd: rng() * 3, weave: type === 'scooter' ? (rng() - 0.5) * 1.2 : 0, stunned: 0,
      };
      this.agents.push(a);
      return a;
    }
    return null;
  }

  // Straight path along an edge in a given lane, from junction mouth to junction mouth.
  edgePath(e, lane) {
    const L = this.layout;
    const off = L.laneOffset(e.road, lane);
    const lx = e.dir.z, lz = -e.dir.x; // driver's left
    const a = L.crossHalfWidth(e.from, e.road) + 1.5;
    const b = L.crossHalfWidth(e.to, e.road) + 1.5;
    const p0 = { x: e.from.x + e.dir.x * a + lx * off, z: e.from.z + e.dir.z * a + lz * off };
    const p1 = { x: e.to.x - e.dir.x * b + lx * off, z: e.to.z - e.dir.z * b + lz * off };
    return makePath([p0, p1]);
  }

  // Curve through the junction from the end of one edge to the start of the next.
  turnPath(from, e2, lane2) {
    const start = from.points[from.points.length - 1];
    const next = this.edgePath(e2, lane2);
    const end = next.points[0];
    const d1 = from.dir;
    let cx, cz;
    if (Math.abs(d1.x * e2.dir.x + d1.z * e2.dir.z) > 0.5) { cx = (start.x + end.x) / 2; cz = (start.z + end.z) / 2; }
    else {
      // Corner where the two lane lines meet.
      if (d1.x !== 0) { cx = end.x; cz = start.z; } else { cx = start.x; cz = end.z; }
    }
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
    // Prefer going straight a bit more often.
    const straight = opts.find((e) => e.dir.x === a.edge.dir.x && e.dir.z === a.edge.dir.z);
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
    const lane2 = a.v.type === 'bus' ? 0 : Math.floor(rng() * e2.road.lanes);
    a.path.dir = a.edge.dir;
    const { turn, next } = this.turnPath(a.path, e2, lane2);
    a.edge = e2;
    a.lane = lane2;
    a.path = turn;
    a.nextPath = next;
    a.turning = true;
    a.s = 0;
  }

  // Remove an agent from AI control (carjacked or wrecked). Returns the vehicle.
  release(a) {
    const i = this.agents.indexOf(a);
    if (i >= 0) this.agents.splice(i, 1);
    a.v.driver = null;
    const fx = Math.sin(a.v.heading), fz = Math.cos(a.v.heading);
    a.v.vx = fx * a.speed; a.v.vz = fz * a.speed;
    return a.v;
  }

  findAgent(vehicle) {
    return this.agents.find((a) => a.v === vehicle);
  }

  update(dt, world) {
    const { obstacles, audio, camera } = world;
    for (const a of this.agents) {
      const v = a.v;
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const lx = fz, lz = -fx;
      // Look ahead for anything in our way.
      const look = 6 + a.speed * 1.6 + v.spec.length / 2;
      let gap = Infinity, blocker = null;
      const myHalf = v.spec.width / 2;
      const scan = (ox, oz, r, who) => {
        const dx = ox - v.x, dz = oz - v.z;
        const ahead = dx * fx + dz * fz;
        if (ahead <= 0 || ahead > look) return;
        const lat = Math.abs(dx * lx + dz * lz);
        if (lat > myHalf + r + 0.4) return;
        const g = ahead - v.spec.length / 2 - r;
        if (g < gap) { gap = g; blocker = who; }
      };
      for (const b of this.agents) {
        if (b === a) continue;
        if (Math.abs(b.v.x - v.x) > look + 6 || Math.abs(b.v.z - v.z) > look + 6) continue;
        // Ignore oncoming traffic in its own lane (heading roughly opposite).
        const dot = Math.sin(b.v.heading) * fx + Math.cos(b.v.heading) * fz;
        if (dot < -0.7) continue;
        scan(b.v.x, b.v.z, b.v.spec.length / 2 * Math.abs(dot) + b.v.spec.width / 2 * (1 - Math.abs(dot)), b);
      }
      for (const o of obstacles) scan(o.x, o.z, o.r, o);

      let target = a.turning ? Math.min(a.cruise, 6.5) : a.cruise;
      if (a.ghost > 0) { a.ghost -= dt; }
      else if (gap < Infinity) {
        const safe = 2.0 + a.speed * 0.6;
        if (gap < safe) target = Math.min(target, Math.max(0, (gap - 1.2) * 1.5));
      }
      if (a.stunned > 0) { a.stunned -= dt; target = 0; }
      // Accelerate/brake.
      const acc = target > a.speed ? v.spec.accel * 0.8 : v.spec.brake;
      a.speed += Math.sign(target - a.speed) * Math.min(Math.abs(target - a.speed), acc * dt);

      // Stuck behind something: honk, then eventually squeeze through.
      if (a.speed < 0.5 && target < 0.5 && a.stunned <= 0) {
        a.stuck += dt;
        a.honkCd -= dt;
        if (a.honkCd <= 0 && blocker) {
          a.honkCd = 1.2 + rng() * 2.5;
          audio?.horn(v.spec.sound, v.x, v.z, camera);
        }
        if (a.stuck > 5 && !(blocker && blocker.isPlayer)) { a.ghost = 2.5; a.stuck = 0; }
      } else a.stuck = Math.max(0, a.stuck - dt);
      // Random Bengaluru honking even when moving.
      if (a.speed > 3 && rng() < dt * 0.04) audio?.horn(v.spec.sound, v.x, v.z, camera);

      a.s += a.speed * dt;
      while (a.s >= a.path.length) {
        a.s -= a.path.length;
        this.advance(a);
      }
      const p = sample(a.path, a.s);
      // Two-wheelers weave inside their lane.
      const w = a.weave ? Math.sin(performance.now() * 0.0004 + v.id) * a.weave : 0;
      const nh = p.h;
      const prevX = v.x, prevZ = v.z;
      v.x = p.x + Math.cos(nh) * w;
      v.z = p.z - Math.sin(nh) * w;
      let dh = nh - v.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      v.yawRate = dt > 0 ? dh / dt * 0.5 : 0;
      v.heading += dh * Math.min(1, dt * 10);
      v.vx = dt > 0 ? (v.x - prevX) / dt : 0;
      v.vz = dt > 0 ? (v.z - prevZ) / dt : 0;
      v.syncVisual(dt, world);
      const far = Math.abs(v.x - world.focus.x) > 260 || Math.abs(v.z - world.focus.z) > 260;
      v.group.visible = !far;
    }
    // Keep the population topped up (vehicles we released or wrecked).
    if (this.agents.length < this.target && rng() < dt * 0.5) this.spawn(world.focus);
  }
}

function makePath(points) {
  const cum = [0];
  for (let k = 1; k < points.length; k++) {
    cum.push(cum[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].z - points[k - 1].z));
  }
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

