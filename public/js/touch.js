// On-screen touch controls for phones and tablets: a floating stick (left), drag-anywhere aiming, a throttle
// slider, weapon buttons (right), manoeuvre buttons (bottom centre) and a small top bar (bail, camera, score, pause).
// Everything feeds the same Input object the keyboard and mouse use, by action id.
import { Settings, IS_MOBILE, clamp } from './config.js';

// A mouse hovering with no button held is not a drag (desktop testing with touch controls forced on).
const idle = (e) => e.pointerType === 'mouse' && !e.buttons;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const lbl = (en, jp) => `<b>${en}</b>${jp ? `<i>${jp}</i>` : ''}`;

// [id, action, label, jp, hold?]
const WEAPONS = [
  ['fire', 'fire', 'FIRE', '射撃', true],
  ['rocket', 'rocket', 'RKT', '噴進', true],
  ['bomb', 'bomb', 'BOMB', '爆弾', true],
  ['boost', 'boost', 'BOOST', '加速', true],
  ['brake', 'airbrake', 'BRAKE', '制動', true],
];
const MOVES = [
  ['roll', 'barrelRoll', 'ROLL', '横転'],
  ['uturn', 'uturn', 'U-TURN', '反転'],
  ['cobra', 'cobra', 'COBRA', ''],
  ['hover', 'hover', 'HOVER', '浮遊'],
  ['jet', 'nextJet', 'JET', '機体'],
];
const TOP = [
  ['bail', 'respawn', 'BAIL', '脱出'],
  ['cam', 'camera', 'CAM', '視点'],
  ['score', 'scoreboard', 'SCORE', '戦況', true],
];

// Fullscreen + landscape lock where the browser allows it (Android Chrome, iPadOS). Must run inside a tap.
export function enterFullscreen() {
  if (!IS_MOBILE) return;
  const d = document, root = d.documentElement;
  try {
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      if (req) {
        const p = req.call(root, { navigationUI: 'hide' });
        if (p && p.then) p.then(lockLandscape, () => {}); else lockLandscape();
        return;
      }
    }
    lockLandscape();
  } catch (e) { /* not supported */ }
}
function lockLandscape() {
  try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ }
}

export class TouchControls {
  constructor(app) {
    this.app = app;
    this.input = app.input;
    this.shown = false;
    this.btns = {};
    this.cache = {};
    this.stickId = null; this.aimId = null; this.thrId = null;
    this.build();
    // Stop pinch-zoom, double-tap zoom and pull-to-refresh while the controls are up.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (this.shown) e.preventDefault(); }, { passive: false });
    this.syncBody();
  }

  build() {
    const root = this.root = el('div', '', null);
    root.id = 'touch';
    // Aim layer: drag anywhere that isn't a control.
    const aim = el('div', 't-aim');
    root.appendChild(aim);
    this.bindAim(aim);

    // Floating stick.
    const zone = el('div', 't-stickzone');
    const base = this.base = el('div', 't-base');
    const knob = this.knob = el('div', 't-knob');
    base.appendChild(knob);
    zone.appendChild(base);
    root.appendChild(zone);
    this.bindStick(zone);

    // Throttle slider.
    const thr = el('div', 't-throttle');
    const track = this.track = el('div', 't-track');
    this.fill = el('div', 't-fill');
    this.thumb = el('div', 't-thumb');
    this.abMark = el('div', 't-ab');
    track.append(this.fill, this.abMark, this.thumb);
    this.thrLabel = el('div', 't-thr-label', lbl('THR', '推力'));
    thr.append(track, this.thrLabel);
    root.appendChild(thr);
    this.bindThrottle(track);

    const group = (cls, defs, round) => {
      const g = el('div', cls);
      for (const [id, action, en, jp, hold] of defs) {
        const b = el('div', `t-btn t-${id}${round ? ' round' : ''}`, lbl(en, jp));
        this.bindButton(b, action, hold);
        this.btns[id] = b;
        g.appendChild(b);
      }
      root.appendChild(g);
      return g;
    };
    this.weapons = group('t-weapons', WEAPONS, true);
    this.moves = group('t-moves', MOVES, false);
    this.top = group('t-top', TOP, false);
    const pause = el('div', 't-btn t-pause', '<b>❚❚</b>');
    pause.addEventListener('pointerdown', (e) => { e.preventDefault(); this.releaseAll(); this.app.pause(); });
    this.top.appendChild(pause);

    document.body.appendChild(root);
    // Portrait warning for phones (CSS shows it only in portrait on small touch screens).
    const rot = el('div', '', '<div class="rot-icon">⟳</div><div><b>Rotate your phone</b><span>横向きにしてください · landscape only</span></div>');
    rot.id = 'rotate';
    document.body.appendChild(rot);
  }

  // ---------- pointer handling ----------
  bindButton(b, action, hold) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.app.audio.init();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      b.classList.add('down');
      this.input.press(action);
      if (!hold) setTimeout(() => this.input.release(action), 0);
    });
    const up = () => { b.classList.remove('down'); if (hold) this.input.release(action); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
  }

  bindAim(layer) {
    let lx = 0, ly = 0;
    layer.addEventListener('pointerdown', (e) => {
      if (this.aimId !== null) return;
      e.preventDefault();
      this.app.audio.init();
      this.aimId = e.pointerId; lx = e.clientX; ly = e.clientY;
      try { layer.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    layer.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.aimId || idle(e)) return;
      // Radians per pixel independent of the mouse sensitivity the game applies to these deltas.
      const f = (0.0046 * Settings.data.touchSens) / (0.0021 * Settings.data.sens);
      this.input.addAim((e.clientX - lx) * f, (e.clientY - ly) * f);
      lx = e.clientX; ly = e.clientY;
    });
    const end = (e) => { if (e.pointerId === this.aimId) this.aimId = null; };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
  }

  bindStick(zone) {
    let ox = 0, oy = 0;
    const R = () => this.base.offsetWidth / 2 || 60;
    zone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      this.app.audio.init();
      this.stickId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const r = R(), zr = zone.getBoundingClientRect();
      // The stick centres on the thumb (kept fully inside the zone).
      ox = clamp(e.clientX, zr.left + r + 4, zr.right - r - 4);
      oy = clamp(e.clientY, zr.top + r + 4, zr.bottom - r - 4);
      this.base.style.left = `${ox - zr.left - r}px`;
      this.base.style.top = `${oy - zr.top - r}px`;
      this.base.style.bottom = 'auto';
      this.base.classList.add('active');
      move(e);
    });
    const move = (e) => {
      if (e.pointerId !== this.stickId || idle(e)) return;
      const r = R();
      let dx = (e.clientX - ox) / r, dy = (e.clientY - oy) / r;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.knob.style.transform = `translate(${dx * r * 0.62}px, ${dy * r * 0.62}px)`;
      const dead = 0.1, l = Math.min(1, len);
      if (l < dead) { this.input.touch.stick = { x: 0, y: 0 }; return; }
      const k = (l - dead) / (1 - dead), c = k * (0.4 + 0.6 * k) / l; // finer near the centre
      this.input.touch.stick = { x: dx * l * c, y: dy * l * c };
    };
    zone.addEventListener('pointermove', move);
    const end = (e) => { if (e.pointerId === this.stickId) this.resetStick(); };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  resetStick() {
    this.stickId = null;
    this.input.touch.stick = null;
    this.knob.style.transform = '';
    this.base.classList.remove('active');
    this.base.style.left = this.base.style.top = this.base.style.bottom = '';
  }

  bindThrottle(track) {
    const set = (e) => {
      const r = track.getBoundingClientRect();
      const v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
      if (this.hover) {
        // Hover: centre-sprung lift lever.
        const off = v - 0.5;
        this.input.touch.lift = Math.abs(off) < 0.06 ? 0 : clamp(off * 2.4, -1, 1);
        this.setThumb(v);
      } else {
        this.input.touch.throttle = v;
        this.setThumb(v);
      }
    };
    track.addEventListener('pointerdown', (e) => {
      if (this.thrId !== null) return;
      e.preventDefault();
      this.app.audio.init();
      this.thrId = e.pointerId;
      try { track.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      set(e);
    });
    track.addEventListener('pointermove', (e) => { if (e.pointerId === this.thrId && !idle(e)) set(e); });
    const end = (e) => {
      if (e.pointerId !== this.thrId) return;
      this.thrId = null;
      this.input.touch.throttle = null;
      this.input.touch.lift = 0;
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
  }

  setThumb(v) {
    const pct = `${(v * 100).toFixed(1)}%`;
    this.thumb.style.bottom = pct;
    this.fill.style.height = this.hover ? '0' : pct;
  }

  releaseAll() {
    for (const a of [...this.input.vHeld]) this.input.release(a);
    for (const b of Object.values(this.btns)) b.classList.remove('down');
    this.resetStick();
    this.aimId = this.thrId = null;
    this.input.touch.throttle = null;
    this.input.touch.lift = 0;
  }

  syncBody() {
    const on = Settings.touch;
    if (on !== this.bodyOn) { this.bodyOn = on; document.body.classList.toggle('touch', on); }
  }

  // Toggle a class only when it changes (no style churn every frame).
  flag(key, elm, cls, on) {
    if (this.cache[key] === on) return;
    this.cache[key] = on;
    elm.classList.toggle(cls, on);
  }

  // ---------- per frame ----------
  update() {
    const app = this.app, g = app.game;
    this.syncBody();
    const on = this.bodyOn && app.state === 'playing' && !!g && g.mode !== 'demo';
    // Phones held upright: pause single-player until the phone is turned (the rotate prompt covers the screen).
    if (on && innerHeight > innerWidth && Math.min(innerWidth, innerHeight) < 600 && !app.inMatch) { app.pause(); return; }
    if (on !== this.shown) {
      this.shown = on;
      this.root.classList.toggle('show', on);
      if (!on) this.releaseAll();
    }
    if (!on) return;
    const p = g.player, alive = !!(p && p.alive);
    this.flag('alive', this.root, 'dead', !alive);
    this.flag('free', this.btns.jet, 'hide', g.mode !== 'free');
    this.flag('scoreHide', this.btns.score, 'hide', g.mode === 'free');
    if (!alive) return;
    const d = p.def;
    this.flag('rk', this.btns.rocket, 'hide', !d.rockets);
    this.flag('bm', this.btns.bomb, 'hide', !d.bombs);
    this.flag('hv', this.btns.hover, 'hide', !p.canHover);
    this.flag('rkE', this.btns.rocket, 'empty', !p.rocketsLeft);
    this.flag('bmE', this.btns.bomb, 'empty', !p.bombsLeft);
    this.flag('gnE', this.btns.fire, 'empty', !p.ammo);
    this.flag('hvOn', this.btns.hover, 'on', !!p.hover);
    this.flag('bst', this.btns.boost, 'empty', p.boost < 0.05);
    const hover = !!p.hover;
    if (hover !== this.hover) {
      this.hover = hover;
      this.thrLabel.innerHTML = hover ? lbl('LIFT', '昇降') : lbl('THR', '推力');
      this.track.classList.toggle('lift', hover);
      if (this.thrId === null) this.setThumb(hover ? 0.5 : p.throttle / p.maxThrottle);
    }
    if (this.thrId === null) {
      // Show the real throttle (it changes with spawns, jet swaps and the keyboard).
      const v = hover ? 0.5 : clamp(p.throttle / p.maxThrottle, 0, 1);
      if (Math.abs(v - (this.lastV ?? -1)) > 0.004) { this.lastV = v; this.setThumb(v); }
      const ab = p.maxThrottle > 1 ? 1 / p.maxThrottle : null;
      if (ab !== this.lastAb) { this.lastAb = ab; this.abMark.style.display = ab ? '' : 'none'; if (ab) this.abMark.style.bottom = `${ab * 100}%`; }
    } else this.lastV = -1;
  }
}
