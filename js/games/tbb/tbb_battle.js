// js/games/tbb/tbb_battle.js
// Combat math — adapted for group battle system with real HP damage

export const ATTACK_TYPES = ['slash', 'pierce', 'magic'];
export const CRIT_MULT   = 1.5;

// How many correct answers needed to kill an enemy on average.
export const HITS_TO_KILL = 5;

const _defNarrations = [
    'You hold your ground!', 'You weather the storm!',
    'Your guard holds!', 'Barely, but you block it!',
];
const _defFailNarrations = [
    'Your defense crumbles!', 'The blow gets through!',
    'You fail to parry in time!', 'A painful hit!',
];

function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Compute how much damage one correct answer deals to an enemy.
 * Base: enemyMaxHp / HITS_TO_KILL, scaled by type matchup and ATK vs DEF.
 */
export function computePlayerDamage(enemyCard, attackType, playerAtk, pb = {}) {
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
    const dmg       = Math.max(1, Math.round(baseDmg * typeMult));

    return { dmg, mult: typeMult, feedback };
}

/**
 * getAttackMultiplier — EXP multiplier for type matchup.
 * Kept for any code that still calls it directly.
 */
export function getAttackMultiplier(enemyCard, attackType, pb = {}) {
    if (enemyCard.weakTo === attackType) {
        const mult = 1.75 + (pb.weaknessAmpBonus ?? 0) / 100;
        return { mult, feedback: 'weakness' };
    }
    if (enemyCard.resists === attackType) {
        return { mult: 0.5, feedback: 'resist' };
    }
    const critChance = 0.10 + (pb.critChanceBonus ?? 0) / 100;
    if (Math.random() < critChance) {
        const mult = pb.transcendence ? CRIT_MULT * 1.10 : CRIT_MULT;
        return { mult, feedback: 'crit' };
    }
    const mult = pb.transcendence ? 1.10 : 1.0;
    return { mult, feedback: 'neutral' };
}

/**
 * Enemy retaliation on wrong answer.
 * Targets ~10% of player max HP per wrong answer (before DEF mitigation).
 * At 90% correct rate this gives roughly 10-15 waves of survival without healing.
 */
export function handleWrongAnswerRetaliation(g, enemyCard) {
    const isCrit   = Math.random() < 0.20;
    const baseHit  = Math.max(1, Math.round(g.playerHp * 0.10));
    const atkRatio = Math.max(0.5, (enemyCard.atk + 5) / (enemyCard.atk + (g.playerDef ?? 0) + 5));
    let dmg        = Math.max(1, Math.round(baseHit * atkRatio));
    if (isCrit) dmg = Math.round(dmg * CRIT_MULT);

    const narration = isCrit
        ? `💀 ${enemyCard.name} lands a CRIT for ${dmg} damage!`
        : _pick(_defFailNarrations) + ` ${enemyCard.name} deals ${dmg} damage!`;

    return { dmg, narration };
}

export function handlePlayerDefense(g, isCorrect) {
    const enemy = (g.enemyGroup?.length && g.selectedGroupIdx !== null)
        ? g.enemyGroup[g.selectedGroupIdx]
        : g.enemy;
    if (!enemy) return { dmg: 0, narration: '—', feedback: null };

    const pb     = g._pb ?? {};
    const isCrit = Math.random() < 0.20;
    let feedback = null;

    const baseHit  = Math.max(1, Math.round(g.playerHp * 0.10));
    const atkRatio = Math.max(0.5, (enemy.atk + 5) / (enemy.atk + (g.playerDef ?? 0) + 5));
    let afterDef   = Math.max(1, Math.round(baseHit * atkRatio));
    if (isCrit) { afterDef = Math.round(afterDef * CRIT_MULT); feedback = 'enemy_crit'; }

    if (isCorrect) {
        const parryFrac = Math.max(0.01, 0.5 - (pb.parryBoostBonus ?? 0) / 100);
        const dmg = Math.max(1, Math.round(afterDef * parryFrac));
        let narration = _pick(_defNarrations) + ` Damage reduced to ${dmg}!`;
        if (isCrit) narration = '⚠️ Critical parried! ' + narration;
        return { dmg, narration, feedback };
    } else {
        const narration = isCrit
            ? `💀 ${enemy.name} lands a CRIT for ${afterDef} damage!`
            : _pick(_defFailNarrations) + ` ${enemy.name} deals ${afterDef} damage!`;
        return { dmg: afterDef, narration, feedback };
    }
}

export function handlePlayerAttack(g, word, isCorrect, attackType) {
    const enemy = g.enemy;
    if (!enemy) return { dmg: 0, narration: '—', feedback: null };
    const pb = g._pb ?? {};
    const { dmg, feedback } = computePlayerDamage(enemy, attackType, g.playerAtk, pb);
    return { dmg: isCorrect ? dmg : 0, narration: '', feedback };
}

/**
 * EXP per correct answer.
 * Tuned: ~90 correct answers * (expYield/5) ≈ expToNextLevel(playerLevel).
 * Early enemy expYield ~12–16 → 3–4 EXP/answer → ~40 answers to Lv2 (tutorialish).
 * expYield scales with floor so the curve tracks the level² formula throughout.
 */
export function actionExp(enemyExpYield, isCorrect) {
    return isCorrect
        ? Math.ceil(enemyExpYield / 5)
        : Math.ceil(enemyExpYield / 25);
}

export function timeAdjustExp(rawExp, timeRemainingFraction) {
    const MIN_FACTOR = 0.05;
    return Math.round(rawExp * (MIN_FACTOR + (1 - MIN_FACTOR) * timeRemainingFraction));
}

export function applyExpBonuses(rawExp, additiveExpPct, multExpPct) {
    const afterAdd = rawExp * (1 + additiveExpPct / 100);
    return Math.round(afterAdd * (1 + multExpPct / 100));
}

/** Level curve: 150 × level² */
export function expToNextLevel(level) {
    return Math.max(150, Math.round(150 * Math.pow(level, 2)));
}

export function generateMcOptions(targetWord, vocabQueue) {
    const correct = targetWord.trans;
    const pool    = vocabQueue
        .filter(w => w.word !== targetWord.word && w.trans !== correct)
        .map(w => w.trans);

    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const opts = [correct, ...pool.slice(0, 3)];
    while (opts.length < 4) opts.push(`Option ${opts.length + 1}`);

    for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return opts;
}