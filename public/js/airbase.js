// Detailed world structures: airfields (marked runway, taxiways, apron, lights, PAPI, arched hangars with
// interiors, control tower, windsock, ground vehicles, revetments, parked aircraft, fence, tree lines),
// a road network with bridges over rivers, town streets/towers/chimneys and base camps.
import * as THREE from 'three';
import { RNG } from './noise.js';
import { AIRCRAFT, TEAM_HEX } from './config.js';
import { SITES } from './world.js';
import { buildAircraftModel } from './models.js';
import { treeGeometry } from './scenery.js';
import { depthBias } from './depth.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

const speckle = (g, w, h, n, a) => {
  for (let i = 0; i < n; i++) { const v = Math.random() > 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${a * Math.random()})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
};

// Runway: 55 m x 1700 m. u runs across the width, v along the length.
function runwayTexture() {
  return canvasTex(256, 4096, (g, w, h) => {
    const pm = h / 1700, pw = w / 55;           // pixels per metre along / across
    g.fillStyle = '#3a3c3f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? '70,72,75' : '45,46,48'},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 120, 30 + Math.random() * 200); }
    speckle(g, w, h, 30000, 0.12);
    // Tyre rubber in the touchdown zones.
    for (const end of [0, 1]) for (let i = 0; i < 120; i++) {
      const v0 = (end ? h - (150 + Math.random() * 450) * pm : (150 + Math.random() * 450) * pm);
      g.fillStyle = `rgba(10,10,10,${0.08 + Math.random() * 0.12})`;
      g.fillRect(w / 2 + (Math.random() - 0.5) * 18 * pw, v0, (1 + Math.random() * 2) * pw, (20 + Math.random() * 80) * pm);
    }
    g.fillStyle = '#e8e8e2';
    g.fillRect(1.5 * pw, 0, 0.9 * pw, h); g.fillRect(w - 2.4 * pw, 0, 0.9 * pw, h);        // edge lines
    for (let y = 120 * pm; y < h - 120 * pm; y += 50 * pm) g.fillRect(w / 2 - 0.45 * pw, y, 0.9 * pw, 30 * pm); // centreline
    for (const end of [0, 1]) {
      const at = (m) => (end ? h - m * pm : m * pm);
      for (let k = 0; k < 16; k++) {                                                        // threshold piano keys
        const x = (3.5 + k * 3 + (k >= 8 ? 3 : 0)) * pw;
        g.fillRect(x, end ? at(36) : at(6), 1.8 * pw, 30 * pm);
      }
      for (const m of [150, 450]) for (const sx of [-1, 1]) for (let b = 0; b < 3; b++) g.fillRect(w / 2 + sx * (6 + b * 2.2) * pw - (sx < 0 ? 1.5 * pw : 0), end ? at(m + 22) : at(m), 1.5 * pw, 22 * pm); // touchdown zone bars
      for (const sx of [-1, 1]) g.fillRect(w / 2 + sx * 7 * pw - (sx < 0 ? 9 * pw : 0), end ? at(345) : at(300), 9 * pw, 45 * pm); // aiming points
      g.save();
      g.translate(w / 2, end ? at(80) : at(80));
      if (!end) g.rotate(Math.PI); // readable from the approach end
      g.font = `bold ${Math.round(16 * pw)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(end ? '27' : '09', 0, 0);
      g.restore();
    }
  });
}

function asphaltTex(lines, repeatV, yellow = false) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#404245'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 4000, 0.15);
    if (lines) {
      g.fillStyle = yellow ? '#d9b52c' : '#e0e0d8';
      if (yellow) g.fillRect(w / 2 - 3, 0, 6, h);
      else { g.fillRect(w / 2 - 2, 0, 4, h * 0.55); g.fillRect(4, 0, 4, h); g.fillRect(w - 8, 0, 4, h); }
    }
  }, [1, repeatV]);
}

function concreteTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#8a8a84'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = 128 + Math.random() * 24; g.fillStyle = `rgb(${v},${v},${v - 6})`; g.fillRect(x * 128 + 1, y * 128 + 1, 126, 126); }
    speckle(g, w, h, 20000, 0.1);
    for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(40,36,30,0.12)'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 0, 7); g.fill(); } // oil stains
  });
}

function corrugatedTex() {
  return canvasTex(256, 64, (g, w, h) => {
    for (let x = 0; x < w; x++) { const v = 120 + Math.sin(x / w * Math.PI * 32) * 22; g.fillStyle = `rgb(${v},${v + 4},${v})`; g.fillRect(x, 0, 1, h); }
    speckle(g, w, h, 1500, 0.15);
    g.fillStyle = 'rgba(90,60,30,0.15)'; g.fillRect(0, h * 0.8, w, h * 0.2);   // rust near the ground
  });
}

function windowsTex(rows, cols, base = '#bdb8aa') {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3000, 0.1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = (c + 0.2) * w / cols, y = (r + 0.25) * h / rows;
      g.fillStyle = '#2c3a44'; g.fillRect(x, y, w / cols * 0.6, h / rows * 0.45);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, w / cols * 0.6, h / rows * 0.08);
    }
  });
}

function houseTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1500, 0.08);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, h - 8, w, 8);                       // plinth
    for (const x of [14, 82]) { g.fillStyle = '#2d3a44'; g.fillRect(x, 26, 30, 26); g.fillStyle = '#e8e2d0'; g.fillRect(x + 13, 26, 4, 26); g.fillRect(x, 37, 30, 3); }
    g.fillStyle = '#5a3a24'; g.fillRect(52, 70, 24, 50);                               // door
    for (const x of [14, 82]) { g.fillStyle = '#2d3a44'; g.fillRect(x, 74, 22, 22); }
  });
}

// Many identical small parts as one InstancedMesh.
function instanced(geo, mat, transforms, shadow = false) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, transforms.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  transforms.forEach((t, i) => {
    q.setFromEuler(new THREE.Euler(t.rx || 0, t.ry || 0, t.rz || 0));
    s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    m4.compose(V(t.x, t.y, t.z), q, s);
    mesh.setMatrixAt(i, m4);
  });
  mesh.count = transforms.length;
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  return mesh;
}

const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false });

function flatStrip(mat, x0, z0, x1, z1, width, y, uvScale = 20) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const geo = new THREE.PlaneGeometry(width, len).rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / uvScale);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  mesh.rotation.y = Math.atan2(x1 - x0, z1 - z0);
  mesh.receiveShadow = true;
  return mesh;
}

function decal(mat, depth) {
  return depthBias(mat, depth);
}

// Arched hangar with ribs, corrugated shell, door frame, sliding doors (half open) and a lit interior.
function hangarBuilding(M, R = 16, L = 40) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, ry = 0) => { const k = new THREE.Mesh(geo, mat); k.position.set(x, y, z); k.rotation.y = ry; k.castShadow = true; k.receiveShadow = true; g.add(k); return k; };
  add(new THREE.CylinderGeometry(R, R, L, 32, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), M.shell, 0, 0, 0);
  for (let i = 0; i <= 6; i++) add(new THREE.TorusGeometry(R + 0.12, 0.28, 4, 24, Math.PI), M.steel, 0, 0, -L / 2 + i * L / 6);
  const back = new THREE.Shape(); back.moveTo(-R, 0); back.absarc(0, 0, R, Math.PI, 0, true); back.lineTo(-R, 0);
  add(new THREE.ShapeGeometry(back, 24), M.wall, 0, 0, L / 2, Math.PI);
  const dw = 13, dh = 11;
  const front = new THREE.Shape();
  front.moveTo(-R, 0); front.lineTo(-dw, 0); front.lineTo(-dw, dh); front.lineTo(dw, dh); front.lineTo(dw, 0); front.lineTo(R, 0);
  front.absarc(0, 0, R, 0, Math.PI, false);
  add(new THREE.ShapeGeometry(front, 24), M.wall, 0, 0, -L / 2);
  add(new THREE.BoxGeometry(dw * 2 + 1, 0.8, 0.8), M.steel, 0, dh + 0.4, -L / 2 - 0.3);      // door header
  // Sliding doors: right pair closed, left pair pushed open.
  for (const [x, z] of [[dw * 0.75, -L / 2 - 0.6], [dw * 0.25, -L / 2 - 1.0], [-dw * 0.95, -L / 2 - 0.6], [-dw * 0.95, -L / 2 - 1.0]]) add(new THREE.BoxGeometry(dw / 2, dh - 0.2, 0.3), M.door, x, dh / 2 - 0.05, z);
  add(new THREE.PlaneGeometry(R * 2, L).rotateX(-Math.PI / 2), M.floor, 0, 0.06, 0);
  for (let i = 0; i < 3; i++) for (const x of [-6, 0, 6]) add(new THREE.BoxGeometry(2.2, 0.15, 0.6), M.lamp, x, R * 0.86, -L / 2 + 8 + i * 12);
  add(new THREE.BoxGeometry(4, 1, 1.2), M.door, -R + 4, 0.5, L / 2 - 3);                      // workbench
  add(new THREE.BoxGeometry(1.2, 1.6, 0.8), M.red, -R + 8, 0.8, L / 2 - 2.5);                 // tool chest
  add(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10), M.yellow, R - 5, 0.6, L / 2 - 4);        // gas bottle
  return g;
}

// Control tower: base block, window shaft, sloped glass cab with mullions, roof, railing, mast and beacon.
function controlTower(M) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, ry = 0) => { const k = new THREE.Mesh(geo, mat); k.position.set(x, y, z); k.rotation.y = ry; k.castShadow = true; k.receiveShadow = true; g.add(k); return k; };
  add(new THREE.BoxGeometry(18, 7, 11), M.offices, 0, 3.5, 4);
  add(new THREE.BoxGeometry(18.6, 0.5, 11.6), M.steel, 0, 7.25, 4);
  add(new THREE.BoxGeometry(7, 22, 7), M.shaft, 0, 11, 0);
  add(new THREE.CylinderGeometry(5.4, 5.4, 1.2, 8), M.steel, 0, 22.6, 0, Math.PI / 8);
  add(new THREE.CylinderGeometry(6.4, 5.4, 4.2, 8, 1, true), M.cabGlass, 0, 25.3, 0, Math.PI / 8);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(new THREE.BoxGeometry(0.25, 4.3, 0.25), M.steel, Math.cos(a) * 5.9, 25.3, Math.sin(a) * 5.9); }
  add(new THREE.CylinderGeometry(6.8, 6.8, 0.6, 8), M.steel, 0, 27.7, 0, Math.PI / 8);
  add(new THREE.TorusGeometry(6.5, 0.06, 4, 24), M.steel, 0, 28.9, 0).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.12, 0.12, 9, 6), M.steel, 2, 32.5, 1);
  add(new THREE.SphereGeometry(0.45, 10, 8), glow(0.3, 3, 0.6), 2, 37.2, 1);                  // beacon
  add(new THREE.SphereGeometry(2.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.radome, -3, 28, -2); // radome
  add(new THREE.BoxGeometry(1.4, 0.2, 2.6), M.steel, -2.2, 30.7, 2.4);                        // small radar antenna
  return g;
}

function windsock(M) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 8, 6), M.steel);
  pole.position.y = 4; g.add(pole);
  const sockTex = canvasTex(64, 16, (c, w, h) => { for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? '#f2f2ee' : '#ff6a1a'; c.fillRect(i * w / 5, 0, w / 5, h); } });
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.55, 3.2, 12, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ map: sockTex, side: THREE.DoubleSide, roughness: 0.9 }));
  sock.position.set(1.7, 7.6, 0); sock.rotation.z = -0.15; g.add(sock);
  return g;
}

function vehicle(M, kind) {
  const b = [];
  const box = (w, h, d, x, y, z, mat) => b.push([new THREE.BoxGeometry(w, h, d).translate(x, y, z), mat]);
  if (kind === 'fuel') {
    box(2.4, 2, 2, 0, 1.6, -3.2, M.cab);
    b.push([new THREE.CylinderGeometry(1.15, 1.15, 5.2, 14).rotateX(Math.PI / 2).translate(0, 1.9, 0.7), M.tank]);
    box(2.4, 0.4, 7.6, 0, 0.75, -0.6, M.steel);
  } else {
    box(1.8, 0.9, 3, 0, 0.7, 0, M.yellow);
    box(1.2, 0.8, 1, 0, 1.5, 0.6, M.cab);
  }
  const g = new THREE.Group();
  for (const [geo, mat] of b) { const k = new THREE.Mesh(geo, mat); k.castShadow = true; g.add(k); }
  const wz = kind === 'fuel' ? [-3, 1.5, 2.8] : [-1, 1];
  for (const z of wz) for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12).rotateZ(Math.PI / 2), M.tyre); w.position.set(sx * 1.15, 0.5, z); g.add(w); }
  return g;
}

function parkedAircraft(kind, team) {
  const model = buildAircraftModel(AIRCRAFT[kind].model, team);
  const P = model.parts;
  for (const u of P.gear || []) { u.leg.rotation.x = 0; u.leg.visible = u.well.visible = true; for (const d of u.doors) d.hinge.rotation.z = d.side * 1.45; }
  for (const b of P.burners) b.visible = false;
  for (const f of P.surfaces || []) if (f.role === 'flap') f.pivot.userData.surface.rotation.x = 0.35;
  if (P.strobes) for (const s of P.strobes) s.visible = false;
  model.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model.group);
  model.group.userData.lift = -box.min.y;
  return model.group;
}

function makeMats(world) {
  return {
    shell: new THREE.MeshStandardMaterial({ map: corrugatedTex(), roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide }),
    wall: new THREE.MeshStandardMaterial({ map: corrugatedTex(), color: 0xd4d2c4, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }),
    door: new THREE.MeshStandardMaterial({ color: 0x6d7268, roughness: 0.6, metalness: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5d6064, roughness: 0.5, metalness: 0.7 }),
    floor: decal(new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.85 }), 1),
    lamp: glow(2.4, 2.3, 2.0),
    red: new THREE.MeshStandardMaterial({ color: 0xa8281e, roughness: 0.5 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xd9b52c, roughness: 0.55 }),
    offices: new THREE.MeshStandardMaterial({ map: windowsTex(2, 6), roughness: 0.8 }),
    shaft: new THREE.MeshStandardMaterial({ map: windowsTex(6, 2, '#cfcabb'), roughness: 0.8 }),
    cabGlass: new THREE.MeshStandardMaterial({ color: 0x22394a, roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    radome: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.4 }),
    cab: new THREE.MeshStandardMaterial({ color: 0xd8d6cc, roughness: 0.6 }),
    tank: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.7 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }),
    sand: new THREE.MeshStandardMaterial({ color: new THREE.Color(world.def.palette.sand).multiplyScalar(0.75), roughness: 1 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.9 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x3f5a34, roughness: 0.6, metalness: 0.4 }),
    post: new THREE.MeshStandardMaterial({ color: 0x777a7c, roughness: 0.6, metalness: 0.6 }),
    asphalt: decal(new THREE.MeshStandardMaterial({ map: asphaltTex(false, 1), roughness: 0.9 }), 2),
    taxi: decal(new THREE.MeshStandardMaterial({ map: asphaltTex(true, 1, true), roughness: 0.9 }), 2),
    road: decal(new THREE.MeshStandardMaterial({ map: asphaltTex(true, 1), roughness: 0.9 }), 3),
    paint: decal(new THREE.MeshStandardMaterial({ color: 0xd9b52c, roughness: 0.7 }), 4),
    canvas: new THREE.MeshStandardMaterial({ color: 0x5c6440, roughness: 1, side: THREE.DoubleSide }),
  };
}

export function buildAirfields(world, parent) {
  const M = makeMats(world);
  const rng = new RNG(world.seed + 515);
  const runwayMat = decal(new THREE.MeshStandardMaterial({ map: runwayTexture(), roughness: 0.85 }), 3);
  const shoulderMat = decal(new THREE.MeshStandardMaterial({ map: asphaltTex(false, 40), color: 0x9a9a96, roughness: 0.95 }), 1);
  const apronMat = decal(new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.85 }), 2);
  apronMat.map.repeat.set(500 / 30, 160 / 30);
  const lights = { edge: [], green: [], red: [], blue: [], approach: [], papiR: [], papiW: [], fix: [] };
  const fence = { posts: [], rails: [] };
  const vegetation = world.def.vegetation;
  const treeType = vegetation.mix[0][0];

  [SITES.blueAirfield, SITES.redAirfield].forEach((site, team) => {
    const h = world.heightAt(site.x, site.z);
    const g = new THREE.Group();
    g.position.set(site.x, h, site.z);
    parent.add(g);
    const add = (o) => { g.add(o); return o; };
    const local = (x, z) => world.heightAt(site.x + x, site.z + z) - h;

    // Runway with shoulders (runway runs along local x).
    const rw = add(new THREE.Mesh(new THREE.PlaneGeometry(55, 1700).rotateX(-Math.PI / 2), runwayMat));
    rw.rotation.y = Math.PI / 2; rw.position.y = 0.3; rw.receiveShadow = true;
    for (const sz of [-1, 1]) add(flatStrip(shoulderMat, -850, sz * 31.5, 850, sz * 31.5, 8, 0.25, 40)).rotation.y = Math.PI / 2;
    // Parallel taxiway, connectors and apron.
    add(flatStrip(M.taxi, -800, 75, 800, 75, 23, 0.28));
    for (const x of [-800, -250, 250, 800]) add(flatStrip(M.taxi, x, 28, x, 75, 23, 0.29));
    for (const x of [-160, 140]) add(flatStrip(M.taxi, x, 75, x, 100, 23, 0.29));
    const apron = add(new THREE.Mesh(new THREE.PlaneGeometry(500, 160).rotateX(-Math.PI / 2), apronMat));
    apron.position.set(0, 0.27, 175); apron.receiveShadow = true;
    // Parking stands: lead-in lines and stop bars.
    for (let i = 0; i < 5; i++) {
      const x = -200 + i * 90;
      add(flatStrip(M.paint, x, 100, x, 205, 0.5, 0.3, 5));
      add(flatStrip(M.paint, x - 6, 205, x + 6, 205, 0.6, 0.3, 5));
    }

    // Lights: edges every 60 m, green/red thresholds, approach bars with poles, blue taxiway edges, PAPI.
    for (let x = -850; x <= 850; x += 60) for (const sz of [-1, 1]) lights.edge.push([site.x + x, h + 0.6, site.z + sz * 29]);
    for (let z = -26; z <= 26; z += 4) { lights.green.push([site.x - 852, h + 0.6, site.z + z]); lights.red.push([site.x + 852, h + 0.6, site.z + z]); }
    for (let x = -800; x <= 800; x += 50) for (const sz of [-1, 1]) lights.blue.push([site.x + x, h + 0.5, site.z + 75 + sz * 13]);
    for (const end of [-1, 1]) for (let d = 60; d <= 300; d += 30) for (let z = -8; z <= 8; z += 2) {
      const lx = end * (850 + d);
      const gy = world.heightAt(site.x + lx, site.z + z);
      lights.approach.push([site.x + lx, Math.max(gy, h) + 1.2, site.z + z]);
      if (z === 0) lights.fix.push({ x: site.x + lx, y: (gy + Math.max(gy, h) + 1.2) / 2, z: site.z, sy: Math.max(0.5, Math.max(gy, h) + 1.2 - gy) });
    }
    for (let i = 0; i < 4; i++) (i < 2 ? lights.papiR : lights.papiW).push([site.x - 700, h + 1, site.z - 40 - i * 9]);

    // Hangars (one with a parked jet inside), control tower, windsock.
    for (let i = 0; i < 3; i++) {
      const hg = add(hangarBuilding(M));
      hg.position.set(-180 + i * 70, local(-180 + i * 70, 290), 290);
    }
    const tower = add(controlTower(M));
    tower.position.set(200, local(200, 190), 190);
    tower.rotation.y = Math.PI;
    const sock = add(windsock(M));
    sock.position.set(-640, 0, -70);

    // Parked aircraft on the stands with sandbag revetments, plus one in the first hangar.
    const kinds = ['falcon', 'kestrel', 'hammer', 'viper'];
    for (let i = 0; i < 4; i++) {
      const x = -200 + i * 90;
      const kind = AIRCRAFT[kinds[i]] ? kinds[i] : 'falcon';
      const plane = add(parkedAircraft(kind, team));
      plane.position.set(x, plane.userData.lift + 0.27, 190);
      for (const [dx, dz, w, d] of [[-13, 3, 1.6, 24], [13, 3, 1.6, 24], [0, 15, 27.6, 1.6]]) {
        const bag = add(new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), M.sand));
        bag.position.set(x + dx, 1.1, 190 + dz); bag.castShadow = bag.receiveShadow = true;
      }
    }
    const inside = add(parkedAircraft('falcon', team));
    inside.position.set(-180, inside.userData.lift + 0.06, 292);
    // Ground vehicles, crates and fuel drums.
    for (const [kind, x, z, ry] of [['fuel', -245, 150, 0.3], ['fuel', 60, 230, -1.2], ['tug', -110, 160, 2.2], ['tug', 150, 140, 0.8]]) {
      const v = add(vehicle(M, kind));
      v.position.set(x, 0.27, z); v.rotation.y = ry;
    }
    const crates = [], drums = [];
    for (let i = 0; i < 26; i++) crates.push({ x: 230 + rng.float(-12, 12), y: 0.9 + (i % 3 === 0 ? 1.8 : 0), z: 240 + rng.float(-10, 10), ry: rng.float(0, 1.5) });
    for (let i = 0; i < 30; i++) drums.push({ x: 255 + rng.float(-6, 6), y: 0.75, z: 120 + rng.float(-8, 8) });
    add(instanced(new THREE.BoxGeometry(1.8, 1.8, 1.8), M.crate, crates, true));
    add(instanced(new THREE.CylinderGeometry(0.45, 0.45, 1.5, 10), M.barrel, drums, true));

    // Perimeter fence and tree lines outside it.
    const fx0 = -1060, fx1 = 1060, fz0 = -230, fz1 = 400;
    const corners = [[fx0, fz0], [fx1, fz0], [fx1, fz1], [fx0, fz1], [fx0, fz0]];
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c], [bx, bz] = corners[c + 1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 12);
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const x0 = site.x + ax + (bx - ax) * t0, z0 = site.z + az + (bz - az) * t0;
        const x1 = site.x + ax + (bx - ax) * t1, z1 = site.z + az + (bz - az) * t1;
        const y0 = world.groundAt(x0, z0), y1 = world.groundAt(x1, z1);
        fence.posts.push({ x: x0, y: y0 + 1.2, z: z0 });
        const seg = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
        for (const yo of [0.6, 2.2]) fence.rails.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 + yo, z: (z0 + z1) / 2, sz: seg, ry: Math.atan2(x1 - x0, z1 - z0), rx: -Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0)) });
      }
    }
    const trees = [];
    for (let x = fx0; x <= fx1; x += 22) for (const z of [fz0 - 30, fz1 + 30]) {
      const px = site.x + x + rng.float(-6, 6), pz = site.z + z + rng.float(-8, 8);
      if (world.isWater(px, pz)) continue;
      const s = rng.float(1.6, 2.6);
      trees.push({ x: px, y: world.heightAt(px, pz) - 0.3, z: pz, ry: rng.float(0, 6), sx: s, sy: s * rng.float(0.9, 1.25), sz: s });
    }
    const treeMesh = instanced(treeGeometry(treeType, vegetation), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), trees, true);
    parent.add(treeMesh);
  });

  // Shared light/fence instancing for both airfields (world coordinates).
  const bulb = new THREE.SphereGeometry(0.28, 6, 4);
  const asT = (arr) => arr.map(([x, y, z]) => ({ x, y, z }));
  parent.add(instanced(bulb, glow(2.2, 2.1, 1.7), asT(lights.edge)));
  parent.add(instanced(bulb, glow(0.3, 2.6, 0.6), asT(lights.green)));
  parent.add(instanced(bulb, glow(2.6, 0.25, 0.2), asT(lights.red)));
  parent.add(instanced(bulb, glow(0.35, 0.6, 2.8), asT(lights.blue)));
  parent.add(instanced(bulb, glow(2.6, 2.4, 1.6), asT(lights.approach)));
  parent.add(instanced(new THREE.BoxGeometry(1.4, 0.8, 1.2), glow(2.6, 0.3, 0.2), asT(lights.papiR)));
  parent.add(instanced(new THREE.BoxGeometry(1.4, 0.8, 1.2), glow(2.5, 2.5, 2.4), asT(lights.papiW)));
  parent.add(instanced(new THREE.CylinderGeometry(0.1, 0.12, 1, 6), M.post, lights.fix, true));
  parent.add(instanced(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), M.post, fence.posts, true));
  parent.add(instanced(new THREE.BoxGeometry(0.04, 0.04, 1), M.post, fence.rails));
}

// Roads between bases, airfields and towns; deck bridges with pillars and railings where they cross water.
export function buildRoads(world, parent) {
  const M = makeMats(world);
  const S = SITES, T = S.towns;
  const links = [
    [S.blueBase, S.blueAirfield], [S.redBase, S.redAirfield], [S.blueBase, S.redBase],
    [S.blueBase, T[2]], [S.redBase, T[3]], [S.blueBase, T[0]], [S.redBase, T[1]], [S.blueBase, T[4]], [T[0], T[3]], [T[1], T[4]],
  ];
  const rng = new RNG(world.seed + 616);
  const pillars = [], rails = [];
  links.forEach(([A, B], li) => {
    const dx = B.x - A.x, dz = B.z - A.z, dist = Math.hypot(dx, dz);
    const ux = dx / dist, uz = dz / dist;
    const ax = A.x + ux * A.r * 0.55, az = A.z + uz * A.r * 0.55, bx = B.x - ux * B.r * 0.55, bz = B.z - uz * B.r * 0.55;
    const len = Math.hypot(bx - ax, bz - az), step = 12, N = Math.max(2, Math.round(len / step));
    const bend = rng.float(-0.09, 0.09) * len, wig = rng.float(0, 10);
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const off = Math.sin(t * Math.PI) * bend + Math.sin(t * Math.PI * 3 + wig) * Math.sin(t * Math.PI) * len * 0.02;
      const x = ax + (bx - ax) * t - uz * off, z = az + (bz - az) * t + ux * off;
      const water = world.isWater(x, z);
      const w = 3.6;
      const ground = Math.max(world.heightAt(x, z), world.heightAt(x - uz * w, z + ux * w), world.heightAt(x + uz * w, z - ux * w));
      pts.push({ x, z, water, y: water ? Math.max(0, world.waterLevelAt(x, z)) + 3.2 : Math.max(ground, 0.6) + 0.35, g: world.heightAt(x, z) });
    }
    // Ramps up to bridge decks (10 % grade).
    for (let i = 1; i < pts.length; i++) pts[i].y = Math.max(pts[i].y, pts[i - 1].y - 1.2);
    for (let i = pts.length - 2; i >= 0; i--) pts[i].y = Math.max(pts[i].y, pts[i + 1].y - 1.2);
    const pos = new Float32Array(pts.length * 6), uv = new Float32Array(pts.length * 4), idx = [];
    let run = 0;
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      if (i) run += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1, o = i * 2 + s;
        pos[o * 3] = p.x - tz * 4 * side; pos[o * 3 + 1] = p.y; pos[o * 3 + 2] = p.z + tx * 4 * side;
        uv[o * 2] = s; uv[o * 2 + 1] = run / 16;
      }
      if (i < pts.length - 1) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      const elevated = p.y - Math.max(p.g, 0) > 1.6;
      if (elevated) {
        if (i % 3 === 0) for (const sd of [-1, 1]) pillars.push({ x: p.x - tz * 3 * sd, y: (p.y + Math.min(p.g, p.y - 3)) / 2, z: p.z + tx * 3 * sd, sy: Math.max(1, p.y - Math.min(p.g, p.y - 3)) });
        for (const sd of [-1, 1]) rails.push({ x: p.x - tz * 4.1 * sd, y: p.y + 0.6, z: p.z + tx * 4.1 * sd, sz: 12.2, ry: Math.atan2(tx, tz) });
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, M.road);
    road.receiveShadow = true;
    road.name = `road-${li}`;
    parent.add(road);
  });
  if (pillars.length) parent.add(instanced(new THREE.BoxGeometry(1.2, 1, 1.2), M.post, pillars, true));
  if (rails.length) parent.add(instanced(new THREE.BoxGeometry(0.25, 1.1, 1), M.post, rails, true));
}

// Town streets, a central tower with spire and clock, chimneys, houses with windows/doors; base camps.
export function buildTownDetails(world, parent, towns) {
  const M = makeMats(world);
  const stone = new THREE.MeshStandardMaterial({ map: windowsTex(5, 1, '#c9c2b0'), roughness: 0.85 });
  const spire = new THREE.MeshStandardMaterial({ color: 0x4a5a5e, roughness: 0.5, metalness: 0.4 });
  const clock = new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.5 });
  const brick = new THREE.MeshStandardMaterial({ color: 0x7a4a36, roughness: 0.9 });
  const chim = [];
  // Windows and doors on every house wall.
  if (towns.walls) { towns.walls.material.map = houseTex(); towns.walls.material.needsUpdate = true; }
  for (const t of towns) {
    const h = world.heightAt(t.x, t.z);
    const ang = t.ang || 0;
    // Two crossing streets.
    for (const a of [ang, ang + Math.PI / 2]) {
      const dx = Math.cos(a) * 190, dz = Math.sin(a) * 190;
      parent.add(flatStrip(M.road, t.x - dx, t.z - dz, t.x + dx, t.z + dz, 9, h + 0.35, 16));
    }
    const g = new THREE.Group();
    g.position.set(t.x + Math.cos(ang) * 22 + Math.sin(ang) * 22, h, t.z + Math.sin(ang) * 22 - Math.cos(ang) * 22);
    g.rotation.y = -ang;
    const add = (geo, mat, x, y, z) => { const k = new THREE.Mesh(geo, mat); k.position.set(x, y, z); k.castShadow = k.receiveShadow = true; g.add(k); return k; };
    add(new THREE.BoxGeometry(6, 22, 6), stone, 0, 11, 0);
    add(new THREE.BoxGeometry(6.6, 0.6, 6.6), M.steel, 0, 22.3, 0);
    add(new THREE.ConeGeometry(4.6, 12, 4), spire, 0, 28.6, 0).rotation.y = Math.PI / 4;
    for (const [x, z, ry] of [[0, 3.05, 0], [0, -3.05, Math.PI], [3.05, 0, Math.PI / 2], [-3.05, 0, -Math.PI / 2]]) { const c = add(new THREE.CircleGeometry(1.4, 20), clock, x, 18, z); c.rotation.y = ry; }
    add(new THREE.BoxGeometry(14, 9, 22), stone, 0, 4.5, 15);                         // church nave
    add(new THREE.CylinderGeometry(1, 1, 22.4, 3).rotateX(Math.PI / 2).scale(8.2, 3.4, 1), spire, 0, 10.4, 15); // nave roof
    parent.add(g);
    for (const hs of t.houses || []) chim.push({ x: hs.x + 1.5, y: hs.top - 0.6, z: hs.z + 1 });
  }
  parent.add(instanced(new THREE.BoxGeometry(0.9, 2.6, 0.9), brick, chim, true));

  // Base camps: tents, a flag mast and sandbag walls around each base.
  [SITES.blueBase, SITES.redBase].forEach((b, team) => {
    const g = new THREE.Group();
    const h = world.heightAt(b.x, b.z);
    g.position.set(b.x, h, b.z);
    const tentGeo = new THREE.CylinderGeometry(3, 3, 9, 3, 1).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 1.5, 0);
    for (let i = 0; i < 6; i++) {
      const k = new THREE.Mesh(tentGeo, M.canvas);
      const x = -220 + i * 16, z = team ? 180 : -180;
      k.position.set(x, world.heightAt(b.x + x, b.z + z) - h, z);
      k.castShadow = k.receiveShadow = true;
      g.add(k);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 14, 6), M.post);
    mast.position.set(60, 7, team ? 120 : -120); g.add(mast);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshStandardMaterial({ color: TEAM_HEX[team], side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(62, 12.6, team ? 120 : -120); g.add(flag);
    const bags = [];
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; const r = b.r * 0.62; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (i % 10 < 2) continue; bags.push({ x, y: world.heightAt(b.x + x, b.z + z) - h + 0.7, z, ry: -a, sx: 1, sy: 1, sz: 1 }); }
    g.add(instanced(new THREE.BoxGeometry(1.4, 1.4, r2(b.r)), M.sand, bags, true));
    parent.add(g);
  });
}

const r2 = (r) => (2 * Math.PI * r * 0.62) / 40 + 0.4;

