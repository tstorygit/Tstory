
import { mountVocabSelector } from '../../vocab_selector.js';
import * as srsDb from '../../srs_db.js';
import { initInput, cleanupInput } from './surv_input.js';
import { initCanvas, startRun, pause, stop } from './surv_engine.js';
import { initUI, resetGameUI, drawHUD, incrementKill, showSrsQuiz, showGameOver } from './surv_ui.js';
import { CHARACTERS } from './surv_entities.js';

let _screens = null;
let _onExitGlobal = null;
let _selector = null;
let _meta = null;
let _vocabQueue = [];
let _customDeckActive = false;

export function init(screens, onExit) {
    _screens = screens;
    _onExitGlobal = onExit;

    const setupHTML = `
        <div id="surv-deck-selector-wrap" style="display:none;"></div>
        <div id="surv-camp-wrap" style="display:none; max-width: 600px; margin: 0 auto; padding-bottom: 30px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h2 style="margin:0; color:var(--primary-color);">Yōkai Survivor Camp</h2>
                <button id="surv-btn-change-deck" class="caro-back-btn" style="width:auto; margin:0; padding:6px 12px; border:1px solid var(--border-color); border-radius:8px;">⚙️ Deck</button>
            </div>
            <div class="surv-setup-layout">
                <div class="surv-setup-col">
                    <div class="surv-panel">
                        <h3>Character Select</h3>
                        <div id="surv-char-list"></div>
                    </div>
                </div>
                <div class="surv-setup-col">
                    <div class="surv-panel">
                        <h3 style="color:#9b59b6;">The Shrine (Upgrades)</h3>
                        <div style="font-size:14px; font-weight:bold; color:#f1c40f; margin-bottom:10px;">👻 Souls: <span id="surv-soul-count">0</span></div>
                        <div id="surv-shrine-list"></div>
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button id="surv-btn-start-run" class="primary-btn" style="flex:2;">⚔️ Enter the Forest</button>
                <button id="surv-btn-exit-camp" class="caro-back-btn" style="flex:1; background:var(--surface-color); border:1px solid var(--border-color);">Exit</button>
            </div>
        </div>
    `;

    _screens.setup.innerHTML = setupHTML;
    
    // Canvas Game Screen
    _screens.game.innerHTML = `<div class="surv-canvas-wrap"><canvas id="surv-canvas"></canvas></div><div id="surv-ui-layer"></div>`;

    initCanvas(_screens.game.querySelector('#surv-canvas'), {
        onLevelUp: () => showSrsQuiz(),
        onChest: () => import('./surv_ui.js').then(m => m.showChestQuiz()),
        onKill: () => incrementKill(),
        onDraw: (hp, max, xp, xpN, lvl, time) => drawHUD(hp, max, xp, xpN, lvl, time),
        onGameOver: (isWin) => showGameOver(isWin, () => returnToCamp())
    });

    initInput(_screens.game.querySelector('.surv-canvas-wrap'));
    initUI(_screens.game.querySelector('#surv-ui-layer'), { 
        applyUpgrade: (u)=>import('./surv_engine.js').then(m=>m.applyUpgrade(u)), 
        applyPenalty: ()=>import('./surv_engine.js').then(m=>m.applyPenalty()), 
        resume: ()=>import('./surv_engine.js').then(m=>m.resume()), 
        getActiveWeapons: ()=>import('./surv_engine.js').then(m=>m.getActiveWeapons()), 
        getActivePassives: ()=>import('./surv_engine.js').then(m=>m.getActivePassives()), 
        getElapsedTime: ()=>import('./surv_engine.js').then(m=>m.getElapsedTime()) 
    }, srsDb);
}

export function launch() {
    loadMeta();
    
    const srsWords = Object.values(srsDb.getAllWords());
    if (srsWords.length > 0 && !_customDeckActive) {
        _vocabQueue = srsWords.map(w => ({ word: w.word, furi: w.furi, trans: w.translation }));
        _show('setup');
        showCamp();
    } else {
        _show('setup');
        showVocabSelector();
    }
}

function loadMeta() {
    const def = { souls: 0, unlockedChars: ['ronin'], upgrades: { vitality: 0, swiftness: 0, greed: 0, power: 0 }, stats: { highestTime: 0, totalWordsMastered: 0 } };
    try {
        _meta = JSON.parse(localStorage.getItem('surv_meta')) || def;
    } catch { _meta = def; }
}

function saveMeta() {
    localStorage.setItem('surv_meta', JSON.stringify(_meta));
}

function _show(name) {
    if (_screens.setup) _screens.setup.style.display = name === 'setup' ? 'block' : 'none';
    if (_screens.game) _screens.game.style.display = name === 'game' ? 'flex' : 'none';
}

function showVocabSelector() {
    const selectorWrap = _screens.setup.querySelector('#surv-deck-selector-wrap');
    const campWrap = _screens.setup.querySelector('#surv-camp-wrap');
    
    selectorWrap.style.display = 'block';
    campWrap.style.display = 'none';
    
    if (!_selector) {
        _selector = mountVocabSelector(selectorWrap, {
            bannedKey: 'surv_banned',
            defaultCount: 'All',
            title: 'Vocabulary Queue'
        });
        const actions = _selector.getActionsEl();
        const startBtn = document.createElement('button');
        startBtn.className = 'primary-btn';
        startBtn.textContent = '⛺ Go to Camp';
        startBtn.onclick = async () => {
            const queue = await _selector.getQueue();
            if (!queue.length) return;
            _customDeckActive = true;
            _vocabQueue = queue.map(w => ({ word: w.word, furi: w.furi || w.word, trans: w.trans || '—' }));
            showCamp();
        };
        const backBtn = document.createElement('button');
        backBtn.className = 'caro-back-btn';
        backBtn.textContent = '← Back to Games';
        backBtn.onclick = () => {
            const srsWords = Object.values(srsDb.getAllWords());
            if (srsWords.length > 0) {
                _customDeckActive = false;
                _vocabQueue = srsWords.map(w => ({ word: w.word, furi: w.furi, trans: w.translation }));
                showCamp();
            } else {
                _onExitGlobal();
            }
        };
        actions.append(startBtn, backBtn);
    }
}

let selectedChar = 'ronin';

function showCamp() {
    const selectorWrap = _screens.setup.querySelector('#surv-deck-selector-wrap');
    const campWrap = _screens.setup.querySelector('#surv-camp-wrap');
    
    selectorWrap.style.display = 'none';
    campWrap.style.display = 'block';

    const el = _screens.setup;

    el.querySelector('#surv-btn-change-deck').onclick = () => showVocabSelector();
    el.querySelector('#surv-btn-start-run').onclick = () => startActualRun(_vocabQueue);
    el.querySelector('#surv-btn-exit-camp').onclick = _onExitGlobal;

    el.querySelector('#surv-soul-count').textContent = _meta.souls;

    // Characters
    const charList = el.querySelector('#surv-char-list');
    charList.innerHTML = Object.values(CHARACTERS).map(c => {
        const isUnlocked = _meta.unlockedChars.includes(c.id);
        const isActive = selectedChar === c.id;
        return `
            <div class="surv-char-card ${isUnlocked ? (isActive ? 'active' : '') : 'locked'}" data-id="${c.id}">
                <div class="surv-char-icon">${c.icon}</div>
                <div class="surv-char-info">
                    <div class="surv-char-name">${c.name}</div>
                    <div class="surv-char-desc">${c.desc}</div>
                </div>
                ${!isUnlocked ? `<div class="surv-char-cost">${c.cost} 👻</div>` : ''}
            </div>
        `;
    }).join('');

    charList.querySelectorAll('.surv-char-card').forEach(c => c.onclick = () => {
        const id = c.dataset.id;
        if (_meta.unlockedChars.includes(id)) {
            selectedChar = id;
            showCamp();
        } else {
            const cost = CHARACTERS[id].cost;
            if (_meta.souls >= cost) {
                if (confirm(`Unlock ${CHARACTERS[id].name} for ${cost} Souls?`)) {
                    _meta.souls -= cost;
                    _meta.unlockedChars.push(id);
                    selectedChar = id;
                    saveMeta();
                    showCamp();
                }
            } else {
                alert("Not enough Souls!");
            }
        }
    });

    // Shrine
    const shrineList = el.querySelector('#surv-shrine-list');
    const shrineUpgrades = [
        { id: 'vitality', name: 'Vitality', desc: '+5% Base HP per rank' },
        { id: 'swiftness', name: 'Swiftness', desc: '+2% Move Speed per rank' },
        { id: 'power', name: 'Power', desc: '+5% Damage per rank' },
        { id: 'greed', name: 'Greed', desc: '+5% Soul gain per rank' }
    ];

    shrineList.innerHTML = shrineUpgrades.map(u => {
        const lvl = _meta.upgrades[u.id] || 0;
        const max = 10;
        const cost = (lvl + 1) * 200;
        return `
            <div class="surv-shrine-item">
                <div class="surv-shrine-info">
                    <div class="surv-shrine-name">${u.name} (Lv. ${lvl}/${max})</div>
                    <div class="surv-shrine-desc">${u.desc}</div>
                </div>
                <button class="surv-shrine-buy" data-id="${u.id}" ${lvl >= max || _meta.souls < cost ? 'disabled' : ''}>
                    ${lvl >= max ? 'MAX' : `Buy (${cost})`}
                </button>
            </div>
        `;
    }).join('');

    shrineList.querySelectorAll('.surv-shrine-buy').forEach(b => b.onclick = () => {
        const id = b.dataset.id;
        const lvl = _meta.upgrades[id] || 0;
        const cost = (lvl + 1) * 200;
        if (_meta.souls >= cost && lvl < 10) {
            _meta.souls -= cost;
            _meta.upgrades[id] = lvl + 1;
            saveMeta();
            showCamp();
        }
    });
}

function startActualRun(queue) {
    _show('game');
    resetGameUI(queue, _meta);
    startRun(selectedChar, _meta.upgrades);
}

function returnToCamp() {
    stop();
    _show('setup');
    showCamp();
}
