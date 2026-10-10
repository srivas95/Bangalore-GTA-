// DOM heads-up display: minimap, district toasts, speedometer, prompts, subtitles, big map.

const ZONE_COLOURS = {
  park: '#5d8a46', lake: '#5d8a46', landmark: '#b8ad98', gov: '#a8a090', residential: '#bfb29a',
  commercial: '#c9b9a0', market: '#d0b48c', towers: '#b0b8c0', mixed: '#c4b8a4', industrial: '#a8a4a0',
};
const MAP_SCALE = 0.5; // minimap texture pixels per metre

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(layout, pois, { metro = [], rails = [] } = {}) {
    this.layout = layout;
    this.pois = pois;
    this.metro = metro;
    this.rails = rails;
    this.W = layout.world;
    // District label positions for the big map.
    const acc = new Map();
    for (const b of layout.blocks) {
      if (b.edge) continue;
      const a = acc.get(b.district) || { x: 0, z: 0, n: 0 };
      a.x += b.cx; a.z += b.cz; a.n++;
      acc.set(b.district, a);
    }
    this.districtLabels = [...acc].filter(([, a]) => a.n >= 2).map(([name, a]) => ({ name, x: a.x / a.n, z: a.z / a.n }));
    this.el = {
      money: $('money'), stars: $('stars'), toast: $('toast'), toastSub: $('toast-sub'), sub: $('subtitle'), street: $('street'), district: $('district'),
      speed: $('speed'), speedVal: $('speed-val'), vehicle: $('vehicle-name'), prompt: $('prompt'), mission: $('mission'), missionTitle: $('mission-title'),
      missionBody: $('mission-body'), missionTimer: $('mission-timer'), map: $('bigmap'), help: $('help'), radio: $('radio'), phone: $('phone'),
      clock: $('clock'), health: $('health'), damage: $('damage'), screen: $('screen'), screenTitle: $('screen-title'), screenSub: $('screen-sub'),
    };
    this.mini = $('minimap');
    // Weapon readout (top right, under the stars) and the aiming reticle.
    this.el.weapon = document.createElement('div');
    this.el.weapon.id = 'weapon';
    document.getElementById('top-right').appendChild(this.el.weapon);
    this.el.cross = document.createElement('div');
    this.el.cross.id = 'crosshair';
    document.getElementById('hud').appendChild(this.el.cross);
    this.miniCtx = this.mini.getContext('2d');
    this.mapCanvas = this.renderMap(MAP_SCALE);
    this.lastDistrict = null;
    this.toastT = 0;
    this.subT = 0;
    this.money = 0;
    this.shownMoney = 0;
  }

  renderMap(scale) {
    const Wd = this.W;
    const c = document.createElement('canvas');
    c.width = Math.ceil((Wd.maxX - Wd.minX) * scale);
    c.height = Math.ceil((Wd.maxZ - Wd.minZ) * scale);
    const ctx = c.getContext('2d');
    const X = (x) => (x - Wd.minX) * scale, Z = (z) => (z - Wd.minZ) * scale;
    const poly = (P) => { ctx.beginPath(); P.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)))); ctx.closePath(); };
    const line = (P) => { ctx.beginPath(); P.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)))); ctx.stroke(); };
    ctx.fillStyle = '#3a3a3c';
    ctx.fillRect(0, 0, c.width, c.height);
    for (const b of [...this.layout.blocks, ...this.layout.islands]) {
      ctx.fillStyle = '#9a9690';
      poly(b.poly); ctx.fill();
      if (!b.innerPoly || b.island) continue;
      ctx.fillStyle = ZONE_COLOURS[b.zone] || '#c4b8a4';
      poly(b.innerPoly); ctx.fill();
      if (b.zone === 'lake') {
        const cx = b.cx, cz = b.cz;
        ctx.fillStyle = '#4a86a8';
        poly(b.innerPoly.map(([x, z]) => [cx + (x - cx) * 0.85, cz + (z - cz) * 0.85])); ctx.fill();
      }
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Railway: brown with sleepers.
    for (const r of this.rails) {
      ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 4; ctx.setLineDash([]); line(r.pts);
      ctx.strokeStyle = '#c8b090'; ctx.lineWidth = 2; ctx.setLineDash([3, 5]); line(r.pts);
    }
    ctx.setLineDash([]);
    // Metro: solid where elevated, dashed underground; station dots.
    for (const m of this.metro) {
      const col = '#' + m.color.toString(16).padStart(6, '0');
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      const st = m.stations;
      for (let i = 0; i < st.length - 1; i++) {
        ctx.setLineDash(st[i].underground && st[i + 1].underground ? [6, 4] : []);
        line([[st[i].x, st[i].z], [st[i + 1].x, st[i + 1].z]]);
      }
      ctx.setLineDash([]);
      for (const s of st) {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(s.x), Z(s.z), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    ctx.fillStyle = '#2a5a9a';
    for (const u of this.layout.underpasses) {
      const px = -u.uz, pz = u.ux;
      poly([[u.cx - u.ux * u.half - px * u.hw, u.cz - u.uz * u.half - pz * u.hw], [u.cx + u.ux * u.half - px * u.hw, u.cz + u.uz * u.half - pz * u.hw],
        [u.cx + u.ux * u.half + px * u.hw, u.cz + u.uz * u.half + pz * u.hw], [u.cx - u.ux * u.half + px * u.hw, u.cz - u.uz * u.half + pz * u.hw]]);
      ctx.fill();
    }
    return c;
  }

  setMoney(m, instant = false) {
    this.money = m;
    if (instant) { this.shownMoney = m; this.el.money.textContent = '₹' + m.toLocaleString('en-IN'); }
  }

  setStars(n, searching = false) {
    const key = n + ':' + searching;
    if (this._stars === key) return;
    this._stars = key;
    this.el.stars.textContent = '★'.repeat(n) + '☆'.repeat(5 - n);
    this.el.stars.classList.toggle('active', n > 0);
    this.el.stars.classList.toggle('searching', n > 0 && searching);
  }

  flashDamage() {
    this.el.damage.classList.remove('show');
    void this.el.damage.offsetWidth;
    this.el.damage.classList.add('show');
  }

  setHealth(h) {
    const v = Math.round(h);
    if (this._hp === v) return;
    this._hp = v;
    this.el.health.style.setProperty('--hp', v / 100);
    this.el.health.classList.toggle('low', v < 30);
  }

  setWeapon(name, clip, ammo, reloading, aiming, gun) {
    const txt = gun ? `${name}  ${reloading ? 'reloading…' : `${clip} / ${ammo}`}` : name === 'Fists' ? '' : name;
    if (this._w !== txt) { this._w = txt; this.el.weapon.textContent = txt; this.el.weapon.style.display = txt ? 'block' : 'none'; }
    this.el.cross.style.display = aiming ? 'block' : 'none';
  }

  setClock(text, weather) {
    const t = `${text} · ${weather}`;
    if (this._clock !== t) { this._clock = t; this.el.clock.textContent = t; }
  }

  showScreen(title, sub, colour) {
    this.el.screenTitle.textContent = title;
    this.el.screenTitle.style.color = colour;
    this.el.screenSub.textContent = sub;
    this.el.screen.classList.add('show');
  }

  hideScreen() {
    this.el.screen.classList.remove('show');
  }

  toast(title, sub = '') {
    this.el.toast.textContent = title;
    this.el.toastSub.textContent = sub;
    this.el.toast.parentElement.classList.add('show');
    this.toastT = 3.5;
  }

  say(text, dur = 3) {
    this.el.sub.textContent = text;
    this.el.sub.classList.add('show');
    this.subT = dur;
  }

  prompt(text) {
    if (this._prompt === text) return;
    this._prompt = text;
    this.el.prompt.textContent = text || '';
    this.el.prompt.classList.toggle('show', !!text);
  }

  phone(text) {
    this.el.phone.innerHTML = text || '';
    this.el.phone.classList.toggle('show', !!text);
  }

  mission(title, body, timer) {
    if (!title) { this.el.mission.classList.remove('show'); return; }
    this.el.mission.classList.add('show');
    this.el.missionTitle.textContent = title;
    this.el.missionBody.textContent = body;
    this.el.missionTimer.textContent = timer != null ? formatTime(timer) : '';
    this.el.missionTimer.classList.toggle('urgent', timer != null && timer < 15);
  }

  vehicleEntered(v) {
    this.el.speed.classList.add('show');
    this.el.vehicle.textContent = v.spec.label;
    const stations = ['Radio Namma 91.1', 'Silk Board Jam FM 92.7', 'Filter Kaapi Beats 98.3', 'Gully Bass 104'];
    this.el.radio.textContent = '📻 ' + stations[Math.floor(Math.random() * stations.length)];
    this.el.radio.classList.add('show');
    setTimeout(() => this.el.radio.classList.remove('show'), 3500);
  }

  vehicleExited() {
    this.el.speed.classList.remove('show');
  }

  toggleMap() {
    this.el.map.classList.toggle('show');
    return this.el.map.classList.contains('show');
  }

  toggleHelp(force) {
    this.el.help.classList.toggle('show', force);
  }

  update(dt, player, camYaw, markers) {
    const p = player.pos;
    // District toasts, GTA style.
    const block = this.layout.blockAt(p.x, p.z);
    if (block.district !== this.lastDistrict) {
      if (this.lastDistrict !== null) this.toast(block.district, 'Bengaluru');
      this.lastDistrict = block.district;
    }
    const road = this.layout.roadAt(p.x, p.z);
    const junction = this.layout.junctionNear(p.x, p.z);
    const street = junction || (road ? this.layout.roadName(road, p.x, p.z) : block.district);
    if (this._street !== street) { this._street = street; this.el.street.textContent = street; }
    const dist = road || junction ? block.district : 'Bengaluru';
    if (this._dist !== dist) { this._dist = dist; this.el.district.textContent = dist; }
    this.setHealth(player.health);
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.parentElement.classList.remove('show'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.el.sub.classList.remove('show'); }
    if (player.vehicle) {
      const v = player.vehicle;
      this.el.speedVal.textContent = Math.round(Math.abs(v.forwardSpeed) * 3.6);
      // Vehicle condition bar under the speedo.
      if (!this.el.vhp) {
        this.el.vhp = document.createElement('div');
        this.el.vhp.className = 'vhp';
        this.el.vhp.innerHTML = '<i></i>';
        this.el.speed.appendChild(this.el.vhp);
      }
      const hp = Math.max(0, Math.min(100, v.health));
      const bar = this.el.vhp.firstChild;
      bar.style.width = `${hp}%`;
      bar.style.background = hp > 50 ? '#7ad06a' : hp > 20 ? '#f0b030' : '#e04030';
    }
    // Count money up smoothly.
    if (this.shownMoney !== this.money) {
      const d = this.money - this.shownMoney;
      this.shownMoney += Math.sign(d) * Math.max(1, Math.min(Math.abs(d), Math.abs(d) * dt * 4));
      if (Math.abs(this.money - this.shownMoney) < 1) this.shownMoney = this.money;
      this.el.money.textContent = '₹' + Math.round(this.shownMoney).toLocaleString('en-IN');
    }
    this.drawMinimap(p, camYaw, player, markers);
    if (this.el.map.classList.contains('show')) this.drawBigMap(p, markers);
  }

  drawMinimap(p, camYaw, player, markers) {
    const ctx = this.miniCtx, W = this.mini.width, H = this.mini.height;
    const scale = player.vehicle ? 0.9 : 1.6;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#4a4642';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    // Rotate so the camera's view direction, -(sin yaw, cos yaw), points up.
    ctx.rotate(camYaw);
    ctx.scale(scale, scale);
    ctx.scale(1 / MAP_SCALE, 1 / MAP_SCALE);
    ctx.translate(-(p.x - this.W.minX) * MAP_SCALE, -(p.z - this.W.minZ) * MAP_SCALE);
    ctx.drawImage(this.mapCanvas, 0, 0);
    ctx.restore();
    // Markers.
    const R = W / 2 - 10;
    for (const m of markers) {
      const dx = m.x - p.x, dz = m.z - p.z;
      let sx = (dx * Math.cos(camYaw) - dz * Math.sin(camYaw)) * scale;
      let sy = (dx * Math.sin(camYaw) + dz * Math.cos(camYaw)) * scale;
      const d = Math.hypot(sx, sy);
      if (d > R) { sx *= R / d; sy *= R / d; }
      ctx.fillStyle = m.color || '#ffd400';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(W / 2 + sx, H / 2 + sy, 6, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // Player arrow.
    const heading = player.vehicle ? player.vehicle.heading : player.heading;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-(heading - camYaw) + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // North indicator.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', W / 2 + Math.sin(camYaw) * R, H / 2 - Math.cos(camYaw) * R + 4);
  }

  drawBigMap(p, markers) {
    const c = this.el.map.querySelector('canvas');
    const ctx = c.getContext('2d');
    const Wd = this.W;
    const S = Math.min(c.width / (Wd.maxX - Wd.minX), c.height / (Wd.maxZ - Wd.minZ));
    const ox = (c.width - (Wd.maxX - Wd.minX) * S) / 2, oz = (c.height - (Wd.maxZ - Wd.minZ) * S) / 2;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(this.mapCanvas, ox, oz, (Wd.maxX - Wd.minX) * S, (Wd.maxZ - Wd.minZ) * S);
    const X = (v) => ox + (v - Wd.minX) * S, Zm = (v) => oz + (v - Wd.minZ) * S;
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px "Oswald", sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.fillStyle = '#fff';
    for (const d of this.districtLabels) { ctx.strokeText(d.name.toUpperCase(), X(d.x), Zm(d.z)); ctx.fillText(d.name.toUpperCase(), X(d.x), Zm(d.z)); }
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 11px sans-serif';
    for (const l of this.pois.landmarks) { if (!l) continue; ctx.strokeText('◆ ' + l.name, X(l.x), Zm(l.z) + 14); ctx.fillText('◆ ' + l.name, X(l.x), Zm(l.z) + 14); }
    ctx.fillStyle = '#9fd8ff';
    for (const f of this.pois.fuel || []) { ctx.strokeText('⛽ ' + f.name, X(f.x), Zm(f.z)); ctx.fillText('⛽ ' + f.name, X(f.x), Zm(f.z)); }
    ctx.lineWidth = 1;
    for (const m of markers) {
      ctx.fillStyle = m.color || '#ffd400';
      ctx.beginPath(); ctx.arc(X(m.x), Zm(m.z), 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(X(p.x), Zm(p.z), 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e02020'; ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1;
  }
}

function formatTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
