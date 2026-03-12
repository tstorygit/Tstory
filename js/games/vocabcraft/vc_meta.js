const SAVE_KEY = 'vocabcraft_save';

export const SKILL_DEFS = {
    // ── Economy: mana income ──────────────────────────────────────────────────
    startMana:      { name: "Starting Mana",      desc: "+50 Starting Mana per level.", max: 10, group: 'economy' },

    // ── Economy: building costs ───────────────────────────────────────────────
    towerDiscount:  { name: "Mason's Art",         desc: "-5% Tower cost per level.",   max: 5,  group: 'economy' },
    trapDiscount:   { name: "Trap Smith",          desc: "-5% Trap cost per level.",    max: 5,  group: 'economy' },

    // ── Economy: gem costs ────────────────────────────────────────────────────
    gemDiscount:    { name: "Gem Cutter",          desc: "-5% base gem cost per level (all colors).", max: 5, group: 'economy' },
    combineDiscount:{ name: "Arcane Fusion",       desc: "-5% combine fee per level.",  max: 10, group: 'economy' },

    // ── Per-gem color cost discounts ──────────────────────────────────────────
    redCost:        { name: "Ruby Forging",        desc: "-8% Ruby purchase/upgrade cost per level.",    max: 5, group: 'gems' },
    blueCost:       { name: "Sapphire Forging",    desc: "-8% Sapphire purchase/upgrade cost per level.",max: 5, group: 'gems' },
    greenCost:      { name: "Emerald Forging",     desc: "-8% Emerald purchase/upgrade cost per level.", max: 5, group: 'gems' },
    orangeCost:     { name: "Topaz Forging",       desc: "-8% Topaz purchase/upgrade cost per level.",   max: 5, group: 'gems' },
    yellowCost:     { name: "Citrine Forging",     desc: "-8% Citrine purchase/upgrade cost per level.", max: 5, group: 'gems' },
    purpleCost:     { name: "Amethyst Forging",    desc: "-8% Amethyst purchase/upgrade cost per level.",max: 5, group: 'gems' },

    // ── Gem combat masteries ──────────────────────────────────────────────────
    redMastery:     { name: "Ruby Mastery",        desc: "+10% Red Gem Damage.",           max: 10, group: 'mastery' },
    blueMastery:    { name: "Sapphire Mastery",    desc: "+5% Blue Slow Effect.",           max: 10, group: 'mastery' },
    greenMastery:   { name: "Emerald Mastery",     desc: "+15% Green Poison Damage.",       max: 10, group: 'mastery' },
    orangeMastery:  { name: "Topaz Mastery",       desc: "+1 Mana Leech per hit.",          max: 10, group: 'mastery' },
    yellowMastery:  { name: "Citrine Mastery",     desc: "+2% Crit Chance.",                max: 10, group: 'mastery' },
    purpleMastery:  { name: "Amethyst Mastery",    desc: "+1 Armor Tear per hit.",          max: 10, group: 'mastery' },

    // ── Utility ───────────────────────────────────────────────────────────────
    trapEng:        { name: "Trap Engineering",    desc: "+10% Trap Fire Rate.",            max: 5,  group: 'utility' },
    scholarGrace:   { name: "Scholar's Grace",     desc: "+2% Global Damage per Combo.",   max: 5,  group: 'utility' }
};

export function getDefaultSave() {
    return {
        xp: 0,
        level: 1,
        sp: 0,
        skills: {
            // economy
            startMana: 0, towerDiscount: 0, trapDiscount: 0,
            gemDiscount: 0, combineDiscount: 0,
            // per-color cost
            redCost: 0, blueCost: 0, greenCost: 0,
            orangeCost: 0, yellowCost: 0, purpleCost: 0,
            // mastery
            redMastery: 0, blueMastery: 0, greenMastery: 0,
            orangeMastery: 0, yellowMastery: 0, purpleMastery: 0,
            // utility
            trapEng: 0, scholarGrace: 0
        },
        highestTierCleared: 0
    };
}

export function loadMeta() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return getDefaultSave();
        const parsed = JSON.parse(raw);
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
    let nextLevelReq = meta.level * 1000;
    while (meta.xp >= nextLevelReq) {
        meta.xp -= nextLevelReq;
        meta.level++;
        meta.sp++;
        nextLevelReq = meta.level * 1000;
    }
    saveMeta(meta);
}