// AI pilots: dogfighting, ground attack, level bombing, patrol, terrain avoidance.
import * as THREE from 'three';
import { GRAVITY, clamp } from './config.js';
import { leadPoint } from './aircraft.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

export class PilotAI {
  constructor(game, aircraft, o = {}) {
    this.game = game;
    this.ac = aircraft;
    this.role = o.role || (aircraft.def.model === 'bomber' ? 'bomber' : aircraft.def.model === 'attacker' ? 'attacker' : 'fighter');
    this.skill = o.skill ?? 0.5;
    this.state = 'patrol';
    this.target = null;
    this.think = Math.random() * 0.5;
    this.patrol = o.patrol ? new THREE.Vector3(o.patrol.x, o.patrol.y ?? 1500, o.patrol.z) : new THREE.Vector3((Math.random() - 0.5) * 3000, 1400 + Math.random() * 800, (Math.random() - 0.5) * 2500);
    this.bombTarget = o.bombTarget || null;   // GroundUnit or {x,z}
    this.cruiseAlt = o.alt ?? (this.role === 'bomber' ? 1500 + Math.random() * 400 : 900 + Math.random() * 600);
    this.dir = new THREE.Vector3(0, 0, -1);
    this.evadeTimer = 0;
    this.evadeSide = Math.random() < 0.5 ? -1 : 1;
    this.diveCommit = false;
    this.pullOut = 0;
    this.noAir = !!o.noAir;
    this.groundFirst = this.role === 'attacker' || !!o.groundFirst;
    aircraft.ammo = 1e9;
    aircraft.ai = this;
    aircraft.turnLimit = 0.7 + 0.3 * clamp(this.skill, 0, 1);
    // Personalities (enemy aces): 'aggressive' hunts the player, 'missile' fights at range with heat-seekers,
    // 'clouds' lurks inside clouds and ambushes. Roles: 'wingman' follows a leader, 'flyby' flies straight through.
    this.personality = o.personality || null;
    if (o.role === 'wingman' || o.role === 'flyby') this.role = o.role;
    this.leader = o.leader || null;
    this.flyDir = o.flyDir ? o.flyDir.clone() : null;
    this.slotSide = Math.random() < 0.5 ? -1 : 1;
    this.captureRole = !!o.capture && aircraft.canHover;
    this.capturePoint = null;
    this.missileCd = 5 + Math.random() * 6;
    this.threatT = 0;
    this.ambushT = 0;
    this.orbit = Math.random() * Math.PI * 2;
    // Enemy fighters carry a pair of heat-seekers; spoof them with flares.
    if (this.role === 'fighter' && this.skill > 0.35 && !o.noMissiles) aircraft.missiles = 2;
    if (this.personality === 'aggressive') aircraft.turnLimit = 1;
  }

  onDamaged(amount, attackerId) {
    const g = this.game;
    if (this.ac.aceId && g.aces) g.aces.onAceDamaged(this.ac);
    if (this.personality === 'clouds') { this.ambushT = 0; this.state = 'lurk'; } // hit: melt back into the clouds
    if (this.state === 'capture' && this.ac.hover) this.liftT = this.liftT || 2.5;
  }

  decide() {
    const a = this.ac, g = this.game;
    if (this.role === 'bomber') { this.state = 'bomb'; return; }
    if (this.role === 'flyby') { this.state = 'flyby'; return; }
    if (this.state === 'capture' && this.capturePoint && (a.hover || (!this.captureDone && this.capturePoint.owner !== a.team))) return;
    if (this.role === 'wingman') {
      const L = this.leader;
      if (!L || !L.alive) { this.role = 'fighter'; this.leader = null; }
      else {
        // Attack what the leader is locked on to, or the nearest threat to the leader; otherwise hold formation.
        const lt = L === g.player && g.lock && g.lock.locked ? g.lock.target : null;
        const t = lt && lt.alive ? lt : g.bestAirTarget(L, 2800);
        if (t && t.type === 'air') { this.setTarget(t, 'attackAir'); return; }
        if (t && t.type === 'ground' && (a.def.guns.pen >= 1 || a.rocketsLeft > 0)) { this.setTarget(t, 'attackGround'); return; }
        this.target = null; this.state = 'formation'; return;
      }
    }
    if (this.personality === 'aggressive') {
      const p = g.player;
      if (p && p.alive && p.team !== a.team && p.pos.distanceTo(a.pos) < 12000) { this.setTarget(p, 'attackAir'); return; }
    }
    if (this.personality === 'clouds') {
      if (this.ambushT > 0 && this.target && this.target.alive) { this.state = 'attackAir'; return; }
      const prey = g.player && g.player.alive && g.player.team !== a.team ? g.player : g.bestAirTarget(a, 8000);
      if (prey) {
        _v.subVectors(a.pos, prey.pos);
        const d = _v.length();
        const looking = prey.fwd ? _v.divideScalar(d).dot(prey.fwd) : 0;
        // Strike from a cloud when the prey is close and looking elsewhere.
        if (d < 2600 && (looking < 0.55 || d < 700)) { this.ambushT = 8 + this.skill * 4; this.setTarget(prey, 'attackAir'); return; }
        this.prey = prey;
      }
      this.target = null; this.state = 'lurk'; return;
    }
    if (this.captureRole && g.conquest && !this.captureDone) {
      const pts = g.conquest.points.filter((p) => p.owner !== a.team && !p.contested);
      pts.sort((p, q) => (Math.hypot(p.x - a.pos.x, p.z - a.pos.z) * (p.owner === -1 ? 0.7 : 1)) - (Math.hypot(q.x - a.pos.x, q.z - a.pos.z) * (q.owner === -1 ? 0.7 : 1)));
      const near = g.bestAirTarget(a, 1200);
      if (pts.length && !near) { this.capturePoint = pts[0]; this.state = 'capture'; this.hoverT = 0; this.target = null; return; }
    }
    this.captureDone = false;
    const airT = this.noAir ? null : g.bestAirTarget(a, 5500);
    const canGround = a.def.guns.pen >= 1 || a.rocketsLeft > 0 || a.bombsLeft > 0;
    if (this.groundFirst && canGround) {
      const gt = g.nearestEnemy(a, a.pos, 9000, 'ground', true);
      if (gt && (!airT || airT.pos.distanceTo(a.pos) > 1200)) { this.setTarget(gt, 'attackGround'); return; }
    }
    if (airT) { this.setTarget(airT, 'attackAir'); return; }
    if (canGround) {
      const gt = g.nearestEnemy(a, a.pos, 7000, 'ground', true);
      if (gt) { this.setTarget(gt, 'attackGround'); return; }
    }
    this.target = null;
    this.state = 'patrol';
  }

  setTarget(t, state) {
    if (this.target !== t) { this.diveCommit = false; }
    this.target = t;
    this.state = state;
  }

  update(dt) {
    const a = this.ac, g = this.game;
    if (!a.alive) return;
    this.think -= dt;
    this.missileCd -= dt;
    if (this.ambushT > 0) this.ambushT -= dt;
    if (this.think <= 0 || (this.target && !this.target.alive)) { this.think = 0.5 + Math.random() * 0.4; this.decide(); }
    a.firing = false;
    a.boosting = false; a.airbrake = false;
    let throttle = 0.92;
    const dir = this.dir;
    const ground = g.world.groundAt(a.pos.x, a.pos.z);
    const alt = a.pos.y - ground;
    this.countermeasures(dt);

    switch (this.state) {
      case 'attackAir': throttle = this.attackAir(dt, dir); break;
      case 'attackGround': throttle = this.attackGround(dt, dir, alt); break;
      case 'bomb': throttle = this.bombRun(dt, dir); break;
      case 'formation': throttle = this.formation(dir); break;
      case 'flyby': _v.copy(a.pos).addScaledVector(this.flyDir, 3000); this.flyTo(_v, dir, false); dir.y = clamp(dir.y, -0.05, 0.05); dir.normalize(); throttle = a.maxThrottle; break;
      case 'lurk': throttle = this.lurk(dir); break;
      case 'capture':
        throttle = this.captureRun(dt, dir);
        if (a.hover) { a.targetDir = dir; return; } // hovering: no terrain-avoidance pull-ups
        break;
      default: this.flyTo(this.patrol, dir, true); throttle = 0.8;
        if (a.pos.distanceTo(this.patrol) < 600) this.patrol.set((Math.random() - 0.5) * 6000, 1200 + Math.random() * 1000, (Math.random() - 0.5) * 5000);
    }

    // Evade when someone is on our tail.
    const shrug = this.personality === 'aggressive' && a.hp > a.maxHp * 0.4;
    if (this.role !== 'bomber' && this.role !== 'flyby' && !shrug && g.time - a.lastAttackTime < 2.5 && this.skill > 0.25) this.evadeTimer = Math.max(this.evadeTimer, 1.5 + this.skill * 2);
    if (this.evadeTimer > 0) {
      this.evadeTimer -= dt;
      if (Math.random() < dt * 0.6) this.evadeSide *= -1;
      dir.copy(a.right).multiplyScalar(this.evadeSide).addScaledVector(a.up, 0.6).addScaledVector(a.fwd, 0.4).normalize();
      if (alt < 400) dir.y = Math.abs(dir.y) + 0.3;
      throttle = a.maxThrottle;
      a.firing = false;
    }

    // Terrain avoidance overrides everything.
    let danger = alt < 90 + (this.diveCommit ? 0 : 60);
    for (const t of [1.5, 3, 5]) {
      _v.copy(a.pos).addScaledVector(a.vel, t);
      if (_v.y < g.world.groundAt(_v.x, _v.z) + 70) { danger = true; break; }
    }
    if (danger) {
      dir.set(a.fwd.x, 0, a.fwd.z).normalize();
      dir.y = 1.4;
      dir.normalize();
      a.firing = false;
      throttle = a.maxThrottle;
      this.diveCommit = false;
      this.pullOut = 2.5;
    }
    if (this.pullOut > 0) { this.pullOut -= dt; if (dir.y < 0.25) { dir.y = 0.25; dir.normalize(); } }
    // Stay in the combat area (in Last Pilot Standing: inside the safe zone).
    const z = g.zone;
    if (z) {
      const dx = z.x - a.pos.x, dz = z.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d > z.r * 0.72) { _v.set(dx, 0, dz).normalize(); dir.lerp(_v, clamp((d - z.r * 0.72) / Math.max(150, z.r * 0.25), 0, 1)).normalize(); }
    } else {
      const r = Math.hypot(a.pos.x, a.pos.z);
      if (r > 9500) { _v.set(-a.pos.x, 0, -a.pos.z).normalize(); dir.lerp(_v, clamp((r - 9500) / 1500, 0, 1)).normalize(); }
    }
    if (a.pos.y > 6000 && dir.y > 0) dir.y *= 0.2;

    a.targetDir = dir;
    a.throttle += clamp(throttle - a.throttle, -dt * 0.6, dt * 0.6);
    a.throttle = clamp(a.throttle, 0.2, a.maxThrottle);
  }

  flyTo(p, dir, keepAlt) {
    const a = this.ac;
    dir.subVectors(p, a.pos);
    if (keepAlt) dir.y = clamp((this.cruiseAlt - a.pos.y + this.game.world.groundAt(a.pos.x, a.pos.z) * 0.6) * 0.5, -dir.length() * 0.3, dir.length() * 0.35);
    dir.normalize();
  }

  attackAir(dt, dir) {
    const a = this.ac, t = this.target;
    const gdef = a.def.guns;
    const lead = leadPoint(a.pos, a.vel, t.pos, t.vel, gdef.speed, _v);
    const err = (1 - this.skill) * 18;
    lead.x += Math.sin(this.game.time * 1.3 + a.pos.x) * err;
    lead.y += Math.cos(this.game.time * 1.1) * err;
    dir.subVectors(lead, a.pos);
    const dist = dir.length();
    dir.normalize();
    const ang = Math.acos(clamp(dir.dot(a.fwd), -1, 1));
    if (dist < 900 && ang < 0.035 + (1 - this.skill) * 0.03 && t.pos.distanceTo(a.pos) > 40) a.firing = true;
    if (dist < 70) { dir.addScaledVector(a.up, 0.8).normalize(); }
    this.tryMissile(t, dist);
    let th = a.maxThrottle;
    const closing = _v2.subVectors(a.vel, t.vel).dot(dir);
    if (dist < 400 && closing > 30) th = 0.55;
    else if (dist < 900) th = 1.0;
    if (this.personality === 'aggressive' && dist < 1600 && ang < 0.5 && a.boost > 0.3) { a.boosting = true; th = a.maxThrottle; }
    if (this.personality === 'missile') {
      // Keep the fight at missile range: extend away when the enemy gets close, then turn back in.
      if (dist < 850 && a.missiles > 0) this.extendT = 4;
      if (this.extendT > 0) {
        this.extendT -= dt;
        dir.subVectors(a.pos, t.pos).setY(0).normalize(); dir.y = 0.25; dir.normalize();
        a.firing = false;
        th = a.maxThrottle; a.boosting = a.boost > 0.4;
      }
    }
    return th;
  }

  // Heat-seeker launch: rear aspect for ordinary pilots, any aspect for the missile ace.
  tryMissile(t, dist) {
    const a = this.ac, g = this.game;
    if (a.missiles <= 0 || this.missileCd > 0 || t.type !== 'air' || !t.alive) return;
    const any = this.personality === 'missile';
    const toT = _v3.subVectors(t.pos, a.pos);
    const d = toT.length();
    toT.divideScalar(d);
    const off = Math.acos(clamp(toT.dot(a.fwd), -1, 1));
    const tail = t.fwd ? t.fwd.dot(toT) : 1;
    if (d < 450 || d > (any ? 3300 : 2300) || off > (any ? 0.45 : 0.22) || (!any && tail < 0.15)) return;
    if (g.inCloud(t) && d > 900) return;
    if (a.fireMissile(t)) {
      this.missileCd = any ? 4 + Math.random() * 2 : 10 + Math.random() * 6;
      if (a.aceId && g.aces && Math.random() < 0.4) g.radio(a.name, ['Fox two!', 'Missile away. Dance for me.', 'Seeker locked, launching.'][Math.floor(Math.random() * 3)], '#8fd0ff');
    }
  }

  // Drop flares/chaff against missiles (and aces against homing rockets) that are tracking us.
  countermeasures(dt) {
    const a = this.ac, g = this.game;
    this.threatT -= dt;
    if (this.threatT > 0) return;
    this.threatT = 0.4;
    for (const m of g.weapons.missiles) {
      if (m.target !== a || m.pos.distanceToSquared(a.pos) > 1500 * 1500) continue;
      if (a.vip || Math.random() < 0.3 + this.skill * 0.55) a.dispense(m.seeker === 'ir' ? 'flare' : 'chaff');
      this.evadeTimer = Math.max(this.evadeTimer, 1.5);
      return;
    }
    if (this.personality) for (const r of g.weapons.rockets) {
      if (r.target === a && r.pos.distanceToSquared(a.pos) < 900 * 900 && Math.random() < 0.7) { a.dispense('flare'); return; }
    }
  }

  // Wingman: hold a slot off the leader's wing and match speed.
  formation(dir) {
    const a = this.ac, L = this.leader;
    if (!L || !L.alive) { this.role = 'fighter'; return 0.9; }
    _v.copy(L.pos).addScaledVector(L.right, this.slotSide * 70).addScaledVector(L.fwd, -55).add(_v2.set(0, 12, 0));
    const ahead = _v3.subVectors(_v, a.pos).dot(L.fwd);
    _v.addScaledVector(L.fwd, 220);
    dir.subVectors(_v, a.pos).normalize();
    if (L.hover) return 0.5;
    return clamp(L.throttle + ahead * 0.006, 0.3, a.maxThrottle);
  }

  // Cloud ambusher: circle inside a cloud near the prey until it looks away.
  lurk(dir) {
    const a = this.ac, g = this.game;
    const puffs = g.clouds && g.clouds.puffs;
    const ref = this.prey && this.prey.alive ? this.prey.pos : a.pos;
    if (puffs && puffs.length && (!this.cloud || Math.hypot(this.cloud.x - ref.x, this.cloud.z - ref.z) > 4500 || Math.random() < 0.004)) {
      let best = null, bs = Infinity;
      for (let i = 0; i < puffs.length; i += 3) {
        const c = puffs[i];
        if (c.s < 380) continue;
        const d = Math.hypot(c.x - ref.x, c.z - ref.z);
        const s = Math.abs(d - 1800) + Math.hypot(c.x - a.pos.x, c.z - a.pos.z) * 0.3;
        if (s < bs) { bs = s; best = c; }
      }
      this.cloud = best;
    }
    if (!this.cloud) { this.flyTo(this.patrol, dir, true); return 0.8; }
    this.orbit += 0.012;
    const c = this.cloud;
    _v.set(c.x + Math.cos(this.orbit) * 140, c.y, c.z + Math.sin(this.orbit) * 140);
    if (_v.distanceTo(a.pos) > 600) { this.flyTo(_v, dir, false); return 1; }
    _v.set(c.x + Math.cos(this.orbit + 0.6) * 140, c.y, c.z + Math.sin(this.orbit + 0.6) * 140);
    dir.subVectors(_v, a.pos).normalize();
    return 0.55;
  }

  // Conquest: fly to a field, drop into hover, land inside the ring until it's ours, then lift off.
  captureRun(dt, dir) {
    const a = this.ac, g = this.game, p = this.capturePoint;
    if (!p) { this.state = 'patrol'; return 0.8; }
    const dx = p.x - a.pos.x, dz = p.z - a.pos.z, hd = Math.hypot(dx, dz);
    const agl = a.pos.y - g.world.groundAt(a.pos.x, a.pos.z);
    if (!a.hover) {
      if (this.captureDone || p.owner === a.team) { this.capturePoint = null; this.captureDone = false; this.state = 'patrol'; this.think = 0; return 1; }
      if (hd > 1100) { _v.set(p.x, p.y + 380, p.z); this.flyTo(_v, dir, false); return 1; }
      _v.set(p.x, p.y + 220, p.z);
      this.flyTo(_v, dir, false);
      a.airbrake = true;
      if (a.speed < a.def.stallSpeed * 2 || hd < 380) { a.toggleHover(); this.hoverT = 0; this.liftT = 0; }
      return 0.2;
    }
    this.hoverT += dt;
    const done = this.captureDone || p.owner === a.team;
    if (!this.liftT && (done || this.hoverT > 45)) this.liftT = 3;
    dir.set(dx, 0, dz);
    if (hd < 5) dir.set(a.fwd.x, 0, a.fwd.z);
    dir.normalize();
    dir.y = -0.12; dir.normalize();
    const h = a.hoverIn;
    h.side = 0;
    if (this.liftT > 0) {
      this.liftT -= dt;
      h.up = 1; h.fwd = 0.6;
      if (this.liftT <= 0 || agl > 140) {
        this.liftT = 0;
        a.toggleHover();
        this.capturePoint = null; this.state = 'patrol'; this.think = 0;
        if (done) this.captureDone = false;
      }
      return 1;
    }
    const facing = Math.hypot(a.fwd.x, a.fwd.z) > 0.1 ? (a.fwd.x * dx + a.fwd.z * dz) / (Math.hypot(a.fwd.x, a.fwd.z) * Math.max(hd, 1)) : 1;
    h.fwd = hd > 25 ? clamp(hd / 140, 0.2, 1) * (facing > 0.6 ? 1 : 0.15) : 0;
    if (hd > 70) h.up = agl > 90 ? -0.7 : agl < 45 ? 0.6 : 0;
    else h.up = agl > 40 ? -1 : agl > 12 ? -0.45 : -0.22;
    return 0.6;
  }

  attackGround(dt, dir, alt) {
    const a = this.ac, t = this.target;
    const tp = t.hitCenter;
    const hdx = tp.x - a.pos.x, hdz = tp.z - a.pos.z;
    const hd = Math.hypot(hdx, hdz);
    const hasBombs = a.bombsLeft > 0;
    const useBombs = hasBombs && (t.radius > 6 || a.def.guns.pen < 2) && a.rocketsLeft === 0 || (hasBombs && a.def.model === 'bomber');
    if (!this.diveCommit) {
      // Approach at altitude, then roll in.
      const entry = useBombs ? 1500 : 2200;
      if (hd > entry || alt < 350) {
        _v.set(tp.x, tp.y + (useBombs ? 700 : 900), tp.z);
        this.flyTo(_v, dir, false);
        if (hd < 900 && alt > 350) this.diveCommit = true;
        return 1.0;
      }
      this.diveCommit = true;
    }
    if (useBombs) {
      // Shallow dive bombing using a CCIP estimate.
      const fall = Math.max(1, alt);
      const vy = a.vel.y;
      const tf = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * fall)) / GRAVITY;
      const ix = a.pos.x + a.vel.x * tf, iz = a.pos.z + a.vel.z * tf;
      const miss = Math.hypot(ix - tp.x, iz - tp.z);
      dir.set(tp.x - a.pos.x, (tp.y + 220) - a.pos.y, tp.z - a.pos.z).normalize();
      if (miss < 22 + (1 - this.skill) * 30) a.dropBomb();
      if (hd < 150 || alt < 200) { this.diveCommit = false; this.think = 2.5; }
      return 0.85;
    }
    dir.set(tp.x - a.pos.x, tp.y - a.pos.y, tp.z - a.pos.z);
    const dist = dir.length();
    dir.normalize();
    const ang = Math.acos(clamp(dir.dot(a.fwd), -1, 1));
    if (dist < 1100 && ang < 0.03 + (1 - this.skill) * 0.025) a.firing = true;
    if (a.rocketsLeft > 0 && dist < 950 && dist > 300 && ang < 0.025) a.fireRocket();
    if (dist < 260 || alt < 160) { this.diveCommit = false; this.think = 2 + Math.random() * 2; }
    return 0.75;
  }

  bombRun(dt, dir) {
    const a = this.ac, g = this.game;
    let tp = this.bombTarget;
    if (tp && tp.alive === false) tp = this.bombTarget = g.nearestEnemy(a, a.pos, 9000, 'ground', true);
    if (!tp) tp = g.nearestEnemy(a, a.pos, 12000, 'ground', true);
    if (!tp) { this.flyTo(this.patrol, dir, true); return 0.85; }
    const tx = tp.x ?? tp.pos.x, tz = tp.z ?? tp.pos.z;
    const ground = g.world.groundAt(tx, tz);
    const fall = Math.max(1, a.pos.y - ground);
    const tf = Math.sqrt(2 * fall / GRAVITY);
    const ix = a.pos.x + a.vel.x * tf, iz = a.pos.z + a.vel.z * tf;
    const miss = Math.hypot(ix - tx, iz - tz);
    _v.set(tx - a.vel.x * tf * 0.5, ground + this.cruiseAlt, tz - a.vel.z * tf * 0.5);
    const hd = Math.hypot(tx - a.pos.x, tz - a.pos.z);
    if (hd < 300 && this.passed) { /* keep going straight */ dir.copy(a.fwd).setY(0).normalize(); }
    else this.flyTo(_v, dir, true);
    if (miss < 70 && a.bombsLeft > 0) { a.dropBomb(); this.passed = true; }
    if (this.passed && hd > 2500) { this.passed = false; if (a.bombsLeft <= 0) a.bombsLeft = a.def.bombs.count; }
    return 0.95;
  }
}
