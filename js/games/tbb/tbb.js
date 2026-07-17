// js/games/tbb/tbb.js — Turn-Based Battle (TBB) vocabulary game
// export { init, launch }

import { mountVocabSelector, getDeckConfig } from '../../vocab_selector.js';
import { GameVocabManager }   from '../../game_vocab_mgr.js';
import { renderVocabSettings, setGvmTheme } from '../../game_vocab_mgr_ui.js';
import { spawnEnemy }         from './tbb_enemies.js';
import { getFloorData }       from './tbb_floors.js';
import { PERK_DEFS, REBIRTH_MIN_LEVEL, REBIRTH_AP_DIVIDER,
         totalApSpent, canSpendAp, computePerkBonuses, calcRebirthAp } from './tbb_ascension.js';
import { computePlayerDamage, handleWrongAnswerRetaliation,
         actionExp, timeAdjustExp, applyExpBonuses, expToNextLevel } from './tbb_battle.js';

// ─── Module State ─────────────────────────────────────────────────────────────
let _screens  = null;
let _onExit   = null;
let _selector = null;
let _vocabQueue = [];
let _vocabMgr   = null;   // GameVocabManager — the ONLY route to the SRS database
let _visibilityHooked = false;

const SAVE_KEY     = 'tbb_save';
const BANNED_KEY   = 'tbb_banned_words';
const DECK_CFG_KEY = 'tbb_deck_cfg';

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

// ─── Game State (_g) ──────────────────────────────────────────────────────────
let _g = null;

function _defaultSave() {
    return {
        battleMode:           'attrition',   // 'attrition' | 'endless'
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
        floorActionsDone:     {},   // floor# -> true, persisted so unlock/repeat logic survives sessions
        unlockedFeatures:     {},   // featureKey -> true
        autoProgressFloor:    false, // auto-advance to next floor after clearing current
        vocabConfig:          null,  // GameVocabManager config snapshot (renderVocabSettings onSave)
        poolSource:           'srs', // 'srs' | 'mixed' | 'custom' — refreshed from mgr.getPoolSource()
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
        battleMode:           _g.battleMode,
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
        floorActionsDone:     Object.assign({}, _g.floorActionsDone),
        unlockedFeatures:     Object.assign({}, _g.unlockedFeatures),
        autoProgressFloor:    _g.autoProgressFloor ?? false,
        vocabConfig:          _g.vocabConfig ?? null,
        poolSource:           _g.poolSource ?? 'srs',
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}

function _loadDeckCfg() {
    try { return JSON.parse(localStorage.getItem(DECK_CFG_KEY)); } catch { return null; }
}

function _saveDeckCfg(cfg) {
    localStorage.setItem(DECK_CFG_KEY, JSON.stringify(cfg));
}

function _computeDerivedStats() {
    const pb = computePerkBonuses(_g.perkLevels);
    _g._pb = pb;
    _g.playerHp  = BASE_HP  + pb.hpBonus  + _g.allocatedVit * VIT_HP;
    _g.playerAtk = BASE_ATK + pb.atkBonus + _g.allocatedStr * STR_ATK;
    _g.playerDef = BASE_DEF + pb.defBonus + _g.allocatedEnd * END_DEF;
    _g.playerSpd = BASE_SPD + pb.spdBonus + _g.allocatedAgi * AGI_SPD;
    _g.expToNext  = expToNextLevel(_g.playerLevel);
}

function _initGameState() {
    const sv = _loadSave();
    _g = Object.assign({}, sv, {
        // Session state (not persisted)
        battleMode:           sv.battleMode || 'attrition',
        currentHp:            0,
        enemy:                null,   // kept for SRS/exp helpers that reference _g.enemy
        enemyHp:              0,
        currentFloor:         sv.maxUnlockedFloor,
        enemiesOnFloorKilled: 0,
        phase:                'idle',
        narration:            'Entering the dungeon…',
        attackType:           'slash',
        quickStrikeMode:      true,   // ALWAYS ON
        autoProgressFloor:    sv.autoProgressFloor ?? false,
        // ── Group battle state ──────────────────────────────────────────
        enemyGroup:           [],    // array of 4 enemy objects with .trans + .dead
        selectedGroupIdx:     null,  // which card the player has targeted
        groupChallenge:       null,  // GameVocabManager challenge {refId, type, wordObj, options, correctIdx}
        groupTargetWord:      null,  // challenge.wordObj (display convenience)
        groupIsDrill:         false, // true when challenge.type === 'unscheduled'
        telegraphIdx:         null,  // enemy card currently charging an attack (⚡)
        riposteArmed:         false, // set after taking a hit; next strike gets Riposte bonus
        lastStandUsed:        false, // Last Stand perk trigger — once per wave
        stanceIsWild:         false, // WILD stance re-rolls the attack type every strike
        answerDisabled:       false,
        answerTimeLeft:       1.0,
        combo:                0,
        cardFlash:            null,   // { correct: idx, wrong: idx|null } — cleared after render delay
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

    if (!_visibilityHooked) {
        _visibilityHooked = true;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                _pauseAnswerTimer();
                _vocabMgr?.pause();
            } else {
                // Only resume if no blocking UI is open (overlay or deck modal own
                // their pause/resume pairs and will unpause when they close).
                const blocked = (_dom?.overlay && _dom.overlay.style.display !== 'none')
                    || document.getElementById('tbb-change-deck-overlay');
                if (!blocked) {
                    _vocabMgr?.resume();
                    _resumeAnswerTimer();
                }
            }
        });
    }
}

/**
 * Called by games_ui when the player navigates back to the games list without
 * using the in-game Exit button. Freezes clocks and flushes progress.
 */
export function suspend() {
    if (!_g) return;
    _stopTimer();
    _cancelPendingChallenge();
    _vocabMgr?.pause();
    // Contract: push local vocab progress at session end.
    // No-op while the pool runs in Global SRS mode (answers are already live).
    _vocabMgr?.exportToAppSrs(null, 'skip');
    _writeSave();
}

export async function launch() {
    _injectStyles();

    let deckCfg = _loadDeckCfg();
    if (!deckCfg) {
        // Default to ALL SRS words with metric mode on first launch
        deckCfg = { 
            useSrs: true, 
            srsFilterMode: 'metrics', 
            srsMetric: 'all', 
            statuses: [0,1,2,3,4,5], 
            selMode: 'random', 
            count: 'All', 
            decks: {} 
        };
    }

    const queue = await _buildVocabFromDeckCfg(deckCfg);
    
    if (queue.length > 0) {
        _startGameWithQueue(queue);
    } else {
        // If zero words found (e.g. no SRS, empty custom deck), force setup screen
        _show('setup');
        _renderSetup();
    }
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

// ─── Deck Configuration Helper ────────────────────────────────────────────────
async function _buildVocabFromDeckCfg(deckCfg) {
    const scratch = document.createElement('div');
    scratch.style.display = 'none';
    document.body.appendChild(scratch);

    const ctrl = mountVocabSelector(scratch, {
        bannedKey: BANNED_KEY,
        preloadConfig: deckCfg,
        title: '_tbb_internal_'
    });

    let queue = [];
    try {
        queue = await ctrl.getQueue();
    } catch (e) {
        console.warn('[TBB] Could not build vocab from saved deck:', e);
    }

    scratch.remove();
    return queue;
}

// ─── Setup Screen (Fallback Only) ─────────────────────────────────────────────
function _renderSetup() {
    const el = _screens.setup;
    if (!el) return;

    _selector = mountVocabSelector(el, {
        bannedKey:    BANNED_KEY,
        defaultCount: 'All',
        title:        'Turn-Based Battle — Choose Vocabulary',
    });

    const actions = _selector.getActionsEl();

    const qsWrap = document.createElement('div');
    qsWrap.style.cssText = 'margin-top:10px;display:flex;flex-direction:column;gap:6px;';
    qsWrap.innerHTML = `
        <div style="font-size:0.85em;font-weight:700;color:#8090a8;letter-spacing:.04em;">HOW TO FIGHT</div>
        <div style="font-size:0.85em;color:#c0cad8;line-height:1.5;">
            1️⃣ <b>Choose your weapon</b> — tap SLASH / PIERCE / MAGIC to set your stance.<br>
            2️⃣ <b>Attack</b> — tap an enemy card to strike it with your current weapon.<br>
            Enemies have real HP — it takes <b>~5 correct answers</b> to defeat one.<br>
            Wrong answers let enemies <b>hit back</b>!
        </div>`;
    actions.appendChild(qsWrap);

    const startBtn = document.createElement('button');
    startBtn.className   = 'primary-btn';
    startBtn.style.marginTop = '8px';
    startBtn.textContent = '⚔️ Start Battle';
    startBtn.addEventListener('click', _startGameFromSetup);

    const backBtn = document.createElement('button');
    backBtn.className   = 'caro-back-btn';
    backBtn.style.marginTop = '6px';
    backBtn.textContent = '← Back to Games';
    backBtn.addEventListener('click', _onExit);

    actions.append(startBtn, backBtn);
}

async function _startGameFromSetup() {
    const queue = await _selector.getQueue();
    if (!queue.length) return;
    
    const deckCfg = getDeckConfig(_screens.setup);
    if (deckCfg) _saveDeckCfg(deckCfg);

    _startGameWithQueue(queue);
}

// ─── Game Initialisation ──────────────────────────────────────────────────────
function _mapQueue(queue) {
    return queue.map(w => ({
        word:   w.word,
        furi:   w.furi   || w.word,
        trans:  w.trans  || '—',
        pos:    w.pos    || 'other',
        deckId: w.deckId || 'custom',
    }));
}

function _buildVocabMgr() {
    const savedCfg = (_g?.vocabConfig) || _loadSave().vocabConfig || {};
    _vocabMgr = new GameVocabManager({ ...GameVocabManager.defaultConfig(), ...savedCfg });
    // TBB has always graded every answer straight into the app SRS (live/mixed
    // mode). globalSrs:true preserves that behaviour through the manager.
    _vocabMgr.setPool(_vocabQueue, BANNED_KEY, { globalSrs: true });
    if (_g) _g.poolSource = _vocabMgr.getPoolSource();
}

function _startGameWithQueue(queue) {
    _vocabQueue = _mapQueue(queue);

    if (!_g) {
        _initGameState();
        _g.quickStrikeMode = true;
    }
    _buildVocabMgr();

    _show('game');
    _buildGameDOM();

    if (!_g.enemyGroup || _g.enemyGroup.length === 0) {
        _spawnEnemyAndBegin();
    } else if (_g.phase === 'game_over' || _g.currentHp <= 0) {
        // The previous session ended in defeat and the player left from the
        // game-over screen. Re-show it instead of dealing an unanswerable hand.
        _g.phase = 'game_over';
        _renderAll();
        _updateComboDisplay();
        _renderGameOverOverlay();
    } else {
        // Re-entering with a battle in progress: clear any stale interaction
        // state and deal a fresh question (the manager was just rebuilt).
        _g.answerDisabled = false;
        _g.cardFlash      = null;
        _g.groupChallenge = null;
        const alive = _g.enemyGroup.map((e, i) => e.dead ? null : i).filter(i => i !== null);
        if (alive.length === 0) { _spawnEnemyAndBegin(); return; }
        _prepareGroupVocabAmong(alive);
        _renderAll();
        _updateComboDisplay();
    }
}

let _timerInterval  = null;
let _timerPaused    = false;   // true while any overlay is open
let _timerElapsedMs = 0;       // ms consumed before current resume
let _timerStartMs   = 0;       // wall-clock time of last resume

function _spawnEnemyAndBegin() {
    // ── Spawn a group of 4 enemies of the same template ──────────────────
    const templateEnemy = spawnEnemy(_g.currentFloor);
    _g.enemy   = templateEnemy;  // keep for legacy helpers
    _g.enemyHp = templateEnemy.maxHp;

    _g.enemyGroup = [0,1,2,3].map(() => {
        const e = spawnEnemy(_g.currentFloor);
        return {
            ...e,
            name:      templateEnemy.name,
            emoji:     templateEnemy.emoji,
            weakTo:    templateEnemy.weakTo,
            resists:   templateEnemy.resists,
            maxHp:     templateEnemy.maxHp,
            currentHp: templateEnemy.maxHp,  // real HP — enemies take damage per answer
            dead:      false,
            trans:     null,
        };
    });

    _g.lastStandUsed = false;   // Last Stand may trigger once per wave
    _g.riposteArmed  = false;   // Riposte doesn't carry across waves
    _g.telegraphIdx  = null;

    _g.selectedGroupIdx = null;
    _g.answerDisabled   = false;
    _g.phase            = 'player_attack';
    _g.narration        = `${templateEnemy.emoji} ${templateEnemy.name} ×4 appear! (Lv.${templateEnemy.level}) Select your weapon, then strike!`;

    _prepareGroupVocab();

    _renderAll();
    _updateComboDisplay();
}

/**
 * Drop the current in-flight challenge without grading it (floor jump, deck
 * change, timeout, rebirth…). Frees the word for re-selection.
 */
function _cancelPendingChallenge() {
    if (_g?.groupChallenge && _vocabMgr) {
        _vocabMgr.discardWord(_g.groupChallenge.refId);
    }
    if (_g) _g.groupChallenge = null;
}

/** Roll a telegraphed "charging" enemy for this question (35% chance). */
function _pickTelegraph(aliveIndices) {
    _g.telegraphIdx = (aliveIndices.length > 0 && Math.random() < 0.35)
        ? aliveIndices[Math.floor(Math.random() * aliveIndices.length)]
        : null;
}

/** Distribute the challenge's answer options across the surviving cards. */
function _assignChallengeToCards(challenge, aliveIndices) {
    const correct     = challenge.options[challenge.correctIdx];
    const distractors = challenge.options.filter((_, i) => i !== challenge.correctIdx);

    // ── Duel mode: a lone survivor carries BOTH options stacked on its card ──
    // Without this, the last enemy of every wave would show the correct answer
    // by default — a guaranteed-correct freebie that pollutes SRS grading.
    if (aliveIndices.length === 1 && distractors.length > 0) {
        const card = _g.enemyGroup[aliveIndices[0]];
        const duo  = [correct, distractors[0]];
        if (Math.random() < 0.5) duo.reverse();
        card.opts  = duo;
        card.trans = null;
        return;
    }

    const picks = [correct, ...distractors.slice(0, aliveIndices.length - 1)];
    while (picks.length < aliveIndices.length) picks.push('???');
    for (let i = picks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [picks[i], picks[j]] = [picks[j], picks[i]];
    }
    aliveIndices.forEach((cardIdx, k) => {
        const card = _g.enemyGroup[cardIdx];
        card.trans = picks[k];
        card.opts  = null;
    });
}

function _prepareGroupVocab() {
    const alive = _g.enemyGroup.map((e, i) => e.dead ? null : i).filter(i => i !== null);
    _prepareGroupVocabAmong(alive);
}

/**
 * Deal a fresh vocab challenge among the surviving cards.
 * Word selection, distractors and SRS typing all come from GameVocabManager.
 * @param {number[]} aliveIndices - indices of non-dead cards
 */
function _prepareGroupVocabAmong(aliveIndices) {
    if (!_vocabMgr || !aliveIndices.length) return;
    _cancelPendingChallenge();

    const challenge = _vocabMgr.getNextWord(null, Math.max(2, aliveIndices.length));
    if (!challenge) {
        _g.groupChallenge  = null;
        _g.groupTargetWord = null;
        _g.narration = '📚 No vocabulary available — open ☰ Menu → Change Vocabulary.';
        _stopTimer();
        return;
    }

    _g.groupChallenge  = challenge;
    _g.groupTargetWord = challenge.wordObj;                 // {kanji, kana, eng}
    _g.groupIsDrill    = challenge.type === 'unscheduled';

    _assignChallengeToCards(challenge, aliveIndices);
    if (aliveIndices.length === 1 && _g.enemyGroup[aliveIndices[0]].opts) {
        _g.narration = '⚔️ Final duel — pick the true meaning!';
    }
    _pickTelegraph(aliveIndices);
    _startAnswerTimer();
}

function _showFloorLandingOverlay(onDismiss) {
    const fd   = getFloorData(_g.currentFloor);
    const done = !!_g.floorActionsDone[_g.currentFloor];
    const isUnlockEffect  = fd.effectKey.startsWith('unlock_');
    const alreadyUnlocked = isUnlockEffect && !!_g.unlockedFeatures[fd.effectKey];
    const showRepeat      = done || alreadyUnlocked;

    _showOverlay(`
        <div class="tbb-dialog tbb-floor-dialog">
            <div class="tbb-dialog-title">${fd.title}</div>
            <div class="tbb-floor-desc">${fd.description}</div>
            ${showRepeat ? `<div class="tbb-floor-repeat">${fd.repeatText}</div>` : ''}
            <div class="tbb-floor-result" id="tbb-floor-result" style="display:none"></div>
            <div class="tbb-dialog-actions">
                ${!showRepeat
                    ? `<button class="tbb-dialog-btn tbb-dialog-btn-primary" id="tbb-floor-act-btn">${fd.action}</button>`
                    : `<button class="tbb-dialog-btn tbb-dialog-btn-secondary" id="tbb-floor-act-btn" disabled>${fd.action}</button>`
                }
                <button class="tbb-dialog-btn" id="tbb-floor-skip-btn">⚔️ Fight!</button>
            </div>
        </div>
    `);

    _dom.overlay.querySelector('#tbb-floor-skip-btn').addEventListener('click', () => {
        _closeOverlay();
        onDismiss();
    });

    if (!showRepeat) {
        _dom.overlay.querySelector('#tbb-floor-act-btn').addEventListener('click', () => {
            const resultEl = _dom.overlay.querySelector('#tbb-floor-result');
            const actBtn   = _dom.overlay.querySelector('#tbb-floor-act-btn');
            const skipBtn  = _dom.overlay.querySelector('#tbb-floor-skip-btn');

            const msg = _executeFloorEffect(fd.effectKey, _g.currentFloor);
            resultEl.textContent = msg;
            resultEl.style.display = 'block';
            actBtn.disabled = true;
            actBtn.textContent = '✓ Done';
            skipBtn.textContent = '⚔️ Continue to Battle';

            _updateHpBars();
            _updateExpBar();
            _updateStats();
        });
    }
}

// ─── Floor Effect Execution ───────────────────────────────────────────────────

// Feature keys that require floor actions to unlock perk slots
const UNLOCK_PERK_GATES = {
    unlock_sharpened_edge: { perkKey: 'critChanceT1',    label: 'Sharpened Edge I', desc: 'Crit chance perk unlocked!' },
    unlock_ice_focus:      { perkKey: 'defPenT1',        label: 'Armor Pierce I',   desc: 'Enemy DEF reduction perk unlocked!' },
    unlock_lava_core:      { perkKey: 'weaknessAmpT2',   label: 'Exploit Weakness', desc: 'Weakness amplifier perk unlocked!' },
    unlock_forged_steel:   { perkKey: 'parryBoostT2',    label: 'Iron Guard',       desc: 'Enhanced parry perk unlocked!' },
    unlock_scribe_wisdom:  { perkKey: 'multExpGainT3',   label: 'Enlightenment',    desc: 'Multiplicative EXP perk unlocked!' },
    unlock_maze_key:       { perkKey: 'survivorT3',      label: 'Last Stand',       desc: 'Low-HP survival perk unlocked!' },
    unlock_core_power:     { perkKey: 'ultimateT5',      label: 'Transcendence',    desc: 'Ultimate perk Transcendence unlocked!' },
    unlock_floor_jump:     null,  // special: handled separately
};

function _executeFloorEffect(effectKey, floor) {
    _g.floorActionsDone[floor] = true;

    switch (effectKey) {
        case 'heal_small': {
            const amt = Math.max(1, Math.round(_g.playerHp * 0.15));
            const prev = _g.currentHp;
            _g.currentHp = Math.min(_g.playerHp, _g.currentHp + amt);
            _writeSave();
            return _g.currentHp === prev
                ? 'You\'re already at full health. Nothing to restore.'
                : `✨ Restored ${_g.currentHp - prev} HP. (${_g.currentHp}/${_g.playerHp})`;
        }
        case 'heal_medium': {
            const amt = Math.max(1, Math.round(_g.playerHp * 0.35));
            const prev = _g.currentHp;
            _g.currentHp = Math.min(_g.playerHp, _g.currentHp + amt);
            _writeSave();
            return _g.currentHp === prev
                ? 'You\'re already at full health. Nothing to restore.'
                : `💚 Restored ${_g.currentHp - prev} HP. (${_g.currentHp}/${_g.playerHp})`;
        }
        case 'heal_full': {
            const prev = _g.currentHp;
            _g.currentHp = _g.playerHp;
            _writeSave();
            return prev === _g.playerHp
                ? 'You were already at full health. You feel refreshed nonetheless.'
                : `❤️ Fully healed! HP restored to ${_g.playerHp}.`;
        }
        case 'gain_exp_small': {
            const xp = Math.max(5, Math.round(_g.expToNext * 0.08));
            _addExp(xp);
            _writeSave();
            return `📘 Gained ${xp} EXP from your find!`;
        }
        case 'gain_exp_medium': {
            const xp = Math.max(10, Math.round(_g.expToNext * 0.20));
            _addExp(xp);
            _writeSave();
            return `📗 Gained ${xp} EXP. Knowledge grows.`;
        }
        case 'gain_exp_large': {
            const xp = Math.max(20, Math.round(_g.expToNext * 0.40));
            _addExp(xp);
            _writeSave();
            return `📕 Gained ${xp} EXP! A significant insight!`;
        }
        case 'gain_statpoint': {
            _g.statPointsToAllocate++;
            _writeSave();
            return `⬆️ You gained 1 Stat Point! Open 📊 Stats to allocate it.`;
        }
        case 'random_boon': {
            const roll = Math.random();
            let result;
            if (roll < 0.33) {
                const amt = Math.max(1, Math.round(_g.playerHp * 0.5));
                const prev = _g.currentHp;
                _g.currentHp = Math.min(_g.playerHp, _g.currentHp + amt);
                result = `💖 Boon: Restored ${_g.currentHp - prev} HP.`;
            } else if (roll < 0.66) {
                const xp = Math.max(15, Math.round(_g.expToNext * 0.30));
                _addExp(xp);
                result = `✨ Boon: Gained ${xp} EXP!`;
            } else {
                _g.statPointsToAllocate++;
                result = `🌟 Boon: Gained 1 Stat Point!`;
            }
            _writeSave();
            return result;
        }
        case 'fishing': {
            _g.floorActionsDone[_g.currentFloor] = true;
            const roll = Math.random();
            let result;
            if (roll < 0.10) {
                // Jackpot: stat point
                _g.statPointsToAllocate++;
                result = '🎉 A glittering fish pulls free — and a small chest is tangled in the line! Gained 1 Stat Point!';
            } else if (roll < 0.30) {
                // Big EXP
                const xp = Math.max(10, Math.round(_g.expToNext * 0.25));
                _addExp(xp);
                result = `🐟 You land a magnificent fish! A wise fisherman nearby offers lore in exchange. +${xp} EXP!`;
            } else if (roll < 0.55) {
                // Medium heal
                const amt = Math.max(1, Math.round(_g.playerHp * 0.35));
                const prev = _g.currentHp;
                _g.currentHp = Math.min(_g.playerHp, _g.currentHp + amt);
                result = `🎣 You catch a plump river fish and cook it over the bank. Restored ${_g.currentHp - prev} HP.`;
            } else if (roll < 0.75) {
                // Small EXP
                const xp = Math.max(5, Math.round(_g.expToNext * 0.08));
                _addExp(xp);
                result = `🐠 You catch a strange glowing fish. It wriggles free, but leaves behind a spark of insight. +${xp} EXP.`;
            } else if (roll < 0.88) {
                // Small heal
                const amt = Math.max(1, Math.round(_g.playerHp * 0.12));
                const prev = _g.currentHp;
                _g.currentHp = Math.min(_g.playerHp, _g.currentHp + amt);
                result = `🎣 A small catch — barely enough for a snack. Restored ${_g.currentHp - prev} HP.`;
            } else {
                // Bad luck
                result = '🪝 You sit for a while. Nothing bites. At least it was peaceful.';
            }
            _writeSave();
            return result;
        }
        case 'forage': {
            _g.floorActionsDone[_g.currentFloor] = true;
            const roll = Math.random();
            let result;
            if (roll < 0.15) {
                _g.statPointsToAllocate++;
                result = '🍀 Among the plants you find a four-leafed clover crackling with energy. Gained 1 Stat Point!';
            } else if (roll < 0.45) {
                const amt = Math.max(1, Math.round(_g.playerHp * 0.30));
                const prev = _g.currentHp;
                _g.currentHp = Math.min(_g.playerHp, _g.currentHp + amt);
                result = `🌿 You find healing herbs and brew a quick tea. Restored ${_g.currentHp - prev} HP.`;
            } else if (roll < 0.70) {
                const xp = Math.max(5, Math.round(_g.expToNext * 0.12));
                _addExp(xp);
                result = `🍄 A rare mushroom with memory-enhancing spores. You feel sharper. +${xp} EXP.`;
            } else if (roll < 0.88) {
                const amt = Math.max(1, Math.round(_g.playerHp * 0.10));
                const prev = _g.currentHp;
                _g.currentHp = Math.min(_g.playerHp, _g.currentHp + amt);
                result = `🫐 You find a handful of wild berries. Tart but nutritious. +${_g.currentHp - prev} HP.`;
            } else {
                result = '🍂 You find mostly dead leaves and thorns. Nothing useful this time.';
            }
            _writeSave();
            return result;
        }
        case 'unlock_floor_jump': {
            if (_g.unlockedFeatures['unlock_floor_jump']) {
                return 'The map is familiar. Floor jumping was already enabled.';
            }
            _g.unlockedFeatures['unlock_floor_jump'] = true;
            _writeSave();
            return '🗺️ Floor Jump unlocked! You can now jump to any unlocked floor from the ☰ Menu.';
        }
        default: {
            // Handle unlock_* perk gates
            if (effectKey.startsWith('unlock_')) {
                const gate = UNLOCK_PERK_GATES[effectKey];
                if (!gate) {
                    _writeSave();
                    return '❓ You found something mysterious. Nothing happened.';
                }
                if (_g.unlockedFeatures[effectKey]) {
                    return `${gate.label} was already unlocked. The item holds no further power.`;
                }
                _g.unlockedFeatures[effectKey] = true;
                _writeSave();
                return `🔓 ${gate.desc} The perk "${gate.label}" is now available in the Ascension Perk shop.`;
            }
            _writeSave();
            return 'Nothing happens.';
        }
    }
}

function _calcAnswerSecs() {
    const pb = _g._pb ?? {};
    return Math.max(MIN_ANSWER_SECS, BASE_ANSWER_SECS + (pb.answerTimeSecs ?? 0));
}

function _startAnswerTimer() {
    _stopTimer();
    _timerPaused      = false;
    _timerElapsedMs   = 0;
    _timerStartMs     = Date.now();
    _g.answerTimeLeft = 1.0;
    const totalMs     = _calcAnswerSecs() * 1000;
    _updateTimerBar();

    _timerInterval = setInterval(() => {
        if (_timerPaused) return;
        const elapsed = _timerElapsedMs + (Date.now() - _timerStartMs);
        _g.answerTimeLeft = Math.max(0, 1 - elapsed / totalMs);
        _updateTimerBar();
        if (_g.answerTimeLeft <= 0) {
            clearInterval(_timerInterval);
            _timerInterval = null;
            _onAnswerTimeout();
        }
    }, 80);
}

function _updateTimerBar() {
    if (!_dom.timerBar) return;
    const f = _g.answerTimeLeft ?? 1;
    _dom.timerBar.style.width = (f * 100).toFixed(1) + '%';
    _dom.timerBar.style.background =
        f > 0.5 ? 'var(--tbb-hp-green)' : f > 0.25 ? 'var(--tbb-hp-yellow)' : 'var(--tbb-hp-red)';
}

/**
 * Timer ran out. The player takes a hit and loses the combo, but the SRS word
 * is NOT graded wrong — an expired timer usually means AFK, not "didn't know".
 */
function _onAnswerTimeout() {
    if (!_g || _g.phase !== 'player_attack' || _g.answerDisabled) return;
    _g.answerDisabled = true;
    _cancelPendingChallenge();

    _g.combo = 0;
    _updateComboDisplay();

    const aliveIndices = _g.enemyGroup.map((e, i) => e.dead ? null : i).filter(i => i !== null);
    const attackerIdx  = (_g.telegraphIdx !== null && !_g.enemyGroup[_g.telegraphIdx]?.dead)
        ? _g.telegraphIdx
        : aliveIndices[Math.floor(Math.random() * aliveIndices.length)];
    const attacker = _g.enemyGroup[attackerIdx];

    if (attacker) {
        const charged = attackerIdx === _g.telegraphIdx;
        const { dmg, narration } = handleWrongAnswerRetaliation(_g, attacker, charged ? 1.5 : 1);
        const applied = _applyPlayerDamage(dmg);
        _g.riposteArmed = true;
        _g.narration = applied.dodged
            ? `⏳ Too slow! ${attacker.name} lunges — but you dodge!`
            : `⏳ Too slow! ${charged ? '⚡ Charged attack! ' : ''}${narration}`;
        if (!applied.dodged) _spawnFloatPlayer(`-${applied.dmg}`, '#e74c3c');
        else                 _spawnFloatPlayer('DODGE!', '#3dba6f');
    } else {
        _g.narration = '⏳ Time drifts by…';
    }
    _g.telegraphIdx = null;

    _updateHpBars();
    _updateNarration();

    setTimeout(() => {
        if (!_g || _g.phase === 'game_over') return;
        if (_g.currentHp <= 0) { _handlePlayerDefeated(); return; }
        _g.selectedGroupIdx = null;
        _g.answerDisabled   = false;
        const alive = _g.enemyGroup.map((e, i) => e.dead ? null : i).filter(i => i !== null);
        _prepareGroupVocabAmong(alive);
        _renderGroupCards();
        _renderTargetWord();
        _updateMultBadges();
        _updateDueCount();
        _updateNarration();
    }, 900);
}

/**
 * Apply incoming damage to the player, factoring in AGI dodge and the
 * Last Stand perk (once per wave, can save you from a lethal blow).
 * @returns {{dmg:number, dodged:boolean}}
 */
function _applyPlayerDamage(dmg) {
    const dodgeChance = _dodgeChance();
    if (Math.random() < dodgeChance) return { dmg: 0, dodged: true };

    _g.currentHp = Math.max(0, _g.currentHp - dmg);

    const pb        = _g._pb ?? {};
    const threshold = Math.ceil(_g.playerHp * 0.25);
    if ((pb.survivorHpBonus ?? 0) > 0 && !_g.lastStandUsed && _g.currentHp <= threshold) {
        _g.lastStandUsed = true;
        _g.currentHp = Math.min(_g.playerHp, _g.currentHp + pb.survivorHpBonus);
        _spawnFloatPlayer(`🛡 LAST STAND +${pb.survivorHpBonus}`, '#9b59b6');
    }
    return { dmg, dodged: false };
}

/** AGI → dodge: 0.4% per SPD point, capped at 30%. Base SPD 10 ≈ 4%. */
function _dodgeChance() {
    return Math.min(0.30, (_g.playerSpd ?? 0) * 0.004);
}

function _pauseAnswerTimer() {
    if (_timerPaused || !_timerInterval) return;
    _timerElapsedMs += Date.now() - _timerStartMs;  // bank elapsed time
    _timerPaused = true;
}

function _resumeAnswerTimer() {
    if (!_timerPaused || !_timerInterval) return;
    _timerStartMs = Date.now();   // reset wall-clock anchor
    _timerPaused  = false;
}

function _stopTimer() {
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval  = null;
    _timerPaused    = false;
    _timerElapsedMs = 0;
}

// ─── Group Battle: select target card ─────────────────────────────────────────
/**
 * @param {number}      idx  - enemy card index
 * @param {number|null} optK - duel mode only: which of the two stacked options
 *                             was tapped (0/1). null = the card body itself.
 */
function _selectGroupEnemy(idx, optK = null) {
    if (_g.answerDisabled || _g.phase !== 'player_attack') return;
    const card = _g.enemyGroup[idx];
    if (!card || card.dead) return;
    // Duel card: the answer must come from one of the two option buttons
    if (card.opts && optK === null) return;

    // Selecting an enemy ALWAYS fires the attack with the currently selected weapon
    _g.selectedGroupIdx = idx;
    _renderGroupCards();
    _onGroupAttack(card.opts ? card.opts[optK] : null);
}

// ─── Group Battle: type button clicked — sets stance ONLY ─────────────────────
function _onTypeButtonClick(rawType) {
    if (_g.phase !== 'player_attack') return;

    // WILD is a persistent stance: a random weapon is rolled on EVERY strike
    // (+15% damage as the gamble reward).
    _g.stanceIsWild = (rawType === 'wild');
    if (!_g.stanceIsWild) _g.attackType = rawType;
    _updateAtkBtnHighlight();
    _updateMultBadges();
    const labels = { slash: '⚔ SLASH', pierce: '🗡 PIERCE', magic: '✦ MAGIC' };
    _g.narration = _g.stanceIsWild
        ? 'Stance: ? WILD — random weapon every strike, +15% dmg. Tap an enemy!'
        : `Stance: ${labels[rawType]} — now tap an enemy to attack!`;
    _updateNarration();
}

// ─── Group Battle: fire attack (called when player taps an enemy card) ────────
/** @param {string|null} answerOverride - duel mode: the option text the player chose */
function _onGroupAttack(answerOverride = null) {
    if (_g.answerDisabled || _g.phase !== 'player_attack') return;
    if (_g.selectedGroupIdx === null) return;

    const challenge = _g.groupChallenge;
    if (!challenge) return;   // no vocab loaded — nothing to answer

    _g.answerDisabled = true;
    const timeFrac = _g.answerTimeLeft ?? 1;   // capture speed before stopping the clock
    _stopTimer();

    const idx          = _g.selectedGroupIdx;
    const targetCard   = _g.enemyGroup[idx];
    const isWild       = _g.stanceIsWild;
    const resolvedType = isWild
        ? ['slash','pierce','magic'][Math.floor(Math.random() * 3)]
        : _g.attackType;

    const correctStr = challenge.options[challenge.correctIdx];
    const isCorrect  = (answerOverride ?? targetCard.trans) === correctStr;

    // SRS grading — through GameVocabManager (handles unscheduled-review rules)
    _vocabMgr.gradeWord(challenge.refId, isCorrect);
    _g.groupChallenge = null;

    // Combo
    if (isCorrect) _g.combo++; else _g.combo = 0;
    const comboMult = _g.combo > 1 ? (1 + 0.2 * Math.log2(_g.combo)) : 1.0;
    _updateComboDisplay();

    const wildNote = isWild ? ` (Wild→${resolvedType})` : '';

    if (isCorrect) {
        // ── Correct: deal real HP damage to the enemy ────────────────────
        let { dmg, mult, feedback } = computePlayerDamage(targetCard, resolvedType, _g.playerAtk, _g._pb, isWild);

        // Riposte perk: bonus damage on the first strike after taking a hit
        let riposteNote = '';
        if (_g.riposteArmed && (_g._pb.counterAtkPct ?? 0) > 0) {
            dmg = Math.round(dmg * (1 + _g._pb.counterAtkPct / 100));
            riposteNote = ' ↩Riposte!';
        }
        _g.riposteArmed = false;

        // Interrupt: striking the charging enemy deals +25% and cancels the charge
        let interruptNote = '';
        if (_g.telegraphIdx === idx) {
            dmg = Math.round(dmg * 1.25);
            _g.telegraphIdx = null;
            interruptNote = ' ⚡Interrupted!';
        }

        targetCard.currentHp = Math.max(0, targetCard.currentHp - dmg);
        const died = targetCard.currentHp <= 0;
        if (died) targetCard.dead = true;

        // EXP: answer speed × type multiplier × combo, + kill bonus
        let rawExp = actionExp(targetCard.expYield, true);
        rawExp     = timeAdjustExp(rawExp, timeFrac);
        rawExp     = Math.round(rawExp * comboMult * mult);
        if (died) rawExp += Math.round(targetCard.expYield * 0.5);
        const gained = applyExpBonuses(rawExp, _g._pb.additiveExpPct, _g._pb.multExpPct);

        _g.cardFlash = { correct: idx, wrong: null };

        const notes = `${wildNote}${riposteNote}${interruptNote}`;
        const hpStr = died ? ' ☠️' : ` [${targetCard.currentHp}/${targetCard.maxHp} HP]`;
        if (feedback === 'weakness') _g.narration = `⚡ Weakness!${notes} -${dmg} dmg${hpStr}`;
        else if (feedback === 'resist') _g.narration = `🛡 Resisted${notes}. -${dmg} dmg${hpStr}`;
        else if (feedback === 'crit')   _g.narration = `💥 Crit!${notes} -${dmg} dmg${hpStr}`;
        else                            _g.narration = `✓ Hit!${notes} -${dmg} dmg${hpStr}`;

        let advanceFreshWave = false;
        if (died) {
            _g.totalEnemiesDefeated++;
            _g.enemiesOnFloorKilled++;
            _g.narration = `☠️ ${targetCard.name} defeated!${notes} +${gained} EXP`;

            // Floor unlock: 4 kills = floor cleared
            if (_g.enemiesOnFloorKilled >= 4) {
                _g.enemiesOnFloorKilled = 0;

                // Floor-clear reward: recover 10% max HP
                const prevHp = _g.currentHp;
                _g.currentHp = Math.min(_g.playerHp, _g.currentHp + Math.max(1, Math.round(_g.playerHp * 0.10)));
                if (_g.currentHp > prevHp) _spawnFloatPlayer(`+${_g.currentHp - prevHp} HP`, '#27ae60');

                const nextFloor = _g.currentFloor + 1;
                if (nextFloor <= MAX_FLOORS) {
                    const wasNew = nextFloor > _g.maxUnlockedFloor;
                    if (wasNew) _g.maxUnlockedFloor = nextFloor;
                    if (_g.autoProgressFloor) {
                        _g.currentFloor = nextFloor;
                        advanceFreshWave = true;   // endless mode must rebuild the wave on the new floor
                        _g.narration = `🗺️ Floor cleared! → Floor ${nextFloor}!`;
                    } else if (wasNew) {
                        _g.narration = `🗺️ Floor ${nextFloor} unlocked! (Menu → Go to Floor)`;
                    }
                }
            }
            _writeSave();
        }

        _addExp(gained);
        _updateDueCount();
        _g.selectedGroupIdx = null;
        _spawnFloatEnemy(`-${dmg}${died ? '☠' : ''}`,
            feedback === 'weakness' ? '#d4a847' :
            feedback === 'crit'     ? '#9b6fff' :
            feedback === 'resist'   ? '#e07070' : '#3dba6f');
        _renderGroupCards();
        _updateHpBars();
        _updateNarration();
        _updateMultBadges();

        setTimeout(() => {
            if (_g.phase === 'game_over') return;
            _g.cardFlash      = null;
            _g.answerDisabled = false;

            if (_g.battleMode === 'endless') {
                if (advanceFreshWave) { _spawnEnemyAndBegin(); return; }
                if (died) {
                    // Replace dead slot with a fresh copy of the wave template
                    _g.enemyGroup[idx] = { ..._g.enemy, currentHp: _g.enemy.maxHp, dead: false, trans: null };
                }
                const aliveCount = _g.enemyGroup.filter(e => !e.dead).length;
                _g.narration = died
                    ? `${_g.enemy.emoji} A new ${_g.enemy.name} appears! (${aliveCount} standing)`
                    : `${targetCard.name} staggers but stands! Keep attacking!`;
                _prepareGroupVocab();
                _renderAll();
                _updateComboDisplay();
            } else {
                // Attrition
                const aliveIndices = _g.enemyGroup.map((e, i) => e.dead ? null : i).filter(i => i !== null);
                if (aliveIndices.length === 0) {
                    _spawnEnemyAndBegin();  // whole wave cleared
                } else {
                    const nAlive = aliveIndices.length;
                    _g.narration = died
                        ? (nAlive === 1 ? `⚔️ One enemy remains!` : `${nAlive} enemies remain!`)
                        : `${targetCard.name} fights back! [${targetCard.currentHp}/${targetCard.maxHp} HP]`;
                    _prepareGroupVocabAmong(aliveIndices);
                    _renderGroupCards();
                    _renderTargetWord();
                    _updateMultBadges();
                    _updateNarration();
                }
            }
        }, 1000);

    } else {
        // ── Wrong: an enemy retaliates (a charging enemy hits 1.5×) ──────
        const attackerIdx = (_g.telegraphIdx !== null && !_g.enemyGroup[_g.telegraphIdx]?.dead)
            ? _g.telegraphIdx : idx;
        const attacker  = _g.enemyGroup[attackerIdx];
        const charged   = attackerIdx === _g.telegraphIdx;
        _g.telegraphIdx = null;

        const { dmg, narration } = handleWrongAnswerRetaliation(_g, attacker, charged ? 1.5 : 1);
        const applied = _applyPlayerDamage(dmg);
        _g.riposteArmed = true;

        const correctIdx = _g.enemyGroup.findIndex(e => !e.dead && e.trans === correctStr);
        _g.cardFlash = { correct: correctIdx, wrong: idx };

        _g.narration = applied.dodged
            ? `✗ Wrong!${wildNote} ${attacker.name} strikes — but you dodge!`
            : `✗ Wrong!${wildNote} ${charged ? '⚡ Charged attack! ' : ''}${narration}`;
        if (applied.dodged) _spawnFloatPlayer('DODGE!', '#3dba6f');
        else                _spawnFloatPlayer(`-${applied.dmg}`, '#e74c3c');
        _renderGroupCards();
        _updateHpBars();
        _updateNarration();

        // Small EXP even on wrong
        const wrongExp = applyExpBonuses(actionExp(targetCard.expYield, false), _g._pb.additiveExpPct, _g._pb.multExpPct);
        if (wrongExp > 0) _addExp(wrongExp);

        setTimeout(() => {
            if (_g.currentHp <= 0) { _handlePlayerDefeated(); return; }
            _g.selectedGroupIdx = null;
            _g.answerDisabled   = false;
            _g.cardFlash        = null;

            const aliveIndices = _g.enemyGroup.map((e, i) => e.dead ? null : i).filter(i => i !== null);
            _prepareGroupVocabAmong(aliveIndices);
            _renderGroupCards();
            _renderTargetWord();
            _updateMultBadges();
            _updateDueCount();
        }, 900);
    }
}

function _handlePlayerDefeated() {
    _stopTimer();
    _cancelPendingChallenge();
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
        // Level-up surge: restore 30% of max HP
        const prevHp = Math.min(_g.currentHp, _g.playerHp);
        _g.currentHp = Math.min(_g.playerHp, prevHp + Math.max(1, Math.round(_g.playerHp * 0.30)));
        if (_g.currentHp > prevHp) _spawnFloatPlayer(`▲ LV UP +${_g.currentHp - prevHp} HP`, '#f1c40f');
        _g.showLvlUp = true;
        _writeSave();
        setTimeout(() => { _g.showLvlUp = false; _updateStats(); }, 3000);
    }
    _computeDerivedStats();
    _updateStats();
    _updateExpBar();
    _updateHpBars();
}

// ─── DOM Building ─────────────────────────────────────────────────────────────
let _dom = {};

function _buildGameDOM() {
    const root = _screens.game;
    root.innerHTML = '';
    root.className = 'tbb-root';

    root.innerHTML = `
    <!-- ── PLAYER STATS TOP BAR ─────────────────────────────────────── -->
    <div class="tbb-statsbar">
        <div class="tbb-player-sprite">🧙</div>
        <div class="tbb-stats-block">
            <div class="tbb-stats-row1">
                <span class="tbb-hero-name" id="tbb-plvl">LV.1</span>
                <span class="tbb-hp-label">HP</span>
                <span class="tbb-hp-nums" id="tbb-player-hp-label">60 / 60</span>
            </div>
            <div class="tbb-bar-wrap"><div class="tbb-bar tbb-hp-bar" id="tbb-player-hp-bar" style="width:100%"></div></div>
            <div class="tbb-bar-wrap tbb-exp-wrap"><div class="tbb-bar tbb-exp-bar" id="tbb-exp-bar" style="width:0%"></div></div>
        </div>
        <div class="tbb-stats-right">
            <span class="tbb-floor-badge">Floor <span id="tbb-floor">0</span> · <span id="tbb-floor-kills" title="Kills on this floor">☠0/4</span> <button class="tbb-explore-btn" id="tbb-explore-btn" title="Explore">🗺️</button></span>
            <span class="tbb-stat-pip" id="tbb-exp-label">EXP 0</span>
            <span class="tbb-stat-pip" id="tbb-atk-pill">ATK 15</span>
            <span class="tbb-lvlup-notif" id="tbb-lvlup">▲ LEVEL UP!</span>
        </div>
        <button class="tbb-menu-btn" id="tbb-menu-btn">☰</button>
        <button class="tbb-stats-btn" id="tbb-stats-btn" title="Stats">📊</button>
    </div>

    <!-- ── TARGET WORD BANNER ────────────────────────────────────────── -->
    <div class="tbb-target-banner">
        <div class="tbb-target-jp" id="tbb-word-kanji">—</div>
        <div class="tbb-word-furi" id="tbb-word-furi"></div>
        <span class="tbb-status-dot" id="tbb-status-dot"></span>
        <span class="tbb-due-count" id="tbb-due-count" style="display:none"></span>
        <div class="tbb-timer-wrap"><div class="tbb-timer-bar" id="tbb-timer-bar" style="width:100%"></div></div>
    </div>

    <!-- ── NARRATION ─────────────────────────────────────────────────── -->
    <div class="tbb-narration-wrap">
        <div class="tbb-narration" id="tbb-narration">—</div>
    </div>

    <!-- ── COMBO ─────────────────────────────────────────────────────── -->
    <div class="tbb-combo-display" id="tbb-combo-display" style="display:none"></div>

    <!-- ── ENEMY CARD GRID ───────────────────────────────────────────── -->
    <div class="tbb-battlefield" id="tbb-battlefield">
        <div class="tbb-ecard" id="tbb-ec0" data-idx="0"></div>
        <div class="tbb-ecard" id="tbb-ec1" data-idx="1"></div>
        <div class="tbb-ecard" id="tbb-ec2" data-idx="2"></div>
        <div class="tbb-ecard" id="tbb-ec3" data-idx="3"></div>
    </div>

    <!-- ── ATTACK TYPE FOOTER ────────────────────────────────────────── -->
    <div class="tbb-footer">
        <button class="tbb-atk-btn tbb-type-slash" id="tbb-bt-slash"  data-type="slash"  onclick="">⚔ SLASH<span  class="tbb-atk-sub">set stance</span><span class="tbb-mult-badge" id="tbb-mb-slash"></span></button>
        <button class="tbb-atk-btn tbb-type-pierce" id="tbb-bt-pierce" data-type="pierce" onclick="">🗡 PIERCE<span class="tbb-atk-sub">set stance</span><span class="tbb-mult-badge" id="tbb-mb-pierce"></span></button>
        <button class="tbb-atk-btn tbb-type-magic"  id="tbb-bt-magic"  data-type="magic"  onclick="">✦ MAGIC<span  class="tbb-atk-sub">set stance</span><span class="tbb-mult-badge" id="tbb-mb-magic"></span></button>
        <button class="tbb-atk-btn tbb-type-wild"   id="tbb-bt-wild"   data-type="wild"   onclick="">? WILD<span   class="tbb-atk-sub">random</span><span class="tbb-mult-badge" id="tbb-mb-wild">×??</span></button>
    </div>

    <!-- ── FLOAT ANCHORS ─────────────────────────────────────────────── -->
    <div class="tbb-float-anchor" id="tbb-float-player" style="position:absolute;top:10px;left:20px;pointer-events:none;height:0"></div>
    <div class="tbb-float-anchor" id="tbb-float-enemy"  style="position:absolute;top:40%;left:50%;pointer-events:none;height:0"></div>

    <div class="tbb-overlay" id="tbb-overlay" style="display:none"></div>
    `;

    // Cache refs
    _dom = {
        floor:        root.querySelector('#tbb-floor'),
        floorKills:   root.querySelector('#tbb-floor-kills'),
        timerBar:     root.querySelector('#tbb-timer-bar'),
        narration:    root.querySelector('#tbb-narration'),
        playerHpBar:  root.querySelector('#tbb-player-hp-bar'),
        playerHpLbl:  root.querySelector('#tbb-player-hp-label'),
        expBar:       root.querySelector('#tbb-exp-bar'),
        expLbl:       root.querySelector('#tbb-exp-label'),
        plvl:         root.querySelector('#tbb-plvl'),
        lvlup:        root.querySelector('#tbb-lvlup'),
        wordFuri:     root.querySelector('#tbb-word-furi'),
        wordKanji:    root.querySelector('#tbb-word-kanji'),
        statusDot:    root.querySelector('#tbb-status-dot'),
        dueCount:     root.querySelector('#tbb-due-count'),
        targetTag:    root.querySelector('#tbb-target-tag'),
        atkPill:      root.querySelector('#tbb-atk-pill'),
        floatPlayer:  root.querySelector('#tbb-float-player'),
        floatEnemy:   root.querySelector('#tbb-float-enemy'),
        overlay:      root.querySelector('#tbb-overlay'),
        comboDisplay: root.querySelector('#tbb-combo-display'),
        ecards:       root.querySelectorAll('.tbb-ecard'),
        atkBtns:      root.querySelectorAll('.tbb-atk-btn'),
    };

    // Wire enemy cards (duel option buttons bubble up to the card listener)
    _dom.ecards.forEach(card => {
        card.addEventListener('click', (ev) => {
            const opt = ev.target.closest('.tbb-ec-opt');
            _selectGroupEnemy(parseInt(card.dataset.idx), opt ? parseInt(opt.dataset.k) : null);
        });
    });

    // Wire attack type buttons
    _dom.atkBtns.forEach(btn => {
        btn.addEventListener('click', () => _onTypeButtonClick(btn.dataset.type));
    });

    // Header buttons
    root.querySelector('#tbb-stats-btn').addEventListener('click', _showStatsPanel);
    root.querySelector('#tbb-menu-btn').addEventListener('click', _showMenuOverlay);
    root.querySelector('#tbb-explore-btn').addEventListener('click', () => {
        _pauseAnswerTimer();
        _showFloorLandingOverlay(() => { _resumeAnswerTimer(); });
    });

    // Reflect initial stance
    _updateAtkBtnHighlight();
}

// ─── Render Helpers ───────────────────────────────────────────────────────────
function _updateComboDisplay() {
    if (!_dom.comboDisplay) return;
    const combo = _g.combo;
    if (combo < 2) { _dom.comboDisplay.style.display = 'none'; return; }
    const bonusPct = Math.round((0.2 * Math.log2(combo)) * 100);
    const cls = combo >= 10 ? 'tbb-combo-hot' : combo >= 5 ? 'tbb-combo-warm' : 'tbb-combo-cool';
    _dom.comboDisplay.className = `tbb-combo-display ${cls}`;
    _dom.comboDisplay.style.display = 'flex';
    _dom.comboDisplay.textContent = `🔥 ${combo}× COMBO  +${bonusPct}% EXP`;
}

function _renderAll() {
    _updateHpBars();
    _updateExpBar();
    _updateStats();
    _updateNarration();
    _renderGroupCards();
    _renderTargetWord();
    _updateMultBadges();
    _updateAtkBtnHighlight();
    _updateDueCount();
}

function _renderTargetWord() {
    const w = _g.groupTargetWord;
    if (!w) {
        _dom.wordKanji.textContent = '—';
        _dom.wordFuri.textContent  = '';
        return;
    }
    // GameVocabManager wordObj shape: {kanji, kana, eng}
    const kanji = w.kanji ?? w.word;
    const kana  = w.kana  ?? w.furi;
    _dom.wordKanji.textContent = kanji;
    _dom.wordFuri.textContent  = (kana && kana !== kanji) ? kana : '';

    const type = _g.groupChallenge?.type;
    if (type === 'new') {
        _dom.statusDot.className = 'tbb-status-dot new';
        _dom.statusDot.title = 'New word';
    } else if (_g.groupIsDrill) {
        _dom.statusDot.className = 'tbb-status-dot drill';
        _dom.statusDot.title = 'Unscheduled review — correct answers don\'t change your SRS interval';
    } else {
        _dom.statusDot.className = 'tbb-status-dot due';
        _dom.statusDot.title = 'Scheduled review';
    }
}

function _updateDueCount() {
    if (!_dom.dueCount) return;
    const due = _vocabMgr ? _vocabMgr.getStats().dueCount : 0;
    if (due === 0) {
        _dom.dueCount.style.display = 'none';
    } else {
        _dom.dueCount.style.display = 'inline-flex';
        _dom.dueCount.textContent   = due;
        _dom.dueCount.title         = `${due} word${due !== 1 ? 's' : ''} due for review`;
    }
}

function _renderGroupCards() {
    if (!_g.enemyGroup.length) return;
    const flash = _g.cardFlash;
    _dom.ecards.forEach((card, i) => {
        const e   = _g.enemyGroup[i];
        const sel = _g.selectedGroupIdx === i && !e.dead;
        const hpPct = Math.max(0, Math.round(e.currentHp / e.maxHp * 100));
        const hpCol = hpPct > 50 ? 'var(--tbb-hp-green)' : hpPct > 25 ? 'var(--tbb-hp-yellow)' : 'var(--tbb-hp-red)';

        let flashCls = '';
        if (flash) {
            if (i === flash.correct) flashCls = ' flash-correct';
            else if (i === flash.wrong) flashCls = ' flash-wrong';
        }

        const tele = _g.telegraphIdx === i && !e.dead;
        card.className = 'tbb-ecard' + (e.dead ? ' dead' : '') + (sel ? ' sel' : '') + (tele ? ' tele' : '') + flashCls;
        const hpLabel = e.dead ? '💀' : `${e.currentHp}/${e.maxHp}`;
        const cursorTxt = sel ? '▼ ATTACK' : (tele ? '⚡ CHARGING' : '');
        const answerHtml = (!e.dead && e.opts)
            ? `<div class="tbb-ec-duo">
                   <button class="tbb-ec-opt" data-k="0">${e.opts[0]}</button>
                   <button class="tbb-ec-opt" data-k="1">${e.opts[1]}</button>
               </div>`
            : `<div class="tbb-ec-trans">${e.trans ?? ''}</div>`;
        card.innerHTML = `
            <div class="tbb-ec-cursor${tele && !sel ? ' tele' : ''}">${cursorTxt}</div>
            <div class="tbb-ec-icon">${e.emoji}</div>
            <div class="tbb-ec-info">
                <div class="tbb-ec-name">${e.name}</div>
                <div class="tbb-ec-hpbg"><div class="tbb-ec-hpfill" style="width:${hpPct}%;background:${hpCol}"></div></div>
                <div class="tbb-ec-hplbl">${hpLabel}</div>
            </div>
            ${answerHtml}`;
    });
}

function _updateMultBadges() {
    // Show what the current stance does vs the first alive enemy (representative)
    const TYPES = ['slash','pierce','magic'];
    const firstAlive = _g.enemyGroup.find(e => !e.dead) ?? null;
    if (!firstAlive) {
        TYPES.forEach(t => {
            const b = document.getElementById('tbb-mb-'+t);
            if (b) { b.textContent = ''; b.className = 'tbb-mult-badge'; }
        });
        return;
    }
    TYPES.forEach(t => {
        const b = document.getElementById('tbb-mb-'+t);
        if (!b) return;
        if (t === firstAlive.weakTo)  { b.textContent = '×1.75 ⚡'; b.className = 'tbb-mult-badge tbb-mult-weak'; }
        else if (t === firstAlive.resists) { b.textContent = '×0.5 🛡'; b.className = 'tbb-mult-badge tbb-mult-res'; }
        else { b.textContent = '×1.0'; b.className = 'tbb-mult-badge tbb-mult-norm'; }
    });
}

function _updateHpBars() {
    const pFrac = _g.playerHp > 0 ? _g.currentHp / _g.playerHp : 0;
    _dom.playerHpBar.style.width = (pFrac * 100).toFixed(1) + '%';
    _dom.playerHpBar.style.background = pFrac > 0.5 ? 'var(--tbb-hp-green)' : pFrac > 0.25 ? 'var(--tbb-hp-yellow)' : 'var(--tbb-hp-red)';
    _dom.playerHpLbl.textContent = `${_g.currentHp} / ${_g.playerHp}`;
    _dom.floor.textContent = _g.currentFloor;
    if (_dom.floorKills) _dom.floorKills.textContent = `☠${Math.min(4, _g.enemiesOnFloorKilled)}/4`;
}

function _updateExpBar() {
    const frac = _g.expToNext > 0 ? _g.playerCurrentExp / _g.expToNext : 0;
    _dom.expBar.style.width = (frac * 100).toFixed(1) + '%';
    _dom.expLbl.textContent = `EXP ${_g.playerCurrentExp}/${_g.expToNext}`;
    _dom.plvl.textContent   = `LV.${_g.playerLevel}`;
    _dom.lvlup.style.opacity = _g.showLvlUp ? '1' : '0';
}

function _updateStats() {
    _dom.atkPill.textContent = `ATK ${_g.playerAtk}`;
    if (_g.statPointsToAllocate > 0) {
        _dom.atkPill.title = `${_g.statPointsToAllocate} stat point(s) available!`;
    }
}

function _updateAtkBtnHighlight() {
    if (!_dom.atkBtns) return;
    _dom.atkBtns.forEach(btn => {
        // Highlight the active stance; WILD is its own persistent stance
        const isActive = _g.stanceIsWild
            ? btn.dataset.type === 'wild'
            : btn.dataset.type === _g.attackType;
        btn.classList.toggle('tbb-atk-btn-active', isActive);
    });
}

function _updateNarration() {
    _dom.narration.textContent = _g.narration || '—';
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
    _pauseAnswerTimer();
    _vocabMgr?.pause();   // freeze the SM-2 clock while blocking UI is up
}
function _closeOverlay() {
    _dom.overlay.style.display = 'none';
    _vocabMgr?.resume();
    _resumeAnswerTimer();
}

function _renderGameOverOverlay() {
    const canRebirth = _g.playerLevel >= REBIRTH_MIN_LEVEL;
    const apGain = canRebirth ? Math.floor(_g.playerLevel / REBIRTH_AP_DIVIDER) : 0;

    // End-of-run vocab rollup — read once from the manager (source of truth)
    const vs = _vocabMgr ? _vocabMgr.getStats() : null;
    const answered = vs ? vs.correct + vs.wrong : 0;
    const accPct   = answered > 0 ? Math.round(vs.correct / answered * 100) : null;
    const vocabLine = (vs && answered > 0)
        ? `<div class="tbb-run-stats">📚 Session: <b>✓${vs.correct}</b> · ✗${vs.wrong}${accPct !== null ? ` · 🎯 ${accPct}%` : ''} · 🔥 Best combo ${vs.highestCombo}${vs.dueCount > 0 ? ` · 📬 ${vs.dueCount} still due` : ''}</div>`
        : '';

    _showOverlay(`
        <div class="tbb-dialog tbb-dialog-over">
            <div class="tbb-dialog-title tbb-red">💀 Defeated!</div>
            <div class="tbb-dialog-body">
                <p>You fell on Floor <b>${_g.currentFloor}</b> (best: ${Math.max(_g.maxUnlockedFloor, _g.currentFloor)}).</p>
                <p>Player Lv.${_g.playerLevel} | Enemies slain: ${_g.totalEnemiesDefeated}</p>
                ${vocabLine}
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
        _g.enemiesOnFloorKilled = 0;
        _g.combo = 0;
        _updateComboDisplay();
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
    _g.enemiesOnFloorKilled = 0;
    _g.combo = 0;
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

    // Perks that require a floor action unlock before appearing in the shop
    const FLOOR_GATED = {
        critChanceT1:  'unlock_sharpened_edge',
        critChanceT2:  'unlock_sharpened_edge',
        defPenT1:      'unlock_ice_focus',
        weaknessAmpT2: 'unlock_lava_core',
        parryBoostT2:  'unlock_forged_steel',
        multExpGainT3: 'unlock_scribe_wisdom',
        survivorT3:    'unlock_maze_key',
        ultimateT5:    'unlock_core_power',
    };

    const rows = Object.entries(PERK_DEFS).map(([key, def]) => {
        // Hide if gated by a floor unlock not yet earned
        const gateKey = FLOOR_GATED[key];
        if (gateKey && !_g.unlockedFeatures[gateKey]) {
            return `<div class="tbb-perk-row tbb-perk-locked tbb-perk-hidden">
                <div class="tbb-perk-info">
                    <b>???</b> <span class="tbb-muted">(T${def.tier})</span><br>
                    <span class="tbb-muted">🔒 Discover via floor exploration</span>
                </div>
            </div>`;
        }
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
                ${totalApSpent(_g.perkLevels) > 0 ? `<button class="tbb-dialog-btn tbb-respec-btn" id="tbb-perk-respec-btn">↩ Respec Perks (costs 1 AP)</button>` : ''}
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

    // Respec button — costs 1 AP, refunds all spent AP
    const respecBtn = _dom.overlay.querySelector('#tbb-perk-respec-btn');
    if (respecBtn) respecBtn.addEventListener('click', () => {
        const spent = totalApSpent(_g.perkLevels);
        if (spent === 0) return;
        if (_g.ascensionPoints < 1) { alert('Need at least 1 AP to respec.'); return; }
        _g.ascensionPoints -= 1;         // respec cost
        _g.ascensionPoints += spent;     // refund all
        _g.perkLevels = {};
        _computeDerivedStats();
        _g.currentHp = Math.min(_g.currentHp, _g.playerHp);
        _writeSave();
        _closeOverlay();
        _showPerksPanel();
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
    const jumpUnlocked   = !!_g.unlockedFeatures['unlock_floor_jump'];
    const autoChecked    = _g.autoProgressFloor ? 'checked' : '';
    _showOverlay(`
        <div class="tbb-dialog">
            <div class="tbb-dialog-title">☰ Menu</div>
            <div class="tbb-dialog-body">
                <p>Floor: ${_g.currentFloor} / ${_g.maxUnlockedFloor} unlocked</p>
                <p>Total enemies defeated: ${_g.totalEnemiesDefeated}</p>

                <div style="font-size:0.8em;font-weight:700;color:#8090a8;letter-spacing:.04em;margin-top:0.6em;">SETTINGS</div>

                <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:0.85em;margin-top:0.4em;">
                    <input type="checkbox" id="tbb-menu-autoprog" ${autoChecked} style="margin-top:3px;flex-shrink:0;">
                    <span><strong>Auto-Progress Floor</strong> — Automatically advance to the next floor after clearing the current one (4 kills)</span>
                </label>
                
                <div style="margin-top:10px;">
                    <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Battle Mode</div>
                    <select id="tbb-menu-battlemode" style="width:100%; padding:6px; border-radius:4px; background:var(--tbb-card); color:var(--tbb-text); border:1px solid var(--tbb-border);">
                        <option value="attrition" ${_g.battleMode === 'attrition' ? 'selected' : ''}>Attrition (Defeat 1 by 1)</option>
                        <option value="endless" ${_g.battleMode === 'endless' ? 'selected' : ''}>Endless (Respawn immediately)</option>
                    </select>
                </div>

                ${jumpUnlocked ? `
                <div class="tbb-floor-selector" style="margin-top:0.6em;">
                    <label>Jump to Floor:</label>
                    <input type="range" id="tbb-floor-range" min="0" max="${_g.maxUnlockedFloor}" value="${_g.currentFloor}" step="1">
                    <span id="tbb-floor-range-val">${_g.currentFloor}</span>
                </div>` : `<p class="tbb-muted" style="margin-top:0.4em;">🗺️ <i>Find the Cartographer's Table (Floor 18) to unlock floor jumping.</i></p>`}
            </div>
            <div class="tbb-dialog-actions">
                ${jumpUnlocked ? `<button class="tbb-dialog-btn tbb-dialog-btn-primary" id="tbb-floor-go">Go to Floor</button>` : ''}
                <button class="tbb-dialog-btn" id="tbb-menu-change-vocab" style="margin-top:4px; border-color:#3498db; color:#3498db; font-weight:bold;">📚 Change Vocabulary</button>
                <button class="tbb-dialog-btn" id="tbb-menu-vocab-settings">⚙️ Vocab Settings</button>
                <button class="tbb-dialog-btn" id="tbb-menu-exit">Exit Game</button>
                <button class="tbb-dialog-btn" id="tbb-wipe-btn" style="color:#e74c3c;border-color:#e74c3c;opacity:0.7;">🗑 Wipe All Progress</button>
                <button class="tbb-dialog-btn" id="tbb-menu-close">Close</button>
            </div>
        </div>
    `);

    const autoCb = _dom.overlay.querySelector('#tbb-menu-autoprog');
    if (autoCb) autoCb.addEventListener('change', () => {
        _g.autoProgressFloor = autoCb.checked;
        _writeSave();
    });

    const modeSel = _dom.overlay.querySelector('#tbb-menu-battlemode');
    if (modeSel) {
        modeSel.addEventListener('change', () => {
            _g.battleMode = modeSel.value;
            _writeSave();
        });
    }

    const range = _dom.overlay.querySelector('#tbb-floor-range');
    const val   = _dom.overlay.querySelector('#tbb-floor-range-val');
    if (range) range.addEventListener('input', () => { val.textContent = range.value; });
    const goBtn = _dom.overlay.querySelector('#tbb-floor-go');
    if (goBtn) goBtn.addEventListener('click', () => {
        _g.currentFloor = parseInt(range.value);
        _g.enemiesOnFloorKilled = 0;
        _closeOverlay();
        _spawnEnemyAndBegin();
    });

    const changeVocabBtn = _dom.overlay.querySelector('#tbb-menu-change-vocab');
    if (changeVocabBtn) {
        changeVocabBtn.addEventListener('click', () => {
            _closeOverlay();
            _openChangeDeckModal();
        });
    }

    const vocabSettingsBtn = _dom.overlay.querySelector('#tbb-menu-vocab-settings');
    if (vocabSettingsBtn) {
        vocabSettingsBtn.addEventListener('click', _showVocabSettingsOverlay);
    }

    _dom.overlay.querySelector('#tbb-wipe-btn').addEventListener('click', () => {
        _showWipeConfirmOverlay();
    });

    _dom.overlay.querySelector('#tbb-menu-exit').addEventListener('click', () => {
        _stopTimer();
        _closeOverlay();
        _onExit();
    });
    _dom.overlay.querySelector('#tbb-menu-close').addEventListener('click', _closeOverlay);
}

// ─── Vocab Settings (GameVocabManager standard panel) ─────────────────────────
function _showVocabSettingsOverlay() {
    if (!_vocabMgr) return;
    setGvmTheme('dark');   // TBB is inherently dark-themed

    _showOverlay(`
        <div class="tbb-dialog tbb-stats-dialog" style="max-width:24em;">
            <div class="tbb-dialog-title">⚙️ Vocabulary Settings</div>
            <div class="tbb-dialog-body"><div id="tbb-vocab-settings-wrap"></div></div>
            <div class="tbb-dialog-actions">
                <button class="tbb-dialog-btn tbb-dialog-btn-primary" id="tbb-vs-close">Back</button>
            </div>
        </div>
    `);

    const wrap = _dom.overlay.querySelector('#tbb-vocab-settings-wrap');
    renderVocabSettings(_vocabMgr, wrap, (updatedConfig) => {
        // Panel already wrote the values into _vocabMgr.config — just persist.
        _g.vocabConfig = updatedConfig;
        _writeSave();
        _closeOverlay();
    }, _vocabMgr.getPoolSource());

    _dom.overlay.querySelector('#tbb-vs-close').addEventListener('click', () => {
        _closeOverlay();
        _showMenuOverlay();
    });
}

// ─── Change Deck Modal ────────────────────────────────────────────────────────
function _openChangeDeckModal() {
    const existing = document.getElementById('tbb-change-deck-overlay');
    if (existing) existing.remove();

    // Block the battle clocks while the deck picker is open
    _pauseAnswerTimer();
    _vocabMgr?.pause();

    const overlay = document.createElement('div');
    overlay.id = 'tbb-change-deck-overlay';
    overlay.style.cssText = `
        position:fixed; inset:0; z-index:9000;
        background:var(--tbb-bg);
        display:flex; flex-direction:column;
        overflow:hidden;
    `;

    overlay.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:var(--tbb-surface); border-bottom:1px solid var(--tbb-border); flex-shrink:0;">
            <div style="font-size:16px; font-weight:bold; color:var(--tbb-gold);">📚 Change Deck</div>
            <button id="tbb-cdm-cancel" style="background:none; border:none; font-size:22px; cursor:pointer; color:var(--tbb-muted); line-height:1; padding:2px 6px;">✕</button>
        </div>
        <div id="tbb-cdm-selector-wrap" style="flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding-bottom:20px;"></div>
        <div style="padding:12px 16px; background:var(--tbb-surface); border-top:1px solid var(--tbb-border); flex-shrink:0; display:flex; flex-direction:column; gap:8px; padding-bottom:calc(12px + env(safe-area-inset-bottom, 0px));">
            <div id="tbb-cdm-status" style="display:none; font-size:12px; padding:6px 10px; background:rgba(231,76,60,0.1); border:1px solid #e74c3c; border-radius:6px; color:#e74c3c;"></div>
            <button id="tbb-cdm-confirm" style="width:100%; padding:14px; border:none; border-radius:8px; background:var(--tbb-green); color:white; font-size:15px; font-weight:bold; cursor:pointer;">✓ Apply New Deck</button>
        </div>
    `;

    document.body.appendChild(overlay);

    const selectorWrap = overlay.querySelector('#tbb-cdm-selector-wrap');
    const currentDeck  = _loadDeckCfg();
    const cdmSelector  = mountVocabSelector(selectorWrap, {
        bannedKey:     BANNED_KEY,
        preloadConfig: currentDeck,
        extendMode:    true,
        title:         'Choose Vocabulary',
        defaultCount:  currentDeck?.count ?? 'All',
    });

    const statusEl = overlay.querySelector('#tbb-cdm-status');
    overlay.querySelector('#tbb-cdm-cancel').addEventListener('click', () => {
        overlay.remove();
        _vocabMgr?.resume();
        _resumeAnswerTimer();
    });

    overlay.querySelector('#tbb-cdm-confirm').addEventListener('click', async () => {
        const confirmBtn = overlay.querySelector('#tbb-cdm-confirm');
        confirmBtn.disabled = true;
        confirmBtn.textContent = '⏳ Building queue…';
        statusEl.style.display = 'none';

        const newDeckCfg = getDeckConfig(selectorWrap);
        const rawQueue   = await cdmSelector.getQueue();

        if (!rawQueue.length) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '✓ Apply New Deck';
            statusEl.textContent = 'No words matched — adjust your selection and try again.';
            statusEl.style.display = 'block';
            return;
        }

        if (newDeckCfg) _saveDeckCfg(newDeckCfg);

        // Free the in-flight word on the OLD manager, then rebuild around the
        // new queue — without this the manager kept quizzing the old pool.
        _cancelPendingChallenge();
        _vocabQueue = _mapQueue(rawQueue);
        _buildVocabMgr();
        _writeSave();

        _g.selectedGroupIdx = null;
        _g.answerDisabled   = false;
        _g.cardFlash        = null;

        const aliveIndices = _g.enemyGroup.map((e, i) => e.dead ? null : i).filter(i => i !== null);
        if (aliveIndices.length === 0) {
            _spawnEnemyAndBegin();
        } else {
            _prepareGroupVocabAmong(aliveIndices);
            _renderGroupCards();
            _renderTargetWord();
            _updateDueCount();
            _updateNarration();
        }

        overlay.remove();
    });
}

// ─── Wipe Progress ────────────────────────────────────────────────────────────
function _showWipeConfirmOverlay() {
    _showOverlay(`
        <div class="tbb-dialog">
            <div class="tbb-dialog-title tbb-red">⚠️ Wipe All Progress?</div>
            <div class="tbb-dialog-body">
                <p>This will permanently delete:</p>
                <p class="tbb-muted">• Player level, EXP, stat allocations<br>
                   • All unlocked floors &amp; floor events<br>
                   • Ascension Points &amp; all perk levels<br>
                   • Total enemies defeated &amp; settings</p>
                <p style="color:#e74c3c;font-weight:700;margin-top:0.5em;">This cannot be undone.</p>
            </div>
            <div class="tbb-dialog-actions">
                <button class="tbb-dialog-btn" style="background:#7b1e1e;border-color:#e74c3c;color:#fff;" id="tbb-wipe-confirm">🗑 Yes, Wipe Everything</button>
                <button class="tbb-dialog-btn tbb-dialog-btn-primary" id="tbb-wipe-cancel">Cancel</button>
            </div>
        </div>
    `);
    _dom.overlay.querySelector('#tbb-wipe-confirm').addEventListener('click', () => {
        localStorage.removeItem(SAVE_KEY);
        _closeOverlay();
        _cancelPendingChallenge();
        _initGameState();
        _g.currentHp = _g.playerHp;
        _spawnEnemyAndBegin();
        _renderAll();
    });
    _dom.overlay.querySelector('#tbb-wipe-cancel').addEventListener('click', () => {
        _closeOverlay();
        _showMenuOverlay();
    });
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
function _injectStyles() {
    if (document.getElementById('tbb-styles')) return;
    const s = document.createElement('style');
    s.id = 'tbb-styles';
    s.textContent = `
/* ── Variables ──────────────────────────────────────────────────────────── */
.tbb-root {
    --tbb-bg:        #0c0d12;
    --tbb-surface:   #13151e;
    --tbb-card:      #1c1f2e;
    --tbb-card2:     #12141c;
    --tbb-border:    rgba(255,255,255,0.08);
    --tbb-border2:   rgba(255,255,255,0.14);
    --tbb-accent:    #e94560;
    --tbb-gold:      #d4a847;
    --tbb-gold2:     #f0cc6e;
    --tbb-silver:    #8090a8;
    --tbb-text:      #e0ddd5;
    --tbb-muted:     #7a8a9a;
    --tbb-green:     #3dba6f;
    --tbb-purple:    #9b6fff;
    --tbb-hp-green:  #27ae60;
    --tbb-hp-yellow: #f39c12;
    --tbb-hp-red:    #e74c3c;
    /* Base font: scales with viewport so everything em-derived also scales */
    font-size: clamp(0.7rem, 1.8vw + 0.3vh, 1.1rem);
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: var(--tbb-bg);
    color: var(--tbb-text);
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    user-select: none;
    padding-bottom: calc(18vh + env(safe-area-inset-bottom, 0px));
}

/* ── Stats top bar ───────────────────────────────────────────────────────── */
.tbb-statsbar {
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.5em 0.7em;
    background: var(--tbb-surface);
    border-bottom: 1px solid var(--tbb-card);
    flex-shrink: 0;
}
.tbb-player-sprite { font-size: 1.6em; line-height: 1; flex-shrink: 0; }
.tbb-stats-block   { flex: 1; display: flex; flex-direction: column; gap: 0.2em; }
.tbb-stats-row1    { display: flex; justify-content: space-between; align-items: baseline; }
.tbb-hero-name     { font-family: 'Courier New', monospace; font-size: 0.7em; font-weight: 700; color: var(--tbb-gold); letter-spacing: .05em; }
.tbb-hp-label      { font-family: 'Courier New', monospace; font-size: 0.65em; color: var(--tbb-silver); }
.tbb-hp-nums       { font-family: 'Courier New', monospace; font-size: 0.65em; color: var(--tbb-green); }
.tbb-bar-wrap      { height: 0.55em; background: rgba(255,255,255,0.07); border-radius: 0.25em; overflow: hidden; }
.tbb-exp-wrap      { height: 0.22em; margin-top: 0.15em; }
.tbb-bar           { height: 100%; border-radius: 0.25em; transition: width .35s ease, background .35s ease; }
.tbb-hp-bar        { background: var(--tbb-hp-green); }
.tbb-exp-bar       { background: var(--tbb-purple); }
.tbb-stats-right   { display: flex; flex-direction: column; align-items: flex-end; gap: 0.15em; flex-shrink: 0; }
.tbb-floor-badge   { font-family: 'Courier New', monospace; font-size: 0.65em; color: var(--tbb-gold); background: rgba(212,168,71,0.12); padding: 0.15em 0.5em; border-radius: 1em; white-space: nowrap; }
.tbb-stat-pip      { font-family: 'Courier New', monospace; font-size: 0.65em; color: var(--tbb-silver); }
.tbb-lvlup-notif   { font-size: 0.7em; font-weight: 900; color: #f1c40f; opacity: 0; transition: opacity .3s; text-shadow: 0 0 0.4em #f1c40f; }
.tbb-menu-btn, .tbb-stats-btn {
    background: none; border: 1px solid var(--tbb-border); border-radius: 0.4em;
    color: var(--tbb-text); padding: 0.25em 0.5em; cursor: pointer; font-size: 1em;
    flex-shrink: 0;
}
.tbb-explore-btn {
    background: none; border: 1px solid var(--tbb-border); border-radius: 0.3em;
    padding: 0.1em 0.3em; font-size: 0.85em; cursor: pointer; color: var(--tbb-text);
    margin-left: 0.2em; transition: background .15s;
}

/* ── Target word banner ──────────────────────────────────────────────────── */
.tbb-target-banner {
    background: var(--tbb-surface);
    border-bottom: 1px solid var(--tbb-card);
    border-left: 0.2em solid var(--tbb-gold);
    padding: 0.5em 0.9em;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15em;
    flex-shrink: 0;
    position: relative;
}
.tbb-target-jp   { font-size: 2em; font-weight: 700; letter-spacing: .2em; color: #fff; text-align: center; line-height: 1; }
.tbb-word-furi   { font-size: 0.8em; color: var(--tbb-silver); font-style: italic; text-align: center; min-height: 1em; }
.tbb-status-dot  { position: absolute; top: 0.4em; right: 0.6em; width: 0.55em; height: 0.55em; border-radius: 50%; }
.tbb-status-dot.due   { background: #2ecc71; box-shadow: 0 0 0.3em #2ecc71; }
.tbb-status-dot.new   { background: #3498db; box-shadow: 0 0 0.3em #3498db; }
.tbb-status-dot.drill { background: linear-gradient(135deg,#ff0080,#ff8c00,#40e0d0,#9b59b6); box-shadow: 0 0 0.3em rgba(255,255,255,.4); }
.tbb-timer-wrap {
    width: 100%; max-width: 22em; height: 0.28em; margin-top: 0.35em;
    background: rgba(255,255,255,0.07); border-radius: 0.15em; overflow: hidden;
}
.tbb-timer-bar {
    height: 100%; border-radius: 0.15em; background: var(--tbb-hp-green);
    transition: width .12s linear, background .3s;
}
.tbb-due-count {
    display: inline-flex; align-items: center; justify-content: center;
    position: absolute; top: 0.4em; right: 2.2em;
    min-width: 1.4em; height: 1.4em; padding: 0 0.35em;
    border-radius: 0.7em;
    background: rgba(46,204,113,.18); border: 1px solid rgba(46,204,113,.5);
    color: #2ecc71; font-size: 0.6em; font-weight: 800;
    font-family: 'Courier New', monospace; letter-spacing: .02em;
    cursor: default;
}

/* ── Narration ───────────────────────────────────────────────────────────── */
.tbb-narration-wrap { padding: 0.4em 0.75em 0.25em; flex-shrink: 0; }
.tbb-narration {
    font-size: 0.8em; color: var(--tbb-muted); font-style: italic;
    background: var(--tbb-card); border-left: 0.15em solid var(--tbb-card);
    border-radius: 0.35em; padding: 0.45em 0.65em; line-height: 1.55;
    transition: border-left-color .25s;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── Combo ───────────────────────────────────────────────────────────────── */
.tbb-combo-display {
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75em; font-weight: 900; letter-spacing: .05em;
    padding: 0.15em 0.7em; border-radius: 2em;
    margin: 0 0.75em 0.15em; flex-shrink: 0;
}
.tbb-combo-cool { background: rgba(245,166,35,.18); color: #f5a623; border: 1px solid rgba(245,166,35,.4); }
.tbb-combo-warm { background: rgba(230,126,34,.20); color: #e67e22; border: 1px solid rgba(230,126,34,.5); }
.tbb-combo-hot  { background: rgba(231,76,60,.22);  color: #e74c3c; border: 1px solid rgba(231,76,60,.5); }

/* ── Battlefield (4 enemy cards) ─────────────────────────────────────────── */
.tbb-battlefield {
    height: 46vh;
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 0.5em;
    padding: 0.5em 0.6em 0.4em;
    overflow: hidden;
}
.tbb-ecard {
    flex: 1;
    max-width: 18vw;
    min-width: 5em;
    max-height: 100%;
    background: var(--tbb-card);
    border: 1px solid var(--tbb-border2);
    border-radius: 0.65em;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    overflow: hidden;
    transition: border-color .15s, transform .15s, box-shadow .15s;
    position: relative;
}
.tbb-ecard:hover:not(.dead)  { border-color: var(--tbb-gold); transform: translateY(-0.3em); box-shadow: 0 0.4em 1.2em rgba(0,0,0,.5); }
.tbb-ecard.sel               { border-color: var(--tbb-green); transform: translateY(-0.4em); box-shadow: 0 0.5em 1.4em rgba(61,186,111,.3); }
.tbb-ecard.dead              { opacity: .15; cursor: default; filter: grayscale(1); transform: none !important; pointer-events: none; }
.tbb-ecard.flash-correct, .tbb-ecard.flash-correct.sel { border-color: #2ecc71 !important; box-shadow: 0 0 1.4em rgba(46,204,113,.75) !important; background: rgba(46,204,113,.12) !important; transform: translateY(-0.5em) !important; animation: tbbFlashGreen .9s ease-out; }
.tbb-ecard.flash-wrong       { border-color: #e74c3c !important; box-shadow: 0 0 1.2em rgba(231,76,60,.6)  !important; background: rgba(231,76,60,.10); animation: tbbFlashRed   .9s ease-out; }
@keyframes tbbFlashGreen { 0% { box-shadow: 0 0 2.5em rgba(46,204,113,.9); } 100% { box-shadow: 0 0 0.8em rgba(46,204,113,.3); } }
@keyframes tbbFlashRed   { 0% { box-shadow: 0 0 2.5em rgba(231,76,60,.9);  } 100% { box-shadow: 0 0 0.8em rgba(231,76,60,.3);  } }
.tbb-ec-cursor { height: 1.1em; display: flex; justify-content: center; align-items: flex-end; font-size: 0.6em; color: var(--tbb-green); animation: tbbArrBob .5s ease-in-out infinite alternate; font-family: 'Courier New', monospace; }
@keyframes tbbArrBob { from { transform: translateY(0); } to { transform: translateY(-0.2em); } }
.tbb-ec-icon {
    background: var(--tbb-card2);
    border-bottom: 1px solid var(--tbb-border);
    display: flex; align-items: center; justify-content: center;
    padding: 0.6em 0 0.5em; font-size: 2.2em; line-height: 1;
}
.tbb-ec-info { padding: 0.35em 0.4em; display: flex; flex-direction: column; gap: 0.2em; }
.tbb-ec-name { font-family: 'Courier New', monospace; font-size: 0.72em; color: var(--tbb-silver); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: .03em; }
.tbb-ec-hpbg { height: 0.22em; background: #180808; border-radius: 0.15em; overflow: hidden; border: 1px solid #2e1010; }
.tbb-ec-hpfill { height: 100%; border-radius: 0.15em; transition: width .3s ease; }
.tbb-ec-hplbl { font-family: 'Courier New', monospace; font-size: 0.58em; color: var(--tbb-silver); text-align: center; margin-top: 0.15em; letter-spacing: .02em; }
.tbb-ec-trans {
    border-top: 1px solid var(--tbb-border);
    background: var(--tbb-card2);
    padding: 0.4em 0.35em;
    font-size: 0.85em; font-weight: 600; color: #c8c2b2;
    text-align: center; line-height: 1.25;
    word-break: break-word;
}
.tbb-ecard.sel .tbb-ec-trans { color: var(--tbb-gold2); }

/* Telegraphed ("charging") enemy */
.tbb-ecard.tele {
    border-color: var(--tbb-hp-yellow);
    animation: tbbTelePulse .7s ease-in-out infinite alternate;
}
@keyframes tbbTelePulse {
    from { box-shadow: 0 0 0.45em rgba(243,156,18,.35); }
    to   { box-shadow: 0 0 1.1em  rgba(243,156,18,.75); }
}
.tbb-ec-cursor.tele { color: var(--tbb-hp-yellow); }

/* Final-duel card: both answer options stacked on the last survivor */
.tbb-ec-duo {
    border-top: 1px solid var(--tbb-border);
    background: var(--tbb-card2);
    display: flex; flex-direction: column;
}
.tbb-ec-opt {
    border: none; border-top: 1px solid var(--tbb-border);
    background: none; font-family: inherit; cursor: pointer;
    padding: 0.45em 0.35em; min-height: 2.2em;
    font-size: 0.85em; font-weight: 600; color: #c8c2b2;
    text-align: center; line-height: 1.25; word-break: break-word;
}
.tbb-ec-opt:first-child { border-top: none; }
.tbb-ec-opt:hover, .tbb-ec-opt:active { background: rgba(255,255,255,.07); color: var(--tbb-gold2); }

/* ── Footer — 4 attack type buttons ─────────────────────────────────────── */
.tbb-footer {
    display: flex;
    gap: 0.4em;
    padding: 0.5em 0.6em calc(4vh + env(safe-area-inset-bottom, 0px));
    background: var(--tbb-surface);
    border-top: 1px solid var(--tbb-card);
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 10;
}
.tbb-atk-btn {
    flex: 1;
    padding: 0.5em 0.25em 0.4em;
    border: 1px solid var(--tbb-border2);
    background: var(--tbb-card);
    color: var(--tbb-silver);
    font-family: 'Courier New', monospace;
    font-size: 0.7em;
    border-radius: 0.45em;
    cursor: pointer;
    transition: all .12s;
    letter-spacing: .03em;
    display: flex; flex-direction: column; align-items: center; gap: 0.15em;
    line-height: 1.8;
}
.tbb-atk-btn:hover  { border-color: var(--tbb-silver); color: var(--tbb-text); transform: scale(1.04); }
.tbb-atk-btn:active { transform: scale(.96); }
.tbb-type-slash  { border-color: #a03030; color: #e07070; background: #140a0a; }
.tbb-type-pierce { border-color: #a06020; color: #e09050; background: #140e08; }
.tbb-type-magic  { border-color: #5a40a0; color: #a080e0; background: #100c18; }
.tbb-type-wild   { border-color: #907020; color: var(--tbb-gold); background: #141008; }
.tbb-atk-btn:hover.tbb-type-slash  { border-color: #e07070; }
.tbb-atk-btn:hover.tbb-type-pierce { border-color: #e09050; }
.tbb-atk-btn:hover.tbb-type-magic  { border-color: #a080e0; }
.tbb-atk-btn:hover.tbb-type-wild   { border-color: var(--tbb-gold2); }
/* Active stance highlight (Quick Strike mode) */
.tbb-atk-btn.tbb-atk-btn-active.tbb-type-slash  { border-color: #e07070; background: #2a0e0e; box-shadow: 0 0 0.6em rgba(224,112,112,.35); }
.tbb-atk-btn.tbb-atk-btn-active.tbb-type-pierce { border-color: #e09050; background: #2a1a08; box-shadow: 0 0 0.6em rgba(224,144,80,.35); }
.tbb-atk-btn.tbb-atk-btn-active.tbb-type-magic  { border-color: #a080e0; background: #1a1030; box-shadow: 0 0 0.6em rgba(160,128,224,.35); }
.tbb-atk-btn.tbb-atk-btn-active.tbb-type-wild   { border-color: var(--tbb-gold2); background: #201c08; box-shadow: 0 0 0.6em rgba(212,168,71,.35); }
.tbb-atk-sub  { font-size: 0.75em; color: var(--tbb-silver); letter-spacing: 0; }
.tbb-mult-badge { font-size: 0.7em; padding: 0.1em 0.35em; border-radius: 0.25em; font-family: 'Courier New', monospace; }
.tbb-mult-weak { background: #1a1408; color: var(--tbb-gold); }
.tbb-mult-res  { background: #120808; color: #e07070; }
.tbb-mult-norm { background: #081408; color: var(--tbb-green); }

/* ── Float numbers ───────────────────────────────────────────────────────── */
.tbb-float {
    position: absolute; top: 0; left: 50%;
    transform: translateX(-50%);
    font-size: 0.9em; font-weight: 900;
    pointer-events: none;
    animation: tbbFloat .9s forwards ease-out;
    text-shadow: 0 0.07em 0.2em rgba(0,0,0,.6);
    white-space: nowrap;
}
@keyframes tbbFloat {
    0%   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-3em) scale(1.15); }
}

/* ── Overlay & Dialog ────────────────────────────────────────────────────── */
.tbb-overlay {
    position: absolute; inset: 0;
    background: rgba(0,0,0,.75);
    display: flex; align-items: center; justify-content: center;
    z-index: 100; padding: 1em;
}
.tbb-dialog {
    background: var(--tbb-surface);
    border: 1px solid var(--tbb-border2);
    border-radius: 1em;
    width: 100%; max-width: 22em;
    padding: 1.25em;
    display: flex; flex-direction: column; gap: 0.75em;
    box-shadow: 0 1em 3em rgba(0,0,0,.5);
    max-height: 80vh; overflow-y: auto;
}
.tbb-dialog-title { font-size: 1em; font-weight: 900; color: var(--tbb-gold); letter-spacing: .03em; }
.tbb-dialog-body  { font-size: 0.85em; line-height: 1.6; display: flex; flex-direction: column; gap: 0.4em; color: var(--tbb-text); }
.tbb-dialog-body p { margin: 0; }
.tbb-dialog-actions { display: flex; flex-direction: column; gap: 0.5em; }
.tbb-dialog-btn {
    padding: 0.65em 1em; border-radius: 0.65em;
    border: 1px solid var(--tbb-border2); background: var(--tbb-card);
    color: var(--tbb-text); font-size: 0.85em; font-weight: 700;
    cursor: pointer; transition: background .15s; text-align: center;
}
.tbb-dialog-btn:hover { background: rgba(255,255,255,.08); }
.tbb-dialog-btn-primary { background: var(--tbb-accent); border-color: var(--tbb-accent); }
.tbb-dialog-btn-primary:hover { background: #c73652; }
.tbb-dialog-btn-secondary { opacity: .7; }
.tbb-dialog-btn:disabled { opacity: .5; cursor: default; }
.tbb-rebirth-btn { background: #6c3483; border-color: #8e44ad; }
.tbb-rebirth-btn:hover { background: #8e44ad; }
.tbb-respec-btn  { background: rgba(255,255,255,.04); }

/* ── Floor Dialog ────────────────────────────────────────────────────────── */
.tbb-floor-dialog { max-width: 24em; gap: 0.75em; }
.tbb-floor-desc  { font-size: 0.85em; line-height: 1.7; color: var(--tbb-muted); border-left: 0.2em solid var(--tbb-gold); padding-left: 0.65em; font-style: italic; }
.tbb-floor-repeat { font-size: 0.8em; color: #7f8c8d; background: rgba(255,255,255,.04); border-radius: 0.4em; padding: 0.5em 0.65em; }
.tbb-floor-result { font-size: 0.85em; font-weight: 700; color: var(--tbb-gold); background: rgba(212,168,71,.1); border-radius: 0.5em; padding: 0.65em 0.75em; text-align: center; }

/* ── Stats Panel ─────────────────────────────────────────────────────────── */
.tbb-stats-dialog { max-width: 20em; }
.tbb-stat-row    { display: flex; align-items: center; justify-content: space-between; padding: 0.35em 0; border-bottom: 1px solid var(--tbb-border); font-size: 0.85em; }
.tbb-stat-row:last-of-type { border-bottom: none; }
.tbb-stat-name   { flex: 1; color: var(--tbb-muted); }
.tbb-stat-val    { font-weight: 800; color: var(--tbb-text); min-width: 2.5em; text-align: right; margin-right: 0.5em; }
.tbb-alloc-btn   { background: var(--tbb-accent); border: none; border-radius: 0.4em; color: white; font-size: 0.8em; font-weight: 800; padding: 0.2em 0.6em; cursor: pointer; }
.tbb-alloc-placeholder { width: 2.2em; }
.tbb-hr { border: none; border-top: 1px solid var(--tbb-border); margin: 0.25em 0; }

/* ── Perk List ───────────────────────────────────────────────────────────── */
.tbb-perk-list { max-height: 50vh; overflow-y: auto; gap: 0.5em; }
.tbb-perk-row  { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5em; padding: 0.5em; background: var(--tbb-card); border-radius: 0.5em; border: 1px solid var(--tbb-border); font-size: 0.8em; line-height: 1.5; }
.tbb-perk-locked { opacity: .45; }
.tbb-perk-info { flex: 1; }

/* ── Misc ────────────────────────────────────────────────────────────────── */
.tbb-run-stats    { font-size: 0.85em; color: var(--tbb-silver); background: rgba(255,255,255,.04); border-radius: 0.4em; padding: 0.5em 0.65em; }
.tbb-muted        { color: var(--tbb-muted); font-size: 0.8em; }
.tbb-red          { color: var(--tbb-accent); }
.tbb-unlocked     { color: #2ecc71; font-weight: 700; }
.tbb-rebirth-info { color: #9b59b6; font-weight: 700; }
.tbb-floor-selector { display: flex; align-items: center; gap: 0.5em; font-size: 0.8em; margin-top: 0.4em; }
.tbb-floor-selector input { flex: 1; }
@keyframes tbbPulse { 0% { transform: scale(1); } 100% { transform: scale(1.1); } }
`;
    document.head.appendChild(s);
}