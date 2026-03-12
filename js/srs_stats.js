/**
 * srs_stats.js
 *
 * Comprehensive statistics engine for the SRS system.
 *
 * ─── STORAGE KEYS ────────────────────────────────────────────────────────────
 *   ai_reader_srs_stats_log    — append-only array of ReviewEvent objects
 *   ai_reader_srs_stats_daily  — { "YYYY-MM-DD": DaySummary }  (derived cache)
 *   ai_reader_srs_streak       — { current, longest, lastDate }
 *
 * ─── ReviewEvent shape ───────────────────────────────────────────────────────
 * {
 *   ts:          "2024-01-15T10:23:00.000Z",  // ISO timestamp
 *   word:        "日本語",
 *   grade:       2,                            // 0=Again 1=Hard 2=Good 3=Easy (null for lingq)
 *   lingq:       null,                         // 0-5 lingq status set (null for srs)
 *   source:      "srs" | "game" | "lingq",    // where the grade came from
 *   newInterval: 3.2,                          // days, after grading
 *   newEase:     2.5,
 *   reviewCount: 4,
 * }
 *
 * ─── DaySummary shape ────────────────────────────────────────────────────────
 * {
 *   total:        12,
 *   again:        1, hard: 2, good: 6, easy: 3,
 *   lingq:        0,
 *   uniqueWords:  ["日本語", ...],   // words seen this day
 *   retentionPct: 75,               // (good+easy) / (again+hard+good+easy) * 100
 * }
 */

const LOG_KEY    = 'ai_reader_srs_stats_log';
const DAILY_KEY  = 'ai_reader_srs_stats_daily';
const STREAK_KEY = 'ai_reader_srs_streak';

// ─── LOW-LEVEL STORAGE ───────────────────────────────────────────────────────

function _getLog() {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); }
    catch { return []; }
}

function _getDaily() {
    try { return JSON.parse(localStorage.getItem(DAILY_KEY) || '{}'); }
    catch { return {}; }
}

function _getStreak() {
    try {
        return JSON.parse(
            localStorage.getItem(STREAK_KEY) ||
            '{"current":0,"longest":0,"lastDate":null}'
        );
    } catch {
        return { current: 0, longest: 0, lastDate: null };
    }
}

function _saveLog(log)       { localStorage.setItem(LOG_KEY,    JSON.stringify(log));    }
function _saveDaily(daily)   { localStorage.setItem(DAILY_KEY,  JSON.stringify(daily));  }
function _saveStreak(streak) { localStorage.setItem(STREAK_KEY, JSON.stringify(streak)); }

// ─── DATE HELPERS ────────────────────────────────────────────────────────────

function _todayKey()  { return new Date().toISOString().slice(0, 10); }

/** Days between two YYYY-MM-DD strings (b − a). */
function _daysBetween(a, b) {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

// ─── STREAK MAINTENANCE ──────────────────────────────────────────────────────

function _updateStreak() {
    const today  = _todayKey();
    const streak = _getStreak();

    if (streak.lastDate === today) return streak;  // already counted today

    if (streak.lastDate === null) {
        streak.current = 1;
    } else {
        const gap = _daysBetween(streak.lastDate, today);
        if      (gap === 1) streak.current += 1;
        else if (gap  >  1) streak.current  = 1;   // broken
        // gap === 0: handled by early-return above
    }

    streak.longest  = Math.max(streak.longest, streak.current);
    streak.lastDate = today;
    _saveStreak(streak);
    return streak;
}

// ─── PUBLIC: RECORD A REVIEW ─────────────────────────────────────────────────

/**
 * Called automatically by srs_db.js after every grade or status change.
 * Can also be called manually for custom integrations.
 *
 * @param {object} p
 * @param {string}      p.word
 * @param {number|null} p.grade        0-3 for SRS; null for LingQ-only
 * @param {number|null} p.lingq        0-5 for LingQ status; null for SRS
 * @param {string}      p.source       'srs' | 'game' | 'lingq'
 * @param {number}      [p.newInterval] interval in days after grading
 * @param {number}      [p.newEase]
 * @param {number}      [p.reviewCount]
 * @returns {object}  the ReviewEvent that was recorded
 */
export function recordReview({
    word,
    grade       = null,
    lingq       = null,
    source      = 'srs',
    newInterval = 0,
    newEase     = 2.5,
    reviewCount = 0,
}) {
    const ts    = new Date().toISOString();
    const event = { ts, word, grade, lingq, source, newInterval, newEase, reviewCount };

    // ── 1. Append to log ──────────────────────────────────────────────────────
    const log = _getLog();
    log.push(event);
    _saveLog(log);

    // ── 2. Update daily summary cache ─────────────────────────────────────────
    const key   = _todayKey();
    const daily = _getDaily();
    if (!daily[key]) {
        daily[key] = {
            total: 0, again: 0, hard: 0, good: 0, easy: 0,
            lingq: 0, uniqueWords: [], retentionPct: 0,
        };
    }
    const d = daily[key];
    d.total++;
    if      (grade === 0) d.again++;
    else if (grade === 1) d.hard++;
    else if (grade === 2) d.good++;
    else if (grade === 3) d.easy++;
    else if (lingq !== null) d.lingq++;

    if (!d.uniqueWords.includes(word)) d.uniqueWords.push(word);

    const srsTotal    = d.again + d.hard + d.good + d.easy;
    d.retentionPct    = srsTotal > 0
        ? Math.round((d.good + d.easy) / srsTotal * 100)
        : 0;
    _saveDaily(daily);

    // ── 3. Update streak (only real SRS grades count toward streak) ───────────
    if (grade !== null) _updateStreak();

    return event;
}

// ─── PUBLIC: SUMMARY GETTERS ─────────────────────────────────────────────────

/** Today's DaySummary (live from cache). */
export function getToday() {
    const d = _getDaily()[_todayKey()];
    return d || {
        total: 0, again: 0, hard: 0, good: 0, easy: 0,
        lingq: 0, uniqueWords: [], retentionPct: 0,
    };
}

/** Streak info: { current, longest, lastDate }. */
export function getStreak() { return _getStreak(); }

/** Full raw event log (read-only copy). */
export function getLog() { return _getLog(); }

/**
 * All-time aggregate stats, computed over the full event log.
 *
 * @returns {AllTimeStats}
 */
export function getAllTimeStats() {
    const log    = _getLog();
    const daily  = _getDaily();
    const streak = _getStreak();

    let again = 0, hard = 0, good = 0, easy = 0, lingqChanges = 0;
    const wordsSeen         = new Set();
    const wordsPerSource    = { srs: new Set(), game: new Set(), lingq: new Set() };
    const gradesByWord      = {};     // word → { again, hard, good, easy }
    let   easeSum = 0, easeN = 0;

    for (const e of log) {
        wordsSeen.add(e.word);
        const src = e.source || 'srs';
        if (wordsPerSource[src]) wordsPerSource[src].add(e.word);

        if      (e.grade === 0) again++;
        else if (e.grade === 1) hard++;
        else if (e.grade === 2) good++;
        else if (e.grade === 3) easy++;
        else if (e.lingq !== null) lingqChanges++;

        if (!gradesByWord[e.word]) gradesByWord[e.word] = { again: 0, hard: 0, good: 0, easy: 0 };
        if      (e.grade === 0) gradesByWord[e.word].again++;
        else if (e.grade === 1) gradesByWord[e.word].hard++;
        else if (e.grade === 2) gradesByWord[e.word].good++;
        else if (e.grade === 3) gradesByWord[e.word].easy++;

        if (e.newEase) { easeSum += e.newEase; easeN++; }
    }

    const srsTotal     = again + hard + good + easy;
    const retentionPct = srsTotal > 0
        ? Math.round((good + easy) / srsTotal * 100)
        : 0;

    // ── Per-word analysis ────────────────────────────────────────────────────
    const wordMetrics = Object.entries(gradesByWord).map(([word, g]) => {
        const total      = g.again + g.hard + g.good + g.easy;
        const retention  = total > 0 ? (g.good + g.easy) / total * 100 : 0;
        return {
            word, total,
            again: g.again, hard: g.hard, good: g.good, easy: g.easy,
            againPct:     Math.round(g.again / Math.max(total, 1) * 100),
            easyPct:      Math.round(g.easy  / Math.max(total, 1) * 100),
            retentionPct: Math.round(retention),
        };
    });

    // Leeches = hardest to remember (high again%, ≥3 SRS reviews)
    const hardestWords = wordMetrics
        .filter(x => x.total >= 3)
        .sort((a, b) => b.againPct - a.againPct)
        .slice(0, 10);

    // Easiest words (highest easy%)
    const easiestWords = wordMetrics
        .filter(x => x.total >= 3)
        .sort((a, b) => b.easyPct - a.easyPct)
        .slice(0, 10);

    // ── Active days / best day ───────────────────────────────────────────────
    const activeDays = Object.keys(daily).filter(k => (daily[k].total || 0) > 0);
    let bestDay = null, bestDayCount = 0;
    for (const k of activeDays) {
        if ((daily[k].total || 0) > bestDayCount) {
            bestDayCount = daily[k].total;
            bestDay = k;
        }
    }

    // ── Reviews by day-of-week (0=Sun … 6=Sat) ──────────────────────────────
    const byDow = [0, 0, 0, 0, 0, 0, 0];
    for (const e of log) {
        if (e.grade !== null) byDow[new Date(e.ts).getDay()]++;
    }

    // ── Reviews by hour of day (0-23) ────────────────────────────────────────
    const byHour = Array(24).fill(0);
    for (const e of log) {
        if (e.grade !== null) byHour[new Date(e.ts).getHours()]++;
    }

    // ── Grade distribution as percentages ────────────────────────────────────
    const gradeDistribution = srsTotal > 0 ? {
        againPct: Math.round(again / srsTotal * 100),
        hardPct:  Math.round(hard  / srsTotal * 100),
        goodPct:  Math.round(good  / srsTotal * 100),
        easyPct:  Math.round(easy  / srsTotal * 100),
    } : { againPct: 0, hardPct: 0, goodPct: 0, easyPct: 0 };

    return {
        // ── Core counts ──────────────────────────────────────────────────────
        totalReviews:    log.length,
        srsReviews:      srsTotal,
        lingqChanges,
        again, hard, good, easy,
        gradeDistribution,
        retentionPct,

        // ── Word counts ──────────────────────────────────────────────────────
        uniqueWordsSeen: wordsSeen.size,
        wordsBySource: {
            srs:   wordsPerSource.srs.size,
            game:  wordsPerSource.game.size,
            lingq: wordsPerSource.lingq.size,
        },

        // ── SM-2 health ──────────────────────────────────────────────────────
        avgEase: easeN > 0 ? Math.round(easeSum / easeN * 100) / 100 : 2.5,

        // ── Streaks ──────────────────────────────────────────────────────────
        streak: {
            current:  streak.current,
            longest:  streak.longest,
            lastDate: streak.lastDate,
        },

        // ── Calendar / time patterns ─────────────────────────────────────────
        activeDays:   activeDays.length,
        bestDay,
        bestDayCount,
        byDow,        // array [sun, mon, tue, wed, thu, fri, sat]
        byHour,       // array indexed 0-23

        // ── Rolling averages (reviews/day) ───────────────────────────────────
        roll7avg:  _rollingAvg(daily, _todayKey(), 7),
        roll30avg: _rollingAvg(daily, _todayKey(), 30),

        // ── Per-word insights ─────────────────────────────────────────────────
        hardestWords,   // top 10 leeches
        easiestWords,   // top 10 easiest

        // ── Chart-ready daily history (last 90 days) ─────────────────────────
        dailyHistory: _buildDailyHistory(daily, _todayKey(), 90),
    };
}

/**
 * Stats for a specific rolling time window.
 * @param {number} days  e.g. 7, 30, 90, 365
 */
export function getWindowStats(days = 30) {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const log    = _getLog().filter(e => e.ts >= cutoff);

    let again = 0, hard = 0, good = 0, easy = 0, lingq = 0;
    const words = new Set();
    for (const e of log) {
        words.add(e.word);
        if      (e.grade === 0) again++;
        else if (e.grade === 1) hard++;
        else if (e.grade === 2) good++;
        else if (e.grade === 3) easy++;
        else if (e.lingq !== null) lingq++;
    }
    const srsTotal = again + hard + good + easy;
    return {
        days,
        totalReviews: log.length,
        srsReviews:   srsTotal,
        again, hard, good, easy, lingq,
        uniqueWords:  words.size,
        retentionPct: srsTotal > 0 ? Math.round((good + easy) / srsTotal * 100) : 0,
    };
}

/**
 * Full per-word stats from the event log.
 * Pair with srsDb.getWord() to add current interval / ease / dueDate.
 */
export function getWordStats(wordText) {
    const log   = _getLog().filter(e => e.word === wordText);
    const first = log[0]?.ts || null;
    const last  = log[log.length - 1]?.ts || null;

    let again = 0, hard = 0, good = 0, easy = 0, lingq = 0;
    for (const e of log) {
        if      (e.grade === 0) again++;
        else if (e.grade === 1) hard++;
        else if (e.grade === 2) good++;
        else if (e.grade === 3) easy++;
        else if (e.lingq !== null) lingq++;
    }
    const srsTotal = again + hard + good + easy;
    return {
        word:        wordText,
        totalEvents: log.length,
        srsReviews:  srsTotal,
        again, hard, good, easy, lingq,
        retentionPct: srsTotal > 0 ? Math.round((good + easy) / srsTotal * 100) : 0,
        firstSeen:   first,
        lastSeen:    last,
    };
}

/**
 * Leech detector — words with low retention after enough reviews.
 * @param {number} threshold   retention % below which a word is a leech (default 40)
 * @param {number} minReviews  minimum SRS reviews required (default 4)
 */
export function getLeeches(threshold = 40, minReviews = 4) {
    const log    = _getLog();
    const byWord = {};
    for (const e of log) {
        if (e.grade === null) continue;
        if (!byWord[e.word]) byWord[e.word] = { again: 0, hard: 0, good: 0, easy: 0 };
        if      (e.grade === 0) byWord[e.word].again++;
        else if (e.grade === 1) byWord[e.word].hard++;
        else if (e.grade === 2) byWord[e.word].good++;
        else if (e.grade === 3) byWord[e.word].easy++;
    }
    return Object.entries(byWord)
        .map(([word, g]) => {
            const total     = g.again + g.hard + g.good + g.easy;
            const retention = total > 0 ? (g.good + g.easy) / total * 100 : 0;
            return { word, total, retention: Math.round(retention), ...g };
        })
        .filter(x => x.total >= minReviews && x.retention < threshold)
        .sort((a, b) => a.retention - b.retention);
}

// ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────

/** Average reviews/day over the last `days` calendar days. */
function _rollingAvg(daily, todayKey, days) {
    let sum = 0;
    for (let i = 0; i < days; i++) {
        const d = new Date(todayKey);
        d.setDate(d.getDate() - i);
        sum += daily[d.toISOString().slice(0, 10)]?.total || 0;
    }
    return Math.round(sum / days * 10) / 10;
}

/** Build chart-ready daily array for the last `days` days (oldest first). */
function _buildDailyHistory(daily, todayKey, days) {
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
        const d   = new Date(todayKey);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const day = daily[key] || {};
        result.push({
            date:         key,
            total:        day.total        || 0,
            again:        day.again        || 0,
            hard:         day.hard         || 0,
            good:         day.good         || 0,
            easy:         day.easy         || 0,
            lingq:        day.lingq        || 0,
            uniqueWords:  (day.uniqueWords || []).length,
            retentionPct: day.retentionPct || 0,
        });
    }
    return result;
}

// ─── DATA MANAGEMENT ─────────────────────────────────────────────────────────

/** Wipe all stats data (log + daily cache + streak). Irreversible. */
export function clearAllStats() {
    localStorage.removeItem(LOG_KEY);
    localStorage.removeItem(DAILY_KEY);
    localStorage.removeItem(STREAK_KEY);
}

/**
 * Export stats as a plain object for JSON backup.
 */
export function exportStats() {
    return {
        exportedAt: new Date().toISOString(),
        log:        _getLog(),
        daily:      _getDaily(),
        streak:     _getStreak(),
    };
}

/**
 * Import a previously exported stats blob.
 * @param {object}              blob    { log, daily, streak }
 * @param {'replace'|'merge'}  policy  default 'merge'
 */
export function importStats(blob, policy = 'merge') {
    if (policy === 'replace') {
        _saveLog(blob.log    || []);
        _saveDaily(blob.daily || {});
        _saveStreak(blob.streak || { current: 0, longest: 0, lastDate: null });
        return;
    }

    // merge: combine logs (deduplicate by ts+word), take best streak values
    const existing = new Set(_getLog().map(e => `${e.ts}|${e.word}`));
    const merged   = _getLog();
    for (const e of (blob.log || [])) {
        if (!existing.has(`${e.ts}|${e.word}`)) merged.push(e);
    }
    merged.sort((a, b) => a.ts.localeCompare(b.ts));
    _saveLog(merged);

    const existingDaily = _getDaily();
    for (const [k, v] of Object.entries(blob.daily || {})) {
        if (!existingDaily[k]) existingDaily[k] = v;
    }
    _saveDaily(existingDaily);

    const es = _getStreak();
    const is = blob.streak || {};
    es.longest  = Math.max(es.longest, is.longest || 0);
    es.current  = Math.max(es.current, is.current || 0);
    if (!es.lastDate || (is.lastDate && is.lastDate > es.lastDate)) {
        es.lastDate = is.lastDate;
    }
    _saveStreak(es);
}
