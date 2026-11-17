// Procedural aircraft models + shared helpers (geometry merging, camo textures).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEAM_HEX } from './config.js';
import { addDetails } from './models_detail.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Collects geometry per material and merges it into one mesh per material.
export class Builder {
  constructor() { this.parts = new Map(); }
  add(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const m = new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(...scale));
    g.applyMatrix4(m);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return this;
  }
  build(shadow = true) {
    const group = new THREE.Group();
    for (const [mat, geos] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      group.add(mesh);
      geos.forEach((g) => g.dispose());
    }
    return group;
  }
}

export function camoTexture(colors, seed = 1, panel = true, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let s = seed * 9973 + 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.fillStyle = colors[0]; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 46; i++) {
    g.fillStyle = colors[1 + (i % (colors.length - 1))];
    const cx = rnd() * size, cy = rnd() * size, r = 25 + rnd() * 70;
    g.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.45) {
      const rr = r * (0.6 + rnd() * 0.6);
      const x = cx + Math.cos(a) * rr * 1.5, y = cy + Math.sin(a) * rr * 0.8;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath(); g.fill();
  }
  if (panel) {
    g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 1.2;
    for (let i = 0; i < size; i += 64) { g.beginPath(); g.moveTo(i + rnd() * 6, 0); g.lineTo(i, size); g.stroke(); }
    for (let i = 0; i < size; i += 96) { g.beginPath(); g.moveTo(0, i); g.lineTo(size, i + rnd() * 6); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let i = 0; i < 400; i++) g.fillRect(rnd() * size, rnd() * size, 1.5, 1.5);
  }
  for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(rnd() * size, rnd() * size, 3, 3); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const AIR_CAMO = [['#76828e', '#5a6672', '#8e98a3', '#68747f'], ['#6f6c48', '#4f5a36', '#8a7a52', '#5d5a3c']];
const matCache = new Map();
// Custom liveries (enemy aces) keyed by name: { camo: [4 colours], accent, seed, red }. Pass the key as the "team".
export const PAINTS = {};
export function airMats(team) {
  if (matCache.has(team)) return matCache.get(team);
  const P = PAINTS[team];
  const camo = P ? P.camo : AIR_CAMO[team] || AIR_CAMO[0];
  const accent = P ? P.accent : TEAM_HEX[team] ?? TEAM_HEX[0];
  const red = P ? !!P.red : !!team;
  const m = {
    body: new THREE.MeshStandardMaterial({ map: camoTexture(camo, P ? P.seed : 3 + team), roughness: P ? P.rough ?? 0.42 : 0.5, metalness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.45, metalness: 0.7 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.3, metalness: 0.9 }),
    // See-through canopy so the pilot and cockpit are visible from outside (and the world from inside).
    glass: new THREE.MeshStandardMaterial({ color: 0x8fb4d0, roughness: 0.04, metalness: 0.2, envMapIntensity: 1.4, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
    team: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.2 }),
    white: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 }),
    bomb: new THREE.MeshStandardMaterial({ color: 0x4b5240, roughness: 0.6, metalness: 0.4 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    flameCore: new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    prop: new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
    stealth: new THREE.MeshStandardMaterial({ color: P && P.stealth != null ? P.stealth : red ? 0x4a4038 : 0x40464d, roughness: 0.62, metalness: 0.3, flatShading: true }),
    pearl: new THREE.MeshStandardMaterial({ color: P && P.pearl != null ? P.pearl : red ? 0xe6d6d0 : 0xdfe7ef, roughness: 0.22, metalness: 0.65 }),
    glow: new THREE.MeshBasicMaterial({ color: 0x45e8ff }),
    plasma: new THREE.MeshBasicMaterial({ color: 0x5af0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    plasmaCore: new THREE.MeshBasicMaterial({ color: 0xe8ffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  matCache.set(team, m);
  return m;
}

function lathe(points, segs = 18) {
  // points: [radius, y] along the length, y increasing towards the nose (-Z after rotation)
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  g.rotateX(-Math.PI / 2);
  return g;
}

// Extrude UVs are in metres; scale them so the camo pattern tiles every ~10 m.
function scaleUV(g, k = 0.1) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return g;
}

function wing(span, root, tip, sweep, thick, side = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(span * side, sweep); s.lineTo(span * side, sweep + tip); s.lineTo(0, root); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45, bevelSize: Math.min(0.12, thick * 0.6), bevelSegments: 2 });
  g.rotateX(Math.PI / 2);
  g.translate(0, thick / 2, 0);
  return scaleUV(g);
}

function fin(height, root, tip, sweep, thick) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(sweep, height); s.lineTo(sweep + tip, height); s.lineTo(root, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: Math.min(0.1, thick * 0.5), bevelSegments: 2 });
  g.rotateY(-Math.PI / 2);
  g.translate(thick / 2, 0, 0);
  return scaleUV(g);
}

function roundel(b, m, x, y, z, r, rotX = -Math.PI / 2) {
  b.add(new THREE.CircleGeometry(r, 20), m.team, [x, y, z], [rotX, 0, 0]);
  b.add(new THREE.CircleGeometry(r * 0.45, 20), m.white, [x, y + (rotX < 0 ? 0.01 : -0.01), z], [rotX, 0, 0]);
}

function afterburner(m, radius, z, x = 0, plasma = false) {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(radius, radius * 7, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, radius * 3.5), plasma ? m.plasma : m.flame);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.6, radius * 4, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, radius * 2), plasma ? m.plasmaCore : m.flameCore);
  g.add(outer, inner);
  g.position.set(x, 0, z);
  g.userData.base = radius;
  return g;
}

function propeller(m, radius, blades = 4) {
  const g = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(0.22, radius, 0.06).translate(0, radius / 2, 0);
  const bmat = m.dark;
  for (let i = 0; i < blades; i++) {
    const b = new THREE.Mesh(bladeGeo, bmat);
    b.rotation.z = (i / blades) * Math.PI * 2;
    b.rotation.y = 0.35;
    g.add(b);
  }
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.2, 12).rotateX(-Math.PI / 2), m.metal);
  spinner.position.z = -0.4;
  g.add(spinner);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), m.prop);
  g.add(disc);
  return g;
}

function bombMesh(m, scale = 1) {
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(0.22, 0.22, 1.5, 10), m.bomb, [0, 0, 0], [Math.PI / 2, 0, 0]);
  b.add(new THREE.SphereGeometry(0.22, 10, 6), m.bomb, [0, 0, -0.75]);
  b.add(new THREE.ConeGeometry(0.22, 0.6, 10), m.bomb, [0, 0, 1.05], [Math.PI / 2, 0, 0]);
  b.add(new THREE.BoxGeometry(0.7, 0.04, 0.35), m.dark, [0, 0, 1.2]);
  b.add(new THREE.BoxGeometry(0.04, 0.7, 0.35), m.dark, [0, 0, 1.2]);
  const g = b.build();
  g.scale.setScalar(scale);
  return g;
}

function rocketPod(m) {
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 10), m.dark, [0, 0, 0], [Math.PI / 2, 0, 0]);
  b.add(new THREE.ConeGeometry(0.3, 0.5, 10), m.metal, [0, 0, -1.35], [-Math.PI / 2, 0, 0]);
  return b.build();
}

export function buildAircraftModel(kind, team, opts = {}) {
  const m = airMats(team);
  const b = new Builder();
  const parts = { props: [], burners: [], bombs: [], pods: [], turrets: [] };
  const root = new THREE.Group();

  if (kind === 'fighter') {
    b.add(lathe([[0.62, -7.6], [0.82, -6.6], [0.98, -3], [1.0, 0], [0.95, 2.6], [0.78, 4.6], [0.5, 6.3], [0.18, 7.5], [0.02, 7.9]]), m.body);
    b.add(new THREE.SphereGeometry(1, 18, 12), m.glass, [0, 0.72, -3.4], [0, 0, 0], [0.5, 0.5, 1.7]);
    b.add(wing(5.0, 4.6, 1.3, 3.0, 0.2, 1), m.body, [0.6, -0.25, -1.4]);
    b.add(wing(5.0, 4.6, 1.3, 3.0, 0.2, -1), m.body, [-0.6, -0.25, -1.4]);
    b.add(wing(2.4, 2.0, 0.8, 1.4, 0.12, 1), m.body, [0.5, -0.1, 4.9]);
    b.add(wing(2.4, 2.0, 0.8, 1.4, 0.12, -1), m.body, [-0.5, -0.1, 4.9]);
    b.add(fin(3.2, 3.4, 1.2, 2.6, 0.16), m.body, [0, 0.6, 3.6]);
    b.add(fin(0.9, 1.4, 0.8, 0.8, 0.17), m.team, [0, 3.2, 6.15], [0, 0, 0], [1, 0.6, 0.8]);
    b.add(new THREE.BoxGeometry(0.7, 0.9, 3.2), m.body, [1.05, -0.15, -1.5]);
    b.add(new THREE.BoxGeometry(0.7, 0.9, 3.2), m.body, [-1.05, -0.15, -1.5]);
    b.add(new THREE.BoxGeometry(0.66, 0.8, 0.1), m.dark, [1.05, -0.15, -3.1]);
    b.add(new THREE.BoxGeometry(0.66, 0.8, 0.1), m.dark, [-1.05, -0.15, -3.1]);
    b.add(new THREE.CylinderGeometry(0.62, 0.7, 1.0, 16, 1, true), m.dark, [0, 0, 7.9], [Math.PI / 2, 0, 0]);
    roundel(b, m, 4.0, 0.0, 1.9, 0.55); roundel(b, m, -4.0, 0.0, 1.9, 0.55);
    parts.burners.push(afterburner(m, 0.55, 8.3));
    for (const p of [[-2.4, -0.75, 0.4], [2.4, -0.75, 0.4]]) { const bm = bombMesh(m, 1); bm.position.set(...p); parts.bombs.push(bm); }
    for (const p of [[-3.7, -0.55, 0.2], [3.7, -0.55, 0.2]]) { const pod = rocketPod(m); pod.position.set(...p); parts.pods.push(pod); }
  } else if (kind === 'interceptor') {
    b.add(lathe([[0.55, -8.4], [0.78, -7], [0.92, -2], [0.9, 2], [0.7, 5], [0.42, 7], [0.14, 8.6], [0.02, 9.2]]), m.body);
    b.add(new THREE.SphereGeometry(1, 18, 12), m.glass, [0, 0.65, -4.4], [0, 0, 0], [0.46, 0.46, 1.6]);
    b.add(wing(4.6, 8.8, 0.6, 7.6, 0.18, 1), m.body, [0.5, -0.3, -1.6]);
    b.add(wing(4.6, 8.8, 0.6, 7.6, 0.18, -1), m.body, [-0.5, -0.3, -1.6]);
    b.add(wing(1.5, 1.2, 0.5, 0.6, 0.1, 1), m.body, [0.6, 0.0, -5.6]);
    b.add(wing(1.5, 1.2, 0.5, 0.6, 0.1, -1), m.body, [-0.6, 0.0, -5.6]);
    b.add(fin(3.4, 4.2, 1.0, 3.4, 0.16), m.body, [0, 0.55, 3.6]);
    b.add(fin(1.0, 1.4, 0.8, 0.9, 0.17), m.team, [0, 3.3, 6.95], [0, 0, 0], [1, 0.55, 0.7]);
    b.add(new THREE.CylinderGeometry(0.55, 0.65, 1.0, 16, 1, true), m.dark, [0, 0, 8.6], [Math.PI / 2, 0, 0]);
    roundel(b, m, 3.0, -0.0, 4.0, 0.55); roundel(b, m, -3.0, -0.0, 4.0, 0.55);
    parts.burners.push(afterburner(m, 0.5, 9.0));
    for (const p of [[-2.6, -0.6, -0.5], [2.6, -0.6, -0.5]]) { const pod = rocketPod(m); pod.position.set(...p); parts.pods.push(pod); }
  } else if (kind === 'attacker') {
    b.add(lathe([[0.7, -8], [0.95, -6.5], [1.2, -2], [1.2, 1.5], [1.05, 4.5], [0.75, 6.5], [0.45, 7.6], [0.3, 8.1]]), m.body);
    b.add(new THREE.SphereGeometry(1, 18, 12), m.glass, [0, 1.05, -4.4], [0, 0, 0], [0.62, 0.6, 1.5]);
    b.add(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 8), m.dark, [0, -0.9, -8.6], [Math.PI / 2, 0, 0]);
    b.add(wing(8.4, 3.6, 2.0, 0.7, 0.32, 1), m.body, [0.9, -0.55, -1.6]);
    b.add(wing(8.4, 3.6, 2.0, 0.7, 0.32, -1), m.body, [-0.9, -0.55, -1.6]);
    for (const sx of [-1, 1]) {
      b.add(lathe([[0.55, -2.4], [0.8, -1.6], [0.8, 1.6], [0.5, 2.6]], 14), m.body, [3.2 * sx, -1.15, -0.4]);
      b.add(new THREE.CircleGeometry(0.62, 14), m.dark, [3.2 * sx, -1.15, -2.62], [Math.PI, 0, 0]);
      b.add(wing(3.0, 2.2, 1.2, 1.0, 0.14, sx), m.body, [0.6 * sx, 0.1, 5.6]);
    }
    b.add(fin(3.8, 3.6, 1.6, 2.2, 0.2), m.body, [0, 0.8, 4.0]);
    b.add(fin(1.0, 1.9, 1.5, 0.5, 0.21), m.team, [0, 3.9, 6.1], [0, 0, 0], [1, 0.7, 0.85]);
    roundel(b, m, 6.0, -0.22, -0.3, 0.75); roundel(b, m, -6.0, -0.22, -0.3, 0.75);
    for (const p of [[-3.2, -0.9, 0.3], [3.2, -0.9, 0.3], [-4.6, -0.9, 0.5], [4.6, -0.9, 0.5]]) { const bm = bombMesh(m, 1.25); bm.position.set(...p); parts.bombs.push(bm); }
    for (const p of [[-5.6, -0.8, -0.6], [5.6, -0.8, -0.6]]) { const pod = rocketPod(m); pod.position.set(...p); parts.pods.push(pod); }
  } else if (kind === 'canard') {
    // RX-8 Viper: compact canard delta with a chin intake.
    b.add(lathe([[0.6, -7.4], [0.85, -6], [0.95, -2], [0.9, 2], [0.7, 4.6], [0.4, 6.4], [0.12, 7.6], [0.02, 8.1]]), m.body);
    b.add(new THREE.SphereGeometry(1, 18, 12), m.glass, [0, 0.66, -3.7], [0, 0, 0], [0.48, 0.5, 1.6]);
    b.add(new THREE.BoxGeometry(1.3, 0.8, 3.2), m.body, [0, -0.8, -1.4]);
    b.add(new THREE.BoxGeometry(1.2, 0.7, 0.1), m.dark, [0, -0.8, -3.05]);
    b.add(wing(4.4, 7.4, 0.6, 6.6, 0.18, 1), m.body, [0.5, -0.25, -1.4]);
    b.add(wing(4.4, 7.4, 0.6, 6.6, 0.18, -1), m.body, [-0.5, -0.25, -1.4]);
    b.add(wing(1.7, 1.4, 0.5, 0.9, 0.1, 1), m.body, [0.6, 0.15, -5.0]);
    b.add(wing(1.7, 1.4, 0.5, 0.9, 0.1, -1), m.body, [-0.6, 0.15, -5.0]);
    b.add(fin(3.3, 3.8, 1.0, 3.0, 0.16), m.body, [0, 0.6, 2.8]);
    b.add(fin(1.0, 1.4, 0.8, 0.9, 0.17), m.team, [0, 3.0, 5.9], [0, 0, 0], [1, 0.6, 0.8]);
    b.add(new THREE.CylinderGeometry(0.58, 0.66, 1.0, 16, 1, true), m.dark, [0, 0, 7.6], [Math.PI / 2, 0, 0]);
    roundel(b, m, 3.0, 0.0, 3.0, 0.5); roundel(b, m, -3.0, 0.0, 3.0, 0.5);
    parts.burners.push(afterburner(m, 0.52, 8.0));
    for (const p of [[-2.6, -0.6, 0], [2.6, -0.6, 0]]) { const pod = rocketPod(m); pod.position.set(...p); parts.pods.push(pod); }
  } else if (kind === 'forward') {
    // NX-37 Corvid: forward-swept wings, canards, twin canted tails and twin engines.
    b.add(lathe([[0.6, -6.5], [0.95, -5], [1.1, -1], [1.0, 2.5], [0.8, 5], [0.45, 6.6], [0.14, 7.8], [0.02, 8.3]]), m.body);
    for (const sx of [-1, 1]) {
      b.add(lathe([[0.5, -6.8], [0.62, -5.6], [0.66, 0], [0.6, 3]], 14), m.body, [0.7 * sx, -0.3, 0.2]);
      b.add(new THREE.CylinderGeometry(0.5, 0.56, 0.8, 14, 1, true), m.dark, [0.7 * sx, -0.3, 6.8], [Math.PI / 2, 0, 0]);
      b.add(wing(5.4, 3.4, 1.6, -2.4, 0.2, sx), m.body, [0.9 * sx, -0.2, 1.0]);
      b.add(wing(1.9, 1.6, 0.6, 0.8, 0.1, sx), m.body, [0.7 * sx, 0.1, -4.8]);
      b.add(fin(2.9, 3.0, 1.0, 2.2, 0.15), m.body, [1.0 * sx, 0.5, 3.4], [0, 0, -0.3 * sx]);
      b.add(wing(2.2, 1.8, 0.8, 1.0, 0.1, sx), m.body, [0.9 * sx, -0.2, 5.4]);
    }
    b.add(fin(0.8, 1.2, 0.8, 0.6, 0.17), m.team, [1.65, 3.2, 5.6], [0, 0, -0.3]);
    b.add(fin(0.8, 1.2, 0.8, 0.6, 0.17), m.team, [-1.65, 3.2, 5.6], [0, 0, 0.3]);
    b.add(new THREE.SphereGeometry(1, 18, 12), m.glass, [0, 0.72, -3.4], [0, 0, 0], [0.5, 0.52, 1.6]);
    roundel(b, m, 4.4, 0.0, 0.2, 0.55); roundel(b, m, -4.4, 0.0, 0.2, 0.55);
    parts.burners.push(afterburner(m, 0.45, 7.2, 0.7), afterburner(m, 0.45, 7.2, -0.7));
    for (const p of [[-2.2, -0.8, 0.8], [2.2, -0.8, 0.8]]) { const bm = bombMesh(m, 0.9); bm.position.set(...p); parts.bombs.push(bm); }
    for (const p of [[-3.4, -0.6, 0.6], [3.4, -0.6, 0.6]]) { const pod = rocketPod(m); pod.position.set(...p); parts.pods.push(pod); }
  } else if (kind === 'stealth') {
    // SX-21 Wraith: faceted body, diamond wing, canted V tails, flat exhausts.
    const S = m.stealth;
    b.add(lathe([[0.7, -6.2], [1.1, -5], [1.25, -1], [1.15, 2.5], [0.85, 5.2], [0.3, 7.6], [0.02, 8.4]], 6), S, [0, 0, 0], [0, 0, Math.PI / 6], [1.5, 0.62, 1]);
    b.add(new THREE.SphereGeometry(1, 8, 6), m.glass, [0, 0.62, -3.6], [0, 0, 0], [0.5, 0.42, 1.7]);
    b.add(wing(5.6, 6.4, 0.9, 5.0, 0.22, 1), S, [0.9, -0.15, -2.2]);
    b.add(wing(5.6, 6.4, 0.9, 5.0, 0.22, -1), S, [-0.9, -0.15, -2.2]);
    b.add(wing(2.7, 2.4, 0.8, 1.7, 0.12, 1), S, [0.9, -0.05, 4.4]);
    b.add(wing(2.7, 2.4, 0.8, 1.7, 0.12, -1), S, [-0.9, -0.05, 4.4]);
    b.add(fin(2.5, 2.9, 1.0, 1.9, 0.14), S, [1.2, 0.35, 3.2], [0, 0, -0.5]);
    b.add(fin(2.5, 2.9, 1.0, 1.9, 0.14), S, [-1.2, 0.35, 3.2], [0, 0, 0.5]);
    b.add(new THREE.BoxGeometry(2.6, 0.28, 0.2), m.dark, [0, 0, 6.3]);
    b.add(new THREE.BoxGeometry(0.06, 0.32, 0.9), m.team, [2.4, 2.1, 5.0], [0, 0, -0.5]);
    b.add(new THREE.BoxGeometry(0.06, 0.32, 0.9), m.team, [-2.4, 2.1, 5.0], [0, 0, 0.5]);
    parts.burners.push(afterburner(m, 0.34, 6.5, 0.7), afterburner(m, 0.34, 6.5, -0.7));
    for (const p of [[-1.0, -0.8, -0.4], [1.0, -0.8, -0.4], [-1.0, -0.8, 1.6], [1.0, -0.8, 1.6]]) { const bm = bombMesh(m, 1.1); bm.position.set(...p); parts.bombs.push(bm); }
  } else if (kind === 'twin') {
    // VX-14 Vortex: big twin-engine, twin-tail air superiority fighter.
    b.add(lathe([[0.8, -6.5], [1.05, -5.5], [1.25, -2], [1.15, 2], [0.9, 5], [0.5, 8], [0.16, 9.6], [0.02, 10.2]]), m.body);
    for (const sx of [-1, 1]) {
      b.add(lathe([[0.72, -8.6], [0.85, -7], [0.9, -1], [0.8, 4]], 14), m.body, [1.15 * sx, -0.45, 0.6]);
      b.add(new THREE.CylinderGeometry(0.7, 0.78, 1.0, 14, 1, true), m.dark, [1.15 * sx, -0.45, 9.0], [Math.PI / 2, 0, 0]);
      b.add(new THREE.BoxGeometry(1.3, 1.0, 0.12), m.dark, [1.2 * sx, -0.5, -3.5]);
      b.add(wing(6.6, 5.8, 1.6, 4.2, 0.24, sx), m.body, [1.4 * sx, -0.2, -1.2]);
      b.add(wing(3.2, 2.8, 1.0, 1.7, 0.14, sx), m.body, [1.5 * sx, -0.3, 6.2]);
      b.add(fin(3.6, 3.6, 1.2, 2.6, 0.18), m.body, [1.7 * sx, 0.4, 3.8], [0, 0, -0.14 * sx]);
      b.add(fin(1.0, 1.4, 1.0, 0.7, 0.19), m.team, [1.7 * sx + 0.5 * sx, 3.4, 6.5], [0, 0, -0.14 * sx], [1, 0.6, 0.8]);
    }
    b.add(new THREE.SphereGeometry(1, 18, 12), m.glass, [0, 0.82, -5.0], [0, 0, 0], [0.56, 0.56, 1.9]);
    roundel(b, m, 5.6, 0.05, 1.6, 0.65); roundel(b, m, -5.6, 0.05, 1.6, 0.65);
    parts.burners.push(afterburner(m, 0.62, 9.4, 1.15), afterburner(m, 0.62, 9.4, -1.15));
    for (const p of [[-1.1, -1.4, 0.5], [1.1, -1.4, 0.5]]) { const bm = bombMesh(m, 1.1); bm.position.set(...p); parts.bombs.push(bm); }
    for (const p of [[-3.6, -0.7, 0], [3.6, -0.7, 0], [-5.0, -0.6, 0.6], [5.0, -0.6, 0.6]]) { const pod = rocketPod(m); pod.position.set(...p); parts.pods.push(pod); }
  } else if (kind === 'ubu') {
    // UBU-121: needle-nosed pearl hyperjet with element-121 glow lines and a plasma exhaust.
    b.add(lathe([[0.75, -7.8], [1.0, -6.4], [1.1, -2], [0.98, 2.5], [0.7, 5.5], [0.34, 8.4], [0.08, 10.4], [0.01, 11.0]]), m.pearl);
    b.add(new THREE.SphereGeometry(1, 18, 12), m.glass, [0, 0.7, -4.6], [0, 0, 0], [0.48, 0.48, 1.9]);
    for (const sx of [-1, 1]) {
      b.add(wing(6.0, 7.0, 0.9, 6.0, 0.18, sx), m.pearl, [0.6 * sx, -0.2, -1.4]);
      b.add(wing(1.6, 1.4, 0.7, 0.7, 0.1, sx), m.pearl, [6.4 * sx, -0.1, 4.4], [0, 0, 0.7 * sx]);
      b.add(wing(1.7, 1.3, 0.4, 1.0, 0.08, sx), m.pearl, [0.6 * sx, 0.1, -6.4]);
      b.add(fin(2.8, 3.2, 0.9, 2.4, 0.14), m.pearl, [0.9 * sx, 0.4, 3.0], [0, 0, -0.42 * sx]);
      b.add(new THREE.BoxGeometry(0.07, 0.07, 7.4), m.glow, [1.02 * sx, 0.05, -1.4]);
      b.add(new THREE.BoxGeometry(5.2, 0.05, 0.1), m.glow, [3.4 * sx, -0.08, 1.8], [0, -0.73 * sx, 0]);
      b.add(new THREE.BoxGeometry(0.08, 0.5, 0.08), m.team, [2.1 * sx, 2.95, 5.2], [0, 0, -0.42 * sx]);
    }
    b.add(new THREE.TorusGeometry(0.72, 0.09, 8, 24), m.glow, [0, 0, 7.6]);
    b.add(new THREE.CylinderGeometry(0.7, 0.78, 1.0, 16, 1, true), m.dark, [0, 0, 7.9], [Math.PI / 2, 0, 0]);
    roundel(b, m, 3.6, -0.02, 3.2, 0.5); roundel(b, m, -3.6, -0.02, 3.2, 0.5);
    parts.burners.push(afterburner(m, 0.62, 8.3, 0, true));
    for (const p of [[-1.6, -0.9, 0.2], [1.6, -0.9, 0.2], [-3.0, -0.8, 1.2], [3.0, -0.8, 1.2]]) { const bm = bombMesh(m, 1.1); bm.position.set(...p); parts.bombs.push(bm); }
    for (const p of [[-4.2, -0.6, 1.0], [4.2, -0.6, 1.0]]) { const pod = rocketPod(m); pod.position.set(...p); parts.pods.push(pod); }
  } else if (kind === 'bomber') {
    b.add(lathe([[0.5, -16.5], [1.1, -14], [1.9, -8], [2.15, -2], [2.1, 4], [1.9, 9], [1.45, 12.5], [0.6, 14.4], [0.05, 14.8]], 20), m.body);
    b.add(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.glass, [0, 0, -14.4], [-Math.PI / 2, 0, 0], [1.25, 1.4, 1.25]);
    b.add(new THREE.SphereGeometry(1, 16, 10), m.glass, [0, 1.75, -10.2], [0, 0, 0], [1.0, 0.65, 1.6]);
    b.add(wing(20, 6.4, 2.6, 2.4, 0.5, 1), m.body, [1.5, 0.3, -4.2]);
    b.add(wing(20, 6.4, 2.6, 2.4, 0.5, -1), m.body, [-1.5, 0.3, -4.2]);
    b.add(wing(6.5, 3.6, 1.8, 1.4, 0.2, 1), m.body, [0.8, 0.5, 12.0]);
    b.add(wing(6.5, 3.6, 1.8, 1.4, 0.2, -1), m.body, [-0.8, 0.5, 12.0]);
    b.add(fin(6.4, 5.4, 2.6, 3.0, 0.3), m.body, [0, 1.5, 10.2]);
    b.add(fin(1.6, 2.9, 2.6, 0.3, 0.31), m.team, [0, 6.4, 13.2], [0, 0, 0], [1, 1, 1]);
    roundel(b, m, 13, 0.72, -1.5, 1.4); roundel(b, m, -13, 0.72, -1.5, 1.4);
    for (const x of [-11.5, -5.5, 5.5, 11.5]) {
      b.add(lathe([[0.35, -3.2], [0.85, -2], [0.95, 0.5], [0.8, 2.2], [0.25, 3.4]], 14), m.body, [x, 0.0, -3.2]);
      const p = propeller(m, 2.1, 4);
      p.position.set(x, 0.0, -6.7);
      parts.props.push(p);
    }
  }

  const body = b.build();
  root.add(body);
  for (const p of [...parts.props, ...parts.burners, ...parts.bombs, ...parts.pods]) root.add(p);
  for (const bm of parts.bombs) bm.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  if (kind === 'bomber') {
    const tb = [[0, 2.3, -5], [0, 0.6, 15.5], [0, -2.0, 3]];
    tb.forEach((pos, i) => {
      const yaw = new THREE.Group();
      yaw.position.set(...pos);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.glass);
      if (i === 2) dome.rotation.x = Math.PI;
      yaw.add(dome);
      const pitch = new THREE.Group();
      pitch.position.y = i === 2 ? -0.3 : 0.3;
      for (const sx of [-0.18, 0.18]) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 6).rotateX(Math.PI / 2).translate(0, 0, -1.0), m.dark);
        barrel.position.x = sx;
        pitch.add(barrel);
      }
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0, -1.9);
      pitch.add(muzzle);
      yaw.add(pitch);
      if (i === 1) yaw.rotation.y = Math.PI;
      root.add(yaw);
      parts.turrets.push({ yaw, pitch, muzzle });
    });
  }
  addDetails(root, parts, kind, m, opts);
  return { group: root, parts };
}

// Dropped bombs and fired rockets reuse one cached template per team/size. Building fresh merged geometry for
// every shot (and never freeing it) leaked GPU memory and caused growing stutter over a long mission.
const projCache = new Map();
function cachedProjectile(key, build) {
  let t = projCache.get(key);
  if (!t) {
    t = build();
    t.traverse((o) => { if (o.isMesh) o.userData.shared = true; });
    projCache.set(key, t);
  }
  return t.clone(); // clones share geometry and materials
}

export function makeBombModel(team, scale = 1) {
  return cachedProjectile(`b${team}:${scale}`, () => bombMesh(airMats(team), scale));
}

export function makeRocketModel(team) {
  return cachedProjectile(`r${team}`, () => {
    const m = airMats(team);
    const b = new Builder();
    b.add(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 8), m.white, [0, 0, 0], [Math.PI / 2, 0, 0]);
    b.add(new THREE.ConeGeometry(0.09, 0.35, 8), m.dark, [0, 0, -0.95], [-Math.PI / 2, 0, 0]);
    return b.build(false);
  });
}
