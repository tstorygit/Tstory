import { mountVocabSelector, getBannedWords } from '../../vocab_selector.js';
import * as srsDb from '../../srs_db.js';
import { loadMeta, saveMeta, addXP, resetSkills, SKILL_DEFS, getDefaultSave,
         clearStage, highestDifficultyCleared, isStageCleared, isStageUnlocked,
         getEffectiveSkills, recordStageXP, getStageXPBudget, RUN_MODIFIERS, combinedXpMult,
         saveMidRun, loadMidRunSlots, deleteMidRunSlot } from './vc_meta.js';
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
let _customDeckActive = false; // true when user explicitly chose a non-SRS deck

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
                        <button class="vc-btn" id="vc-btn-load-run" style="background:#2c3e50; border-color:#4a5568;">📂 Load</button>
                        <button class="vc-btn" id="vc-btn-grimoire" style="background:#f39c12; border-color:#d35400;">📖 Grimoire</button>
                        <button class="vc-icon-btn" id="vc-btn-settings" title="Settings" style="background:#2c3e50;border-color:#4a5568;font-size:18px;padding:4px 8px;min-width:0;line-height:1;">⚙️</button>
                        <button class="vc-icon-btn" id="vc-btn-howto-camp" title="How to Play" style="background:#2c3e50;border-color:#4a5568;font-size:18px;padding:4px 8px;min-width:0;line-height:1;">ℹ️</button>
                    </div>
                </div>
                <div class="vc-stage-list" id="vc-stage-list"></div>
            </div>

            <div id="vc-battle-layer" class="vc-root" style="display:none;">
                <div class="vc-topbar vc-topbar-row1">
                    <div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;">
                        <div style="display:flex;align-items:center;gap:0;flex-wrap:nowrap;">
                            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                                <span class="vc-mana">💧 <span id="vc-val-mana">300</span></span>
                                <span style="font-size:10px;color:#bdc3c7;white-space:nowrap;">/ <span id="vc-val-pool-cap">300</span></span>
                                <span style="font-size:11px;color:#f1c40f;font-weight:bold;white-space:nowrap;">P<span id="vc-val-pool-level">1</span></span>
                            </div>
                            <div id="vc-combo-wrap" style="display:flex;flex-direction:column;gap:1px;min-width:0;max-width:90px;margin-left:8px;visibility:hidden;opacity:0;transition:opacity 0.2s;overflow:hidden;">
                                <span style="font-size:10px;color:#7f8c8d;line-height:1;white-space:nowrap;">COMBO</span>
                                <span style="font-size:11px;font-weight:bold;line-height:1;white-space:nowrap;" id="vc-combo-inner">⚡<span id="vc-val-combo">0</span> <span id="vc-val-combo-mult" style="font-size:10px;">(×1.00)</span></span>
                                <div style="height:3px;background:rgba(255,255,255,0.15);border-radius:2px;overflow:hidden;">
                                    <div id="vc-combo-bar" style="height:100%;width:100%;background:#e67e22;border-radius:2px;transition:width 0.1s linear;"></div>
                                </div>
                            </div>
                        </div>
                        <div style="height:6px;background:#1a252f;border-radius:3px;overflow:hidden;width:100%;">
                            <div id="vc-mana-bar-fill" style="height:100%;width:100%;background:#f1c40f;transition:width 0.2s,background 0.3s;border-radius:3px;"></div>
                        </div>
                    </div>
                    <button class="vc-icon-btn vc-grimoire-btn" id="vc-btn-grimoire-battle">📖</button>
                    <button class="vc-icon-btn" id="vc-btn-howto" title="How to Play" style="background:#2c3e50;border-color:#4a5568;padding:3px 6px;min-width:0;">ℹ️</button>
                    <button class="vc-icon-btn" id="vc-btn-zoom" title="Zoom" style="background:#2c3e50;border-color:#34495e;min-width:36px;">🔍</button>
                    <button class="vc-icon-btn" id="vc-btn-speed">⚡1x</button>
                    <button class="vc-icon-btn" id="vc-btn-pause" style="background:#2980b9; border-color:#1a5276;">⏸</button>
                    <button class="vc-icon-btn vc-flee-btn" id="vc-btn-surrender">🚪</button>
                </div>
                <div class="vc-topbar vc-topbar-row2">
                    <div class="vc-wave-tracker"></div>
                </div>
                <div class="vc-map-container"><div class="vc-grid"></div></div>
                <div class="vc-sidebar-panel">
                    <div class="vc-bottombar"></div>
                </div>
            </div>

            <div class="vc-grimoire-overlay" id="vc-grimoire-overlay" style="display:none;">
                <div class="vc-grimoire-header">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:18px; font-weight:bold; color:#f1c40f;">📖 Grimoire</span>
                        <span class="vc-grimoire-sp" id="vc-grimoire-sp">0 SP</span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button class="vc-grimoire-hdr-btn" id="vc-btn-reset-skills" style="background:#c0392b;">↺ Reset</button>
                        <button class="vc-grimoire-hdr-btn" id="vc-btn-close-grimoire">✕ Close</button>
                    </div>
                </div>
                <div class="vc-skill-list" id="vc-skill-list"></div>
            </div>
        `;

        _screens.game.querySelector('#vc-btn-load-run').onclick = () => _showLoadRunModal();

        _screens.game.querySelector('#vc-btn-grimoire').onclick = () => {
            _renderGrimoire();
            _screens.game.querySelector('#vc-grimoire-overlay').style.display = 'flex';
        };

        // ⚙️ Settings button — opens the settings overlay
        _screens.game.querySelector('#vc-btn-settings').onclick = () => _showSettingsOverlay();
        _screens.game.querySelector('#vc-btn-howto-camp').onclick = () => _showHowToOverlay();

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
        
        // How to Play info button
        _screens.game.querySelector('#vc-btn-howto').onclick = () => {
            if (_engine && _engine.state.status === 'playing') _engine.pause();
            _showHowToOverlay();
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
    if (srsQueue.length > 0 && !_customDeckActive) {
        // SRS words available and user hasn't chosen a custom deck — use SRS.
        setVocabQueue(srsQueue);
        _show('game');
        _showCamp();
    } else if (srsQueue.length === 0) {
        // No SRS words at all — show the deck selector.
        _show('setup');
        _renderSetup();
    } else {
        // Custom deck active — go straight to camp with whatever queue is set.
        _show('game');
        _showCamp();
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
        _customDeckActive = true;  // user explicitly chose this deck — don't override with SRS
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

function _showHowToOverlay() {
    const stale = document.getElementById('vc-howto-overlay');
    if (stale) stale.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vc-howto-overlay';
    overlay.style.cssText = [
        'position:fixed','inset:0','background:rgba(15,20,28,0.97)',
        'z-index:400','display:flex','flex-direction:column',
        'overflow-y:auto','-webkit-overflow-scrolling:touch',
        'padding:16px','gap:0','font-family:inherit'
    ].join(';');

    const GEM_DATA = [
        { color: '#e74c3c', label: 'Ruby',     type: 'Damage',      desc: 'Pure single-target damage. Your primary DPS gem. Scales well with Ruby Mastery.' },
        { color: '#3498db', label: 'Sapphire', type: 'Slow',        desc: 'Slows enemy movement speed. Buys time for other gems. Immune: Specter & Phantom.' },
        { color: '#2ecc71', label: 'Emerald',  type: 'Poison',      desc: 'Damage-over-time. Great vs. high-HP and regenerating enemies. Immune: Specter & Phantom.' },
        { color: '#f39c12', label: 'Topaz',    type: 'Mana Leech',  desc: 'Steals mana from enemies on hit. Essential for sustaining your economy mid-wave.' },
        { color: '#f1c40f', label: 'Citrine',  type: 'Crit',        desc: 'Critical hits deal multiplied damage. High ceiling with Citrine Mastery stacks.' },
        { color: '#9b59b6', label: 'Amethyst', type: 'Armor Tear',  desc: 'Permanently strips enemy armor on hit. Mandatory vs. Ironclaids, Giants, Titans. Only answer for Cursed.' },
    ];

    const sections = [
        {
            title: '💎 Gem Colors',
            html: GEM_DATA.map(g => `
                <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #1a252f;">
                    <div style="width:18px;height:18px;border-radius:3px;background:${g.color};flex-shrink:0;margin-top:2px;box-shadow:0 0 6px ${g.color}44;"></div>
                    <div>
                        <span style="font-weight:bold;color:${g.color};">${g.label}</span>
                        <span style="font-size:11px;color:#7f8c8d;margin-left:6px;">${g.type}</span>
                        <div style="font-size:12px;color:#bdc3c7;margin-top:2px;">${g.desc}</div>
                    </div>
                </div>
            `).join('')
        },
        {
            title: '🏰 Towers vs ⚙️ Traps',
            html: `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px;">
                    <div style="background:#1a2a3a;border-radius:8px;padding:10px;">
                        <div style="font-size:14px;font-weight:bold;margin-bottom:6px;">🏰 Tower</div>
                        <div style="font-size:12px;color:#bdc3c7;line-height:1.6;">
                            Built on <strong style="color:#2ecc71;">grass</strong> tiles.<br>
                            Long range — wide area coverage.<br>
                            Normal fire rate &amp; damage.
                        </div>
                    </div>
                    <div style="background:#1a2a3a;border-radius:8px;padding:10px;">
                        <div style="font-size:14px;font-weight:bold;margin-bottom:6px;">⚙️ Trap</div>
                        <div style="font-size:12px;color:#bdc3c7;line-height:1.6;">
                            Built on <strong style="color:#c0392b;">path</strong> tiles.<br>
                            Short range, tight coverage.<br>
                            3× faster fire rate.
                        </div>
                    </div>
                </div>
                <div style="font-size:12px;color:#7f8c8d;margin-top:8px;">Trap Specialization skill boosts trap fire rate, damage, and special effect multipliers.</div>
            `
        },
        {
            title: '⬆️ Upgrading & Forging Gems',
            html: `<div style="font-size:12px;color:#bdc3c7;line-height:1.7;">
                <p style="margin:4px 0;">Each action costs mana and requires answering a <strong style="color:#f1c40f;">vocab card</strong>.</p>
                <p style="margin:4px 0;">✅ <strong style="color:#2ecc71;">Correct</strong> — mana spent, action completes. Your selection stays for the next build.</p>
                <p style="margin:4px 0;">❌ <strong style="color:#e74c3c;">Wrong</strong> — mana penalty only. Gem color &amp; level selection is preserved.</p>
                <p style="margin:4px 0;">The slider shows the <strong style="color:#f1c40f;">7 highest tiers</strong> you can currently afford and shifts up as you earn more mana.</p>
            </div>`
        },
        {
            title: '🔄 Swapping Gems',
            html: `<div style="font-size:12px;color:#bdc3c7;line-height:1.7;">
                <p style="margin:4px 0;"><strong style="color:#f1c40f;">Drag any gem</strong> from one tower or trap to another to swap them — no mana cost, no vocab card.</p>
                <p style="margin:4px 0;">A colored ghost follows your finger. Drop on a target to swap. Works with empty slots too.</p>
            </div>`
        },
        {
            title: '⚡ Enraging Waves',
            html: `<div style="font-size:12px;color:#bdc3c7;line-height:1.7;">
                <p style="margin:4px 0;">Tap the <strong style="color:#e74c3c;">wave icon</strong> before a wave starts to open the Enrage screen.</p>
                <p style="margin:4px 0;">Choose a level, pay mana, answer vocab cards. <strong style="color:#2ecc71;">More correct than wrong</strong> = enrage succeeds.</p>
                <p style="margin:4px 0;">Enraged waves have boosted HP &amp; speed but grant more XP.</p>
            </div>`
        },
        {
            title: '💧 Mana Pool',
            html: `<div style="font-size:12px;color:#bdc3c7;line-height:1.7;">
                <p style="margin:4px 0;">Mana is earned by killing enemies. The pool levels up over time, raising the cap and giving all gems a passive damage bonus.</p>
                <p style="margin:4px 0;">Enemies reaching your base <strong style="color:#e74c3c;">drain mana</strong>. Mana Thief drains 2.5×.</p>
                <p style="margin:4px 0;">Topaz gems leech mana on hit — crucial for sustaining fast-wave builds.</p>
            </div>`
        },
    ];

    overlay.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-shrink:0;">
            <div style="font-size:20px;font-weight:bold;color:#f1c40f;">ℹ️ How to Play</div>
            <button id="vc-howto-close" style="background:#34495e;border:2px solid #7f8c8d;border-radius:8px;color:#fff;font-size:14px;font-weight:bold;padding:6px 14px;cursor:pointer;">✕ Close</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px;padding-bottom:max(24px,env(safe-area-inset-bottom,24px));">
            ${sections.map(s => `
                <div style="background:#1a252f;border-radius:10px;padding:12px 14px;">
                    <div style="font-size:15px;font-weight:bold;color:#ecf0f1;margin-bottom:8px;">${s.title}</div>
                    ${s.html}
                </div>
            `).join('')}
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('#vc-howto-close').onclick = () => {
        overlay.remove();
        if (_engine && _engine.state.status === 'paused') _engine.resume();
    };
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

        <!-- Render Quality -->
        <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:10px;font-weight:bold;color:#f1c40f;text-transform:uppercase;letter-spacing:1px;">🖼️ Render Quality</div>
            <div style="display:flex;gap:6px;">
                <button class="vc-quality-btn" data-quality="fast" style="flex:1;padding:10px 4px;border:2px solid;border-radius:8px;color:white;font-size:13px;font-weight:bold;cursor:pointer;text-align:center;">⚡ Fast<div style="font-size:10px;color:#bdc3c7;font-weight:normal;margin-top:3px;">Better FPS</div></button>
                <button class="vc-quality-btn" data-quality="hd"   style="flex:1;padding:10px 4px;border:2px solid;border-radius:8px;color:white;font-size:13px;font-weight:bold;cursor:pointer;text-align:center;">✨ HD<div style="font-size:10px;color:#bdc3c7;font-weight:normal;margin-top:3px;">Crisp sprites</div></button>
            </div>
            <div style="font-size:11px;color:#7f8c8d;">Takes effect on the next battle. Fast is recommended for mobile.</div>
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

    // Render quality buttons
    const _curQuality = () => localStorage.getItem('vocabcraft_quality') || 'fast';
    overlay.querySelectorAll('.vc-quality-btn').forEach(btn => {
        const refresh = () => {
            const q = _curQuality();
            overlay.querySelectorAll('.vc-quality-btn').forEach(b => {
                b.style.background  = b.dataset.quality === q ? '#1a3a5c' : '#1a252f';
                b.style.borderColor = b.dataset.quality === q ? '#3498db' : '#4a5568';
            });
        };
        refresh();
        btn.onclick = () => {
            localStorage.setItem('vocabcraft_quality', btn.dataset.quality);
            refresh();
        };
    });

    // Words
    overlay.querySelector('#vc-settings-words').onclick = () => {
        overlay.remove();
        _customDeckActive = false;  // reset so user can re-select SRS or a new deck
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

    // Only refresh the SRS queue if the user hasn't explicitly chosen a custom deck.
    if (!_customDeckActive) {
        const freshSrs = _buildSrsQueue();
        if (freshSrs.length > 0) {
            setVocabQueue(freshSrs);
        }
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
    const nextTier     = unlockedTier + 1; // grey-preview; beyond = black

    const HEX_R    = 68;
    const HEX_W    = 2 * HEX_R;
    const HEX_H    = Math.sqrt(3) * HEX_R;
    const COL_STEP = HEX_W * 0.75;
    const ROW_STEP = HEX_H;
    const PAD      = HEX_R + 14; // extra pad so group outlines don\'t clip

    function hexCenter(col, row) {
        return {
            x: PAD + col * COL_STEP,
            y: PAD + row * ROW_STEP + (col % 2 === 1 ? HEX_H / 2 : 0)
        };
    }

    function hexVerts(cx, cy, r) {
        const pts = [];
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
        return pts;
    }

    function hexPath(cx, cy, r) {
        return 'M' + hexVerts(cx, cy, r)
            .map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + 'Z';
    }

    const centres = layout.map(n => hexCenter(n.hexCol, n.hexRow));
    const svgW = Math.ceil(Math.max(...centres.map(c => c.x)) + PAD + HEX_R);
    const svgH = Math.ceil(Math.max(...centres.map(c => c.y)) + PAD + HEX_H * 0.5);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg   = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width',  svgW);
    svg.setAttribute('height', svgH);
    svg.style.cssText = 'display:block;overflow:visible;touch-action:pan-x pan-y;';

    const defs = document.createElementNS(svgNS, 'defs');

    // ── blur filter for group glow outline ──────────────────────────────────
    const filt = document.createElementNS(svgNS, 'filter');
    filt.setAttribute('id', 'groupGlow');
    filt.setAttribute('x', '-20%'); filt.setAttribute('y', '-20%');
    filt.setAttribute('width', '140%'); filt.setAttribute('height', '140%');
    const fe = document.createElementNS(svgNS, 'feGaussianBlur');
    fe.setAttribute('stdDeviation', '5');
    filt.appendChild(fe);
    defs.appendChild(filt);

    svg.appendChild(defs);

    // ── Layer 0: per-tier group outline (glow band behind all hexes) ────────
    // Group all nodes by tier, build union of inflated hex paths, draw as one
    // thick blurred stroke so adjacent same-tier hexes visually merge.
    const maxTier = Math.max(...layout.map(n => n.tier));
    for (let tier = 1; tier <= maxTier; tier++) {
        const tierNodes = layout.filter(n => n.tier === tier);
        const colors    = HEX_TIER_COLORS[tier];
        const isLocked  = tier > unlockedTier && !_debugUnlockAll;
        const isPreview = tier === nextTier && !_debugUnlockAll;

        if (isLocked && !isPreview) continue; // fully black tiers need no outline

        const outlineColor = isPreview ? 'rgba(120,120,120,0.35)' : colors.border;

        // Draw one inflated hex per node in this tier as a group — SVG will
        // visually merge overlapping strokes into a contiguous band.
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('filter', 'url(#groupGlow)');
        g.setAttribute('pointer-events', 'none');

        tierNodes.forEach((node, i) => {
            const { x: cx, y: cy } = centres[layout.indexOf(node)];
            const outline = document.createElementNS(svgNS, 'path');
            outline.setAttribute('d', hexPath(cx, cy, HEX_R + 7));
            outline.setAttribute('fill', 'none');
            outline.setAttribute('stroke', outlineColor);
            outline.setAttribute('stroke-width', '10');
            outline.setAttribute('stroke-linejoin', 'round');
            g.appendChild(outline);
        });
        svg.appendChild(g);

        // Crisp inner border ring (no blur) on top — drawn without filter
        tierNodes.forEach(node => {
            const { x: cx, y: cy } = centres[layout.indexOf(node)];
            const ring = document.createElementNS(svgNS, 'path');
            ring.setAttribute('d', hexPath(cx, cy, HEX_R + 5));
            ring.setAttribute('fill', 'none');
            ring.setAttribute('stroke', isPreview ? 'rgba(100,100,100,0.5)' : colors.border);
            ring.setAttribute('stroke-width', isPreview ? '1.5' : '2');
            ring.setAttribute('stroke-linejoin', 'round');
            ring.setAttribute('pointer-events', 'none');
            svg.appendChild(ring);
        });
    }

    // ── Layers 1–N: individual hexes ────────────────────────────────────────
    layout.forEach((node, idx) => {
        const tpl = TEMPLATES.find(t => t.id === node.id);
        if (!tpl) return;

        const tplLockedActual = node.tier > unlockedTier;
        const tplLocked       = tplLockedActual && !_debugUnlockAll;
        const isPreview       = node.tier === nextTier && !_debugUnlockAll; // grey silhouette
        const isBlackout      = node.tier > nextTier  && !_debugUnlockAll; // completely hidden
        const colors          = HEX_TIER_COLORS[node.tier];
        const { x: cx, y: cy } = centres[idx];

        // ── Hex background ──────────────────────────────────────────────────
        const hexBg = document.createElementNS(svgNS, 'path');
        hexBg.setAttribute('d', hexPath(cx, cy, HEX_R - 1));
        if (isBlackout) {
            hexBg.setAttribute('fill',   '#0a0a0a');
            hexBg.setAttribute('stroke', '#111');
        } else if (isPreview) {
            hexBg.setAttribute('fill',   '#1c1c1c');
            hexBg.setAttribute('stroke', '#383838');
        } else {
            hexBg.setAttribute('fill',   colors.bg);
            hexBg.setAttribute('stroke', colors.border);
        }
        hexBg.setAttribute('stroke-width', '2.5');
        svg.appendChild(hexBg);

        if (isBlackout) {
            // Completely dark — no label, no icon, no interaction
            return;
        }

        if (isPreview) {
            // Grey silhouette: dimmed minimap + dark overlay + muted name only
            const clipId = `hclip-${node.id}`;
            const clip   = document.createElementNS(svgNS, 'clipPath');
            clip.setAttribute('id', clipId);
            const cp = document.createElementNS(svgNS, 'path');
            cp.setAttribute('d', hexPath(cx, cy, HEX_R - 4));
            clip.appendChild(cp);
            defs.appendChild(clip);

            const mmSize   = Math.floor(HEX_R * 1.55);
            const mmSvgStr = getTemplateMinimap(tpl.id, mmSize, mmSize);
            const fo = document.createElementNS(svgNS, 'foreignObject');
            fo.setAttribute('x', (cx - mmSize / 2).toFixed(1));
            fo.setAttribute('y', (cy - mmSize / 2).toFixed(1));
            fo.setAttribute('width',  mmSize);
            fo.setAttribute('height', mmSize);
            fo.setAttribute('clip-path', `url(#${clipId})`);
            fo.setAttribute('pointer-events', 'none');
            // Desaturate via CSS filter on the inner div
            fo.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="filter:grayscale(1) brightness(0.35);">${mmSvgStr}</div>`;
            svg.appendChild(fo);

            // Heavy dark veil
            const veil = document.createElementNS(svgNS, 'path');
            veil.setAttribute('d',    hexPath(cx, cy, HEX_R - 4));
            veil.setAttribute('fill', 'rgba(0,0,0,0.55)');
            veil.setAttribute('pointer-events', 'none');
            svg.appendChild(veil);

            // Muted name label
            const lbl = document.createElementNS(svgNS, 'text');
            lbl.setAttribute('x', cx);
            lbl.setAttribute('y', (cy + HEX_H * 0.28).toFixed(1));
            lbl.setAttribute('text-anchor', 'middle');
            lbl.setAttribute('font-size', tpl.name.length > 10 ? '9' : '10');
            lbl.setAttribute('font-weight', 'bold');
            lbl.setAttribute('font-family', 'Segoe UI, sans-serif');
            lbl.setAttribute('fill', '#555');
            lbl.setAttribute('pointer-events', 'none');
            lbl.textContent = tpl.name;
            svg.appendChild(lbl);

            // Lock icon
            const lock = document.createElementNS(svgNS, 'text');
            lock.setAttribute('x', cx);
            lock.setAttribute('y', (cy - HEX_H * 0.05).toFixed(1));
            lock.setAttribute('text-anchor', 'middle');
            lock.setAttribute('font-size', '22');
            lock.setAttribute('pointer-events', 'none');
            lock.setAttribute('opacity', '0.5');
            lock.textContent = '🔒';
            svg.appendChild(lock);

            // Clickable — opens detail with locked message
            const hitArea = document.createElementNS(svgNS, 'path');
            hitArea.setAttribute('d', hexPath(cx, cy, HEX_R - 1));
            hitArea.setAttribute('fill', 'transparent');
            hitArea.setAttribute('stroke', 'none');
            hitArea.style.cursor = 'pointer';
            hitArea.addEventListener('click', () => _showHexDetail(tpl, node, colors, true));
            svg.appendChild(hitArea);
            return;
        }

        // ── Fully unlocked hex ──────────────────────────────────────────────
        const clipId = `hclip-${node.id}`;
        const clip   = document.createElementNS(svgNS, 'clipPath');
        clip.setAttribute('id', clipId);
        const cp = document.createElementNS(svgNS, 'path');
        cp.setAttribute('d', hexPath(cx, cy, HEX_R - 4));
        clip.appendChild(cp);
        defs.appendChild(clip);

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

        const ov = document.createElementNS(svgNS, 'path');
        ov.setAttribute('d',    hexPath(cx, cy, HEX_R - 4));
        ov.setAttribute('fill', 'rgba(0,0,0,0.30)');
        ov.setAttribute('pointer-events', 'none');
        svg.appendChild(ov);

        // Name label
        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('x', cx);
        label.setAttribute('y', (cy + HEX_H * 0.28).toFixed(1));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', tpl.name.length > 10 ? '9' : '10');
        label.setAttribute('font-weight', 'bold');
        label.setAttribute('font-family', 'Segoe UI, sans-serif');
        label.setAttribute('fill', '#ecf0f1');
        label.setAttribute('stroke', 'rgba(0,0,0,0.8)');
        label.setAttribute('stroke-width', '2.5');
        label.setAttribute('paint-order', 'stroke');
        label.setAttribute('pointer-events', 'none');
        label.textContent = tpl.name;
        svg.appendChild(label);

        // Hit area — appended BEFORE the badge so badge renders on top in SVG paint order
        const hitArea = document.createElementNS(svgNS, 'path');
        hitArea.setAttribute('d',    hexPath(cx, cy, HEX_R - 1));
        hitArea.setAttribute('fill', 'transparent');
        hitArea.setAttribute('stroke', 'none');
        hitArea.style.cursor = 'pointer';
        hitArea.addEventListener('click', () => _showHexDetail(tpl, node, colors, false));
        svg.appendChild(hitArea);

        // ── Best-cleared badge — pill shape so it's always readable ─────────
        let bestD = 0;
        for (let d = 18; d >= 1; d--) {
            if (isStageCleared(_meta, tpl.id, d)) { bestD = d; break; }
        }
        if (bestD > 0) {
            const bx = cx + HEX_R * 0.55;
            const by = cy - HEX_H * 0.33;
            const pillW = 28, pillH = 16, pillR = 7;

            // Pill background
            const pill = document.createElementNS(svgNS, 'rect');
            pill.setAttribute('x', (bx - pillW / 2).toFixed(1));
            pill.setAttribute('y', (by - pillH / 2).toFixed(1));
            pill.setAttribute('width',  pillW);
            pill.setAttribute('height', pillH);
            pill.setAttribute('rx', pillR);
            pill.setAttribute('ry', pillR);
            pill.setAttribute('fill', '#b8860b');
            pill.setAttribute('stroke', '#f1c40f');
            pill.setAttribute('stroke-width', '1.5');
            pill.setAttribute('pointer-events', 'none');
            svg.appendChild(pill);

            // Star + difficulty text inside pill
            const badge = document.createElementNS(svgNS, 'text');
            badge.setAttribute('x', bx.toFixed(1));
            badge.setAttribute('y', (by + 4.5).toFixed(1));
            badge.setAttribute('text-anchor', 'middle');
            badge.setAttribute('font-size', '10');
            badge.setAttribute('font-weight', 'bold');
            badge.setAttribute('font-family', 'Segoe UI, sans-serif');
            badge.setAttribute('fill', '#fff7aa');
            badge.setAttribute('pointer-events', 'none');
            badge.textContent = `★D${bestD}`;
            svg.appendChild(badge);
        }
    });

    container.appendChild(svg);
}


function _showHexDetail(tpl, node, colors, tplLockedActual = false) {
    // Full-screen overlay replacing the camp layer content
    const existing = _screens.game.querySelector('#vc-hex-detail');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vc-hex-detail';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#1a252f;z-index:50;display:flex;flex-direction:column;overflow:hidden;';

    // ── Back bar ────────────────────────────────────────────────────────────
    const backBar = document.createElement('div');
    backBar.style.cssText = 'flex-shrink:0;padding:8px 14px;background:#1a252f;border-bottom:1px solid #34495e;';
    backBar.innerHTML = `<button id="vc-hex-close" style="display:flex;align-items:center;gap:6px;background:none;border:none;color:#bdc3c7;font-size:14px;font-weight:bold;cursor:pointer;padding:4px 0;">← Back to World Map</button>`;
    overlay.appendChild(backBar);

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
    `;
    overlay.appendChild(header);

    // ── Scrollable body ──────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 14px 24px;display:flex;flex-direction:column;gap:10px;min-height:0;';
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

    // ── XP Progress Panel ────────────────────────────────────────────────────
    // Shows all difficulties with budget / earned / remaining at a glance,
    // so the player can immediately see which stage is worth repeating.
    const xpPanel = document.createElement('div');
    xpPanel.style.cssText = 'background:#111d27;border:1px solid #2c4a66;border-radius:8px;overflow:hidden;';

    const xpPanelHeader = document.createElement('div');
    xpPanelHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 11px;cursor:pointer;user-select:none;background:#152030;';
    xpPanelHeader.innerHTML = `
        <div style="font-size:11px;font-weight:bold;color:#f1c40f;text-transform:uppercase;letter-spacing:1px;">📊 XP Progress</div>
        <div id="vc-xp-panel-chevron" style="font-size:11px;color:#7fb3d3;transition:transform 0.2s;">▶</div>`;

    const xpPanelBody = document.createElement('div');
    xpPanelBody.id = 'vc-xp-panel-body';
    xpPanelBody.style.cssText = 'display:none;padding:8px 10px 10px;';

    let xpPanelOpen = false;

    function renderXpPanel() {
        const fmt = n => n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(0)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : Math.round(n).toString();
        const earned = _meta.stageXPEarned || {};

        // Summary line: total earned vs total possible across all difficulties
        let totalEarned = 0, totalBudget = 0;
        for (let d = 1; d <= 18; d++) {
            const budget = getStageXPBudget(d);
            const best   = earned[`${tpl.id}:${d}`] || 0;
            totalBudget += budget;
            totalEarned += Math.min(best, budget);
        }
        const totalPct = totalBudget > 0 ? Math.round(totalEarned / totalBudget * 100) : 0;

        // Find best "next repeat" difficulty: highest remaining XP that's been unlocked
        let bestRepeatD = 0, bestRepeatRemaining = 0;
        for (let d = 1; d <= 18; d++) {
            if (!isStageUnlocked(_meta, tpl.id, d) && !_debugUnlockAll) continue;
            const budget    = getStageXPBudget(d);
            const best      = earned[`${tpl.id}:${d}`] || 0;
            const remaining = Math.max(0, budget - best);
            if (remaining > bestRepeatRemaining) {
                bestRepeatRemaining = remaining;
                bestRepeatD = d;
            }
        }

        let html = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <div style="font-size:11px;color:#bdc3c7;">Total: <span style="color:#f1c40f;font-weight:bold;">${fmt(totalEarned)}</span> / ${fmt(totalBudget)} XP</div>
                ${bestRepeatD > 0 && bestRepeatRemaining > 0
                    ? `<div style="font-size:10px;background:#1a3a1a;border:1px solid #2ecc71;border-radius:4px;padding:2px 7px;color:#2ecc71;">▶ Best repeat: D${bestRepeatD} (+${fmt(bestRepeatRemaining)})</div>`
                    : `<div style="font-size:10px;color:#95a5a6;">All maxed ✓</div>`}
            </div>
            <div style="display:grid;grid-template-columns:28px 1fr 64px 54px;gap:3px 6px;align-items:center;font-size:10px;color:#95a5a6;padding-bottom:4px;border-bottom:1px solid #1e3a50;margin-bottom:5px;">
                <div>D</div><div>Progress</div><div style="text-align:right;">Earned</div><div style="text-align:right;">Left</div>
            </div>`;

        for (let d = 1; d <= 18; d++) {
            const unlocked  = isStageUnlocked(_meta, tpl.id, d) || _debugUnlockAll;
            const cleared   = isStageCleared(_meta, tpl.id, d);
            const budget    = getStageXPBudget(d);
            const best      = earned[`${tpl.id}:${d}`] || 0;
            const remaining = Math.max(0, budget - best);
            const pct       = Math.min(100, best / budget * 100);
            const isMaxed   = best >= budget;
            const isActive  = d === selectedD;

            if (!unlocked) {
                html += `
                <div style="display:grid;grid-template-columns:28px 1fr 64px 54px;gap:3px 6px;align-items:center;opacity:0.3;margin:1px 0;">
                    <div style="font-size:10px;font-weight:bold;color:#555;">D${d}</div>
                    <div style="height:7px;background:#1a252f;border-radius:3px;"><div style="width:0%;height:100%;background:#333;border-radius:3px;"></div></div>
                    <div style="text-align:right;color:#444;">—</div>
                    <div style="text-align:right;color:#444;">🔒</div>
                </div>`;
                continue;
            }

            const barColor  = isMaxed ? '#27ae60' : cleared ? '#2980b9' : '#f39c12';
            const dColor    = isActive ? '#f1c40f' : isMaxed ? '#2ecc71' : cleared ? '#3498db' : '#bdc3c7';
            const rowBg     = isActive ? 'background:rgba(241,196,15,0.07);border-radius:4px;' : '';

            html += `
                <div style="display:grid;grid-template-columns:28px 1fr 64px 54px;gap:3px 6px;align-items:center;padding:2px 2px;${rowBg}margin:1px 0;cursor:pointer;"
                     data-xp-row-d="${d}">
                    <div style="font-size:10px;font-weight:bold;color:${dColor};">D${d}${isMaxed ? '✓' : ''}</div>
                    <div style="height:7px;background:#1a252f;border-radius:3px;overflow:hidden;">
                        <div style="width:${pct.toFixed(1)}%;height:100%;background:${barColor};border-radius:3px;transition:width 0.3s;"></div>
                    </div>
                    <div style="text-align:right;color:${isMaxed ? '#2ecc71' : '#ecf0f1'};">${best > 0 ? fmt(best) : '—'}</div>
                    <div style="text-align:right;color:${remaining > 0 ? '#f39c12' : '#2ecc71'};">${remaining > 0 ? '+'+fmt(remaining) : '✓'}</div>
                </div>`;
        }
        html += '</div>';  // close inner
        xpPanelBody.innerHTML = html;

        // Row click → select that difficulty
        xpPanelBody.querySelectorAll('[data-xp-row-d]').forEach(row => {
            row.addEventListener('click', () => {
                const d = parseInt(row.dataset.xpRowD, 10);
                if (isStageUnlocked(_meta, tpl.id, d) || _debugUnlockAll) {
                    selectedD = d;
                    renderDots();
                    renderWavePreview();
                    renderXpPanel();   // re-render to update highlight
                }
            });
        });
    }

    xpPanelHeader.addEventListener('click', () => {
        xpPanelOpen = !xpPanelOpen;
        xpPanelBody.style.display = xpPanelOpen ? 'block' : 'none';
        xpPanel.querySelector('#vc-xp-panel-chevron').style.transform = xpPanelOpen ? 'rotate(90deg)' : '';
        if (xpPanelOpen) renderXpPanel();
    });

    xpPanel.appendChild(xpPanelHeader);
    xpPanel.appendChild(xpPanelBody);
    body.appendChild(xpPanel);

    // ── Wave preview (updates when difficulty changes) ───────────────────────
    const waveSection = document.createElement('div');
    body.appendChild(waveSection);

    function renderWavePreview() {
        const waves   = 10 + 7 * selectedD + (getEffectiveSkills(_meta).bonusWaves || 0) * 3;
        const baseArmor = Math.floor((selectedD - 1) / 2);
        const cleared = isStageCleared(_meta, tpl.id, selectedD);
        const statusLine = cleared ? '✅ Cleared' : '⚔️ Not cleared';
        const xpBudgetDisplay = (() => {
            const budget  = getStageXPBudget(selectedD);
            const prevBest = (_meta.stageXPEarned || {})[`${tpl.id}:${selectedD}`] || 0;
            const fmt = n => n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(0)+'M' : n.toLocaleString();
            if (prevBest >= budget) return `💰 ${fmt(budget)} XP ✓`;
            if (prevBest > 0) return `💰 ${fmt(prevBest)} / ${fmt(budget)} XP`;
            return `💰 Up to ${fmt(budget)} XP`;
        })();

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
                <span style="background:#34495e;padding:3px 8px;border-radius:4px;color:#ecf0f1;font-size:11px;font-weight:bold;">${xpBudgetDisplay}</span>
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
    footer.style.cssText = 'flex-shrink:0;padding:12px 14px;padding-bottom:max(40px,env(safe-area-inset-bottom,40px));border-top:2px solid #34495e;background:#1a252f;';
    footer.innerHTML = `<button id="vc-hex-go" style="width:100%;padding:18px;background:#2ecc71;border:2px solid #27ae60;border-radius:10px;color:white;font-weight:bold;font-size:18px;cursor:pointer;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(46,204,113,0.4);">⚔️ Enter Battle</button>`;
    overlay.appendChild(footer);

    footer.querySelector('#vc-hex-go').onclick = () => {
        const unlockedActual = isStageUnlocked(_meta, tpl.id, selectedD);
        if (!unlockedActual && !_debugUnlockAll) return;
        overlay.remove();
        _startBattle(tpl.id, selectedD, _gameMode);
    };

    backBar.querySelector('#vc-hex-close').onclick = () => overlay.remove();

    _screens.game.querySelector('#vc-camp-layer').appendChild(overlay);
}

function _confirmAndStartBattle(templateId, difficulty) {
    const tpl = TEMPLATES.find(t => t.id === templateId);
    const minimapSvg = getTemplateMinimap(templateId, 90, 115);
    const waves = 10 + 7 * difficulty + (getEffectiveSkills(_meta).bonusWaves || 0) * 3;
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

    const xpBadge = (() => {
        const budget   = getStageXPBudget(difficulty);
        const prevBest = (_meta.stageXPEarned || {})[`${templateId}:${difficulty}`] || 0;
        const fmt = n => n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(0)+'M' : n.toLocaleString();
        if (prevBest >= budget) return `💰 ${fmt(budget)} XP ✓ (maxed)`;
        if (prevBest > 0)       return `💰 ${fmt(prevBest)} / ${fmt(budget)} XP`;
        return `💰 Up to ${fmt(budget)} XP`;
    })();

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
                    <span id="vc-xp-badge" style="background:#34495e;padding:3px 8px;border-radius:4px;color:#ecf0f1;font-size:11px;font-weight:bold;">${xpBadge}</span>
                    <span style="background:#34495e;padding:3px 8px;border-radius:4px;color:#ecf0f1;font-size:11px;font-weight:bold;">${statusLine}</span>
                </div>
            </div>
        </div>

        <div style="width:100%;background:#111d27;border:1px solid #2c4a66;border-radius:8px;overflow:hidden;">
            <div id="vc-mod-header" style="display:flex;align-items:center;justify-content:space-between;padding:8px 11px;cursor:pointer;user-select:none;background:#152030;">
                <div style="font-size:11px;font-weight:bold;color:#f39c12;text-transform:uppercase;letter-spacing:1px;">⚡ Run Modifiers <span id="vc-mod-count" style="color:#f1c40f;">(none selected — 1.0× XP)</span></div>
                <div id="vc-mod-chevron" style="font-size:11px;color:#7fb3d3;transition:transform 0.2s;">▶</div>
            </div>
            <div id="vc-mod-body" style="display:none;padding:8px 10px 10px;">
                <div style="font-size:10px;color:#95a5a6;margin-bottom:8px;line-height:1.4;">
                    Pick any combination — bonuses stack additively with no cap. All 16 active = <strong style="color:#e74c3c;">5.9× XP</strong>. Only pick what you can survive.
                </div>
                ${[['Tier 1', 0.20, 0.25, '#3498db'], ['Tier 2', 0.30, 0.35, '#f39c12'], ['Tier 3', 0.40, 0.99, '#e74c3c']].map(([label, lo, hi, col]) => {
                    const tierMods = RUN_MODIFIERS.filter(m => m.xpBonus >= lo && m.xpBonus <= hi);
                    return `<div style="margin-bottom:7px;">
                        <div style="font-size:9px;font-weight:bold;color:${col};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;padding-left:2px;">${label} (+${Math.round(lo*100)}–${Math.round(hi*100)}%)</div>
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            ${tierMods.map(m => `
                            <label id="vc-mod-row-${m.id}" style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;background:#1a252f;border:1.5px solid #2c4a66;border-radius:6px;cursor:pointer;transition:border-color 0.15s,background 0.15s;">
                                <input type="checkbox" data-mod-id="${m.id}" style="margin-top:2px;accent-color:${col};width:14px;height:14px;flex-shrink:0;">
                                <div style="flex:1;min-width:0;">
                                    <div style="font-size:11px;font-weight:bold;color:#ecf0f1;">${m.emoji} ${m.name} <span style="color:${col};font-size:10px;">+${Math.round(m.xpBonus*100)}%</span></div>
                                    <div style="font-size:10px;color:#95a5a6;line-height:1.35;margin-top:1px;">${m.desc}</div>
                                </div>
                            </label>`).join('')}
                        </div>
                    </div>`;
                }).join('')}
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

    // ── Modifier picker logic ────────────────────────────────────────────────
    let _activeModifiers = [];
    const modHeader  = modal.querySelector('#vc-mod-header');
    const modBody    = modal.querySelector('#vc-mod-body');
    const modChevron = modal.querySelector('#vc-mod-chevron');
    const modCount   = modal.querySelector('#vc-mod-count');
    const xpBadgeEl  = modal.querySelector('#vc-xp-badge');
    let modPanelOpen = false;

    function _updateModifierUI() {
        const checks = modal.querySelectorAll('[data-mod-id]');
        _activeModifiers = [...checks].filter(c => c.checked).map(c => c.dataset.modId);
        const mult = combinedXpMult(_activeModifiers);

        // Update count label
        if (_activeModifiers.length === 0) {
            modCount.textContent = '(none selected — 1.0× XP)';
            modCount.style.color = '#95a5a6';
        } else {
            const tierColor = mult >= 4.0 ? '#e74c3c' : mult >= 2.5 ? '#f39c12' : '#f1c40f';
            modCount.textContent = `(${_activeModifiers.length} active — ${mult.toFixed(2)}× XP)`;
            modCount.style.color = tierColor;
        }

        // Highlight checked rows
        modal.querySelectorAll('[id^="vc-mod-row-"]').forEach(row => {
            const cb = row.querySelector('input[type=checkbox]');
            if (cb.checked) {
                row.style.borderColor = '#f39c12';
                row.style.background  = '#1f2d1a';
            } else {
                row.style.borderColor = '#2c4a66';
                row.style.background  = '#1a252f';
            }
        });

        // All modifiers always selectable — no cap
        checks.forEach(c => {
            c.disabled = false;
            c.closest('label').style.opacity = '1';
        });

        // Live-update XP badge
        const budget   = getStageXPBudget(difficulty);
        const prevBest = (_meta.stageXPEarned || {})[`${templateId}:${difficulty}`] || 0;
        const effCap   = Math.round(budget * mult);
        const fmt = n => n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(0)+'M' : n.toLocaleString();
        let badge;
        if (prevBest >= effCap)      badge = `💰 ${fmt(effCap)} XP ✓`;
        else if (prevBest > 0)       badge = `💰 ${fmt(prevBest)} / ${fmt(effCap)} XP`;
        else                         badge = `💰 Up to ${fmt(effCap)} XP`;
        xpBadgeEl.textContent = badge;
    }

    modHeader.addEventListener('click', () => {
        modPanelOpen = !modPanelOpen;
        modBody.style.display = modPanelOpen ? 'block' : 'none';
        modChevron.style.transform = modPanelOpen ? 'rotate(90deg)' : '';
    });

    modal.querySelectorAll('[data-mod-id]').forEach(cb => {
        cb.addEventListener('change', _updateModifierUI);
    });

    modal.querySelector('#vc-confirm-go').onclick = () => {
        modal.remove();
        _startBattle(templateId, difficulty, _gameMode, _activeModifiers);
    };
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

// Skills that support a per-run "active level" — player can dial down from max
const ACTIVE_LEVEL_SKILLS = new Set([
    'bonusWaves', 'startMana', 'resonance', 'haste',
    'scholarGrace', 'comboKeep', 'trapSpecialty'
]);

function _renderGrimoire() {
    _screens.game.querySelector('#vc-grimoire-sp').textContent = `${_meta.sp} SP`;

    const list = _screens.game.querySelector('#vc-skill-list');
    list.innerHTML = '';

    const GROUP_LABELS = {
        economy: '💰 Economy',
        gems:    '💎 Gem Forging',
        mastery: '⚔️ Mastery',
        utility: '⚙️ Utility'
    };

    const grouped = {};
    Object.entries(SKILL_DEFS).forEach(([key, def]) => {
        const g = def.group || 'utility';
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push([key, def]);
    });

    if (!_meta.activeSkills) _meta.activeSkills = {};

    Object.entries(GROUP_LABELS).forEach(([groupKey, groupLabel]) => {
        const skills = grouped[groupKey];
        if (!skills) return;

        const header = document.createElement('div');
        header.className = 'vc-skill-group-header';
        header.textContent = groupLabel;
        list.appendChild(header);

        skills.forEach(([key, def]) => {
            const purchased = _meta.skills[key] || 0;
            const cost = purchased + 1;
            const isMax = def.max !== Infinity && purchased >= def.max;
            const canAfford = _meta.sp >= cost && !isMax;
            const maxLabel = def.max === Infinity ? '∞' : def.max;
            const hasActiveSlider = ACTIVE_LEVEL_SKILLS.has(key) && purchased > 0;
            // Default active level to purchased (max) when first seen.
            if (hasActiveSlider && _meta.activeSkills[key] === undefined) {
                _meta.activeSkills[key] = purchased;
            }
            const activeVal = hasActiveSlider ? (_meta.activeSkills[key] ?? purchased) : purchased;

            const card = document.createElement('div');
            card.className = 'vc-skill-card';

            // Top row: name + buy button
            const topRow = document.createElement('div');
            topRow.className = 'vc-skill-top';

            const nameEl = document.createElement('div');
            nameEl.className = 'vc-skill-name';
            nameEl.textContent = def.name;

            const rightEl = document.createElement('div');
            rightEl.className = 'vc-skill-right';

            const lvlEl = document.createElement('span');
            lvlEl.className = 'vc-skill-lvl';
            lvlEl.textContent = `${purchased}/${maxLabel}`;

            const buyBtn = document.createElement('button');
            buyBtn.className = 'vc-skill-buy' + (canAfford ? '' : ' disabled');
            buyBtn.disabled = !canAfford;
            buyBtn.textContent = isMax ? 'MAX' : `+1 (${cost}SP)`;
            buyBtn.onclick = () => {
                if (_meta.sp >= cost && purchased < def.max) {
                    _meta.sp -= cost;
                    // Bump active level only if it was already at the current max
                    // (player is running full power). If they dialled it down, leave it.
                    if (hasActiveSlider && (_meta.activeSkills[key] ?? purchased) >= purchased) {
                        _meta.activeSkills[key] = purchased + 1;
                    }
                    _meta.skills[key] = purchased + 1;
                    saveMeta(_meta);
                    _renderGrimoire();
                }
            };

            rightEl.appendChild(lvlEl);
            rightEl.appendChild(buyBtn);
            topRow.appendChild(nameEl);
            topRow.appendChild(rightEl);
            card.appendChild(topRow);

            // Desc
            const descEl = document.createElement('div');
            descEl.className = 'vc-skill-desc';
            descEl.textContent = def.desc;
            card.appendChild(descEl);

            // Active-level slider for tunable skills
            if (hasActiveSlider) {
                const sliderRow = document.createElement('div');
                sliderRow.className = 'vc-skill-slider-row';

                const sliderLabel = document.createElement('span');
                sliderLabel.className = 'vc-skill-slider-label';
                sliderLabel.textContent = `Active: ${activeVal}`;

                const slider = document.createElement('input');
                slider.type = 'range';
                slider.min = 0;
                slider.max = purchased;
                slider.value = activeVal;
                slider.className = 'vc-skill-slider';
                slider.oninput = () => {
                    const v = parseInt(slider.value);
                    _meta.activeSkills[key] = v;
                    sliderLabel.textContent = `Active: ${v}`;
                    saveMeta(_meta);
                };

                sliderRow.appendChild(sliderLabel);
                sliderRow.appendChild(slider);
                card.appendChild(sliderRow);
            }

            list.appendChild(card);
        });
    });
}

// ─── Mid-run autosave helpers ─────────────────────────────────────────────────

/** Called after every wave-clear. Snapshots the run state and writes to localStorage. */
function _autoSaveMidRun(engine, templateId, difficulty, gameMode, mapData) {
    const snapshot = {
        saveId:    `${templateId}:${difficulty}:${Date.now()}`,
        timestamp: Date.now(),
        templateId,
        difficulty,
        gameMode,
        // Only the fields that are meaningful between waves (enemies/projectiles are gone).
        state: {
            mana:              engine.state.mana,
            poolLevel:         engine.state.poolLevel,
            poolCap:           engine.state.poolCap,
            wave:              engine.state.wave,
            maxWaves:          engine.state.maxWaves,
            xpEarned:          engine.state.xpEarned,
            combo:             0,
            comboDecayTimer:   0,
            _waveLeaked:       false,
            _manaAtWaveStart:  engine.state.mana,
            _waveStartTime:    0,
            _earlyCallBonus:   0,
            _waveEnemyCount:   0
        },
        // Tower/trap positions and slotted gems — the core player investment.
        // We save tile grid col/row (c, r) alongside pixel x/y so that on load
        // the coords can be reprojected to whatever tileSize the new session uses.
        structures: engine.structures.map(s => {
            const ts = engine.tileSize || 40;
            const c = Math.round((s.x - ts / 2) / ts);
            const r = Math.round((s.y - ts / 2) / ts);
            console.log(`[VC SAVE] struct type=${s.type} x=${s.x} y=${s.y} ts=${ts} → c=${c} r=${r}`);
            return {
                c,
                r,
                x:    s.x,
                y:    s.y,
                type: s.type,
                gem:  s.gem ? { color: s.gem.color, level: s.gem.level, rangeRatio: s.gem.rangeRatio } : null,
                stats: { ...s.stats }
            };
        }),
        // Map layout (grid + paths). waypointSets are pixel-coord derived and
        // get recalculated by VcUI.initGrid(), so we don't need to save them.
        mapData: {
            grid:        mapData.grid,
            paths:       mapData.paths,
            cols:        mapData.cols,
            rows:        mapData.rows,
            templateId:  mapData.templateId,
            wallEdges:   mapData.wallEdges || [],
            usedFallback: mapData.usedFallback || false
        }
    };
    saveMidRun(snapshot);
    _showAutoSaveToast(engine.state.wave);
}

/** Brief non-blocking toast confirming an autosave was written. */
function _showAutoSaveToast(wave) {
    const toast = document.createElement('div');
    toast.style.cssText = [
        'position:fixed', 'bottom:72px', 'left:50%', 'transform:translateX(-50%)',
        'background:#1a252f', 'color:#bdc3c7', 'font-size:12px',
        'padding:5px 14px', 'border-radius:20px', 'z-index:9999',
        'border:1px solid #2c3e50', 'pointer-events:none',
        'opacity:0', 'transition:opacity 0.25s'
    ].join(';');
    toast.textContent = `💾 Run saved after wave ${wave}`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => { toast.style.opacity = '0'; }, 1800);
    setTimeout(() => { toast.remove(); }, 2100);
}

/** Shows the load-run modal with up to 5 autosave slots. */
function _showLoadRunModal() {
    const existing = document.getElementById('vc-load-run-modal');
    if (existing) existing.remove();

    const slots = loadMidRunSlots();

    const overlay = document.createElement('div');
    overlay.id = 'vc-load-run-modal';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'background:rgba(10,15,22,0.92)',
        'z-index:600', 'display:flex', 'align-items:center', 'justify-content:center',
        'padding:16px', 'font-family:inherit'
    ].join(';');

    // Click backdrop to close
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const card = document.createElement('div');
    card.style.cssText = [
        'background:#0f1620', 'border:1px solid #2c3e50', 'border-radius:14px',
        'padding:18px 16px 14px', 'display:flex', 'flex-direction:column',
        'gap:12px', 'width:100%', 'max-width:420px',
        'max-height:85vh', 'overflow-y:auto'
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText = 'font-size:17px;font-weight:bold;color:#f1c40f;text-align:center;';
    title.textContent = '📂 Load Saved Run';
    card.appendChild(title);

    if (slots.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#7f8c8d;font-size:13px;margin:4px 0;text-align:center;';
        empty.textContent = 'No autosaves yet. Runs are saved automatically after each wave.';
        card.appendChild(empty);
    } else {
        const list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

        slots.forEach((slot, idx) => {
            const templateName = TEMPLATES.find(t => t.id === slot.templateId)?.name ?? slot.templateId;
            const date = new Date(slot.timestamp);
            const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            const manaStr = Math.floor(slot.state.mana);
            const gemCount = slot.structures.filter(s => s.gem).length;

            const card = document.createElement('div');
            card.style.cssText = [
                'background:#1a2535', 'border:1px solid #2c3e50', 'border-radius:10px',
                'padding:10px 12px', 'display:flex', 'align-items:center', 'gap:10px'
            ].join(';');

            const info = document.createElement('div');
            info.style.cssText = 'flex:1;min-width:0;';
            info.innerHTML = `
                <div style="font-size:13px;font-weight:bold;color:#ecf0f1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${templateName} · D${slot.difficulty} · ${slot.gameMode}
                </div>
                <div style="font-size:11px;color:#95a5a6;margin-top:2px;">
                    Wave ${slot.state.wave}/${slot.state.maxWaves} &nbsp;·&nbsp;
                    💧${manaStr} &nbsp;·&nbsp;
                    💎${gemCount} gems &nbsp;·&nbsp;
                    ${dateStr}
                </div>
            `;

            const loadBtn = document.createElement('button');
            loadBtn.className = 'vc-btn';
            loadBtn.style.cssText = 'background:#27ae60;border-color:#1e8449;padding:5px 12px;font-size:12px;white-space:nowrap;';
            loadBtn.textContent = '▶ Load';
            loadBtn.onclick = () => {
                overlay.remove();
                _resumeFromSave(slot);
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'vc-icon-btn';
            delBtn.style.cssText = 'background:#c0392b;border-color:#922b21;font-size:13px;padding:4px 8px;min-width:0;';
            delBtn.title = 'Delete this save';
            delBtn.textContent = '🗑';
            delBtn.onclick = () => {
                deleteMidRunSlot(idx);
                overlay.remove();
                _showLoadRunModal();
            };

            card.appendChild(info);
            card.appendChild(loadBtn);
            card.appendChild(delBtn);
            list.appendChild(card);
        });
        card.appendChild(list);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'vc-btn';
    closeBtn.style.cssText = 'background:#2c3e50;border-color:#4a5568;width:100%;margin-top:4px;';
    closeBtn.textContent = '✕ Close';
    closeBtn.onclick = () => overlay.remove();
    card.appendChild(closeBtn);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
}

/**
 * Restore a run from an autosave snapshot.
 * Creates a fresh engine with the saved map, then overwrites state + structures.
 */
function _resumeFromSave(snapshot) {
    _activeTier = snapshot.difficulty;

    _screens.game.querySelector('#vc-camp-layer').style.display = 'none';
    _screens.game.querySelector('#vc-battle-layer').style.display = 'flex';

    const mapData = snapshot.mapData;   // { grid, paths, cols, rows, templateId, wallEdges }

    const uiCallbacks = {
        showCard: (mode, onRes) => {
            const overlay = document.getElementById('vc-vocab-modal');
            showCard(mode, overlay, onRes);
        }
    };

    let ui;
    const effectiveMeta = { ..._meta, skills: getEffectiveSkills(_meta) };
    _engine = new VcEngine(mapData, effectiveMeta, snapshot.difficulty, (eng, evts) => {
        if (ui) ui.draw(eng, evts);
        if (evts && evts.some(e => e.type === 'waveClear')) {
            _autoSaveMidRun(eng, snapshot.templateId, snapshot.difficulty, snapshot.gameMode, mapData);
        }
    }, (isWin, xp) => {
        // Mid-run resumes don't carry modifier info — award at 1× (base cap)
        const awardedXP = recordStageXP(_meta, snapshot.templateId, snapshot.difficulty, xp, 1.0);
        addXP(_meta, awardedXP);
        if (ui) { ui.destroy(); ui = null; }
        if (isWin) {
            clearStage(_meta, snapshot.templateId, snapshot.difficulty);
            const repeatNote = awardedXP === 0 ? ' (already maxed)' : '';
            alert(`${TEMPLATES.find(t => t.id === snapshot.templateId)?.name} D${snapshot.difficulty} Cleared! +${Math.floor(awardedXP)} XP${repeatNote}`);
        } else {
            alert(`Defeated! You salvaged +${Math.floor(awardedXP)} XP`);
        }
        _showCamp();
    }, snapshot.gameMode);

    // ── Overwrite constructor defaults with saved state ──────────────────────
    Object.assign(_engine.state, snapshot.state);
    // Prevent _loopTick from immediately firing waveClear for the already-cleared wave.
    _engine._lastClearedWave = snapshot.state.wave;

    // Restore structures (towers/traps + gems). Add cooldown=0 so they fire immediately.
    _engine.structures = snapshot.structures.map(s => ({
        c:        s.c,
        r:        s.r,
        x:        s.x,
        y:        s.y,
        type:     s.type,
        gem:      s.gem ? { ...s.gem } : null,
        cooldown: 0,
        stats:    s.stats
            ? { ...s.stats }
            : { manaLeeched: 0, poisonDealt: 0, slowApplied: 0, armorTorn: 0, critHits: 0, totalDmg: 0 }
    }));
    console.log(`[VC RESTORE] ${_engine.structures.length} structures loaded from snapshot. engine.tileSize at this point=${_engine.tileSize}`);
    _engine.structures.forEach((s,i) => console.log(`  [VC RESTORE] #${i} type=${s.type} c=${s.c} r=${s.r} x=${s.x} y=${s.y}`));

    // enemies/projectiles/spawnQueue are already [] from the constructor — correct for a between-waves restore.

    ui = new VcUI(_screens.game, _engine, uiCallbacks, () => {
        // VcUI.initGrid() has now run and set the real tileSize for this device/orientation.
        // Reproject all structure pixel coords from their saved tile col/row (c, r),
        // discarding the stale x/y that were encoded with the old session's tileSize.
        const ts = _engine.tileSize;
        console.log(`[VC REPROJECT] onReady fired. engine.tileSize=${ts}. Reprojecting ${_engine.structures.length} structures.`);
        if (ts > 0) {
            for (const s of _engine.structures) {
                const hadCR = s.c !== undefined && s.r !== undefined;
                const oldX = s.x, oldY = s.y;
                if (hadCR) {
                    s.x = s.c * ts + ts / 2;
                    s.y = s.r * ts + ts / 2;
                }
                console.log(`  [VC REPROJECT] type=${s.type} c=${s.c} r=${s.r} hadCR=${hadCR} ${oldX},${oldY} → ${s.x},${s.y}`);
            }
        } else {
            console.warn('[VC REPROJECT] ts=0! Cannot reproject. engine.tileSize not set yet?');
        }
        _engine.speedMult = _speedMult;
        _screens.game.querySelector('#vc-btn-speed').textContent = `⚡${_speedMult}x`;
        _engine.start();
    });
}

function _startBattle(templateId, difficulty, gameMode = 'hard', modifiers = []) {
    _activeTier = difficulty;

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
    // Build a meta snapshot with active skill levels applied for this run
    const effectiveMeta = { ..._meta, skills: getEffectiveSkills(_meta) };
    const runXpMult = combinedXpMult(modifiers);
    _engine = new VcEngine(mapData, effectiveMeta, difficulty, (eng, evts) => {
        if (ui) ui.draw(eng, evts);
        // Auto-save: wave just fully cleared (enemies=0, queue=0) — perfect checkpoint.
        if (evts && evts.some(e => e.type === 'waveClear')) {
            _autoSaveMidRun(eng, templateId, difficulty, gameMode, mapData);
        }
    }, (isWin, xp) => {
        const awardedXP = recordStageXP(_meta, templateId, difficulty, xp, runXpMult);
        addXP(_meta, awardedXP);
        if (ui) { ui.destroy(); ui = null; }
        const modNote = modifiers.length > 0 ? ` [${modifiers.map(id => RUN_MODIFIERS.find(m=>m.id===id)?.emoji).join('')} ${runXpMult.toFixed(2)}× XP]` : '';
        if (isWin) {
            clearStage(_meta, templateId, difficulty);
            const repeatNote = awardedXP === 0 ? ' (already maxed — try harder modifiers!)' : '';
            alert(`${TEMPLATES.find(t=>t.id===templateId)?.name} D${difficulty} Cleared!${modNote} +${Math.floor(awardedXP)} XP${repeatNote}`);
        } else {
            alert(`Defeated!${modNote} You salvaged +${Math.floor(awardedXP)} XP`);
        }
        _showCamp();
    }, gameMode, modifiers);

    // gameMode already stored on _engine via constructor
    ui = new VcUI(_screens.game, _engine, uiCallbacks, () => {
        _engine.speedMult = _speedMult;
        _screens.game.querySelector('#vc-btn-speed').textContent = `⚡${_speedMult}x`;

        // ── Modifier badges in HUD ───────────────────────────────────────────
        const existingBadges = _screens.game.querySelector('#vc-mod-badges');
        if (existingBadges) existingBadges.remove();
        if (modifiers.length > 0) {
            const badgeStrip = document.createElement('div');
            badgeStrip.id = 'vc-mod-badges';
            badgeStrip.style.cssText = [
                'display:flex', 'align-items:center', 'gap:4px',
                'padding:2px 8px 2px 4px', 'flex-shrink:0'
            ].join(';');
            modifiers.forEach(id => {
                const def = RUN_MODIFIERS.find(m => m.id === id);
                if (!def) return;
                const pill = document.createElement('div');
                pill.title = `${def.name}: ${def.desc}`;
                pill.style.cssText = [
                    'display:flex', 'align-items:center', 'gap:3px',
                    'background:#1f2d1a', 'border:1px solid #f39c12',
                    'border-radius:10px', 'padding:1px 6px',
                    'font-size:10px', 'font-weight:bold', 'color:#f39c12',
                    'white-space:nowrap', 'cursor:default'
                ].join(';');
                pill.textContent = `${def.emoji} ${def.name}`;
                badgeStrip.appendChild(pill);
            });
            // XP mult pill
            const multPill = document.createElement('div');
            multPill.style.cssText = [
                'background:#1a2a1a', 'border:1px solid #2ecc71',
                'border-radius:10px', 'padding:1px 7px',
                'font-size:10px', 'font-weight:bold', 'color:#2ecc71',
                'white-space:nowrap'
            ].join(';');
            multPill.textContent = `${runXpMult.toFixed(2)}× XP`;
            badgeStrip.appendChild(multPill);
            // Insert at front of wave-tracker row
            const row2 = _screens.game.querySelector('.vc-topbar-row2');
            if (row2) row2.insertBefore(badgeStrip, row2.firstChild);
        }

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