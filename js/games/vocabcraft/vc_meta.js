const SAVE_KEY = 'vocabcraft_save';

export const SKILL_DEFS = {
    startMana: { name: "Starting Mana", desc: "+50 Starting Mana per level.", max: 10 },
    redMastery: { name: "Ruby Mastery", desc: "+10% Red Gem Damage.", max: 10 },
    blueMastery: { name: "Sapphire Mastery", desc: "+5% Blue Slow Effect.", max: 10 },
    greenMastery: { name: "Emerald Mastery", desc: "+15% Green Poison Damage.", max: 10 },
    orangeMastery: { name: "Topaz Mastery", desc: "+1 Mana Leech per hit.", max: 10 },
    yellowMastery: { name: "Citrine Mastery", desc: "+2% Crit Chance.", max: 10 },
    purpleMastery: { name: "Amethyst Mastery", desc: "+1 Armor Tear per hit.", max: 10 },
    trapEng: { name: "Trap Engineering", desc: "+10% Trap Fire Rate.", max: 5 },
    scholarGrace: { name: "Scholar's Grace", desc: "+2% Global Damage per Combo stack.", max: 5 }
};

export function getDefaultSave() {
    return {
        xp: 0,
        level: 1,
        sp: 0,
        skills: {
            startMana: 0, redMastery: 0, blueMastery: 0, greenMastery: 0,
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