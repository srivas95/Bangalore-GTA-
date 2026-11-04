// Playwright: set PLAYWRIGHT to its index.mjs if it isn't installed locally (see docs/HANDOFF.md).
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.addInitScript(() => localStorage.setItem('namma-bengaluru-settings-v1', JSON.stringify({ quality: 'high', dynamicRes: false })));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 2000 });
await cdp.send('Profiler.start');
await page.goto('http://localhost:4173/', { waitUntil: 'commit' });
await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 900000 });
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map(), total = new Map();
const dt = profile.timeDeltas; let all = 0;
const counts = new Map(); profile.samples.forEach((id, i) => { counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)); all += dt[i] || 0; });
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const name = (n) => `${n.callFrame.functionName || '(anon)'}:${n.callFrame.lineNumber + 1}`;
for (const [id, t] of counts) {
  const n = byId.get(id); self.set(name(n), (self.get(name(n)) || 0) + t);
  const seen = new Set(); let cur = id;
  while (cur !== undefined) { const nm = name(byId.get(cur)); if (!seen.has(nm)) { seen.add(nm); total.set(nm, (total.get(nm) || 0) + t); } cur = parent.get(cur); }
}
const fmt = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${(v / 1e6).toFixed(1)}s ${k}`).join('\n');
console.log('total', (all / 1e6).toFixed(1), 's\n--- self\n' + fmt(self) + '\n--- inclusive\n' + fmt(total));
await browser.close();
