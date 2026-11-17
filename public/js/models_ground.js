// Procedural ground units and structures.
import * as THREE from 'three';
import { Builder, camoTexture } from './models.js';
import { TEAM_HEX } from './config.js';

const GROUND_CAMO = [['#5d6a3a', '#48552e', '#77744c', '#3d4628'], ['#6c6a58', '#504f43', '#857b62', '#5b5a4a']];
const cache = new Map();
function mats(team) {
  if (cache.has(team)) return cache.get(team);
  const m = {
    camo: new THREE.MeshStandardMaterial({ map: camoTexture(GROUND_CAMO[team], 11 + team, false, 256), roughness: 0.8, metalness: 0.2 }),
    track: new THREE.MeshStandardMaterial({ color: 0x26241f, roughness: 0.95, metalness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x3b3d3a, roughness: 0.55, metalness: 0.7 }),
    team: new THREE.MeshStandardMaterial({ color: TEAM_HEX[team], roughness: 0.6 }),
    canvas: new THREE.MeshStandardMaterial({ color: team ? 0x6b6650 : 0x5e6440, roughness: 1 }),
    sand: new THREE.MeshStandardMaterial({ color: 0x6f6448, roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x8c8a82, roughness: 0.95 }),
    concreteD: new THREE.MeshStandardMaterial({ color: 0x5f5d57, roughness: 0.95 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.7 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x6d7268, roughness: 0.6, metalness: 0.5 }),
    hull: new THREE.MeshStandardMaterial({ color: team ? 0x6a6e70 : 0x7d8890, roughness: 0.6, metalness: 0.4 }),
    deck: new THREE.MeshStandardMaterial({ color: 0x55524a, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.8 }),
  };
  cache.set(team, m);
  return m;
}

export const wreckMat = new THREE.MeshStandardMaterial({ color: 0x1d1b19, roughness: 1, metalness: 0.1 });

export function wreckify(group) {
  group.traverse((o) => { if (o.isMesh && !o.userData.keep) o.material = wreckMat; });
}

function barrelGroup(m, len, radius, count = 1, spacing = 0.4) {
  const pitch = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * spacing;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.15, len, 10).rotateX(Math.PI / 2).translate(x, 0, -len / 2), m.steel);
    b.castShadow = true;
    pitch.add(b);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.z = -len;
  pitch.add(muzzle);
  return { pitch, muzzle };
}

export function buildGroundModel(kind, team) {
  if (kind === 'heavytank') {
    // Bigger, heavier tank: the standard hull scaled up with an extra armour skirt look.
    const out = buildGroundModel('tank', team);
    out.group.scale.set(1.32, 1.25, 1.38);
    return out;
  }
  const m = mats(team);
  const root = new THREE.Group();
  const out = { group: root, turret: null, barrel: null, muzzle: null, dish: null };
  const b = new Builder();

  if (kind === 'tank') {
    b.add(new THREE.BoxGeometry(3.3, 1.1, 6.2), m.camo, [0, 1.15, 0]);
    b.add(new THREE.BoxGeometry(3.3, 0.9, 1.6), m.camo, [0, 1.0, -3.4], [-0.6, 0, 0]);
    b.add(new THREE.BoxGeometry(3.5, 0.25, 6.4), m.camo, [0, 1.6, 0.1]);
    for (const sx of [-1, 1]) {
      b.add(new THREE.BoxGeometry(0.75, 1.0, 6.9), m.track, [1.75 * sx, 0.55, 0]);
      for (let i = 0; i < 6; i++) b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), m.steel, [1.9 * sx, 0.48, -2.6 + i * 1.04], [0, 0, Math.PI / 2]);
    }
    b.add(new THREE.BoxGeometry(0.6, 0.5, 0.9), m.steel, [1.0, 1.85, 2.5]);
    root.add(b.build());
    const turret = new THREE.Group();
    turret.position.set(0, 1.75, 0.4);
    const tb = new Builder();
    tb.add(new THREE.CylinderGeometry(1.35, 1.55, 0.85, 14), m.camo, [0, 0.42, 0], [0, 0, 0], [1, 1, 1.25]);
    tb.add(new THREE.BoxGeometry(1.6, 0.7, 1.4), m.camo, [0, 0.4, 1.6]);
    tb.add(new THREE.CylinderGeometry(0.38, 0.4, 0.4, 10), m.steel, [0.6, 1.0, 0.4]);
    tb.add(new THREE.BoxGeometry(0.06, 0.45, 0.9), m.team, [1.52, 0.45, 0.2]);
    tb.add(new THREE.BoxGeometry(0.06, 0.45, 0.9), m.team, [-1.52, 0.45, 0.2]);
    turret.add(tb.build());
    const { pitch, muzzle } = barrelGroup(m, 4.8, 0.13);
    pitch.position.set(0, 0.45, -1.5);
    const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 10).rotateX(Math.PI / 2).translate(0, 0, -4.6), m.steel);
    pitch.add(brake);
    turret.add(pitch);
    root.add(turret);
    Object.assign(out, { turret, barrel: pitch, muzzle });
  } else if (kind === 'aa') {
    b.add(new THREE.TorusGeometry(3.0, 0.55, 6, 18), m.sand, [0, 0.3, 0], [Math.PI / 2, 0, 0], [1, 1, 0.8]);
    b.add(new THREE.CylinderGeometry(1.3, 1.5, 0.6, 12), m.steel, [0, 0.3, 0]);
    root.add(b.build());
    const turret = new THREE.Group();
    turret.position.y = 0.9;
    const tb = new Builder();
    tb.add(new THREE.BoxGeometry(1.4, 0.8, 1.4), m.camo, [0, 0.3, 0]);
    tb.add(new THREE.BoxGeometry(1.8, 1.1, 0.12), m.camo, [0, 0.9, -0.75]);
    tb.add(new THREE.BoxGeometry(0.5, 0.3, 0.05), m.team, [0, 1.2, -0.82]);
    turret.add(tb.build());
    const { pitch, muzzle } = barrelGroup(m, 3.4, 0.07, 2, 0.45);
    pitch.position.set(0, 0.8, 0);
    turret.add(pitch);
    root.add(turret);
    Object.assign(out, { turret, barrel: pitch, muzzle });
  } else if (kind === 'truck') {
    b.add(new THREE.BoxGeometry(2.3, 1.8, 1.9), m.camo, [0, 1.6, -2.3]);
    b.add(new THREE.BoxGeometry(2.0, 0.6, 0.06), m.glass, [0, 2.0, -3.27]);
    b.add(new THREE.BoxGeometry(2.4, 0.3, 4.4), m.camo, [0, 1.0, 0.8]);
    b.add(new THREE.CylinderGeometry(1.2, 1.2, 4.3, 10, 1, false, 0, Math.PI), m.canvas, [0, 1.6, 0.8], [Math.PI / 2, Math.PI / 2, 0], [1, 1, 0.9]);
    b.add(new THREE.BoxGeometry(2.42, 0.8, 4.3), m.canvas, [0, 1.6, 0.8]);
    for (const z of [-2.3, 0.2, 1.6]) for (const sx of [-1, 1]) b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12), m.track, [1.1 * sx, 0.5, z], [0, 0, Math.PI / 2]);
    root.add(b.build());
  } else if (kind === 'bunker') {
    b.add(new THREE.CylinderGeometry(5.0, 5.6, 2.6, 6), m.concrete, [0, 1.2, 0]);
    b.add(new THREE.CylinderGeometry(5.3, 5.3, 0.5, 6), m.concreteD, [0, 2.7, 0]);
    b.add(new THREE.BoxGeometry(3.2, 0.5, 0.4), m.dark, [0, 1.8, -4.8]);
    b.add(new THREE.TorusGeometry(6.4, 0.7, 5, 14), m.sand, [0, 0.3, 0], [Math.PI / 2, 0, 0]);
    root.add(b.build());
    const turret = new THREE.Group();
    turret.position.set(0, 1.8, -4.4);
    const { pitch, muzzle } = barrelGroup(m, 2.5, 0.12);
    turret.add(pitch);
    root.add(turret);
    Object.assign(out, { turret, barrel: pitch, muzzle });
  } else if (kind === 'depot') {
    for (const [x, z] of [[-6, -4], [6, -4], [0, 6]]) {
      b.add(new THREE.CylinderGeometry(3.2, 3.2, 6, 16), m.silver, [x, 3, z]);
      b.add(new THREE.CylinderGeometry(3.25, 3.25, 0.6, 16), m.team, [x, 4.6, z]);
      b.add(new THREE.SphereGeometry(3.2, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.silver, [x, 6, z], [0, 0, 0], [1, 0.3, 1]);
    }
    b.add(new THREE.BoxGeometry(14, 0.4, 0.4), m.steel, [0, 1, -4]);
    b.add(new THREE.BoxGeometry(18, 1.2, 0.5), m.concrete, [0, 0.6, -10]);
    root.add(b.build());
  } else if (kind === 'radar') {
    b.add(new THREE.BoxGeometry(6, 3, 4), m.concrete, [0, 1.5, 3]);
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) b.add(new THREE.CylinderGeometry(0.12, 0.2, 12, 6), m.steel, [x * 0.7, 6, z * 0.7], [z * 0.05, 0, -x * 0.05]);
    b.add(new THREE.BoxGeometry(3, 0.4, 3), m.steel, [0, 12, 0]);
    root.add(b.build());
    const dish = new THREE.Group();
    dish.position.y = 12.5;
    const db = new Builder();
    db.add(new THREE.SphereGeometry(4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), m.silver, [0, 1.5, 0], [Math.PI / 2 - 0.3, 0, 0], [1, 1, 0.5]);
    db.add(new THREE.BoxGeometry(0.4, 2.2, 0.4), m.steel, [0, 1.1, 0]);
    dish.add(db.build());
    root.add(dish);
    out.dish = dish;
  } else if (kind === 'hangar') {
    b.add(new THREE.CylinderGeometry(15, 15, 38, 20, 1, true, 0, Math.PI), m.roof, [0, 0, 0], [0, 0, Math.PI / 2], [1, 1, 1]);
    b.add(new THREE.CircleGeometry(15, 20, 0, Math.PI), m.camo, [19, 0, 0], [0, Math.PI / 2, 0]);
    b.add(new THREE.CircleGeometry(15, 20, 0, Math.PI), m.dark, [-19, 0, 0], [0, -Math.PI / 2, 0]);
    b.add(new THREE.BoxGeometry(0.2, 4, 2), m.team, [19.1, 9, 0]);
    const g = b.build();
    g.rotation.y = Math.PI / 2;
    root.add(g);
  } else if (kind === 'hq') {
    b.add(new THREE.BoxGeometry(36, 12, 24), m.concrete, [0, 6, 0]);
    b.add(new THREE.BoxGeometry(37, 0.8, 25), m.concreteD, [0, 12.3, 0]);
    b.add(new THREE.BoxGeometry(18, 7, 14), m.concrete, [-6, 16, 0]);
    b.add(new THREE.BoxGeometry(6, 18, 6), m.concreteD, [12, 21, 4]);
    b.add(new THREE.CylinderGeometry(0.15, 0.15, 12, 6), m.steel, [12, 36, 4]);
    b.add(new THREE.BoxGeometry(4, 2.4, 0.1), m.team, [12, 40.5, 6.0]);
    for (let i = 0; i < 6; i++) b.add(new THREE.BoxGeometry(3, 2.2, 0.2), m.glass, [-14 + i * 5.6, 7, -12.1]);
    for (let i = 0; i < 6; i++) b.add(new THREE.BoxGeometry(3, 2.2, 0.2), m.glass, [-14 + i * 5.6, 3, -12.1]);
    b.add(new THREE.BoxGeometry(46, 1.2, 0.6), m.sand, [0, 0.6, -18]);
    root.add(b.build());
  } else if (kind === 'sam') {
    // Tracked SAM launcher: sandbagged pad, a rotating launcher with four missile tubes and a search radar.
    b.add(new THREE.TorusGeometry(4.2, 0.6, 6, 18), m.sand, [0, 0.3, 0], [Math.PI / 2, 0, 0], [1, 1, 0.8]);
    b.add(new THREE.BoxGeometry(3.2, 1.0, 5.2), m.camo, [0, 0.8, 0]);
    for (const sx of [-1, 1]) b.add(new THREE.BoxGeometry(0.6, 0.8, 5.4), m.track, [1.7 * sx, 0.45, 0]);
    b.add(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 6), m.steel, [1.2, 2.6, 1.8]);
    root.add(b.build());
    const turret = new THREE.Group();
    turret.position.y = 1.4;
    const tb = new Builder();
    tb.add(new THREE.CylinderGeometry(1.1, 1.3, 0.6, 10), m.steel, [0, 0.2, 0]);
    tb.add(new THREE.BoxGeometry(0.4, 1.2, 0.4), m.steel, [0, 0.8, 0]);
    turret.add(tb.build());
    const pitch = new THREE.Group();
    pitch.position.set(0, 1.4, 0);
    const lb = new Builder();
    for (const [x, y] of [[-0.45, 0.3], [0.45, 0.3], [-0.45, -0.3], [0.45, -0.3]]) {
      lb.add(new THREE.BoxGeometry(0.5, 0.5, 4.2), m.camo, [x, y, -1.2]);
      lb.add(new THREE.CircleGeometry(0.2, 10), m.dark, [x, y, -3.31], [0, Math.PI, 0]);
    }
    lb.add(new THREE.BoxGeometry(0.3, 0.2, 0.06), m.team, [0, 0.62, 0.9]);
    pitch.add(lb.build());
    const muzzle = new THREE.Object3D();
    muzzle.position.z = -3.6;
    pitch.add(muzzle);
    turret.add(pitch);
    root.add(turret);
    const dish = new THREE.Group();
    dish.position.set(1.2, 4.2, 1.8);
    const db = new Builder();
    db.add(new THREE.BoxGeometry(2.2, 0.8, 0.12), m.silver, [0, 0, 0]);
    dish.add(db.build());
    root.add(dish);
    Object.assign(out, { turret, barrel: pitch, muzzle, dish });
  } else if (kind === 'pilot') {
    // Downed pilot: a crouching figure waving beside a spread-out orange parachute, with a strobe.
    const orange = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.8, emissive: 0x3a1400 });
    b.add(new THREE.CylinderGeometry(4.5, 5.2, 0.12, 12, 1, false, 0, Math.PI * 1.3), orange, [3.5, 0.08, 2]);
    b.add(new THREE.BoxGeometry(0.5, 0.9, 0.35), m.canvas, [0, 0.75, 0]);
    b.add(new THREE.SphereGeometry(0.22, 10, 8), m.dark, [0, 1.38, 0]);
    b.add(new THREE.BoxGeometry(0.14, 0.75, 0.14), m.canvas, [0.38, 1.5, 0], [0, 0, -0.5]);
    for (const sx of [-1, 1]) b.add(new THREE.BoxGeometry(0.17, 0.6, 0.17), m.canvas, [0.13 * sx, 0.3, 0]);
    root.add(b.build());
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff4c0, toneMapped: false }));
    strobe.position.set(-0.8, 0.4, 0.4);
    strobe.userData.keep = true;
    root.add(strobe);
    out.dish = strobe; // GroundUnit spins "dish": reused as the blinking strobe
  } else if (kind === 'ship') {
    const s = new THREE.Shape();
    s.moveTo(0, -48); s.quadraticCurveTo(6.5, -20, 6, 10); s.lineTo(5, 44); s.lineTo(-5, 44); s.lineTo(-6, 10); s.quadraticCurveTo(-6.5, -20, 0, -48);
    const hull = new THREE.ExtrudeGeometry(s, { depth: 7, bevelEnabled: false });
    hull.rotateX(Math.PI / 2);
    b.add(hull, m.hull, [0, 4, 0]);
    b.add(new THREE.BoxGeometry(9, 0.2, 80), m.deck, [0, 4.05, 2]);
    b.add(new THREE.BoxGeometry(7, 5, 14), m.hull, [0, 6.5, -6]);
    b.add(new THREE.BoxGeometry(5, 3, 8), m.hull, [0, 10.5, -8]);
    b.add(new THREE.BoxGeometry(5.2, 1, 0.2), m.glass, [0, 11, -12.1]);
    b.add(new THREE.CylinderGeometry(1.8, 2.2, 7, 12), m.hull, [0, 9, 6]);
    b.add(new THREE.CylinderGeometry(1.85, 1.85, 1, 12), m.team, [0, 12, 6]);
    b.add(new THREE.CylinderGeometry(0.2, 0.2, 14, 6), m.steel, [0, 16, -6]);
    for (const z of [-26, 26]) {
      b.add(new THREE.CylinderGeometry(2.2, 2.5, 1.6, 12), m.hull, [0, 5, z]);
      b.add(new THREE.CylinderGeometry(0.2, 0.2, 6, 8), m.steel, [0, 5.3, z + (z < 0 ? -3.5 : 3.5)], [Math.PI / 2, 0, 0]);
    }
    root.add(b.build());
    const turret = new THREE.Group();
    turret.position.set(0, 7, 16);
    const { pitch, muzzle } = barrelGroup(m, 3, 0.07, 2, 0.5);
    turret.add(pitch);
    root.add(turret);
    Object.assign(out, { turret, barrel: pitch, muzzle });
  }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return out;
}
