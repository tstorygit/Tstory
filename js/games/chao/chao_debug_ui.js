// js/games/chao/chao_debug_ui.js

export function renderDebugTab(container, stateManager, showToast, onStateChanged) {
    container.innerHTML = `
        <h3>Developer & Debug Tools</h3>
        <p style="color:#ff5555; margin-bottom: 15px;">Warning: Using these might ruin the fun!</p>
        
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button id="dbg-seishin" class="chao-action-btn" style="background:#50fa7b; color:#282a36;">+500 Seishin</button>
            <button id="dbg-fruits" class="chao-action-btn" style="background:#f1fa8c; color:#282a36;">+10 All Fruits</button>
            <button id="dbg-stats" class="chao-action-btn" style="background:#ff79c6;">Max Stats (Lv 99)</button>
            <button id="dbg-hat" class="chao-action-btn" style="background:#bd93f9;">Equip Golden Crown</button>
            <button id="dbg-reset-diary" class="chao-action-btn" style="background:#ff5555;">Clear Diary History</button>
        </div>
    `;

    container.querySelector('#dbg-seishin').addEventListener('click', () => {
        stateManager.data.seishin += 500;
        stateManager.save();
        showToast("Added 500 Seishin!");
        onStateChanged();
    });

    container.querySelector('#dbg-fruits').addEventListener('click', () => {
        ['run', 'power', 'swim', 'fly', 'wisdom', 'stamina'].forEach(f => {
            stateManager.data.fruits[f] = (stateManager.data.fruits[f] || 0) + 10;
        });
        stateManager.save();
        showToast("Added 10 of every fruit!");
        onStateChanged();
    });

    container.querySelector('#dbg-stats').addEventListener('click', () => {
        const chi = stateManager.getActiveChi();
        ['run', 'power', 'swim', 'fly', 'wisdom', 'stamina'].forEach(stat => {
            chi.stats[stat === 'run' ? 'agility' : stat === 'power' ? 'strength' : stat] = 99;
        });
        stateManager.save();
        showToast(`${chi.name} is now overpowered!`);
        onStateChanged();
    });

    container.querySelector('#dbg-hat').addEventListener('click', () => {
        const chi = stateManager.getActiveChi();
        chi.equippedHat = "Golden Crown";
        stateManager.save();
        showToast(`${chi.name} equipped a Golden Crown! (Nikki will mention this)`);
    });

    container.querySelector('#dbg-reset-diary').addEventListener('click', () => {
        const chi = stateManager.getActiveChi();
        chi.diaryEntries = [];
        stateManager.save();
        showToast(`Cleared ${chi.name}'s Diary. Next visit to Garden will trigger a new entry.`);
    });
}