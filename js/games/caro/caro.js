// js/games/caro/caro.js — Caro vocab-recall game
// export { init, launch }

import { wordList } from '../../../data/word_list_1000.js';
import * as srsDb   from '../../srs_db.js';

let _screens = null;
let _onExit  = null;
let _state   = { queue:[], currentIndex:0, score:0, failedWords:[] };

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
    const el = _screens.setup; if (!el) return;
    const srsWords = srsDb.getAllWords();
    const hasSrs   = Object.keys(srsWords).length > 0;

    el.innerHTML = `
        <div class="caro-setup-panel">
            <div class="caro-setup-section">
                <div class="caro-setup-section-title">Word Sources</div>
                <label class="settings-toggle" style="border-radius:8px 8px 0 0;">
                    <input type="checkbox" id="caro-use-srs" ${hasSrs?'checked':''}>
                    <span class="settings-toggle-track"></span>
                    <span class="settings-toggle-text">My SRS Vocabulary <em>(${Object.keys(srsWords).length} words)</em></span>
                </label>
                <div id="caro-srs-filter" style="padding:10px 20px 12px; background:var(--surface-color); border:1px solid var(--border-color); border-top:none; ${hasSrs?'':'display:none;'}">
                    <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">Include statuses:</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        ${[0,1,2,3,4,5].map(s=>`
                            <label class="caro-status-chip">
                                <input type="checkbox" class="caro-status-check" value="${s}" ${s<=3?'checked':''}>
                                <span class="status-btn" data-status="${s}" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:14px;font-weight:bold;border:2px solid transparent;">${s}</span>
                            </label>`).join('')}
                    </div>
                </div>
                <label class="settings-toggle" style="border-radius:0 0 8px 8px;border-top:1px solid var(--border-color);">
                    <input type="checkbox" id="caro-use-list" checked>
                    <span class="settings-toggle-track"></span>
                    <span class="settings-toggle-text">Top 1000 Word List <em>(${wordList.length} words)</em></span>
                </label>
            </div>
            <div class="caro-setup-section">
                <div class="caro-setup-section-title">Session Size</div>
                <div style="background:var(--surface-color);border:1px solid var(--border-color);border-radius:8px;padding:14px 20px;">
                    <div style="display:flex;gap:8px;flex-wrap:wrap;" id="caro-count-group">
                        ${[10,20,50,100,'All'].map((n,i)=>`<button class="caro-count-btn ${i===1?'active':''}" data-count="${n}">${n}</button>`).join('')}
                    </div>
                </div>
            </div>
            <div id="caro-warning" style="display:none;padding:10px 14px;background:#fff3cd;border:1px solid #ffc107;border-radius:8px;font-size:13px;color:#856404;margin-bottom:4px;"></div>
            <button class="primary-btn" id="caro-btn-start">▶ Start Game</button>
            <button class="caro-back-btn" id="caro-btn-back">← Back to Games</button>
        </div>`;

    const srsToggle = el.querySelector('#caro-use-srs');
    const srsFilter = el.querySelector('#caro-srs-filter');
    srsToggle.addEventListener('change', () => { srsFilter.style.display = srsToggle.checked?'block':'none'; });

    el.querySelectorAll('.caro-status-check').forEach(cb => {
        _chip(cb); cb.addEventListener('change', ()=>_chip(cb));
    });

    el.querySelector('#caro-count-group').addEventListener('click', e => {
        const b = e.target.closest('.caro-count-btn'); if (!b) return;
        el.querySelectorAll('.caro-count-btn').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
    });

    el.querySelector('#caro-btn-back').addEventListener('click', _onExit);
    el.querySelector('#caro-btn-start').addEventListener('click', ()=>_start(el));
}

function _chip(cb) { const c=cb.closest('.caro-status-chip'); if(c) c.style.opacity=cb.checked?'1':'0.35'; }

function _start(el) {
    const useSrs  = el.querySelector('#caro-use-srs').checked;
    const use1000 = el.querySelector('#caro-use-list').checked;
    const statuses = useSrs ? [...el.querySelectorAll('.caro-status-check:checked')].map(c=>+c.value) : [];
    const raw = el.querySelector('.caro-count-btn.active')?.getAttribute('data-count') ?? '20';
    const limit = raw==='All' ? Infinity : +raw;
    const warn = el.querySelector('#caro-warning');

    if (!useSrs && !use1000) { warn.textContent='Select at least one word source.'; warn.style.display='block'; return; }
    if (useSrs && statuses.length===0) { warn.textContent='Select at least one SRS status.'; warn.style.display='block'; return; }
    warn.style.display='none';

    const queue = _buildQueue(useSrs, use1000, statuses, limit);
    if (!queue.length) { warn.textContent='No words matched your settings.'; warn.style.display='block'; return; }

    _state = { queue, currentIndex:0, score:0, failedWords:[] };
    _show('game'); _renderCard();
}

function _buildQueue(useSrs, use1000, statuses, limit) {
    const map = new Map();
    if (use1000) wordList.forEach(w => map.set(w.word, {word:w.word,furi:w.furi,trans:w.trans,status:null}));
    if (useSrs) {
        Object.values(srsDb.getAllWords()).forEach(w => {
            if (statuses.includes(w.status)) map.set(w.word, {word:w.word,furi:w.furi,trans:w.translation,status:w.status});
            else if (!use1000) map.delete(w.word);
        });
    }
    let arr = [...map.values()].sort(()=>Math.random()-.5);
    return isFinite(limit) ? arr.slice(0,limit) : arr;
}

// ── Game Card ─────────────────────────────────────────────────────────────────

function _renderCard() {
    const el = _screens.game; if (!el) return;
    const {queue,currentIndex,score} = _state;
    const word=queue[currentIndex], total=queue.length, pct=Math.round(currentIndex/total*100);

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

function _maybeScore(el) {
    if (el.querySelector('#caro-meaning-box').style.display!=='none')
        el.querySelector('#caro-score-row').style.display='block';
}

function _score(pts) {
    const el = _screens.game;
    if (el && el._keyHandler) { document.removeEventListener('keydown', el._keyHandler); el._keyHandler = null; }
    const word = _state.queue[_state.currentIndex];
    _state.score += pts;
    if (pts < 1) _state.failedWords.push({...word, pointsEarned:pts});
    _state.currentIndex++;
    if (_state.currentIndex >= _state.queue.length) { _show('stats'); _renderStats(); }
    else _renderCard();
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function _renderStats() {
    const el = _screens.stats; if (!el) return;
    const {queue,score,failedWords} = _state;
    const total=queue.length, pct=total?Math.round(score/total*100):0;
    const col = pct>=80?'#06d6a0':pct>=50?'#ffb703':'#ff4b4b';

    const failedHtml = !failedWords.length
        ? `<p style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px 0;">🎉 No missed or partial words!</p>`
        : failedWords.map((w,i)=>{
            const cur = srsDb.getWord(w.word)?.status ?? null;
            return `<div class="caro-failed-row" data-idx="${i}">
                <div class="caro-failed-word-col">
                    <span class="caro-failed-word">${w.word}</span>
                    <span class="caro-failed-furi">${w.furi||''}</span>
                    <span class="caro-failed-trans">${w.trans||''}</span>
                </div>
                <div class="caro-failed-right">
                    <span class="caro-failed-pts">${w.pointsEarned===0?'🔴 Miss':'🟡 Partial'}</span>
                    <div class="caro-failed-srs">
                        ${[0,1,2,3,4,5].map(s=>`<button class="caro-srs-btn status-btn"
                            data-word="${encodeURIComponent(w.word)}"
                            data-furi="${encodeURIComponent(w.furi||'')}"
                            data-trans="${encodeURIComponent(w.trans||'')}"
                            data-status="${s}"
                            style="${cur===s?'border:3px solid #333;':'border:none;'}">${s}</button>`).join('')}
                    </div>
                    <div id="caro-saved-${i}" style="display:none;font-size:11px;color:#1a7a4a;margin-top:3px;">✓ Saved</div>
                </div>
            </div>`;
        }).join('');

    el.innerHTML = `
        <div class="caro-stats-panel">
            <div class="caro-stats-score-block">
                <div class="caro-stats-score-number" style="color:${col}">${_fmt(score)}<span style="font-size:24px;color:var(--text-muted);"> / ${total}</span></div>
                <div style="font-size:16px;color:var(--text-muted);margin-top:4px;">${pct}% correct</div>
                <div style="margin-top:12px;display:flex;gap:16px;justify-content:center;font-size:13px;color:var(--text-muted);">
                    <span>✅ Perfect: ${queue.length-failedWords.length}</span>
                    <span>⚠️ Partial/Miss: ${failedWords.length}</span>
                </div>
            </div>
            ${failedWords.length?`<div class="caro-stats-section-title" style="margin-top:20px;">Review & Update SRS Status</div>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Tap a number to save to your SRS.</p>`:''}
            <div>${failedHtml}</div>
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button class="primary-btn" id="caro-btn-again" style="flex:1;">▶ Play Again</button>
                <button class="primary-btn" id="caro-btn-done" style="flex:1;background:var(--bg-color);color:var(--text-main);border:1px solid var(--border-color);">← Games</button>
            </div>
        </div>`;

    el.querySelectorAll('.caro-srs-btn').forEach(btn => btn.addEventListener('click', ()=>{
        const word=decodeURIComponent(btn.dataset.word), furi=decodeURIComponent(btn.dataset.furi),
              trans=decodeURIComponent(btn.dataset.trans), status=+btn.dataset.status;
        srsDb.saveWord({word,furi,translation:trans,status});
        btn.closest('.caro-failed-srs').querySelectorAll('.caro-srs-btn').forEach(b=>{
            b.style.border = +b.dataset.status===status?'3px solid #333':'none';
        });
        const msg=el.querySelector(`#caro-saved-${btn.closest('.caro-failed-row').dataset.idx}`);
        if(msg){msg.style.display='block';setTimeout(()=>msg.style.display='none',2000);}
    }));

    el.querySelector('#caro-btn-again').addEventListener('click', ()=>{ _show('setup'); _renderSetup(); });
    el.querySelector('#caro-btn-done').addEventListener('click', _onExit);
}

function _fmt(n) { return Number.isInteger(n)?String(n):n.toFixed(1); }