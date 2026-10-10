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
import { Vehicle } from './entities/vehicle.js';
import { HUD } from './ui/hud.js';
import { LINES, CURB_H, METRO_LINES, RAILWAY } from './config.js';

// Where you wake up after being busted or wasted.
const POLICE_STATIONS = [
  { name: 'Cubbon Park Police Station', x: -300, z: -112 },
  { name: 'Yeshwanthpur Police Station', x: -1120, z: -1052 },
  { name: 'Indiranagar Police Station', x: 610, z: 147 },
  { name: 'Koramangala Police Station', x: 760, z: 828 },
  { name: 'Peenya Police Station', x: -1460, z: -1532 },
];
const HOSPITALS = [
  { name: 'Bowring Hospital', x: 200, z: -112 },
  { name: "St. John's Hospital", x: 1040, z: 968 },
  { name: 'ESI Hospital, Rajajinagar', x: -980, z: -572 },
  { name: 'Victoria Hospital', x: -330, z: 410 },
];

async function init() {
  // Wait for the Kannada font so the canvas-painted signs render the script.
  try { await Promise.race([document.fonts.load('26px "Noto Sans Kannada"'), document.fonts.load('40px "Oswald"'), new Promise((r) => setTimeout(r, 2500))]); } catch { /* offline */ }

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
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

  // Bloom makes lamps, signals and headlights glow at night.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.5, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let useBloom = true;

  const spawn = { x: 22, z: 10.8 };
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
  park('scooter', 27, 11.2, -Math.PI / 2, { color: 0xb01c22 });
  park('bike', 30, 11.2, -Math.PI / 2);
  park('auto', 35, 11.0, -Math.PI / 2);
  park('hatch', 44, 6.2, -Math.PI / 2, { color: 0xf2f2f2 });
  const types = ['scooter', 'scooter', 'bike', 'auto', 'hatch', 'sedan', 'taxi', 'suv', 'delivery'];
  for (const b of layout.blocks) {
    if (b.edge || b.zone === 'lake' || b.zone === 'park' || b.zone === 'industrial') continue;
    const cbd = Math.abs(b.cx) < 460 && Math.abs(b.cz) < 460;
    if (Math.random() > (cbd ? 0.35 : 0.07)) continue;
    const o = b.outer;
    park(types[Math.floor(Math.random() * types.length)], o.minX + 10 + Math.random() * (o.maxX - o.minX - 20), o.minZ + 2.4, Math.PI / 2);
  }
  city.pois.industrial.filter((_, k) => k % 4 === 0).slice(0, 14).forEach((p) => park(Math.random() < 0.6 ? 'lorry' : 'miniTruck', p.x, p.z, p.face === 'n' || p.face === 's' ? Math.PI / 2 : 0));

  const input = new Input(renderer.domElement);
  const rig = new CameraRig(camera);
  rig.yaw = 0;
  const audio = new Audio();
  const hud = new HUD(layout, city.pois, { metroLines: METRO_LINES, railway: RAILWAY });
  const missions = new Missions(scene, layout, city.pois, hud, audio);
  const police = new Police(scene, layout, colliders, hud, audio);
  env.onThunder = (delay) => audio.thunder(delay, 0.6 + Math.random() * 0.4);

  const world = {
    layout, colliders, traffic, streetLife, audio, hud, camera, police, player, signals,
    vehicles: [], dynamic: [], obstacles: [], focus: { x: spawn.x, z: spawn.z },
    waterDepth: (x, z, y) => env.waterDepth(x, z, y),
    get wetness() { return env.wetness; },
    get rain() { return env.rain; },
    get hour() { return env.hour; },
    trafficScale: 1, pedScale: 1, initialFill: true,
    shake: (a) => rig.shake(a),
    crime: (reason, x, z, stars) => police.crime(reason, x, z, stars, world),
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
  world.hitByTrain = () => {
    if (player.vehicle || player.knock > 0) return;
    player.damage(70, player.x - 1, player.z, world);
    player.knock = 2; player.kz = 8 * Math.sign(player.z - RAILWAY.z || 1); player.kx = 0;
    hud.say('Indian Railways always wins.', 3);
  };
  const respawn = () => {
    const p = nearestOf(pending.list, player.pos);
    if (player.vehicle) player.exitVehicle(world, true);
    player.respawn(p.x, p.z);
    police.reset();
    missions.job && missions.fail('You missed the job.');
    rig.first = true;
    // Repopulate the streets around the new location straight away.
    world.initialFill = true; elapsed = 0;
    for (const a of traffic.agents.slice()) if (Math.hypot(a.v.x - p.x, a.v.z - p.z) > traffic.radius) traffic.despawn(a);
    hud.hideScreen();
    hud.toast(p.name, 'Bengaluru');
    pending = null;
  };

  // ---------- Start / pause ----------
  const startBtn = document.getElementById('start');
  document.getElementById('loading').style.display = 'none';
  startBtn.disabled = false;
  let started = false, paused = true;
  const resume = () => {
    audio.start();
    input.lock();
    hud.toggleHelp(false);
    paused = false;
    if (!started) {
      started = true;
      startBtn.textContent = 'Resume';
      hud.toast('MG Road', 'Bengaluru');
      hud.lastDistrict = layout.blockAt(player.x, player.z).district;
      setTimeout(() => hud.say('Tip: grab the red scooter (F). Gigs ping your phone. The monsoon comes when it wants (or press K).', 7), 2500);
    }
  };
  startBtn.addEventListener('click', resume);
  renderer.domElement.addEventListener('click', () => { if (!paused) input.lock(); });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && started && !hud.el.map.classList.contains('show')) { paused = true; hud.toggleHelp(true); }
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });
  let radioOn = true;
  let perfMode = false;
  const setPerf = (on) => {
    perfMode = on;
    pixelRatio = on ? Math.min(devicePixelRatio, 1) * 0.75 : Math.min(devicePixelRatio, 1.5);
    renderer.setPixelRatio(pixelRatio);
    composer.setPixelRatio(pixelRatio);
    env.sun.castShadow = !on;
    useBloom = !on;
    traffic.target = on ? 100 : 170;
    traffic.radius = on ? 300 : 380;
    streetLife.walkerTarget = on ? 60 : 110;
    hud.say(on ? 'Performance mode ON (lower resolution, no shadows/bloom, lighter traffic)' : 'Performance mode OFF', 2.5);
  };

  // ---------- Loop ----------
  const clock = new THREE.Clock();
  let elapsed = 0;
  const tick = () => {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 1 / 20);
    if (!paused) update(dt);
    if (useBloom) { bloom.strength = 0.15 + env.night * 0.6; composer.render(); } else renderer.render(scene, camera);
  };
  const update = (dt) => {
    elapsed += dt;
    if (elapsed > 3) world.initialFill = false;

    if (input.hit('KeyM')) hud.toggleMap();
    if (input.hit('KeyR')) { radioOn = !radioOn; hud.say(radioOn ? 'Radio on' : 'Radio off', 1.2); }
    if (input.hit('KeyK')) { env.setRain(!env.raining); hud.say(env.raining ? 'Dark clouds roll in over Bengaluru…' : 'The rain eases off.', 2.5); }
    if (input.hit('KeyT')) { env.timeScale = env.timeScale > 1 ? 1 : 30; hud.say(env.timeScale > 1 ? 'Time ×30' : 'Time normal', 1.5); }
    if (input.hit('KeyO')) setPerf(!perfMode);

    // Rush hour is real.
    const h = env.hour;
    world.trafficScale = (h >= 8 && h < 11) || (h >= 17 && h < 21) ? 1.3 : h >= 23 || h < 5 ? 0.4 : 1;
    world.pedScale = h >= 23 || h < 5 ? 0.35 : env.rain > 0.5 ? 0.5 : 1;

    world.vehicles.length = 0;
    for (const a of traffic.agents) world.vehicles.push(a.v);
    for (const v of free) world.vehicles.push(v);
    for (const u of police.units) world.vehicles.push(u.v);

    if (pending) {
      screenT -= dt;
      if (screenT <= 0) respawn();
    } else {
      const wasIn = player.vehicle;
      player.update(dt, input, rig.yaw, world);
      if (player.vehicle && !free.includes(player.vehicle)) free.push(player.vehicle);
      if (player.vehicle !== wasIn) audio.radio(!!player.vehicle && radioOn);
      if (player.vehicle) audio.radio(radioOn);
    }
    world.focus.x = player.pos.x; world.focus.z = player.pos.z;

    for (const v of free) {
      if (v === player.vehicle) continue;
      if (v.speed > 0.05) v.update(dt, null, world);
      v.group.visible = Math.abs(v.x - world.focus.x) < 300 && Math.abs(v.z - world.focus.z) < 300;
    }
    police.update(dt, world);
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
    metro.update(dt);
    city.rail.update(dt, world);
    city.update(dt, elapsed, camera);
    env.update(dt, world.focus, player, police);
    missions.update(dt, input, player);
    audio.setRain(env.rain);

    if (!player.vehicle && !pending) {
      let near = null;
      for (const v of world.vehicles) {
        const d = Math.hypot(v.x - player.x, v.z - player.z) - v.spec.length / 2;
        if (d < 2.2 && Math.abs(v.y - player.y) < 2 && (!near || d < near.d)) near = { v, d };
      }
      hud.prompt(near ? (near.v.driver === 'ai' || near.v.driver === 'police' ? `F  "Borrow" the ${near.v.spec.label}` : `F  Get in the ${near.v.spec.label}`) : '');
    } else hud.prompt(player.vehicle && player.vehicle.speed <= 8 ? (player.vehicle.spec.police ? 'F  Get out  ·  G  Siren' : 'F  Get out') : '');

    if (!window.__freeCam) rig.update(dt, input, player, colliders);
    audio.engine(player.vehicle);
    const markers = missions.markers.slice();
    for (const u of police.units) markers.push({ x: u.v.x, z: u.v.z, color: Math.floor(elapsed * 4) % 2 ? '#e02020' : '#2050ff', small: true });
    hud.update(dt, player, rig.yaw, markers);
    hud.setClock(env.clockString(), env.rain > 0.6 ? '⛈ Monsoon' : env.rain > 0.1 ? '🌧 Rain' : env.night > 0.5 ? '🌙 Clear' : '☀ Clear');
    input.endFrame();
  };
  tick();
  // Debug/test hook: advance the simulation without rendering.
  const step = (n = 1, dt = 1 / 60) => { for (let k = 0; k < n; k++) update(dt); };
  window.__game = { metro, scene, player, traffic, layout, renderer, camera, rig, missions, hud, streetLife, free, input, step, police, env, signals, world, composer };
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
          const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
          if (ai) {
            a.x += nx * pen; a.z += nz * pen;
            if (vn < 0) { a.vx -= nx * vn * 1.3; a.vz -= nz * vn * 1.3; }
            const agent = traffic.findAgent(b);
            if (agent) {
              if (-vn > 9 && !['bus', 'lorry', 'tanker', 'schoolBus'].includes(b.type)) {
                traffic.release(agent);
                const k = (a.mass / (a.mass + b.mass)) * -vn * 1.4;
                b.vx -= nx * k; b.vz -= nz * k;
                if (b.rider && b.spec.twoWheeler) {
                  const opts = { outfit: b.rider.outfit, helmet: true };
                  b.removeRider();
                  const p = world.streetLife.spawnFleeing(b.x, b.z, a.x, a.z, opts);
                  world.streetLife.knock(p, -nx * 6, -nz * 6, world.audio);
                }
                free.push(b);
                if (a.driver === 'player') world.crime('Reckless driving', a.x, a.z, 1);
              } else {
                agent.stunned = 2;
                if (a.driver === 'player' && -vn > 3 && Math.random() < 0.5) world.hud.say(`"${LINES.bumped[Math.floor(Math.random() * LINES.bumped.length)]}"`, 2.5);
              }
            }
          } else {
            const ia = 1 / a.mass, ib = 1 / b.mass;
            a.x += nx * pen * ia / (ia + ib); a.z += nz * pen * ia / (ia + ib);
            b.x -= nx * pen * ib / (ia + ib); b.z -= nz * pen * ib / (ia + ib);
            if (vn < 0) {
              const j = (-1.3 * vn) / (ia + ib);
              a.vx += nx * j * ia; a.vz += nz * j * ia;
              b.vx -= nx * j * ib; b.vz -= nz * j * ib;
            }
            if (a.driver === 'player' && b.driver === 'police' && -vn > 5) world.crime('Ramming a Hoysala', a.x, a.z, 1);
          }
          if (-vn > 3) { world.audio.thud(Math.min(1, -vn / 15)); if (a.driver === 'player' || b.driver === 'player') world.shake(Math.min(0.5, -vn / 30)); }
          a.circles(_ca); b.circles(_cb);
        }
      }
      if (!ai) b.syncVisual(0, world);
    }
  }
}

init();
