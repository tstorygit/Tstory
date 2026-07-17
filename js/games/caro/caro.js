// js/games/caro/caro.js — Caro vocab-recall game
// export { init, launch }
//
// Flow: setup (vocab selector) → card loop (reveal reading/meaning, self-rate
// via buttons, keyboard, or swipe gestures) → results (summary, optional
// one-tap SRS commit via srsDb.gradeWordInGame, manual per-word status edit).

import * as srsDb from '../../srs_db.js';
import { mountVocabSelector, getBannedWords, setBannedWords } from '../../vocab_selector.js';
import { speakText, stopSpeech } from '../../tts_api.js';

let _screens  = null;
let _onExit   = null;
let _selector = null;
let _state    = _freshState([]);

// Document-level listeners currently attached by the card screen.
// Tracked at module level so they can always be removed exactly once.
let _docClickHandler = null;

const BANNED_KEY = 'caro_banned_words';

export function init(screens, onExit) { _screens = screens; _onExit = onExit; _injectStyles(); }
export function launch() { _show('setup'); _renderSetup(); }

function _freshState(queue) {
    return {
        activeQueue:  queue,
        currentIndex: 0,
        score:        0,
        history:      [],      // [{...word, pts}]
        streak:       0,       // consecutive Perfect ratings
        bestStreak:   0,
        startTime:    Date.now(),
        endTime:      0,
        applied:      false,   // ratings committed to SRS on results screen
        locked:       false,   // input lock during card fly-out animation
    };
}

const _titles = { setup: 'Caro — Setup', game: 'Caro — Recall', stats: 'Caro — Results' };
function _show(name) {
    Object.entries(_screens).forEach(([k,el]) => {
        if (!el) return;
        if (k !== name) { el.style.display = 'none'; return; }
        el.style.display = k === 'game' ? 'flex' : 'block';
    });
    const hdr = document.getElementById('games-header-title');
    if (hdr) hdr.textContent = _titles[name] || 'Caro';
}

function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function _shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Remove any document-level listeners owned by the card screen.
function _cleanupCardListeners() {
    const el = _screens?.game;
    if (el && el._keyHandler) { document.removeEventListener('keydown', el._keyHandler); el._keyHandler = null; }
    if (_docClickHandler) { document.removeEventListener('click', _docClickHandler); _docClickHandler = null; }
}

// ── Setup ──────────────────────────────────────────────────────────────────

function _renderSetup() {
    const el = _screens.setup;
    if (!el) return;

    _selector = mountVocabSelector(el, {
        bannedKey:    BANNED_KEY,
        defaultCount: 20,
    });

    const actions = _selector.getActionsEl();

    const startBtn = document.createElement('button');
    startBtn.className   = 'primary-btn';
    startBtn.style.marginTop = '8px';
    startBtn.textContent = '▶ Start Game';
    startBtn.addEventListener('click', _start);

    const backBtn = document.createElement('button');
    backBtn.className   = 'caro-back-btn';
    backBtn.textContent = '← Back to Games';
    backBtn.addEventListener('click', _onExit);

    actions.append(startBtn, backBtn);
}

async function _start() {
    // getQueue() handles validation and shows warnings inside the setup screen
    const fullQueue = await _selector.getQueue();
    if (!fullQueue.length) return;
    _startWith(fullQueue);
}

function _startWith(queue) {
    _state = _freshState(queue.slice());
    _show('game');
    _renderCard();
}

// ── Game Card ─────────────────────────────────────────────────────────────

function _renderCard() {
    const el = _screens.game; if (!el) return;
    _cleanupCardListeners();

    const { activeQueue, currentIndex, score, streak } = _state;
    const word  = activeQueue[currentIndex];
    const total = activeQueue.length;
    const pct   = Math.round(currentIndex / total * 100);

    el.style.display = 'flex';
    el.innerHTML = `
        <div class="caro-progress-bar-wrap">
            <div class="caro-progress-meta">
                <span>Word ${currentIndex+1} / ${total}</span>
                <span class="caro-streak">${streak >= 2 ? `🔥 ${streak}` : ''}</span>
                <span>Score: ${_fmt(score)}</span>
            </div>
            <div class="caro-progress-track">
                <div class="caro-progress-fill" style="width:${pct}%;"></div>
            </div>
        </div>

        <div class="caro-card caro-enter" id="caro-card">
            <div class="caro-swipe-label" id="caro-swipe-label"></div>
            <button id="caro-btn-tts" class="caro-tts-btn" title="Play pronunciation (S)">🔊</button>
            <button id="caro-btn-ban" class="caro-ban-btn" title="Ban this word (never show again)">🚫</button>

            <!-- Reading spoiler badge at top -->
            <div class="caro-furi-spoiler" id="caro-furi-spoiler" title="Reveal reading (Ctrl)">
                <svg id="caro-furi-eye-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <span id="caro-furi-label">Reading</span>
                <span id="caro-furi-value" class="caro-furi-hidden">${_esc(word.furi) || '—'}</span>
            </div>

            <!-- Main word (tap to reveal meaning) -->
            <div class="caro-card-word">${_esc(word.word)}</div>

            <!-- Meaning reveal -->
            <button class="caro-reveal-meaning-btn" id="caro-btn-meaning">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Meaning
                <span class="caro-kbd-hint">Space</span>
            </button>
            <div id="caro-meaning-box" class="caro-meaning-revealed" style="display:none;">
                <span class="caro-field-value">${_esc(word.trans) || '—'}</span>
            </div>

            <!-- Score row (shown after meaning revealed) -->
            <div id="caro-score-row" class="caro-score-row" style="display:none;">
                <div class="caro-score-label">How well did you know it?</div>
                <div class="caro-score-btns">
                    <button class="caro-score-btn caro-score-miss"    data-pts="0">
                        <span class="caro-score-icon">🔴</span> Miss
                        <span class="caro-kbd-hint">1 / ←</span>
                    </button>
                    <button class="caro-score-btn caro-score-partial" data-pts="0.5">
                        <span class="caro-score-icon">🟡</span> Partial
                        <span class="caro-kbd-hint">2 / ↓</span>
                    </button>
                    <button class="caro-score-btn caro-score-perfect" data-pts="1">
                        <span class="caro-score-icon">🟢</span> Perfect
                        <span class="caro-kbd-hint">3 / →</span>
                    </button>
                </div>
                <div class="caro-swipe-tip">…or swipe the card: ← Miss · ↑↓ Partial · → Perfect</div>
            </div>
        </div>

        <div class="caro-bottom-row">
            <button class="caro-back-btn" id="caro-btn-quit">✕ Quit</button>
            ${_state.history.length ? `<button class="caro-undo-btn" id="caro-btn-undo" title="Undo last rating (Z)">↩ Undo</button>` : ''}
            <div class="caro-info-wrap">
                <button class="caro-info-btn" id="caro-info-btn" aria-label="Keyboard shortcuts">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </button>
                <div class="caro-info-tooltip" id="caro-info-tooltip" style="display:none;">
                    <div class="caro-info-row"><kbd>Ctrl</kbd> Reveal reading</div>
                    <div class="caro-info-row"><kbd>Space</kbd> Reveal meaning</div>
                    <div class="caro-info-row"><kbd>S</kbd> Play audio</div>
                    <div class="caro-info-row"><kbd>1</kbd> / <kbd>←</kbd> Miss</div>
                    <div class="caro-info-row"><kbd>2</kbd> / <kbd>↓</kbd> <kbd>↑</kbd> Partial</div>
                    <div class="caro-info-row"><kbd>3</kbd> / <kbd>→</kbd> Perfect</div>
                    <div class="caro-info-row"><kbd>Z</kbd> Undo last rating</div>
                    <div class="caro-info-row" style="border-top:1px solid var(--border-color);margin-top:4px;padding-top:6px;">Swipe card to rate (touch)</div>
                </div>
            </div>
        </div>`;

    const card       = el.querySelector('#caro-card');
    const swipeLabel = el.querySelector('#caro-swipe-label');

    // TTS pronunciation — graceful no-op without an API key (tts_api handles
    // its own errors and fires the end callback; the catch below covers the
    // one path it doesn't — a rejected cache read outside its try block).
    const ttsBtn = el.querySelector('#caro-btn-tts');
    ttsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        ttsBtn.classList.add('caro-tts-playing');
        const done = () => ttsBtn.classList.remove('caro-tts-playing');
        try {
            const p = speakText(word.word, null, done);
            if (p && typeof p.catch === 'function') p.catch(done);
        } catch { done(); }
    });

    // Undo last rating (only rendered when there is something to undo)
    const undoBtn = el.querySelector('#caro-btn-undo');
    if (undoBtn) undoBtn.addEventListener('click', _undoLast);

    // Ban button
    el.querySelector('#caro-btn-ban').addEventListener('click', () => {
        if (_state.locked) return;
        if (!confirm("Ban this word? It won't appear in Caro again.")) return;
        const wordObj = _state.activeQueue[_state.currentIndex];
        const banned  = getBannedWords(BANNED_KEY);
        if (!banned.includes(wordObj.word)) {
            setBannedWords(BANNED_KEY, [...banned, wordObj.word]);
        }
        _state.activeQueue.splice(_state.currentIndex, 1);
        stopSpeech();
        if (_state.currentIndex >= _state.activeQueue.length) {
            _cleanupCardListeners();
            _show('stats'); _renderStats();
            return;
        }
        _renderCard();
    });

    // Reading spoiler toggle
    const spoiler = el.querySelector('#caro-furi-spoiler');
    const furiVal = el.querySelector('#caro-furi-value');
    const eyeIcon = el.querySelector('#caro-furi-eye-icon');
    let furiRevealed = false;
    spoiler.addEventListener('click', () => {
        furiRevealed = !furiRevealed;
        furiVal.classList.toggle('caro-furi-hidden', !furiRevealed);
        spoiler.classList.toggle('caro-furi-revealed', furiRevealed);
        eyeIcon.style.opacity = furiRevealed ? '0.4' : '1';
    });

    // Meaning reveal
    const meaningBtn = el.querySelector('#caro-btn-meaning');
    const meaningBox = el.querySelector('#caro-meaning-box');
    const scoreRow   = el.querySelector('#caro-score-row');
    let meaningShown = false;
    function revealMeaning() {
        if (meaningShown) return;
        meaningShown = true;
        meaningBox.style.display = 'flex';
        meaningBtn.style.display = 'none';
        scoreRow.style.display = 'block';
    }
    meaningBtn.addEventListener('click', revealMeaning);

    // Score buttons
    const btnDirs = { '0': 'left', '0.5': 'down', '1': 'right' };
    el.querySelectorAll('.caro-score-btn').forEach(b => b.addEventListener('click', () => {
        _score(+b.dataset.pts, btnDirs[b.dataset.pts]);
    }));

    // ── Swipe gestures ─────────────────────────────────────────────────────
    // left = Miss, right = Perfect, up/down = Partial. Rating swipes only work
    // after the meaning is revealed; before that, a strong swipe reveals it.
    const SWIPE_TH = 80;
    let drag = null;

    function updateSwipeLabel(dx, dy) {
        const ax = Math.abs(dx), ay = Math.abs(dy);
        const dist = Math.max(ax, ay);
        if (dist < 24) { swipeLabel.style.opacity = '0'; return; }
        let txt, cls;
        if (!meaningShown)   { txt = '👁 Reveal first'; cls = 'caro-swipe-neutral'; }
        else if (ax >= ay)   { txt = dx > 0 ? '🟢 Perfect' : '🔴 Miss'; cls = dx > 0 ? 'caro-swipe-perfect' : 'caro-swipe-miss'; }
        else                 { txt = '🟡 Partial'; cls = 'caro-swipe-partial'; }
        swipeLabel.textContent = txt;
        swipeLabel.className   = 'caro-swipe-label ' + cls;
        swipeLabel.style.opacity = String(Math.min(1, (dist - 24) / 60));
    }

    card.addEventListener('pointerdown', (e) => {
        if (_state.locked || drag) return;
        if (e.target.closest('button') || e.target.closest('.caro-furi-spoiler')) return;
        drag = { x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, id: e.pointerId, startTarget: e.target };
        card.classList.remove('caro-snap', 'caro-enter');
        try { card.setPointerCapture(e.pointerId); } catch {}
    });

    card.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag.dx = e.clientX - drag.x0;
        drag.dy = e.clientY - drag.y0;
        card.style.transform = `translate(${drag.dx}px, ${drag.dy}px) rotate(${(drag.dx * 0.04).toFixed(2)}deg)`;
        updateSwipeLabel(drag.dx, drag.dy);
    });

    function snapBack() {
        swipeLabel.style.opacity = '0';
        card.classList.add('caro-snap');
        card.style.transform = '';
        setTimeout(() => card.classList.remove('caro-snap'), 200);
    }

    card.addEventListener('pointerup', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag; drag = null;
        const ax = Math.abs(d.dx), ay = Math.abs(d.dy);

        // Tap (no real movement): tapping the word reveals the meaning.
        if (ax < 8 && ay < 8) {
            swipeLabel.style.opacity = '0';
            card.style.transform = '';
            if (d.startTarget && d.startTarget.closest('.caro-card-word')) revealMeaning();
            return;
        }
        if (Math.max(ax, ay) < SWIPE_TH || !meaningShown) {
            if (Math.max(ax, ay) >= SWIPE_TH && !meaningShown) revealMeaning();
            snapBack();
            return;
        }
        swipeLabel.style.opacity = '0';
        if (ax >= ay) _score(d.dx > 0 ? 1 : 0, d.dx > 0 ? 'right' : 'left');
        else          _score(0.5, d.dy > 0 ? 'down' : 'up');
    });

    card.addEventListener('pointercancel', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
        snapBack();
    });

    // Quit / end early
    el.querySelector('#caro-btn-quit').addEventListener('click', () => {
        if (_state.history.length > 0) {
            if (!confirm('End the session now? You\'ll see results for the words you already rated.')) return;
            stopSpeech();
            _cleanupCardListeners();
            _show('stats'); _renderStats();
        } else {
            if (!confirm('Quit? Progress will be lost.')) return;
            stopSpeech();
            _cleanupCardListeners();
            _onExit();
        }
    });

    // Info tooltip toggle (document-level closer is tracked and cleaned up)
    const infoBtn     = el.querySelector('#caro-info-btn');
    const infoTooltip = el.querySelector('#caro-info-tooltip');
    infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const visible = infoTooltip.style.display !== 'none';
        infoTooltip.style.display = visible ? 'none' : 'block';
    });
    _docClickHandler = () => { infoTooltip.style.display = 'none'; };
    document.addEventListener('click', _docClickHandler);

    // Keyboard handler
    el._keyHandler = (e) => {
        if (!_screens.game || _screens.game.style.display === 'none') return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.repeat) return;   // holding a rating key must not blast through cards
        if (_state.locked) return;
        if (e.code === 'Space') { e.preventDefault(); revealMeaning(); }
        if (e.code === 'ControlLeft' || e.code === 'ControlRight') { e.preventDefault(); spoiler.click(); }
        if (e.code === 'KeyS')       { e.preventDefault(); ttsBtn.click(); }
        if (e.code === 'KeyZ' || e.code === 'Backspace') { e.preventDefault(); _undoLast(); }
        if (e.code === 'ArrowLeft'  || e.code === 'Digit1' || e.code === 'Numpad1') { e.preventDefault(); revealMeaning(); _score(0,   'left');  }
        if (e.code === 'ArrowDown'  || e.code === 'Digit2' || e.code === 'Numpad2') { e.preventDefault(); revealMeaning(); _score(0.5, 'down');  }
        if (e.code === 'ArrowUp')    { e.preventDefault(); revealMeaning(); _score(0.5, 'up');    }
        if (e.code === 'ArrowRight' || e.code === 'Digit3' || e.code === 'Numpad3') { e.preventDefault(); revealMeaning(); _score(1,   'right'); }
    };
    document.addEventListener('keydown', el._keyHandler);
}

function _score(pts, dir) {
    if (_state.locked) return;
    _state.locked = true;
    stopSpeech();
    _cleanupCardListeners();

    const word = _state.activeQueue[_state.currentIndex];
    _state.score += pts;
    // _prevStreak/_prevBest snapshot pre-rating values so _undoLast can restore them.
    _state.history.push({ ...word, pts, _prevStreak: _state.streak, _prevBest: _state.bestStreak });
    if (pts === 1) {
        _state.streak++;
        _state.bestStreak = Math.max(_state.bestStreak, _state.streak);
    } else {
        _state.streak = 0;
    }
    _state.currentIndex++;

    const advance = () => {
        _state.locked = false;
        if (_state.currentIndex >= _state.activeQueue.length) { _show('stats'); _renderStats(); }
        else _renderCard();
    };

    // Animated fly-out in the rating direction, then advance.
    const card = _screens.game ? _screens.game.querySelector('#caro-card') : null;
    if (card && dir) {
        const t = {
            left:  'translate(-120%, -30px) rotate(-14deg)',
            right: 'translate(120%, -30px) rotate(14deg)',
            down:  'translate(0, 70%)',
            up:    'translate(0, -70%)',
        }[dir];
        card.classList.remove('caro-snap', 'caro-enter');
        card.classList.add('caro-fly');
        card.style.transform = t;
        setTimeout(advance, 230);
    } else {
        advance();
    }
}

// Undo the most recent rating and return to that card. Works from the card
// screen (Z / Backspace / ↩ Undo) and from the results screen — but never
// after ratings were committed to SRS. Ban only ever removes the *current*
// unrated card, so activeQueue[currentIndex - 1] is always the word that was
// rated last, even after bans or an early quit.
function _undoLast() {
    if (_state.locked || _state.applied) return;
    if (!_state.history.length || _state.currentIndex <= 0) return;
    const last = _state.history.pop();
    _state.score       = Math.max(0, _state.score - last.pts);
    _state.streak      = last._prevStreak ?? 0;
    _state.bestStreak  = last._prevBest   ?? 0;
    _state.currentIndex--;
    _state.endTime     = 0;   // re-finishing recomputes the session duration
    stopSpeech();
    _cleanupCardListeners();
    _show('game');
    _renderCard();
}

// ── Stats ──────────────────────────────────────────────────────────────────

function _fmtDue(ms) {
    if (ms <= 0) return 'due now';
    const m = Math.round(ms / 60000);
    if (m < 60)  return `in ${m} min`;
    const h = Math.round(m / 60);
    if (h < 48)  return `in ${h} h`;
    return `in ${Math.round(h / 24)} d`;
}

function _dueSoonestHtml(history) {
    const now  = Date.now();
    const seen = new Set();
    const rows = [];
    for (const w of history) {
        if (seen.has(w.word)) continue;
        seen.add(w.word);
        const entry = srsDb.getWord(w.word);
        if (!entry || !entry.dueDate) continue;
        rows.push({ word: w.word, furi: w.furi, t: new Date(entry.dueDate).getTime() });
    }
    if (!rows.length) return '';
    rows.sort((a, b) => a.t - b.t);
    return `
        <div class="caro-stats-section-title" style="margin-top:20px;">⏳ Coming up soonest</div>
        <div class="caro-due-list">${rows.slice(0, 5).map(r => `
            <div class="caro-due-row">
                <span class="caro-due-word">${_esc(r.word)}${r.furi ? `<span class="caro-due-furi">${_esc(r.furi)}</span>` : ''}</span>
                <span class="caro-due-when">${_fmtDue(r.t - now)}</span>
            </div>`).join('')}
        </div>`;
}

function _renderStats() {
    const el = _screens.stats; if (!el) return;
    if (!_state.endTime) _state.endTime = Date.now();

    const { score, history, bestStreak, applied } = _state;
    const total = history.length, pct = total ? Math.round(score / total * 100) : 0;
    const col = pct >= 80 ? '#06d6a0' : pct >= 50 ? '#ffb703' : '#ff4b4b';

    const missed  = history.filter(w => w.pts === 0);
    const partial = history.filter(w => w.pts === 0.5);
    const perfect = history.filter(w => w.pts === 1);
    const retryCount = missed.length + partial.length;

    const durSec = Math.max(0, Math.round((_state.endTime - _state.startTime) / 1000));
    const durStr = `${Math.floor(durSec / 60)}m ${durSec % 60}s`;

    let uid = 0;
    function buildGroup(title, words, icon) {
        if (!words.length) return '';
        return `
            <div class="caro-stats-section-title" style="margin-top:20px;">${icon} ${title} (${words.length})</div>
            <div>${words.map(w => {
                const i = uid++;
                const cur = srsDb.getWord(w.word)?.status ?? null;
                return `<div class="caro-result-row" data-idx="${i}">
                    <div class="caro-result-word-col">
                        <span class="caro-result-word">${_esc(w.word)}</span>
                        <span class="caro-result-furi">${_esc(w.furi) || ''}</span>
                        <span class="caro-result-trans">${_esc(w.trans) || ''}</span>
                    </div>
                    <div class="caro-result-right">
                        <div class="caro-result-srs">
                            ${[0,1,2,3,4,5].map(s => `<button class="caro-srs-btn status-btn"
                                data-word="${encodeURIComponent(w.word)}"
                                data-furi="${encodeURIComponent(w.furi || '')}"
                                data-trans="${encodeURIComponent(w.trans || '')}"
                                data-status="${s}"
                                style="${cur === s ? 'border:3px solid var(--text-main);' : 'border:none;'}">${s}</button>`).join('')}
                        </div>
                        <div id="caro-saved-${i}" style="display:none;font-size:11px;color:#1a7a4a;margin-top:3px;text-align:right;">✓ Saved</div>
                    </div>
                </div>`;
            }).join('')}</div>
        `;
    }

    const listsHtml = buildGroup('Missed', missed, '🔴') +
                      buildGroup('Partial', partial, '🟡') +
                      buildGroup('Perfect', perfect, '🟢');

    el.innerHTML = `
        <div class="caro-stats-panel">
            <div class="caro-stats-score-block">
                <div class="caro-stats-score-number" style="color:${col}">${_fmt(score)}<span style="font-size:24px;color:var(--text-muted);"> / ${total}</span></div>
                <div style="font-size:16px;color:var(--text-muted);margin-top:4px;">${pct}% correct</div>
                <div style="margin-top:12px;display:flex;gap:16px;justify-content:center;font-size:13px;color:var(--text-muted);">
                    <span>✅ Perfect: ${perfect.length}</span>
                    <span>⚠️ Partial: ${partial.length}</span>
                    <span>🔴 Missed: ${missed.length}</span>
                </div>
                ${total ? `<div class="caro-stats-substats">
                    <span>🔥 Best streak: ${bestStreak}</span>
                    <span>⏱ ${durStr}</span>
                </div>` : ''}
            </div>
            ${total ? `
            <div class="caro-apply-wrap">
                <button class="primary-btn caro-apply-btn" id="caro-btn-apply" style="width:100%;" ${applied ? 'disabled' : ''}>
                    ${applied ? '✓ Ratings applied to SRS' : '📥 Apply ratings to SRS'}
                </button>
                <div class="caro-apply-note">
                    ${applied
                        ? 'Reviews recorded. Words you already knew ahead of schedule keep their interval.'
                        : 'Grades one review per word (Perfect → Easy, Partial → Hard, Miss → Again). New words are added to your library. You can also set statuses manually below.'}
                </div>
            </div>` : ''}
            ${_dueSoonestHtml(history)}
            ${total ? `<p style="font-size:13px;color:var(--text-muted);margin:16px 0 12px;text-align:center;">Review & Update SRS Status</p>` : ''}
            ${listsHtml}
            ${total && !applied ? `<button class="caro-back-btn" id="caro-btn-undo-last" style="margin-top:14px;" title="Return to the last card and re-rate it">↩ Undo last rating & continue</button>` : ''}
            <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;">
                ${retryCount ? `<button class="primary-btn" id="caro-btn-retry" style="flex:1 1 100%;">🔁 Retry Missed & Partial (${retryCount})</button>` : ''}
                <button class="primary-btn" id="caro-btn-again" style="flex:1;">▶ Play Again</button>
                <button class="primary-btn" id="caro-btn-done" style="flex:1;background:var(--bg-color);color:var(--text-main);border:1px solid var(--border-color);">← Games</button>
            </div>
        </div>`;

    // One-tap SRS commit. Uses the documented game-grading API, which has the
    // safety valve: a correct answer on a not-yet-due word does NOT touch its
    // interval, so ratings can never inflate the player's real schedule.
    const applyBtn = el.querySelector('#caro-btn-apply');
    if (applyBtn) applyBtn.addEventListener('click', () => {
        if (_state.applied) return;
        _state.applied = true;
        const gradeMap = { '0': 0, '0.5': 1, '1': 3 };
        _state.history.forEach(h => {
            srsDb.gradeWordInGame(
                { word: h.word, furi: h.furi || '', translation: h.trans || '' },
                gradeMap[String(h.pts)] ?? 0,
                true
            );
        });
        _renderStats(); // refresh statuses + due list, button becomes disabled
    });

    // Manual per-word status buttons (unchanged semantics: explicit user action)
    el.querySelectorAll('.caro-srs-btn').forEach(btn => btn.addEventListener('click', () => {
        const word  = decodeURIComponent(btn.dataset.word),
              furi  = decodeURIComponent(btn.dataset.furi),
              trans = decodeURIComponent(btn.dataset.trans),
              status = +btn.dataset.status;
        srsDb.saveWord({ word, furi, translation: trans, status });
        btn.closest('.caro-result-srs').querySelectorAll('.caro-srs-btn').forEach(b => {
            b.style.border = +b.dataset.status === status ? '3px solid var(--text-main)' : 'none';
        });
        const msg = el.querySelector(`#caro-saved-${btn.closest('.caro-result-row').dataset.idx}`);
        if (msg) { msg.style.display = 'block'; setTimeout(() => msg.style.display = 'none', 2000); }
    }));

    const undoLastBtn = el.querySelector('#caro-btn-undo-last');
    if (undoLastBtn) undoLastBtn.addEventListener('click', _undoLast);

    const retryBtn = el.querySelector('#caro-btn-retry');
    if (retryBtn) retryBtn.addEventListener('click', () => {
        // Strip rating bookkeeping so retry words start as clean queue entries.
        const retryWords = _shuffle([...missed, ...partial].map(({ pts, _prevStreak, _prevBest, ...w }) => w));
        _startWith(retryWords);
    });

    el.querySelector('#caro-btn-again').addEventListener('click', () => { _show('setup'); _renderSetup(); });
    el.querySelector('#caro-btn-done').addEventListener('click', _onExit);
}

function _fmt(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }

// ── Injected styles (game-specific; shared caro- card styles live in styles.css) ──

function _injectStyles() {
    if (document.getElementById('caro-ext-styles')) return;
    const st = document.createElement('style');
    st.id = 'caro-ext-styles';
    st.textContent = `
        /* Swipe support */
        .caro-card { touch-action:none; user-select:none; -webkit-user-select:none; }
        .caro-card.caro-snap { transition:transform .18s ease; }
        .caro-card.caro-fly  { transition:transform .23s ease-in, opacity .23s ease-in; opacity:0; pointer-events:none; }
        .caro-card.caro-enter { animation:caroCardIn .22s ease; }
        @keyframes caroCardIn { from { opacity:0; transform:translateY(14px) scale(0.98); } to { opacity:1; transform:none; } }

        .caro-swipe-label {
            position:absolute; top:50%; left:50%;
            transform:translate(-50%,-50%) rotate(-8deg);
            font-size:28px; font-weight:800; padding:6px 18px;
            border-radius:12px; border:3px solid currentColor;
            background:var(--surface-color);
            opacity:0; pointer-events:none; z-index:20; white-space:nowrap;
        }
        .caro-swipe-miss    { color:#ff4b4b; }
        .caro-swipe-partial { color:#e0a400; }
        .caro-swipe-perfect { color:#06d6a0; }
        .caro-swipe-neutral { color:var(--text-muted); font-size:18px; }
        .caro-swipe-tip { font-size:11px; color:var(--text-muted); text-align:center; margin-top:8px; opacity:0.8; }

        /* TTS button (mirrors .caro-ban-btn, top-left) */
        .caro-tts-btn {
            position:absolute; top:12px; left:14px;
            background:none; border:none; cursor:pointer;
            opacity:0.4; font-size:16px; padding:2px;
            transition:opacity .2s, transform .2s; z-index:10;
        }
        .caro-tts-btn:hover { opacity:1; transform:scale(1.15); }
        .caro-tts-btn.caro-tts-playing { opacity:1; animation:caroTtsPulse 1s ease infinite; }
        @keyframes caroTtsPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.25); } }

        /* Header streak */
        .caro-streak { color:#e67e22; font-weight:700; }

        /* Undo button (card bottom row) */
        .caro-undo-btn {
            background:none; border:none; color:var(--text-muted);
            font-size:13px; cursor:pointer; padding:8px 10px;
            white-space:nowrap; flex-shrink:0;
        }
        .caro-undo-btn:hover { color:var(--primary-color); }

        /* Results additions */
        .caro-stats-substats { display:flex; gap:16px; justify-content:center; font-size:13px; color:var(--text-muted); margin-top:10px; }
        .caro-apply-wrap { background:var(--surface-color); border:1px solid var(--border-color); border-radius:12px; padding:14px 16px; margin-bottom:16px; box-shadow:0 1px 4px var(--shadow-light); }
        .caro-apply-btn:disabled { opacity:0.6; cursor:default; }
        .caro-apply-note { font-size:12px; color:var(--text-muted); margin-top:8px; text-align:center; line-height:1.45; }
        .caro-due-list { background:var(--surface-color); border:1px solid var(--border-color); border-radius:12px; padding:4px 16px; }
        .caro-due-row { display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom:1px solid var(--border-color); font-size:14px; }
        .caro-due-row:last-child { border-bottom:none; }
        .caro-due-word { font-weight:700; color:var(--text-main); }
        .caro-due-furi { font-size:12px; color:var(--text-muted); margin-left:8px; font-weight:400; }
        .caro-due-when { color:var(--primary-color); font-weight:600; font-size:13px; flex-shrink:0; margin-left:12px; }
    `;
    document.head.appendChild(st);
}
