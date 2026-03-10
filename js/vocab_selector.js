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
    { id: 'anime',     category: 'interest', label: '🗡️ Anime',    file: '../data/word_list_1000_anime.js',      exportName: 'wordList', _cache: null, _promise: null },
    { id: 'romance',   category: 'interest', label: '💔 Romance',  file: '../data/word_list_1000_romance.js',    exportName: 'wordList', _cache: null, _promise: null },
    { id: 'gamer',     category: 'interest', label: '🎮 Gamer',    file: '../data/word_list_1000_gamer.js',      exportName: 'wordList', _cache: null, _promise: null },
    { id: 'foodie',    category: 'interest', label: '🍣 Foodie',   file: '../data/word_list_1000_foodie.js',     exportName: 'wordList', _cache: null, _promise: null },
    { id: 'history',   category: 'interest', label: '🏯 History',  file: '../data/word_list_1000_history.js',    exportName: 'wordList', _cache: null, _promise: null },
    // ── Goal ──────────────────────────────────────────────────────────────────
    { id: 'tourist',   category: 'goal',     label: '✈️ Tourist',  file: '../data/word_list_1000_tourist.js',    exportName: 'wordList', _cache: null, _promise: null },
    { id: 'expat',     category: 'goal',     label: '🏢 Expat',    file: '../data/word_list_1000_expat.js',      exportName: 'wordList', _cache: null, _promise: null },
    { id: 'frequency', category: 'goal',     label: '💼 Standard', file: '../data/word_list_1000_frequency.js',  exportName: 'wordList', _cache: null, _promise: null },
    { id: 'jlpt_n5',   category: 'goal',     label: '🔰 JLPT N5', file: '../data/word_list_jlpt_n5.js',         exportName: 'wordList', _cache: null, _promise: null },
    { id: 'jlpt_n4',   category: 'goal',     label: '📜 JLPT N4', file: '../data/word_list_jlpt_n4.js',         exportName: 'wordList', _cache: null, _promise: null },
    { id: 'jlpt_n3',   category: 'goal',     label: '📈 JLPT N3', file: '../data/word_list_jlpt_n3.js',         exportName: 'wordList', _cache: null, _promise: null },
    { id: 'jlpt_n2',   category: 'goal',     label: '🔥 JLPT N2', file: '../data/word_list_jlpt_n2.js',         exportName: 'wordList', _cache: null, _promise: null },
    { id: 'jlpt_n1',   category: 'goal',     label: '👑 JLPT N1', file: '../data/word_list_jlpt_n1.js',         exportName: 'wordList', _cache: null, _promise: null },
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

const SETTINGS_KEY = 'vocab_selector_settings';

function _loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
    catch { return {}; }
}

function _saveSettings(patch) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ..._loadSettings(), ...patch }));
}

// Per-deck range helpers
function _getDeckRange(saved, deckId) {
    return saved.deckRanges?.[deckId] ?? { lo: 1, hi: 1000 };
}

function _saveDeckRange(deckId, lo, hi) {
    const saved  = _loadSettings();
    const ranges = saved.deckRanges || {};
    ranges[deckId] = { lo, hi };
    _saveSettings({ deckRanges: ranges });
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
        getQueue:     () => _buildQueueAsync(screenEl, { bannedKey }),
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

    const useSrsChecked = saved.useSrs   !== undefined ? saved.useSrs   : hasSrs;
    const savedStatuses = saved.statuses !== undefined ? saved.statuses : [0,1,2,3];
    const savedCount    = saved.count    !== undefined ? saved.count    : defaultCount;
    const savedMode     = saved.selMode  !== undefined ? saved.selMode  : 'random';

    // Deck enabled state — migrate legacy single "useList" flag
    let savedDecks = saved.decks ?? { frequency: saved.useList ?? true };
    DECKS.forEach(d => { if (savedDecks[d.id] === undefined) savedDecks[d.id] = false; });

    let html = `<div class="caro-setup-panel vs-root">`;
    html += `<div class="caro-setup-section-title" style="padding:14px 20px 4px;font-size:15px;font-weight:700;">${title}</div>`;

    // ── Word Sources ──────────────────────────────────────────────────────────
    html += `<div class="caro-setup-section">`;
    html += `<div class="caro-setup-section-title">Word Sources</div>`;

    // SRS toggle + status chips
    html += `
        <label class="settings-toggle" style="border-radius:8px 8px 0 0;">
            <input type="checkbox" class="vs-use-srs" ${useSrsChecked ? 'checked' : ''}>
            <span class="settings-toggle-track"></span>
            <span class="settings-toggle-text">
                My SRS Vocabulary <em>(${Object.keys(srsWords).length} words)</em>
            </span>
        </label>
        <div class="vs-srs-filter" style="padding:10px 20px 12px;background:var(--surface-color);
             border:1px solid var(--border-color);border-top:none;${useSrsChecked ? '' : 'display:none;'}">
            <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">Include statuses:</div>
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

            html += `
        <label class="settings-toggle vs-deck-toggle" data-deck-id="${deck.id}"
               style="border-top:1px solid var(--border-color);border-radius:0;">
            <input type="checkbox" class="vs-use-deck" data-deck-id="${deck.id}" ${checked?'checked':''}>
            <span class="settings-toggle-track"></span>
            <span class="settings-toggle-text">
                ${deck.label} <em class="vs-deck-count-${deck.id}">(${listSize} words)</em>
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
            </div>
            <p style="font-size:11px;color:var(--text-muted);margin:0;line-height:1.4;">
                <strong>Random</strong> – different words each session from each deck's range.<br>
                <strong>Sequential</strong> – always the first N words of each range (rank order).
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
             border:1px solid #ffc107;border-radius:8px;font-size:13px;color:#856404;margin-top:8px;"></div>
        <div class="vs-actions"></div>
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

function _wireEvents(el, { bannedKey, showCountPicker, defaultCounts, defaultCount, title, opts }) {
    const root = el.querySelector('.vs-root');

    // SRS toggle
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

    // Deck toggles — show/hide that deck's own range panel
    root.querySelectorAll('.vs-use-deck').forEach(cb => {
        cb.addEventListener('change', () => {
            const deckId     = cb.dataset.deckId;
            const rangePanel = root.querySelector(`.vs-deck-range[data-for-deck="${deckId}"]`);
            if (rangePanel) rangePanel.style.display = cb.checked ? 'block' : 'none';

            const decks = {};
            root.querySelectorAll('.vs-use-deck').forEach(c => { decks[c.dataset.deckId] = c.checked; });
            _saveSettings({ decks, useList: Object.values(decks).some(Boolean) });
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
            _saveDeckRange(deckId, lo, hi);
        });
    });

    // Selection mode pills
    root.querySelectorAll('input[name="vs-sel-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            _saveSettings({ selMode: radio.value });
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

    const warn      = msg => { if (warnEl) { warnEl.textContent = msg; warnEl.style.display = 'block'; } return []; };
    const clearWarn = ()  => { if (warnEl) warnEl.style.display = 'none'; };

    const useSrs = root?.querySelector('.vs-use-srs')?.checked ?? false;

    const activeDeckIds = [...(root?.querySelectorAll('.vs-use-deck:checked') || [])]
        .map(cb => cb.dataset.deckId);
    const useDecks = activeDeckIds.length > 0;

    if (!useSrs && !useDecks) return warn('Select at least one word source.');

    const statuses = useSrs
        ? [...(root?.querySelectorAll('.vs-status-check:checked') || [])].map(c => +c.value)
        : [];

    if (useSrs && statuses.length === 0) return warn('Select at least one SRS status to include.');

    clearWarn();

    const banned = new Set(getBannedWords(bannedKey));
    // Use deckId::word as map key so the same word from different decks is kept separately
    const map    = new Map();

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
        } else {
            allEntries.sort(() => Math.random() - 0.5);
        }

        allEntries.forEach(w => map.set(`${w.deckId}::${w.word}`, w));
    }

    if (useSrs) {
        Object.values(srsDb.getAllWords()).forEach(w => {
            if (banned.has(w.word)) return;
            if (statuses.includes(w.status)) {
                map.set(`srs::${w.word}`, {
                    word:   w.word,
                    furi:   w.furi,
                    trans:  w.translation,
                    status: w.status,
                    deckId: 'srs',
                });
            }
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
    nodes.forEach(n => actionsEl.appendChild(n));
}