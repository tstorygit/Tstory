import { ChaoStateManager, createNewChi, getChiTrueStat } from './chao_state.js';
import { syncEconomy } from './chao_economy.js';
import { GameVocabManager } from '../../game_vocab_mgr.js';
import { ChaoGarden3D } from './chao_garden_ui.js';
import { MatsuriPageant } from './chao_pageant.js';
import { renderNikkiTab } from './chao_nikki_ui.js';
import { renderMarketTab, MARKET_ITEMS } from './chao_market_ui.js';
import { renderDebugTab } from './chao_debug_ui.js';
import { generateNikkiEntry } from './chao_nikki_mgr.js';
import { ChaoRace3D } from './chao_race.js';
import { ChaoKarate3D } from './chao_karate.js';
import * as srsDb from '../../srs_db.js';

let _screens = null;
let _onExit = null;
let _state = null;
let _vocabMgr = null;
let _garden3D = null;
let _race3D = null;
let _karate3D = null;
let _pageant3D = null;
let _toastTimeout = null;
let _activeViewedChiId = null;

let _statTweenId = null;
let _displayStats = {}; // Stores true stat values for smooth continuous visual tweening

function formatSeishin(val) {
    return Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(val);
}

export function init(screens, onExit) {
    _screens = screens;
    _onExit = onExit;
    _state = new ChaoStateManager();
    _vocabMgr = new GameVocabManager();

    _injectCSS();
    
    _screens.setup.innerHTML = `
        <div class="chao-root">
            <div id="chao-toast" class="chao-toast"></div>
            
            <div class="chao-header">
                <div id="global-chi-selector" class="header-chi-selector"></div>
                <div class="chao-currencies">
                    🌸 <span id="chao-seishin-val" style="display:inline-block; min-width:3ch; text-align:right;">0</span>
                </div>
                <button id="chao-exit-btn" style="background:none; border:none; color:#ff5555; font-size:24px; cursor:pointer; padding:0 5px; margin-left: 5px;">✖</button>
            </div>
            
            <div class="chao-tab-bar">
                <button class="chao-tab-btn active" data-tab="chao-tab-garden">Garden</button>
                <button class="chao-tab-btn" data-tab="chao-tab-market">Market</button>
                <button class="chao-tab-btn" data-tab="chao-tab-compete">Compete</button>
                <button class="chao-tab-btn" data-tab="chao-tab-nikki">Diary</button>
                <button class="chao-tab-btn" data-tab="chao-tab-debug">Debug</button>
            </div>
            
            <div class="chao-screen active" id="chao-tab-garden">
                <div id="cg-render-area">
                    <div id="sa2-stat-window" class="sa2-stat-window"></div>
                </div>
                <div id="feed-menu" class="chao-feed-menu"></div>
            </div>
            
            <div class="chao-screen" id="chao-tab-market"></div>
            
            <div class="chao-screen" id="chao-tab-compete">
                <h3 style="margin-top:0; margin-bottom:10px;">Competitions</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px; flex-shrink: 0;">
                    <button id="btn-start-pageant" class="chao-action-btn" style="margin:0; padding:8px;">🎭 Pageant</button>
                    <button id="btn-start-race" class="chao-action-btn" style="margin:0; padding:8px;">🏁 Race</button>
                    <button id="btn-start-karate" class="chao-action-btn" style="margin:0; padding:8px;">🥋 Karate</button>
                </div>
                <div id="chao-minigame-container" style="flex: 1; min-height: 0; display: flex; flex-direction: column;"></div>
            </div>
            
            <div class="chao-screen" id="chao-tab-nikki"></div>
            <div class="chao-screen" id="chao-tab-debug"></div>
        </div>
    `;

    _screens.setup.querySelectorAll('.chao-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _screens.setup.querySelectorAll('.chao-tab-btn').forEach(b => b.classList.remove('active'));
            _screens.setup.querySelectorAll('.chao-screen').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            
            const targetId = btn.dataset.tab;
            const container = _screens.setup.querySelector(`#${targetId}`);
            container.classList.add('active');
            
            if (targetId !== 'chao-tab-compete') {
                if (_race3D) { _race3D.destroy(); _race3D = null; }
                if (_karate3D) { _karate3D.destroy(); _karate3D = null; }
                if (_pageant3D) { _pageant3D.destroy(); _pageant3D = null; }
                _screens.setup.querySelector('#chao-minigame-container').innerHTML = '';
            }
            
            if (targetId === 'chao-tab-nikki') renderNikkiTab(container, _state);
            else if (targetId === 'chao-tab-market') renderMarketTab(container, _state, showToast, updateUI);
            else if (targetId === 'chao-tab-debug') renderDebugTab(container, _state, showToast, updateUI);
            else updateUI();
        });
    });

    _screens.setup.querySelector('#chao-exit-btn').addEventListener('click', () => {
        if (_garden3D) { _garden3D.destroy(); _garden3D = null; }
        if (_race3D) { _race3D.destroy(); _race3D = null; }
        if (_karate3D) { _karate3D.destroy(); _karate3D = null; }
        if (_pageant3D) { _pageant3D.destroy(); _pageant3D = null; }
        if (_statTweenId) cancelAnimationFrame(_statTweenId);
        _onExit();
    });

    const minigameContainer = _screens.setup.querySelector('#chao-minigame-container');

    _screens.setup.querySelector('#btn-start-pageant').addEventListener('click', () => {
        if (_race3D) { _race3D.destroy(); _race3D = null; }
        if (_karate3D) { _karate3D.destroy(); _karate3D = null; }
        if (_pageant3D) { _pageant3D.destroy(); _pageant3D = null; }
        
        minigameContainer.innerHTML = `
            <div id="pageant-render-area" style="background: #FFB6C1;"></div>
            <div id="pageant-ui-overlay" style="margin-top: 10px; flex-shrink: 0;"></div>
        `;
        
        requestAnimationFrame(() => {
            const renderArea = minigameContainer.querySelector('#pageant-render-area');
            const uiOverlay = minigameContainer.querySelector('#pageant-ui-overlay');
            _pageant3D = new MatsuriPageant(_vocabMgr, _state, renderArea, uiOverlay);
            _pageant3D.startPageant();
        });
    });
    
    _screens.setup.querySelector('#btn-start-race').addEventListener('click', () => {
        if (_karate3D) { _karate3D.destroy(); _karate3D = null; }
        if (_pageant3D) { _pageant3D.destroy(); _pageant3D = null; }
        
        minigameContainer.innerHTML = `
            <div id="race-render-area" style="background: #87CEEB;"></div>
            <div id="race-ui-overlay" style="margin-top: 10px; text-align: center; flex-shrink: 0;">
                <h4 style="color:#f1fa8c; margin:0 0 5px 0;">Race Started!</h4>
                <p style="font-size: 13px; color: #bbb; margin:0;">Chis will use their Run, Fly, Swim, and Power stats to navigate the course!</p>
            </div>
        `;
        
        requestAnimationFrame(() => {
            const renderArea = minigameContainer.querySelector('#race-render-area');
            if (_race3D) _race3D.destroy();
            _race3D = new ChaoRace3D(renderArea, _state, (winner) => {
                const ui = minigameContainer.querySelector('#race-ui-overlay');
                ui.innerHTML = `<h3 style="color:#50fa7b; margin:0;">🏁 ${winner.name} Wins! 🏁</h3>`;
            });
        });
    });

    _screens.setup.querySelector('#btn-start-karate').addEventListener('click', () => {
        if (_race3D) { _race3D.destroy(); _race3D = null; }
        if (_pageant3D) { _pageant3D.destroy(); _pageant3D = null; }
        
        minigameContainer.innerHTML = `
            <div id="karate-render-area" style="background: #282a36;"></div>
            <div id="karate-ui-overlay" style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;">
                <div style="display: flex; gap: 15px;">
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; color: #50fa7b;">
                            <span>${_state.getActiveChi().name}</span> <span id="karate-hp-text-p1"></span>
                        </div>
                        <div class="hp-bar-bg"><div id="karate-hp-fill-p1" class="hp-bar-fill" style="background:#50fa7b; width:100%;"></div></div>
                    </div>
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; color: #ff5555;">
                            <span>Rival</span> <span id="karate-hp-text-p2"></span>
                        </div>
                        <div class="hp-bar-bg"><div id="karate-hp-fill-p2" class="hp-bar-fill" style="background:#ff5555; width:100%;"></div></div>
                    </div>
                </div>
                <div id="karate-log" style="height: 80px; overflow-y: auto; background: #151520; border: 1px solid #444; border-radius: 6px; padding: 8px; font-size: 12px; color: #eee; font-family: monospace;">
                    Waiting to start...
                </div>
                <div id="karate-result" style="text-align: center; font-weight: bold; font-size: 16px;"></div>
            </div>
        `;
        
        requestAnimationFrame(() => {
            const renderArea = minigameContainer.querySelector('#karate-render-area');
            if (_karate3D) _karate3D.destroy();
            _karate3D = new ChaoKarate3D(renderArea, _state, minigameContainer);
        });
    });
}

export function launch() {
    _screens.setup.style.display = 'block';
    _state.data = _state.load();

    const earned = syncEconomy(_state);
    if (earned > 0) {
        showToast(`Earned ${formatSeishin(earned)} Seishin from studying!`);
    }
    
    if (_state.data.chis.length === 0) {
        _state.data.chis.push(createNewChi('Pochi'));
        _state.data.activeChiId = _state.data.chis[0].id;
        _state.save();
    }

    if (!_state.data.chis.find(c => c.name === 'GodChi')) {
        let superChi = createNewChi('GodChi');
        superChi.stats = { stamina: 99, strength: 99, agility: 99, wisdom: 99, swim: 99, fly: 99 };
        superChi.statPoints = { stamina: 99, strength: 99, agility: 99, wisdom: 99, swim: 99, fly: 99 };
        _state.data.chis.push(superChi);
        _state.save();
    }

    if (!_state.data.chis.find(c => c.name === 'MidChi')) {
        let midChi = createNewChi('MidChi');
        midChi.stats = { stamina: 20, strength: 20, agility: 20, wisdom: 20, swim: 20, fly: 20 };
        midChi.statPoints = { stamina: 0, strength: 0, agility: 0, wisdom: 0, swim: 0, fly: 0 };
        _state.data.chis.push(midChi);
        _state.save();
    }
    
    renderChiSelector();
    updateUI();
    checkAllDailyNikkis();

    if (_garden3D) {
        _garden3D.destroy();
        _garden3D = null;
    }

    requestAnimationFrame(() => {
        const renderArea = _screens.setup.querySelector('#cg-render-area');
        _garden3D = new ChaoGarden3D(renderArea, _state, (chiId) => {
            if (chiId === null) {
                _activeViewedChiId = null;
                renderSA2StatWindow(null);
            } else {
                if (_state.data.activeChiId === chiId) {
                    handlePetChi(chiId);
                    if (_activeViewedChiId !== chiId) {
                        _activeViewedChiId = chiId;
                        renderSA2StatWindow(_state.data.chis.find(c => c.id === chiId));
                    }
                } else {
                    _state.data.activeChiId = chiId;
                    _state.save();
                    renderChiSelector();
                    updateUI();
                    _activeViewedChiId = chiId;
                    renderSA2StatWindow(_state.data.chis.find(c => c.id === chiId));
                }
            }
        });
    });
}

function renderChiSelector() {
    const container = _screens.setup.querySelector('#global-chi-selector');
    if (!container) return;
    
    container.innerHTML = _state.data.chis.map(c => {
        const avgLv = Math.floor((c.stats.strength + c.stats.agility + c.stats.stamina + c.stats.wisdom + c.stats.swim + c.stats.fly) / 6);
        return `
            <div class="chi-card ${c.id === _state.data.activeChiId ? 'active' : ''}" data-id="${c.id}">
                <div style="font-weight:bold;">${c.name}</div>
                <div style="font-size: 10px; color: #aaa;">Lv ${avgLv}</div>
            </div>
        `;
    }).join('');
    
    container.querySelectorAll('.chi-card').forEach(card => {
        card.addEventListener('click', () => {
            _state.data.activeChiId = card.getAttribute('data-id');
            _state.save();
            renderChiSelector();
            updateUI();

            if (_screens.setup.querySelector('#chao-tab-compete').classList.contains('active')) {
                if (_race3D) { _race3D.destroy(); _race3D = null; }
                if (_karate3D) { _karate3D.destroy(); _karate3D = null; }
                if (_pageant3D) { _pageant3D.destroy(); _pageant3D = null; }
                _screens.setup.querySelector('#chao-minigame-container').innerHTML = '';
            }

            if (_screens.setup.querySelector('#chao-tab-nikki').classList.contains('active')) {
                renderNikkiTab(_screens.setup.querySelector('#chao-tab-nikki'), _state);
            }
        });
    });
}

async function checkAllDailyNikkis() {
    for (const chi of _state.data.chis) {
        await checkDailyNikki(chi);
    }
}

async function checkDailyNikki(chi) {
    if (!chi.diaryEntries) chi.diaryEntries = [];
    const lastEntry = chi.diaryEntries[chi.diaryEntries.length - 1];
    const today = new Date().toDateString();
    const lastDate = lastEntry ? new Date(lastEntry.date).toDateString() : null;

    if (today !== lastDate) {
        const words = Object.values(srsDb.getAllWords());
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const recent = words.filter(w => (now - new Date(w.lastUpdated).getTime()) < oneDay);
        
        recent.sort((a, b) => a.status - b.status);
        const recentWords = recent.slice(0, 3).map(w => w.word);

        if (_state.data.activeChiId === chi.id) {
            showToast(`💭 ${chi.name} is writing in their diary...`);
        }
        
        try {
            await generateNikkiEntry(chi, recentWords, (msg) => {
                if (_state.data.activeChiId === chi.id) console.log("Nikki Gen:", msg);
            });
            _state.save();
            
            if (_state.data.activeChiId === chi.id) {
                showToast(`📔 ${chi.name} finished their daily diary!`);
                if (_screens.setup.querySelector('#chao-tab-nikki').classList.contains('active')) {
                    renderNikkiTab(_screens.setup.querySelector('#chao-tab-nikki'), _state);
                }
            }
        } catch(e) {
            console.error(`Auto Nikki failed for ${chi.name}:`, e);
        }
    }
}

function handlePetChi(chiId) {
    const chi = _state.data.chis.find(c => c.id === chiId);
    if (chi) {
        chi.connection += 1;
        _state.save();
        showToast(`Pet ${chi.name}! Connection +1 💖`);
        if (_garden3D) _garden3D.triggerHappyBounce(chiId);
    }
}

function startStatTween() {
    if (_statTweenId) return;
    function loop() {
        let updated = false;
        const chi = _state.data.chis.find(c => c.id === _activeViewedChiId);
        if (!chi) { _statTweenId = null; return; }
        
        ['stamina', 'strength', 'agility', 'wisdom', 'swim', 'fly'].forEach(stat => {
            const target = getChiTrueStat(chi, stat);
            if (_displayStats[stat] === undefined) _displayStats[stat] = target;
            
            if (Math.abs(_displayStats[stat] - target) > 0.1) {
                // Smooth interpolation for continuous feed clicking
                _displayStats[stat] += (target - _displayStats[stat]) * 0.15; 
                if (Math.abs(_displayStats[stat] - target) <= 0.1) _displayStats[stat] = target;
                updated = true;
                
                const el = _screens.setup.querySelector(`#stat-row-${stat}`);
                if (el) {
                    const val = Math.floor(_displayStats[stat]);
                    const lvl = Math.floor(val / 100);
                    const pts = val % 100;
                    
                    el.querySelector('.sa2-stat-val').textContent = String(val).padStart(4, '0');
                    el.querySelector('.sa2-stat-lvl').textContent = `Lv. ${String(lvl).padStart(2, '0')}`;
                    el.querySelector('.sa2-stat-fill-yellow').style.width = `${pts}%`;
                }
            }
        });
        
        if (updated) _statTweenId = requestAnimationFrame(loop);
        else _statTweenId = null;
    }
    _statTweenId = requestAnimationFrame(loop);
}

function renderSA2StatWindow(chi) {
    const win = _screens.setup.querySelector('#sa2-stat-window');
    if (!chi) {
        win.style.display = 'none';
        _activeViewedChiId = null;
        if (_statTweenId) { cancelAnimationFrame(_statTweenId); _statTweenId = null; }
        return;
    }
    
    if (!chi.statPoints) chi.statPoints = { stamina: 0, strength: 0, agility: 0, wisdom: 0, swim: 0, fly: 0 };
    const statLabels = { swim: 'Swim', fly: 'Fly', agility: 'Run', strength: 'Power', stamina: 'Stamina', wisdom: 'Wisdom' };

    // Reset exact state on open to prevent jumping from previous chi
    ['stamina', 'strength', 'agility', 'wisdom', 'swim', 'fly'].forEach(stat => {
        _displayStats[stat] = getChiTrueStat(chi, stat);
    });

    win.innerHTML = `<div class="sa2-stat-title">${chi.name}</div>` + Object.keys(statLabels).map(stat => {
        const trueVal = Math.floor(_displayStats[stat]);
        const lvl = Math.floor(trueVal / 100);
        const pts = trueVal % 100;
        
        return `
            <div class="sa2-stat-row" id="stat-row-${stat}">
                <div class="sa2-stat-header">
                    <span class="sa2-stat-name">${statLabels[stat]}</span>
                    <span class="sa2-stat-val">${String(trueVal).padStart(4, '0')}</span>
                </div>
                <div class="sa2-stat-bar-container">
                    <div class="sa2-stat-lvl">Lv. ${String(lvl).padStart(2, '0')}</div>
                    <div class="sa2-stat-track">
                        <div class="sa2-stat-fill-yellow" style="width: ${pts}%"></div>
                        <div class="sa2-stat-fill-blue"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    win.style.display = 'block';
}

function updateUI() {
    _screens.setup.querySelector('#chao-seishin-val').textContent = formatSeishin(_state.data.seishin);
    const chi = _state.getActiveChi();
    const feedMenu = _screens.setup.querySelector('#feed-menu');
    
    const fruitKeys = Object.keys(_state.data.fruits);
    const ownedFruits = fruitKeys.filter(k => _state.data.fruits[k] > 0);
    
    if (ownedFruits.length === 0) {
        feedMenu.innerHTML = `<div style="color:#888; padding: 10px;">No fruits in inventory. Buy some in the Market!</div>`;
    } else {
        feedMenu.innerHTML = ownedFruits.map(k => {
            const meta = MARKET_ITEMS.find(m => m.id === k);
            return `<div class="fruit-item" data-id="${k}" data-stat="${meta.stat}">
                <div style="font-size:20px;">${meta.icon}</div>
                <div>x${_state.data.fruits[k]}</div>
            </div>`;
        }).join('');
        
        feedMenu.querySelectorAll('.fruit-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const fid = e.currentTarget.getAttribute('data-id');
                const stat = e.currentTarget.getAttribute('data-stat');
                
                if (_state.data.fruits[fid] > 0) {
                    if (!chi.statPoints) chi.statPoints = { stamina: 0, strength: 0, agility: 0, wisdom: 0, swim: 0, fly: 0 };
                    
                    if (chi.stats[stat] === 99 && chi.statPoints[stat] >= 99) {
                        showToast(`${chi.name}'s ${stat.toUpperCase()} is already MAX level!`);
                        return;
                    }

                    _state.data.fruits[fid]--;
                    _state.save();
                    updateUI(); // Updates inventory count immediately

                    // Spawn physical fruit and trigger callback when eaten
                    if (_garden3D) {
                        _garden3D.spawnFruit(stat, () => {
                            chi.statPoints[stat] += 25;
                            
                            if (chi.statPoints[stat] >= 100) {
                                chi.statPoints[stat] -= 100;
                                chi.stats[stat] = Math.min(99, chi.stats[stat] + 1);
                                if (chi.stats[stat] === 99 && chi.statPoints[stat] > 99) chi.statPoints[stat] = 99;
                                showToast(`${chi.name}'s ${stat.toUpperCase()} LEVEL UP!`);
                            }
                            
                            chi.connection += 2;
                            _state.save();
                            startStatTween();
                        });
                    }
                }
            });
        });
    }
}

function _injectCSS() {
    if (!document.getElementById('chao-styles')) {
        const link = document.createElement('link');
        link.id = 'chao-styles';
        link.rel = 'stylesheet';
        link.href = './js/games/chao/chao.css';
        document.head.appendChild(link);
    }
}