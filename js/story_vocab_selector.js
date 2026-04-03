/**
 * story_vocab_selector.js
 *
 * A self-contained, polished vocabulary picker for story generation flows.
 * Designed to be embedded either:
 *   (a) as a collapsible accordion inside the "Create" tab, OR
 *   (b) inside a modal sheet shown before generating a story continuation.
 *
 * ── Public API ────────────────────────────────────────────────────────────────
 *
 *   mountStoryVocabSelector(containerEl, options?) → controller
 *
 *   controller.getSelection()   → Array<{word, furi, translation}>
 *   controller.getSummaryText() → string  (e.g. "30 due words")
 *   controller.hasSelection()   → boolean
 *   controller.refresh()        → void    (re-render with fresh DB data)
 *
 * ── Filter modes ─────────────────────────────────────────────────────────────
 *   due          – words whose dueDate ≤ now (SRS queue), most overdue first
 *   recent       – recently reviewed (lastUpdated desc)
 *   interval_asc – shortest interval first (struggling words)
 *   status       – filter by LingQ status level(s)
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
        getSelection:   () => _buildSelection(),
        getSummaryText: () => _summaryText(),
        hasSelection:   () => _buildSelection().length > 0,
        refresh:        () => { _render(containerEl); _wire(containerEl); },
    };
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function _render(el) {
    const saved     = _load();
    const allWords  = Object.values(srsDb.getAllWords());
    const total     = allWords.length;

    const mode      = saved.mode     ?? 'due';
    const count     = saved.count    ?? 30;
    const statuses  = saved.statuses ?? [1, 2, 3];

    const now       = Date.now();
    const dueCount  = allWords.filter(w => !w.dueDate || new Date(w.dueDate).getTime() <= now).length;

    const MODES = [
        { value: 'due',          icon: '⏰', label: 'Due',        hint: dueCount > 0 ? `${dueCount}` : '' },
        { value: 'recent',       icon: '🕐', label: 'Recent',     hint: '' },
        { value: 'interval_asc', icon: '📈', label: 'Struggling', hint: '' },
        { value: 'status',       icon: '🏷️', label: 'By Status',  hint: '' },
        { value: 'all',          icon: '📚', label: 'All',        hint: `${total}` },
    ];

    const COUNTS = [10, 20, 30, 50, 100, 'All'];

    const preview = _buildSelectionFromSettings(mode, count, statuses);

    el.innerHTML = `
    <div class="svs-root">

        <div class="svs-row">
            <div class="svs-section-label">Source</div>
            <div class="svs-pill-row">
                ${MODES.map(m => `
                    <button class="svs-pill ${m.value === mode ? 'active' : ''}" data-mode="${m.value}">
                        ${m.icon} ${m.label}${m.hint ? ` <span class="svs-badge">${m.hint}</span>` : ''}
                    </button>
                `).join('')}
            </div>
        </div>

        <div class="svs-status-filter ${mode === 'status' ? '' : 'svs-hidden'}">
            <div class="svs-section-label">Include status levels</div>
            <div class="svs-status-row">
                ${[0,1,2,3,4,5].map(s => `
                    <label class="svs-status-label">
                        <input type="checkbox" class="svs-status-cb" value="${s}"
                               ${statuses.includes(s) ? 'checked' : ''}>
                        <span class="status-btn" data-status="${s}">${s}</span>
                    </label>
                `).join('')}
            </div>
        </div>

        <div class="svs-row">
            <div class="svs-section-label">Limit</div>
            <div class="svs-pill-row">
                ${COUNTS.map(c => `
                    <button class="svs-count-btn svs-pill ${
                        (c === 'All' && count === 'All') || c == count ? 'active' : ''
                    }" data-count="${c}">${c}</button>
                `).join('')}
            </div>
        </div>

        <div class="svs-preview">
            ${_previewHTML(preview)}
        </div>

    </div>

    <style>
    .svs-root { font-size:13px; color:var(--text-main); }
    .svs-row { margin-bottom:12px; }
    .svs-section-label {
        font-size:10px; font-weight:700; text-transform:uppercase;
        letter-spacing:0.08em; color:var(--text-muted); margin-bottom:7px;
    }
    .svs-pill-row { display:flex; flex-wrap:wrap; gap:5px; }
    .svs-pill {
        display:inline-flex; align-items:center; gap:4px;
        padding:5px 11px; border-radius:20px;
        border:1.5px solid var(--border-color);
        background:var(--bg-color); color:var(--text-main);
        font-size:12px; font-weight:500; cursor:pointer;
        transition:border-color 0.12s, background 0.12s, color 0.12s;
        white-space:nowrap; line-height:1;
    }
    .svs-pill:hover { border-color:var(--primary-color); color:var(--primary-color); }
    .svs-pill.active {
        background:var(--primary-color); border-color:var(--primary-color);
        color:#fff; font-weight:600;
    }
    .svs-badge {
        font-size:10px; font-weight:600;
        background:rgba(0,0,0,0.15); border-radius:8px;
        padding:1px 5px; line-height:1.4;
    }
    .svs-pill.active .svs-badge { background:rgba(255,255,255,0.25); }
    .svs-status-filter { margin-bottom:12px; }
    .svs-hidden { display:none !important; }
    .svs-status-row { display:flex; gap:8px; flex-wrap:wrap; }
    .svs-status-label { display:flex; align-items:center; gap:5px; cursor:pointer; }
    .svs-status-label input[type="checkbox"] {
        width:14px; height:14px; cursor:pointer; accent-color:var(--primary-color);
    }
    .svs-preview {
        padding:9px 12px;
        background:var(--bg-color);
        border:1px solid var(--border-color);
        border-radius:8px;
        font-size:12px; color:var(--text-muted);
        min-height:32px; display:flex; align-items:center;
        flex-wrap:wrap; gap:5px; line-height:1.6;
    }
    .svs-word-chip {
        background:var(--surface-color); border:1px solid var(--border-color);
        border-radius:4px; padding:1px 7px; font-size:12px; color:var(--text-main);
    }
    .svs-preview-count { font-weight:700; color:var(--primary-color); margin-right:2px; }
    </style>`;
}

function _previewHTML(words) {
    if (words.length === 0) {
        return `<span style="font-style:italic;">No words match — adjust filters above.</span>`;
    }
    const chips = words.slice(0, 10).map(w =>
        `<span class="svs-word-chip">${w.word}</span>`
    ).join('');
    const more = words.length > 10
        ? `<span style="font-style:italic;">+${words.length - 10} more</span>`
        : '';
    return `<span class="svs-preview-count">${words.length} words</span>${chips}${more}`;
}

// ─── WIRE ─────────────────────────────────────────────────────────────────────

function _wire(el) {
    const root = el.querySelector('.svs-root');
    if (!root) return;

    root.querySelectorAll('.svs-pill[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            _save({ mode: btn.getAttribute('data-mode') });
            _render(el);
            _wire(el);
        });
    });

    root.querySelectorAll('.svs-status-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const statuses = [...root.querySelectorAll('.svs-status-cb:checked')].map(c => +c.value);
            _save({ statuses });
            _refreshPreview(el);
        });
    });

    root.querySelectorAll('.svs-count-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const raw = btn.getAttribute('data-count');
            _save({ count: raw === 'All' ? 'All' : +raw });
            root.querySelectorAll('.svs-count-btn').forEach(b => b.classList.toggle('active', b === btn));
            _refreshPreview(el);
        });
    });
}

function _refreshPreview(el) {
    const saved = _load();
    const words = _buildSelectionFromSettings(saved.mode ?? 'due', saved.count ?? 30, saved.statuses ?? [1, 2, 3]);
    const preview = el.querySelector('.svs-preview');
    if (preview) preview.innerHTML = _previewHTML(words);
}

// ─── SELECTION BUILDER ───────────────────────────────────────────────────────

function _buildSelectionFromSettings(mode, count, statuses) {
    const now  = Date.now();
    let words  = Object.values(srsDb.getAllWords());

    switch (mode) {
        case 'due':
            words = words.filter(w => !w.dueDate || new Date(w.dueDate).getTime() <= now);
            words.sort((a, b) => {
                const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
                const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
                return da - db;
            });
            break;
        case 'recent':
            words.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
            break;
        case 'interval_asc':
            words = words.filter(w => w.interval !== undefined && w.interval > 0);
            words.sort((a, b) => (a.interval ?? Infinity) - (b.interval ?? Infinity));
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

function _buildSelection() {
    const saved = _load();
    return _buildSelectionFromSettings(
        saved.mode     ?? 'due',
        saved.count    ?? 30,
        saved.statuses ?? [1, 2, 3]
    );
}

function _summaryText() {
    const words = _buildSelection();
    const saved = _load();
    const labels = { due:'due', recent:'recent', interval_asc:'struggling', status:'by status', all:'all' };
    return `${words.length} ${labels[saved.mode ?? 'due'] ?? 'selected'} word${words.length !== 1 ? 's' : ''}`;
}