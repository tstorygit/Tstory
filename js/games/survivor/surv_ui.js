import { CHARACTERS, WEAPONS, PASSIVES } from './surv_entities.js';
import * as Audio from './surv_audio.js';

let _container = null;
let _engine    = null;
let _vocabQueue = [];
let _srsDb      = null;
let _meta       = null;
let _metaCb     = null;  // { saveMeta() } — parent owns persistence

let dom   = {};
let kills = 0;

// ── Separate timers for quiz vs chest to prevent cross-cancellation ──
let _srsQuizTimer   = null;
let _chestQuizTimer = null;

let _manuallyPaused = false;

export function initUI(container, engineFunctions, srsDbRef, metaCallbacks) {
    _container = container;
    _engine    = engineFunctions;
    _srsDb     = srsDbRef;
    _metaCb    = metaCallbacks || { saveMeta: () => {} };

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
                    <button id="surv-btn-pause" class="surv-pause-btn" style="pointer-events:auto;">⏸</button>
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
        </div>

        <!-- Virtual Joystick -->
        <div id="surv-joystick-zone">
            <div id="surv-joystick-base"><div id="surv-joystick-knob"></div></div>
        </div>

        <!-- ── Landscape hint (portrait-mode on touch devices) ── -->
        <div id="surv-landscape-hint" class="surv-landscape-hint" style="display:none;">
            <div class="surv-landscape-icon">📱</div>
            <div class="surv-landscape-msg">Rotate for a better experience</div>
        </div>

        <!-- ── Boss Warning (pointer-events none — game keeps running) ── -->
        <div id="surv-boss-warning" class="surv-boss-warning-overlay" style="display:none; pointer-events:none;">
            <div class="surv-boss-warning-inner">
                <div class="surv-boss-warning-title">⚠ BOSS APPROACHING ⚠</div>
                <div class="surv-boss-warning-sub">The Great Yōkai awakens...</div>
            </div>
        </div>

        <!-- ── Manual Pause Screen ── -->
        <div class="surv-overlay" id="surv-pause-screen" style="display:none;">
            <div class="surv-modal" style="text-align:center; max-width:300px;">
                <div class="surv-modal-badge surv-badge-green">⏸ PAUSED</div>
                <h3 class="surv-modal-title" style="color:var(--text-main);">Game Paused</h3>
                <button class="surv-btn-primary" id="surv-btn-resume-pause">▶ Resume</button>
            </div>
        </div>

        <!-- ── SRS Level-Up Quiz ── -->
        <div class="surv-overlay" id="surv-srs-overlay" style="display:none;">
            <div class="surv-modal surv-modal-levelup">
                <div class="surv-modal-badge surv-badge-gold">⬆ LEVEL UP</div>
                <h3 class="surv-modal-title" style="color:#f1c40f;">Clash of Wills</h3>
                <p class="surv-modal-sub">Answer correctly to choose a power-up!</p>
                <div id="surv-srs-timer-wrap" class="surv-timer-bar-wrap">
                    <div id="surv-srs-timer-fill" class="surv-timer-fill"></div>
                </div>
                <div class="surv-quiz-word-block">
                    <div class="surv-srs-furi" id="surv-srs-furi"></div>
                    <div class="surv-srs-kanji" id="surv-srs-kanji"></div>
                </div>
                <div class="surv-srs-grid" id="surv-srs-grid"></div>
            </div>
        </div>

        <!-- ── Boss Chest Quiz ── -->
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
                    <div class="surv-srs-furi" id="surv-chest-furi"></div>
                    <div class="surv-srs-kanji" id="surv-chest-kanji"></div>
                </div>
                <div class="surv-srs-grid" id="surv-chest-grid"></div>
            </div>
        </div>

        <!-- ── Upgrade Selection ── -->
        <div class="surv-overlay" id="surv-upgrade-overlay" style="display:none;">
            <div class="surv-modal surv-modal-upgrade">
                <div id="surv-upg-badge" class="surv-modal-badge surv-badge-green">⚡ POWER UP</div>
                <h3 id="surv-upg-title" class="surv-modal-title" style="color:#2ecc71;">Choose Your Power</h3>
                <div id="surv-upgrade-list" class="surv-upgrade-list"></div>
            </div>
        </div>

        <!-- ── Penalty Overlay ── -->
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

        <!-- ── Game Over / Win Summary ── -->
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
        btnPause:_container.querySelector('#surv-btn-pause'),
        pauseScr:_container.querySelector('#surv-pause-screen'),
        btnResumePause: _container.querySelector('#surv-btn-resume-pause'),

        landscapeHint: _container.querySelector('#surv-landscape-hint'),
        bossWarning:   _container.querySelector('#surv-boss-warning'),

        srs:      _container.querySelector('#surv-srs-overlay'),
        srsTimer: _container.querySelector('#surv-srs-timer-fill'),
        furi:     _container.querySelector('#surv-srs-furi'),
        kanji:    _container.querySelector('#surv-srs-kanji'),
        grid:     _container.querySelector('#surv-srs-grid'),

        chest:     _container.querySelector('#surv-chest-overlay'),
        chestDots: [
            _container.querySelector('#surv-chest-dot-1'),
            _container.querySelector('#surv-chest-dot-2'),
            _container.querySelector('#surv-chest-dot-3')
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

        sum:        _container.querySelector('#surv-summary-overlay'),
        sumTitle:   _container.querySelector('#surv-sum-title'),
        sumTime:    _container.querySelector('#surv-sum-time'),
        sumKills:   _container.querySelector('#surv-sum-kills'),
        sumSouls:   _container.querySelector('#surv-sum-souls'),
        sumRecordRow: _container.querySelector('#surv-sum-record-row'),
        sumRecord:    _container.querySelector('#surv-sum-record'),
        btnCamp:      _container.querySelector('#surv-btn-camp')
    };

    // ── Pause button ──
    dom.btnPause.onclick = () => {
        // Don't allow manual pause while a quiz/upgrade overlay is showing
        const anyOverlay = [dom.srs, dom.chest, dom.upg, dom.pen, dom.sum]
            .some(el => el.style.display !== 'none');
        if (anyOverlay) return;

        if (_manuallyPaused) {
            _resumeFromManualPause();
        } else {
            _manuallyPaused = true;
            dom.btnPause.textContent = '▶';
            dom.pauseScr.style.display = 'flex';
            _engine.pause();
        }
    };

    dom.btnResumePause.onclick = _resumeFromManualPause;

    // ── Penalty continue ──
    dom.btnCont.onclick = () => { dom.pen.style.display = 'none'; _engine.resume(); };

    // ── Landscape hint ──
    const checkOrientation = () => {
        const isPortrait  = window.innerHeight > window.innerWidth;
        const isTouch     = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
        dom.landscapeHint.style.display = (isPortrait && isTouch) ? 'flex' : 'none';
    };
    window.addEventListener('resize', checkOrientation);
    checkOrientation();
}

function _resumeFromManualPause() {
    _manuallyPaused = false;
    dom.btnPause.textContent = '⏸';
    dom.pauseScr.style.display = 'none';
    _engine.resume();
}

export function resetGameUI(vocabQueue, metaData) {
    _vocabQueue     = vocabQueue;
    _meta           = metaData;
    kills           = 0;
    chestStep       = 0;
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
    dom.time.textContent  = `${m}:${s}`;

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
}

export function incrementKill() { kills++; }

// ── Boss Warning ────────────────────────────────────────────────────────────

export function showBossWarning() {
    dom.bossWarning.style.display = 'flex';
    // Remove/re-add animation class so it restarts if called again
    dom.bossWarning.classList.remove('surv-boss-anim');
    void dom.bossWarning.offsetWidth; // reflow
    dom.bossWarning.classList.add('surv-boss-anim');
    setTimeout(() => { dom.bossWarning.style.display = 'none'; }, 3500);
}

// ── Vocab helpers ───────────────────────────────────────────────────────────

/** ✅ FIX: safe word picker — never returns undefined */
function safeGetWord() {
    if (!_vocabQueue.length) return null;
    const res = _srsDb.getNextGameWord?.(_vocabQueue, 'mixed');
    return res?.wordObj ?? _vocabQueue[Math.floor(Math.random() * _vocabQueue.length)];
}

// ─── REGULAR SRS LEVEL-UP QUIZ ──────────────────────────────────────────────

let currentTarget = null;
let _srsTimeLeft  = 5.0;

export function showSrsQuiz() {
    currentTarget = safeGetWord();
    if (!currentTarget) { showUpgrades(false); return; } // no words — skip quiz

    dom.srs.style.display = 'flex';
    dom.kanji.textContent = currentTarget.word;
    dom.furi.textContent  = (currentTarget.furi !== currentTarget.word) ? currentTarget.furi : '';

    _buildAnswerGrid(dom.grid, currentTarget, (isCorrect, clickedBtn) => {
        clearInterval(_srsQuizTimer);
        // ── Quiz flash feedback before proceeding ──
        _flashAnswers(dom.grid, clickedBtn, currentTarget.trans, isCorrect, () => {
            _gradeWord(currentTarget, isCorrect);
            dom.srs.style.display = 'none';
            if (isCorrect) {
                _meta.stats.totalWordsMastered++;
                showUpgrades(false);
            } else {
                _showPenalty(`Correct meaning: "${currentTarget.trans}"`);
                _engine.applyPenalty();
            }
        });
    });

    _srsTimeLeft = 5.0;
    dom.srsTimer.style.width = '100%';
    clearInterval(_srsQuizTimer);
    _srsQuizTimer = setInterval(() => {
        _srsTimeLeft -= 0.1;
        dom.srsTimer.style.width = `${(_srsTimeLeft / 5) * 100}%`;
        if (_srsTimeLeft <= 0) {
            clearInterval(_srsQuizTimer);
            _flashAnswers(dom.grid, null, currentTarget.trans, false, () => {
                _gradeWord(currentTarget, false);
                dom.srs.style.display = 'none';
                _showPenalty(`Time's up! Correct: "${currentTarget.trans}"`);
                _engine.applyPenalty();
            });
        }
    }, 100);
}

// ─── BOSS CHEST QUIZ ────────────────────────────────────────────────────────

let chestStep   = 0;
let _chestTimeLeft = 4.0;

export function showChestQuiz() {
    dom.chest.style.display = 'flex';
    chestStep = 0;
    dom.chestDots.forEach(d => d.classList.remove('filled', 'wrong'));
    _nextChestQuestion();
}

function _nextChestQuestion() {
    currentTarget = safeGetWord();
    if (!currentTarget) { dom.chest.style.display = 'none'; showUpgrades(true); return; }

    dom.chestKanji.textContent = currentTarget.word;
    dom.chestFuri.textContent  = (currentTarget.furi !== currentTarget.word) ? currentTarget.furi : '';

    _buildAnswerGrid(dom.chestGrid, currentTarget, (isCorrect, clickedBtn) => {
        clearInterval(_chestQuizTimer);
        _flashAnswers(dom.chestGrid, clickedBtn, currentTarget.trans, isCorrect, () => {
            _gradeWord(currentTarget, isCorrect);
            if (isCorrect) {
                dom.chestDots[chestStep].classList.add('filled');
                chestStep++;
                if (chestStep >= 3) {
                    dom.chest.style.display = 'none';
                    showUpgrades(true);
                } else {
                    _nextChestQuestion();
                }
            } else {
                dom.chestDots[chestStep].classList.add('wrong');
                dom.chest.style.display = 'none';
                _meta.souls += 500;
                _metaCb.saveMeta();
                _showPenalty(`Chest corrupted! Correct: "${currentTarget.trans}" — +500 Souls consolation.`);
                _engine.applyPenalty();
            }
        });
    });

    _chestTimeLeft = 4.0;
    dom.chestTimer.style.width = '100%';
    clearInterval(_chestQuizTimer);
    _chestQuizTimer = setInterval(() => {
        _chestTimeLeft -= 0.1;
        dom.chestTimer.style.width = `${(_chestTimeLeft / 4) * 100}%`;
        if (_chestTimeLeft <= 0) {
            clearInterval(_chestQuizTimer);
            _flashAnswers(dom.chestGrid, null, currentTarget.trans, false, () => {
                _gradeWord(currentTarget, false);
                dom.chestDots[chestStep].classList.add('wrong');
                dom.chest.style.display = 'none';
                _meta.souls += 500;
                _metaCb.saveMeta();
                _showPenalty(`Time's up! Correct: "${currentTarget.trans}" — +500 Souls consolation.`);
                _engine.applyPenalty();
            });
        }
    }, 100);
}

// ─── QUIZ HELPERS ────────────────────────────────────────────────────────────

function _buildAnswerGrid(gridEl, target, onAnswer) {
    const pool        = _vocabQueue.filter(w => w.word !== target.word).map(w => w.trans);
    const distractors = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options     = [...distractors, target.trans].sort(() => 0.5 - Math.random());

    gridEl.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className   = 'surv-srs-btn';
        btn.textContent = opt;
        btn.onclick     = () => {
            if (btn.disabled) return;
            onAnswer(opt === target.trans, btn);
        };
        gridEl.appendChild(btn);
    });
}

/** Show green/red flash on buttons, then call callback after 650ms */
function _flashAnswers(gridEl, clickedBtn, correctTrans, isCorrect, callback) {
    const allBtns = gridEl.querySelectorAll('.surv-srs-btn');
    allBtns.forEach(b => {
        b.disabled = true;
        if (b.textContent === correctTrans) b.classList.add('correct');
    });
    if (clickedBtn && !isCorrect) clickedBtn.classList.add('wrong');

    if (isCorrect) Audio.playCorrect();
    else           Audio.playWrong();

    setTimeout(callback, 650);
}

function _gradeWord(target, isCorrect) {
    _srsDb.gradeWordInGame?.({
        word: target.word, furi: target.furi, trans: target.trans
    }, isCorrect ? 3 : 0, false);
}

function _showPenalty(msg, desc = '+1% Max HP. No power-up this level.') {
    dom.penMsg.textContent  = msg;
    dom.penDesc.textContent = desc;
    dom.pen.style.display   = 'flex';
}

// ─── UPGRADE SELECTION ───────────────────────────────────────────────────────

/** ✅ Weighted pool: existing upgrades 3×, new items 1× — prevents maxed weapons cluttering */
function _buildUpgradePool() {
    const activeW = _engine.getActiveWeapons();
    const activeP = _engine.getActivePassives();

    const wUpgrade = activeW
        .filter(aw => aw.level < WEAPONS[aw.id].levels.length)
        .map(aw => ({ type: 'weapon', id: aw.id, level: aw.level + 1 }));

    const wNew = activeW.length < 6
        ? Object.keys(WEAPONS)
            .filter(k => !activeW.find(aw => aw.id === k))
            .map(k => ({ type: 'weapon', id: k, level: 1 }))
        : [];

    const pUpgrade = activeP
        .filter(ap => ap.level < PASSIVES[ap.id].maxLevel)
        .map(ap => ({ type: 'passive', id: ap.id, level: ap.level + 1 }));

    const pNew = activeP.length < 6
        ? Object.keys(PASSIVES)
            .filter(k => !activeP.find(ap => ap.id === k))
            .map(k => ({ type: 'passive', id: k, level: 1 }))
        : [];

    // Existing upgrades get 3× weight over new items
    const weighted = [
        ...wUpgrade, ...wUpgrade, ...wUpgrade,
        ...wNew,
        ...pUpgrade, ...pUpgrade, ...pUpgrade,
        ...pNew
    ].sort(() => Math.random() - 0.5);

    const chosen = [];
    const seen   = new Set();
    for (const item of weighted) {
        const key = `${item.type}:${item.id}`;
        if (!seen.has(key)) { seen.add(key); chosen.push(item); }
        if (chosen.length >= 3) break;
    }

    // Fallbacks when nothing is available (fully upgraded)
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

    const choices = _buildUpgradePool();

    choices.forEach(c => {
        const card  = document.createElement('div');
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
                    ${c.level != null
                        ? `<span class="surv-upg-lvl ${isNew ? 'surv-upg-lvl-new' : ''}">Lv.${c.level}</span>`
                        : ''}
                </div>
                <div class="surv-upg-desc">${desc}</div>
            </div>
        `;
        card.onclick = () => {
            dom.upg.style.display = 'none';
            Audio.playUpgradePick();
            if (c.type === 'heal') {
                _engine.applyHeal(c.healPct ?? 0.5); // ✅ proper heal — no maxHp inflation
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
    dom.sumTime.textContent  = `${m}:${s}`;
    dom.sumKills.textContent = kills.toLocaleString();

    // ── Soul calculation lives in the parent (survivor.js) via callback ──
    // But we do it here since we have all the data; parent just gets saveMeta()
    let earned = Math.floor(kills / 10);
    if (isWin) earned = Math.floor(earned * 1.5);
    earned = Math.floor(earned * (1 + (_meta.upgrades.greed || 0) * 0.05));
    dom.sumSouls.textContent = `+${earned.toLocaleString()}`;

    _meta.souls += earned;

    const isNewRecord = t > (_meta.stats.highestTime || 0);
    if (isNewRecord) {
        _meta.stats.highestTime = t;
        dom.sumRecordRow.style.display = '';
        dom.sumRecord.textContent = `${m}:${s}`;
    } else {
        dom.sumRecordRow.style.display = 'none';
    }

    _metaCb.saveMeta(); // ✅ single save point, owned by parent

    dom.btnCamp.onclick = () => { dom.sum.style.display = 'none'; exitCallback(); };
}