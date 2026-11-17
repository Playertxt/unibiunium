// Ground units: tanks, AA guns, trucks, structures and ships.
import * as THREE from 'three';
import { GROUND, clamp, damp } from './config.js';
import { buildGroundModel, wreckify } from './models_ground.js';
import { Interp, leadPoint } from './aircraft.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

export class GroundUnit {
  constructor(game, o) {
    this.game = game;
    this.id = o.id;
    this.kind = o.kind;
    this.def = GROUND[o.kind];
    this.team = o.team;
    this.skin = o.skin ?? (o.team === 1 ? 1 : 0);
    this.name = o.name || this.def.name;
    this.type = 'ground';
    this.local = o.local !== false;
    this.radius = this.def.radius;
    this.maxHp = this.def.hp * (o.hpMul || 1);
    this.hp = this.maxHp;
    this.alive = true;
    this.removed = false;
    this.isShip = o.kind === 'ship';
    this.pos = new THREE.Vector3(o.x, 0, o.z);
    this.pos.y = this.isShip ? 0 : game.world.heightAt(o.x, o.z);
    this.hitCenter = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = o.heading ?? 0;
    this.turretYaw = 0;
    this.pitch = 0;
    this.path = o.path || null;
    this.loop = !!o.loop;
    this.wp = 0;
    this.speed = (this.def.speed || 0) * (o.speedMul || 1);
    this.static = !this.def.speed || !this.path;
    this.reload = Math.random() * 3;
    this.burst = 0;
    this.target = null;
    this.retarget = Math.random();
    this.objective = !!o.objective;
    this.interp = new Interp();
    const m = buildGroundModel(o.kind, this.skin);
    this.mesh = m.group;
    this.turret = m.turret; this.barrel = m.barrel; this.muzzle = m.muzzle; this.dish = m.dish;
    game.scene.add(this.mesh);
    this.normal = new THREE.Vector3(0, 1, 0);
    this.updateTransform(1);
  }

  updateTransform(dt) {
    const w = this.game.world;
    if (this.isShip) { this.pos.y = Math.sin(this.game.time * 0.6 + this.pos.x) * 0.3; this.normal.set(0, 1, 0); }
    else {
      this.pos.y = w.heightAt(this.pos.x, this.pos.z);
      const n = w.normalAt(this.pos.x, this.pos.z, _v2);
      this.normal.lerp(n, this.radius > 10 ? 0 : 1 - Math.exp(-5 * dt)).normalize();
      if (this.radius > 10) this.normal.set(0, 1, 0);
    }
    this.hitCenter.copy(this.pos).y += Math.min(this.radius * 0.5, 6);
    this.mesh.position.copy(this.pos);
    _q.setFromAxisAngle(UP, this.heading);
    const tilt = new THREE.Quaternion().setFromUnitVectors(UP, this.normal);
    this.mesh.quaternion.copy(tilt.multiply(_q));
    if (this.turret) this.turret.rotation.y = this.turretYaw;
    if (this.barrel) this.barrel.rotation.x = this.pitch;
  }

  update(dt) {
    if (this.removed) return;
    if (this.kind === 'pilot') { if (this.dish) this.dish.visible = this.game.time % 1 < 0.12; }
    else if (this.dish && this.alive) this.dish.rotation.y += dt * (this.kind === 'sam' ? 2.4 : 1.2);
    if (!this.alive) return;
    if (!this.local) {
      const d = this.interp.sample(this.pos, _q);
      if (d) { this.heading = d.h; this.turretYaw = damp(this.turretYaw, d.ty, 8, dt); this.pitch = d.p; }
      this.updateTransform(dt);
      this.reload -= dt;
      if (d && d.f && this.def.weapon && this.muzzle) {
        if (this.def.weapon.type === 'aa') this.fire(dt, true, 800);
        else if (this.def.weapon.type === 'sam') { /* missiles arrive as weapon events */ }
        else if (this.reload <= 0) { this.reload = 1.2; this.fire(dt, true); }
      }
      this.track(dt);
      return;
    }
    this.retarget -= dt;
    if (this.retarget <= 0) { this.retarget = 1 + Math.random(); this.pickTarget(); }
    let moving = !this.static;
    if (this.target && this.def.weapon && this.def.weapon.type === 'shell' && this.def.speed) moving = moving && Math.random() < 0.97 && this.target.pos.distanceTo(this.pos) > this.def.weapon.range * 0.6;
    if (moving) this.move(dt);
    else this.vel.set(0, 0, 0);
    this.aim(dt);
    this.updateTransform(dt);
    this.track(dt);
  }

  // Smoothed real ground speed, measured from how far the unit actually moved. Used to lead shots and homing
  // weapons: `vel` flickers to zero whenever a tank pauses for a frame, and is never sent for multiplayer
  // clients' copies of host-owned units, so leading on `vel` aimed at where the tank was, not where it's going.
  track(dt) {
    if (!this.trackVel) { this.trackVel = new THREE.Vector3(); this.prevPos = this.pos.clone(); return; }
    if (dt > 1e-4) {
      _v.subVectors(this.pos, this.prevPos).divideScalar(dt);
      _v.y = 0;
      if (_v.lengthSq() > 60 * 60) _v.set(0, 0, 0); // teleport / snapshot jump, not motion
      this.trackVel.lerp(_v, 1 - Math.exp(-2.5 * dt));
    }
    this.prevPos.copy(this.pos);
  }

  move(dt) {
    const p = this.path[this.wp];
    if (!p) { this.static = true; return; }
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 12) {
      this.wp++;
      if (this.wp >= this.path.length) { if (this.loop) this.wp = 0; else { this.static = true; return; } }
      return;
    }
    const want = Math.atan2(-dx, -dz);
    this.heading += clamp(angDiff(this.heading, want), -0.5 * dt, 0.5 * dt);
    const sp = this.speed;
    this.vel.set(-Math.sin(this.heading) * sp, 0, -Math.cos(this.heading) * sp);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
  }

  pickTarget() {
    const w = this.def.weapon;
    if (!w) { this.target = null; return; }
    this.target = this.game.nearestEnemy(this, this.pos, w.range, w.type === 'aa' || w.type === 'sam' ? 'air' : 'ground');
  }

  aim(dt) {
    const w = this.def.weapon;
    if (!w || !this.turret) return;
    const t = this.target;
    this.reload -= dt;
    if (w.type === 'sam') return this.aimSam(dt, w, t);
    if (!t || !t.alive) { this.firing = false; return; }
    const mz = this.muzzle.getWorldPosition(_v2);
    let aimP;
    if (w.type === 'aa') aimP = leadPoint(mz, this.vel, t.pos, t.vel, w.speed, _v);
    else aimP = _v.copy(t.hitCenter);
    const dx = aimP.x - mz.x, dz = aimP.z - mz.z, dy = aimP.y - mz.y;
    const horiz = Math.hypot(dx, dz);
    if (horiz > w.range * 1.1 && w.type !== 'aa') { this.firing = false; return; }
    const worldYaw = Math.atan2(-dx, -dz);
    const want = angDiff(0, worldYaw - this.heading);
    const rate = w.type === 'aa' ? 2.5 : 0.7;
    this.turretYaw += clamp(angDiff(this.turretYaw, want), -rate * dt, rate * dt);
    let pitchWant = Math.atan2(dy, horiz);
    if (w.type === 'shell') pitchWant += 0.5 * Math.asin(clamp(9.81 * horiz / (w.speed * w.speed), -1, 1));
    this.pitch = damp(this.pitch, clamp(pitchWant, -0.15, w.type === 'aa' ? 1.45 : 0.35), 4, dt);
    const aligned = Math.abs(angDiff(this.turretYaw, want)) < 0.06;
    this.firing = false;
    if (!aligned || this.reload > 0) return;
    if (w.type === 'aa') {
      if (Math.hypot(horiz, dy) > w.range) return;
      this.burst += dt;
      if (this.burst > 1.1) { this.burst = 0; this.reload = 1.3 + Math.random(); return; }
      this.firing = true;
      this.fire(dt, false, Math.hypot(horiz, dy));
    } else {
      this.reload = w.reload * (0.8 + Math.random() * 0.4);
      this.firing = true;
      this.flagUntil = this.game.time + 0.3;
      this.fire(dt, false);
    }
  }

  // SAM: the radar has to hold the target (above its radar horizon) for `lock` seconds before a launch.
  aimSam(dt, w, t) {
    this.firing = false;
    if (!t || !t.alive) { this.samLock = 0; return; }
    const g = this.game;
    const agl = t.pos.y - g.world.groundAt(t.pos.x, t.pos.z);
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dy = t.pos.y - this.pos.y;
    const horiz = Math.hypot(dx, dz);
    const want = angDiff(0, Math.atan2(-dx, -dz) - this.heading);
    this.turretYaw += clamp(angDiff(this.turretYaw, want), -1.6 * dt, 1.6 * dt);
    this.pitch = damp(this.pitch, clamp(Math.atan2(dy, horiz) + 0.12, 0.25, 1.2), 3, dt);
    const seen = agl > w.minAlt && Math.hypot(horiz, dy) < w.range && !(g.radarJamAt && g.radarJamAt(this.pos));
    if (!seen) { this.samLock = Math.max(0, (this.samLock || 0) - dt * 1.5); return; }
    if (Math.abs(angDiff(this.turretYaw, want)) < 0.3) this.samLock = (this.samLock || 0) + dt;
    if (t === g.player) g.samWarn = Math.max(g.samWarn || 0, Math.min(1, this.samLock / w.lock));
    if (this.samLock >= w.lock && this.reload <= 0) {
      this.samLock = 0;
      this.reload = w.reload * (0.85 + Math.random() * 0.3);
      this.flagUntil = g.time + 0.4;
      const mz = this.muzzle.getWorldPosition(_v2).clone();
      const dir = _v.set(0, 0, -1).applyQuaternion(this.barrel.getWorldQuaternion(_q));
      const vel = dir.clone().multiplyScalar(90);
      g.weapons.fireMissile({ pos: mz, vel, owner: this.id, team: this.team, target: t, seeker: 'radar', skin: this.skin, dmg: w.dmg });
      g.onWeaponEvent(this, 'missile', mz, vel, t);
      g.effects.smoke(mz, _v.set(0, 2, 0), 4, 4, 0.8, 0.7);
      g.effects.muzzle(mz, dir, 5);
      if (t === g.player) g.message('SAM launch!', 2, '#e2574b');
    }
  }

  fire(dt, visual, range = 0) {
    const w = this.def.weapon;
    const mz = this.muzzle.getWorldPosition(_v2);
    const dir = _v.set(0, 0, -1).applyQuaternion(this.barrel.getWorldQuaternion(_q));
    const fx = this.game.effects;
    if (w.type === 'aa') {
      this.aaTimer = (this.aaTimer || 0) - dt;
      if (this.aaTimer > 0) return;
      this.aaTimer = 60 / w.rpm;
      const sp = 0.022;
      dir.x += (Math.random() - 0.5) * sp; dir.y += (Math.random() - 0.5) * sp; dir.z += (Math.random() - 0.5) * sp; dir.normalize();
      const flak = Math.random() < 0.35 && range > 300;
      const life = flak ? range / w.speed * (0.92 + Math.random() * 0.16) : 2.0;
      this.game.weapons.fireBullet({ pos: mz, vel: dir.clone().multiplyScalar(w.speed), team: this.team, owner: this.id, dmg: w.dmg, pen: 1,
        life, color: this.team === 0 ? 0x9fff8a : 0xff7a5a, visual, fuse: flak ? 14 : 0, size: 1.1 });
      fx.muzzle(mz, dir, 1.4);
      if (Math.random() < 0.3) this.game.audio?.play('aa', mz, 0.5);
    } else {
      const sp = 0.012;
      dir.x += (Math.random() - 0.5) * sp; dir.y += (Math.random() - 0.5) * sp * 0.5; dir.z += (Math.random() - 0.5) * sp; dir.normalize();
      this.game.weapons.fireBullet({ pos: mz, vel: dir.clone().multiplyScalar(w.speed), team: this.team, owner: this.id, dmg: w.dmg, pen: 2,
        life: 4, color: 0xffe0a0, visual, size: 2.2, boom: 0.45 });
      fx.muzzle(mz, dir, 4);
      fx.smoke(mz, _v.set(0, 1, 0), 2, 2, 0.55, 0.5);
      this.game.audio?.play('cannon', mz, 0.7);
    }
  }

  damage(amount, attackerId) {
    if (!this.alive || this.def.passive) return;
    this.hp -= amount;
    if (attackerId) { this.lastAttacker = attackerId; }
    if (this.hp <= 0) this.kill(attackerId);
  }

  kill(killerId) {
    if (!this.alive) return;
    this.deathFx();
    this.game.onKill(this, killerId, 'destroyed');
  }

  netKill() { if (this.alive) this.deathFx(); }

  deathFx() {
    this.alive = false;
    this.hp = 0;
    this.firing = false;
    const fx = this.game.effects;
    const big = { tank: 1.3, heavytank: 1.7, aa: 0.9, truck: 0.8, bunker: 1.4, depot: 2.8, radar: 1.4, hangar: 2.4, hq: 3.4, ship: 3, sam: 1.2 }[this.kind] || 1;
    fx.explosion(this.hitCenter, big, { water: this.isShip });
    this.game.audio?.play('explosion', this.pos, 1);
    this.game.shake(this.pos, big);
    if (this.def.explosive || this.kind === 'hq' || this.kind === 'ship') {
      for (let i = 1; i <= 4; i++) setTimeout(() => {
        if (this.game.over && this.game.disposed) return;
        _v.copy(this.hitCenter).add(new THREE.Vector3((Math.random() - 0.5) * this.radius * 1.5, Math.random() * 6, (Math.random() - 0.5) * this.radius * 1.5));
        fx.explosion(_v, big * 0.5, { noCrater: true, water: this.isShip });
      }, i * 280 + Math.random() * 300);
    }
    wreckify(this.mesh);
    if (this.turret) { this.turret.rotation.z = (Math.random() - 0.5) * 0.4; this.turret.position.y += 0.2; }
    if (this.barrel) this.barrel.rotation.x = -0.12;
    if (this.isShip) this.sinking = true;
    const smokePos = this.hitCenter.clone();
    this.wreckFx = [
      fx.addEmitter({ pos: smokePos, type: 'fire', rate: Math.min(14, 4 + big * 3), size: 1.6 + big, life: 40 + Math.random() * 30 }),
    ];
  }

  netState() {
    const r = (x, n = 10) => Math.round(x * n) / n;
    return [this.id, r(this.pos.x), r(this.pos.z), r(this.heading, 100), r(this.turretYaw, 100), r(this.pitch, 100), Math.round(this.hp), this.alive ? 1 : 0, (this.firing || this.game.time < (this.flagUntil || 0)) ? 1 : 0];
  }

  applyNetState(s) {
    _v.set(s[1], this.pos.y, s[2]);
    this.interp.push(_v, _q.identity(), { h: s[3], ty: s[4], p: s[5], f: s[8] });
    this.hp = s[6];
    if (!s[7] && this.alive) this.netKill();
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.game.scene.remove(this.mesh);
    this.mesh.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    if (this.wreckFx) this.wreckFx.forEach((e) => { e.done = true; });
  }
}
