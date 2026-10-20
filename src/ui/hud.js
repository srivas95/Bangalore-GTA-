// DOM heads-up display: minimap, district toasts, speedometer, prompts, subtitles, big map.

const ZONE_COLOURS = {
  park: '#5d8a46', lake: '#5d8a46', rural: '#9aa66a', landmark: '#b8ad98', gov: '#a8a090', residential: '#bfb29a',
  commercial: '#c9b9a0', market: '#d0b48c', towers: '#b0b8c0', mixed: '#c4b8a4', industrial: '#a8a4a0',
};

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(layout, pois, { metro = [], rails = [], mapScale = 0.32 } = {}) {
    this.mapScale = mapScale;
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
    this.mapCanvas = this.renderMap(this.mapScale);
    this.lastDistrict = null;
    this.toastT = 0;
    this.subT = 0;
    this.money = 0;
    this.shownMoney = 0;
  }

  // The map picture at `scale` px per metre: the whole world, or just `region` ({minX, minZ, w, h}
  // with w, h in pixels) drawn into `into` (the zoomed big map).
  renderMap(scale, region = null, into = null) {
    const Wd = this.W;
    const c = into || document.createElement('canvas');
    const r = region || { minX: Wd.minX, minZ: Wd.minZ, w: Math.ceil((Wd.maxX - Wd.minX) * scale), h: Math.ceil((Wd.maxZ - Wd.minZ) * scale) };
    if (c.width !== r.w) c.width = r.w;
    if (c.height !== r.h) c.height = r.h;
    const ctx = c.getContext('2d');
    const X = (x) => (x - r.minX) * scale, Z = (z) => (z - r.minZ) * scale;
    const maxX = r.minX + r.w / scale, maxZ = r.minZ + r.h / scale;
    const visible = (b) => !region || (b.bb ||= bbox(b.poly), b.bb[2] >= r.minX && b.bb[0] <= maxX && b.bb[3] >= r.minZ && b.bb[1] <= maxZ);
    const lw = Math.max(1, scale / 0.32); // line widths grow as you zoom in
    const poly = (P) => { ctx.beginPath(); P.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)))); ctx.closePath(); };
    const line = (P) => { ctx.beginPath(); P.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)))); ctx.stroke(); };
    ctx.fillStyle = '#3a3a3c';
    ctx.fillRect(0, 0, c.width, c.height);
    for (const b of [...this.layout.blocks, ...this.layout.islands]) {
      if (!visible(b)) continue;
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
    for (const rl of this.rails) {
      ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 4 * lw; ctx.setLineDash([]); line(rl.pts);
      ctx.strokeStyle = '#c8b090'; ctx.lineWidth = 2 * lw; ctx.setLineDash([3 * lw, 5 * lw]); line(rl.pts);
    }
    ctx.setLineDash([]);
    // Metro: solid where elevated, dashed underground; station dots.
    for (const m of this.metro) {
      const col = '#' + m.color.toString(16).padStart(6, '0');
      ctx.strokeStyle = col;
      ctx.lineWidth = 4 * lw;
      const st = m.stations;
      for (let i = 0; i < st.length - 1; i++) {
        ctx.setLineDash(st[i].underground && st[i + 1].underground ? [6 * lw, 4 * lw] : []);
        line([[st[i].x, st[i].z], [st[i + 1].x, st[i + 1].z]]);
      }
      ctx.setLineDash([]);
      for (const s of st) {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 2 * lw;
        ctx.beginPath(); ctx.arc(X(s.x), Z(s.z), 4 * lw, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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
    const key = title ? `${title}|${body}|${timer != null ? Math.ceil(timer) : ''}` : '';
    if (key === this._mission) return;
    this._mission = key;
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
    const on = this.el.map.classList.toggle('show');
    document.body.classList.toggle('map-open', on); // hides the touch controls underneath
    this.onMapToggle?.(on);
    if (on) {
      this.initBigMap();
      // Open on the player, zoomed in enough to read the streets.
      const p = this._lastP || { x: 0, z: 0 };
      this.view = { cx: p.x, cz: p.z, ppm: this.fitScale() * 3 };
      this.clampView();
      this.base = null;
    }
    return on;
  }

  // ---------- Big map: zoom (wheel, pinch, buttons) and pan (drag) ----------
  initBigMap() {
    const c = this.el.map.querySelector('canvas');
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; this.base = null; }
    this.dpr = dpr;
    if (this._mapInit) return;
    this._mapInit = true;
    const ptrs = new Map();
    let pinch = null;
    const local = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * this.dpr, (e.clientY - r.top) * this.dpr]; };
    let tap = null; // a quick press without dragging sets (or clears) the GPS waypoint
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, local(e)); pinch = null;
      tap = ptrs.size === 1 && e.button === 0 ? { p: local(e), t: performance.now() } : null;
    });
    c.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId), cur = local(e);
      ptrs.set(e.pointerId, cur);
      if (tap && Math.hypot(cur[0] - tap.p[0], cur[1] - tap.p[1]) > 10 * this.dpr) tap = null;
      if (ptrs.size === 1) this.panBy(cur[0] - prev[0], cur[1] - prev[1]);
      else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (pinch) { this.zoomAt(d / pinch.d, mid); this.panBy(mid[0] - pinch.mid[0], mid[1] - pinch.mid[1]); }
        pinch = { d, mid };
      }
    });
    const up = (e) => {
      ptrs.delete(e.pointerId); pinch = null;
      if (tap && e.type === 'pointerup' && performance.now() - tap.t < 450) {
        const v = this.view, [sx, sy] = tap.p;
        this.onMapTap?.(v.cx + (sx - c.width / 2) / v.ppm, v.cz + (sy - c.height / 2) / v.ppm, 18 * this.dpr / v.ppm);
      }
      tap = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(Math.exp(-e.deltaY * 0.0015), local(e)); }, { passive: false });
    const bar = document.createElement('div');
    bar.className = 'mapbtns';
    bar.innerHTML = '<button data-z="in">+</button><button data-z="out">−</button><button data-z="me" title="Centre on me">⌖</button><button data-z="close" title="Close">✕</button>';
    bar.addEventListener('click', (e) => {
      const z = e.target.dataset?.z;
      const mid = [c.width / 2, c.height / 2];
      if (z === 'in') this.zoomAt(1.6, mid);
      if (z === 'out') this.zoomAt(1 / 1.6, mid);
      if (z === 'me' && this._lastP) { this.view.cx = this._lastP.x; this.view.cz = this._lastP.z; this.clampView(); }
      if (z === 'close') this.toggleMap();
    });
    this.el.map.appendChild(bar);
    const hint = this.el.map.querySelector('.hint');
    if (hint) hint.textContent = matchMedia('(pointer: coarse)').matches ? 'Pinch to zoom · drag to move · tap to set a waypoint' : 'Scroll to zoom · drag to move · click to set a waypoint · M to close';
  }

  // The GPS route as a thick purple line (X, Z: world to canvas; w: line width in canvas units).
  drawRoute(ctx, X, Z, w) {
    const R = this.gps?.route;
    if (!R || R.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    R.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
    ctx.strokeStyle = 'rgba(30,0,40,0.8)'; ctx.lineWidth = w * 1.6; ctx.stroke();
    ctx.strokeStyle = '#c050ff'; ctx.lineWidth = w; ctx.stroke();
    ctx.restore();
  }

  fitScale() {
    const c = this.el.map.querySelector('canvas'), Wd = this.W;
    return Math.min(c.width / (Wd.maxX - Wd.minX), c.height / (Wd.maxZ - Wd.minZ));
  }

  clampView() {
    const v = this.view, Wd = this.W;
    v.ppm = Math.max(this.fitScale(), Math.min(6 * this.dpr, v.ppm));
    v.cx = Math.max(Wd.minX, Math.min(Wd.maxX, v.cx));
    v.cz = Math.max(Wd.minZ, Math.min(Wd.maxZ, v.cz));
    this.viewT = performance.now();
  }

  zoomAt(k, [sx, sy]) {
    const c = this.el.map.querySelector('canvas'), v = this.view;
    // Keep the world point under (sx, sy) fixed.
    const wx = v.cx + (sx - c.width / 2) / v.ppm, wz = v.cz + (sy - c.height / 2) / v.ppm;
    v.ppm *= k;
    this.clampView();
    v.cx = wx - (sx - c.width / 2) / v.ppm;
    v.cz = wz - (sy - c.height / 2) / v.ppm;
    this.clampView();
  }

  panBy(dx, dy) {
    this.view.cx -= dx / this.view.ppm;
    this.view.cz -= dy / this.view.ppm;
    this.clampView();
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
    this._lastP = p;
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
    const S0 = this.mapScale;
    ctx.scale(1 / S0, 1 / S0);
    ctx.translate(-(p.x - this.W.minX) * S0, -(p.z - this.W.minZ) * S0);
    ctx.drawImage(this.mapCanvas, 0, 0);
    this.drawRoute(ctx, (x) => (x - this.W.minX) * S0, (z) => (z - this.W.minZ) * S0, 5 * S0 / scale);
    ctx.restore();
    // GPS distance to the waypoint.
    if (this.gps?.route) {
      const d = this.gps.length;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.fillStyle = '#e8b8ff';
      const t = d > 950 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 10) * 10} m`;
      ctx.strokeText(t, W / 2, H - 16); ctx.fillText(t, W / 2, H - 16);
    }
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
    const Wd = this.W, v = this.view, S = v.ppm, k = this.dpr;
    const ox = c.width / 2 - (v.cx - Wd.minX) * S, oz = c.height / 2 - (v.cz - Wd.minZ) * S;
    const X = (x) => ox + (x - Wd.minX) * S, Zm = (z) => oz + (z - Wd.minZ) * S;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, c.width, c.height);
    // Base map: redrawn sharp at this zoom once the view has settled; the low-res overview
    // stands in while you drag or pinch.
    const key = `${v.cx.toFixed(1)},${v.cz.toFixed(1)},${S.toFixed(4)},${c.width}x${c.height}`;
    if (this.base && this.base.key === key) ctx.drawImage(this.base.canvas, 0, 0);
    else {
      ctx.drawImage(this.mapCanvas, ox, oz, (Wd.maxX - Wd.minX) * S, (Wd.maxZ - Wd.minZ) * S);
      if (performance.now() - (this.viewT || 0) > 120) {
        const canvas = this.base?.canvas || document.createElement('canvas');
        this.renderMap(S, { minX: v.cx - c.width / 2 / S, minZ: v.cz - c.height / 2 / S, w: c.width, h: c.height }, canvas);
        this.base = { key, canvas };
      }
    }
    this.drawRoute(ctx, X, Zm, 5 * k);
    if (this.gps?.target) {
      // Waypoint flag.
      const wx = X(this.gps.target.x), wy = Zm(this.gps.target.z);
      ctx.fillStyle = '#c050ff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx, wy - 22 * k); ctx.lineTo(wx + 14 * k, wy - 16 * k); ctx.lineTo(wx, wy - 10 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.lineWidth = 3 * k;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    // Labels never overlap (first come, first served), and smaller places appear as you zoom in.
    const taken = [];
    const label = (t, x, z, dy = 0, size = 11) => {
      const sx = X(x), sy = Zm(z) + dy * k;
      if (sx < -200 || sx > c.width + 200 || sy < -40 || sy > c.height + 40) return;
      const w = ctx.measureText(t).width / 2 + 3 * k, h = size * 0.6 * k + 2 * k;
      if (taken.some((r) => Math.abs(r[0] - sx) < r[2] + w && Math.abs(r[1] - sy) < r[3] + h)) return;
      taken.push([sx, sy, w, h]);
      ctx.strokeText(t, sx, sy); ctx.fillText(t, sx, sy);
    };
    const zoom = S / k; // CSS px per metre
    ctx.font = `bold ${15 * k}px "Oswald", sans-serif`;
    ctx.fillStyle = '#fff';
    for (const d of this.districtLabels) label(d.name.toUpperCase(), d.x, d.z, 0, 15);
    ctx.font = `bold ${11 * k}px sans-serif`;
    if (zoom > 0.25) { ctx.fillStyle = '#ffe9a8'; for (const l of this.pois.landmarks) if (l) label('◆ ' + l.name, l.x, l.z, 14); }
    if (zoom > 0.6) {
      ctx.fillStyle = '#ffb060';
      for (const g of this.pois.garages || []) label('🔧 ' + g.name, g.x, g.z);
      ctx.fillStyle = '#9fd8ff';
      for (const f of this.pois.fuel || []) label('⛽ ' + f.name, f.x, f.z);
    }
    ctx.lineWidth = k;
    for (const m of markers) {
      ctx.fillStyle = m.color || '#ffd400';
      ctx.beginPath(); ctx.arc(X(m.x), Zm(m.z), 7 * k, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(X(p.x), Zm(p.z), 6 * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e02020'; ctx.lineWidth = 3 * k; ctx.stroke(); ctx.lineWidth = 1;
  }
}

function bbox(P) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, z] of P) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); }
  return [a, b, c, d];
}

function formatTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
