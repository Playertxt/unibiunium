// Achievements and medals: unlocked once, saved in the browser. Counters track progress for multi-step medals.
import { WORLD_ORDER, WORLDS } from './worlds.js';

const KEY = 'unbiunium.medals.v1';

// [id, name, jp, description, progress (optional: () => [have, need])]
export const MEDALS = [
  ['first_blood', 'First Blood', '初撃墜', 'Shoot down your first aircraft.'],
  ['touchdown', 'Touchdown', '着陸', 'Make a gentle hover landing anywhere.'],
  ['world_tour', 'World Tourist', '世界巡航', 'Land on every world.', () => [Medals.worlds().length, WORLD_ORDER.length]],
  ['tank_guns', 'Old-School Tank Buster', '機銃戦車', 'Kill a tank using guns only: no rockets, bombs or missiles.'],
  ['cobra_bandit', 'Cobra Overshoot', 'コブラ', 'Cobra so a bandit on your tail overshoots in front of you.'],
  ['bomb_bomber', 'Bombs Away… Up?', '爆撃撃墜', 'Shoot down a bomber with a bomb.'],
  ['double_kill', 'Double Kill', '二連撃', 'Two kills within four seconds.'],
  ['triple_kill', 'Triple Threat', '三連撃', 'Three kills within four seconds of each other.'],
  ['one_bomb', 'Carpet Bomber', '一弾三殺', 'Destroy three targets with a single bomb or rocket.'],
  ['streak_5', 'On Fire', '連勝五', 'Get a 5-kill streak without dying.'],
  ['streak_10', 'Untouchable', '連勝十', 'Get a 10-kill streak without dying.'],
  ['overcharge', 'Element 121', '過充電', 'Earn a UBU overcharge (7-kill streak).'],
  ['airstrike', 'Danger Close', '空爆', 'Destroy something with a called-in airstrike.'],
  ['ace_any', 'Ace Slayer', '撃墜王殺し', 'Shoot down an enemy ace.'],
  ['ace_kaiser', 'Crown Breaker', '皇帝撃墜', 'Shoot down "Kaiser", the aggressive ace.'],
  ['ace_hailstorm', 'Storm Chaser', '雹嵐撃墜', 'Shoot down "Hailstorm", the missile ace.'],
  ['ace_wisp', 'Cloud Buster', '鬼火撃墜', 'Shoot down "Wisp", the ace who hides in clouds.'],
  ['nemesis', 'Nemesis', '宿敵', 'Shoot down all three aces.', () => [['ace_kaiser', 'ace_hailstorm', 'ace_wisp'].filter((k) => Medals.has(k)).length, 3]],
  ['rescue', 'Lifeguard', '救助', 'Hover-land beside a downed pilot and rescue them.'],
  ['rescue_5', 'Search and Rescue', '救難隊', 'Rescue five downed pilots.', () => [Math.min(5, Medals.count('rescues')), 5]],
  ['convoy', 'Roadblock', '輸送阻止', 'Stop an escaping convoy before the clock runs out.'],
  ['flare_dodge', 'Hot Decoy', '囮', 'Spoof an enemy heat-seeker with flares.'],
  ['chaff_dodge', 'Tin Foil', '電波妨害', 'Spoof a SAM missile with chaff.'],
  ['sam_hunter', 'Wild Weasel', '対空制圧', 'Destroy five SAM sites.', () => [Math.min(5, Medals.count('sams')), 5]],
  ['storm_kill', 'Storm Rider', '嵐の騎士', 'Shoot down an aircraft during a thunderstorm.'],
  ['blind_kill', 'Whiteout', '視界零', 'Shoot down an aircraft while visibility is below half (sandstorm or blizzard).'],
  ['capture', 'Flag Planter', '占領', 'Capture an airfield in Conquest by landing on it.'],
  ['lps_win', 'Last One Flying', '最後の一機', 'Win a Last Pilot Standing match.'],
  ['escort_win', 'Safe Delivery', '護衛成功', 'Win Bomber Escort on the escorting side.'],
  ['vip_titan', 'Precious Cargo', '要人輸送', 'Win Bomber Escort flying the Titan yourself.'],
  ['intercept_win', 'Bomber Down', '迎撃成功', 'Win Bomber Escort as the interceptor.'],
];

export const Medals = {
  data: { unlocked: {}, counters: {}, worlds: [] },
  session: [],      // unlocked during the current match
  onUnlock: null,   // (medal) => void, set by the running game

  load() {
    try { const d = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; Object.assign(this.data, d); } catch (e) { /* ignore */ }
    this.data.unlocked ||= {}; this.data.counters ||= {}; this.data.worlds ||= [];
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },

  has(id) { return !!this.data.unlocked[id]; },
  get(id) { return MEDALS.find((m) => m[0] === id); },
  count(k) { return this.data.counters[k] || 0; },
  worlds() { return this.data.worlds.filter((w) => WORLDS[w]); },

  unlock(id) {
    if (this.has(id)) return false;
    const m = this.get(id);
    if (!m) return false;
    this.data.unlocked[id] = Date.now();
    this.session.push(id);
    this.save();
    if (this.onUnlock) this.onUnlock({ id, name: m[1], jp: m[2], desc: m[3] });
    if (['ace_kaiser', 'ace_hailstorm', 'ace_wisp'].every((k) => this.has(k))) this.unlock('nemesis');
    return true;
  },

  inc(k, n = 1) {
    this.data.counters[k] = this.count(k) + n;
    this.save();
    if (k === 'rescues' && this.count(k) >= 5) this.unlock('rescue_5');
    if (k === 'sams' && this.count(k) >= 5) this.unlock('sam_hunter');
  },

  landedOn(worldId) {
    this.unlock('touchdown');
    if (worldId && !this.data.worlds.includes(worldId)) {
      this.data.worlds.push(worldId);
      this.save();
      if (WORLD_ORDER.every((w) => this.data.worlds.includes(w))) this.unlock('world_tour');
      return true;
    }
    return false;
  },

  startSession() { this.session = []; },
  total() { return MEDALS.length; },
  unlockedCount() { return MEDALS.filter((m) => this.has(m[0])).length; },
};
