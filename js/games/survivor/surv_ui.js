/**
 * surv_ui.js — Yōkai Survivor HUD & Quiz UI
 *
 * All vocabulary logic is delegated to a GameVocabManager instance.
 * This module never touches srs_db directly; the chain is:
 *   surv_ui → GameVocabManager → srs_db
 */

import { CHARACTERS, WEAPONS, PASSIVES } from './surv_entities.js';
import * as Audio from './surv_audio.js';

let _container    = null;
let _engine       = null;
let _vocabMgr     = null;   // GameVocabManager instance — the ONLY vocab interface
let _meta         = null;
let _metaCb       = null;
let _onLeaveRound = null;

let dom   = {};
let kills = 0;

// ── Per-run counters (reset in resetGameUI) ──────────────────────────────────
// NOTE: correct/wrong/combo are NOT tracked here — vocabMgr.getStats() is the
// source of truth for those. Only bestStreak is tracked locally because it maps
// to the game's own run-streak concept (consecutive correct answers this run),
// which is separate from vocabMgr's combo (which resets on any wrong answer
// across the full session, not just this run).
let _runBestStreak = 0;
let _runStreak     = 0;

// ── Separate timers for quiz vs chest ────────────────────────────────────────
let _srsQuizTimer   = null;
let _chestQuizTimer = null;
let _manuallyPaused = false;

// ── Public accessor so survivor.js can read run stats at game-over ────────────
export function getRunStats() {
    const vs = _vocabMgr?.getStats();
    return {
        kills,
        correct:    vs?.correct    ?? 0,
        wrong:      vs?.wrong      ?? 0,
        bestStreak: _runBestStreak,
    };
}

/**
 * Initialise the UI layer.
 *
 * @param {HTMLElement} container - The overlay element (#surv-ui-layer)
 * @param {Object} engineFunctions - { applyUpgrade, applyHeal, applyPenalty, pause, resume,
 *                                     getActiveWeapons, getActivePassives, getElapsedTime }
 * @param {GameVocabManager} vocabMgr - The shared GameVocabManager for this run
 * @param {Object} metaCallbacks - { saveMeta, onLeaveRound }
 */
export function initUI(container, engineFunctions, vocabMgr, metaCallbacks) {
    _container    = container;
    _engine       = engineFunctions;
    _vocabMgr     = vocabMgr;
    _metaCb       = metaCallbacks || { saveMeta: () => {} };
    _onLeaveRound = metaCallbacks?.onLeaveRound || (() => {});

    _container.innerHTML = `
        <!-- ── HUD ── -->
        <div class="surv-hud" id="surv-hud" style="display:none;">
            <div class="surv-hud-top">
                <div class="surv-hud-stat">
                    <span class="surv-hud-stat-icon">⚔️</span>
                    <span id="surv-hud-lvl">Lv. 1</span>
                </div>
                <div class="surv-hud-timer" id="surv-hud-time">00:00</div>
                <div style="display:flex;align-items:center;gap:5px;">
                    <div class="surv-hud-stat">
                        <span class="surv-hud-stat-icon">💀</span>
                        <span id="surv-hud-kills">0</span>
                    </div>
                    <button id="surv-btn-pause" class="surv-pause-btn">⏸</button>
                </div>
            </div>
            <div class="surv-hp-row">
                <span class="surv-hp-icon">❤️</span>
                <div class="surv-hp-bar-wrap"><div id="surv-hp-fill" class="surv-hp-fill"></div></div>
                <span id="surv-hp-text" class="surv-hp-text">100</span>
            </div>
            <div class="surv-xp-bar-wrap"><div id="surv-xp-fill"></div></div>
            <div class="surv-item-row">
                <div id="surv-weapons-list"  class="surv-slot-list"></div>
                <div id="surv-passives-list" class="surv-slot-list surv-slot-list-right"></div>
            </div>
            <div id="surv-vocab-bar" style="font-size:10px;color:var(--text-muted,#888);text-align:center;padding:2px 0 0;letter-spacing:0.3px;"></div>
        </div>

        <!-- Virtual Joystick -->
        <div id="surv-joystick-zone">
            <div id="surv-joystick-base"><div id="surv-joystick-knob"></div></div>
        </div>

        <!-- Boss Warning -->
        <div id="surv-boss-warning" class="surv-boss-warning-overlay" style="display:none; pointer-events:none;">
            <div class="surv-boss-warning-inner">
                <div class="surv-boss-warning-title">⚠ BOSS APPROACHING ⚠</div>
                <div class="surv-boss-warning-sub">The Great Yōkai awakens...</div>
            </div>
        </div>

        <!-- Manual Pause -->
        <div class="surv-overlay" id="surv-pause-screen" style="display:none;">
            <div class="surv-modal" style="text-align:center; max-width:300px;">
                <div class="surv-modal-badge surv-badge-green">⏸ PAUSED</div>
                <h3 class="surv-modal-title" style="color:var(--text-main);">Game Paused</h3>
                <button class="surv-btn-primary" id="surv-btn-resume-pause">▶ Resume</button>
                <button class="surv-btn-danger" id="surv-btn-leave-round" style="margin-top:10px;">⛺ Leave Round</button>
            </div>
        </div>

        <!-- SRS Level-Up Quiz -->
        <div class="surv-overlay" id="surv-srs-overlay" style="display:none;">
            <div class="surv-modal surv-modal-levelup">
                <div class="surv-modal-badge surv-badge-gold">⬆ LEVEL UP</div>
                <h3 class="surv-modal-title" style="color:#f1c40f;">Clash of Wills</h3>
                <p class="surv-modal-sub">Answer correctly to choose a power-up!</p>
                <div id="surv-srs-timer-wrap" class="surv-timer-bar-wrap">
                    <div id="surv-srs-timer-fill" class="surv-timer-fill"></div>
                </div>
                <div class="surv-quiz-word-block">
                    <div class="surv-srs-furi"  id="surv-srs-furi"></div>
                    <div class="surv-srs-kanji" id="surv-srs-kanji"></div>
                </div>
                <div class="surv-srs-grid" id="surv-srs-grid"></div>
            </div>
        </div>

        <!-- Boss Chest Quiz -->
        <div class="surv-overlay" id="surv-chest-overlay" style="display:none;">
            <div class="surv-modal surv-modal-chest">
                <div class="surv-modal-badge surv-badge-purple">🧰 BOSS CHEST</div>
                <h3 class="surv-modal-title" style="color:#9b59b6;">Rapid Fire!</h3>
                <p class="surv-modal-sub">Answer 3 in a row to claim the chest.</p>
                <div class="surv-chest-progress" id="surv-chest-progress">
                    <div class="surv-chest-dot" id="surv-chest-dot-1"></div>
                    <div class="surv-chest-dot" id="surv-chest-dot-2"></div>
                    <div class="surv-chest-dot" id="surv-chest-dot-3"></div>
                </div>
                <div id="surv-chest-timer-wrap" class="surv-timer-bar-wrap">
                    <div id="surv-chest-timer-fill" class="surv-timer-fill surv-timer-fill-purple"></div>
                </div>
                <div class="surv-quiz-word-block">
                    <div class="surv-srs-furi"  id="surv-chest-furi"></div>
                    <div class="surv-srs-kanji" id="surv-chest-kanji"></div>
                </div>
                <div class="surv-srs-grid" id="surv-chest-grid"></div>
            </div>
        </div>

        <!-- Upgrade Selection -->
        <div class="surv-overlay" id="surv-upgrade-overlay" style="display:none;">
            <div class="surv-modal surv-modal-upgrade">
                <div id="surv-upg-badge" class="surv-modal-badge surv-badge-green">⚡ POWER UP</div>
                <h3 id="surv-upg-title" class="surv-modal-title" style="color:#2ecc71;">Choose Your Power</h3>
                <div id="surv-upgrade-list" class="surv-upgrade-list"></div>
            </div>
        </div>

        <!-- Penalty -->
        <div class="surv-overlay" id="surv-penalty-overlay" style="display:none;">
            <div class="surv-modal surv-modal-penalty">
                <div class="surv-modal-badge surv-badge-red">✗ FOCUS LOST</div>
                <h3 class="surv-modal-title" style="color:#e74c3c;">Wrong Answer</h3>
                <p id="surv-penalty-msg" class="surv-modal-sub"></p>
                <div class="surv-upg-card surv-upg-card-penalty">
                    <div class="surv-upg-icon">🩸</div>
                    <div class="surv-upg-info">
                        <div class="surv-upg-name" style="color:#e74c3c;">Corrupted Vitality</div>
                        <div class="surv-upg-desc" id="surv-penalty-desc">+1% Max HP. No other gains.</div>
                    </div>
                </div>
                <button class="surv-btn-danger" id="surv-btn-continue">Continue →</button>
            </div>
        </div>

        <!-- Game Over / Win Summary -->
        <div class="surv-overlay" id="surv-summary-overlay" style="display:none;">
            <div class="surv-modal surv-modal-summary">
                <h2 id="surv-sum-title" class="surv-sum-title"></h2>
                <div class="surv-sum-stats">
                    <div class="surv-sum-row">
                        <span class="surv-sum-label">⏱ Time Survived</span>
                        <strong id="surv-sum-time" class="surv-sum-val"></strong>
                    </div>
                    <div class="surv-sum-row">
                        <span class="surv-sum-label">💀 Enemies Defeated</span>
                        <strong id="surv-sum-kills" class="surv-sum-val"></strong>
                    </div>
                    <div class="surv-sum-row">
                        <span class="surv-sum-label">✅ Correct / ❌ Wrong</span>
                        <strong id="surv-sum-quiz" class="surv-sum-val"></strong>
                    </div>
                    <div class="surv-sum-row">
                        <span class="surv-sum-label">⚡ Best Streak</span>
                        <strong id="surv-sum-streak" class="surv-sum-val"></strong>
                    </div>
                    <div class="surv-sum-row">
                        <span class="surv-sum-label">👻 Souls Earned</span>
                        <strong id="surv-sum-souls" class="surv-sum-val surv-sum-souls"></strong>
                    </div>
                    <div class="surv-sum-row" id="surv-sum-record-row" style="display:none;">
                        <span class="surv-sum-label">🏆 New Best!</span>
                        <strong id="surv-sum-record" class="surv-sum-val" style="color:#f1c40f;"></strong>
                    </div>
                </div>
                <button class="surv-btn-primary" id="surv-btn-camp">⛺ Return to Camp</button>
            </div>
        </div>
    `;

    dom = {
        hud:     _container.querySelector('#surv-hud'),
        lvl:     _container.querySelector('#surv-hud-lvl'),
        time:    _container.querySelector('#surv-hud-time'),
        kills:   _container.querySelector('#surv-hud-kills'),
        xpFill:  _container.querySelector('#surv-xp-fill'),
        hpFill:  _container.querySelector('#surv-hp-fill'),
        hpText:  _container.querySelector('#surv-hp-text'),
        wpnList: _container.querySelector('#surv-weapons-list'),
        pasList: _container.querySelector('#surv-passives-list'),
        vocabBar: _container.querySelector('#surv-vocab-bar'),
        btnPause:       _container.querySelector('#surv-btn-pause'),
        pauseScr:       _container.querySelector('#surv-pause-screen'),
        btnResumePause: _container.querySelector('#surv-btn-resume-pause'),
        btnLeaveRound:  _container.querySelector('#surv-btn-leave-round'),

        bossWarning: _container.querySelector('#surv-boss-warning'),

        srs:      _container.querySelector('#surv-srs-overlay'),
        srsTimer: _container.querySelector('#surv-srs-timer-fill'),
        furi:     _container.querySelector('#surv-srs-furi'),
        kanji:    _container.querySelector('#surv-srs-kanji'),
        grid:     _container.querySelector('#surv-srs-grid'),

        chest:     _container.querySelector('#surv-chest-overlay'),
        chestDots: [
            _container.querySelector('#surv-chest-dot-1'),
            _container.querySelector('#surv-chest-dot-2'),
            _container.querySelector('#surv-chest-dot-3'),
        ],
        chestTimer: _container.querySelector('#surv-chest-timer-fill'),
        chestFuri:  _container.querySelector('#surv-chest-furi'),
        chestKanji: _container.querySelector('#surv-chest-kanji'),
        chestGrid:  _container.querySelector('#surv-chest-grid'),

        upg:      _container.querySelector('#surv-upgrade-overlay'),
        upgBadge: _container.querySelector('#surv-upg-badge'),
        upgTitle: _container.querySelector('#surv-upg-title'),
        upgList:  _container.querySelector('#surv-upgrade-list'),

        pen:     _container.querySelector('#surv-penalty-overlay'),
        penMsg:  _container.querySelector('#surv-penalty-msg'),
        penDesc: _container.querySelector('#surv-penalty-desc'),
        btnCont: _container.querySelector('#surv-btn-continue'),

        sum:          _container.querySelector('#surv-summary-overlay'),
        sumTitle:     _container.querySelector('#surv-sum-title'),
        sumTime:      _container.querySelector('#surv-sum-time'),
        sumKills:     _container.querySelector('#surv-sum-kills'),
        sumQuiz:      _container.querySelector('#surv-sum-quiz'),
        sumStreak:    _container.querySelector('#surv-sum-streak'),
        sumSouls:     _container.querySelector('#surv-sum-souls'),
        sumRecordRow: _container.querySelector('#surv-sum-record-row'),
        sumRecord:    _container.querySelector('#surv-sum-record'),
        btnCamp:      _container.querySelector('#surv-btn-camp'),
    };

    dom.btnPause.onclick = () => {
        const anyOverlay = [dom.srs, dom.chest, dom.upg, dom.pen, dom.sum]
            .some(el => el.style.display !== 'none');
        if (anyOverlay) return;
        if (_manuallyPaused) {
            _resumeFromManualPause();
        } else {
            _manuallyPaused = true;
            dom.btnPause.textContent    = '▶';
            dom.pauseScr.style.display  = 'flex';
            _engine.pause();
            _vocabMgr.pause();
            _renderPauseMenu();
        }
    };
    dom.btnResumePause.onclick = _resumeFromManualPause;
    dom.btnLeaveRound.onclick  = () => {
        dom.pauseScr.style.display = 'none';
        _manuallyPaused = false;
        showGameOver(false, _onLeaveRound);
    };
    dom.btnCont.onclick = () => { dom.pen.style.display = 'none'; _engine.resume(); };
}

function _resumeFromManualPause() {
    _manuallyPaused = false;
    dom.btnPause.textContent   = '⏸';
    dom.pauseScr.style.display = 'none';
    _vocabMgr.resume();
    _engine.resume();
}

function _renderPauseMenu() {
    const stats = _vocabMgr.getStats();
    const mode  = _vocabMgr.getMode();
    const isManual = mode === 'manual';
    const acc   = Math.round(stats.accuracy * 100);

    // Find or create the vocab section inside the pause modal
    let vocabSection = dom.pauseScr.querySelector('.surv-pause-vocab');
    if (!vocabSection) {
        vocabSection = document.createElement('div');
        vocabSection.className = 'surv-pause-vocab';
        vocabSection.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.15);width:100%;font-size:12px;color:var(--text-muted,#aaa);';
        dom.pauseScr.querySelector('.surv-modal').appendChild(vocabSection);
    }

    const leechCount = stats.leechCount > 0 ? ` · 🩸 ${stats.leechCount} leech${stats.leechCount > 1 ? 'es' : ''}` : '';
    vocabSection.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span>📚 ${stats.activeCount} active · ${stats.newCount} new${leechCount}</span>
            <span>🎯 ${acc}% accuracy</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:${isManual ? '10px' : '0'};">
            <span>✅ ${stats.correct} correct · ❌ ${stats.wrong} wrong</span>
            <span>⚡ ${stats.combo} combo</span>
        </div>
        ${isManual && stats.newCount > 0 ? `
        <button id="surv-btn-learn-word" style="
            width:100%;padding:9px;background:var(--primary-color,#4A90E2);color:#fff;
            border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:13px;">
            📖 Learn New Word (${stats.newCount} remaining)
        </button>` : ''}
        ${isManual && stats.newCount === 0 ? `
        <div style="text-align:center;color:#2ecc71;font-size:12px;">✅ All words introduced!</div>
        ` : ''}
    `;

    if (isManual) {
        const learnBtn = vocabSection.querySelector('#surv-btn-learn-word');
        if (learnBtn) {
            learnBtn.onclick = () => {
                const introduced = _vocabMgr.learnNewWord();
                if (introduced) {
                    Audio.playLevelUp?.();
                    _renderPauseMenu(); // refresh counts
                }
            };
        }
    }
}

/**
 * Called at the start of each run to wire up the vocab manager and reset all counters.
 *
 * @param {GameVocabManager} vocabMgr - Fresh (or re-initialised) manager for this run.
 * @param {Object} metaData - The _meta object from survivor.js.
 */
export function resetGameUI(vocabMgr, metaData) {
    _vocabMgr       = vocabMgr;
    _meta           = metaData;
    kills           = 0;
    chestStep       = 0;
    _runStreak      = 0;
    _runBestStreak  = 0;
    _manuallyPaused = false;
    dom.hud.style.display = 'flex';
    dom.sum.style.display = 'none';
    dom.btnPause.textContent = '⏸';
}

export function drawHUD(hp, maxHp, xp, xpNext, level, time) {
    dom.lvl.textContent   = `Lv. ${level}`;
    dom.kills.textContent = kills.toLocaleString();

    const m = Math.floor(time / 60).toString().padStart(2, '0');
    const s = Math.floor(time % 60).toString().padStart(2, '0');
    dom.time.textContent = `${m}:${s}`;

    dom.xpFill.style.width = `${(xp / xpNext) * 100}%`;

    const hpPct = Math.max(0, (hp / maxHp) * 100);
    dom.hpFill.style.width = `${hpPct}%`;
    dom.hpFill.className   = 'surv-hp-fill' + (hpPct < 30 ? ' danger' : hpPct < 60 ? ' warning' : '');
    dom.hpText.textContent = `${Math.ceil(hp)}`;

    dom.wpnList.innerHTML = _engine.getActiveWeapons().map(w => {
        const def = WEAPONS[w.id];
        return `<div class="surv-slot" title="${def.name} Lv.${w.level}">${def.icon}<span class="surv-slot-lvl">${w.level}</span></div>`;
    }).join('');

    dom.pasList.innerHTML = _engine.getActivePassives().map(p => {
        const def = PASSIVES[p.id];
        return `<div class="surv-slot" title="${def.name} Lv.${p.level}">${def.icon}<span class="surv-slot-lvl">${p.level}</span></div>`;
    }).join('');

    // Live vocab stats — updated every frame via the engine's draw callback.
    // Kept brief so it doesn't clutter the HUD.
    if (dom.vocabBar && _vocabMgr) {
        const stats = _vocabMgr.getStats();
        const acc   = Math.round(stats.accuracy * 100);
        const due   = stats.dueCount;
        dom.vocabBar.textContent = `📚 ${stats.activeCount} · 🎯 ${acc}% · ${due > 0 ? `📬 ${due} due` : '✓'}`;
    }
}

export function incrementKill() { kills++; }

// ── Boss Warning ─────────────────────────────────────────────────────────────

export function showBossWarning() {
    dom.bossWarning.style.display = 'flex';
    dom.bossWarning.classList.remove('surv-boss-anim');
    void dom.bossWarning.offsetWidth;
    dom.bossWarning.classList.add('surv-boss-anim');
    setTimeout(() => { dom.bossWarning.style.display = 'none'; }, 3500);
}

// ─── SRS LEVEL-UP QUIZ ───────────────────────────────────────────────────────
//
// NOTE: This module implements its own quiz UI (showSrsQuiz / showChestQuiz) rather
// than using showStandardQuiz / showQuizSequence from game_vocab_mgr_ui.js.
// That is intentional: survivor has a deep custom visual theme (surv-overlay CSS
// classes, gold/purple badge colours, "Clash of Wills" / "Rapid Fire" flavour text,
// HUD-flash feedback) that would be lost if we used the generic components.
//
// The underlying call pattern is identical to what the standard components do:
//   vocabMgr.getNextWord() → render question → vocabMgr.gradeWord() → callback
// If you add a new mode to GameVocabManager, no changes are needed here — the
// correct word type (due / new / drill / leech) is already selected by the manager.

// Tracks the pending challenge (refId + wordObj) across the async answer flow.
let _currentChallenge = null;

export function showSrsQuiz() {
    _currentChallenge = _vocabMgr.getNextWord();
    if (!_currentChallenge) { showUpgrades(false); return; }

    const { wordObj, options, correctIdx } = _currentChallenge;

    // Pause the vocab clock while the player is reading the question
    _vocabMgr.pause();

    dom.srs.style.display   = 'flex';
    dom.kanji.textContent   = wordObj.kanji;
    dom.furi.textContent    = (wordObj.kana !== wordObj.kanji) ? wordObj.kana : '';
    dom.srsTimer.style.display = 'none';

    _buildAnswerGrid(dom.grid, options, correctIdx, (isCorrect, clickedBtn) => {
        clearInterval(_srsQuizTimer);
        _flashAnswers(dom.grid, clickedBtn, options[correctIdx], isCorrect, () => {
            const result = _vocabMgr.gradeWord(_currentChallenge.refId, isCorrect);
            _vocabMgr.resume(); // unpause clock after grading
            _recordAnswer(isCorrect, result);
            dom.srs.style.display = 'none';
            _currentChallenge     = null;
            if (isCorrect) {
                showUpgrades(false);
            } else {
                _showPenalty(`Correct meaning: "${options[correctIdx]}"`);
                _engine.applyPenalty();
            }
        });
    });

    dom.srsTimer.style.width   = '0%';
    dom.srsTimer.style.display = 'none';
    clearInterval(_srsQuizTimer);
}

// ─── BOSS CHEST QUIZ ─────────────────────────────────────────────────────────

let chestStep = 0;

export function showChestQuiz() {
    dom.chest.style.display = 'flex';
    chestStep = 0;
    dom.chestDots.forEach(d => d.classList.remove('filled', 'wrong'));
    _vocabMgr.pause(); // pause clock for the entire chest sequence
    _nextChestQuestion();
}

function _nextChestQuestion() {
    _currentChallenge = _vocabMgr.getNextWord();
    if (!_currentChallenge) { dom.chest.style.display = 'none'; _vocabMgr.resume(); showUpgrades(true); return; }

    const { wordObj, options, correctIdx } = _currentChallenge;

    dom.chestKanji.textContent = wordObj.kanji;
    dom.chestFuri.textContent  = (wordObj.kana !== wordObj.kanji) ? wordObj.kana : '';

    _buildAnswerGrid(dom.chestGrid, options, correctIdx, (isCorrect, clickedBtn) => {
        clearInterval(_chestQuizTimer);
        _flashAnswers(dom.chestGrid, clickedBtn, options[correctIdx], isCorrect, () => {
            const result = _vocabMgr.gradeWord(_currentChallenge.refId, isCorrect);
            _recordAnswer(isCorrect, result);
            _currentChallenge = null;

            if (isCorrect) {
                dom.chestDots[chestStep].classList.add('filled');
                chestStep++;
                if (chestStep >= 3) {
                    dom.chest.style.display = 'none';
                    _vocabMgr.resume(); // unpause after sequence completes
                    showUpgrades(true);
                } else {
                    _nextChestQuestion();
                }
            } else {
                dom.chestDots[chestStep].classList.add('wrong');
                dom.chest.style.display = 'none';
                _vocabMgr.resume(); // unpause after failure
                _meta.souls += 500;
                _metaCb.saveMeta();
                _showPenalty(`Chest corrupted! Correct: "${options[correctIdx]}" — +500 Souls consolation.`);
                _engine.applyPenalty();
            }
        });
    });

    dom.chestTimer.style.width   = '0%';
    dom.chestTimer.style.display = 'none';
    clearInterval(_chestQuizTimer);
}

// ─── QUIZ HELPERS ─────────────────────────────────────────────────────────────

/**
 * Render a 4-button answer grid.
 * All distractor/option logic has already been done by GameVocabManager.getNextWord().
 *
 * @param {HTMLElement} gridEl
 * @param {string[]} options - 4 options, already shuffled by vocabMgr
 * @param {number} correctIdx - Index of the correct answer in options[]
 * @param {Function} onAnswer - (isCorrect: boolean, clickedBtn: HTMLElement) => void
 */
function _buildAnswerGrid(gridEl, options, correctIdx, onAnswer) {
    gridEl.innerHTML = '';
    options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className   = 'surv-srs-btn';
        btn.textContent = opt;
        btn.onclick     = () => {
            if (btn.disabled) return;
            onAnswer(idx === correctIdx, btn);
        };
        gridEl.appendChild(btn);
    });
}

function _flashAnswers(gridEl, clickedBtn, correctText, isCorrect, callback) {
    gridEl.querySelectorAll('.surv-srs-btn').forEach(b => {
        b.disabled = true;
        if (b.textContent === correctText) b.classList.add('correct');
    });
    if (clickedBtn && !isCorrect) clickedBtn.classList.add('wrong');
    if (isCorrect) Audio.playCorrect();
    else           Audio.playWrong();
    setTimeout(callback, 650);
}

// ─── STATS ────────────────────────────────────────────────────────────────────

/**
 * Update run-local streak and trigger HUD flashes after each answer.
 * Lifetime stat rollup (totalCorrect, totalWrong, bestStreak) is done
 * once at the end of the run in showGameOver(), not here, because
 * vocabMgr.getStats() is the single source of truth for correct/wrong counts.
 *
 * @param {boolean} isCorrect
 * @param {Object|null} result - gradeWord() result
 */
function _recordAnswer(isCorrect, result) {
    // Run-local streak — this concept doesn't belong in vocabMgr
    if (isCorrect) {
        _runStreak++;
        if (_runStreak > _runBestStreak) _runBestStreak = _runStreak;
    } else {
        _runStreak = 0;
    }

    // Show leech alert flash when a word crosses the threshold
    if (result?.justBecameLeech) {
        _showHudFlash('🩸 Leech!', '#c0392b');
    }
    // Combo milestone flash (using vocabMgr's combo as source of truth)
    const combo = result?.combo ?? 0;
    if (isCorrect && combo > 0 && combo % 5 === 0) {
        _showHudFlash(`⚡ ${combo} Combo!`, '#f1c40f');
    }
}

/** Brief flash message on the HUD (auto-clears after 1.5s) */
function _showHudFlash(text, color = '#fff') {
    let flash = document.getElementById('surv-hud-flash');
    if (!flash) {
        flash = document.createElement('div');
        flash.id = 'surv-hud-flash';
        flash.style.cssText = `
            position:absolute; top:64px; left:50%; transform:translateX(-50%);
            padding:4px 14px; border-radius:20px; font-size:13px; font-weight:bold;
            pointer-events:none; z-index:200; white-space:nowrap;
            opacity:0; transition:opacity 0.2s;
        `;
        dom.hud.appendChild(flash);
    }
    flash.textContent  = text;
    flash.style.background = color;
    flash.style.color  = '#fff';
    flash.style.opacity = '1';
    clearTimeout(flash._timeout);
    flash._timeout = setTimeout(() => { flash.style.opacity = '0'; }, 1500);
}

function _showPenalty(msg, desc = '+1% Max HP. No power-up this level.') {
    dom.penMsg.textContent  = msg;
    dom.penDesc.textContent = desc;
    dom.pen.style.display   = 'flex';
}

// ─── UPGRADE SELECTION ───────────────────────────────────────────────────────

function _buildUpgradePool() {
    const activeW = _engine.getActiveWeapons();
    const activeP = _engine.getActivePassives();

    const wUpgrade = activeW
        .filter(aw => aw.level < WEAPONS[aw.id].levels.length)
        .map(aw => ({ type: 'weapon', id: aw.id, level: aw.level + 1 }));

    const allNewWeapons = activeW.length < 6
        ? Object.keys(WEAPONS).filter(k => !activeW.find(aw => aw.id === k))
            .map(k => ({ type: 'weapon', id: k, level: 1 }))
        : [];
    const wNewCommon = allNewWeapons.filter(w => !WEAPONS[w.id].rare);
    const wNewRare   = allNewWeapons.filter(w =>  WEAPONS[w.id].rare);

    const pUpgrade = activeP
        .filter(ap => ap.level < PASSIVES[ap.id].maxLevel)
        .map(ap => ({ type: 'passive', id: ap.id, level: ap.level + 1 }));

    const pNew = activeP.length < 6
        ? Object.keys(PASSIVES).filter(k => !activeP.find(ap => ap.id === k))
            .map(k => ({ type: 'passive', id: k, level: 1 }))
        : [];

    const weighted = [
        ...wUpgrade, ...wUpgrade, ...wUpgrade,
        ...wNewCommon, ...wNewCommon, ...wNewCommon,
        ...wNewRare,
        ...pUpgrade, ...pUpgrade, ...pUpgrade,
        ...pNew,
    ].sort(() => Math.random() - 0.5);

    const chosen = [];
    const seen   = new Set();
    for (const item of weighted) {
        const key = `${item.type}:${item.id}`;
        if (!seen.has(key)) { seen.add(key); chosen.push(item); }
        if (chosen.length >= 3) break;
    }

    const fallbacks = [
        { type: 'heal', name: 'Ramen Bowl', icon: '🍜', desc: 'Restore 50% HP.',  healPct: 0.5  },
        { type: 'gold', name: 'Coin Pouch', icon: '💰', desc: '+200 Souls.',       amount:  200  },
        { type: 'heal', name: 'Onigiri',    icon: '🍙', desc: 'Restore 25% HP.',  healPct: 0.25 },
    ];
    while (chosen.length < 3) chosen.push(fallbacks[chosen.length % fallbacks.length]);

    return chosen;
}

function showUpgrades(isChest) {
    dom.upg.style.display = 'flex';
    dom.upgList.innerHTML = '';

    if (isChest) {
        dom.upgTitle.textContent = 'Chest Opened!';
        dom.upgTitle.style.color = '#9b59b6';
        dom.upgBadge.textContent = '🧰 CHEST REWARD';
        dom.upgBadge.className   = 'surv-modal-badge surv-badge-purple';
    } else {
        dom.upgTitle.textContent = 'Choose Your Power';
        dom.upgTitle.style.color = '#2ecc71';
        dom.upgBadge.textContent = '⚡ POWER UP';
        dom.upgBadge.className   = 'surv-modal-badge surv-badge-green';
    }

    _buildUpgradePool().forEach(c => {
        const card = document.createElement('div');
        card.className = 'surv-upg-card' + (isChest ? ' chest-reward' : '');

        let icon, name, desc, isNew = false;
        if (c.type === 'weapon') {
            const w = WEAPONS[c.id];
            icon = w.icon; name = w.name; desc = w.levels[c.level - 1].desc; isNew = (c.level === 1);
        } else if (c.type === 'passive') {
            const p = PASSIVES[c.id];
            icon = p.icon; name = p.name; desc = p.desc; isNew = (c.level === 1);
        } else {
            icon = c.icon; name = c.name; desc = c.desc;
        }

        card.innerHTML = `
            <div class="surv-upg-icon">${icon}</div>
            <div class="surv-upg-info">
                <div class="surv-upg-name">
                    ${name}
                    ${c.level != null ? `<span class="surv-upg-lvl ${isNew ? 'surv-upg-lvl-new' : ''}">Lv.${c.level}</span>` : ''}
                </div>
                <div class="surv-upg-desc">${desc}</div>
            </div>
        `;
        card.onclick = () => {
            dom.upg.style.display = 'none';
            Audio.playUpgradePick();
            if (c.type === 'heal') {
                _engine.applyHeal(c.healPct ?? 0.5);
            } else if (c.type === 'gold') {
                _meta.souls += (c.amount ?? 100);
                _metaCb.saveMeta();
            } else {
                _engine.applyUpgrade(c);
            }
            _engine.resume();
        };
        dom.upgList.appendChild(card);
    });
}

// ─── GAME OVER ───────────────────────────────────────────────────────────────

export function showGameOver(isWin, exitCallback) {
    dom.hud.style.display = 'none';
    dom.sum.style.display = 'flex';

    dom.sumTitle.textContent = isWin ? '🌅 Sunrise Reached!' : '💀 Fallen in Battle';
    dom.sumTitle.style.color = isWin ? '#f1c40f' : '#e74c3c';

    const t = _engine.getElapsedTime();
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    dom.sumTime.textContent   = `${m}:${s}`;
    dom.sumKills.textContent  = kills.toLocaleString();

    // Read correct/wrong from vocabMgr — it's the single source of truth
    const vs = _vocabMgr?.getStats();
    dom.sumQuiz.textContent   = `${vs?.correct ?? 0} / ${vs?.wrong ?? 0}`;
    dom.sumStreak.textContent = `${_runBestStreak}`;

    let earned = Math.floor(kills / 10);
    if (isWin) earned = Math.floor(earned * 1.5);
    earned = Math.floor(earned * (1 + (_meta.upgrades.greed || 0) * 0.05));
    dom.sumSouls.textContent = `+${earned.toLocaleString()}`;

    _meta.souls += earned;

    const st = _meta.stats;
    st.totalRuns       = (st.totalRuns       || 0) + 1;
    st.totalWins       = (st.totalWins       || 0) + (isWin ? 1 : 0);
    st.totalKills      = (st.totalKills      || 0) + kills;
    st.totalTimePlayed = (st.totalTimePlayed || 0) + t;
    st.highestKills    = Math.max(st.highestKills || 0, kills);

    // Lifetime vocab rollup — read from vocabMgr (single source of truth) once per run end.
    st.totalCorrect = (st.totalCorrect || 0) + (vs?.correct ?? 0);
    st.totalWrong   = (st.totalWrong   || 0) + (vs?.wrong   ?? 0);
    if (_runBestStreak > (st.bestStreak || 0)) st.bestStreak = _runBestStreak;

    const isNewRecord = t > (st.highestTime || 0);
    if (isNewRecord) {
        st.highestTime = t;
        dom.sumRecordRow.style.display = '';
        dom.sumRecord.textContent = `${m}:${s}`;
    } else {
        dom.sumRecordRow.style.display = 'none';
    }

    _metaCb.saveMeta();
    dom.btnCamp.onclick = () => { dom.sum.style.display = 'none'; exitCallback(); };
}