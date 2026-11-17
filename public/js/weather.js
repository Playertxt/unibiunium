// Weather: each world has its own kind of severe weather that builds up and eases off during a match.
//  storm     thunderstorms: dark skies, rain, lightning that briefly blanks radar (lock, SAMs, HUD markers, minimap)
//  sand      sandstorms (Scorched Mesa) / dust storms (Crimson Wastes): visibility drops to a couple of kilometres
//  blizzard  blizzards (Frost Fjords): white-out, snow and crosswinds
//  eruption  Ember Caldera: volcanoes erupt and throw lava bombs across the sky, with falling ash
import * as THREE from 'three';
import { Settings, clamp, lerp, damp } from './config.js';
import { RNG } from './noise.js';

const KIND_BY_WORLD = {
  island: 'storm', desert: 'sand', arctic: 'blizzard', archipelago: 'storm', highlands: 'storm', volcanic: 'eruption',
  savanna: 'storm', swamp: 'storm', autumn: 'storm', crystal: 'storm', mars: 'sand',
};
export const WEATHER_NAMES = { storm: 'Thunderstorm', sand: 'Sandstorm', blizzard: 'Blizzard', eruption: 'Eruption' };
const JP = { storm: '雷雨', sand: '砂嵐', blizzard: '吹雪', eruption: '噴火' };

// fogFar/near: multipliers at full strength; tint: fog colour pulled toward; vis: radar/HUD visibility at full strength.
const KINDS = {
  storm:    { far: 0.32, near: 0.12, tint: 0x46505a, tintAmt: 0.65, sun: 0.5, hemi: 0.62, vis: 0.65, precip: 'rain', wind: 4 },
  sand:     { far: 0.11, near: 0.02, tint: 0xc29a63, tintAmt: 0.9, sun: 0.62, hemi: 0.85, vis: 0.32, precip: 'dust', wind: 22 },
  blizzard: { far: 0.09, near: 0.015, tint: 0xdde5ee, tintAmt: 0.92, sun: 0.7, hemi: 0.95, vis: 0.26, precip: 'snow', wind: 16 },
  eruption: { far: 0.5, near: 0.25, tint: 0x3a2a24, tintAmt: 0.55, sun: 0.6, hemi: 0.7, vis: 0.75, precip: 'ash', wind: 3 },
};

// Rain/dust as streaks along their motion relative to the camera, snow/ash as points. A box of particles wraps
// around the camera so it never runs out.
class Precip {
  constructor(scene, type) {
    this.type = type;
    this.n = Math.round((type === 'rain' ? 2600 : type === 'dust' ? 2200 : 2400) * (0.5 + 0.5 * (Settings.gfx.effects || 1)));
    this.R = type === 'dust' ? 90 : 110; this.H = 70;
    this.p = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      this.p[i * 3] = (Math.random() * 2 - 1) * this.R; this.p[i * 3 + 1] = (Math.random() * 2 - 1) * this.H; this.p[i * 3 + 2] = (Math.random() * 2 - 1) * this.R;
    }
    this.lines = type === 'rain' || type === 'dust';
    const geo = new THREE.BufferGeometry();
    this.buf = new Float32Array(this.n * (this.lines ? 6 : 3));
    geo.setAttribute('position', new THREE.BufferAttribute(this.buf, 3).setUsage(THREE.DynamicDrawUsage));
    const col = { rain: 0xaab8c8, dust: 0xd8b07a, snow: 0xffffff, ash: 0x2a2624 }[type];
    if (this.lines) this.mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.4, depthWrite: false, fog: false });
    else this.mat = new THREE.PointsMaterial({ color: col, size: type === 'snow' ? 0.55 : 0.45, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    this.mesh = this.lines ? new THREE.LineSegments(geo, this.mat) : new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.geo = geo;
    scene.add(this.mesh);
    this.camPrev = null;
    this.camVel = new THREE.Vector3();
  }

  update(dt, cam, level, wind) {
    const cp = cam.position;
    if (!this.camPrev) this.camPrev = cp.clone();
    if (dt > 0) this.camVel.lerp(new THREE.Vector3().subVectors(cp, this.camPrev).divideScalar(dt), 0.3);
    this.camPrev.copy(cp);
    const T = this.type;
    const vx = wind.x, vz = wind.z;
    const vy = T === 'rain' ? -38 : T === 'snow' ? -4.5 : T === 'ash' ? -3 : -1;
    const R = this.R, H = this.H, R2 = R * 2, H2 = H * 2;
    const count = Math.round(this.n * clamp(level, 0, 1));
    const P = this.p, out = this.buf;
    const rel = { x: vx - this.camVel.x, y: vy - this.camVel.y, z: vz - this.camVel.z };
    const sl = T === 'rain' ? 0.035 : 0.022;
    const rl = Math.hypot(rel.x, rel.y, rel.z) * sl;
    const k = rl > 6 ? 6 / rl : 1; // cap the streak length at high speed
    const t = performance.now() * 0.001;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Particles live in camera-relative space: move by their own velocity minus the camera's, then wrap.
      let x = P[i3] + rel.x * dt, y = P[i3 + 1] + rel.y * dt, z = P[i3 + 2] + rel.z * dt;
      if (T === 'snow') { x += Math.sin(t * 1.3 + i) * dt * 1.5; z += Math.cos(t * 1.1 + i * 0.7) * dt * 1.5; }
      x = ((x + R) % R2 + R2) % R2 - R; y = ((y + H) % H2 + H2) % H2 - H; z = ((z + R) % R2 + R2) % R2 - R;
      P[i3] = x; P[i3 + 1] = y; P[i3 + 2] = z;
      const wx = cp.x + x, wy = cp.y + y, wz = cp.z + z;
      if (this.lines) {
        const o = i * 6;
        out[o] = wx; out[o + 1] = wy; out[o + 2] = wz;
        out[o + 3] = wx - rel.x * sl * k; out[o + 4] = wy - rel.y * sl * k; out[o + 5] = wz - rel.z * sl * k;
      } else { out[i3] = wx; out[i3 + 1] = wy; out[i3 + 2] = wz; }
    }
    this.geo.setDrawRange(0, this.lines ? count * 2 : count);
    this.geo.attributes.position.needsUpdate = true;
    this.mesh.visible = count > 0;
  }

  dispose(scene) { scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

export class Weather {
  // opts.mode: 'auto' (the world's weather comes and goes), 'severe' (it stays bad), 'clear' (none)
  constructor(game, worldId, opts = {}) {
    this.game = game;
    this.worldId = worldId;
    this.kind = KIND_BY_WORLD[worldId] || 'storm';
    this.K = KINDS[this.kind];
    this.mode = opts.mode || 'auto';
    this.rng = new RNG(opts.seed || Math.floor(Math.random() * 1e6));
    this.level = this.mode === 'severe' ? 0.75 : 0;
    this.target = this.mode === 'severe' ? 0.9 : 0;
    this.phaseT = this.mode === 'severe' ? 999 : 20 + this.rng.float(0, 30); // first front arrives after 20-50 s
    this.wind = new THREE.Vector3();
    this.windAng = this.rng.float(0, Math.PI * 2);
    this.flash = 0;
    this.lightningT = 4;
    this.bolts = [];
    this.lava = [];
    this.vents = this.kind === 'eruption' ? this.findVents() : [];
    this.eruptT = 25;
    this.erupting = [];
    const e = game.engine;
    this.base = { sun: e.sun.intensity, hemi: e.hemi.intensity, exposure: e.renderer.toneMappingExposure };
    this.precip = this.mode === 'clear' ? null : new Precip(game.scene, this.K.precip);
    this.tint = new THREE.Color(this.K.tint);
    this.lavaMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false });
    this.lavaGeo = new THREE.IcosahedronGeometry(3.2, 1);
    this.boltMat = new THREE.LineBasicMaterial({ color: worldId === 'crystal' ? 0x9ff6ff : 0xeaf2ff, transparent: true, opacity: 1, toneMapped: false, fog: false });
    this.announced = false;
  }

  get name() { return WEATHER_NAMES[this.kind]; }
  get jp() { return JP[this.kind]; }
  get active() { return this.mode !== 'clear' && this.level > 0.15; }

  // Volcano vents: the highest local peaks of the caldera.
  findVents() {
    const w = this.game.world, out = [];
    for (let x = -12000; x <= 12000; x += 400) for (let z = -12000; z <= 12000; z += 400) {
      const h = w.heightAt(x, z);
      if (h < 250) continue;
      let peak = true;
      for (const [dx, dz] of [[400, 0], [-400, 0], [0, 400], [0, -400], [300, 300], [-300, -300], [300, -300], [-300, 300]]) if (w.heightAt(x + dx, z + dz) > h) { peak = false; break; }
      if (peak) out.push({ x, z, h });
    }
    out.sort((a, b) => b.h - a.h);
    const vents = [];
    for (const v of out) { if (vents.every((u) => Math.hypot(u.x - v.x, u.z - v.z) > 2500)) vents.push(v); if (vents.length >= 10) break; }
    if (!vents.length) vents.push({ x: 3000, z: 0, h: w.heightAt(3000, 0) });
    return vents;
  }

  update(dt) {
    if (this.mode === 'clear') return;
    const g = this.game;
    // Fronts come and go: build up, hold, ease off, calm.
    if (this.mode === 'auto') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        const rising = this.target < 0.5;
        this.target = rising ? this.rng.float(0.7, 1) : this.rng.float(0, 0.15);
        this.phaseT = rising ? this.rng.float(70, 130) : this.rng.float(40, 75);
      }
    }
    this.level = damp(this.level, this.target, 0.12, dt);
    const L = this.level;
    if (!this.announced && L > 0.35) {
      this.announced = true;
      const text = { storm: 'Thunderstorm moving in: lightning will blank your radar', sand: 'Sandstorm rolling in: visibility dropping', blizzard: 'Blizzard incoming: white-out conditions', eruption: 'Volcanic activity rising: watch for lava bombs' }[this.kind];
      g.message(text, 4, '#e6cf9a');
    }
    if (L < 0.1) this.announced = false;
    this.windAng += dt * 0.01;
    this.wind.set(Math.cos(this.windAng), 0, Math.sin(this.windAng)).multiplyScalar(this.K.wind * L);
    g.visibility = lerp(1, this.K.vis, L);
    this.applyAtmosphere(L, dt);
    if (this.precip) this.precip.update(dt, g.camera, L * 1.15 - 0.1, this.wind);
    // Crosswinds push the player around a little in sand and snow; storms add turbulence.
    const p = g.player;
    if (p && p.alive && !p.landed) {
      p.pos.addScaledVector(this.wind, dt * 0.35);
      if (this.kind === 'storm' && L > 0.5 && Math.random() < dt * 2) {
        p.angVel.x += (Math.random() - 0.5) * 0.25 * L; p.angVel.z += (Math.random() - 0.5) * 0.35 * L;
        g.cam.shake = Math.max(g.cam.shake, 0.25 * L);
      }
    }
    if (this.kind === 'storm') this.updateLightning(dt, L);
    if (this.kind === 'eruption') this.updateEruptions(dt, L);
    this.updateLava(dt);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t -= dt;
      b.mesh.material.opacity = clamp(b.t / 0.25, 0, 1) * (Math.random() < 0.3 ? 0.4 : 1);
      if (b.t <= 0) { g.scene.remove(b.mesh); b.mesh.geometry.dispose(); this.bolts.splice(i, 1); }
    }
  }

  applyAtmosphere(L, dt) {
    const e = this.game.engine, K = this.K;
    e.updateFog(); // base fog for the world and time of day
    const f = e.scene.fog;
    f.near *= lerp(1, K.near, L);
    f.far *= lerp(1, K.far, L);
    f.color.lerp(this.tint, K.tintAmt * L);
    this.flash = Math.max(0, this.flash - dt * 4);
    e.sun.intensity = this.base.sun * lerp(1, K.sun, L) + this.flash * 2.5;
    e.hemi.intensity = this.base.hemi * lerp(1, K.hemi, L) + this.flash * 3.5;
    if (this.flash > 0) f.color.lerp(new THREE.Color(0xd8e4ff), this.flash * 0.6);
    if (this.kind === 'eruption' && this.erupting.length) f.color.lerp(new THREE.Color(0x5a2410), 0.15 * L);
  }

  updateLightning(dt, L) {
    if (L < 0.45) return;
    this.lightningT -= dt * (L - 0.3);
    if (this.lightningT > 0) return;
    this.lightningT = this.rng.float(2.5, 7);
    const g = this.game, cp = g.camera.position;
    const a = this.rng.float(0, Math.PI * 2), r = this.rng.float(500, 5000);
    const x = cp.x + Math.cos(a) * r, z = cp.z + Math.sin(a) * r;
    const gy = g.world.groundAt(x, z), top = Math.max(2600, cp.y + 600);
    const pts = [];
    let px = x + this.rng.float(-200, 200), pz = z + this.rng.float(-200, 200);
    for (let y = top; y > gy; y -= this.rng.float(60, 160)) {
      pts.push(new THREE.Vector3(px, y, pz));
      px += this.rng.float(-70, 70); pz += this.rng.float(-70, 70);
      if (this.rng.chance(0.15)) { const bx = px + this.rng.float(-180, 180), bz = pz + this.rng.float(-180, 180); pts.push(new THREE.Vector3(px, y, pz), new THREE.Vector3(bx, y - 140, bz)); pts.push(new THREE.Vector3(bx, y - 140, bz), new THREE.Vector3(px, y, pz)); }
      pts.push(new THREE.Vector3(px, y, pz));
    }
    pts.push(new THREE.Vector3(x, gy, z));
    if (pts.length % 2) pts.pop();
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mesh = new THREE.LineSegments(geo, this.boltMat.clone());
    mesh.frustumCulled = false;
    g.scene.add(mesh);
    this.bolts.push({ mesh, t: 0.35 });
    const dist = Math.hypot(x - cp.x, z - cp.z);
    this.flash = clamp(1.4 - dist / 5000, 0.35, 1);
    g.effects.flash(new THREE.Vector3(x, gy + 200, z), 40, 0.3, 0xcfe0ff);
    g.hud.lightning(this.flash);
    g.audio.play('thunder', new THREE.Vector3(x, gy, z), 1);
    // Close strikes overload every radar in the area for a moment.
    if (dist < 4500) { g.radarJam = Math.max(g.radarJam, 2.2 + this.rng.float(0, 1.2)); g.jamPos = new THREE.Vector3(x, gy, z); }
    // A direct hit on an aircraft near the bolt.
    for (const e of g.cands) {
      if (e.type !== 'air' || !e.local) continue;
      if (Math.hypot(e.pos.x - x, e.pos.z - z) < 140 && e.pos.y < top) g.applyDamage(e, 22, null, { weapon: 'lightning' });
    }
  }

  updateEruptions(dt, L) {
    const g = this.game;
    this.eruptT -= dt * (0.3 + L);
    if (this.eruptT <= 0 && L > 0.3) {
      this.eruptT = this.rng.float(35, 70);
      const cp = g.player ? g.player.pos : g.camera.position;
      const near = this.vents.filter((v) => Math.hypot(v.x - cp.x, v.z - cp.z) < 9000);
      const v = (near.length ? near : this.vents)[this.rng.int(0, (near.length ? near : this.vents).length - 1)];
      const pos = new THREE.Vector3(v.x, g.world.heightAt(v.x, v.z) + 10, v.z);
      this.erupting.push({ pos, t: 22, acc: 0 });
      g.effects.explosion(pos, 4, { noCrater: true });
      g.effects.addEmitter({ pos: pos.clone(), type: 'fire', rate: 14, size: 14, life: 22 });
      g.effects.addEmitter({ pos: pos.clone().add(new THREE.Vector3(0, 40, 0)), type: 'smoke', rate: 6, size: 30, gray: 0.08, life: 30, lifeMul: 2.5 });
      g.audio.play('bomb', pos, 1);
      g.message('ERUPTION: lava bombs incoming!', 3.5, '#ff8a3a');
      g.shake(pos, 2.5);
    }
    for (let i = this.erupting.length - 1; i >= 0; i--) {
      const e = this.erupting[i];
      e.t -= dt;
      e.acc += dt * (2 + 4 * L);
      while (e.acc > 1 && this.lava.length < 60) { e.acc -= 1; this.throwLava(e.pos); }
      if (e.t <= 0) this.erupting.splice(i, 1);
    }
  }

  throwLava(from) {
    const g = this.game;
    const a = this.rng.float(0, Math.PI * 2), h = this.rng.float(35, 120);
    const vel = new THREE.Vector3(Math.cos(a) * h, this.rng.float(110, 230), Math.sin(a) * h);
    const mesh = new THREE.Mesh(this.lavaGeo, this.lavaMat);
    mesh.position.copy(from);
    mesh.scale.setScalar(this.rng.float(0.7, 1.5));
    g.scene.add(mesh);
    this.lava.push({ mesh, pos: from.clone(), vel, age: 0 });
  }

  updateLava(dt) {
    const g = this.game, fx = g.effects;
    for (let i = this.lava.length - 1; i >= 0; i--) {
      const b = this.lava[i];
      b.age += dt;
      b.vel.y -= 9.81 * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.x += dt * 2; b.mesh.rotation.y += dt * 1.5;
      fx.fireball(b.pos, b.vel.clone().multiplyScalar(0.1), 6 * b.mesh.scale.x, 0.4);
      if (Math.random() < 0.5) fx.smoke(b.pos, _up, 3, 3, 0.1, 0.6);
      let hit = null;
      for (const e of g.cands) {
        if (e.type !== 'air') continue;
        if (e.hitCenter.distanceToSquared(b.pos) < (e.radius + 5) ** 2) { hit = e; break; }
      }
      const gy = g.world.groundAt(b.pos.x, b.pos.z);
      if (hit || (b.pos.y <= gy && b.vel.y < 0) || b.age > 40) {
        if (b.pos.y < gy) b.pos.y = gy;
        fx.explosion(b.pos, 1.3, { air: !!hit, noCrater: !!hit });
        g.audio.play('explosion', b.pos, 0.8);
        if (hit && hit.local) g.applyDamage(hit, 48, null, { explosive: true, weapon: 'lava' });
        g.areaDamage(b.pos, 22, 120, null, -99, { pen: 3, explosive: true, exclude: hit, weapon: 'lava', localOnly: true });
        g.scene.remove(b.mesh);
        this.lava.splice(i, 1);
      }
    }
  }

  dispose() {
    const g = this.game, e = g.engine;
    if (this.precip) this.precip.dispose(g.scene);
    for (const b of this.bolts) { g.scene.remove(b.mesh); b.mesh.geometry.dispose(); }
    for (const b of this.lava) g.scene.remove(b.mesh);
    this.bolts.length = 0; this.lava.length = 0;
    e.sun.intensity = this.base.sun; e.hemi.intensity = this.base.hemi;
    e.updateFog();
    this.lavaGeo.dispose(); this.lavaMat.dispose(); this.boltMat.dispose();
  }
}
const _up = new THREE.Vector3(0, 2, 0);
