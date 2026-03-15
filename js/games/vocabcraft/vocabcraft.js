import { mountVocabSelector, getBannedWords } from '../../vocab_selector.js';
import * as srsDb from '../../srs_db.js';
import { loadMeta, saveMeta, addXP, resetSkills, SKILL_DEFS, getDefaultSave,
         clearStage, highestDifficultyCleared, isStageCleared, isStageUnlocked } from './vc_meta.js';
import { generateMap, getValidTemplates, getTemplateMinimap, TEMPLATES, getHexWorldLayout, HEX_TIER_COLORS } from './vc_mapgen.js';
import { setVocabQueue, showCard } from './vc_vocab.js';
import { VcEngine } from './vc_engine.js';
import { VcUI } from './vc_ui.js';
import { getWavePreview } from './vc_enemies.js';

let _screens = null;
let _onExit = null;
let _selector = null;
let _meta = null;
let _engine = null;
let _activeTier = 1;
let _speedMult = 1;
// Session-only debug flag — never persisted to save.
// When true, all stages are shown as unlocked IN ADDITION to the normal unlock logic.
// Toggled by the 🔓 button; OFF by default so real unlock state is always visible.
let _debugUnlockAll = false;
let _gameMode = 'hard'; // 'easy' | 'normal' | 'hard'

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
                        <button class="vc-icon-btn" id="vc-btn-settings" title="Settings" style="background:#2c3e50;border-color:#4a5568;font-size:18px;padding:4px 8px;min-width:0;line-height:1;">⚙️</button>
                    </div>
                </div>
                <div class="vc-stage-list" id="vc-stage-list"></div>
            </div>

            <div id="vc-battle-layer" class="vc-root" style="display:none;">
                <div class="vc-topbar vc-topbar-row1">
                    <div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;">
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                            <span class="vc-mana">💧 <span id="vc-val-mana">300</span></span>
                            <span style="font-size:10px;color:#bdc3c7;">/ <span id="vc-val-pool-cap">300</span></span>
                            <span style="font-size:11px;color:#f1c40f;font-weight:bold;">P<span id="vc-val-pool-level">1</span></span>
                        </div>
                        <div style="height:6px;background:#1a252f;border-radius:3px;overflow:hidden;width:100%;">
                            <div id="vc-mana-bar-fill" style="height:100%;width:100%;background:#f1c40f;transition:width 0.2s,background 0.3s;border-radius:3px;"></div>
                        </div>
                    </div>
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

        // ⚙️ Settings button — opens the settings overlay
        _screens.game.querySelector('#vc-btn-settings').onclick = () => _showSettingsOverlay();

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

/**
 * Build a vocab queue directly from the SRS database.
 * Includes all statuses (0–5) and respects the vocabcraft ban list.
 * Returns the queue array — empty if no SRS words exist.
 */
function _buildSrsQueue() {
    const banned = new Set(getBannedWords(BANNED_KEY));
    return Object.values(srsDb.getAllWords())
        .filter(w => !banned.has(w.word))
        .map(w => ({
            word:   w.word,
            furi:   w.furi,
            trans:  w.translation,
            status: w.status,
            deckId: 'srs',
        }));
}

export function launch() {
    _injectStyles();
    _meta = loadMeta();

    const srsQueue = _buildSrsQueue();
    if (srsQueue.length > 0) {
        // SRS words available — skip the selector, go straight to camp.
        setVocabQueue(srsQueue);
        _show('game');
        _showCamp();
    } else {
        // No SRS words yet — show the deck selector as fallback.
        _show('setup');
        _renderSetup();
    }
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

    const srsCount = Object.keys(srsDb.getAllWords()).length;

    _selector = mountVocabSelector(el, {
        bannedKey: BANNED_KEY,
        defaultCount: 40,
        title: `VocabCraft — Select Vocabulary`
    });

    const actions = _selector.getActionsEl();

    // Info banner when user has SRS words — remind them this is optional
    if (srsCount > 0) {
        const info = document.createElement('div');
        info.style.cssText = 'font-size:12px;color:#bdc3c7;background:#1a252f;border:1px solid #2ecc71;border-radius:6px;padding:8px 10px;margin-top:4px;line-height:1.5;';
        info.innerHTML = `💡 You have <strong style="color:#2ecc71">${srsCount} SRS words</strong> — VocabCraft already uses them by default. Choose a deck here only if you want to add or switch to a specific word list.`;
        actions.appendChild(info);
    }

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
    // If _meta is already loaded we came from camp → go back to camp.
    // Otherwise (first launch, no SRS) → exit the game entirely.
    backBtn.textContent = (_meta && srsCount > 0) ? '← Back to Camp' : '← Back';
    backBtn.addEventListener('click', () => {
        if (_meta && srsCount > 0) {
            // Re-use SRS queue and return to camp without changing it
            _show('game');
            _showCamp();
        } else {
            _onExit();
        }
    });

    actions.append(startBtn, backBtn);
}

function _showSettingsOverlay() {
    // Remove any stale overlay
    const stale = _screens.game.querySelector('#vc-settings-overlay');
    if (stale) stale.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vc-settings-overlay';
    overlay.style.cssText = [
        'position:absolute','inset:0','background:rgba(26,37,47,0.98)',
        'z-index:200','display:flex','flex-direction:column',
        'padding:20px','gap:14px','overflow-y:auto','-webkit-overflow-scrolling:touch'
    ].join(';');

    const debugIcon  = _debugUnlockAll ? '🔓' : '🔒';
    const debugLabel = _debugUnlockAll ? 'Debug: All Stages Unlocked (session only)' : 'Debug: Normal Stage Locks';
    const debugStyle = _debugUnlockAll
        ? 'background:#3d1a5e;border-color:#8e44ad;color:#f1c40f;'
        : 'background:#1a252f;border-color:#4a5568;color:#bdc3c7;';

    overlay.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #f1c40f;padding-bottom:12px;">
            <div style="font-size:18px;font-weight:bold;color:#f1c40f;">⚙️ Settings</div>
            <button id="vc-settings-close" style="background:#34495e;border:1px solid #7f8c8d;border-radius:6px;color:white;font-size:18px;padding:4px 10px;cursor:pointer;">✕</button>
        </div>

        <!-- Vocabulary -->
        <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:10px;font-weight:bold;color:#f1c40f;text-transform:uppercase;letter-spacing:1px;">📚 Vocabulary</div>
            <button id="vc-settings-words" style="background:#2c4a66;border:2px solid #3498db;border-radius:8px;color:white;font-size:14px;font-weight:bold;padding:12px;cursor:pointer;text-align:left;">
                🗂️ Change Word Source
                <div style="font-size:11px;color:#95a5a6;font-weight:normal;margin-top:2px;">Switch to a specific vocabulary deck</div>
            </button>
        </div>

        <!-- Game Mode -->
        <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:10px;font-weight:bold;color:#f1c40f;text-transform:uppercase;letter-spacing:1px;">🎮 Game Mode</div>
            <div style="display:flex;gap:6px;">
                <button class="vc-mode-btn" data-mode="easy"   style="flex:1;padding:10px 4px;border:2px solid;border-radius:8px;color:white;font-size:13px;font-weight:bold;cursor:pointer;text-align:center;">🌿 Easy<div style="font-size:10px;color:#bdc3c7;font-weight:normal;margin-top:3px;">¼HP · ½Speed</div></button>
                <button class="vc-mode-btn" data-mode="normal" style="flex:1;padding:10px 4px;border:2px solid;border-radius:8px;color:white;font-size:13px;font-weight:bold;cursor:pointer;text-align:center;">⚔️ Normal<div style="font-size:10px;color:#bdc3c7;font-weight:normal;margin-top:3px;">½HP</div></button>
                <button class="vc-mode-btn" data-mode="hard"   style="flex:1;padding:10px 4px;border:2px solid;border-radius:8px;color:white;font-size:13px;font-weight:bold;cursor:pointer;text-align:center;">💀 Hard<div style="font-size:10px;color:#bdc3c7;font-weight:normal;margin-top:3px;">Full stats</div></button>
            </div>
        </div>

        <!-- Debug -->
        <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:10px;font-weight:bold;color:#f1c40f;text-transform:uppercase;letter-spacing:1px;">🛠️ Debug</div>
            <button id="vc-settings-debug" style="${debugStyle}border:2px solid;border-radius:8px;font-size:14px;font-weight:bold;padding:12px;cursor:pointer;text-align:left;width:100%;">
                ${debugIcon} ${debugLabel}
                <div style="font-size:11px;color:#95a5a6;font-weight:normal;margin-top:2px;">Not saved — resets when you leave</div>
            </button>
        </div>

        <!-- Reset -->
        <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:10px;font-weight:bold;color:#f1c40f;text-transform:uppercase;letter-spacing:1px;">⚠️ Reset</div>
            <button id="vc-reset-stages" style="background:#1a252f;border:2px solid #e67e22;border-radius:8px;color:#e67e22;font-size:14px;font-weight:bold;padding:12px;cursor:pointer;text-align:left;width:100%;">
                🗺️ Reset Stage Progress
                <div style="font-size:11px;color:#95a5a6;font-weight:normal;margin-top:2px;">Clears all cleared-stage records. Skills and XP are kept.</div>
            </button>
            <button id="vc-reset-skills" style="background:#1a252f;border:2px solid #e74c3c;border-radius:8px;color:#e74c3c;font-size:14px;font-weight:bold;padding:12px;cursor:pointer;text-align:left;width:100%;">
                📖 Reset Skills, XP &amp; Level
                <div style="font-size:11px;color:#95a5a6;font-weight:normal;margin-top:2px;">Refunds all SP, wipes XP and level back to 1. Stage progress is kept.</div>
            </button>
            <button id="vc-reset-all" style="background:#2d0a0a;border:2px solid #c0392b;border-radius:8px;color:#e74c3c;font-size:14px;font-weight:bold;padding:12px;cursor:pointer;text-align:left;width:100%;">
                💀 Reset Everything
                <div style="font-size:11px;color:#95a5a6;font-weight:normal;margin-top:2px;">Wipes all progress: stages, skills, XP, and level.</div>
            </button>
        </div>
    `;

    _screens.game.querySelector('#vc-camp-layer').appendChild(overlay);

    overlay.querySelector('#vc-settings-close').onclick = () => overlay.remove();

    // Game mode buttons
    overlay.querySelectorAll('.vc-mode-btn').forEach(btn => {
        btn.style.background  = btn.dataset.mode === _gameMode ? '#2c6e3f' : '#1a252f';
        btn.style.borderColor = btn.dataset.mode === _gameMode ? '#2ecc71' : '#4a5568';
        btn.onclick = () => {
            _gameMode = btn.dataset.mode;
            overlay.querySelectorAll('.vc-mode-btn').forEach(b => {
                b.style.background  = b.dataset.mode === _gameMode ? '#2c6e3f' : '#1a252f';
                b.style.borderColor = b.dataset.mode === _gameMode ? '#2ecc71' : '#4a5568';
            });
        };
    });

    // Words
    overlay.querySelector('#vc-settings-words').onclick = () => {
        overlay.remove();
        _screens.game.querySelector('#vc-camp-layer').style.display = 'none';
        _show('setup');
        _renderSetup();
    };

    // Debug toggle — also maxes all skills when enabled
    overlay.querySelector('#vc-settings-debug').onclick = () => {
        _debugUnlockAll = !_debugUnlockAll;
        if (_debugUnlockAll) {
            // Max all capped skills to their cap, uncapped ones to 1000
            Object.entries(SKILL_DEFS).forEach(([key, def]) => {
                const cap = def.max === Infinity ? 1000 : def.max;
                _meta.skills[key] = cap;
            });
            _meta.sp = 0;
            saveMeta(_meta);
        }
        overlay.remove();
        _showSettingsOverlay();
        _showCamp();
    };

    // Reset stage progress only
    overlay.querySelector('#vc-reset-stages').onclick = () => {
        if (!confirm('Reset all stage progress? Your skills and XP are kept.')) return;
        _meta.clearedStages = {};
        saveMeta(_meta);
        overlay.remove();
        _showCamp();
    };

    // Reset skills/xp/level only
    overlay.querySelector('#vc-reset-skills').onclick = () => {
        if (!confirm('Reset skills, XP and level back to 1? Stage progress is kept.')) return;
        _meta.xp = 0;
        _meta.level = 1;
        _meta.sp = 0;
        for (const k in _meta.skills) _meta.skills[k] = 0;
        saveMeta(_meta);
        overlay.remove();
        _showCamp();
    };

    // Reset everything
    overlay.querySelector('#vc-reset-all').onclick = () => {
        if (!confirm('Reset EVERYTHING? All stages, skills, XP and level will be wiped. This cannot be undone.')) return;
        const fresh = getDefaultSave();
        Object.assign(_meta, fresh);
        saveMeta(_meta);
        overlay.remove();
        _showCamp();
    };
}


/**
 * Returns the highest tier that is fully unlocked for play.
 * Tier 1 is always unlocked.
 * Tier N unlocks when every map of tier N-1 has been cleared at least on D1.
 */
function _highestUnlockedTier() {
    const layout = getHexWorldLayout();
    let tier = 1;
    while (true) {
        const thisTierMaps = layout.filter(n => n.tier === tier);
        if (thisTierMaps.length === 0) break;
        // All maps in this tier must have D1 cleared
        const allDone = thisTierMaps.every(n => isStageCleared(_meta, n.id, 1));
        if (!allDone) break;
        tier++;
    }
    return tier; // highest tier accessible
}

function _showCamp() {
    _screens.game.querySelector('#vc-battle-layer').style.display = 'none';
    _screens.game.querySelector('#vc-camp-layer').style.display = 'flex';

    // Remove any stale confirm modal
    const stale = _screens.game.querySelector('#vc-map-confirm');
    if (stale) stale.remove();

    // Silently refresh the SRS queue each time we return to camp — this picks up
    // any words that became due mid-session. Only refreshes if the current queue
    // is SRS-sourced (i.e. user hasn't manually chosen a custom deck).
    const freshSrs = _buildSrsQueue();
    if (freshSrs.length > 0) {
        setVocabQueue(freshSrs);
    }

    const nextReq = Math.floor(100 * Math.pow(_meta.level, 1.8));
    _screens.game.querySelector('#vc-camp-lvl').textContent =
        `Lv. ${_meta.level} (XP: ${Math.floor(_meta.xp)}/${nextReq})`;

    const list = _screens.game.querySelector('#vc-stage-list');
    list.innerHTML = '';
    _renderHexWorldMap(list);
}

function _renderHexWorldMap(container) {
    const layout       = getHexWorldLayout();
    const unlockedTier = _highestUnlockedTier();

    // Flat-top hexagons — wider than tall, better for horizontal text labels.
    // R = outer radius. Flat-top: width = 2R, height = sqrt(3)*R.
    // Adjacent hexes share an edge when centres are 2R apart horizontally
    // or sqrt(3)*R apart vertically.
    const HEX_R    = 68;
    const HEX_W    = 2 * HEX_R;                // 136px
    const HEX_H    = Math.sqrt(3) * HEX_R;     // ~118px
    const COL_STEP = HEX_W * 0.75;             // touching: 3/4 of width
    const ROW_STEP = HEX_H;                    // touching: full height
    const PAD      = HEX_R;

    // Flat-top hex: col offset every other column by half a row
    function hexCenter(col, row) {
        const x = PAD + col * COL_STEP;
        const y = PAD + row * ROW_STEP + (col % 2 === 1 ? HEX_H / 2 : 0);
        return { x, y };
    }

    // Flat-top hex path (vertex at left/right)
    function hexPath(cx, cy, r) {
        const pts = [];
        for (let i = 0; i < 6; i++) {
            const a = Math.PI / 180 * (60 * i);   // 0°=right vertex
            pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
        }
        return `M${pts.join('L')}Z`;
    }

    // Compute canvas bounds
    const centres = layout.map(n => hexCenter(n.hexCol, n.hexRow));
    const svgW = Math.ceil(Math.max(...centres.map(c => c.x)) + PAD + HEX_R);
    const svgH = Math.ceil(Math.max(...centres.map(c => c.y)) + PAD + HEX_H * 0.5);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg   = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width',  svgW);
    svg.setAttribute('height', svgH);
    svg.style.cssText = 'display:block;margin:0 auto;overflow:visible;touch-action:pan-y;';

    // Single shared defs block
    const defs = document.createElementNS(svgNS, 'defs');
    svg.appendChild(defs);

    layout.forEach((node, idx) => {
        const tpl = TEMPLATES.find(t => t.id === node.id);
        if (!tpl) return;

        const tplLockedActual = node.tier > unlockedTier;
        const tplLocked       = tplLockedActual && !_debugUnlockAll;
        const colors          = HEX_TIER_COLORS[node.tier];
        const { x: cx, y: cy } = centres[idx];

        // ── Hex background ──────────────────────────────────────────────────
        const hexBg = document.createElementNS(svgNS, 'path');
        hexBg.setAttribute('d', hexPath(cx, cy, HEX_R - 1));
        hexBg.setAttribute('fill',   tplLocked ? '#111' : colors.bg);
        hexBg.setAttribute('stroke', tplLocked ? '#2a2a2a' : colors.border);
        hexBg.setAttribute('stroke-width', '2.5');
        svg.appendChild(hexBg);

        if (!tplLocked) {
            // ── Minimap clipped to hex ──────────────────────────────────────
            const clipId   = `hclip-${node.id}`;
            const clip     = document.createElementNS(svgNS, 'clipPath');
            clip.setAttribute('id', clipId);
            const cp = document.createElementNS(svgNS, 'path');
            cp.setAttribute('d', hexPath(cx, cy, HEX_R - 4));
            clip.appendChild(cp);
            defs.appendChild(clip);

            // Minimap fills the inner hex
            const mmSize   = Math.floor(HEX_R * 1.55);
            const mmSvgStr = getTemplateMinimap(tpl.id, mmSize, mmSize);
            const fo = document.createElementNS(svgNS, 'foreignObject');
            fo.setAttribute('x', (cx - mmSize / 2).toFixed(1));
            fo.setAttribute('y', (cy - mmSize / 2).toFixed(1));
            fo.setAttribute('width',  mmSize);
            fo.setAttribute('height', mmSize);
            fo.setAttribute('clip-path', `url(#${clipId})`);
            fo.setAttribute('pointer-events', 'none');
            fo.innerHTML = mmSvgStr;
            svg.appendChild(fo);

            // Semi-transparent overlay so label is readable
            const ov = document.createElementNS(svgNS, 'path');
            ov.setAttribute('d',    hexPath(cx, cy, HEX_R - 4));
            ov.setAttribute('fill', 'rgba(0,0,0,0.30)');
            ov.setAttribute('pointer-events', 'none');
            svg.appendChild(ov);
        } else {
            // Lock icon centred
            const lock = document.createElementNS(svgNS, 'text');
            lock.setAttribute('x', cx);
            lock.setAttribute('y', (cy + 10).toFixed(1));
            lock.setAttribute('text-anchor', 'middle');
            lock.setAttribute('font-size', '30');
            lock.setAttribute('pointer-events', 'none');
            lock.textContent = '🔒';
            svg.appendChild(lock);
        }

        // ── Name label — centred, inside lower third ────────────────────────
        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('x', cx);
        label.setAttribute('y', (cy + HEX_H * 0.28).toFixed(1));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', tpl.name.length > 10 ? '9' : '10');
        label.setAttribute('font-weight', 'bold');
        label.setAttribute('font-family', 'Segoe UI, sans-serif');
        label.setAttribute('fill',   tplLocked ? '#444' : '#ecf0f1');
        label.setAttribute('pointer-events', 'none');
        // Drop shadow via paint-order so text is readable over the minimap
        label.setAttribute('stroke', 'rgba(0,0,0,0.8)');
        label.setAttribute('stroke-width', '2.5');
        label.setAttribute('paint-order', 'stroke');
        label.textContent = tpl.name;
        svg.appendChild(label);

        // ── Best-cleared badge ──────────────────────────────────────────────
        if (!tplLocked) {
            let bestD = 0;
            for (let d = 18; d >= 1; d--) {
                if (isStageCleared(_meta, tpl.id, d)) { bestD = d; break; }
            }
            if (bestD > 0) {
                const badge = document.createElementNS(svgNS, 'text');
                badge.setAttribute('x', (cx + HEX_R * 0.62).toFixed(1));
                badge.setAttribute('y', (cy - HEX_H * 0.3).toFixed(1));
                badge.setAttribute('text-anchor', 'middle');
                badge.setAttribute('font-size', '10');
                badge.setAttribute('font-weight', 'bold');
                badge.setAttribute('fill', '#f1c40f');
                badge.setAttribute('stroke', 'rgba(0,0,0,0.8)');
                badge.setAttribute('stroke-width', '2');
                badge.setAttribute('paint-order', 'stroke');
                badge.setAttribute('pointer-events', 'none');
                badge.textContent = `★D${bestD}`;
                svg.appendChild(badge);
            }
        }

        // ── Transparent click target on top (catches all events reliably) ───
        const hitArea = document.createElementNS(svgNS, 'path');
        hitArea.setAttribute('d',    hexPath(cx, cy, HEX_R - 1));
        hitArea.setAttribute('fill', 'transparent');
        hitArea.setAttribute('stroke', 'none');
        hitArea.style.cursor = tplLocked ? 'default' : 'pointer';
        if (!tplLocked) {
            hitArea.addEventListener('click', () => _showHexDetail(tpl, node, colors, tplLockedActual));
        }
        svg.appendChild(hitArea);
    });

    container.appendChild(svg);
}

function _showHexDetail(tpl, node, colors, tplLockedActual = false) {
    // Full-screen overlay replacing the camp layer content
    const existing = _screens.game.querySelector('#vc-hex-detail');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vc-hex-detail';
    overlay.style.cssText = [
        'position:absolute', 'inset:0', 'background:#1a252f',
        'z-index:50', 'display:flex', 'flex-direction:column',
        'overflow:hidden'
    ].join(';');

    // ── Header ──────────────────────────────────────────────────────────────
    const mmSvg = getTemplateMinimap(tpl.id, 56, 72);
    const header = document.createElement('div');
    header.style.cssText = `display:flex;gap:10px;align-items:flex-start;padding:12px 14px 10px;border-bottom:2px solid ${colors.border};flex-shrink:0;`;
    header.innerHTML = `
        <div style="flex-shrink:0;border-radius:6px;overflow:hidden;border:2px solid ${colors.border};">${mmSvg}</div>
        <div style="flex:1;min-width:0;">
            <div style="font-size:15px;font-weight:bold;color:${colors.border};">${tpl.name}</div>
            <div style="font-size:11px;color:#bdc3c7;line-height:1.4;margin-top:2px;">${tpl.desc}</div>
            ${tplLockedActual && !_debugUnlockAll ? `<div style="font-size:10px;color:#e74c3c;margin-top:3px;">🔒 Clear all Tier ${node.tier-1} maps on D1 to unlock</div>` : ''}
        </div>
        <button id="vc-hex-close" style="background:none;border:none;color:#7f8c8d;font-size:22px;cursor:pointer;padding:0 4px;flex-shrink:0;line-height:1;">✕</button>
    `;
    overlay.appendChild(header);

    // ── Scrollable body ──────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 14px 20px;display:flex;flex-direction:column;gap:10px;';
    overlay.appendChild(body);

    // ── Difficulty selector ──────────────────────────────────────────────────
    let selectedD = (() => {
        // Default to highest cleared+1, or 1
        for (let d = 18; d >= 1; d--) if (isStageCleared(_meta, tpl.id, d)) return Math.min(18, d + 1);
        return 1;
    })();

    const diffSection = document.createElement('div');
    diffSection.innerHTML = `<div style="font-size:10px;font-weight:bold;color:#f1c40f;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">⚔️ Select Difficulty</div>`;
    const dotsWrap = document.createElement('div');
    dotsWrap.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;';

    function renderDots() {
        dotsWrap.innerHTML = '';
        for (let d = 1; d <= 18; d++) {
            const cleared        = isStageCleared(_meta, tpl.id, d);
            const unlockedActual = isStageUnlocked(_meta, tpl.id, d);
            const unlocked       = unlockedActual || _debugUnlockAll;
            const isSelected     = d === selectedD;
            const dot = document.createElement('div');
            dot.style.cssText = [
                'width:32px', 'height:32px', 'border-radius:6px', 'flex-shrink:0',
                'display:flex', 'align-items:center', 'justify-content:center',
                'font-size:12px', 'font-weight:bold', 'border:2px solid',
                isSelected       ? 'background:#f1c40f;border-color:#f1c40f;color:#1a252f;cursor:pointer;' :
                cleared          ? 'background:#1a5e36;border-color:#2ecc71;color:#2ecc71;cursor:pointer;' :
                unlockedActual   ? 'background:#1a252f;border-color:#3498db;color:#3498db;cursor:pointer;' :
                _debugUnlockAll  ? 'background:#3d1a5e;border-color:#8e44ad;color:#c39bd3;cursor:pointer;' :
                                   'background:#111;border-color:#333;color:#444;cursor:default;opacity:0.4;'
            ].join(';');
            dot.textContent = d;
            if (unlocked) {
                dot.addEventListener('click', e => {
                    e.stopPropagation();
                    selectedD = d;
                    renderDots();
                    renderWavePreview();
                });
            }
            dotsWrap.appendChild(dot);
        }
    }
    diffSection.appendChild(dotsWrap);
    body.appendChild(diffSection);

    // ── Wave preview (updates when difficulty changes) ───────────────────────
    const waveSection = document.createElement('div');
    body.appendChild(waveSection);

    function renderWavePreview() {
        const waves   = 10 + 7 * selectedD + (_meta.skills.bonusWaves || 0) * 3;
        const baseArmor = Math.floor((selectedD - 1) / 2);
        const cleared = isStageCleared(_meta, tpl.id, selectedD);
        const statusLine = cleared ? '✅ Cleared' : '⚔️ Not cleared';

        const preview = getWavePreview(waves, selectedD);
        const fullPool = getWavePreview(80, selectedD);
        const legendMap = new Map();
        fullPool.forEach(w => w.types.forEach(t => {
            if (!legendMap.has(t.typeId)) legendMap.set(t.typeId, t);
        }));

        const waveCardsHtml = preview.map(w => {
            const isBoss = w.isBoss;
            const cardBg  = isBoss ? '#3d0a0a' : '#1e2d3d';
            const cardBdr = isBoss ? '#e74c3c' : '#2c4a66';
            const numClr  = isBoss ? '#e74c3c' : '#7fb3d3';
            const emojis  = isBoss
                ? `<div style="font-size:20px;line-height:1.1;margin:2px 0;">👹</div>`
                : `<div style="font-size:13px;line-height:1.3;letter-spacing:1px;margin:2px 0;">${w.types.map(t=>t.emoji).join('')}</div>`;
            const hps = w.types.map(t=>t.hp);
            const lo = Math.min(...hps), hi = Math.max(...hps);
            const hpLine = `<div style="font-size:9px;color:${isBoss?'#f39c12':'#aac8e0'};">❤️ ${lo===hi?lo:lo+'–'+hi}</div>`;
            const armorVal = Math.max(...w.types.map(t=>t.armor));
            const flags = [armorVal>0?`🛡️${armorVal}`:null, w.types.some(t=>t.immune.length)?'🚫':null, w.types.some(t=>t.regen>0)?'💚':null].filter(Boolean).join(' ');
            return `<div data-wcard="${w.wave}" style="flex-shrink:0;width:60px;min-height:95px;background:${cardBg};border:1px solid ${cardBdr};border-radius:7px;padding:4px 2px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:1px;text-align:center;">
                <div style="font-size:10px;font-weight:bold;color:${numClr};">W${w.wave}${isBoss?' 🔥':''}</div>
                ${emojis}
                <div style="font-size:9px;color:#bdc3c7;">${isBoss?'BOSS':'~'+w.slots}</div>
                ${hpLine}
                <div style="font-size:9px;color:#95a5a6;">${flags||'–'}</div>
            </div>`;
        }).join('');

        const legendHtml = [...legendMap.values()].map(t => {
            const immBadge = t.immune.filter(i => !i.startsWith('dmg_')).length
                ? `<span style="font-size:9px;color:#e74c3c;margin-left:3px;">🚫${t.immune.filter(i=>!i.startsWith('dmg_')).join('/')}</span>` : '';
            const regenBadge = t.regen > 0 ? `<span style="font-size:9px;color:#2ecc71;margin-left:3px;">♻️</span>` : '';
            return `<div style="display:flex;align-items:flex-start;gap:6px;padding:5px 6px;background:#1a252f;border-radius:5px;border-left:3px solid #2c4a66;">
                <span style="font-size:18px;line-height:1;">${t.emoji}</span>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:11px;font-weight:bold;color:#ecf0f1;">${t.label}${immBadge}${regenBadge}</div>
                    <div style="font-size:10px;color:#95a5a6;line-height:1.3;">${t.desc}</div>
                </div>
                <div style="text-align:right;white-space:nowrap;font-size:10px;color:#7fb3d3;">❤️${t.hp}<br>🛡️${t.armor}</div>
            </div>`;
        }).join('');

        waveSection.innerHTML = `
            <div style="display:flex;flex-wrap:wrap;gap:5px;font-size:11px;margin-bottom:6px;">
                <span style="background:#34495e;padding:3px 8px;border-radius:4px;color:#ecf0f1;font-size:11px;font-weight:bold;">🌊 ${waves} waves</span>
                <span style="background:#34495e;padding:3px 8px;border-radius:4px;color:#ecf0f1;font-size:11px;font-weight:bold;">🛡️ +${baseArmor} base armor</span>
                <span style="background:#34495e;padding:3px 8px;border-radius:4px;color:#ecf0f1;font-size:11px;font-weight:bold;">💰 ${selectedD}× XP</span>
                <span style="background:#34495e;padding:3px 8px;border-radius:4px;color:#ecf0f1;font-size:11px;font-weight:bold;">${statusLine}</span>
            </div>
            <div style="font-size:10px;font-weight:bold;color:#f1c40f;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">📋 Wave Preview</div>
            <div style="display:flex;gap:5px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:3px 1px 8px;">${waveCardsHtml}</div>
            <div id="vc-wv-detail2" style="display:none;background:#1a2d3d;border:1px solid #2c4a66;border-radius:7px;padding:8px;margin-bottom:6px;"></div>
            <div id="vc-legend-toggle2" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;padding:6px 8px;background:#1a2d3d;border:1px solid #2c4a66;border-radius:7px;margin-top:2px;">
                <div style="font-size:10px;font-weight:bold;color:#f1c40f;text-transform:uppercase;letter-spacing:1px;">👾 Enemy Types</div>
                <div id="vc-legend-chevron2" style="font-size:12px;color:#7fb3d3;transition:transform 0.2s;">▶</div>
            </div>
            <div id="vc-legend-list2" style="display:none;flex-direction:column;gap:4px;">${legendHtml}</div>
        `;

        // Enemy types toggle — collapsed by default
        const lt2 = waveSection.querySelector('#vc-legend-toggle2');
        const ll2 = waveSection.querySelector('#vc-legend-list2');
        const lc2 = waveSection.querySelector('#vc-legend-chevron2');
        if (lt2 && ll2) {
            lt2.addEventListener('click', () => {
                const open = ll2.style.display !== 'none';
                ll2.style.display = open ? 'none' : 'flex';
                if (lc2) lc2.style.transform = open ? '' : 'rotate(90deg)';
            });
        }

        // Wave card click
        const det2 = waveSection.querySelector('#vc-wv-detail2');
        let activeWave = null;
        waveSection.querySelectorAll('[data-wcard]').forEach(card => {
            card.addEventListener('click', () => {
                const wNum = parseInt(card.dataset.wcard);
                const w = preview.find(x => x.wave === wNum);
                if (activeWave === wNum) { activeWave = null; det2.style.display = 'none'; return; }
                activeWave = wNum;
                det2.style.display = 'block';
                const rows = w.types.map(t => `<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px solid #1a252f;">
                    <span style="font-size:18px;">${t.emoji}</span>
                    <div style="flex:1;"><div style="font-size:11px;font-weight:bold;color:#ecf0f1;">${t.label}</div>
                    <div style="font-size:10px;color:#95a5a6;">${t.desc}</div></div>
                    <div style="font-size:10px;color:#7fb3d3;white-space:nowrap;text-align:right;">❤️${t.hp}<br>🛡️${t.armor}</div>
                </div>`).join('');
                det2.innerHTML = `<div style="font-size:11px;font-weight:bold;color:#7fb3d3;margin-bottom:5px;">Wave ${wNum}${w.isBoss?' — 🔥 Boss':''}</div>${rows}`;
            });
        });
    }

    renderDots();
    renderWavePreview();

    // ── Bottom action bar ────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.style.cssText = 'flex-shrink:0;padding:10px 14px;padding-bottom:max(20px,env(safe-area-inset-bottom,20px));border-top:1px solid #34495e;background:#1a252f;';
    footer.innerHTML = `<button id="vc-hex-go" style="width:100%;padding:16px;background:#2ecc71;border:2px solid #27ae60;border-radius:8px;color:white;font-weight:bold;font-size:17px;cursor:pointer;letter-spacing:0.5px;">⚔️ Enter Battle</button>`;
    overlay.appendChild(footer);

    footer.querySelector('#vc-hex-go').onclick = () => {
        const unlockedActual = isStageUnlocked(_meta, tpl.id, selectedD);
        if (!unlockedActual && !_debugUnlockAll) return;
        overlay.remove();
        _startBattle(tpl.id, selectedD, _gameMode);
    };

    header.querySelector('#vc-hex-close').onclick = () => overlay.remove();

    _screens.game.querySelector('#vc-camp-layer').appendChild(overlay);
}

function _confirmAndStartBattle(templateId, difficulty) {
    const tpl = TEMPLATES.find(t => t.id === templateId);
    const minimapSvg = getTemplateMinimap(templateId, 90, 115);
    const waves = 10 + 7 * difficulty + (_meta.skills.bonusWaves || 0) * 3;
    const baseArmor = Math.floor((difficulty - 1) / 2);

    const existing = _screens.game.querySelector('#vc-map-confirm');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'vc-map-confirm';
    modal.style.cssText = [
        'position:absolute', 'inset:0', 'background:rgba(26,37,47,0.97)',
        'display:flex', 'flex-direction:column', 'align-items:center',
        'justify-content:flex-start', 'z-index:100', 'padding:16px 16px 80px',
        'gap:12px', 'overflow-y:auto', '-webkit-overflow-scrolling:touch'
    ].join(';');

    const cleared = isStageCleared(_meta, templateId, difficulty);
    const statusLine = cleared
        ? `<span style="color:#2ecc71">✅ Previously cleared</span>`
        : `<span style="color:#f39c12">⚔️ Not yet cleared</span>`;

    // ── Wave preview data ────────────────────────────────────────────────────
    const preview   = getWavePreview(waves, difficulty);

    // Show ALL enemy types that can appear at this difficulty (not just in preview wave count).
    // Use a high wave number to capture late-unlocking types.
    const fullPool = getWavePreview(80, difficulty);
    const legendMap = new Map();
    fullPool.forEach(w => w.types.forEach(t => {
        if (!legendMap.has(t.typeId)) legendMap.set(t.typeId, t);
    }));

    // Build wave card HTML
    const waveCardsHtml = preview.map(w => {
        const isBoss = w.isBoss;
        const cardBg  = isBoss ? '#3d0a0a'  : '#1e2d3d';
        const cardBdr = isBoss ? '#e74c3c'  : '#2c4a66';
        const numClr  = isBoss ? '#e74c3c'  : '#7fb3d3';
        const emojis  = isBoss
            ? `<div style="font-size:22px;line-height:1.1;margin:2px 0;">👹</div>`
            : `<div style="font-size:14px;line-height:1.3;letter-spacing:1px;margin:2px 0;">${w.types.map(t=>t.emoji).join('')}</div>`;

        const hpLine = isBoss
            ? `<div style="font-size:9px;color:#f39c12;font-weight:bold;">❤️ ${w.types[0].hp.toLocaleString()}</div>`
            : (() => {
                const hps = w.types.map(t=>t.hp);
                const lo = Math.min(...hps), hi = Math.max(...hps);
                return `<div style="font-size:9px;color:#aac8e0;">❤️ ${lo === hi ? lo : lo+'–'+hi}</div>`;
            })();

        const armorVal = Math.max(...w.types.map(t=>t.armor));
        const flags    = [
            armorVal > 0 ? `🛡️${armorVal}` : null,
            w.types.some(t=>t.immune.length) ? '🚫' : null,
            w.types.some(t=>t.regen > 0)    ? '💚' : null,
        ].filter(Boolean).join(' ');

        const countLine = isBoss
            ? `<div style="font-size:8px;color:#e74c3c;font-weight:bold;">BOSS</div>`
            : `<div style="font-size:9px;color:#bdc3c7;">~${w.slots} units</div>`;

        return `<div data-wcard="${w.wave}" style="
            flex-shrink:0; width:64px; min-height:98px;
            background:${cardBg}; border:1px solid ${cardBdr};
            border-radius:7px; padding:5px 3px; cursor:pointer;
            display:flex; flex-direction:column; align-items:center;
            gap:1px; text-align:center;
            transition:border-color 0.15s, transform 0.1s;
        ">
            <div style="font-size:10px;font-weight:bold;color:${numClr};">W${w.wave}${isBoss?' 🔥':''}</div>
            ${emojis}
            ${countLine}
            ${hpLine}
            <div style="font-size:9px;color:#95a5a6;">${flags || '–'}</div>
        </div>`;
    }).join('');

    // ── Enemy type legend entries ────────────────────────────────────────────
    const legendHtml = [...legendMap.values()].map(t => {
        const immBadge = t.immune.length
            ? `<span style="background:#2c3e50;padding:1px 3px;border-radius:3px;font-size:9px;color:#e74c3c;margin-left:3px;">🚫 ${t.immune.join('/')}</span>`
            : '';
        const regenBadge = t.regen > 0
            ? `<span style="background:#2c3e50;padding:1px 3px;border-radius:3px;font-size:9px;color:#2ecc71;margin-left:3px;">♻️ regen</span>`
            : '';
        return `<div data-legend="${t.typeId}" style="
            display:flex; align-items:flex-start; gap:6px;
            padding:5px 6px; background:#1a252f; border-radius:5px;
            border-left:3px solid #2c4a66; cursor:pointer; transition:border-color 0.15s;
        ">
            <span style="font-size:18px;line-height:1;">${t.emoji}</span>
            <div style="flex:1;min-width:0;">
                <div style="font-size:11px;font-weight:bold;color:#ecf0f1;">${t.label}${immBadge}${regenBadge}</div>
                <div style="font-size:10px;color:#95a5a6;line-height:1.35;">${t.desc}</div>
            </div>
            <div style="text-align:right;white-space:nowrap;font-size:10px;color:#7fb3d3;">
                ❤️${t.hp}<br>🛡️${t.armor}<br>⚡${t.speed}
            </div>
        </div>`;
    }).join('');

    modal.innerHTML = `
        <div style="font-size:18px;font-weight:bold;color:#f1c40f;text-align:center;">${tpl.name} — D${difficulty}</div>

        <div style="display:flex;gap:12px;align-items:flex-start;width:100%;">
            <div style="flex-shrink:0;border-radius:6px;overflow:hidden;border:2px solid #3498db;">${minimapSvg}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:11px;color:#bdc3c7;line-height:1.5;margin-bottom:8px;">${tpl.desc}</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;font-size:11px;">
                    <span style="background:#34495e;padding:3px 8px;border-radius:4px;color:#ecf0f1;font-size:11px;font-weight:bold;">🌊 ${waves} waves</span>
                    <span style="background:#34495e;padding:3px 8px;border-radius:4px;color:#ecf0f1;font-size:11px;font-weight:bold;">🛡️ +${baseArmor} armor</span>
                    <span style="background:#34495e;padding:3px 8px;border-radius:4px;color:#ecf0f1;font-size:11px;font-weight:bold;">💰 ${difficulty}× XP</span>
                    <span style="background:#34495e;padding:3px 8px;border-radius:4px;color:#ecf0f1;font-size:11px;font-weight:bold;">${statusLine}</span>
                </div>
            </div>
        </div>

        <div style="width:100%;display:flex;flex-direction:column;gap:6px;">
            <div style="font-size:10px;font-weight:bold;color:#f1c40f;text-transform:uppercase;letter-spacing:1px;">📋 Wave Preview</div>
            <div id="vc-wv-scroll" style="display:flex;gap:5px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:3px 1px 6px;">
                ${waveCardsHtml}
            </div>
        </div>

        <div id="vc-wv-detail" style="display:none;width:100%;background:#1a2d3d;border:1px solid #2c4a66;border-radius:7px;padding:8px;"></div>

        <div style="width:100%;display:flex;flex-direction:column;gap:6px;">
            <div id="vc-legend-toggle" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;padding:6px 8px;background:#1a2d3d;border:1px solid #2c4a66;border-radius:7px;">
                <div style="font-size:10px;font-weight:bold;color:#f1c40f;text-transform:uppercase;letter-spacing:1px;">👾 Enemy Types</div>
                <div id="vc-legend-chevron" style="font-size:12px;color:#7fb3d3;transition:transform 0.2s;">▶</div>
            </div>
            <div id="vc-legend-list" style="display:none;flex-direction:column;gap:5px;">
                ${legendHtml}
            </div>
        </div>

        <div style="display:flex;gap:12px;width:100%;padding-top:4px;">
            <button id="vc-confirm-go"   style="flex:1;padding:14px;background:#2ecc71;border:2px solid #27ae60;border-radius:6px;color:white;font-weight:bold;font-size:15px;cursor:pointer;">⚔️ Enter</button>
            <button id="vc-confirm-back" style="flex:1;padding:14px;background:#34495e;border:2px solid #7f8c8d;border-radius:6px;color:white;font-weight:bold;font-size:15px;cursor:pointer;">← Back</button>
        </div>
    `;

    _screens.game.querySelector('#vc-camp-layer').appendChild(modal);
    modal.querySelector('#vc-confirm-go').onclick   = () => { modal.remove(); _startBattle(templateId, difficulty, _gameMode); };
    modal.querySelector('#vc-confirm-back').onclick = () => modal.remove();

    // ── Enemy types toggle ───────────────────────────────────────────────────
    const legendToggle = modal.querySelector('#vc-legend-toggle');
    const legendList   = modal.querySelector('#vc-legend-list');
    const chevron      = modal.querySelector('#vc-legend-chevron');
    legendToggle.addEventListener('click', () => {
        const open = legendList.style.display !== 'none';
        legendList.style.display  = open ? 'none' : 'flex';
        chevron.style.transform   = open ? '' : 'rotate(90deg)';
    });

    // ── Wave card click → expand detail ──────────────────────────────────────
    const detailEl  = modal.querySelector('#vc-wv-detail');
    let   activeWave = null;

    modal.querySelectorAll('[data-wcard]').forEach(card => {
        card.addEventListener('click', () => {
            const wNum = parseInt(card.dataset.wcard);
            const w    = preview.find(x => x.wave === wNum);

            // Toggle off if same card clicked twice
            if (activeWave === wNum) {
                activeWave = null;
                detailEl.style.display = 'none';
                card.style.borderColor = w.isBoss ? '#e74c3c' : '#2c4a66';
                return;
            }

            // Deselect previous card
            if (activeWave !== null) {
                const prev = preview.find(x => x.wave === activeWave);
                const prevEl = modal.querySelector(`[data-wcard="${activeWave}"]`);
                if (prevEl) prevEl.style.borderColor = prev?.isBoss ? '#e74c3c' : '#2c4a66';
            }

            activeWave = wNum;
            card.style.borderColor = '#f1c40f';
            detailEl.style.display = 'block';

            const headerClr = w.isBoss ? '#e74c3c' : '#7fb3d3';
            const title     = w.isBoss
                ? `<div style="font-size:12px;font-weight:bold;color:#e74c3c;margin-bottom:6px;">🔥 Wave ${w.wave} — Boss Wave</div>`
                : `<div style="font-size:12px;font-weight:bold;color:#7fb3d3;margin-bottom:6px;">Wave ${w.wave} — ~${w.slots} units</div>`;

            const rows = w.types.map(t => {
                const immBadge  = t.immune.length
                    ? `<span style="color:#e74c3c;font-size:9px;"> 🚫${t.immune.join('/')}</span>` : '';
                const regenBadge = t.regen > 0
                    ? `<span style="color:#2ecc71;font-size:9px;"> ♻️regen</span>` : '';
                return `<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px solid #1a252f;">
                    <span style="font-size:20px;line-height:1;">${t.emoji}</span>
                    <div style="flex:1;">
                        <div style="font-size:11px;font-weight:bold;color:#ecf0f1;">${t.label}${immBadge}${regenBadge}</div>
                        <div style="font-size:10px;color:#95a5a6;line-height:1.3;">${t.desc}</div>
                    </div>
                    <div style="font-size:10px;color:#7fb3d3;white-space:nowrap;text-align:right;">
                        ❤️ ${t.hp.toLocaleString()}<br>
                        🛡️ ${t.armor} &nbsp;⚡ ${t.speed}
                    </div>
                </div>`;
            }).join('');

            detailEl.innerHTML = title + rows;

            // Scroll detail into view
            detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    });
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

function _startBattle(templateId, difficulty, gameMode = 'hard') {
    _activeTier = difficulty;  // keep _activeTier for any legacy refs

    _screens.game.querySelector('#vc-camp-layer').style.display = 'none';
    _screens.game.querySelector('#vc-battle-layer').style.display = 'flex';

    const mapData = generateMap(9, 13, difficulty, templateId);

    // If the requested template couldn't generate a valid map, show a brief toast.
    if (mapData.usedFallback) {
        const requestedName = TEMPLATES.find(t => t.id === templateId)?.name ?? templateId;
        const toast = document.createElement('div');
        toast.style.cssText = [
            'position:fixed', 'top:60px', 'left:50%', 'transform:translateX(-50%)',
            'background:#c0392b', 'color:#fff', 'font-size:13px', 'font-weight:bold',
            'padding:8px 16px', 'border-radius:8px', 'z-index:9999',
            'box-shadow:0 4px 12px rgba(0,0,0,0.5)', 'text-align:center',
            'transition:opacity 0.4s ease', 'pointer-events:none'
        ].join(';');
        toast.textContent = `⚠️ "${requestedName}" map failed — playing Gauntlet instead`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; }, 3000);
        setTimeout(() => { toast.remove(); }, 3500);
    }

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
    }, gameMode);

    // gameMode already stored on _engine via constructor
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