// js/games/tbb/tbb_enemies.js
// Enemy definitions and floor-based spawn logic

export const ENEMIES = [
    // ── Tier 0 (Floor 0+) ─────────────────────────────────────────
    { name: 'Training Dummy',    emoji: '🪆', baseLvl: 1,  baseHp: 30,  baseAtk: 4,  baseDef: 0, baseSpdMod: 0,  expYield: 12,  weakTo: 'slash',  resists: 'magic'  },
    { name: 'Cave Rat',          emoji: '🐀', baseLvl: 1,  baseHp: 25,  baseAtk: 5,  baseDef: 0, baseSpdMod: 2,  expYield: 14,  weakTo: 'magic',  resists: 'pierce' },
    { name: 'Slime',             emoji: '🫧', baseLvl: 1,  baseHp: 40,  baseAtk: 3,  baseDef: 1, baseSpdMod: -2, expYield: 16,  weakTo: 'pierce', resists: 'slash'  },
    // ── Tier 1 (Floor 5+) ─────────────────────────────────────────
    { name: 'Goblin Scout',      emoji: '👺', baseLvl: 3,  baseHp: 55,  baseAtk: 8,  baseDef: 1, baseSpdMod: 3,  expYield: 28,  weakTo: 'magic',  resists: 'slash'  },
    { name: 'Giant Moth',        emoji: '🦋', baseLvl: 3,  baseHp: 48,  baseAtk: 7,  baseDef: 0, baseSpdMod: 4,  expYield: 25,  weakTo: 'slash',  resists: 'pierce' },
    // ── Tier 2 (Floor 10+) ────────────────────────────────────────
    { name: 'Skeleton Archer',   emoji: '💀', baseLvl: 5,  baseHp: 65,  baseAtk: 11, baseDef: 2, baseSpdMod: 1,  expYield: 44,  weakTo: 'magic',  resists: 'pierce' },
    { name: 'Stone Golem Jr.',   emoji: '🪨', baseLvl: 5,  baseHp: 90,  baseAtk: 9,  baseDef: 5, baseSpdMod: -3, expYield: 48,  weakTo: 'slash',  resists: 'magic'  },
    // ── Tier 3 (Floor 15+) ────────────────────────────────────────
    { name: 'Forest Witch',      emoji: '🧙', baseLvl: 7,  baseHp: 80,  baseAtk: 15, baseDef: 2, baseSpdMod: 0,  expYield: 65,  weakTo: 'pierce', resists: 'magic'  },
    { name: 'Werewolf Pup',      emoji: '🐺', baseLvl: 7,  baseHp: 75,  baseAtk: 14, baseDef: 3, baseSpdMod: 5,  expYield: 62,  weakTo: 'slash',  resists: 'pierce' },
    // ── Tier 4 (Floor 20+) ────────────────────────────────────────
    { name: 'Thunder Sprite',    emoji: '⚡', baseLvl: 10, baseHp: 95,  baseAtk: 18, baseDef: 2, baseSpdMod: 6,  expYield: 90,  weakTo: 'pierce', resists: 'slash'  },
    { name: 'Armored Troll',     emoji: '👹', baseLvl: 10, baseHp: 130, baseAtk: 16, baseDef: 8, baseSpdMod: -2, expYield: 95,  weakTo: 'magic',  resists: 'slash'  },
    // ── Tier 5 (Floor 25+) ────────────────────────────────────────
    { name: 'Shadow Assassin',   emoji: '🥷', baseLvl: 13, baseHp: 105, baseAtk: 22, baseDef: 3, baseSpdMod: 8,  expYield: 120, weakTo: 'magic',  resists: 'slash'  },
    { name: 'Ice Elemental',     emoji: '🧊', baseLvl: 13, baseHp: 115, baseAtk: 20, baseDef: 5, baseSpdMod: 0,  expYield: 125, weakTo: 'slash',  resists: 'pierce' },
    // ── Tier 6 (Floor 30+) ────────────────────────────────────────
    { name: 'Cursed Knight',     emoji: '⚔️', baseLvl: 16, baseHp: 145, baseAtk: 26, baseDef: 9, baseSpdMod: 1,  expYield: 165, weakTo: 'magic',  resists: 'pierce' },
    { name: 'Harpy Queen',       emoji: '🦅', baseLvl: 16, baseHp: 120, baseAtk: 28, baseDef: 4, baseSpdMod: 9,  expYield: 160, weakTo: 'pierce', resists: 'slash'  },
    // ── Tier 7 (Floor 35+) ────────────────────────────────────────
    { name: 'Lava Salamander',   emoji: '🦎', baseLvl: 19, baseHp: 165, baseAtk: 31, baseDef: 7, baseSpdMod: 2,  expYield: 210, weakTo: 'slash',  resists: 'magic'  },
    { name: 'Mind Flayer',       emoji: '🧠', baseLvl: 19, baseHp: 140, baseAtk: 34, baseDef: 5, baseSpdMod: 3,  expYield: 220, weakTo: 'pierce', resists: 'magic'  },
    // ── Tier 8 (Floor 40+) ────────────────────────────────────────
    { name: 'Void Serpent',      emoji: '🐍', baseLvl: 22, baseHp: 180, baseAtk: 37, baseDef: 6, baseSpdMod: 7,  expYield: 270, weakTo: 'magic',  resists: 'slash'  },
    { name: 'Iron Colossus',     emoji: '🤖', baseLvl: 22, baseHp: 220, baseAtk: 33, baseDef:14, baseSpdMod: -4, expYield: 280, weakTo: 'pierce', resists: 'slash'  },
    // ── Tier 9 (Floor 45+) ────────────────────────────────────────
    { name: 'Dragon Whelp',      emoji: '🐉', baseLvl: 25, baseHp: 200, baseAtk: 42, baseDef: 9, baseSpdMod: 4,  expYield: 340, weakTo: 'slash',  resists: 'magic'  },
    { name: 'Lich Acolyte',      emoji: '💎', baseLvl: 25, baseHp: 175, baseAtk: 45, baseDef: 7, baseSpdMod: 2,  expYield: 350, weakTo: 'pierce', resists: 'magic'  },
    // ── Tier 10 (Floor 50+) ───────────────────────────────────────
    { name: 'Ancient Hydra',     emoji: '🌊', baseLvl: 30, baseHp: 260,  baseAtk: 50,  baseDef: 11, baseSpdMod: 1,  expYield: 430,  weakTo: 'magic',  resists: 'pierce' },
    { name: 'Demon Overlord',    emoji: '😈', baseLvl: 30, baseHp: 240,  baseAtk: 55,  baseDef: 10, baseSpdMod: 5,  expYield: 450,  weakTo: 'slash',  resists: 'pierce' },
    // ── Tier 11 (Floor 55+) ───────────────────────────────────────
    { name: 'Storm Phoenix',     emoji: '🦜', baseLvl: 34, baseHp: 290,  baseAtk: 60,  baseDef: 10, baseSpdMod: 10, expYield: 540,  weakTo: 'pierce', resists: 'magic'  },
    { name: 'Plague Zombie',     emoji: '🧟', baseLvl: 34, baseHp: 340,  baseAtk: 55,  baseDef: 15, baseSpdMod: -3, expYield: 560,  weakTo: 'slash',  resists: 'magic'  },
    // ── Tier 12 (Floor 60+) ───────────────────────────────────────
    { name: 'Frost Giant',       emoji: '🏔️', baseLvl: 38, baseHp: 400,  baseAtk: 63,  baseDef: 18, baseSpdMod: -2, expYield: 660,  weakTo: 'magic',  resists: 'slash'  },
    { name: 'Wyvern Scout',      emoji: '🪽', baseLvl: 38, baseHp: 320,  baseAtk: 70,  baseDef: 10, baseSpdMod: 12, expYield: 680,  weakTo: 'pierce', resists: 'slash'  },
    // ── Tier 13 (Floor 65+) ───────────────────────────────────────
    { name: 'Abyssal Fiend',     emoji: '👿', baseLvl: 42, baseHp: 370,  baseAtk: 76,  baseDef: 13, baseSpdMod: 4,  expYield: 800,  weakTo: 'slash',  resists: 'pierce' },
    { name: 'Coral Leviathan',   emoji: '🐋', baseLvl: 42, baseHp: 480,  baseAtk: 68,  baseDef: 20, baseSpdMod: 0,  expYield: 820,  weakTo: 'magic',  resists: 'slash'  },
    // ── Tier 14 (Floor 70+) ───────────────────────────────────────
    { name: 'Runic Titan',       emoji: '🗿', baseLvl: 46, baseHp: 560,  baseAtk: 72,  baseDef: 25, baseSpdMod: -4, expYield: 980,  weakTo: 'magic',  resists: 'pierce' },
    { name: 'Tempest Drake',     emoji: '🌪️', baseLvl: 46, baseHp: 420,  baseAtk: 85,  baseDef: 12, baseSpdMod: 14, expYield: 1000, weakTo: 'pierce', resists: 'magic'  },
    // ── Tier 15 (Floor 75+) ───────────────────────────────────────
    { name: 'Soul Harvester',    emoji: '💀', baseLvl: 50, baseHp: 500,  baseAtk: 92,  baseDef: 16, baseSpdMod: 6,  expYield: 1200, weakTo: 'slash',  resists: 'magic'  },
    { name: 'Crystal Golem',     emoji: '💠', baseLvl: 50, baseHp: 650,  baseAtk: 78,  baseDef: 30, baseSpdMod: -5, expYield: 1220, weakTo: 'magic',  resists: 'pierce' },
    // ── Tier 16 (Floor 80+) ───────────────────────────────────────
    { name: 'Inferno Arch-Djinn',emoji: '🔥', baseLvl: 55, baseHp: 580,  baseAtk: 100, baseDef: 18, baseSpdMod: 8,  expYield: 1450, weakTo: 'pierce', resists: 'slash'  },
    { name: 'Undead Colossus',   emoji: '☠️', baseLvl: 55, baseHp: 760,  baseAtk: 88,  baseDef: 28, baseSpdMod: -2, expYield: 1480, weakTo: 'slash',  resists: 'magic'  },
    // ── Tier 17 (Floor 85+) ───────────────────────────────────────
    { name: 'Void Archon',       emoji: '🌌', baseLvl: 60, baseHp: 680,  baseAtk: 112, baseDef: 20, baseSpdMod: 9,  expYield: 1750, weakTo: 'magic',  resists: 'slash'  },
    { name: 'Elder Basilisk',    emoji: '🐊', baseLvl: 60, baseHp: 820,  baseAtk: 98,  baseDef: 32, baseSpdMod: 2,  expYield: 1780, weakTo: 'pierce', resists: 'magic'  },
    // ── Tier 18 (Floor 90+) ───────────────────────────────────────
    { name: 'Celestial Seraph',  emoji: '👼', baseLvl: 65, baseHp: 750,  baseAtk: 125, baseDef: 22, baseSpdMod: 13, expYield: 2100, weakTo: 'slash',  resists: 'pierce' },
    { name: 'Primordial Golem',  emoji: '🌋', baseLvl: 65, baseHp: 980,  baseAtk: 108, baseDef: 38, baseSpdMod: -4, expYield: 2150, weakTo: 'magic',  resists: 'slash'  },
    // ── Tier 19 (Floor 95+) ───────────────────────────────────────
    { name: 'Chaos Dragon',      emoji: '🐲', baseLvl: 70, baseHp: 900,  baseAtk: 140, baseDef: 25, baseSpdMod: 11, expYield: 2600, weakTo: 'pierce', resists: 'magic'  },
    { name: 'The Final Lich',    emoji: '🔮', baseLvl: 70, baseHp: 1100, baseAtk: 130, baseDef: 30, baseSpdMod: 5,  expYield: 2700, weakTo: 'slash',  resists: 'pierce' },
];

// How many enemies per tier (Tiers 0-19)
const TIER_SIZES = [3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
const TIER_UNLOCK_INTERVAL = 5; // new tier every 5 floors
const BASE_SPD = 10;

let _lastSpawnedName = null;

export function spawnEnemy(floor) {
    const unlockTier = Math.floor(floor / TIER_UNLOCK_INTERVAL);

    // Build eligible pool up to unlockTier
    const pool = [];
    let idx = 0;
    for (let t = 0; t < TIER_SIZES.length && t <= unlockTier; t++) {
        const end = Math.min(idx + TIER_SIZES[t], ENEMIES.length);
        for (let i = idx; i < end; i++) pool.push(ENEMIES[i]);
        idx += TIER_SIZES[t];
    }
    if (!pool.length) pool.push(ENEMIES[0]);

    // Avoid same enemy twice in a row if possible
    let selection = pool;
    if (_lastSpawnedName && pool.length > 1) {
        const filtered = pool.filter(e => e.name !== _lastSpawnedName);
        if (filtered.length) selection = filtered;
    }
    const template = selection[Math.floor(Math.random() * selection.length)];
    _lastSpawnedName = template.name;

    // Scale level with floor
    let spawnLvl;
    if (floor === 0) {
        spawnLvl = template.baseLvl;
    } else {
        const ef = Math.min(floor, 99);
        const minLvl = Math.max(template.baseLvl, Math.round(template.baseLvl + ef / 8));
        const maxLvl = Math.max(minLvl + 1, Math.round(template.baseLvl + ef / 4));
        spawnLvl = minLvl + Math.floor(Math.random() * (maxLvl - minLvl + 1));
    }
    spawnLvl = Math.max(1, Math.min(999, spawnLvl));

    const lvlMult = 1 + (spawnLvl - template.baseLvl) * 0.08;
    return {
        name:     template.name,
        emoji:    template.emoji,
        level:    spawnLvl,
        maxHp:    Math.round(template.baseHp  * lvlMult),
        atk:      Math.round(template.baseAtk * lvlMult),
        def:      Math.round(template.baseDef * lvlMult),
        spd:      Math.max(1, BASE_SPD + template.baseSpdMod + Math.floor(spawnLvl / 4)),
        expYield: Math.round(template.expYield * lvlMult),
        weakTo:   template.weakTo,
        resists:  template.resists,
    };
}