// vc_enemies.js — Enemy type definitions and wave composition

// Global difficulty scale — tune this one value to make the game easier/harder.
const GLOBAL_SCALE = 0.60;  // 1.0 = full difficulty, 0.8 = 80% HP/speed/armor

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

// Which enemy types can appear each wave — based on difficulty (1-10)
function wavePool(waveNum, difficulty) {
    const pool = ['normal'];
    if (waveNum >= 2  || difficulty >= 2)  pool.push('fast');
    if (waveNum >= 3  || difficulty >= 2)  pool.push('swarm');
    if (waveNum >= 5  || difficulty >= 3)  pool.push('armored');
    if (waveNum >= 6  || difficulty >= 5)  pool.push('healer');
    if (waveNum >= 8  || difficulty >= 7)  pool.push('ghost');
    // New enemy types — higher difficulty/wave thresholds
    if (waveNum >= 10 || difficulty >= 6)  pool.push('giant');
    if (waveNum >= 12 || difficulty >= 6)  pool.push('splitter');
    if (waveNum >= 14 || difficulty >= 8)  pool.push('manasucker');
    if (waveNum >= 16 || difficulty >= 8)  pool.push('berserker');
    if (waveNum >= 20 || difficulty >= 10) pool.push('cursed');
    if (waveNum >= 24 || difficulty >= 12) pool.push('swarmleader');
    if (waveNum >= 30 || difficulty >= 14) pool.push('phantom');
    if (waveNum >= 36 || difficulty >= 16) pool.push('titan');
    return pool;
}

// Pick enemy types for a wave — weighted so new types appear occasionally,
// not every single enemy. Waves feel varied but readable.
function pickWaveComposition(totalSlots, waveNum, difficulty) {
    const pool = wavePool(waveNum, difficulty);
    const result =[];

    for (let i = 0; i < totalSlots; i++) {
        // Bias toward normal for first few slots, then random from pool
        let pick;
        if (pool.length === 1 || (i === 0 && waveNum <= 3)) {
            pick = 'normal';
        } else {
            // Weight: normal=4, common=2, rare/powerful=1
            const rareTypes = new Set(['giant','titan','swarmleader','phantom','cursed']);
            const commonTypes = new Set(['fast','swarm','armored','healer','ghost','splitter','manasucker','berserker']);
            const weights = pool.map(id =>
                id === 'normal' ? 4 : rareTypes.has(id) ? 1 : commonTypes.has(id) ? 2 : 1
            );
            const total = weights.reduce((a, b) => a + b, 0);
            let r = Math.random() * total;
            let idx = 0;
            for (let w of weights) { r -= w; if (r <= 0) break; idx++; }
            pick = pool[Math.min(idx, pool.length - 1)];
        }
        result.push(pick);
    }
    return result;
}

/**
 * Build the spawn entries for one wave.
 * @param {number} waveNum        current wave number (1-based)
 * @param {number} difficulty     stage difficulty (1-10)
 * @param {boolean} isBossWave
 * @param {boolean} isEnraged
 * @param {Array<Array<{x,y}>>} waypointSets  one array per path (pixel coords)
 */
export function buildWaveEnemies(waveNum, difficulty, isBossWave, isEnraged, waypointSets, gameMode = 'hard', loop = 1, enrageLevel = 1) {
    // Game mode multipliers applied to ALL enemies (including boss)
    // hard: baseline (×1.0 hp, ×1.0 speed)
    // normal: half hp
    // easy: quarter hp, half speed
    const modeHpMult    = gameMode === 'easy' ? 0.25 : gameMode === 'normal' ? 0.5 : 1.0;
    const modeSpeedMult = gameMode === 'easy' ? 0.5  : 1.0;
    // GCFW roundtrip: +50% HP and speed per additional loop
    const loopMult = Math.pow(1.5, loop - 1);

    const diffMult   = Math.pow(1.15, difficulty - 1);
    const numPaths   = waypointSets.length;

    if (isBossWave) {
        const spawn = waypointSets[0][0];
        let hpBase = 18 * GLOBAL_SCALE * diffMult * Math.pow(1.15, waveNum) * 4;
        const armor = Math.max(0, Math.floor((waveNum - 2) / 2) + Math.floor((difficulty - 1) / 2)) + 3;
        const bossEnrageMult = isEnraged ? (1 + enrageLevel * 0.1) : 1;
        const hp = hpBase * bossEnrageMult * modeHpMult * loopMult;
        return [{
            delay: 0,
            typeId: 'boss',
            isBoss: true,
            emoji: '👹',
            hp, maxHp: hp,
            armor: armor + (isEnraged ? 1 : 0),
            speed: (26 + difficulty * 2) * GLOBAL_SCALE * modeSpeedMult * loopMult * (isEnraged ? (1 + enrageLevel * 0.05) : 1),
            regen: 0.01,
            immune: [],
            pathIdx: 0,
            x: spawn.x, y: spawn.y, wpIdx: 1,
            effects: { slow: 0, slowTimer: 0, poison: 0, poisonTimer: 0, poisonTick: 0, lastHit: '', flashTimer: 0, flashColor: '' }
        }];
    }

    const slots       = 4 + Math.floor(waveNum * 1.2) + Math.floor(difficulty / 2);
    const composition = pickWaveComposition(slots, waveNum, difficulty);

    let hpBase = 18 * GLOBAL_SCALE * diffMult * Math.pow(1.15, waveNum);
    const baseArmor  = Math.floor(((difficulty - 1) / 2 + Math.max(0, Math.floor((waveNum - 2) / 2))) * GLOBAL_SCALE);
    // Enrage multiplier: 1.0 + 0.1 per enrage level (Lv1=1.1×, Lv10=2.0×, Lv20=3.0×)
    const enrageMult = isEnraged ? (1 + enrageLevel * 0.1) : 1;

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

            enemies.push({
                delay: spawnIdx * 0.7,
                typeId,
                isBoss: false,
                emoji: typeDef.emoji,
                label: typeDef.label,
                hp, maxHp: hp,
                armor,
                speed: (38 + difficulty * 2) * GLOBAL_SCALE * typeDef.speedMult * modeSpeedMult * loopMult * (isEnraged ? (1 + enrageLevel * 0.05) : 1),
                baseSpeed: (38 + difficulty * 2) * GLOBAL_SCALE * typeDef.speedMult * modeSpeedMult * loopMult * (isEnraged ? (1 + enrageLevel * 0.05) : 1),
                regen: typeDef.regen,
                immune: [...typeDef.immune],
                onDeath: typeDef.onDeath || null,
                manaLeachMult: typeDef.manaLeachMult || 1,
                berserk: typeDef.berserk || false,
                spawnsSwarm: typeDef.spawnsSwarm || false,
                swarmSpawnTimer: typeDef.spawnsSwarm ? 3.0 : 0,
                pathIdx,
                x: spawn.x, y: spawn.y, wpIdx: 1,
                effects: { slow: 0, slowTimer: 0, poison: 0, poisonTimer: 0, poisonTick: 0, lastHit: '', flashTimer: 0, flashColor: '' }
            });
            spawnIdx++;
        }
    });

    return enemies;
}
/**
 * Returns a deterministic per-wave preview for the stage-select UI.
 * Shows which enemy types can appear each wave with their real stats at `difficulty`.
 *
 * @param {number} totalWaves   Total waves for the stage (e.g. 5 + difficulty + bonusWaves)
 * @param {number} difficulty   Stage difficulty 1-10
 * @returns {Array<WavePreview>}
 */
export function getWavePreview(totalWaves, difficulty) {
    const diffMult  = Math.pow(1.15, difficulty - 1);
    const baseArmor = Math.floor((difficulty - 1) / 2);

    const result = [];
    for (let waveNum = 1; waveNum <= totalWaves; waveNum++) {
        const isBossWave = (waveNum % 5 === 0);
        const hpBase     = 18 * diffMult * Math.pow(1.15, waveNum);

        if (isBossWave) {
            const armor = Math.max(0,
                Math.floor((waveNum - 2) / 2) + Math.floor((difficulty - 1) / 2)
            ) + 3;
            const hp = Math.floor(hpBase * 4);
            result.push({
                wave: waveNum, isBoss: true,
                slots: 1,
                types: [{
                    typeId: 'boss', emoji: '👹', label: 'BOSS',
                    count: 1, hp, armor,
                    speed: Math.floor(26 + difficulty * 2),
                    immune: [], regen: 0.01,
                    desc: 'Massive HP, armor, and regeneration. Needs sustained burst damage.'
                }]
            });
        } else {
            const pool  = wavePool(waveNum, difficulty);
            const slots = 4 + Math.floor(waveNum * 1.2) + Math.floor(difficulty / 2);
            const types = pool.map(typeId => {
                const def = ENEMY_TYPES[typeId];
                return {
                    typeId,
                    emoji:  def.emoji,
                    label:  def.label,
                    count:  def.spawnCount,
                    hp:     Math.floor(hpBase * def.hpMult),
                    armor:  Math.max(0, baseArmor + def.armorBonus),
                    speed:  Math.floor((38 + difficulty * 2) * def.speedMult),
                    immune: def.immune,
                    regen:  def.regen,
                    desc:   def.desc
                };
            });
            result.push({ wave: waveNum, isBoss: false, slots, types });
        }
    }
    return result;
}