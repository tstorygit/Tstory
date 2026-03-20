/**
 * dsa_ui.js
 * Renders and drives the "DSA" tab — Das Schwarze Auge / pen-and-paper game tracker.
 *
 * Data is fetched from a hardcoded GitHub raw URL.
 * The GM edits DSAData.json; all players hit Sync to see the latest values.
 *
 * Expected JSON shape (see DSAData.json for a full example):
 * {
 *   "waterCurrent":    12,
 *   "waterMax":        20,
 *   "waterUnit":       "Krüge",
 *
 *   "hoursWalked":     18,
 *   "hoursTotal":      72,
 *   "hoursPerDay":     8,
 *   "distanceLabel":   "Durch die Khôm-Wüste",
 *
 *   "daysCurrent":     3,
 *   "daysTotal":       9,
 *
 *   "notes":           "Sandsturm morgen früh — halbe Tagesreise.",
 *   "lastUpdated":     "2026-03-20"
 * }
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
            `Synced at ${new Date().toLocaleTimeString()}` +
            (data.lastUpdated ? `  ·  GM: ${data.lastUpdated}` : ''));
    } catch (err) {
        setStatus(statusEl, 'error', `⚠️ ${err.message}`);
        renderDashboard(dashEl, {});
    }
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function renderDashboard(container, d) {
    const water       = d.waterCurrent  ?? 0;
    const waterMax    = d.waterMax      ?? 20;
    const waterUnit   = d.waterUnit     ?? 'Einheiten';

    const hoursWalked = d.hoursWalked   ?? 0;
    const hoursTotal  = d.hoursTotal    ?? 0;
    const hoursPerDay = d.hoursPerDay   ?? 8;
    const distLabel   = d.distanceLabel ?? '';

    const daysCurrent = d.daysCurrent   ?? 0;
    const daysTotal   = d.daysTotal     ?? null;

    const notes       = d.notes         ?? null;

    const waterPct    = waterMax   > 0 ? Math.min(100, (water / waterMax) * 100)         : 0;
    const hoursPct    = hoursTotal > 0 ? Math.min(100, (hoursWalked / hoursTotal) * 100) : 0;
    const hoursLeft   = Math.max(0, hoursTotal - hoursWalked);
    const daysLeft    = hoursPerDay > 0 ? (hoursLeft / hoursPerDay).toFixed(1) : '?';

    const waterColor  = waterPct > 60 ? '#3a9e6e'
                      : waterPct > 30 ? '#c9922a'
                      :                 '#c0392b';

    container.innerHTML = `

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
                    <div class="dsa-legend-row ${waterPct > 60 ? 'active' : ''}">🟢 Sicher &gt;60%</div>
                    <div class="dsa-legend-row ${waterPct <= 60 && waterPct > 30 ? 'active' : ''}">🟡 Knapp 31–60%</div>
                    <div class="dsa-legend-row ${waterPct <= 30 ? 'active' : ''}">🔴 Kritisch ≤30%</div>
                </div>
            </div>
        </div>

        <div class="dsa-card">
            <div class="dsa-card-header">
                <span class="dsa-card-icon">🏜️</span>
                <h3>Wüstendurchquerung</h3>
                ${distLabel ? `<span class="dsa-card-sub">${escHtml(distLabel)}</span>` : ''}
            </div>
            <div class="dsa-desert-track">
                <div class="dsa-track-bar">
                    <div class="dsa-track-fill" style="width:${hoursPct}%;"></div>
                    <span class="dsa-camel" style="left:calc(${hoursPct}% - 14px)">🐪</span>
                </div>
                <div class="dsa-track-labels">
                    <span>🏕️ Start</span>
                    <span>${Math.round(hoursPct)}%</span>
                    <span>🏙️ Ziel</span>
                </div>
            </div>
            <div class="dsa-stat-row">
                <div class="dsa-stat">
                    <span class="dsa-stat-num">${hoursWalked}</span>
                    <span class="dsa-stat-label">Stunden<br>gelaufen</span>
                </div>
                <div class="dsa-stat">
                    <span class="dsa-stat-num">${hoursLeft}</span>
                    <span class="dsa-stat-label">Stunden<br>verbleibend</span>
                </div>
                <div class="dsa-stat">
                    <span class="dsa-stat-num">~${daysLeft}</span>
                    <span class="dsa-stat-label">Tage noch<br>(${hoursPerDay}h/Tag)</span>
                </div>
                <div class="dsa-stat">
                    <span class="dsa-stat-num">${daysCurrent}${daysTotal ? ' / ' + daysTotal : ''}</span>
                    <span class="dsa-stat-label">Reisetag${daysTotal ? 'e' : ''}</span>
                </div>
            </div>
        </div>

        ${notes ? `
        <div class="dsa-card dsa-notes-card">
            <div class="dsa-card-header">
                <span class="dsa-card-icon">📜</span>
                <h3>Meisternotiz</h3>
            </div>
            <p class="dsa-notes-text">${escHtml(notes)}</p>
        </div>` : ''}
    `;

    requestAnimationFrame(() => {
        const ease  = '1.2s cubic-bezier(0.4,0,0.2,1)';
        const fill  = container.querySelector('.dsa-tank-fill');
        const track = container.querySelector('.dsa-track-fill');
        const camel = container.querySelector('.dsa-camel');
        if (fill)  fill.style.transition  = `height ${ease}`;
        if (track) track.style.transition = `width ${ease}`;
        if (camel) camel.style.transition = `left ${ease}`;
    });
}

function buildTicks(max) {
    return [75, 50, 25].map(pct => `
        <div class="dsa-tank-tick" style="bottom:${pct}%">
            <span class="dsa-tick-label">${Math.round(max * pct / 100)}</span>
        </div>`).join('');
}

function escHtml(str) {
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