import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Layout } from './world/layout.js';
import { buildCity } from './world/city.js';
import { buildMetro } from './world/metro.js';
import { Colliders } from './systems/colliders.js';
import { Input } from './systems/input.js';
import { CameraRig } from './systems/cameraRig.js';
import { Audio } from './systems/audio.js';
import { Missions, Wanted } from './systems/missions.js';
import { Traffic } from './entities/traffic.js';
import { StreetLife } from './entities/pedestrians.js';
import { Player } from './entities/player.js';
import { Vehicle } from './entities/vehicle.js';
import { HUD } from './ui/hud.js';
import { LINES, CURB_H } from './config.js';

const SUN_ELEVATION = 24; // degrees: late-afternoon light
const SUN_AZIMUTH = 235;

async function init() {
  // Wait for the Kannada font so the canvas-painted signs render the script.
  try { await Promise.race([document.fonts.load('26px "Noto Sans Kannada"'), new Promise((r) => setTimeout(r, 2500))]); } catch { /* offline */ }

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.2, 2500);
  const sun = setupEnvironment(scene, renderer);

  const layout = new Layout();
  const colliders = new Colliders();
  const city = buildCity(scene, layout, colliders, renderer);
  const metro = buildMetro(scene, layout, colliders);
  const traffic = new Traffic(scene, layout, 55);
  const streetLife = new StreetLife(scene, layout, colliders, 110);

  const spawn = { x: 22, z: 10.8 };
  const player = new Player(scene, spawn.x, spawn.z);
  player.heading = Math.PI; // facing north, towards MG Road and the metro
  player.y = CURB_H;

  // Parked vehicles: a few near the start, more scattered around town.
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
  park('auto', 33, 11.0, -Math.PI / 2);
  park('hatch', 41, 6.2, -Math.PI / 2, { color: 0xf2f2f2 });
  for (const b of layout.blocks) {
    if (b.edge || b.zone === 'lake' || b.zone === 'park') continue;
    if (Math.random() > 0.35) continue;
    const o = b.outer;
    const type = ['scooter', 'scooter', 'auto', 'hatch', 'taxi', 'suv'][Math.floor(Math.random() * 6)];
    park(type, o.minX + 10 + Math.random() * (o.maxX - o.minX - 20), o.minZ + 2.4, Math.PI / 2);
  }

  const input = new Input(renderer.domElement);
  const rig = new CameraRig(camera);
  rig.yaw = 0; // camera south of the player, looking north
  const audio = new Audio();
  const hud = new HUD(layout, city.pois);
  const missions = new Missions(scene, layout, city.pois, hud, audio);
  const wanted = new Wanted(hud);

  const world = {
    layout, colliders, traffic, streetLife, audio, hud, camera, wanted,
    vehicles: [], obstacles: [], focus: { x: spawn.x, z: spawn.z },
    shake: (a) => rig.shake(a),
  };

  // ---------- Start / pause ----------
  const help = document.getElementById('help');
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
      setTimeout(() => hud.say('Tip: walk up to that red scooter and press F. Gigs will ping your phone.', 6), 2500);
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
  });
  let radioOn = true;

  // ---------- Loop ----------
  const clock = new THREE.Clock();
  let elapsed = 0;
  const tick = () => {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 1 / 20);
    if (paused) { renderer.render(scene, camera); input.endFrame(); return; }
    update(dt);
    renderer.render(scene, camera);
  };
  const update = (dt) => {
    elapsed += dt;

    if (input.hit('KeyM')) hud.toggleMap();
    if (input.hit('KeyR')) { radioOn = !radioOn; hud.say(radioOn ? 'Radio on' : 'Radio off', 1.2); }

    // Gather all vehicles: AI traffic plus parked / free ones.
    world.vehicles.length = 0;
    for (const a of traffic.agents) world.vehicles.push(a.v);
    for (const v of free) world.vehicles.push(v);

    const wasIn = player.vehicle;
    player.update(dt, input, rig.yaw, world);
    if (player.vehicle && !free.includes(player.vehicle)) free.push(player.vehicle);
    if (player.vehicle !== wasIn) audio.radio(!!player.vehicle && radioOn);
    if (player.vehicle) audio.radio(radioOn);
    world.focus.x = player.pos.x; world.focus.z = player.pos.z;

    // Unoccupied vehicles coast to a stop.
    for (const v of free) if (v !== player.vehicle && v.speed > 0.05) v.update(dt, null, world);
    resolveVehicleContacts(free, traffic, world, player);

    // Things traffic must not run over.
    world.obstacles.length = 0;
    if (player.vehicle) world.obstacles.push({ x: player.vehicle.x, z: player.vehicle.z, r: player.vehicle.spec.length / 2, isPlayer: true });
    else if (player.y < 0.05) world.obstacles.push(player);
    for (const v of free) if (v !== player.vehicle) world.obstacles.push({ x: v.x, z: v.z, r: v.spec.length / 2 });
    streetLife.collectObstacles(world.obstacles);

    traffic.update(dt, world);
    streetLife.update(dt, world);
    metro.update(dt);
    city.update(dt, elapsed);
    missions.update(dt, input, player);
    wanted.update(dt);
    pruneFree(free, player, scene);

    // Prompt to enter nearby vehicles.
    if (!player.vehicle) {
      let near = null;
      for (const v of world.vehicles) {
        const d = Math.hypot(v.x - player.x, v.z - player.z) - v.spec.length / 2;
        if (d < 2.2 && (!near || d < near.d)) near = { v, d };
      }
      hud.prompt(near ? (near.v.driver === 'ai' ? `F  "Borrow" the ${near.v.spec.label}` : `F  Get in the ${near.v.spec.label}`) : '');
    } else hud.prompt(player.vehicle.speed > 8 ? '' : 'F  Get out');

    if (!window.__freeCam) rig.update(dt, input, player, colliders);
    audio.engine(player.vehicle);
    followSun(sun, world.focus);
    hud.update(dt, player, rig.yaw, missions.markers);
    input.endFrame();
  };
  tick();
  // Debug/test hook: advance the simulation without rendering.
  const step = (n = 1, dt = 1 / 60) => { for (let k = 0; k < n; k++) update(dt); };
  window.__game = { scene, player, traffic, layout, renderer, camera, rig, missions, hud, streetLife, free, input, step, wanted };
}

function setupEnvironment(scene, renderer) {
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - SUN_ELEVATION), THREE.MathUtils.degToRad(SUN_AZIMUTH));
  const makeSky = () => {
    const sky = new Sky();
    sky.scale.setScalar(2000);
    const u = sky.material.uniforms;
    u.turbidity.value = 3.5;
    u.rayleigh.value = 2.2;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(sunDir);
    return sky;
  };
  scene.add(makeSky());

  // Image-based lighting from the same sky, for reflections on glass and paint.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(makeSky());
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 3000).texture;
  scene.environmentIntensity = 0.55;

  scene.fog = new THREE.Fog(0xaebdcc, 150, 750);

  const hemi = new THREE.HemisphereLight(0xc4d8ee, 0x8a7560, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6c4, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 85;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 500 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.userData.dir = sunDir;
  scene.add(sun, sun.target);
  return sun;
}

// Keep the shadow frustum centred on the player, snapped to texels to avoid shimmer.
function followSun(sun, focus) {
  const texel = (85 * 2) / 2048;
  const x = Math.round(focus.x / texel) * texel, z = Math.round(focus.z / texel) * texel;
  sun.target.position.set(x, 0, z);
  sun.position.set(x + sun.userData.dir.x * 250, sun.userData.dir.y * 250, z + sun.userData.dir.z * 250);
}

// Vehicle-vehicle collisions for free/player vehicles against everything else.
const _ca = [], _cb = [];
function resolveVehicleContacts(free, traffic, world, player) {
  const all = world.vehicles;
  for (const a of free) {
    if (a.speed < 0.05 && a !== player.vehicle) continue;
    for (const b of all) {
      if (a === b) continue;
      const reach = (a.spec.length + b.spec.length) / 2 + 1;
      if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach) continue;
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
              if (-vn > 9 && b.type !== 'bus') {
                traffic.release(agent);
                const k = (a.mass / (a.mass + b.mass)) * -vn * 1.4;
                b.vx -= nx * k; b.vz -= nz * k;
                if (b.rider && b.type === 'scooter') {
                  const opts = { outfit: b.rider.outfit, helmet: true };
                  b.removeRider();
                  const p = world.streetLife.spawnFleeing(b.x, b.z, a.x, a.z, opts);
                  world.streetLife.knock(p, -nx * 6, -nz * 6, world.audio);
                }
                free.push(b);
                if (a.driver === 'player') world.wanted.add(1, 'Reckless driving');
              } else {
                agent.stunned = 2;
                if (a.driver === 'player' && -vn > 3 && Math.random() < 0.5) world.hud.say(LINES.bumped[Math.floor(Math.random() * LINES.bumped.length)], 2.5);
              }
            }
          } else {
            const ia = 1 / a.mass, ib = 1 / b.mass;
            a.x += nx * pen * ia / (ia + ib); a.z += nz * pen * ia / (ia + ib);
            b.x -= nx * pen * ib / (ia + ib); b.z -= nz * pen * ib / (ia + ib);
            if (vn < 0) {
              const j = (-(1.3) * vn) / (ia + ib);
              a.vx += nx * j * ia; a.vz += nz * j * ia;
              b.vx -= nx * j * ib; b.vz -= nz * j * ib;
            }
          }
          if (-vn > 3) { world.audio.thud(Math.min(1, -vn / 15)); if (a.driver === 'player') world.shake(Math.min(0.5, -vn / 30)); }
          a.circles(_ca); b.circles(_cb);
        }
      }
      if (!ai) b.syncVisual(0, world);
    }
  }
}

// Don't let abandoned vehicles pile up forever.
function pruneFree(free, player, scene) {
  if (free.length <= 40) return;
  let worst = -1, worstD = 0;
  free.forEach((v, k) => {
    if (v === player.vehicle) return;
    const d = Math.hypot(v.x - player.pos.x, v.z - player.pos.z);
    if (d > 150 && d > worstD) { worstD = d; worst = k; }
  });
  if (worst >= 0) { scene.remove(free[worst].group); free.splice(worst, 1); }
}

init();
