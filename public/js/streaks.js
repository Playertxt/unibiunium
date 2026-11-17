// Kill streaks and combo feedback: multi-kill callouts with score multipliers (including several kills from one
// bomb), streak rewards (3: AI wingman, 5: airstrike, 7: UBU overcharge) and a slow-motion kill-cam on big kills.
import * as THREE from 'three';
import { Settings, clamp } from './config.js';
import { Medals } from './medals.js';

const MULTI = { 2: ['DOUBLE KILL', '二連撃'], 3: ['TRIPLE KILL', '三連撃'], 4: ['QUAD KILL', '四連撃'], 5: ['RAMPAGE', '殲滅'] };
const BIG = new Set(['hq', 'ship', 'hangar', 'depot']);
const WING_NAMES = ['Talon', 'Rook', 'Saber', 'Ghost', 'Lark', 'Nomad'];
const WING_PLANES = ['falcon', 'kestrel', 'viper', 'vortex', 'corvid'];
const _v = new THREE.Vector3();

export class Streaks {
  constructor(game) {
    this.game = game;
    this.streak = 0;
    this.best = 0;
    this.chain = 0;
    this.chainT = -99;
    this.blasts = new Map();
    this.strikes = [];
    this.flybys = [];
    this.killcam = null;
    this.wingIdx = Math.floor(Math.random() * WING_NAMES.length);
  }

  onDeath() { this.streak = 0; this.chain = 0; this.endKillcam(); }

  onKill(victim, pts, info = {}) {
    const g = this.game;
    this.streak++;
    this.best = Math.max(this.best, this.streak);
    const now = g.time;
    this.chain = now - this.chainT < 4 ? this.chain + 1 : 1;
    this.chainT = now;
    let blastN = 1;
    if (info.blast) { blastN = (this.blasts.get(info.blast) || 0) + 1; this.blasts.set(info.blast, blastN); }
    if (this.blasts.size > 64) this.blasts.clear();
    let bonus = 0, mul = 1;
    if (this.chain >= 2) { mul += 0.25 * (this.chain - 1); }
    if (blastN >= 2) { mul += 0.5 * (blastN - 1); }
    bonus = Math.round(pts * (mul - 1));
    if (this.chain >= 2 || blastN >= 2) {
      const n = Math.min(5, Math.max(this.chain, blastN));
      const [en, jp] = MULTI[n];
      const label = blastN >= 2 ? `${en} · ${info.weapon === 'rocket' ? 'ONE ROCKET' : info.weapon === 'strike' ? 'AIRSTRIKE' : 'ONE BOMB'}` : en;
      g.hud.combo(label, jp, `×${mul.toFixed(2)}   +${bonus}`);
      g.audio.play('combo', null, Math.min(1, 0.6 + n * 0.1));
      if (this.chain >= 2 || blastN >= 2) Medals.unlock('double_kill');
      if (this.chain >= 3) Medals.unlock('triple_kill');
      if (blastN >= 3 && (info.weapon === 'bomb' || info.weapon === 'rocket')) Medals.unlock('one_bomb');
    }
    if (bonus > 0) g.awardBonus(bonus);
    if (info.weapon === 'strike') Medals.unlock('airstrike');
    this.reward();
    const big = victim.aceId || victim.vip || (victim.def && victim.def.model === 'bomber') || BIG.has(victim.kind) || Math.max(this.chain, blastN) >= 3;
    if (big) this.startKillcam(victim);
  }

  reward() {
    const g = this.game, s = this.streak;
    if (s >= 2) g.hud.streak(s);
    if (s === 3) this.callWingman();
    else if (s === 5) { Medals.unlock('streak_5'); this.callAirstrike(); }
    else if (s === 7) this.overcharge();
    else if (s >= 10 && s % 5 === 0) { if (s === 10) Medals.unlock('streak_10'); this.callAirstrike(); }
  }

  // ---------- rewards ----------
  callWingman() {
    const g = this.game, p = g.player;
    if (!p || !p.alive) return;
    // Only the simulation owner can add AI aircraft; elsewhere the reward is a field repair and rearm.
    if (!g.authority) { p.hp = p.maxHp; p.rearm(); g.hud.reward('3 KILL STREAK', 'Field repair and rearm'); return; }
    const alive = g.aircraft.filter((a) => a.alive && a.ai && a.ai.leader === p).length;
    if (alive >= 2) { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5); g.hud.reward('3 KILL STREAK', 'Wingmen already up: hull repaired'); return; }
    const name = WING_NAMES[this.wingIdx++ % WING_NAMES.length];
    const kind = WING_PLANES[Math.floor(Math.random() * WING_PLANES.length)];
    const pos = _v.copy(p.pos).addScaledVector(p.right, 140).addScaledVector(p.fwd, -260).add(new THREE.Vector3(0, 40, 0)).clone();
    const ac = g.spawnAI(kind, p.team, pos, { heading: Math.atan2(-p.fwd.x, -p.fwd.z), skill: 0.72, name, role: 'wingman', leader: p, speed: p.speed });
    ac.wingman = true;
    g.hud.reward('3 KILL STREAK', `Wingman ${name} joins you`);
    g.radio(name, ['On your wing, lead. Point me at them.', 'Wingman checking in. I have your six.', 'Formed up. Let\'s go hunting.'][Math.floor(Math.random() * 3)], '#a8d39a');
    g.audio.play('reward');
  }

  callAirstrike() {
    const g = this.game, p = g.player;
    if (!p || !p.alive) return;
    let at = null;
    const lt = g.lock && g.lock.locked && g.lock.target;
    if (lt && lt.type === 'ground' && lt.alive) at = lt.pos.clone();
    if (!at) {
      let best = null, bs = Infinity;
      for (const u of g.groundUnits) {
        if (!u.alive || u.team === p.team || u.def.passive) continue;
        _v.subVectors(u.pos, p.pos);
        const d = _v.length();
        if (d > 6000) continue;
        const s = d * (1.8 - _v.divideScalar(d).dot(p.fwd)) * (u.objective ? 0.7 : 1);
        if (s < bs) { bs = s; best = u; }
      }
      if (best) at = best.pos.clone();
    }
    if (!at && g.ccip) at = g.ccip.clone();
    if (!at) { at = _v.copy(p.pos).addScaledVector(_v.set(p.fwd.x, 0, p.fwd.z).normalize(), 1500).clone(); }
    at.y = g.world.groundAt(at.x, at.z);
    const dir = new THREE.Vector3(p.fwd.x, 0, p.fwd.z);
    if (dir.lengthSq() < 1e-3) dir.set(0, 0, -1);
    dir.normalize();
    const id = `strike${Math.random()}`;
    this.strikes.push({ at, dir, t: 4.2, n: 0, id });
    g.strikeMark = { pos: at, until: g.time + 6.5 };
    g.hud.reward('5 KILL STREAK', 'Airstrike inbound on the marked target');
    g.radio('Hammer flight', 'Hammer flight, rolling in hot. Keep clear of the red circle.', '#e6cf9a');
    g.audio.play('reward');
    // A pair of friendly jets makes the run (cosmetic, but real aircraft that can be shot at).
    if (g.authority) for (const side of [-1, 1]) {
      const start = at.clone().addScaledVector(dir, -1300).add(new THREE.Vector3(-dir.z * side * 45, 0, dir.x * side * 45));
      start.y = Math.max(at.y, g.world.groundAt(start.x, start.z)) + 340;
      const ac = g.spawnAI('falcon', p.team, start, { heading: Math.atan2(-dir.x, -dir.z), skill: 0.8, name: 'Hammer', role: 'flyby', flyDir: dir, speed: 300 });
      this.flybys.push({ ac, until: g.time + 14 });
    }
  }

  overcharge() {
    const g = this.game, p = g.player;
    if (!p || !p.alive) return;
    p.overcharge = 12;
    p.ammo = Math.max(p.ammo, p.def.guns.ammo);
    Medals.unlock('overcharge');
    g.hud.reward('7 KILL STREAK', 'UBU OVERCHARGE: homing armour-piercing plasma, free boost');
    g.message('UBU OVERCHARGE', 3, '#6af2ff');
    g.audio.play('overcharge');
  }

  // ---------- kill-cam ----------
  startKillcam(victim) {
    const g = this.game;
    if (!Settings.data.killcam || g.net || !g.player || this.killcam) return;
    this.killcam = { pos: victim.pos, r: (victim.radius || 8) * 3.2 + 30, t: 0, dur: 1.9, ang: Math.random() * Math.PI * 2 };
    g.timeScale = 0.28;
  }

  endKillcam() { if (this.killcam) { this.killcam = null; this.game.timeScale = 1; } }

  // realDt: wall-clock frame time (the kill-cam runs in real time while the world is slowed down).
  update(realDt, dt) {
    const g = this.game;
    const kc = this.killcam;
    if (kc) {
      kc.t += realDt;
      kc.ang += realDt * 0.7;
      if (kc.t >= kc.dur || !g.player) this.endKillcam();
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t -= dt;
      if (s.t > 0) continue;
      // Carpet of bombs along the run direction, one every 0.16 s.
      while (s.t <= 0 && s.n < 9) {
        const off = (s.n - 4) * 24;
        const p = s.at.clone().addScaledVector(s.dir, off);
        p.x += (Math.random() - 0.5) * 14; p.z += (Math.random() - 0.5) * 14;
        p.y = g.world.groundAt(p.x, p.z);
        g.effects.explosion(p, 1.8, { water: g.world.isWater(p.x, p.z) });
        g.audio.play('bomb', p);
        g.shake(p, 1.6);
        g.areaDamage(p, 36, 560, g.playerId, g.playerTeam, { pen: 3, explosive: true, weapon: 'strike', blast: s.id });
        s.n++;
        s.t += 0.16;
      }
      if (s.n >= 9) this.strikes.splice(i, 1);
    }
    for (let i = this.flybys.length - 1; i >= 0; i--) {
      const f = this.flybys[i];
      if (!f.ac.alive || f.ac.removed) { this.flybys.splice(i, 1); continue; }
      if (g.time > f.until) { f.ac.remove(); this.flybys.splice(i, 1); }
    }
  }

  // Kill-cam camera: orbit the victim in slow motion.
  camera(cam, out) {
    const kc = this.killcam;
    const p = kc.pos;
    out.set(p.x + Math.sin(kc.ang) * kc.r, p.y + kc.r * 0.35, p.z + Math.cos(kc.ang) * kc.r);
    const gy = this.game.world.groundAt(out.x, out.z) + 4;
    if (out.y < gy) out.y = gy;
    cam.position.copy(out);
    cam.up.set(0, 1, 0);
    cam.lookAt(p);
    return clamp(kc.t / 0.25, 0, 1) * clamp((kc.dur - kc.t) / 0.25, 0, 1);
  }
}
