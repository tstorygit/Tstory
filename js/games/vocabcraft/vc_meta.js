const SAVE_KEY = 'vocabcraft_save';

// All skills use max:20 and small-per-level increments (like GC2's node system).
// Cost-reduction skills: 1%/level → max −20%. Mastery skills: small flat/% per level.
export const SKILL_DEFS = {
    // ── Economy ───────────────────────────────────────────────────────────────
    startMana:       { name: "Arcane Reserves",    desc: "+25 starting mana per level (max +500).",             max: 20, group: 'economy' },
    towerDiscount:   { name: "Mason's Art",        desc: "-1% Tower build cost per level (max -40%).",          max: 40, group: 'economy' },
    trapDiscount:    { name: "Trap Smith",         desc: "-1% Trap build cost per level (max -40%).",           max: 40, group: 'economy' },
    combineDiscount: { name: "Arcane Fusion",      desc: "-1% gem combine fee per level (max -40%).",           max: 40, group: 'economy' },

    // ── Gem forging costs (1%/lv, compounds through upgrades) ────────────────
    redCost:         { name: "Ruby Forging",       desc: "-1% Ruby base & combine cost per level (max -40%).",    max: 40, group: 'gems' },
    blueCost:        { name: "Sapphire Forging",   desc: "-1% Sapphire base & combine cost per level (max -40%).",max: 40, group: 'gems' },
    greenCost:       { name: "Emerald Forging",    desc: "-1% Emerald base & combine cost per level (max -40%).", max: 40, group: 'gems' },
    orangeCost:      { name: "Topaz Forging",      desc: "-1% Topaz base & combine cost per level (max -40%).",   max: 40, group: 'gems' },
    yellowCost:      { name: "Citrine Forging",    desc: "-1% Citrine base & combine cost per level (max -40%).", max: 40, group: 'gems' },
    purpleCost:      { name: "Amethyst Forging",   desc: "-1% Amethyst base & combine cost per level (max -40%).",max: 40, group: 'gems' },

    // ── Gem combat masteries ──────────────────────────────────────────────────
    redMastery:      { name: "Ruby Mastery",       desc: "+1% Ruby damage per level (max +20%).",                max: 20, group: 'mastery' },
    blueMastery:     { name: "Sapphire Mastery",   desc: "+1% Slow strength per level (max +20%).",              max: 20, group: 'mastery' },
    greenMastery:    { name: "Emerald Mastery",    desc: "+2% Poison DPS per level (max +40%).",                 max: 20, group: 'mastery' },
    orangeMastery:   { name: "Topaz Mastery",      desc: "+0.2 flat mana leech per hit per level (max +4).",     max: 20, group: 'mastery' },
    yellowMastery:   { name: "Citrine Mastery",    desc: "+0.5% crit chance per level (max +10%).",              max: 20, group: 'mastery' },
    purpleMastery:   { name: "Amethyst Mastery",   desc: "+0.1 flat armor tear per hit per level (max +2).",     max: 20, group: 'mastery' },

    // ── Utility ───────────────────────────────────────────────────────────────
    trapEng:         { name: "Trap Engineering",   desc: "+1% Trap fire rate per level (max +20%).",             max: 20, group: 'utility' },
    scholarGrace:    { name: "Scholar's Grace",    desc: "+0.5% global damage per combo stack per level.",       max: 20, group: 'utility' }
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