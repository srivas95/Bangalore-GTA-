// Riding Namma Metro: buy a token at a station entrance, pick a destination (changing lines at
// Majestic if needed), wait on the platform for a real train, ride it in real time and get off
// at the other end. T skips the wait or the ride.
import * as THREE from 'three';
import { TRAIN_LEN } from '../world/metro.js';

const FARE = (n) => Math.min(60, 10 + n * 3);
const TRACK = 2.2;

export class MetroRide {
  constructor(metro, hud, audio) {
    this.metro = metro;
    this.routes = metro.routes;
    this.hud = hud;
    this.audio = audio;
    this.state = null; // null | 'menu' | 'platform' | 'riding'
    this.entrances = [];
    for (const line of this.routes) for (const st of line.stations) for (const e of st.entrances || []) this.entrances.push({ ...e, st, line });
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.buildDom();
  }

  get active() { return this.state !== null; }

  buildDom() {
    const el = document.createElement('div');
    el.id = 'metro-menu';
    el.innerHTML = '<div class="mm-head"><span class="mm-logo">ⓜ</span> <b>NAMMA METRO</b> · ನಮ್ಮ ಮೆಟ್ರೋ<div class="mm-sub"></div></div><div class="mm-lines"></div><div class="mm-foot">W/S choose · A/D line · E buy token · Q cancel <u>(tap here to cancel)</u></div>';
    document.getElementById('hud').appendChild(el);
    this.el = el;
    // Tap a station to buy a token (touch screens), tap the line title to switch lines.
    el.addEventListener('click', (e) => {
      const st = e.target.closest('.mm-st');
      if (st) { this.sel = +st.dataset.i; this.tapBuy = true; return; }
      if (e.target.closest('.mm-title')) this.tapLine = true;
      if (e.target.closest('.mm-foot')) this.tapCancel = true;
    });
    const banner = document.createElement('div');
    banner.id = 'metro-banner';
    document.getElementById('hud').appendChild(banner);
    this.banner = banner;
    const tunnel = document.createElement('div');
    tunnel.id = 'metro-tunnel';
    const hud = document.getElementById('hud');
    hud.insertBefore(tunnel, hud.firstChild); // under the rest of the HUD
    this.tunnel = tunnel;
  }

  // The entrance within reach, if any.
  nearEntrance(p) {
    let best = null, bd = 3.2;
    for (const e of this.entrances) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ---------- trip planning ----------
  stationsByName(name) { return this.routes.flatMap((l) => l.stations.filter((s) => s.en === name)); }

  plan(from, to) {
    if (from.line === to.line) return [{ line: from.line, from, to, dir: Math.sign(to.idx - from.idx) }];
    // Change at the interchange (Majestic).
    const x1 = from.line.stations.find((s) => s.interchange), x2 = to.line.stations.find((s) => s.interchange);
    const legs = [];
    if (x1 !== from) legs.push({ line: from.line, from, to: x1, dir: Math.sign(x1.idx - from.idx) });
    if (x2 !== to) legs.push({ line: to.line, from: x2, to, dir: Math.sign(to.idx - x2.idx) });
    return legs;
  }

  stops(legs) { return legs.reduce((n, l) => n + Math.abs(l.to.idx - l.from.idx), 0); }

  // ---------- menu ----------
  open(entrance, world) {
    if (world.police.level > 0) { this.hud.say('Metro security won\'t let you through with the police on your tail.', 3); return; }
    this.state = 'menu';
    this.here = entrance.st;
    this.lineIdx = this.routes.indexOf(entrance.line);
    this.sel = (this.here.idx + 1) % entrance.line.stations.length;
    this.el.classList.add('show');
    this.renderMenu();
    world.player.vehicleSpeed = 0;
  }

  renderMenu() {
    const line = this.routes[this.lineIdx];
    const col = '#' + line.color.toString(16).padStart(6, '0');
    this.el.querySelector('.mm-sub').textContent = `You are at ${this.here.en}`;
    const list = line.stations.map((s, i) => {
      const legs = this.plan(this.here, s);
      const here = s.en === this.here.en;
      const fare = here ? '' : `₹${FARE(this.stops(legs))}`;
      const change = legs.length > 1 ? ' <i>change at Majestic</i>' : '';
      return `<div data-i="${i}" class="mm-st${i === this.sel ? ' sel' : ''}${here ? ' here' : ''}"><span class="mm-dot" style="border-color:${col}"></span><span class="mm-name">${s.en}<small>${s.kn}</small>${change}</span><span class="mm-fare">${here ? 'YOU ARE HERE' : fare}</span></div>`;
    });
    this.el.querySelector('.mm-lines').innerHTML = `<div class="mm-line" style="--c:${col}"><div class="mm-title">${line.name} ${this.routes.length > 1 ? '◀ ▶' : ''}</div><div class="mm-list">${list.join('')}</div></div>`;
    this.el.querySelector('.mm-st.sel')?.scrollIntoView({ block: 'nearest' });
  }

  menuInput(input, world, missions) {
    const line = this.routes[this.lineIdx];
    if (input.hit('KeyW', 'ArrowUp')) { this.sel = (this.sel - 1 + line.stations.length) % line.stations.length; this.renderMenu(); }
    if (input.hit('KeyS', 'ArrowDown')) { this.sel = (this.sel + 1) % line.stations.length; this.renderMenu(); }
    const tapLine = this.tapLine, tapBuy = this.tapBuy, tapCancel = this.tapCancel;
    this.tapLine = this.tapBuy = this.tapCancel = false;
    if (input.hit('KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight') || tapLine) {
      this.lineIdx = (this.lineIdx + 1) % this.routes.length;
      this.sel = Math.min(this.sel, this.routes[this.lineIdx].stations.length - 1);
      this.renderMenu();
    }
    if (input.hit('KeyQ', 'Backspace') || tapCancel) { this.close(); return; }
    if (input.hit('KeyE', 'Enter') || tapBuy) {
      const to = this.routes[this.lineIdx].stations[this.sel];
      if (to.en === this.here.en) { this.hud.say('You\'re already here.', 1.5); return; }
      const from = this.here.line === to.line ? this.here : this.stationsByName(this.here.en).find((s) => s.line === to.line) || this.here;
      const legs = this.plan(from, to);
      const fare = FARE(this.stops(legs));
      if (missions.money < fare) { this.hud.say(`A token to ${to.en} is ₹${fare}. You can't afford it.`, 2.5); return; }
      missions.addMoney(-fare);
      this.audio.click?.();
      this.el.classList.remove('show');
      this.trip = { legs, leg: 0, dest: to };
      this.hud.say(`Token to ${to.en} (₹${fare}). ${legs.length > 1 ? 'Change at Majestic. ' : ''}Head up to the platform.`, 3.5);
      this.toPlatform(world);
    }
  }

  close() {
    this.el.classList.remove('show');
    this.state = null;
  }

  // ---------- platform ----------
  get leg() { return this.trip.legs[this.trip.leg]; }

  toPlatform(world) {
    const leg = this.leg, st = leg.from;
    // Stand on the side platform of the track this direction uses (left-hand running).
    const dx = st.dir.x * leg.dir, dz = st.dir.z * leg.dir;
    const lx = dz, lz = -dx; // left of travel
    this.stand = { x: st.x + lx * 6.4, z: st.z + lz * 6.4, y: st.platformY, fx: dx, fz: dz, lx, lz };
    this.state = 'platform';
    this.waitT = 0;
    this.train = null;
    const p = world.player;
    if (p.vehicle) p.exitVehicle(world, true);
    p.x = this.stand.x; p.z = this.stand.z; p.y = this.stand.y;
    p.heading = Math.atan2(-lx, -lz); // facing the track
    p.human.group.visible = true;
    p.human.group.position.set(p.x, p.y, p.z);
    p.human.group.rotation.set(0, p.heading, 0);
    this.camPos.set(p.x + lx * 3.5 - dx * 6, p.y + 2.4, p.z + lz * 3.5 - dz * 6);
    this.underground = st.underground;
  }

  // A train at this platform, doors open, going our way (or about to reverse into our way).
  trainHere() {
    const leg = this.leg;
    return this.metro.trains.find((t) => t.line === leg.line && t.at === leg.from && t.wait > 2.5 && (t.reverse ? -t.dir : t.dir) === leg.dir);
  }

  // Run the metro alone until `done()` (skipping time); returns seconds skipped.
  fastForward(done, world, limit = 2400) {
    let s = 0;
    while (s < limit && !done()) { this.metro.update(0.25, null); s += 0.25; }
    world.skipClock?.(s * 0.25); // time flies when you doze off on the metro
    return s;
  }

  // ---------- riding ----------
  board(t, world) {
    this.train = t;
    this.state = 'riding';
    world.player.human.group.visible = false;
    (this.audio.metroDoors || this.audio.click)?.call(this.audio);
    this.hud.say(`Doors closing. ${this.leg.line.name} towards ${this.leg.dir > 0 ? this.leg.line.stations[this.leg.line.stations.length - 1].en : this.leg.line.stations[0].en}.`, 3);
  }

  alight(world) {
    const trip = this.trip;
    trip.leg++;
    if (trip.leg < trip.legs.length) {
      this.hud.say('Change here for the ' + this.leg.line.name + '.', 3);
      this.toPlatform(world);
      return;
    }
    // Out to the street.
    const st = trip.dest;
    const e = (st.entrances && st.entrances[0]) || { x: st.x, z: st.z };
    const p = world.player;
    p.x = e.x; p.z = e.z; p.y = world.layout.groundHeight(e.x, e.z);
    p.vx = p.vz = p.vy = 0;
    p.human.group.visible = true;
    this.state = null;
    this.trip = null;
    this.train = null;
    this.banner.classList.remove('show');
    this.tunnel.style.opacity = 0;
    world.camRig.first = true;
    this.hud.toast(st.en, 'Namma Metro');
    world.reseed?.();
  }

  // ---------- per frame ----------
  update(dt, input, world, missions, camera) {
    if (this.state === 'menu') { this.menuInput(input, world, missions); this.followCamera(dt, world, camera, true); return; }
    const p = world.player;
    if (this.state === 'platform') {
      this.waitT += dt;
      p.x = this.stand.x; p.z = this.stand.z; p.y = this.stand.y;
      p.human.group.position.set(p.x, p.y, p.z);
      const t = this.trainHere();
      if (t) { this.board(t, world); return; }
      if (input.hit('KeyT')) { this.fastForward(() => !!this.trainHere(), world); }
      if (input.hit('KeyQ')) { this.hud.say('Leaving the station.', 1.5); this.trip.dest = this.leg.from; this.trip.leg = this.trip.legs.length - 1; this.alight(world); return; }
      this.setBanner(`Platform · ${this.leg.from.en}`, `Waiting for a ${this.leg.line.name} train towards ${this.terminusName()}…`, 'T skip wait · Q leave');
      this.followCamera(dt, world, camera);
      return;
    }
    if (this.state === 'riding') {
      const t = this.train, leg = this.leg;
      const atDest = () => t.at === leg.to && t.wait > 2;
      if (input.hit('KeyT')) this.fastForward(atDest, world);
      p.x = t.x; p.z = t.z; p.y = t.y;
      if (atDest()) { this.alight(world); return; }
      // Next stop.
      const next = leg.line.stations.filter((s) => (s.s - (t.s - t.dir * TRAIN_LEN / 2)) * t.dir > -1).sort((a, b) => (a.s - b.s) * t.dir)[0];
      const left = Math.abs(leg.to.idx - (next ? next.idx : leg.to.idx)) + 1;
      this.setBanner(`${leg.line.name} → ${leg.to.en}`, t.at ? `Now at ${t.at.en}` : `Next: ${next ? next.en : leg.to.en} · ${left} stop${left > 1 ? 's' : ''} to ${leg.to.en}`, 'T skip ride');
      this.tunnel.style.opacity = t.y < -2 && !t.at ? 0.88 : 0;
      this.followCamera(dt, world, camera);
    }
  }

  terminusName() {
    const l = this.leg.line;
    return this.leg.dir > 0 ? l.stations[l.stations.length - 1].en : l.stations[0].en;
  }

  setBanner(title, text, keys) {
    const html = `<b>${title}</b><span>${text}</span><em>${keys}</em>`;
    if (this._banner !== html) { this._banner = html; this.banner.innerHTML = html; }
    this.banner.classList.add('show');
    this.banner.style.setProperty('--c', '#' + (this.trip ? this.leg.line.color : 0x777777).toString(16).padStart(6, '0'));
  }

  followCamera(dt, world, camera, menu = false) {
    const p = world.player;
    const want = new THREE.Vector3(), look = new THREE.Vector3();
    if (this.state === 'riding') {
      const t = this.train;
      const mid = t.s - t.dir * TRAIN_LEN / 2;
      const inStation = t.line.stations.some((st) => Math.abs(st.s - mid) < 50);
      if (inStation && t.y > -2) {
        // Under the station roof: watch from the platform (left of travel).
        want.set(t.x - t.hx * (TRAIN_LEN / 2 + 4) + t.hz * 4.5, t.y + 1.9, t.z - t.hz * (TRAIN_LEN / 2 + 4) - t.hx * 4.5);
        look.set(t.x + t.hx * 8, t.y + 1.2, t.z + t.hz * 8);
      } else if (t.y < -2) {
        // Underground: stay low, inside the hall or tunnel.
        want.set(t.x - t.hx * (TRAIN_LEN / 2 + 6) + t.hz * 3.2, t.y + 2.4, t.z - t.hz * (TRAIN_LEN / 2 + 6) - t.hx * 3.2);
        look.set(t.x + t.hx * 10, t.y + 1.2, t.z + t.hz * 10);
      } else {
        want.set(t.x - t.hx * (TRAIN_LEN / 2 + 22) + t.hz * 10, t.y + 10, t.z - t.hz * (TRAIN_LEN / 2 + 22) - t.hx * 10);
        look.set(t.x + t.hx * 14, t.y + 1, t.z + t.hz * 14);
      }
    } else if (this.state === 'platform') {
      const s = this.stand;
      want.set(s.x + s.lx * 3.2 - s.fx * 7, s.y + 2.6, s.z + s.lz * 3.2 - s.fz * 7);
      look.set(s.x - s.lx * 2 + s.fx * 18, s.y + 1.2, s.z - s.lz * 2 + s.fz * 18);
    } else if (menu) {
      return; // the normal follow camera holds still behind the menu
    }
    const k = Math.min(1, dt * 3);
    this.camPos.lerp(want, this.camPos.distanceTo(want) > 60 ? 1 : k);
    this.camLook.lerp(look, this.camLook.distanceTo(look) > 60 ? 1 : k);
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
  }
}
