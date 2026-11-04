// Rush-hour traffic for a game minute: AI overlaps in view, crashes, jams (progress printed as it goes).
// Playwright: set PLAYWRIGHT to its index.mjs if it isn't installed locally (see docs/HANDOFF.md).
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const T0 = Date.now(), el = () => ((Date.now() - T0) / 1000).toFixed(0) + 's';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('crash', () => { console.log('[crash] renderer died', el()); process.exit(2); });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
let loaded = false;
page.on('pageerror', (e) => { console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 3).join(' | ')); if (!loaded) process.exit(3); });
await page.addInitScript(() => localStorage.setItem('namma-bengaluru-settings-v1', JSON.stringify({ quality: 'low', dynamicRes: false, detail: 'lite' })));
await page.goto('http://localhost:4173/?detail=lite', { waitUntil: 'commit' });
await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 900000 });
await page.click('#start');
await page.waitForTimeout(1000);
loaded = true;
console.log('loaded', el());
const SPOTS = (process.env.SPOTS || '0').split(',').map(Number);
const SAMPLES = +(process.env.SAMPLES || 120);
for (const spot of SPOTS) {
  await page.evaluate((spot) => {
    const g = __game, t = g.traffic;
    g.env.hour = 18; // rush hour
    if (spot) { const e = g.layout.edges.filter((e) => e.road.lanes >= 2)[spot]; g.player.x = e.from.x; g.player.z = e.from.z; }
    g.step(600); t.debugCrashes = [];
    window.__o = { deepKinds: {}, deepPairs: new Set(), deepEx: [], overlapsSeen: 0, deep: 0, samples: 0, stuckMax: 0, speedSum: 0, n: 0, temps0: g.free.filter((v) => v.temp).length };
  }, spot);
  console.log('warm', el());
  for (let c = 0; c < SAMPLES; c += 20) {
    await page.evaluate((m) => {
      const g = __game, t = g.traffic, out = window.__o, ca = [], cb = [];
      for (let k = 0; k < m; k++) {
        g.step(30);
        out.samples++;
        const ags = t.agents, fx = g.player.pos.x, fz = g.player.pos.z;
        for (let i = 0; i < ags.length; i++) {
          const A = ags[i].v; out.speedSum += ags[i].speed; out.n++;
          if (Math.hypot(A.x - fx, A.z - fz) > 140) continue;
          for (let j = i + 1; j < ags.length; j++) {
            const B = ags[j].v;
            if (Math.abs(A.x - B.x) > 12 || Math.abs(A.z - B.z) > 12 || Math.abs(A.y - B.y) > 2) continue;
            A.circles(ca); B.circles(cb);
            let pen = 0;
            for (const p of ca) for (const q of cb) pen = Math.max(pen, p.r + q.r - Math.hypot(p.x - q.x, p.z - q.z));
            if (pen > 0.15) out.overlapsSeen++;
            if (pen > 0.6) {
              out.deep++; const a = ags[i], b = ags[j];
              const dot = Math.sin(A.heading) * Math.sin(B.heading) + Math.cos(A.heading) * Math.cos(B.heading);
              const key = [a.turning || b.turning ? 'turn' : 'edge', dot > 0.7 ? 'same' : dot < -0.7 ? 'opp' : 'cross', a.ghost > 0 || b.ghost > 0 ? 'ghost' : '', a.erratic && b.erratic ? 'ee' : a.erratic || b.erratic ? 'e1' : 'nn', a.wrongNow || b.wrongNow ? 'wrong' : '', a.stunned > 0 || b.stunned > 0 ? 'stun' : '', a.edge === b.edge ? 'sameEdge' : ''].filter(Boolean).join('+');
              out.deepKinds[key] = (out.deepKinds[key] || 0) + 1; out.deepPairs.add(a.id + ':' + b.id);
              if (out.deepEx.length < 12) out.deepEx.push({ key, pen: +pen.toFixed(2), ta: a.v.type, tb: b.v.type, sa: +a.speed.toFixed(1), sb: +b.speed.toFixed(1), la: +a.lat.toFixed(2), lb: +b.lat.toFixed(2), st: [a.stuck, b.stuck].map((x) => +x.toFixed(1)), blk: [a.lastBlocker === b, b.lastBlocker === a], d: +Math.hypot(A.x - fx, A.z - fz).toFixed(0) });
            }
          }
        }
        out.stuckMax = Math.max(out.stuckMax, ...ags.map((a) => a.stuck));
      }
    }, Math.min(20, SAMPLES - c));
    const mem = await page.evaluate(() => [Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6), __game.free.length, __game.traffic.agents.length, __game.free.filter((v) => v.temp).length]);
    console.log('  samples', c + 20, el(), 'heapMB/free/agents/temps', mem.join('/'));
  }
  const r = await page.evaluate(() => {
    const g = __game, t = g.traffic, out = window.__o;
    out.crashes = g.free.filter((v) => v.temp).length - out.temps0; delete out.temps0;
    out.avgSpeed = +(out.speedSum / out.n).toFixed(2); delete out.speedSum; delete out.n;
    out.agents = t.agents.length; out.deepPairs = out.deepPairs.size; out.log = (t.debugCrashes || []).slice(0, 30);
    const reasons = {}, ex = [];
    for (const a of t.agents.filter((a) => a.stuck > 10)) {
      const b = a.lastBlocker;
      const k = [a.turning ? 'turning' : 'edge', a.waitingSignal ? 'waitSig' : '', a.junctionWait > 0 ? 'jHold' : '', a.stunned > 0 ? 'stunned' : '', a.hold ? 'hold' : '',
        !b ? 'noBlocker' : b.v ? (b.v.driver !== 'ai' ? 'freeVeh' : b.stunned > 0 ? 'stunnedAI' : b.lastBlocker === a ? 'mutual' : b.stuck > 10 ? 'queue' : 'aiMoving') : b.isPlayer ? 'player' : 'obstacle'].filter(Boolean).join('+');
      reasons[k] = (reasons[k] || 0) + 1;
      if (ex.length < 8 && !(b && b.v && b.stuck > 10)) ex.push({ k, type: a.v.type, stuck: +a.stuck.toFixed(0), jw: +a.junctionWait.toFixed(1), left: +(a.path.length - a.s).toFixed(1), d: +Math.hypot(a.v.x - g.player.pos.x, a.v.z - g.player.pos.z).toFixed(0), sig: a.edge.to.signal ? g.signals.state(a.edge.to, a.edge.und.id) : '-', occ: (a.edge.to.occ || []).length, app: a.edge.to.app?.size || 0, btype: b?.v?.type, bk: b && b.v ? [b.turning ? 'T' : 'E', b.waitingSignal ? 'W' : '', b.junctionWait > 0 ? 'J' : '', b.stuck.toFixed(0)].join('') : '' });
    }
    out.jamReasons = reasons; out.jamEx = ex;
    out.jammed = t.agents.filter((a) => a.stuck > 10).length;
    return out;
  });
  const { log, deepEx, jamEx, ...rest } = r;
  console.log('spot', spot, JSON.stringify(rest), el());
  for (const c of deepEx) console.log('deep', JSON.stringify(c));
  for (const c of jamEx) console.log('jam', JSON.stringify(c));
  for (const c of log) console.log('crash', JSON.stringify(c));
}
await browser.close();
