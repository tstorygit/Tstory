// js/games_ui.js — Games tab shell
//
// To add a new game, only edit GAME_REGISTRY below.
// No changes to index.html are ever needed.

// ─── Game Registry ────────────────────────────────────────────────────────────
// Each entry describes one game. The loader, screens, and card are derived
// automatically. screen entries map { key → css-classes-and-styles }.

const GAME_REGISTRY = [
   {
    id:     'chao',
    icon:   '🐾',
    title:  'Chi Garden',
    desc:   'Raise a virtual pet. Earn Seishin through SRS, feed it stat-boosting fruits, and read its AI-generated diary!',
    loader: () => import('./games/chao/chao.js'),
    headerTitle: 'Chi Garden',
    screens: {
        setup: { classes: 'content-scroll' }
         },
    },
    {
        id:     'caro',
        icon:   '🃏',
        title:  'Caro — Vocab Recall',
        desc:   'Show a word, rate your recall as Perfect / Partial / Miss. Updates your SRS at the end.',
        loader: () => import('./games/caro/caro.js'),
        headerTitle: 'Caro — Setup',
        screens: {
            setup:  { classes: 'content-scroll' },
            game:   { classes: 'content-scroll', style: 'background:var(--flashcard-bg);' },
            stats:  { classes: 'content-scroll' },
        },
    },
    {
        id:     'memory',
        icon:   '🎴',
        title:  'Memory Match',
        desc:   'Find pairs of Kanji and Meanings or Readings. Earn coins to unlock custom card designs!',
        loader: () => import(`./games/memory/memory.js?v=${Date.now()}`),
        headerTitle: 'Memory — Setup',
        screens: {
            setup:  { classes: 'content-scroll', style: 'padding:0;' },
        },
    },
    {
        id:     'neko',
        icon:   '🐾',
        title:  'NekoNihongo — Idle Dojo',
        desc:   'Pet cats, earn fish, and review vocab flashcards in this idle clicker. Ascend and Rebirth for permanent power!',
        loader: () => import('./games/neko/neko.js'),
        headerTitle: 'NekoNihongo — Setup',
        screens: {
            setup:  { classes: 'content-scroll' },
            game:   { classes: 'content-scroll' },
            stats:  { classes: 'content-scroll' },
        },
    },
    {
        id:     'tbb',
        icon:   '⚔️',
        title:  'Turn-Based Battle',
        desc:   'Fight dungeon monsters by answering vocab questions. Level up, allocate stats, and ascend for permanent perks!',
        loader: () => import('./games/tbb/tbb.js'),
        headerTitle: '⚔️ Turn-Based Battle',
        screens: {
            setup:   { classes: 'content-scroll' },
            game:    { classes: 'content-scroll' },
            summary: { classes: 'content-scroll' },
        },
    },
{
    id:     'tower',
    icon:   '🗼',
    title:  'Polyglot Tower',
    desc:   'Defend your tower against geometric waves. Answer vocabulary correctly at the start of each wave to gain massive power buffs.',
    loader: () => import('./games/tower/tower.js'),
    headerTitle: 'Polyglot Tower',
    screens: {
        setup: { classes: '' }, // The Hub/Menu
        game:  { classes: '', style: 'padding:0; overflow:hidden; position:relative;' }, // The Battle
    },
},
    {
        id:     'eu',
        icon:   '🌍',
        title:  'Vocab Universalis',
        desc:   'Build a grand empire by mastering vocabulary. Conquer provinces, manage resources, and crush rebellions!',
        loader: () => import('./games/eu/eu.js'),
        headerTitle: '🌍 Vocab Universalis',
        screens: {
            setup: { classes: 'content-scroll' },
            game:  { classes: 'content-scroll', style: 'padding:0;' },
        },
    },
    {
        id:     'vocabcraft',
        icon:   '🔮',
        title:  'VocabCraft',
        desc:   'A tower defense where Mana fuels your structures, but Vocabulary casts the spells. Rely on Orange gems to farm mana so you can grind reviews!',
        loader: () => import('./games/vocabcraft/vocabcraft.js'),
        headerTitle: 'VocabCraft',
        screens: {
            setup: { classes: 'content-scroll' },
            game:  { classes: 'content-scroll', style: 'padding:0;' },
        },
    },
    {
        id:     'survivor',
        icon:   '👺',
        title:  'Yōkai Survivor',
        desc:   'Bullet-hell auto-shooter. Survive infinite waves, collect XP, and unleash devastating upgrades by executing rapid-fire SRS reviews.',
        loader: () => import('./games/survivor/survivor.js'),
        headerTitle: 'Yōkai Survivor',
        screens: {
            setup:   { classes: 'content-scroll' },
            game:    { classes: '', style: 'padding:0; overflow:hidden; position:relative; display:flex; flex-direction:column;' },
        },
    },
    {
        id:     'legend',
        icon:   '🗡️',
        title:  'Legend of Vocab',
        desc:   'Explore dungeons, cut trees, grapple across pits, and fight monsters. Answer vocab to level up and dodge fatal blows!',
        loader: () => import('./games/legend/legend.js'),
        headerTitle: 'Legend of Vocab',
        screens: {
            setup:   { classes: 'content-scroll' },
            game:    { classes: '', style: 'padding:0; overflow:hidden; position:relative; display:flex; flex-direction:column;' },
        },
    },
];

// ─── Module cache ─────────────────────────────────────────────────────────────

const _moduleCache = {};

async function _loadGame(id) {
    if (_moduleCache[id]) return _moduleCache[id];
    const entry = GAME_REGISTRY.find(g => g.id === id);
    if (!entry) return null;
    try {
        _moduleCache[id] = await entry.loader();
        return _moduleCache[id];
    } catch (e) {
        console.error(`[Games] Failed to load "${id}" module:`, e);
        return null;
    }
}

// ─── Screen div management ────────────────────────────────────────────────────

const SCREEN_DIV_PREFIX = 'game-screen--';

function _ensureScreens() {
    const container = document.getElementById('view-games');
    if (!container) return;

    for (const game of GAME_REGISTRY) {
        for (const [key, cfg] of Object.entries(game.screens)) {
            const divId = `${SCREEN_DIV_PREFIX}${game.id}-${key}`;
            if (document.getElementById(divId)) continue; // already created

            const div = document.createElement('div');
            div.id = divId;
            if (cfg.classes) div.className = cfg.classes;
            div.style.display = 'none';
            // Ensure screens can scroll independently inside the flex view
            div.style.flex = '1';
            div.style.minHeight = '0';
            div.style.overflowY = 'auto';
            div.style.webkitOverflowScrolling = 'touch';
            if (cfg.style) div.style.cssText += cfg.style;
            container.appendChild(div);
        }
    }
}

function _getScreen(gameId, screenKey) {
    return document.getElementById(`${SCREEN_DIV_PREFIX}${gameId}-${screenKey}`);
}

function _screensFor(gameId) {
    const game = GAME_REGISTRY.find(g => g.id === gameId);
    if (!game) return {};
    return Object.fromEntries(
        Object.keys(game.screens).map(key => [key, _getScreen(gameId, key)])
    );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initGames() {
    _ensureScreens();

    // Pre-load all game modules in the background (warm the cache only).
    // Do NOT call mod.init() here — init() is called exactly once per launch
    // in the click handler below. Calling it here too causes double event
    // listeners, duplicate DOM IDs, and broken HUD state in every game.
    for (const game of GAME_REGISTRY) {
        _loadGame(game.id).catch(() => {}); // fire-and-forget; errors logged in _loadGame
    }

    document.querySelector('button[data-target="view-games"]')
        ?.addEventListener('click', showList);

    showList();
}

function showList() {
    // Hide all game screens
    for (const game of GAME_REGISTRY) {
        for (const key of Object.keys(game.screens)) {
            const el = _getScreen(game.id, key);
            if (el) el.style.display = 'none';
        }
    }

    const listEl = document.getElementById('games-list-screen');
    if (!listEl) return;
    listEl.style.display = 'block';
    listEl.style.flex = '1';
    listEl.style.minHeight = '0';
    listEl.style.overflowY = 'auto';
    listEl.style.webkitOverflowScrolling = 'touch';
    listEl.style.paddingBottom = '70px'; // clear the floating ... button

    const hdr = document.getElementById('games-header-title');
    if (hdr) hdr.textContent = 'Mini Games';

    // Build game cards from registry
    listEl.innerHTML = GAME_REGISTRY.map(game => `
        <div class="caro-game-card" id="btn-open-${game.id}">
            <div class="caro-game-card-icon">${game.icon}</div>
            <div class="caro-game-card-body">
                <div class="caro-game-card-title">${game.title}</div>
                <div class="caro-game-card-desc">${game.desc}</div>
            </div>
            <div class="caro-game-card-arrow">›</div>
        </div>
    `).join('');

    // Wire up launch handlers
    for (const game of GAME_REGISTRY) {
        document.getElementById(`btn-open-${game.id}`)
            ?.addEventListener('click', async () => {
                const mod = await _loadGame(game.id);
                if (!mod) {
                    alert(`Could not load "${game.title}". Check the browser console for errors.`);
                    return;
                }
                mod.init?.(_screensFor(game.id), showList);
                listEl.style.display = 'none';
                const hdr = document.getElementById('games-header-title');
                if (hdr) hdr.textContent = game.headerTitle;
                mod.launch?.();
            });
    }
}