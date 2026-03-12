/**
 * srs_stats_ui.js
 *
 * Renders the SRS Statistics panel — a slide-in sheet that opens from the
 * 📊 button next to the mode-toggle in the SRS view header.
 *
 * Dependencies:
 *   import * as srsStats from './srs_stats.js';
 *
 * DOM injected:
 *   #srs-stats-btn        — the trigger button (appended to the header row)
 *   #srs-stats-overlay    — full-screen dimmer
 *   #srs-stats-panel      — the slide-in sheet
 */

import * as srsStats from './srs_stats.js';

// ─── INJECT TRIGGER BUTTON ───────────────────────────────────────────────────

export function initStatsUI() {
    _injectStyles();
    _injectPanel();
    _injectTriggerButton();
}

function _injectTriggerButton() {
    const headerRow = document.querySelector('#view-srs header > div');
    if (!headerRow || document.getElementById('srs-stats-btn')) return;

    const btn = document.createElement('button');
    btn.id        = 'srs-stats-btn';
    btn.title     = 'Review Statistics';
    btn.innerHTML = '📊';
    btn.addEventListener('click', openStatsPanel);

    // Insert before the counter span
    const counter = document.getElementById('srs-counter');
    headerRow.insertBefore(btn, counter);
}

// ─── PANEL SKELETON ──────────────────────────────────────────────────────────

function _injectPanel() {
    if (document.getElementById('srs-stats-overlay')) return;

    // Overlay (dimmer)
    const overlay = document.createElement('div');
    overlay.id = 'srs-stats-overlay';
    overlay.addEventListener('click', closeStatsPanel);
    document.body.appendChild(overlay);

    // Panel
    const panel = document.createElement('div');
    panel.id        = 'srs-stats-panel';
    panel.innerHTML = `
        <div class="srs-stats-header">
            <span class="srs-stats-title">📊 Review Statistics</span>
            <button id="srs-stats-close" title="Close">✕</button>
        </div>
        <div id="srs-stats-body" class="srs-stats-body">
            <p style="color:var(--text-muted);font-size:14px;padding:20px;">Loading…</p>
        </div>
    `;
    document.body.appendChild(panel);
    document.getElementById('srs-stats-close').addEventListener('click', closeStatsPanel);
}

// ─── OPEN / CLOSE ─────────────────────────────────────────────────────────────

function openStatsPanel() {
    document.getElementById('srs-stats-overlay').classList.add('visible');
    document.getElementById('srs-stats-panel').classList.add('open');
    _render();
}

function closeStatsPanel() {
    document.getElementById('srs-stats-overlay').classList.remove('visible');
    document.getElementById('srs-stats-panel').classList.remove('open');
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function _render() {
    const body    = document.getElementById('srs-stats-body');
    const all     = srsStats.getAllTimeStats();
    const today   = srsStats.getToday();
    const streak  = srsStats.getStreak();
    const w7      = srsStats.getWindowStats(7);
    const w30     = srsStats.getWindowStats(30);
    const leeches = srsStats.getLeeches(40, 4);

    body.innerHTML = `
        ${_sectionToday(today, streak)}
        ${_sectionStreak(streak)}
        ${_sectionGradeBreakdown(all)}
        ${_sectionWindows(w7, w30)}
        ${_sectionActivity(all)}
        ${_sectionDowHeatmap(all.byDow)}
        ${_sectionHistory(all.dailyHistory)}
        ${_sectionLeeches(leeches)}
        ${_sectionAllTime(all)}
    `;

    // Draw bar charts after DOM insertion
    _drawHistoryChart(all.dailyHistory);
    _drawDowChart(all.byDow);
    _animateCounters();
}

// ─── SECTION BUILDERS ────────────────────────────────────────────────────────

function _sectionToday(today, streak) {
    const noData = today.total === 0;
    return `
    <div class="stats-section">
        <div class="stats-section-title">Today</div>
        <div class="stats-grid-4">
            <div class="stats-card">
                <div class="stats-card-value" data-count="${today.total}">${noData ? '—' : today.total}</div>
                <div class="stats-card-label">Reviews</div>
            </div>
            <div class="stats-card accent-again">
                <div class="stats-card-value">${noData ? '—' : today.again}</div>
                <div class="stats-card-label">Again</div>
            </div>
            <div class="stats-card accent-good">
                <div class="stats-card-value">${noData ? '—' : today.good + today.easy}</div>
                <div class="stats-card-label">Correct</div>
            </div>
            <div class="stats-card accent-pct">
                <div class="stats-card-value">${noData ? '—' : today.retentionPct + '%'}</div>
                <div class="stats-card-label">Retention</div>
            </div>
        </div>
        ${today.total > 0 ? _miniGradeBar(today) : ''}
    </div>`;
}

function _sectionStreak(streak) {
    const fire = streak.current >= 7 ? '🔥' : streak.current >= 3 ? '✨' : '📅';
    return `
    <div class="stats-section">
        <div class="stats-section-title">Streak</div>
        <div class="stats-grid-2">
            <div class="stats-card streak-card">
                <div class="streak-emoji">${fire}</div>
                <div class="stats-card-value" data-count="${streak.current}">${streak.current}</div>
                <div class="stats-card-label">Day streak</div>
            </div>
            <div class="stats-card">
                <div class="streak-emoji">🏆</div>
                <div class="stats-card-value">${streak.longest}</div>
                <div class="stats-card-label">Best streak</div>
            </div>
        </div>
    </div>`;
}

function _sectionGradeBreakdown(all) {
    if (all.srsReviews === 0) return `
    <div class="stats-section">
        <div class="stats-section-title">Grade Breakdown</div>
        <p class="stats-empty">No SRS reviews recorded yet.</p>
    </div>`;

    const { again, hard, good, easy, srsReviews, retentionPct } = all;
    const pAgain = Math.round(again / srsReviews * 100);
    const pHard  = Math.round(hard  / srsReviews * 100);
    const pGood  = Math.round(good  / srsReviews * 100);
    const pEasy  = Math.round(easy  / srsReviews * 100);

    return `
    <div class="stats-section">
        <div class="stats-section-title">All-time Grade Breakdown
            <span class="stats-subtitle">${srsReviews.toLocaleString()} total · ${retentionPct}% retention</span>
        </div>
        <div class="grade-stacked-bar">
            <div class="gsb-seg gsb-again" style="width:${pAgain}%" title="Again ${pAgain}%"></div>
            <div class="gsb-seg gsb-hard"  style="width:${pHard}%"  title="Hard ${pHard}%"></div>
            <div class="gsb-seg gsb-good"  style="width:${pGood}%"  title="Good ${pGood}%"></div>
            <div class="gsb-seg gsb-easy"  style="width:${pEasy}%"  title="Easy ${pEasy}%"></div>
        </div>
        <div class="grade-legend">
            <span class="gl-item"><span class="gl-dot gl-again"></span>Again ${pAgain}% <em>(${again.toLocaleString()})</em></span>
            <span class="gl-item"><span class="gl-dot gl-hard"></span>Hard ${pHard}% <em>(${hard.toLocaleString()})</em></span>
            <span class="gl-item"><span class="gl-dot gl-good"></span>Good ${pGood}% <em>(${good.toLocaleString()})</em></span>
            <span class="gl-item"><span class="gl-dot gl-easy"></span>Easy ${pEasy}% <em>(${easy.toLocaleString()})</em></span>
        </div>
    </div>`;
}

function _sectionWindows(w7, w30) {
    const fmt = (v) => v === 0 ? '—' : v;
    return `
    <div class="stats-section">
        <div class="stats-section-title">Rolling Windows</div>
        <div class="stats-grid-2">
            <div class="stats-card">
                <div class="stats-card-label" style="margin-bottom:8px;">Last 7 days</div>
                <div class="window-row"><span>Reviews</span><strong>${fmt(w7.totalReviews)}</strong></div>
                <div class="window-row"><span>Words</span><strong>${fmt(w7.uniqueWords)}</strong></div>
                <div class="window-row"><span>Retention</span><strong>${w7.srsReviews > 0 ? w7.retentionPct + '%' : '—'}</strong></div>
            </div>
            <div class="stats-card">
                <div class="stats-card-label" style="margin-bottom:8px;">Last 30 days</div>
                <div class="window-row"><span>Reviews</span><strong>${fmt(w30.totalReviews)}</strong></div>
                <div class="window-row"><span>Words</span><strong>${fmt(w30.uniqueWords)}</strong></div>
                <div class="window-row"><span>Retention</span><strong>${w30.srsReviews > 0 ? w30.retentionPct + '%' : '—'}</strong></div>
            </div>
        </div>
    </div>`;
}

function _sectionActivity(all) {
    return `
    <div class="stats-section">
        <div class="stats-section-title">Activity</div>
        <div class="stats-grid-3">
            <div class="stats-card">
                <div class="stats-card-value">${all.activeDays}</div>
                <div class="stats-card-label">Active days</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-value">${all.roll7avg}</div>
                <div class="stats-card-label">Avg/day (7d)</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-value">${all.roll30avg}</div>
                <div class="stats-card-label">Avg/day (30d)</div>
            </div>
        </div>
        ${all.bestDay ? `<p class="stats-note">Best day: <strong>${all.bestDay}</strong> — ${all.bestDayCount} reviews</p>` : ''}
    </div>`;
}

function _sectionDowHeatmap(byDow) {
    const days  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const max   = Math.max(...byDow, 1);
    const cells = byDow.map((v, i) => {
        const pct = v / max;
        return `<div class="dow-cell" style="--intensity:${pct.toFixed(2)}" title="${days[i]}: ${v}">
            <span class="dow-label">${days[i]}</span>
            <span class="dow-count">${v}</span>
        </div>`;
    }).join('');
    return `
    <div class="stats-section">
        <div class="stats-section-title">Reviews by Day of Week</div>
        <div class="dow-grid" id="srs-dow-grid">${cells}</div>
    </div>`;
}

function _sectionHistory(history) {
    return `
    <div class="stats-section">
        <div class="stats-section-title">Daily Reviews — last 90 days</div>
        <div class="history-chart-wrap">
            <canvas id="srs-history-canvas" height="90"></canvas>
        </div>
    </div>`;
}

function _sectionLeeches(leeches) {
    if (leeches.length === 0) return `
    <div class="stats-section">
        <div class="stats-section-title">🐛 Leeches <span class="stats-subtitle">words with &lt;40% retention after 4+ reviews</span></div>
        <p class="stats-empty">No leeches yet — great work!</p>
    </div>`;

    const rows = leeches.slice(0, 8).map(w => `
        <div class="leech-row">
            <span class="leech-word">${w.word}</span>
            <div class="leech-bar-wrap">
                <div class="leech-bar" style="width:${w.retention}%"></div>
            </div>
            <span class="leech-pct">${w.retention}%</span>
            <span class="leech-count">${w.total}×</span>
        </div>`).join('');

    return `
    <div class="stats-section">
        <div class="stats-section-title">🐛 Leeches <span class="stats-subtitle">words with &lt;40% retention after 4+ reviews</span></div>
        <div class="leech-list">${rows}</div>
    </div>`;
}

function _sectionAllTime(all) {
    return `
    <div class="stats-section">
        <div class="stats-section-title">All-time Totals</div>
        <div class="alltime-grid">
            <div class="alltime-row"><span>Total reviews</span><strong>${all.totalReviews.toLocaleString()}</strong></div>
            <div class="alltime-row"><span>SRS reviews</span><strong>${all.srsReviews.toLocaleString()}</strong></div>
            <div class="alltime-row"><span>LingQ status changes</span><strong>${all.lingqChanges.toLocaleString()}</strong></div>
            <div class="alltime-row"><span>Unique words seen</span><strong>${all.uniqueWordsSeen.toLocaleString()}</strong></div>
            <div class="alltime-row"><span>via Flashcard deck</span><strong>${all.wordsBySource.srs.toLocaleString()}</strong></div>
            <div class="alltime-row"><span>via Games</span><strong>${all.wordsBySource.game.toLocaleString()}</strong></div>
            <div class="alltime-row"><span>Average ease factor</span><strong>${all.avgEase}</strong></div>
        </div>
    </div>`;
}

// ─── MINI HELPERS ─────────────────────────────────────────────────────────────

function _miniGradeBar(today) {
    const total = today.again + today.hard + today.good + today.easy;
    if (total === 0) return '';
    const pA = Math.round(today.again / total * 100);
    const pH = Math.round(today.hard  / total * 100);
    const pG = Math.round(today.good  / total * 100);
    const pE = Math.round(today.easy  / total * 100);
    return `
    <div class="grade-stacked-bar" style="margin-top:10px;">
        <div class="gsb-seg gsb-again" style="width:${pA}%"></div>
        <div class="gsb-seg gsb-hard"  style="width:${pH}%"></div>
        <div class="gsb-seg gsb-good"  style="width:${pG}%"></div>
        <div class="gsb-seg gsb-easy"  style="width:${pE}%"></div>
    </div>`;
}

// ─── CANVAS CHART ─────────────────────────────────────────────────────────────

function _drawHistoryChart(history) {
    const canvas = document.getElementById('srs-history-canvas');
    if (!canvas) return;

    const dpr    = window.devicePixelRatio || 1;
    const W      = canvas.parentElement.clientWidth || 320;
    const H      = 90;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const maxVal  = Math.max(...history.map(d => d.total), 1);
    const barW    = W / history.length;
    const padTop  = 6;
    const padBot  = 18;
    const chartH  = H - padTop - padBot;

    // Get CSS variable colours (respects dark mode)
    const cs      = getComputedStyle(document.documentElement);
    const colAgain = '#ef4444';
    const colHard  = '#f59e0b';
    const colGood  = '#22c55e';
    const colEasy  = '#3b82f6';
    const colEmpty = cs.getPropertyValue('--border-color').trim() || '#e0e0e0';

    history.forEach((day, i) => {
        const x    = i * barW + 1;
        const bw   = Math.max(barW - 2, 1);
        const total = day.again + day.hard + day.good + day.easy;

        if (total === 0) {
            ctx.fillStyle = colEmpty;
            ctx.globalAlpha = 0.35;
            ctx.fillRect(x, padTop + chartH - 2, bw, 2);
            ctx.globalAlpha = 1;
            return;
        }

        // stacked bars
        const segs = [
            { v: day.again, c: colAgain },
            { v: day.hard,  c: colHard  },
            { v: day.good,  c: colGood  },
            { v: day.easy,  c: colEasy  },
        ];
        let yOff = padTop + chartH;
        for (const { v, c } of segs) {
            if (!v) continue;
            const h = Math.max((v / maxVal) * chartH, 1);
            yOff -= h;
            ctx.fillStyle = c;
            ctx.fillRect(x, yOff, bw, h);
        }

        // date label every ~2 weeks
        if (i % 14 === 0) {
            ctx.fillStyle = cs.getPropertyValue('--text-muted').trim() || '#999';
            ctx.font       = `${9 * dpr / dpr}px sans-serif`;
            ctx.fillText(day.date.slice(5), x, H - 4);
        }
    });
}

function _drawDowChart(byDow) {
    // Handled via CSS --intensity variable on .dow-cell (see styles)
}

// ─── COUNTER ANIMATION ───────────────────────────────────────────────────────

function _animateCounters() {
    document.querySelectorAll('[data-count]').forEach(el => {
        const target = parseInt(el.getAttribute('data-count'), 10);
        if (!target || isNaN(target)) return;
        let n = 0;
        const step = Math.ceil(target / 20);
        const id = setInterval(() => {
            n = Math.min(n + step, target);
            el.textContent = n;
            if (n >= target) clearInterval(id);
        }, 30);
    });
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

function _injectStyles() {
    if (document.getElementById('srs-stats-styles')) return;
    const style = document.createElement('style');
    style.id    = 'srs-stats-styles';
    style.textContent = `
/* ── Trigger button ─────────────────────────────────────────── */
#srs-stats-btn {
    background: none;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 4px 9px;
    font-size: 16px;
    cursor: pointer;
    color: var(--text-main);
    transition: background 0.15s, transform 0.1s;
    line-height: 1;
}
#srs-stats-btn:hover  { background: var(--border-color); transform: scale(1.08); }
#srs-stats-btn:active { transform: scale(0.95); }

/* ── Overlay ────────────────────────────────────────────────── */
#srs-stats-overlay {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.45);
    z-index: 1100;
    opacity: 0;
    transition: opacity 0.22s;
}
#srs-stats-overlay.visible { display: block; opacity: 1; }

/* ── Panel ──────────────────────────────────────────────────── */
#srs-stats-panel {
    position: fixed;
    top: 0; right: 0; bottom: 0;
    width: min(420px, 100vw);
    background: var(--surface-color);
    border-left: 1px solid var(--border-color);
    z-index: 1101;
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.22,1,0.36,1);
    box-shadow: -6px 0 28px rgba(0,0,0,0.18);
}
#srs-stats-panel.open { transform: translateX(0); }

.srs-stats-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
}
.srs-stats-title {
    font-weight: 700;
    font-size: 16px;
    color: var(--text-main);
}
#srs-stats-close {
    background: none; border: none;
    font-size: 18px; cursor: pointer;
    color: var(--text-muted);
    padding: 2px 6px; border-radius: 6px;
    transition: background 0.15s;
}
#srs-stats-close:hover { background: var(--border-color); }

.srs-stats-body {
    overflow-y: auto;
    flex: 1;
    padding: 0 0 32px;
    -webkit-overflow-scrolling: touch;
}

/* ── Section ────────────────────────────────────────────────── */
.stats-section {
    padding: 16px 18px 4px;
    border-bottom: 1px solid var(--border-color);
}
.stats-section:last-child { border-bottom: none; }
.stats-section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 12px;
    display: flex; align-items: center; gap: 8px;
}
.stats-subtitle {
    font-weight: 400; letter-spacing: 0;
    text-transform: none; font-size: 11px;
}
.stats-empty {
    font-size: 13px; color: var(--text-muted);
    padding-bottom: 12px; margin: 0;
}
.stats-note {
    font-size: 12px; color: var(--text-muted);
    margin: 6px 0 12px;
}

/* ── Stat cards ─────────────────────────────────────────────── */
.stats-grid-4, .stats-grid-3, .stats-grid-2 {
    display: grid; gap: 8px; margin-bottom: 12px;
}
.stats-grid-4 { grid-template-columns: repeat(4,1fr); }
.stats-grid-3 { grid-template-columns: repeat(3,1fr); }
.stats-grid-2 { grid-template-columns: repeat(2,1fr); }

.stats-card {
    background: var(--flashcard-bg, #eef2f5);
    border-radius: 10px;
    padding: 10px 8px 8px;
    text-align: center;
}
.stats-card-value {
    font-size: 22px; font-weight: 700;
    color: var(--text-main); line-height: 1.1;
}
.stats-card-label {
    font-size: 10px; color: var(--text-muted);
    margin-top: 3px; text-transform: uppercase; letter-spacing: .05em;
}
.stats-card.accent-again .stats-card-value { color: #ef4444; }
.stats-card.accent-good  .stats-card-value { color: #22c55e; }
.stats-card.accent-pct   .stats-card-value { color: var(--primary-color); }

/* streak card */
.streak-card { position: relative; }
.streak-emoji { font-size: 20px; line-height: 1; margin-bottom: 2px; }

/* ── Stacked grade bar ──────────────────────────────────────── */
.grade-stacked-bar {
    display: flex; height: 12px; border-radius: 6px;
    overflow: hidden; background: var(--border-color);
    margin-bottom: 10px;
}
.gsb-seg { height: 100%; transition: width 0.4s ease; }
.gsb-again { background: #ef4444; }
.gsb-hard  { background: #f59e0b; }
.gsb-good  { background: #22c55e; }
.gsb-easy  { background: #3b82f6; }

.grade-legend {
    display: flex; flex-wrap: wrap; gap: 6px 12px;
    margin-bottom: 12px; font-size: 12px; color: var(--text-muted);
}
.gl-item { display: flex; align-items: center; gap: 4px; }
.gl-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.gl-again { background: #ef4444; }
.gl-hard  { background: #f59e0b; }
.gl-good  { background: #22c55e; }
.gl-easy  { background: #3b82f6; }
.gl-item em { font-style: normal; opacity: 0.7; }

/* ── Window rows ────────────────────────────────────────────── */
.window-row {
    display: flex; justify-content: space-between;
    font-size: 13px; color: var(--text-muted);
    padding: 3px 0; border-bottom: 1px solid var(--border-color);
}
.window-row:last-child { border-bottom: none; }
.window-row strong { color: var(--text-main); font-weight: 600; }

/* ── Day-of-week grid ───────────────────────────────────────── */
.dow-grid {
    display: grid; grid-template-columns: repeat(7,1fr);
    gap: 4px; margin-bottom: 14px;
}
.dow-cell {
    background: color-mix(in srgb, var(--primary-color) calc(var(--intensity)*80%), var(--flashcard-bg));
    border-radius: 6px;
    padding: 6px 2px 4px;
    text-align: center;
    display: flex; flex-direction: column;
    gap: 2px;
}
.dow-label { font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing:.04em; }
.dow-count  { font-size: 11px; font-weight: 700; color: var(--text-main); }

/* ── History chart ──────────────────────────────────────────── */
.history-chart-wrap {
    width: 100%; margin-bottom: 14px;
    border-radius: 8px; overflow: hidden;
}
#srs-history-canvas { display: block; width: 100%; }

/* ── Leeches ────────────────────────────────────────────────── */
.leech-list { margin-bottom: 12px; }
.leech-row {
    display: grid;
    grid-template-columns: 5.5em 1fr 3em 2.5em;
    align-items: center; gap: 8px;
    padding: 5px 0;
    border-bottom: 1px solid var(--border-color);
    font-size: 13px;
}
.leech-row:last-child { border-bottom: none; }
.leech-word  { font-weight: 600; color: var(--text-main); }
.leech-bar-wrap { height: 6px; background: var(--border-color); border-radius: 3px; overflow:hidden; }
.leech-bar   { height: 100%; background: #ef4444; border-radius: 3px; transition: width 0.4s; }
.leech-pct   { text-align: right; color: #ef4444; font-weight: 700; font-size: 12px; }
.leech-count { text-align: right; color: var(--text-muted); font-size: 11px; }

/* ── All-time table ─────────────────────────────────────────── */
.alltime-grid { margin-bottom: 16px; }
.alltime-row {
    display: flex; justify-content: space-between;
    font-size: 13px; color: var(--text-muted);
    padding: 5px 0; border-bottom: 1px solid var(--border-color);
}
.alltime-row:last-child { border-bottom: none; }
.alltime-row strong { color: var(--text-main); font-weight: 600; }

/* ── Responsive ─────────────────────────────────────────────── */
@media (max-width: 440px) {
    .stats-grid-4 { grid-template-columns: repeat(2,1fr); }
}
    `;
    document.head.appendChild(style);
}
