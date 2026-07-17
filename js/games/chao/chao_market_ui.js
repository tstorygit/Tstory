// js/games/chao/chao_market_ui.js

import { createNewChi } from './chao_state.js';

export const MARKET_ITEMS = [
    { id: 'run', name: 'Run Fruit', stat: 'agility', cost: 10, icon: '🏃' },
    { id: 'power', name: 'Power Fruit', stat: 'strength', cost: 10, icon: '💪' },
    { id: 'swim', name: 'Swim Fruit', stat: 'swim', cost: 10, icon: '🏊' },
    { id: 'fly', name: 'Fly Fruit', stat: 'fly', cost: 10, icon: '🦅' },
    { id: 'wisdom', name: 'Wisdom Fruit', stat: 'wisdom', cost: 15, icon: '🧠' },
    { id: 'stamina', name: 'Stamina Fruit', stat: 'stamina', cost: 10, icon: '❤️' }
];

export const HAT_ITEMS = [
    { id: 'hat_straw',  hat: 'Straw Hat',    cost: 100, icon: '👒' },
    { id: 'hat_wizard', hat: 'Wizard Cap',   cost: 250, icon: '🧙' },
    { id: 'hat_crown',  hat: 'Golden Crown', cost: 500, icon: '👑' }
];

export const EGG_COST = 300;
export const MAX_CHIS = 8;

const EGG_NAMES = ['Momo', 'Kuro', 'Yuki', 'Hana', 'Taro', 'Sora', 'Mochi', 'Riku', 'Ume', 'Kin', 'Chibi', 'Nori'];

function pickEggName(stateManager) {
    const used = new Set(stateManager.data.chis.map(c => c.name));
    const free = EGG_NAMES.filter(n => !used.has(n));
    if (free.length > 0) return free[Math.floor(Math.random() * free.length)];
    return 'Chi' + (stateManager.data.chis.length + 1);
}

export function renderMarketTab(container, stateManager, showToast, onPurchaseComplete) {
    const seishin = stateManager.data.seishin;
    const activeChi = stateManager.getActiveChi();
    const ownedHats = stateManager.data.inventory.hats || [];
    const chiCount = stateManager.data.chis.length;

    const hatCardHtml = (item) => {
        const owned = ownedHats.includes(item.hat);
        const equipped = activeChi && activeChi.equippedHat === item.hat;
        let btn;
        if (!owned) {
            btn = `<button class="chao-action-btn" style="width:100%; padding: 8px; margin: 5px 0 0 0;"
                data-action="buy-hat" data-id="${item.id}" ${seishin < item.cost ? 'disabled' : ''}>Buy</button>`;
        } else if (equipped) {
            btn = `<button class="chao-action-btn" style="width:100%; padding: 8px; margin: 5px 0 0 0; background:#ff5555;"
                data-action="unequip-hat" data-id="${item.id}">Take Off</button>`;
        } else {
            btn = `<button class="chao-action-btn" style="width:100%; padding: 8px; margin: 5px 0 0 0; background:#50fa7b; color:#282a36;"
                data-action="equip-hat" data-id="${item.id}">Equip</button>`;
        }
        return `
            <div class="market-item">
                <div class="market-icon">${item.icon}</div>
                <div>${item.hat}</div>
                <div class="market-cost">${owned ? 'Owned' : `${item.cost} Seishin`}</div>
                ${btn}
            </div>`;
    };

    container.innerHTML = `
        <h3 style="margin-top:0;">🌸 Seishin Market</h3>
        <p style="margin-top:0;">Spend Seishin earned from your SRS studies here!</p>

        <h4 style="margin: 12px 0 4px 0; color:#50fa7b;">🍎 Stat Fruits</h4>
        <p style="margin:0; font-size:12px; color:#aaa;">Feed these to your Chi in the Garden to raise its stats.</p>
        <div class="market-grid">
            ${MARKET_ITEMS.map(item => `
                <div class="market-item">
                    <div class="market-icon">${item.icon}</div>
                    <div>${item.name}</div>
                    <div class="market-cost">${item.cost} Seishin</div>
                    <button class="chao-action-btn" style="width:100%; padding: 8px; margin: 5px 0 0 0;"
                        data-action="buy-fruit" data-id="${item.id}" ${seishin < item.cost ? 'disabled' : ''}>Buy</button>
                </div>
            `).join('')}
        </div>

        <h4 style="margin: 18px 0 4px 0; color:#bd93f9;">🎩 Hats</h4>
        <p style="margin:0; font-size:12px; color:#aaa;">Cosmetics for <b>${activeChi ? activeChi.name : 'your Chi'}</b>. They show up in the Garden and in diary entries!</p>
        <div class="market-grid">
            ${HAT_ITEMS.map(hatCardHtml).join('')}
        </div>

        <h4 style="margin: 18px 0 4px 0; color:#f1fa8c;">🥚 Chi Egg</h4>
        <p style="margin:0; font-size:12px; color:#aaa;">Hatch a brand new Chi with random DNA. (${chiCount}/${MAX_CHIS} garden spots used)</p>
        <div class="market-grid">
            <div class="market-item">
                <div class="market-icon">🥚</div>
                <div>Mystery Egg</div>
                <div class="market-cost">${EGG_COST} Seishin</div>
                <button class="chao-action-btn" style="width:100%; padding: 8px; margin: 5px 0 0 0;"
                    data-action="buy-egg" ${seishin < EGG_COST || chiCount >= MAX_CHIS ? 'disabled' : ''}>
                    ${chiCount >= MAX_CHIS ? 'Garden Full' : 'Hatch'}
                </button>
            </div>
        </div>
    `;

    const rerender = () => {
        renderMarketTab(container, stateManager, showToast, onPurchaseComplete);
        onPurchaseComplete();
    };

    container.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.getAttribute('data-action');
            const itemId = e.currentTarget.getAttribute('data-id');
            const chi = stateManager.getActiveChi();

            if (action === 'buy-fruit') {
                const item = MARKET_ITEMS.find(i => i.id === itemId);
                if (!item || stateManager.data.seishin < item.cost) return;
                stateManager.data.seishin -= item.cost;
                stateManager.data.fruits[item.id] = (stateManager.data.fruits[item.id] || 0) + 1;
                stateManager.save();
                showToast(`Bought ${item.name}!`);
                rerender();

            } else if (action === 'buy-hat') {
                const item = HAT_ITEMS.find(i => i.id === itemId);
                if (!item || stateManager.data.seishin < item.cost) return;
                if (!stateManager.data.inventory.hats) stateManager.data.inventory.hats = [];
                stateManager.data.seishin -= item.cost;
                stateManager.data.inventory.hats.push(item.hat);
                stateManager.save();
                showToast(`Bought the ${item.hat}!`);
                rerender();

            } else if (action === 'equip-hat') {
                const item = HAT_ITEMS.find(i => i.id === itemId);
                if (!item || !chi) return;
                chi.equippedHat = item.hat;
                stateManager.save();
                showToast(`${chi.name} put on the ${item.hat}!`);
                rerender();

            } else if (action === 'unequip-hat') {
                if (!chi) return;
                chi.equippedHat = null;
                stateManager.save();
                showToast(`${chi.name} took off their hat.`);
                rerender();

            } else if (action === 'buy-egg') {
                if (stateManager.data.seishin < EGG_COST) return;
                if (stateManager.data.chis.length >= MAX_CHIS) return;
                stateManager.data.seishin -= EGG_COST;
                const newChi = createNewChi(pickEggName(stateManager));
                stateManager.data.chis.push(newChi);
                stateManager.data.activeChiId = newChi.id;
                stateManager.save();
                showToast(`🥚 The egg hatched! Welcome, ${newChi.name}!`);
                rerender();
            }
        });
    });
}
