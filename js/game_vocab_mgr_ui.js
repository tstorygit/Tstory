/**
 * game_vocab_mgr_ui.js — Standardized quiz UI components for GameVocabManager
 *
 * Drop-in UI layer for any game that uses GameVocabManager.  All components
 * are self-contained: they create their own overlay, wire up events, call
 * vocabMgr.getNextWord() / gradeWord() internally, then invoke a callback.
 *
 * Exported functions:
 *   showStandardQuiz(vocabMgr, options)          — Single flashcard question in a modal.
 *   showQuizSequence(vocabMgr, count, options)   — Multi-question sequence (e.g. Boss Chest).
 *   renderVocabSettings(vocabMgr, container, cb) — Settings panel injected into a container.
 */

function _injectStyles() {
    if (document.getElementById('gvm-styles')) return;
    const style = document.createElement('style');
    style.id = 'gvm-styles';
    style.textContent = `
        .gvm-overlay {
            position: absolute; inset: 0;
            background: rgba(0, 0, 0, 0.85);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000; padding: 20px;
            backdrop-filter: blur(4px);
        }
        .gvm-modal {
            background: var(--surface-color, #ffffff);
            border-radius: 16px;
            width: 100%; max-width: 480px;
            padding: 24px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            display: flex; flex-direction: column; gap: 16px;
            text-align: center;
            color: var(--text-main, #333);
            animation: gvmPopIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes gvmPopIn {
            0% { opacity: 0; transform: scale(0.85); }
            100% { opacity: 1; transform: scale(1); }
        }
        .gvm-header {
            font-size: 14px; font-weight: bold; color: var(--primary-color, #4A90E2);
            text-transform: uppercase; letter-spacing: 1px;
        }
        .gvm-kanji {
            font-size: 42px; font-weight: bold; margin: 10px 0;
            color: var(--text-main, #333);
        }
        .gvm-furi {
            font-size: 14px; color: var(--text-muted, #888); min-height: 20px;
        }
        .gvm-grid {
            display: grid;
            /* columns set dynamically via inline style based on actual option count */
            gap: 10px;
        }
        .gvm-btn {
            background: var(--bg-color, #f4f6f8);
            border: 2px solid var(--border-color, #e0e0e0);
            padding: 12px 8px; border-radius: 10px;
            font-size: 13px; font-weight: bold; cursor: pointer;
            color: var(--text-main, #333);
            transition: all 0.15s;
            line-height: 1.3;
        }
        .gvm-btn:hover:not(:disabled) {
            border-color: var(--primary-color, #4A90E2);
            background: rgba(74, 144, 226, 0.05);
            transform: translateY(-2px);
        }
        .gvm-btn:active:not(:disabled) { transform: scale(0.96); }
        .gvm-btn.correct {
            background: #27ae60 !important; color: white !important; border-color: #2ecc71 !important;
        }
        .gvm-btn.wrong {
            background: #c0392b !important; color: white !important; border-color: #e74c3c !important;
            animation: gvmShake 0.4s;
        }
        @keyframes gvmShake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-4px); }
            40%, 80% { transform: translateX(4px); }
        }
        .gvm-seq-dots {
            display: flex; justify-content: center; gap: 8px; margin-bottom: 10px;
        }
        .gvm-dot {
            width: 14px; height: 14px; border-radius: 50%;
            border: 2px solid var(--border-color, #ccc);
            transition: all 0.3s;
        }
        .gvm-dot.filled { background: #27ae60; border-color: #2ecc71; box-shadow: 0 0 8px rgba(46,204,113,0.6); }
        .gvm-dot.failed { background: #c0392b; border-color: #e74c3c; box-shadow: 0 0 8px rgba(231,76,60,0.6); }

        /* ── Review-type badge pills ─────────────────────────────────────────────
         * These are shared across ALL games that use GameVocabManager.
         * gvm-badge-real  → a scheduled SRS review (green dot indicator)
         * gvm-badge-rainbow → a free/bonus review (no due cards; correct won't update interval)
         * Games can apply these classes to any badge element they render.
         */
        .gvm-badge-real {
            background: rgba(39,174,96,0.15);
            color: #2ecc71;
            border: 1px solid rgba(39,174,96,0.4);
        }
        .gvm-badge-rainbow {
            background: linear-gradient(90deg,
                rgba(255,100,100,0.15), rgba(255,200,50,0.15),
                rgba(80,220,120,0.15), rgba(80,160,255,0.15));
            border: 1px solid rgba(180,180,255,0.35);
            color: #ccc;
            background-size: 200% 100%;
            animation: gvm-rainbow-shift 3s linear infinite;
        }
        @keyframes gvm-rainbow-shift {
            0%   { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
        }

        /* Settings Styles */
        .gvm-settings-row {
            display: flex; justify-content: space-between; align-items: center;
            padding: 10px 0; border-bottom: 1px solid var(--border-color, #eee);
            text-align: left;
        }
        .gvm-settings-input {
            width: 60px; padding: 6px; border: 1px solid var(--border-color, #ccc);
            border-radius: 4px; text-align: center; background: var(--bg-color, #fff);
            color: var(--text-main, #333); font-weight: bold;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Public export so games with custom quiz UIs (e.g. Survivor) can inject the
 * shared review-type badge styles (gvm-badge-rainbow, gvm-badge-real) without
 * importing the full quiz component.
 *
 * Call once at game UI init time — safe to call multiple times (idempotent).
 */
export function injectVocabBadgeStyles() {
    _injectStyles(); // _injectStyles is already idempotent via the #gvm-styles guard
}

/**
 *
 * Layout rules:
 *   2        → 1×2  (single column, stacked)
 *   3        → 1×3
 *   4        → 2×2  (classic quad)
 *   5        → 2+3  — not perfectly even; use 3 cols, last row partial (CSS handles it)
 *   6        → 3×2
 *   7–8      → 4 cols (4+4 or 4+3+1)
 *   9        → 3×3
 *   10–12    → 4 cols
 *   13+      → 4 cols (cap — beyond this buttons are too small)
 *
 * Returns a CSS grid-template-columns string like "1fr 1fr 1fr".
 */
function _gridCols(n) {
    if (n <= 1)  return '1fr';
    if (n <= 3)  return '1fr';              // single column for 2–3: easier to read
    if (n === 4) return '1fr 1fr';          // classic 2×2
    if (n === 5) return '1fr 1fr 1fr';     // 3 cols, last row has 2
    if (n === 6) return '1fr 1fr 1fr';     // 3×2
    if (n <= 8)  return '1fr 1fr 1fr 1fr'; // 4 cols
    if (n === 9) return '1fr 1fr 1fr';     // 3×3
    return '1fr 1fr 1fr 1fr';              // 4 cols for 10+
}

/** Renders the answer button HTML for a given options array. */
function _renderOptionButtons(options) {
    return options
        .map((opt, i) => `<button class="gvm-btn" data-idx="${i}">${opt}</button>`)
        .join('');
}

/**
 * Shows a flashcard modal with a configurable number of answer choices.
 *
 * @param {GameVocabManager} vocabMgr
 * @param {Object}  options
 * @param {HTMLElement} options.container    - DOM element to append the overlay to.
 * @param {boolean}     options.showFurigana - Whether to show the kana reading.
 * @param {Function}    options.onAnswer     - Callback: (isCorrect, wordData, result) => void
 * @param {string}      [options.title]      - Custom header text.
 * @param {string}      [options.forceMode]  - Override vocabMgr mode ('leech', 'due', etc.)
 * @param {number}      [options.optionCount=4] - Total answer choices to show (min 2).
 *                                               Actual count may be lower if the pool is small.
 */
export function showStandardQuiz(vocabMgr, options) {
    _injectStyles();

    const optionCount = options.optionCount ?? 4;
    const challenge   = vocabMgr.getNextWord(options.forceMode, optionCount);
    if (!challenge) {
        if (options.onAnswer) options.onAnswer(true, null, null);
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'gvm-overlay';

    const TYPE_ICON = { due: '🟢', new: '🔵', leech: '🩸', drill: '🟡', free: '🌈' };
    const dotClass  = TYPE_ICON[challenge.type] ?? '⚪';
    const cols     = _gridCols(challenge.options.length);

    overlay.innerHTML = `
        <div class="gvm-modal">
            <div class="gvm-header">${options.title || 'Vocabulary Challenge'} ${dotClass}</div>
            <div>
                <div class="gvm-furi">${options.showFurigana ? challenge.wordObj.kana : ''}</div>
                <div class="gvm-kanji">${challenge.wordObj.kanji}</div>
            </div>
            <div class="gvm-grid" style="grid-template-columns: ${cols};">
                ${_renderOptionButtons(challenge.options)}
            </div>
        </div>
    `;

    options.container.appendChild(overlay);

    const buttons = overlay.querySelectorAll('.gvm-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const isCorrect = parseInt(btn.dataset.idx) === challenge.correctIdx;

            buttons.forEach(b => b.disabled = true);
            btn.classList.add(isCorrect ? 'correct' : 'wrong');

            if (!isCorrect) {
                const correctBtn = overlay.querySelector(`.gvm-btn[data-idx="${challenge.correctIdx}"]`);
                if (correctBtn) correctBtn.classList.add('correct');
            }

            const result = vocabMgr.gradeWord(challenge.refId, isCorrect);

            setTimeout(() => {
                overlay.remove();
                if (options.onAnswer) options.onAnswer(isCorrect, challenge.wordObj, result);
            }, isCorrect ? 600 : 1200);
        });
    });
}

/**
 * Shows a sequence of quizzes (e.g. a Boss Chest requiring 3 correct answers).
 *
 * @param {GameVocabManager} vocabMgr
 * @param {number}  count   - How many questions to ask in the sequence.
 * @param {Object}  options - Same as showStandardQuiz, plus:
 * @param {Function}    options.onComplete   - Callback: (successCount, failCount) => void
 * @param {number}      [options.optionCount=4] - Answer choices per question.
 */
export function showQuizSequence(vocabMgr, count, options) {
    _injectStyles();

    const optionCount = options.optionCount ?? 4;
    let currentStep  = 0;
    let successCount = 0;
    const stepResults = []; // true = correct, false = wrong, for each completed step

    const overlay = document.createElement('div');
    overlay.className = 'gvm-overlay';
    options.container.appendChild(overlay);

    function nextQuestion() {
        if (currentStep >= count) {
            overlay.remove();
            if (options.onComplete) options.onComplete(successCount, count - successCount);
            return;
        }

        const challenge = vocabMgr.getNextWord(options.forceMode, optionCount);
        if (!challenge) {
            overlay.remove();
            if (options.onComplete) options.onComplete(successCount, count - successCount);
            return;
        }

        const dotsHtml = Array.from({ length: count }, (_, i) => {
            let state = '';
            if (i < stepResults.length) state = stepResults[i] ? 'filled' : 'failed';
            return `<div class="gvm-dot ${state}"></div>`;
        }).join('');

        const cols = _gridCols(challenge.options.length);

        overlay.innerHTML = `
            <div class="gvm-modal">
                <div class="gvm-header">${options.title || 'Challenge Sequence'}</div>
                <div class="gvm-seq-dots">${dotsHtml}</div>
                <div>
                    <div class="gvm-furi">${options.showFurigana ? challenge.wordObj.kana : ''}</div>
                    <div class="gvm-kanji">${challenge.wordObj.kanji}</div>
                </div>
                <div class="gvm-grid" style="grid-template-columns: ${cols};">
                    ${_renderOptionButtons(challenge.options)}
                </div>
            </div>
        `;

        const buttons = overlay.querySelectorAll('.gvm-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const isCorrect = parseInt(btn.dataset.idx) === challenge.correctIdx;
                buttons.forEach(b => b.disabled = true);

                btn.classList.add(isCorrect ? 'correct' : 'wrong');
                if (!isCorrect) {
                    const correctBtn = overlay.querySelector(`.gvm-btn[data-idx="${challenge.correctIdx}"]`);
                    if (correctBtn) correctBtn.classList.add('correct');
                }

                vocabMgr.gradeWord(challenge.refId, isCorrect);

                if (isCorrect) successCount++;
                stepResults.push(isCorrect);
                currentStep++;

                setTimeout(nextQuestion, isCorrect ? 600 : 1200);
            });
        });
    }

    nextQuestion();
}

/**
 * Generates the HTML for a settings menu to configure the VocabManager.
 * Does not display it as a modal; it injects it into a provided container.
 * Works for both Local and Global SRS modes.
 *
 * @param {GameVocabManager} vocabMgr
 * @param {HTMLElement} container
 * @param {Function} onSave - Callback triggered when settings are saved
 */
export function renderVocabSettings(vocabMgr, container, onSave) {
    _injectStyles();

    const cfg = vocabMgr.config;
    const isSrsOnly = vocabMgr.isGlobalSrs && !vocabMgr._hasCustomWords;

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

            ${vocabMgr.isGlobalSrs ? `
            <div style="padding:10px 12px; background:rgba(74,144,226,0.1);
                        border:1px solid var(--primary-color,#4A90E2); border-radius:8px;
                        font-size:12px; color:var(--text-main,#333); text-align:center;">
                <div style="font-size:20px; margin-bottom:4px;">🌍</div>
                <strong>${vocabMgr._hasCustomWords ? 'Mixed Pool Active' : 'Global App SRS Active'}</strong><br>
                ${vocabMgr._hasCustomWords
                    ? 'SRS words use your real review schedule. Custom deck words use local SM-2. Answers for SRS words affect your main flashcard reviews.'
                    : 'Answers here affect your main flashcard reviews. 🌈 = free review (no due cards — correct answers won\'t update intervals).'
                }
            </div>` : ''}

            <!-- Mode (greyed out when SRS-only — SRS controls scheduling) -->
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

            <!-- Batch size (all non-random modes) -->
            <div class="gvm-settings-row" id="gvm-row-batch">
                <div>
                    <strong>➕ Words per Batch</strong>
                    <div style="font-size:11px; color:var(--text-muted,#888);">
                        How many new words are introduced at once.
                    </div>
                </div>
                <input type="number" id="gvm-cfg-batch" class="gvm-settings-input"
                       value="${cfg.autoNewWordBatchSize}" min="1" max="5">
            </div>

            <!-- Auto-only thresholds -->
            <div id="gvm-auto-only">
                <div class="gvm-settings-row">
                    <div>
                        <strong>⏱️ Idle Time Before New Word</strong>
                        <div style="font-size:11px; color:var(--text-muted,#888);">
                            Seconds with no due cards before auto-introducing (auto mode only).
                        </div>
                    </div>
                    <input type="number" id="gvm-cfg-duetime" class="gvm-settings-input"
                           value="${cfg.autoThresholds.minDueTime}" min="5" max="120">
                </div>
                <div class="gvm-settings-row">
                    <div>
                        <strong>🎯 Min Accuracy for New Words</strong>
                        <div style="font-size:11px; color:var(--text-muted,#888);">
                            Recent accuracy % required before auto-introducing (auto mode only).
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <input type="number" id="gvm-cfg-accuracy" class="gvm-settings-input"
                               value="${Math.round(cfg.autoThresholds.minAccuracy * 100)}" min="50" max="100">
                        <span style="color:var(--text-muted,#888);">%</span>
                    </div>
                </div>
            </div>

            <!-- Local-only SM-2 parameters -->
            ${!vocabMgr.isGlobalSrs ? `
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

    // ── Mode toggle live behaviour ────────────────────────────────────────────
    let selectedMode = cfg.mode;

    const syncVisibility = (mode) => {
        selectedMode = mode;
        const isRandom = mode === 'random';
        const isAuto   = mode === 'auto';
        container.querySelector('#gvm-row-batch').style.display = isRandom ? 'none' : '';
        container.querySelector('#gvm-auto-only').style.display = isAuto   ? ''     : 'none';
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

    // ── Save ─────────────────────────────────────────────────────────────────
    container.querySelector('#gvm-btn-save').addEventListener('click', () => {
        vocabMgr.config.mode = selectedMode;

        const batch = parseInt(container.querySelector('#gvm-cfg-batch')?.value);
        if (batch >= 1 && batch <= 5) vocabMgr.config.autoNewWordBatchSize = batch;

        const dueTime = parseInt(container.querySelector('#gvm-cfg-duetime')?.value);
        if (dueTime >= 5) vocabMgr.config.autoThresholds.minDueTime = dueTime;

        const accPct = parseInt(container.querySelector('#gvm-cfg-accuracy')?.value);
        if (accPct >= 50 && accPct <= 100) vocabMgr.config.autoThresholds.minAccuracy = accPct / 100;

        if (!vocabMgr.isGlobalSrs) {
            const leech = parseInt(container.querySelector('#gvm-cfg-leech')?.value);
            if (leech >= 5) vocabMgr.config.leechThreshold = leech;

            const interval = parseInt(container.querySelector('#gvm-cfg-interval')?.value);
            if (interval >= 2) vocabMgr.config.initialInterval = interval;

            const ease = parseFloat(container.querySelector('#gvm-cfg-ease')?.value);
            if (ease >= 1.3) vocabMgr.config.initialEase = ease;
        }

        if (onSave) onSave();
    });
}