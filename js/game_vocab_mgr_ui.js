/**
 * game_vocab_mgr_ui.js — Standardized quiz UI components for GameVocabManager
 *
 * Drop-in UI layer for any game that uses GameVocabManager. All components
 * are self-contained: they create their own overlay, wire up events, call
 * vocabMgr.getNextWord() / gradeWord() internally, then invoke a callback.
 *
 * ── Exported functions ────────────────────────────────────────────────────────
 *   showGameQuiz(vocabMgr, options)              — The central quiz window.
 *   showStandardQuiz(vocabMgr, options)          — Thin wrapper for generic quizzes.
 *   showQuizSequence(vocabMgr, count, options)   — Multi-question sequence.
 *   renderVocabSettings(vocabMgr, container, cb) — Standardized settings panel.
 *   injectVocabBadgeStyles()                     — Idempotent style injection.
 *   poolSourceLabel(poolSource)                  — Human-readable label.
 *   poolSourceDescription(poolSource)            — Infobox description.
 *   setGvmTheme(theme)                           — Forces 'dark' or 'light' theme.
 */

import { speakText, stopSpeech } from './tts_api.js';

const SPEAKER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;

let _forcedTheme = null;

/**
 * Forces the UI components to render in a specific theme regardless of the global app theme.
 * Useful for games like Tower Defense that are inherently dark-themed.
 * @param {'dark'|'light'|null} theme 
 */
export function setGvmTheme(theme) {
    _forcedTheme = theme;
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

function _injectStyles() {
    if (document.getElementById('gvm-styles')) return;
    const style = document.createElement('style');
    style.id = 'gvm-styles';
    style.textContent = `
        /* ── Theme variables ────────────────────────────────────────────────── */
        .gvm-dark {
            --surface-color: #1e1e2e !important;
            --bg-color: #151520 !important;
            --text-main: #eeeeee !important;
            --text-muted: #888888 !important;
            --border-color: #444444 !important;
        }

        /* ── Overlay backdrop ───────────────────────────────────────────────── */
        .gvm-overlay {
            position: absolute; inset: 0;
            background: rgba(0,0,0,0.88);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000; padding: 20px;
            backdrop-filter: blur(6px);
            pointer-events: auto;
            transition: background 0.25s ease, backdrop-filter 0.25s ease;
        }
        .gvm-overlay.gvm-anim-phase {
            background: rgba(0,0,0,0);
            backdrop-filter: blur(0px);
        }
        /* ── Modal shell ────────────────────────────────────────────────────── */
        .gvm-modal {
            background: var(--surface-color, #ffffff);
            border-radius: 16px;
            width: 100%; max-width: 420px;
            padding: 22px 20px 28px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06);
            display: flex; flex-direction: column; gap: 14px;
            text-align: center;
            color: var(--text-main, #333333);
            animation: gvmPopIn 0.2s cubic-bezier(0.175,0.885,0.32,1.275);
        }
        @keyframes gvmPopIn {
            0%   { opacity:0; transform:scale(0.85); }
            100% { opacity:1; transform:scale(1); }
        }
        /* ── Badge pill ─────────────────────────────────────────────────────── */
        .gvm-badge {
            display: inline-flex; align-self: flex-start;
            font-size: 10px; font-weight: 800;
            letter-spacing: 1.5px; text-transform: uppercase;
            padding: 3px 10px; border-radius: 20px;
        }
        .gvm-badge-real  { background:rgba(39,174,96,0.15);  color:#2ecc71; border:1px solid rgba(39,174,96,0.4); }
        .gvm-badge-new   { background:rgba(52,152,219,0.15); color:#3498db; border:1px solid rgba(52,152,219,0.4); }
        .gvm-badge-drill { background:rgba(241,196,15,0.15); color:#f1c40f; border:1px solid rgba(241,196,15,0.4); }
        .gvm-badge-leech { background:rgba(192,57,43,0.15);  color:#e74c3c; border:1px solid rgba(192,57,43,0.4); }
        .gvm-badge-unscheduled {
            background: linear-gradient(90deg,
                rgba(255,100,100,0.15), rgba(255,200,50,0.15),
                rgba(80,220,120,0.15),  rgba(80,160,255,0.15));
            border: 1px solid rgba(180,180,255,0.35);
            color: #888;
            background-size: 200% 100%;
            animation: gvmRainbowShift 3s linear infinite;
        }
        .gvm-dark .gvm-badge-unscheduled { color: #bbb; }
        @keyframes gvmRainbowShift {
            0%   { background-position:0% 50%; }
            100% { background-position:200% 50%; }
        }
        /* ── Title / subtitle ───────────────────────────────────────────────── */
        .gvm-title    { margin:0; font-size:20px; font-weight:800; letter-spacing:-0.3px; }
        .gvm-subtitle { margin:0; font-size:13px; color:var(--text-muted,#888); line-height:1.4; }
        /* ── Word block ─────────────────────────────────────────────────────── */
        .gvm-word-block { text-align:center; padding:6px 0; }
        .gvm-kanji { font-size:52px; font-weight:900; color:var(--text-main,#333); line-height:1.1; letter-spacing:-1px; }
        .gvm-furi  { font-size:15px; color:var(--text-muted,#888); min-height:20px; margin-bottom:4px; }
        /* ── Progress dots ───────────────────────────────────────────────────── */
        .gvm-seq-dots { display:flex; justify-content:center; gap:12px; }
        .gvm-dot {
            width:18px; height:18px; border-radius:50%;
            border:2px solid rgba(155,89,182,0.45);
            background:transparent; transition:all 0.2s;
        }
        .gvm-dot.filled { background:#9b59b6; border-color:#c39bd3; box-shadow:0 0 10px rgba(155,89,182,0.6); }
        .gvm-dot.failed { background:#e74c3c; border-color:#c0392b; box-shadow:0 0 8px rgba(231,76,60,0.5); }
        /* ── Answer grid ────────────────────────────────────────────────────── */
        .gvm-grid { display:grid; gap:8px; }
        .gvm-btn {
            padding:14px 10px; border-radius:10px;
            border:2px solid var(--border-color,#ccc);
            background:var(--bg-color,#f9f9f9); color:var(--text-main,#333);
            font-size:13px; font-weight:600; cursor:pointer;
            transition:all 0.12s; line-height:1.3;
        }
        .gvm-btn:hover:not(:disabled) {
            border-color:var(--primary-color,#4A90E2);
            background:rgba(74,144,226,0.08);
            transform:scale(1.02);
        }
        .gvm-btn:active:not(:disabled) { transform:scale(0.97); }
        .gvm-btn.correct {
            border-color:#27ae60 !important; background:rgba(39,174,96,0.18) !important;
            color:#2ecc71 !important; animation:gvmFlashCorrect 0.65s ease;
        }
        .gvm-btn.wrong {
            border-color:#c0392b !important; background:rgba(192,57,43,0.18) !important;
            color:#e74c3c !important; animation:gvmFlashWrong 0.65s ease;
        }
        @keyframes gvmFlashCorrect {
            0%  { box-shadow:0 0 0 0 rgba(39,174,96,0.6); }
            50% { box-shadow:0 0 0 8px rgba(39,174,96,0); }
            100%{ box-shadow:none; }
        }
        @keyframes gvmFlashWrong {
            0%,20%,40% { transform:translateX(-4px); }
            10%,30%    { transform:translateX(4px); }
            50%,100%   { transform:translateX(0); }
        }
        /* ── Settings ───────────────────────────────────────────────────────── */
        .gvm-settings-row {
            display:flex; justify-content:space-between; align-items:center;
            padding:10px 0; border-bottom:1px solid var(--border-color,#eee);
            text-align:left;
        }
        .gvm-settings-input {
            width:60px; padding:6px; border:1px solid var(--border-color,#ccc);
            border-radius:4px; text-align:center; background:var(--bg-color,#fff);
            color:var(--text-main,#333); font-weight:bold;
        }
        /* ── Pre-Quiz Animation ───────────────────────────────────────────────── */
        .gvm-pre-anim {
            position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 10;
        }
        .gvm-ring {
            position: absolute; border-radius: 50%; border: 4px solid rgba(241,196,15,0.8);
            animation: gvmRingAnim 0.5s ease-out forwards;
        }
        .gvm-ring:nth-child(2) { animation-delay: 0.1s; border-color: rgba(241,196,15,0.5); }
        .gvm-ring:nth-child(3) { animation-delay: 0.2s; border-color: rgba(241,196,15,0.2); }
        @keyframes gvmRingAnim {
            0% { width: 0; height: 0; opacity: 1; }
            100% { width: 300px; height: 300px; opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

/** Public export — inject GVM styles without importing the full quiz components. */
export function injectVocabBadgeStyles() { _injectStyles(); }

/**
 * Returns a human-readable label for a pool source value.
 * @param {'srs'|'custom'|'mixed'} poolSource
 * @returns {string}
 */
export function poolSourceLabel(poolSource) {
    return {
        srs:    'Your SRS library',
        custom: 'Custom deck',
        mixed:  'SRS + Custom deck',
    }[poolSource] ?? 'Your SRS library';
}

/**
 * Returns a one-line summary description for a pool source.
 * @param {'srs'|'custom'|'mixed'} poolSource
 * @returns {string}
 */
export function poolSourceDescription(poolSource) {
    return {
        srs:    'Live SRS reviews — answers update your real flashcard schedule. 🌈 = unscheduled (correct won\'t count).',
        custom: 'Local SM-2 — progress is self-contained and exported at session end.',
        mixed:  'SRS + custom deck — all answers update your real flashcard schedule.',
    }[poolSource] ?? '';
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const TYPE_BADGE = {
    due:          { cls: 'gvm-badge-real',         label: '🟢 Review'       },
    new:          { cls: 'gvm-badge-new',           label: '🔵 New Word'     },
    drill:        { cls: 'gvm-badge-drill',         label: '🟡 Drill'        },
    leech:        { cls: 'gvm-badge-leech',         label: '🩸 Leech'        },
    unscheduled:  { cls: 'gvm-badge-unscheduled',   label: '🌈 Unscheduled'  },
    random:       { cls: 'gvm-badge-real',          label: '🟢 Review'       },
};
function _badgeFor(type) { return TYPE_BADGE[type] ?? TYPE_BADGE.due; }

function _gridCols(n) {
    if (n <= 3)  return '1fr';
    if (n === 4) return '1fr 1fr';
    if (n <= 6)  return '1fr 1fr 1fr';
    if (n <= 8)  return '1fr 1fr 1fr 1fr';
    return '1fr 1fr 1fr 1fr';
}

// ─── showGameQuiz ─────────────────────────────────────────────────────────────

/**
 * The central, reusable quiz window for all games.
 * Renders inside options.container as a full-screen overlay.
 *
 * @param {GameVocabManager} vocabMgr
 * @param {Object} options
 * @param {HTMLElement} options.container
 * @param {string|Function} [options.title]
 * @param {string|Function} [options.titleColor]
 * @param {string|Function} [options.subtitle]
 * @param {boolean} [options.showFurigana=true]
 * @param {number} [options.optionCount=4]
 * @param {string} [options.forceMode]
 * @param {number[]|null} [options.dots]
 * @param {boolean} [options.continuous=false]
 *   When true the overlay stays open after each answer and loads the next word
 *   automatically. No ring animation is shown. A ✕ close button is always
 *   rendered inside the modal. onAnswer fires per word; onClose fires when the
 *   player dismisses the panel.
 * @param {Function} [options.onAnswer] (isCorrect, wordObj, result) => void
 * @param {Function} [options.onEmpty] () => void   — called when pool is empty (both modes)
 * @param {Function} [options.onClose] () => void   — called when ✕ is clicked (continuous only)
 * @returns {{ challenge, overlay } | null}
 */
export function showGameQuiz(vocabMgr, options = {}) {
    _injectStyles();

    const optionCount  = options.optionCount  ?? 4;
    const showFurigana = options.showFurigana !== false;
    const continuous   = options.continuous   === true;

    // ── Continuous mode: create the persistent overlay shell once, then
    //    delegate word-by-word rendering to an internal function.
    if (continuous) {
        const overlay = document.createElement('div');
        overlay.className = `gvm-overlay gvm-continuous ${_forcedTheme === 'dark' ? 'gvm-dark' : ''}`;
        options.container.appendChild(overlay);

        // Tracks the current challenge so the close button can clean up GVM state
        let _currentChallenge = null;

        const closePanel = () => {
            if (_currentChallenge?.refId) {
                // Grade pending word as wrong so GVM _pendingPulls stays clean
                vocabMgr.gradeWord(_currentChallenge.refId, false);
                _currentChallenge = null;
            }
            overlay.remove();
            if (options.onClose) options.onClose();
        };

        const loadNext = () => {
            const challenge = vocabMgr.getNextWord(options.forceMode ?? null, optionCount);
            if (!challenge) {
                overlay.remove();
                if (options.onEmpty) options.onEmpty();
                return;
            }
            _currentChallenge = challenge;

            const { wordObj, options: answerOpts, correctIdx, type, displayMode } = challenge;
            const isUnscheduled = type === 'unscheduled';
            const resolve = (v) => typeof v === 'function' ? v(isUnscheduled, type) : v;

            const badge = _badgeFor(type);
            let badgeLabel = badge.label;
            if (vocabMgr.isGlobalSrs || vocabMgr.getMode() !== 'random') {
                const dueCount = vocabMgr.getDueCount();
                if (dueCount > 0) badgeLabel += ` (${dueCount} due)`;
            }

            const title      = resolve(options.title)      ?? badgeLabel;
            const titleColor = resolve(options.titleColor) ?? 'var(--text-main, #333)';
            const subtitle   = options.subtitle !== undefined
                ? resolve(options.subtitle)
                : (isUnscheduled ? 'Not scheduled — correct answers won\'t update your SRS interval.' : '');

            let displayFuri = '';
            let displayMain = wordObj.kanji;
            if (displayMode === 'kana') {
                displayMain = wordObj.kana;
            } else if (displayMode === 'kanji') {
                displayMain = wordObj.kanji;
            } else {
                if (showFurigana && wordObj.kana !== wordObj.kanji) displayFuri = wordObj.kana;
            }

            const cols = _gridCols(answerOpts.length);

            overlay.innerHTML = `
                <div class="gvm-modal">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div class="gvm-badge ${badge.cls}">${badgeLabel}</div>
                        <button class="gvm-continuous-close" title="Close vocab panel"
                            style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2);
                                   color:#ccc; border-radius:50%; width:28px; height:28px; font-size:14px;
                                   cursor:pointer; display:flex; align-items:center; justify-content:center;
                                   line-height:1; flex-shrink:0;">✕</button>
                    </div>
                    <h3 class="gvm-title" style="color:${titleColor};">${title}</h3>
                    ${subtitle ? `<p class="gvm-subtitle">${subtitle}</p>` : ''}
                    <div class="gvm-word-block">
                        <div class="gvm-furi">${displayFuri}</div>
                        <div class="gvm-kanji">${displayMain}</div>
                    </div>
                    <div class="gvm-grid" style="grid-template-columns:${cols};">
                        ${answerOpts.map((opt, i) =>
                            `<button class="gvm-btn" data-idx="${i}">${opt}</button>`
                        ).join('')}
                    </div>
                </div>
            `;

            overlay.querySelector('.gvm-continuous-close').addEventListener('click', closePanel);

            const btns = overlay.querySelectorAll('.gvm-btn');
            btns.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (btn.disabled) return;
                    btns.forEach(b => b.disabled = true);

                    const isCorrect = parseInt(btn.dataset.idx) === correctIdx;
                    btn.classList.add(isCorrect ? 'correct' : 'wrong');
                    if (!isCorrect) {
                        const correctBtn = overlay.querySelector(`.gvm-btn[data-idx="${correctIdx}"]`);
                        if (correctBtn) correctBtn.classList.add('correct');
                    }

                    const gradeResult = vocabMgr.gradeWord(challenge.refId, isCorrect);
                    _currentChallenge = null;

                    if (isCorrect) {
                        setTimeout(() => {
                            if (options.onAnswer) options.onAnswer(isCorrect, wordObj, gradeResult);
                            if (overlay.isConnected) loadNext();
                        }, 600);
                    } else {
                        // Correction screen
                        setTimeout(() => {
                            const modalEl = overlay.querySelector('.gvm-modal');
                            if (!modalEl) return;
                            modalEl.innerHTML = `
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <div class="gvm-badge gvm-badge-leech">❌ Incorrect</div>
                                    <button class="gvm-continuous-close" title="Close vocab panel"
                                        style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2);
                                               color:#ccc; border-radius:50%; width:28px; height:28px; font-size:14px;
                                               cursor:pointer; display:flex; align-items:center; justify-content:center;
                                               line-height:1; flex-shrink:0;">✕</button>
                                </div>
                                <h3 class="gvm-title" style="color:#e74c3c; margin-top:5px;">Let's review!</h3>
                                <div style="background:var(--bg-color,#f9f9f9); border:1px solid var(--border-color,#ccc); border-radius:12px; padding:20px; margin:15px 0;">
                                    <div style="font-size:14px; color:var(--text-muted,#888); min-height:20px; margin-bottom:4px;">
                                        ${wordObj.kana !== wordObj.kanji ? wordObj.kana : ''}
                                    </div>
                                    <div style="font-size:42px; font-weight:900; color:var(--text-main,#333); line-height:1.1; letter-spacing:-1px; margin-bottom:15px;">
                                        ${wordObj.kanji}
                                    </div>
                                    <div style="font-size:18px; color:var(--primary-color,#4A90E2); font-weight:bold; padding-top:15px; border-top:1px dashed var(--border-color,#ccc);">
                                        ${wordObj.eng}
                                    </div>
                                </div>
                                <div style="display:flex; gap:10px;">
                                    <button id="gvm-correction-speak" class="gvm-btn" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px;">
                                        ${SPEAKER_ICON} Audio
                                    </button>
                                    <button id="gvm-correction-continue" class="gvm-btn" style="flex:2; background:var(--primary-color,#4A90E2); color:white; border-color:var(--primary-color,#4A90E2);">
                                        Continue &rarr;
                                    </button>
                                </div>
                            `;
                            modalEl.querySelector('.gvm-continuous-close').addEventListener('click', closePanel);
                            modalEl.querySelector('#gvm-correction-speak').addEventListener('click', () => {
                                const text = String(wordObj.kanji).replace(/[（\(].*?[）\)]/g, '').trim();
                                speakText(text);
                            });
                            modalEl.querySelector('#gvm-correction-continue').addEventListener('click', () => {
                                stopSpeech();
                                if (options.onAnswer) options.onAnswer(isCorrect, wordObj, gradeResult);
                                if (overlay.isConnected) loadNext();
                            });
                        }, 800);
                    }
                });
            });
        };

        loadNext();
        return { overlay };
    }

    // ── Normal (one-shot) mode ────────────────────────────────────────────────
    const challenge = vocabMgr.getNextWord(options.forceMode ?? null, optionCount);
    if (!challenge) {
        if (options.onEmpty)  options.onEmpty();
        else if (options.onAnswer) options.onAnswer(true, null, null);
        return null;
    }

    const { wordObj, options: answerOpts, correctIdx, type, displayMode } = challenge;
    const isUnscheduled = type === 'unscheduled';

    const resolve = (v) => typeof v === 'function' ? v(isUnscheduled, type) : v;

    const badge      = _badgeFor(type);
    
    // Add SRS due count to badge if scheduling is active
    let badgeLabel   = badge.label;
    if (vocabMgr.isGlobalSrs || vocabMgr.getMode() !== 'random') {
        const dueCount = vocabMgr.getDueCount();
        if (dueCount > 0) badgeLabel += ` (${dueCount} due)`;
    }
    
    const title      = resolve(options.title)      ?? badgeLabel;
    const titleColor = resolve(options.titleColor) ?? 'var(--text-main, #333)';
    const subtitle   = options.subtitle !== undefined
        ? resolve(options.subtitle)
        : (isUnscheduled ? 'Not scheduled — correct answers won\'t update your SRS interval.' : '');

    const dotsHtml = options.dots
        ? `<div class="gvm-seq-dots">${options.dots.map(s =>
              `<div class="gvm-dot${s === 1 ? ' filled' : s === -1 ? ' failed' : ''}"></div>`
          ).join('')}</div>`
        : '';

    const cols = _gridCols(answerOpts.length);

    // Prevent immediate misclicks by blocking interaction and animating rings first
    const showAnim = vocabMgr.config.preQuizAnim !== false;

    // Build Word Block based on Display Mode
    let displayFuri = '';
    let displayMain = wordObj.kanji;
    
    if (displayMode === 'kana') {
        displayMain = wordObj.kana;
    } else if (displayMode === 'kanji') {
        displayMain = wordObj.kanji;
    } else { // furigana
        if (showFurigana && wordObj.kana !== wordObj.kanji) {
            displayFuri = wordObj.kana;
        }
    }

    const overlay = document.createElement('div');
    overlay.className = `gvm-overlay ${_forcedTheme === 'dark' ? 'gvm-dark' : ''}`;
    overlay.innerHTML = `
        <div class="gvm-modal" style="${showAnim ? 'display:none;' : ''}">
            <div class="gvm-badge ${badge.cls}">${badgeLabel}</div>
            <h3 class="gvm-title" style="color:${titleColor};">${title}</h3>
            ${subtitle ? `<p class="gvm-subtitle">${subtitle}</p>` : ''}
            ${dotsHtml}
            <div class="gvm-word-block">
                <div class="gvm-furi">${displayFuri}</div>
                <div class="gvm-kanji">${displayMain}</div>
            </div>
            <div class="gvm-grid" style="grid-template-columns:${cols};">
                ${answerOpts.map((opt, i) =>
                    `<button class="gvm-btn" data-idx="${i}">${opt}</button>`
                ).join('')}
            </div>
        </div>
        ${showAnim ? `
        <div class="gvm-pre-anim">
            <div class="gvm-ring"></div>
            <div class="gvm-ring"></div>
            <div class="gvm-ring"></div>
        </div>
        ` : ''}
    `;

    options.container.appendChild(overlay);

    if (showAnim) {
        // Keep overlay transparent while rings play so the tower remains visible underneath
        overlay.classList.add('gvm-anim-phase');

        const animEl = overlay.querySelector('.gvm-pre-anim');
        const modalEl = overlay.querySelector('.gvm-modal');
        setTimeout(() => {
            if (animEl) animEl.remove();
            // Fade in the dark backdrop now that the modal is about to appear
            overlay.classList.remove('gvm-anim-phase');
            if (modalEl) {
                modalEl.style.display = 'flex';
                modalEl.style.animation = 'none';
                modalEl.offsetHeight; // trigger reflow
                modalEl.style.animation = 'gvmPopIn 0.2s cubic-bezier(0.175,0.885,0.32,1.275)';
            }
        }, 450);
    }

    const btns = overlay.querySelectorAll('.gvm-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            btns.forEach(b => b.disabled = true);

            const isCorrect = parseInt(btn.dataset.idx) === correctIdx;
            btn.classList.add(isCorrect ? 'correct' : 'wrong');
            if (!isCorrect) {
                const correctBtn = overlay.querySelector(`.gvm-btn[data-idx="${correctIdx}"]`);
                if (correctBtn) correctBtn.classList.add('correct');
            }

            const result = vocabMgr.gradeWord(challenge.refId, isCorrect);

            if (isCorrect) {
                setTimeout(() => {
                    overlay.remove();
                    if (options.onAnswer) options.onAnswer(isCorrect, wordObj, result);
                }, 600);
            } else {
                // CORRECTION SCREEN
                setTimeout(() => {
                    const modalEl = overlay.querySelector('.gvm-modal');
                    if (!modalEl) return;
                    
                    modalEl.innerHTML = `
                        <div class="gvm-badge gvm-badge-leech">❌ Incorrect</div>
                        <h3 class="gvm-title" style="color: #e74c3c; margin-top: 5px;">Let's review!</h3>
                        
                        <div style="background: var(--bg-color, #f9f9f9); border: 1px solid var(--border-color, #ccc); border-radius: 12px; padding: 20px; margin: 15px 0;">
                            <div style="font-size: 14px; color: var(--text-muted, #888); min-height: 20px; margin-bottom: 4px;">
                                ${wordObj.kana !== wordObj.kanji ? wordObj.kana : ''}
                            </div>
                            <div style="font-size: 42px; font-weight: 900; color: var(--text-main, #333); line-height: 1.1; letter-spacing: -1px; margin-bottom: 15px;">
                                ${wordObj.kanji}
                            </div>
                            <div style="font-size: 18px; color: var(--primary-color, #4A90E2); font-weight: bold; padding-top: 15px; border-top: 1px dashed var(--border-color, #ccc);">
                                ${wordObj.eng}
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 10px;">
                            <button id="gvm-correction-speak" class="gvm-btn" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;">
                                ${SPEAKER_ICON} Audio
                            </button>
                            <button id="gvm-correction-continue" class="gvm-btn" style="flex: 2; background: var(--primary-color, #4A90E2); color: white; border-color: var(--primary-color, #4A90E2);">
                                Continue &rarr;
                            </button>
                        </div>
                    `;
                    
                    const speakBtn = modalEl.querySelector('#gvm-correction-speak');
                    speakBtn.addEventListener('click', () => {
                        // Strictly enforce ONLY the target term, stripping out parentheses or extraneous formatting
                        const textToSpeak = String(wordObj.kanji).replace(/[（\(].*?[）\)]/g, '').trim();
                        speakText(textToSpeak);
                    });
                    
                    const continueBtn = modalEl.querySelector('#gvm-correction-continue');
                    continueBtn.addEventListener('click', () => {
                        stopSpeech();
                        overlay.remove();
                        if (options.onAnswer) options.onAnswer(isCorrect, wordObj, result);
                    });
                }, 800); // 800ms gives them enough time to see what they clicked vs what was correct
            }
        });
    });

    return { challenge, overlay };
}

// ─── showStandardQuiz ─────────────────────────────────────────────────────────

export function showStandardQuiz(vocabMgr, options) {
    showGameQuiz(vocabMgr, options);
}

// ─── showQuizSequence ─────────────────────────────────────────────────────────

export function showQuizSequence(vocabMgr, count, options) {
    let step         = 0;
    const stepStates = Array(count).fill(0);

    function next() {
        if (step >= count) {
            const successes = stepStates.filter(s => s === 1).length;
            if (options.onComplete) options.onComplete(successes, count - successes);
            return;
        }

        showGameQuiz(vocabMgr, {
            ...options,
            dots: [...stepStates],
            onEmpty: () => {
                const successes = stepStates.filter(s => s === 1).length;
                if (options.onComplete) options.onComplete(successes, count - successes);
            },
            onAnswer: (isCorrect, wordObj, result) => {
                stepStates[step] = isCorrect ? 1 : -1;
                if (options.onStepAnswer) options.onStepAnswer(isCorrect, wordObj, result, step);
                step++;
                next();
            },
        });
    }

    next();
}

// ─── renderVocabSettings ─────────────────────────────────────────────────────

/**
 * Generates the HTML for a settings menu to configure the VocabManager.
 * Injects into a provided container element. Uses limits from GameVocabManager.
 *
 * @param {GameVocabManager} vocabMgr
 * @param {HTMLElement} container
 * @param {Function} onSave - Callback triggered when the player hits Save
 * @param {'srs'|'custom'|'mixed'} [poolSource='custom']
 */
export function renderVocabSettings(vocabMgr, container, onSave, poolSource = 'custom') {
    _injectStyles();

    const cfg       = vocabMgr.config;
    const isSrs     = poolSource === 'srs';
    const isMixed   = poolSource === 'mixed';
    const isCustom  = poolSource === 'custom';
    const isSrsOnly = isSrs;
    
    // Safely fetch limits dynamically
    const limits = vocabMgr.constructor.configLimits || {};
    const getLim = (key, fallbackMin, fallbackMax) => {
        const l = limits[key];
        return { min: l?.min ?? fallbackMin, max: l?.max ?? fallbackMax };
    };

    const limInterval = getLim('initialInterval', 1, 300);
    const limEase     = getLim('initialEase', 1.1, 5.0);
    const limLeech    = getLim('leechThreshold', 3, 100);
    const limDue      = getLim('minDueTime', 5, 120);
    const limAcc      = getLim('minAccuracy', 0.5, 1.0);

    const modeLabels = { auto: '🤖 Auto', manual: '📋 Order', random: '🎲 Random' };
    const modeDescs  = {
        auto:   'Introduces new words automatically when accuracy and idle-time thresholds are met.',
        manual: 'SRS-ordered (due first), but new words must be introduced manually.',
        random: 'Picks words at random from the full pool — no SRS scheduling.'
    };

    const renderModeButtons = () => ['auto','manual','random'].map(m => `
        <button class="gvm-mode-btn${cfg.mode === m ? ' active' : ''}" data-mode="${m}" style="
            padding:7px 13px; border-radius:8px; border:2px solid var(--border-color,#ccc);
            background:${cfg.mode === m ? 'var(--primary-color,#4A90E2)' : 'var(--bg-color,#f4f6f8)'};
            color:${cfg.mode === m ? '#fff' : 'var(--text-main,#333)'}; font-size:13px;
            font-weight:bold; cursor:pointer; transition:all 0.15s;">
            ${modeLabels[m]}
        </button>`).join('');

    container.innerHTML = `
        <div class="${_forcedTheme === 'dark' ? 'gvm-dark' : ''}" style="display:flex; flex-direction:column; gap:14px; font-size:13px;">

            <div style="display:flex; align-items:center; gap:10px; padding:10px 12px;
                        background:${isSrs ? 'rgba(74,144,226,0.08)' : isMixed ? 'rgba(155,89,182,0.08)' : 'rgba(39,174,96,0.08)'};
                        border:1px solid ${isSrs ? 'var(--primary-color,#4A90E2)' : isMixed ? 'rgba(155,89,182,0.5)' : 'rgba(39,174,96,0.4)'};
                        border-radius:8px; font-size:12px; color:var(--text-main,#333);">
                <div style="font-size:22px; flex-shrink:0;">${isSrs ? '🌍' : isMixed ? '🔀' : '📦'}</div>
                <div>
                    <strong style="color:var(--text-main,#333);">${isSrs ? 'Global SRS' : isMixed ? 'Mixed Pool' : 'Custom Deck'}</strong>
                    <div style="color:var(--text-muted,#888); margin-top:2px; line-height:1.4;">
                        ${poolSourceDescription(poolSource)}
                    </div>
                </div>
            </div>

            <div class="gvm-settings-row" style="flex-direction:column; align-items:flex-start; gap:8px;
                 ${isSrsOnly ? 'opacity:0.45; pointer-events:none;' : ''}">
                <strong style="color:var(--text-main,#333);">🧠 Learning Mode ${isSrsOnly ? '<span style="font-size:10px;font-weight:normal;color:var(--text-muted,#888);margin-left:4px;">(controlled by SRS)</span>' : ''}</strong>
                <div style="display:flex; gap:8px; flex-wrap:wrap;" id="gvm-mode-btns">
                    ${renderModeButtons()}
                </div>
                <div id="gvm-mode-desc" style="font-size:11px; color:var(--text-muted,#888);">
                    ${isSrsOnly ? 'Your SRS schedule controls which words appear. Mode selection is only relevant when mixing SRS with custom decks.' : modeDescs[cfg.mode]}
                </div>
            </div>

            <div class="gvm-settings-row">
                <div style="flex:1;">
                    <strong style="color:var(--text-main,#333);">👁️ Question Format</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">
                        How words are displayed during the quiz.
                    </div>
                </div>
                <select id="gvm-cfg-qformat" style="width:auto; padding:6px; border:1px solid var(--border-color,#ccc); border-radius:4px; background:var(--bg-color,#fff); color:var(--text-main,#333);">
                    <option value="mixed"    ${cfg.questionFormat === 'mixed' ? 'selected' : ''}>Mixed (Random)</option>
                    <option value="furigana" ${cfg.questionFormat === 'furigana' ? 'selected' : ''}>Kanji + Furigana</option>
                    <option value="kanji"    ${cfg.questionFormat === 'kanji' ? 'selected' : ''}>Kanji Only</option>
                    <option value="kana"     ${cfg.questionFormat === 'kana' ? 'selected' : ''}>Kana Only</option>
                </select>
            </div>

            <div class="gvm-settings-row" id="gvm-row-batch">
                <div>
                    <strong style="color:var(--text-main,#333);">📚 Bootstrap Threshold</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">
                        While fewer than this many words are active, use the bootstrap batch size.
                    </div>
                </div>
                <input type="number" id="gvm-cfg-threshold" class="gvm-settings-input"
                       value="${cfg.newWordThreshold ?? 10}" min="1" max="100">
            </div>
            <div class="gvm-settings-row" id="gvm-row-batch-bootstrap">
                <div>
                    <strong style="color:var(--text-main,#333);">➕ Bootstrap Batch</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">
                        New words introduced at once when below the threshold (fast ramp-up).
                    </div>
                </div>
                <input type="number" id="gvm-cfg-batch-bootstrap" class="gvm-settings-input"
                       value="${cfg.newWordBatchBootstrap ?? 5}" min="1" max="20">
            </div>
            <div class="gvm-settings-row" id="gvm-row-batch-normal">
                <div>
                    <strong style="color:var(--text-main,#333);">➕ Normal Batch</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">
                        New words introduced at once when at or above the threshold (steady pace).
                    </div>
                </div>
                <input type="number" id="gvm-cfg-batch-normal" class="gvm-settings-input"
                       value="${cfg.newWordBatchNormal ?? 1}" min="1" max="20">
            </div>

            <div id="gvm-auto-only">
                <div class="gvm-settings-row">
                    <div>
                        <strong style="color:var(--text-main,#333);">⏱️ Idle Time Before New Word</strong>
                        <div style="font-size:11px; color:var(--text-muted,#888);">Seconds with no due cards before auto-introducing.</div>
                    </div>
                    <input type="number" id="gvm-cfg-duetime" class="gvm-settings-input"
                           value="${cfg.autoThresholds.minDueTime}" min="${limDue.min}" max="${limDue.max}">
                </div>
                <div class="gvm-settings-row">
                    <div>
                        <strong style="color:var(--text-main,#333);">🎯 Min Accuracy for New Words</strong>
                        <div style="font-size:11px; color:var(--text-muted,#888);">Recent accuracy % required before auto-introducing.</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <input type="number" id="gvm-cfg-accuracy" class="gvm-settings-input"
                               value="${Math.round(cfg.autoThresholds.minAccuracy * 100)}" min="${Math.round(limAcc.min*100)}" max="${Math.round(limAcc.max*100)}">
                        <span style="color:var(--text-muted,#888);">%</span>
                    </div>
                </div>
            </div>

            ${isCustom || isMixed ? `
            <div class="gvm-settings-row">
                <div>
                    <strong style="color:var(--text-main,#333);">🩸 Leech Threshold</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">Wrong answers before a word is quarantined.</div>
                </div>
                <input type="number" id="gvm-cfg-leech" class="gvm-settings-input"
                       value="${cfg.leechThreshold}" min="${limLeech.min}" max="${limLeech.max}">
            </div>
            <div class="gvm-settings-row">
                <div>
                    <strong style="color:var(--text-main,#333);">⏱️ Initial Interval</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">Seconds before a newly learned word reappears.</div>
                </div>
                <input type="number" id="gvm-cfg-interval" class="gvm-settings-input"
                       value="${cfg.initialInterval}" min="${limInterval.min}" max="${limInterval.max}">
            </div>
            <div class="gvm-settings-row">
                <div>
                    <strong style="color:var(--text-main,#333);">📐 Ease Factor</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">Interval growth multiplier. Higher = faster spacing.</div>
                </div>
                <input type="number" id="gvm-cfg-ease" class="gvm-settings-input"
                       step="0.1" value="${cfg.initialEase}" min="${limEase.min}" max="${limEase.max}">
            </div>` : ''}

            <button id="gvm-btn-save" style="padding:12px; background:var(--primary-color,#4A90E2);
                    color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">
                💾 Save Settings
            </button>
        </div>
    `;

    let selectedMode = cfg.mode;

    const syncVisibility = (mode) => {
        selectedMode = mode;
        const isRandom = mode === 'random';
        const isAuto   = mode === 'auto';
        const hideDisplay = isRandom ? 'none' : '';
        container.querySelector('#gvm-row-batch').style.display            = hideDisplay;
        container.querySelector('#gvm-row-batch-bootstrap').style.display  = hideDisplay;
        container.querySelector('#gvm-row-batch-normal').style.display     = hideDisplay;
        container.querySelector('#gvm-auto-only').style.display = isAuto ? '' : 'none';
        container.querySelector('#gvm-mode-desc').textContent   = modeDescs[mode] || '';
    };
    syncVisibility(cfg.mode);

    container.querySelectorAll('.gvm-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.gvm-mode-btn').forEach(b => {
                const active = b.dataset.mode === btn.dataset.mode;
                b.style.background  = active ? 'var(--primary-color,#4A90E2)' : 'var(--bg-color,#f4f6f8)';
                b.style.color       = active ? '#fff' : 'var(--text-main,#333)';
                b.style.borderColor = active ? 'var(--primary-color,#4A90E2)' : 'var(--border-color,#ccc)';
            });
            syncVisibility(btn.dataset.mode);
        });
    });

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    container.querySelector('#gvm-btn-save').addEventListener('click', () => {
        const newMode = selectedMode;
        
        const qFormat = container.querySelector('#gvm-cfg-qformat').value;

        const newWordThreshold      = clamp(parseInt(container.querySelector('#gvm-cfg-threshold').value) || 10, 1, 100);
        const newWordBatchBootstrap = clamp(parseInt(container.querySelector('#gvm-cfg-batch-bootstrap').value) || 5, 1, 20);
        const newWordBatchNormal    = clamp(parseInt(container.querySelector('#gvm-cfg-batch-normal').value) || 1, 1, 20);

        const minDueTime = clamp(parseInt(container.querySelector('#gvm-cfg-duetime').value) || 10, limDue.min, limDue.max);
        const minAccRaw  = parseInt(container.querySelector('#gvm-cfg-accuracy').value) || 80;
        const minAccuracy = clamp(minAccRaw / 100, limAcc.min, limAcc.max);

        let leechThreshold = cfg.leechThreshold;
        let initialInterval = cfg.initialInterval;
        let initialEase = cfg.initialEase;

        if (isCustom || isMixed) {
            leechThreshold  = clamp(parseInt(container.querySelector('#gvm-cfg-leech').value) || 20, limLeech.min, limLeech.max);
            initialInterval = clamp(parseInt(container.querySelector('#gvm-cfg-interval').value) || 8, limInterval.min, limInterval.max);
            initialEase     = clamp(parseFloat(container.querySelector('#gvm-cfg-ease').value) || 1.5, limEase.min, limEase.max);
        }

        vocabMgr.config.mode = newMode;
        vocabMgr.config.questionFormat = qFormat;
        vocabMgr.config.newWordThreshold = newWordThreshold;
        vocabMgr.config.newWordBatchBootstrap = newWordBatchBootstrap;
        vocabMgr.config.newWordBatchNormal = newWordBatchNormal;
        vocabMgr.config.autoThresholds.minDueTime = minDueTime;
        vocabMgr.config.autoThresholds.minAccuracy = minAccuracy;
        if (isCustom || isMixed) {
            vocabMgr.config.leechThreshold = leechThreshold;
            vocabMgr.config.initialInterval = initialInterval;
            vocabMgr.config.initialEase = initialEase;
        }

        if (onSave) {
            onSave({
                mode: newMode,
                questionFormat: qFormat,
                newWordThreshold,
                newWordBatchBootstrap,
                newWordBatchNormal,
                minDueTime,
                minAccuracy,
                leechThreshold,
                initialInterval,
                initialEase
            });
        }
    });
}