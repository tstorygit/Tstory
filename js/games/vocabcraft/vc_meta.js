const SAVE_KEY = 'vocabcraft_save';

// All skills use triangular SP costs (Level N costs N SP).
export const SKILL_DEFS = {
    // ── Economy (CAPPED) ──────────────────────────────────────────────────────
    startMana:       { name: "Arcane Reserves",    desc: "+30 starting mana per level. Base is 300 (matches GCFW).",                        max: 50, group: 'economy' },
    towerDiscount:   { name: "Mason's Art",        desc: "-1% Tower build cost per level (max 50%).",           max: 50, group: 'economy' },
    trapDiscount:    { name: "Trap Smith",         desc: "-1% Trap build cost per level (max 50%).",            max: 50, group: 'economy' },
    combineDiscount: { name: "Arcane Fusion",      desc: "-1% gem combine fee per level (max 50%).",            max: 50, group: 'economy' },

    // ── Gem forging costs (1%/lv, compounds through upgrades) (CAPPED) ───────
    redCost:         { name: "Ruby Forging",       desc: "-1% Ruby base & combine cost per level (max 50%).",   max: 50, group: 'gems' },
    blueCost:        { name: "Sapphire Forging",   desc: "-1% Sapphire base & combine cost per level (max 50%).",max: 50, group: 'gems' },
    greenCost:       { name: "Emerald Forging",    desc: "-1% Emerald base & combine cost per level (max 50%).", max: 50, group: 'gems' },
    orangeCost:      { name: "Topaz Forging",      desc: "-1% Topaz base & combine cost per level (max 50%).",   max: 50, group: 'gems' },
    yellowCost:      { name: "Citrine Forging",    desc: "-1% Citrine base & combine cost per level (max 50%).", max: 50, group: 'gems' },
    purpleCost:      { name: "Amethyst Forging",   desc: "-1% Amethyst base & combine cost per level (max 50%).",max: 50, group: 'gems' },

    // ── Gem combat masteries (UNCAPPED) ───────────────────────────────────────
    redMastery:      { name: "Ruby Mastery",       desc: "+1% Ruby damage per level.",                          max: Infinity, group: 'mastery' },
    blueMastery:     { name: "Sapphire Mastery",   desc: "+5% Slow duration per level.",                        max: Infinity, group: 'mastery' },
    greenMastery:    { name: "Emerald Mastery",    desc: "+3% Poison DPS per level.",                           max: Infinity, group: 'mastery' },
    orangeMastery:   { name: "Topaz Mastery",      desc: "+4% mana leech per hit per level.",             max: Infinity, group: 'mastery' },
    yellowMastery:   { name: "Citrine Mastery",    desc: "+0.5% crit chance per level.",                        max: Infinity, group: 'mastery' },
    purpleMastery:   { name: "Amethyst Mastery",   desc: "+4% armor tear per hit per level.",             max: Infinity, group: 'mastery' },

    // ── Utility (UNCAPPED except Haste) ───────────────────────────────────────
    trapSpecialty:   { name: "Trap Specialization",desc: "Traps shoot 1% faster, deal +1% base dmg, and have +0.1 special multiplier per level.", max: Infinity, group: 'utility' },
    resonance:       { name: "Resonance",          desc: "+3% global damage per level.",                        max: Infinity, group: 'utility' },
    haste:           { name: "Haste",              desc: "+2% global firing speed per level.",                  max: 50,       group: 'utility' },
    scholarGrace:    { name: "Scholar's Grace",    desc: "+0.5% combo damage coefficient per level. Base: ×(1 + log(kills) × 10%).",  max: Infinity, group: 'utility' },
    comboKeep:       { name: "Combo Mastery",       desc: "+1s combo window per level. Base window: 5s before combo starts to decay.",     max: Infinity, group: 'utility' },
    bonusWaves:      { name: "Arcane Endurance",   desc: "+3 waves per level. More enemies = more XP.",          max: Infinity, group: 'utility' }
};

export function getDefaultSave() {
    return {
        xp: 0,
        level: 1,
        sp: 0,
        skills: {
            startMana: 0, towerDiscount: 0, trapDiscount: 0, combineDiscount: 0,
            redCost: 0, blueCost: 0, greenCost: 0, orangeCost: 0, yellowCost: 0, purpleCost: 0,
            redMastery: 0, blueMastery: 0, greenMastery: 0,
            orangeMastery: 0, yellowMastery: 0, purpleMastery: 0,
            trapSpecialty: 0, resonance: 0, haste: 0, scholarGrace: 0, comboKeep: 0, bonusWaves: 0
        },
        // Per-run active level — can be set to any value 0..skills[key].
        // Skills not listed here always use their full purchased level.
        activeSkills: {
            bonusWaves: 0, startMana: 0, resonance: 0, haste: 0,
            scholarGrace: 0, comboKeep: 0, trapSpecialty: 0
        },
        clearedStages: {}
    };
}

export function loadMeta() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return getDefaultSave();
        const parsed = JSON.parse(raw);

        // Migrate legacy trapEng → trapSpecialty
        if (parsed.skills && parsed.skills.trapEng !== undefined) {
            parsed.skills.trapSpecialty = parsed.skills.trapEng;
            delete parsed.skills.trapEng;
        }

        // Migrate legacy highestTierCleared → clearedStages
        if (parsed.highestTierCleared > 0 && !parsed.clearedStages) {
            parsed.clearedStages = {};
            for (let d = 1; d <= parsed.highestTierCleared; d++) {
                parsed.clearedStages[`gauntlet:${d}`] = true;
            }
        }
        delete parsed.highestTierCleared;

        const def = getDefaultSave();
        return {
            ...def,
            ...parsed,
            skills: { ...def.skills, ...parsed.skills },
            activeSkills: { ...def.activeSkills, ...(parsed.activeSkills || {}) },
            clearedStages: { ...(parsed.clearedStages || {}) }
        };
    } catch {
        return getDefaultSave();
    }
}

export function saveMeta(meta) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(meta));
}

export function addXP(meta, amount) {
    meta.xp += amount;
    
    // GCFW-style Polynomial EXP curve (Base * Level^1.8) 
    // Prevents Infinity breaks while allowing Wizard Levels in the 10,000s
    let nextLevelReq = Math.floor(100 * Math.pow(meta.level, 1.8));
    
    while (meta.xp >= nextLevelReq) {
        meta.xp -= nextLevelReq;
        meta.level++;
        meta.sp++;
        nextLevelReq = Math.floor(100 * Math.pow(meta.level, 1.8));
    }
    saveMeta(meta);
}

export function resetSkills(meta) {
    for (const key in meta.skills) {
        const lvl = meta.skills[key];
        if (lvl > 0) {
            meta.sp += (lvl * (lvl + 1)) / 2;
            meta.skills[key] = 0;
        }
    }
    saveMeta(meta);
}

/** Returns a skills object where tunable skills use their activeSkills level (capped to purchased). */
export function getEffectiveSkills(meta) {
    const result = { ...meta.skills };
    const active = meta.activeSkills || {};
    for (const key of Object.keys(active)) {
        if (key in result) {
            result[key] = Math.min(result[key], Math.max(0, active[key] ?? result[key]));
        }
    }
    return result;
}
export function clearStage(meta, templateId, difficulty) {
    meta.clearedStages[`${templateId}:${difficulty}`] = true;
    saveMeta(meta);
}

/** Highest difficulty cleared on ANY template — drives template unlock gates. */
export function highestDifficultyCleared(meta) {
    let max = 0;
    for (const key of Object.keys(meta.clearedStages)) {
        const d = parseInt(key.split(':')[1], 10);
        if (!isNaN(d) && d > max) max = d;
    }
    return max;
}

/** True if templateId:difficulty has been cleared. */
export function isStageCleared(meta, templateId, difficulty) {
    return !!meta.clearedStages[`${templateId}:${difficulty}`];
}

/** True if templateId:difficulty is playable (previous difficulty cleared, or D1). */
export function isStageUnlocked(meta, templateId, difficulty) {
    if (difficulty === 1) return true;
    return !!meta.clearedStages[`${templateId}:${difficulty - 1}`];
}