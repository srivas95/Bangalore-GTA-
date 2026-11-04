// Close-ups of every new vehicle model/type, then a traffic census.
// Playwright: set PLAYWRIGHT to its index.mjs if it isn't installed locally (see docs/HANDOFF.md).
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const OUT = process.env.OUT || 'out';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
page.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
await page.addInitScript(() => localStorage.setItem('namma-bengaluru-settings-v1', JSON.stringify({ quality: 'high', dynamicRes: false, detail: 'lite' })));
await page.goto('http://localhost:4173/?detail=lite', { waitUntil: 'commit' });
await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 900000 });
await page.click('#start', { timeout: 180000 });
await page.waitForTimeout(3000);
const LIST = [
  ['hatch', 'baleno'], ['hatch', 'i20'], ['hatch', 'tiago'], ['suv', 'punch'], ['suv', 'brezza'], ['suv', 'venue'], ['suv', 'seltos'],
  ['suv', 'carens'], ['suv', 'thar'], ['suv', 'fortuner'], ['suv', 'xuv700'], ['suv', 'hector'], ['van', 'eeco'], ['van', 'omni'],
  ['scooter', 'ola'], ['scooter', 'ather'], ['scooter', 'iqube'], ['ambulance'], ['ksrtc', 'sarige'], ['ksrtc', 'airavat'], ['ksrtc', 'rajahamsa'], ['garbage'],
].filter(([t, m]) => !only || only.includes(m || t));
const DIAG = new Set(['fortuner']);
const spot = await page.evaluate(() => {
  const g = __game;
  window.__freeCam = true;
  g.env.hour = 11; g.env.rain = 0; g.env.rainTarget = 0; g.env.weatherTimer = 1e9;
  document.getElementById('hud').style.display = 'none';
  const p = g.player.pos;
  let best = null, bs = -1e9;
  for (const e of g.layout.edges) {
    const mx = (e.from.x + e.to.x) / 2, mz = (e.from.z + e.to.z) / 2, d = Math.hypot(mx - p.x, mz - p.z);
    if (e.len < 90 || d > 700) continue;
    const sc = (e.und.w || 8) * 10 - d * 0.05;
    if (sc > bs) { bs = sc; best = { x: mx, z: mz, h: Math.atan2(e.dir.x, e.dir.z), w: e.und.w }; }
  }
  window.spot = best;
  return best;
});
console.log('spot', JSON.stringify(spot));
const hideTraffic = () => page.evaluate(() => {
  const g = __game;
  g.traffic.target = 0; for (const a of [...g.traffic.agents]) g.traffic.despawn(a);
  g.streetLife.peds.forEach((p) => { if (Math.hypot(p.x - spot.x, p.z - spot.z) < 40) p.h.group.visible = false; });
  for (const v of g.free) if (Math.hypot(v.x - spot.x, v.z - spot.z) < 30 && !v._test) v.group.visible = false;
});
await page.evaluate(() => { const g = __game; g.player.x = spot.x + 30; g.player.z = spot.z + 30; g.step(2); });
await hideTraffic();
for (const [type, model] of LIST) {
  const info = await page.evaluate(([type, model]) => {
    const g = __game;
    if (window.cur) { g.scene.remove(window.cur.group); }
    const V = g.free[0].constructor;
    const v = new V(type, { x: spot.x, z: spot.z, heading: spot.h, model, livery: model });
    v._test = true;
    g.scene.add(v.group); v.syncVisual(0.016, g.world);
    window.cur = v;
    return { label: v.spec.label, L: v.spec.length, W: v.spec.width, two: !!v.spec.twoWheeler, tris: v.model.mesh.geometry.attributes.position.count / 3 };
  }, [type, model]);
  const views = [['f', 0.75, 0], ['r', 2.45, 0], ...(DIAG.has(model) ? [['s', Math.PI / 2, 0], ['h', 0.6, 2.5]] : [])];
  for (const [k, ang, up] of views) {
    await page.evaluate(([ang, info, up]) => {
      const g = __game, v = window.cur;
      const d = Math.max(3.4, info.L * 1.05 + 2.2), y = (info.two ? 1.3 : 1.2 + info.L * 0.12) + up;
      g.camera.position.set(v.x + Math.sin(v.heading + ang) * d, y, v.z + Math.cos(v.heading + ang) * d);
      g.camera.fov = 45; g.camera.updateProjectionMatrix();
      g.camera.lookAt(v.x, info.two ? 0.65 : 0.85 + info.L * 0.04, v.z);
      g.step(1);
    }, [ang, info, up]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/v_${model || type}_${k}.png`, timeout: 300000 });
  }
  console.log(type, model, JSON.stringify(info));
}
// Traffic census: let the streets fill for a simulated minute and count types.
const census = await page.evaluate(() => {
  const g = __game;
  if (window.cur) g.scene.remove(window.cur.group);
  g.traffic.target = 170;
  for (let k = 0; k < 60; k++) g.step(60);
  const c = {};
  for (const a of g.traffic.agents) { const key = a.v.type + (a.v.model.modelKey ? ':' + a.v.model.modelKey : a.v.model.livery ? ':' + a.v.model.livery : ''); c[key] = (c[key] || 0) + 1; }
  const pool = {};
  for (const [t, l] of g.traffic.pool) pool[t] = l.length;
  return { n: g.traffic.agents.length, c, pool };
});
console.log('census', JSON.stringify(census, null, 1));
console.log(logs.join('\n') || 'no errors');
await browser.close();
