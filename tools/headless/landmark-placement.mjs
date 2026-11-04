import { Layout } from '../../src/world/layout.js';
import * as MD from '../../src/world/mapdata.js';
import { pointInPoly } from '../../src/world/roadnet.js';
const t0 = Date.now();
const L = new Layout();
console.log('layout ms', Date.now() - t0, 'blocks', L.blocks.length, 'islands', L.islands.length, 'nodes', L.nodes.length, 'raster', L.rw * L.rh);
const ll = (x, z) => [+(12.9767 - z * MD.SCALE / 110600).toFixed(4), +(x * MD.SCALE / 108600 + 77.5713).toFixed(4)];
const off = (b, at) => Math.round(Math.hypot(b.cx - at[0], b.cz - at[1]) * MD.SCALE);
const NEW = ['airForceStation', 'bullTemple', 'tipuPalace', 'townHall', 'kanteerava', 'manyata', 'kempfortShiva', 'iisc', 'gurudwara', 'biec'];
const rows = [];
for (const s of MD.SPECIAL_BLOCKS) {
  const b = L.blocks.find((q) => q.special && q.landmark === s.landmark && q.district === s.district);
  const i = b?.inner;
  rows.push([(NEW.includes(s.landmark) ? '* ' : '  ') + s.landmark, b ? `${ll(b.cx, b.cz)} off ${off(b, s.at)} real m, inner ${Math.round(i.maxX - i.minX)}x${Math.round(i.maxZ - i.minZ)} block#${b.id}` : 'UNPLACED']);
}
for (const p of MD.PARKS) for (const lm of p.landmarks || []) {
  const bl = L.blocks.filter((b) => b.park === p).sort((a, b) => b.area - a.area);
  rows.push(['  park:' + lm, bl.length ? `in ${p.name}, ${bl.length} blocks` : 'NO PARK BLOCKS']);
}
for (const [a, b] of rows) console.log(a.padEnd(24), b);
// Distinct blocks?
const ids = L.blocks.filter((b) => b.special).map((b) => b.id);
console.log('special blocks', ids.length, 'unique', new Set(ids).size);
// NICE Road
const nice = L.undirected.filter((e) => e.r.name === 'NICE Road');
const len = nice.reduce((s, e) => s + e.len, 0);
console.log('NICE edges', nice.length, 'length game m', Math.round(len), 'real km', (len * 3 / 1000).toFixed(1));
const nodes = new Set(); for (const e of nice) { nodes.add(e.a); nodes.add(e.b); }
const crosses = [...nodes].filter((n) => n.adj.some((h) => !h.e.r.grid && h.e.r.name !== 'NICE Road')).map((n) => `${n.name || '?'} [${n.adj.map((h) => h.e.r.name).join(', ')}] sig=${n.signal}`);
console.log('NICE arterial junctions:\n ', crosses.join('\n  '));
const deg1 = [...nodes].filter((n) => n.adj.length === 1);
console.log('NICE dead ends', deg1.map((n) => ll(n.x, n.z)));
// Arterials through fenced sites?
for (const site of [MD.AIRPORT, MD.AIRBASE]) {
  const bad = L.undirected.filter((e) => { for (let k = 0; k <= 10; k++) { const x = e.a.x + (e.b.x - e.a.x) * k / 10, z = e.a.z + (e.b.z - e.a.z) * k / 10; if (pointInPoly(x, z, site.poly)) return true; } return false; });
  console.log(site.name, 'roads inside:', bad.map((e) => e.r.name));
}
console.log('underpasses', L.underpasses.length, 'flyovers', L.flyovers.map((f) => f.name), 'levelX', L.levelCrossings.length);
