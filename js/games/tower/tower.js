// main/js/games/tower/tower.js

import { mountVocabSelector } from '../../vocab_selector.js';
import { GameVocabManager } from '../../game_vocab_mgr.js';
import { showGameQuiz, poolSourceLabel, renderVocabSettings, setGvmTheme } from '../../game_vocab_mgr_ui.js';
import { UPGRADES, LAB_RESEARCH, RELICS, QUEST_TEMPLATES, CARDS, SLOT_COSTS, getCardLevelInfo, calcStat, calcCost, calcLabCost, calcLabTimeMs } from './tower_data.js';
import { TowerEngine } from './tower_engine.js';

let _screens = null;
let _onExit = null;
let _vocabMgr = null;
let _engine = null;

const SAVE_KEY = 'polyglot_tower_save';
let _save = null;
let _speedMult = 1;

let _run = {
    wave: 1,
    diff: 1,
    cash: 0,
    earnedCoinsDrops: 0,
    earnedCoinsInterest: 0,
    knowledgeStacks: 0,
    combo: 0,
    abilityCharge: 0,
    targetMode: 'closest',
    vocabQuestions: 0,
    vocabCorrect: 0,
    failedWords: {},
    boughtDefense: false,
    levels: { offense: {}, defense: {}, utility: {} }
};

function _defaultSave() {
    return {
        coins: 0,
        gems: 0,
        highestWave: 0,
        maxDiff: 1,
        workshop: {
            unlocks: {},
            offense: { damage:0, atkSpeed:0, range:0, critChance:0, critMult:0, dmgMeter:0, bounce:0 },
            defense: { health:0, regen:0, defAbs:0, defPct:0, lifesteal:0, thorns:0, knockback:0, defyDeath:0 },
            utility: { cashBonus:0, cashWave:0, coinBonus:0, coinsWave:0, interest:0, freeUpgOffense:0, freeUpgDefense:0, freeUpgUtility:0 }
        },
        lab: {
            active: null,
            levels: { knowledge:0, gameSpeed:0, coinYield:0, startingCash:0, vocabMastery:0, synergy:0 }
        },
        cards: { owned: {}, equipped: [null], unlockedSlots: 1 },
        vocabConfig: GameVocabManager.defaultConfig(),
        stats: { totalCorrect: 0, sessionCorrect: 0, highestStreak: 0, wordsMastered:[] },
        relics:[],
        login: { lastDate: null, streakDays: 0 },
        quests: { date: null, active:[] }
    };
}

export function init(screens, onExit) {
    _screens = screens;
    _onExit = onExit;
    _injectCSS();
    
    _screens.setup.innerHTML = `
        <div class="tw-root">
            <div class="tw-header">
                <h2 class="tw-header-title">Polyglot Tower</h2>
                <div class="tw-header-currencies">
                    <div class="tw-coins">🪙 <span id="tw-hub-coins">0</span></div>
                    <div class="tw-gems">💎 <span id="tw-hub-gems">0</span></div>
                </div>
            </div>
            <div class="tw-tab-bar">
                <button class="tw-tab-btn active" data-tab="tw-hub-play">Play</button>
                <button class="tw-tab-btn" data-tab="tw-hub-workshop">Workshop</button>
                <button class="tw-tab-btn" data-tab="tw-hub-lab">Lab</button>
                <button class="tw-tab-btn" data-tab="tw-hub-cards">Cards</button>
                <button class="tw-tab-btn" data-tab="tw-hub-quests">Quests</button>
                <button class="tw-tab-btn" data-tab="tw-hub-stats">Stats</button>
                <button class="tw-tab-btn" data-tab="tw-hub-vocab">Vocab</button>
            </div>
            
            <div class="tw-screen active tw-scroll-content" id="tw-hub-play">
                <div class="tw-tower-visual">
                    <div class="tw-tower-crystal">🔮</div>
                    <div class="tw-tower-body"><div class="tw-tower-window"></div><div class="tw-tower-window"></div></div>
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
            
            <div class="tw-screen tw-scroll-content" id="tw-hub-workshop">
                <p style="font-size:12px; color:#888; text-align:center;">Permanent upgrades bought with Coins.</p>
                <div id="tw-ws-list"></div>
            </div>
            
            <div class="tw-screen tw-scroll-content" id="tw-hub-lab">
                <div id="tw-lab-active" style="display:none; background:rgba(46,204,113,0.1); border:1px solid #2ecc71; border-radius:8px; padding:12px; margin-bottom:15px; text-align:center;">
                    <div style="font-size:12px; color:#2ecc71; font-weight:bold; margin-bottom:4px;">Researching: <span id="tw-lab-active-name"></span></div>
                    <div style="font-family:monospace; font-size:16px; color:#fff;" id="tw-lab-countdown">00:00:00</div>
                </div>
                <div id="tw-lab-list"></div>
            </div>

            <div class="tw-screen tw-scroll-content" id="tw-hub-cards">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h3 style="color:#00ffff; margin:0;">Equipped Cards</h3>
                    <button id="tw-buy-card-btn" style="background:#e74c3c; color:#fff; border:none; padding:8px 12px; border-radius:6px; font-weight:bold; cursor:pointer;">Buy Card (20 💎)</button>
                </div>
                <div id="tw-cards-slots" style="display:flex; gap:10px; margin-bottom:20px; overflow-x:auto; padding-bottom:5px;"></div>
                <button id="tw-unlock-slot-btn" style="width:100%; margin-bottom:20px; padding:10px; background:transparent; border:1px dashed #f1c40f; color:#f1c40f; border-radius:8px; font-weight:bold; cursor:pointer; display:none;"></button>
                <h3 style="color:#aaa; font-size:12px; margin-bottom:5px; text-transform:uppercase;">Inventory</h3>
                <div id="tw-cards-inv" class="tw-card-grid"></div>
            </div>

            <div class="tw-screen tw-scroll-content" id="tw-hub-quests">
                <h3 style="color:#e74c3c; margin-top:0;">Daily Quests</h3>
                <p style="font-size:12px; color:#aaa;">Complete missions for Gems and Coins. Resets daily.</p>
                <div id="tw-quests-list"></div>
            </div>

            <div class="tw-screen tw-scroll-content" id="tw-hub-stats">
                <h3 style="color:#00ffff; margin-top:0;">Session & Lifetime Stats</h3>
                <div id="tw-stats-content"></div>
                <div id="tw-relics-content" style="margin-top:20px;"></div>
            </div>
            
            <div class="tw-screen tw-scroll-content" id="tw-hub-vocab">
                <div id="tw-vocab-settings-mount"></div>
                <button id="tw-change-deck-btn" style="width:100%; margin-top:20px; padding:12px; border:1px solid #00ffff; background:rgba(0,255,255,0.05); color:#00ffff; border-radius:8px; font-weight:bold; cursor:pointer;">Change Vocabulary Deck</button>
            </div>
        </div>

        <div id="tw-daily-popup" class="tw-modal" style="display:none; position:absolute; inset:0; z-index:1000;">
            <div style="background:#1a1a2e; padding:30px; border-radius:12px; text-align:center; border:2px solid #f1c40f; max-width:80%;">
                <h2 style="color:#f1c40f; margin-top:0;">Daily Login Bonus!</h2>
                <div style="font-size:14px; color:#fff; margin-bottom:15px;">Day <span id="tw-login-day" style="font-weight:bold;color:#00ffff;"></span></div>
                <div id="tw-login-reward" style="font-size:24px; font-family:monospace; margin-bottom:20px;"></div>
                <button id="tw-login-claim" class="tw-play-btn">Claim</button>
            </div>
        </div>
    `;
    
    _screens.game.innerHTML = `
        <div class="tw-root">
            <div class="tw-header tw-battle-header" style="flex-direction:column; align-items:stretch; padding: 8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <div class="tw-wave-text">Wave <span id="tw-run-wave">1</span></div>
                    <div style="display:flex; gap:10px; font-family:monospace; font-weight:bold;">
                        <div class="tw-run-cash" style="color:#2ecc71;">$ <span id="tw-run-cash-val">0</span></div>
                        <div class="tw-coins" style="color:#f1c40f;">🪙 <span id="tw-run-coins-val">0</span></div>
                        <div class="tw-gems" style="color:#e74c3c;">💎 <span id="tw-run-gems-val">0</span></div>
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <div style="font-size:12px; font-weight:bold; color:#9b59b6;">🧠 ×<span id="tw-run-know">1.00</span><span id="tw-run-combo" class="tw-combo-text"></span></div>
                    <button class="tw-speed-btn" id="tw-btn-speed" style="margin-left:0;">⚡ 1x</button>
                </div>
                <div class="tw-targeting">
                    <button class="tw-target-btn active" data-target="closest">Closest</button>
                    <button class="tw-target-btn" data-target="farthest">Farthest</button>
                    <button class="tw-target-btn" data-target="boss">Boss</button>
                    <button class="tw-target-btn" data-target="fast">Fast</button>
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

            <div id="tw-death-screen" class="tw-screen tw-modal" style="display:none; position:absolute; inset:0; z-index:1000; padding:20px;">
                <h1 style="color:#e74c3c; margin-bottom:5px;">Tower Destroyed</h1>
                <div style="font-size:18px; color:#00ffff; margin-bottom:15px;">Reached Wave <span id="tw-ds-wave"></span></div>
                
                <div class="tw-death-grid">
                    <div class="tw-death-grid-item">Damage Dealt<div class="tw-death-val" id="tw-ds-dmg" style="color:#2ecc71;">0</div></div>
                    <div class="tw-death-grid-item">Vocab Accuracy<div class="tw-death-val" id="tw-ds-acc" style="color:#3498db;">0%</div></div>
                    <div class="tw-death-grid-item">Boss Dmg Taken<div class="tw-death-val" id="tw-ds-bossdmg" style="color:#e74c3c;">0</div></div>
                    <div class="tw-death-grid-item">Mob Dmg Taken<div class="tw-death-val" id="tw-ds-mobdmg" style="color:#e67e22;">0</div></div>
                    <div class="tw-death-grid-item">Coins (Drops)<div class="tw-death-val" id="tw-ds-cdrops" style="color:#f1c40f;">0</div></div>
                    <div class="tw-death-grid-item">Coins (Interest)<div class="tw-death-val" id="tw-ds-cint" style="color:#f1c40f;">0</div></div>
                </div>

                <div style="width:100%; max-width:400px; margin-bottom:20px; background:rgba(0,0,0,0.5); padding:10px; border-radius:8px;">
                    <h4 style="color:#aaa; margin:0 0 10px 0; text-align:center;">Words to Review</h4>
                    <div id="tw-ds-words" style="display:flex; flex-direction:column; gap:5px; font-size:13px; color:#fff;"></div>
                </div>

                <button id="tw-death-return" class="tw-play-btn" style="width:200px;">Return to Hub</button>
            </div>
        </div>
    `;

    _screens.setup.querySelectorAll('.tw-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _screens.setup.querySelectorAll('.tw-tab-btn').forEach(b => b.classList.remove('active'));
            _screens.setup.querySelectorAll('.tw-screen').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            _screens.setup.querySelector(`#${btn.dataset.tab}`).classList.add('active');
            if (btn.dataset.tab === 'tw-hub-stats') _renderStats();
            if (btn.dataset.tab === 'tw-hub-quests') _renderQuests();
            if (btn.dataset.tab === 'tw-hub-cards') _renderCards();
        });
    });

    _screens.game.querySelectorAll('.tw-subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _screens.game.querySelectorAll('.tw-subtab-btn').forEach(b => b.classList.remove('active'));
            _screens.game.querySelectorAll('.tw-subtab-content').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            _screens.game.querySelector(`#${btn.dataset.subtab}`).classList.add('active');
        });
    });

    _screens.game.querySelectorAll('.tw-target-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _screens.game.querySelectorAll('.tw-target-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _run.targetMode = btn.dataset.target;
            if (_engine) _engine.setTargetMode(_run.targetMode);
        });
    });
    
    _screens.game.querySelector('#tw-btn-speed').addEventListener('click', () => {
        const steps =[1, 2, 3, 5];
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

    let selectedDiff = 1;
    const diffVal = _screens.setup.querySelector('#tw-diff-val');
    const targetVal = _screens.setup.querySelector('#tw-target-val');
    const prevBtn = _screens.setup.querySelector('#tw-diff-prev');
    const nextBtn = _screens.setup.querySelector('#tw-diff-next');

    const updateDiffUI = () => {
        diffVal.textContent = selectedDiff;
        targetVal.textContent = Math.round(26 * Math.log(selectedDiff) + 10);
        prevBtn.disabled = selectedDiff <= 1;
        nextBtn.disabled = selectedDiff >= (_save ? _save.maxDiff : 1);
        _run.diff = selectedDiff;
    };
    prevBtn.onclick = () => { selectedDiff--; updateDiffUI(); };
    nextBtn.onclick = () => { selectedDiff++; updateDiffUI(); };

    _engine = new TowerEngine(_screens.game.querySelector('#tw-canvas'), {
        onHpUpdate: () => _updateRunHUD(),
        onEnemyKill: (cash, x, y, type) => {
            _run.cash += cash;
            
            let coinDrop = 0;
            if (type === 'boss') {
                coinDrop = 5 * _run.diff;
                _updateQuest('kill_bosses', 1);
            } else {
                let chance = 0.02;
                if (['fast','tank','ranged','healer','shielded','spawner'].includes(type)) chance = 0.05;
                if (Math.random() < chance) coinDrop = 1;
            }
            if (type === 'spawner') {
                _updateQuest('kill_spawners', 1);
            }
            
            if (coinDrop > 0) {
                let finalDrop = Math.floor(coinDrop * (_engine.stats.coinBonus || 1) * (1 + (_save.lab.levels.coinYield || 0) * 0.1));
                if (finalDrop < 1) finalDrop = 1;
                _run.earnedCoinsDrops += finalDrop;
                _engine.spawnFloatText(`+${finalDrop} 🪙`, '#f1c40f', false, x, y - 20);
            }
            
            _updateRunHUD();
            _renderRunUpgrades();
        },
        onWaveComplete: () => {
            let waveCash = _engine.stats.cashWave || 0;
            let interest = Math.floor(_run.cash * (_engine.stats.interest || 0));
            if (waveCash + interest > 0) {
                _run.cash += waveCash + interest;
                _engine.spawnFloatText(`+$${Math.floor(waveCash + interest)}`, '#2ecc71', true);
            }

            let waveBaseCoins = (_run.wave * _run.diff);
            let waveCoins = Math.floor(waveBaseCoins + (_engine.stats.coinsWave || 0));
            waveCoins = Math.floor(waveCoins * (_engine.stats.coinBonus || 1));
            waveCoins = Math.floor(waveCoins * (1 + (_save.lab.levels.coinYield || 0) * 0.1));
            
            _run.earnedCoinsInterest += waveCoins;
            
            if (!_run.boughtDefense) {
                _updateQuest('reach_wave_no_def', _run.wave);
            }

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

    setInterval(_labTicker, 1000);
    init._updateDiffUI = updateDiffUI;
}

export function launch() {
    _save = JSON.parse(localStorage.getItem(SAVE_KEY)) || _defaultSave();
    
    if (!_save.gems) _save.gems = 0;
    if (!_save.login) _save.login = { lastDate: null, streakDays: 0 };
    if (!_save.quests) _save.quests = { date: null, active:[] };
    if (!_save.cards) _save.cards = { owned: {}, equipped: [null], unlockedSlots: 1 };
    
    if (!_save.workshop.unlocks) _save.workshop.unlocks = {};
    if (_save.lab.levels.startingCash === undefined) _save.lab.levels.startingCash = 0;
    if (_save.lab.levels.vocabMastery === undefined) _save.lab.levels.vocabMastery = 0;
    if (_save.lab.levels.synergy === undefined) _save.lab.levels.synergy = 0;
    if (!_save.stats) _save.stats = { totalCorrect: 0, sessionCorrect: 0, highestStreak: 0, wordsMastered:[] };
    if (!_save.relics) _save.relics =[];
    if (!_save.workshop.offense) _save = _defaultSave();
    
    if (_save.workshop.offense.dmgMeter === undefined) _save.workshop.offense.dmgMeter = 0;
    if (_save.workshop.offense.bounce === undefined) _save.workshop.offense.bounce = 0;
    if (_save.workshop.defense.knockback === undefined) _save.workshop.defense.knockback = 0;
    if (_save.workshop.defense.defyDeath === undefined) _save.workshop.defense.defyDeath = 0;
    
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
        if (_save.workshop.utility.interest === undefined) _save.workshop.utility.interest = 0;
        if (_save.workshop.utility.freeUpgOffense === undefined) _save.workshop.utility.freeUpgOffense = 0;
        if (_save.workshop.utility.freeUpgDefense === undefined) _save.workshop.utility.freeUpgDefense = 0;
        if (_save.workshop.utility.freeUpgUtility === undefined) _save.workshop.utility.freeUpgUtility = 0;
    }

    _save.stats.sessionCorrect = 0;

    setGvmTheme('dark');

    _vocabMgr = new GameVocabManager(_save.vocabConfig);
    const srsPool = GameVocabManager.loadSrsPool();
    
    if (srsPool.length > 0) {
        _vocabMgr.setPool(srsPool, 'tower_banned', { globalSrs: true });
        _checkDailyLogin();
        _generateDailyQuests();
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
    _screens.setup.querySelector('#tw-hub-gems').textContent = Math.floor(_save.gems);
    
    if (typeof init._updateDiffUI === 'function') init._updateDiffUI();

    _renderWorkshop();
    _renderLab();
    _renderStats();
    _renderQuests();
    _renderCards();
    
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

// ─── DAILY LOGIN & QUESTS ───────────────────────────────────────────────────

function _checkDailyLogin() {
    const today = new Date().toDateString();
    if (_save.login.lastDate !== today) {
        _save.login.lastDate = today;
        _save.login.streakDays = (_save.login.streakDays || 0) + 1;
        
        let rewardCoins = 0;
        let rewardGems = 0;

        if (_save.login.streakDays % 28 === 0) rewardGems = 100;
        else if (_save.login.streakDays % 7 === 0) rewardGems = 20;
        else rewardCoins = 50 * ((_save.login.streakDays % 7) || 1);

        const popup = _screens.setup.querySelector('#tw-daily-popup');
        const rwdEl = popup.querySelector('#tw-login-reward');
        popup.querySelector('#tw-login-day').textContent = _save.login.streakDays;
        
        if (rewardGems > 0) {
            rwdEl.innerHTML = `<span style="color:#e74c3c">+${rewardGems} 💎</span>`;
            _save.gems += rewardGems;
        } else {
            rwdEl.innerHTML = `<span style="color:#f1c40f">+${rewardCoins} 🪙</span>`;
            _save.coins += rewardCoins;
        }

        popup.style.display = 'flex';
        popup.querySelector('#tw-login-claim').onclick = () => {
            popup.style.display = 'none';
            _saveGame();
            _showHub();
        };
    }
}

function _generateDailyQuests() {
    const today = new Date().toDateString();
    if (_save.quests.date !== today) {
        _save.quests.date = today;
        const shuffled =[...QUEST_TEMPLATES].sort(() => 0.5 - Math.random());
        _save.quests.active = shuffled.slice(0, 3).map(q => ({
            id: q.id,
            desc: q.desc,
            max: q.max,
            type: q.type || 'add',
            rewardType: q.rewardType,
            rewardAmount: q.rewardAmount,
            progress: 0,
            claimed: false
        }));
        _saveGame();
    }
}

function _updateQuest(id, val) {
    if (!_save || !_save.quests) return;
    for (let q of _save.quests.active) {
        if (q.id === id && !q.claimed) {
            if (q.type === 'highest_wave') q.progress = Math.max(q.progress, val);
            else q.progress += val;
            
            if (q.progress > q.max) q.progress = q.max;
        }
    }
}

function _renderQuests() {
    const list = _screens.setup.querySelector('#tw-quests-list');
    list.innerHTML = '';
    
    if (!_save.quests || !_save.quests.active) return;
    
    for (let q of _save.quests.active) {
        const row = document.createElement('div');
        row.className = 'tw-quest-card';
        
        let pct = Math.min(100, (q.progress / q.max) * 100);
        let icon = q.rewardType === 'gems' ? '💎' : '🪙';
        
        row.innerHTML = `
            <div class="tw-quest-info">
                <div class="tw-quest-title">${q.desc}</div>
                <div style="font-size:11px; color:#aaa;">${q.progress} / ${q.max}</div>
                <div class="tw-quest-prog-wrap"><div class="tw-quest-prog-fill" style="width:${pct}%"></div></div>
            </div>
            <button class="tw-quest-claim" ${q.claimed || q.progress < q.max ? 'disabled' : ''} style="${q.claimed ? 'background:#2ecc71;' : ''}">
                ${q.claimed ? 'Claimed' : `Claim ${q.rewardAmount} ${icon}`}
            </button>
        `;
        
        const btn = row.querySelector('.tw-quest-claim');
        if (!q.claimed && q.progress >= q.max) {
            btn.onclick = () => {
                q.claimed = true;
                if (q.rewardType === 'gems') _save.gems += q.rewardAmount;
                else _save.coins += q.rewardAmount;
                _saveGame();
                _showHub();
            };
        }
        list.appendChild(row);
    }
}

// ─── CARDS & WORKSHOP ───────────────────────────────────────────────────────

function _renderCards() {
    const slotsEl = _screens.setup.querySelector('#tw-cards-slots');
    const invEl = _screens.setup.querySelector('#tw-cards-inv');
    const buyBtn = _screens.setup.querySelector('#tw-buy-card-btn');
    const unlockBtn = _screens.setup.querySelector('#tw-unlock-slot-btn');
    
    slotsEl.innerHTML = '';
    invEl.innerHTML = '';
    
    buyBtn.disabled = _save.gems < 20;
    buyBtn.onclick = () => {
        if (_save.gems >= 20) {
            _save.gems -= 20;
            const keys = Object.keys(CARDS);
            const rId = keys[Math.floor(Math.random() * keys.length)];
            _save.cards.owned[rId] = (_save.cards.owned[rId] || 0) + 1;
            _saveGame();
            _showHub();
        }
    };

    if (_save.cards.unlockedSlots < SLOT_COSTS.length) {
        const cost = SLOT_COSTS[_save.cards.unlockedSlots];
        unlockBtn.style.display = 'block';
        unlockBtn.textContent = `Unlock New Slot (🪙 ${cost.coins} & 💎 ${cost.gems})`;
        unlockBtn.disabled = _save.coins < cost.coins || _save.gems < cost.gems;
        unlockBtn.onclick = () => {
            if (_save.coins >= cost.coins && _save.gems >= cost.gems) {
                _save.coins -= cost.coins;
                _save.gems -= cost.gems;
                _save.cards.unlockedSlots++;
                _save.cards.equipped.push(null);
                _saveGame();
                _showHub();
            }
        };
    } else {
        unlockBtn.style.display = 'none';
    }

    const _makeCardEl = (id, count, isEquipped, slotIdx) => {
        const cDef = CARDS[id];
        const lvlInfo = getCardLevelInfo(count);
        let actualLvl = lvlInfo.level;
        if (cDef.maxLevel && actualLvl > cDef.maxLevel) actualLvl = cDef.maxLevel;
        
        let val = cDef.base + (actualLvl - 1) * cDef.step;
        let desc = cDef.isFlat ? cDef.desc.replace('X', Math.floor(val)) : cDef.desc.replace('%', (val * 100).toFixed(0) + '%');

        const el = document.createElement('div');
        el.className = `tw-card ${isEquipped ? 'equipped' : ''}`;
        el.innerHTML = `
            <div class="tw-card-name">${cDef.name}</div>
            <div class="tw-card-desc">${desc}</div>
            <div class="tw-card-lvl">Lvl ${actualLvl}${actualLvl === cDef.maxLevel ? ' (MAX)' : ''}</div>
            ${actualLvl !== cDef.maxLevel ? `
                <div class="tw-card-prog"><div class="tw-card-prog-fill" style="width:${(lvlInfo.progress/lvlInfo.goal)*100}%"></div></div>
            ` : ''}
        `;
        el.onclick = () => {
            if (isEquipped) {
                _save.cards.equipped[slotIdx] = null;
            } else {
                let firstEmpty = _save.cards.equipped.indexOf(null);
                if (firstEmpty !== -1 && !_save.cards.equipped.includes(id)) {
                    _save.cards.equipped[firstEmpty] = id;
                }
            }
            _saveGame();
            _renderCards();
        };
        return el;
    };

    for (let i = 0; i < _save.cards.unlockedSlots; i++) {
        const id = _save.cards.equipped[i];
        if (id) {
            slotsEl.appendChild(_makeCardEl(id, _save.cards.owned[id], true, i));
        } else {
            const empty = document.createElement('div');
            empty.className = 'tw-card-slot';
            empty.textContent = '+';
            slotsEl.appendChild(empty);
        }
    }

    for (const id in _save.cards.owned) {
        if (!_save.cards.equipped.includes(id)) {
            invEl.appendChild(_makeCardEl(id, _save.cards.owned[id], false, -1));
        }
    }
}

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
                        _showHub(); 
                    }
                };
            } else {
                if (def.max !== undefined && lvl >= def.max) continue; 
                
                const cost = calcCost(cat, id, lvl, true);
                const val = calcStat(cat, id, lvl, 0);
                
                row.innerHTML = `
                    <div class="tw-upg-info">
                        <div class="tw-upg-name">${def.name} <span style="font-size:10px;color:#777;">Lvl ${lvl}</span></div>
                        <div class="tw-upg-val">${def.isPct ? (val*100).toFixed(2)+'%' : val.toFixed(2)}</div>
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

function _getTowerStats() {
    let knowCardBuff = 0;
    if (_save && _save.cards) {
        for (let i = 0; i < _save.cards.unlockedSlots; i++) {
            const cardId = _save.cards.equipped[i];
            if (cardId === 'know') {
                const count = _save.cards.owned[cardId];
                const cDef = CARDS[cardId];
                const lvlInfo = getCardLevelInfo(count);
                let actualLvl = lvlInfo.level;
                if (cDef.maxLevel && actualLvl > cDef.maxLevel) actualLvl = cDef.maxLevel;
                knowCardBuff += cDef.base + (actualLvl - 1) * cDef.step;
            }
        }
    }

    let kMult = 0.01 + (_save.lab.levels.knowledge * 0.005);
    if (_save.relics.includes(5)) kMult *= 2; 
    kMult *= (1 + knowCardBuff);
    
    const kBuff = 1 + (_run.knowledgeStacks * kMult);
    const masteryBuff = 1 + (_save.stats.wordsMastered.length * 0.0001); 
    
    let stats = {};
    for (const cat of ['offense', 'defense', 'utility']) {
        for (const id in UPGRADES[cat]) {
            let val = calcStat(cat, id, _save.workshop[cat][id] || 0, _run.levels[cat][id] || 0);
            
            if (['damage', 'health', 'regen', 'cashBonus', 'cashWave', 'coinBonus', 'coinsWave', 'atkSpeed'].includes(id)) {
                val *= kBuff;
            }
            if (id === 'damage') {
                val *= masteryBuff;
            }
            if (id === 'atkSpeed' && _save.relics.includes(4)) {
                val *= 1.2; 
            }
            stats[id] = val;
        }
    }
    
    // Apply other equipped cards
    stats.enemySpeedMult = 1.0;
    if (_save && _save.cards) {
        for (let i = 0; i < _save.cards.unlockedSlots; i++) {
            const cardId = _save.cards.equipped[i];
            if (cardId) {
                const count = _save.cards.owned[cardId];
                const cDef = CARDS[cardId];
                const lvlInfo = getCardLevelInfo(count);
                let actualLvl = lvlInfo.level;
                if (cDef.maxLevel && actualLvl > cDef.maxLevel) actualLvl = cDef.maxLevel;
                
                const val = cDef.base + (actualLvl - 1) * cDef.step;
                
                if (cardId === 'dmg') stats.damage *= (1 + val);
                if (cardId === 'spd') stats.atkSpeed *= (1 + val);
                if (cardId === 'hp') stats.health *= (1 + val);
                if (cardId === 'rng') stats.range *= (1 + val);
                if (cardId === 'cash') stats.cashBonus *= (1 + val);
                if (cardId === 'coin') stats.coinBonus *= (1 + val);
                if (cardId === 'slow') stats.enemySpeedMult *= (1 - val);

                if (cardId === 'critC') stats.critChance += val;
                if (cardId === 'critM') stats.critMult += val;
                if (cardId === 'bounce') stats.bounce += val;
                if (cardId === 'dmgM') stats.dmgMeter += val;
                if (cardId === 'regen') stats.regen += val;
                if (cardId === 'defA') stats.defAbs += val;
                if (cardId === 'defP') stats.defPct += val;
                if (cardId === 'life') stats.lifesteal += val;
                if (cardId === 'thorns') stats.thorns += val;
                if (cardId === 'kb') stats.knockback += val;
                if (cardId === 'death') stats.defyDeath += val;
                if (cardId === 'cashW') stats.cashWave += val;
                if (cardId === 'coinW') stats.coinsWave += val;
                if (cardId === 'int') stats.interest += val;
                if (cardId === 'freeO') stats.freeUpgOffense += val;
                if (cardId === 'freeD') stats.freeUpgDefense += val;
                if (cardId === 'freeU') stats.freeUpgUtility += val;
            }
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
    _run.earnedCoinsDrops = 0;
    _run.earnedCoinsInterest = 0;
    _run.knowledgeStacks = 0;
    _run.combo = 0;
    _run.abilityCharge = 0;
    _run.vocabQuestions = 0;
    _run.vocabCorrect = 0;
    _run.failedWords = {};
    _run.boughtDefense = false;
    
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
    
    _updateQuest('play_runs', 1);
    
    _startNextWave();
}

function _startNextWave() {
    if (_run.wave === 1 && _save.relics.includes(2)) { 
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
        subtitle: 'Correct answer grants +1 Knowledge Stack & 1 Gem!',
        onAnswer: (isCorrect, wordObj) => {
            _run.vocabQuestions++;
            if (isCorrect) {
                _run.combo++;
                _run.vocabCorrect++;
                _save.stats.totalCorrect++;
                _save.stats.sessionCorrect++;
                _updateQuest('answer_vocab', 1);

                _save.gems += 1; // 1 Gem per correct vocab

                if (_run.combo > _save.stats.highestStreak) _save.stats.highestStreak = _run.combo;
                
                if (_save.lab.levels.vocabMastery > 0 && wordObj && !_save.stats.wordsMastered.includes(wordObj.kanji)) {
                    _save.stats.wordsMastered.push(wordObj.kanji);
                }
                
                let chargeAmt = 20;
                if (_save.relics.includes(3)) chargeAmt = 30; 
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
                if (wordObj) {
                    const label = wordObj.kanji || wordObj.hiragana;
                    _run.failedWords[label] = (_run.failedWords[label] || 0) + 1;
                }
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
    const totalCoins = _run.earnedCoinsDrops + _run.earnedCoinsInterest;
    _save.coins += totalCoins;
    
    if (_vocabMgr && !_vocabMgr.isGlobalSrs) {
        _vocabMgr.exportToAppSrs(null, 'skip');
    }
    _saveGame();
    
    const acc = _run.vocabQuestions > 0 ? Math.round((_run.vocabCorrect / _run.vocabQuestions) * 100) : 0;
    
    const deathScreen = _screens.game.querySelector('#tw-death-screen');
    
    deathScreen.querySelector('#tw-ds-wave').textContent = _run.wave;
    deathScreen.querySelector('#tw-ds-dmg').textContent = Math.floor(_engine.runStats.dmgDealt).toLocaleString();
    deathScreen.querySelector('#tw-ds-acc').textContent = acc + '%';
    deathScreen.querySelector('#tw-ds-bossdmg').textContent = Math.floor(_engine.runStats.dmgTakenBoss).toLocaleString();
    deathScreen.querySelector('#tw-ds-mobdmg').textContent = Math.floor(_engine.runStats.dmgTakenBasic).toLocaleString();
    deathScreen.querySelector('#tw-ds-cdrops').textContent = _run.earnedCoinsDrops;
    deathScreen.querySelector('#tw-ds-cint').textContent = _run.earnedCoinsInterest;

    const wordsDiv = deathScreen.querySelector('#tw-ds-words');
    wordsDiv.innerHTML = '';
    
    let sortedWords = Object.keys(_run.failedWords).sort((a, b) => _run.failedWords[b] - _run.failedWords[a]);
    if (sortedWords.length === 0) {
        wordsDiv.innerHTML = '<div style="color:#2ecc71;">Perfect Vocabulary Run!</div>';
    } else {
        const top3 = sortedWords.slice(0, 3);
        for (let w of top3) {
            wordsDiv.innerHTML += `<div>• ${w} (Missed ${_run.failedWords[w]}x)</div>`;
        }
    }

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
    
    const totalCoins = _save.coins + _run.earnedCoinsDrops + _run.earnedCoinsInterest;
    _screens.game.querySelector('#tw-run-coins-val').textContent = Math.floor(totalCoins);
    _screens.game.querySelector('#tw-run-gems-val').textContent = Math.floor(_save.gems);
    
    let kMult = 0.01 + (_save.lab.levels.knowledge * 0.005);
    if (_save.relics.includes(5)) kMult *= 2;
    // Safe card buff calc just for UI
    let knowCardBuff = 0;
    if (_save && _save.cards) {
        for (let i = 0; i < _save.cards.unlockedSlots; i++) {
            const cardId = _save.cards.equipped[i];
            if (cardId === 'know') {
                const count = _save.cards.owned[cardId];
                const cDef = CARDS[cardId];
                const lvlInfo = getCardLevelInfo(count);
                let actualLvl = lvlInfo.level;
                if (cDef.maxLevel && actualLvl > cDef.maxLevel) actualLvl = cDef.maxLevel;
                knowCardBuff += cDef.base + (actualLvl - 1) * cDef.step;
            }
        }
    }
    kMult *= (1 + knowCardBuff);
    
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
    
    const isReady = _run.abilityCharge >= 100;['barrage', 'nova', 'aegis'].forEach(abil => {
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
            
            if (def.reqUnlock && !_save.workshop.unlocks[id]) continue;

            const runLvl = _run.levels[cat][id] || 0;
            const wsLvl = _save.workshop[cat][id] || 0;

            if (def.max !== undefined) {
                const totalVal = calcStat(cat, id, wsLvl, runLvl);
                if (totalVal >= def.max) continue; 
            }
            
            const cost = calcCost(cat, id, runLvl, false);
            const val = calcStat(cat, id, wsLvl, runLvl);
            
            const row = document.createElement('div');
            row.className = 'tw-upg-row';
            row.innerHTML = `
                <div class="tw-upg-info">
                    <div class="tw-upg-name">${def.name} <span style="font-size:10px;color:#777;">Lvl ${runLvl}</span></div>
                    <div class="tw-upg-val">${def.isPct ? (val*100).toFixed(2)+'%' : val.toFixed(2)}</div>
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
                    
                    if (cat === 'defense') _run.boughtDefense = true;

                    _engine.stats = _getTowerStats();
                    _updateRunHUD();
                    _renderRunUpgrades();
                }
            };
            container.appendChild(row);
        }
    }
}

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