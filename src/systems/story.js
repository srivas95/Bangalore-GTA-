// Story missions. A mission is a script of steps (go somewhere, talk, fight a crew, lose the
// police, collect, steal and deliver a vehicle...). Mission givers wait at marked places on the
// map; walk into the marker to start. Progress and money are saved to localStorage.
// The story is fiction: see docs/STORY.md.
import { Marker } from './missions.js';
import { geo } from '../world/mapdata.js';

const SAVE_KEY = 'namma-bengaluru-save-v1';
const ACT1 = 'Act I · Majestic';

// Real places (lat, lon), snapped to the nearest footpath when the game loads.
const PLACES = {
  babu: [12.9795, 77.5772], // Babu's mobile shop, Gandhinagar
  den: [12.9672, 77.5768], // Kotte Kumar's lodge room, Chickpete
  shop1: [12.9688, 77.5745], shop2: [12.9662, 77.5752], shop3: [12.9655, 77.578], shop4: [12.9645, 77.5758],
  krMarket: [12.9618, 77.5772],
  apmc: [13.0305, 77.5345], godown: [13.0335, 77.5185],
  chikka: [12.9765, 77.5786], // Chikka's garage (Chikka Motors)
  site: [12.9758, 77.5585], // half-built site off Magadi Road
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- steps ----------
// Each step: enter(ctx), update(dt, ctx) -> 'done' | {fail: reason} | undefined, plus objective/markers.
const talk = (lines) => ({
  enter(c) { this.i = -1; this.t = 0; this.next(c); },
  next(c) {
    this.i++;
    if (this.i >= lines.length) return;
    const [who, text] = lines[this.i];
    this.t = Math.min(7, Math.max(2.6, text.length * 0.055 + 1.4));
    c.hud.say(who ? `${who}: ${text}` : text, this.t + 0.3);
  },
  update(dt, c) {
    this.t -= dt;
    if (this.t <= 0 || c.input.hit('Enter', 'KeyE')) this.next(c);
    if (this.i >= lines.length) return 'done';
  },
  objective: null,
});

const go = (place, text, { radius = 3.5, timer, vehicleVar, slow = true, failText } = {}) => ({
  enter(c) { this.p = c.place(place); this.timer = timer; c.marker(this.p); },
  update(dt, c) {
    if (this.timer != null) { this.timer -= dt; if (this.timer <= 0) return { fail: failText || 'Too slow.' }; }
    const pl = c.player, pos = pl.pos;
    if (vehicleVar) {
      const v = c.vars[vehicleVar];
      if (!v || v.wrecked || v.engineDead) return { fail: 'The vehicle is wrecked.' };
      if (pl.vehicle !== v) { this.objective = `Get back in the ${v.spec.label}.`; return; }
    }
    this.objective = text;
    const fast = pl.vehicle && pl.vehicle.speed > 4;
    if (Math.hypot(pos.x - this.p.x, pos.z - this.p.z) < radius + (pl.vehicle ? 3 : 0) && (!slow || !fast)) return 'done';
  },
  get timeLeft() { return this.timer; },
  objective: text,
});

const act = (fn) => ({ enter(c) { fn(c); }, update() { return 'done'; } });

// The police definitely notice this one.
const wanted = (stars, reason) => act((c) => {
  const P = c.world.police;
  P.crime(reason, c.player.pos.x, c.player.pos.z, stars, c.world);
  if (P.level < stars) { P.level = stars; P.lastKnown = { x: c.player.pos.x, z: c.player.pos.z }; P.seenT = 0; P.hud.setStars(stars, false); c.hud.say(`★ Wanted: ${reason}`, 2.5); }
});

const wait = (secs) => ({ enter() { this.t = secs; }, update(dt) { this.t -= dt; if (this.t <= 0) return 'done'; } });

// Spawn a crew around a place; done when they're all down.
const fight = (place, text, crew, members) => ({
  enter(c) {
    const p = c.place(place);
    this.crew = c.crewName(crew);
    members.forEach((m, k) => {
      const a = (k / members.length) * Math.PI * 2 + Math.random() * 0.5;
      const r = m.r ?? 6 + Math.random() * 4;
      const q = c.world.footpathNear(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
      const g = c.world.gangs.spawn(q.x, q.z, { crew: this.crew, hostile: m.hostile ?? true, weapon: m.weapon, health: m.health, name: m.name, accuracy: m.accuracy });
      g.boss = !!m.boss;
    });
  },
  update(dt, c) {
    if (!c.world.gangs.alive(this.crew).length) return 'done';
  },
  objective: text,
});

const escape = (text = 'Lose the police.') => ({
  enter() {},
  update(dt, c) { if (c.world.police.level === 0) return 'done'; },
  objective: text,
});

// Stand by each place for a moment (on foot).
const collect = (places, text, onEach) => ({
  enter(c) { this.left = places.map((k) => ({ k, p: c.place(k), t: 0 })); this.n = 0; },
  update(dt, c) {
    const pl = c.player;
    for (const s of this.left) {
      if (pl.vehicle || Math.hypot(pl.x - s.p.x, pl.z - s.p.z) > 3.5) { s.t = 0; continue; }
      s.t += dt;
      if (s.t > 1.2) {
        this.left.splice(this.left.indexOf(s), 1);
        this.n++;
        onEach?.(c, this.n, places.length);
        break;
      }
    }
    this.objective = `${text} (${this.n}/${places.length})`;
    if (!this.left.length) return 'done';
  },
  get points() { return this.left.map((s) => s.p); },
  objective: text,
});

const getIn = (vehicleVar, text) => ({
  enter() {},
  update(dt, c) {
    const v = c.vars[vehicleVar];
    if (!v || v.wrecked || v.engineDead) return { fail: 'The vehicle is wrecked.' };
    if (c.player.vehicle === v) return 'done';
  },
  objective: text,
  get points() { return []; },
});

// ---------- Act I ----------
const MISSIONS = [
  {
    id: 'delivery', title: 'Fast Delivery', act: ACT1, giver: 'babu', reward: 500,
    steps: () => [
      talk([
        ['Babu', 'Raghu! You do deliveries, no? One parcel, Chickpete. Cash on the spot, no app commission.'],
        ['Raghu', 'What\'s in it?'],
        ['Babu', 'Mobile covers. Very fragile mobile covers. Two and a half minutes, or the customer gets angry.'],
      ]),
      go('den', 'Get the parcel to the lodge in Chickpete.', { timer: 100, failText: 'The parcel was late. Kotte Kumar doesn\'t like late.' }),
      talk([
        ['Kotte Kumar', 'So you\'re the delivery boy. Babu says you\'re fast.'],
        ['Kotte Kumar', 'Fast is good. Quiet is better. You know who I am?'],
        ['Raghu', 'Everyone in Chickpete knows who you are, sir.'],
        ['Kotte Kumar', 'Good answer. Come back tomorrow. I have proper work.'],
      ]),
    ],
  },
  {
    id: 'collection', title: 'Collection Day', act: ACT1, giver: 'den', reward: 900,
    steps: () => [
      talk([
        ['Kotte Kumar', 'Every Friday the shops on Avenue Road pay for... let\'s call it security.'],
        ['Kotte Kumar', 'Four shops. Smile, take the envelope, don\'t count it in front of them.'],
      ]),
      collect(['shop1', 'shop2', 'shop3', 'shop4'], 'Collect from the shops', (c, n) => {
        c.audio.cash?.();
        const lines = ['"Here. Tell Kumar-avaru namaskara."', '"Every week more. Every week!"', '"Take it and go before my wife sees."', '"This shop has been here since 1962. And now this?"'];
        c.hud.say(`Shopkeeper: ${lines[n - 1]}`, 3);
      }),
      talk([
        ['Shopkeeper\'s nephew', 'Oye! You\'re the new boy? My uncle doesn\'t pay anyone any more.'],
        ['Raghu', 'Take it up with Kumar.'],
        ['Shopkeeper\'s nephew', 'I\'ll take it up with you.'],
      ]),
      fight('shop4', 'Deal with the nephew and his friends.', 'nephew', [
        { weapon: 'fists', name: 'Nephew', health: 120 }, { weapon: 'bat', name: 'Friend' }, { weapon: 'fists', name: 'Friend' },
      ]),
      escape('Lose the police, if anyone called them.'),
      go('den', 'Take the money back to Kumar.'),
      talk([
        ['Kotte Kumar', 'All four. And the nephew won\'t be a problem, I hear.'],
        ['Kotte Kumar', 'Keep a little for yourself. Not too much. I count.'],
      ]),
    ],
  },
  {
    id: 'market', title: 'Market Turf', act: ACT1, giver: 'den', reward: 1500,
    steps: () => [
      talk([
        ['Kotte Kumar', 'Seenu\'s boys are unloading at K.R. Market like they own it. They don\'t.'],
        ['Kotte Kumar', 'Take this. Don\'t bring it back clean.'],
      ]),
      act((c) => { c.player.give('machete'); c.hud.say('You got a machete ("Long"). Tab to switch weapons.', 3); }),
      go('krMarket', 'Go to K.R. Market.', { radius: 25 }),
      fight('krMarket', 'Take out Seenu\'s boys.', 'seenu', [
        { weapon: 'machete', name: 'Seenu\'s boy' }, { weapon: 'chain', name: 'Seenu\'s boy' }, { weapon: 'sickle', name: 'Seenu\'s boy' },
        { weapon: 'knife', name: 'Seenu\'s boy' }, { weapon: 'bat', name: 'Seenu\'s boy' },
      ]),
      wanted(2, 'Market brawl'),
      escape('Lose the police.'),
      talk([
        ['Kotte Kumar', '(on the phone) Seenu called me. He was crying. Very nice.'],
        ['Kotte Kumar', 'Lie low tonight. Tomorrow I need a driver.'],
      ]),
    ],
  },
  {
    id: 'lorry', title: 'The Lorry', act: ACT1, giver: 'den', reward: 2500,
    steps: () => [
      talk([
        ['Kotte Kumar', 'There\'s a lorry at the Yeshwanthpur APMC yard. Its papers are... optional.'],
        ['Kotte Kumar', 'Take it to the godown in Peenya. If the Hoysalas see you, don\'t lead them to my door.'],
      ]),
      go('apmc', 'Go to the Yeshwanthpur APMC yard.', { radius: 20 }),
      act((c) => {
        const p = c.place('apmc');
        const v = c.world.park('lorry', p.x, p.z, Math.random() * 6.28);
        c.vars.lorry = v;
      }),
      talk([['Yard watchman', 'Keys are inside. I was having tea. I saw nothing.']]),
      getIn('lorry', 'Get in the lorry.'),
      wanted(2, 'Stolen lorry'),
      escape('A patrol saw you. Lose the police, and keep the lorry in one piece.'),
      go('godown', 'Deliver the lorry to the godown in Peenya.', { radius: 6, vehicleVar: 'lorry' }),
      talk([
        ['Godown man', 'Kumar\'s lorry? Leave it. Go out the back.'],
        ['Kotte Kumar', '(on the phone) Everyone is talking about you, Raghu. Everyone.'],
        ['Raghu', 'Is that good, sir?'],
        ['Kotte Kumar', '...Come to the site on Magadi Road tomorrow night. We\'ll talk about your future.'],
      ]),
    ],
  },
  {
    id: 'majestic', title: 'Majestic Is Mine', act: ACT1, giver: 'chikka', reward: 6000,
    steps: () => [
      talk([
        ['Chikka', 'A "meeting" at a half-built site at night? Raghu, that\'s not a meeting.'],
        ['Chikka', 'Take this. It was my uncle\'s. Six rounds. Don\'t ask what he used it for.'],
      ]),
      act((c) => { c.player.give('revolver', 18); c.world.setHour?.(21.5); c.hud.say('You got a revolver. Right mouse to aim.', 3); }),
      go('site', 'Go to the site off Magadi Road.', { radius: 8 }),
      talk([
        ['Kotte Kumar', 'Raghu. Shopkeepers ask for you now. Not me. You.'],
        ['Kotte Kumar', 'Majestic has room for only one name.'],
        ['Raghu', 'Then it should be the one they\'re already saying.'],
      ]),
      fight('site', 'Survive the ambush. Finish Kotte Kumar.', 'kumar', [
        { weapon: 'revolver', name: 'Kotte Kumar', health: 260, boss: true, accuracy: 0.35, r: 12 },
        { weapon: 'katta', name: 'Kumar\'s man', accuracy: 0.3 }, { weapon: 'machete', name: 'Kumar\'s man' },
        { weapon: 'machete', name: 'Kumar\'s man' }, { weapon: 'chain', name: 'Kumar\'s man' }, { weapon: 'katta', name: 'Kumar\'s man', accuracy: 0.25 },
      ]),
      wanted(3, 'Shootout on Magadi Road'),
      escape('Lose the police.'),
      talk([
        ['Chikka', '(on the phone) It\'s all over Majestic already. The shops want to know who to pay now.'],
        ['Raghu', 'Tell them nothing changes. Except the name.'],
      ]),
    ],
    after: (story) => story.hud.toast('ACT I COMPLETE', 'Majestic is yours. Collections come in every day.'),
  },
];

export class Story {
  constructor(scene, hud, audio, missions, world) {
    this.scene = scene;
    this.hud = hud;
    this.audio = audio;
    this.gigs = missions;
    this.world = world;
    this.marker = new Marker(scene, 0xff4fa0);
    this.giver = new Marker(scene, 0xff4fa0);
    this.places = {};
    this.active = null;
    this.done = [];
    this.collectT = 90;
    this.armed = true; // a giver triggers only after you've walked away from the last one
    this.saveT = 30;
    this.load();
  }

  place(key) {
    if (!this.places[key]) {
      const [x, z] = geo(...PLACES[key]);
      this.places[key] = this.world.footpathNear(x, z);
    }
    return this.places[key];
  }

  // ---------- save / load ----------
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!s) return;
      this.done = s.done || [];
      if (typeof s.money === 'number') { this.gigs.money = s.money; this.hud.setMoney(s.money, true); }
      if (this.done.length) setTimeout(() => this.hud.say(`Save loaded: ${this.done.length} story mission${this.done.length > 1 ? 's' : ''} done.`, 3), 4000);
    } catch { /* private window or blocked storage: play without saving */ }
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ done: this.done, money: this.gigs.money, t: Date.now() })); } catch { /* ignore */ }
  }

  reset() {
    this.done = [];
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }

  get next() { return MISSIONS.find((m) => !this.done.includes(m.id)); }

  get markers() {
    const out = [];
    if (this.active) {
      const st = this.active.step;
      if (st?.points) for (const p of st.points) out.push({ x: p.x, z: p.z, color: '#ff4fa0' });
      else if (this.marker.group.visible) out.push({ x: this.marker.x, z: this.marker.z, color: '#ff4fa0' });
      if (st?.crew) for (const g of this.world.gangs.alive(st.crew)) out.push({ x: g.x, z: g.z, color: g.boss ? '#ff2020' : '#e05050', small: true });
      const v = this.active.vars.lorry;
      if (v && this.world.player.vehicle !== v && !v.wrecked) out.push({ x: v.x, z: v.z, color: '#4fc0ff' });
    } else if (this.giver.group.visible) out.push({ x: this.giver.x, z: this.giver.z, color: '#ff4fa0' });
    return out;
  }

  // ---------- running ----------
  start(def) {
    this.giver.hide();
    const steps = def.steps();
    const ctx = {
      world: this.world, hud: this.hud, audio: this.audio, player: this.world.player, input: null, vars: {},
      place: (k) => this.place(k),
      marker: (p) => this.marker.place(p.x, p.z, 0.15),
      crewName: (n) => `${def.id}:${n}`,
    };
    this.active = { def, steps, idx: -1, ctx, vars: ctx.vars };
    this.gigs.paused = true;
    this.gigs.offer && (this.gigs.offer = null, this.hud.phone(null));
    if (this.gigs.job) this.gigs.cleanupJob();
    this.hud.toast(def.title, def.act);
    this.audio.sting?.(false);
    this.advance();
  }

  advance() {
    const a = this.active;
    this.marker.hide();
    a.idx++;
    if (a.idx >= a.steps.length) return this.complete();
    a.step = a.steps[a.idx];
    a.step.enter(a.ctx);
  }

  complete() {
    const { def } = this.active;
    this.cleanup();
    this.done.push(def.id);
    this.gigs.addMoney(def.reward);
    this.audio.cash?.();
    this.hud.mission(null);
    this.hud.showScreen('MISSION PASSED', `${def.title} · +₹${def.reward.toLocaleString('en-IN')}`, '#f0c040');
    setTimeout(() => this.hud.hideScreen(), 3500);
    def.after?.(this);
    this.armed = false;
    this.save();
  }

  fail(reason) {
    if (!this.active) return;
    const { def } = this.active;
    this.cleanup();
    this.hud.mission(null);
    this.armed = false;
    this.hud.showScreen('MISSION FAILED', reason || def.title, '#e05050');
    setTimeout(() => this.hud.hideScreen(), 3000);
  }

  cleanup() {
    const a = this.active;
    for (const m of this.world.gangs.members.slice()) if (m.crew && m.crew.startsWith(a.def.id + ':')) this.world.gangs.remove(m);
    this.marker.hide();
    this.active = null;
    this.gigs.paused = false;
  }

  update(dt, input) {
    const t = performance.now() / 1000;
    this.marker.update(t);
    this.giver.update(t);
    const pl = this.world.player;
    // Daily collections once Majestic is yours.
    if (this.done.includes('majestic')) {
      this.collectT -= dt;
      if (this.collectT <= 0) { this.collectT = 120; const n = 150 + Math.round(Math.random() * 100); this.gigs.addMoney(n); this.hud.phone(`<b>📱 Chikka</b><br>Collections from Majestic: ₹${n}`); setTimeout(() => this.hud.phone(null), 4000); }
    }
    if ((this.saveT -= dt) <= 0) { this.saveT = 30; this.save(); }
    if (!this.active) {
      const m = this.next;
      if (!m || this.world.metroRide?.active) return;
      const p = this.place(m.giver);
      this.giver.place(p.x, p.z, 0.15);
      const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
      if (d > 8) this.armed = true;
      const near = this.armed && d < 2.6 && (!pl.vehicle || pl.vehicle.speed < 3);
      if (near && !pl.dead && this.world.police.level === 0) this.start(m);
      else if (near && this.world.police.level > 0) this.hud.prompt('Lose the police first');
      return;
    }
    const a = this.active;
    a.ctx.input = input;
    const r = a.step.update(dt, a.ctx);
    if (r === 'done') this.advance();
    else if (r && r.fail) this.fail(r.fail);
    if (this.active) {
      const st = this.active.step;
      const obj = st.objective;
      this.hud.mission(obj ? this.active.def.title : null, obj || '', st.timeLeft ?? null);
    }
  }
}

export { MISSIONS };
export const pickLine = pick;
