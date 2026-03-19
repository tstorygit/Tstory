import { SKILL_DEFS } from './vc_meta.js';
import { buildWaveEnemies, ENEMY_TYPES } from './vc_enemies.js';

export const GEMS = {
    red:    { label: 'Ruby',     color: '#e74c3c', type: 'dmg',   baseDmg: 18, speed: 1.5 },
    blue:   { label: 'Sapphire', color: '#3498db', type: 'slow',  baseDmg: 4,  speed: 1.0, baseSlow: 0.18 },
    green:  { label: 'Emerald',  color: '#2ecc71', type: 'poison',baseDmg: 4,  speed: 1.0, basePoison: 1.5 },
    orange: { label: 'Topaz',    color: '#f39c12', type: 'mana',  baseDmg: 6,  speed: 1.2, baseMana: 0.4 }, // Compensating for lack of Amplifiers
    yellow: { label: 'Citrine',  color: '#f1c40f', type: 'crit',  baseDmg: 11, speed: 1.0, baseCrit: 0.04, baseMult: 2 },
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
    // Closed-form solution of the recurrence f(n) = 2·f(n-1) + combine, f(1) = base:
    //   f(n) = base·2^(n-1) + combine·(2^(n-1) − 1)
    // This is O(1) — no recursion, no loop. Identical numeric result to the old recursive version.
    const p = Math.pow(2, level - 1);
    return base * p + combine * (p - 1);
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
    // GCFW: G1 pure yellow ≈ 4% chance. Grows +4% per grade, hard cap 80%.
    // Weak and unimpressive early (G1–G4), earns its place mid-game (G6–G10),
    // dominates late (G12+ with high multiplier). Matches community reports of
    // "+4% chance to get +20% dmg" at low grade being worse than a flat bonus.
    return Math.min(0.80, GEMS[gem.color].baseCrit + 0.04 * (gem.level - 1));
}
export function gemCritMult(gem) {
    // GCFW: G1 = ×2.0, grows at ×1.16 per grade.
    // G5≈×3.6  G10≈×7.7  G16≈×18  G20≈×27  G30≈×85  G40≈×267
    // Matches community observations: mid-game ×5–15, late-game ×100s.
    // The slow early growth (worse than flat dmg at G1–G5) is intentional GCFW design.
    return GEMS[gem.color].baseMult * Math.pow(1.16, gem.level - 1);
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
    const speedFactor  = 0.8 + (enemy.speed || 1.5) * 2.5;  // tiles/s: normal≈1.5 → factor≈4.55 (was ×5 — caused late-wave XP explosion)
    const immuneFactor = 1 + (enemy.immune?.size || 0) * 0.25;
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
            _manaAtWaveStart: startMana,
            _waveStartTime: 0,       // performance.now() when wave was spawned
            _earlyCallBonus: 0       // mana bonus earned by calling next wave early
        };

        this.enemies = [];
        this.enemyById = new Map(); // Fix #2: O(1) enemy lookup by id for projectiles
        this.projectiles =[];
        this.structures = [];
        this._projIdCounter = 0; // Perf fix 7: stable numeric projectile IDs, no string concat

        // Perf fix 6: reuse a single event object for dmg notifications to avoid
        // allocating a new {type,x,y,amt,color} literal on every projectile hit.
        this._dmgEvent = { type: 'dmg', x: 0, y: 0, amt: 0, color: '' };
        // Batch fix: collect all events during a tick, flush once per frame via
        // the single end-of-tick onUpdate call. Prevents draw() being called
        // hundreds of times per RAF tick (once per projectile hit) which caused
        // the FPS counter to read 1500+ and the game to lag severely.
        this._tickEvents = [];

        if (!this.tileSize) this.tileSize = 40; // Perf fix 9: normalise once, remove || 40 in hot loops

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

        // Combo decay: full reset after 5s with no kill
        const comboWindow = 5;
        this.state.comboDecayWindow = comboWindow;
        if (this.state.combo > 0) {
            this.state.comboDecayTimer += dt;
            if (this.state.comboDecayTimer >= comboWindow) {
                this.state.combo = 0;
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
            this._tickEvents.push({ type: 'poolLevelUp', level: this.state.poolLevel });
        }

        // Pool multiplier applied to all gem damage (recalculated each frame, cheap)
        this.buffs.poolMult = 1 + (this.state.poolLevel - 1) * 0.05;

        // Flush all batched events in a single draw() call — one DOM update per frame.
        const eventsToFlush = this._tickEvents;
        this._tickEvents = [];
        this.onUpdate(this, eventsToFlush);

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
                this._tickEvents.push({ type: 'waveClear', bonus });
            }
        }

        this._startLoop(gen);
    }

    spawnWave(isEnraged = false, enrageLevel = 1) {
        // Early-call bonus: reward calling the next wave before the current one
        // fully clears. Bonus = floor(remaining enemies / totalSpawned) * waveIncome * 0.6,
        // capped at 60% of that wave's income. Only awarded when enemies are still alive
        // (i.e. the player genuinely called early). The perfect-wave flag (_waveLeaked)
        // belongs to the wave being CLEARED, not the one being started — preserve it until
        // the wave-clear check fires naturally in _loopTick.
        if (this.state.wave > 0 && this.enemies.length > 0) {
            const elapsed = (performance.now() - (this.state._waveStartTime || 0)) / 1000;
            const enemiesAlive = this.enemies.length;
            // Fraction of enemies still alive relative to the wave size (rough)
            const waveSize = Math.max(1, (this.state._waveEnemyCount || enemiesAlive));
            const aliveFrac = Math.min(1, enemiesAlive / waveSize);
            // Bigger bonus the earlier the call; also scale with difficulty
            const baseIncome = Math.floor((30 + 5 * this.state.wave + 8 * this.difficulty) * (this.buffs.poolMult || 1));
            const earlyBonus = Math.floor(baseIncome * aliveFrac * 0.6);
            if (earlyBonus > 0) {
                this.state.mana += earlyBonus;
                this.state._earlyCallBonus = earlyBonus;
                this._tickEvents.push({ type: 'earlyCall', bonus: earlyBonus });
            }
        } else {
            this.state._earlyCallBonus = 0;
        }

        this.state.wave++;
        this.state._waveLeaked = false;
        this.state._manaAtWaveStart = this.state.mana;
        this.state._waveStartTime = performance.now();

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
        // Track total enemies spawned this wave for early-call bonus calculation
        this.state._waveEnemyCount = entries.length;
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
                e.immune = new Set(e.immune); // Perf fix 5: O(1) Set lookups vs O(n) array scan
                this.enemies.push(e);
                this.enemyById.set(e.id, e); // Fix #2: register in O(1) lookup map
            }
        }
    }

    updateEnemies(dt) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];

            if (e.effects.poison > 0 && !e.immune.has('poison')) {
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
                    const swarmChild = {
                        delay: 0,
                        typeId: 'swarm', isBoss: false,
                        emoji: swarmDef.emoji, label: swarmDef.label,
                        hp: e.maxHp * 0.2, maxHp: e.maxHp * 0.2,
                        armor: 0, speed: e.speed * 1.3, baseSpeed: e.speed * 1.3,
                        regen: 0, immune: new Set(), onDeath: null,
                        manaLeachMult: 1, berserk: false, spawnsSwarm: false, swarmSpawnTimer: 0,
                        pathIdx: e.pathIdx ?? 0,
                        x: e.x, y: e.y, wpIdx: e.wpIdx,
                        effects: { slow:0, slowTimer:0, poison:0, poisonTimer:0, poisonTick:0, lastHit:'', flashTimer:0, flashColor:'' }
                    };
                    swarmChild.id = Math.random().toString(36).substr(2, 9);
                    this.enemies.push(swarmChild);
                    this.enemyById.set(swarmChild.id, swarmChild); // Fix #2: register spawned child
                }
            }

            if (e.effects.flashTimer > 0) {
                e.effects.flashTimer -= dt;
                if (e.effects.flashTimer <= 0) e.effects.flashColor = '';
            }

            let currentSpeed = e.speed;
            if (e.effects.slow > 0 && !e.immune.has('slow')) {
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
                        const child = {
                            delay: 0, typeId: 'fast', isBoss: false,
                            emoji: fastDef.emoji, label: 'Shard',
                            hp: e.maxHp * 0.3, maxHp: e.maxHp * 0.3,
                            armor: 0, speed: e.baseSpeed * 2.0, baseSpeed: e.baseSpeed * 2.0,
                            regen: 0, immune: new Set(), onDeath: null,
                            manaLeachMult: 1, berserk: false, spawnsSwarm: false, swarmSpawnTimer: 0,
                            pathIdx: e.pathIdx ?? 0,
                            x: e.x, y: e.y, wpIdx: e.wpIdx,
                            effects: { slow:0, slowTimer:0, poison:0, poisonTimer:0, poisonTick:0, lastHit:'', flashTimer:0, flashColor:'' }
                        };
                        child.id = Math.random().toString(36).substr(2, 9);
                        this.enemies.push(child);
                        this.enemyById.set(child.id, child); // Fix #2: register child
                    }
                }
                this.enemyById.delete(e.id); // Fix #2: deregister dead enemy
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
                this._tickEvents.push({ type: 'manaLeak', amt: drain, x: e.x, y: e.y });
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
            const tileSize = this.tileSize; // Perf fix 9: normalised in constructor, no || 40 needed
            const step = currentSpeed * tileSize * dt;
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
        const tileSize = this.tileSize; // Perf fix 9: normalised in constructor, no || 40 needed

        // Fix #2: Build a coarse spatial grid of enemies (1 cell = 2 tiles wide).
        // Each structure only checks cells within its range instead of all enemies.
        const CELL = tileSize * 2;
        const spatialGrid = new Map();
        for (const e of this.enemies) {
            const cx = Math.floor(e.x / CELL);
            const cy = Math.floor(e.y / CELL);
            const key = `${cx},${cy}`;
            if (!spatialGrid.has(key)) spatialGrid.set(key, []);
            spatialGrid.get(key).push(e);
        }
        // Returns all enemies within `range` px of (sx, sy) using the grid.
        const nearbyEnemies = (sx, sy, range) => {
            const cellRadius = Math.ceil(range / CELL);
            const cx0 = Math.floor(sx / CELL);
            const cy0 = Math.floor(sy / CELL);
            const result = [];
            const rangeSq = range * range;
            for (let dx = -cellRadius; dx <= cellRadius; dx++) {
                for (let dy = -cellRadius; dy <= cellRadius; dy++) {
                    const bucket = spatialGrid.get(`${cx0 + dx},${cy0 + dy}`);
                    if (!bucket) continue;
                    for (const e of bucket) {
                        const ddx = e.x - sx, ddy = e.y - sy;
                        if (ddx * ddx + ddy * ddy < rangeSq) result.push(e);
                    }
                }
            }
            return result;
        };

        this.structures.forEach(st => {
            if (!st.gem) return;
            const gemData = GEMS[st.gem.color];
            const range = gemRange(st.gem, st.type === 'trap', tileSize);

            st.cooldown = (st.cooldown || 0) - dt;
            if (st.cooldown > 0) return;

            if (st.type === 'tower') {
                let target = null;
                // Fix #2: use O(1) map for selected-enemy focus check
                if (this.selectedEnemyId) {
                    const sel = this.enemyById.get(this.selectedEnemyId);
                    if (sel && Math.hypot(sel.x - st.x, sel.y - st.y) < range) target = sel;
                }
                // Target priority: most progressed enemy first.
                // this.enemies is kept in spawn order — earliest spawned at index 0,
                // which is always furthest along the path. A simple linear scan from
                // the front is O(n) but correct, cheap, and needs no sorting.
                if (!target) {
                    const rangeSq = range * range;
                    for (const e of this.enemies) {
                        const ddx = e.x - st.x, ddy = e.y - st.y;
                        if (ddx * ddx + ddy * ddy <= rangeSq) { target = e; break; }
                    }
                }
                if (target) {
                    this.fireProjectile(st, target, gemData);
                    st.cooldown = 1 / gemFireSpeed(st.gem, gemData, this.meta.skills);
                }
            } else if (st.type === 'trap') {
                // Fix #2: spatial grid replaces full enemy filter
                const targets = nearbyEnemies(st.x, st.y, range);
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
            id: ++this._projIdCounter, // Perf fix 7: stable numeric ID — no string concat in renderer
            x: source.x, y: source.y,
            targetId: target.id,
            gem: source.gem,
            gemData,
            sourceRef: source,
            speed: 5
        });
    }

    updateProjectiles(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            // Fix #2: O(1) map lookup instead of O(n) .find() scan
            const target = this.enemyById.get(p.targetId);
            if (!target) { this.projectiles.splice(i, 1); continue; }

            const dx = target.x - p.x;
            const dy = target.y - p.y;
            const dist = Math.hypot(dx, dy);
            const tileSize = this.tileSize; // Perf fix 9: normalised in constructor, no || 40 needed
            const step = p.speed * tileSize * dt;

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
        if (enemy.immune?.has('dmg_nonpurple') && gem.color !== 'purple') {
            dmg *= 0.10;
        }
        // Phantom: only traps and mana leech deal full damage; tower gems do 5%
        if (enemy.immune?.has('dmg_nontrap') && !isTrap && gemData.type !== 'mana') {
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
                if (!enemy.immune.has('slow')) {
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
                if (!enemy.immune.has('poison')) {
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
        // Batch fix: queue dmg float instead of calling draw() immediately.
        // All events are flushed once at end of tick — one draw() per frame total.
        this._tickEvents.push({ type: 'dmg', x: enemy.x, y: enemy.y, amt: Math.floor(finalDmg), color: gem.color });
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