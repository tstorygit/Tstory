/**
 * game_vocab_mgr.js — GameVocabManager
 *
 * Centralized, stateful, pedagogically-sound vocabulary engine for mini-games.
 * Every game that quizzes the player on vocabulary should use this as its sole
 * interface; no game module should import srs_db directly.
 *
 * Two operating modes:
 *   Local  — Self-contained SM-2 scheduling inside the game session.
 *            Progress is stored in the game's own save slot and can be pushed
 *            to the app's SRS database when the session ends via exportToAppSrs().
 *   Global — Delegates scheduling to the app's central srs_db.  Answers affect
 *            the player's main flashcard reviews in real time.
 *            Activated automatically when setPool() receives words tagged deckId:'srs'.
 *
 * Typical game lifecycle:
 *   1. const mgr = new GameVocabManager({ mode: 'auto', … });
 *   2. mgr.setPool(vocabArray, 'my_game_banned');
 *   3. const challenge = mgr.getNextWord();          // get a question
 *   4. const result    = mgr.gradeWord(challenge.refId, isCorrect); // record answer
 *   5. On session end: mgr.exportToAppSrs(null);     // persist to SRS db
 *
 * Static helpers:
 *   GameVocabManager.loadSrsPool(srsDbModule?)  — load the player's SRS word list
 *                                                  ready for setPool(), without any
 *                                                  game module knowing the storage schema.
 *   GameVocabManager.defaultConfig()            — canonical default config object; use
 *                                                  as the fallback in game save data.
 *   GameVocabManager.configLimits               — clamp limits for every config field;
 *                                                  use in settings UIs instead of magic numbers.
 */

import * as srsDb from './srs_db.js';

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] =[array[j], array[i]];
    }
    return array;
}

function generateRefId() {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// ─── MAIN CLASS ──────────────────────────────────────────────────────────────

export class GameVocabManager {
    /**
     * @param {Object} config
     * @param {'auto'|'manual'|'random'} config.mode
     *   auto   — SRS-ordered; introduces new words automatically when thresholds are met.
     *   manual — SRS-ordered (due first); new words must be introduced via learnNewWord().
     *   random — Picks words at random from the full pool; no SRS scheduling.
     * @param {number} config.initialInterval
     *   Seconds before a newly introduced word is shown again (Local mode). Default 8.
     * @param {number} config.initialEase
     *   Starting SM-2 ease multiplier (Local mode). Higher = intervals grow faster. Default 1.5.
     * @param {number} config.leechThreshold
     *   Wrong-answer count before a word is flagged as a leech. Default 20.
     * @param {number} config.autoNewWordBatchSize
     *   How many new words to introduce per auto-event in 'auto' mode. Default 1.
     * @param {Object} config.autoThresholds
     *   Controls when 'auto' mode introduces new vocabulary.
     * @param {number} config.autoThresholds.minDueTime
     *   Seconds with no due cards before a new word is auto-introduced. Default 10.
     * @param {number} config.autoThresholds.minAccuracy
     *   Recent answer accuracy (0–1) required before auto-introducing. Default 0.80.
     */
    constructor(config = {}) {
        const thresholds = {
            minDueTime:  10,
            minAccuracy: 0.80,
            ...(config.autoThresholds || {})
        };
        this.config = {
            mode:                'auto',
            initialInterval:     8,
            initialEase:         1.5,
            leechThreshold:      20,
            autoNewWordBatchSize: 1,
            ...config,
            autoThresholds: thresholds   // always the merged object, never the raw config value
        };

        this._pool = [];
        this._pendingPulls = new Map();
        this._isPaused = false;
        this.isGlobalSrs = false; // Set to true by setPool() when the pool contains deckId:'srs' words
        this._hasCustomWords = false; // Set by setPool() — true when non-SRS words are mixed in

        this.resetState();
    }

    resetState() {
        this.state = {
            activeSrs: {}, // Stores SM-2 data locally OR just Leech/WrongCount data if Global
            stats: {
                totalLearned: 0,
                correct: 0,
                wrong: 0,
                combo: 0,
                highestCombo: 0,
                recentGrades: []
            },
            clock: {
                pauseTimeTotal: 0,
                pauseStart: null
            }
        };
        this._pendingPulls.clear();
        this._isPaused = false;
    }

    // ─── STATE & POOL MANAGEMENT ─────────────────────────────────────────────

    importState(savedState) {
        if (!savedState) return;
        this.state.activeSrs = savedState.activeSrs || {};
        if (savedState.stats) this.state.stats = { ...this.state.stats, ...savedState.stats };
        if (savedState.clock) this.state.clock = { ...this.state.clock, ...savedState.clock };

        if (this.state.clock.pauseStart !== null) {
            this._isPaused = true;
            // Shift pause start to NOW so offline time isn't calculated as active pause time
            this.state.clock.pauseStart = Date.now();
        }
    }

    exportState() {
        return JSON.parse(JSON.stringify(this.state));
    }

    /**
     * @param {Array}   rawVocabArray  - Words from vocab selector or loadSrsPool().
     * @param {string}  bannedKey      - localStorage key for the game's ban list.
     * @param {Object}  [opts]
     * @param {boolean} [opts.globalSrs=false]
     *   When true, forces Global SRS mode regardless of deckId values on individual
     *   words.  Pass this instead of manually tagging every word with deckId:'srs'.
     *   Equivalent to the old pattern:
     *     pool.map(w => ({ ...w, deckId: 'srs' }))
     *   but without the caller needing to know about the deckId signal.
     */
    setPool(rawVocabArray, bannedKey = 'vocab_selector_banned', opts = {}) {
        // Filter out any words the player has previously banned
        let banned = new Set();
        try {
            const stored = localStorage.getItem(bannedKey);
            if (stored) banned = new Set(JSON.parse(stored));
        } catch (e) { /* ignore parse errors */ }

        this._pool = rawVocabArray
            .filter(w => !banned.has(w.word))
            .map(w => ({
                id: w.word,
                kanji: w.word,
                kana: w.furi || w.word,
                eng: w.trans || w.translation || '—',
                deckId: w.deckId || 'custom'
            }));

        // opts.globalSrs is the preferred way to activate Global mode.
        // The legacy path (words tagged deckId:'srs') is still supported for
        // backwards compatibility with older game modules.
        this.isGlobalSrs = opts.globalSrs === true || this._pool.some(w => w.deckId === 'srs');

        // Track whether there are any non-SRS (custom deck) words mixed in.
        // Used by renderVocabSettings to know if mode selection is relevant.
        this._hasCustomWords = this._pool.some(w => w.deckId !== 'srs');

        // Orphan protection for Local mode: words already in activeSrs that are no longer
        // in the new pool are re-pinned so their SRS progress is not lost.
        if (!this.isGlobalSrs) {
            const poolIds = new Set(this._pool.map(w => w.id));
            for (const srsId in this.state.activeSrs) {
                if (!poolIds.has(srsId)) {
                    const srsItem = this.state.activeSrs[srsId];
                    this._pool.push({
                        id: srsItem.id, kanji: srsItem.kanji, kana: srsItem.kana,
                        eng: srsItem.eng, deckId: 'orphan'
                    });
                    poolIds.add(srsItem.id);
                }
            }
        }
    }

    // ─── TIME MANAGEMENT ─────────────────────────────────────────────────────

    gameNow() {
        const extraPause = this._isPaused ? (Date.now() - this.state.clock.pauseStart) : 0;
        return Date.now() - this.state.clock.pauseTimeTotal - extraPause;
    }

    pause() {
        if (this._isPaused) return;
        this.state.clock.pauseStart = Date.now();
        this._isPaused = true;
    }

    resume() {
        if (!this._isPaused) return;
        this.state.clock.pauseTimeTotal += (Date.now() - this.state.clock.pauseStart);
        this.state.clock.pauseStart = null;
        this._isPaused = false;
    }

    /**
     * Change the pedagogical mode at runtime without resetting state.
     * @param {'auto'|'manual'|'random'} mode
     */
    setMode(mode) {
        if (!['auto', 'manual', 'random'].includes(mode)) {
            console.warn(`[GameVocabManager] Unknown mode "${mode}". Must be auto, manual, or random.`);
            return;
        }
        this.config.mode = mode;
    }

    /** Returns the current pedagogical mode without exposing config internals. */
    getMode() {
        return this.config.mode;
    }

    /**
     * Returns the pool source as a canonical string derived from the manager's
     * own state after setPool() is called.  Games should call this instead of
     * tracking their own _poolSource variable.
     *
     * 'srs'    — pool contains only Global SRS words (isGlobalSrs=true, no custom words)
     * 'mixed'  — pool contains SRS words AND custom deck words
     * 'custom' — pool contains only custom deck words (local SM-2 engine)
     *
     * @returns {'srs'|'mixed'|'custom'}
     */
    getPoolSource() {
        if (this.isGlobalSrs && this._hasCustomWords) return 'mixed';
        if (this.isGlobalSrs) return 'srs';
        return 'custom';
    }

    // ─── CORE LOOP ───────────────────────────────────────────────────────────

    /**
     * Returns the next vocabulary challenge.
     *
     * @param {string|null} forceMode  - Override config.mode for this call only.
     *                                   Pass 'leech' to force a leech word.
     * @param {number}      optionCount - Total number of answer choices to generate,
     *                                   including the correct answer. Default 4.
     *                                   Pass any value ≥ 2 (e.g. 9 for a 3×3 grid).
     *                                   If the pool is too small to fill all slots,
     *                                   the returned options array will be shorter —
     *                                   callers must handle this gracefully.
     *
     * @returns {{ refId, type, wordObj, options, correctIdx } | null}
     */
    getNextWord(forceMode = null, optionCount = 4) {
        if (this._pool.length === 0) return null;

        // Clamp: must be at least 2, and can't exceed the pool size
        const totalOptions    = Math.max(2, Math.min(optionCount, this._pool.length));
        const distractorCount = totalOptions - 1;

        const mode = forceMode || this.config.mode;

        // Build a Set of word IDs that are already in-flight (pulled but not yet graded).
        // These must be excluded from selection so the same word isn't shown twice at once.
        const pendingWordIds = new Set([...this._pendingPulls.values()].map(p => p.wordId));

        let selectedWordObj = null;
        let type = 'random';

        // 1. If forced to leech, try to get a leech
        if (mode === 'leech') {
            const leeches = this.getLeeches().filter(s => !pendingWordIds.has(s.id));
            if (leeches.length > 0) {
                const srsItem = leeches[Math.floor(Math.random() * leeches.length)];
                selectedWordObj = this._pool.find(w => w.id === srsItem.id);
                type = 'leech';
            }
        }

        // 2. Standard resolution
        if (!selectedWordObj) {
            if (this.isGlobalSrs && mode !== 'random') {
                // ─── GLOBAL SRS ───
                // srsDb.getNextGameWord expects objects with {word, furi, trans}.
                // Our internal pool uses {id, kanji, kana, eng}, so we must translate.
                const availablePool = this._pool
                    .filter(w => !pendingWordIds.has(w.id))
                    .map(w => ({ word: w.id, furi: w.kana, trans: w.eng, deckId: w.deckId }));

                // 'manual' = SRS-ordered but no auto-introduction of new words → 'srs' mode
                // 'auto'   = mixed scheduling (due → learning drill → new → mature drill)
                const srsModeMap   = { auto: 'mixed', manual: 'srs', random: 'random' };
                const globalResult = srsDb.getNextGameWord(availablePool, srsModeMap[mode] || 'mixed');

                if (globalResult && globalResult.wordObj) {
                    selectedWordObj = this._pool.find(w => w.id === globalResult.wordObj.word);
                    type = globalResult.type;
                    // In Global SRS mode, any word that is not actively due is 'unscheduled':
                    //   'random' = srsDb found no due cards, fell back to random pick
                    //   'drill'  = word exists but interval hasn't expired yet
                    // Both have the same grading rule: correct → no interval change, wrong → counts.
                    if (type === 'random' || type === 'free' || type === 'drill') type = 'unscheduled';
                } else {
                    const internalAvailable = this._pool.filter(w => !pendingWordIds.has(w.id));
                    if (internalAvailable.length === 0) return null;
                    selectedWordObj = internalAvailable[Math.floor(Math.random() * internalAvailable.length)];
                    type = 'unscheduled';
                }
            }
            else {
                // ─── LOCAL ENGINE ───
                const now          = this.gameNow();
                const availableSrs = Object.values(this.state.activeSrs).filter(s => !pendingWordIds.has(s.id));

                if (mode === 'random') {
                    const availablePool = this._pool.filter(w => !pendingWordIds.has(w.id));
                    if (availablePool.length === 0) return null;
                    selectedWordObj = availablePool[Math.floor(Math.random() * availablePool.length)];
                    type = 'random';
                }
                else {
                    const dueWords = availableSrs.filter(s => s.nextReview <= now && !s.isLeech);
                    const leeches  = availableSrs.filter(s => s.isLeech);
                    const drills   = availableSrs.filter(s => s.nextReview > now && !s.isLeech);

                    if (dueWords.length > 0) {
                        const srsItem = dueWords[Math.floor(Math.random() * dueWords.length)];
                        selectedWordObj = this._pool.find(w => w.id === srsItem.id);
                        type = 'due';
                    }
                    else if (leeches.length > 0 && Math.random() < 0.2) {
                        const srsItem = leeches[Math.floor(Math.random() * leeches.length)];
                        selectedWordObj = this._pool.find(w => w.id === srsItem.id);
                        type = 'leech';
                    }
                    else if (mode === 'auto') {
                        const accuracy   = this.getRecentAccuracy();
                        const timeToNext = this.getTimeUntilNextReview();
                        if (accuracy   >= this.config.autoThresholds.minAccuracy &&
                            timeToNext >= this.config.autoThresholds.minDueTime) {

                            // Introduce up to autoNewWordBatchSize words; quiz on the last one
                            let lastNew = null;
                            const batchSize = this.config.autoNewWordBatchSize || 1;
                            for (let i = 0; i < batchSize; i++) {
                                const w = this.learnNewWord();
                                if (w) lastNew = w;
                            }
                            if (lastNew) {
                                selectedWordObj = this._pool.find(w => w.id === lastNew.id);
                                type = 'new';
                            }
                        }
                    }

                    if (!selectedWordObj && drills.length > 0) {
                        drills.sort((a, b) => a.nextReview - b.nextReview);
                        selectedWordObj = this._pool.find(w => w.id === drills[0].id);
                        type = 'drill';
                    }

                    // Fallback: pick randomly from any non-pending pool word
                    if (!selectedWordObj) {
                        const availablePool = this._pool.filter(w => !pendingWordIds.has(w.id));
                        if (availablePool.length === 0) return null;
                        selectedWordObj = availablePool[Math.floor(Math.random() * availablePool.length)];
                        type = 'random';
                    }
                }
            }
        }

        if (!selectedWordObj) return null;

        // ─── SMART DISTRACTORS ───
        // Build exactly `distractorCount` distractors using priority ordering.
        const correctEng    = selectedWordObj.eng;
        let distractorPool  = this._pool.filter(w => w.id !== selectedWordObj.id && w.eng !== correctEng);
        let chosenDistractors = [];

        // Priority 1 — For leeches: prefer other leeches as distractors (forces disambiguation)
        if (type === 'leech') {
            const otherLeechIds    = new Set(this.getLeeches().filter(s => s.id !== selectedWordObj.id).map(s => s.id));
            const leechDistractors = distractorPool.filter(w => otherLeechIds.has(w.id));
            shuffleArray(leechDistractors);
            chosenDistractors = leechDistractors.slice(0, distractorCount).map(w => w.eng);
            distractorPool    = distractorPool.filter(w => !chosenDistractors.includes(w.eng));
        }

        // Priority 2 — For Global SRS: prefer known (status > 0) words as distractors
        if (this.isGlobalSrs && chosenDistractors.length < distractorCount) {
            const globalDict     = srsDb.getAllWords();
            let knownDistractors = distractorPool.filter(w => globalDict[w.id] && globalDict[w.id].status > 0);
            shuffleArray(knownDistractors);
            while (chosenDistractors.length < distractorCount && knownDistractors.length > 0) {
                const pick = knownDistractors.pop().eng;
                if (!chosenDistractors.includes(pick)) chosenDistractors.push(pick);
            }
            distractorPool = distractorPool.filter(w => !chosenDistractors.includes(w.eng));
        }

        // Priority 3 — Fill remaining slots from whatever is left
        shuffleArray(distractorPool);
        while (chosenDistractors.length < distractorCount && distractorPool.length > 0) {
            const pick = distractorPool.pop().eng;
            if (!chosenDistractors.includes(pick)) chosenDistractors.push(pick);
        }

        const options    = [...chosenDistractors, correctEng];
        shuffleArray(options);
        const correctIdx = options.indexOf(correctEng);

        const refId = generateRefId();
        this._pendingPulls.set(refId, { wordId: selectedWordObj.id, type });

        // optionCount reflects how many were actually generated (may be < requested
        // if the pool was too small — callers should use options.length, not the
        // requested optionCount, when building their UI)
        return { refId, type, wordObj: selectedWordObj, options, correctIdx };
    }

    gradeWord(refId, grade) {
        const pull = this._pendingPulls.get(refId);
        if (!pull) return null;
        this._pendingPulls.delete(refId);

        let sm2Grade = typeof grade === 'boolean' ? (grade ? 2 : 0) : Math.max(0, Math.min(3, grade));
        let isCorrect = sm2Grade >= 2;

        this.state.stats.recentGrades.push(isCorrect);
        if (this.state.stats.recentGrades.length > 20) this.state.stats.recentGrades.shift();

        if (isCorrect) {
            this.state.stats.correct++;
            this.state.stats.combo++;
            if (this.state.stats.combo > this.state.stats.highestCombo) {
                this.state.stats.highestCombo = this.state.stats.combo;
            }
        } else {
            this.state.stats.wrong++;
            this.state.stats.combo = 0;
        }

        const wordObj = this._pool.find(w => w.id === pull.wordId);
        if (!wordObj) return null; // word was removed from pool (e.g. banned) mid-session

        // Track session-local leech/wrongCount regardless of Global/Local mode
        if (!this.state.activeSrs[pull.wordId]) {
            this.state.activeSrs[pull.wordId] = {
                id:         pull.wordId,
                wrongCount: 0,
                isLeech:    false,
                interval:   this.config.initialInterval,
                ease:       this.config.initialEase,
                nextReview: this.gameNow(),
            };
        }
        const srsItem = this.state.activeSrs[pull.wordId];
        let isLeechAlert = false;

        const wasDue = pull.type === 'due' || pull.type === 'leech' || pull.type === 'new';

        if (!isCorrect) {
            srsItem.wrongCount++;
            if (srsItem.wrongCount >= this.config.leechThreshold && !srsItem.isLeech) {
                srsItem.isLeech = true;
                isLeechAlert = true;
            }
        } else if (srsItem.isLeech) {
            srsItem.wrongCount = Math.max(0, srsItem.wrongCount - 1);
            if (srsItem.wrongCount === 0) srsItem.isLeech = false;
        }

        if (this.isGlobalSrs) {
            // ─── GLOBAL SRS PASSTHROUGH ───
            // 'unscheduled' = word is not due (drill) or no due cards exist (random fallback).
            //   • Correct answer → do NOT update SRS interval (not a real review), but update lastUpdated.
            //   • Wrong answer   → DO update interval (you still need to learn it).
            const isUnscheduled = pull.type === 'unscheduled';

            // Always call srsDb.gradeWordInGame so it can update lastUpdated for the "Least Recently Seen" drill queue
            const updated = srsDb.gradeWordInGame({
                word: wordObj.kanji,
                furi: wordObj.kana,
                translation: wordObj.eng
            }, sm2Grade, true);
            const newIntervalSecs = updated ? Math.round((updated.interval || 0) * 86400) : 0;

            return {
                wordId:           pull.wordId,
                isCorrect,
                sm2Grade,
                combo:            this.state.stats.combo,
                newInterval:      newIntervalSecs,
                isLeech:          srsItem.isLeech,
                justBecameLeech:  isLeechAlert,
                isUnscheduled,
                isLevelUp:        false
            };
        }
        else {
            // ─── LOCAL ENGINE ───
            if (wasDue || !isCorrect) {
                if (!isCorrect) {
                    srsItem.interval = this.config.initialInterval;
                    srsItem.ease = Math.max(1.3, srsItem.ease - 0.2);
                } else if (!srsItem.isLeech) {
                    if (sm2Grade === 1) {
                        srsItem.interval = srsItem.interval * 1.2;
                        srsItem.ease = Math.max(1.3, srsItem.ease - 0.15);
                    } else if (sm2Grade === 2) {
                        srsItem.interval = srsItem.interval * srsItem.ease;
                        srsItem.ease = Math.max(1.3, srsItem.ease - 0.02);
                    } else if (sm2Grade === 3) {
                        srsItem.interval = srsItem.interval * srsItem.ease * 1.3;
                        srsItem.ease = Math.min(3.5, srsItem.ease + 0.1);
                    }
                }
                srsItem.nextReview = this.gameNow() + (srsItem.interval * 1000);
            }

            return {
                wordId:          pull.wordId,
                isCorrect,
                sm2Grade,
                combo:           this.state.stats.combo,
                newInterval:     srsItem.interval,
                isLeech:         srsItem.isLeech,
                justBecameLeech: isLeechAlert,
                isLevelUp:       false  // new-word introduction happens in getNextWord, not here
            };
        }
    }

    // ─── MANUAL CONTROLS ─────────────────────────────────────────────────────

    learnNewWord() {
        if (this.isGlobalSrs) {
            // Pass translated shape that srsDb expects
            const availablePool = this._pool.map(w => ({ word: w.id, furi: w.kana, trans: w.eng }));
            const result = srsDb.getNextGameWord(availablePool, 'new');
            if (result && result.wordObj) {
                const wordId  = result.wordObj.word;
                const poolWord = this._pool.find(w => w.id === wordId);
                // Register in activeSrs with full word fields so leech tracking,
                // getDueCount, and exportToAppSrs all work correctly
                if (!this.state.activeSrs[wordId]) {
                    this.state.activeSrs[wordId] = {
                        id:         wordId,
                        kanji:      poolWord?.kanji || wordId,
                        kana:       poolWord?.kana  || wordId,
                        eng:        poolWord?.eng   || '',
                        wrongCount: 0,
                        isLeech:    false,
                        interval:   this.config.initialInterval,
                        ease:       this.config.initialEase,
                        nextReview: this.gameNow()
                    };
                    this.state.stats.totalLearned++;
                }
                return poolWord || null;
            }
            return false; // pool exhausted
        }

        const activeIds = new Set(Object.keys(this.state.activeSrs));
        const newWord   = this._pool.find(w => !activeIds.has(w.id));
        if (!newWord) return false; // pool exhausted — spec says return false

        this.state.activeSrs[newWord.id] = {
            id:         newWord.id,
            kanji:      newWord.kanji,
            kana:       newWord.kana,
            eng:        newWord.eng,
            interval:   this.config.initialInterval,
            ease:       this.config.initialEase,
            nextReview: this.gameNow(),
            wrongCount: 0,
            isLeech:    false
        };
        this.state.stats.totalLearned++;
        return newWord; // truthy pool object — callers can use as boolean or read .id etc.
    }

    /**
     * Introduce an initial batch of words at the start of a run.
     * Call this once after setPool() instead of writing a manual loop.
     *
     * No-ops in 'random' mode (no concept of "new" words) and in Global SRS mode
     * (the SRS database controls introduction order).
     *
     * @param {number} count  Number of words to introduce. Defaults to
     *                        Math.max(autoNewWordBatchSize, 5) — enough to give
     *                        the player a small starting hand without overwhelming them.
     * @returns {number}      Actual number of words introduced (may be less if pool
     *                        is smaller than requested count).
     */
    seedInitialWords(count = Math.max(this.config.autoNewWordBatchSize, 5)) {
        if (this.config.mode === 'random' || this.isGlobalSrs) return 0;
        let introduced = 0;
        for (let i = 0; i < count; i++) {
            if (this.learnNewWord() === false) break;
            introduced++;
        }
        return introduced;
    }

    banWord(wordId, bannedKey = 'vocab_selector_banned') {
        this._pool = this._pool.filter(w => w.id !== wordId);
        if (this.state.activeSrs[wordId]) {
            delete this.state.activeSrs[wordId];
            this.state.stats.totalLearned = Math.max(0, this.state.stats.totalLearned - 1);
        }
        try {
            const banned = JSON.parse(localStorage.getItem(bannedKey)) || [];
            if (!banned.includes(wordId)) {
                banned.push(wordId);
                localStorage.setItem(bannedKey, JSON.stringify(banned));
            }
        } catch (e) { console.warn("Could not save to ban list", e); }
    }

    getLeeches() {
        return Object.values(this.state.activeSrs).filter(s => s.isLeech);
    }

    markLeech(wordId) {
        if (!this.state.activeSrs[wordId]) {
            this.state.activeSrs[wordId] = {
                id:         wordId,
                wrongCount: 0,
                isLeech:    false,
                interval:   this.config.initialInterval,
                ease:       this.config.initialEase,
                nextReview: this.gameNow(),
            };
        }
        this.state.activeSrs[wordId].isLeech    = true;
        this.state.activeSrs[wordId].wrongCount = Math.max(
            this.config.leechThreshold,
            this.state.activeSrs[wordId].wrongCount
        );
    }

    unleech(wordId) {
        if (!this.state.activeSrs[wordId]) return;
        this.state.activeSrs[wordId].isLeech = false;
        this.state.activeSrs[wordId].wrongCount = 0;
        this.state.activeSrs[wordId].interval = this.config.initialInterval;
        this.state.activeSrs[wordId].nextReview = this.gameNow();
    }

    // ─── DATA ACCESSORS ──────────────────────────────────────────────────────

    getStats() {
        const activeCount = Object.keys(this.state.activeSrs).length;
        return {
            ...this.state.stats,
            accuracy: this.getRecentAccuracy(),
            totalPoolSize: this._pool.length,
            activeCount,
            newCount: Math.max(0, this._pool.length - activeCount),
            dueCount: this.getDueCount(),
            leechCount: this.getLeeches().length
        };
    }

    getRecentAccuracy() {
        const grades = this.state.stats.recentGrades;
        if (grades.length === 0) return 1.0;
        return grades.filter(Boolean).length / grades.length;
    }

    getDueCount() {
        if (this.isGlobalSrs) {
            const globalWords = srsDb.getAllWords();
            const now = Date.now();
            return this._pool.filter(w => {
                if (this.state.activeSrs[w.id]?.isLeech) return false;
                const entry = globalWords[w.id];
                if (!entry) return false;
                return !entry.dueDate || new Date(entry.dueDate).getTime() <= now;
            }).length;
        }

        const now = this.gameNow();
        return Object.values(this.state.activeSrs).filter(s => s.nextReview <= now && !s.isLeech).length;
    }

    getTimeUntilNextReview() {
        if (this.isGlobalSrs) {
            const globalWords = srsDb.getAllWords();
            const now = Date.now();
            let minTime = Infinity;
            this._pool.forEach(w => {
                if (this.state.activeSrs[w.id]?.isLeech) return;
                const entry = globalWords[w.id];
                if (entry && entry.dueDate) {
                    const dueTime = new Date(entry.dueDate).getTime();
                    if (dueTime < minTime) minTime = dueTime;
                }
            });
            return minTime === Infinity ? Infinity : Math.max(0, (minTime - now) / 1000);
        }

        const now = this.gameNow();
        const activeSrsArray = Object.values(this.state.activeSrs).filter(s => !s.isLeech);
        if (activeSrsArray.length === 0) return Infinity;
        const nextTime = Math.min(...activeSrsArray.map(s => s.nextReview));
        return Math.max(0, (nextTime - now) / 1000);
    }

    /**
     * Pushes locally-learned words back to the app's central SRS database.
     * No-ops silently when isGlobalSrs is true (words are already live in the DB).
     *
     * Pass the live srsDb module when it's in scope — the module's importFromNeko()
     * will be called directly.  Pass null (the common case for lazily-loaded games)
     * to use the built-in localStorage fallback instead; both paths produce identical
     * results and the fallback is always safe to rely on.
     *
     * @param {Object|null} srsDbModule - Module exposing importFromNeko(words, policy), or null.
     * @param {'skip'|'overwrite'} policy - Whether to skip or overwrite already-known words.
     * @returns {{ added: number, skipped: number }}
     */
    exportToAppSrs(srsDbModule, policy = 'skip') {
        if (this.isGlobalSrs) return { added: 0, skipped: 0 };

        const exportArray = Object.values(this.state.activeSrs).map(s => ({
            word:            s.id,
            furi:            s.kana,
            trans:           s.eng,
            nekoInterval:    s.interval,
            nekoRemainingMs: Math.max(0, s.nextReview - this.gameNow()),
            ease:            s.ease,
        }));

        // ── Preferred path: live srsDb module ────────────────────────────────
        if (srsDbModule && typeof srsDbModule.importFromNeko === 'function') {
            return srsDbModule.importFromNeko(exportArray, policy);
        }

        // ── Fallback: write directly to the shared localStorage key ──────────
        // Used when srsDb isn't available in the current module scope (e.g. the
        // game was loaded lazily and the main app hasn't injected the module).
        const STORAGE_KEY = 'ai_reader_srs_data';
        try {
            const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            let added = 0, skipped = 0;
            for (const w of exportArray) {
                if (!w.word) continue;
                if (existing[w.word] && policy === 'skip') { skipped++; continue; }
                if (!existing[w.word]) {
                    existing[w.word] = {
                        word:        w.word,
                        furi:        w.furi        || '',
                        translation: w.trans       || '',
                        status:      0,
                        interval:    (w.nekoInterval || 0) / 86400, // seconds → fractional days
                        ease:        w.ease        || 2.5,
                        reviewCount: 0,
                        dueDate:     new Date(Date.now() + (w.nekoRemainingMs || 0)).toISOString(),
                        lastUpdated: new Date().toISOString(),
                    };
                    added++;
                }
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
            return { added, skipped };
        } catch (e) {
            console.warn('[GameVocabManager] exportToAppSrs localStorage fallback failed:', e);
            return { added: 0, skipped: 0 };
        }
    }

    // ─── STATIC HELPERS ──────────────────────────────────────────────────────

    /**
     * Reads the app's central SRS database and returns a normalized vocab array
     * ready to pass straight into setPool().
     *
     * Encapsulates all knowledge of the raw storage key and field names so that
     * game modules never need to parse srs_data directly.
     *
     * @param {Object|null} srsDbModule
     *   Pass the live srsDb module if available — it will be used via getAllWords().
     *   If null/undefined the method falls back to reading localStorage directly.
     *
     * @returns {Array<{word, furi, trans, deckId:'srs'}>}
     *   Empty array when no SRS words exist or the store is unreadable.
     */
    static loadSrsPool(srsDbModule = null) {
        try {
            let wordDict = null;

            // ── Preferred: live module ────────────────────────────────────────
            if (srsDbModule && typeof srsDbModule.getAllWords === 'function') {
                wordDict = srsDbModule.getAllWords(); // { [word]: srsEntry }
            }

            // ── Fallback: localStorage ────────────────────────────────────────
            if (!wordDict) {
                const raw = localStorage.getItem('ai_reader_srs_data');
                if (!raw) return [];
                wordDict = JSON.parse(raw);
            }

            return Object.values(wordDict).map(w => ({
                word:   w.word,
                furi:   w.furi         || w.word,
                trans:  w.translation  || '—',
                deckId: 'srs',          // signals GameVocabManager to route through global SRS
            }));
        } catch (e) {
            console.warn('[GameVocabManager] loadSrsPool failed:', e);
            return [];
        }
    }

    /**
     * Returns the recommended default vocab config object.
     * Games should use this as the fallback when no saved config exists, instead
     * of hardcoding their own defaults:
     *
     *   _meta.vocabConfig = savedConfig || GameVocabManager.defaultConfig();
     *
     * @returns {Object}
     */
    static defaultConfig() {
        return {
            mode:                 'auto',   // 'auto' | 'manual' | 'random'
            initialInterval:      8,        // seconds before first re-review
            initialEase:          1.5,      // SM-2 ease multiplier
            leechThreshold:       20,       // wrong-answer count to flag a leech
            autoNewWordBatchSize: 1,        // words introduced per auto-event
            minDueTime:           10,       // seconds with no due cards before auto-introducing
            minAccuracy:          0.80,     // recent accuracy required before auto-introducing
        };
    }

    /**
     * Hard clamp limits for each config field.
     * Use these in settings UIs instead of hardcoding magic numbers:
     *
     *   const { min, max } = GameVocabManager.configLimits.autoNewWordBatchSize;
     *   value = Math.max(min, Math.min(max, rawInput));
     *
     * @returns {Object.<string, {min:number, max:number}>}
     */
    static get configLimits() {
        return {
            initialInterval:      { min: 1,    max: 300  },
            initialEase:          { min: 1.1,  max: 5.0  },
            leechThreshold:       { min: 3,    max: 100  },
            autoNewWordBatchSize: { min: 1,    max: 5    },
            minDueTime:           { min: 5,    max: 120  },
            minAccuracy:          { min: 0.50, max: 1.00 },
        };
    }
}