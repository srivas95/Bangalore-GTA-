// Screenshots from fixed camera positions (lat/lon targets), e.g. VIEWS=majestic,cubbon OUT=dir.
// Playwright: set PLAYWRIGHT to its index.mjs if it isn't installed locally (see docs/HANDOFF.md).
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const OUT = process.env.OUT, PREFIX = process.env.PREFIX || 'v';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => localStorage.setItem('namma-bengaluru-settings-v1', JSON.stringify({ quality: 'high', dynamicRes: false, detail: 'lite' })));
await page.goto('http://localhost:4173/?detail=' + (process.env.DETAIL || 'lite'), { waitUntil: 'commit' });
await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 400000 });
await page.click('#start');
await page.waitForTimeout(1200);
// [name, target lat, lon, camera offset east m, height, south m]
const ALL = {
  kbs_aerial: [12.9775, 77.5735, -60, 70, 90], kbs_street: [12.9772, 77.5728, 10, 3, 35],
  ksr: [12.9785, 77.569, 30, 12, 60], majestic_street: [12.9762, 77.5745, 0, 4, 30],
  cubbon_aerial: [12.977, 77.596, -80, 110, 160], cubbon_path: [12.9785, 77.5955, 15, 2.5, 25], cubbon_library: [12.9765, 77.5955, 30, 8, 45],
  yesh_aerial: [13.026, 77.545, -60, 160, 220], yesh_station: [13.0236, 77.5505, -50, 45, 80], taj: [13.0281, 77.5351, -40, 50, 90], platinum: [13.0354, 77.5316, 40, 60, 120], sheraton: [13.0134, 77.5549, -40, 50, 90],
  signs1: [12.9715, 77.6065, 6, 2.5, 14], signs2: [12.966, 77.5752, 5, 2.5, 12],
};
Object.assign(ALL, { ksr2: [12.9785, 77.569, 20, 35, 85], kbs_street2: [12.9785, 77.5735, 12, 5, 22], yesh_jn: [13.0287, 77.5493, -70, 40, 60], ibc: [13.04, 77.5284, 70, 70, 130] });
const pick = (process.env.VIEWS || Object.keys(ALL).join(',')).split(',');
for (const name of pick) {
  const v = ALL[name];
  if (!v) continue;
  await page.evaluate(([lat, lon, ox, oy, oz]) => {
    const MX = 108600 / 3, MZ = 110600 / 3, LAT0 = 12.9767, LON0 = 77.5713;
    const x = (lon - LON0) * MX, z = (LAT0 - lat) * MZ;
    const g = __game; window.__freeCam = true;
    g.env.hour = 10.5; g.player.x = x; g.player.z = z; g.step(30);
    g.camera.position.set(x + ox, oy, z + oz); g.camera.lookAt(x, oy > 20 ? 0 : 2, z); g.camera.updateMatrixWorld();
    g.world.focus.x = x; g.world.focus.z = z; g.step(20);
    g.camera.position.set(x + ox, oy, z + oz); g.camera.lookAt(x, oy > 20 ? 0 : 2, z);
  }, v);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${PREFIX}_${name}.png`, timeout: 240000 });
  console.log('shot', name);
}
await browser.close();
