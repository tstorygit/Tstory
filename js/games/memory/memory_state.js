// memory_state.js — save data for Memory Match.
// Save-format compatible: any field missing from an old save is defaulted here.

const STORAGE_KEY = 'memory_game_data';

export const PEEK_COST = 25;
export const BONUS_QUIZ_REWARD = 30;

export const SHOP_ITEMS = [
    // Tier 1: Basics (Cost: 0)
    { id: 'def_q', icon: '❓', name: 'Mystery', price: 0, tier: 1 },
    { id: 'def_dark', icon: '⬛', name: 'Obsidian', price: 0, tier: 1 },
    { id: 'def_light', icon: '⬜', name: 'Alabaster', price: 0, tier: 1 },
    // Tier 2: Daily Life (Cost: 250)
    { id: 'matcha', icon: '🍵', name: 'Matcha', price: 250, tier: 2 },
    { id: 'onigiri', icon: '🍙', name: 'Onigiri', price: 250, tier: 2 },
    { id: 'senbei', icon: '🍘', name: 'Senbei', price: 250, tier: 2 },
    { id: 'windchime', icon: '🎐', name: 'Chime', price: 250, tier: 2 },
    { id: 'beginner', icon: '🔰', name: 'Novice', price: 250, tier: 2 },
    // Tier 3: Nature (Cost: 1000)
    { id: 'sakura', icon: '🌸', name: 'Sakura', price: 1000, tier: 3 },
    { id: 'maple', icon: '🍁', name: 'Momiji', price: 1000, tier: 3 },
    { id: 'bamboo', icon: '🎋', name: 'Bamboo', price: 1000, tier: 3 },
    { id: 'fuji', icon: '🗻', name: 'Mt. Fuji', price: 1000, tier: 3 },
    { id: 'wave', icon: '🌊', name: 'Great Wave', price: 1000, tier: 3 },
    // Tier 4: Spirits & Culture (Cost: 5000)
    { id: 'torii', icon: '⛩️', name: 'Torii Gate', price: 5000, tier: 4 },
    { id: 'lantern', icon: '🏮', name: 'Chochin', price: 5000, tier: 4 },
    { id: 'kitsune', icon: '🦊', name: 'Kitsune', price: 5000, tier: 4 },
    { id: 'tengu', icon: '👺', name: 'Tengu', price: 5000, tier: 4 },
    { id: 'oni', icon: '👹', name: 'Oni', price: 5000, tier: 4 },
    // Tier 5: Premium Cuisine (Cost: 15000)
    { id: 'sushi', icon: '🍣', name: 'Sushi', price: 15000, tier: 5 },
    { id: 'bento', icon: '🍱', name: 'Bento', price: 15000, tier: 5 },
    { id: 'ramen', icon: '🍜', name: 'Ramen', price: 15000, tier: 5 },
    { id: 'dango', icon: '🍡', name: 'Dango', price: 15000, tier: 5 },
    { id: 'curry', icon: '🍛', name: 'Curry', price: 15000, tier: 5 },
    // Tier 6: Legendary (Cost: 50000)
    { id: 'dragon', icon: '🐉', name: 'Ryu', price: 50000, tier: 6 },
    { id: 'castle', icon: '🏯', name: 'Shiro', price: 50000, tier: 6 },
    { id: 'tower', icon: '🗼', name: 'Tower', price: 50000, tier: 6 },
    { id: 'seal', icon: '💮', name: 'Hanko', price: 50000, tier: 6 },
    { id: 'crown', icon: '👑', name: 'Emperor', price: 50000, tier: 6 }
];

function _defaultState() {
    return {
        coins: 0,
        unlocked: ['def_q', 'def_dark', 'def_light'],
        equipped: 'def_q',
        // ── Fields added after v1 — always defaulted for old saves ──
        stats: { rounds: 0, bestCombo: 0, perfectRounds: 0, pairsMatched: 0 },
        vocabConfig: null,   // GameVocabManager config snapshot (renderVocabSettings)
        poolSource: 'custom',// last computed pool source ('srs' | 'mixed' | 'custom')
        lastSetup: null      // { mode, layout } — last chosen game mode / board size
    };
}

export function getState() {
    const def = _defaultState();
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!saved || typeof saved !== 'object') return def;
        const merged = { ...def, ...saved };
        // Deep-default nested stats so old saves (no .stats) and partial
        // stats objects both load without crashing.
        merged.stats = { ...def.stats, ...(saved.stats || {}) };
        return merged;
    } catch {
        return def;
    }
}

export function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Shallow-merges a patch into the save and persists it. Returns the new state. */
export function updateState(patch) {
    const state = getState();
    Object.assign(state, patch);
    saveState(state);
    return state;
}

export function addCoins(amount) {
    const state = getState();
    state.coins = Math.max(0, state.coins + amount);
    saveState(state);
    return state.coins;
}

/** Returns true (and persists) if the player could afford the cost. */
export function spendCoins(amount) {
    const state = getState();
    if (state.coins < amount) return false;
    state.coins -= amount;
    saveState(state);
    return true;
}

export function recordRoundStats({ bestCombo = 0, perfect = false, pairs = 0 } = {}) {
    const state = getState();
    state.stats.rounds += 1;
    state.stats.bestCombo = Math.max(state.stats.bestCombo, bestCombo);
    if (perfect) state.stats.perfectRounds += 1;
    state.stats.pairsMatched += pairs;
    saveState(state);
    return state.stats;
}

export function getEquippedIcon() {
    const state = getState();
    const item = SHOP_ITEMS.find(i => i.id === state.equipped);
    return item ? item.icon : '❓';
}
