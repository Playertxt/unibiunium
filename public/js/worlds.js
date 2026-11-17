// Selectable worlds. Every world shares the same battlefield layout (airfields, bases, front line, towns)
// so all modes and missions work everywhere; terrain shape, biome colours, vegetation, water and
// atmosphere differ.
//
// terrain.shape: 'island' (single landmass), 'archipelago' (many islands) or 'valley' (mountain-walled valley).
// Optional: terrain.craters (impact craters), water.emissive/glow (lava or glowing seas), noShips, look.rayleigh,
// vegetation.tint (per tree type HSL tint ranges, or null for no hue tint).

export const WORLDS = {
  island: {
    name: 'Iron Island', jp: '鉄の島', tag: 'Temperate', tod: 'day',
    desc: 'Patchwork farmland, forests and rugged mountains on one large island. The classic battlefield.',
    seed: 1337,
    terrain: { shape: 'island', radius: 7200, coastNoise: 1300, coastScale: 3200, coastWidth: 1500, base: 34, hills: 75, mountains: 1350, ridgePow: 1.7 },
    palette: {
      grassA: 0x6c8a36, grassB: 0x4f6d29, dry: 0x9a9150, dryAmt: 0.45, forest: 0x3b5222,
      rock: 0x77726a, rockD: 0x56524b, rockLine: 420, snow: 0xf2f5f8, snowLine: 720, peakSnow: 0.6,
      sand: 0xc8b88a, seabed: 0x857c5c, beach: 9, fields: [0x7f913c, 0x9c9552, 0x5f7a30, 0xa28d55, 0x6e8a3f], fieldAmt: 0.85,
    },
    vegetation: { mix: [['conifer', 0.6], ['broad', 0.4]], density: 1, forest: 0, lone: 0.012, treeLine: 620,
      conifer: [0x2f4a24, 0x355427, 0x3b5d2b], broad: [0x46692c, 0x527734] },
    water: { color: 0x173f58, opacity: 1 },
    clouds: 1,
    town: { walls: [0xe8e0cc, 0xd8cdb3, 0xcfc6b8, 0xeae6dc, 0xbfae90], roofs: [0x8e3b2a, 0x7a3426, 0x5b4a3e, 0x9a5a3a, 0x4d4d52] },
    look: {},
    swatch: ['#4f6d29', '#7f913c', '#77726a', '#173f58'],
  },

  desert: {
    name: 'Scorched Mesa', jp: '焦土台地', tag: 'Desert', tod: 'day',
    desc: 'A sun-baked basin ringed by red sandstone mesas and dry canyons. Little cover, long sight lines.',
    seed: 2024,
    terrain: { shape: 'island', radius: 8300, coastNoise: 900, coastScale: 3600, coastWidth: 1200, base: 46, hills: 32, mountains: 0, mesas: 270, terrace: 38, dunes: 8 },
    palette: {
      grassA: 0xd2b07a, grassB: 0xc39762, dry: 0xe2c793, dryAmt: 0.5, forest: 0xa88a58,
      rock: 0xa65f3a, rockD: 0x7b4027, rockLine: 150, snow: 0xa65f3a, snowLine: 1e9,
      sand: 0xe3cf9a, seabed: 0x9a8a62, beach: 10, fields: [0x7d8a3a, 0x8f9a48], fieldAmt: 0.25,
    },
    vegetation: { mix: [['shrub', 0.78], ['cactus', 0.22]], density: 0.35, forest: -0.28, lone: 0.03, treeLine: 900,
      shrub: [0x6f7040, 0x857a4a], cactus: [0x4c7a3a] },
    water: { color: 0x1c4c60, opacity: 1, rivers: 1, lakes: 3 },
    clouds: 0.35,
    town: { walls: [0xd9c49a, 0xcbb084, 0xe2d2b0, 0xc7a87a], roofs: [0xb5653a, 0xc9a774, 0xa65a34, 0xd2b48a] },
    look: { fogTint: 0xe2c89e, tintAmt: 0.4, turbidity: 1.8, fogFar: 0.85, hemiGround: 0x8a7350 },
    swatch: ['#d2b07a', '#e2c793', '#a65f3a', '#7b4027'],
  },

  arctic: {
    name: 'Frost Fjords', jp: '氷の峡湾', tag: 'Arctic', tod: 'day',
    desc: 'Snowfields and frozen lakes between steep fjords and icy peaks. Dark targets stand out against the snow.',
    seed: 4711,
    terrain: { shape: 'island', radius: 7400, coastNoise: 2300, coastScale: 2100, coastWidth: 450, base: 30, hills: 85, mountains: 1250, mountainBias: 0.15, ridgePow: 1.9, lakes: true },
    palette: {
      grassA: 0xdfe6eb, grassB: 0xc8d1d8, dry: 0x7d7f6c, dryAmt: 0.55, forest: 0x3a4436,
      rock: 0x6b7178, rockD: 0x50565c, rockLine: 600, snow: 0xf4f8fb, snowLine: 120, snowSlope: [0.32, 0.55], peakSnow: 0.85,
      sand: 0x8d8b84, seabed: 0x4a4f50, beach: 5, fields: [], fieldAmt: 0,
    },
    vegetation: { mix: [['snowpine', 1]], density: 0.7, forest: -0.05, lone: 0.008, treeLine: 280 },
    water: { color: 0x1c3440, opacity: 1 },
    clouds: 1.2,
    town: { walls: [0x8a3a2e, 0x3d5a6e, 0xd8d2c0, 0x9a6a3a], roofs: [0xe8ecef, 0x2f3438, 0xdfe5e9, 0x3a3f44] },
    look: { fogTint: 0xdfe8f0, tintAmt: 0.3, turbidity: 0.8, hemiGround: 0x9aa4ad },
    swatch: ['#f4f8fb', '#c8d1d8', '#5d6268', '#1c3440'],
  },

  archipelago: {
    name: 'Coral Archipelago', jp: '珊瑚諸島', tag: 'Tropical', tod: 'day',
    desc: 'Jungle islands, white beaches and turquoise lagoons scattered across a warm sea. Plenty of naval targets.',
    seed: 909,
    terrain: { shape: 'archipelago', coastWidth: 700, base: 16, hills: 42, mountains: 650, mountainBias: -0.05, ridgePow: 1.6 },
    palette: {
      grassA: 0x56962f, grassB: 0x3f7d27, dry: 0x9aa84f, dryAmt: 0.25, forest: 0x2b5a20,
      rock: 0x544942, rockD: 0x3b332e, rockLine: 380, snow: 0x544942, snowLine: 1e9,
      sand: 0xf1e4b8, seabed: 0x2a7f86, beach: 14, fields: [0x6d9a3a, 0x8aa246], fieldAmt: 0.4,
    },
    vegetation: { mix: [['palm', 0.55], ['broad', 0.45]], density: 1.1, forest: 0.1, lone: 0.02, treeLine: 500,
      broad: [0x3f7a2a, 0x4f8c30], palm: [0x4f8c2c] },
    water: { color: 0x1aa0a8, opacity: 0.8 },
    clouds: 0.9,
    town: { walls: [0xf2efe6, 0xe8c9a0, 0xa9d1c8, 0xf0d8c0], roofs: [0xc0603a, 0x8a4a2a, 0xb0562e, 0x6a8a8a] },
    look: { fogTint: 0xb4dbe8, tintAmt: 0.15, turbidity: 0.9 },
    swatch: ['#f1e4b8', '#56962f', '#1aa0a8', '#2a7f86'],
  },

  highlands: {
    name: 'Highland Valley', jp: '高原の谷', tag: 'Alpine', tod: 'day',
    desc: 'A long green valley walled in by towering snow-capped peaks. Fly the valley floor or climb over the ridges.',
    seed: 3141,
    terrain: { shape: 'valley', radius: 8700, coastNoise: 500, coastScale: 3600, coastWidth: 900, base: 40, hills: 70, mountains: 2100, ridgePow: 1.4 },
    palette: {
      grassA: 0x5f8d35, grassB: 0x47722a, dry: 0x8f8e4c, dryAmt: 0.35, forest: 0x2e4a22,
      rock: 0x7a7771, rockD: 0x5a5751, rockLine: 700, snow: 0xf3f6f9, snowLine: 850, snowSlope: [0.36, 0.6], peakSnow: 0.9,
      sand: 0xb9ad86, seabed: 0x6f6a55, beach: 8, fields: [0x7f913c, 0x9c9552, 0x6e8a3f, 0x8a9a48], fieldAmt: 0.7,
    },
    vegetation: { mix: [['conifer', 0.8], ['broad', 0.2]], density: 1, forest: 0.05, lone: 0.012, treeLine: 1350,
      conifer: [0x2c4524, 0x324f28, 0x38572c], broad: [0x46692c, 0x527734] },
    water: { color: 0x1b4352, opacity: 1 },
    clouds: 1,
    town: { walls: [0xeae6dc, 0xd8cdb3, 0xcfc6b8, 0xbfae90], roofs: [0x4d4d52, 0x5b4a3e, 0x3e3f44, 0x6a4a3a] },
    look: { turbidity: 0.8 },
    swatch: ['#5f8d35', '#2e4a22', '#716e68', '#f3f6f9'],
  },

  volcanic: {
    name: 'Ember Caldera', jp: '灼熱火口', tag: 'Volcanic', tod: 'day',
    desc: 'Black basalt plains and jagged volcanic peaks rising out of a sea of molten lava. Ditching is not an option.',
    seed: 6660,
    terrain: { shape: 'island', radius: 7600, coastNoise: 1500, coastScale: 2600, coastWidth: 800, base: 30, hills: 60, mountains: 1600, mountainBias: 0.1, ridgePow: 2.1, craters: 10 },
    palette: {
      grassA: 0x3d3733, grassB: 0x2b2725, dry: 0x5a4a3c, dryAmt: 0.4, forest: 0x302a24,
      rock: 0x26211f, rockD: 0x161413, rockLine: 300, snow: 0x7a2c10, snowLine: 1050, snowSlope: [0.2, 0.5], peakSnow: 0.75,
      sand: 0x1c1816, seabed: 0x8a2a08, beach: 6, fields: [], fieldAmt: 0,
    },
    vegetation: { mix: [['deadtree', 0.65], ['boulder', 0.35]], density: 0.3, forest: -0.15, lone: 0.02, treeLine: 700, boulder: [0x2a2624, 0x1e1b1a] },
    water: { color: 0xff5a1a, emissive: 0xff3300, glow: 1.1, opacity: 1, rough: 0.55, rivers: 3, lakes: 4 },
    noShips: true,
    clouds: 0.6,
    town: { walls: [0x4a4644, 0x5a5450, 0x3d3a38], roofs: [0x2a2828, 0x6a2a1a, 0x1e1c1c] },
    look: { fogTint: 0x5a2a1a, tintAmt: 0.5, turbidity: 4, rayleigh: 0.5, fogFar: 0.75, hemiGround: 0x5a2a14 },
    swatch: ['#161413', '#3d3733', '#7a2c10', '#ff5a1a'],
  },

  savanna: {
    name: 'Golden Savanna', jp: '黄金草原', tag: 'Savanna', tod: 'day',
    desc: 'Endless golden grassland dotted with flat-topped acacias and granite outcrops. Wide open ground for hunting tank columns.',
    seed: 5150,
    terrain: { shape: 'island', radius: 8400, coastNoise: 900, coastScale: 3600, coastWidth: 1300, base: 40, hills: 55, mountains: 520, mountainBias: -0.2, ridgePow: 2.4 },
    palette: {
      grassA: 0xc9a85a, grassB: 0xa98a44, dry: 0xd8bf7a, dryAmt: 0.6, forest: 0x8a8040,
      rock: 0x8a7a68, rockD: 0x6a5c4e, rockLine: 260, snow: 0x8a7a68, snowLine: 1e9,
      sand: 0xd8c08a, seabed: 0x7a6a4a, beach: 8, fields: [0xb89a50, 0x9a8a44], fieldAmt: 0.2,
    },
    vegetation: { mix: [['acacia', 0.55], ['shrub', 0.3], ['boulder', 0.15]], density: 0.45, forest: -0.15, lone: 0.05, treeLine: 900,
      shrub: [0x7a7a3a, 0x8a8040], acacia: [0x5a7a2a, 0x6a8a30], boulder: [0x9a8a78, 0x7a6c5e], tint: { acacia: null } },
    water: { color: 0x2a5a60, opacity: 1 },
    clouds: 0.6,
    town: { walls: [0xc9a87a, 0xb08860, 0xd8c09a], roofs: [0x8a6a3a, 0x6a5030, 0xa08050] },
    look: { fogTint: 0xe8c890, tintAmt: 0.35, turbidity: 1.6, hemiGround: 0x9a8050 },
    swatch: ['#a98a44', '#c9a85a', '#d8bf7a', '#5a7a2a'],
  },

  swamp: {
    name: 'Mire Bayou', jp: '霧の沼地', tag: 'Wetland', tod: 'day',
    desc: 'A misty swamp of murky lakes, winding channels and drooping willow forest. Low terrain and short visibility.',
    seed: 8086,
    terrain: { shape: 'island', radius: 8000, coastNoise: 1800, coastScale: 2000, coastWidth: 600, base: 8, hills: 26, mountains: 260, mountainBias: -0.3, ridgePow: 2, lakes: true },
    palette: {
      grassA: 0x4f5e2c, grassB: 0x3c4a24, dry: 0x5e5a34, dryAmt: 0.3, forest: 0x27351b,
      rock: 0x4a4a3a, rockD: 0x3a3a2e, rockLine: 300, snow: 0x4a4a3a, snowLine: 1e9,
      sand: 0x5a5034, seabed: 0x2a3020, beach: 4, fields: [], fieldAmt: 0,
    },
    vegetation: { mix: [['willow', 0.55], ['broad', 0.3], ['deadtree', 0.15]], density: 1.2, forest: 0.2, lone: 0.03, treeLine: 400,
      broad: [0x2f4a22, 0x3a5426], willow: [0x3a5a2a, 0x4a6a30] },
    water: { color: 0x2c3a22, opacity: 1, rough: 0.35, rivers: 5, lakes: 14 },
    clouds: 1.3,
    town: { walls: [0x8a7a62, 0x6e5e48, 0xa09078], roofs: [0x3a3a32, 0x5a4a3a, 0x2e3a2e] },
    look: { fogTint: 0x9aa890, tintAmt: 0.5, turbidity: 1.4, fogFar: 0.55, fogNear: 0.4, hemiGround: 0x4a5a3a },
    swatch: ['#27351b', '#4f5e2c', '#2c3a22', '#9aa890'],
  },

  autumn: {
    name: 'Amber Woods', jp: '紅葉の森', tag: 'Autumn', tod: 'day',
    desc: 'Rolling hills ablaze with red, orange and gold forest, harvest fields and quiet villages under a crisp sky.',
    seed: 1010,
    terrain: { shape: 'island', radius: 7800, coastNoise: 1200, coastScale: 3000, coastWidth: 1400, base: 38, hills: 95, mountains: 700, ridgePow: 1.8 },
    palette: {
      grassA: 0x8a8a3a, grassB: 0x6e7030, dry: 0xa8884a, dryAmt: 0.5, forest: 0x6a3a1a,
      rock: 0x7a7068, rockD: 0x5a524c, rockLine: 500, snow: 0xeef0f2, snowLine: 900, peakSnow: 0.5,
      sand: 0xc8b88a, seabed: 0x857c5c, beach: 8, fields: [0xa89040, 0x8a7a36, 0xb8a050, 0x7a6a30], fieldAmt: 0.8,
    },
    vegetation: { mix: [['broad', 0.75], ['conifer', 0.25]], density: 1.1, forest: 0.05, lone: 0.015, treeLine: 700,
      broad: [0xffe2c8, 0xfff0d8], conifer: [0x2f4a24, 0x355427, 0x3b5d2b],
      tint: { broad: { h: [0.0, 0.12], s: [0.7, 0.95], l: [0.42, 0.6] } } },
    water: { color: 0x1d4458, opacity: 1 },
    clouds: 0.9,
    town: { walls: [0xe8e0cc, 0xd8cdb3, 0xcfc6b8, 0xbfae90], roofs: [0x8e3b2a, 0x7a3426, 0x5b4a3e, 0x4d4d52] },
    look: { fogTint: 0xe8d0b0, tintAmt: 0.2, turbidity: 1.1 },
    swatch: ['#b0301a', '#e0901e', '#d8b02a', '#6e7030'],
  },

  crystal: {
    name: 'Ubu Crystal Expanse', jp: '結晶原野', tag: 'Exotic', tod: 'day',
    desc: 'Where element 121 crystallised out of the bedrock: violet plains, terraced plateaus, glowing cyan seas and forests of giant crystal spires.',
    seed: 121,
    terrain: { shape: 'island', radius: 7900, coastNoise: 1400, coastScale: 2400, coastWidth: 900, base: 36, hills: 70, mountains: 1100, ridgePow: 2.2, mesas: 180, terrace: 55 },
    palette: {
      grassA: 0x4e3d70, grassB: 0x3a2e5a, dry: 0x6a4a8a, dryAmt: 0.4, forest: 0x2a2a4a,
      rock: 0x5a5a7a, rockD: 0x3a3a5a, rockLine: 350, snow: 0xc8f0ff, snowLine: 800, peakSnow: 0.7,
      sand: 0x8a7ab0, seabed: 0x1a6a8a, beach: 8, fields: [], fieldAmt: 0,
    },
    vegetation: { mix: [['crystal', 0.7], ['boulder', 0.3]], density: 0.6, forest: 0, lone: 0.02, treeLine: 1200,
      boulder: [0x6a5a8a, 0x4a3e6a], tint: { crystal: { h: [0.47, 0.86], s: [0.6, 0.95], l: [0.55, 0.78] } } },
    water: { color: 0x22d0e0, emissive: 0x0790b0, glow: 0.7, opacity: 0.88, rivers: 2, lakes: 5 },
    clouds: 0.8,
    town: { walls: [0xd8d8f0, 0xb8c0e0, 0xe8e0f8], roofs: [0x4a3a8a, 0x2a6a9a, 0x6a3a9a] },
    look: { fogTint: 0x8a70c0, tintAmt: 0.4, turbidity: 2.5, rayleigh: 2.2, hemiGround: 0x5a4a8a },
    swatch: ['#3a2e5a', '#6a4a8a', '#22d0e0', '#c8f0ff'],
  },

  mars: {
    name: 'Crimson Wastes', jp: '紅の荒野', tag: 'Martian', tod: 'day',
    desc: 'A dusty red alien world of impact craters, wind-carved ridges and boulder fields under a butterscotch sky. Almost no cover.',
    seed: 4242,
    terrain: { shape: 'island', radius: 8800, coastNoise: 600, coastScale: 4000, coastWidth: 1600, base: 44, hills: 80, mountains: 900, mountainBias: -0.1, ridgePow: 2.6, craters: 34 },
    palette: {
      grassA: 0xb0582e, grassB: 0x9a4a26, dry: 0xc87a4a, dryAmt: 0.5, forest: 0x8a3e20,
      rock: 0x6a3020, rockD: 0x4a2218, rockLine: 300, snow: 0xe8d8c8, snowLine: 1100, peakSnow: 0.5,
      sand: 0xc88a5a, seabed: 0x5a2a1a, beach: 6, fields: [], fieldAmt: 0,
    },
    vegetation: { mix: [['boulder', 1]], density: 0.35, forest: -0.1, lone: 0.04, treeLine: 2000, boulder: [0x7a3a22, 0x5a2a1a] },
    water: { color: 0x4a2014, opacity: 1, rough: 0.7 },
    noShips: true,
    clouds: 0.2,
    town: { walls: [0xd8d0c8, 0xc8c0b8, 0xb0a8a0], roofs: [0x8a8a90, 0x6a6a70, 0xa0a0a8] },
    look: { fogTint: 0xd89a6a, tintAmt: 0.65, turbidity: 8, rayleigh: 0.35, fogFar: 0.8, hemiGround: 0x9a5a3a },
    swatch: ['#4a2218', '#9a4a26', '#c87a4a', '#e8d8c8'],
  },
};

export const WORLD_ORDER = ['island', 'desert', 'arctic', 'archipelago', 'highlands', 'volcanic', 'savanna', 'swamp', 'autumn', 'crystal', 'mars'];
export const worldDef = (id) => WORLDS[id] || WORLDS.island;
