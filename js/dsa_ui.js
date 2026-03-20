/**
 * dsa_ui.js
 * Renders and drives the "DSA" tab — Das Schwarze Auge / pen-and-paper game tracker.
 *
 * Fetches a JSON file from a configurable GitHub raw URL so the GM can update
 * values centrally and all players see them on next refresh.
 *
 * Expected JSON shape (all fields optional with sane defaults):
 * {
 *   "waterCurrent": 12,        // current water units
 *   "waterMax": 20,            // maximum water units
 *   "waterUnit": "Krug",       // label for the unit (optional)
 *   "distanceTotal": 80,       // total distance of the desert crossing (km/leagues/etc.)
 *   "distanceTraveled": 23,    // distance covered so far
 *   "distanceUnit": "Meilen",  // label for distance unit (optional)
 *   "daysCurrent": 3,          // days elapsed
 *   "daysTotal": 10,           // expected total days
 *   "notes": "Sandstorm ahead — movement halved tomorrow.",
 *   "lastUpdated": "2026-03-20"
 * }
 */

const DSA_URL_KEY   = 'dsa_data_url';
const DEFAULT_URL   = 'https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/dsa-state.json';

// ─── INIT ────────────────────────────────────────────────────────────────────

export function initDSA() {
    const urlInput = document.getElementById('dsa-data-url');
    if (urlInput) urlInput.value = getDSAUrl();

    document.getElementById('btn-dsa-save-url')
        ?.addEventListener('click', handleSaveUrl);

    document.getElementById('btn-dsa-refresh')
        ?.addEventListener('click', () => fetchAndRender(true));

    // Refresh whenever the tab is opened
    const tab = document.querySelector('button[data-target="view-dsa"]');
    if (tab) tab.addEventListener('click', () => fetchAndRender(false));

    // Initial load
    fetchAndRender(false);
}

// ─── URL HELPERS ─────────────────────────────────────────────────────────────

function getDSAUrl() {
    return localStorage.getItem(DSA_URL_KEY) || DEFAULT_URL;
}

function handleSaveUrl() {
    const val = document.getElementById('dsa-data-url')?.value.trim();
    if (val) {
        localStorage.setItem(DSA_URL_KEY, val);
        fetchAndRender(true);
    }
}

// ─── FETCH ───────────────────────────────────────────────────────────────────

async function fetchAndRender(showSpinner) {
    const url = getDSAUrl();
    const statusEl = document.getElementById('dsa-fetch-status');
    const dashEl   = document.getElementById('dsa-dashboard');

    if (showSpinner) setStatus(statusEl, 'loading', '⏳ Fetching data…');

    try {
        // Cache-bust so GitHub serves fresh content
        const res = await fetch(url + '?_=' + Date.now());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        renderDashboard(dashEl, data);
        setStatus(statusEl, 'success',
            `Last fetched: ${new Date().toLocaleTimeString()}` +
            (data.lastUpdated ? `  ·  GM updated: ${data.lastUpdated}` : ''));
    } catch (err) {
        setStatus(statusEl, 'error', `⚠️ Could not load data: ${err.message}`);
        // Show the dashboard with zeroed-out demo data so layout is visible
        renderDashboard(dashEl, {});
    }
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function renderDashboard(container, d) {
    const water          = d.waterCurrent   ?? 0;
    const waterMax       = d.waterMax       ?? 20;
    const waterUnit      = d.waterUnit      ?? 'units';
    const distTraveled   = d.distanceTraveled ?? 0;
    const distTotal      = d.distanceTotal  ?? 100;
    const distUnit       = d.distanceUnit   ?? 'leagues';
    const daysCurrent    = d.daysCurrent    ?? 0;
    const daysTotal      = d.daysTotal      ?? null;
    const notes          = d.notes          ?? null;

    const waterPct   = waterMax  > 0 ? Math.min(100, (water / waterMax) * 100)       : 0;
    const distPct    = distTotal > 0 ? Math.min(100, (distTraveled / distTotal) * 100) : 0;
    const remaining  = Math.max(0, distTotal - distTraveled);

    // Water colour: green → yellow → red
    const waterColor = waterPct > 60 ? '#3a9e6e'
                     : waterPct > 30 ? '#c9922a'
                     :                 '#c0392b';

    container.innerHTML = `

        <!-- ── WATER RESERVE ─────────────────────────────────────────── -->
        <div class="dsa-card">
            <div class="dsa-card-header">
                <span class="dsa-card-icon">💧</span>
                <h3>Water Reserve</h3>
                <span class="dsa-card-value">${water} / ${waterMax} ${waterUnit}</span>
            </div>

            <div class="dsa-tank-wrap">
                <!-- Tank outline -->
                <div class="dsa-tank">
                    <!-- Animated fill -->
                    <div class="dsa-tank-fill" style="height:${waterPct}%; background:${waterColor};"></div>
                    <!-- Tick marks -->
                    ${buildTicks(waterMax)}
                    <!-- Percentage label inside tank -->
                    <span class="dsa-tank-label">${Math.round(waterPct)}%</span>
                </div>
                <!-- Legend alongside -->
                <div class="dsa-tank-legend">
                    <div class="dsa-legend-row ${waterPct > 60 ? 'active' : ''}">🟢 Safe &gt;60%</div>
                    <div class="dsa-legend-row ${waterPct <= 60 && waterPct > 30 ? 'active' : ''}">🟡 Caution 31–60%</div>
                    <div class="dsa-legend-row ${waterPct <= 30 ? 'active' : ''}">🔴 Critical ≤30%</div>
                </div>
            </div>
        </div>

        <!-- ── DESERT CROSSING ───────────────────────────────────────── -->
        <div class="dsa-card">
            <div class="dsa-card-header">
                <span class="dsa-card-icon">🏜️</span>
                <h3>Desert Crossing</h3>
                <span class="dsa-card-value">${distTraveled} / ${distTotal} ${distUnit}</span>
            </div>

            <div class="dsa-desert-track">
                <!-- Progress bar -->
                <div class="dsa-track-bar">
                    <div class="dsa-track-fill" style="width:${distPct}%;"></div>
                    <span class="dsa-camel" style="left:calc(${distPct}% - 14px)">🐪</span>
                </div>
                <div class="dsa-track-labels">
                    <span>🏕️ Start</span>
                    <span>${Math.round(distPct)}% done</span>
                    <span>🏙️ Goal</span>
                </div>
            </div>

            <div class="dsa-stat-row">
                <div class="dsa-stat">
                    <span class="dsa-stat-num">${distTraveled}</span>
                    <span class="dsa-stat-label">Traveled<br>${distUnit}</span>
                </div>
                <div class="dsa-stat">
                    <span class="dsa-stat-num">${remaining}</span>
                    <span class="dsa-stat-label">Remaining<br>${distUnit}</span>
                </div>
                <div class="dsa-stat">
                    <span class="dsa-stat-num">${daysCurrent}${daysTotal ? ' / ' + daysTotal : ''}</span>
                    <span class="dsa-stat-label">Day${daysTotal ? 's' : ''}</span>
                </div>
            </div>
        </div>

        <!-- ── GM NOTES ──────────────────────────────────────────────── -->
        ${notes ? `
        <div class="dsa-card dsa-notes-card">
            <div class="dsa-card-header">
                <span class="dsa-card-icon">📜</span>
                <h3>GM Notes</h3>
            </div>
            <p class="dsa-notes-text">${escHtml(notes)}</p>
        </div>` : ''}
    `;

    // Animate the tank fill after paint
    requestAnimationFrame(() => {
        const fill = container.querySelector('.dsa-tank-fill');
        if (fill) fill.style.transition = 'height 1.2s cubic-bezier(0.4,0,0.2,1)';
        const track = container.querySelector('.dsa-track-fill');
        if (track) track.style.transition = 'width 1.2s cubic-bezier(0.4,0,0.2,1)';
        const camel = container.querySelector('.dsa-camel');
        if (camel) camel.style.transition = 'left 1.2s cubic-bezier(0.4,0,0.2,1)';
    });
}

/** Build horizontal tick lines inside the tank every 25% */
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

// ─── STATUS ──────────────────────────────────────────────────────────────────

function setStatus(el, type, msg) {
    if (!el) return;
    el.className = `status-message status-${type}`;
    el.textContent = msg;
    el.style.display = 'block';
    if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 8000);
}
