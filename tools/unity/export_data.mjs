// Exports the web game's data tables (src/world/mapdata.js, src/config.js) to JSON for the Unity
// port, and a fingerprint of the generated road network so the C# Layout can be checked against
// the JS one. Run from the repo root: node tools/unity/export_data.mjs
import { writeFileSync } from 'node:fs';
import * as MD from '../../src/world/mapdata.js';
import * as CFG from '../../src/config.js';
import { Layout } from '../../src/world/layout.js';

const out = 'unity/NammaBengaluru/Assets/Resources/Data/';
const plain = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'function' ? undefined : v)));

const md = {};
for (const [k, v] of Object.entries(MD)) if (typeof v !== 'function') md[k] = v;
writeFileSync(out + 'mapdata.json', JSON.stringify(plain(md)));
const cfg = {};
for (const [k, v] of Object.entries(CFG)) if (typeof v !== 'function') cfg[k] = v;
writeFileSync(out + 'config.json', JSON.stringify(plain(cfg)));

// Fingerprint: counts and coordinate sums the C# port must reproduce.
const t0 = Date.now();
const L = new Layout();
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const fp = {
  roads: L.roads.length,
  netNodes: L.net.nodes.length, netEdges: L.net.edges.length, faces: L.net.faces.length,
  nodes: L.nodes.length, edges: L.edges.length, undirected: L.undirected.length,
  blocks: L.blocks.length, islands: L.islands.length,
  signals: L.nodes.filter((n) => n.signal).length, named: L.nodes.filter((n) => n.name).length,
  nodeSumX: sum(L.nodes, (n) => n.x), nodeSumZ: sum(L.nodes, (n) => n.z),
  blockSumArea: sum(L.blocks, (b) => b.area), blockSumCx: sum(L.blocks, (b) => b.cx),
  innerSum: sum(L.blocks, (b) => b.inner.maxX - b.inner.minX + b.inner.maxZ - b.inner.minZ),
  zones: Object.fromEntries([...new Set(L.blocks.map((b) => b.zone))].sort().map((z) => [z, L.blocks.filter((b) => b.zone === z).length])),
  specials: L.blocks.filter((b) => b.special).map((b) => b.landmark + '@' + b.id),
  hotels: L.blocks.filter((b) => b.hotel).map((b) => b.hotel.label + '@' + b.id),
  underpasses: L.underpasses.map((u) => u.name + '@' + u.at.toFixed(2)),
  levelCrossings: L.levelCrossings.length,
  flyovers: L.flyovers.map((f) => f.name + '@' + f.half.toFixed(2)),
  rasterFilled: L.raster.reduce((s, v) => s + (v >= 0 ? 1 : 0), 0),
  probes: [[0, 0], [500, -300], [-1200, 800], [2600, 1500], [-3000, -4000]].map(([x, z]) => {
    const b = L.blockAt(x, z), e = L.edgeAt(x, z), n = L.nearestNode(x, z);
    return { x, z, block: b ? b.id : -1, edge: e ? e.e.id : -1, node: n.id, ground: L.groundHeight(x, z) };
  }),
  ms: Date.now() - t0,
};
writeFileSync(out + 'layout_fingerprint.json', JSON.stringify(fp, null, 1));
console.log(JSON.stringify({ ...fp, specials: fp.specials.length, hotels: fp.hotels.length, probes: fp.probes }, null, 0));
