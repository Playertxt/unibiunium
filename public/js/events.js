// Dynamic mid-match events (run by whoever simulates the AI: single player or the multiplayer host):
//  ace     "Enemy ace inbound": a named rival joins the fight (aces.js)
//  convoy  "Convoy escaping": armoured supply trucks make a run for it; 90 s to stop them
//  rescue  "Downed pilot": hover-land beside them for 3 s before enemy trucks capture them
//  raid    "Bomber raid": heavy bombers with escort head for your base
import * as THREE from 'three';
import { SITES } from './world.js';
import { Medals } from './medals.js';

const rand = (a, b) => a + Math.random() * (b - a);
const MAP_R = 9500;

function isLand(w, x, z, flat = 0.88) {
  if (Math.hypot(x, z) > MAP_R) return false;
  if (w.heightAt(x, z) < 3 || w.isWater(x, z)) return false;
  return w.normalAt(x, z).y > flat;
}
function landPoint(w, cx, cz, rMin, rMax, flat) {
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(rMin, rMax);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (isLand(w, x, z, flat)) return { x, z };
  }
  return null;
}
function segOnLand(w, a, b) {
  for (let t = 0.1; t <= 1.0001; t += 0.1) if (!isLand(w, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.8)) return false;
  return true;
}
// A drivable route that heads roughly in direction `ang` from `start`.
function route(w, start, ang, legs = 6, len = 450) {
  const path = [start];
  let cur = start;
  for (let i = 0; i < legs; i++) {
    let next = null;
    for (let k = 0; k < 14 && !next; k++) {
      const a = ang + rand(-0.7, 0.7);
      const c = { x: cur.x + Math.cos(a) * len, z: cur.z + Math.sin(a) * len };
      if (isLand(w, c.x, c.z, 0.82) && segOnLand(w, cur, c)) next = c;
    }
    if (!next) break;
    path.push(next);
    cur = next;
  }
  return path;
}

export class EventDirector {
  constructor(game, opts = {}) {
    this.game = game;
    this.aces = opts.aces || null;
    this.kinds = opts.kinds || ['ace', 'convoy', 'rescue', 'raid'];
    this.timer = opts.first ?? rand(45, 70);
    this.gap = opts.gap || [65, 105];
    this.myTeam = opts.myTeam ?? 0;
    this.enemyTeam = opts.enemyTeam ?? 1;
    this.active = null;
    this.aceCount = 0;
    this.maxAces = opts.maxAces ?? 2;
    this.last = null;
  }

  update(dt) {
    const g = this.game;
    if (!g.authority || g.over) return;
    if (this.active) {
      const done = this.active.update(dt);
      g.event = done ? null : this.active.hud();
      if (done) { this.active = null; this.timer = rand(this.gap[0], this.gap[1]); }
      return;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = rand(this.gap[0], this.gap[1]);
    const opts = this.kinds.filter((k) => k !== this.last && (k !== 'ace' || (this.aces && this.aceCount < this.maxAces && this.aces.available().length)));
    if (!opts.length) return;
    this.start(opts[Math.floor(Math.random() * opts.length)]);
  }

  start(kind) {
    const g = this.game;
    this.last = kind;
    if (kind === 'ace') { if (this.aces.spawn()) this.aceCount++; return true; }
    const E = { convoy: ConvoyEvent, rescue: RescueEvent, raid: RaidEvent }[kind];
    if (!E) return false;
    const ev = new E(g, this);
    if (!ev.ok) return false;
    this.active = ev;
    g.event = ev.hud();
    g.audio.play('alert');
    return true;
  }

  onKill(victim, killerId) { if (this.active && this.active.onKill) this.active.onKill(victim, killerId); }

  dispose() { if (this.active && this.active.cleanup) this.active.cleanup(); this.active = null; }
}

// ---------- convoy ----------
class ConvoyEvent {
  constructor(g, dir) {
    this.g = g; this.dir = dir;
    const w = g.world;
    const p = g.player;
    const c = p ? p.pos : new THREE.Vector3();
    const start = landPoint(w, c.x, c.z, 1800, 3600, 0.9);
    if (!start) return;
    // Run away from the player, toward the map edge.
    const ang = Math.atan2(start.z - c.z, start.x - c.x);
    const path = route(w, start, ang, 7, 420);
    if (path.length < 3) return;
    this.units = [];
    const head = Math.atan2(-(path[1].x - start.x), -(path[1].z - start.z));
    const kinds = ['tank', 'truck', 'truck', 'truck', 'truck'];
    kinds.forEach((k, i) => {
      const back = i * 24;
      const u = g.spawnGround(k, dir.enemyTeam, start.x + Math.sin(head) * back, start.z + Math.cos(head) * back,
        { heading: head, path, objective: true, speedMul: k === 'truck' ? 0.64 : 1, hpMul: k === 'truck' ? 3 : 1 });
      u.eventTarget = true;
      if (k === 'truck') this.units.push(u);
    });
    this.end = g.time + 90;
    this.playerKills = 0;
    this.ok = true;
    g.message('CONVOY ESCAPING: 90 s to stop it', 4, '#e6cf9a');
    g.netUI('msg', { text: 'CONVOY ESCAPING: 90 s to stop it', color: '#e6cf9a', dur: 4 });
    g.radio('Command', 'Enemy supply convoy is making a break for it. Stop those trucks!', '#7fb4dd');
  }
  hud() { const alive = this.units.filter((u) => u.alive).length; return { title: 'CONVOY ESCAPING', jp: '輸送隊逃走', sub: `Trucks left ${alive}/${this.units.length}`, end: this.end, color: '#e6cf9a' }; }
  onKill(v, k) { if (this.units.includes(v) && k === this.g.playerId) this.playerKills++; }
  update() {
    const g = this.g;
    const alive = this.units.filter((u) => u.alive);
    if (!alive.length) {
      g.teamScore[this.dir.myTeam] += 300;
      g.message('Convoy stopped! +300', 3.5, '#a8d39a');
      g.netUI('msg', { text: 'Convoy stopped!', color: '#a8d39a', dur: 3.5 });
      if (this.playerKills) { g.awardBonus(200); Medals.unlock('convoy'); }
      return true;
    }
    if (g.time >= this.end) {
      for (const u of alive) g.removeEntity(u);
      g.teamScore[this.dir.enemyTeam] += 250;
      g.message('The convoy escaped', 3.5, '#e2574b');
      g.netUI('msg', { text: 'The convoy escaped', color: '#e2574b', dur: 3.5 });
      return true;
    }
    return false;
  }
  cleanup() {}
}

// ---------- downed pilot ----------
class RescueEvent {
  constructor(g, dir) {
    this.g = g; this.dir = dir;
    const w = g.world, p = g.player;
    const c = p ? p.pos : new THREE.Vector3();
    const spot = landPoint(w, c.x, c.z, 1600, 3800, 0.96);
    if (!spot) return;
    this.pilot = g.spawnGround('pilot', dir.myTeam, spot.x, spot.z, {});
    this.pilot.rescue = true;
    this.smoke = g.effects.addEmitter({ pos: this.pilot.pos.clone().add(new THREE.Vector3(-1, 1, 0)), type: 'smoke', rate: 7, size: 2.5, gray: 0.55, life: 140 });
    // Enemy trucks race to capture the pilot.
    this.hunters = [];
    const from = landPoint(w, spot.x, spot.z, 1400, 2200, 0.88);
    if (from) {
      const path = [from, { x: (from.x + spot.x) / 2, z: (from.z + spot.z) / 2 }, { x: spot.x, z: spot.z }];
      for (let i = 0; i < 2; i++) {
        const u = g.spawnGround('truck', dir.enemyTeam, from.x + i * 14, from.z + i * 14, { heading: Math.atan2(-(spot.x - from.x), -(spot.z - from.z)), path, speedMul: 0.55, objective: true });
        u.eventTarget = true;
        this.hunters.push(u);
      }
    }
    this.end = g.time + 120;
    this.hold = 0;
    this.ok = true;
    const txt = 'DOWNED PILOT: hover-land beside them to rescue';
    g.message(txt, 4.5, '#a8d39a');
    g.netUI('msg', { text: txt, color: '#a8d39a', dur: 4.5 });
    g.radio('Command', 'Friendly pilot down! Get there in hover mode (H), land next to the smoke and pick them up.', '#7fb4dd');
  }
  hud() {
    return { title: 'DOWNED PILOT', jp: '救助要請', sub: this.hold > 0 ? `Boarding… ${Math.round(this.hold / 3 * 100)}%` : 'Press H to hover, land within 60 m', end: this.end, color: '#a8d39a',
      x: this.pilot.pos.x, z: this.pilot.pos.z, progress: this.hold / 3 };
  }
  update(dt) {
    const g = this.g, pp = this.pilot.pos;
    let rescuer = null;
    for (const a of g.aircraft) {
      if (!a.human || a.team !== this.dir.myTeam || !a.landed) continue;
      if (Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < 60) { rescuer = a; break; }
    }
    if (rescuer) this.hold += dt; else this.hold = Math.max(0, this.hold - dt * 0.5);
    if (this.hold >= 3) {
      g.teamScore[this.dir.myTeam] += 250;
      const txt = `Pilot rescued by ${rescuer.name}! +250`;
      g.message(txt, 4, '#a8d39a');
      g.netUI('msg', { text: txt, color: '#a8d39a', dur: 4 });
      g.radio('Rescued pilot', 'Thanks for the lift! I owe you a drink back at base.', '#a8d39a');
      if (rescuer === g.player) { g.awardBonus(250); Medals.unlock('rescue'); Medals.inc('rescues'); }
      else g.netUI('rescued', { to: rescuer.id });
      this.cleanup();
      return true;
    }
    const captured = this.hunters.some((u) => u.alive && Math.hypot(u.pos.x - pp.x, u.pos.z - pp.z) < 30);
    if (captured || g.time >= this.end) {
      const txt = captured ? 'The downed pilot was captured' : 'Too late: the downed pilot was taken prisoner';
      g.message(txt, 3.5, '#e2574b');
      g.netUI('msg', { text: txt, color: '#e2574b', dur: 3.5 });
      this.cleanup();
      return true;
    }
    return false;
  }
  cleanup() {
    if (this.smoke) this.smoke.done = true;
    if (this.pilot && !this.pilot.removed) this.g.removeEntity(this.pilot);
    for (const u of this.hunters) if (u.alive) u.eventTarget = false;
  }
}

// ---------- bomber raid ----------
class RaidEvent {
  constructor(g, dir) {
    this.g = g; this.dir = dir;
    const mine = g.groundUnits.filter((u) => u.alive && u.team === dir.myTeam && u.objective && !u.def.passive);
    if (!mine.length) return;
    const tgt = mine.find((u) => u.kind === 'hq') || mine[0];
    const fromSite = dir.enemyTeam === 1 ? SITES.redAirfield : SITES.blueAirfield;
    this.bombers = [];
    for (let i = 0; i < 3; i++) {
      const pos = new THREE.Vector3(fromSite.x + (i - 1) * 300, 1700 + i * 60, fromSite.z + (dir.enemyTeam === 1 ? -1 : 1) * 1500);
      const heading = Math.atan2(-(tgt.pos.x - pos.x), -(tgt.pos.z - pos.z));
      const b = g.spawnAI('titan', dir.enemyTeam, pos, { heading, skill: 0.45, bombTarget: tgt, alt: 1600 });
      this.bombers.push(b);
    }
    for (let i = 0; i < 2; i++) g.spawnAI('falcon', dir.enemyTeam, new THREE.Vector3(fromSite.x + (i ? 500 : -500), 2100, fromSite.z), { skill: 0.5 });
    this.end = g.time + 170;
    this.ok = true;
    const txt = `BOMBER RAID: three bombers heading for your ${tgt.def.name}`;
    g.message(txt, 4, '#e2574b');
    g.netUI('msg', { text: txt, color: '#e2574b', dur: 4 });
    g.radio('Command', 'Heavy bombers inbound on our base. Intercept them!', '#7fb4dd');
  }
  hud() { return { title: 'BOMBER RAID', jp: '爆撃隊襲来', sub: `Bombers left ${this.bombers.filter((b) => b.alive).length}/3`, end: this.end, color: '#e2574b' }; }
  update() {
    const g = this.g;
    if (!this.bombers.some((b) => b.alive)) {
      g.teamScore[this.dir.myTeam] += 300;
      g.message('Bomber raid stopped! +300', 3.5, '#a8d39a');
      g.netUI('msg', { text: 'Bomber raid stopped!', color: '#a8d39a', dur: 3.5 });
      return true;
    }
    if (g.time >= this.end) return true;
    return false;
  }
}
