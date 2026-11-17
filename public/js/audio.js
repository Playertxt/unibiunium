// Procedural WebAudio: engines, guns, explosions, wind.
import { Settings, clamp } from './config.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.listener = { x: 0, y: 0, z: 0 };
    this.gunClock = new Map();
    this.lastPlay = {};
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    // Separate buses so engine/wind and weapons/explosions have their own volume settings.
    this.engineBus = ctx.createGain();
    this.fxBus = ctx.createGain();
    this.engineBus.connect(this.master);
    this.fxBus.connect(this.master);
    this.applyVolumes();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Player engine: filtered noise roar + tonal whine.
    this.engNoise = this.loopNoise();
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'bandpass'; this.engFilter.frequency.value = 400; this.engFilter.Q.value = 0.7;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engNoise.connect(this.engFilter).connect(this.engGain).connect(this.engineBus);
    this.osc = ctx.createOscillator(); this.osc.type = 'sawtooth'; this.osc.frequency.value = 80;
    this.oscF = ctx.createBiquadFilter(); this.oscF.type = 'lowpass'; this.oscF.frequency.value = 600;
    this.oscGain = ctx.createGain(); this.oscGain.gain.value = 0;
    this.osc.connect(this.oscF).connect(this.oscGain).connect(this.engineBus);
    this.osc.start();
    // Wind.
    this.wind = this.loopNoise();
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.frequency.value = 500;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    this.wind.connect(this.windF).connect(this.windG).connect(this.engineBus);
  }

  loopNoise() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true; s.start(0, Math.random() * 1.5);
    return s;
  }

  applyVolumes() {
    if (!this.master) return;
    const d = Settings.data;
    this.master.gain.value = d.volume;
    this.engineBus.gain.value = d.engineVol;
    this.fxBus.gain.value = d.fxVol;
  }

  setListener(p) { this.listener.x = p.x; this.listener.y = p.y; this.listener.z = p.z; }

  att(pos, range = 3500) {
    if (!pos) return 1;
    const l = this.listener;
    const d = Math.sqrt((pos.x - l.x) ** 2 + (pos.y - l.y) ** 2 + (pos.z - l.z) ** 2);
    const k = clamp(1 - d / range, 0, 1);
    return k * k;
  }

  burst(vol, dur, freq, type = 'lowpass', q = 0.8, sweepTo = null, delay = 0) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.fxBus);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  thump(vol, freq, dur, delay = 0) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.35, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.fxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(name, pos, vol = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.04) return;
    this.lastPlay[name] = now;
    const range = name === 'bomb' || name === 'explosion' ? 6000 : 2500;
    const a = this.att(pos, range) * vol;
    if (a < 0.01) return;
    const l = this.listener;
    const dist = pos ? Math.hypot(pos.x - l.x, pos.y - l.y, pos.z - l.z) : 0;
    const delay = Math.min(dist / 343, 2.5) * 0.6;
    switch (name) {
      case 'explosion': this.burst(1.2 * a, 1.8, 900, 'lowpass', 0.7, 60, delay); this.thump(1.0 * a, 90, 1.2, delay); break;
      case 'bomb': this.burst(1.6 * a, 2.6, 700, 'lowpass', 0.7, 40, delay); this.thump(1.4 * a, 70, 1.8, delay); break;
      case 'cannon': this.burst(0.8 * a, 0.7, 1500, 'lowpass', 0.6, 120, delay); this.thump(0.6 * a, 120, 0.5, delay); break;
      case 'aa': this.burst(0.35 * a, 0.25, 1800, 'bandpass', 1, 400, delay); break;
      case 'rocket': this.burst(0.5 * a, 1.0, 2500, 'bandpass', 0.8, 600, 0); break;
      case 'hit': this.burst(0.5 * vol, 0.12, 3200, 'bandpass', 2, 1200); break;
      case 'warn': this.thump(0.25 * vol, 880, 0.15); break;
      case 'kill': this.thump(0.3 * vol, 660, 0.12); this.thump(0.3 * vol, 990, 0.18, 0.1); break;
      case 'click': this.thump(0.15 * vol, 1200, 0.05); break;
      case 'locking': this.thump(0.1 * vol, 880, 0.06); break;
      case 'lock': this.thump(0.16 * vol, 1320, 0.09); this.thump(0.16 * vol, 1320, 0.09, 0.12); this.thump(0.16 * vol, 1760, 0.25, 0.24); break;
    }
  }

  gun(ac, gdef) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const last = this.gunClock.get(ac.id) || 0;
    const interval = Math.max(0.045, 60 / (gdef.rpm * gdef.mounts.length));
    if (now - last < interval) return;
    this.gunClock.set(ac.id, now);
    const a = ac.isPlayer ? 0.32 : this.att(ac.pos, 2000) * 0.5;
    if (a < 0.01) return;
    const heavy = gdef.dmg >= 10 || gdef.pen >= 2;
    this.burst(a, heavy ? 0.16 : 0.09, heavy ? 900 : 2200, 'lowpass', 0.8, heavy ? 150 : 500);
  }

  update(player, speedFactor) {
    if (!this.ctx || !this.engGain) return;
    const t = this.ctx.currentTime;
    if (!player || !player.alive) {
      this.engGain.gain.setTargetAtTime(0, t, 0.3);
      this.oscGain.gain.setTargetAtTime(0, t, 0.3);
      this.windG.gain.setTargetAtTime(0, t, 0.5);
      return;
    }
    const th = player.throttle;
    const jet = player.def.model !== 'bomber';
    this.engFilter.frequency.setTargetAtTime(jet ? 300 + th * 900 : 160 + th * 260, t, 0.1);
    this.engGain.gain.setTargetAtTime((jet ? 0.12 : 0.1) + th * 0.18 + (th > 1 ? 0.12 : 0), t, 0.1);
    this.osc.type = jet ? 'sawtooth' : 'square';
    this.osc.frequency.setTargetAtTime(jet ? 140 + th * 260 : 38 + th * 28, t, 0.15);
    this.oscF.frequency.setTargetAtTime(jet ? 1400 : 380, t, 0.2);
    this.oscGain.gain.setTargetAtTime(jet ? 0.025 + th * 0.03 : 0.08 + th * 0.05, t, 0.15);
    this.windF.frequency.setTargetAtTime(300 + speedFactor * 1500, t, 0.2);
    this.windG.gain.setTargetAtTime(speedFactor * speedFactor * 0.35, t, 0.2);
  }

  silence() {
    if (!this.ctx || !this.engGain) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(0, t, 0.1);
    this.oscGain.gain.setTargetAtTime(0, t, 0.1);
    this.windG.gain.setTargetAtTime(0, t, 0.1);
  }
}
