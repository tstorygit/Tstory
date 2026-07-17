// js/games/tbb/tbb_battle.js
// Combat math — adapted for group battle system with real HP damage

export const ATTACK_TYPES = ['slash', 'pierce', 'magic'];
export const CRIT_MULT   = 1.5;

// How many correct answers needed to kill an enemy on average.
export const HITS_TO_KILL = 5;

// Bonus damage for gambling on the WILD stance (applied after the type roll).
export const WILD_BONUS = 1.15;

const _defFailNarrations = [
    'Your defense crumbles!', 'The blow gets through!',
    'You fail to parry in time!', 'A painful hit!',
];

function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Compute how much damage one correct answer deals to an enemy.
 * Base: enemyMaxHp / HITS_TO_KILL, scaled by type matchup and ATK vs DEF.
 * @param {boolean} isWild — WILD stance gamble: +15% damage on top of the rolled type.
 */
export function computePlayerDamage(enemyCard, attackType, playerAtk, pb = {}, isWild = false) {
    let typeMult = 1.0;
    let feedback = 'neutral';
    if (enemyCard.weakTo === attackType) {
        typeMult = 1.75 + (pb.weaknessAmpBonus ?? 0) / 100;
        feedback = 'weakness';
    } else if (enemyCard.resists === attackType) {
        typeMult = 0.5;
        feedback = 'resist';
    } else {
        const critChance = 0.10 + (pb.critChanceBonus ?? 0) / 100;
        if (Math.random() < critChance) {
            typeMult = pb.transcendence ? CRIT_MULT * 1.10 : CRIT_MULT;
            feedback = 'crit';
        } else {
            typeMult = pb.transcendence ? 1.10 : 1.0;
        }
    }

    const enemyDef  = Math.max(0, (enemyCard.def ?? 0) - (pb.defPenBonus ?? 0));
    const atkFactor = Math.max(0.5, (playerAtk + 5) / (playerAtk + enemyDef + 5));
    const baseDmg   = Math.max(1, Math.round((enemyCard.maxHp / HITS_TO_KILL) * atkFactor));
    let dmg         = Math.max(1, Math.round(baseDmg * typeMult));
    if (isWild) dmg = Math.max(1, Math.round(dmg * WILD_BONUS));

    return { dmg, mult: typeMult, feedback };
}

/**
 * Enemy retaliation on wrong answer / timeout.
 * Base damage ramps from 10% of player max HP (floor 0) to 18% (floor 80+),
 * then is mitigated by DEF: heavy END builds can reduce it to 25%.
 * @param {number} dmgMult — extra multiplier (e.g. 1.5 for a telegraphed charge attack).
 */
export function handleWrongAnswerRetaliation(g, enemyCard, dmgMult = 1) {
    const isCrit    = Math.random() < 0.20;
    const floorRamp = 0.10 + Math.min(0.08, (g.currentFloor ?? 0) * 0.001);
    const baseHit   = Math.max(1, Math.round(g.playerHp * floorRamp));
    const atkRatio  = Math.max(0.25, (enemyCard.atk + 10) / (enemyCard.atk + (g.playerDef ?? 0) * 1.5 + 10));
    let dmg         = Math.max(1, Math.round(baseHit * atkRatio * dmgMult));
    if (isCrit) dmg = Math.round(dmg * CRIT_MULT);

    const narration = isCrit
        ? `💀 ${enemyCard.name} lands a CRIT for ${dmg} damage!`
        : _pick(_defFailNarrations) + ` ${enemyCard.name} deals ${dmg} damage!`;

    return { dmg, narration, isCrit };
}

/**
 * EXP per answer.
 * Correct: expYield/5 (≈ HITS_TO_KILL answers per enemy → ~1 expYield per kill
 * before the kill bonus). Wrong: small consolation trickle.
 */
export function actionExp(enemyExpYield, isCorrect) {
    return isCorrect
        ? Math.ceil(enemyExpYield / 5)
        : Math.ceil(enemyExpYield / 25);
}

/**
 * Scale EXP by answer speed. Instant answer = 100%, last-moment answer = 35%.
 * Answer-time perks (Temporal Insight / Time Bend) extend the window, raising
 * the average fraction remaining — so they indirectly boost EXP too.
 */
export function timeAdjustExp(rawExp, timeRemainingFraction) {
    const MIN_FACTOR = 0.35;
    const f = Math.max(0, Math.min(1, timeRemainingFraction ?? 1));
    return Math.round(rawExp * (MIN_FACTOR + (1 - MIN_FACTOR) * f));
}

export function applyExpBonuses(rawExp, additiveExpPct, multExpPct) {
    const afterAdd = rawExp * (1 + (additiveExpPct ?? 0) / 100);
    return Math.round(afterAdd * (1 + (multExpPct ?? 0) / 100));
}

/**
 * Level curve: ~70 × level^1.75 (was 150 × level², which demanded 50+ correct
 * answers for the very first level-up). Early levels now come every ~20-25
 * correct answers; deep levels still grow steeply.
 */
export function expToNextLevel(level) {
    return Math.max(60, Math.round(70 * Math.pow(level, 1.75)));
}
