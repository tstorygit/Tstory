/**
 * story_vocab_selector.js
 *
 * A self-contained vocabulary picker for the "Create New Story" flow.
 * Unlike vocab_selector.js (which is deck/game focused), this one is
 * SRS-database focused — it lets you pick a subset of your own tracked
 * vocabulary to feed as a "vocab base" into story generation.
 *
 * ── Public API ────────────────────────────────────────────────────────────────
 *
 *   mountStoryVocabSelector(containerEl, options) → controller
 *
 *   controller.getSelection()   → Array<{word, furi, translation}>
 *   controller.getSummaryText() → string  (e.g. "50 due words")
 *   controller.hasSelection()   → boolean
 *
 * ── Filter modes ─────────────────────────────────────────────────────────────
 *   due          – words whose dueDate <= now (SRS queue)
 *   recent       – recently reviewed (sorted by lastUpdated desc)
 *   interval_asc – shortest interval first (newest/struggling words)
 *   interval_desc– longest interval first (most mature words)
 *   status       – filter by LingQ status level (0–5)
 *   all          – all words, sorted by lastUpdated desc
 */

import * as srsDb from './srs_db.js';

const STORAGE_KEY = 'story_vocab_selector_settings';

function _load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
}
function _save(patch) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ..._load(), ...patch }));
}

// ─── PUBLIC ──────────────────────────────────────────────────────────────────

export function mountStoryVocabSelector(containerEl, opts = {}) {
    _render(containerEl);
    _wire(containerEl);

    return {
        getSelection:   () => _buildSelection(containerEl),
        getSummaryText: () => _summaryText(containerEl),
        hasSelection:   () => _buildSelection(containerEl).length > 0,
        refresh:        () => { _render(containerEl); _wire(containerEl); },
    };
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function _render(el) {
    const saved   = _load();
    const allWords = Object.values(srsDb.getAllWords());
    const total    = allWords.length;

    const mode    = saved.mode    ?? 'due';
    const count   = saved.count   ?? 30;
    const statuses = saved.statuses ?? [1, 2, 3];

    // Count live preview for each mode
    const now = Date.now();
    const dueCount  = allWords.filter(w => !w.dueDate || new Date(w.dueDate).getTime() <= now).length;
    const allCount  = total;

    el.innerHTML = `
    <div class="svs-root" style="font-size:14px;">

        <div style="margin-bottom:12px;color:var(--text-muted);font-size:12px;line-height:1.5;">
            Select a subset of your SRS vocabulary (${total} words total) to guide the story.
            The AI will try to include these words naturally.
        </div>

        <!-- Mode selector -->
        <div style="margin-bottom:10px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;
                        letter-spacing:0.06em;margin-bottom:6px;">Filter by</div>
            <div class="svs-mode-group" style="display:flex;flex-wrap:wrap;gap:6px;">
                ${_modeBtn('due',          '⏰ Due now',        mode, `${dueCount} words`)}
                ${_modeBtn('recent',       '🕐 Recently done',  mode, '')}
                ${_modeBtn('interval_asc', '📈 Shortest interval', mode, '')}
                ${_modeBtn('interval_desc','📉 Longest interval',  mode, '')}
                ${_modeBtn('status',       '🏷️ By status',      mode, '')}
                ${_modeBtn('all',          '📚 All words',      mode, `${allCount}`)}
            </div>
        </div>

        <!-- Status filter (only shown in 'status' mode) -->
        <div class="svs-status-panel" style="${mode === 'status' ? '' : 'display:none;'}
            margin-bottom:10px;padding:10px 14px;background:var(--surface-color);
            border:1px solid var(--border-color);border-radius:8px;">
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">
                Include LingQ status levels:
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${[0,1,2,3,4,5].map(s => `
                    <label style="display:flex;align-items:center;cursor:pointer;">
                        <input type="checkbox" class="svs-status-cb" value="${s}"
                               ${statuses.includes(s) ? 'checked' : ''}
                               style="width:14px;height:14px;margin-right:5px;cursor:pointer;">
                        <span class="status-btn" data-status="${s}"
                              style="display:inline-flex;align-items:center;justify-content:center;
                                     width:28px;height:28px;border-radius:50%;font-size:13px;
                                     font-weight:bold;border:2px solid transparent;">${s}</span>
                    </label>`).join('')}
            </div>
        </div>

        <!-- Count picker -->
        <div style="margin-bottom:12px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;
                        letter-spacing:0.06em;margin-bottom:6px;">How many words</div>
            <div class="svs-count-group" style="display:flex;flex-wrap:wrap;gap:6px;">
                ${[10, 20, 30, 50, 80, 'All'].map(c => `
                    <button class="svs-count-btn${c == count || (c === 'All' && count === 'All') ? ' active' : ''}"
                            data-count="${c}"
                            style="padding:5px 12px;border-radius:6px;font-size:13px;cursor:pointer;
                                   border:2px solid var(--border-color);
                                   background:${(c == count || (c === 'All' && count === 'All'))
                                       ? 'var(--primary-color)' : 'var(--surface-color)'};
                                   color:${(c == count || (c === 'All' && count === 'All'))
                                       ? '#fff' : 'var(--text-main)'};">${c}</button>
                `).join('')}
            </div>
        </div>

        <!-- Live preview -->
        <div class="svs-preview" style="
            padding:10px 14px;background:var(--surface-color);border:1px solid var(--border-color);
            border-radius:8px;font-size:12px;color:var(--text-muted);min-height:36px;
            display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${_previewHTML(_buildSelectionFromSettings(mode, count, statuses))}
        </div>

    </div>`;
}

function _modeBtn(value, label, current, hint) {
    const active = value === current;
    return `<button class="svs-mode-btn${active ? ' active' : ''}" data-mode="${value}"
        style="padding:5px 11px;border-radius:6px;font-size:12px;cursor:pointer;
               border:2px solid ${active ? 'var(--primary-color)' : 'var(--border-color)'};
               background:${active ? 'var(--primary-color)' : 'var(--surface-color)'};
               color:${active ? '#fff' : 'var(--text-main)'};
               display:flex;flex-direction:column;align-items:center;gap:1px;line-height:1.2;">
        <span>${label}</span>
        ${hint ? `<span style="font-size:10px;opacity:0.75;">${hint}</span>` : ''}
    </button>`;
}

function _previewHTML(words) {
    if (words.length === 0) return `<span style="font-style:italic;">No words match — adjust filters above.</span>`;
    const preview = words.slice(0, 8).map(w => `<span style="
        background:var(--bg-color);border:1px solid var(--border-color);
        border-radius:4px;padding:2px 6px;font-size:12px;">${w.word}</span>`).join('');
    const more = words.length > 8 ? `<span style="font-style:italic;">+${words.length - 8} more</span>` : '';
    return `<span style="font-weight:600;color:var(--text-main);margin-right:4px;">${words.length} words selected:</span>${preview}${more}`;
}

// ─── WIRE ─────────────────────────────────────────────────────────────────────

function _wire(el) {
    const root = el.querySelector('.svs-root');
    if (!root) return;

    // Mode buttons
    root.querySelectorAll('.svs-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-mode');
            _save({ mode });
            _render(el);
            _wire(el);
        });
    });

    // Status checkboxes
    root.querySelectorAll('.svs-status-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const statuses = [...root.querySelectorAll('.svs-status-cb:checked')].map(c => +c.value);
            _save({ statuses });
            _refreshPreview(el);
        });
    });

    // Count buttons
    root.querySelectorAll('.svs-count-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const raw = btn.getAttribute('data-count');
            const count = raw === 'All' ? 'All' : +raw;
            _save({ count });

            // Update button styles
            root.querySelectorAll('.svs-count-btn').forEach(b => {
                const isActive = b === btn;
                b.style.background = isActive ? 'var(--primary-color)' : 'var(--surface-color)';
                b.style.color      = isActive ? '#fff' : 'var(--text-main)';
                b.style.border     = `2px solid ${isActive ? 'var(--primary-color)' : 'var(--border-color)'}`;
            });
            _refreshPreview(el);
        });
    });
}

function _refreshPreview(el) {
    const saved = _load();
    const words  = _buildSelectionFromSettings(saved.mode ?? 'due', saved.count ?? 30, saved.statuses ?? [1,2,3]);
    const preview = el.querySelector('.svs-preview');
    if (preview) preview.innerHTML = _previewHTML(words);
}

// ─── SELECTION BUILDER ───────────────────────────────────────────────────────

function _buildSelectionFromSettings(mode, count, statuses) {
    const now = Date.now();
    let words = Object.values(srsDb.getAllWords());

    switch (mode) {
        case 'due':
            words = words.filter(w => !w.dueDate || new Date(w.dueDate).getTime() <= now);
            words.sort((a, b) => {
                const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
                const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
                return da - db; // most overdue first
            });
            break;
        case 'recent':
            words.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
            break;
        case 'interval_asc':
            words = words.filter(w => w.interval !== undefined);
            words.sort((a, b) => (a.interval ?? Infinity) - (b.interval ?? Infinity));
            break;
        case 'interval_desc':
            words = words.filter(w => w.interval !== undefined);
            words.sort((a, b) => (b.interval ?? -1) - (a.interval ?? -1));
            break;
        case 'status':
            words = words.filter(w => statuses.includes(w.status));
            words.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
            break;
        case 'all':
        default:
            words.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
            break;
    }

    if (count !== 'All' && isFinite(+count)) {
        words = words.slice(0, +count);
    }

    return words.map(w => ({ word: w.word, furi: w.furi || '', translation: w.translation || '' }));
}

function _buildSelection(el) {
    const saved = _load();
    return _buildSelectionFromSettings(
        saved.mode     ?? 'due',
        saved.count    ?? 30,
        saved.statuses ?? [1, 2, 3]
    );
}

function _summaryText(el) {
    const words = _buildSelection(el);
    const saved = _load();
    const modeLabels = {
        due:           'due',
        recent:        'recently reviewed',
        interval_asc:  'shortest interval',
        interval_desc: 'longest interval',
        status:        'by status',
        all:           'all',
    };
    const label = modeLabels[saved.mode ?? 'due'] ?? 'selected';
    return `${words.length} ${label} word${words.length !== 1 ? 's' : ''}`;
}
