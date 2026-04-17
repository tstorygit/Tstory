// main/js/games/tower/tower_data.js

export const UPGRADES = {
    offense: {
        damage:     { name: 'Damage',        base: 5,   step: 2,     baseCost: 10,  costMult: 1.15, isPct: false },
        atkSpeed:   { name: 'Attack Speed',  base: 1.0, step: 0.1,   baseCost: 15,  costMult: 1.18, isPct: false, max: 10 },
        range:      { name: 'Range',         base: 120, step: 4,     baseCost: 20,  costMult: 1.18, isPct: false, max: 300 },
        splashDmg:  { name: 'Splash Damage', base: 0,   step: 0.05,  baseCost: 200, costMult: 1.40, isPct: true,  max: 1.0, reqUnlock: true, unlockCost: 500 },
        dmgMeter:   { name: 'Damage/Meter',  base: 0,   step: 0.001, baseCost: 100, costMult: 1.30, isPct: true,  max: 0.2, reqUnlock: true, unlockCost: 400 },
        bounce:     { name: 'Bounce Shot',   base: 0,   step: 0.05,  baseCost: 150, costMult: 1.5, isPct: true,  max: 0.8, reqUnlock: true, unlockCost: 500 },
        critChance: { name: 'Crit Chance',   base: 0,   step: 0.02,  baseCost: 50,  costMult: 1.45, isPct: true,  max: 0.8, reqUnlock: true, unlockCost: 200 },
        critMult:   { name: 'Crit Factor',   base: 1.5, step: 0.2,   baseCost: 50,  costMult: 1.25, isPct: false, reqUnlock: true, unlockCost: 250 }
    },
    defense: {
        health:     { name: 'Health',        base: 50,  step: 15,    baseCost: 10,  costMult: 1.15, isPct: false },
        regen:      { name: 'Health Regen',  base: 0,   step: 1,     baseCost: 20,  costMult: 1.20, isPct: false },
        defAbs:     { name: 'Defense (Abs)', base: 0,   step: 2,     baseCost: 20,  costMult: 1.20, isPct: false },
        defPct:     { name: 'Defense (%)',   base: 0,   step: 0.01,  baseCost: 100, costMult: 1.35, isPct: true,  max: 0.75, reqUnlock: true, unlockCost: 500 },
        lifesteal:  { name: 'Lifesteal',     base: 0,   step: 0.005, baseCost: 200, costMult: 1.40, isPct: true,  max: 0.5, reqUnlock: true, unlockCost: 1000 },
        knockback:  { name: 'Knockback',     base: 0,   step: 0.05,  baseCost: 250, costMult: 1.60, isPct: true,  max: 0.8, reqUnlock: true, unlockCost: 800 },
        thorns:     { name: 'Thorns Dmg',    base: 0,   step: 0.1,   baseCost: 50,  costMult: 1.35, isPct: true, reqUnlock: true, unlockCost: 300 },
        defyDeath:  { name: 'Defy Death',    base: 0,   step: 0.01,  baseCost: 1000,costMult: 1.60, isPct: true,  max: 0.3, reqUnlock: true, unlockCost: 2500 }
    },
    utility: {
        cashBonus:      { name: 'Cash Bonus',       base: 1,   step: 0.05,  baseCost: 50,  costMult: 1.30, isPct: true, reqUnlock: true, unlockCost: 150 },
        cashWave:       { name: 'Cash / Wave',      base: 0,   step: 5,     baseCost: 100, costMult: 1.35, isPct: false, reqUnlock: true, unlockCost: 300 },
        coinBonus:      { name: 'Coin Bonus',       base: 1,   step: 0.02,  baseCost: 500, costMult: 1.50, isPct: true, reqUnlock: true, unlockCost: 1000 },
        coinsWave:      { name: 'Coins / Wave',     base: 0,   step: 1,     baseCost: 200, costMult: 1.45, isPct: false, reqUnlock: true, unlockCost: 500 },
        interest:       { name: 'Interest/Wave',    base: 0,   step: 0.005, baseCost: 300, costMult: 1.50, isPct: true,  max: 0.1, reqUnlock: true, unlockCost: 1500 },
        freeUpgOffense: { name: 'Free Offense Upg', base: 0,   step: 0.005, baseCost: 500, costMult: 1.60, isPct: true,  max: 0.5, reqUnlock: true, unlockCost: 2000 },
        freeUpgDefense: { name: 'Free Defense Upg', base: 0,   step: 0.005, baseCost: 500, costMult: 1.60, isPct: true,  max: 0.5, reqUnlock: true, unlockCost: 2000 },
        freeUpgUtility: { name: 'Free Utility Upg', base: 0,   step: 0.005, baseCost: 500, costMult: 1.60, isPct: true,  max: 0.5, reqUnlock: true, unlockCost: 2000 }
    }
};

export const LAB_RESEARCH_CATEGORIES = {
    offense:['damageMult', 'critChance', 'rangeMult', 'vocabMastery'],
    defense:['healthMult', 'regenMult', 'defPct', 'thornsMult', 'lifesteal'],
    utility:['knowledge', 'gameSpeed', 'coinYield', 'cashBonusMult', 'startingCash', 'synergy', 'freeUpg']
};

export const LAB_RESEARCH = {
    // Offense
    damageMult:   { name: 'Damage Multiplier',desc: '+2% Base Damage.', baseCost: 200, costMult: 1.8, baseTimeSec: 120, max: 50 },
    critChance:   { name: 'Crit Chance',      desc: '+0.5% Crit Chance.', baseCost: 500, costMult: 2.0, baseTimeSec: 600, max: 30 },
    rangeMult:    { name: 'Range Multiplier', desc: '+1% Range.', baseCost: 250, costMult: 1.6, baseTimeSec: 240, max: 30 },
    vocabMastery: { name: 'Vocab Mastery',    desc: '+0.01% Base Dmg per unique correct word.', baseCost: 500, costMult: 5.0, baseTimeSec: 1200, max: 5 },
    // Defense
    healthMult:   { name: 'Health Multiplier',desc: '+5% Base Health.', baseCost: 200, costMult: 1.6, baseTimeSec: 120, max: 50 },
    regenMult:    { name: 'Regen Multiplier', desc: '+2% Health Regen.', baseCost: 250, costMult: 1.7, baseTimeSec: 180, max: 50 },
    defPct:       { name: 'Defense %',        desc: '+0.5% Defense.', baseCost: 800, costMult: 2.5, baseTimeSec: 600, max: 20 },
    thornsMult:   { name: 'Thorns Multiplier',desc: '+2% Thorns Damage.', baseCost: 400, costMult: 1.8, baseTimeSec: 360, max: 50 },
    lifesteal:    { name: 'Lifesteal',        desc: '+0.2% Lifesteal.', baseCost: 1000, costMult: 3.0, baseTimeSec: 1200, max: 25 },
    // Utility
    knowledge:    { name: 'Vocab Multiplier', desc: '+0.5% Buff per correct vocab answer.', baseCost: 500, costMult: 2.5, baseTimeSec: 300, max: 20 },
    gameSpeed:    { name: 'Game Speed',       desc: '+10% Simulation speed.', baseCost: 100, costMult: 3.0, baseTimeSec: 180, max: 10 },
    coinYield:    { name: 'Coin Yield',       desc: '+10% Coins dropped.', baseCost: 300, costMult: 2.2, baseTimeSec: 300, max: 50 },
    cashBonusMult:{ name: 'Cash Bonus Mult',  desc: '+5% Cash Earned.', baseCost: 250, costMult: 1.8, baseTimeSec: 240, max: 50 },
    startingCash: { name: 'Starting Cash',    desc: 'Start runs with +50 Cash.', baseCost: 150, costMult: 1.8, baseTimeSec: 120, max: 50 },
    synergy:      { name: 'Linguistic Synergy', desc: 'Unlocks Pierce at x2.0 Knowledge, Chain at x3.0.', baseCost: 2500, costMult: 1, baseTimeSec: 1800, max: 1 },
    freeUpg:      { name: 'Free Upgrades',    desc: '+0.5% Global Free Upgrade Chance.', baseCost: 1500, costMult: 3.0, baseTimeSec: 3600, max: 10 }
};

export const RELICS = {
    1: { name: 'Novice Seal',   desc: 'Bosses drop 3x cash.' },
    2: { name: 'Scholar Badge', desc: 'First wave has no enemies (free Knowledge).' },
    3: { name: 'Adept Token',   desc: 'Abilities charge 50% faster.' },
    4: { name: 'Expert Crest',  desc: 'Base attack speed +20%.' },
    5: { name: 'Master Crown',  desc: 'Knowledge stack value doubled.' }
};

export const TOWER_BASES = {
    default: {
        id: 'default', name: 'Standard Base', color: '#00ffff',
        desc: 'A balanced tower with no strengths or weaknesses.',
        getModifiers: (lvl) => ({})
    },
    sniper: {
        id: 'sniper', name: 'Sniper Base', color: '#2ecc71',
        desc: 'Incredible range and precision, but fires slowly.',
        getModifiers: (lvl) => ({
            rangeMult: 0.5 + (lvl * 0.1),       // +50% to +150%
            critChanceAdd: 0.5 + (lvl * 0.05),  // +50% to +100%
            atkSpeedMult: -0.5 + (lvl * 0.04)   // -50% to -10%
        }),
        maxLevel: 10
    },
    mage: {
        id: 'mage', name: 'Mage Base', color: '#9b59b6',
        desc: 'Attacks deal Splash Damage, but cannot Bounce.',
        getModifiers: (lvl) => ({
            splashDmgAdd: 0.5 + (lvl * 0.1),    // +50% to +150%
            disableBounce: true,
            damageMult: 0 + (lvl * 0.1)         // +0% to +100%
        }),
        maxLevel: 10
    },
    banker: {
        id: 'banker', name: 'Banker Base', color: '#f1c40f',
        desc: 'Massive economic gains, but reduced damage.',
        getModifiers: (lvl) => ({
            coinCashMult: 1.0 + (lvl * 0.2),    // +100% to +300%
            damageMult: -0.3 + (lvl * 0.03)     // -30% to 0%
        }),
        maxLevel: 10
    }
};

export const QUEST_TEMPLATES =[
    { id: 'kill_bosses', desc: 'Kill Bosses', max: 20, rewardType: 'gems', rewardAmount: 10 },
    { id: 'answer_vocab', desc: 'Answer Vocab Correctly', max: 50, rewardType: 'gems', rewardAmount: 15 },
    { id: 'reach_wave_no_def', desc: 'Reach Wave without buying Defense', max: 30, rewardType: 'gems', rewardAmount: 20, type: 'highest_wave' },
    { id: 'play_runs', desc: 'Play Runs', max: 3, rewardType: 'coins', rewardAmount: 500 },
    { id: 'kill_spawners', desc: 'Destroy Swarm Spawners', max: 10, rewardType: 'gems', rewardAmount: 5 }
];

export const CARDS = {
    // Common (50%)
    dmg:    { name: 'Damage',       desc: '+% Damage',       base: 0.15, step: 0.15, rarity: 'common' },
    hp:     { name: 'Health',       desc: '+% Health',       base: 0.20, step: 0.20, rarity: 'common' },
    regen:  { name: 'Health Regen', desc: '+X Regen',        base: 2,    step: 1, isFlat: true, rarity: 'common' },
    cashW:  { name: 'Cash / Wave',  desc: '+X Cash/Wave',    base: 20,   step: 10, isFlat: true, rarity: 'common' },
    coinW:  { name: 'Coins / Wave', desc: '+X Coin/Wave',    base: 5,    step: 2,  isFlat: true, rarity: 'common' },
    
    // Rare (25%)
    spd:    { name: 'Attack Speed', desc: '+% Atk Speed',    base: 0.10, step: 0.05, rarity: 'rare' },
    rng:    { name: 'Range',        desc: '+% Range',        base: 0.10, step: 0.05, rarity: 'rare' },
    defA:   { name: 'Defense Abs',  desc: '+X Def Abs',      base: 5,    step: 2, isFlat: true, rarity: 'rare' },
    defP:   { name: 'Defense %',    desc: '+% Defense',      base: 0.05, step: 0.02, maxLevel: 10, rarity: 'rare' },
    kb:     { name: 'Knockback',    desc: '+% Knockback',    base: 0.05, step: 0.02, rarity: 'rare' },
    
    // Epic (15%)
    cash:   { name: 'Cash Bonus',   desc: '+% Cash',         base: 0.15, step: 0.15, rarity: 'epic' },
    coin:   { name: 'Coin Bonus',   desc: '+% Coins',        base: 0.10, step: 0.10, rarity: 'epic' },
    critC:  { name: 'Crit Chance',  desc: '+% Crit Chance',  base: 0.02, step: 0.01, rarity: 'epic' },
    critM:  { name: 'Crit Factor',  desc: '+% Crit Factor',  base: 0.20, step: 0.10, rarity: 'epic' },
    thorns: { name: 'Thorns Dmg',   desc: '+% Thorns Dmg',   base: 0.20, step: 0.10, rarity: 'epic' },
    splash: { name: 'Splash Dmg',   desc: '+% Splash Dmg',   base: 0.05, step: 0.02, maxLevel: 10, rarity: 'epic' },
    
    // Mythic (8%)
    freeO:  { name: 'Free Offense', desc: '+% Free Off. Upg',base: 0.02, step: 0.01, maxLevel: 10, rarity: 'mythic' },
    freeD:  { name: 'Free Defense', desc: '+% Free Def. Upg',base: 0.02, step: 0.01, maxLevel: 10, rarity: 'mythic' },
    freeU:  { name: 'Free Utility', desc: '+% Free Utl. Upg',base: 0.02, step: 0.01, maxLevel: 10, rarity: 'mythic' },
    dmgM:   { name: 'Damage/Meter', desc: '+% Dmg/Meter',    base: 0.01, step: 0.005, rarity: 'mythic' },
    int:    { name: 'Interest',     desc: '+% Int./Wave',    base: 0.01, step: 0.005, maxLevel: 5, rarity: 'mythic' },
    
    // SSR (2%)
    death:  { name: 'Defy Death',   desc: '+% Defy Death',   base: 0.02, step: 0.01, maxLevel: 5, rarity: 'ssr' },
    know:   { name: 'Knowledge+',   desc: '+% Know. Buff',   base: 0.10, step: 0.05, rarity: 'ssr' },
    life:   { name: 'Lifesteal',    desc: '+% Lifesteal',    base: 0.02, step: 0.01, maxLevel: 10, rarity: 'ssr' },
    slow:   { name: 'Slow Aura',    desc: '-% Enemy Speed',  base: 0.05, step: 0.02, maxLevel: 7, rarity: 'ssr' },
    bounce: { name: 'Bounce Shot',  desc: '+% Bounce Chance',base: 0.05, step: 0.02, rarity: 'ssr' }
};

export const SLOT_COSTS =[
    { coins: 0, gems: 0 },         
    { coins: 1000, gems: 50 },     
    { coins: 5000, gems: 100 },    
    { coins: 25000, gems: 250 },   
    { coins: 100000, gems: 500 }   
];

export function getCardLevelInfo(count, maxLevel = 7) {
    const reqs =[];
    let cur = 0;
    for(let i=0; i<maxLevel; i++) {
        cur += Math.pow(2, i); 
        reqs.push(cur);
    }
    let lvl = 0;
    for (let i = 0; i < reqs.length; i++) {
        if (count >= reqs[i]) lvl = i + 1;
        else break;
    }
    let nextReq = lvl < reqs.length ? reqs[lvl] : null;
    let currentBase = lvl > 0 ? reqs[lvl - 1] : 0;
    let progress = nextReq ? (count - currentBase) : 0;
    let goal = nextReq ? (nextReq - currentBase) : 1;
    return { level: lvl, progress, goal, isMax: !nextReq, maxCards: reqs[reqs.length-1] };
}

export function calcStat(category, id, wsLvl, runLvl) {
    const def = UPGRADES[category][id];
    let val = def.base + (wsLvl * def.step) + (runLvl * def.step);
    if (def.max !== undefined && val > def.max) val = def.max;
    return val;
}

export function getUpgradeMaxLevel(category, id) {
    const def = UPGRADES[category][id];
    if (def.max !== undefined) {
        return Math.round((def.max - def.base) / def.step);
    }
    return null;
}

export function calcCost(category, id, level, isWorkshop) {
    const def = UPGRADES[category][id];
    const base = isWorkshop ? def.baseCost * 3 : def.baseCost;
    const mult = isWorkshop ? def.costMult * 1.15 : def.costMult;
    return Math.floor(base * Math.pow(mult, level));
}

export function getMultiBuy(category, id, startLvl, requestMode, currentCurrency, isWorkshop) {
    const def = UPGRADES[category][id];
    let totalCost = 0;
    let count = 0;
    let limit = 1;
    
    if (requestMode === '5') limit = 5;
    if (requestMode === '10') limit = 10;
    if (requestMode === 'MAX') limit = Infinity;
    
    let lvl = startLvl;
    
    while (count < limit) {
        let statVal = calcStat(category, id, isWorkshop ? lvl : 0, isWorkshop ? 0 : lvl);
        if (def.max !== undefined && statVal >= def.max) break; 
        
        let c = calcCost(category, id, lvl, isWorkshop);
        if (totalCost + c > currentCurrency) break; 
        
        totalCost += c;
        count++;
        lvl++;
    }
    
    if (count === 0) {
        let statVal = calcStat(category, id, isWorkshop ? lvl : 0, isWorkshop ? 0 : lvl);
        let isMaxed = def.max !== undefined && statVal >= def.max;
        return { cost: calcCost(category, id, lvl, isWorkshop), count: 1, maxed: isMaxed };
    }
    
    return { cost: totalCost, count: count, maxed: false };
}

export function calcLabCost(id, level) {
    const def = LAB_RESEARCH[id];
    return Math.floor(def.baseCost * Math.pow(def.costMult, level));
}

export function calcLabTimeMs(id, level) {
    const def = LAB_RESEARCH[id];
    return Math.floor(def.baseTimeSec * Math.pow(1.5, level) * 1000);
}