/**
 * dsa_ui.js
 * Das Schwarze Auge — Wüsten-Tracker
 *
 * ARCHITECTURE:
 *   index.html    →  only: #btn-dsa-refresh, #dsa-fetch-status, #dsa-dashboard
 *   DSAData.json  →  all content & values — GM edits only this file
 *   dsa_ui.js     →  all rendering logic  — dev edits only this file
 *
 * ── JSON REFERENCE ──────────────────────────────────────────────────────────
 * {
 *   "waterCurrent":  250,         // current water
 *   "waterMax":      250,         // max capacity
 *   "waterUnit":     "Liter",     // unit label
 *   "distanceUnit":  "Meilen",    // used across all stages
 *   "hoursPerDay":   8,           // marching hours per day (for "days left" calc)
 *
 *   "stages": [
 *     {
 *       "name":              "Mherwed → Gebirgspass",
 *       "distanceTotal":     72.14,
 *       "hoursTotal":        27.39,
 *       "done":              true          // ← completed stage, no progress needed
 *     },
 *     {
 *       "name":              "Gebirgspass → Oase Hayabeth",
 *       "distanceTotal":     36.07,
 *       "hoursTotal":        19.24,
 *       "done":              false,
 *       "distanceTraveled":  0,            // ← current progress (starts at 0)
 *       "hoursWalked":       0
 *     },
 *     {
 *       "name":              "Oase Hayabeth → Oase Tarfui",
 *       "distanceTotal":     140.04,
 *       "hoursTotal":        74.69,
 *       "done":              false         // ← upcoming, no progress fields needed
 *     }
 *     // … more stages
 *   ],
 *
 *   "notes":        "Sandsturm morgen früh.",   // omit to hide the card
 *   "lastUpdated":  "2026-03-20"
 * }
 * ────────────────────────────────────────────────────────────────────────────
 */

const DATA_URL = 'https://raw.githubusercontent.com/tstorygit/Tstory/main/DSAData.json';

// ─── INIT ────────────────────────────────────────────────────────────────────

export function initDSA() {
    document.getElementById('btn-dsa-refresh')
        ?.addEventListener('click', () => fetchAndRender(true));

    const tab = document.querySelector('button[data-target="view-dsa"]');
    if (tab) tab.addEventListener('click', () => fetchAndRender(false));

    fetchAndRender(false);
}

// ─── FETCH ───────────────────────────────────────────────────────────────────

async function fetchAndRender(showSpinner) {
    const statusEl = document.getElementById('dsa-fetch-status');
    const dashEl   = document.getElementById('dsa-dashboard');

    if (showSpinner) setStatus(statusEl, 'loading', '⏳ Syncing…');

    try {
        const res = await fetch(DATA_URL + '?_=' + Date.now());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        renderDashboard(dashEl, data);
        setStatus(statusEl, 'success',
            `Synced: ${new Date().toLocaleTimeString()}` +
            (data.lastUpdated ? `  ·  Stand: ${data.lastUpdated}` : ''));
    } catch (err) {
        setStatus(statusEl, 'error', `⚠️ ${err.message}`);
        renderDashboard(dashEl, {});
    }
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function renderDashboard(container, d) {
    const water      = d.waterCurrent ?? 0;
    const waterMax   = d.waterMax     ?? 20;
    const waterUnit  = d.waterUnit    ?? 'Einheiten';
    const distUnit   = d.distanceUnit ?? 'Meilen';
    const hoursPerDay = d.hoursPerDay ?? 8;
    const stages     = d.stages       ?? [];
    const notes      = d.notes        ?? null;

    const waterPct   = waterMax > 0 ? Math.min(100, water / waterMax * 100) : 0;
    const waterColor = waterPct > 60 ? '#3a9e6e' : waterPct > 30 ? '#c9922a' : '#c0392b';

    // Find the active stage (first non-done)
    const activeIdx  = stages.findIndex(s => !s.done);
    const active     = activeIdx !== -1 ? stages[activeIdx] : null;

    container.innerHTML = `

        <!-- ══ WATER ════════════════════════════════════════════════════ -->
        <div class="dsa-card">
            <div class="dsa-card-header">
                <span class="dsa-card-icon">💧</span>
                <h3>Wasservorrat</h3>
                <span class="dsa-card-value">${water} / ${waterMax} ${waterUnit}</span>
            </div>
            <div class="dsa-tank-wrap">
                <div class="dsa-tank">
                    <div class="dsa-tank-fill" style="height:${waterPct}%; background:${waterColor};"></div>
                    ${buildTicks(waterMax)}
                    <span class="dsa-tank-label">${Math.round(waterPct)}%</span>
                </div>
                <div class="dsa-tank-legend">
                    <div class="dsa-legend-row ${waterPct > 60                    ? 'active' : ''}">🟢 Sicher &gt;60%</div>
                    <div class="dsa-legend-row ${waterPct <= 60 && waterPct > 30  ? 'active' : ''}">🟡 Knapp 31–60%</div>
                    <div class="dsa-legend-row ${waterPct <= 30                   ? 'active' : ''}">🔴 Kritisch ≤30%</div>
                </div>
            </div>
        </div>

        <!-- ══ ACTIVE STAGE ══════════════════════════════════════════════ -->
        ${active ? renderActiveStage(active, distUnit, hoursPerDay) : ''}

        <!-- ══ STAGE LIST ════════════════════════════════════════════════ -->
        ${renderStageList(stages, activeIdx, distUnit)}

        <!-- ══ GM NOTES ══════════════════════════════════════════════════ -->
        ${notes ? `
        <div class="dsa-card dsa-notes-card">
            <div class="dsa-card-header">
                <span class="dsa-card-icon">📜</span>
                <h3>Meisternotiz</h3>
            </div>
            <p class="dsa-notes-text">${esc(notes)}</p>
        </div>` : ''}
    `;

    // Kick off CSS transitions after first paint
    requestAnimationFrame(() => {
        const ease = '1.2s cubic-bezier(0.4,0,0.2,1)';
        container.querySelector('.dsa-tank-fill') ?.style.setProperty('transition', `height ${ease}`);
        container.querySelector('.dsa-fill-dist') ?.style.setProperty('transition', `width ${ease}`);
        container.querySelector('.dsa-fill-time') ?.style.setProperty('transition', `width ${ease}`);
        container.querySelector('.dsa-camel')     ?.style.setProperty('transition', `left ${ease}`);
    });
}

// ─── ACTIVE STAGE CARD ───────────────────────────────────────────────────────

function renderActiveStage(s, distUnit, hoursPerDay) {
    const traveled = s.distanceTraveled ?? 0;
    const walked   = s.hoursWalked     ?? 0;
    const distPct  = s.distanceTotal > 0 ? Math.min(100, traveled / s.distanceTotal * 100) : 0;
    const hoursPct = s.hoursTotal     > 0 ? Math.min(100, walked   / s.hoursTotal     * 100) : 0;
    const distLeft = Math.max(0, s.distanceTotal - traveled);
    const hoursLeft = Math.max(0, s.hoursTotal - walked);
    const daysLeft = hoursPerDay > 0 ? (hoursLeft / hoursPerDay).toFixed(1) : '?';

    return `
    <div class="dsa-card dsa-active-card">
        <div class="dsa-card-header">
            <span class="dsa-card-icon">🏜️</span>
            <h3>${esc(s.name)}</h3>
            <span class="dsa-active-badge">Aktiv</span>
        </div>

        <!-- Distance bar -->
        <div class="dsa-track-section">
            <div class="dsa-track-meta">
                <span class="dsa-track-icon">📍</span>
                <span class="dsa-track-title">Strecke</span>
                <span class="dsa-track-reading">${traveled} / ${s.distanceTotal} ${distUnit}</span>
            </div>
            <div class="dsa-track-bar">
                <div class="dsa-track-fill dsa-fill-dist" style="width:${distPct}%;"></div>
                <span class="dsa-camel" style="left:calc(${distPct}% - 14px)">🐪</span>
            </div>
            <div class="dsa-track-labels">
                <span>Start</span>
                <span>${Math.round(distPct)}%</span>
                <span>Ziel</span>
            </div>
        </div>

        <!-- Time bar -->
        <div class="dsa-track-section" style="margin-top:16px;">
            <div class="dsa-track-meta">
                <span class="dsa-track-icon">⏳</span>
                <span class="dsa-track-title">Marschzeit</span>
                <span class="dsa-track-reading">${walked} / ${s.hoursTotal} Std.</span>
            </div>
            <div class="dsa-track-bar">
                <div class="dsa-track-fill dsa-fill-time" style="width:${hoursPct}%;"></div>
            </div>
            <div class="dsa-track-labels">
                <span>Beginn</span>
                <span>${Math.round(hoursPct)}%</span>
                <span>Ende</span>
            </div>
        </div>

        <!-- Stats -->
        <div class="dsa-stat-row" style="margin-top:16px;">
            <div class="dsa-stat">
                <span class="dsa-stat-num">${traveled}</span>
                <span class="dsa-stat-label">zurückgelegt<br><em>${distUnit}</em></span>
            </div>
            <div class="dsa-stat">
                <span class="dsa-stat-num">${distLeft}</span>
                <span class="dsa-stat-label">verbleibend<br><em>${distUnit}</em></span>
            </div>
            <div class="dsa-stat">
                <span class="dsa-stat-num">${hoursLeft}h</span>
                <span class="dsa-stat-label">Marschzeit<br>verbleibend</span>
            </div>
            <div class="dsa-stat">
                <span class="dsa-stat-num">~${daysLeft}</span>
                <span class="dsa-stat-label">Tage noch<br><em>(${hoursPerDay}h/Tag)</em></span>
            </div>
        </div>
    </div>`;
}

// ─── STAGE LIST CARD ─────────────────────────────────────────────────────────

function renderStageList(stages, activeIdx, distUnit) {
    if (!stages.length) return '';

    const rows = stages.map((s, i) => {
        const isDone    = s.done === true;
        const isActive  = i === activeIdx;
        const isUpcoming = !isDone && !isActive;

        let icon, cls, extra = '';

        if (isDone) {
            icon = '✅';
            cls  = 'dsa-stage-done';
        } else if (isActive) {
            const pct = s.distanceTotal > 0
                ? Math.round((s.distanceTraveled ?? 0) / s.distanceTotal * 100)
                : 0;
            icon  = '🐪';
            cls   = 'dsa-stage-active';
            extra = `<div class="dsa-stage-mini-bar"><div class="dsa-stage-mini-fill" style="width:${pct}%"></div></div>`;
        } else {
            icon = '⬜';
            cls  = 'dsa-stage-upcoming';
        }

        return `
        <div class="dsa-stage-row ${cls}">
            <span class="dsa-stage-icon">${icon}</span>
            <div class="dsa-stage-info">
                <span class="dsa-stage-name">${esc(s.name)}</span>
                <span class="dsa-stage-meta">${s.distanceTotal} ${distUnit} · ${s.hoursTotal} Std.</span>
                ${extra}
            </div>
        </div>`;
    }).join('');

    return `
    <div class="dsa-card">
        <div class="dsa-card-header">
            <span class="dsa-card-icon">🗺️</span>
            <h3>Reiseetappen</h3>
        </div>
        <div class="dsa-stage-list">${rows}</div>
    </div>`;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function buildTicks(max) {
    return [75, 50, 25].map(pct => `
        <div class="dsa-tank-tick" style="bottom:${pct}%">
            <span class="dsa-tick-label">${Math.round(max * pct / 100)}</span>
        </div>`).join('');
}

function esc(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\n/g,'<br>');
}

function setStatus(el, type, msg) {
    if (!el) return;
    el.className = `status-message status-${type}`;
    el.textContent = msg;
    el.style.display = 'block';
    if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 8000);
}