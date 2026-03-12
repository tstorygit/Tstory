import { SKILL_DEFS } from './vc_meta.js';
import { buildWaveEnemies } from './vc_enemies.js';

export const GEMS = {
    red:    { label: 'Ruby',     color: '#e74c3c', type: 'dmg',   baseDmg: 18, speed: 1.5 },
    blue:   { label: 'Sapphire', color: '#3498db', type: 'slow',  baseDmg: 4,  speed: 1.0, baseSlow: 0.15 },
    green:  { label: 'Emerald',  color: '#2ecc71', type: 'poison',baseDmg: 4,  speed: 1.0, basePoison: 1.5 },
    orange: { label: 'Topaz',    color: '#f39c12', type: 'mana',  baseDmg: 6,  speed: 1.2, baseMana: 0.2 }, 
    yellow: { label: 'Citrine',  color: '#f1c40f', type: 'crit',  baseDmg: 8,  speed: 1.0, baseCrit: 0.10, baseMult: 3 },
    purple: { label: 'Amethyst', color: '#9b59b6', type: 'armor', baseDmg: 5,  speed: 1.0, baseTear: 0.2 }
};

export const CONSTANTS = {
    // Building costs — match GCFW table exactly:
    towerCostBase: 100,
    towerCostInc: 38,
    trapCostBase: 75,
    trapCostInc: 25,
    gemBaseCost: 60,        // cost of a fresh level-1 gem
    gemCombineCost: 240,    // fixed combine fee
    vocabPenalty: 10,
    playerBaseHp: 20,
    towerBaseRange: 2.5,    // in tiles — multiplied by tileSize at render time
    trapBaseRange:  0.5     // in tiles (Exactly 1-tile diameter for traps)
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
    const resonance = 1 + ((skills.resonance || 0) * 0.02);
    return gemData.baseDmg * Math.pow(1.54, gem.level - 1) * resonance;
}
export function gemFireSpeed(gem, gemData, skills = {}) {
    const haste = 1 + ((skills.haste || 0) * 0.02);
    return Math.min(4.0, gemData.speed * Math.pow(1.18, gem.level - 1) * haste);
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
            mana: 200 + ((meta.skills.startMana || 0) * 20),
            wave: 0,
            maxWaves: 5 + (tier * 2),
            status: 'planning',
            combo: 0,
            xpEarned: 0
        };

        this.enemies = [];
        this.projectiles = [];
        this.structures =[];

        this.spawnQueue =[];
        this._nextSpawnDelay = 0;
        this.lastTick = performance.now();
        this.raf = null;
        this.speedMult = 1;
        this.selectedEnemyId = null;

        this.buffs = {
            dmgMult: 1 + ((meta.skills.scholarGrace || 0) * 0.005 * this.state.combo)
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

        this.buffs.dmgMult = 1 + ((this.meta.skills.scholarGrace || 0) * 0.005 * this.state.combo);
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

        const entries = buildWaveEnemies(
            this.state.wave, this.tier, isBossWave, isEnraged,
            this.map.waypoints
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
                    const trapFireMult = 1 + (this.meta.skills.trapSpecialty || 0) * 0.01;
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
            if (dist < 10) {
                this.applyGemEffect(target, p.gem, p.gemData, false, p.sourceRef);
                this.projectiles.splice(i, 1);
            } else {
                p.x += (dx / dist) * p.speed * dt;
                p.y += (dy / dist) * p.speed * dt;
            }
        }
    }

    applyGemEffect(enemy, gem, gemData, isTrap, source) {
        let dmg = gemDamage(gem, gemData, this.meta.skills);
        let specialMult = 1;

        if (isTrap) { 
            const trapDmgMult = 0.10 + ((this.meta.skills.trapSpecialty || 0) * 0.01);
            specialMult = 2.5 + ((this.meta.skills.trapSpecialty || 0) * 0.1);
            dmg = Math.max(1, dmg * trapDmgMult);
        }

        if (gem.color === 'red') dmg *= (1 + (this.meta.skills.redMastery || 0) * 0.01);
        dmg *= this.buffs.dmgMult;

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
                    let slow = gemSlowAmount(gem, gemData) * specialMult;
                    if (gem.color === 'blue') slow *= (1 + (this.meta.skills.blueMastery || 0) * 0.01);
                    enemy.effects.slow = Math.min(0.70, slow);
                    enemy.effects.slowTimer = 3;
                    if (source?.stats) source.stats.slowApplied++;
                }
                break;
            }
            case 'poison': {
                if (!enemy.immune.includes('poison')) {
                    let pDmg = gemPoisonDps(gem, gemData) * specialMult;
                    if (gem.color === 'green') pDmg *= (1 + (this.meta.skills.greenMastery || 0) * 0.02);
                    enemy.effects.poison = pDmg;
                    enemy.effects.poisonTimer = 5.0; 
                    enemy.effects.poisonTick = 1.0;
                    if (source?.stats) source.stats.poisonDealt += pDmg * 5.0; 
                }
                break;
            }
            case 'mana': {
                let mana = gemManaDrain(gem, gemData) * specialMult;
                if (gem.color === 'orange') mana += (this.meta.skills.orangeMastery || 0) * 0.2;
                this.state.mana += mana;
                if (source?.stats) source.stats.manaLeeched += mana;
                break;
            }
            case 'armor': {
                let tear = gemArmorTear(gem, gemData) * specialMult;
                if (gem.color === 'purple') tear += (this.meta.skills.purpleMastery || 0) * 0.1;
                enemy.armor = Math.max(0, enemy.armor - tear);
                if (source?.stats) source.stats.armorTorn += tear;
                break;
            }
        }

        if (isCrit && source?.stats) source.stats.critHits++;
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