// Exports the story missions (src/systems/story.js) to Assets/Resources/Data/story.json for the
// Unity port: the MISSIONS table is evaluated with the step helpers swapped for recording ones,
// and each callback (act, collect, after) is run against a fake context so the port gets the
// exact lines and actions. Run from the repo root: node tools/unity/export_story.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const src = readFileSync('src/systems/story.js', 'utf8');
const head = src.slice(src.indexOf("const SAVE_KEY"), src.indexOf("const pick ="));
const table = src.slice(src.indexOf('const MISSIONS = ['), src.indexOf('\n];', src.indexOf('const MISSIONS = [')) + 3);

const mod = `
import { SCALE } from '${pathToFileURL('src/world/mapdata.js').href}';
${head}
const talk = (lines) => ({ type: 'talk', lines: lines.map(([who, text]) => ({ who, text })) });
const go = (place, text, o = {}) => ({ type: 'go', place, text, radius: o.radius ?? 3.5, timer: o.timer ?? null, vehicleVar: o.vehicleVar ?? null, slow: o.slow ?? true, failText: o.failText ?? null });
const record = (fn) => {
  const ops = []; let last = null;
  const c = {
    player: { give: (k, n = 0) => ops.push({ op: 'give', key: k, n }), pos: { x: 0, z: 0 } },
    world: { setHour: (h) => ops.push({ op: 'setHour', h }), park: (type) => { ops.push({ op: 'park', type, place: last }); return { parked: true }; }, footpathNear: (x, z) => ({ x, z }) },
    hud: { say: (t, d) => ops.push({ op: 'say', text: t, d }) },
    audio: { cash: () => ops.push({ op: 'cash' }) },
    place: (k) => { last = k; return { x: 0, z: 0 }; },
    vars: {},
  };
  return { c, ops, after() { for (const [k, v] of Object.entries(c.vars)) if (v && v.parked) { const p = ops.filter((o) => o.op === 'park').pop(); if (p) p.var = k; } return ops; } };
};
const act = (fn) => { const r = record(fn); fn(r.c); return { type: 'act', ops: r.after() }; };
const wanted = (stars, reason) => ({ type: 'wanted', stars, reason });
const wait = (secs) => ({ type: 'wait', secs });
const fight = (place, text, crew, members) => ({ type: 'fight', place, text, crew, members });
const escape = (text = 'Lose the police.') => ({ type: 'escape', text });
const collect = (places, text, onEach) => {
  const each = places.map((_, i) => { const r = record(); onEach?.(r.c, i + 1, places.length); return r.after(); });
  return { type: 'collect', places, text, each };
};
const stop = (place, vtype, text) => ({ type: 'stop', place, vtype, text });
const become = (look, who) => ({ type: 'become', who });
const getIn = (vehicleVar, text) => ({ type: 'getIn', vehicleVar, text });
${table}
export const out = {
  places: PLACES,
  missions: MISSIONS.map((m) => {
    let after = null;
    if (m.after) { const t = []; m.after({ hud: { toast: (a, b) => t.push(a, b) } }); after = { title: t[0], sub: t[1] }; }
    return { id: m.id, title: m.title, act: m.act, giver: m.giver, reward: m.reward, steps: m.steps(), after };
  }),
};
`;
mkdirSync('tools/unity/.tmp', { recursive: true });
writeFileSync('tools/unity/.tmp/story_export.mjs', mod);
const { out } = await import(pathToFileURL('tools/unity/.tmp/story_export.mjs').href);
writeFileSync('unity/NammaBengaluru/Assets/Resources/Data/story.json', JSON.stringify(out, null, 1));
console.log(`exported ${out.missions.length} missions, ${out.missions.reduce((n, m) => n + m.steps.length, 0)} steps`);
