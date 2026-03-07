/**
 * vocab_selector.js
 *
 * A fully self-contained vocabulary-selector setup screen for mini-games.
 * Games mount it into their own screen element; it renders the complete UI
 * including word sources, SRS status filters, session-size picker, banned-word
 * management, a warning area, and an actions row for game-specific buttons.
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
 *                                  Use a game-specific key so each game has its own list.
 *       showCountPicker {boolean}  Show the "Session Size" row. Default: true.
 *       defaultCounts   {Array}    Button values. Default: [10, 20, 50, 100, 'All'].
 *       defaultCount    {number|'All'}  Pre-selected count. Default: 20.
 *       title           {string}   Section heading. Default: 'Setup'.
 *
 *   controller.getQueue()
 *     Read the current selector state and return a shuffled, ban-filtered,
 *     count-limited word array.  Returns [] on validation failure and renders
 *     a warning inside the screen.
 *     Each entry: { word: string, furi: string, trans: string, status: number|null }
 *
 *   controller.getActionsEl()
 *     Returns the <div class="vs-actions"> element where games can append their
 *     own buttons (Start, Back, etc.).
 *
 *   controller.refresh()
 *     Re-render the screen in place (e.g. after clearing bans mid-session).
 *
 *   getBannedWords(bannedKey)
 *   setBannedWords(bannedKey, list)
 *     Direct access to the ban list.  Use setBannedWords from game code that
 *     manages banning mid-game (e.g. Caro's in-card ban button).
 *
 * ── Caro migration example ───────────────────────────────────────────────────
 *
 *   import { mountVocabSelector, getBannedWords, setBannedWords }
 *     from '../../vocab_selector.js';
 *
 *   const BANNED_KEY = 'caro_banned_words';
 *   let _selector = null;
 *
 *   function _renderSetup() {
 *     _selector = mountVocabSelector(_screens.setup, {
 *       bannedKey:    BANNED_KEY,
 *       defaultCount: 20,
 *     });
 *
 *     // Append game buttons into the actions slot
 *     const actions = _selector.getActionsEl();
 *     const startBtn = document.createElement('button');
 *     startBtn.className = 'primary-btn';
 *     startBtn.style.marginTop = '8px';
 *     startBtn.textContent = '▶ Start Game';
 *     startBtn.addEventListener('click', () => _start());
 *     const backBtn = document.createElement('button');
 *     backBtn.className = 'caro-back-btn';
 *     backBtn.textContent = '← Back to Games';
 *     backBtn.addEventListener('click', _onExit);
 *     actions.append(startBtn, backBtn);
 *   }
 *
 *   function _start() {
 *     const queue = _selector.getQueue();
 *     if (!queue.length) return;  // warning already shown in the screen
 *     _state = { activeQueue: queue, currentIndex: 0, score: 0, history: [] };
 *     _show('game');
 *     _renderCard();
 *   }
 *
 *   // Mid-game ban (in _renderCard()):
 *   banBtn.addEventListener('click', () => {
 *     const banned = getBannedWords(BANNED_KEY);
 *     if (!banned.includes(word.word)) {
 *       setBannedWords(BANNED_KEY, [...banned, word.word]);
 *     }
 *     // remove from activeQueue and continue...
 *   });
 *
 * ── Adding a second game ─────────────────────────────────────────────────────
 *
 *   function renderMyGameSetup(screenEl) {
 *     const sel = mountVocabSelector(screenEl, {
 *       bannedKey:      'mygame_banned',
 *       showCountPicker: false,   // this game controls count elsewhere
 *       title:          'Choose Your Words',
 *     });
 *     const playBtn = document.createElement('button');
 *     playBtn.className = 'primary-btn';
 *     playBtn.textContent = '▶ Play';
 *     playBtn.addEventListener('click', () => {
 *       const queue = sel.getQueue();
 *       if (!queue.length) return;
 *       startMyGame(queue);
 *     });
 *     sel.getActionsEl().appendChild(playBtn);
 *   }
 */

import { wordList } from '../data/word_list_1000.js';
import * as srsDb   from './srs_db.js';

// ─── BAN LIST ────────────────────────────────────────────────────────────────

export function getBannedWords(bannedKey = 'vocab_selector_banned') {
    try { return JSON.parse(localStorage.getItem(bannedKey)) || []; }
    catch { return []; }
}

export function setBannedWords(bannedKey = 'vocab_selector_banned', list) {
    localStorage.setItem(bannedKey, JSON.stringify(list));
}

// ─── MOUNT ───────────────────────────────────────────────────────────────────

/**
 * Render the full setup screen into screenEl and return a controller.
 *
 * @param   {HTMLElement} screenEl
 * @param   {object}      [opts]
 * @returns {{ getQueue: Function, getActionsEl: Function, refresh: Function }}
 */
export function mountVocabSelector(screenEl, opts = {}) {
    const {
        bannedKey       = 'vocab_selector_banned',
        showCountPicker = true,
        defaultCounts   = [10, 20, 50, 100, 'All'],
        defaultCount    = 20,
        title           = 'Setup',
    } = opts;

    _render(screenEl, { bannedKey, showCountPicker, defaultCounts, defaultCount, title });
    _wireEvents(screenEl, { bannedKey, showCountPicker, defaultCounts, defaultCount, title, opts });

    return {
        /** Return the shuffled, filtered, count-limited queue (or [] with warning). */
        getQueue:     () => _buildQueue(screenEl, { bannedKey }),
        /** Return the .vs-actions element for appending game buttons. */
        getActionsEl: () => screenEl.querySelector('.vs-actions'),
        /** Re-render in place (e.g. after clearing bans). */
        refresh:      () => {
            // Preserve any children the caller placed in .vs-actions
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

    let html = `<div class="caro-setup-panel vs-root">`;

    // ── Word Sources ──────────────────────────────────────────────────────────
    html += `
        <div class="caro-setup-section">
            <div class="caro-setup-section-title">Word Sources</div>

            <label class="settings-toggle" style="border-radius:8px 8px 0 0;">
                <input type="checkbox" class="vs-use-srs" ${hasSrs ? 'checked' : ''}>
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
                ${hasSrs ? '' : 'display:none;'}
            ">
                <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">
                    Include statuses:
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    ${[0,1,2,3,4,5].map(s => `
                        <label class="caro-status-chip">
                            <input type="checkbox"
                                   class="vs-status-check"
                                   value="${s}"
                                   ${s <= 3 ? 'checked' : ''}>
                            <span class="status-btn" data-status="${s}"
                                  style="display:inline-flex;align-items:center;justify-content:center;
                                         width:32px;height:32px;border-radius:50%;cursor:pointer;
                                         font-size:14px;font-weight:bold;border:2px solid transparent;">
                                ${s}
                            </span>
                        </label>`).join('')}
                </div>
            </div>

            <label class="settings-toggle" style="border-radius:0 0 8px 8px;border-top:1px solid var(--border-color);">
                <input type="checkbox" class="vs-use-list" checked>
                <span class="settings-toggle-track"></span>
                <span class="settings-toggle-text">
                    Top 1000 Word List
                    <em>(${wordList.length} words)</em>
                </span>
            </label>
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
                        <button class="caro-count-btn ${n === defaultCount ? 'active' : ''}"
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
}

// ─── WIRE EVENTS ─────────────────────────────────────────────────────────────

function _wireEvents(el, { bannedKey, showCountPicker, defaultCounts, defaultCount, title, opts }) {
    const root = el.querySelector('.vs-root');

    // SRS toggle → show/hide status filter
    const srsToggle = root.querySelector('.vs-use-srs');
    const srsFilter = root.querySelector('.vs-srs-filter');
    srsToggle?.addEventListener('change', () => {
        if (srsFilter) srsFilter.style.display = srsToggle.checked ? 'block' : 'none';
    });

    // Status chips — opacity feedback
    root.querySelectorAll('.vs-status-check').forEach(cb => {
        _chipOpacity(cb);
        cb.addEventListener('change', () => _chipOpacity(cb));
    });

    // Count picker
    root.querySelector('.vs-count-group')?.addEventListener('click', e => {
        const b = e.target.closest('.caro-count-btn');
        if (!b) return;
        root.querySelectorAll('.caro-count-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
    });

    // Clear bans — re-renders in place, then restores caller's action buttons
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

function _buildQueue(el, { bannedKey }) {
    const root   = el.querySelector('.vs-root');
    const warnEl = root?.querySelector('.vs-warning');

    const warn = (msg) => {
        if (warnEl) { warnEl.textContent = msg; warnEl.style.display = 'block'; }
        return [];
    };
    const clearWarn = () => { if (warnEl) warnEl.style.display = 'none'; };

    const useSrs  = root?.querySelector('.vs-use-srs')?.checked  ?? false;
    const use1000 = root?.querySelector('.vs-use-list')?.checked ?? false;

    if (!useSrs && !use1000)
        return warn('Select at least one word source.');

    const statuses = useSrs
        ? [...(root?.querySelectorAll('.vs-status-check:checked') || [])].map(c => +c.value)
        : [];

    if (useSrs && statuses.length === 0)
        return warn('Select at least one SRS status to include.');

    clearWarn();

    const banned = new Set(getBannedWords(bannedKey));
    const map    = new Map();

    if (use1000) {
        wordList.forEach(w => {
            if (!banned.has(w.word))
                map.set(w.word, { word: w.word, furi: w.furi, trans: w.trans, status: null });
        });
    }
    if (useSrs) {
        Object.values(srsDb.getAllWords()).forEach(w => {
            if (banned.has(w.word)) return;
            if (statuses.includes(w.status)) {
                map.set(w.word, { word: w.word, furi: w.furi, trans: w.translation, status: w.status });
            } else if (!use1000) {
                map.delete(w.word);
            }
        });
    }

    const shuffled = [...map.values()].sort(() => Math.random() - 0.5);

    if (shuffled.length === 0)
        return warn('No words matched your settings (or all words in this source are banned).');

    // Apply count limit
    const activeBtn = root?.querySelector('.caro-count-btn.active');
    if (activeBtn) {
        const raw   = activeBtn.getAttribute('data-count');
        const limit = raw === 'All' ? Infinity : +raw;
        return isFinite(limit) ? shuffled.slice(0, limit) : shuffled;
    }
    return shuffled;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _chipOpacity(cb) {
    const chip = cb.closest('.caro-status-chip');
    if (chip) chip.style.opacity = cb.checked ? '1' : '0.35';
}

/** Capture all children of .vs-actions before a re-render. */
function _captureActions(el) {
    const actionsEl = el.querySelector('.vs-actions');
    if (!actionsEl) return [];
    return [...actionsEl.childNodes];
}

/** Re-attach previously captured action children after a re-render. */
function _restoreActions(el, nodes) {
    const actionsEl = el.querySelector('.vs-actions');
    if (!actionsEl || !nodes.length) return;
    nodes.forEach(n => actionsEl.appendChild(n));
}
