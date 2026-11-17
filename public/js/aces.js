// Enemy aces: named AI rivals with their own livery and personality. They taunt you over the radio, bail out
// when shot down and come back for revenge in later matches. Their records against you are saved in the browser.
import * as THREE from 'three';
import { PAINTS } from './models.js';
import { Medals } from './medals.js';
import { clamp } from './config.js';

const KEY = 'unbiunium.aces.v1';

export const ACES = {
  kaiser: {
    name: 'Kaiser', full: 'Major Volk "Kaiser" Reinholt', jp: '皇帝', plane: 'viper', personality: 'aggressive', skill: 0.92, color: '#ff6a4d',
    style: 'Aggressive', desc: 'Charges straight at you, boosts into the merge and never breaks off. Out-turn him or out-wait him.',
    paint: { camo: ['#7a1414', '#4a0b0b', '#a32020', '#1a1a1a'], accent: 0xffc93a, seed: 51, red: true, rough: 0.35 },
    lines: {
      intro: ['This is Kaiser. Your sky belongs to me now.', 'Kaiser on station. Turn and fight, {name}!', 'Hope you said goodbye to your ground crew, {name}.'],
      revenge: ['Remember me, {name}? I have thought about you every night since.', 'Kaiser is back. You got lucky last time, and luck runs out.', 'New jet, same grudge. Let us finish this.'],
      hit: ['Feel that? There is more coming!', 'Too slow, {name}, far too slow!', 'Ha! Right through the wing!'],
      kill: ['Down you go! Kaiser stays undefeated.', 'Tell your squadron Kaiser sends his regards.', 'Another mark for my tail fin.'],
      hurt: ['A scratch! You will pay for that!', 'Lucky shot. It will not happen twice!'],
      bail: ['I am hit, ejecting! This is not over, {name}!', 'Punching out! I will be back for you!', 'You will see me again. Count on it.'],
    },
  },
  hailstorm: {
    name: 'Hailstorm', full: 'Captain Ilsa "Hailstorm" Varga', jp: '雹嵐', plane: 'vortex', personality: 'missile', skill: 0.82, color: '#8fd0ff',
    style: 'Missile specialist', desc: 'Keeps her distance and fires heat-seekers from long range. Drops flares against your homing rockets. Flare her missiles and close in.',
    paint: { camo: ['#dfe6ee', '#b8c6d4', '#f4f7fa', '#8fa3b8'], accent: 0x2f9dff, seed: 77, red: true, rough: 0.3 },
    lines: {
      intro: ['Hailstorm here. I have your heat signature, {name}.', 'Fox two, fox two. You will hear that a lot today.', 'Forecast for your sector: heavy hail.'],
      revenge: ['We meet again. I brought more missiles this time.', 'I studied your flying, {name}. Every flare, every break turn.'],
      hit: ['Direct hit. Splash imminent.', 'You cannot outrun a seeker, {name}.'],
      kill: ['Splash one. Skies are clearing.', 'Weather report: you lost.'],
      hurt: ['Airframe damage. Recalculating.', 'Annoying. Very annoying.'],
      bail: ['Ejecting! Mark my words, {name}: next time I will not miss.', 'My jet is gone. My memory is not.'],
    },
  },
  wisp: {
    name: 'Wisp', full: 'Lieutenant Sorin "Wisp" Kade', jp: '鬼火', plane: 'wraith', personality: 'clouds', skill: 0.85, color: '#c7a6ff',
    style: 'Cloud ambusher', desc: 'Flies a stealth jet and lurks inside clouds, then strikes when you look away. Radar and HUD can\'t see into a cloud.',
    paint: { camo: ['#3b3448', '#2a2433', '#4d4560', '#1c1822'], accent: 0xb48cff, seed: 93, red: true, stealth: 0x2c2636, rough: 0.6 },
    lines: {
      intro: ['You will not see me, {name}. Nobody ever does.', 'So many clouds today. I could be in any of them.', '...'],
      revenge: ['Did you think the clouds forgot you, {name}?', 'I have been waiting in the white. Patiently.'],
      hit: ['Behind you. Always behind you.', 'Boo.'],
      kill: ['You never saw me. They never do.', 'Back into the mist.'],
      hurt: ['You found me. Clever.', 'Time to disappear.'],
      bail: ['Ejecting. The clouds will hide me, and I will find you again.', 'This is not goodbye, {name}. Just fog.'],
    },
  },
};
export const ACE_ORDER = ['kaiser', 'hailstorm', 'wisp'];
for (const id of ACE_ORDER) PAINTS[`ace:${id}`] = ACES[id].paint;

// Persistent rivalry records: wins = times the ace shot you down, losses = times you shot the ace down.
export const AceRecords = {
  data: {},
  load() {
    try { this.data = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { this.data = {}; }
    for (const id of ACE_ORDER) this.data[id] = { wins: 0, losses: 0, met: 0, last: null, ...(this.data[id] || {}) };
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  get(id) { if (!this.data[id]) this.load(); return this.data[id]; },
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Per-match ace manager: spawns aces, voices their taunts and tracks bailouts.
export class AceDirector {
  constructor(game) {
    this.game = game;
    this.spawned = new Set();
    this.chutes = [];
    this.cool = {};
    if (!Object.keys(AceRecords.data).length) AceRecords.load();
  }

  available() { return ACE_ORDER.filter((id) => !this.spawned.has(id)); }

  // A grudge-holding ace (one you shot down last time) comes back first.
  choose() {
    const av = this.available();
    if (!av.length) return null;
    const grudge = av.filter((id) => AceRecords.get(id).last === 'bailed');
    if (grudge.length) return pick(grudge);
    return av.sort((a, b) => AceRecords.get(a).met - AceRecords.get(b).met)[0];
  }

  spawn(id = this.choose()) {
    const g = this.game;
    if (!id || this.spawned.has(id)) return null;
    const A = ACES[id], rec = AceRecords.get(id);
    this.spawned.add(id);
    const team = g.aceTeam ?? 1;
    const p = g.player;
    const from = p ? p.pos : new THREE.Vector3(0, 1500, 0);
    const ang = Math.random() * Math.PI * 2;
    const pos = new THREE.Vector3(from.x + Math.cos(ang) * 5200, 1900 + Math.random() * 500, from.z + Math.sin(ang) * 5200);
    pos.y = Math.max(pos.y, g.world.groundAt(pos.x, pos.z) + 900);
    const heading = Math.atan2(-(from.x - pos.x), -(from.z - pos.z));
    const revenge = rec.last === 'bailed';
    // Each defeat makes the ace a little sharper next time.
    const skill = clamp(A.skill + Math.min(0.08, rec.losses * 0.02), 0, 1);
    const ac = g.spawnAI(A.plane, team, pos, { heading, skill, name: `"${A.name}"`, personality: A.personality, skin: `ace:${id}` });
    ac.aceId = id;
    ac.dmgMul = 0.78; // aces' jets are tougher
    ac.missiles = A.personality === 'missile' ? 10 : 2;
    rec.met++;
    AceRecords.save();
    g.netUI('msg', { text: `Enemy ace inbound: ${A.full}`, color: A.color, dur: 4.5 });
    g.message(`ENEMY ACE INBOUND: ${A.full}`, 4.5, A.color);
    this.say(id, revenge ? 'revenge' : 'intro', true);
    g.audio.play('alert');
    return ac;
  }

  say(id, kind, force = false) {
    const g = this.game, A = ACES[id];
    if (!A) return;
    const now = g.time;
    if (!force && (this.cool[id] || 0) > now) return;
    this.cool[id] = now + 9;
    const text = pick(A.lines[kind] || A.lines.intro).replace(/\{name\}/g, g.playerName || 'Pilot');
    g.radio(`"${A.name}"`, text, A.color);
  }

  // Called by the game for every kill.
  onKill(victim, killerId) {
    const g = this.game;
    if (victim.type === 'air' && victim.aceId) {
      const id = victim.aceId, rec = AceRecords.get(id);
      this.say(id, 'bail', true);
      this.chute(victim);
      rec.last = 'bailed';
      if (killerId && killerId === g.playerId) {
        rec.losses++;
        Medals.unlock('ace_any');
        Medals.unlock(`ace_${id}`);
        g.message(`ACE DOWN: ${ACES[id].full}`, 4, '#e6cf9a');
      }
      AceRecords.save();
    }
    if (victim === g.player || victim.id === g.playerId) {
      const k = g.byId.get(killerId);
      if (k && k.aceId) { AceRecords.get(k.aceId).wins++; AceRecords.save(); this.say(k.aceId, 'kill', true); }
    }
  }

  onPlayerHit(attackerId) {
    const a = this.game.byId.get(attackerId);
    if (a && a.aceId && Math.random() < 0.35) this.say(a.aceId, 'hit');
  }

  onAceDamaged(ac) {
    if (!ac.hurtSaid && ac.hp < ac.maxHp * 0.5) { ac.hurtSaid = true; this.say(ac.aceId, 'hurt', true); }
  }

  // Bailout: the canopy blows and a parachute drifts down where the jet was hit.
  chute(ac) {
    const g = this.game;
    const grp = new THREE.Group();
    const accent = ACES[ac.aceId] ? ACES[ac.aceId].paint.accent : 0xffffff;
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(4, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.8, side: THREE.DoubleSide }));
    canopy.position.y = 7;
    const lines = new THREE.Mesh(new THREE.ConeGeometry(4, 6.5, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xdddddd, wireframe: true, transparent: true, opacity: 0.5 }));
    lines.position.y = 3.6; lines.rotation.x = Math.PI;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x4a4a3a }));
    grp.add(canopy, lines, body);
    grp.position.copy(ac.pos).add(new THREE.Vector3(0, 6, 0));
    g.scene.add(grp);
    this.chutes.push({ grp, vel: new THREE.Vector3(ac.vel.x * 0.02, -5.5, ac.vel.z * 0.02), t: 0 });
  }

  update(dt) {
    const g = this.game;
    for (let i = this.chutes.length - 1; i >= 0; i--) {
      const c = this.chutes[i];
      c.t += dt;
      c.grp.position.addScaledVector(c.vel, dt);
      c.grp.rotation.y += dt * 0.4;
      c.grp.rotation.z = Math.sin(c.t * 1.3) * 0.08;
      const h = g.world.groundAt(c.grp.position.x, c.grp.position.z);
      if (c.grp.position.y < h + 0.7 || c.t > 90) { this.removeChute(c); this.chutes.splice(i, 1); }
    }
  }

  removeChute(c) {
    this.game.scene.remove(c.grp);
    c.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }

  dispose() { for (const c of this.chutes) this.removeChute(c); this.chutes.length = 0; }
}
