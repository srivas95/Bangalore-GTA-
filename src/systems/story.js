// Story missions. A mission is a script of steps (go somewhere, talk, fight a crew, lose the
// police, collect, steal and deliver a vehicle...). Mission givers wait at marked places on the
// map; walk into the marker to start. Progress is saved to localStorage (each game starts with ₹1000).
// The story is fiction: see docs/STORY.md.
import { Marker } from './missions.js';
import { geo, SCALE } from '../world/mapdata.js';

const SAVE_KEY = 'namma-bengaluru-save-v1';
const ACT1 = 'Act I · Majestic';
const ACT2 = 'Act II · Empire';
const ACT3 = 'Act III · Exile';
// Act III is played as Vinay, a delivery rider who idolises Raghu.
const RAGHU = { outfit: 'shirt', top: 0x3a6ea5, bottom: 0x22304a, skin: 0xa8693c, shoes: 0xeeeeee, female: false };
const VINAY = { outfit: 'tshirt', top: 0xe8601a, bottom: 0x2a2a30, skin: 0x8a5530, shoes: 0x222222, female: false };

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
  hanu: [12.9915, 77.5545], // Hanu Anna's party office, Rajajinagar
  lakebed: [12.9135, 77.487], // the lake bed in Kengeri
  nayandahalli: [12.941, 77.523], // Seenu's godowns at the Nayandahalli junction
  lakshmi: [12.942, 77.5735], // Lakshmi Akka's darshini, Basavanagudi
  darshini1: [12.948, 77.573], darshini2: [12.929, 77.583], darshini3: [13.0035, 77.57],
  informer: [12.9705, 77.5935], // a tea stall on Kasturba Road
  kia: [13.1986, 77.7066], // Kempegowda International Airport
  // Act III
  hub: [12.979, 77.576], // the delivery riders' corner in Gandhinagar
  court: [12.9769, 77.581], // the City Civil Court
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

// Run down a vehicle that's trying to get away through the traffic: done when it's wrecked or
// its engine is dead; failed if it gets clear away.
const stop = (place, type, text) => ({
  enter(c) {
    const p = c.place(place), L = c.world.traffic.layout;
    let best = null, bd = Infinity;
    for (const e of L.edges) { const d = Math.hypot(e.from.x - p.x, e.from.z - p.z); if (d < bd && e.len > 40 && !e.flyover) { bd = d; best = e; } }
    const a = c.world.traffic.spawnOn(type, best, 5);
    a.keep = true; a.rush = true; a.cruise *= 1.3;
    c.vars.target = a.v;
    this.agent = a;
  },
  update(dt, c) {
    const v = c.vars.target, pl = c.player.pos;
    if (v.engineDead || v.wrecked || (v.driver !== 'ai' && v.speed < 1)) return 'done';
    if (Math.hypot(v.x - pl.x, v.z - pl.z) > 450) return { fail: 'They got away.' };
  },
  objective: text,
});

// Play as someone else from here on (and back).
const become = (look, who) => act((c) => { c.player.setLook(look); c.world.story.look = who; c.hud.toast(who === 'vinay' ? 'You are Vinay' : 'You are Raghu', who === 'vinay' ? 'A delivery rider who would do anything for Raghu-anna' : 'Home again'); });

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
      go('den', 'Get the parcel to the lodge in Chickpete.', { timer: Math.round(100 * 5 / SCALE), failText: 'The parcel was late. Kotte Kumar doesn\'t like late.' }),
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

  // ---------- Act II: Empire ----------
  {
    id: 'lakebed', title: 'The Lake Bed', act: ACT2, giver: 'hanu', reward: 4000,
    steps: () => [
      talk([
        ['Hanu Anna', 'So this is the boy who took Majestic. Sit, sit. Coffee?'],
        ['Hanu Anna', 'There is a lake bed in Kengeri. Dry, mostly. A builder friend wants it, and some people have built sheds on it.'],
        ['Hanu Anna', 'The people are not the problem. The problem is the boys the other builder has put there. Clear them out.'],
      ]),
      go('lakebed', 'Go to the lake bed in Kengeri.', { radius: 30 }),
      fight('lakebed', 'Clear out the other builder\'s boys.', 'builder', [
        { weapon: 'bat', name: 'Builder\'s boy' }, { weapon: 'chain', name: 'Builder\'s boy' }, { weapon: 'machete', name: 'Builder\'s boy' },
        { weapon: 'knife', name: 'Builder\'s boy' }, { weapon: 'katta', name: 'Their foreman', accuracy: 0.25, health: 160 },
      ]),
      wanted(2, 'Riot on the lake bed'),
      escape('Lose the police.'),
      talk([
        ['Hanu Anna', '(on the phone) The sheds came down by themselves this afternoon. Amazing. Must be the rain.'],
        ['Hanu Anna', 'You and I are going to do great things for this city, Raghu.'],
      ]),
    ],
  },
  {
    id: 'godowns', title: 'Nayandahalli Nights', act: ACT2, giver: 'chikka', reward: 5000,
    steps: () => [
      talk([
        ['Chikka', 'Seenu hit our collections in K.R. Market again. Three of our boys are in Victoria Hospital.'],
        ['Chikka', 'His stock sits in the godowns at the Nayandahalli junction. If the godowns burn, he can\'t pay his boys.'],
      ]),
      act((c) => { c.world.setHour?.(22); }),
      go('nayandahalli', 'Get to Seenu\'s godowns at Nayandahalli.', { radius: 25 }),
      fight('nayandahalli', 'Take out the godown guards.', 'seenuGodown', [
        { weapon: 'sickle', name: 'Seenu\'s guard' }, { weapon: 'sickle', name: 'Seenu\'s guard' }, { weapon: 'machete', name: 'Seenu\'s guard' },
        { weapon: 'katta', name: 'Seenu\'s guard', accuracy: 0.25 }, { weapon: 'chain', name: 'Seenu\'s guard' }, { weapon: 'katta', name: 'Godown manager', accuracy: 0.3, health: 180 },
      ]),
      wanted(3, 'Godown fire at Nayandahalli'),
      escape('The fire brigade and the police are coming. Lose the police.'),
      talk([
        ['Seenu', '(on the phone) You burnt my godowns? Majestic boy, you just started a war you can\'t afford.'],
        ['Raghu', 'Then don\'t send your bill to me.'],
      ]),
    ],
  },
  {
    id: 'ledger', title: 'Lakshmi Akka\'s Ledger', act: ACT2, giver: 'lakshmi', reward: 6000,
    steps: () => [
      talk([
        ['Lakshmi Akka', 'Raghu, money that comes in envelopes has to come out of somewhere respectable.'],
        ['Lakshmi Akka', 'My darshinis take cash all day. Bring the week\'s takings from three of them, and we\'ll make your envelopes into idli and coffee.'],
      ]),
      collect(['darshini1', 'darshini2', 'darshini3'], 'Pick up the takings from Lakshmi Akka\'s darshinis', (c, n) => {
        c.audio.cash?.();
        c.hud.say(['Manager: "Akka said you\'d come. It\'s all there, counted twice."', 'Manager: "Busy week. Very busy week. Somehow."', 'Manager: "Tell Akka the new filter coffee machine is a success."'][n - 1], 3);
      }),
      go('lakshmi', 'Take the money to Lakshmi Akka in Basavanagudi.'),
      talk([
        ['Lakshmi Akka', 'Good. Now it\'s clean money from a very successful chain of restaurants.'],
        ['Lakshmi Akka', 'One more thing. There\'s a new lady at the Crime Branch. Shalini Rao. She doesn\'t take coffee.'],
      ]),
    ],
  },
  {
    id: 'informer', title: 'The Informer', act: ACT2, giver: 'chikka', reward: 7000,
    steps: () => [
      talk([
        ['Chikka', 'One of our own is talking to ACP Shalini Rao. Murali, from the Avenue Road collections.'],
        ['Chikka', 'He\'s meeting her man at a tea stall on Kasturba Road. If he gets there, she has everything.'],
      ]),
      go('informer', 'Get to the tea stall on Kasturba Road.', { radius: 20, timer: Math.round(110 * 5 / SCALE), failText: 'Murali made the meeting. Shalini Rao has everything now.' }),
      talk([['Tea stall owner', 'Murali? He saw you coming and jumped in a cab!']]),
      stop('informer', 'taxi', 'Stop Murali\'s cab before he reaches the Crime Branch.'),
      talk([
        ['Murali', 'Raghu-anna, she was going to put my brother inside! I had no choice!'],
        ['Raghu', 'Go home to Mysuru, Murali. Tonight. Don\'t come back.'],
      ]),
      escape('Lose the police.'),
    ],
  },
  {
    id: 'dawn', title: 'Airport Road Before Dawn', act: ACT2, giver: 'hanu', reward: 12000,
    steps: () => [
      talk([
        ['Hanu Anna', 'Raghu, I am an MLA now. An MLA cannot have friends like you.'],
        ['Hanu Anna', 'There is a warrant with your name on it, signed this evening. I didn\'t stop it. I\'m giving you a head start.'],
        ['Hanu Anna', 'Faizal Bhai has a ticket for you. Dubai, the 6 a.m. flight. Be on it.'],
      ]),
      act((c) => { c.world.setHour?.(4.2); }),
      wanted(4, 'Wanted on a warrant'),
      escape('Every Hoysala in the city has your number. Lose them.'),
      go('kia', 'Get to Kempegowda International Airport before the flight.', { radius: 40, timer: Math.round(700 * 3 / SCALE), failText: 'The flight left without you.' }),
      talk([
        ['Faizal Bhai', '(on the phone) Raghu-bhai, welcome to the family. Don\'t worry about Bengaluru. Bengaluru will wait for you.'],
        ['Raghu', 'It had better.'],
      ]),
    ],
    after: (story) => story.hud.toast('ACT II COMPLETE', 'Raghu flies to Dubai. Back home, someone has to keep his name alive.'),
  },

  // ---------- Act III: Exile ----------
  {
    id: 'vinay', title: 'A Call from Dubai', act: ACT3, giver: 'hub', reward: 3000,
    steps: () => [
      become(VINAY, 'vinay'),
      talk([
        ['Raghu', '(on the phone, from Dubai) Vinay? It\'s Raghu. Don\'t say my name out loud.'],
        ['Raghu', 'With me gone, the Avenue Road shops are paying Seenu. Go and remind them who Majestic belongs to.'],
        ['Vinay', 'Anna, I deliver biryani.'],
        ['Raghu', 'Today you deliver a message.'],
      ]),
      collect(['shop1', 'shop2', 'shop3', 'shop4'], 'Remind the Avenue Road shops who they pay', (c, n) => {
        c.audio.cash?.();
        c.hud.say(['Shopkeeper: "Raghu\'s boy? We thought he was finished!"', 'Shopkeeper: "Seenu\'s men take double. Fine, fine. Take it."', 'Shopkeeper: "Tell Raghu-avaru we never stopped praying for him."', 'Shopkeeper: "Seenu\'s men are here! Run!"'][n - 1], 3);
      }),
      fight('shop4', 'Seenu\'s collectors want a word. Deal with them.', 'collectors', [
        { weapon: 'bat', name: 'Seenu\'s collector' }, { weapon: 'chain', name: 'Seenu\'s collector' }, { weapon: 'fists', name: 'Seenu\'s collector' },
      ]),
      escape('Lose the police.'),
      talk([
        ['Raghu', '(on the phone) I heard. Good boy. Now they\'ll remember.'],
      ]),
    ],
  },
  {
    id: 'darshiniFire', title: 'Coffee and Kerosene', act: ACT3, giver: 'lakshmi', reward: 5000,
    steps: () => [
      talk([
        ['Lakshmi Akka', 'Vinay, Seenu\'s men came this morning. They said the next visit, they bring kerosene.'],
        ['Lakshmi Akka', 'They\'re at my VV Puram branch now. I don\'t want a fire in my kitchen, child.'],
      ]),
      go('darshini1', 'Get to the VV Puram darshini before they light it.', { radius: 20, timer: Math.round(90 * 5 / SCALE), failText: 'The darshini went up in flames.' }),
      fight('darshini1', 'Stop Seenu\'s arsonists.', 'arson', [
        { weapon: 'machete', name: 'Arsonist' }, { weapon: 'sickle', name: 'Arsonist' }, { weapon: 'katta', name: 'Arsonist', accuracy: 0.25 }, { weapon: 'chain', name: 'Arsonist' },
      ]),
      wanted(2, 'Brawl in VV Puram'),
      escape('Lose the police.'),
      talk([
        ['Lakshmi Akka', '(on the phone) My cook says you fought like Raghu. That\'s not a compliment, Vinay. Be careful.'],
      ]),
    ],
  },
  {
    id: 'tail', title: 'Shalini\'s Shadow', act: ACT3, giver: 'hub', reward: 6000,
    steps: () => [
      talk([
        ['Chikka', '(on the phone) Vinay, ACP Shalini Rao\'s people have been following you since the darshini.'],
        ['Chikka', 'Shake them off and come to the garage. Do NOT lead them here.'],
      ]),
      wanted(3, 'Under surveillance by the Crime Branch'),
      escape('Shake off the Crime Branch.'),
      go('chikka', 'Get to Chikka\'s garage in Gandhinagar.'),
      talk([
        ['Chikka', 'She came to the garage herself yesterday. Asked about the revolver. My uncle\'s revolver.'],
        ['Chikka', 'Raghu needs to come home soon, Vinay, or there won\'t be anything left to come home to.'],
      ]),
    ],
  },
  {
    id: 'mlaLorry', title: 'The MLA\'s Cash', act: ACT3, giver: 'chikka', reward: 9000,
    steps: () => [
      talk([
        ['Raghu', '(on the phone) Hanu Anna sold my people to Seenu. Now he\'s moving his election cash in a lorry out of Peenya.'],
        ['Raghu', 'Bring it to Chikka. Hanu Anna is going to help me come home, whether he likes it or not.'],
      ]),
      go('godown', 'Go to the godown in Peenya.', { radius: 20 }),
      act((c) => {
        const p = c.place('godown');
        c.vars.lorry = c.world.park('lorry', p.x, p.z, Math.random() * 6.28);
      }),
      fight('godown', 'Hanu Anna\'s men are guarding it. Take them out.', 'mla', [
        { weapon: 'katta', name: 'MLA\'s gunman', accuracy: 0.3 }, { weapon: 'machete', name: 'MLA\'s man' }, { weapon: 'bat', name: 'MLA\'s man' }, { weapon: 'revolver', name: 'MLA\'s gunman', accuracy: 0.3, health: 150 },
      ]),
      getIn('lorry', 'Get in the lorry.'),
      wanted(3, 'Hijacked an MLA\'s lorry'),
      escape('Lose the police, and keep the lorry in one piece.'),
      go('chikka', 'Deliver the lorry to Chikka\'s garage.', { radius: 8, vehicleVar: 'lorry' }),
      talk([
        ['Chikka', 'Four crore. In vegetable crates. In a lorry. Hanu Anna has no imagination.'],
        ['Raghu', '(on the phone) Tell him I have his crates. He\'ll call me.'],
      ]),
    ],
  },
  {
    id: 'deal', title: 'The Deal', act: ACT3, giver: 'hub', reward: 15000,
    steps: () => [
      talk([
        ['Raghu', '(on the phone) It\'s done. Hanu Anna made calls. I fly in tomorrow and surrender at the City Civil Court.'],
        ['Raghu', 'My lawyer lands tonight. Seenu knows. Pick her up at the airport and get her to the court alive.'],
      ]),
      go('kia', 'Get to Kempegowda International Airport.', { radius: 40 }),
      talk([['Advocate Meera', 'You\'re Vinay? You look about twelve. Drive. Fast.']]),
      go('court', 'Get Advocate Meera to the City Civil Court.', { radius: 15, timer: Math.round(650 * 3 / SCALE), failText: 'The hearing went ahead without her. The deal is off.' }),
      fight('court', 'Seenu\'s men are waiting at the court. Hold them off.', 'courtAmbush', [
        { weapon: 'katta', name: 'Seenu\'s shooter', accuracy: 0.3 }, { weapon: 'katta', name: 'Seenu\'s shooter', accuracy: 0.3 }, { weapon: 'machete', name: 'Seenu\'s man' },
        { weapon: 'sickle', name: 'Seenu\'s man' }, { weapon: 'revolver', name: 'Seenu "Sickle" Srinivas', boss: true, health: 260, accuracy: 0.35, r: 12 },
      ]),
      wanted(3, 'Shootout at the City Civil Court'),
      escape('Lose the police.'),
      become(RAGHU, 'raghu'),
      talk([
        ['Raghu', 'Vinay. I heard what you did at the court.'],
        ['Raghu', 'The surrender, the trial... it will go nowhere. Hanu Anna made sure of that.'],
        ['ACP Shalini Rao', 'Welcome home, Raghavendra. Enjoy it. I\'m not finished with you.'],
      ]),
    ],
    after: (story) => story.hud.toast('ACT III COMPLETE', 'Raghu is home, "reformed". Act IV: Return is coming.'),
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
      // In the middle of Act III you're Vinay.
      if (this.done.includes('vinay') && !this.done.includes('deal')) { this.look = 'vinay'; setTimeout(() => this.world.player.setLook(VINAY), 0); }
      // Story progress carries over; money doesn't: every game starts with START_MONEY in your pocket.
      if (this.done.length) setTimeout(() => this.hud.say(`Save loaded: ${this.done.length} story mission${this.done.length > 1 ? 's' : ''} done.`, 3), 4000);
    } catch { /* private window or blocked storage: play without saving */ }
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ done: this.done, t: Date.now() })); } catch { /* ignore */ }
  }

  reset() {
    this.done = [];
    if (this.look === 'vinay') { this.look = 'raghu'; this.world.player.setLook(RAGHU); }
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
      const t = this.active.vars.target;
      if (t && !t.wrecked && !t.engineDead) out.push({ x: t.x, z: t.z, color: '#ff2020' });
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
    const tgt = a.vars.target && this.world.traffic.findAgent(a.vars.target);
    if (tgt) tgt.keep = false;
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
