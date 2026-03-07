// js/games/neko/neko.js — NekoNihongo idle + SRS game
// export { init, launch }

import { mountVocabSelector } from '../../vocab_selector.js';

let _screens = null;
let _onExit  = null;
let _selector = null;
let _vocabQueue = []; // words from vocab_selector: { word, furi, trans, status }

const SAVE_KEY = 'neko_nihongo_save';
const BANNED_KEY = 'neko_banned_words';

export function init(screens, onExit) {
    _screens = screens;
    _onExit  = onExit;
}

export function launch() {
    _show('setup');
    _renderSetup();
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

function _startGame() {
    const queue = _selector.getQueue();
    if (!queue.length) return;

    // Convert vocab_selector format → neko internal format
    _vocabQueue = queue.map((w, i) => ({
        id:    i + 1,
        kanji: w.word,
        kana:  w.furi  || w.word,
        eng:   w.trans || '—',
    }));

    _show('game');
    _loadGame();
    _initGameDOM(); 
    _initShops();
    _isCooldown = false; // reset cooldown state
    _updateSRSQueue();
    _updateUI();
    _startGameLoop();
}

// ─── Game State ───────────────────────────────────────────────────────────────

const _defaultIdleUpgrades = () => ({
    box:       { name: 'Cardboard Box',    desc: '+1 Fish/sec',       cost: 50,         costYarn: 0,     count: 0, effect: 1 },
    toy:       { name: 'Feather Wand',     desc: '+5 Fish/sec',       cost: 300,        costYarn: 0,     count: 0, effect: 5 },
    tree:      { name: 'Cat Tree',         desc: '+25 Fish/sec',      cost: 1500,       costYarn: 0,     count: 0, effect: 25 },
    castle:    { name: 'Cardboard Castle', desc: '+100 Fish/sec',     cost: 7500,       costYarn: 2,     count: 0, effect: 100 },
    cafe:      { name: 'Cat Cafe',         desc: '+500 Fish/sec',     cost: 40000,      costYarn: 10,    count: 0, effect: 500 },
    shrine:    { name: 'Cat Shrine',       desc: '+2,000 Fish/sec',   cost: 250000,     costYarn: 50,    count: 0, effect: 2000 },
    cyber:     { name: 'Cyber-Neko',       desc: '+10,000 Fish/sec',  cost: 1000000,    costYarn: 200,   count: 0, effect: 10000 },
    cloud:     { name: 'Cloud Condo',      desc: '+50k Fish/sec',     cost: 5000000,    costYarn: 500,   count: 0, effect: 50000 },
    moon:      { name: 'Moon Base',        desc: '+200k Fish/sec',    cost: 25000000,   costYarn: 1000,  count: 0, effect: 200000 },
    station:   { name: 'Space Station',    desc: '+1M Fish/sec',      cost: 100000000,  costYarn: 2500,  count: 0, effect: 1000000 },
    galaxy:    { name: 'Cat Galaxy',       desc: '+5M Fish/sec',      cost: 500000000,  costYarn: 5000,  count: 0, effect: 5000000 },
    sphere:    { name: 'Dyson Sphere',     desc: '+25M Fish/sec',     cost: 2500000000, costYarn: 10000, count: 0, effect: 25000000 },
    dimension: { name: 'Multiverse Box',   desc: '+100M Fish/sec',    cost: 15000000000,costYarn: 50000, count: 0, effect: 100000000 },
    catnip:    { name: 'Catnip Garden',    desc: '+10% Idle Multiplier',cost: 5000,     costYarn: 5,     count: 0, effect: 1.1 },
});

const _defaultClickUpgrades = () => ({
    finger:   { name: 'Cat Training',      desc: '+1 Fish/Click',    cost: 100,        costYarn: 0,     count: 0, effect: 1 },
    laser:    { name: 'Laser Pointer',     desc: '+5 Fish/Click',    cost: 1000,       costYarn: 1,     count: 0, effect: 5 },
    mouse:    { name: 'Golden Mouse',      desc: '+20 Fish/Click',   cost: 7500,       costYarn: 5,     count: 0, effect: 20 },
    tuna:     { name: 'Tuna Treats',       desc: '+100 Fish/Click',  cost: 30000,      costYarn: 20,    count: 0, effect: 100 },
    collar:   { name: 'Diamond Collar',    desc: '+500 Fish/Click',  cost: 150000,     costYarn: 50,    count: 0, effect: 500 },
    spray:    { name: 'Catnip Spray',      desc: '+2k Fish/Click',   cost: 500000,     costYarn: 100,   count: 0, effect: 2000 },
    robot:    { name: 'Robot Arm',         desc: '+10k Fish/Click',  cost: 2000000,    costYarn: 300,   count: 0, effect: 10000 },
    keyboard: { name: 'Neko Keyboard',     desc: '+25k Fish/Click',  cost: 10000000,   costYarn: 500,   count: 0, effect: 25000 },
    godhand:  { name: 'God Hand',          desc: '+50k Fish/Click',  cost: 50000000,   costYarn: 1000,  count: 0, effect: 50000 },
    hologram: { name: 'Holographic Cat',   desc: '+250k Fish/Click', cost: 300000000,  costYarn: 3000,  count: 0, effect: 250000 },
    quantum:  { name: 'Quantum Paw',       desc: '+1M Fish/Click',   cost: 2000000000, costYarn: 10000, count: 0, effect: 1000000 },
});

const _defaultBellUpgrades = () => ({
    paw:      { name: 'Golden Paw',    desc: '+100% Click Power',           cost: 1,  count: 0, effect: 2.0 },
    tuna:     { name: 'Golden Tuna',   desc: '+100% Idle Power',            cost: 1,  count: 0, effect: 2.0 },
    scholar:  { name: 'Scholar Hat',   desc: '-10% Learn Cost',             cost: 2,  count: 0, effect: 0.9 },
    weaver:   { name: 'Yarn Weaver',   desc: '10% Double Yarn Chance',      cost: 3,  count: 0, effect: 0.1 },
    luck:     { name: 'Omikuji Luck',  desc: '5% Crit Chance (5x)',         cost: 5,  count: 0, effect: 0.05 },
    bank:     { name: 'Maneki Bank',   desc: '+0.1% Interest/Sec',          cost: 10, count: 0, effect: 0.001 },
    discount: { name: 'Merchant Cat',  desc: 'Upgrades 5% Cheaper',         cost: 15, count: 0, effect: 0.95 },
    warp:     { name: 'Time Warp',     desc: '+20% Game Speed (Simulated)', cost: 30, count: 0, effect: 1.2 },
    nap:      { name: 'Cat Nap',       desc: '+50% Passive Prod',           cost: 40, count: 0, effect: 1.5 },
    thread:   { name: 'Golden Thread', desc: '+50% Yarn Gain',              cost: 45, count: 0, effect: 1.5 },
    auto:     { name: 'Auto-Petter',   desc: 'Auto Clicks 10x/sec',         cost: 50, count: 0, effect: 10 },
    charm:    { name: 'Lucky Charm',   desc: 'Crits deal x10 Dmg (not x5)',cost: 75, count: 0, effect: 1 },
});

const _defaultRebirthUpgrades = () => ({
    eternal:     { name: 'Eternal Wealth',   desc: 'Keep 5% Fish/Yarn on Ascend',   cost: 1,  count: 0, effect: 0.05 },
    wisdom:      { name: 'Divine Wisdom',    desc: '-20% Word Learn Cost',           cost: 3,  count: 0, effect: 0.8 },
    bloom:       { name: 'Spirit Bloom',     desc: '+5% Prod per Word Learned',      cost: 5,  count: 0, effect: 0.05 },
    weaver_soul: { name: 'Soul Weaver',      desc: 'Triple Yarn Gain (Passive)',     cost: 8,  count: 0, effect: 3 },
    starter:     { name: 'Ancestral Start',  desc: 'Start Ascend w/ 10 Boxes',      cost: 10, count: 0, effect: 10 },
    guide:       { name: 'Spirit Guide',     desc: 'Global x2.5 Multiplier',         cost: 15, count: 0, effect: 2.5 },
});

let _g = null;   // game state
let _pendingReviews = [];
let _isProcessingAnswer = false;

// Cooldown state machine variables
let _isCooldown = false;
let _cooldownEndTime = 0; 

let _isDebug = false;
let _rafId   = null;
let _saveInterval = null;

function _freshGame() {
    return {
        fish: 0, yarn: 0, bells: 0, karma: 0,
        combo: 0, // Current dojo combo
        lastTick: Date.now(),
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
        srs: [],
        currentCardId: null,
    };
}

// ─── Math ─────────────────────────────────────────────────────────────────────

function _getFishPerSec() {
    let base = 0;
    for (const key in _g.upgrades) {
        if (key !== 'catnip') base += _g.upgrades[key].count * _g.upgrades[key].effect;
    }
    
    // Apply multiplicative bonuses
    let m = 1;
    m *= Math.pow(_g.upgrades.catnip.effect, _g.upgrades.catnip.count);
    m *= Math.pow(_g.bellUpgrades.tuna.effect, _g.bellUpgrades.tuna.count);
    m *= Math.pow(_g.bellUpgrades.warp.effect, _g.bellUpgrades.warp.count);
    m *= Math.pow(_g.bellUpgrades.nap.effect, _g.bellUpgrades.nap.count);
    m *= (1 + (_g.bells * 0.1)); // Additive base from bells
    
    if (_g.rebirthUpgrades.bloom.count > 0) {
        m *= Math.pow(1 + (_g.srs.length * _g.rebirthUpgrades.bloom.effect), _g.rebirthUpgrades.bloom.count);
    }
    m *= Math.pow(_g.rebirthUpgrades.guide.effect, _g.rebirthUpgrades.guide.count);

    // ── Happy Cat Logic ──
    const isHappy = _pendingReviews.length === 0;
    const moodMult = isHappy ? 1.25 : 0.75;
    
    // ── Combo Logic ──
    const comboMult = 1 + Math.log2(1 + _g.combo);

    if (_isDebug) m *= 1000;
    
    return base * m * moodMult * comboMult;
}

function _getClickPower() {
    let base = 1;
    for (const key in _g.clickUpgrades) base += _g.clickUpgrades[key].count * _g.clickUpgrades[key].effect;
    
    let m = 1;
    m *= Math.pow(_g.bellUpgrades.paw.effect, _g.bellUpgrades.paw.count);
    m *= Math.pow(_g.rebirthUpgrades.guide.effect, _g.rebirthUpgrades.guide.count);
    
    if (_isDebug) m *= 1000;
    return base * m;
}

function _getLearnCost() {
    const base    = 50 + (_g.srs.length * 125);
    const scholar = Math.pow(_g.bellUpgrades.scholar.effect, _g.bellUpgrades.scholar.count);
    const wisdom  = Math.pow(_g.rebirthUpgrades.wisdom.effect, _g.rebirthUpgrades.wisdom.count);
    return Math.max(10, Math.floor(base * scholar * wisdom));
}

function _calcBells()   { return _g.fish < 10000    ? 0 : Math.floor(Math.pow(_g.fish  / 10000, 0.5)); }
function _calcSpirits() { return _g.bells < 100     ? 0 : Math.floor(_g.bells / 50); }

// ─── Helper: Time Formatter ───────────────────────────────────────────────────

function _formatTime(sec) {
    if (sec <= 0) return 'Ready';
    if (sec < 60) return Math.floor(sec) + 's';
    if (sec < 3600) return Math.floor(sec/60) + 'm ' + Math.floor(sec%60) + 's';
    if (sec < 86400) return Math.floor(sec/3600) + 'h ' + Math.floor((sec%3600)/60) + 'm';
    return Math.floor(sec/86400) + 'd ' + Math.floor((sec%86400)/3600) + 'h';
}

// ─── Persistence ──────────────────────────────────────────────────────────────

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
        _g.combo = p.combo || 0;
        _g.srs   = p.srs   || [];
        
        if (p.stats) _g.stats = { ..._g.stats, ...p.stats };

        ['upgrades','clickUpgrades','bellUpgrades','rebirthUpgrades'].forEach(type => {
            if (p[type]) {
                for (const k in p[type]) {
                    if (_g[type][k]) _g[type][k].count = p[type][k].count || 0;
                }
            }
        });

        const validIds = new Set(_vocabQueue.map(v => v.id));
        _g.srs = _g.srs.filter(s => validIds.has(s.id));

    } catch { _g = _freshGame(); }
}

// ─── Game Loop ────────────────────────────────────────────────────────────────

function _startGameLoop() {
    if (_rafId) cancelAnimationFrame(_rafId);
    if (_saveInterval) clearInterval(_saveInterval);

    _saveInterval = setInterval(() => _saveGame(false), 10000);

    function loop() {
        if (!_screens.game || _screens.game.style.display === 'none') {
            _rafId = requestAnimationFrame(loop);
            return;
        }

        const now   = Date.now();
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
            const decayRate = 0.1 + (_g.combo * 0.05);
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
        if (_isCooldown) {
            const cdTimer = document.getElementById('nk-cooldown-timer');
            if (cdTimer) {
                const remaining = (_cooldownEndTime - now) / 1000;
                if (remaining > 0) cdTimer.textContent = remaining.toFixed(1) + 's';
            }
        } else if (_pendingReviews.length === 0) {
            const nextTimer = document.getElementById('nk-next-review-timer');
            if (nextTimer) {
                if (_g.srs.length > 0) {
                    const next = Math.min(..._g.srs.map(s => s.nextReview));
                    const diffSec = (next - now) / 1000;
                    if (diffSec <= 0) {
                        nextTimer.textContent = "Cat is waking up...";
                    } else {
                        nextTimer.textContent = `Next cat in: ${_formatTime(diffSec)}`;
                    }
                } else {
                    nextTimer.textContent = "Learn a word to start!";
                }
            }
        }

        _updateUI();
        _rafId = requestAnimationFrame(loop);
    }
    _rafId = requestAnimationFrame(loop);
}

function _stopGameLoop() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_saveInterval) { clearInterval(_saveInterval); _saveInterval = null; }
}

// ─── Interactions ─────────────────────────────────────────────────────────────

function _petCat(e) {
    let power  = _getClickPower();
    let isCrit = false;
    const critChance = _g.bellUpgrades.luck.count * _g.bellUpgrades.luck.effect;
    if (Math.random() < critChance) {
        power  *= (_g.bellUpgrades.charm.count > 0) ? 10 : 5;
        isCrit  = true;
    }
    _g.fish += power;
    _g.stats.fishEarned += power;
    _g.stats.clicks++;

    _spawnFloatingText(e.clientX, e.clientY, `+${Math.floor(power).toLocaleString()}`, isCrit ? '#ff4b4b' : null, isCrit ? 24 : 18);
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
        const cost = upg.cost + upg.count;
        if (_g.bells >= cost) { _g.bells -= cost; upg.count++; _updateUI(); }
    } else if (shopType === 'rebirthUpgrades') {
        const cost = upg.cost * Math.pow(2, upg.count);
        if (_g.karma >= cost) { _g.karma -= cost; upg.count++; _updateUI(); }
    } else {
        const discount = Math.pow(_g.bellUpgrades.discount.effect, _g.bellUpgrades.discount.count);
        const costFish = Math.floor(upg.cost * Math.pow(1.15, upg.count) * discount);
        if (_g.fish >= costFish && _g.yarn >= upg.costYarn) {
            _g.fish -= costFish;
            _g.yarn -= upg.costYarn;
            upg.count++;
            _updateUI();
        }
    }
}

function _ascend() {
    const earned = _calcBells();
    if (earned <= 0) { alert('Need 10,000 Fish to Ascend!'); return; }
    if (!confirm(`Ascend for +${earned} 🔔? Resets Fish/Yarn/Basic Upgrades.`)) return;
    const keep = _g.rebirthUpgrades.eternal.count * _g.rebirthUpgrades.eternal.effect;
    _g.bells += earned;
    _g.fish   = Math.floor(_g.fish * keep);
    _g.yarn   = Math.floor(_g.yarn * keep);
    _g.combo  = 0;
    for (const k in _g.upgrades)      _g.upgrades[k].count      = 0;
    for (const k in _g.clickUpgrades) _g.clickUpgrades[k].count = 0;
    if (_g.rebirthUpgrades.starter.count > 0) _g.upgrades.box.count = 10;
    _saveGame();
    _updateUI();
    _toast(`Ascended! +${earned} Bells`, 'var(--nk-gold)');
}

function _rebirth() {
    const earned = _calcSpirits();
    if (earned <= 0) { alert('Need 100 Bells to Rebirth!'); return; }
    if (!confirm(`REBIRTH? Reset EVERYTHING (including Bells) for +${earned} 👻 Spirits?`)) return;
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
    _toast(`REBIRTH! +${earned} Spirits`, 'var(--nk-spirit)');
}

function _banWord(word) {
    if (!confirm(`Ban "${word}"? It will stop appearing in the Dojo.`)) return;
    
    const banned = JSON.parse(localStorage.getItem(BANNED_KEY)) || [];
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

// ─── SRS ──────────────────────────────────────────────────────────────────────

function _learnNewWord() {
    const cost = _getLearnCost();
    if (_g.fish < cost) { _toast('Not enough fish!', '#ff6b6b'); return; }

    const learnedIds = new Set(_g.srs.map(s => s.id));
    const available  = _vocabQueue.filter(v => !learnedIds.has(v.id));
    if (available.length === 0) { _toast('All words learned!', 'var(--nk-success)'); return; }

    _g.fish -= cost;
    const w = available[0];
    
    // Start interval small in seconds to keep game flowing quickly
    _g.srs.push({ id: w.id, nextReview: Date.now(), interval: 15, ease: 2.5 });
    
    _g.stats.wordsLearned++;
    _updateSRSQueue();
    _updateUI();
}

function _updateSRSQueue() {
    const now    = Date.now();
    _pendingReviews = _g.srs.filter(s => s.nextReview <= now);

    const pendingEl  = _screens.game?.querySelector('.nk-pending-count');
    const buffEl     = _screens.game?.querySelector('.nk-buff-row');
    
    if (pendingEl) pendingEl.textContent = _pendingReviews.length;

    // Happy Cat Buff UI
    if (buffEl) {
        const isHappy = _pendingReviews.length === 0;
        if (isHappy) {
            buffEl.innerHTML = `<span>✨ Happy Cat:</span><span>+25% Production</span>`;
            buffEl.style.color = 'var(--nk-success)';
            buffEl.style.display = 'flex';
        } else {
            buffEl.style.display = 'none';
        }
    }

    const sleepScrn = _screens.game?.querySelector('#nk-dojo-sleep');
    const coolScrn  = _screens.game?.querySelector('#nk-dojo-cooldown');
    const quizScrn  = _screens.game?.querySelector('#nk-dojo-quiz');

    if (!sleepScrn || !coolScrn || !quizScrn) return;

    sleepScrn.style.display = 'none';
    coolScrn.style.display = 'none';
    quizScrn.style.display = 'none';

    if (_isCooldown) {
        coolScrn.style.display = 'flex';
    } else if (_pendingReviews.length > 0) {
        quizScrn.style.display = 'flex';
        if (!_g.currentCardId) _loadFlashcard();
    } else {
        sleepScrn.style.display = 'flex';
        _g.currentCardId = null;
    }
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
    if (!kanjiEl || !gridEl) return;

    kanjiEl.textContent = correct.kanji; 
    if (furiEl) furiEl.textContent = correct.kana;

    // 3 distractors
    const pool        = _vocabQueue.filter(v => v.id !== correct.id);
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
        if (_g.rebirthUpgrades.weaver_soul.count > 0) yarn *= 3;
        
        _g.yarn += yarn;
        _g.combo += 1;
        if (_g.combo > _g.stats.highestCombo) _g.stats.highestCombo = _g.combo;
        _g.stats.correct++;
        _g.stats.yarnEarned += yarn;

        // Interval math in seconds
        srsItem.interval   = Math.round(srsItem.interval * srsItem.ease * 1.5);
        srsItem.nextReview = Date.now() + srsItem.interval * 1000;

        if (event) {
            _spawnFloatingText(event.clientX, event.clientY, `+${yarn} 🧶`, 'var(--nk-success)', 22);
            if (_g.combo > 1) {
                setTimeout(() => {
                    _spawnFloatingText(event.clientX, event.clientY - 30, `${Math.floor(_g.combo)}x Combo!`, 'var(--nk-gold)', 16);
                }, 150);
            }
        }

        const baseCooldown = 3000; 
        const reduction = _g.srs.length * 50; 
        const delay = Math.max(0, baseCooldown - reduction);

        if (delay > 200) {
            _isCooldown = true;
            _cooldownEndTime = Date.now() + delay;
            _updateSRSQueue(); // Show cooldown screen
            
            setTimeout(() => {
                _g.currentCardId = null;
                _isCooldown = false;
                _updateSRSQueue();
                _updateUI();
            }, delay);
        } else {
            // Skip cooldown screen entirely if it's too fast
            _g.currentCardId = null;
            _updateSRSQueue();
            _updateUI();
        }

    } else {
        // Wrong
        btnEl.classList.add('nk-quiz-wrong');
        srsItem.interval   = 15; // Reset to 15 seconds
        srsItem.ease       = Math.max(1.3, srsItem.ease - 0.2);
        srsItem.nextReview = Date.now() + 15000;
        
        _g.combo = Math.floor(_g.combo / 2); // Halve the combo instead of full reset
        _g.stats.wrong++;

        if (event) _spawnFloatingText(event.clientX, event.clientY, `❌`, '#ff4b4b', 28);

        setTimeout(() => {
            _g.currentCardId = null;
            _isCooldown = false; 
            _updateSRSQueue();
            _updateUI();
        }, 1200);
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
        <div class="nk-topbar-title">🐾 NekoNihongo</div>
        <div class="nk-topbar-btns">
            <button class="nk-hbtn nk-hbtn-gold" id="nk-ascend-btn">Ascend</button>
            <button class="nk-hbtn nk-hbtn-spirit" id="nk-rebirth-btn" style="display:${showSpirit?'inline-block':'none'};">Rebirth</button>
            <button class="nk-hbtn" id="nk-save-btn">Save</button>
            <button class="nk-hbtn nk-hbtn-danger" id="nk-quit-btn">✕</button>
        </div>
    </div>

    <!-- Stats Header with Clicker Cat -->
    <div class="nk-stats-header">
        <div id="nk-cat" class="nk-header-cat">🐱</div>
        <div class="nk-stats-wrapper">
            <div class="nk-stat-row-top">
                <div class="nk-stat-pill">🐟 <span class="nk-val-fish">0</span></div>
                <div class="nk-stat-pill">🧶 <span class="nk-val-yarn">0</span></div>
                <div class="nk-stat-pill nk-bell-color">🔔 <span class="nk-val-bells">0</span></div>
                <div class="nk-stat-pill nk-spirit-color" id="nk-karma-pill" style="display:${showSpirit?'flex':'none'};">👻 <span class="nk-val-karma">0</span></div>
            </div>
            <div class="nk-stat-sub">
                <span class="nk-val-fps">0</span>/s • <span class="nk-val-cpc">1</span>/click • Combo: <span class="nk-val-combo">0</span>
            </div>
            <div class="nk-buff-row" style="display:none;"></div>
        </div>
    </div>

    <!-- NEW LOCATION: Bottom Tab Bar Moved to Top (below stats) -->
    <div class="nk-tab-bar">
        <button class="nk-nav-btn active" data-target="click">👆 Click</button>
        <button class="nk-nav-btn" data-target="idle">📦 Idle</button>
        <button class="nk-nav-btn" data-target="dojo">🧠 Dojo</button>
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

            <!-- 1. Sleep State -->
            <div id="nk-dojo-sleep" style="display:none;" class="nk-dojo-screen">
                <div style="font-size:50px;">💤</div>
                <p style="font-weight:bold; margin-top:10px;">Cat is napping.</p>
                <p style="color:#888;">You have the Happy Bonus!</p>
                <div id="nk-next-review-timer" style="margin: 15px 0; font-weight: bold; color: var(--nk-btn); font-size: 14px;">Next cat in: --</div>
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
                <div id="nk-vocab-list" class="nk-vocab-list"></div>
            </div>
        </div>

        <!-- SPIRIT TAB -->
        <div class="nk-tab-content" id="nk-tab-spirit">
            <div class="nk-shop-title">Divine Upgrades</div>
            <div class="nk-upgrades" id="nk-upg-rebirth"></div>
        </div>

    </div>

    <div class="nk-toasts" id="nk-toasts"></div>
</div>`;

    el.querySelector('#nk-save-btn').addEventListener('click', () => _saveGame(true));
    el.querySelector('#nk-ascend-btn').addEventListener('click', _ascend);
    el.querySelector('#nk-rebirth-btn').addEventListener('click', _rebirth);
    el.querySelector('#nk-learn-btn').addEventListener('click', _learnNewWord);
    el.querySelector('#nk-cat').addEventListener('click', (e) => _petCat(e));

    el.querySelector('#nk-quit-btn').addEventListener('click', () => {
        if (confirm('Quit to Games menu? Your progress is saved.')) {
            _saveGame();
            _stopGameLoop();
            _onExit();
        }
    });

    el.querySelectorAll('.nk-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => _switchTab(btn.getAttribute('data-target')));
    });

    el.querySelectorAll('.nk-subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => _switchSubtab(btn.getAttribute('data-subtarget')));
    });
}

// ─── Shop DOM ─────────────────────────────────────────────────────────────────

function _initShops() {
    _renderShop('clickUpgrades', 'nk-upg-click',   'c', false, false);
    _renderShop('upgrades',      'nk-upg-idle',     'i', false, false);
    _renderShop('bellUpgrades',  'nk-upg-bells',    'b', true,  false);
    _renderShop('rebirthUpgrades','nk-upg-rebirth', 'r', false, true);
}

function _renderShop(shopKey, containerId, prefix, isBell, isRebirth) {
    const container = _screens.game?.querySelector(`#${containerId}`);
    if (!container) return;
    container.innerHTML = '';
    for (const key in _g[shopKey]) {
        const upg = _g[shopKey][key];
        const div = document.createElement('div');
        div.className = 'nk-upgrade' + (isBell ? ' nk-upg-bell' : isRebirth ? ' nk-upg-rebirth' : '');
        div.innerHTML = `
            <div class="nk-upg-info">
                <strong>${upg.name}</strong>
                <span class="nk-upg-lvl" id="nk-lvl-${prefix}-${key}">(Lvl ${upg.count})</span><br>
                <small>${upg.desc}</small>
            </div>
            <button class="nk-upg-btn" id="nk-btn-${prefix}-${key}">Buy</button>`;
        div.querySelector('.nk-upg-btn').addEventListener('click', () => _buyUpgrade(shopKey, key));
        container.appendChild(div);
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
            <div class="nk-stat-row"><span>🐟 Fish (current)</span><span>${Math.floor(_g.fish).toLocaleString()}</span></div>
            <div class="nk-stat-row"><span>🐟 Total Fish Earned</span><span>${Math.floor(_g.stats.fishEarned).toLocaleString()}</span></div>
            <div class="nk-stat-row"><span>🧶 Yarn (current)</span><span>${_g.yarn.toLocaleString()}</span></div>
            <div class="nk-stat-row"><span>🧶 Total Yarn Earned</span><span>${_g.stats.yarnEarned.toLocaleString()}</span></div>
            <div class="nk-stat-row"><span>🔔 Bells</span><span>${_g.bells.toLocaleString()}</span></div>
            <div class="nk-stat-row"><span>👻 Spirits</span><span>${_g.karma.toLocaleString()}</span></div>
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
            <div class="nk-stat-row"><span>⚡ Fish / Second</span><span>${Math.floor(fps).toLocaleString()}</span></div>
            <div class="nk-stat-row"><span>👆 Fish / Click</span><span>${Math.floor(cpc).toLocaleString()}</span></div>
            <div class="nk-stat-row"><span>🤖 Auto-Clicks / Sec</span><span>${autoClicks > 0 ? autoClicks.toLocaleString() : '—'}</span></div>
            <div class="nk-stat-row"><span>📈 Effective Total / Sec</span><span>${Math.floor(effectiveCps).toLocaleString()}</span></div>
            <div class="nk-stat-row"><span>👆 Total Clicks</span><span>${_g.stats.clicks.toLocaleString()}</span></div>
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
        const now = Date.now();
        const pending  = _pendingReviews.length;
        const due      = _g.srs.filter(s => s.nextReview <= now).length;

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
        dojoEl.innerHTML = `
            <div class="nk-stat-row"><span>📚 Words Learned</span><span>${learned} / ${total}</span></div>
            <div class="nk-stat-row"><span>➕ Words Remaining</span><span>${remaining}</span></div>
            <div class="nk-stat-row"><span>⏳ Reviews Due Now</span><span>${due > 0 ? '<span style="color:#e17055;font-weight:bold;">' + due + '</span>' : '0'}</span></div>
            <div class="nk-stat-row"><span>⏱️ Next Review In</span><span id="nk-stats-next-review">${nextReviewText}</span></div>
            <div class="nk-stat-row"><span>⏸️ Cooldown</span><span id="nk-stats-cooldown">${cooldownText}</span></div>
            <div class="nk-stat-row"><span>✅ Correct Answers</span><span>${_g.stats.correct.toLocaleString()}</span></div>
            <div class="nk-stat-row"><span>❌ Wrong Answers</span><span>${_g.stats.wrong.toLocaleString()}</span></div>
            <div class="nk-stat-row"><span>🎯 Accuracy</span><span>${accuracy}%</span></div>
            <div class="nk-stat-row"><span>💰 Next Learn Cost</span><span>${learnCost.toLocaleString()} 🐟</span></div>
            <div class="nk-stat-row"><span>📝 Words Studied (Total)</span><span>${_g.stats.wordsLearned}</span></div>
        `;
    }

    // ── Progression ───────────────────────────────────────────────────────────
    const progEl = g.querySelector('#nk-stats-progression');
    if (progEl) {
        const bellsNeeded  = 10000;
        const spiritsNeeded = 100;
        const bellProgress  = Math.min(100, Math.floor((_g.fish / bellsNeeded) * 100));
        const nextBells     = _calcBells();
        const nextSpirits   = _calcSpirits();
        progEl.innerHTML = `
            <div class="nk-stat-row"><span>🔔 Ascension Bells Earned</span><span>${_g.bells.toLocaleString()}</span></div>
            <div class="nk-stat-row"><span>🔔 Next Ascend Reward</span><span>+${nextBells} Bell${nextBells !== 1 ? 's' : ''}</span></div>
            <div class="nk-stat-row"><span>📊 Ascend Progress</span><span>${bellProgress}% (need 10k 🐟)</span></div>
            <div class="nk-stat-row"><span>👻 Spirits (Karma)</span><span>${_g.karma.toLocaleString()}</span></div>
            <div class="nk-stat-row"><span>👻 Next Rebirth Reward</span><span>${nextSpirits > 0 ? '+' + nextSpirits + ' Spirit' + (nextSpirits !== 1 ? 's' : '') : 'Need 100 Bells'}</span></div>
            <div class="nk-stat-row"><span>📈 Global Prod. Multiplier</span><span>×${(1 + (_g.bells * 0.1)).toFixed(2)} (from bells)</span></div>
        `;
    }

    // ── Vocabulary subtab ─────────────────────────────────────────────────────
    _renderVocabList();
}

function _renderVocabList() {
    const g = _screens.game;
    if (!g) return;

    const now    = Date.now();
    const total  = _vocabQueue.length;
    const learned = _g.srs.length;
    const due    = _g.srs.filter(s => s.nextReview <= now).length;

    const summaryEl = g.querySelector('#nk-vocab-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="nk-stat-row"><span>📚 Total Vocabulary</span><span>${total}</span></div>
            <div class="nk-stat-row"><span>✅ Learned</span><span>${learned}</span></div>
            <div class="nk-stat-row"><span>🔓 Unleaned</span><span>${total - learned}</span></div>
            <div class="nk-stat-row"><span>⏳ Due for Review</span><span>${due > 0 ? '<span style="color:#e17055;font-weight:bold;">' + due + '</span>' : '0'}</span></div>
        `;
    }

    const vocList = g.querySelector('#nk-vocab-list');
    if (!vocList) return;
    vocList.innerHTML = '';
    if (_g.srs.length === 0) {
        vocList.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">No words learned yet. Go to the Dojo!</div>`;
        return;
    }

    const sortedSrs = [..._g.srs].sort((a,b) => a.nextReview - b.nextReview);
    sortedSrs.forEach(item => {
        const wordData = _vocabQueue.find(v => v.id === item.id);
        if (!wordData) return;
        const isDue      = item.nextReview <= now;
        const waitText   = isDue ? 'Due now!' : _formatTime((item.nextReview - now) / 1000);
        const intervalText = _formatTime(item.interval);
        const row = document.createElement('div');
        row.className = 'nk-vocab-row';
        row.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:bold; font-size:16px;">${wordData.kanji}</div>
                <div style="font-size:12px; color:var(--text-muted);">${wordData.kana} · ${wordData.eng}</div>
            </div>
            <div style="text-align:right; margin-right: 12px; min-width:80px;">
                <div style="font-size:10px; color:#888;">Next review</div>
                <div style="font-size:12px; font-weight:bold; color:${isDue ? '#e17055' : 'var(--nk-btn)'};">${waitText}</div>
                <div style="font-size:10px; color:#aaa;">interval: ${intervalText}</div>
            </div>
            <button class="nk-ban-btn" title="Ban from Dojo">🚫</button>
        `;
        row.querySelector('.nk-ban-btn').addEventListener('click', () => _banWord(wordData.kanji));
        vocList.appendChild(row);
    });
}

// ─── UI Update ────────────────────────────────────────────────────────────────

function _updateUI() {
    const g = _screens.game;
    if (!g || g.style.display === 'none') return;

    const setTxt = (sel, val) => { const el = g.querySelector(sel); if (el) el.textContent = val; };

    setTxt('.nk-val-fish',  Math.floor(_g.fish).toLocaleString());
    setTxt('.nk-val-yarn',  _g.yarn.toLocaleString());
    setTxt('.nk-val-bells', _g.bells.toLocaleString());
    setTxt('.nk-val-karma', _g.karma.toLocaleString());
    setTxt('.nk-val-fps',   Math.floor(_getFishPerSec()).toLocaleString());
    setTxt('.nk-val-cpc',   Math.floor(_getClickPower()).toLocaleString());
    setTxt('.nk-val-combo', _g.combo.toFixed(1)); // Show decimal to make decay visible

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
                const cost = upg.cost + upg.count;
                const btn  = g.querySelector(`#nk-btn-b-${key}`);
                const lvl  = g.querySelector(`#nk-lvl-b-${key}`);
                if (lvl) lvl.textContent = `(Lvl ${upg.count})`;
                if (btn) { btn.textContent = `${cost} 🔔`; btn.disabled = _g.bells < cost; }
            }
            setTxt('#nk-ascend-btn', `Ascend (+${_calcBells()})`);
        }
        if (activeTab.id === 'nk-tab-spirit') {
            for (const key in _g.rebirthUpgrades) {
                const upg  = _g.rebirthUpgrades[key];
                const cost = upg.cost * Math.pow(2, upg.count);
                const btn  = g.querySelector(`#nk-btn-r-${key}`);
                const lvl  = g.querySelector(`#nk-lvl-r-${key}`);
                if (lvl) lvl.textContent = `(Lvl ${upg.count})`;
                if (btn) { btn.textContent = `${cost} 👻`; btn.disabled = _g.karma < cost; }
            }
            setTxt('#nk-rebirth-btn', `Rebirth (+${_calcSpirits()})`);
        }
        if (activeTab.id === 'nk-tab-stats') {
            // Live-tick the timers inside stats without full re-render
            const now = Date.now();
            const nextRevEl = g.querySelector('#nk-stats-next-review');
            if (nextRevEl) {
                if (_pendingReviews.length > 0) {
                    nextRevEl.textContent = 'Now!';
                } else if (_g.srs.length > 0) {
                    const nextTime = Math.min(..._g.srs.map(s => s.nextReview));
                    const diff = (nextTime - now) / 1000;
                    nextRevEl.textContent = diff <= 0 ? 'Now!' : _formatTime(diff);
                }
            }
            const cdEl = g.querySelector('#nk-stats-cooldown');
            if (cdEl) {
                if (_isCooldown) {
                    const rem = (_cooldownEndTime - now) / 1000;
                    cdEl.textContent = rem > 0 ? rem.toFixed(1) + 's' : 'Done';
                } else {
                    cdEl.textContent = '—';
                }
            }
        }
    }

    const learnBtn = g.querySelector('#nk-learn-btn');
    if (learnBtn) {
        const cost     = _getLearnCost();
        const mastered = _g.srs.length >= _vocabQueue.length;
        if (mastered) {
            learnBtn.textContent = 'Mastery Achieved!';
            learnBtn.disabled    = true;
        } else {
            learnBtn.textContent = `Study (${cost.toLocaleString()} 🐟)`;
            learnBtn.disabled    = _g.fish < cost;
        }
    }
}

function _updateShopBtns(shopKey, prefix) {
    const g        = _screens.game;
    const discount = Math.pow(_g.bellUpgrades.discount.effect, _g.bellUpgrades.discount.count);
    for (const key in _g[shopKey]) {
        const upg      = _g[shopKey][key];
        const costFish = Math.floor(upg.cost * Math.pow(1.15, upg.count) * discount);
        const btn      = g?.querySelector(`#nk-btn-${prefix}-${key}`);
        const lvl      = g?.querySelector(`#nk-lvl-${prefix}-${key}`);
        if (lvl) lvl.textContent = `(Lvl ${upg.count})`;
        if (btn) {
            btn.textContent = `${costFish.toLocaleString()}🐟${upg.costYarn > 0 ? ` ${upg.costYarn}🧶` : ''}`;
            btn.disabled    = (_g.fish < costFish || _g.yarn < upg.costYarn);
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
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    flex-shrink: 0;
    z-index: 20;
}
.nk-topbar-title { font-size: 18px; font-weight: bold; }
.nk-topbar-btns  { display: flex; gap: 6px; }
.nk-hbtn {
    background: var(--nk-btn); border: none; padding: 6px 10px;
    border-radius: 5px; color: white; cursor: pointer; font-weight: bold; font-size: 12px;
}
.nk-hbtn-gold        { background: var(--nk-gold);   color: #333; }
.nk-hbtn-spirit      { background: var(--nk-spirit); }
.nk-hbtn-danger      { background: #888; }

/* Stats Header */
.nk-stats-header {
    background: white;
    padding: 10px;
    border-bottom: 1px solid rgba(0,0,0,0.05);
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 15px;
}
.nk-header-cat {
    font-size: 40px;
    cursor: pointer;
    user-select: none;
    line-height: 1;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.1));
    transition: transform 0.05s;
}
.nk-header-cat:active { transform: scale(0.9); }

.nk-stats-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.nk-stat-row-top {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}
.nk-stat-pill {
    background: var(--nk-bg);
    padding: 3px 8px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 4px;
}
.nk-stat-sub {
    font-size: 11px;
    color: #888;
}
.nk-bell-color { color: #b8860b; }
.nk-spirit-color { color: #a55eea; }
.nk-buff-row {
    width: 100%; justify-content: flex-start; gap:8px;
    margin-top:2px; font-weight:bold; font-size:11px;
    align-items: center;
}

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
    /* Important for mobile scroll behavior */
    -webkit-overflow-scrolling: touch; 
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

/* Dark Mode */
[data-theme="dark"] .nk-root   { --nk-bg: #2a1f14; --nk-text: #f0d9c0; --nk-panel: #3d2b1a; }
[data-theme="dark"] .nk-stats-header,
[data-theme="dark"] .nk-tab-bar,
[data-theme="dark"] .nk-upgrade,
[data-theme="dark"] .nk-dojo-screen,
[data-theme="dark"] .nk-stats-list,
[data-theme="dark"] .nk-vocab-row { background: #3d2b1a; border-color: #5a3e2b; }
[data-theme="dark"] .nk-stat-pill { background: #2a1f14; }
[data-theme="dark"] .nk-speech-bubble { background: #3d2b1a; color: white; border-color: #f0d9c0; }
[data-theme="dark"] .nk-speech-bubble::after { border-color: transparent #f0d9c0 transparent transparent; }
[data-theme="dark"] .nk-speech-bubble::before { border-color: transparent #3d2b1a transparent transparent; }
[data-theme="dark"] .nk-content-pane { background: #261a0f; }
[data-theme="dark"] .nk-quiz-btn { background: #3d2b1a; border-color: #5a3e2b; color: #f0d9c0; }
[data-theme="dark"] .nk-nav-btn.active { background: rgba(255,255,255,0.05); }
[data-theme="dark"] .nk-subtab-btn { background: #3d2b1a; border-color: #5a3e2b; color: #aaa; }
[data-theme="dark"] .nk-subtab-btn.active { background: var(--nk-btn); color: white; border-color: var(--nk-btn); }
`;
    document.head.appendChild(style);
})();