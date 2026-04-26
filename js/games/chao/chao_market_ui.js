// js/games/chao/chao_market_ui.js

export const MARKET_ITEMS = [
    { id: 'run', name: 'Run Fruit', stat: 'agility', cost: 10, icon: '🏃' },
    { id: 'power', name: 'Power Fruit', stat: 'strength', cost: 10, icon: '💪' },
    { id: 'swim', name: 'Swim Fruit', stat: 'swim', cost: 10, icon: '🏊' },
    { id: 'fly', name: 'Fly Fruit', stat: 'fly', cost: 10, icon: '🦅' },
    { id: 'wisdom', name: 'Wisdom Fruit', stat: 'wisdom', cost: 15, icon: '🧠' },
    { id: 'stamina', name: 'Stamina Fruit', stat: 'stamina', cost: 10, icon: '❤️' }
];

export function renderMarketTab(container, stateManager, showToast, onPurchaseComplete) {
    container.innerHTML = `
        <h3>Black Market</h3>
        <p>Spend Seishin here to buy stat fruits to feed to your Chi!</p>
        <div id="market-grid" class="market-grid">
            ${MARKET_ITEMS.map(item => `
                <div class="market-item">
                    <div class="market-icon">${item.icon}</div>
                    <div>${item.name}</div>
                    <div class="market-cost">${item.cost} Seishin</div>
                    <button class="chao-action-btn" style="width:100%; padding: 8px; margin: 5px 0 0 0;" 
                        data-id="${item.id}" ${ stateManager.data.seishin < item.cost ? 'disabled' : '' }>Buy</button>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemId = e.target.getAttribute('data-id');
            const item = MARKET_ITEMS.find(i => i.id === itemId);
            if (stateManager.data.seishin >= item.cost) {
                stateManager.data.seishin -= item.cost;
                stateManager.data.fruits[item.id] = (stateManager.data.fruits[item.id] || 0) + 1;
                stateManager.save();
                showToast(`Bought ${item.name}!`);
                
                // Re-render this tab to update disabled button states
                renderMarketTab(container, stateManager, showToast, onPurchaseComplete);
                // Ping the main shell to update the global UI (Seishin counter, feed menu)
                onPurchaseComplete();
            }
        });
    });
}