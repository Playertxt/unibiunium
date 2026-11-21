// DOM menus: main, campaign, quick battle, hangar, multiplayer lobby, settings (with key rebinding), pause, results.
import { AIRCRAFT, AIRCRAFT_ORDER, Settings, TEAM_NAMES, ACTIONS, TIER_NAMES, keyName, clamp, screenDpr, IS_MOBILE } from './config.js';
import { MISSIONS, Progress } from './campaign.js';
import { WORLDS, WORLD_ORDER, worldDef } from './worlds.js';
import { MEDALS, Medals } from './medals.js';
import { ACES, ACE_ORDER, AceRecords } from './aces.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Japanese + English label pair, as used on buttons and headings.
const J = (jp, en) => `<span class="jp">${esc(jp)}</span><span class="en">${esc(en)}</span>`;
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const SCREENS = ['main', 'campaign', 'quick', 'free', 'hangar', 'medals', 'mp', 'lobby', 'settings', 'controls', 'pause', 'results', 'brief'];
const QUICK_DESC = {
  battle: 'Blue vs Red score race with a full ground war. First team to 3000 points wins.',
  conquest: 'Capture airfields and forward airstrips by hover-landing inside their beacon rings (H, then touch down gently). Owned fields tick points.',
  lps: 'Every pilot for themselves, no respawns. The safe zone shrinks; stay inside the red wall. "Enemy aircraft" sets how many rivals you face.',
  escort: 'One side escorts a Titan to bomb the enemy Command HQ; the other side has to shoot it down. Pick your side.',
};
const RESULT_KANJI = { 'Victory': '勝利', 'Defeat': '敗北', 'Draw': '引分', 'Mission Accomplished': '任務完了', 'Mission Failed': '任務失敗',
  'Campaign Complete!': '完遂', 'You win!': '勝利', 'Match over': '終戦' };
const MODES = { team: 'Team Battle', coop: 'Co-op vs AI', ffa: 'Free-for-all', conquest: 'Conquest', lps: 'Last Pilot Standing', escort: 'Bomber Escort' };

// ---------- settings schema ----------
const pct = (v) => `${Math.round(v * 100)}%`;
const LEVELS = {
  shadows: [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']],
  view: [['near', 'Near'], ['normal', 'Normal'], ['far', 'Far'], ['extreme', 'Extreme']],
  trees: [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']],
  clouds: [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']],
  effects: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']],
};
// Changing one of these turns the preset into "Custom".
const GFX_KEYS = ['renderScale', 'shadows', 'view', 'trees', 'clouds', 'effects', 'bloom', 'msaa'];

function resLabel(v) {
  const pr = clamp((v / 100) * screenDpr(), 0.35, 3);
  return `${v}% · ${Math.round(innerWidth * pr)}×${Math.round(innerHeight * pr)}`;
}

const SETTINGS_TABS = [['graphics', 'Graphics', '画質'], ['controls', 'Controls', '操縦'], ['keys', 'Key bindings', 'キー'], ['audio', 'Audio & HUD', '音・表示']];

function settingsSchema() {
  return {
    graphics: [
      { key: 'preset', label: 'Quality preset', type: 'select',
        options: () => [['auto', `Auto — ${TIER_NAMES[Settings.autoTier]} for this ${IS_MOBILE ? 'device' : 'PC'}`], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra'], ['custom', 'Custom']],
        desc: 'Auto picks settings from your graphics card and CPU. Changing any option below switches to Custom.' },
      { key: 'renderScale', label: 'Render resolution', type: 'range', min: 50, max: 200, step: 5, fmt: resLabel,
        desc: 'Percent of your screen resolution. Lower is faster; above 100% supersamples for sharper edges.' },
      { key: 'shadows', label: 'Shadows', type: 'select', options: LEVELS.shadows },
      { key: 'view', label: 'View distance', type: 'select', options: LEVELS.view },
      { key: 'trees', label: 'Forest density', type: 'select', options: LEVELS.trees },
      { key: 'clouds', label: 'Clouds', type: 'select', options: LEVELS.clouds },
      { key: 'effects', label: 'Explosions & smoke', type: 'select', options: LEVELS.effects },
      { key: 'targetFps', label: 'Target frame rate', type: 'select', num: true,
        options: [[30, '30 FPS'], [45, '45 FPS'], [60, '60 FPS'], [90, '90 FPS'], [120, '120 FPS'], [144, '144 FPS']] },
      { key: 'dynRes', label: 'Dynamic resolution', type: 'check', desc: 'Lowers the resolution automatically whenever the frame rate drops below the target.' },
      { key: 'bloom', label: 'Bloom / glow', type: 'check', desc: 'Glow on tracers, fire and explosions.' },
      { key: 'msaa', label: 'Anti-aliasing (MSAA)', type: 'check', desc: 'Smooths jagged edges. With bloom off, the change applies after reloading the page.' },
      { key: 'showFps', label: 'Show FPS counter', type: 'check' },
    ],
    controls: [
      { key: 'touch', label: 'Touch controls', type: 'select', options: [['auto', 'Auto (on for phones and tablets)'], ['on', 'Always on'], ['off', 'Off']],
        desc: 'On-screen stick, throttle and buttons. Drag anywhere else on the screen to aim.' },
      { key: 'touchSens', label: 'Touch aim sensitivity', type: 'range', min: 0.3, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
      { key: 'steering', label: 'Steering', type: 'select', options: [['mouse', 'Mouse aim (captures the mouse)'], ['joystick', 'Free-cursor joystick']],
        desc: 'Joystick keeps the cursor visible: move it away from the centre circle to turn, further means faster. Used automatically when a browser blocks mouse capture.' },
      { key: 'sens', label: 'Mouse-aim sensitivity', type: 'range', min: 0.3, max: 5, step: 0.05, fmt: (v) => v.toFixed(2) },
      { key: 'stickSens', label: 'Joystick turn speed', type: 'range', min: 0.3, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
      { key: 'deadZone', label: 'Joystick dead zone', type: 'range', min: 2, max: 20, step: 1, fmt: (v) => `${v}%` },
      { key: 'fov', label: 'Field of view', type: 'range', min: 55, max: 100, step: 1, fmt: (v) => `${v}°` },
      { key: 'invert', label: 'Invert mouse Y', type: 'check' },
      { key: 'wheelThrottle', label: 'Mouse wheel controls throttle', type: 'check' },
      { key: 'shake', label: 'Camera shake from explosions', type: 'check' },
    ],
    audio: [
      { key: 'volume', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
      { key: 'engineVol', label: 'Engine & wind', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
      { key: 'fxVol', label: 'Weapons & explosions', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
      { key: 'minimap', label: 'Show minimap', type: 'check' },
      { key: 'killfeed', label: 'Show kill feed', type: 'check' },
      { key: 'names', label: 'Show pilot and target names', type: 'check' },
      { key: 'killcam', label: 'Slow-motion kill-cam', type: 'check', desc: 'Big kills (aces, bombers, HQs, triple kills) replay in slow motion. Single player only.' },
      { key: 'radio', label: 'Radio chatter', type: 'check', desc: 'Ace taunts, wingman calls and command messages.' },
    ],
  };
}

export class UI {
  constructor(app) {
    this.app = app;
    this.stack = [];
    this.current = null;
    this.selMission = Math.max(0, Math.min(MISSIONS.length - 1, Progress.data.unlocked - 1));
    this.campaignPlane = null;
    this.quickPlane = Settings.data.plane;
    this.quickWorld = WORLDS[Settings.data.world] ? Settings.data.world : 'island';
    this.freePlane = Settings.data.plane;
    this.freeWorld = this.quickWorld;
    this.settingsTab = 'graphics';
    this.capture = null;

    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { this.click(); this.go(b.dataset.go); }));
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { this.click(); this.back(); }));
    this.bindMainMenu();
    this.bindHangar();
    this.bindCampaign();
    this.bindQuick();
    this.bindFree();
    this.bindMP();
    this.bindInGame();
    $('pilot-name-label').textContent = Settings.data.name;
    setInterval(() => this.updateLiveStats(), 500);
  }

  click() { this.app.audio.init(); this.app.audio.play('click'); }

  show(name) {
    if (this.current === 'settings' && name !== 'settings') this.endCapture();
    for (const s of SCREENS) $(`screen-${s}`).classList.toggle('show', s === name);
    this.current = name;
    const fn = this[`on_${name}`];
    if (fn) fn.call(this);
    this.app.updateBackdrop();
  }

  go(name) { if (this.current && this.current !== name) this.stack.push(this.current); this.show(name); }
  back() { this.show(this.stack.pop() || 'main'); }
  hideAll() { this.endCapture(); for (const s of SCREENS) $(`screen-${s}`).classList.remove('show'); this.current = null; this.stack = []; this.app.updateBackdrop(); }

  // Main menu: highlight follows the mouse; arrow keys move it, Enter picks it.
  bindMainMenu() {
    const items = [...document.querySelectorAll('#screen-main .jp-list button')];
    const select = (b) => { items.forEach((x) => x.classList.toggle('sel', x === b)); };
    items.forEach((b) => b.addEventListener('mouseenter', () => select(b)));
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && ['campaign', 'quick', 'free', 'hangar', 'medals', 'mp', 'settings', 'controls'].includes(this.current) && !this.capture) {
        this.click(); this.back(); return;
      }
      if (this.current !== 'main' || document.activeElement?.tagName === 'INPUT') return;
      const i = Math.max(0, items.findIndex((b) => b.classList.contains('sel')));
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault();
        select(items[(i + (e.code === 'ArrowDown' ? 1 : items.length - 1)) % items.length]);
        this.app.audio.init(); this.app.audio.play('click');
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); items[i].click(); }
    });
  }

  planeGrid(el, allowed, selected, onSelect, detailed = false) {
    el.innerHTML = '';
    for (const key of AIRCRAFT_ORDER) {
      const d = AIRCRAFT[key];
      const card = document.createElement('div');
      card.className = `plane-card${key === selected ? ' sel' : ''}${allowed && !allowed.includes(key) ? ' disabled' : ''}`;
      const stats = Object.entries(d.stats).map(([k, v]) => `<div class="stat"><span>${k}</span><span class="sbar"><i style="width:${Math.round(v * 100)}%"></i></span></div>`).join('');
      const num = AIRCRAFT_ORDER.indexOf(key) + 1;
      card.innerHTML = `<div class="pkanji">${esc(d.jp || '')}</div><div class="prole"><span class="pnum">${num}</span>${esc(d.role)}</div><div class="pname">${esc(d.name)}</div>${detailed ? `<div class="pdesc">${esc(d.desc)}</div>${stats}` : ''}`;
      card.addEventListener('click', () => { this.click(); onSelect(key); el.querySelectorAll('.plane-card').forEach((c) => c.classList.remove('sel')); card.classList.add('sel'); });
      el.appendChild(card);
    }
  }

  worldGrid(el, selected, onSelect) {
    el.innerHTML = '';
    for (const id of WORLD_ORDER) {
      const w = WORLDS[id];
      const card = document.createElement('div');
      card.className = `world-card${id === selected ? ' sel' : ''}`;
      card.innerHTML = `<div class="wswatch" style="background:linear-gradient(90deg,${w.swatch.join(',')})"></div><div class="wtag">${esc(w.tag)}<span class="wjp">${esc(w.jp || '')}</span></div><div class="wname">${esc(w.name)}</div><div class="wdesc">${esc(w.desc)}</div>`;
      card.addEventListener('click', () => { this.click(); onSelect(id); el.querySelectorAll('.world-card').forEach((c) => c.classList.remove('sel')); card.classList.add('sel'); });
      el.appendChild(card);
    }
  }

  // ---------- hangar ----------
  bindHangar() {
    const inp = $('pilot-name');
    inp.value = Settings.data.name;
    inp.addEventListener('input', () => {
      Settings.data.name = inp.value.trim().slice(0, 18) || 'Pilot';
      Settings.save();
      $('pilot-name-label').textContent = Settings.data.name;
    });
  }
  on_hangar() {
    this.planeGrid($('hangar-list'), null, Settings.data.plane, (k) => { Settings.data.plane = k; Settings.save(); }, true);
  }

  // ---------- settings ----------
  on_settings() { this.renderSettings(this.settingsTab); }

  renderSettings(tab) {
    this.endCapture();
    this.settingsTab = tab;
    const tabs = $('settings-tabs');
    tabs.innerHTML = '';
    for (const [id, label, jp] of SETTINGS_TABS) {
      const b = document.createElement('button');
      b.className = `tab${id === tab ? ' sel' : ''}`;
      b.innerHTML = J(jp, label);
      b.addEventListener('click', () => { this.click(); this.renderSettings(id); });
      tabs.appendChild(b);
    }
    const body = this.settingsBody = $('settings-body');
    body.innerHTML = '';
    if (tab === 'keys') { this.renderKeys(body); return; }
    const grid = document.createElement('div');
    grid.className = 'settings-grid';
    if (tab === 'graphics') {
      const hw = Settings.detected || { gpu: 'Unknown GPU', cores: '?', mem: 0, tier: 'high' };
      const info = document.createElement('div');
      info.className = 'hw-info';
      info.innerHTML = `Detected <b>${esc(hw.gpu)}</b> · ${hw.cores} CPU threads${hw.mem ? ` · ${hw.mem}+ GB RAM` : ''} — recommended preset <b>${TIER_NAMES[hw.tier]}</b>.<br>Now running: <span id="hw-live">…</span>`;
      grid.appendChild(info);
    }
    for (const item of settingsSchema()[tab]) grid.appendChild(this.renderSetting(item));
    body.appendChild(grid);
    this.updateLiveStats();
  }

  renderSetting(item) {
    const d = Settings.data;
    const wrap = document.createElement('div');
    wrap.className = `setting${item.type === 'check' ? ' check-row' : ''}`;
    wrap.dataset.key = item.key;
    if (item.type === 'check') {
      wrap.innerHTML = `<input type="checkbox" id="set-${item.key}"><label for="set-${item.key}"><div class="slabel">${esc(item.label)}</div>${item.desc ? `<div class="sdesc">${esc(item.desc)}</div>` : ''}</label>`;
      const input = wrap.querySelector('input');
      input.setAttribute('aria-label', item.label);
      input.checked = !!d[item.key];
      input.addEventListener('change', () => this.changeSetting(item.key, input.checked));
      return wrap;
    }
    wrap.innerHTML = `<div class="slabel"><span>${esc(item.label)}</span><span class="val"></span></div>`;
    let input;
    if (item.type === 'select') {
      input = document.createElement('select');
      const opts = typeof item.options === 'function' ? item.options() : item.options;
      for (const [v, l] of opts) {
        const o = document.createElement('option');
        o.value = String(v); o.textContent = l;
        input.appendChild(o);
      }
      input.value = String(d[item.key]);
      input.addEventListener('change', () => this.changeSetting(item.key, item.num ? +input.value : input.value));
    } else {
      input = document.createElement('input');
      input.type = 'range';
      input.min = item.min; input.max = item.max; input.step = item.step;
      input.value = d[item.key];
      const val = wrap.querySelector('.val');
      const showVal = () => { val.textContent = item.fmt ? item.fmt(+input.value) : input.value; };
      showVal();
      input.addEventListener('input', () => { showVal(); this.changeSetting(item.key, +input.value); });
    }
    input.setAttribute('aria-label', item.label);
    wrap.appendChild(input);
    if (item.desc) wrap.insertAdjacentHTML('beforeend', `<div class="sdesc">${esc(item.desc)}</div>`);
    return wrap;
  }

  changeSetting(key, value) {
    const d = Settings.data;
    if (key === 'preset') {
      const before = Object.fromEntries(GFX_KEYS.map((k) => [k, d[k]]));
      Settings.applyPreset(value);
      Settings.save();
      for (const k of GFX_KEYS) if (before[k] !== d[k]) this.app.applySetting(k);
      this.renderSettings(this.settingsTab); // show the preset's values
      return;
    }
    d[key] = value;
    if (GFX_KEYS.includes(key) && d.preset !== 'custom') {
      d.preset = 'custom';
      const sel = this.settingsBody && this.settingsBody.querySelector('[data-key="preset"] select');
      if (sel) sel.value = 'custom';
    }
    Settings.save();
    this.app.applySetting(key);
  }

  updateLiveStats() {
    const el = $('hw-live');
    if (!el || this.current !== 'settings') return;
    const e = this.app.engine;
    const w = e.renderer.domElement.width, h = e.renderer.domElement.height;
    el.textContent = `${e.fps || '—'} FPS at ${w}×${h}${Settings.data.dynRes && e.dynScale < 1 ? ` (dynamic resolution ${Math.round(e.dynScale * 100)}%)` : ''}`;
  }

  // ---------- key bindings ----------
  renderKeys(body) {
    body.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'binds';
    table.innerHTML = '<tr><th>Action</th><th>Primary</th><th>Secondary</th></tr>';
    for (const [id, label] of ACTIONS) {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = label;
      tr.appendChild(name);
      const keys = Settings.keysFor(id);
      for (let slot = 0; slot < 2; slot++) {
        const td = document.createElement('td');
        const b = document.createElement('button');
        b.className = `bind${keys[slot] ? '' : ' empty'}`;
        b.textContent = keyName(keys[slot]);
        b.addEventListener('click', () => this.captureBind(id, slot, b));
        td.appendChild(b);
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    body.appendChild(table);
    const foot = document.createElement('div');
    foot.className = 'binds-foot';
    foot.innerHTML = '<span class="hint">Click a box, then press a key — or click the box again with the mouse button you want. Esc cancels, Backspace clears. Esc in flight always pauses.</span>';
    const reset = document.createElement('button');
    reset.innerHTML = J('初期化', 'Reset to defaults');
    reset.addEventListener('click', () => { this.click(); this.endCapture(); Settings.resetKeys(); Settings.save(); this.renderKeys(body); });
    foot.appendChild(reset);
    body.appendChild(foot);
  }

  captureBind(action, slot, btn) {
    this.endCapture();
    this.click();
    const old = btn.textContent;
    btn.classList.add('listening');
    btn.textContent = 'Press a key…';
    const assign = (code) => {
      this.endCapture();
      Settings.bind(action, slot, code);
      Settings.save();
      this.renderKeys(this.settingsBody);
    };
    const cancel = () => { this.endCapture(); btn.classList.remove('listening'); btn.textContent = old; };
    const onKey = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') cancel();
      else if (e.code === 'Backspace' || e.code === 'Delete') assign('');
      else assign(e.code);
    };
    const onDown = (e) => {
      if (e.target === btn) { e.preventDefault(); e.stopImmediatePropagation(); assign(`Mouse${e.button}`); } else cancel();
    };
    addEventListener('keydown', onKey, true);
    addEventListener('mousedown', onDown, true);
    this.capture = () => { removeEventListener('keydown', onKey, true); removeEventListener('mousedown', onDown, true); this.capture = null; };
  }

  endCapture() { if (this.capture) this.capture(); }

  // ---------- controls reference ----------
  on_controls() {
    const d = Settings.data;
    const touch = Settings.touch ? [
      ['Touch: left stick', 'Steer: the stick appears under your thumb; push to turn the aim (further is faster)'],
      ['Touch: drag', 'Drag anywhere else on the screen to aim precisely'],
      ['Touch: throttle', 'Slide the bar on the far left. Above the line is afterburner; in hover mode it climbs and descends'],
      ['Touch: buttons', 'FIRE, RKT, BOMB, BOOST, BRAKE on the right; ROLL, U-TURN, COBRA, HOVER (and JET in Free Flight) at the bottom; BAIL, CAM, SCORE and pause at the top'],
    ] : [];
    const rows = [
      ...touch,
      ['Mouse', d.steering === 'joystick' ? 'Steer: move the cursor away from the centre circle (joystick)' : 'Aim — the aircraft flies toward the circle'],
      ...ACTIONS.map(([id, label]) => [Settings.keysFor(id).filter(Boolean).map(keyName).join(' / ') || 'Unbound', label]),
    ];
    if (d.wheelThrottle) rows.push(['Mouse wheel', 'Throttle']);
    rows.push(['1 – 9', 'Free Flight: switch jet in mid-air']);
    rows.push(['Hover mode', 'W/S climb and descend, A/D strafe, ↑/↓ forward and back; the nose follows your aim. Touch down gently to land.']);
    rows.push(['Esc', 'Pause menu']);
    rows.push(['No mouse capture?', 'Some embedded browsers block it. The cursor then steers like a joystick and clicking the view fires.']);
    $('controls-table').innerHTML = rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  }

  // ---------- campaign ----------
  bindCampaign() {
    $('mission-start').addEventListener('click', () => {
      this.click();
      this.app.startCampaign(this.selMission, this.campaignPlane);
    });
  }
  on_campaign() {
    const list = $('mission-list');
    list.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const locked = i + 1 > Progress.data.unlocked;
      const stars = Progress.data.stars[i] || 0;
      const el = document.createElement('div');
      el.className = `mission${locked ? ' locked' : ''}${i === this.selMission ? ' sel' : ''}`;
      el.innerHTML = `<span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span><span class="num">${String(i + 1).padStart(2, '0')}</span><b>${esc(m.title)}</b><span class="mjp">${esc(m.jp || '')}</span><div class="mdesc">${locked ? 'Locked — complete the previous mission' : `${esc(m.short)} · ${esc(worldDef(m.world).name)}`}</div>`;
      if (!locked) el.addEventListener('click', () => { this.click(); this.selMission = i; this.on_campaign(); });
      list.appendChild(el);
    });
    const m = MISSIONS[this.selMission];
    $('mission-title').innerHTML = `<span class="jp">${esc(m.jp || '')}</span> ${this.selMission + 1}. ${esc(m.title)}`;
    $('mission-meta').innerHTML = `World: <b>${esc(worldDef(m.world).name)}</b> (${esc(worldDef(m.world).tag)}) · ${esc(cap(m.timeOfDay))}`;
    $('mission-brief').textContent = m.brief;
    $('mission-objectives').innerHTML = m.objectives.map((o) => `<li>${esc(o)}</li>`).join('');
    if (!this.campaignPlane || !m.planes.includes(this.campaignPlane)) this.campaignPlane = m.planes.includes(Settings.data.plane) ? Settings.data.plane : m.planes[0];
    this.planeGrid($('campaign-planes'), m.planes, this.campaignPlane, (k) => { this.campaignPlane = k; });
    $('mission-start').disabled = this.selMission + 1 > Progress.data.unlocked;
  }

  // ---------- quick battle ----------
  bindQuick() {
    const sync = () => {
      const m = $('quick-mode').value;
      $('quick-role-wrap').style.display = m === 'escort' ? '' : 'none';
      $('quick-allies').disabled = m === 'lps';
      $('quick-mode-desc').textContent = QUICK_DESC[m] || '';
    };
    $('quick-mode').addEventListener('change', sync);
    sync();
    $('quick-start').addEventListener('click', () => {
      this.click();
      this.app.startQuick({ enemies: +$('quick-enemies').value, allies: +$('quick-allies').value, timeOfDay: $('quick-time').value, plane: this.quickPlane, world: this.quickWorld,
        mode: $('quick-mode').value, role: $('quick-role').value, weather: $('quick-weather').value, events: $('quick-events').checked });
    });
  }

  // ---------- medals & rivals ----------
  on_medals() {
    $('medal-summary').textContent = `${Medals.unlockedCount()} of ${Medals.total()} medals earned · ${Medals.worlds().length}/${WORLD_ORDER.length} worlds landed on`;
    AceRecords.load();
    $('ace-list').innerHTML = ACE_ORDER.map((id) => {
      const a = ACES[id], r = AceRecords.get(id);
      const status = !r.met ? 'Not yet encountered' : r.last === 'bailed' ? 'Bailed out last time: wants revenge' : 'Still flying';
      return `<div class="ace" style="--ace:${a.color}"><span class="akanji">${esc(a.jp)}</span><span class="astyle">${esc(a.style)} · ${esc((AIRCRAFT[a.plane] || {}).name || '')}</span><b>${esc(a.full)}</b>
        <div class="adesc">${esc(a.desc)}</div><div class="arec">You ${r.losses} – ${r.wins} ${esc(a.name)} · met ${r.met}×</div><div class="adesc">${esc(status)}</div></div>`;
    }).join('');
    $('medal-list').innerHTML = MEDALS.map(([id, name, jp, desc, prog]) => {
      const got = Medals.has(id);
      const p = prog ? prog() : null;
      const bar = p && !got ? `<div class="mp"><i style="width:${Math.round(p[0] / p[1] * 100)}%"></i></div><div class="md">${p[0]} / ${p[1]}</div>` : '';
      return `<div class="medal${got ? ' got' : ''}"><span class="mk">${esc(jp.slice(0, 1))}</span><div><b>${esc(name)}</b><div class="md">${esc(desc)}</div>${bar}</div></div>`;
    }).join('');
  }
  on_quick() {
    this.worldGrid($('quick-worlds'), this.quickWorld, (id) => { this.quickWorld = id; Settings.data.world = id; Settings.save(); });
    this.planeGrid($('quick-planes'), null, this.quickPlane, (k) => { this.quickPlane = k; });
  }

  // ---------- free flight ----------
  bindFree() {
    $('free-start').addEventListener('click', () => {
      this.click();
      this.app.startFree({ world: this.freeWorld, plane: this.freePlane, timeOfDay: $('free-time').value, tanks: +$('free-tanks').value,
        aa: $('free-aa').checked, enemies: +$('free-enemies').value, ammo: $('free-ammo').checked, god: $('free-god').checked,
        weather: $('free-weather').value, events: $('free-events').checked });
    });
  }
  on_free() {
    this.worldGrid($('free-worlds'), this.freeWorld, (id) => { this.freeWorld = id; Settings.data.world = id; Settings.save(); });
    this.planeGrid($('free-planes'), null, this.freePlane, (k) => { this.freePlane = k; Settings.data.plane = k; Settings.save(); }, true);
  }

  // ---------- multiplayer ----------
  bindMP() {
    const net = this.app.net;
    const ws = $('room-world');
    for (const id of WORLD_ORDER) { const o = document.createElement('option'); o.value = id; o.textContent = `${WORLDS[id].name} (${WORLDS[id].tag})`; ws.appendChild(o); }
    ws.value = this.quickWorld;
    $('mp-refresh').addEventListener('click', () => { this.click(); net.send({ t: 'list' }); });
    $('create-btn').addEventListener('click', () => {
      this.click();
      net.send({ t: 'create', name: $('room-name').value.trim() || `${Settings.data.name}'s battle`, settings: this.roomSettings() });
    });
    $('join-btn').addEventListener('click', () => { this.click(); const c = $('join-code').value.trim().toUpperCase(); if (c) net.send({ t: 'join', code: c }); });
    $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join-btn').click(); });
    for (const id of ['room-mode', 'room-world', 'room-weather', 'room-tod', 'room-bots', 'room-time', 'room-score', 'room-max']) {
      $(id).addEventListener('change', () => { if (net.inRoom && net.isHost && this.current === 'lobby') net.send({ t: 'settings', settings: this.roomSettings() }); });
    }
    net.on('rooms', (m) => this.renderRooms(m.rooms));
    net.on('error', (m) => this.app.toast(m.msg));
    net.on('joined', () => { $('lobby-chat').innerHTML = ''; this.lobbyPlaneSet = false; if (this.current !== 'lobby' && !this.app.inMatch) this.go('lobby'); });
    net.on('lobby', (m) => { if (this.current === 'lobby') this.renderLobby(m); });
    net.on('chat', (m) => { if (!this.app.inMatch) this.addLobbyChat(m.name, m.text, m.team); });
    net.on('pleft', (m) => { if (!this.app.inMatch) this.addLobbyChat(null, `${m.name} left`); });
    net.on('close', () => { if (this.current === 'lobby' || this.current === 'mp') { this.app.toast('Disconnected from server'); this.show('mp'); } });
    $('lobby-leave').addEventListener('click', () => { this.click(); net.send({ t: 'leave' }); this.show('mp'); });
    $('lobby-ready').addEventListener('click', () => {
      this.click();
      const me = net.lobby && net.lobby.players.find((p) => p.id === net.id);
      net.send({ t: 'lobby', ready: !(me && me.ready) });
    });
    $('lobby-start').addEventListener('click', () => { this.click(); net.send({ t: 'start' }); });
    document.querySelectorAll('[data-team]').forEach((b) => b.addEventListener('click', () => { this.click(); net.send({ t: 'lobby', team: +b.dataset.team }); }));
    const ci = $('lobby-chat-input');
    ci.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && ci.value.trim()) { net.send({ t: 'chat', text: ci.value.trim() }); this.addLobbyChat(Settings.data.name, ci.value.trim(), this.myTeam()); ci.value = ''; }
    });
  }

  roomSettings() {
    return { mode: $('room-mode').value, world: $('room-world').value, weather: $('room-weather').value, timeOfDay: $('room-tod').value, bots: +$('room-bots').value,
      timeLimit: +$('room-time').value, scoreLimit: +$('room-score').value, maxPlayers: +$('room-max').value };
  }

  myTeam() { const n = this.app.net; const me = n.lobby && n.lobby.players.find((p) => p.id === n.id); return me ? me.team : 0; }

  async on_mp() {
    const net = this.app.net;
    $('mp-share-url').textContent = `${location.protocol}//${location.host}`;
    const st = $('mp-status');
    if (location.protocol === 'file:') { st.textContent = 'Multiplayer needs the game server. Run "python3 server.py" and open http://localhost:8080'; return; }
    st.textContent = 'Connecting to server…';
    try {
      await net.connect(Settings.data.name);
      st.textContent = `Connected as ${Settings.data.name}. Create a room or join one with a code.`;
      net.send({ t: 'list' });
    } catch (e) {
      st.textContent = 'Could not reach the multiplayer server. Start it with "python3 server.py" and open the game from that address.';
    }
  }

  renderRooms(rooms) {
    const el = $('room-list');
    if (!rooms.length) { el.innerHTML = '<div class="room-empty">No rooms yet — create one!</div>'; return; }
    el.innerHTML = '';
    for (const r of rooms) {
      const row = document.createElement('div');
      row.className = 'room';
      row.innerHTML = `<div><b>${esc(r.name)}</b> <span class="code-chip"><b>${esc(r.code)}</b></span><div class="rmeta">${MODES[r.mode] || esc(r.mode)} · ${esc(worldDef(r.world).name)} · ${r.players}/${r.max} players · ${r.state === 'playing' ? 'in battle' : 'in lobby'}</div></div>`;
      const b = document.createElement('button');
      b.innerHTML = J('参加', 'Join');
      b.className = 'tiny';
      b.addEventListener('click', () => { this.click(); this.app.net.send({ t: 'join', code: r.code }); });
      row.appendChild(b);
      el.appendChild(row);
    }
  }

  on_lobby() { if (this.app.net.lobby) this.renderLobby(this.app.net.lobby); }

  renderLobby(m) {
    const net = this.app.net;
    $('lobby-name').textContent = m.name;
    $('lobby-code').textContent = m.code;
    const modes = { team: 'Team Battle — Blue vs Red, AI ground war, score race', coop: 'Co-op — all players on Blue vs AI Red Coalition', ffa: 'Free-for-all dogfight — everyone vs everyone',
      conquest: 'Conquest — capture airfields by hover-landing on them', lps: 'Last Pilot Standing — no respawns, shrinking safe zone',
      escort: 'Bomber Escort — Blue escorts a Titan (a Blue player flying the Titan is the VIP), Red has to stop it' };
    const s = m.settings;
    $('lobby-mode').textContent = `${modes[s.mode]} · ${worldDef(s.world).name}, ${cap(s.timeOfDay || 'day')} · ${s.bots} AI bots · ${s.timeLimit} min · ${s.scoreLimit} pts${m.state === 'playing' ? ' · battle in progress' : ''}`;
    for (const t of [0, 1]) {
      const solo = s.mode === 'ffa' || s.mode === 'lps';
      $(`lobby-team${t}`).innerHTML = m.players.filter((p) => (solo ? t === 0 : p.team === t)).map((p) =>
        `<li><span>${esc(p.name)}${p.id === m.host ? '<span class="host">HOST</span>' : ''}${p.id === net.id ? ' (you)' : ''}</span><span><span class="lplane">${esc((AIRCRAFT[p.plane] || {}).name || '')}</span> ${p.ready ? '<span class="ready">READY</span>' : ''}</span></li>`).join('');
    }
    document.querySelectorAll('[data-team]').forEach((b) => { b.style.display = ['team', 'conquest', 'escort'].includes(s.mode) ? '' : 'none'; });
    const me = m.players.find((p) => p.id === net.id);
    if (me && !this.lobbyPlaneSet) { this.lobbyPlaneSet = true; if (me.plane !== Settings.data.plane) net.send({ t: 'lobby', plane: Settings.data.plane }); }
    this.planeGrid($('lobby-planes'), null, me ? me.plane : Settings.data.plane, (k) => { Settings.data.plane = k; Settings.save(); net.send({ t: 'lobby', plane: k }); });
    $('lobby-ready').innerHTML = me && me.ready ? J('取消', 'Not ready') : J('準備完了', 'Ready');
    const host = net.isHost;
    $('lobby-start').style.display = host ? '' : 'none';
    $('lobby-start').innerHTML = m.state === 'playing' ? J('交戦中', 'Battle in progress') : J('開戦', 'Start match');
    $('lobby-start').disabled = m.state === 'playing';
    $('lobby-wait').style.display = host ? 'none' : '';
    if (host) {
      $('room-mode').value = s.mode; $('room-world').value = s.world || 'island'; $('room-tod').value = s.timeOfDay || 'day'; $('room-weather').value = s.weather || 'auto';
      $('room-bots').value = s.bots; $('room-time').value = s.timeLimit; $('room-score').value = s.scoreLimit; $('room-max').value = s.maxPlayers;
    }
  }

  addLobbyChat(name, text, team) {
    const el = $('lobby-chat');
    const line = document.createElement('div');
    line.innerHTML = name ? `<b class="cn${team || 0}">${esc(name)}:</b> ${esc(text)}` : `<span class="sys">${esc(text)}</span>`;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  // ---------- in-game overlays ----------
  bindInGame() {
    $('pause-resume').addEventListener('click', () => { this.click(); this.app.resume(); });
    $('pause-quit').addEventListener('click', () => { this.click(); this.app.quitToMenu(); });
    $('pause-restart').addEventListener('click', () => { this.click(); this.app.restart(); });
    $('brief-go').addEventListener('click', () => { this.click(); this.app.resume(); });
    $('result-menu').addEventListener('click', () => { this.click(); this.app.afterResults('menu'); });
    $('result-retry').addEventListener('click', () => { this.click(); this.app.afterResults('retry'); });
    $('result-next').addEventListener('click', () => { this.click(); this.app.afterResults('next'); });
  }

  showBrief(title, text, objectives, button = Settings.touch ? 'Tap to fly' : 'Click to fly') {
    $('brief-title').textContent = title;
    $('brief-text').textContent = text;
    $('brief-objectives').innerHTML = (objectives || []).map((o) => `<li>${esc(o)}</li>`).join('');
    $('brief-go').innerHTML = J('出撃', button);
    this.show('brief');
  }

  showPause(mp, canRestart) {
    $('pause-restart').style.display = canRestart ? '' : 'none';
    $('pause-quit').innerHTML = mp ? J('離脱', 'Leave battle') : J('撤退', 'Quit to menu');
    this.show('pause');
  }

  showResults({ title, cls, sub, stats, next, retry, menuLabel }) {
    const t = $('result-title');
    t.textContent = title;
    t.className = cls || '';
    const k = $('result-kanji');
    k.textContent = RESULT_KANJI[title] || (cls === 'win' ? '勝利' : cls === 'lose' ? '敗北' : '終戦');
    k.className = `big-kanji ${cls || ''}`;
    $('result-sub').textContent = sub || '';
    $('result-stats').innerHTML = stats.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('');
    $('result-next').style.display = next ? '' : 'none';
    $('result-retry').style.display = retry ? '' : 'none';
    $('result-menu').innerHTML = menuLabel ? J('待機室', menuLabel) : J('主画面', 'Main menu');
    this.show('results');
  }
}

export { TEAM_NAMES };
