// Load time, JS heap and GPU resources of the built city.
// Playwright: set PLAYWRIGHT to its index.mjs if it isn't installed locally (see docs/HANDOFF.md).
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => localStorage.setItem('namma-bengaluru-settings-v1', JSON.stringify({ quality: 'high', dynamicRes: false })));
const t0 = Date.now();
await page.goto('http://localhost:4173/' + (process.env.Q || ''), { waitUntil: 'commit' });
await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 900000 });
const tReady = Date.now() - t0;
await page.click('#start');
await page.waitForTimeout(1500);
const r = await page.evaluate(() => { const g = __game, i = g.renderer.info; g.step(30);
  let verts = 0, meshes = 0; g.scene.traverse((m) => { if (m.isMesh && m.geometry?.attributes?.position) { meshes++; verts += m.geometry.attributes.position.count * (m.count || 1); } });
  return { heapMB: Math.round(performance.memory.usedJSHeapSize / 1e6), geos: i.memory.geometries, tex: i.memory.textures, calls: i.render.calls, tris: i.render.triangles, meshes, Mverts: +(verts / 1e6).toFixed(2), blocks: g.layout.blocks.length, colliders: g.world.colliders?.count ?? null }; });
console.log(JSON.stringify({ readyS: Math.round(tReady / 1000), ...r }));
await browser.close();
