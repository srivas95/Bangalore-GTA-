// Handling bench, physics only (world = null). Usage: node bench.mjs <path to vehicle.js> [types...]
// Minimal DOM canvas stub so the vehicle models build in Node.
const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' || k === 'createImageData' ? () => ({ data: new Uint8ClampedArray(4096 * 4) }) : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => ctx, toDataURL: () => '' }) };
globalThis.performance ??= { now: () => Date.now() };
const path = process.argv[2] || new URL('../../src/entities/vehicle.js', import.meta.url).href;
const { Vehicle } = await import(path);
const types = process.argv.slice(3).length ? process.argv.slice(3) : ['hatch', 'sedan', 'suv', 'hoysala', 'bus', 'scooter', 'bike', 'auto', 'lorry'];
const DT = 1 / 60;
const seeded = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
const make = (type, driver = 'player') => { const v = new Vehicle(type, { rng: seeded(7) }); v.driver = driver; return v; };
const fwd = (v) => v.forwardSpeed;
const side = (v) => v.vx * Math.cos(v.heading) - v.vz * Math.sin(v.heading);
const beta = (v) => Math.atan2(side(v), Math.abs(fwd(v)) + 0.01) * 180 / Math.PI;
const go = (v, inp, n = 1) => { for (let i = 0; i < n; i++) v.update(DT, inp, null); };
const setSpeed = (v, s) => { v.vx = Math.sin(v.heading) * s; v.vz = Math.cos(v.heading) * s; };
const hold = (v, target) => Math.max(-1, Math.min(1, (target - fwd(v)) * 0.8));

function circle(type, target, driver) {
  const v = make(type, driver);
  if (target > v.spec.maxSpeed * 0.97) return null;
  setSpeed(v, target);
  let yaw = 0, sp = 0, n = 0, maxB = 0;
  for (let i = 0; i < 60 * 8; i++) {
    go(v, { throttle: hold(v, target), steer: i > 15 ? 1 : 0, handbrake: false });
    maxB = Math.max(maxB, Math.abs(beta(v)));
    if (i > 60 * 5) { yaw += Math.abs(v.angVel); sp += v.speed; n++; }
  }
  const R = (sp / n) / (yaw / n), s = sp / n;
  return { R, s, g: s * s / R / 9.81, maxB };
}

function accel(type) {
  const v = make(type);
  let t = 0, t50 = null, t100 = null;
  const vmax = v.spec.maxSpeed;
  let tTop = null;
  for (let i = 0; i < 60 * 40; i++) {
    go(v, { throttle: 1, steer: 0, handbrake: false }); t += DT;
    if (t50 === null && fwd(v) >= 13.89) t50 = t;
    if (t100 === null && fwd(v) >= 27.78) t100 = t;
    if (tTop === null && fwd(v) >= vmax * 0.95) tTop = t;
  }
  return { t50, t100, tTop, top: fwd(v), vmax };
}

function brake(type, s0) {
  const v = make(type);
  if (s0 > v.spec.maxSpeed * 1.05) return null;
  setSpeed(v, s0);
  const x0 = v.x, z0 = v.z;
  let t = 0;
  while (fwd(v) > 0.3 && t < 30) { go(v, { throttle: -1, steer: 0, handbrake: false }); t += DT; }
  return { d: Math.hypot(v.x - x0, v.z - z0), t };
}

function handbrakeTurn(type) {
  const v = make(type);
  const s0 = Math.min(15, v.spec.maxSpeed * 0.9);
  setSpeed(v, s0);
  const h0 = v.heading;
  let maxB = 0;
  // 0.8 s of full lock with handbrake, then release and countersteer to straighten for 1.7 s.
  for (let i = 0; i < 48; i++) { go(v, { throttle: 0, steer: 1, handbrake: true }); maxB = Math.max(maxB, Math.abs(beta(v))); }
  const hAt = (v.heading - h0) * 180 / Math.PI;
  for (let i = 0; i < 100; i++) { const b = beta(v); go(v, { throttle: 0.5, steer: Math.max(-1, Math.min(1, -b / 25)), handbrake: false }); maxB = Math.max(maxB, Math.abs(b)); }
  return { dh: (v.heading - h0) * 180 / Math.PI, hAt, speed: v.speed, endB: Math.abs(beta(v)), maxB };
}

// Slalom: full-lock bang-bang steering, flipping every 0.9 s, holding speed. Also a single lane change.
function slalom(type, driver) {
  const v = make(type, driver);
  const s0 = Math.min(20, v.spec.maxSpeed * 0.95);
  setSpeed(v, s0);
  let maxB = 0, maxR = 0;
  for (let i = 0; i < 60 * 7; i++) {
    const st = Math.sin((i / 60) * Math.PI / 0.9) >= 0 ? 1 : -1;
    go(v, { throttle: hold(v, s0), steer: st, handbrake: false });
    maxB = Math.max(maxB, Math.abs(beta(v)));
  }
  // Recovery: straight ahead, does it settle?
  for (let i = 0; i < 90; i++) go(v, { throttle: hold(v, s0), steer: 0, handbrake: false });
  return { maxB, endB: Math.abs(beta(v)), endYaw: Math.abs(v.angVel), spd: v.speed };
}

function laneChange(type) {
  const v = make(type);
  const s0 = Math.min(20, v.spec.maxSpeed * 0.95);
  setSpeed(v, s0);
  let maxB = 0;
  const seq = [[0.35, 1], [0.7, -1], [0.35, 1], [1.5, 0]];
  for (const [d, st] of seq) for (let i = 0; i < d * 60; i++) { go(v, { throttle: hold(v, s0), steer: st, handbrake: false }); maxB = Math.max(maxB, Math.abs(beta(v))); }
  const lat = (v.x) ; // started heading 0 => forward is +z, lateral is x
  return { maxB, lat: Math.abs(lat), endHead: v.heading * 180 / Math.PI, endB: Math.abs(beta(v)) };
}

function parked(type) {
  const v = make(type);
  setSpeed(v, 3); v.angVel = 0.3;
  go(v, null, 120);
  return { s: v.speed, r: Math.abs(v.angVel) };
}

const f = (x, d = 1) => (x == null ? '  -  ' : x.toFixed(d));
console.log('== Steady full lock (R m, lat g, max sideslip deg) ==');
for (const t of types) {
  const cols = [5, 10, 14, 18, 22].map((s) => { const c = circle(t, s); return c ? `${s}:R${f(c.R)} ${f(c.g, 2)}g b${f(c.maxB, 0)}` : `${s}: -`; });
  console.log(t.padEnd(8), cols.join(' | '));
}
console.log('== Police driver, full lock ==');
for (const t of ['hoysala']) console.log(t.padEnd(8), [10, 14, 18, 22].map((s) => { const c = circle(t, s, 'police'); return c ? `${s}:R${f(c.R)} ${f(c.g, 2)}g b${f(c.maxB, 0)}` : '-'; }).join(' | '));
console.log('== Accel: 0-50, 0-100, to 95% vmax, speed after 40 s ==');
for (const t of types) { const a = accel(t); console.log(t.padEnd(8), `0-50 ${f(a.t50)}s  0-100 ${f(a.t100)}s  95%vmax(${f(a.vmax * 3.6, 0)}) ${f(a.tTop)}s  top ${f(a.top * 3.6, 0)} km/h`); }
console.log('== Braking distance from 60 / 100 km/h ==');
for (const t of types) { const b6 = brake(t, 16.67), b10 = brake(t, 27.78); console.log(t.padEnd(8), `60: ${b6 ? f(b6.d) + 'm ' + f(b6.t, 2) + 's' : '-'}   100: ${b10 ? f(b10.d) + 'm ' + f(b10.t, 2) + 's' : '-'}`); }
console.log('== Handbrake turn at 15 m/s (heading change after 0.8 s hb / total, end speed, max sideslip, end sideslip) ==');
for (const t of types) { const h = handbrakeTurn(t); console.log(t.padEnd(8), `dh@0.8s ${f(h.hAt, 0)}°  dh ${f(h.dh, 0)}°  v ${f(h.speed)}  maxB ${f(h.maxB, 0)}°  endB ${f(h.endB, 0)}°`); }
console.log('== Slalom at 20 m/s, full lock flips every 0.9 s (max sideslip, after 1.5 s straight: sideslip, yaw rate) ==');
for (const t of types) { const s = slalom(t); console.log(t.padEnd(8), `maxB ${f(s.maxB, 0)}°  endB ${f(s.endB, 0)}°  endYaw ${f(s.endYaw, 2)}  v ${f(s.spd)}`); }
for (const t of ['hoysala']) { const s = slalom(t, 'police'); console.log('police  ', `maxB ${f(s.maxB, 0)}°  endB ${f(s.endB, 0)}°  endYaw ${f(s.endYaw, 2)}  v ${f(s.spd)}`); }
console.log('== Lane change at 20 m/s (max sideslip, lateral offset, end heading) ==');
for (const t of types) { const s = laneChange(t); console.log(t.padEnd(8), `maxB ${f(s.maxB, 0)}°  lat ${f(s.lat)}m  head ${f(s.endHead, 0)}°  endB ${f(s.endB, 0)}°`); }
console.log('== Parked (input null) from 3 m/s, after 2 s ==');
console.log(types.map((t) => { const p = parked(t); return `${t}:${f(p.s, 2)}/${f(p.r, 2)}`; }).join('  '));

// Step steer at 20 m/s (full lock): time to 63% / 90% of the yaw rate it settles at, yaw after 0.3 s.
function stepSteer(type) {
  const v = make(type); const s0 = Math.min(20, v.spec.maxSpeed * 0.95); setSpeed(v, s0);
  const yr = [];
  for (let i = 0; i < 180; i++) { go(v, { throttle: hold(v, s0), steer: 1, handbrake: false }); yr.push(Math.abs(v.angVel)); }
  const fin = yr[yr.length - 1];
  const t63 = yr.findIndex((y) => y >= fin * 0.63) / 60, t90 = yr.findIndex((y) => y >= fin * 0.9) / 60;
  return { t63, t90, fin, peak: Math.max(...yr), y03: yr[17] };
}
// Throttle-on in a corner: 12 m/s steady half lock, then full throttle + full lock for 2 s, then release steer.
function powerOn(type) {
  const v = make(type); setSpeed(v, 12);
  for (let i = 0; i < 90; i++) go(v, { throttle: hold(v, 12), steer: 1, handbrake: false });
  const r0 = v.speed / Math.abs(v.angVel);
  let maxB = 0;
  for (let i = 0; i < 120; i++) { go(v, { throttle: 1, steer: 1, handbrake: false }); maxB = Math.max(maxB, Math.abs(beta(v))); }
  const r1 = v.speed / Math.abs(v.angVel);
  for (let i = 0; i < 90; i++) go(v, { throttle: 0.3, steer: 0, handbrake: false });
  return { r0, r1, maxB, endB: Math.abs(beta(v)), slideR: v.slideR ?? 0, spd: v.speed };
}
// Short handbrake taps at 15 m/s with full lock: heading change 1.5 s after a 0.3 s / 0.5 s pull.
function hbTap(type, dur) {
  const v = make(type); setSpeed(v, Math.min(15, v.spec.maxSpeed * 0.9));
  for (let i = 0; i < dur * 60; i++) go(v, { throttle: 0, steer: 1, handbrake: true });
  for (let i = 0; i < 90; i++) go(v, { throttle: 0, steer: 0, handbrake: false });
  return { dh: v.heading * 180 / Math.PI, v: v.speed, b: Math.abs(beta(v)) };
}
console.log('== Step steer at 20 m/s full lock (t63, t90 of final yaw rate; final yaw, yaw @0.3s) ==');
for (const t of types) { const s = stepSteer(t); console.log(t.padEnd(8), `t63 ${f(s.t63, 2)}s  t90 ${f(s.t90, 2)}s  final ${f(s.fin, 2)}  peak ${f(s.peak, 2)}  @0.3s ${f(s.y03, 2)}`); }
console.log('== Power on in a 12 m/s full-lock corner (radius before/after 2 s full throttle, max sideslip, after release) ==');
for (const t of types.filter((t) => !['scooter', 'bike'].includes(t))) { const p = powerOn(t); console.log(t.padEnd(8), `R ${f(p.r0)} -> ${f(p.r1)}  maxB ${f(p.maxB, 0)}°  1.5 s after: B ${f(p.endB, 0)}° v ${f(p.spd)}`); }
console.log('== Handbrake taps at 15 m/s full lock: heading 1.5 s later (0.3 s / 0.5 s pull) ==');
for (const t of types.filter((t) => !['scooter', 'bike'].includes(t))) { const a = hbTap(t, 0.3), b = hbTap(t, 0.5); console.log(t.padEnd(8), `0.3s: ${f(a.dh, 0)}° v${f(a.v)} B${f(a.b, 0)}   0.5s: ${f(b.dh, 0)}° v${f(b.v)} B${f(b.b, 0)}`); }
