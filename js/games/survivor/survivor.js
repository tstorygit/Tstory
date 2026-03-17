
import { mountVocabSelector } from '../../vocab_selector.js';
import * as srsDb from '../../srs_db.js';
import { initInput, cleanupInput } from './surv_input.js';
import { initCanvas, startRun, pause, resume, stop, applyUpgrade, applyPenalty, getActiveWeapons, getActivePassives, getElapsedTime } from './surv_engine.js';
import { initUI, resetGameUI, drawHUD, incrementKill, showSrsQuiz, showGameOver, showChestQuiz } from './surv_ui.js';
import { CHARACTERS } from './surv_entities.js';

let _screens = null;
let _onExitGlobal = null;
let _selector = null;
let _meta = null;

export function init(screens, onExit) {
    _screens = screens;
    _onExitGlobal = onExit;

    const setupHTML = `
        <div class="surv-setup-layout">
            <div class="surv-setup-col">
                <div id="surv-vocab-mount"></div>
            </div>
            <div class="surv-setup-col" style="display:flex; flex-direction:column; gap:20px;">
                <div class="surv-panel">
                    <h3>Character Select</h3>
                    <div id="surv-char-list"></div>
                </div>
                <div class="surv-panel">
                    <h3 style="color:#9b59b6;">The Shrine (Upgrades)</h3>
                    <div style="font-size:14px; font-weight:bold; color:#f1c40f; margin-bottom:10px;">👻 Souls: <span id="surv-soul-count">0</span></div>
                    <div id="surv-shrine-list"></div>
                </div>
            </div>
        </div>
    `;

    _screens.setup.innerHTML = setupHTML;
    
    // Canvas Game Screen
    _screens.game.innerHTML = `<div class="surv-canvas-wrap"><canvas id="surv-canvas"></canvas></div><div id="surv-ui-layer"></div>`;

    initCanvas(_screens.game.querySelector('#surv-canvas'), {
        onLevelUp: () => showSrsQuiz(),
        onChest: () => showChestQuiz(),
        onKill: () => incrementKill(),
        onDraw: (hp, max, xp, xpN, lvl, time) => drawHUD(hp, max, xp, xpN, lvl, time),
        onGameOver: (isWin) => showGameOver(isWin, () => returnToCamp())
    });

    initInput(_screens.game.querySelector('.surv-canvas-wrap'));
    
    // Pass direct function references to UI instead of promises
    initUI(_screens.game.querySelector('#surv-ui-layer'), {
        applyUpgrade,
        applyPenalty,
        resume,
        getActiveWeapons,
        getActivePassives,
        getElapsedTime
    }, srsDb);
}

export function launch() {
    loadMeta();
    _show('setup');
    renderSetup();
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

let selectedChar = 'ronin';

function renderSetup() {
    const el = _screens.setup;
    
    if (!_selector) {
        _selector = mountVocabSelector(el.querySelector('#surv-vocab-mount'), {
            bannedKey: 'surv_banned',
            defaultCount: 'All',
            title: 'Vocabulary Queue'
        });
        const actions = _selector.getActionsEl();
        const startBtn = document.createElement('button');
        startBtn.className = 'primary-btn';
        startBtn.textContent = '⚔️ Enter the Forest';
        startBtn.onclick = async () => {
            const queue = await _selector.getQueue();
            if (!queue.length) return;
            startActualRun(queue);
        };
        const backBtn = document.createElement('button');
        backBtn.className = 'caro-back-btn';
        backBtn.textContent = '← Back to Games';
        backBtn.onclick = _onExitGlobal;
        actions.append(startBtn, backBtn);
    }

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
            renderSetup();
        } else {
            const cost = CHARACTERS[id].cost;
            if (_meta.souls >= cost) {
                if (confirm(`Unlock ${CHARACTERS[id].name} for ${cost} Souls?`)) {
                    _meta.souls -= cost;
                    _meta.unlockedChars.push(id);
                    selectedChar = id;
                    saveMeta();
                    renderSetup();
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
            renderSetup();
        }
    });
}

function startActualRun(queue) {
    _vocabQueue = queue.map(w => ({ word: w.word, furi: w.furi || w.word, trans: w.trans || '—' }));
    _show('game');
    resetGameUI(_vocabQueue, _meta);
    startRun(selectedChar, _meta.upgrades);
}

function returnToCamp() {
    stop();
    _show('setup');
    renderSetup();
}
