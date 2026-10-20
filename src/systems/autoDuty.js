// Driving an auto for a living: in any auto (bought, borrowed or stolen) press J to go on duty.
// People on the footpaths wave you down; pull up beside one, they climb in the back and say where
// they're going, and the meter runs at the Bengaluru tariff until you drop them off. Drive gently
// and they tip; scare them and they make you stop and walk off without paying.
import { Vector3 } from 'three';
import { poseSit, animateWalk } from '../entities/human.js';
import { Marker } from './missions.js';
import { SCALE } from '../world/mapdata.js';

const PASSENGERS = [
  { who: 'Techie with a laptop bag', line: 'Meter haaki, guru. And please avoid Silk Board.', hurry: 0.6 },
  { who: 'Aunty with vegetables', line: 'Swalpa fast-aagi hogappa, my pressure cooker is on!', hurry: 0.8 },
  { who: 'College student', line: 'Bro, can you do it in fifty? I only have UPI.', hurry: 0.4 },
  { who: 'Startup founder', line: 'Let\'s disrupt this route. Take the shortcut.', hurry: 0.7 },
  { who: 'Tourist', line: 'Is this the famous Bangalore traffic? Amazing!', hurry: 0.1 },
  { who: 'Grandfather with an umbrella', line: 'Nidhaana-vaagi hogappa. I am in no hurry, you are in no hurry.', hurry: 0 },
  { who: 'Nurse after a night shift', line: 'Please hurry, anna, I have to sleep before the next shift.', hurry: 0.9 },
  { who: 'Two schoolkids', line: 'Uncle, tuition is starting! Bega, bega!', hurry: 1 },
  { who: 'Man on the phone', line: '...haan, haan, I\'m in the auto only, five minutes. (He has said this for an hour.)', hurry: 0.5 },
  { who: 'Shopkeeper with a sack', line: 'Sack-u hindge idtini, OK? Sari, hogona.', hurry: 0.3 },
];
const SCARED = ['Ayyo! Nidhaana!', 'Swalpa slow maadi, please!', 'Anna, jeeva ide nange!', 'Eh! Gaadi nodi, gaadi!'];
const BAIL = ['Nillisi! Illi ilisi, naanu nadkond hogthini!', 'Stop the auto! I\'ll walk from here!', 'Saaku! Illi nillisi!'];
const _p = new Vector3();
const THANKS = ['Thank you, anna!', 'Sari, thanks guru.', 'Dhanyavaada!', 'Change ittkoli.'];

// Meter: ₹30 for the first 2 km, ₹15 a km after that, one-and-a-half times between 10 pm and 5 am.
// Distances on the map are scaled down, so the meter counts real-world kilometres.
export function autoFare(metres, hour) {
  const km = (metres * SCALE) / 1000;
  const f = 30 + Math.max(0, km - 2) * 15;
  return f * (hour >= 22 || hour < 5 ? 1.5 : 1);
}

export class AutoDuty {
  constructor(scene, hud, audio, missions, gps, streetLife, pois) {
    this.hud = hud;
    this.audio = audio;
    this.missions = missions;
    this.gps = gps;
    this.streetLife = streetLife;
    this.places = pois.landmarks.concat(pois.food, pois.homes).filter((q) => q.name);
    this.on = false;
    this.hailers = []; // {p, marker, t}
    this.markers = [new Marker(scene, 0xffd21a), new Marker(scene, 0xffd21a)];
    this.destMarker = new Marker(scene, 0x30e070);
    this.fare = null;
    this.hailT = 3;
    this.hinted = new WeakSet();
    this.trips = 0;
    this.earned = 0;
  }

  get active() { return this.on; }

  get mapMarkers() {
    const m = this.hailers.map((h) => ({ x: h.p.x, z: h.p.z, color: '#ffd21a' }));
    if (this.fare?.stage === 'riding') m.push({ x: this.fare.dest.x, z: this.fare.dest.z, color: '#30e070' });
    return m;
  }

  update(dt, input, player, world) {
    const v = player.vehicle;
    const inAuto = v && v.type === 'auto' && v.driver === 'player';
    if (!inAuto) {
      if (this.on) this.stop(world, player.vehicle ? null : 'You left the auto.');
      return;
    }
    if (!this.on) {
      if (!this.hinted.has(v)) { this.hinted.add(v); this.hud.say('An auto of your own! Press J to go on duty and pick up fares.', 4); }
      if (input.hit('KeyJ')) this.start();
      return;
    }
    if (input.hit('KeyJ') && !this.fare) { this.stop(world, null); return; }
    const t = performance.now() / 1000;
    for (const m of this.markers) m.update(t);
    this.destMarker.update(t);
    if (this.fare) this.updateFare(dt, v, player, world);
    else this.updateHailers(dt, v, world);
  }

  start() {
    this.on = true;
    this.hailT = 2;
    this.missions.offer = null;
    this.hud.phone(null);
    this.hud.say('On duty. Watch the footpaths for people waving you down, and pull up next to them.', 4);
    this.audio.click?.();
  }

  stop(world, reason) {
    if (this.fare) this.abandon(world, reason || 'Off duty with a passenger aboard?');
    for (const h of this.hailers) this.dropHailer(h);
    this.on = false;
    this.hud.mission(null);
    if (!reason) this.hud.say(`Off duty. ${this.trips} trip${this.trips === 1 ? '' : 's'}, ₹${Math.round(this.earned)} earned.`, 3);
  }

  // ---------- finding fares ----------
  updateHailers(dt, v, world) {
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    // Rain and rush hour: everyone wants an auto.
    const h = world.hour, busy = world.rain > 0.3 || (h >= 8 && h < 11) || (h >= 17 && h < 21);
    this.hailT -= dt;
    if (this.hailT <= 0 && this.hailers.length < 2 && world.police.level === 0) {
      this.hailT = (busy ? 4 : 9) + Math.random() * 8;
      const cands = this.streetLife.peds.filter((p) => {
        if (p.kind !== 'walker' || p.state !== 'walk' || p.dead || this.hailers.some((q) => q.p === p)) return false;
        const dx = p.x - v.x, dz = p.z - v.z, d = Math.hypot(dx, dz);
        return d > 30 && d < 110 && (dx * fx + dz * fz) / d > 0.4;
      });
      if (cands.length) {
        const p = cands[Math.floor(Math.random() * cands.length)];
        this.streetLife.hail(p);
        const marker = this.markers.find((m) => !this.hailers.some((q) => q.marker === m));
        this.hailers.push({ p, marker, t: 0 });
        this.audio.voice?.('vo_kn_he', { x: p.x, z: p.z, ref: 10, gender: p.h.female ? 'f' : 'm' });
        this.hud.say('Someone up ahead is waving you down: "Auto!"', 2.5);
      }
    }
    for (let i = this.hailers.length - 1; i >= 0; i--) {
      const hl = this.hailers[i], p = hl.p;
      hl.t += dt;
      // Gone (scared off, streamed out, or tired of waiting)?
      if (p.state !== 'hail' || !this.streetLife.peds.includes(p) || hl.t > 50 || world.police.level > 0) {
        this.dropHailer(hl);
        continue;
      }
      hl.marker.place(p.x, p.z, p.y + 0.05);
      const d = Math.hypot(p.x - v.x, p.z - v.z);
      if (d < 6.5 && v.speed < 1.5) { this.pickUp(hl, v, world); return; }
    }
    this.hud.mission('🛺 On duty', this.hailers.length ? 'Pull up next to the person waving (yellow).' : 'Cruise around and watch the footpaths for fares.', null);
  }

  dropHailer(hl) {
    this.streetLife.unhail(hl.p);
    hl.marker.hide();
    this.hailers.splice(this.hailers.indexOf(hl), 1);
  }

  pickUp(hl, v, world) {
    for (const q of this.hailers.slice()) if (q !== hl) this.dropHailer(q);
    this.hailers.length = 0;
    hl.marker.hide();
    const p = hl.p;
    const h = this.streetLife.take(p);
    const pax = PASSENGERS[Math.floor(Math.random() * PASSENGERS.length)];
    const dest = this.pickDestination(v, world);
    this.fare = {
      stage: 'boarding', h, pax, dest, t: 0, fromX: p.x, fromZ: p.z,
      metres: 0, comfort: 100, health: v.health, wanted: world.police.level, scaredT: 0, warned: false,
      prevWaypoint: this.gps.target ? { ...this.gps.target } : null,
    };
    this.audio.voice?.('vo_kn_namaskara', { gender: h.female ? 'f' : 'm' });
  }

  pickDestination(v, world) {
    const ok = this.places.filter((q) => { const d = Math.hypot(q.x - v.x, q.z - v.z); return d > 250 && d < 1400 && world.layout.edgeAt(q.x, q.z); });
    if (ok.length) return ok[Math.floor(Math.random() * ok.length)];
    return this.places[Math.floor(Math.random() * this.places.length)];
  }

  // ---------- with a passenger ----------
  updateFare(dt, v, player, world) {
    const f = this.fare;
    f.t += dt;
    if (f.stage === 'boarding') {
      // Walk round to the open side of the auto and climb in the back.
      const lx = Math.cos(v.heading), lz = -Math.sin(v.heading);
      const door = { x: v.x + lx * 1.0, z: v.z + lz * 1.0 };
      const k = Math.min(1, f.t / 1.3);
      const x = f.fromX + (door.x - f.fromX) * k, z = f.fromZ + (door.z - f.fromZ) * k;
      f.h.group.position.set(x, v.y + 0.15, z);
      f.h.group.rotation.y = Math.atan2(door.x - f.fromX, door.z - f.fromZ);
      animateWalk(f.h, dt, 1.6);
      if (v.speed > 2) { this.hud.say('"Hey! Wait for me!" Your passenger walks off.', 3); this.release(world, f.fromX, f.fromZ); this.fare = null; return; }
      if (k >= 1) {
        poseSit(f.h);
        f.h.group.position.set(0, -0.05, -0.62);
        f.h.group.rotation.set(0, 0, 0);
        v.model.body.add(f.h.group);
        f.stage = 'riding';
        f.lastX = v.x; f.lastZ = v.z;
        this.gps.set(f.dest.x, f.dest.z);
        this.destMarker.place(f.dest.x, f.dest.z, 0.15);
        this.audio.voice?.('vo_kn_hogi', { gender: f.h.female ? 'f' : 'm' });
        this.hud.say(`${f.pax.who}: "${f.dest.name}, please. ${f.pax.line}"`, 5);
      }
      return;
    }
    // Meter: by distance actually driven.
    f.metres += Math.hypot(v.x - f.lastX, v.z - f.lastZ);
    f.lastX = v.x; f.lastZ = v.z;
    const fare = autoFare(f.metres, world.hour);
    // Comfort: knocks, speeding, police chases.
    const hit = f.health - v.health;
    if (hit > 0.5) { f.comfort -= hit * 4; this.scared(); }
    f.health = v.health;
    const fast = v.speed > 14 ? (v.speed - 14) * 0.8 : 0;
    f.comfort += (f.pax.hurry * 1.2 - fast * (1.2 - f.pax.hurry)) * dt;
    if (world.police.level > f.wanted) { f.comfort -= 40; f.wanted = world.police.level; this.scared(); }
    f.comfort = Math.min(100, f.comfort);
    f.scaredT -= dt;
    const left = Math.hypot(f.dest.x - v.x, f.dest.z - v.z);
    if (v.wrecked || v.fireT > 0) { this.abandon(world, 'Your passenger scrambles out of the burning auto!'); return; }
    if (f.comfort < 25 && f.stage === 'riding') {
      f.stage = 'bailing';
      this.audio.voice?.('vo_kn_nillisi', { gender: f.h.female ? 'f' : 'm' });
      this.hud.say(`${f.pax.who}: "${BAIL[Math.floor(Math.random() * BAIL.length)]}"`, 4);
    }
    if (f.stage === 'bailing') {
      this.hud.mission('🛺 Passenger wants out', 'Stop and let them off. (No fare for that ride.)', null);
      if (v.speed < 1.2) this.dropOff(v, world, 0);
      return;
    }
    const mood = f.comfort > 75 ? '😊' : f.comfort > 45 ? '😐' : '😨';
    this.hud.mission('🛺 Meter running', `₹${fare.toFixed(1)} · ${((f.metres * SCALE) / 1000).toFixed(1)} km · ${mood} · to ${f.dest.name} (${Math.round(left)} m)`, null);
    if (left < 16 && v.speed < 1.2) {
      const tip = f.comfort > 70 ? Math.round(fare * (0.05 + Math.random() * 0.15) + f.pax.hurry * 10) : 0;
      this.dropOff(v, world, Math.round(fare) + tip, tip);
    }
  }

  scared() {
    const f = this.fare;
    if (f.scaredT > 0) return;
    f.scaredT = 4;
    if (!f.h.female) this.audio.voice?.('vo_gasp_m', {});
    else this.audio.voice?.('vo_kn_swalpa', { gender: 'f' });
    this.hud.say(`"${SCARED[Math.floor(Math.random() * SCARED.length)]}"`, 2);
  }

  dropOff(v, world, pay, tip = 0) {
    const f = this.fare;
    const lx = Math.cos(v.heading), lz = -Math.sin(v.heading);
    const x = v.x + lx * 1.6, z = v.z + lz * 1.6;
    this.finish(world);
    this.release(world, x, z);
    if (pay > 0) {
      this.missions.addMoney(pay);
      this.audio.cash();
      this.trips++;
      this.earned += pay;
      this.missions.rating = Math.min(5, this.missions.rating + (f.comfort > 70 ? 0.05 : 0.01));
      this.audio.voice?.('vo_kn_dhanyavadagalu', { gender: f.h.female ? 'f' : 'm' });
      this.hud.toast(`+₹${pay}`, `Meter ₹${pay - tip}${tip ? ` · tip ₹${tip}` : ''} · ★ ${this.missions.rating.toFixed(1)}`);
      this.hud.say(`${f.pax.who}: "${THANKS[Math.floor(Math.random() * THANKS.length)]}"`, 2.5);
    } else {
      this.missions.rating = Math.max(1, this.missions.rating - 0.3);
      this.hud.toast('No fare', `★ ${this.missions.rating.toFixed(1)}`);
    }
  }

  abandon(world, reason) {
    const f = this.fare;
    this.hud.say(`${reason} ★ rating down.`, 3);
    this.missions.rating = Math.max(1, this.missions.rating - 0.3);
    const at = f.h.group.getWorldPosition(_p);
    this.finish(world);
    this.release(world, at.x, at.z);
  }

  finish() {
    const f = this.fare;
    this.destMarker.hide();
    if (f.prevWaypoint) this.gps.set(f.prevWaypoint.x, f.prevWaypoint.z); else this.gps.clear();
    this.hud.mission(null);
  }

  // Back to the footpath.
  release(world, x, z) {
    const f = this.fare;
    f.h.group.parent?.remove(f.h.group);
    this.streetLife.adopt(f.h, x, z);
    this.fare = null;
    this.hailT = 5;
  }
}
