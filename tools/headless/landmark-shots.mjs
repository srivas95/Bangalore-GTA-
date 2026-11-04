// Screenshots of the new landmarks, AFS Yelahanka and NICE Road. OUT=dir PREFIX=p VIEWS=a,b
// Playwright: set PLAYWRIGHT to its index.mjs if it isn't installed locally (see docs/HANDOFF.md).
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const OUT = process.env.OUT || 'out', PREFIX = process.env.PREFIX || 's';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
await page.addInitScript(() => localStorage.setItem('namma-bengaluru-settings-v1', JSON.stringify({ quality: 'high', dynamicRes: false, detail: 'lite' })));
const t0 = Date.now();
await page.goto('http://localhost:4173/?detail=lite', { waitUntil: 'commit' });
await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 900000 });
console.log('READY after', ((Date.now() - t0) / 1000).toFixed(1), 's');
await page.click('#start');
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const g = __game;
  const lm = g.city.pois.landmarks.filter(Boolean).map((l) => ({ name: l.name, x: Math.round(l.x), z: Math.round(l.z) }));
  const afs = g.layout.blocks.find((b) => b.landmark === 'airForceStation');
  const nice = g.layout.undirected.filter((e) => e.r.name === 'NICE Road').map((e) => ({ ax: e.a.x, az: e.a.z, bx: e.b.x, bz: e.b.z, len: e.len }));
  return { lm, afs: afs && afs.inner, nice, mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null };
});
console.log('heap MB', info.mem);
const want = ['Bangalore Palace', 'Bull Temple', "Tipu Sultan's Summer Palace", 'Town Hall', 'Sree Kanteerava Stadium', 'Manyata Tech Park', 'Kempfort Shiva Statue', 'Indian Institute of Science', 'Ulsoor Gurudwara', 'BIEC', 'Air Force Station Yelahanka'];
for (const n of want) console.log('POI', n, JSON.stringify(info.lm.find((l) => l.name === n) || 'MISSING'));
const poi = (n) => info.lm.find((l) => l.name === n);
const I = info.afs, amx = (I.minX + I.maxX) / 2;
// [name, target x, z, camera offset x, y, z]
const V = {};
const L = (key, n, back, ox, oy, oz) => { const p = poi(n); if (p) V[key] = [p.x, p.z - back, ox, oy, oz]; };
L('palace', 'Bangalore Palace', 32, 50, 40, 80);
L('bull', 'Bull Temple', 24, 30, 22, 50);
L('bull_close', 'Bull Temple', 24, 14, 8, 26);
L('tipu', "Tipu Sultan's Summer Palace", 21, 30, 18, 42);
L('townhall', 'Town Hall', 30, 35, 22, 65);
L('kanteerava', 'Sree Kanteerava Stadium', 50, 70, 70, 120);
L('manyata', 'Manyata Tech Park', 80, 90, 80, 160);
L('kempfort', 'Kempfort Shiva Statue', 30, 20, 16, 55);
L('iisc', 'Indian Institute of Science', 50, 45, 30, 90);
L('gurudwara', 'Ulsoor Gurudwara', 22, 28, 20, 45);
L('biec', 'BIEC', 80, 120, 90, 190);
V.afs_over = [amx, (I.minZ + I.maxZ) / 2, -220, 200, 300];
V.afs_jets = [amx - 150, I.minZ + 230, 25, 18, 45];
V.afs_marks = [I.minX + 80, I.minZ + 110, 40, 30, 70];
V.afs_apron = [amx - 120, I.minZ + 260, 30, 45, 110];
V.afs_hangars = [amx + 100, I.minZ + 350, -40, 30, -110];
V.afs_gate = [I.minX + 10, I.minZ + 423, -45, 9, 30];
V.afs_runway = [I.minX + 120, I.minZ + 110, -60, 14, 60];
// NICE: a long edge near the middle (west section), the toll plaza, and the Mysore Road junction.
const nice = info.nice;
const mid = nice.reduce((a, e) => (Math.abs(e.az - 1000) < Math.abs(a.az - 1000) ? e : a));
V.nice_west = [(mid.ax + mid.bx) / 2, (mid.az + mid.bz) / 2, 60, 45, 70];
const tp = { x: (77.4685 - 77.5713) * 108600 / 3, z: (12.9767 - 12.94) * 110600 / 3 };
const te = nice.reduce((a, e) => (Math.hypot((e.ax + e.bx) / 2 - tp.x, (e.az + e.bz) / 2 - tp.z) < Math.hypot((a.ax + a.bx) / 2 - tp.x, (a.az + a.bz) / 2 - tp.z) ? e : a));
V.nice_toll = [(te.ax + te.bx) / 2, (te.az + te.bz) / 2, 30, 14, 40];
const mys = { x: (77.4873 - 77.5713) * 108600 / 3, z: (12.9767 - 12.9112) * 110600 / 3 };
V.nice_mysore = [mys.x, mys.z, -60, 150, 110];
const ec = { x: (77.663 - 77.5713) * 108600 / 3, z: (12.9767 - 12.851) * 110600 / 3 };
V.nice_ec = [ec.x, ec.z, -70, 150, 110];
const pick = (process.env.VIEWS || Object.keys(V).join(',')).split(',');
for (const name of pick) {
  const v = V[name];
  if (!v) { console.log('no view', name); continue; }
  await page.evaluate(([x, z, ox, oy, oz]) => {
    const g = __game; window.__freeCam = true;
    g.env.hour = 10.5; g.player.x = x; g.player.z = z; g.step(30);
    g.camera.position.set(x + ox, oy, z + oz); g.camera.lookAt(x, oy > 60 ? 0 : 3, z); g.camera.updateMatrixWorld();
    g.world.focus.x = x; g.world.focus.z = z; g.step(25);
    g.camera.position.set(x + ox, oy, z + oz); g.camera.lookAt(x, oy > 60 ? 0 : 3, z);
  }, v);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${PREFIX}_${name}.png`, timeout: 240000 });
  console.log('shot', name);
}
console.log('errors', errors.length);
await browser.close();
