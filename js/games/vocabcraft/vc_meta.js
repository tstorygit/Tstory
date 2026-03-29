const SAVE_KEY = 'vocabcraft_save';

// All skills use triangular SP costs (Level N costs N SP).
export const SKILL_DEFS = {
    // ── Economy (CAPPED at 20 — max effect same as before, 2.5× per level) ──
    startMana:       { name: "Arcane Reserves",    desc: "+50 starting mana per level (max 20 = +1000). Base is 300.",               max: 20, group: 'economy' },
    towerDiscount:   { name: "Mason's Art",        desc: "-2.5% Tower build cost per level (max 20 = -50%).",                        max: 20, group: 'economy' },
    trapDiscount:    { name: "Trap Smith",         desc: "-2.5% Trap build cost per level (max 20 = -50%).",                         max: 20, group: 'economy' },
    combineDiscount: { name: "Arcane Fusion",      desc: "-2.5% gem combine fee per level (max 20 = -50%).",                         max: 20, group: 'economy' },

    // ── Gem forging costs (2.5%/lv, compounds through upgrades) (CAPPED) ────
    redCost:         { name: "Ruby Forging",       desc: "-2.5% Ruby base & combine cost per level (max 20 = -50%).",                max: 20, group: 'gems' },
    blueCost:        { name: "Sapphire Forging",   desc: "-2.5% Sapphire base & combine cost per level (max 20 = -50%).",            max: 20, group: 'gems' },
    greenCost:       { name: "Emerald Forging",    desc: "-2.5% Emerald base & combine cost per level (max 20 = -50%).",             max: 20, group: 'gems' },
    orangeCost:      { name: "Topaz Forging",      desc: "-2.5% Topaz base & combine cost per level (max 20 = -50%).",               max: 20, group: 'gems' },
    yellowCost:      { name: "Citrine Forging",    desc: "-2.5% Citrine base & combine cost per level (max 20 = -50%).",             max: 20, group: 'gems' },
    purpleCost:      { name: "Amethyst Forging",   desc: "-2.5% Amethyst base & combine cost per level (max 20 = -50%).",            max: 20, group: 'gems' },

    // ── Gem combat masteries (UNCAPPED — ~30 levels for a full build) ────────
    redMastery:      { name: "Ruby Mastery",       desc: "+2% Ruby damage per level.",                                               max: Infinity, group: 'mastery' },
    blueMastery:     { name: "Sapphire Mastery",   desc: "+10% Slow duration per level.",                                            max: Infinity, group: 'mastery' },
    greenMastery:    { name: "Emerald Mastery",    desc: "+5% Poison DPS per level.",                                                max: Infinity, group: 'mastery' },
    orangeMastery:   { name: "Topaz Mastery",      desc: "+6% mana leech per hit per level.",                                        max: Infinity, group: 'mastery' },
    yellowMastery:   { name: "Citrine Mastery",    desc: "+1% crit chance per level.",                                               max: Infinity, group: 'mastery' },
    purpleMastery:   { name: "Amethyst Mastery",   desc: "+6% armor tear per hit per level.",                                        max: Infinity, group: 'mastery' },

    // ── Utility (UNCAPPED except Haste) ───────────────────────────────────────
    trapSpecialty:   { name: "Trap Specialization",desc: "Traps shoot 1.5% faster, deal +1.5% base dmg, and have +0.075 special multiplier per level.", max: Infinity, group: 'utility' },
    resonance:       { name: "Resonance",          desc: "+4% global damage per level.",                                             max: Infinity, group: 'utility' },
    haste:           { name: "Haste",              desc: "+3% global firing speed per level (max 20 = +60%).",                       max: 20,       group: 'utility' },
    scholarGrace:    { name: "Scholar's Grace",    desc: "+0.75% combo damage coefficient per level. Base: ×(1 + log(kills) × 20%).", max: Infinity, group: 'utility' },
    comboKeep:       { name: "Combo Mastery",       desc: "+1.5s combo window per level. Base window: 5s before combo starts to decay.", max: Infinity, group: 'utility' },
    bonusWaves:      { name: "Arcane Endurance",   desc: "+3 waves per level. More enemies = more XP.",                              max: Infinity, group: 'utility' }
};

/**
 * Maximum XP a stage can award on a base clear (no modifiers, no bonus waves).
 * Calibrated with the C=1000, p=1.5 level curve so that:
 *   One D1 clear (first time)           → ~level 3–4
 *   5 templates × D1 cleared            → ~level 7
 *   5 templates × D1–D10 cleared        → ~level 346
 *   5 templates × D1–D18 cleared        → level 9,999
 *   With all modifiers + wave grinding  → 99,999+
 */
const STAGE_XP_BUDGETS = [
          9_024,  // D1
         25_817,  // D2
         73_863,  // D3
        211_322,  // D4
        604_587,  // D5
      1_729_713,  // D6
      4_948_677,  // D7
     14_158_071,  // D8
     40_505_975,  // D9
    115_886_832,  // D10
    331_550_046,  // D11
    948_558_440,  // D12
  2_713_807_842,  // D13
  7_764_153_154,  // D14
 22_213_096_031,  // D15
 63_551_249_632,  // D16
181_818_928_986,  // D17
520_180_533_494,  // D18
];

/**
 * XP multiplier when ALL run modifiers are active simultaneously.
 * All 16 modifiers' xpBonus values sum to 4.90 → 1 + 4.90 = 5.90×.
 * Used as the yellow-bar ceiling in the XP progress panel.
 */
export const XP_ALL_MODS_MULT = 5.90;

export function getStageXPBudget(difficulty) {
    const d = Math.max(1, Math.min(18, difficulty));
    return STAGE_XP_BUDGETS[d - 1];
}
/**
 * Optional run modifiers — player picks 0–5 before starting.
 * Each makes the run harder in a specific way and adds an XP bonus.
 * Bonuses stack additively, capped at 3.0× base budget.
 *
 * Tier 1 (+20–25%): moderate difficulty increase, good for first repeats
 * Tier 2 (+30–35%): significant mechanical challenge
 * Tier 3 (+40–45%): punishing — requires strong builds to survive
 */
export const RUN_MODIFIERS = [
    // ── Tier 1: +20–25% ──────────────────────────────────────────────────────
    { id: 'fast',        name: 'Haste',           emoji: '💨', desc: 'All enemies move 40% faster. Coverage gaps become lethal.',                                         xpBonus: 0.20 },
    { id: 'regen',       name: 'Regenerating',    emoji: '💚', desc: 'All enemies regenerate 3% max HP/s. Burst damage essential — poison won\'t keep up.',               xpBonus: 0.20 },
    { id: 'no_poison',   name: 'Toxic Resistant', emoji: '🧪', desc: 'All enemies are immune to Poison. Emerald gems become useless — adapt your loadout.',               xpBonus: 0.20 },
    { id: 'berserker',   name: 'Frenzied',        emoji: '🔥', desc: 'All enemies gain the Berserker trait: speed triples as HP drops. Never let them get low.',          xpBonus: 0.25 },
    { id: 'armored',     name: 'Ironhide',        emoji: '⚔️', desc: 'All enemies gain +4 bonus armor. Purple gems become essential.',                                    xpBonus: 0.25 },
    { id: 'splitter',    name: 'Splitter Horde',  emoji: '🔱', desc: 'Enemies split into 2 weaker copies on death. Effectively doubles enemy count.',                     xpBonus: 0.25 },

    // ── Tier 2: +30–35% ──────────────────────────────────────────────────────
    { id: 'ghost',       name: 'Ethereal',        emoji: '👻', desc: 'All enemies immune to Slow and Poison. Only direct damage works.',                                   xpBonus: 0.30 },
    { id: 'density',     name: 'Dense Waves',     emoji: '🐝', desc: '+50% enemies per wave. Overwhelms single-target towers.',                                            xpBonus: 0.30 },
    { id: 'shields',     name: 'Shielded',        emoji: '🛡️', desc: 'Every enemy spawns with a shield equal to 40% of its HP before armor takes damage.',                xpBonus: 0.30 },
    { id: 'no_combo',    name: 'Anti-Combo',      emoji: '💔', desc: 'Your combo counter resets every 3 kills instead of on leak. Sustained DPS beats burst.',             xpBonus: 0.30 },
    { id: 'giant_waves', name: 'Colossus Wave',   emoji: '🗿', desc: 'All enemies spawn with double HP. Armor and speed unchanged — just more to chew through.',           xpBonus: 0.35 },
    { id: 'mana_drain',  name: 'Mana Vampires',   emoji: '💸', desc: 'All enemies drain 2× mana if they reach your base. One leak can end a run.',                        xpBonus: 0.35 },

    // ── Tier 3: +40–45% ──────────────────────────────────────────────────────
    { id: 'extra_waves', name: 'Extended Siege',  emoji: '🌊', desc: '+50% more waves. More enemies, more mana income — but you need gems to survive that long.',          xpBonus: 0.40 },
    { id: 'swarm_all',   name: 'Swarm Mode',      emoji: '🐜', desc: 'Every enemy spawns in groups of 3 (swarm trait). Wave sizes triple — towers melt.',                  xpBonus: 0.40 },
    { id: 'multipath',   name: 'Flanking',        emoji: '🗺️', desc: 'Enemies split across ALL paths simultaneously instead of being assigned one. No path is safe.',     xpBonus: 0.40 },
    { id: 'cursed_all',  name: 'Cursed Legion',   emoji: '💀', desc: 'All enemies resist 90% damage from non-Amethyst gems. Only Purple can harm them effectively.',       xpBonus: 0.45 },
];

/** Additive XP multiplier for a set of active modifier IDs. No cap — all 16 = 5.9× */
export function combinedXpMult(modifierIds) {
    const bonus = RUN_MODIFIERS
        .filter(m => modifierIds.includes(m.id))
        .reduce((sum, m) => sum + m.xpBonus, 0);
    return 1.0 + bonus;
}



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
        activeSkills: {
            bonusWaves: 0, startMana: 0, resonance: 0, haste: 0,
            scholarGrace: 0, comboKeep: 0, trapSpecialty: 0
        },
        clearedStages: {},
        stageXPEarned: {}   // maps "templateId:difficulty" → best XP earned so far
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

        // Clamp capped skills that were over-invested in old saves (max was 50, now 20).
        // Refund excess SP so the player isn't penalised.
        const CAPPED_SKILLS = ['startMana','towerDiscount','trapDiscount','combineDiscount',
                               'redCost','blueCost','greenCost','orangeCost','yellowCost','purpleCost','haste'];
        if (parsed.skills) {
            let refunded = 0;
            for (const key of CAPPED_SKILLS) {
                const def = SKILL_DEFS[key];
                if (!def || def.max === Infinity) continue;
                const current = parsed.skills[key] || 0;
                if (current > def.max) {
                    // Refund SP for levels above the new cap: triangular(current) - triangular(newMax)
                    const excess = current - def.max;
                    // SP cost for levels (newMax+1) through current = sum_{i=newMax+1}^{current} i
                    // = triangular(current) - triangular(newMax)
                    const refund = (current * (current + 1) / 2) - (def.max * (def.max + 1) / 2);
                    refunded += refund;
                    parsed.skills[key] = def.max;
                }
            }
            if (refunded > 0) {
                parsed.sp = (parsed.sp || 0) + refunded;
            }
        }

        const def = getDefaultSave();
        return {
            ...def,
            ...parsed,
            skills: { ...def.skills, ...parsed.skills },
            activeSkills: { ...def.activeSkills, ...(parsed.activeSkills || {}) },
            clearedStages: { ...(parsed.clearedStages || {}) },
            stageXPEarned: { ...(parsed.stageXPEarned || {}) }
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
    
    // C=1000, p=1.5 XP curve — tuned so 90 first-clears (D1–D18, 5 templates, no mods)
    // reaches exactly level 9,999. Much flatter than the old 100*k^1.8 so per-kill
    // numbers stay in readable integers (12–8000 XP/kill) while milestones scale correctly.
    //   Level 4   needs  9,024 XP  (≈ one D1 clear)
    //   Level 346 needs  ~28B XP   (≈ all D10 clears)
    //   Level 9999 needs ~4T XP    (≈ all D18 clears)
    let nextLevelReq = Math.floor(1000 * Math.pow(meta.level, 1.5));
    
    while (meta.xp >= nextLevelReq) {
        meta.xp -= nextLevelReq;
        meta.level++;
        meta.sp++;
        nextLevelReq = Math.floor(1000 * Math.pow(meta.level, 1.5));
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

/**
 * GemCraft-style repeat-clear XP gate.
 * Returns the XP to actually award (new XP above the player's previous best),
 * and updates stageXPEarned so future runs can't re-earn the same XP.
 *
 * Three-tier cap system:
 *   Blue  (not yet cleared) : cap = baseBudget (base clear, no mods)
 *   Yellow (cleared once)   : cap = baseBudget × XP_ALL_MODS_MULT (5.90×, all mods)
 *   Green  (beyond yellow)  : no cap — wave grinding with bonusWaves can push past yellow
 *
 * xpMult (default 1.0) is the run modifier multiplier from combinedXpMult().
 * The effective cap is max(baseBudget, baseBudget × xpMult) — i.e. modifiers raise the ceiling.
 * Once the player surpasses the yellow ceiling via wave grinding, xpEarned flows in freely
 * (no hard cap above yellow, progress turns green).
 */
export function recordStageXP(meta, templateId, difficulty, xpEarned, xpMult = 1.0) {
    const key          = `${templateId}:${difficulty}`;
    const baseBudget   = getStageXPBudget(difficulty);
    const yellowCap    = Math.round(baseBudget * XP_ALL_MODS_MULT);   // 5.90× — yellow ceiling
    // Effective cap for this run: at minimum the base budget, raised by active mods.
    const runCap       = Math.max(baseBudget, Math.round(baseBudget * Math.max(1.0, xpMult)));
    // Clamp what we store to runCap — prevents wave-clear bonuses and enemy variance
    // from silently bloating XP past what the UI shows as the budget.
    // Once the player surpasses the yellow ceiling via wave grinding (green tier),
    // we track the raw value so green-tier grinding accumulates indefinitely.
    const cappedEarned = xpEarned <= yellowCap ? Math.min(xpEarned, runCap) : xpEarned;
    const prevBest     = meta.stageXPEarned[key] || 0;
    const toAward      = Math.max(0, cappedEarned - prevBest);
    if (cappedEarned > prevBest) {
        meta.stageXPEarned[key] = cappedEarned;
        saveMeta(meta);
    }
    return toAward;
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
// ─── Mid-run autosave (last 5 slots) ────────────────────────────────────────
const MID_RUN_KEY = 'vocabcraft_midrun';
const MID_RUN_MAX = 5;

/**
 * Push a run snapshot to the front of the autosave ring (max 5 slots).
 */
export function saveMidRun(snapshot) {
    let slots = [];
    try { slots = JSON.parse(localStorage.getItem(MID_RUN_KEY) || '[]'); } catch {}
    slots.unshift(snapshot);
    localStorage.setItem(MID_RUN_KEY, JSON.stringify(slots.slice(0, MID_RUN_MAX)));
}

/** Returns the array of saved snapshots (newest first), or [] on error. */
export function loadMidRunSlots() {
    try { return JSON.parse(localStorage.getItem(MID_RUN_KEY) || '[]'); } catch { return []; }
}

/** Remove a single slot by index and persist the result. */
export function deleteMidRunSlot(index) {
    const slots = loadMidRunSlots();
    slots.splice(index, 1);
    localStorage.setItem(MID_RUN_KEY, JSON.stringify(slots));
}