import { mountVocabSelector } from '../../vocab_selector.js';
import { loadMeta, saveMeta, addXP, SKILL_DEFS } from './vc_meta.js';
import { generateMap, getWaypoints } from './vc_mapgen.js';
import { setVocabQueue, showCard } from './vc_vocab.js';
import { VcEngine } from './vc_engine.js';
import { VcUI } from './vc_ui.js';

let _screens = null;
let _onExit = null;
let _selector = null;
let _meta = null;
let _engine = null;
let _activeTier = 1;

const BANNED_KEY = 'vocabcraft_banned';

export function init(screens, onExit) {
    _screens = screens;
    _onExit = onExit;
    
    if (_screens.game) {
        _screens.game.innerHTML = `
            <div id="vc-camp-layer" class="vc-camp-screen" style="display:none;">
                <div class="vc-camp-header">
                    <div>
                        <div class="vc-camp-title">Wizard's Camp</div>
                        <div class="vc-camp-xp" id="vc-camp-lvl">Lv. 1 (XP: 0/1000)</div>
                    </div>
                    <div>
                        <button class="vc-btn" id="vc-btn-grimoire" style="background:#f39c12; border-color:#d35400;">📖 Grimoire</button>
                    </div>
                </div>
                <div class="vc-stage-list" id="vc-stage-list"></div>
                
                <div class="vc-grimoire-overlay" id="vc-grimoire-overlay" style="display:none;">
                    <div class="vc-grimoire-header">
                        <div class="vc-camp-title">The Grimoire</div>
                        <div class="vc-grimoire-sp" id="vc-grimoire-sp">SP: 0</div>
                    </div>
                    <div class="vc-skill-list" id="vc-skill-list"></div>
                    <button class="vc-btn" id="vc-btn-close-grimoire" style="margin-top:15px; padding:15px;">Close Grimoire</button>
                </div>
            </div>

            <div id="vc-battle-layer" class="vc-root" style="display:none; position:absolute; inset:0;">
                <div class="vc-topbar vc-topbar-row1">
                    <span class="vc-health">❤️ <span id="vc-val-hp">20</span></span>
                    <span class="vc-mana">💧 <span id="vc-val-mana">150</span></span>
                    <div style="flex:1;"></div>
                    <button class="vc-icon-btn vc-grimoire-btn" id="vc-btn-grimoire-battle">📖</button>
                    <button class="vc-icon-btn" id="vc-btn-speed">⚡1x</button>
                    <button class="vc-icon-btn vc-flee-btn" id="vc-btn-surrender">🏃Flee</button>
                </div>
                <div class="vc-topbar vc-topbar-row2">
                    <div class="vc-wave-tracker"></div>
                </div>
                <div class="vc-map-container"><div class="vc-grid"></div></div>
                <div class="vc-bottombar"></div>
                <div class="vc-vocab-overlay">
                    <div class="vc-vocab-header"></div>
                    <div class="vc-vocab-grid"></div>
                </div>
            </div>
        `;

        _screens.game.querySelector('#vc-btn-grimoire').onclick = () => {
            _renderGrimoire();
            _screens.game.querySelector('#vc-grimoire-overlay').style.display = 'flex';
        };
        _screens.game.querySelector('#vc-btn-grimoire-battle').onclick = () => {
            _renderGrimoire();
            _screens.game.querySelector('#vc-grimoire-overlay').style.display = 'flex';
        };
        _screens.game.querySelector('#vc-btn-close-grimoire').onclick = () => {
            _screens.game.querySelector('#vc-grimoire-overlay').style.display = 'none';
        };
        
        // Speed: cycle 1x → 2x → 3x → 5x → back to 1x
        const SPEED_STEPS = [1, 2, 3, 5];
        _screens.game.querySelector('#vc-btn-speed').onclick = () => {
            if (!_engine) return;
            const idx = SPEED_STEPS.indexOf(_engine.speedMult);
            _engine.speedMult = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length];
            _screens.game.querySelector('#vc-btn-speed').textContent = `⚡${_engine.speedMult}x`;
        };

        // Surrender button — pause BEFORE confirmation dialog
        _screens.game.querySelector('#vc-btn-surrender').onclick = () => {
            if (_engine) _engine.pause(); 
            if (confirm("Flee the battle? You will lose any XP gained in this map.")) {
                if (_engine) _engine.stop();
                _showCamp();
            } else {
                if (_engine) _engine.resume();
            }
        };
    }
}

export function launch() {
    _injectStyles();
    _meta = loadMeta();
    _show('setup');
    _renderSetup();
}

function _show(name) {
    Object.entries(_screens).forEach(([k, el]) => {
        if (!el) return;
        if (k === name) {
            el.style.display = 'flex';
            el.style.minHeight = '0';
            if (k === 'game') {
                el.style.flexDirection = 'column';
                el.style.padding = '0';
                el.style.overflow = 'hidden';
                el.style.position = 'relative';
                // Remove any scroll styles set by games_ui.js
                el.style.overflowY = 'hidden';
            } else {
                el.style.flexDirection = 'column';
                el.style.overflowY = 'auto';
                el.style.paddingBottom = '70px';
                el.style.webkitOverflowScrolling = 'touch';
            }
        } else {
            el.style.display = 'none';
        }
    });
    const hdr = document.getElementById('games-header-title');
    if (hdr) hdr.textContent = name === 'setup' ? 'VocabCraft - Setup' : 'VocabCraft';
}

function _renderSetup() {
    const el = _screens.setup;
    if (!el) return;

    _selector = mountVocabSelector(el, {
        bannedKey: BANNED_KEY,
        defaultCount: 40,
        title: `VocabCraft - Select Vocabulary`
    });

    const actions = _selector.getActionsEl();

    const startBtn = document.createElement('button');
    startBtn.className = 'primary-btn';
    startBtn.style.marginTop = '8px';
    startBtn.style.background = '#2ecc71';
    startBtn.textContent = '⛺ Enter Camp';
    startBtn.addEventListener('click', async () => {
        const queue = await _selector.getQueue();
        if (!queue.length) return;
        setVocabQueue(queue);
        _show('game');
        _showCamp();
    });

    const backBtn = document.createElement('button');
    backBtn.className = 'caro-back-btn';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', _onExit);

    actions.append(startBtn, backBtn);
}

function _showCamp() {
    _screens.game.querySelector('#vc-battle-layer').style.display = 'none';
    _screens.game.querySelector('#vc-camp-layer').style.display = 'flex';
    
    const lvlText = `Lv. ${_meta.level} (XP: ${_meta.xp}/${_meta.level * 1000})`;
    _screens.game.querySelector('#vc-camp-lvl').textContent = lvlText;

    const list = _screens.game.querySelector('#vc-stage-list');
    list.innerHTML = '';

    const maxVisibleTier = _meta.highestTierCleared + 1;
    
    for (let t = 1; t <= maxVisibleTier; t++) {
        const isLocked = t > _meta.highestTierCleared + 1;
        const isCleared = t <= _meta.highestTierCleared;

        const card = document.createElement('div');
        card.className = `vc-stage-card ${isLocked ? 'locked' : ''}`;
        if (isCleared) card.style.borderColor = '#27ae60';

        card.innerHTML = `
            <div class="vc-stage-info">
                <h3>Sector ${t}</h3>
                <p>Waves: ${5 + (t * 2)} | Difficulty: ${isCleared ? 'Cleared' : 'Hostile'}</p>
            </div>
            <div style="font-size: 24px;">${isLocked ? '🔒' : isCleared ? '✅' : '▶️'}</div>
        `;

        if (!isLocked) {
            card.onclick = () => _startBattle(t);
        }

        list.appendChild(card);
    }
}

function _renderGrimoire() {
    _screens.game.querySelector('#vc-grimoire-sp').textContent = `SP: ${_meta.sp}`;
    
    const list = _screens.game.querySelector('#vc-skill-list');
    list.innerHTML = '';

    Object.entries(SKILL_DEFS).forEach(([key, def]) => {
        const currentLvl = _meta.skills[key] || 0;
        const isMax = currentLvl >= def.max;
        const canAfford = _meta.sp > 0 && !isMax;

        const row = document.createElement('div');
        row.className = 'vc-skill-row';
        row.innerHTML = `
            <div class="vc-skill-info">
                <h4>${def.name}</h4>
                <p>${def.desc}</p>
            </div>
            <div style="display:flex; align-items:center;">
                <span class="vc-skill-lvl">${currentLvl}/${def.max}</span>
                <button class="vc-skill-buy" ${!canAfford ? 'disabled' : ''}>+</button>
            </div>
        `;

        row.querySelector('.vc-skill-buy').onclick = () => {
            if (_meta.sp > 0 && currentLvl < def.max) {
                _meta.sp--;
                _meta.skills[key]++;
                saveMeta(_meta);
                _renderGrimoire(); 
            }
        };

        list.appendChild(row);
    });
}

function _startBattle(tier) {
    _activeTier = tier;
    
    _screens.game.querySelector('#vc-camp-layer').style.display = 'none';
    _screens.game.querySelector('#vc-battle-layer').style.display = 'flex';

    const mapData = generateMap(9, 13, tier); 

    const uiCallbacks = {
        showCard: (mode, onRes) => {
            const overlay = _screens.game.querySelector('.vc-vocab-overlay');
            showCard(mode, overlay, onRes);
        }
    };

    let ui;
    _engine = new VcEngine(mapData, _meta, tier, (eng, msg) => {
        if(ui) ui.draw(eng, msg);
    }, (isWin, xp) => {
        addXP(_meta, xp);
        if (isWin) {
            _meta.highestTierCleared = Math.max(_meta.highestTierCleared, _activeTier);
            saveMeta(_meta);
            alert(`Sector Cleared! +${xp} XP`);
        } else {
            alert(`Defeated! You salvaged +${xp} XP`);
        }
        _showCamp();
    });

    ui = new VcUI(_screens.game, _engine, uiCallbacks);
    _engine.start();
}

function _injectStyles() {
    if (document.getElementById('vc-styles')) return;
    const link = document.createElement('link');
    link.id = 'vc-styles';
    link.rel = 'stylesheet';
    link.href = './js/games/vocabcraft/vocabcraft.css';
    document.head.appendChild(link);
}