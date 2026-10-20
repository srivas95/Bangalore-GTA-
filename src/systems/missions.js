// Gig-economy jobs: food deliveries on anything (auto fares are in autoDuty.js).
import * as THREE from 'three';

// Cash in your pocket at the start of a new game.
export const START_MONEY = 1000;

const DISHES = ['Masala Dosa', 'Bisi Bele Bath', 'Chicken Biryani', 'Filter Coffee x4', 'Idli Vada', 'Ragi Mudde', 'Mysore Pak', 'Akki Roti', 'Benne Dosa', 'Chow Chow Bath', 'Mangalore Buns'];
export class Marker {
  constructor(scene, color) {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 30, 24, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = 15;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.0, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.2;
    g.add(beam, ring);
    g.visible = false;
    scene.add(g);
    this.group = g;
    this.ring = ring;
    this.color = '#' + new THREE.Color(color).getHexString();
  }
  place(x, z, y = 0) { this.group.position.set(x, y, z); this.group.visible = true; this.x = x; this.z = z; }
  hide() { this.group.visible = false; }
  update(t) { this.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.1); }
}

export class Missions {
  constructor(scene, layout, pois, hud, audio) {
    this.scene = scene;
    this.layout = layout;
    this.pois = pois;
    this.hud = hud;
    this.audio = audio;
    this.money = START_MONEY;
    this.rating = 4.6;
    this.job = null;
    this.offer = null;
    this.offerCooldown = 6;
    this.marker = new Marker(scene, 0xffc400);
    this.completed = 0;
    hud.setMoney(this.money, true);
  }

  get markers() {
    const m = [];
    if (this.marker.group.visible) m.push({ x: this.marker.x, z: this.marker.z, color: this.marker.color });
    return m;
  }

  addMoney(n) {
    this.money += n;
    this.hud.setMoney(this.money);
  }

  makeOffer(player) {
    const p = player.pos;
    const near = (list, min, max) => {
      const c = list.filter((q) => { const d = Math.hypot(q.x - p.x, q.z - p.z); return d > min && d < max; });
      return c.length ? c[Math.floor(Math.random() * c.length)] : list[Math.floor(Math.random() * list.length)];
    };
    const from = near(this.pois.food, 30, 300);
    const to = near(this.pois.homes, 150, 700);
    const dish = DISHES[Math.floor(Math.random() * DISHES.length)];
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    this.offer = { type: 'delivery', from, to, dish, pay: Math.round(40 + dist * 0.25), title: 'New order', text: `${dish} from ${from.name} → ${to.name}`, dist };
    this.offerTimer = 15;
    this.audio.ping();
    this.hud.phone(`<b>📱 ${this.offer.title} · ₹${this.offer.pay}</b><br>${this.offer.text}<br><span class="key">J</span> accept`);
  }

  accept() {
    const o = this.offer;
    this.offer = null;
    this.hud.phone(null);
    this.job = { ...o, stage: 'pickup', timer: null };
    this.marker.place(o.from.x, o.from.z, 0.15);
    this.hud.say(`Pick up the ${o.dish} from ${o.from.name}.`, 3);
  }

  fail(reason) {
    this.hud.say(reason, 4);
    this.rating = Math.max(1, this.rating - 0.3);
    this.cleanupJob();
  }

  cleanupJob() {
    this.job = null;
    this.marker.hide();
    this.hud.mission(null);
    this.offerCooldown = 10;
  }

  update(dt, input, player) {
    const t = performance.now() / 1000;
    this.marker.update(t);
    if (this.paused) return; // a story mission is running
    const p = player.pos;
    if (!this.job) {
      // Driving an auto, the fares come from the street instead (autoDuty.js); and no offers
      // while you're riding the metro, a bus or an auto.
      if (player.vehicle?.type === 'auto' || this.busy) {
        if (this.offer) { this.offer = null; this.hud.phone(null); }
        return;
      }
      if (this.offer) {
        this.offerTimer -= dt;
        if (input.hit('KeyJ')) this.accept();
        else if (this.offerTimer <= 0) { this.offer = null; this.hud.phone(null); this.offerCooldown = 12; }
      } else {
        this.offerCooldown -= dt;
        if (this.offerCooldown <= 0) this.makeOffer(player);
      }
      return;
    }
    const j = this.job;
    if (j.timer != null) {
      j.timer -= dt;
      if (j.timer <= 0) return this.fail('Customer cancelled the order. ★ rating down.');
    }
    const target = j.stage === 'pickup' ? j.from : j.to;
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    const slow = !player.vehicle || player.vehicle.speed < 4;
    if (j.stage === 'pickup') {
      this.hud.mission('Delivery', `Pick up ${j.dish} at ${j.from.name}`, null);
      if (d < 5 && slow) {
        j.stage = 'dropoff';
        j.timer = 25 + j.dist / 7;
        this.marker.place(j.to.x, j.to.z, 0.15);
        this.audio.ping();
        this.hud.say(`Got the ${j.dish}. Deliver it while it's hot!`, 3);
      }
    } else {
      this.hud.mission('Delivery', `Drop at ${j.to.name}`, j.timer);
      if (d < 5 && slow) {
        const bonus = Math.round(Math.max(0, j.timer) * 1.5);
        const tip = Math.random() < 0.3 ? Math.round(10 + Math.random() * 40) : 0;
        const total = j.pay + bonus + tip;
        this.addMoney(total);
        this.audio.cash();
        this.completed++;
        this.rating = Math.min(5, this.rating + 0.05);
        this.hud.toast(`+₹${total}`, `Fare ₹${j.pay} · speed bonus ₹${bonus}${tip ? ` · tip ₹${tip}` : ''} · ★ ${this.rating.toFixed(1)}`);
        this.hud.say('Customer: "Thank you, anna!"', 3);
        this.cleanupJob();
      }
    }
  }
}

export class Wanted {
  constructor(hud) {
    this.hud = hud;
    this.level = 0;
    this.cool = 0;
    hud.setStars(0);
  }
  add(n, reason) {
    const before = this.level;
    this.level = Math.min(5, this.level + n);
    this.cool = 30;
    if (this.level !== before) this.hud.setStars(this.level);
    this.reason = reason;
  }
  update(dt) {
    if (this.level <= 0) return;
    this.cool -= dt;
    if (this.cool <= 0) {
      this.level--;
      this.cool = 20;
      this.hud.setStars(this.level);
    }
  }
}
