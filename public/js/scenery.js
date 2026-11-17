// Vegetation, clouds, towns and airfields. Everything is added to the world's parent group so a world can be swapped.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from './noise.js';
import { Settings } from './config.js';
import { SITES } from './world.js';
import { depthBias } from './depth.js';

function colorize(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

function strip(geo) { // non-indexed, only position/normal/color so geometries merge
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

const part = (geo, hex) => strip(colorize(geo, hex));
const pick = (arr, i, fallback) => (arr && arr.length ? arr[i % arr.length] : fallback);

export function treeGeometry(type, V) {
  switch (type) {
    case 'snowpine':
      return mergeGeometries([
        part(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 5).translate(0, 1.1, 0), 0x3d2e22),
        part(new THREE.ConeGeometry(1.7, 3.6, 7).translate(0, 3.4, 0), 0x2f4433),
        part(new THREE.ConeGeometry(1.3, 3.0, 7).translate(0, 5.0, 0), 0xaebcc2),
        part(new THREE.ConeGeometry(0.85, 2.4, 7).translate(0, 6.5, 0), 0xeef3f6),
      ]);
    case 'broad':
      return mergeGeometries([
        part(new THREE.CylinderGeometry(0.2, 0.32, 2.6, 5).translate(0, 1.3, 0), 0x4f3a26),
        part(new THREE.IcosahedronGeometry(2.1, 0).translate(0, 4.0, 0), pick(V.broad, 0, 0x46692c)),
        part(new THREE.IcosahedronGeometry(1.5, 0).translate(0.9, 4.9, 0.4), pick(V.broad, 1, 0x527734)),
      ]);
    case 'palm': {
      // Slightly leaning trunk with drooping fronds.
      const top = new THREE.Vector3(-7.5 * Math.sin(0.08), 7.5 * Math.cos(0.08), 0);
      const parts = [part(new THREE.CylinderGeometry(0.14, 0.24, 7.5, 6).translate(0, 3.75, 0).rotateZ(0.08), 0x7a5e3e)];
      for (let i = 0; i < 7; i++) {
        const frond = new THREE.BoxGeometry(0.55, 0.06, 3.4).translate(0, 0, 1.7).rotateX(0.38 + (i % 2) * 0.12).rotateY((i / 7) * Math.PI * 2).translate(top.x, top.y, top.z);
        parts.push(part(frond, pick(V.palm, i, 0x4f8c2c)));
      }
      parts.push(part(new THREE.SphereGeometry(0.42, 6, 4).translate(top.x, top.y - 0.35, 0), 0x5a4026));
      return mergeGeometries(parts);
    }
    case 'shrub':
      return mergeGeometries([
        part(new THREE.IcosahedronGeometry(1.3, 0).scale(1.3, 0.7, 1.3).translate(0, 0.6, 0), pick(V.shrub, 0, 0x6f7040)),
        part(new THREE.IcosahedronGeometry(0.9, 0).scale(1.2, 0.75, 1.2).translate(0.9, 0.7, 0.5), pick(V.shrub, 1, 0x857a4a)),
      ]);
    case 'cactus': {
      const c = pick(V.cactus, 0, 0x4c7a3a);
      return mergeGeometries([
        part(new THREE.CylinderGeometry(0.32, 0.38, 4.2, 7).translate(0, 2.1, 0), c),
        part(new THREE.SphereGeometry(0.32, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 4.2, 0), c),
        part(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 6).rotateZ(Math.PI / 2).translate(0.75, 1.9, 0), c),
        part(new THREE.CylinderGeometry(0.2, 0.22, 1.6, 6).translate(1.2, 2.6, 0), c),
        part(new THREE.CylinderGeometry(0.18, 0.18, 0.8, 6).rotateZ(Math.PI / 2).translate(-0.6, 2.6, 0), c),
        part(new THREE.CylinderGeometry(0.18, 0.2, 1.2, 6).translate(-0.95, 3.1, 0), c),
      ]);
    }
    case 'deadtree':
      return mergeGeometries([
        part(new THREE.CylinderGeometry(0.14, 0.3, 5.2, 5).translate(0, 2.6, 0), 0x2e2824),
        part(new THREE.CylinderGeometry(0.05, 0.12, 2.4, 4).translate(0, 1.2, 0).rotateZ(0.9).translate(0, 3.0, 0), 0x2e2824),
        part(new THREE.CylinderGeometry(0.05, 0.1, 2.0, 4).translate(0, 1.0, 0).rotateZ(-0.8).rotateY(1.9).translate(0, 3.8, 0), 0x35302a),
        part(new THREE.CylinderGeometry(0.04, 0.09, 1.6, 4).translate(0, 0.8, 0).rotateZ(0.7).rotateY(3.8).translate(0, 4.4, 0), 0x2e2824),
      ]);
    case 'acacia':
      return mergeGeometries([
        part(new THREE.CylinderGeometry(0.16, 0.26, 4.4, 5).translate(0, 2.2, 0).rotateZ(0.06), 0x5a4430),
        part(new THREE.CylinderGeometry(0.08, 0.12, 2.0, 4).translate(0, 1.0, 0).rotateZ(0.6).translate(0, 3.6, 0), 0x5a4430),
        part(new THREE.CylinderGeometry(3.4, 2.6, 0.6, 9).translate(0, 5.0, 0), pick(V.acacia, 0, 0x5a7a2a)),
        part(new THREE.CylinderGeometry(2.0, 1.6, 0.5, 8).translate(-1.4, 4.7, 0.6), pick(V.acacia, 1, 0x6a8a30)),
      ]);
    case 'willow':
      return mergeGeometries([
        part(new THREE.CylinderGeometry(0.28, 0.45, 3.4, 6).translate(0, 1.7, 0), 0x3e3224),
        part(new THREE.IcosahedronGeometry(2.4, 0).scale(1.2, 0.7, 1.2).translate(0, 4.4, 0), pick(V.willow, 0, 0x3a5a2a)),
        part(new THREE.CylinderGeometry(2.6, 3.1, 3.2, 9, 1, true).translate(0, 3.0, 0), pick(V.willow, 1, 0x4a6a30)),
      ]);
    case 'crystal':
      return mergeGeometries([
        part(new THREE.ConeGeometry(0.8, 6.5, 5).translate(0, 3.25, 0), 0xffffff),
        part(new THREE.ConeGeometry(0.55, 4.2, 5).translate(0, 2.1, 0).rotateZ(0.42).translate(0.5, 0, 0.2), 0xe8f4ff),
        part(new THREE.ConeGeometry(0.5, 3.4, 5).translate(0, 1.7, 0).rotateZ(-0.5).rotateY(2.2).translate(-0.4, 0, 0.3), 0xf4ecff),
        part(new THREE.ConeGeometry(0.35, 2.4, 5).translate(0, 1.2, 0).rotateX(0.5).translate(0, 0, -0.5), 0xffffff),
      ]);
    case 'boulder':
      return mergeGeometries([
        part(new THREE.IcosahedronGeometry(1.2, 0).scale(1.3, 0.8, 1.1).translate(0, 0.5, 0), pick(V.boulder, 0, 0x6a6460)),
        part(new THREE.IcosahedronGeometry(0.7, 0).scale(1.1, 0.9, 1.2).translate(1.1, 0.3, 0.6), pick(V.boulder, 1, 0x58524e)),
      ]);
    default: // conifer
      return mergeGeometries([
        part(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 5).translate(0, 1.1, 0), 0x4a3524),
        part(new THREE.ConeGeometry(1.7, 3.6, 7).translate(0, 3.4, 0), pick(V.conifer, 0, 0x2f4a24)),
        part(new THREE.ConeGeometry(1.3, 3.0, 7).translate(0, 5.0, 0), pick(V.conifer, 1, 0x355427)),
        part(new THREE.ConeGeometry(0.85, 2.4, 7).translate(0, 6.5, 0), pick(V.conifer, 2, 0x3b5d2b)),
      ]);
  }
}

const TREE_SCALE = { conifer: [1.6, 3.2], snowpine: [1.6, 3.2], broad: [1.4, 2.8], palm: [0.9, 1.35], shrub: [0.6, 1.5], cactus: [0.8, 1.3],
  deadtree: [1.0, 2.0], acacia: [1.0, 1.8], willow: [1.2, 2.2], crystal: [1.0, 3.2], boulder: [0.8, 3.5] };
// Default per-instance hue variation for green trees; a world's vegetation.tint can override it per type (null = none).
const DEFAULT_TINT = { h: [0.2, 0.3], s: [0.3, 0.6], l: [0.75, 1.0] };

export function buildTrees(world, parent) {
  const V = world.def.vegetation;
  // The map is 4x the original area; plant more trees, weighted toward the battle area.
  const total = Math.round(Settings.gfx.trees * 2.2 * (V.density ?? 1));
  if (total <= 0) return [];
  const rng = new RNG(world.seed + 5);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, envMapIntensity: 0.4 });
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const meshes = [];
  for (const [type, weight] of V.mix) {
    const count = Math.round(total * weight);
    if (count <= 0) continue;
    const mesh = new THREE.InstancedMesh(treeGeometry(type, V), mat, count);
    const [s0, s1] = TREE_SCALE[type] || [1.4, 2.8];
    const tint = V.tint && type in V.tint ? V.tint[type] : (['conifer', 'broad', 'palm', 'acacia', 'willow'].includes(type) ? DEFAULT_TINT : null);
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 40) {
      tries++;
      const span = rng.next() < 0.55 ? 11000 : world.half - 300;
      const x = rng.float(-span, span), z = rng.float(-span, span);
      const d = world.forestDensity(x, z);
      if (rng.next() > d * 1.4 + V.lone) continue;
      const h = world.heightAt(x, z);
      if (h < 5 || world.isWater(x, z)) continue;
      const nrm = world.normalAt(x, z);
      if (nrm.y < 0.8) continue;
      if (type === 'conifer' && h < 120 && rng.chance(0.5)) continue; // conifers prefer hills
      if (type === 'palm' && h > 140 && rng.chance(0.75)) continue;   // palms prefer the coast
      const s = rng.float(s0, s1);
      p.set(x, h - 0.4, z);
      qt.setFromAxisAngle(up, rng.float(0, Math.PI * 2));
      sc.set(s * rng.float(0.85, 1.15), s * rng.float(0.9, 1.3), s * rng.float(0.85, 1.15));
      m4.compose(p, qt, sc);
      mesh.setMatrixAt(placed, m4);
      if (tint) col.setHSL(rng.float(tint.h[0], tint.h[1]), rng.float(tint.s[0], tint.s[1]), rng.float(tint.l[0], tint.l[1]));
      else col.setScalar(rng.float(0.82, 1.0));
      mesh.setColorAt(placed, col);
      placed++;
    }
    mesh.count = placed;
    mesh.castShadow = Settings.gfx.shadowSize >= 2048;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = `trees-${type}`;
    parent.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

function cloudTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * 128, oy = Math.floor(v / 2) * 128;
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 34;
      const x = ox + 64 + Math.cos(a) * r, y = oy + 66 + Math.sin(a) * r * 0.6;
      const rad = 14 + rnd() * 26;
      const gr = g.createRadialGradient(x, y - rad * 0.2, 0, x, y, rad);
      const b = 200 + rnd() * 55;
      gr.addColorStop(0, `rgba(${b},${b},${b},0.55)`);
      gr.addColorStop(0.6, `rgba(${b},${b},${b},0.25)`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Clouds {
  constructor(world, parent, engine) {
    this.engine = engine;
    this.puffs = [];
    this.count = 0;
    this.mesh = null;
    const n = Math.round(Settings.gfx.clouds * 2 * (world.def.clouds ?? 1));
    if (n <= 0) return;
    const rng = new RNG(world.seed + 11);
    const puffs = this.puffs;
    for (let c = 0; c < n; c++) {
      const cx = rng.float(-26000, 26000), cz = rng.float(-26000, 26000), cy = rng.float(1500, 2900);
      const k = rng.int(7, 16), spread = rng.float(250, 600);
      for (let i = 0; i < k; i++) {
        const y = cy + rng.float(-60, 160);
        puffs.push({ x: cx + rng.float(-spread, spread), y, z: cz + rng.float(-spread * 0.6, spread * 0.6),
          s: rng.float(260, 560), shade: 0.55 + (y - cy + 60) / 220 * 0.45, rot: rng.float(0, 6.28), v: rng.int(0, 3) });
      }
    }
    this.count = puffs.length;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    this.aOffset = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 3), 3);
    this.aParams = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 4), 4); // scale, shade, rot, variant
    geo.setAttribute('offset', this.aOffset);
    geo.setAttribute('params', this.aParams);
    geo.instanceCount = this.count;
    this.order = puffs.map((_, i) => i);
    this.writeAttributes();

    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        map: { value: cloudTexture() }, lit: { value: new THREE.Color(1, 1, 1) }, shadow: { value: new THREE.Color(0.55, 0.6, 0.7) },
        fogColor: { value: new THREE.Color() }, fogNear: { value: 2000 }, fogFar: { value: 16000 },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        uniform float fogNear; uniform float fogFar;
        attribute vec3 offset; attribute vec4 params;
        varying vec2 vUv; varying float vShade; varying float vFog; varying float vNear;
        void main() {
          vec4 mv = modelViewMatrix * vec4(offset, 1.0);
          float c = cos(params.z), s = sin(params.z);
          vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * params.x;
          mv.xy += p;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
          float vi = params.w;
          vUv = uv * 0.5 + vec2(mod(vi, 2.0), floor(vi / 2.0)) * 0.5;
          vShade = params.y;
          float d = -mv.z;
          vFog = smoothstep(fogNear, fogFar, d);
          vNear = smoothstep(params.x * 0.15, params.x * 0.7, d);
        }`,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        uniform sampler2D map; uniform vec3 lit; uniform vec3 shadow; uniform vec3 fogColor;
        varying vec2 vUv; varying float vShade; varying float vFog; varying float vNear;
        void main() {
          #include <logdepthbuf_fragment>
          vec4 t = texture2D(map, vUv);
          vec3 col = mix(shadow, lit, clamp(vShade * (0.55 + 0.45 * t.r), 0.0, 1.0));
          col = mix(col, fogColor, vFog * 0.9);
          gl_FragColor = vec4(col, t.a * vNear * 0.95);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'clouds';
    parent.add(this.mesh);
    this.sortTimer = 0;
    this.setLighting();
  }

  writeAttributes() {
    const o = this.aOffset.array, pr = this.aParams.array;
    for (let k = 0; k < this.count; k++) {
      const p = this.puffs[this.order[k]];
      o[k * 3] = p.x; o[k * 3 + 1] = p.y; o[k * 3 + 2] = p.z;
      pr[k * 4] = p.s; pr[k * 4 + 1] = p.shade; pr[k * 4 + 2] = p.rot; pr[k * 4 + 3] = p.v;
    }
    this.aOffset.needsUpdate = true;
    this.aParams.needsUpdate = true;
  }

  setLighting() {
    if (!this.mesh) return;
    const e = this.engine;
    this.mat.uniforms.lit.value.setRGB(1, 1, 1).lerp(e.sun.color, 0.35).multiplyScalar(1.25);
    this.mat.uniforms.shadow.value.copy(e.fogBase).multiplyScalar(0.72);
  }

  update(dt, camera) {
    if (!this.mesh) return;
    const f = this.engine.scene.fog;
    const u = this.mat.uniforms;
    u.fogColor.value.copy(f.color); u.fogNear.value = f.near; u.fogFar.value = f.far * 1.4;
    this.sortTimer -= dt;
    if (this.sortTimer <= 0) {
      this.sortTimer = 0.35;
      const cp = camera.position;
      const P = this.puffs;
      const d = P.map((p) => (p.x - cp.x) ** 2 + (p.y - cp.y) ** 2 + (p.z - cp.z) ** 2);
      this.order.sort((a, b) => d[b] - d[a]);
      this.writeAttributes();
    }
  }

  // Density of cloud at a point (0..1) — used to fade HUD/visibility when flying through.
  densityAt(p) {
    let best = 0;
    for (const c of this.puffs) {
      const dy = (p.y - c.y) / (c.s * 0.35);
      if (dy > 1 || dy < -1) continue;
      const d = Math.hypot(p.x - c.x, p.z - c.z) / (c.s * 0.45);
      if (d < 1) best = Math.max(best, (1 - d) * (1 - Math.abs(dy)));
    }
    return best;
  }
}

function runwayTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3c3e'; g.fillRect(0, 0, 64, 1024);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},0.04)`; g.fillRect(Math.random() * 64, Math.random() * 1024, 2, 2); }
  g.fillStyle = '#d8d8d0';
  for (let y = 40; y < 1000; y += 48) g.fillRect(30, y, 4, 24);
  g.fillRect(2, 0, 3, 1024); g.fillRect(59, 0, 3, 1024);
  for (let i = 0; i < 8; i++) { g.fillRect(6 + i * 6.5, 6, 4, 28); g.fillRect(6 + i * 6.5, 990, 4, 28); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildAirfields(world, parent) {
  const asphalt = depthBias(new THREE.MeshStandardMaterial({ map: runwayTexture(), roughness: 0.85 }), 2);
  const concrete = depthBias(new THREE.MeshStandardMaterial({ color: 0x6b6b66, roughness: 0.9 }), 1);
  const metal = new THREE.MeshStandardMaterial({ color: 0x7c8278, roughness: 0.6, metalness: 0.4 });
  const tower = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.6 });
  for (const site of [SITES.blueAirfield, SITES.redAirfield]) {
    const h = world.heightAt(site.x, site.z);
    const g = new THREE.Group();
    g.position.set(site.x, h + 0.25, site.z);
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(55, 1700).rotateX(-Math.PI / 2), asphalt);
    rw.rotation.y = Math.PI / 2; rw.receiveShadow = true; g.add(rw);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(500, 140).rotateX(-Math.PI / 2), concrete);
    apron.position.set(0, -0.05, 150); apron.receiveShadow = true; g.add(apron);
    for (let i = 0; i < 3; i++) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 40, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), metal);
      body.castShadow = body.receiveShadow = true;
      body.position.set(-160 + i * 70, 0, 250);
      g.add(body);
    }
    const tw = new THREE.Mesh(new THREE.BoxGeometry(8, 22, 8).translate(0, 11, 0), tower);
    tw.castShadow = true; tw.position.set(180, 0, 200); g.add(tw);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 11).translate(0, 24.5, 0), glass);
    cab.position.copy(tw.position); g.add(cab);
    parent.add(g);
  }
}

export function buildTowns(world, parent) {
  const rng = new RNG(world.seed + 31);
  const T = world.def.town;
  const wallGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roofGeo = new THREE.CylinderGeometry(0.72, 0.72, 1, 3, 1).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
  roofGeo.scale(1, 0.55, 1.42).translate(0, 1.18, 0);
  const total = SITES.towns.length * 46;
  const walls = new THREE.InstancedMesh(wallGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), total);
  const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }), total);
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const wallCols = T.walls.map((c) => new THREE.Color(c));
  const roofCols = T.roofs.map((c) => new THREE.Color(c));
  let k = 0;
  const towns = [];
  for (const t of SITES.towns) {
    const ang = rng.float(0, Math.PI);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const houses = [];
    for (let i = 0; i < 46; i++) {
      const gx = rng.int(-5, 5) * 34 + rng.float(-6, 6), gz = rng.int(-4, 4) * 30 + rng.float(-5, 5);
      if (Math.abs(gx) < 10 || Math.abs(gz) < 8) continue; // main roads
      const x = t.x + gx * ca - gz * sa, z = t.z + gx * sa + gz * ca;
      const h = world.heightAt(x, z);
      if (h < 2) continue; // never build in the sea
      const w = rng.float(9, 15), d = rng.float(8, 12), hh = rng.float(5, 9);
      p.set(x, h - 0.5, z);
      qt.setFromAxisAngle(up, ang + (rng.chance(0.5) ? 0 : Math.PI / 2));
      s.set(w, hh, d);
      m4.compose(p, qt, s);
      walls.setMatrixAt(k, m4);
      walls.setColorAt(k, rng.pick(wallCols));
      p.y += hh - 1;
      s.set(w * 1.04, hh * 0.8, d);
      m4.compose(p, qt, s);
      roofs.setMatrixAt(k, m4);
      roofs.setColorAt(k, rng.pick(roofCols));
      houses.push({ x, z, r: Math.max(w, d) * 0.6, top: h + hh * 1.6 });
      k++;
    }
    towns.push({ ...t, houses, ang });
  }
  walls.count = roofs.count = k;
  for (const m of [walls, roofs]) { m.castShadow = true; m.receiveShadow = true; parent.add(m); }
  towns.walls = walls;
  return towns;
}
