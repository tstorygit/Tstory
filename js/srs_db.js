/**
 * srs_db.js
 *
 * SRS Word Object Structure (v2 — SM-2 scheduling):
 * {
 *   word:         "日本語",
 *   furi:         "にほんご",
 *   translation:  "Japanese language",
 *   status:       0,              // LingQ-style 0–5 (still used for reader colouring)
 *   lastUpdated:  "2023-10-27T...",
 *
 *   // SM-2 fields (added v2, undefined on legacy words = treated as new):
 *   interval:     1,              // days until next review
 *   ease:         2.5,            // SM-2 ease factor
 *   dueDate:      "2023-10-28T...",  // ISO date when next due
 *   reviewCount:  0,              // total times reviewed via the SRS deck
 * }
 *
 * LingQ status ↔ interval thresholds (used when srsAutoStatus is enabled):
 *   0 → not yet scheduled
 *   1 → interval < 3 days
 *   2 → interval < 7 days
 *   3 → interval < 30 days
 *   4 → interval < 180 days (6 months)
 *   5 → interval ≥ 180 days
 */

const STORAGE_KEY = 'ai_reader_srs_data';

// ─── CORE CRUD ───────────────────────────────────────────────────────────────

export function getAllWords() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
}

function _persist(words) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
}

export function saveWord(wordObj) {
    const words = getAllWords();
    words[wordObj.word] = {
        ...wordObj,
        lastUpdated: new Date().toISOString()
    };
    _persist(words);
}

export function getWord(wordText) {
    return getAllWords()[wordText] || null;
}

// ─── STATUS ──────────────────────────────────────────────────────────────────

/**
 * Derive a LingQ 0-5 status from an SRS interval (days).
 * Used when srsAutoStatus is enabled in settings.
 */
export function statusFromInterval(intervalDays) {
    if (!intervalDays || intervalDays < 1) return 1;
    if (intervalDays <   3) return 1;
    if (intervalDays <   7) return 2;
    if (intervalDays <  30) return 3;
    if (intervalDays < 180) return 4;
    return 5;
}

export function updateWordStatus(wordText, newStatus) {
    const words = getAllWords();
    if (words[wordText]) {
        words[wordText].status      = parseInt(newStatus);
        words[wordText].lastUpdated = new Date().toISOString();
        _persist(words);
        return true;
    }
    return false;
}

export function deleteWord(wordText) {
    const words = getAllWords();
    if (words[wordText]) {
        delete words[wordText];
        _persist(words);
        return true;
    }
    return false;
}

// ─── SM-2 SCHEDULING ─────────────────────────────────────────────────────────

/**
 * Grade a card using a simplified SM-2 algorithm.
 *
 * grade:
 *   0 = Again  (complete blackout)
 *   1 = Hard   (significant difficulty)
 *   2 = Good   (recalled with effort)
 *   3 = Easy   (recalled perfectly)
 *
 * Returns the updated word object (not persisted yet — caller decides).
 */
export function scheduleReview(wordObj, grade) {
    const MIN_EASE = 1.3;
    const now      = new Date();

    // Initialise SM-2 fields for legacy / newly-added words.
    // Interval is stored in fractional DAYS (e.g. 8s = 8/86400).
    let interval    = wordObj.interval    ?? 1;
    let ease        = wordObj.ease        ?? 2.5;
    let reviewCount = wordObj.reviewCount ?? 0;

    reviewCount++;

    if (grade === 0) {
        // Again — go back to a short re-study interval (10 min) rather than 1 full day,
        // so sub-day words stay sub-day and arent pushed out unnecessarily.
        interval = Math.min(interval, 10 / 1440);   // 10 minutes in fractional days
        ease     = Math.max(MIN_EASE, ease - 0.2);
    } else if (grade === 1) {
        // Hard — grow a little but stay in same order of magnitude
        ease     = Math.max(MIN_EASE, ease - 0.15);
        interval = Math.max(interval, interval * 1.2);
    } else if (grade === 2) {
        // Good — standard SM-2 graduation
        if (reviewCount === 1)      interval = Math.max(interval, 10 / 1440);  // 10 min
        else if (reviewCount === 2) interval = Math.max(interval, 1);          // 1 day
        else                        interval = interval * ease;
        ease = Math.max(MIN_EASE, ease - 0.02);
    } else {
        // Easy (3)
        if (reviewCount === 1)      interval = Math.max(interval, 1);          // 1 day
        else if (reviewCount === 2) interval = Math.max(interval, 4);          // 4 days
        else                        interval = interval * ease * 1.3;
        ease = Math.min(ease + 0.1, 3.5);
    }

    const dueDate = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

    return {
        ...wordObj,
        interval,
        ease,
        reviewCount,
        dueDate:     dueDate.toISOString(),
        lastUpdated: now.toISOString(),
    };
}

/**
 * Commit a review grade to the database.
 * Also optionally updates the LingQ status based on the new interval
 * if autoStatus === true (passed in from settings.srsAutoStatus).
 */
export function gradeWord(wordText, grade, autoStatus = false) {
    const words = getAllWords();
    const word  = words[wordText];
    if (!word) return false;

    const updated = scheduleReview(word, grade);

    if (autoStatus) {
        updated.status = statusFromInterval(updated.interval);
    }

    words[wordText] = updated;
    _persist(words);
    return updated;
}

// ─── GAME INTEGRATION ────────────────────────────────────────────────────────

/**
 * Specialized grading for Games (TBB, VocabCraft).
 * Prevents interval explosion for non-due words.
 * @param {object} wordData - {word, furi, translation}
 * @param {number} grade - 0-3
 * @param {boolean} autoStatus
 */
export function gradeWordInGame(wordData, grade, autoStatus = false) {
    const words = getAllWords();
    let word = words[wordData.word];

    const now = new Date();
    
    // If word doesn't exist in SRS DB yet, initialize it
    if (!word) {
        word = {
            word: wordData.word,
            furi: wordData.furi || '',
            translation: wordData.trans || wordData.translation || '',
            status: 0,
            interval: 0,
            ease: 2.5,
            reviewCount: 0,
            dueDate: now.toISOString(),
            lastUpdated: now.toISOString()
        };
    }

    const isDue = !word.dueDate || new Date(word.dueDate) <= now;

    // The Safety Valve: Not Due + Correct -> Free Drill, no interval change.
    if (!isDue && grade > 0) {
        // Just update lastUpdated so it cycles to the back of the "Least Recently Seen" fallback queue
        word.lastUpdated = now.toISOString();
        words[word.word] = word;
        _persist(words);
        return word;
    }

    // Otherwise (isDue OR Wrong), perform standard SM-2 update
    const updated = scheduleReview(word, grade);

    if (autoStatus) {
        updated.status = statusFromInterval(updated.interval);
    }

    words[updated.word] = updated;
    _persist(words);
    return updated;
}

/**
 * Gets the next best word for a game session based on strict priorities.
 * Modes:
 * - 'srs': Strictly prefers Due -> Drill -> New
 * - 'new': Strictly prefers New -> Drill -> Due
 * - 'mixed': Natural order (Due -> Learning Drill (<7d) -> New -> Mature Drill)
 * 
 * @param {Array} sessionQueue - Array of word objects {word, furi, trans} active in the session
 * @param {string} mode - 'srs', 'new', or 'mixed'
 * @returns {Object} { wordObj, type: 'due'|'drill'|'new' }
 */
export function getNextGameWord(sessionQueue, mode = 'mixed') {
    const words = getAllWords();
    const now = new Date();
    const DRILL_THRESHOLD_DAYS = 7;

    let due = [];
    let learningDrill = []; // Not due, interval < 7 days
    let matureDrill = [];   // Not due, interval >= 7 days
    let brandNew = [];

    sessionQueue.forEach(w => {
        const entry = words[w.word];
        if (!entry) {
            brandNew.push(w);
        } else if (!entry.dueDate || new Date(entry.dueDate) <= now) {
            due.push(w);
        } else {
            if ((entry.interval || 0) < DRILL_THRESHOLD_DAYS) {
                learningDrill.push({ wordObj: w, lastUpdated: new Date(entry.lastUpdated).getTime() });
            } else {
                matureDrill.push({ wordObj: w, lastUpdated: new Date(entry.lastUpdated).getTime() });
            }
        }
    });

    // Sort drills by least recently seen first (ascending time)
    learningDrill.sort((a, b) => a.lastUpdated - b.lastUpdated);
    matureDrill.sort((a, b) => a.lastUpdated - b.lastUpdated);

    let selected = null;
    const pickRandom = (arr) => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
    const pickOldest = (arr) => arr.length ? arr[0].wordObj : null;

    if (mode === 'new') {
        selected = pickRandom(brandNew);
        if (selected) return { wordObj: selected, type: 'new' };
        selected = pickOldest(learningDrill);
        if (selected) return { wordObj: selected, type: 'drill' };
        selected = pickOldest(matureDrill);
        if (selected) return { wordObj: selected, type: 'drill' };
        selected = pickRandom(due);
        if (selected) return { wordObj: selected, type: 'due' };
    } 
    else if (mode === 'srs') {
        selected = pickRandom(due);
        if (selected) return { wordObj: selected, type: 'due' };
        selected = pickOldest(learningDrill);
        if (selected) return { wordObj: selected, type: 'drill' };
        selected = pickOldest(matureDrill);
        if (selected) return { wordObj: selected, type: 'drill' };
        selected = pickRandom(brandNew);
        if (selected) return { wordObj: selected, type: 'new' };
    } 
    else {
        // 'mixed' mode
        selected = pickRandom(due);
        if (selected) return { wordObj: selected, type: 'due' };
        selected = pickOldest(learningDrill);
        if (selected) return { wordObj: selected, type: 'drill' };
        selected = pickRandom(brandNew);
        if (selected) return { wordObj: selected, type: 'new' };
        selected = pickOldest(matureDrill);
        if (selected) return { wordObj: selected, type: 'drill' };
    }

    // Ultimate fallback (should never hit unless sessionQueue is empty)
    return { wordObj: sessionQueue[Math.floor(Math.random() * sessionQueue.length)], type: 'due' };
}

// ─── NEKO IMPORT ─────────────────────────────────────────────────────────────

/**
 * Import words from the Neko game's SRS save.
 */
export function importFromNeko(nekoWords, existingPolicy = 'skip') {
    const words = getAllWords();
    let added = 0, skipped = 0;

    for (const w of nekoWords) {
        if (!w.word) continue;

        if (words[w.word]) {
            if (existingPolicy === 'merge') {
                if (!words[w.word].furi        && w.furi)  words[w.word].furi        = w.furi;
                if (!words[w.word].translation && w.trans) words[w.word].translation = w.trans;
            }
            skipped++;
        } else {
            const nekoIntervalSec  = w.nekoInterval    || 0;
            const nekoRemainingMs  = w.nekoRemainingMs || 0;
            const ease             = w.ease            || 2.5;

            let intervalDays, dueDate;
            if (nekoIntervalSec > 0) {
                intervalDays = nekoIntervalSec / 86400;
                dueDate = new Date(Date.now() + nekoRemainingMs).toISOString();
            } else {
                intervalDays = 0;
                dueDate      = new Date().toISOString();
            }

            words[w.word] = {
                word:        w.word,
                furi:        w.furi  || '',
                translation: w.trans || '',
                status:      statusFromInterval(intervalDays),
                interval:    intervalDays,
                ease:        ease,
                reviewCount: 0,
                dueDate:     dueDate,
                lastUpdated: new Date().toISOString(),
            };
            added++;
        }
    }

    _persist(words);
    return { added, skipped };
}

// ─── QUEUE HELPERS ───────────────────────────────────────────────────────────

export function getDueWords(limit = 0) {
    const now  = new Date();
    let words  = Object.values(getAllWords()).filter(w => {
        if (!w.dueDate) return true;            
        return new Date(w.dueDate) <= now;
    });

    words.sort((a, b) => {
        const da = a.dueDate ? new Date(a.dueDate) : new Date(0);
        const db = b.dueDate ? new Date(b.dueDate) : new Date(0);
        return da - db;
    });

    return limit > 0 ? words.slice(0, limit) : words;
}

export function getFilteredWords(criteria = {}) {
    let words = Object.values(getAllWords());

    if (criteria.maxStatus !== undefined) words = words.filter(w => w.status <= criteria.maxStatus);
    if (criteria.minStatus !== undefined) words = words.filter(w => w.status >= criteria.minStatus);

    const sort = criteria.sort || 'oldest';
    if (sort === 'newest') {
        words.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
    } else if (sort === 'az') {
        words.sort((a, b) => (a.word || '').localeCompare(b.word || ''));
    } else {
        words.sort((a, b) => new Date(a.lastUpdated) - new Date(b.lastUpdated));
    }

    if (criteria.limit) words = words.slice(0, criteria.limit);
    return words;
}