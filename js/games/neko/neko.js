// js/games/neko/neko.js — NekoNihongo idle + SRS game
// export { init, launch }

import { mountVocabSelector, getDeckConfig } from '../../vocab_selector.js';

let _screens = null;
let _onExit  = null;
let _selector = null;
let _vocabQueue = []; // words from vocab_selector: { word, furi, trans, status }
let _vocabQueueFull = []; // full unsliced pool from the same deck (used to pin learned words back after a random/count-limited restart)
let _STARTER_COUNT = 3; // default; overridden by config on each launch

const SAVE_KEY   = 'neko_nihongo_save';
const BANNED_KEY = 'neko_banned_words';
const CFG_KEY    = 'neko_nihongo_cfg';
const DECK_CFG_KEY = 'neko_nihongo_deck';  // persists chosen deck independently of vocab_selector_settings

function _loadCfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch { return {}; }
}
function _saveCfg(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }
function _getCfg(key, def) { const v = _loadCfg()[key]; return v !== undefined ? v : def; }

// ── Deck config — saved independently so it can't be clobbered by other games ──
function _loadDeckCfg() {
    try { return JSON.parse(localStorage.getItem(DECK_CFG_KEY)) || null; } catch { return null; }
}
function _saveDeckCfg(cfg) {
    localStorage.setItem(DECK_CFG_KEY, JSON.stringify(cfg));
}
function _clearDeckCfg() {
    localStorage.removeItem(DECK_CFG_KEY);
}

export function init(screens, onExit) {
    _screens = screens;
    _onExit  = onExit;
}

export function launch() {
    const savedDeck = _loadDeckCfg();
    if (savedDeck) {
        // ── Resume path: rebuild vocab queue from saved deck config silently ──
        _resumeWithDeck(savedDeck);
    } else {
        // ── First-run path: show the selector so the player picks their deck ──
        _show('setup');
        _renderSetup();
    }
}

// ─── Screen Management ────────────────────────────────────────────────────────

const _titles = {
    setup: 'NekoNihongo — Setup',
    game:  '🐾 NekoNihongo',
    stats: 'NekoNihongo — Results',
};

function _show(name) {
    Object.entries(_screens).forEach(([k, el]) => {
        if (!el) return;
        
        if (k === name) {
            // Override padding/overflow for the game screen to allow full-height layout
            if (name === 'game') {
                el.style.display = 'flex';
                el.style.flexDirection = 'column';
                el.style.padding = '0';
                el.style.overflow = 'hidden';
            } else {
                el.style.display = 'block';
                el.style.padding = ''; 
                el.style.overflow = ''; 
            }
        } else {
            el.style.display = 'none';
        }
    });
    const hdr = document.getElementById('games-header-title');
    if (hdr) hdr.textContent = _titles[name] || 'NekoNihongo';
}

// ─── Deck Resume ─────────────────────────────────────────────────────────────

/**
 * Build a vocab queue directly from a saved deck config object, bypassing the
 * selector UI entirely.  Returns a Promise<vocabEntry[]>.
 */
async function _buildVocabFromDeckCfg(deckCfg) {
    // Mount the selector into a detached scratch div, build the queue,
    // then discard — reuses all existing queue-building logic with zero duplication.
    const scratch = document.createElement('div');
    scratch.style.display = 'none';
    document.body.appendChild(scratch);

    const ctrl = mountVocabSelector(scratch, {
        bannedKey:     BANNED_KEY,
        preloadConfig: deckCfg,
        title:         '_neko_internal_',
    });

    let queue = [];
    try {
        queue = await ctrl.getQueue();
    } catch (e) {
        console.warn('[Neko] Could not build vocab from saved deck:', e);
    }

    scratch.remove();
    return queue;
}

/**
 * Resume directly into the game using a saved deck config (no setup screen).
 * Rebuilds _vocabQueue from the config, then kicks off the game.
 */
async function _resumeWithDeck(deckCfg) {
    // Show a lightweight loading state while we rebuild the queue
    const setupEl = _screens.setup;
    if (setupEl) {
        setupEl.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                        height:100%;gap:14px;padding:40px 20px;text-align:center;">
                <div style="font-size:48px;">🐱</div>
                <div style="font-size:16px;font-weight:bold;color:var(--text-main,#333);">Resuming your Dojo…</div>
                <div style="font-size:13px;color:#888;">${_deckCfgLabel(deckCfg)}</div>
            </div>`;
        _show('setup');
    }

    const queue = await _buildVocabFromDeckCfg(deckCfg);

    if (!queue.length) {
        // Saved deck produced nothing (deck file missing, banned words exhausted, etc.)
        // Fall back to the setup screen so the player can pick again
        console.warn('[Neko] Saved deck returned empty queue — falling back to setup screen');
        _renderSetup();
        return;
    }

    _vocabQueue = queue.map(w => ({
        id: w.word, kanji: w.word,
        kana: w.furi  || w.word,
        eng:  w.trans || '—',
    }));

    // Build full unsliced pool so already-learned words can always be pinned back
    const fullQueue = await _buildVocabFromDeckCfg({ ...deckCfg, count: 'All' });
    _vocabQueueFull = fullQueue.map(w => ({ id: w.word, kanji: w.word, kana: w.furi || w.word, eng: w.trans || '—' }));

    _STARTER_COUNT = _getCfg('starter', 3);
    _show('game');
    _loadGame();
    _applyVocabSlots();
    _initGameDOM();
    _initShops();
    _isCooldown = false;
    _updateSRSQueue();
    _updateUI();
    _updatePauseBtn();
    _startGameLoop();
}

/** Human-readable one-liner describing the saved deck config (used in loading UI). */
function _deckCfgLabel(deckCfg) {
    if (!deckCfg) return '';
    const parts = [];
    if (deckCfg.decks) {
        Object.entries(deckCfg.decks).forEach(([id, r]) => {
            // Map deck id back to label — we hard-code the most common ones to
            // avoid importing the DECKS array here (it lives in vocab_selector).
            const labels = {
                jlpt_n4:'JLPT N4', jlpt_n5:'JLPT N5', frequency:'Standard',
                anime:'Anime', romance:'Romance', gamer:'Gamer',
                foodie:'Foodie', history:'History', tourist:'Tourist', expat:'Expat',
            };
            const label = labels[id] || id;
            parts.push(`${label} ${r.lo}–${r.hi}`);
        });
    }
    if (deckCfg.useSrs) parts.push('SRS Deck');
    return parts.join(' · ') || 'Custom deck';
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function _renderSetup() {
    const el = _screens.setup;
    if (!el) return;

    _selector = mountVocabSelector(el, {
        bannedKey:    BANNED_KEY,
        defaultCount: 20,
        title:        'NekoNihongo — Choose Vocabulary',
    });

    const actions = _selector.getActionsEl();

    const startBtn = document.createElement('button');
    startBtn.className   = 'primary-btn';
    startBtn.style.marginTop = '8px';
    startBtn.textContent = '🐾 Start NekoNihongo';
    startBtn.addEventListener('click', _startGame);

    const backBtn = document.createElement('button');
    backBtn.className   = 'caro-back-btn';
    backBtn.style.marginTop = '6px';
    backBtn.textContent = '← Back to Games';
    backBtn.addEventListener('click', _onExit);

    actions.append(startBtn, backBtn);
}

async function _startGame() {
    const queue = await _selector.getQueue();
    if (!queue.length) return;

    // Persist the chosen deck BEFORE touching anything else — this is the key
    // safety step that means accidental re-opens can never clobber the deck.
    const deckCfg = getDeckConfig(_screens.setup);
    if (deckCfg) _saveDeckCfg(deckCfg);

    // Convert vocab_selector format → neko internal format
    _vocabQueue = queue.map((w) => ({
        id:    w.word,
        kanji: w.word,
        kana:  w.furi  || w.word,
        eng:   w.trans || '—',
    }));

    // Build the full unsliced pool (count='All') so _applyVocabSlots can pin
    // already-learned words back even when a count limit or random mode dropped them.
    if (deckCfg) {
        const fullQueue = await _buildVocabFromDeckCfg({ ...deckCfg, count: 'All' });
        _vocabQueueFull = fullQueue.map(w => ({ id: w.word, kanji: w.word, kana: w.furi || w.word, eng: w.trans || '—' }));
    } else {
        _vocabQueueFull = [..._vocabQueue];
    }

    // Pull config settings
    _STARTER_COUNT = _getCfg('starter', 3);

    _show('game');
    _loadGame();
    _applyVocabSlots();
    _initGameDOM();
    _initShops();
    _isCooldown = false;
    _updateSRSQueue();
    _updateUI();
    _updatePauseBtn(); // ensures overlay shows immediately if loaded while paused
    _startGameLoop();
}

/**
 * Vocab slot logic — called after _loadGame() and after _vocabQueue is populated.
 *
 * Already-learned words are ALWAYS kept active, even if the random shuffle or
 * session-size limit didn't include them in the raw queue.  They are silently
 * re-injected so they can never become accidental orphans on a simple restart.
 *
 * True orphans (words learned under a completely different deck that is no longer
 * selected) do go dormant — but a same-deck restart never orphans anything.
 *
 * For each genuine orphan, one unlearned word from the new queue gets a free
 * fresh SRS entry (no fish cost).  Switching back to an old set re-activates
 * dormant words with their full history intact.
 */
function _applyVocabSlots() {
    const queueIds = new Set(_vocabQueue.map(v => v.id));
    const knownIds = new Set(_g.srs.map(s => s.id));

    // ── Pin learned words back into the queue ────────────────────────────────
    // If a word is already in _g.srs but was dropped by a random shuffle or
    // count limit, re-add it to _vocabQueue so it stays active this session.
    // We need the full deck list for this — we store a "full pool" alongside the
    // queue in _vocabQueueFull (set by callers that have the raw data), or fall
    // back to rebuilding from _g.srs kanji/kana/eng fields stored at learn-time.
    _g.srs.forEach(srsItem => {
        if (!queueIds.has(srsItem.id)) {
            // Word is learned but not in the current queue — pin it back.
            // Try to find rich data from the full pool first; fall back to the
            // sparse data stored on the SRS item itself at learn time.
            const fromFull = _vocabQueueFull?.find(v => v.id === srsItem.id);
            if (fromFull) {
                _vocabQueue.push(fromFull);
            } else if (srsItem.kanji || srsItem.id) {
                // Reconstruct a minimal entry from whatever was saved on the item
                _vocabQueue.push({
                    id:    srsItem.id,
                    kanji: srsItem.kanji || srsItem.id,
                    kana:  srsItem.kana  || srsItem.id,
                    eng:   srsItem.eng   || '—',
                });
            }
            queueIds.add(srsItem.id);
        }
    });

    // ── Orphan / slot logic ──────────────────────────────────────────────────
    // After pinning, the only true orphans are words learned under a deck that
    // is genuinely no longer selected (different deck entirely).
    const newIds      = new Set(_vocabQueue.map(v => v.id));
    const orphanCount = _g.srs.filter(s => !newIds.has(s.id)).length;
    const freshPool   = _vocabQueue.filter(v => !knownIds.has(v.id));

    const toAdd = Math.min(orphanCount, freshPool.length);
    for (let i = 0; i < toAdd; i++) {
        const w = freshPool[i];
        _g.srs.push({ id: w.id, nextReview: _gameNow(), interval: _getCfg('interval', 8), ease: _getCfg('ease', 1.5) });
    }

    // ── Starter words on a brand-new save ───────────────────────────────────
    const starterCount = Math.min(_STARTER_COUNT, _vocabQueue.length);
    if (_g.srs.length === 0 && starterCount > 0) {
        for (let i = 0; i < starterCount; i++) {
            const w = _vocabQueue[i];
            _g.srs.push({ id: w.id, kanji: w.kanji, kana: w.kana, eng: w.eng, nextReview: _gameNow(), interval: _getCfg('interval', 8), ease: _getCfg('ease', 1.5) });
        }
        _g.stats.wordsLearned += starterCount;
    }
}

// ─── Game State ───────────────────────────────────────────────────────────────

const _defaultIdleUpgrades = () => ({
    // Each tier costs ~100× its own effect in fish (payoff ~100s at base rate)
    // Level scaling ×1.18 per purchase keeps curves tight
    box:       { name: 'Cardboard Box',    desc: '+1 Fish/sec',         cost: 80,          costYarn: 0,     count: 0, effect: 1,        vocabReq: 0  },
    toy:       { name: 'Feather Wand',     desc: '+4 Fish/sec',         cost: 500,         costYarn: 0,     count: 0, effect: 4,        vocabReq: 3  },
    tree:      { name: 'Cat Tree',         desc: '+15 Fish/sec',        cost: 2500,        costYarn: 0,     count: 0, effect: 15,       vocabReq: 5  },
    castle:    { name: 'Cardboard Castle', desc: '+60 Fish/sec',        cost: 12000,       costYarn: 3,     count: 0, effect: 60,       vocabReq: 9  },
    cafe:      { name: 'Cat Cafe',         desc: '+250 Fish/sec',       cost: 60000,       costYarn: 8,     count: 0, effect: 250,      vocabReq: 15 },
    shrine:    { name: 'Cat Shrine',       desc: '+1,000 Fish/sec',     cost: 400000,      costYarn: 30,    count: 0, effect: 1000,     vocabReq: 22 },
    cyber:     { name: 'Cyber-Neko',       desc: '+4,000 Fish/sec',     cost: 2000000,     costYarn: 100,   count: 0, effect: 4000,     vocabReq: 30 },
    cloud:     { name: 'Cloud Condo',      desc: '+16,000 Fish/sec',    cost: 10000000,    costYarn: 300,   count: 0, effect: 16000,    vocabReq: 40 },
    moon:      { name: 'Moon Base',        desc: '+65,000 Fish/sec',    cost: 50000000,    costYarn: 700,   count: 0, effect: 65000,    vocabReq: 52 },
    station:   { name: 'Space Station',    desc: '+260,000 Fish/sec',   cost: 250000000,   costYarn: 1500,  count: 0, effect: 260000,   vocabReq: 65 },
    galaxy:    { name: 'Cat Galaxy',       desc: '+1M Fish/sec',        cost: 1250000000,  costYarn: 4000,  count: 0, effect: 1000000,  vocabReq: 80 },
    sphere:    { name: 'Dyson Sphere',     desc: '+4M Fish/sec',        cost: 6000000000,  costYarn: 8000,  count: 0, effect: 4000000,  vocabReq: 96 },
    dimension: { name: 'Multiverse Box',   desc: '+16M Fish/sec',       cost: 30000000000, costYarn: 20000, count: 0, effect: 16000000, vocabReq: 115 },
    singularity:{ name: 'Catnip Singularity', desc: '+65M Fish/sec',    cost: 200000000000, costYarn: 50000, count: 0, effect: 65000000, vocabReq: 150 },
    yggdrasil:  { name: 'Neko Yggdrasil',   desc: '+260M Fish/sec',     cost: 1500000000000, costYarn: 120000, count: 0, effect: 260000000, vocabReq: 200 },
    litterbox:  { name: 'Cosmic Litterbox', desc: '+1B Fish/sec',       cost: 10000000000000, costYarn: 300000, count: 0, effect: 1000000000, vocabReq: 250 },
    universe:   { name: 'Purr-fect Universe', desc: '+4B Fish/sec',     cost: 80000000000000, costYarn: 750000, count: 0, effect: 4000000000, vocabReq: 300 },
    catnip:    { name: 'Catnip Garden',    desc: '+1% Idle Multiplier/lvl (total)', cost: 8000, costYarn: 0, count: 0, effect: 0.01, vocabReq: 7  },
});

const _defaultClickUpgrades = () => ({
    // Click vocab tiers: 1, 4, 8, 13, 19, 27, 36, 47, 59, 73, 88, 105
    finger:   { name: 'Cat Training',      desc: '+1 Fish/Click',      cost: 120,        costYarn: 0,    count: 0, effect: 1,       vocabReq: 1  },
    laser:    { name: 'Laser Pointer',     desc: '+4 Fish/Click',      cost: 800,        costYarn: 0,    count: 0, effect: 4,       vocabReq: 4  },
    mouse:    { name: 'Golden Mouse',      desc: '+15 Fish/Click',     cost: 4000,       costYarn: 3,    count: 0, effect: 15,      vocabReq: 8  },
    tuna:     { name: 'Tuna Treats',       desc: '+60 Fish/Click',     cost: 20000,      costYarn: 10,   count: 0, effect: 60,      vocabReq: 13 },
    collar:   { name: 'Diamond Collar',    desc: '+250 Fish/Click',    cost: 100000,     costYarn: 25,   count: 0, effect: 250,     vocabReq: 19 },
    spray:    { name: 'Catnip Spray',      desc: '+1,000 Fish/Click',  cost: 700000,     costYarn: 60,   count: 0, effect: 1000,    vocabReq: 27 },
    robot:    { name: 'Robot Arm',         desc: '+4,000 Fish/Click',  cost: 3500000,    costYarn: 150,  count: 0, effect: 4000,    vocabReq: 36 },
    keyboard: { name: 'Neko Keyboard',     desc: '+16k Fish/Click',    cost: 18000000,   costYarn: 350,  count: 0, effect: 16000,   vocabReq: 47 },
    godhand:  { name: 'God Hand',          desc: '+65k Fish/Click',    cost: 90000000,   costYarn: 700,  count: 0, effect: 65000,   vocabReq: 59 },
    hologram: { name: 'Holographic Cat',   desc: '+260k Fish/Click',   cost: 450000000,  costYarn: 2000, count: 0, effect: 260000,  vocabReq: 73 },
    quantum:  { name: 'Quantum Paw',       desc: '+1M Fish/Click',     cost: 2500000000, costYarn: 6000, count: 0, effect: 1000000, vocabReq: 88 },
    infinity: { name: 'Infinity Claw',     desc: '+4M Fish/Click',     cost: 15000000000,costYarn: 12000,count: 0, effect: 4000000, vocabReq: 105},
    astral:     { name: 'Astral Laser',    desc: '+16M Fish/Click',  cost: 100000000000, costYarn: 25000, count: 0, effect: 16000000, vocabReq: 140 },
    celestial:  { name: 'Celestial Wand',  desc: '+65M Fish/Click',  cost: 700000000000, costYarn: 65000, count: 0, effect: 65000000, vocabReq: 185 },
    godyarn:    { name: 'God of Yarn',     desc: '+260M Fish/Click', cost: 5000000000000, costYarn: 160000, count: 0, effect: 260000000, vocabReq: 240 },
    omnipotent: { name: 'Omnipotent Paw',  desc: '+1B Fish/Click',   cost: 40000000000000, costYarn: 400000, count: 0, effect: 1000000000, vocabReq: 300 },
});

const _defaultBellUpgrades = () => ({
    paw:         { name: 'Golden Paw',      desc: '+100% Click Base (additive)',          cost: 1,   count: 0, effect: 1.0   },
    tuna:        { name: 'Golden Tuna',     desc: '+100% Idle Base (additive)',           cost: 1,   count: 0, effect: 1.0   },
    scholar:     { name: 'Scholar Hat',     desc: '-10% Learn Cost',                      cost: 2,   count: 0, effect: 0.9   },
    weaver:      { name: 'Yarn Weaver',     desc: '10% Double Yarn Chance (max Lvl 10)',   cost: 3,   count: 0, effect: 0.1   },
    luck:        { name: 'Omikuji Luck',    desc: '5% Lucky Catch (×5 Fish)',             cost: 5,   count: 0, effect: 0.05  },
    purr:        { name: 'Purring Strike',  desc: '8% chance: pet makes cat happy (10s)', cost: 7,   count: 0, effect: 0.08  },
    bank:        { name: 'Maneki Bank',     desc: '+0.1% Interest/Sec',                   cost: 10,  count: 0, effect: 0.001 },
    sunspot:     { name: 'Sunspot Nap',     desc: '+15% Idle when cat is happy',          cost: 12,  count: 0, effect: 1.15  },
    discount:    { name: 'Merchant Cat',    desc: 'Upgrades 5% Cheaper',                  cost: 15,  count: 0, effect: 0.95  },
    combo_saver: { name: 'Combo Collar',    desc: 'Wrong answer: combo ÷1.5 not ÷2',      cost: 18,  count: 0, effect: 1.5   },
    warp:        { name: 'Time Warp',       desc: '+20% Global Multiplier (additive)',    cost: 40,  count: 0, effect: 0.2   },
    nap:         { name: 'Cat Nap',         desc: '+50% Passive Prod (additive)',         cost: 55,  count: 0, effect: 0.5   },
    thread:      { name: 'Golden Thread',   desc: '+50% Yarn Gain per level',             cost: 90,  count: 0, effect: 1.5   },
    loom:        { name: 'Yarn Loom',       desc: '+1/+3/+9/+27 flat Yarn per answer (×3 per level)', cost: 80,  count: 0, effect: 1     },
    auto:        { name: 'Auto-Petter',     desc: 'Auto Clicks 10x/sec',                  cost: 50,  count: 0, effect: 10    },
    echo:        { name: 'Echo Paw',        desc: 'Lucky Catch also bursts 3s of idle',   cost: 60,  count: 0, effect: 3     },
    charm:       { name: 'Lucky Charm',     desc: 'Lucky Catch deals ×10 not ×5',         cost: 75,  count: 0, effect: 1     },
    focus:       { name: 'Study Focus',     desc: '+1 Yarn per correct answer',            cost: 45,  count: 0, effect: 1     },
    sensei:      { name: 'Cat Sensei',      desc: 'Combo decays 30% slower',              cost: 120, count: 0, effect: 0.7   },
    surge:       { name: 'Fish Surge',      desc: '2% chance: click grants 30s of idle',  cost: 150, count: 0, effect: 0.02  },
});

const _defaultRebirthUpgrades = () => ({
    eternal:     { name: 'Eternal Wealth',   desc: 'Keep 5% Fish/Yarn on Ascend',        cost: 1,  count: 0, effect: 0.05 },
    wisdom:      { name: 'Divine Wisdom',    desc: '-20% Word Learn Cost',               cost: 3,  count: 0, effect: 0.8  },
    bloom:       { name: 'Spirit Bloom',     desc: 'Word bonus curve: stronger linear & quadratic boost', cost: 5, count: 0, effect: 1 },
    weaver_soul: { name: 'Soul Weaver',      desc: 'Double Yarn Gain: +×2 per level (additive)',  cost: 8,  count: 0, effect: 2    },
    starter:     { name: 'Ancestral Start',  desc: 'Start Ascend w/ 10 Boxes',           cost: 10, count: 0, effect: 10   },
    purr_soul:   { name: 'Purr Soul',        desc: 'Happy Boost lasts 3× longer',        cost: 12, count: 0, effect: 3    },
    click_words: { name: 'Word Paw',         desc: '+0.5% Click Power per word learned', cost: 14, count: 0, effect: 0.005},
    guide:       { name: 'Spirit Guide',     desc: 'Global ×2 Multiplier',              cost: 15, count: 0, effect: 2.0  },
    surge_soul:  { name: 'Surge Soul',       desc: 'Fish Surge: 60s instead of 30s',     cost: 18, count: 0, effect: 2    },
    echo_soul:   { name: 'Echo Soul',        desc: 'Echo Paw bursts 6s instead of 3s',   cost: 20, count: 0, effect: 2    },
    global_amp:  { name: 'Cosmic Amplifier', desc: '+10% to all final production',        cost: 25, count: 0, effect: 0.1  },
});

let _g = null;   // game state
let _pendingReviews =[];
let _isProcessingAnswer = false;

// Cooldown state machine variables
let _isCooldown = false;
let _cooldownEndTime = 0; 

let _isDebug = false;
let _rafId   = null;
let _saveInterval = null;
let _happyBoostEnd = 0; // timestamp until purring strike happy boost is active
let _visibilityHandler   = null;
let _beforeUnloadHandler = null;

// ─── Number Formatting ────────────────────────────────────────────────────────
// 'suffix' → 1.23 M  |  'sci' → 1.23e6
let _numFmtStyle = localStorage.getItem('neko_numfmt') || 'suffix';

const _NUM_SUFFIXES =['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd'];

function _fmtN(n) {
    n = Math.floor(n);
    if (isNaN(n) || !isFinite(n)) return '0';
    if (_numFmtStyle === 'sci') {
        if (Math.abs(n) < 10000) return n.toLocaleString();
        const exp = Math.floor(Math.log10(Math.abs(n)));
        const coeff = n / Math.pow(10, exp);
        return coeff.toFixed(2) + 'e' + exp;
    }
    // suffix style
    if (Math.abs(n) < 10000) return n.toLocaleString();
    const tier = Math.min(Math.floor(Math.log10(Math.abs(n)) / 3), _NUM_SUFFIXES.length - 1);
    const scaled = n / Math.pow(10, tier * 3);
    return scaled.toFixed(2) + ' ' + _NUM_SUFFIXES[tier];
}

function _toggleNumFmt() {
    _numFmtStyle = _numFmtStyle === 'suffix' ? 'sci' : 'suffix';
    localStorage.setItem('neko_numfmt', _numFmtStyle);
    const btn = _screens.game?.querySelector('#nk-numfmt-btn');
    if (btn) btn.textContent = _numFmtStyle === 'suffix' ? 'M' : 'e';
    _updateUI();
}

function _freshGame() {
    return {
        fish: 0, yarn: 0, bells: 0, karma: 0, transcendence: 0,
        combo: 0, // Current dojo combo
        lastTick: Date.now(),
        pauseTime: 0,       // total ms accumulated while paused
        pauseStart: null,   // timestamp when current pause began, null if not paused
        // Stats
        stats: {
            clicks: 0,
            fishEarned: 0,
            yarnEarned: 0,
            wordsLearned: 0,
            correct: 0,
            wrong: 0,
            highestCombo: 0
        },
        upgrades:        _defaultIdleUpgrades(),
        clickUpgrades:   _defaultClickUpgrades(),
        bellUpgrades:    _defaultBellUpgrades(),
        rebirthUpgrades: _defaultRebirthUpgrades(),
        srs:[],
        currentCardId: null,
        leechDojo: false,  // true when player is in leech dojo mode
    };
}

// ─── Math ─────────────────────────────────────────────────────────────────────

function _getWordBonus(words, bloomLvl) {
    const linCoeff  = bloomLvl === 0 ? 0.03 : 0.05 + (bloomLvl - 1) * 0.02;
    const quadCoeff = bloomLvl === 0 ? 1.5  : 1.5 + bloomLvl * 0.5;
    return 1 + words * linCoeff + Math.pow(words / 50, 2) * quadCoeff;
}

function _getFishPerSec() {
    let base = 0;
    for (const key in _g.upgrades) {
        if (key !== 'catnip') base += _g.upgrades[key].count * _g.upgrades[key].effect;
    }
    // Golden Tuna: +100% of base (additive) per level
    base *= (1 + _g.bellUpgrades.tuna.count * _g.bellUpgrades.tuna.effect);
    
    // Apply multiplicative bonuses
    let m = 1;
    m *= (1 + _g.upgrades.catnip.count * _g.upgrades.catnip.effect); // +1% per level, additive total
    m *= (1 + _g.bellUpgrades.warp.count * _g.bellUpgrades.warp.effect);
    m *= (1 + _g.bellUpgrades.nap.count * _g.bellUpgrades.nap.effect);
    m *= (1 + Math.log10(1 + _g.bells) * 0.2); // logarithmic bell bonus: ~+20% per decade of bells
    
    // ── Word Bonus: soft quadratic ──
    const bloomLvl   = _g.rebirthUpgrades.bloom.count;
    const activeIds  = new Set(_vocabQueue.map(v => v.id));
    const activeWords = _g.srs.filter(s => activeIds.has(s.id)).length;
    m *= _getWordBonus(activeWords, bloomLvl);

    m *= Math.pow(_g.rebirthUpgrades.guide.effect, _g.rebirthUpgrades.guide.count);

    // ── Happy Cat Logic ──
    const isHappy = _pendingReviews.length === 0 || Date.now() < _happyBoostEnd;
    const sunspotBonus = (isHappy && _g.bellUpgrades.sunspot.count > 0)
        ? Math.pow(_g.bellUpgrades.sunspot.effect, _g.bellUpgrades.sunspot.count)
        : 1;
    const moodMult = isHappy ? 1.25 : 0.75;
    
    // ── Combo Logic ──
    const comboMult = 1 + Math.log2(1 + _g.combo);

    if (_isDebug) m *= 1000;
    
    const ampBonus2 = 1 + (_g.rebirthUpgrades.global_amp?.count || 0) * (_g.rebirthUpgrades.global_amp?.effect || 0);
    return base * m * moodMult * sunspotBonus * comboMult * ampBonus2 * _getTranscendenceMult();
}

function _getClickPower() {
    let base = 1;
    for (const key in _g.clickUpgrades) base += _g.clickUpgrades[key].count * _g.clickUpgrades[key].effect;
    // Golden Paw: +100% of click base (additive) per level — click-specific
    base *= (1 + _g.bellUpgrades.paw.count * _g.bellUpgrades.paw.effect);

    // ── Shared multipliers (identical to idle) ──
    let m = 1;
    m *= (1 + _g.upgrades.catnip.count * _g.upgrades.catnip.effect);       // Catnip Garden
    m *= (1 + _g.bellUpgrades.warp.count * _g.bellUpgrades.warp.effect);   // Time Warp
    m *= (1 + _g.bellUpgrades.nap.count * _g.bellUpgrades.nap.effect);     // Cat Nap
    m *= (1 + Math.log10(1 + _g.bells) * 0.2);                             // Unspent Bells (log)

    // Word bonus (shared, bloom upgrades it)
    const bloomLvl  = _g.rebirthUpgrades.bloom.count;
    const activeIds = new Set(_vocabQueue.map(v => v.id));
    const activeWords = _g.srs.filter(s => activeIds.has(s.id)).length;
    m *= _getWordBonus(activeWords, bloomLvl);

    m *= Math.pow(_g.rebirthUpgrades.guide.effect, _g.rebirthUpgrades.guide.count); // Spirit Guide

    // Happy cat + sunspot (shared)
    const isHappy = _pendingReviews.length === 0 || Date.now() < _happyBoostEnd;
    const sunspotBonus = (isHappy && _g.bellUpgrades.sunspot.count > 0)
        ? Math.pow(_g.bellUpgrades.sunspot.effect, _g.bellUpgrades.sunspot.count) : 1;
    m *= isHappy ? 1.25 : 0.75;
    m *= sunspotBonus;

    m *= 1 + Math.log2(1 + _g.combo); // Combo (shared)

    // ── Click-specific multipliers ──
    // Word Paw rebirth bonus — click only
    if (_g.rebirthUpgrades.click_words) {
        m *= 1 + (_g.srs.length * _g.rebirthUpgrades.click_words.effect * _g.rebirthUpgrades.click_words.count);
    }

    if (_isDebug) m *= 1000;
    const ampBonus = 1 + (_g.rebirthUpgrades.global_amp?.count || 0) * (_g.rebirthUpgrades.global_amp?.effect || 0);
    return base * m * ampBonus * _getTranscendenceMult();
}

function _getMultiplierBreakdown() {
    const isHappy   = _pendingReviews.length === 0 || Date.now() < _happyBoostEnd;
    const moodMult  = isHappy ? 1.25 : 0.75;
    const comboMult = 1 + Math.log2(1 + _g.combo);

    // ── Idle base (additive upgrades + tuna additive bonus) ──
    let idleBase = 0;
    for (const key in _g.upgrades) {
        if (key !== 'catnip') idleBase += _g.upgrades[key].count * _g.upgrades[key].effect;
    }
    // Golden Tuna: +100% of base per level (shown separately for clarity)
    const tunaBonus = 1 + _g.bellUpgrades.tuna.count * _g.bellUpgrades.tuna.effect;
    idleBase *= tunaBonus;

    // ── Click base (additive upgrades + paw additive bonus) ──
    let clickBase = 1;
    for (const key in _g.clickUpgrades) clickBase += _g.clickUpgrades[key].count * _g.clickUpgrades[key].effect;
    // Golden Paw: +100% of base per level
    const pawBonus = 1 + _g.bellUpgrades.paw.count * _g.bellUpgrades.paw.effect;
    clickBase *= pawBonus;

    // ── Idle-specific multipliers ──
    const catnip  = (1 + _g.upgrades.catnip.count * _g.upgrades.catnip.effect);
    const tuna    = tunaBonus; // display the additive factor for the breakdown popup
    const warp    = 1 + (_g.bellUpgrades.warp.count * _g.bellUpgrades.warp.effect);
    const nap     = 1 + (_g.bellUpgrades.nap.count * _g.bellUpgrades.nap.effect);
    const bells   = 1 + Math.log10(1 + _g.bells) * 0.2;
    const bloomLvl   = _g.rebirthUpgrades.bloom.count;
    const _activeIds = new Set(_vocabQueue.map(v => v.id));
    const activeWords = _g.srs.filter(s => _activeIds.has(s.id)).length;
    const bloom      = _getWordBonus(activeWords, bloomLvl);
    const guide    = Math.pow(_g.rebirthUpgrades.guide.effect, _g.rebirthUpgrades.guide.count);
    const sunspot  = (isHappy && _g.bellUpgrades.sunspot.count > 0)
        ? Math.pow(_g.bellUpgrades.sunspot.effect, _g.bellUpgrades.sunspot.count) : 1;

    // ── Click-specific multipliers ──
    const paw = pawBonus; // display the additive factor (click base only)
    // click_words rebirth bonus
    const clickWords = _g.rebirthUpgrades.click_words
        ? 1 + (_g.srs.length * _g.rebirthUpgrades.click_words.effect * _g.rebirthUpgrades.click_words.count)
        : 1;

    // tuna/paw are already baked into the respective bases, don't multiply again
    // Shared multiplier set (applied to both idle and click equally)
    const sharedMult = catnip * warp * nap * bells * bloom * guide * moodMult * sunspot * comboMult;
    const idleMultTotal  = sharedMult; // idle has no extra mult beyond shared
    const clickMultTotal = sharedMult * clickWords;
    const globalAmp = 1 + (_g.rebirthUpgrades.global_amp?.count || 0) * (_g.rebirthUpgrades.global_amp?.effect || 0);

    return {
        isHappy, moodMult, comboMult, activeWords, globalAmp, bloomLvl,
        idle:  { base: idleBase,  catnip, tuna, warp, nap, bells, bloom, sunspot, guide, multTotal: idleMultTotal,  finalFps:   idleBase  * idleMultTotal * globalAmp },
        click: { base: clickBase, paw, catnip, warp, nap, bells, bloom, sunspot, guide, clickWords, multTotal: clickMultTotal, finalClick: clickBase * clickMultTotal * globalAmp },
    };
}

function _getLearnCost() {
    // Linear scaling: 100 + n × 300
    const n      = _g.srs.filter(s => new Set(_vocabQueue.map(v=>v.id)).has(s.id)).length;
    const base   = 100 + (n * 300);
    const scholar = Math.pow(_g.bellUpgrades.scholar.effect, _g.bellUpgrades.scholar.count);
    const wisdom  = Math.pow(_g.rebirthUpgrades.wisdom.effect, _g.rebirthUpgrades.wisdom.count);
    return Math.max(50, Math.floor(base * scholar * wisdom));
}

// Bell upgrade cost — most upgrades use a gentle +1/level linear bump (cost+count).
// 'thread' and 'loom' use steep exponential scaling to make later levels meaningful.
const _BELL_EXP_UPGRADES = { thread: 1.65, loom: 1.7 };
function _bellCost(key, upg) {
    const exp = _BELL_EXP_UPGRADES[key];
    if (exp) return Math.round(upg.cost * Math.pow(exp, upg.count));
    return upg.cost + upg.count;
}

function _calcBells()   { return _g.fish < 50000   ? 0 : Math.floor(Math.pow(_g.fish  / 50000, 0.5)); }
function _calcSpirits() { return _g.bells < 100     ? 0 : Math.floor(_g.bells / 50); }

// Transcendence requires 500 spirits per tier (1st = 500, 2nd = 1000, etc.)
// Each Transcendence costs more to create meaningful late-game gates
function _calcTranscendenceCost() { return 5000 * (_g.transcendence + 1); }
function _canTranscend() { return _g.karma >= _calcTranscendenceCost(); }

// Transcendence multiplier: ×1.5 per stack, applied to all production
function _getTranscendenceMult() { return Math.pow(1.5, _g.transcendence); }

// Format numbers for the topbar — max 4 chars (e.g. 1234, 1.2K, 1.2e5)
function _fmtShort(n) {
    n = Math.floor(n);
    if (isNaN(n) || !isFinite(n)) return '0';
    if (n < 10000) return n.toLocaleString();
    const exp = Math.floor(Math.log10(n));
    const coeff = (n / Math.pow(10, exp)).toFixed(1);
    return coeff + 'e' + exp;
}

// ─── Helper: Time Formatter ───────────────────────────────────────────────────

function _formatTime(sec) {
    if (sec <= 0) return 'Ready';
    if (sec < 60) return Math.floor(sec) + 's';
    if (sec < 3600) return Math.floor(sec/60) + 'm ' + Math.floor(sec%60) + 's';
    if (sec < 86400) return Math.floor(sec/3600) + 'h ' + Math.floor((sec%3600)/60) + 'm';
    return Math.floor(sec/86400) + 'd ' + Math.floor((sec%86400)/3600) + 'h';
}

// ─── Pause ────────────────────────────────────────────────────────────────────

function _isPaused() { return _g.pauseStart !== null; }

// Returns the effective "now" from the game's perspective:
// all SRS dueTimes were stored relative to real time, so when paused we shift
// them forward as pause accumulates. Easier: compare against (realNow - pauseTime).
function _gameNow() {
    const extraPause = _isPaused() ? (Date.now() - _g.pauseStart) : 0;
    return Date.now() - (_g.pauseTime + extraPause);
}

function _togglePause() {
    if (_isPaused()) {
        // Unpause: accumulate pause duration and clear pauseStart
        _g.pauseTime  += Date.now() - _g.pauseStart;
        _g.pauseStart  = null;
        // Advance lastTick so the loop doesn't think time passed while paused
        _g.lastTick    = Date.now();
    } else {
        // Pause
        _g.pauseStart = Date.now();
    }
    _updateUI();
    _updatePauseBtn();
    _saveGame(false);
}

function _updatePauseBtn() {
    const btn     = _screens.game?.querySelector('#nk-pause-btn');
    const overlay = _screens.game?.querySelector('#nk-pause-overlay');
    if (btn) {
        if (_isPaused()) {
            btn.textContent = '▶';
            btn.title = 'Resume';
            btn.style.background = '#e17055';
            btn.style.color = 'white';
        } else {
            btn.textContent = '⏸';
            btn.title = 'Pause';
            btn.style.background = '';
            btn.style.color = '';
        }
    }
    if (overlay) overlay.style.display = _isPaused() ? 'flex' : 'none';
}



function _saveGame(manual = false) {
    _g.lastTick = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(_g));
    if (manual) _toast('Saved!', 'var(--nk-success)');
}

function _loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { _g = _freshGame(); return; }
    try {
        const p = JSON.parse(raw);
        _g = _freshGame();
        _g.fish  = p.fish  || 0;
        _g.yarn  = p.yarn  || 0;
        _g.bells = p.bells || 0;
        _g.karma = p.karma || 0;
        _g.transcendence = p.transcendence || 0;
        _g.combo = p.combo || 0;
        _g.srs   = p.srs   ||[];
        _g.leechDojo = p.leechDojo || false;
        _g.pauseTime  = p.pauseTime  || 0;
        // Restore pause state: if was paused when closed, stay paused on reload.
        // We accumulate the time spent closed into pauseTime so the game clock
        // doesn't drift, then leave pauseStart set so the game resumes paused.
        if (p.pauseStart !== null && p.pauseStart !== undefined) {
            // Was paused when closed — keep it paused (player must manually resume)
            _g.pauseStart  = Date.now(); // fresh start timestamp, pause continues
            _g._autoPaused = false;      // manual pause, not auto
        } else {
            _g.pauseStart  = null;
            _g._autoPaused = false;
        }
        
        if (p.stats) _g.stats = { ..._g.stats, ...p.stats };

        ['upgrades','clickUpgrades','bellUpgrades','rebirthUpgrades'].forEach(type => {
            if (p[type]) {
                for (const k in p[type]) {
                    if (_g[type][k]) _g[type][k].count = p[type][k].count || 0;
                }
            }
        });

        // Do NOT filter _g.srs here — words outside current vocab set are kept
        // in the save and simply skipped at review time. Filtering here would
        // permanently destroy progress whenever the vocab set changes.

    } catch { _g = _freshGame(); }
}

// ─── Game Loop ────────────────────────────────────────────────────────────────

function _startGameLoop() {
    if (_rafId) cancelAnimationFrame(_rafId);
    if (_saveInterval) clearInterval(_saveInterval);

    _saveInterval = setInterval(() => _saveGame(false), 10000);

    // Pause when tab/app goes to background or is closed
    function _handleVisibilityChange() {
        if (document.hidden && !_isPaused()) {
            _g.pauseStart = Date.now();
            _g._autoPaused = true;
            _saveGame(false);
        } else if (!document.hidden && _isPaused() && _g._autoPaused) {
            _g.pauseTime  += Date.now() - _g.pauseStart;
            _g.pauseStart  = null;
            _g._autoPaused = false;
            _g.lastTick    = Date.now();
        } else if (!document.hidden && _isPaused() && !_g._autoPaused) {
            // Manual pause — re-entering the app: force the overlay visible
            _updatePauseBtn();
        }
    }
    function _handleBeforeUnload() {
        if (!_isPaused()) {
            _g.pauseStart = Date.now();
            _g._autoPaused = true;
        }
        _saveGame(false);
    }
    document.addEventListener('visibilitychange', _handleVisibilityChange);
    window.addEventListener('beforeunload', _handleBeforeUnload);
    // Store refs for cleanup
    _visibilityHandler  = _handleVisibilityChange;
    _beforeUnloadHandler = _handleBeforeUnload;

    function loop() {
        if (!_screens.game || _screens.game.style.display === 'none') {
            _rafId = requestAnimationFrame(loop);
            return;
        }

        const now   = Date.now();

        // While paused: update lastTick so we don't accumulate delta, then skip
        if (_isPaused()) {
            _g.lastTick = now;
            _updateUI();
            _rafId = requestAnimationFrame(loop);
            return;
        }

        const delta = (now - _g.lastTick) / 1000;
        _g.lastTick = now;

        // Auto-petter
        const autoClicks = _g.bellUpgrades.auto.count * _g.bellUpgrades.auto.effect;
        if (autoClicks > 0) {
            const gain = (_getClickPower() * autoClicks) * delta;
            _g.fish += gain;
            _g.stats.fishEarned += gain;
        }

        // Combo Decay: only when cards are due AND player is not in cooldown (actively ignoring the queue)
        // Frozen while: no cards due (cat napping) OR between-card cooldown pause
        if (_g.combo > 0 && _pendingReviews.length > 0 && !_isCooldown) {
            const senseiMod = _g.bellUpgrades.sensei.count > 0
                ? Math.pow(_g.bellUpgrades.sensei.effect, _g.bellUpgrades.sensei.count)
                : 1;
            const decayRate = (0.1 + (_g.combo * 0.05)) * senseiMod;
            _g.combo = Math.max(0, _g.combo - (decayRate * delta));
        }

        // Passive income
        const fps    = _getFishPerSec();
        let earned   = fps * delta;

        // Bank Interest
        const interestRate = _g.bellUpgrades.bank.count * _g.bellUpgrades.bank.effect;
        if (interestRate > 0 && _pendingReviews.length === 0) earned += (_g.fish * interestRate) * delta;

        _g.fish += earned;
        _g.stats.fishEarned += earned;

        // Ensure SRS updates without disrupting cooldown animations
        if (Math.floor(now / 1000) % 2 === 0) _updateSRSQueue();

        // ── Update Dojo Timers ──
        if (_pendingReviews.length === 0) {
            const nextTimer = document.getElementById('nk-next-review-timer');
            const wakeupPill  = _screens.game?.querySelector('#nk-wakeup-pill');
            const wakeupLabel = _screens.game?.querySelector('#nk-wakeup-label');
            const wakeupBar   = _screens.game?.querySelector('#nk-wakeup-bar');

            if (_g.srs.length > 0) {
                const activeIds = new Set(_vocabQueue.map(v => v.id));
                const activeSrs = _g.srs.filter(s => activeIds.has(s.id));
                const next = activeSrs.length > 0 ? Math.min(...activeSrs.map(s => s.nextReview)) : Infinity;
                const diffSec = (next - _gameNow()) / 1000;

                if (nextTimer) {
                    nextTimer.textContent = diffSec <= 0 ? "Cat is waking up..." : `Next cat in: ${_formatTime(diffSec)}`;
                    nextTimer.style.minWidth = '180px'; // prevent width jump
                }

                // Wakeup countdown pill: show in last 10 seconds
                if (wakeupPill && wakeupLabel && wakeupBar) {
                    if (diffSec > 0 && diffSec <= 20) {
                        wakeupPill.style.display = 'flex';
                        wakeupLabel.textContent = `🐱 ${Math.ceil(diffSec)}s`;
                        const pct = (diffSec / 20) * 100; // full at 20s, empty at 0s
                        wakeupBar.style.width = pct + '%';
                        // Color shifts: green at 10s → red at 0s
                        const hue = Math.round(diffSec * 6); // 0s=0 (red) → 20s=120 (green)
                        wakeupBar.style.background = `hsl(${hue}, 80%, 48%)`;
                    } else {
                        wakeupPill.style.display = 'none';
                    }
                }
            } else {
                if (nextTimer) nextTimer.textContent = "Learn a word to start!";
                const wakeupPill = _screens.game?.querySelector('#nk-wakeup-pill');
                if (wakeupPill) wakeupPill.style.display = 'none';
            }
        } else {
            // Hide wakeup pill when cats are already hungry
            const wakeupPill = _screens.game?.querySelector('#nk-wakeup-pill');
            if (wakeupPill) wakeupPill.style.display = 'none';
        }

        _updateUI();
        _rafId = requestAnimationFrame(loop);
    }
    _rafId = requestAnimationFrame(loop);
}

function _stopGameLoop() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_saveInterval) { clearInterval(_saveInterval); _saveInterval = null; }
    if (_visibilityHandler)   { document.removeEventListener('visibilitychange', _visibilityHandler);   _visibilityHandler   = null; }
    if (_beforeUnloadHandler) { window.removeEventListener('beforeunload', _beforeUnloadHandler); _beforeUnloadHandler = null; }
}

// ─── Interactions ─────────────────────────────────────────────────────────────

function _petCat(e) {
    let power    = _getClickPower();
    let isLucky  = false;
    const luckChance = _g.bellUpgrades.luck.count * _g.bellUpgrades.luck.effect;
    if (Math.random() < luckChance) {
        const mult = _g.bellUpgrades.charm.count > 0 ? 10 : 5;
        power   *= mult;
        isLucky  = true;
    }
    _g.fish += power;
    _g.stats.fishEarned += power;
    _g.stats.clicks++;

    _spawnFloatingText(e.clientX, e.clientY, `+${_fmtN(power)}`, isLucky ? '#ff9900' : null, isLucky ? 24 : 18);
    if (isLucky) setTimeout(() => _spawnFloatingText(e.clientX, e.clientY - 30, '🎣 Lucky!', '#ff9900', 13), 80);

    // Echo Paw: lucky catch also bursts N seconds of idle
    if (isLucky && _g.bellUpgrades.echo.count > 0) {
        const echoSec = _g.bellUpgrades.echo.effect * (_g.rebirthUpgrades.echo_soul?.count > 0 ? _g.rebirthUpgrades.echo_soul.effect : 1);
        const burst   = _getFishPerSec() * echoSec;
        _g.fish += burst;
        _g.stats.fishEarned += burst;
        setTimeout(() => _spawnFloatingText(e.clientX, e.clientY - 50, `⚡+${_fmtN(burst)}`, '#a29bfe', 13), 120);
    }

    // Fish Surge: chance to burst 30s (or 60s) of idle
    const surgeChance = _g.bellUpgrades.surge?.count > 0 ? _g.bellUpgrades.surge.effect : 0;
    if (surgeChance > 0 && Math.random() < surgeChance) {
        const surgeSec = 30 * (_g.rebirthUpgrades.surge_soul?.count > 0 ? _g.rebirthUpgrades.surge_soul.effect : 1);
        const burst    = _getFishPerSec() * surgeSec;
        _g.fish += burst;
        _g.stats.fishEarned += burst;
        setTimeout(() => _spawnFloatingText(e.clientX, e.clientY - 55, `🌊 Surge! +${_fmtN(burst)}`, '#0984e3', 14), 160);
    }

    // Purring Strike: chance to grant Happy Boost (forces happy mood for N seconds)
    const purrChance = _g.bellUpgrades.purr.count * _g.bellUpgrades.purr.effect;
    if (purrChance > 0 && Math.random() < purrChance) {
        const boostSec = 10 * (_g.rebirthUpgrades.purr_soul?.count > 0 ? _g.rebirthUpgrades.purr_soul.effect : 1);
        _happyBoostEnd = Date.now() + boostSec * 1000;
        setTimeout(() => _spawnFloatingText(e.clientX, e.clientY - 55, `😻 Happy! ${boostSec}s`, 'var(--nk-success)', 14), 160);
    }

    _updateUI();
}

function _spawnFloatingText(x, y, text, color, fontSize = 18) {
    const wrap = _screens.game; 
    if (!wrap) return;
    
    const fx = document.createElement('div');
    fx.className  = 'nk-click-effect';
    fx.textContent = text;
    fx.style.left = (x - 20) + 'px';
    fx.style.top  = (y - 40) + 'px';
    fx.style.position = 'fixed'; 
    fx.style.zIndex = '9999';
    fx.style.color = color || 'var(--nk-btn)';
    fx.style.fontSize = fontSize + 'px';
    
    wrap.appendChild(fx);
    setTimeout(() => fx.remove(), 1000);
}

function _buyUpgrade(shopType, key) {
    const shop = _g[shopType];
    const upg  = shop[key];

    if (shopType === 'bellUpgrades') {
        // Cap weaver at level 10 (10% × 10 = 100% max double yarn chance)
        if (key === 'weaver' && upg.count >= 10) {
            _toast('Yarn Weaver is maxed! (100% chance)', 'var(--nk-success)');
            return;
        }
        const cost = _bellCost(key, upg);
        if (_g.bells >= cost) { _g.bells -= cost; upg.count++; _updateUI(); }
    } else if (shopType === 'rebirthUpgrades') {
        const cost = upg.cost * Math.pow(2, upg.count);
        if (_g.karma >= cost) { _g.karma -= cost; upg.count++; _updateUI(); }
    } else {
        const discount = Math.pow(_g.bellUpgrades.discount.effect, _g.bellUpgrades.discount.count);
        // Catnip Garden: yarn cost = next level number (level 1 costs 1 yarn, level 15 costs 15 yarn, etc.)
        const isLevelScaledYarn = (key === 'catnip' && shopType === 'upgrades');
        const rawYarnCost = isLevelScaledYarn ? (upg.count + 1) : (upg.costYarn || 0);
        const costFish = Math.floor(upg.cost * Math.pow(1.18, upg.count) * discount);
        const costYarn = Math.floor(rawYarnCost * discount);
        const vocabReq = upg.vocabReq || 0;
        const activeCount = _g.srs.filter(s => new Set(_vocabQueue.map(v => v.id)).has(s.id)).length;
        if (activeCount < vocabReq) {
            _toast(`Needs ${vocabReq} active words (have ${activeCount})`, '#e17055');
            return;
        }
        if (_g.fish >= costFish && _g.yarn >= costYarn) {
            _g.fish -= costFish;
            _g.yarn -= costYarn;
            upg.count++;
            _updateUI();
        }
    }
}

function _ascend() {
    const earned = _calcBells();
    if (earned <= 0) { alert('Need 50,000 Fish to Ascend!'); return; }
    if (!confirm(`Ascend for +${_fmtN(earned)} 🔔? Resets Fish/Yarn/Basic Upgrades.`)) return;
    const keep = _g.rebirthUpgrades.eternal.count * _g.rebirthUpgrades.eternal.effect;
    _g.bells += earned;
    _g.fish   = Math.floor(_g.fish * keep);
    _g.yarn   = Math.floor(_g.yarn * keep);
    for (const k in _g.upgrades)      _g.upgrades[k].count      = 0;
    for (const k in _g.clickUpgrades) _g.clickUpgrades[k].count = 0;
    if (_g.rebirthUpgrades.starter.count > 0) _g.upgrades.box.count = 10;
    _saveGame();
    _updateUI();
    _toast(`Ascended! +${_fmtN(earned)} Bells`, 'var(--nk-gold)');
}

function _rebirth() {
    const earned = _calcSpirits();
    if (earned <= 0) { alert('Need 100 Bells to Rebirth!'); return; }
    if (!confirm(`REBIRTH? Reset EVERYTHING (including Bells) for +${_fmtN(earned)} 👻 Spirits?`)) return;
    _g.karma += earned;
    _g.fish   = 0;
    _g.yarn   = 0;
    _g.bells  = 0;
    _g.combo  = 0;
    for (const k in _g.upgrades)        _g.upgrades[k].count        = 0;
    for (const k in _g.clickUpgrades)   _g.clickUpgrades[k].count   = 0;
    for (const k in _g.bellUpgrades)    _g.bellUpgrades[k].count     = 0;
    if (_g.rebirthUpgrades.starter.count > 0) _g.upgrades.box.count = 10;
    _saveGame();
    _updateUI();
    _switchTab('rebirth');
    _toast(`REBIRTH! +${_fmtN(earned)} Spirits`, 'var(--nk-spirit)');
}

function _transcend() {
    const cost = _calcTranscendenceCost();
    if (_g.karma < cost) { alert(`Need ${_fmtN(cost)} 👻 Spirits to Transcend!`); return; }
    const nextMult = Math.pow(1.5, _g.transcendence + 1);
    if (!confirm(`TRANSCEND? Spend ${_fmtN(cost)} Spirits to reset EVERYTHING and gain ✦${_g.transcendence + 1} (×${nextMult.toFixed(2)} to all production)?`)) return;
    _g.karma -= cost;
    _g.transcendence++;
    _g.fish  = 0;
    _g.yarn  = 0;
    _g.bells = 0;
    _g.combo = 0;
    for (const k in _g.upgrades)        _g.upgrades[k].count        = 0;
    for (const k in _g.clickUpgrades)   _g.clickUpgrades[k].count   = 0;
    for (const k in _g.bellUpgrades)    _g.bellUpgrades[k].count     = 0;
    for (const k in _g.rebirthUpgrades) _g.rebirthUpgrades[k].count = 0;
    if (_g.rebirthUpgrades.starter.count > 0) _g.upgrades.box.count = 10;
    _saveGame();
    _updateUI();
    _switchTab('click');
    _toast(`✦ TRANSCENDED! ×${_getTranscendenceMult().toFixed(2)} to all production!`, '#f9ca24');
}

function _banWord(word) {
    if (!confirm(`Ban "${word}"? It will stop appearing in the Dojo.`)) return;
    
    const banned = JSON.parse(localStorage.getItem(BANNED_KEY)) ||[];
    if (!banned.includes(word)) {
        banned.push(word);
        localStorage.setItem(BANNED_KEY, JSON.stringify(banned));
    }

    const qWord = _vocabQueue.find(v => v.kanji === word);
    if (qWord) {
        _g.srs = _g.srs.filter(s => s.id !== qWord.id);
        if (_g.currentCardId === qWord.id) _g.currentCardId = null;
    }
    
    _updateSRSQueue();
    _renderStats(); 
    _toast(`Banned "${word}"`, '#ff4b4b');
}

// ─── Leech Mechanic ──────────────────────────────────────────────────────────

function _getLeechThreshold() { return _getCfg('leechThreshold', 20); }

/** Return true if the SRS item has hit the leech threshold */
function _isLeech(srsItem) {
    return (srsItem.wrongCount || 0) >= _getLeechThreshold();
}

/** Mark a word as a leech manually (from dojo "Leech" button) */
function _markLeech(wordId) {
    const srsItem = _g.srs.find(s => s.id === wordId);
    if (!srsItem) return;
    const threshold = _getLeechThreshold();
    if ((srsItem.wrongCount || 0) < threshold) {
        srsItem.wrongCount = threshold; // force to threshold so it shows as leech
    }
    _g.currentCardId = null;
    _updateSRSQueue();
    _updateUI();
    const wordData = _vocabQueue.find(v => v.id === wordId);
    _toast(`🩸 "${wordData?.kanji || wordId}" marked as Leech`, '#e17055');
}

/** Remove leech flag and restart with start interval */
function _unleechWord(wordId) {
    const srsItem = _g.srs.find(s => s.id === wordId);
    if (!srsItem) return;
    srsItem.wrongCount = 0;
    srsItem.interval   = _getCfg('interval', 8);
    srsItem.ease       = _getCfg('ease', 1.5);
    srsItem.nextReview = _gameNow();
    _updateSRSQueue();
    _updateUI();
    const wordData = _vocabQueue.find(v => v.id === wordId);
    _toast(`✅ "${wordData?.kanji || wordId}" unleached — back in normal Dojo!`, 'var(--nk-success)');
}

/** Get all leeched SRS items */
function _getLeechedItems() {
    return _g.srs.filter(s => _isLeech(s));
}

/** Switch to/from leech dojo mode */
function _setLeechMode(on) {
    _g.leechDojo = on;
    _g.currentCardId = null;
    _updateSRSQueue();
    _updateUI();
}

/** Update the leech bar visibility and button states in the dojo tab */
function _updateLeechDojoBtn() {
    const g = _screens.game;
    if (!g) return;
    const leechBar      = g.querySelector('#nk-leech-bar');
    const leechBtn      = g.querySelector('#nk-leech-dojo-btn');
    const normalBtn     = g.querySelector('#nk-normal-dojo-btn');
    const modeLabel     = g.querySelector('#nk-leech-mode-label');
    const leechBadge    = g.querySelector('#nk-leech-count-badge');

    const leechCount = _getLeechedItems().length;

    if (!leechBar) return;

    // Show bar whenever there are leeches or we're in leech mode
    if (leechCount > 0 || _g.leechDojo) {
        leechBar.style.display = 'block';
    } else {
        leechBar.style.display = 'none';
    }

    if (leechBadge) leechBadge.textContent = leechCount;

    if (_g.leechDojo) {
        if (leechBtn)  { leechBtn.style.display = 'none'; }
        if (normalBtn) { normalBtn.style.display = 'inline-flex'; }
        if (modeLabel) { modeLabel.style.display = 'block'; }
    } else {
        if (leechBtn)  { leechBtn.style.display = 'inline-flex'; }
        if (normalBtn) { normalBtn.style.display = 'none'; }
        if (modeLabel) { modeLabel.style.display = 'none'; }
    }
}



function _learnNewWord() {
    const cost = _getLearnCost();
    if (_g.fish < cost) { _toast('Not enough fish!', '#ff6b6b'); return; }

    const learnedIds = new Set(_g.srs.map(s => s.id));
    // Only offer words from the current active queue that aren't already in SRS
    // (dormant words from old sessions are already in learnedIds and are excluded)
    const available  = _vocabQueue.filter(v => !learnedIds.has(v.id));
    if (available.length === 0) { _toast('All words learned!', 'var(--nk-success)'); return; }

    _g.fish -= cost;
    const w = available[0];
    _g.srs.push({ id: w.id, nextReview: _gameNow(), interval: _getCfg('interval', 8), ease: _getCfg('ease', 1.5) });
    
    _g.stats.wordsLearned++;
    _updateSRSQueue();
    _updateUI();
}

function _updateSRSQueue() {
    const now    = _gameNow();
    const _activeIds = new Set(_vocabQueue.map(v => v.id));

    if (_g.leechDojo) {
        // Leech dojo: only leech items, always available (no time gate)
        _pendingReviews = _g.srs.filter(s => _activeIds.has(s.id) && _isLeech(s));
    } else {
        // Normal dojo: exclude leeches, only due items
        _pendingReviews = _g.srs.filter(s => _activeIds.has(s.id) && !_isLeech(s) && s.nextReview <= now);
    }

    const pendingEl  = _screens.game?.querySelector('.nk-pending-count');
    
    if (pendingEl) pendingEl.textContent = _pendingReviews.length;

    const sleepScrn = _screens.game?.querySelector('#nk-dojo-sleep');
    const coolScrn  = _screens.game?.querySelector('#nk-dojo-cooldown');
    const quizScrn  = _screens.game?.querySelector('#nk-dojo-quiz');

    if (!sleepScrn || !quizScrn) return;

    sleepScrn.style.display = 'none';
    if (coolScrn) coolScrn.style.display = 'none'; // always hidden — no wait time
    quizScrn.style.display = 'none';

    if (_pendingReviews.length > 0) {
        quizScrn.style.display = 'flex';
        if (!_g.currentCardId) _loadFlashcard();
    } else {
        sleepScrn.style.display = 'flex';
        _g.currentCardId = null;
    }

    // Update leech dojo button visibility in sleep screen
    _updateLeechDojoBtn();
}

function _loadFlashcard() {
    if (!_pendingReviews.length) return;
    _isProcessingAnswer = false;
    const srsItem     = _pendingReviews[0];
    _g.currentCardId  = srsItem.id;
    const correct     = _vocabQueue.find(v => v.id === srsItem.id);
    if (!correct) return;

    const kanjiEl = _screens.game?.querySelector('.nk-fc-kanji');
    const furiEl  = _screens.game?.querySelector('.nk-fc-furi');
    const gridEl  = _screens.game?.querySelector('.nk-quiz-grid');
    const leechActionsEl = _screens.game?.querySelector('#nk-quiz-leech-actions');
    if (!kanjiEl || !gridEl) return;

    kanjiEl.textContent = correct.kanji; 
    if (furiEl) furiEl.textContent = correct.kana;

    // In leech dojo: distractors come from the leech pool only for relevant confusions
    // In normal dojo: distractors come from full vocab pool
    const leechIds = new Set(_getLeechedItems().map(s => s.id));
    let pool;
    if (_g.leechDojo && leechIds.size >= 4) {
        // Prefer other leeches as distractors — they're the confusing ones
        pool = _vocabQueue.filter(v => v.id !== correct.id && leechIds.has(v.id));
    } else {
        pool = _vocabQueue.filter(v => v.id !== correct.id);
    }
    const distractors = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options     = [...distractors, correct].sort(() => 0.5 - Math.random());

    gridEl.innerHTML = '';
    options.forEach(opt => {
        const btn       = document.createElement('button');
        btn.className   = 'nk-quiz-btn';
        btn.textContent = opt.eng;
        btn.addEventListener('click', (e) => _checkAnswer(opt.id, btn, correct.id, e));
        gridEl.appendChild(btn);
    });

    // Show/hide leech action buttons
    if (leechActionsEl) {
        if (_g.leechDojo) {
            // In leech dojo: show unleech button
            leechActionsEl.innerHTML = `
                <button class="nk-leech-action-btn nk-unleech-btn" id="nk-unleech-word-btn">
                    ✅ Unleech — back to Dojo
                </button>`;
            leechActionsEl.querySelector('#nk-unleech-word-btn')
                .addEventListener('click', () => _unleechWord(_g.currentCardId));
        } else {
            // In normal dojo: show "mark as leech" button
            leechActionsEl.innerHTML = `
                <button class="nk-leech-action-btn nk-mark-leech-btn" id="nk-mark-leech-word-btn">
                    🩸 Mark as Leech
                </button>`;
            leechActionsEl.querySelector('#nk-mark-leech-word-btn')
                .addEventListener('click', () => _markLeech(_g.currentCardId));
        }
    }
}

function _checkAnswer(selectedId, btnEl, correctId, event) {
    if (_isProcessingAnswer) return;
    _isProcessingAnswer = true;

    const srsItem = _g.srs.find(s => s.id === _g.currentCardId);

    if (selectedId === correctId) {
        // Correct
        btnEl.classList.add('nk-quiz-correct');
        
        let yarn = 1;
        if (Math.random() < (_g.bellUpgrades.weaver.count * _g.bellUpgrades.weaver.effect)) yarn *= 2;
        if (_g.bellUpgrades.thread.count > 0) yarn = Math.ceil(yarn * Math.pow(_g.bellUpgrades.thread.effect, _g.bellUpgrades.thread.count));
        if (_g.rebirthUpgrades.weaver_soul.count > 0) yarn *= (1 + _g.rebirthUpgrades.weaver_soul.count); // ×2, ×3, ×4... (additive +1 per lvl)
        if (_g.bellUpgrades.focus.count > 0) yarn += _g.bellUpgrades.focus.count;
        if (_g.bellUpgrades.loom?.count > 0) yarn += _g.bellUpgrades.loom.effect * Math.pow(3, _g.bellUpgrades.loom.count - 1);
        yarn = Math.ceil(yarn * _getTranscendenceMult());

        // Leech dojo: yarn reward is /10 (minimum 1)
        if (_g.leechDojo) yarn = Math.max(1, Math.floor(yarn / 10));
        
        _g.yarn += yarn;
        _g.combo += 1;
        if (_g.combo > _g.stats.highestCombo) _g.stats.highestCombo = _g.combo;
        _g.stats.correct++;
        _g.stats.yarnEarned += yarn;

        // Interval math in seconds — use game clock so pause doesn't cause drift
        // In leech dojo: correct answer reduces wrongCount but doesn't unleech automatically
        if (_g.leechDojo) {
            srsItem.wrongCount = Math.max(0, (srsItem.wrongCount || 0) - 1);
            // Give it a short review interval so it comes back quickly
            srsItem.interval   = Math.max(srsItem.interval, _getCfg('interval', 8));
            srsItem.nextReview = _gameNow() + srsItem.interval * 1000;
        } else {
            srsItem.interval   = Math.round(srsItem.interval * srsItem.ease);
            srsItem.nextReview = _gameNow() + srsItem.interval * 1000;
        }

        if (event) {
            const label = _g.leechDojo ? `+${yarn} 🧶 (leech)` : `+${yarn} 🧶`;
            _spawnFloatingText(event.clientX, event.clientY, label, _g.leechDojo ? '#e17055' : 'var(--nk-success)', 22);
        }

        // Brief visual pause so player sees the green highlight, then move on
        _g.currentCardId = null;
        _isCooldown = false;
        setTimeout(() => {
            _updateSRSQueue();
            _updateUI();
        }, 400);

    } else {
        // Wrong
        btnEl.classList.add('nk-quiz-wrong');
        srsItem.interval   = 15; // Reset to 15 seconds
        srsItem.ease       = Math.max(1.3, srsItem.ease - 0.2);
        srsItem.nextReview = _gameNow() + 15000;
        srsItem.wrongCount = (srsItem.wrongCount || 0) + 1;

        const comboDiv = _g.bellUpgrades.combo_saver.count > 0 ? 1.5 : 2;
        _g.combo = Math.floor(_g.combo / comboDiv);
        _g.stats.wrong++;

        // Auto-leech if threshold hit
        const threshold = _getLeechThreshold();
        if (srsItem.wrongCount === threshold) {
            const wordData = _vocabQueue.find(v => v.id === srsItem.id);
            _toast(`🩸 "${wordData?.kanji || srsItem.id}" became a Leech! (${threshold} fails)`, '#e17055');
        }

        if (event) _spawnFloatingText(event.clientX, event.clientY, `❌`, '#ff4b4b', 28);

        // Brief visual pause so player sees the red highlight, then move on
        setTimeout(() => {
            _g.currentCardId = null;
            _isCooldown = false;
            _updateSRSQueue();
            _updateUI();
        }, 600);
    }
}

// ─── DOM Construction ─────────────────────────────────────────────────────────

function _initGameDOM() {
    const el = _screens.game;
    if (!el) return;

    const showSpirit = (_g.karma > 0 || _g.bells > 50);

    el.innerHTML = `
<div class="nk-root">

    <div class="nk-topbar">
        <div class="nk-topbar-title">🐾 <span id="nk-transcendence-badge" style="display:none; font-size:13px; font-weight:bold; color:#f9ca24; letter-spacing:0.5px;"></span></div>
        <div class="nk-topbar-btns">
            <button class="nk-hbtn nk-hbtn-transcend" id="nk-transcend-btn" title="Transcend" style="display:none;">✦</button>
            <button class="nk-hbtn nk-hbtn-fmt" id="nk-numfmt-btn" title="Toggle number format">M</button>
            <button class="nk-hbtn" id="nk-pause-btn" title="Pause">⏸</button>
            <button class="nk-hbtn nk-hbtn-gold" id="nk-ascend-btn" title="Ascend">⬆</button>
            <button class="nk-hbtn nk-hbtn-spirit" id="nk-rebirth-btn" title="Rebirth" style="display:${showSpirit?'inline-block':'none'};">♻</button>
            <button class="nk-hbtn" id="nk-save-btn" title="Save">💾</button>
            <button class="nk-hbtn nk-hbtn-wipe" id="nk-wipe-btn" title="Wipe progress">🗑</button>
            <button class="nk-hbtn nk-hbtn-danger" id="nk-quit-btn" title="Quit">✕</button>
        </div>
    </div>

    <!-- Stats Header with Clicker Cat -->
    <div class="nk-stats-header">
        <div id="nk-cat" class="nk-header-cat">🐱</div>
        <div class="nk-stats-wrapper">
            <!-- Row 1: resource pills, fixed width so nothing jumps -->
            <div class="nk-stat-row-top">
                <div class="nk-stat-pill">🐟 <span class="nk-val-fish">0</span></div>
                <div class="nk-stat-pill">🧶 <span class="nk-val-yarn">0</span></div>
                <div class="nk-stat-pill nk-bell-color">🔔 <span class="nk-val-bells">0</span></div>
                <div class="nk-stat-pill nk-spirit-color" id="nk-karma-pill" style="display:${showSpirit?'flex':'none'};">👻 <span class="nk-val-karma">0</span></div>
            </div>
            <!-- Row 2 (sub-line): /s · /cl · 📚 · 🔥 · ×mult · 🐱hungry -->
            <div class="nk-stat-sub">
                <span class="nk-val-fps">0</span>/s
                <span class="nk-stat-sep">·</span>
                <span class="nk-val-cpc">1</span>/cl
                <span class="nk-stat-sep">·</span>
                📚<span class="nk-val-wordcount">0</span>
                <span class="nk-stat-sep">·</span>
                🔥<span class="nk-val-combo" title="Combo: each correct answer builds your combo. Higher combo = more fish production. Wrong answer halves it.">0</span>
                <span class="nk-stat-sep">·</span>
                <button id="nk-mult-btn" class="nk-mult-btn" title="Click for multiplier breakdown">×1.00</button>
                <span id="nk-wakeup-pill" class="nk-cat-status-pill nk-wakeup-pill-inline" style="display:none;"><span id="nk-wakeup-label">🐱 3s</span><div class="nk-wakeup-bar-wrap"><div class="nk-wakeup-bar" id="nk-wakeup-bar"></div></div></span>
                <span id="nk-hungry-pill" class="nk-cat-status-pill nk-hungry-pill-block" style="display:none;">🐱 <span id="nk-hungry-count"></span></span>
            </div>
            <div id="nk-mult-popup" class="nk-mult-popup" style="display:none;"></div>
        </div>
    </div>

    <!-- NEW LOCATION: Bottom Tab Bar Moved to Top (below stats) -->
    <div class="nk-tab-bar">
        <button class="nk-nav-btn active" data-target="click">👆 Click</button>
        <button class="nk-nav-btn" data-target="idle">📦 Idle</button>
        <button class="nk-nav-btn" data-target="dojo">🧠 Dojo<span class="nk-dojo-badge" id="nk-dojo-badge" style="display:none;"></span></button>
        <button class="nk-nav-btn" data-target="bells">🔔 Bell</button>
        <button class="nk-nav-btn" data-target="spirit" id="nk-nav-spirit" style="display:${showSpirit?'block':'none'}; color:#a55eea;">👻 Spirit</button>
        <button class="nk-nav-btn" data-target="stats">📊 Stats</button>
    </div>

    <!-- Content Area -->
    <div class="nk-content-pane">
        
        <!-- CLICK TAB -->
        <div class="nk-tab-content active" id="nk-tab-click">
            <div class="nk-shop-title">Tools</div>
            <div class="nk-upgrades" id="nk-upg-click"></div>
        </div>

        <!-- IDLE TAB -->
        <div class="nk-tab-content" id="nk-tab-idle">
            <div class="nk-shop-title">Structures</div>
            <div class="nk-upgrades" id="nk-upg-idle"></div>
        </div>

        <!-- DOJO TAB (SRS) -->
        <div class="nk-tab-content" id="nk-tab-dojo">
            <div class="nk-srs-status">
                <span class="nk-pending-count">0</span> Hungry Cats waiting!
            </div>

            <!-- Leech dojo header bar (shown when leeches exist or in leech mode) -->
            <div id="nk-leech-bar" style="display:none; margin-bottom:10px;">
                <div style="display:flex; gap:8px; align-items:center;">
                    <button id="nk-leech-dojo-btn" class="nk-leech-toggle-btn">
                        🩸 Leech Dojo <span id="nk-leech-count-badge" class="nk-leech-badge">0</span>
                    </button>
                    <button id="nk-normal-dojo-btn" class="nk-leech-toggle-btn nk-leech-toggle-inactive" style="display:none;">
                        ← Normal Dojo
                    </button>
                </div>
                <div id="nk-leech-mode-label" style="display:none; font-size:11px; color:#e17055; font-weight:bold; margin-top:4px;">
                    🩸 Leech Dojo active — reduced yarn rewards · always available
                </div>
            </div>

            <!-- 1. Sleep State -->
            <div id="nk-dojo-sleep" style="display:none;" class="nk-dojo-screen">
                <div style="font-size:50px;">💤</div>
                <p style="font-weight:bold; margin-top:10px;">Cat is napping.</p>
                <p style="color:#888;">You have the Happy Bonus!</p>
                <div id="nk-next-review-timer" style="margin: 15px 0; font-weight: bold; color: var(--nk-btn); font-size: 14px; min-width: 200px; text-align: center;">Next cat in: --</div>
                <div class="nk-learn-area">
                    <button class="nk-learn-btn" id="nk-learn-btn">Study New Word</button>
                </div>
            </div>

            <!-- 2. Cooldown State -->
            <div id="nk-dojo-cooldown" style="display:none;" class="nk-dojo-screen">
                <div style="font-size:50px; animation: nkPulse 1s infinite;">⏳</div>
                <p style="font-weight:bold; margin-top:15px;">Cat is thinking...</p>
                <div id="nk-cooldown-timer" style="font-size:24px; font-weight:bold; color:var(--nk-btn); margin-top:10px;">3.0s</div>
            </div>

            <!-- 3. Quiz State -->
            <div id="nk-dojo-quiz" style="display:none;" class="nk-dojo-screen" style="border:none; padding:0; background:transparent;">
                <div class="nk-cat-avatar-wrap">
                    <div class="nk-cat-avatar">🐱</div>
                    <div class="nk-speech-bubble">
                        <div class="nk-fc-kanji">...</div>
                        <div class="nk-fc-furi">...</div>
                    </div>
                </div>
                <div class="nk-quiz-grid"></div>
                <div id="nk-quiz-leech-actions" style="margin-top:10px; width:100%; max-width:400px;"></div>
            </div>
        </div>

        <!-- BELL TAB -->
        <div class="nk-tab-content" id="nk-tab-bells">
            <div class="nk-shop-title">Artifacts</div>
            <div class="nk-upgrades" id="nk-upg-bells"></div>
        </div>

        <!-- STATS TAB -->
        <div class="nk-tab-content" id="nk-tab-stats">
            <div class="nk-subtab-bar">
                <button class="nk-subtab-btn active" data-subtarget="statistics">📊 Statistics</button>
                <button class="nk-subtab-btn" data-subtarget="vocabulary">📖 Vocabulary</button>
                <button class="nk-subtab-btn" data-subtarget="individualize">⚙️ Settings</button>
            </div>
            <div class="nk-subtab-content active" id="nk-subtab-statistics">
                <div class="nk-shop-title">Economy</div>
                <div class="nk-stats-list" id="nk-stats-economy"></div>
                <div class="nk-shop-title" style="margin-top:14px;">Production</div>
                <div class="nk-stats-list" id="nk-stats-production"></div>
                <div class="nk-shop-title" style="margin-top:14px;">Dojo</div>
                <div class="nk-stats-list" id="nk-stats-dojo"></div>
                <div class="nk-shop-title" style="margin-top:14px;">Progression</div>
                <div class="nk-stats-list" id="nk-stats-progression"></div>
            </div>
            <div class="nk-subtab-content" id="nk-subtab-vocabulary">
                <div id="nk-vocab-summary" class="nk-stats-list" style="margin-bottom:12px;"></div>
                <button id="nk-export-srs-btn" class="nk-learn-btn" style="margin:0 0 12px; width:100%;">
                    ➕ Export Vocabulary to App SRS
                </button>
                <div id="nk-vocab-list" class="nk-vocab-list"></div>
            </div>
            <div class="nk-subtab-content" id="nk-subtab-individualize">
                <div class="nk-shop-title">📚 Vocabulary Deck</div>
                <div class="nk-stats-list" style="padding:14px; display:flex; flex-direction:column; gap:10px; margin-bottom:12px;">
                    <div>
                        <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Active Deck</div>
                        <div id="nk-current-deck-label" style="font-size:13px;font-weight:600;color:var(--nk-text);padding:8px 10px;background:var(--nk-bg);border-radius:8px;border:1px solid rgba(0,0,0,0.07);">—</div>
                    </div>
                    <button id="nk-change-deck-btn" class="nk-learn-btn" style="width:100%;">
                        📚 Change / Extend Deck
                    </button>
                    <div style="font-size:11px;color:#888;line-height:1.5;">
                        Changing your deck is safe: words already learned keep their SRS progress.
                        Removed words pause (dormant) and resume if you switch back.
                        New words get free slots equal to the number of dormant words.
                    </div>
                </div>
                <div class="nk-shop-title">⚙️ Game Settings</div>
                <div class="nk-stats-list" style="padding:14px; display:flex; flex-direction:column; gap:14px;">
                    <div>
                        <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:4px;">🩸 Leech Threshold</label>
                        <div style="font-size:11px; color:#888; margin-bottom:6px;">A word becomes a Leech after this many wrong answers (default: 20). Leeches leave the normal Dojo and must be trained separately.</div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <input type="number" id="nk-cfg-leech" min="5" max="100" step="1" value="20"
                                style="width:70px; padding:5px 8px; border:2px solid #eee; border-radius:8px; font-size:14px; font-weight:bold;">
                            <button class="nk-learn-btn" style="padding:5px 14px; font-size:12px;" id="nk-cfg-leech-save">Save</button>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:4px;">🌱 Starter Words</label>
                        <div style="font-size:11px; color:#888; margin-bottom:6px;">Words given for free when starting a fresh save (default: 3)</div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <input type="number" id="nk-cfg-starter" min="1" max="20" value="3"
                                style="width:70px; padding:5px 8px; border:2px solid #eee; border-radius:8px; font-size:14px; font-weight:bold;">
                            <button class="nk-learn-btn" style="padding:5px 14px; font-size:12px;" id="nk-cfg-starter-save">Save</button>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:4px;">📐 Initial SRS Ease Factor</label>
                        <div style="font-size:11px; color:#888; margin-bottom:6px;">Ease factor for new words (default: 1.5 · min 1.3 · max 3.0). Higher = intervals grow faster.</div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <input type="number" id="nk-cfg-ease" min="1.3" max="3.0" step="0.1" value="1.5"
                                style="width:70px; padding:5px 8px; border:2px solid #eee; border-radius:8px; font-size:14px; font-weight:bold;">
                            <button class="nk-learn-btn" style="padding:5px 14px; font-size:12px;" id="nk-cfg-ease-save">Save</button>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:4px;">⏱️ Initial SRS Interval</label>
                        <div style="font-size:11px; color:#888; margin-bottom:6px;">First review interval in seconds (default: 8). Lower = reviews come back sooner after first answer.</div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <input type="number" id="nk-cfg-interval" min="4" max="300" step="1" value="8"
                                style="width:70px; padding:5px 8px; border:2px solid #eee; border-radius:8px; font-size:14px; font-weight:bold;">
                            <button class="nk-learn-btn" style="padding:5px 14px; font-size:12px;" id="nk-cfg-interval-save">Save</button>
                        </div>
                    </div>
                    <div id="nk-cfg-status" style="font-size:12px; color:var(--nk-success); min-height:18px;"></div>
                </div>
            </div>
        </div>

        <!-- SPIRIT TAB -->
        <div class="nk-tab-content" id="nk-tab-spirit">
            <div class="nk-shop-title">Divine Upgrades</div>
            <div class="nk-upgrades" id="nk-upg-rebirth"></div>
        </div>

    </div>

    <div class="nk-footer"></div>

    <div class="nk-toasts" id="nk-toasts"></div>

    <!-- Pause overlay -->
    <div id="nk-pause-overlay" class="nk-pause-overlay" style="display:none;">
        <div class="nk-pause-dialog">
            <div style="font-size:48px;">⏸</div>
            <div style="font-size:20px; font-weight:bold; margin-top:8px;">Game Paused</div>
            <div style="font-size:12px; color:#888; margin-top:4px;">All timers frozen</div>
            <button class="nk-learn-btn" style="margin-top:16px;" id="nk-pause-resume-btn">▶ Resume</button>
        </div>
    </div>

    <!-- Wipe popup -->
    <div id="nk-wipe-overlay" class="nk-wipe-overlay" style="display:none;">
        <div class="nk-wipe-dialog">
            <div class="nk-wipe-title">🗑 Wipe Progress</div>
            <p class="nk-wipe-desc">Choose what to reset. This cannot be undone.</p>
            <button class="nk-wipe-opt nk-wipe-opt-partial" id="nk-wipe-partial">
                <span class="nk-wipe-opt-label">Reset game progress</span>
                <span class="nk-wipe-opt-sub">Keeps all vocabulary SRS data</span>
            </button>
            <button class="nk-wipe-opt nk-wipe-opt-full" id="nk-wipe-full">
                <span class="nk-wipe-opt-label">Reset everything</span>
                <span class="nk-wipe-opt-sub">Deletes vocabulary progress too</span>
            </button>
            <button class="nk-wipe-cancel" id="nk-wipe-cancel">Cancel</button>
        </div>
    </div>
</div>`;

    el.querySelector('#nk-save-btn').addEventListener('click', () => _saveGame(true));
    el.querySelector('#nk-pause-btn').addEventListener('click', _togglePause);
    el.querySelector('#nk-pause-resume-btn').addEventListener('click', _togglePause);
    el.querySelector('#nk-numfmt-btn').addEventListener('click', _toggleNumFmt);
    // Set correct label on init
    const fmtBtn = el.querySelector('#nk-numfmt-btn');
    if (fmtBtn) fmtBtn.textContent = _numFmtStyle === 'suffix' ? 'M' : 'e';
    el.querySelector('#nk-ascend-btn').addEventListener('click', _ascend);
    el.querySelector('#nk-rebirth-btn').addEventListener('click', _rebirth);
    el.querySelector('#nk-transcend-btn').addEventListener('click', _transcend);
    el.querySelector('#nk-learn-btn').addEventListener('click', _learnNewWord);
    el.querySelector('#nk-cat').addEventListener('click', (e) => _petCat(e));

    // Leech dojo buttons (wired via event delegation since bar may be hidden)
    el.addEventListener('click', (e) => {
        if (e.target.id === 'nk-leech-dojo-btn') { _setLeechMode(true); }
        if (e.target.id === 'nk-normal-dojo-btn') { _setLeechMode(false); }
    });

    el.querySelector('#nk-mult-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const popup = el.querySelector('#nk-mult-popup');
        if (!popup) return;
        if (popup.style.display === 'none') {
            _renderMultiplierPopup();
            popup.style.display = 'block';
        } else {
            popup.style.display = 'none';
        }
    });
    document.addEventListener('click', () => {
        const popup = el.querySelector('#nk-mult-popup');
        if (popup) popup.style.display = 'none';
    });

    el.querySelector('#nk-quit-btn').addEventListener('click', () => {
        if (confirm('Quit to Games menu? Your progress is saved.')) {
            _saveGame();
            _stopGameLoop();
            _onExit();
        }
    });

    el.querySelector('#nk-wipe-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        el.querySelector('#nk-wipe-overlay').style.display = 'flex';
    });
    el.querySelector('#nk-wipe-cancel').addEventListener('click', () => {
        el.querySelector('#nk-wipe-overlay').style.display = 'none';
    });
    el.querySelector('#nk-wipe-partial').addEventListener('click', () => {
        if (!confirm('Reset all game progress? Vocabulary SRS data will be kept.')) return;
        const srsBackup = JSON.parse(JSON.stringify(_g.srs));
        const transcendenceBackup = _g.transcendence;
        _g = _freshGame();
        _g.srs = srsBackup;
        _g.transcendence = transcendenceBackup;
        _saveGame();
        el.querySelector('#nk-wipe-overlay').style.display = 'none';
        _initShops();
        _updateSRSQueue();
        _updateUI();
        _toast('Game progress wiped. Vocabulary kept.', '#e17055');
    });
    el.querySelector('#nk-wipe-full').addEventListener('click', () => {
        if (!confirm('Delete EVERYTHING including vocabulary progress? This cannot be undone.')) return;
        localStorage.removeItem(SAVE_KEY);
        _clearDeckCfg();   // forget deck so the selector appears on next launch
        _stopGameLoop();
        _g = _freshGame();
        _vocabQueue     = [];
        _vocabQueueFull = [];
        el.querySelector('#nk-wipe-overlay').style.display = 'none';
        _toast('All progress wiped.', '#d63031');
        // Go straight to the selector so the player picks a fresh deck now
        setTimeout(() => {
            _show('setup');
            _renderSetup();
        }, 350);
    });

    el.querySelectorAll('.nk-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => _switchTab(btn.getAttribute('data-target')));
    });

    el.querySelectorAll('.nk-subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => _switchSubtab(btn.getAttribute('data-subtarget')));
    });

    // ── Individualize settings ───────────────────────────────────────────────
    const cfgStatus = (msg, ok = true) => {
        const el2 = el.querySelector('#nk-cfg-status');
        if (el2) { el2.textContent = msg; el2.style.color = ok ? 'var(--nk-success)' : '#e17055'; }
    };
    // Pre-fill with saved values
    const starterIn  = el.querySelector('#nk-cfg-starter');
    const easeIn     = el.querySelector('#nk-cfg-ease');
    const intervalIn = el.querySelector('#nk-cfg-interval');
    const leechIn    = el.querySelector('#nk-cfg-leech');
    if (starterIn)  starterIn.value  = _getCfg('starter',  3);
    if (easeIn)     easeIn.value     = _getCfg('ease',     1.5);
    if (intervalIn) intervalIn.value = _getCfg('interval', 8);
    if (leechIn)    leechIn.value    = _getCfg('leechThreshold', 20);

    el.querySelector('#nk-cfg-starter-save')?.addEventListener('click', () => {
        const v = parseInt(el.querySelector('#nk-cfg-starter').value);
        if (isNaN(v) || v < 1 || v > 20) { cfgStatus('Must be 1–20', false); return; }
        const cfg = _loadCfg(); cfg.starter = v; _saveCfg(cfg);
        _STARTER_COUNT = v;
        cfgStatus(`✓ Starter words set to ${v} (takes effect on next wipe/fresh start)`);
    });
    el.querySelector('#nk-cfg-leech-save')?.addEventListener('click', () => {
        const v = parseInt(el.querySelector('#nk-cfg-leech').value);
        if (isNaN(v) || v < 5 || v > 100) { cfgStatus('Must be 5–100', false); return; }
        const cfg = _loadCfg(); cfg.leechThreshold = v; _saveCfg(cfg);
        cfgStatus(`✓ Leech threshold set to ${v} wrong answers`);
    });
    el.querySelector('#nk-cfg-ease-save')?.addEventListener('click', () => {
        const v = parseFloat(el.querySelector('#nk-cfg-ease').value);
        if (isNaN(v) || v < 1.3 || v > 3.0) { cfgStatus('Must be 1.3–3.0', false); return; }
        const cfg = _loadCfg(); cfg.ease = v; _saveCfg(cfg);
        cfgStatus(`✓ Ease factor set to ${v} (applies to new words from now on)`);
    });
    el.querySelector('#nk-cfg-interval-save')?.addEventListener('click', () => {
        const v = parseInt(el.querySelector('#nk-cfg-interval').value);
        if (isNaN(v) || v < 4 || v > 300) { cfgStatus('Must be 4–300 seconds', false); return; }
        const cfg = _loadCfg(); cfg.interval = v; _saveCfg(cfg);
        cfgStatus(`✓ Initial interval set to ${v}s (applies to new words from now on)`);
    });

    // ── Export vocabulary to App SRS ────────────────────────────────────────
    el.querySelector('#nk-export-srs-btn')?.addEventListener('click', _openExportToSrsModal);

    // ── Change Deck ──────────────────────────────────────────────────────────
    el.querySelector('#nk-change-deck-btn')?.addEventListener('click', _openChangeDeckModal);

    // Populate current deck label whenever the Settings subtab becomes visible
    const _refreshDeckLabel = () => {
        const lbl = el.querySelector('#nk-current-deck-label');
        if (lbl) lbl.textContent = _deckCfgLabel(_loadDeckCfg()) || 'No deck saved yet';
    };
    el.querySelectorAll('.nk-subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('data-subtarget') === 'individualize') _refreshDeckLabel();
        });
    });
    _refreshDeckLabel();
}

// ─── EXPORT TO APP SRS ────────────────────────────────────────────────────────

/**
 * Opens the Export-to-SRS modal, pre-populated with the words this Neko
 * session has learned that are NOT yet in the app's SRS deck.
 *
 * We import srsDb lazily to avoid a hard module dependency loop — the Neko
 * game file is loaded inside games_ui.js which runs after srs_db is ready.
 */
async function _openExportToSrsModal() {
    // Lazy-import the app's SRS db (same path from inside js/games/neko/)
    let srsDb;
    try {
        srsDb = await import('../../srs_db.js');
    } catch (e) {
        _toast('Could not reach app SRS module.', '#e17055');
        return;
    }

    // Build the candidate list: zip srs item (interval/nextReview in seconds/ms)
    // with vocabQueue entry (kanji/kana/eng) so we can preserve scheduling on export
    const existing = srsDb.getAllWords();
    const candidates = _g.srs
        .map(item => {
            const vocab = _vocabQueue.find(v => v.id === item.id);
            if (!vocab) return null;
            return { ...vocab, _srsItem: item };
        })
        .filter(w => w && !existing[w.kanji]);

    // Reuse the existing modal if present, or build it fresh
    let modal = _screens.game.querySelector('#nk-srs-export-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'nk-srs-export-modal';
        modal.style.cssText = `
            position:absolute; inset:0; z-index:500;
            background:rgba(0,0,0,0.55);
            display:flex; align-items:center; justify-content:center; padding:16px;
        `;
        _screens.game.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="
            background:white; border-radius:16px; width:100%; max-width:360px;
            max-height:80vh; display:flex; flex-direction:column;
            box-shadow:0 8px 32px rgba(0,0,0,0.3); overflow:hidden;
            font-family:-apple-system,sans-serif;
        ">
            <div style="padding:16px 18px 10px; border-bottom:1px solid #eee;">
                <div style="font-size:17px; font-weight:bold; margin-bottom:4px;">➕ Export to App SRS</div>
                <div style="font-size:12px; color:#888; line-height:1.4;">
                    Select words to add to the main app's spaced-repetition deck.
                    Words already there are excluded.
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; padding:8px 14px; border-bottom:1px solid #eee; background:#fafafa;">
                <button id="nk-exp-all"  style="padding:3px 10px; border:1px solid #ddd; border-radius:6px; background:white; font-size:12px; cursor:pointer;">All</button>
                <button id="nk-exp-none" style="padding:3px 10px; border:1px solid #ddd; border-radius:6px; background:white; font-size:12px; cursor:pointer;">None</button>
                <span style="margin-left:auto; font-size:12px; color:#888;"><span id="nk-exp-count">0</span> selected</span>
            </div>
            <div id="nk-exp-list" style="flex:1; overflow-y:auto; padding:4px 0;"></div>
            <div id="nk-exp-status" style="display:none; padding:8px 14px; font-size:13px;"></div>
            <div style="display:flex; gap:8px; padding:12px 14px; border-top:1px solid #eee;">
                <button id="nk-exp-cancel" style="flex:1; padding:10px; border:1px solid #ddd; border-radius:8px; background:white; font-size:14px; cursor:pointer;">Cancel</button>
                <button id="nk-exp-confirm" style="flex:2; padding:10px; border:none; border-radius:8px; background:var(--nk-btn,#ff6b6b); color:white; font-size:14px; font-weight:bold; cursor:pointer;">Add to SRS Deck</button>
            </div>
        </div>
    `;

    const listEl    = modal.querySelector('#nk-exp-list');
    const countEl   = modal.querySelector('#nk-exp-count');
    const statusEl  = modal.querySelector('#nk-exp-status');

    if (candidates.length === 0) {
        listEl.innerHTML = `<div style="padding:20px; text-align:center; color:#888; font-size:13px;">
            All learned words are already in your SRS deck! 🎉
        </div>`;
        modal.querySelector('#nk-exp-confirm').style.display = 'none';
    } else {
        candidates.forEach(w => {
            const row = document.createElement('label');
            row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 14px; border-bottom:1px solid #f0f0f0; cursor:pointer; font-size:14px;';
            row.innerHTML = `
                <input type="checkbox" class="nk-exp-cb" data-word="${w.kanji}" data-furi="${w.kana}" data-trans="${w.eng}" data-interval="${w._srsItem?.interval ?? 0}" data-remaining-ms="${w._srsItem ? Math.max(0, w._srsItem.nextReview - _gameNow()) : 0}" data-ease="${w._srsItem?.ease ?? 2.5}" checked style="width:16px;height:16px;flex-shrink:0;">
                <span style="font-weight:700; min-width:50px;">${w.kanji}</span>
                <span style="color:#888; font-size:12px; min-width:55px;">${w.kana}</span>
                <span style="color:#888; font-size:12px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${w.eng}</span>
            `;
            listEl.appendChild(row);
        });
    }

    const _syncCount = () => {
        countEl.textContent = listEl.querySelectorAll('.nk-exp-cb:checked').length;
    };
    listEl.addEventListener('change', _syncCount);
    _syncCount();

    const _close = () => modal.remove();

    modal.querySelector('#nk-exp-all')?.addEventListener('click',  () => { listEl.querySelectorAll('.nk-exp-cb').forEach(c=>c.checked=true);  _syncCount(); });
    modal.querySelector('#nk-exp-none')?.addEventListener('click', () => { listEl.querySelectorAll('.nk-exp-cb').forEach(c=>c.checked=false); _syncCount(); });
    modal.querySelector('#nk-exp-cancel').addEventListener('click', _close);
    modal.addEventListener('click', e => { if (e.target === modal) _close(); });

    modal.querySelector('#nk-exp-confirm').addEventListener('click', () => {
        const checked = [...listEl.querySelectorAll('.nk-exp-cb:checked')];
        if (checked.length === 0) {
            statusEl.textContent = 'Select at least one word.';
            statusEl.style.cssText = 'display:block; padding:8px 14px; font-size:13px; color:#e17055;';
            return;
        }
        const nekoWords = checked.map(cb => ({
            word:         cb.getAttribute('data-word'),
            furi:         cb.getAttribute('data-furi'),
            trans:        cb.getAttribute('data-trans'),
            nekoInterval:    parseFloat(cb.getAttribute('data-interval'))    || 0,
            nekoRemainingMs: parseFloat(cb.getAttribute('data-remaining-ms')) || 0,
            ease:            parseFloat(cb.getAttribute('data-ease'))          || 2.5,
        }));
        const { added, skipped } = srsDb.importFromNeko(nekoWords, 'skip');
        statusEl.textContent = `✅ Added ${added} word${added!==1?'s':''} to SRS deck${skipped>0?` · ${skipped} already present`:''}. Switch to the SRS tab to review them!`;
        statusEl.style.cssText = 'display:block; padding:8px 14px; font-size:13px; color:var(--nk-success,#2ecc71);';
        modal.querySelector('#nk-exp-confirm').disabled = true;
        setTimeout(_close, 2400);
    });
}

// ─── CHANGE DECK MODAL ────────────────────────────────────────────────────────

/**
 * Opens a full-screen overlay containing the vocab selector pre-populated with
 * the current saved deck.  On confirm the new deck is saved, the vocab queue is
 * rebuilt, and slot-merging logic is re-applied — all without touching the save.
 */
function _openChangeDeckModal() {
    const gameEl = _screens.game;
    if (!gameEl) return;

    // Remove any stale copy
    document.getElementById('nk-change-deck-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'nk-change-deck-overlay';
    overlay.style.cssText = `
        position:fixed; inset:0; z-index:9000;
        background:var(--nk-bg, #fff5e6);
        display:flex; flex-direction:column;
        overflow:hidden;
    `;

    // ── Header bar ──
    overlay.innerHTML = `
        <div style="
            display:flex; align-items:center; justify-content:space-between;
            padding:10px 16px; background:var(--nk-panel,#ffe4c4);
            border-bottom:1px solid rgba(0,0,0,0.08); flex-shrink:0;
        ">
            <div style="font-size:15px; font-weight:bold;">📚 Change / Extend Deck</div>
            <button id="nk-cdm-cancel" style="
                background:none; border:none; font-size:22px; cursor:pointer;
                color:var(--nk-text,#5c4033); line-height:1; padding:2px 6px;
            ">✕</button>
        </div>
        <div id="nk-cdm-selector-wrap" style="flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch;"></div>
        <div style="
            padding:12px 16px; background:var(--nk-panel,#ffe4c4);
            border-top:1px solid rgba(0,0,0,0.08); flex-shrink:0;
            display:flex; flex-direction:column; gap:8px;
        ">
            <div id="nk-cdm-status" style="display:none; font-size:12px; padding:6px 10px;
                 background:#fff8e1; border:1px solid #ffe082; border-radius:6px; color:#7c6000;"></div>
            <button id="nk-cdm-confirm" style="
                width:100%; padding:12px; border:none; border-radius:10px;
                background:var(--nk-btn,#ffb347); color:white;
                font-size:15px; font-weight:bold; cursor:pointer;
            ">✓ Apply New Deck</button>
        </div>
    `;

    document.body.appendChild(overlay);

    // Mount selector pre-populated with the current saved deck
    const selectorWrap = overlay.querySelector('#nk-cdm-selector-wrap');
    const currentDeck  = _loadDeckCfg();
    const cdmSelector  = mountVocabSelector(selectorWrap, {
        bannedKey:     BANNED_KEY,
        preloadConfig: currentDeck,
        extendMode:    !!currentDeck,
        title:         'Choose New Vocabulary',
        defaultCount:  currentDeck?.count ?? 'All',
    });

    const statusEl = overlay.querySelector('#nk-cdm-status');
    const showStatus = (msg, isError = false) => {
        statusEl.textContent = msg;
        statusEl.style.display = 'block';
        statusEl.style.background = isError ? '#fff3f3' : '#fff8e1';
        statusEl.style.borderColor = isError ? '#ffb3b3' : '#ffe082';
        statusEl.style.color       = isError ? '#c0392b' : '#7c6000';
    };

    overlay.querySelector('#nk-cdm-cancel').addEventListener('click', () => overlay.remove());

    overlay.querySelector('#nk-cdm-confirm').addEventListener('click', async () => {
        const confirmBtn = overlay.querySelector('#nk-cdm-confirm');
        confirmBtn.disabled = true;
        confirmBtn.textContent = '⏳ Building queue…';
        statusEl.style.display = 'none';

        // Read the new config and build queue using the selector's own logic
        const newDeckCfg = getDeckConfig(selectorWrap);
        const rawQueue   = await cdmSelector.getQueue();

        if (!rawQueue.length) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '✓ Apply New Deck';
            showStatus('No words matched — adjust your selection and try again.', true);
            return;
        }

        // Count how many existing learned words are NOT in the new deck
        const newIds      = new Set(rawQueue.map(w => w.word));
        const dormantCount = _g.srs.filter(s => !newIds.has(s.id)).length;
        const newCount     = rawQueue.filter(w => !new Set(_g.srs.map(s => s.id)).has(w.word)).length;

        // Persist new deck config, rebuild queue, re-apply slots
        if (newDeckCfg) _saveDeckCfg(newDeckCfg);

        _vocabQueue = rawQueue.map(w => ({
            id:    w.word,
            kanji: w.word,
            kana:  w.furi  || w.word,
            eng:   w.trans || '—',
        }));

        // Full pool for pin-back logic
        if (newDeckCfg) {
            const fullRaw = await _buildVocabFromDeckCfg({ ...newDeckCfg, count: 'All' });
            _vocabQueueFull = fullRaw.map(w => ({ id: w.word, kanji: w.word, kana: w.furi || w.word, eng: w.trans || '—' }));
        } else {
            _vocabQueueFull = [..._vocabQueue];
        }

        _applyVocabSlots();
        _saveGame();
        _updateSRSQueue();
        _updateUI();

        // Refresh all visible stats — deck label, dojo section, vocab list
        const deckLblEl = gameEl.querySelector('#nk-current-deck-label');
        if (deckLblEl) deckLblEl.textContent = _deckCfgLabel(newDeckCfg) || 'Custom deck';
        _renderStats();
        _renderVocabList();

        // Show a summary toast and close immediately
        const dormantMsg = dormantCount > 0 ? ` · ${dormantCount} paused` : '';
        const newMsg     = newCount     > 0 ? ` · ${newCount} new free slots` : '';
        _toast(`Deck updated${dormantMsg}${newMsg}`, 'var(--nk-success)');
        overlay.remove();
    });
}

// ─── Shop DOM ─────────────────────────────────────────────────────────────────

function _initShops() {
    _renderShop('clickUpgrades', 'nk-upg-click',   'c', false, false);
    _renderShop('upgrades',      'nk-upg-idle',     'i', false, false);
    _renderShop('bellUpgrades',  'nk-upg-bells',    'b', true,  false);
    _renderShop('rebirthUpgrades','nk-upg-rebirth', 'r', false, true);
}

// Bell upgrade groups — defines display order and section headers
const _BELL_GROUPS = [
    { label: '👆 Click Power',   keys: ['paw', 'laser_ptr'] },
    { label: '📦 Idle / Passive', keys: ['tuna', 'warp', 'nap', 'bank', 'sunspot'] },
    { label: '🧶 Yarn',          keys: ['weaver', 'thread', 'loom', 'focus'] },
    { label: '🐟 Click Specials', keys: ['luck', 'charm', 'echo', 'purr', 'surge', 'auto'] },
    { label: '🎓 Dojo',          keys: ['scholar', 'combo_saver', 'sensei'] },
    { label: '🛒 Economy',       keys: ['discount'] },
];

function _renderShop(shopKey, containerId, prefix, isBell, isRebirth) {
    const container = _screens.game?.querySelector(`#${containerId}`);
    if (!container) return;
    container.innerHTML = '';

    const _appendUpg = (key) => {
        const upg = _g[shopKey][key];
        if (!upg) return;
        const vocabReq = upg.vocabReq || 0;
        const vocabNote = ((shopKey === 'upgrades' || shopKey === 'clickUpgrades') && vocabReq > 0)
            ? `<span class="nk-upg-vocab" id="nk-vocab-${prefix}-${key}">📚 ${vocabReq} words</span>`
            : '';
        const div = document.createElement('div');
        div.className = 'nk-upgrade' + (isBell ? ' nk-upg-bell' : isRebirth ? ' nk-upg-rebirth' : '');
        div.id = `nk-upg-${prefix}-${key}`;
        div.innerHTML = `
            <div class="nk-upg-info">
                <strong>${upg.name}</strong>
                <span class="nk-upg-lvl" id="nk-lvl-${prefix}-${key}">(Lvl ${upg.count})</span><br>
                <small>${upg.desc}</small>${vocabNote}
            </div>
            <button class="nk-upg-btn" id="nk-btn-${prefix}-${key}">Buy</button>`;
        div.querySelector('.nk-upg-btn').addEventListener('click', () => _buyUpgrade(shopKey, key));
        container.appendChild(div);
    };

    if (isBell) {
        // Grouped + sorted by cost within each group
        const rendered = new Set();
        _BELL_GROUPS.forEach(group => {
            // Only include keys that actually exist in the current shop object
            const existing = group.keys.filter(k => _g[shopKey][k]);
            if (!existing.length) return;
            // Sort within group by base cost ascending
            existing.sort((a, b) => _g[shopKey][a].cost - _g[shopKey][b].cost);

            const header = document.createElement('div');
            header.className = 'nk-shop-title nk-bell-group-title';
            header.textContent = group.label;
            container.appendChild(header);

            existing.forEach(k => { _appendUpg(k); rendered.add(k); });
        });
        // Catch-all: any bell upgrades not in any group, sorted by cost
        const ungrouped = Object.keys(_g[shopKey])
            .filter(k => !rendered.has(k))
            .sort((a, b) => _g[shopKey][a].cost - _g[shopKey][b].cost);
        if (ungrouped.length) {
            const header = document.createElement('div');
            header.className = 'nk-shop-title nk-bell-group-title';
            header.textContent = '⚙️ Other';
            container.appendChild(header);
            ungrouped.forEach(k => _appendUpg(k));
        }
    } else {
        // Non-bell shops: keep existing order (already sorted by vocabReq / cost in definition)
        for (const key in _g[shopKey]) _appendUpg(key);
    }
}

// ─── Stats DOM ────────────────────────────────────────────────────────────────

function _renderStats() {
    const g = _screens.game;
    if (!g) return;

    // ── Economy ──────────────────────────────────────────────────────────────
    const econ = g.querySelector('#nk-stats-economy');
    if (econ) {
        const totalUpgrades = Object.values(_g.upgrades).reduce((s,u) => s + u.count, 0)
                            + Object.values(_g.clickUpgrades).reduce((s,u) => s + u.count, 0);
        const discount = Math.pow(_g.bellUpgrades.discount.effect, _g.bellUpgrades.discount.count);
        econ.innerHTML = `
            <div class="nk-stat-row"><span>🐟 Fish (current)</span><span>${_fmtN(_g.fish)}</span></div>
            <div class="nk-stat-row"><span>🐟 Total Fish Earned</span><span>${_fmtN(_g.stats.fishEarned)}</span></div>
            <div class="nk-stat-row"><span>🧶 Yarn (current)</span><span>${_fmtN(_g.yarn)}</span></div>
            <div class="nk-stat-row"><span>🧶 Total Yarn Earned</span><span>${_fmtN(_g.stats.yarnEarned)}</span></div>
            <div class="nk-stat-row"><span>🔔 Bells</span><span>${_fmtN(_g.bells)}</span></div>
            <div class="nk-stat-row"><span>👻 Spirits</span><span>${_fmtN(_g.karma)}</span></div>
            ${_g.transcendence > 0 ? `<div class="nk-stat-row"><span>✦ Transcendence</span><span>${_g.transcendence} (×${_getTranscendenceMult().toFixed(2)} all prod.)</span></div>` : ''}
            <div class="nk-stat-row"><span>🛒 Upgrades Purchased</span><span>${totalUpgrades}</span></div>
            <div class="nk-stat-row"><span>🏷️ Shop Discount</span><span>${Math.round((1 - discount) * 100)}%</span></div>
        `;
    }

    // ── Production ────────────────────────────────────────────────────────────
    const prod = g.querySelector('#nk-stats-production');
    if (prod) {
        const fps      = _getFishPerSec();
        const cpc      = _getClickPower();
        const isHappy  = _pendingReviews.length === 0;
        const moodMult = isHappy ? 1.25 : 0.75;
        const comboMult = 1 + Math.log2(1 + _g.combo);
        const autoClicks = _g.bellUpgrades.auto.count * _g.bellUpgrades.auto.effect;
        const effectiveCps = fps + (cpc * autoClicks);
        prod.innerHTML = `
            <div class="nk-stat-row"><span>⚡ Fish / Second</span><span>${_fmtN(fps)}</span></div>
            <div class="nk-stat-row"><span>👆 Fish / Click</span><span>${_fmtN(cpc)}</span></div>
            <div class="nk-stat-row"><span>🤖 Auto-Clicks / Sec</span><span>${autoClicks > 0 ? _fmtN(autoClicks) : '—'}</span></div>
            <div class="nk-stat-row"><span>📈 Effective Total / Sec</span><span>${_fmtN(effectiveCps)}</span></div>
            <div class="nk-stat-row"><span>👆 Total Clicks</span><span>${_fmtN(_g.stats.clicks)}</span></div>
            <div class="nk-stat-row"><span>${isHappy ? '😺' : '😾'} Cat Mood Multiplier</span><span>${isHappy ? '×1.25 (Happy!)' : '×0.75 (Hungry)'}</span></div>
            <div class="nk-stat-row"><span>🔥 Combo</span><span>${_g.combo.toFixed(1)} (×${comboMult.toFixed(2)})</span></div>
            <div class="nk-stat-row"><span>🏆 Highest Combo</span><span>${Math.floor(_g.stats.highestCombo)}</span></div>
        `;
    }

    // ── Dojo ──────────────────────────────────────────────────────────────────
    const dojoEl = g.querySelector('#nk-stats-dojo');
    if (dojoEl) {
        const total     = _vocabQueue.length;
        const learned   = _g.srs.length;
        const remaining = total - learned;
        const accuracy  = (_g.stats.correct + _g.stats.wrong) > 0
            ? Math.round((_g.stats.correct / (_g.stats.correct + _g.stats.wrong)) * 100)
            : 0;
        const now = _gameNow();
        const pending  = _pendingReviews.length;
        const due      = pending; // same source as dojo badge — active vocab only

        // Next review countdown
        let nextReviewText = '—';
        if (learned > 0 && pending === 0) {
            const nextTime = Math.min(..._g.srs.map(s => s.nextReview));
            const diffSec  = (nextTime - now) / 1000;
            nextReviewText = diffSec <= 0 ? 'Now!' : _formatTime(diffSec);
        } else if (pending > 0) {
            nextReviewText = 'Now!';
        }

        // Cooldown status
        let cooldownText = '—';
        if (_isCooldown) {
            const remaining = (_cooldownEndTime - now) / 1000;
            cooldownText = remaining > 0 ? remaining.toFixed(1) + 's' : 'Done';
        }

        const learnCost = _getLearnCost();
        const deckLabel = _deckCfgLabel(_loadDeckCfg());
        dojoEl.innerHTML = `
            ${deckLabel ? `<div class="nk-stat-row"><span>📚 Active Deck</span><span style="font-size:12px;color:var(--nk-btn);font-weight:600;">${deckLabel}</span></div>` : ''}
            <div class="nk-stat-row"><span>📚 Words Learned</span><span>${learned} / ${total}</span></div>
            <div class="nk-stat-row"><span>➕ Words Remaining</span><span>${remaining}</span></div>
            <div class="nk-stat-row"><span>⏳ Reviews Due Now</span><span>${due > 0 ? '<span style="color:#e17055;font-weight:bold;">' + due + '</span>' : '0'}</span></div>
            <div class="nk-stat-row"><span>⏱️ Next Review In</span><span id="nk-stats-next-review">${nextReviewText}</span></div>
            <div class="nk-stat-row"><span>⏸️ Cooldown</span><span id="nk-stats-cooldown">${cooldownText}</span></div>
            <div class="nk-stat-row"><span>✅ Correct Answers</span><span>${_fmtN(_g.stats.correct)}</span></div>
            <div class="nk-stat-row"><span>❌ Wrong Answers</span><span>${_fmtN(_g.stats.wrong)}</span></div>
            <div class="nk-stat-row"><span>🎯 Accuracy</span><span>${accuracy}%</span></div>
            <div class="nk-stat-row"><span>💰 Next Learn Cost</span><span>${_fmtN(learnCost)} 🐟</span></div>
            <div class="nk-stat-row"><span>📝 Words Studied (Total)</span><span>${_g.stats.wordsLearned}</span></div>
        `;
    }

    // ── Progression ───────────────────────────────────────────────────────────
    const progEl = g.querySelector('#nk-stats-progression');
    if (progEl) {
        const bellsNeeded  = 50000;
        const spiritsNeeded = 100;
        const bellProgress  = Math.min(100, Math.floor((_g.fish / bellsNeeded) * 100));
        const nextBells     = _calcBells();
        const nextSpirits   = _calcSpirits();
        progEl.innerHTML = `
            <div class="nk-stat-row"><span>🔔 Ascension Bells Earned</span><span>${_fmtN(_g.bells)}</span></div>
            <div class="nk-stat-row"><span>🔔 Next Ascend Reward</span><span>+${_fmtN(nextBells)} Bell${nextBells !== 1 ? 's' : ''}</span></div>
            <div class="nk-stat-row"><span>📊 Ascend Progress</span><span>${bellProgress}% (need 50k 🐟)</span></div>
            <div class="nk-stat-row"><span>👻 Spirits (Karma)</span><span>${_fmtN(_g.karma)}</span></div>
            <div class="nk-stat-row"><span>👻 Next Rebirth Reward</span><span>${nextSpirits > 0 ? '+' + _fmtN(nextSpirits) + ' Spirit' + (nextSpirits !== 1 ? 's' : '') : 'Need 100 Bells'}</span></div>
            <div class="nk-stat-row"><span>📈 Idle Prod. Multiplier</span><span>×${(1 + Math.log10(1 + _g.bells) * 0.2).toFixed(2)} (from bells, log)</span></div>
            ${_g.transcendence > 0 ? `<div class="nk-stat-row"><span>✦ Transcendence Bonus</span><span>×${_getTranscendenceMult().toFixed(2)} to all production</span></div>` : `<div class="nk-stat-row"><span>✦ Transcendence</span><span>Need ${_fmtN(_calcTranscendenceCost())} 👻 to unlock</span></div>`}
        `;
    }

    // ── Vocabulary subtab ─────────────────────────────────────────────────────
    _renderVocabList();
}

function _renderVocabList() {
    const g = _screens.game;
    if (!g) return;

    const now    = _gameNow();
    const total  = _vocabQueue.length;
    const learned = _g.srs.length;
    const due    = _pendingReviews.length; // same source as dojo badge — active vocab only

    const summaryEl = g.querySelector('#nk-vocab-summary');
    if (summaryEl) {
        const leechCount = _getLeechedItems().length;
        summaryEl.innerHTML = `
            <div class="nk-stat-row"><span>📚 Total Vocabulary</span><span>${total}</span></div>
            <div class="nk-stat-row"><span>✅ Learned</span><span>${learned}</span></div>
            <div class="nk-stat-row"><span>🔓 Unleaned</span><span>${total - learned}</span></div>
            <div class="nk-stat-row"><span>⏳ Due for Review</span><span>${due > 0 ? '<span style="color:#e17055;font-weight:bold;">' + due + '</span>' : '0'}</span></div>
            ${leechCount > 0 ? `<div class="nk-stat-row"><span>🩸 Leeches</span><span style="color:#e17055;font-weight:bold;">${leechCount}</span></div>` : ''}
        `;
    }

    const vocList = g.querySelector('#nk-vocab-list');
    if (!vocList) return;
    vocList.innerHTML = '';
    if (_g.srs.length === 0) {
        vocList.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">No words learned yet. Go to the Dojo!</div>`;
        return;
    }

    const sortedSrs =[..._g.srs].sort((a,b) => a.nextReview - b.nextReview);
    sortedSrs.forEach(item => {
        const wordData = _vocabQueue.find(v => v.id === item.id);
        if (!wordData) return;
        const isDue      = item.nextReview <= now;
        const waitText   = isDue ? 'Due now!' : _formatTime((item.nextReview - now) / 1000);
        const intervalText = _formatTime(item.interval);
        const isLeech    = _isLeech(item);
        const wrongCount = item.wrongCount || 0;
        const threshold  = _getLeechThreshold();
        const leechLabel = isLeech
            ? `<span style="color:#e17055;font-size:10px;font-weight:bold;">🩸 LEECH (${wrongCount}✗)</span>`
            : wrongCount > 0
                ? `<span style="color:#aaa;font-size:10px;">${wrongCount}/${threshold} fails</span>`
                : '';
        const row = document.createElement('div');
        row.className = 'nk-vocab-row';
        if (isLeech) row.style.borderLeft = '3px solid #e17055';
        row.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:bold; font-size:16px;">${wordData.kanji}</div>
                <div style="font-size:12px; color:var(--text-muted);">${wordData.kana} · ${wordData.eng}</div>
                ${leechLabel}
            </div>
            <div style="text-align:right; margin-right: 12px; min-width:80px;">
                ${isLeech
                    ? `<div style="font-size:11px;color:#e17055;font-weight:bold;">🩸 Leech Dojo</div>`
                    : `<div style="font-size:10px; color:#888;">Next review</div>
                       <div style="font-size:12px; font-weight:bold; color:${isDue ? '#e17055' : 'var(--nk-btn)'};">${waitText}</div>
                       <div style="font-size:10px; color:#aaa;">interval: ${intervalText}</div>`
                }
            </div>
            <button class="nk-ban-btn" title="Ban from Dojo">🚫</button>
        `;
        row.querySelector('.nk-ban-btn').addEventListener('click', () => _banWord(wordData.kanji));
        vocList.appendChild(row);
    });
}

function _renderMultiplierPopup() {
    const popup = _screens.game?.querySelector('#nk-mult-popup');
    if (!popup) return;
    const b = _getMultiplierBreakdown();
    const fmt = v => (v >= 10000 ? _fmtN(v) : v.toFixed(2));
    const row = (label, val, color = '') => {
        if (val === 1) return '';
        const style = color ? `style="color:${color};"` : '';
        return `<div class="nk-mp-row" ${style}><span>${label}</span><span>×${fmt(val)}</span></div>`;
    };
    const baseRow = (label, val) =>
        `<div class="nk-mp-row nk-mp-base"><span>${label}</span><span>${_fmtN(val)}</span></div>`;
    const multRow = (label, val) =>
        `<div class="nk-mp-row nk-mp-mult"><span>${label}</span><span>×${fmt(val)}</span></div>`;
    const totalRow = (label, val) =>
        `<div class="nk-mp-row nk-mp-final"><span>${label}</span><span>${_fmtN(val)}</span></div>`;

    const happyLabel = b.isHappy ? '✨ Happy Bonus' : '😾 Hungry Penalty';
    const happyColor = b.isHappy ? 'var(--nk-success)' : '#e17055';

    popup.innerHTML = `
        <div style="font-size:9px; color:#aaa; margin-bottom:6px; font-style:italic;">All × factors are multiplied together</div>
        <div class="nk-mp-section">
            <div class="nk-mp-title">🐟 Idle Production</div>
            ${baseRow('🏗️ Upgrades (base /s)', b.idle.base)}
            ${row(happyLabel,    b.moodMult,    happyColor)}
            ${row('🔥 Combo (' + _g.combo.toFixed(1) + ')', b.comboMult, '#e17055')}
            ${row('🌿 Catnip',   b.idle.catnip)}
            ${row('🐟 Tuna Bell',b.idle.tuna)}
            ${row('⏩ Time Warp', b.idle.warp)}
            ${row('😴 Cat Nap',  b.idle.nap)}
            ${row('🔔 Bells',    b.idle.bells)}
            ${row('☀️ Sunspot',  b.idle.sunspot)}
            ${row(`📚 Words (${b.activeWords}w quad)`, b.idle.bloom)}
            ${row('👻 Guide',    b.idle.guide)}
            ${b.globalAmp > 1 ? row('🌌 Cosmic Amp', b.globalAmp, 'var(--nk-spirit)') : ''}
            ${_g.transcendence > 0 ? row(`✦ Transcendence (×${_g.transcendence})`, _getTranscendenceMult(), '#f9ca24') : ''}
            ${multRow('= Total ×Multiplier', b.idle.multTotal * (b.globalAmp > 1 ? b.globalAmp : 1) * _getTranscendenceMult())}
            ${totalRow('= Total /s', b.idle.finalFps * _getTranscendenceMult())}
        </div>
        <div class="nk-mp-section" style="margin-top:8px;">
            <div class="nk-mp-title">👆 Click Power</div>
            ${baseRow('🛠️ Upgrades (base /click)', b.click.base)}
            ${row(happyLabel,    b.moodMult,    happyColor)}
            ${row('🔥 Combo (' + _g.combo.toFixed(1) + ')', b.comboMult, '#e17055')}
            ${row('🌿 Catnip',   b.click.catnip)}
            ${row('⏩ Time Warp', b.click.warp)}
            ${row('😴 Cat Nap',  b.click.nap)}
            ${row('🔔 Bells',    b.click.bells)}
            ${row('☀️ Sunspot',  b.click.sunspot)}
            ${row(`📚 Words (${b.activeWords}w quad)`, b.click.bloom)}
            ${row('👻 Guide',    b.click.guide)}
            ${b.click.clickWords > 1 ? row('🐾 Word Paw', b.click.clickWords) : ''}
            ${b.globalAmp > 1 ? row('🌌 Cosmic Amp', b.globalAmp, 'var(--nk-spirit)') : ''}
            ${_g.transcendence > 0 ? row(`✦ Transcendence (×${_g.transcendence})`, _getTranscendenceMult(), '#f9ca24') : ''}
            ${multRow('= Total ×Multiplier', b.click.multTotal * (b.globalAmp > 1 ? b.globalAmp : 1) * _getTranscendenceMult())}
            ${totalRow('= Total /click', b.click.finalClick * _getTranscendenceMult())}
        </div>
    `;
}



function _updateUI() {
    const g = _screens.game;
    if (!g || g.style.display === 'none') return;

    const setTxt = (sel, val) => { const el = g.querySelector(sel); if (el) el.textContent = val; };

    setTxt('.nk-val-fish',  _fmtN(_g.fish));
    setTxt('.nk-val-yarn',  _fmtN(_g.yarn));
    setTxt('.nk-val-bells', _fmtN(_g.bells));
    setTxt('.nk-val-karma', _fmtN(_g.karma));
    setTxt('.nk-val-fps',   _fmtN(_getFishPerSec()));
    setTxt('.nk-val-cpc',   _fmtN(_getClickPower()));
    setTxt('.nk-val-combo', _g.combo.toFixed(1)); // Show decimal to make decay visible

    // Always keep ascend/rebirth button text current — max 4 digits with _fmtShort
    const ascendBtn  = g.querySelector('#nk-ascend-btn');
    const rebirthBtn = g.querySelector('#nk-rebirth-btn');
    const transcendBtn = g.querySelector('#nk-transcend-btn');
    const transcendBadge = g.querySelector('#nk-transcendence-badge');
    if (ascendBtn)  ascendBtn.textContent  = `⬆+${_fmtShort(_calcBells())}`;
    if (rebirthBtn) rebirthBtn.textContent = `♻+${_fmtShort(_calcSpirits())}`;

    // Transcendence badge: ✦N left of 🐾 (always visible once first transcendence done)
    if (transcendBadge) {
        if (_g.transcendence > 0) {
            transcendBadge.textContent = `✦${_g.transcendence}`;
            transcendBadge.style.display = 'inline';
        } else {
            transcendBadge.style.display = 'none';
        }
    }
    // Transcend button: visible only when player can afford it
    if (transcendBtn) {
        if (_canTranscend()) {
            transcendBtn.style.display = 'inline-block';
            transcendBtn.title = `Transcend (costs ${_fmtN(_calcTranscendenceCost())} 👻)`;
        } else {
            transcendBtn.style.display = 'none';
        }
    }

    // Word count in sub-line (active learned words)
    const _wcActiveIds = new Set(_vocabQueue.map(v => v.id));
    const _wcCount = _g.srs.filter(s => _wcActiveIds.has(s.id)).length;
    setTxt('.nk-val-wordcount', _wcCount);

    // Multiplier badge
    const multBtn = g.querySelector('#nk-mult-btn');
    if (multBtn) {
        const b = _getMultiplierBreakdown();
        const isHappy = b.isHappy;
        const totalMult = b.idle.multTotal * (b.globalAmp > 1 ? b.globalAmp : 1);
        multBtn.textContent = `×${totalMult.toFixed(2)}`;
        multBtn.style.color = isHappy ? 'var(--nk-success)' : '#e17055';
        multBtn.style.borderColor = isHappy ? 'var(--nk-success)' : '#e17055';
        // If popup is open, keep it live
        const popup = g.querySelector('#nk-mult-popup');
        if (popup && popup.style.display !== 'none') _renderMultiplierPopup();
    }

    // Hungry cats indicator — inline 🐱 in sub-line
    const hungryCount  = _pendingReviews.length;
    const hungryPill   = g.querySelector('#nk-hungry-pill');
    const hungryCountEl = g.querySelector('#nk-hungry-count');
    const dojoBadge    = g.querySelector('#nk-dojo-badge');
    if (hungryPill) hungryPill.style.display = hungryCount > 0 ? 'inline-flex' : 'none';
    if (hungryCountEl) hungryCountEl.textContent = hungryCount > 0 ? `×${hungryCount}` : '';
    if (dojoBadge) {
        if (hungryCount > 0) {
            dojoBadge.textContent = hungryCount;
            dojoBadge.style.display = 'inline-block';
        } else {
            dojoBadge.style.display = 'none';
        }
    }

    // Keep leech bar in sync
    _updateLeechDojoBtn();

    if (_g.karma > 0 || _g.bells > 50) {
        const karmaPill = g.querySelector('#nk-karma-pill');
        const navSpirit = g.querySelector('#nk-nav-spirit');
        const rebBtn    = g.querySelector('#nk-rebirth-btn');
        if (karmaPill) karmaPill.style.display = 'flex';
        if (navSpirit) navSpirit.style.display = 'block';
        if (rebBtn)    rebBtn.style.display    = 'inline-block';
    }

    const activeTab = g.querySelector('.nk-tab-content.active');
    if (activeTab) {
        if (activeTab.id === 'nk-tab-click') _updateShopBtns('clickUpgrades', 'c');
        if (activeTab.id === 'nk-tab-idle')  _updateShopBtns('upgrades', 'i');
        if (activeTab.id === 'nk-tab-bells') {
            for (const key in _g.bellUpgrades) {
                const upg  = _g.bellUpgrades[key];
                const cost = _bellCost(key, upg);
                const btn  = g.querySelector(`#nk-btn-b-${key}`);
                const lvl  = g.querySelector(`#nk-lvl-b-${key}`);
                const isWeaver = key === 'weaver';
                const maxed = isWeaver && upg.count >= 10;
                if (lvl) lvl.textContent = isWeaver ? `(lvl ${upg.count}/10)` : `(Lvl ${upg.count})`;
                if (btn) {
                    if (maxed) {
                        btn.textContent = 'Maxed';
                        btn.disabled = true;
                    } else {
                        btn.textContent = `${_fmtN(cost)} 🔔`;
                        btn.disabled = _g.bells < cost;
                    }
                }
            }
        }
        if (activeTab.id === 'nk-tab-spirit') {
            for (const key in _g.rebirthUpgrades) {
                const upg  = _g.rebirthUpgrades[key];
                const cost = upg.cost * Math.pow(2, upg.count);
                const btn  = g.querySelector(`#nk-btn-r-${key}`);
                const lvl  = g.querySelector(`#nk-lvl-r-${key}`);
                if (lvl) lvl.textContent = `(Lvl ${upg.count})`;
                if (btn) { btn.textContent = `${_fmtN(cost)} 👻`; btn.disabled = _g.karma < cost; }
            }
        }
        if (activeTab.id === 'nk-tab-stats') {
            // Full re-render once per second so vocab due-times stay live
            const now = Date.now();
            const lastRender = parseInt(activeTab.dataset.lastRender || '0');
            if (now - lastRender >= 1000) {
                activeTab.dataset.lastRender = now;
                _renderStats();
            }
        }
    }

    const learnBtn = g.querySelector('#nk-learn-btn');
    if (learnBtn) {
        const cost       = _getLearnCost();
        const learnedIds = new Set(_g.srs.map(s => s.id));
        const remaining  = _vocabQueue.filter(v => !learnedIds.has(v.id)).length;
        if (remaining === 0) {
            learnBtn.textContent = 'Mastery Achieved!';
            learnBtn.disabled    = true;
        } else {
            learnBtn.textContent = `Study (${_fmtN(cost)} 🐟)`;
            learnBtn.disabled    = _g.fish < cost;
        }
    }
}

function _updateShopBtns(shopKey, prefix) {
    const g        = _screens.game;
    const discount = Math.pow(_g.bellUpgrades.discount.effect, _g.bellUpgrades.discount.count);
    const learnedCount = _g.srs.filter(s => new Set(_vocabQueue.map(v => v.id)).has(s.id)).length;
    for (const key in _g[shopKey]) {
        const upg       = _g[shopKey][key];
        const costFish  = Math.floor(upg.cost * Math.pow(1.18, upg.count) * discount);
        const isLevelScaledYarn = (key === 'catnip' && shopKey === 'upgrades');
        const rawYarnCost = isLevelScaledYarn ? (upg.count + 1) : (upg.costYarn || 0);
        const costYarn  = Math.floor(rawYarnCost * discount);
        const btn       = g?.querySelector(`#nk-btn-${prefix}-${key}`);
        const lvl       = g?.querySelector(`#nk-lvl-${prefix}-${key}`);
        const vocabNote = g?.querySelector(`#nk-vocab-${prefix}-${key}`);
        const card      = g?.querySelector(`#nk-upg-${prefix}-${key}`);
        const vocabReq  = upg.vocabReq || 0;
        const vocabLocked = learnedCount < vocabReq;

        if (lvl) lvl.textContent = `(Lvl ${upg.count})`;
        if (vocabNote) {
            vocabNote.textContent = `📚 ${vocabReq} words`;
            vocabNote.style.color = vocabLocked ? '#e17055' : 'var(--nk-success)';
        }
        if (card) card.style.opacity = vocabLocked ? '0.5' : '1';
        if (btn) {
            if (vocabLocked) {
                btn.textContent = `🔒 ${vocabReq}w`;
                btn.disabled    = true;
            } else {
                btn.textContent = `${_fmtN(costFish)}🐟${costYarn > 0 ? ` ${_fmtN(costYarn)}🧶` : ''}`;
                btn.disabled    = (_g.fish < costFish || _g.yarn < costYarn);
            }
        }
    }
}

function _switchTab(tabName) {
    const g = _screens.game;
    if (!g) return;
    
    g.querySelectorAll('.nk-tab-content').forEach(c => c.classList.remove('active'));
    g.querySelector(`#nk-tab-${tabName}`)?.classList.add('active');
    
    g.querySelectorAll('.nk-nav-btn').forEach(b => b.classList.remove('active'));
    g.querySelector(`.nk-nav-btn[data-target="${tabName}"]`)?.classList.add('active');
    
    if (tabName === 'stats') _renderStats();
    _updateUI();
}

function _switchSubtab(subName) {
    const g = _screens.game;
    if (!g) return;
    g.querySelectorAll('.nk-subtab-content').forEach(c => c.classList.remove('active'));
    g.querySelector(`#nk-subtab-${subName}`)?.classList.add('active');
    g.querySelectorAll('.nk-subtab-btn').forEach(b => b.classList.remove('active'));
    g.querySelector(`.nk-subtab-btn[data-subtarget="${subName}"]`)?.classList.add('active');
    _renderStats();
}

function _toast(msg, color = '#333') {
    const area = _screens.game?.querySelector('#nk-toasts');
    if (!area) return;
    const t = document.createElement('div');
    t.className  = 'nk-toast';
    t.style.borderLeft = `5px solid ${color}`;
    t.textContent = msg;
    area.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

// ─── CSS injection ────────────────────────────────────────────────────────────

(function _injectStyles() {
    if (document.getElementById('neko-game-styles')) return;
    const style = document.createElement('style');
    style.id = 'neko-game-styles';
    style.textContent = `
.nk-root {
    --nk-bg:      #fff5e6;
    --nk-text:    #5c4033;
    --nk-panel:   #ffe4c4;
    --nk-btn:     #ffb347;
    --nk-btnhov:  #ff9e1b;
    --nk-accent:  #ff6b6b;
    --nk-success: #4cd137;
    --nk-gold:    #ffd32a;
    --nk-spirit:  #a55eea;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--nk-bg);
    color: var(--nk-text);
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    overflow: hidden;
}

/* top bar */
.nk-topbar {
    background: var(--nk-panel);
    padding: 5px 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    flex-shrink: 0;
    z-index: 20;
}
.nk-topbar-title { font-size: 16px; font-weight: bold; line-height: 1; }
.nk-topbar-btns  { display: flex; gap: 4px; align-items: stretch; }
/* All buttons same height via consistent line-height + padding */
.nk-hbtn {
    background: var(--nk-btn); border: none;
    height: 28px; padding: 0 7px;
    border-radius: 5px; color: white; cursor: pointer; font-weight: bold; font-size: 11px;
    min-width: 26px; text-align: center; white-space: nowrap;
    display: inline-flex; align-items: center; justify-content: center;
}
/* Ascend / Rebirth: same height, just wider and different colour */
.nk-hbtn-gold   { background: var(--nk-gold); color: #333; padding: 0 10px; font-size: 12px; min-width: 58px; }
.nk-hbtn-spirit { background: var(--nk-spirit);             padding: 0 10px; font-size: 12px; min-width: 58px; }
.nk-hbtn-danger { background: #888; }
.nk-hbtn-fmt    { background: #e0e0e0; color: #555; }

/* Shared cat status pill (countdown + hungry) — fixed height so no layout jump */
.nk-cat-status-pill {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border-radius: 9px;
    font-size: 10px;
    font-weight: bold;
    white-space: nowrap;
    box-sizing: border-box;
    vertical-align: middle;
}
.nk-hungry-pill-block {
    background: #ffe0e0;
    color: #e17055;
    border: 1px solid #ffb3a7;
    animation: nkPulse 1.5s infinite;
    gap: 2px;
}
.nk-wakeup-pill-inline {
    background: #fff8e1;
    color: #e17055;
    border: 1px solid #ffe0b2;
    flex-direction: column !important;
    height: 20px;
    gap: 1px;
    padding: 1px 6px 2px !important;
    align-items: center;
}
.nk-wakeup-bar-wrap {
    width: 32px;
    height: 3px;
    background: rgba(0,0,0,0.1);
    border-radius: 2px;
    overflow: hidden;
}
.nk-wakeup-bar {
    height: 100%;
    border-radius: 2px;
    width: 0%;
    transition: width 0.25s linear, background 0.5s;
}

/* Stats Header */
.nk-stats-header {
    background: white;
    padding: 6px 8px;
    border-bottom: 1px solid rgba(0,0,0,0.05);
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 8px;
    position: relative;
}
.nk-header-cat {
    font-size: 40px;
    cursor: pointer;
    user-select: none;
    line-height: 1;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.1));
    transition: transform 0.05s;
    flex-shrink: 0;
}
.nk-header-cat:active { transform: scale(0.9); }

.nk-stats-wrapper {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.nk-stat-row-top {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    align-items: center;
}
.nk-stat-pill {
    background: var(--nk-bg);
    padding: 2px 6px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
    min-width: 72px;
    justify-content: flex-start;
    box-sizing: border-box;
}
/* Row 2 sub-line: all inline, left-aligned, natural spacing */
.nk-stat-sub {
    font-size: 10px;
    color: #888;
    display: flex;
    align-items: center;
    gap: 2px;
    flex-wrap: nowrap;
    white-space: nowrap;
    justify-content: flex-start;
    min-height: 16px;
    overflow: visible;
}
.nk-val-fps   { display: inline; }
.nk-val-cpc   { display: inline; }
.nk-val-combo { display: inline; }
.nk-stat-sep { opacity: 0.4; }
.nk-mult-btn {
    font-size: 10px;
    font-weight: bold;
    background: none;
    border: 1px solid #aaa;
    border-radius: 6px;
    padding: 1px 4px;
    cursor: pointer;
    color: #888;
    line-height: 1.3;
    white-space: nowrap;
    transition: color 0.2s, border-color 0.2s;
}
.nk-mult-btn:hover { opacity: 0.8; }
.nk-mult-popup {
    position: absolute;
    top: 80px;
    left: 8px;
    z-index: 100;
    background: white;
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 10px;
    padding: 10px 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.14);
    font-size: 12px;
    min-width: 200px;
    max-width: 240px;
}
.nk-mp-section { display: flex; flex-direction: column; gap: 3px; }
.nk-mp-title {
    font-weight: bold;
    font-size: 12px;
    margin-bottom: 4px;
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid rgba(0,0,0,0.07);
    padding-bottom: 3px;
}
.nk-mp-total { font-weight: bold; color: var(--nk-btn); }
.nk-mp-row {
    display: flex;
    justify-content: space-between;
    padding: 1px 4px;
    color: #666;
}
.nk-mp-base {
    color: #888;
    font-style: italic;
    border-bottom: 1px dashed rgba(0,0,0,0.08);
    margin-bottom: 2px;
    padding-bottom: 3px;
}
.nk-mp-final {
    font-weight: bold;
    color: var(--nk-btn);
    border-top: 1px solid rgba(0,0,0,0.1);
    margin-top: 2px;
    padding-top: 3px;
}
.nk-mp-mult {
    font-weight: bold;
    color: #e17055;
    border-top: 1px dashed rgba(0,0,0,0.08);
    margin-top: 2px;
    padding-top: 3px;
}
[data-theme="dark"] .nk-mp-base  { color: #a08060; border-bottom-color: #5a3e2b; }
[data-theme="dark"] .nk-mp-final { border-top-color: #5a3e2b; }
[data-theme="dark"] .nk-mp-mult  { color: #e17055; border-top-color: #5a3e2b; }
[data-theme="dark"] .nk-mult-popup {
    background: #3d2b1a; border-color: #5a3e2b; color: #f0d9c0;
}
[data-theme="dark"] .nk-mp-row { color: #c8a882; }
[data-theme="dark"] .nk-mp-title { border-bottom-color: #5a3e2b; }
.nk-bell-color { color: #b8860b; }
.nk-spirit-color { color: #a55eea; }


/* Nav Bar (Tabs) - Moved to Top below Stats */
.nk-tab-bar {
    background: white;
    border-bottom: 1px solid rgba(0,0,0,0.1);
    display: flex;
    flex-shrink: 0;
    overflow-x: auto; /* Allow horizontal scroll if tabs overflow on small screens */
}
.nk-nav-btn {
    flex: 1;
    background: none;
    border: none;
    padding: 12px 0;
    font-size: 12px;
    font-weight: 600;
    color: #888;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    white-space: nowrap;
    min-width: 60px;
}
.nk-nav-btn.active {
    color: var(--nk-text);
    border-bottom-color: var(--nk-btn);
    background: rgba(255,179,71,0.1);
}

/* Main Content Pane */
.nk-content-pane {
    flex: 1;
    overflow-y: auto;
    padding: 15px;
    background: #fffdf9;
    position: relative;
    -webkit-overflow-scrolling: touch;
    min-height: 0;
}

.nk-footer {
    flex-shrink: 0;
    height: 60px;
    background: var(--nk-panel);
    border-top: 1px solid rgba(0,0,0,0.06);
}

.nk-tab-content { display: none; height: 100%; }
.nk-tab-content.active { display: block; }

/* Shops */
.nk-shop-title {
    font-size: 14px;
    text-transform: uppercase;
    color: #888;
    font-weight: bold;
    margin-bottom: 8px;
    letter-spacing: 0.05em;
}
.nk-upgrade {
    background: white; padding: 10px; border-radius: 8px; margin-bottom: 8px;
    display: flex; justify-content: space-between; align-items: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.03);
    border: 1px solid rgba(0,0,0,0.05);
}
.nk-upg-info { flex: 1; padding-right: 8px; font-size: 13px; }
.nk-upg-lvl  { font-size: 11px; opacity: 0.6; }
.nk-upg-vocab {
    display: inline-block; font-size: 10px; font-weight: bold;
    margin-left: 5px; opacity: 0.8;
}
.nk-upg-btn {
    background: var(--nk-btn); border: none; padding: 8px 10px; border-radius: 6px;
    color: white; font-weight: bold; min-width: 80px; font-size: 12px; cursor: pointer;
}
.nk-upg-btn:disabled { background: #e0e0e0; color: #aaa; }

/* Dojo / Quiz */
.nk-srs-status {
    text-align: center; padding: 8px; border-radius: 8px;
    background: #fff0f0; color: #d63031; border: 1px solid #fab1a0;
    margin-bottom: 15px; font-weight: bold; font-size: 13px;
}

.nk-dojo-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center; 
    padding: 30px 20px; 
    background: white; 
    border-radius: 12px;
    border: 1px dashed #ccc;
    min-height: 250px;
    width: 100%;
}
/* Remove dashed border specifically for the active quiz screen */
#nk-dojo-quiz {
    border: none;
    padding: 10px 0;
    background: transparent;
}

.nk-learn-area { margin-top: 10px; width: 100%; max-width: 200px; }
.nk-learn-btn {
    background: var(--nk-success); color: white; border: none; padding: 12px 20px;
    border-radius: 20px; font-weight: bold; font-size: 14px; cursor: pointer;
    box-shadow: 0 3px 0 #329929;
    width: 100%;
}
.nk-learn-btn:active { transform: translateY(3px); box-shadow: none; }
.nk-learn-btn:disabled { background: #aaa; box-shadow: 0 3px 0 #888; cursor: not-allowed; opacity: 0.6; }

/* Avatar & Bubble - Horizontal Layout */
.nk-cat-avatar-wrap {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    margin-bottom: 25px;
    gap: 15px;
}
.nk-cat-avatar {
    font-size: 40px;
    line-height: 1;
}
.nk-speech-bubble {
    background: white;
    border: 2px solid var(--nk-text);
    border-radius: 16px;
    padding: 15px 25px;
    color: var(--nk-text);
    box-shadow: 4px 4px 0 rgba(0,0,0,0.1);
    position: relative;
    min-width: 140px;
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

/* Speech bubble tail pointing left to cat */
.nk-speech-bubble::after {
    content: '';
    position: absolute;
    top: 50%;
    left: -14px;
    transform: translateY(-50%);
    border-width: 10px 14px 10px 0;
    border-style: solid;
    border-color: transparent var(--nk-text) transparent transparent;
    display: block;
    width: 0;
}
.nk-speech-bubble::before {
    content: '';
    position: absolute;
    top: 50%;
    left: -10px;
    transform: translateY(-50%);
    border-width: 8px 11px 8px 0;
    border-style: solid;
    border-color: transparent white transparent transparent;
    display: block;
    width: 0;
    z-index: 1;
}

.nk-fc-kanji { font-size: 26px; font-weight: bold; line-height: 1.2; }
.nk-fc-furi  { font-size: 12px; color: #888; margin-top: 2px; }

.nk-quiz-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
    width: 100%;
    max-width: 400px;
}
.nk-quiz-btn {
    background: white; border: 2px solid #eee; padding: 15px;
    border-radius: 10px; font-size: 14px; font-weight: bold; color: #555;
    cursor: pointer; transition: all 0.1s;
}
.nk-quiz-btn:active { transform: scale(0.98); }
.nk-quiz-correct { background: var(--nk-success) !important; color: white !important; border-color: var(--nk-success) !important; }
.nk-quiz-wrong { background: #ff4b4b !important; color: white !important; border-color: #ff4b4b !important; }

/* Dojo tab badge */
.nk-dojo-badge {
    display: inline-block; background: #e17055; color: white;
    border-radius: 10px; font-size: 10px; font-weight: bold;
    padding: 1px 5px; margin-left: 4px; vertical-align: middle; line-height: 1.4;
    animation: nkPulse 2s infinite;
}

/* Subtab bar */
.nk-subtab-bar {
    display: flex; gap: 6px; margin-bottom: 12px;
}
.nk-subtab-btn {
    flex: 1; padding: 7px 10px; border: 2px solid #e0dbd3; border-radius: 8px;
    background: white; font-size: 12px; font-weight: bold; color: #888; cursor: pointer;
    transition: all 0.15s;
}
.nk-subtab-btn.active {
    background: var(--nk-btn); color: white; border-color: var(--nk-btn);
}
.nk-subtab-content { display: none; }
.nk-subtab-content.active { display: block; }

/* Stats List */
.nk-stats-list { background: white; border-radius: 8px; padding: 10px; border: 1px solid rgba(0,0,0,0.05); }
.nk-stat-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
.nk-stat-row:last-child { border-bottom: none; }

.nk-vocab-list { display: flex; flex-direction: column; gap: 6px; }
.nk-vocab-row {
    display: flex; justify-content: space-between; align-items: center;
    background: white; padding: 8px 12px; border-radius: 6px; border: 1px solid #eee;
}
.nk-ban-btn { background: none; border: none; cursor: pointer; font-size: 16px; opacity: 0.5; }
.nk-ban-btn:hover { opacity: 1; transform: scale(1.2); }

@keyframes nkPulse {
    0%   { transform: scale(1); }
    50%  { transform: scale(1.1); }
    100% { transform: scale(1); }
}

/* Float Effect */
.nk-click-effect {
    pointer-events: none;
    font-weight: bold;
    text-shadow: 1px 1px 0 white;
    animation: nkFloat 0.8s forwards ease-out;
}
@keyframes nkFloat {
    0%   { opacity: 1; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(-40px) scale(1.2); }
}

/* Toast */
.nk-toasts { position: absolute; top: 60px; right: 20px; z-index: 1000; pointer-events: none; }
.nk-toast {
    background: rgba(0,0,0,0.8); color: white; padding: 8px 16px;
    border-radius: 20px; margin-bottom: 5px; font-size: 12px;
    animation: nkFloat 3s forwards;
}

/* Pause overlay */
.nk-pause-overlay {
    position: absolute; inset: 0; z-index: 300;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
}
.nk-pause-dialog {
    background: white; border-radius: 16px; padding: 28px 32px;
    text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}

/* Wipe button */
.nk-hbtn-wipe { background: #c0392b; }

/* Transcendence button */
.nk-hbtn-transcend {
    background: linear-gradient(135deg, #f9ca24, #f0932b);
    color: #333 !important;
    font-weight: bold;
    font-size: 14px;
    animation: nkPulse 2s infinite;
    box-shadow: 0 0 8px rgba(249,202,36,0.5);
}

/* Wipe overlay + dialog */
.nk-wipe-overlay {
    position: absolute; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
}
.nk-wipe-dialog {
    background: white; border-radius: 14px; padding: 20px;
    width: 100%; max-width: 300px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.25);
    display: flex; flex-direction: column; gap: 10px;
}
.nk-wipe-title { font-size: 16px; font-weight: bold; color: #c0392b; }
.nk-wipe-desc  { font-size: 12px; color: #888; margin: 0; }
.nk-wipe-opt {
    background: white; border: 2px solid #eee; border-radius: 10px;
    padding: 12px 14px; cursor: pointer; text-align: left;
    display: flex; flex-direction: column; gap: 2px;
    transition: border-color 0.15s, background 0.15s;
}
.nk-wipe-opt:hover { background: #fafafa; }
.nk-wipe-opt-label { font-size: 13px; font-weight: bold; color: #333; }
.nk-wipe-opt-sub   { font-size: 11px; color: #888; }
.nk-wipe-opt-partial:hover { border-color: #e17055; }
.nk-wipe-opt-partial:hover .nk-wipe-opt-label { color: #e17055; }
.nk-wipe-opt-full:hover { border-color: #c0392b; }
.nk-wipe-opt-full:hover .nk-wipe-opt-label { color: #c0392b; }
.nk-wipe-cancel {
    background: none; border: none; color: #aaa; font-size: 13px;
    cursor: pointer; padding: 4px; text-align: center;
}
.nk-wipe-cancel:hover { color: #555; }

/* Bell upgrade group headers */
.nk-bell-group-title {
    margin-top: 14px;
    margin-bottom: 6px;
    font-size: 11px;
    color: var(--nk-btn);
    border-bottom: 1px solid rgba(255,179,71,0.25);
    padding-bottom: 3px;
}
.nk-bell-group-title:first-child { margin-top: 0; }

/* Leech mechanic */
.nk-leech-badge {
    display: inline-block; background: #e17055; color: white;
    border-radius: 10px; font-size: 10px; font-weight: bold;
    padding: 1px 6px; margin-left: 5px; vertical-align: middle;
}
.nk-leech-toggle-btn {
    display: inline-flex; align-items: center;
    background: #e17055; color: white; border: none;
    padding: 6px 14px; border-radius: 16px; font-size: 12px;
    font-weight: bold; cursor: pointer;
    box-shadow: 0 2px 0 #c0392b;
    transition: opacity 0.15s;
}
.nk-leech-toggle-btn:active { transform: translateY(2px); box-shadow: none; }
.nk-leech-toggle-inactive {
    background: var(--nk-btn); box-shadow: 0 2px 0 #cc8800;
}
.nk-leech-action-btn {
    width: 100%; padding: 9px 16px; border: none; border-radius: 10px;
    font-size: 13px; font-weight: bold; cursor: pointer;
    transition: opacity 0.15s;
}
.nk-leech-action-btn:active { opacity: 0.7; }
.nk-mark-leech-btn {
    background: #fff0ee; color: #e17055;
    border: 2px solid #e17055;
}
.nk-unleech-btn {
    background: var(--nk-success); color: white;
    box-shadow: 0 3px 0 #27ae60;
}
.nk-unleech-btn:active { transform: translateY(3px); box-shadow: none; }

/* Dark Mode */
[data-theme="dark"] .nk-root   { --nk-bg: #2a1f14; --nk-text: #f0d9c0; --nk-panel: #3d2b1a; }[data-theme="dark"] .nk-stats-header,
[data-theme="dark"] .nk-tab-bar,
[data-theme="dark"] .nk-upgrade,
[data-theme="dark"] .nk-dojo-screen,
[data-theme="dark"] .nk-stats-list,[data-theme="dark"] .nk-vocab-row { background: #3d2b1a; border-color: #5a3e2b; }
[data-theme="dark"] .nk-stat-pill { background: #2a1f14; }
[data-theme="dark"] .nk-speech-bubble { background: #3d2b1a; color: white; border-color: #f0d9c0; }
[data-theme="dark"] .nk-speech-bubble::after { border-color: transparent #f0d9c0 transparent transparent; }[data-theme="dark"] .nk-speech-bubble::before { border-color: transparent #3d2b1a transparent transparent; }
[data-theme="dark"] .nk-content-pane { background: #261a0f; }
[data-theme="dark"] .nk-footer { background: #3d2b1a; border-top-color: #5a3e2b; }[data-theme="dark"] .nk-quiz-btn { background: #3d2b1a; border-color: #5a3e2b; color: #f0d9c0; }[data-theme="dark"] .nk-nav-btn.active { background: rgba(255,255,255,0.05); }
[data-theme="dark"] .nk-subtab-btn { background: #3d2b1a; border-color: #5a3e2b; color: #aaa; }
[data-theme="dark"] .nk-subtab-btn.active { background: var(--nk-btn); color: white; border-color: var(--nk-btn); }
`;
    document.head.appendChild(style);
})();