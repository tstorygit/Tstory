// memory_state.js

const STORAGE_KEY = 'memory_game_data';

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

export function getState() {
    const defaultState = {
        coins: 0,
        unlocked: ['def_q', 'def_dark', 'def_light'],
        equipped: 'def_q'
    };
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return saved ? { ...defaultState, ...saved } : defaultState;
    } catch {
        return defaultState;
    }
}

export function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function addCoins(amount) {
    const state = getState();
    state.coins += amount;
    saveState(state);
    return state.coins;
}

export function getEquippedIcon() {
    const state = getState();
    const item = SHOP_ITEMS.find(i => i.id === state.equipped);
    return item ? item.icon : '❓';
}