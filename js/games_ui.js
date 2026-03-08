// js/games_ui.js — Games tab shell

let Caro = null;
let Neko = null;
let Tbb  = null;
let memoryModule = null; // Renamed to avoid global object collisions

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

async function loadNeko() {
    if (Neko) return Neko;
    try {
        Neko = await import('./games/neko/neko.js');
        return Neko;
    } catch (e) {
        console.error('[Games] Failed to load NekoNihongo module:', e);
        return null;
    }
}

async function loadTbb() {
    if (Tbb) return Tbb;
    try {
        Tbb = await import('./games/tbb/tbb.js');
        return Tbb;
    } catch (e) {
        console.error('[Games] Failed to load TBB module:', e);
        return null;
    }
}

async function loadMemory() {
    if (memoryModule) return memoryModule;
    try {
        // Cache buster appended to force the browser to load the newest file
        memoryModule = await import(`./games/memory/memory.js?v=${Date.now()}`);
        return memoryModule;
    } catch (e) {
        console.error('[Games] Failed to load Memory module:', e);
        return null;
    }
}

export function initGames() {
    // Pre-load Caro in the background
    loadCaro().then(caro => {
        if (!caro) return;
        caro.init({
            setup: document.getElementById('caro-setup-screen'),
            game:  document.getElementById('caro-game-screen'),
            stats: document.getElementById('caro-stats-screen'),
        }, showList);
    });

    // Pre-load Neko in the background
    loadNeko().then(neko => {
        if (!neko) return;
        neko.init({
            setup: document.getElementById('neko-setup-screen'),
            game:  document.getElementById('neko-game-screen'),
            stats: document.getElementById('neko-stats-screen'),
        }, showList);
    });

    // Pre-load TBB in the background
    loadTbb().then(tbb => {
        if (!tbb) return;
        tbb.init({
            setup:   document.getElementById('tbb-setup-screen'),
            game:    document.getElementById('tbb-game-screen'),
            summary: document.getElementById('tbb-summary-screen'),
        }, showList);
    });

    // Pre-load Memory in the background
    loadMemory().then(mem => {
        if (!mem) return;
        mem.init({ setup: document.getElementById('memory-screen') }, showList);
    });

    document.querySelector('button[data-target="view-games"]')
        ?.addEventListener('click', showList);

    showList();
}

function showList() {
    [
        'caro-setup-screen', 'caro-game-screen', 'caro-stats-screen',
        'neko-setup-screen', 'neko-game-screen', 'neko-stats-screen',
        'tbb-setup-screen',  'tbb-game-screen',  'tbb-summary-screen',
        'memory-screen'
    ].forEach(id => {
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

        <div class="caro-game-card" id="btn-open-memory">
            <div class="caro-game-card-icon">🎴</div>
            <div class="caro-game-card-body">
                <div class="caro-game-card-title">Memory Match</div>
                <div class="caro-game-card-desc">Find pairs of Kanji and Meanings or Readings. Earn coins to unlock custom card designs!</div>
            </div>
            <div class="caro-game-card-arrow">›</div>
        </div>

        <div class="caro-game-card" id="btn-open-neko">
            <div class="caro-game-card-icon">🐾</div>
            <div class="caro-game-card-body">
                <div class="caro-game-card-title">NekoNihongo — Idle Dojo</div>
                <div class="caro-game-card-desc">Pet cats, earn fish, and review vocab flashcards in this idle clicker. Ascend and Rebirth for permanent power!</div>
            </div>
            <div class="caro-game-card-arrow">›</div>
        </div>

        <div class="caro-game-card" id="btn-open-tbb">
            <div class="caro-game-card-icon">⚔️</div>
            <div class="caro-game-card-body">
                <div class="caro-game-card-title">Turn-Based Battle</div>
                <div class="caro-game-card-desc">Fight dungeon monsters by answering vocab questions. Level up, allocate stats, and ascend for permanent perks!</div>
            </div>
            <div class="caro-game-card-arrow">›</div>
        </div>
    `;

    // ── Caro launch ────────────────────────────────────────────────────────────
    document.getElementById('btn-open-caro').addEventListener('click', async () => {
        const caro = await loadCaro();
        if (!caro) {
            alert('Could not load the Caro game. Check the browser console for errors.');
            return;
        }
        caro.init({
            setup: document.getElementById('caro-setup-screen'),
            game:  document.getElementById('caro-game-screen'),
            stats: document.getElementById('caro-stats-screen'),
        }, showList);
        listEl.style.display = 'none';
        document.getElementById('games-header-title').textContent = 'Caro — Setup';
        caro.launch();
    });

    // ── Memory Match launch ────────────────────────────────────────────────────
    document.getElementById('btn-open-memory').addEventListener('click', async () => {
        const mem = await loadMemory();
        if (!mem || typeof mem.init !== 'function') {
            alert('Could not load Memory Match. Make sure the file exists and exports "init".');
            return;
        }
        mem.init({ setup: document.getElementById('memory-screen') }, showList);
        listEl.style.display = 'none';
        document.getElementById('games-header-title').textContent = 'Memory — Setup';
        mem.launch();
    });

    // ── NekoNihongo launch ─────────────────────────────────────────────────────
    document.getElementById('btn-open-neko').addEventListener('click', async () => {
        const neko = await loadNeko();
        if (!neko) {
            alert('Could not load NekoNihongo. Check the browser console for errors.');
            return;
        }
        neko.init({
            setup: document.getElementById('neko-setup-screen'),
            game:  document.getElementById('neko-game-screen'),
            stats: document.getElementById('neko-stats-screen'),
        }, showList);
        listEl.style.display = 'none';
        document.getElementById('games-header-title').textContent = 'NekoNihongo — Setup';
        neko.launch();
    });

    // ── Turn-Based Battle launch ───────────────────────────────────────────────
    document.getElementById('btn-open-tbb').addEventListener('click', async () => {
        const tbb = await loadTbb();
        if (!tbb) {
            alert('Could not load Turn-Based Battle. Check the browser console for errors.');
            return;
        }
        tbb.init({
            setup:   document.getElementById('tbb-setup-screen'),
            game:    document.getElementById('tbb-game-screen'),
            summary: document.getElementById('tbb-summary-screen'),
        }, showList);
        listEl.style.display = 'none';
        document.getElementById('games-header-title').textContent = '⚔️ Turn-Based Battle';
        tbb.launch();
    });
}