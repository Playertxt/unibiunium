// Terrain (deterministic heightmap from a world definition), water and the shared map layout.
import * as THREE from 'three';
import { Simplex, RNG } from './noise.js';
import { WORLD, clamp, lerp, smoothstep } from './config.js';

// Worlds are generated at twice their original extent; the battlefield layout stays in the middle.
const K = WORLD.scale || 1;

// Fixed battlefield layout shared by every world, so missions can reference places by name.
export const SITES = {
  blueAirfield: { x: -1900, z: 5400, r: 950 },
  redAirfield:  { x: 1900, z: -5400, r: 950 },
  blueBase:     { x: -700, z: 2500, r: 520 },
  redBase:      { x: 700, z: -2500, r: 520 },
  front:        { x: 0, z: 0, rx: 3800, rz: 1500 },
  towns: [
    { x: -3100, z: 900, r: 380 }, { x: 2700, z: -800, r: 380 },
    { x: 400, z: 4100, r: 320 }, { x: -400, z: -4100, r: 320 }, { x: 3600, z: 2600, r: 300 },
  ],
  harbor: { x: 7600, z: 1800 },
};

// Flat steps with steep risers (sandstone strata).
function terrace(v, step) {
  if (v <= 0) return 0;
  const t = v / step, i = Math.floor(t);
  return (i + smoothstep(0.55, 1, t - i)) * step;
}

export class World {
  constructor(def) {
    this.def = def;
    this.T = def.terrain;
    this.seed = def.seed;
    this.noise = new Simplex(def.seed);
    this.size = WORLD.size;
    this.seg = WORLD.seg;
    this.n = this.seg + 1;
    this.cell = this.size / this.seg;
    this.half = this.size / 2;
    this.sites = SITES;

    // Flattened zones for airfields, bases and towns (heights computed once all zones exist).
    this.zones = [];
    const zone = (s, strength = 1) => this.zones.push({ x: s.x, z: s.z, r: s.r, strength, h: 0 });
    zone(SITES.blueAirfield); zone(SITES.redAirfield);
    zone(SITES.blueBase); zone(SITES.redBase);
    for (const t of SITES.towns) zone(t, 0.9);
    // Impact craters, kept clear of airfields, bases and towns.
    this.craters = [];
    if (this.T.craters) {
      const rng = new RNG(def.seed + 77);
      for (let tries = 0; this.craters.length < this.T.craters * K && tries < this.T.craters * K * 30; tries++) {
        const x = rng.float(-7500, 7500) * K, z = rng.float(-7500, 7500) * K, r = rng.float(70, 420);
        if (this.zones.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r * 1.6 + r * 1.5)) continue;
        this.craters.push({ x, z, r, depth: r * rng.float(0.12, 0.22), rim: r * rng.float(0.05, 0.1) });
      }
    }
    for (const zn of this.zones) zn.h = Math.max(10, this.baseHeight(zn.x, zn.z, false) * 0.6 + 6);

    this.heights = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) {
      const z = -this.half + j * this.cell;
      for (let i = 0; i < this.n; i++) {
        const x = -this.half + i * this.cell;
        this.heights[j * this.n + i] = this.baseHeight(x, z, true);
      }
    }
    this.carveWater();
  }

  // Signed distance-like value: > 0 on land (metres from the coast), < 0 at sea.
  inland(x, z) {
    const T = this.T, n = this.noise;
    if (T.shape === 'archipelago') {
      const wob = n.fbm(x / 900 + 4, z / 900 - 2, 3) * 350;
      // Central island holds the front, both bases and most towns; every other site gets its own island.
      let land = (1 - Math.hypot(x / 4300, z / 3400)) * 2600 + wob;
      for (const zn of this.zones) land = Math.max(land, (1 - Math.hypot(x - zn.x, z - zn.z) / (zn.r * 1.9)) * 1300 + wob * 0.6);
      // Scattered islets fade into open sea toward the map edge (where the destroyers patrol).
      const fade = 1 - smoothstep(6400 * K, 7400 * K, Math.hypot(x, z));
      const islets = (n.fbm(x / 1700 + 8, z / 1700 + 2, 4) - 0.3) * 5000 * fade - (1 - fade) * 3000;
      return Math.max(land, islets);
    }
    const cs = (T.coastScale || 3200) * K;
    return T.radius * K + n.fbm(x / cs + 11.3, z / cs - 7.1, 3) * T.coastNoise * K - Math.hypot(x, z);
  }

  baseHeight(x, z, useZones) {
    const n = this.noise, T = this.T;

    // Plains around the front line where the tank battle happens.
    const f = SITES.front;
    const fe = Math.hypot((x - f.x) / f.rx, (z - f.z) / f.rz);
    const plain = 1 - smoothstep(0.65, 1.05, fe);

    let h = T.base + n.fbm(x / 2300, z / 2300, 4) * T.hills * (1 - plain * 0.6) + n.fbm(x / 520, z / 520, 3) * 11;

    let zoneMask = 0;
    if (useZones) for (const zn of this.zones) {
      const d = Math.hypot(x - zn.x, z - zn.z);
      zoneMask = Math.max(zoneMask, (1 - smoothstep(zn.r * 0.9, zn.r * 2.2, d)));
    }
    const free = (1 - plain) * (1 - zoneMask); // where big relief is allowed

    if (T.mountains) {
      let mm;
      if (T.shape === 'valley') {
        // Peaks wall in a long north-south valley that holds the whole battlefield.
        const vx = Math.abs(x + n.noise(z / 3000, 7.7) * 700);
        const vz = Math.abs(z + n.noise(x / 3000, 1.3) * 600);
        mm = Math.max(smoothstep(2500, 4400, vx), smoothstep(6900 * K, 8300 * K, vz)) * (0.8 + 0.35 * n.fbm(x / 2600 + 2, z / 2600 - 1, 2));
      } else {
        mm = n.fbm(x / 5400 + 3.7, z / 5400 + 9.2, 2) * 0.9 + 0.15
          + smoothstep(2400, 5600, Math.abs(x + n.noise(z / 4000, 3.3) * 900)) * 0.75 - 0.35 + (T.mountainBias || 0);
      }
      mm = clamp(mm, 0, 1) * free;
      const ridge = n.ridged(x / 2700 + 1.7, z / 2700 - 4.2, 5);
      h += Math.pow(ridge, T.ridgePow || 1.7) * T.mountains * mm;
    }

    if (T.mesas) {
      // Flat-topped, terraced mesas around (never on) the central battle basin.
      const core = Math.hypot(x / 4200, z / 3300);
      const m = smoothstep(0.08, 0.2, n.fbm(x / 1500 + 5.1, z / 1500 - 3.3, 4)) * smoothstep(1.0, 1.35, core) * free;
      h += terrace(m * T.mesas * (0.75 + 0.25 * (n.noise(x / 3800, z / 3800) + 1)), T.terrace || 40);
      if (T.dunes) h += (1 - Math.abs(n.noise(x / 420 + 3, z / 1100))) * T.dunes * (1 - m);
    }

    for (const c of this.craters || []) {
      const dx = x - c.x, dz = z - c.z;
      if (Math.abs(dx) > c.r * 1.8 || Math.abs(dz) > c.r * 1.8) continue;
      const q = Math.hypot(dx, dz) / c.r;
      if (q < 1) h -= c.depth * (1 - q * q);
      h += c.rim * Math.exp(-((q - 1) * (q - 1)) / 0.06);
    }

    if (useZones) for (const zn of this.zones) {
      const d = Math.hypot(x - zn.x, z - zn.z);
      const w = (1 - smoothstep(zn.r * 0.75, zn.r * 1.25, d)) * zn.strength;
      if (w > 0) h = lerp(h, zn.h, w);
    }

    if (!T.lakes) h = Math.max(h, 6 + n.noise(x / 700, z / 700) * 3);
    const inland = this.inland(x, z);
    if (inland >= 0) h = 1.6 + (h - 1.6) * smoothstep(0, T.coastWidth || 1500, inland);
    else h = Math.max(-90, 1.6 + inland * 0.06);
    return h;
  }

  heightAt(x, z) {
    const fx = (x + this.half) / this.cell;
    const fz = (z + this.half) / this.cell;
    if (fx < 0 || fz < 0 || fx >= this.seg || fz >= this.seg) return -90;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const n = this.n, H = this.heights;
    const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
    // Match the mesh triangulation (a, c, b) / (b, c, d).
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }

  // Water surface level of a river or lake at this point (or -Infinity).
  waterLevelAt(x, z) {
    if (!this.levels) return -1e9;
    const i = Math.round((x + this.half) / this.cell), j = Math.round((z + this.half) / this.cell);
    if (i < 0 || j < 0 || i > this.seg || j > this.seg) return -1e9;
    return this.levels[j * this.n + i];
  }

  isWater(x, z) { const h = this.heightAt(x, z); return h < 0 || this.waterLevelAt(x, z) > h; }

  groundAt(x, z) { return Math.max(0, this.heightAt(x, z), this.waterLevelAt(x, z)); } // water surfaces count as ground

  // Rivers that run downhill to the sea (or end in a lake) and small lakes, carved into the heightmap.
  carveWater() {
    const W = this.def.water || {};
    const rng = new RNG(this.seed + 404);
    const n = this.n, H = this.heights, cell = this.cell, half = this.half;
    this.wet = new Uint8Array(n * n);
    this.shore = new Float32Array(n * n);
    this.levels = new Float32Array(n * n).fill(-1e9);
    this.rivers = [];
    this.lakes = [];
    const lim = half - 800;
    const nearZone = (x, z, pad) => this.zones.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r * 1.5 + pad);
    const inZone = (x, z) => this.zones.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r * 1.1);
    const stamp = (x0, z0, x1, z1, fn) => {
      const i0 = Math.max(0, Math.floor((x0 + half) / cell)), i1 = Math.min(n - 1, Math.ceil((x1 + half) / cell));
      const j0 = Math.max(0, Math.floor((z0 + half) / cell)), j1 = Math.min(n - 1, Math.ceil((z1 + half) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * n + i, -half + i * cell, -half + j * cell);
    };

    const addLake = (x, z, r, forcedLevel) => {
      let level = forcedLevel;
      if (level === undefined) {
        level = this.heightAt(x, z);
        for (let a = 0; a < 12; a++) level = Math.min(level, this.heightAt(x + Math.cos(a / 12 * Math.PI * 2) * r * 0.9, z + Math.sin(a / 12 * Math.PI * 2) * r * 0.9));
        level -= 0.6;
        if (level < 2) return false;
      }
      stamp(x - r * 1.7, z - r * 1.7, x + r * 1.7, z + r * 1.7, (k, px, pz) => {
        const dx = px - x, dz = pz - z, d = Math.hypot(dx, dz);
        if (d > r * 1.7 || inZone(px, pz)) return;
        const a = Math.atan2(dz, dx);
        const rr = r * (0.78 + 0.2 * (this.noise.noise(Math.cos(a) * 1.3 + x * 0.001, Math.sin(a) * 1.3 + z * 0.001) * 0.5 + 0.5));
        if (d < rr) {
          H[k] = Math.min(H[k], level - 0.8 - 6 * (1 - (d / rr) ** 2));
          this.wet[k] = 1;
          this.levels[k] = Math.max(this.levels[k], level);
        } else {
          // Raise any lower ground around the shore so the water never floats above it.
          H[k] = Math.max(H[k], lerp(level + 0.4, H[k], smoothstep(r, r * 1.7, d)));
        }
        this.shore[k] = Math.max(this.shore[k], 1 - smoothstep(rr * 0.9, r * 1.15, d));
      });
      this.lakes.push({ x, z, r, level });
      return true;
    };

    // Rivers.
    const riverCount = Math.round((W.rivers ?? 3) * K);
    const starts = [];
    for (let tries = 0; this.rivers.length < riverCount && tries < riverCount * 80; tries++) {
      const x = rng.float(-lim, lim) * 0.85, z = rng.float(-lim, lim) * 0.85;
      const h = this.heightAt(x, z);
      if (h < 90 || h > 900 || this.inland(x, z) < 1500 || nearZone(x, z, 700)) continue;
      if (starts.some((s) => Math.hypot(s.x - x, s.z - z) < 5000)) continue;
      const r = this.traceRiver(x, z, lim);
      if (!r) continue;
      starts.push({ x, z });
      this.rivers.push(r);
      const P = r.pts;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const bk = Math.max(a.w, b.w) * 2.4;
        stamp(Math.min(a.x, b.x) - bk, Math.min(a.z, b.z) - bk, Math.max(a.x, b.x) + bk, Math.max(a.z, b.z) + bk, (k, x, z) => {
          if (inZone(x, z)) return;
          const abx = b.x - a.x, abz = b.z - a.z;
          const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1), 0, 1);
          const d = Math.hypot(x - a.x - abx * t, z - a.z - abz * t);
          const w = a.w + (b.w - a.w) * t, lv = a.level + (b.level - a.level) * t, bank = w * 2.4;
          if (d >= bank) return;
          if (d < w) {
            H[k] = Math.min(H[k], lv - 0.8 - 3.2 * (1 - (d / w) ** 2));
            this.wet[k] = 1;
            this.levels[k] = Math.max(this.levels[k], lv);
          } else {
            H[k] = Math.min(H[k], lerp(lv + 0.5, H[k], smoothstep(w, bank, d)));
          }
          this.shore[k] = Math.max(this.shore[k], 1 - smoothstep(w * 0.8, bank, d));
        });
      }
      if (r.endLake) addLake(P[P.length - 1].x, P[P.length - 1].z, 320, P[P.length - 1].level);
    }

    // Small lakes and ponds on flat ground.
    const lakeCount = Math.round((W.lakes ?? 6) * K);
    let made = 0;
    for (let tries = 0; made < lakeCount && tries < lakeCount * 60; tries++) {
      const x = rng.float(-lim, lim) * 0.85, z = rng.float(-lim, lim) * 0.85;
      const h = this.heightAt(x, z);
      if (h < 12 || h > 700 || this.inland(x, z) < 900 || this.normalAt(x, z).y < 0.97) continue;
      const r = rng.float(140, 380);
      if (nearZone(x, z, 900 + r) || this.lakes.some((l) => Math.hypot(l.x - x, l.z - z) < 2500)) continue;
      if (addLake(x, z, r)) made++;
    }
  }

  // Follow the terrain downhill with gentle meanders until the river reaches the sea or gets trapped.
  traceRiver(x, z, lim) {
    const pts = [];
    const step = 90, e = this.cell;
    let dx = 0, dz = 0, level = this.heightAt(x, z) - 2, climb = 0, endLake = false;
    for (let s = 0; s < 340; s++) {
      const h = this.heightAt(x, z);
      level = Math.min(level - 0.03, h - 2);
      pts.push({ x, z, level });
      if (h < 0.5) break;
      const gx = this.heightAt(x + e, z) - this.heightAt(x - e, z), gz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
      const gl = Math.hypot(gx, gz) || 1;
      const nx = -gx / gl, nz = -gz / gl;
      const mean = this.noise.noise(x / 1100 + 31, z / 1100 - 7) * 0.4;
      let vx = dx * 0.62 + nx * 0.38 - nz * mean, vz = dz * 0.62 + nz * 0.38 + nx * mean;
      for (const zn of this.zones) {
        const ox = x - zn.x, oz = z - zn.z, d = Math.hypot(ox, oz) || 1;
        if (d < zn.r * 2.6) { vx += ox / d * 1.5; vz += oz / d * 1.5; }
      }
      const vl = Math.hypot(vx, vz) || 1;
      dx = vx / vl; dz = vz / vl;
      x += dx * step; z += dz * step;
      if (Math.abs(x) > lim || Math.abs(z) > lim) break;
      if (h - level > 45) { if (++climb > 4) { endLake = true; break; } } else climb = 0;
    }
    if (pts.length < 25) return null;
    pts.forEach((p, i) => { p.w = 38 + 52 * (i / (pts.length - 1)); });
    return { pts, endLake };
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = this.cell * 0.5;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  // True when every point along the segment is open water at least `depth` metres deep.
  isOpenWater(x0, z0, x1, z1, depth = 8) {
    for (let t = 0; t <= 1.0001; t += 0.04) {
      if (this.heightAt(lerp(x0, x1, t), lerp(z0, z1, t)) > -depth) return false;
    }
    return true;
  }

  // March a ray against the terrain/water. Returns distance or -1.
  raycast(origin, dir, maxDist = 8000, step = 25) {
    let prevT = 0;
    if (origin.y - this.groundAt(origin.x, origin.z) <= 0) return 0;
    for (let t = step; t <= maxDist; t += step) {
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      const above = y - this.groundAt(x, z);
      if (above <= 0) {
        let lo = prevT, hi = t;
        for (let k = 0; k < 6; k++) {
          const m = (lo + hi) / 2;
          const a = origin.y + dir.y * m - this.groundAt(origin.x + dir.x * m, origin.z + dir.z * m);
          if (a > 0) lo = m; else hi = m;
        }
        return (lo + hi) / 2;
      }
      prevT = t;
      if (above > 3000 && dir.y >= 0) break;
    }
    return -1;
  }

  buildTerrainMesh() {
    const n = this.n, H = this.heights;
    const pos = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      pos[k * 3] = -this.half + i * this.cell;
      pos[k * 3 + 1] = H[k];
      pos[k * 3 + 2] = -this.half + j * this.cell;
      uv[k * 2] = i / this.seg; uv[k * 2 + 1] = j / this.seg;
    }
    const idx = new Uint32Array(this.seg * this.seg * 6);
    let p = 0;
    for (let j = 0; j < this.seg; j++) for (let i = 0; i < this.seg; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b;
      idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    // Vertex colours from the world's palette: ground, farmland, forest floor, rock, snow, beach, seabed.
    const P = this.def.palette;
    const C = (h) => new THREE.Color(h);
    const sand = C(P.sand), seabed = C(P.seabed), grassA = C(P.grassA), grassB = C(P.grassB), dry = C(P.dry),
      forest = C(P.forest), rock = C(P.rock), rockD = C(P.rockD), snow = C(P.snow);
    const fields = (P.fields || []).map(C);
    const mud = new THREE.Color(P.sand).multiplyScalar(0.62).lerp(new THREE.Color(P.grassB), 0.25);
    const col = new Float32Array(n * n * 3);
    const nrm = geo.attributes.normal.array;
    const tmp = new THREE.Color(), rockTmp = new THREE.Color();
    const nz = this.noise;
    for (let k = 0; k < n * n; k++) {
      const x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2];
      const ny = nrm[k * 3 + 1];
      const v = nz.fbm(x / 900, z / 900, 3) * 0.5 + 0.5;
      tmp.copy(grassA).lerp(grassB, v);
      const dryness = smoothstep(0.2, 0.7, nz.noise(x / 2600 + 5, z / 2600 - 2));
      tmp.lerp(dry, dryness * P.dryAmt);
      if (fields.length && P.fieldAmt > 0) {
        // Patchwork farmland on gentle low ground.
        const farm = smoothstep(0.1, 0.4, nz.noise(x / 1800 - 9, z / 1800 + 4)) * smoothstep(0.985, 0.995, ny) * (1 - smoothstep(90, 160, h));
        if (farm > 0) {
          const cx = Math.floor((x + 9000) / 170), cz = Math.floor((z + 9000) / 130);
          const hsh = Math.abs(Math.sin(cx * 127.1 + cz * 311.7) * 43758.5453) % 1;
          tmp.lerp(fields[Math.floor(hsh * fields.length)], farm * P.fieldAmt);
        }
      }
      const forestMask = smoothstep(0.15, 0.35, this.forestDensity(x, z));
      tmp.lerp(forest, forestMask * 0.8);
      const rockMask = smoothstep(0.86, 0.72, ny) + smoothstep(P.rockLine, P.rockLine + 230, h) * 0.6;
      if (rockMask > 0) tmp.lerp(rockTmp.copy(rock).lerp(rockD, v), clamp(rockMask, 0, 1));
      const ss = P.snowSlope || [0.6, 0.8];
      let snowMask = smoothstep(P.snowLine + v * 120, P.snowLine + 140 + v * 120, h) * smoothstep(ss[0], ss[1], ny);
      // Snowcaps: high peaks stay white even on steep faces.
      if (P.peakSnow) snowMask = Math.max(snowMask, smoothstep(P.snowLine + 250 + v * 150, P.snowLine + 500 + v * 150, h) * P.peakSnow);
      if (snowMask > 0) tmp.lerp(snow, snowMask);
      const beach = 1 - smoothstep(3, P.beach, h);
      tmp.lerp(sand, beach);
      // Muddy, reed-coloured banks along rivers and lakes; their beds take the seabed colour.
      const sh = this.shore ? this.shore[k] : 0;
      if (sh > 0) tmp.lerp(mud, sh * 0.45);
      if (this.wet && this.wet[k]) tmp.copy(mud).lerp(seabed, 0.5);
      if (h < 0) tmp.copy(sand).lerp(seabed, smoothstep(0, -25, h));
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const detail = makeDetailTexture();
    detail.repeat.set(this.size / 38, this.size / 38);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.96, metalness: 0, envMapIntensity: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  // 0..1 tree density used by both the colour pass and tree scattering.
  forestDensity(x, z) {
    const V = this.def.vegetation;
    const h = this.heightAt(x, z);
    if (h < 6 || h > V.treeLine) return 0;
    let d = this.noise.fbm(x / 1400 + 21, z / 1400 - 13, 3) + (V.forest || 0);
    for (const zn of this.zones) {
      if (Math.hypot(x - zn.x, z - zn.z) < zn.r * 1.3) d -= 1;
    }
    const f = SITES.front;
    const fe = Math.hypot((x - f.x) / f.rx, (z - f.z) / f.rz);
    if (fe < 0.75) d -= 0.25;
    return clamp(d, 0, 1);
  }

  buildWater() {
    const W = this.def.water;
    const normal = makeWaterNormals();
    normal.repeat.set(1400, 1400);
    const mat = new THREE.MeshStandardMaterial({
      color: W.color, roughness: W.rough ?? 0.2, metalness: 0.0, normalMap: normal,
      emissive: W.emissive ?? 0x000000, emissiveIntensity: W.glow ?? 0,
      normalScale: new THREE.Vector2(0.28, 0.28), envMapIntensity: 1.0,
      transparent: W.opacity < 1, opacity: W.opacity,
    });
    const geo = new THREE.PlaneGeometry(140000, 140000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'water';
    this.waterNormal = normal;
    return mesh;
  }

  // River ribbons that follow each river's falling water level, and lake surfaces. Shares the sea's
  // animated normal map (UVs in the same world-space scale) so ripples match everywhere.
  buildInlandWater() {
    const W = this.def.water;
    const group = new THREE.Group();
    group.name = 'inland-water';
    if (!this.rivers.length && !this.lakes.length) return group;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(W.color).lerp(new THREE.Color(0x2f4f50), 0.35), roughness: 0.26, metalness: 0,
      normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.09, 0.09), envMapIntensity: 0.7,
      transparent: W.opacity < 1, opacity: Math.max(0.85, W.opacity),
    });
    if (W.emissive) { mat.color.set(W.color); mat.emissive.set(W.emissive); mat.emissiveIntensity = W.glow ?? 1; mat.roughness = W.rough ?? 0.5; } // lava rivers
    const uvOf = (x, z) => [x / 140000 + 0.5, -z / 140000 + 0.5];
    for (const r of this.rivers) {
      const P = r.pts, N = P.length;
      const pos = new Float32Array(N * 6), uv = new Float32Array(N * 4), nrm = new Float32Array(N * 6), idx = [];
      for (let i = 0; i < N; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(N - 1, i + 1)];
        let tx = b.x - a.x, tz = b.z - a.z;
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        for (let s = 0; s < 2; s++) {
          const side = s ? 1 : -1, w = P[i].w * 1.12;
          const x = P[i].x - tz * w * side, z = P[i].z + tx * w * side;
          const o = (i * 2 + s);
          pos[o * 3] = x; pos[o * 3 + 1] = P[i].level + 0.12; pos[o * 3 + 2] = z;
          nrm[o * 3 + 1] = 1;
          [uv[o * 2], uv[o * 2 + 1]] = uvOf(x, z);
        }
        if (i < N - 1) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.name = 'river';
      group.add(mesh);
    }
    for (const l of this.lakes) {
      const geo = new THREE.CircleGeometry(l.r, 48).rotateX(-Math.PI / 2).translate(l.x, l.level + 0.08, l.z);
      const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) { const [u, v] = uvOf(p.getX(i), p.getZ(i)); uv.setXY(i, u, v); }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.name = 'lake';
      group.add(mesh);
    }
    return group;
  }

  update(dt, t) {
    if (this.waterNormal) this.waterNormal.offset.set(t * 0.0045, t * 0.0021);
  }
}

function makeDetailTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  // Tileable value noise: random lattices that wrap at the texture edge.
  let seed = 77;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const layers = [8, 16, 32, 64].map((p) => ({ p, v: Float32Array.from({ length: p * p }, rnd) }));
  const sm = (t) => t * t * (3 - 2 * t);
  const sample = (L, x, y) => {
    const fx = x / s * L.p, fy = y / s * L.p;
    const i = Math.floor(fx), j = Math.floor(fy), tx = sm(fx - i), ty = sm(fy - j);
    const at = (a, b) => L.v[((b % L.p) * L.p) + (a % L.p)];
    const a = at(i, j), b = at(i + 1, j), c2 = at(i, j + 1), d = at(i + 1, j + 1);
    return (a + (b - a) * tx) + ((c2 + (d - c2) * tx) - (a + (b - a) * tx)) * ty;
  };
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const v = sample(layers[0], x, y) * 0.4 + sample(layers[1], x, y) * 0.3 + sample(layers[2], x, y) * 0.2 + sample(layers[3], x, y) * 0.1;
    const k = 168 + v * 90 + (rnd() - 0.5) * 22;
    const i = (y * s + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp(k, 0, 255);
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeWaterNormals() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  const waves = [];
  let seed = 9;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 14; i++) waves.push({ kx: Math.round((rnd() - 0.5) * 16), ky: Math.round((rnd() - 0.5) * 16), a: 0.4 + rnd(), p: rnd() * 6.28 });
  const H = (x, y) => {
    let h = 0;
    for (const w of waves) h += Math.sin((w.kx * x + w.ky * y) * Math.PI * 2 / s + w.p) * w.a / (1 + Math.hypot(w.kx, w.ky) * 0.15);
    return h;
  };
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = H(x + 1, y) - H(x - 1, y), dy = H(x, y + 1) - H(x, y - 1);
    const nx = -dx * 2.2, ny = -dy * 2.2, nzv = 1;
    const l = Math.hypot(nx, ny, nzv);
    const i = (y * s + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (nzv / l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
