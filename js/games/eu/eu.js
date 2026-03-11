// js/games/eu/eu.js — "Vocab Universalis" Grand Strategy SRS
// export { init, launch }

import { mountVocabSelector } from '../../vocab_selector.js';

let _screens = null;
let _onExit  = null;
let _selector = null;
let _vocabQueue =[]; 

const SAVE_KEY = 'eu_vocab_save';
const BANNED_KEY = 'eu_banned_words';

const PROVINCE_NAMES =[
    "Musashi", "Yamashiro", "Owari", "Mikawa", "Suruga", "Sagami", "Echigo", "Kai", "Shinano", "Hida", 
    "Etchu", "Kaga", "Echizen", "Mino", "Omi", "Iga", "Ise", "Shima", "Kii", "Yamato", "Kawachi", 
    "Izumi", "Settsu", "Harima", "Tajima", "Inaba", "Hoki", "Izumo", "Iwami", "Oki", "Bizen", 
    "Bitchu", "Bingo", "Aki", "Suo", "Nagato", "Awa", "Sanuki", "Iyo", "Tosa", "Chikuzen", 
    "Chikugo", "Buzen", "Bungo", "Hizen", "Higo", "Hyuga", "Osumi", "Satsuma", "Mutsu", "Dewa", 
    "Hitachi", "Shimotsuke", "Kozuke", "Ezo", "Ryukyu", "Tsushima", "Iki", "Awaji", "Sado"
];

// ─── Game State ───────────────────────────────────────────────────────────────

let _g = null;
let _pendingReviews =[];
let _isProcessingAnswer = false;
let _rafId = null;
let _saveInterval = null;
let _selectedProvinceId = null;
let _vocabIdSet = null;   // cached Set of vocab IDs — rebuilt on game start
let _lastUiRender = 0;    // timestamp throttle for _updateUI

const CORE_INTERVAL_THRESHOLD = 3600; 
const WORDS_PER_PROVINCE = 4;
const CORE_ADM_COST = 10;             
const MONARCH_POINT_CAP = 999;        
const REBEL_TAKEBACK_TIME = 90;       
const STABILITY_MAX = 10;
const DIPLO_ANNEX_DIP_COST_PER_WORD = 5; 

const IDEAS = {
    taxation:  { name: 'National Tax Register',   desc: '+50% Base Ducats/s',                              cost: 50,  type: 'adm', effect: 1.5  },
    humanist:  { name: 'Humanist Tolerance',       desc: 'Unrest grows 50% slower; rebels need 120s to retake', cost: 100, type: 'adm', effect: 0.5  },
    bureauc:   { name: 'Bureaucracy',              desc: `Province Coring costs only ${CORE_ADM_COST/2} ADM`,   cost: 150, type: 'adm', effect: 0.5  },
    trade:     { name: 'Trade Networks',           desc: 'Markets give +3 Ducats/s instead of +1',             cost: 100, type: 'dip', effect: 3.0  },
    diplo:     { name: 'Diplomatic Corps',         desc: 'Overextension penalties halved',                      cost: 150, type: 'dip', effect: 0.5  },
    espionage: { name: 'Espionage Network',        desc: 'Wrong answers only +15 unrest (not +30)',             cost: 200, type: 'dip', effect: 15   },
    conscript: { name: 'Mass Conscription',        desc: '+50% Base Manpower/s',                                cost: 50,  type: 'mil', effect: 1.5  },
    quality:   { name: 'Quality Troops',           desc: 'Correct reviews give +4 MIL; war quiz +2 rounds',    cost: 100, type: 'mil', effect: 4    },
    drill:     { name: 'Professional Army',        desc: 'War cost reduced by 30%; war quiz needs 1 less win',  cost: 150, type: 'mil', effect: 0.7  },
};

const MISSIONS = {
    first_blood:  { name: "First Conquest",        desc: "Win your first war.",                           icon: "⚔️",  req: () => _g.stats.warsWon >= 1,             rewardDesc: "+200 Manpower",                       reward: () => { _g.resources.manpower += 200; } },
    musashi:      { name: "The Expansionist",       desc: "Conquer & Core 3 provinces.",                  icon: "🗺️",  req: () => _getEmpireStats().coredProvCount >= 3, rewardDesc: "+500 Manpower, +50 ADM",              reward: () => { _g.resources.manpower += 500; _g.resources.adm += 50; } },
    trade_empire: { name: "Trade Empire",           desc: "Build 3 Marketplaces.",                        icon: "💰",  req: () => _g.provinces.filter(p => p.buildings?.market).length >= 3, rewardDesc: "+1000 Ducats", reward: () => { _g.resources.ducats += 1000; } },
    crusher:      { name: "Rebellion Crusher",      desc: "Crush 5 rebellions.",                          icon: "🛡️",  req: () => _g.stats.rebellionsCrushed >= 5,    rewardDesc: "+30 MIL, +100 Manpower",              reward: () => { _g.resources.mil += 30; _g.resources.manpower += 100; } },
    // ── Combo Milestones ─────────────────────────────────────────────────────
    combo_10:     { name: "Battlefield Awareness",  desc: "Achieve a 10-answer combo in the Dojo.",       icon: "🎯",  req: () => _g.stats.highestCombo >= 10,        rewardDesc: "+30 MIL",                             reward: () => { _g.resources.mil += 30; } },
    combo_25:     { name: "Veteran Linguist",       desc: "Achieve a 25-answer combo in the Dojo.",       icon: "⚡",  req: () => _g.stats.highestCombo >= 25,        rewardDesc: "+20 ADM, +20 DIP",                    reward: () => { _g.resources.adm += 20; _g.resources.dip += 20; } },
    // ── Stretch Goals ────────────────────────────────────────────────────────
    golden_age:   { name: "Linguistic Golden Age",  desc: "Achieve a 50-combo. All Unrest & Liberty Desire reset to 0.", icon: "🔥", req: () => _g.stats.highestCombo >= 50, rewardDesc: "All Unrest and Liberty Desire → 0",  reward: () => { _g.provinces.forEach(p => { p.unrest = 0; if(p.libertyDesire) p.libertyDesire = 0; p.rebelling = false; }); } },
    grandmaster:  { name: "Language Grandmaster",   desc: "Achieve a 100-combo. The Empire trembles at your mastery.", icon: "👑", req: () => _g.stats.highestCombo >= 100, rewardDesc: "All SRS cards made immediately due",  reward: () => { _g.srs.forEach(s => { s.nextReview = Date.now(); }); _toast("👑 All words are immediately due for review!", '#f1c40f'); } },
    polyglot:     { name: "The Polyglot Emperor",   desc: "Answer 500 questions correctly.",              icon: "📚",  req: () => _g.stats.totalCorrect >= 500,       rewardDesc: "+100 ADM, +100 DIP, +100 MIL",        reward: () => { _g.resources.adm += 100; _g.resources.dip += 100; _g.resources.mil += 100; } },
};

const ADVISORS = {
    mint: { name: 'Master of the Mint', icon: '💰', desc: 'Eliminates one wrong answer in the Dojo for each card.', cost: 50, upkeep: 1.5, type: 'adm' },
    captain: { name: 'Grand Captain', icon: '⚔️', desc: 'During wars, 1 wrong answer is ignored.', cost: 50, upkeep: 1.5, type: 'mil' },
    inquisitor: { name: 'Inquisitor', icon: '📜', desc: 'Wrong answers generate only +10 Unrest.', cost: 50, upkeep: 1.5, type: 'adm' }
};

function _freshGame() {
    return {
        resources: { ducats: 50, manpower: 100, adm: 0, dip: 0, mil: 0 },
        stats: {
            rebellionsCrushed: 0, wordsMastered: 0, warsWon: 0,
            totalCorrect: 0, totalWrong: 0, highestCombo: 0, provincesLost: 0,
        },
        provinces: [],
        srs:[],
        ideas: {},
        missionsCompleted: {},
        advisors: {},
        ae: 0,                      // Aggressive Expansion
        nextEventTimer: 0,          // Timer for Historical Events
        coalitionTimer: 10,         // Ticks down when AE > 50
        lastTick: Date.now(),
        combo: 0,
        stability: STABILITY_MAX,
        nationalFocus: 'adm',
        victoryAchieved: false,
    };
}

// ─── Screen Management ────────────────────────────────────────────────────────

export function init(screens, onExit) {
    _screens = screens;
    _onExit  = onExit;
}

export function launch() {
    _show('setup');
    _renderSetup();
}

function _show(name) {
    Object.entries(_screens).forEach(([k, el]) => {
        if (!el) return;
        if (k === name) {
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
            el.style.padding = '0';
            // Setup screen must scroll so the vocab selector is fully accessible
            el.style.overflowY  = (name === 'setup') ? 'auto'   : 'hidden';
            el.style.overflowX  = 'hidden';
            el.style.height     = '100%';
            el.style.background = 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100\' height=\'100\' fill=\'%23f4ecd8\'/%3E%3Crect width=\'100\' height=\'100\' filter=\'url(%23noise)\' opacity=\'0.4\'/%3E%3C/svg%3E")';
        } else {
            el.style.display = 'none';
        }
    });
    const hdr = document.getElementById('games-header-title');
    if (hdr) hdr.textContent = name === 'setup' ? 'Vocab Universalis — Setup' : '🌍 Vocab Universalis';
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function _renderSetup() {
    const el = _screens.setup;
    if (!el) return;

    _selector = mountVocabSelector(el, {
        bannedKey:    BANNED_KEY,
        defaultCount: 40,
        title:        'Vocab Universalis — Assemble your Empire',
    });

    const actions = _selector.getActionsEl();

    const startBtn = document.createElement('button');
    startBtn.className   = 'eu-primary-btn eu-action-btn';
    startBtn.style.background = '#27ae60';
    startBtn.style.color = 'white';
    startBtn.innerHTML = '⚔️ Found Empire';
    startBtn.addEventListener('click', _startGame);

    const backBtn = document.createElement('button');
    backBtn.className   = 'eu-back-btn eu-action-btn';
    backBtn.innerHTML = '← Flee to Menu';
    backBtn.addEventListener('click', _onExit);

    actions.append(startBtn, backBtn);
}

async function _startGame() {
    const queue = await _selector.getQueue();
    if (!queue.length) return;

    _vocabQueue = queue.map((w) => ({
        id:    w.word,
        kanji: w.word,
        kana:  w.furi  || w.word,
        eng:   w.trans || '—',
    }));
    _vocabIdSet = new Set(_vocabQueue.map(v => v.id)); // cache once

    _show('game');
    _loadGame();

    if (_g.provinces.length === 0) {
        _generateMap();
        _g.nextEventTimer = _gameNow() + 60000; 
    }

    _initGameDOM();
    _updateSRSQueue();
    _updateUI();
    _startGameLoop();
    _switchTab('map');
}

// ─── Core Logic & Math ────────────────────────────────────────────────────────

function _generateMap() {
    const totalProv = Math.ceil(_vocabQueue.length / WORDS_PER_PROVINCE);
    const cols = Math.ceil(Math.sqrt(totalProv));
    const rows = Math.ceil(totalProv / cols);

    let vocabIndex = 0;
    let names = [...PROVINCE_NAMES].sort(() => 0.5 - Math.random());

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (vocabIndex >= _vocabQueue.length) break;

            const provWords =[];
            for (let i = 0; i < WORDS_PER_PROVINCE && vocabIndex < _vocabQueue.length; i++) {
                provWords.push(_vocabQueue[vocabIndex].id);
                vocabIndex++;
            }

            const isCapital = (x === Math.floor(cols/2) && y === Math.floor(rows/2));
            const pId = `prov_${x}_${y}`;
            
            const tier = 1 + Math.floor(Math.random() * 3); 
            _g.provinces.push({
                id: pId,
                name: names.pop() || `Region ${x}-${y}`,
                x, y,
                owner: isCapital ? 'player' : 'neutral',
                words: provWords,
                unrest: 0,
                libertyDesire: 0,
                rebelling: false,
                rebelTimer: 0,      
                hasTradeFleet: false,
                cored: false,
                tier,               
                buildings: { market: false, barracks: false, fort: false }
            });

            if (isCapital) {
                provWords.forEach(wid => {
                    _g.srs.push({ id: wid, nextReview: Date.now(), interval: 8, ease: 1.5, provinceId: pId });
                });
            }
        }
    }
}

function _isAdjacentToOwned(prov) {
    return _g.provinces.some(p => (p.owner === 'player' || p.owner === 'vassal') && (Math.abs(p.x - prov.x) + Math.abs(p.y - prov.y) === 1));
}

function _provinceCanBeCored(prov) {
    if (prov.cored || prov.owner === 'vassal') return false;
    return prov.words.every(wid => {
        const s = _g.srs.find(x => x.id === wid);
        return s && s.interval >= CORE_INTERVAL_THRESHOLD;
    });
}

function _coreProvince(provId) {
    const prov = _g.provinces.find(p => p.id === provId);
    if (!prov || !_provinceCanBeCored(prov)) return;
    const admCost = _g.ideas.bureauc ? Math.round(CORE_ADM_COST * IDEAS.bureauc.effect) : CORE_ADM_COST;
    if (_g.resources.adm < admCost) {
        _toast(`Need ${admCost} 📜 ADM to core ${prov.name}`, '#e74c3c');
        return;
    }
    _g.resources.adm -= admCost;
    prov.cored = true;
    prov.unrest = 0;
    prov.rebelling = false;
    _g.stats.wordsMastered += prov.words.length;
    _toast(`✅ ${prov.name} is now a Core Province!`, '#f1c40f');
    _renderMap();
    _renderProvincePanel(prov);
    _updateUI();
}

function _diplomaticAnnex(provId) {
    const prov = _g.provinces.find(p => p.id === provId);
    if (!prov || prov.owner !== 'neutral') return;

    const cost = prov.words.length * DIPLO_ANNEX_DIP_COST_PER_WORD * (prov.tier || 1);
    if (_g.resources.dip < cost) {
        _toast(`Need ${cost} 🕊️ DIP to subjugate ${prov.name}`, '#e74c3c');
        return;
    }

    _g.resources.dip -= cost;
    prov.owner = 'vassal';
    prov.cored = false;
    prov.unrest = 0; 
    prov.libertyDesire = 50; 
    prov.rebelTimer = 0;

    prov.words.forEach(wid => {
        if (!_g.srs.find(s => s.id === wid)) {
            _g.srs.push({ id: wid, nextReview: Date.now() + 15000, interval: 15, ease: 1.5, provinceId: provId });
        }
    });

    _toast(`🕊️ Subjugated ${prov.name} as a Vassal! Manage their Liberty Desire to integrate.`, '#3498db');
    _selectedProvinceId = provId;
    _renderMap();
    _updateSRSQueue();
    _updateUI();
}

function _getEmpireStats() {
    const owned = _g.provinces.filter(p => p.owner === 'player');
    const vassals = _g.provinces.filter(p => p.owner === 'vassal');
    const stabilityMod = 0.7 + ((_g.stability ?? STABILITY_MAX) / STABILITY_MAX) * 0.3;

    let baseDucats   = (_g.ideas.taxation  ? 1 * IDEAS.taxation.effect  : 1) * stabilityMod;
    let baseManpower = (_g.ideas.conscript ? 1 * IDEAS.conscript.effect : 1) * stabilityMod;
    let marketVal    = _g.ideas.trade ? IDEAS.trade.effect : 1;
    let rebellingCount = 0;

    owned.forEach(p => {
        const tierBonus = (p.tier || 1) * 0.3;
        if (p.rebelling) {
            rebellingCount++;
        } else {
            baseDucats   += tierBonus * stabilityMod;
            baseManpower += (p.tier || 1) * 0.1 * stabilityMod;
            if (p.buildings.market)   baseDucats   += marketVal * stabilityMod;
            if (p.buildings.barracks) baseManpower += stabilityMod;
        }
    });

    vassals.forEach(p => {
        baseDucats += (p.tier || 1) * 0.1; // Small tribute
    });

    // Deduct Advisor Upkeep
    let advisorUpkeep = 0;
    Object.keys(_g.advisors || {}).forEach(k => {
        if (_g.advisors[k]) advisorUpkeep += ADVISORS[k].upkeep;
    });
    baseDucats -= advisorUpkeep;

    const uncored    = owned.filter(p => !p.cored).length;
    const totalOwned = owned.length || 1;
    let oeRaw = uncored / totalOwned;
    if (_g.ideas.diplo) oeRaw *= IDEAS.diplo.effect;
    const oePenalty = Math.min(0.8, oeRaw);

    if (baseDucats > 0) baseDucats *= (1 - oePenalty);
    baseManpower *= (1 - oePenalty);

    const focus      = _g.nationalFocus || 'adm';
    const focusBonus = 0.5 * stabilityMod;
    const admGen = focus === 'adm' ? focusBonus : 0;
    const dipGen = focus === 'dip' ? focusBonus : 0;
    const milGen = focus === 'mil' ? focusBonus : 0;

    const idSet      = _vocabIdSet ?? new Set(_vocabQueue.map(v => v.id));
    const allSrs     = _g.srs.filter(s => idSet.has(s.id));
    const coredWords = allSrs.filter(s => { const p = _g.provinces.find(x => x.id === s.provinceId); return p && p.cored; });

    return {
        ducatsPerSec:   baseDucats,
        manpowerPerSec: baseManpower,
        admGen, dipGen, milGen,
        overextension:  oeRaw * 100,
        ownedCount:     owned.length,
        vassalCount:    vassals.length,
        rebellingCount,
        activeSrsCount: allSrs.length,
        coredWordCount: coredWords.length,
        coredProvCount: owned.filter(p => p.cored).length,
        stability:      _g.stability ?? STABILITY_MAX,
        advisorUpkeep
    };
}

function _gameNow() { return Date.now(); }

// ─── Game Loop ────────────────────────────────────────────────────────────────

function _startGameLoop() {
    if (_rafId) cancelAnimationFrame(_rafId);
    if (_saveInterval) clearInterval(_saveInterval);

    _saveInterval = setInterval(() => _saveGame(), 10000);

    function loop() {
        if (!_screens.game || _screens.game.style.display === 'none') {
            _rafId = requestAnimationFrame(loop);
            return;
        }
        
        // Pause loop if a major modal is open (Event, Trade, Coalition)
        const modalOpen = document.querySelector('.eu-active-overlay');
        if (modalOpen) {
            _g.lastTick = Date.now();
            _rafId = requestAnimationFrame(loop);
            return;
        }

        const now = Date.now();
        const delta = (now - _g.lastTick) / 1000;
        _g.lastTick = now;

        const stats = _getEmpireStats();

        _g.resources.ducats   = Math.max(0, _g.resources.ducats + stats.ducatsPerSec * delta);
        if (_g.resources.ducats === 0 && stats.advisorUpkeep > 0) {
            _g.advisors = {}; 
            _toast("Bankrupt! All Advisors fired.", "#c0392b");
            _renderCourt();
        }

        _g.resources.manpower += stats.manpowerPerSec * delta;
        _g.resources.adm = Math.min(MONARCH_POINT_CAP, _g.resources.adm + stats.admGen * delta);
        _g.resources.dip = Math.min(MONARCH_POINT_CAP, _g.resources.dip + stats.dipGen * delta);
        _g.resources.mil = Math.min(MONARCH_POINT_CAP, _g.resources.mil + stats.milGen * delta);

        // AE Decay
        if (_g.ae > 0) _g.ae = Math.max(0, _g.ae - 0.2 * delta);

        // Coalition Check
        if (_g.ae > 50) {
            _g.coalitionTimer -= delta;
            if (_g.coalitionTimer <= 0) {
                _triggerCoalitionWar();
                _g.coalitionTimer = 20; 
            }
        }

        // Random Historical Events
        if (now > _g.nextEventTimer) {
            if (Math.random() < 0.4) _triggerHistoricalEvent();
            _g.nextEventTimer = now + 90000 + Math.random() * 60000;
        }

        // Unrest & Spillover
        const unrestGrowthMod = _g.ideas.humanist ? IDEAS.humanist.effect : 1;
        const rebellingProvs = _g.provinces.filter(p => p.rebelling);

        _g.provinces.forEach(p => {
            if (p.owner === 'vassal') {
                // Vassal Liberty Desire passively grows unless checked by tasks
                p.libertyDesire += 0.5 * delta;
                if (p.libertyDesire >= 100) {
                    _toast(`💥 ${p.name} has declared independence!`, '#c0392b');
                    p.owner = 'neutral';
                    p.libertyDesire = 0;
                    _g.srs = _g.srs.filter(s => s.provinceId !== p.id);
                    _renderMap();
                }
            }
            else if (p.owner === 'player' && !p.cored) {
                let spillover = 0;
                if (!p.buildings.fort) {
                    const adjRebels = rebellingProvs.filter(r => Math.abs(r.x - p.x) + Math.abs(r.y - p.y) === 1).length;
                    spillover = adjRebels * 2 * delta; // +2 unrest/sec per adjacent rebel
                }

                const dueWords = _g.srs.filter(s => s.provinceId === p.id && s.nextReview <= now);
                if (dueWords.length > 0 || spillover > 0) {
                    p.unrest += (dueWords.length * 0.5 * unrestGrowthMod * delta) + spillover;
                    if (p.unrest >= 100) {
                        p.unrest = 100;
                        if (!p.rebelling) {
                            p.rebelling = true;
                            _renderMap();
                        }
                        const fortMod = p.buildings.fort ? 2 : 1;
                        p.rebelTimer = (p.rebelTimer || 0) + delta;
                        if (p.rebelTimer >= REBEL_TAKEBACK_TIME * fortMod) {
                            _loseProvince(p.id);
                        }
                    }
                } else {
                    p.unrest = Math.max(0, p.unrest - (2 * delta));
                    p.rebelTimer = Math.max(0, (p.rebelTimer || 0) - (delta * 2));
                    if (p.unrest === 0 && p.rebelling) { p.rebelling = false; _renderMap(); }
                }
            }
            else if (p.cored) {
                // Trade Fleets
                if (!p.hasTradeFleet && Math.random() < 0.005 * delta) {
                    p.hasTradeFleet = true;
                    _renderMap();
                }
            }
        });

        const rebelCount = rebellingProvs.length;
        if (rebelCount > 0) {
            _g.stability = Math.max(0, (_g.stability ?? STABILITY_MAX) - rebelCount * 0.02 * delta);
        } else {
            _g.stability = Math.min(STABILITY_MAX, (_g.stability ?? STABILITY_MAX) + 0.01 * delta);
        }

        if (Math.floor(now / 1000) % 2 === 0) {
            _checkMissions();
            _checkVictory();
            _updateSRSQueue();
        }

        _updateUI();
        _rafId = requestAnimationFrame(loop);
    }
    _rafId = requestAnimationFrame(loop);
}

// ─── Events & Modals ──────────────────────────────────────────────────────────

let _eventState = null;
let _tradeState = null;
let _warState = null; 

// ─── Historical Event Templates ───────────────────────────────────────────────

const EVENT_TEMPLATES = [
    {
        id: 'diplomatic_incident',
        title: '📜 Event: Diplomatic Incident',
        flavor: 'A foreign dignitary speaks. Translate their words to avoid a scandal!',
        borderColor: '#8e44ad',
        bgColor: '#fdf5e6',
        glowColor: 'rgba(142,68,173,0.4)',
        // shows: English → pick Kanji
        prompt: w => `"${w.eng}"`,
        options: (w, pool) => pool.map(o => ({ id: o.id, label: o.kanji })).concat([{ id: w.id, label: w.kanji }]),
        onCorrect: () => { _g.resources.dip = Math.min(MONARCH_POINT_CAP, _g.resources.dip + 20); _g.resources.ducats += 50; return "Diplomatic Success! +20 🕊️ DIP, +50 💰"; },
        onWrong:  () => { _g.stability = Math.max(0, _g.stability - 1); const pp = _g.provinces.filter(p => p.owner==='player'); if(pp.length) pp[Math.floor(Math.random()*pp.length)].unrest = Math.min(100, pp[Math.floor(Math.random()*pp.length)].unrest+20); return "Misunderstanding! −1 Stability, +20 Unrest"; },
    },
    {
        id: 'trade_negotiation',
        title: '💰 Event: Trade Negotiation',
        flavor: 'Merchants present a contract. Read the Kanji to seal the deal!',
        borderColor: '#f39c12',
        bgColor: '#fef9e7',
        glowColor: 'rgba(243,156,18,0.4)',
        // shows: Kanji → pick English
        prompt: w => w.kanji,
        options: (w, pool) => pool.map(o => ({ id: o.id, label: o.eng })).concat([{ id: w.id, label: w.eng }]),
        onCorrect: () => { _g.resources.ducats += 100; _g.resources.adm = Math.min(MONARCH_POINT_CAP, _g.resources.adm + 10); return "Deal Struck! +100 💰, +10 📜 ADM"; },
        onWrong:  () => { _g.resources.ducats = Math.max(0, _g.resources.ducats - 50); return "Negotiations failed! −50 💰 Ducats"; },
    },
    {
        id: 'imperial_decree',
        title: '👑 Event: Imperial Decree',
        flavor: 'The Emperor issues a proclamation. Match the reading to show your loyalty!',
        borderColor: '#c0392b',
        bgColor: '#fdf0ef',
        glowColor: 'rgba(192,57,43,0.4)',
        // shows: English → pick Kana reading
        prompt: w => `Meaning: "${w.eng}"`,
        options: (w, pool) => pool.map(o => ({ id: o.id, label: o.kana })).concat([{ id: w.id, label: w.kana }]),
        onCorrect: () => { _g.resources.mil = Math.min(MONARCH_POINT_CAP, _g.resources.mil + 20); _g.resources.manpower += 100; return "Loyal Service! +20 🗡️ MIL, +100 ⚔️ Manpower"; },
        onWrong:  () => { _g.stability = Math.max(0, _g.stability - 1); _g.ae += 10; return "Defiance noted! −1 Stability, +10 🔥 AE"; },
    },
    {
        id: 'cultural_exchange',
        title: '🎎 Event: Cultural Exchange',
        flavor: 'A visiting scholar tests your knowledge. Read the kana aloud!',
        borderColor: '#27ae60',
        bgColor: '#f0fdf4',
        glowColor: 'rgba(39,174,96,0.4)',
        // shows: Kana → pick English
        prompt: w => w.kana,
        options: (w, pool) => pool.map(o => ({ id: o.id, label: o.eng })).concat([{ id: w.id, label: w.eng }]),
        onCorrect: () => { _g.resources.adm = Math.min(MONARCH_POINT_CAP, _g.resources.adm + 15); _g.resources.dip = Math.min(MONARCH_POINT_CAP, _g.resources.dip + 15); return "Scholarly acclaim! +15 📜 ADM, +15 🕊️ DIP"; },
        onWrong:  () => { _g.resources.ducats = Math.max(0, _g.resources.ducats - 30); return "An embarrassing silence… −30 💰 Ducats"; },
    },
];

function _triggerHistoricalEvent() {
    const available = _vocabQueue.filter(v => _g.srs.some(s => s.id === v.id));
    if (!available.length) return;
    const word = available[Math.floor(Math.random() * available.length)];
    const distractors = _vocabQueue.filter(v => v.id !== word.id).sort(() => 0.5 - Math.random()).slice(0, 3);
    // Pick a random event template
    const tmpl = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
    const options = tmpl.options(word, distractors).sort(() => 0.5 - Math.random());

    _eventState = { word, options, tmpl, done: false };
    _renderEventModal();
}

function _renderEventModal() {
    let modal = _screens.game.querySelector('#eu-event-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'eu-event-modal';
        modal.className = 'eu-war-modal eu-active-overlay';
        _screens.game.appendChild(modal);
    }

    if (!_eventState || _eventState.done) { modal.style.display = 'none'; modal.classList.remove('eu-active-overlay'); return; }

    const { word, options, tmpl } = _eventState;
    modal.style.display = 'flex';
    modal.classList.add('eu-active-overlay');
    modal.innerHTML = `
        <div class="eu-war-modal-inner" style="border-color:${tmpl.borderColor}; background:${tmpl.bgColor}; box-shadow: 0 0 30px ${tmpl.glowColor};">
            <div class="eu-war-header" style="color:${tmpl.borderColor}; font-size:20px;">${tmpl.title}</div>
            <p style="font-size:14px; margin-bottom:15px; color:#555;">${tmpl.flavor}</p>
            <div class="eu-war-kanji" style="font-size:32px; line-height:1.2;">${tmpl.prompt(word)}</div>
            <div class="eu-war-grid">
                ${options.map(opt => `<button class="eu-war-opt-btn" data-id="${opt.id}">${opt.label}</button>`).join('')}
            </div>
        </div>`;

    modal.querySelectorAll('.eu-war-opt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const isCorrect = btn.dataset.id === word.id;
            btn.style.background = isCorrect ? '#27ae60' : '#c0392b';
            btn.style.color = 'white';
            if (!isCorrect) {
                const correctBtn = modal.querySelector(`[data-id="${word.id}"]`);
                if (correctBtn) { correctBtn.style.background = '#27ae60'; correctBtn.style.color = 'white'; }
            }
            modal.querySelectorAll('.eu-war-opt-btn').forEach(b => b.disabled = true);
            const msg = isCorrect ? tmpl.onCorrect() : tmpl.onWrong();
            _toast(msg, isCorrect ? '#27ae60' : '#c0392b');
            _eventState.done = true;
            setTimeout(_renderEventModal, 1200);
        });
    });
}

function _startTradeMission(provId) {
    const prov = _g.provinces.find(p => p.id === provId);
    if (!prov) return;
    
    const words = prov.words.map(wid => _vocabQueue.find(v => v.id === wid)).filter(Boolean);
    const cards = words.sort(()=>0.5-Math.random()).slice(0, 5); // up to 5
    
    prov.hasTradeFleet = false;
    _renderMap();

    _tradeState = { provId, rounds: cards.length, currentRound: 0, cards, done: false };
    _renderTradeModal();
}

function _renderTradeModal() {
    let modal = _screens.game.querySelector('#eu-trade-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'eu-trade-modal';
        modal.className = 'eu-war-modal eu-active-overlay';
        _screens.game.appendChild(modal);
    }

    if (!_tradeState || _tradeState.done) { modal.style.display = 'none'; modal.classList.remove('eu-active-overlay'); return; }

    const { rounds, currentRound, cards } = _tradeState;

    if (currentRound >= rounds) {
        _tradeState.done = true;
        const reward = rounds * 20;
        _g.resources.ducats += reward;
        _toast(`🚢 Trade Mission Successful! +${reward} Ducats.`, '#2980b9');
        setTimeout(_renderTradeModal, 100);
        return;
    }

    const card = cards[currentRound];
    const pool = _vocabQueue.filter(v => v.id !== card.id).sort(()=>0.5-Math.random()).slice(0,3);
    const options = [...pool, card].sort(()=>0.5-Math.random());

    modal.style.display = 'flex';
    modal.classList.add('eu-active-overlay');
    modal.innerHTML = `
        <div class="eu-war-modal-inner" style="border-color:#2980b9; background:#e8f4f8; box-shadow: 0 0 30px rgba(41,128,185,0.4);">
            <div class="eu-war-header" style="color:#2980b9;">🚢 Trade Mission — Round ${currentRound + 1}/${rounds}</div>
            <p style="font-size:12px; color:#555;">Review cored words to maintain your monopoly. Any mistake ends the mission!</p>
            <div class="eu-war-kanji">${card.kanji}</div>
            <div class="eu-war-grid">
                ${options.map(opt => `<button class="eu-war-opt-btn" data-id="${opt.id}">${opt.eng}</button>`).join('')}
            </div>
        </div>`;

    modal.querySelectorAll('.eu-war-opt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.id === card.id) {
                btn.style.background = '#27ae60'; btn.style.color = 'white';
                _tradeState.currentRound++;
                setTimeout(_renderTradeModal, 400);
            } else {
                btn.style.background = '#c0392b'; btn.style.color = 'white';
                _toast("🚢 Trade Route lost due to poor communication.", "#e74c3c");
                _tradeState.done = true;
                setTimeout(_renderTradeModal, 800);
            }
        });
    });
}

function _triggerCoalitionWar() {
    const neutralWords = _g.provinces.filter(p=>p.owner==='neutral').flatMap(p=>p.words);
    const activeWords = _g.srs.sort((a,b)=>a.ease - b.ease).slice(0, 5).map(s=>s.id);
    const allIds = [...new Set([...neutralWords, ...activeWords])];
    
    let words = allIds.map(wid => _vocabQueue.find(v => v.id === wid)).filter(Boolean);
    const cards = words.sort(()=>0.5-Math.random()).slice(0, 10);

    _warState = { isCoalition: true, rounds: 10, winsNeeded: 7, wins: 0, currentRound: 0, cards, done: false };
    _renderWarModal();
}

function _declareWar(provId) {
    const prov = _g.provinces.find(p => p.id === provId);
    if (!prov || prov.owner === 'player') return;

    const stats = _getEmpireStats();
    const tierMod = prov.tier || 1;
    const baseCost = (100 + (stats.ownedCount * 50)) * tierMod;
    const fullCost = _g.ideas.drill ? Math.round(baseCost * IDEAS.drill.effect) : baseCost;

    if (_g.resources.manpower < fullCost * 0.3) {
        _toast(`Need at least ${Math.floor(fullCost * 0.3)} ⚔️ Manpower to start a war`, '#e74c3c');
        return;
    }

    const totalRounds = _g.ideas.quality ? 7 : 5;
    const winsNeeded  = _g.ideas.drill   ? totalRounds - 1 : Math.ceil(totalRounds * 0.6);
    const warWords = prov.words.map(wid => _vocabQueue.find(v => v.id === wid)).filter(Boolean);
    const extras   = _vocabQueue.filter(v => !prov.words.includes(v.id)).sort(() => 0.5 - Math.random()).slice(0, Math.max(0, totalRounds - warWords.length));
    const cards    =[...warWords, ...extras].slice(0, totalRounds).sort(() => 0.5 - Math.random());

    _warState = { provId, fullCost, rounds: totalRounds, winsNeeded, wins: 0, currentRound: 0, cards, done: false, ignoresLeft: _g.advisors.captain ? 1 : 0 };
    _renderWarModal();
}

function _renderWarModal() {
    let modal = _screens.game.querySelector('#eu-war-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'eu-war-modal';
        modal.className = 'eu-war-modal eu-active-overlay';
        _screens.game.appendChild(modal);
    }

    if (!_warState || _warState.done) { modal.style.display = 'none'; modal.classList.remove('eu-active-overlay'); return; }

    const { rounds, winsNeeded, wins, currentRound, cards, isCoalition, provId } = _warState;

    if (currentRound >= rounds) {
        _warState.done = true;
        
        if (isCoalition) {
            if (wins >= winsNeeded) {
                _g.resources.manpower += 500;
                _g.resources.dip += 50;
                _g.ae = 0;
                _toast(`🔥 Punitive War Won! Coalition shattered. +500 ⚔️, +50 DIP. AE reset.`, '#27ae60');
            } else {
                _g.ae = Math.max(0, _g.ae - 30);
                const owned = _g.provinces.filter(p=>p.owner==='player');
                if (owned.length > 1) {
                    const lost = owned[Math.floor(Math.random() * owned.length)];
                    _loseProvince(lost.id);
                    _toast(`💀 Coalition crushed you! Lost province: ${lost.name}. AE -30.`, '#c0392b');
                } else {
                    _g.resources.ducats = 0; _g.resources.manpower = 0;
                    _toast(`💀 Coalition forces pillaged your capital! Resources wiped. AE -30.`, '#c0392b');
                }
            }
        } else {
            const prov = _g.provinces.find(p => p.id === provId);
            if (wins >= winsNeeded) {
                const discount = wins / rounds;
                const finalCost = Math.round(_warState.fullCost * (1 - discount * 0.5));
                if (_g.resources.manpower >= finalCost) {
                    _g.resources.manpower -= finalCost;
                    prov.owner = 'player'; prov.cored = false; prov.unrest = 40; prov.rebelTimer = 0;
                    _g.stats.warsWon++;
                    _g.ae += 20 * (prov.tier || 1);
                    prov.words.forEach(wid => {
                        if (!_g.srs.find(s => s.id === wid))
                            _g.srs.push({ id: wid, nextReview: Date.now(), interval: 8, ease: 1.5, provinceId: provId });
                    });
                    _toast(`⚔️ Victory! Conquered ${prov.name} for ${finalCost} ⚔️. AE increased!`, '#27ae60');
                    _selectedProvinceId = provId;
                } else {
                    _toast(`⚠️ Victory, but not enough Manpower (need ${finalCost}).`, '#f39c12');
                }
            } else {
                const lossCost = Math.round(_warState.fullCost * 0.2);
                _g.resources.manpower = Math.max(0, _g.resources.manpower - lossCost);
                _g.stability = Math.max(0, (_g.stability ?? STABILITY_MAX) - 1);
                _toast(`💀 Defeated! ${wins}/${rounds} won. −${lossCost} ⚔️, −1 Stability.`, '#c0392b');
            }
        }
        modal.style.display = 'none';
        modal.classList.remove('eu-active-overlay');
        _renderMap(); _updateSRSQueue(); _updateUI();
        _warState = null;
        return;
    }

    const card = cards[currentRound];
    if (!card) { _warState.currentRound++; _renderWarModal(); return; }

    const pool = _vocabQueue.filter(v => v.id !== card.id).sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [...pool, card].sort(() => 0.5 - Math.random());
    const provName = isCoalition ? "Coalition Forces" : _g.provinces.find(p => p.id === provId)?.name;
    const pips = Array.from({length: rounds}, (_, i) => {
        if (i < wins) return `<span class="eu-war-pip win">✓</span>`;
        if (i < currentRound) return `<span class="eu-war-pip loss">✗</span>`;
        return `<span class="eu-war-pip">·</span>`;
    }).join('');

    const titleColor = isCoalition ? '#c0392b' : '#333';
    const bgStyle = isCoalition ? "border-color:#c0392b; box-shadow: 0 0 40px rgba(192,57,43,0.5);" : "";

    modal.style.display = 'flex';
    modal.classList.add('eu-active-overlay');
    modal.innerHTML = `
        <div class="eu-war-modal-inner" style="${bgStyle}">
            <div class="eu-war-header" style="color:${titleColor}">⚔️ Battle vs ${provName || '?'} — Round ${currentRound + 1}/${rounds}</div>
            <div class="eu-war-progress">${pips} <span style="margin-left:8px;font-size:12px;color:#555">Need ${winsNeeded} wins</span></div>
            ${_warState.ignoresLeft > 0 ? `<div style="font-size:12px;color:#f39c12;margin-bottom:10px;">🛡️ Grand Captain active: 1 mistake forgiven</div>` : ''}
            <div class="eu-war-kanji">${card.kanji}</div>
            <div class="eu-war-grid">
                ${options.map(opt => `<button class="eu-war-opt-btn" data-id="${opt.id}">${opt.eng}</button>`).join('')}
            </div>
        </div>`;

    modal.querySelectorAll('.eu-war-opt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            let isCorrect = btn.dataset.id === card.id;
            
            if (!isCorrect && _warState.ignoresLeft > 0) {
                _warState.ignoresLeft--;
                isCorrect = true; // Forgiven
                btn.style.boxShadow = '0 0 10px #f39c12';
            }

            btn.style.background = isCorrect ? '#27ae60' : '#c0392b';
            btn.style.color = 'white';
            modal.querySelectorAll('.eu-war-opt-btn').forEach(b => b.disabled = true);
            if (!isCorrect) {
                const correctBtn = modal.querySelector(`[data-id="${card.id}"]`);
                if (correctBtn) { correctBtn.style.background = '#27ae60'; correctBtn.style.color = 'white'; }
            }
            if (isCorrect) _warState.wins++;
            _warState.currentRound++;
            setTimeout(_renderWarModal, 600);
        });
    });
}

// ─── SRS / Combat Logic ───────────────────────────────────────────────────────

function _loseProvince(provId) {
    const prov = _g.provinces.find(p => p.id === provId);
    if (!prov || prov.owner !== 'player') return;

    prov.owner   = 'neutral';
    prov.unrest  = 0;
    prov.rebelling = false;
    prov.rebelTimer = 0;
    prov.cored   = false;
    _g.stats.provincesLost++;
    _g.stability = Math.max(0, (_g.stability ?? STABILITY_MAX) - 2);

    _g.srs = _g.srs.filter(s => s.provinceId !== provId);

    _toast(`💀 ${prov.name} has been retaken by rebels! Province lost.`, '#c0392b');
    _renderMap();
    if (_selectedProvinceId === provId) {
        _selectedProvinceId = null;
        const panel = _screens.game?.querySelector('#eu-prov-panel');
        if (panel) panel.style.display = 'none';
    }
}

function _buildBuilding(provId, key, costStr) {
    const prov = _g.provinces.find(p => p.id === provId);
    if (!prov) return;
    
    let costDucats = 0; let costAdm = 0;
    if (key === 'market' || key === 'barracks') costDucats = 50;
    if (key === 'fort') { costDucats = 100; costAdm = 50; }

    if (_g.resources.ducats < costDucats || _g.resources.adm < costAdm) {
        _toast(`Cannot afford ${key}! Need ${costDucats}💰 ${costAdm>0 ? costAdm+'📜' : ''}`, '#e74c3c');
        return;
    }

    _g.resources.ducats -= costDucats;
    _g.resources.adm -= costAdm;
    prov.buildings[key] = true;
    _toast(`✅ Built ${key.toUpperCase()} in ${prov.name}!`, '#27ae60');
    _renderMap();
    _renderProvincePanel(prov);
}

function _formatTime(sec) {
    if (sec <= 0)    return 'Now';
    if (sec < 60)    return Math.floor(sec) + 's';
    if (sec < 3600)  return Math.floor(sec/60) + 'm ' + Math.floor(sec%60) + 's';
    if (sec < 86400) return Math.floor(sec/3600) + 'h ' + Math.floor((sec%3600)/60) + 'm';
    return Math.floor(sec/86400) + 'd';
}

function _updateSRSQueue() {
    const now = _gameNow();
    const activeIds = _vocabIdSet ?? new Set(_vocabQueue.map(v => v.id));
    _pendingReviews = _g.srs.filter(s => activeIds.has(s.id) && s.nextReview <= now);

    const pendingEls = _screens.game?.querySelectorAll('.eu-pending-count');
    pendingEls?.forEach(el => el.textContent = _pendingReviews.length);

    const quizScrn  = _screens.game?.querySelector('#eu-dojo-quiz');
    const sleepScrn = _screens.game?.querySelector('#eu-dojo-sleep');
    const timerEl   = _screens.game?.querySelector('#eu-next-review-timer');

    if (!quizScrn || !sleepScrn) return;

    if (_pendingReviews.length > 0) {
        sleepScrn.style.display = 'none';
        quizScrn.style.display  = 'flex';
        if (!_g.currentCardId) _loadFlashcard();
    } else {
        quizScrn.style.display  = 'none';
        sleepScrn.style.display = 'flex';
        _g.currentCardId = null;

        if (timerEl && _g.srs.length > 0) {
            const next    = Math.min(..._g.srs.map(s => s.nextReview));
            const diffSec = (next - now) / 1000;
            timerEl.textContent = diffSec <= 2
                ? 'Incident imminent...'
                : `Next incident in: ${_formatTime(diffSec)}`;
        } else if (timerEl) {
            timerEl.textContent = _g.srs.length === 0 ? 'Conquer a province to begin!' : '';
        }
    }
}

function _loadFlashcard() {
    if (!_pendingReviews.length) return;
    _isProcessingAnswer = false;

    _pendingReviews.sort((a, b) => {
        const pA = _g.provinces.find(p => p.id === a.provinceId);
        const pB = _g.provinces.find(p => p.id === b.provinceId);
        const aVal = pA ? (pA.owner==='vassal'? pA.libertyDesire : pA.unrest) : 0;
        const bVal = pB ? (pB.owner==='vassal'? pB.libertyDesire : pB.unrest) : 0;
        return bVal - aVal;
    });

    const srsItem = _pendingReviews[0];
    _g.currentCardId = srsItem.id;
    const correct = _vocabQueue.find(v => v.id === srsItem.id);
    if (!correct) return;

    const prov = _g.provinces.find(p => p.id === srsItem.provinceId);
    const isVassal = prov && prov.owner === 'vassal';

    const kanjiEl    = _screens.game?.querySelector('.eu-fc-kanji');
    const provEl     = _screens.game?.querySelector('.eu-fc-prov');
    const gridEl     = _screens.game?.querySelector('.eu-quiz-grid');
    const progressEl = _screens.game?.querySelector('#eu-core-progress-bar');
    const comboEl    = _screens.game?.querySelector('#eu-combo-display');
    if (!kanjiEl || !gridEl) return;

    kanjiEl.textContent = correct.kanji;
    if (provEl) {
        provEl.textContent = isVassal ? `🕊️ Diplomatic Integration Task: ${prov.name}` : `⚔️ Rebellion in ${prov ? prov.name : 'Unknown Province'}`;
        provEl.style.color = isVassal ? '#3498db' : '#c0392b';
    }

    if (progressEl) {
        const pct = Math.min(100, Math.round(
            (Math.log(Math.max(1, srsItem.interval)) / Math.log(CORE_INTERVAL_THRESHOLD)) * 100
        ));
        progressEl.style.width = pct + '%';
        progressEl.style.background = pct >= 100 ? '#27ae60' : pct > 60 ? '#f1c40f' : '#e74c3c';
    }
    if (comboEl) comboEl.textContent = _g.combo > 0 ? `🔥 Combo: ${_g.combo}` : '';

    const numDistractors = isVassal ? 5 : 3; // Vassals get 6 options total
    const pool        = _vocabQueue.filter(v => v.id !== correct.id);
    const distractors = pool.sort(() => 0.5 - Math.random()).slice(0, numDistractors);
    const options     = [...distractors, correct].sort(() => 0.5 - Math.random());

    gridEl.className = `eu-quiz-grid ${isVassal ? 'eu-grid-6' : ''}`;
    gridEl.innerHTML = '';
    
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className   = 'eu-quiz-btn';
        btn.textContent = opt.eng;
        btn.dataset.id  = opt.id;
        btn.addEventListener('click', (e) => _checkAnswer(opt.id, btn, correct.id, e));
        gridEl.appendChild(btn);
    });

    // Master of Mint Advisor — grey out one wrong option
    if (_g.advisors.mint) {
        const wrongBtns = Array.from(gridEl.children).filter(b => b.dataset.id !== correct.id);
        if (wrongBtns.length > 0) {
            const victim = wrongBtns[Math.floor(Math.random() * wrongBtns.length)];
            victim.disabled = true;
            victim.style.opacity = '0.25';
            victim.style.textDecoration = 'line-through';
        }
    }
}

function _checkAnswer(selectedId, btnEl, correctId, event) {
    if (_isProcessingAnswer) return;
    _isProcessingAnswer = true;

    const srsItem = _g.srs.find(s => s.id === _g.currentCardId);
    const prov = _g.provinces.find(p => p.id === srsItem?.provinceId);
    const isVassal = prov && prov.owner === 'vassal';

    const gridEl = _screens.game?.querySelector('.eu-quiz-grid');
    gridEl?.querySelectorAll('.eu-quiz-btn').forEach(b => b.disabled = true);

    if (selectedId === correctId) {
        btnEl.classList.add('eu-quiz-correct');

        let milGain = _g.ideas.quality ? IDEAS.quality.effect : 2;
        _g.resources.mil = Math.min(MONARCH_POINT_CAP, _g.resources.mil + milGain);
        _g.combo++;
        if (_g.combo > _g.stats.highestCombo) _g.stats.highestCombo = _g.combo;
        _g.stats.totalCorrect++;

        if (_g.combo % 5 === 0) {
            _g.resources.dip = Math.min(MONARCH_POINT_CAP, _g.resources.dip + 1);
            _spawnFloatingText(event.clientX, event.clientY - 30, '+1 🕊️', '#3498db');
        }
        if (_g.combo % 10 === 0) {
            _g.resources.adm = Math.min(MONARCH_POINT_CAP, _g.resources.adm + 1);
            _spawnFloatingText(event.clientX, event.clientY - 50, '+1 📜', '#f1c40f');
        }

        srsItem.interval   = Math.round(srsItem.interval * srsItem.ease);
        srsItem.nextReview = _gameNow() + srsItem.interval * 1000;

        if (isVassal) {
            prov.libertyDesire = Math.max(0, prov.libertyDesire - 15);
            _spawnFloatingText(event.clientX, event.clientY + 20, `Liberty Desire -15%`, '#27ae60');
            if (prov.libertyDesire === 0) {
                prov.owner = 'player';
                prov.unrest = 0;
                _toast(`🕊️ ${prov.name} fully integrated into the Empire!`, '#2980b9');
            }
        }
        else if (prov && !prov.cored) {
            const before = prov.unrest;
            prov.unrest = Math.max(0, prov.unrest - 20);
            const delta = Math.round(before - prov.unrest);
            if (delta > 0) _spawnFloatingText(event.clientX, event.clientY + 20, `${prov.name} −${delta}% unrest`, '#27ae60');
            if (prov.unrest === 0 && prov.rebelling) {
                prov.rebelling = false;
                prov.rebelTimer = 0;
                _g.stats.rebellionsCrushed++;
                _toast(`🕊️ Rebellion crushed in ${prov.name}!`, '#27ae60');
            }
        }

        if (prov && !prov.cored && !isVassal && _provinceCanBeCored(prov)) {
            _toast(`📜 ${prov.name} is ready to Core! Spend ${CORE_ADM_COST} ADM on the map.`, '#f1c40f');
        }

        _spawnFloatingText(event.clientX, event.clientY, `+${milGain} 🗡️`, '#c0392b');
        setTimeout(() => { _g.currentCardId = null; _updateSRSQueue(); _updateUI(); }, 500);

    } else {
        btnEl.classList.add('eu-quiz-wrong');
        gridEl?.querySelectorAll('.eu-quiz-btn').forEach(b => {
            const correctWord = _vocabQueue.find(v => v.id === correctId);
            if (correctWord && b.textContent === correctWord.eng) b.classList.add('eu-quiz-correct');
        });

        _g.stats.totalWrong++;
        srsItem.interval   = 30;
        srsItem.ease       = Math.max(1.3, srsItem.ease - 0.15);
        srsItem.nextReview = _gameNow() + 30000;
        _g.combo = 0;

        if (isVassal) {
            prov.libertyDesire += 20;
            _spawnFloatingText(event.clientX, event.clientY + 20, `Liberty Desire +20%`, '#c0392b');
        } else if (prov && !prov.cored) {
            const baseUnrest = _g.ideas.espionage ? IDEAS.espionage.effect : 30;
            const finalUnrest = _g.advisors.inquisitor ? 10 : baseUnrest;
            const before = prov.unrest;
            prov.unrest = Math.min(100, prov.unrest + finalUnrest);
            const delta = Math.round(prov.unrest - before);
            if (delta > 0) _spawnFloatingText(event.clientX, event.clientY + 20, `${prov.name} +${delta}% unrest`, '#c0392b');
            if (prov.unrest >= 100) prov.rebelling = true;
            _spawnFloatingText(event.clientX, event.clientY, `⚠️ Unrest +${finalUnrest}`, '#e74c3c');
        }

        setTimeout(() => { _g.currentCardId = null; _updateSRSQueue(); _updateUI(); }, 700);
    }
}

// ─── Map & DOM Rendering ──────────────────────────────────────────────────────

function _initGameDOM() {
    const el = _screens.game;
    if (!el) return;

    el.innerHTML = `
<div class="eu-root">
    <div class="eu-topbar">
        <div class="eu-res-box" title="Ducats (Gold)">💰 <span id="eu-val-ducats">0</span></div>
        <div class="eu-res-box" title="Manpower">⚔️ <span id="eu-val-manpower">0</span></div>
        <div class="eu-res-box eu-point-adm" title="Administrative Power">📜 <span id="eu-val-adm">0</span></div>
        <div class="eu-res-box eu-point-dip" title="Diplomatic Power">🕊️ <span id="eu-val-dip">0</span></div>
        <div class="eu-res-box eu-point-mil" title="Military Power">🗡️ <span id="eu-val-mil">0</span></div>
        <div class="eu-res-box" title="Stability">⚖️ <span id="eu-val-stability">10</span></div>
        <div class="eu-res-box" id="eu-ae-box" title="Aggressive Expansion — Coalition declared at 50!" style="color:#c0392b">🔥 AE: <span id="eu-val-ae">0</span></div>
    </div>

    <div class="eu-stats-bar">
        <div>OE: <strong id="eu-val-oe" style="color:#c0392b">0%</strong></div>
        <div>Rebels: <strong id="eu-val-rebels">0</strong></div>
        <div>Provinces: <strong id="eu-val-size">1</strong></div>
        <div>Focus: <strong id="eu-val-focus" style="color:#f1c40f">📜 ADM</strong></div>
        <div style="margin-left:auto;">
            <button class="eu-icon-btn" id="eu-save-btn" title="Save Game">💾</button>
            <button class="eu-icon-btn" id="eu-quit-btn" title="Quit">🚪</button>
        </div>
    </div>

    <div class="eu-tabs">
        <button class="eu-tab-btn active" data-target="map">🗺️ World Map</button>
        <button class="eu-tab-btn" data-target="court">👑 Court & Missions</button>
        <button class="eu-tab-btn" data-target="dojo">⚔️ Battlefield <span class="eu-badge eu-pending-count">0</span></button>
    </div>

    <div class="eu-content">
        <!-- MAP TAB -->
        <div class="eu-pane active" id="eu-tab-map">
            <div class="eu-map-container" id="eu-map-grid"></div>
            <div class="eu-prov-panel" id="eu-prov-panel" style="display:none;"></div>
        </div>

        <!-- COURT TAB -->
        <div class="eu-pane" id="eu-tab-court">
            <div class="eu-court-layout">
                <div class="eu-court-left">
                    <h2 class="eu-title">Missions</h2>
                    <div id="eu-missions-list" style="display:flex; flex-direction:column; gap:10px;"></div>

                    <h2 class="eu-title" style="margin-top:20px;">Advisors</h2>
                    <p style="font-size:11px; color:#555;">Hire experts. Deducts from monthly Ducat income.</p>
                    <div id="eu-advisors-list" style="display:flex; flex-direction:column; gap:10px;"></div>
                </div>

                <div class="eu-court-right">
                    <h2 class="eu-title">National Focus</h2>
                    <div class="eu-focus-bar" id="eu-focus-bar">
                        <button class="eu-focus-btn" data-focus="adm">📜 ADM</button>
                        <button class="eu-focus-btn" data-focus="dip">🕊️ DIP</button>
                        <button class="eu-focus-btn" data-focus="mil">🗡️ MIL</button>
                    </div>

                    <h2 class="eu-title" style="margin-top:20px;">National Ideas</h2>
                    <div class="eu-ideas-grid" id="eu-ideas-container"></div>
                </div>
            </div>

            <h2 class="eu-title" style="margin-top:20px;">Empire Statistics</h2>
            <div class="eu-stats-list" id="eu-stats-list"></div>
        </div>

        <!-- BATTLEFIELD TAB -->
        <div class="eu-pane" id="eu-tab-dojo">
            <div class="eu-srs-status">
                <span class="eu-pending-count" style="font-weight:bold;">0</span> active tasks/rebellions!
            </div>

            <div id="eu-dojo-sleep" class="eu-battle-screen">
                <div style="font-size:40px;">🕊️</div>
                <h3>The Empire is at Peace</h3>
                <p style="color:#555; font-size:13px;">No provinces are currently rebelling.</p>
                <div id="eu-next-review-timer" style="margin-top:12px; font-weight:bold; color:#c0392b; font-size:14px;"></div>
            </div>

            <div id="eu-dojo-quiz" class="eu-battle-screen" style="display:none;">
                <div class="eu-fc-prov" style="font-weight:bold; margin-bottom:6px;"></div>
                <div class="eu-fc-kanji">...</div>
                <div id="eu-core-progress-wrap" style="width:100%; max-width:400px; margin:8px 0 14px;">
                    <div style="font-size:11px; color:#888; margin-bottom:3px;">Core Progress</div>
                    <div style="background:#dcdde1; border-radius:4px; height:8px; overflow:hidden;">
                        <div id="eu-core-progress-bar" style="height:100%; background:#f1c40f; width:0%; transition:width 0.3s;"></div>
                    </div>
                </div>
                <div class="eu-quiz-grid"></div>
                <div id="eu-combo-display" style="margin-top:10px; font-size:13px; color:#7f8c8d; font-weight:bold;"></div>
            </div>
        </div>
    </div>
    <div id="eu-toasts"></div>
</div>`;

    el.querySelectorAll('.eu-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => _switchTab(btn.getAttribute('data-target')));
    });

    el.querySelectorAll('.eu-focus-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _g.nationalFocus = btn.dataset.focus;
            _updateFocusButtons();
            _toast(`National Focus: ${btn.textContent}`, '#f1c40f');
        });
    });

    el.querySelector('#eu-save-btn').addEventListener('click', () => { _saveGame(); _toast('Game Saved!', '#27ae60'); });
    el.querySelector('#eu-quit-btn').addEventListener('click', () => {
        if (confirm('Abandon your empire?')) { _saveGame(); _stopGameLoop(); _onExit(); }
    });

    _renderMap();
    _renderCourt();
}

function _updateFocusButtons() {
    const focus = _g.nationalFocus || 'adm';
    const focusIcons = { adm: '📜', dip: '🕊️', mil: '🗡️' };
    _screens.game?.querySelectorAll('.eu-focus-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.focus === focus);
    });
    const focusEl = _screens.game?.querySelector('#eu-val-focus');
    if (focusEl) focusEl.textContent = `${focusIcons[focus]} ${focus.toUpperCase()}`;
}

function _renderMap() {
    const gridEl = _screens.game.querySelector('#eu-map-grid');
    if (!gridEl) return;

    const totalProv = _g.provinces.length;
    const cols = Math.ceil(Math.sqrt(totalProv));
    gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    gridEl.innerHTML = '';
    _g.provinces.forEach(prov => {
        const cell = document.createElement('div');
        cell.className = 'eu-map-cell';
        
        if (prov.owner === 'player') {
            cell.classList.add('owned');
            if (prov.cored)      cell.classList.add('cored');
            if (prov.rebelling)  cell.classList.add('rebelling');
        } else if (prov.owner === 'vassal') {
            cell.classList.add('vassal');
        } else if (_isAdjacentToOwned(prov)) {
            cell.classList.add('adjacent');
        } else {
            cell.classList.add('fog');
        }

        if (prov.id === _selectedProvinceId) cell.classList.add('selected');

        const tierStars = prov.owner !== 'player' && prov.owner !== 'vassal' && !_isAdjacentToOwned(prov) ? '' : '⭐'.repeat(prov.tier || 1);
        const rebelTimerPct = prov.rebelling && prov.rebelTimer > 0
            ? Math.min(100, Math.round((prov.rebelTimer / (prov.buildings.fort ? REBEL_TAKEBACK_TIME*2 : REBEL_TAKEBACK_TIME)) * 100)) : 0;

        let iconStr = '';
        if (prov.cored && prov.hasTradeFleet) iconStr += '🚢';
        if (prov.buildings?.fort) iconStr += '🏰';
        else if (prov.cored) iconStr += '🏛️';
        else if (prov.rebelling) iconStr += '🔥';

        cell.innerHTML = `
            <div class="eu-cell-name">${prov.name}</div>
            ${prov.owner === 'player' && !prov.cored ? `<div class="eu-cell-unrest">${Math.floor(prov.unrest)}%</div>` : ''}
            ${prov.owner === 'vassal' ? `<div class="eu-cell-unrest" style="color:#2980b9;">${Math.floor(prov.libertyDesire)}%</div>` : ''}
            <div class="eu-cell-icons">${iconStr}</div>
            ${tierStars ? `<div class="eu-cell-tier">${tierStars}</div>` : ''}
            ${rebelTimerPct > 0 ? `<div class="eu-rebel-timer-wrap"><div class="eu-rebel-timer-bar" style="width:${rebelTimerPct}%"></div></div>` : ''}
        `;

        cell.addEventListener('click', () => {
            if (prov.cored && prov.hasTradeFleet) {
                _startTradeMission(prov.id);
            } else {
                _selectedProvinceId = prov.id;
                _renderMap(); 
                _renderProvincePanel(prov);
            }
        });

        gridEl.appendChild(cell);
    });

    if (_selectedProvinceId) {
        const p = _g.provinces.find(x => x.id === _selectedProvinceId);
        if (p) _renderProvincePanel(p);
    }
}

function _renderProvincePanel(prov) {
    const panel = _screens.game.querySelector('#eu-prov-panel');
    panel.style.display = 'block';

    const isOwned = prov.owner === 'player';
    const isVassal = prov.owner === 'vassal';
    const isAdj = _isAdjacentToOwned(prov);
    
    let ownershipText = isOwned ? 'Your Core' : (isVassal ? 'Vassal' : 'Independent');
    let ownershipColor = isOwned ? '#27ae60' : (isVassal ? '#2980b9' : '#7f8c8d');

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #bdc3c7; padding-bottom:10px; margin-bottom:10px;">
            <h3 style="margin:0; font-size:20px;">${prov.name}</h3>
            <span style="font-size:12px; font-weight:bold; color:${ownershipColor}; text-transform:uppercase;">${ownershipText}</span>
        </div>
    `;

    if (isOwned || isVassal) {
        const provSrs = _g.srs.filter(s => s.provinceId === prov.id);
        const canCore = _provinceCanBeCored(prov);
        const canAffordCore = _g.resources.adm >= CORE_ADM_COST;

        const wordRows = prov.words.map(wid => {
            const s = _g.srs.find(x => x.id === wid);
            const w = _vocabQueue.find(v => v.id === wid);
            const label = w ? w.kanji : wid;
            if (!s) return `<div style="font-size:12px;color:#aaa;padding:3px 0;">🔒 ${label}</div>`;
            const qualifies = s.interval >= CORE_INTERVAL_THRESHOLD;
            const pct = Math.min(100, Math.round((Math.log(Math.max(1, s.interval)) / Math.log(CORE_INTERVAL_THRESHOLD)) * 100));
            const nextIn = s.nextReview > Date.now() ? ` · in ${_formatTime((s.nextReview - Date.now()) / 1000)}` : ' · due';
            return `
                <div style="font-size:12px;color:#333;padding:3px 0;">
                    ${qualifies ? '✅' : '📖'} <strong>${label}</strong>
                    <span style="color:#888;font-size:11px;">${qualifies ? 'Qualifies' : `${pct}% to qualify`}${nextIn}</span>
                </div>`;
        }).join('');

        let coreSection = '';
        if (prov.cored) {
            coreSection = `<div style="background:#f0fdf4;border:1px solid #27ae60;border-radius:6px;padding:8px 12px;color:#27ae60;font-weight:bold;font-size:13px; text-align:center;">✅ Core Province</div>`;
        } else if (isVassal) {
            coreSection = `<div style="background:#e8f4f8;border:1px solid #2980b9;border-radius:6px;padding:8px 12px;font-size:13px;color:#2c3e50;">
                🕊️ Integration Task: Keep Liberty Desire at 0% to annex.
            </div>`;
        } else if (canCore) {
            coreSection = `<button class="eu-action-btn eu-core-btn" id="eu-btn-core" ${canAffordCore ? '' : 'disabled'}>
                ✅ Core Province (${CORE_ADM_COST} 📜)
            </button>`;
        } else {
            const qualified = provSrs.filter(s => s.interval >= CORE_INTERVAL_THRESHOLD).length;
            coreSection = `<div style="background:#fef9e7;border:1px solid #f1c40f;border-radius:6px;padding:8px 12px;font-size:12px;color:#555;">
                ⏳ All ${prov.words.length} words must qualify to Core — ${qualified}/${prov.words.length} done.
            </div>`;
        }

        html += `
            <div class="eu-prov-stats">
                <div>${isVassal ? 'Liberty Desire' : 'Unrest'}: <strong style="color:${(isVassal?prov.libertyDesire:prov.unrest) > 50 ? '#c0392b' : '#27ae60'}">${prov.cored ? '—' : Math.floor(isVassal ? prov.libertyDesire : prov.unrest) + '%'}</strong></div>
                <div>Words: <strong>${prov.words.length}</strong></div>
            </div>
            <div style="background:#fcf9f2;border-radius:6px;padding:10px;margin-bottom:12px;border:1px solid #e0d9cc; box-shadow:inset 0 2px 4px rgba(0,0,0,0.02);">
                ${wordRows}
            </div>
            ${coreSection}
        `;

        if (isOwned) {
            html += `
            <h4 style="margin:15px 0 5px; font-size:14px; color:#555; border-bottom:1px solid #ddd;">Buildings</h4>
            <div class="eu-build-actions">
                <button class="eu-action-btn" id="eu-btn-market" ${prov.buildings.market ? 'disabled' : ''}>
                    ${prov.buildings.market ? '✅ Marketplace' : '🔨 Build Market (50 💰)'}
                </button>
                <button class="eu-action-btn" id="eu-btn-barracks" ${prov.buildings.barracks ? 'disabled' : ''}>
                    ${prov.buildings.barracks ? '✅ Barracks' : '🔨 Build Barracks (50 💰)'}
                </button>
                <button class="eu-action-btn" id="eu-btn-fort" ${prov.buildings.fort ? 'disabled' : ''}>
                    ${prov.buildings.fort ? '✅ Fort' : '🏰 Build Fort (100 💰, 50 📜)'}
                </button>
            </div>`;
        }
    } else if (isAdj) {
        const stats    = _getEmpireStats();
        const tierMod  = prov.tier || 1;
        const tierLabel = ['', '⭐ Poor', '⭐⭐ Average', '⭐⭐⭐ Rich'][tierMod];
        const baseCost = (100 + (stats.ownedCount * 50)) * tierMod;
        const warCost  = _g.ideas.drill ? Math.round(baseCost * IDEAS.drill.effect) : baseCost;
        const annexCost = prov.words.length * DIPLO_ANNEX_DIP_COST_PER_WORD * tierMod;
        html += `
            <div style="font-size:13px;color:#555;margin-bottom:15px; background:#fff; padding:10px; border:1px solid #ddd; border-radius:6px;">
                ${tierLabel} region.<br/>Contains ${prov.words.length} foreign words.
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <button class="eu-action-btn eu-war-btn" id="eu-btn-war">⚔️ Declare War (~${warCost} ⚔️)</button>
                <button class="eu-action-btn eu-annex-btn" id="eu-btn-annex">🕊️ Subjugate (${annexCost} 🕊️ DIP)</button>
            </div>
        `;
    } else {
        html += `<div style="text-align:center; padding:20px; color:#95a5a6;">
            <div style="font-size:30px; margin-bottom:10px;">☁️</div>
            Terra Incognita.<br>Conquer adjacent provinces to reveal.
        </div>`;
    }

    panel.innerHTML = html;

    if (isOwned) {
        panel.querySelector('#eu-btn-core')?.addEventListener('click', () => _coreProvince(prov.id));
        panel.querySelector('#eu-btn-market')?.addEventListener('click', () => _buildBuilding(prov.id, 'market', '50 💰'));
        panel.querySelector('#eu-btn-barracks')?.addEventListener('click', () => _buildBuilding(prov.id, 'barracks', '50 💰'));
        panel.querySelector('#eu-btn-fort')?.addEventListener('click', () => _buildBuilding(prov.id, 'fort', '100 💰, 50 📜'));
    } else if (isAdj && !isVassal) {
        panel.querySelector('#eu-btn-war')?.addEventListener('click', () => _declareWar(prov.id));
        panel.querySelector('#eu-btn-annex')?.addEventListener('click', () => _diplomaticAnnex(prov.id));
    }
}

function _buyIdea(key) {
    const idea = IDEAS[key];
    if (_g.resources[idea.type] < idea.cost) {
        _toast(`Not enough ${idea.type.toUpperCase()} points!`, '#e74c3c');
        return;
    }
    _g.resources[idea.type] -= idea.cost;
    _g.ideas[key] = true;
    _toast(`Idea Unlocked: ${idea.name}`, '#27ae60');
    _renderCourt();
    _updateUI();
}

function _hireAdvisor(key) {
    const adv = ADVISORS[key];
    if (_g.resources.ducats < adv.cost) {
        _toast(`Not enough Ducats to hire!`, '#e74c3c'); return;
    }
    _g.resources.ducats -= adv.cost;
    _g.advisors[key] = true;
    _toast(`Hired: ${adv.name}`, '#f39c12');
    _renderCourt();
    _updateUI();
}

function _fireAdvisor(key) {
    _g.advisors[key] = false;
    _toast(`Fired: ${ADVISORS[key].name}`, '#7f8c8d');
    _renderCourt();
    _updateUI();
}

function _checkMissions() {
    let changed = false;
    Object.keys(MISSIONS).forEach(k => {
        if (!_g.missionsCompleted[k] && MISSIONS[k].req()) {
            _g.missionsCompleted[k] = true;
            MISSIONS[k].reward();
            _toast(`🎯 Mission Complete: ${MISSIONS[k].name}!`, '#8e44ad');
            changed = true;
        }
    });
    if (changed) _renderCourt();
}

function _renderCourt() {
    const ideasBox = _screens.game?.querySelector('#eu-ideas-container');
    const statsList = _screens.game?.querySelector('#eu-stats-list');
    const missionsBox = _screens.game?.querySelector('#eu-missions-list');
    const advBox = _screens.game?.querySelector('#eu-advisors-list');
    if (!ideasBox || !statsList || !missionsBox || !advBox) return;

    // IDEAS
    ideasBox.innerHTML = '';
    Object.entries(IDEAS).forEach(([key, idea]) => {
        const unlocked = _g.ideas[key];
        const canAfford = _g.resources[idea.type] >= idea.cost;
        const div = document.createElement('div');
        div.className = `eu-idea-card ${unlocked ? 'unlocked' : ''}`;
        let pointIcon = idea.type === 'adm' ? '📜' : idea.type === 'dip' ? '🕊️' : '🗡️';
        div.innerHTML = `
            <div style="font-weight:bold; font-size:14px; margin-bottom:4px; color:#2c3e50;">${idea.name}</div>
            <div style="font-size:11px; color:#555; margin-bottom:8px; flex:1;">${idea.desc}</div>
            ${unlocked ? `<div style="color:#27ae60; font-weight:bold; font-size:12px; margin-top:auto;">✅ Enacted</div>` : 
              `<button class="eu-action-btn" style="margin-top:auto; padding:6px;" ${canAfford ? '' : 'disabled'}>Enact (${idea.cost} ${pointIcon})</button>`}
        `;
        if (!unlocked) div.querySelector('button').addEventListener('click', () => _buyIdea(key));
        ideasBox.appendChild(div);
    });

    // MISSIONS
    missionsBox.innerHTML = '';
    Object.entries(MISSIONS).forEach(([key, m]) => {
        const comp = _g.missionsCompleted[key];
        const div = document.createElement('div');
        div.className = `eu-mission-card ${comp ? 'completed' : ''}`;
        div.innerHTML = `
            <div style="font-size:24px;">${m.icon}</div>
            <div>
                <div style="font-weight:bold; font-size:14px;">${m.name}</div>
                <div style="font-size:12px; color:#555;">${m.desc}</div>
                ${comp ? `<div style="color:#27ae60; font-size:11px; font-weight:bold; margin-top:4px;">✅ Complete</div>` : 
                         `<div style="color:#8e44ad; font-size:11px; font-weight:bold; margin-top:4px;">Reward: ${m.rewardDesc}</div>`}
            </div>
        `;
        missionsBox.appendChild(div);
    });

    // ADVISORS
    advBox.innerHTML = '';
    Object.entries(ADVISORS).forEach(([key, adv]) => {
        const hired = _g.advisors[key];
        const div = document.createElement('div');
        div.className = `eu-adv-card ${hired ? 'hired' : ''}`;
        div.innerHTML = `
            <div style="font-size:24px; margin-right:10px;">${adv.icon}</div>
            <div style="flex:1;">
                <div style="font-weight:bold; font-size:14px;">${adv.name}</div>
                <div style="font-size:11px; color:#555;">${adv.desc}</div>
                <div style="font-size:11px; color:#c0392b; margin-top:2px;">-${adv.upkeep} Ducats/s</div>
            </div>
            <div>
                ${hired ? `<button class="eu-action-btn" style="padding:6px; background:#e74c3c; color:white; border:none;" data-fire="${key}">Fire</button>` : 
                          `<button class="eu-action-btn" style="padding:6px; background:#f1c40f;" data-hire="${key}">Hire (${adv.cost} 💰)</button>`}
            </div>
        `;
        advBox.appendChild(div);
    });

    advBox.querySelectorAll('[data-hire]').forEach(b => b.addEventListener('click', (e) => _hireAdvisor(e.target.dataset.hire)));
    advBox.querySelectorAll('[data-fire]').forEach(b => b.addEventListener('click', (e) => _fireAdvisor(e.target.dataset.fire)));

    // STATS
    const stats = _getEmpireStats();
    const accuracy = (_g.stats.totalCorrect + _g.stats.totalWrong) > 0
        ? Math.round((_g.stats.totalCorrect / (_g.stats.totalCorrect + _g.stats.totalWrong)) * 100) : 0;
    statsList.innerHTML = `
        <div class="eu-stat-row"><span>🗺️ Provinces Owned</span><span>${stats.ownedCount} (${stats.coredProvCount} cored)</span></div>
        <div class="eu-stat-row"><span>🕊️ Vassals</span><span>${stats.vassalCount}</span></div>
        <div class="eu-stat-row"><span>💀 Provinces Lost</span><span>${_g.stats.provincesLost || 0}</span></div>
        <div class="eu-stat-row"><span>⚖️ Stability</span><span style="color:${stats.stability < 5 ? '#c0392b' : '#27ae60'}">${stats.stability.toFixed(1)} / ${STABILITY_MAX}</span></div>
        <div class="eu-stat-row"><span>🔥 Aggressive Expansion</span><span style="color:${_g.ae > 50 ? '#c0392b' : '#333'}">${Math.floor(_g.ae)}</span></div>
        <div class="eu-stat-row"><span>📖 Words in SRS</span><span>${stats.activeSrsCount}</span></div>
        <div class="eu-stat-row"><span>🎯 Answer Accuracy</span><span>${accuracy}% (${_g.stats.totalCorrect}✓ ${_g.stats.totalWrong}✗)</span></div>
        <div class="eu-stat-row"><span>💰 Net Ducats Income</span><span>${stats.ducatsPerSec >= 0 ? '+' : ''}${stats.ducatsPerSec.toFixed(1)}/s</span></div>
        <div class="eu-stat-row"><span>📊 Overextension Penalty</span><span style="color:${stats.overextension > 50 ? '#c0392b' : '#27ae60'}">-${Math.floor(stats.overextension)}%</span></div>
    `;
}

function _updateUI() {
    const now = Date.now();
    if (now - _lastUiRender < 100) return; // cap at ~10fps
    _lastUiRender = now;

    const g = _screens.game;
    if (!g || g.style.display === 'none') return;

    const stats = _getEmpireStats();

    g.querySelector('#eu-val-ducats').textContent    = Math.floor(_g.resources.ducats);
    g.querySelector('#eu-val-manpower').textContent  = Math.floor(_g.resources.manpower);
    g.querySelector('#eu-val-adm').textContent       = Math.floor(_g.resources.adm);
    g.querySelector('#eu-val-dip').textContent       = Math.floor(_g.resources.dip);
    g.querySelector('#eu-val-mil').textContent       = Math.floor(_g.resources.mil);
    g.querySelector('#eu-val-stability').textContent = (_g.stability ?? STABILITY_MAX).toFixed(1);
    g.querySelector('#eu-val-ae').textContent        = Math.floor(_g.ae);

    // AE visual warning
    const aeBox = g.querySelector('#eu-ae-box');
    if (aeBox) {
        aeBox.classList.toggle('eu-ae-warning',  _g.ae > 35 && _g.ae <= 50);
        aeBox.classList.toggle('eu-ae-critical', _g.ae > 50);
    }
    g.querySelector('#eu-val-oe').textContent        = `${Math.floor(stats.overextension)}%`;
    g.querySelector('#eu-val-rebels').textContent    = stats.rebellingCount;
    g.querySelector('#eu-val-size').textContent      = stats.ownedCount;
    _updateFocusButtons();

    const timerEl = g.querySelector('#eu-next-review-timer');
    if (timerEl && _pendingReviews.length === 0 && _g.srs.length > 0) {
        const next    = Math.min(..._g.srs.map(s => s.nextReview));
        const diffSec = (next - Date.now()) / 1000;
        timerEl.textContent = diffSec <= 2
            ? 'Incident imminent...'
            : `Next incident in: ${_formatTime(diffSec)}`;
    }

    if (g.querySelector('#eu-tab-court').classList.contains('active')) {
        if (Math.random() < 0.05) _renderCourt();
    }
}

function _switchTab(tabName) {
    const g = _screens.game;
    g.querySelectorAll('.eu-pane').forEach(c => c.classList.remove('active'));
    g.querySelector(`#eu-tab-${tabName}`)?.classList.add('active');
    
    g.querySelectorAll('.eu-tab-btn').forEach(b => b.classList.remove('active'));
    g.querySelector(`.eu-tab-btn[data-target="${tabName}"]`)?.classList.add('active');

    if (tabName === 'map') _renderMap();
    if (tabName === 'court') _renderCourt();
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function _saveGame() {
    _g.lastTick = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(_g));
}

function _loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { _g = _freshGame(); return; }
    try {
        const p = JSON.parse(raw);
        _g = _freshGame();
        Object.assign(_g.resources, p.resources || {});
        Object.assign(_g.stats, p.stats || {});
        _g.provinces      = p.provinces      || [];
	_g.srs = p.srs || [];
	_g.ideas = p.ideas || {};
	_g.missionsCompleted = p.missionsCompleted || {};
	_g.advisors = p.advisors|| {};
	_g.ae = p.ae || 0;
	_g.stability = p.stability ?? STABILITY_MAX;
	_g.nationalFocus = p.nationalFocus || 'adm';
	_g.combo = p.combo || 0;
	_g.victoryAchieved = p.victoryAchieved || false;
	_g.lastTick = Date.now();
	} catch (e) {
	_g = _freshGame();
	}
}



function _checkVictory() {
    if (_g.victoryAchieved) return;
    const total = _g.provinces.length;
    if (total === 0) return;
    const cored = _g.provinces.filter(p => p.cored).length;
    if (cored < total) return;

    _g.victoryAchieved = true;
    _stopGameLoop();
    _saveGame();

    const accuracy = (_g.stats.totalCorrect + _g.stats.totalWrong) > 0
        ? Math.round((_g.stats.totalCorrect / (_g.stats.totalCorrect + _g.stats.totalWrong)) * 100) : 0;

    const g = _screens.game;
    g.innerHTML = `
    <div style="
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        height:100%; padding:30px; font-family:'Georgia',serif; text-align:center;
        background: radial-gradient(ellipse at center, #fdf6e3 0%, #e8d5a3 100%);
    ">
        <div style="font-size:64px; margin-bottom:16px;">👑</div>
        <h1 style="font-size:28px; color:#c0392b; margin:0 0 8px;">Empire United!</h1>
        <p style="font-size:15px; color:#555; max-width:380px; line-height:1.6; margin-bottom:24px;">
            You have Cored every province and mastered every word in your vocabulary. 
            Your empire stands supreme — and so does your Japanese!
        </p>
        <div style="background:white; border-radius:12px; padding:20px 30px; border:2px solid #bdc3c7; box-shadow:0 8px 20px rgba(0,0,0,0.1); width:100%; max-width:360px; margin-bottom:24px;">
            <div style="font-size:13px; font-weight:bold; color:#888; margin-bottom:12px; letter-spacing:1px;">FINAL STATISTICS</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 20px; font-size:14px; text-align:left;">
                <span style="color:#555;">Provinces Cored</span>  <strong>${total} / ${total}</strong>
                <span style="color:#555;">Words Mastered</span>   <strong>${_g.stats.wordsMastered}</strong>
                <span style="color:#555;">Wars Won</span>          <strong>${_g.stats.warsWon}</strong>
                <span style="color:#555;">Rebellions Crushed</span><strong>${_g.stats.rebellionsCrushed}</strong>
                <span style="color:#555;">Answer Accuracy</span>  <strong>${accuracy}%</strong>
                <span style="color:#555;">Best Combo</span>        <strong>${_g.stats.highestCombo}</strong>
            </div>
        </div>
        <div style="display:flex; gap:12px; flex-wrap:wrap; justify-content:center;">
            <button class="eu-action-btn eu-war-btn" id="eu-victory-new" style="padding:14px 24px; font-size:15px;">⚔️ New Empire</button>
            <button class="eu-action-btn" id="eu-victory-exit" style="padding:14px 24px; font-size:15px;">🚪 Return to Menu</button>
        </div>
    </div>`;

    g.querySelector('#eu-victory-new')?.addEventListener('click', () => {
        localStorage.removeItem(SAVE_KEY);
        _g = null;
        _show('setup');
        _renderSetup();
    });
    g.querySelector('#eu-victory-exit')?.addEventListener('click', () => {
        localStorage.removeItem(SAVE_KEY);
        _onExit();
    });
}

function _stopGameLoop() {
    if (_rafId) cancelAnimationFrame(_rafId);
    if (_saveInterval) clearInterval(_saveInterval);
}

function _toast(msg, color = '#333') {
    const area = _screens.game?.querySelector('#eu-toasts');
    if (!area) return;
    const t = document.createElement('div');
    t.className = 'eu-toast';
    t.style.borderLeft = `5px solid ${color}`;
    t.textContent = msg;
    area.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function _spawnFloatingText(x, y, text, color) {
    const wrap = _screens.game; 
    if (!wrap) return;
    const fx = document.createElement('div');
    fx.className = 'eu-float-text';
    fx.textContent = text;
    fx.style.left = x + 'px';
    fx.style.top = y + 'px';
    fx.style.color = color;
    wrap.appendChild(fx);
    setTimeout(() => fx.remove(), 1000);
}

// ─── CSS Injection ────────────────────────────────────────────────────────────

(function _injectStyles() {
    if (document.getElementById('eu-game-styles')) return;
    const style = document.createElement('style');
    style.id = 'eu-game-styles';
    style.textContent = `
.eu-root {
    display: flex; flex-direction: column; height: 100%;
    font-family: 'Georgia', serif; color: #2c3e50;
}

/* Topbar & Resources */
.eu-topbar {
    display: flex; justify-content: space-around; background: #34495e;
    padding: 10px; color: white; border-bottom: 3px solid #c0392b;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 10;
}
.eu-res-box { font-size: 14px; font-weight: bold; display:flex; align-items:center; gap:5px;}
.eu-point-adm { color: #f1c40f; }
.eu-point-dip { color: #3498db; }
.eu-point-mil { color: #e74c3c; }

.eu-stats-bar {
    display: flex; align-items: center; gap: 15px; padding: 8px 15px;
    background: #eaddc5; border-bottom: 1px solid #dcdde1; font-size: 12px;
}

/* Tabs */
.eu-tabs {
    display: flex; background: #dcdde1; border-bottom: 2px solid #bdc3c7;
}
.eu-tab-btn {
    flex: 1; padding: 12px 0; border: none; background: none; font-weight: bold;
    cursor: pointer; color: #7f8c8d; transition: 0.2s; font-family: 'Georgia', serif;
}
.eu-tab-btn.active { background: #f4ecd8; color: #c0392b; border-bottom: 3px solid #c0392b; }
.eu-badge { background:#e74c3c; color:white; padding:2px 6px; border-radius:10px; font-size:10px; }

.eu-content { flex: 1; overflow-y: auto; position: relative; }
.eu-pane { display: none; padding: 15px; }
.eu-pane.active { display: block; }

/* Map Grid */
.eu-map-container {
    display: grid; gap: 4px; padding: 10px; background: #7f8c8d; border-radius: 8px;
    border: 3px solid #2c3e50; box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
}
.eu-map-cell {
    aspect-ratio: 1; background: #bdc3c7; border: 2px solid #95a5a6;
    border-radius: 6px; display: flex; flex-direction: column; align-items: center;
    justify-content: center; cursor: pointer; position: relative; transition: 0.2s;
}
.eu-map-cell:hover { filter: brightness(1.1); transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 1;}
.eu-map-cell.fog { background: #5a6a75; border-color: #4a5a65; opacity: 0.5; cursor: not-allowed; }
.eu-map-cell.adjacent { background: #f39c12; border-color: #e67e22; }
.eu-map-cell.owned { background: #27ae60; border-color: #2ecc71; color: white; }
.eu-map-cell.owned.cored { background: #16a085; border-color: #1abc9c; }
.eu-map-cell.vassal { background: #2980b9; border-color: #3498db; color: white; }
.eu-map-cell.rebelling { background: #c0392b; border-color: #e74c3c; animation: euPulse 1s infinite; }
.eu-map-cell.selected { outline: 3px solid #f1c40f; z-index: 2; transform: scale(1.05); }

.eu-cell-name { font-size: 10px; font-weight: bold; text-align: center; word-break: break-word; text-shadow: 1px 1px 2px rgba(0,0,0,0.5); color:white;}
.eu-cell-unrest { font-size: 12px; font-weight: bold; position: absolute; top: 2px; right: 4px; text-shadow: 1px 1px 0 #000; }
.eu-cell-icons { font-size: 14px; margin-top: 2px; }

/* Province Panel */
.eu-prov-panel {
    margin-top: 15px; background: white; padding: 15px; border-radius: 8px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.1); border: 1px solid #dcdde1;
}
.eu-prov-stats { display: flex; gap: 20px; font-size: 14px; margin-bottom: 10px; }
.eu-build-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.eu-action-btn {
    background: #ecf0f1; border: 1px solid #bdc3c7; padding: 10px; border-radius: 6px;
    cursor: pointer; font-family: 'Georgia', serif; font-weight: bold; color: #2c3e50;
    transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.eu-action-btn:hover:not(:disabled) { background: #dfe6e9; transform: translateY(-1px); box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
.eu-action-btn:active:not(:disabled) { transform: translateY(0); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.eu-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.eu-war-btn { background: #c0392b; color: white; border-color: #a93226; }
.eu-war-btn:hover:not(:disabled) { background: #e74c3c; }
.eu-core-btn { background: #f1c40f; color: #333; border-color: #d4ac0d; font-weight: bold; }
.eu-core-btn:hover:not(:disabled) { background: #f9d71c; }
.eu-annex-btn { background: #3498db; color: white; border-color: #2980b9; }
.eu-annex-btn:hover:not(:disabled) { background: #5dade2; }

/* Court Layout */
.eu-court-layout { display: flex; gap: 20px; }
.eu-court-left, .eu-court-right { flex: 1; }

/* Cards (Ideas, Missions, Advisors) */
.eu-title { border-bottom: 2px solid #bdc3c7; padding-bottom: 5px; margin-top: 0; font-size: 18px; color: #34495e; }
.eu-ideas-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
.eu-idea-card {
    background: white; border: 1px solid #dcdde1; padding: 12px; border-radius: 8px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.05); display: flex; flex-direction: column;
}
.eu-idea-card.unlocked { border-color: #27ae60; background: #f0fdf4; }

.eu-mission-card {
    background: #fdfefe; border: 1px solid #bdc3c7; padding: 12px; border-radius: 8px;
    display: flex; gap: 15px; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.eu-mission-card.completed { background: #f0fdf4; border-color: #27ae60; opacity: 0.8; }

.eu-adv-card {
    background: #fdfefe; border: 1px solid #bdc3c7; padding: 10px; border-radius: 8px;
    display: flex; gap: 10px; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.eu-adv-card.hired { background: #fef9e7; border-color: #f1c40f; }

/* Stats List */
.eu-stats-list { background: white; border-radius: 8px; padding: 10px; border: 1px solid #dcdde1; display:grid; grid-template-columns: 1fr 1fr; gap: 10px 30px; }
.eu-stat-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }

/* Dojo / Combat */
.eu-srs-status { text-align: center; padding: 10px; background: #fab1a0; color: #d63031; border-radius: 8px; margin-bottom: 20px; font-weight:bold; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
.eu-battle-screen {
    background: white; border-radius: 12px; border: 2px solid #bdc3c7;
    padding: 30px; display: flex; flex-direction: column; align-items: center;
    box-shadow: 0 10px 20px rgba(0,0,0,0.1);
}
.eu-fc-kanji { font-size: 48px; font-weight: bold; margin-bottom: 30px; font-family: sans-serif; color: #2c3e50; }
.eu-quiz-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 100%; max-width: 450px; }
.eu-quiz-grid.eu-grid-6 { grid-template-columns: 1fr 1fr 1fr; max-width: 600px; }
.eu-quiz-btn {
    background: #ecf0f1; border: 2px solid #bdc3c7; padding: 15px; border-radius: 8px;
    font-size: 16px; cursor: pointer; font-family: sans-serif; font-weight:bold;
    transition: all 0.15s; color: #2c3e50;
}
.eu-quiz-btn:hover:not(:disabled) { background: #dfe6e9; transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
.eu-quiz-correct { background: #27ae60 !important; color: white !important; border-color: #2ecc71 !important; }
.eu-quiz-wrong { background: #c0392b !important; color: white !important; border-color: #e74c3c !important; }
.eu-advisor-hint { box-shadow: 0 0 15px 5px #f1c40f !important; border-color: #f1c40f !important; }

/* Modals */
.eu-war-modal {
    position: absolute; inset: 0; background: rgba(0,0,0,0.8);
    display: none; align-items: center; justify-content: center; z-index: 500;
    backdrop-filter: blur(3px);
}
.eu-war-modal-inner {
    background: #f4ecd8; border: 4px solid #c0392b; border-radius: 12px;
    padding: 30px; max-width: 450px; width: 90%; text-align: center;
    font-family: 'Georgia', serif; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    animation: euPopIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.eu-war-header { font-size: 18px; font-weight: bold; color: #c0392b; margin-bottom: 12px; }
.eu-war-progress { font-size: 24px; letter-spacing: 5px; margin-bottom: 20px; }
.eu-war-pip { display: inline-block; width: 26px; height: 26px; line-height: 26px;
    border-radius: 50%; border: 2px solid #bdc3c7; font-size: 14px; text-align: center; background:white; }
.eu-war-pip.win { background: #27ae60; border-color: #27ae60; color: white; }
.eu-war-pip.loss { background: #c0392b; border-color: #c0392b; color: white; }
.eu-war-kanji { font-size: 48px; font-weight: bold; margin: 15px 0 25px; font-family: sans-serif; color: #2c3e50; }
.eu-war-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.eu-war-opt-btn {
    background: white; border: 2px solid #bdc3c7; padding: 14px;
    border-radius: 8px; font-size: 16px; cursor: pointer; font-family: sans-serif;
    font-weight: bold; transition: 0.15s; color: #34495e; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.eu-war-opt-btn:hover:not(:disabled) { background: #f8f9fa; transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.1); }

/* Utils */
.eu-icon-btn { background:none; border:none; font-size:20px; cursor:pointer; padding:0 8px; transition: 0.2s; }
.eu-icon-btn:hover { transform: scale(1.2); }
#eu-toasts { position: absolute; top: 60px; right: 20px; z-index: 1000; pointer-events: none; display:flex; flex-direction:column; gap:10px; }
.eu-toast {
    background: rgba(44, 62, 80, 0.95); color: white; padding: 12px 20px;
    border-radius: 6px; font-size: 14px; font-family: sans-serif; font-weight:bold;
    box-shadow: 0 4px 10px rgba(0,0,0,0.2); animation: euFadeUp 3s forwards;
}
.eu-float-text {
    position: fixed; pointer-events: none; font-weight: bold; font-family: sans-serif; font-size: 16px;
    text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;
    animation: euFloatUp 1s forwards ease-out; z-index: 9999;
}

/* National Focus */
.eu-focus-bar { display: flex; gap: 8px; margin-bottom: 4px; }
.eu-focus-btn {
    flex: 1; padding: 10px 6px; border: 2px solid #bdc3c7; border-radius: 6px;
    background: #ecf0f1; cursor: pointer; font-family: 'Georgia', serif;
    font-size: 12px; font-weight: bold; color: #555; transition: 0.2s; box-shadow: inset 0 -2px 0 rgba(0,0,0,0.05);
}
.eu-focus-btn.active { background: #f1c40f; border-color: #d4ac0d; color: #333; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }
.eu-focus-btn:hover:not(.active) { background: #dfe6e9; }

/* Tier indicator on map cell */
.eu-cell-tier { font-size: 9px; position: absolute; bottom: 2px; left: 3px; opacity: 0.8; }

/* Rebel timer bar */
.eu-rebel-timer-wrap { width: 90%; background: rgba(0,0,0,0.5); border-radius: 3px; height: 4px; margin-top: 4px; overflow: hidden; }
.eu-rebel-timer-bar { height: 100%; background: #e74c3c; transition: width 1s linear; }

/* Animations */
@keyframes euPulse { 0% { box-shadow: 0 0 0 0 rgba(192, 57, 43, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(192, 57, 43, 0); } 100% { box-shadow: 0 0 0 0 rgba(192, 57, 43, 0); } }
@keyframes euFadeUp { 0% { opacity:0; transform:translateX(20px); } 10% { opacity:1; transform:translateX(0); } 80% { opacity:1; transform:translateX(0); } 100% { opacity:0; transform:translateY(-20px); } }
@keyframes euFloatUp { 0% { opacity:1; transform:translateY(0) scale(1); } 100% { opacity:0; transform:translateY(-50px) scale(1.2); } }
@keyframes euPopIn { 0% { opacity: 0; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1); } }

/* AE Warning States */
#eu-ae-box { transition: background 0.5s, color 0.5s; border-radius: 4px; padding: 2px 6px; }
#eu-ae-box.eu-ae-warning  { background: rgba(243,156,18,0.25); color: #f39c12 !important; }
#eu-ae-box.eu-ae-critical { background: rgba(192,57,43,0.35); color: #e74c3c !important; animation: euPulse 1s infinite; }

/* Responsive adjustments */
@media (max-width: 768px) {
    .eu-court-layout { flex-direction: column; }
    .eu-stats-list { grid-template-columns: 1fr; }
    .eu-quiz-grid.eu-grid-6 { grid-template-columns: 1fr 1fr; }
}
`;
    document.head.appendChild(style);
})();