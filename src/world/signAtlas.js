// Signboards share a few big canvas atlases instead of a texture (and a draw call) each: every
// sign is painted into its own slot of a 2048 px page, and its quad is merged with the other
// signs on that page in the same 320 m chunk, so they're also culled by distance with the city.
import * as THREE from 'three';

const PAGE = 2048, PAD = 3, CHUNK = 320;

export class SignAtlas {
  constructor({ maxPages = 6 } = {}) {
    this.slots = new Map();
    this.quads = [];
    this.maxPages = maxPages;
  }

  // A slot pw x ph pixels, painted later by paint(ctx, pw, ph) at the origin. Same key, same slot.
  slot(key, pw, ph, paint) {
    let s = this.slots.get(key);
    if (!s) {
      s = { pw: Math.max(8, Math.min(PAGE - 2 * PAD, Math.round(pw))), ph: Math.max(8, Math.min(PAGE - 2 * PAD, Math.round(ph))), paint };
      this.slots.set(key, s);
    }
    return s;
  }

  // A w x h metre board facing +z after a turn of rotY about y, centred on (x, y, z). With
  // `back`, the same picture is shown on the back too (free-standing hoardings).
  quad(slot, w, h, x, y, z, rotY = 0, { back = false, uv } = {}) {
    this.quads.push({ slot, w, h, x, y, z, rotY, back, uv });
  }

  // Pack, paint, and build one mesh per page and chunk. makeMaterial(texture) gives each page's material.
  build(group, makeMaterial, { name = 'signs', anisotropy = 8 } = {}) {
    const slots = [...this.slots.values()].sort((a, b) => b.ph - a.ph || b.pw - a.pw);
    const pages = [];
    const newPage = () => {
      const c = document.createElement('canvas');
      c.width = c.height = PAGE;
      const p = { c, ctx: c.getContext('2d'), shelves: [], y: 0 };
      pages.push(p);
      return p;
    };
    // Shelf packing: tallest first, each into the first shelf it fits.
    for (const s of slots) {
      const w = s.pw + PAD * 2, h = s.ph + PAD * 2;
      let placed = false;
      for (const p of pages) {
        for (const sh of p.shelves) {
          if (h <= sh.h && sh.x + w <= PAGE) { s.page = p; s.x = sh.x; s.y = sh.y; sh.x += w; placed = true; break; }
        }
        if (!placed && p.y + h <= PAGE) { p.shelves.push({ y: p.y, h, x: w }); s.page = p; s.x = 0; s.y = p.y; p.y += h; placed = true; }
        if (placed) break;
      }
      if (!placed) {
        if (pages.length >= this.maxPages) { s.page = null; continue; }
        const p = newPage();
        p.shelves.push({ y: 0, h, x: w }); s.page = p; s.x = 0; s.y = 0; p.y = h;
      }
    }
    for (const s of slots) {
      if (!s.page) continue;
      const { ctx, c } = s.page, x = s.x + PAD, y = s.y + PAD;
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath(); ctx.rect(0, 0, s.pw, s.ph); ctx.clip();
      s.paint(ctx, s.pw, s.ph);
      ctx.restore();
      // Bleed the edge pixels into the padding so mipmaps don't pick up the neighbours.
      ctx.drawImage(c, x, y, s.pw, 1, x, y - PAD, s.pw, PAD);
      ctx.drawImage(c, x, y + s.ph - 1, s.pw, 1, x, y + s.ph, s.pw, PAD);
      ctx.drawImage(c, x, y - PAD, 1, s.ph + PAD * 2, x - PAD, y - PAD, PAD, s.ph + PAD * 2);
      ctx.drawImage(c, x + s.pw - 1, y - PAD, 1, s.ph + PAD * 2, x + s.pw, y - PAD, PAD, s.ph + PAD * 2);
      s.u0 = (x + 0.5) / PAGE; s.u1 = (x + s.pw - 0.5) / PAGE;
      s.v1 = 1 - (y + 0.5) / PAGE; s.v0 = 1 - (y + s.ph - 0.5) / PAGE;
    }
    // Geometry per page and chunk.
    const bins = new Map();
    for (const q of this.quads) {
      const p = q.slot.page;
      if (!p) continue;
      const key = `${pages.indexOf(p)}:${Math.floor(q.x / CHUNK)}:${Math.floor(q.z / CHUNK)}`;
      let b = bins.get(key);
      if (!b) bins.set(key, (b = { page: p, pos: [], nor: [], uv: [] }));
      const c = Math.cos(q.rotY), sn = Math.sin(q.rotY);
      const s = q.slot;
      // Optional sub-rectangle of the slot (0..1 in each direction).
      const [a0, b0, a1, b1] = q.uv || [0, 0, 1, 1];
      const u0 = s.u0 + (s.u1 - s.u0) * a0, u1 = s.u0 + (s.u1 - s.u0) * a1, v0 = s.v0 + (s.v1 - s.v0) * b0, v1 = s.v0 + (s.v1 - s.v0) * b1;
      const face = (dir) => {
        // Local corners (facing +z, or -z for the back), turned by rotY: x' = x c + z s, z' = -x s + z c.
        const hw = q.w / 2, hh = q.h / 2;
        const corners = dir > 0
          ? [[-hw, -hh, u0, v0], [hw, -hh, u1, v0], [hw, hh, u1, v1], [-hw, hh, u0, v1]]
          : [[hw, -hh, u0, v0], [-hw, -hh, u1, v0], [-hw, hh, u1, v1], [hw, hh, u0, v1]];
        const nx = sn * dir, nz = c * dir;
        const v = corners.map(([lx, ly, u, vv]) => [q.x + lx * c, q.y + ly, q.z - lx * sn, u, vv]);
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const [px, py, pz, u, vv] = v[k];
          b.pos.push(px, py, pz);
          b.nor.push(nx, 0, nz);
          b.uv.push(u, vv);
        }
      };
      face(1);
      if (q.back) face(-1);
    }
    const mats = [];
    const matOf = new Map();
    for (const p of pages) {
      const t = new THREE.CanvasTexture(p.c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = anisotropy;
      t.onUpdate = () => { p.c.width = p.c.height = 1; }; // static: drop the pixels once uploaded
      const m = makeMaterial(t);
      mats.push(m);
      matOf.set(p, m);
    }
    for (const b of bins.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, matOf.get(b.page));
      mesh.name = name;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    this.stats = { pages: pages.length, slots: slots.length, quads: this.quads.length, meshes: bins.size, dropped: slots.filter((s) => !s.page).length };
    return mats;
  }
}
