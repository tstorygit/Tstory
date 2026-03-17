import { CHARACTERS, WEAPONS, PASSIVES } from './surv_entities.js';

let _container = null;
let _engine    = null;
let _vocabQueue = [];
let _srsDb = null;
let _meta  = null;

let dom   = {};
let kills = 0;
let srsTimer = null;

export function initUI(container, engineFunctions, srsDbRef) {
    _container = container;
    _engine    = engineFunctions;
    _srsDb     = srsDbRef;

    _container.innerHTML = `
        <!-- ── HUD ── -->
        <div class="surv-hud" id="surv-hud" style="display:none;">
            <div class="surv-hud-top">
                <div class="surv-hud-stat" id="surv-hud-lvl-wrap">
                    <span class="surv-hud-stat-icon">⚔️</span>
                    <span id="surv-hud-lvl">Lv. 1</span>
                </div>
                <div class="surv-hud-timer" id="surv-hud-time">00:00</div>
                <div class="surv-hud-stat">
                    <span class="surv-hud-stat-icon">💀</span>
                    <span id="surv-hud-kills">0</span>
                </div>
            </div>

            <!-- HP bar -->
            <div class="surv-hp-row">
                <span class="surv-hp-icon">❤️</span>
                <div class="surv-hp-bar-wrap">
                    <div id="surv-hp-fill" class="surv-hp-fill"></div>
                </div>
                <span id="surv-hp-text" class="surv-hp-text">100</span>
            </div>

            <!-- XP bar -->
            <div class="surv-xp-bar-wrap"><div id="surv-xp-fill"></div></div>

            <!-- Weapon / Passive slots -->
            <div class="surv-item-row">
                <div id="surv-weapons-list" class="surv-slot-list"></div>
                <div id="surv-passives-list" class="surv-slot-list surv-slot-list-right"></div>
            </div>
        </div>

        <!-- Virtual Joystick -->
        <div id="surv-joystick-zone">
            <div id="surv-joystick-base"><div id="surv-joystick-knob"></div></div>
        </div>

        <!-- ── SRS Level-Up Quiz ── -->
        <div class="surv-overlay" id="surv-srs-overlay" style="display:none;">
            <div class="surv-modal surv-modal-levelup">
                <div class="surv-modal-badge surv-badge-gold">⬆ LEVEL UP</div>
                <h3 class="surv-modal-title" style="color:#f1c40f;">Clash of Wills</h3>
                <p class="surv-modal-sub">Answer correctly to choose a power-up!</p>
                <div id="surv-srs-timer-wrap" class="surv-timer-bar-wrap">
                    <div id="surv-srs-timer-fill" class="surv-timer-fill"></div>
                </div>
                <div class="surv-quiz-word-block">
                    <div class="surv-srs-furi" id="surv-srs-furi"></div>
                    <div class="surv-srs-kanji" id="surv-srs-kanji"></div>
                </div>
                <div class="surv-srs-grid" id="surv-srs-grid"></div>
            </div>
        </div>

        <!-- ── Boss Chest Quiz ── -->
        <div class="surv-overlay" id="surv-chest-overlay" style="display:none;">
            <div class="surv-modal surv-modal-chest">
                <div class="surv-modal-badge surv-badge-purple">🧰 BOSS CHEST</div>
                <h3 class="surv-modal-title" style="color:#9b59b6;">Rapid Fire!</h3>
                <p class="surv-modal-sub">Answer 3 in a row to claim the chest.</p>
                <div class="surv-chest-progress" id="surv-chest-progress">
                    <div class="surv-chest-dot" id="surv-chest-dot-1"></div>
                    <div class="surv-chest-dot" id="surv-chest-dot-2"></div>
                    <div class="surv-chest-dot" id="surv-chest-dot-3"></div>
                </div>
                <div id="surv-chest-timer-wrap" class="surv-timer-bar-wrap">
                    <div id="surv-chest-timer-fill" class="surv-timer-fill surv-timer-fill-purple"></div>
                </div>
                <div class="surv-quiz-word-block">
                    <div class="surv-srs-furi" id="surv-chest-furi"></div>
                    <div class="surv-srs-kanji" id="surv-chest-kanji"></div>
                </div>
                <div class="surv-srs-grid" id="surv-chest-grid"></div>
            </div>
        </div>

        <!-- ── Upgrade Selection ── -->
        <div class="surv-overlay" id="surv-upgrade-overlay" style="display:none;">
            <div class="surv-modal surv-modal-upgrade">
                <div id="surv-upg-badge" class="surv-modal-badge surv-badge-green">⚡ POWER UP</div>
                <h3 id="surv-upg-title" class="surv-modal-title" style="color:#2ecc71;">Choose Your Power</h3>
                <div id="surv-upgrade-list" class="surv-upgrade-list"></div>
            </div>
        </div>

        <!-- ── Penalty Overlay ── -->
        <div class="surv-overlay" id="surv-penalty-overlay" style="display:none;">
            <div class="surv-modal surv-modal-penalty">
                <div class="surv-modal-badge surv-badge-red">✗ FOCUS LOST</div>
                <h3 class="surv-modal-title" style="color:#e74c3c;">Wrong Answer</h3>
                <p id="surv-penalty-msg" class="surv-modal-sub"></p>
                <div class="surv-upg-card surv-upg-card-penalty">
                    <div class="surv-upg-icon">🩸</div>
                    <div class="surv-upg-info">
                        <div class="surv-upg-name" style="color:#e74c3c;">Corrupted Vitality</div>
                        <div class="surv-upg-desc" id="surv-penalty-desc">+1% Max HP. No other gains.</div>
                    </div>
                </div>
                <button class="surv-btn-danger" id="surv-btn-continue">Continue →</button>
            </div>
        </div>

        <!-- ── Game Over / Win Summary ── -->
        <div class="surv-overlay" id="surv-summary-overlay" style="display:none;">
            <div class="surv-modal surv-modal-summary">
                <h2 id="surv-sum-title" class="surv-sum-title"></h2>
                <div class="surv-sum-stats">
                    <div class="surv-sum-row">
                        <span class="surv-sum-label">⏱ Time Survived</span>
                        <strong id="surv-sum-time" class="surv-sum-val"></strong>
                    </div>
                    <div class="surv-sum-row">
                        <span class="surv-sum-label">💀 Enemies Defeated</span>
                        <strong id="surv-sum-kills" class="surv-sum-val"></strong>
                    </div>
                    <div class="surv-sum-row">
                        <span class="surv-sum-label">👻 Souls Harvested</span>
                        <strong id="surv-sum-souls" class="surv-sum-val surv-sum-souls"></strong>
                    </div>
                </div>
                <button class="surv-btn-primary" id="surv-btn-camp">⛺ Return to Camp</button>
            </div>
        </div>
    `;

    dom = {
        hud:      _container.querySelector('#surv-hud'),
        lvl:      _container.querySelector('#surv-hud-lvl'),
        time:     _container.querySelector('#surv-hud-time'),
        kills:    _container.querySelector('#surv-hud-kills'),
        xpFill:   _container.querySelector('#surv-xp-fill'),
        hpFill:   _container.querySelector('#surv-hp-fill'),
        hpText:   _container.querySelector('#surv-hp-text'),
        wpnList:  _container.querySelector('#surv-weapons-list'),
        pasList:  _container.querySelector('#surv-passives-list'),

        srs:      _container.querySelector('#surv-srs-overlay'),
        srsTimer: _container.querySelector('#surv-srs-timer-fill'),
        furi:     _container.querySelector('#surv-srs-furi'),
        kanji:    _container.querySelector('#surv-srs-kanji'),
        grid:     _container.querySelector('#surv-srs-grid'),

        chest:    _container.querySelector('#surv-chest-overlay'),
        chestDots: [
            _container.querySelector('#surv-chest-dot-1'),
            _container.querySelector('#surv-chest-dot-2'),
            _container.querySelector('#surv-chest-dot-3')
        ],
        chestTimer: _container.querySelector('#surv-chest-timer-fill'),
        chestFuri:  _container.querySelector('#surv-chest-furi'),
        chestKanji: _container.querySelector('#surv-chest-kanji'),
        chestGrid:  _container.querySelector('#surv-chest-grid'),

        upg:      _container.querySelector('#surv-upgrade-overlay'),
        upgBadge: _container.querySelector('#surv-upg-badge'),
        upgTitle: _container.querySelector('#surv-upg-title'),
        upgList:  _container.querySelector('#surv-upgrade-list'),

        pen:     _container.querySelector('#surv-penalty-overlay'),
        penMsg:  _container.querySelector('#surv-penalty-msg'),
        penDesc: _container.querySelector('#surv-penalty-desc'),
        btnCont: _container.querySelector('#surv-btn-continue'),

        sum:       _container.querySelector('#surv-summary-overlay'),
        sumTitle:  _container.querySelector('#surv-sum-title'),
        sumTime:   _container.querySelector('#surv-sum-time'),
        sumKills:  _container.querySelector('#surv-sum-kills'),
        sumSouls:  _container.querySelector('#surv-sum-souls'),
        btnCamp:   _container.querySelector('#surv-btn-camp')
    };

    dom.btnCont.onclick = () => { dom.pen.style.display = 'none'; _engine.resume(); };
}

export function resetGameUI(vocabQueue, metaData) {
    _vocabQueue = vocabQueue;
    _meta       = metaData;
    kills       = 0;
    chestStep   = 0;
    dom.hud.style.display = 'flex';
    dom.sum.style.display = 'none';
}

export function drawHUD(hp, maxHp, xp, xpNext, level, time) {
    dom.lvl.textContent  = `Lv. ${level}`;
    dom.kills.textContent = kills.toLocaleString();

    const m = Math.floor(time / 60).toString().padStart(2, '0');
    const s = Math.floor(time % 60).toString().padStart(2, '0');
    dom.time.textContent = `${m}:${s}`;

    // XP bar
    dom.xpFill.style.width = `${(xp / xpNext) * 100}%`;

    // HP bar with color transitions
    const hpPct = Math.max(0, (hp / maxHp) * 100);
    dom.hpFill.style.width = `${hpPct}%`;
    dom.hpFill.className = 'surv-hp-fill' + (hpPct < 30 ? ' danger' : hpPct < 60 ? ' warning' : '');
    dom.hpText.textContent = `${Math.ceil(hp)}`;

    // Weapon / passive slots
    const weapons  = _engine.getActiveWeapons();
    const passives = _engine.getActivePassives();

    dom.wpnList.innerHTML = weapons.map(w => {
        const def = WEAPONS[w.id];
        return `<div class="surv-slot" title="${def.name} Lv.${w.level}">${def.icon}<span class="surv-slot-lvl">${w.level}</span></div>`;
    }).join('');

    dom.pasList.innerHTML = passives.map(p => {
        const def = PASSIVES[p.id];
        return `<div class="surv-slot" title="${def.name} Lv.${p.level}">${def.icon}<span class="surv-slot-lvl">${p.level}</span></div>`;
    }).join('');
}

export function incrementKill() { kills++; }

// ─── SRS QUIZ ──────────────────────────────────────────────────────────────

let currentTarget = null;
let srsTimeLeft   = 5.0;

export function showSrsQuiz() {
    dom.srs.style.display = 'flex';

    const res = _srsDb.getNextGameWord(_vocabQueue, 'mixed')
        || { wordObj: _vocabQueue[Math.floor(Math.random() * _vocabQueue.length)] };
    currentTarget = res.wordObj;

    dom.kanji.textContent = currentTarget.word;
    dom.furi.textContent  = currentTarget.furi !== currentTarget.word ? currentTarget.furi : '';

    const pool       = _vocabQueue.filter(w => w.word !== currentTarget.word).map(w => w.trans);
    const distractors = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options     = [...distractors, currentTarget.trans].sort(() => 0.5 - Math.random());

    dom.grid.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'surv-srs-btn';
        btn.textContent = opt;
        btn.onclick = () => submitAnswer(opt === currentTarget.trans);
        dom.grid.appendChild(btn);
    });

    srsTimeLeft = 5.0;
    dom.srsTimer.style.width = '100%';
    dom.srsTimer.style.transition = 'none';

    if (srsTimer) clearInterval(srsTimer);
    srsTimer = setInterval(() => {
        srsTimeLeft -= 0.1;
        dom.srsTimer.style.width = `${(srsTimeLeft / 5) * 100}%`;
        if (srsTimeLeft <= 0) submitAnswer(false, true);
    }, 100);
}

function submitAnswer(isCorrect, isTimeout = false) {
    clearInterval(srsTimer);

    _srsDb.gradeWordInGame({
        word: currentTarget.word, furi: currentTarget.furi, trans: currentTarget.trans
    }, isCorrect ? 3 : 0, false);

    dom.srs.style.display = 'none';

    if (isCorrect) {
        _meta.stats.totalWordsMastered++;
        showUpgrades(false);
    } else {
        dom.penMsg.textContent  = `Correct meaning: "${currentTarget.trans}"`;
        dom.penDesc.textContent = '+1% Max HP. No power-up this level.';
        _engine.applyPenalty();
        dom.pen.style.display = 'flex';
    }
}

// ─── CHEST QUIZ ────────────────────────────────────────────────────────────

let chestStep = 0;

export function showChestQuiz() {
    dom.chest.style.display = 'flex';
    chestStep = 0;
    dom.chestDots.forEach(d => { d.classList.remove('filled', 'wrong'); });
    _nextChestQuestion();
}

function _nextChestQuestion() {
    const res = _srsDb.getNextGameWord(_vocabQueue, 'mixed')
        || { wordObj: _vocabQueue[Math.floor(Math.random() * _vocabQueue.length)] };
    currentTarget = res.wordObj;

    dom.chestKanji.textContent = currentTarget.word;
    dom.chestFuri.textContent  = currentTarget.furi !== currentTarget.word ? currentTarget.furi : '';

    const pool        = _vocabQueue.filter(w => w.word !== currentTarget.word).map(w => w.trans);
    const distractors = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options     = [...distractors, currentTarget.trans].sort(() => 0.5 - Math.random());

    dom.chestGrid.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'surv-srs-btn';
        btn.textContent = opt;
        btn.onclick = () => _submitChestAnswer(opt === currentTarget.trans);
        dom.chestGrid.appendChild(btn);
    });

    srsTimeLeft = 4.0;
    dom.chestTimer.style.width = '100%';

    if (srsTimer) clearInterval(srsTimer);
    srsTimer = setInterval(() => {
        srsTimeLeft -= 0.1;
        dom.chestTimer.style.width = `${(srsTimeLeft / 4) * 100}%`;
        if (srsTimeLeft <= 0) _submitChestAnswer(false, true);
    }, 100);
}

function _submitChestAnswer(isCorrect) {
    clearInterval(srsTimer);
    _srsDb.gradeWordInGame({
        word: currentTarget.word, furi: currentTarget.furi, trans: currentTarget.trans
    }, isCorrect ? 3 : 0, false);

    if (isCorrect) {
        dom.chestDots[chestStep].classList.add('filled');
        chestStep++;
        if (chestStep >= 3) {
            dom.chest.style.display = 'none';
            showUpgrades(true);
        } else {
            _nextChestQuestion();
        }
    } else {
        dom.chestDots[chestStep].classList.add('wrong');
        dom.chest.style.display = 'none';
        dom.penMsg.textContent  = `Correct: "${currentTarget.trans}" — Chest corrupted!`;
        dom.penDesc.textContent = 'Consolation: +500 Souls added to your hoard.';
        _meta.souls += 500;
        localStorage.setItem('surv_meta', JSON.stringify(_meta));
        dom.pen.style.display = 'flex';
    }
}

// ─── UPGRADES ──────────────────────────────────────────────────────────────

function showUpgrades(isChest) {
    dom.upg.style.display = 'flex';
    dom.upgList.innerHTML = '';

    if (isChest) {
        dom.upgTitle.textContent   = 'Chest Opened!';
        dom.upgTitle.style.color   = '#9b59b6';
        dom.upgBadge.textContent   = '🧰 CHEST REWARD';
        dom.upgBadge.className     = 'surv-modal-badge surv-badge-purple';
    } else {
        dom.upgTitle.textContent   = 'Choose Your Power';
        dom.upgTitle.style.color   = '#2ecc71';
        dom.upgBadge.textContent   = '⚡ POWER UP';
        dom.upgBadge.className     = 'surv-modal-badge surv-badge-green';
    }

    const activeW = _engine.getActiveWeapons();
    const activeP = _engine.getActivePassives();
    const pool    = [];

    activeW.forEach(aw => {
        if (aw.level < WEAPONS[aw.id].levels.length)
            pool.push({ type: 'weapon', id: aw.id, level: aw.level + 1 });
    });
    if (activeW.length < 6) {
        Object.keys(WEAPONS).forEach(k => {
            if (!activeW.find(aw => aw.id === k)) pool.push({ type: 'weapon', id: k, level: 1 });
        });
    }

    activeP.forEach(ap => {
        if (ap.level < PASSIVES[ap.id].maxLevel)
            pool.push({ type: 'passive', id: ap.id, level: ap.level + 1 });
    });
    if (activeP.length < 6) {
        Object.keys(PASSIVES).forEach(k => {
            if (!activeP.find(ap => ap.id === k)) pool.push({ type: 'passive', id: k, level: 1 });
        });
    }

    if (pool.length === 0) {
        pool.push({ type: 'heal', name: 'Ramen Bowl', icon: '🍜', desc: 'Restore 50% HP.' });
        pool.push({ type: 'gold', name: 'Coin Pouch', icon: '💰', desc: '+100 Souls.' });
        pool.push({ type: 'heal', name: 'Onigiri', icon: '🍙', desc: 'Restore 25% HP.' });
    }

    const choices = pool.sort(() => 0.5 - Math.random()).slice(0, 3);

    choices.forEach(c => {
        const card = document.createElement('div');
        card.className = 'surv-upg-card' + (isChest ? ' chest-reward' : '');

        let icon, name, desc, isNew = false;
        if (c.type === 'weapon') {
            const w = WEAPONS[c.id];
            icon = w.icon;
            name = w.name;
            desc = w.levels[c.level - 1].desc;
            isNew = c.level === 1;
        } else if (c.type === 'passive') {
            const p = PASSIVES[c.id];
            icon = p.icon;
            name = p.name;
            desc = p.desc;
            isNew = c.level === 1;
        } else {
            icon = c.icon; name = c.name; desc = c.desc;
        }

        card.innerHTML = `
            <div class="surv-upg-icon">${icon}</div>
            <div class="surv-upg-info">
                <div class="surv-upg-name">
                    ${name}
                    ${c.level ? `<span class="surv-upg-lvl ${isNew ? 'surv-upg-lvl-new' : ''}">Lv.${c.level}</span>` : ''}
                </div>
                <div class="surv-upg-desc">${desc}</div>
            </div>
        `;
        card.onclick = () => {
            dom.upg.style.display = 'none';
            if (c.type === 'heal') {
                _engine.applyPenalty();
                _engine.applyPenalty();
            } else if (c.type === 'gold') {
                _meta.souls += 100;
            } else {
                _engine.applyUpgrade(c);
            }
            _engine.resume();
        };
        dom.upgList.appendChild(card);
    });
}

// ─── GAME OVER ─────────────────────────────────────────────────────────────

export function showGameOver(isWin, exitCallback) {
    dom.hud.style.display = 'none';
    dom.sum.style.display = 'flex';

    dom.sumTitle.textContent = isWin ? '🌅 Sunrise Reached!' : '💀 Fallen in Battle';
    dom.sumTitle.style.color = isWin ? '#f1c40f' : '#e74c3c';

    const t = _engine.getElapsedTime();
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = Math.floor(t % 60).toString().padStart(2, '0');

    dom.sumTime.textContent  = `${m}:${s}`;
    dom.sumKills.textContent = kills.toLocaleString();

    let earnedSouls = Math.floor(kills / 10);
    if (isWin) earnedSouls = Math.floor(earnedSouls * 1.5);
    earnedSouls = Math.floor(earnedSouls * (1 + (_meta.upgrades.greed || 0) * 0.05));

    dom.sumSouls.textContent = `+${earnedSouls.toLocaleString()}`;

    _meta.souls += earnedSouls;
    if (t > _meta.stats.highestTime) _meta.stats.highestTime = t;
    localStorage.setItem('surv_meta', JSON.stringify(_meta));

    dom.btnCamp.onclick = () => { dom.sum.style.display = 'none'; exitCallback(); };
}