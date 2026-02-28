// js/games_ui.js — Games tab shell

let Caro = null;

async function loadCaro() {
    if (Caro) return Caro;
    try {
        Caro = await import('./games/caro/caro.js');
        return Caro;
    } catch (e) {
        console.error('[Games] Failed to load Caro module:', e);
        return null;
    }
}

export function initGames() {
    // Pre-load Caro in the background (non-blocking)
    loadCaro().then(caro => {
        if (!caro) return;
        caro.init(
            {
                setup: document.getElementById('caro-setup-screen'),
                game:  document.getElementById('caro-game-screen'),
                stats: document.getElementById('caro-stats-screen'),
            },
            showList
        );
    });

    document.querySelector('button[data-target="view-games"]')
        ?.addEventListener('click', showList);

    showList();
}

function showList() {
    ['caro-setup-screen','caro-game-screen','caro-stats-screen'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const listEl = document.getElementById('games-list-screen');
    if (!listEl) return;
    listEl.style.display = 'block';

    const hdr = document.getElementById('games-header-title');
    if (hdr) hdr.textContent = 'Mini Games';

    listEl.innerHTML = `
        <div class="caro-game-card" id="btn-open-caro">
            <div class="caro-game-card-icon">🃏</div>
            <div class="caro-game-card-body">
                <div class="caro-game-card-title">Caro — Vocab Recall</div>
                <div class="caro-game-card-desc">Show a word, rate your recall as Perfect / Partial / Miss. Updates your SRS at the end.</div>
            </div>
            <div class="caro-game-card-arrow">›</div>
        </div>
    `;

    document.getElementById('btn-open-caro').addEventListener('click', async () => {
        const caro = await loadCaro();
        if (!caro) {
            alert('Could not load the Caro game. Check the browser console for errors (likely a missing data/word_list_1000.js file).');
            return;
        }
        // Re-init screens in case DOM wasn't ready the first time
        caro.init(
            {
                setup: document.getElementById('caro-setup-screen'),
                game:  document.getElementById('caro-game-screen'),
                stats: document.getElementById('caro-stats-screen'),
            },
            showList
        );
        listEl.style.display = 'none';
        document.getElementById('games-header-title').textContent = 'Caro — Setup';
        caro.launch();
    });
}