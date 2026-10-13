import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Layout } from './world/layout.js';
import { buildCity } from './world/city.js';
import { buildMetro } from './world/metro.js';
import { Colliders } from './systems/colliders.js';
import { Input } from './systems/input.js';
import { CameraRig } from './systems/cameraRig.js';
import { Audio } from './systems/audio.js';
import { Missions } from './systems/missions.js';
import { Signals } from './systems/signals.js';
import { Police } from './systems/police.js';
import { Environment } from './systems/environment.js';
import { Traffic } from './entities/traffic.js';
import { StreetLife } from './entities/pedestrians.js';
import { Player } from './entities/player.js';
import { Vehicle, damageFromSpeed } from './entities/vehicle.js';
import { Particles } from './systems/particles.js';
import { Pickups, WEAPONS } from './systems/weapons.js';
import { Gangs } from './entities/gangs.js';
import { HUD } from './ui/hud.js';
import { MetroRide } from './systems/metroRide.js';
import { Story } from './systems/story.js';
import { Settings, PRESETS } from './systems/settings.js';
import { TouchControls } from './ui/touch.js';
import { Garages } from './systems/garages.js';
import { LINES, CURB_H } from './config.js';
import { POLICE_STATIONS as PS, HOSPITALS as HS, SPAWN, WORLD, geo } from './world/mapdata.js';
import { DETAIL, setDetail } from './world/detail.js';
import { bakeAO, aoUniforms } from './world/ao.js';
import { BlobShadows } from './world/blobs.js';
import { GPS } from './systems/gps.js';
import { Halos } from './world/halos.js';

const BOOT_KEY = 'namma-bengaluru-boot';

async function init() {
  // Wait for the Kannada font so the canvas-painted signs render the script.
  try { await Promise.race([document.fonts.load('26px "Noto Sans Kannada"'), document.fonts.load('40px "Oswald"'), new Promise((r) => setTimeout(r, 2500))]); } catch { /* offline */ }

  // World detail is fixed at build time. If the last start never got as far as drawing the city
  // (a phone running out of memory kills the page), step down a level automatically.
  const settings = new Settings();
  let level = settings.detailLevel, fellBack = false;
  try {
    if (localStorage.getItem(BOOT_KEY) === 'starting' && level !== 'min') {
      level = level === 'full' ? 'lite' : 'min';
      fellBack = true;
      settings.set({ detail: level, quality: 'low', ...PRESETS.low }, true);
    }
    localStorage.setItem(BOOT_KEY, 'starting');
  } catch { /* storage blocked */ }
  setDetail(level);

  // MSAA is close to free on phone GPUs (tile-based), and without it phones looked far worse than PC.
  const renderer = new THREE.WebGLRenderer({ antialias: !DETAIL.min, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Khronos PBR Neutral: keeps the pastel facades and signboards true to colour (ACES and AgX wash them out).
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.2, 1400);

  const layout = new Layout();
  const colliders = new Colliders();
  const city = buildCity(scene, layout, colliders, renderer);
  const metro = buildMetro(scene, layout, colliders);
  const signals = new Signals(scene, layout);
  const traffic = new Traffic(scene, layout, signals);
  traffic.prewarm(150, 16.5);
  const streetLife = new StreetLife(scene, layout, colliders, signals);
  const env = new Environment(scene, renderer, camera, layout, city);
  // Baked ground shading next to buildings, walls, trees and under the metro viaducts.
  {
    const strips = [];
    for (const r of metro.routes) {
      let run = null;
      for (let s = 0; s <= r.path.length; s += 12) {
        const p = r.path.at(Math.min(s, r.path.length), {});
        if (r.yAt(s) > 4) (run ||= []).push([p.x, p.z]);
        else if (run) { if (run.length > 1) strips.push({ pts: run, width: 9, alpha: 0.3 }); run = null; }
      }
      if (run && run.length > 1) strips.push({ pts: run, width: 9, alpha: 0.3 });
    }
    bakeAO(layout.world, { boxes: colliders.all, trees: city.trees, strips }, DETAIL.lite ? 3 : 2.5);
  }
  const blobs = new BlobShadows(scene);
  const halos = new Halos(scene, city.lampHeads);
  if (DETAIL.lite) env.maxShadowMap = 1024;
  renderer.shadowMap.autoUpdate = false;

  // Bloom makes lamps, signals and headlights glow at night. Its render targets are only
  // allocated once it's switched on.
  let composer = null, bloom = null, useBloom = false;
  const getComposer = () => {
    if (!composer) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.5, 0.9);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      composer.setPixelRatio(pixelRatio);
      composer.setSize(innerWidth, innerHeight);
    }
    return composer;
  };

  // Points on a footpath near a place, and kerbside spots along the nearest road.
  const footpathNear = (x, z) => {
    for (let r = 0; r < 120; r += 2) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        const b = layout.blockContaining(px, pz);
        if (b && !b.island && !colliders.pointBlocked(px, pz, 1) && !colliders.resolveCircle(px, pz, 1.2, CURB_H)) return { x: px, z: pz };
      }
    }
    return { x, z };
  };
  // Where you wake up after being busted or wasted.
  const POLICE_STATIONS = PS.map((p) => ({ ...p, ...footpathNear(p.x, p.z) }));
  const HOSPITALS = HS.map((p) => ({ ...p, ...footpathNear(p.x, p.z) }));
  const spawn = footpathNear(SPAWN[0], SPAWN[1]);
  const player = new Player(scene, spawn.x, spawn.z);
  player.heading = Math.PI;
  player.y = CURB_H;

  // Parked vehicles: a few near the start, more scattered around town (lorries outside Peenya factories).
  const free = [];
  const park = (type, x, z, heading, opts = {}) => {
    const v = new Vehicle(type, { x, z, heading, ...opts });
    const hit = colliders.resolveCircle(v.x, v.z, v.radius + 0.2, 0);
    if (hit) { v.x = hit.x; v.z = hit.z; }
    v.syncVisual(0, { layout });
    scene.add(v.group);
    free.push(v);
    return v;
  };
  // Footpath parking: a spot `t` (0..1) along edge k of a block, 2 m in from the kerb.
  const kerbSpot = (b, k, t, inset = 2.2) => {
    const P = b.poly, [ax, az] = P[k % P.length], [bx, bz] = P[(k + 1) % P.length];
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const dx = b.cx - x, dz = b.cz - z, l = Math.hypot(dx, dz) || 1;
    return { x: x + (dx / l) * inset, z: z + (dz / l) * inset, heading: Math.atan2(bx - ax, bz - az) };
  };
  {
    // A scooter, a bike and an auto waiting at the start.
    const h = layout.edgeAt(spawn.x, spawn.z);
    const ux = h ? (h.e.b.x - h.e.a.x) / h.e.len : 1, uz = h ? (h.e.b.z - h.e.a.z) / h.e.len : 0;
    const heading = Math.atan2(ux, uz);
    [['scooter', 3, { color: 0xb01c22 }], ['bike', 6], ['auto', 10]].forEach(([type, d, o]) => {
      const p = footpathNear(spawn.x + ux * d, spawn.z + uz * d);
      park(type, p.x, p.z, heading, o);
    });
  }
  const types = ['scooter', 'scooter', 'bike', 'auto', 'hatch', 'sedan', 'taxi', 'suv', 'delivery'];
  for (const b of layout.blocks) {
    if (b.edge || b.zone === 'lake' || b.zone === 'park' || b.zone === 'industrial' || b.zone === 'landmark' || b.zone === 'rural') continue;
    const cbd = Math.hypot(b.cx - 300, b.cz) < 650;
    if (Math.random() > (cbd ? 0.3 : 0.06)) continue;
    const k = Math.floor(Math.random() * b.poly.length);
    if (!b.edgeWidths[k]) continue;
    const p = kerbSpot(b, k, 0.3 + Math.random() * 0.4);
    if (colliders.pointBlocked(p.x, p.z, 1)) continue;
    park(types[Math.floor(Math.random() * types.length)], p.x, p.z, p.heading);
  }
  city.pois.industrial.filter((_, k) => k % 4 === 0).slice(0, 14).forEach((p) => park(Math.random() < 0.6 ? 'lorry' : 'miniTruck', p.x, p.z, p.heading));

  const input = new Input(renderer.domElement);
  const rig = new CameraRig(camera);
  rig.yaw = 0;
  const audio = new Audio();
  const hud = new HUD(layout, city.pois, { metro: metro.routes, rails: city.rail.lines, mapScale: DETAIL.lite ? 0.26 : 0.32 });
  const missions = new Missions(scene, layout, city.pois, hud, audio);
  const police = new Police(scene, layout, colliders, hud, audio);
  env.onThunder = (delay) => audio.thunder(delay, 0.6 + Math.random() * 0.4);
  const particles = new Particles(scene);
  const gangs = new Gangs(scene, layout, colliders);
  const pickups = new Pickups(scene);
  const metroRide = new MetroRide(metro, hud, audio);

  const world = {
    layout, colliders, traffic, streetLife, audio, hud, camera, police, player, signals,
    vehicles: [], dynamic: [], obstacles: [], focus: { x: spawn.x, z: spawn.z },
    waterDepth: (x, z, y) => env.waterDepth(x, z, y),
    get wetness() { return env.wetness; },
    get rain() { return env.rain; },
    get hour() { return env.hour; },
    trafficScale: 1, pedScale: 1, initialFill: true,
    shake: (a) => rig.shake(a),
    particles, gangs, pickups,
    money: (n) => missions.addMoney(n),
    crime: (reason, x, z, stars) => police.crime(reason, x, z, stars, world),
    camRig: rig,
    skipClock: (s) => env.skip(s),
    setHour: (h) => { env.hour = h; },
    footpathNear, park, metroRide,
  };
  world.free = free;
  const story = new Story(scene, hud, audio, missions, world);
  world.saveGame = () => story.save();
  const garages = new Garages(scene, layout, colliders, hud, audio, missions, world, city.pois);
  world.garages = garages;

  // ---------- Crashes and explosions ----------
  world.onVehicleImpact = (a, b, speed, cx, cz) => {
    const share = (m1, m2) => (2 * m2) / (m1 + m2);
    const k = (v) => (v.driver === 'police' ? 0.5 : 1);
    a.takeDamage(damageFromSpeed(speed * Math.min(1.6, share(a.mass, b.mass)) * 0.75) * k(a), cx, cz, world);
    b.takeDamage(damageFromSpeed(speed * Math.min(1.6, share(b.mass, a.mass)) * 0.75) * k(b), cx, cz, world);
    if (speed > 6) particles.burst('spark', cx, 0.7, cz, Math.min(14, Math.round(speed)), 4, 0.8);
    if (speed > 4) audio.crunch?.(Math.min(1, speed / 18));
    // A traffic vehicle that's been killed stays where it died.
    if (b.engineDead && b.driver === 'ai') {
      const agent = traffic.findAgent(b);
      if (agent) { traffic.release(agent); free.push(b); }
    }
  };
  world.explode = (x, y, z, src) => {
    particles.burst('blast', x, y, z, 26, 7, 0.9);
    particles.burst('fire', x, y, z, 30, 5, 1.2, 1.6);
    particles.burst('spark', x, y, z, 40, 14, 1.0);
    for (let k = 0; k < 14; k++) particles.emit('blackSmoke', x + (Math.random() - 0.5) * 3, y + Math.random() * 2, z + (Math.random() - 0.5) * 3, 0, 2 + Math.random() * 2, 0, 2.2);
    audio.explosion?.(x, z, camera);
    const pd = Math.hypot(player.pos.x - x, player.pos.z - z);
    rig.shake(Math.max(0, 1.2 - pd / 40));
    // Blast damage: the player, people, other vehicles.
    if (pd < 7) {
      const hurt = 95 * (1 - pd / 7);
      if (player.vehicle === src) player.damage(120, x, z, world);
      else if (player.vehicle) { player.damage(hurt * 0.4, x, z, world); }
      else { player.damage(hurt, x, z, world); player.knock = 1.6; const a = Math.atan2(player.x - x, player.z - z); player.kx = Math.sin(a) * 9; player.kz = Math.cos(a) * 9; }
    }
    for (const p of streetLife.peds) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < 8 && p.state !== 'down') streetLife.knock(p, ((p.x - x) / (d || 1)) * 8, ((p.z - z) / (d || 1)) * 8, audio);
      else if (d < 30) streetLife.scare?.(p, x, z);
    }
    for (const v of world.vehicles) {
      if (v === src) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d > 9) continue;
      v.takeDamage(70 * (1 - d / 9), x, z, world);
      if (v.driver !== 'ai') { const k = (1 - d / 9) * 9000 / v.mass; v.vx += ((v.x - x) / (d || 1)) * k; v.vz += ((v.z - z) / (d || 1)) * k; v.angVel += (Math.random() - 0.5) * k * 0.4; }
    }
  };

  // ---------- Gunfire ----------
  world.gunfire = (x, z, npc) => {
    streetLife.panic(x, z, 45);
    if (!npc) world.crime('Firing a gun', x, z, 2);
  };
  world.bulletHit = (hit, w, dir, shooter) => {
    const byPlayer = shooter === player;
    if (hit.kind === 'person') {
      const p = hit.target;
      const dmg = w.dmg * (hit.head ? 2 : 1);
      particles.burst('blood', hit.x, hit.y, hit.z, 6, 2, 0.4);
      if (p === player) player.damage(w.dmg * (hit.head ? 0.55 : 0.32), shooter?.x, shooter?.z, world);
      else if (p.isCop) { police.hitCop(p, dmg, dir.x, dir.z, true, true); if (byPlayer) world.crime(p.dead ? 'Killing a police officer' : 'Shooting a police officer', p.x, p.z, p.dead ? 4 : 3); }
      else if (p.isGang) gangs.hit(p, dmg, dir.x, dir.z, world, true, true);
      else { streetLife.hit(p, dmg, dir.x, dir.z, world, true, true); if (byPlayer) world.crime(p.dead ? 'Murder' : 'Shooting someone', p.x, p.z, p.dead ? 3 : 2); }
    } else if (hit.kind === 'vehicle') {
      const v = hit.target;
      v.takeDamage(w.dmg * 0.2, hit.x, hit.z, world);
      particles.burst('spark', hit.x, hit.y, hit.z, 6, 3, 0.6);
      audio.crunch(0.15);
      if (v === player.vehicle && Math.random() < 0.35) player.damage(w.dmg * 0.2, shooter?.x, shooter?.z, world);
      if (byPlayer && v.driver === 'police') world.crime('Shooting at the police', v.x, v.z, 3);
    } else if (hit.kind === 'wall') particles.burst('spark', hit.x, hit.y, hit.z, 5, 2.5, 0.6);
    else particles.burst('dust', hit.x, 0.1, hit.z, 4, 1.5, 0.8);
  };

  // Weapons lying around: bats in the parks, blades in the markets, machetes in the
  // industrial yards, and a couple of kattas if you know where to look.
  {
    const corner = (b, k) => { const p = kerbSpot(b, k, 0.04, 1.8); return [p.x, p.z]; };
    let n = 0, ind = 0, mk = 0;
    for (const b of layout.blocks) {
      if (b.edge) continue;
      if (b.zone === 'park' && n++ % 2 === 0) { const [x, z] = corner(b, n); pickups.add(n % 4 === 0 ? 'lathi' : 'bat', x, z, CURB_H, { respawn: 180 }); }
      if (b.zone === 'market') { const [x, z] = corner(b, mk); pickups.add(['knife', 'chain', 'sickle'][mk++ % 3], x, z, CURB_H, { respawn: 180 }); }
      if (b.zone === 'industrial') {
        const [x, z] = corner(b, ind);
        const what = ind === 2 || ind === 9 ? 'katta' : ind === 5 ? 'ammo:katta' : ind % 3 === 0 ? 'machete' : null;
        if (what) pickups.add(what, x, z, CURB_H, { respawn: 240 });
        ind++;
      }
    }
    // One revolver, at the back of the Yeshwanthpur APMC yard.
    const apmc = footpathNear(...geo(13.0305, 77.5345));
    pickups.add('revolver', apmc.x, apmc.z, CURB_H, { respawn: 300 });
  }

  // Rowdies hang about the markets and yards after dark, and don't like being bothered.
  let rowdyT = 5;
  const spawnRowdies = (dt) => {
    rowdyT -= dt;
    if (rowdyT > 0) return;
    rowdyT = 20;
    const night = env.hour >= 20 || env.hour < 5;
    const loose = gangs.members.filter((m) => !m.crew && !m.dead).length;
    if (loose >= (night ? 6 : 2)) return;
    const blocks = layout.blocks.filter((b) => (b.zone === 'market' || b.zone === 'industrial' || (night && b.zone === 'mixed')) && Math.hypot(b.cx - world.focus.x, b.cz - world.focus.z) < 220 && Math.hypot(b.cx - world.focus.x, b.cz - world.focus.z) > 70);
    if (!blocks.length) return;
    const b = blocks[Math.floor(Math.random() * blocks.length)];
    const p = kerbSpot(b, Math.floor(Math.random() * b.poly.length), 0.2 + Math.random() * 0.6, 2.5);
    const n = 2 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) gangs.spawn(p.x + Math.random() * 1.5, p.z + k * 1.2, { weapon: Math.random() < 0.08 ? 'katta' : undefined, name: 'Rowdy' });
  };

  // ---------- Busted / wasted ----------
  let screenT = 0, pending = null;
  const nearestOf = (list, p) => list.reduce((b, s) => (Math.hypot(s.x - p.x, s.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? s : b));
  world.onBusted = () => {
    if (pending) return;
    const fine = Math.min(missions.money, 100 + police.level * 150);
    missions.addMoney(-fine);
    hud.showScreen('BUSTED', `The Hoysala crew fined you ₹${fine}. "Next time, swalpa adjust maadi."`, '#4a8ff0');
    audio.sting(true);
    pending = { list: POLICE_STATIONS };
    screenT = 4;
    player.dead = true;
  };
  world.onPlayerDown = () => {
    if (pending) return;
    if (police.level > 0 && police.cops.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 3)) return world.onBusted();
    const bill = Math.min(missions.money, Math.max(200, Math.round(missions.money * 0.1)));
    missions.addMoney(-bill);
    hud.showScreen('WASTED', `Hospital bill: ₹${bill}. Bengaluru is not for the faint-hearted.`, '#e03a2a');
    audio.sting(true);
    pending = { list: HOSPITALS };
    screenT = 4;
    player.dead = true;
  };
  world.hitByTrain = (t, nx = 1, nz = 0) => {
    if (player.vehicle || player.knock > 0) return;
    player.damage(70, player.x - nx, player.z - nz, world);
    player.knock = 2; player.kx = nx * 8; player.kz = nz * 8;
    hud.say('Indian Railways always wins.', 3);
  };
  // Repopulate the streets around a new location straight away (after a respawn or a metro ride).
  world.reseed = () => {
    const p = player.pos;
    world.initialFill = true; elapsed = 0;
    traffic.edgeTimer = 0;
    for (const a of traffic.agents.slice()) if (Math.hypot(a.v.x - p.x, a.v.z - p.z) > traffic.radius) traffic.despawn(a);
  };
  const respawn = () => {
    const p = nearestOf(pending.list, player.pos);
    if (player.vehicle) player.exitVehicle(world, true);
    player.respawn(p.x, p.z);
    police.reset();
    missions.job && missions.fail('You missed the job.');
    story.active && story.fail(pending.list === HOSPITALS ? 'You were wasted.' : 'You were busted.');
    rig.first = true;
    world.reseed();
    hud.hideScreen();
    hud.toast(p.name, 'Bengaluru');
    pending = null;
  };

  // ---------- Settings and touch controls ----------
  const touch = new TouchControls(input, settings);
  // The map needs the mouse: free it from the game while the map is open, take it back after.
  // GPS: tap the big map to set a waypoint (tap it again to clear).
  const gps = new GPS(layout);
  hud.gps = gps;
  hud.onMapTap = (x, z, slop) => {
    if (gps.target && Math.hypot(gps.target.x - x, gps.target.z - z) < Math.max(25, slop)) { gps.clear(); hud.say('Waypoint cleared', 1.5); return; }
    gps.set(x, z);
    hud.say('Waypoint set. Follow the purple line.', 2);
  };
  hud.onMapToggle = (on) => {
    if (touch.enabled) return;
    if (on) document.exitPointerLock?.();
    else if (!paused) input.lock();
  };
  settings.buildPanel(document.getElementById('help'));
  settings.onReset = () => { story.reset(); missions.money = 500; hud.setMoney(500, true); world.garages?.reset?.(); };
  document.getElementById('open-settings').addEventListener('click', () => settings.toggle(true));
  settings.onChange((s) => {
    pixelRatio = Math.min(devicePixelRatio, 1.5) * s.resScale;
    renderer.setPixelRatio(pixelRatio);
    composer?.setPixelRatio(pixelRatio);
    env.setShadows(s.shadows);
    useBloom = s.bloom;
    env.drawDist = s.drawDist;
    camera.far = 400 + 1000 * s.drawDist;
    camera.updateProjectionMatrix();
    traffic.target = Math.round(170 * s.traffic);
    traffic.radius = 260 + 120 * Math.min(1, s.drawDist);
    streetLife.walkerTarget = Math.round(110 * s.peds);
    rig.sens = s.sensitivity;
    rig.invert = s.invertY;
    audio.setVolume?.(s.volume);
    touch.setEnabled(settings.touchEnabled);
  });

  // ---------- Start / pause ----------
  const startBtn = document.getElementById('start');
  document.getElementById('loading').style.display = 'none';
  startBtn.disabled = false;
  let started = false, paused = true;
  const resume = () => {
    audio.start();
    if (touch.enabled) {
      // Phones: full screen, landscape, no pointer lock.
      document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
    } else input.lock();
    hud.toggleHelp(false);
    settings.toggle(false);
    paused = false;
    if (!started) {
      started = true;
      startBtn.textContent = 'Resume';
      hud.toast('Majestic', 'Bengaluru');
      hud.lastDistrict = layout.blockAt(player.x, player.z).district;
      if (fellBack) hud.say(`The last start ran out of memory, so the city is now built with ${level === 'min' ? 'minimum' : 'lite'} detail (Settings → World detail).`, 6);
      setTimeout(() => hud.say(touch.enabled ? 'Tip: tap CAR next to the red scooter. Gigs ping your phone.' : 'Tip: grab the red scooter (F). Gigs ping your phone. The monsoon comes when it wants (or press K).', 7), fellBack ? 6500 : 2500);
    }
  };
  const pause = () => { paused = true; hud.toggleHelp(true); };
  touch.onPause = pause;
  startBtn.addEventListener('click', resume);
  renderer.domElement.addEventListener('click', () => { if (!paused && !touch.enabled) input.lock(); });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && started && !touch.enabled && !hud.el.map.classList.contains('show')) pause();
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer?.setSize(innerWidth, innerHeight);
  });
  let radioOn = true;
  // O: quick switch between the Low preset and whatever you had.
  let beforeLow = null;
  const togglePerf = () => {
    if (settings.get('quality') === 'low' && beforeLow) { settings.set(beforeLow); beforeLow = null; hud.say('Performance mode OFF', 2); }
    else { beforeLow = { ...settings.values }; settings.preset('low'); hud.say('Performance mode ON (Low preset; see Settings)', 2.5); }
  };

  // ---------- Loop ----------
  const clock = new THREE.Clock();
  let elapsed = 0;
  const tick = () => {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 1 / 20);
    if (!paused) update(dt);
    renderer.shadowMap.needsUpdate = ++shadowFrame % env.shadowEvery === 0;
    blobs.update(camera, useBloom);
    halos.update(camera, env.night, signals, useBloom);
    if (useBloom) { const c = getComposer(); bloom.strength = 0.1 + env.night * 0.3; c.render(); } else renderer.render(scene, camera);
    // A few seconds of drawing the city means this start worked.
    if (bootOk && ++frames > 10 && performance.now() - bootT > 6000) { bootOk(); bootOk = null; }
  };
  const update = (dt) => {
    elapsed += dt;
    if (elapsed > 3) world.initialFill = false;

    if (input.hit('KeyM')) hud.toggleMap();
    if (input.hit('KeyR')) { radioOn = !radioOn; hud.say(radioOn ? 'Radio on' : 'Radio off', 1.2); }
    if (input.hit('KeyK')) { env.setRain(!env.raining); hud.say(env.raining ? 'Dark clouds roll in over Bengaluru…' : 'The rain eases off.', 2.5); }
    if (input.hit('KeyT') && !metroRide.active) { env.timeScale = env.timeScale > 1 ? 1 : 30; hud.say(env.timeScale > 1 ? 'Time ×30' : 'Time normal', 1.5); }
    if (input.hit('KeyO')) togglePerf();

    // Rush hour is real.
    const h = env.hour;
    world.trafficScale = (h >= 8 && h < 11) || (h >= 17 && h < 21) ? 1.3 : h >= 23 || h < 5 ? 0.4 : 1;
    world.pedScale = h >= 23 || h < 5 ? 0.35 : env.rain > 0.5 ? 0.5 : 1;

    world.vehicles.length = 0;
    for (const a of traffic.agents) world.vehicles.push(a.v);
    for (const v of free) world.vehicles.push(v);
    for (const u of police.units) world.vehicles.push(u.v);

    // Namma Metro: entrances on the street, and the ride itself.
    const entrance = !player.vehicle && !pending && !metroRide.active ? metroRide.nearEntrance(player.pos) : null;
    if (entrance && input.hit('KeyE')) { input.pressed.delete('KeyE'); metroRide.open(entrance, world); }
    if (pending) {
      screenT -= dt;
      if (screenT <= 0) respawn();
    } else if (metroRide.active) {
      metroRide.update(dt, input, world, missions, camera);
    } else if (garages.menu) {
      garages.update(dt, input);
    } else {
      garages.update(dt, input);
      const wasIn = player.vehicle;
      player.update(dt, input, rig.yaw, world);
      if (player.vehicle && !free.includes(player.vehicle)) free.push(player.vehicle);
      if (player.vehicle !== wasIn) audio.radio(!!player.vehicle && radioOn);
      if (player.vehicle) audio.radio(radioOn);
    }
    world.focus.x = player.pos.x; world.focus.z = player.pos.z;

    for (const v of free) {
      if (v === player.vehicle) continue;
      if (v.speed > 0.05 || Math.abs(v.angVel) > 0.02) v.update(dt, null, world);
      else if (v.health < 45 || v.fireT > 0 || v.wrecked) v.effects(dt, world); // keep smoking and burning
      v.group.visible = Math.abs(v.x - world.focus.x) < 300 && Math.abs(v.z - world.focus.z) < 300;
    }
    police.update(dt, world);
    gangs.update(dt, world);
    pickups.update(dt, world);
    spawnRowdies(dt);
    world.dynamic.length = 0;
    for (const v of free) world.dynamic.push(v);
    for (const u of police.units) world.dynamic.push(u.v);
    resolveVehicleContacts(world.dynamic, traffic, world, player, free);

    world.obstacles.length = 0;
    if (player.vehicle) world.obstacles.push({ x: player.vehicle.x, z: player.vehicle.z, y: player.vehicle.y, r: player.vehicle.spec.length / 2, isPlayer: true });
    else if (player.y < 0.05) world.obstacles.push(player);
    for (const v of world.dynamic) if (v !== player.vehicle) world.obstacles.push({ x: v.x, z: v.z, y: v.y, r: v.spec.length / 2, isCop: v.driver === 'police' });
    for (const c of police.cops) world.obstacles.push(c);
    streetLife.collectObstacles(world.obstacles);

    signals.update(dt, world.focus);
    traffic.update(dt, world);
    streetLife.update(dt, world);
    metro.update(dt, world);
    city.rail.update(dt, world);
    city.update(dt, elapsed, camera);
    particles.update(dt, camera, renderer);
    env.update(dt, world.focus, player, police);
    missions.update(dt, input, player);
    story.update(dt, input);
    audio.setRain(env.rain);

    if (metroRide.active || garages.menu) hud.prompt('');
    else if (garages.nearStall) { /* the garage set its own prompt */ }
    else if (entrance) hud.prompt(`E  Namma Metro · ${entrance.st.en}`);
    else if (!player.vehicle && !pending) {
      let near = null;
      for (const v of world.vehicles) {
        const d = Math.hypot(v.x - player.x, v.z - player.z) - v.spec.length / 2;
        if (d < 2.2 && Math.abs(v.y - player.y) < 2 && (!near || d < near.d)) near = { v, d };
      }
      hud.prompt(near ? (near.v.driver === 'ai' || near.v.driver === 'police' ? `F  "Borrow" the ${near.v.spec.label}` : `F  Get in the ${near.v.spec.label}`) : '');
    } else hud.prompt(player.vehicle && player.vehicle.speed <= 8 ? (player.vehicle.spec.police ? 'F  Get out  ·  G  Siren' : 'F  Get out') : '');

    if (!window.__freeCam && !metroRide.active) rig.update(dt, input, player, colliders);
    if (!metroRide.active) metroRide.banner.classList.remove('show');
    audio.engine(player.vehicle);
    audio.update?.(dt, { world, camera, env, player, metro: metroRide.state });
    const markers = missions.markers.concat(story.markers);
    for (const u of police.units) markers.push({ x: u.v.x, z: u.v.z, color: Math.floor(elapsed * 4) % 2 ? '#e02020' : '#2050ff', small: true });
    if (gps.update(dt, player.x, player.z) === 'arrived') { hud.say('You have arrived.', 2.5); audio.click?.(); }
    if (gps.target) markers.push({ x: gps.target.x, z: gps.target.z, color: '#c050ff' });
    hud.update(dt, player, rig.yaw, markers);
    touch.update({ driving: !!player.vehicle, gun: WEAPONS[player.weapon].kind === 'gun', police: !!player.vehicle?.spec.police, use: !!entrance || !!story.active || garages.nearStall || !!garages.menu, offer: !!missions.offer, metro: metroRide.active });
    { const w = WEAPONS[player.weapon]; hud.setWeapon(w.name, player.clip[player.weapon] ?? 0, player.ammo[player.weapon] ?? 0, player.reloadT > 0, player.aiming, w.kind === 'gun'); }
    world.rigPitch = rig.pitch;
    hud.setClock(env.clockString(), env.rain > 0.6 ? '⛈ Monsoon' : env.rain > 0.1 ? '🌧 Rain' : env.night > 0.5 ? '🌙 Clear' : '☀ Clear');
    input.endFrame();
  };
  // Push all the static city geometry to the GPU once, from above, so the CPU-side copies can be
  // dropped (BuilderSet release) instead of waiting for each chunk to come into view.
  {
    const cam = new THREE.OrthographicCamera(-(WORLD.maxX - WORLD.minX) / 2, (WORLD.maxX - WORLD.minX) / 2, (WORLD.maxZ - WORLD.minZ) / 2, -(WORLD.maxZ - WORLD.minZ) / 2, 1, 2000);
    cam.position.set((WORLD.minX + WORLD.maxX) / 2, 900, (WORLD.minZ + WORLD.maxZ) / 2);
    cam.up.set(0, 0, -1);
    cam.lookAt(cam.position.x, 0, cam.position.z);
    cam.updateMatrixWorld();
    // (Drawn to the screen, so the shader variants are the ones used in play, but into a single
    // pixel behind the menu.)
    renderer.setViewport(0, 0, 1, 1);
    renderer.render(scene, cam);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
  }
  let shadowFrame = 0;
  // Lost graphics context (a driver reset, or a phone reclaiming GPU memory): the city's geometry
  // only lives on the GPU, so save and rebuild from scratch rather than limp on with a black screen.
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    try { world.saveGame(); } catch { /* best effort */ }
    try { localStorage.removeItem(BOOT_KEY); } catch { /* ignore */ }
    const note = document.getElementById('loading');
    if (note) { note.textContent = 'Graphics were reset. Reloading…'; note.style.display = ''; }
    setTimeout(() => location.reload(), 300);
  });
  const bootT = performance.now();
  let frames = 0;
  let bootOk = () => { try { localStorage.removeItem(BOOT_KEY); } catch { /* ignore */ } };
  tick();
  // Debug/test hook: advance the simulation without rendering.
  const step = (n = 1, dt = 1 / 60) => { for (let k = 0; k < n; k++) update(dt); };
  window.__game = { audio, story, metroRide, gangs, pickups, particles, metro, scene, player, traffic, layout, renderer, camera, rig, missions, hud, streetLife, free, input, step, police, env, signals, world, aoUniforms, blobs, halos, get composer() { return getComposer(); } };
}

// Vehicle-vehicle collisions for free/player/police vehicles against everything else.
const _ca = [], _cb = [];
function resolveVehicleContacts(dynamic, traffic, world, player, free) {
  for (const a of dynamic) {
    if (a.speed < 0.05 && a !== player.vehicle) continue;
    for (const b of world.vehicles) {
      if (a === b) continue;
      const reach = (a.spec.length + b.spec.length) / 2 + 1;
      if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach || Math.abs(a.y - b.y) > 2) continue;
      const ai = b.driver === 'ai';
      a.circles(_ca); b.circles(_cb);
      for (const ca of _ca) {
        for (const cb of _cb) {
          let nx = ca.x - cb.x, nz = ca.z - cb.z;
          const d = Math.hypot(nx, nz), min = ca.r + cb.r;
          if (d >= min || d < 1e-5) continue;
          nx /= d; nz /= d;
          const pen = min - d;
          // Contact point and its offset from each centre of mass; relative velocity there.
          const cx = cb.x + nx * cb.r, cz = cb.z + nz * cb.r;
          const pax = cx - a.x, paz = cz - a.z, pbx = cx - b.x, pbz = cz - b.z;
          const avx = a.vx + a.angVel * paz, avz = a.vz - a.angVel * pax;
          const bvx = b.vx + (b.angVel || 0) * pbz, bvz = b.vz - (b.angVel || 0) * pbx;
          const vn = (avx - bvx) * nx + (avz - bvz) * nz;
          const ta = (paz * nx - pax * nz) ** 2 / a.inertia;
          const ia = 1 / a.mass, ib = 1 / b.mass;
          const tb = (pbz * nx - pbx * nz) ** 2 / b.inertia;
          // Momentum shared by mass: a bus that clips a scooter barely notices; the scooter flies.
          const j = vn < 0 ? (-1.25 * vn) / (ia + ib + ta + tb) : 0;
          let dvA = j * ia; // how hard this shoves us (drives shake and noise)
          if (ai) {
            // Traffic is on rails until something knocks it hard enough to lose control.
            const agent = traffic.findAgent(b);
            const dvB = j * ib;
            const heavy = ['bus', 'lorry', 'tanker', 'schoolBus'].includes(b.type);
            // (A much heavier hitter always shoves it: otherwise it acts as a wall, hit again every frame.)
            const loses = agent && !heavy && (dvB > 4 || (b.spec.twoWheeler && dvB > 2) || (a.mass > 2.5 * b.mass && -vn > 1.5));
            a.x += nx * pen * (loses ? ia / (ia + ib) : 1); a.z += nz * pen * (loses ? ia / (ia + ib) : 1);
            if (vn < 0) a.applyImpulse(nx * j, nz * j, pax, paz);
            if (loses) {
              traffic.release(agent);
              b.x -= nx * pen * ib / (ia + ib); b.z -= nz * pen * ib / (ia + ib);
              b.applyImpulse(-nx * j, -nz * j, pbx, pbz);
              if (b.rider && b.spec.twoWheeler) {
                const opts = { outfit: b.rider.outfit, helmet: true };
                b.removeRider();
                const p = world.streetLife.spawnFleeing(b.x, b.z, a.x, a.z, opts);
                world.streetLife.knock(p, -nx * Math.min(9, 3 + dvB), -nz * Math.min(9, 3 + dvB), world.audio);
              }
              free.push(b);
              if (a.driver === 'player') world.crime('Reckless driving', a.x, a.z, 1);
            } else if (agent) {
              agent.stunned = 2;
              if (a.driver === 'player' && -vn > 3 && Math.random() < 0.5) world.hud.say(`"${LINES.bumped[Math.floor(Math.random() * LINES.bumped.length)]}"`, 2.5);
            }
          } else {
            a.x += nx * pen * ia / (ia + ib); a.z += nz * pen * ia / (ia + ib);
            b.x -= nx * pen * ib / (ia + ib); b.z -= nz * pen * ib / (ia + ib);
            if (vn < 0) {
              a.applyImpulse(nx * j, nz * j, pax, paz);
              b.applyImpulse(-nx * j, -nz * j, pbx, pbz);
            }
            if (b.driver === 'player') dvA = j * ib;
            if (a.driver === 'player' && b.driver === 'police' && -vn > 5) world.crime('Ramming a Hoysala', a.x, a.z, 1);
          }
          if (-vn > 2) world.onVehicleImpact?.(a, b, -vn, cx, cz);
          if (-vn > 3) { world.audio.thud(Math.min(1, -vn / 15)); if (a.driver === 'player' || b.driver === 'player') world.shake(Math.min(0.5, dvA / 20)); }
          a.circles(_ca); b.circles(_cb);
        }
      }
      if (!ai) b.syncVisual(0, world);
    }
  }
}

init();

// Offline caching for the browser version (the desktop and Android apps already ship the files).
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.Capacitor && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
