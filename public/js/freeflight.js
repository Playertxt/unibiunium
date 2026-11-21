// Free Flight: fly any jet anywhere, no score or time limit. Optional tank hunt (moving enemy tank columns,
// optionally guarded by AA), optional enemy fighters, unlimited ammo and invincibility.
import { RNG } from './noise.js';

const MAP_R = 7600;

export class TankHunt {
  constructor(game, opts = {}) {
    this.game = game;
    this.target = opts.tanks ?? 8;   // tanks kept alive at once
    this.aa = !!opts.aa;
    this.rng = new RNG(opts.seed || 121);
    this.timer = 0;
    this.wave = 0;
    for (let i = 0; i < Math.ceil(this.target / 4); i++) this.spawnConvoy(true);
  }

  // Land point that a tank can drive on.
  isLand(x, z) {
    const w = this.game.world;
    if (Math.hypot(x, z) > MAP_R) return false;
    if (w.heightAt(x, z) < 3) return false;
    return w.normalAt(x, z).y > 0.86;
  }

  landPoint(cx, cz, rMin, rMax) {
    for (let i = 0; i < 60; i++) {
      const a = this.rng.float(0, Math.PI * 2), r = this.rng.float(rMin, rMax);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (this.isLand(x, z)) return { x, z };
    }
    return null;
  }

  segmentOnLand(a, b) {
    for (let t = 0.1; t <= 1.0001; t += 0.1) if (!this.isLand(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    return true;
  }

  spawnConvoy(initial = false) {
    const g = this.game;
    // Start somewhere ahead of / around the player so there is always something to find.
    const p = g.player;
    const cx = p && !initial ? p.pos.x : 0, cz = p && !initial ? p.pos.z : 0;
    const start = this.landPoint(cx, cz, initial ? 0 : 1800, initial ? 5200 : 4200) || this.landPoint(0, 0, 0, 6000);
    if (!start) return;
    // Patrol route: a short random walk over drivable land, looped.
    const path = [start];
    let cur = start;
    for (let i = 0; i < 4; i++) {
      let next = null;
      for (let k = 0; k < 12 && !next; k++) {
        const c = this.landPoint(cur.x, cur.z, 350, 900);
        if (c && this.segmentOnLand(cur, c)) next = c;
      }
      if (!next) break;
      path.push(next);
      cur = next;
    }
    if (path.length > 2 && !this.segmentOnLand(cur, start)) path.push(...path.slice(1, -1).reverse());
    const n = 3 + Math.floor(this.rng.float(0, 3));
    const head0 = path.length > 1 ? Math.atan2(-(path[1].x - start.x), -(path[1].z - start.z)) : 0;
    for (let i = 0; i < n; i++) {
      const kind = this.rng.chance(0.3) ? 'heavytank' : 'tank';
      const back = i * 22;
      const x = start.x + Math.sin(head0) * back + this.rng.float(-6, 6), z = start.z + Math.cos(head0) * back + this.rng.float(-6, 6);
      g.spawnGround(kind, 1, x, z, { heading: head0, path, loop: true, speedMul: this.rng.float(0.85, 1.05) });
    }
    if (this.aa) {
      const s = this.landPoint(start.x, start.z, 60, 220);
      if (s) g.spawnGround('aa', 1, s.x, s.z);
      // Every other column brings a SAM launcher too.
      const m = this.wave % 2 === 0 && this.landPoint(start.x, start.z, 150, 400);
      if (m) g.spawnGround('sam', 1, m.x, m.z);
    }
    this.wave++;
  }

  update(dt) {
    const g = this.game;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 4;
    const alive = g.groundUnits.filter((u) => u.alive && (u.kind === 'tank' || u.kind === 'heavytank')).length;
    if (alive < this.target) this.spawnConvoy();
    // Clear old wrecks so the scene doesn't grow forever.
    const wrecks = g.groundUnits.filter((u) => !u.alive);
    if (wrecks.length > 30) for (const w of wrecks.slice(0, wrecks.length - 30)) g.removeEntity(w);
  }
}

// Unlimited ammo: top up the player's weapons shortly after they run dry.
export class Rearmer {
  constructor(game) { this.game = game; this.t = 0; }
  update(dt) {
    const p = this.game.player;
    if (!p || !p.alive) return;
    const d = p.def;
    if (p.ammo < d.guns.ammo * 0.5) p.ammo = d.guns.ammo;
    const empty = (d.bombs && p.bombsLeft === 0) || (d.rockets && p.rocketsLeft === 0);
    if (empty) {
      this.t += dt;
      if (this.t > 1.5) { this.t = 0; p.rearm(); this.game.message('Rearmed', 1.2, '#a8d39a'); }
    } else this.t = 0;
  }
}
