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
  // Act II
  lakshmi: [12.9452, 77.5713], // Lakshmi Akka's darshini, Gandhi Bazaar
  darshini1: [12.9305, 77.5835], darshini2: [12.9493, 77.5747], darshini3: [13.0033, 77.5695],
  cinema: [12.9759, 77.5779], // Gajalakshmi Talkies, K.G. Road
  hanu: [12.9915, 77.5545], // Hanu Anna's office, Rajajinagar
  kengeri: [12.9125, 77.4862], kengeriA: [12.9131, 77.4851], kengeriB: [12.9118, 77.4874],
  godowns: [12.9566, 77.5372], // Mysore Road
  maniStart: [12.9745, 77.5772],
  nayandahalli: [12.9468, 77.5245],
  yelahanka: [13.1005, 77.5965],
  // Odd jobs
  victoria: [12.9605, 77.5735], bowring: [12.9835, 77.6045], stjohns: [12.9305, 77.6215],
  hudson: [12.9665, 77.5875], richmond: [12.9655, 77.5985], trinity: [12.9725, 77.6185],
  tout: [12.9756, 77.6066], fan1: [12.9719, 77.6412], fan2: [12.9352, 77.6245], stadium: [12.9772, 77.5996],
  adman: [12.9719, 77.6072],
  imran: [12.9857, 77.6057], showroom: [12.9784, 77.6408],
  autoStand: [12.9625, 77.5778], cp1: [12.9636, 77.5843], cp2: [12.9555, 77.5855], cp3: [12.9507, 77.5848], cp4: [12.9455, 77.5752], cp5: [12.9426, 77.5683],
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- steps ----------
// Each step: enter(ctx), update(dt, ctx) -> 'done' | {fail: reason} | undefined, plus objective/markers.
const talk = (script) => ({
  enter(c) { this.lines = typeof script === 'function' ? script(c) : script; this.i = -1; this.t = 0; this.next(c); },
  next(c) {
    const lines = this.lines;
    this.i++;
    if (this.i >= lines.length) return;
    const [who, text] = lines[this.i];
    this.t = Math.min(7, Math.max(2.6, text.length * 0.055 + 1.4));
    c.hud.say(who ? `${who}: ${text}` : text, this.t + 0.3);
  },
  update(dt, c) {
    this.t -= dt;
    if (this.t <= 0 || c.input.hit('Enter', 'KeyE')) this.next(c);
    if (this.i >= this.lines.length) return 'done';
  },
  objective: null,
});

const go = (place, text, { radius = 3.5, timer, vehicleVar, slow = true, failText, inVehicle = false } = {}) => ({
  enter(c) { this.p = c.place(place); this.timer = timer; c.marker(this.p); },
  update(dt, c) {
    if (this.timer != null) { this.timer -= dt; if (this.timer <= 0) return { fail: failText || 'Too slow.' }; }
    const pl = c.player, pos = pl.pos;
    if (vehicleVar) {
      const v = c.vars[vehicleVar];
      if (!v || v.wrecked || v.engineDead) return { fail: 'The vehicle is wrecked.' };
      if (pl.vehicle !== v) { this.objective = `Get back in the ${v.spec.label}.`; return; }
    }
    if (inVehicle && !pl.vehicle) { this.objective = 'Get a ride first (anything with wheels).'; return; }
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
  enter(c) {
    const pts = typeof places === 'function' ? places(c) : places.map((k) => c.place(k));
    this.total = pts.length;
    this.left = pts.map((p) => ({ p, t: 0 })); this.n = 0;
  },
  update(dt, c) {
    const pl = c.player;
    for (const s of this.left) {
      if (pl.vehicle || Math.hypot(pl.x - s.p.x, pl.z - s.p.z) > 3.5) { s.t = 0; continue; }
      s.t += dt;
      if (s.t > 1.2) {
        this.left.splice(this.left.indexOf(s), 1);
        this.n++;
        onEach?.(c, this.n, this.total);
        break;
      }
    }
    this.objective = `${text} (${this.n}/${this.total})`;
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

// Walk (or drive) into one of several markers to choose; that option's steps run next.
const choose = (text, options) => ({
  enter(c) {
    this.opts = options.map((o) => ({ ...o, p: c.place(o.place) }));
    this.marks = this.opts.map((o) => { const m = new Marker(c.scene, o.color ?? 0xffd040); m.place(o.p.x, o.p.z, 0.15); return m; });
    c.hud.say(options.map((o) => `▸ ${o.label}`).join('     '), 7);
  },
  update(dt, c) {
    const pos = c.player.pos, t = performance.now() / 1000;
    for (const m of this.marks) m.update(t);
    this.objective = `${text}  ${this.opts.map((o) => `▸ ${o.label}`).join('  ')}`;
    for (const o of this.opts) {
      if (Math.hypot(pos.x - o.p.x, pos.z - o.p.z) > 3.5 + (c.player.vehicle ? 2 : 0)) continue;
      this.cleanup(c);
      c.vars.choice = o.id;
      c.story.flags[o.id] = (c.story.flags[o.id] || 0) + 1;
      c.insert(o.steps());
      return 'done';
    }
  },
  cleanup(c) { for (const m of this.marks || []) { m.hide(); c.scene.remove(m.group); } this.marks = []; },
  get points() { return (this.opts || []).map((o) => o.p); },
  objective: text,
});

// Put the vehicles listed in c.vars[name] out of action: ram them, shoot them, set them alight.
const wreck = (name, text) => ({
  enter() {},
  update(dt, c) {
    const list = c.vars[name] || [];
    this.left = list.filter((v) => !v.engineDead && !v.wrecked);
    this.objective = `${text} (${list.length - this.left.length}/${list.length})`;
    if (!this.left.length) return 'done';
  },
  get points() { return (this.left || []).map((v) => ({ x: v.x, z: v.z })); },
  objective: text,
});

// A mission vehicle in the traffic near a place (or the one already spawned under that name).
function target(c, place, type, name, opts) {
  if (c.vars[name + 'Agent']) return c.vars[name + 'Agent'];
  const p = c.place(place);
  const a = c.world.traffic.spawnNear(type, p.x, p.z, { keep: c.missionId, opts });
  c.vars[name + 'Agent'] = a;
  c.vars[name] = a.v;
  return a;
}

// Follow a vehicle without being made: stay within `far` metres of it, but don't sit on its tail.
const tail = (place, type, name, text, secs, { near = 13, far = 110 } = {}) => ({
  enter(c) { this.a = target(c, place, type, name); this.t = secs; this.close = 0; this.lost = 0; },
  update(dt, c) {
    const a = this.a, v = a.v, pl = c.player.pos;
    if (!c.world.traffic.agents.includes(a) || v.engineDead) return { fail: 'You blew your cover.' };
    const d = Math.hypot(v.x - pl.x, v.z - pl.z);
    if (d > far) { if ((this.lost += dt) > 7) return { fail: 'You lost them.' }; } else this.lost = 0;
    if (d < near) { if ((this.close += dt) > 2.5) return { fail: 'They spotted you.' }; } else this.close = Math.max(0, this.close - dt);
    this.t -= dt;
    this.objective = `${text}${d > far * 0.8 ? '  (closer!)' : d < near * 1.5 ? '  (back off!)' : ''}`;
    if (this.t <= 0) return 'done';
  },
  get points() { return this.a ? [{ x: this.a.v.x, z: this.a.v.z }] : []; },
  get timeLeft() { return this.t; },
  objective: text,
});

// Run a vehicle down: knock it out of its lane and bring it to a stop, or wreck it.
const chase = (place, type, name, text, { escape = 420 } = {}) => ({
  enter(c) {
    this.a = target(c, place, type, name);
    this.a.cruise = this.a.v.spec.maxSpeed * 0.8; // flat out, and through the reds
    this.a.jumper = true; this.a.impatience = 0;
  },
  update(dt, c) {
    const a = this.a, v = a.v, pl = c.player.pos;
    if (v.engineDead || v.wrecked) return 'done';
    if (!c.world.traffic.agents.includes(a) && v.speed < 2.5) return 'done';
    if (Math.hypot(v.x - pl.x, v.z - pl.z) > escape) return { fail: 'They got away.' };
  },
  get points() { return this.a ? [{ x: this.a.v.x, z: this.a.v.z }] : []; },
  objective: text,
});

// Hold out at a place while waves of a crew come at you.
const survive = (place, text, crew, secs, waves) => ({
  enter(c) { this.p = c.place(place); this.crew = c.crewName(crew); this.t = secs; this.k = 0; this.next = 0; c.marker(this.p); },
  update(dt, c) {
    this.t -= dt; this.next -= dt;
    if (this.next <= 0 && this.k < waves.length) {
      const pl = c.player.pos;
      for (const m of waves[this.k]) {
        const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 8;
        const q = c.world.footpathNear(pl.x + Math.cos(a) * r, pl.z + Math.sin(a) * r);
        c.world.gangs.spawn(q.x, q.z, { crew: this.crew, hostile: true, weapon: m.weapon, health: m.health, name: m.name, accuracy: m.accuracy });
      }
      this.k++; this.next = secs / waves.length;
    }
    if (this.t <= 0) return 'done';
  },
  get timeLeft() { return Math.max(0, this.t); },
  objective: text,
});

// Checkpoints in order against the clock; each leg's time comes from its length.
const race = (places, text, vehicleVar, pace = 9) => ({
  enter(c) { this.ps = places.map((k) => c.place(k)); this.i = 0; this.t = 0; this.leg(c, c.player.pos); },
  leg(c, from) {
    const p = this.ps[this.i];
    this.t += Math.hypot(p.x - from.x, p.z - from.z) / pace + 12;
    c.marker(p);
  },
  update(dt, c) {
    const pl = c.player, v = c.vars[vehicleVar];
    if (v && (v.wrecked || v.engineDead)) return { fail: 'The vehicle is wrecked.' };
    if (v && pl.vehicle !== v) { this.objective = `Get back in the ${v.spec.label}.`; return; }
    if ((this.t -= dt) <= 0) return { fail: 'Out of time.' };
    const p = this.ps[this.i];
    if (Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < 9) {
      c.audio.click?.();
      if (++this.i >= this.ps.length) return 'done';
      this.leg(c, p);
    }
    this.objective = `${text} (${this.i}/${this.ps.length})`;
  },
  get timeLeft() { return this.t; },
  objective: text,
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

// ---------- Act II ----------
const ACT2 = 'Act II · Empire';
const SEENU = (n, extra = {}) => Array.from({ length: n }, (_, k) => ({ weapon: ['machete', 'chain', 'sickle', 'bat', 'knife'][k % 5], name: 'Seenu\'s boy', ...extra }));

MISSIONS.push(
  {
    id: 'ledger', title: 'Akka\'s Ledger', act: ACT2, giver: 'lakshmi', reward: 3000,
    steps: () => [
      talk([
        ['Lakshmi Akka', 'Sit, Raghu. Have a coffee. You have more cash than a delivery boy can explain.'],
        ['Lakshmi Akka', 'My darshinis sell ten thousand idlis a day. Who counts if some days it\'s twelve thousand?'],
        ['Lakshmi Akka', 'Pick up today\'s takings from three of my places. Then the cinema. Then we talk business.'],
      ]),
      collect(['darshini1', 'darshini2', 'darshini3'], 'Pick up the takings from Akka\'s darshinis', (c, n) => {
        c.audio.cash?.();
        const lines = ['Cashier: "Akka said you\'d come. Here, and take a vada for the road."', 'Cook: "Count it outside, not in front of the customers."', 'Manager: "Malleshwaram always pays more. Tell her that."'];
        c.hud.say(lines[n - 1], 3);
      }),
      go('cinema', 'Take the bags to the office of Gajalakshmi Talkies on K.G. Road.'),
      talk([
        ['Theatre manager', 'Housefull, every show, all week. Even the ones nobody came to. Funny, no?'],
        ['Raghu', 'Hilarious.'],
        ['Theatre manager', 'There\'s a white Bolero outside that\'s been parked there since you walked in.'],
      ]),
      wanted(1, 'Followed by a plain-clothes squad'),
      escape('Shake off the plain-clothes squad.'),
      talk([['Lakshmi Akka', '(on the phone) Good. Now there\'s a man who wants to meet you. Hanumanthappa. Corporator. Ambitious.']]),
    ],
  },
  {
    id: 'encroach', title: 'The Lake Bed', act: ACT2, giver: 'hanu', reward: 5000,
    steps: () => [
      talk([
        ['Hanu Anna', 'Raghu! Come, come. Everyone in Majestic says your name like a prayer.'],
        ['Hanu Anna', 'There\'s a lake bed in Kengeri. Thirty families in sheds. A friend\'s company has... plans for it.'],
        ['Hanu Anna', 'Make them leave. How, is your problem. I don\'t want to know.'],
      ]),
      go('kengeri', 'Go to the lake bed at Kengeri.', { radius: 22 }),
      talk([
        ['Village elder', 'We have lived here thirty years. My grandson was born in that shed.'],
        ['Village elder', 'Every year someone comes. Every year they promise something.'],
      ]),
      choose('Pay them to move, or clear them out.', [
        {
          id: 'mercy', place: 'kengeriA', label: 'Pay them off (₹2,000)', color: 0x40e080,
          steps: () => [
            act((c) => { c.world.money(-2000); c.audio.cash?.(); }),
            talk([['Village elder', 'Two thousand for thirty years. ...Fine. At least you looked us in the eye.']]),
          ],
        },
        {
          id: 'ruthless', place: 'kengeriB', label: 'Clear them out', color: 0xff4040,
          steps: () => [
            fight('kengeriB', 'The young men won\'t go quietly.', 'squat', [{ weapon: 'fists', name: 'Villager' }, { weapon: 'bat', name: 'Villager' }, { weapon: 'fists', name: 'Villager' }, { weapon: 'sickle', name: 'Villager' }]),
            wanted(2, 'Rioting at Kengeri'),
            escape(),
          ],
        },
      ]),
      go('hanu', 'Report to Hanu Anna in Rajajinagar.'),
      talk((c) => c.vars.choice === 'mercy'
        ? [['Hanu Anna', 'You paid them? With your own money?'], ['Hanu Anna', 'Soft heart. Bad for business, good for elections. I\'ll remember both.']]
        : [['Hanu Anna', 'The papers say "clashes at Kengeri". Nobody says your name. Good.'], ['Hanu Anna', 'The company sends its thanks. And a bonus.']]),
      act((c) => { if (c.vars.choice === 'ruthless') c.world.money(1500); }),
    ],
  },
  {
    id: 'godowns', title: 'Seenu\'s Godowns', act: ACT2, giver: 'chikka', reward: 6000,
    steps: () => [
      talk([
        ['Chikka', 'Seenu\'s boys hit three of our shops this week. They broke Iqbal\'s arm.'],
        ['Chikka', 'He keeps his lorries in the godowns on Mysore Road. Every rupee he makes rides in them.'],
        ['Raghu', 'Then they stop riding.'],
      ]),
      act((c) => {
        const p = c.place('godowns');
        c.vars.lorries = [0, 1, 2].map((k) => {
          const q = c.world.footpathNear(p.x + Math.cos(k * 2.1) * 14, p.z + Math.sin(k * 2.1) * 14);
          const v = c.world.park(k === 1 ? 'miniTruck' : 'lorry', q.x, q.z, Math.random() * 6.28);
          v.health = 30; // old, overloaded and already half-dead
          return v;
        });
      }),
      go('godowns', 'Go to Seenu\'s godowns on Mysore Road.', { radius: 30 }),
      wreck('lorries', 'Wreck Seenu\'s lorries'),
      fight('godowns', 'Seenu\'s men heard that. Deal with them.', 'seenu2', SEENU(4)),
      wanted(3, 'Arson on Mysore Road'),
      escape(),
      talk([
        ['Seenu', '(on the phone) You burned my lorries, delivery boy.'],
        ['Seenu', 'Nayandahalli junction. Bring everyone you have. Let\'s finish this like men.'],
      ]),
    ],
  },
  {
    id: 'informer', title: 'The Informer', act: ACT2, giver: 'lakshmi', reward: 5000,
    steps: () => [
      talk([
        ['Lakshmi Akka', 'There\'s a woman in the crime branch. ACP Shalini Rao. She knows things only your boys know.'],
        ['Lakshmi Akka', 'Mani. Red scooter. He left K.G. Road five minutes ago. Follow him. Don\'t let him see you.'],
      ]),
      go('maniStart', 'Get to K.G. Road, where Mani was last seen.', { radius: 30, slow: false }),
      tail('maniStart', 'scooter', 'mani', 'Follow Mani\'s red scooter without being seen', 70),
      talk([['', 'Mani slows down beside a white Innova. A woman in the back seat rolls the window down.'], ['', 'He sees you in the mirror, and twists the throttle.']]),
      chase('maniStart', 'scooter', 'mani', 'Stop Mani before he gets away'),
      talk((c) => [
        ['Mani', 'Anna, please! She said she\'d put my mother in jail!'],
        c.story.flags.ruthless ? ['Raghu', 'You should have come to me, Mani. Now it\'s too late for both of us.'] : ['Raghu', 'Go home, Mani. Take your mother to Mangaluru. Don\'t come back.'],
      ]),
      wanted(1, 'Assault on a scooter rider'),
      escape(),
    ],
  },
  {
    id: 'nayandahalli', title: 'Nayandahalli Junction', act: ACT2, giver: 'chikka', reward: 9000,
    steps: () => [
      talk([
        ['Chikka', 'Seenu\'s waiting at Nayandahalli with every boy from K.R. Market.'],
        ['Chikka', 'Take this. And Raghu? Come back. I don\'t want to run the garage alone.'],
      ]),
      act((c) => { c.player.give('revolver', 24); c.player.give('machete'); c.hud.say('Revolver ammo, and a machete.', 2.5); }),
      go('nayandahalli', 'Go to Nayandahalli junction.', { radius: 28 }),
      survive('nayandahalli', 'Survive Seenu\'s ambush', 'nay', 45, [SEENU(3), SEENU(3, { weapon: 'katta', accuracy: 0.25 }).slice(0, 1).concat(SEENU(2)), SEENU(3)]),
      fight('nayandahalli', 'Finish Seenu "Sickle" Srinivas.', 'seenuBoss', [
        { weapon: 'sickle', name: 'Seenu', health: 300, boss: true, r: 10 },
        { weapon: 'katta', name: 'Seenu\'s brother', accuracy: 0.3 }, { weapon: 'machete', name: 'Seenu\'s boy' },
      ]),
      wanted(3, 'Gang war at Nayandahalli'),
      escape(),
      talk([
        ['Chikka', '(on the phone) K.R. Market sent sweets. The whole of Mysore Road is paying us now.'],
        ['Chikka', 'And ACP Shalini Rao was on TV. She said your name. Twice.'],
      ]),
    ],
  },
  {
    id: 'dawn', title: 'Before Dawn', act: ACT2, giver: 'hanu', reward: 12000,
    steps: () => [
      talk([
        ['Hanu Anna', 'MLA Hanumanthappa. Sounds good, no? The party wants clean faces now.'],
        ['Hanu Anna', 'There\'s a warrant with your name on it. Shalini Rao collects it at dawn.'],
        ['Raghu', 'You\'re selling me.'],
        ['Hanu Anna', 'I\'m saving you. Faizal Bhai has a seat on the six o\'clock flight to Dubai. Chikka left you a car.'],
      ]),
      act((c) => { c.world.setHour?.(4.4); const p = c.place('hanu'); const q = c.world.footpathNear(p.x + 6, p.z + 4); c.vars.car = c.world.park('suv', q.x, q.z, 0, { model: 'fortuner', color: 0x111111 }); }),
      getIn('car', 'Get in the black Fortuner.'),
      wanted(4, 'Warrant: ACP Shalini Rao'),
      go('yelahanka', 'Get to the airport road at Yelahanka before dawn.', { vehicleVar: 'car', timer: 900, radius: 14, slow: false, failText: 'Dawn came. So did Shalini Rao.' }),
      act((c) => c.world.police.reset?.()),
      talk([
        ['ACP Shalini Rao', '(on the radio) Let him go. ...He\'ll come back. They always come back.'],
        ['Chikka', '(on the phone) Faizal Bhai\'s man is at the toll. Go, Raghu. I\'ll keep Majestic warm for you.'],
      ]),
    ],
    after: (story) => story.hud.toast('ACT II COMPLETE', 'Raghu flies to Dubai. Majestic keeps paying.'),
  },
);

// ---------- Odd jobs: side missions with their own givers (blue markers) ----------
const ODD = 'Odd Job';
const SIDE = [
  {
    id: 'amb108', title: '108 Emergency', act: ODD, giver: 'victoria', reward: 2200, needs: 'delivery',
    steps: () => {
      // (Timers allow ~11 m/s door to door: quick, in Bengaluru traffic.)
      const run = (spot, where, hosp, hospName, t1, t2) => [
        go(spot, `Get to the accident at ${where}. (G: siren)`, { vehicleVar: 'amb', timer: t1, radius: 6, failText: 'The ambulance never came.' }),
        act((c) => { const p = c.place(spot); const s = c.world.park('scooter', p.x + 2, p.z + 1, Math.random() * 6.28); s.takeDamage(65, s.x, s.z, c.world); c.hud.say('You load the injured rider into the back. "Bega, bega!"', 3); }),
        go(hosp, `Rush the patient to ${hospName}.`, { vehicleVar: 'amb', timer: t2, radius: 7, failText: 'The patient didn\'t make it.' }),
        act((c) => { c.audio.cash?.(); c.hud.say('Nurses take the stretcher. "Next one, quick!"', 2.5); }),
      ];
      return [
        talk([
          ['Dispatcher', 'Three accidents, one ambulance, and the driver\'s down with dengue. You can drive?'],
          ['Dispatcher', 'Siren\'s on G. Nobody in this city moves for it, but try.'],
        ]),
        act((c) => { const p = c.place('victoria'); const q = c.world.footpathNear(p.x + 5, p.z + 3); c.vars.amb = c.world.park('ambulance', q.x, q.z, 0); }),
        getIn('amb', 'Get in the 108 ambulance.'),
        act((c) => { c.vars.amb.siren = true; }),
        ...run('hudson', 'Hudson Circle', 'victoria', 'Victoria Hospital', 150, 150),
        ...run('richmond', 'Richmond Circle', 'bowring', 'Bowring Hospital', 230, 200),
        ...run('trinity', 'Trinity Circle', 'stjohns', 'St. John\'s Hospital', 180, 420),
        talk([['Dispatcher', 'Three for three. Who are you, man? ...Never mind. Don\'t tell me.']]),
      ];
    },
  },
  {
    id: 'matchday', title: 'Match Day', act: ODD, giver: 'tout', reward: 1800, needs: 'delivery',
    steps: () => [
      talk([
        ['Ticket tout', 'RCB at Chinnaswamy tonight, macha! Two VIPs stuck in traffic with my passes.'],
        ['Ticket tout', 'Indiranagar, then Koramangala. Get them in before the toss and there\'s money in it.'],
      ]),
      act((c) => c.world.setHour?.(17.5)),
      go('fan1', 'Pick up the first fan on 100 Feet Road, Indiranagar.', { inVehicle: true, radius: 5, timer: 360, failText: 'He took an auto. Two hundred rupees extra, he\'s furious.' }),
      act((c) => c.hud.say('Fan: "Ee sala cup namde! Drive, drive!"', 3)),
      go('stadium', 'Get him to the gates of Chinnaswamy Stadium.', { inVehicle: true, radius: 8, timer: 400, failText: 'The toss is done. He\'s not talking to you.' }),
      go('fan2', 'Now the second fan, in Koramangala.', { inVehicle: true, radius: 5, timer: 450 }),
      act((c) => c.hud.say('Fan: "Kohli is batting first?! Bega hogi!"', 3)),
      go('stadium', 'Back to Chinnaswamy before the first ball.', { inVehicle: true, radius: 8, timer: 450, failText: 'First ball\'s gone. So is your tip.' }),
      talk([['Ticket tout', 'Both inside! Here, and here\'s a cap. RCB! RCB! RCB!']]),
    ],
  },
  {
    id: 'hoardings', title: 'Hoarding Wars', act: ODD, giver: 'adman', reward: 1600, needs: 'collection',
    steps: () => [
      talk([
        ['Prakash (Sunrise Ads)', 'Every good hoarding on this side of town is my rival\'s now. Every single one.'],
        ['Prakash (Sunrise Ads)', 'Four of them, near here. Stand under each one long enough for my boys to paste our posters over it.'],
      ]),
      collect((c) => {
        const pl = c.player.pos, hs = (c.world.pois?.hoardings || []).slice();
        hs.sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z));
        return hs.slice(0, 4).map((h) => c.world.footpathNear(h.x, h.z));
      }, 'Stand under the rival hoardings', (c, n, total) => { c.audio.click?.(); c.hud.say(n < total ? 'Posters up. "Next one, saar!"' : 'Last one done. Someone\'s calling the police.', 2.5); }),
      wanted(1, 'Defacing hoardings'),
      escape(),
      talk([['Prakash (Sunrise Ads)', 'My phone hasn\'t stopped ringing. They all want to advertise with us now.']]),
    ],
  },
  {
    id: 'duke', title: 'Showroom Fresh', act: ODD, giver: 'imran', reward: 2500, needs: 'collection',
    steps: () => [
      talk([
        ['Imran (Shivajinagar)', 'A customer wants a new Duke. Orange. Today. I don\'t have one. The showroom in Indiranagar does.'],
        ['Imran (Shivajinagar)', 'Bring it here without a scratch.'],
      ]),
      go('showroom', 'Go to the KTM showroom in Indiranagar.', { radius: 8 }),
      act((c) => { const p = c.place('showroom'); c.vars.ktm = c.world.park('sportsBike', p.x + 2, p.z, 0, { color: 0xf26a10 }); }),
      getIn('ktm', 'Take the orange KTM Duke.'),
      wanted(2, 'Stolen motorcycle'),
      escape('Lose the police without wrecking the bike.'),
      go('imran', 'Deliver the Duke to Imran in Shivajinagar.', { vehicleVar: 'ktm', radius: 5 }),
      talk([['Imran (Shivajinagar)', 'Showroom fresh! The customer will never know. ...You didn\'t see the customer.']]),
    ],
  },
  {
    id: 'autorace', title: 'Auto Raja', act: ODD, giver: 'autoStand', reward: 2000, needs: 'collection',
    steps: () => [
      talk([
        ['Auto Shankar', 'You think you can drive? Every auto driver at K.R. Market has a bet on you.'],
        ['Auto Shankar', 'Take my auto. Town Hall, Lalbagh, and on to the Bull Temple. Beat the clock or I keep the money.'],
      ]),
      act((c) => { const p = c.place('autoStand'); const q = c.world.footpathNear(p.x + 3, p.z + 2); c.vars.auto = c.world.park('auto', q.x, q.z, 0); }),
      getIn('auto', 'Get in Shankar\'s auto.'),
      race(['cp1', 'cp2', 'cp3', 'cp4', 'cp5'], 'Race to the Bull Temple', 'auto', 7),
      talk([['Auto Shankar', '(on the phone) Ayyo! Half of K.R. Market just lost their money. The other half are buying you coffee.']]),
    ],
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
    this.sideGivers = new Map(); // odd-job id -> its blue marker
    this.flags = {}; // choices made along the way (mercy / ruthless...)
    this.lastGiver = null; // a giver only triggers again once you've walked away from it
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
      this.flags = s.flags || {};
      if (typeof s.money === 'number') { this.gigs.money = s.money; this.hud.setMoney(s.money, true); }
      if (this.done.length) setTimeout(() => this.hud.say(`Save loaded: ${this.done.length} story mission${this.done.length > 1 ? 's' : ''} done.`, 3), 4000);
    } catch { /* private window or blocked storage: play without saving */ }
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ done: this.done, flags: this.flags, money: this.gigs.money, t: Date.now() })); } catch { /* ignore */ }
  }

  reset() {
    this.done = [];
    this.flags = {};
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }

  get next() { return MISSIONS.find((m) => !this.done.includes(m.id)); }

  // Odd jobs on offer: not done yet, and unlocked by the story so far.
  get sideJobs() { return SIDE.filter((m) => !this.done.includes(m.id) && (!m.needs || this.done.includes(m.needs))); }

  get markers() {
    const out = [];
    if (this.active) {
      const st = this.active.step;
      if (st?.points) for (const p of st.points) out.push({ x: p.x, z: p.z, color: '#ff4fa0' });
      else if (this.marker.group.visible) out.push({ x: this.marker.x, z: this.marker.z, color: '#ff4fa0' });
      if (st?.crew) for (const g of this.world.gangs.alive(st.crew)) out.push({ x: g.x, z: g.z, color: g.boss ? '#ff2020' : '#e05050', small: true });
      const v = this.active.vars.lorry;
      if (v && this.world.player.vehicle !== v && !v.wrecked) out.push({ x: v.x, z: v.z, color: '#4fc0ff' });
    } else {
      if (this.giver.group.visible) out.push({ x: this.giver.x, z: this.giver.z, color: '#ff4fa0' });
      for (const m of this.sideGivers.values()) if (m.group.visible) out.push({ x: m.x, z: m.z, color: '#40b8ff' });
    }
    return out;
  }

  // ---------- running ----------
  start(def) {
    this.giver.hide();
    for (const m of this.sideGivers.values()) m.hide();
    this.lastGiver = this.place(def.giver);
    const steps = def.steps();
    const ctx = {
      world: this.world, hud: this.hud, audio: this.audio, player: this.world.player, input: null, vars: {},
      scene: this.scene, story: this, missionId: def.id,
      place: (k) => this.place(k),
      marker: (p) => this.marker.place(p.x, p.z, 0.15),
      crewName: (n) => `${def.id}:${n}`,
      // Steps that run next (a choice's branch).
      insert: (more) => this.active.steps.splice(this.active.idx + 1, 0, ...more),
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
    this.lastGiver = this.place(def.giver);
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
    a.step?.cleanup?.(a.ctx);
    for (const m of this.world.gangs.members.slice()) if (m.crew && m.crew.startsWith(a.def.id + ':')) this.world.gangs.remove(m);
    // Mission vehicles in the traffic go back to being ordinary traffic.
    for (const ag of this.world.traffic.agents) if (ag.keep === a.def.id) ag.keep = null;
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
      if (this.world.metroRide?.active) return;
      if (this.lastGiver && Math.hypot(pl.pos.x - this.lastGiver.x, pl.pos.z - this.lastGiver.z) > 8) { this.armed = true; this.lastGiver = null; }
      // The story's next mission (pink) and any odd jobs on offer (blue).
      const offers = [];
      const m = this.next;
      if (m) { const p = this.place(m.giver); this.giver.place(p.x, p.z, 0.15); offers.push([m, p]); } else this.giver.hide();
      const side = this.sideJobs;
      for (const [id, mk] of this.sideGivers) if (!side.some((j) => j.id === id)) { mk.hide(); this.scene.remove(mk.group); this.sideGivers.delete(id); }
      for (const j of side) {
        if (m && j.giver === m.giver) continue;
        let mk = this.sideGivers.get(j.id);
        if (!mk) { mk = new Marker(this.scene, 0x40b8ff); this.sideGivers.set(j.id, mk); }
        const p = this.place(j.giver);
        mk.place(p.x, p.z, 0.15);
        mk.update(t);
        offers.push([j, p]);
      }
      for (const [def, p] of offers) {
        const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
        if (!this.armed || d > 2.6 || (pl.vehicle && pl.vehicle.speed > 3)) continue;
        if (pl.dead) break;
        if (this.world.police.level > 0) { this.hud.prompt('Lose the police first'); break; }
        this.start(def);
        break;
      }
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

export { MISSIONS, SIDE };
export const pickLine = pick;
