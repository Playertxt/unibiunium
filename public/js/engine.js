// Renderer, scene, camera, sky, sun/shadows, post-processing, graphics settings and dynamic resolution.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Settings, clamp, IS_MOBILE, screenDpr } from './config.js';

const TIMES = {
  day:  { elev: 42, azim: 150, turbidity: 3.2, rayleigh: 2.2, mieC: 0.003, mieG: 0.8, exposure: 0.42,
          sun: 0xfff2dd, sunI: 3.4, hemiSky: 0xbcd7ff, hemiGround: 0x5a5040, hemiI: 0.55, fog: 0x9db7d2, env: 0.85 },
  dusk: { elev: 6, azim: 245, turbidity: 9, rayleigh: 2.6, mieC: 0.006, mieG: 0.88, exposure: 0.5,
          sun: 0xffa45a, sunI: 2.7, hemiSky: 0xa08fb8, hemiGround: 0x3a2a24, hemiI: 0.45, fog: 0xc0907a, env: 0.7 },
  dawn: { elev: 4, azim: 95, turbidity: 5, rayleigh: 2.2, mieC: 0.005, mieG: 0.86, exposure: 0.48,
          sun: 0xffc08a, sunI: 2.5, hemiSky: 0x9fb2d8, hemiGround: 0x3a3430, hemiI: 0.45, fog: 0xb7b0b8, env: 0.7 },
};

// Rough GPU class from the WebGL renderer string, CPU threads and memory → recommended preset.
export function detectHardware() {
  let gpu = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String((ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '');
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  } catch (e) { /* ignore */ }
  const g = gpu.toLowerCase();
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 0;
  let tier = 2;
  if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(g)) tier = 0;
  else if (/rtx|rx ?[67]\d{3}|radeon pro w|arc a7|titan|apple m\d (pro|max|ultra)/.test(g)) tier = 3;
  else if (/radeon\(tm\) graphics|radeon graphics|vega \d|intel|uhd|iris|hd graphics|mali|adreno|powervr|videocore|vivante/.test(g)) tier = 1;
  else if (/gtx|rx ?\d{3,4}|radeon|geforce|quadro|apple|arc/.test(g)) tier = 2;
  if (cores <= 2) tier = Math.min(tier, 1);
  else if (cores <= 4 && tier > 1) tier--;
  if (mem && mem < 4) tier = Math.min(tier, 1);
  if (IS_MOBILE) {
    // Phones and tablets: Low, or Medium on flagship-class mobile GPUs (Apple, recent Adreno / Mali / Xclipse).
    const strong = /apple|adreno[^\d]*(7[3-9]\d|[89]\d\d)|mali-g(7[1-9]|[6-9]\d\d)|immortalis|xclipse|maleoon/.test(g);
    tier = strong && (!mem || mem >= 4) ? 1 : 0;
  }
  const name = (/ANGLE \((?:[^,]*,\s*)?([^,(]+)/.exec(gpu) || [null, gpu])[1].trim().slice(0, 60) || 'Unknown GPU';
  return { tier: ['low', 'medium', 'high', 'ultra'][tier], gpu: name, cores, mem };
}

export class Engine {
  constructor(container) {
    this.container = container;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !!Settings.data.msaa, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(Settings.data.fov, innerWidth / innerHeight, 0.6, 60000);
    this.camera.position.set(0, 800, 3000);
    this.scene.add(this.camera); // so camera-attached children render

    this.sky = new Sky();
    this.sky.scale.setScalar(30000);
    // Keep the sky's HDR output under the bloom threshold so only weapons/fire glow.
    this.sky.material.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(/gl_FragColor\s*=\s*vec4\(\s*retColor\s*,\s*1\.0\s*\);/, 'gl_FragColor = vec4( min( retColor, vec3( 1.45 ) ), 1.0 );');
    };
    this.scene.add(this.sky);

    this.sunDir = new THREE.Vector3();
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.5;
    const sc = this.sun.shadow.camera;
    sc.left = -380; sc.right = 380; sc.top = 380; sc.bottom = -380; sc.near = 50; sc.far = 5000;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd7ff, 0x5a5040, 0.5);
    this.scene.add(this.hemi);

    this.scene.fog = new THREE.Fog(0xa9bfd6, 1500, 16000);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envRT = null;
    this.shadowFocus = new THREE.Vector3();
    this.timeOfDay = 'day';
    this.look = {};

    // Frame timing for the FPS counter and dynamic resolution.
    this.dynScale = 1;
    this.frameAvg = 16.7;
    this.refreshMs = 16.7;
    this.minFrame = 1000;
    this.minFrameT = 0;
    this.dynTimer = 0;
    this.upCooldown = 3000;
    this.fps = 0; this.fpsFrames = 0; this.fpsTime = 0;

    this.composer = null;
    this.applyGraphics();
    this.setTimeOfDay('day');
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ---------- graphics settings ----------
  get basePixelRatio() { return clamp((Settings.data.renderScale / 100) * screenDpr(), 0.35, 3); }

  updatePixelRatio() {
    const pr = Math.max(0.35, this.basePixelRatio * this.dynScale);
    if (Math.abs(pr - this.renderer.getPixelRatio()) < 0.005) return;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(innerWidth, innerHeight); }
  }

  applyShadows() {
    const size = Settings.gfx.shadowSize;
    const on = size > 0;
    if (this.renderer.shadowMap.enabled !== on) {
      this.renderer.shadowMap.enabled = on;
      this.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    }
    this.sun.castShadow = on;
    if (on && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }

  applyGraphics() {
    this.updatePixelRatio();
    this.applyShadows();
    this.setupComposer();
    this.updateFog();
    this.camera.fov = Settings.data.fov;
    this.camera.updateProjectionMatrix();
  }

  setupComposer() {
    if (this.composer) {
      for (const p of this.composer.passes) if (p.dispose) p.dispose();
      this.composer.dispose();
      this.composer = null;
    }
    if (!Settings.data.bloom) return;
    // Multisampled target so anti-aliasing still works with post-processing on (WebGL2).
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: Settings.data.msaa ? 4 : 0 });
    const c = this.composer = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.4, 1.7);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    c.setPixelRatio(this.renderer.getPixelRatio());
    c.setSize(innerWidth, innerHeight);
  }

  // ---------- atmosphere ----------
  setWorldLook(look) {
    this.look = look || {};
    this.setTimeOfDay(this.timeOfDay);
  }

  setTimeOfDay(name) {
    const t = TIMES[name] || TIMES.day;
    const L = this.look;
    this.timeOfDay = name;
    this.tod = t;
    const u = this.sky.material.uniforms;
    u.turbidity.value = t.turbidity * (L.turbidity || 1);
    u.rayleigh.value = t.rayleigh * (L.rayleigh ?? 1);
    u.mieCoefficient.value = t.mieC;
    u.mieDirectionalG.value = t.mieG;
    const phi = THREE.MathUtils.degToRad(90 - t.elev);
    const theta = THREE.MathUtils.degToRad(t.azim);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);
    this.renderer.toneMappingExposure = t.exposure;
    this.sun.color.set(t.sun);
    this.sun.intensity = t.sunI;
    this.hemi.color.set(t.hemiSky);
    this.hemi.groundColor.set(L.hemiGround ?? t.hemiGround);
    if (L.hemiGround != null && name !== 'day') this.hemi.groundColor.lerp(new THREE.Color(t.hemiGround), 0.5);
    this.hemi.intensity = t.hemiI;
    this.fogBase = new THREE.Color(t.fog);
    if (L.fogTint != null) this.fogBase.lerp(new THREE.Color(L.fogTint), L.tintAmt || 0.3);
    this.updateFog();

    // Image-based lighting from the sky for reflective metal surfaces.
    const envScene = new THREE.Scene();
    const sky2 = new Sky();
    sky2.scale.setScalar(1000);
    sky2.material.uniforms.sunPosition.value.copy(this.sunDir);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = u[k].value;
    envScene.add(sky2);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0, 0.1, 2000);
    this.scene.environment = this.envRT.texture;
    this.envIntensity = t.env;
    sky2.material.dispose(); sky2.geometry.dispose();
  }

  updateFog() {
    if (!this.fogBase) return;
    const f = Settings.gfx.view;
    const L = this.look || {};
    this.scene.fog.color.copy(this.fogBase);
    this.scene.fog.near = 2400 * f * (L.fogNear || 1);
    this.scene.fog.far = 21000 * f * (L.fogFar || 1);
  }

  // Keep the shadow frustum centred on what the player is looking at.
  updateShadows(focus) {
    const texel = (760 / this.sun.shadow.mapSize.x);
    this.shadowFocus.set(Math.round(focus.x / texel) * texel, Math.round(focus.y / texel) * texel, Math.round(focus.z / texel) * texel);
    this.sun.target.position.copy(this.shadowFocus);
    this.sun.position.copy(this.shadowFocus).addScaledVector(this.sunDir, 2500);
    this.sun.target.updateMatrixWorld();
  }

  // ---------- frame timing ----------
  // Called every frame with the real frame interval. Updates the FPS counter and, when enabled, scales the
  // render resolution between 50% and 100% of the chosen setting to hold the target frame rate.
  tick(ms) {
    if (ms > 250 || document.hidden) return; // ignore hitches and background tabs
    this.fpsFrames++; this.fpsTime += ms;
    if (this.fpsTime >= 500) { this.fps = Math.round(this.fpsFrames * 1000 / this.fpsTime); this.fpsFrames = 0; this.fpsTime = 0; }
    // Frame-rate ceiling ≈ the fastest frames in a short window (display refresh, or a throttled/background
    // browser view). Frames can't beat it, so it must never count as "too slow".
    this.minFrame = Math.min(this.minFrame, ms);
    this.minFrameT += ms;
    if (this.minFrameT > 1500) { this.refreshMs = this.minFrame; this.minFrame = 1000; this.minFrameT = 0; this.calibrated = true; }
    this.frameAvg += (ms - this.frameAvg) * 0.05;
    const d = Settings.data;
    if (!d.dynRes) {
      if (this.dynScale !== 1) { this.dynScale = 1; this.updatePixelRatio(); }
      return;
    }
    if (!this.calibrated) return;
    this.upCooldown -= ms;
    this.holdDown = (this.holdDown || 0) - ms;
    this.dynTimer += ms;
    if (this.dynTimer < 500) return;
    this.dynTimer = 0;
    // Did the last reduction help? If not, the GPU isn't the bottleneck: undo it and stop trying for a while.
    if (this.probe) {
      if (performance.now() < this.probe.until) return;
      if (this.frameAvg > this.probe.avg * 0.96) { this.dynScale = this.probe.scale; this.updatePixelRatio(); this.holdDown = 20000; }
      this.probe = null;
      return;
    }
    const budget = Math.max(1000 / d.targetFps, this.refreshMs * 1.02);
    if (this.frameAvg > budget * 1.15 && this.dynScale > 0.5 && this.holdDown <= 0) {
      this.probe = { scale: this.dynScale, avg: this.frameAvg, until: performance.now() + 1500 };
      this.dynScale = Math.max(0.5, this.dynScale - 0.1);
      this.upCooldown = 6000;
      this.updatePixelRatio();
    } else if (this.frameAvg < budget * 1.04 && this.upCooldown <= 0 && this.dynScale < 1) {
      this.dynScale = Math.min(1, this.dynScale + 0.05);
      this.upCooldown = 2000;
      this.updatePixelRatio();
    }
  }

  // Give dynamic resolution a grace period (e.g. after loading a world, while shaders compile).
  resetTiming() {
    this.frameAvg = this.refreshMs;
    this.probe = null;
    this.dynTimer = -2000;
    this.upCooldown = Math.max(this.upCooldown, 2000);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
  }

  render() {
    this.sky.position.copy(this.camera.position);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
