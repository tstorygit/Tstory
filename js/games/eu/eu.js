// js/games/eu/eu.js — "Vocab Universalis" Grand Strategy SRS
// export { init, launch }

import { mountVocabSelector } from '../../vocab_selector.js';

let _screens = null;
let _onExit  = null;
let _selector = null;
let _vocabQueue = []; 

const SAVE_KEY = 'eu_vocab_save';
const BANNED_KEY = 'eu_banned_words';

const PROVINCE_NAMES = [
    "Musashi", "Yamashiro", "Owari", "Mikawa", "Suruga", "Sagami", "Echigo", "Kai", "Shinano", "Hida", 
    "Etchu", "Kaga", "Echizen", "Mino", "Omi", "Iga", "Ise", "Shima", "Kii", "Yamato", "Kawachi", 
    "Izumi", "Settsu", "Harima", "Tajima", "Inaba", "Hoki", "Izumo", "Iwami", "Oki", "Bizen", 
    "Bitchu", "Bingo", "Aki", "Suo", "Nagato", "Awa", "Sanuki", "Iyo", "Tosa", "Chikuzen", 
    "Chikugo", "Buzen", "Bungo", "Hizen", "Higo", "Hyuga", "Osumi", "Satsuma", "Mutsu", "Dewa", 
    "Hitachi", "Shimotsuke", "Kozuke", "Ezo", "Ryukyu", "Tsushima", "Iki", "Awaji", "Sado"
];

// ─── Game State ───────────────────────────────────────────────────────────────

let _g = null;
let _pendingReviews = [];
let _isProcessingAnswer = false;
let _rafId = null;
let _saveInterval = null;
let _selectedProvinceId = null;

const CORE_INTERVAL_THRESHOLD = 300; // Words with interval >= 300s (5 mins) are considered "Cored"
const WORDS_PER_PROVINCE = 4;

const IDEAS = {
    taxation: { name: 'National Tax Register', desc: '+50% Base Ducats', cost: 100, type: 'adm', effect: 1.5 },
    humanist: { name: 'Humanist Tolerance', desc: 'Unrest grows 50% slower', cost: 200, type: 'adm', effect: 0.5 },
    trade:    { name: 'Trade Networks', desc: 'Markets give +2 Ducats instead of +1', cost: 300, type: 'dip', effect: 2.0 },
    diplo:    { name: 'Diplomatic Corps', desc: 'Overextension penalties reduced by 50%', cost: 200, type: 'dip', effect: 0.5 },
    conscript:{ name: 'Mass Conscription', desc: '+50% Base Manpower', cost: 100, type: 'mil', effect: 1.5 },
    quality:  { name: 'Quality Troops', desc: 'Correct reviews give +4 MIL (base 2)', cost: 300, type: 'mil', effect: 2.0 },
};

function _freshGame() {
    return {
        resources: {
            ducats: 50,
            manpower: 100,
            adm: 0,
            dip: 0,
            mil: 0,
        },
        stats: {
            rebellionsCrushed: 0,
            wordsMastered: 0,
            warsWon: 0
        },
        provinces: [], // Generated on start
        srs: [],       // Active words currently being learned
        ideas: {},     // Unlocked ideas
        lastTick: Date.now(),
        combo: 0,
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
            el.style.overflow = 'hidden';
            el.style.height = '100%';
            el.style.background = '#f4ecd8'; // Parchment background
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
    startBtn.className   = 'eu-primary-btn';
    startBtn.textContent = '⚔️ Found Empire';
    startBtn.addEventListener('click', _startGame);

    const backBtn = document.createElement('button');
    backBtn.className   = 'eu-back-btn';
    backBtn.textContent = '← Flee to Menu';
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

    _show('game');
    _loadGame();

    // Generate Map if fresh game
    if (_g.provinces.length === 0) {
        _generateMap();
    }

    _initGameDOM();
    _updateSRSQueue();
    _updateUI();
    _startGameLoop();
    _switchTab('map');
}

// ─── Core Logic & Math ────────────────────────────────────────────────────────

function _generateMap() {
    // Determine grid size based on vocab
    const totalProv = Math.ceil(_vocabQueue.length / WORDS_PER_PROVINCE);
    const cols = Math.ceil(Math.sqrt(totalProv));
    const rows = Math.ceil(totalProv / cols);

    let vocabIndex = 0;
    let names = [...PROVINCE_NAMES].sort(() => 0.5 - Math.random());

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (vocabIndex >= _vocabQueue.length) break;

            const provWords = [];
            for (let i = 0; i < WORDS_PER_PROVINCE && vocabIndex < _vocabQueue.length; i++) {
                provWords.push(_vocabQueue[vocabIndex].id);
                vocabIndex++;
            }

            const isCapital = (x === Math.floor(cols/2) && y === Math.floor(rows/2));
            const pId = `prov_${x}_${y}`;
            
            _g.provinces.push({
                id: pId,
                name: names.pop() || `Region ${x}-${y}`,
                x, y,
                owner: isCapital ? 'player' : 'neutral',
                words: provWords,
                unrest: 0,
                rebelling: false,
                buildings: { market: false, barracks: false }
            });

            // If capital, auto-learn the words so player has a starting deck
            if (isCapital) {
                provWords.forEach(wid => {
                    _g.srs.push({ id: wid, nextReview: Date.now(), interval: 8, ease: 1.5, provinceId: pId, cored: false });
                });
            }
        }
    }
}

function _isAdjacentToOwned(prov) {
    return _g.provinces.some(p => p.owner === 'player' && (Math.abs(p.x - prov.x) + Math.abs(p.y - prov.y) === 1));
}

function _getEmpireStats() {
    const owned = _g.provinces.filter(p => p.owner === 'player');
    let baseDucats = 1;
    let baseManpower = 1;
    
    if (_g.ideas.taxation) baseDucats *= IDEAS.taxation.effect;
    if (_g.ideas.conscript) baseManpower *= IDEAS.conscript.effect;

    let marketVal = _g.ideas.trade ? IDEAS.trade.effect : 1;
    
    let totalDucats = baseDucats;
    let totalManpower = baseManpower;
    let rebellingCount = 0;

    owned.forEach(p => {
        if (p.rebelling) {
            rebellingCount++;
        } else {
            if (p.buildings.market) totalDucats += marketVal;
            if (p.buildings.barracks) totalManpower += 1;
        }
    });

    // Overextension Math
    const activeSrs = _g.srs.filter(s => new Set(_vocabQueue.map(v=>v.id)).has(s.id));
    const uncored = activeSrs.filter(s => !s.cored).length;
    const totalActive = activeSrs.length || 1;
    let oeRaw = uncored / totalActive; // 0.0 to 1.0
    
    if (_g.ideas.diplo) oeRaw *= IDEAS.diplo.effect;
    
    const oePenalty = Math.min(0.8, oeRaw); // Max 80% penalty

    totalDucats *= (1 - oePenalty);
    totalManpower *= (1 - oePenalty);

    return {
        ducatsPerSec: totalDucats,
        manpowerPerSec: totalManpower,
        overextension: oeRaw * 100,
        ownedCount: owned.length,
        rebellingCount
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

        const now = Date.now();
        const delta = (now - _g.lastTick) / 1000;
        _g.lastTick = now;

        const stats = _getEmpireStats();

        _g.resources.ducats += stats.ducatsPerSec * delta;
        _g.resources.manpower += stats.manpowerPerSec * delta;

        // Unrest Mechanics
        const unrestGrowthMod = _g.ideas.humanist ? IDEAS.humanist.effect : 1;
        
        _g.provinces.filter(p => p.owner === 'player').forEach(p => {
            // Find due words belonging to this province
            const dueWords = _g.srs.filter(s => s.provinceId === p.id && s.nextReview <= now);
            
            if (dueWords.length > 0) {
                // Unrest grows based on how many words are ignored
                p.unrest += (dueWords.length * 0.5 * unrestGrowthMod) * delta;
                if (p.unrest >= 100) {
                    p.unrest = 100;
                    if (!p.rebelling) p.rebelling = true;
                }
            } else {
                // Decay unrest if no words due
                p.unrest = Math.max(0, p.unrest - (2 * delta));
                if (p.unrest === 0 && p.rebelling) p.rebelling = false;
            }
        });

        // Update SRS queue for UI
        if (Math.floor(now / 1000) % 2 === 0) _updateSRSQueue();

        _updateUI();
        _rafId = requestAnimationFrame(loop);
    }
    _rafId = requestAnimationFrame(loop);
}

// ─── Interaction Logic ────────────────────────────────────────────────────────

function _declareWar(provId) {
    const prov = _g.provinces.find(p => p.id === provId);
    if (!prov || prov.owner === 'player') return;

    const stats = _getEmpireStats();
    const cost = 100 + (stats.ownedCount * 50);

    if (_g.resources.manpower < cost) {
        _toast(`Not enough Manpower! Need ${cost}`, '#e74c3c');
        return;
    }

    _g.resources.manpower -= cost;
    prov.owner = 'player';
    prov.unrest = 50; // High initial unrest from conquest
    _g.stats.warsWon++;

    // Add province words to SRS
    prov.words.forEach(wid => {
        if (!_g.srs.find(s => s.id === wid)) {
            _g.srs.push({ id: wid, nextReview: Date.now(), interval: 8, ease: 1.5, provinceId: provId, cored: false });
        }
    });

    _toast(`Conquered ${prov.name}! Crush the rebellions in the Dojo!`, '#27ae60');
    _selectedProvinceId = null;
    _renderMap();
    _updateSRSQueue();
    _updateUI();
}

function _buildBuilding(provId, type, cost) {
    const prov = _g.provinces.find(p => p.id === provId);
    if (!prov || prov.owner !== 'player') return;

    if (_g.resources.ducats < cost) {
        _toast(`Not enough Ducats! Need ${cost}`, '#e74c3c');
        return;
    }

    _g.resources.ducats -= cost;
    prov.buildings[type] = true;
    _toast(`Built ${type} in ${prov.name}`, '#f1c40f');
    _renderMap();
    _updateUI();
}

function _buyIdea(key) {
    const idea = IDEAS[key];
    if (_g.ideas[key]) return;

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

// ─── SRS / Combat Logic ───────────────────────────────────────────────────────

function _updateSRSQueue() {
    const now = _gameNow();
    const activeIds = new Set(_vocabQueue.map(v => v.id));
    _pendingReviews = _g.srs.filter(s => activeIds.has(s.id) && s.nextReview <= now);

    const pendingEl = _screens.game?.querySelector('.eu-pending-count');
    if (pendingEl) pendingEl.textContent = _pendingReviews.length;

    const quizScrn = _screens.game?.querySelector('#eu-dojo-quiz');
    const sleepScrn = _screens.game?.querySelector('#eu-dojo-sleep');

    if (!quizScrn || !sleepScrn) return;

    if (_pendingReviews.length > 0) {
        sleepScrn.style.display = 'none';
        quizScrn.style.display = 'flex';
        if (!_g.currentCardId) _loadFlashcard();
    } else {
        quizScrn.style.display = 'none';
        sleepScrn.style.display = 'flex';
        _g.currentCardId = null;
    }
}

function _loadFlashcard() {
    if (!_pendingReviews.length) return;
    _isProcessingAnswer = false;
    
    // Pick the word from the province with the highest unrest to add strategy
    _pendingReviews.sort((a, b) => {
        const pA = _g.provinces.find(p => p.id === a.provinceId);
        const pB = _g.provinces.find(p => p.id === b.provinceId);
        return (pB ? pB.unrest : 0) - (pA ? pA.unrest : 0);
    });

    const srsItem = _pendingReviews[0];
    _g.currentCardId = srsItem.id;
    const correct = _vocabQueue.find(v => v.id === srsItem.id);
    if (!correct) return;

    const prov = _g.provinces.find(p => p.id === srsItem.provinceId);

    const kanjiEl = _screens.game?.querySelector('.eu-fc-kanji');
    const provEl  = _screens.game?.querySelector('.eu-fc-prov');
    const gridEl  = _screens.game?.querySelector('.eu-quiz-grid');
    if (!kanjiEl || !gridEl) return;

    kanjiEl.textContent = correct.kanji;
    if (provEl) provEl.textContent = `Rebels in ${prov ? prov.name : 'Unknown'}`;

    const pool = _vocabQueue.filter(v => v.id !== correct.id);
    const distractors = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [...distractors, correct].sort(() => 0.5 - Math.random());

    gridEl.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'eu-quiz-btn';
        btn.textContent = opt.eng;
        btn.addEventListener('click', (e) => _checkAnswer(opt.id, btn, correct.id, e));
        gridEl.appendChild(btn);
    });
}

function _checkAnswer(selectedId, btnEl, correctId, event) {
    if (_isProcessingAnswer) return;
    _isProcessingAnswer = true;

    const srsItem = _g.srs.find(s => s.id === _g.currentCardId);
    const prov = _g.provinces.find(p => p.id === srsItem.provinceId);

    if (selectedId === correctId) {
        // Correct - Crush Rebellion
        btnEl.classList.add('eu-quiz-correct');
        
        let milGain = _g.ideas.quality ? IDEAS.quality.effect : 2;
        _g.resources.mil += milGain;
        _g.combo++;
        
        if (_g.combo % 5 === 0) {
            _g.resources.dip += 1; // Diplo point every 5 combo
            _spawnFloatingText(event.clientX, event.clientY - 20, '+1 DIP', '#3498db');
        }

        srsItem.interval = Math.round(srsItem.interval * srsItem.ease);
        srsItem.nextReview = _gameNow() + srsItem.interval * 1000;

        // Coring Logic
        if (!srsItem.cored && srsItem.interval >= CORE_INTERVAL_THRESHOLD) {
            srsItem.cored = true;
            _g.resources.adm += 5;
            _g.stats.wordsMastered++;
            _toast(`Word Cored! +5 ADM`, '#f1c40f');
        }

        // Reduce Unrest
        if (prov) {
            prov.unrest = Math.max(0, prov.unrest - 25);
            if (prov.unrest === 0 && prov.rebelling) {
                prov.rebelling = false;
                _g.stats.rebellionsCrushed++;
            }
        }

        _spawnFloatingText(event.clientX, event.clientY, `+${milGain} MIL`, '#c0392b');

        setTimeout(() => {
            _g.currentCardId = null;
            _updateSRSQueue();
            _updateUI();
        }, 400);

    } else {
        // Wrong - Rebellion grows
        btnEl.classList.add('eu-quiz-wrong');
        srsItem.interval = 15;
        srsItem.ease = Math.max(1.3, srsItem.ease - 0.2);
        srsItem.nextReview = _gameNow() + 15000;
        _g.combo = 0;

        if (prov) {
            prov.unrest = Math.min(100, prov.unrest + 30);
            if (prov.unrest >= 100) prov.rebelling = true;
        }

        _spawnFloatingText(event.clientX, event.clientY, `Unrest +30!`, '#e74c3c');

        setTimeout(() => {
            _g.currentCardId = null;
            _updateSRSQueue();
            _updateUI();
        }, 600);
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
    </div>

    <div class="eu-stats-bar">
        <div>Overextension: <strong id="eu-val-oe" style="color:#c0392b">0%</strong></div>
        <div>Rebellions: <strong id="eu-val-rebels">0</strong></div>
        <div>Empire Size: <strong id="eu-val-size">1</strong></div>
        <div style="margin-left:auto;">
            <button class="eu-icon-btn" id="eu-save-btn">💾</button>
            <button class="eu-icon-btn" id="eu-quit-btn">🚪</button>
        </div>
    </div>

    <div class="eu-tabs">
        <button class="eu-tab-btn active" data-target="map">🗺️ World Map</button>
        <button class="eu-tab-btn" data-target="court">👑 Court & Ideas</button>
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
            <h2 class="eu-title">National Ideas</h2>
            <p style="font-size:12px; color:#555; margin-bottom:15px;">Spend Monarch Points to enact permanent policies.</p>
            <div class="eu-ideas-grid" id="eu-ideas-container"></div>
            
            <h2 class="eu-title" style="margin-top:20px;">Empire Statistics</h2>
            <div class="eu-stats-list" id="eu-stats-list"></div>
        </div>

        <!-- BATTLEFIELD TAB -->
        <div class="eu-pane" id="eu-tab-dojo">
            <div class="eu-srs-status">
                <span class="eu-pending-count" style="font-weight:bold;">0</span> active rebellions!
            </div>
            
            <div id="eu-dojo-sleep" class="eu-battle-screen">
                <div style="font-size:40px;">🕊️</div>
                <h3>The Empire is at Peace</h3>
                <p>No provinces are currently rebelling.</p>
            </div>

            <div id="eu-dojo-quiz" class="eu-battle-screen" style="display:none;">
                <div class="eu-fc-prov" style="color:#c0392b; font-weight:bold; margin-bottom:10px;"></div>
                <div class="eu-fc-kanji">...</div>
                <div class="eu-quiz-grid"></div>
            </div>
        </div>
    </div>
    <div id="eu-toasts"></div>
</div>`;

    el.querySelectorAll('.eu-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => _switchTab(btn.getAttribute('data-target')));
    });

    el.querySelector('#eu-save-btn').addEventListener('click', () => { _saveGame(); _toast('Game Saved!', '#27ae60'); });
    el.querySelector('#eu-quit-btn').addEventListener('click', () => {
        if (confirm('Abandon your empire?')) {
            _saveGame();
            _stopGameLoop();
            _onExit();
        }
    });

    _renderMap();
    _renderCourt();
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
            if (prov.rebelling) cell.classList.add('rebelling');
        } else if (_isAdjacentToOwned(prov)) {
            cell.classList.add('adjacent');
        } else {
            cell.classList.add('fog');
        }

        if (prov.id === _selectedProvinceId) cell.classList.add('selected');

        cell.innerHTML = `
            <div class="eu-cell-name">${prov.name}</div>
            ${prov.owner === 'player' ? `<div class="eu-cell-unrest">${Math.floor(prov.unrest)}%</div>` : ''}
            ${prov.rebelling ? '🔥' : ''}
        `;

        cell.addEventListener('click', () => {
            _selectedProvinceId = prov.id;
            _renderMap(); // Re-render to show selection
            _renderProvincePanel(prov);
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
    const isAdj = _isAdjacentToOwned(prov);
    
    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #dcdde1; padding-bottom:10px; margin-bottom:10px;">
            <h3 style="margin:0; font-size:18px;">${prov.name}</h3>
            <span style="font-size:12px; font-weight:bold; color:${isOwned ? '#27ae60' : '#7f8c8d'};">${isOwned ? 'Your Core' : 'Independent'}</span>
        </div>
    `;

    if (isOwned) {
        html += `
            <div class="eu-prov-stats">
                <div>Unrest: <strong style="color:${prov.unrest > 50 ? '#c0392b' : '#333'}">${Math.floor(prov.unrest)}%</strong></div>
                <div>Words: <strong>${prov.words.length}</strong></div>
            </div>
            <div class="eu-build-actions" style="margin-top:15px;">
                <button class="eu-action-btn" id="eu-btn-market" ${prov.buildings.market ? 'disabled' : ''}>
                    ${prov.buildings.market ? '✅ Marketplace' : '🔨 Build Marketplace (50💰)'}
                </button>
                <button class="eu-action-btn" id="eu-btn-barracks" ${prov.buildings.barracks ? 'disabled' : ''}>
                    ${prov.buildings.barracks ? '✅ Barracks' : '🔨 Build Barracks (50💰)'}
                </button>
            </div>
        `;
    } else if (isAdj) {
        const stats = _getEmpireStats();
        const cost = 100 + (stats.ownedCount * 50);
        html += `
            <p style="font-size:13px; color:#555;">A rich neighboring province. Conquering it will add ${prov.words.length} new words to your study deck.</p>
            <button class="eu-action-btn eu-war-btn" id="eu-btn-war">⚔️ Declare War (${cost} ⚔️)</button>
        `;
    } else {
        html += `<p style="font-size:13px; color:#888;">Terra Incognita. You must conquer adjacent provinces first.</p>`;
    }

    panel.innerHTML = html;

    if (isOwned) {
        panel.querySelector('#eu-btn-market')?.addEventListener('click', () => _buildBuilding(prov.id, 'market', 50));
        panel.querySelector('#eu-btn-barracks')?.addEventListener('click', () => _buildBuilding(prov.id, 'barracks', 50));
    } else if (isAdj) {
        panel.querySelector('#eu-btn-war')?.addEventListener('click', () => _declareWar(prov.id));
    }
}

function _renderCourt() {
    const container = _screens.game?.querySelector('#eu-ideas-container');
    const statsList = _screens.game?.querySelector('#eu-stats-list');
    if (!container || !statsList) return;

    container.innerHTML = '';
    Object.entries(IDEAS).forEach(([key, idea]) => {
        const unlocked = _g.ideas[key];
        const canAfford = _g.resources[idea.type] >= idea.cost;
        const div = document.createElement('div');
        div.className = `eu-idea-card ${unlocked ? 'unlocked' : ''}`;
        
        let pointIcon = idea.type === 'adm' ? '📜' : idea.type === 'dip' ? '🕊️' : '🗡️';
        
        div.innerHTML = `
            <div style="font-weight:bold; font-size:14px; margin-bottom:4px;">${idea.name}</div>
            <div style="font-size:11px; color:#555; margin-bottom:8px;">${idea.desc}</div>
            ${unlocked ? `<div style="color:#27ae60; font-weight:bold; font-size:12px;">✅ Enacted</div>` : 
              `<button class="eu-action-btn" ${canAfford ? '' : 'disabled'}>Enact (${idea.cost} ${pointIcon})</button>`}
        `;

        if (!unlocked) {
            div.querySelector('button').addEventListener('click', () => _buyIdea(key));
        }
        container.appendChild(div);
    });

    const stats = _getEmpireStats();
    statsList.innerHTML = `
        <div class="eu-stat-row"><span>Total Provinces Owned</span><span>${stats.ownedCount}</span></div>
        <div class="eu-stat-row"><span>Words Mastered (Cored)</span><span>${_g.stats.wordsMastered}</span></div>
        <div class="eu-stat-row"><span>Rebellions Crushed</span><span>${_g.stats.rebellionsCrushed}</span></div>
        <div class="eu-stat-row"><span>Wars Won</span><span>${_g.stats.warsWon}</span></div>
        <div class="eu-stat-row"><span>Ducats Income</span><span>+${stats.ducatsPerSec.toFixed(1)} /s</span></div>
        <div class="eu-stat-row"><span>Manpower Recovery</span><span>+${stats.manpowerPerSec.toFixed(1)} /s</span></div>
    `;
}

function _updateUI() {
    const g = _screens.game;
    if (!g || g.style.display === 'none') return;

    const stats = _getEmpireStats();

    g.querySelector('#eu-val-ducats').textContent = Math.floor(_g.resources.ducats);
    g.querySelector('#eu-val-manpower').textContent = Math.floor(_g.resources.manpower);
    g.querySelector('#eu-val-adm').textContent = Math.floor(_g.resources.adm);
    g.querySelector('#eu-val-dip').textContent = Math.floor(_g.resources.dip);
    g.querySelector('#eu-val-mil').textContent = Math.floor(_g.resources.mil);

    g.querySelector('#eu-val-oe').textContent = `${Math.floor(stats.overextension)}%`;
    g.querySelector('#eu-val-rebels').textContent = stats.rebellingCount;
    g.querySelector('#eu-val-size').textContent = stats.ownedCount;

    // Update Court if open
    if (g.querySelector('#eu-tab-court').classList.contains('active')) {
        // Debounce full re-render
        if (Math.random() < 0.1) _renderCourt();
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
        _g.provinces = p.provinces || [];
        _g.srs = p.srs || [];
        _g.ideas = p.ideas || {};
        _g.lastTick = Date.now();
    } catch { _g = _freshGame(); }
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
    background: #f4ecd8; /* Parchment */
}

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
    border: 3px solid #2c3e50;
}
.eu-map-cell {
    aspect-ratio: 1; background: #bdc3c7; border: 2px solid #95a5a6;
    border-radius: 6px; display: flex; flex-direction: column; align-items: center;
    justify-content: center; cursor: pointer; position: relative; transition: 0.2s;
}
.eu-map-cell:hover { filter: brightness(1.1); }
.eu-map-cell.fog { background: #5a6a75; border-color: #4a5a65; opacity: 0.5; cursor: not-allowed; }
.eu-map-cell.adjacent { background: #f39c12; border-color: #e67e22; }
.eu-map-cell.owned { background: #27ae60; border-color: #2ecc71; color: white; }
.eu-map-cell.rebelling { background: #c0392b; border-color: #e74c3c; animation: euPulse 1s infinite; }
.eu-map-cell.selected { outline: 3px solid #f1c40f; z-index: 2; transform: scale(1.05); }

.eu-cell-name { font-size: 10px; font-weight: bold; text-align: center; word-break: break-word; }
.eu-cell-unrest { font-size: 12px; font-weight: bold; position: absolute; top: 2px; right: 4px; }

/* Province Panel */
.eu-prov-panel {
    margin-top: 15px; background: white; padding: 15px; border-radius: 8px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.1); border: 1px solid #dcdde1;
}
.eu-prov-stats { display: flex; gap: 20px; font-size: 14px; margin-bottom: 10px; }
.eu-build-actions { display: flex; flex-direction: column; gap: 8px; }
.eu-action-btn {
    background: #ecf0f1; border: 1px solid #bdc3c7; padding: 10px; border-radius: 6px;
    cursor: pointer; font-family: 'Georgia', serif; font-weight: bold; color: #2c3e50;
}
.eu-action-btn:hover:not(:disabled) { background: #dfe6e9; }
.eu-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.eu-war-btn { background: #c0392b; color: white; border-color: #a93226; }
.eu-war-btn:hover:not(:disabled) { background: #e74c3c; }

/* Ideas */
.eu-title { border-bottom: 2px solid #bdc3c7; padding-bottom: 5px; margin-top: 0; }
.eu-ideas-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.eu-idea-card {
    background: white; border: 1px solid #dcdde1; padding: 12px; border-radius: 8px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.05); display: flex; flex-direction: column;
}
.eu-idea-card.unlocked { border-color: #27ae60; background: #f0fdf4; }

/* Stats List */
.eu-stats-list { background: white; border-radius: 8px; padding: 10px; border: 1px solid #dcdde1; }
.eu-stat-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
.eu-stat-row:last-child { border-bottom: none; }

/* Dojo / Combat */
.eu-srs-status { text-align: center; padding: 10px; background: #fab1a0; color: #d63031; border-radius: 8px; margin-bottom: 20px; }
.eu-battle-screen {
    background: white; border-radius: 12px; border: 2px solid #bdc3c7;
    padding: 30px; display: flex; flex-direction: column; align-items: center;
    box-shadow: 0 10px 20px rgba(0,0,0,0.1);
}
.eu-fc-kanji { font-size: 40px; font-weight: bold; margin-bottom: 30px; font-family: sans-serif; }
.eu-quiz-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 100%; max-width: 400px; }
.eu-quiz-btn {
    background: #ecf0f1; border: 2px solid #bdc3c7; padding: 15px; border-radius: 8px;
    font-size: 16px; cursor: pointer; font-family: sans-serif; font-weight:bold;
}
.eu-quiz-correct { background: #27ae60 !important; color: white !important; border-color: #2ecc71 !important; }
.eu-quiz-wrong { background: #c0392b !important; color: white !important; border-color: #e74c3c !important; }

/* Utils */
.eu-icon-btn { background:none; border:none; font-size:16px; cursor:pointer; padding:0 5px; }
#eu-toasts { position: absolute; top: 50px; right: 20px; z-index: 1000; pointer-events: none; }
.eu-toast {
    background: rgba(44, 62, 80, 0.9); color: white; padding: 10px 20px;
    border-radius: 4px; margin-bottom: 10px; font-size: 13px; font-family: sans-serif;
    animation: euFadeUp 3s forwards;
}
.eu-float-text {
    position: fixed; pointer-events: none; font-weight: bold; font-family: sans-serif;
    text-shadow: 1px 1px 2px white; animation: euFloatUp 1s forwards ease-out; z-index: 9999;
}

@keyframes euPulse { 0% { box-shadow: 0 0 0 0 rgba(192, 57, 43, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(192, 57, 43, 0); } 100% { box-shadow: 0 0 0 0 rgba(192, 57, 43, 0); } }
@keyframes euFadeUp { 0% { opacity:0; transform:translateY(10px); } 10% { opacity:1; transform:translateY(0); } 80% { opacity:1; transform:translateY(0); } 100% { opacity:0; transform:translateY(-20px); } }
@keyframes euFloatUp { 0% { opacity:1; transform:translateY(0); } 100% { opacity:0; transform:translateY(-40px); } }
`;
    document.head.appendChild(style);
})();