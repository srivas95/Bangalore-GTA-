// Derived map data: road geometry, city blocks, the traffic graph, underpasses, flyovers and spatial queries.
import {
  X_ROADS, Z_ROADS, BLOCKS, JUNCTIONS, RAILWAY, UNDERPASSES, UNDERPASS, FLYOVERS, defaultBlockInfo,
  LANE_W, SIDEWALK_W, CURB_H, WORLD_MIN, WORLD_MAX,
} from '../config.js';

export function roadWidth(r) {
  return r.lanes * 2 * LANE_W + (r.median || 0);
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Layout {
  constructor() {
    this.xRoads = X_ROADS.map((r, i) => ({ ...r, axis: 'x', index: i, width: roadWidth(r) }));
    this.zRoads = Z_ROADS.map((r, i) => ({ ...r, axis: 'z', index: i, width: roadWidth(r) }));
    this.roads = [...this.xRoads, ...this.zRoads];
    this.buildBlocks();
    this.buildFeatures();
    this.buildGraph();
  }

  findRoad(name) {
    return this.roads.find((r) => r.names.some((n) => n[1] === name));
  }

  // Display name of a road at a coordinate along it.
  roadName(r, x, z) {
    const along = r.axis === 'x' ? z : x;
    for (const [upTo, name] of r.names) if (along < upTo) return name;
    return r.names[r.names.length - 1][1];
  }

  buildBlocks() {
    const xs = this.xRoads, zs = this.zRoads;
    this.blocks = [];
    this.blockGrid = [];
    const ni = xs.length + 1, nj = zs.length + 1;
    this.xEdges = [WORLD_MIN, ...xs.map((r) => r.pos), WORLD_MAX];
    this.zEdges = [WORLD_MIN, ...zs.map((r) => r.pos), WORLD_MAX];
    for (let i = 0; i < ni; i++) {
      this.blockGrid[i] = [];
      for (let j = 0; j < nj; j++) {
        const outer = {
          minX: i === 0 ? WORLD_MIN : xs[i - 1].pos + xs[i - 1].width / 2,
          maxX: i === ni - 1 ? WORLD_MAX : xs[i].pos - xs[i].width / 2,
          minZ: j === 0 ? WORLD_MIN : zs[j - 1].pos + zs[j - 1].width / 2,
          maxZ: j === nj - 1 ? WORLD_MAX : zs[j].pos - zs[j].width / 2,
        };
        const inner = {
          minX: outer.minX + (i === 0 ? 0 : SIDEWALK_W),
          maxX: outer.maxX - (i === ni - 1 ? 0 : SIDEWALK_W),
          minZ: outer.minZ + (j === 0 ? 0 : SIDEWALK_W),
          maxZ: outer.maxZ - (j === nj - 1 ? 0 : SIDEWALK_W),
        };
        const cx = (outer.minX + outer.maxX) / 2, cz = (outer.minZ + outer.maxZ) / 2;
        const edge = i === 0 || j === 0 || i === ni - 1 || j === nj - 1;
        let info = defaultBlockInfo(cx, cz);
        const o = BLOCKS.find((b) => b.at[0] > outer.minX && b.at[0] < outer.maxX && b.at[1] > outer.minZ && b.at[1] < outer.maxZ);
        if (o) info = { ...info, ...o };
        if (edge && !o) info = { ...info, zone: info.zone === 'park' ? 'park' : info.zone === 'industrial' ? 'industrial' : 'mixed' };
        const block = { i, j, outer, inner, edge, cx, cz, ...info };
        this.blocks.push(block);
        this.blockGrid[i][j] = block;
      }
    }
  }

  buildFeatures() {
    // Underpasses: carriageway dips under a railway or bridge deck.
    this.underpasses = [];
    const addUnderpass = (road, at, type, name) => {
      const hw = road.width / 2;
      const u = { road, at, type, name, half: UNDERPASS.half, depth: UNDERPASS.depth, flat: UNDERPASS.flat, waterLevel: -UNDERPASS.depth - 0.5 };
      if (road.axis === 'x') Object.assign(u, { minX: road.pos - hw, maxX: road.pos + hw, minZ: at - u.half, maxZ: at + u.half });
      else Object.assign(u, { minX: at - u.half, maxX: at + u.half, minZ: road.pos - hw, maxZ: road.pos + hw });
      this.underpasses.push(u);
    };
    for (const r of this.xRoads) if (r.pos > RAILWAY.from && r.pos < RAILWAY.to) addUnderpass(r, RAILWAY.z, 'rail', `${this.roadName(r, r.pos, RAILWAY.z)} Railway Underpass`);
    for (const u of UNDERPASSES) { const r = this.findRoad(u.road); if (r) addUnderpass(r, u.at, 'road', u.name); }

    this.flyovers = FLYOVERS.map((f) => {
      const road = this.findRoad(f.road);
      const hw = (road.median || 0) / 2 + LANE_W; // inner lane each way
      const fo = { ...f, road, hw };
      if (road.axis === 'x') Object.assign(fo, { minX: road.pos - hw, maxX: road.pos + hw, minZ: f.at - f.half, maxZ: f.at + f.half });
      else Object.assign(fo, { minX: f.at - f.half, maxX: f.at + f.half, minZ: road.pos - hw, maxZ: road.pos + hw });
      return fo;
    });
  }

  // Road surface height inside an underpass, as a function of distance along the road.
  dip(u, along) {
    const t = Math.abs(along - u.at) / u.half;
    return -u.depth * (1 - smooth(u.flat, 1, t));
  }

  deckHeight(f, along) {
    const t = Math.abs(along - f.at) / f.half;
    return f.height * (1 - smooth(f.flat, 1, t));
  }

  underpassAt(x, z) {
    for (const u of this.underpasses) if (x > u.minX && x < u.maxX && z > u.minZ && z < u.maxZ) return u;
    return null;
  }

  flyoverAt(x, z) {
    for (const f of this.flyovers) if (x > f.minX && x < f.maxX && z > f.minZ && z < f.maxZ) return f;
    return null;
  }

  // Intersections are graph nodes; directed edges run between neighbouring intersections.
  buildGraph() {
    this.nodes = [];
    const nz = this.zRoads.length;
    this.nodeIndex = (xi, zj) => xi * nz + zj;
    for (let xi = 0; xi < this.xRoads.length; xi++) {
      for (let zj = 0; zj < nz; zj++) {
        const xr = this.xRoads[xi], zr = this.zRoads[zj];
        const key = `${xr.pos},${zr.pos}`;
        const name = JUNCTIONS[key] || null;
        this.nodes.push({
          id: this.nodeIndex(xi, zj), xi, zj, x: xr.pos, z: zr.pos, out: [], name,
          signal: !!name || (xr.lanes >= 2 && zr.lanes >= 2),
          hx: xr.width / 2, hz: zr.width / 2,
        });
      }
    }
    this.edges = [];
    const link = (a, b, road) => {
      const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
      const e = { id: this.edges.length, from: a, to: b, road, dir: { x: dx, z: dz } };
      for (const f of this.flyovers) {
        if (f.road !== road) continue;
        const at = road.axis === 'x' ? [a.z, b.z] : [a.x, b.x];
        if (at.includes(f.at)) e.flyover = f;
      }
      this.edges.push(e);
      a.out.push(e);
    };
    for (const n of this.nodes) {
      const { xi, zj } = n;
      if (xi + 1 < this.xRoads.length) {
        const m = this.nodes[this.nodeIndex(xi + 1, zj)];
        link(n, m, this.zRoads[zj]); link(m, n, this.zRoads[zj]);
      }
      if (zj + 1 < nz) {
        const m = this.nodes[this.nodeIndex(xi, zj + 1)];
        link(n, m, this.xRoads[xi]); link(m, n, this.xRoads[xi]);
      }
    }
  }

  crossHalfWidth(node, road) {
    return road.axis === 'z' ? node.hx : node.hz;
  }

  laneOffset(road, lane) {
    return (road.median || 0) / 2 + (lane + 0.5) * LANE_W;
  }

  intervalIndex(edges, v) {
    let lo = 0, hi = edges.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (v >= edges[mid]) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  blockAt(x, z) {
    return this.blockGrid[this.intervalIndex(this.xEdges, x)][this.intervalIndex(this.zEdges, z)];
  }

  nearestNode(x, z) {
    let xi = 0, zj = 0, bx = Infinity, bz = Infinity;
    this.xRoads.forEach((r, i) => { const d = Math.abs(r.pos - x); if (d < bx) { bx = d; xi = i; } });
    this.zRoads.forEach((r, j) => { const d = Math.abs(r.pos - z); if (d < bz) { bz = d; zj = j; } });
    return this.nodes[this.nodeIndex(xi, zj)];
  }

  roadAt(x, z) {
    let best = null;
    const i = this.intervalIndex(this.xEdges, x), j = this.intervalIndex(this.zEdges, z);
    for (const r of [this.xRoads[i - 1], this.xRoads[i], this.zRoads[j - 1], this.zRoads[j]]) {
      if (!r) continue;
      const d = r.axis === 'x' ? Math.abs(x - r.pos) : Math.abs(z - r.pos);
      if (d <= r.width / 2 + 0.5 && (!best || r.width > best.width)) best = r;
    }
    return best;
  }

  junctionNear(x, z, radius = 30) {
    const n = this.nearestNode(x, z);
    return n.name && Math.abs(n.x - x) < radius && Math.abs(n.z - z) < radius ? n.name : null;
  }

  // Surface height. Pass the current height `y` to choose between levels on a flyover.
  groundHeight(x, z, y) {
    const b = this.blockAt(x, z);
    const o = b.outer;
    let g = x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ ? CURB_H : 0;
    if (g === 0) {
      const u = this.underpassAt(x, z);
      if (u) g = this.dip(u, u.road.axis === 'x' ? z : x);
      if (y !== undefined) {
        const f = this.flyoverAt(x, z);
        if (f) {
          const h = this.deckHeight(f, f.road.axis === 'x' ? z : x);
          if (h > 0.02 && y > h - 1.6) g = Math.max(g, h);
        }
      }
    }
    return g;
  }
}
