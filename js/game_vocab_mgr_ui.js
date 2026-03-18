/**
 * game_vocab_mgr_ui.js — Standardized quiz UI components for GameVocabManager
 *
 * Drop-in UI layer for any game that uses GameVocabManager.  All components
 * are self-contained: they create their own overlay, wire up events, call
 * vocabMgr.getNextWord() / gradeWord() internally, then invoke a callback.
 *
 * ── Exported functions ────────────────────────────────────────────────────────
 *
 *   showGameQuiz(vocabMgr, options)              — The central quiz window.
 *                                                  Renders badge, title, subtitle,
 *                                                  optional progress dots, word block,
 *                                                  and answer grid.  All text is
 *                                                  injectable so every game can reuse
 *                                                  this window with its own flavour.
 *
 *   showStandardQuiz(vocabMgr, options)          — Thin wrapper around showGameQuiz
 *                                                  for games that don't need custom text.
 *
 *   showQuizSequence(vocabMgr, count, options)   — Multi-question sequence that drives
 *                                                  showGameQuiz once per step.
 *
 *   renderVocabSettings(vocabMgr, container, cb) — Settings panel injected into a container.
 *
 *   injectVocabBadgeStyles()                     — Idempotent style injection.
 *                                                  Call once at UI init for games that
 *                                                  render their own quiz HTML but still
 *                                                  want the shared badge / word / grid CSS.
 */

// ─── STYLES ───────────────────────────────────────────────────────────────────

function _injectStyles() {
    if (document.getElementById('gvm-styles')) return;
    const style = document.createElement('style');
    style.id = 'gvm-styles';
    style.textContent = `
        /* ── Overlay backdrop ───────────────────────────────────────────────── */
        .gvm-overlay {
            position: absolute; inset: 0;
            background: rgba(0,0,0,0.88);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000; padding: 20px;
            backdrop-filter: blur(6px);
            pointer-events: auto; /* opt back in — parent ui-layer has pointer-events:none */
        }
        /* ── Modal shell ────────────────────────────────────────────────────── */
        .gvm-modal {
            background: var(--surface-color, #1e1e2e);
            border-radius: 16px;
            width: 100%; max-width: 420px;
            padding: 22px 20px 28px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06);
            display: flex; flex-direction: column; gap: 14px;
            text-align: center;
            color: var(--text-main, #eee);
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
        /* Review-type badge variants.
         * showGameQuiz picks the correct class automatically from challenge.type.
         * Games never need to set these manually.
         *
         *   gvm-badge-real   → scheduled SRS review           (green)
         *   gvm-badge-new    → first time seeing this word     (blue)
         *   gvm-badge-drill  → not yet due, reinforcing        (yellow)
         *   gvm-badge-leech  → repeatedly missed word          (red)
         *   gvm-badge-free   → no cards due; correct skips SRS (rainbow)
         */
        .gvm-badge-real  { background:rgba(39,174,96,0.15);  color:#2ecc71; border:1px solid rgba(39,174,96,0.4); }
        .gvm-badge-new   { background:rgba(52,152,219,0.15); color:#3498db; border:1px solid rgba(52,152,219,0.4); }
        .gvm-badge-drill { background:rgba(241,196,15,0.15); color:#f1c40f; border:1px solid rgba(241,196,15,0.4); }
        .gvm-badge-leech { background:rgba(192,57,43,0.15);  color:#e74c3c; border:1px solid rgba(192,57,43,0.4); }
        .gvm-badge-free {
            background: linear-gradient(90deg,
                rgba(255,100,100,0.15), rgba(255,200,50,0.15),
                rgba(80,220,120,0.15),  rgba(80,160,255,0.15));
            border: 1px solid rgba(180,180,255,0.35);
            color: #bbb;
            background-size: 200% 100%;
            animation: gvmRainbowShift 3s linear infinite;
        }
        @keyframes gvmRainbowShift {
            0%   { background-position:0% 50%; }
            100% { background-position:200% 50%; }
        }
        /* ── Title / subtitle ───────────────────────────────────────────────── */
        .gvm-title    { margin:0; font-size:20px; font-weight:800; letter-spacing:-0.3px; }
        .gvm-subtitle { margin:0; font-size:13px; color:var(--text-muted,#888); line-height:1.4; }
        /* ── Word block ─────────────────────────────────────────────────────── */
        .gvm-word-block { text-align:center; padding:6px 0; }
        .gvm-kanji { font-size:52px; font-weight:900; color:var(--text-main,#eee); line-height:1.1; letter-spacing:-1px; }
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
            border:2px solid var(--border-color,#444);
            background:var(--bg-color,#151520); color:var(--text-main,#eee);
            font-size:13px; font-weight:600; cursor:pointer;
            transition:all 0.12s; line-height:1.3;
        }
        .gvm-btn:hover:not(:disabled) {
            border-color:var(--primary-color,#4A90E2);
            background:rgba(255,255,255,0.04);
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
    `;
    document.head.appendChild(style);
}

/** Public export — inject GVM styles without importing the full quiz components. */
export function injectVocabBadgeStyles() { _injectStyles(); }

/**
 * Returns a human-readable label for a pool source value.
 * Use this instead of hardcoding labels in game files.
 *
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
 * Suitable for an infobox or subtitle next to the source label.
 *
 * @param {'srs'|'custom'|'mixed'} poolSource
 * @returns {string}
 */
export function poolSourceDescription(poolSource) {
    return {
        srs:    'Live SRS reviews — answers update your real flashcard schedule.',
        custom: 'Local SM-2 — progress is self-contained and exported at session end.',
        mixed:  'SRS + custom deck — all answers update your real flashcard schedule.',
    }[poolSource] ?? '';
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const TYPE_BADGE = {
    due:    { cls: 'gvm-badge-real',  label: '🟢 Review'     },
    new:    { cls: 'gvm-badge-new',   label: '🔵 New Word'   },
    drill:  { cls: 'gvm-badge-drill', label: '🟡 Drill'      },
    leech:  { cls: 'gvm-badge-leech', label: '🩸 Leech'      },
    free:   { cls: 'gvm-badge-free',  label: '🌈 Free Review' },
    random: { cls: 'gvm-badge-real',  label: '🟢 Review'     },
};
function _badgeFor(type) { return TYPE_BADGE[type] ?? TYPE_BADGE.due; }

function _gridCols(n) {
    if (n <= 3)  return '1fr';
    if (n === 4) return '1fr 1fr';
    if (n <= 6)  return '1fr 1fr 1fr';
    if (n <= 8)  return '1fr 1fr 1fr 1fr';
    if (n === 9) return '1fr 1fr 1fr';
    return '1fr 1fr 1fr 1fr';
}

// ─── showGameQuiz ─────────────────────────────────────────────────────────────

/**
 * The central, reusable quiz window for all games.
 *
 * Renders inside options.container as a full-screen overlay containing:
 *   • A badge pill that automatically reflects the review type
 *     (due → green, new → blue, drill → yellow, leech → red, free → rainbow)
 *   • An injectable title and subtitle — every game supplies its own flavour text
 *   • Optional progress dots for multi-step sequences
 *   • The word block (kanji + furigana)
 *   • An answer grid
 *   • Flash feedback on answer, then overlay removal
 *
 * ── Usage examples ────────────────────────────────────────────────────────────
 *
 * Survivor — level-up quiz:
 *   showGameQuiz(vocabMgr, {
 *       container:  uiLayerEl,
 *       title:      (isFree) => isFree ? 'Free Practice'  : 'Clash of Wills',
 *       titleColor: (isFree) => isFree ? 'var(--text-muted)' : '#f1c40f',
 *       subtitle:   (isFree) => isFree
 *                       ? 'No cards due — correct answers won\'t update your interval.'
 *                       : 'Answer correctly to choose a power-up!',
 *       onAnswer: (isCorrect, wordObj, result) => { ... },
 *   });
 *
 * NekoNihongo — calm the cat:
 *   showGameQuiz(vocabMgr, {
 *       container: gameEl,
 *       title:     'Calm the Cat',
 *       subtitle:  'Answer correctly to restore purr points!',
 *       onAnswer:  (isCorrect) => { ... },
 *   });
 *
 * ── Parameters ────────────────────────────────────────────────────────────────
 *
 * @param {GameVocabManager} vocabMgr
 * @param {Object}  options
 *
 * @param {HTMLElement}       options.container
 *   DOM element the overlay is appended to.
 *
 * @param {string|Function}   [options.title]
 *   String, or (isFree, type) => string.
 *   Defaults to the badge label (e.g. "🟢 Review").
 *
 * @param {string|Function}   [options.titleColor]
 *   CSS colour string, or (isFree, type) => cssString.
 *   Defaults to var(--text-main).
 *
 * @param {string|Function}   [options.subtitle]
 *   String, or (isFree, type) => string.
 *   When omitted and isFree, defaults to a standard free-review explanation.
 *   Pass '' to suppress the subtitle entirely.
 *
 * @param {boolean}           [options.showFurigana=true]
 *
 * @param {number}            [options.optionCount=4]
 *   Answer choices requested.  Actual count may be less if the pool is small.
 *
 * @param {string}            [options.forceMode]
 *   Passed straight to vocabMgr.getNextWord() to override the scheduling mode.
 *
 * @param {number[]|null}     [options.dots]
 *   Progress dot states: 1 = filled/correct, -1 = failed, 0 = pending.
 *   Pass an array of length N to render N dots above the word block.
 *   Example (step 1 done correctly, 2 steps pending): [1, 0, 0]
 *
 * @param {Function}          [options.onAnswer]
 *   (isCorrect: boolean, wordObj: Object, result: Object) => void
 *   Called after the flash animation and overlay removal.
 *
 * @param {Function}          [options.onEmpty]
 *   () => void — called instead of onAnswer when the pool is exhausted.
 *
 * @returns {{ challenge, overlay } | null}
 */
export function showGameQuiz(vocabMgr, options = {}) {
    _injectStyles();

    const optionCount  = options.optionCount  ?? 4;
    const showFurigana = options.showFurigana !== false;

    const challenge = vocabMgr.getNextWord(options.forceMode ?? null, optionCount);
    if (!challenge) {
        if (options.onEmpty)  options.onEmpty();
        else if (options.onAnswer) options.onAnswer(true, null, null);
        return null;
    }

    const { wordObj, options: answerOpts, correctIdx, type } = challenge;
    const isFree = type === 'free';

    // ── Resolve injectable text ───────────────────────────────────────────────
    const resolve = (v) => typeof v === 'function' ? v(isFree, type) : v;

    const badge      = _badgeFor(type);
    const title      = resolve(options.title)      ?? badge.label;
    const titleColor = resolve(options.titleColor) ?? 'var(--text-main, #eee)';
    const subtitle   = options.subtitle !== undefined
        ? resolve(options.subtitle)
        : (isFree ? 'No cards due — correct answers won\'t update your SRS interval.' : '');

    // ── Progress dots ─────────────────────────────────────────────────────────
    const dotsHtml = options.dots
        ? `<div class="gvm-seq-dots">${options.dots.map(s =>
              `<div class="gvm-dot${s === 1 ? ' filled' : s === -1 ? ' failed' : ''}"></div>`
          ).join('')}</div>`
        : '';

    // ── Render ────────────────────────────────────────────────────────────────
    const cols = _gridCols(answerOpts.length);

    const overlay = document.createElement('div');
    overlay.className = 'gvm-overlay';
    overlay.innerHTML = `
        <div class="gvm-modal">
            <div class="gvm-badge ${badge.cls}">${badge.label}</div>
            <h3 class="gvm-title" style="color:${titleColor};">${title}</h3>
            ${subtitle ? `<p class="gvm-subtitle">${subtitle}</p>` : ''}
            ${dotsHtml}
            <div class="gvm-word-block">
                <div class="gvm-furi">${showFurigana && wordObj.kana !== wordObj.kanji ? wordObj.kana : ''}</div>
                <div class="gvm-kanji">${wordObj.kanji}</div>
            </div>
            <div class="gvm-grid" style="grid-template-columns:${cols};">
                ${answerOpts.map((opt, i) =>
                    `<button class="gvm-btn" data-idx="${i}">${opt}</button>`
                ).join('')}
            </div>
        </div>
    `;

    options.container.appendChild(overlay);

    // ── Wire answer buttons ───────────────────────────────────────────────────
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

            setTimeout(() => {
                overlay.remove();
                if (options.onAnswer) options.onAnswer(isCorrect, wordObj, result);
            }, isCorrect ? 600 : 1200);
        });
    });

    return { challenge, overlay };
}

// ─── showStandardQuiz ─────────────────────────────────────────────────────────

/**
 * Thin wrapper around showGameQuiz for games that don't need custom flavour text.
 * The badge, free-review subtitle, and type indicator are all automatic.
 *
 * @param {GameVocabManager} vocabMgr
 * @param {Object}  options
 * @param {HTMLElement}  options.container
 * @param {boolean}      [options.showFurigana=true]
 * @param {Function}     options.onAnswer  - (isCorrect, wordObj, result) => void
 * @param {string}       [options.title]
 * @param {string}       [options.forceMode]
 * @param {number}       [options.optionCount=4]
 */
export function showStandardQuiz(vocabMgr, options) {
    showGameQuiz(vocabMgr, options);
}

// ─── showQuizSequence ─────────────────────────────────────────────────────────

/**
 * Multi-question sequence that drives showGameQuiz once per step.
 * Progress dots update automatically after each answer.
 *
 * @param {GameVocabManager}  vocabMgr
 * @param {number}            count           - Total questions in the sequence.
 * @param {Object}            options
 * @param {HTMLElement}       options.container
 * @param {string|Function}   [options.title]
 * @param {string|Function}   [options.titleColor]
 * @param {string|Function}   [options.subtitle]
 * @param {boolean}           [options.showFurigana=true]
 * @param {number}            [options.optionCount=4]
 * @param {string}            [options.forceMode]
 * @param {Function}          options.onComplete
 *   (successCount: number, failCount: number) => void
 * @param {Function}          [options.onStepAnswer]
 *   (isCorrect, wordObj, result, stepIndex) => void
 *   Called after each individual answer — useful for per-step game reactions.
 */
export function showQuizSequence(vocabMgr, count, options) {
    let step         = 0;
    const stepStates = Array(count).fill(0); // 0=pending  1=correct  -1=wrong

    function next() {
        if (step >= count) {
            const successes = stepStates.filter(s => s === 1).length;
            if (options.onComplete) options.onComplete(successes, count - successes);
            return;
        }

        showGameQuiz(vocabMgr, {
            container:    options.container,
            title:        options.title,
            titleColor:   options.titleColor,
            subtitle:     options.subtitle,
            showFurigana: options.showFurigana,
            optionCount:  options.optionCount,
            forceMode:    options.forceMode,
            dots:         [...stepStates],   // snapshot so this render shows current state
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
 * Injects into a provided container element — not a modal.
 *
 * @param {GameVocabManager} vocabMgr
 * @param {HTMLElement} container
 * @param {Function} onSave - Callback triggered when the player hits Save
 * @param {'srs'|'custom'|'mixed'} [poolSource='custom']
 *   The active pool source, as tracked by the game (e.g. survivor's _poolSource).
 *   This is the authoritative input for what to grey out and what notice to show:
 *     'srs'    → Global App SRS Active; Learning Mode greyed out (SRS controls scheduling)
 *     'mixed'  → Mixed Pool Active; Learning Mode active
 *     'custom' → Local SM-2 active; all settings editable
 *   Default is 'custom' so games that don't pass a source get the fully-editable view.
 */
export function renderVocabSettings(vocabMgr, container, onSave, poolSource = 'custom') {
    _injectStyles();

    const cfg       = vocabMgr.config;
    const isSrs     = poolSource === 'srs';
    const isMixed   = poolSource === 'mixed';
    const isCustom  = poolSource === 'custom';
    // Learning Mode is only meaningful when the game's own SM-2 engine controls scheduling.
    // For pure SRS the SRS DB controls order; greying it out prevents confusing the player.
    const isSrsOnly = isSrs;

    const modeLabels = { auto: '🤖 Auto', manual: '📋 SRS Order', random: '🎲 Random' };
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
        <div style="display:flex; flex-direction:column; gap:14px; font-size:13px;">

            <!-- Pool source infobox — always visible, summarises what mode is active -->
            <div style="display:flex; align-items:center; gap:10px; padding:10px 12px;
                        background:${isSrs ? 'rgba(74,144,226,0.08)' : isMixed ? 'rgba(155,89,182,0.08)' : 'rgba(39,174,96,0.08)'};
                        border:1px solid ${isSrs ? 'var(--primary-color,#4A90E2)' : isMixed ? 'rgba(155,89,182,0.5)' : 'rgba(39,174,96,0.4)'};
                        border-radius:8px; font-size:12px; color:var(--text-main,#333);">
                <div style="font-size:22px; flex-shrink:0;">${isSrs ? '🌍' : isMixed ? '🔀' : '📦'}</div>
                <div>
                    <strong>${isSrs ? 'Global SRS' : isMixed ? 'Mixed Pool' : 'Custom Deck'}</strong>
                    <div style="color:var(--text-muted,#888); margin-top:2px; line-height:1.4;">
                        ${poolSourceDescription(poolSource)}
                    </div>
                </div>
            </div>

            <!-- Mode (greyed out when SRS-only) -->
            <div class="gvm-settings-row" style="flex-direction:column; align-items:flex-start; gap:8px;
                 ${isSrsOnly ? 'opacity:0.45; pointer-events:none;' : ''}">
                <strong>🧠 Learning Mode ${isSrsOnly ? '<span style="font-size:10px;font-weight:normal;color:var(--text-muted,#888);margin-left:4px;">(controlled by SRS)</span>' : ''}</strong>
                <div style="display:flex; gap:8px; flex-wrap:wrap;" id="gvm-mode-btns">
                    ${renderModeButtons()}
                </div>
                <div id="gvm-mode-desc" style="font-size:11px; color:var(--text-muted,#888);">
                    ${isSrsOnly ? 'Your SRS schedule controls which words appear. Mode selection is only relevant when mixing SRS with custom decks.' : modeDescs[cfg.mode]}
                </div>
            </div>

            <!-- New-word introduction — threshold + two batch sizes -->
            <div class="gvm-settings-row" id="gvm-row-batch">
                <div>
                    <strong>📚 Bootstrap Threshold</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">
                        While fewer than this many words are active, use the bootstrap batch size.
                    </div>
                </div>
                <input type="number" id="gvm-cfg-threshold" class="gvm-settings-input"
                       value="${cfg.newWordThreshold ?? 10}" min="1" max="50">
            </div>
            <div class="gvm-settings-row" id="gvm-row-batch-bootstrap">
                <div>
                    <strong>➕ Bootstrap Batch</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">
                        New words introduced at once when below the threshold (fast ramp-up).
                    </div>
                </div>
                <input type="number" id="gvm-cfg-batch-bootstrap" class="gvm-settings-input"
                       value="${cfg.newWordBatchBootstrap ?? 5}" min="5" max="10">
            </div>
            <div class="gvm-settings-row" id="gvm-row-batch-normal">
                <div>
                    <strong>➕ Normal Batch</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">
                        New words introduced at once when at or above the threshold (steady pace).
                    </div>
                </div>
                <input type="number" id="gvm-cfg-batch-normal" class="gvm-settings-input"
                       value="${cfg.newWordBatchNormal ?? 1}" min="1" max="5">
            </div>

            <!-- Auto-only thresholds -->
            <div id="gvm-auto-only">
                <div class="gvm-settings-row">
                    <div>
                        <strong>⏱️ Idle Time Before New Word</strong>
                        <div style="font-size:11px; color:var(--text-muted,#888);">Seconds with no due cards before auto-introducing (auto mode only).</div>
                    </div>
                    <input type="number" id="gvm-cfg-duetime" class="gvm-settings-input"
                           value="${cfg.autoThresholds.minDueTime}" min="5" max="120">
                </div>
                <div class="gvm-settings-row">
                    <div>
                        <strong>🎯 Min Accuracy for New Words</strong>
                        <div style="font-size:11px; color:var(--text-muted,#888);">Recent accuracy % required before auto-introducing (auto mode only).</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <input type="number" id="gvm-cfg-accuracy" class="gvm-settings-input"
                               value="${Math.round(cfg.autoThresholds.minAccuracy * 100)}" min="50" max="100">
                        <span style="color:var(--text-muted,#888);">%</span>
                    </div>
                </div>
            </div>

            <!-- Local-only SM-2 parameters (hidden for pure SRS — DB controls scheduling) -->
            ${isCustom || isMixed ? `
            <div class="gvm-settings-row">
                <div>
                    <strong>🩸 Leech Threshold</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">Wrong answers before a word is quarantined.</div>
                </div>
                <input type="number" id="gvm-cfg-leech" class="gvm-settings-input"
                       value="${cfg.leechThreshold}" min="5" max="50">
            </div>
            <div class="gvm-settings-row">
                <div>
                    <strong>⏱️ Initial Interval</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">Seconds before a newly learned word reappears.</div>
                </div>
                <input type="number" id="gvm-cfg-interval" class="gvm-settings-input"
                       value="${cfg.initialInterval}" min="2" max="300">
            </div>
            <div class="gvm-settings-row">
                <div>
                    <strong>📐 Ease Factor</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">Interval growth multiplier. Higher = faster spacing.</div>
                </div>
                <input type="number" id="gvm-cfg-ease" class="gvm-settings-input"
                       step="0.1" value="${cfg.initialEase}" min="1.3" max="3.0">
            </div>` : ''}

            <button id="gvm-btn-save" style="padding:12px; background:var(--primary-color,#4A90E2);
                    color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">
                💾 Save Settings
            </button>
        </div>
    `;

    // ── Mode toggle ───────────────────────────────────────────────────────────
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

    // ── Save ──────────────────────────────────────────────────────────────────
    container.querySelector('#gvm-btn-save').addEventListener('click', () => {
        vocabMgr.config.mode = selectedMode;

        const threshold = parseInt(container.querySelector('#gvm-cfg-threshold')?.value);
        if (threshold >= 1) vocabMgr.config.newWordThreshold = threshold;

        const batchBootstrap = parseInt(container.querySelector('#gvm-cfg-batch-bootstrap')?.value);
        if (batchBootstrap >= 1) vocabMgr.config.newWordBatchBootstrap = batchBootstrap;

        const batchNormal = parseInt(container.querySelector('#gvm-cfg-batch-normal')?.value);
        if (batchNormal >= 1) vocabMgr.config.newWordBatchNormal = batchNormal;

        const dueTime = parseInt(container.querySelector('#gvm-cfg-duetime')?.value);
        if (dueTime >= 5) vocabMgr.config.autoThresholds.minDueTime = dueTime;

        const accPct = parseInt(container.querySelector('#gvm-cfg-accuracy')?.value);
        if (accPct >= 50 && accPct <= 100) vocabMgr.config.autoThresholds.minAccuracy = accPct / 100;

        if (isCustom || isMixed) {
            const leech = parseInt(container.querySelector('#gvm-cfg-leech')?.value);
            if (leech >= 5) vocabMgr.config.leechThreshold = leech;

            const interval = parseInt(container.querySelector('#gvm-cfg-interval')?.value);
            if (interval >= 2) vocabMgr.config.initialInterval = interval;

            const ease = parseFloat(container.querySelector('#gvm-cfg-ease')?.value);
            if (ease >= 1.3) vocabMgr.config.initialEase = ease;
        }

        // Call onSave with the full updated config snapshot so callers don't have
        // to enumerate fields manually. Shape matches GameVocabManager.defaultConfig()
        // plus autoThresholds flattened for easy persistence.
        if (onSave) onSave({
            mode:                  vocabMgr.config.mode,
            newWordThreshold:      vocabMgr.config.newWordThreshold,
            newWordBatchBootstrap: vocabMgr.config.newWordBatchBootstrap,
            newWordBatchNormal:    vocabMgr.config.newWordBatchNormal,
            minDueTime:            vocabMgr.config.autoThresholds.minDueTime,
            minAccuracy:           vocabMgr.config.autoThresholds.minAccuracy,
            leechThreshold:        vocabMgr.config.leechThreshold,
            initialInterval:       vocabMgr.config.initialInterval,
            initialEase:           vocabMgr.config.initialEase,
        });
    });
}