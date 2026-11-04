// Hail autos the way a player does (real key presses) from footpaths all over the city, and see
// where it goes wrong: no prompt, no auto sent, auto never arrives, menu not visible, ride never starts.
// Playwright: set PLAYWRIGHT to its index.mjs if it isn't installed locally (see docs/HANDOFF.md).
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('crash', () => { console.log('[crash]'); process.exit(2); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 3).join(' | ')));
await page.addInitScript(() => localStorage.setItem('namma-bengaluru-settings-v1', JSON.stringify({ quality: 'low', dynamicRes: false, detail: 'lite' })));
await page.goto('http://localhost:4173/?detail=lite', { waitUntil: 'commit' });
await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 400000 });
await page.click('#start');
await page.waitForTimeout(1500);
const ev = (f, a) => page.evaluate(f, a);
const press = async (key) => { await page.keyboard.down(key); await ev(() => __game.step(1)); await page.keyboard.up(key); };
// Footpath spots next to roads: the spawn, then random kerbs.
const spots = await ev(() => {
  const g = __game, out = [{ x: g.player.x, z: g.player.z, name: 'spawn' }];
  const E = g.layout.edges.filter((e) => e.road && !e.road.boundary && e.len > 60);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; out.length < 6 && k < 400; k++) {
    const e = E[Math.floor(rnd() * E.length)], t = 0.3 + rnd() * 0.4;
    const cx = e.from.x + (e.to.x - e.from.x) * t, cz = e.from.z + (e.to.z - e.from.z) * t;
    const w = e.road.width / 2 + 1.2, nx = e.dir.z, nz = -e.dir.x;
    const x = cx + nx * w, z = cz + nz * w;
    if (g.layout.blockContaining(x, z) && !g.world.colliders.pointBlocked(x, z, 1)) out.push({ x, z, name: `edge ${e.id}` });
  }
  return out;
});
const results = [];
for (const sp of spots) {
  const r = { at: sp.name };
  await ev((sp) => { const g = __game; g.world.rides.abort?.(g.world); g.player.x = sp.x; g.player.z = sp.z; g.env.hour = 11; g.step(20); }, sp);
  r.prompt = await ev(() => __game.hud.el.prompt?.textContent || '');
  r.roadside = await ev(() => !!__game.world.rides.roadside(__game.player));
  await press('h');
  r.after = await ev(() => ({ state: __game.world.rides.state, say: __game.hud.el.sub?.textContent || '' }));
  if (r.after.state === 'hail') {
    // Walk a few steps while waiting (this used to cancel it).
    await page.keyboard.down('w'); await ev(() => __game.step(20)); await page.keyboard.up('w');
    r.afterWalk = await ev(() => __game.world.rides.state);
    r.arrive = await ev(() => { const g = __game; for (let i = 0; i < 3600; i += 10) { g.step(10); if (g.world.rides.state !== 'hail' || g.world.rides.agent?.hold) return { t: (i / 60).toFixed(0) + 's', state: g.world.rides.state, say: g.hud.el.sub?.textContent || '' }; } const a = g.world.rides.agent; return { t: 'never', d: a && Math.round(Math.hypot(a.v.x - g.player.x, a.v.z - g.player.z)), speed: a && a.speed.toFixed(1), stuck: a && a.stuck.toFixed(0) }; });
    if (r.arrive.state === 'hail') {
      // It's waiting for us: walk over to it.
      r.walkOver = await ev(() => { const g = __game, p = g.player, v = g.world.rides.agent.v; for (let i = 0; i < 600 && g.world.rides.state === 'hail'; i++) { g.rig.yaw = Math.atan2(p.x - v.x, p.z - v.z); g.input.keys.add('KeyW'); g.step(1); } g.input.keys.delete('KeyW'); return { state: g.world.rides.state, d: Math.round(Math.hypot(v.x - p.x, v.z - p.z)) }; });
      r.arrive.state = r.walkOver.state;
    }
    if (r.arrive.state === 'menu') {
      r.menuVisible = await ev(() => { const m = document.getElementById('ride-menu'); const cs = getComputedStyle(m); const b = m.getBoundingClientRect(); return cs.display !== 'none' && b.width > 50 && b.height > 50; });
      if (OUT && !results.some((q) => q.menuVisible)) await page.screenshot({ path: `${OUT}/hail_menu.png`, timeout: 240000 });
      await press('s'); await press('e');
      r.chose = await ev(() => { const g = __game; for (let i = 0; i < 300; i += 10) { g.step(10); if (g.world.rides.state === 'ride' || !g.world.rides.state) break; } return { state: g.world.rides.state, say: g.hud.el.sub?.textContent || '' }; });
      if (r.chose.state === 'ride') r.moving = await ev(() => { const g = __game, a = g.world.rides.agent, x0 = a.v.x, z0 = a.v.z; g.step(300); return { metres: Math.round(Math.hypot(a.v.x - x0, a.v.z - z0)), speed: a.speed.toFixed(1), state: g.world.rides.state }; });
    }
  }
  results.push(r);
  console.log(JSON.stringify(r));
}
await browser.close();
