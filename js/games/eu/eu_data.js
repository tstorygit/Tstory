// js/games/eu/eu_data.js
// Static game data for Vocab Universalis.
// All tuning constants, names, ideas, missions, advisors, and event templates live here.
// eu.js imports everything it needs — add content here, not there.

// ─── Tuning Constants ─────────────────────────────────────────────────────────

export const CORE_INTERVAL_THRESHOLD   = 3600;
export const WORDS_PER_PROVINCE        = 4;
export const CORE_ADM_COST             = 10;
export const MONARCH_POINT_CAP         = 999;
export const REBEL_TAKEBACK_TIME       = 90;   // seconds before rebel province is lost
export const STABILITY_MAX             = 10;
export const DIPLO_ANNEX_DIP_COST_PER_WORD = 5;
export const MIN_PROVINCES             = 20;

// ─── Province Names ───────────────────────────────────────────────────────────
// 120 historical Japanese province names (old kuni system + Ryūkyū / Ezo periphery).
// eu.js shuffles and pops from this list; add more at the bottom if needed.

export const PROVINCE_NAMES = [
    // Kantō
    "Musashi", "Sagami", "Kazusa", "Shimōsa", "Hitachi", "Kōzuke", "Shimotsuke", "Bōsō",
    // Chūbu
    "Kai", "Shinano", "Suruga", "Tōtōmi", "Mikawa", "Owari", "Mino", "Hida",
    "Etchū", "Kaga", "Noto", "Echizen", "Echigo", "Sado",
    // Kansai
    "Yamashiro", "Yamato", "Kawachi", "Izumi", "Settsu", "Iga", "Ise", "Shima",
    "Kii", "Ōmi", "Tamba", "Tango", "Tajima", "Harima", "Awaji",
    // Chūgoku
    "Inaba", "Hōki", "Izumo", "Iwami", "Oki", "Bizen", "Mimasaka", "Bitchū",
    "Bingo", "Aki", "Suō", "Nagato",
    // Shikoku
    "Awa", "Sanuki", "Iyo", "Tosa",
    // Kyūshū
    "Chikuzen", "Chikugo", "Buzen", "Bungo", "Hizen", "Higo", "Hyūga", "Ōsumi", "Satsuma",
    // Tōhoku
    "Mutsu", "Dewa", "Rikuzen", "Rikuchū", "Ugo", "Uzen",
    // Periphery
    "Ezo", "Ryūkyū", "Tsushima", "Iki", "Gotō", "Amami",
    // Extra — evocative invented names in the same vein, for large maps
    "Kurashima", "Takaoka", "Nishino", "Higashino", "Minamoto", "Ashikaga",
    "Kamakura", "Nikko", "Hakodate", "Aomori", "Morioka", "Sendai",
    "Akita", "Yamagata", "Fukushima", "Mito", "Utsunomiya", "Maebashi",
    "Urawa", "Chiba", "Kofu", "Nagano", "Shizuoka", "Hamamatsu",
    "Gifu", "Tsu", "Otsu", "Kyōto", "Nara", "Sakai",
    "Osaka", "Kōbe", "Himeji", "Tottori", "Matsue", "Okayama",
    "Hiroshima", "Shimonoseki", "Tokushima", "Takamatsu", "Matsuyama", "Kōchi",
    "Fukuoka", "Saga", "Nagasaki", "Kumamoto", "Ōita", "Miyazaki", "Kagoshima",
    // Additional names for very large vocab sets (80+ words → 20+ provinces)
    "Wakasa", "Tosa-nishi", "Bungo-kita", "Satsuma-minami", "Hida-higashi",
    "Shinano-nishi", "Musashi-kita", "Sagami-higashi", "Echigo-minami", "Kaga-nishi",
    "Izumo-higashi", "Nagato-kita", "Suō-nishi", "Aki-minami", "Bingo-higashi",
    "Harima-nishi", "Settsu-kita", "Yamato-higashi", "Ise-minami", "Owari-nishi",
    "Mikawa-higashi", "Tōtōmi-kita", "Suruga-nishi", "Kai-minami", "Shinshū",
    "Noto-saki", "Echizen-kita", "Kaga-higashi", "Etchū-nishi", "Hida-nishi",
];

// ─── National Ideas ───────────────────────────────────────────────────────────

export const IDEAS = {
    taxation:  { name: 'National Tax Register',  desc: '+50% Base Ducats/s',                                  cost: 50,  type: 'adm', effect: 1.5 },
    humanist:  { name: 'Humanist Tolerance',      desc: 'Unrest grows 50% slower; rebels need 120s to retake', cost: 100, type: 'adm', effect: 0.5 },
    bureauc:   { name: 'Bureaucracy',             desc: `Province Coring costs only ${CORE_ADM_COST / 2} ADM`, cost: 150, type: 'adm', effect: 0.5 },
    trade:     { name: 'Trade Networks',          desc: 'Markets give +3 Ducats/s instead of +1',              cost: 100, type: 'dip', effect: 3.0 },
    diplo:     { name: 'Diplomatic Corps',        desc: 'Overextension penalties halved',                       cost: 150, type: 'dip', effect: 0.5 },
    espionage: { name: 'Espionage Network',       desc: 'Wrong answers only +15 unrest (not +30)',              cost: 200, type: 'dip', effect: 15  },
    conscript: { name: 'Mass Conscription',       desc: '+50% Base Manpower/s',                                 cost: 50,  type: 'mil', effect: 1.5 },
    quality:   { name: 'Quality Troops',          desc: 'Correct reviews give +4 MIL; war quiz +2 rounds',     cost: 100, type: 'mil', effect: 4   },
    drill:     { name: 'Professional Army',       desc: 'War cost reduced by 30%; war quiz needs 1 less win',  cost: 150, type: 'mil', effect: 0.7 },
};

// ─── Advisors ─────────────────────────────────────────────────────────────────

export const ADVISORS = {
    mint:       { name: 'Master of the Mint', icon: '💰', desc: 'Eliminates one wrong answer in the Dojo per card.',  cost: 50, upkeep: 0.3, type: 'adm' },
    captain:    { name: 'Grand Captain',      icon: '⚔️', desc: 'During wars, 1 wrong answer is forgiven.',           cost: 50, upkeep: 0.3, type: 'mil' },
    inquisitor: { name: 'Inquisitor',         icon: '📜', desc: 'Wrong answers generate only +10 Unrest.',           cost: 50, upkeep: 0.3, type: 'adm' },
};

// ─── Missions ─────────────────────────────────────────────────────────────────
// req and reward are functions — they close over _g and helpers in eu.js via the
// _getMissionContext() callback pattern. eu.js passes { g, getEmpireStats, toast }
// when evaluating missions so this file stays free of game-state imports.

// ─── Missions ─────────────────────────────────────────────────────────────────
// req and reward receive { g, getEmpireStats, toast }
// g.stats: warsWon, rebellionsCrushed, totalCorrect, totalWrong, wordsMastered,
//          highestCombo, provincesLost
// g.resources: ducats, adm, dip, mil, manpower
// g.ideas / g.advisors: key → bool / bool
// getEmpireStats(): { ownedCount, vassalCount, coredProvCount, rebellingCount, ... }

export const MISSION_DEFS = [

    // ── First Steps ──────────────────────────────────────────────────────────
    {
        key: 'first_blood',
        name: 'First Conquest',
        desc: 'Win your first war.',
        icon: '⚔️',
        category: 'conquest',
        rewardDesc: '+200 Manpower',
        req:    ({ g }) => g.stats.warsWon >= 1,
        reward: ({ g }) => { g.resources.manpower += 200; },
    },
    {
        key: 'first_core',
        name: 'Roots of Empire',
        desc: 'Core your first province.',
        icon: '🏛️',
        category: 'conquest',
        rewardDesc: '+50 ADM, +100 Ducats',
        req:    ({ getEmpireStats }) => getEmpireStats().coredProvCount >= 1,
        reward: ({ g }) => { g.resources.adm += 50; g.resources.ducats += 100; },
    },
    {
        key: 'first_answer',
        name: 'Scholar Awakens',
        desc: 'Answer your first question correctly.',
        icon: '✏️',
        category: 'scholarship',
        rewardDesc: '+20 ADM',
        req:    ({ g }) => g.stats.totalCorrect >= 1,
        reward: ({ g }) => { g.resources.adm += 20; },
    },
    {
        key: 'first_building',
        name: 'Stone & Mortar',
        desc: 'Construct your first building.',
        icon: '🧱',
        category: 'economy',
        rewardDesc: '+100 Ducats',
        req:    ({ g }) => g.provinces.some(p => p.buildings.market || p.buildings.barracks || p.buildings.fort),
        reward: ({ g }) => { g.resources.ducats += 100; },
    },
    {
        key: 'first_vassal',
        name: 'Sphere of Influence',
        desc: 'Reduce a province to a vassal.',
        icon: '🤝',
        category: 'diplomacy',
        rewardDesc: '+50 DIP, +200 Ducats',
        req:    ({ g }) => g.provinces.some(p => p.owner === 'vassal'),
        reward: ({ g }) => { g.resources.dip += 50; g.resources.ducats += 200; },
    },

    // ── Conquest & Expansion ─────────────────────────────────────────────────
    {
        key: 'wars_3',
        name: 'Warlord',
        desc: 'Win 3 wars.',
        icon: '🗡️',
        category: 'conquest',
        rewardDesc: '+40 MIL, +300 Manpower',
        req:    ({ g }) => g.stats.warsWon >= 3,
        reward: ({ g }) => { g.resources.mil += 40; g.resources.manpower += 300; },
    },
    {
        key: 'wars_10',
        name: 'God of War',
        desc: 'Win 10 wars.',
        icon: '🔱',
        category: 'conquest',
        rewardDesc: '+100 MIL, +1000 Manpower',
        req:    ({ g }) => g.stats.warsWon >= 10,
        reward: ({ g }) => { g.resources.mil += 100; g.resources.manpower += 1000; },
    },
    {
        key: 'musashi',
        name: 'The Expansionist',
        desc: 'Core 3 provinces.',
        icon: '🗺️',
        category: 'conquest',
        rewardDesc: '+500 Manpower, +50 ADM',
        req:    ({ getEmpireStats }) => getEmpireStats().coredProvCount >= 3,
        reward: ({ g }) => { g.resources.manpower += 500; g.resources.adm += 50; },
    },
    {
        key: 'core_8',
        name: 'Regional Hegemon',
        desc: 'Core 8 provinces.',
        icon: '🌐',
        category: 'conquest',
        rewardDesc: '+100 ADM, +100 DIP, +500 Ducats',
        req:    ({ getEmpireStats }) => getEmpireStats().coredProvCount >= 8,
        reward: ({ g }) => { g.resources.adm += 100; g.resources.dip += 100; g.resources.ducats += 500; },
    },
    {
        key: 'core_15',
        name: 'Empire of the Rising Sun',
        desc: 'Core 15 provinces.',
        icon: '☀️',
        category: 'conquest',
        rewardDesc: '+200 ADM, +200 DIP, +200 MIL',
        req:    ({ getEmpireStats }) => getEmpireStats().coredProvCount >= 15,
        reward: ({ g }) => { g.resources.adm += 200; g.resources.dip += 200; g.resources.mil += 200; },
    },
    {
        key: 'own_half',
        name: 'Manifest Destiny',
        desc: 'Own more than half the map\'s provinces.',
        icon: '🗾',
        category: 'conquest',
        rewardDesc: '+300 of each monarch point',
        req:    ({ g, getEmpireStats }) => {
            const s = getEmpireStats();
            return s.ownedCount > g.provinces.length / 2;
        },
        reward: ({ g }) => { g.resources.adm += 300; g.resources.dip += 300; g.resources.mil += 300; },
    },
    {
        key: 'never_lose',
        name: 'Undefeated',
        desc: 'Win 5 wars without losing a province.',
        icon: '🛡️',
        category: 'conquest',
        rewardDesc: '+150 MIL, Stability +2',
        req:    ({ g }) => g.stats.warsWon >= 5 && g.stats.provincesLost === 0,
        reward: ({ g }) => { g.resources.mil += 150; g.stability = Math.min(10, g.stability + 2); },
    },

    // ── Stability & Governance ───────────────────────────────────────────────
    {
        key: 'crusher',
        name: 'Rebellion Crusher',
        desc: 'Crush 5 rebellions.',
        icon: '🛡️',
        category: 'governance',
        rewardDesc: '+30 MIL, +100 Manpower',
        req:    ({ g }) => g.stats.rebellionsCrushed >= 5,
        reward: ({ g }) => { g.resources.mil += 30; g.resources.manpower += 100; },
    },
    {
        key: 'crush_20',
        name: 'Iron Fist',
        desc: 'Crush 20 rebellions.',
        icon: '✊',
        category: 'governance',
        rewardDesc: '+80 MIL, +500 Manpower',
        req:    ({ g }) => g.stats.rebellionsCrushed >= 20,
        reward: ({ g }) => { g.resources.mil += 80; g.resources.manpower += 500; },
    },
    {
        key: 'max_stability',
        name: 'Age of Harmony',
        desc: 'Reach maximum stability (10) while owning at least 3 provinces.',
        icon: '☮️',
        category: 'governance',
        rewardDesc: '+500 Ducats, +50 ADM',
        req:    ({ g }) => g.stability >= 10 && g.provinces.filter(p => p.owner === 'player').length >= 3 && g.stats.warsWon >= 1,
        reward: ({ g }) => { g.resources.ducats += 500; g.resources.adm += 50; },
    },
    {
        key: 'zero_unrest',
        name: 'Pax Nipponica',
        desc: 'Have all owned provinces at 0% unrest simultaneously (min. 3 provinces).',
        icon: '🕊️',
        category: 'governance',
        rewardDesc: '+200 ADM, +200 DIP',
        req:    ({ g }) => {
            const owned = g.provinces.filter(p => p.owner === 'player');
            return owned.length >= 3 && owned.every(p => p.unrest === 0);
        },
        reward: ({ g }) => { g.resources.adm += 200; g.resources.dip += 200; },
    },
    {
        key: 'no_rebels',
        name: 'The Long Peace',
        desc: 'Have no rebelling provinces while owning at least 5.',
        icon: '🌸',
        category: 'governance',
        rewardDesc: '+300 Ducats, Stability +1',
        req:    ({ g }) => {
            const owned = g.provinces.filter(p => p.owner === 'player');
            return owned.length >= 5 && owned.every(p => !p.rebelling);
        },
        reward: ({ g }) => { g.resources.ducats += 300; g.stability = Math.min(10, g.stability + 1); },
    },

    // ── Economy & Construction ───────────────────────────────────────────────
    {
        key: 'trade_empire',
        name: 'Trade Empire',
        desc: 'Build 3 Marketplaces.',
        icon: '💰',
        category: 'economy',
        rewardDesc: '+1000 Ducats',
        req:    ({ g }) => g.provinces.filter(p => p.buildings?.market).length >= 3,
        reward: ({ g }) => { g.resources.ducats += 1000; },
    },
    {
        key: 'markets_6',
        name: 'Silk Road Master',
        desc: 'Build 6 Marketplaces.',
        icon: '🏪',
        category: 'economy',
        rewardDesc: '+2500 Ducats, +50 DIP',
        req:    ({ g }) => g.provinces.filter(p => p.buildings?.market).length >= 6,
        reward: ({ g }) => { g.resources.ducats += 2500; g.resources.dip += 50; },
    },
    {
        key: 'forts_3',
        name: 'Fortress State',
        desc: 'Build 3 Forts.',
        icon: '🏯',
        category: 'economy',
        rewardDesc: '+60 MIL, +400 Manpower',
        req:    ({ g }) => g.provinces.filter(p => p.buildings?.fort).length >= 3,
        reward: ({ g }) => { g.resources.mil += 60; g.resources.manpower += 400; },
    },
    {
        key: 'barracks_4',
        name: 'Standing Army',
        desc: 'Build 4 Barracks.',
        icon: '🏕️',
        category: 'economy',
        rewardDesc: '+80 MIL, +600 Manpower',
        req:    ({ g }) => g.provinces.filter(p => p.buildings?.barracks).length >= 4,
        reward: ({ g }) => { g.resources.mil += 80; g.resources.manpower += 600; },
    },
    {
        key: 'rich',
        name: 'Treasury Overflowing',
        desc: 'Accumulate 2000 Ducats at once.',
        icon: '💎',
        category: 'economy',
        rewardDesc: '+100 ADM, +100 DIP',
        req:    ({ g }) => g.resources.ducats >= 2000,
        reward: ({ g }) => { g.resources.adm += 100; g.resources.dip += 100; },
    },
    {
        key: 'very_rich',
        name: 'Shogun\'s Vault',
        desc: 'Accumulate 5000 Ducats at once.',
        icon: '🪙',
        category: 'economy',
        rewardDesc: '+200 of each monarch point',
        req:    ({ g }) => g.resources.ducats >= 5000,
        reward: ({ g }) => { g.resources.adm += 200; g.resources.dip += 200; g.resources.mil += 200; },
    },

    // ── Diplomacy & Vassals ──────────────────────────────────────────────────
    {
        key: 'vassals_3',
        name: 'Feudal Overlord',
        desc: 'Have 3 vassal provinces simultaneously.',
        icon: '🎌',
        category: 'diplomacy',
        rewardDesc: '+100 DIP, +500 Ducats',
        req:    ({ g }) => g.provinces.filter(p => p.owner === 'vassal').length >= 3,
        reward: ({ g }) => { g.resources.dip += 100; g.resources.ducats += 500; },
    },
    {
        key: 'annex_2',
        name: 'Peaceful Integration',
        desc: 'Diplomatically annex 2 provinces.',
        icon: '🤲',
        category: 'diplomacy',
        rewardDesc: '+100 DIP, +50 ADM',
        req:    ({ g }) => (g.stats.annexCount || 0) >= 2,
        reward: ({ g }) => { g.resources.dip += 100; g.resources.adm += 50; },
    },
    {
        key: 'max_dip',
        name: 'Grand Diplomat',
        desc: 'Reach 500 DIP points.',
        icon: '🕊️',
        category: 'diplomacy',
        rewardDesc: '+200 ADM, +200 MIL',
        req:    ({ g }) => g.resources.dip >= 500,
        reward: ({ g }) => { g.resources.adm += 200; g.resources.mil += 200; },
    },

    // ── Military Might ───────────────────────────────────────────────────────
    {
        key: 'max_mil',
        name: 'God of War\'s Blessing',
        desc: 'Reach 500 MIL points.',
        icon: '🗡️',
        category: 'conquest',
        rewardDesc: '+200 ADM, +200 DIP',
        req:    ({ g }) => g.resources.mil >= 500,
        reward: ({ g }) => { g.resources.adm += 200; g.resources.dip += 200; },
    },
    {
        key: 'manpower_2000',
        name: 'Inexhaustible Legions',
        desc: 'Accumulate 2000 Manpower.',
        icon: '⚔️',
        category: 'conquest',
        rewardDesc: '+100 MIL, +500 Ducats',
        req:    ({ g }) => g.resources.manpower >= 2000,
        reward: ({ g }) => { g.resources.mil += 100; g.resources.ducats += 500; },
    },

    // ── Learning & Scholarship ───────────────────────────────────────────────
    {
        key: 'correct_50',
        name: 'Apprentice Scholar',
        desc: 'Answer 50 questions correctly.',
        icon: '📖',
        category: 'scholarship',
        rewardDesc: '+30 ADM',
        req:    ({ g }) => g.stats.totalCorrect >= 50,
        reward: ({ g }) => { g.resources.adm += 30; },
    },
    {
        key: 'correct_150',
        name: 'Journeyman',
        desc: 'Answer 150 questions correctly.',
        icon: '📚',
        category: 'scholarship',
        rewardDesc: '+60 ADM, +200 Ducats',
        req:    ({ g }) => g.stats.totalCorrect >= 150,
        reward: ({ g }) => { g.resources.adm += 60; g.resources.ducats += 200; },
    },
    {
        key: 'correct_300',
        name: 'Learned Advisor',
        desc: 'Answer 300 questions correctly.',
        icon: '🎓',
        category: 'scholarship',
        rewardDesc: '+100 ADM, +50 DIP',
        req:    ({ g }) => g.stats.totalCorrect >= 300,
        reward: ({ g }) => { g.resources.adm += 100; g.resources.dip += 50; },
    },
    {
        key: 'polyglot',
        name: 'The Polyglot Emperor',
        desc: 'Answer 500 questions correctly.',
        icon: '📚',
        category: 'scholarship',
        rewardDesc: '+100 ADM, +100 DIP, +100 MIL',
        req:    ({ g }) => g.stats.totalCorrect >= 500,
        reward: ({ g }) => { g.resources.adm += 100; g.resources.dip += 100; g.resources.mil += 100; },
    },
    {
        key: 'correct_1000',
        name: 'Living Legend',
        desc: 'Answer 1000 questions correctly.',
        icon: '🌟',
        category: 'scholarship',
        rewardDesc: '+300 of each monarch point, +2000 Ducats',
        req:    ({ g }) => g.stats.totalCorrect >= 1000,
        reward: ({ g }) => {
            g.resources.adm += 300; g.resources.dip += 300;
            g.resources.mil += 300; g.resources.ducats += 2000;
        },
    },
    {
        key: 'words_mastered_10',
        name: 'First Impressions',
        desc: 'Fully master 10 vocabulary words.',
        icon: '🖊️',
        category: 'scholarship',
        rewardDesc: '+50 ADM, +100 Ducats',
        req:    ({ g }) => g.stats.wordsMastered >= 10,
        reward: ({ g }) => { g.resources.adm += 50; g.resources.ducats += 100; },
    },
    {
        key: 'words_mastered_30',
        name: 'Fluent in Battle',
        desc: 'Fully master 30 vocabulary words.',
        icon: '📝',
        category: 'scholarship',
        rewardDesc: '+100 ADM, +100 DIP',
        req:    ({ g }) => g.stats.wordsMastered >= 30,
        reward: ({ g }) => { g.resources.adm += 100; g.resources.dip += 100; },
    },
    {
        key: 'accuracy_master',
        name: 'Precision Strike',
        desc: 'Maintain above 90% accuracy across 100+ answers.',
        icon: '🎯',
        category: 'scholarship',
        rewardDesc: '+80 MIL, +80 DIP',
        req:    ({ g }) => {
            const total = g.stats.totalCorrect + g.stats.totalWrong;
            return total >= 100 && g.stats.totalCorrect / total >= 0.9;
        },
        reward: ({ g }) => { g.resources.mil += 80; g.resources.dip += 80; },
    },
    {
        key: 'flawless_50',
        name: 'Sword Saint',
        desc: 'Reach 90%+ accuracy across 200+ total answers.',
        icon: '⚡',
        category: 'scholarship',
        rewardDesc: '+150 MIL, Stability +1',
        req:    ({ g }) => {
            const total = g.stats.totalCorrect + g.stats.totalWrong;
            return total >= 200 && g.stats.totalCorrect / total >= 0.9;
        },
        reward: ({ g }) => { g.resources.mil += 150; g.stability = Math.min(10, g.stability + 1); },
    },

    // ── Combo Chain ──────────────────────────────────────────────────────────
    {
        key: 'combo_5',
        name: 'Skirmisher',
        desc: 'Achieve a 5-answer combo.',
        icon: '🔥',
        category: 'scholarship',
        rewardDesc: '+15 MIL',
        req:    ({ g }) => g.stats.highestCombo >= 5,
        reward: ({ g }) => { g.resources.mil += 15; },
    },
    {
        key: 'combo_10',
        name: 'Battlefield Awareness',
        desc: 'Achieve a 10-answer combo.',
        icon: '🎯',
        category: 'scholarship',
        rewardDesc: '+30 MIL',
        req:    ({ g }) => g.stats.highestCombo >= 10,
        reward: ({ g }) => { g.resources.mil += 30; },
    },
    {
        key: 'combo_25',
        name: 'Veteran Linguist',
        desc: 'Achieve a 25-answer combo.',
        icon: '⚡',
        category: 'scholarship',
        rewardDesc: '+20 ADM, +20 DIP',
        req:    ({ g }) => g.stats.highestCombo >= 25,
        reward: ({ g }) => { g.resources.adm += 20; g.resources.dip += 20; },
    },
    {
        key: 'golden_age',
        name: 'Linguistic Golden Age',
        desc: 'Achieve a 50-combo. All Unrest & Liberty Desire reset to 0.',
        icon: '🌅',
        category: 'scholarship',
        rewardDesc: 'All Unrest and Liberty Desire → 0',
        req:    ({ g }) => g.stats.highestCombo >= 50,
        reward: ({ g }) => {
            g.provinces.forEach(p => { p.unrest = 0; p.libertyDesire = 0; p.rebelling = false; });
        },
    },
    {
        key: 'grandmaster',
        name: 'Language Grandmaster',
        desc: 'Achieve a 100-combo.',
        icon: '👑',
        category: 'scholarship',
        rewardDesc: 'All SRS cards become immediately due',
        req:    ({ g }) => g.stats.highestCombo >= 100,
        reward: ({ g, toast }) => {
            g.srs.forEach(s => { s.nextReview = Date.now(); });
            toast('👑 All words are immediately due for review!', '#f5c842');
        },
    },

    // ── Ideas & Advisors ─────────────────────────────────────────────────────
    {
        key: 'first_idea',
        name: 'Enlightened Rule',
        desc: 'Unlock your first National Idea.',
        icon: '💡',
        category: 'governance',
        rewardDesc: '+150 Ducats, +30 ADM',
        req:    ({ g }) => Object.values(g.ideas).some(Boolean),
        reward: ({ g }) => { g.resources.ducats += 150; g.resources.adm += 30; },
    },
    {
        key: 'ideas_3',
        name: 'Age of Reason',
        desc: 'Unlock 3 National Ideas.',
        icon: '🔬',
        category: 'governance',
        rewardDesc: '+200 Ducats, +50 ADM, +50 DIP',
        req:    ({ g }) => Object.values(g.ideas).filter(Boolean).length >= 3,
        reward: ({ g }) => { g.resources.ducats += 200; g.resources.adm += 50; g.resources.dip += 50; },
    },
    {
        key: 'all_ideas',
        name: 'Renaissance Man',
        desc: 'Unlock all 9 National Ideas.',
        icon: '🏆',
        category: 'governance',
        rewardDesc: '+500 of each monarch point, +2000 Ducats',
        req:    ({ g }) => Object.values(g.ideas).every(Boolean),
        reward: ({ g }) => {
            g.resources.adm += 500; g.resources.dip += 500;
            g.resources.mil += 500; g.resources.ducats += 2000;
        },
    },
    {
        key: 'first_advisor',
        name: 'Wise Counsel',
        desc: 'Hire your first Advisor.',
        icon: '🧙',
        category: 'governance',
        rewardDesc: '+100 Ducats, +40 ADM',
        req:    ({ g }) => Object.values(g.advisors).some(Boolean),
        reward: ({ g }) => { g.resources.ducats += 100; g.resources.adm += 40; },
    },
    {
        key: 'all_advisors',
        name: 'Council of Elders',
        desc: 'Hire all 3 Advisors simultaneously.',
        icon: '🧓',
        category: 'governance',
        rewardDesc: '+300 ADM, Stability +2',
        req:    ({ g }) => Object.values(g.advisors).every(Boolean),
        reward: ({ g }) => { g.resources.adm += 300; g.stability = Math.min(10, g.stability + 2); },
    },

    // ── Trade Fleets ─────────────────────────────────────────────────────────
    {
        key: 'first_trade',
        name: 'Maritime Venture',
        desc: 'Complete your first Trade Mission.',
        icon: '🚢',
        category: 'economy',
        rewardDesc: '+200 Ducats',
        req:    ({ g }) => (g.stats.tradeMissions || 0) >= 1,
        reward: ({ g }) => { g.resources.ducats += 200; },
    },
    {
        key: 'trade_5',
        name: 'Admiral of the Fleet',
        desc: 'Complete 5 Trade Missions.',
        icon: '⚓',
        category: 'economy',
        rewardDesc: '+600 Ducats, +50 DIP',
        req:    ({ g }) => (g.stats.tradeMissions || 0) >= 5,
        reward: ({ g }) => { g.resources.ducats += 600; g.resources.dip += 50; },
    },

    // ── Monarch Points ───────────────────────────────────────────────────────
    {
        key: 'adm_300',
        name: 'Bureaucratic Mastery',
        desc: 'Accumulate 300 ADM points.',
        icon: '📜',
        category: 'governance',
        rewardDesc: '+150 DIP, +150 MIL',
        req:    ({ g }) => g.resources.adm >= 300,
        reward: ({ g }) => { g.resources.dip += 150; g.resources.mil += 150; },
    },
    {
        key: 'all_points_200',
        name: 'Philosopher King',
        desc: 'Have 200+ in all three monarch point types simultaneously.',
        icon: '🌺',
        category: 'governance',
        rewardDesc: '+500 Ducats, Stability +1',
        req:    ({ g }) => g.resources.adm >= 200 && g.resources.dip >= 200 && g.resources.mil >= 200,
        reward: ({ g }) => { g.resources.ducats += 500; g.stability = Math.min(10, g.stability + 1); },
    },
];


// ─── Mission Category Metadata ────────────────────────────────────────────────
// Defines display order, labels, and icons for the mission tab view.

export const MISSION_CATEGORIES = [
    { key: 'conquest',    label: 'Conquest',    icon: '⚔️'  },
    { key: 'economy',     label: 'Economy',     icon: '💰'  },
    { key: 'diplomacy',   label: 'Diplomacy',   icon: '🕊️'  },
    { key: 'governance',  label: 'Governance',  icon: '📜'  },
    { key: 'scholarship', label: 'Scholarship', icon: '📚'  },
];

// ─── Historical Event Templates ───────────────────────────────────────────────
// prompt / options / onCorrect / onWrong receive { word, g, MONARCH_POINT_CAP }
// and return a string message for the toast on correct/wrong.

export const EVENT_TEMPLATES = [
    {
        id: 'diplomatic_incident',
        title: '📜 Event: Diplomatic Incident',
        flavor: 'A foreign dignitary speaks. Translate their words to avoid a scandal!',
        borderColor: '#7a3a9a',
        bgColor: '#fdf5e6',
        glowColor: 'rgba(122,58,154,0.35)',
        prompt:  ({ word })       => `"${word.eng}"`,
        options: ({ word, pool }) => pool.map(o => ({ id: o.id, label: o.kanji })).concat([{ id: word.id, label: word.kanji }]),
        onCorrect: ({ g, CAP }) => {
            g.resources.dip = Math.min(CAP, g.resources.dip + 20);
            g.resources.ducats += 50;
            return 'Diplomatic Success! +20 🕊️ DIP, +50 💰';
        },
        onWrong: ({ g }) => {
            g.stability = Math.max(0, g.stability - 1);
            const pp = g.provinces.filter(p => p.owner === 'player');
            if (pp.length) pp[Math.floor(Math.random() * pp.length)].unrest = Math.min(100, pp[0].unrest + 20);
            return 'Misunderstanding! −1 Stability, +20 Unrest';
        },
    },
    {
        id: 'trade_negotiation',
        title: '💰 Event: Trade Negotiation',
        flavor: 'Merchants present a contract. Read the Kanji to seal the deal!',
        borderColor: '#b07010',
        bgColor: '#fef9e7',
        glowColor: 'rgba(176,112,16,0.35)',
        prompt:  ({ word })       => word.kanji,
        options: ({ word, pool }) => pool.map(o => ({ id: o.id, label: o.eng })).concat([{ id: word.id, label: word.eng }]),
        onCorrect: ({ g, CAP }) => {
            g.resources.ducats += 100;
            g.resources.adm = Math.min(CAP, g.resources.adm + 10);
            return 'Deal Struck! +100 💰, +10 📜 ADM';
        },
        onWrong: ({ g }) => {
            g.resources.ducats = Math.max(0, g.resources.ducats - 50);
            return 'Negotiations failed! −50 💰 Ducats';
        },
    },
    {
        id: 'imperial_decree',
        title: '👑 Event: Imperial Decree',
        flavor: 'The Emperor issues a proclamation. Match the reading to show your loyalty!',
        borderColor: '#7a3b1e',
        bgColor: '#fdf0ef',
        glowColor: 'rgba(122,59,30,0.35)',
        prompt:  ({ word })       => `Meaning: "${word.eng}"`,
        options: ({ word, pool }) => pool.map(o => ({ id: o.id, label: o.kana })).concat([{ id: word.id, label: word.kana }]),
        onCorrect: ({ g, CAP }) => {
            g.resources.mil = Math.min(CAP, g.resources.mil + 20);
            g.resources.manpower += 100;
            return 'Loyal Service! +20 🗡️ MIL, +100 ⚔️ Manpower';
        },
        onWrong: ({ g }) => {
            g.stability = Math.max(0, g.stability - 1);
            g.ae += 10;
            return 'Defiance noted! −1 Stability, +10 🔥 AE';
        },
    },
    {
        id: 'cultural_exchange',
        title: '🎎 Event: Cultural Exchange',
        flavor: 'A visiting scholar tests your knowledge. Read the kana aloud!',
        borderColor: '#2e6e40',
        bgColor: '#f0fdf4',
        glowColor: 'rgba(46,110,64,0.35)',
        prompt:  ({ word })       => word.kana,
        options: ({ word, pool }) => pool.map(o => ({ id: o.id, label: o.eng })).concat([{ id: word.id, label: word.eng }]),
        onCorrect: ({ g, CAP }) => {
            g.resources.adm = Math.min(CAP, g.resources.adm + 15);
            g.resources.dip = Math.min(CAP, g.resources.dip + 15);
            return 'Scholarly acclaim! +15 📜 ADM, +15 🕊️ DIP';
        },
        onWrong: ({ g }) => {
            g.resources.ducats = Math.max(0, g.resources.ducats - 30);
            return 'An embarrassing silence… −30 💰 Ducats';
        },
    },
];