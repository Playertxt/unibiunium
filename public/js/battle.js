// Battlefield layout (bases, front line tank battle, AA, convoys, ships) and AI reinforcements.
import * as THREE from 'three';
import { SITES } from './world.js';
import { RNG } from './noise.js';

const PLANE_MIX = [['falcon', 0.24], ['kestrel', 0.16], ['viper', 0.12], ['corvid', 0.08], ['vortex', 0.1], ['wraith', 0.06], ['hammer', 0.16], ['titan', 0.08]];

export function pickPlane(rng = Math.random) {
  let r = typeof rng === 'function' ? rng() : rng.next();
  for (const [k, w] of PLANE_MIX) { if ((r -= w) <= 0) return k; }
  return 'falcon';
}

function tankPath(team, x, rng) {
  const dir = team === 0 ? -1 : 1;
  return [
    { x: x + rng.float(-150, 150), z: -dir * 350 },
    { x: x + rng.float(-250, 250), z: dir * 150 },
    { x: x + rng.float(-300, 300), z: dir * 900 },
    { x: x + rng.float(-300, 300), z: dir * 2000 },
  ];
}

export function setupBattlefield(game, seed = 7, opts = {}) {
  const rng = new RNG(seed);
  const teams = opts.teams || [0, 1];
  const tanks = opts.tanks ?? 8;
  // Destroyers only when both teams have an open-water lane on their flank, so neither side gets a free target.
  // The bigger maps push coastlines outward, so look for the nearest flank distance with open sea on both sides.
  const laneAt = (dist) => teams.map((team) => {
    const sx = team === 0 ? -dist : dist, sz = team === 0 ? 2600 : -2600;
    return { sx, sz, path: [{ x: sx, z: sz - 2500 }, { x: sx * 1.05, z: sz + 2500 }] };
  });
  const open = (ls) => ls.every((l) => game.world.isOpenWater(l.path[0].x, l.path[0].z, l.path[1].x, l.path[1].z, 10));
  let lanes = null;
  for (const dist of [8200, 10500, 13000, 15500, 17200]) { const ls = laneAt(dist); if (open(ls)) { lanes = ls; break; } }
  const ships = opts.ships !== false && !game.world.def.noShips && !!lanes;
  for (const team of teams) {
    const dir = team === 0 ? 1 : -1;
    const base = team === 0 ? SITES.blueBase : SITES.redBase;
    const af = team === 0 ? SITES.blueAirfield : SITES.redAirfield;
    const head = team === 0 ? 0 : Math.PI;
    game.spawnGround('hq', team, base.x, base.z, { objective: true, heading: head });
    game.spawnGround('depot', team, base.x + 150, base.z + 70 * dir, { objective: true, heading: head });
    game.spawnGround('radar', team, base.x - 160, base.z + 50 * dir, { objective: true });
    game.spawnGround('hangar', team, af.x + 160, af.z + 270, { objective: true, heading: 0 });
    game.spawnGround('hangar', team, af.x + 225, af.z + 270, { objective: true, heading: 0 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      game.spawnGround('aa', team, base.x + Math.cos(a) * 280, base.z + Math.sin(a) * 280);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 1.1;
      game.spawnGround('aa', team, af.x + Math.cos(a) * 520, af.z + Math.sin(a) * 380);
    }
    // SAM sites: radar-guided missiles. Fly below 70 m or drop chaff.
    if (opts.sams !== false) {
      game.spawnGround('sam', team, base.x + 260 * (team === 0 ? 1 : -1), base.z + dir * 420);
      game.spawnGround('sam', team, af.x - 420, af.z + dir * 120);
    }
    for (const x of [-1700, 0, 1700]) {
      game.spawnGround('bunker', team, x + rng.float(-200, 200), dir * (1150 + rng.float(-80, 80)), { objective: true, heading: head });
      game.spawnGround('aa', team, x + rng.float(-250, 250), dir * (1450 + rng.float(-100, 100)));
    }
    for (let i = 0; i < tanks; i++) {
      const x = -2600 + (i + 0.5) * (5200 / tanks) + rng.float(-120, 120);
      game.spawnGround('tank', team, x, dir * (800 + rng.float(-60, 60)), { heading: head, path: tankPath(team, x, rng), speedMul: rng.float(0.8, 1.1) });
    }
    // Supply convoy looping between base and the front.
    const conv = [{ x: base.x, z: base.z - dir * 200 }, { x: base.x + 900, z: dir * 1500 }, { x: base.x - 900, z: dir * 1550 }, { x: base.x - 300, z: base.z - dir * 150 }];
    for (let i = 0; i < 4; i++) {
      game.spawnGround('truck', team, base.x + i * 18, base.z - dir * (200 - i * 22), { heading: head, path: conv, loop: true, speedMul: 0.9 });
    }
    if (ships) {
      const lane = lanes[teams.indexOf(team)];
      game.spawnGround('ship', team, lane.sx, lane.sz, { path: lane.path, loop: true, objective: true });
    }
  }
}

// Keeps the ground war going (host / single player only).
export class Reinforcements {
  constructor(game, opts = {}) {
    this.game = game;
    this.timer = 40;
    this.maxTanks = opts.tanks ?? 8;
    this.rng = new RNG((opts.seed || 1) + 99);
  }

  update(dt) {
    const g = this.game;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 45;
    for (const team of [0, 1]) {
      const alive = g.groundUnits.filter((u) => u.alive && u.team === team && u.kind === 'tank').length;
      const hq = g.groundUnits.find((u) => u.kind === 'hq' && u.team === team);
      if (!hq || !hq.alive) continue;
      const dir = team === 0 ? 1 : -1;
      for (let i = 0; i < Math.min(2, this.maxTanks - alive); i++) {
        const x = this.rng.float(-2200, 2200);
        g.spawnGround('tank', team, hq.pos.x + this.rng.float(-150, 150), hq.pos.z - dir * 250, { heading: team === 0 ? 0 : Math.PI, path: tankPath(team, x, this.rng) });
      }
    }
    // Clear out old wrecks so the scene doesn't grow forever.
    const wrecks = g.groundUnits.filter((u) => !u.alive && (u.kind === 'tank' || u.kind === 'truck'));
    if (wrecks.length > 24) for (const w of wrecks.slice(0, wrecks.length - 24)) g.removeEntity(w);
  }
}

// Maintains a number of AI aircraft per team.
export class BotManager {
  constructor(game, quota, opts = {}) {
    this.game = game;
    this.quota = quota; // { teamId: count }
    this.timers = {};
    this.skill = opts.skill ?? 0.5;
    this.ffaNext = 100;
    this.ffa = !!opts.ffa;
    this.spawnOpts = opts.spawnOpts || null; // (kind, team) => extra PilotAI options
    this.list = [];
  }

  initial() {
    for (const [team, n] of Object.entries(this.quota)) for (let i = 0; i < n; i++) this.spawn(+team, true);
  }

  spawn(team, initial) {
    const g = this.game;
    let t = team;
    if (this.ffa) t = this.ffaNext++;
    const sp = g.spawnPoint(this.ffa ? 1 : team);
    if (initial) sp.pos.add(new THREE.Vector3((Math.random() - 0.5) * 1800, Math.random() * 400, (Math.random() - 0.5) * 900));
    const kind = pickPlane();
    const extra = this.spawnOpts ? this.spawnOpts(kind, team) : {};
    const ac = g.spawnAI(kind, t, sp.pos, { heading: sp.heading, skill: this.skill + (Math.random() - 0.5) * 0.3, ...extra });
    ac.botSlot = team;
    this.list.push(ac);
    return ac;
  }

  update(dt) {
    this.list = this.list.filter((a) => a.alive);
    for (const [team, n] of Object.entries(this.quota)) {
      const alive = this.list.filter((a) => a.botSlot === +team).length;
      if (alive >= n) { this.timers[team] = 6; continue; }
      this.timers[team] = (this.timers[team] ?? 6) - dt;
      if (this.timers[team] <= 0) { this.timers[team] = 6; this.spawn(+team, false); }
    }
  }
}
