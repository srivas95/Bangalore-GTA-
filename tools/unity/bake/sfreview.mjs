// usage: node tools/unity/bake/sfreview.mjs <picks.json> <outdir>   (review pictures of the Sketchfab vehicle bake)
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [picksPath, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const picks = JSON.parse(readFileSync(picksPath, 'utf8')).filter((m) => !m.skip && !m.drop && existsSync(`tools/unity/bake/sketchfab_cache/${m.uid}.glb`));
const server = await createServer({ server: { port: 5201, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto('http://localhost:5201/tools/unity/bake/sfreview.html');
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const res = await page.evaluate((p) => (p.people ? window.reviewPeople(p.list) : window.review(p.list)), { people: picksPath.includes('people'), list: picks });
  res.forEach((r, i) => {
    if (r.img) writeFileSync(`${outDir}/${String(i).padStart(2, '0')}_${r.type}.jpg`, Buffer.from(r.img.split(',')[1], 'base64'));
    if (r.side) writeFileSync(`${outDir}/${String(i).padStart(2, '0')}_${r.type}_side.jpg`, Buffer.from(r.side.split(',')[1], 'base64'));
    (r.ends || []).forEach((e, k) => writeFileSync(`${outDir}/${String(i).padStart(2, '0')}_${r.type}_${k ? 'back' : 'front'}.jpg`, Buffer.from(e.split(',')[1], 'base64')));
    console.log(i, r.type, r.name.slice(0, 30), r.error ? 'ERROR ' + r.error.split('\n')[0] : r.map ? `height ${r.height} tris ${r.tris} ${JSON.stringify(r.map)}` : `glow ${r.glow} wheels ${r.wheels} (front ${r.front}) tris ${r.tris} size ${r.size} atlas ${r.atlas}`);
  });
} finally { await browser.close(); await server.close(); }
