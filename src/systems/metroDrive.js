// Hijacking Namma Metro: on the platform when a train is in, or while riding one, take over the
// cab (F) and drive it yourself, through the stations without stopping if you like. It earns you
// five stars at once: the Hoysalas follow along the road underneath and wait for you at the next
// station. Stop at a platform and get off (F) to make a run for it.
//   W power · S brake, then reverse · Space emergency brake · H horn · V cab view
import * as THREE from 'three';
import { TRAIN_LEN } from '../world/metro.js';

const ease = (k, dt) => 1 - Math.exp(-k * dt);

export class MetroDrive {
  constructor(metro, hud, audio) {
    this.metro = metro;
    this.hud = hud;
    this.audio = audio;
    this.train = null;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.orbit = 0;
    this.cab = false;
    this.shakeAmt = 0;
  }

  get active() { return !!this.train; }

  // The train a hijacker could take right now, if any.
  candidate(ride) {
    if (ride.state === 'riding') return ride.train;
    if (ride.state === 'platform') return ride.trainHere();
    return null;
  }

  hijack(t, world) {
    const ride = world.metroRide, p = world.player;
    ride.state = null; ride.trip = null; ride.train = null;
    ride.el.classList.remove('show'); ride.tunnel.style.opacity = 0;
    this.train = t;
    t.driver = 'player';
    t.ctrl = { throttle: 0, ebrake: false };
    t.wait = 0; t.reverse = false; t.at = null;
    t.speed = Math.max(0, t.speed);
    t.onCrash = (impact, other) => this.crash(impact, other, world);
    p.human.group.visible = false;
    p.unreachable = true; // the police can't get at you up here (but they can all see you)
    const P = world.police;
    P.crime('Hijacking a Namma Metro train', p.x, p.z, 5, world);
    P.level = 5; P.seenT = 0; P.hud.setStars(5, false);
    this.audio.metroDoors?.();
    this.hud.toast('METRO HIJACKED', `${t.line.name} · ★★★★★`);
    this.hud.say('You\'re in the cab. W power · S brake and reverse · Space emergency brake · H horn · V cab view · stop at a platform and press F to get off.', 7);
    this.hud.vehicleEntered({ spec: { label: `Namma Metro · ${t.line.name}` } });
    this.first = true;
    this.startMotor();
  }

  // Standing at a platform (the middle of the train within a few metres of the station's middle)?
  platformHere(t) {
    const mid = t.s - t.dir * TRAIN_LEN / 2;
    return t.line.stations.find((st) => Math.abs(st.s - mid) < 9) || null;
  }

  leave(st, world) {
    const t = this.train, p = world.player;
    // The train goes back into service from here (if it's left at the end of the line, it turns back).
    t.driver = null; t.ctrl = null; t.onCrash = null;
    t.speed = 0; t.at = st; t.wait = 9;
    t.reverse = (t.dir > 0 && st.idx === t.line.stations.length - 1) || (t.dir < 0 && st.idx === 0);
    this.train = null;
    this.stopMotor();
    p.unreachable = false;
    const e = (st.entrances && st.entrances[0]) || { x: st.x, z: st.z };
    p.x = e.x; p.z = e.z; p.y = world.layout.groundHeight(e.x, e.z); p.vy = 0;
    p.human.group.visible = true;
    p.human.group.position.set(p.x, p.y, p.z);
    world.metroRide.banner.classList.remove('show');
    world.camRig.first = true;
    world.reseed?.();
    this.hud.vehicleExited();
    this.hud.toast(st.en, 'Namma Metro');
    this.hud.say('You slip out with the crowd. The Hoysalas are already outside.', 3.5);
  }

  crash(impact, other, world) {
    const h = this.train.head;
    this.shakeAmt = Math.max(this.shakeAmt, Math.min(1.2, impact / 12));
    world.particles?.burst('spark', h[0], h[1] + 0.8, h[2], Math.min(30, 8 + Math.round(impact * 2)), 6, 1);
    world.audio?.thud(Math.min(1, impact / 10));
    world.audio?.crunch?.(Math.min(1, impact / 12));
    if (impact > 4) this.hud.say(other ? 'You rammed another Namma Metro train. BMRCL will be writing a strongly worded letter.' : 'Buffer stop. That\'s the end of the line.', 3);
  }

  update(dt, input, world, camera) {
    const t = this.train, p = world.player;
    t.ctrl.throttle = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    t.ctrl.ebrake = input.down('Space');
    if (input.hit('KeyV')) this.cab = !this.cab;
    const h = t.head;
    if (input.hit('KeyH', 'KeyQ')) world.audio.horn('train', h[0], h[2], camera);
    // You are where the cab is: the police chase that, and the city streams around it.
    p.x = h[0]; p.z = h[2]; p.y = h[1];
    p.human.group.position.set(p.x, p.y, p.z);
    if (input.hit('KeyF', 'KeyE', 'Enter')) {
      const st = this.platformHere(t);
      if (st && Math.abs(t.speed) < 0.8) { this.leave(st, world); return; }
      this.hud.say(st ? 'Stop the train first.' : 'Stop at a station platform to get off.', 2);
    }
    this.follow(dt, input, camera);
    this.motor(t, dt);
    // HUD: speed, and the next station on the way.
    this.hud.el.speedVal.textContent = Math.round(Math.abs(t.speed) * 3.6);
    const mid = t.s - t.dir * TRAIN_LEN / 2, heading = t.speed >= 0 ? t.dir : -t.dir;
    let next = null, nd = Infinity;
    for (const st of t.line.stations) { const d = (st.s - mid) * heading; if (d > -5 && d < nd) { nd = d; next = st; } }
    const at = this.platformHere(t);
    const html = `<b>${t.line.name} · you're driving</b><span>${at ? `At ${at.en}${Math.abs(t.speed) < 0.8 ? ' · F to get off' : ''}` : next ? `Next: ${next.en} · ${Math.max(0, Math.round(nd))} m` : 'End of the line'}</span><em>W power · S brake · Space emergency · V view</em>`;
    const B = world.metroRide.banner;
    if (this._banner !== html) { this._banner = html; B.innerHTML = html; }
    B.classList.add('show');
    B.style.setProperty('--c', '#' + t.line.color.toString(16).padStart(6, '0'));
    world.metroRide.tunnel.style.opacity = h[1] < -2 && !at ? 0.6 : 0;
  }

  // Chase camera behind and above the leading car (low and close in the tunnels), or the cab view.
  follow(dt, input, camera) {
    const t = this.train, h = t.head;
    const fx = Math.cos(t.headYaw), fz = -Math.sin(t.headYaw);
    const rev = t.speed < -0.5 ? -1 : 1;
    if (input.mouseDX) this.orbit -= input.mouseDX * 0.0025;
    else this.orbit *= Math.exp(-dt * 0.8);
    const want = new THREE.Vector3(), look = new THREE.Vector3();
    const under = h[1] < -2;
    if (this.cab) {
      want.set(h[0] - fx * 1.2, h[1] + 2.75, h[2] - fz * 1.2);
      look.set(h[0] + fx * 40, h[1] + 1.8, h[2] + fz * 40);
    } else {
      const back = under ? 16 : 30, up = under ? 3 : 10;
      const a = Math.atan2(fz, fx) + this.orbit + (rev < 0 ? Math.PI : 0);
      want.set(h[0] - Math.cos(a) * back, h[1] + up, h[2] - Math.sin(a) * back);
      look.set(h[0] + fx * 12 * rev, h[1] + 1.5, h[2] + fz * 12 * rev);
    }
    const k = this.first || this.cab ? 1 : ease(5, dt);
    this.camPos.lerp(want, this.camPos.distanceTo(want) > 80 ? 1 : k);
    this.camLook.lerp(look, this.camLook.distanceTo(look) > 80 ? 1 : k);
    this.first = false;
    camera.position.copy(this.camPos);
    if (this.shakeAmt > 0) {
      camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 5);
    }
    camera.lookAt(this.camLook);
    const fov = 62 + Math.min(1, Math.abs(t.speed) / 30) * 10;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * ease(3, dt); camera.updateProjectionMatrix(); }
  }

  // The traction motors: the rising inverter whine of a metro pulling away, plus a hum.
  startMotor() {
    const c = this.audio.ctx;
    if (!c || this.mot) return;
    const out = c.createGain(); out.gain.value = 0;
    out.connect(this.audio.master);
    const mk = (type, f) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
    const whine = mk('sawtooth', 300), hum = mk('triangle', 90);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.value = 900;
    const wg = c.createGain(); wg.gain.value = 0.25;
    const hg = c.createGain(); hg.gain.value = 0.6;
    whine.connect(bp).connect(wg).connect(out);
    hum.connect(hg).connect(out);
    this.mot = { out, whine, hum, bp, wg };
  }

  motor(t, dt) {
    const m = this.mot;
    if (!m) { this.startMotor(); return; }
    const c = this.audio.ctx, now = c.currentTime;
    const v = Math.abs(t.speed), load = Math.abs(t.ctrl.throttle) + (t.ctrl.ebrake ? 0.6 : 0);
    // The whine climbs in steps (the inverter changing its carrier), then glides with speed.
    const steps = [320, 360, 400, 450, 500, 560, 620, 700];
    const f = v < 8 ? steps[Math.min(steps.length - 1, Math.floor(v))] : 700 + (v - 8) * 38;
    m.whine.frequency.setTargetAtTime(f, now, 0.04);
    m.bp.frequency.setTargetAtTime(f * 1.5, now, 0.05);
    m.hum.frequency.setTargetAtTime(70 + v * 6, now, 0.1);
    m.wg.gain.setTargetAtTime(0.1 + 0.3 * Math.min(1, load), now, 0.1);
    m.out.gain.setTargetAtTime(v > 0.2 || load > 0.05 ? 0.12 + Math.min(0.25, v * 0.012) : 0.02, now, 0.15);
  }

  stopMotor() {
    const m = this.mot;
    if (!m) return;
    const now = this.audio.ctx.currentTime;
    m.out.gain.setTargetAtTime(0, now, 0.2);
    setTimeout(() => { m.whine.stop(); m.hum.stop(); m.out.disconnect(); }, 1200);
    this.mot = null;
  }
}
