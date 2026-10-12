// Keyboard + mouse (pointer lock) input.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.stick = null;
    this.locked = false;
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.keys.add('Mouse' + e.button);
      this.pressed.add('Mouse' + e.button);
    });
    addEventListener('mouseup', (e) => this.keys.delete('Mouse' + e.button));
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
  }

  lock() {
    if (!this.locked) this.canvas.requestPointerLock?.();
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // True once per key press.
  hit(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  // -1..1. The touch joystick (this.stick, screen-space x right / y down) gives analog values.
  axis(neg, pos) {
    const d = (this.down(...pos) ? 1 : 0) - (this.down(...neg) ? 1 : 0);
    const st = this.stick;
    if (d || !st) return d;
    if (pos.includes('KeyW')) return -st.y;
    if (pos.includes('KeyS')) return st.y;
    if (pos.includes('KeyD')) return st.x;
    if (pos.includes('KeyA')) return -st.x;
    return 0;
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.wheel = 0;
  }
}
