// Keyboard + mouse input with rebindable actions. Uses pointer lock (mouse aim) when the browser allows it;
// if it is refused (some embedded browsers block it) or the player picks joystick steering, the free
// cursor works like a joystick instead.
import { Settings } from './config.js';

export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, middle: false, right: false, wheel: 0, x: 0, y: 0, inside: false, armed: false };
    this.locked = false;
    this.everLocked = false;
    this.free = false;    // pointer lock refused on this page: steer with the free cursor
    this.blocked = false; // true while typing in chat
    this.onLockChange = null;
    this.onFreeMode = null;
    // On-screen touch controls (touch.js) write here: held/tapped action ids, the stick, throttle and lift.
    this.vHeld = new Set();
    this.vPressed = new Set();
    this.touch = { stick: null, throttle: null, lift: 0 };

    addEventListener('keydown', (e) => {
      if (this.blocked) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Quote', 'Slash', 'Backquote'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.releaseMouse(); });
    addEventListener('mousemove', (e) => {
      const m = this.mouse;
      m.x = e.clientX; m.y = e.clientY; m.inside = true;
      if (!this.locked && !this.freeCursor) return;
      m.dx += e.movementX || 0;
      m.dy += e.movementY || 0;
    });
    // Cursor left the window: stop steering and firing until it comes back.
    addEventListener('mouseout', (e) => { if (!e.relatedTarget && !this.locked) this.releaseMouse(); });
    addEventListener('mousedown', (e) => {
      if (!this.captures(e)) return;
      if (e.button === 1) e.preventDefault(); // no autoscroll
      this.setButton(e.button, true);
      this.pressed.add(`Mouse${e.button}`);
    });
    addEventListener('mouseup', (e) => this.setButton(e.button, false));
    addEventListener('wheel', (e) => { if (this.captures(e)) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (this.locked) this.everLocked = true;
      else { this.mouse.left = this.mouse.middle = this.mouse.right = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.lockFailed());
  }

  setButton(b, down) {
    if (b === 0) this.mouse.left = down;
    else if (b === 1) this.mouse.middle = down;
    else if (b === 2) this.mouse.right = down;
  }

  get joystickMode() { return Settings.data.steering === 'joystick'; }
  get touchMode() { return Settings.touch; }
  // True when the free cursor steers (capture refused here, or joystick steering chosen).
  get freeCursor() { return (this.free || this.joystickMode) && !this.locked && !this.touchMode; }

  // Touch drag aim: behaves like mouse movement while the pointer is locked.
  addAim(dx, dy) { if (!this.blocked) { this.mouse.dx += dx; this.mouse.dy += dy; } }
  // On-screen buttons: hold or tap an action by id (same ids as the key bindings).
  press(action) { if (!this.vHeld.has(action)) this.vPressed.add(action); this.vHeld.add(action); }
  release(action) { this.vHeld.delete(action); }

  // Buttons and wheel count while the pointer is locked, or with the free cursor when clicking the 3D view itself.
  captures(e) { return this.locked || (this.freeCursor && e.target === this.el); }

  releaseMouse() {
    const m = this.mouse;
    m.left = m.middle = m.right = false;
    m.inside = false;
    m.armed = false;
  }

  lock() {
    if (this.locked || this.touchMode) return;
    if (this.joystickMode) { this.el.style.cursor = 'crosshair'; return; }
    try {
      const p = this.el.requestPointerLock();
      if (p && p.catch) p.catch(() => this.lockFailed());
    } catch (e) { this.lockFailed(); }
  }

  // Pointer lock was refused. If it has never worked on this page, switch to free-cursor steering.
  // (After a successful lock, a refusal is transient, e.g. re-locking too soon after Esc.)
  lockFailed() {
    if (this.everLocked || this.free) return;
    this.free = true;
    this.el.style.cursor = 'crosshair';
    if (this.onFreeMode) this.onFreeMode();
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  get deadZone() { return Math.max(0.01, Settings.data.deadZone / 100); }

  // Cursor position relative to the screen centre, scaled so the nearest screen edge is 1.
  cursorOffset() {
    const m = this.mouse;
    if (!m.inside || this.blocked) return null;
    const r = Math.min(innerWidth, innerHeight) / 2;
    return { x: (m.x - innerWidth / 2) / r, y: (m.y - innerHeight / 2) / r };
  }

  // Free-cursor joystick: 0 inside the centre dead zone, rising to 1 at the screen edge (finer near the centre).
  // Steering only engages once the cursor has visited the centre, so resuming never yanks the aircraft around.
  stick() {
    const o = this.cursorOffset();
    if (!o) return null;
    const len = Math.hypot(o.x, o.y), dead = this.deadZone;
    if (len < dead) { this.mouse.armed = true; return { x: 0, y: 0 }; }
    if (!this.mouse.armed) return null;
    const k = Math.min(1, (len - dead) / (1 - dead));
    const c = k * (0.45 + 0.55 * k) / len;
    return { x: o.x * c, y: o.y * c };
  }

  codeDown(code) {
    if (!code) return false;
    if (code === 'Mouse0') return this.mouse.left;
    if (code === 'Mouse1') return this.mouse.middle;
    if (code === 'Mouse2') return this.mouse.right;
    return this.down(code);
  }

  // Is any binding of this action held?
  act(action) {
    if (this.vHeld.has(action) && !this.blocked) return true;
    for (const c of Settings.keysFor(action)) if (this.codeDown(c)) return true;
    return false;
  }

  // Was any binding of this action pressed this frame?
  actHit(action) {
    let hit = false;
    if (this.vPressed.delete(action) && !this.blocked) hit = true;
    for (const c of Settings.keysFor(action)) if (c && this.hit(c)) hit = true;
    return hit;
  }

  down(code) { return !this.blocked && this.keys.has(code); }
  hit(code) { if (this.pressed.has(code)) { this.pressed.delete(code); return true; } return false; }
  consumeMouse() { const d = { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel }; this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0; return d; }
  endFrame() { this.pressed.clear(); this.vPressed.clear(); }
  clear() { this.keys.clear(); this.pressed.clear(); this.vPressed.clear(); this.mouse.dx = this.mouse.dy = 0; this.mouse.armed = false; }
}
