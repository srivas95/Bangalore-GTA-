// Day/night cycle and monsoon weather: sun & moon, sky, stars, rain streaks, lightning,
// wet roads, and flood water that fills underpasses and then the roads themselves.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { sharedUniforms } from '../world/meshBuilder.js';
import { floodMaterial } from '../world/infrastructure.js';
import { WORLD_MIN, WORLD_MAX } from '../config.js';

const DAY_MINUTES = 24; // real minutes per in-game day
const UNDERPASS_MAX_WATER = 1.0; // metres above the underpass floor at the peak of a storm
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

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
    this.envTimer = 0;
    this.night = 0;

    this.sunDir = new THREE.Vector3();
    this.sky = this.makeSky();
    scene.add(this.sky);
    this.envSky = this.makeSky();
    this.envScene = new THREE.Scene();
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    scene.environmentIntensity = 0.55;

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
    scene.add(this.sun, this.sun.target);

    // Lights that always exist (changing light count forces shader recompiles): headlights, police strobes.
    this.headlight = new THREE.SpotLight(0xfff2d8, 0, 70, 0.55, 0.5, 1.2);
    this.headTarget = new THREE.Object3D();
    scene.add(this.headlight, this.headTarget);
    this.headlight.target = this.headTarget;
    this.strobeR = new THREE.PointLight(0xff2020, 0, 30, 1.5);
    this.strobeB = new THREE.PointLight(0x2050ff, 0, 30, 1.5);
    scene.add(this.strobeR, this.strobeB);

    this.buildStars();
    this.buildRain();
    this.buildRoadFlood();
    this.updateSky(true);
  }

  makeSky() {
    const sky = new Sky();
    sky.scale.setScalar(2000);
    return sky;
  }

  buildStars() {
    const n = 1500, pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const u = Math.random() * Math.PI * 2, v = Math.random() * 0.9 + 0.05;
      const r = 1500;
      pos[k * 3] = Math.cos(u) * Math.sqrt(1 - v * v) * r;
      pos[k * 3 + 1] = v * r;
      pos[k * 3 + 2] = Math.sin(u) * Math.sqrt(1 - v * v) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf4f0e0, fog: false, transparent: true, opacity: 0 }));
    this.scene.add(this.moon);
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
    const size = WORLD_MAX - WORLD_MIN;
    const g = new THREE.PlaneGeometry(size, size);
    g.rotateX(-Math.PI / 2);
    this.flood = new THREE.Mesh(g, floodMaterial);
    this.flood.position.set((WORLD_MIN + WORLD_MAX) / 2, 0, (WORLD_MIN + WORLD_MAX) / 2);
    this.flood.visible = false;
    this.flood.renderOrder = 2;
    this.scene.add(this.flood);
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

  updateSky(force = false) {
    const h = this.hour;
    const elev = Math.sin(((h - 6) / 12) * Math.PI) * 72; // degrees
    const az = 90 + ((h - 6) / 12) * 180; // rises in the east, sets in the west
    const rain = this.rain;
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(az));
    for (const sky of [this.sky, this.envSky]) {
      const u = sky.material.uniforms;
      u.turbidity.value = lerp(3.5, 14, rain);
      u.rayleigh.value = lerp(2.2, 0.5, rain);
      u.mieCoefficient.value = lerp(0.004, 0.03, rain);
      u.mieDirectionalG.value = 0.82;
      u.sunPosition.value.copy(this.sunDir);
    }
    if (force || this.envTimer <= 0) {
      this.envTimer = 3;
      const old = this.envTarget;
      this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 3000);
      this.scene.environment = this.envTarget.texture;
      old?.dispose(); // dispose the whole render target, not just its texture
    }
    return elev;
  }

  update(dt, focus, player, police) {
    // Time.
    this.hour = (this.hour + (dt * this.timeScale) / (DAY_MINUTES * 60 / 24)) % 24;
    this.envTimer -= dt; // real time, so time-lapse doesn't regenerate it every frame
    // Weather schedule (real time).
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) this.setRain(!this.raining);
    this.rain += Math.sign(this.rainTarget - this.rain) * Math.min(Math.abs(this.rainTarget - this.rain), dt / 12);

    const elev = this.updateSky();
    const night = 1 - smooth(-6, 8, elev);
    this.night = night;
    const day = 1 - night;
    const low = 1 - smooth(5, 30, elev); // golden hour
    const rain = this.rain;

    // Sun by day, moon by night (same light).
    if (elev > -2) {
      this.sun.color.setHSL(lerp(0.11, 0.07, low), lerp(0.35, 0.8, low), lerp(0.85, 0.68, low));
      this.sun.intensity = 2.8 * smooth(-2, 10, elev) * (1 - rain * 0.8);
      this.lightDir = this.sunDir;
    } else {
      this.sun.color.set(0x9db4e8);
      this.sun.intensity = 0.35 * (1 - rain * 0.7);
      this.lightDir = this.sunDir.clone().negate();
      this.lightDir.y = Math.abs(this.lightDir.y) + 0.3;
      this.lightDir.normalize();
    }
    this.hemi.intensity = lerp(0.22, 0.75, day) * (1 - rain * 0.35) + this.flash * 2.5;
    this.hemi.color.setHSL(0.6, lerp(0.35, 0.4, day), lerp(0.35, 0.78, day));
    this.hemi.groundColor.setHSL(0.08, 0.25, lerp(0.08, 0.35, day));
    this.scene.environmentIntensity = lerp(0.12, 0.55, day) * (1 - rain * 0.4) + this.flash;
    this.renderer.toneMappingExposure = lerp(0.75, 1.05, night) + this.flash * 0.6;

    // Fog: hazy blue by day, warm at dusk, deep blue at night, grey and close in the rain.
    const fc = new THREE.Color(0xaebdcc).lerp(new THREE.Color(0xd0a888), low * day * 0.7).lerp(new THREE.Color(0x0c1220), night);
    fc.lerp(new THREE.Color(day > 0.5 ? 0x8a9298 : 0x1a1e24), rain * 0.85);
    this.scene.fog.color.copy(fc);
    this.scene.fog.near = lerp(150, 25, rain);
    this.scene.fog.far = lerp(lerp(800, 520, night), 240, rain);

    this.sky.position.copy(this.camera.position);
    // Under monsoon clouds the sky is a flat grey: show the fog colour instead of the clear-sky model.
    const overcast = rain > 0.45;
    this.sky.visible = !overcast;
    this.scene.background = overcast ? this.scene.fog.color : null;
    // Stars, moon.
    this.stars.material.opacity = night * (1 - rain);
    this.stars.position.copy(this.camera.position);
    const md = this.sunDir.clone().negate();
    this.moon.position.copy(this.camera.position).addScaledVector(md, 1400);
    this.moon.material.opacity = smooth(0.3, 1, night) * (1 - rain) * (md.y > 0 ? 1 : 0);

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

    // Shadow frustum follows the player, snapped to texels to avoid shimmer.
    const texel = (85 * 2) / 2048;
    const x = Math.round(focus.x / texel) * texel, z = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + this.lightDir.x * 250, this.lightDir.y * 250, z + this.lightDir.z * 250);

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

  clockString() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
  }
}
