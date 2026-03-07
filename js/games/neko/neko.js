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
        el.style.display = (k === name) ? 'block' : 'none';
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
    _initGameDOM();
    _loadGame();
    _initShops();
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
    catnip:    { name: 'Catnip Garden',    desc: '+10% Idle Multiplier',cost: 5000,     costYarn: 5,     count: 0, effect: 0.1 },
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
    paw:      { name: 'Golden Paw',    desc: '+100% Click Power',           cost: 1,  count: 0, effect: 1 },
    tuna:     { name: 'Golden Tuna',   desc: '+100% Idle Power',            cost: 1,  count: 0, effect: 1 },
    scholar:  { name: 'Scholar Hat',   desc: '-10% Learn Cost',             cost: 2,  count: 0, effect: 0.9 },
    weaver:   { name: 'Yarn Weaver',   desc: '10% Double Yarn Chance',      cost: 3,  count: 0, effect: 0.1 },
    luck:     { name: 'Omikuji Luck',  desc: '5% Crit Chance (5x)',         cost: 5,  count: 0, effect: 0.05 },
    bank:     { name: 'Maneki Bank',   desc: '+0.1% Interest/Sec',          cost: 10, count: 0, effect: 0.001 },
    discount: { name: 'Merchant Cat',  desc: 'Upgrades 5% Cheaper',         cost: 15, count: 0, effect: 0.95 },
    warp:     { name: 'Time Warp',     desc: '+20% Game Speed (Simulated)', cost: 30, count: 0, effect: 0.2 },
    nap:      { name: 'Cat Nap',       desc: '+50% Passive Prod',           cost: 40, count: 0, effect: 0.5 },
    thread:   { name: 'Golden Thread', desc: '+50% Yarn Gain',              cost: 45, count: 0, effect: 0.5 },
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
let _isDebug = false;
let _rafId   = null;
let _saveInterval = null;

function _freshGame() {
    return {
        fish: 0, yarn: 0, bells: 0, karma: 0, lastTick: Date.now(),
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
    let m = 1;
    m += (_g.upgrades.catnip.count        * _g.upgrades.catnip.effect);
    m += (_g.bellUpgrades.tuna.count      * _g.bellUpgrades.tuna.effect);
    m += (_g.bellUpgrades.warp.count      * _g.bellUpgrades.warp.effect);
    m += (_g.bellUpgrades.nap.count       * _g.bellUpgrades.nap.effect);
    m += (_g.bells                        * 0.1);
    if (_g.rebirthUpgrades.bloom.count > 0) {
        m *= 1 + (_g.srs.length * (_g.rebirthUpgrades.bloom.count * _g.rebirthUpgrades.bloom.effect));
    }
    m *= Math.pow(_g.rebirthUpgrades.guide.effect, _g.rebirthUpgrades.guide.count);
    if (_isDebug) m *= 1000;
    return base * m;
}

function _getClickPower() {
    let base = 1;
    for (const key in _g.clickUpgrades) base += _g.clickUpgrades[key].count * _g.clickUpgrades[key].effect;
    let m = 1;
    m += (_g.bellUpgrades.paw.count * _g.bellUpgrades.paw.effect);
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

// ─── Persistence ──────────────────────────────────────────────────────────────

function _saveGame(manual = false) {
    _g.lastTick = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(_g));
    if (manual) _toast('Saved!', 'var(--success)');
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
        _g.srs   = p.srs   || [];

        // Only restore counts that still exist in the defaults (schema safety)
        ['upgrades','clickUpgrades','bellUpgrades','rebirthUpgrades'].forEach(type => {
            if (p[type]) {
                for (const k in p[type]) {
                    if (_g[type][k]) _g[type][k].count = p[type][k].count || 0;
                }
            }
        });

        // Filter saved SRS to only words still in the current vocab queue
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
        // Only run if the game screen is visible
        if (!_screens.game || _screens.game.style.display === 'none') {
            _rafId = requestAnimationFrame(loop);
            return;
        }

        const now   = Date.now();
        const delta = (now - _g.lastTick) / 1000;
        _g.lastTick = now;

        // Auto-petter
        const autoClicks = _g.bellUpgrades.auto.count * _g.bellUpgrades.auto.effect;
        if (autoClicks > 0) _g.fish += (_getClickPower() * autoClicks) * delta;

        // Passive income
        const fps        = _getFishPerSec();
        const efficiency = _pendingReviews.length > 0 ? 0.2 : 1.0;
        let earned       = fps * efficiency * delta;

        const interestRate = _g.bellUpgrades.bank.count * _g.bellUpgrades.bank.effect;
        if (interestRate > 0 && efficiency === 1.0) earned += (_g.fish * interestRate) * delta;

        _g.fish += earned;

        // Update SRS queue every ~2 real seconds
        if (Math.floor(now / 1000) % 2 === 0) _updateSRSQueue();

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

    // Floating number effect
    const wrap = _screens.game?.querySelector('.nk-clicker-wrap');
    if (e && wrap) {
        const rect = wrap.getBoundingClientRect();
        const fx   = document.createElement('div');
        fx.className  = 'nk-click-effect';
        fx.textContent = `+${Math.floor(power).toLocaleString()}${isCrit ? '!' : ''}`;
        // Position relative to the game panel
        fx.style.left = (e.clientX - rect.left - 20) + 'px';
        fx.style.top  = (e.clientY - rect.top  - 40) + 'px';
        if (isCrit) { fx.style.color = '#ff4b4b'; fx.style.fontSize = '24px'; }
        wrap.appendChild(fx);
        setTimeout(() => fx.remove(), 1000);
    }
    _updateUI();
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
    for (const k in _g.upgrades)      _g.upgrades[k].count      = 0;
    for (const k in _g.clickUpgrades) _g.clickUpgrades[k].count = 0;
    if (_g.rebirthUpgrades.starter.count > 0) _g.upgrades.box.count = 10;
    _saveGame();
    _updateUI();
    _toast(`Ascended! +${earned} Bells`, 'var(--gold, #ffd32a)');
}

function _rebirth() {
    const earned = _calcSpirits();
    if (earned <= 0) { alert('Need 100 Bells to Rebirth!'); return; }
    if (!confirm(`REBIRTH? Reset EVERYTHING (including Bells) for +${earned} 👻 Spirits?`)) return;
    _g.karma += earned;
    _g.fish   = 0;
    _g.yarn   = 0;
    _g.bells  = 0;
    for (const k in _g.upgrades)        _g.upgrades[k].count        = 0;
    for (const k in _g.clickUpgrades)   _g.clickUpgrades[k].count   = 0;
    for (const k in _g.bellUpgrades)    _g.bellUpgrades[k].count     = 0;
    if (_g.rebirthUpgrades.starter.count > 0) _g.upgrades.box.count = 10;
    _saveGame();
    _updateUI();
    _switchTab('rebirth');
    _toast(`REBIRTH! +${earned} Spirits`, '#a55eea');
}

// ─── SRS ──────────────────────────────────────────────────────────────────────

function _learnNewWord() {
    const cost = _getLearnCost();
    if (_g.fish < cost) { _toast('Not enough fish!', '#ff6b6b'); return; }

    const learnedIds = new Set(_g.srs.map(s => s.id));
    const available  = _vocabQueue.filter(v => !learnedIds.has(v.id));
    if (available.length === 0) { _toast('All words learned!', '#4cd137'); return; }

    _g.fish -= cost;
    const w = available[0];
    _g.srs.push({ id: w.id, nextReview: Date.now(), interval: 1, ease: 2.5 });
    _updateSRSQueue();
    _updateUI();
}

function _updateSRSQueue() {
    const now    = Date.now();
    _pendingReviews = _g.srs.filter(s => s.nextReview <= now);

    const pendingEl  = _screens.game?.querySelector('.nk-pending-count');
    const statusEl   = _screens.game?.querySelector('.nk-srs-status');
    const noRevEl    = _screens.game?.querySelector('.nk-no-reviews');
    const fcEl       = _screens.game?.querySelector('.nk-flashcard-area');
    const debuffEl   = _screens.game?.querySelector('.nk-debuff-row');
    if (!pendingEl) return;

    pendingEl.textContent = _pendingReviews.length;

    if (_pendingReviews.length > 0) {
        statusEl?.classList.add('nk-srs-danger');
        if (noRevEl) noRevEl.style.display = 'none';
        if (fcEl)    fcEl.style.display    = 'flex';
        if (debuffEl) debuffEl.style.display = 'flex';
        if (!_g.currentCardId) _loadFlashcard();
    } else {
        statusEl?.classList.remove('nk-srs-danger');
        if (noRevEl) noRevEl.style.display = 'flex';
        if (fcEl)    fcEl.style.display    = 'none';
        if (debuffEl) debuffEl.style.display = 'none';
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
    const kanaEl  = _screens.game?.querySelector('.nk-fc-kana');
    const gridEl  = _screens.game?.querySelector('.nk-quiz-grid');
    if (!kanjiEl || !kanaEl || !gridEl) return;

    kanjiEl.textContent = correct.kanji;
    kanaEl.textContent  = correct.kana;

    // 3 distractors from the rest of the learned+queue pool
    const pool       = _vocabQueue.filter(v => v.id !== correct.id);
    const distractors = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options     = [...distractors, correct].sort(() => 0.5 - Math.random());

    gridEl.innerHTML = '';
    options.forEach(opt => {
        const btn       = document.createElement('button');
        btn.className   = 'nk-quiz-btn';
        btn.textContent = opt.eng;
        btn.addEventListener('click', () => _checkAnswer(opt.id, btn, correct.id));
        gridEl.appendChild(btn);
    });
}

function _checkAnswer(selectedId, btnEl, correctId) {
    if (_isProcessingAnswer) return;
    _isProcessingAnswer = true;
    const srsItem = _g.srs.find(s => s.id === _g.currentCardId);

    if (selectedId === correctId) {
        btnEl.classList.add('nk-quiz-correct');
        let yarn = 1;
        if (Math.random() < (_g.bellUpgrades.weaver.count * _g.bellUpgrades.weaver.effect)) yarn *= 2;
        if (_g.bellUpgrades.thread.count > 0) yarn = Math.ceil(yarn * (1 + _g.bellUpgrades.thread.count * _g.bellUpgrades.thread.effect));
        if (_g.rebirthUpgrades.weaver_soul.count > 0) yarn *= 3;
        _g.yarn += yarn;
        srsItem.interval   = Math.max(1, Math.round(srsItem.interval * srsItem.ease));
        srsItem.nextReview = Date.now() + srsItem.interval * 60 * 1000;
    } else {
        btnEl.classList.add('nk-quiz-wrong');
        srsItem.interval   = 1;
        srsItem.ease       = Math.max(1.3, srsItem.ease - 0.2);
        srsItem.nextReview = Date.now() + 60 * 1000;
    }

    setTimeout(() => {
        _g.currentCardId = null;
        _updateSRSQueue();
        _loadFlashcard();
        _updateUI();
    }, 1000);
}

// ─── DOM Construction ─────────────────────────────────────────────────────────

function _initGameDOM() {
    const el = _screens.game;
    if (!el) return;

    el.innerHTML = `
<div class="nk-root">

    <!-- header bar -->
    <div class="nk-topbar">
        <div class="nk-topbar-title">🐾 NekoNihongo</div>
        <div class="nk-topbar-btns">
            <button class="nk-hbtn" id="nk-save-btn">💾 Save</button>
            <button class="nk-hbtn nk-hbtn-gold" id="nk-ascend-btn">Ascend</button>
            <button class="nk-hbtn nk-hbtn-spirit" id="nk-rebirth-btn" style="display:none;">👻 Rebirth</button>
            <button class="nk-hbtn nk-hbtn-danger" id="nk-quit-btn">✕ Quit</button>
        </div>
    </div>

    <div class="nk-body">

        <!-- ── LEFT: Idle game ──────────────────────────── -->
        <div class="nk-left">
            <div class="nk-stats-box">
                <div class="nk-currency"><span>🐟 Fish:</span>   <span class="nk-val-fish">0</span></div>
                <div class="nk-currency"><span>🧶 Yarn:</span>   <span class="nk-val-yarn">0</span></div>
                <div class="nk-currency nk-bell-color"><span>🔔 Bells:</span>  <span class="nk-val-bells">0</span></div>
                <div class="nk-currency nk-spirit-color" id="nk-karma-row" style="display:none;">
                    <span>👻 Spirits:</span> <span class="nk-val-karma">0</span>
                </div>
                <hr style="border-color:rgba(0,0,0,0.1); margin:8px 0;">
                <div class="nk-sub-stat"><span>Fish/Sec:</span>  <span class="nk-val-fps">0</span></div>
                <div class="nk-sub-stat"><span>Fish/Click:</span><span class="nk-val-cpc">1</span></div>
                <div class="nk-currency nk-debuff-row" style="display:none; color:#ff6b6b; font-size:13px; margin-top:5px; font-weight:bold;">
                    <span>⚠️ Hungry Cats:</span><span>-80% Income!</span>
                </div>
            </div>

            <div class="nk-clicker-wrap">
                <div class="nk-cat" id="nk-cat">🐱</div>
            </div>

            <!-- tabs -->
            <div class="nk-tabs">
                <button class="nk-tab active" data-tab="click">👆 Click</button>
                <button class="nk-tab"        data-tab="idle">📦 Idle</button>
                <button class="nk-tab nk-tab-bell"   data-tab="bells">🔔 Bell</button>
                <button class="nk-tab nk-tab-spirit" data-tab="rebirth" id="nk-tab-rebirth" style="display:none;">👻 Spirit</button>
            </div>

            <div class="nk-shop-wrap">
                <div class="nk-shop active" id="nk-shop-click"><div class="nk-upgrades" id="nk-upg-click"></div></div>
                <div class="nk-shop"        id="nk-shop-idle"><div class="nk-upgrades"  id="nk-upg-idle"></div></div>
                <div class="nk-shop"        id="nk-shop-bells"><div class="nk-upgrades" id="nk-upg-bells"></div></div>
                <div class="nk-shop"        id="nk-shop-rebirth"><div class="nk-upgrades" id="nk-upg-rebirth"></div></div>
            </div>
        </div>

        <!-- ── RIGHT: SRS Dojo ──────────────────────────── -->
        <div class="nk-right">
            <h2 style="margin:0 0 12px; font-size:20px;">🧠 Vocabulary Dojo</h2>

            <div class="nk-srs-status">
                Hungry Cats (Reviews): <span class="nk-pending-count">0</span>
            </div>

            <div class="nk-flashcard-area" style="display:none;">
                <div class="nk-fc-kanji">猫</div>
                <div class="nk-fc-kana">ねこ</div>
                <div class="nk-quiz-grid"></div>
            </div>

            <div class="nk-no-reviews" style="display:flex;">
                <div style="font-size:50px;">💤</div>
                <p style="font-size:17px; font-weight:bold; margin:8px 0 4px;">Sanctuary is Peaceful</p>
                <p style="color:#888; margin:0;">No reviews pending.</p>
            </div>

            <div class="nk-learn-area">
                <button class="nk-learn-btn" id="nk-learn-btn">Study New Word</button>
            </div>
        </div>

    </div><!-- /nk-body -->

    <!-- toast container -->
    <div class="nk-toasts" id="nk-toasts"></div>
</div>`;

    // ── Wire static events ────────────────────────────────────────────────────
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

    // Tab switching
    el.querySelectorAll('.nk-tab').forEach(btn => {
        btn.addEventListener('click', () => _switchTab(btn.getAttribute('data-tab')));
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

// ─── UI Update ────────────────────────────────────────────────────────────────

function _updateUI() {
    const g = _screens.game;
    if (!g || g.style.display === 'none') return;

    const setTxt = (sel, val) => { const el = g.querySelector(sel); if (el) el.textContent = val; };

    setTxt('.nk-val-fish',  Math.floor(_g.fish).toLocaleString());
    setTxt('.nk-val-yarn',  _g.yarn.toLocaleString());
    setTxt('.nk-val-bells', _g.bells.toLocaleString());
    setTxt('.nk-val-karma', _g.karma.toLocaleString());
    setTxt('.nk-val-fps',   _getFishPerSec().toLocaleString(undefined, { maximumFractionDigits: 1 }));
    setTxt('.nk-val-cpc',   _getClickPower().toLocaleString(undefined, { maximumFractionDigits: 1 }));

    // Show karma row + rebirth tab + rebirth header button if earned
    if (_g.karma > 0 || _g.bells > 50) {
        const karmaRow  = g.querySelector('#nk-karma-row');
        const tabRebirth = g.querySelector('#nk-tab-rebirth');
        const btnRebirth = g.querySelector('#nk-rebirth-btn');
        if (karmaRow)   karmaRow.style.display  = 'flex';
        if (tabRebirth) tabRebirth.style.display = 'block';
        if (btnRebirth) btnRebirth.style.display = 'inline-block';
    }

    // Ascend / Rebirth button labels
    setTxt('#nk-ascend-btn',  `Ascend (+${_calcBells()} 🔔)`);
    setTxt('#nk-rebirth-btn', `Rebirth (+${_calcSpirits()} 👻)`);

    // Shop buttons — fish/yarn
    _updateShopBtns('clickUpgrades', 'c');
    _updateShopBtns('upgrades',      'i');

    // Bell upgrades
    for (const key in _g.bellUpgrades) {
        const upg  = _g.bellUpgrades[key];
        const cost = upg.cost + upg.count;
        const btn  = g.querySelector(`#nk-btn-b-${key}`);
        const lvl  = g.querySelector(`#nk-lvl-b-${key}`);
        if (lvl) lvl.textContent = `(Lvl ${upg.count})`;
        if (btn) { btn.textContent = `${cost} 🔔`; btn.disabled = _g.bells < cost; }
    }

    // Rebirth upgrades
    for (const key in _g.rebirthUpgrades) {
        const upg  = _g.rebirthUpgrades[key];
        const cost = upg.cost * Math.pow(2, upg.count);
        const btn  = g.querySelector(`#nk-btn-r-${key}`);
        const lvl  = g.querySelector(`#nk-lvl-r-${key}`);
        if (lvl) lvl.textContent = `(Lvl ${upg.count})`;
        if (btn) { btn.textContent = `${cost} 👻`; btn.disabled = _g.karma < cost; }
    }

    // Learn button
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

// ─── Tab Switching ────────────────────────────────────────────────────────────

function _switchTab(tabName) {
    const g = _screens.game;
    g?.querySelectorAll('.nk-shop').forEach(s => s.classList.remove('active'));
    g?.querySelectorAll('.nk-tab').forEach(b => b.classList.remove('active'));
    g?.querySelector(`#nk-shop-${tabName}`)?.classList.add('active');
    // find button by data-tab
    g?.querySelectorAll('.nk-tab').forEach(b => {
        if (b.getAttribute('data-tab') === tabName) b.classList.add('active');
    });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

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
// Injected once; scoped entirely to .nk-root so it never bleeds into the app.

(function _injectStyles() {
    if (document.getElementById('neko-game-styles')) return;
    const style = document.createElement('style');
    style.id = 'neko-game-styles';
    style.textContent = `
/* ── NekoNihongo scoped styles ──────────────────────────────────────────── */
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
    padding: 8px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 6px;
}
.nk-topbar-title { font-size: 20px; font-weight: bold; }
.nk-topbar-btns  { display: flex; gap: 6px; flex-wrap: wrap; }
.nk-hbtn {
    background: var(--nk-btn); border: none; padding: 6px 10px;
    border-radius: 5px; color: white; cursor: pointer; font-weight: bold; font-size: 12px;
}
.nk-hbtn:hover       { background: var(--nk-btnhov); }
.nk-hbtn-gold        { background: var(--nk-gold);   color: #333; }
.nk-hbtn-gold:hover  { background: #e6be00; }
.nk-hbtn-spirit      { background: var(--nk-spirit); }
.nk-hbtn-danger      { background: #888; }
.nk-hbtn-danger:hover{ background: #666; }

/* body split */
.nk-body {
    display: flex;
    flex: 1;
    overflow: hidden;
}
.nk-left, .nk-right {
    flex: 1;
    padding: 14px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}
.nk-left  { border-right: 3px dashed var(--nk-btn); background: #fffdf9; }
.nk-right { background: #fdf5e6; }

/* stats box */
.nk-stats-box {
    background: white;
    padding: 12px;
    border-radius: 10px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
    margin-bottom: 12px;
    font-size: 15px;
    flex-shrink: 0;
}
.nk-currency  { display: flex; justify-content: space-between; margin-bottom: 4px; }
.nk-bell-color { color: #b8860b; }
.nk-spirit-color { color: #a55eea; }
.nk-sub-stat  { font-size: 12px; color: #888; display: flex; justify-content: space-between; }
.nk-debuff-row { display:none; }

/* cat clicker */
.nk-clicker-wrap {
    text-align: center;
    margin: 10px 0;
    position: relative;
    min-height: 120px;
    flex-shrink: 0;
}
.nk-cat {
    font-size: 80px;
    cursor: pointer;
    user-select: none;
    display: inline-block;
    filter: drop-shadow(0 5px 5px rgba(0,0,0,0.1));
    transition: transform 0.05s;
}
.nk-cat:active { transform: scale(0.9); }
.nk-click-effect {
    position: absolute;
    font-weight: bold;
    font-size: 18px;
    pointer-events: none;
    color: var(--nk-btn);
    animation: nkFloat 1s forwards;
}
@keyframes nkFloat {
    0%   { opacity:1; transform:translateY(0); }
    100% { opacity:0; transform:translateY(-50px); }
}

/* tabs */
.nk-tabs { display: flex; gap: 4px; margin-bottom: 0; flex-shrink: 0; }
.nk-tab {
    flex: 1; padding: 8px 4px; border: none; background: #e0e0e0;
    cursor: pointer; border-radius: 5px 5px 0 0;
    font-weight: bold; color: #666; font-size: 12px; transition: 0.2s;
}
.nk-tab.active         { background: var(--nk-btn); color: white; }
.nk-tab-bell           { background: #ffeaa7; color: #b8860b; }
.nk-tab-bell.active    { background: var(--nk-gold); color: #333; }
.nk-tab-spirit         { background: #dcdde1; color: #7158e2; }
.nk-tab-spirit.active  { background: var(--nk-spirit); color: white; }

/* shop */
.nk-shop-wrap { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.nk-shop      { display: none; flex: 1; overflow-y: auto; }
.nk-shop.active { display: block; }
.nk-upgrades  { padding: 4px 0; }

.nk-upgrade {
    background: white; padding: 8px 10px; border-radius: 8px; margin-bottom: 6px;
    display: flex; justify-content: space-between; align-items: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.nk-upg-bell    { background: #fffcf0; border: 1px solid var(--nk-gold); }
.nk-upg-rebirth { background: #f3f0ff; border: 1px solid var(--nk-spirit); }
.nk-upg-info    { flex: 1; padding-right: 8px; font-size: 13px; }
.nk-upg-lvl     { font-size: 11px; opacity: 0.6; margin-left: 4px; }
.nk-upg-btn {
    background: var(--nk-btn); border: none; padding: 6px 4px; border-radius: 5px;
    color: white; cursor: pointer; font-weight: bold; min-width: 80px; font-size: 11px;
}
.nk-upg-btn:disabled { background: #e0e0e0; color: #999; cursor: not-allowed; }
.nk-upg-bell .nk-upg-btn    { background: var(--nk-gold); color: #333; }
.nk-upg-rebirth .nk-upg-btn { background: var(--nk-spirit); color: white; }

/* SRS / right panel */
.nk-srs-status {
    text-align: center; padding: 8px; border-radius: 10px;
    background: white; margin-bottom: 14px; font-weight: bold; font-size: 14px;
    flex-shrink: 0;
}
.nk-srs-danger {
    background: var(--nk-accent); color: white;
    animation: nkPulse 2s infinite;
}
@keyframes nkPulse {
    0%   { transform: scale(1); }
    50%  { transform: scale(1.02); }
    100% { transform: scale(1); }
}

.nk-flashcard-area {
    flex: 1; flex-direction: column; align-items: center; justify-content: center;
    background: white; border-radius: 10px; padding: 16px;
    box-shadow: 0 8px 15px rgba(0,0,0,0.05); min-height: 320px;
}
.nk-fc-kanji   { font-size: 72px; margin-bottom: 4px; color: #333; text-align: center; }
.nk-fc-kana    { font-size: 24px; color: #888; margin-bottom: 24px; text-align: center; }
.nk-quiz-grid  {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
    width: 100%; max-width: 420px;
}
.nk-quiz-btn {
    background: #f0f0f0; border: 2px solid #ddd; padding: 16px;
    border-radius: 10px; font-size: 16px; cursor: pointer; color: #555;
    font-weight: bold; transition: all 0.1s;
}
.nk-quiz-btn:hover   { background: #e8e8e8; transform: translateY(-2px); }
.nk-quiz-correct     { background: #4cd137 !important; color: white !important; border-color: #4cd137 !important; }
.nk-quiz-wrong       { background: #ff6b6b !important; color: white !important; border-color: #ff6b6b !important; }

.nk-no-reviews {
    flex: 1; flex-direction: column; align-items: center; justify-content: center;
    background: white; border-radius: 10px; padding: 20px;
    box-shadow: 0 8px 15px rgba(0,0,0,0.05); min-height: 200px;
    text-align: center;
}

.nk-learn-area { margin-top: 14px; flex-shrink: 0; }
.nk-learn-btn {
    background: var(--nk-spirit); border: none; padding: 14px;
    border-radius: 8px; color: white; cursor: pointer;
    width: 100%; font-size: 15px; font-weight: bold;
}
.nk-learn-btn:disabled { background: #ccc; cursor: not-allowed; }

/* toasts */
.nk-toasts {
    position: absolute; top: 60px; right: 16px; z-index: 200; pointer-events: none;
}
.nk-toast {
    background: rgba(0,0,0,0.85); color: white; padding: 10px 20px;
    border-radius: 50px; margin-bottom: 8px; font-weight: bold; font-size: 13px;
    animation: nkFadeOut 4s forwards;
}
@keyframes nkFadeOut {
    0%   { opacity: 1; }
    80%  { opacity: 1; }
    100% { opacity: 0; }
}

/* dark theme compatibility */
[data-theme="dark"] .nk-root   { --nk-bg: #2a1f14; --nk-text: #f0d9c0; --nk-panel: #3d2b1a; }
[data-theme="dark"] .nk-stats-box,
[data-theme="dark"] .nk-flashcard-area,
[data-theme="dark"] .nk-no-reviews { background: #3d2b1a; color: #f0d9c0; }
[data-theme="dark"] .nk-upgrade        { background: #3d2b1a; }
[data-theme="dark"] .nk-upg-bell       { background: #3d2910; }
[data-theme="dark"] .nk-upg-rebirth    { background: #2d2040; }
[data-theme="dark"] .nk-quiz-btn       { background: #3d2b1a; border-color: #5a3e2b; color: #f0d9c0; }
[data-theme="dark"] .nk-quiz-btn:hover { background: #4d3b2a; }
[data-theme="dark"] .nk-left  { background: #261a0f; }
[data-theme="dark"] .nk-right { background: #2a1f14; }
`;
    document.head.appendChild(style);
})();
