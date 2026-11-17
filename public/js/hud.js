// 2D canvas HUD drawn over the 3D view.
import * as THREE from 'three';
import { TEAM_COLORS, Settings, kmh, clamp } from './config.js';

const _v = new THREE.Vector3();
// Same look as the menus: bone white, vermilion ink, wide-spaced Rajdhani, Shippori Mincho Japanese labels.
const BLUE = '#7fb4dd', RED = '#e2574b', AMBER = '#e6cf9a', GREEN = '#a8d39a', CYAN = '#ece6da';
const BONE = '#ece6da', MUTED = '#8f8a82', INK = '#d8402f';
const FONT = "'Rajdhani', sans-serif";
const NUM = "'Share Tech Mono', monospace";
const JP = "'Shippori Mincho', serif";
const GOLD = '#ffcf5a', OWNER = { '-1': '#d8d4cc', 0: BLUE, 1: RED };
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export class HUD {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.hit = 0; this.hitWeak = false;
    this.dmg = 0;
    this.confirms = [];
    this.chatLines = [];
    this.radioLines = [];
    this.combos = [];
    this.rewards = [];
    this.medals = [];
    this.flashK = 0;
    this.killcamK = 0;
    this.streakN = 0; this.streakT = 0;
    this.showScores = false;
    this.scoreEl = document.getElementById('scoreboard');
    this.map = null;
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.c.width = innerWidth * dpr; this.c.height = innerHeight * dpr;
    // Touch layout: instruments move to the top corners (the stick and buttons take the bottom) and the whole
    // HUD is drawn smaller on phone-sized screens. w/h are in HUD units (CSS px divided by the scale).
    this.compact = Settings.touch;
    this.k = this.compact ? clamp(Math.min(innerHeight / 560, innerWidth / 1000), 0.6, 1) : 1;
    this.w = innerWidth / this.k; this.h = innerHeight / this.k;
  }

  setWorld(world) {
    const s = 320, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const img = g.createImageData(s, s);
    const range = world.half + 1500;
    // Colours from the world's own palette so each map reads at a glance.
    const P = world.def.palette;
    const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const sea = rgb(world.def.water.color).map((v) => v * 0.75), sand = rgb(P.sand), low = rgb(P.grassA), high = rgb(P.grassB);
    const rock = rgb(P.rock), snow = rgb(P.snow);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const x = (i / s - 0.5) * range * 2, z = (j / s - 0.5) * range * 2;
      const h = world.heightAt(x, z);
      const k = (j * s + i) * 4;
      let c;
      if (h < 0) c = sea;
      else if (h < 6) c = sand;
      else if (h < P.rockLine) c = mix(low, high, h / P.rockLine);
      else if (h < P.snowLine + 250) c = mix(high, rock, Math.min(1, (h - P.rockLine) / 300));
      else c = mix(rock, snow, Math.min(1, (h - P.snowLine - 250) / 200));
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 210;
    }
    g.putImageData(img, 0, 0);
    this.map = c; this.mapRange = range;
  }

  hitMarker(weak) { this.hit = 0.18; this.hitWeak = weak; }
  damageFlash(a) { this.dmg = Math.min(1, this.dmg + a / 40); }
  killConfirm(text) { this.confirms.push({ text, t: 2.6 }); if (this.confirms.length > 3) this.confirms.shift(); }
  combo(text, jp, sub) { this.combos = [{ text, jp, sub, t: 2.4 }]; }
  reward(title, text) { this.rewards.push({ title, text, t: 4.5 }); if (this.rewards.length > 2) this.rewards.shift(); }
  streak(n) { this.streakN = n; this.streakT = 4; }
  radio(name, text, color) { this.radioLines.push({ name, text, color, t: 7 }); if (this.radioLines.length > 3) this.radioLines.shift(); }
  medal(m) { this.medals.push({ ...m, t: 5 }); }
  lightning(k) { this.flashK = Math.max(this.flashK, k); }
  chat(name, text, team) { this.chatLines.push({ name, text, team, t: 12 }); if (this.chatLines.length > 7) this.chatLines.shift(); }

  proj(cam, v) {
    _v.copy(v).project(cam);
    return { x: (_v.x * 0.5 + 0.5) * this.w, y: (-_v.y * 0.5 + 0.5) * this.h, front: _v.z < 1 && _v.z > -1 };
  }

  clear() { this.g.setTransform(1, 0, 0, 1, 0, 0); this.g.clearRect(0, 0, this.c.width, this.c.height); this.scoreEl.classList.remove('show'); }

  draw(game, dt) {
    const g = this.g;
    if (this.compact !== Settings.touch) this.resize();
    const k = this.dpr * this.k;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    if (!game || game.mode === 'demo') { this.scoreEl.classList.remove('show'); return; }
    const cam = game.camera;
    const p = game.player;
    const W = this.w, H = this.h;
    g.lineWidth = 1.5;
    g.font = `13px ${FONT}`;
    g.textBaseline = 'middle';

    // Cloud whiteout.
    const cd = game.clouds.densityAt(cam.position);
    if (cd > 0) { g.fillStyle = `rgba(225,230,236,${Math.min(0.85, cd * 1.3)})`; g.fillRect(0, 0, W, H); }
    this.drawWeather(game, dt);

    this.drawMarkers(game, cam, p);
    this.drawWaypoints(game, cam, p);

    if (p && p.alive) {
      // Mouse-aim circle.
      const a = this.proj(cam, game.aimPoint);
      if (a.front && game.cam.mode !== 1 && !game.cam.free) { this.circle(a.x, a.y, 10, 'rgba(255,255,255,0.85)'); }
      else if (a.front) this.circle(a.x, a.y, 8, 'rgba(255,255,255,0.6)');
      if (game.input.freeCursor && !game.cam.free) this.drawStick(game);
      // Gun reticle at convergence.
      const n = this.proj(cam, _v.copy(p.pos).addScaledVector(p.fwd, 600));
      if (n.front) {
        g.strokeStyle = BONE; g.beginPath();
        g.arc(n.x, n.y, 4, 0, 7);
        g.moveTo(n.x - 18, n.y); g.lineTo(n.x - 8, n.y); g.moveTo(n.x + 8, n.y); g.lineTo(n.x + 18, n.y);
        g.moveTo(n.x, n.y + 8); g.lineTo(n.x, n.y + 14);
        g.stroke();
      }
      // Lead indicator.
      if (game.lead && game.lockTarget) {
        const l = this.proj(cam, game.lead), t = this.proj(cam, game.lockTarget.pos);
        if (l.front && t.front) {
          g.strokeStyle = 'rgba(216,64,47,0.45)'; g.setLineDash([3, 4]);
          g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(l.x, l.y); g.stroke(); g.setLineDash([]);
          g.strokeStyle = INK; g.lineWidth = 2;
          g.beginPath(); g.arc(l.x, l.y, 9, 0, 7); g.stroke();
          g.beginPath(); g.moveTo(l.x - 3, l.y); g.lineTo(l.x + 3, l.y); g.moveTo(l.x, l.y - 3); g.lineTo(l.x, l.y + 3); g.stroke();
          g.lineWidth = 1.5;
        }
      }
      this.drawLock(game, cam, p);
      // Bomb sight.
      if (game.ccip && p.bombsLeft > 0) {
        const b = this.proj(cam, game.ccip);
        if (b.front) {
          g.strokeStyle = AMBER;
          g.beginPath(); g.arc(b.x, b.y, 14, 0, 7); g.stroke();
          g.beginPath(); g.moveTo(b.x - 22, b.y); g.lineTo(b.x - 14, b.y); g.moveTo(b.x + 14, b.y); g.lineTo(b.x + 22, b.y);
          g.moveTo(b.x, b.y - 22); g.lineTo(b.x, b.y - 14); g.stroke();
          g.fillStyle = AMBER; g.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
          g.textAlign = 'left'; g.fillText(`${Math.round(game.ccip.distanceTo(p.pos))}m`, b.x + 18, b.y + 14);
        }
      }
      this.drawFlightData(game, p);
      this.drawWarnings(game, p);
    }

    // Hit marker.
    if (this.hit > 0) {
      this.hit -= dt;
      g.strokeStyle = this.hitWeak ? 'rgba(200,200,200,0.9)' : '#ffffff'; g.lineWidth = 2;
      const cx = W / 2, cy = H / 2, s = 12;
      g.beginPath();
      g.moveTo(cx - s, cy - s); g.lineTo(cx - 5, cy - 5); g.moveTo(cx + s, cy - s); g.lineTo(cx + 5, cy - 5);
      g.moveTo(cx - s, cy + s); g.lineTo(cx - 5, cy + 5); g.moveTo(cx + s, cy + s); g.lineTo(cx + 5, cy + 5);
      g.stroke(); g.lineWidth = 1.5;
    }
    // Damage vignette.
    if (this.dmg > 0) {
      this.dmg = Math.max(0, this.dmg - dt * 0.8);
      const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, `rgba(200,0,0,${this.dmg * 0.55})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }

    const ty = this.drawTop(game);
    this.drawEvent(game, ty);
    if (Settings.data.killfeed) this.drawFeed(game, dt);
    if (Settings.data.minimap) this.drawMinimap(game);
    this.drawCenter(game, dt);
    this.drawCallouts(game, dt);
    this.drawRadio(dt);
    this.drawChat(dt);
    this.drawKillcam();
    this.drawScoreboard(game);
  }

  // ---------- weather, kill-cam ----------
  drawWeather(game, dt) {
    const g = this.g, W = this.w, H = this.h, wx = game.weather;
    if (wx && wx.level > 0.05) {
      const L = wx.level;
      const tint = { sand: [194, 154, 99, 0.22], blizzard: [236, 241, 247, 0.2], eruption: [70, 30, 18, 0.12], storm: [30, 36, 44, 0.12] }[wx.kind];
      if (tint) { g.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${tint[3] * L})`; g.fillRect(0, 0, W, H); }
    }
    if (this.flashK > 0) {
      g.fillStyle = `rgba(235,242,255,${this.flashK * 0.45})`; g.fillRect(0, 0, W, H);
      this.flashK = Math.max(0, this.flashK - dt * 3.5);
    }
  }

  drawKillcam() {
    const k = this.killcamK;
    if (!k) return;
    const g = this.g, W = this.w, H = this.h, bar = H * 0.1 * k;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, bar); g.fillRect(0, H - bar, W, bar);
    g.globalAlpha = k;
    g.textAlign = 'left'; g.font = `800 18px ${JP}`; g.fillStyle = INK; g.fillText('撃墜映像', 28, H - bar / 2);
    g.font = `600 13px ${FONT}`; g.fillStyle = BONE; g.fillText(this.spaced('KILL CAM'), 120, H - bar / 2 + 1);
    g.globalAlpha = 1;
  }

  // ---------- waypoints (rescue, events, conquest, airstrike) ----------
  // A diamond with a label and distance; off screen it becomes an edge arrow.
  waypoint(cam, pos, label, color, d, arrow = true) {
    const g = this.g, W = this.w, H = this.h;
    const s = this.proj(cam, pos);
    const dist = d < 1000 ? `${Math.round(d)}m` : `${(d / 1000).toFixed(1)}km`;
    if (s.front && s.x > 0 && s.x < W && s.y > 0 && s.y < H) {
      g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2;
      g.beginPath(); g.moveTo(s.x, s.y - 9); g.lineTo(s.x + 9, s.y); g.lineTo(s.x, s.y + 9); g.lineTo(s.x - 9, s.y); g.closePath(); g.stroke();
      g.lineWidth = 1.5;
      g.textAlign = 'center'; g.font = `700 12px ${FONT}`; g.fillText(label, s.x, s.y - 18);
      g.font = `11px ${NUM}`; g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText(dist, s.x, s.y + 22);
    } else if (arrow) {
      let dx = s.x - W / 2, dy = s.y - H / 2;
      if (!s.front) { dx = -dx; dy = -dy; }
      const ang = Math.atan2(dy, dx);
      const rx = W / 2 - 60, ry = H / 2 - 60;
      const k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-3), ry / Math.abs(Math.sin(ang) || 1e-3));
      const ex = W / 2 + Math.cos(ang) * k, ey = H / 2 + Math.sin(ang) * k;
      g.save(); g.translate(ex, ey); g.rotate(ang);
      g.fillStyle = color; g.beginPath(); g.moveTo(12, 0); g.lineTo(-6, -8); g.lineTo(-6, 8); g.closePath(); g.fill();
      g.restore();
      g.fillStyle = color; g.textAlign = 'center'; g.font = `700 11px ${FONT}`;
      g.fillText(`${label} ${dist}`, ex - Math.cos(ang) * 30, ey - Math.sin(ang) * 22);
    }
  }

  drawWaypoints(game, cam, p) {
    const me = p ? p.pos : cam.position;
    for (const u of game.groundUnits) {
      if (!u.alive) continue;
      if (u.rescue) this.waypoint(cam, _v.copy(u.pos).setY(u.pos.y + 6), 'DOWNED PILOT', GREEN, u.pos.distanceTo(me));
    }
    const cq = game.conquest;
    if (cq) for (const pt of cq.points) {
      const d = Math.hypot(pt.x - me.x, pt.z - me.z);
      const own = pt.owner === game.playerTeam ? BLUE : pt.owner === -1 ? OWNER[-1] : RED;
      this.waypoint(cam, _v.set(pt.x, pt.y + 40, pt.z), `${pt.id}${pt.contested ? ' ⚔' : ''}`, own, d, pt.owner !== game.playerTeam);
    }
    if (game.strikeMark && game.time < game.strikeMark.until) {
      const sm = game.strikeMark.pos;
      const s = this.proj(cam, sm);
      if (s.front) {
        const g = this.g, r = 18 + Math.sin(game.time * 10) * 4;
        g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.arc(s.x, s.y, r, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(s.x - r - 8, s.y); g.lineTo(s.x + r + 8, s.y); g.moveTo(s.x, s.y - r - 8); g.lineTo(s.x, s.y + r + 8); g.stroke(); g.lineWidth = 1.5;
        g.fillStyle = INK; g.textAlign = 'center'; g.font = `700 12px ${FONT}`; g.fillText('AIRSTRIKE', s.x, s.y - r - 14);
      }
    }
    const es = game.escort;
    if (es && es.target && es.target.alive) {
      const mine = es.vipTeam === game.playerTeam;
      this.waypoint(cam, _v.copy(es.target.hitCenter).setY(es.target.hitCenter.y + 30), mine ? 'BOMB TARGET' : 'DEFEND HQ', mine ? INK : BLUE, es.target.pos.distanceTo(me));
    }
  }

  // ---------- event banner, top strips ----------
  drawEvent(game, y) {
    const g = this.g, W = this.w;
    const cq = game.conquest;
    if (cq) {
      const n = cq.points.length, bw = 44, gap = 8, x0 = W / 2 - (n * (bw + gap) - gap) / 2;
      cq.points.forEach((pt, i) => {
        const x = x0 + i * (bw + gap);
        const col = OWNER[pt.owner];
        g.fillStyle = 'rgba(6,6,8,0.6)'; g.fillRect(x, y, bw, 30);
        g.fillStyle = col; g.globalAlpha = pt.owner === -1 ? 0.25 : 0.55; g.fillRect(x, y, bw, 30); g.globalAlpha = 1;
        const pr = pt.prog;
        g.fillStyle = pr >= 0 ? BLUE : RED; g.fillRect(x, y + 27, bw * Math.abs(pr), 3);
        g.font = `700 16px ${NUM}`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(pt.id, x + bw / 2, y + 14);
        if (pt.contested && Math.floor(game.time * 4) % 2) { g.strokeStyle = AMBER; g.strokeRect(x, y, bw, 30); }
      });
      const p = game.player;
      if (p && p.alive) {
        const here = cq.points.find((pt) => Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z) < 150);
        if (here && here.owner !== p.team) {
          g.font = `600 13px ${FONT}`; g.fillStyle = p.landed ? GREEN : AMBER; g.textAlign = 'center';
          g.fillText(p.landed ? `CAPTURING ${here.name.toUpperCase()}…` : `${here.name.toUpperCase()}: HOVER (H) AND LAND TO CAPTURE`, W / 2, y + 46);
        }
      }
      y += 54;
    }
    const ev = game.event;
    if (!ev) return;
    const left = Math.max(0, ev.end - game.time);
    const title = `${ev.title}  ${fmt(left)}`;
    g.font = `700 15px ${FONT}`;
    const tw = Math.max(g.measureText(title).width, 160) + 90;
    const x = W / 2 - tw / 2;
    g.fillStyle = 'rgba(6,6,8,0.62)'; g.fillRect(x, y, tw, ev.sub ? 46 : 28);
    g.fillStyle = ev.color || AMBER; g.fillRect(x, y, 3, ev.sub ? 46 : 28);
    g.textAlign = 'left'; g.font = `800 13px ${JP}`; g.fillText(ev.jp || '事態', x + 12, y + 14);
    g.font = `700 15px ${FONT}`; if ('letterSpacing' in g) g.letterSpacing = '1px';
    g.fillText(title, x + 80, y + 14); if ('letterSpacing' in g) g.letterSpacing = '0px';
    if (ev.sub) { g.font = `600 12px ${FONT}`; g.fillStyle = BONE; g.fillText(ev.sub, x + 80, y + 34); }
    if (ev.progress > 0) { g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x + 80, y + 42, tw - 100, 3); g.fillStyle = GREEN; g.fillRect(x + 80, y + 42, (tw - 100) * Math.min(1, ev.progress), 3); }
  }

  // ---------- combos, streaks, rewards, medals ----------
  drawCallouts(game, dt) {
    const g = this.g, W = this.w, H = this.h;
    g.textAlign = 'center';
    for (const c of this.combos) {
      c.t -= dt;
      const age = 2.4 - c.t, pop = 1 + Math.max(0, 0.35 - age) * 1.4;
      g.globalAlpha = clamp(c.t / 0.5, 0, 1);
      g.save(); g.translate(W / 2, H * 0.36); g.scale(pop, pop);
      g.font = `800 15px ${JP}`; g.fillStyle = INK; g.fillText(c.jp, 0, -26);
      g.font = `700 34px ${FONT}`; if ('letterSpacing' in g) g.letterSpacing = '4px';
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(c.text, 2, 2); g.fillStyle = '#fff'; g.fillText(c.text, 0, 0);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      g.font = `18px ${NUM}`; g.fillStyle = AMBER; g.fillText(c.sub, 0, 28);
      g.restore();
    }
    g.globalAlpha = 1;
    this.combos = this.combos.filter((c) => c.t > 0);
    let y = H * 0.36 + 64;
    for (const r of this.rewards) {
      r.t -= dt;
      g.globalAlpha = clamp(r.t, 0, 1);
      g.font = `700 14px ${FONT}`; g.fillStyle = GREEN; g.fillText(`連続  ${r.title}`, W / 2, y);
      g.font = `600 15px ${FONT}`; g.fillStyle = BONE; g.fillText(r.text, W / 2, y + 20);
      y += 46;
    }
    g.globalAlpha = 1;
    this.rewards = this.rewards.filter((r) => r.t > 0);
    // Medal toast (one at a time).
    const m = this.medals[0];
    if (m) {
      m.t -= dt;
      const a = clamp(m.t, 0, 1) * clamp((5 - m.t) * 4, 0, 1);
      g.globalAlpha = a;
      const my = this.compact ? 60 : 118, mw = 420;
      g.fillStyle = 'rgba(12,10,6,0.78)'; g.fillRect(W / 2 - mw / 2, my, mw, 50);
      g.fillStyle = GOLD; g.fillRect(W / 2 - mw / 2, my, mw, 2);
      g.beginPath(); g.arc(W / 2 - mw / 2 + 28, my + 25, 15, 0, 7); g.fill();
      g.fillStyle = '#2a1f08'; g.font = `800 14px ${JP}`; g.fillText('勲', W / 2 - mw / 2 + 28, my + 26);
      g.textAlign = 'left'; g.fillStyle = GOLD; g.font = `700 12px ${FONT}`; g.fillText(this.spaced(`MEDAL UNLOCKED · ${m.jp}`), W / 2 - mw / 2 + 54, my + 15);
      g.font = `700 16px ${FONT}`; g.fillStyle = '#fff'; g.fillText(m.name, W / 2 - mw / 2 + 54, my + 32);
      g.font = `500 11px ${FONT}`; g.fillStyle = MUTED; g.fillText(m.desc.length > 62 ? `${m.desc.slice(0, 60)}…` : m.desc, W / 2 - mw / 2 + 54, my + 44);
      g.globalAlpha = 1; g.textAlign = 'center';
      if (m.t <= 0) this.medals.shift();
    }
  }

  drawRadio(dt) {
    const g = this.g;
    const lines = this.radioLines.filter((l) => l.t > 0);
    this.radioLines = lines;
    if (!lines.length) return;
    const x = 16, w = Math.min(380, this.w * 0.42);
    let y = this.compact ? 340 : this.h * 0.2;
    g.textAlign = 'left';
    for (const l of lines) {
      l.t -= dt;
      g.globalAlpha = clamp(l.t, 0, 1);
      g.font = `600 13px ${FONT}`;
      const words = l.text.split(' '); const rows = []; let cur = '';
      for (const wd of words) { const t = cur ? `${cur} ${wd}` : wd; if (g.measureText(t).width > w - 24 && cur) { rows.push(cur); cur = wd; } else cur = t; }
      if (cur) rows.push(cur);
      const h = 22 + rows.length * 16;
      g.fillStyle = 'rgba(6,6,8,0.6)'; g.fillRect(x, y, w, h);
      g.fillStyle = l.color; g.fillRect(x, y, 3, h);
      g.font = `700 11px ${JP}`; g.fillText('無線', x + 10, y + 11);
      g.font = `700 12px ${FONT}`; g.fillText(l.name, x + 42, y + 11);
      g.font = `600 13px ${FONT}`; g.fillStyle = BONE;
      rows.forEach((r, i) => g.fillText(r, x + 10, y + 28 + i * 16));
      y += h + 6;
    }
    g.globalAlpha = 1;
  }

  // Instrument panel in the loading-screen strip style: bone edge on the left, fading highlight.
  panel(x, y, w, h, right = false) {
    const g = this.g;
    g.fillStyle = 'rgba(6,6,8,0.5)'; g.fillRect(x, y, w, h);
    const gr = g.createLinearGradient(right ? x + w : x, 0, right ? x : x + w, 0);
    gr.addColorStop(0, 'rgba(230,226,216,0.14)'); gr.addColorStop(1, 'rgba(230,226,216,0)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = BONE; g.fillRect(right ? x + w - 3 : x, y, 3, h);
  }

  // Japanese label with a small spaced English tag after it.
  label(jp, en, x, y) {
    const g = this.g;
    g.font = `700 13px ${JP}`; g.fillStyle = BONE; g.fillText(jp, x, y);
    const w = g.measureText(jp).width;
    g.font = `600 10px ${FONT}`; g.fillStyle = MUTED; g.fillText(this.spaced(en), x + w + 5, y + 1);
  }

  spaced(t) { return t.split('').join('\u200a'); }

  circle(x, y, r, color) { const g = this.g; g.strokeStyle = color; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); }

  // Free-cursor steering guide: the dead-zone ring at the centre and a line out to the cursor.
  drawStick(game) {
    const g = this.g, m = game.input.mouse;
    const cx = this.w / 2, cy = this.h / 2, dead = Math.min(this.w, this.h) / 2 * game.input.deadZone;
    g.strokeStyle = m.armed ? 'rgba(255,255,255,0.35)' : AMBER;
    g.setLineDash([4, 4]);
    g.beginPath(); g.arc(cx, cy, dead, 0, 7); g.stroke();
    g.setLineDash([]);
    if (!m.inside) return;
    if (!m.armed) {
      g.textAlign = 'center'; g.font = `600 16px ${FONT}`;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillText('Move the cursor into the centre circle to take control', cx + 1, cy + dead + 27);
      g.fillStyle = BONE; g.fillText('Move the cursor into the centre circle to take control', cx, cy + dead + 26);
      return;
    }
    const dx = m.x - cx, dy = m.y - cy, d = Math.hypot(dx, dy);
    if (d <= dead) return;
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.beginPath(); g.moveTo(cx + dx / d * dead, cy + dy / d * dead); g.lineTo(m.x, m.y); g.stroke();
  }

  drawMarkers(game, cam, p) {
    const g = this.g, W = this.w, H = this.h;
    const me = p || { team: game.playerTeam, pos: cam.position };
    const jam = game.radarJam > 0;
    const vis = Math.max(0.3, game.visibility ?? 1);
    g.textAlign = 'center';
    for (const e of game.aircraft) {
      if (e === p || !e.alive) continue;
      const enemy = e.team !== me.team;
      const d = e.pos.distanceTo(cam.position);
      if (d > (enemy ? 7000 : 3500) * (e.vip || e.aceId ? Math.max(vis, 0.6) : vis)) continue;
      if (enemy && jam && d > 400) continue;
      if (enemy && d > 800 && game.inCloud(e)) continue;
      const s = this.proj(cam, e.pos);
      const col = e.aceId && enemy ? GOLD : e.vip ? (enemy ? '#ff9a5a' : '#9fd8ff') : enemy ? RED : BLUE;
      if (s.front && s.x > 0 && s.x < W && s.y > 0 && s.y < H) {
        const y = s.y - 16 - Math.min(20, 2000 / Math.max(d, 50));
        g.fillStyle = col;
        g.beginPath(); g.moveTo(s.x - 6, y - 8); g.lineTo(s.x + 6, y - 8); g.lineTo(s.x, y); g.closePath(); g.fill();
        g.font = `600 12px ${FONT}`;
        if (Settings.data.names && (d < 2500 || e === game.lockTarget || e.aceId || e.vip)) g.fillText(e.aceId && enemy ? `ACE ${e.name}` : e.vip ? `VIP ${e.name}` : `${e.name}`, s.x, y - 18);
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillText(d < 1000 ? `${Math.round(d)}m` : `${(d / 1000).toFixed(1)}km`, s.x, y - 30 + (d < 2500 ? 0 : 12));
        if (e === game.lockTarget) { g.strokeStyle = col; g.strokeRect(s.x - 16, s.y - 16, 32, 32); }
      } else if (enemy && d < 2500 && p) {
        // Edge arrow.
        let dx = s.x - W / 2, dy = s.y - H / 2;
        if (!s.front) { dx = -dx; dy = -dy; }
        const ang = Math.atan2(dy, dx);
        const rx = W / 2 - 40, ry = H / 2 - 40;
        const k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-3), ry / Math.abs(Math.sin(ang) || 1e-3));
        const ex = W / 2 + Math.cos(ang) * k, ey = H / 2 + Math.sin(ang) * k;
        g.save(); g.translate(ex, ey); g.rotate(ang);
        g.fillStyle = RED; g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, -7); g.lineTo(-6, 7); g.closePath(); g.fill();
        g.restore();
      }
    }
    for (const u of game.groundUnits) {
      if (!u.alive || u.def.passive) continue;
      const enemy = u.team !== me.team;
      const d = u.pos.distanceTo(cam.position);
      if (d > (u.objective ? 9000 : 4500) * vis || (!enemy && d > 2500)) continue;
      if (enemy && jam) continue;
      const s = this.proj(cam, u.hitCenter);
      if (!s.front || s.x < 0 || s.x > W || s.y < 0 || s.y > H) continue;
      const uc = enemy ? (u.eventTarget ? AMBER : RED) : BLUE;
      g.strokeStyle = uc;
      g.fillStyle = uc;
      const sz = u.objective ? 6 : 4;
      if (u.objective) { g.beginPath(); g.moveTo(s.x, s.y - sz - 6); g.lineTo(s.x + sz, s.y - 6); g.lineTo(s.x, s.y + sz - 6); g.lineTo(s.x - sz, s.y - 6); g.closePath(); g.stroke(); }
      else g.strokeRect(s.x - sz, s.y - sz - 6, sz * 2, sz * 2);
      if (enemy && d < 2200 && Settings.data.names) { g.font = `11px ${FONT}`; g.fillText(u.def.name, s.x, s.y - 22); }
    }
  }

  drawFlightData(game, p) {
    const g = this.g, H = this.h, W = this.w;
    const alt = Math.round(p.pos.y);
    const radar = Math.round(p.pos.y - game.world.groundAt(p.pos.x, p.pos.z));
    const x = 28, y = this.compact ? 110 : H - 150;
    this.panel(x - 14, y - 22, 200, 136);
    g.textAlign = 'left';
    this.label('速度', 'SPD', x, y - 8); this.label('高度', 'ALT', x, y + 22); this.label('推力', 'THR', x, y + 52); this.label('荷重', 'G', x, y + 82);
    g.font = `20px ${NUM}`; g.fillStyle = '#ffffff';
    const spd = `${kmh(p.speed)}`;
    g.fillText(spd, x + 72, y - 6);
    const sw = g.measureText(spd).width;
    g.font = `600 11px ${FONT}`; g.fillStyle = MUTED; g.fillText('KM/H', x + 72 + sw + 6, y - 4);
    g.font = `20px ${NUM}`; g.fillStyle = '#ffffff';
    g.font = `20px ${NUM}`; g.fillStyle = '#ffffff'; g.fillText(`${alt}`, x + 72, y + 24);
    g.font = `11px ${NUM}`; g.fillStyle = MUTED; g.fillText(`R ${radar}m`, x + 130, y + 26);
    const th = p.throttle;
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 72, y + 50, 100, 3);
    g.fillStyle = th > 1 ? INK : BONE; g.fillRect(x + 72, y + 50, Math.min(100, th / p.maxThrottle * 100), 3);
    g.font = `600 12px ${FONT}`; g.fillStyle = th > 1 ? INK : '#ffffff';
    g.fillText(th > 1 ? this.spaced('AFTERBURNER') : `${Math.round(th * 100)}%`, x + 72, y + 63);
    g.font = `18px ${NUM}`; g.fillStyle = Math.abs(p.gForce) > 7 ? INK : '#ffffff';
    g.fillText(p.gForce.toFixed(1), x + 72, y + 84);

    // Boost meter and flight-mode flags.
    const by = y - 52;
    this.panel(x - 14, by - 16, 200, 28);
    this.label('加速', 'BST', x, by - 2);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 72, by - 3, 100, 3);
    g.fillStyle = p.boosting ? '#ffffff' : p.boost < 0.25 ? INK : BONE; g.fillRect(x + 72, by - 3, 100 * p.boost, 3);
    const flags = [];
    if (p.hover) flags.push('浮遊 HOVER');
    if (p.airbrake) flags.push('制動 BRAKE');
    if (p.boosting) flags.push('加速 BOOST');
    if (p.maneuver) flags.push({ roll: '横転 ROLL', uturn: '反転 U-TURN', cobra: 'コブラ COBRA' }[p.maneuver.type]);
    if (p.god) flags.push('不死 INVULN');
    if (game.weather && game.weather.active) flags.push(`${game.weather.jp} ${game.weather.name.toUpperCase()}`);
    if (flags.length) { g.font = `700 12px ${JP}`; g.fillStyle = INK; g.fillText(flags.join('  ·  '), x - 11, by - 28); }

    // Weapons & damage (right side, mirrored panel).
    const rx = W - 214, ry = this.compact ? 110 : H - 150;
    this.panel(rx - 14, ry - 22, 200, 136, true);
    this.label('機体', 'HULL', rx, ry - 4);
    const hp = clamp(p.hp / p.maxHp, 0, 1);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(rx + 72, ry - 5, 96, 3);
    g.fillStyle = hp > 0.6 ? BONE : hp > 0.3 ? AMBER : INK; g.fillRect(rx + 72, ry - 5, 96 * hp, 3);
    const rows = [['機関砲', 'GUNS', p.ammo]];
    if (p.def.rockets) rows.push(['噴進弾', 'RKT', p.rocketsLeft]);
    if (p.def.bombs) rows.push(['爆弾', 'BOMB', p.bombsLeft]);
    rows.forEach(([jp, en, n], i) => {
      const yy = ry + 22 + i * 22;
      this.label(jp, en, rx, yy);
      g.font = `17px ${NUM}`; g.fillStyle = n === 0 ? INK : '#ffffff'; g.textAlign = 'right'; g.fillText(String(n), rx + 168, yy); g.textAlign = 'left';
    });
    // Countermeasures, overcharge and kill streak above the weapons panel.
    g.font = `600 11px ${FONT}`; g.fillStyle = p.flares ? BONE : INK; g.textAlign = 'left';
    g.fillText(`${this.spaced('FLR')} ${p.flares}   ${this.spaced('CHF')} ${p.chaff}`, rx - 11, ry - 34);
    if (p.overcharge > 0) {
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(rx + 100, ry - 37, 72, 3);
      g.fillStyle = '#6af2ff'; g.fillRect(rx + 100, ry - 37, 72 * p.overcharge / 12, 3);
      g.font = `700 11px ${FONT}`; g.fillText('OVERCHARGE', rx + 100, ry - 46);
    }
    if (game.streaks && game.streaks.streak >= 2) {
      g.font = `700 12px ${JP}`; g.fillStyle = AMBER; g.textAlign = 'right';
      g.fillText(`連続 ${game.streaks.streak}`, rx + 182, ry - 34); g.textAlign = 'left';
    }
    const status = [];
    if (p.onFire) status.push(['火災 FIRE', INK]);
    if (p.engineHealth < 0.95) status.push(['発動機 ENGINE', AMBER]);
    if (p.wingDamage > 0.05) status.push(['主翼 WING', AMBER]);
    let sx = rx;
    g.font = `700 11px ${JP}`;
    for (const [st, c] of status) { g.fillStyle = c; g.fillText(st, sx, ry + 98); sx += g.measureText(st).width + 12; }
  }

  // Auto-lock radar: closing brackets while acquiring, a solid diamond and LOCK tag once locked.
  drawLock(game, cam, p) {
    const L = p.def.lock, s = game.lock;
    if (!L || !s || !s.target) return;
    const t = this.proj(cam, s.target.hitCenter);
    if (!t.front) return;
    const g = this.g;
    const k = s.locked ? 1 : clamp(s.t / L.time, 0, 1);
    const r = s.locked ? 15 : 44 - 28 * k;
    g.save();
    g.lineWidth = s.locked ? 2.5 : 1.5;
    g.strokeStyle = s.locked ? INK : `rgba(255,255,255,${0.45 + 0.45 * k})`;
    g.beginPath();
    g.moveTo(t.x, t.y - r); g.lineTo(t.x + r, t.y); g.lineTo(t.x, t.y + r); g.lineTo(t.x - r, t.y); g.closePath();
    g.stroke();
    g.font = `700 11px ${FONT}`; g.textAlign = 'center';
    g.fillStyle = s.locked ? INK : 'rgba(255,255,255,0.8)';
    const d = s.target.hitCenter.distanceTo(p.pos);
    g.fillText(s.locked ? `LOCK  ${d < 1000 ? Math.round(d) + 'm' : (d / 1000).toFixed(1) + 'km'}` : 'LOCKING', t.x, t.y + r + 14);
    g.restore();
  }

  drawWarnings(game, p) {
    const g = this.g, W = this.w, H = this.h;
    g.textAlign = 'center';
    const blink = Math.floor(game.time * 4) % 2 === 0;
    let y = H / 2 + 120;
    const radar = p.pos.y - game.world.groundAt(p.pos.x, p.pos.z);
    const warn = (jp, en, color) => {
      g.font = `800 22px ${JP}`; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(jp, W / 2 + 1, y + 1);
      g.fillStyle = color; g.fillText(jp, W / 2, y);
      g.font = `600 12px ${FONT}`; g.fillText(this.spaced(en), W / 2, y + 18);
      y += 44;
    };
    // Missile threats: banner, plus a red ring (on screen) or edge arrow (off screen) for each missile.
    const thr = game.threats || [];
    if (thr.length) {
      const fast = Math.floor(game.time * 8) % 2 === 0;
      if (fast) warn('ミサイル警報', `MISSILE${thr.length > 1 ? ` ×${thr.length}` : ''} · ${thr.some((m) => m.seeker === 'ir') ? 'FLARES' : 'CHAFF'} (${thr.some((m) => m.seeker === 'ir') ? 'N' : 'M'}) · BREAK TURN`, INK);
      else y += 44;
      for (const m of thr) this.waypoint(game.camera, m.pos, 'MSL', INK, m.pos.distanceTo(p.pos));
    } else if (game.samWarn > 0.05) warn('照準警報', game.samWarn > 0.6 ? 'SAM LOCK · FLY BELOW 70 M OR CHAFF (M)' : 'SAM RADAR TRACKING', game.samWarn > 0.6 ? INK : AMBER);
    if (game.radarJam > 0) warn('電波障害', 'RADAR INTERFERENCE', AMBER);
    if (game.outsideZone && blink) warn('安全圏外', `OUTSIDE SAFE ZONE · RETURN NOW`, INK);
    if (p.speed < p.def.stallSpeed * 1.12 && blink) warn('失速', 'STALL', INK);
    if (radar < 150 && p.vel.y < -25 && blink) warn('機首上げ', 'PULL UP', INK);
    if (game.outOfBounds > 0) warn(`戦域へ戻れ  ${Math.max(0, 10 - game.outOfBounds).toFixed(0)}`, 'RETURN TO BATTLE AREA', AMBER);
    if (p.ammo === 0 && blink) warn('弾切れ', 'OUT OF AMMO — PRESS J TO REARM', AMBER);
  }

  drawTop(game) {
    const g = this.g, W = this.w;
    g.textAlign = 'center';
    const showTeams = game.mode !== 'campaign' && game.mode !== 'free' && !game.ffa;
    if (showTeams) {
      const cx = W / 2;
      g.fillStyle = 'rgba(6,6,8,0.55)'; g.fillRect(cx - 170, 10, 340, 44);
      g.fillStyle = BONE; g.fillRect(cx - 170, 10, 340, 1);
      g.font = `700 13px ${JP}`; g.fillStyle = BLUE; g.fillText('青', cx - 150, 32); g.fillStyle = RED; g.fillText('赤', cx + 150, 32);
      g.font = `24px ${NUM}`;
      g.fillStyle = BLUE; g.fillText(String(game.teamScore[0]), cx - 95, 32);
      g.fillStyle = RED; g.fillText(String(game.teamScore[1]), cx + 95, 32);
      if (game.scoreLimit) {
        const w = 120;
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(cx - 150, 48, w, 3); g.fillRect(cx + 30, 48, w, 3);
        g.fillStyle = BLUE; g.fillRect(cx - 30 - w * Math.min(1, game.teamScore[0] / game.scoreLimit), 48, w * Math.min(1, game.teamScore[0] / game.scoreLimit), 3);
        g.fillStyle = RED; g.fillRect(cx + 30, 48, w * Math.min(1, game.teamScore[1] / game.scoreLimit), 3);
      }
      g.font = `16px ${NUM}`; g.fillStyle = '#ffffff';
      const t = game.timeLimit ? Math.max(0, game.timeLimit - game.time) : game.time;
      g.fillText(`${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, cx, 32);
    } else if (game.ffa) {
      const me = game.scores.get(game.playerId);
      g.fillStyle = 'rgba(6,6,8,0.55)'; g.fillRect(W / 2 - 140, 10, 280, 40);
      g.fillStyle = BONE; g.fillRect(W / 2 - 140, 10, 280, 1);
      g.font = `18px ${NUM}`; g.fillStyle = '#ffffff';
      const t = game.timeLimit ? Math.max(0, game.timeLimit - game.time) : game.time;
      g.fillText(`SCORE ${me ? me.score : 0}   ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, W / 2, 30);
    }
    if (game.objectiveText) {
      g.font = `600 14px ${FONT}`;
      const txt = game.objectiveText();
      const tw = g.measureText(txt).width * 1.08 + 70, ty = showTeams ? 60 : 12;
      g.fillStyle = 'rgba(6,6,8,0.55)'; g.fillRect(W / 2 - tw / 2, ty, tw, 28);
      g.fillStyle = BONE; g.fillRect(W / 2 - tw / 2, ty, 3, 28);
      g.textAlign = 'left'; g.font = `700 13px ${JP}`; g.fillStyle = INK; g.fillText('任務', W / 2 - tw / 2 + 12, ty + 14);
      g.font = `600 14px ${FONT}`; g.fillStyle = BONE; if ('letterSpacing' in g) g.letterSpacing = '1px';
      g.fillText(txt, W / 2 - tw / 2 + 52, ty + 14); if ('letterSpacing' in g) g.letterSpacing = '0px'; g.textAlign = 'center';
    }
    if (game.lives !== Infinity && game.mode === 'campaign') {
      g.textAlign = 'left';
      this.label('残機', 'AIRCRAFT', 16, 24);
      g.font = `14px ${FONT}`; g.fillStyle = BONE; g.fillText('✈ '.repeat(Math.max(0, game.lives)), 100, 24);
    }
    return game.objectiveText ? (showTeams ? 96 : 48) : showTeams ? 62 : game.ffa ? 58 : 14;
  }

  drawFeed(game) {
    const g = this.g, W = this.w;
    g.font = `600 13px ${FONT}`;
    g.textAlign = 'right';
    let y = this.compact ? 240 : 24; // touch layout: below the weapons panel
    for (const f of game.killfeed) {
      const age = game.time - f.time;
      if (age > 8) continue;
      g.globalAlpha = age > 7 ? 8 - age : 1;
      const col = (t) => (t < 0 ? MUTED : t === game.playerTeam ? BLUE : RED);
      let x = W - 16;
      g.fillStyle = col(f.bt); g.fillText(f.b, x, y); x -= g.measureText(f.b).width + 6;
      if (f.verb) { g.fillStyle = BONE; g.fillText(f.verb, x, y); x -= g.measureText(f.verb).width + 6; }
      g.fillStyle = col(f.at); g.fillText(f.a, x, y);
      y += 20;
    }
    g.globalAlpha = 1;
  }

  drawMinimap(game) {
    if (!this.map) return;
    const g = this.g, H = this.h;
    const size = this.compact ? 96 : 190, x0 = 16, y0 = this.compact ? 232 : H - 160 - size - 84;
    g.globalAlpha = 0.9;
    g.drawImage(this.map, x0, y0, size, size);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(236,230,218,0.25)'; g.strokeRect(x0, y0, size, size);
    g.fillStyle = BONE; g.fillRect(x0 - 3, y0, 3, size);
    const R = this.mapRange;
    const toMap = (p) => [x0 + (p.x / R * 0.5 + 0.5) * size, y0 + (p.z / R * 0.5 + 0.5) * size];
    const me = game.player;
    const myTeam = game.playerTeam;
    const jam = game.radarJam > 0;
    const z = game.zone;
    if (z) {
      const sc = size / (R * 2);
      g.save(); g.beginPath(); g.rect(x0, y0, size, size); g.clip();
      const [zx, zy] = toMap(z), [nx, ny] = toMap({ x: z.nx, z: z.nz });
      g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(zx, zy, z.r * sc, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.arc(nx, ny, z.nr * sc, 0, 7); g.stroke(); g.setLineDash([]);
      g.restore(); g.lineWidth = 1.5;
    }
    for (const u of game.groundUnits) {
      if (!u.alive) continue;
      if (jam && u.team !== myTeam) continue;
      const [mx, my] = toMap(u.pos);
      g.fillStyle = u.rescue ? GREEN : u.eventTarget && u.team !== myTeam ? AMBER : u.team === myTeam ? BLUE : RED;
      const s = u.objective || u.rescue ? 3.5 : 2;
      g.fillRect(mx - s / 2, my - s / 2, s, s);
    }
    for (const a of game.aircraft) {
      if (!a.alive || a === me) continue;
      const enemy = a.team !== myTeam;
      if (enemy && (jam || game.inCloud(a))) continue;
      const [mx, my] = toMap(a.pos);
      g.fillStyle = a.aceId && enemy ? GOLD : a.vip ? '#ffd75a' : enemy ? RED : BLUE;
      g.beginPath(); g.arc(mx, my, a.aceId || a.vip ? 3.6 : 2.6, 0, 7); g.fill();
    }
    if (game.conquest) for (const pt of game.conquest.points) {
      const [mx, my] = toMap(pt);
      g.fillStyle = OWNER[pt.owner]; g.font = `700 10px ${NUM}`; g.textAlign = 'center';
      g.fillRect(mx - 5, my - 5, 10, 10); g.fillStyle = '#000'; g.fillText(pt.id, mx, my + 1);
    }
    if (jam) {
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.35})`; g.fillRect(x0 + Math.random() * size, y0 + Math.random() * size, 2, 2); }
      g.fillStyle = AMBER; g.font = `700 11px ${FONT}`; g.textAlign = 'center'; g.fillText('NO RADAR', x0 + size / 2, y0 + size / 2);
    }
    if (me) {
      const [mx, my] = toMap(me.pos);
      const ang = Math.atan2(me.fwd.x, -me.fwd.z);
      g.save(); g.translate(mx, my); g.rotate(ang);
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill();
      g.restore();
    }
    g.fillStyle = BONE; g.font = `700 12px ${JP}`; g.textAlign = 'center'; g.fillText('北', x0 + size / 2, y0 + 10);
  }

  drawCenter(game, dt) {
    const g = this.g, W = this.w, H = this.h;
    g.textAlign = 'center';
    let y = H * 0.28;
    for (const m of game.messages) {
      g.font = `600 24px ${FONT}`; if ('letterSpacing' in g) g.letterSpacing = '3px';
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(m.text.toUpperCase(), W / 2 + 2, y + 2);
      g.fillStyle = m.color; g.fillText(m.text.toUpperCase(), W / 2, y);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      y += 34;
    }
    let cy = H * 0.68;
    for (const c of this.confirms) {
      c.t -= dt;
      g.globalAlpha = clamp(c.t, 0, 1);
      g.font = `800 16px ${JP}`; g.fillStyle = INK; g.fillText('撃破', W / 2 - g.measureText(c.text).width * 0.58 - 26, cy);
      g.font = `600 17px ${FONT}`; g.fillStyle = BONE; g.fillText(c.text.toUpperCase(), W / 2 + 12, cy);
      cy += 24;
    }
    g.globalAlpha = 1;
    this.confirms = this.confirms.filter((c) => c.t > 0);
    if (!game.player && game.mode !== 'demo' && !game.over) {
      g.font = `800 24px ${JP}`; g.fillStyle = BONE;
      g.fillText(game.lives > 0 ? `再出撃  ${Math.max(0, Math.ceil(game.respawnTimer))}` : '残機なし', W / 2, H * 0.62);
      g.font = `600 12px ${FONT}`; g.fillStyle = MUTED;
      g.fillText(this.spaced(game.lives > 0 ? 'RESPAWNING' : 'NO AIRCRAFT REMAINING'), W / 2, H * 0.62 + 22);
    }
  }

  drawChat(dt) {
    const g = this.g;
    g.textAlign = 'left'; g.font = `600 14px ${FONT}`;
    let y = this.h * 0.45;
    for (const l of this.chatLines) {
      l.t -= dt;
      if (l.t <= 0) continue;
      g.globalAlpha = Math.min(1, l.t);
      g.fillStyle = TEAM_COLORS[l.team] || '#ffffff'; g.fillText(`${l.name}:`, 18, y);
      g.fillStyle = '#ffffff'; g.fillText(l.text, 24 + g.measureText(`${l.name}:`).width, y);
      y += 20;
    }
    g.globalAlpha = 1;
  }

  drawScoreboard(game) {
    const el = this.scoreEl;
    if (!this.showScores) { el.classList.remove('show'); return; }
    el.classList.add('show');
    if (this._sbT && game.time - this._sbT < 0.5) return;
    this._sbT = game.time;
    const rows = [...game.scores.values()].sort((a, b) => b.score - a.score);
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const head = game.ffa ? '<div class="sb-head"><span class="jp">乱戦</span><span>Free-for-all</span></div>'
      : `<div class="sb-head"><span class="t0">青 Blue ${game.teamScore[0]}</span><span class="jp">戦況</span><span class="t1">${game.teamScore[1]} Red 赤</span></div>`;
    el.innerHTML = `${head}<table><tr><th>操縦士 Pilot</th><th>空 Air</th><th>地 Ground</th><th>被撃墜 Deaths</th><th>得点 Score</th></tr>${rows.map((r) =>
      `<tr class="${r.id === game.playerId ? 'me' : ''}"><td class="t${r.team === game.playerTeam ? 0 : 1}">${esc(r.name)}${r.bot ? ' <small>(AI)</small>' : ''}</td><td>${r.kills}</td><td>${r.gkills}</td><td>${r.deaths}</td><td>${r.score}</td></tr>`).join('')}</table>`;
  }
}
