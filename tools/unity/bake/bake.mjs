// Bakes the game's canvas textures to PNGs for Unity: serves the repo with Vite, opens
// bake.html in headless Chromium and saves what it paints into Assets/Resources/Baked.
// Run from the repo root: node tools/unity/bake/bake.mjs
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';

// Playwright may be installed globally (as in the cloud containers), which ESM imports can't see.
const { chromium } = createRequire(import.meta.url)('playwright');

const outDir = 'unity/NammaBengaluru/Assets/Resources/Baked/';
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto('http://localhost:5199/tools/unity/bake/bake.html');
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const { out, meta } = await page.evaluate(() => window.bake());
  for (const [name, url] of Object.entries(out)) writeFileSync(outDir + name + '.png', Buffer.from(url.split(',')[1], 'base64'));
  writeFileSync(outDir + 'baked.json', JSON.stringify(meta, null, 1));
  console.log(`baked ${Object.keys(out).length} textures:`, Object.keys(out).join(' '));
} finally {
  await browser.close();
  await server.close();
}
