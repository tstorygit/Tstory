// js/games/tbb/tbb.js — Turn-Based Battle (TBB) vocabulary game
// export { init, launch }

import { mountVocabSelector } from '../../vocab_selector.js';
import { spawnEnemy }         from './tbb_enemies.js';
import { getFloorAction }     from './tbb_floors.js';
import { PERK_DEFS, REBIRTH_MIN_LEVEL, REBIRTH_AP_DIVIDER,
         totalApSpent, canSpendAp, computePerkBonuses, calcRebirthAp } from './tbb_ascension.js';
import { handlePlayerAttack, handlePlayerDefense, actionExp,
         timeAdjustExp, applyExpBonuses, expToNextLevel,
         generateMcOptions } from './tbb_battle.js';

// ─── Module State ─────────────────────────────────────────────────────────────
let _screens  = null;
let _onExit   = null;
let _selector = null;
let _vocabQueue = [];

const SAVE_KEY   = 'tbb_save';
const BANNED_KEY = 'tbb_banned_words';

// Base player constants
const BASE_HP  = 60;
const BASE_ATK = 15;
const BASE_DEF = 5;
const BASE_SPD = 10;
const STAT_PTS_PER_LEVEL = 2;
const VIT_HP  = 5;
const STR_ATK = 1;
const END_DEF = 1;
const AGI_SPD = 1;
const BASE_ANSWER_SECS = 20;
const MIN_ANSWER_SECS  = 5;
const MAX_FLOORS = 100;
const ENEMIES_PER_FLOOR_UNLOCK = 1;

// ─── Game State (_g) ──────────────────────────────────────────────────────────
let _g = null;

function _defaultSave() {
    return {
        playerLevel:          1,
        playerCurrentExp:     0,
        allocatedVit:         0,
        allocatedStr:         0,
        allocatedEnd:         0,
        allocatedAgi:         0,
        statPointsToAllocate: 0,
        ascensionPoints:      0,
        perkLevels:           {},
        maxUnlockedFloor:     0,
        highestFloor:         0,
        totalEnemiesDefeated: 0,
        ascensionCount:       0,
    };
}

function _loadSave() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return _defaultSave();
        return Object.assign(_defaultSave(), JSON.parse(raw));
    } catch { return _defaultSave(); }
}

function _writeSave() {
    const s = {
        playerLevel:          _g.playerLevel,
        playerCurrentExp:     _g.playerCurrentExp,
        allocatedVit:         _g.allocatedVit,
        allocatedStr:         _g.allocatedStr,
        allocatedEnd:         _g.allocatedEnd,
        allocatedAgi:         _g.allocatedAgi,
        statPointsToAllocate: _g.statPointsToAllocate,
        ascensionPoints:      _g.ascensionPoints,
        perkLevels:           Object.assign({}, _g.perkLevels),
        maxUnlockedFloor:     _g.maxUnlockedFloor,
        highestFloor:         Math.max(_g.maxUnlockedFloor, _g.currentFloor),
        totalEnemiesDefeated: _g.totalEnemiesDefeated,
        ascensionCount:       _g.ascensionCount,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}

function _computeDerivedStats() {
    const pb = computePerkBonuses(_g.perkLevels);
    _g._pb = pb;
    _g.playerHp  = BASE_HP  + pb.hpBonus  + _g.allocatedVit * VIT_HP;
    _g.playerAtk = BASE_ATK + pb.atkBonus + _g.allocatedStr * STR_ATK;
    _g.playerDef = BASE_DEF + pb.defBonus + _g.allocatedEnd * END_DEF;
    _g.playerSpd = BASE_SPD + pb.spdBonus + _g.allocatedAgi * AGI_SPD;
    _g.answerSecs = Math.max(MIN_ANSWER_SECS, BASE_ANSWER_SECS + pb.answerTimeSecs);
    _g.expToNext  = expToNextLevel(_g.playerLevel);
}

function _initGameState() {
    const sv = _loadSave();
    _g = Object.assign({}, sv, {
        // Session state (not persisted)
        currentHp:            0,
        enemy:                null,
        enemyHp:              0,
        currentFloor:         0,
        enemiesOnFloorKilled: 0,
        phase:                'idle',  // idle|player_attack|player_defense|summary|game_over|floor_action
        narration:            'Entering the dungeon…',
        attackType:           'slash',
        // challenge
        challengeWord:        null,
        mcOptions:            [],
        correctIdx:           -1,
        answerDisabled:       false,
        answerTimeLeft:       1.0, // fraction 0-1
        // derived (computed)
        playerHp:0, playerAtk:0, playerDef:0, playerSpd:0, answerSecs:0, expToNext:0, _pb:null,
        // ui helpers
        floatEvents:          [],
        showLvlUp:            false,
        combatFeedback:       null,
    });
    _computeDerivedStats();
    _g.currentHp = _g.playerHp;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function init(screens, onExit) {
    _screens = screens;
    _onExit  = onExit;
}

export function launch() {
    _injectStyles();
    _show('setup');
    _renderSetup();
}

// ─── Screen Management ────────────────────────────────────────────────────────
const _titles = {
    setup:   '⚔️ TBB — Setup',
    game:    '⚔️ Turn-Based Battle',
    summary: '⚔️ TBB — Summary',
};

function _show(name) {
    Object.entries(_screens).forEach(([k, el]) => {
        if (!el) return;
        if (k === name) {
            el.style.display = (name === 'game') ? 'flex' : 'block';
            if (name === 'game') { el.style.flexDirection='column'; el.style.padding='0'; el.style.overflow='hidden'; }
            else                 { el.style.padding=''; el.style.overflow=''; }
        } else {
            el.style.display = 'none';
        }
    });
    const hdr = document.getElementById('games-header-title');
    if (hdr) hdr.textContent = _titles[name] || '⚔️ TBB';
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function _renderSetup() {
    const el = _screens.setup;
    if (!el) return;

    _selector = mountVocabSelector(el, {
        bannedKey:    BANNED_KEY,
        defaultCount: 20,
        title:        'Turn-Based Battle — Choose Vocabulary',
    });

    const actions = _selector.getActionsEl();

    const startBtn = document.createElement('button');
    startBtn.className   = 'primary-btn';
    startBtn.style.marginTop = '8px';
    startBtn.textContent = '⚔️ Start Battle';
    startBtn.addEventListener('click', _startGame);

    const backBtn = document.createElement('button');
    backBtn.className   = 'caro-back-btn';
    backBtn.style.marginTop = '6px';
    backBtn.textContent = '← Back to Games';
    backBtn.addEventListener('click', _onExit);

    actions.append(startBtn, backBtn);
}

// ─── Game Initialisation ──────────────────────────────────────────────────────
function _startGame() {
    const queue = _selector.getQueue();
    if (!queue.length) return;

    _vocabQueue = queue.map(w => ({ word: w.word, furi: w.furi || w.word, trans: w.trans || '—' }));
    _initGameState();

    _show('game');
    _buildGameDOM();
    _spawnEnemyAndBegin();
}

let _timerInterval  = null;
let _pauseTimer     = false;

function _spawnEnemyAndBegin() {
    _g.enemy   = spawnEnemy(_g.currentFloor);
    _g.enemyHp = _g.enemy.maxHp;
    _g.narration = `${_g.enemy.emoji} ${_g.enemy.name} appears! (Lv.${_g.enemy.level})`;
    _g.enemiesOnFloorKilled = 0;
    const playerFirst = _g.playerSpd >= _g.enemy.spd;
    _g.phase = playerFirst ? 'player_attack' : 'player_defense';
    _prepareChallenge();
    _renderAll();
}

function _prepareChallenge() {
    if (!_vocabQueue.length) return;
    const word = _vocabQueue[Math.floor(Math.random() * _vocabQueue.length)];
    _g.challengeWord  = word;
    _g.mcOptions      = generateMcOptions(word, _vocabQueue);
    _g.correctIdx     = _g.mcOptions.indexOf(word.trans);
    _g.answerDisabled = false;
    _g.answerTimeLeft = 1.0;
    _startAnswerTimer();
}

function _startAnswerTimer() {
    if (_timerInterval) clearInterval(_timerInterval);
    _pauseTimer = false;
    const totalMs = _g.answerSecs * 1000;
    const startMs = Date.now();
    _timerInterval = setInterval(() => {
        if (_pauseTimer) return;
        const elapsed  = Date.now() - startMs;
        _g.answerTimeLeft = Math.max(0, 1 - elapsed / totalMs);
        _updateTimerBar();
        if (_g.answerTimeLeft <= 0) {
            clearInterval(_timerInterval);
            _onAnswer(-1, true); // timeout
        }
    }, 80);
}

function _stopTimer() {
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = null;
}

// ─── Answer Handling ──────────────────────────────────────────────────────────
function _onAnswer(idx, timedOut = false) {
    if (_g.answerDisabled) return;
    _g.answerDisabled = true;
    _stopTimer();

    const isCorrect = !timedOut && idx === _g.correctIdx;
    const timeFrac  = timedOut ? 0 : _g.answerTimeLeft;
    const word      = _g.challengeWord;
    const enemy     = _g.enemy;

    // Highlight buttons
    _markMcButtons(idx, isCorrect);

    if (_g.phase === 'player_attack') {
        const { dmg, narration, feedback } = handlePlayerAttack(_g, word, isCorrect, _g.attackType);
        _g.enemy.hp = undefined; // enemy hp tracked separately
        _g.enemyHp  = Math.max(0, _g.enemyHp - dmg);
        _g.narration = narration;
        _g.combatFeedback = feedback;
        _spawnFloatEnemy(`-${dmg}`, '#e74c3c');

        let rawExp = actionExp(enemy.expYield, isCorrect);
        rawExp = timeAdjustExp(rawExp, timeFrac);
        _addExp(applyExpBonuses(rawExp, _g._pb.additiveExpPct, _g._pb.multExpPct));
    } else {
        const { dmg, narration, feedback } = handlePlayerDefense(_g, isCorrect);
        _g.currentHp   = Math.max(0, _g.currentHp - dmg);
        _g.narration   = narration;
        _g.combatFeedback = feedback;
        _spawnFloatPlayer(`-${dmg}`, '#e74c3c');

        let rawExp = actionExp(enemy.expYield, isCorrect);
        rawExp = timeAdjustExp(rawExp, timeFrac);
        _addExp(applyExpBonuses(rawExp, _g._pb.additiveExpPct, _g._pb.multExpPct));
    }

    // Redraw HP bars instantly
    _updateHpBars();
    _updateNarration();
    _updateStats();

    // Advance after short pause
    setTimeout(() => _advanceTurn(), 1200);
}

function _advanceTurn() {
    const phase = _g.phase;

    if (phase === 'player_attack') {
        if (_g.enemyHp <= 0) {
            _handleEnemyDefeated();
        } else {
            _g.phase = 'player_defense';
            _prepareChallenge();
            _renderChallenge();
            _renderAll();
        }
    } else { // player_defense
        if (_g.currentHp <= 0) {
            _handlePlayerDefeated();
        } else {
            _g.phase = 'player_attack';
            _prepareChallenge();
            _renderChallenge();
            _renderAll();
        }
    }
}

function _handleEnemyDefeated() {
    _g.totalEnemiesDefeated++;
    _g.enemiesOnFloorKilled++;
    _addExp(applyExpBonuses(_g.enemy.expYield, _g._pb.additiveExpPct, _g._pb.multExpPct));

    const unlocked = _g.enemiesOnFloorKilled >= ENEMIES_PER_FLOOR_UNLOCK
        && _g.currentFloor === _g.maxUnlockedFloor
        && _g.maxUnlockedFloor < MAX_FLOORS - 1;

    if (unlocked) {
        _g.maxUnlockedFloor++;
        _g.narration += `\n🗺️ New floor unlocked: ${_g.maxUnlockedFloor}!`;
    }

    _writeSave();
    _g.phase = 'summary';
    _renderSummaryOverlay();
}

function _handlePlayerDefeated() {
    _writeSave();
    _g.phase = 'game_over';
    _renderGameOverOverlay();
}

// ─── EXP & Levelling ─────────────────────────────────────────────────────────
function _addExp(amount) {
    if (amount <= 0) return;
    _spawnFloatPlayer(`+${amount} EXP`, '#3498db');
    _g.playerCurrentExp += amount;

    while (_g.playerCurrentExp >= _g.expToNext) {
        _g.playerCurrentExp -= _g.expToNext;
        _g.playerLevel++;
        _g.statPointsToAllocate += STAT_PTS_PER_LEVEL;
        _computeDerivedStats();
        // Restore HP delta from VIT
        _g.currentHp = Math.min(_g.currentHp, _g.playerHp);
        _g.showLvlUp = true;
        setTimeout(() => { _g.showLvlUp = false; _updateStats(); }, 3000);
    }
    _computeDerivedStats();
    _updateStats();
    _updateExpBar();
}

// ─── DOM Building ─────────────────────────────────────────────────────────────
let _dom = {};

function _buildGameDOM() {
    const root = _screens.game;
    root.innerHTML = '';
    root.className = 'tbb-root';

    root.innerHTML = `
    <div class="tbb-header">
        <span class="tbb-floor-label">Floor <span id="tbb-floor">0</span></span>
        <span class="tbb-narration" id="tbb-narration">—</span>
        <button class="tbb-menu-btn" id="tbb-menu-btn">☰</button>
    </div>

    <div class="tbb-status-row">
        <!-- Player (LEFT) -->
        <div class="tbb-combatant tbb-player-side">
            <div class="tbb-combatant-name">
                <span>🧙 Player</span>
                <span class="tbb-lvl-badge" id="tbb-plvl">Lv.1</span>
                <span class="tbb-lvlup-notif" id="tbb-lvlup">▲ LEVEL UP!</span>
            </div>
            <div class="tbb-bar-wrap">
                <div class="tbb-bar tbb-hp-bar" id="tbb-player-hp-bar" style="width:100%"></div>
            </div>
            <div class="tbb-bar-label" id="tbb-player-hp-label">60 / 60 HP</div>
            <div class="tbb-bar-wrap tbb-exp-wrap">
                <div class="tbb-bar tbb-exp-bar" id="tbb-exp-bar" style="width:0%"></div>
            </div>
            <div class="tbb-bar-label tbb-exp-label" id="tbb-exp-label">0 / 100 EXP</div>
            <div class="tbb-float-anchor" id="tbb-float-player"></div>
        </div>

        <!-- VS -->
        <div class="tbb-vs">⚔️</div>

        <!-- Enemy (RIGHT) -->
        <div class="tbb-combatant tbb-enemy-side">
            <div class="tbb-combatant-name tbb-enemy-name-row">
                <span class="tbb-lvl-badge" id="tbb-elvl">Lv.?</span>
                <span id="tbb-enemy-name">—</span>
            </div>
            <div class="tbb-bar-wrap">
                <div class="tbb-bar tbb-enemy-hp-bar" id="tbb-enemy-hp-bar" style="width:100%"></div>
            </div>
            <div class="tbb-bar-label tbb-right-align" id="tbb-enemy-hp-label">— HP</div>
            <div class="tbb-enemy-emoji" id="tbb-enemy-emoji">❓</div>
            <div class="tbb-float-anchor" id="tbb-float-enemy"></div>
        </div>
    </div>

    <div class="tbb-phase-label" id="tbb-phase-label">⚔️ Your Attack</div>

    <div class="tbb-challenge-area">
        <div class="tbb-word-display" id="tbb-word-display">
            <div class="tbb-word-furi" id="tbb-word-furi"></div>
            <div class="tbb-word-kanji" id="tbb-word-kanji">—</div>
        </div>
        <div class="tbb-timer-wrap">
            <div class="tbb-timer-bar" id="tbb-timer-bar"></div>
        </div>
        <div class="tbb-mc-grid" id="tbb-mc-grid">
            <button class="tbb-mc-btn" data-idx="0"></button>
            <button class="tbb-mc-btn" data-idx="1"></button>
            <button class="tbb-mc-btn" data-idx="2"></button>
            <button class="tbb-mc-btn" data-idx="3"></button>
        </div>
    </div>

    <div class="tbb-footer">
        <div class="tbb-attack-types" id="tbb-attack-types">
            <button class="tbb-atk-btn active" data-type="slash" title="Slash">🗡</button>
            <button class="tbb-atk-btn" data-type="pierce" title="Pierce">🏹</button>
            <button class="tbb-atk-btn" data-type="magic" title="Magic">✨</button>
        </div>
        <div class="tbb-stat-pills" id="tbb-stat-pills">
            <span class="tbb-pill tbb-atk-pill" id="tbb-atk-pill">ATK 15</span>
            <span class="tbb-pill tbb-def-pill" id="tbb-def-pill">DEF 5</span>
            <span class="tbb-pill tbb-spd-pill" id="tbb-spd-pill">SPD 10</span>
        </div>
        <button class="tbb-stats-btn" id="tbb-stats-btn" title="Stats">📊</button>
    </div>

    <div class="tbb-overlay" id="tbb-overlay" style="display:none"></div>
    `;

    // Cache refs
    _dom = {
        floor:        root.querySelector('#tbb-floor'),
        narration:    root.querySelector('#tbb-narration'),
        phaseLabel:   root.querySelector('#tbb-phase-label'),
        playerHpBar:  root.querySelector('#tbb-player-hp-bar'),
        playerHpLbl:  root.querySelector('#tbb-player-hp-label'),
        expBar:       root.querySelector('#tbb-exp-bar'),
        expLbl:       root.querySelector('#tbb-exp-label'),
        plvl:         root.querySelector('#tbb-plvl'),
        lvlup:        root.querySelector('#tbb-lvlup'),
        enemyHpBar:   root.querySelector('#tbb-enemy-hp-bar'),
        enemyHpLbl:   root.querySelector('#tbb-enemy-hp-label'),
        enemyName:    root.querySelector('#tbb-enemy-name'),
        enemyEmoji:   root.querySelector('#tbb-enemy-emoji'),
        elvl:         root.querySelector('#tbb-elvl'),
        wordFuri:     root.querySelector('#tbb-word-furi'),
        wordKanji:    root.querySelector('#tbb-word-kanji'),
        timerBar:     root.querySelector('#tbb-timer-bar'),
        mcGrid:       root.querySelector('#tbb-mc-grid'),
        mcBtns:       root.querySelectorAll('.tbb-mc-btn'),
        atkBtns:      root.querySelectorAll('.tbb-atk-btn'),
        atkPill:      root.querySelector('#tbb-atk-pill'),
        defPill:      root.querySelector('#tbb-def-pill'),
        spdPill:      root.querySelector('#tbb-spd-pill'),
        floatPlayer:  root.querySelector('#tbb-float-player'),
        floatEnemy:   root.querySelector('#tbb-float-enemy'),
        overlay:      root.querySelector('#tbb-overlay'),
    };

    // Wire MC buttons
    _dom.mcBtns.forEach(btn => {
        btn.addEventListener('click', () => _onAnswer(parseInt(btn.dataset.idx)));
    });

    // Wire attack type buttons
    _dom.atkBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            _g.attackType = btn.dataset.type;
            _dom.atkBtns.forEach(b => b.classList.toggle('active', b === btn));
        });
    });

    // Stats panel
    root.querySelector('#tbb-stats-btn').addEventListener('click', _showStatsPanel);
    root.querySelector('#tbb-menu-btn').addEventListener('click', _showMenuOverlay);
}

// ─── Render Helpers ───────────────────────────────────────────────────────────
function _renderAll() {
    _updateHpBars();
    _updateExpBar();
    _updateStats();
    _updateNarration();
    _renderChallenge();
}

function _updateHpBars() {
    const pFrac = _g.currentHp / _g.playerHp;
    _dom.playerHpBar.style.width = (pFrac * 100).toFixed(1) + '%';
    _dom.playerHpBar.style.background = pFrac > 0.5 ? 'var(--tbb-hp-green)' : pFrac > 0.25 ? 'var(--tbb-hp-yellow)' : 'var(--tbb-hp-red)';
    _dom.playerHpLbl.textContent = `${_g.currentHp} / ${_g.playerHp} HP`;

    if (_g.enemy) {
        const eFrac = _g.enemyHp / _g.enemy.maxHp;
        _dom.enemyHpBar.style.width = (eFrac * 100).toFixed(1) + '%';
        _dom.enemyHpBar.style.background = eFrac > 0.5 ? 'var(--tbb-hp-green)' : eFrac > 0.25 ? 'var(--tbb-hp-yellow)' : 'var(--tbb-hp-red)';
        _dom.enemyHpLbl.textContent = `${_g.enemyHp} / ${_g.enemy.maxHp} HP`;
        _dom.enemyName.textContent  = _g.enemy.name;
        _dom.enemyEmoji.textContent = _g.enemy.emoji;
        _dom.elvl.textContent       = `Lv.${_g.enemy.level}`;
    }
    _dom.floor.textContent = _g.currentFloor;
}

function _updateExpBar() {
    const frac = _g.expToNext > 0 ? _g.playerCurrentExp / _g.expToNext : 0;
    _dom.expBar.style.width = (frac * 100).toFixed(1) + '%';
    _dom.expLbl.textContent = `${_g.playerCurrentExp} / ${_g.expToNext} EXP`;
    _dom.plvl.textContent   = `Lv.${_g.playerLevel}`;
    _dom.lvlup.style.opacity = _g.showLvlUp ? '1' : '0';
}

function _updateStats() {
    _dom.atkPill.textContent = `ATK ${_g.playerAtk}`;
    _dom.defPill.textContent = `DEF ${_g.playerDef}`;
    _dom.spdPill.textContent = `SPD ${_g.playerSpd}`;
    if (_g.statPointsToAllocate > 0) {
        _dom.atkPill.dataset.points = _g.statPointsToAllocate;
        _dom.atkPill.title = `${_g.statPointsToAllocate} stat point(s) available! Click 📊 to allocate.`;
    }
}

function _updateNarration() {
    _dom.narration.textContent = _g.narration || '—';
    const phase = _g.phase;
    if (phase === 'player_attack')  { _dom.phaseLabel.textContent = '⚔️ Attack Phase'; _dom.phaseLabel.className = 'tbb-phase-label tbb-phase-attack'; }
    else if (phase === 'player_defense') { _dom.phaseLabel.textContent = '🛡 Defend Phase'; _dom.phaseLabel.className = 'tbb-phase-label tbb-phase-defend'; }
    else { _dom.phaseLabel.textContent = ''; _dom.phaseLabel.className = 'tbb-phase-label'; }
}

function _renderChallenge() {
    if (!_g.challengeWord) return;
    _dom.wordFuri.textContent  = _g.challengeWord.furi !== _g.challengeWord.word ? _g.challengeWord.furi : '';
    _dom.wordKanji.textContent = _g.challengeWord.word;
    _dom.mcBtns.forEach((btn, i) => {
        btn.textContent  = _g.mcOptions[i] ?? '—';
        btn.className    = 'tbb-mc-btn';
        btn.disabled     = false;
    });
}

function _markMcButtons(chosenIdx, isCorrect) {
    _dom.mcBtns.forEach((btn, i) => {
        btn.disabled = true;
        if (i === _g.correctIdx) btn.classList.add('tbb-mc-correct');
        else if (i === chosenIdx && !isCorrect) btn.classList.add('tbb-mc-wrong');
    });
}

function _updateTimerBar() {
    _dom.timerBar.style.width = (_g.answerTimeLeft * 100).toFixed(1) + '%';
    _dom.timerBar.style.background = _g.answerTimeLeft > 0.5 ? 'var(--tbb-timer-ok)' : _g.answerTimeLeft > 0.25 ? 'var(--tbb-timer-warn)' : 'var(--tbb-timer-crit)';
}

// ─── Floating Numbers ─────────────────────────────────────────────────────────
function _spawnFloat(anchor, text, color) {
    const el = document.createElement('span');
    el.className = 'tbb-float';
    el.textContent = text;
    el.style.color = color;
    anchor.appendChild(el);
    setTimeout(() => el.remove(), 900);
}
function _spawnFloatPlayer(text, color) { _spawnFloat(_dom.floatPlayer, text, color); }
function _spawnFloatEnemy(text, color)  { _spawnFloat(_dom.floatEnemy,  text, color); }

// ─── Overlays ─────────────────────────────────────────────────────────────────
function _showOverlay(html) {
    _dom.overlay.innerHTML = html;
    _dom.overlay.style.display = 'flex';
    _pauseTimer = true;
}
function _closeOverlay() {
    _dom.overlay.style.display = 'none';
    _pauseTimer = false;
}

function _renderSummaryOverlay() {
    const e = _g.enemy;
    _showOverlay(`
        <div class="tbb-dialog">
            <div class="tbb-dialog-title">⚔️ Victory!</div>
            <div class="tbb-dialog-body">
                <p>${e.emoji} <b>${e.name}</b> (Lv.${e.level}) defeated!</p>
                <p>Floor: ${_g.currentFloor} | Enemies: ${_g.totalEnemiesDefeated}</p>
                ${_g.maxUnlockedFloor > _g.currentFloor ? `<p class="tbb-unlocked">🗺️ Floor ${_g.maxUnlockedFloor} unlocked!</p>` : ''}
            </div>
            <div class="tbb-dialog-actions">
                <button class="tbb-dialog-btn tbb-dialog-btn-primary" id="tbb-next-btn">Next Enemy ▶</button>
                ${_g.maxUnlockedFloor > _g.currentFloor ? `<button class="tbb-dialog-btn" id="tbb-nextfloor-btn">Go to Floor ${_g.maxUnlockedFloor} ▶</button>` : ''}
            </div>
        </div>
    `);
    _dom.overlay.querySelector('#tbb-next-btn').addEventListener('click', () => {
        _closeOverlay();
        _spawnEnemyAndBegin();
    });
    const nextFloorBtn = _dom.overlay.querySelector('#tbb-nextfloor-btn');
    if (nextFloorBtn) nextFloorBtn.addEventListener('click', () => {
        _g.currentFloor = _g.maxUnlockedFloor;
        _closeOverlay();
        _spawnEnemyAndBegin();
    });
}

function _renderGameOverOverlay() {
    const canRebirth = _g.playerLevel >= REBIRTH_MIN_LEVEL;
    const apGain = canRebirth ? Math.floor(_g.playerLevel / REBIRTH_AP_DIVIDER) : 0;

    _showOverlay(`
        <div class="tbb-dialog tbb-dialog-over">
            <div class="tbb-dialog-title tbb-red">💀 Defeated!</div>
            <div class="tbb-dialog-body">
                <p>You fell on Floor <b>${_g.currentFloor}</b>.</p>
                <p>Player Lv.${_g.playerLevel} | Enemies slain: ${_g.totalEnemiesDefeated}</p>
                ${canRebirth ? `<p class="tbb-rebirth-info">🔄 Rebirth available! Gain <b>${apGain} AP</b> and start fresh with permanent perks.</p>` : `<p class="tbb-muted">Reach Lv.${REBIRTH_MIN_LEVEL} to unlock Rebirth.</p>`}
            </div>
            <div class="tbb-dialog-actions">
                ${canRebirth ? `<button class="tbb-dialog-btn tbb-rebirth-btn" id="tbb-rebirth-btn">🔄 Rebirth (+${apGain} AP)</button>` : ''}
                <button class="tbb-dialog-btn tbb-dialog-btn-primary" id="tbb-retry-btn">Retry (same stats)</button>
                <button class="tbb-dialog-btn" id="tbb-exit-btn">Exit</button>
            </div>
        </div>
    `);
    _dom.overlay.querySelector('#tbb-retry-btn').addEventListener('click', () => {
        _closeOverlay();
        _computeDerivedStats();
        _g.currentHp = _g.playerHp;
        _g.currentFloor = 0;
        _spawnEnemyAndBegin();
    });
    const rebirthBtn = _dom.overlay.querySelector('#tbb-rebirth-btn');
    if (rebirthBtn) rebirthBtn.addEventListener('click', () => {
        _closeOverlay();
        _doRebirth();
    });
    _dom.overlay.querySelector('#tbb-exit-btn').addEventListener('click', () => {
        _stopTimer();
        _closeOverlay();
        _onExit();
    });
}

function _doRebirth() {
    const ap = Math.floor(_g.playerLevel / REBIRTH_AP_DIVIDER);
    _g.ascensionPoints += ap;
    _g.ascensionCount++;
    _g.playerLevel = 1;
    _g.playerCurrentExp = 0;
    _g.allocatedVit = 0; _g.allocatedStr = 0; _g.allocatedEnd = 0; _g.allocatedAgi = 0;
    _computeDerivedStats();
    _g.statPointsToAllocate = _g._pb.bonusStatPts;
    _g.currentHp = _g.playerHp;
    _g.currentFloor = 0;
    _writeSave();
    _spawnEnemyAndBegin();
}

// ─── Stats Panel ─────────────────────────────────────────────────────────────
function _showStatsPanel() {
    const pb  = _g._pb;
    const pts = _g.statPointsToAllocate;

    const statRow = (label, allocated, total, stat, pts) => `
        <div class="tbb-stat-row">
            <span class="tbb-stat-name">${label}</span>
            <span class="tbb-stat-val">${total}</span>
            ${pts > 0 ? `<button class="tbb-alloc-btn" data-stat="${stat}">+</button>` : '<span class="tbb-alloc-placeholder"></span>'}
        </div>`;

    _showOverlay(`
        <div class="tbb-dialog tbb-stats-dialog">
            <div class="tbb-dialog-title">📊 Stats — Lv.${_g.playerLevel}</div>
            <div class="tbb-dialog-body">
                <p class="tbb-muted">Stat Points: <b style="color:var(--tbb-accent)">${pts}</b></p>
                ${statRow('❤️ VIT → HP',  _g.allocatedVit, _g.playerHp,  'vit', pts)}
                ${statRow('⚔️ STR → ATK', _g.allocatedStr, _g.playerAtk, 'str', pts)}
                ${statRow('🛡 END → DEF', _g.allocatedEnd, _g.playerDef, 'end', pts)}
                ${statRow('💨 AGI → SPD', _g.allocatedAgi, _g.playerSpd, 'agi', pts)}
                <hr class="tbb-hr">
                <p class="tbb-muted">Ascension: ${_g.ascensionCount}× | AP: <b>${_g.ascensionPoints}</b></p>
                <button class="tbb-dialog-btn tbb-rebirth-info-btn" id="tbb-perks-btn">🌟 View Perks</button>
                ${_g.playerLevel >= REBIRTH_MIN_LEVEL ? `<button class="tbb-dialog-btn tbb-rebirth-btn" id="tbb-rebirth-stats-btn">🔄 Rebirth (+${calcRebirthAp(_g.playerLevel)} AP)</button>` : ''}
                <button class="tbb-dialog-btn tbb-respec-btn" id="tbb-respec-btn">↩ Respec Points</button>
            </div>
            <div class="tbb-dialog-actions">
                <button class="tbb-dialog-btn tbb-dialog-btn-primary" id="tbb-stats-close">Done</button>
            </div>
        </div>
    `);

    _dom.overlay.querySelectorAll('.tbb-alloc-btn').forEach(btn => {
        btn.addEventListener('click', () => _allocateStat(btn.dataset.stat));
    });
    _dom.overlay.querySelector('#tbb-stats-close').addEventListener('click', _closeOverlay);
    _dom.overlay.querySelector('#tbb-perks-btn').addEventListener('click', _showPerksPanel);
    const rebirthBtn2 = _dom.overlay.querySelector('#tbb-rebirth-stats-btn');
    if (rebirthBtn2) rebirthBtn2.addEventListener('click', () => { _closeOverlay(); _renderRebirthConfirm(); });
    _dom.overlay.querySelector('#tbb-respec-btn').addEventListener('click', () => {
        _g.statPointsToAllocate += _g.allocatedVit + _g.allocatedStr + _g.allocatedEnd + _g.allocatedAgi;
        _g.allocatedVit = _g.allocatedStr = _g.allocatedEnd = _g.allocatedAgi = 0;
        _computeDerivedStats();
        _g.currentHp = Math.min(_g.currentHp, _g.playerHp);
        _writeSave();
        _closeOverlay();
        _showStatsPanel();
    });
}

function _allocateStat(stat) {
    if (_g.statPointsToAllocate <= 0) return;
    const prevHp = _g.playerHp;
    if (stat === 'vit') _g.allocatedVit++;
    else if (stat === 'str') _g.allocatedStr++;
    else if (stat === 'end') _g.allocatedEnd++;
    else if (stat === 'agi') _g.allocatedAgi++;
    _g.statPointsToAllocate--;
    _computeDerivedStats();
    if (stat === 'vit') _g.currentHp = Math.min(_g.currentHp + (_g.playerHp - prevHp), _g.playerHp);
    _writeSave();
    _closeOverlay();
    _showStatsPanel();
}

function _showPerksPanel() {
    const apSpent = totalApSpent(_g.perkLevels);
    const rows = Object.entries(PERK_DEFS).map(([key, def]) => {
        const current  = _g.perkLevels[key] ?? 0;
        const unlocked = apSpent >= def.apReq;
        const maxed    = current >= def.maxLvl;
        const canBuy   = canSpendAp(key, _g.perkLevels, _g.ascensionPoints);
        return `<div class="tbb-perk-row ${unlocked ? '' : 'tbb-perk-locked'}">
            <div class="tbb-perk-info">
                <b>${def.name}</b> <span class="tbb-muted">(T${def.tier})</span><br>
                <span class="tbb-muted">${def.desc} — ${current}/${def.maxLvl}</span>
                ${!unlocked ? `<br><span class="tbb-red">Req ${def.apReq} AP spent</span>` : ''}
            </div>
            ${canBuy ? `<button class="tbb-alloc-btn" data-perk="${key}">+${def.cost}AP</button>` : (maxed ? '<span class="tbb-muted">MAX</span>' : '')}
        </div>`;
    }).join('');

    _showOverlay(`
        <div class="tbb-dialog tbb-stats-dialog">
            <div class="tbb-dialog-title">🌟 Ascension Perks (${_g.ascensionPoints} AP)</div>
            <div class="tbb-dialog-body tbb-perk-list">${rows}</div>
            <div class="tbb-dialog-actions">
                <button class="tbb-dialog-btn tbb-dialog-btn-primary" id="tbb-perks-close">Back</button>
            </div>
        </div>
    `);
    _dom.overlay.querySelectorAll('[data-perk]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.perk;
            if (!canSpendAp(key, _g.perkLevels, _g.ascensionPoints)) return;
            const def = PERK_DEFS[key];
            _g.perkLevels[key] = (_g.perkLevels[key] ?? 0) + 1;
            _g.ascensionPoints -= def.cost;
            _computeDerivedStats();
            _writeSave();
            _closeOverlay();
            _showPerksPanel();
        });
    });
    _dom.overlay.querySelector('#tbb-perks-close').addEventListener('click', () => { _closeOverlay(); _showStatsPanel(); });
}

function _renderRebirthConfirm() {
    const ap = calcRebirthAp(_g.playerLevel);
    _showOverlay(`
        <div class="tbb-dialog">
            <div class="tbb-dialog-title tbb-red">🔄 Confirm Rebirth</div>
            <div class="tbb-dialog-body">
                <p>Reset to Lv.1. Gain <b>${ap} AP</b>. All stat allocations reset.</p>
                <p class="tbb-muted">Perk levels are kept. Max unlocked floor is kept.</p>
            </div>
            <div class="tbb-dialog-actions">
                <button class="tbb-dialog-btn tbb-rebirth-btn" id="tbb-confirm-rebirth">🔄 Rebirth</button>
                <button class="tbb-dialog-btn" id="tbb-cancel-rebirth">Cancel</button>
            </div>
        </div>
    `);
    _dom.overlay.querySelector('#tbb-confirm-rebirth').addEventListener('click', () => { _closeOverlay(); _doRebirth(); });
    _dom.overlay.querySelector('#tbb-cancel-rebirth').addEventListener('click', _closeOverlay);
}

function _showMenuOverlay() {
    _showOverlay(`
        <div class="tbb-dialog">
            <div class="tbb-dialog-title">☰ Menu</div>
            <div class="tbb-dialog-body">
                <p>Floor: ${_g.currentFloor} / ${_g.maxUnlockedFloor} unlocked</p>
                <p>Total enemies defeated: ${_g.totalEnemiesDefeated}</p>
                <div class="tbb-floor-selector">
                    <label>Jump to Floor:</label>
                    <input type="range" id="tbb-floor-range" min="0" max="${_g.maxUnlockedFloor}" value="${_g.currentFloor}" step="1">
                    <span id="tbb-floor-range-val">${_g.currentFloor}</span>
                </div>
            </div>
            <div class="tbb-dialog-actions">
                <button class="tbb-dialog-btn tbb-dialog-btn-primary" id="tbb-floor-go">Go to Floor</button>
                <button class="tbb-dialog-btn" id="tbb-menu-exit">Exit Game</button>
                <button class="tbb-dialog-btn" id="tbb-menu-close">Close</button>
            </div>
        </div>
    `);
    const range = _dom.overlay.querySelector('#tbb-floor-range');
    const val   = _dom.overlay.querySelector('#tbb-floor-range-val');
    range.addEventListener('input', () => { val.textContent = range.value; });
    _dom.overlay.querySelector('#tbb-floor-go').addEventListener('click', () => {
        _g.currentFloor = parseInt(range.value);
        _closeOverlay();
        _spawnEnemyAndBegin();
    });
    _dom.overlay.querySelector('#tbb-menu-exit').addEventListener('click', () => {
        _stopTimer();
        _closeOverlay();
        _onExit();
    });
    _dom.overlay.querySelector('#tbb-menu-close').addEventListener('click', _closeOverlay);
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
function _injectStyles() {
    if (document.getElementById('tbb-styles')) return;
    const s = document.createElement('style');
    s.id = 'tbb-styles';
    s.textContent = `
/* ── TBB Variables ─────────────────────────────────────────────────────── */
.tbb-root {
    --tbb-bg:         #1a1a2e;
    --tbb-surface:    #16213e;
    --tbb-card:       #0f3460;
    --tbb-accent:     #e94560;
    --tbb-accent2:    #f5a623;
    --tbb-text:       #eaeaea;
    --tbb-muted:      #8888aa;
    --tbb-hp-green:   #27ae60;
    --tbb-hp-yellow:  #f39c12;
    --tbb-hp-red:     #e74c3c;
    --tbb-timer-ok:   #27ae60;
    --tbb-timer-warn: #f39c12;
    --tbb-timer-crit: #e74c3c;
    --tbb-border:     rgba(255,255,255,0.08);
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: var(--tbb-bg);
    color: var(--tbb-text);
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    user-select: none;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.tbb-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--tbb-surface);
    border-bottom: 1px solid var(--tbb-border);
    min-height: 42px;
    flex-shrink: 0;
}
.tbb-floor-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--tbb-accent2);
    white-space: nowrap;
    background: rgba(245,166,35,0.12);
    padding: 3px 8px;
    border-radius: 20px;
}
.tbb-narration {
    flex: 1;
    font-size: 12px;
    color: var(--tbb-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.tbb-menu-btn {
    background: none;
    border: 1px solid var(--tbb-border);
    border-radius: 6px;
    color: var(--tbb-text);
    padding: 4px 9px;
    cursor: pointer;
    font-size: 14px;
}

/* ── Status Row ─────────────────────────────────────────────────────────── */
.tbb-status-row {
    display: flex;
    gap: 10px;
    padding: 10px 12px 6px;
    background: var(--tbb-surface);
    border-bottom: 1px solid var(--tbb-border);
    flex-shrink: 0;
    align-items: flex-start;
}
.tbb-combatant {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    position: relative;
}
.tbb-vs {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    padding-top: 8px;
    flex-shrink: 0;
}
.tbb-combatant-name {
    font-size: 12px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 5px;
}
.tbb-enemy-name-row {
    justify-content: flex-end;
}
.tbb-lvl-badge {
    background: var(--tbb-card);
    border: 1px solid var(--tbb-border);
    border-radius: 10px;
    font-size: 10px;
    padding: 1px 6px;
    color: var(--tbb-accent2);
    white-space: nowrap;
}
.tbb-lvlup-notif {
    font-size: 10px;
    font-weight: 900;
    color: #f1c40f;
    opacity: 0;
    transition: opacity 0.3s;
    text-shadow: 0 0 6px #f1c40f;
    animation: tbbPulse 0.6s infinite alternate;
}
.tbb-bar-wrap {
    height: 8px;
    background: rgba(255,255,255,0.08);
    border-radius: 4px;
    overflow: hidden;
}
.tbb-exp-wrap {
    height: 4px;
    margin-top: 1px;
}
.tbb-bar {
    height: 100%;
    border-radius: 4px;
    transition: width 0.35s ease, background 0.35s ease;
}
.tbb-exp-bar { background: #3498db; }
.tbb-bar-label {
    font-size: 10px;
    color: var(--tbb-muted);
    line-height: 1;
}
.tbb-exp-label { color: #3498db; font-size: 9px; }
.tbb-right-align { text-align: right; }
.tbb-enemy-emoji {
    font-size: 28px;
    text-align: right;
    line-height: 1;
    margin-top: 2px;
}
.tbb-float-anchor {
    position: absolute;
    top: 0; left: 0; right: 0;
    pointer-events: none;
    height: 0;
}

/* ── Phase Label ────────────────────────────────────────────────────────── */
.tbb-phase-label {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 4px 0;
    flex-shrink: 0;
}
.tbb-phase-attack  { color: var(--tbb-accent); }
.tbb-phase-defend  { color: #3498db; }

/* ── Challenge Area ─────────────────────────────────────────────────────── */
.tbb-challenge-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 10px 14px;
    gap: 10px;
    overflow: hidden;
}
.tbb-word-display {
    text-align: center;
    background: var(--tbb-surface);
    border: 1px solid var(--tbb-border);
    border-radius: 14px;
    padding: 12px 24px;
    width: 100%;
    max-width: 340px;
}
.tbb-word-furi  { font-size: 13px; color: var(--tbb-muted); min-height: 16px; }
.tbb-word-kanji { font-size: 30px; font-weight: 900; line-height: 1.2; }

/* ── Timer ──────────────────────────────────────────────────────────────── */
.tbb-timer-wrap {
    width: 100%;
    max-width: 340px;
    height: 6px;
    background: rgba(255,255,255,0.08);
    border-radius: 3px;
    overflow: hidden;
}
.tbb-timer-bar {
    height: 100%;
    border-radius: 3px;
    transition: width 0.08s linear, background 0.3s;
    width: 100%;
}

/* ── MC Grid (2×2) ──────────────────────────────────────────────────────── */
.tbb-mc-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
    max-width: 340px;
}
.tbb-mc-btn {
    background: var(--tbb-surface);
    border: 2px solid var(--tbb-border);
    border-radius: 10px;
    padding: 12px 8px;
    color: var(--tbb-text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s, transform 0.08s;
    text-align: center;
    line-height: 1.3;
    word-break: break-word;
}
.tbb-mc-btn:active:not(:disabled) { transform: scale(0.96); }
.tbb-mc-btn:hover:not(:disabled)  { border-color: var(--tbb-accent); background: var(--tbb-card); }
.tbb-mc-correct { background: #1a5c34 !important; border-color: #27ae60 !important; color: #2ecc71 !important; }
.tbb-mc-wrong   { background: #5c1a1a !important; border-color: var(--tbb-accent) !important; color: var(--tbb-accent) !important; }

/* ── Footer ─────────────────────────────────────────────────────────────── */
.tbb-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--tbb-surface);
    border-top: 1px solid var(--tbb-border);
    flex-shrink: 0;
}
.tbb-attack-types {
    display: flex;
    gap: 4px;
}
.tbb-atk-btn {
    background: var(--tbb-card);
    border: 2px solid var(--tbb-border);
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 16px;
    cursor: pointer;
    transition: border-color 0.15s;
    color: var(--tbb-text);
}
.tbb-atk-btn.active { border-color: var(--tbb-accent); box-shadow: 0 0 8px rgba(233,69,96,0.4); }
.tbb-stat-pills {
    flex: 1;
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    justify-content: center;
}
.tbb-pill {
    font-size: 10px;
    font-weight: 700;
    border-radius: 20px;
    padding: 3px 8px;
    background: var(--tbb-card);
    border: 1px solid var(--tbb-border);
}
.tbb-atk-pill { color: var(--tbb-accent); }
.tbb-def-pill { color: #3498db; }
.tbb-spd-pill { color: var(--tbb-accent2); }
.tbb-stats-btn {
    background: none;
    border: 1px solid var(--tbb-border);
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 16px;
    cursor: pointer;
    color: var(--tbb-text);
    transition: background 0.15s;
}
.tbb-stats-btn:hover { background: var(--tbb-card); }

/* ── Overlay & Dialog ───────────────────────────────────────────────────── */
.tbb-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 16px;
}
.tbb-dialog {
    background: var(--tbb-surface);
    border: 1px solid var(--tbb-border);
    border-radius: 16px;
    width: 100%;
    max-width: 340px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    max-height: 80vh;
    overflow-y: auto;
}
.tbb-dialog-title {
    font-size: 16px;
    font-weight: 900;
    color: var(--tbb-accent2);
    letter-spacing: 0.03em;
}
.tbb-dialog-body {
    font-size: 13px;
    line-height: 1.6;
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--tbb-text);
}
.tbb-dialog-body p { margin: 0; }
.tbb-dialog-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.tbb-dialog-btn {
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid var(--tbb-border);
    background: var(--tbb-card);
    color: var(--tbb-text);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
    text-align: center;
}
.tbb-dialog-btn:hover { background: rgba(255,255,255,0.08); }
.tbb-dialog-btn-primary { background: var(--tbb-accent); border-color: var(--tbb-accent); }
.tbb-dialog-btn-primary:hover { background: #c73652; }
.tbb-rebirth-btn { background: #6c3483; border-color: #8e44ad; }
.tbb-rebirth-btn:hover { background: #8e44ad; }
.tbb-respec-btn  { background: rgba(255,255,255,0.04); }

/* ── Stats Panel ────────────────────────────────────────────────────────── */
.tbb-stats-dialog { max-width: 320px; }
.tbb-stat-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 0;
    border-bottom: 1px solid var(--tbb-border);
    font-size: 13px;
}
.tbb-stat-row:last-of-type { border-bottom: none; }
.tbb-stat-name { flex: 1; color: var(--tbb-muted); }
.tbb-stat-val  { font-weight: 800; color: var(--tbb-text); min-width: 36px; text-align: right; margin-right: 8px; }
.tbb-alloc-btn {
    background: var(--tbb-accent);
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 12px;
    font-weight: 800;
    padding: 3px 9px;
    cursor: pointer;
}
.tbb-alloc-placeholder { width: 34px; }
.tbb-hr { border: none; border-top: 1px solid var(--tbb-border); margin: 4px 0; }

/* ── Perk List ──────────────────────────────────────────────────────────── */
.tbb-perk-list { max-height: 50vh; overflow-y: auto; gap: 8px; }
.tbb-perk-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 8px;
    background: var(--tbb-card);
    border-radius: 8px;
    border: 1px solid var(--tbb-border);
    font-size: 12px;
    line-height: 1.5;
}
.tbb-perk-locked { opacity: 0.45; }
.tbb-perk-info { flex: 1; }

/* ── Misc ───────────────────────────────────────────────────────────────── */
.tbb-muted   { color: var(--tbb-muted); font-size: 12px; }
.tbb-red     { color: var(--tbb-accent); }
.tbb-unlocked { color: #2ecc71; font-weight: 700; }
.tbb-rebirth-info { color: #9b59b6; font-weight: 700; }
.tbb-floor-selector { display:flex; align-items:center; gap:8px; font-size:12px; margin-top:6px; }
.tbb-floor-selector input { flex:1; }

/* ── Float Numbers ──────────────────────────────────────────────────────── */
.tbb-float {
    position: absolute;
    top: 0; left: 50%;
    transform: translateX(-50%);
    font-size: 14px;
    font-weight: 900;
    pointer-events: none;
    animation: tbbFloat 0.9s forwards ease-out;
    text-shadow: 0 1px 3px rgba(0,0,0,0.6);
    white-space: nowrap;
}

/* ── Animations ─────────────────────────────────────────────────────────── */
@keyframes tbbFloat {
    0%   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-44px) scale(1.15); }
}
@keyframes tbbPulse {
    0%   { transform: scale(1); }
    100% { transform: scale(1.1); }
}
`;
    document.head.appendChild(s);
}