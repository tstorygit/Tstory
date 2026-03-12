const SAVE_KEY = 'vocabcraft_save';

// All skills use triangular SP costs (Level N costs N SP).
export const SKILL_DEFS = {
    // ── Economy (CAPPED) ──────────────────────────────────────────────────────
    startMana:       { name: "Arcane Reserves",    desc: "+20 starting mana per level.",                        max: 50, group: 'economy' },
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
    blueMastery:     { name: "Sapphire Mastery",   desc: "+1% Slow strength per level.",                        max: Infinity, group: 'mastery' },
    greenMastery:    { name: "Emerald Mastery",    desc: "+2% Poison DPS per level.",                           max: Infinity, group: 'mastery' },
    orangeMastery:   { name: "Topaz Mastery",      desc: "+0.2 flat mana leech per hit per level.",             max: Infinity, group: 'mastery' },
    yellowMastery:   { name: "Citrine Mastery",    desc: "+0.5% crit chance per level.",                        max: Infinity, group: 'mastery' },
    purpleMastery:   { name: "Amethyst Mastery",   desc: "+0.1 flat armor tear per hit per level.",             max: Infinity, group: 'mastery' },

    // ── Utility (UNCAPPED except Haste) ───────────────────────────────────────
    trapSpecialty:   { name: "Trap Specialization",desc: "Traps shoot 1% faster, deal +1% base dmg, and have +0.1 special multiplier per level.", max: Infinity, group: 'utility' },
    resonance:       { name: "Resonance",          desc: "+2% global damage per level.",                        max: Infinity, group: 'utility' },
    haste:           { name: "Haste",              desc: "+2% global firing speed per level.",                  max: 50,       group: 'utility' },
    scholarGrace:    { name: "Scholar's Grace",    desc: "+0.5% dmg per combo stack per level.",                max: Infinity, group: 'utility' }
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
            trapSpecialty: 0, resonance: 0, haste: 0, scholarGrace: 0
        },
        highestTierCleared: 0
    };
}

export function loadMeta() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return getDefaultSave();
        const parsed = JSON.parse(raw);
        
        // Migrate legacy trapEng to trapSpecialty
        if (parsed.skills && parsed.skills.trapEng !== undefined) {
            parsed.skills.trapSpecialty = parsed.skills.trapEng;
            delete parsed.skills.trapEng;
        }
        
        return { ...getDefaultSave(), ...parsed, skills: { ...getDefaultSave().skills, ...parsed.skills } };
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
            // Refund the exact triangular sum of SP spent: (N * (N + 1)) / 2
            meta.sp += (lvl * (lvl + 1)) / 2;
            meta.skills[key] = 0;
        }
    }
    saveMeta(meta);
}