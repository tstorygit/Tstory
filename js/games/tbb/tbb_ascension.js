// js/games/tbb/tbb_ascension.js
// Ascension perk system — port of tbb_ascension_constants.dart

export const PERK_DEFS = {
    // ── Tier 1 (cost 1 AP, max 10, req 0 AP spent) ──────────────────
    baseHpBoostT1:   { name: 'Fortitude I',        desc: '+5 Base HP per level',             tier: 1, cost: 1, maxLvl: 10,  valuePerLvl: 5,   apReq: 0  },
    baseAtkT1:       { name: 'Might I',             desc: '+1 Base ATK per level',            tier: 1, cost: 1, maxLvl: 10,  valuePerLvl: 1,   apReq: 0  },
    baseDefT1:       { name: 'Resilience I',        desc: '+1 Base DEF per level',            tier: 1, cost: 1, maxLvl: 10,  valuePerLvl: 1,   apReq: 0  },
    baseSpdT1:       { name: 'Alacrity I',          desc: '+1 Base SPD per level',            tier: 1, cost: 1, maxLvl: 10,  valuePerLvl: 1,   apReq: 0  },
    expGainT1:       { name: 'Wisdom I',            desc: '+1% Additive EXP Gain/lvl',        tier: 1, cost: 1, maxLvl: 10,  valuePerLvl: 1,   apReq: 0  },
    answerTimeBonus: { name: 'Temporal Insight',    desc: '+0.1s Answer Time per level',      tier: 1, cost: 1, maxLvl: 100, valuePerLvl: 0.1, apReq: 0  },
    critChanceT1:    { name: 'Sharpened Edge I',    desc: '+1% Crit Chance per level',        tier: 1, cost: 1, maxLvl: 10,  valuePerLvl: 1,   apReq: 0  },
    defPenT1:        { name: 'Armor Pierce I',      desc: '+1 Enemy DEF reduction per level', tier: 1, cost: 1, maxLvl: 10,  valuePerLvl: 1,   apReq: 0  },
    // ── Tier 2 (cost 2 AP, max 10, req 10 AP spent) ─────────────────
    baseHpBoostT2:   { name: 'Fortitude II',        desc: '+10 Base HP per level',            tier: 2, cost: 2, maxLvl: 10,  valuePerLvl: 10,  apReq: 10 },
    baseAtkT2:       { name: 'Might II',            desc: '+2 Base ATK per level',            tier: 2, cost: 2, maxLvl: 10,  valuePerLvl: 2,   apReq: 10 },
    baseDefT2:       { name: 'Resilience II',       desc: '+2 Base DEF per level',            tier: 2, cost: 2, maxLvl: 10,  valuePerLvl: 2,   apReq: 10 },
    baseSpdT2:       { name: 'Alacrity II',         desc: '+2 Base SPD per level',            tier: 2, cost: 2, maxLvl: 10,  valuePerLvl: 2,   apReq: 10 },
    expGainT2:       { name: 'Wisdom II',           desc: '+2% Additive EXP Gain/lvl',        tier: 2, cost: 2, maxLvl: 10,  valuePerLvl: 2,   apReq: 10 },
    critChanceT2:    { name: 'Sharpened Edge II',   desc: '+2% Crit Chance per level',        tier: 2, cost: 2, maxLvl: 10,  valuePerLvl: 2,   apReq: 10 },
    weaknessAmpT2:   { name: 'Exploit Weakness',    desc: '+5% Weakness bonus dmg per level', tier: 2, cost: 2, maxLvl: 10,  valuePerLvl: 5,   apReq: 10 },
    parryBoostT2:    { name: 'Iron Guard',          desc: 'Parry reduces dmg by +5% per lvl', tier: 2, cost: 2, maxLvl: 10,  valuePerLvl: 5,   apReq: 10 },
    // ── Tier 3 (cost 3 AP, max 5, req 30 AP spent) ──────────────────
    multExpGainT3:   { name: 'Enlightenment',       desc: '+2% Multiplicative EXP/lvl',       tier: 3, cost: 3, maxLvl: 5,   valuePerLvl: 2,   apReq: 30 },
    bonusStatPtsT3:  { name: 'Potential Unleashed', desc: '+1 Bonus Stat Point at Lvl 1',     tier: 3, cost: 3, maxLvl: 5,   valuePerLvl: 1,   apReq: 30 },
    survivorT3:      { name: 'Last Stand',          desc: '+15 HP when falling below 25% HP', tier: 3, cost: 3, maxLvl: 5,   valuePerLvl: 15,  apReq: 30 },
    counterT3:       { name: 'Riposte',             desc: 'On correct parry: +10% ATK next attack per level', tier: 3, cost: 3, maxLvl: 5, valuePerLvl: 10, apReq: 30 },
    // ── Tier 4 (cost 4 AP, max 3, req 60 AP spent) ──────────────────
    godhandT4:       { name: 'God Hand',            desc: '+25 Base ATK per level',           tier: 4, cost: 4, maxLvl: 3,   valuePerLvl: 25,  apReq: 60 },
    titanHpT4:       { name: 'Titan\'s Heart',      desc: '+50 Base HP per level',            tier: 4, cost: 4, maxLvl: 3,   valuePerLvl: 50,  apReq: 60 },
    explosionT4:     { name: 'Overkill',            desc: '+10% Multiplicative EXP per level',tier: 4, cost: 4, maxLvl: 3,   valuePerLvl: 10,  apReq: 60 },
    timebendT4:      { name: 'Time Bend',           desc: '+1.0s Answer Time per level',      tier: 4, cost: 4, maxLvl: 3,   valuePerLvl: 1.0, apReq: 60 },
    // ── Tier 5 (cost 5 AP, max 1, req 100 AP spent) ─────────────────
    ultimateT5:      { name: 'Transcendence',       desc: '+10% all damage, +10% EXP, +20 base HP, -1 AP rebirth cost', tier: 5, cost: 5, maxLvl: 1, valuePerLvl: 1, apReq: 100 },
    legendaryT5:     { name: 'Legendary Will',      desc: '+5 Stat Points at Lv.1 per Rebirth', tier: 5, cost: 5, maxLvl: 1, valuePerLvl: 5, apReq: 100 },
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
        hpBonus:          lvl('baseHpBoostT1') * 5   + lvl('baseHpBoostT2') * 10  + lvl('titanHpT4') * 50 + (lvl('ultimateT5') * 20),
        atkBonus:         lvl('baseAtkT1') * 1        + lvl('baseAtkT2') * 2       + lvl('godhandT4') * 25,
        defBonus:         lvl('baseDefT1') * 1        + lvl('baseDefT2') * 2,
        spdBonus:         lvl('baseSpdT1') * 1        + lvl('baseSpdT2') * 2,
        additiveExpPct:   lvl('expGainT1') * 1        + lvl('expGainT2') * 2,
        multExpPct:       lvl('multExpGainT3') * 2    + lvl('explosionT4') * 10    + (lvl('ultimateT5') * 10),
        bonusStatPts:     lvl('bonusStatPtsT3') * 1   + lvl('legendaryT5') * 5,
        answerTimeSecs:   lvl('answerTimeBonus') * 0.1 + lvl('timebendT4') * 1.0,
        // Combat modifiers
        critChanceBonus:  lvl('critChanceT1') * 1     + lvl('critChanceT2') * 2,   // additive %
        defPenBonus:      lvl('defPenT1') * 1,                                      // flat DEF reduction on enemy
        weaknessAmpBonus: lvl('weaknessAmpT2') * 5,                                 // bonus % on weakness hit (added to 1.75)
        parryBoostBonus:  lvl('parryBoostT2') * 5,                                  // extra % parry reduction
        survivorHpBonus:  lvl('survivorT3') * 15,                                   // HP restored at low health trigger
        counterAtkPct:    lvl('counterT3') * 10,                                    // % ATK bonus after parry
        transcendence:    lvl('ultimateT5') > 0,                                    // flat +10% dmg flag
    };
}

/** AP gained on rebirth */
export function calcRebirthAp(playerLevel) {
    return Math.floor(playerLevel / REBIRTH_AP_DIVIDER);
}