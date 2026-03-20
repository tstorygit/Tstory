// js/games/legend/leg_ui.js
import { WEAPONS, PERKS } from './leg_entities.js';
import { renderVocabSettings, poolSourceLabel } from '../../game_vocab_mgr_ui.js';

let dom = {};
let callbacks = null;
let _vocabMgr = null;

export function initUI(container, cbs, vocabMgr) {
    callbacks = cbs;
    _vocabMgr = vocabMgr;
    container.innerHTML = `
        <div class="leg-hud">
            <div class="leg-hud-col">
                <span id="leg-hp-txt" class="leg-stat-text">HP</span>
                <div class="leg-bar-wrap"><div id="leg-hp-fill" class="leg-hp-fill"></div></div>
            </div>
            <div class="leg-hud-center">
                <div id="leg-lvl-txt" style="margin-bottom:2px; font-size:10px;">LV. 1</div>
                <div class="leg-bar-wrap" style="width:60px;height:5px;"><div id="leg-exp-fill" class="leg-exp-fill"></div></div>
                <div id="leg-exp-txt" style="font-size:8px; color:#bdc3c7; margin-top:2px;">0/100</div>
            </div>
            <div class="leg-hud-col" style="align-items:flex-end;">
                <span id="leg-mp-txt" class="leg-stat-text">MP</span>
                <div class="leg-bar-wrap"><div id="leg-mp-fill" class="leg-mp-fill"></div></div>
            </div>
            <div class="leg-hud-right">
                <button id="leg-btn-action" class="leg-btn" style="font-size:14px; padding:4px 8px;">🗡️</button>
                <button id="leg-btn-menu" class="leg-btn" style="border-color:#f1c40f;">☰</button>
            </div>
        </div>
        
        <div class="leg-overlay" id="leg-menu-overlay">
            <div class="leg-menu-header">
                <h2 class="leg-menu-title">Camp Menu</h2>
                <button id="leg-btn-close" class="leg-btn">✕</button>
            </div>
            <div id="leg-menu-tabs" style="display:flex;gap:6px;margin-bottom:8px;flex-shrink:0;">
                <button class="leg-menu-tab leg-btn active" data-tab="main" style="flex:1;font-size:11px;">⚔️ Camp</button>
                <button class="leg-menu-tab leg-btn" data-tab="vocab" style="flex:1;font-size:11px;">📚 Vocab</button>
            </div>
            <div id="leg-tab-main" class="leg-menu-container">
                <div class="leg-menu-col">
                    <div class="leg-col-title" style="display:flex;align-items:center;justify-content:center;gap:6px;">
                        Weapons
                        <button id="leg-btn-weapon-info" style="background:none;border:1px solid #7f8c8d;border-radius:50%;width:16px;height:16px;color:#bdc3c7;font-size:9px;font-weight:bold;cursor:pointer;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;" title="Weapon effects">ℹ</button>
                    </div>
                    <div id="leg-weapon-list" class="leg-weapon-grid"></div>
                </div>
                <div class="leg-menu-col">
                    <div class="leg-col-title">Items & Magic</div>
                    <div style="background:rgba(0,0,0,0.3); border-radius:6px; padding:8px; margin-bottom:8px;">
                        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;margin-bottom:6px;">
                            <span>🧪 Potion</span>
                            <span id="leg-potion-count">x3</span>
                        </div>
                        <button id="leg-use-potion" class="leg-btn" style="width:100%;font-size:10px;">Drink (+50 HP)</button>
                    </div>
                    <div class="leg-col-title" style="margin-top:8px;">Action Button</div>
                    <button id="leg-toggle-magic" class="leg-btn" style="width:100%;font-size:10px;">Equip Magic (Heal 30HP / -10MP)</button>
                    <p style="font-size:9px;color:#aaa;margin-top:8px;">Tap screen to use equipped action.</p>
                </div>
                <div class="leg-menu-col">
                    <div class="leg-col-title">Stats</div>
                    <div id="leg-stat-pts-wrap" class="leg-stat-pts">Unspent Points: <span id="leg-stat-pts">0</span></div>
                    <div id="leg-stat-list" style="margin-top:8px;"></div>
                </div>
            </div>
            <div id="leg-tab-vocab" style="display:none; flex:1; overflow-y:auto; padding:4px 2px;">
                <div id="leg-vocab-settings-mount"></div>
            </div>
            <div style="display:flex; gap:8px; margin-top:10px; flex-shrink:0;">
                <button id="leg-btn-rebirth-check" class="leg-btn" style="flex:1; background:#c0392b; border-color:#e74c3c;">Rebirth</button>
                <button id="leg-btn-exit" class="leg-btn" style="flex:1;">Save & Exit</button>
            </div>
        </div>

        <div class="leg-overlay" id="leg-weapon-info-overlay" style="align-items:center;justify-content:center;z-index:200;">
            <div style="background:#1e2d3d;border:2px solid #f1c40f;border-radius:12px;padding:18px 20px;width:100%;max-width:340px;max-height:80vh;overflow-y:auto;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                    <span style="color:#f1c40f;font-weight:bold;font-size:14px;letter-spacing:1px;">⚔️ WEAPON GUIDE</span>
                    <button id="leg-btn-weapon-info-close" class="leg-btn" style="padding:2px 8px;">✕</button>
                </div>
                <div id="leg-weapon-info-body" style="display:flex;flex-direction:column;gap:10px;"></div>
            </div>
        </div>

        <div class="leg-overlay" id="leg-rebirth-overlay" style="background:#1a0000; align-items:center; justify-content:center;">
            <div class="leg-death-box">
                <div class="leg-death-title">REBIRTH</div>
                <p style="color:#bdc3c7;margin-bottom:15px;font-size:12px;">Ascend and start over. You will gain <b style="color:#f1c40f" id="leg-ap-gain">0</b> AP.</p>
                <div id="leg-perk-list" style="display:flex;flex-direction:column;gap:8px;width:100%;margin-bottom:15px;overflow-y:auto;max-height:30vh;"></div>
                <button id="leg-btn-confirm-rebirth" class="leg-btn leg-btn-primary" style="width:100%;">Ascend Now</button>
                <button id="leg-btn-cancel-rebirth" class="leg-btn" style="width:100%;margin-top:8px;">Cancel</button>
            </div>
        </div>

        <div class="leg-overlay" id="leg-death-overlay" style="background:rgba(10,0,0,0.96); align-items:center; justify-content:center; display:none; overflow-y:auto;">
        </div>
    `;

    dom = {
        hpFill: container.querySelector('#leg-hp-fill'),
        hpTxt:  container.querySelector('#leg-hp-txt'),
        mpFill: container.querySelector('#leg-mp-fill'),
        mpTxt:  container.querySelector('#leg-mp-txt'),
        expFill: container.querySelector('#leg-exp-fill'),
        expTxt: container.querySelector('#leg-exp-txt'),
        lvlTxt: container.querySelector('#leg-lvl-txt'),
        menuBtn: container.querySelector('#leg-btn-menu'),
        closeBtn: container.querySelector('#leg-btn-close'),
        menuOverlay: container.querySelector('#leg-menu-overlay'),
        weaponList: container.querySelector('#leg-weapon-list'),
        statPtsWrap: container.querySelector('#leg-stat-pts-wrap'),
        statPts: container.querySelector('#leg-stat-pts'),
        statList: container.querySelector('#leg-stat-list'),
        btnAction: container.querySelector('#leg-btn-action'),
        toggleMagic: container.querySelector('#leg-toggle-magic'),
        usePotion: container.querySelector('#leg-use-potion'),
        potionCount: container.querySelector('#leg-potion-count'),
        rebirthBtn: container.querySelector('#leg-btn-rebirth-check'),
        rebirthOverlay: container.querySelector('#leg-rebirth-overlay'),
        deathOverlay: container.querySelector('#leg-death-overlay'),
        perkList: container.querySelector('#leg-perk-list'),
        exitBtn: container.querySelector('#leg-btn-exit'),
        weaponInfoBtn: container.querySelector('#leg-btn-weapon-info'),
        weaponInfoOverlay: container.querySelector('#leg-weapon-info-overlay'),
        weaponInfoBody: container.querySelector('#leg-weapon-info-body'),
        tabMain: container.querySelector('#leg-tab-main'),
        tabVocab: container.querySelector('#leg-tab-vocab'),
        vocabMount: container.querySelector('#leg-vocab-settings-mount'),
        menuTabs: container.querySelectorAll('.leg-menu-tab'),
    };

    dom.menuBtn.onclick = () => { callbacks.onPause(); renderMenu(); dom.menuOverlay.style.display = 'flex'; };
    dom.closeBtn.onclick = () => { dom.menuOverlay.style.display = 'none'; callbacks.onResume(); };

    // Tap the action button to cycle to the next unlocked weapon (wraps around).
    // The actual attack is still triggered by tapping/dragging the canvas.
    dom.btnAction.onclick = () => {
        const state = callbacks.getState();
        if (state.magicMode) { callbacks.onToggleMagic(); updateHUD(state); return; }
        const order = Object.keys(WEAPONS); // ['sword','axe','sickle','spear','chain','star']
        const unlocked = order.filter(id => state.unlockedWeapons.includes(id));
        const idx = unlocked.indexOf(state.player.equippedWeapon);
        const next = unlocked[(idx + 1) % unlocked.length];
        callbacks.onEquipWeapon(next);
        updateHUD(callbacks.getState());
    };

    // ── Tab switching ──────────────────────────────────────────────────────────
    dom.menuTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            dom.menuTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const isVocab = tab.dataset.tab === 'vocab';
            dom.tabMain.style.display  = isVocab ? 'none'  : '';
            dom.tabVocab.style.display = isVocab ? 'block' : 'none';
            if (isVocab) _renderVocabSettings();
        });
    });
    dom.exitBtn.onclick = () => { callbacks.onExitGame(); };
    
    dom.toggleMagic.onclick = () => {
        callbacks.onToggleMagic();
        renderMenu();
        updateHUD(callbacks.getState());
    };

    dom.usePotion.onclick = () => { callbacks.onUsePotion(); renderMenu(); };

    dom.rebirthBtn.onclick = () => {
        const state = callbacks.getState();
        container.querySelector('#leg-ap-gain').textContent = Math.floor(state.player.level / 10);
        renderPerks(state);
        dom.rebirthOverlay.style.display = 'flex';
    };
    container.querySelector('#leg-btn-cancel-rebirth').onclick = () => dom.rebirthOverlay.style.display = 'none';
    container.querySelector('#leg-btn-confirm-rebirth').onclick = () => { dom.rebirthOverlay.style.display = 'none'; dom.menuOverlay.style.display='none'; callbacks.onRebirth(); };

    dom.weaponInfoBtn.onclick = () => {
        _renderWeaponGuide(dom.weaponInfoBody);
        dom.weaponInfoOverlay.style.display = 'flex';
    };
    container.querySelector('#leg-btn-weapon-info-close').onclick = () => {
        dom.weaponInfoOverlay.style.display = 'none';
    };
}

export function updateHUD(state) {
    const p = state.player;
    dom.hpFill.style.width = `${(p.hp/p.maxHp)*100}%`;
    dom.hpTxt.textContent = `HP ${Math.floor(p.hp)}/${p.maxHp}`;
    dom.mpFill.style.width = `${(p.mp/p.maxMp)*100}%`;
    dom.mpTxt.textContent = `MP ${Math.floor(p.mp)}/${p.maxMp}`;
    dom.expFill.style.width = `${(p.exp/p.nextExp)*100}%`;
    dom.expTxt.textContent = `${p.exp} / ${p.nextExp}`;
    dom.lvlTxt.textContent = `LV. ${p.level}`;
    
    dom.btnAction.textContent = state.magicMode ? '✨' : WEAPONS[p.equippedWeapon].icon;
    dom.btnAction.className = state.magicMode ? 'leg-btn leg-btn-magic' : 'leg-btn';

    if (state.statPoints === 0 && dom.menuBtn.style.borderColor === 'rgb(231, 76, 60)') {
        dom.menuBtn.style.borderColor = '';
    }
}

/** Called by legend.js on player death. Shows full stats then rebirth/exit options. */
export function showDeathScreen(stats, state, callbacks) {
    const fmtTime = (s) => {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    };

    const totalVocab = stats.vocabCorrect + stats.vocabWrong;
    const accuracy   = totalVocab > 0
        ? Math.round((stats.vocabCorrect / totalVocab) * 100) : '—';

    const statRows = [
        { icon: '⏱️', label: 'Time Survived',   value: fmtTime(stats.elapsed) },
        { icon: '⚔️', label: 'Stage Reached',   value: stats.stage },
        { icon: '🧝', label: 'Level',            value: stats.level },
        { icon: '💀', label: 'Enemies Slain',    value: stats.kills },
        { icon: '🐉', label: 'Bosses Defeated',  value: stats.bossKills },
        { icon: '🏰', label: 'Rooms Cleared',    value: stats.roomsCleared },
        { icon: '💥', label: 'Damage Taken',     value: stats.damageTaken },
        { icon: '🧪', label: 'Potions Used',     value: stats.potionsUsed },
        { icon: '✅', label: 'Correct Answers',  value: stats.vocabCorrect },
        { icon: '❌', label: 'Wrong Answers',    value: stats.vocabWrong },
        { icon: '🎯', label: 'Vocab Accuracy',   value: totalVocab > 0 ? `${accuracy}%` : '—' },
        { icon: '⚡', label: 'Best Streak',      value: stats.vocabCombo },
        { icon: '📖', label: 'Words Practiced',  value: stats.vocabLearned },
    ];

    dom.deathOverlay.innerHTML = `
        <div style="width:100%;max-width:380px;padding:20px 16px 28px;display:flex;flex-direction:column;gap:14px;margin:auto;">
            <div style="text-align:center;">
                <div style="font-size:42px;margin-bottom:4px;">💀</div>
                <div style="font-size:26px;font-weight:bold;color:#e74c3c;letter-spacing:3px;text-transform:uppercase;">Defeated</div>
                <div style="font-size:11px;color:#7f8c8d;margin-top:4px;letter-spacing:1px;">Stage ${stats.stage} · Level ${stats.level}</div>
            </div>

            <div style="background:#1a1a2e;border:1px solid #2c3e50;border-radius:10px;overflow:hidden;">
                ${statRows.map((r, i) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;
                                padding:8px 12px;font-size:12px;
                                background:${i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)'};
                                border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span style="color:#95a5a6;">${r.icon} ${r.label}</span>
                        <span style="font-weight:bold;color:#ecf0f1;">${r.value}</span>
                    </div>
                `).join('')}
            </div>

            ${stats.apGain > 0 ? `
            <div style="background:rgba(241,196,15,0.08);border:1px solid rgba(241,196,15,0.3);
                        border-radius:8px;padding:10px 14px;text-align:center;font-size:12px;color:#f1c40f;">
                ✨ Rebirth will earn you <strong>+${stats.apGain} AP</strong> to spend on perks.
            </div>` : ''}

            <div style="display:flex;flex-direction:column;gap:8px;">
                <button id="leg-death-rebirth" class="leg-btn leg-btn-primary" style="width:100%;padding:12px;font-size:13px;">
                    ♻️ Rebirth &amp; Ascend (+${stats.apGain} AP)
                </button>
                <button id="leg-death-exit" class="leg-btn" style="width:100%;padding:10px;font-size:12px;">
                    💾 Save &amp; Exit
                </button>
            </div>
        </div>
    `;

    dom.deathOverlay.style.display = 'flex';

    dom.deathOverlay.querySelector('#leg-death-rebirth').onclick = () => {
        dom.deathOverlay.style.display = 'none';
        callbacks.onRebirth();
    };
    dom.deathOverlay.querySelector('#leg-death-exit').onclick = () => {
        dom.deathOverlay.style.display = 'none';
        callbacks.onExit();
    };
}

/** Called by legend.js after (re-)building the vocabMgr for a new run. */
export function setVocabMgr(mgr) {
    _vocabMgr = mgr;
}

function _renderVocabSettings() {
    if (!_vocabMgr) {
        dom.vocabMount.innerHTML = '<p style="color:#7f8c8d;font-size:12px;padding:10px;">No vocabulary loaded yet.</p>';
        return;
    }
    renderVocabSettings(
        _vocabMgr,
        dom.vocabMount,
        (updatedConfig) => { callbacks.onVocabConfigSave(updatedConfig); },
        _vocabMgr.getPoolSource()
    );
}

function renderMenu() {
    const state = callbacks.getState();
    const p = state.player;
    
    dom.weaponList.innerHTML = Object.values(WEAPONS).map(w => {
        const unlocked = state.unlockedWeapons.includes(w.id);
        const active = p.equippedWeapon === w.id && !state.magicMode;
        return `
            <div class="leg-weapon-btn ${unlocked ? (active ? 'active' : '') : 'locked'}" data-id="${w.id}">
                <div class="leg-weapon-icon">${unlocked ? w.icon : '❓'}</div>
                <div class="leg-weapon-name">${unlocked ? w.name : 'Locked'}</div>
            </div>
        `;
    }).join('');
    dom.weaponList.querySelectorAll('.leg-weapon-btn').forEach(btn => {
        btn.onclick = () => {
            if (state.unlockedWeapons.includes(btn.dataset.id)) {
                if (state.magicMode) callbacks.onToggleMagic(); 
                callbacks.onEquipWeapon(btn.dataset.id);
                renderMenu();
                updateHUD(state);
            }
        };
    });

    dom.potionCount.textContent = `x${p.potions}`;
    dom.usePotion.disabled = p.potions <= 0 || p.hp >= p.maxHp;
    dom.toggleMagic.className = state.magicMode ? 'leg-btn leg-btn-magic' : 'leg-btn';

    dom.statPts.textContent = state.statPoints;
    dom.statPtsWrap.style.display = state.statPoints > 0 ? 'block' : 'none';

    dom.statList.innerHTML = ['str', 'def', 'agi', 'wis'].map(s => `
        <div class="leg-stat-row">
            <span style="text-transform:uppercase;">${s}</span>
            <span class="leg-stat-val">${p[s]}</span>
            <button class="leg-stat-add" data-stat="${s}" ${state.statPoints > 0 ? '' : 'disabled'}>+</button>
        </div>
    `).join('');
    
    dom.statList.querySelectorAll('.leg-stat-add').forEach(btn => {
        btn.onclick = () => { callbacks.onAddStat(btn.dataset.stat); renderMenu(); };
    });
}

function renderPerks(state) {
    dom.perkList.innerHTML = `
        <div style="text-align:center; color:#2ecc71; font-weight:bold; margin-bottom:10px; font-size:12px;">Your AP: ${state.ap}</div>
        ${Object.entries(PERKS).map(([k, p]) => {
            const owned = state.perks[k] || 0;
            return `
                <div style="background:rgba(255,255,255,0.1); padding:8px; border-radius:6px; text-align:left;">
                    <div style="display:flex;justify-content:space-between;font-weight:bold;color:#f1c40f;font-size:12px;">
                        <span>${p.name} (Lv.${owned})</span>
                        <span>Cost: ${p.cost} AP</span>
                    </div>
                    <div style="font-size:9px;color:#ccc;margin-top:2px;">${p.desc}</div>
                    <button class="leg-btn" style="width:100%;margin-top:6px;padding:4px;font-size:10px;" ${state.ap >= p.cost ? '' : 'disabled'} data-perk="${k}">Buy</button>
                </div>
            `;
        }).join('')}
    `;
    
    dom.perkList.querySelectorAll('button.leg-btn').forEach(btn => {
        btn.onclick = () => { callbacks.onBuyPerk(btn.dataset.perk); renderPerks(callbacks.getState()); };
    });
}

// ── Weapon guide popup ────────────────────────────────────────────────────────

// Static data: what each weapon does beyond combat.
// Keep in sync with WEAPONS in leg_entities.js if clear/grapple values change.
const _WEAPON_GUIDE = [
    {
        id: 'sword',  icon: '🗡️', name: 'Broadsword',
        type: 'Arc swing',
        special: null,
        obstacle: null,
        tip: 'Reliable all-rounder. Good damage, wide arc.'
    },
    {
        id: 'axe',    icon: '🪓', name: 'Battle Axe',
        type: 'Arc swing',
        special: null,
        obstacle: { icon: '🌲', label: 'Cuts down Trees' },
        tip: 'High damage. Chop trees to open new paths.'
    },
    {
        id: 'sickle', icon: '🌙', name: 'Sickle',
        type: 'Radial (360°)',
        special: null,
        obstacle: { icon: '🍃', label: 'Clears Tall Grass' },
        tip: 'Full-circle spin — hits everything around you.'
    },
    {
        id: 'spear',  icon: '🔱', name: 'Lance',
        type: 'Linear thrust',
        special: null,
        obstacle: null,
        tip: 'Long reach. Pierces enemies in a straight line.'
    },
    {
        id: 'chain',  icon: '⛓️', name: 'Grapple Whip',
        type: 'Projectile',
        special: { icon: '🟣', label: 'Grapples to Posts' },
        obstacle: null,
        tip: 'Launch at purple posts to zip across pits.'
    },
    {
        id: 'star',   icon: '☄️', name: 'Morning Star',
        type: 'Arc swing',
        special: null,
        obstacle: { icon: '🪨', label: 'Smashes Rocks' },
        tip: 'Heaviest damage. Destroys boulder obstacles.'
    },
];

function _renderWeaponGuide(container) {
    container.innerHTML = _WEAPON_GUIDE.map(w => `
        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);border-radius:8px;padding:10px 12px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="font-size:22px;line-height:1;">${w.icon}</span>
                <div>
                    <div style="font-weight:bold;font-size:12px;color:#ecf0f1;">${w.name}</div>
                    <div style="font-size:10px;color:#7f8c8d;">${w.type}</div>
                </div>
            </div>
            ${w.obstacle ? `
                <div style="display:flex;align-items:center;gap:6px;background:rgba(39,174,96,0.12);border:1px solid rgba(39,174,96,0.3);border-radius:5px;padding:4px 8px;margin-bottom:5px;font-size:11px;color:#2ecc71;">
                    <span>${w.obstacle.icon}</span><span>${w.obstacle.label}</span>
                </div>` : ''}
            ${w.special ? `
                <div style="display:flex;align-items:center;gap:6px;background:rgba(155,89,182,0.15);border:1px solid rgba(155,89,182,0.35);border-radius:5px;padding:4px 8px;margin-bottom:5px;font-size:11px;color:#c39bd3;">
                    <span>${w.special.icon}</span><span>${w.special.label}</span>
                </div>` : ''}
            <div style="font-size:10px;color:#95a5a6;margin-top:2px;">${w.tip}</div>
        </div>
    `).join('');
}