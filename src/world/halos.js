// Soft halos around lights: street lamps, traffic signals, headlights, tail lights and police
// light bars. Camera-facing quads drawn additively in two instanced draws, so lights glow the
// same on every device without a bloom pass.
import * as THREE from 'three';

const VERT = `
uniform float uFar;
varying vec3 vCol;
varying vec2 vUv;
varying float vFade;
void main() {
  vec4 c = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
  float size = length(instanceMatrix[0].xyz);
  float d = -c.z;
  // Pull the quad towards the camera so the lamp's own geometry doesn't cut it.
  c.xyz -= normalize(c.xyz) * min(size * 0.6, max(0.0, d - 0.4));
  c.xy += position.xy * size;
  vFade = smoothstep(1.0, 5.0, d) * (1.0 - smoothstep(uFar * 0.6, uFar, d));
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = vec3(1.0);
  #endif
  vUv = uv;
  gl_Position = projectionMatrix * c;
}`;
const FRAG = `
uniform float uIntensity;
varying vec3 vCol;
varying vec2 vUv;
varying float vFade;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - r), 2.4) + 0.35 * pow(max(0.0, 1.0 - r * 3.0), 2.0);
  gl_FragColor = vec4(vCol * a * uIntensity * vFade, 1.0);
}`;

function haloMesh(max, far) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { uIntensity: { value: 0 }, uFar: { value: far } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, Math.max(1, max));
  mesh.setColorAt(0, new THREE.Color(0));
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 2;
  return mesh;
}

const SODIUM = new THREE.Color(1.0, 0.62, 0.28);
const HEAD = new THREE.Color(1.0, 0.92, 0.75);
const TAIL = new THREE.Color(0.9, 0.05, 0.03);

export class Halos {
  // lamps: [[x, y, z], ...] street-lamp heads.
  constructor(scene, lamps = [], { far = 650 } = {}) {
    this.scene = scene;
    this.lamps = haloMesh(lamps.length, far);
    const m = new THREE.Matrix4();
    lamps.forEach(([x, y, z], k) => {
      this.lamps.setMatrixAt(k, m.makeScale(5, 5, 5).setPosition(x, y, z));
      this.lamps.setColorAt(k, SODIUM);
    });
    this.lamps.count = lamps.length;
    this.lamps.name = 'lampHalos';
    scene.add(this.lamps);
    this.dyn = haloMesh(1500, 260);
    this.dyn.name = 'halos';
    scene.add(this.dyn);
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  _add(x, y, z, size, color, k) {
    const d = this.dyn;
    if (this.n >= d.instanceMatrix.count) return;
    d.setMatrixAt(this.n, this._m.makeScale(size, size, size).setPosition(x, y, z));
    d.setColorAt(this.n, this._c.copy(color).multiplyScalar(k));
    this.n++;
  }

  // night: 0 (day) .. 1 (night). signals: the Signals system (for the lit bulbs).
  // linear: drawing into the bloom pass's linear buffer, where additive light reads far brighter.
  update(camera, night, signals, linear = false) {
    const gain = linear ? 0.3 : 1;
    this.lamps.material.uniforms.uIntensity.value = night * gain;
    this.dyn.material.uniforms.uIntensity.value = gain;
    this.lamps.visible = night > 0.02;
    this.n = 0;
    const cx = camera.position.x, cz = camera.position.z, R2 = 240 * 240;
    // Traffic signals: always a little glow, much more at night.
    if (signals) {
      const sk = 0.25 + 0.75 * night;
      signals.forLitBulbs(cx, cz, 260, (x, y, z, col) => this._add(x, y, z, 1.6, col, sk * 0.7));
    }
    // Vehicles: headlights and tail lights at dusk and night; police light bars whenever the siren's on.
    const v = this._v;
    for (const o of this.scene.children) {
      const veh = o.userData.vehicle;
      if (!veh || !o.visible) continue;
      const dx = o.position.x - cx, dz = o.position.z - cz;
      if (dx * dx + dz * dz > R2) continue;
      if (night > 0.05 && veh.driver && !veh.wrecked) {
        const sp = veh.spec, L = sp.length / 2, W = sp.width;
        const mw = o.matrixWorld;
        if (sp.twoWheeler) {
          v.set(0, 1.0, L).applyMatrix4(mw); this._add(v.x, v.y, v.z, 2.2, HEAD, night);
          v.set(0, 0.85, -L).applyMatrix4(mw); this._add(v.x, v.y, v.z, 0.9, TAIL, night);
        } else {
          const hy = sp.length > 6 ? 1.0 : 0.72;
          for (const s of [-1, 1]) {
            v.set(s * W * 0.33, hy, L).applyMatrix4(mw); this._add(v.x, v.y, v.z, 2.4, HEAD, night);
            v.set(s * W * 0.36, hy + 0.1, -L).applyMatrix4(mw); this._add(v.x, v.y, v.z, 1.1, TAIL, night);
          }
        }
      }
      if (veh.lamps && veh.siren) {
        for (const lamp of veh.lamps) {
          const c = lamp.material.color;
          if (c.r + c.g + c.b < 0.6) continue; // the dark half of the flash
          lamp.getWorldPosition(v);
          this._add(v.x, v.y, v.z, 2.6, c, 0.6 + night * 0.6);
        }
      }
    }
    this.dyn.count = this.n;
    this.dyn.instanceMatrix.needsUpdate = true;
    if (this.dyn.instanceColor) this.dyn.instanceColor.needsUpdate = true;
  }
}
