// Static axis-aligned box colliders in a uniform spatial hash, with circle queries.

const CELL = 16;

export class Colliders {
  constructor() {
    this.cells = new Map();
    this.all = [];
    this._stamp = 0;
  }

  key(cx, cz) {
    return cx * 73856093 ^ cz * 19349663;
  }

  // h = height of the obstacle top (used by the camera and to let tall things block it).
  // y0 = bottom of the obstacle (for walls on raised decks that traffic can pass beneath).
  add(minX, maxX, minZ, maxZ, h = 10, tag = 'static', y0 = -100) {
    const box = { minX, maxX, minZ, maxZ, h, y0, tag, _s: 0 };
    this.all.push(box);
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        const k = this.key(cx, cz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(box);
      }
    }
    return box;
  }

  addCentered(cx, cz, w, d, h, tag, y0) {
    return this.add(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h, tag, y0);
  }

  query(minX, maxX, minZ, maxZ, out = []) {
    out.length = 0;
    const s = ++this._stamp;
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const b of list) {
          if (b._s === s) continue;
          b._s = s;
          if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  // Push a circle out of all boxes. Returns {x, z, nx, nz, depth} of the deepest contact, or null.
  resolveCircle(x, z, r, y = 0) {
    const hits = this.query(x - r, x + r, z - r, z + r, this._tmp || (this._tmp = []));
    let contact = null;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of hits) {
        if (b.h < y + 0.3 || b.y0 > y + 1.2) continue; // low enough to step over, or overhead
        const px = Math.max(b.minX, Math.min(x, b.maxX));
        const pz = Math.max(b.minZ, Math.min(z, b.maxZ));
        let dx = x - px, dz = z - pz;
        let d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx, nz, depth;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nx = dx / d; nz = dz / d; depth = r - d;
        } else {
          // Centre inside the box: push out along the shallowest axis.
          const l = x - b.minX, rr = b.maxX - x, t = z - b.minZ, bt = b.maxZ - z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) { nx = -1; nz = 0; depth = l + r; }
          else if (m === rr) { nx = 1; nz = 0; depth = rr + r; }
          else if (m === t) { nx = 0; nz = -1; depth = t + r; }
          else { nx = 0; nz = 1; depth = bt + r; }
        }
        x += nx * depth;
        z += nz * depth;
        moved = true;
        if (!contact || depth > contact.depth) contact = { nx, nz, depth };
      }
      if (!moved) break;
    }
    if (contact) { contact.x = x; contact.z = z; }
    return contact;
  }

  // Is the point inside a box taller than y?
  pointBlocked(x, z, y, tag) {
    const hits = this.query(x, x, z, z, this._tmp2 || (this._tmp2 = []));
    for (const b of hits) if (b.h > y && b.y0 < y && (!tag || b.tag === tag) && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
    return false;
  }
}
