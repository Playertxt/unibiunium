// Campaign: "Operation Iron Sky" — six missions with objectives and progress saving.
import * as THREE from 'three';
import { SITES } from './world.js';
import { setupBattlefield, Reinforcements, BotManager } from './battle.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const KEY = 'skyforge.campaign.v1';

export const Progress = {
  data: { unlocked: 1, stars: {} },
  load() { try { Object.assign(this.data, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ } return this.data; },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  complete(index, stars) {
    this.data.unlocked = Math.max(this.data.unlocked, index + 2);
    this.data.stars[index] = Math.max(this.data.stars[index] || 0, stars);
    this.save();
  },
};

const enemyAirKills = (g) => g.ms.airKills || 0;
const alive = (list) => list.filter((u) => u.alive).length;

function wingmen(g, kind, n, skill = 0.55) {
  const p = g.spawnPoint(0);
  for (let i = 0; i < n; i++) g.spawnAI(kind, 0, p.pos.clone().add(V((i % 2 ? 1 : -1) * (90 + i * 60), 20, 120 + i * 60)), { heading: 0, skill, name: ['Hawk', 'Ghost', 'Talon', 'Raven'][i % 4] });
}

export const MISSIONS = [
  {
    title: 'Baptism of Fire', jp: '初陣', short: 'Dogfight training over the coast',
    brief: 'Red Coalition scouts are probing our airspace. Take your flight north and clear the skies. Enemy fighters will arrive in three waves — keep your speed up and lead your shots using the aiming reticle.',
    objectives: ['Destroy 6 enemy fighters', 'Survive (3 aircraft available)'],
    world: 'island', planes: ['falcon', 'kestrel'], timeOfDay: 'day', lives: 3, par: 300,
    setup(g) {
      g.ms.wave = 0; g.ms.waveTimer = 4;
      wingmen(g, 'falcon', 2, 0.45);
    },
    update(g, dt) {
      const enemies = g.aircraft.filter((a) => a.alive && a.team === 1).length;
      if (enemies === 0 && g.ms.wave < 3) {
        g.ms.waveTimer -= dt;
        if (g.ms.waveTimer <= 0) {
          g.ms.wave++;
          g.ms.waveTimer = 6;
          const kind = g.ms.wave === 3 ? 'kestrel' : 'falcon';
          for (let i = 0; i < 2; i++) g.spawnAI(kind, 1, V(-600 + i * 1200, 1500 + i * 150, -2600 - g.ms.wave * 300), { heading: Math.PI, skill: 0.2 + g.ms.wave * 0.12, noAir: false });
          g.message(`Wave ${g.ms.wave} of 3 inbound`, 3, '#e6cf9a');
        }
      }
    },
    status: (g) => `Enemy fighters destroyed: ${Math.min(6, enemyAirKills(g))}/6`,
    check: (g) => (enemyAirKills(g) >= 6 ? { win: true } : null),
  },
  {
    title: 'Iron Column', jp: '鉄の隊列', short: 'Stop the armoured advance',
    brief: 'An enemy armoured column is pushing across the desert basin toward our forward base. Intercept it before it arrives. Tanks are heavily armoured — use the Hammerhead\'s anti-tank cannon, rockets or bombs. Expect light anti-aircraft fire.',
    objectives: ['Destroy all 8 tanks and 4 trucks in the column', 'Do not let the column reach the Blue base'],
    world: 'desert', planes: ['hammer', 'falcon', 'kestrel'], timeOfDay: 'day', lives: 3, par: 420,
    setup(g) {
      const path = [{ x: 1500, z: -2700 }, { x: 900, z: -1200 }, { x: 250, z: 200 }, { x: -350, z: 1500 }, { x: -700, z: 2400 }];
      g.ms.column = [];
      const kinds = ['truck', 'tank', 'tank', 'tank', 'truck', 'tank', 'tank', 'truck', 'tank', 'tank', 'tank', 'truck'];
      kinds.forEach((k, i) => {
        const u = g.spawnGround(k, 1, 1500 + i * 9, -2700 - i * 38, { path, heading: Math.PI * 0.85, objective: true, speedMul: k === 'truck' ? 0.62 : 1 });
        u.speed = 6.2;
        g.ms.column.push(u);
      });
      for (const [x, z] of [[1250, -2450], [1750, -2300], [1000, -1050], [500, -400]]) g.spawnGround('aa', 1, x, z);
      g.spawnGround('aa', 0, -700, 2250); g.spawnGround('hq', 0, SITES.blueBase.x, SITES.blueBase.z, { hpMul: 3 });
      g.ms.fighters = false;
      wingmen(g, 'hammer', 1, 0.5);
    },
    update(g) {
      if (!g.ms.fighters && g.time > 70) {
        g.ms.fighters = true;
        for (let i = 0; i < 2; i++) g.spawnAI('falcon', 1, V(i * 600, 1600, -5000), { heading: Math.PI, skill: 0.4 });
        g.message('Enemy fighters scrambled!', 3, '#e2574b');
      }
    },
    status: (g) => `Column remaining: ${alive(g.ms.column)}/12`,
    check(g) {
      if (alive(g.ms.column) === 0) return { win: true };
      const b = SITES.blueBase;
      if (g.ms.column.some((u) => u.alive && Math.hypot(u.pos.x - b.x, u.pos.z - b.z) < 380)) return { win: false, reason: 'The column reached our base' };
      return null;
    },
  },
  {
    title: 'Bomber Stream', jp: '爆撃機の奔流', short: 'Intercept the heavy bombers',
    brief: 'Radar shows a stream of six heavy bombers with fighter escort crossing the fjords, heading straight for our Command HQ. Climb, intercept and bring them all down. Bombers carry defensive turrets — attack from angles where fewer guns can reach you.',
    objectives: ['Shoot down all 6 bombers', 'Protect the Blue Command HQ'],
    world: 'arctic', planes: ['kestrel', 'falcon'], timeOfDay: 'day', lives: 3, par: 360,
    spawn: () => ({ pos: V(-300, 1900, 1200), heading: 0 }),
    setup(g) {
      g.ms.hq = g.spawnGround('hq', 0, SITES.blueBase.x, SITES.blueBase.z, { hpMul: 4, objective: true });
      for (let i = 0; i < 3; i++) { const a = i * 2.1; g.spawnGround('aa', 0, SITES.blueBase.x + Math.cos(a) * 260, SITES.blueBase.z + Math.sin(a) * 260); }
      g.ms.bombers = [];
      for (let i = 0; i < 6; i++) {
        const b = g.spawnAI('titan', 1, V(-900 + (i % 3) * 600, 1900 + (i % 2) * 120, -10500 - Math.floor(i / 3) * 900), { heading: Math.PI, skill: 0.4, bombTarget: g.ms.hq, alt: 1700 });
        g.ms.bombers.push(b);
      }
      for (let i = 0; i < 3; i++) g.spawnAI('falcon', 1, V(-500 + i * 500, 2300, -9800), { heading: Math.PI, skill: 0.45 });
      g.ms.second = false;
      wingmen(g, 'falcon', 2, 0.5);
    },
    update(g) {
      if (!g.ms.second && g.time > 90) {
        g.ms.second = true;
        for (let i = 0; i < 2; i++) g.spawnAI('kestrel', 1, V(i * 700 - 350, 2500, -7000), { heading: Math.PI, skill: 0.5 });
        g.message('Second escort group inbound', 3, '#e2574b');
      }
    },
    status: (g) => `Bombers remaining: ${alive(g.ms.bombers)}/6   HQ: ${Math.max(0, Math.round(g.ms.hq.hp / g.ms.hq.maxHp * 100))}%`,
    check(g) {
      if (!g.ms.hq.alive) return { win: false, reason: 'Command HQ was destroyed' };
      if (alive(g.ms.bombers) === 0 && g.ms.bombers.every((b) => !b.dying || b.removed || !b.alive)) return { win: true };
      return null;
    },
  },
  {
    title: 'Lights Out', jp: '消灯', short: 'Blind the enemy air defence',
    brief: 'Tonight we strike the enemy early-warning network deep in the mountain valley. Destroy the radar station and fuel depot at the Red base, then flatten the hangars at their airfield. Heavy flak protects every target — bombers are recommended.',
    objectives: ['Destroy the radar station', 'Destroy the fuel depot', 'Destroy 2 hangars at the Red airfield'],
    world: 'highlands', planes: ['titan', 'hammer', 'falcon'], timeOfDay: 'dusk', lives: 3, par: 480,
    setup(g) {
      const rb = SITES.redBase, ra = SITES.redAirfield;
      g.ms.targets = [
        g.spawnGround('radar', 1, rb.x - 160, rb.z - 50, { objective: true }),
        g.spawnGround('depot', 1, rb.x + 150, rb.z - 70, { objective: true }),
        g.spawnGround('hangar', 1, ra.x + 160, ra.z + 270, { objective: true }),
        g.spawnGround('hangar', 1, ra.x + 225, ra.z + 270, { objective: true }),
      ];
      g.spawnGround('hq', 1, rb.x, rb.z, { heading: Math.PI });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.spawnGround('aa', 1, rb.x + Math.cos(a) * 300, rb.z + Math.sin(a) * 300); }
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.3; g.spawnGround('aa', 1, ra.x + Math.cos(a) * 500, ra.z + Math.sin(a) * 350); }
      g.ms.bots = new BotManager(g, { 1: 3 }, { skill: 0.5 });
      g.ms.bots.initial();
      wingmen(g, 'falcon', 2, 0.55);
    },
    update(g, dt) { g.ms.bots.update(dt); },
    status: (g) => `Targets remaining: ${alive(g.ms.targets)}/4`,
    check: (g) => (alive(g.ms.targets) === 0 ? { win: true } : null),
  },
  {
    title: 'Steel Tide', jp: '鋼の潮', short: 'Support the front-line offensive',
    brief: 'Our armour is attacking across the plains. Give them air support: destroy enemy tanks and the pillboxes holding the line, while keeping enemy fighters off our ground forces.',
    objectives: ['Destroy 10 enemy tanks', 'Destroy all 3 enemy pillboxes'],
    world: 'island', planes: ['hammer', 'falcon', 'kestrel', 'titan'], timeOfDay: 'day', lives: 4, par: 600,
    setup(g) {
      setupBattlefield(g, 21, { ships: false });
      g.ms.reinf = new Reinforcements(g, { seed: 21 });
      g.ms.bots = new BotManager(g, { 0: 3, 1: 4 }, { skill: 0.5 });
      g.ms.bots.initial();
      g.ms.tankKills = 0;
      g.ms.bunkers = g.groundUnits.filter((u) => u.kind === 'bunker' && u.team === 1);
    },
    update(g, dt) { g.ms.reinf.update(dt); g.ms.bots.update(dt); },
    status: (g) => `Tanks: ${Math.min(10, g.ms.tankKills)}/10   Pillboxes: ${3 - alive(g.ms.bunkers)}/3`,
    check: (g) => (g.ms.tankKills >= 10 && alive(g.ms.bunkers) === 0 ? { win: true } : null),
  },
  {
    title: 'Hammer Fall', jp: '鉄槌落つ', short: 'Destroy the enemy command',
    brief: 'This is it. The Red Coalition Command HQ coordinates their entire war effort, and their destroyer patrols the eastern lagoons of the archipelago. Destroy both and the war is over. Every enemy fighter on the island will be up — good luck, pilot.',
    objectives: ['Destroy the Red Command HQ', 'Sink the Red destroyer'],
    world: 'archipelago', planes: ['titan', 'hammer', 'falcon', 'kestrel'], timeOfDay: 'dawn', lives: 4, par: 720,
    setup(g) {
      setupBattlefield(g, 42, {});
      g.ms.hq = g.groundUnits.find((u) => u.kind === 'hq' && u.team === 1);
      g.ms.ship = g.groundUnits.find((u) => u.kind === 'ship' && u.team === 1) || null;
      g.ms.hq.maxHp = g.ms.hq.hp = 2600;
      g.ms.reinf = new Reinforcements(g, { seed: 42 });
      g.ms.bots = new BotManager(g, { 0: 3, 1: 6 }, { skill: 0.62 });
      g.ms.bots.initial();
    },
    update(g, dt) { g.ms.reinf.update(dt); g.ms.bots.update(dt); },
    status: (g) => `HQ: ${g.ms.hq.alive ? Math.round(g.ms.hq.hp / g.ms.hq.maxHp * 100) + '%' : 'DESTROYED'}   Destroyer: ${!g.ms.ship ? 'n/a' : g.ms.ship.alive ? Math.round(g.ms.ship.hp / g.ms.ship.maxHp * 100) + '%' : 'SUNK'}`,
    check: (g) => (!g.ms.hq.alive && (!g.ms.ship || !g.ms.ship.alive) ? { win: true } : null),
  },
];

// Wire a mission into a Game instance.
export function startMission(g, index) {
  const m = MISSIONS[index];
  g.mission = m;
  g.missionIndex = index;
  g.ms = { airKills: 0 };
  g.lives = m.lives;
  g.objectiveText = () => m.status(g);
  if (m.spawn) g.opts.spawn = m.spawn;
  m.setup(g);
  g.onMissionKill = (victim) => {
    if (victim.team === 1 && victim.type === 'air') g.ms.airKills++;
    if (victim.team === 1 && victim.kind === 'tank') g.ms.tankKills = (g.ms.tankKills || 0) + 1;
  };
  g.extraUpdate = (dt) => {
    if (g.over) return;
    if (m.update) m.update(g, dt);
    const r = m.check(g);
    if (r) {
      // Let the final explosion play out.
      if (!g.ms.endAt) { g.ms.endAt = g.time + (r.win ? 3 : 2.5); g.ms.result = r; g.message(r.win ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED', 3, r.win ? '#a8d39a' : '#d8402f'); }
    } else if (g.lives <= 0 && !g.player && g.respawnTimer <= 0) {
      if (!g.ms.endAt) { g.ms.endAt = g.time + 1; g.ms.result = { win: false, reason: 'No aircraft left' }; }
    }
    if (g.ms.endAt && g.time >= g.ms.endAt) g.finish(g.ms.result.win ? 0 : 1, g.ms.result.reason || '');
  };
}

export function missionStars(g) {
  const m = g.mission;
  let s = 1;
  if (g.stats.deaths === 0) s++;
  if (g.time <= m.par) s++;
  return s;
}
