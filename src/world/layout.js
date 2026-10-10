// Derived map data: road geometry, city blocks, the traffic graph and spatial queries.
import {
  X_ROADS, Z_ROADS, ZONES, defaultZone, LANE_W, SIDEWALK_W, CURB_H, WORLD_MIN, WORLD_MAX,
} from '../config.js';

export function roadWidth(r) {
  return r.lanes * 2 * LANE_W + (r.median || 0);
}

export class Layout {
  constructor() {
    this.xRoads = X_ROADS.map((r, i) => ({ ...r, axis: 'x', index: i, width: roadWidth(r) }));
    this.zRoads = Z_ROADS.map((r, i) => ({ ...r, axis: 'z', index: i, width: roadWidth(r) }));
    this.roads = [...this.xRoads, ...this.zRoads];
    this.buildBlocks();
    this.buildGraph();
  }

  buildBlocks() {
    const xs = this.xRoads, zs = this.zRoads;
    this.blocks = [];
    this.blockGrid = [];
    const ni = xs.length + 1, nj = zs.length + 1;
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
        const info = ZONES[`${i},${j}`] || defaultZone(i, j);
        const edge = i === 0 || j === 0 || i === ni - 1 || j === nj - 1;
        const block = { i, j, outer, inner, edge, ...info };
        this.blocks.push(block);
        this.blockGrid[i][j] = block;
      }
    }
    this.xEdges = [WORLD_MIN, ...xs.map((r) => r.pos), WORLD_MAX];
    this.zEdges = [WORLD_MIN, ...zs.map((r) => r.pos), WORLD_MAX];
  }

  // Intersections are graph nodes; directed edges run between neighbouring intersections.
  buildGraph() {
    this.nodes = [];
    const idx = (xi, zj) => xi * this.zRoads.length + zj;
    for (let xi = 0; xi < this.xRoads.length; xi++) {
      for (let zj = 0; zj < this.zRoads.length; zj++) {
        this.nodes.push({ id: idx(xi, zj), xi, zj, x: this.xRoads[xi].pos, z: this.zRoads[zj].pos, out: [] });
      }
    }
    this.edges = [];
    const link = (a, b, road) => {
      const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
      const e = { id: this.edges.length, from: a, to: b, road, dir: { x: dx, z: dz } };
      this.edges.push(e);
      a.out.push(e);
    };
    for (const n of this.nodes) {
      const { xi, zj } = n;
      if (xi + 1 < this.xRoads.length) {
        const m = this.nodes[idx(xi + 1, zj)];
        link(n, m, this.zRoads[zj]);
        link(m, n, this.zRoads[zj]);
      }
      if (zj + 1 < this.zRoads.length) {
        const m = this.nodes[idx(xi, zj + 1)];
        link(n, m, this.xRoads[xi]);
        link(m, n, this.xRoads[xi]);
      }
    }
  }

  // Half the width of the road that crosses `road` at `node`.
  crossHalfWidth(node, road) {
    const other = road.axis === 'z' ? this.xRoads[node.xi] : this.zRoads[node.zj];
    return other.width / 2;
  }

  // Lateral offset from the road centreline for a lane (positive = driver's left).
  laneOffset(road, lane) {
    return (road.median || 0) / 2 + (lane + 0.5) * LANE_W;
  }

  intervalIndex(edges, v) {
    for (let k = 0; k < edges.length - 1; k++) if (v < edges[k + 1]) return k;
    return edges.length - 2;
  }

  blockAt(x, z) {
    const i = this.intervalIndex(this.xEdges, x);
    const j = this.intervalIndex(this.zEdges, z);
    return this.blockGrid[i][j];
  }

  roadAt(x, z) {
    let best = null;
    for (const r of this.roads) {
      const d = r.axis === 'x' ? Math.abs(x - r.pos) : Math.abs(z - r.pos);
      if (d <= r.width / 2 + 0.5 && (!best || r.width > best.width)) best = r;
    }
    return best;
  }

  groundHeight(x, z) {
    const b = this.blockAt(x, z);
    const o = b.outer;
    return x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ ? CURB_H : 0;
  }
}
