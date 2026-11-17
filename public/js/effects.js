// GPU-instanced billboard particles: explosions, smoke, fire, sparks, dust, splashes, craters.
import * as THREE from 'three';
import { depthBias } from './depth.js';

const TEX = { smoke: 0, fire: 1, spark: 2, debris: 3 };

function atlasTexture() {
  const s = 256, h = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  let seed = 5;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // 0: smoke puff
  for (let i = 0; i < 30; i++) {
    const a = rnd() * 6.28, r = rnd() * 26, x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r, rad = 16 + rnd() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const v = 200 + rnd() * 55;
    gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.28); g.fill();
  }
  // 1: fire puff
  for (let i = 0; i < 18; i++) {
    const a = rnd() * 6.28, r = rnd() * 20, x = h + 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r, rad = 18 + rnd() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.28); g.fill();
  }
  // 2: glow / spark
  let gr = g.createRadialGradient(64, h + 64, 0, 64, h + 64, 60);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, h, h, h);
  // 3: debris chunks
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(255,255,255,${0.7 + rnd() * 0.3})`;
    g.beginPath();
    const cx = h + 30 + rnd() * 68, cy = h + 30 + rnd() * 68;
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28, r = 6 + rnd() * 12; k ? g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + r, cy); }
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class ParticleSystem {
  constructor(scene, max, additive, tex) {
    this.max = max;
    this.n = 0; this.head = 0;
    const F = (k) => new Float32Array(max * k);
    this.p = F(3); this.v = F(3); this.age = F(1); this.life = F(1); this.s0 = F(1); this.s1 = F(1);
    this.rot = F(1); this.rotV = F(1); this.a0 = F(1); this.c0 = F(3); this.c1 = F(3); this.drag = F(1);
    this.grav = F(1); this.tex = F(1); this.alive = new Uint8Array(max);
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(F(3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aPar = new THREE.InstancedBufferAttribute(F(4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(F(4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iPar', this.aPar); geo.setAttribute('iCol', this.aCol);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { map: { value: tex }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1000 }, fogFar: { value: 10000 }, light: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        uniform float fogNear; uniform float fogFar;
        attribute vec3 iPos; attribute vec4 iPar; attribute vec4 iCol;
        varying vec2 vUv; varying vec4 vCol; varying float vFog;
        void main() {
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          float c = cos(iPar.y), s = sin(iPar.y);
          mv.xy += vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iPar.x;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
          vUv = uv * 0.5 + vec2(mod(iPar.w, 2.0), 1.0 - floor(iPar.w / 2.0)) * 0.5;
          vCol = vec4(iCol.rgb, iPar.z);
          vFog = smoothstep(fogNear, fogFar, -mv.z);
        }`,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        uniform sampler2D map; uniform vec3 fogColor; uniform vec3 light;
        varying vec2 vUv; varying vec4 vCol; varying float vFog;
        void main() {
          #include <logdepthbuf_fragment>
          vec4 t = texture2D(map, vUv);
          ${additive
            ? 'gl_FragColor = vec4(vCol.rgb * t.rgb * t.a * vCol.a * (1.0 - vFog), 1.0);'
            : 'vec3 col = mix(vCol.rgb * light * t.rgb, fogColor, vFog); gl_FragColor = vec4(col, t.a * vCol.a);'}
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 4 : 3;
    scene.add(this.mesh);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, a0, c0, c1, drag, grav, tex, rotV = 0) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.alive[i] = 1;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.c0[i * 3] = c0[0]; this.c0[i * 3 + 1] = c0[1]; this.c0[i * 3 + 2] = c0[2];
    this.c1[i * 3] = c1[0]; this.c1[i * 3 + 1] = c1[1]; this.c1[i * 3 + 2] = c1[2];
    this.drag[i] = drag; this.grav[i] = grav; this.tex[i] = tex;
    this.rot[i] = Math.random() * 6.28; this.rotV[i] = rotV || (Math.random() - 0.5) * 0.6;
  }

  update(dt) {
    const P = this.aPos.array, R = this.aPar.array, C = this.aCol.array;
    let k = 0;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      const age = (this.age[i] += dt);
      const life = this.life[i];
      if (age >= life) { this.alive[i] = 0; continue; }
      const t = age / life;
      const d = Math.exp(-this.drag[i] * dt);
      const i3 = i * 3;
      this.v[i3] *= d; this.v[i3 + 1] = this.v[i3 + 1] * d + this.grav[i] * dt; this.v[i3 + 2] *= d;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      this.rot[i] += this.rotV[i] * dt;
      P[k * 3] = this.p[i3]; P[k * 3 + 1] = this.p[i3 + 1]; P[k * 3 + 2] = this.p[i3 + 2];
      const fade = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92;
      R[k * 4] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      R[k * 4 + 1] = this.rot[i];
      R[k * 4 + 2] = this.a0[i] * fade;
      R[k * 4 + 3] = this.tex[i];
      C[k * 4] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      C[k * 4 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      C[k * 4 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
      k++;
    }
    this.geo.instanceCount = k;
    if (k) { this.aPos.needsUpdate = true; this.aPar.needsUpdate = true; this.aCol.needsUpdate = true; }
  }

  clear() { this.alive.fill(0); this.geo.instanceCount = 0; }
}

const rnd = (a, b) => a + Math.random() * (b - a);
const FIRE0 = [3.2, 1.6, 0.5], FIRE1 = [1.2, 0.18, 0.02];
const SMOKE_D = [0.09, 0.085, 0.08], SMOKE_G = [0.35, 0.34, 0.33];

export class Effects {
  constructor(scene, engine) {
    this.scene = scene;
    this.engine = engine;
    const tex = atlasTexture();
    this.add = new ParticleSystem(scene, 4000, true, tex);
    this.alpha = new ParticleSystem(scene, 7000, false, tex);
    this.emitters = [];
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 300, 1.6);
      l.userData.t = 0; l.userData.dur = 1; l.userData.max = 0;
      scene.add(l);
      this.lights.push(l);
    }
    this.craters = [];
    this.craterIdx = 0;
    const cc = document.createElement('canvas');
    cc.width = cc.height = 128;
    const g = cc.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(20,16,12,0.95)'); gr.addColorStop(0.55, 'rgba(40,32,24,0.75)'); gr.addColorStop(1, 'rgba(60,50,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const ct = new THREE.CanvasTexture(cc);
    ct.colorSpace = THREE.SRGBColorSpace;
    this.craterMat = depthBias(new THREE.MeshStandardMaterial({ map: ct, transparent: true, depthWrite: false, roughness: 1 }), 4);
    this.craterGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.tmp = new THREE.Vector3();
    this.quality = 1; // particle density from the Effects quality setting
  }

  flash(pos, intensity = 8, dur = 0.35, color = 0xffaa55) {
    let l = this.lights[0];
    for (const x of this.lights) if (x.intensity < l.intensity) l = x;
    l.position.copy(pos); l.color.set(color);
    l.userData.t = 0; l.userData.dur = dur; l.userData.max = intensity * 4000;
    l.intensity = l.userData.max;
  }

  explosion(pos, size = 1, opts = {}) {
    const { x, y, z } = pos;
    const s = size;
    const A = this.add, B = this.alpha;
    A.spawn(x, y, z, 0, 0, 0, 0.18, 14 * s, 42 * s, 1.0, [4, 3.4, 2.4], [2, 1, 0.4], 0, 0, TEX.spark);
    const q = this.quality;
    const nf = Math.round((10 + 6 * s) * q);
    for (let i = 0; i < nf; i++) {
      const sp = rnd(4, 18) * Math.sqrt(s);
      const dx = rnd(-1, 1), dy = rnd(-0.2, 1), dz = rnd(-1, 1);
      A.spawn(x + dx * 2 * s, y + dy * 2 * s, z + dz * 2 * s, dx * sp, dy * sp + 3, dz * sp, rnd(0.5, 1.1), 5 * s, rnd(12, 20) * s, 1, FIRE0, FIRE1, 2.2, 6, TEX.fire);
    }
    const ns = Math.round((8 + 6 * s) * q);
    for (let i = 0; i < ns; i++) {
      const dx = rnd(-1, 1), dy = rnd(0, 1), dz = rnd(-1, 1);
      const g = rnd(0.06, 0.18);
      B.spawn(x + dx * 3 * s, y + dy * 3 * s, z + dz * 3 * s, dx * 4 * s, dy * 5 * s + rnd(4, 10), dz * 4 * s, rnd(3.5, 7) * Math.min(1.5, s), 6 * s, rnd(14, 24) * s, 0.75, [g, g * 0.95, g * 0.9], SMOKE_G, 0.7, 3, TEX.smoke);
    }
    for (let i = 0; i < (14 + 10 * s) * q; i++) {
      const dx = rnd(-1, 1), dy = rnd(0.2, 1.2), dz = rnd(-1, 1), sp = rnd(30, 80) * Math.sqrt(s);
      A.spawn(x, y, z, dx * sp, dy * sp, dz * sp, rnd(0.5, 1.4), rnd(0.8, 1.6), 0.3, 1, [4, 2.6, 1.2], [1.5, 0.4, 0.1], 0.8, -25, TEX.spark);
    }
    if (!opts.air) {
      for (let i = 0; i < (8 + 4 * s) * q; i++) {
        const dx = rnd(-1, 1), dz = rnd(-1, 1), sp = rnd(15, 40) * Math.sqrt(s);
        B.spawn(x, y + 1, z, dx * sp, rnd(15, 45) * Math.sqrt(s), dz * sp, rnd(1.5, 3), rnd(1, 2.4) * s, rnd(0.8, 1.6) * s, 1, [0.08, 0.07, 0.06], [0.1, 0.09, 0.08], 0.4, -30, TEX.debris, rnd(-6, 6));
      }
      if (opts.water) this.splash(pos, s * 1.5);
      else {
        const nd = Math.max(4, Math.round(10 * q));
        for (let i = 0; i < nd; i++) {
          const a = (i / nd) * 6.28;
          B.spawn(x, y + 1, z, Math.cos(a) * 22 * s, 2, Math.sin(a) * 22 * s, rnd(1.5, 3), 6 * s, 18 * s, 0.7, [0.45, 0.38, 0.28], [0.55, 0.5, 0.42], 1.6, 0.5, TEX.smoke);
        }
        if (!opts.noCrater) this.crater(pos, 7 * s);
      }
    }
    this.flash(pos, 6 * s, 0.4 + 0.15 * s);
  }

  airBurst(pos, size = 1) { this.explosion(pos, size, { air: true }); }

  flak(pos) {
    const { x, y, z } = pos;
    this.add.spawn(x, y, z, 0, 0, 0, 0.12, 6, 14, 1, [4, 3, 1.6], [2, 1, 0.3], 0, 0, TEX.spark);
    for (let i = 0; i < 5; i++) this.alpha.spawn(x + rnd(-2, 2), y + rnd(-2, 2), z + rnd(-2, 2), rnd(-3, 3), rnd(-1, 3), rnd(-3, 3), rnd(2.5, 4), 4, 14, 0.85, [0.06, 0.06, 0.06], [0.2, 0.2, 0.2], 1, 0.3, TEX.smoke);
  }

  splash(pos, size = 1) {
    const { x, z } = pos;
    for (let i = 0; i < 18 * size * this.quality; i++) {
      const dx = rnd(-1, 1), dz = rnd(-1, 1);
      this.alpha.spawn(x + dx * 3 * size, 0.5, z + dz * 3 * size, dx * 5 * size, rnd(12, 34) * Math.sqrt(size), dz * 5 * size, rnd(1.2, 2.6), 3 * size, 12 * size, 0.85, [0.85, 0.9, 0.95], [0.75, 0.8, 0.85], 0.6, -14, TEX.smoke);
    }
  }

  // Small impact for bullets.
  impact(pos, kind = 'ground') {
    const { x, y, z } = pos;
    if (kind === 'water') {
      this.alpha.spawn(x, 0.3, z, 0, rnd(6, 12), 0, 0.8, 0.8, 2.6, 0.8, [0.85, 0.9, 0.95], [0.8, 0.85, 0.9], 1, -14, TEX.smoke);
    } else if (kind === 'metal') {
      for (let i = 0; i < 4; i++) this.add.spawn(x, y, z, rnd(-14, 14), rnd(-8, 14), rnd(-14, 14), rnd(0.15, 0.4), 0.7, 0.2, 1, [4, 3, 1.5], [2, 0.6, 0.1], 1, -20, TEX.spark);
      this.add.spawn(x, y, z, 0, 0, 0, 0.07, 2.5, 4, 1, [4, 3, 2], [2, 1, 0.5], 0, 0, TEX.spark);
    } else {
      this.alpha.spawn(x, y + 0.3, z, rnd(-1, 1), rnd(2, 5), rnd(-1, 1), rnd(0.8, 1.4), 1, 4, 0.7, [0.42, 0.36, 0.26], [0.5, 0.45, 0.38], 1.5, -2, TEX.smoke);
    }
  }

  muzzle(pos, dir, size = 1) {
    this.add.spawn(pos.x + dir.x * 0.6, pos.y + dir.y * 0.6, pos.z + dir.z * 0.6, 0, 0, 0, 0.05, 1.4 * size, 2.4 * size, 1, [4, 3.2, 1.6], [3, 1.6, 0.6], 0, 0, TEX.spark);
  }

  smoke(pos, vel, size, life, gray = 0.2, alpha = 0.6) {
    this.alpha.spawn(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, life, size, size * 4, alpha, [gray, gray, gray * 0.95], [gray * 1.4, gray * 1.4, gray * 1.35], 0.8, 1.5, TEX.smoke);
  }

  fireball(pos, vel, size, life = 0.5) {
    this.add.spawn(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, life, size, size * 0.4, 1, FIRE0, FIRE1, 1.5, 2, TEX.fire);
  }

  vapor(pos, vel, size = 0.8) {
    this.alpha.spawn(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, 0.45, size, size * 2.2, 0.35, [0.95, 0.95, 0.97], [1, 1, 1], 0.5, 0, TEX.smoke);
  }

  // Persistent emitter: { pos: Vector3 (live reference), type, rate, life, size }
  addEmitter(opts) {
    const e = { acc: 0, life: Infinity, rate: 20, size: 3, type: 'smoke', vel: new THREE.Vector3(), ...opts, done: false };
    this.emitters.push(e);
    return e;
  }

  crater(pos, size) {
    let m = this.craters[this.craterIdx];
    if (!m) {
      m = new THREE.Mesh(this.craterGeo, this.craterMat);
      m.receiveShadow = true;
      this.scene.add(m);
      this.craters[this.craterIdx] = m;
    }
    this.craterIdx = (this.craterIdx + 1) % 80;
    m.position.set(pos.x, pos.y + 0.15, pos.z);
    m.scale.set(size, 1, size);
    m.rotation.y = Math.random() * 6.28;
    m.visible = true;
  }

  update(dt) {
    const f = this.engine.scene.fog;
    for (const sys of [this.add, this.alpha]) {
      const u = sys.mat.uniforms;
      u.fogColor.value.copy(f.color); u.fogNear.value = f.near; u.fogFar.value = f.far;
    }
    const sunI = this.engine.tod ? this.engine.tod.sunI / 3.4 : 1;
    this.alpha.mat.uniforms.light.value.setScalar(0.65 + 0.4 * sunI);

    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.life -= dt;
      if (e.done || e.life <= 0) { this.emitters.splice(i, 1); continue; }
      e.acc += e.rate * dt * (0.4 + 0.6 * this.quality);
      const p = e.pos;
      while (e.acc >= 1) {
        e.acc -= 1;
        const j = 1.2 * e.size;
        const x = p.x + rnd(-j, j) * 0.3, y = p.y + rnd(-j, j) * 0.3, z = p.z + rnd(-j, j) * 0.3;
        if (e.type === 'smoke') {
          const g = e.gray ?? 0.12;
          this.alpha.spawn(x, y, z, e.vel.x + rnd(-1, 1), e.vel.y + rnd(1, 3), e.vel.z + rnd(-1, 1), rnd(4, 8) * (e.lifeMul || 1), e.size, e.size * 6, 0.7, [g, g, g], [g * 2, g * 2, g * 2], 0.4, 2.2, TEX.smoke);
        } else if (e.type === 'fire') {
          this.add.spawn(x, y, z, rnd(-1, 1), rnd(3, 7), rnd(-1, 1), rnd(0.4, 0.9), e.size, e.size * 0.3, 1, FIRE0, FIRE1, 1, 3, TEX.fire);
          if (Math.random() < 0.5) this.alpha.spawn(x, y + e.size, z, rnd(-1, 1), rnd(4, 7), rnd(-1, 1), rnd(5, 9), e.size, e.size * 7, 0.75, SMOKE_D, SMOKE_G, 0.3, 2.5, TEX.smoke);
        } else if (e.type === 'trail') { // damaged aircraft smoke trail
          const g = e.gray ?? 0.25;
          this.alpha.spawn(x, y, z, rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), rnd(2, 4), e.size, e.size * 5, 0.6, [g, g, g], [g * 1.5, g * 1.5, g * 1.5], 0.2, 0.5, TEX.smoke);
        } else if (e.type === 'burning') { // aircraft on fire
          this.add.spawn(x, y, z, rnd(-2, 2), rnd(-2, 2), rnd(-2, 2), rnd(0.15, 0.35), e.size * 1.2, e.size * 0.4, 1, FIRE0, FIRE1, 1, 0, TEX.fire);
          this.alpha.spawn(x, y, z, rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), rnd(3, 5), e.size, e.size * 6, 0.75, SMOKE_D, SMOKE_G, 0.2, 0.5, TEX.smoke);
        }
      }
    }

    for (const l of this.lights) {
      if (l.intensity <= 0) continue;
      l.userData.t += dt;
      const k = 1 - l.userData.t / l.userData.dur;
      l.intensity = k > 0 ? l.userData.max * k * k : 0;
    }
    this.add.update(dt);
    this.alpha.update(dt);
  }

  clear() {
    this.add.clear(); this.alpha.clear();
    this.emitters.length = 0;
    for (const m of this.craters) if (m) m.visible = false;
    for (const l of this.lights) l.intensity = 0;
  }
}
