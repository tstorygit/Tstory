
import { CHARACTERS, WEAPONS, PASSIVES } from './surv_entities.js';

let _container = null;
let _engine = null; // direct functions now { applyUpgrade, applyPenalty, resume, etc. }
let _vocabQueue = [];
let _srsDb = null;
let _meta = null;

let dom = {};
let kills = 0;
let srsTimer = null;

export function initUI(container, engineFunctions, srsDbRef) {
    _container = container;
    _engine = engineFunctions;
    _srsDb = srsDbRef;

    _container.innerHTML = `
        <div class="surv-hud" id="surv-hud" style="display:none;">
            <div class="surv-hud-top">
                <span id="surv-hud-lvl">Lv. 1</span>
                <span id="surv-hud-time">00:00</span>
                <span id="surv-hud-kills">💀 0</span>
            </div>
            <div class="surv-xp-bar-wrap"><div id="surv-xp-fill"></div></div>
            <div style="display:flex; justify-content:space-between; margin-top:4px;">
                <div id="surv-weapons-list" style="display:flex; gap:2px; font-size:12px;"></div>
                <div id="surv-passives-list" style="display:flex; gap:2px; font-size:12px;"></div>
            </div>
        </div>

        <div id="surv-joystick-zone">
            <div id="surv-joystick-base"><div id="surv-joystick-knob"></div></div>
        </div>

        <!-- Overlays -->
        <div class="surv-overlay" id="surv-srs-overlay" style="display:none;">
            <div class="surv-modal">
                <h3 style="color:#f1c40f; margin:0;">Level Up! Clash of Wills</h3>
                <div id="surv-srs-timer-wrap"><div id="surv-srs-timer-fill"></div></div>
                <div>
                    <div class="surv-srs-furi" id="surv-srs-furi"></div>
                    <div class="surv-srs-kanji" id="surv-srs-kanji"></div>
                </div>
                <div class="surv-srs-grid" id="surv-srs-grid"></div>
            </div>
        </div>
        
        <!-- Chest Quiz Overlay -->
        <div class="surv-overlay" id="surv-chest-overlay" style="display:none;">
            <div class="surv-modal">
                <h3 style="color:#9b59b6; margin:0;">Boss Chest: Rapid Fire!</h3>
                <div class="surv-chest-progress" id="surv-chest-progress">
                    <div class="surv-chest-dot" id="surv-chest-dot-1"></div>
                    <div class="surv-chest-dot" id="surv-chest-dot-2"></div>
                    <div class="surv-chest-dot" id="surv-chest-dot-3"></div>
                </div>
                <div id="surv-chest-timer-wrap"><div id="surv-chest-timer-fill"></div></div>
                <div>
                    <div class="surv-srs-furi" id="surv-chest-furi"></div>
                    <div class="surv-srs-kanji" id="surv-chest-kanji"></div>
                </div>
                <div class="surv-srs-grid" id="surv-chest-grid"></div>
            </div>
        </div>

        <div class="surv-overlay" id="surv-upgrade-overlay" style="display:none;">
            <div class="surv-modal">
                <h3 id="surv-upg-title" style="color:#2ecc71; margin:0;">Choose Your Power</h3>
                <div id="surv-upgrade-list" style="display:flex; flex-direction:column; gap:10px;"></div>
            </div>
        </div>

        <div class="surv-overlay" id="surv-penalty-overlay" style="display:none;">
            <div class="surv-modal">
                <h3 style="color:#e74c3c; margin:0;">Focus Lost...</h3>
                <p id="surv-penalty-msg" style="color:var(--text-muted); font-size:14px;"></p>
                <div class="surv-upg-card" style="border-color:#e74c3c; cursor:default;">
                    <div class="surv-upg-icon">🩸</div>
                    <div class="surv-upg-info">
                        <div class="surv-upg-name" style="color:#e74c3c;">Corrupted Vitality</div>
                        <div class="surv-upg-desc" id="surv-penalty-desc">+1% Max HP. No other gains.</div>
                    </div>
                </div>
                <button class="primary-btn" id="surv-btn-continue" style="background:#e74c3c;">Continue</button>
            </div>
        </div>

        <div class="surv-overlay" id="surv-summary-overlay" style="display:none;">
            <div class="surv-modal">
                <h2 id="surv-sum-title" style="margin:0;"></h2>
                <div style="font-size:14px; color:var(--text-muted); text-align:left; display:flex; flex-direction:column; gap:8px;">
                    <div>Time Survived: <strong id="surv-sum-time" style="color:var(--text-main);"></strong></div>
                    <div>Enemies Defeated: <strong id="surv-sum-kills" style="color:var(--text-main);"></strong></div>
                    <div>Souls Harvested: <strong id="surv-sum-souls" style="color:#9b59b6;"></strong></div>
                </div>
                <button class="primary-btn" id="surv-btn-camp">Return to Camp</button>
            </div>
        </div>
    `;

    dom = {
        hud: _container.querySelector('#surv-hud'),
        lvl: _container.querySelector('#surv-hud-lvl'),
        time: _container.querySelector('#surv-hud-time'),
        kills: _container.querySelector('#surv-hud-kills'),
        xpFill: _container.querySelector('#surv-xp-fill'),
        wpnList: _container.querySelector('#surv-weapons-list'),
        pasList: _container.querySelector('#surv-passives-list'),

        srs: _container.querySelector('#surv-srs-overlay'),
        srsTimer: _container.querySelector('#surv-srs-timer-fill'),
        furi: _container.querySelector('#surv-srs-furi'),
        kanji: _container.querySelector('#surv-srs-kanji'),
        grid: _container.querySelector('#surv-srs-grid'),
        
        chest: _container.querySelector('#surv-chest-overlay'),
        chestDots: [
            _container.querySelector('#surv-chest-dot-1'),
            _container.querySelector('#surv-chest-dot-2'),
            _container.querySelector('#surv-chest-dot-3')
        ],
        chestTimer: _container.querySelector('#surv-chest-timer-fill'),
        chestFuri: _container.querySelector('#surv-chest-furi'),
        chestKanji: _container.querySelector('#surv-chest-kanji'),
        chestGrid: _container.querySelector('#surv-chest-grid'),

        upg: _container.querySelector('#surv-upgrade-overlay'),
        upgTitle: _container.querySelector('#surv-upg-title'),
        upgList: _container.querySelector('#surv-upgrade-list'),

        pen: _container.querySelector('#surv-penalty-overlay'),
        penMsg: _container.querySelector('#surv-penalty-msg'),
        penDesc: _container.querySelector('#surv-penalty-desc'),
        btnCont: _container.querySelector('#surv-btn-continue'),

        sum: _container.querySelector('#surv-summary-overlay'),
        sumTitle: _container.querySelector('#surv-sum-title'),
        sumTime: _container.querySelector('#surv-sum-time'),
        sumKills: _container.querySelector('#surv-sum-kills'),
        sumSouls: _container.querySelector('#surv-sum-souls'),
        btnCamp: _container.querySelector('#surv-btn-camp')
    };

    dom.btnCont.onclick = () => { dom.pen.style.display = 'none'; _engine.resume(); };
}

export function resetGameUI(vocabQueue, metaData) {
    _vocabQueue = vocabQueue;
    _meta = metaData;
    kills = 0;
    chestStep = 0;
    dom.hud.style.display = 'flex';
    dom.sum.style.display = 'none';
}

export function drawHUD(hp, maxHp, xp, xpNext, level, time) {
    dom.lvl.textContent = `Lv. ${level}`;
    const m = Math.floor(time / 60).toString().padStart(2, '0');
    const s = Math.floor(time % 60).toString().padStart(2, '0');
    dom.time.textContent = `${m}:${s}`;
    dom.kills.textContent = `💀 ${kills}`;
    
    const pct = (xp / xpNext) * 100;
    dom.xpFill.style.width = `${pct}%`;

    if (hp / maxHp < 0.3) dom.lvl.style.color = '#e74c3c';
    else dom.lvl.style.color = 'white';

    dom.wpnList.innerHTML = _engine.getActiveWeapons().map(w => WEAPONS[w.id].icon).join('');
    dom.pasList.innerHTML = _engine.getActivePassives().map(p => PASSIVES[p.id].icon).join('');
}

export function incrementKill() { kills++; }

// ─── REGULAR SRS LEVEL UP ───

let currentTarget = null;
let srsTimeLeft = 5.0;

export function showSrsQuiz() {
    dom.srs.style.display = 'flex';
    
    const res = _srsDb.getNextGameWord(_vocabQueue, 'mixed') || { wordObj: _vocabQueue[Math.floor(Math.random()*_vocabQueue.length)] };
    currentTarget = res.wordObj;

    dom.kanji.textContent = currentTarget.word;
    dom.furi.textContent = currentTarget.furi !== currentTarget.word ? currentTarget.furi : '';

    const pool = _vocabQueue.filter(w => w.word !== currentTarget.word).map(w => w.trans);
    const distractors = pool.sort(()=>0.5-Math.random()).slice(0,3);
    const options = [...distractors, currentTarget.trans].sort(()=>0.5-Math.random());

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
        dom.penMsg.textContent = `The correct meaning was: ${currentTarget.trans}`;
        dom.penDesc.textContent = "+1% Max HP. No other gains.";
        _engine.applyPenalty();
        dom.pen.style.display = 'flex';
    }
}

// ─── BOSS CHEST QUIZ ───

let chestStep = 0;

export function showChestQuiz() {
    dom.chest.style.display = 'flex';
    chestStep = 0;
    dom.chestDots.forEach(d => { d.classList.remove('filled'); d.classList.remove('wrong'); });
    _nextChestQuestion();
}

function _nextChestQuestion() {
    const res = _srsDb.getNextGameWord(_vocabQueue, 'mixed') || { wordObj: _vocabQueue[Math.floor(Math.random()*_vocabQueue.length)] };
    currentTarget = res.wordObj;

    dom.chestKanji.textContent = currentTarget.word;
    dom.chestFuri.textContent = currentTarget.furi !== currentTarget.word ? currentTarget.furi : '';

    const pool = _vocabQueue.filter(w => w.word !== currentTarget.word).map(w => w.trans);
    const distractors = pool.sort(()=>0.5-Math.random()).slice(0,3);
    const options = [...distractors, currentTarget.trans].sort(()=>0.5-Math.random());

    dom.chestGrid.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'surv-srs-btn';
        btn.textContent = opt;
        btn.onclick = () => _submitChestAnswer(opt === currentTarget.trans);
        dom.chestGrid.appendChild(btn);
    });

    srsTimeLeft = 4.0; // Faster for chests!
    dom.chestTimer.style.width = '100%';
    
    if (srsTimer) clearInterval(srsTimer);
    srsTimer = setInterval(() => {
        srsTimeLeft -= 0.1;
        dom.chestTimer.style.width = `${(srsTimeLeft / 4) * 100}%`;
        if (srsTimeLeft <= 0) _submitChestAnswer(false, true);
    }, 100);
}

function _submitChestAnswer(isCorrect, isTimeout = false) {
    clearInterval(srsTimer);
    _srsDb.gradeWordInGame({
        word: currentTarget.word, furi: currentTarget.furi, trans: currentTarget.trans
    }, isCorrect ? 3 : 0, false);

    if (isCorrect) {
        dom.chestDots[chestStep].classList.add('filled');
        chestStep++;
        if (chestStep >= 3) {
            dom.chest.style.display = 'none';
            showUpgrades(true); // isChest = true
        } else {
            _nextChestQuestion();
        }
    } else {
        dom.chestDots[chestStep].classList.add('wrong');
        dom.chest.style.display = 'none';
        dom.penMsg.textContent = `The correct meaning was: ${currentTarget.trans}`;
        dom.penDesc.textContent = "Chest corrupted! Gained 500 Souls instead of an item.";
        _meta.souls += 500;
        localStorage.setItem('surv_meta', JSON.stringify(_meta));
        dom.pen.style.display = 'flex';
    }
}

// ─── UPGRADE SELECTION ───

function showUpgrades(isChest) {
    dom.upg.style.display = 'flex';
    dom.upgList.innerHTML = '';
    dom.upgTitle.textContent = isChest ? 'Chest Opened! Choose Evolution' : 'Choose Your Power';
    dom.upgTitle.style.color = isChest ? '#9b59b6' : '#2ecc71';

    let choices = [];
    const activeW = _engine.getActiveWeapons();
    const activeP = _engine.getActivePassives();
    const pool = [];
    
    activeW.forEach(aw => {
        if (aw.level < WEAPONS[aw.id].levels.length) pool.push({ type: 'weapon', id: aw.id, level: aw.level+1 });
    });
    if (activeW.length < 6) {
        Object.keys(WEAPONS).forEach(k => {
            if (!activeW.find(aw => aw.id === k)) pool.push({ type: 'weapon', id: k, level: 1 });
        });
    }
    
    activeP.forEach(ap => {
        if (ap.level < PASSIVES[ap.id].maxLevel) pool.push({ type: 'passive', id: ap.id, level: ap.level+1 });
    });
    if (activeP.length < 6) {
        Object.keys(PASSIVES).forEach(k => {
            if (!activeP.find(ap => ap.id === k)) pool.push({ type: 'passive', id: k, level: 1 });
        });
    }

    if (pool.length === 0) {
        pool.push({ type: 'heal', name: 'Ramen', icon: '🍜', desc: 'Heal 50% HP.' });
        pool.push({ type: 'gold', name: 'Coin Pouch', icon: '💰', desc: '+100 Souls.' });
    }

    // Chests offer 3 choices just like leveling, but visually distinct (could add actual evolutions here later)
    choices = pool.sort(()=>0.5-Math.random()).slice(0, 3);

    choices.forEach(c => {
        const card = document.createElement('div');
        card.className = 'surv-upg-card' + (isChest ? ' chest-reward' : '');
        
        let icon, name, desc;
        if (c.type === 'weapon') {
            const w = WEAPONS[c.id];
            icon = w.icon; name = `${w.name} Lv.${c.level}`; desc = w.levels[c.level-1].desc;
        } else if (c.type === 'passive') {
            const p = PASSIVES[c.id];
            icon = p.icon; name = `${p.name} Lv.${c.level}`; desc = p.desc;
        } else {
            icon = c.icon; name = c.name; desc = c.desc;
        }

        card.innerHTML = `
            <div class="surv-upg-icon">${icon}</div>
            <div class="surv-upg-info">
                <div class="surv-upg-name">${name}</div>
                <div class="surv-upg-desc">${desc}</div>
            </div>
        `;
        card.onclick = () => {
            dom.upg.style.display = 'none';
            if (c.type === 'heal') {
                _engine.applyPenalty(); // Heals 10%
                _engine.applyPenalty(); // Heals another 10%...
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

export function showGameOver(isWin, exitCallback) {
    dom.hud.style.display = 'none';
    dom.sum.style.display = 'flex';
    
    dom.sumTitle.textContent = isWin ? 'Sunrise Reached' : 'Slain';
    dom.sumTitle.style.color = isWin ? '#f1c40f' : '#e74c3c';

    const t = _engine.getElapsedTime();
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    
    dom.sumTime.textContent = `${m}:${s}`;
    dom.sumKills.textContent = kills;

    let earnedSouls = Math.floor(kills / 10);
    if (isWin) earnedSouls = Math.floor(earnedSouls * 1.5);
    earnedSouls = Math.floor(earnedSouls * (1 + (_meta.upgrades.greed||0)*0.05));

    dom.sumSouls.textContent = `+${earnedSouls}`;

    _meta.souls += earnedSouls;
    if (t > _meta.stats.highestTime) _meta.stats.highestTime = t;
    localStorage.setItem('surv_meta', JSON.stringify(_meta));

    dom.btnCamp.onclick = () => {
        dom.sum.style.display = 'none';
        exitCallback();
    };
}
