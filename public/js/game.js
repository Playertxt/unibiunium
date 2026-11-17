// Match controller: entities, damage, scoring, player controls, camera.
import * as THREE from 'three';
import { AIRCRAFT, AIRCRAFT_ORDER, GROUND, SCORE, TEAM_NAMES, Settings, GRAVITY, WORLD, clamp, damp } from './config.js';
import { Aircraft, leadPoint } from './aircraft.js';
import { GroundUnit } from './ground.js';
import { PilotAI } from './ai.js';
import { Weapons } from './weapons.js';
import { SITES } from './world.js';
import { Medals } from './medals.js';
import { AceDirector } from './aces.js';
import { Streaks } from './streaks.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
// Velocity to lead a target with: measured ground speed for ground units, flight velocity for aircraft.
export const velOf = (e) => e.trackVel || e.vel;
const CALLSIGNS = ['Viper', 'Ghost', 'Maverick', 'Falcon', 'Reaper', 'Nomad', 'Raven', 'Hunter', 'Blaze', 'Cobra', 'Specter', 'Wolf',
  'Saber', 'Phantom', 'Talon', 'Havoc', 'Jester', 'Iceman', 'Rogue', 'Bandit', 'Outlaw', 'Thunder', 'Storm', 'Hawk'];

export class Game {
  constructor(app, opts) {
    this.app = app;
    this.opts = opts;
    this.engine = app.engine;
    this.scene = app.engine.scene;
    this.camera = app.engine.camera;
    this.world = app.world;
    this.effects = app.effects;
    this.audio = app.audio;
    this.input = app.input;
    this.hud = app.hud;
    this.mode = opts.mode;
    this.net = opts.net || null;
    this.authority = !this.net || this.net.isHost;
    this.ffa = opts.mp && opts.mp.mode === 'ffa';
    this.time = 0;
    this.over = false;
    this.paused = false;
    this.aircraft = [];
    this.groundUnits = [];
    this.brains = [];
    this.byId = new Map();
    this.weapons = new Weapons(this);
    this.idc = 0;
    this.killfeed = [];
    this.messages = [];
    this.scores = new Map();
    this.teamScore = [0, 0];
    this.playerTeam = opts.team ?? 0;
    this.playerPlane = opts.plane || 'falcon';
    this.playerId = this.net ? this.net.id : 'you';
    this.playerName = opts.name || 'Pilot';
    this.lives = opts.lives ?? Infinity;
    this.respawnTimer = 0;
    this.life = 0;
    this.player = null;
    this.cam = { yaw: 0, pitch: -0.05, mode: 0, free: false, fyaw: 0, fpitch: 0, shake: 0, bomb: false };
    this.aimDir = new THREE.Vector3(0, 0, -1);
    this.aimPoint = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.stats = { kills: 0, gkills: 0, deaths: 0, score: 0 };
    this.ccip = null;
    this.lockTarget = null;
    this.lead = null;
    this.outOfBounds = 0;
    this.cands = [];
    this.timeLimit = opts.timeLimit || 0;
    this.scoreLimit = opts.scoreLimit || 0;
    this.botQuota = null;
    this.botTimer = 2;
    this.deathCam = null;
    // Feature state: weather, dynamic events, aces, streaks, missile threats, game modes.
    this.timeScale = 1;
    this.visibility = 1;
    this.radarJam = 0;
    this.samWarn = 0;
    this.event = null;
    this.aceTeam = 1;
    this.strikeMark = null;
    this.outsideZone = false;
    this.weather = null; this.events = null; this.conquest = null; this.lps = null; this.escort = null; this.zone = null;
    this.aces = new AceDirector(this);
    this.streaks = new Streaks(this);
    this.mslBeep = 0;
    Medals.startSession();
    Medals.onUnlock = (m) => { if (this.mode !== 'demo') { this.hud.medal(m); this.audio.play('medal'); } };
    this.engine.setTimeOfDay(opts.timeOfDay || 'day');
    this.clouds.setLighting();
    this.effects.clear();
    this.addScore(this.playerId, this.playerName, this.playerTeam, false);
  }

  get clouds() { return this.app.clouds; }

  // ---------- entity management ----------
  newId(prefix) { return `${prefix}${(this.net ? this.net.id : 'l')}_${++this.idc}`; }

  addEntity(e) {
    this.byId.set(e.id, e);
    if (e.type === 'air') this.aircraft.push(e); else this.groundUnits.push(e);
    return e;
  }

  removeEntity(e) {
    if (this.byId.get(e.id) === e) this.byId.delete(e.id);
    if (e.type === 'air') {
      const i = this.aircraft.indexOf(e);
      if (i >= 0) this.aircraft.splice(i, 1);
      const bi = this.brains.indexOf(e.ai);
      if (bi >= 0) this.brains.splice(bi, 1);
      if (e === this.player) this.player = null;
    } else {
      const i = this.groundUnits.indexOf(e);
      if (i >= 0) this.groundUnits.splice(i, 1);
      e.remove();
    }
  }

  spawnAI(kind, team, pos, opts = {}) {
    const heading = opts.heading ?? (team === 0 ? 0 : Math.PI);
    const quat = new THREE.Quaternion().setFromAxisAngle(_v.set(0, 1, 0), heading);
    const name = opts.name || `${CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)]}`;
    const ac = new Aircraft(this, { id: opts.id || this.newId('a'), kind, team, name, pos: new THREE.Vector3(pos.x, pos.y, pos.z), quat,
      skin: opts.skin ?? this.skinFor(team), local: true, speed: opts.speed });
    ac.isBot = true;
    this.addEntity(ac);
    const brain = new PilotAI(this, ac, opts);
    this.brains.push(brain);
    this.addScore(ac.id, ac.name, team, true);
    if (this.net && this.authority) this.net.send({ t: 'spawn', id: ac.id });
    return ac;
  }

  spawnGround(kind, team, x, z, opts = {}) {
    const u = new GroundUnit(this, { id: opts.id || this.newId('g'), kind, team, x, z, skin: this.skinFor(team), local: this.authority, ...opts });
    return this.addEntity(u);
  }

  skinFor(team) { return this.ffa ? (team === this.playerTeam ? 0 : 1) : (team === 1 ? 1 : 0); }
  isEnemy(a, b) { return a.team !== b.team; }

  spawnPoint(team) {
    const s = team === 0 ? SITES.blueAirfield : SITES.redAirfield;
    const dirZ = team === 0 ? -1 : 1;
    if (this.ffa) {
      const a = Math.random() * Math.PI * 2;
      return { pos: new THREE.Vector3(Math.cos(a) * 4500, 1400 + Math.random() * 500, Math.sin(a) * 4500), heading: Math.atan2(Math.cos(a), Math.sin(a)) };
    }
    return { pos: new THREE.Vector3(s.x + (Math.random() - 0.5) * 600, this.world.heightAt(s.x, s.z) + 900 + Math.random() * 250, s.z + dirZ * 300), heading: team === 0 ? 0 : Math.PI };
  }

  spawnPlayer(at = null) {
    // A wreck still in the air shares the player's id: clear it before the new aircraft takes that id.
    if (this.wreck && !this.wreck.removed) this.wreck.remove();
    this.wreck = null;
    const sp = at || (this.opts.spawn ? this.opts.spawn(this) : this.spawnPoint(this.playerTeam));
    this.life++;
    const quat = sp.quat ? sp.quat.clone() : new THREE.Quaternion().setFromAxisAngle(_v.set(0, 1, 0), sp.heading);
    const p = new Aircraft(this, { id: this.playerId, kind: this.playerPlane, team: this.playerTeam, name: this.playerName,
      pos: sp.pos, quat, skin: 0, isPlayer: true, human: true, local: true, speed: sp.speed ?? AIRCRAFT[this.playerPlane].maxSpeed * 0.72 });
    p.god = !!this.opts.god;
    this.player = p;
    this.addEntity(p);
    if (!at || at.heading !== undefined) { this.cam.yaw = sp.heading; this.cam.pitch = 0.02; } // level aim: a nose-down default slowly flew jets into the ground
    this.lock = { target: null, t: 0, locked: false, beep: 0 };
    this.deathCam = null;
    this.outOfBounds = 0;
    this.message(`${AIRCRAFT[this.playerPlane].name} ready`, 2.5);
  }

  // Free flight: swap to another jet in mid-air, keeping position, heading and speed.
  swapPlane(kind) {
    if (!AIRCRAFT[kind] || kind === this.playerPlane && this.player) return;
    const old = this.player;
    this.playerPlane = kind;
    if (!old || !old.alive) return;
    const def = AIRCRAFT[kind];
    const at = { pos: old.pos.clone(), quat: old.quat.clone(), speed: clamp(old.speed, def.stallSpeed * 1.3, def.maxSpeed) };
    const hover = old.hover && !def.noHover;
    old.remove();
    this.player = null;
    this.spawnPlayer(at);
    const p = this.player;
    p.throttle = Math.min(old.throttle, p.maxThrottle);
    if (hover) { p.hover = true; p.vel.copy(old.vel); }
    this.effects.vapor(p.pos, p.vel, 4);
    this.audio.play('click');
  }

  // ---------- scoring ----------
  addScore(id, name, team, bot) {
    if (!this.scores.has(id)) this.scores.set(id, { id, name, team, bot, kills: 0, gkills: 0, deaths: 0, score: 0 });
    return this.scores.get(id);
  }

  nameOf(id) {
    if (!id) return null;
    const e = this.byId.get(id);
    if (e) return e.name;
    const s = this.scores.get(id);
    return s ? s.name : null;
  }

  teamOf(id) {
    const e = this.byId.get(id);
    if (e) return e.team;
    const s = this.scores.get(id);
    return s ? s.team : -1;
  }

  credit(killerId, victim) {
    if (!killerId || killerId === victim.id) return 0;
    const kteam = this.teamOf(killerId);
    if (kteam === victim.team && !this.ffa) return 0;
    let pts;
    if (victim.type === 'air') pts = victim.human ? SCORE.airKill : SCORE.botKill;
    else pts = victim.def.score;
    const killer = this.byId.get(killerId);
    const isAirKiller = killer ? killer.type === 'air' : this.scores.has(killerId) && !String(killerId).startsWith('g');
    if (!isAirKiller) return 0; // AI ground-vs-ground kills don't score
    const s = this.scores.get(killerId) || this.addScore(killerId, this.nameOf(killerId) || '?', kteam, false);
    s.score += pts;
    if (victim.type === 'air') s.kills++; else s.gkills++;
    if (kteam === 0 || kteam === 1) this.teamScore[kteam] += pts;
    return pts;
  }

  onKill(victim, killerId, reason) {
    const pts = this.authority ? this.credit(killerId, victim) : 0;
    if (victim.type === 'air') {
      const s = this.scores.get(victim.id);
      if (s && this.authority) s.deaths++;
    }
    const info = this.killInfo(victim, killerId);
    this.addFeed(killerId, victim, reason);
    if (killerId === this.playerId && victim.id !== this.playerId) this.onPlayerKill(victim, pts || this.pointsFor(victim), info);
    if (victim === this.player) this.onPlayerDeath(killerId, reason);
    if (this.onMissionKill) this.onMissionKill(victim, killerId);
    this.killHooks(victim, killerId);
    if (this.net && victim.local) {
      this.net.send({ t: 'kill', v: victim.id, k: killerId || null, r: reason, vt: victim.type, vn: victim.name, kn: this.nameOf(killerId), vteam: victim.team, kind: victim.kind, human: !!victim.human,
        w: info.weapon, go: info.gunsOnly ? 1 : 0, bl: info.blast, ace: victim.aceId || null, vip: victim.vip ? 1 : 0 });
    }
  }

  pointsFor(v) { return v.type === 'air' ? (v.human ? SCORE.airKill : SCORE.botKill) : v.def.score; }

  addFeed(killerId, victim, reason) {
    const kn = this.nameOf(killerId);
    const vn = victim.type === 'air' ? victim.name : `${victim.def.name}`;
    let text;
    if (kn && killerId !== victim.id) text = { a: kn, at: this.teamOf(killerId), b: vn, bt: victim.team, verb: victim.type === 'air' ? '✈' : '⌖' };
    else text = { a: vn, at: victim.team, b: reason === 'crash' ? 'crashed' : 'was destroyed', bt: -1, verb: '' };
    text.time = this.time;
    this.killfeed.push(text);
    if (this.killfeed.length > 6) this.killfeed.shift();
  }

  onPlayerKill(victim, pts, info = {}) {
    if (victim.type === 'air') this.stats.kills++; else this.stats.gkills++;
    this.stats.score += pts;
    const what = victim.aceId ? `ACE ${victim.name}` : `${victim.def.name} destroyed`;
    this.hud.killConfirm(`${what}  +${pts}`);
    this.audio.play('kill');
    if (this.mode === 'demo') return;
    if (victim.type === 'air') {
      Medals.unlock('first_blood');
      if (this.weather && this.weather.kind === 'storm' && this.weather.active) Medals.unlock('storm_kill');
      if (this.visibility < 0.5) Medals.unlock('blind_kill');
      if (info.weapon === 'bomb' && victim.def && victim.def.model === 'bomber') Medals.unlock('bomb_bomber');
    } else {
      if ((victim.kind === 'tank' || victim.kind === 'heavytank') && info.gunsOnly) Medals.unlock('tank_guns');
      if (victim.kind === 'sam') Medals.inc('sams');
    }
    this.streaks.onKill(victim, pts, info);
  }

  onPlayerHit(amount) {
    this.hud.damageFlash(amount);
    this.audio.play('hit', null, Math.min(1, amount / 15));
    if (this.player && this.player.lastAttacker) this.aces.onPlayerHit(this.player.lastAttacker);
  }

  onPlayerDeath(killerId, reason) {
    this.stats.deaths++;
    this.streaks.onDeath();
    this.lives--;
    // The countdown starts now, not when the wreck finally reaches the ground. The wreck keeps falling on its own.
    this.respawnTimer = this.mode === 'free' ? 1 : 3;
    const kn = this.nameOf(killerId);
    this.wreck = this.player;
    this.deathCam = { pos: this.player.pos, killer: killerId, time: 0 };
    this.player = null;
    this.message(kn && killerId !== this.playerId ? `Shot down by ${kn}` : reason === 'crash' ? 'You crashed' : 'Aircraft destroyed', 4, '#e2574b');
  }

  // J: refill guns, bombs and rockets. Instant in free flight; in combat it needs 15 s between uses.
  rearmPlayer(p) {
    const wait = (this.rearmAt || 0) - this.time;
    if (wait > 0) { this.message(`Rearm ready in ${Math.ceil(wait)} s`, 1.5, '#e6cf9a'); return; }
    p.rearm();
    this.rearmAt = this.mode === 'free' ? 0 : this.time + 15;
    this.audio.play('click');
    this.message('Rearmed', 1.5, '#a8d39a');
  }

  // Multiplayer: the host mirrors HUD messages, radio calls and similar UI events to everyone in the room.
  netUI(kind, data = {}) { if (this.net && this.authority) this.net.send({ t: 'ev', k: 'ui', u: kind, ...data }); }

  radio(name, text, color = '#ece6da', relay = true) {
    if (this.mode === 'demo') return;
    if (relay) this.netUI('radio', { n: name, x: text, c: color });
    if (!Settings.data.radio) return;
    this.hud.radio(name, text, color);
    this.audio.play('radio');
  }

  // Extra points for the player (combos, events). Clients ask the host to credit them.
  awardBonus(pts) {
    if (!pts || this.mode === 'demo') return;
    this.stats.score += pts;
    if (this.authority) this.creditBonus(this.playerId, pts);
    else if (this.net) this.net.send({ t: 'ev', k: 'ui', u: 'bonus', id: this.playerId, pts });
  }

  creditBonus(id, pts) {
    const s = this.scores.get(id);
    if (s) s.score += pts;
    const t = this.teamOf(id);
    if ((t === 0 || t === 1) && this.mode !== 'free') this.teamScore[t] += pts;
  }

  // Inside a cloud: hidden from radar locks, HUD markers and AI eyes beyond close range.
  inCloud(e) {
    const c = this.clouds;
    if (!c || !c.puffs.length) return false;
    if (!(e._ct > this.time)) { e._ct = this.time + 0.35; e._ic = c.densityAt(e.pos) > 0.3; }
    return e._ic;
  }

  radarJamAt(pos) { return this.radarJam > 0 && (!this.jamPos || pos.distanceTo(this.jamPos) < 7000); }

  // Who hurt what and with which weapon, for kill credit details (multi-kills, "guns only" medals).
  recordHit(e, ownerId, info) {
    if (!ownerId) return;
    e.lastHit = { by: ownerId, weapon: info.weapon || null, explosive: !!info.explosive, blast: info.blast || null };
    const log = e.hitLog || (e.hitLog = {});
    log[ownerId] = (log[ownerId] || 0) | (info.explosive ? 2 : 1);
  }

  killInfo(victim, killerId) {
    const h = victim.lastHit && victim.lastHit.by === killerId ? victim.lastHit : null;
    return { weapon: h ? h.weapon : null, blast: h ? h.blast : null, gunsOnly: !!(victim.hitLog && victim.hitLog[killerId] === 1) };
  }

  // Everyone hears about every kill exactly once (locally owned victims here, remote ones via MPSync).
  killHooks(victim, killerId) {
    this.aces.onKill(victim, killerId);
    if (this.events) this.events.onKill(victim, killerId);
    if (this.lps) this.lps.onKill(victim);
    if (this.escort) this.escort.onKill(victim);
  }

  onMissileSpoofed(m) {
    if (m.origTarget !== this.player || !this.player) return;
    if (m.decoyedBy === 'flare' && m.seeker === 'ir') Medals.unlock('flare_dodge');
    if (m.decoyedBy === 'chaff' && m.seeker === 'radar') Medals.unlock('chaff_dodge');
    this.message(m.seeker === 'ir' ? 'Heat-seeker spoofed' : 'SAM spoofed', 1.6, '#a8d39a');
  }

  message(text, dur = 3, color = '#ffffff') {
    this.messages.push({ text, until: this.time + dur, color });
    if (this.messages.length > 3) this.messages.shift();
  }

  // ---------- damage ----------
  hitCandidates() { return this.cands; }

  applyDamage(e, dmg, ownerId, info = {}) {
    if (!e.alive) return;
    let amount = dmg;
    if (e.type === 'ground') {
      const armor = e.def.armor || 0;
      const pen = info.explosive ? 3 : info.pen || 0;
      if (pen < armor) amount *= armor - pen >= 2 ? 0.05 : 0.18;
    }
    if (ownerId && ownerId === this.playerId && e.id !== this.playerId) this.hud.hitMarker(e.type === 'ground' && amount < dmg * 0.5);
    if (e.local) { this.recordHit(e, ownerId, info); e.damage(amount, ownerId, info); }
    else if (this.net) {
      const to = e.human ? e.id : this.net.hostId;
      this.net.send({ t: 'hit', to, id: e.id, d: Math.round(amount * 10) / 10, by: ownerId, w: info.weapon || null, x: info.explosive ? 1 : 0, bl: info.blast || null });
    }
  }

  areaDamage(pos, radius, dmg, ownerId, team, info = {}) {
    for (const e of this.cands) {
      if (e.team === team && !(this.ffa && e.id !== ownerId)) continue;
      if (info.airOnly && e.type !== 'air') continue;
      if (info.localOnly && !e.local) continue;
      if (e === info.exclude) continue;
      const d = Math.max(0, pos.distanceTo(e.hitCenter) - e.radius * 0.5);
      if (d < radius) this.applyDamage(e, dmg * Math.pow(1 - d / radius, 1.3), ownerId, info);
    }
  }

  shake(pos, amount) {
    const d = pos.distanceTo(this.camera.position);
    this.cam.shake = Math.max(this.cam.shake, amount * clamp(1 - d / 900, 0, 1));
  }

  onWeaponEvent(ac, kind, pos, vel, target = null) {
    if (!this.net || !ac.local) return;
    const r = (x) => Math.round(x * 10) / 10;
    const m = { t: 'ev', k: kind, id: ac.id, p: [r(pos.x), r(pos.y), r(pos.z)], v: [r(vel.x), r(vel.y), r(vel.z)] };
    if (target) { m.tg = target.id; m.tr = kind === 'bomb' ? ac.def.bombs.guided : ac.def.lock ? ac.def.lock.turn : 2.2; }
    if (kind === 'missile') m.sk = ac.type === 'ground' ? 'radar' : 'ir';
    this.net.send(m);
  }

  // ---------- queries ----------
  nearestEnemy(self, pos, range, type, objectivesFirst = false) {
    let best = null, bd = range * range;
    const list = type === 'air' ? this.aircraft : this.groundUnits;
    for (const e of list) {
      if (!e.alive || e.team === self.team || e.def.passive) continue;
      let d2 = pos.distanceToSquared(e.pos);
      if (e.def.stealth) d2 /= e.def.stealth * e.def.stealth; // stealth jets are spotted at shorter range
      if (objectivesFirst && e.objective) d2 *= 0.35;
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  bestAirTarget(a, range) {
    let best = null, bs = Infinity;
    for (const e of this.aircraft) {
      if (!e.alive || e.team === a.team) continue;
      _v.subVectors(e.pos, a.pos);
      const d = _v.length();
      if (d > range * (e.def.stealth || 1) * Math.max(0.35, this.visibility)) continue;
      if (d > 900 && this.inCloud(e)) continue;
      const s = d * (1.6 - _v.divideScalar(d).dot(a.fwd)) * (e.human ? 0.85 : 1);
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  // ---------- main loop ----------
  update(realDt) {
    const dt = realDt * (this.timeScale || 1);
    this.time += dt;
    this.samWarn = 0;
    this.radarJam = Math.max(0, this.radarJam - dt);
    this.cands.length = 0;
    for (const a of this.aircraft) if (a.alive) this.cands.push(a);
    for (const g of this.groundUnits) if (g.alive && !g.def.passive) this.cands.push(g);

    this.handleInput(dt);
    for (const b of this.brains) b.update(dt);
    for (let i = this.aircraft.length - 1; i >= 0; i--) this.aircraft[i]?.update(dt);
    for (const g of this.groundUnits) g.update(dt);
    this.weapons.update(dt);
    this.effects.update(dt);
    this.world.update(dt, this.time);
    if (this.extraUpdate) this.extraUpdate(dt);
    if (this.weather) this.weather.update(dt);
    if (this.events) this.events.update(dt);
    if (this.conquest) this.conquest.update(dt);
    if (this.lps) this.lps.update(dt);
    if (this.escort) this.escort.update(dt);
    this.aces.update(dt);
    this.streaks.update(realDt, dt);
    if (this.mode !== 'demo') this.checkMedals(dt);
    this.updateThreats(dt);
    this.updateCamera(dt);
    this.clouds.update(dt, this.camera);
    this.updateTargeting(dt);
    this.engine.updateShadows(this.player ? this.player.pos : this.camPos);
    this.audio.setListener(this.camera.position);
    this.audio.update(this.player, this.player ? clamp(this.player.speed / 300, 0, 1.2) : 0);

    if (!this.player && !this.over && this.mode !== 'demo') {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0 && this.lives > 0 && this.canRespawn !== false) this.spawnPlayer();
    }
    if (this.player && this.player.alive && this.mode !== 'demo' && this.mode !== 'free') this.checkBounds(dt);
    this.messages = this.messages.filter((m) => m.until > this.time);
    this.input.endFrame();
  }

  // Medals that depend on what the player is doing right now (landing, cobra overshoots).
  checkMedals(dt) {
    const p = this.player;
    if (!p || !p.alive) { this.cobraWatch = null; return; }
    if (p.hover && p.landed) {
      if (!this.touchedDown) { this.touchedDown = true; if (Medals.landedOn(this.app.worldId)) this.message(`Landed on ${this.world.def.name}`, 2.5, '#a8d39a'); }
    } else this.touchedDown = false;
    if (p.maneuver && p.maneuver.type === 'cobra' && !this.cobraWatch) {
      const behind = this.aircraft.filter((e) => e.alive && e.team !== p.team && e.pos.distanceTo(p.pos) < 800 && _v.subVectors(e.pos, p.pos).normalize().dot(p.fwd) < -0.3);
      this.cobraWatch = { list: behind, until: this.time + 3.5 };
    }
    const w = this.cobraWatch;
    if (w) {
      for (const e of w.list) if (e.alive && e.pos.distanceTo(p.pos) < 1000 && _v.subVectors(e.pos, p.pos).normalize().dot(p.fwd) > 0.3) { Medals.unlock('cobra_bandit'); this.message('Overshoot! Bandit in front', 2, '#a8d39a'); w.list = []; }
      if (this.time > w.until && !(p.maneuver && p.maneuver.type === 'cobra')) this.cobraWatch = null;
    }
  }

  // Missile warning tone: beeps faster the closer the nearest missile tracking you gets.
  updateThreats(dt) {
    const p = this.player;
    this.threats = [];
    if (!p || !p.alive) return;
    let tti = Infinity;
    for (const m of this.weapons.missiles) {
      if (m.target !== p) continue;
      this.threats.push(m);
      const d = m.pos.distanceTo(p.pos);
      tti = Math.min(tti, d / Math.max(50, m.vel.length()));
    }
    this.mslBeep -= dt;
    if (this.threats.length) {
      if (this.mslBeep <= 0) { this.audio.play('mslwarn'); this.mslBeep = clamp(tti / 6, 0.07, 0.45); }
    } else if (this.samWarn > 0.05 && this.mslBeep <= 0) { this.audio.play('samwarn'); this.mslBeep = this.samWarn > 0.6 ? 0.25 : 0.6; }
  }

  checkBounds(dt) {
    const p = this.player.pos;
    const r = Math.hypot(p.x, p.z);
    if (r > WORLD.boundary) {
      this.outOfBounds += dt;
      if (this.outOfBounds > 10) this.player.kill(null, 'crash');
    } else this.outOfBounds = 0;
  }

  handleInput(dt) {
    const inp = this.input;
    const p = this.player;
    const m = inp.consumeMouse();
    const sens = 0.0021 * Settings.data.sens;
    const inv = Settings.data.invert ? -1 : 1;
    this.cam.free = inp.act('freeLook');
    const freeCursor = inp.freeCursor && this.mode !== 'demo';
    if (this.cam.free) {
      const o = freeCursor ? inp.cursorOffset() : null;
      if (o) {
        // Free-cursor free look: the view points toward the cursor; re-centre to steer again afterwards.
        this.cam.fyaw = clamp(-o.x, -1.6, 1.6) * 1.9;
        this.cam.fpitch = clamp(-o.y * inv * 1.3, -1.4, 1.4);
        inp.mouse.armed = false;
      } else {
        this.cam.fyaw -= m.dx * sens; this.cam.fpitch = clamp(this.cam.fpitch - m.dy * sens * inv, -1.4, 1.4);
      }
    } else {
      this.cam.fyaw = damp(this.cam.fyaw, 0, 8, dt); this.cam.fpitch = damp(this.cam.fpitch, 0, 8, dt);
      // Touch stick: turns the aim like the free-cursor joystick (in hover mode it moves the jet instead).
      const ts = inp.touch.stick;
      if (ts && !(p && p.hover)) {
        const rate = 2.6 * Settings.data.stickSens;
        this.cam.yaw -= ts.x * rate * dt;
        this.cam.pitch = clamp(this.cam.pitch - ts.y * rate * dt * inv, -1.5, 1.5);
      }
      if (freeCursor) {
        // No mouse capture: the cursor works like a joystick, turning the view toward it.
        const s = inp.stick();
        if (s) {
          const rate = 3.0 * Settings.data.stickSens;
          this.cam.yaw -= s.x * rate * dt;
          this.cam.pitch = clamp(this.cam.pitch - s.y * rate * dt * inv, -1.5, 1.5);
        }
      } else {
        this.cam.yaw -= m.dx * sens;
        this.cam.pitch = clamp(this.cam.pitch - m.dy * sens * inv, -1.5, 1.5);
      }
    }
    if (inp.actHit('camera')) { this.cam.mode = (this.cam.mode + 1) % 3; this.audio.play('click'); }
    if (inp.actHit('bombCam')) this.cam.bomb = !this.cam.bomb;
    this.hud.showScores = inp.act('scoreboard');
    if (this.mode === 'free') {
      for (let i = 1; i <= AIRCRAFT_ORDER.length; i++) if (inp.hit(`Digit${i}`) || inp.hit(`Numpad${i}`)) this.swapPlane(AIRCRAFT_ORDER[i - 1]);
      if (inp.actHit('nextJet')) this.swapPlane(AIRCRAFT_ORDER[(AIRCRAFT_ORDER.indexOf(this.playerPlane) + 1) % AIRCRAFT_ORDER.length]);
    }
    if (!p || !p.alive) return;
    if (this.player !== p) return; // swapped this frame
    if (inp.actHit('rearm')) this.rearmPlayer(p);
    if (inp.actHit('respawn')) { p.kill(p.lastAttacker && this.time - p.lastAttackTime < 10 ? p.lastAttacker : null, 'crash'); return; }

    const axis = (a, b) => (inp.act(a) ? 1 : 0) - (inp.act(b) ? 1 : 0);
    if (inp.actHit('hover')) {
      if (!p.canHover) this.message(`${p.def.name} can't hover`, 2, '#e6cf9a');
      else if (p.toggleHover()) {
        const help = inp.touchMode ? 'HOVER MODE: throttle climbs · stick moves · drag to aim' : 'HOVER MODE: W/S climb · A/D strafe · ↑/↓ move';
        this.message(p.hover ? help : 'Wing-borne flight', 2.5, '#ece6da'); this.audio.play('click');
      }
    }
    const ts = inp.touch.stick;
    if (p.hover) {
      p.hoverIn.up = clamp(axis('throttleUp', 'throttleDown') + inp.touch.lift, -1, 1);
      p.hoverIn.side = clamp(axis('rollRight', 'rollLeft') + (ts ? ts.x : 0), -1, 1);
      p.hoverIn.fwd = clamp(axis('pitchUp', 'pitchDown') + (ts ? -ts.y : 0), -1, 1) + (Settings.data.wheelThrottle ? -m.wheel * 0.5 : 0);
      p.manual.roll = p.manual.yaw = p.manual.pitch = 0;
      p.boosting = false; p.airbrake = false;
    } else {
      let th = p.throttle;
      if (inp.act('throttleUp')) th += dt * 0.55;
      if (inp.act('throttleDown')) th -= dt * 0.55;
      if (Settings.data.wheelThrottle) th -= m.wheel * 0.05;
      if (inp.touch.throttle != null) th = inp.touch.throttle * p.maxThrottle; // touch slider sets it directly
      p.throttle = clamp(th, 0, p.maxThrottle);
      p.manual.roll = axis('rollRight', 'rollLeft');
      p.manual.yaw = axis('yawRight', 'yawLeft');
      p.manual.pitch = axis('pitchUp', 'pitchDown');
      p.boosting = inp.act('boost') && p.boost > 0.02;
      p.airbrake = inp.act('airbrake');
      const wasMv = p.maneuver;
      if (inp.actHit('barrelRoll')) p.startManeuver('roll', p.manual.roll || (this.lastRollDir = -(this.lastRollDir || -1)));
      if (inp.actHit('uturn') && !p.startManeuver('uturn') && !p.maneuver) this.message('Too slow for a U-turn', 1.5, '#e6cf9a');
      if (inp.actHit('cobra')) p.startManeuver('cobra');
      if (!wasMv && p.maneuver) this.audio.play('click');
    }
    // After a U-turn, point the mouse-aim at the new heading so the jet doesn't turn straight back.
    if (p.maneuver && p.maneuver.type === 'uturn') this.uturnActive = true;
    else if (this.uturnActive) {
      this.uturnActive = false;
      this.cam.yaw = Math.atan2(-p.fwd.x, -p.fwd.z);
      this.cam.pitch = clamp(Math.asin(clamp(p.fwd.y, -1, 1)), -1.2, 1.2);
    }
    p.firing = inp.act('fire') && (p.ammo > 0 || p.overcharge > 0);
    if (inp.actHit('flares')) {
      if (!p.dispense('flare') && p.flares <= 0) this.message('No flares left (J to rearm)', 1.5, '#e6cf9a');
      if (inp.touchMode) { p.cmTimer = 0; p.dispense('chaff'); } // the touch button drops both
    }
    if (inp.actHit('chaff') && !p.dispense('chaff') && p.chaff <= 0) this.message('No chaff left (J to rearm)', 1.5, '#e6cf9a');
    if (inp.act('bomb')) p.dropBomb();
    if (inp.act('rocket')) p.fireRocket();
    // Mouse-aim: steer towards a far point along the camera aim direction.
    this.aimDir.setFromSphericalCoords(1, Math.PI / 2 - this.cam.pitch, this.cam.yaw + Math.PI);
    this.aimPoint.copy(this.camPos).addScaledVector(this.aimDir, 3000);
    if (!p.targetDir) p.targetDir = new THREE.Vector3();
    p.targetDir.subVectors(this.aimPoint, p.pos).normalize();
  }

  updateCamera(dt) {
    const cam = this.camera;
    const p = this.player;
    if (this.cam.shake > 0) this.cam.shake = Math.max(0, this.cam.shake - dt * 2.5);
    if (this.mode === 'demo') return this.demoCamera(dt);
    const target = p || (this.deathCam && this.byId.get(this.deathCam.killer)) || null;
    if (!p) {
      this.setCockpitView(null, false);
      // Spectate: orbit the wreck or watch the killer.
      const focus = target && target.alive ? target.pos : this.deathCam ? this.deathCam.pos : _v.set(0, 500, 0);
      this.cam.yaw += dt * 0.15;
      const d = 60;
      this.camPos.set(focus.x + Math.sin(this.cam.yaw) * d, focus.y + 22, focus.z + Math.cos(this.cam.yaw) * d);
      this.camPos.y = Math.max(this.camPos.y, this.world.groundAt(this.camPos.x, this.camPos.z) + 5);
      cam.position.copy(this.camPos);
      cam.lookAt(focus);
      this.setFov(Settings.data.fov, dt);
      return;
    }
    const def = p.def;
    if (this.streaks.killcam) {
      this.setCockpitView(p, false);
      this.hud.killcamK = this.streaks.camera(cam, _v);
      this.setFov(45, 1);
      return;
    }
    this.hud.killcamK = 0;
    this.setCockpitView(p, this.cam.mode === 1 && !(this.cam.bomb && p.bombsLeft > 0 && this.ccip));
    const aim = _v2.setFromSphericalCoords(1, Math.PI / 2 - (this.cam.pitch + this.cam.fpitch), this.cam.yaw + this.cam.fyaw + Math.PI);
    if (this.cam.bomb && p.bombsLeft > 0 && this.ccip) {
      cam.position.copy(p.pos).addScaledVector(p.up, -4);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.ccip);
      this.camPos.copy(p.pos).addScaledVector(this.aimDir, -def.cam.dist);
      this.setFov(28, dt);
    } else if (this.cam.mode === 1) {
      // Cockpit-ish: locked to the aircraft.
      // Pilot's eye inside the detailed cockpit.
      cam.position.copy(p.parts.eye || _v.set(0, 1, -3.4)).applyQuaternion(p.mesh.quaternion).add(p.pos);
      // Slight downward look, as in flight sims, so the instrument panel is in view.
      _q.copy(p.mesh.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(_v.set(1, 0, 0), -0.12));
      if (this.cam.free) _q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.cam.fpitch, this.cam.fyaw, 0, 'YXZ')));
      cam.quaternion.copy(_q);
      this.camPos.copy(p.pos).addScaledVector(this.aimDir, -def.cam.dist);
      this.setFov(Settings.data.fov + 5, dt);
    } else if (p.maneuver && p.maneuver.type === 'uturn') {
      // Locked chase camera through the loop.
      const dist = def.cam.dist * (this.cam.mode === 2 ? 2.3 : 1);
      this.camPos.copy(p.pos).addScaledVector(p.fwd, -dist).addScaledVector(p.up, def.cam.height);
      cam.position.copy(this.camPos);
      cam.up.copy(p.up);
      cam.lookAt(_v.copy(p.pos).addScaledVector(p.fwd, 40));
      this.setFov(Settings.data.fov, dt);
    } else {
      const dist = def.cam.dist * (this.cam.mode === 2 ? 2.3 : 1) * (1 + clamp((p.speed - 150) / 600, 0, 0.15)) * (p.hover ? 1.15 : 1);
      this.camPos.copy(p.pos).addScaledVector(aim, -dist);
      this.camPos.y += def.cam.height * (1 - Math.abs(aim.y) * 0.6);
      const gy = this.world.groundAt(this.camPos.x, this.camPos.z) + 3;
      if (this.camPos.y < gy) this.camPos.y = gy;
      cam.position.copy(this.camPos);
      cam.up.set(0, 1, 0);
      cam.lookAt(_v.copy(this.camPos).add(aim));
      const boost = p.boosting ? 14 : p.throttle > 1 ? 6 : 0;
      this.setFov(Settings.data.fov + boost, dt);
    }
    if (this.cam.shake > 0 && Settings.data.shake) {
      const s = this.cam.shake * 0.6;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
    }
  }

  // Cockpit view: show the interior, hide the pilot's own body and bring the near plane in close.
  setCockpitView(p, on) {
    const P = p && p.parts;
    if (P && P.cockpit) {
      P.cockpit.visible = on;
      if (P.pilots && P.pilots[0]) P.pilots[0].visible = !on;
      // The aircraft's own exterior lives on layer 2: still lit and shadow-casting, but hidden from the
      // camera in cockpit view so the fuselage skin doesn't cover the instrument panel.
      if (!P.layered) {
        P.layered = true;
        this.engine.sun.shadow.camera.layers.enable(2);
        const keep = (o) => { for (let x = o; x; x = x.parent) if (x === P.cockpit || x.userData.cockpitKeep) return true; return false; };
        p.mesh.traverse((o) => { if (!keep(o)) o.layers.set(2); });
      }
    }
    if (on) this.camera.layers.disable(2); else this.camera.layers.enable(2);
    const near = on ? 0.05 : 0.6;
    if (this.camera.near !== near) { this.camera.near = near; this.camera.updateProjectionMatrix(); }
  }

  setFov(f, dt) {
    const c = this.camera;
    const nf = damp(c.fov, f, 4, dt);
    if (Math.abs(nf - c.fov) > 0.01) { c.fov = nf; c.updateProjectionMatrix(); }
  }

  demoCamera(dt) {
    const cam = this.camera;
    if (!this.demoTarget || !this.demoTarget.alive || this.time > this.demoSwitch) {
      const live = this.aircraft.filter((a) => a.alive);
      this.demoTarget = live[Math.floor(Math.random() * live.length)] || null;
      this.demoSwitch = this.time + 9 + Math.random() * 6;
      this.demoAng = Math.random() * Math.PI * 2;
    }
    const t = this.demoTarget;
    if (!t) { cam.position.set(Math.sin(this.time * 0.05) * 6000, 1600, Math.cos(this.time * 0.05) * 6000); cam.lookAt(0, 200, 0); return; }
    this.demoAng += dt * 0.12;
    const d = t.def.cam.dist * 1.7;
    _v.set(Math.sin(this.demoAng) * d, d * 0.25, Math.cos(this.demoAng) * d).applyQuaternion(t.quat);
    cam.position.copy(t.pos).add(_v);
    const gy = this.world.groundAt(cam.position.x, cam.position.z) + 5;
    if (cam.position.y < gy) cam.position.y = gy;
    cam.up.set(0, 1, 0);
    cam.lookAt(t.pos);
    this.camPos.copy(cam.position);
    this.setFov(55, dt);
  }

  // Auto-lock radar (jets with a `lock` definition): keep an enemy near the nose to lock it. A locked target gets
  // homing rockets and gun aim assist; the lock holds through a wider cone than it takes to acquire.
  updateLock(p, dt) {
    const L = p.def.lock;
    const s = this.lock || (this.lock = { target: null, t: 0, locked: false, beep: 0 });
    p.aimAssist = null; p.lockedTarget = null;
    if (!L) { s.target = null; s.t = 0; s.locked = false; return; }
    // Lightning overload: the radar is blind for a moment.
    if (this.radarJam > 0) { if (s.locked) this.audio.play('warn', null, 0.6); s.target = null; s.t = 0; s.locked = false; return; }
    const vis = Math.max(0.45, this.visibility);
    const angTo = (e) => {
      _v.subVectors(e.hitCenter, p.pos);
      const d = _v.length();
      return { d, ang: Math.acos(clamp(_v.divideScalar(Math.max(d, 1e-3)).dot(p.fwd), -1, 1)) };
    };
    if (s.target) {
      const { d, ang } = angTo(s.target);
      const ok = s.target.alive && d < L.range * 1.2 && ang < (s.locked ? L.hold : L.cone * 1.35);
      if (!ok) { if (s.locked) this.audio.play('warn', null, 0.6); s.target = null; s.t = 0; s.locked = false; }
    }
    if (!s.target) {
      let best = null, bestA = L.cone;
      for (const e of this.aircraft) {
        if (!e.alive || e.team === p.team) continue;
        const { d, ang } = angTo(e);
        if (d > L.range * (e.def.stealth || 1) * vis || d < 60) continue;
        if (d > 700 && this.inCloud(e)) continue;
        if (ang < bestA) { bestA = ang; best = e; }
      }
      if (!best) {
        bestA = L.cone * 0.8;
        for (const e of this.groundUnits) {
          if (!e.alive || e.team === p.team || e.def.passive) continue;
          const { d, ang } = angTo(e);
          if (d > L.range * 0.85 * vis || d < 80) continue;
          if (ang < bestA) { bestA = ang; best = e; }
        }
      }
      if (best) { s.target = best; s.t = 0; s.locked = false; s.beep = 0; }
    }
    if (!s.target) return;
    if (!s.locked) {
      s.t += dt;
      s.beep -= dt;
      if (s.beep <= 0) { s.beep = 0.22; this.audio.play('locking'); }
      if (s.t >= L.time) { s.locked = true; this.audio.play('lock'); }
    }
    if (s.locked) {
      const t = s.target;
      p.lockedTarget = t;
      p.aimAssist = leadPoint(p.pos, p.vel, t.hitCenter, velOf(t), p.def.guns.speed, p.aimAssistPt || (p.aimAssistPt = new THREE.Vector3()));
    }
  }

  updateTargeting(dt = 0) {
    const p = this.player;
    this.lead = null; this.lockTarget = null; this.ccip = null;
    if (!p || !p.alive) { if (this.lock) { this.lock.target = null; this.lock.locked = false; this.lock.t = 0; } return; }
    this.updateLock(p, dt);
    let best = null, bestAng = 0.8;
    for (const e of this.aircraft) {
      if (!e.alive || e.team === p.team) continue;
      _v.subVectors(e.pos, p.pos);
      const d = _v.length();
      if (d > 2200) continue;
      const ang = Math.acos(clamp(_v.divideScalar(d).dot(p.fwd), -1, 1));
      if (ang < bestAng) { bestAng = ang; best = e; }
    }
    // A radar lock takes priority for the lead indicator (ground targets included, so you can see where to lead a tank).
    if (this.lock && this.lock.locked) best = this.lock.target;
    this.lockTarget = best;
    if (best) {
      const bs = p.def.guns.speed;
      const out = new THREE.Vector3().copy(best.pos);
      let t = 0;
      for (let i = 0; i < 4; i++) {
        t = out.distanceTo(p.pos) / bs;
        out.copy(best.hitCenter).addScaledVector(velOf(best), t).addScaledVector(p.vel, -t);
        out.y += 0.5 * GRAVITY * t * t;
      }
      this.lead = out;
    }
    if (p.bombsLeft > 0) {
      const pos = _v.copy(p.pos), vel = _v2.copy(p.vel).addScaledVector(p.up, -3);
      const step = 0.05;
      for (let i = 0; i < 1000; i++) {
        vel.y -= GRAVITY * step;
        vel.multiplyScalar(1 - 0.012 * step);
        pos.addScaledVector(vel, step);
        const h = this.world.groundAt(pos.x, pos.z);
        if (pos.y <= h) { pos.y = h; this.ccip = pos.clone(); break; }
      }
    }
  }

  // Score/time based end conditions for battles.
  checkMatchEnd() {
    if (this.over) return;
    if (this.scoreLimit && (this.teamScore[0] >= this.scoreLimit || this.teamScore[1] >= this.scoreLimit)) {
      return this.finish(this.teamScore[0] >= this.scoreLimit ? 0 : 1, 'Score limit reached');
    }
    if (this.timeLimit && this.time >= this.timeLimit) {
      const w = this.teamScore[0] === this.teamScore[1] ? -1 : this.teamScore[0] > this.teamScore[1] ? 0 : 1;
      return this.finish(w, 'Time is up');
    }
  }

  finish(winner, reason) {
    if (this.over) return;
    this.over = true;
    this.streaks.endKillcam();
    if (this.onFinish) this.onFinish(winner, reason);
  }

  dispose() {
    this.disposed = true;
    this.over = true;
    this.timeScale = 1;
    for (const k of ['weather', 'events', 'conquest', 'lps', 'escort']) if (this[k] && this[k].dispose) this[k].dispose();
    this.aces.dispose();
    Medals.onUnlock = null;
    for (const a of [...this.aircraft]) { a.removed = true; this.scene.remove(a.mesh); }
    for (const g of [...this.groundUnits]) g.remove();
    this.aircraft.length = 0; this.groundUnits.length = 0; this.brains.length = 0; this.byId.clear();
    this.weapons.clear();
    this.scene.remove(this.weapons.tracers);
    this.effects.clear();
    this.audio.silence();
  }
}

export { TEAM_NAMES, GROUND };
