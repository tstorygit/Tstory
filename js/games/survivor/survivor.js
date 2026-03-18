/**
 * survivor.js — Yōkai Survivor: top-level game controller
 *
 * Vocabulary chain: survivor.js → GameVocabManager → srs_db
 *
 * This module never imports srs_db directly. All vocabulary operations,
 * including SRS scheduling, go through the GameVocabManager instance.
 */

import { mountVocabSelector }  from '../../vocab_selector.js';
import { GameVocabManager }    from '../../game_vocab_mgr.js';
import { renderVocabSettings } from '../../game_vocab_mgr_ui.js';
import { initInput }          from './surv_input.js';
import {
    initCanvas, startRun, stop, applyUpgrade, applyHeal, applyPenalty,
    pause, resume, getActiveWeapons, getActivePassives, getElapsedTime,
    resize as resizeCanvas,
} from './surv_engine.js';
import {
    initUI, resetGameUI, drawHUD, incrementKill,
    showSrsQuiz, showChestQuiz, showBossWarning, showGameOver,
} from './surv_ui.js';
import { CHARACTERS }  from './surv_entities.js';
import * as Audio      from './surv_audio.js';

// ─────────────────────────────────────────────────────────────────────────────

let _screens       = null;
let _onExitGlobal  = null;
let _selector      = null;
let _meta          = null;

// Raw vocab arrays (word, furi, trans objects from vocab selector or SRS db)
let _vocabPool     = [];
// 'srs' | 'custom' | 'mixed' — tracks what the current pool contains for display purposes
let _poolSource    = 'srs';

// The single GameVocabManager instance for the entire game session.
// Re-created (or reset) before each run starts.
let _vocabMgr = null;

// ── CSS injection ─────────────────────────────────────────────────────────────

function _injectStyles() {
    if (document.getElementById('surv-styles')) return;
    const link = document.createElement('link');
    link.id   = 'surv-styles';
    link.rel  = 'stylesheet';
    link.href = './js/games/survivor/survivor.css';
    document.head.appendChild(link);

    let vp = document.querySelector('meta[name="viewport"]');
    if (vp) {
        if (!vp.content.includes('viewport-fit')) vp.content += ', viewport-fit=cover';
    } else {
        vp = document.createElement('meta');
        vp.name    = 'viewport';
        vp.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
        document.head.appendChild(vp);
    }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

export function init(screens, onExit) {
    _injectStyles();
    _screens      = screens;
    _onExitGlobal = onExit;

    const setupHTML = `
        <div id="surv-deck-selector-wrap" style="display:none;"></div>
        <div id="surv-camp-wrap" style="display:none; max-width:680px; margin:0 auto;">

            <div class="surv-camp-header">
                <div>
                    <div class="surv-camp-subtitle">Yōkai Survivor</div>
                    <h2 class="surv-camp-title">⛩️ Base Camp</h2>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <div class="surv-soul-display" style="margin-bottom:0; padding:5px 12px;">
                        <span class="surv-soul-icon">👻</span>
                        <span id="surv-soul-count">0</span>
                        <span class="surv-soul-label">Souls</span>
                    </div>
                    <button id="surv-btn-settings" class="surv-settings-btn" title="Settings">⚙️</button>
                </div>
            </div>

            <div class="surv-tabs">
                <button class="surv-tab active" data-tab="chars">🥷 Characters</button>
                <button class="surv-tab" data-tab="shrine">⛩️ Shrine</button>
                <button class="surv-tab" data-tab="stats">📊 Statistics</button>
            </div>

            <div class="surv-tab-panel" id="surv-tab-chars"></div>
            <div class="surv-tab-panel" id="surv-tab-shrine" style="display:none;"></div>
            <div class="surv-tab-panel" id="surv-tab-stats"  style="display:none;"></div>

            <div class="surv-camp-actions">
                <button id="surv-btn-start-run" class="surv-start-btn">⚔️ Enter the Forest</button>
                <button id="surv-btn-exit-camp" class="surv-exit-btn">← Exit</button>
            </div>
        </div>
    `;

    _screens.setup.innerHTML = setupHTML;
    _screens.game.style.cssText += ';display:flex;flex-direction:column;padding:0;overflow:hidden;position:relative;';
    _screens.game.innerHTML = `
        <div class="surv-canvas-wrap">
            <canvas id="surv-canvas"></canvas>
        </div>
        <div id="surv-ui-layer" style="position:absolute;inset:0;pointer-events:none;z-index:10;"></div>
    `;

    initCanvas(_screens.game.querySelector('#surv-canvas'), {
        onLevelUp:     () => showSrsQuiz(),
        onChest:       () => showChestQuiz(),
        onKill:        () => incrementKill(),
        onDraw:        (hp, max, xp, xpN, lvl, t) => drawHUD(hp, max, xp, xpN, lvl, t),
        onGameOver:    (isWin) => showGameOver(isWin, () => returnToCamp()),
        onBossWarning: () => showBossWarning(),
    });

    _screens.game.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    // initUI must come before initInput (writes joystick HTML into DOM)
    initUI(
        _screens.game.querySelector('#surv-ui-layer'),
        { applyUpgrade, applyHeal, applyPenalty, pause, resume,
          getActiveWeapons, getActivePassives, getElapsedTime },
        _getOrCreateVocabMgr(),  // provide initial instance; replaced before each run
        { saveMeta, onLeaveRound: () => returnToCamp() }
    );

    initInput(_screens.game);
}

// ─── VOCAB MANAGER FACTORY ────────────────────────────────────────────────────

/**
 * Returns the current _vocabMgr, creating one if it doesn't exist yet.
 * Config is read from _meta.vocabConfig (persisted in localStorage).
 */
function _getOrCreateVocabMgr() {
    if (_vocabMgr) return _vocabMgr;

    const cfg = _meta?.vocabConfig || _defaultVocabConfig();
    _vocabMgr = new GameVocabManager({
        mode:                  cfg.mode,
        initialInterval:       cfg.initialInterval,
        initialEase:           cfg.initialEase,
        leechThreshold:        cfg.leechThreshold,
        newWordThreshold:      cfg.newWordThreshold,
        newWordBatchBootstrap: cfg.newWordBatchBootstrap,
        newWordBatchNormal:    cfg.newWordBatchNormal,
        autoThresholds: {
            minDueTime:  cfg.minDueTime,
            minAccuracy: cfg.minAccuracy,
        },
    });
    return _vocabMgr;
}

/**
 * (Re-)creates the VocabManager with the current persisted config and
 * loads the current _vocabPool into it.
 * Called at the start of every run so each run gets a fresh scheduling state.
 */
function _buildVocabMgr() {
    const cfg = _meta.vocabConfig || _defaultVocabConfig();

    _vocabMgr = new GameVocabManager({
        mode:                  cfg.mode,
        initialInterval:       cfg.initialInterval,
        initialEase:           cfg.initialEase,
        leechThreshold:        cfg.leechThreshold,
        newWordThreshold:      cfg.newWordThreshold,
        newWordBatchBootstrap: cfg.newWordBatchBootstrap,
        newWordBatchNormal:    cfg.newWordBatchNormal,
        autoThresholds: {
            minDueTime:  cfg.minDueTime,
            minAccuracy: cfg.minAccuracy,
        },
    });

    // Restore any saved session state (local SRS progress from previous runs)
    if (_meta.vocabState) {
        _vocabMgr.importState(_meta.vocabState);
    }

    // Pass globalSrs:true when the pool contains SRS words (source is 'srs' or 'mixed').
    // Pure custom deck words ('custom') use the local SM-2 engine only.
    _vocabMgr.setPool(_vocabPool, 'surv_banned', { globalSrs: _poolSource !== 'custom' });

    // Seed initial words for auto mode only.
    // seedInitialWords() uses newWordBatchBootstrap as its default count — correct
    // since at run start the active pool is always empty (same bootstrap condition).
    if (cfg.mode === 'auto') {
        _vocabMgr.seedInitialWords();  // default count comes from config via seedInitialWords()
    }

    return _vocabMgr;
}

// Delegate to GameVocabManager so there is a single canonical set of defaults.
function _defaultVocabConfig() {
    return GameVocabManager.defaultConfig();
}

// ─── LAUNCH ───────────────────────────────────────────────────────────────────

export function launch() {
    loadMeta();
    _vocabMgr = null; // will be rebuilt before next run

    // If the user has SRS words, default to their deck.
    // Otherwise open the vocab selector first.
    const srsWords = _loadSrsWords();
    if (srsWords.length > 0 && _poolSource !== 'custom') {
        _vocabPool  = srsWords;
        _poolSource = 'srs';
        _show('setup');
        showCamp();
    } else {
        _show('setup');
        showVocabSelector();
    }
}

/**
 * Returns the player's SRS word list as a normalized pool array.
 * Delegates entirely to GameVocabManager.loadSrsPool() so this file
 * never touches raw localStorage keys or SRS field names directly.
 */
function _loadSrsWords() {
    return GameVocabManager.loadSrsPool(); // pass srsDb module here if imported
}

// ─── META ─────────────────────────────────────────────────────────────────────

function loadMeta() {
    const def = {
        souls: 0,
        unlockedChars: ['gamewizard', 'chi'],
        upgrades: {
            vitality: 0, swiftness: 0, greed: 0, power: 0,
            ironWill: 0, regen: 0,
            haste: 0, magnetism: 0,
            scholar: 0, ghostStep: 0,
            ancestralPower: 0, secondWind: 0,
        },
        stats: {
            totalRuns: 0, totalWins: 0, totalKills: 0,
            totalTimePlayed: 0, highestTime: 0, highestKills: 0,
            totalCorrect: 0, totalWrong: 0, bestStreak: 0,
        },
        vocabConfig: _defaultVocabConfig(),
    };
    try { _meta = JSON.parse(localStorage.getItem('surv_meta')) || def; }
    catch { _meta = def; }
    _meta.stats       = { ...def.stats,       ..._meta.stats };
    _meta.vocabConfig = { ...def.vocabConfig,  ..._meta.vocabConfig };

    // Migrate old totalWordsMastered key
    if (_meta.stats.totalWordsMastered && !_meta.stats.totalCorrect) {
        _meta.stats.totalCorrect = _meta.stats.totalWordsMastered;
    }
}

function saveMeta() {
    // Persist local-mode SRS progress so it survives between runs.
    // Global SRS state is managed by srs_db directly, so no export needed there.
    if (_vocabMgr && !_vocabMgr.isGlobalSrs) {
        _meta.vocabState = _vocabMgr.exportState();
    }
    localStorage.setItem('surv_meta', JSON.stringify(_meta));
}

function _show(name) {
    if (_screens.setup) _screens.setup.style.display = name === 'setup' ? 'block' : 'none';
    if (_screens.game)  _screens.game.style.display  = name === 'game'  ? 'flex'  : 'none';
}

// ─── VOCAB SELECTOR ───────────────────────────────────────────────────────────

// Context passed when opening the selector from settings (so back goes to settings, not games)
let _selectorFromSettings = false;

function showVocabSelector(fromSettings = false) {
    _selectorFromSettings = fromSettings;

    const selectorWrap = _screens.setup.querySelector('#surv-deck-selector-wrap');
    const campWrap     = _screens.setup.querySelector('#surv-camp-wrap');
    selectorWrap.style.display = 'block';
    campWrap.style.display     = 'none';

    // Always remount so the selector reflects the latest saved settings
    _selector = null;
    selectorWrap.innerHTML = '';

    _selector = mountVocabSelector(selectorWrap, {
        bannedKey: 'surv_banned', defaultCount: 'All', title: 'Vocabulary Queue',
    });
    const actions = _selector.getActionsEl();

    // ── "Go to Camp" — build pool from selector state ─────────────────────────
    const startBtn = document.createElement('button');
    startBtn.className   = 'surv-start-btn';
    startBtn.textContent = '⛺ Go to Camp';
    startBtn.onclick = async () => {
        const queue = await _selector.getQueue();
        if (!queue.length) return;

        // Separate SRS words (deckId:'srs') from custom deck words
        const srsWords    = queue.filter(w => w.deckId === 'srs');
        const customWords = queue.filter(w => w.deckId !== 'srs');

        if (srsWords.length > 0 && customWords.length > 0) {
            // Mixed: SRS + at least one custom deck
            _poolSource = 'mixed';
            _vocabPool  = queue.map(w => ({
                word:   w.word,
                furi:   w.furi  || w.word,
                trans:  w.trans || '—',
                deckId: w.deckId,   // preserve 'srs' tag so GVM routes correctly
            }));
        } else if (srsWords.length > 0) {
            // SRS only — same as the default SRS path
            _poolSource = 'srs';
            _vocabPool  = srsWords.map(w => ({
                word:   w.word,
                furi:   w.furi  || w.word,
                trans:  w.trans || '—',
                deckId: 'srs',
            }));
        } else {
            // Pure custom deck
            _poolSource = 'custom';
            _vocabPool  = customWords.map(w => ({
                word:   w.word,
                furi:   w.furi  || w.word,
                trans:  w.trans || '—',
                deckId: 'custom',
            }));
        }

        _vocabMgr = null; // force rebuild with new pool
        showCamp();
    };

    // ── Back button — context-aware ───────────────────────────────────────────
    const backBtn = document.createElement('button');
    backBtn.className   = 'caro-back-btn';

    if (fromSettings) {
        // Came from the settings overlay → go back to camp (settings will reopen)
        backBtn.textContent = '← Back to Settings';
        backBtn.onclick = () => {
            showCamp();
            // Re-open settings after a tick so the camp DOM is ready
            setTimeout(() => _showSettings(), 50);
        };
    } else {
        // Came from launch with no SRS words → back goes to games list
        backBtn.textContent = '← Back to Games';
        backBtn.onclick = () => {
            const srsWords = _loadSrsWords();
            if (srsWords.length > 0) {
                // User has SRS words now (maybe added some) — default to SRS
                _poolSource = 'srs';
                _vocabPool  = srsWords;
                _vocabMgr   = null;
                showCamp();
            } else {
                _onExitGlobal();
            }
        };
    }

    actions.append(startBtn, backBtn);
}

// ─── CAMP ─────────────────────────────────────────────────────────────────────

let selectedChar = 'gamewizard';
let _activeTab   = 'chars';

function showCamp() {
    const selectorWrap = _screens.setup.querySelector('#surv-deck-selector-wrap');
    const campWrap     = _screens.setup.querySelector('#surv-camp-wrap');
    selectorWrap.style.display = 'none';
    campWrap.style.display     = 'block';

    const el = _screens.setup;
    el.querySelector('#surv-btn-settings').onclick  = () => _showSettings();
    el.querySelector('#surv-btn-start-run').onclick = () => startActualRun();
    el.querySelector('#surv-btn-exit-camp').onclick = _onExitGlobal;
    el.querySelector('#surv-soul-count').textContent = _meta.souls.toLocaleString();

    el.querySelectorAll('.surv-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === _activeTab);
        tab.onclick = () => { _activeTab = tab.dataset.tab; showCamp(); };
    });
    el.querySelector('#surv-tab-chars').style.display  = _activeTab === 'chars'  ? 'block' : 'none';
    el.querySelector('#surv-tab-shrine').style.display = _activeTab === 'shrine' ? 'block' : 'none';
    el.querySelector('#surv-tab-stats').style.display  = _activeTab === 'stats'  ? 'block' : 'none';

    if (_activeTab === 'chars')  _renderCharacters(el);
    if (_activeTab === 'shrine') _renderShrine(el);
    if (_activeTab === 'stats')  _renderStatistics(el);
}

// ─── CHARACTERS ───────────────────────────────────────────────────────────────

function _renderCharacters(el) {
    const charList = el.querySelector('#surv-tab-chars');
    charList.innerHTML = Object.values(CHARACTERS).map(c => {
        const isUnlocked = _meta.unlockedChars.includes(c.id);
        const isActive   = selectedChar === c.id;

        const statTags = Object.entries(c.stats).map(([k, v]) => {
            const pct   = Math.round(v * 100);
            const label = { moveSpeedMult: 'Speed', soulMult: 'Souls', cooldownMult: 'Cooldown',
                            damageMult: 'Damage', magnetMult: 'Magnet', hpMult: 'Max HP', armor: 'Armor' }[k] || k;
            const isFlat   = k === 'armor';
            const positive = v >= 0;
            const display  = isFlat ? `${v > 0 ? '+' : ''}${v}` : `${pct > 0 ? '+' : ''}${pct}%`;
            return `<span class="surv-char-stat-tag ${positive ? 'pos' : 'neg'}">${display} ${label}</span>`;
        }).join('');

        return `
            <div class="surv-char-card ${isUnlocked ? (isActive ? 'active' : '') : 'locked'}" data-id="${c.id}">
                <div class="surv-char-icon">${c.icon}</div>
                <div class="surv-char-info">
                    <div class="surv-char-name">${c.name}</div>
                    <div class="surv-char-flavour">${c.flavour}</div>
                    <div class="surv-char-stat-tags">${statTags}</div>
                </div>
                <div class="surv-char-right">
                    ${!isUnlocked
                        ? `<div class="surv-char-cost"><span>👻</span>${c.cost.toLocaleString()}</div>`
                        : (isActive ? '<div class="surv-char-active-badge">✓ Selected</div>' : '')
                    }
                </div>
            </div>
        `;
    }).join('');

    charList.querySelectorAll('.surv-char-card').forEach(card => card.onclick = () => {
        const id = card.dataset.id;
        if (_meta.unlockedChars.includes(id)) {
            selectedChar = id;
            _renderCharacters(el);
        } else {
            const cost = CHARACTERS[id].cost;
            if (_meta.souls >= cost) {
                if (confirm(`Unlock ${CHARACTERS[id].name} for ${cost.toLocaleString()} Souls?`)) {
                    _meta.souls -= cost;
                    _meta.unlockedChars.push(id);
                    selectedChar = id;
                    saveMeta();
                    el.querySelector('#surv-soul-count').textContent = _meta.souls.toLocaleString();
                    _renderCharacters(el);
                }
            } else { alert('Not enough Souls! Keep playing to earn more.'); }
        }
    });
}

// ─── SHRINE ───────────────────────────────────────────────────────────────────

const SHRINE_UPGRADES = [
    {
        group: 'Foundation', groupIcon: '🏯',
        groupDesc: 'Core stats that benefit every character equally.',
        items: [
            { id: 'vitality',  name: 'Vitality',   icon: '❤️',  max: 10, costMult: 200, desc: '+5% Base HP per rank.' },
            { id: 'swiftness', name: 'Swiftness',  icon: '💨',  max: 10, costMult: 200, desc: '+2% Move Speed per rank.' },
            { id: 'power',     name: 'Power',       icon: '⚡',  max: 10, costMult: 200, desc: '+5% Damage per rank.' },
            { id: 'greed',     name: 'Greed',       icon: '👻',  max: 10, costMult: 200, desc: '+5% Soul gain per rank.' },
        ],
    },
    {
        group: 'Survival', groupIcon: '🛡️',
        groupDesc: 'Reduce incoming damage and outlast longer waves.',
        items: [
            { id: 'ironWill', name: 'Iron Will',    icon: '🛡️', max: 10, costMult: 250, desc: '+3 flat Armor per rank.' },
            { id: 'regen',    name: 'Regeneration', icon: '💚',  max: 10, costMult: 300, desc: '+0.08% Max HP/s per rank.' },
        ],
    },
    {
        group: 'Combat', groupIcon: '⚔️',
        groupDesc: 'Attack faster and collect loot more efficiently.',
        items: [
            { id: 'haste',     name: 'Haste',     icon: '⏱️', max: 10, costMult: 250, desc: '-3% Weapon Cooldowns per rank.' },
            { id: 'magnetism', name: 'Magnetism', icon: '🧲', max: 10, costMult: 200, desc: '+20% Pickup Radius per rank.' },
        ],
    },
    {
        group: 'Mastery', groupIcon: '📖',
        groupDesc: 'Accelerate in-run growth and punish damage windows.',
        items: [
            { id: 'scholar',   name: 'Scholar',    icon: '📖', max: 10, costMult: 300, desc: '+8% XP from kills per rank.' },
            { id: 'ghostStep', name: 'Ghost Step', icon: '👣', max:  5, costMult: 600, desc: '+0.2s Invincibility after being hit per rank.' },
        ],
    },
    {
        group: 'Prestige', groupIcon: '✨',
        groupDesc: 'Powerful one-time boons. Very expensive.',
        items: [
            { id: 'ancestralPower', name: 'Ancestral Power', icon: '🌟', max: 5, costMult: 1500,
              desc: 'Start each run at level (1+rank). Rank 5 = begin at level 6.' },
            { id: 'secondWind', name: 'Second Wind', icon: '🔱', max: 1, costMult: 5000,
              desc: 'Once per run, a fatal blow leaves you at 1 HP instead.' },
        ],
    },
];

function _renderShrine(el) {
    const shrineList = el.querySelector('#surv-tab-shrine');
    shrineList.innerHTML = SHRINE_UPGRADES.map(group => {
        const itemsHtml = group.items.map(u => {
            const lvl       = _meta.upgrades[u.id] || 0;
            const cost      = (lvl + 1) * u.costMult;
            const canAfford = _meta.souls >= cost && lvl < u.max;
            const pips      = Array.from({ length: u.max }, (_, i) =>
                `<span class="surv-pip${i < lvl ? ' filled' : ''}"></span>`).join('');
            const maxLabel  = u.max === 1 ? 'ONCE' : `${u.max}`;
            return `
                <div class="surv-shrine-item">
                    <div class="surv-shrine-info">
                        <div class="surv-shrine-name">${u.icon} ${u.name}
                            <span class="surv-shrine-rank">Lv.${lvl}/${maxLabel}</span>
                        </div>
                        <div class="surv-shrine-desc">${u.desc}</div>
                        <div class="surv-shrine-pips">${pips}</div>
                    </div>
                    <button class="surv-shrine-buy${u.costMult >= 1500 ? ' prestige' : ''}"
                            data-id="${u.id}" data-cost="${cost}" data-max="${u.max}"
                            ${!canAfford ? 'disabled' : ''}>
                        ${lvl >= u.max ? 'MAX' : `${cost.toLocaleString()} 👻`}
                    </button>
                </div>
            `;
        }).join('');

        return `
            <div class="surv-shrine-group">
                <div class="surv-shrine-group-header">
                    <span class="surv-shrine-group-icon">${group.groupIcon}</span>
                    <div>
                        <div class="surv-shrine-group-name">${group.group}</div>
                        <div class="surv-shrine-group-desc">${group.groupDesc}</div>
                    </div>
                </div>
                ${itemsHtml}
            </div>
        `;
    }).join('');

    shrineList.querySelectorAll('.surv-shrine-buy').forEach(b => b.onclick = () => {
        const id   = b.dataset.id;
        const max  = parseInt(b.dataset.max);
        const lvl  = _meta.upgrades[id] || 0;
        const def  = SHRINE_UPGRADES.flatMap(g => g.items).find(u => u.id === id);
        const cost = (lvl + 1) * (def?.costMult || 200);
        if (_meta.souls >= cost && lvl < max) {
            _meta.souls        -= cost;
            _meta.upgrades[id]  = lvl + 1;
            saveMeta();
            _screens.setup.querySelector('#surv-soul-count').textContent = _meta.souls.toLocaleString();
            _renderShrine(_screens.setup);
        }
    });
}

// ─── STATISTICS ───────────────────────────────────────────────────────────────

function _renderStatistics(el) {
    const st        = _meta.stats;
    const container = el.querySelector('#surv-tab-stats');

    const totalAnswers = (st.totalCorrect || 0) + (st.totalWrong || 0);
    const accuracy     = totalAnswers > 0
        ? Math.round(((st.totalCorrect || 0) / totalAnswers) * 100) : 0;

    const fmtTime = (secs) => {
        if (!secs) return '—';
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };
    const fmtTotal = (secs) => {
        if (!secs) return '—';
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    };

    if (!(st.totalRuns || 0)) {
        container.innerHTML = `
            <div class="surv-stats-empty">
                <div class="surv-stats-empty-icon">📊</div>
                <div class="surv-stats-empty-msg">No runs yet — enter the forest to start tracking!</div>
            </div>`;
        return;
    }

    const winRate = Math.round(((st.totalWins || 0) / st.totalRuns) * 100);

    container.innerHTML = `
        <div class="surv-stats-grid">
            <div class="surv-stats-section">
                <div class="surv-stats-section-title">🗡️ Combat</div>
                <div class="surv-stat-row"><span>Total Runs</span><strong>${(st.totalRuns||0).toLocaleString()}</strong></div>
                <div class="surv-stat-row"><span>Victories</span><strong>${(st.totalWins||0).toLocaleString()} <small>(${winRate}%)</small></strong></div>
                <div class="surv-stat-row"><span>Total Kills</span><strong>${(st.totalKills||0).toLocaleString()}</strong></div>
                <div class="surv-stat-row"><span>Most Kills (run)</span><strong>${(st.highestKills||0).toLocaleString()}</strong></div>
            </div>
            <div class="surv-stats-section">
                <div class="surv-stats-section-title">⏱️ Time</div>
                <div class="surv-stat-row"><span>Longest Run</span><strong>${fmtTime(st.highestTime)}</strong></div>
                <div class="surv-stat-row"><span>Total Played</span><strong>${fmtTotal(st.totalTimePlayed)}</strong></div>
                <div class="surv-stat-row"><span>Avg Run Length</span><strong>${fmtTime(Math.round((st.totalTimePlayed||0)/Math.max(1,st.totalRuns)))}</strong></div>
            </div>
            <div class="surv-stats-section">
                <div class="surv-stats-section-title">📚 Vocabulary</div>
                <div class="surv-stat-row"><span>Correct Answers</span><strong style="color:#2ecc71">${(st.totalCorrect||0).toLocaleString()}</strong></div>
                <div class="surv-stat-row"><span>Wrong Answers</span><strong style="color:#e74c3c">${(st.totalWrong||0).toLocaleString()}</strong></div>
                <div class="surv-stat-row"><span>Accuracy</span><strong style="color:${accuracy>=70?'#2ecc71':accuracy>=50?'#f39c12':'#e74c3c'}">${accuracy}%</strong></div>
                <div class="surv-stat-row"><span>Best Streak</span><strong style="color:#f1c40f">⚡ ${(st.bestStreak||0).toLocaleString()}</strong></div>
            </div>
            <div class="surv-stats-section">
                <div class="surv-stats-section-title">👻 Souls</div>
                <div class="surv-stat-row"><span>Current Souls</span><strong style="color:#c39bd3">${(_meta.souls||0).toLocaleString()}</strong></div>
                <div class="surv-stat-row"><span>Characters Unlocked</span><strong>${(_meta.unlockedChars||[]).length} / ${Object.keys(CHARACTERS).length}</strong></div>
            </div>
        </div>
    `;
}

// ─── SETTINGS OVERLAY ─────────────────────────────────────────────────────────

function _showSettings() {
    const stale = _screens.setup.querySelector('#surv-settings-overlay');
    if (stale) stale.remove();

    const overlay = document.createElement('div');
    overlay.id        = 'surv-settings-overlay';
    overlay.className = 'surv-settings-overlay';

    const render = () => {
        const muted = Audio.isMuted();
        const cfg   = _meta.vocabConfig;

        const sourceLabel = {
            srs:    'Your SRS library',
            custom: 'Custom deck',
            mixed:  'SRS + Custom deck',
        }[_poolSource] || 'Your SRS library';

        overlay.innerHTML = `
            <div class="surv-settings-inner">

                <div class="surv-settings-header">
                    <h2 class="surv-settings-title">⚙️ Settings</h2>
                    <button class="surv-settings-close" id="surv-settings-close">✕</button>
                </div>

                <!-- Audio -->
                <div class="surv-settings-section">
                    <div class="surv-settings-section-label">🔊 Audio</div>
                    <div class="surv-settings-row">
                        <div class="surv-settings-row-info">
                            <div class="surv-settings-row-name">Sound Effects</div>
                            <div class="surv-settings-row-desc">Hit feedback, quiz chimes, level-up fanfare.</div>
                        </div>
                        <button class="surv-toggle ${muted ? '' : 'on'}" id="surv-toggle-sound">
                            <span class="surv-toggle-knob"></span>
                        </button>
                    </div>
                </div>

                <!-- Vocabulary source -->
                <div class="surv-settings-section">
                    <div class="surv-settings-section-label">📚 Vocabulary Source</div>
                    <div class="surv-settings-row surv-settings-row-btn" id="surv-settings-deck">
                        <div class="surv-settings-row-info">
                            <div class="surv-settings-row-name">Change Word Deck</div>
                            <div class="surv-settings-row-desc">
                                Currently: <strong>${sourceLabel}</strong>
                                (${_vocabPool.length} words)
                            </div>
                        </div>
                        <span class="surv-settings-chevron">›</span>
                    </div>
                </div>

                <!-- Vocabulary learning mode — rendered by game_vocab_mgr_ui -->
                <div class="surv-settings-section">
                    <div class="surv-settings-section-label">🧠 Vocabulary Mode</div>
                    <div id="surv-vocab-settings-mount"></div>
                </div>

                <!-- Danger zone -->
                <div class="surv-settings-section surv-settings-danger-section">
                    <div class="surv-settings-section-label">⚠️ Reset</div>
                    <div class="surv-settings-row surv-settings-row-btn" id="surv-settings-reset-shrine">
                        <div class="surv-settings-row-info">
                            <div class="surv-settings-row-name">Reset Shrine Upgrades</div>
                            <div class="surv-settings-row-desc">Refund all Souls spent in the Shrine.</div>
                        </div>
                        <span class="surv-settings-chevron" style="color:#f39c12;">›</span>
                    </div>
                    <div class="surv-settings-row surv-settings-row-btn" id="surv-settings-reset-all">
                        <div class="surv-settings-row-info">
                            <div class="surv-settings-row-name" style="color:#e74c3c;">Reset All Progress</div>
                            <div class="surv-settings-row-desc">Wipes Souls, characters, upgrades, statistics.</div>
                        </div>
                        <span class="surv-settings-chevron" style="color:#e74c3c;">›</span>
                    </div>
                </div>

            </div>
        `;

        // ── event listeners ──────────────────────────────────────────────────

        overlay.querySelector('#surv-settings-close').onclick = () => overlay.remove();

        overlay.querySelector('#surv-toggle-sound').onclick = () => {
            Audio.setMuted(!Audio.isMuted());
            render();
        };

        overlay.querySelector('#surv-settings-deck').onclick = () => {
            overlay.remove();
            showVocabSelector(true); // fromSettings=true → back button returns here
        };

        // Vocab settings panel — delegated entirely to game_vocab_mgr_ui.
        // renderVocabSettings reads/writes vocabMgr.config directly and calls
        // onSave when the player hits "Save Settings".
        renderVocabSettings(
            _getOrCreateVocabMgr(),
            overlay.querySelector('#surv-vocab-settings-mount'),
            () => {
                // Mirror updated config back into _meta so it persists across sessions.
                const c = _getOrCreateVocabMgr().config;
                _meta.vocabConfig.mode                  = c.mode;
                _meta.vocabConfig.newWordThreshold      = c.newWordThreshold;
                _meta.vocabConfig.newWordBatchBootstrap = c.newWordBatchBootstrap;
                _meta.vocabConfig.newWordBatchNormal    = c.newWordBatchNormal;
                _meta.vocabConfig.minDueTime            = c.autoThresholds.minDueTime;
                _meta.vocabConfig.minAccuracy           = c.autoThresholds.minAccuracy;
                _meta.vocabConfig.leechThreshold        = c.leechThreshold;
                _meta.vocabConfig.initialInterval       = c.initialInterval;
                _meta.vocabConfig.initialEase           = c.initialEase;
                saveMeta();
                _vocabMgr = null;
            }
        );

        // Reset shrine
        overlay.querySelector('#surv-settings-reset-shrine').onclick = () => {
            if (!confirm('Refund all Shrine upgrades? Your Souls will be returned.')) return;
            const COSTS = { vitality:200, swiftness:200, greed:200, power:200,
                            ironWill:250, regen:300, haste:250, magnetism:200,
                            scholar:300, ghostStep:600, ancestralPower:1500, secondWind:5000 };
            let refund = 0;
            for (const [key, costPerRank] of Object.entries(COSTS)) {
                const lvl = _meta.upgrades[key] || 0;
                for (let r = 1; r <= lvl; r++) refund += r * costPerRank;
                _meta.upgrades[key] = 0;
            }
            _meta.souls += refund;
            saveMeta();
            overlay.remove();
            showCamp();
        };

        // Reset all
        overlay.querySelector('#surv-settings-reset-all').onclick = () => {
            if (!confirm('Reset EVERYTHING? Souls, characters, shrine upgrades, statistics — all wiped.')) return;
            localStorage.removeItem('surv_meta');
            _meta       = null;
            _poolSource = 'srs';
            _vocabMgr   = null;
            overlay.remove();
            launch();
        };
    };

    render();
    _screens.setup.querySelector('#surv-camp-wrap').appendChild(overlay);
}

// ─── RUN LIFECYCLE ────────────────────────────────────────────────────────────

function startActualRun() {
    if (!_vocabPool.length) {
        alert('No vocabulary loaded! Please select a word deck first.');
        return;
    }

    // Build (or re-build) the VocabManager for this run
    _buildVocabMgr();

    _show('game');
    resizeCanvas();

    // Pass the freshly built manager to the UI
    resetGameUI(_vocabMgr, _meta);
    startRun(selectedChar, _meta.upgrades);
}

function returnToCamp() {
    stop();

    // Save local SRS progress and export to app SRS before discarding the manager.
    // exportToAppSrs(null) uses GameVocabManager's built-in localStorage fallback —
    // no adapter function needed here any more.
    if (_vocabMgr) {
        if (!_vocabMgr.isGlobalSrs) {
            _meta.vocabState = _vocabMgr.exportState();
            _vocabMgr.exportToAppSrs(null, 'skip');
        }
        saveMeta();
        _vocabMgr = null;
    }

    loadMeta();
    _show('setup');
    showCamp();
}