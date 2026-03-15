import { SKILL_DEFS } from './vc_meta.js';
import { buildWaveEnemies, ENEMY_TYPES } from './vc_enemies.js';

export const GEMS = {
    red:    { label: 'Ruby',     color: '#e74c3c', type: 'dmg',   baseDmg: 18, speed: 1.5 },
    blue:   { label: 'Sapphire', color: '#3498db', type: 'slow',  baseDmg: 4,  speed: 1.0, baseSlow: 0.18 },
    green:  { label: 'Emerald',  color: '#2ecc71', type: 'poison',baseDmg: 4,  speed: 1.0, basePoison: 1.5 },
    orange: { label: 'Topaz',    color: '#f39c12', type: 'mana',  baseDmg: 6,  speed: 1.2, baseMana: 0.4 }, // Compensating for lack of Amplifiers
    yellow: { label: 'Citrine',  color: '#f1c40f', type: 'crit',  baseDmg: 8,  speed: 1.0, baseCrit: 0.10, baseMult: 3 },
    purple: { label: 'Amethyst', color: '#9b59b6', type: 'armor', baseDmg: 5,  speed: 1.0, baseTear: 0.2 }
};

export const CONSTANTS = {
    // Building costs — match GCFW table exactly:
    towerCostBase: 75,
    towerCostInc: 38,
    trapCostBase: 75,
    trapCostInc: 25,
    gemBaseCost: 60,        // cost of a fresh level-1 gem
    gemCombineCost: 240,    // fixed combine fee
    vocabPenalty: 10,
    // Enemy exit drains mana: boss=15% of maxMana, normal=5%, scaled
    exitDrainNormal: 0.05,
    exitDrainBoss:   0.15,
    towerBaseRange: 2.5,    // in tiles — multiplied by tileSize at render time
    trapBaseRange:  0.6     // in tiles (slightly wider than 0.5 to catch corner-cutters)
};

// ─── Building cost functions ─────────────────────────────────────────────────
export function towerCost(towerCount, skills = {}) {
    const base = CONSTANTS.towerCostBase + towerCount * CONSTANTS.towerCostInc;
    const disc = 1 - ((skills.towerDiscount || 0) * 0.01);
    return Math.floor(base * disc);
}
export function trapCost(trapCount, skills = {}) {
    const base = CONSTANTS.trapCostBase + trapCount * CONSTANTS.trapCostInc;
    const disc = 1 - ((skills.trapDiscount || 0) * 0.01);
    return Math.floor(base * disc);
}

// ─── Gemcraft: Frostborn Wrath exact scaling ────────────────────────────────
export function gemCombineCost(skills = {}) {
    const disc = 1 - ((skills.combineDiscount || 0) * 0.01);
    return Math.floor(CONSTANTS.gemCombineCost * disc);
}
export function gemBaseCost(skills = {}) {
    return CONSTANTS.gemBaseCost;
}
export function gemTotalCostColor(color, level, skills = {}) {
    const colorDisc = 1 - ((skills[color + 'Cost'] || 0) * 0.01);
    const base    = Math.floor(gemBaseCost(skills) * colorDisc);
    const combine = Math.floor(gemCombineCost(skills) * colorDisc);
    if (level <= 1) return base;
    function inner(n) {
        if (n <= 1) return base;
        return 2 * inner(n - 1) + combine;
    }
    return inner(level);
}
export function gemUpgradeCost(color, level, skills = {}) {
    const colorDisc = 1 - ((skills[color + 'Cost'] || 0) * 0.01);
    const combine   = Math.floor(gemCombineCost(skills) * colorDisc);
    return gemTotalCostColor(color, level, skills) + combine;
}

export function gemDamage(gem, gemData, skills = {}) {
    const resonance = 1 + ((skills.resonance || 0) * 0.03);
    return gemData.baseDmg * Math.pow(1.54, gem.level - 1) * resonance;
}
export function gemFireSpeed(gem, gemData, skills = {}) {
    const haste = 1 + ((skills.haste || 0) * 0.02);
    // GCFW caps speeds very high (30+). Removed the stifling 4.0 cap.
    return Math.min(30.0, gemData.speed * Math.pow(1.18, gem.level - 1) * haste);
}
export function gemRange(gem, isTrap = false, tileSize = 40) {
    const baseTiles = isTrap ? CONSTANTS.trapBaseRange : CONSTANTS.towerBaseRange;
    return Math.floor(baseTiles * tileSize * Math.pow(1.08, gem.level - 1));
}
export function gemCritChance(gem) {
    return Math.min(0.8, GEMS[gem.color].baseCrit + 0.04 * gem.level);
}
export function gemCritMult(gem) {
    return GEMS[gem.color].baseMult * Math.pow(1.38, gem.level - 1);
}
export function gemPoisonDps(gem, gemData) {
    return gemData.basePoison * Math.pow(1.81, gem.level - 1);
}
export function gemSlowAmount(gem, gemData) {
    // GCFW: G1=18% slow, both % and duration grow per grade. Skill only boosts duration.
    return Math.min(0.92, gemData.baseSlow * Math.pow(1.36, gem.level - 1));
}
export function gemManaDrain(gem, gemData) {
    return gemData.baseMana * Math.pow(1.38, gem.level - 1);
}
export function gemArmorTear(gem, gemData) {
    return gemData.baseTear * Math.pow(1.90, gem.level - 1);
}

/**
 * Derive XP value from an enemy's actual stats.
 * All scaling (difficulty, wave, enrage) is already baked into the enemy's
 * maxHp/armor/speed at spawn time, so XP automatically tracks true threat.
 *
 * effectiveHp  = maxHp × armor_factor × regen_factor
 * speedFactor  = 0.8 + speed/200        (~1.0 normal, ~1.15 fast)
 * immuneFactor = 1 + immunities × 0.25  (+25% per immunity)
 * xp = effectiveHp × speedFactor × immuneFactor / NORMALISER
 */
const XP_NORMALISER = 4.14;

export function enemyXpValue(enemy) {
    const armorFactor  = 1 + (enemy.armor || 0) * 0.15;
    const regenFactor  = 1 + (enemy.regen || 0) * 8;
    const effectiveHp  = enemy.maxHp * armorFactor * regenFactor;
    const speedFactor  = 0.8 + (enemy.speed || 60) / 200;
    const immuneFactor = 1 + (enemy.immune?.length || 0) * 0.25;
    return Math.max(1, effectiveHp * speedFactor * immuneFactor / XP_NORMALISER);
}

export class VcEngine {
    constructor(mapData, meta, difficulty, onUpdate, onGameOver, gameMode = 'hard') {
        this.map = mapData;
        this.meta = meta;
        this.difficulty = difficulty;
        this.gameMode = gameMode;
        this.onUpdate = onUpdate;
        this.onGameOver = onGameOver;

        const baseWaves = 10 + 7 * difficulty;
        const bonusWaves = (meta.skills.bonusWaves || 0) * 3;

        const startMana = 300 + ((meta.skills.startMana || 0) * 30);
        this.state = {
            mana: startMana,
            poolLevel: 1,            // GCFW pool level — increases when mana fills the cap
            poolCap: startMana,      // current capacity — fills up, triggers level-up, then grows
            wave: 0,
            maxWaves: baseWaves + bonusWaves,
            status: 'planning',
            combo: 0,
            comboDecayTimer: 0,  // seconds since last kill — combo decays after 5s
            xpEarned: 0,
            _waveLeaked: false,
            _manaAtWaveStart: startMana
        };

        this.enemies = [];
        this.projectiles =[];
        this.structures = [];

        this.spawnQueue =[];
        this._nextSpawnDelay = 0;
        this._lastClearedWave = -1;
        this.lastTick = performance.now();
        this.raf = null;
        this._loopGen = 0;
        this.speedMult = 1;
        this.selectedEnemyId = null;

        this.buffs = {
            dmgMult: 1.0  // recalculated each frame from combo
        };

        // On mobile, browsers throttle RAF when the page is hidden (tab switch,
        // app backgrounded, screen lock). When the page becomes visible again the
        // accumulated time gap would produce a huge dt spike and also risks waking
        // a stale loop. Reset lastTick on visibility restore so dt stays sane.
        this._onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                this.lastTick = performance.now();
            }
        };
        document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    start() {
        this._loopGen = (this._loopGen || 0) + 1;
        this.state.status = 'playing';
        this.lastTick = performance.now();
        cancelAnimationFrame(this.raf);
        this._startLoop(this._loopGen);
    }

    pause() { this.state.status = 'paused'; }
    resume() {
        if (this.state.status === 'playing') return; // already running — no-op
        this._loopGen = (this._loopGen || 0) + 1;
        this.state.status = 'playing';
        this.lastTick = performance.now();
        cancelAnimationFrame(this.raf);
        this._startLoop(this._loopGen);
    }
    stop() {
        this._loopGen = (this._loopGen || 0) + 1; // invalidate any pending RAF
        cancelAnimationFrame(this.raf);
        document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }

    // Each call to _startLoop captures the current generation.
    // If _loopGen has advanced by the time the RAF fires, the callback exits silently.
    _startLoop(gen) {
        this.raf = requestAnimationFrame(() => this._loopTick(gen));
    }

    _loopTick(gen) {
        if (gen !== this._loopGen) return;          // stale — a newer loop took over
        if (this.state.status !== 'playing') return; // paused/stopped

        const now = performance.now();
        let dt = (now - this.lastTick) / 1000;
        this.lastTick = now;

        if (dt > 0.1) dt = 0.1;
        dt *= this.speedMult;

        // Combo decay: window = 5s base + 0.5s per Scholar's Grace level
        const comboWindow = 5 + (this.meta.skills.comboKeep || 0) * 1.0;
        this.state.comboDecayWindow = comboWindow;  // expose for UI progress bar
        if (this.state.combo > 0) {
            this.state.comboDecayTimer += dt;
            if (this.state.comboDecayTimer >= comboWindow) {
                this.state.combo = Math.max(0, this.state.combo - 1);
                this.state.comboDecayTimer = 0;
            }
        } else {
            this.state.comboDecayTimer = 0;
        }

        this.updateSpawns(dt);
        this.updateEnemies(dt);
        this.updateStructures(dt);
        this.updateProjectiles(dt);

        // Kill-based combo: 1 + log(combo)/divisor. scholarGrace reduces the divisor (stronger bonus).
        const comboDivisor = Math.max(1, 5 - (this.meta.skills.scholarGrace || 0) * 0.1);
        this.buffs.dmgMult = this.state.combo > 0
            ? 1 + Math.log(this.state.combo) / comboDivisor
            : 1.0;

        // Pool level-up: when mana reaches the cap, level up and grow the cap.
        // Cap grows ×1.8 each level (GCFW multiplier). Gem damage bonus: +5% per level above 1.
        // Mana does NOT reset — it just keeps accumulating above the old cap.
        while (this.state.mana >= this.state.poolCap) {
            this.state.poolLevel++;
            this.state.poolCap = Math.floor(this.state.poolCap * 1.8);
            this.onUpdate(this, { type: 'poolLevelUp', level: this.state.poolLevel });
        }

        // Pool multiplier applied to all gem damage (recalculated each frame, cheap)
        this.buffs.poolMult = 1 + (this.state.poolLevel - 1) * 0.05;

        this.onUpdate(this);

        if (this.state.mana < 0) {
            this.state.status = 'gameover';
            this.onGameOver(false, this.state.xpEarned);
            return;
        }

        if (this.state.wave >= this.state.maxWaves && this.enemies.length === 0 && this.spawnQueue.length === 0) {
            this.state.status = 'gameover';
            this.onGameOver(true, this.state.xpEarned);
            return;
        }

        // Wave-clear bonus: fires once when a wave fully drains with no leak
        if (this._lastClearedWave !== this.state.wave
                && this.state.wave > 0
                && this.spawnQueue.length === 0
                && this.enemies.length === 0) {
            this._lastClearedWave = this.state.wave;
            if (!this.state._waveLeaked) {
                const bonus = Math.round(20 * this.difficulty);
                this.state.xpEarned += bonus;
                this.onUpdate(this, { type: 'waveClear', bonus });
            }
        }

        this._startLoop(gen);
    }

    spawnWave(isEnraged = false, enrageLevel = 1) {
        this.state.wave++;
        this.state._waveLeaked = false;
        this.state._manaAtWaveStart = this.state.mana;

        // Passive wave mana income
        const waveIncome = Math.floor((30 + 5 * this.state.wave + 8 * this.difficulty) * (this.buffs.poolMult || 1));
        this.state.mana += waveIncome;
        const isBossWave = (this.state.wave % 5 === 0);

        const entries = buildWaveEnemies(
            this.state.wave, this.difficulty, isBossWave, isEnraged,
            this.map.waypointSets, this.gameMode, this.state.loop, enrageLevel
        );

        const waveOffset = this._nextSpawnDelay || 0;
        let maxDelay = 0;

        entries.forEach(e => {
            e.delay += waveOffset;
            maxDelay = Math.max(maxDelay, e.delay);
            this.spawnQueue.push(e);
        });

        this._nextSpawnDelay = maxDelay + 1.5;
    }

    updateSpawns(dt) {
        if (this.spawnQueue.length === 0) {
            this._nextSpawnDelay = 0;
            return;
        }
        for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
            this.spawnQueue[i].delay -= dt;
            if (this.spawnQueue[i].delay <= 0) {
                const e = this.spawnQueue.splice(i, 1)[0];
                e.id = Math.random().toString(36).substr(2, 9);
                this.enemies.push(e);
            }
        }
    }

    updateEnemies(dt) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];

            if (e.effects.poison > 0 && !e.immune.includes('poison')) {
                e.effects.poisonTimer -= dt;
                if (e.effects.poisonTimer <= 0) {
                    e.effects.poison = 0;
                } else {
                    e.effects.poisonTick -= dt;
                    if (e.effects.poisonTick <= 0) {
                        e.hp -= e.effects.poison;
                        e.effects.poisonTick += 1.0;
                    }
                }
            }

            if (e.regen > 0) {
                e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regen * dt);
            }

            // Berserker: speed scales up as HP drops (×3 at 10% HP)
            if (e.berserk && e.baseSpeed) {
                const hpFrac = Math.max(0, e.hp / e.maxHp);
                e.speed = e.baseSpeed * (1 + 2 * (1 - hpFrac));
            }

            // Swarm Lord: spawns a swarm unit periodically
            if (e.spawnsSwarm && e.swarmSpawnTimer > 0) {
                e.swarmSpawnTimer -= dt;
                if (e.swarmSpawnTimer <= 0) {
                    e.swarmSpawnTimer = 3.0;
                    const swarmDef = ENEMY_TYPES['swarm'];
                    const waypoints = this.map.waypointSets[e.pathIdx ?? 0] || this.map.waypointSets[0];
                    this.enemies.push({
                        delay: 0,
                        typeId: 'swarm', isBoss: false,
                        emoji: swarmDef.emoji, label: swarmDef.label,
                        hp: e.maxHp * 0.2, maxHp: e.maxHp * 0.2,
                        armor: 0, speed: e.speed * 1.3, baseSpeed: e.speed * 1.3,
                        regen: 0, immune: [], onDeath: null,
                        manaLeachMult: 1, berserk: false, spawnsSwarm: false, swarmSpawnTimer: 0,
                        pathIdx: e.pathIdx ?? 0,
                        x: e.x, y: e.y, wpIdx: e.wpIdx,
                        effects: { slow:0, slowTimer:0, poison:0, poisonTimer:0, poisonTick:0, lastHit:'', flashTimer:0, flashColor:'' }
                    });
                }
            }

            if (e.effects.flashTimer > 0) {
                e.effects.flashTimer -= dt;
                if (e.effects.flashTimer <= 0) e.effects.flashColor = '';
            }

            let currentSpeed = e.speed;
            if (e.effects.slow > 0 && !e.immune.includes('slow')) {
                e.effects.slowTimer -= dt;
                currentSpeed *= Math.max(0.2, 1 - e.effects.slow);
                if (e.effects.slowTimer <= 0) e.effects.slow = 0;
            }

            if (e.hp <= 0) {
                this.state.mana += 10 * (e.rewardMult || 1) * (this.buffs.poolMult || 1);
                this.state.xpEarned += enemyXpValue(e);
                this.state.combo++;
                this.state.comboDecayTimer = 0;  // reset decay on kill
                // Splitter: on death spawn 2 fast children
                if (e.onDeath === 'split') {
                    const fastDef = ENEMY_TYPES['fast'];
                    const waypoints = this.map.waypointSets[e.pathIdx ?? 0] || this.map.waypointSets[0];
                    for (let s = 0; s < 2; s++) {
                        this.enemies.push({
                            delay: 0, typeId: 'fast', isBoss: false,
                            emoji: fastDef.emoji, label: 'Shard',
                            hp: e.maxHp * 0.3, maxHp: e.maxHp * 0.3,
                            armor: 0, speed: e.baseSpeed * 2.0, baseSpeed: e.baseSpeed * 2.0,
                            regen: 0, immune: [], onDeath: null,
                            manaLeachMult: 1, berserk: false, spawnsSwarm: false, swarmSpawnTimer: 0,
                            pathIdx: e.pathIdx ?? 0,
                            x: e.x, y: e.y, wpIdx: e.wpIdx,
                            effects: { slow:0, slowTimer:0, poison:0, poisonTimer:0, poisonTick:0, lastHit:'', flashTimer:0, flashColor:'' }
                        });
                    }
                }
                this.enemies.splice(i, 1);
                continue;
            }

            const pathIdx   = e.pathIdx ?? 0;
            const waypoints = this.map.waypointSets[pathIdx] || this.map.waypointSets[0];
            const target = waypoints[e.wpIdx];
            if (!target) {
                // Mana drain: enemy reaching exit costs % of maxMana
                const drainPct = e.isBoss ? CONSTANTS.exitDrainBoss : CONSTANTS.exitDrainNormal;
                const drain = Math.ceil(this.state.poolCap * drainPct * (e.manaLeachMult || 1));
                this.state.mana -= drain;
                this.state._waveLeaked = true;
                this.state.combo = 0;  // combo resets when enemy leaks
                this.onUpdate(this, { type: 'manaLeak', amt: drain, x: e.x, y: e.y });
                // GCFW: enemy that reaches the exit grows stronger and starts over.
                // Increase maxHp by 30% each pass — becomes a serious threat if not killed.
                e.passCount = (e.passCount || 0) + 1;
                e.maxHp  *= 1.3;
                e.speed  *= 1.1;
                e.hp      = e.maxHp;  // full heal on re-entry
                e.x       = waypoints[0].x;
                e.y       = waypoints[0].y;
                e.wpIdx   = 1;
                e.effects.slow = 0; e.effects.slowTimer = 0;
                e.effects.poison = 0; e.effects.poisonTimer = 0;
                continue;
            }

            const dx = target.x - e.x;
            const dy = target.y - e.y;
            const dist = Math.hypot(dx, dy);
            const step = currentSpeed * dt;
            if (step >= dist) {
                e.x = target.x; e.y = target.y; e.wpIdx++;
                const overflow = step - dist;
                if (overflow > 0 && e.wpIdx < waypoints.length) {
                    const next  = waypoints[e.wpIdx];
                    const ndx   = next.x - e.x, ndy = next.y - e.y;
                    const ndist = Math.hypot(ndx, ndy);
                    if (ndist > 0) { e.x += (ndx / ndist) * overflow; e.y += (ndy / ndist) * overflow; }
                }
            } else {
                e.x += (dx / dist) * step;
                e.y += (dy / dist) * step;
            }
        }
    }

    updateStructures(dt) {
        const tileSize = this.tileSize || 40;
        this.structures.forEach(st => {
            if (!st.gem) return;
            const gemData = GEMS[st.gem.color];
            const range = gemRange(st.gem, st.type === 'trap', tileSize);

            st.cooldown = (st.cooldown || 0) - dt;
            if (st.cooldown > 0) return;

            if (st.type === 'tower') {
                let target = null;
                if (this.selectedEnemyId) {
                    const sel = this.enemies.find(e => e.id === this.selectedEnemyId);
                    if (sel && Math.hypot(sel.x - st.x, sel.y - st.y) < range) target = sel;
                }
                if (!target) target = this.enemies.find(e => Math.hypot(e.x - st.x, e.y - st.y) < range);
                if (target) {
                    this.fireProjectile(st, target, gemData);
                    st.cooldown = 1 / gemFireSpeed(st.gem, gemData, this.meta.skills);
                }
            } else if (st.type === 'trap') {
                const targets = this.enemies.filter(e => Math.hypot(e.x - st.x, e.y - st.y) < range);
                if (targets.length > 0) {
                    targets.forEach(t => this.applyGemEffect(t, st.gem, gemData, true, st));
                    // GCFW Trap Fire Rate: +200% Base (3x faster than towers) + Skills
                    const trapFireMult = 2.0 + ((this.meta.skills.trapSpecialty || 0) * 0.02);
                    st.cooldown = 1 / (gemFireSpeed(st.gem, gemData, this.meta.skills) * trapFireMult);
                }
            }
        });
    }

    fireProjectile(source, target, gemData) {
        this.projectiles.push({
            x: source.x, y: source.y,
            targetId: target.id,
            gem: source.gem,
            gemData,
            sourceRef: source,
            speed: 200
        });
    }

    updateProjectiles(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            const target = this.enemies.find(e => e.id === p.targetId);
            if (!target) { this.projectiles.splice(i, 1); continue; }

            const dx = target.x - p.x;
            const dy = target.y - p.y;
            const dist = Math.hypot(dx, dy);
            const step = p.speed * dt;

            // Hit if the projectile would reach or pass the target this frame.
            // Using step >= dist prevents overshoot at high game speed.
            if (dist <= 14 || step >= dist) {
                this.applyGemEffect(target, p.gem, p.gemData, false, p.sourceRef);
                this.projectiles.splice(i, 1);
            } else {
                p.x += (dx / dist) * step;
                p.y += (dy / dist) * step;
            }
        }
    }

    applyGemEffect(enemy, gem, gemData, isTrap, source) {
        let dmg = gemDamage(gem, gemData, this.meta.skills);
        let specialMult = 1;

        if (isTrap) { 
            // GCFW Trap Multipliers: 20% Damage, 2.5x Specials
            const trapDmgMult = 0.20 + ((this.meta.skills.trapSpecialty || 0) * 0.01);
            specialMult = 1.5 + ((this.meta.skills.trapSpecialty || 0) * 0.05);
            dmg = Math.max(1, dmg * trapDmgMult);
        }

        if (gem.color === 'red') dmg *= (1 + (this.meta.skills.redMastery || 0) * 0.01);
        dmg *= this.buffs.dmgMult * (this.buffs.poolMult || 1);

        // Cursed: 90% damage reduction from non-purple gems
        if (enemy.immune?.includes('dmg_nonpurple') && gem.color !== 'purple') {
            dmg *= 0.10;
        }
        // Phantom: only traps and mana leech deal full damage; tower gems do 5%
        if (enemy.immune?.includes('dmg_nontrap') && !isTrap && gemData.type !== 'mana') {
            dmg *= 0.05;
        }

        let finalDmg = Math.max(1, dmg - Math.max(0, enemy.armor));
        let isCrit = false;

        switch (gemData.type) {
            case 'crit': {
                const baseChance = gemCritChance(gem) + ((this.meta.skills.yellowMastery || 0) * 0.005);
                const chance = Math.min(0.9, baseChance);
                if (Math.random() < chance) { finalDmg *= gemCritMult(gem); isCrit = true; }
                break;
            }
            case 'slow': {
                if (!enemy.immune.includes('slow')) {
                    // % slow scales with gem level. Mastery boosts duration only (GCFW Slowing skill).
                    const slow = gemSlowAmount(gem, gemData) * specialMult;
                    enemy.effects.slow = slow;
                    const slowDur = 3 * Math.pow(1.3, gem.level - 1)
                        * (1 + (this.meta.skills.blueMastery || 0) * 0.05);
                    enemy.effects.slowTimer = slowDur;
                    enemy.effects.lastHit = 'slow';
                    if (source?.stats) source.stats.slowApplied++;
                }
                break;
            }
            case 'poison': {
                if (!enemy.immune.includes('poison')) {
                    let pDmg = gemPoisonDps(gem, gemData) * specialMult;
                    if (gem.color === 'green') pDmg *= (1 + (this.meta.skills.greenMastery || 0) * 0.03);
                    enemy.effects.poison = pDmg;
                    enemy.effects.poisonTimer = 5.0;
                    enemy.effects.poisonTick = 1.0;
                    enemy.effects.lastHit = 'poison';
                    if (source?.stats) source.stats.poisonDealt += pDmg * 5.0;
                }
                break;
            }
            case 'mana': {
                let mana = gemManaDrain(gem, gemData) * specialMult * (this.buffs.poolMult || 1);
                if (gem.color === 'orange') mana *= 1 + (this.meta.skills.orangeMastery || 0) * 0.04;
                this.state.mana += mana;
                if (source?.stats) source.stats.manaLeeched += mana;
                break;
            }
            case 'armor': {
                let tear = gemArmorTear(gem, gemData) * specialMult;
                if (gem.color === 'purple') tear *= 1 + (this.meta.skills.purpleMastery || 0) * 0.04;
                enemy.armor = Math.max(0, enemy.armor - tear);
                enemy.effects.flashTimer = 0.18;
                enemy.effects.flashColor = 'purple';
                if (source?.stats) source.stats.armorTorn += tear;
                break;
            }
        }

        if (isCrit) {
            if (source?.stats) source.stats.critHits++;
            enemy.effects.flashTimer = 0.18;
            enemy.effects.flashColor = 'crit';
        }
        if (source?.stats) source.stats.totalDmg += Math.floor(finalDmg);

        enemy.hp -= finalDmg;
        if (this.onUpdate) this.onUpdate(this, { type: 'dmg', x: enemy.x, y: enemy.y, amt: Math.floor(finalDmg), color: gem.color });
    }

    addStructure(x, y, type) {
        const count = this.structures.filter(s => s.type === type).length;
        const cost = type === 'tower' ? towerCost(count, this.meta.skills) : trapCost(count, this.meta.skills);
        if (this.state.mana >= cost) {
            this.state.mana -= cost;
            this.structures.push({ x, y, type, gem: null, stats: { manaLeeched: 0, poisonDealt: 0, slowApplied: 0, armorTorn: 0, critHits: 0, totalDmg: 0 } });
            return true;
        }
        return false;
    }
    getBuildCost(type) {
        const count = this.structures.filter(s => s.type === type).length;
        return type === 'tower' ? towerCost(count, this.meta.skills) : trapCost(count, this.meta.skills);
    }
    getGemBuyCost(color) {
        return gemTotalCostColor(color, 1, this.meta.skills);
    }
    getGemUpgradeCost(color, level) {
        return gemUpgradeCost(color, level, this.meta.skills);
    }
}