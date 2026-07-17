import { ChaoStateManager, createNewChi, getChiTrueStat } from './chao_state.js';
import { syncEconomy } from './chao_economy.js';
import { GameVocabManager } from '../../game_vocab_mgr.js';
import { showGameQuiz, setGvmTheme } from '../../game_vocab_mgr_ui.js';
import { ChaoGarden3D } from './chao_garden_ui.js';
import { MatsuriPageant } from './chao_pageant.js';
import { renderNikkiTab } from './chao_nikki_ui.js';
import { renderMarketTab, MARKET_ITEMS } from './chao_market_ui.js';
import { renderDebugTab } from './chao_debug_ui.js';
import { renderStudyTab } from './chao_study_ui.js';
import { renderTrophyShelf } from './chao_trophy_ui.js';
import { generateNikkiEntry } from './chao_nikki_mgr.js';
import { ChaoRace3D } from './chao_race.js';
import { ChaoKarate3D } from './chao_karate.js';
import * as srsDb from '../../srs_db.js';
import { getKeyList } from '../../ai_api.js';

// ==========================================
// 1. MODULE VARIABLES
// ==========================================
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
let _displayStats = {};
let _docPointerHandler = null;

// ==========================================
// 2. HOISTED UTILITY FUNCTIONS
// ==========================================

function formatSeishin(val) {
    return Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(val);
}

function showToast(msg) {
    if (!_screens) return;
    const toast = _screens.setup.querySelector('#chao-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.opacity = '1';
    if (_toastTimeout) clearTimeout(_toastTimeout);
    _toastTimeout = setTimeout(() => toast.style.opacity = '0', 2500);
}

function renderChiSelector() {
    if (!_screens) return;
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

function handlePetChi(chiId) {
    const chi = _state.data.chis.find(c => c.id === chiId);
    if (chi) {
        chi.connection += 1;
        _state.save();
        showToast(`Pet ${chi.name}! Bond +1 💖`);
        if (_garden3D) _garden3D.triggerHappyBounce(chiId);
        if (_activeViewedChiId === chiId) renderSA2StatWindow(chi);
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
    if (!_screens) return;
    const win = _screens.setup.querySelector('#sa2-stat-window');
    if (!chi) {
        win.style.display = 'none';
        _activeViewedChiId = null;
        if (_statTweenId) { cancelAnimationFrame(_statTweenId); _statTweenId = null; }
        return;
    }
    
    if (!chi.statPoints) chi.statPoints = { stamina: 0, strength: 0, agility: 0, wisdom: 0, swim: 0, fly: 0 };
    const statLabels = { swim: 'Swim', fly: 'Fly', agility: 'Run', strength: 'Power', stamina: 'Stamina', wisdom: 'Wisdom' };

    ['stamina', 'strength', 'agility', 'wisdom', 'swim', 'fly'].forEach(stat => {
        _displayStats[stat] = getChiTrueStat(chi, stat);
    });

    const bondHtml = `
        <div style="text-align:center; font-size:11px; color:#fff; -webkit-text-stroke: 0.4px black; margin-bottom:6px;"
             title="Raise by petting, feeding, and helping your Chi. Boosts pageant appeal and cheer power!">
            💖 Bond: ${chi.connection || 0}
        </div>`;

    win.innerHTML = `<div class="sa2-stat-title">${chi.name}</div>` + bondHtml + Object.keys(statLabels).map(stat => {
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
    if (!_screens || !_state) return;
    _screens.setup.querySelector('#chao-seishin-val').textContent = formatSeishin(_state.data.seishin);
    const streakEl = _screens.setup.querySelector('#chao-daily-streak');
    if (streakEl) {
        const st = (_state.data.daily && _state.data.daily.streak) || 0;
        streakEl.style.display = st >= 2 ? '' : 'none';
        streakEl.querySelector('b').textContent = st;
    }
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
                const chi = _state.getActiveChi(); // resolve at click time
                if (!chi) return;

                if (_state.data.fruits[fid] > 0) {
                    if (!_garden3D) {
                        showToast('The garden is still loading...');
                        return; // don't consume the fruit before it can be eaten
                    }
                    if (!chi.statPoints) chi.statPoints = { stamina: 0, strength: 0, agility: 0, wisdom: 0, swim: 0, fly: 0 };

                    if (chi.stats[stat] === 99 && chi.statPoints[stat] >= 99) {
                        showToast(`${chi.name}'s ${stat.toUpperCase()} is already MAX level!`);
                        return;
                    }

                    _state.data.fruits[fid]--;
                    _state.save();
                    updateUI();

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
            });
        });
    }
}

// ── Shared refresh after any purchase / state change from a sub-tab ─────────
function onShopChanged() {
    updateUI();
    renderChiSelector();
    if (_garden3D) _garden3D.syncChis();
}

function applyDebugVisibility() {
    const dbgBtn = _screens.setup.querySelector('#chao-debug-tab-btn');
    if (dbgBtn) dbgBtn.style.display = _state.data.debugUnlocked ? '' : 'none';
}

function renderStudyTabHere(container) {
    renderStudyTab(container, _state, _vocabMgr, {
        overlayHost: _screens.setup.querySelector('.chao-root'),
        showToast,
        onSeishinChanged: updateUI,
    });
}

/**
 * One-shot "Cheer" quiz used by the Race and Karate spectator mechanics.
 * Calls onResult(true|false) after an answer, or onResult(null) if no
 * vocabulary is available.
 */
function showCheerQuiz(onResult) {
    const host = _screens.setup.querySelector('.chao-root');
    if (!_vocabMgr || _vocabMgr.getStats().totalPoolSize === 0) {
        showToast('No vocabulary available — learn some words first!');
        onResult(null);
        return;
    }
    setGvmTheme('dark');
    _vocabMgr.pause();
    showGameQuiz(_vocabMgr, {
        container: host,
        title: '📣 Cheer!',
        titleColor: '#f1c40f',
        subtitle: 'Answer correctly to fire up your Chi!',
        showFurigana: true,
        optionCount: 4,
        onAnswer: (isCorrect) => {
            _vocabMgr.resume();
            onResult(isCorrect);
        },
        onEmpty: () => {
            _vocabMgr.resume();
            showToast('No words available right now!');
            onResult(null);
        }
    });
}

// ── Daily visit bonus + care streak ─────────────────────────────────────────
// Day 1: +5 🌸, +2 per consecutive day after that, capped at +25 (day 11+).
// A missed calendar day resets the streak to 1.
const DAILY_BONUS_BASE = 5;
const DAILY_BONUS_STEP = 2;
const DAILY_BONUS_CAP  = 25;

function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function showDailyBanner(msg) {
    const renderArea = _screens.setup.querySelector('#cg-render-area');
    if (!renderArea) return;
    const old = renderArea.querySelector('.chao-daily-banner');
    if (old) old.remove();
    const banner = document.createElement('div');
    banner.className = 'chao-daily-banner';
    banner.textContent = msg;
    renderArea.appendChild(banner);
    setTimeout(() => { if (banner.isConnected) banner.remove(); }, 6000);
}

function checkDailyVisitBonus() {
    const daily = _state.data.daily;
    const now = new Date();
    const today = localDateStr(now);
    if (daily.lastVisitDate === today) return; // already granted today

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    daily.streak = (daily.lastVisitDate === localDateStr(yesterday)) ? (daily.streak || 0) + 1 : 1;
    daily.lastVisitDate = today;

    const bonus = Math.min(DAILY_BONUS_CAP, DAILY_BONUS_BASE + (daily.streak - 1) * DAILY_BONUS_STEP);
    _state.data.seishin += bonus;
    _state.data.stats.totalSeishinEarned = (_state.data.stats.totalSeishinEarned || 0) + bonus;
    _state.save();
    showDailyBanner(`🌅 Day ${daily.streak} streak: +${bonus} 🌸 Seishin!`);
}

function awardSeishin(amount, reason) {
    _state.data.seishin += amount;
    _state.data.stats.totalSeishinEarned = (_state.data.stats.totalSeishinEarned || 0) + amount;
    _state.save();
    updateUI();
    if (reason) showToast(`${reason} +${amount} 🌸`);
}

async function checkAllDailyNikkis() {
    // Diaries need the AI backend — degrade silently when no key is set.
    if (getKeyList().length === 0) return;
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

function _injectCSS() {
    if (!document.getElementById('chao-styles')) {
        const link = document.createElement('link');
        link.id = 'chao-styles';
        link.rel = 'stylesheet';
        link.href = './js/games/chao/chao.css';
        document.head.appendChild(link);
    }
}


// ==========================================
// 3. CORE LIFECYCLE EXPORTS
// ==========================================

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
                <div id="chao-daily-streak" class="chao-daily-streak" title="Daily visit streak" style="display:none;">🌅<b>0</b></div>
                <div class="chao-currencies">
                    🌸 <span id="chao-seishin-val" style="display:inline-block; min-width:3ch; text-align:right;">0</span>
                </div>
                <button id="chao-exit-btn" style="background:none; border:none; color:#ff5555; font-size:24px; cursor:pointer; padding:0 5px; margin-left: 5px;">✖</button>
            </div>
            
            <div class="chao-tab-bar">
                <button class="chao-tab-btn active" data-tab="chao-tab-garden">Garden</button>
                <button class="chao-tab-btn" data-tab="chao-tab-study">Study</button>
                <button class="chao-tab-btn" data-tab="chao-tab-market">Market</button>
                <button class="chao-tab-btn" data-tab="chao-tab-compete">Compete</button>
                <button class="chao-tab-btn" data-tab="chao-tab-nikki">Diary</button>
                <button class="chao-tab-btn" data-tab="chao-tab-debug" id="chao-debug-tab-btn" style="display:none;">Debug</button>
            </div>
            
            <div class="chao-screen active" id="chao-tab-garden">
                <div id="cg-render-area">
                    <div id="sa2-stat-window" class="sa2-stat-window"></div>
                </div>
                <div id="feed-menu" class="chao-feed-menu"></div>
            </div>
            
            <div class="chao-screen" id="chao-tab-study"></div>

            <div class="chao-screen" id="chao-tab-market"></div>
            
            <div class="chao-screen" id="chao-tab-compete">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-shrink:0;">
                    <h3 style="margin:0;">Competitions</h3>
                    <button id="btn-show-trophies" class="chao-action-btn" style="margin:0; padding:6px 12px; font-size:13px; background:#f1fa8c; color:#282a36;">🏆 Trophies</button>
                </div>
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
            else if (targetId === 'chao-tab-market') renderMarketTab(container, _state, showToast, onShopChanged);
            else if (targetId === 'chao-tab-study') renderStudyTabHere(container);
            else if (targetId === 'chao-tab-debug') renderDebugTab(container, _state, showToast, onShopChanged);
            else updateUI();
        });
    });

    // ── Hidden debug unlock: tap the 🌸 Seishin counter 5 times quickly ──────
    let _debugTaps = 0;
    let _debugTapTimer = null;
    _screens.setup.querySelector('.chao-currencies').addEventListener('click', () => {
        _debugTaps++;
        if (_debugTapTimer) clearTimeout(_debugTapTimer);
        _debugTapTimer = setTimeout(() => { _debugTaps = 0; }, 2000);
        if (_debugTaps >= 5) {
            _debugTaps = 0;
            _state.data.debugUnlocked = !_state.data.debugUnlocked;
            _state.save();
            applyDebugVisibility();
            showToast(_state.data.debugUnlocked ? '🛠 Debug tools unlocked!' : '🛠 Debug tools hidden.');
            if (!_state.data.debugUnlocked) {
                // If the debug tab was open, bounce back to the garden.
                const dbgBtn = _screens.setup.querySelector('#chao-debug-tab-btn');
                if (dbgBtn.classList.contains('active')) {
                    _screens.setup.querySelector('.chao-tab-btn[data-tab="chao-tab-garden"]').click();
                }
            }
        }
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

    _screens.setup.querySelector('#btn-show-trophies').addEventListener('click', () => {
        if (_race3D) { _race3D.destroy(); _race3D = null; }
        if (_karate3D) { _karate3D.destroy(); _karate3D = null; }
        if (_pageant3D) { _pageant3D.destroy(); _pageant3D = null; }
        renderTrophyShelf(minigameContainer, _state);
    });

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
            _pageant3D = new MatsuriPageant(_vocabMgr, _state, renderArea, uiOverlay, (appeal, reward) => {
                // Pageant awards + saves internally; refresh shell UI here.
                updateUI();
                if (appeal >= 80) showToast(`🏆 Pageant won! +${reward} 🌸`);
                else showToast(`🎭 Pageant finished — +${reward} 🌸`);
            });
            _pageant3D.startPageant();
        });
    });
    
    _screens.setup.querySelector('#btn-start-race').addEventListener('click', () => {
        if (_karate3D) { _karate3D.destroy(); _karate3D = null; }
        if (_pageant3D) { _pageant3D.destroy(); _pageant3D = null; }

        let cheersLeft = 3;
        let cheerBusy = false;

        minigameContainer.innerHTML = `
            <div id="race-render-area" style="background: #87CEEB;"></div>
            <div id="race-ui-overlay" style="margin-top: 10px; text-align: center; flex-shrink: 0;">
                <h4 style="color:#f1fa8c; margin:0 0 5px 0;">Race Started!</h4>
                <p style="font-size: 13px; color: #bbb; margin:0 0 8px 0;">Chis use their Run, Fly, Swim, and Power stats to navigate the course!</p>
                <button id="btn-race-cheer" class="chao-action-btn" style="margin:0; padding:8px 16px; background:#f1c40f; color:#282a36;">📣 Cheer (3 left)</button>
            </div>
        `;

        requestAnimationFrame(() => {
            const renderArea = minigameContainer.querySelector('#race-render-area');
            if (_race3D) _race3D.destroy();

            const chi = _state.getActiveChi();
            _race3D = new ChaoRace3D(renderArea, _state, {
                onWinner: (winner) => {
                    const h = minigameContainer.querySelector('#race-ui-overlay h4');
                    if (h) h.textContent = `🏁 ${winner.name} takes 1st place!`;
                },
                onPlayerFinish: (place, total) => {
                    const rewards = [50, 30, 20, 10, 5];
                    const reward = rewards[Math.min(place, rewards.length) - 1] || 5;
                    const medals = ['🥇', '🥈', '🥉'];
                    const medal = medals[place - 1] || '🏳';

                    if (place === 1) {
                        _state.data.stats.totalRacesWon = (_state.data.stats.totalRacesWon || 0) + 1;
                    } else if (place === 2) {
                        _state.data.stats.raceSilver = (_state.data.stats.raceSilver || 0) + 1;
                    } else if (place === 3) {
                        _state.data.stats.raceBronze = (_state.data.stats.raceBronze || 0) + 1;
                    }
                    awardSeishin(reward, place === 1 ? '🥇 Race won!' : `${medal} Finished ${place}/${total}!`);

                    const ui = minigameContainer.querySelector('#race-ui-overlay');
                    if (ui) {
                        ui.innerHTML = `
                            <h3 style="color:${place === 1 ? '#50fa7b' : '#f1fa8c'}; margin:0 0 5px 0;">${medal} ${chi.name} finished ${place}${place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'} of ${total}!</h3>
                            <p style="color:#50fa7b; margin:0 0 8px 0;">Prize: <b>+${reward} 🌸 Seishin</b></p>
                            <button id="btn-race-again" class="chao-action-btn" style="margin:0; padding:8px 16px;">🏁 Race Again</button>
                        `;
                        ui.querySelector('#btn-race-again').addEventListener('click', () => {
                            _screens.setup.querySelector('#btn-start-race').click();
                        });
                    }
                }
            });

            const cheerBtn = minigameContainer.querySelector('#btn-race-cheer');
            cheerBtn.addEventListener('click', () => {
                if (cheerBusy || cheersLeft <= 0 || !_race3D) return;
                cheerBusy = true;
                _race3D.pause();
                showCheerQuiz((isCorrect) => {
                    cheerBusy = false;
                    if (_race3D) _race3D.resume();
                    if (isCorrect === null) return;
                    cheersLeft--;
                    if (cheerBtn.isConnected) {
                        cheerBtn.textContent = `📣 Cheer (${cheersLeft} left)`;
                        cheerBtn.disabled = cheersLeft <= 0;
                    }
                    if (isCorrect && _race3D) {
                        const duration = 4 + Math.min(6, (chi.connection || 0) / 10);
                        _race3D.applyCheer(1.6, duration);
                        showToast(`📣 ${chi.name} surges ahead! (${duration.toFixed(0)}s boost)`);
                    } else if (!isCorrect) {
                        showToast('The cheer fell flat...');
                    }
                });
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
                <div style="text-align:center;">
                    <button id="btn-karate-cheer" class="chao-action-btn" style="margin:0; padding:8px 16px; background:#f1c40f; color:#282a36;">📣 Cheer (once per match)</button>
                </div>
                <div id="karate-result" style="text-align: center; font-weight: bold; font-size: 16px;"></div>
            </div>
        `;

        requestAnimationFrame(() => {
            const renderArea = minigameContainer.querySelector('#karate-render-area');
            if (_karate3D) _karate3D.destroy();

            const chi = _state.getActiveChi();
            _karate3D = new ChaoKarate3D(renderArea, _state, minigameContainer, (playerWon) => {
                const cheerBtn = minigameContainer.querySelector('#btn-karate-cheer');
                if (cheerBtn) cheerBtn.disabled = true;

                if (playerWon) {
                    _state.data.stats.totalKarateWins = (_state.data.stats.totalKarateWins || 0) + 1;
                    awardSeishin(40, '🥋 Match won!');
                } else {
                    awardSeishin(5, '🥋 Fight money:');
                }

                const resultEl = minigameContainer.querySelector('#karate-result');
                if (resultEl) {
                    resultEl.innerHTML += `
                        <div style="margin-top:6px;">
                            <span style="color:#50fa7b; font-size:13px;">+${playerWon ? 40 : 5} 🌸 Seishin</span>
                            <button id="btn-karate-rematch" class="chao-action-btn" style="margin:0 0 0 10px; padding:6px 14px; font-size:13px;">🥋 Rematch</button>
                        </div>
                    `;
                    resultEl.querySelector('#btn-karate-rematch').addEventListener('click', () => {
                        _screens.setup.querySelector('#btn-start-karate').click();
                    });
                }
            });

            const cheerBtn = minigameContainer.querySelector('#btn-karate-cheer');
            let cheerBusy = false;
            cheerBtn.addEventListener('click', () => {
                if (cheerBusy || !_karate3D || _karate3D.isMatchOver) return;
                cheerBusy = true;
                _karate3D.pause();
                showCheerQuiz((isCorrect) => {
                    cheerBusy = false;
                    if (_karate3D) _karate3D.resume();
                    if (isCorrect === null) return;
                    if (cheerBtn.isConnected) cheerBtn.disabled = true;
                    if (_karate3D) _karate3D.applyCheer(isCorrect, chi.connection || 0);
                });
            });
        });
    });

    // init() runs on every game open — remove the previous document-level
    // listener first so handlers don't accumulate across launches.
    if (_docPointerHandler) document.removeEventListener('pointerdown', _docPointerHandler);
    _docPointerHandler = (e) => {
        const statWindow = _screens.setup.querySelector('#sa2-stat-window');
        const renderArea = _screens.setup.querySelector('#cg-render-area');
        if (statWindow && statWindow.style.display === 'block') {
            if (renderArea && !renderArea.contains(e.target)) renderSA2StatWindow(null);
        }
    };
    document.addEventListener('pointerdown', _docPointerHandler);
}

export function launch() {
    _screens.setup.style.display = 'block';
    _state.data = _state.load();

    const earned = syncEconomy(_state);
    if (earned > 0) {
        showToast(`Earned ${formatSeishin(earned)} Seishin from studying!`);
    }

    // First launch of the calendar day: grant the visit bonus (garden banner,
    // separate from the toast so the two never overwrite each other).
    checkDailyVisitBonus();

    if (_state.data.chis.length === 0) {
        _state.data.chis.push(createNewChi('Pochi'));
        _state.data.activeChiId = _state.data.chis[0].id;
        _state.save();
    }

    // ── Vocab manager: player's real SRS library, live scheduling ────────────
    setGvmTheme('dark');
    _vocabMgr = new GameVocabManager({
        ...GameVocabManager.defaultConfig(),
        ...(_state.data.vocabConfig || {}),
    });
    const srsPool = GameVocabManager.loadSrsPool();
    if (srsPool.length > 0) {
        _vocabMgr.setPool(srsPool, 'chao_banned', { globalSrs: true });
    }

    applyDebugVisibility();
    renderChiSelector();
    updateUI();
    checkAllDailyNikkis();

    // Refresh whichever dynamic tab is currently open.
    const activeTab = _screens.setup.querySelector('.chao-tab-btn.active');
    if (activeTab && activeTab.dataset.tab === 'chao-tab-study') {
        renderStudyTabHere(_screens.setup.querySelector('#chao-tab-study'));
    }

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
                if (_activeViewedChiId === chiId) {
                    // 2nd Click on active viewed Chi: PET IT!
                    handlePetChi(chiId);
                } else {
                    // 1st Click: Change Selection & Open Stats
                    _activeViewedChiId = chiId;
                    _state.data.activeChiId = chiId;
                    _state.save();
                    renderChiSelector();
                    updateUI();
                    renderSA2StatWindow(_state.data.chis.find(c => c.id === chiId));
                }
            }
        });
    });
}