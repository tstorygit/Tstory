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
    _vocabQueue = queue.map((w) => ({
        id:    w.word,   // stable string ID — survives reordering & restarts
        kanji: w.word,
        kana:  w.furi  || w.word,
        eng:   w.trans || '—',
    }));

    _show('game');
    _loadGame();

    // Give 3 free starter words on a brand-new save
    if (_g.srs.length === 0 && _vocabQueue.length >= 3) {
        for (let i = 0; i < 3; i++) {
            const w = _vocabQueue[i];
            _g.srs.push({ id: w.id, nextReview: Date.now(), interval: 8, ease: 1.5 });
        }
        _g.stats.wordsLearned += 3;
    }

    _initGameDOM(); 
    _initShops();
    _isCooldown = false;
    _updateSRSQueue();
    _updateUI();
    _startGameLoop();
}

// ─── Game State ───────────────────────────────────────────────────────────────

const _defaultIdleUpgrades = () => ({
    // Each tier costs ~100× its own effect in fish (payoff ~100s at base rate)
    // Level scaling ×1.18 per purchase keeps curves tight
    box:       { name: 'Cardboard Box',    desc: '+1 Fish/sec',        cost: 80,          costYarn: 0,     count: 0, effect: 1 },
    toy:       { name: 'Feather Wand',     desc: '+4 Fish/sec',        cost: 500,         costYarn: 0,     count: 0, effect: 4 },
    tree:      { name: 'Cat Tree',         desc: '+15 Fish/sec',       cost: 2500,        costYarn: 0,     count: 0, effect: 15 },
    castle:    { name: 'Cardboard Castle', desc: '+60 Fish/sec',       cost: 12000,       costYarn: 3,     count: 0, effect: 60 },
    cafe:      { name: 'Cat Cafe',         desc: '+250 Fish/sec',      cost: 60000,       costYarn: 8,     count: 0, effect: 250 },
    shrine:    { name: 'Cat Shrine',       desc: '+1,000 Fish/sec',    cost: 400000,      costYarn: 30,    count: 0, effect: 1000 },
    cyber:     { name: 'Cyber-Neko',       desc: '+4,000 Fish/sec',    cost: 2000000,     costYarn: 100,   count: 0, effect: 4000 },
    cloud:     { name: 'Cloud Condo',      desc: '+16,000 Fish/sec',   cost: 10000000,    costYarn: 300,   count: 0, effect: 16000 },
    moon:      { name: 'Moon Base',        desc: '+65,000 Fish/sec',   cost: 50000000,    costYarn: 700,   count: 0, effect: 65000 },
    station:   { name: 'Space Station',    desc: '+260,000 Fish/sec',  cost: 250000000,   costYarn: 1500,  count: 0, effect: 260000 },
    galaxy:    { name: 'Cat Galaxy',       desc: '+1M Fish/sec',       cost: 1250000000,  costYarn: 4000,  count: 0, effect: 1000000 },
    sphere:    { name: 'Dyson Sphere',     desc: '+4M Fish/sec',       cost: 6000000000,  costYarn: 8000,  count: 0, effect: 4000000 },
    dimension: { name: 'Multiverse Box',   desc: '+16M Fish/sec',      cost: 30000000000, costYarn: 20000, count: 0, effect: 16000000 },
    catnip:    { name: 'Catnip Garden',    desc: '+8% Idle Multiplier', cost: 8000,        costYarn: 8,     count: 0, effect: 1.08 },
});

const _defaultClickUpgrades = () => ({
    // Click power ≈ 2s of idle at equivalent tier
    finger:   { name: 'Cat Training',      desc: '+1 Fish/Click',     cost: 120,        costYarn: 0,    count: 0, effect: 1 },
    laser:    { name: 'Laser Pointer',     desc: '+4 Fish/Click',     cost: 800,        costYarn: 0,    count: 0, effect: 4 },
    mouse:    { name: 'Golden Mouse',      desc: '+15 Fish/Click',    cost: 4000,       costYarn: 3,    count: 0, effect: 15 },
    tuna:     { name: 'Tuna Treats',       desc: '+60 Fish/Click',    cost: 20000,      costYarn: 10,   count: 0, effect: 60 },
    collar:   { name: 'Diamond Collar',    desc: '+250 Fish/Click',   cost: 100000,     costYarn: 25,   count: 0, effect: 250 },
    spray:    { name: 'Catnip Spray',      desc: '+1,000 Fish/Click', cost: 700000,     costYarn: 60,   count: 0, effect: 1000 },
    robot:    { name: 'Robot Arm',         desc: '+4,000 Fish/Click', cost: 3500000,    costYarn: 150,  count: 0, effect: 4000 },
    keyboard: { name: 'Neko Keyboard',     desc: '+16k Fish/Click',   cost: 18000000,   costYarn: 350,  count: 0, effect: 16000 },
    godhand:  { name: 'God Hand',          desc: '+65k Fish/Click',   cost: 90000000,   costYarn: 700,  count: 0, effect: 65000 },
    hologram: { name: 'Holographic Cat',   desc: '+260k Fish/Click',  cost: 450000000,  costYarn: 2000, count: 0, effect: 260000 },
    quantum:  { name: 'Quantum Paw',       desc: '+1M Fish/Click',    cost: 2500000000, costYarn: 6000, count: 0, effect: 1000000 },
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

// ─── Number Formatting ────────────────────────────────────────────────────────
// 'suffix' → 1.23 M  |  'sci' → 1.23e6
let _numFmtStyle = localStorage.getItem('neko_numfmt') || 'suffix';

const _NUM_SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd'];

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
    m *= (1 + (_g.bells * 0.05)); // +5% prod per bell (was 10%)
    
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

    // Happy Cat and Combo also apply to clicks
    const isHappy = _pendingReviews.length === 0;
    m *= isHappy ? 1.25 : 0.75;
    m *= 1 + Math.log2(1 + _g.combo);
    
    if (_isDebug) m *= 1000;
    return base * m;
}

function _getMultiplierBreakdown() {
    const isHappy   = _pendingReviews.length === 0;
    const moodMult  = isHappy ? 1.25 : 0.75;
    const comboMult = 1 + Math.log2(1 + _g.combo);

    // ── Idle base (additive upgrades) ──
    let idleBase = 0;
    for (const key in _g.upgrades) {
        if (key !== 'catnip') idleBase += _g.upgrades[key].count * _g.upgrades[key].effect;
    }

    // ── Click base (additive upgrades) ──
    let clickBase = 1;
    for (const key in _g.clickUpgrades) clickBase += _g.clickUpgrades[key].count * _g.clickUpgrades[key].effect;

    // ── Idle-specific multipliers ──
    const catnip  = Math.pow(_g.upgrades.catnip.effect, _g.upgrades.catnip.count);
    const tuna    = Math.pow(_g.bellUpgrades.tuna.effect, _g.bellUpgrades.tuna.count);
    const warp    = Math.pow(_g.bellUpgrades.warp.effect, _g.bellUpgrades.warp.count);
    const nap     = Math.pow(_g.bellUpgrades.nap.effect, _g.bellUpgrades.nap.count);
    const bells   = 1 + (_g.bells * 0.05);
    const bloom   = _g.rebirthUpgrades.bloom.count > 0
        ? Math.pow(1 + (_g.srs.length * _g.rebirthUpgrades.bloom.effect), _g.rebirthUpgrades.bloom.count)
        : 1;
    const guide   = Math.pow(_g.rebirthUpgrades.guide.effect, _g.rebirthUpgrades.guide.count);

    // ── Click-specific multipliers ──
    const paw = Math.pow(_g.bellUpgrades.paw.effect, _g.bellUpgrades.paw.count);

    const idleMultTotal  = catnip * tuna * warp * nap * bells * bloom * guide * moodMult * comboMult;
    const clickMultTotal = paw * guide * moodMult * comboMult;

    return {
        isHappy, moodMult, comboMult,
        idle:  { base: idleBase,  catnip, tuna, warp, nap, bells, bloom, guide, multTotal: idleMultTotal,  finalFps:   idleBase  * idleMultTotal },
        click: { base: clickBase, paw, guide,                                   multTotal: clickMultTotal, finalClick: clickBase * clickMultTotal },
    };
}


function _getLearnCost() {
    // Quadratic scaling: word 1=250, word 5=1450, word 10=5200, word 20=20200
    const n      = _g.srs.filter(s => new Set(_vocabQueue.map(v=>v.id)).has(s.id)).length;
    const base   = 200 + (n * n * 50);
    const scholar = Math.pow(_g.bellUpgrades.scholar.effect, _g.bellUpgrades.scholar.count);
    const wisdom  = Math.pow(_g.rebirthUpgrades.wisdom.effect, _g.rebirthUpgrades.wisdom.count);
    return Math.max(50, Math.floor(base * scholar * wisdom));
}

function _calcBells()   { return _g.fish < 50000   ? 0 : Math.floor(Math.pow(_g.fish  / 50000, 0.5)); }
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
        if (_pendingReviews.length === 0) {
            const nextTimer = document.getElementById('nk-next-review-timer');
            const wakeupPill  = _screens.game?.querySelector('#nk-wakeup-pill');
            const wakeupLabel = _screens.game?.querySelector('#nk-wakeup-label');
            const wakeupBar   = _screens.game?.querySelector('#nk-wakeup-bar');

            if (_g.srs.length > 0) {
                const activeIds = new Set(_vocabQueue.map(v => v.id));
                const activeSrs = _g.srs.filter(s => activeIds.has(s.id));
                const next = activeSrs.length > 0 ? Math.min(...activeSrs.map(s => s.nextReview)) : Infinity;
                const diffSec = (next - now) / 1000;

                if (nextTimer) {
                    nextTimer.textContent = diffSec <= 0 ? "Cat is waking up..." : `Next cat in: ${_formatTime(diffSec)}`;
                }

                // Wakeup countdown pill: show in last 10 seconds
                if (wakeupPill && wakeupLabel && wakeupBar) {
                    if (diffSec > 0 && diffSec <= 10) {
                        wakeupPill.style.display = 'flex';
                        wakeupLabel.textContent = `🐱 ${Math.ceil(diffSec)}s`;
                        const pct = (diffSec / 10) * 100; // full at 10s, empty at 0s
                        wakeupBar.style.width = pct + '%';
                        // Color shifts: green at 10s → red at 0s
                        const hue = Math.round(diffSec * 12);
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
        const costFish = Math.floor(upg.cost * Math.pow(1.18, upg.count) * discount);
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
    if (earned <= 0) { alert('Need 50,000 Fish to Ascend!'); return; }
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
    _g.srs.push({ id: w.id, nextReview: Date.now(), interval: 8, ease: 1.5 });
    
    _g.stats.wordsLearned++;
    _updateSRSQueue();
    _updateUI();
}

function _updateSRSQueue() {
    const now    = Date.now();
    const _activeIds = new Set(_vocabQueue.map(v => v.id));
    _pendingReviews = _g.srs.filter(s => _activeIds.has(s.id) && s.nextReview <= now);

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
        srsItem.interval   = Math.round(srsItem.interval * srsItem.ease);
        srsItem.nextReview = Date.now() + srsItem.interval * 1000;

        if (event) {
            _spawnFloatingText(event.clientX, event.clientY, `+${yarn} 🧶`, 'var(--nk-success)', 22);
            if (_g.combo > 1) {
                setTimeout(() => {
                    _spawnFloatingText(event.clientX, event.clientY - 30, `${Math.floor(_g.combo)}x Combo!`, 'var(--nk-gold)', 16);
                }, 150);
            }
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
        srsItem.nextReview = Date.now() + 15000;
        
        _g.combo = Math.floor(_g.combo / 2); // Halve the combo instead of full reset
        _g.stats.wrong++;

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
        <div class="nk-topbar-title">🐾</div>
        <div class="nk-topbar-btns">
            <button class="nk-hbtn nk-hbtn-fmt" id="nk-numfmt-btn" title="Toggle number format">M</button>
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
            <div class="nk-stat-row-top">
                <div class="nk-stat-pill">🐟 <span class="nk-val-fish">0</span></div>
                <div class="nk-stat-pill">🧶 <span class="nk-val-yarn">0</span></div>
                <div class="nk-stat-pill nk-bell-color">🔔 <span class="nk-val-bells">0</span></div>
                <div class="nk-stat-pill nk-spirit-color" id="nk-karma-pill" style="display:${showSpirit?'flex':'none'};">👻 <span class="nk-val-karma">0</span></div>
                <div class="nk-stat-pill nk-hungry-pill" id="nk-hungry-pill" style="display:none;">🐱</div>
                <div class="nk-stat-pill nk-wakeup-pill" id="nk-wakeup-pill" style="display:none;">
                    <span id="nk-wakeup-label">🐱 3s</span>
                    <div class="nk-wakeup-bar-wrap"><div class="nk-wakeup-bar" id="nk-wakeup-bar"></div></div>
                </div>
            </div>
            <div class="nk-stat-sub">
                <span class="nk-val-fps">0</span>/s
                <span class="nk-stat-sep">·</span>
                <span class="nk-val-cpc">1</span>/cl
                <span class="nk-stat-sep">·</span>
                🔥<span class="nk-val-combo">0</span>
                <button id="nk-mult-btn" class="nk-mult-btn" title="Click for multiplier breakdown">×1.00</button>
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
    el.querySelector('#nk-numfmt-btn').addEventListener('click', _toggleNumFmt);
    // Set correct label on init
    const fmtBtn = el.querySelector('#nk-numfmt-btn');
    if (fmtBtn) fmtBtn.textContent = _numFmtStyle === 'suffix' ? 'M' : 'e';
    el.querySelector('#nk-ascend-btn').addEventListener('click', _ascend);
    el.querySelector('#nk-rebirth-btn').addEventListener('click', _rebirth);
    el.querySelector('#nk-learn-btn').addEventListener('click', _learnNewWord);
    el.querySelector('#nk-cat').addEventListener('click', (e) => _petCat(e));

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
        _g = _freshGame();
        _g.srs = srsBackup;
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
        _g = _freshGame();
        _saveGame();
        el.querySelector('#nk-wipe-overlay').style.display = 'none';
        _initShops();
        _updateSRSQueue();
        _updateUI();
        _toast('All progress wiped.', '#d63031');
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
            <div class="nk-stat-row"><span>🐟 Fish (current)</span><span>${_fmtN(_g.fish)}</span></div>
            <div class="nk-stat-row"><span>🐟 Total Fish Earned</span><span>${_fmtN(_g.stats.fishEarned)}</span></div>
            <div class="nk-stat-row"><span>🧶 Yarn (current)</span><span>${_fmtN(_g.yarn)}</span></div>
            <div class="nk-stat-row"><span>🧶 Total Yarn Earned</span><span>${_fmtN(_g.stats.yarnEarned)}</span></div>
            <div class="nk-stat-row"><span>🔔 Bells</span><span>${_fmtN(_g.bells)}</span></div>
            <div class="nk-stat-row"><span>👻 Spirits</span><span>${_fmtN(_g.karma)}</span></div>
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
            <div class="nk-stat-row"><span>🔔 Next Ascend Reward</span><span>+${nextBells} Bell${nextBells !== 1 ? 's' : ''}</span></div>
            <div class="nk-stat-row"><span>📊 Ascend Progress</span><span>${bellProgress}% (need 50k 🐟)</span></div>
            <div class="nk-stat-row"><span>👻 Spirits (Karma)</span><span>${_fmtN(_g.karma)}</span></div>
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

function _renderMultiplierPopup() {
    const popup = _screens.game?.querySelector('#nk-mult-popup');
    if (!popup) return;
    const b = _getMultiplierBreakdown();
    const fmt = v => v.toFixed(2);
    const row = (label, val, color = '') => {
        if (val === 1) return '';
        const style = color ? `style="color:${color};"` : '';
        return `<div class="nk-mp-row" ${style}><span>${label}</span><span>×${fmt(val)}</span></div>`;
    };
    const baseRow = (label, val) =>
        `<div class="nk-mp-row nk-mp-base"><span>${label}</span><span>${_fmtN(val)}</span></div>`;
    const totalRow = (label, val) =>
        `<div class="nk-mp-row nk-mp-final"><span>${label}</span><span>${_fmtN(val)}</span></div>`;

    const happyLabel = b.isHappy ? '✨ Happy Bonus' : '😾 Hungry Penalty';
    const happyColor = b.isHappy ? 'var(--nk-success)' : '#e17055';

    popup.innerHTML = `
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
            ${row('🌸 Bloom',    b.idle.bloom)}
            ${row('👻 Guide',    b.idle.guide)}
            ${totalRow('= Total /s', b.idle.finalFps)}
        </div>
        <div class="nk-mp-section" style="margin-top:8px;">
            <div class="nk-mp-title">👆 Click Power</div>
            ${baseRow('🛠️ Upgrades (base /click)', b.click.base)}
            ${row(happyLabel,    b.moodMult,    happyColor)}
            ${row('🔥 Combo (' + _g.combo.toFixed(1) + ')', b.comboMult, '#e17055')}
            ${row('🐾 Paw Bell', b.click.paw)}
            ${row('👻 Guide',    b.click.guide)}
            ${totalRow('= Total /click', b.click.finalClick)}
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

    // Multiplier badge
    const multBtn = g.querySelector('#nk-mult-btn');
    if (multBtn) {
        const b = _getMultiplierBreakdown();
        const isHappy = b.isHappy;
        multBtn.textContent = `×${b.idle.multTotal.toFixed(2)}`;
        multBtn.style.color = isHappy ? 'var(--nk-success)' : '#e17055';
        multBtn.style.borderColor = isHappy ? 'var(--nk-success)' : '#e17055';
        // If popup is open, keep it live
        const popup = g.querySelector('#nk-mult-popup');
        if (popup && popup.style.display !== 'none') _renderMultiplierPopup();
    }

    // Hungry cats indicator
    const hungryCount  = _pendingReviews.length;
    const hungryPill   = g.querySelector('#nk-hungry-pill');
    const hungryVal    = g.querySelector('.nk-val-hungry');
    const dojoBadge    = g.querySelector('#nk-dojo-badge');
    if (hungryPill) hungryPill.style.display = hungryCount > 0 ? 'flex' : 'none';
    if (hungryVal)  hungryVal.textContent    = hungryCount;
    if (dojoBadge) {
        if (hungryCount > 0) {
            dojoBadge.textContent = hungryCount;
            dojoBadge.style.display = 'inline-block';
        } else {
            dojoBadge.style.display = 'none';
        }
    }

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
            setTxt('#nk-ascend-btn', `⬆+${_calcBells()}`);
        } else {
            // Keep bell buttons disabled state current even when tab not active
            for (const key in _g.bellUpgrades) {
                const btn = g.querySelector(`#nk-btn-b-${key}`);
                if (btn) btn.disabled = _g.bells < (_g.bellUpgrades[key].cost + _g.bellUpgrades[key].count);
            }
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
            setTxt('#nk-rebirth-btn', `♻+${_calcSpirits()}`);
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
        const cost     = _getLearnCost();
        const mastered = _g.srs.length >= _vocabQueue.length;
        if (mastered) {
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
    for (const key in _g[shopKey]) {
        const upg      = _g[shopKey][key];
        const costFish = Math.floor(upg.cost * Math.pow(1.15, upg.count) * discount);
        const btn      = g?.querySelector(`#nk-btn-${prefix}-${key}`);
        const lvl      = g?.querySelector(`#nk-lvl-${prefix}-${key}`);
        if (lvl) lvl.textContent = `(Lvl ${upg.count})`;
        if (btn) {
            btn.textContent = `${_fmtN(costFish)}🐟${upg.costYarn > 0 ? ` ${upg.costYarn}🧶` : ''}`;
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
    padding: 5px 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    flex-shrink: 0;
    z-index: 20;
}
.nk-topbar-title { font-size: 16px; font-weight: bold; line-height: 1; }
.nk-topbar-btns  { display: flex; gap: 4px; }
.nk-hbtn {
    background: var(--nk-btn); border: none; padding: 4px 8px;
    border-radius: 5px; color: white; cursor: pointer; font-weight: bold; font-size: 11px;
    min-width: 28px; text-align: center;
}
.nk-hbtn-gold        { background: var(--nk-gold);   color: #333; }
.nk-hbtn-spirit      { background: var(--nk-spirit); }
.nk-hbtn-danger      { background: #888; }
.nk-hbtn-fmt         { background: #e0e0e0; color: #555; }

/* Wakeup countdown pill */
.nk-wakeup-pill {
    background: #fff8e1 !important;
    color: #e17055 !important;
    border: 1px solid #ffe0b2 !important;
    font-weight: bold;
    flex-direction: column !important;
    gap: 2px !important;
    padding: 2px 6px 3px !important;
    min-width: 44px;
}
.nk-wakeup-bar-wrap {
    width: 100%;
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
}
.nk-stat-sub {
    font-size: 10px;
    color: #888;
    display: flex;
    align-items: center;
    gap: 3px;
    flex-wrap: nowrap;
    white-space: nowrap;
    overflow: hidden;
}
.nk-stat-sep { opacity: 0.4; }
.nk-mult-btn {
    font-size: 10px;
    font-weight: bold;
    background: none;
    border: 1px solid #888;
    border-radius: 6px;
    padding: 1px 4px;
    cursor: pointer;
    color: #888;
    line-height: 1.3;
    flex-shrink: 0;
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
[data-theme="dark"] .nk-mp-base  { color: #a08060; border-bottom-color: #5a3e2b; }
[data-theme="dark"] .nk-mp-final { border-top-color: #5a3e2b; }
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
    padding: 15px 15px 60px;
    background: #fffdf9;
    position: relative;
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

/* Hungry cats indicator pill */
.nk-hungry-pill { background: #fff0f0 !important; color: #e17055 !important; border: 1px solid #fab1a0 !important; font-weight: bold; animation: nkPulse 2s infinite; }
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

/* Wipe button */
.nk-hbtn-wipe { background: #c0392b; }

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