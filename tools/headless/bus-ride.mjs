// Headless check of auto hailing, auto riding, the BMTC network and bus rides, and auto duty.
// Playwright: set PLAYWRIGHT to its index.mjs if it isn't installed locally (see docs/HANDOFF.md).
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = [];
page.on('pageerror', (e) => { errs.push(e.message); console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')); });
page.on('crash', () => { console.log('[crash]'); process.exit(2); });
await page.addInitScript(() => localStorage.setItem('namma-bengaluru-settings-v1', JSON.stringify({ quality: 'high', dynamicRes: false })));
await page.goto('http://localhost:4173/?detail=lite', { waitUntil: 'commit' });
await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 400000 });
await page.click('#start');
await page.waitForTimeout(1500);
const ev = (f, arg) => page.evaluate(f, arg);
const shot = async (n) => { if (OUT) await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 240000 }); };
const key = (code) => ev((c) => __game.input.pressed.add(c), code);
// Step the sim in chunks until cond() (a string of JS) is true or n frames pass.
const until = (cond, n = 1800) => ev(([cond, n]) => { const g = __game; const f = new Function('g', 'return ' + cond); for (let i = 0; i < n; i += 30) { g.step(30); if (f(g)) return i + 30; } return -1; }, [cond, n]);
console.log('net', JSON.stringify(await ev(() => { const r = __game.world.rides; return { routes: r.routes.map((q) => `${q.num} ${q.from}->${q.to} ${q.edges.length}e ${Math.round(q.length)}m ${q.stops.length} stops`), shelters: r.shelters.length, names: r.shelters.slice(0, 8).map((s) => s.name) }; })));
await ev(() => { const g = __game; g.env.hour = 11; g.step(60); });
// ---- Bus: walk to the nearest shelter and take a bus ----
const sh = await ev(() => { const g = __game, r = g.world.rides, p = g.player; let best = null, bd = 1e9; for (const s of r.shelters) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd && s.serves.some((st) => st.route.stops.indexOf(st) < st.route.stops.length - 3)) { bd = d; best = s; } } p.x = best.x + best.lx * 0.5; p.z = best.z + best.lz * 0.5; g.camRig?.first; g.step(2); return { name: best.name, d: Math.round(bd), serves: best.serves.map((st) => st.route.num + '>' + st.route.to) }; });
console.log('shelter', JSON.stringify(sh));
await key('KeyE'); await ev(() => __game.step(1));
console.log('stopMenu', JSON.stringify(await ev(() => { const r = __game.world.rides; return { state: r.state, items: r.items?.slice(0, 6).map((i) => i.header ? `[${i.text}]` : `${i.text} ${i.fare}`) }; })));
await shot('bus_menu');
await ev(() => { const r = __game.world.rides; const i = r.items.findIndex((q, k) => !q.header && k > 3); r.sel = i > 0 ? i : r.sel; r.tapPick = true; });
await ev(() => __game.step(2));
await page.keyboard.down('a'); await ev(() => __game.step(15)); await page.keyboard.up('a'); console.log('walked while waiting', await ev(() => __game.world.rides.state));
console.log('wait', JSON.stringify(await ev(() => { const r = __game.world.rides; return { state: r.state, trip: r.trip && `${r.trip.route.num} ${r.trip.from.shelter.name} -> ${r.trip.to.shelter.name}`, busD: r.agent && Math.round(Math.hypot(r.agent.v.x - __game.player.x, r.agent.v.z - __game.player.z)) }; })));
console.log('bus arrives frames', await until("g.world.rides.state === 'busRide' || g.world.rides.state === 'busBoard'", 5400));
await until("g.world.rides.state === 'busRide'", 300);
await until('false', 300);
await shot('bus_riding');
console.log('bus banner', await ev(() => document.getElementById('ride-banner').innerText.replace(/\n/g, ' | ')));
console.log('bus arrive frames', await until('!g.world.rides.state', 2400));
if (await ev(() => __game.world.rides.state)) { await key('KeyT'); await ev(() => __game.step(2)); console.log('bus skipped; frames', await until('!g.world.rides.state', 1200)); }
console.log('bus end', JSON.stringify(await ev(() => ({ state: __game.world.rides.state, sub: __game.hud.el.sub.textContent }))));
console.log('errors', errs.length); await browser.close();
