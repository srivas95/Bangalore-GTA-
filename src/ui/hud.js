// DOM heads-up display: minimap, district toasts, speedometer, prompts, subtitles, big map.
import { WORLD_MIN, WORLD_MAX } from '../config.js';

const ZONE_COLOURS = {
  park: '#5d8a46', lake: '#5d8a46', landmark: '#b8ad98', gov: '#a8a090', residential: '#bfb29a',
  commercial: '#c9b9a0', market: '#d0b48c', towers: '#b0b8c0', mixed: '#c4b8a4',
};

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(layout, pois) {
    this.layout = layout;
    this.pois = pois;
    this.el = {
      money: $('money'), stars: $('stars'), toast: $('toast'), toastSub: $('toast-sub'), sub: $('subtitle'), street: $('street'), district: $('district'),
      speed: $('speed'), speedVal: $('speed-val'), vehicle: $('vehicle-name'), prompt: $('prompt'), mission: $('mission'), missionTitle: $('mission-title'),
      missionBody: $('mission-body'), missionTimer: $('mission-timer'), map: $('bigmap'), help: $('help'), radio: $('radio'), phone: $('phone'),
    };
    this.mini = $('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.mapCanvas = this.renderMap(1);
    this.lastDistrict = null;
    this.toastT = 0;
    this.subT = 0;
    this.money = 0;
    this.shownMoney = 0;
  }

  renderMap(scale) {
    const size = (WORLD_MAX - WORLD_MIN) * scale;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const X = (x) => (x - WORLD_MIN) * scale;
    ctx.fillStyle = '#6a6460';
    ctx.fillRect(0, 0, size, size);
    for (const b of this.layout.blocks) {
      const o = b.outer;
      ctx.fillStyle = '#9a9690';
      ctx.fillRect(X(o.minX), X(o.minZ), (o.maxX - o.minX) * scale, (o.maxZ - o.minZ) * scale);
      const i = b.inner;
      ctx.fillStyle = ZONE_COLOURS[b.zone] || '#c4b8a4';
      ctx.fillRect(X(i.minX), X(i.minZ), (i.maxX - i.minX) * scale, (i.maxZ - i.minZ) * scale);
      if (b.zone === 'lake') {
        ctx.fillStyle = '#4a86a8';
        ctx.fillRect(X(i.minX + 9), X(i.minZ + 9), (i.maxX - i.minX - 18) * scale, (i.maxZ - i.minZ - 18) * scale);
      }
    }
    ctx.fillStyle = '#3a3a3c';
    for (const r of this.layout.roads) {
      if (r.axis === 'x') ctx.fillRect(X(r.pos - r.width / 2), 0, r.width * scale, size);
      else ctx.fillRect(0, X(r.pos - r.width / 2), size, r.width * scale);
    }
    // Metro line.
    const metro = this.layout.zRoads.find((r) => r.metro);
    if (metro) { ctx.fillStyle = '#8a3cc0'; ctx.fillRect(0, X(metro.pos) - 1.5 * scale, size, 3 * scale); }
    return c;
  }

  setMoney(m, instant = false) {
    this.money = m;
    if (instant) { this.shownMoney = m; this.el.money.textContent = '₹' + m.toLocaleString('en-IN'); }
  }

  setStars(n) {
    this.el.stars.textContent = '★'.repeat(n) + '☆'.repeat(5 - n);
    this.el.stars.classList.toggle('active', n > 0);
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
    this.el.street.textContent = road ? road.name : block.district;
    this.el.district.textContent = road ? block.district : 'Bengaluru';
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.parentElement.classList.remove('show'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.el.sub.classList.remove('show'); }
    if (player.vehicle) this.el.speedVal.textContent = Math.round(Math.abs(player.vehicle.forwardSpeed) * 3.6);
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
    ctx.translate(-(p.x - WORLD_MIN), -(p.z - WORLD_MIN));
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
    const S = c.width / (WORLD_MAX - WORLD_MIN);
    ctx.drawImage(this.mapCanvas, 0, 0, c.width, c.height);
    const X = (v) => (v - WORLD_MIN) * S;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const r of this.layout.xRoads) { ctx.save(); ctx.translate(X(r.pos) - 4, X(WORLD_MIN + 60)); ctx.rotate(-Math.PI / 2); ctx.fillText(r.name, 0, 0); ctx.restore(); }
    for (const r of this.layout.zRoads) ctx.fillText(r.name, X(WORLD_MIN + 60), X(r.pos) - 4);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 12px sans-serif';
    for (const l of this.pois.landmarks) ctx.fillText('◆ ' + l.name, X(l.x), X(l.z));
    for (const m of markers) {
      ctx.fillStyle = m.color || '#ffd400';
      ctx.beginPath(); ctx.arc(X(m.x), X(m.z), 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(X(p.x), X(p.z), 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e02020'; ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1;
  }
}

function formatTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
