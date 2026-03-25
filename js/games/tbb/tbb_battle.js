// js/games/tbb/tbb_battle.js
// Combat math — adapted for group battle system

export const ATTACK_TYPES = ['slash', 'pierce', 'magic'];
export const CRIT_MULT   = 1.5;

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
 * Compute EXP multiplier for an attack type against a specific enemy card.
 * This is the primary combat function in the new group battle system.
 * Attack type no longer affects damage — it scales EXP gained on a correct answer.
 *
 * Multipliers:
 *   weakness → ×1.75 (+ weaknessAmpBonus perk)
 *   resist   → ×0.5
 *   neutral  → ×1.0  (crit chance applies: ×1.5, or ×1.65 with Transcendence)
 *
 * @param {object} enemyCard  - one entry from _g.enemyGroup (.weakTo, .resists)
 * @param {string} attackType - 'slash'|'pierce'|'magic'
 * @param {object} pb         - perk bonuses from computePerkBonuses()
 * @returns {{ mult: number, feedback: 'weakness'|'resist'|'crit'|'neutral' }}
 */
export function getAttackMultiplier(enemyCard, attackType, pb = {}) {
    if (enemyCard.weakTo === attackType) {
        const mult = 1.75 + (pb.weaknessAmpBonus ?? 0) / 100;
        return { mult, feedback: 'weakness' };
    }
    if (enemyCard.resists === attackType) {
        return { mult: 0.5, feedback: 'resist' };
    }
    // Neutral — crit chance applies
    const critChance = 0.10 + (pb.critChanceBonus ?? 0) / 100;
    if (Math.random() < critChance) {
        const mult = pb.transcendence ? CRIT_MULT * 1.10 : CRIT_MULT;
        return { mult, feedback: 'crit' };
    }
    const mult = pb.transcendence ? 1.10 : 1.0;
    return { mult, feedback: 'neutral' };
}

/**
 * Process enemy retaliation when the player picks the wrong vocab answer.
 * The retaliating enemy is the card the player incorrectly targeted.
 *
 * @param {object} g          - game state (_g)
 * @param {object} enemyCard  - the specific enemy card that retaliates
 * @returns {{ dmg: number, narration: string }}
 */
export function handleWrongAnswerRetaliation(g, enemyCard) {
    const isCrit = Math.random() < 0.20;
    let atk      = enemyCard.atk;
    if (isCrit) atk = Math.round(atk * CRIT_MULT);

    const dmg = Math.max(1, atk - g.playerDef);

    const narration = isCrit
        ? `💀 ${enemyCard.name} lands a CRIT for ${dmg} damage!`
        : _pick(_defFailNarrations) + ` ${enemyCard.name} deals ${dmg} damage!`;

    return { dmg, narration };
}

/**
 * handlePlayerDefense — kept for compatibility with game-over / retry paths
 * and any overlay code that may call it. In normal gameplay, wrong answers
 * now use handleWrongAnswerRetaliation directly.
 *
 * @param {object}  g         - game state
 * @param {boolean} isCorrect
 * @returns {{ dmg, narration, feedback }}
 */
export function handlePlayerDefense(g, isCorrect) {
    // Prefer the currently targeted group card, fall back to g.enemy
    const enemy = (g.enemyGroup?.length && g.selectedGroupIdx !== null)
        ? g.enemyGroup[g.selectedGroupIdx]
        : g.enemy;
    if (!enemy) return { dmg: 0, narration: '—', feedback: null };

    const pb     = g._pb ?? {};
    const isCrit = Math.random() < 0.20;
    let enemyAtk = enemy.atk;
    let feedback = null;

    if (isCrit) { enemyAtk = Math.round(enemyAtk * CRIT_MULT); feedback = 'enemy_crit'; }

    const afterDef = Math.max(1, enemyAtk - g.playerDef);

    if (isCorrect) {
        const parryFrac = Math.max(0.01, 0.5 - (pb.parryBoostBonus ?? 0) / 100);
        const dmg = Math.max(1, Math.round(afterDef * parryFrac));
        let narration = _pick(_defNarrations) + ` Damage reduced to ${dmg}!`;
        if (isCrit) narration = '⚠️ Critical parried! ' + narration;
        return { dmg, narration, feedback };
    } else {
        const dmg = afterDef;
        const narration = isCrit
            ? `💀 ${enemy.name} lands a CRIT for ${dmg} damage!`
            : _pick(_defFailNarrations) + ` ${enemy.name} deals ${dmg} damage!`;
        return { dmg, narration, feedback };
    }
}

/**
 * handlePlayerAttack — legacy stub, no longer called in the main battle loop.
 * Attack type now affects EXP (via getAttackMultiplier), not damage.
 * Kept so imports don't break.
 */
export function handlePlayerAttack(g, word, isCorrect, attackType) {
    const enemy = g.enemy;
    if (!enemy) return { dmg: 0, narration: '—', feedback: null };
    const pb = g._pb ?? {};
    const { mult, feedback } = getAttackMultiplier(enemy, attackType, pb);
    const mod      = isCorrect ? mult : 0.4;
    const enemyDef = Math.max(0, (enemy.def ?? 0) - (pb.defPenBonus ?? 0));
    const dmg      = Math.max(isCorrect ? 1 : 0, Math.max(1, Math.round(g.playerAtk * mod) - enemyDef));
    return { dmg, narration: '', feedback };
}

/**
 * EXP earned per action based on enemy expYield.
 * Correct answers give 1/5 of yield; wrong answers give 1/20.
 */
export function actionExp(enemyExpYield, isCorrect) {
    return isCorrect
        ? Math.ceil(enemyExpYield / 5)
        : Math.ceil(enemyExpYield / 20);
}

/**
 * Time modifier for EXP. The group battle has no countdown timer so
 * tbb.js always passes timeRemainingFraction = 1.0, giving full value.
 * Kept for API compatibility and future reuse.
 */
export function timeAdjustExp(rawExp, timeRemainingFraction) {
    const MIN_FACTOR = 0.05;
    return Math.round(rawExp * (MIN_FACTOR + (1 - MIN_FACTOR) * timeRemainingFraction));
}

/** Apply additive + multiplicative perk EXP bonuses */
export function applyExpBonuses(rawExp, additiveExpPct, multExpPct) {
    const afterAdd = rawExp * (1 + additiveExpPct / 100);
    return Math.round(afterAdd * (1 + multExpPct / 100));
}

/** EXP needed for next level: 150 × level² */
export function expToNextLevel(level) {
    return Math.max(150, Math.round(150 * Math.pow(level, 2)));
}

/**
 * Generate 4 shuffled MC options: 1 correct translation + 3 distractors.
 * The correct answer is NOT guaranteed to be at index 0.
 * tbb.js assigns these across the 4 enemy cards.
 */
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