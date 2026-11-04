// Controlled police driving test: 8 Hoysalas spawned at fixed junctions 180-320 m away route to a
// player standing still. AFTER (current build) vs BEFORE (old step() injected), two targets.
// Playwright: set PLAYWRIGHT to its index.mjs if it isn't installed locally (see docs/HANDOFF.md).
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
import fs from 'fs';
const OLD = JSON.parse(fs.readFileSync(new URL('./oldstep.json', import.meta.url)));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
// Never hold the shared browser lock forever: bail out on a dead renderer or after 15 minutes.
page.on('crash', () => { console.log('renderer crashed'); process.exit(2); });
browser.on('disconnected', () => { console.log('browser disconnected'); process.exit(3); });
setTimeout(() => { console.log('timeout'); process.exit(4); }, 900000).unref?.();
await page.addInitScript(() => localStorage.setItem('namma-bengaluru-settings-v1', JSON.stringify({ quality: 'low', dynamicRes: false, detail: 'lite' })));
await page.goto('http://localhost:4173/?detail=lite', { waitUntil: 'commit' });
await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 900000 });
await page.click('#start');
await page.waitForTimeout(1500);
async function run(label, old, targetIdx) {
  return page.evaluate(({ label, old, OLD, targetIdx }) => {
    const g = __game, L = g.layout;
    const Vehicle = (g.free[0] || g.traffic.agents[0].v).constructor;
    window.__newStep = window.__newStep || Vehicle.prototype.step;
    Vehicle.prototype.step = old ? new Function('dt', 'input', 'world', OLD) : window.__newStep;
    g.police.reset();
    const s0 = window.__s0 || (window.__s0 = { x: g.player.pos.x, z: g.player.pos.z });
    const cands = L.nodes.filter((n) => n.out.length >= 2 && Math.hypot(n.x - s0.x, n.z - s0.z) < 500).sort((a, b) => a.id - b.id);
    const P = cands[Math.floor(cands.length * (targetIdx ? 0.7 : 0.3))];
    g.player.x = P.x + 4; g.player.z = P.z + 4; g.player.pos.x = g.player.x; g.player.pos.z = g.player.z;
    g.step(2);
    const ring = L.nodes.filter((n) => { const d = Math.hypot(n.x - P.x, n.z - P.z); return d > 180 && d < 320 && n.out.length; }).sort((a, b) => a.id - b.id);
    const picks = [];
    for (let k = 0; k < 8; k++) picks.push(ring[Math.floor((k + 0.5) * ring.length / 8)]);
    const units = picks.map((n) => {
      const e = n.out[0], off = L.laneOffset(e.road, 0);
      const x = n.x + e.dir.x * (e.cutFrom + 8) + e.dir.z * off, z = n.z + e.dir.z * (e.cutFrom + 8) - e.dir.x * off;
      const v = new Vehicle('hoysala', { x, z, heading: Math.atan2(e.dir.x, e.dir.z) });
      v.syncVisual(0, g.world);
      return g.police.addUnit(v);
    });
    g.police.level = 2;
    const onB = g.world.onBusted; g.world.onBusted = () => {};
    const beta = (c) => Math.abs(Math.atan2(c.vx * Math.cos(c.heading) - c.vz * Math.sin(c.heading), Math.abs(c.forwardSpeed) + 0.01)) * 57.3;
    const st = units.map(() => ({ t: null, rev: 0, spins: 0, spinF: 0, maxB: 0, vmax: 0, sp: false, wasRev: false, dmg: 0 }));
    for (let f = 0; f < 60 * 45; f++) {
      g.police.spawnCd = 99; g.player.health = 100;
      g.step(1);
      units.forEach((u, i) => {
        const s = st[i], c = u.v;
        if (s.t !== null) return;
        const d = Math.hypot(c.x - g.player.x, c.z - g.player.z);
        if (d < 22) { s.t = f / 60; s.dmg = 100 - c.health; return; }
        if (u.reverse > 0 && !s.wasRev) s.rev++;
        s.wasRev = u.reverse > 0;
        s.vmax = Math.max(s.vmax, c.speed);
        if (c.speed > 4 && !((c.touchT || 0) > 0)) { const b = beta(c); s.maxB = Math.max(s.maxB, b); const sp = b > 35; if (sp) s.spinF++; if (sp && !s.sp) s.spins++; s.sp = sp; } else s.sp = false;
      });
      if (st.every((s) => s.t !== null)) break;
    }
    g.world.onBusted = onB;
    g.police.reset();
    const arrived = st.filter((s) => s.t !== null);
    const sum = (k) => st.reduce((a, s) => a + s[k], 0);
    return { label, target: targetIdx, arrived: `${arrived.length}/8`, meanT: arrived.length ? +(arrived.reduce((a, s) => a + s.t, 0) / arrived.length).toFixed(1) : null,
      times: st.map((s) => (s.t === null ? '-' : s.t.toFixed(0))).join(' '), reverses: sum('rev'), spins: sum('spins'), spinFrames: sum('spinF'),
      maxB: Math.max(...st.map((s) => s.maxB)).toFixed(0), vmax: (Math.max(...st.map((s) => s.vmax)) * 3.6).toFixed(0) + 'km/h', dmg: st.map((s) => s.dmg.toFixed(0)).join(' ') };
  }, { label, old, OLD, targetIdx });
}
for (const t of (process.env.TGT ? [+process.env.TGT] : [0, 1])) for (const [label, old] of [['AFTER', false], ['BEFORE', true]]) console.log(JSON.stringify(await run(label, old, t)));
console.log('errors:', errs.slice(0, 5));
await browser.close();
