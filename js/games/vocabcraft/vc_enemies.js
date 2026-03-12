// vc_enemies.js — Enemy type definitions and wave composition

export const ENEMY_TYPES = {
    normal: {
        id: 'normal',
        label: 'Grunt',
        emoji: '👾',
        hpMult: 1.0,
        speedMult: 1.0,
        armorBonus: 0,
        spawnCount: 1,       // how many per "slot" in the wave
        rewardMult: 1.0,
        immune: [],          // can be: 'slow', 'poison'
        regen: 0,            // HP regen per second (fraction of maxHp)
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
        rewardMult: 1.2,
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
        spawnCount: 3,       // 3 spawn per slot — overwhelms single-target towers
        rewardMult: 0.5,
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
        armorBonus: 4,       // extra flat armor on top of wave base
        spawnCount: 1,
        rewardMult: 1.8,
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
        rewardMult: 1.5,
        immune: [],
        regen: 0.035,        // regens 3.5% maxHp per second — punishes slow DPS
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
        rewardMult: 1.4,
        immune: ['slow', 'poison'],   // immune to blue + green
        regen: 0,
        desc: 'Immune to Slow and Poison. Only damage gems work.'
    }
};

// Which enemy types can appear each wave (cumulative unlock)
function wavePool(waveNum, tier) {
    const pool = ['normal'];
    if (waveNum >= 3 || tier >= 2) pool.push('fast');
    if (waveNum >= 4 || tier >= 2) pool.push('swarm');
    if (waveNum >= 6 || tier >= 3) pool.push('armored');
    if (waveNum >= 7 || tier >= 3) pool.push('healer');
    if (waveNum >= 8 || tier >= 4) pool.push('ghost');
    return pool;
}

// Pick enemy types for a wave — weighted so new types appear occasionally,
// not every single enemy. Waves feel varied but readable.
function pickWaveComposition(totalSlots, waveNum, tier) {
    const pool = wavePool(waveNum, tier);
    const result = [];

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
 * Returns an array of enemy objects ready to be pushed into spawnQueue.
 */
export function buildWaveEnemies(waveNum, tier, isBossWave, isEnraged, waypoints) {
    if (isBossWave) {
        // Boss is always a single massive armored unit — no type system
        let hpBase = 18 * Math.pow(1.18, tier - 1) * Math.pow(1.15, waveNum);
        hpBase *= 4;
        const armor = Math.max(0, Math.floor((waveNum - 2) / 2) + (tier - 1)) + 3;
        const hp = hpBase * (isEnraged ? 1.5 : 1);
        return [{
            delay: 0,
            typeId: 'boss',
            isBoss: true,
            emoji: '👹',
            hp, maxHp: hp,
            armor: armor + (isEnraged ? 1 : 0),
            speed: 26 + (tier * 2),
            rewardMult: (isEnraged ? 3 : 1) * 8,
            regen: 0.01,     // boss slowly regens too
            immune: [],
            x: waypoints[0].x, y: waypoints[0].y, wpIdx: 1,
            effects: { slow: 0, slowTimer: 0, poison: 0, poisonTick: 0 }
        }];
    }

    // Normal wave: pick how many slots, then expand swarm types
    const slots = 4 + Math.floor(waveNum * 1.2) + tier;
    const composition = pickWaveComposition(slots, waveNum, tier);

    // Base HP and armor for this wave
    let hpBase = 18 * Math.pow(1.18, tier - 1) * Math.pow(1.15, waveNum);
    const baseArmor = Math.max(0, Math.floor((waveNum - 2) / 2) + (tier - 1));
    const enrageMult = isEnraged ? 1.5 : 1;
    const reward = isEnraged ? 3 : 1;

    const enemies = [];
    let spawnIdx = 0;

    composition.forEach(typeId => {
        const typeDef = ENEMY_TYPES[typeId];
        const count = typeDef.spawnCount;

        for (let s = 0; s < count; s++) {
            const hp = hpBase * typeDef.hpMult * enrageMult;
            const armor = Math.max(0, baseArmor + typeDef.armorBonus) + (isEnraged ? 1 : 0);

            enemies.push({
                delay: spawnIdx * 0.7,
                typeId,
                isBoss: false,
                emoji: typeDef.emoji,
                label: typeDef.label,
                hp, maxHp: hp,
                armor,
                speed: (38 + tier * 2) * typeDef.speedMult,
                rewardMult: reward * typeDef.rewardMult,
                regen: typeDef.regen,
                immune: [...typeDef.immune],
                x: waypoints[0].x, y: waypoints[0].y, wpIdx: 1,
                effects: { slow: 0, slowTimer: 0, poison: 0, poisonTick: 0 }
            });
            spawnIdx++;
        }
    });

    return enemies;
}
