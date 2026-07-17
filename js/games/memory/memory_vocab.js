// memory_vocab.js — GameVocabManager integration for Memory Match.
//
// Every vocabulary interaction goes through GameVocabManager (see Overview §4/§7).
// This module never touches srs_db or vocab localStorage directly.
//
// Round flow:
//   1. buildRoundManager(roundWords) — one manager per board, pool = board words.
//      Global SRS mode is auto-detected from deckId:'srs' words in the queue.
//   2. During play, memory_board records per-word performance (memory failures).
//   3. gradeRoundResults(mgr, perfMap) — pulls each pool word once via
//      getNextWord() (a pulled word stays pending until graded, so N pulls cover
//      the whole pool exactly once), maps the pull to the recorded performance,
//      and grades it 0–3 through gradeWord(). Ungraded pulls are simply
//      discarded with the manager — gradeWord() is the only writer, so nothing
//      leaks into the SRS database.
//   4. exportToAppSrs(null, 'skip') pushes newly learned custom-deck words to
//      the app SRS at round end (no-op in Global SRS mode).

import { GameVocabManager } from '../../game_vocab_mgr.js';
import { showQuizSequence, renderVocabSettings } from '../../game_vocab_mgr_ui.js';
import { getState, updateState, BONUS_QUIZ_REWARD } from './memory_state.js';

export const BANNED_KEY = 'memory_banned_words';

function _savedConfig() {
    const state = getState();
    return {
        ...GameVocabManager.defaultConfig(),
        ...(state.vocabConfig || {})
    };
}

/** Builds a fresh manager whose pool is exactly the words on the board. */
export function buildRoundManager(roundWords) {
    const mgr = new GameVocabManager(_savedConfig());
    mgr.setPool(roundWords, BANNED_KEY); // deckId:'srs' words auto-enable Global SRS

    if (!mgr.isGlobalSrs) {
        // Local SM-2 engine: introduce every board word so grading produces
        // full-field activeSrs entries (kanji/kana/eng) that exportToAppSrs
        // can push safely. In Global SRS mode srs_db controls introduction.
        const poolSize = mgr.getStats().totalPoolSize;
        for (let i = 0; i < poolSize; i++) {
            if (mgr.learnNewWord() === false) break;
        }
    }
    return mgr;
}

/** Computes the canonical pool source for a selector queue ('srs'|'mixed'|'custom'). */
export function computePoolSource(queue) {
    const mgr = new GameVocabManager(GameVocabManager.defaultConfig());
    mgr.setPool(queue || [], BANNED_KEY);
    return mgr.getPoolSource();
}

/**
 * Maps a per-word performance record to an SM-2 grade.
 *   perf = { matched: boolean, failures: number }
 * A "failure" is a true memory miss: the player flipped this word while its
 * partner card had already been seen, and still failed to pair them.
 * Returns null when there is no meaningful signal (pair never explored).
 */
function _gradeFor(perf) {
    if (!perf) return null;
    if (!perf.matched) return perf.failures > 0 ? 0 : null;
    if (perf.failures === 0) return 3; // instantly recalled — easy
    if (perf.failures === 1) return 2; // one slip — good
    if (perf.failures === 2) return 1; // shaky — hard (counts as wrong)
    return 0;                          // long-forgotten pair — blackout
}

/**
 * Grades a finished (or aborted) round through the manager.
 *
 * @param {GameVocabManager} mgr        Manager from buildRoundManager().
 * @param {Map<string,Object>} perfMap  wordId → { matched, failures }.
 * @param {Object} [opts]
 * @param {boolean} [opts.export=true]  Push new local words to the app SRS.
 * @returns {{ results: Array, exported: {added:number,skipped:number}, isGlobalSrs: boolean }}
 */
export function gradeRoundResults(mgr, perfMap, opts = {}) {
    const doExport = opts.export !== false;

    // Pull every pool word exactly once (pending pulls are never re-served).
    const pulls = new Map();
    const poolSize = mgr.getStats().totalPoolSize;
    for (let i = 0; i < poolSize; i++) {
        const challenge = mgr.getNextWord();
        if (!challenge || pulls.has(challenge.wordObj.id)) break;
        pulls.set(challenge.wordObj.id, challenge);
    }

    const results = [];
    for (const [wordId, challenge] of pulls.entries()) {
        const perf = perfMap.get(wordId);
        const grade = _gradeFor(perf);
        if (grade === null) continue; // no signal — pull is discarded ungraded
        const result = mgr.gradeWord(challenge.refId, grade);
        if (!result) continue;
        results.push({
            wordObj: challenge.wordObj,
            grade,
            isCorrect: grade >= 2,
            failures: perf.failures,
            isUnscheduled: result.isUnscheduled === true
        });
    }

    // Worst-remembered words first, so the summary surfaces what to review.
    results.sort((a, b) => a.grade - b.grade);

    let exported = { added: 0, skipped: 0 };
    if (doExport) {
        // No-op when isGlobalSrs — safe to call unconditionally (Overview §7.9).
        exported = mgr.exportToAppSrs(null, 'skip');
    }
    return { results, exported, isGlobalSrs: mgr.isGlobalSrs };
}

/**
 * Runs the post-round bonus quiz (3 questions) via the standard quiz component.
 * Each correct answer awards BONUS_QUIZ_REWARD coins through onCoins().
 */
export function runBonusQuiz(mgr, container, { questions = 3, onCoins = null, onDone = null } = {}) {
    mgr.pause();
    showQuizSequence(mgr, questions, {
        container,
        title: '⭐ Bonus Quiz',
        showFurigana: true,
        optionCount: 4,
        onStepAnswer: (isCorrect) => {
            if (isCorrect && onCoins) onCoins(BONUS_QUIZ_REWARD);
        },
        onComplete: (successes, failures) => {
            mgr.resume();
            if (onDone) onDone(successes, failures);
        }
    });
}

/**
 * Renders the standard vocab settings panel into a container and persists the
 * updated config into the game save on save.
 */
export function mountVocabSettingsPanel(container, poolSource, onSaved = null) {
    const mgr = new GameVocabManager(_savedConfig());
    updateState({ poolSource }); // persist so the label survives reloads (§4.4)
    renderVocabSettings(mgr, container, (updatedConfig) => {
        updateState({ vocabConfig: updatedConfig });
        if (onSaved) onSaved(updatedConfig);
    }, poolSource);
}
