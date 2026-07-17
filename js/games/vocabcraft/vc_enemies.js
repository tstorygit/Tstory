// vc_enemies.js — Enemy type definitions and wave composition

// Global difficulty scale — tune this one value to make the game easier/harder.
const GLOBAL_SCALE = 0.75;  // 1.0 = full difficulty, 0.8 = 80% HP/speed/armor

export const ENEMY_TYPES = {
    normal: {
        id: 'normal',
        label: 'Grunt',
        emoji: '👾',
        hpMult: 1.0,
        speedMult: 1.0,
        armorBonus: 0,
        spawnCount: 1,
        immune: [],
        regen: 0,
        desc: 'Standard enemy. No special traits.'
    },
    fast: {
        id: 'fast',
        label: 'Dasher',
        emoji: '💨',
        hpMult: 0.55,
        speedMult: 2.3,
        armorBonus: 0,
        spawnCount: 1,
        immune: [],
        regen: 0,
        desc: 'Very fast but fragile. Punishes poor coverage.'
    },
    swarm: {
        id: 'swarm',
        label: 'Swarm',
        emoji: '🐝',
        hpMult: 0.32,
        speedMult: 1.1,
        armorBonus: 0,
        spawnCount: 3,
        immune: [],
        regen: 0,
        desc: 'Spawns 3 at once. Overwhelms single-target defenses.'
    },
    armored: {
        id: 'armored',
        label: 'Ironclad',
        emoji: '🛡️',
        hpMult: 1.6,
        speedMult: 0.75,
        armorBonus: 4,
        spawnCount: 1,
        immune: [],
        regen: 0,
        desc: '+4 Armor. Shrug off weak gems. Purple tears it apart.'
    },
    healer: {
        id: 'healer',
        label: 'Regenerator',
        emoji: '💚',
        hpMult: 1.3,
        speedMult: 0.9,
        armorBonus: 0,
        spawnCount: 1,
        immune: [],
        regen: 0.035,
        desc: 'Slowly regens HP. Needs burst damage to kill cleanly.'
    },
    ghost: {
        id: 'ghost',
        label: 'Specter',
        emoji: '👻',
        hpMult: 0.75,
        speedMult: 1.3,
        armorBonus: 0,
        spawnCount: 1,
        immune: ['slow', 'poison'],
        regen: 0,
        desc: 'Immune to Slow and Poison. Only damage gems work.'
    },

    // ── D6+ enemies ───────────────────────────────────────────────────────
    giant: {
        id: 'giant',
        label: 'Colossus',
        emoji: '🗿',
        hpMult: 4.0,
        speedMult: 0.45,
        armorBonus: 6,
        spawnCount: 1,
        immune: [],
        regen: 0,
        desc: '×4 HP, +6 Armor, very slow. Absorbs massive punishment.'
    },
    splitter: {
        id: 'splitter',
        label: 'Splitter',
        emoji: '🔱',
        hpMult: 1.8,
        speedMult: 0.85,
        armorBonus: 0,
        spawnCount: 1,
        immune: [],
        regen: 0,
        onDeath: 'split',   // special: spawns 2 fast children on death
        desc: 'Splits into two Dashers on death. Kill fast or face two.'
    },

    // ── D8+ enemies ───────────────────────────────────────────────────────
    manasucker: {
        id: 'manasucker',
        label: 'Mana Thief',
        emoji: '💸',
        hpMult: 1.1,
        speedMult: 1.2,
        armorBonus: 0,
        spawnCount: 1,
        immune: [],
        regen: 0,
        manaLeachMult: 2.5,  // drains 2.5× normal mana on exit
        desc: 'Steals 2.5× mana if it reaches your base. Top priority.'
    },
    berserker: {
        id: 'berserker',
        label: 'Berserker',
        emoji: '🔥',
        hpMult: 1.2,
        speedMult: 1.4,
        armorBonus: 0,
        spawnCount: 1,
        immune: [],
        regen: 0,
        berserk: true,  // special: speeds up as HP drops
        desc: 'Accelerates as HP drops — at 10% HP it moves at 3× speed.'
    },

    // ── D10+ enemies ──────────────────────────────────────────────────────
    cursed: {
        id: 'cursed',
        label: 'Cursed',
        emoji: '💀',
        hpMult: 1.5,
        speedMult: 1.0,
        armorBonus: 0,
        spawnCount: 1,
        immune: ['dmg_nonpurple'],  // special flag: 90% resist to non-purple damage
        regen: 0,
        desc: '90% damage reduction from non-Amethyst gems. Purple is the only answer.'
    },

    // ── D12+ enemies ──────────────────────────────────────────────────────
    swarmleader: {
        id: 'swarmleader',
        label: 'Swarm Lord',
        emoji: '👑',
        hpMult: 2.2,
        speedMult: 0.8,
        armorBonus: 2,
        spawnCount: 1,
        immune: [],
        regen: 0,
        spawnsSwarm: true,  // special: spawns a swarm unit every 3s while alive
        desc: 'Spawns swarm units while alive. Kill it first.'
    },

    // ── D14+ enemies ──────────────────────────────────────────────────────
    phantom: {
        id: 'phantom',
        label: 'Phantom',
        emoji: '🌫️',
        hpMult: 1.0,
        speedMult: 1.5,
        armorBonus: 0,
        spawnCount: 1,
        immune: ['slow', 'poison', 'dmg_nontrap'],  // only traps and mana leech deal full damage
        regen: 0,
        desc: 'Immune to slow, poison, and tower gems. Only traps and leech work.'
    },

    // ── D16+ enemies ──────────────────────────────────────────────────────
    titan: {
        id: 'titan',
        label: 'Titan',
        emoji: '🦣',
        hpMult: 8.0,
        speedMult: 0.5,
        armorBonus: 8,
        spawnCount: 1,
        immune: [],
        regen: 0.02,
        desc: '×8 HP, +8 Armor, regenerates. A boss-tier unit in regular waves.'
    }
};

/**
 * Threat weight for a given enemy type definition.
 * Used by enemyXpValue() in vc_engine — captures how hard a type is
 * WITHOUT using wave-scaled HP (which caused the exponential XP explosion).
 */
export function enemyTypeWeight(typeDef) {
    return typeDef.hpMult
         * typeDef.spawnCount
         * (1 + (typeDef.armorBonus || 0) / 8)
         * (1 + (typeDef.immune?.length || 0) * 0.3)
         * (typeDef.regen > 0 ? 1.2 : 1)
         * (typeDef.berserk ? 1.15 : 1)
         * (typeDef.spawnsSwarm ? 1.4 : 1)
         * (typeDef.manaLeachMult > 1 ? typeDef.manaLeachMult * 0.5 : 1);
}

// ─── Deterministic per-wave RNG ───────────────────────────────────────────────
// Wave composition must be identical in the pre-battle preview and in the
// actual battle, so all composition randomness is seeded from (wave, difficulty).
function _mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─── Scaling curves ───────────────────────────────────────────────────────────
// HP: linear × gentle compound. The old curve was pure 1.15^wave, which
// exploded (wave 45 ≈ 538× wave 1) while player income grew only linearly —
// the source of the mid-run difficulty wall. The new curve reaches
// wave 17 ≈ 9×, wave 45 ≈ 74×, matching achievable gem/economy growth.
export function waveHpBase(waveNum, difficulty) {
    const diffMult = Math.pow(1.15, difficulty - 1);
    return 18 * GLOBAL_SCALE * diffMult
        * (1 + 0.22 * (waveNum - 1))
        * Math.pow(1.045, waveNum - 1);
}

// Armor: grows every 4 waves instead of every 2 — flat armor is a hard counter
// to fast low-damage gems (traps), and the old rate made them useless late.
export function waveArmorBase(waveNum, difficulty) {
    return Math.max(0, Math.floor(
        ((difficulty - 1) / 2 + Math.max(0, (waveNum - 3) / 4)) * GLOBAL_SCALE
    ));
}

export function waveSlots(waveNum, difficulty) {
    return Math.round(5 + waveNum * 1.1 + difficulty * 0.6);
}

// Boss milestone multiplier — applied on top of waveHpBase.
export function bossHpMult(waveNum) {
    return 5 + waveNum * 0.1;
}

// Base mana bounty for killing a wave-appropriate normal enemy.
// Grows with the wave so income keeps pace with exponentially-priced gems;
// the old flat 10-mana bounty starved every build past the mid-game.
export function killManaBase(waveNum, difficulty) {
    return 6 + waveNum * 0.7 + difficulty * 1.5;
}

function _typeManaValue(typeDef, waveNum, difficulty, hpMult = 1) {
    // Tanky types pay more, swarm bodies pay less; sqrt keeps it moderate.
    return Math.max(1, Math.round(
        killManaBase(waveNum, difficulty)
        * Math.sqrt(Math.max(0.05, typeDef.hpMult))
        * (hpMult > 1 ? Math.sqrt(hpMult) : 1)
    ));
}

// ─── Enemy type unlock schedule ──────────────────────────────────────────────
// Wave thresholds shift earlier at higher difficulty, but never below the
// floor — no more Colossus ambushes on wave 1 of a D6 map (the old pool
// unlocked whole tiers by difficulty alone).
const UNLOCK_TABLE = [
    { id: 'fast',        wave: 2,  floor: 2  },
    { id: 'swarm',       wave: 3,  floor: 2  },
    { id: 'armored',     wave: 5,  floor: 3  },
    { id: 'healer',      wave: 7,  floor: 4  },
    { id: 'ghost',       wave: 9,  floor: 5  },
    { id: 'giant',       wave: 11, floor: 6  },
    { id: 'splitter',    wave: 13, floor: 7  },
    { id: 'manasucker',  wave: 15, floor: 8  },
    { id: 'berserker',   wave: 17, floor: 9  },
    { id: 'cursed',      wave: 21, floor: 12 },
    { id: 'swarmleader', wave: 25, floor: 14 },
    { id: 'phantom',     wave: 30, floor: 17 },
    { id: 'titan',       wave: 36, floor: 20 },
];

function _unlockWave(entry, difficulty) {
    return Math.max(entry.floor, entry.wave - Math.floor((difficulty - 1) / 2));
}

// Which enemy types can appear on a given wave.
export function wavePool(waveNum, difficulty) {
    const pool = ['normal'];
    for (const u of UNLOCK_TABLE) {
        if (waveNum >= _unlockWave(u, difficulty)) pool.push(u.id);
    }
    return pool;
}

// ─── Wave archetypes ─────────────────────────────────────────────────────────
// Every 5-wave block follows a readable rhythm:
//   pos 1–2: mixed build-up waves
//   pos 3:   RUSH spike  — many fast bodies at reduced HP
//   pos 4:   ELITE spike — few enemies at greatly increased HP
//   pos 0:   BOSS
// Spikes are intentional, previewed, and marked in the wave tracker.
export function getWaveMeta(waveNum, difficulty) {
    if (waveNum % 5 === 0) {
        return { theme: 'boss', isSpike: false, isBoss: true, slotMult: 1, hpMult: 1 };
    }
    const pos = waveNum % 5;
    if (pos === 3) return { theme: 'rush',  isSpike: true,  isBoss: false, slotMult: 1.35, hpMult: 0.85 };
    if (pos === 4) return { theme: 'elite', isSpike: true,  isBoss: false, slotMult: 0.60, hpMult: 1.70 };
    return { theme: 'mixed', isSpike: false, isBoss: false, slotMult: 1, hpMult: 1 };
}

const RUSH_TYPES  = ['fast', 'swarm', 'berserker', 'manasucker', 'phantom'];
const ELITE_TYPES = ['armored', 'healer', 'giant', 'splitter', 'swarmleader', 'cursed', 'titan'];

/**
 * Deterministic composition for a wave. The same (waveNum, difficulty) always
 * yields the same list, so the stage-select preview shows exactly what spawns.
 * @returns {{ theme, isSpike, isBoss, hpMult, typeIds: string[], newTypes: string[] }}
 */
export function composeWave(waveNum, difficulty, modifiers = []) {
    const meta = getWaveMeta(waveNum, difficulty);
    if (meta.isBoss) return { ...meta, typeIds: ['boss'], newTypes: [] };

    const rng  = _mulberry32(((waveNum * 2654435761) ^ (difficulty * 97)) >>> 0);
    const pool = wavePool(waveNum, difficulty);
    const densityMult = modifiers.includes('density') ? 1.5 : 1;
    const slots = Math.max(3, Math.round(waveSlots(waveNum, difficulty) * meta.slotMult * densityMult));

    // Types that unlock exactly this wave get a guaranteed showcase so the
    // player meets each new threat deliberately, not by lottery.
    const newTypes = UNLOCK_TABLE
        .filter(u => _unlockWave(u, difficulty) === waveNum)
        .map(u => u.id);

    let themed = [];
    if (meta.theme === 'rush')  themed = RUSH_TYPES.filter(t => pool.includes(t));
    if (meta.theme === 'elite') themed = ELITE_TYPES.filter(t => pool.includes(t));

    const typeIds = [];
    for (const t of newTypes) typeIds.push(t, t);
    while (typeIds.length < slots) {
        if (themed.length > 0 && rng() < 0.7) {
            typeIds.push(themed[Math.floor(rng() * themed.length)]);
        } else if (pool.length > 1 && rng() < 0.45) {
            const others = pool.slice(1);
            typeIds.push(others[Math.floor(rng() * others.length)]);
        } else {
            typeIds.push('normal');
        }
    }
    typeIds.length = slots; // trim if the showcase overfilled a small wave

    return { ...meta, typeIds, newTypes };
}

/**
 * Build the spawn entries for one wave.
 * @param {number} waveNum        current wave number (1-based)
 * @param {number} difficulty     stage difficulty (1-10)
 * @param {boolean} isBossWave
 * @param {boolean} isEnraged
 * @param {Array<Array<{x,y}>>} waypointSets  one array per path (pixel coords)
 */
export function buildWaveEnemies(waveNum, difficulty, isBossWave, isEnraged, waypointSets, gameMode = 'hard', loop = 1, enrageLevel = 1, modifiers = []) {
    // Game mode multipliers applied to ALL enemies (including boss)
    // hard: baseline (×1.0 hp, ×1.0 speed)
    // normal: half hp
    // easy: quarter hp, half speed
    const modeHpMult    = gameMode === 'easy' ? 0.25 : gameMode === 'normal' ? 0.5 : 1.0;
    const modeSpeedMult = gameMode === 'easy' ? 0.5  : 1.0;
    // GCFW roundtrip: +50% HP and speed per additional loop
    const loopMult = Math.pow(1.5, loop - 1);

    const numPaths   = waypointSets.length;

    if (isBossWave) {
        const spawn = waypointSets[0][0];
        const hpBase = waveHpBase(waveNum, difficulty) * bossHpMult(waveNum);
        const armor = Math.max(0, Math.floor((waveNum - 2) / 2) + Math.floor((difficulty - 1) / 2)) + 3;
        const bossEnrageMult = isEnraged ? (1 + enrageLevel * 0.1) : 1;
        const hp = hpBase * bossEnrageMult * modeHpMult * loopMult;
        const bossEntry = {
            delay: 0,
            typeId: 'boss',
            isBoss: true,
            emoji: '👹',
            hp, maxHp: hp,
            armor: armor + (isEnraged ? 1 : 0),
            speed: (26 + difficulty * 2) * GLOBAL_SCALE * modeSpeedMult * loopMult * (isEnraged ? (1 + enrageLevel * 0.05) : 1) / 40,
            regen: 0.01,
            immune: [],
            pathIdx: 0,
            x: spawn.x, y: spawn.y, wpIdx: 1,
            manaValue: Math.round(killManaBase(waveNum, difficulty) * 12),
            _xpWeight: 4.0 * 1.3,   // boss: ×4 HP, regen
            _waveNum: waveNum,
            _difficulty: difficulty,
            effects: { slow: 0, slowTimer: 0, poison: 0, poisonTimer: 0, poisonTick: 0, lastHit: '', flashTimer: 0, flashColor: '' }
        };
        if (modifiers.includes('shields'))    { bossEntry._shield = hp * 0.4; bossEntry._maxShield = hp * 0.4; }
        if (modifiers.includes('fast'))        { bossEntry.speed *= 1.4; }
        if (modifiers.includes('armored'))     { bossEntry.armor += 4; }
        if (modifiers.includes('ghost'))       { bossEntry.immune.push('slow', 'poison'); }
        if (modifiers.includes('no_poison'))   { if (!bossEntry.immune.includes('poison')) bossEntry.immune.push('poison'); }
        if (modifiers.includes('giant_waves')) { bossEntry.hp *= 2; bossEntry.maxHp *= 2; if (bossEntry._maxShield) { bossEntry._maxShield *= 2; bossEntry._shield *= 2; } }
        if (modifiers.includes('mana_drain'))  { bossEntry.manaLeachMult = 2; }
        if (modifiers.includes('cursed_all'))  { bossEntry.immune.push('dmg_nonpurple'); }
        return [bossEntry];
    }

    const comp        = composeWave(waveNum, difficulty, modifiers);
    const composition = comp.typeIds;

    const hpBase     = waveHpBase(waveNum, difficulty) * comp.hpMult;
    const baseArmor  = waveArmorBase(waveNum, difficulty);
    // Enrage multiplier: 1.0 + 0.1 per enrage level (Lv1=1.1×, Lv10=2.0×, Lv20=3.0×)
    const enrageMult = isEnraged ? (1 + enrageLevel * 0.1) : 1;
    // Rush waves spawn on a tighter cadence — the pressure is the point.
    const spawnGap   = comp.theme === 'rush' ? 0.45 : 0.7;

    const enemies  = [];
    let spawnIdx   = 0;

    composition.forEach(typeId => {
        const typeDef = ENEMY_TYPES[typeId];
        const count   = typeDef.spawnCount;

        for (let s = 0; s < count; s++) {
            const pathIdx = spawnIdx % numPaths;
            const spawn   = waypointSets[pathIdx][0];
            const hp      = hpBase * typeDef.hpMult * enrageMult * modeHpMult * loopMult;
            const armor   = Math.max(0, baseArmor + typeDef.armorBonus) + (isEnraged ? Math.ceil(enrageLevel / 3) : 0);

            const baseEnemy = {
                delay: spawnIdx * spawnGap,
                typeId,
                isBoss: false,
                emoji: typeDef.emoji,
                label: typeDef.label,
                hp, maxHp: hp,
                armor,
                speed: (38 + difficulty * 2) * GLOBAL_SCALE * typeDef.speedMult * modeSpeedMult * loopMult * (isEnraged ? (1 + enrageLevel * 0.05) : 1) / 40,
                baseSpeed: (38 + difficulty * 2) * GLOBAL_SCALE * typeDef.speedMult * modeSpeedMult * loopMult * (isEnraged ? (1 + enrageLevel * 0.05) : 1) / 40,
                regen: typeDef.regen,
                immune: [...typeDef.immune],
                onDeath: typeDef.onDeath || null,
                manaLeachMult: typeDef.manaLeachMult || 1,
                berserk: typeDef.berserk || false,
                spawnsSwarm: typeDef.spawnsSwarm || false,
                swarmSpawnTimer: typeDef.spawnsSwarm ? 3.0 : 0,
                pathIdx,
                x: spawn.x, y: spawn.y, wpIdx: 1,
                manaValue: _typeManaValue(typeDef, waveNum, difficulty, comp.hpMult),
                _xpWeight: enemyTypeWeight(typeDef),
                _waveNum: waveNum,
                _difficulty: difficulty,
                effects: { slow: 0, slowTimer: 0, poison: 0, poisonTimer: 0, poisonTick: 0, lastHit: '', flashTimer: 0, flashColor: '' }
            };

            // ── Apply run modifiers ──────────────────────────────────────────
            if (modifiers.includes('shields')) {
                baseEnemy._shield    = hp * 0.4;
                baseEnemy._maxShield = hp * 0.4;
            }
            if (modifiers.includes('regen')) {
                baseEnemy.regen = Math.max(baseEnemy.regen, 0.03);
            }
            if (modifiers.includes('fast')) {
                baseEnemy.speed     *= 1.4;
                baseEnemy.baseSpeed *= 1.4;
            }
            if (modifiers.includes('armored')) {
                baseEnemy.armor += 4;
            }
            if (modifiers.includes('ghost')) {
                if (!baseEnemy.immune.includes('slow'))   baseEnemy.immune.push('slow');
                if (!baseEnemy.immune.includes('poison')) baseEnemy.immune.push('poison');
            }
            if (modifiers.includes('no_poison')) {
                if (!baseEnemy.immune.includes('poison')) baseEnemy.immune.push('poison');
            }
            if (modifiers.includes('splitter') && typeId !== 'splitter') {
                baseEnemy.onDeath = 'split_mini';
            }
            if (modifiers.includes('berserker')) {
                baseEnemy.berserk = true;
                if (!baseEnemy.baseSpeed) baseEnemy.baseSpeed = baseEnemy.speed;
            }
            if (modifiers.includes('giant_waves')) {
                baseEnemy.hp    *= 2;
                baseEnemy.maxHp *= 2;
                // Refresh shield size too if shields also active
                if (baseEnemy._maxShield) { baseEnemy._maxShield *= 2; baseEnemy._shield *= 2; }
            }
            if (modifiers.includes('mana_drain')) {
                baseEnemy.manaLeachMult = (baseEnemy.manaLeachMult || 1) * 2;
            }
            if (modifiers.includes('swarm_all') && typeId !== 'swarm') {
                // Override spawnCount behaviour: mark for triple-spawn
                baseEnemy._swarmAll = true;
            }
            if (modifiers.includes('multipath')) {
                // Assign path round-robin across ALL paths (already handled by pathIdx % numPaths)
                // but override to spread more aggressively: cycle faster
                baseEnemy.pathIdx = spawnIdx % numPaths;
            }
            if (modifiers.includes('cursed_all')) {
                if (!baseEnemy.immune.includes('dmg_nonpurple')) baseEnemy.immune.push('dmg_nonpurple');
            }

            enemies.push(baseEnemy);
            spawnIdx++;
        }
    });

    // swarm_all: triple every enemy (add 2 extra copies of each marked enemy)
    if (modifiers.includes('swarm_all')) {
        const origLen = enemies.length;
        for (let i = 0; i < origLen; i++) {
            const src = enemies[i];
            if (!src._swarmAll) continue;
            for (let c = 0; c < 2; c++) {
                const clone = { ...src, effects: { ...src.effects }, immune: [...src.immune] };
                clone.delay += (c + 1) * 0.25;
                enemies.push(clone);
            }
        }
    }

    return enemies;
}
/**
 * Returns the EXACT per-wave preview for the stage-select UI.
 * Composition is deterministic (seeded from wave+difficulty), so what the
 * preview shows is precisely what spawns in battle — including spike waves.
 *
 * @param {number} totalWaves   Total waves for the stage
 * @param {number} difficulty   Stage difficulty (1-18)
 * @returns {Array<{wave, isBoss, isSpike, theme, slots, types}>}
 */
export function getWavePreview(totalWaves, difficulty) {
    const result = [];
    for (let waveNum = 1; waveNum <= totalWaves; waveNum++) {
        const meta   = getWaveMeta(waveNum, difficulty);
        const hpBase = waveHpBase(waveNum, difficulty);

        if (meta.isBoss) {
            const armor = Math.max(0,
                Math.floor((waveNum - 2) / 2) + Math.floor((difficulty - 1) / 2)
            ) + 3;
            const hp = Math.floor(hpBase * bossHpMult(waveNum));
            result.push({
                wave: waveNum, isBoss: true, isSpike: false, theme: 'boss',
                slots: 1,
                types: [{
                    typeId: 'boss', emoji: '👹', label: 'BOSS',
                    count: 1, hp, armor,
                    speed:  Math.floor((26 + difficulty * 2) * GLOBAL_SCALE / 40 * 100) / 100,
                    immune: [], regen: 0.01,
                    desc: 'Massive HP, armor, and regeneration. Needs sustained burst damage.'
                }]
            });
        } else {
            const comp      = composeWave(waveNum, difficulty);
            const baseArmor = waveArmorBase(waveNum, difficulty);
            const counts    = new Map();
            comp.typeIds.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));

            const types = [...counts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([typeId, slotCount]) => {
                    const def = ENEMY_TYPES[typeId];
                    return {
                        typeId,
                        emoji:  def.emoji,
                        label:  def.label,
                        count:  slotCount * def.spawnCount,
                        hp:     Math.floor(hpBase * comp.hpMult * def.hpMult),
                        armor:  Math.max(0, baseArmor + def.armorBonus),
                        speed:  Math.floor((38 + difficulty * 2) * GLOBAL_SCALE * def.speedMult / 40 * 100) / 100,
                        immune: def.immune,
                        regen:  def.regen,
                        desc:   def.desc
                    };
                });
            result.push({
                wave: waveNum, isBoss: false,
                isSpike: comp.isSpike, theme: comp.theme,
                slots: comp.typeIds.length, types
            });
        }
    }
    return result;
}