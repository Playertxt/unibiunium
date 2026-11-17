// Detail layer added on top of every aircraft model: hinged control surfaces, retractable landing gear with
// doors, navigation/strobe lights, nozzle internals, pitot tube and antennas, canopy frame, seated pilot,
// bomb bay doors (bomber) and — for the player's own aircraft — a full cockpit interior.
import * as THREE from 'three';

// Per-model measurements, taken from the shapes in models.js.
//   wing/tail/canard: { x0, y, z0, span, root, tip, sweep } for the right side (left is mirrored)
//   fins: [{ x, y, z0, h, root, tip, sweep, cant }]   canopy: [y, z, sx, sy, sz]
//   gear: { nose: [z, y], main: [x, z, y], L, r }   nozzles: [[x, y, z, r]]   nose: tip z
const S = {
  fighter: { wing: { x0: 0.6, y: -0.25, z0: -1.4, span: 5, root: 4.6, tip: 1.3, sweep: 3 },
    tail: { x0: 0.5, y: -0.1, z0: 4.9, span: 2.4, root: 2, tip: 0.8, sweep: 1.4 },
    fins: [{ x: 0, y: 0.6, z0: 3.6, h: 3.2, root: 3.4, tip: 1.2, sweep: 2.6, cant: 0 }],
    canopy: [0.72, -3.4, 0.5, 0.5, 1.7], gear: { nose: [-5.2, -0.8], main: [1.6, 0.6, -0.6], L: 1.7, r: 0.33 },
    nozzles: [[0, 0, 7.9, 0.62]], nose: -7.9 },
  interceptor: { wing: { x0: 0.5, y: -0.3, z0: -1.6, span: 4.6, root: 8.8, tip: 0.6, sweep: 7.6 }, delta: true,
    canard: { x0: 0.6, y: 0, z0: -5.6, span: 1.5, root: 1.2, tip: 0.5, sweep: 0.6 },
    fins: [{ x: 0, y: 0.55, z0: 3.6, h: 3.4, root: 4.2, tip: 1, sweep: 3.4, cant: 0 }],
    canopy: [0.65, -4.4, 0.46, 0.46, 1.6], gear: { nose: [-5.8, -0.75], main: [1.8, 1.8, -0.6], L: 1.8, r: 0.33 },
    nozzles: [[0, 0, 8.6, 0.55]], nose: -9.2 },
  attacker: { wing: { x0: 0.9, y: -0.55, z0: -1.6, span: 8.4, root: 3.6, tip: 2, sweep: 0.7 },
    tail: { x0: 0.6, y: 0.1, z0: 5.6, span: 3, root: 2.2, tip: 1.2, sweep: 1 },
    fins: [{ x: 0, y: 0.8, z0: 4, h: 3.8, root: 3.6, tip: 1.6, sweep: 2.2, cant: 0 }],
    canopy: [1.05, -4.4, 0.62, 0.6, 1.5], gear: { nose: [-6, -1], main: [3.2, 0.2, -1.8], L: 1.4, r: 0.42 },
    nozzles: [[3.2, -1.15, 2.5, 0.5], [-3.2, -1.15, 2.5, 0.5]], nose: -8.1 },
  canard: { wing: { x0: 0.5, y: -0.25, z0: -1.4, span: 4.4, root: 7.4, tip: 0.6, sweep: 6.6 }, delta: true,
    canard: { x0: 0.6, y: 0.15, z0: -5, span: 1.7, root: 1.4, tip: 0.5, sweep: 0.9 },
    fins: [{ x: 0, y: 0.6, z0: 2.8, h: 3.3, root: 3.8, tip: 1, sweep: 3, cant: 0 }],
    canopy: [0.66, -3.7, 0.48, 0.5, 1.6], gear: { nose: [-5.2, -0.8], main: [1.6, 1.2, -0.6], L: 1.7, r: 0.33 },
    nozzles: [[0, 0, 7.6, 0.55]], nose: -8.1 },
  forward: { wing: { x0: 0.9, y: -0.2, z0: 1, span: 5.4, root: 3.4, tip: 1.6, sweep: -2.4 },
    canard: { x0: 0.7, y: 0.1, z0: -4.8, span: 1.9, root: 1.6, tip: 0.6, sweep: 0.8 },
    tail: { x0: 0.9, y: -0.2, z0: 5.4, span: 2.2, root: 1.8, tip: 0.8, sweep: 1 },
    fins: [{ x: 1, y: 0.5, z0: 3.4, h: 2.9, root: 3, tip: 1, sweep: 2.2, cant: -0.3 }, { x: -1, y: 0.5, z0: 3.4, h: 2.9, root: 3, tip: 1, sweep: 2.2, cant: 0.3 }],
    canopy: [0.72, -3.4, 0.5, 0.52, 1.6], gear: { nose: [-5, -0.9], main: [1.7, 1.6, -0.7], L: 1.7, r: 0.34 },
    nozzles: [[0.7, -0.3, 6.9, 0.45], [-0.7, -0.3, 6.9, 0.45]], nose: -8.3 },
  stealth: { wing: { x0: 0.9, y: -0.15, z0: -2.2, span: 5.6, root: 6.4, tip: 0.9, sweep: 5 },
    tail: { x0: 0.9, y: -0.05, z0: 4.4, span: 2.7, root: 2.4, tip: 0.8, sweep: 1.7 },
    fins: [{ x: 1.2, y: 0.35, z0: 3.2, h: 2.5, root: 2.9, tip: 1, sweep: 1.9, cant: -0.5 }, { x: -1.2, y: 0.35, z0: 3.2, h: 2.5, root: 2.9, tip: 1, sweep: 1.9, cant: 0.5 }],
    canopy: [0.62, -3.6, 0.5, 0.42, 1.7], gear: { nose: [-5.2, -0.7], main: [1.9, 0.8, -0.6], L: 1.6, r: 0.33 },
    nozzles: [[0.7, 0, 6.3, 0.34], [-0.7, 0, 6.3, 0.34]], nose: -8.4 },
  twin: { wing: { x0: 1.4, y: -0.2, z0: -1.2, span: 6.6, root: 5.8, tip: 1.6, sweep: 4.2 },
    tail: { x0: 1.5, y: -0.3, z0: 6.2, span: 3.2, root: 2.8, tip: 1, sweep: 1.7 },
    fins: [{ x: 1.7, y: 0.4, z0: 3.8, h: 3.6, root: 3.6, tip: 1.2, sweep: 2.6, cant: -0.14 }, { x: -1.7, y: 0.4, z0: 3.8, h: 3.6, root: 3.6, tip: 1.2, sweep: 2.6, cant: 0.14 }],
    canopy: [0.82, -5, 0.56, 0.56, 1.9], gear: { nose: [-6.8, -1], main: [2.4, 1.6, -0.9], L: 1.9, r: 0.4 },
    nozzles: [[1.15, -0.45, 9.2, 0.72], [-1.15, -0.45, 9.2, 0.72]], nose: -10.2 },
  ubu: { wing: { x0: 0.6, y: -0.2, z0: -1.4, span: 6, root: 7, tip: 0.9, sweep: 6 }, delta: true,
    canard: { x0: 0.6, y: 0.1, z0: -6.4, span: 1.7, root: 1.3, tip: 0.4, sweep: 1 },
    fins: [{ x: 0.9, y: 0.4, z0: 3, h: 2.8, root: 3.2, tip: 0.9, sweep: 2.4, cant: -0.42 }, { x: -0.9, y: 0.4, z0: 3, h: 2.8, root: 3.2, tip: 0.9, sweep: 2.4, cant: 0.42 }],
    canopy: [0.7, -4.6, 0.48, 0.48, 1.9], gear: { nose: [-6.2, -0.85], main: [1.8, 1.2, -0.6], L: 1.8, r: 0.34 },
    nozzles: [[0, 0, 7.9, 0.6]], nose: -11 },
  bomber: { wing: { x0: 1.5, y: 0.3, z0: -4.2, span: 20, root: 6.4, tip: 2.6, sweep: 2.4 },
    tail: { x0: 0.8, y: 0.5, z0: 12, span: 6.5, root: 3.6, tip: 1.8, sweep: 1.4 },
    fins: [{ x: 0, y: 1.5, z0: 10.2, h: 6.4, root: 5.4, tip: 2.6, sweep: 3, cant: 0 }],
    canopy: [1.75, -10.2, 1, 0.65, 1.6], crew: 2, gear: { nose: [-11.5, -1.6], main: [5.5, -1.6, -0.7], L: 3.2, r: 0.75, dual: true },
    nozzles: [], nose: -14.8, bay: true },
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0);

const shared = {};
function mats() {
  if (shared.m) return shared.m;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  shared.m = {
    gearMetal: std({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.85 }),
    tyre: std({ color: 0x151515, roughness: 0.95 }),
    bay: std({ color: 0xc9c7b8, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide }),
    hot: std({ color: 0x3a3634, roughness: 0.4, metalness: 0.9, emissive: 0x2a0d02, side: THREE.DoubleSide }),
    turbine: std({ color: 0x55585c, roughness: 0.35, metalness: 0.95 }),
    frame: std({ color: 0x2b2e31, roughness: 0.5, metalness: 0.6 }),
    flight: std({ color: 0x5c6646, roughness: 0.85 }),            // flight suit
    helmet: std({ color: 0xe8e8e2, roughness: 0.35, metalness: 0.1 }),
    visor: std({ color: 0x1a1408, roughness: 0.05, metalness: 0.9 }),
    seat: std({ color: 0x2f3236, roughness: 0.75, metalness: 0.3 }),
    cushion: std({ color: 0x3e4a34, roughness: 0.95 }),
    tub: std({ color: 0x2c3034, roughness: 0.85, metalness: 0.2, side: THREE.DoubleSide }),
    stripe: std({ color: 0xd9b52c, roughness: 0.6 }),
    red: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.25, 0.2), toneMapped: false }),
    green: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 4, 0.5), toneMapped: false }),
    white: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4), toneMapped: false }),
    lens: new THREE.MeshBasicMaterial({ color: 0xfff6d8 }),
  };
  return shared.m;
}

// A hinged plate: hinge from a to b (a must be the -x end for horizontal surfaces, the bottom for fins),
// extending aft with chords cA at a and cB at b. Returns the pivot group; set pivot.userData.deflect(θ).
function hingedSurface(mat, a, b, cA, cB, t) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(len, 0); s.lineTo(len, cB); s.lineTo(0, cA); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: t * 0.3, bevelSize: Math.min(0.05, t * 0.4), bevelSegments: 1 });
  g.rotateX(Math.PI / 2);
  g.translate(0, t / 2, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.1, uv.getY(i) * 0.1);
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  const pivot = new THREE.Group();
  pivot.position.copy(a);
  pivot.quaternion.setFromUnitVectors(X, dir.normalize());
  pivot.add(mesh);
  pivot.userData.surface = mesh;
  return pivot;
}

// Point along a wing's trailing edge at span fraction f (0 root, 1 tip), side ±1.
function trailing(w, f, side) {
  return V((w.x0 + w.span * f) * side, w.y, w.z0 + w.root + (w.sweep + w.tip - w.root) * f);
}

// Control surfaces for one lifting surface; returns [{ pivot, role, side }].
function surfacesFor(w, mat, segments, chordK, t) {
  const out = [];
  for (const side of [1, -1]) {
    for (const [f0, f1, role] of segments) {
      const pa = trailing(w, f0, side), pb = trailing(w, f1, side);
      const ca = (w.root + (w.tip - w.root) * f0) * chordK, cb = (w.root + (w.tip - w.root) * f1) * chordK;
      // Order the hinge so it always runs toward +x.
      const pivot = side > 0 ? hingedSurface(mat, pa, pb, ca, cb, t) : hingedSurface(mat, pb, pa, cb, ca, t);
      out.push({ pivot, role, side });
    }
  }
  return out;
}

function gearLeg(m, L, r, dual) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const k = new THREE.Mesh(geo, mat); k.position.set(x, y, z); k.rotation.set(rx, 0, rz); k.castShadow = true; g.add(k); return k; };
  add(new THREE.CylinderGeometry(r * 0.32, r * 0.32, L * 0.62, 10), m.gearMetal, 0, -L * 0.31, 0);     // oleo upper
  add(new THREE.CylinderGeometry(r * 0.22, r * 0.22, L * 0.4, 10), m.gearMetal, 0, -L * 0.72, 0);       // piston
  add(new THREE.CylinderGeometry(r * 0.08, r * 0.08, L * 0.7, 6), m.gearMetal, r * 0.25, -L * 0.4, r * 0.35, 0.45); // drag brace
  add(new THREE.BoxGeometry(r * 0.15, r * 0.3, L * 0.35), m.gearMetal, 0, -L * 0.62, -L * 0.1, 0.5);    // torque link
  const offs = dual ? [-r * 0.55, r * 0.55] : [0];
  for (const ox of offs) {
    add(new THREE.CylinderGeometry(r, r, r * 0.7, 18), m.tyre, ox, -L, 0, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(r * 0.55, r * 0.55, r * 0.74, 14), m.gearMetal, ox, -L, 0, 0, Math.PI / 2);
  }
  add(new THREE.CylinderGeometry(r * 0.12, r * 0.12, r * 1.6 + (dual ? r * 1.1 : 0), 8), m.gearMetal, 0, -L, 0, 0, Math.PI / 2); // axle
  return g;
}

function gearUnit(m, airM, pos, L, r, dual, doorW, doorL) {
  const unit = new THREE.Group();
  unit.position.copy(pos);
  const leg = gearLeg(m, L, r, dual);
  unit.add(leg);
  const doors = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * doorW, 0, 0);
    const d = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.04, doorL), airM.body);
    d.position.x = -side * doorW / 2;
    d.castShadow = true;
    hinge.add(d);
    unit.add(hinge);
    doors.push({ hinge, side });
  }
  const well = new THREE.Mesh(new THREE.BoxGeometry(doorW * 1.9, 0.5, doorL * 0.96), m.bay);
  well.position.y = 0.25;
  unit.add(well);
  return { unit, leg, doors, well };
}

function navLight(mat, pos, r = 0.09) {
  const k = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
  k.position.copy(pos);
  return k;
}

function pilot(m, airM, head) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0) => { const k = new THREE.Mesh(geo, mat); k.position.set(x, y, z); k.rotation.x = rx; k.castShadow = true; g.add(k); return k; };
  add(new THREE.SphereGeometry(0.17, 16, 12), m.helmet, 0, 0, 0);
  add(new THREE.SphereGeometry(0.172, 16, 8, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.32, Math.PI * 0.32), m.visor, 0, 0, 0).rotation.y = Math.PI;
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), m.frame, 0.06, -0.12, -0.12, 1.2);              // oxygen hose
  add(new THREE.BoxGeometry(0.1, 0.07, 0.07), m.frame, 0, -0.1, -0.15);                                 // mask
  add(new THREE.BoxGeometry(0.44, 0.52, 0.28), m.flight, 0, -0.45, 0.08, -0.12);                        // torso
  add(new THREE.BoxGeometry(0.3, 0.08, 0.24), airM.team, 0, -0.3, -0.06);                                // harness patch
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.06, 0.055, 0.42, 8), m.flight, sx * 0.26, -0.5, -0.12, -0.9);       // arms
    add(new THREE.CylinderGeometry(0.08, 0.07, 0.55, 8), m.flight, sx * 0.12, -0.72, -0.36, -1.4);      // thighs
    add(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 8), m.flight, sx * 0.12, -0.96, -0.7, -0.15);       // shins
  }
  // Ejection seat behind the pilot.
  add(new THREE.BoxGeometry(0.56, 1.0, 0.14), m.seat, 0, -0.3, 0.3);
  add(new THREE.BoxGeometry(0.5, 0.12, 0.5), m.cushion, 0, -0.78, 0.05);
  add(new THREE.BoxGeometry(0.4, 0.22, 0.16), m.seat, 0, 0.12, 0.3);                                    // headbox
  add(new THREE.TorusGeometry(0.07, 0.015, 6, 12), m.stripe, 0, -0.68, -0.25, Math.PI / 2);             // ejection handle
  g.position.copy(head);
  return g;
}

function panelTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function drawPanel(g, w, h) {
  g.fillStyle = '#26292c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  const mfd = (x, y, s, kind) => {
    g.fillStyle = '#121416'; g.fillRect(x - 10, y - 10, s + 20, s + 20);
    for (let i = 0; i < 5; i++) for (const [bx, by] of [[x + 10 + i * (s - 20) / 4.5, y - 8], [x + 10 + i * (s - 20) / 4.5, y + s + 2]]) { g.fillStyle = '#4a4e52'; g.fillRect(bx, by, 14, 6); }
    g.fillStyle = '#031208'; g.fillRect(x, y, s, s);
    g.strokeStyle = '#38ff7a'; g.fillStyle = '#38ff7a'; g.lineWidth = 2; g.font = '12px monospace';
    const cx = x + s / 2, cy = y + s / 2;
    if (kind === 'radar') {
      for (let r = 1; r <= 3; r++) { g.beginPath(); g.arc(cx, y + s - 8, (s - 16) * r / 3, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); }
      g.beginPath(); g.moveTo(cx, y + s - 8); g.lineTo(cx - s * 0.35, y + 16); g.moveTo(cx, y + s - 8); g.lineTo(cx + s * 0.35, y + 16); g.stroke();
      for (let i = 0; i < 4; i++) g.fillRect(cx - 40 + i * 25, y + 30 + (i % 2) * 30, 7, 7);
      g.fillText('RWS 40', x + 6, y + 14);
    } else if (kind === 'adi') {
      g.fillStyle = '#0b2a4a'; g.fillRect(x, y, s, s / 2); g.fillStyle = '#3b2a12'; g.fillRect(x, cy, s, s / 2);
      g.strokeStyle = '#ffffff'; g.beginPath(); g.moveTo(x, cy); g.lineTo(x + s, cy); g.stroke();
      for (let i = -2; i <= 2; i++) if (i) { g.beginPath(); g.moveTo(cx - 20, cy - i * 16); g.lineTo(cx + 20, cy - i * 16); g.stroke(); }
      g.strokeStyle = '#ffd23a'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 34, cy); g.lineTo(cx - 10, cy); g.lineTo(cx, cy + 8); g.lineTo(cx + 10, cy); g.lineTo(cx + 34, cy); g.stroke();
    } else {
      g.fillText('ENG  L     R', x + 8, y + 18);
      for (const [i, v] of [[0, 0.82], [1, 0.79]]) { g.strokeRect(x + 30 + i * 60, y + 30, 22, s - 50); g.fillRect(x + 30 + i * 60, y + 30 + (s - 50) * (1 - v), 22, (s - 50) * v); }
      g.fillText('FUEL 6400', x + 8, y + s - 8);
    }
  };
  const s = Math.floor(h * 0.62);
  mfd(w * 0.05, h * 0.22, s, 'radar');
  mfd(w * 0.5 - s / 2, h * 0.22, s, 'adi');
  mfd(w * 0.95 - s, h * 0.22, s, 'eng');
  // Small round standby gauges and warning lights.
  for (let i = 0; i < 4; i++) {
    const gx = w * 0.32 + i * 26, gy = h * 0.1;
    g.fillStyle = '#0c0d0e'; g.beginPath(); g.arc(gx, gy, 10, 0, 7); g.fill();
    g.strokeStyle = '#e8e8e8'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + 7 * Math.cos(i), gy - 7 * Math.sin(i)); g.stroke();
  }
  ['#ff3b30', '#ffb43a', '#38ff7a', '#38ff7a'].forEach((c, i) => { g.fillStyle = c; g.fillRect(w * 0.6 + i * 22, h * 0.06, 14, 9); });
}

function drawConsole(g, w, h) {
  g.fillStyle = '#25282b'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    const x = 10 + c * (w - 20) / 6, y = 10 + r * (h - 20) / 4;
    g.fillStyle = '#16181a'; g.fillRect(x, y, (w - 20) / 6 - 6, (h - 20) / 4 - 6);
    g.fillStyle = (r + c) % 3 ? '#8a8f94' : '#d9b52c'; g.fillRect(x + 6, y + 6, 8, 8);
    g.fillStyle = '#c8c8c8'; g.fillRect(x + 20, y + 8, 18, 3);
  }
}

function drawHud(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(60,255,120,0.95)'; g.fillStyle = 'rgba(60,255,120,0.95)'; g.lineWidth = 3; g.font = '22px monospace';
  g.beginPath(); g.arc(w / 2, h / 2, 10, 0, 7); g.moveTo(w / 2 - 40, h / 2); g.lineTo(w / 2 - 14, h / 2); g.moveTo(w / 2 + 14, h / 2); g.lineTo(w / 2 + 40, h / 2); g.stroke();
  for (let i = -2; i <= 2; i++) if (i) { g.beginPath(); g.moveTo(w / 2 - 70, h / 2 - i * 50); g.lineTo(w / 2 - 25, h / 2 - i * 50); g.moveTo(w / 2 + 25, h / 2 - i * 50); g.lineTo(w / 2 + 70, h / 2 - i * 50); g.stroke(); g.fillText(String(Math.abs(i) * 10), w / 2 + 78, h / 2 - i * 50 + 7); }
  g.strokeRect(20, h / 2 - 20, 70, 40); g.strokeRect(w - 90, h / 2 - 20, 70, 40);
  g.fillText('SPD', 30, h / 2 - 30); g.fillText('ALT', w - 80, h / 2 - 30);
  for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(w / 2 - 120 + i * 30, 26); g.lineTo(w / 2 - 120 + i * 30, i % 3 ? 36 : 44); g.stroke(); }
}

// Detailed cockpit interior around the given eye point (player aircraft only).
function cockpit(m, eye, width) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const k = new THREE.Mesh(geo, mat); k.position.set(eye.x + x, eye.y + y, eye.z + z); k.rotation.set(rx, ry, rz); g.add(k); return k; };
  const W = width;
  // Tub: floor, side walls, rear bulkhead.
  add(new THREE.BoxGeometry(W * 2, 0.04, 2.4), m.tub, 0, -1.02, -0.35);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.75, 2.4), m.tub, sx * W, -0.68, -0.35);
  add(new THREE.BoxGeometry(W * 2, 0.9, 0.04), m.tub, 0, -0.6, 0.62);
  add(new THREE.BoxGeometry(W * 2, 0.62, 0.04), m.tub, 0, -0.74, -1.2);                 // front bulkhead (footwell)
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.16, 0.05, 2.0), m.tub, sx * (W + 0.05), -0.3, -0.3); // canopy sills
  // Instrument panel with three MFDs, glare shield and canopy-frame mirrors.
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTexture(512, 192, drawPanel), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.18, emissiveMap: null });
  panelMat.emissiveMap = panelMat.map;
  add(new THREE.BoxGeometry(W * 1.9, 0.44, 0.06), panelMat, 0, -0.3, -0.8, -0.32);
  add(new THREE.BoxGeometry(W * 2, 0.05, 0.3), m.tub, 0, -0.07, -0.88, 0.08);
  // Centre pedestal and side consoles.
  add(new THREE.BoxGeometry(0.24, 0.4, 0.3), panelMat, 0, -0.78, -0.72, -0.5);
  const conMat = new THREE.MeshStandardMaterial({ map: panelTexture(256, 160, drawConsole), roughness: 0.7 });
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.2, 0.06, 0.9), conMat, sx * (W - 0.12), -0.62, -0.2);
  // Control stick (centre) and throttle (left console); animated through userData.
  const stick = new THREE.Group();
  stick.position.set(eye.x, eye.y - 1.0, eye.z - 0.42);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.42, 8).translate(0, 0.21, 0), m.frame);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.13, 10).translate(0, 0.47, 0), m.seat);
  const trig = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.04).translate(0, 0.47, -0.04), m.stripe);
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 10).translate(0, 0.04, 0), m.tub);
  stick.add(shaft, grip, trig, boot);
  g.add(stick);
  const throttle = new THREE.Group();
  throttle.position.set(eye.x - W + 0.12, eye.y - 0.6, eye.z - 0.2);
  throttle.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05).translate(0, 0.08, 0), m.frame));
  throttle.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.12).translate(0, 0.18, 0), m.seat));
  g.add(throttle);
  // Rudder pedals.
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.1, 0.16, 0.03), m.frame, sx * 0.14, -0.95, -1.1, -0.4);
  // HUD: combiner glass and frame with symbology.
  const hudTex = panelTexture(512, 400, drawHud);
  const hudMat = new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  add(new THREE.PlaneGeometry(0.26, 0.2), hudMat, 0, -0.02, -0.72, -0.2);
  add(new THREE.BoxGeometry(0.28, 0.02, 0.02), m.frame, 0, -0.12, -0.74);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.015, 0.22, 0.015), m.frame, sx * 0.14, -0.03, -0.74, -0.2);
  add(new THREE.BoxGeometry(0.2, 0.1, 0.14), m.frame, 0, -0.18, -0.8);                // HUD projector
  // Ejection seat (pilot body is hidden in cockpit view; the seat stays).
  add(new THREE.BoxGeometry(0.58, 1.05, 0.14), m.seat, 0, -0.45, 0.42);
  add(new THREE.BoxGeometry(0.52, 0.12, 0.52), m.cushion, 0, -0.9, 0.12);
  add(new THREE.BoxGeometry(0.42, 0.26, 0.18), m.seat, 0, 0.05, 0.44);
  add(new THREE.TorusGeometry(0.08, 0.016, 6, 12), m.stripe, 0, -0.82, -0.12, Math.PI / 2);
  g.userData.stick = stick;
  g.userData.throttle = throttle;
  return g;
}

// Add all detail parts to an aircraft model.
export function addDetails(root, parts, kind, airM, opts = {}) {
  const sp = S[kind];
  if (!sp) return;
  const m = mats();
  const surfMat = kind === 'stealth' ? airM.stealth : kind === 'ubu' ? airM.pearl : airM.body;
  const big = kind === 'bomber';
  const t = big ? 0.22 : 0.09;
  const surf = [];
  // Wing: flaps inboard, ailerons outboard (deltas get two elevons per side).
  const wingSegs = sp.delta ? [[0.12, 0.5, 'elevonIn'], [0.5, 0.94, 'elevonOut']] : [[0.1, 0.55, 'flap'], [0.58, 0.95, 'aileron']];
  surf.push(...surfacesFor(sp.wing, surfMat, wingSegs, sp.delta ? 0.16 : 0.22, t));
  if (sp.tail) surf.push(...surfacesFor(sp.tail, surfMat, [[0.08, 0.95, 'elevator']], 0.3, t * 0.8));
  if (sp.canard) surf.push(...surfacesFor(sp.canard, surfMat, [[0.1, 0.92, 'canard']], 0.35, t * 0.7));
  for (const f of sp.fins) {
    const c = f.root * 0.28, ct = f.tip * 0.3;
    const rot = (px, py) => V(px * Math.cos(f.cant) - py * Math.sin(f.cant), px * Math.sin(f.cant) + py * Math.cos(f.cant), 0);
    const a = rot(0, 0.15).add(V(f.x, f.y, f.z0 + f.root));
    const b = rot(0, f.h * 0.92).add(V(f.x, f.y, f.z0 + f.sweep + f.tip));
    a.z = f.z0 + f.root; b.z = f.z0 + f.sweep + f.tip + (f.root - f.tip) * 0.08;
    surf.push({ pivot: hingedSurface(surfMat, a, b, c, ct, t * 0.9), role: 'rudder', side: 0 });
  }
  for (const s of surf) root.add(s.pivot);
  parts.surfaces = surf;

  // Landing gear (nose + two mains) with doors; animated by Aircraft via parts.gear.
  const G = sp.gear;
  const gearUnits = [];
  const nose = gearUnit(m, airM, V(0, G.nose[1], G.nose[0]), G.L * 0.85, G.r * 0.8, big, G.r * 0.9, G.L * 0.9);
  gearUnits.push(nose);
  for (const sx of [-1, 1]) gearUnits.push(gearUnit(m, airM, V(G.main[0] * sx, G.main[2], G.main[1]), G.L, G.r, !!G.dual, G.r * (G.dual ? 1.6 : 1.1), G.L * 0.95));
  for (const u of gearUnits) root.add(u.unit);
  parts.gear = gearUnits;

  // Navigation lights (red left / green right / white tail) and anti-collision strobes.
  const w = sp.wing;
  const tipL = V(-(w.x0 + w.span), w.y, w.z0 + w.sweep + w.tip * 0.4), tipR = tipL.clone(); tipR.x *= -1;
  root.add(navLight(m.red, tipL), navLight(m.green, tipR));
  const tailZ = Math.max(...sp.nozzles.map((n) => n[2]), sp.fins[0].z0 + sp.fins[0].root);
  root.add(navLight(m.white, V(0, sp.nozzles.length ? 0.6 : 2, tailZ + 0.2), 0.07));
  const f0 = sp.fins[0];
  const strobeTop = navLight(m.white, V(f0.x - Math.sin(f0.cant) * f0.h, f0.y + Math.cos(f0.cant) * f0.h + 0.05, f0.z0 + f0.sweep + f0.tip * 0.5), big ? 0.18 : 0.1);
  const strobeBelly = navLight(m.red, V(0, -(big ? 2.1 : 1.0), w.z0 + w.root * 0.4), big ? 0.18 : 0.1);
  root.add(strobeTop, strobeBelly);
  parts.strobes = [strobeTop, strobeBelly];
  // Landing light in the nose gear bay (visible with the gear down).
  const lamp = navLight(m.lens, V(0, G.nose[1] - 0.15, G.nose[0] - G.r), 0.08);
  nose.unit.add(lamp); lamp.position.set(0, -0.2, -G.r * 1.2);

  // Pitot tube, blade antennas, nozzle petals and turbine faces.
  const add = (geo, mat, x, y, z, rx = 0) => { const k = new THREE.Mesh(geo, mat); k.position.set(x, y, z); k.rotation.x = rx; root.add(k); return k; };
  add(new THREE.CylinderGeometry(0.02, 0.03, big ? 1.0 : 0.7, 6), m.gearMetal, big ? 0.7 : 0, big ? 0.6 : 0, sp.nose - 0.5, Math.PI / 2);
  add(new THREE.BoxGeometry(0.03, 0.32, 0.4), airM.dark, 0, sp.canopy[0] + sp.canopy[3] * 0.6, sp.canopy[1] + sp.canopy[4] + 0.8);
  add(new THREE.BoxGeometry(0.03, 0.26, 0.34), airM.dark, 0, -(big ? 2.1 : 0.95), sp.canopy[1] + 1.2);
  for (const [nx, ny, nz, nr] of sp.nozzles) {
    const petals = new THREE.Mesh(new THREE.CylinderGeometry(nr * 0.86, nr * 1.02, nr * 1.2, 14, 1, true), m.hot);
    petals.rotation.x = Math.PI / 2; petals.position.set(nx, ny, nz + nr * 0.5);
    const face = new THREE.Mesh(new THREE.CircleGeometry(nr * 0.82, 18), m.turbine);
    face.position.set(nx, ny, nz - 0.05); face.rotation.y = Math.PI;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(nr * 0.28, nr * 0.6, 10), m.turbine);
    cone.rotation.x = Math.PI / 2; cone.position.set(nx, ny, nz + nr * 0.25);
    root.add(petals, face, cone);
  }

  // Canopy frame (windscreen bow + mid bow + sill rails).
  const [cy, cz, csx, csy, csz] = sp.canopy;
  for (const [dz, k] of [[-0.55, 0.835], [0.05, 0.998]]) {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(1, big ? 0.04 : 0.025, 6, 20, Math.PI), m.frame);
    bow.scale.set(csx * k, csy * k, 1);
    bow.position.set(0, cy, cz + dz * csz);
    bow.userData.cockpitKeep = true;
    root.add(bow);
  }
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.04, csz * 1.8), m.frame, sx * csx * 0.98, cy + 0.01, cz).userData.cockpitKeep = true;

  // Crew: seated pilot(s) under the canopy.
  const crew = sp.crew || 1;
  parts.pilots = [];
  for (let i = 0; i < crew; i++) {
    const hx = crew > 1 ? (i ? 0.45 : -0.45) : 0;
    const head = V(hx, cy + csy * 0.28, cz + csz * 0.12);
    const p = pilot(m, airM, head);
    root.add(p);
    parts.pilots.push(p);
  }
  parts.eye = V(crew > 1 ? -0.45 : 0, cy + csy * 0.28 + 0.1, cz + csz * 0.12 - 0.04);

  // Bomber: bomb bay with hinged doors.
  if (sp.bay) {
    const cavity = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.4, 6.6), m.bay);
    cavity.position.set(0, -1.25, -0.2);
    root.add(cavity);
    parts.bayDoors = [];
    for (const sx of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(sx * 0.98, -1.95, -0.2);
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.06, 6.6), airM.body);
      d.position.x = -sx * 0.49;
      d.castShadow = true;
      hinge.add(d);
      root.add(hinge);
      parts.bayDoors.push({ hinge, side: sx });
    }
  }

  if (opts.cockpit) {
    parts.cockpit = cockpit(m, parts.eye, Math.min(csx * 0.95, 0.55));
    parts.cockpit.visible = false;
    root.add(parts.cockpit);
  }
}
