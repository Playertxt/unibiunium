// Game-wide constants, aircraft/ground unit definitions, graphics presets, key bindings and persisted settings.

export const GRAVITY = 9.81;
export const WORLD = {
  size: 36000,        // terrain square side (m) — twice the original extent
  seg: 720,           // heightmap / terrain segments (50 m cells)
  scale: 2,           // world features (coastlines, valleys, craters) scaled to the bigger map
  boundary: 21000,    // leave the combat area beyond this
  ceiling: 9000,
};

export const TEAM = { BLUE: 0, RED: 1 };
export const TEAM_NAMES = ['Blue Alliance', 'Red Coalition'];
export const TEAM_COLORS = ['#7fb4dd', '#e2574b'];
export const TEAM_HEX = [0x4aa3ff, 0xff5050];

// pen: 0 = machine gun, 1 = cannon, 2 = anti-tank cannon.  Ground "armor" uses the same scale.
export const AIRCRAFT = {
  falcon: {
    name: 'FX-7 Falcon', jp: '隼', role: 'Multirole Jet Fighter', model: 'fighter',
    desc: 'Balanced swept-wing jet. Four 20 mm cannons, four homing rockets and two 250 kg bombs. Auto-lock radar. Great all-rounder.',
    hp: 110, radius: 7, maxSpeed: 300, stallSpeed: 68, thrust: 26,
    pitchRate: 1.55, rollRate: 3.4, yawRate: 0.45, afterburner: true,
    guns: { mounts: [[-0.75, -0.35, -4.6], [0.75, -0.35, -4.6], [-1.05, -0.5, -3.8], [1.05, -0.5, -3.8]],
      rpm: 1100, dmg: 7, speed: 1000, pen: 1, ammo: 900, spread: 0.0022, tracer: 0xffc46a },
    bombs: { count: 2, power: 1.0, mounts: [[-2.4, -0.75, 0.4], [2.4, -0.75, 0.4]] },
    rockets: { count: 4, dmg: 80, speed: 420, mounts: [[-3.7, -0.55, 0.2], [3.7, -0.55, 0.2]] },
    // Auto-lock radar: hold a target near the nose for `time` seconds to lock. Locked: rockets home in and the
    // guns fire at the lead point (where the target will be) whenever it is within `gunAssist` radians of the nose.
    lock: { time: 1.2, cone: 0.17, hold: 0.45, range: 2400, gunAssist: 0.15, turn: 2.2 },
    stats: { speed: 0.82, agility: 0.8, firepower: 0.6, armor: 0.4, ground: 0.45 },
    cam: { dist: 21, height: 4.2 },
  },
  kestrel: {
    name: 'IX-3 Kestrel', jp: '疾風', role: 'Interceptor', model: 'interceptor',
    desc: 'Delta-wing speed demon. Two hard-hitting 30 mm cannons and eight rockets that home in under its auto-lock radar.',
    hp: 92, radius: 6.5, maxSpeed: 345, stallSpeed: 80, thrust: 33,
    pitchRate: 1.38, rollRate: 4.3, yawRate: 0.4, afterburner: true,
    guns: { mounts: [[-0.9, -0.3, -4.2], [0.9, -0.3, -4.2]],
      rpm: 780, dmg: 15, speed: 960, pen: 1, ammo: 320, spread: 0.0026, tracer: 0xff8a50 },
    bombs: null,
    rockets: { count: 8, dmg: 75, speed: 420, mounts: [[-2.6, -0.6, -0.5], [2.6, -0.6, -0.5]] },
    lock: { time: 1.0, cone: 0.18, hold: 0.5, range: 2800, gunAssist: 0.15, turn: 2.6 },
    stats: { speed: 1.0, agility: 0.86, firepower: 0.7, armor: 0.3, ground: 0.4 },
    cam: { dist: 20, height: 4 },
  },
  viper: {
    name: 'RX-8 Viper', jp: '蝮', role: 'Agile Dogfighter', model: 'canard',
    desc: 'Canard-delta knife fighter. Rolls faster than anything in the sky; two 25 mm cannons and six rockets.',
    hp: 100, radius: 7, maxSpeed: 320, stallSpeed: 62, thrust: 28,
    pitchRate: 1.85, rollRate: 4.9, yawRate: 0.6, afterburner: true,
    guns: { mounts: [[-0.7, -0.3, -4.4], [0.7, -0.3, -4.4]],
      rpm: 1300, dmg: 8, speed: 1020, pen: 1, ammo: 800, spread: 0.0022, tracer: 0xfff07a },
    bombs: null,
    rockets: { count: 6, dmg: 75, speed: 420, mounts: [[-2.6, -0.6, 0], [2.6, -0.6, 0]] },
    stats: { speed: 0.88, agility: 1.0, firepower: 0.62, armor: 0.35, ground: 0.4 },
    cam: { dist: 20, height: 4 },
  },
  corvid: {
    name: 'NX-37 Corvid', jp: '鴉', role: 'Supermaneuverable', model: 'forward',
    desc: 'Forward-swept wings and thrust vectoring: turns on a coin and flies slower than anyone. Its 30 mm cannon punches through tank armour. Auto-lock radar.',
    hp: 105, radius: 7.5, maxSpeed: 305, stallSpeed: 48, thrust: 27,
    pitchRate: 2.05, rollRate: 4.0, yawRate: 0.8, afterburner: true,
    guns: { mounts: [[0.8, -0.2, -4.6]],
      rpm: 1150, dmg: 12, speed: 1000, pen: 2, ammo: 450, spread: 0.002, tracer: 0xff9a4a },
    bombs: { count: 2, power: 1.0, mounts: [[-2.2, -0.8, 0.8], [2.2, -0.8, 0.8]] },
    rockets: { count: 8, dmg: 80, speed: 420, mounts: [[-3.4, -0.6, 0.6], [3.4, -0.6, 0.6]] },
    lock: { time: 1.0, cone: 0.19, hold: 0.5, range: 2600, gunAssist: 0.15, turn: 2.6 },
    stats: { speed: 0.8, agility: 1.0, firepower: 0.75, armor: 0.42, ground: 0.7 },
    cam: { dist: 21, height: 4.2 },
  },
  wraith: {
    name: 'SX-21 Wraith', jp: '亡霊', role: 'Stealth Strike Fighter', model: 'stealth',
    desc: 'Faceted stealth jet. Enemy pilots and AA spot it at half the usual range. One 25 mm cannon and four 500 kg bombs. Auto-lock radar.',
    hp: 120, radius: 8, maxSpeed: 315, stallSpeed: 66, thrust: 26,
    pitchRate: 1.5, rollRate: 3.6, yawRate: 0.45, afterburner: true, stealth: 0.5,
    guns: { mounts: [[0.9, 0.1, -4.2]],
      rpm: 1500, dmg: 9, speed: 1040, pen: 1, ammo: 600, spread: 0.002, tracer: 0xb0ffb0 },
    bombs: { count: 4, power: 1.4, mounts: [[-1.0, -0.8, -0.4], [1.0, -0.8, -0.4], [-1.0, -0.8, 1.6], [1.0, -0.8, 1.6]], interval: 0.25 },
    rockets: null,
    lock: { time: 1.0, cone: 0.17, hold: 0.45, range: 2600, gunAssist: 0.15, turn: 2.2 },
    stats: { speed: 0.84, agility: 0.72, firepower: 0.62, armor: 0.5, ground: 0.8 },
    cam: { dist: 22, height: 4.4 },
  },
  vortex: {
    name: 'VX-14 Vortex', jp: '渦潮', role: 'Heavy Air Superiority', model: 'twin',
    desc: 'Big twin-engine brawler with twin tails. Two 30 mm cannons, sixteen rockets, two bombs and a thick hide. Auto-lock radar.',
    hp: 165, radius: 9.5, maxSpeed: 335, stallSpeed: 70, thrust: 31,
    pitchRate: 1.4, rollRate: 3.0, yawRate: 0.45, afterburner: true,
    guns: { mounts: [[-1.0, -0.3, -5.6], [1.0, -0.3, -5.6]],
      rpm: 900, dmg: 13, speed: 980, pen: 1, ammo: 500, spread: 0.0024, tracer: 0xff7a5a },
    bombs: { count: 2, power: 1.2, mounts: [[-1.1, -1.4, 0.5], [1.1, -1.4, 0.5]] },
    rockets: { count: 16, dmg: 80, speed: 420, mounts: [[-3.6, -0.7, 0], [3.6, -0.7, 0], [-5.0, -0.6, 0.6], [5.0, -0.6, 0.6]] },
    lock: { time: 0.9, cone: 0.2, hold: 0.5, range: 2800, gunAssist: 0.15, turn: 2.6 },
    stats: { speed: 0.92, agility: 0.62, firepower: 0.9, armor: 0.68, ground: 0.65 },
    cam: { dist: 25, height: 5 },
  },
  hammer: {
    name: 'AX-5 Hammerhead', jp: '鉄槌', role: 'Ground Attack', model: 'attacker',
    desc: 'Armoured tank-buster. Nose-mounted anti-tank cannon, 12 rockets and four 500 kg bombs.',
    hp: 190, radius: 8.5, maxSpeed: 235, stallSpeed: 52, thrust: 19,
    pitchRate: 1.2, rollRate: 2.5, yawRate: 0.5, afterburner: false,
    guns: { mounts: [[0, -0.9, -7.2]],
      rpm: 2400, dmg: 9, speed: 1050, pen: 2, ammo: 1100, spread: 0.003, tracer: 0x9cf6ff },
    bombs: { count: 4, power: 1.6, mounts: [[-3.2, -0.9, 0.3], [3.2, -0.9, 0.3], [-4.6, -0.9, 0.5], [4.6, -0.9, 0.5]] },
    rockets: { count: 12, dmg: 85, speed: 380, mounts: [[-5.6, -0.8, -0.6], [5.6, -0.8, -0.6]] },
    stats: { speed: 0.6, agility: 0.55, firepower: 0.85, armor: 0.75, ground: 1.0 },
    cam: { dist: 24, height: 5 },
  },
  titan: {
    name: 'BX-9 Titan', jp: '巨人', role: 'Heavy Bomber', model: 'bomber',
    desc: 'Four-engine strategic bomber. Sixteen 500 kg bombs; three defensive turrets fire automatically at enemy fighters.',
    hp: 430, radius: 16, maxSpeed: 190, stallSpeed: 55, thrust: 11,
    pitchRate: 0.55, rollRate: 0.95, yawRate: 0.25, afterburner: false,
    guns: { mounts: [[0, -0.8, -14.5]],
      rpm: 900, dmg: 5, speed: 900, pen: 0, ammo: 500, spread: 0.004, tracer: 0xffe08a },
    bombs: { count: 16, power: 1.6, mounts: [[-0.8, -1.8, -1], [0.8, -1.8, -1], [-0.8, -1.8, 2], [0.8, -1.8, 2]], interval: 0.16 },
    rockets: null,
    turrets: [
      { pos: [0, 2.3, -5], minPitch: 0, maxPitch: 1.4 },
      { pos: [0, 0.6, 15.5], minPitch: -0.7, maxPitch: 0.9, rear: true },
      { pos: [0, -2.0, 3], minPitch: -1.4, maxPitch: 0 },
    ],
    turretGun: { rpm: 650, dmg: 5, speed: 900, range: 950, pen: 0, tracer: 0xffe08a },
    stats: { speed: 0.45, agility: 0.2, firepower: 0.5, armor: 1.0, ground: 1.0 },
    cam: { dist: 52, height: 11 },
    noHover: true,
  },
  ubu: {
    name: 'UBU-121 Unbiunium', jp: '元素', role: 'Element-121 Prototype', model: 'ubu',
    desc: 'Experimental hyperjet powered by an element 121 reactor. Fastest airframe built, armour-piercing plasma cannons, rockets and bombs. Fastest auto-lock radar, homing plasma rounds, guided bombs and self-seeking rockets.',
    hp: 150, radius: 8, maxSpeed: 430, stallSpeed: 64, thrust: 42,
    pitchRate: 1.8, rollRate: 4.6, yawRate: 0.6, afterburner: true, glow: true,
    guns: { mounts: [[-1.1, -0.2, -4.8], [1.1, -0.2, -4.8], [-2.2, -0.35, -2.0], [2.2, -0.35, -2.0]],
      rpm: 1100, dmg: 10, speed: 1400, pen: 2, ammo: 1200, spread: 0.0016, tracer: 0x6af2ff, homing: 0.6 },
    bombs: { count: 4, power: 1.6, mounts: [[-1.6, -0.9, 0.2], [1.6, -0.9, 0.2], [-3.0, -0.8, 1.2], [3.0, -0.8, 1.2]], guided: 40 },
    rockets: { count: 12, dmg: 95, speed: 480, mounts: [[-4.2, -0.6, 1.0], [4.2, -0.6, 1.0]], seeker: { cone: 0.3, range: 2800 } },
    lock: { time: 0.7, cone: 0.24, hold: 0.55, range: 3200, gunAssist: 0.2, turn: 3.2 },
    stats: { speed: 1.0, agility: 0.95, firepower: 1.0, armor: 0.7, ground: 0.9 },
    cam: { dist: 22, height: 4.4 },
  },
};
export const AIRCRAFT_ORDER = ['falcon', 'kestrel', 'viper', 'corvid', 'wraith', 'vortex', 'hammer', 'titan', 'ubu'];

export const GROUND = {
  tank:   { name: 'Tank', hp: 130, armor: 2, radius: 4.5, speed: 7, score: 50,
            weapon: { type: 'shell', dmg: 45, reload: 7.5, range: 1700, speed: 650 } },
  heavytank: { name: 'Heavy Tank', hp: 230, armor: 2, radius: 5.8, speed: 5, score: 80,
            weapon: { type: 'shell', dmg: 60, reload: 9, range: 1900, speed: 700 } },
  aa:     { name: 'AA Gun', hp: 45, armor: 1, radius: 3.6, score: 40,
            weapon: { type: 'aa', dmg: 4.2, rpm: 520, range: 1800, speed: 950 } },
  truck:  { name: 'Truck', hp: 30, armor: 0, radius: 3.6, speed: 11, score: 20 },
  bunker: { name: 'Pillbox', hp: 220, armor: 2, radius: 6, score: 60,
            weapon: { type: 'shell', dmg: 30, reload: 9, range: 1300, speed: 600 } },
  depot:  { name: 'Fuel Depot', hp: 120, armor: 1, radius: 8, score: 60, explosive: true },
  radar:  { name: 'Radar Station', hp: 90, armor: 1, radius: 7, score: 80 },
  hangar: { name: 'Hangar', hp: 380, armor: 2, radius: 17, score: 100 },
  hq:     { name: 'Command HQ', hp: 1500, armor: 2, radius: 24, score: 400 },
  ship:   { name: 'Destroyer', hp: 900, armor: 2, radius: 30, speed: 6, score: 300,
            weapon: { type: 'aa', dmg: 4.5, rpm: 700, range: 2000, speed: 950 } },
  // Radar SAM: tracks an aircraft for `lock` seconds, then launches a radar-guided missile. Aircraft below
  // `minAlt` metres above the ground are under its radar horizon.
  sam:    { name: 'SAM Site', hp: 70, armor: 1, radius: 4.5, score: 90,
            weapon: { type: 'sam', range: 5200, reload: 11, lock: 2.6, dmg: 72, speed: 560, minAlt: 70 } },
  // Downed friendly pilot waiting for a hover-landing rescue (dynamic event). Can't be hurt or targeted.
  pilot:  { name: 'Downed Pilot', hp: 1e9, armor: 9, radius: 2.5, score: 0, passive: true },
};

// Missiles: IR heat-seekers (enemy fighters and aces; spoofed by flares) and radar SAMs (spoofed by chaff).
export const MISSILE = {
  ir:    { dmg: 58, maxSpeed: 520, motor: 3.2, life: 11, turn: 1.75, fuse: 9, gimbal: 1.15, decoy: 0.36 },
  radar: { dmg: 72, maxSpeed: 560, motor: 4.5, life: 14, turn: 1.55, fuse: 11, gimbal: 1.25, decoy: 0.4 },
};
// Countermeasures carried by every aircraft (the Titan carries more), and how many are dropped per press.
export const CM = { flares: 30, chaff: 30, salvo: 3, cooldown: 0.9 };

export const SCORE = { airKill: 120, botKill: 100, assist: 40 };

// ---------- graphics ----------
// Each option's levels map to concrete values; presets pick a level for every option.
export const GFX = {
  shadows: { off: 0, low: 1024, medium: 2048, high: 4096 },
  view: { near: 0.75, normal: 1.0, far: 1.2, extreme: 1.45 },
  trees: { off: 0, low: 3500, medium: 8000, high: 14000, ultra: 22000 },
  clouds: { off: 0, low: 30, medium: 50, high: 70, ultra: 95 },
  effects: { low: 0.45, medium: 0.7, high: 1 },
};
// renderScale is a percentage of the display's native resolution.
export const PRESETS = {
  low:    { renderScale: 70,  shadows: 'off',    view: 'near',    trees: 'low',    clouds: 'low',    effects: 'low',    bloom: false, msaa: false },
  medium: { renderScale: 85,  shadows: 'low',    view: 'normal',  trees: 'medium', clouds: 'medium', effects: 'medium', bloom: true,  msaa: false },
  high:   { renderScale: 100, shadows: 'medium', view: 'far',     trees: 'high',   clouds: 'high',   effects: 'high',   bloom: true,  msaa: true },
  ultra:  { renderScale: 125, shadows: 'high',   view: 'extreme', trees: 'ultra',  clouds: 'ultra',  effects: 'high',   bloom: true,  msaa: true },
};
export const TIER_NAMES = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };

// ---------- phones & tablets ----------
const UA = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const IS_MOBILE = /android|iphone|ipad|ipod|mobile/i.test(UA)
  || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
// A touch screen is the main pointer (phones, tablets). Touch laptops keep mouse controls unless the player turns touch on.
export const IS_TOUCH = typeof matchMedia !== 'undefined' && (matchMedia('(pointer: coarse)').matches || (IS_MOBILE && navigator.maxTouchPoints > 0));
// Phone screens report 2–3× pixel ratios; rendering at that density costs 4–9× the pixels for little visible gain,
// so the native ratio is capped on mobile (the render-resolution slider still scales on top of it).
export function screenDpr() { const d = (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1; return IS_MOBILE ? Math.min(d, 1.25) : d; }
// What "Auto" resolves to on phones and tablets: no bloom, shadows or MSAA (the heaviest passes on mobile GPUs).
export const MOBILE_PRESETS = {
  low:    { renderScale: 80,  shadows: 'off', view: 'near',   trees: 'low',    clouds: 'low',    effects: 'low',    bloom: false, msaa: false },
  medium: { renderScale: 100, shadows: 'off', view: 'normal', trees: 'medium', clouds: 'medium', effects: 'medium', bloom: false, msaa: false },
};

// ---------- controls ----------
// [action id, label, default bindings]. Codes are KeyboardEvent.code values, or Mouse0/1/2 for mouse buttons.
export const ACTIONS = [
  ['fire', 'Fire guns', ['Mouse0']],
  ['bomb', 'Drop bomb', ['Mouse2', 'Space']],
  ['rocket', 'Fire rockets', ['KeyR']],
  ['throttleUp', 'Throttle up', ['KeyW', 'ShiftLeft']],
  ['throttleDown', 'Throttle down', ['KeyS', 'ControlLeft']],
  ['rollLeft', 'Roll left', ['KeyA', 'ArrowLeft']],
  ['rollRight', 'Roll right', ['KeyD', 'ArrowRight']],
  ['pitchUp', 'Nose up', ['ArrowUp']],
  ['pitchDown', 'Nose down', ['ArrowDown']],
  ['yawLeft', 'Rudder left', ['KeyQ']],
  ['yawRight', 'Rudder right', ['KeyE']],
  ['freeLook', 'Free look (hold)', ['KeyC']],
  ['camera', 'Switch camera', ['KeyV']],
  ['bombCam', 'Bomb camera', ['KeyX']],
  ['scoreboard', 'Scoreboard (hold)', ['Tab']],
  ['chat', 'Chat (multiplayer)', ['Enter', 'KeyT']],
  ['rearm', 'Rearm (refill ammo)', ['KeyJ']],
  ['respawn', 'Bail out / respawn', ['KeyK']],
  ['boost', 'Boost (hold)', ['KeyZ']],
  ['airbrake', 'Air brake (hold)', ['KeyB']],
  ['barrelRoll', 'Barrel roll (evade)', ['KeyF']],
  ['uturn', 'Immelmann U-turn', ['KeyG']],
  ['cobra', 'Cobra manoeuvre', ['KeyY']],
  ['hover', 'Hover mode (VTOL) on/off', ['KeyH']],
  ['flares', 'Flares (decoy heat-seekers)', ['KeyN']],
  ['chaff', 'Chaff (decoy radar SAMs)', ['KeyM']],
];
const ACTION_DEFAULTS = Object.fromEntries(ACTIONS.map(([id, , keys]) => [id, keys]));

const KEY_NAMES = {
  Mouse0: 'Left mouse', Mouse1: 'Middle mouse', Mouse2: 'Right mouse',
  ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt', AltRight: 'R-Alt', MetaLeft: 'L-Meta', MetaRight: 'R-Meta',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Enter: 'Enter', Tab: 'Tab',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', CapsLock: 'Caps Lock', NumpadEnter: 'Num Enter',
};
export function keyName(code) {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

// ---------- persisted settings ----------
const KEY = 'skyforge.settings.v1';
const DEFAULTS = {
  ver: 2, name: 'Pilot', plane: 'falcon', world: 'island',
  // graphics
  preset: 'auto', ...PRESETS.high, dynRes: true, targetFps: 60, showFps: false,
  // controls
  steering: 'mouse', touch: 'auto', touchSens: 1.0, sens: 1.8, stickSens: 1.0, deadZone: 7, invert: false, wheelThrottle: true, fov: 70, shake: true,
  keys: {},
  // audio & HUD
  volume: 0.7, engineVol: 0.8, fxVol: 1.0, minimap: true, killfeed: true, names: true,
  killcam: true, radio: true,
};

export const Settings = {
  data: JSON.parse(JSON.stringify(DEFAULTS)),
  detected: null, // { tier, gpu, cores, mem } from detectHardware()

  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { /* ignore */ }
    const d = this.data;
    Object.assign(d, saved);
    d.keys = { ...(saved.keys || {}) };
    if (!saved.ver) {
      // Settings from the first release: carry the chosen quality over and raise the old default sensitivity.
      if (PRESETS[saved.quality]) { d.preset = saved.quality; Object.assign(d, PRESETS[saved.quality]); }
      if (saved.sens === undefined || saved.sens === 1) d.sens = DEFAULTS.sens;
      delete d.quality;
      d.ver = DEFAULTS.ver;
    }
    if (!AIRCRAFT[d.plane]) d.plane = 'falcon';
    for (const k of Object.keys(GFX)) if (!(d[k] in GFX[k])) d[k] = DEFAULTS[k];
    if (!['mouse', 'joystick'].includes(d.steering)) d.steering = 'mouse';
    if (!['auto', 'on', 'off'].includes(d.touch)) d.touch = 'auto';
    if (![...Object.keys(PRESETS), 'auto', 'custom'].includes(d.preset)) d.preset = 'auto';
    return d;
  },

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  },

  // The tier "Auto" resolves to on this machine.
  get autoTier() { return (this.detected && this.detected.tier) || 'high'; },

  applyPreset(name) {
    this.data.preset = name;
    const tier = name === 'auto' ? this.autoTier : name;
    const table = name === 'auto' && IS_MOBILE && MOBILE_PRESETS[tier] ? MOBILE_PRESETS : PRESETS;
    if (table[tier]) Object.assign(this.data, table[tier]);
  },

  // On-screen touch controls: automatic on phones/tablets, or forced on/off in Settings → Controls.
  get touch() { const t = this.data.touch; return t === 'on' || (t === 'auto' && IS_TOUCH); },

  // Resolved numeric graphics values.
  get gfx() {
    const d = this.data;
    return {
      renderScale: d.renderScale,
      shadowSize: GFX.shadows[d.shadows] ?? 2048,
      view: GFX.view[d.view] ?? 1,
      trees: GFX.trees[d.trees] ?? 8000,
      clouds: GFX.clouds[d.clouds] ?? 50,
      effects: GFX.effects[d.effects] ?? 1,
      bloom: !!d.bloom,
    };
  },

  keysFor(action) { return this.data.keys[action] || ACTION_DEFAULTS[action] || []; },

  // Bind a code to an action slot (0 primary, 1 secondary); '' clears the slot.
  // A code is removed from every other binding so one key never triggers two actions.
  bind(action, slot, code) {
    const keys = this.data.keys;
    if (code) {
      for (const [id] of ACTIONS) {
        const cur = [...this.keysFor(id)];
        const i = cur.indexOf(code);
        if (i >= 0 && !(id === action && i === slot)) { cur[i] = ''; keys[id] = cur; }
      }
    }
    const mine = [...this.keysFor(action)];
    while (mine.length < 2) mine.push('');
    mine[slot] = code;
    keys[action] = mine;
  },

  resetKeys() { this.data.keys = {}; },
};

export function kmh(ms) { return Math.round(ms * 3.6); }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
export function damp(a, b, rate, dt) { return lerp(a, b, 1 - Math.exp(-rate * dt)); }
