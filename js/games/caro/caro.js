// js/games/caro/caro.js — Caro vocab-recall game
// export { init, launch }

import * as srsDb from '../../srs_db.js';
import { mountVocabSelector, getBannedWords, setBannedWords } from '../../vocab_selector.js';

let _screens = null;
let _onExit  = null;
let _selector = null;
let _state   = { activeQueue:[], reserveQueue:[], currentIndex:0, score:0, history:[] };

const BANNED_KEY = 'caro_banned_words';

export function init(screens, onExit) { _screens = screens; _onExit = onExit; }
export function launch() { _show('setup'); _renderSetup(); }

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

function _start() {
    // getQueue() handles validation and shows warnings inside the setup screen
    const fullQueue = _selector.getQueue();
    if (!fullQueue.length) return;

    _state = {
        activeQueue:  fullQueue,
        reserveQueue: [],
        currentIndex: 0,
        score:        0,
        history:      [],
    };
    _show('game');
    _renderCard();
}

// ── Game Card ─────────────────────────────────────────────────────────────────

function _renderCard() {
    const el = _screens.game; if (!el) return;
    const {activeQueue,currentIndex,score} = _state;
    const word=activeQueue[currentIndex], total=activeQueue.length, pct=Math.round(currentIndex/total*100);

    // Remove any old keyboard listener before re-rendering
    if (el._keyHandler) { document.removeEventListener('keydown', el._keyHandler); el._keyHandler = null; }

    el.style.display='flex';
    el.innerHTML = `
        <div class="caro-progress-bar-wrap">
            <div class="caro-progress-meta">
                <span>Word ${currentIndex+1} / ${total}</span>
                <span>Score: ${_fmt(score)}</span>
            </div>
            <div class="caro-progress-track">
                <div class="caro-progress-fill" style="width:${pct}%;"></div>
            </div>
        </div>

        <div class="caro-card">
            <button id="caro-btn-ban" class="caro-ban-btn" title="Ban this word (never show again)">🚫</button>

            <!-- Reading spoiler badge at top -->
            <div class="caro-furi-spoiler" id="caro-furi-spoiler" title="Reveal reading (Ctrl)">
                <svg id="caro-furi-eye-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <span id="caro-furi-label">Reading</span>
                <span id="caro-furi-value" class="caro-furi-hidden">${word.furi||'—'}</span>
            </div>

            <!-- Main word -->
            <div class="caro-card-word">${word.word}</div>

            <!-- Meaning reveal -->
            <button class="caro-reveal-meaning-btn" id="caro-btn-meaning">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Meaning
                <span class="caro-kbd-hint">Space</span>
            </button>
            <div id="caro-meaning-box" class="caro-meaning-revealed" style="display:none;">
                <span class="caro-field-value">${word.trans||'—'}</span>
            </div>

            <!-- Score row (shown after meaning revealed) -->
            <div id="caro-score-row" class="caro-score-row" style="display:none;">
                <div class="caro-score-label">How well did you know it?</div>
                <div class="caro-score-btns">
                    <button class="caro-score-btn caro-score-miss"    data-pts="0">
                        <span class="caro-score-icon">🔴</span> Miss
                        <span class="caro-kbd-hint">←</span>
                    </button>
                    <button class="caro-score-btn caro-score-partial" data-pts="0.5">
                        <span class="caro-score-icon">🟡</span> Partial
                        <span class="caro-kbd-hint">↓</span>
                    </button>
                    <button class="caro-score-btn caro-score-perfect" data-pts="1">
                        <span class="caro-score-icon">🟢</span> Perfect
                        <span class="caro-kbd-hint">→</span>
                    </button>
                </div>
            </div>
        </div>

        <div class="caro-bottom-row">
            <button class="caro-back-btn" id="caro-btn-quit">✕ Quit</button>
            <div class="caro-info-wrap">
                <button class="caro-info-btn" id="caro-info-btn" aria-label="Keyboard shortcuts">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </button>
                <div class="caro-info-tooltip" id="caro-info-tooltip" style="display:none;">
                    <div class="caro-info-row"><kbd>Ctrl</kbd> Reveal reading</div>
                    <div class="caro-info-row"><kbd>Space</kbd> Reveal meaning</div>
                    <div class="caro-info-row"><kbd>←</kbd> Miss</div>
                    <div class="caro-info-row"><kbd>↓</kbd> Partial</div>
                    <div class="caro-info-row"><kbd>→</kbd> Perfect</div>
                </div>
            </div>
        </div>`;

    // Ban button
    el.querySelector('#caro-btn-ban').addEventListener('click', () => {
        if(!confirm("Ban this word? It won't appear in Caro again.")) return;
        const wordObj = _state.activeQueue[_state.currentIndex];
        const banned  = getBannedWords(BANNED_KEY);
        if (!banned.includes(wordObj.word)) {
            setBannedWords(BANNED_KEY, [...banned, wordObj.word]);
        }
        if (_state.reserveQueue.length > 0) {
            _state.activeQueue[_state.currentIndex] = _state.reserveQueue.shift();
        } else {
            _state.activeQueue.splice(_state.currentIndex, 1);
            if (_state.currentIndex >= _state.activeQueue.length) {
                _show('stats'); _renderStats();
                return;
            }
        }
        _renderCard();
    });

    // Reading spoiler toggle
    const spoiler = el.querySelector('#caro-furi-spoiler');
    const furiVal  = el.querySelector('#caro-furi-value');
    const furiLbl  = el.querySelector('#caro-furi-label');
    const eyeIcon  = el.querySelector('#caro-furi-eye-icon');
    let furiRevealed = false;
    spoiler.addEventListener('click', () => {
        furiRevealed = !furiRevealed;
        furiVal.classList.toggle('caro-furi-hidden', !furiRevealed);
        spoiler.classList.toggle('caro-furi-revealed', furiRevealed);
        eyeIcon.style.opacity = furiRevealed ? '0.4' : '1';
        furiLbl.textContent = furiRevealed ? 'Reading' : 'Reading';
    });

    // Meaning reveal
    const meaningBtn = el.querySelector('#caro-btn-meaning');
    const meaningBox = el.querySelector('#caro-meaning-box');
    const scoreRow   = el.querySelector('#caro-score-row');
    function revealMeaning() {
        if (meaningBox.style.display !== 'none') return;
        meaningBox.style.display = 'flex';
        meaningBtn.style.display = 'none';
        scoreRow.style.display = 'block';
    }
    meaningBtn.addEventListener('click', revealMeaning);

    // Score buttons
    el.querySelectorAll('.caro-score-btn').forEach(b => b.addEventListener('click', () => _score(+b.dataset.pts)));

    // Quit
    el.querySelector('#caro-btn-quit').addEventListener('click', () => {
        if (confirm('Quit? Progress will be lost.')) _onExit();
    });

    // Info tooltip toggle
    const infoBtn     = el.querySelector('#caro-info-btn');
    const infoTooltip = el.querySelector('#caro-info-tooltip');
    infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const visible = infoTooltip.style.display !== 'none';
        infoTooltip.style.display = visible ? 'none' : 'block';
    });
    document.addEventListener('click', () => { infoTooltip.style.display = 'none'; }, { once: false });

    // Keyboard handler
    el._keyHandler = (e) => {
        if (!_screens.game || _screens.game.style.display === 'none') return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.code === 'Space') { e.preventDefault(); revealMeaning(); }
        if (e.code === 'ControlLeft' || e.code === 'ControlRight') { e.preventDefault(); spoiler.click(); }
        if (e.code === 'ArrowLeft')  { e.preventDefault(); revealMeaning(); _score(0); }
        if (e.code === 'ArrowDown')  { e.preventDefault(); revealMeaning(); _score(0.5); }
        if (e.code === 'ArrowRight') { e.preventDefault(); revealMeaning(); _score(1); }
    };
    document.addEventListener('keydown', el._keyHandler);
}

function _score(pts) {
    const el = _screens.game;
    if (el && el._keyHandler) { document.removeEventListener('keydown', el._keyHandler); el._keyHandler = null; }
    const word = _state.activeQueue[_state.currentIndex];
    _state.score += pts;
    _state.history.push({...word, pts});
    _state.currentIndex++;
    if (_state.currentIndex >= _state.activeQueue.length) { _show('stats'); _renderStats(); }
    else _renderCard();
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function _renderStats() {
    const el = _screens.stats; if (!el) return;
    const {score,history} = _state;
    const total=history.length, pct=total?Math.round(score/total*100):0;
    const col = pct>=80?'#06d6a0':pct>=50?'#ffb703':'#ff4b4b';

    const missed = history.filter(w => w.pts === 0);
    const partial = history.filter(w => w.pts === 0.5);
    const perfect = history.filter(w => w.pts === 1);

    let uid = 0;
    function buildGroup(title, words, icon) {
        if(!words.length) return '';
        return `
            <div class="caro-stats-section-title" style="margin-top:20px;">${icon} ${title} (${words.length})</div>
            <div>${words.map(w => {
                const i = uid++;
                const cur = srsDb.getWord(w.word)?.status ?? null;
                return `<div class="caro-result-row" data-idx="${i}">
                    <div class="caro-result-word-col">
                        <span class="caro-result-word">${w.word}</span>
                        <span class="caro-result-furi">${w.furi||''}</span>
                        <span class="caro-result-trans">${w.trans||''}</span>
                    </div>
                    <div class="caro-result-right">
                        <div class="caro-result-srs">
                            ${[0,1,2,3,4,5].map(s=>`<button class="caro-srs-btn status-btn"
                                data-word="${encodeURIComponent(w.word)}"
                                data-furi="${encodeURIComponent(w.furi||'')}"
                                data-trans="${encodeURIComponent(w.trans||'')}"
                                data-status="${s}"
                                style="${cur===s?'border:3px solid #333;':'border:none;'}">${s}</button>`).join('')}
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
            </div>
            ${history.length?`<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;text-align:center;">Review & Update SRS Status</p>`:''}
            ${listsHtml}
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button class="primary-btn" id="caro-btn-again" style="flex:1;">▶ Play Again</button>
                <button class="primary-btn" id="caro-btn-done" style="flex:1;background:var(--bg-color);color:var(--text-main);border:1px solid var(--border-color);">← Games</button>
            </div>
        </div>`;

    el.querySelectorAll('.caro-srs-btn').forEach(btn => btn.addEventListener('click', ()=>{
        const word=decodeURIComponent(btn.dataset.word), furi=decodeURIComponent(btn.dataset.furi),
              trans=decodeURIComponent(btn.dataset.trans), status=+btn.dataset.status;
        srsDb.saveWord({word,furi,translation:trans,status});
        btn.closest('.caro-result-srs').querySelectorAll('.caro-srs-btn').forEach(b=>{
            b.style.border = +b.dataset.status===status?'3px solid #333':'none';
        });
        const msg=el.querySelector(`#caro-saved-${btn.closest('.caro-result-row').dataset.idx}`);
        if(msg){msg.style.display='block';setTimeout(()=>msg.style.display='none',2000);}
    }));

    el.querySelector('#caro-btn-again').addEventListener('click', ()=>{ _show('setup'); _renderSetup(); });
    el.querySelector('#caro-btn-done').addEventListener('click', _onExit);
}

function _fmt(n) { return Number.isInteger(n)?String(n):n.toFixed(1); }