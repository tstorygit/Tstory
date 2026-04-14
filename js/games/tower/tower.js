// main/js/games/tower/tower.js

import { mountVocabSelector } from '../../vocab_selector.js';
import { GameVocabManager } from '../../game_vocab_mgr.js';
import { showGameQuiz, poolSourceLabel, renderVocabSettings } from '../../game_vocab_mgr_ui.js';
import { UPGRADES, LAB_RESEARCH, calcStat, calcCost, calcLabCost, calcLabTimeMs } from './tower_data.js';
import { TowerEngine } from './tower_engine.js';

let _screens = null;
let _onExit = null;
let _vocabMgr = null;
let _engine = null;

const SAVE_KEY = 'polyglot_tower_save';
let _save = null;

// Run state
let _run = {
    wave: 1,
    diff: 1,
    cash: 0,
    knowledgeStacks: 0,
    levels: { offense: {}, defense: {}, utility: {} }
};

// ─── INITIALIZATION ──────────────────────────────────────────────────────────

function _defaultSave() {
    return {
        coins: 0,
        highestWave: 0,
        maxDiff: 1,
        workshop: {
            offense: { damage:0, atkSpeed:0, range:0, critChance:0, critMult:0 },
            defense: { health:0, regen:0, defAbs:0, defPct:0, lifesteal:0, thorns:0 },
            utility: { cashBonus:0, coinsWave:0, freeUpg:0 }
        },
        lab: {
            active: null, // { id, endTime }
            levels: { knowledge:0, gameSpeed:0, coinYield:0 }
        },
        vocabConfig: GameVocabManager.defaultConfig()
    };
}

export function init(screens, onExit) {
    _screens = screens;
    _onExit = onExit;
    _injectCSS();
    
    // Setup HTML Structure inside the two provided screens
    // Hub goes in `setup` screen
    _screens.setup.innerHTML = `
        <div class="tw-root">
            <div class="tw-header">
                <h2 class="tw-header-title">Polyglot Tower</h2>
                <div class="tw-coins">🪙 <span id="tw-hub-coins">0</span></div>
            </div>
            <div class="tw-tab-bar">
                <button class="tw-tab-btn active" data-tab="hub-play">Play</button>
                <button class="tw-tab-btn" data-tab="hub-workshop">Workshop</button>
                <button class="tw-tab-btn" data-tab="hub-lab">Lab</button>
                <button class="tw-tab-btn" data-tab="hub-vocab">Vocab</button>
            </div>
            
            <!-- Play Tab -->
            <div class="tw-screen active tw-scroll-content" id="tw-hub-play">
                <div class="tw-stage-card">
                    <h3 style="color:#00ffff; margin-top:0;">Select Difficulty</h3>
                    <div class="tw-stage-controls">
                        <button class="tw-diff-btn" id="tw-diff-prev">❮</button>
                        <div class="tw-diff-label">Tier <span id="tw-diff-val">1</span></div>
                        <button class="tw-diff-btn" id="tw-diff-next">❯</button>
                    </div>
                    <div class="tw-target-wave">Complete Wave <span id="tw-target-val">10</span> to unlock next tier.</div>
                    <button class="tw-play-btn" id="tw-start-run">BATTLE</button>
                </div>
                <button id="tw-exit-game" style="width:100%; padding:12px; background:none; border:1px solid #555; color:#aaa; border-radius:8px; margin-top:20px; cursor:pointer;">Exit to App</button>
            </div>
            
            <!-- Workshop Tab -->
            <div class="tw-screen tw-scroll-content" id="tw-hub-workshop">
                <p style="font-size:12px; color:#888; text-align:center;">Permanent upgrades bought with Coins.</p>
                <div id="tw-ws-list"></div>
            </div>
            
            <!-- Lab Tab -->
            <div class="tw-screen tw-scroll-content" id="tw-hub-lab">
                <div id="tw-lab-active" style="display:none; background:rgba(46,204,113,0.1); border:1px solid #2ecc71; border-radius:8px; padding:12px; margin-bottom:15px; text-align:center;">
                    <div style="font-size:12px; color:#2ecc71; font-weight:bold; margin-bottom:4px;">Researching: <span id="tw-lab-active-name"></span></div>
                    <div style="font-family:monospace; font-size:16px; color:#fff;" id="tw-lab-countdown">00:00:00</div>
                </div>
                <div id="tw-lab-list"></div>
            </div>
            
            <!-- Vocab Tab -->
            <div class="tw-screen tw-scroll-content" id="tw-hub-vocab">
                <div id="tw-vocab-settings-mount"></div>
                <button id="tw-change-deck-btn" style="width:100%; margin-top:20px; padding:12px; border:1px solid #00ffff; background:rgba(0,255,255,0.05); color:#00ffff; border-radius:8px; font-weight:bold; cursor:pointer;">Change Vocabulary Deck</button>
            </div>
        </div>
    `;
    
    // Battle Screen
    _screens.game.innerHTML = `
        <div class="tw-root">
            <div class="tw-header tw-battle-header">
                <div class="tw-wave-text">Wave <span id="tw-run-wave">1</span></div>
                <div class="tw-run-cash">$ <span id="tw-run-cash-val">0</span></div>
                <div style="font-size:12px; font-weight:bold; color:#9b59b6;">🧠 ×<span id="tw-run-know">1.00</span></div>
            </div>
            <div class="tw-hp-bar-wrap"><div class="tw-hp-fill" id="tw-run-hp-bar"></div></div>
            
            <div class="tw-canvas-wrap">
                <canvas id="tw-canvas"></canvas>
                <div id="tw-ui-layer"></div>
            </div>
            
            <div class="tw-battle-upgrades">
                <div class="tw-subtab-bar">
                    <button class="tw-subtab-btn active" data-subtab="run-offense">Offense</button>
                    <button class="tw-subtab-btn" data-subtab="run-defense">Defense</button>
                    <button class="tw-subtab-btn" data-subtab="run-utility">Utility</button>
                </div>
                <div class="tw-subtab-content active" id="tw-run-offense"></div>
                <div class="tw-subtab-content" id="tw-run-defense"></div>
                <div class="tw-subtab-content" id="tw-run-utility"></div>
            </div>
        </div>
    `;

    // Wire Hub Tabs
    _screens.setup.querySelectorAll('.tw-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _screens.setup.querySelectorAll('.tw-tab-btn').forEach(b => b.classList.remove('active'));
            _screens.setup.querySelectorAll('.tw-screen').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            _screens.setup.querySelector(`#${btn.dataset.tab}`).classList.add('active');
        });
    });

    // Wire Run Subtabs
    _screens.game.querySelectorAll('.tw-subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _screens.game.querySelectorAll('.tw-subtab-btn').forEach(b => b.classList.remove('active'));
            _screens.game.querySelectorAll('.tw-subtab-content').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            _screens.game.querySelector(`#${btn.dataset.subtab}`).classList.add('active');
        });
    });

    _screens.setup.querySelector('#tw-exit-game').onclick = () => _onExit();
    _screens.setup.querySelector('#tw-start-run').onclick = () => _startRun();
    _screens.setup.querySelector('#tw-change-deck-btn').onclick = () => _openDeckSelector();

    // Difficulty selectors
    let selectedDiff = 1;
    const diffVal = _screens.setup.querySelector('#tw-diff-val');
    const targetVal = _screens.setup.querySelector('#tw-target-val');
    const prevBtn = _screens.setup.querySelector('#tw-diff-prev');
    const nextBtn = _screens.setup.querySelector('#tw-diff-next');

    const updateDiffUI = () => {
        diffVal.textContent = selectedDiff;
        targetVal.textContent = Math.round(26 * Math.log(selectedDiff) + 10);
        prevBtn.disabled = selectedDiff <= 1;
        nextBtn.disabled = selectedDiff >= _save.maxDiff;
        _run.diff = selectedDiff;
    };
    prevBtn.onclick = () => { selectedDiff--; updateDiffUI(); };
    nextBtn.onclick = () => { selectedDiff++; updateDiffUI(); };

    // Set up engine
    _engine = new TowerEngine(_screens.game.querySelector('#tw-canvas'), {
        onHpUpdate: () => _updateRunHUD(),
        onEnemyKill: (cash) => {
            _run.cash += cash;
            _updateRunHUD();
            _renderRunUpgrades();
        },
        onWaveComplete: () => {
            _run.wave++;
            _checkUnlock();
            _startNextWave();
        },
        onPlayerDie: () => _handleDeath()
    });

    // Start Lab ticker
    setInterval(_labTicker, 1000);

    // Expose updateDiffUI so _showHub() can call it after _save is loaded
    init._updateDiffUI = updateDiffUI;
}

export function launch() {
    _save = JSON.parse(localStorage.getItem(SAVE_KEY)) || _defaultSave();
    
    // Ensure all categories exist
    if (!_save.workshop.offense) _save = _defaultSave();

    _vocabMgr = new GameVocabManager(_save.vocabConfig);
    const srsPool = GameVocabManager.loadSrsPool();
    
    if (srsPool.length > 0) {
        _vocabMgr.setPool(srsPool, 'tower_banned', { globalSrs: true });
        _showHub();
    } else {
        _openDeckSelector();
    }
}

function _saveGame() {
    if (_vocabMgr && !_vocabMgr.isGlobalSrs) {
        _save.vocabState = _vocabMgr.exportState();
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(_save));
}

function _showHub() {
    _screens.setup.style.display = 'block';
    _screens.game.style.display = 'none';
    
    _screens.setup.querySelector('#tw-hub-coins').textContent = Math.floor(_save.coins);
    
    // Update Diff UI now that _save is available
    if (typeof init._updateDiffUI === 'function') init._updateDiffUI();

    _renderWorkshop();
    _renderLab();
    
    // Render Vocab Settings
    renderVocabSettings(
        _vocabMgr,
        _screens.setup.querySelector('#tw-vocab-settings-mount'),
        (config) => {
            _save.vocabConfig = config;
            _saveGame();
        },
        _vocabMgr.getPoolSource()
    );
}

// ─── WORKSHOP & LAB ──────────────────────────────────────────────────────────

function _renderWorkshop() {
    const list = _screens.setup.querySelector('#tw-ws-list');
    list.innerHTML = '';
    
    for (const cat of ['offense', 'defense', 'utility']) {
        const catDiv = document.createElement('div');
        catDiv.innerHTML = `<div class="tw-upg-cat-title">${cat}</div>`;
        
        for (const id in UPGRADES[cat]) {
            const def = UPGRADES[cat][id];
            const lvl = _save.workshop[cat][id];
            if (def.max !== undefined && lvl >= def.max) continue; // Optional: hide maxed
            
            const cost = calcCost(cat, id, lvl, true);
            const val = calcStat(cat, id, lvl, 0);
            
            const row = document.createElement('div');
            row.className = 'tw-upg-row';
            row.innerHTML = `
                <div class="tw-upg-info">
                    <div class="tw-upg-name">${def.name} <span style="font-size:10px;color:#777;">Lvl ${lvl}</span></div>
                    <div class="tw-upg-val">${def.isPct ? (val*100).toFixed(1)+'%' : val.toFixed(1)}</div>
                </div>
                <button class="tw-upg-buy" ${(_save.coins < cost || (def.max && lvl >= def.max)) ? 'disabled' : ''}>
                    ${(def.max && lvl >= def.max) ? 'MAX' : '🪙 ' + cost}
                </button>
            `;
            
            row.querySelector('button').onclick = () => {
                if (_save.coins >= cost) {
                    _save.coins -= cost;
                    _save.workshop[cat][id]++;
                    _saveGame();
                    _showHub(); // Re-render
                }
            };
            catDiv.appendChild(row);
        }
        list.appendChild(catDiv);
    }
}

function _renderLab() {
    const list = _screens.setup.querySelector('#tw-lab-list');
    list.innerHTML = '';
    
    for (const id in LAB_RESEARCH) {
        const def = LAB_RESEARCH[id];
        const lvl = _save.lab.levels[id];
        const cost = calcLabCost(id, lvl);
        const timeMs = calcLabTimeMs(id, lvl);
        const isMax = def.max && lvl >= def.max;
        
        let timeStr = '';
        if (timeMs < 60000) timeStr = `${timeMs/1000}s`;
        else if (timeMs < 3600000) timeStr = `${Math.floor(timeMs/60000)}m`;
        else timeStr = `${(timeMs/3600000).toFixed(1)}h`;

        const row = document.createElement('div');
        row.className = 'tw-lab-row';
        row.innerHTML = `
            <div class="tw-lab-header">
                <span class="tw-lab-name">${def.name} <span style="font-size:10px;color:#777;">Lvl ${lvl}</span></span>
                <span class="tw-lab-time">⏱ ${timeStr}</span>
            </div>
            <div class="tw-lab-desc">${def.desc}</div>
            <div class="tw-lab-actions">
                <span style="font-size:12px;color:#aaa;">Cost: 🪙 ${cost}</span>
                <button class="tw-lab-buy" ${(_save.coins < cost || isMax || _save.lab.active) ? 'disabled' : ''}>
                    ${isMax ? 'MAX' : 'Research'}
                </button>
            </div>
        `;
        
        row.querySelector('button').onclick = () => {
            if (_save.coins >= cost && !_save.lab.active) {
                _save.coins -= cost;
                _save.lab.active = { id: id, endTime: Date.now() + timeMs };
                _saveGame();
                _showHub();
            }
        };
        list.appendChild(row);
    }
}

function _labTicker() {
    if (_screens.setup.style.display === 'none') return;
    if (!_save || !_save.lab.active) {
        const activeDiv = _screens.setup.querySelector('#tw-lab-active');
        if (activeDiv) activeDiv.style.display = 'none';
        return;
    }
    
    const lab = _save.lab.active;
    const remain = lab.endTime - Date.now();
    
    if (remain <= 0) {
        _save.lab.levels[lab.id]++;
        _save.lab.active = null;
        _saveGame();
        _showHub();
        return;
    }
    
    const activeDiv = _screens.setup.querySelector('#tw-lab-active');
    activeDiv.style.display = 'block';
    _screens.setup.querySelector('#tw-lab-active-name').textContent = LAB_RESEARCH[lab.id].name;
    
    const h = Math.floor(remain / 3600000).toString().padStart(2, '0');
    const m = Math.floor((remain % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((remain % 60000) / 1000).toString().padStart(2, '0');
    _screens.setup.querySelector('#tw-lab-countdown').textContent = `${h}:${m}:${s}`;
}

// ─── RUN MECHANICS ───────────────────────────────────────────────────────────

function _getTowerStats() {
    const kMult = 0.01 + (_save.lab.levels.knowledge * 0.005);
    const kBuff = 1 + (_run.knowledgeStacks * kMult);
    
    let stats = {};
    for (const cat of ['offense', 'defense', 'utility']) {
        for (const id in UPGRADES[cat]) {
            let val = calcStat(cat, id, _save.workshop[cat][id], _run.levels[cat][id]);
            
            // Apply Knowledge Buff to Absolute Core Stats
            if (id === 'damage' || id === 'health' || id === 'regen' || id === 'cashBonus') {
                val *= kBuff;
            }
            stats[id] = val;
        }
    }
    
    // Track current HP state
    stats.currentHp = _engine.stats ? (_engine.stats.currentHp || stats.health) : stats.health;
    // ensure max hp increase heals
    if (_engine.stats && stats.health > _engine.stats.health) {
        stats.currentHp += (stats.health - _engine.stats.health);
    }
    stats.gameSpeed = 1 + (_save.lab.levels.gameSpeed * 0.1);
    
    return stats;
}

function _startRun() {
    // Reset Run State
    _run.wave = 1;
    _run.cash = 50 * _save.lab.levels.startingCash; // Base 0 + bonus
    _run.knowledgeStacks = 0;
    
    for (const cat of ['offense', 'defense', 'utility']) {
        for (const id in UPGRADES[cat]) {
            _run.levels[cat][id] = 0;
        }
    }
    
    _screens.setup.style.display = 'none';
    _screens.game.style.display = 'flex';
    
    _vocabMgr.seedInitialWords(5);
    
    _engine.startRun(_getTowerStats(), _run.wave, _run.diff);
    _updateRunHUD();
    _renderRunUpgrades();
    
    _startNextWave();
}

function _startNextWave() {
    _updateRunHUD();
    
    _engine.pause();
    _vocabMgr.pause();
    
    const uiLayer = _screens.game.querySelector('#tw-ui-layer');
    
    showGameQuiz(_vocabMgr, {
        container: uiLayer,
        title: `Wave ${_run.wave} Approaching`,
        subtitle: 'Correct answer grants +1 Knowledge Stack!',
        onAnswer: (isCorrect) => {
            if (isCorrect) {
                _run.knowledgeStacks++;
                _engine.spawnFloatText('+1 Knowledge!', '#2ecc71', true);
            } else {
                _engine.spawnFloatText('Missed Buff...', '#e74c3c', true);
            }
            
            _engine.stats = _getTowerStats(); // Apply new buff
            _updateRunHUD();
            
            _vocabMgr.resume();
            _engine.resume();
            _engine.startWave(_run.wave);
        },
        onEmpty: () => {
            _vocabMgr.resume();
            _engine.resume();
            _engine.startWave(_run.wave);
        }
    });
}

function _checkUnlock() {
    const target = Math.round(26 * Math.log(_run.diff) + 10);
    if (_run.wave > _save.highestWave) _save.highestWave = _run.wave;
    
    if (_run.wave > target && _run.diff >= _save.maxDiff) {
        _save.maxDiff = _run.diff + 1;
        _saveGame();
        _engine.spawnFloatText('TIER UNLOCKED!', '#00ffff', true);
    }
}

function _handleDeath() {
    const coinsWave = _engine.stats.coinsWave;
    const baseCoins = _run.wave * _run.diff;
    const bonusCoins = _run.wave * coinsWave;
    let totalCoins = baseCoins + bonusCoins;
    
    // Lab Coin Yield
    totalCoins *= (1 + _save.lab.levels.coinYield * 0.1);
    totalCoins = Math.floor(totalCoins);
    
    _save.coins += totalCoins;
    
    if (_vocabMgr && !_vocabMgr.isGlobalSrs) {
        _vocabMgr.exportToAppSrs(null, 'skip');
    }
    _saveGame();
    
    alert(`Tower Destroyed at Wave ${_run.wave}!\nYou earned ${totalCoins} 🪙 Coins.`);
    _showHub();
}

function _updateRunHUD() {
    _screens.game.querySelector('#tw-run-wave').textContent = _run.wave;
    _screens.game.querySelector('#tw-run-cash-val').textContent = Math.floor(_run.cash);
    
    const kMult = 0.01 + (_save.lab.levels.knowledge * 0.005);
    const kBuff = 1 + (_run.knowledgeStacks * kMult);
    _screens.game.querySelector('#tw-run-know').textContent = kBuff.toFixed(2);
    
    const hpBar = _screens.game.querySelector('#tw-run-hp-bar');
    if (_engine && _engine.stats) {
        const pct = Math.max(0, _engine.stats.currentHp / _engine.stats.health) * 100;
        hpBar.style.width = `${pct}%`;
    }
}

function _renderRunUpgrades() {
    for (const cat of ['offense', 'defense', 'utility']) {
        const container = _screens.game.querySelector(`#tw-run-${cat}`);
        container.innerHTML = '';
        
        for (const id in UPGRADES[cat]) {
            const def = UPGRADES[cat][id];
            const runLvl = _run.levels[cat][id];
            if (def.max !== undefined) {
                const totalVal = calcStat(cat, id, _save.workshop[cat][id], runLvl);
                if (totalVal >= def.max) continue; // Hide capped
            }
            
            const cost = calcCost(cat, id, runLvl, false);
            const val = calcStat(cat, id, _save.workshop[cat][id], runLvl);
            
            const row = document.createElement('div');
            row.className = 'tw-upg-row';
            row.innerHTML = `
                <div class="tw-upg-info">
                    <div class="tw-upg-name">${def.name} <span style="font-size:10px;color:#777;">Lvl ${runLvl}</span></div>
                    <div class="tw-upg-val">${def.isPct ? (val*100).toFixed(1)+'%' : val.toFixed(1)}</div>
                </div>
                <button class="tw-upg-buy" ${(_run.cash < cost) ? 'disabled' : ''}>
                    $ ${cost}
                </button>
            `;
            
            row.querySelector('button').onclick = () => {
                if (_run.cash >= cost) {
                    // Free Upgrade chance
                    if (Math.random() > _engine.stats.freeUpg) {
                        _run.cash -= cost;
                    } else {
                        _engine.spawnFloatText('FREE!', '#f1c40f', true);
                    }
                    _run.levels[cat][id]++;
                    _engine.stats = _getTowerStats();
                    _updateRunHUD();
                    _renderRunUpgrades();
                }
            };
            container.appendChild(row);
        }
    }
}

// ─── DECK SELECTOR ───────────────────────────────────────────────────────────

function _openDeckSelector() {
    const hub = _screens.setup.querySelector('.tw-root');
    if (hub) hub.style.display = 'none';

    let dsWrap = _screens.setup.querySelector('#tw-deck-selector-wrap');
    if (!dsWrap) {
        dsWrap = document.createElement('div');
        dsWrap.id = 'tw-deck-selector-wrap';
        _screens.setup.appendChild(dsWrap);
    }
    dsWrap.style.display = 'block';
    dsWrap.innerHTML = '';

    const selector = mountVocabSelector(dsWrap, {
        bannedKey: 'tower_banned',
        defaultCount: 'All',
        title: 'Tower Defense — Vocabulary'
    });

    const actions = selector.getActionsEl();
    
    const applyBtn = document.createElement('button');
    applyBtn.className = 'tw-play-btn';
    applyBtn.style.marginTop = '10px';
    applyBtn.textContent = 'Apply Deck & Return';
    applyBtn.onclick = async () => {
        const queue = await selector.getQueue();
        if (queue.length > 0) {
            const hasSrs = queue.some(w => w.deckId === 'srs');
            _vocabMgr.setPool(queue, 'tower_banned', { globalSrs: hasSrs });
            _saveGame();
        }
        dsWrap.style.display = 'none';
        if (hub) hub.style.display = 'flex';
        _showHub();
    };

    actions.appendChild(applyBtn);
}

function _injectCSS() {
    if (!document.getElementById('tower-styles')) {
        const link = document.createElement('link');
        link.id = 'tower-styles';
        link.rel = 'stylesheet';
        link.href = './js/games/tower/tower.css';
        document.head.appendChild(link);
    }
}