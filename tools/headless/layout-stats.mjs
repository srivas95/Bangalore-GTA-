const t0 = Date.now();
const { Layout } = await import(new URL('../../src/world/layout.js', import.meta.url).href);
const L = new Layout();
const z = {}; for (const b of L.blocks) z[b.zone] = (z[b.zone] || 0) + 1;
console.log('ms', Date.now() - t0, 'blocks', L.blocks.length, 'nodes', L.nodes.length, 'edges', L.edges?.length, 'roads', L.roads.length, JSON.stringify(z));
console.log('heapMB', Math.round(process.memoryUsage().heapUsed / 1e6));
