// js/games/chao/chao_state.js

const SAVE_KEY = 'ai_reader_chao_save';

export function defaultState() {
    return {
        seishin: 0,
        lastSrsReviewCount: 0, 
        fruits: { run: 0, power: 0, swim: 0, fly: 0, wisdom: 0, stamina: 0 },
        chis: [],
        activeChiId: null,
        inventory: { hats: [], toys:[] },
        stats: { totalRacesWon: 0, totalPageantsWon: 0 }
    };
}

export function generateChiDNA() {
    const roll = () => Math.max(0, Math.min(100, Math.round((Math.random() + Math.random() + Math.random()) / 3 * 100)));
    return {
        effort: roll(), kindness: roll(), curiosity: roll(), shyness: roll(),
        stubbornness: roll(), cheerfulness: roll(), calmness: roll(),
        selfishness: roll(), sensitivity: roll(), bravery: roll()
    };
}

export function createNewChi(name) {
    return {
        id: 'chi_' + Date.now() + Math.floor(Math.random() * 1000),
        name: name,
        bornAt: Date.now(),
        dna: generateChiDNA(),
        stats: { stamina: 1, strength: 1, agility: 1, wisdom: 1, swim: 1, fly: 1 },
        statPoints: { stamina: 0, strength: 0, agility: 0, wisdom: 0, swim: 0, fly: 0 },
        connection: 0,
        equippedHat: null,
        diaryEntries:[]
    };
}

// Utility to get the true 0-9999 stat value (Level * 100 + Points)
export function getChiTrueStat(chi, statKey) {
    const lvl = chi.stats[statKey] || 1;
    const pts = chi.statPoints ? (chi.statPoints[statKey] || 0) : 0;
    return Math.min(9999, (lvl * 100) + pts);
}

export class ChaoStateManager {
    constructor() {
        this.data = this.load();
    }
    load() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            return raw ? JSON.parse(raw) : defaultState();
        } catch (e) {
            return defaultState();
        }
    }
    save() {
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    }
    getActiveChi() {
        return this.data.chis.find(c => c.id === this.data.activeChiId) || this.data.chis[0];
    }
}