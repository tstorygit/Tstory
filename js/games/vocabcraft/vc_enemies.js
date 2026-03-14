// vc_enemies.js — Enemy type definitions and wave composition

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
    }
};

// Which enemy types can appear each wave — based on difficulty (1-10)
function wavePool(waveNum, difficulty) {
    const pool = ['normal'];
    if (waveNum >= 2 || difficulty >= 2) pool.push('fast');
    if (waveNum >= 3 || difficulty >= 2) pool.push('swarm');
    if (waveNum >= 5 || difficulty >= 3) pool.push('armored');
    if (waveNum >= 6 || difficulty >= 5) pool.push('healer');
    if (waveNum >= 8 || difficulty >= 7) pool.push('ghost');
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
            // Weight normal at ~40%, others equally share remaining 60%
            const weights = pool.map(id => id === 'normal' ? 2 : 1);
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
export function buildWaveEnemies(waveNum, difficulty, isBossWave, isEnraged, waypointSets, gameMode = 'hard') {
    // Game mode multipliers applied to ALL enemies (including boss)
    // hard: baseline (×1.0 hp, ×1.0 speed)
    // normal: half hp
    // easy: quarter hp, half speed
    const modeHpMult    = gameMode === 'easy' ? 0.25 : gameMode === 'normal' ? 0.5 : 1.0;
    const modeSpeedMult = gameMode === 'easy' ? 0.5  : 1.0;

    const diffMult   = Math.pow(1.15, difficulty - 1);
    const numPaths   = waypointSets.length;

    if (isBossWave) {
        const spawn = waypointSets[0][0];
        let hpBase = 18 * diffMult * Math.pow(1.15, waveNum) * 4;
        const armor = Math.max(0, Math.floor((waveNum - 2) / 2) + Math.floor((difficulty - 1) / 2)) + 3;
        const hp = hpBase * (isEnraged ? 1.5 : 1) * modeHpMult;
        return [{
            delay: 0,
            typeId: 'boss',
            isBoss: true,
            emoji: '👹',
            hp, maxHp: hp,
            armor: armor + (isEnraged ? 1 : 0),
            speed: (26 + difficulty * 2) * modeSpeedMult,
            regen: 0.01,
            immune: [],
            pathIdx: 0,
            x: spawn.x, y: spawn.y, wpIdx: 1,
            effects: { slow: 0, slowTimer: 0, poison: 0, poisonTimer: 0, poisonTick: 0 }
        }];
    }

    const slots       = 4 + Math.floor(waveNum * 1.2) + Math.floor(difficulty / 2);
    const composition = pickWaveComposition(slots, waveNum, difficulty);

    let hpBase = 18 * diffMult * Math.pow(1.15, waveNum);
    const baseArmor  = Math.floor((difficulty - 1) / 2) + Math.max(0, Math.floor((waveNum - 2) / 2));
    const enrageMult = isEnraged ? 1.5 : 1;

    const enemies  = [];
    let spawnIdx   = 0;

    composition.forEach(typeId => {
        const typeDef = ENEMY_TYPES[typeId];
        const count   = typeDef.spawnCount;

        for (let s = 0; s < count; s++) {
            const pathIdx = spawnIdx % numPaths;
            const spawn   = waypointSets[pathIdx][0];
            const hp      = hpBase * typeDef.hpMult * enrageMult * modeHpMult;
            const armor   = Math.max(0, baseArmor + typeDef.armorBonus) + (isEnraged ? 1 : 0);

            enemies.push({
                delay: spawnIdx * 0.7,
                typeId,
                isBoss: false,
                emoji: typeDef.emoji,
                label: typeDef.label,
                hp, maxHp: hp,
                armor,
                speed: (38 + difficulty * 2) * typeDef.speedMult * modeSpeedMult,
                regen: typeDef.regen,
                immune: [...typeDef.immune],
                pathIdx,
                x: spawn.x, y: spawn.y, wpIdx: 1,
                effects: { slow: 0, slowTimer: 0, poison: 0, poisonTimer: 0, poisonTick: 0 }
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