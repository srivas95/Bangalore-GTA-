// Third-person orbit camera that follows the player or their vehicle.
// Smoothing is frame-rate independent (1 - e^(-k dt)), and in a vehicle the camera is locked to
// the car in the ground plane (only the height is eased): any lag between the two is what reads
// as judder when frame times wobble, as they do on phones.
import * as THREE from 'three';

const ease = (k, dt) => 1 - Math.exp(-k * dt);
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI; // camera sits at +(sin yaw, cos yaw) from the target
    this.pitch = 0.32;
    this.dist = 5;
    this.boom = 5; // the boom length actually used, after buildings shorten it
    this.zoom = 1;
    this.idle = 0;
    this.target = new THREE.Vector3();
    this.lead = new THREE.Vector2(); // smoothed look-ahead in a vehicle
    this.shakeAmt = 0;
    this.current = new THREE.Vector3();
    this.first = true;
    this.sens = 1;
    this.invert = false;
  }

  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  // Free length of the boom from the target along (dx, dy, dz): the first blocked point found
  // in coarse steps, refined by bisection so the length changes smoothly as the camera slides
  // along a wall instead of jumping a step at a time.
  freeLength(colliders, dx, dy, dz, max) {
    const t = this.target;
    const blocked = (s) => colliders.pointBlocked(t.x + dx * s, t.z + dz * s, t.y + dy * s);
    let lo = 0.4, hi = -1;
    for (let s = 0.8; s <= max + 1e-6; s += 0.8) {
      if (blocked(s)) { hi = s; break; }
      lo = s;
    }
    if (hi < 0) return blocked(max) ? Math.max(1.2, max - 0.6) : max;
    for (let k = 0; k < 5; k++) { const m = (lo + hi) / 2; if (blocked(m)) hi = m; else lo = m; }
    return Math.max(1.2, lo - 0.35);
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
        if (v.speed > 6 && along > 0) aim += wrap(travel - aim) * 0.55;
        this.yaw += wrap(aim + Math.PI - this.yaw) * ease(2.2 + Math.min(3, v.speed / 10), dt);
        this.pitch += (0.2 - this.pitch) * ease(1.5, dt);
      }
      // Look behind.
      this.lookBack = input.down('KeyC');
      // Look a little ahead of the car at speed (smoothed: velocity changes slowly).
      const k = ease(3, dt), la = Math.min(1, v.speed / 25) * 0.06;
      this.lead.x += (v.vx * la - this.lead.x) * k;
      this.lead.y += (v.vz * la - this.lead.y) * k;
      tx += this.lead.x; tz += this.lead.y;
    } else {
      this.lead.set(0, 0);
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
    const want = baseDist * (player.aiming ? 1 : this.zoom) * (1 + sp * 0.35);
    this.dist += (want - this.dist) * ease(player.aiming ? 10 : 3, dt);
    if (this.first) {
      this.target.set(tx, ty, tz);
    } else if (v) {
      // Locked to the vehicle across the ground (after a short blend in when you get in);
      // heights eased (kerbs, landings).
      this.lock = Math.min(1, (this.lock || 0) + dt * 2.5);
      const k = Math.max(ease(14, dt), this.lock * this.lock);
      this.target.x += (tx - this.target.x) * k; this.target.z += (tz - this.target.z) * k;
      this.target.y += (ty - this.target.y) * ease(10, dt);
    } else {
      this.lock = 0;
      this.target.lerp(this.current.set(tx, ty, tz), ease(14, dt));
    }

    const cp = Math.cos(this.pitch), spch = Math.sin(this.pitch);
    const yaw = v && this.lookBack ? v.heading : this.yaw;
    const dirX = Math.sin(yaw) * cp, dirY = spch, dirZ = Math.cos(yaw) * cp;
    // Shorten the boom if a building is in the way: in at once (never look through a wall),
    // back out smoothly.
    const free = this.freeLength(colliders, dirX, dirY, dirZ, this.dist);
    if (this.first || free < this.boom) this.boom = free;
    else this.boom += (free - this.boom) * ease(4, dt);
    this.first = false;
    const d = this.boom;
    const cam = this.camera;
    // (Never below the street, or a metre under the target in an underpass.)
    cam.position.set(this.target.x + dirX * d, Math.max(this.target.y + dirY * d, Math.min(0.4, this.target.y - 1)), this.target.z + dirZ * d);
    if (this.shakeAmt > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 6);
      if (this.shakeAmt < 0.01) this.shakeAmt = 0;
    }
    cam.lookAt(this.target);
    // Speed-based FOV kick.
    const fov = player.aiming ? 50 : 62 + sp * 12;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * ease(3, dt); cam.updateProjectionMatrix(); }
  }
}
