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
    this.first = true;
  }

  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  update(dt, input, player, colliders) {
    const v = player.vehicle;
    if (input.mouseDX || input.mouseDY) this.idle = 0; else this.idle += dt;
    this.yaw -= input.mouseDX * 0.0025;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouseDY * 0.002, -0.15, 1.2);
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
        this.yaw += d * Math.min(1, dt * (2.2 + Math.min(3, v.speed / 10)));
        this.pitch += (0.2 - this.pitch) * Math.min(1, dt * 1.5);
      }
      // Look behind.
      if (input.down('KeyC')) { this.lookBack = true; } else this.lookBack = false;
    } else {
      tx = player.x; tz = player.z; ty = player.y + 1.55;
      baseDist = 4.2;
    }
    // Pull back a little at speed.
    const sp = v ? Math.min(1, v.speed / 30) : 0;
    const want = baseDist * this.zoom * (1 + sp * 0.35);
    this.dist += (want - this.dist) * Math.min(1, dt * 3);
    const lerp = this.first ? 1 : Math.min(1, dt * 12);
    this.target.lerp(this.current.set(tx, ty, tz), lerp);
    this.first = false;

    const cp = Math.cos(this.pitch), spch = Math.sin(this.pitch);
    const yaw = v && this.lookBack ? v.heading : this.yaw;
    const dirX = Math.sin(yaw) * cp, dirY = spch, dirZ = Math.cos(yaw) * cp;
    // Shorten the boom if a building is in the way.
    let d = this.dist;
    for (let s = 0.5; s <= this.dist; s += 0.5) {
      const px = this.target.x + dirX * s, py = this.target.y + dirY * s, pz = this.target.z + dirZ * s;
      if (colliders.pointBlocked(px, pz, py)) { d = Math.max(1.2, s - 0.6); break; }
    }
    const cam = this.camera;
    cam.position.set(this.target.x + dirX * d, Math.max(0.4, this.target.y + dirY * d), this.target.z + dirZ * d);
    if (this.shakeAmt > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 6);
      if (this.shakeAmt < 0.01) this.shakeAmt = 0;
    }
    cam.lookAt(this.target);
    // Speed-based FOV kick.
    const fov = 62 + sp * 12;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }
  }
}
