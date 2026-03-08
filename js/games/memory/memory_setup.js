// memory_shop.js
import { getState, saveState, SHOP_ITEMS } from './memory_state.js';

let _container = null;
let _onClose = null;

export function initShop(container) {
    _container = container;
}

export function openShop(onCloseCallback) {
    _onClose = onCloseCallback;
    _render();
    _container.style.display = 'flex';
}

function closeShop() {
    _container.style.display = 'none';
    if (_onClose) _onClose();
}

function _render() {
    const state = getState();
    
    let html = `
        <div class="mem-shop-modal">
            <div class="mem-shop-header">
                <h2>Card Shop</h2>
                <div class="mem-shop-coins">🪙 ${state.coins.toLocaleString()}</div>
            </div>
            <div class="mem-shop-body">
    `;

    // Group items by tier
    for (let tier = 1; tier <= 6; tier++) {
        const items = SHOP_ITEMS.filter(i => i.tier === tier);
        if (items.length === 0) continue;
        
        html += `<div class="mem-shop-tier">Tier ${tier}</div>`;
        html += `<div class="mem-shop-grid">`;
        
        items.forEach(item => {
            const isUnlocked = state.unlocked.includes(item.id);
            const isEquipped = state.equipped === item.id;
            
            html += `
                <div class="mem-shop-card ${isEquipped ? 'equipped' : ''} ${!isUnlocked ? 'locked' : ''}">
                    <div class="mem-shop-icon">${item.icon}</div>
                    <div class="mem-shop-name">${item.name}</div>
                    ${isEquipped ? 
                        `<button class="mem-btn-equipped" disabled>Equipped</button>` : 
                     isUnlocked ? 
                        `<button class="mem-btn-equip primary-btn" data-id="${item.id}">Equip</button>` :
                        `<button class="mem-btn-buy" data-id="${item.id}" data-price="${item.price}">🪙 ${item.price.toLocaleString()}</button>`
                    }
                </div>
            `;
        });
        html += `</div>`;
    }

    html += `
            </div>
            <div class="mem-shop-footer">
                <button class="caro-back-btn" id="mem-close-shop">Close Shop</button>
            </div>
        </div>
    `;

    _container.innerHTML = html;

    // Attach Listeners
    _container.querySelector('#mem-close-shop').addEventListener('click', closeShop);
    
    _container.querySelectorAll('.mem-btn-buy').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.getAttribute('data-id');
            const price = parseInt(e.target.getAttribute('data-price'));
            if (state.coins >= price) {
                state.coins -= price;
                state.unlocked.push(id);
                state.equipped = id;
                saveState(state);
                _render();
            } else {
                alert("Not enough coins!");
            }
        });
    });

    _container.querySelectorAll('.mem-btn-equip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            state.equipped = e.target.getAttribute('data-id');
            saveState(state);
            _render();
        });
    });
}