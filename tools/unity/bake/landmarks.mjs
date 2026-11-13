// Bakes the landmarks for Unity (see landmarks.js): writes Resources/Models/landmarks.json.
// Run from the repo root: node tools/unity/bake/landmarks.mjs
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto('http://localhost:5199/tools/unity/bake/landmarks.html');
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const records = await page.evaluate(() => window.bake());
  const json = JSON.stringify(records);
  writeFileSync('unity/NammaBengaluru/Assets/Resources/Models/landmarks.json', json);
  console.log(`baked ${records.length} landmark calls (${(json.length / 1e6).toFixed(1)} MB): ${records.map((r) => r.key).join(' ')}`);
} finally {
  await browser.close();
  await server.close();
}
