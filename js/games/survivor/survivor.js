import { mountVocabSelector } from '../../vocab_selector.js';
import * as srsDb from '../../srs_db.js';
import { initInput } from './surv_input.js';
// ✅ ALL engine functions imported statically — no dynamic import() wrappers
import { initCanvas, startRun, stop, applyUpgrade, applyHeal, applyPenalty,
         resume, getActiveWeapons, getActivePassives, getElapsedTime } from './surv_engine.js';
// ✅ showChestQuiz imported statically — was async import().then() causing chest to open without pausing
import { initUI, resetGameUI, drawHUD, incrementKill, showSrsQuiz,
         showChestQuiz, showBossWarning, showGameOver } from './surv_ui.js';
import { CHARACTERS } from './surv_entities.js';

let _screens       = null;
let _onExitGlobal  = null;
let _selector      = null;
let _meta          = null;
let _vocabQueue    = [];
let _customDeckActive = false;

export function init(screens, onExit) {
    _screens      = screens;
    _onExitGlobal = onExit;

    const setupHTML = `
        <div id="surv-deck-selector-wrap" style="display:none;"></div>
        <div id="surv-camp-wrap" style="display:none; max-width:620px; margin:0 auto; padding-bottom:30px;">
            <div class="surv-camp-header">
                <div>
                    <div class="surv-camp-subtitle">Yōkai Survivor</div>
                    <h2 class="surv-camp-title">⛩️ Base Camp</h2>
                </div>
                <button id="surv-btn-change-deck" class="surv-deck-btn">⚙️ Vocab Deck</button>
            </div>
            <div class="surv-setup-layout">
                <div class="surv-setup-col">
                    <div class="surv-panel">
                        <h3>🥷 Choose Character</h3>
                        <div id="surv-char-list"></div>
                    </div>
                </div>
                <div class="surv-setup-col">
                    <div class="surv-panel surv-shrine-panel">
                        <h3>⛩️ The Shrine</h3>
                        <div class="surv-soul-display">
                            <span class="surv-soul-icon">👻</span>
                            <span id="surv-soul-count">0</span>
                            <span class="surv-soul-label">Souls</span>
                        </div>
                        <div id="surv-shrine-list"></div>
                    </div>
                </div>
            </div>
            <!-- Run stats row -->
            <div class="surv-stats-bar" id="surv-stats-bar"></div>
            <div class="surv-camp-actions">
                <button id="surv-btn-start-run" class="surv-start-btn">⚔️ Enter the Forest</button>
                <button id="surv-btn-exit-camp" class="surv-exit-btn">← Exit</button>
            </div>
        </div>
    `;

    _screens.setup.innerHTML = setupHTML;
    _screens.game.innerHTML  = `<div class="surv-canvas-wrap"><canvas id="surv-canvas"></canvas></div><div id="surv-ui-layer"></div>`;

    initCanvas(_screens.game.querySelector('#surv-canvas'), {
        onLevelUp:    () => showSrsQuiz(),
        onChest:      () => showChestQuiz(),          // ✅ static reference, no async
        onKill:       () => incrementKill(),
        onDraw:       (hp, max, xp, xpN, lvl, t) => drawHUD(hp, max, xp, xpN, lvl, t),
        onGameOver:   (isWin) => showGameOver(isWin, () => returnToCamp()),
        onBossWarning: () => showBossWarning()        // ✅ boss warning callback
    });

    initInput(_screens.game.querySelector('.surv-canvas-wrap'));

    // ✅ Direct function references (no Promise wrappers)
    // ✅ saveMeta callback passed so UI never calls localStorage directly
    initUI(
        _screens.game.querySelector('#surv-ui-layer'),
        { applyUpgrade, applyHeal, applyPenalty, resume, getActiveWeapons, getActivePassives, getElapsedTime },
        srsDb,
        { saveMeta }
    );
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
    const def = {
        souls: 0,
        unlockedChars: ['ronin'],
        upgrades: { vitality: 0, swiftness: 0, greed: 0, power: 0 },
        stats: { highestTime: 0, totalWordsMastered: 0 }
    };
    try { _meta = JSON.parse(localStorage.getItem('surv_meta')) || def; }
    catch { _meta = def; }
    // Backfill any missing stat keys from older saves
    _meta.stats = { ...def.stats, ..._meta.stats };
}

function saveMeta() { localStorage.setItem('surv_meta', JSON.stringify(_meta)); }

function _show(name) {
    if (_screens.setup) _screens.setup.style.display = name === 'setup' ? 'block' : 'none';
    if (_screens.game)  _screens.game.style.display  = name === 'game'  ? 'flex'  : 'none';
}

// ── Vocab selector ──────────────────────────────────────────────────────────

function showVocabSelector() {
    const selectorWrap = _screens.setup.querySelector('#surv-deck-selector-wrap');
    const campWrap     = _screens.setup.querySelector('#surv-camp-wrap');
    selectorWrap.style.display = 'block';
    campWrap.style.display     = 'none';

    if (!_selector) {
        _selector = mountVocabSelector(selectorWrap, {
            bannedKey:    'surv_banned',
            defaultCount: 'All',
            title:        'Vocabulary Queue'
        });
        const actions = _selector.getActionsEl();

        const startBtn = document.createElement('button');
        startBtn.className   = 'surv-start-btn';
        startBtn.textContent = '⛺ Go to Camp';
        startBtn.onclick = async () => {
            const queue = await _selector.getQueue();
            if (!queue.length) return;
            _customDeckActive = true;
            _vocabQueue = queue.map(w => ({ word: w.word, furi: w.furi || w.word, trans: w.trans || '—' }));
            showCamp();
        };

        const backBtn = document.createElement('button');
        backBtn.className   = 'caro-back-btn';
        backBtn.textContent = '← Back to Games';
        backBtn.onclick = () => {
            const srsWords = Object.values(srsDb.getAllWords());
            if (srsWords.length > 0) {
                _customDeckActive = false;
                _vocabQueue = srsWords.map(w => ({ word: w.word, furi: w.furi, trans: w.translation }));
                showCamp();
            } else { _onExitGlobal(); }
        };
        actions.append(startBtn, backBtn);
    }
}

// ── Camp ─────────────────────────────────────────────────────────────────────

let selectedChar = 'ronin';

function showCamp() {
    const selectorWrap = _screens.setup.querySelector('#surv-deck-selector-wrap');
    const campWrap     = _screens.setup.querySelector('#surv-camp-wrap');
    selectorWrap.style.display = 'none';
    campWrap.style.display     = 'block';

    const el = _screens.setup;
    el.querySelector('#surv-btn-change-deck').onclick = () => showVocabSelector();
    el.querySelector('#surv-btn-start-run').onclick   = () => startActualRun(_vocabQueue);
    el.querySelector('#surv-btn-exit-camp').onclick   = _onExitGlobal;
    el.querySelector('#surv-soul-count').textContent  = _meta.souls.toLocaleString();

    // ── Best run stats bar ──
    const statsBar = el.querySelector('#surv-stats-bar');
    const best     = _meta.stats.highestTime || 0;
    const bm = Math.floor(best / 60).toString().padStart(2, '0');
    const bs = Math.floor(best % 60).toString().padStart(2, '0');
    const mastered = _meta.stats.totalWordsMastered || 0;

    if (best > 0 || mastered > 0) {
        statsBar.innerHTML = `
            <div class="surv-stat-chip">
                <span class="surv-stat-chip-icon">🏆</span>
                <span>Best Run</span>
                <strong>${bm}:${bs}</strong>
            </div>
            <div class="surv-stat-chip">
                <span class="surv-stat-chip-icon">📚</span>
                <span>Words Mastered</span>
                <strong>${mastered.toLocaleString()}</strong>
            </div>
        `;
        statsBar.style.display = 'flex';
    } else {
        statsBar.style.display = 'none';
    }

    // ── Characters ──
    const charList = el.querySelector('#surv-char-list');
    charList.innerHTML = Object.values(CHARACTERS).map(c => {
        const isUnlocked = _meta.unlockedChars.includes(c.id);
        const isActive   = selectedChar === c.id;
        return `
            <div class="surv-char-card ${isUnlocked ? (isActive ? 'active' : '') : 'locked'}" data-id="${c.id}">
                <div class="surv-char-icon">${c.icon}</div>
                <div class="surv-char-info">
                    <div class="surv-char-name">${c.name}</div>
                    <div class="surv-char-desc">${c.desc}</div>
                </div>
                ${!isUnlocked
                    ? `<div class="surv-char-cost"><span>👻</span>${c.cost.toLocaleString()}</div>`
                    : (isActive ? '<div class="surv-char-active-badge">✓ Selected</div>' : '')
                }
            </div>
        `;
    }).join('');

    charList.querySelectorAll('.surv-char-card').forEach(card => card.onclick = () => {
        const id = card.dataset.id;
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
            } else { alert('Not enough Souls! Keep playing to earn more.'); }
        }
    });

    // ── Shrine ──
    const shrineUpgrades = [
        { id: 'vitality', name: 'Vitality',  icon: '❤️', desc: '+5% Base HP per rank' },
        { id: 'swiftness', name: 'Swiftness', icon: '💨', desc: '+2% Move Speed per rank' },
        { id: 'power',    name: 'Power',     icon: '⚡', desc: '+5% Damage per rank' },
        { id: 'greed',    name: 'Greed',     icon: '👻', desc: '+5% Soul gain per rank' }
    ];

    const shrineList = el.querySelector('#surv-shrine-list');
    shrineList.innerHTML = shrineUpgrades.map(u => {
        const lvl       = _meta.upgrades[u.id] || 0;
        const max       = 10;
        const cost      = (lvl + 1) * 200;
        const canAfford = _meta.souls >= cost && lvl < max;
        const pips      = Array.from({ length: max }, (_, i) =>
            `<span class="surv-pip${i < lvl ? ' filled' : ''}"></span>`
        ).join('');
        return `
            <div class="surv-shrine-item">
                <div class="surv-shrine-info">
                    <div class="surv-shrine-name">${u.icon} ${u.name}
                        <span class="surv-shrine-rank">Lv.${lvl}/${max}</span>
                    </div>
                    <div class="surv-shrine-desc">${u.desc}</div>
                    <div class="surv-shrine-pips">${pips}</div>
                </div>
                <button class="surv-shrine-buy" data-id="${u.id}" ${!canAfford ? 'disabled' : ''}>
                    ${lvl >= max ? 'MAX' : `${cost} 👻`}
                </button>
            </div>
        `;
    }).join('');

    shrineList.querySelectorAll('.surv-shrine-buy').forEach(b => b.onclick = () => {
        const id   = b.dataset.id;
        const lvl  = _meta.upgrades[id] || 0;
        const cost = (lvl + 1) * 200;
        if (_meta.souls >= cost && lvl < 10) {
            _meta.souls         -= cost;
            _meta.upgrades[id]   = lvl + 1;
            saveMeta();
            showCamp();
        }
    });
}

// ── Run lifecycle ────────────────────────────────────────────────────────────

function startActualRun(queue) {
    _show('game');
    resetGameUI(queue, _meta);
    startRun(selectedChar, _meta.upgrades);
}

function returnToCamp() {
    stop();
    loadMeta(); // reload so soul/stat changes from the run are reflected
    _show('setup');
    showCamp();
}