// WebSocket client (lobby) and in-match state synchronisation.
import * as THREE from 'three';
import { AIRCRAFT, GROUND, SCORE } from './config.js';
import { Aircraft } from './aircraft.js';
import { GroundUnit } from './ground.js';
import { PilotAI } from './ai.js';
import { BotManager, Reinforcements } from './battle.js';
import { Medals } from './medals.js';

export class Net {
  constructor() {
    this.ws = null;
    this.id = null;
    this.hostId = null;
    this.lobby = null;
    this.handlers = {};
    this.connected = false;
    this.name = 'Pilot';
  }

  get isHost() { return !!this.id && this.hostId === this.id; }
  get inRoom() { return !!this.lobby; }

  connect(name) {
    this.name = name;
    if (this.connected) { this.send({ t: 'hello', name }); return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
      let ws;
      try { ws = this.ws = new WebSocket(url); } catch (e) { reject(e); return; }
      const timer = setTimeout(() => reject(new Error('timeout')), 6000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'welcome') { this.id = m.id; this.connected = true; clearTimeout(timer); resolve(); }
        if (m.t === 'lobby') { this.lobby = m; this.hostId = m.host; }
        if (m.t === 'joined') { this.hostId = m.host; }
        if (m.t === 'host') this.hostId = m.id;
        if (m.t === 'left') this.lobby = null;
        this.emit(m.t, m);
        this.emit('*', m);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        const was = this.connected;
        this.connected = false; this.lobby = null; this.id = null;
        if (!was) reject(new Error('closed'));
        this.emit('close', {});
      };
      ws.onerror = () => {};
    });
  }

  on(t, fn) { (this.handlers[t] ||= new Set()).add(fn); return () => this.handlers[t].delete(fn); }
  emit(t, m) { const h = this.handlers[t]; if (h) for (const fn of [...h]) fn(m); }
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
}

const r1 = (x) => Math.round(x * 10) / 10;

// Attaches multiplayer behaviour to a running Game.
export class MPSync {
  constructor(game, net, settings, players) {
    this.game = game;
    this.net = net;
    this.settings = settings;
    this.players = players;
    this.stTimer = 0; this.aiTimer = 0; this.scoreTimer = 0;
    this.lastSeen = new Map();
    this.unsub = [];
    const on = (t, fn) => this.unsub.push(net.on(t, fn));
    on('st', (m) => this.onState(m));
    on('ai', (m) => this.onAI(m));
    on('hit', (m) => this.onHit(m));
    on('kill', (m) => this.onKill(m));
    on('ev', (m) => this.onEvent(m));
    on('score', (m) => this.onScore(m));
    on('pleft', (m) => this.onLeft(m));
    on('pjoin', (m) => game.message(`${m.player.name} joined the battle`, 3, '#7fb4dd'));
    on('host', (m) => { if (m.id === net.id) this.becomeHost(); });
    on('chat', (m) => game.hud.chat(m.name, m.text, m.team));
    game.onCrash = (ac) => { if (ac.local) net.send({ t: 'ev', k: 'crash', id: ac.id, p: [r1(ac.pos.x), r1(ac.pos.y), r1(ac.pos.z)] }); };
  }

  teamFor(id, team) {
    if (this.settings.mode === 'ffa') return 1000 + (parseInt(String(id).replace(/\D/g, ''), 10) || 0);
    if (this.settings.mode === 'coop') return 0;
    return team;
  }

  dispose() { this.unsub.forEach((u) => u()); }

  ensurePlayerPuppet(m) {
    const g = this.game;
    let e = g.byId.get(m.from);
    if (e && (e.removed || (e.life !== undefined && e.life !== m.l))) {
      if (!e.removed) { e.removed = true; g.scene.remove(e.mesh); g.removeEntity(e); }
      e = null;
    }
    if (!e) {
      if (m.a === 0) return null;
      const team = m.tm;
      e = new Aircraft(g, { id: m.from, kind: AIRCRAFT[m.k] ? m.k : 'falcon', team, name: m.n, pos: new THREE.Vector3(...m.p),
        quat: new THREE.Quaternion(...m.q), skin: g.skinFor(team), local: false, human: true });
      e.life = m.l;
      g.addEntity(e);
      g.addScore(m.from, m.n, team, false);
    }
    return e;
  }

  onState(m) {
    const e = this.ensurePlayerPuppet(m);
    this.lastSeen.set(m.from, performance.now());
    if (e) e.applyNetState(m);
  }

  onAI(m) {
    const g = this.game;
    if (this.net.isHost) return;
    const now = performance.now();
    for (const s of m.a || []) {
      // [id, kind, team, name, state]
      let e = g.byId.get(s[0]);
      if (!e) {
        if (!s[4].a) continue;
        // s[5]: custom livery key (enemy aces), s[6]: ace id
        e = new Aircraft(g, { id: s[0], kind: s[1], team: s[2], name: s[3], pos: new THREE.Vector3(...s[4].p), quat: new THREE.Quaternion(...s[4].q), skin: typeof s[5] === 'string' ? s[5] : g.skinFor(s[2]), local: false });
        e.isBot = true;
        if (s[6]) e.aceId = s[6];
        g.addEntity(e);
        g.addScore(e.id, e.name, e.team, true);
      }
      if (!e.local) e.applyNetState(s[4]);
      this.lastSeen.set(s[0], now);
    }
    for (const s of m.g || []) {
      // [...netState, kind, team, objective]
      let u = g.byId.get(s[0]);
      if (!u) {
        u = new GroundUnit(g, { id: s[0], kind: s[9], team: s[10], x: s[1], z: s[2], heading: s[3], local: false, skin: g.skinFor(s[10]), objective: !!s[11] });
        u.maxHp = Math.max(u.maxHp, s[6]);
        u.hp = s[6];
        g.addEntity(u);
        if (!s[7]) u.netKill();
      }
      if (!u.local) u.applyNetState(s);
    }
    // Remove AI aircraft the host no longer reports.
    for (const a of [...g.aircraft]) {
      if (a.local || a.human || a.removed) continue;
      const seen = this.lastSeen.get(a.id) || now;
      if (now - seen > 2500) { a.remove(); }
    }
  }

  onHit(m) {
    const e = this.game.byId.get(m.id);
    if (e && e.local && e.alive) { this.game.recordHit(e, m.by, { weapon: m.w, explosive: !!m.x, blast: m.bl }); e.damage(m.d, m.by); }
  }

  onKill(m) {
    const g = this.game;
    const e = g.byId.get(m.v);
    if (e && !e.local) e.netKill();
    const victim = e || { id: m.v, type: m.vt, team: m.vteam, name: m.vn, kind: m.kind, human: m.human, def: m.vt === 'air' ? AIRCRAFT[m.kind] : GROUND[m.kind] };
    if (!victim.def) victim.def = { name: m.vn, score: 50 };
    if (m.ace) victim.aceId = m.ace;
    if (m.vip) victim.vip = true;
    if (m.kn && !g.scores.has(m.k)) g.addScore(m.k, m.kn, g.teamOf(m.k), false);
    g.addFeed(m.k, victim, m.r);
    let pts = 0;
    if (this.net.isHost) {
      pts = g.credit(m.k, victim);
      if (victim.type === 'air') { const s = g.scores.get(m.v); if (s) s.deaths++; }
    }
    if (m.k === g.playerId && m.v !== g.playerId) g.onPlayerKill(victim, pts || g.pointsFor(victim), { weapon: m.w, gunsOnly: !!m.go, blast: m.bl });
    g.killHooks(victim, m.k);
  }

  onEvent(m) {
    const g = this.game;
    const src = g.byId.get(m.id);
    if (m.k === 'crash') { if (src && !src.local) { src.pos.set(...m.p); src.crash(); } return; }
    if (m.k === 'ui') return this.onUI(m);
    const pos = new THREE.Vector3(...m.p), vel = new THREE.Vector3(...m.v);
    const team = src ? src.team : -1, skin = src ? src.skin : 1;
    if (m.k === 'bomb') {
      const def = src ? src.def.bombs : null;
      const target = m.tg ? g.byId.get(m.tg) || null : null;
      g.weapons.dropBomb({ pos, vel, owner: m.id, team, power: def ? def.power : 1, visual: true, skin, quat: src ? src.quat : undefined, scale: def && def.power > 1.2 ? 1.25 : 1,
        target, guide: target ? m.tr || 20 : 0 });
      if (src && src.parts.bombs.length) { const b = src.parts.bombs.find((x) => x.visible); if (b) b.visible = false; }
    } else if (m.k === 'missile') {
      const target = m.tg ? g.byId.get(m.tg) || null : null;
      g.weapons.fireMissile({ pos, vel, owner: m.id, team, visual: true, skin, target, seeker: m.sk || 'ir' });
    } else if (m.k === 'flare' || m.k === 'chaff') {
      const n = 3;
      for (let i = 0; i < n; i++) g.weapons.dropDecoy(m.k, pos, vel, team, m.id, true);
    } else if (m.k === 'rocket') {
      const target = m.tg ? g.byId.get(m.tg) || null : null;
      g.weapons.fireRocket({ pos, vel, owner: m.id, team, visual: true, skin, target, turn: target ? m.tr || 2 : 0 });
    }
  }

  // Host-mirrored UI: messages, radio calls, medals for remote players, bonus points from clients.
  onUI(m) {
    const g = this.game, me = this.net.id;
    switch (m.u) {
      case 'msg': g.message(m.text, m.dur || 3, m.color || '#ffffff'); break;
      case 'radio': g.radio(m.n, m.x, m.c, false); break;
      case 'rescued': if (m.to === me) { Medals.unlock('rescue'); Medals.inc('rescues'); g.awardBonus(250); } break;
      case 'captured': if (m.to === me) { Medals.unlock('capture'); g.awardBonus(200); } break;
      case 'bonus': if (this.net.isHost && m.id) g.creditBonus(m.id, m.pts | 0); break;
      default: break;
    }
  }

  onScore(m) {
    const g = this.game;
    if (this.net.isHost) return;
    g.teamScore = m.ts;
    if (g.conquest && m.cp) g.conquest.apply(m.cp);
    g.event = m.ev || null;
    if (g.lps && m.lp != null) g.lps.remoteAlive = m.lp;
    if (g.escort && m.vip) g.escort.vipId = m.vip;
    for (const s of m.s) {
      const cur = g.scores.get(s.id) || g.addScore(s.id, s.name, s.team, s.bot);
      Object.assign(cur, s);
    }
    if (Math.abs(g.time - m.time) > 2) g.time = m.time;
  }

  onLeft(m) {
    const g = this.game;
    const e = g.byId.get(m.id);
    if (e) { e.remove(); }
    g.message(`${m.name} left the battle`, 3, '#9aa7b4');
    if (g.lps && g.lps.participants.has(m.id)) g.lps.onKill({ type: 'air', id: m.id, name: m.name });
  }

  becomeHost() {
    const g = this.game;
    g.authority = true;
    g.message('You are now the host', 3, '#e6cf9a');
    for (const a of g.aircraft) {
      if (a.human || a.local) continue;
      a.local = true;
      a.ammo = 1e9;
      a.vel.copy(a.interp.buf.length ? a.interp.buf[a.interp.buf.length - 1].data.vel : a.vel);
      g.brains.push(new PilotAI(g, a, {}));
    }
    for (const u of g.groundUnits) u.local = true;
    if (this.onBecomeHost) this.onBecomeHost();
  }

  update(dt) {
    const g = this.game, net = this.net;
    this.stTimer -= dt;
    if (this.stTimer <= 0) {
      this.stTimer = 0.05;
      const p = g.player || g.wreck; // keep reporting a falling wreck until the respawn
      if (p && !p.removed) net.send({ t: 'st', ...p.netState(), k: p.kind, tm: p.team, n: p.name, l: g.life });
    }
    if (!net.isHost) {
      const now = performance.now();
      for (const a of [...g.aircraft]) {
        if (!a.human || a.local) continue;
        if (now - (this.lastSeen.get(a.id) || now) > 6000) a.remove();
      }
      return;
    }
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = 0.1;
      const a = [], gr = [];
      for (const ac of g.aircraft) if (ac.local && !ac.human && !ac.removed) a.push([ac.id, ac.kind, ac.team, ac.name, ac.netState(), typeof ac.skin === 'string' ? ac.skin : 0, ac.aceId || 0]);
      for (const u of g.groundUnits) { const s = u.netState(); s.push(u.kind, u.team, u.objective ? 1 : 0); gr.push(s); }
      net.send({ t: 'ai', a, g: gr });
    }
    this.scoreTimer -= dt;
    if (this.scoreTimer <= 0) {
      this.scoreTimer = 1;
      net.send({ t: 'score', ts: g.teamScore, s: [...g.scores.values()], time: Math.round(g.time),
        cp: g.conquest ? g.conquest.state() : undefined, ev: g.event || null, lp: g.lps ? g.lps.alive : undefined, vip: g.escort ? g.escort.vipId : undefined });
    }
    g.checkMatchEnd();
  }
}

export { SCORE, BotManager, Reinforcements };
