import { mountVocabSelector } from '../../vocab_selector.js';
import * as srsDb from '../../srs_db.js';
import { initInput } from './surv_input.js';
import { initCanvas, startRun, stop, applyUpgrade, applyHeal, applyPenalty,
         pause, resume, getActiveWeapons, getActivePassives, getElapsedTime, resize as resizeCanvas } from './surv_engine.js';
import { initUI, resetGameUI, drawHUD, incrementKill, showSrsQuiz,
         showChestQuiz, showBossWarning, showGameOver } from './surv_ui.js';
import { CHARACTERS } from './surv_entities.js';
import * as Audio from './surv_audio.js';

let _screens       = null;
let _onExitGlobal  = null;
let _selector      = null;
let _meta          = null;
let _vocabQueue    = [];
let _customDeckActive = false;

// ── CSS injection ─────────────────────────────────────────────────────────────
function _injectStyles() {
    if (document.getElementById('surv-styles')) return;
    const link = document.createElement('link');
    link.id   = 'surv-styles';
    link.rel  = 'stylesheet';
    link.href = './js/games/survivor/survivor.css';
    document.head.appendChild(link);

    // viewport-fit=cover is required for env(safe-area-inset-bottom) to work on iPhone.
    // Update the existing viewport meta if present, otherwise create one.
    let vp = document.querySelector('meta[name="viewport"]');
    if (vp) {
        if (!vp.content.includes('viewport-fit')) {
            vp.content += ', viewport-fit=cover';
        }
    } else {
        vp = document.createElement('meta');
        vp.name    = 'viewport';
        vp.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
        document.head.appendChild(vp);
    }
}

export function init(screens, onExit) {
    _injectStyles();
    _screens      = screens;
    _onExitGlobal = onExit;

    const setupHTML = `
        <div id="surv-deck-selector-wrap" style="display:none;"></div>
        <div id="surv-camp-wrap" style="display:none; max-width:680px; margin:0 auto;">

            <!-- Header -->
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

            <!-- Tabs -->
            <div class="surv-tabs">
                <button class="surv-tab active" data-tab="chars">🥷 Characters</button>
                <button class="surv-tab" data-tab="shrine">⛩️ Shrine</button>
                <button class="surv-tab" data-tab="stats">📊 Statistics</button>
            </div>

            <!-- Tab: Characters -->
            <div class="surv-tab-panel" id="surv-tab-chars">
                <div id="surv-char-list"></div>
            </div>

            <!-- Tab: Shrine -->
            <div class="surv-tab-panel" id="surv-tab-shrine" style="display:none;">
                <div id="surv-shrine-list"></div>
            </div>

            <!-- Tab: Statistics -->
            <div class="surv-tab-panel" id="surv-tab-stats" style="display:none;">
                <div id="surv-stats-content"></div>
            </div>

            <!-- Actions -->
            <div class="surv-camp-actions">
                <button id="surv-btn-start-run" class="surv-start-btn">⚔️ Enter the Forest</button>
                <button id="surv-btn-exit-camp" class="surv-exit-btn">← Exit</button>
            </div>
        </div>
    `;

    _screens.setup.innerHTML = setupHTML;
    // The game screen must be a flex-column so HUD + canvas stack vertically.
    // These styles are applied here directly so the screen is self-contained
    // regardless of how games_ui.js configures the container.
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
        onBossWarning: () => showBossWarning()
    });

    // ✅ initUI MUST come before initInput — initUI writes the joystick HTML
    // into #surv-ui-layer. If initInput runs first, querySelector('#surv-joystick-zone')
    // returns null (element doesn't exist yet) → if(!touchZone) return → no listeners.
    initUI(
        _screens.game.querySelector('#surv-ui-layer'),
        { applyUpgrade, applyHeal, applyPenalty, pause, resume,  // ← pause was missing!
          getActiveWeapons, getActivePassives, getElapsedTime },
        srsDb,
        { saveMeta }
    );

    // initInput runs AFTER initUI so #surv-joystick-zone is guaranteed to be in the DOM
    initInput(_screens.game);
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

// ── Meta ─────────────────────────────────────────────────────────────────────

function loadMeta() {
    const def = {
        souls: 0,
        unlockedChars: ['gamewizard', 'chi'],
        upgrades: {
            // Foundation
            vitality: 0, swiftness: 0, greed: 0, power: 0,
            // Survival
            ironWill: 0, regen: 0,
            // Combat
            haste: 0, magnetism: 0,
            // Mastery
            scholar: 0, ghostStep: 0,
            // Prestige
            ancestralPower: 0, secondWind: 0,
        },
        stats: {
            // Run history
            totalRuns:       0,
            totalWins:       0,
            totalKills:      0,
            totalTimePlayed: 0,
            highestTime:     0,
            highestKills:    0,
            // Vocab
            totalCorrect:    0,
            totalWrong:      0,
            bestStreak:      0,
        }
    };
    try { _meta = JSON.parse(localStorage.getItem('surv_meta')) || def; }
    catch { _meta = def; }
    // Backfill any missing keys from older saves
    _meta.stats = { ...def.stats, ..._meta.stats };
    // Migrate old "totalWordsMastered" → totalCorrect
    if (_meta.stats.totalWordsMastered && !_meta.stats.totalCorrect) {
        _meta.stats.totalCorrect = _meta.stats.totalWordsMastered;
    }
}

function saveMeta() { localStorage.setItem('surv_meta', JSON.stringify(_meta)); }

function _show(name) {
    if (_screens.setup) _screens.setup.style.display = name === 'setup' ? 'block' : 'none';
    if (_screens.game)  _screens.game.style.display  = name === 'game'  ? 'flex'  : 'none';
}

// ── Vocab selector ────────────────────────────────────────────────────────────

function showVocabSelector() {
    const selectorWrap = _screens.setup.querySelector('#surv-deck-selector-wrap');
    const campWrap     = _screens.setup.querySelector('#surv-camp-wrap');
    selectorWrap.style.display = 'block';
    campWrap.style.display     = 'none';

    if (!_selector) {
        _selector = mountVocabSelector(selectorWrap, {
            bannedKey: 'surv_banned', defaultCount: 'All', title: 'Vocabulary Queue'
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

// ── Camp ──────────────────────────────────────────────────────────────────────

let selectedChar = 'gamewizard';
let _activeTab   = 'chars';

function showCamp() {
    const selectorWrap = _screens.setup.querySelector('#surv-deck-selector-wrap');
    const campWrap     = _screens.setup.querySelector('#surv-camp-wrap');
    selectorWrap.style.display = 'none';
    campWrap.style.display     = 'block';

    const el = _screens.setup;
    el.querySelector('#surv-btn-settings').onclick = () => _showSettings();
    el.querySelector('#surv-btn-start-run').onclick   = () => startActualRun(_vocabQueue);
    el.querySelector('#surv-btn-exit-camp').onclick   = _onExitGlobal;
    el.querySelector('#surv-soul-count').textContent  = _meta.souls.toLocaleString();

    // ── Tabs ──
    el.querySelectorAll('.surv-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === _activeTab);
        tab.onclick = () => {
            _activeTab = tab.dataset.tab;
            showCamp();
        };
    });
    el.querySelector('#surv-tab-chars').style.display   = _activeTab === 'chars'  ? 'block' : 'none';
    el.querySelector('#surv-tab-shrine').style.display  = _activeTab === 'shrine' ? 'block' : 'none';
    el.querySelector('#surv-tab-stats').style.display   = _activeTab === 'stats'  ? 'block' : 'none';

    if (_activeTab === 'chars')  _renderCharacters(el);
    if (_activeTab === 'shrine') _renderShrine(el);
    if (_activeTab === 'stats')  _renderStatistics(el);
}

// ── Characters tab ────────────────────────────────────────────────────────────

function _renderCharacters(el) {
    const charList = el.querySelector('#surv-char-list');
    charList.innerHTML = Object.values(CHARACTERS).map(c => {
        const isUnlocked = _meta.unlockedChars.includes(c.id);
        const isActive   = selectedChar === c.id;

        // Build stat tags from character stats object
        const statTags = Object.entries(c.stats).map(([k, v]) => {
            const pct = Math.round(v * 100);
            const label = {
                moveSpeedMult: 'Speed',
                soulMult:      'Souls',
                cooldownMult:  'Cooldown',
                damageMult:    'Damage',
                magnetMult:    'Magnet',
                hpMult:        'Max HP',
                armor:         'Armor'
            }[k] || k;
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

// ── Shrine tab ────────────────────────────────────────────────────────────────

// Shrine upgrade definitions — grouped by tier.
// Each entry: id (matches _meta.upgrades key), name, icon, desc,
//             max (cap), costPerRank (multiplier), group label.
const SHRINE_UPGRADES = [
    {
        group: 'Foundation', groupIcon: '🏯',
        groupDesc: 'Core stats that benefit every character equally.',
        items: [
            { id: 'vitality',  name: 'Vitality',   icon: '❤️',  max: 10, costMult: 200, desc: '+5% Base HP per rank.' },
            { id: 'swiftness', name: 'Swiftness',  icon: '💨',  max: 10, costMult: 200, desc: '+2% Move Speed per rank.' },
            { id: 'power',     name: 'Power',       icon: '⚡',  max: 10, costMult: 200, desc: '+5% Damage per rank.' },
            { id: 'greed',     name: 'Greed',       icon: '👻',  max: 10, costMult: 200, desc: '+5% Soul gain per rank.' },
        ]
    },
    {
        group: 'Survival', groupIcon: '🛡️',
        groupDesc: 'Reduce incoming damage and outlast longer waves.',
        items: [
            { id: 'ironWill',  name: 'Iron Will',    icon: '🛡️', max: 10, costMult: 250, desc: '+3 flat Armor per rank. Reduces enemy damage directly.' },
            { id: 'regen',     name: 'Regeneration', icon: '💚',  max: 10, costMult: 300, desc: '+0.08% Max HP restored per second per rank.' },
        ]
    },
    {
        group: 'Combat', groupIcon: '⚔️',
        groupDesc: 'Attack faster and collect loot more efficiently.',
        items: [
            { id: 'haste',     name: 'Haste',        icon: '⏱️',  max: 10, costMult: 250, desc: '-3% Weapon Cooldowns per rank. Stacks with in-run cooldown passives.' },
            { id: 'magnetism', name: 'Magnetism',     icon: '🧲',  max: 10, costMult: 200, desc: '+20% Pickup Radius per rank. XP gems fly to you from further away.' },
        ]
    },
    {
        group: 'Mastery', groupIcon: '📖',
        groupDesc: 'Accelerate your in-run growth and punish damage windows.',
        items: [
            { id: 'scholar',   name: 'Scholar',      icon: '📖',  max: 10, costMult: 300, desc: '+8% XP from kills per rank. Reach higher levels and more upgrades.' },
            { id: 'ghostStep', name: 'Ghost Step',    icon: '👣',  max:  5, costMult: 600, desc: '+0.2s Invincibility after being hit per rank (base: 0.5s).' },
        ]
    },
    {
        group: 'Prestige', groupIcon: '✨',
        groupDesc: 'Powerful one-time boons. Very expensive — plan carefully.',
        items: [
            { id: 'ancestralPower', name: 'Ancestral Power', icon: '🌟', max: 5, costMult: 1500,
              desc: 'Start each run at level (1 + rank). Rank 5 = begin at level 6 with 5 free upgrades already chosen.' },
            { id: 'secondWind',     name: 'Second Wind',      icon: '🔱', max: 1, costMult: 5000,
              desc: 'Once per run, a fatal blow leaves you at 1 HP instead of killing you. "SECOND WIND!" flashes on screen.' },
        ]
    },
];

function _renderShrine(el) {
    const shrineList = el.querySelector('#surv-shrine-list');
    shrineList.innerHTML = SHRINE_UPGRADES.map(group => {
        const itemsHtml = group.items.map(u => {
            const lvl       = _meta.upgrades[u.id] || 0;
            const cost      = (lvl + 1) * u.costMult;
            const canAfford = _meta.souls >= cost && lvl < u.max;
            const pips      = Array.from({ length: u.max }, (_, i) =>
                `<span class="surv-pip${i < lvl ? ' filled' : ''}"></span>`
            ).join('');
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
            el.querySelector('#surv-soul-count').textContent = _meta.souls.toLocaleString();
            _renderShrine(el);
        }
    });
}

// ── Statistics tab ────────────────────────────────────────────────────────────
// ── Statistics tab ────────────────────────────────────────────────────────────

function _renderStatistics(el) {
    const st  = _meta.stats;
    const container = el.querySelector('#surv-stats-content');

    const totalAnswers = (st.totalCorrect || 0) + (st.totalWrong || 0);
    const accuracy     = totalAnswers > 0
        ? Math.round(((st.totalCorrect || 0) / totalAnswers) * 100)
        : 0;

    // Format seconds → mm:ss
    const fmtTime = (secs) => {
        if (!secs) return '—';
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // Format total playtime as "Xh Ym" or "Ym Zs"
    const fmtTotal = (secs) => {
        if (!secs) return '—';
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    };

    const hasAnyData = (st.totalRuns || 0) > 0;

    if (!hasAnyData) {
        container.innerHTML = `
            <div class="surv-stats-empty">
                <div class="surv-stats-empty-icon">📊</div>
                <div class="surv-stats-empty-msg">No runs yet — enter the forest to start tracking!</div>
            </div>
        `;
        return;
    }

    const winRate = (st.totalRuns || 0) > 0
        ? Math.round(((st.totalWins || 0) / st.totalRuns) * 100)
        : 0;

    container.innerHTML = `
        <div class="surv-stats-grid">

            <div class="surv-stats-section">
                <div class="surv-stats-section-title">🗡️ Combat</div>
                <div class="surv-stat-row">
                    <span>Total Runs</span>
                    <strong>${(st.totalRuns || 0).toLocaleString()}</strong>
                </div>
                <div class="surv-stat-row">
                    <span>Victories</span>
                    <strong>${(st.totalWins || 0).toLocaleString()} <small>(${winRate}%)</small></strong>
                </div>
                <div class="surv-stat-row">
                    <span>Total Kills</span>
                    <strong>${(st.totalKills || 0).toLocaleString()}</strong>
                </div>
                <div class="surv-stat-row">
                    <span>Most Kills (run)</span>
                    <strong>${(st.highestKills || 0).toLocaleString()}</strong>
                </div>
            </div>

            <div class="surv-stats-section">
                <div class="surv-stats-section-title">⏱️ Time</div>
                <div class="surv-stat-row">
                    <span>Longest Run</span>
                    <strong>${fmtTime(st.highestTime)}</strong>
                </div>
                <div class="surv-stat-row">
                    <span>Total Played</span>
                    <strong>${fmtTotal(st.totalTimePlayed)}</strong>
                </div>
                <div class="surv-stat-row">
                    <span>Avg Run Length</span>
                    <strong>${fmtTime(Math.round((st.totalTimePlayed || 0) / Math.max(1, st.totalRuns)))}</strong>
                </div>
            </div>

            <div class="surv-stats-section">
                <div class="surv-stats-section-title">📚 Vocabulary</div>
                <div class="surv-stat-row">
                    <span>Correct Answers</span>
                    <strong style="color:#2ecc71">${(st.totalCorrect || 0).toLocaleString()}</strong>
                </div>
                <div class="surv-stat-row">
                    <span>Wrong Answers</span>
                    <strong style="color:#e74c3c">${(st.totalWrong || 0).toLocaleString()}</strong>
                </div>
                <div class="surv-stat-row">
                    <span>Accuracy</span>
                    <strong style="color:${accuracy >= 70 ? '#2ecc71' : accuracy >= 50 ? '#f39c12' : '#e74c3c'}">
                        ${accuracy}%
                    </strong>
                </div>
                <div class="surv-stat-row">
                    <span>Best Answer Streak</span>
                    <strong style="color:#f1c40f">⚡ ${(st.bestStreak || 0).toLocaleString()}</strong>
                </div>
            </div>

            <div class="surv-stats-section">
                <div class="surv-stats-section-title">👻 Souls</div>
                <div class="surv-stat-row">
                    <span>Current Souls</span>
                    <strong style="color:#c39bd3">${(_meta.souls || 0).toLocaleString()}</strong>
                </div>
                <div class="surv-stat-row">
                    <span>Characters Unlocked</span>
                    <strong>${(_meta.unlockedChars || []).length} / ${Object.keys(CHARACTERS).length}</strong>
                </div>
            </div>

        </div>
    `;
}


// ── Settings overlay ──────────────────────────────────────────────────────────

function _showSettings() {
    // Remove any stale overlay
    const stale = _screens.setup.querySelector('#surv-settings-overlay');
    if (stale) stale.remove();

    const overlay = document.createElement('div');
    overlay.id = 'surv-settings-overlay';
    overlay.className = 'surv-settings-overlay';

    const render = () => {
        const muted = Audio.isMuted();

        overlay.innerHTML = `
            <div class="surv-settings-inner">

                <div class="surv-settings-header">
                    <h2 class="surv-settings-title">⚙️ Settings</h2>
                    <button class="surv-settings-close" id="surv-settings-close">✕</button>
                </div>

                <!-- Sound -->
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

                <!-- Vocabulary -->
                <div class="surv-settings-section">
                    <div class="surv-settings-section-label">📚 Vocabulary</div>
                    <div class="surv-settings-row surv-settings-row-btn" id="surv-settings-deck">
                        <div class="surv-settings-row-info">
                            <div class="surv-settings-row-name">Change Word Deck</div>
                            <div class="surv-settings-row-desc">Switch to a specific vocabulary list for quiz questions.</div>
                        </div>
                        <span class="surv-settings-chevron">›</span>
                    </div>
                </div>

                <!-- Danger zone -->
                <div class="surv-settings-section surv-settings-danger-section">
                    <div class="surv-settings-section-label">⚠️ Reset</div>
                    <div class="surv-settings-row surv-settings-row-btn" id="surv-settings-reset-shrine">
                        <div class="surv-settings-row-info">
                            <div class="surv-settings-row-name">Reset Shrine Upgrades</div>
                            <div class="surv-settings-row-desc">Refund all Souls spent in the Shrine. Stats and characters kept.</div>
                        </div>
                        <span class="surv-settings-chevron" style="color:#f39c12;">›</span>
                    </div>
                    <div class="surv-settings-row surv-settings-row-btn" id="surv-settings-reset-all">
                        <div class="surv-settings-row-info">
                            <div class="surv-settings-row-name" style="color:#e74c3c;">Reset All Progress</div>
                            <div class="surv-settings-row-desc">Wipes everything — Souls, characters, upgrades, statistics.</div>
                        </div>
                        <span class="surv-settings-chevron" style="color:#e74c3c;">›</span>
                    </div>
                </div>

            </div>
        `;

        overlay.querySelector('#surv-settings-close').onclick = () => overlay.remove();

        // Sound toggle
        overlay.querySelector('#surv-toggle-sound').onclick = () => {
            Audio.setMuted(!Audio.isMuted());
            render(); // re-render to reflect new state
        };

        // Change deck
        overlay.querySelector('#surv-settings-deck').onclick = () => {
            overlay.remove();
            showVocabSelector();
        };

        // Reset shrine upgrades (refund all souls spent)
        overlay.querySelector('#surv-settings-reset-shrine').onclick = () => {
            if (!confirm('Refund all Shrine upgrades? Your Souls will be returned.')) return;
            // Re-calculate total souls spent and refund them
            const SHRINE_COSTS = {
                vitality: 200, swiftness: 200, greed: 200, power: 200,
                ironWill: 250, regen: 300,
                haste: 250, magnetism: 200,
                scholar: 300, ghostStep: 600,
                ancestralPower: 1500, secondWind: 5000,
            };
            let refund = 0;
            for (const [key, costPerRank] of Object.entries(SHRINE_COSTS)) {
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
            if (!confirm('Reset EVERYTHING? Souls, characters, shrine upgrades, and statistics will all be wiped. This cannot be undone.')) return;
            localStorage.removeItem('surv_meta');
            _meta = null;
            _customDeckActive = false;
            overlay.remove();
            launch(); // restart fresh
        };
    };

    render();
    _screens.setup.querySelector('#surv-camp-wrap').appendChild(overlay);
}

// ── Run lifecycle ─────────────────────────────────────────────────────────────

function startActualRun(queue) {
    _show('game');
    resizeCanvas(); // canvas was 0×0 while screen was display:none
    // isSrsMode = true when using the player's own SRS library (not a custom vocab deck)
    resetGameUI(queue, _meta, !_customDeckActive);
    startRun(selectedChar, _meta.upgrades);
}

function returnToCamp() {
    stop();
    loadMeta();
    _show('setup');
    showCamp();
}