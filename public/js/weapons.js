// Projectiles: bullets/tracers (instanced), flak, bombs and rockets with hit detection.
import * as THREE from 'three';
import { GRAVITY, MISSILE } from './config.js';
import { makeBombModel, makeRocketModel } from './models.js';

const MAX_BULLETS = 2500;
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpS = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

// Closest approach of segment AB to point C; returns squared distance.
function segDist2(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? (acx * abx + acy * aby + acz * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + abx * t - cx, dy = ay + aby * t - cy, dz = az + abz * t - cz;
  return dx * dx + dy * dy + dz * dz;
}

export class Weapons {
  constructor(game) {
    this.game = game;
    const B = this.b = {
      p: new Float32Array(MAX_BULLETS * 3), v: new Float32Array(MAX_BULLETS * 3), life: new Float32Array(MAX_BULLETS),
      dmg: new Float32Array(MAX_BULLETS), pen: new Uint8Array(MAX_BULLETS), team: new Int16Array(MAX_BULLETS),
      owner: new Array(MAX_BULLETS), visual: new Uint8Array(MAX_BULLETS), fuse: new Float32Array(MAX_BULLETS),
      size: new Float32Array(MAX_BULLETS), alive: new Uint8Array(MAX_BULLETS), col: new Array(MAX_BULLETS), boom: new Float32Array(MAX_BULLETS),
      tgt: new Array(MAX_BULLETS), turn: new Float32Array(MAX_BULLETS), // homing rounds: target and turn rate (rad/s)
    };
    this.head = 0;
    this.blastId = 0;
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1, true).rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.tracers = new THREE.InstancedMesh(geo, mat, MAX_BULLETS);
    this.tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracers.setColorAt(0, new THREE.Color());
    this.tracers.count = 0;
    this.tracers.frustumCulled = false;
    this.tracers.renderOrder = 5;
    game.scene.add(this.tracers);
    this.bombs = [];
    this.rockets = [];
    this.missiles = [];
    this.flares = []; // flares and chaff bundles: decoys that missiles may chase instead of their target
    this.color = new THREE.Color();
  }

  // Guided missile. seeker 'ir' (heat-seeker, spoofed by flares) or 'radar' (SAM, spoofed by chaff).
  fireMissile(o) {
    const M = MISSILE[o.seeker] || MISSILE.ir;
    const mesh = makeRocketModel(o.skin ?? 1);
    mesh.scale.setScalar(1.9);
    mesh.position.copy(o.pos);
    this.game.scene.add(mesh);
    const m = { mesh, pos: o.pos.clone(), vel: o.vel.clone(), owner: o.owner, team: o.team, target: o.target || null, origTarget: o.target || null,
      seeker: o.seeker || 'ir', M, dmg: o.dmg ?? M.dmg, visual: !!o.visual, age: 0, seen: new Set() };
    this.missiles.push(m);
    this.game.audio?.play('missile', o.pos);
    return m;
  }

  // Drop a flare (bright, falls and burns out) or a chaff bundle (a glittering cloud that hangs in the air).
  dropDecoy(kind, pos, vel, team, owner, visual = false) {
    const flare = kind === 'flare';
    const v = vel.clone().multiplyScalar(flare ? 0.55 : 0.25);
    v.x += (Math.random() - 0.5) * 30; v.y += flare ? -8 - Math.random() * 10 : (Math.random() - 0.5) * 6; v.z += (Math.random() - 0.5) * 30;
    const d = { kind, pos: pos.clone(), vel: v, team, owner, age: 0, life: flare ? 3.4 : 4.5, alive: true, removed: false, visual };
    d.hitCenter = d.pos;
    this.flares.push(d);
    if (!flare) for (let i = 0; i < 14; i++) this.game.effects.add.spawn(d.pos.x, d.pos.y, d.pos.z, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22,
      1.6 + Math.random() * 2.4, 0.9, 0.5, 0.9, [2.4, 2.5, 2.7], [0.8, 0.85, 0.9], 2.5, -1, 2);
    return d;
  }

  fireBullet(o) {
    const i = this.head;
    this.head = (this.head + 1) % MAX_BULLETS;
    const B = this.b;
    B.alive[i] = 1;
    B.p[i * 3] = o.pos.x; B.p[i * 3 + 1] = o.pos.y; B.p[i * 3 + 2] = o.pos.z;
    B.v[i * 3] = o.vel.x; B.v[i * 3 + 1] = o.vel.y; B.v[i * 3 + 2] = o.vel.z;
    B.life[i] = o.life ?? 2.2;
    B.dmg[i] = o.dmg ?? 5; B.pen[i] = o.pen ?? 0; B.team[i] = o.team ?? -1; B.owner[i] = o.owner ?? null;
    B.visual[i] = o.visual ? 1 : 0;
    B.fuse[i] = o.fuse ?? 0;
    B.size[i] = o.size ?? 1;
    B.boom[i] = o.boom ?? 0;
    B.col[i] = o.color ?? 0xffc46a;
    B.tgt[i] = o.target || null;
    B.turn[i] = o.turn || 0;
  }

  dropBomb(o) {
    const mesh = makeBombModel(o.skin ?? 0, o.scale ?? 1);
    mesh.position.copy(o.pos);
    if (o.quat) mesh.quaternion.copy(o.quat);
    this.game.scene.add(mesh);
    this.bombs.push({ mesh, pos: o.pos.clone(), vel: o.vel.clone(), owner: o.owner, team: o.team, power: o.power ?? 1, visual: !!o.visual, age: 0,
      target: o.target || null, guide: o.guide || 0 });
  }

  fireRocket(o) {
    const mesh = makeRocketModel(o.skin ?? 0);
    mesh.position.copy(o.pos);
    this.game.scene.add(mesh);
    const dir = o.vel.clone().normalize();
    this.rockets.push({ mesh, pos: o.pos.clone(), vel: o.vel.clone(), dir, owner: o.owner, team: o.team, dmg: o.dmg ?? 80, visual: !!o.visual, age: 0, burn: 1.6,
      target: o.target || null, turn: o.turn || 0 });
    this.game.audio?.play('rocket', o.pos);
  }

  update(dt) {
    const g = this.game, world = g.world, fx = g.effects;
    const B = this.b;
    const cands = g.hitCandidates();
    const cam = g.camera.position;
    let n = 0;
    for (let i = 0; i < MAX_BULLETS; i++) {
      if (!B.alive[i]) continue;
      const i3 = i * 3;
      const ax = B.p[i3], ay = B.p[i3 + 1], az = B.p[i3 + 2];
      if (B.tgt[i]) this.steerBullet(i, dt);
      B.v[i3 + 1] -= GRAVITY * dt;
      const bx = ax + B.v[i3] * dt, by = ay + B.v[i3 + 1] * dt, bz = az + B.v[i3 + 2] * dt;
      B.p[i3] = bx; B.p[i3 + 1] = by; B.p[i3 + 2] = bz;
      B.life[i] -= dt;
      let dead = false;
      if (B.life[i] <= 0) {
        dead = true;
        if (B.fuse[i] > 0) { // flak burst
          tmpV.set(bx, by, bz);
          fx.flak(tmpV);
          if (!B.visual[i]) g.areaDamage(tmpV, B.fuse[i], B.dmg[i] * 3, B.owner[i], B.team[i], { pen: 0, explosive: true, airOnly: true, weapon: 'flak' });
        }
      }
      if (!dead && !B.visual[i]) {
        const team = B.team[i], owner = B.owner[i];
        for (let k = 0; k < cands.length; k++) {
          const e = cands[k];
          if (e.team === team || e.id === owner) continue;
          const c = e.hitCenter;
          const r = e.radius;
          if (Math.abs(c.x - bx) > 400 || Math.abs(c.z - bz) > 400) continue;
          if (segDist2(ax, ay, az, bx, by, bz, c.x, c.y, c.z) < r * r) {
            tmpV.set(bx, by, bz);
            g.applyDamage(e, B.dmg[i], owner, { pen: B.pen[i], pos: tmpV, weapon: B.boom[i] ? 'shell' : 'gun' });
            if (B.boom[i]) fx.explosion(tmpV, B.boom[i], { noCrater: true });
            else fx.impact(tmpV, 'metal');
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        const h = world.groundAt(bx, bz);
        if (by <= h) {
          tmpV.set(bx, h, bz);
          const wet = world.isWater(bx, bz);
          if (B.boom[i]) fx.explosion(tmpV, B.boom[i], { water: wet, noCrater: B.boom[i] < 0.4 });
          else if ((bx - cam.x) ** 2 + (bz - cam.z) ** 2 < 2500 * 2500) fx.impact(tmpV, wet ? 'water' : 'ground');
          dead = true;
        }
      }
      if (dead) { B.alive[i] = 0; B.tgt[i] = null; continue; }
      // tracer instance
      const vx = B.v[i3], vy = B.v[i3 + 1], vz = B.v[i3 + 2];
      const sp = Math.hypot(vx, vy, vz);
      const dist = Math.sqrt((bx - cam.x) ** 2 + (by - cam.y) ** 2 + (bz - cam.z) ** 2);
      const w = (0.16 + dist * 0.0011) * B.size[i];
      const len = Math.min(sp * 0.018, 22) * B.size[i] + dist * 0.004;
      tmpV.set(vx / sp, vy / sp, vz / sp);
      tmpQ.setFromUnitVectors(Z, tmpV);
      tmpS.set(w, w, len);
      tmpM.compose(tmpV.set(bx - vx / sp * len * 0.5, by - vy / sp * len * 0.5, bz - vz / sp * len * 0.5), tmpQ, tmpS);
      this.tracers.setMatrixAt(n, tmpM);
      this.color.setHex(B.col[i]).multiplyScalar(2.2);
      this.tracers.setColorAt(n, this.color);
      n++;
    }
    this.tracers.count = n;
    this.tracers.instanceMatrix.needsUpdate = true;
    if (this.tracers.instanceColor) this.tracers.instanceColor.needsUpdate = true;

    this.updateBombs(dt);
    this.updateRockets(dt, cands);
    this.updateDecoys(dt);
    this.updateMissiles(dt, cands);
  }

  updateDecoys(dt) {
    const fx = this.game.effects;
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const d = this.flares[i];
      d.age += dt;
      if (d.kind === 'flare') { d.vel.y -= GRAVITY * 0.35 * dt; d.vel.multiplyScalar(1 - 0.6 * dt); }
      else d.vel.multiplyScalar(1 - 1.8 * dt);
      d.pos.addScaledVector(d.vel, dt);
      if (d.kind === 'flare') {
        const k = 1 - d.age / d.life;
        fx.add.spawn(d.pos.x, d.pos.y, d.pos.z, 0, 0, 0, 0.09, 5 * k + 2, 3, 1, [5, 4.2, 3], [3, 1.6, 0.6], 0, 0, 2);
        if (Math.random() < 0.6) fx.smoke(d.pos, tmpV.set(0, 1, 0), 1.2, 2.2, 0.75, 0.4);
      } else if (Math.random() < dt * 20) {
        fx.add.spawn(d.pos.x + (Math.random() - 0.5) * 8, d.pos.y + (Math.random() - 0.5) * 8, d.pos.z + (Math.random() - 0.5) * 8, 0, -1, 0, 0.5, 0.8, 0.3, 0.9, [2.6, 2.7, 3], [1, 1, 1.1], 1, 0, 2);
      }
      if (d.age >= d.life || d.pos.y < this.game.world.groundAt(d.pos.x, d.pos.z)) { d.alive = false; d.removed = true; this.flares.splice(i, 1); }
    }
  }

  updateMissiles(dt, cands) {
    const g = this.game, fx = g.effects;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i], M = m.M;
      m.age += dt;
      const ax = m.pos.x, ay = m.pos.y, az = m.pos.z;
      let spd = m.vel.length();
      const dir = tmpS.copy(m.vel).divideScalar(Math.max(spd, 1e-3));
      // Motor: accelerate to top speed, then coast and bleed speed (a long chase runs it out of energy).
      if (m.age < M.motor) spd = Math.min(M.maxSpeed, spd + 260 * dt);
      else spd = Math.max(0, spd - (18 + spd * 0.045) * dt);
      if (m.target) this.checkDecoys(m, dir);
      if (m.target && spd > 170) this.steerMissile(m, dir, dt);
      m.vel.copy(dir).multiplyScalar(spd);
      if (!m.target || spd <= 170) m.vel.y -= GRAVITY * dt;
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      m.mesh.quaternion.setFromUnitVectors(Z, tmpV.copy(m.vel).normalize().negate());
      if (m.age < M.motor) {
        fx.fireball(m.pos, tmpV.set(0, 0, 0), 2.1, 0.07);
        fx.smoke(m.pos, tmpV.set(0, 0.4, 0), 1.6, 3.4, 0.82, 0.55);
      } else if (Math.random() < 0.5) fx.smoke(m.pos, tmpV.set(0, 0.4, 0), 1.0, 2, 0.7, 0.3);
      let hitE = null;
      const t = m.target;
      if (t && !t.kind) { // a real aircraft (decoys have a `kind` of flare/chaff)
        if (segDist2(ax, ay, az, m.pos.x, m.pos.y, m.pos.z, t.hitCenter.x, t.hitCenter.y, t.hitCenter.z) < (t.radius + M.fuse) ** 2) hitE = t;
      }
      if (!hitE && !m.visual) for (const e of cands) {
        if (e.team === m.team || e.id === m.owner || e.type !== 'air') continue;
        const rr = e.radius + 2;
        if (segDist2(ax, ay, az, m.pos.x, m.pos.y, m.pos.z, e.hitCenter.x, e.hitCenter.y, e.hitCenter.z) < rr * rr) { hitE = e; break; }
      }
      const decoyHit = t && t.kind && m.pos.distanceToSquared(t.pos) < 64;
      const h = g.world.groundAt(m.pos.x, m.pos.z);
      if (hitE || decoyHit || m.pos.y <= h || m.age > M.life) {
        if (m.pos.y < h) m.pos.y = h;
        const air = m.pos.y - h > 8;
        fx.explosion(m.pos, 0.75, { air, water: g.world.isWater(m.pos.x, m.pos.z), noCrater: air });
        g.audio?.play('explosion', m.pos, 0.7);
        if (!m.visual) {
          if (hitE) g.applyDamage(hitE, m.dmg, m.owner, { pen: 3, explosive: true, pos: m.pos, weapon: 'missile' });
          g.areaDamage(m.pos, 16, m.dmg * 0.45, m.owner, m.team, { pen: 3, explosive: true, airOnly: true, exclude: hitE, weapon: 'missile' });
        }
        // The missile was chasing a decoy: count the spoof for whoever it was really after.
        if (!hitE && m.origTarget && m.decoyedBy && g.onMissileSpoofed) g.onMissileSpoofed(m);
        this.removeMissile(i);
      }
    }
  }

  removeMissile(i) { this.game.scene.remove(this.missiles[i].mesh); this.missiles.splice(i, 1); }

  // Each decoy gets one chance per missile to seduce its seeker, if it's inside the seeker cone.
  checkDecoys(m, dir) {
    if (m.target.kind) return;
    for (const d of this.flares) {
      if (m.seen.has(d) || d.team === m.team) continue;
      tmpV.subVectors(d.pos, m.pos);
      const dist = tmpV.length();
      if (dist > 2200) continue;
      if (tmpV.divideScalar(dist).dot(dir) < 0.82) continue; // outside the seeker's field of view
      m.seen.add(d);
      const right = (d.kind === 'flare') === (m.seeker === 'ir');
      if (Math.random() < (right ? m.M.decoy : 0.04)) { m.target = d; m.decoyedBy = d.kind; return; }
    }
  }

  // Proportional lead toward the target, limited by turn rate. Outside the seeker gimbal limit the lock breaks.
  steerMissile(m, dir, dt) {
    const t = m.target;
    if (!t.alive || t.removed) { m.target = null; return; }
    const c = t.hitCenter;
    const spd = Math.max(m.vel.length(), 50);
    const tgo = m.pos.distanceTo(c) / spd;
    const aim = tmpV.copy(c);
    const tv = t.trackVel || t.vel;
    if (tv) aim.addScaledVector(tv, Math.min(tgo, 4) * 0.9);
    aim.sub(m.pos).normalize();
    const dot = Math.max(-1, Math.min(1, dir.dot(aim)));
    const ang = Math.acos(dot);
    if (ang > m.M.gimbal) { m.target = null; m.lost = true; return; }
    const k = ang > 1e-4 ? Math.min(1, (m.M.turn * dt) / ang) : 1;
    dir.lerp(aim, k).normalize();
  }

  updateBombs(dt) {
    const g = this.game;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.age += dt;
      if (b.target) this.guideBomb(b, dt);
      b.vel.y -= GRAVITY * dt;
      b.vel.multiplyScalar(1 - 0.012 * dt);
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      if (b.age > 0.05) b.mesh.quaternion.slerp(tmpQ.setFromUnitVectors(Z, tmpV.copy(b.vel).normalize().negate()), Math.min(1, dt * 3));
      const h = g.world.groundAt(b.pos.x, b.pos.z);
      let hit = b.pos.y <= h;
      let hitAir = null;
      if (!hit && b.age > 0.5) {
        for (const e of g.groundUnits) {
          if (!e.alive || e.radius < 6) continue;
          if (b.pos.distanceToSquared(e.hitCenter) < e.radius * e.radius) { hit = true; break; }
        }
        // A falling bomb that strikes an aircraft below goes off on contact.
        if (!hit) for (const e of g.aircraft) {
          if (!e.alive || e.id === b.owner || (e.team === b.team && !g.ffa)) continue;
          if (b.pos.distanceToSquared(e.hitCenter) < (e.radius + 1.5) ** 2) { hit = true; hitAir = e; break; }
        }
      }
      if (hit || b.age > 60) {
        if (b.pos.y < h) b.pos.y = h;
        const water = g.world.isWater(b.pos.x, b.pos.z);
        g.effects.explosion(b.pos, 1.3 * b.power, { water, air: !!hitAir, noCrater: !!hitAir });
        g.audio?.play('bomb', b.pos);
        g.shake(b.pos, 1.4 * b.power);
        const info = { pen: 3, explosive: true, weapon: 'bomb', blast: ++this.blastId };
        if (!b.visual && hitAir) g.applyDamage(hitAir, 300 * b.power, b.owner, info);
        if (!b.visual) g.areaDamage(b.pos, 24 * Math.sqrt(b.power), 300 * b.power, b.owner, b.team, { ...info, exclude: hitAir });
        g.scene.remove(b.mesh);
        this.bombs.splice(i, 1);
      }
    }
  }

  updateRockets(dt, cands) {
    const g = this.game, fx = g.effects;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.age += dt;
      const ax = r.pos.x, ay = r.pos.y, az = r.pos.z;
      if (r.target && !r.target.kind && this.flares.length) {
        if (!r.seen) r.seen = new Set();
        for (const d of this.flares) {
          if (r.seen.has(d) || d.kind !== 'flare' || d.team === r.team) continue;
          r.seen.add(d);
          if (d.pos.distanceTo(r.pos) < 1400 && Math.random() < 0.3) { r.target = d; break; }
        }
      }
      if (r.target) this.steerRocket(r, dt);
      if (r.age < r.burn) r.vel.addScaledVector(r.dir, 60 * dt);
      if (!r.target) r.vel.y -= GRAVITY * 0.5 * dt;
      r.pos.addScaledVector(r.vel, dt);
      r.mesh.position.copy(r.pos);
      r.mesh.quaternion.setFromUnitVectors(Z, tmpV.copy(r.vel).normalize().negate());
      if (r.age < r.burn) {
        fx.fireball(r.pos, tmpV.set(0, 0, 0), 1.6, 0.08);
        fx.smoke(r.pos, tmpV.set(0, 0.5, 0), 1.2, 2.2, 0.75, 0.45);
      }
      let hitE = null;
      if (!r.visual) for (const e of cands) {
        if (e.team === r.team || e.id === r.owner) continue;
        const rr = e.radius + (r.target === e ? 6 : 2); // proximity fuse for homing rockets
        if (segDist2(ax, ay, az, r.pos.x, r.pos.y, r.pos.z, e.hitCenter.x, e.hitCenter.y, e.hitCenter.z) < rr * rr) { hitE = e; break; }
      }
      const h = g.world.groundAt(r.pos.x, r.pos.z);
      if (hitE || r.pos.y <= h || r.age > 8) {
        if (r.pos.y < h) r.pos.y = h;
        const air = r.pos.y - h > 8;
        fx.explosion(r.pos, 0.55, { air, water: g.world.isWater(r.pos.x, r.pos.z), noCrater: air });
        g.audio?.play('explosion', r.pos, 0.6);
        if (!r.visual) {
          const info = { pen: 3, explosive: true, pos: r.pos, weapon: 'rocket', blast: ++this.blastId };
          if (hitE) g.applyDamage(hitE, r.dmg, r.owner, info);
          g.areaDamage(r.pos, 11, r.dmg * 0.6, r.owner, r.team, { ...info, exclude: hitE });
        }
        g.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
      }
    }
  }

  // Proportional homing toward the locked target's intercept point, limited by the rocket's turn rate.
  steerRocket(r, dt) {
    const t = r.target;
    if (!t.alive || t.removed) { r.target = null; return; }
    const spd = r.vel.length();
    const c = t.hitCenter;
    const dist = r.pos.distanceTo(c);
    const tgo = dist / Math.max(spd, 50);
    const aim = tmpV.copy(c);
    const tv = t.trackVel || t.vel;
    if (tv) aim.addScaledVector(tv, tgo);
    aim.sub(r.pos).normalize();
    const cur = tmpS.copy(r.vel).divideScalar(Math.max(spd, 1e-3));
    const dot = Math.max(-1, Math.min(1, cur.dot(aim)));
    if (dot < 0.2) { r.target = null; return; } // overshot: the seeker loses the target
    const ang = Math.acos(dot);
    const k = ang > 1e-4 ? Math.min(1, (r.turn * dt) / ang) : 1;
    cur.lerp(aim, k).normalize();
    r.vel.copy(cur).multiplyScalar(spd);
    r.dir.copy(cur);
  }

  // Homing cannon round: bend the flight path toward the target's intercept point (gravity included), limited by
  // its turn rate and a forward seeker cone, so a round fired well off target still misses.
  steerBullet(i, dt) {
    const B = this.b, i3 = i * 3, t = B.tgt[i];
    if (!t.alive || t.removed) { B.tgt[i] = null; return; }
    const vx = B.v[i3], vy = B.v[i3 + 1], vz = B.v[i3 + 2];
    const spd = Math.hypot(vx, vy, vz);
    const c = t.hitCenter;
    const dx = c.x - B.p[i3], dy = c.y - B.p[i3 + 1], dz = c.z - B.p[i3 + 2];
    const tgo = Math.hypot(dx, dy, dz) / Math.max(spd, 1);
    const tv = t.trackVel || t.vel;
    const aim = tmpV.set(dx + (tv ? tv.x * tgo : 0), dy + (tv ? tv.y * tgo : 0) + 0.5 * GRAVITY * tgo * tgo, dz + (tv ? tv.z * tgo : 0)).normalize();
    const cur = tmpS.set(vx / spd, vy / spd, vz / spd);
    const dot = Math.max(-1, Math.min(1, cur.dot(aim)));
    if (dot < 0.94) { B.tgt[i] = null; return; } // outside the ~20 degree seeker cone, or already past the target
    const ang = Math.acos(dot);
    const k = ang > 1e-5 ? Math.min(1, (B.turn[i] * dt) / ang) : 1;
    cur.lerp(aim, k).normalize().multiplyScalar(spd);
    B.v[i3] = cur.x; B.v[i3 + 1] = cur.y; B.v[i3 + 2] = cur.z;
  }

  // Guided bomb: tail fins trim the horizontal velocity so the impact point tracks the target's predicted position.
  guideBomb(b, dt) {
    const t = b.target;
    if (!t.alive || t.removed) { b.target = null; return; }
    const c = t.hitCenter;
    const fall = b.pos.y - c.y;
    if (fall <= 1) return;
    const vy = -b.vel.y;
    const tf = (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * fall)) / GRAVITY; // time to fall to the target's height
    const tv = t.trackVel || t.vel;
    const wantX = (c.x + (tv ? tv.x * tf : 0) - b.pos.x) / tf, wantZ = (c.z + (tv ? tv.z * tf : 0) - b.pos.z) / tf;
    const ex = wantX - b.vel.x, ez = wantZ - b.vel.z;
    const e = Math.hypot(ex, ez);
    const step = Math.min(e, b.guide * dt);
    if (e > 1e-4) { b.vel.x += ex / e * step; b.vel.z += ez / e * step; }
  }

  clear() {
    this.b.alive.fill(0);
    this.b.tgt.fill(null);
    this.tracers.count = 0;
    for (const b of this.bombs) this.game.scene.remove(b.mesh);
    for (const r of this.rockets) this.game.scene.remove(r.mesh);
    for (const m of this.missiles) this.game.scene.remove(m.mesh);
    this.bombs.length = 0; this.rockets.length = 0; this.missiles.length = 0; this.flares.length = 0;
  }
}
