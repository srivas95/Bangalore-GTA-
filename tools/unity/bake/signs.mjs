// Bakes the text signs to PNGs for Unity. The specs come from the Unity port itself (Game.cs
// exports tools/unity/bake/text_signs.json, see unity/PORTING.md), so the boards say exactly what
// the C# city builds. Run from the repo root: node tools/unity/bake/signs.mjs
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';

const { chromium } = createRequire(import.meta.url)('playwright');
const specs = JSON.parse(readFileSync('tools/unity/bake/text_signs.json', 'utf8'));
const outDir = 'unity/NammaBengaluru/Assets/Resources/Baked/Text/';
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto('http://localhost:5199/tools/unity/bake/signs.html');
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const out = await page.evaluate((s) => window.bake(s), specs);
  const index = {};
  const keep = new Set();
  for (const [key, url] of Object.entries(out)) {
    const file = 't_' + createHash('sha1').update(key).digest('hex').slice(0, 12);
    writeFileSync(outDir + file + '.png', Buffer.from(url.split(',')[1], 'base64'));
    index[key] = file;
    keep.add(file + '.png');
  }
  for (const f of readdirSync(outDir)) if (f.endsWith('.png') && !keep.has(f)) { unlinkSync(outDir + f); try { unlinkSync(outDir + f + '.meta'); } catch { /* none */ } }
  writeFileSync(outDir + 'text_index.json', JSON.stringify(index, null, 1));
  console.log(`baked ${Object.keys(out).length} text signs`);
} finally {
  await browser.close();
  await server.close();
}
