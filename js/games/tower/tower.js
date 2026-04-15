// main/js/games/tower/tower.js

import { mountVocabSelector } from '../../vocab_selector.js';
import { GameVocabManager } from '../../game_vocab_mgr.js';
import { showGameQuiz, poolSourceLabel, renderVocabSettings, setGvmTheme } from '../../game_vocab_mgr_ui.js';
import { UPGRADES, LAB_RESEARCH, RELICS, calcStat, calcCost, calcLabCost, calcLabTimeMs } from './tower_data.js';
import { TowerEngine } from './tower_engine.js';

let _screens = null;
let _onExit = null;
let _vocabMgr = null;
let _engine = null;

const SAVE_KEY = 'polyglot_tower_save';
let _save = null;
let _speedMult = 1; // Default speed

// Run state
let _run = {
    wave: 1,
    diff: 1,
    cash: 0,
    earnedCoins: 0,
    knowledgeStacks: 0,
    combo: 0,
    abilityCharge: 0,
    targetMode: 'closest',
    vocabQuestions: 0,
    vocabCorrect: 0,
    levels: { offense: {}, defense: {}, utility: {} }
};

// ─── INITIALIZATION ──────────────────────────────────────────────────────────

function _defaultSave() {
    return {
        coins: 0,
        highestWave: 0,
        maxDiff: 1,
        workshop: {
            unlocks: {},
            offense: { damage:0, atkSpeed:0, range:0, critChance:0, critMult:0 },
            defense: { health:0, regen:0, defAbs:0, defPct:0, lifesteal:0, thorns:0 },
            utility: { cashBonus:0, cashWave:0, coinBonus:0, coinsWave:0, freeUpgOffense:0, freeUpgDefense:0, freeUpgUtility:0 }
        },
        lab: {
            active: null,
            levels: { knowledge:0, gameSpeed:0, coinYield:0, startingCash:0, vocabMastery:0, synergy:0 }
        },
        vocabConfig: GameVocabManager.defaultConfig(),
        stats: { totalCorrect: 0, sessionCorrect: 0, highestStreak: 0, wordsMastered: [] },
        relics: []
    };
}

export function init(screens, onExit) {
    _screens = screens;
    _onExit = onExit;
    _injectCSS();
    
    // Setup HTML Structure inside the two provided screens
    _screens.setup.innerHTML = `
        <div class="tw-root">
            <div class="tw-header">
                <h2 class="tw-header-title">Polyglot Tower</h2>
                <div class="tw-coins">🪙 <span id="tw-hub-coins">0</span></div>
            </div>
            <div class="tw-tab-bar">
                <button class="tw-tab-btn active" data-tab="tw-hub-play">Play</button>
                <button class="tw-tab-btn" data-tab="tw-hub-workshop">Workshop</button>
                <button class="tw-tab-btn" data-tab="tw-hub-lab">Lab</button>
                <button class="tw-tab-btn" data-tab="tw-hub-stats">Stats</button>
                <button class="tw-tab-btn" data-tab="tw-hub-vocab">Vocab</button>
            </div>
            
            <!-- Play Tab -->
            <div class="tw-screen active tw-scroll-content" id="tw-hub-play">
                <div class="tw-tower-visual">
                    <div class="tw-tower-crystal">🔮</div>
                    <div class="tw-tower-body">
                        <div class="tw-tower-window"></div>
                        <div class="tw-tower-window"></div>
                    </div>
                    <div class="tw-tower-base"></div>
                </div>

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

            <!-- Stats Tab -->
            <div class="tw-screen tw-scroll-content" id="tw-hub-stats">
                <h3 style="color:#00ffff; margin-top:0;">Session & Lifetime Stats</h3>
                <div id="tw-stats-content"></div>
                <div id="tw-relics-content" style="margin-top:20px;"></div>
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
            <div class="tw-header tw-battle-header" style="flex-direction:column; align-items:stretch; padding: 8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <div class="tw-wave-text">Wave <span id="tw-run-wave">1</span></div>
                        <div style="font-size:11px; color:#f1c40f; font-weight:bold; font-family:monospace;">🪙 +<span id="tw-run-earned-coins">0</span></div>
                    </div>
                    <div class="tw-run-cash">$ <span id="tw-run-cash-val">0</span></div>
                    <div style="font-size:12px; font-weight:bold; color:#9b59b6;">🧠 ×<span id="tw-run-know">1.00</span><span id="tw-run-combo" class="tw-combo-text"></span></div>
                </div>
                <div class="tw-targeting">
                    <button class="tw-target-btn active" data-target="closest">Closest</button>
                    <button class="tw-target-btn" data-target="farthest">Farthest</button>
                    <button class="tw-target-btn" data-target="boss">Boss</button>
                    <button class="tw-target-btn" data-target="fast">Fast</button>
                    <button class="tw-speed-btn" id="tw-btn-speed">⚡ 1x</button>
                </div>
                <div class="tw-abilities" style="margin-top:4px;">
                    <button class="tw-abil-btn" id="tw-abil-barrage" disabled>Barrage</button>
                    <button class="tw-abil-btn" id="tw-abil-nova" disabled>Nova</button>
                    <button class="tw-abil-btn" id="tw-abil-aegis" disabled>Aegis</button>
                </div>
                <div class="tw-ability-bar-wrap"><div class="tw-ability-fill" id="tw-abil-bar" style="width:0%;"></div></div>
            </div>
            
            <div class="tw-hp-bar-wrap"><div class="tw-hp-fill" id="tw-run-hp-bar"></div></div>
            
            <div class="tw-canvas-wrap">
                <canvas id="tw-canvas"></canvas>
                <div id="tw-ui-layer"></div>
            </div>
                
            <div class="tw-battle-upgrades">
                <div class="tw-subtab-bar">
                    <button class="tw-subtab-btn active" data-subtab="tw-run-offense">Offense</button>
                    <button class="tw-subtab-btn" data-subtab="tw-run-defense">Defense</button>
                    <button class="tw-subtab-btn" data-subtab="tw-run-utility">Utility</button>
                </div>
                <div class="tw-subtab-content active" id="tw-run-offense"></div>
                <div class="tw-subtab-content" id="tw-run-defense"></div>
                <div class="tw-subtab-content" id="tw-run-utility"></div>
            </div>

            <div id="tw-death-screen" class="tw-screen tw-modal" style="display:none; position:absolute; inset:0; z-index:1000;">
                <h1 style="color:#e74c3c; margin-bottom:10px;">Tower Destroyed</h1>
                <div id="tw-death-stats" style="text-align:center; color:#fff; line-height:1.8; margin-bottom:20px;"></div>
                <button id="tw-death-return" class="tw-play-btn" style="width:200px;">Return to Hub</button>
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
            if (btn.dataset.tab === 'tw-hub-stats') _renderStats();
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

    // Wire Battle Controls
    _screens.game.querySelectorAll('.tw-target-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _screens.game.querySelectorAll('.tw-target-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _run.targetMode = btn.dataset.target;
            if (_engine) _engine.setTargetMode(_run.targetMode);
        });
    });
    
    // Wire Speed Button
    _screens.game.querySelector('#tw-btn-speed').addEventListener('click', () => {
        const steps = [1, 2, 3, 5];
        const idx = steps.indexOf(_speedMult);
        _speedMult = steps[(idx + 1) % steps.length];
        _screens.game.querySelector('#tw-btn-speed').textContent = `⚡ ${_speedMult}x`;
        if (_engine) _engine.speedMult = _speedMult;
    });

    ['barrage', 'nova', 'aegis'].forEach(abil => {
        _screens.game.querySelector(`#tw-abil-${abil}`).addEventListener('click', () => {
            if (_run.abilityCharge >= 100) {
                _run.abilityCharge = 0;
                _updateAbilitiesUI();
                if (_engine) _engine.activateAbility(abil);
            }
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
        // Null-safe check: _save might not be loaded yet during init
        nextBtn.disabled = selectedDiff >= (_save ? _save.maxDiff : 1);
        _run.diff = selectedDiff;
    };
    prevBtn.onclick = () => { selectedDiff--; updateDiffUI(); };
    nextBtn.onclick = () => { selectedDiff++; updateDiffUI(); };

    // Set up engine
    _engine = new TowerEngine(_screens.game.querySelector('#tw-canvas'), {
        onHpUpdate: () => _updateRunHUD(),
        onEnemyKill: (cash, x, y) => {
            _run.cash += cash;
            
            // Random chance for an enemy to drop a coin (scales with lab research)
            if (Math.random() < 0.03 + ((_save.lab.levels.coinYield || 0) * 0.01)) {
                _run.earnedCoins += 1;
                _engine.spawnFloatText('+1 🪙', '#f1c40f', false, x, y - 20);
            }
            
            _updateRunHUD();
            _renderRunUpgrades();
        },
        onWaveComplete: () => {
            // Apply cash / wave here
            let waveCash = _engine.stats.cashWave || 0;
            if (waveCash > 0) {
                _run.cash += waveCash;
                _engine.spawnFloatText(`+$${Math.floor(waveCash)}`, '#2ecc71', true);
            }

            // Apply coins / wave here
            let waveBaseCoins = (_run.wave * _run.diff);
            let waveCoins = Math.floor(waveBaseCoins + (_engine.stats.coinsWave || 0));
            waveCoins = Math.floor(waveCoins * (_engine.stats.coinBonus || 1));
            waveCoins = Math.floor(waveCoins * (1 + (_save.lab.levels.coinYield || 0) * 0.1));
            
            _run.earnedCoins += waveCoins;
            
            _run.wave++;
            if (_save && _save.lab.levels.startingCash >= 5) {
                _run.cash = Math.floor(_run.cash * 1.02);
            }
            _checkUnlock();
            _startNextWave();
        },
        onPlayerDie: () => _handleDeath(),
        hasRelic: (id) => _save && _save.relics.includes(id)
    });

    // Start Lab ticker
    setInterval(_labTicker, 1000);
    
    // Expose updateDiffUI so it can be called cleanly once launch() runs
    init._updateDiffUI = updateDiffUI;
}

export function launch() {
    _save = JSON.parse(localStorage.getItem(SAVE_KEY)) || _defaultSave();
    
    // Patch old saves
    if (!_save.workshop.unlocks) _save.workshop.unlocks = {};
    if (_save.lab.levels.startingCash === undefined) _save.lab.levels.startingCash = 0;
    if (_save.lab.levels.vocabMastery === undefined) _save.lab.levels.vocabMastery = 0;
    if (_save.lab.levels.synergy === undefined) _save.lab.levels.synergy = 0;
    if (!_save.stats) _save.stats = { totalCorrect: 0, sessionCorrect: 0, highestStreak: 0, wordsMastered: [] };
    if (!_save.relics) _save.relics = [];
    if (!_save.workshop.offense) _save = _defaultSave();
    
    // Patch new utility upgrades
    if (_save.workshop.utility) {
        if (_save.workshop.utility.freeUpg !== undefined) {
            _save.workshop.utility.freeUpgOffense = _save.workshop.utility.freeUpg;
            _save.workshop.utility.freeUpgDefense = _save.workshop.utility.freeUpg;
            _save.workshop.utility.freeUpgUtility = _save.workshop.utility.freeUpg;
            delete _save.workshop.utility.freeUpg;
        }
        if (_save.workshop.utility.cashWave === undefined) _save.workshop.utility.cashWave = 0;
        if (_save.workshop.utility.coinBonus === undefined) _save.workshop.utility.coinBonus = 0;
        if (_save.workshop.utility.coinsWave === undefined) _save.workshop.utility.coinsWave = 0;
        if (_save.workshop.utility.cashBonus === undefined) _save.workshop.utility.cashBonus = 0;
        if (_save.workshop.utility.freeUpgOffense === undefined) _save.workshop.utility.freeUpgOffense = 0;
        if (_save.workshop.utility.freeUpgDefense === undefined) _save.workshop.utility.freeUpgDefense = 0;
        if (_save.workshop.utility.freeUpgUtility === undefined) _save.workshop.utility.freeUpgUtility = 0;
    }

    _save.stats.sessionCorrect = 0; // Reset session stats

    // Force Dark Mode for the VocabManager UI within this game
    setGvmTheme('dark');

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
    
    // Refresh UI numbers now that _save is definitively loaded
    if (typeof init._updateDiffUI === 'function') init._updateDiffUI();

    _renderWorkshop();
    _renderLab();
    _renderStats();
    
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

// ─── WORKSHOP, LAB & STATS ───────────────────────────────────────────────────

function _renderWorkshop() {
    const list = _screens.setup.querySelector('#tw-ws-list');
    list.innerHTML = '';
    
    for (const cat of ['offense', 'defense', 'utility']) {
        const catDiv = document.createElement('div');
        catDiv.innerHTML = `<div class="tw-upg-cat-title">${cat}</div>`;
        
        for (const id in UPGRADES[cat]) {
            const def = UPGRADES[cat][id];
            const lvl = _save.workshop[cat][id] || 0;
            const isLocked = def.reqUnlock && !_save.workshop.unlocks[id];
            
            const row = document.createElement('div');
            row.className = 'tw-upg-row';
            
            if (isLocked) {
                row.innerHTML = `
                    <div class="tw-upg-info">
                        <div class="tw-upg-name" style="color:#777;">🔒 ${def.name}</div>
                        <div class="tw-upg-val">Requires Unlock</div>
                    </div>
                    <button class="tw-upg-buy" ${(_save.coins < def.unlockCost) ? 'disabled' : ''}>
                        🪙 ${def.unlockCost}
                    </button>
                `;
                row.querySelector('button').onclick = () => {
                    if (_save.coins >= def.unlockCost) {
                        _save.coins -= def.unlockCost;
                        _save.workshop.unlocks[id] = true;
                        _saveGame();
                        _showHub(); // Re-render logic
                    }
                };
            } else {
                if (def.max !== undefined && lvl >= def.max) continue; // Optional: hide maxed
                
                const cost = calcCost(cat, id, lvl, true);
                const val = calcStat(cat, id, lvl, 0);
                
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
                        _save.workshop[cat][id] = lvl + 1;
                        _saveGame();
                        _showHub();
                    }
                };
            }
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

function _renderStats() {
    const statsContent = _screens.setup.querySelector('#tw-stats-content');
    const relicsContent = _screens.setup.querySelector('#tw-relics-content');
    
    statsContent.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
            <div class="tw-upg-row"><div class="tw-upg-name">Session Correct</div><div class="tw-upg-val">${_save.stats.sessionCorrect}</div></div>
            <div class="tw-upg-row"><div class="tw-upg-name">Total Correct</div><div class="tw-upg-val">${_save.stats.totalCorrect}</div></div>
            <div class="tw-upg-row"><div class="tw-upg-name">Highest Streak</div><div class="tw-upg-val">${_save.stats.highestStreak}</div></div>
            <div class="tw-upg-row"><div class="tw-upg-name">Words Mastered</div><div class="tw-upg-val">${_save.stats.wordsMastered.length}</div></div>
            <div class="tw-upg-row"><div class="tw-upg-name">Highest Wave</div><div class="tw-upg-val">${_save.highestWave}</div></div>
            <div class="tw-upg-row"><div class="tw-upg-name">Max Tier</div><div class="tw-upg-val">${_save.maxDiff}</div></div>
        </div>
    `;
    
    relicsContent.innerHTML = `<h3 style="color:#f1c40f; margin-bottom:10px;">Relics</h3><div style="display:flex; flex-direction:column; gap:8px;">`;
    if (_save.relics.length === 0) {
        relicsContent.innerHTML += `<div style="color:#777; font-size:12px;">No relics unlocked. Beat target waves to earn them!</div>`;
    } else {
        for (const tier of _save.relics) {
            const rel = RELICS[tier];
            if (rel) {
                relicsContent.innerHTML += `
                    <div class="tw-upg-row" style="border-color:#f1c40f;">
                        <div class="tw-upg-info">
                            <div class="tw-upg-name" style="color:#f1c40f;">${rel.name} <span style="font-size:10px;color:#aaa;">Tier ${tier}</span></div>
                            <div style="font-size:11px; color:#bbb;">${rel.desc}</div>
                        </div>
                    </div>
                `;
            }
        }
    }
    relicsContent.innerHTML += `</div>`;
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
    let kMult = 0.01 + (_save.lab.levels.knowledge * 0.005);
    if (_save.relics.includes(5)) kMult *= 2; // Master Crown
    const kBuff = 1 + (_run.knowledgeStacks * kMult);
    
    const masteryBuff = 1 + (_save.stats.wordsMastered.length * 0.0001); // +0.01% per word
    
    let stats = {};
    for (const cat of ['offense', 'defense', 'utility']) {
        for (const id in UPGRADES[cat]) {
            let val = calcStat(cat, id, _save.workshop[cat][id] || 0, _run.levels[cat][id] || 0);
            
            // Core stat buffs (now including cashWave, coinsWave, and coinBonus)
            if (['damage', 'health', 'regen', 'cashBonus', 'cashWave', 'coinBonus', 'coinsWave', 'atkSpeed'].includes(id)) {
                val *= kBuff;
            }
            if (id === 'damage') {
                val *= masteryBuff;
            }
            if (id === 'atkSpeed' && _save.relics.includes(4)) {
                val *= 1.2; // Expert Crest
            }
            stats[id] = val;
        }
    }
    
    stats.currentHp = _engine.stats ? (_engine.stats.currentHp || stats.health) : stats.health;
    if (_engine.stats && stats.health > _engine.stats.health) {
        stats.currentHp += (stats.health - _engine.stats.health);
    }
    stats.gameSpeed = 1 + (_save.lab.levels.gameSpeed * 0.1);
    stats.kBuff = kBuff;
    
    stats.synergyPierce = _save.lab.levels.synergy > 0 && kBuff >= 2.0;
    stats.synergyChain = _save.lab.levels.synergy > 0 && kBuff >= 3.0;
    
    return stats;
}

function _startRun() {
    _run.wave = 1;
    _run.cash = 50 + (50 * _save.lab.levels.startingCash);
    _run.earnedCoins = 0;
    _run.knowledgeStacks = 0;
    _run.combo = 0;
    _run.abilityCharge = 0;
    _run.vocabQuestions = 0;
    _run.vocabCorrect = 0;
    
    for (const cat of ['offense', 'defense', 'utility']) {
        for (const id in UPGRADES[cat]) {
            _run.levels[cat][id] = 0;
        }
    }
    
    _screens.setup.style.display = 'none';
    _screens.game.style.display = 'flex';
    _engine._resize();
    _engine.speedMult = _speedMult;

    _vocabMgr.seedInitialWords(5);
    
    _engine.startRun(_getTowerStats(), _run.wave, _run.diff);
    _engine.setTargetMode(_run.targetMode);
    
    _updateRunHUD();
    _updateAbilitiesUI();
    _renderRunUpgrades();
    
    _startNextWave();
}

function _startNextWave() {
    if (_run.wave === 1 && _save.relics.includes(2)) { // Scholar Badge
        _run.knowledgeStacks++;
        _run.wave = 2;
        _engine.spawnFloatText('+1 Knowledge (Relic)!', '#2ecc71', true);
    }

    _updateRunHUD();
    
    _engine.pause();
    _vocabMgr.pause();
    
    const uiLayer = _screens.game.querySelector('#tw-ui-layer');
    
    showGameQuiz(_vocabMgr, {
        container: uiLayer,
        title: `Wave ${_run.wave} Approaching`,
        subtitle: 'Correct answer grants +1 Knowledge Stack!',
        onAnswer: (isCorrect, wordObj) => {
            _run.vocabQuestions++;
            if (isCorrect) {
                _run.combo++;
                _run.vocabCorrect++;
                _save.stats.totalCorrect++;
                _save.stats.sessionCorrect++;
                if (_run.combo > _save.stats.highestStreak) _save.stats.highestStreak = _run.combo;
                
                if (_save.lab.levels.vocabMastery > 0 && wordObj && !_save.stats.wordsMastered.includes(wordObj.kanji)) {
                    _save.stats.wordsMastered.push(wordObj.kanji);
                }
                
                let chargeAmt = 20;
                if (_save.relics.includes(3)) chargeAmt = 30; // Adept Token
                _run.abilityCharge = Math.min(100, _run.abilityCharge + chargeAmt);
                _updateAbilitiesUI();

                let comboMult = 1;
                if (_run.combo >= 10) comboMult = 3;
                else if (_run.combo >= 5) comboMult = 2;
                else if (_run.combo >= 3) comboMult = 1.5;

                const gain = 1 * comboMult;
                _run.knowledgeStacks += gain;
                _engine.spawnFloatText(`+${gain} Knowledge!`, '#2ecc71', true);
            } else {
                _run.combo = 0;
                _engine.spawnFloatText('Missed Buff...', '#e74c3c', true);
            }
            
            _engine.stats = _getTowerStats();
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
    
    if (_run.wave > target) {
        if (!_save.relics.includes(_run.diff)) {
            _save.relics.push(_run.diff);
            _engine.spawnFloatText('RELIC UNLOCKED!', '#f1c40f', true);
        }
        if (_run.diff >= _save.maxDiff) {
            _save.maxDiff = _run.diff + 1;
            _engine.spawnFloatText('TIER UNLOCKED!', '#00ffff', true);
        }
        _saveGame();
    }
}

function _handleDeath() {
    const totalCoins = _run.earnedCoins;
    _save.coins += totalCoins;
    
    if (_vocabMgr && !_vocabMgr.isGlobalSrs) {
        _vocabMgr.exportToAppSrs(null, 'skip');
    }
    _saveGame();
    
    const acc = _run.vocabQuestions > 0 ? Math.round((_run.vocabCorrect / _run.vocabQuestions) * 100) : 0;
    
    const deathScreen = _screens.game.querySelector('#tw-death-screen');
    const deathStats = deathScreen.querySelector('#tw-death-stats');
    
    deathStats.innerHTML = `
        <div style="font-size:24px; color:#00ffff; font-weight:bold; margin-bottom:10px;">Reached Wave ${_run.wave}</div>
        <div style="font-weight:bold; color:#f1c40f; margin-top:8px;">Earned Coins: 🪙 ${totalCoins}</div>
        <div style="margin-top:15px; font-size:14px; color:#aaa; border-top:1px solid #333; padding-top:10px;">
            Knowledge Stacks: ${_run.knowledgeStacks}<br>
            Vocab Accuracy: ${acc}%
        </div>
    `;
    
    deathScreen.style.display = 'flex';
    
    const returnBtn = deathScreen.querySelector('#tw-death-return');
    returnBtn.onclick = () => {
        deathScreen.style.display = 'none';
        _showHub();
    };
}

function _updateRunHUD() {
    _screens.game.querySelector('#tw-run-wave').textContent = _run.wave;
    _screens.game.querySelector('#tw-run-cash-val').textContent = Math.floor(_run.cash);
    _screens.game.querySelector('#tw-run-earned-coins').textContent = _run.earnedCoins;
    
    let kMult = 0.01 + (_save.lab.levels.knowledge * 0.005);
    if (_save.relics.includes(5)) kMult *= 2;
    const kBuff = 1 + (_run.knowledgeStacks * kMult);
    _screens.game.querySelector('#tw-run-know').textContent = kBuff.toFixed(2);
    
    const comboEl = _screens.game.querySelector('#tw-run-combo');
    if (_run.combo >= 3) {
        let text = ' x1.5';
        if (_run.combo >= 10) text = ' x3.0';
        else if (_run.combo >= 5) text = ' x2.0';
        comboEl.textContent = text;
    } else {
        comboEl.textContent = '';
    }
    
    const hpBar = _screens.game.querySelector('#tw-run-hp-bar');
    if (_engine && _engine.stats) {
        const pct = Math.max(0, _engine.stats.currentHp / _engine.stats.health) * 100;
        hpBar.style.width = `${pct}%`;
    }
}

function _updateAbilitiesUI() {
    const bar = _screens.game.querySelector('#tw-abil-bar');
    if (bar) bar.style.width = `${_run.abilityCharge}%`;
    
    const isReady = _run.abilityCharge >= 100;
    ['barrage', 'nova', 'aegis'].forEach(abil => {
        const btn = _screens.game.querySelector(`#tw-abil-${abil}`);
        if (btn) {
            btn.disabled = !isReady;
            if (isReady) btn.classList.add('ready');
            else btn.classList.remove('ready');
        }
    });
}

function _renderRunUpgrades() {
    for (const cat of ['offense', 'defense', 'utility']) {
        const container = _screens.game.querySelector(`#tw-run-${cat}`);
        container.innerHTML = '';
        
        for (const id in UPGRADES[cat]) {
            const def = UPGRADES[cat][id];
            
            // Do not show the upgrade if it's locked in the workshop
            if (def.reqUnlock && !_save.workshop.unlocks[id]) continue;

            const runLvl = _run.levels[cat][id] || 0;
            const wsLvl = _save.workshop[cat][id] || 0;

            if (def.max !== undefined) {
                const totalVal = calcStat(cat, id, wsLvl, runLvl);
                if (totalVal >= def.max) continue; // Hide if visually maxed
            }
            
            const cost = calcCost(cat, id, runLvl, false);
            const val = calcStat(cat, id, wsLvl, runLvl);
            
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
            
            let freeChance = 0;
            if (cat === 'offense') freeChance = _engine.stats.freeUpgOffense || 0;
            else if (cat === 'defense') freeChance = _engine.stats.freeUpgDefense || 0;
            else if (cat === 'utility') freeChance = _engine.stats.freeUpgUtility || 0;

            row.querySelector('button').onclick = () => {
                if (_run.cash >= cost) {
                    let isFree = Math.random() < freeChance;
                    if (!isFree) {
                        _run.cash -= cost;
                    } else {
                        _engine.spawnFloatText('FREE!', '#f1c40f', true);
                    }
                    _run.levels[cat][id] = runLvl + 1;
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