// Aircraft: flight model, mouse-aim autopilot, weapons, damage and network interpolation.
import * as THREE from 'three';
import { AIRCRAFT, GRAVITY, CM, clamp, lerp, damp } from './config.js';
import { buildAircraftModel } from './models.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _e = new THREE.Euler();
const FWD = new THREE.Vector3(0, 0, -1), UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);
const NO_INPUT = { pitch: 0, roll: 0, yaw: 0 };
const _qt = new THREE.Quaternion();

// Where to aim so a bullet of speed bs meets the target (in the shooter's moving frame).
export function leadPoint(sp, sv, tp, tv, bs, out = new THREE.Vector3()) {
  out.copy(tp);
  let t = 0;
  for (let i = 0; i < 4; i++) {
    t = out.distanceTo(sp) / bs;
    out.copy(tp).addScaledVector(tv, t).addScaledVector(sv, -t);
    out.y += 0.5 * GRAVITY * t * t;
  }
  return out;
}

// Snapshot interpolation for networked entities.
export class Interp {
  constructor() { this.buf = []; }
  push(pos, quat, data) {
    const t = performance.now() / 1000;
    this.buf.push({ t, pos: pos.clone(), quat: quat.clone(), data });
    if (this.buf.length > 30) this.buf.shift();
  }
  sample(outPos, outQuat, delay = 0.13) {
    const b = this.buf;
    if (!b.length) return null;
    const rt = performance.now() / 1000 - delay;
    for (let i = b.length - 1; i > 0; i--) {
      const a = b[i - 1], c = b[i];
      if (a.t <= rt && rt <= c.t) {
        const k = (rt - a.t) / Math.max(1e-4, c.t - a.t);
        outPos.lerpVectors(a.pos, c.pos, k);
        outQuat.slerpQuaternions(a.quat, c.quat, k);
        return c.data;
      }
    }
    const last = b[b.length - 1];
    if (rt > last.t && last.data && last.data.vel) {
      const dt = Math.min(rt - last.t, 0.6);
      outPos.copy(last.pos).addScaledVector(last.data.vel, dt);
    } else outPos.copy(rt > last.t ? last.pos : b[0].pos);
    outQuat.copy(rt > last.t ? last.quat : b[0].quat);
    return last.data;
  }
}

export class Aircraft {
  constructor(game, o) {
    this.game = game;
    this.id = o.id;
    this.kind = o.kind;
    this.def = AIRCRAFT[o.kind];
    this.team = o.team;
    this.skin = o.skin ?? (o.team === 1 ? 1 : 0);
    this.name = o.name || this.def.name;
    this.type = 'air';
    this.isPlayer = !!o.isPlayer;
    this.human = !!o.human;
    this.local = o.local !== false;
    this.radius = this.def.radius;
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.alive = true;
    this.dying = false;
    this.removed = false;
    this.pos = o.pos.clone();
    this.hitCenter = this.pos;
    this.quat = (o.quat || new THREE.Quaternion()).clone();
    this.speed = o.speed ?? this.def.maxSpeed * 0.75;
    this.vel = FWD.clone().applyQuaternion(this.quat).multiplyScalar(this.speed);
    this.throttle = o.throttle ?? 0.9;
    this.angVel = new THREE.Vector3();
    this.input = { pitch: 0, roll: 0, yaw: 0 };
    this.manual = { pitch: 0, roll: 0, yaw: 0 };
    this.targetDir = null;
    this.firing = false;
    this.ammo = this.def.guns.ammo;
    this.bombsLeft = this.def.bombs ? this.def.bombs.count : 0;
    this.rocketsLeft = this.def.rockets ? this.def.rockets.count : 0;
    this.gunTimer = 0; this.gunIndex = 0; this.bombTimer = 0; this.rocketTimer = 0; this.rocketSide = 0;
    this.lastAttacker = null; this.lastAttackTime = -99;
    this.engineHealth = 1; this.wingDamage = 0; this.onFire = false; this.fireTime = 0;
    this.gForce = 1;
    this.spawnTime = game.time;
    this.interp = new Interp();
    this.score = 0;
    const model = buildAircraftModel(this.def.model, this.skin, { cockpit: this.isPlayer });
    this.mesh = model.group;
    this.parts = model.parts;
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
    game.scene.add(this.mesh);
    this.turretState = (this.def.turrets || []).map(() => ({ target: null, retarget: Math.random(), cd: 0 }));
    this.fwd = new THREE.Vector3(); this.up = new THREE.Vector3(); this.right = new THREE.Vector3();
    this.updateAxes();
    this.prevVdir = this.vel.clone().normalize();
    this.vaporAcc = 0;
    // Extra movement: boost meter, air brake, scripted manoeuvres, VTOL hover.
    this.boost = 1;
    this.boosting = false;
    this.airbrake = false;
    this.maneuver = null;
    this.visualPitch = 0;
    this.hover = false;
    this.hoverIn = { fwd: 0, side: 0, up: 0 };
    this.god = false;
    // Countermeasures and (AI only) heat-seeking missiles.
    this.cmMax = this.def.model === 'bomber' ? CM.flares * 1.6 | 0 : CM.flares;
    this.flares = this.cmMax; this.chaff = this.cmMax;
    this.cmTimer = 0;
    this.missiles = 0;
    this.overcharge = 0; // UBU overcharge (7-kill streak): seconds left
  }

  // Landed: sitting on the ground (hover touchdown), slow and alive. Also works for remote aircraft.
  get landed() {
    if (!this.alive) return false;
    const h = this.pos.y - this.game.world.groundAt(this.pos.x, this.pos.z);
    return h < 4.5 && this.vel.length() < 9;
  }

  // Drop a salvo of flares or chaff. Returns false when empty or on cooldown.
  dispense(kind) {
    const key = kind === 'flare' ? 'flares' : 'chaff';
    if (!this.alive || this[key] <= 0 || this.cmTimer > 0) return false;
    this.cmTimer = CM.cooldown;
    const n = Math.min(CM.salvo, this[key]);
    this[key] -= n;
    for (let i = 0; i < n; i++) {
      const p = _v.copy(this.pos).addScaledVector(this.up, -1.5).addScaledVector(this.fwd, -this.radius * 0.5);
      const d = this.game.weapons.dropDecoy(kind, p, this.vel, this.team, this.id, !this.local);
      d.vel.addScaledVector(this.right, (i - (n - 1) / 2) * 16);
    }
    this.game.audio?.play(kind === 'flare' ? 'flare' : 'chaff', this.pos, this.isPlayer ? 1 : 0.6);
    this.game.onWeaponEvent(this, kind, this.pos, this.vel);
    return true;
  }

  // Heat-seeking missile at an air target (AI fighters and aces).
  fireMissile(target) {
    if (!this.alive || this.missiles <= 0 || !target) return false;
    this.missiles--;
    const side = (this.missileSide = -(this.missileSide || 1));
    const pos = _v.copy(this.pos).addScaledVector(this.right, side * this.radius * 0.35).addScaledVector(this.up, -1.2).clone();
    const vel = this.vel.clone().addScaledVector(this.fwd, 40);
    this.game.weapons.fireMissile({ pos, vel, owner: this.id, team: this.team, target, seeker: 'ir', skin: this.skin });
    this.game.onWeaponEvent(this, 'missile', pos, vel, target);
    return true;
  }

  get canHover() { return !this.def.noHover; }

  // Refill guns, bombs and rockets (free flight).
  rearm() {
    this.ammo = this.def.guns.ammo;
    this.bombsLeft = this.def.bombs ? this.def.bombs.count : 0;
    this.rocketsLeft = this.def.rockets ? this.def.rockets.count : 0;
    this.flares = this.chaff = this.cmMax;
    for (const b of this.parts.bombs) b.visible = true;
  }

  // ---------- manoeuvres ----------
  // 'roll': quick evasive barrel roll with a sideways jink. 'uturn': Immelmann (half loop + half roll).
  // 'cobra': nose snaps up to ~80 degrees for a moment while the jet keeps flying straight and bleeds speed.
  startManeuver(type, dir = 1) {
    if (this.maneuver || this.hover || !this.alive) return false;
    if (type === 'uturn' && this.speed < this.def.stallSpeed * 1.5) return false;
    const m = { type, t: 0, dir: dir >= 0 ? 1 : -1, phase: 0 };
    if (type === 'roll') { m.dur = Math.max(0.6, 2.6 / this.def.rollRate); m.lateral = this.right.clone().setY(0).normalize().multiplyScalar(m.dir); }
    if (type === 'uturn') {
      // Reference heading: the way the jet is flying (or, if climbing steeply, the way its belly faces).
      const h = Math.hypot(this.fwd.x, this.fwd.z) > 0.3 ? this.fwd : _v2.copy(this.up).negate();
      m.start = _v.set(h.x, 0, h.z).normalize().clone();
      m.dur = 7;
    }
    if (type === 'cobra') m.dur = 1.7;
    this.maneuver = m;
    return true;
  }

  runManeuver(dt) {
    const m = this.maneuver;
    m.t += dt;
    const inp = this.input;
    inp.pitch = 0; inp.roll = 0; inp.yaw = 0;
    if (m.type === 'roll') {
      inp.pitch = 0.12;
      if (m.t >= m.dur) this.maneuver = null;
    } else if (m.type === 'uturn') {
      if (m.phase === 0) {
        inp.pitch = 1;
        const back = this.fwd.x * m.start.x + this.fwd.z * m.start.z;
        // Top of the loop: inverted, nose back near the horizon, heading reversed.
        if (back < -0.5 && this.up.y < -0.6 && Math.abs(this.fwd.y) < 0.55) { m.phase = 1; m.rollT = 0; }
      } else {
        inp.roll = 1;
        inp.pitch = 0;
        m.rollT += dt;
        if (this.up.y > 0.9 || m.rollT > 2.5) this.maneuver = null;
      }
      if (m.t > m.dur) this.maneuver = null;
    } else if (m.type === 'cobra') {
      let level = clamp(this.right.y * 2.5, -1, 1);
      inp.roll = level;
      this.visualPitch = Math.sin(Math.PI * Math.min(1, m.t / m.dur)) * 1.4;
      if (m.t >= m.dur) { this.maneuver = null; this.visualPitch = 0; }
    }
  }

  toggleHover() {
    if (!this.alive || !this.canHover) return false;
    this.maneuver = null; this.visualPitch = 0;
    if (!this.hover) {
      this.hover = true;
    } else {
      // Transition back to wing-borne flight with a kick of thrust so the jet doesn't drop out of the sky.
      this.hover = false;
      this.throttle = Math.max(this.throttle, 1);
      const spd = Math.max(this.vel.length(), this.def.stallSpeed * 1.45);
      this.vel.copy(this.fwd).multiplyScalar(spd);
      this.speed = spd;
      this.prevVdir.copy(this.fwd);
    }
    return true;
  }

  // VTOL hover: the nose follows the aim direction, W/S climb, A/D strafe, arrows move forward/back.
  updateHover(dt) {
    const dir = this.targetDir || this.fwd;
    const h = this.hoverIn;
    const yaw = Math.atan2(-dir.x, -dir.z);
    const pitch = clamp(Math.asin(clamp(dir.y, -1, 1)), -1.1, 0.7);
    _e.set(pitch, yaw, -h.side * 0.22, 'YXZ');
    _q.setFromEuler(_e);
    this.quat.slerp(_q, 1 - Math.exp(-3.2 * dt)).normalize();
    this.updateAxes();
    const flat = _v.set(this.fwd.x, 0, this.fwd.z);
    if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1);
    flat.normalize();
    const want = _v2.set(0, 0, 0)
      .addScaledVector(flat, h.fwd * 55)
      .addScaledVector(_v3.set(-flat.z, 0, flat.x), h.side * 32);
    want.y = h.up * 24;
    this.vel.lerp(want, 1 - Math.exp(-1.4 * dt));
    this.speed = this.vel.length();
    this.angVel.set(0, 0, 0);
    this.gForce = damp(this.gForce, 1, 4, dt);
    this.prevVdir.copy(this.fwd);
    this.pos.addScaledVector(this.vel, dt);
  }

  updateAxes() {
    this.fwd.copy(FWD).applyQuaternion(this.quat);
    this.up.copy(UP).applyQuaternion(this.quat);
    this.right.copy(RIGHT).applyQuaternion(this.quat);
  }

  get maxThrottle() { return this.def.afterburner ? 1.1 : 1.0; }

  // Mouse-aim style: steer the nose towards a world direction.
  // Rate-commanded controller: each axis asks for a turn rate proportional to its angle error, divided by what
  // the airframe can deliver right now, so every jet tracks the cursor crisply without wobbling or overshooting.
  // Far off the nose it banks the target into the lift plane and pulls; close in it levels the wings and fine-aims
  // with pitch and rudder. Targets a little below the nose are reached by pushing instead of rolling inverted.
  autopilot(dir) {
    const d = this.def;
    _qi.copy(this.quat).invert();
    const lt = _v.copy(dir).applyQuaternion(_qi);
    const fwdness = -lt.z;
    const off = Math.acos(clamp(fwdness, -1, 1));
    const eff = Math.max(0.25, this.ctrlEff ?? 1);
    // Where the target sits around the nose: 0 = straight above the canopy, +-PI = below.
    const phase = Math.atan2(lt.x, lt.y);
    // Push (negative pitch) for targets slightly below the nose; pull-and-bank for everything else.
    if (this.pushMode) { if (off > 0.65 || lt.y > 0.04) this.pushMode = false; }
    else if (lt.y < -0.01 && off < 0.5) this.pushMode = true;
    let rollErr;
    if (this.pushMode) rollErr = phase > 0 ? phase - Math.PI : phase + Math.PI;
    else {
      rollErr = phase;
      // Directly below/behind: keep rolling the same way instead of flip-flopping across +-PI.
      if (Math.abs(rollErr) > 2.7 && this.lastRollSign) rollErr = this.lastRollSign * Math.abs(rollErr);
    }
    this.lastRollSign = Math.sign(rollErr) || this.lastRollSign || 1;
    // Wings-level bank error, used when the target is close to the nose.
    const bank = Math.atan2(-this.right.y, this.up.y);
    const horiz = clamp(Math.hypot(this.fwd.x, this.fwd.z) * 1.6, 0, 1); // levelling is meaningless pointing straight up/down
    const fine = 1 - clamp((off - 0.04) / 0.16, 0, 1); // 1 = target within ~2 degrees, 0 = beyond ~11 degrees
    // A little bank into small lateral corrections makes the turn feel coordinated.
    const lat = Math.atan2(lt.x, Math.max(fwdness, 0.2));
    const levelErr = (-bank + clamp(lat * 5, -0.5, 0.5)) * horiz;
    const rollWant = (rollErr * (1 - fine) + levelErr * fine) * 4.2;
    // Pitch: the part of the error that lies in the lift plane (pull past 90 degrees when the target is behind).
    let pitchErr = off * Math.cos(phase);
    if (fwdness < -0.2 && !this.pushMode) pitchErr = Math.max(pitchErr, off * 0.6);
    const pitchWant = pitchErr * (this.pushMode ? 2.6 : 3.4);
    const yawWant = Math.atan2(lt.x, Math.max(fwdness, 0.1)) * 2.6 * clamp(1 - off / 0.5, 0, 1);
    this.input.pitch = clamp(pitchWant / (d.pitchRate * eff), this.pushMode ? -0.75 : -1, 1);
    this.input.roll = clamp(rollWant / (d.rollRate * eff), -1, 1);
    this.input.yaw = clamp(yawWant / (d.yawRate * eff), -1, 1);
  }

  updateFlight(dt) {
    const d = this.def;
    if (this.hover) return this.updateHover(dt);
    if (this.maneuver) this.runManeuver(dt);
    else if (this.targetDir) this.autopilot(this.targetDir);
    const inp = this.input, man = this.maneuver ? NO_INPUT : this.manual;
    const brakeTurn = this.airbrake ? 1.22 : 1;
    const pitchIn = (man.pitch || inp.pitch) * (this.turnLimit ?? 1) * brakeTurn, rollIn = man.roll || inp.roll, yawIn = man.yaw || inp.yaw;
    this.ctrl = { pitch: clamp(pitchIn, -1, 1), roll: clamp(rollIn, -1, 1), yaw: clamp(yawIn, -1, 1) };

    const eff = clamp((this.speed - d.stallSpeed * 0.45) / (d.stallSpeed * 1.1), 0.12, 1) * (this.speed > d.maxSpeed * 1.08 ? 0.85 : 1);
    this.ctrlEff = eff;
    const wing = 1 - this.wingDamage * 0.45;
    this.angVel.x = damp(this.angVel.x, clamp(pitchIn, -1, 1.25) * d.pitchRate * eff * wing, 8, dt);
    this.angVel.y = damp(this.angVel.y, clamp(yawIn, -1, 1) * d.yawRate * eff, 6, dt);
    this.angVel.z = damp(this.angVel.z, (clamp(rollIn, -1, 1) + this.wingDamage * 0.12) * d.rollRate * eff, 10, dt);
    const mv = this.maneuver;
    if (mv && mv.type === 'roll') this.angVel.z = mv.dir * (Math.PI * 2 / mv.dur);
    if (mv && mv.type === 'uturn' && mv.phase === 0) this.angVel.x = Math.max(this.angVel.x, d.pitchRate * 0.95);
    _e.set(this.angVel.x * dt, -this.angVel.y * dt, -this.angVel.z * dt, 'XYZ');
    this.quat.multiply(_q.setFromEuler(_e)).normalize();
    this.updateAxes();

    let spd = this.vel.length();
    const vdir = spd > 0.1 ? _v2.copy(this.vel).divideScalar(spd) : _v2.copy(this.fwd);
    const thr = this.throttle <= 1 ? this.throttle : 1 + (this.throttle - 1) * 3.5;
    const T = d.thrust * thr * this.engineHealth * (this.boosting ? 2.4 : 1);
    const k = d.thrust / (d.maxSpeed * d.maxSpeed) * (this.airbrake ? 3.2 : 1) * (mv && mv.type === 'cobra' ? 4 : 1);
    const aoa = Math.acos(clamp(vdir.dot(this.fwd), -1, 1));
    // Turning costs energy, but not so much that every hard turn ends in a stall (sustained corner speed ~200 m/s).
    const induced = aoa * spd * 0.12 + Math.abs(this.angVel.x) * spd * 0.022;
    spd += (T * Math.max(0, this.fwd.dot(vdir)) - k * spd * spd - GRAVITY * vdir.y - induced) * dt;
    if (this.airbrake) spd -= 24 * dt;
    if (mv && mv.type === 'cobra') spd -= 40 * dt;
    spd = Math.max(spd, 0);
    if (mv && mv.type === 'uturn') spd = Math.max(spd, d.stallSpeed * 1.25); // arcade: the loop always makes it over the top

    const lift = clamp((spd - d.stallSpeed * 0.75) / (d.stallSpeed * 0.35), 0, 1);
    vdir.lerp(this.fwd, 1 - Math.exp(-5.5 * lift * dt)).normalize();
    // Gravity bends the path when there's not enough lift.
    this.vel.copy(vdir).multiplyScalar(spd);
    this.vel.y -= GRAVITY * (1 - lift) * dt;
    this.speed = this.vel.length();

    // Weathervane: nose drops towards the flight path when slow/stalled.
    if (lift < 1 || aoa > 0.35) {
      const axis = _v3.crossVectors(this.fwd, _v.copy(this.vel).normalize());
      const s = axis.length();
      if (s > 1e-4) {
        axis.divideScalar(s);
        const ang = Math.min(Math.asin(clamp(s, 0, 1)), (0.6 + 2.2 * (1 - lift)) * dt);
        this.quat.premultiply(_q.setFromAxisAngle(axis, ang)).normalize();
        this.updateAxes();
      }
    }

    // G-force estimate from flight path curvature.
    const nd = _v.copy(this.vel).normalize();
    const turn = Math.acos(clamp(nd.dot(this.prevVdir), -1, 1)) / Math.max(dt, 1e-3);
    this.prevVdir.copy(nd);
    this.gForce = damp(this.gForce, 1 + (turn * this.speed) / GRAVITY * Math.sign(this.angVel.x || 1), 6, dt);
    this.pos.addScaledVector(this.vel, dt);
    if (mv && mv.type === 'roll') this.pos.addScaledVector(mv.lateral, Math.sin(Math.PI * Math.min(1, mv.t / mv.dur)) * 48 * dt);
  }

  updateBoost(dt) {
    if (this.boosting && this.boost > 0 && !this.hover) {
      this.boost = Math.max(0, this.boost - dt / 3.2);
      if (this.boost <= 0) this.boosting = false;
    } else {
      this.boosting = false;
      this.boost = Math.min(1, this.boost + dt / 9);
    }
  }

  update(dt) {
    if (this.removed) return;
    if (!this.local) { this.updateRemote(dt); this.updateVisuals(dt); return; }
    if (this.dying) { this.updateDying(dt); this.updateVisuals(dt); return; }
    this.updateBoost(dt);
    this.updateFlight(dt);
    this.updateWeapons(dt);
    if (this.def.turrets) this.updateTurrets(dt);
    if (this.onFire) {
      this.fireTime += dt;
      this.hp -= 2.6 * dt;
      if (this.fireTime > 9 && Math.random() < dt * 0.25) this.extinguish();
      if (this.hp <= 0) this.kill(this.lastAttacker, 'fire');
    }
    const g = this.game.world.groundAt(this.pos.x, this.pos.z);
    if (this.hover && this.pos.y < g + 2.2 && this.vel.y > -9 && Math.hypot(this.vel.x, this.vel.z) < 40) {
      // Gentle VTOL touchdown: sit on the ground instead of crashing.
      this.pos.y = g + 2.2;
      if (this.vel.y < 0) this.vel.y = 0;
    } else if (this.pos.y < g + 1.5) {
      this.pos.y = g + 1.5;
      const recent = this.game.time - this.lastAttackTime < 15 ? this.lastAttacker : null;
      this.kill(recent, 'crash');
      this.crash();
    }
    if (this.pos.y > 12000) this.vel.y = Math.min(this.vel.y, 0);
    this.updateVisuals(dt);
  }

  updateRemote(dt) {
    const data = this.interp.sample(this.pos, this.quat);
    this.updateAxes();
    if (data) {
      this.vel.copy(data.vel || this.vel);
      this.speed = this.vel.length();
      this.throttle = data.th ?? this.throttle;
      this.firing = !!data.f && this.alive;
    }
    if (this.alive) this.updateWeapons(dt);
    if (this.def.turrets && this.alive) this.updateTurrets(dt);
  }

  updateWeapons(dt) {
    const gdef = this.def.guns;
    this.cmTimer -= dt;
    if (this.overcharge > 0) {
      this.overcharge = Math.max(0, this.overcharge - dt);
      this.boost = 1;
      if (Math.random() < dt * 30) this.game.effects.add.spawn(this.pos.x, this.pos.y, this.pos.z, 0, 0, 0, 0.35, this.radius * 0.9, this.radius * 1.4, 0.5, [0.5, 2.6, 3.4], [0.1, 0.6, 1], 0, 0, 2);
    }
    this.gunTimer -= dt;
    this.bombTimer -= dt;
    this.rocketTimer -= dt;
    if (this.firing && (this.ammo > 0 || !this.local)) {
      const interval = 60 / (gdef.rpm * gdef.mounts.length * (this.overcharge > 0 ? 1.6 : 1));
      let shots = 0;
      while (this.gunTimer <= 0 && shots < 8) {
        this.gunTimer += interval;
        shots++;
        this.fireGun(gdef.mounts[this.gunIndex++ % gdef.mounts.length]);
      }
      if (shots) this.game.audio?.gun(this, gdef);
    } else if (this.gunTimer < 0) this.gunTimer = 0;
  }

  fireGun(mount) {
    const g = this.def.guns;
    const muzzle = _v.set(mount[0], mount[1], mount[2]).applyQuaternion(this.quat).add(this.pos);
    const conv = _v2.copy(this.pos).addScaledVector(this.fwd, 600).sub(muzzle).normalize();
    // Locked on: the guns fire at the lead point (where the target will be when the rounds arrive), as long as
    // that point is within the gun-assist angle of the nose. Moving targets are led automatically.
    if (this.aimAssist && this.def.lock) {
      const want = _v3.copy(this.aimAssist).sub(muzzle).normalize();
      if (want.dot(conv) > Math.cos(this.def.lock.gunAssist)) conv.copy(want);
    }
    conv.x += (Math.random() - 0.5) * g.spread * 2;
    conv.y += (Math.random() - 0.5) * g.spread * 2;
    conv.z += (Math.random() - 0.5) * g.spread * 2;
    conv.normalize();
    const oc = this.overcharge > 0;
    const vel = _v3.copy(this.vel).addScaledVector(conv, g.speed * (oc ? 1.2 : 1));
    // Homing cannon (UBU-121): rounds fired while locked curve toward the locked target in flight.
    // UBU overcharge makes every jet's rounds home in, hit harder and pierce armour.
    const homing = oc ? Math.max(g.homing || 0, 0.7) : g.homing;
    let target = homing && this.lockedTarget && this.lockedTarget.alive ? this.lockedTarget : null;
    if (oc && !target && this.isPlayer) target = this.seekerTarget({ cone: 0.22, range: 1600 });
    this.game.weapons.fireBullet({ pos: muzzle, vel, team: this.team, owner: this.id, dmg: g.dmg * (oc ? 1.6 : 1), pen: oc ? Math.max(g.pen, 2) : g.pen, life: 2.3,
      color: oc ? 0x6af2ff : g.tracer, visual: !this.local, size: oc ? 1.4 : g.pen >= 2 ? 1.2 : g.dmg > 10 ? 1.25 : 1, target, turn: target ? homing : 0 });
    this.game.effects.muzzle(muzzle, this.fwd, g.dmg > 10 ? 1.5 : 1);
    if (this.local && !oc) this.ammo--;
  }

  dropBomb() {
    const b = this.def.bombs;
    if (!b || this.bombsLeft <= 0 || this.bombTimer > 0 || !this.alive) return false;
    const idx = b.count - this.bombsLeft;
    const m = b.mounts[idx % b.mounts.length];
    const pos = _v.set(m[0], m[1], m[2]).applyQuaternion(this.quat).add(this.pos).clone();
    const vel = this.vel.clone().addScaledVector(this.up, -3);
    // Guided bombs (UBU-121): dropped while locked on a ground target, they steer onto it as they fall.
    const lt = this.lockedTarget;
    const target = b.guided && lt && lt.alive && lt.type === 'ground' ? lt : null;
    this.game.weapons.dropBomb({ pos, vel, owner: this.id, team: this.team, power: b.power, visual: !this.local, skin: this.skin, quat: this.quat, scale: b.power > 1.2 ? 1.25 : 1,
      target, guide: target ? b.guided : 0 });
    if (this.parts.bombs[idx]) this.parts.bombs[idx].visible = false;
    this.bombsLeft--;
    this.bombTimer = b.interval || 0.3;
    this.bayOpenUntil = this.game.time + 2.5;
    this.game.onWeaponEvent(this, 'bomb', pos, vel, target);
    return true;
  }

  fireRocket() {
    const r = this.def.rockets;
    if (!r || this.rocketsLeft <= 0 || this.rocketTimer > 0 || !this.alive) return false;
    const m = r.mounts[this.rocketSide++ % r.mounts.length];
    const pos = _v.set(m[0], m[1], m[2] - 1.5).applyQuaternion(this.quat).add(this.pos).clone();
    const vel = this.vel.clone().addScaledVector(this.fwd, r.speed - 90);
    let target = this.lockedTarget && this.lockedTarget.alive ? this.lockedTarget : null;
    // Seeker rockets (UBU-121): with no lock yet, each rocket picks the enemy nearest its nose on its own.
    if (!target && r.seeker && this.isPlayer) target = this.seekerTarget(r.seeker);
    const turn = target ? (this.def.lock ? this.def.lock.turn : 2.2) : 0;
    this.game.weapons.fireRocket({ pos, vel, owner: this.id, team: this.team, dmg: r.dmg, visual: !this.local, skin: this.skin,
      target, turn });
    this.rocketsLeft--;
    this.rocketTimer = 0.22;
    this.game.onWeaponEvent(this, 'rocket', pos, vel, target);
    return true;
  }

  // Enemy closest to the nose inside the seeker cone (aircraft first, then ground units).
  seekerTarget(s) {
    const pick = (list, range) => {
      let best = null, bestA = s.cone;
      for (const e of list) {
        if (!e.alive || e.team === this.team) continue;
        _v.subVectors(e.hitCenter, this.pos);
        const d = _v.length();
        if (d > range || d < 60) continue;
        const a = Math.acos(clamp(_v.divideScalar(d).dot(this.fwd), -1, 1));
        if (a < bestA) { bestA = a; best = e; }
      }
      return best;
    };
    return pick(this.game.aircraft, s.range) || pick(this.game.groundUnits, s.range * 0.8);
  }

  updateTurrets(dt) {
    const tg = this.def.turretGun;
    _qi.copy(this.quat).invert();
    this.parts.turrets.forEach((t, i) => {
      const st = this.turretState[i];
      const cfg = this.def.turrets[i];
      st.retarget -= dt; st.cd -= dt;
      if (st.retarget <= 0) {
        st.retarget = 0.6;
        st.target = this.game.nearestEnemy(this, this.pos, tg.range, 'air');
      }
      const tgt = st.target;
      if (!tgt || !tgt.alive) return;
      const muzzleW = t.muzzle.getWorldPosition(_v3);
      const lead = leadPoint(muzzleW, this.vel, tgt.pos, tgt.vel, tg.speed, _v);
      const dist = lead.distanceTo(muzzleW);
      if (dist > tg.range) return;
      const local = lead.sub(this.pos).applyQuaternion(_qi).sub(t.yaw.position).normalize();
      const yaw = Math.atan2(-local.x, -local.z);
      const pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
      if (pitch < cfg.minPitch - 0.05 || pitch > cfg.maxPitch + 0.05) return;
      if (cfg.rear && Math.abs(Math.atan2(local.x, local.z)) > 1.3) return;
      t.yaw.rotation.y = damp(t.yaw.rotation.y, yaw, 10, dt);
      t.pitch.rotation.x = clamp(pitch, cfg.minPitch, cfg.maxPitch);
      if (st.cd <= 0) {
        st.cd = 60 / tg.rpm;
        const dir = _v2.set(0, 0, -1).applyQuaternion(t.pitch.getWorldQuaternion(_q));
        dir.x += (Math.random() - 0.5) * 0.012; dir.y += (Math.random() - 0.5) * 0.012; dir.normalize();
        const vel = dir.multiplyScalar(tg.speed).add(this.vel);
        this.game.weapons.fireBullet({ pos: muzzleW, vel, team: this.team, owner: this.id, dmg: tg.dmg, pen: tg.pen, life: 1.4, color: tg.tracer, visual: !this.local, size: 0.8 });
        this.game.effects.muzzle(muzzleW, dir.normalize(), 0.7);
      }
    });
  }

  damage(amount, attackerId) {
    if (!this.alive) return;
    if (this.god) { if (this.isPlayer) this.game.onPlayerHit(amount * 0.3); return; }
    if (this.dmgMul) amount *= this.dmgMul;
    this.hp -= amount;
    if (this.ai && this.ai.onDamaged) this.ai.onDamaged(amount, attackerId);
    if (attackerId) { this.lastAttacker = attackerId; this.lastAttackTime = this.game.time; }
    if (Math.random() < amount / 70) this.engineHealth = Math.max(0.4, this.engineHealth - 0.15);
    if (Math.random() < amount / 140) this.wingDamage = Math.min(1, this.wingDamage + 0.2);
    if (!this.onFire && Math.random() < amount / 260) this.setFire();
    if (this.hp < this.maxHp * 0.55 && !this.smokeEm) {
      this.smokePos = new THREE.Vector3();
      this.smokeEm = this.game.effects.addEmitter({ pos: this.smokePos, type: 'trail', rate: 30, size: 1.6, gray: 0.18 });
    }
    if (this.isPlayer) this.game.onPlayerHit(amount);
    if (this.hp <= 0) this.kill(this.lastAttacker, 'shot');
  }

  setFire() {
    this.onFire = true;
    this.fireTime = 0;
    this.firePos = new THREE.Vector3();
    this.fireEm = this.game.effects.addEmitter({ pos: this.firePos, type: 'burning', rate: 45, size: 2.4 });
  }

  extinguish() {
    this.onFire = false;
    if (this.fireEm) { this.fireEm.done = true; this.fireEm = null; }
  }

  kill(killerId, reason = 'shot') {
    if (!this.alive) return;
    this.alive = false;
    this.dying = true;
    this.hp = 0;
    this.dyingTime = 0;
    this.firing = false;
    this.maneuver = null; this.visualPitch = 0; this.hover = false; this.boosting = false;
    this.aimAssist = null; this.lockedTarget = null;
    this.spin = new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6, (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 2));
    if (!this.onFire) this.setFire();
    if (reason !== 'crash') this.game.effects.airBurst(this.pos, 0.6);
    this.game.onKill(this, killerId, reason);
  }

  // Remote-side death (from network): play the effects without re-reporting.
  netKill() {
    if (!this.alive) return;
    this.alive = false;
    this.dying = true;
    this.firing = false;
    if (!this.onFire) this.setFire();
    this.game.effects.airBurst(this.pos, 0.6);
  }

  updateDying(dt) {
    this.dyingTime += dt;
    this.angVel.lerp(this.spin, 1 - Math.exp(-2 * dt));
    _e.set(this.angVel.x * dt, this.angVel.y * dt, this.angVel.z * dt, 'XYZ');
    this.quat.multiply(_q.setFromEuler(_e)).normalize();
    this.updateAxes();
    this.vel.y -= GRAVITY * 0.85 * dt;
    this.vel.multiplyScalar(1 - 0.08 * dt);
    this.pos.addScaledVector(this.vel, dt);
    const g = this.game.world.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y < g + 1 || this.dyingTime > 30) { this.pos.y = Math.max(this.pos.y, g); this.crash(); }
  }

  crash() {
    if (this.removed) return;
    if (this.game.onCrash) this.game.onCrash(this);
    const w = this.game.world;
    const water = w.isWater(this.pos.x, this.pos.z);
    this.game.effects.explosion(this.pos, this.def.model === 'bomber' ? 2.2 : 1.4, { water });
    this.game.audio?.play('explosion', this.pos, 1);
    this.game.shake(this.pos, 1.2);
    if (!water) this.game.effects.addEmitter({ pos: this.pos.clone(), type: 'fire', rate: 10, size: 3.5, life: 25 });
    this.remove();
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.alive = false;
    this.dying = false;
    if (this.smokeEm) this.smokeEm.done = true;
    if (this.fireEm) this.fireEm.done = true;
    this.game.scene.remove(this.mesh);
    this.mesh.traverse((o) => { if (o.geometry && o.geometry.dispose && !o.userData.shared) o.geometry.dispose(); });
    this.game.removeEntity(this);
  }

  updateVisuals(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
    if (this.visualPitch) this.mesh.quaternion.multiply(_qt.setFromAxisAngle(RIGHT, this.visualPitch));
    for (const p of this.parts.props) p.rotation.z += (25 + this.throttle * 70) * dt;
    this.animateDetails(dt);
    const ab = (this.throttle > 1.01 || this.boosting) && (this.alive || this.dying === false);
    for (const b of this.parts.burners) {
      b.visible = ab;
      if (ab) { const f = (0.85 + Math.random() * 0.3) * (this.boosting ? 1.7 : 1); b.scale.set(1, 1, f); }
    }
    if (this.smokeEm) this.smokePos.copy(this.pos).addScaledVector(this.fwd, -this.radius * 0.6);
    if (this.fireEm) this.firePos.copy(this.pos).addScaledVector(this.fwd, -this.radius * 0.35);
    // Wingtip vapour in hard turns.
    if (this.alive && (this.gForce > 5.5 || (this.local && Math.abs(this.angVel.x) > this.def.pitchRate * 0.8 && this.speed > 180))) {
      this.vaporAcc += dt * 40;
      const span = this.radius * 0.8;
      while (this.vaporAcc > 1) {
        this.vaporAcc--;
        for (const s of [-1, 1]) {
          _v.copy(this.pos).addScaledVector(this.right, span * s).addScaledVector(this.fwd, -1.5);
          this.game.effects.vapor(_v, _v2.copy(this.vel).multiplyScalar(0.85), 0.7);
        }
      }
    }
  }

  // Control surfaces, flaps, landing gear, bomb bay doors, strobes and cockpit controls.
  animateDetails(dt) {
    const P = this.parts;
    const c = (this.alive && this.local && this.ctrl) || { pitch: 0, roll: 0, yaw: 0 };
    const s = this.ctrlS || (this.ctrlS = { pitch: 0, roll: 0, yaw: 0, flap: 0, gear: 0, bay: 0 });
    const k = 1 - Math.exp(-10 * dt);
    s.pitch += (c.pitch - s.pitch) * k; s.roll += (c.roll - s.roll) * k; s.yaw += (c.yaw - s.yaw) * k;
    const toward = (v, target, rate) => v + clamp(target - v, -rate * dt, rate * dt);
    const alt = this.pos.y - this.game.world.groundAt(this.pos.x, this.pos.z);
    const slow = this.speed < this.def.stallSpeed * 1.7;
    s.flap = toward(s.flap, slow && this.alive ? 1 : 0, 0.6);
    s.gear = toward(s.gear, this.alive && alt < 140 && slow ? 1 : 0, 0.5);
    s.bay = toward(s.bay, this.game.time < (this.bayOpenUntil || 0) ? 1 : 0, 1.5);
    for (const f of P.surfaces || []) {
      let a = 0;
      switch (f.role) {
        case 'aileron': a = -f.side * s.roll * 0.35; break;
        case 'flap': a = s.flap * 0.55; break;
        case 'elevator': a = -s.pitch * 0.4; break;
        case 'elevonOut': a = -s.pitch * 0.3 - f.side * s.roll * 0.3; break;
        case 'elevonIn': a = -s.pitch * 0.35 - f.side * s.roll * 0.15; break;
        case 'canard': a = s.pitch * 0.3; break;
        case 'rudder': a = s.yaw * 0.35 + s.roll * 0.04; break;
        default: break;
      }
      f.pivot.userData.surface.rotation.x = a;
    }
    for (const u of P.gear || []) {
      u.leg.rotation.x = -(1 - s.gear) * 1.6;
      u.leg.visible = u.well.visible = s.gear > 0.03;
      for (const d of u.doors) d.hinge.rotation.z = d.side * Math.min(1, s.gear * 3) * 1.45;
    }
    for (const d of P.bayDoors || []) d.hinge.rotation.z = d.side * s.bay * 1.3;
    if (P.strobes) {
      const t = this.game.time * 1.1;
      P.strobes[0].visible = this.alive && t % 1 < 0.07;
      P.strobes[1].visible = this.alive && (t + 0.5) % 1 < 0.07;
    }
    if (P.cockpit && P.cockpit.visible) {
      const st = P.cockpit.userData.stick;
      st.rotation.x = s.pitch * 0.25; st.rotation.z = -s.roll * 0.25;
      P.cockpit.userData.throttle.rotation.x = -(this.throttle - 0.5) * 0.7;
    }
  }

  // Network state for this aircraft.
  netState() {
    const p = this.pos, q = this.quat, v = this.vel;
    const r = (x, n = 10) => Math.round(x * n) / n;
    return { p: [r(p.x), r(p.y), r(p.z)], q: [r(q.x, 1000), r(q.y, 1000), r(q.z, 1000), r(q.w, 1000)],
      v: [r(v.x), r(v.y), r(v.z)], th: r(this.throttle, 100), f: this.firing ? 1 : 0,
      hp: Math.max(0, Math.round(this.hp)), a: this.alive ? 1 : 0 };
  }

  applyNetState(s) {
    _v.set(s.p[0], s.p[1], s.p[2]);
    _q.set(s.q[0], s.q[1], s.q[2], s.q[3]).normalize();
    this.interp.push(_v, _q, { vel: new THREE.Vector3(s.v[0], s.v[1], s.v[2]), th: s.th, f: s.f });
    if (typeof s.hp === 'number') this.hp = s.hp;
    if (s.a === 0 && this.alive) this.netKill();
  }
}
