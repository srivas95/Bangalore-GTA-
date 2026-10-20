// Getting around without wheels of your own. Wave down an auto from any roadside (H), tell the
// driver where to go and pay the meter; or catch a BMTC bus at one of the shelters along its
// route (E at the stop), buy a ticket from the conductor and ride it stop by stop. Both are driven
// by the traffic AI through the real traffic, with the camera following. T skips ahead.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planDrive, planNodes, nodesToEdges, sAlong } from './route.js';
import { autoFare } from './autoDuty.js';
import { poseSit, poseHail, poseIdle, animateWalk } from '../entities/human.js';
import { DISTRICTS, SCALE } from '../world/mapdata.js';
import { SIDEWALK_W, LINES } from '../config.js';

// Route number, from, to (both directions run). Numbers after real BMTC routes.
const BUS_ROUTES = [
  ['500D', 'Hebbal', 'Silk Board'],
  ['335E', 'Majestic', 'Whitefield'],
  ['13', 'Majestic', 'Banashankari'],
  ['201', 'Shivajinagar', 'Koramangala'],
  ['252', 'Majestic', 'Yeshwanthpur'],
  ['G-3', 'Majestic', 'Electronic City Road'],
  ['226', 'Vijayanagar', 'Indiranagar'],
  ['401', 'Yelahanka', 'Majestic'],
  ['KBS-8', 'Majestic', 'Jayanagar'],
];
const STOP_EVERY = 380;
const STOP_SUFFIX = [' Main Road', ' Cross', ' Market', ' Circle', ' Post Office', ' Temple', ' Park', ' 2nd Stage', ' Signal', ' Bus Depot'];
// Ordinary BMTC fares by stage (2 km each).
const busFare = (metres) => Math.min(30, 6 * Math.max(1, Math.ceil((metres * SCALE) / 2000)));
const realKm = (m) => ((m * SCALE) / 1000).toFixed(1);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class Rides {
  constructor(scene, layout, traffic, hud, audio, missions, gps, colliders) {
    this.scene = scene;
    this.layout = layout;
    this.traffic = traffic;
    this.hud = hud;
    this.audio = audio;
    this.missions = missions;
    this.gps = gps;
    this.colliders = colliders;
    this.state = null; // 'hail' | 'menu' | 'board' | 'ride' | 'stopMenu' | 'wait' | 'busBoard' | 'busRide' | 'alight'
    this.camPos = new THREE.Vector3();
    this.buildRoutes();
    this.buildShelters();
    this.buildDom();
  }

  get active() { return this.state !== null; }
  // Aboard (the player is carried, not walking).
  get carrying() { return this.state === 'ride' || this.state === 'busRide' || this.state === 'board' || this.state === 'busBoard'; }

  // ---------- BMTC network ----------
  buildRoutes() {
    const L = this.layout, byName = new Map(DISTRICTS.map((d) => [d.name, d]));
    this.routes = [];
    for (const [num, a, b] of BUS_ROUTES) {
      const A = byName.get(a), B = byName.get(b);
      if (!A || !B) continue;
      for (const [from, to] of [[A, B], [B, A]]) {
        const r = planNodes(L, from.x, from.z, to.x, to.z);
        const edges = r && nodesToEdges(r.nodes);
        if (!edges || edges.length < 3) continue;
        this.routes.push({ num, from: from.name, to: to.name, edges, stops: [] });
      }
    }
  }

  // Stops every few hundred metres on the left kerb, with a shelter on the footpath. Routes
  // sharing a stretch of road share the shelters.
  buildShelters() {
    this.shelters = [];
    const named = new Map();
    for (const route of this.routes) {
      let next = 60, dist = 0;
      route.edges.forEach((e, i) => {
        const pathLen = Math.max(0, e.len - Math.min(e.cutFrom + 1.5, e.len * 0.45) - Math.min(e.cutTo + 1.5, e.len * 0.45));
        while (next < dist + pathLen - 10) {
          const s = Math.max(10, next - dist);
          const st = this.addStop(route, i, e, s, named);
          if (st) route.stops.push(st);
          next += STOP_EVERY;
        }
        dist += pathLen;
        route.length = dist;
      });
      // Distance along the route to each stop, for fares and waiting times.
      let acc = 0;
      const startOf = [];
      for (const e of route.edges) { startOf.push(acc); acc += Math.max(0, e.len - Math.min(e.cutFrom + 1.5, e.len * 0.45) - Math.min(e.cutTo + 1.5, e.len * 0.45)); }
      for (const st of route.stops) st.at = startOf[st.idx] + st.s;
    }
    this.buildShelterMeshes();
  }

  addStop(route, idx, e, s, named) {
    const a = Math.min(e.cutFrom + 1.5, e.len * 0.45);
    const lx = e.dir.z, lz = -e.dir.x;
    const off = e.road.width / 2 + SIDEWALK_W * 0.55;
    for (const ds of [0, 15, -15, 30]) {
      const ss = s + ds;
      if (ss < 8 || ss > e.len - a - 8) continue;
      const cx = e.from.x + e.dir.x * (a + ss), cz = e.from.z + e.dir.z * (a + ss);
      const x = cx + lx * off, z = cz + lz * off;
      if (this.colliders.pointBlocked(x, z, 0.5)) continue;
      // Share an existing shelter on the same side of the same road.
      let sh = this.shelters.find((q) => Math.hypot(q.x - x, q.z - z) < 30 && q.lx * lx + q.lz * lz > 0.7);
      if (!sh) {
        sh = { x, z, lx, lz, name: this.stopName(x, z, named), serves: [] };
        this.shelters.push(sh);
      }
      const st = { route, idx, edge: e, s: ss, shelter: sh };
      sh.serves.push(st);
      return st;
    }
    return null;
  }

  // A named junction gives its name to the first stop there; other stops take the district's
  // name, then the district's with a suffix ("Jayanagar Main Road", "Jayanagar Cross", ...).
  stopName(x, z, named) {
    let junction = null, bd = 120;
    for (const n of this.layout.nodes) { if (!n.name) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; junction = n.name.replace(/ junction$/i, ''); } }
    const district = this.layout.blockAt(x, z)?.district || 'Bengaluru';
    for (const base of [junction, district]) if (base && !named.has(base)) { named.set(base, 1); return base; }
    const k = named.get(district);
    named.set(district, k + 1);
    const ok = STOP_SUFFIX.filter((sfx) => !district.includes(sfx.trim()));
    return k <= ok.length ? district + ok[k - 1] : `${district} Stop ${k}`;
  }

  buildShelterMeshes() {
    // One shelter, local +z facing the road: a blue roof on three posts, an advert panel, side
    // screens, a steel bench and a BMTC sign on a pole.
    const parts = [];
    const box = (w, h, d, x, y, z, col) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      const c = new THREE.Color(col), n = g.attributes.position.count, cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      parts.push(g);
    };
    box(4.4, 0.1, 2.0, 0, 2.55, 0.05, 0x1f5fae);
    for (const x of [-2, 0, 2]) box(0.09, 2.5, 0.09, x, 1.25, -0.85, 0x9aa0a6);
    box(4.0, 1.7, 0.05, 0, 1.45, -0.86, 0xe9e2cf);
    box(1.6, 1.2, 0.06, -1.0, 1.5, -0.82, 0xd8452a);
    box(1.6, 1.2, 0.06, 1.0, 1.5, -0.82, 0x2a8a4a);
    for (const x of [-2.12, 2.12]) box(0.04, 1.5, 1.0, x, 1.35, -0.38, 0x8fb2c4);
    box(3.2, 0.06, 0.45, 0, 0.5, -0.55, 0x8a8f96);
    for (const x of [-1.4, 1.4]) box(0.06, 0.5, 0.4, x, 0.25, -0.55, 0x6a6e72);
    box(0.07, 3.0, 0.07, 2.7, 1.5, 0.85, 0x9aa0a6);
    box(0.7, 0.45, 0.05, 2.7, 2.75, 0.85, 0x1f4ea8);
    box(0.5, 0.1, 0.06, 2.7, 2.75, 0.88, 0xffffff);
    const geo = mergeGeometries(parts);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.shelters.length));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    this.shelters.forEach((sh, i) => {
      const y = this.layout.groundHeight(sh.x, sh.z, 2);
      q.setFromAxisAngle(up, Math.atan2(-sh.lx, -sh.lz));
      m.compose(p.set(sh.x, y, sh.z), q, one);
      mesh.setMatrixAt(i, m);
      // Behind the bench is solid; the front is open.
      const bx = sh.x - sh.lx * 0.85, bz = sh.z - sh.lz * 0.85;
      this.colliders.addOriented(bx, bz, 2.2, 0.15, Math.atan2(-sh.lx, -sh.lz), 2.6, 'shelter');
    });
    mesh.count = this.shelters.length;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.shelterMesh = mesh;
  }

  nearShelter(p) {
    let best = null, bd = 4;
    for (const sh of this.shelters) { const d = Math.hypot(sh.x - p.x, sh.z - p.z); if (d < bd) { bd = d; best = sh; } }
    return best;
  }

  // Shelters near you, for the minimap.
  mapMarkers(x, z) {
    const out = [];
    for (const sh of this.shelters) if (Math.abs(sh.x - x) < 220 && Math.abs(sh.z - z) < 220) out.push({ x: sh.x, z: sh.z, color: '#2fa8ff', small: true });
    return out;
  }

  // ---------- menus and banner ----------
  buildDom() {
    const el = document.createElement('div');
    el.id = 'ride-menu';
    el.innerHTML = '<div class="mm-head"><span class="mm-logo"></span> <b class="rm-title"></b><div class="mm-sub"></div></div><div class="mm-lines"></div><div class="mm-foot"></div>';
    document.getElementById('hud').appendChild(el);
    el.addEventListener('click', (e) => {
      const row = e.target.closest('.mm-st');
      if (row && !row.classList.contains('hdr')) { this.sel = +row.dataset.i; this.tapPick = true; return; }
      if (e.target.closest('.mm-foot')) this.tapCancel = true;
    });
    this.menuEl = el;
    const banner = document.createElement('div');
    banner.id = 'ride-banner';
    document.getElementById('hud').appendChild(banner);
    this.banner = banner;
  }

  openMenu(logo, title, sub, items, foot) {
    this.items = items;
    this.sel = items.findIndex((i) => !i.header);
    const el = this.menuEl;
    el.querySelector('.mm-logo').textContent = logo;
    el.querySelector('.rm-title').textContent = title;
    el.querySelector('.mm-sub').textContent = sub;
    el.querySelector('.mm-foot').innerHTML = `${foot} <u>(tap here to cancel)</u>`;
    el.classList.add('show');
    this.renderMenu();
  }

  renderMenu() {
    const rows = this.items.map((it, i) => it.header
      ? `<div class="mm-title" style="--c:${it.color || '#1f4ea8'}">${it.text}</div>`
      : `<div data-i="${i}" class="mm-st${i === this.sel ? ' sel' : ''}"><span class="mm-dot" style="border-color:${it.color || '#e0b000'}"></span><span class="mm-name">${it.text}${it.sub ? `<small>${it.sub}</small>` : ''}</span><span class="mm-fare">${it.fare || ''}</span></div>`);
    this.menuEl.querySelector('.mm-lines').innerHTML = rows.join('');
    this.menuEl.querySelector('.mm-st.sel')?.scrollIntoView({ block: 'nearest' });
  }

  // W/S to move, E to pick, Q to cancel. Returns the picked item, 'cancel', or null.
  menuInput(input) {
    const step = (d) => {
      let i = this.sel;
      do { i = (i + d + this.items.length) % this.items.length; } while (this.items[i].header);
      this.sel = i;
      this.renderMenu();
    };
    if (input.hit('KeyW', 'ArrowUp')) step(-1);
    if (input.hit('KeyS', 'ArrowDown')) step(1);
    const pickT = this.tapPick, cancelT = this.tapCancel;
    this.tapPick = this.tapCancel = false;
    if (input.hit('KeyQ', 'Backspace') || cancelT) return 'cancel';
    if (input.hit('KeyE', 'Enter') || pickT) return this.items[this.sel];
    return null;
  }

  closeMenu() { this.menuEl.classList.remove('show'); }

  setBanner(color, title, text, keys) {
    const html = `<b>${title}</b><span>${text}</span><em>${keys}</em>`;
    if (this._banner !== html) { this._banner = html; this.banner.innerHTML = html; }
    this.banner.style.setProperty('--c', color);
    this.banner.classList.add('show');
  }

  // ---------- autos ----------
  // On a road or its footpath (somewhere an auto could pull in)?
  roadside(p) {
    const h = this.layout.edgeAt(p.x, p.z);
    return h && h.e.dirs && h.d <= h.e.r.width / 2 + SIDEWALK_W + 1.5 ? h : null;
  }

  // H on foot: wave down an auto from the roadside.
  hailAuto(world) {
    const p = world.player;
    if (world.police.level > 0) { this.hud.say('No auto will stop for someone with the police after them.', 3); return; }
    const h = this.roadside(p);
    if (!h) { this.hud.say('Walk to the roadside to wave down an auto.', 2.5); return; }
    // The direction of travel that has you on its left kerb (India keeps left).
    const [d1, d2] = h.e.dirs;
    const px = h.e.a.x + (h.e.b.x - h.e.a.x) * h.t, pz = h.e.a.z + (h.e.b.z - h.e.a.z) * h.t;
    const side = (d) => (p.x - px) * d.dir.z + (p.z - pz) * -d.dir.x;
    const d = side(d1) >= side(d2) ? d1 : d2;
    const stopS = sAlong(d, p.x, p.z);
    // Bring one in from 45-odd metres back, round the corner if need be.
    let edge = d, s = stopS - 45, route = [];
    if (s < 0) {
      const ins = d.from.out.map((e) => e.rev).filter((e) => e && e !== d.rev);
      if (ins.length) {
        edge = pick(ins);
        const len = edge.len - Math.min(edge.cutFrom + 1.5, edge.len * 0.45) - Math.min(edge.cutTo + 1.5, edge.len * 0.45);
        s = Math.max(0, len + s);
        route = [d];
      } else s = 0;
    }
    if (edge === d && stopS - s < 12) { this.hud.say('No autos coming this way. Try further along the road.', 2.5); return; }
    const a = this.traffic.spawnOn('auto', edge, s);
    a.keep = true;
    a.route = route;
    a.stop = { edge: d, s: stopS };
    a.cruise = Math.max(a.cruise, 7);
    a.wrongProne = false;
    this.agent = a;
    this.kind = 'auto';
    this.state = 'hail';
    this.t = 0;
    this.standX = p.x; this.standZ = p.z;
    this.faceRoad = Math.atan2(px - p.x, pz - p.z);
    this.hud.say('You stick your arm out: "Auto!"', 2);
    this.audio.voice?.('vo_kn_he', { gender: 'm' });
  }

  autoMenu(world) {
    const v = this.agent.v, items = [];
    const est = (x, z) => autoFare(Math.hypot(x - v.x, z - v.z) * 1.3, world.hour);
    if (this.gps.target) {
      const t = this.gps.target;
      items.push({ text: '📍 Your map waypoint', sub: `${realKm(Math.hypot(t.x - v.x, t.z - v.z) * 1.3)} km`, fare: `~₹${Math.round(est(t.x, t.z))}`, x: t.x, z: t.z, name: 'your waypoint' });
    }
    const places = DISTRICTS.map((d) => ({ d, dist: Math.hypot(d.x - v.x, d.z - v.z) })).filter((q) => q.dist > 180).sort((a, b) => a.dist - b.dist);
    for (const { d, dist } of places) items.push({ text: d.name, sub: `${realKm(dist * 1.3)} km`, fare: `~₹${Math.round(est(d.x, d.z))}`, x: d.x, z: d.z, name: d.name });
    this.openMenu('🛺', 'AUTO', `Driver: "${pick(['Ellige saar?', 'Yelli hogbeku?', 'Where to, saar?'])}"`, items, 'W/S choose · E go · Q never mind');
    this.audio.voice?.('vo_kn_elli', { gender: 'm' });
  }

  chooseAuto(item, world) {
    const a = this.agent, v = a.v;
    const far = Math.hypot(item.x - v.x, item.z - v.z) > 1900;
    if (far && Math.random() < 0.3) {
      this.hud.say(`Driver: "${item.name}? Illa saar, return sikkalla." He drives off.`, 3.5);
      this.audio.voice?.('vo_kn_illa', { gender: 'm' });
      this.release();
      return;
    }
    const plan = planDrive(this.layout, a.edge, a.s, item.x, item.z);
    if (!plan) { this.hud.say('Driver: "Gothilla saar, that place." He shrugs.', 2.5); this.release(); return; }
    this.extra = Math.random() < 0.25 ? 20 : 0;
    if (this.extra) this.hud.say(`Driver: "${pick(['Meter mele twenty kodi, saar.', 'Twenty extra, traffic jaasti.', LINES.autoDriver[2]])}" You shrug and get in.`, 3.5);
    else this.hud.say(`Driver: "${pick(['Sari, kooti.', 'Baa, hogona.', 'OK saar, sit.'])}"`, 2.5);
    this.audio.voice?.('vo_kn_sari', { gender: 'm' });
    this.dest = { ...item, plan };
    this.metres = 0;
    this.lastX = v.x; this.lastZ = v.z;
    this.boardStart(world);
  }

  // ---------- buses ----------
  stopMenu(sh, world) {
    if (world.police.level > 0) { this.hud.say('The conductor eyes the police behind you and waves the bus on.', 3); return; }
    const items = [];
    for (const st of sh.serves) {
      const r = st.route, k = r.stops.indexOf(st);
      const later = r.stops.slice(k + 1);
      if (!later.length) continue;
      items.push({ header: true, text: `${r.num} → ${r.to}` });
      for (const q of later) items.push({ text: q.shelter.name, sub: `${realKm(q.at - st.at)} km`, fare: `₹${busFare(q.at - st.at)}`, from: st, to: q });
    }
    if (!items.length) { this.hud.say('End of the line here. Try the stop across the road.', 2.5); return; }
    this.shelter = sh;
    this.kind = 'bus';
    this.state = 'stopMenu';
    this.openMenu('🚌', `BMTC · ${sh.name}`, 'ಬಿಎಂಟಿಸಿ · Pick your stop', items, 'W/S choose · E wait for the bus · Q cancel');
  }

  chooseBus(item, world) {
    const fare = busFare(item.to.at - item.from.at);
    if (this.missions.money < fare) { this.hud.say(`A ticket is ₹${fare}. You can't afford it.`, 2.5); return false; }
    this.trip = { from: item.from, to: item.to, route: item.from.route, fare };
    this.state = 'wait';
    this.t = 0;
    const p = world.player;
    this.standX = p.x; this.standZ = p.z;
    this.faceRoad = Math.atan2(-this.shelter.lx, -this.shelter.lz);
    this.spawnBus(220);
    this.hud.say(`Waiting for the ${this.trip.route.num} to ${this.trip.route.to}.`, 3);
    return true;
  }

  // Put the trip's bus on its route `back` metres before our stop, stopping at every stop.
  spawnBus(back) {
    this.freeAgent();
    const r = this.trip.route, st = this.trip.from;
    let i = st.idx, s = st.s - back;
    const pathLen = (e) => Math.max(0, e.len - Math.min(e.cutFrom + 1.5, e.len * 0.45) - Math.min(e.cutTo + 1.5, e.len * 0.45));
    while (s < 0 && i > 0) { i--; s += pathLen(r.edges[i]); }
    s = Math.max(0, s);
    const a = this.traffic.spawnOn('bus', r.edges[i], s);
    a.keep = true;
    a.route = r.edges.slice(i + 1);
    a.cruise = Math.max(a.cruise, 8);
    this.agent = a;
    this.busStops = r.stops.filter((q) => q.idx > i || (q.idx === i && q.s > s + 3));
    this.nextBusStop();
  }

  nextBusStop() {
    const q = this.busStops.shift();
    this.agent.stop = q ? { edge: q.edge, s: q.s, q } : null;
    this.agent.stopped = false;
    this.dwell = 0;
  }

  // ---------- boarding, riding, getting off ----------
  boardStart(world) {
    this.closeMenu();
    this.state = this.kind === 'bus' ? 'busBoard' : 'board';
    this.t = 0;
    const p = world.player;
    this.fromX = p.x; this.fromZ = p.z;
    this.agent.hold = true;
  }

  doorPoint() {
    const v = this.agent.v, lx = Math.cos(v.heading), lz = -Math.sin(v.heading), fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const fwd = this.kind === 'bus' ? v.spec.length / 2 - 1.6 : -0.2;
    return { x: v.x + lx * (v.spec.width / 2 + 0.45) + fx * fwd, z: v.z + lz * (v.spec.width / 2 + 0.45) + fz * fwd };
  }

  seatPlayer(world) {
    const h = world.player.human, v = this.agent.v;
    if (this.kind === 'auto') {
      poseSit(h);
      h.group.position.set(0, -0.05, -0.62);
      h.group.rotation.set(0, 0, 0);
      v.model.body.add(h.group);
    } else h.group.visible = false;
  }

  alight(world, x, z) {
    const p = world.player, h = p.human, a = this.agent;
    this.scene.add(h.group);
    h.group.visible = true;
    h.group.rotation.set(0, 0, 0);
    poseIdle(h, 0);
    p.x = x; p.z = z; p.y = this.layout.groundHeight(x, z, 2);
    p.vx = p.vz = p.vy = 0;
    p.heading = a ? a.v.heading : p.heading;
    h.group.position.set(p.x, p.y, p.z);
    world.camRig.first = true;
    this.release();
  }

  // Let the vehicle go back to being ordinary traffic.
  freeAgent() {
    const a = this.agent;
    if (a) { a.keep = false; a.stop = null; a.route = null; a.hold = false; a.stopped = false; a.rush = false; }
    this.agent = null;
  }

  // Give up on a ride that hasn't started (or has just ended).
  release() {
    this.freeAgent();
    this.state = null;
    this.closeMenu();
    this.banner.classList.remove('show');
  }

  abort(world) {
    if (!this.state) return;
    if (this.carrying) {
      const v = this.agent?.v;
      this.alight(world, v ? v.x : world.player.x, v ? v.z : world.player.z);
    } else this.release();
  }

  pay(world, amount, what) {
    const m = this.missions;
    if (m.money >= amount) { m.addMoney(-amount); this.audio.cash?.(); this.hud.toast(`−₹${amount}`, what); return; }
    const had = m.money;
    m.addMoney(-had);
    this.hud.toast(`−₹${had}`, `${what} (₹${amount - had} short)`);
    this.hud.say('You\'re short. The driver takes everything you have and tells you what he thinks of you.', 3.5);
  }

  // ---------- per frame ----------
  // Returns a stand-in for the camera to follow while aboard, else null.
  update(dt, input, world) {
    const p = world.player, h = p.human, t = performance.now() / 1000;
    this.t += dt;
    const a = this.agent;
    // The vehicle was taken away (stolen by someone else, despawned): give up.
    if (a && !this.traffic.agents.includes(a)) { this.hud.say('Your ride has gone.', 2); this.abort(world); return null; }
    const moved = input.down('KeyW') || input.down('KeyA') || input.down('KeyS') || input.down('KeyD');
    switch (this.state) {
      case 'hail': {
        h.group.position.set(p.x, p.y, p.z);
        h.group.rotation.y = p.heading = this.faceRoad;
        poseHail(h, t);
        if (a.stopped) { a.hold = true; this.state = 'menu'; this.autoMenu(world); break; }
        if (input.hit('KeyQ') || moved || this.t > 45) { if (this.t > 45) this.hud.say('No luck. The autos all have passengers.', 2.5); this.release(); break; }
        this.setBanner('#e0b000', '🛺 Waving down an auto', a.stopped ? '' : 'One is pulling in…', 'Q / move to give up');
        break;
      }
      case 'menu': {
        h.group.position.set(p.x, p.y, p.z);
        poseIdle(h, t);
        this.banner.classList.remove('show');
        const r = this.menuInput(input);
        if (r === 'cancel') { this.hud.say('Driver: "Sari." He pulls away.', 2); this.release(); } else if (r) this.chooseAuto(r, world);
        break;
      }
      case 'stopMenu': {
        h.group.position.set(p.x, p.y, p.z);
        poseIdle(h, t);
        const r = this.menuInput(input);
        if (r === 'cancel') { this.state = null; this.closeMenu(); } else if (r) { if (this.chooseBus(r, world)) this.closeMenu(); }
        break;
      }
      case 'wait': {
        h.group.position.set(p.x, p.y, p.z);
        h.group.rotation.y = p.heading = this.faceRoad;
        poseIdle(h, t);
        const st = this.trip.from;
        if (a.stopped && a.stop?.q === st) { this.pay(world, this.trip.fare, `BMTC ${this.trip.route.num} ticket`); this.boardStart(world); break; }
        if (a.stopped) { this.dwell += dt; if (this.dwell > 3) this.nextBusStop(); }
        if (input.hit('KeyT')) this.spawnBus(35);
        if (input.hit('KeyQ') || moved) { this.release(); break; }
        const away = Math.max(0, st.at - this.routeAt(a));
        this.setBanner('#1f4ea8', `🚌 ${st.shelter.name}`, `${this.trip.route.num} to ${this.trip.route.to}: ${away < 40 ? 'arriving' : `${Math.max(1, Math.round(away / 150))} min away`}`, 'T skip the wait · Q / move to give up');
        break;
      }
      case 'board':
      case 'busBoard': {
        const door = this.doorPoint(), k = Math.min(1, this.t / 1.1);
        p.x = this.fromX + (door.x - this.fromX) * k; p.z = this.fromZ + (door.z - this.fromZ) * k;
        h.group.position.set(p.x, p.y, p.z);
        h.group.rotation.y = Math.atan2(door.x - this.fromX, door.z - this.fromZ);
        animateWalk(h, dt, 1.8);
        if (k >= 1) {
          this.seatPlayer(world);
          a.hold = false;
          if (this.kind === 'auto') {
            a.route = this.dest.plan.route;
            a.stop = { edge: this.dest.plan.stopEdge, s: this.dest.plan.stopS };
            a.stopped = false;
            // With a fare on board, the driver floors it: flat out, quick round corners, through
            // the end of the amber and the start of the red.
            a.rush = true;
            a.cruise = a.v.spec.maxSpeed * 1.3;
            a.jumper = true;
            this.state = 'ride';
          } else {
            this.state = 'busRide';
            this.dwell = 0;
            this.hud.say(`Conductor: "${pick(['Ticket, ticket! Munde banni!', 'Hattiri, hattiri! Swalpa munde hogi!', 'Change illa, saar. UPI maadi.'])}"`, 3);
            this.audio.voice?.('sfx_whistle', {});
            this.audio.voice?.('vo_hi_tikat', { vol: 0.8 });
          }
          this.t = 0;
        }
        break;
      }
      case 'ride': return this.rideAuto(dt, input, world);
      case 'busRide': return this.rideBus(dt, input, world);
    }
    return null;
  }

  // Distance along the trip's route of a bus agent (approximate: by edge).
  routeAt(a) {
    const r = this.trip.route;
    let acc = 0;
    for (const e of r.edges) {
      const len = Math.max(0, e.len - Math.min(e.cutFrom + 1.5, e.len * 0.45) - Math.min(e.cutTo + 1.5, e.len * 0.45));
      if (e === a.edge) return acc + (a.turning ? 0 : a.s);
      acc += len;
    }
    return 0;
  }

  follow(world) {
    const v = this.agent.v, p = world.player;
    p.x = v.x; p.z = v.z; p.y = v.y;
    return this._cam || (this._cam = { get vehicle() { return this.v; }, v: null, x: 0, y: 0, z: 0, aiming: false, set(vv) { this.v = vv; this.x = vv.x; this.y = vv.y; this.z = vv.z; return this; } });
  }

  rideAuto(dt, input, world) {
    const a = this.agent, v = a.v;
    this.metres += Math.hypot(v.x - this.lastX, v.z - this.lastZ);
    this.lastX = v.x; this.lastZ = v.z;
    const fare = autoFare(this.metres, world.hour);
    // Knocked off the route, or missed the turn: the driver finds another way.
    const lost = a.route === null || (!a.turning && a.route.length === 0 && a.edge !== a.stop?.edge) || (a.edge === a.stop?.edge && !a.turning && a.s > a.stop.s + 4 && !a.stopped);
    if (lost && !a.turning && this.dest) {
      const plan = planDrive(this.layout, a.edge, a.s, this.dest.x, this.dest.z);
      if (plan) { a.route = plan.route; a.stop = { edge: plan.stopEdge, s: plan.stopS }; }
    }
    if (input.hit('KeyF', 'KeyE') && !this.stopping) {
      this.stopping = true;
      this.hud.say('You: "Illi nillisi, anna." (Stop here.)', 2);
      this.audio.voice?.('vo_kn_nillisi', { gender: 'm' });
    }
    if (this.stopping && !a.turning && (!a.stop || a.stop.edge !== a.edge || a.stop.s > a.s + 12)) a.stop = { edge: a.edge, s: Math.min(a.path.length - 1, a.s + 10) };
    if (input.hit('KeyT') && this.dest) this.skipTo(world, a.stop.edge, a.stop.s, () => { this.metres += Math.hypot(this.dest.x - v.x, this.dest.z - v.z) * 1.3; });
    if (a.stopped) {
      const total = Math.round(autoFare(this.metres, world.hour)) + this.extra;
      this.pay(world, total, `Auto: meter ₹${total - this.extra}${this.extra ? ' + ₹20' : ''}`);
      this.hud.say(`Driver: "${pick(['Sari saar, banni.', 'Thank you saar.', 'Bartini saar.'])}"`, 2.5);
      this.audio.voice?.('vo_kn_sari', { gender: 'm' });
      const lx = Math.cos(v.heading), lz = -Math.sin(v.heading);
      this.stopping = false;
      this.dest = null;
      this.alight(world, v.x + lx * 1.5, v.z + lz * 1.5);
      return null;
    }
    const left = this.dest ? Math.hypot(this.dest.x - v.x, this.dest.z - v.z) : 0;
    this.setBanner('#e0b000', `🛺 Auto${this.dest ? ` to ${this.dest.name}` : ''}`, `Meter ₹${fare.toFixed(1)}${this.extra ? ' (+₹20)' : ''} · ${realKm(this.metres)} km${this.stopping ? ' · pulling over' : ` · ${realKm(left)} km to go`}`, 'T skip ride · F stop here');
    return this.follow(world).set(v);
  }

  rideBus(dt, input, world) {
    const a = this.agent, v = a.v, trip = this.trip;
    const at = a.stop?.q;
    if (a.stopped) {
      this.dwell += dt;
      if (at === trip.to || (this.getOff && this.dwell > 0.5)) {
        this.hud.say(`${at ? at.shelter.name : 'Your stop'}. You hop off.`, 2);
        const sh = at?.shelter;
        const lx = Math.cos(v.heading), lz = -Math.sin(v.heading), fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        const x = sh ? sh.x + sh.lx * 0.2 : v.x + lx * 2.2 + fx * (v.spec.length / 2 - 1.6);
        const z = sh ? sh.z + sh.lz * 0.2 : v.z + lz * 2.2 + fz * (v.spec.length / 2 - 1.6);
        this.getOff = false;
        this.trip = null;
        this.alight(world, x, z);
        return null;
      }
      if (this.dwell > 3.5) { this.nextBusStop(); this.audio.voice?.('sfx_whistle', {}); }
    }
    if (input.hit('KeyE', 'KeyF') && !this.getOff) { this.getOff = true; this.hud.say('You ring the bell: next stop.', 2); }
    if (input.hit('KeyT')) {
      const to = trip.to;
      this.busStops = [];
      this.skipTo(world, to.edge, to.s, () => {});
      a.stop = { edge: to.edge, s: to.s, q: to };
      a.route = trip.route.edges.slice(to.idx + 1);
    }
    const next = a.stop?.q;
    const n = next ? trip.route.stops.indexOf(trip.to) - trip.route.stops.indexOf(next) : 0;
    this.setBanner('#1f4ea8', `🚌 ${trip.route.num} → ${trip.route.to}`, `${a.stopped && at ? `At ${at.shelter.name}` : `Next: ${next ? next.shelter.name : trip.to.shelter.name}`} · ${n <= 0 ? 'your stop' : `${n + 1} stops to ${trip.to.shelter.name}`}`, `T skip to your stop · E get off at the ${this.getOff ? 'next stop ✓' : 'next stop'}`);
    return this.follow(world).set(v);
  }

  // Doze off and wake up just short of the stop: move the vehicle there, wind the clock on.
  skipTo(world, edge, s, before) {
    const a = this.agent, v = a.v;
    const d = Math.hypot(edge.from.x + edge.dir.x * s - v.x, edge.from.z + edge.dir.z * s - v.z) * 1.3;
    before();
    const lane = a.lane < edge.road.lanes ? a.lane : edge.road.lanes - 1;
    a.edge = edge; a.lane = lane; a.path = this.traffic.edgePath(edge, lane); a.turning = false;
    a.s = Math.max(0, s - 1); a.speed = 0; a.route = [];
    const q = a.path.points, k = Math.min(1, a.s / a.path.length);
    v.x = q[0].x + (q[q.length - 1].x - q[0].x) * k; v.z = q[0].z + (q[q.length - 1].z - q[0].z) * k;
    v.heading = Math.atan2(edge.dir.x, edge.dir.z);
    a.lat = a.latTarget = this.traffic.kerbLat(a);
    world.skipClock?.(d / 7);
    world.player.x = v.x; world.player.z = v.z;
    world.reseed?.();
    world.camRig.first = true;
    this.lastX = v.x; this.lastZ = v.z;
    this.hud.say('You doze off…', 1.5);
  }
}
