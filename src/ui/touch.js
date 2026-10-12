// On-screen controls for phones and tablets: a floating joystick on the left (analog walking
// and steering), drag anywhere on the right to look, and context buttons that change between
// on foot and driving. Buttons feed the same key codes the keyboard does.

const BUTTONS = [
  // On foot
  { id: 'attack', label: '👊', code: 'Mouse0', hold: true, foot: true, big: true },
  { id: 'aim', label: 'AIM', code: 'Mouse2', toggle: true, foot: true, when: (c) => c.gun },
  { id: 'kick', label: 'KICK', code: 'KeyX', foot: true },
  { id: 'jump', label: 'JUMP', code: 'Space', foot: true },
  { id: 'run', label: 'RUN', code: 'ShiftLeft', toggle: true, foot: true },
  { id: 'weapon', label: '⇆', code: 'Tab', foot: true },
  // Driving
  { id: 'hand', label: 'BRAKE', code: 'Space', hold: true, car: true, big: true },
  { id: 'horn', label: 'HORN', code: 'KeyH', hold: true, car: true },
  { id: 'back', label: '👀', code: 'KeyC', hold: true, car: true },
  { id: 'siren', label: 'SIREN', code: 'KeyG', car: true, when: (c) => c.police },
  // Both
  { id: 'enter', label: 'CAR', code: 'KeyF', both: true },
  { id: 'use', label: 'E', code: 'KeyE', both: true, when: (c) => c.use },
];
const TOP = [
  { id: 'pause', label: '❚❚', act: 'pause' },
  { id: 'map', label: 'MAP', code: 'KeyM' },
  { id: 'gig', label: '📱 ACCEPT', code: 'KeyJ', when: (c) => c.offer },
  { id: 'skip', label: 'SKIP ⏩', code: 'KeyT', when: (c) => c.metro },
  { id: 'leave', label: 'LEAVE', code: 'KeyQ', when: (c) => c.metro },
];

export class TouchControls {
  constructor(input, settings) {
    this.input = input;
    this.settings = settings;
    this.enabled = false;
    this.stick = null; // {id, x0, y0, x, y}
    this.look = new Map(); // touch id -> {x, y}
    this.toggled = new Set();
    this.build();
  }

  build() {
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = '<div class="t-stick-zone"></div><div class="t-look-zone"></div><div class="t-ring"><div class="t-knob"></div></div><div class="t-buttons"></div><div class="t-top"></div>';
    document.body.appendChild(root);
    this.root = root;
    this.ring = root.querySelector('.t-ring');
    this.knob = root.querySelector('.t-knob');
    const mk = (b, parent) => {
      const el = document.createElement('div');
      el.className = `t-btn${b.big ? ' big' : ''}`;
      el.dataset.id = b.id;
      el.textContent = b.label;
      parent.appendChild(el);
      b.el = el;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.down(b); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); this.up(b); }, { passive: false });
      el.addEventListener('touchcancel', () => this.up(b));
    };
    this.buttons = BUTTONS.map((b) => ({ ...b }));
    this.top = TOP.map((b) => ({ ...b }));
    for (const b of this.buttons) mk(b, root.querySelector('.t-buttons'));
    for (const b of this.top) mk(b, root.querySelector('.t-top'));
    const zone = root.querySelector('.t-stick-zone'), lookZone = root.querySelector('.t-look-zone');
    zone.addEventListener('touchstart', (e) => { e.preventDefault(); this.stickStart(e.changedTouches[0]); }, { passive: false });
    lookZone.addEventListener('touchstart', (e) => { e.preventDefault(); for (const t of e.changedTouches) this.look.set(t.identifier, { x: t.clientX, y: t.clientY }); }, { passive: false });
    addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (this.stick && t.identifier === this.stick.id) this.stickMove(t);
        const l = this.look.get(t.identifier);
        if (l) {
          const k = 2.4;
          this.input.mouseDX += (t.clientX - l.x) * k;
          this.input.mouseDY += (t.clientY - l.y) * k;
          l.x = t.clientX; l.y = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.stick && t.identifier === this.stick.id) this.stickEnd();
        this.look.delete(t.identifier);
      }
    };
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
  }

  setEnabled(on) {
    this.enabled = on;
    this.root.classList.toggle('show', on);
    document.body.classList.toggle('touch', on);
    if (!on) { this.stickEnd(); for (const b of this.buttons) this.up(b, true); this.toggled.clear(); }
  }

  down(b) {
    if (b.act === 'pause') { this.onPause?.(); return; }
    const i = this.input;
    if (b.toggle) {
      if (this.toggled.has(b.id)) { this.toggled.delete(b.id); i.keys.delete(b.code); b.el.classList.remove('on'); }
      else { this.toggled.add(b.id); i.keys.add(b.code); i.pressed.add(b.code); b.el.classList.add('on'); }
      return;
    }
    i.keys.add(b.code); i.pressed.add(b.code);
    b.el.classList.add('on');
  }

  up(b, force = false) {
    if (b.toggle && !force) return;
    this.input.keys.delete(b.code);
    b.el?.classList.remove('on');
  }

  // ---------- joystick ----------
  stickStart(t) {
    this.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY };
    this.ring.style.left = `${t.clientX}px`;
    this.ring.style.top = `${t.clientY}px`;
    this.ring.classList.add('show');
    this.stickMove(t);
  }

  stickMove(t) {
    const R = 60;
    let dx = t.clientX - this.stick.x0, dy = t.clientY - this.stick.y0;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const x = dx / R, y = dy / R;
    this.input.stick = { x: Math.abs(x) < 0.12 ? 0 : x, y: Math.abs(y) < 0.12 ? 0 : y };
  }

  stickEnd() {
    this.stick = null;
    this.input.stick = null;
    this.ring.classList.remove('show');
    this.knob.style.transform = '';
  }

  // Show the buttons that make sense right now.
  update(ctx) {
    if (!this.enabled) return;
    const car = ctx.driving;
    for (const b of this.buttons) {
      let show = b.both || (b.foot && !car) || (b.car && car);
      if (show && b.when) show = b.when(ctx);
      if (ctx.metro && b.id !== 'use') show = false;
      if (b.el.style.display !== (show ? '' : 'none')) {
        b.el.style.display = show ? '' : 'none';
        if (!show) this.up(b, true), this.toggled.delete(b.id), b.el.classList.remove('on');
      }
    }
    for (const b of this.top) {
      const show = !b.when || b.when(ctx);
      if (b.el.style.display !== (show ? '' : 'none')) b.el.style.display = show ? '' : 'none';
    }
    this.buttons.find((b) => b.id === 'enter').el.textContent = car ? 'EXIT' : 'CAR';
  }
}
