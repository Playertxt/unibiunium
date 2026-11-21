// App bootstrap: detects the hardware, builds the selected world, runs the render loop and switches between
// menu/demo, campaign, quick battle and multiplayer. Worlds can be swapped at runtime.
import * as THREE from 'three';
import { Engine, detectHardware } from './engine.js';
import { World } from './world.js';
import { WORLDS } from './worlds.js';
import { buildTrees, Clouds, buildTowns } from './scenery.js';
import { buildAirfields, buildRoads, buildTownDetails } from './airbase.js';
import { Effects } from './effects.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { TouchControls, enterFullscreen } from './touch.js';
import { HUD } from './hud.js';
import { Net, MPSync } from './net.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { setupBattlefield, BotManager, Reinforcements } from './battle.js';
import { TankHunt, Rearmer } from './freeflight.js';
import { HangarScene } from './hangar.js';
import { MISSIONS, Progress, startMission, missionStars } from './campaign.js';
import { Settings, AIRCRAFT, AIRCRAFT_ORDER, TEAM_NAMES } from './config.js';
import { Weather } from './weather.js';
import { EventDirector } from './events.js';
import { Conquest, LastPilot, Escort } from './modes.js';
import { Medals, MEDALS } from './medals.js';
import { AceRecords } from './aces.js';

const $ = (id) => document.getElementById(id);
// Yield to the browser so the loading bar repaints (falls back to a timer in background tabs).
const frame = () => new Promise((r) => { let done = false; const f = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 60); });
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// Japanese captions for the loading steps.
const LOAD_JP = [['Checking', 'ハードウェア確認中'], ['Generating', '地形生成中'], ['Shaping', '地形造成中'], ['Growing', '植生配置中'],
  ['Building', '市街・飛行場建設中'], ['Fuelling', '機体給油中'], ['Ready', '準備完了'], ['Failed', '起動失敗']];
const TIPS = [
  'Lead your target: aim at the red circle, not the aircraft.',
  'Tanks shrug off machine guns. Use rockets, bombs or an armour-piercing cannon.',
  'Press G for an Immelmann U-turn when a bandit is on your tail.',
  'Hover mode (H) lets you hang over a tank column and pick it apart.',
  'The SX-21 Wraith is spotted at half range by enemy pilots and AA.',
  'Boost (Z) recharges on its own. Save it for the merge.',
  'In Free Flight, press 1 to 9 to swap jets in mid-air.',
  'Air brake (B) tightens your turn, but bleeds speed fast.',
  'Missile warning? Drop flares (N) for heat-seekers, chaff (M) for SAMs, then break hard.',
  'SAM radar can\'t see you below 70 m. Fly low through their air defence.',
  'Three kills in a row call a wingman; five bring an airstrike; seven overcharge your guns.',
  'Enemy aces remember you. Shoot one down and they\'ll come back for revenge.',
  'Lightning blanks every radar nearby for a moment, including the enemy\'s.',
  'In Conquest, hover (H) and land inside an airstrip\'s beacon ring to capture it.',
];
let tipIdx = Math.floor(Math.random() * TIPS.length);
function setLoad(pct, text) {
  $('load-bar').style.width = `${pct}%`;
  $('load-text').textContent = text;
  $('load-pct').textContent = `${Math.round(pct)}%`;
  const jp = LOAD_JP.find(([k]) => text.startsWith(k));
  $('load-jp').textContent = jp ? jp[1] : '読み込み中';
}
function nextTip() { tipIdx = (tipIdx + 1) % TIPS.length; $('load-tip').textContent = TIPS[tipIdx]; }
nextTip();

function disposeMaterial(m) {
  for (const k of ['map', 'normalMap']) if (m[k]) m[k].dispose();
  if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) u.value.dispose();
  m.dispose();
}

class App {
  async init() {
    // Hangar backdrop first, so it's on screen while everything else loads.
    try { this.hangar = new HangarScene($('load-bg')); } catch (e) { console.warn('Hangar backdrop unavailable', e); }
    this.updateBackdrop();
    this.tipTimer = setInterval(nextTip, 5000);
    Settings.load();
    Progress.load();
    Medals.load();
    AceRecords.load();
    setLoad(5, 'Checking your graphics hardware…'); await frame();
    Settings.detected = detectHardware();
    if (Settings.data.preset === 'auto') Settings.applyPreset('auto');
    this.engine = new Engine($('game'));
    this.effects = new Effects(this.engine.scene, this.engine);
    this.effects.quality = Settings.gfx.effects;
    this.audio = new Audio();
    this.input = new Input(this.engine.renderer.domElement);
    this.hud = new HUD($('hud'));
    this.touchUI = new TouchControls(this);
    this.net = new Net();
    this.rebuildTimers = {};
    this.game = null;
    this.state = 'menu';
    await this.loadWorld(WORLDS[Settings.data.world] ? Settings.data.world : 'island', true);
    this.ui = new UI(this);
    setLoad(88, 'Fuelling aircraft…'); await frame();
    this.startDemo();
    this.engine.renderer.compile(this.engine.scene, this.engine.camera);
    setLoad(100, 'Ready');
    await frame();
    this.hideLoading();
    this.ui.show('main');

    this.input.onLockChange = (locked) => {
      $('click-to-play').classList.toggle('show', !locked && this.state === 'playing' && !this.input.freeCursor);
      if (!locked && this.state === 'playing' && !this.chatOpen) this.pause();
    };
    this.input.onFreeMode = () => {
      $('click-to-play').classList.remove('show');
      this.toast('This browser view blocks mouse capture, so the cursor steers like a joystick: move it away from the centre circle to turn, click the view to fire, Esc to pause.', 9000);
    };
    this.engine.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked && !this.input.freeCursor) { this.audio.init(); this.input.lock(); }
    });
    // Without mouse capture the browser doesn't turn Esc into an unlock, so pause directly.
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'playing' && !this.input.locked && !this.chatOpen) this.pause();
    });
    this.bindChat();
    this.net.on('start', (m) => this.startMP(m));
    this.net.on('end', (m) => this.onMPEnd(m.results));
    this.net.on('close', () => { if (this.inMatch) { this.toast('Lost connection to server'); this.quitToMenu(); } });
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  get inMatch() { return !!this.game && this.game.mode === 'mp'; }

  loop(now) {
    const rawMs = now - this.last;
    const dt = Math.min(0.05, Math.max(0.0001, rawMs / 1000));
    this.last = now;
    if (!this.loadingWorld) {
      this.engine.tick(rawMs);
      const g = this.game;
      if (g && !(this.backdropOn && g.mode === 'demo')) { // the menu demo battle is hidden behind the hangar
        if (!g.paused) g.update(dt);
        else g.updateCamera(0);
      }
      // The hangar backdrop covers the whole screen on the loading screen and main menu: skip the world render.
      if (!(this.backdropOn && this.hangar && this.hangar.shown)) this.engine.render();
      this.hud.draw(this.state === 'playing' || (this.state === 'paused' && this.inMatch) ? g : null, dt);
      this.touchUI.update();
    }
    this.updateFps(now);
    requestAnimationFrame((t) => this.loop(t));
  }

  updateFps(now) {
    if (now - (this.fpsT || 0) < 500) return;
    this.fpsT = now;
    const el = $('fps');
    el.classList.toggle('show', !!Settings.data.showFps);
    if (Settings.data.showFps) {
      const e = this.engine;
      el.textContent = `${e.fps} FPS${Settings.data.dynRes && e.dynScale < 1 ? ` · ${Math.round(e.dynScale * 100)}% res` : ''}`;
    }
  }

  // ---------- worlds ----------
  async loadWorld(id, boot = false) {
    if (!WORLDS[id]) id = 'island';
    if (this.world && this.worldId === id) return;
    const def = WORLDS[id];
    this.loadingWorld = true;
    const overlay = $('loading');
    overlay.classList.add('show');
    this.updateBackdrop();
    const step = async (pct, text) => { setLoad(pct, text); await frame(); };
    try {
      await step(boot ? 12 : 8, `Generating ${def.name}…`);
      this.disposeGame();
      this.clearWorld();
      const root = this.worldRoot = new THREE.Group();
      root.name = `world-${id}`;
      this.engine.scene.add(root);
      this.world = new World(def);
      await step(boot ? 45 : 45, 'Shaping terrain…');
      root.add(this.world.buildTerrainMesh());
      root.add(this.world.buildWater());
      root.add(this.world.buildInlandWater());
      await step(boot ? 62 : 68, 'Growing vegetation…');
      this.trees = buildTrees(this.world, root);
      await step(boot ? 75 : 86, 'Building towns and airfields…');
      buildAirfields(this.world, root);
      buildTownDetails(this.world, root, buildTowns(this.world, root));
      buildRoads(this.world, root);
      this.clouds = new Clouds(this.world, root, this.engine);
      this.engine.setWorldLook(def.look);
      this.clouds.setLighting();
      this.hud.setWorld(this.world);
      this.worldId = id;
    } finally {
      this.loadingWorld = false;
      this.engine.resetTiming();
    }
    if (!boot) { setLoad(100, 'Ready'); await frame(); this.hideLoading(); }
  }

  hideLoading() {
    $('loading').classList.remove('show');
    this.updateBackdrop();
  }

  // Show the hangar backdrop while loading and on the main menu; stop rendering it otherwise.
  // Hangar backdrop behind the loading screen and every menu, whenever no battle is in progress behind it.
  updateBackdrop() {
    const loading = $('loading').classList.contains('show');
    const cur = this.ui && this.ui.current;
    const menu = !!cur && !['pause', 'results', 'brief'].includes(cur) && (!this.game || this.game.mode === 'demo');
    const on = loading || menu;
    this.backdropOn = on;
    $('backdrop').classList.toggle('show', on);
    $('menu-keys').classList.toggle('show', menu && !loading && cur !== 'main');
    if (this.hangar) { if (on) this.hangar.start(); else this.hangar.stop(); }
  }

  clearWorld() {
    const root = this.worldRoot;
    if (!root) return;
    this.engine.scene.remove(root);
    root.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) disposeMaterial(m);
    });
    this.worldRoot = null; this.trees = null; this.clouds = null; this.world = null; this.worldId = null;
  }

  rebuildTrees() {
    if (!this.worldRoot || !this.world) return;
    for (const m of this.trees || []) { this.worldRoot.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose(); }
    this.trees = buildTrees(this.world, this.worldRoot);
  }

  rebuildClouds() {
    if (!this.worldRoot || !this.world) return;
    const c = this.clouds;
    if (c && c.mesh) { this.worldRoot.remove(c.mesh); c.mesh.geometry.dispose(); disposeMaterial(c.mat); }
    this.clouds = new Clouds(this.world, this.worldRoot, this.engine);
  }

  queueRebuild(what) {
    clearTimeout(this.rebuildTimers[what]);
    this.rebuildTimers[what] = setTimeout(() => (what === 'trees' ? this.rebuildTrees() : this.rebuildClouds()), 300);
  }

  // Apply one changed setting immediately.
  applySetting(key) {
    const e = this.engine, d = Settings.data;
    switch (key) {
      case 'renderScale': case 'dynRes': e.updatePixelRatio(); break;
      case 'targetFps': e.resetTiming(); break;
      case 'shadows':
        e.applyShadows();
        for (const t of this.trees || []) t.castShadow = Settings.gfx.shadowSize >= 2048;
        break;
      case 'view': e.updateFog(); break;
      case 'bloom': e.setupComposer(); break;
      case 'msaa':
        e.setupComposer();
        if (!d.bloom) this.toast('With bloom off, the anti-aliasing change applies after you reload the page.');
        break;
      case 'trees': this.queueRebuild('trees'); break;
      case 'clouds': this.queueRebuild('clouds'); break;
      case 'effects': this.effects.quality = Settings.gfx.effects; break;
      case 'showFps': this.fpsT = 0; break;
      case 'fov': e.camera.fov = d.fov; e.camera.updateProjectionMatrix(); break;
      case 'volume': case 'engineVol': case 'fxVol': this.audio.applyVolumes(); break;
      case 'steering':
        if (d.steering === 'joystick') this.input.unlock();
        this.input.el.style.cursor = this.input.freeCursor ? 'crosshair' : '';
        break;
      default: break;
    }
  }

  // ---------- game flow ----------
  disposeGame() {
    if (this.sync) { this.sync.dispose(); this.sync = null; }
    if (this.game) this.game.dispose();
    this.game = null;
    this.hud.clear();
  }

  startDemo() {
    this.disposeGame();
    const tod = ['day', 'day', 'dusk', 'dawn'][Math.floor(Math.random() * 4)];
    const g = this.game = new Game(this, { mode: 'demo', timeOfDay: tod });
    setupBattlefield(g, 3, { tanks: 6 });
    const bots = new BotManager(g, { 0: 4, 1: 4 }, { skill: 0.5 });
    bots.initial();
    const reinf = new Reinforcements(g, { seed: 3, tanks: 6 });
    g.extraUpdate = (dt) => { bots.update(dt); reinf.update(dt); };
    this.state = 'menu';
  }

  baseOpts(extra) { return { name: Settings.data.name, plane: Settings.data.plane, ...extra }; }

  async startCampaign(index, plane) {
    if (this.busy) return;
    this.busy = true;
    try {
      const m = MISSIONS[index];
      await this.loadWorld(m.world || 'island');
      this.disposeGame();
      this.last = performance.now();
      const g = this.game = new Game(this, this.baseOpts({ mode: 'campaign', plane: plane || m.planes[0], timeOfDay: m.timeOfDay }));
      this.session = { type: 'campaign', index, plane: g.playerPlane };
      startMission(g, index);
      g.spawnPlayer();
      g.onFinish = (winner, reason) => this.onCampaignFinish(winner === 0, reason);
      g.paused = true;
      g.updateCamera(0);
      this.state = 'brief';
      this.ui.showBrief(`Mission ${index + 1}: ${m.title}`, m.brief, m.objectives);
    } finally { this.busy = false; }
  }

  // Weather and dynamic events for a match. weather: 'auto' | 'severe' | 'clear'.
  addFeatures(g, { weather = 'auto', seed, events = null, myTeam = 0, enemyTeam = 1 } = {}) {
    if (weather && weather !== 'clear') g.weather = new Weather(g, this.worldId, { mode: weather, seed });
    if (events && events.length && g.authority) g.events = new EventDirector(g, { aces: g.aces, kinds: events, myTeam, enemyTeam });
  }

  // Bots in Conquest: about 40% fly capture runs (anything but the Titan can hover-land).
  captureOpts() { return (kind) => ({ capture: kind !== 'titan' && Math.random() < 0.4 }); }

  async startQuick(o) {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.loadWorld(o.world || 'island');
      this.disposeGame();
      const mode = o.mode || 'battle';
      const seed = Math.floor(Math.random() * 1000);
      const plane = mode === 'escort' && o.role === 'titan' ? 'titan' : o.plane;
      const limits = { battle: [3000, 20], conquest: [3000, 20], lps: [0, 0], escort: [0, 0] }[mode] || [3000, 20];
      const g = this.game = new Game(this, this.baseOpts({ mode: 'quick', plane, timeOfDay: o.timeOfDay, scoreLimit: limits[0], timeLimit: limits[1] * 60 }));
      g.quickMode = mode;
      this.session = { type: 'quick', opts: o };
      const world = WORLDS[this.worldId].name;
      let title, text, lines, bots = null, reinf = null;
      if (mode === 'lps') {
        g.ffa = true;
        g.lives = 1;
        bots = new BotManager(g, { 0: Math.max(3, o.enemies) }, { skill: 0.55, ffa: true });
        bots.initial();
        const lp = g.lps = new LastPilot(g, { seed, participants: [g.playerId, ...bots.list.map((a) => a.id)] });
        this.addFeatures(g, { weather: o.weather, seed });
        g.objectiveText = () => `PILOTS LEFT ${lp.alive} · ${lp.zone.phase === 'final' ? 'FINAL ZONE' : `${lp.zone.phase === 'hold' ? 'ZONE SHRINKS IN' : 'ZONE CLOSING'} ${fmtTime(lp.zone.left)}`}`;
        g.extraUpdate = () => {
          // Offline, the match ends as soon as you're out: you see where you placed.
          if (!g.over && lp.eliminated.has(g.playerId)) {
            g.lpsOutAt ??= g.time + 3;
            if (g.time >= g.lpsOutAt) g.finish(1, `You placed #${lp.placeOf(g.playerId)} of ${lp.participants.size}`);
          }
        };
        title = `Last Pilot Standing — ${world}`;
        text = 'Every pilot for themselves. No respawns. The safe zone keeps shrinking; outside it your jet takes damage. Be the last one flying.';
        lines = [`${lp.participants.size} pilots in the arena`, 'Stay inside the red wall (dashed circle on the minimap shows the next zone)'];
      } else {
        setupBattlefield(g, seed, {});
        reinf = new Reinforcements(g, { seed });
        if (mode === 'escort') {
          const vipTeam = o.role === 'intercept' ? 1 : 0;
          const es = new Escort(g, { vipTeam, timeLimit: 12 * 60 });
          g.escort = es;
          if (plane === 'titan' && vipTeam === 0) { g.vipPlayer = true; g.lives = 1; } else es.spawnAIVip();
          bots = new BotManager(g, { 0: o.allies, 1: o.enemies }, { skill: 0.5, spawnOpts: es.escortOpts() });
          bots.initial();
          g.objectiveText = () => {
            const v = es.vip, t = es.target;
            const vh = v && v.alive ? `${Math.round(v.hp / v.maxHp * 100)}%` : g.vipPlayer && !g.player ? '—' : 'DOWN';
            return `TITAN ${vh} · ${t ? `${t.def.name.toUpperCase()} ${Math.round(Math.max(0, t.hp) / t.maxHp * 100)}%` : ''} · ${fmtTime(es.timeLeft)}`;
          };
          title = `Bomber Escort — ${world}`;
          text = vipTeam === 0 ? (g.vipPlayer ? 'You fly the Titan. Your escorts keep enemy fighters off you; get over the enemy Command HQ and bomb it flat. You have one aircraft.'
            : 'Escort the Titan "Atlas" to the enemy Command HQ. Keep enemy fighters off it until its bombs flatten the target.')
            : 'An enemy Titan with fighter escort is heading for our Command HQ. Shoot it down before it gets there.';
          lines = vipTeam === 0 ? ['Win: the enemy HQ is destroyed', 'Lose: the Titan is shot down, or 12 minutes pass', 'A SAM site guards the target: knock it out or use chaff (M)']
            : ['Win: the enemy Titan is shot down, or it fails within 12 minutes', 'Lose: our Command HQ is destroyed'];
        } else {
          const conquest = mode === 'conquest';
          if (conquest) new Conquest(g, {});
          bots = new BotManager(g, { 0: o.allies, 1: o.enemies }, { skill: 0.5, spawnOpts: conquest ? this.captureOpts() : null });
          bots.initial();
          title = `${conquest ? 'Conquest' : 'Quick Battle'} — ${world}`;
          text = conquest ? 'Capture airfields and forward airstrips by hover-landing inside their beacon rings (press H, touch down gently, hold for a few seconds). Every field you own scores points. Kills score too. First team to 3000 wins.'
            : 'Destroy enemy aircraft, tanks, AA guns and base structures to earn points for the Blue Alliance. First team to 3000 points — or the leader after 20 minutes — wins.';
          lines = conquest ? ['5 fields: A (ours), B C D (neutral), E (theirs)', 'Owned field: +4 points every 2 s', 'Enemy bots hover-land to capture too: shoot them on the pad']
            : ['Air kill: 100–120 pts', 'Tanks 50 · AA 40 · SAM 90 · Pillboxes 60 · Hangars 100 · HQ 400', 'Destroyer 300 (worlds with open sea)'];
        }
        this.addFeatures(g, { weather: o.weather, seed, events: o.events === false ? null : mode === 'escort' ? ['ace'] : ['ace', 'convoy', 'rescue', 'raid'] });
        if (g.events) lines.push('Watch for dynamic events: enemy aces, escaping convoys, downed pilots, bomber raids');
      }
      g.extraUpdate = ((prev) => (dt) => { if (prev) prev(dt); if (bots && mode !== 'lps') bots.update(dt); if (reinf) reinf.update(dt); g.checkMatchEnd(); })(g.extraUpdate);
      g.onFinish = (winner, reason) => this.onQuickFinish(winner, reason);
      g.spawnPlayer();
      if (g.vipPlayer && g.player) { g.escort.makeVip(g.player); g.escort.vipId = g.playerId; }
      if (g.escort && bots) g.escort.assignEscorts(bots);
      g.paused = true;
      g.updateCamera(0);
      this.state = 'brief';
      if (g.weather) lines.push(`Weather: ${g.weather.name}${o.weather === 'severe' ? ' (severe)' : ' (comes and goes)'}`);
      this.ui.showBrief(title, text, lines);
    } finally { this.busy = false; }
  }

  async startFree(o) {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.loadWorld(o.world || 'island');
      this.disposeGame();
      const g = this.game = new Game(this, this.baseOpts({ mode: 'free', plane: o.plane, timeOfDay: o.timeOfDay, god: o.god }));
      this.session = { type: 'free', opts: o };
      const seed = Math.floor(Math.random() * 100000);
      const hunt = o.tanks > 0 ? new TankHunt(g, { tanks: o.tanks, aa: o.aa, seed }) : null;
      const bots = o.enemies > 0 ? new BotManager(g, { 1: o.enemies }, { skill: 0.45 }) : null;
      if (bots) bots.initial();
      const rearm = o.ammo ? new Rearmer(g) : null;
      this.addFeatures(g, { weather: o.weather, seed, events: o.events ? ['ace', 'rescue', ...(hunt ? ['convoy'] : [])] : null });
      g.extraUpdate = (dt) => { if (hunt) hunt.update(dt); if (bots) bots.update(dt); if (rearm) rearm.update(dt); };
      g.objectiveText = () => {
        const p = AIRCRAFT[g.playerPlane];
        const idx = AIRCRAFT_ORDER.indexOf(g.playerPlane) + 1;
        return `FREE FLIGHT · [${idx}] ${p.name}${hunt ? ` · Tanks ${g.tankKills || 0}` : ''}${g.stats.kills ? ` · Air kills ${g.stats.kills}` : ''}${Settings.touch ? '' : ` · 1–${AIRCRAFT_ORDER.length} switch jet`}`;
      };
      g.onMissionKill = (victim, killerId) => {
        if (killerId === g.playerId && (victim.kind === 'tank' || victim.kind === 'heavytank')) g.tankKills = (g.tankKills || 0) + 1;
      };
      g.spawnPlayer();
      g.paused = true;
      g.updateCamera(0);
      this.state = 'brief';
      const lines = Settings.touch ? [
        'Left thumb: stick steers · drag anywhere else to aim · far-left bar is the throttle',
        'Tap JET at the bottom to switch jets instantly; ROLL, U-TURN, COBRA and HOVER sit beside it',
      ] : [
        `Press 1–${AIRCRAFT_ORDER.length} in flight to switch jets instantly`,
        'Z boost · B air brake · F barrel roll · G U-turn · Y cobra · H hover (VTOL)',
      ];
      if (hunt) lines.push(`Enemy tank columns${o.aa ? ' guarded by AA guns' : ''} roam the map — use bombs, rockets or armour-piercing cannons`);
      if (o.enemies) lines.push(`${o.enemies} enemy fighters are hunting you`);
      if (g.events) lines.push('Dynamic events on: enemy aces and downed pilots to rescue');
      if (g.weather) lines.push(`Weather: ${g.weather.name}`);
      this.ui.showBrief(`Free Flight — ${WORLDS[this.worldId].name}`, 'No score, no time limit, no boundaries. Fly anything, anywhere.', lines);
    } finally { this.busy = false; }
  }

  async startMP(msg) {
    const net = this.net;
    const s = msg.settings;
    await this.loadWorld(s.world || 'island');
    this.disposeGame();
    const me = msg.players.find((p) => p.id === net.id) || { team: 0, plane: Settings.data.plane, name: Settings.data.name };
    const solo = s.mode === 'ffa' || s.mode === 'lps';
    const teamMode = !solo && s.mode !== 'coop';
    // Bomber Escort: the Blue player flying a Titan (else the first Blue player) is the VIP everyone protects or hunts.
    let vipId = null;
    if (s.mode === 'escort') {
      const blue = msg.players.filter((p) => p.team === 0).sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const v = blue.find((p) => p.plane === 'titan') || blue[0];
      vipId = v ? v.id : null;
    }
    let plane = AIRCRAFT[me.plane] ? me.plane : 'falcon';
    if (vipId && vipId === net.id) plane = 'titan';
    const team = solo ? 1000 + (parseInt(net.id.replace(/\D/g, ''), 10) || 0) : s.mode === 'coop' ? 0 : me.team;
    const g = this.game = new Game(this, this.baseOpts({ mode: 'mp', net, mp: s, team, plane, name: me.name, timeOfDay: s.timeOfDay,
      scoreLimit: s.mode === 'ffa' ? Math.round(s.scoreLimit / 3) : s.mode === 'lps' || s.mode === 'escort' ? 0 : s.scoreLimit,
      timeLimit: s.mode === 'lps' || s.mode === 'escort' ? 0 : s.timeLimit * 60 }));
    if (solo) g.ffa = true;
    g.aceTeam = 1;
    this.session = { type: 'mp' };
    const sync = this.sync = new MPSync(g, net, s, msg.players);
    let bots = null, reinf = null;
    const humans = msg.players.length;
    if (s.mode === 'conquest') new Conquest(g, {});
    if (s.mode === 'lps') {
      g.lives = msg.late ? 0 : 1; // late joiners spectate
      new LastPilot(g, { seed: msg.seed, participants: msg.late ? [] : msg.players.map((p) => p.id) });
    }
    const setupHost = (fresh) => {
      if (fresh && !solo) setupBattlefield(g, msg.seed % 1000, {});
      if (!solo) reinf = new Reinforcements(g, { seed: msg.seed });
      const quota = teamMode ? { 0: s.bots, 1: s.bots } : s.mode === 'coop' ? { 0: s.bots, 1: s.bots + 2 + humans * 2 } : { 0: s.bots };
      const esc = () => (g.escort ? g.escort.escortOpts() : () => ({}));
      bots = new BotManager(g, quota, { skill: 0.55, ffa: solo, spawnOpts: s.mode === 'conquest' ? this.captureOpts() : s.mode === 'escort' ? (k, t) => esc()(k, t) : null });
      if (fresh) {
        bots.initial();
        if (g.lps) for (const a of bots.list) g.lps.participants.add(a.id);
      }
      if (s.mode === 'escort' && !g.escort) {
        new Escort(g, { vipTeam: 0, vipId, timeLimit: s.timeLimit * 60 });
        if (!vipId && fresh) g.escort.spawnAIVip();
      }
      if (!solo && s.mode !== 'escort' && !g.events) g.events = new EventDirector(g, { aces: g.aces, kinds: ['ace', 'convoy', 'rescue', 'raid'], myTeam: 0, enemyTeam: 1 });
    };
    if (net.isHost) setupHost(true);
    // Clients still need the escort controller for the HUD (the host owns the outcome).
    if (s.mode === 'escort' && !g.escort) new Escort(g, { vipTeam: 0, vipId, timeLimit: s.timeLimit * 60 });
    sync.onBecomeHost = () => setupHost(false);
    this.addFeatures(g, { weather: s.weather || 'auto', seed: msg.seed });
    g.extraUpdate = (dt) => { sync.update(dt); if (bots && s.mode !== 'lps') bots.update(dt); if (reinf) reinf.update(dt); };
    g.onFinish = (winner, reason) => {
      if (net.isHost) net.send({ t: 'end', results: { winner, reason, ts: g.teamScore, scores: [...g.scores.values()], ffa: solo, lpsWinner: g.lpsWinner || null } });
    };
    if (msg.late && msg.elapsed) g.time = msg.elapsed;
    if (g.lps) g.lps.t0 = 0;
    if (g.escort) g.escort.t0 = 0;
    if (vipId === net.id) g.lives = 1;
    g.spawnPlayer();
    if (vipId === net.id && g.player) g.escort.makeVip(g.player);
    g.updateCamera(0);
    this.state = 'brief';
    const modes = { team: 'Team Battle', coop: 'Co-op vs AI', ffa: 'Free-for-all Dogfight', conquest: 'Conquest', lps: 'Last Pilot Standing', escort: 'Bomber Escort' };
    const goals = {
      ffa: `Shoot down other pilots. First to ${g.scoreLimit} points wins.`,
      lps: 'No respawns, and the safe zone keeps shrinking. Be the last pilot flying.',
      conquest: `Hover-land inside an airfield's beacon ring to capture it. Owned fields and kills score. First team to ${s.scoreLimit} wins.`,
      escort: vipId === net.id ? 'You fly the Titan. Bomb the Red Command HQ; if you are shot down, Blue loses.' : 'Blue escorts the Titan to bomb the Red Command HQ; Red has to shoot it down.',
    };
    const goal = goals[s.mode] || `Destroy enemy aircraft and ground targets. First team to ${s.scoreLimit} points wins.`;
    const limit = s.mode === 'lps' ? '' : ` Time limit: ${s.timeLimit} minutes.`;
    this.ui.showBrief(`${modes[s.mode]} — ${WORLDS[this.worldId].name}`, `${goal}${limit} ${Settings.touch ? 'Hold SCORE for the scoreboard.' : 'Press Enter or T to chat, Tab for the scoreboard.'}`,
      solo ? (msg.late && s.mode === 'lps' ? ['The match is already running: you are spectating'] : []) : [`You fly for the ${TEAM_NAMES[team] || 'Blue Alliance'}`]);
  }

  resume() {
    if (!this.game) return;
    this.ui.hideAll();
    this.state = 'playing';
    this.game.paused = false;
    this.last = performance.now();
    this.audio.init();
    this.input.clear();
    this.input.lock();
    if (Settings.touch) enterFullscreen();
  }

  pause() {
    if (!this.game || this.state !== 'playing') return;
    this.state = 'paused';
    if (!this.inMatch) this.game.paused = true;
    this.audio.silence();
    this.ui.showPause(this.inMatch, this.session && this.session.type !== 'mp');
  }

  restart() {
    const s = this.session;
    if (!s) return;
    if (s.type === 'campaign') this.startCampaign(s.index, s.plane);
    else if (s.type === 'quick') this.startQuick(s.opts);
    else if (s.type === 'free') this.startFree(s.opts);
  }

  quitToMenu() {
    const wasMP = this.inMatch;
    if (wasMP && this.net.connected) this.net.send({ t: 'leave' });
    this.input.unlock();
    this.startDemo();
    this.ui.hideAll();
    this.ui.show(wasMP ? 'mp' : 'main');
  }

  statsRows(g) {
    const rows = [['Air kills', g.stats.kills], ['Ground kills', g.stats.gkills], ['Deaths', g.stats.deaths], ['Score', g.stats.score], ['Best streak', g.streaks.best], ['Time', fmtTime(g.time)]];
    const got = Medals.session.map((id) => (MEDALS.find((m) => m[0] === id) || [])[1]).filter(Boolean);
    if (got.length) rows.push([`Medals (${got.length})`, got.join(', ')]);
    return rows;
  }

  // Mode-win medals for Last Pilot Standing and Bomber Escort.
  modeMedals(g, winner) {
    const won = winner === g.playerTeam || (g.lps && g.lpsWinner === g.playerId);
    if (g.lps && g.lpsWinner === g.playerId) Medals.unlock('lps_win');
    if (g.escort && won) {
      if (g.escort.vipTeam === g.playerTeam) { Medals.unlock('escort_win'); if (g.escort.vipId === g.playerId) Medals.unlock('vip_titan'); }
      else Medals.unlock('intercept_win');
    }
  }

  onCampaignFinish(win, reason) {
    const g = this.game;
    const s = this.session;
    g.paused = true;
    this.state = 'results';
    this.input.unlock();
    this.audio.silence();
    const stars = win ? missionStars(g) : 0;
    if (win) Progress.complete(s.index, stars);
    const rows = this.statsRows(g);
    if (win) rows.push(['Rating', '★'.repeat(stars) + '☆'.repeat(3 - stars)]);
    const last = s.index + 1 >= MISSIONS.length;
    this.ui.showResults({ title: win ? (last ? 'Campaign Complete!' : 'Mission Accomplished') : 'Mission Failed', cls: win ? 'win' : 'lose',
      sub: win ? (last ? 'The Red Coalition has surrendered. Outstanding flying, pilot.' : reason) : reason, stats: rows, next: win && !last, retry: true });
  }

  onQuickFinish(winner, reason) {
    const g = this.game;
    g.paused = true;
    this.state = 'results';
    this.input.unlock();
    this.audio.silence();
    this.modeMedals(g, winner);
    const lps = g.quickMode === 'lps', escort = g.quickMode === 'escort';
    const title = lps ? (winner === 0 ? 'Victory' : 'Eliminated') : winner === -1 ? 'Draw' : winner === 0 ? 'Victory' : 'Defeat';
    const sub = lps || escort ? reason : `${reason} — Blue ${g.teamScore[0]} : ${g.teamScore[1]} Red`;
    const stats = this.statsRows(g);
    if (lps) stats.unshift(['Placed', `#${g.lps.placeOf(g.playerId)} of ${g.lps.participants.size}`]);
    this.ui.showResults({ title, cls: winner === 0 ? 'win' : winner === 1 ? 'lose' : '', sub, stats, retry: true });
  }

  onMPEnd(r) {
    if (!this.inMatch || !r) return;
    const g = this.game;
    this.state = 'results';
    this.input.unlock();
    this.audio.silence();
    let title, cls = '';
    if (r.lpsWinner !== undefined && r.lpsWinner !== null) {
      const mine = r.lpsWinner === this.net.id;
      title = mine ? 'You win!' : `${(r.scores || []).find((x) => x.id === r.lpsWinner)?.name || 'Someone'} wins`;
      cls = mine ? 'win' : '';
      if (mine) Medals.unlock('lps_win');
    } else if (r.ffa) {
      const top = [...(r.scores || [])].sort((a, b) => b.score - a.score)[0];
      title = top ? (top.id === this.net.id ? 'You win!' : `${top.name} wins`) : 'Match over';
      cls = top && top.id === this.net.id ? 'win' : '';
    } else if (r.winner === -1) title = 'Draw';
    else { const mine = g.playerTeam === r.winner; title = mine ? 'Victory' : 'Defeat'; cls = mine ? 'win' : 'lose'; if (g.escort) this.modeMedals(g, r.winner); }
    const sub = r.ffa || g.escort ? r.reason : `${r.reason} — Blue ${r.ts[0]} : ${r.ts[1]} Red`;
    this.session = { type: 'mpdone' };
    this.ui.showResults({ title, cls, sub, stats: this.statsRows(g), menuLabel: 'Back to lobby' });
  }

  afterResults(action) {
    const s = this.session || {};
    if (s.type === 'mpdone') { this.startDemo(); this.ui.hideAll(); this.ui.show(this.net.inRoom ? 'lobby' : 'mp'); return; }
    if (action === 'next' && s.type === 'campaign') return this.startCampaign(s.index + 1, null);
    if (action === 'retry') return this.restart();
    this.startDemo();
    this.ui.hideAll();
    this.ui.show(s.type === 'campaign' ? 'campaign' : 'main');
  }

  bindChat() {
    const box = $('chat-input');
    this.chatOpen = false;
    addEventListener('keydown', (e) => {
      if (!this.inMatch || this.state !== 'playing') return;
      if (!this.chatOpen && Settings.keysFor('chat').includes(e.code)) {
        e.preventDefault();
        this.chatOpen = true;
        this.input.blocked = true;
        this.input.clear();
        box.classList.add('show');
        box.value = '';
        setTimeout(() => box.focus(), 0);
      }
    });
    box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = box.value.trim();
        if (text) { this.net.send({ t: 'chat', text }); this.hud.chat(Settings.data.name, text, this.game ? this.game.playerTeam : 0); }
        this.closeChat();
      } else if (e.key === 'Escape') this.closeChat();
    });
  }

  closeChat() {
    const box = $('chat-input');
    box.classList.remove('show');
    box.blur();
    this.chatOpen = false;
    this.input.blocked = false;
    if (this.state === 'playing' && !this.input.locked) this.input.lock();
  }

  toast(text, ms = 3200) {
    let el = $('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.innerHTML = '<span class="jp">通知</span>';
    el.appendChild(document.createTextNode(text));
    el.style.opacity = '1';
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { el.style.opacity = '0'; }, ms);
  }
}

const app = new App();
window.unbiunium = app;
window.skyforge = app; // old name, kept for console debugging
app.init().catch((e) => {
  console.error(e);
  setLoad(100, `Failed to start: ${e.message}`);
});
