// Loading-screen backdrop: a procedural B-2 style stealth bomber parked in a dark hangar, lit by
// overhead work lights, with a polished reflective floor, light shafts, drifting dust and bloom.
// Runs on its own canvas/renderer so it can show before (and while) the game world is generated.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- textures ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let seed = 4;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// Radar-absorbent skin: dark grey with panel lines, fastener rows and blotchy wear. UVs are metres / 56.
function skinTexture() {
  return canvasTex(2048, 2048, (g, w, h) => {
    g.fillStyle = '#5a5f66'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 220;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const v = rnd() < 0.5 ? '255,255,255' : '0,0,0';
      gr.addColorStop(0, `rgba(${v},${0.03 + rnd() * 0.04})`); gr.addColorStop(1, `rgba(${v},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Large edge-aligned panels (B-2 panel seams follow the planform angles).
    g.lineWidth = 2.2;
    for (let i = -20; i < 40; i++) {
      g.strokeStyle = `rgba(20,22,26,${0.25 + rnd() * 0.2})`;
      g.beginPath(); g.moveTo(i * 90, 0); g.lineTo(i * 90 + h * 0.65, h); g.stroke();
      g.beginPath(); g.moveTo(i * 90 + h * 0.65, 0); g.lineTo(i * 90, h); g.stroke();
    }
    g.lineWidth = 1.2;
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, s = 30 + rnd() * 120;
      g.strokeStyle = 'rgba(15,16,18,0.35)'; g.strokeRect(x, y, s, s * (0.5 + rnd()));
      g.fillStyle = 'rgba(10,10,12,0.4)';
      for (let k = 0; k < s; k += 7) { g.fillRect(x + k, y - 3, 1.6, 1.6); }
    }
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},0.04)`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  });
}

function concreteTexture() {
  return canvasTex(2048, 2048, (g, w, h) => {
    g.fillStyle = '#6c6a66'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 160;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = rnd() < 0.7;
      gr.addColorStop(0, dark ? `rgba(20,18,16,${0.05 + rnd() * 0.12})` : `rgba(255,255,250,${0.03 + rnd() * 0.05})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Slab joints every ~6 m (texture covers 48 m).
    g.strokeStyle = 'rgba(25,24,22,0.7)'; g.lineWidth = 3;
    for (let i = 0; i <= 8; i++) { const p = i * w / 8; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
    for (let i = 0; i < 20000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},0.06)`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  });
}

function floorMarkings() {
  // Yellow taxi guide line, red/white keep-out border and stencilled bay number, on a transparent sheet.
  return canvasTex(2048, 2048, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2;
    g.strokeStyle = 'rgba(214,170,40,0.85)'; g.lineWidth = 16;
    g.beginPath(); g.moveTo(cx, h); g.lineTo(cx, h * 0.18); g.stroke();
    g.setLineDash([60, 40]); g.lineWidth = 8;
    g.strokeRect(w * 0.08, h * 0.12, w * 0.84, h * 0.78);
    g.setLineDash([]);
    g.fillStyle = 'rgba(214,170,40,0.75)';
    g.font = 'bold 150px "Share Tech Mono", monospace'; g.textAlign = 'center';
    g.fillText('BAY 121', cx, h * 0.96);
    g.fillStyle = 'rgba(190,40,30,0.7)';
    g.font = 'bold 120px serif';
    g.fillText('立入禁止', cx, h * 0.1);
  });
}

function wallTexture() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#2b2d30'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { g.fillStyle = x % 32 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)'; g.fillRect(x, 0, 8, h); }
    for (let i = 0; i < 120; i++) {
      const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${0.1 + rnd() * 0.15})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

function signTexture() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#121214'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(200,40,30,0.9)';
    g.font = 'bold 260px serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('第百二十一', 30, h * 0.42);
    g.fillStyle = 'rgba(230,225,215,0.75)';
    g.font = 'bold 64px "Share Tech Mono", monospace';
    g.fillText('HANGAR 121 · UBU WING', 36, h * 0.86);
  });
}

// ---------- B-2 style flying wing ----------
// Half-planform (x >= 0, metres, nose at z = 0, aft is +z). Span 52.4 m, length 21 m.
const TIP = 26.2;
const leadZ = (x) => x * 0.637;                            // ~32.5 degree leading-edge sweep
const TE = [[0, 19.6], [8.6, 15.4], [15.8, 21.0], [TIP, 17.5]]; // double-W "sawtooth" trailing edge
function trailZ(x) {
  for (let i = 0; i < TE.length - 1; i++) {
    const [x0, z0] = TE[i], [x1, z1] = TE[i + 1];
    if (x <= x1) return z0 + (z1 - z0) * (x - x0) / (x1 - x0);
  }
  return TE[TE.length - 1][1];
}
// Local thickness (top): crew bulge in the centre, engine humps either side, thin outer wing.
function topH(x, u, z) {
  const ax = Math.abs(x);
  const base = 0.32 + 0.95 * (1 - ax / TIP);
  const fuselage = 1.35 * Math.exp(-((ax / 4.4) ** 2)) * smooth(-0.05, 0.3, u) * (1 - smooth(0.4, 1.0, u) * 0.8);
  const nacelle = 0.55 * Math.exp(-(((ax - 5.2) / 2.2) ** 2)) * smooth(3.5, 8, z) * (1 - smooth(12, 18.5, z));
  const prof = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.2 + 0.0001) ** 0.75), 0.9) * (1 - u * 0.25);
  return base * prof + fuselage + nacelle * 0.9;
}
function botH(x, u) {
  const ax = Math.abs(x);
  const base = 0.18 + 0.45 * (1 - ax / TIP);
  const belly = 0.55 * Math.exp(-((ax / 4.5) ** 2));
  return -(base + belly) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.0001) ** 0.8), 1.1);
}

function buildWingGeometry() {
  // Spanwise stations (including the sawtooth vertices so the edges stay crisp), chordwise samples.
  const xs = new Set();
  for (let i = 0; i <= 120; i++) xs.add(+(TIP * (i / 120) ** 1.15).toFixed(4));
  for (const [x] of TE) xs.add(x);
  const span = [...xs].sort((a, b) => a - b);
  const NU = 48;
  const stations = [];
  for (let s = span.length - 1; s > 0; s--) stations.push(-span[s]);
  for (const x of span) stations.push(x);
  const pos = [], uv = [], idx = [];
  const rows = stations.length;
  const addSurface = (top) => {
    const start = pos.length / 3;
    for (const x of stations) {
      const ax = Math.abs(x), z0 = leadZ(ax), z1 = trailZ(ax);
      for (let j = 0; j <= NU; j++) {
        const u = 0.5 - 0.5 * Math.cos(Math.PI * j / NU); // cluster samples at both edges
        const z = z0 + (z1 - z0) * u;
        const tipFade = 1 - smooth(TIP - 0.6, TIP, ax) * 0.75;
        const y = (top ? topH(x, u, z) : botH(x, u)) * tipFade;
        pos.push(x, y, z - 10.5);
        uv.push(x / 56 + 0.5, z / 56);
      }
    }
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < NU; j++) {
      const a = start + i * (NU + 1) + j, b = a + NU + 1;
      if (top) idx.push(a, a + 1, b, b, a + 1, b + 1);
      else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  };
  addSurface(true);
  addSurface(false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Height of the upper skin at a point, for placing details on it.
function skinY(x, z) {
  const ax = Math.abs(x), z0 = leadZ(ax), z1 = trailZ(ax);
  const u = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
  return topH(x, u, z);
}

function buildBomber(skin) {
  const group = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({ color: 0x6c727a, map: skin, roughness: 0.55, metalness: 0.4, clearcoat: 0.25, clearcoatRoughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.6, metalness: 0.2 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1016, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 2.2 });
  const gearMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.85 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x6c7178, map: skin, roughness: 0.5, metalness: 0.35 });

  const wing = new THREE.Mesh(buildWingGeometry(), body);
  wing.castShadow = true; wing.receiveShadow = true;
  group.add(wing);

  const parts = (list, mat) => {
    const m = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), mat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Cockpit: four small faceted windows on the crew hump.
  const wins = [];
  for (const [sx, w] of [[-1, 0.55], [1, 0.55]]) {
    for (const [ox, oz, rot] of [[0.35, 0, 0.0], [1.05, 0.25, 0.45]]) {
      const zc = 2.35 + oz, xc = sx * ox;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, -0.35); shape.lineTo(w / 2, -0.25); shape.lineTo(w / 2 - 0.08, 0.32); shape.lineTo(-w / 2 + 0.05, 0.36); shape.closePath();
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2 + 0.62);
      g.rotateY(-sx * rot);
      g.translate(xc, skinY(xc, zc) + 0.02, zc - 10.5);
      wins.push(g);
    }
  }
  const winMesh = parts(wins, glass); winMesh.castShadow = false;

  // Serrated engine intakes on top of the nacelles, and recessed exhaust troughs near the trailing edge.
  const intake = [], exhaust = [];
  for (const sx of [-1, 1]) {
    const xc = sx * 5.4, zc = 6.4;
    const shape = new THREE.Shape();
    shape.moveTo(-1.5, 0); shape.lineTo(-0.9, -0.55); shape.lineTo(-0.2, -0.05); shape.lineTo(0.5, -0.6); shape.lineTo(1.4, 0); shape.lineTo(0, 0.3); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false });
    g.rotateX(-Math.PI / 2 + 0.25);
    g.translate(xc, skinY(xc, zc) - 0.18, zc - 10.5);
    intake.push(g);
    for (const ox of [-0.9, 0.9]) {
      const ex = xc + ox * 0.9, ez = 16.0;
      const t = new THREE.BoxGeometry(1.1, 0.12, 3.6);
      t.rotateY(sx * -0.32);
      t.translate(ex, Math.max(0.05, skinY(ex, ez) - 0.04), ez - 10.5);
      exhaust.push(t);
    }
  }
  parts(intake, dark);
  parts(exhaust, dark);

  // Landing gear: nose gear and two four-wheel main bogies, with open bay doors.
  const gear = [], tyres = [], doors = [];
  const leg = (x, z, h) => {
    gear.push(new THREE.CylinderGeometry(0.16, 0.2, h, 12).translate(x, -h / 2 - 0.3, z));
    gear.push(new THREE.CylinderGeometry(0.08, 0.08, h * 0.85, 8).rotateX(0.35).translate(x, -h / 2 - 0.2, z + 0.7));
  };
  const GH = 3.2;
  leg(0, 4.2 - 10.5, GH - 0.2);
  for (const sx of [-1, 1]) tyres.push(new THREE.CylinderGeometry(0.55, 0.55, 0.38, 24).rotateZ(Math.PI / 2).translate(sx * 0.3, -GH - 0.0, 4.2 - 10.5));
  doors.push(new THREE.BoxGeometry(0.06, 1.3, 2.4).translate(-0.8, -0.95, 4.4 - 10.5), new THREE.BoxGeometry(0.06, 1.3, 2.4).translate(0.8, -0.95, 4.4 - 10.5));
  for (const sx of [-1, 1]) {
    const x = sx * 6.6, z = 11.6 - 10.5;
    leg(x, z, GH - 0.3);
    gear.push(new THREE.BoxGeometry(0.35, 0.3, 2.6).translate(x, -GH + 0.35, z));
    for (const [ox, oz] of [[-0.42, -0.85], [0.42, -0.85], [-0.42, 0.85], [0.42, 0.85]]) {
      tyres.push(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 24).rotateZ(Math.PI / 2).translate(x + ox, -GH + 0.05, z + oz));
    }
    doors.push(new THREE.BoxGeometry(0.07, 1.8, 4.2).translate(x + sx * 1.45, -1.15, z), new THREE.BoxGeometry(0.07, 1.4, 3.6).translate(x - sx * 1.45, -0.95, z));
  }
  parts(gear, gearMat);
  parts(tyres, tyre);
  parts(doors, doorMat);

  // Faint navigation/formation lights.
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  navR.position.set(-TIP + 0.4, 0.15, trailZ(TIP) - 1.2 - 10.5);
  const navG = navR.clone(); navG.material = new THREE.MeshBasicMaterial({ color: 0x2aff6a }); navG.position.x = TIP - 0.4;
  group.add(navR, navG);

  group.position.y = GH + 0.92; // tyres touch the floor
  return group;
}

// ---------- hangar ----------
export class HangarScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.t = 0;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.85;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07080a);
    scene.fog = new THREE.FogExp2(0x0b0c0f, 0.012);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 400);
    this.camera.layers.enable(1);

    this.build();
    const env = new THREE.PMREMGenerator(r);
    scene.environment = env.fromScene(this.envScene(), 0.04).texture;
    env.dispose();

    const composer = this.composer = new EffectComposer(r);
    composer.addPass(new RenderPass(scene, this.camera));
    // Scrub NaN/Inf pixels (e.g. extreme specular highlights in half-float) so bloom can't smear them over the frame.
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main() { vec4 c = texture2D(tDiffuse, vUv);
          if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
          gl_FragColor = vec4(clamp(c.rgb, 0.0, 40.0), 1.0); }`,
    }));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.42, 0.55, 0.9);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.resize();
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
  }

  build() {
    const s = this.scene;
    const concrete = concreteTexture();
    concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
    concrete.repeat.set(3, 3);

    // Polished floor: a planar mirror under a slightly transparent concrete layer.
    const mirror = new Reflector(new THREE.PlaneGeometry(160, 160), {
      textureWidth: 1024, textureHeight: 1024, color: 0x6d6f73, clipBias: 0.003,
    });
    mirror.rotation.x = -Math.PI / 2;
    s.add(mirror);
    this.mirror = mirror;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({
      map: concrete, roughness: 0.5, metalness: 0.0, transparent: true, opacity: 0.8, color: 0x8a8884,
    }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; floor.receiveShadow = true;
    floor.layers.set(1); // seen by the main camera only, so it doesn't block the mirror's own render
    s.add(floor);
    const marks = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshStandardMaterial({ map: floorMarkings(), transparent: true, roughness: 0.6, depthWrite: false }));
    marks.rotation.x = -Math.PI / 2; marks.position.set(0, 0.02, 2);
    marks.receiveShadow = true;
    marks.layers.set(1);
    s.add(marks);

    // Shell: back wall, side walls, ceiling with steel trusses.
    const wallTex = wallTexture(); wallTex.wrapS = THREE.RepeatWrapping; wallTex.repeat.set(6, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.3, color: 0x9a9a9a });
    const W = 84, D = 70, H = 22;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat); back.position.set(0, H / 2, -D / 2 + 8); s.add(back);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat);
      side.rotation.y = -sx * Math.PI / 2; side.position.set(sx * W / 2, H / 2, 8); s.add(side);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.9 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, 8); s.add(ceil);
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.55, metalness: 0.8 });
    const truss = [];
    for (let z = -24; z <= 40; z += 8) {
      truss.push(new THREE.BoxGeometry(W, 0.5, 0.35).translate(0, H - 0.4, z), new THREE.BoxGeometry(W, 0.3, 0.3).translate(0, H - 2.6, z));
      for (let x = -W / 2; x < W / 2; x += 3) truss.push(new THREE.BoxGeometry(0.12, 2.6, 0.12).rotateZ(((x / 3) % 2 ? 0.7 : -0.7)).translate(x + 1.5, H - 1.5, z));
    }
    for (const x of [-30, -10, 10, 30]) truss.push(new THREE.BoxGeometry(0.3, 0.4, D).translate(x, H - 2.7, 8));
    // Wall columns.
    for (const x of [-W / 2 + 0.5, -21, 0, 21, W / 2 - 0.5]) truss.push(new THREE.BoxGeometry(0.9, H, 0.9).translate(x, H / 2, -D / 2 + 8.5));
    const trussMesh = new THREE.Mesh(mergeGeometries(truss.map((g) => g.toNonIndexed())), steel);
    trussMesh.castShadow = true;
    s.add(trussMesh);

    // Back-wall sign with red kanji, and a tall lit door slit behind the aircraft.
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.8, emissive: 0xffffff, emissiveMap: signTexture(), emissiveIntensity: 0.12 }));
    sign.position.set(-14, 12.5, -D / 2 + 8.05); s.add(sign);
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 16), new THREE.MeshBasicMaterial({ color: 0x9fc4ff }));
    slit.position.set(19, 8, -D / 2 + 8.06); s.add(slit);
    const slitLight = new THREE.SpotLight(0x8fb4ff, 500, 90, 0.7, 0.9, 1.6);
    slitLight.position.set(19, 8, -D / 2 + 9); slitLight.target.position.set(6, 1, 5);
    s.add(slitLight, slitLight.target);

    // Overhead work lights: emissive housings, real spot lights and soft light shafts.
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xd8ccb4 });
    const housing = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6, metalness: 0.7 });
    // Volumetric-looking light shaft: brightest along the cone's core (facing the viewer), fading at its
    // silhouette edges and towards the floor, so it reads as lit haze rather than a solid cone.
    const shaftMat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xffdcaa) }, strength: { value: 0.22 }, len: { value: H - 3.2 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vT; uniform float len;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vT = clamp(-position.y / len, 0.0, 1.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; varying float vT; uniform vec3 color; uniform float strength;
        void main() { float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(clamp(f, 0.0, 1.0), 2.5) * pow(clamp(1.0 - vT, 0.0, 1.0), 1.6) * strength; gl_FragColor = vec4(color * a, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const lamps = [[-12, -4], [12, -4], [-12, 12], [12, 12], [0, 4]];
    lamps.forEach(([x, z], i) => {
      const y = H - 3.2;
      const box = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 0.7, 20), housing); box.position.set(x, y + 0.4, z); s.add(box);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), lampMat); lens.rotation.x = Math.PI / 2; lens.position.set(x, y, z); s.add(lens);
      const sp = new THREE.SpotLight(0xffe6c0, i === 4 ? 1100 : 650, 60, 0.6, 0.6, 1.7);
      sp.position.set(x, y - 0.1, z); sp.target.position.set(x * 0.6, 0, z + 1);
      if (i === 4 || i === 0) { sp.castShadow = true; sp.shadow.mapSize.set(2048, 2048); sp.shadow.bias = -0.0002; sp.shadow.normalBias = 0.03; sp.shadow.camera.near = 2; sp.shadow.camera.far = 40; }
      s.add(sp, sp.target);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 7.5, y, 32, 1, true).translate(0, -y / 2, 0), shaftMat);
      cone.position.set(x, y, z);
      cone.lookAt(x * 0.6, 0, z + 1); cone.rotateX(-Math.PI / 2);
      cone.renderOrder = 5;
      s.add(cone);
    });
    s.add(new THREE.HemisphereLight(0x3a4250, 0x0d0c0b, 0.35));
    // Cool rim light from behind for the silhouette, warm fill from the front-left.
    const rim = new THREE.DirectionalLight(0x8fb0ff, 0.9); rim.position.set(10, 14, -40); s.add(rim);
    const fill = new THREE.PointLight(0xffb070, 140, 50, 1.8); fill.position.set(-22, 4, 22); s.add(fill);

    // Tool carts, a tow tractor, crates, ladder: shapes to read as a working hangar.
    const prop = new THREE.MeshStandardMaterial({ color: 0x3c3f3a, roughness: 0.7, metalness: 0.5 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xb08a1e, roughness: 0.55, metalness: 0.3 });
    const red = new THREE.MeshStandardMaterial({ color: 0x7a1c16, roughness: 0.6, metalness: 0.3 });
    const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; s.add(m); return m; };
    add(new THREE.BoxGeometry(3.2, 1.2, 2), yellow, -30, 0.9, 6, 0.4);
    add(new THREE.BoxGeometry(1.4, 1.1, 1.6), yellow, -29.2, 2.0, 5.7, 0.4);
    for (const [x, z] of [[-31.2, 5.2], [-29.0, 7.0], [-30.9, 7.3], [-28.6, 4.9]]) add(new THREE.CylinderGeometry(0.42, 0.42, 0.35, 16).rotateZ(Math.PI / 2), prop, x, 0.42, z, 0.4);
    add(new THREE.BoxGeometry(1.6, 1.0, 0.8), red, 23, 0.5, 10, -0.3);
    add(new THREE.BoxGeometry(1.6, 0.9, 0.8), red, 23, 1.45, 10, -0.3);
    for (const [x, z, sz] of [[-30, -10, 2.2], [-27.4, -10.5, 1.6], [-29, -7.8, 1.8], [28, -14, 2.4], [30.5, -12.6, 1.5]]) add(new THREE.BoxGeometry(sz, sz, sz), prop, x, sz / 2, z, x * 0.1);
    const ladder = [];
    for (let i = 0; i < 10; i++) ladder.push(new THREE.BoxGeometry(1.2, 0.06, 0.35).translate(0, 0.4 + i * 0.42, -i * 0.16));
    ladder.push(new THREE.BoxGeometry(0.08, 4.6, 0.08).rotateX(0.37).translate(-0.6, 2.2, -0.8), new THREE.BoxGeometry(0.08, 4.6, 0.08).rotateX(0.37).translate(0.6, 2.2, -0.8));
    add(mergeGeometries(ladder.map((g) => g.toNonIndexed())), yellow, 13, 0, 12, -0.6);
    // Wheel chocks and a few traffic cones.
    const cone = new THREE.MeshStandardMaterial({ color: 0xd2501e, roughness: 0.6 });
    for (const [x, z] of [[-16, 18], [16, 18], [-8, 21], [8, 21]]) add(new THREE.ConeGeometry(0.28, 0.75, 16), cone, x, 0.38, z);

    // The bomber.
    this.bomber = buildBomber(skinTexture());
    this.bomber.rotation.y = Math.PI - 0.32; // nose out towards the hangar doors (and the camera)
    this.bomber.position.z = 0;
    s.add(this.bomber);

    // Dust motes drifting through the light.
    const N = 700;
    const p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { p[i * 3] = (Math.random() - 0.5) * 60; p[i * 3 + 1] = Math.random() * 18; p[i * 3 + 2] = (Math.random() - 0.5) * 50 + 4; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe8c8, size: 0.05, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.add(this.dust);
    // Keep the dust out of the floor reflection so the mirror only shows the aircraft and hangar.
    const mirrorRender = this.mirror.onBeforeRender;
    this.mirror.onBeforeRender = (...args) => { this.dust.visible = false; mirrorRender.apply(this.mirror, args); this.dust.visible = true; };
  }

  // A simplified copy of the hangar's light layout for image-based reflections.
  envScene() {
    const e = new THREE.Scene();
    e.background = new THREE.Color(0x050506);
    const lm = new THREE.MeshBasicMaterial({ color: 0xffe6c4 });
    for (const [x, z] of [[-12, -4], [12, -4], [-12, 12], [12, 12], [0, 4]]) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(2.4, 16), lm); l.rotation.x = Math.PI / 2; l.position.set(x, 18, z); e.add(l);
    }
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(5, 18), new THREE.MeshBasicMaterial({ color: 0x9fc4ff })); slit.position.set(19, 8, -26); e.add(slit);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(84, 22, 70), new THREE.MeshBasicMaterial({ color: 0x141518, side: THREE.BackSide })); wall.position.set(0, 11, 8); e.add(wall);
    return e;
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // ~58 degree horizontal field of view on any screen shape (clamped for very tall screens).
    this.camera.fov = Math.min(72, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(29)) / (w / h))));
    this.camera.updateProjectionMatrix();
  }

  render(dt = 0.016) {
    this.t += dt;
    const t = this.t;
    const aspect = this.camera.aspect;
    // Slow cinematic drift: low three-quarter front view, with the aircraft framed right of centre.
    const a = -0.55 + Math.sin(t * 0.045) * 0.08;
    const dist = (aspect < 1 ? 60 : 44) + Math.sin(t * 0.07) * 1.5;
    const c = this.camera;
    c.position.set(Math.sin(a) * dist, 15.5 + Math.sin(t * 0.09) * 0.6, Math.cos(a) * dist + 3);
    // Frame the aircraft right of centre, leaving the left side for the title.
    const look = new THREE.Vector3(aspect < 1 ? 0 : -10 * Math.min(1, aspect / 1.6), 2.2, -1);
    c.lookAt(look);
    const pos = this.dust.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * (0.08 + (i % 7) * 0.02);
      if (y > 18) y = 0;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.05);
    }
    pos.needsUpdate = true;
    this.composer.render(dt);
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.render(dt);
      if (!this.shown) { this.shown = true; this.canvas.classList.add('show'); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }
}
