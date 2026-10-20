// Third-person orbit camera that follows the player or their vehicle.
import * as THREE from 'three';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI; // camera sits at +(sin yaw, cos yaw) from the target
    this.pitch = 0.32;
    this.dist = 5;
    this.zoom = 1;
    this.idle = 0;
    this.target = new THREE.Vector3();
    this.shakeAmt = 0;
    this.current = new THREE.Vector3();
    this.base = new THREE.Vector3(); // what's followed, smoothed
    this.off = new THREE.Vector3(); // eases out the jump when switching what's followed
    this.vel = new THREE.Vector3(); // smoothed velocity of a followed vehicle
    this.mode = null;
    this.boom = 5;
    this.first = true;
    this.sens = 1;
    this.invert = false;
  }

  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  update(dt, input, player, colliders) {
    const v = player.vehicle;
    if (input.mouseDX || input.mouseDY) this.idle = 0; else this.idle += dt;
    this.yaw -= input.mouseDX * 0.0025 * this.sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouseDY * 0.002 * this.sens * (this.invert ? -1 : 1), -0.15, 1.2);
    if (input.wheel) this.zoom = THREE.MathUtils.clamp(this.zoom + input.wheel * 0.1, 0.5, 2.2);

    let tx, ty, tz, baseDist;
    if (v) {
      tx = v.x; tz = v.z; ty = v.y + (v.type === 'bus' ? 3.2 : v.spec.twoWheeler ? 1.4 : 1.6);
      baseDist = v.spec.cam;
      // Chase cam: swing in behind the car once the mouse is left alone. When the car slides,
      // follow the direction of travel rather than the bonnet, so drifts read from the side.
      if (this.idle > 0.9 && v.speed > 1.5) {
        const travel = Math.atan2(v.vx, v.vz);
        const along = v.forwardSpeed >= 0 ? 1 : -1;
        let aim = along > 0 ? v.heading : v.heading + Math.PI;
        if (v.speed > 6 && along > 0) {
          let dv = travel - aim;
          while (dv > Math.PI) dv -= Math.PI * 2;
          while (dv < -Math.PI) dv += Math.PI * 2;
          aim += dv * 0.55;
        }
        let d = aim + Math.PI - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * (1 - Math.exp(-dt * (2.2 + Math.min(3, v.speed / 10))));
        this.pitch += (0.2 - this.pitch) * (1 - Math.exp(-dt * 1.5));
      }
      // Look behind.
      if (input.down('KeyC')) { this.lookBack = true; } else this.lookBack = false;
    } else {
      tx = player.x; tz = player.z; ty = player.y + 1.55;
      baseDist = 4.2;
      if (player.aiming) {
        // Over the right shoulder.
        baseDist = 2.1;
        tx += Math.cos(this.yaw) * 0.55; tz -= Math.sin(this.yaw) * 0.55; ty += 0.1;
      }
    }
    // Pull back a little at speed.
    const sp = v ? Math.min(1, v.speed / 30) : 0;
    const want = baseDist * (player.aiming ? 1 : this.zoom) * (1 + sp * 0.2);
    // All smoothing is exponential in dt, so it behaves the same at any frame rate (a plain
    // `lerp(dt * k)` lags by a different amount each frame, and the car jittered on screen).
    const ease = (k) => 1 - Math.exp(-dt * k);
    this.dist += (want - this.dist) * ease(player.aiming ? 10 : 3);
    const base = this.base, same = !this.first && this.mode === (v || null);
    if (v) {
      // A vehicle is followed rigidly, a fixed fraction of a second behind (from its smoothed
      // velocity): smooth at any speed, and still a touch of give when it lurches.
      if (!same) this.vel.set(v.vx || 0, 0, v.vz || 0);
      this.vel.x += ((v.vx || 0) - this.vel.x) * ease(8);
      this.vel.z += ((v.vz || 0) - this.vel.z) * ease(8);
      // Bumps and kerbs: ease the height only.
      base.set(tx - this.vel.x * 0.05, same ? base.y + (ty - base.y) * ease(10) : ty, tz - this.vel.z * 0.05);
    } else if (same) base.lerp(this.current.set(tx, ty, tz), ease(14));
    else base.set(tx, ty, tz);
    // Getting in or out: blend from where the camera was looking over half a second or so.
    if (!same) {
      if (this.first) this.off.set(0, 0, 0); else this.off.copy(this.target).sub(base);
      this.mode = v || null;
    }
    this.off.multiplyScalar(1 - ease(6));
    this.target.copy(base).add(this.off);
    this.first = false;

    const cp = Math.cos(this.pitch), spch = Math.sin(this.pitch);
    const yaw = v && this.lookBack ? v.heading : this.yaw;
    const dirX = Math.sin(yaw) * cp, dirY = spch, dirZ = Math.cos(yaw) * cp;
    // Shorten the boom if a building is in the way: straight away (never look through a wall),
    // but swing back out smoothly once it's clear. Bisect for the exact spot, so it doesn't step.
    const blocked = (s) => colliders.camBlocked(this.target.x + dirX * s, this.target.z + dirZ * s, this.target.y + dirY * s);
    let d = this.dist;
    for (let s = 0.5; s <= this.dist; s += 0.5) {
      if (!blocked(s)) continue;
      let lo = s - 0.5, hi = s;
      for (let k = 0; k < 4; k++) { const m = (lo + hi) / 2; if (blocked(m)) hi = m; else lo = m; }
      d = Math.max(1.2, lo - 0.4);
      break;
    }
    this.boom = d < this.boom ? d : this.boom + (d - this.boom) * ease(4);
    d = this.boom;
    const cam = this.camera;
    cam.position.set(this.target.x + dirX * d, Math.max(0.4, this.target.y + dirY * d), this.target.z + dirZ * d);
    if (this.shakeAmt > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 6);
      if (this.shakeAmt < 0.01) this.shakeAmt = 0;
    }
    cam.lookAt(this.target);
    // A gentle speed-based FOV kick (a strong one stretched and smeared the edges of the screen).
    const fov = player.aiming ? 50 : 62 + sp * 4;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * ease(3); cam.updateProjectionMatrix(); }
  }
}
