// Extra game modes:
//  Conquest            capture airfields and forward airstrips by hover-landing on them; owned fields tick points
//  Last Pilot Standing every pilot for themselves, no respawns, and the safe zone keeps shrinking
//  Bomber Escort       one side escorts a Titan to bomb the enemy HQ, the other side has to shoot it down
import * as THREE from 'three';
import { SITES } from './world.js';
import { RNG } from './noise.js';
import { TEAM_NAMES, clamp } from './config.js';
import { Medals } from './medals.js';

const OWNER_HEX = { '-1': 0xd8d4cc, 0: 0x4aa3ff, 1: 0xff5050 };
const CAP_R = 150;     // capture radius (m)
const CAP_T = 5;       // seconds of landing to take a neutral field (twice that to flip an enemy one)

function flatSpot(w, x, z) {
  for (let r = 0; r <= 1800; r += 120) {
    for (let k = 0; k < (r ? 14 : 1); k++) {
      const a = (k / 14) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (w.heightAt(px, pz) > 3 && !w.isWater(px, pz) && w.normalAt(px, pz).y > 0.95) return { x: px, z: pz };
    }
  }
  return null;
}

// ---------- Conquest ----------
export class Conquest {
  constructor(game, opts = {}) {
    this.g = game;
    this.rate = opts.rate ?? 4;
    this.tick = 2;
    const w = game.world;
    const defs = [
      { id: 'A', name: 'Blue Airfield', x: SITES.blueAirfield.x, z: SITES.blueAirfield.z, owner: 0, field: true },
      { id: 'B', name: 'West Airstrip', x: -2800, z: 300 },
      { id: 'C', name: 'Central Airstrip', x: 0, z: 0 },
      { id: 'D', name: 'East Airstrip', x: 2800, z: -300 },
      { id: 'E', name: 'Red Airfield', x: SITES.redAirfield.x, z: SITES.redAirfield.z, owner: 1, field: true },
    ];
    const towns = SITES.towns.slice();
    this.points = defs.map((d) => {
      let s = d.field ? { x: d.x, z: d.z } : flatSpot(w, d.x, d.z);
      if (!s) { const t = towns.shift(); s = { x: t.x, z: t.z }; }
      const owner = d.owner ?? -1;
      const p = { id: d.id, name: d.name, x: s.x, z: s.z, y: w.groundAt(s.x, s.z), owner, prog: owner === 0 ? 1 : owner === 1 ? -1 : 0, shown: null, field: !!d.field };
      this.build(p);
      return p;
    });
    game.conquest = this;
  }

  build(p) {
    const g = this.g, w = g.world;
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: OWNER_HEX[p.owner], toneMapped: false });
    const beam = new THREE.MeshBasicMaterial({ color: OWNER_HEX[p.owner], transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    if (!p.field) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(22, 23, 1.2, 28), new THREE.MeshStandardMaterial({ color: 0x77756e, roughness: 0.95 }));
      pad.position.set(p.x, p.y + 0.3, p.z);
      pad.receiveShadow = true;
      grp.add(pad);
      const h = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0xeeeeea }));
      const h2 = h.clone(); const h3 = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 3), h.material);
      h.position.set(p.x - 5, p.y + 1, p.z); h2.position.set(p.x + 5, p.y + 1, p.z); h3.position.set(p.x, p.y + 1, p.z);
      grp.add(h, h2, h3);
    }
    // Ring of beacons marking the capture radius.
    const post = new THREE.ConeGeometry(1.4, 5, 6);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const x = p.x + Math.cos(a) * CAP_R, z = p.z + Math.sin(a) * CAP_R;
      const m = new THREE.Mesh(post, mat);
      m.position.set(x, w.groundAt(x, z) + 2.5, z);
      grp.add(m);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 26, 8), new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.6, roughness: 0.4 }));
    mast.position.set(p.x + 30, p.y + 13, p.z + 30);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshBasicMaterial({ color: OWNER_HEX[p.owner], side: THREE.DoubleSide }));
    flag.position.set(p.x + 34, p.y + 23.5, p.z + 30);
    const light = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 1600, 10, 1, true), beam);
    light.position.set(p.x, p.y + 800, p.z);
    grp.add(mast, flag, light);
    g.scene.add(grp);
    p.grp = grp; p.mat = mat; p.beam = beam; p.flag = flag;
  }

  recolor(p) {
    const c = OWNER_HEX[p.owner];
    p.mat.color.setHex(c); p.beam.color.setHex(c); p.flag.material.color.setHex(c);
    p.shown = p.owner;
  }

  update(dt) {
    const g = this.g;
    for (const p of this.points) {
      if (p.shown !== p.owner) this.recolor(p);
      p.flag.rotation.y = Math.sin(g.time * 1.7 + p.x) * 0.25;
    }
    if (!g.authority || g.over) return;
    for (const p of this.points) {
      const on = [[], []];
      for (const a of g.aircraft) {
        if ((a.team !== 0 && a.team !== 1) || !a.landed) continue;
        if (Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < CAP_R) on[a.team].push(a);
      }
      p.contested = on[0].length > 0 && on[1].length > 0;
      if (p.contested || (!on[0].length && !on[1].length)) continue;
      const t = on[0].length ? 0 : 1;
      const sign = t === 0 ? 1 : -1;
      const before = p.owner;
      p.prog = clamp(p.prog + sign * dt / CAP_T * Math.min(2, on[t].length), -1, 1);
      if (p.owner !== -1 && p.owner !== t && p.prog * sign >= 0) p.owner = -1; // knocked back to neutral
      if (p.prog * sign >= 1) p.owner = t;
      if (p.owner !== before) {
        const txt = p.owner === -1 ? `${p.name} (${p.id}) neutralised` : `${TEAM_NAMES[t]} captured ${p.name} (${p.id})`;
        g.message(txt, 3.5, p.owner === -1 ? '#ece6da' : t === 0 ? '#7fb4dd' : '#e2574b');
        g.netUI('msg', { text: txt, color: p.owner === -1 ? '#ece6da' : t === 0 ? '#7fb4dd' : '#e2574b', dur: 3.5 });
        if (p.owner === t) {
          for (const a of on[t]) {
            if (a === g.player) { Medals.unlock('capture'); g.awardBonus(200); }
            else if (a.human) g.netUI('captured', { to: a.id });
            if (a.ai && a.ai.capturePoint === p) a.ai.captureDone = true;
          }
        }
      }
    }
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 2;
      for (const p of this.points) if (p.owner === 0 || p.owner === 1) g.teamScore[p.owner] += this.rate;
    }
  }

  // Compact state for the multiplayer score message.
  state() { return this.points.map((p) => [p.owner, Math.round(p.prog * 100) / 100]); }
  apply(st) { if (st) st.forEach((s, i) => { const p = this.points[i]; if (p) { p.owner = s[0]; p.prog = s[1]; } }); }

  dispose() {
    for (const p of this.points) {
      this.g.scene.remove(p.grp);
      p.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.g.conquest = null;
  }
}

// ---------- Last Pilot Standing ----------
const RADII = [8500, 5200, 3200, 1900, 1100, 600, 260];
const HOLD = [45, 35, 30, 25, 22, 20, 999];
const SHRINK = [40, 35, 30, 25, 20, 18, 1];

export class LastPilot {
  constructor(game, opts = {}) {
    this.g = game;
    const rng = new RNG((opts.seed || 1) + 4242);
    // The whole zone schedule is fixed from the seed, so every player in a room sees the same circles.
    this.stages = [];
    let cx = rng.float(-2500, 2500), cz = rng.float(-2500, 2500);
    for (let i = 0; i < RADII.length; i++) {
      this.stages.push({ x: cx, z: cz, r: RADII[i] });
      const nr = RADII[i + 1] ?? RADII[i];
      const a = rng.float(0, Math.PI * 2), d = rng.float(0, Math.max(0, RADII[i] - nr) * 0.8);
      cx += Math.cos(a) * d; cz += Math.sin(a) * d;
    }
    this.t0 = game.time;
    this.zone = { x: this.stages[0].x, z: this.stages[0].z, r: RADII[0], nx: 0, nz: 0, nr: 0, stage: 0, phase: 'hold', left: 0, dps: 3 };
    this.participants = new Set(opts.participants || []);
    this.eliminated = new Set();
    this.order = [];
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      uniforms: { t: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float t; varying vec2 vUv;
        void main(){ float s = 0.5 + 0.5 * sin((vUv.y * 60.0 - t * 2.0) + vUv.x * 300.0);
          float a = (0.12 + 0.18 * s) * (1.0 - smoothstep(0.55, 1.0, vUv.y)) + 0.25 * (1.0 - smoothstep(0.0, 0.04, vUv.y));
          gl_FragColor = vec4(1.0, 0.32 + 0.2 * s, 0.18, a); }`,
    });
    this.wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 128, 1, true), mat);
    this.wall.frustumCulled = false;
    this.wall.renderOrder = 7;
    game.scene.add(this.wall);
    game.zone = this.zone;
    game.lps = this;
    this.update(0);
  }

  get alive() {
    if (!this.g.authority && this.remoteAlive != null) return this.remoteAlive; // the host's count
    return [...this.participants].filter((id) => !this.eliminated.has(id)).length;
  }

  onKill(victim) {
    if (victim.type !== 'air' || !this.participants.has(victim.id) || this.eliminated.has(victim.id)) return;
    this.eliminated.add(victim.id);
    this.order.push(victim.id);
    const left = this.alive;
    if (left > 1) this.g.message(`${victim.name} eliminated · ${left} pilots left`, 2.5, '#ece6da');
  }

  placeOf(id) { return this.eliminated.has(id) ? this.participants.size - this.order.indexOf(id) : 1; }

  update(dt) {
    const g = this.g, z = this.zone;
    const el = g.time - this.t0;
    // Walk the schedule to find the current stage and phase.
    let t = el, i = 0;
    for (; i < this.stages.length - 1; i++) {
      if (t < HOLD[i]) { z.phase = 'hold'; z.left = HOLD[i] - t; break; }
      t -= HOLD[i];
      if (t < SHRINK[i]) { z.phase = 'shrink'; z.left = SHRINK[i] - t; break; }
      t -= SHRINK[i];
    }
    const a = this.stages[i], b = this.stages[Math.min(i + 1, this.stages.length - 1)];
    z.stage = i;
    if (i >= this.stages.length - 1) { z.phase = 'final'; z.x = a.x; z.z = a.z; z.r = a.r; z.left = 0; }
    else if (z.phase === 'hold') { z.x = a.x; z.z = a.z; z.r = a.r; }
    else { const k = 1 - z.left / SHRINK[i]; z.x = a.x + (b.x - a.x) * k; z.z = a.z + (b.z - a.z) * k; z.r = a.r + (b.r - a.r) * k; }
    z.nx = b.x; z.nz = b.z; z.nr = b.r;
    z.dps = 3 + i * 2.5;
    this.wall.position.set(z.x, 1800, z.z);
    this.wall.scale.set(z.r, 4200, z.r);
    this.wall.material.uniforms.t.value = g.time;
    // Outside the zone you take damage (each owner applies it to its own aircraft).
    for (const ac of g.aircraft) {
      if (!ac.alive || !ac.local) continue;
      const out = Math.hypot(ac.pos.x - z.x, ac.pos.z - z.z) > z.r;
      if (ac === g.player) g.outsideZone = out;
      if (out && dt > 0) { ac.damage(z.dps * dt, null); if (ac === g.player && Math.random() < dt * 3) g.hud.damageFlash(4); }
    }
    if (!g.authority || g.over || el < 3) return;
    if (this.alive <= 1) {
      const winner = [...this.participants].find((id) => !this.eliminated.has(id));
      g.lpsWinner = winner;
      g.finish(winner === g.playerId ? 0 : 1, winner ? `${g.nameOf(winner) || 'Unknown'} is the last pilot standing` : 'Nobody survived');
    }
  }

  dispose() {
    this.g.scene.remove(this.wall);
    this.wall.geometry.dispose(); this.wall.material.dispose();
    this.g.zone = null; this.g.lps = null;
  }
}

// ---------- Bomber Escort ----------
export class Escort {
  // opts: vipTeam (attacking side), vipId (a human flying the Titan, or null for an AI Titan), timeLimit (s)
  constructor(game, opts = {}) {
    this.g = game;
    this.vipTeam = opts.vipTeam ?? 0;
    this.defTeam = 1 - this.vipTeam;
    this.vipId = opts.vipId || null;
    this.limit = opts.timeLimit || 12 * 60;
    this.t0 = game.time;
    this._target = null;
    if (this.target && game.authority) { this.target.maxHp = this.target.hp = 2400; }
    game.escort = this;
  }

  // The defending HQ (found lazily: multiplayer clients only get ground units from the host after the start).
  get target() {
    if (!this._target || this._target.removed) {
      this._target = this.g.groundUnits.find((u) => u.kind === 'hq' && u.team === this.defTeam) || null;
      if (this._target) this._target.vipTarget = true;
    }
    return this._target;
  }

  // An AI-flown Titan (single player escort/intercept roles, or a multiplayer room with no human Titan pilot).
  spawnAIVip() {
    const g = this.g;
    const site = this.vipTeam === 0 ? SITES.blueAirfield : SITES.redAirfield;
    const pos = new THREE.Vector3(site.x, g.world.heightAt(site.x, site.z) + 1300, site.z + (this.vipTeam === 0 ? -600 : 600));
    const ac = g.spawnAI('titan', this.vipTeam, pos, { heading: this.vipTeam === 0 ? 0 : Math.PI, skill: 0.6, bombTarget: this.target, alt: 1350, name: 'Titan "Atlas"' });
    this.makeVip(ac);
    this.vipId = ac.id;
    return ac;
  }

  makeVip(ac) {
    ac.vip = true;
    if (ac.local) { ac.maxHp *= 2.4; ac.hp = ac.maxHp; ac.dmgMul = 0.5; }
  }

  // Bots on the Titan's side fly as its escort: they attack whatever threatens it.
  escortOpts() { return (kind, team) => (team === this.vipTeam && kind !== 'titan' && this.vip && this.vip.alive && Math.random() < 0.6 ? { role: 'wingman', leader: this.vip } : {}); }
  assignEscorts(bots) {
    const v = this.vip;
    if (!v) return;
    for (const a of bots.list) if (a.alive && a.team === this.vipTeam && a.ai && a.kind !== 'titan' && Math.random() < 0.6) { a.ai.role = 'wingman'; a.ai.leader = v; a.ai.think = 0; }
  }

  get vip() { return this.vipId ? this.g.byId.get(this.vipId) || null : null; }

  onKill(victim) {
    if (victim.id === this.vipId && !this.g.over && this.g.authority) {
      this.g.finish(this.defTeam, 'The Titan was shot down');
    }
  }

  update() {
    const g = this.g;
    const v = this.vip;
    if (v && !v.vip) this.makeVip(v); // a human VIP's puppet appears after the start
    if (!g.authority || g.over) return;
    if (this.target && !this.target.alive) return g.finish(this.vipTeam, `The enemy ${this.target.def.name} was destroyed`);
    if (!v && g.time - this.t0 > 20) return g.finish(this.defTeam, 'The Titan never made it');
    if (g.time - this.t0 > this.limit) return g.finish(this.defTeam, 'Time is up: the bomber run failed');
  }

  get timeLeft() { return Math.max(0, this.limit - (this.g.time - this.t0)); }

  dispose() { this.g.escort = null; }
}
