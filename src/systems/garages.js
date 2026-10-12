// Garages: roadside puncture-and-service stalls all over town, and Chikka Motors in Gandhinagar.
// Drive into a bay to repair or respray (a new colour can shake off a low wanted level if no one
// saw you go in). Chikka Motors also sells vehicles; anything you buy is yours, saved, and can be
// called to any garage.
import * as THREE from 'three';
import { BuilderSet, makeFrame } from '../world/meshBuilder.js';
import { put } from '../world/landmarks.js';
import { textTexture } from '../world/textures.js';
import { geo } from '../world/mapdata.js';

const SAVE_KEY = 'namma-bengaluru-garage-v1';

const SITES = [
  { name: 'Chikka Motors', kn: 'ಚಿಕ್ಕ ಮೋಟಾರ್ಸ್', at: [12.9768, 77.579], dealer: true },
  { name: 'Sri Manjunatha Puncture', kn: 'ಶ್ರೀ ಮಂಜುನಾಥ ಪಂಕ್ಚರ್', at: [12.9295, 77.5835] }, // Jayanagar
  { name: 'Koramangala Auto Works', kn: 'ಕೋರಮಂಗಲ ಆಟೋ ವರ್ಕ್ಸ್', at: [12.9352, 77.6225] },
  { name: 'Indiranagar Car Care', kn: 'ಇಂದಿರಾನಗರ ಕಾರ್ ಕೇರ್', at: [12.9712, 77.6395] },
  { name: 'Yeshwanthpur Tyre Point', kn: 'ಯಶವಂತಪುರ ಟೈರ್ ಪಾಯಿಂಟ್', at: [13.0245, 77.5505] },
  { name: 'Rajajinagar Service Centre', kn: 'ರಾಜಾಜಿನಗರ ಸರ್ವಿಸ್', at: [12.9925, 77.5545] },
  { name: 'Banashankari Puncture Shop', kn: 'ಬನಶಂಕರಿ ಪಂಕ್ಚರ್', at: [12.9185, 77.5655] },
  { name: 'Hebbal Motor Garage', kn: 'ಹೆಬ್ಬಾಳ ಮೋಟಾರ್ ಗ್ಯಾರೇಜ್', at: [13.0395, 77.5935] },
  { name: 'Mysore Road Tyre Works', kn: 'ಮೈಸೂರು ರಸ್ತೆ ಟೈರ್', at: [12.9505, 77.5395] },
  { name: 'HSR Car Clinic', kn: 'ಎಚ್‌ಎಸ್‌ಆರ್ ಕಾರ್ ಕ್ಲಿನಿಕ್', at: [12.9125, 77.6445] },
  { name: 'Marathahalli Auto Garage', kn: 'ಮಾರತ್ತಹಳ್ಳಿ ಆಟೋ ಗ್ಯಾರೇಜ್', at: [12.9575, 77.6985] },
  { name: 'Whitefield Car Spa', kn: 'ವೈಟ್‌ಫೀಲ್ಡ್ ಕಾರ್ ಸ್ಪಾ', at: [12.9705, 77.7445] },
  { name: 'Yelahanka Puncture & Service', kn: 'ಯಲಹಂಕ ಪಂಕ್ಚರ್', at: [13.1005, 77.5975] },
];

// What Chikka sells: [label, type, model, price].
export const FOR_SALE = [
  ['Honda Activa (scooter)', 'scooter', null, 3000],
  ['Royal Enfield Bullet', 'bike', null, 8500],
  ['Bajaj auto rickshaw', 'auto', null, 6000],
  ['Maruti Alto', 'hatch', 'alto', 11000],
  ['Maruti Swift', 'hatch', 'swift', 16000],
  ['Hyundai i10', 'hatch', 'i10', 14000],
  ['Maruti Swift Dzire', 'sedan', 'dzire', 19000],
  ['Toyota Etios', 'sedan', 'etios', 19500],
  ['Honda City', 'sedan', 'city', 26000],
  ['Toyota Innova', 'suv', 'innova', 34000],
  ['Hyundai Creta', 'suv', 'creta', 38000],
  ['Mahindra Scorpio', 'suv', 'scorpio', 42000],
];
const PAINTS = [0xf2f2f2, 0x1a1a1a, 0xb01c22, 0x1c3a7a, 0x8a8e92, 0x2f6a3a, 0xe0a020, 0x6a2a6a, 0x3a8ab0, 0xc87a30];

export class Garages {
  constructor(scene, layout, colliders, hud, audio, missions, world, pois) {
    Object.assign(this, { scene, layout, colliders, hud, audio, missions, world });
    this.owned = [];
    try { this.owned = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); } catch { /* ignore */ }
    this.sites = [];
    this.menu = null;
    this.cool = 0;
    this.live = new Map(); // owned record -> the vehicle currently in the world
    this.buildDom();
    const B = new BuilderSet();
    for (const s of SITES) {
      const site = this.place(s);
      if (!site) continue;
      this.sites.push(site);
      this.buildStall(B, site);
      (pois.garages || (pois.garages = [])).push({ name: s.name, x: site.x, z: site.z });
    }
    const group = new THREE.Group();
    B.buildAll({ m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }) }, group);
    scene.add(group);
    // Your most recent purchase waits outside Chikka Motors.
    const last = this.owned[this.owned.length - 1];
    if (last) this.deliver(last, this.sites[0], false);
  }

  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.owned)); } catch { /* ignore */ } }
  reset() { this.owned = []; this.save(); }

  // Put the stall on the footpath facing the nearest road, with the service bay on the road.
  place(s) {
    const [gx, gz] = geo(...s.at);
    const L = this.layout;
    for (let tries = 0; tries < 40; tries++) {
      const x = gx + (tries ? Math.cos(tries * 2.4) * tries * 4 : 0), z = gz + (tries ? Math.sin(tries * 2.4) * tries * 4 : 0);
      const h = L.edgeAt(x, z);
      if (!h || h.e.r.boundary) continue;
      const e = h.e, ux = (e.b.x - e.a.x) / e.len, uz = (e.b.z - e.a.z) / e.len;
      const t = Math.max(0.25, Math.min(0.75, h.t)) * e.len;
      const cx = e.a.x + ux * t, cz = e.a.z + uz * t;
      let nx = -uz, nz = ux;
      if ((x - cx) * nx + (z - cz) * nz < 0) { nx = -nx; nz = -nz; }
      const w = e.r.width / 2;
      const sx = cx + nx * (w + 2.3), sz = cz + nz * (w + 2.3);
      const blk = L.blockContaining(sx, sz);
      if (!blk || blk.island || this.colliders.pointBlocked(sx, sz, 1) || L.underpassAt(cx, cz) || L.flyoverAt(cx, cz)) continue;
      if (Math.min(t, e.len - t) < (e.a.cut?.get(e.id) || 0) + 12) continue;
      return { ...s, x: sx, z: sz, nx, nz, ux, uz, bay: { x: cx + nx * (w - 2.0), z: cz + nz * (w - 2.0) } };
    }
    return null;
  }

  buildStall(B, s) {
    const f = makeFrame(s.x, s.z, Math.atan2(s.nx, s.nz) + Math.PI); // local +z faces the road
    B.xf = f;
    const m = B.get('m');
    const tarp = s.dealer ? 0xc0182a : 0x1f5fb0;
    const W = s.dealer ? 7 : 4.2;
    m.box(0, 3.0, -0.2, W + 0.4, 0.12, 3.4, tarp);
    for (const sx of [-1, 1]) m.box(sx * W / 2, 0.15, 1.2, 0.12, 2.9, 0.12, 0x555555);
    m.box(0, 0.15, -1.4, W, 2.9, 0.15, s.dealer ? 0xe8e4dc : 0x777b80);
    // Stacked tyres and a compressor.
    const torus = new THREE.TorusGeometry(0.32, 0.13, 6, 12);
    for (let k = 0; k < 4; k++) put(m, torus, -W / 2 + 0.6, 0.3 + k * 0.24, 0.2, 0x1a1a1a, 0, 1, 1, 1, Math.PI / 2);
    for (let k = 0; k < 3; k++) put(m, torus, -W / 2 + 1.4, 0.3 + k * 0.24, -0.4, 0x1a1a1a, 0, 1, 1, 1, Math.PI / 2);
    m.box(W / 2 - 0.7, 0.15, -0.6, 0.7, 0.8, 0.5, 0xd02020);
    B.xf = null;
    this.colliders.framed(f).addCentered(-W / 2 + 1, -0.1, 1.9, 1.2, 1.2, 'prop');
    // Sign board over the stall.
    const tex = textTexture([s.kn, s.name.toUpperCase(), s.dealer ? 'SALES · SERVICE · RESPRAY' : 'PUNCTURE · SERVICE · RESPRAY'], { bg: s.dealer ? '#c0182a' : '#f2c200', fg: s.dealer ? '#ffffff' : '#111111', w: 1024, h: 300 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W, W * 300 / 1024), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.15 }));
    const [wx, wz] = [s.x + s.nx * 1.25, s.z + s.nz * 1.25];
    sign.position.set(wx, 3.0 + W * 150 / 1024 + 0.1, wz);
    sign.rotation.y = f.ang;
    this.scene.add(sign);
    // The bay: a painted box on the road.
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.3, 32), new THREE.MeshBasicMaterial({ color: 0x40d0ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.bay.x, 0.06, s.bay.z);
    this.scene.add(ring);
    s.ring = ring;
  }

  // ---------- menu ----------
  buildDom() {
    const el = document.createElement('div');
    el.id = 'garage-menu';
    document.getElementById('hud').appendChild(el);
    el.addEventListener('click', (e) => {
      const it = e.target.closest('.gm-item');
      if (it) { this.sel = +it.dataset.i; this.tap = true; }
    });
    this.el = el;
  }

  open(site, inVehicle) {
    this.site = site;
    this.page = 'main';
    this.sel = 0;
    this.inVehicle = inVehicle;
    this.menu = true;
    this.el.classList.add('show');
    this.render();
  }

  close() {
    this.menu = null;
    this.el.classList.remove('show');
    this.cool = 3;
  }

  items() {
    const v = this.world.player.vehicle, s = this.site;
    const money = this.missions.money;
    if (this.page === 'buy') return [...FOR_SALE.map(([label, , , price]) => ({ label, price, act: 'buy' })), { label: 'Back', act: 'back' }];
    if (this.page === 'call') return [...this.owned.map((o) => ({ label: o.label, price: 200, act: 'call' })), { label: 'Back', act: 'back' }];
    const out = [];
    if (v) {
      const dmg = 100 - v.health;
      const cost = Math.max(50, Math.round(dmg * 9 + (v.engineDead ? 300 : 0) + (v.fireT > 0 ? 400 : 0)));
      out.push({ label: dmg < 0.5 && !v.engineDead ? 'Repair (nothing to fix)' : `Repair (${Math.round(v.health)}% → 100%)`, price: dmg < 0.5 && !v.engineDead ? 0 : cost, act: 'repair', off: dmg < 0.5 && !v.engineDead });
      if (!v.spec.police) out.push({ label: 'Respray (new colour; loses a low wanted level)', price: 400, act: 'respray' });
    }
    if (s.dealer) out.push({ label: 'Buy a vehicle…', act: 'shop' });
    if (this.owned.length && !v) out.push({ label: 'Have one of your vehicles brought here…', act: 'callmenu' });
    out.push({ label: 'Leave', act: 'close' });
    for (const it of out) if (it.price > money) it.off = true;
    return out;
  }

  render() {
    const its = this.items();
    this.sel = Math.min(this.sel, its.length - 1);
    const title = this.page === 'buy' ? 'Chikka Motors · showroom' : this.page === 'call' ? 'Your vehicles' : this.site.name;
    this.el.innerHTML = `<div class="gm-head">🔧 <b>${title}</b><span>${this.site.kn}</span></div>` +
      its.map((it, i) => `<div class="gm-item${i === this.sel ? ' sel' : ''}${it.off ? ' off' : ''}" data-i="${i}"><span>${it.label}</span><em>${it.price ? '₹' + it.price.toLocaleString('en-IN') : ''}</em></div>`).join('') +
      `<div class="gm-foot">W/S choose · E select · Q leave · You have ₹${this.missions.money.toLocaleString('en-IN')}</div>`;
  }

  choose(it, idx) {
    const pl = this.world.player, v = pl.vehicle;
    if (it.off) { this.audio.click?.(); return; }
    switch (it.act) {
      case 'close': this.close(); return;
      case 'back': this.page = 'main'; this.sel = 0; break;
      case 'shop': this.page = 'buy'; this.sel = 0; break;
      case 'callmenu': this.page = 'call'; this.sel = 0; break;
      case 'repair':
        this.missions.addMoney(-it.price);
        v.repair();
        this.audio.cash?.();
        this.hud.say('Mechanic: "Done, sir. Drive slowly next time." (He knows you won\'t.)', 3);
        break;
      case 'respray': {
        this.missions.addMoney(-400);
        const col = PAINTS.filter((c) => c !== v.model.color)[Math.floor(Math.random() * (PAINTS.length - 1))];
        this.recolor(v, col);
        this.audio.cash?.();
        const P = this.world.police;
        const seen = P.units.some((u) => Math.hypot(u.v.x - v.x, u.v.z - v.z) < 70);
        if (P.level > 0 && P.level <= 3 && !seen) { P.clear(); this.hud.say('New paint, new plates. The Hoysalas drive straight past.', 3.5); }
        else if (P.level > 0) this.hud.say(seen ? 'A Hoysala saw you drive in. The new colour won\'t fool them.' : 'Too hot for a paint job to help. Lose them first.', 3.5);
        else this.hud.say('Fresh paint. Looks almost new.', 2.5);
        break;
      }
      case 'buy': {
        const [label, type, model, price] = FOR_SALE[idx];
        this.missions.addMoney(-price);
        const rec = { label, type, model, color: PAINTS[Math.floor(Math.random() * PAINTS.length)] };
        this.owned.push(rec);
        this.save();
        this.world.saveGame?.();
        this.deliver(rec, this.site, true);
        this.audio.cash?.();
        this.hud.toast(label, 'Yours. Saved to your garage.');
        this.close();
        return;
      }
      case 'call': {
        this.missions.addMoney(-200);
        this.deliver(this.owned[idx], this.site, true);
        this.hud.say(`Chikka: "Sending the ${this.owned[idx].label} over. Don't scratch it."`, 3);
        this.close();
        return;
      }
    }
    this.render();
  }

  // Swap the paint colour on a car's vertex colours.
  recolor(v, hex) {
    if (v.model.color == null) return;
    const g = v.model.mesh.geometry, col = g.attributes.color;
    const from = new THREE.Color(v.model.color), to = new THREE.Color(hex);
    for (let i = 0; i < col.count; i++) {
      if (Math.abs(col.getX(i) - from.r) < 0.004 && Math.abs(col.getY(i) - from.g) < 0.004 && Math.abs(col.getZ(i) - from.b) < 0.004) col.setXYZ(i, to.r, to.g, to.b);
    }
    col.needsUpdate = true;
    v.model.color = hex;
    v._orig = null; // the damage snapshot is of the old paint
  }

  deliver(rec, site, announce) {
    // An earlier delivery of the same vehicle is towed away.
    const old = this.live.get(rec);
    if (old && old !== this.world.player.vehicle) { this.scene.remove(old.group); const i = this.world.free?.indexOf(old); if (i >= 0) this.world.free.splice(i, 1); }
    const heading = Math.atan2(site.ux, site.uz);
    const x = site.bay.x + site.ux * 6, z = site.bay.z + site.uz * 6;
    const v = this.world.park(rec.type, x, z, heading, { color: rec.color, model: rec.model || undefined });
    v.owned = true;
    this.live.set(rec, v);
    if (announce) this.hud.say(`Your ${rec.label} is parked outside ${site.name}.`, 3);
  }

  // ---------- per frame ----------
  update(dt, input) {
    const pl = this.world.player;
    const t = performance.now() / 1000;
    for (const s of this.sites) if (s.ring) s.ring.material.opacity = 0.35 + Math.sin(t * 3) * 0.2;
    if (this.menu) {
      const its = this.items();
      if (input.hit('KeyW', 'ArrowUp')) { this.sel = (this.sel - 1 + its.length) % its.length; this.render(); }
      if (input.hit('KeyS', 'ArrowDown')) { this.sel = (this.sel + 1) % its.length; this.render(); }
      if (input.hit('KeyQ', 'Backspace', 'Escape')) { if (this.page !== 'main') { this.page = 'main'; this.sel = 0; this.render(); } else this.close(); return; }
      if (input.hit('KeyE', 'Enter') || this.tap) {
        this.tap = false;
        const it = its[this.sel];
        if (it) this.choose(it, this.sel);
      }
      return;
    }
    if (this.cool > 0) { this.cool -= dt; return; }
    const v = pl.vehicle;
    for (const s of this.sites) {
      if (v) {
        if (Math.hypot(v.x - s.bay.x, v.z - s.bay.z) < 3 && v.speed < 2.5 && v.driver === 'player') { this.open(s, true); return; }
      } else if (Math.hypot(pl.x - s.x, pl.z - s.z) < 2.8) {
        this.hud.prompt(`E  ${s.name}`);
        if (input.hit('KeyE')) { input.pressed.delete('KeyE'); this.open(s, false); }
        this.nearStall = true;
        return;
      }
    }
    this.nearStall = false;
  }
}
