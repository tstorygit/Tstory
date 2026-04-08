/**
 * vocab_selector.js
 *
 * A fully self-contained vocabulary-selector setup screen for mini-games.
 *
 * Each deck has its own independent rank range (e.g. Frequency 100–200,
 * Anime 300–345).  Ranges are persisted per-deck in localStorage.
 *
 * ── Public API ───────────────────────────────────────────────────────────────
 *
 *   mountVocabSelector(screenEl, options)  → controller
 *
 *   controller.getQueue()   → Promise<word[]>
 *   controller.getActionsEl()
 *   controller.refresh()
 *
 *   getBannedWords(bannedKey)
 *   setBannedWords(bannedKey, list)
 *
 * ── Selection Modes ──────────────────────────────────────────────────────────
 *   Random     – pool shuffled before count-limit slice (different words each session)
 *   Sequential – pool sorted by rank before slice (always same first-N words)
 */

import * as srsDb from './srs_db.js';

// ─── DECK REGISTRY ───────────────────────────────────────────────────────────

const DECKS = [
    // ── Interest ──────────────────────────────────────────────────────────────
    { id: 'anime',     category: 'interest', label: '🗡️ Anime',    file: '../data/word_list_1000_anime.js',      exportName: 'wordList', _cache: null, _promise: null,
      description: 'Skip the boardroom and learn what you actually hear in your favorite shows. Tailored for anime fans, focusing on casual pronouns, magic, and emotional vocabulary.' },
    { id: 'romance',   category: 'interest', label: '💔 Romance',  file: '../data/word_list_1000_romance.js',    exportName: 'wordList', _cache: null, _promise: null,
      description: 'Dive into modern relationships and reality TV drama. Focus on the vocabulary of love, dating apps, emotional heartbreaks, and social lives of young adults.' },
    { id: 'gamer',     category: 'interest', label: '🎮 Gamer',    file: '../data/word_list_1000_gamer.js',      exportName: 'wordList', _cache: null, _promise: null,
      description: 'Log in and chat like a native. Master modern Japanese internet slang, gaming terminology, and V-Tuber culture that traditional textbooks refuse to teach.' },
    { id: 'foodie',    category: 'interest', label: '🍣 Foodie',   file: '../data/word_list_1000_foodie.js',     exportName: 'wordList', _cache: null, _promise: null,
      description: 'An all-you-can-eat buffet of culinary vocabulary. Learn how to confidently order at an Izakaya, understand complex menus, and describe the rich textures of Japanese food.' },
    { id: 'history',   category: 'interest', label: '🏯 History',  file: '../data/word_list_1000_history.js',    exportName: 'wordList', _cache: null, _promise: null,
      description: 'Step back in time to the Edo period. Master the vocabulary of shoguns, swordsmanship, traditional architecture, and ancient folklore.' },
    // ── Goal ──────────────────────────────────────────────────────────────────
    { id: 'tourist',   category: 'goal',     label: '✈️ Tourist',  file: '../data/word_list_1000_tourist.js',    exportName: 'wordList', _cache: null, _promise: null,
      description: 'The essentials for your trip: navigating the train system, shopping, asking for directions, and surviving your dream vacation without getting lost.' },
    { id: 'expat',     category: 'goal',     label: '🏢 Expat',    file: '../data/word_list_1000_expat.js',      exportName: 'wordList', _cache: null, _promise: null,
      description: 'The survival guide for residents. Tackle the realities of Japanese city hall, renting apartments, bank accounts, and sorting trash like a local.' },
    { id: 'frequency', category: 'goal',     label: '💼 Standard', file: '../data/word_list_1000_frequency.js',  exportName: 'wordList', _cache: null, _promise: null,
      description: 'The traditional newspaper frequency list. Perfect for professional contexts, reading official documents, and high-level formal conversation.' },
    { id: 'jlpt_n5',   category: 'goal',     label: '🔰 JLPT N5', file: '../data/word_list_jlpt_n5.js',         exportName: 'wordList', _cache: null, _promise: null,
      description: 'The first step of the official proficiency test. Covers basic daily expressions, essential verbs, and the foundation of the Japanese language.' },
    { id: 'jlpt_n4',   category: 'goal',     label: '📜 JLPT N4', file: '../data/word_list_jlpt_n4.js',         exportName: 'wordList', _cache: null, _promise: null,
      description: 'Covers the official N4 vocabulary core (giving/receiving verbs, state changes, and daily interactions) rough 1-800 plus an extensive collection of advanced vocabulary to bridge the gap toward N3-level proficiency.' },
];

function _getDeckList(deck) {
    if (deck._cache) return Promise.resolve(deck._cache);
    if (!deck._promise) {
        deck._promise = import(deck.file)
            .then(mod => { deck._cache = mod[deck.exportName] || mod.wordList || mod.default || []; return deck._cache; })
            .catch(() => { deck._cache = []; return []; });
    }
    return deck._promise;
}

// ─── BAN LIST ────────────────────────────────────────────────────────────────

export function getBannedWords(bannedKey = 'vocab_selector_banned') {
    try { return JSON.parse(localStorage.getItem(bannedKey)) || []; }
    catch { return []; }
}

export function setBannedWords(bannedKey = 'vocab_selector_banned', list) {
    localStorage.setItem(bannedKey, JSON.stringify(list));
}

// ─── SETTINGS PERSISTENCE ────────────────────────────────────────────────────

function _loadSettings(settingsKey) {
    try { return JSON.parse(localStorage.getItem(settingsKey)) || {}; }
    catch { return {}; }
}

function _saveSettings(settingsKey, patch) {
    localStorage.setItem(settingsKey, JSON.stringify({ ..._loadSettings(settingsKey), ...patch }));
}

// Per-deck range helpers
function _getDeckRange(saved, deckId) {
    return saved.deckRanges?.[deckId] ?? { lo: 1, hi: 1000 };
}

function _saveDeckRange(settingsKey, deckId, lo, hi) {
    const saved  = _loadSettings(settingsKey);
    const ranges = saved.deckRanges || {};
    ranges[deckId] = { lo, hi };
    _saveSettings(settingsKey, { deckRanges: ranges });
}

// ─── DECK CONFIG SNAPSHOT ────────────────────────────────────────────────────
// Returns a plain-object snapshot of the current selector state that can be
// persisted per-game (e.g. in neko_nihongo_cfg) and later reloaded via
// mountVocabSelector's `preloadConfig` option to restore a saved deck choice.

export function getDeckConfig(screenEl) {
    const root = screenEl?.querySelector('.vs-root');
    if (!root) return null;

    const useSrs = root.querySelector('.vs-use-srs')?.checked ?? false;
    const srsFilterMode = root.querySelector('input[name="vs-srs-mode"]:checked')?.value ?? 'metrics';
    const srsMetric = root.querySelector('.vs-srs-metric-select')?.value ?? 'all';
    const statuses = [...root.querySelectorAll('.vs-status-check:checked')].map(c => +c.value);
    
    const selMode  = root.querySelector('input[name="vs-sel-mode"]:checked')?.value ?? 'random';
    const countBtn = root.querySelector('.caro-count-btn.active');
    const count    = countBtn ? (countBtn.getAttribute('data-count') === 'All' ? 'All' : +countBtn.getAttribute('data-count')) : 'All';

    const decks = {};
    root.querySelectorAll('.vs-use-deck').forEach(cb => {
        if (cb.checked) {
            const deckId   = cb.dataset.deckId;
            const panel    = root.querySelector(`.vs-deck-range[data-for-deck="${deckId}"]`);
            const lo = +(panel?.querySelector('.vs-range-low')?.value  || 1);
            const hi = +(panel?.querySelector('.vs-range-high')?.value || 1000);
            decks[deckId] = { lo, hi };
        }
    });

    return { useSrs, srsFilterMode, srsMetric, statuses, selMode, count, decks };
}

// ─── MOUNT ───────────────────────────────────────────────────────────────────

export function mountVocabSelector(screenEl, opts = {}) {
    const {
        bannedKey       = 'vocab_selector_banned',
        showCountPicker = true,
        defaultCounts   = [10, 20, 50, 100, 200, 500, 1000, 'All'],
        defaultCount    = 'All',
        title           = 'Setup',
        preloadConfig   = null,   // { useSrs, srsFilterMode, srsMetric, statuses, selMode, count, decks:{id:{lo,hi}} }
        extendMode      = false,  // true → show "extending existing deck" banner
    } = opts;

    const settingsKey = bannedKey + '_settings';

    _render(screenEl, { bannedKey, settingsKey, showCountPicker, defaultCounts, defaultCount, title, preloadConfig, extendMode });
    _wireEvents(screenEl, { bannedKey, settingsKey, showCountPicker, defaultCounts, defaultCount, title, opts, preloadConfig });

    return {
        getQueue:     () => _buildQueueAsync(screenEl, { bannedKey }),
        getActionsEl: () => {
            const el = screenEl.querySelector('.vs-actions');
            if (el) el.style.display = 'flex'; // reveal now that caller is adding buttons
            return el;
        },
        refresh: () => {
            const savedActions = _captureActions(screenEl);
            _render(screenEl, { bannedKey, settingsKey, showCountPicker, defaultCounts, defaultCount, title, preloadConfig, extendMode });
            _wireEvents(screenEl, { bannedKey, settingsKey, showCountPicker, defaultCounts, defaultCount, title, opts, preloadConfig });
            _restoreActions(screenEl, savedActions);
        },
    };
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function _render(el, { bannedKey, settingsKey, showCountPicker, defaultCounts, defaultCount, title, preloadConfig = null, extendMode = false }) {
    const srsWords = srsDb.getAllWords();
    const hasSrs   = Object.keys(srsWords).length > 0;
    const banned   = getBannedWords(bannedKey);

    // If a preloadConfig is provided, use it as the source of truth instead of
    // the localized settings key.
    const saved = preloadConfig
        ? {
            useSrs:        preloadConfig.useSrs,
            srsFilterMode: preloadConfig.srsFilterMode,
            srsMetric:     preloadConfig.srsMetric,
            statuses:      preloadConfig.statuses,
            selMode:       preloadConfig.selMode,
            count:         preloadConfig.count,
            decks:         Object.fromEntries(DECKS.map(d => [d.id, !!preloadConfig.decks?.[d.id]])),
            deckRanges:    Object.fromEntries(
                Object.entries(preloadConfig.decks || {}).map(([id, r]) => [id, r])
            ),
          }
        : _loadSettings(settingsKey);

    // Seed the settings store from preloadConfig so that range-input
    // event handlers (which call _saveDeckRange/_saveSettings) stay in sync.
    if (preloadConfig) {
        const seedDecks = Object.fromEntries(DECKS.map(d => [d.id, !!preloadConfig.decks?.[d.id]]));
        const seedRanges = {};
        Object.entries(preloadConfig.decks || {}).forEach(([id, r]) => { seedRanges[id] = r; });
        _saveSettings(settingsKey, {
            useSrs:        preloadConfig.useSrs,
            srsFilterMode: preloadConfig.srsFilterMode,
            srsMetric:     preloadConfig.srsMetric,
            statuses:      preloadConfig.statuses,
            selMode:       preloadConfig.selMode,
            count:         preloadConfig.count,
            decks:         seedDecks,
            deckRanges:    seedRanges,
        });
    }

    // Fresh install (nothing saved yet): default SRS=on, ALL statuses 0-5, metrics mode
    const useSrsChecked = saved.useSrs !== undefined ? saved.useSrs : true;
    const srsFilterMode = saved.srsFilterMode !== undefined ? saved.srsFilterMode : 'metrics';
    const srsMetric     = saved.srsMetric !== undefined ? saved.srsMetric : 'all';
    const savedStatuses = saved.statuses !== undefined ? saved.statuses : [0,1,2,3,4,5];
    const savedCount    = saved.count    !== undefined ? saved.count    : defaultCount;
    const savedMode     = saved.selMode  !== undefined ? saved.selMode  : 'sequential';

    // Deck enabled state — default to empty if not saved, don't force old fallbacks
    let savedDecks = saved.decks || {};
    DECKS.forEach(d => { if (savedDecks[d.id] === undefined) savedDecks[d.id] = false; });

    let html = `<div class="caro-setup-panel vs-root">`;
    html += `<div class="caro-setup-section-title" style="padding:14px 20px 4px;font-size:15px;font-weight:700;">${title}</div>`;

    // ── Extend-mode banner ────────────────────────────────────────────────────
    if (extendMode) {
        html += `
        <div style="margin:8px 16px 0;padding:10px 14px;background:#fff8e1;border:1px solid #ffe082;
                    border-radius:8px;font-size:12px;line-height:1.5;color:#7c6000;">
            <strong>📚 Changing your deck</strong><br>
            Words already learned keep their full SRS progress. Words removed from the deck go dormant
            (paused, not deleted) — switch back and they'll resume where they left off.
            New words are added as free slots up to the number of dormant words.
        </div>`;
    }

    // ── Word Sources ──────────────────────────────────────────────────────────
    html += `<div class="caro-setup-section">`;
    html += `<div class="caro-setup-section-title">Word Sources</div>`;

    // SRS toggle + status/metrics chips
    html += `
        <label class="settings-toggle" style="border-radius:8px 8px 0 0;">
            <input type="checkbox" class="vs-use-srs" ${useSrsChecked ? 'checked' : ''}>
            <span class="settings-toggle-track"></span>
            <span class="settings-toggle-text">
                My SRS Vocabulary <em>(${Object.keys(srsWords).length} words)</em>
            </span>
        </label>
        
        <div class="vs-srs-options" style="padding:10px 20px 12px;background:var(--surface-color);
             border:1px solid var(--border-color);border-top:none;${useSrsChecked ? '' : 'display:none;'}">
             
             <div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap;">
                 <label style="font-size:13px; font-weight:600; color:var(--text-main); cursor:pointer; display:flex; align-items:center; gap:6px;">
                     <input type="radio" name="vs-srs-mode" value="metrics" ${srsFilterMode==='metrics'?'checked':''} style="accent-color:var(--primary-color);"> 
                     SRS Metrics
                 </label>
                 <label style="font-size:13px; font-weight:600; color:var(--text-main); cursor:pointer; display:flex; align-items:center; gap:6px;">
                     <input type="radio" name="vs-srs-mode" value="lingq" ${srsFilterMode==='lingq'?'checked':''} style="accent-color:var(--primary-color);"> 
                     LingQ Levels
                 </label>
             </div>

             <div class="vs-srs-filter-metrics" style="${srsFilterMode==='metrics' ? '' : 'display:none;'}">
                 <select class="vs-srs-metric-select" style="width:100%; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-main); font-size:13px; outline:none; cursor:pointer;">
                     <option value="all" ${srsMetric==='all'?'selected':''}>All SRS Words</option>
                     <option value="due" ${srsMetric==='due'?'selected':''}>Due / Overdue First</option>
                     <option value="short_int" ${srsMetric==='short_int'?'selected':''}>Shortest Interval First (Struggling)</option>
                     <option value="long_int" ${srsMetric==='long_int'?'selected':''}>Longest Interval First (Mature)</option>
                 </select>
             </div>

             <div class="vs-srs-filter-lingq" style="${srsFilterMode==='lingq' ? '' : 'display:none;'}">
                 <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">Include statuses:</div>
                 <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    ${[0,1,2,3,4,5].map(s => `
                        <label class="caro-status-chip" style="opacity:${savedStatuses.includes(s)?'1':'0.35'}">
                            <input type="checkbox" class="vs-status-check" value="${s}" ${savedStatuses.includes(s)?'checked':''}>
                            <span class="status-btn" data-status="${s}"
                                  style="display:inline-flex;align-items:center;justify-content:center;
                                         width:32px;height:32px;border-radius:50%;cursor:pointer;
                                         font-size:14px;font-weight:bold;border:2px solid transparent;">${s}</span>
                        </label>`).join('')}
                 </div>
             </div>
        </div>`;

    // One toggle + range panel per deck, grouped under Interest / Goal sub-headers
    const CATEGORY_META = [
        { key: 'interest', label: '✨ Interest' },
        { key: 'goal',     label: '🎯 Goal'     },
    ];

    CATEGORY_META.forEach(cat => {
        const catDecks = DECKS.filter(d => d.category === cat.key);
        if (!catDecks.length) return;

        // Category sub-header
        html += `
        <div style="
            padding:5px 20px 4px;
            font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
            color:var(--text-muted);background:var(--bg-color);
            border:1px solid var(--border-color);border-top:none;
        ">${cat.label}</div>`;

        catDecks.forEach((deck, i) => {
            const checked  = !!savedDecks[deck.id];
            const range    = _getDeckRange(saved, deck.id);
            const lo = range.lo, hi = range.hi;
            const n        = lo <= hi ? hi - lo + 1 : 0;
            const countTxt = lo <= hi ? `(${n} word${n!==1?'s':''})` : '⚠ lower > upper';
            const listSize = deck._cache ? deck._cache.length : '…';
            const isLastOfAll = (cat.key === 'goal') && (i === catDecks.length - 1);

            const infoBtn = deck.description ? `
                <span class="vs-deck-info" data-deck-id="${deck.id}"
                      title="${deck.description.replace(/"/g, '&quot;')}"
                      style="display:inline-flex;align-items:center;justify-content:center;
                             width:17px;height:17px;border-radius:50%;
                             border:1.5px solid var(--text-muted);
                             color:var(--text-muted);font-size:10px;font-weight:700;
                             cursor:pointer;flex-shrink:0;line-height:1;
                             margin-left:5px;position:relative;z-index:2;
                             font-style:normal;">i</span>` : '';

            html += `
        <label class="settings-toggle vs-deck-toggle" data-deck-id="${deck.id}"
               style="border-top:1px solid var(--border-color);border-radius:0;">
            <input type="checkbox" class="vs-use-deck" data-deck-id="${deck.id}" ${checked?'checked':''}>
            <span class="settings-toggle-track"></span>
            <span class="settings-toggle-text" style="display:flex;align-items:center;flex:1;min-width:0;">
                <span style="flex:1;min-width:0;">${deck.label} <em class="vs-deck-count-${deck.id}">(${listSize} words)</em></span>${infoBtn}
            </span>
        </label>

        <div class="vs-deck-range" data-for-deck="${deck.id}" style="
            padding:8px 20px 12px;
            background:var(--surface-color);
            border:1px solid var(--border-color);
            border-top:none;
            ${isLastOfAll ? 'border-radius:0 0 8px 8px;' : ''}
            ${checked ? '' : 'display:none;'}
        ">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:12px;color:var(--text-muted);font-weight:600;">Rank</span>
                <input type="number" class="vs-range-low" data-deck-id="${deck.id}"
                       min="1" max="1000" value="${lo}"
                       style="width:65px;padding:4px 6px;border:1px solid var(--border-color);
                              border-radius:6px;background:var(--bg-color);color:var(--text-color);
                              font-size:13px;text-align:center;">
                <span style="font-size:12px;color:var(--text-muted);">–</span>
                <input type="number" class="vs-range-high" data-deck-id="${deck.id}"
                       min="1" max="1000" value="${hi}"
                       style="width:65px;padding:4px 6px;border:1px solid var(--border-color);
                              border-radius:6px;background:var(--bg-color);color:var(--text-color);
                              font-size:13px;text-align:center;">
                <span class="vs-range-count" data-deck-id="${deck.id}"
                      style="font-size:12px;color:${lo<=hi?'var(--text-muted)':'#c0392b'};">
                    ${countTxt}
                </span>
            </div>
        </div>`;
        }); // end catDecks.forEach
    }); // end CATEGORY_META.forEach

    html += `</div>`; // .caro-setup-section (Word Sources)

    // ── Selection Mode ────────────────────────────────────────────────────────
    html += `
    <div class="caro-setup-section">
        <div class="caro-setup-section-title">Selection Mode</div>
        <div style="background:var(--surface-color);border:1px solid var(--border-color);
                    border-radius:8px;padding:12px 20px;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                <label class="vs-mode-label" style="
                    display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;
                    cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;
                    border:2px solid ${savedMode==='random'?'var(--primary-color)':'var(--border-color)'};
                    background:${savedMode==='random'?'var(--primary-color)':'var(--surface-color)'};
                    color:${savedMode==='random'?'#fff':'var(--text-main)'};">
                    <input type="radio" name="vs-sel-mode" value="random" ${savedMode==='random'?'checked':''} style="display:none;">
                    🎲 Random
                </label>
                <label class="vs-mode-label" style="
                    display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;
                    cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;
                    border:2px solid ${savedMode==='sequential'?'var(--primary-color)':'var(--border-color)'};
                    background:${savedMode==='sequential'?'var(--primary-color)':'var(--surface-color)'};
                    color:${savedMode==='sequential'?'#fff':'var(--text-main)'};">
                    <input type="radio" name="vs-sel-mode" value="sequential" ${savedMode==='sequential'?'checked':''} style="display:none;">
                    📋 Sequential
                </label>
                <label class="vs-mode-label" style="
                    display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;
                    cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;
                    border:2px solid ${savedMode==='reverse'?'var(--primary-color)':'var(--border-color)'};
                    background:${savedMode==='reverse'?'var(--primary-color)':'var(--surface-color)'};
                    color:${savedMode==='reverse'?'#fff':'var(--text-main)'};">
                    <input type="radio" name="vs-sel-mode" value="reverse" ${savedMode==='reverse'?'checked':''} style="display:none;">
                    🔃 Reverse
                </label>
            </div>
            <p style="font-size:11px;color:var(--text-muted);margin:0;line-height:1.4;">
                <strong>Random</strong> – different words each session from each deck's range.<br>
                <strong>Sequential</strong> – always the first N words of each range (rank order).<br>
                <strong>Reverse</strong> – like Sequential but highest rank first (e.g. 800 → 799 → 798…).
            </p>
        </div>
    </div>`;

    // ── Session Size ──────────────────────────────────────────────────────────
    if (showCountPicker) {
        html += `
        <div class="caro-setup-section">
            <div class="caro-setup-section-title">Session Size</div>
            <div style="background:var(--surface-color);border:1px solid var(--border-color);
                        border-radius:8px;padding:14px 20px;">
                <div class="vs-count-group" style="display:flex;gap:8px;flex-wrap:wrap;">
                    ${defaultCounts.map(n => `
                        <button class="caro-count-btn ${n === savedCount ? 'active' : ''}" data-count="${n}">
                            ${n}
                        </button>`).join('')}
                </div>
            </div>
        </div>`;
    }

    // ── Banned words ──────────────────────────────────────────────────────────
    if (banned.length > 0) {
        html += `
        <div class="vs-ban-notice" style="text-align:center;margin-top:4px;">
            <span style="font-size:13px;color:var(--text-muted);">Banned Words: ${banned.length}</span>
            <button class="vs-btn-clear-bans"
                    style="background:none;border:none;color:var(--primary-color);
                           font-size:13px;cursor:pointer;text-decoration:underline;margin-left:6px;">
                Clear list
            </button>
        </div>`;
    }

    html += `
        <div class="vs-warning" style="display:none;padding:10px 14px;background:#fff3cd;
             border:1px solid #ffc107;border-radius:8px;font-size:13px;color:#856404;margin-top:8px;margin-bottom:4px;"></div>
        <div class="vs-actions" style="
            position:sticky; bottom:0;
            background:var(--bg-color,#fff);
            padding:10px 16px 16px;
            border-top:1px solid var(--border-color,#eee);
            display:none; flex-direction:column; gap:6px;
            z-index:10;
        "></div>
    </div>`; // .vs-root

    el.innerHTML = html;

    // Populate dynamic word-count labels once deck imports resolve
    DECKS.forEach(deck => {
        if (!deck._cache) {
            _getDeckList(deck).then(list => {
                const lbl = el.querySelector(`.vs-deck-count-${deck.id}`);
                if (lbl) lbl.textContent = `(${list.length} words)`;
            });
        }
    });
}

// ─── WIRE EVENTS ─────────────────────────────────────────────────────────────

function _wireEvents(el, { bannedKey, settingsKey, showCountPicker, defaultCounts, defaultCount, title, opts, preloadConfig = null }) {
    const root = el.querySelector('.vs-root');

    // SRS toggle
    const srsToggle = root.querySelector('.vs-use-srs');
    const srsOptions = root.querySelector('.vs-srs-options');
    srsToggle?.addEventListener('change', () => {
        if (srsOptions) srsOptions.style.display = srsToggle.checked ? 'block' : 'none';
        _saveSettings(settingsKey, { useSrs: srsToggle.checked });
    });

    // SRS Mode radio buttons (Metrics vs LingQ)
    root.querySelectorAll('input[name="vs-srs-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            _saveSettings(settingsKey, { srsFilterMode: radio.value });
            const metricsEl = root.querySelector('.vs-srs-filter-metrics');
            const lingqEl   = root.querySelector('.vs-srs-filter-lingq');
            if (metricsEl) metricsEl.style.display = radio.value === 'metrics' ? 'block' : 'none';
            if (lingqEl)   lingqEl.style.display   = radio.value === 'lingq' ? 'block' : 'none';
        });
    });

    // SRS Metric dropdown
    const metricSelect = root.querySelector('.vs-srs-metric-select');
    if (metricSelect) {
        metricSelect.addEventListener('change', () => {
            _saveSettings(settingsKey, { srsMetric: metricSelect.value });
        });
    }

    // Status chips
    root.querySelectorAll('.vs-status-check').forEach(cb => {
        _chipOpacity(cb);
        cb.addEventListener('change', () => {
            _chipOpacity(cb);
            const checked = [...root.querySelectorAll('.vs-status-check:checked')].map(c => +c.value);
            _saveSettings(settingsKey, { statuses: checked });
        });
    });

    // Info buttons — show deck description in a styled popover
    root.querySelectorAll('.vs-deck-info').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();

            // Remove any existing popover
            document.querySelectorAll('.vs-info-popover').forEach(p => p.remove());

            const description = btn.getAttribute('title');
            if (!description) return;

            const popover = document.createElement('div');
            popover.className = 'vs-info-popover';
            popover.style.cssText = `
                position:fixed;z-index:9999;
                max-width:280px;padding:10px 13px;
                background:var(--surface-color, #fff);
                border:1px solid var(--border-color, #ddd);
                border-radius:10px;
                box-shadow:0 4px 18px rgba(0,0,0,.18);
                font-size:12.5px;line-height:1.5;
                color:var(--text-main, #333);
                pointer-events:none;
            `;
            popover.textContent = description;
            document.body.appendChild(popover);

            // Position near the button
            const rect = btn.getBoundingClientRect();
            const pw = popover.offsetWidth || 280;
            const ph = popover.offsetHeight || 80;
            let left = rect.left + rect.width / 2 - pw / 2;
            let top  = rect.top - ph - 8;
            if (left < 8) left = 8;
            if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
            if (top < 8) top = rect.bottom + 8;
            popover.style.left = left + 'px';
            popover.style.top  = top  + 'px';

            // Close on next click anywhere
            const close = () => { popover.remove(); document.removeEventListener('click', close); };
            setTimeout(() => document.addEventListener('click', close), 10);
        });
    });

    // Deck toggles — show/hide that deck's own range panel
    root.querySelectorAll('.vs-use-deck').forEach(cb => {
        cb.addEventListener('change', () => {
            const deckId     = cb.dataset.deckId;
            const rangePanel = root.querySelector(`.vs-deck-range[data-for-deck="${deckId}"]`);
            if (rangePanel) rangePanel.style.display = cb.checked ? 'block' : 'none';

            const decks = {};
            root.querySelectorAll('.vs-use-deck').forEach(c => { decks[c.dataset.deckId] = c.checked; });
            _saveSettings(settingsKey, { decks, useList: Object.values(decks).some(Boolean) });
        });
    });

    // Per-deck range inputs — each pair knows its own deckId
    root.querySelectorAll('.vs-range-low, .vs-range-high').forEach(input => {
        const deckId = input.dataset.deckId;
        input.addEventListener('input', () => {
            const panel   = root.querySelector(`.vs-deck-range[data-for-deck="${deckId}"]`);
            const loInput = panel?.querySelector('.vs-range-low');
            const hiInput = panel?.querySelector('.vs-range-high');
            const label   = panel?.querySelector('.vs-range-count');
            if (!loInput || !hiInput || !label) return;

            const lo = Math.max(1, Math.min(+loInput.value || 1,    1000));
            const hi = Math.max(1, Math.min(+hiInput.value || 1000, 1000));
            const n  = lo <= hi ? hi - lo + 1 : 0;
            label.textContent = lo <= hi ? `(${n} word${n!==1?'s':''})` : '⚠ lower > upper';
            label.style.color = lo <= hi ? 'var(--text-muted)' : '#c0392b';
            _saveDeckRange(settingsKey, deckId, lo, hi);
        });
    });

    // Selection mode pills
    root.querySelectorAll('input[name="vs-sel-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            _saveSettings(settingsKey, { selMode: radio.value });
            root.querySelectorAll('.vs-mode-label').forEach(lbl => {
                const r  = lbl.querySelector('input[name="vs-sel-mode"]');
                const on = r?.checked;
                lbl.style.border     = `2px solid ${on ? 'var(--primary-color)' : 'var(--border-color)'}`;
                lbl.style.background = on ? 'var(--primary-color)' : 'var(--surface-color)';
                lbl.style.color      = on ? '#fff' : 'var(--text-main)';
            });
        });
    });

    // Count picker
    root.querySelector('.vs-count-group')?.addEventListener('click', e => {
        const b = e.target.closest('.caro-count-btn');
        if (!b) return;
        root.querySelectorAll('.caro-count-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const raw = b.getAttribute('data-count');
        _saveSettings(settingsKey, { count: raw === 'All' ? 'All' : +raw });
    });

    // Clear bans
    root.querySelector('.vs-btn-clear-bans')?.addEventListener('click', () => {
        if (!confirm('Clear all banned words?')) return;
        setBannedWords(bannedKey, []);
        const savedActions = _captureActions(el);
        _render(el, { bannedKey, settingsKey, showCountPicker, defaultCounts, defaultCount, title });
        _wireEvents(el, { bannedKey, settingsKey, showCountPicker, defaultCounts, defaultCount, title, opts });
        _restoreActions(el, savedActions);
    });
}

// ─── QUEUE BUILDER ───────────────────────────────────────────────────────────

async function _buildQueueAsync(el, { bannedKey }) {
    const root   = el.querySelector('.vs-root');
    const warnEl = root?.querySelector('.vs-warning');

    const warn      = msg => { if (warnEl) { warnEl.textContent = msg; warnEl.style.display = 'block'; } return []; };
    const clearWarn = ()  => { if (warnEl) warnEl.style.display = 'none'; };

    const useSrs        = root?.querySelector('.vs-use-srs')?.checked ?? false;
    const srsFilterMode = root?.querySelector('input[name="vs-srs-mode"]:checked')?.value ?? 'metrics';
    const srsMetric     = root?.querySelector('.vs-srs-metric-select')?.value ?? 'all';

    const activeDeckIds = [...(root?.querySelectorAll('.vs-use-deck:checked') || [])]
        .map(cb => cb.dataset.deckId);
    const useDecks = activeDeckIds.length > 0;

    if (!useSrs && !useDecks) return warn('Select at least one word source.');

    const statuses = useSrs && srsFilterMode === 'lingq'
        ? [...(root?.querySelectorAll('.vs-status-check:checked') || [])].map(c => +c.value)
        : [];

    if (useSrs && srsFilterMode === 'lingq' && statuses.length === 0) return warn('Select at least one LingQ status to include.');

    clearWarn();

    const banned = new Set(getBannedWords(bannedKey));
    // Use deckId::word as map key so the same word from different decks is kept separately
    const map    = new Map();
    const now    = Date.now();

    if (useDecks) {
        const modeRadio = root?.querySelector('input[name="vs-sel-mode"]:checked');
        const mode = modeRadio?.value ?? 'random';

        const deckData = await Promise.all(
            activeDeckIds.map(id => {
                const deck = DECKS.find(d => d.id === id);
                return deck ? _getDeckList(deck) : Promise.resolve([]);
            })
        );

        // Collect per-deck pools first (each with its own range)
        const allEntries = [];

        deckData.forEach((list, i) => {
            const deckId  = activeDeckIds[i];
            const panel   = root?.querySelector(`.vs-deck-range[data-for-deck="${deckId}"]`);
            const loInput = panel?.querySelector('.vs-range-low');
            const hiInput = panel?.querySelector('.vs-range-high');
            const lo = loInput ? Math.max(1,    Math.min(+loInput.value || 1,    1000)) : 1;
            const hi = hiInput ? Math.max(1,    Math.min(+hiInput.value || 1000, 1000)) : 1000;

            const pool = (lo <= hi) ? list.slice(lo - 1, hi) : list;
            pool.forEach((w, idx) => {
                if (!banned.has(w.word)) {
                    allEntries.push({
                        word:  w.word,
                        furi:  w.furi,
                        trans: w.trans,
                        status: null,
                        deckId,
                        _rank: lo + idx,
                    });
                }
            });
        });

        // Apply selection mode across the combined pool
        if (mode === 'sequential') {
            allEntries.sort((a, b) => a._rank - b._rank || a.deckId.localeCompare(b.deckId));
        } else if (mode === 'reverse') {
            allEntries.sort((a, b) => b._rank - a._rank || a.deckId.localeCompare(b.deckId));
        } else {
            allEntries.sort(() => Math.random() - 0.5);
        }

        allEntries.forEach(w => map.set(`${w.deckId}::${w.word}`, w));
    }

    if (useSrs) {
        let srsWords = Object.values(srsDb.getAllWords()).filter(w => !banned.has(w.word));

        if (srsFilterMode === 'lingq') {
            srsWords = srsWords.filter(w => statuses.includes(w.status));
        } else {
            if (srsMetric === 'due') {
                srsWords = srsWords.filter(w => !w.dueDate || new Date(w.dueDate).getTime() <= now);
                srsWords.sort((a,b) => (a.dueDate ? new Date(a.dueDate).getTime() : 0) - (b.dueDate ? new Date(b.dueDate).getTime() : 0));
            } else if (srsMetric === 'short_int') {
                srsWords = srsWords.filter(w => w.interval !== undefined);
                srsWords.sort((a,b) => a.interval - b.interval);
            } else if (srsMetric === 'long_int') {
                srsWords = srsWords.filter(w => w.interval !== undefined);
                srsWords.sort((a,b) => b.interval - a.interval);
            }
        }

        // Add to map, preserving the sort order via _rank if sequential mode was picked 
        // (though custom decks dictate the core loop, we append SRS sequentially)
        srsWords.forEach((w, idx) => {
            map.set(`srs::${w.word}`, {
                word:   w.word,
                furi:   w.furi,
                trans:  w.translation,
                status: w.status,
                deckId: 'srs',
                _rank:  idx
            });
        });
    }

    let words = [...map.values()];

    if (words.length === 0)
        return warn('No words matched your settings (or all words in this source are banned).');

    // Apply session size limit
    const activeBtn = root?.querySelector('.caro-count-btn.active');
    if (activeBtn) {
        const raw   = activeBtn.getAttribute('data-count');
        const limit = raw === 'All' ? Infinity : +raw;
        if (isFinite(limit)) words = words.slice(0, limit);
    }

    return words;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _chipOpacity(cb) {
    const chip = cb.closest('.caro-status-chip');
    if (chip) chip.style.opacity = cb.checked ? '1' : '0.35';
}

function _captureActions(el) {
    const actionsEl = el.querySelector('.vs-actions');
    return actionsEl ? [...actionsEl.childNodes] : [];
}

function _restoreActions(el, nodes) {
    const actionsEl = el.querySelector('.vs-actions');
    if (!actionsEl || !nodes.length) return;
    actionsEl.style.display = 'flex';
    nodes.forEach(n => actionsEl.appendChild(n));
}