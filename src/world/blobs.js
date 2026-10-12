// Soft contact shadows under vehicles and people, so they sit on the road even with real-time
// shadows off (phones) and look grounded with them on. One instanced draw for all of them.
// Anything added straight to the scene with userData.blob = { w, l } gets one.
import * as THREE from 'three';

// A black quad whose opacity falls off towards a rounded-rectangle edge (a car's shadow runs its
// whole length). Built on MeshBasicMaterial so it renders the same with or without bloom.
function blobMaterial() {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBlobUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlobUv = uv;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBlobUv;')
      .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
  vec2 bq = abs(vBlobUv - 0.5) * 2.0;
  diffuseColor.a *= 1.0 - smoothstep(0.5, 1.0, pow(pow(bq.x, 4.0) + pow(bq.y, 4.0), 0.25));`);
  };
  mat.customProgramCacheKey = () => 'blob';
  return mat;
}

export class BlobShadows {
  constructor(scene, max = 500, range = 110) {
    this.scene = scene;
    this.range = range;
    this.lift = 0.04;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = blobMaterial();
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'blobs';
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  // linear: true when drawing into the (linear) bloom buffer, where the same opacity darkens
  // much less than when blending straight onto the screen.
  update(camera, linear = false) {
    this.mesh.material.opacity = linear ? 0.92 : 0.72;
    const { mesh, _m: m, _q: q, _p: p, _s: s } = this;
    const max = mesh.instanceMatrix.count, r2 = this.range * this.range;
    const cx = camera.position.x, cz = camera.position.z;
    let n = 0;
    for (const o of this.scene.children) {
      const b = o.userData.blob;
      if (!b || !o.visible) continue;
      const dx = o.position.x - cx, dz = o.position.z - cz;
      if (dx * dx + dz * dz > r2) continue;
      q.setFromAxisAngle(this._up, o.rotation.y);
      m.compose(p.set(o.position.x, o.position.y + this.lift, o.position.z), q, s.set(b.w, 1, b.l));
      mesh.setMatrixAt(n++, m);
      if (n >= max) break;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }
}
