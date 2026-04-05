// js/games/tbb/tbb.js — Turn-Based Battle (TBB) vocabulary game
// export { init, launch }

import { mountVocabSelector } from '../../vocab_selector.js';
import * as srsDb             from '../../srs_db.js';
import { spawnEnemy }         from './tbb_enemies.js';
import { getFloorData }       from './tbb_floors.js';
import { PERK_DEFS, REBIRTH_MIN_LEVEL, REBIRTH_AP_DIVIDER,
         totalApSpent, canSpendAp, computePerkBonuses, calcRebirthAp } from './tbb_ascension.js';
import { getAttackMultiplier, handleWrongAnswerRetaliation,
         handlePlayerDefense, actionExp,
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
        floorActionsDone:     {},   // floor# -> true, persisted so unlock/repeat logic survives sessions
        unlockedFeatures:     {},   // featureKey -> true
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
        floorActionsDone:     Object.assign({}, _g.floorActionsDone),
        unlockedFeatures:     Object.assign({}, _g.unlockedFeatures),
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
    _g.expToNext  = expToNextLevel(_g.playerLevel);
}

function _initGameState(battleMode = 'attrition') {
    const sv = _loadSave();
    _g = Object.assign({}, sv, {
        // Session state (not persisted)
        battleMode:           battleMode,   // 'attrition' | 'endless'
        currentHp:            0,
        enemy:                null,   // kept for SRS/exp helpers that reference _g.enemy
        enemyHp:              0,
        currentFloor:         sv.maxUnlockedFloor,
        enemiesOnFloorKilled: 0,
        phase:                'idle',
        narration:            'Entering the dungeon…',
        attackType:           'slash',
        quickStrikeMode:      true,   // tap card → instant attack with current type
        // ── Group battle state ──────────────────────────────────────────
        enemyGroup:           [],    // array of 4 enemy objects with .trans + .dead
        selectedGroupIdx:     null,  // which card the player has targeted
        groupTargetWord:      null,  // vocab word for this group encounter
        groupIsDrill:         false,
        // ── legacy challenge (kept for _prepareChallenge compat) ────────
        challengeWord:        null,
        isDrill:              false,
        mcOptions:            [],
        correctIdx:           -1,
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
        defaultCount: 'All',
        title:        'Turn-Based Battle — Choose Vocabulary',
    });

    const actions = _selector.getActionsEl();

    // ── Battle mode selector ──────────────────────────────────────────────
    const modeWrap = document.createElement('div');
    modeWrap.style.cssText = 'margin-top:10px;display:flex;flex-direction:column;gap:6px;';
    modeWrap.innerHTML = `
        <div style="font-size:0.85em;font-weight:700;color:#8090a8;letter-spacing:.04em;">BATTLE MODE</div>
        <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:0.85em;">
            <input type="radio" name="tbb-mode" value="attrition" checked style="margin-top:3px;flex-shrink:0;">
            <span><strong>Attrition</strong> — 4 enemies, defeat them one by one. New vocab drawn from survivors until the last one falls.</span>
        </label>
        <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:0.85em;">
            <input type="radio" name="tbb-mode" value="endless" style="margin-top:3px;flex-shrink:0;">
            <span><strong>Endless</strong> — 4 enemies always. A new enemy spawns immediately when one is defeated.</span>
        </label>`;
    actions.appendChild(modeWrap);

    // ── Quick Strike mode toggle ──────────────────────────────────────────
    const qsWrap = document.createElement('div');
    qsWrap.style.cssText = 'margin-top:10px;display:flex;flex-direction:column;gap:6px;';
    qsWrap.innerHTML = `
        <div style="font-size:0.85em;font-weight:700;color:#8090a8;letter-spacing:.04em;">CONTROL MODE</div>
        <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:0.85em;">
            <input type="checkbox" id="tbb-qs-toggle" checked style="margin-top:3px;flex-shrink:0;">
            <span><strong>Quick Strike</strong> — Tap an enemy card to instantly attack with the selected type. Type buttons set your stance; enemy cards fire the attack.</span>
        </label>`;
    actions.appendChild(qsWrap);

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
async function _startGame() {
    const queue = await _selector.getQueue();
    if (!queue.length) return;

    _vocabQueue = queue.map(w => ({ word: w.word, furi: w.furi || w.word, trans: w.trans || '—' }));
    const modeRadio = _screens.setup.querySelector('input[name="tbb-mode"]:checked');
    const qsCheck   = _screens.setup.querySelector('#tbb-qs-toggle');
    _initGameState(modeRadio?.value ?? 'attrition');
    _g.quickStrikeMode = qsCheck ? qsCheck.checked : true;

    _show('game');
    _buildGameDOM();
    _spawnEnemyAndBegin();
}

let _timerInterval  = null;
let _timerPaused    = false;   // true while any overlay is open
let _timerElapsedMs = 0;       // ms consumed before current resume
let _timerStartMs   = 0;       // wall-clock time of last resume

function _spawnEnemyAndBegin() {
    // ── Spawn a group of 4 enemies of the same template ──────────────────
    // Use the same floor-tier logic: pick one template, clone 4× with hp variance
    const templateEnemy = spawnEnemy(_g.currentFloor);
    _g.enemy   = templateEnemy;  // keep for legacy helpers
    _g.enemyHp = templateEnemy.maxHp;

    _g.enemyGroup = [0,1,2,3].map(() => {
        const e = spawnEnemy(_g.currentFloor);
        // Force same name/emoji as template so the group looks coherent
        return {
            ...e,
            name:   templateEnemy.name,
            emoji:  templateEnemy.emoji,
            weakTo: templateEnemy.weakTo,
            resists:templateEnemy.resists,
            maxHp:  templateEnemy.maxHp,
            currentHp: templateEnemy.maxHp,
            dead:   false,
            trans:  null,   // assigned below
        };
    });

    // ── Pick vocab word and assign translations ───────────────────────────
    _prepareGroupVocab();

    _g.selectedGroupIdx = null;
    _g.answerDisabled   = false;
    _g.phase            = 'player_attack';
    _g.narration        = `${templateEnemy.emoji} ${templateEnemy.name} ×4 appear! (Lv.${templateEnemy.level}) Strike the correct meaning!`;

    _renderAll();
    _updateComboDisplay();
}

function _prepareGroupVocab() {
    if (!_vocabQueue.length) return;

    // Pick a word (same SRS logic as before)
    const globalSrsData = srsDb.getAllWords();
    const now = new Date();
    let dueCandidates = [], notDueCandidates = [];
    _vocabQueue.forEach(w => {
        const entry = globalSrsData[w.word];
        if (!entry || !entry.dueDate || new Date(entry.dueDate) <= now) dueCandidates.push(w);
        else notDueCandidates.push({ wordObj: w, lastUpdated: new Date(entry.lastUpdated).getTime() });
    });

    let word = null, isDrill = false;
    if (dueCandidates.length > 0) {
        word = dueCandidates[Math.floor(Math.random() * dueCandidates.length)];
    } else if (notDueCandidates.length > 0) {
        notDueCandidates.sort((a, b) => a.lastUpdated - b.lastUpdated);
        const topN = notDueCandidates.slice(0, 5);
        word = topN[Math.floor(Math.random() * topN.length)].wordObj;
        isDrill = true;
    } else {
        word = _vocabQueue[Math.floor(Math.random() * _vocabQueue.length)];
    }

    _g.groupTargetWord = word;
    _g.groupIsDrill    = isDrill;

    // Generate 4 MC options: 1 correct + 3 distractors, shuffle across 4 cards
    const opts = generateMcOptions(word, _vocabQueue); // returns 4 items [correct, ...distractors] shuffled
    _g.enemyGroup.forEach((e, i) => { e.trans = opts[i] ?? `Option ${i+1}`; });
}

/**
 * Attrition mode: reassign MC options only among the surviving cards.
 * Dead cards keep their .trans but their slot is visually greyed out.
 * @param {number[]} aliveIndices - indices of non-dead cards
 */
function _prepareGroupVocabAmong(aliveIndices) {
    if (!_vocabQueue.length) return;

    // Pick a new target word
    const globalSrsData = srsDb.getAllWords();
    const now = new Date();
    let dueCandidates = [], notDueCandidates = [];
    _vocabQueue.forEach(w => {
        const entry = globalSrsData[w.word];
        if (!entry || !entry.dueDate || new Date(entry.dueDate) <= now) dueCandidates.push(w);
        else notDueCandidates.push({ wordObj: w, lastUpdated: new Date(entry.lastUpdated).getTime() });
    });

    let word = null, isDrill = false;
    if (dueCandidates.length > 0) {
        word = dueCandidates[Math.floor(Math.random() * dueCandidates.length)];
    } else if (notDueCandidates.length > 0) {
        notDueCandidates.sort((a, b) => a.lastUpdated - b.lastUpdated);
        const topN = notDueCandidates.slice(0, 5);
        word = topN[Math.floor(Math.random() * topN.length)].wordObj;
        isDrill = true;
    } else {
        word = _vocabQueue[Math.floor(Math.random() * _vocabQueue.length)];
    }

    _g.groupTargetWord = word;
    _g.groupIsDrill    = isDrill;

    // Generate exactly as many options as there are survivors (max 4)
    const n = aliveIndices.length;
    const correct = word.trans;
    const pool = _vocabQueue
        .filter(w => w.word !== word.word && w.trans !== correct)
        .map(w => w.trans);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const opts = [correct, ...pool.slice(0, n - 1)];
    while (opts.length < n) opts.push(`Option ${opts.length + 1}`);
    for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
    }

    aliveIndices.forEach((cardIdx, optIdx) => {
        _g.enemyGroup[cardIdx].trans = opts[optIdx];
    });
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

function _prepareChallenge() {
    if (!_vocabQueue.length) return;
    
    const globalSrsData = srsDb.getAllWords();
    const now = new Date();
    
    let dueCandidates = [];
    let notDueCandidates = [];
    
    _vocabQueue.forEach(w => {
        const entry = globalSrsData[w.word];
        if (!entry || !entry.dueDate || new Date(entry.dueDate) <= now) {
            dueCandidates.push(w);
        } else {
            notDueCandidates.push({wordObj: w, lastUpdated: new Date(entry.lastUpdated).getTime()});
        }
    });
    
    let word = null;
    let isDrill = false;
    
    if (dueCandidates.length > 0) {
        word = dueCandidates[Math.floor(Math.random() * dueCandidates.length)];
    } else if (notDueCandidates.length > 0) {
        // Sort by oldest lastUpdated
        notDueCandidates.sort((a, b) => a.lastUpdated - b.lastUpdated);
        // Pick from the top 5 least recently seen to add slight randomness
        const topN = notDueCandidates.slice(0, 5);
        word = topN[Math.floor(Math.random() * topN.length)].wordObj;
        isDrill = true;
    } else {
        // Fallback
        word = _vocabQueue[Math.floor(Math.random() * _vocabQueue.length)];
    }
    
    _g.challengeWord  = word;
    _g.isDrill        = isDrill;
    _g.mcOptions      = generateMcOptions(word, _vocabQueue);
    _g.correctIdx     = _g.mcOptions.indexOf(word.trans);
    _g.answerDisabled = false;
    _g.answerTimeLeft = 1.0;
    _startAnswerTimer();
}

function _calcAnswerSecs() {
    const pb = _g._pb ?? {};
    return Math.max(MIN_ANSWER_SECS, BASE_ANSWER_SECS + (pb.answerTimeSecs ?? 0));
}

function _startAnswerTimer() {
    _stopTimer();
    _timerPaused    = false;
    _timerElapsedMs = 0;
    _timerStartMs   = Date.now();
    const totalMs   = _calcAnswerSecs() * 1000;

    _timerInterval = setInterval(() => {
        if (_timerPaused) return;
        const elapsed = _timerElapsedMs + (Date.now() - _timerStartMs);
        _g.answerTimeLeft = Math.max(0, 1 - elapsed / totalMs);
        _updateTimerBar();
        if (_g.answerTimeLeft <= 0) {
            clearInterval(_timerInterval);
            _timerInterval = null;
            // Group battle has no timeout penalty — timer is kept for perk compat only
        }
    }, 80);
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
function _selectGroupEnemy(idx) {
    if (_g.answerDisabled || _g.phase !== 'player_attack') return;
    if (_g.enemyGroup[idx]?.dead) return;

    if (_g.quickStrikeMode) {
        // Quick Strike: selecting a card immediately fires the attack with the current type
        _g.selectedGroupIdx = idx;
        _renderGroupCards();
        _onGroupAttack(_g.attackType);
    } else {
        // Classic: first click selects, then player presses a type button
        _g.selectedGroupIdx = idx;
        _renderGroupCards();
        _updateMultBadges();
    }
}

// ─── Group Battle: type button clicked ───────────────────────────────────────
function _onTypeButtonClick(rawType) {
    if (_g.answerDisabled || _g.phase !== 'player_attack') return;

    if (_g.quickStrikeMode) {
        // Set stance; if a card is already targeted, fire immediately
        const resolvedType = rawType === 'wild'
            ? ['slash','pierce','magic'][Math.floor(Math.random() * 3)]
            : rawType;
        _g.attackType = resolvedType;
        _updateAtkBtnHighlight();
        if (_g.selectedGroupIdx !== null && !_g.enemyGroup[_g.selectedGroupIdx]?.dead) {
            _onGroupAttack(rawType);
        }
    } else {
        // Classic: type button fires attack (card must be selected first)
        _onGroupAttack(rawType);
    }
}

// ─── Group Battle: fire attack (called by type buttons) ───────────────────────
function _onGroupAttack(rawType) {
    if (_g.answerDisabled || _g.phase !== 'player_attack') return;
    if (_g.selectedGroupIdx === null) {
        _g.narration = 'Select an enemy first!';
        _updateNarration();
        return;
    }

    _g.answerDisabled = true;
    _stopTimer();

    const idx        = _g.selectedGroupIdx;
    const targetCard = _g.enemyGroup[idx];
    const word       = _g.groupTargetWord;
    const resolvedType = rawType === 'wild'
        ? ['slash','pierce','magic'][Math.floor(Math.random() * 3)]
        : rawType;
    _g.attackType = resolvedType;
    _updateAtkBtnHighlight();

    const isCorrect = targetCard.trans === word.trans;

    // SRS grading
    srsDb.gradeWordInGame({ word: word.word, furi: word.furi, translation: word.trans }, isCorrect ? 2 : 0, true);

    // Combo
    if (isCorrect) _g.combo++; else _g.combo = 0;
    const comboMult = _g.combo > 1 ? (1 + 0.2 * Math.log2(_g.combo)) : 1.0;
    _updateComboDisplay();

    if (isCorrect) {
        // ── Correct: EXP scaled by type matchup via getAttackMultiplier ─────
        const { mult, feedback } = getAttackMultiplier(targetCard, resolvedType, _g._pb);
        // weaknessAmpBonus already baked into mult from getAttackMultiplier
        const expMult = mult;

        let rawExp = actionExp(targetCard.expYield, true);
        rawExp     = timeAdjustExp(rawExp, 1.0); // no timer — always full value
        rawExp     = Math.round(rawExp * comboMult * expMult);
        const gained = applyExpBonuses(rawExp, _g._pb.additiveExpPct, _g._pb.multExpPct);

        targetCard.dead      = true;
        targetCard.currentHp = 0;
        _g.enemyHp           = 0;

        // Flash correct card green
        _g.cardFlash = { correct: idx, wrong: null };

        const wildNote = rawType === 'wild' ? ` (Wild → ${resolvedType})` : '';
        if (feedback === 'weakness') _g.narration = `⚡ Weakness!${wildNote} "${targetCard.trans}" correct! EXP ×${mult.toFixed(2)}`;
        else if (feedback === 'resist') _g.narration = `🛡 Resisted${wildNote}, but correct. "${targetCard.trans}" — EXP ×0.5`;
        else if (feedback === 'crit')   _g.narration = `💥 Critical${wildNote}! "${targetCard.trans}" — EXP ×${mult.toFixed(1)}`;
        else                            _g.narration = `✓ Correct${wildNote}! "${targetCard.trans}" — ${targetCard.name} defeated.`;

        _g.totalEnemiesDefeated++;
        _g.enemiesOnFloorKilled++;

        _addExp(gained);
        _updateDueCount();
        _g.selectedGroupIdx = null;  // clear before render so flash-correct wins over sel style
        _spawnFloatEnemy(`+${gained} EXP`,
            feedback === 'weakness' ? '#d4a847' :
            feedback === 'crit'     ? '#9b6fff' :
            feedback === 'resist'   ? '#e07070' : '#3dba6f');
        _renderGroupCards();
        _updateHpBars();
        _updateNarration();
        _updateMultBadges();

        // Floor unlock check
        const unlocked = _g.enemiesOnFloorKilled >= ENEMIES_PER_FLOOR_UNLOCK
            && _g.currentFloor === _g.maxUnlockedFloor
            && _g.maxUnlockedFloor < MAX_FLOORS - 1;
        if (unlocked) {
            _g.maxUnlockedFloor++;
            _g.narration += `  🗺️ Floor ${_g.maxUnlockedFloor} unlocked!`;
            _updateNarration();
        }
        _writeSave();

        setTimeout(() => {
            _g.selectedGroupIdx = null;
            _g.answerDisabled   = false;
            _g.cardFlash        = null;

            if (_g.battleMode === 'endless') {
                // ── Endless: replace the dead slot with a fresh enemy ─────
                const fresh = spawnEnemy(_g.currentFloor);
                _g.enemyGroup[idx] = {
                    ...fresh,
                    currentHp: fresh.maxHp,
                    dead:      false,
                    trans:     null,
                };
                // Redistribute all 4 MC options across the (now full) group
                _prepareGroupVocab();
                const aliveCount = _g.enemyGroup.filter(e => !e.dead).length;
                _g.narration = `${fresh.emoji} ${fresh.name} joins the fray! (${aliveCount} remain)`;
                _renderAll();
                _updateComboDisplay();
            } else {
                // ── Attrition: check survivors ────────────────────────────
                const aliveIndices = _g.enemyGroup
                    .map((e, i) => e.dead ? null : i)
                    .filter(i => i !== null);

                if (aliveIndices.length === 0) {
                    // All 4 dead — full encounter clear, spawn new wave
                    _spawnEnemyAndBegin();
                } else {
                    // Redistribute MC options only among the living cards
                    _prepareGroupVocabAmong(aliveIndices);
                    const lastName = _g.enemyGroup[aliveIndices[0]].name;
                    _g.narration = aliveIndices.length === 1
                        ? `⚔️ One ${lastName} remains — finish it!`
                        : `${aliveIndices.length} enemies remain — strike the correct meaning!`;
                    _renderGroupCards();
                    _renderTargetWord();
                    _updateMultBadges();
                    _updateNarration();
                }
            }
        }, 1100);

    } else {
        // ── Wrong: targeted enemy retaliates ─────────────────────────────
        const { dmg, narration } = handleWrongAnswerRetaliation(_g, targetCard);
        _g.currentHp = Math.max(0, _g.currentHp - dmg);

        // Find the correct card index to reveal it green
        const correctIdx = _g.enemyGroup.findIndex(e => !e.dead && e.trans === word.trans);
        _g.cardFlash = { correct: correctIdx, wrong: idx };

        const wildNote = rawType === 'wild' ? ` (Wild → ${resolvedType})` : '';
        _g.narration = `✗ "${targetCard.trans}" is wrong!${wildNote} ${narration}`;

        _spawnFloatPlayer(`-${dmg}`, '#e74c3c');
        _renderGroupCards();
        _updateHpBars();
        _updateNarration();

        setTimeout(() => {
            if (_g.currentHp <= 0) { _handlePlayerDefeated(); return; }
            _g.selectedGroupIdx = null;
            _g.answerDisabled   = false;
            _g.cardFlash        = null;

            // Pick a fresh target word and redistribute MC options among alive cards
            const aliveIndices = _g.enemyGroup
                .map((e, i) => e.dead ? null : i)
                .filter(i => i !== null);
            _prepareGroupVocabAmong(aliveIndices);
            _renderGroupCards();
            _renderTargetWord();
            _updateMultBadges();
            _updateDueCount();
        }, 900);
    }
}

function _handleEnemyDefeated() {
    // Kept for compatibility — group system handles wins inline in _onGroupAttack.
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
            <span class="tbb-floor-badge">Floor <span id="tbb-floor">0</span> <button class="tbb-explore-btn" id="tbb-explore-btn" title="Explore">🗺️</button></span>
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
        <button class="tbb-atk-btn tbb-type-slash" id="tbb-bt-slash"  data-type="slash"  onclick="">⚔ SLASH<span  class="tbb-atk-sub">stance</span><span class="tbb-mult-badge" id="tbb-mb-slash"></span></button>
        <button class="tbb-atk-btn tbb-type-pierce" id="tbb-bt-pierce" data-type="pierce" onclick="">🗡 PIERCE<span class="tbb-atk-sub">stance</span><span class="tbb-mult-badge" id="tbb-mb-pierce"></span></button>
        <button class="tbb-atk-btn tbb-type-magic"  id="tbb-bt-magic"  data-type="magic"  onclick="">✦ MAGIC<span  class="tbb-atk-sub">stance</span><span class="tbb-mult-badge" id="tbb-mb-magic"></span></button>
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

    // Wire enemy cards
    _dom.ecards.forEach(card => {
        card.addEventListener('click', () => _selectGroupEnemy(parseInt(card.dataset.idx)));
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
    if (!w) return;
    _dom.wordKanji.textContent = w.word;
    _dom.wordFuri.textContent  = (w.furi && w.furi !== w.word) ? w.furi : '';
    if (_g.groupIsDrill) {
        _dom.statusDot.className = 'tbb-status-dot drill';
        _dom.statusDot.title = 'Free Drill';
    } else {
        _dom.statusDot.className = 'tbb-status-dot due';
        _dom.statusDot.title = 'Scheduled Review';
    }
}

function _updateDueCount() {
    if (!_dom.dueCount) return;
    // Only show when the session queue contains SRS words
    const hasSrs = _vocabQueue.some(w => w.deckId === 'srs') ||
                   _vocabQueue.length > 0; // always show if we have a queue
    if (!hasSrs) { _dom.dueCount.style.display = 'none'; return; }
    const now = new Date();
    const due = _vocabQueue.filter(w => {
        const entry = srsDb.getAllWords()[w.word];
        return !entry || !entry.dueDate || new Date(entry.dueDate) <= now;
    }).length;
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

        card.className = 'tbb-ecard' + (e.dead ? ' dead' : '') + (sel ? ' sel' : '') + flashCls;
        card.innerHTML = `
            <div class="tbb-ec-cursor">${sel ? '▼' : ''}</div>
            <div class="tbb-ec-icon">${e.emoji}</div>
            <div class="tbb-ec-info">
                <div class="tbb-ec-name">${e.name}</div>
                <div class="tbb-ec-hpbg"><div class="tbb-ec-hpfill" style="width:${hpPct}%;background:${hpCol}"></div></div>
            </div>
            <div class="tbb-ec-trans">${e.trans}</div>`;
    });
}

function _updateMultBadges() {
    const TYPES = ['slash','pierce','magic'];
    const sel = _g.selectedGroupIdx;
    if (sel === null || !_g.enemyGroup[sel]) {
        TYPES.forEach(t => {
            const b = document.getElementById('tbb-mb-'+t);
            if (b) { b.textContent = ''; b.className = 'tbb-mult-badge'; }
        });
        return;
    }
    const e = _g.enemyGroup[sel];
    TYPES.forEach(t => {
        const b = document.getElementById('tbb-mb-'+t);
        if (!b) return;
        if (t === e.weakTo)  { b.textContent = '×1.75'; b.className = 'tbb-mult-badge tbb-mult-weak'; }
        else if (t === e.resists) { b.textContent = '×0.5'; b.className = 'tbb-mult-badge tbb-mult-res'; }
        else                 { b.textContent = '×1.0';  b.className = 'tbb-mult-badge tbb-mult-norm'; }
    });
}

function _updateHpBars() {
    const pFrac = _g.playerHp > 0 ? _g.currentHp / _g.playerHp : 0;
    _dom.playerHpBar.style.width = (pFrac * 100).toFixed(1) + '%';
    _dom.playerHpBar.style.background = pFrac > 0.5 ? 'var(--tbb-hp-green)' : pFrac > 0.25 ? 'var(--tbb-hp-yellow)' : 'var(--tbb-hp-red)';
    _dom.playerHpLbl.textContent = `${_g.currentHp} / ${_g.playerHp}`;
    _dom.floor.textContent = _g.currentFloor;
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
        const isActive = _g.quickStrikeMode && btn.dataset.type === _g.attackType;
        btn.classList.toggle('tbb-atk-btn-active', isActive);
    });
}

function _updateNarration() {
    _dom.narration.textContent = _g.narration || '—';
}

// Stubs for legacy callers that may still exist in overlay code
function _renderChallenge() { _renderGroupCards(); _renderTargetWord(); }
function _updateTimerBar()   { /* timer removed in group battle */ }
function _markMcButtons()    { /* MC buttons removed in group battle */ }

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
}
function _closeOverlay() {
    _dom.overlay.style.display = 'none';
    _resumeAnswerTimer();
}

function _renderSummaryOverlay() {
    const e = _g.enemy;
    const comboLine = _g.combo >= 2
        ? `<p style="color:#f5a623;font-weight:800;">🔥 ${_g.combo}× Combo streak continues!</p>`
        : '';
    _showOverlay(`
        <div class="tbb-dialog">
            <div class="tbb-dialog-title">⚔️ Victory!</div>
            <div class="tbb-dialog-body">
                <p>${e.emoji} <b>${e.name}</b> (Lv.${e.level}) defeated!</p>
                <p>Floor: ${_g.currentFloor} | Enemies: ${_g.totalEnemiesDefeated}</p>
                ${comboLine}
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
    const jumpUnlocked = !!_g.unlockedFeatures['unlock_floor_jump'];
    const qsChecked = _g.quickStrikeMode ? 'checked' : '';
    _showOverlay(`
        <div class="tbb-dialog">
            <div class="tbb-dialog-title">☰ Menu</div>
            <div class="tbb-dialog-body">
                <p>Floor: ${_g.currentFloor} / ${_g.maxUnlockedFloor} unlocked</p>
                <p>Total enemies defeated: ${_g.totalEnemiesDefeated}</p>
                <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:0.85em;margin-top:0.5em;">
                    <input type="checkbox" id="tbb-menu-qs" ${qsChecked} style="margin-top:3px;flex-shrink:0;">
                    <span><strong>Quick Strike</strong> — Tap enemy to attack with current stance</span>
                </label>
                ${jumpUnlocked ? `
                <div class="tbb-floor-selector">
                    <label>Jump to Floor:</label>
                    <input type="range" id="tbb-floor-range" min="0" max="${_g.maxUnlockedFloor}" value="${_g.currentFloor}" step="1">
                    <span id="tbb-floor-range-val">${_g.currentFloor}</span>
                </div>` : `<p class="tbb-muted">🗺️ <i>Find the Cartographer's Table (Floor 18) to unlock floor jumping.</i></p>`}
            </div>
            <div class="tbb-dialog-actions">
                ${jumpUnlocked ? `<button class="tbb-dialog-btn tbb-dialog-btn-primary" id="tbb-floor-go">Go to Floor</button>` : ''}
                <button class="tbb-dialog-btn" id="tbb-menu-exit">Exit Game</button>
                <button class="tbb-dialog-btn" id="tbb-menu-close">Close</button>
            </div>
        </div>
    `);
    const qsCb = _dom.overlay.querySelector('#tbb-menu-qs');
    if (qsCb) qsCb.addEventListener('change', () => {
        _g.quickStrikeMode = qsCb.checked;
        _g.selectedGroupIdx = null;   // reset any dangling selection
        _updateAtkBtnHighlight();
        _renderGroupCards();
    });
    const range = _dom.overlay.querySelector('#tbb-floor-range');
    const val   = _dom.overlay.querySelector('#tbb-floor-range-val');
    if (range) range.addEventListener('input', () => { val.textContent = range.value; });
    const goBtn = _dom.overlay.querySelector('#tbb-floor-go');
    if (goBtn) goBtn.addEventListener('click', () => {
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
.tbb-status-dot.drill { background: linear-gradient(135deg,#ff0080,#ff8c00,#40e0d0,#9b59b6); box-shadow: 0 0 0.3em rgba(255,255,255,.4); }
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
.tbb-ec-trans {
    border-top: 1px solid var(--tbb-border);
    background: var(--tbb-card2);
    padding: 0.4em 0.35em;
    font-size: 0.85em; font-weight: 600; color: #c8c2b2;
    text-align: center; line-height: 1.25;
    word-break: break-word;
}
.tbb-ecard.sel .tbb-ec-trans { color: var(--tbb-gold2); }

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