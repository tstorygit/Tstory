// js/games/legend/leg_ui.js
import { WEAPONS, PERKS } from './leg_entities.js';

let dom = {};
let callbacks = null;

export function initUI(container, cbs) {
    callbacks = cbs;
    container.innerHTML = `
        <div class="leg-hud">
            <div class="leg-hud-col">
                <span id="leg-hp-txt" class="leg-stat-text">HP</span>
                <div class="leg-bar-wrap"><div id="leg-hp-fill" class="leg-hp-fill"></div></div>
            </div>
            <div class="leg-hud-center">
                <div id="leg-lvl-txt" style="margin-bottom:2px;">LV. 1</div>
                <div class="leg-bar-wrap" style="width:70px;height:6px;"><div id="leg-exp-fill" class="leg-exp-fill"></div></div>
                <div id="leg-exp-txt" style="font-size:9px; color:#bdc3c7; margin-top:2px;">0/100</div>
            </div>
            <div class="leg-hud-col" style="align-items:flex-end;">
                <span id="leg-mp-txt" class="leg-stat-text">MP</span>
                <div class="leg-bar-wrap"><div id="leg-mp-fill" class="leg-mp-fill"></div></div>
            </div>
            <div class="leg-hud-right">
                <button id="leg-btn-action" class="leg-btn" style="font-size:18px;">🗡️</button>
                <button id="leg-btn-menu" class="leg-btn" style="border-color:#f1c40f;">☰</button>
            </div>
        </div>
        
        <div class="leg-overlay" id="leg-menu-overlay">
            <div class="leg-menu-header">
                <h2 class="leg-menu-title">Camp Menu</h2>
                <button id="leg-btn-close" class="leg-btn">✕</button>
            </div>
            <div class="leg-menu-container">
                <div class="leg-menu-col">
                    <div class="leg-col-title">Weapons</div>
                    <div id="leg-weapon-list" class="leg-weapon-grid"></div>
                </div>
                <div class="leg-menu-col">
                    <div class="leg-col-title">Items & Magic</div>
                    <div style="background:rgba(0,0,0,0.3); border-radius:6px; padding:10px; margin-bottom:10px;">
                        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:bold;margin-bottom:6px;">
                            <span>🧪 Potion</span>
                            <span id="leg-potion-count">x3</span>
                        </div>
                        <button id="leg-use-potion" class="leg-btn" style="width:100%;font-size:12px;">Drink (+50 HP)</button>
                    </div>
                    <div class="leg-col-title" style="margin-top:10px;">Action Button</div>
                    <button id="leg-toggle-magic" class="leg-btn" style="width:100%;">Equip Magic (Heal 30HP / -10MP)</button>
                    <p style="font-size:10px;color:#aaa;margin-top:10px;">Tap screen to use equipped action.</p>
                </div>
                <div class="leg-menu-col">
                    <div class="leg-col-title">Stats</div>
                    <div id="leg-stat-pts-wrap" class="leg-stat-pts">Unspent Points: <span id="leg-stat-pts">0</span></div>
                    <div id="leg-stat-list" style="margin-top:10px;"></div>
                </div>
            </div>
            <div style="display:flex; gap:10px; margin-top:15px; flex-shrink:0;">
                <button id="leg-btn-rebirth-check" class="leg-btn" style="flex:1; background:#c0392b; border-color:#e74c3c;">Rebirth</button>
                <button id="leg-btn-exit" class="leg-btn" style="flex:1;">Save & Exit</button>
            </div>
        </div>

        <div class="leg-overlay" id="leg-rebirth-overlay" style="background:#1a0000; align-items:center; justify-content:center;">
            <div class="leg-death-box">
                <div class="leg-death-title">REBIRTH</div>
                <p style="color:#bdc3c7;margin-bottom:20px;">Ascend and start over. You will gain <b style="color:#f1c40f" id="leg-ap-gain">0</b> AP.</p>
                <div id="leg-perk-list" style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:300px;margin-bottom:20px;overflow-y:auto;max-height:30vh;"></div>
                <button id="leg-btn-confirm-rebirth" class="leg-btn leg-btn-primary" style="width:100%;">Ascend Now</button>
                <button id="leg-btn-cancel-rebirth" class="leg-btn" style="width:100%;margin-top:10px;">Cancel</button>
            </div>
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
        perkList: container.querySelector('#leg-perk-list'),
        exitBtn: container.querySelector('#leg-btn-exit'),
    };

    dom.menuBtn.onclick = () => { callbacks.onPause(); renderMenu(); dom.menuOverlay.style.display = 'flex'; };
    dom.closeBtn.onclick = () => { dom.menuOverlay.style.display = 'none'; callbacks.onResume(); };
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
        <div style="text-align:center; color:#2ecc71; font-weight:bold; margin-bottom:10px;">Your AP: ${state.ap}</div>
        ${Object.entries(PERKS).map(([k, p]) => {
            const owned = state.perks[k] || 0;
            return `
                <div style="background:rgba(255,255,255,0.1); padding:10px; border-radius:8px; text-align:left;">
                    <div style="display:flex;justify-content:space-between;font-weight:bold;color:#f1c40f;">
                        <span>${p.name} (Lv.${owned})</span>
                        <span>Cost: ${p.cost} AP</span>
                    </div>
                    <div style="font-size:10px;color:#ccc;margin-top:4px;">${p.desc}</div>
                    <button class="leg-btn" style="width:100%;margin-top:6px;padding:4px;" ${state.ap >= p.cost ? '' : 'disabled'} data-perk="${k}">Buy</button>
                </div>
            `;
        }).join('')}
    `;
    
    dom.perkList.querySelectorAll('button.leg-btn').forEach(btn => {
        btn.onclick = () => { callbacks.onBuyPerk(btn.dataset.perk); renderPerks(callbacks.getState()); };
    });
}