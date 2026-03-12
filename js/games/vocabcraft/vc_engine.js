import { SKILL_DEFS } from './vc_meta.js';
import { buildWaveEnemies } from './vc_enemies.js';

export const GEMS = {
    red:    { label: 'Ruby',     color: '#e74c3c', type: 'dmg',   baseDmg: 18, speed: 1.5 },
    blue:   { label: 'Sapphire', color: '#3498db', type: 'slow',  baseDmg: 4,  speed: 1.0, baseSlow: 0.12 },
    green:  { label: 'Emerald',  color: '#2ecc71', type: 'poison',baseDmg: 4,  speed: 1.0, basePoison: 5 },
    orange: { label: 'Topaz',    color: '#f39c12', type: 'mana',  baseDmg: 6,  speed: 1.2, baseMana: 4 },
    yellow: { label: 'Citrine',  color: '#f1c40f', type: 'crit',  baseDmg: 8,  speed: 1.0, baseCrit: 0.08, baseMult: 3 },
    purple: { label: 'Amethyst', color: '#9b59b6', type: 'armor', baseDmg: 5,  speed: 1.0, baseTear: 2 }
};

export const CONSTANTS = {
    // Building costs — match GCFW table exactly:
    //   # built | Tower | Trap
    //   1st      | 100   | 75
    //   2nd      | 138   | 100
    //   3rd      | 176   | 125
    //   4th      | 214   | 150
    //   5th      | 252   | 175
    towerCostBase: 100,
    towerCostInc: 38,
    trapCostBase: 75,
    trapCostInc: 25,
    gemBaseCost: 60,        // cost of a fresh level-1 gem
    gemCombineCost: 240,    // fixed combine fee
    vocabPenalty: 10,
    playerBaseHp: 20,
    towerBaseRange: 100,
    trapBaseRange: 28
};

// ─── Building cost functions ─────────────────────────────────────────────────
// skills.towerDiscount: -1% per level (max 20 levels = -20%)
// skills.trapDiscount:  -1% per level (max 20 levels = -20%)
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
// Multipliers derived directly from the GCFW combining formula (pure same-grade
// combine = one upgrade): combined = c1*best + c2*worst, A=B for pure gems.
//
//   Damage:     (0.83+0.71) = ×1.54/grade
//   Poison:     (0.96+0.85) = ×1.81/grade
//   Mana gain:  (0.88+0.50) = ×1.38/grade
//   Armor tear: (0.98+0.92) = ×1.90/grade
//   Crit mult:  (0.88+0.50) = ×1.38/grade
//   Crit chance:(0.81+0.35) = ×1.16/grade  (implemented as +4%/level instead)
//   Fire speed: (0.74+0.44) = ×1.18/grade  (capped at 4/s)
//   Range:      (0.694+0.388)= ×1.08/grade
//   Slow power: (0.91+0.45) = ×1.36/grade  (capped at 70% per GCFW)
//
// ─── Gem cost formula ────────────────────────────────────────────────────────
// totalCost(n) = total mana to build a gem of level n from scratch:
//   totalCost(1) = gemBaseCost = 60
//   totalCost(n) = 2 × totalCost(n-1) + combineCost
//
// upgradeFromHere(n) = cost when you already OWN a level-n gem and want n+1
//   = totalCost(n) + combineCost   (you only need to buy one more gem of level n)
//
// Example values (no skill discounts):
//   Level 1 total: 60      upgrade to 2: 300
//   Level 2 total: 360     upgrade to 3: 600
//   Level 3 total: 960     upgrade to 4: 1200
//   Level 4 total: 2160    upgrade to 5: 2400
//   Level 5 total: 4560    upgrade to 6: 4800
//
// skills.combineDiscount: -1% per level (max 20 = -20%)
// Per-gem color discount skills (redCost, blueCost, etc.): -1% per level (max 20 = -20%)
export function gemCombineCost(skills = {}) {
    const disc = 1 - ((skills.combineDiscount || 0) * 0.01);
    return Math.floor(CONSTANTS.gemCombineCost * disc);
}
export function gemBaseCost(skills = {}) {
    // No global gem discount skill — use per-color skills instead
    return CONSTANTS.gemBaseCost;
}
export function gemTotalCostColor(color, level, skills = {}) {
    // Total mana to build a gem of `color` at `level` from scratch.
    //
    // Per-color skill (e.g. redCost) reduces BOTH the base gem price AND the combine
    // fee for that color, so the discount compounds through every upgrade tier correctly.
    //
    // Formula:  totalCost(1) = floor(baseCost * colorDisc)
    //           totalCost(n) = 2 * totalCost(n-1) + floor(combineCost * colorDisc)
    //
    // Example with redCost=5 (−40%):
    //   base=36, combine=144
    //   Lv1=36, Lv2=216, Lv3=576, Lv4=1296  (vs no-skill: 60, 360, 960, 2160 — exactly 60%)
    const colorDisc = 1 - ((skills[color + 'Cost'] || 0) * 0.01);
    const base    = Math.floor(gemBaseCost(skills) * colorDisc);
    const combine = Math.floor(gemCombineCost(skills) * colorDisc);
    if (level <= 1) return base;
    // Use a helper that reuses the already-computed base/combine scalars
    function inner(n) {
        if (n <= 1) return base;
        return 2 * inner(n - 1) + combine;
    }
    return inner(level);
}
export function gemUpgradeCost(color, level, skills = {}) {
    // Cost to upgrade FROM level n TO n+1 when you already own one gem of level n.
    // Buy one more Lv-n gem of the same color, then pay the (color-discounted) combine fee.
    const colorDisc = 1 - ((skills[color + 'Cost'] || 0) * 0.01);
    const combine   = Math.floor(gemCombineCost(skills) * colorDisc);
    return gemTotalCostColor(color, level, skills) + combine;
}
export function gemDamage(gem, gemData) {
    return gemData.baseDmg * Math.pow(1.54, gem.level - 1);
}
export function gemFireSpeed(gem, gemData) {
    return Math.min(4.0, gemData.speed * Math.pow(1.18, gem.level - 1));
}
export function gemRange(gem, isTrap = false) {
    const base = isTrap ? CONSTANTS.trapBaseRange : CONSTANTS.towerBaseRange;
    return Math.floor(base * Math.pow(1.08, gem.level - 1));
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
    return Math.min(0.70, gemData.baseSlow * Math.pow(1.36, gem.level - 1));
}
export function gemManaDrain(gem, gemData) {
    return gemData.baseMana * Math.pow(1.38, gem.level - 1);
}
export function gemArmorTear(gem, gemData) {
    return gemData.baseTear * Math.pow(1.90, gem.level - 1);
}

export class VcEngine {
    constructor(mapData, meta, tier, onUpdate, onGameOver) {
        this.map = mapData;
        this.meta = meta;
        this.tier = tier;
        this.onUpdate = onUpdate;
        this.onGameOver = onGameOver;

        this.state = {
            hp: CONSTANTS.playerBaseHp,
            mana: 200 + (meta.skills.startMana * 25),
            wave: 0,
            maxWaves: 5 + (tier * 2),
            status: 'planning',
            combo: 0,
            xpEarned: 0
        };

        this.enemies = [];
        this.projectiles = [];
        this.structures = [];

        this.spawnQueue = [];
        this._nextSpawnDelay = 0;
        this.lastTick = performance.now();
        this.raf = null;
        this.speedMult = 1;
        this.selectedEnemyId = null;

        this.buffs = {
            dmgMult: 1 + (meta.skills.scholarGrace * 0.005 * this.state.combo),
            trapSpeed: 1 + (meta.skills.trapEng * 0.01)
        };
    }

    start() {
        this.state.status = 'playing';
        this.lastTick = performance.now();
        this.loop();
    }

    pause() { this.state.status = 'paused'; }
    resume() {
        this.state.status = 'playing';
        this.lastTick = performance.now();
        this.loop();
    }
    stop() { cancelAnimationFrame(this.raf); }

    loop = () => {
        if (this.state.status !== 'playing') return;

        const now = performance.now();
        let dt = (now - this.lastTick) / 1000;
        this.lastTick = now;

        if (dt > 0.1) dt = 0.1;
        dt *= this.speedMult;

        this.updateSpawns(dt);
        this.updateEnemies(dt);
        this.updateStructures(dt);
        this.updateProjectiles(dt);

        this.buffs.dmgMult = 1 + (this.meta.skills.scholarGrace * 0.005 * this.state.combo);
        this.onUpdate(this);

        if (this.state.hp <= 0) {
            this.state.status = 'gameover';
            this.onGameOver(false, this.state.xpEarned);
            return;
        }

        if (this.state.wave >= this.state.maxWaves && this.enemies.length === 0 && this.spawnQueue.length === 0) {
            this.state.status = 'gameover';
            this.onGameOver(true, this.state.xpEarned);
            return;
        }

        this.raf = requestAnimationFrame(this.loop);
    }

    spawnWave(isEnraged = false) {
        this.state.wave++;
        const isBossWave = (this.state.wave % 5 === 0);

        // Build enemy list from vc_enemies.js
        const entries = buildWaveEnemies(
            this.state.wave, this.tier, isBossWave, isEnraged,
            this.map.waypoints
        );

        // Offset delays so multiple queued waves don't overlap
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

            // Poison tick (skip if immune)
            if (e.effects.poison > 0 && !e.immune.includes('poison')) {
                e.effects.poisonTick -= dt;
                if (e.effects.poisonTick <= 0) {
                    e.hp -= e.effects.poison;
                    e.effects.poisonTick = 1.0;
                }
            }

            // HP regen (healers, boss)
            if (e.regen > 0) {
                e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regen * dt);
            }

            // Slow (skip if immune)
            let currentSpeed = e.speed;
            if (e.effects.slow > 0 && !e.immune.includes('slow')) {
                e.effects.slowTimer -= dt;
                currentSpeed *= Math.max(0.2, 1 - e.effects.slow);
                if (e.effects.slowTimer <= 0) e.effects.slow = 0;
            }

            if (e.hp <= 0) {
                this.state.mana += 10 * e.rewardMult;
                this.state.xpEarned += 5 * e.rewardMult;
                this.enemies.splice(i, 1);
                continue;
            }

            const target = this.map.waypoints[e.wpIdx];
            if (!target) {
                this.state.hp -= (e.isBoss ? 5 : 1);
                e.x = this.map.waypoints[0].x;
                e.y = this.map.waypoints[0].y;
                e.wpIdx = 1;
                e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2);
                continue;
            }

            const dx = target.x - e.x;
            const dy = target.y - e.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 2) { e.wpIdx++; }
            else {
                e.x += (dx / dist) * currentSpeed * dt;
                e.y += (dy / dist) * currentSpeed * dt;
            }
        }
    }

    updateStructures(dt) {
        this.structures.forEach(st => {
            if (!st.gem) return;
            const gemData = GEMS[st.gem.color];
            const range = gemRange(st.gem, st.type === 'trap');

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
                    st.cooldown = 1 / gemFireSpeed(st.gem, gemData);
                }
            } else if (st.type === 'trap') {
                const targets = this.enemies.filter(e => Math.hypot(e.x - st.x, e.y - st.y) < range);
                if (targets.length > 0) {
                    targets.forEach(t => this.applyGemEffect(t, st.gem, gemData, true));
                    st.cooldown = 1 / (gemFireSpeed(st.gem, gemData) * this.buffs.trapSpeed);
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
            if (dist < 10) {
                this.applyGemEffect(target, p.gem, p.gemData, false);
                this.projectiles.splice(i, 1);
            } else {
                p.x += (dx / dist) * p.speed * dt;
                p.y += (dy / dist) * p.speed * dt;
            }
        }
    }

    applyGemEffect(enemy, gem, gemData, isTrap) {
        let dmg = gemDamage(gem, gemData);
        let specialMult = 1;

        if (isTrap) { dmg = Math.max(1, dmg * 0.3); specialMult = 3; }

        if (gem.color === 'red') dmg *= (1 + this.meta.skills.redMastery * 0.01);
        dmg *= this.buffs.dmgMult;

        let finalDmg = Math.max(1, dmg - Math.max(0, enemy.armor));

        switch (gemData.type) {
            case 'crit': {
                const baseChance = gemCritChance(gem) + (this.meta.skills.yellowMastery * 0.005);
                const chance = Math.min(0.9, baseChance * specialMult);
                if (Math.random() < chance) finalDmg *= gemCritMult(gem);
                break;
            }
            case 'slow': {
                if (!enemy.immune.includes('slow')) {
                    let slow = gemSlowAmount(gem, gemData) * specialMult;
                    if (gem.color === 'blue') slow *= (1 + this.meta.skills.blueMastery * 0.01);
                    enemy.effects.slow = Math.min(0.70, slow);
                    enemy.effects.slowTimer = 3;
                }
                break;
            }
            case 'poison': {
                if (!enemy.immune.includes('poison')) {
                    let pDmg = gemPoisonDps(gem, gemData) * specialMult;
                    if (gem.color === 'green') pDmg *= (1 + this.meta.skills.greenMastery * 0.02);
                    enemy.effects.poison = pDmg;
                    enemy.effects.poisonTick = 1.0;
                }
                break;
            }
            case 'mana': {
                let mana = gemManaDrain(gem, gemData) * specialMult;
                if (gem.color === 'orange') mana += this.meta.skills.orangeMastery * 0.2;
                this.state.mana += mana;
                break;
            }
            case 'armor': {
                let tear = gemArmorTear(gem, gemData) * specialMult;
                if (gem.color === 'purple') tear += this.meta.skills.purpleMastery * 0.1;
                enemy.armor = Math.max(0, enemy.armor - tear);
                break;
            }
        }

        enemy.hp -= finalDmg;
        if (this.onUpdate) this.onUpdate(this, { type: 'dmg', x: enemy.x, y: enemy.y, amt: Math.floor(finalDmg), color: gem.color });
    }

    addStructure(x, y, type) {
        const count = this.structures.filter(s => s.type === type).length;
        const cost = type === 'tower' ? towerCost(count, this.meta.skills) : trapCost(count, this.meta.skills);
        if (this.state.mana >= cost) {
            this.state.mana -= cost;
            this.structures.push({ x, y, type, gem: null });
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