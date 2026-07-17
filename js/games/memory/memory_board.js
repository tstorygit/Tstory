// memory_board.js — board rendering, matching, scoring, and round summary.
import { getState, addCoins, spendCoins, recordRoundStats, getEquippedIcon, PEEK_COST } from './memory_state.js';
import { buildRoundManager, gradeRoundResults, runBonusQuiz } from './memory_vocab.js';

let _container = null;
let _onQuit = null;
let _config = null;
let _allWords = [];      // full deduped queue from setup (for replays)
let _cards = [];
let _flipped = [];
let _matchedPairs = 0;
let _combo = 0;
let _bestCombo = 0;
let _isLocked = false;
let _isPeeking = false;
let _peekUsed = false;
let _sessionCoins = 0;
let _startTime = 0;
let _mgr = null;         // GameVocabManager for this round
let _perf = new Map();   // wordId → { matched, failures }
let _roundGraded = false;

const GRADE_BADGES = {
    3: { cls: 'mem-grade-3', label: '🟢 Perfect' },
    2: { cls: 'mem-grade-2', label: '🟡 Good' },
    1: { cls: 'mem-grade-1', label: '🟠 Shaky' },
    0: { cls: 'mem-grade-0', label: '🔴 Forgot' }
};

function _esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function startBoard(container, validWords, config, onQuitCallback, reshuffle = false) {
    _container = container;
    _config = config;
    _onQuit = onQuitCallback;
    _allWords = validWords || [];
    _flipped = [];
    _matchedPairs = 0;
    _combo = 0;
    _bestCombo = 0;
    _isLocked = false;
    _isPeeking = false;
    _peekUsed = false;
    _sessionCoins = 0;
    _roundGraded = false;
    _startTime = Date.now();

    const pairCount = Math.floor(_config.layout / 2);
    // Honor the vocab selector's ordering (sequential/reverse/random) on the
    // first round; reshuffle on replays so "Play Again" gives a fresh board.
    const source = reshuffle ? _shuffle([..._allWords]) : _allWords;
    const roundWords = source.slice(0, pairCount);

    _perf = new Map();
    roundWords.forEach(w => _perf.set(w.word, { matched: false, failures: 0 }));

    _mgr = buildRoundManager(roundWords);

    _generateDeck(roundWords);
    _renderBoard();
}

function _generateDeck(roundWords) {
    let rawCards = [];
    roundWords.forEach(w => {
        if (_config.mode === 'reading_meaning') {
            rawCards.push({ id: w.word, text: w.word, furi: w.furi, type: 'kanji_furi' });
            rawCards.push({ id: w.word, text: w.trans, type: 'target' });
        } else {
            rawCards.push({ id: w.word, text: w.word, type: 'kanji' });
            const targetText = _config.mode === 'meaning' ? w.trans : w.furi;
            rawCards.push({ id: w.word, text: targetText, type: 'target' });
        }
    });

    _cards = _shuffle(rawCards).map((c, index) => ({
        ...c,
        instanceId: `card_${index}`,
        isFlipped: false,
        isMatched: false,
        seen: false
    }));
}

function _renderBoard() {
    const icon = getEquippedIcon();
    const state = getState();
    const pairCount = _cards.length / 2;

    const html = `
        <div class="mem-board-header">
            <div>
                <span class="mem-stat-label">Coins</span>
                <span class="mem-stat-val" id="mem-hud-coins">🪙 ${state.coins.toLocaleString()}</span>
            </div>
            <div>
                <span class="mem-stat-label">Pairs</span>
                <span class="mem-stat-val" id="mem-hud-pairs">0/${pairCount}</span>
            </div>
            <div>
                <span class="mem-stat-label">Combo</span>
                <span class="mem-stat-val mem-combo-text" id="mem-hud-combo">0x</span>
            </div>
            <div class="mem-hud-btns">
                <button class="mem-peek-btn" id="mem-btn-peek" title="Reveal all cards briefly">👁 ${PEEK_COST}</button>
                <button class="caro-back-btn mem-quit-btn" id="mem-btn-quit">Quit</button>
            </div>
        </div>

        <div class="mem-grid mem-grid-${_config.layout}" id="mem-grid">
            ${_cards.map(c => {
                let contentHtml = '';
                if (c.type === 'kanji_furi' && c.furi && c.furi !== c.text) {
                    contentHtml = `<span class="mem-text-large"><ruby>${_esc(c.text)}<rt>${_esc(c.furi)}</rt></ruby></span>`;
                } else if (c.type === 'kanji' || c.type === 'kanji_furi') {
                    contentHtml = `<span class="mem-text-large">${_esc(c.text)}</span>`;
                } else {
                    contentHtml = `<span class="mem-text-small">${_esc(c.text)}</span>`;
                }
                return `
                <div class="mem-card" data-instance="${c.instanceId}">
                    <div class="mem-card-inner">
                        <div class="mem-face mem-face-down">${icon}</div>
                        <div class="mem-face mem-face-up">${contentHtml}</div>
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;

    _container.innerHTML = html;

    _container.querySelector('#mem-btn-quit').addEventListener('click', _handleQuit);
    _container.querySelector('#mem-btn-peek').addEventListener('click', _handlePeek);
    _updatePeekBtn();

    _container.querySelectorAll('.mem-card').forEach(el => {
        el.addEventListener('click', () => _handleCardClick(el));
    });
}

// ─── INTERACTION ─────────────────────────────────────────────────────────────

function _handleCardClick(cardEl) {
    if (_isLocked || _isPeeking) return;

    const instanceId = cardEl.getAttribute('data-instance');
    const cardData = _cards.find(c => c.instanceId === instanceId);
    if (!cardData || cardData.isFlipped || cardData.isMatched) return;

    cardData.isFlipped = true;
    cardData.seen = true;
    cardEl.classList.add('flipped');
    _flipped.push({ el: cardEl, data: cardData });

    if (_flipped.length === 2) {
        _isLocked = true;
        _checkMatch();
    }
}

function _checkMatch() {
    const [c1, c2] = _flipped;

    if (c1.data.id === c2.data.id) {
        c1.data.isMatched = true;
        c2.data.isMatched = true;
        _matchedPairs++;
        _combo++;
        if (_combo > _bestCombo) _bestCombo = _combo;

        const perf = _perf.get(c1.data.id);
        if (perf) perf.matched = true;

        const reward = 10 + (_combo * 5);
        _sessionCoins += reward;
        addCoins(reward);
        _updateCoinsHud();

        const comboEl = _container.querySelector('#mem-hud-combo');
        if (comboEl) {
            comboEl.textContent = `${_combo}x`;
            comboEl.classList.add('pop');
            setTimeout(() => comboEl.classList.remove('pop'), 300);
        }
        const pairsEl = _container.querySelector('#mem-hud-pairs');
        if (pairsEl) pairsEl.textContent = `${_matchedPairs}/${_cards.length / 2}`;

        c1.el.classList.add('matched');
        c2.el.classList.add('matched');
        _spawnFloatingText(c2.el, `+${reward} 🪙`);

        _flipped = [];
        _isLocked = false;

        if (_matchedPairs === _cards.length / 2) {
            setTimeout(_finishRound, 650);
        }
    } else {
        _combo = 0;
        const comboEl = _container.querySelector('#mem-hud-combo');
        if (comboEl) comboEl.textContent = '0x';

        // A true memory miss: the player had already seen the partner card
        // of this word, and still failed to pair it.
        [c1, c2].forEach(fc => {
            const partner = _cards.find(c => c.id === fc.data.id && c.instanceId !== fc.data.instanceId);
            if (partner && partner.seen && !partner.isMatched) {
                const perf = _perf.get(fc.data.id);
                if (perf) perf.failures++;
            }
        });

        setTimeout(() => {
            c1.data.isFlipped = false;
            c2.data.isFlipped = false;
            c1.el.classList.remove('flipped');
            c2.el.classList.remove('flipped');
            _flipped = [];
            _isLocked = false;
        }, 900);
    }
}

// ─── PEEK POWER-UP ───────────────────────────────────────────────────────────

function _handlePeek() {
    if (_isLocked || _isPeeking || _flipped.length > 0) return;
    if (!spendCoins(PEEK_COST)) {
        _toast('Not enough coins!');
        return;
    }
    _peekUsed = true;
    _isPeeking = true;
    _updateCoinsHud();

    const hidden = [..._container.querySelectorAll('.mem-card')]
        .filter(el => !el.classList.contains('flipped') && !el.classList.contains('matched'));
    hidden.forEach(el => el.classList.add('peeking'));
    // Peeking reveals the answers — all unmatched cards now count as seen.
    _cards.forEach(c => { if (!c.isMatched) c.seen = true; });

    setTimeout(() => {
        hidden.forEach(el => el.classList.remove('peeking'));
        _isPeeking = false;
    }, 1600);
}

function _updateCoinsHud() {
    const coinsEl = _container.querySelector('#mem-hud-coins');
    if (coinsEl) coinsEl.textContent = `🪙 ${getState().coins.toLocaleString()}`;
    _updatePeekBtn();
}

function _updatePeekBtn() {
    const btn = _container.querySelector('#mem-btn-peek');
    if (btn) btn.disabled = getState().coins < PEEK_COST;
}

// ─── FX ──────────────────────────────────────────────────────────────────────

function _spawnFloatingText(anchorEl, text) {
    const rect = anchorEl.getBoundingClientRect();
    const fx = document.createElement('div');
    fx.className = 'mem-float-text';
    fx.textContent = text;
    fx.style.left = `${rect.left + rect.width / 2}px`;
    fx.style.top = `${rect.top}px`;
    document.body.appendChild(fx);
    setTimeout(() => fx.remove(), 1000);
}

function _toast(msg) {
    const t = document.createElement('div');
    t.className = 'mem-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1600);
}

// ─── ROUND END ───────────────────────────────────────────────────────────────

function _handleQuit() {
    if (!_roundGraded && _mgr) {
        const anySignal = [..._perf.values()].some(p => p.matched || p.failures > 0);
        // Mid-round quit: in Global SRS mode grades are live writes worth
        // keeping. In Local mode a partial round isn't exported — the manager
        // (and its local state) is simply discarded.
        if (anySignal && _mgr.isGlobalSrs) {
            gradeRoundResults(_mgr, _perf, { export: false });
        }
        _roundGraded = true;
    }
    _mgr = null;
    _onQuit();
}

function _formatDuration(ms) {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

function _finishRound() {
    const durationMs = Date.now() - _startTime;
    const totalFailures = [..._perf.values()].reduce((sum, p) => sum + p.failures, 0);
    const perfect = totalFailures === 0 && !_peekUsed;
    const pairCount = _cards.length / 2;

    let bonus = 25;               // completion bonus
    if (perfect) bonus += 50;     // flawless memory bonus
    _sessionCoins += bonus;
    addCoins(bonus);

    recordRoundStats({ bestCombo: _bestCombo, perfect, pairs: pairCount });

    // SRS grading via GameVocabManager: matched cleanly → correct,
    // repeatedly missed → wrong. Also exports new custom-deck words ('skip').
    const graded = _mgr
        ? gradeRoundResults(_mgr, _perf, { export: true })
        : { results: [], exported: { added: 0, skipped: 0 }, isGlobalSrs: false };
    _roundGraded = true;

    _showSummary({ durationMs, perfect, bonus, graded });
}

function _showSummary({ durationMs, perfect, bonus, graded }) {
    const overlay = document.createElement('div');
    overlay.className = 'mem-summary-overlay';

    const srsLine = graded.isGlobalSrs
        ? '🌍 Results were graded against your live SRS reviews.'
        : (graded.exported.added > 0
            ? `📚 ${graded.exported.added} new word${graded.exported.added !== 1 ? 's' : ''} added to your SRS library.`
            : '📚 Words graded locally (already in your SRS library).');

    const rows = graded.results.map(r => {
        const badge = GRADE_BADGES[r.grade] || GRADE_BADGES[0];
        const kana = r.wordObj.kana && r.wordObj.kana !== r.wordObj.kanji
            ? `<span class="mem-summary-kana">${_esc(r.wordObj.kana)}</span>` : '';
        return `
            <div class="mem-summary-row">
                <div class="mem-summary-word">
                    <span class="mem-summary-kanji">${_esc(r.wordObj.kanji)}</span>
                    ${kana}
                    <span class="mem-summary-eng">${_esc(r.wordObj.eng)}</span>
                </div>
                <span class="mem-grade-badge ${badge.cls}">${badge.label}${r.isUnscheduled && r.isCorrect ? ' ·🌈' : ''}</span>
            </div>`;
    }).join('');

    overlay.innerHTML = `
        <div class="mem-summary-box">
            <div class="mem-summary-head">
                <h2>${perfect ? '🏆 Perfect Round!' : '🎉 Round Complete!'}</h2>
                <div class="mem-summary-coins" id="mem-summary-coins">+${_sessionCoins.toLocaleString()} 🪙</div>
                <div class="mem-summary-substats">
                    ⏱ ${_formatDuration(durationMs)} · 🔥 Best combo ${_bestCombo}x · 🎁 Bonus +${bonus}
                </div>
                <div class="mem-summary-srsline">${srsLine}</div>
            </div>
            <div class="mem-summary-list">
                ${rows || '<div class="mem-summary-empty">No words graded this round.</div>'}
            </div>
            <div class="mem-summary-actions">
                <button class="primary-btn mem-touch-btn" id="mem-btn-bonus">⭐ Bonus Quiz</button>
                <button class="primary-btn mem-touch-btn mem-btn-secondary" id="mem-btn-replay">🔁 Again</button>
                <button class="primary-btn mem-touch-btn mem-btn-secondary" id="mem-btn-finish">Return</button>
            </div>
        </div>
    `;

    _container.appendChild(overlay);

    const bonusBtn = overlay.querySelector('#mem-btn-bonus');
    if (!_mgr) bonusBtn.style.display = 'none';
    bonusBtn.addEventListener('click', () => {
        if (!_mgr) return;
        bonusBtn.disabled = true;
        bonusBtn.textContent = '⭐ ...';
        runBonusQuiz(_mgr, _container, {
            onCoins: (c) => { _sessionCoins += c; addCoins(c); },
            onDone: (successes, failures) => {
                bonusBtn.textContent = `⭐ ${successes}/${successes + failures} correct`;
                const coinsEl = overlay.querySelector('#mem-summary-coins');
                if (coinsEl) coinsEl.textContent = `+${_sessionCoins.toLocaleString()} 🪙`;
            }
        });
    });

    overlay.querySelector('#mem-btn-replay').addEventListener('click', () => {
        _mgr = null;
        startBoard(_container, _allWords, _config, _onQuit, true);
    });

    overlay.querySelector('#mem-btn-finish').addEventListener('click', () => {
        _mgr = null;
        _onQuit();
    });
}
