// js/games/tbb/tbb_battle.js
// Combat math — port of tbb_battle_controller.dart

export const ATTACK_TYPES = ['slash', 'pierce', 'magic'];
export const CRIT_MULT   = 1.5;

const _attackNarrations = [
    'You strike with precision!', 'A clean hit!', 'Your blade finds its mark!',
    'Excellent form!', 'The enemy reels from your blow!',
];
const _missNarrations = [
    'Your attack falters…', 'You hesitate and swing wide…',
    'The enemy deflects your blow!', 'Not your best effort…',
];
const _defNarrations  = [
    'You hold your ground!', 'You weather the storm!',
    'Your guard holds!', 'Barely, but you block it!',
];
const _defFailNarrations = [
    'Your defense crumbles!', 'The blow gets through!',
    'You fail to parry in time!', 'A painful hit!',
];

function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Process player's attack action.
 * @param {object} g   - game state (_g)
 * @param {object} word - vocab item being challenged
 * @param {boolean} isCorrect
 * @param {string}  attackType - 'slash'|'pierce'|'magic'
 * @returns {{ dmg, narration, feedback }}
 */
export function handlePlayerAttack(g, word, isCorrect, attackType) {
    const enemy = g.enemy;
    let mod = 1.0;
    let feedback = null;
    let narration = '';

    if (isCorrect) {
        if (enemy.weakTo  === attackType) { mod = 1.75; feedback = 'weakness'; }
        else if (enemy.resists === attackType) { mod = 0.5;  feedback = 'resist';   }
        const isCrit = !feedback && Math.random() < 0.10;
        if (isCrit) feedback = 'crit';
        narration = _pick(_attackNarrations);
        if (feedback === 'weakness') narration += ' ⚡ Super effective!';
        if (feedback === 'resist')   narration += ' 🛡 Not very effective…';
        if (feedback === 'crit')     narration += ' 💥 Critical hit!';
    } else {
        mod = 0.4;
        narration = _pick(_missNarrations);
    }

    const baseDmg = g.playerAtk;
    const eff     = Math.max(1, Math.round(baseDmg * mod) - enemy.def);
    const dmg     = Math.max(isCorrect ? 1 : 0, eff);

    return { dmg, narration, feedback };
}

/**
 * Process enemy attack / player defense.
 * @param {object} g        - game state
 * @param {boolean} isCorrect - did player answer correctly to defend?
 * @returns {{ dmg, narration, feedback }}
 */
export function handlePlayerDefense(g, isCorrect) {
    const enemy     = g.enemy;
    const isCrit    = Math.random() < 0.20;
    let enemyAtk    = enemy.atk;
    let feedback    = null;
    let narration   = '';

    if (isCrit) { enemyAtk = Math.round(enemyAtk * CRIT_MULT); feedback = 'enemy_crit'; }

    const afterDef = Math.max(1, enemyAtk - g.playerDef);
    let dmg;

    if (isCorrect) {
        dmg = Math.max(1, Math.round(afterDef * 0.5));
        narration = _pick(_defNarrations) + ` Damage reduced to ${dmg}!`;
        if (isCrit) narration = '⚠️ Critical parried! ' + narration;
    } else {
        dmg = afterDef;
        narration = isCrit
            ? `💀 ${enemy.name} lands a CRIT for ${dmg} damage!`
            : _pick(_defFailNarrations) + ` ${enemy.name} deals ${dmg} damage!`;
    }

    return { dmg, narration, feedback };
}

/** EXP gained per action (fraction of enemy expYield) */
export function actionExp(enemyExpYield, isCorrect) {
    return isCorrect
        ? Math.ceil(enemyExpYield / 5)
        : Math.ceil(enemyExpYield / 20);
}

/** EXP after time modifier (5% min at timeout) */
export function timeAdjustExp(rawExp, timeRemainingFraction) {
    const MIN_FACTOR = 0.05;
    return Math.round(rawExp * (MIN_FACTOR + (1 - MIN_FACTOR) * timeRemainingFraction));
}

/** Apply additive+multiplicative perk bonuses to raw EXP */
export function applyExpBonuses(rawExp, additiveExpPct, multExpPct) {
    const afterAdd  = rawExp * (1 + additiveExpPct / 100);
    return Math.round(afterAdd * (1 + multExpPct / 100));
}

/** EXP needed for next level (quadratic scaling) */
export function expToNextLevel(level) {
    return Math.round(100 * Math.pow(level, 1.6));
}

/** Generate 4 MC options (1 correct + 3 distractors) from vocabQueue */
export function generateMcOptions(targetWord, vocabQueue) {
    const correct = targetWord.trans;
    const pool    = vocabQueue
        .filter(w => w.word !== targetWord.word && w.trans !== correct)
        .map(w => w.trans);

    // Shuffle pool
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const opts = [correct, ...pool.slice(0, 3)];
    while (opts.length < 4) opts.push(`Option ${opts.length + 1}`);

    // Shuffle opts
    for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return opts;
}
