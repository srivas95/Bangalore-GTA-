// Bakes the vehicle models for Unity (see models.js). Writes Assets/Resources/Models/vehicles.bytes
// (geometry) and vehicles_index.json (index: specs, bones, wheels, seats), plus the livery decal atlas.
// Run from the repo root: node tools/unity/bake/models.mjs
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const outDir = 'unity/NammaBengaluru/Assets/Resources/Models/';
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 5197, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto('http://localhost:5197/tools/unity/bake/models.html');
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const { models, humans, people, atlases, props, propAtlas, decalAtlas, decalGlow } = await page.evaluate(() => window.bake());
  for (const p of people) console.log(p.ok ? `person ${p.uid}: ${p.height.toFixed(2)} m` : `person ${p.uid}: FAILED ${p.error}`);
  // Binary layout per mesh: [vcount u32][icount u32] pos f32*3v, nor i8*3v, col u8*3v, uv f32*2v, pbr u8*3v, bone u8*v (w4: u8*4v, then weights u8*4v), idx u32*i (4-byte aligned).
  const chunks = []; let offset = 0;
  const put = (m) => {
    if (!m) return null;
    const v = m.pos.length / 3, i = m.idx.length;
    // (w4: four bone indices and four weights per vertex instead of one bone.)
    const parts = [new Uint32Array([v, i]), new Float32Array(m.pos), new Int8Array(m.nor), new Uint8Array(m.col), new Float32Array(m.uv), new Uint8Array(m.pbr), new Uint8Array(m.bone), ...(m.w4 ? [new Uint8Array(m.wt)] : []), new Uint32Array(m.idx)];
    const start = offset;
    for (const p of parts) {
      let b = Buffer.from(p.buffer, p.byteOffset, p.byteLength);
      const pad = (4 - (b.length % 4)) % 4;
      if (pad) b = Buffer.concat([b, Buffer.alloc(pad)]);
      chunks.push(b); offset += b.length;
    }
    return m.w4 ? { offset: start, verts: v, indices: i, w4: true } : { offset: start, verts: v, indices: i };
  };
  const index = models.map((m) => { const { body, decal, ...rest } = m; return { ...rest, body: put(body), decal: put(decal) }; });
  writeFileSync(outDir + 'vehicles.bytes', Buffer.concat(chunks));
  writeFileSync(outDir + 'vehicles_index.json', JSON.stringify(index));
  console.log(`baked ${models.length} vehicle models, ${(offset / 1048576).toFixed(1)} MB`);
  chunks.length = 0; offset = 0;
  const hindex = humans.map((h) => { const { body, ...rest } = h; return { ...rest, body: put(body) }; });
  writeFileSync(outDir + 'humans.bytes', Buffer.concat(chunks));
  writeFileSync(outDir + 'humans_index.json', JSON.stringify(hindex));
  console.log(`baked ${humans.length} people, ${(offset / 1048576).toFixed(1)} MB`);
  // The traffic-cars pack's texture atlases, and the street props (mesh per kind, one texture).
  atlases.forEach((a, i) => { if (a) writeFileSync(`unity/NammaBengaluru/Assets/Resources/Baked/pack_atlas${i}.png`, Buffer.from(a.split(',')[1], 'base64')); });
  console.log(`baked ${models.filter((m) => m.pack).length} pack vehicles, ${atlases.length} atlases`);
  const b64 = (arr) => Buffer.from(new Float32Array(arr).buffer).toString('base64');
  const pj = {};
  for (const [k, p] of Object.entries(props)) pj[k] = { pos: b64(p.pos), nor: b64(p.nor), uv: b64(p.uv), size: p.size };
  writeFileSync(outDir + 'props.json', JSON.stringify(pj));
  if (propAtlas) writeFileSync('unity/NammaBengaluru/Assets/Resources/Baked/props.png', Buffer.from(propAtlas.split(',')[1], 'base64'));
  console.log(`baked ${Object.keys(props).length} street props`);
  writeFileSync('unity/NammaBengaluru/Assets/Resources/Baked/decals.png', Buffer.from(decalAtlas.split(',')[1], 'base64'));
  if (decalGlow) writeFileSync('unity/NammaBengaluru/Assets/Resources/Baked/decals_glow.png', Buffer.from(decalGlow.split(',')[1], 'base64'));
} finally {
  await browser.close();
  await server.close();
}
