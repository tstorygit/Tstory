// main/js/games/tower/tower_data.js

export const UPGRADES = {
    offense: {
        damage:     { name: 'Damage',        base: 1,   step: 1,     baseCost: 10,  costMult: 1.15, isPct: false },
        atkSpeed:   { name: 'Attack Speed',  base: 1.0, step: 0.1,   baseCost: 15,  costMult: 1.20, isPct: false, max: 10 },
        range:      { name: 'Range',         base: 60,  step: 4,     baseCost: 20,  costMult: 1.10, isPct: false, max: 200 },
        critChance: { name: 'Crit Chance',   base: 0,   step: 0.01,  baseCost: 50,  costMult: 1.30, isPct: true,  max: 0.8 },
        critMult:   { name: 'Crit Factor',   base: 1.5, step: 0.2,   baseCost: 50,  costMult: 1.30, isPct: false }
    },
    defense: {
        health:     { name: 'Health',        base: 10,  step: 5,     baseCost: 10,  costMult: 1.15, isPct: false },
        regen:      { name: 'Health Regen',  base: 0,   step: 0.5,   baseCost: 25,  costMult: 1.20, isPct: false },
        defAbs:     { name: 'Defense (Abs)', base: 0,   step: 1,     baseCost: 20,  costMult: 1.20, isPct: false },
        defPct:     { name: 'Defense (%)',   base: 0,   step: 0.005, baseCost: 100, costMult: 1.40, isPct: true,  max: 0.9 },
        lifesteal:  { name: 'Lifesteal',     base: 0,   step: 0.005, baseCost: 200, costMult: 1.50, isPct: true,  max: 0.5 },
        thorns:     { name: 'Thorns Dmg',    base: 0,   step: 0.05,  baseCost: 50,  costMult: 1.30, isPct: true }
    },
    utility: {
        cashBonus:  { name: 'Cash Bonus',    base: 1,   step: 0.05,  baseCost: 50,  costMult: 1.30, isPct: false },
        coinsWave:  { name: 'Coins / Wave',  base: 0,   step: 1,     baseCost: 250, costMult: 1.60, isPct: false },
        freeUpg:    { name: 'Free Upgrade',  base: 0,   step: 0.005, baseCost: 500, costMult: 1.80, isPct: true,  max: 0.5 }
    }
};

export const LAB_RESEARCH = {
    knowledge: { name: 'Vocab Multiplier', desc: '+0.5% Buff per correct vocab answer.', baseCost: 10, costMult: 2.0, baseTimeSec: 60 },
    gameSpeed: { name: 'Game Speed',       desc: '+10% Simulation speed.',               baseCost: 25, costMult: 2.5, baseTimeSec: 180, max: 10 },
    coinYield: { name: 'Coin Yield',       desc: '+10% Coins dropped upon death.',       baseCost: 50, costMult: 2.0, baseTimeSec: 300 }
};

export function calcStat(category, id, wsLvl, runLvl) {
    const def = UPGRADES[category][id];
    let val = def.base + (wsLvl * def.step) + (runLvl * def.step);
    if (def.max !== undefined && val > def.max) val = def.max;
    return val;
}

export function calcCost(category, id, level, isWorkshop) {
    const def = UPGRADES[category][id];
    // Workshop costs Coins and scales much harder. In-run costs Cash.
    const base = isWorkshop ? def.baseCost * 2 : def.baseCost;
    const mult = isWorkshop ? def.costMult * 1.1 : def.costMult;
    return Math.floor(base * Math.pow(mult, level));
}

export function calcLabCost(id, level) {
    const def = LAB_RESEARCH[id];
    return Math.floor(def.baseCost * Math.pow(def.costMult, level));
}

export function calcLabTimeMs(id, level) {
    const def = LAB_RESEARCH[id];
    return Math.floor(def.baseTimeSec * Math.pow(1.5, level) * 1000);
}