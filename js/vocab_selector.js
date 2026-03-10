/**
 * vocab_selector.js
 *
 * A fully self-contained vocabulary-selector setup screen for mini-games.
 * Games mount it into their own screen element; it renders the complete UI
 * including word sources (multiple decks), SRS status filters, session-size
 * picker, selection mode (random vs sequential), banned-word management,
 * a warning area, and an actions row for game-specific buttons.
 *
 * Ban-list storage is owned here.  Each game passes its own bannedKey so ban
 * lists are independent per game.
 *
 * ── Public API ───────────────────────────────────────────────────────────────
 *
 *   mountVocabSelector(screenEl, options)
 *     Renders the complete setup screen into screenEl (innerHTML replaced).
 *     Returns a controller object { getQueue, getActionsEl, refresh }.
 *
 *     options (all optional):
 *       bannedKey       {string}   localStorage key for the ban list.
 *                                  Default: 'vocab_selector_banned'.
 *       showCountPicker {boolean}  Show the "Session Size" row. Default: true.
 *       defaultCounts   {Array}    Button values. Default: [10, 20, 50, 100, 200, 500, 1000, 'All'].
 *       defaultCount    {number|'All'}  Pre-selected count. Default: 'All'.
 *       title           {string}   Section heading. Default: 'Setup'.
 *
 *   controller.getQueue()
 *     Read the current selector state and return a (shuffled or sequential),
 *     ban-filtered, count-limited word array.
 *     Returns [] on validation failure and renders a warning inside the screen.
 *     Each entry: { word, furi, trans, status, deckId }
 *
 *   controller.getActionsEl()
 *     Returns the <div class="vs-actions"> element for game buttons.
 *
 *   controller.refresh()
 *     Re-render the screen in place (e.g. after clearing bans mid-session).
 *
 *   getBannedWords(bannedKey)
 *   setBannedWords(bannedKey, list)
 *     Direct access to the ban list.
 *
 * ── Selection Modes ──────────────────────────────────────────────────────────
 *
 *   Random    – the pool is shuffled before the count limit is applied.
 *               Selecting rank 800–1000 with count 100 gives a random 100
 *               words from that band each time.
 *
 *   Sequential – words are taken in rank order (most-common first within the
 *               selected range, i.e. rank 800 … 899 for count 100).
 *               The same 100 words are returned every time.
 */

// ─── DECK REGISTRY ───────────────────────────────────────────────────────────
// Each entry describes one optional deck.  `loader` is a dynamic import that
// resolves to a module with a named export matching `exportName`.
// The `default` deck is always present (imported statically below).

import * as srsDb from './srs_db.js';

const DECKS = [
    {
        id:         'frequency',
        label:      'Top 1000 Frequency',
        file:       '../data/word_list_1000_frequency.js',
        exportName: 'wordList',
        _cache:     null,
        _promise:   null,
    },
    {
        id:         'anime',
        label:      'Top 1000 Anime',
        file:       '../data/word_list_1000_anime.js',
        exportName: 'wordList',
        _cache:     null,
        _promise:   null,
    },
    {
        id:         'romance',
        label:      'Top 1000 Romance',
        file:       '../data/word_list_1000_romance.js',
        exportName: 'wordList',
        _cache:     null,
        _promise:   null,
    },
    {
        id:         'gamer',
        label:      'Top 1000 Gamer',
        file:       '../data/word_list_1000_gamer.js',
        exportName: 'wordList',
        _cache:     null,
        _promise:   null,
    },
    {
        id:         'tourist',
        label:      'Top 1000 Tourist',
        file:       '../data/word_list_1000_tourist.js',
        exportName: 'wordList',
        _cache:     null,
        _promise:   null,
    },
];

function _getDeckList(deck) {
    if (deck._cache) return Promise.resolve(deck._cache);
    if (!deck._promise) {
        deck._promise = import(deck.file)
            .then(mod => {
                deck._cache = mod[deck.exportName] || mod.wordList || mod.default || [];
                return deck._cache;
            })
            .catch(() => {
                deck._cache = [];
                return [];
            });
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

const SETTINGS_KEY = 'vocab_selector_settings';

function _loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
    catch { return {}; }
}

function _saveSettings(patch) {
    const current = _loadSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...patch }));
}

// ─── MOUNT ───────────────────────────────────────────────────────────────────

export function mountVocabSelector(screenEl, opts = {}) {
    const {
        bannedKey       = 'vocab_selector_banned',
        showCountPicker = true,
        defaultCounts   = [10, 20, 50, 100, 200, 500, 1000, 'All'],
        defaultCount    = 'All',
        title           = 'Setup',
    } = opts;

    _render(screenEl, { bannedKey, showCountPicker, defaultCounts, defaultCount, title });
    _wireEvents(screenEl, { bannedKey, showCountPicker, defaultCounts, defaultCount, title, opts });

    return {
        getQueue:     () => _buildQueue(screenEl, { bannedKey }),
        getActionsEl: () => screenEl.querySelector('.vs-actions'),
        refresh: () => {
            const savedActions = _captureActions(screenEl);
            _render(screenEl, { bannedKey, showCountPicker, defaultCounts, defaultCount, title });
            _wireEvents(screenEl, { bannedKey, showCountPicker, defaultCounts, defaultCount, title, opts });
            _restoreActions(screenEl, savedActions);
        },
    };
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function _render(el, { bannedKey, showCountPicker, defaultCounts, defaultCount, title }) {
    const srsWords = srsDb.getAllWords();
    const hasSrs   = Object.keys(srsWords).length > 0;
    const banned   = getBannedWords(bannedKey);
    const saved    = _loadSettings();

    // Resolve persisted values
    const useSrsChecked   = saved.useSrs    !== undefined ? saved.useSrs    : hasSrs;
    const savedStatuses   = saved.statuses  !== undefined ? saved.statuses  : [0,1,2,3];
    const savedRangeLow   = saved.rangeLow  !== undefined ? saved.rangeLow  : 901;
    const savedRangeHigh  = saved.rangeHigh !== undefined ? saved.rangeHigh : 1000;
    const savedCount      = saved.count     !== undefined ? saved.count     : defaultCount;
    const savedMode       = saved.selMode   !== undefined ? saved.selMode   : 'random';

    // Which decks are checked? Default: frequency deck on (backwards compat), others off
    const savedDecks = saved.decks !== undefined
        ? saved.decks
        : { frequency: true, anime: false, romance: false };

    // Also keep the old "useList" key as a fallback so existing saves still work
    if (saved.useList !== undefined && saved.decks === undefined) {
        savedDecks.frequency = saved.useList;
    }

    let html = `<div class="caro-setup-panel vs-root">`;

    // ── Section title ─────────────────────────────────────────────────────────
    html += `<div class="caro-setup-section-title" style="padding:14px 20px 4px;font-size:15px;font-weight:700;">${title}</div>`;

    // ── Word Sources ──────────────────────────────────────────────────────────
    html += `
        <div class="caro-setup-section">
            <div class="caro-setup-section-title">Word Sources</div>

            <!-- SRS toggle -->
            <label class="settings-toggle" style="border-radius:8px 8px 0 0;">
                <input type="checkbox" class="vs-use-srs" ${useSrsChecked ? 'checked' : ''}>
                <span class="settings-toggle-track"></span>
                <span class="settings-toggle-text">
                    My SRS Vocabulary
                    <em>(${Object.keys(srsWords).length} words)</em>
                </span>
            </label>

            <div class="vs-srs-filter" style="
                padding:10px 20px 12px;
                background:var(--surface-color);
                border:1px solid var(--border-color);
                border-top:none;
                ${useSrsChecked ? '' : 'display:none;'}
            ">
                <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">
                    Include statuses:
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    ${[0,1,2,3,4,5].map(s => `
                        <label class="caro-status-chip" style="opacity:${savedStatuses.includes(s)?'1':'0.35'}">
                            <input type="checkbox"
                                   class="vs-status-check"
                                   value="${s}"
                                   ${savedStatuses.includes(s) ? 'checked' : ''}>
                            <span class="status-btn" data-status="${s}"
                                  style="display:inline-flex;align-items:center;justify-content:center;
                                         width:32px;height:32px;border-radius:50%;cursor:pointer;
                                         font-size:14px;font-weight:bold;border:2px solid transparent;">
                                ${s}
                            </span>
                        </label>`).join('')}
                </div>
            </div>

            <!-- Deck list (one toggle per deck) -->
            <div class="vs-decks-wrapper">`;

    DECKS.forEach((deck, i) => {
        const isLast   = i === DECKS.length - 1;
        const checked  = savedDecks[deck.id] ? 'checked' : '';
        const radius   = isLast ? '0 0 0 0' : '0';
        const listSize = deck._cache ? deck._cache.length : '…';

        html += `
                <label class="settings-toggle vs-deck-toggle"
                       data-deck-id="${deck.id}"
                       style="border-top:1px solid var(--border-color);border-radius:${radius};">
                    <input type="checkbox" class="vs-use-deck" data-deck-id="${deck.id}" ${checked}>
                    <span class="settings-toggle-track"></span>
                    <span class="settings-toggle-text">
                        ${deck.label}
                        <em class="vs-deck-count-${deck.id}">(${listSize} words)</em>
                    </span>
                </label>`;
    });

    // Range sub-panel: shared across all decks, shown when ≥1 deck is enabled
    const anyDeckOn = DECKS.some(d => savedDecks[d.id]);
    html += `
            </div><!-- /vs-decks-wrapper -->

            <div class="vs-list-range" style="
                padding:10px 20px 14px;
                background:var(--surface-color);
                border:1px solid var(--border-color);
                border-top:none;
                border-radius:0 0 8px 8px;
                ${anyDeckOn ? '' : 'display:none;'}
            ">
                <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:10px;">
                    Rank range <span style="font-weight:400;">(1 = most common):</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
                    <label style="font-size:13px;color:var(--text-muted);">From</label>
                    <input type="number" class="vs-range-low"
                           min="1" max="1000" value="${savedRangeLow}"
                           style="width:70px;padding:5px 8px;border:1px solid var(--border-color);
                                  border-radius:6px;background:var(--bg-color);
                                  color:var(--text-color);font-size:14px;text-align:center;">
                    <label style="font-size:13px;color:var(--text-muted);">to</label>
                    <input type="number" class="vs-range-high"
                           min="1" max="1000" value="${savedRangeHigh}"
                           style="width:70px;padding:5px 8px;border:1px solid var(--border-color);
                                  border-radius:6px;background:var(--bg-color);
                                  color:var(--text-color);font-size:14px;text-align:center;">
                    <span class="vs-range-count" style="font-size:13px;color:var(--text-muted);"></span>
                </div>

                <!-- Selection Mode -->
                <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">
                    Selection mode:
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <label class="vs-mode-label" style="
                        display:flex;align-items:center;gap:6px;
                        padding:6px 12px;border-radius:8px;cursor:pointer;
                        border:2px solid ${savedMode==='random'?'var(--primary-color)':'var(--border-color)'};
                        background:${savedMode==='random'?'var(--primary-color)':'var(--surface-color)'};
                        color:${savedMode==='random'?'#fff':'var(--text-main)'};
                        font-size:13px;font-weight:500;transition:all .15s;">
                        <input type="radio" name="vs-sel-mode" value="random"
                               ${savedMode==='random'?'checked':''}
                               style="display:none;">
                        🎲 Random
                    </label>
                    <label class="vs-mode-label" style="
                        display:flex;align-items:center;gap:6px;
                        padding:6px 12px;border-radius:8px;cursor:pointer;
                        border:2px solid ${savedMode==='sequential'?'var(--primary-color)':'var(--border-color)'};
                        background:${savedMode==='sequential'?'var(--primary-color)':'var(--surface-color)'};
                        color:${savedMode==='sequential'?'#fff':'var(--text-main)'};
                        font-size:13px;font-weight:500;transition:all .15s;">
                        <input type="radio" name="vs-sel-mode" value="sequential"
                               ${savedMode==='sequential'?'checked':''}
                               style="display:none;">
                        📋 Sequential
                    </label>
                </div>
                <p style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.4;">
                    <strong>Random</strong> – different words each session from the range.<br>
                    <strong>Sequential</strong> – always the first N words of the range (rank order).
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
                        <button class="caro-count-btn ${n === savedCount ? 'active' : ''}"
                                data-count="${n}">
                            ${n}
                        </button>`).join('')}
                </div>
            </div>
        </div>`;
    }

    // ── Banned words notice ───────────────────────────────────────────────────
    if (banned.length > 0) {
        html += `
        <div class="vs-ban-notice" style="text-align:center;margin-top:4px;">
            <span style="font-size:13px;color:var(--text-muted);">
                Banned Words: ${banned.length}
            </span>
            <button class="vs-btn-clear-bans"
                    style="background:none;border:none;color:var(--primary-color);
                           font-size:13px;cursor:pointer;text-decoration:underline;
                           margin-left:6px;">
                Clear list
            </button>
        </div>`;
    }

    // ── Warning + actions slot ────────────────────────────────────────────────
    html += `
        <div class="vs-warning"
             style="display:none;padding:10px 14px;background:#fff3cd;
                    border:1px solid #ffc107;border-radius:8px;
                    font-size:13px;color:#856404;margin-top:8px;">
        </div>
        <div class="vs-actions"></div>
    </div>`; // .vs-root

    el.innerHTML = html;

    // After render: update deck word-count labels once dynamic imports resolve
    DECKS.forEach(deck => {
        if (!deck._cache) {
            _getDeckList(deck).then(list => {
                const label = el.querySelector(`.vs-deck-count-${deck.id}`);
                if (label) label.textContent = `(${list.length} words)`;
            });
        }
    });
}

// ─── WIRE EVENTS ─────────────────────────────────────────────────────────────

function _wireEvents(el, { bannedKey, showCountPicker, defaultCounts, defaultCount, title, opts }) {
    const root = el.querySelector('.vs-root');

    // SRS toggle → show/hide status filter + save
    const srsToggle = root.querySelector('.vs-use-srs');
    const srsFilter = root.querySelector('.vs-srs-filter');
    srsToggle?.addEventListener('change', () => {
        if (srsFilter) srsFilter.style.display = srsToggle.checked ? 'block' : 'none';
        _saveSettings({ useSrs: srsToggle.checked });
    });

    // Status chips
    root.querySelectorAll('.vs-status-check').forEach(cb => {
        _chipOpacity(cb);
        cb.addEventListener('change', () => {
            _chipOpacity(cb);
            const checked = [...root.querySelectorAll('.vs-status-check:checked')].map(c => +c.value);
            _saveSettings({ statuses: checked });
        });
    });

    // Deck toggles → show/hide range panel + save
    const listRange     = root.querySelector('.vs-list-range');
    const _syncRangeVisibility = () => {
        const anyOn = [...root.querySelectorAll('.vs-use-deck')].some(cb => cb.checked);
        if (listRange) listRange.style.display = anyOn ? 'block' : 'none';
    };
    root.querySelectorAll('.vs-use-deck').forEach(cb => {
        cb.addEventListener('change', () => {
            _syncRangeVisibility();
            const decks = {};
            root.querySelectorAll('.vs-use-deck').forEach(c => { decks[c.dataset.deckId] = c.checked; });
            _saveSettings({ decks, useList: Object.values(decks).some(Boolean) });
        });
    });
    _syncRangeVisibility();

    // Range inputs → live word-count label + save
    const lowInput   = root.querySelector('.vs-range-low');
    const highInput  = root.querySelector('.vs-range-high');
    const countLabel = root.querySelector('.vs-range-count');
    const _syncRangeCount = () => {
        if (!lowInput || !highInput || !countLabel) return;
        const lo = Math.max(1, Math.min(+lowInput.value  || 1,    1000));
        const hi = Math.max(1, Math.min(+highInput.value || 1000, 1000));
        const n  = lo <= hi ? hi - lo + 1 : 0;
        countLabel.textContent = lo <= hi ? `(${n} word${n !== 1 ? 's' : ''})` : '⚠ lower > upper';
        countLabel.style.color = lo <= hi ? 'var(--text-muted)' : '#c0392b';
    };
    lowInput?.addEventListener('input',  () => { _syncRangeCount(); _saveSettings({ rangeLow:  +lowInput.value  }); });
    highInput?.addEventListener('input', () => { _syncRangeCount(); _saveSettings({ rangeHigh: +highInput.value }); });
    _syncRangeCount();

    // Selection mode radio buttons (styled as toggle pills)
    root.querySelectorAll('input[name="vs-sel-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            _saveSettings({ selMode: radio.value });
            // Update pill styles
            root.querySelectorAll('.vs-mode-label').forEach(lbl => {
                const r = lbl.querySelector('input[name="vs-sel-mode"]');
                const on = r?.checked;
                lbl.style.border      = `2px solid ${on ? 'var(--primary-color)' : 'var(--border-color)'}`;
                lbl.style.background  = on ? 'var(--primary-color)' : 'var(--surface-color)';
                lbl.style.color       = on ? '#fff' : 'var(--text-main)';
            });
        });
    });

    // Count picker + save
    root.querySelector('.vs-count-group')?.addEventListener('click', e => {
        const b = e.target.closest('.caro-count-btn');
        if (!b) return;
        root.querySelectorAll('.caro-count-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const raw = b.getAttribute('data-count');
        _saveSettings({ count: raw === 'All' ? 'All' : +raw });
    });

    // Clear bans
    root.querySelector('.vs-btn-clear-bans')?.addEventListener('click', () => {
        if (!confirm('Clear all banned words?')) return;
        setBannedWords(bannedKey, []);
        const savedActions = _captureActions(el);
        _render(el, { bannedKey, showCountPicker, defaultCounts, defaultCount, title });
        _wireEvents(el, { bannedKey, showCountPicker, defaultCounts, defaultCount, title, opts });
        _restoreActions(el, savedActions);
    });
}

// ─── QUEUE BUILDER ───────────────────────────────────────────────────────────

async function _buildQueueAsync(el, { bannedKey }) {
    const root   = el.querySelector('.vs-root');
    const warnEl = root?.querySelector('.vs-warning');

    const warn = (msg) => {
        if (warnEl) { warnEl.textContent = msg; warnEl.style.display = 'block'; }
        return [];
    };
    const clearWarn = () => { if (warnEl) warnEl.style.display = 'none'; };

    const useSrs = root?.querySelector('.vs-use-srs')?.checked ?? false;

    // Which decks are enabled?
    const activeDeckIds = [...(root?.querySelectorAll('.vs-use-deck:checked') || [])]
        .map(cb => cb.dataset.deckId);
    const useDecks = activeDeckIds.length > 0;

    if (!useSrs && !useDecks)
        return warn('Select at least one word source.');

    const statuses = useSrs
        ? [...(root?.querySelectorAll('.vs-status-check:checked') || [])].map(c => +c.value)
        : [];

    if (useSrs && statuses.length === 0)
        return warn('Select at least one SRS status to include.');

    clearWarn();

    const banned = new Set(getBannedWords(bannedKey));
    const map    = new Map();

    if (useDecks) {
        const lowInput  = root?.querySelector('.vs-range-low');
        const highInput = root?.querySelector('.vs-range-high');
        const lo = lowInput  ? Math.max(1,    Math.min(+lowInput.value  || 1,    1000)) : 1;
        const hi = highInput ? Math.max(1,    Math.min(+highInput.value || 1000, 1000)) : 1000;

        // Determine selection mode
        const modeRadio = root?.querySelector('input[name="vs-sel-mode"]:checked');
        const mode = modeRadio?.value ?? 'random';

        // Load all active decks concurrently
        const deckData = await Promise.all(
            activeDeckIds.map(id => {
                const deck = DECKS.find(d => d.id === id);
                return deck ? _getDeckList(deck) : Promise.resolve([]);
            })
        );

        // Merge words from all active decks; later decks overwrite duplicates
        const combined = new Map(); // word → entry
        deckData.forEach((list, i) => {
            const deckId = activeDeckIds[i];
            const pool   = (lo <= hi) ? list.slice(lo - 1, hi) : list;
            pool.forEach((w, idx) => {
                if (!banned.has(w.word)) {
                    // Store with original rank (lo + idx) for sequential ordering
                    combined.set(w.word, {
                        word:   w.word,
                        furi:   w.furi,
                        trans:  w.trans,
                        status: null,
                        deckId,
                        _rank:  lo + idx,   // 1-based rank within the range
                    });
                }
            });
        });

        if (mode === 'sequential') {
            // Sort by rank ascending (rank order = most-common first)
            const sorted = [...combined.values()].sort((a, b) => a._rank - b._rank);
            sorted.forEach(w => map.set(w.word, w));
        } else {
            // Shuffle
            const shuffled = [...combined.values()].sort(() => Math.random() - 0.5);
            shuffled.forEach(w => map.set(w.word, w));
        }
    }

    if (useSrs) {
        Object.values(srsDb.getAllWords()).forEach(w => {
            if (banned.has(w.word)) return;
            if (statuses.includes(w.status)) {
                map.set(w.word, { word: w.word, furi: w.furi, trans: w.translation, status: w.status, deckId: 'srs' });
            } else if (!useDecks) {
                map.delete(w.word);
            }
        });
    }

    let words = [...map.values()];

    if (words.length === 0)
        return warn('No words matched your settings (or all words in this source are banned).');

    // Apply count limit
    const activeBtn = root?.querySelector('.caro-count-btn.active');
    if (activeBtn) {
        const raw   = activeBtn.getAttribute('data-count');
        const limit = raw === 'All' ? Infinity : +raw;
        if (isFinite(limit)) words = words.slice(0, limit);
    }

    return words;
}

// Synchronous wrapper — returns a Promise; callers should await it.
// For backwards compat with games that call getQueue() without await,
// we return a thenable that also has a synchronous .value property set
// after the first microtask tick (best-effort).
function _buildQueue(el, { bannedKey }) {
    return _buildQueueAsync(el, { bannedKey });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _chipOpacity(cb) {
    const chip = cb.closest('.caro-status-chip');
    if (chip) chip.style.opacity = cb.checked ? '1' : '0.35';
}

function _captureActions(el) {
    const actionsEl = el.querySelector('.vs-actions');
    if (!actionsEl) return [];
    return [...actionsEl.childNodes];
}

function _restoreActions(el, nodes) {
    const actionsEl = el.querySelector('.vs-actions');
    if (!actionsEl || !nodes.length) return;
    nodes.forEach(n => actionsEl.appendChild(n));
}