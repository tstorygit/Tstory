// js/games/tbb/tbb_ascension.js
// Ascension perk system — port of tbb_ascension_constants.dart

export const PERK_DEFS = {
    // ── Tier 1 (cost 1 AP, max 10) ──────────────────────────────────
    baseHpBoostT1:  { name: 'Fortitude I',       desc: '+5 Base HP per level',           tier: 1, cost: 1, maxLvl: 10, valuePerLvl: 5,   apReq: 0  },
    baseAtkT1:      { name: 'Might I',            desc: '+1 Base ATK per level',          tier: 1, cost: 1, maxLvl: 10, valuePerLvl: 1,   apReq: 0  },
    baseDefT1:      { name: 'Resilience I',       desc: '+1 Base DEF per level',          tier: 1, cost: 1, maxLvl: 10, valuePerLvl: 1,   apReq: 0  },
    baseSpdT1:      { name: 'Alacrity I',         desc: '+1 Base SPD per level',          tier: 1, cost: 1, maxLvl: 10, valuePerLvl: 1,   apReq: 0  },
    expGainT1:      { name: 'Wisdom I',           desc: '+1% Additive EXP Gain/lvl',      tier: 1, cost: 1, maxLvl: 10, valuePerLvl: 1,   apReq: 0  },
    answerTimeBonus:{ name: 'Temporal Insight',   desc: '+0.1s Answer Time per level',    tier: 1, cost: 1, maxLvl: 100,valuePerLvl: 0.1, apReq: 0  },
    // ── Tier 2 (cost 2 AP, max 10, req 10 AP spent) ─────────────────
    baseHpBoostT2:  { name: 'Fortitude II',       desc: '+10 Base HP per level',          tier: 2, cost: 2, maxLvl: 10, valuePerLvl: 10,  apReq: 10 },
    baseAtkT2:      { name: 'Might II',           desc: '+2 Base ATK per level',          tier: 2, cost: 2, maxLvl: 10, valuePerLvl: 2,   apReq: 10 },
    baseDefT2:      { name: 'Resilience II',      desc: '+2 Base DEF per level',          tier: 2, cost: 2, maxLvl: 10, valuePerLvl: 2,   apReq: 10 },
    baseSpdT2:      { name: 'Alacrity II',        desc: '+2 Base SPD per level',          tier: 2, cost: 2, maxLvl: 10, valuePerLvl: 2,   apReq: 10 },
    expGainT2:      { name: 'Wisdom II',          desc: '+2% Additive EXP Gain/lvl',      tier: 2, cost: 2, maxLvl: 10, valuePerLvl: 2,   apReq: 10 },
    // ── Tier 3 (cost 3 AP, max 5, req 30 AP spent) ──────────────────
    multExpGainT3:  { name: 'Enlightenment',      desc: '+2% Multiplicative EXP/lvl',     tier: 3, cost: 3, maxLvl: 5,  valuePerLvl: 2,   apReq: 30 },
    bonusStatPtsT3: { name: 'Potential Unleashed',desc: '+1 Bonus Stat Point at Lvl 1',   tier: 3, cost: 3, maxLvl: 5,  valuePerLvl: 1,   apReq: 30 },
};

export const REBIRTH_MIN_LEVEL = 10;
export const REBIRTH_AP_DIVIDER = 5; // floor(playerLevel / 5) AP gained

/** Compute total AP spent across all perks */
export function totalApSpent(perkLevels) {
    return Object.entries(perkLevels).reduce((sum, [key, lvl]) => {
        return sum + (PERK_DEFS[key]?.cost ?? 0) * lvl;
    }, 0);
}

/** Check if a perk can be leveled up */
export function canSpendAp(perkKey, perkLevels, availableAp) {
    const def = PERK_DEFS[perkKey];
    if (!def) return false;
    const current = perkLevels[perkKey] ?? 0;
    if (current >= def.maxLvl) return false;
    if (availableAp < def.cost) return false;
    if (totalApSpent(perkLevels) < def.apReq) return false;
    return true;
}

/**
 * Apply all perk bonuses to a base stat block.
 * Returns an object with additive bonuses applied.
 */
export function computePerkBonuses(perkLevels) {
    const lvl = k => perkLevels[k] ?? 0;
    return {
        hpBonus:          lvl('baseHpBoostT1') * 5  + lvl('baseHpBoostT2') * 10,
        atkBonus:         lvl('baseAtkT1') * 1      + lvl('baseAtkT2') * 2,
        defBonus:         lvl('baseDefT1') * 1      + lvl('baseDefT2') * 2,
        spdBonus:         lvl('baseSpdT1') * 1      + lvl('baseSpdT2') * 2,
        additiveExpPct:   lvl('expGainT1') * 1      + lvl('expGainT2') * 2,   // additive %
        multExpPct:       lvl('multExpGainT3') * 2,                            // multiplicative %
        bonusStatPts:     lvl('bonusStatPtsT3') * 1,
        answerTimeSecs:   lvl('answerTimeBonus') * 0.1,
    };
}

/** AP gained on rebirth */
export function calcRebirthAp(playerLevel) {
    return Math.floor(playerLevel / REBIRTH_AP_DIVIDER);
}
