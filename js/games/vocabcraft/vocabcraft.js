import { mountVocabSelector } from '../../vocab_selector.js';
import { loadMeta, saveMeta, addXP, resetSkills, SKILL_DEFS,
         clearStage, highestDifficultyCleared, isStageCleared, isStageUnlocked } from './vc_meta.js';
import { generateMap, getValidTemplates, getTemplateMinimap, TEMPLATES } from './vc_mapgen.js';
import { setVocabQueue, showCard } from './vc_vocab.js';
import { VcEngine } from './vc_engine.js';
import { VcUI } from './vc_ui.js';

let _screens = null;
let _onExit = null;
let _selector = null;
let _meta = null;
let _engine = null;
let _activeTier = 1;
let _speedMult = 1;

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
                        <div class="vc-camp-xp" id="vc-camp-lvl">Lv. 1 (XP: 0/100)</div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button class="vc-btn" id="vc-btn-grimoire" style="background:#f39c12; border-color:#d35400;">📖 Grimoire</button>
                        <button class="vc-btn" id="vc-btn-debug-unlock" title="Debug: unlock all stages" style="background:#2c3e50;border-color:#4a5568;font-size:11px;padding:4px 8px;min-width:0;">🔓</button>
                    </div>
                </div>
                <div class="vc-stage-list" id="vc-stage-list"></div>
            </div>

            <div id="vc-battle-layer" class="vc-root" style="display:none;">
                <div class="vc-topbar vc-topbar-row1">
                    <span class="vc-health">❤️ <span id="vc-val-hp">20</span></span>
                    <span class="vc-mana">💧 <span id="vc-val-mana">150</span></span>
                    <div style="flex:1;"></div>
                    <button class="vc-icon-btn vc-grimoire-btn" id="vc-btn-grimoire-battle">📖</button>
                    <button class="vc-icon-btn" id="vc-btn-speed">⚡1x</button>
                    <button class="vc-icon-btn" id="vc-btn-pause" style="background:#2980b9; border-color:#1a5276;">⏸</button>
                    <button class="vc-icon-btn vc-flee-btn" id="vc-btn-surrender">🏃Flee</button>
                </div>
                <div class="vc-topbar vc-topbar-row2">
                    <div class="vc-wave-tracker"></div>
                    <button class="vc-icon-btn" id="vc-btn-zoom" style="margin-left:6px; background:#2c3e50; border-color:#34495e;">🔍1x</button>
                </div>
                <div class="vc-map-container"><div class="vc-grid"></div></div>
                <div class="vc-bottombar"></div>
            </div>

            <div class="vc-grimoire-overlay" id="vc-grimoire-overlay" style="display:none;">
                <div class="vc-grimoire-header">
                    <div class="vc-camp-title">The Grimoire</div>
                    <div style="display:flex; gap:15px; align-items:center;">
                        <div class="vc-grimoire-sp" id="vc-grimoire-sp">SP: 0</div>
                        <button class="vc-btn" id="vc-btn-reset-skills" style="background:#e74c3c; border-color:#c0392b; padding:4px 8px; font-size:12px;">Reset</button>
                    </div>
                </div>
                <div class="vc-skill-list" id="vc-skill-list"></div>
                <button class="vc-btn" id="vc-btn-close-grimoire" style="margin-top:15px; padding:15px; background:#34495e; border-color:#2c3e50;">Close Grimoire</button>
            </div>
        `;

        _screens.game.querySelector('#vc-btn-grimoire').onclick = () => {
            _renderGrimoire();
            _screens.game.querySelector('#vc-grimoire-overlay').style.display = 'flex';
        };

        _screens.game.querySelector('#vc-btn-debug-unlock').onclick = () => {
            TEMPLATES.forEach(tpl => {
                for (let d = 1; d <= 10; d++) clearStage(_meta, tpl.id, d);
            });
            _showCamp();
        };
        _screens.game.querySelector('#vc-btn-grimoire-battle').onclick = () => {
            if (_engine && _engine.state.status === 'playing') {
                _engine.pause();
                const pauseBtn = _screens.game.querySelector('#vc-btn-pause');
                if (pauseBtn) {
                    pauseBtn.textContent = '▶';
                    pauseBtn.style.background = '#27ae60';
                    pauseBtn.style.borderColor = '#1e8449';
                }
            }
            _renderGrimoire();
            _screens.game.querySelector('#vc-grimoire-overlay').style.display = 'flex';
        };
        _screens.game.querySelector('#vc-btn-close-grimoire').onclick = () => {
            _screens.game.querySelector('#vc-grimoire-overlay').style.display = 'none';
        };
        _screens.game.querySelector('#vc-btn-reset-skills').onclick = () => {
            if (confirm('Refund all spent Skill Points?')) {
                resetSkills(_meta);
                _renderGrimoire();
            }
        };
        
        // Speed: cycle 1x → 2x → 3x → 5x → back to 1x
        const SPEED_STEPS =[1, 2, 3, 5];
        _screens.game.querySelector('#vc-btn-speed').onclick = () => {
            if (!_engine) return;
            const idx = SPEED_STEPS.indexOf(_engine.speedMult);
            _speedMult = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length];
            _engine.speedMult = _speedMult;
            _screens.game.querySelector('#vc-btn-speed').textContent = `⚡${_speedMult}x`;
        };

        // Pause / Resume toggle
        _screens.game.querySelector('#vc-btn-pause').onclick = () => {
            if (!_engine) return;
            const btn = _screens.game.querySelector('#vc-btn-pause');
            if (_engine.state.status === 'playing') {
                _engine.pause();
                btn.textContent = '▶';
                btn.style.background = '#27ae60';
                btn.style.borderColor = '#1e8449';
            } else if (_engine.state.status === 'paused') {
                _engine.resume();
                btn.textContent = '⏸';
                btn.style.background = '#2980b9';
                btn.style.borderColor = '#1a5276';
            }
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

    if (!document.getElementById('vc-vocab-modal')) {
        const modal = document.createElement('div');
        modal.id = 'vc-vocab-modal';
        modal.className = 'vc-vocab-overlay';
        modal.innerHTML = `<div class="vc-vocab-header"></div><div class="vc-vocab-grid"></div>`;
        modal.addEventListener('click', e => e.stopPropagation());
        document.body.appendChild(modal);
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

    // Remove any stale confirm modal
    const stale = _screens.game.querySelector('#vc-map-confirm');
    if (stale) stale.remove();

    const nextReq = Math.floor(100 * Math.pow(_meta.level, 1.8));
    _screens.game.querySelector('#vc-camp-lvl').textContent =
        `Lv. ${_meta.level} (XP: ${_meta.xp}/${nextReq})`;

    const list = _screens.game.querySelector('#vc-stage-list');
    list.innerHTML = '';

    const maxDiff = highestDifficultyCleared(_meta);

    TEMPLATES.forEach(tpl => {
        // Template locked if player hasn't reached its minTier difficulty yet
        // minTier 1 = always available; minTier N = need to have cleared diff N-1 somewhere
        const tplLocked = tpl.minTier > 1 && maxDiff < tpl.minTier - 1;

        const card = document.createElement('div');
        card.className = 'vc-stage-card';
        card.style.cssText = 'align-items:flex-start; gap:10px; cursor:default; flex-direction:column;';
        if (tplLocked) card.style.opacity = '0.45';

        // ── Header row: minimap + title/desc ─────────────────────────────────
        const minimapSvg = getTemplateMinimap(tpl.id, 58, 74);
        const waveCount  = 5 + 1; // D1 baseline; shown generically
        const headerRow  = document.createElement('div');
        headerRow.style.cssText = 'display:flex; gap:10px; width:100%; align-items:flex-start;';
        headerRow.innerHTML = `
            <div style="flex-shrink:0; border-radius:4px; overflow:hidden; border:1px solid #4a5568;">
                ${tplLocked
                    ? `<div style="width:58px;height:74px;background:#1a252f;display:flex;align-items:center;justify-content:center;font-size:20px;">🔒</div>`
                    : minimapSvg}
            </div>
            <div style="flex:1; min-width:0;">
                <div style="font-size:15px; font-weight:bold; color:#ecf0f1; margin-bottom:3px;">${tpl.name}</div>
                <div style="font-size:11px; color:#bdc3c7; line-height:1.4; margin-bottom:5px;">${tpl.desc}</div>
                ${tplLocked
                    ? `<div style="font-size:11px; color:#e74c3c;">🔒 Clear difficulty ${tpl.minTier - 1} on any map</div>`
                    : ''}
            </div>
        `;
        card.appendChild(headerRow);

        if (!tplLocked) {
            // ── Difficulty dots row ───────────────────────────────────────────
            const dotsRow = document.createElement('div');
            dotsRow.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap; width:100%;';

            for (let d = 1; d <= 10; d++) {
                const cleared  = isStageCleared(_meta, tpl.id, d);
                const unlocked = isStageUnlocked(_meta, tpl.id, d);
                const waves    = 5 + d + (_meta.skills.bonusWaves || 0);

                const dot = document.createElement('div');
                dot.title = `D${d} — ${waves} waves${cleared ? ' ✅' : unlocked ? '' : ' 🔒'}`;
                dot.style.cssText = [
                    'width:28px', 'height:28px', 'border-radius:6px',
                    'display:flex', 'align-items:center', 'justify-content:center',
                    'font-size:11px', 'font-weight:bold', 'cursor:pointer',
                    'border:2px solid',
                    cleared  ? 'background:#1a5e36; border-color:#2ecc71; color:#2ecc71;' :
                    unlocked ? 'background:#1a252f; border-color:#3498db; color:#3498db;' :
                               'background:#1a252f; border-color:#4a5568; color:#4a5568; cursor:default; opacity:0.5;'
                ].join(';');
                dot.textContent = d;

                if (unlocked) {
                    dot.onclick = () => _confirmAndStartBattle(tpl.id, d);
                }

                dotsRow.appendChild(dot);
            }
            card.appendChild(dotsRow);
        }

        list.appendChild(card);
    });
}

function _confirmAndStartBattle(templateId, difficulty) {
    const tpl = TEMPLATES.find(t => t.id === templateId);
    const minimapSvg = getTemplateMinimap(templateId, 90, 115);
    const waves = 5 + difficulty + (_meta.skills.bonusWaves || 0);
    const baseArmor = Math.floor((difficulty - 1) / 2);

    const existing = _screens.game.querySelector('#vc-map-confirm');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'vc-map-confirm';
    modal.style.cssText = [
        'position:absolute', 'inset:0', 'background:rgba(26,37,47,0.97)',
        'display:flex', 'flex-direction:column', 'align-items:center',
        'justify-content:center', 'z-index:100', 'padding:24px', 'gap:14px',
        'overflow-y:auto'
    ].join(';');

    const cleared = isStageCleared(_meta, templateId, difficulty);
    const statusLine = cleared
        ? `<span style="color:#2ecc71">✅ Previously cleared</span>`
        : `<span style="color:#f39c12">⚔️ Not yet cleared</span>`;

    modal.innerHTML = `
        <div style="font-size:18px; font-weight:bold; color:#f1c40f;">${tpl.name} — D${difficulty}</div>
        <div style="border-radius:6px; overflow:hidden; border:2px solid #3498db;">${minimapSvg}</div>
        <div style="text-align:center; max-width:240px;">
            <div style="font-size:12px; color:#bdc3c7; line-height:1.5; margin-bottom:8px;">${tpl.desc}</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:center; font-size:12px;">
                <span style="background:#34495e; padding:3px 8px; border-radius:4px;">🌊 ${waves} waves</span>
                <span style="background:#34495e; padding:3px 8px; border-radius:4px;">🛡️ +${baseArmor} base armor</span>
                <span style="background:#34495e; padding:3px 8px; border-radius:4px;">💰 ${difficulty}× XP</span>
                <span style="background:#34495e; padding:3px 8px; border-radius:4px;">${statusLine}</span>
            </div>
        </div>
        <div style="display:flex; gap:12px; width:100%;">
            <button id="vc-confirm-go"   style="flex:1;padding:14px;background:#2ecc71;border:2px solid #27ae60;border-radius:6px;color:white;font-weight:bold;font-size:15px;cursor:pointer;">⚔️ Enter</button>
            <button id="vc-confirm-back" style="flex:1;padding:14px;background:#34495e;border:2px solid #7f8c8d;border-radius:6px;color:white;font-weight:bold;font-size:15px;cursor:pointer;">← Back</button>
        </div>
    `;

    _screens.game.querySelector('#vc-camp-layer').appendChild(modal);
    modal.querySelector('#vc-confirm-go').onclick = () => { modal.remove(); _startBattle(templateId, difficulty); };
    modal.querySelector('#vc-confirm-back').onclick = () => modal.remove();
}

function _renderGrimoire() {
    _screens.game.querySelector('#vc-grimoire-sp').textContent = `SP: ${_meta.sp}`;
    
    const list = _screens.game.querySelector('#vc-skill-list');
    list.innerHTML = '';

    const GROUP_LABELS = {
        economy: '💰 Economy',
        gems:    '💎 Gem Forging',
        mastery: '⚔️ Gem Mastery',
        utility: '⚙️ Utility'
    };

    const grouped = {};
    Object.entries(SKILL_DEFS).forEach(([key, def]) => {
        const g = def.group || 'utility';
        if (!grouped[g]) grouped[g] =[];
        grouped[g].push([key, def]);
    });

    Object.entries(GROUP_LABELS).forEach(([groupKey, groupLabel]) => {
        const skills = grouped[groupKey];
        if (!skills) return;

        const header = document.createElement('div');
        header.style.cssText = 'font-size:12px; font-weight:bold; color:#f1c40f; text-transform:uppercase; letter-spacing:1px; padding:8px 0 4px; border-bottom:1px solid #34495e; margin-bottom:2px;';
        header.textContent = groupLabel;
        list.appendChild(header);

        skills.forEach(([key, def]) => {
            const currentLvl = _meta.skills[key] || 0;
            const cost = currentLvl + 1; // Triangular pricing: Lvl N -> N+1 costs N+1 SP
            const isMax = currentLvl >= def.max;
            const canAfford = _meta.sp >= cost && !isMax;
            
            const maxLabel = def.max === Infinity ? '∞' : def.max;

            const row = document.createElement('div');
            row.className = 'vc-skill-row';
            row.innerHTML = `
                <div class="vc-skill-info">
                    <h4>${def.name}</h4>
                    <p>${def.desc}</p>
                </div>
                <div style="display:flex; align-items:center;">
                    <span class="vc-skill-lvl">${currentLvl}/${maxLabel}</span>
                    <button class="vc-skill-buy" ${!canAfford ? 'disabled' : ''} style="width:auto; padding:0 8px; font-size:14px;">
                        ${isMax ? 'MAX' : `+ (Cost: ${cost})`}
                    </button>
                </div>
            `;

            row.querySelector('.vc-skill-buy').onclick = () => {
                if (_meta.sp >= cost && currentLvl < def.max) {
                    _meta.sp -= cost;
                    _meta.skills[key] = currentLvl + 1;
                    saveMeta(_meta);
                    _renderGrimoire();
                }
            };

            list.appendChild(row);
        });
    });
}

function _startBattle(templateId, difficulty) {
    _activeTier = difficulty;  // keep _activeTier for any legacy refs

    _screens.game.querySelector('#vc-camp-layer').style.display = 'none';
    _screens.game.querySelector('#vc-battle-layer').style.display = 'flex';

    const mapData = generateMap(9, 13, difficulty, templateId);

    const uiCallbacks = {
        showCard: (mode, onRes) => {
            const overlay = document.getElementById('vc-vocab-modal');
            showCard(mode, overlay, onRes);
        }
    };

    let ui;
    _engine = new VcEngine(mapData, _meta, difficulty, (eng, msg) => {
        if (ui) ui.draw(eng, msg);
    }, (isWin, xp) => {
        addXP(_meta, xp);
        if (isWin) {
            clearStage(_meta, templateId, difficulty);
            alert(`${TEMPLATES.find(t=>t.id===templateId)?.name} D${difficulty} Cleared! +${Math.floor(xp)} XP`);
        } else {
            alert(`Defeated! You salvaged +${Math.floor(xp)} XP`);
        }
        _showCamp();
    });

    ui = new VcUI(_screens.game, _engine, uiCallbacks, () => {
        _engine.speedMult = _speedMult;
        _screens.game.querySelector('#vc-btn-speed').textContent = `⚡${_speedMult}x`;
        _engine.start();
    });
}

function _injectStyles() {
    if (document.getElementById('vc-styles')) return;
    const link = document.createElement('link');
    link.id = 'vc-styles';
    link.rel = 'stylesheet';
    link.href = './js/games/vocabcraft/vocabcraft.css';
    document.head.appendChild(link);
}