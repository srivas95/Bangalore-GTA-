// Day/night cycle and monsoon weather: sun & moon, sky, rain streaks, lightning, wet roads, and
// flood water that fills underpasses and then the roads themselves.
import * as THREE from 'three';
import { Sky, makeSkyline } from '../world/sky.js';
import { sharedUniforms } from '../world/meshBuilder.js';
import { floodMaterial } from '../world/infrastructure.js';

const DAY_MINUTES = 24; // real minutes per in-game day
const UNDERPASS_MAX_WATER = 1.0; // metres above the underpass floor at the peak of a storm
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const C = (hex) => new THREE.Color(hex);
// Sunlight colour by elevation: deep orange at the horizon to near-white at midday.
const SUN_KEYS = [[0, C(0xff8a4a)], [4, C(0xffb070)], [10, C(0xffd2a0)], [20, C(0xffe8c8)], [40, C(0xfff4e4)]];
const MOON = C(0xb0c4ee);
const _c1 = new THREE.Color(), _c2 = new THREE.Color();

export class Environment {
  constructor(scene, renderer, camera, layout, city) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.layout = layout;
    this.city = city;
    this.hour = 16.5;
    this.timeScale = 1;
    this.rain = 0;
    this.rainTarget = 0;
    this.weatherTimer = 150 + Math.random() * 120; // real seconds until the first shower
    this.wetness = 0;
    this.accum = 0; // how full the storm drains are, 0..1
    this.roadFlood = 0;
    this.flash = 0;
    this.nextLightning = 8;
    this.night = 0;
    this.elev = 0;
    this.time = 0;
    this.clouds = 0.22 + Math.random() * 0.2; // fair-weather cloud cover drifts over the day

    this.sunDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.sky = new Sky();
    scene.add(this.sky.mesh);
    // Reflections and ambient light come from the same sky, re-baked only when it has changed
    // noticeably, into the same small render targets every time.
    this.envScene = new THREE.Scene();
    this.envScene.add(this.sky.makeMesh(true));
    this.cubeTarget = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCamera = new THREE.CubeCamera(0.1, 100, this.cubeTarget);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = null;
    this.envKey = null;
    this.envCooldown = 0;
    scene.environmentIntensity = 0.55;
    this.skyline = makeSkyline();
    scene.add(this.skyline);

    scene.fog = new THREE.Fog(0xaebdcc, 150, 800);
    this.hemi = new THREE.HemisphereLight(0xc4d8ee, 0x8a7560, 0.7);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe6c4, 2.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const S = 85;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 500 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun, this.sun.target);
    // The shadow map holds only the static city (vehicles and people have soft contact shadows),
    // so it's redrawn only when the light moves: the sun turning, or the area re-centring.
    this.shadowSize = S;
    this.shadowNeedsUpdate = true;
    this.shadowEvery = 1; // (kept for older callers)

    // Lights that always exist (changing light count forces shader recompiles): headlights, police strobes.
    this.headlight = new THREE.SpotLight(0xfff2d8, 0, 70, 0.55, 0.5, 1.2);
    this.headTarget = new THREE.Object3D();
    scene.add(this.headlight, this.headTarget);
    this.headlight.target = this.headTarget;
    this.strobeR = new THREE.PointLight(0xff2020, 0, 30, 1.5);
    this.strobeB = new THREE.PointLight(0x2050ff, 0, 30, 1.5);
    scene.add(this.strobeR, this.strobeB);

    this.buildRain();
    this.buildRoadFlood();
    this.updateSky(0);
  }

  // Rain streaks: world-anchored line segments wrapped into a box around the camera, animated on the GPU.
  buildRain() {
    const n = 12000;
    const pos = new Float32Array(n * 6), end = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      const x = Math.random() * 80, y = Math.random() * 40, z = Math.random() * 80;
      pos.set([x, y, z, x, y, z], k * 6);
      end[k * 2] = 0; end[k * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainUniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uIntensity: { value: 0 }, uNight: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.rainUniforms,
      transparent: true, depthWrite: false,
      vertexShader: `
        attribute float aEnd; uniform float uTime; uniform vec3 uCam;
        void main() {
          vec3 p = position;
          float y = mod(p.y - uTime * 26.0, 40.0);
          vec3 w = vec3(uCam.x + mod(p.x - uCam.x, 80.0) - 40.0, uCam.y - 14.0 + y + aEnd * 0.9, uCam.z + mod(p.z - uCam.z, 80.0) - 40.0);
          w.x += aEnd * 0.15;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `
        uniform float uIntensity; uniform float uNight;
        void main() { gl_FragColor = vec4(mix(vec3(0.75, 0.8, 0.85), vec3(0.35, 0.38, 0.45), uNight), 0.32 * uIntensity); }`,
    });
    this.rainMesh = new THREE.LineSegments(g, m);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    this.rainCount = n;
    this.scene.add(this.rainMesh);
  }

  // One plane at road level: blocks and footpaths are raised by the kerb, so only roads go under.
  buildRoadFlood() {
    const W = this.layout.world;
    const g = new THREE.PlaneGeometry(W.maxX - W.minX, W.maxZ - W.minZ);
    g.rotateX(-Math.PI / 2);
    this.flood = new THREE.Mesh(g, floodMaterial);
    this.flood.position.set((W.minX + W.maxX) / 2, 0, (W.minZ + W.maxZ) / 2);
    this.flood.visible = false;
    this.flood.renderOrder = 2;
    this.scene.add(this.flood);
  }

  // Jump the clock forward by `secs` of game time (fast travel).
  skip(secs) {
    this.hour = (this.hour + secs / (DAY_MINUTES * 60 / 24)) % 24;
  }

  setRain(on) {
    this.rainTarget = on ? 0.75 + Math.random() * 0.25 : 0;
    this.weatherTimer = on ? 150 + Math.random() * 120 : 200 + Math.random() * 200;
  }

  get raining() { return this.rainTarget > 0; }

  // Water depth at a point (y disambiguates the flyover deck from the road beneath).
  waterDepth(x, z, y) {
    const g = this.layout.groundHeight(x, z, y);
    let d = 0;
    const u = this.layout.underpassAt(x, z);
    if (u) d = Math.max(d, u.waterLevel - g);
    if (this.roadFlood > 0.005 && g < 0.06 && g > -0.5) d = Math.max(d, this.roadFlood - g);
    return Math.max(0, d);
  }

  // Sun position, sky colours, and (when it has changed enough) the image-based lighting.
  updateSky(dt) {
    const h = this.hour;
    const elev = Math.sin(((h - 6) / 12) * Math.PI) * 72; // degrees
    const az = 90 + ((h - 6) / 12) * 180; // rises in the east, sets in the west
    this.elev = elev;
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(az));
    this.sky.update(this.sunDir, elev, this.rain, this.time, this.clouds);
    this.envCooldown -= dt;
    // Small steps (1° of sun, an eighth of the rain), so the city's light never visibly jumps.
    const key = Math.round(elev) * 100 + Math.round(this.rain * 16);
    if (key !== this.envKey && this.envCooldown <= 0) {
      this.envKey = key;
      this.envCooldown = 0.25;
      this.cubeCamera.update(this.renderer, this.envScene);
      this.envTarget = this.pmrem.fromCubemap(this.cubeTarget.texture, this.envTarget);
      this.scene.environment = this.envTarget.texture;
    }
    return elev;
  }

  update(dt, focus, player, police) {
    // Time.
    this.hour = (this.hour + (dt * this.timeScale) / (DAY_MINUTES * 60 / 24)) % 24;
    this.time += dt;
    // Weather schedule (real time).
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) this.setRain(!this.raining);
    this.rain += Math.sign(this.rainTarget - this.rain) * Math.min(Math.abs(this.rainTarget - this.rain), dt / 12);
    this.clouds = Math.min(0.55, Math.max(0.1, this.clouds + (Math.sin(this.time * 0.013) * 0.5 + 0.2 - this.clouds) * dt * 0.01));

    const elev = this.updateSky(dt);
    // City lights come on through dusk: half by sunset plus a few minutes, fully by -8 degrees.
    const night = 1 - smooth(-8, 3, elev);
    this.night = night;
    const day = 1 - night;
    const rain = this.rain;
    const sky = this.sky;

    // Sun by day, moon by night (same light).
    if (elev > -1) {
      let k = 1;
      while (k < SUN_KEYS.length - 1 && elev > SUN_KEYS[k][0]) k++;
      const [e0, c0] = SUN_KEYS[k - 1], [e1, c1] = SUN_KEYS[k];
      this.sun.color.copy(c0).lerp(c1, Math.min(1, Math.max(0, (elev - e0) / (e1 - e0))));
      this.sun.intensity = 3.5 * smooth(-1, 8, elev) * (1 - rain * 0.8);
      this.lightDir.copy(this.sunDir);
    } else {
      // A bright, blue moon: night should read as night but stay playable (on phones too).
      this.sun.color.copy(MOON);
      this.sun.intensity = 1.1 * smooth(-1, -6, elev) * (1 - rain * 0.6);
      this.lightDir.copy(this.sunDir).negate();
      this.lightDir.y = Math.abs(this.lightDir.y) + 0.3;
      this.lightDir.normalize();
    }
    // Ambient from the sky itself: a pale sky tint from above (real skylight is much less blue
    // than the sky looks), warm ground bounce from below; bluer by night.
    _c1.copy(sky.zenith).lerp(sky.horizon, 0.35);
    const lum = Math.max(1e-4, _c1.r * 0.3 + _c1.g * 0.59 + _c1.b * 0.11);
    _c1.lerp(_c2.setScalar(lum), 0.55 * day);
    this.hemi.color.copy(_c1).multiplyScalar(Math.min(4, 0.62 / lum)).lerp(_c2.setRGB(0.55, 0.62, 0.8), night * 0.6);
    this.hemi.groundColor.setHSL(0.08, 0.28, lerp(0.2, 0.36, day));
    // Nights get more fill than is physical: the tone curve's toe crushes dark values (and turns a
    // faintly blue night navy), and the streets have to stay readable on a phone.
    this.hemi.intensity = lerp(0.8, 0.55, day) * (1 - rain * 0.3) + this.flash * 2.5;
    this.scene.environmentIntensity = lerp(0.6, 0.5, day) * (1 - rain * 0.35) + this.flash;
    this.renderer.toneMappingExposure = lerp(0.95, 1.5, night) + this.flash * 0.6;

    // Fog takes the horizon's colour exactly, so the city fades into the sky (aerial perspective)
    // and nothing lost in the haze shows as a silhouette against it.
    this.scene.fog.color.copy(sky.horizon);
    this.scene.fog.near = lerp(150, 25, rain);
    this.scene.fog.far = lerp(lerp(800, 560, night), 240, rain) * (this.drawDist ?? 1);
    this.scene.fog.near = Math.min(this.scene.fog.near, this.scene.fog.far * 0.5);
    this.scene.background = null;

    // Distant skyline: just past the fog, coloured like the haze it stands in.
    const sl = this.skyline;
    const R = Math.min(this.camera.far * 0.9, this.scene.fog.far * 1.3 + 150);
    sl.visible = rain < 0.6 && R > 300;
    sl.scale.setScalar(R);
    sl.position.set(this.camera.position.x, 0, this.camera.position.z);
    const su = sl.userData.uniforms;
    su.uHaze.value.copy(this.scene.fog.color);
    su.uTone.value.copy(this.scene.fog.color).multiplyScalar(lerp(0.72, 0.45, night)).lerp(_c2.setRGB(0.4, 0.38, 0.36), 0.15 * day)
      .lerp(this.scene.fog.color, smooth(12, 70, this.camera.position.y) * 0.92); // from up high it's haze
    su.uNight.value = smooth(0.4, 1, night) * (1 - rain);

    // Lightning and thunder in heavy rain.
    this.flash = Math.max(0, this.flash - dt * 5);
    if (rain > 0.6) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.flash = 1;
        this.nextLightning = 6 + Math.random() * 14;
        this.onThunder?.(0.4 + Math.random() * 2.5);
      }
    }

    // Rain streaks.
    this.rainMesh.visible = rain > 0.02;
    this.rainUniforms.uTime.value += dt;
    this.rainUniforms.uCam.value.copy(this.camera.position);
    this.rainUniforms.uIntensity.value = rain;
    this.rainUniforms.uNight.value = night;
    this.rainMesh.geometry.setDrawRange(0, Math.floor(this.rainCount * Math.min(1, rain * 1.2)) * 2);

    // Wet roads and flooding.
    this.wetness += ((rain > 0.1 ? 1 : 0) - this.wetness) * Math.min(1, dt / (rain > 0.1 ? 25 : 120));
    // Underpasses collect up to a metre of water at their lowest point after a long shower,
    // enough to slow everyone down and drown a scooter, but not to swallow a bus.
    if (rain > 0.1) this.accum = Math.min(1, this.accum + rain * dt / 210);
    else this.accum = Math.max(0, this.accum - dt / 400);
    for (const u of this.layout.underpasses) {
      u.waterLevel = -u.depth - 0.08 + smooth(0, 1, this.accum) * (UNDERPASS_MAX_WATER + 0.08);
      u.waterMesh.visible = u.waterLevel > -u.depth + 0.02;
      u.waterMesh.position.y = u.waterLevel;
    }
    this.roadFlood = smooth(0.6, 1, this.accum) * 0.08;
    this.flood.visible = this.roadFlood > 0.01;
    this.flood.position.y = Math.max(0.02, this.roadFlood);
    floodMaterial.normalMap.offset.set(this.rainUniforms.uTime.value * 0.02, this.rainUniforms.uTime.value * 0.013);
    floodMaterial.normalScale.setScalar(0.25 + rain * 0.5);
    sharedUniforms.uNight.value = night;
    this.city.setLighting(night, this.wetness);

    // Shadows: the lit area re-centres on the player in coarse steps, and the static shadow map is
    // redrawn only then or when the light has turned by about a third of a degree.
    const step = this.shadowSize / 4, ld = this.lightDir;
    const sx = Math.round(focus.x / step) * step, sz = Math.round(focus.z / step) * step;
    const qx = Math.round(ld.x * 200), qy = Math.round(ld.y * 200), qz = Math.round(ld.z * 200);
    const sk = this.shadowState || (this.shadowState = [NaN, NaN, 0, 0, 0]);
    if (sk[0] !== sx || sk[1] !== sz || sk[2] !== qx || sk[3] !== qy || sk[4] !== qz) {
      sk[0] = sx; sk[1] = sz; sk[2] = qx; sk[3] = qy; sk[4] = qz;
      this.shadowNeedsUpdate = true;
      this.sun.target.position.set(sx, 0, sz);
      this.sun.position.set(sx + ld.x * 250, ld.y * 250, sz + ld.z * 250);
    }

    // Player headlights at night.
    const v = player.vehicle;
    if (v && (night > 0.3 || rain > 0.5)) {
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      this.headlight.position.set(v.x + fx * v.spec.length * 0.5, v.y + 1.0, v.z + fz * v.spec.length * 0.5);
      this.headTarget.position.set(v.x + fx * 25, v.y, v.z + fz * 25);
      this.headlight.intensity = 60 * Math.max(night, rain * 0.6);
    } else this.headlight.intensity = 0;

    // Police strobes from the nearest wailing Hoysala.
    let best = null, bd = 120;
    for (const u of police.units) {
      if (!u.v.siren) continue;
      const d = Math.hypot(u.v.x - focus.x, u.v.z - focus.z);
      if (d < bd) { bd = d; best = u.v; }
    }
    if (v?.siren) best = v;
    if (best) {
      const ph = Math.floor(performance.now() / 120) % 4;
      const k = 8 + night * 25;
      this.strobeR.position.set(best.x, best.y + 2.2, best.z);
      this.strobeB.position.set(best.x, best.y + 2.2, best.z);
      this.strobeR.intensity = ph < 2 ? k : 0;
      this.strobeB.intensity = ph >= 2 ? k : 0;
    } else this.strobeR.intensity = this.strobeB.intensity = 0;
  }

  // 'off' | 'near' | 'full'. Near: a 90 m square at half the resolution (phones).
  setShadows(mode) {
    const near = mode === 'near';
    this.sun.castShadow = mode === 'near' || mode === 'full';
    const size = near ? 1024 : this.maxShadowMap || 2048, S = near ? 45 : 85;
    const sh = this.sun.shadow;
    if (sh.mapSize.x !== size) { sh.mapSize.set(size, size); sh.map?.dispose(); sh.map = null; this.renderer.shadowMap.needsUpdate = true; }
    Object.assign(sh.camera, { left: -S, right: S, top: S, bottom: -S });
    sh.camera.updateProjectionMatrix();
    this.shadowSize = S;
    this.shadowState = null;
    this.shadowNeedsUpdate = true;
  }

  clockString() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
  }
}
