/**
 * dsa_ui.js
 * Das Schwarze Auge — Wüsten-Tracker
 *
 * ARCHITECTURE:
 *   index.html    → needs ONLY: <div id="dsa-dashboard"></div>
 *   DSAData.json  → all content & values (GM edits this file)
 *   dsa_ui.js     → self-contained: injects CSS & HTML structure
 */

const DATA_URL = 'https://raw.githubusercontent.com/tstorygit/Tstory/main/DSAData.json';

// ─── CSS INJECTION ───────────────────────────────────────────────────────────

function injectStyles() {
    if (document.getElementById('dsa-injected-styles')) return;

    const style = document.createElement('style');
    style.id = 'dsa-injected-styles';
    style.innerHTML = `
        .dsa-wrapper {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 10px;
        }

        /* ── HEADER & CONTROLS ── */
        .dsa-header-controls {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            background: #fff;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            border-left: 5px solid #8b5a2b;
        }

        .dsa-header-controls h2 {
            margin: 0;
            color: #4a3b2c;
            font-size: 1.5rem;
        }

        .dsa-btn-refresh {
            background-color: #8b5a2b;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: background 0.2s;
        }
        
        .dsa-btn-refresh:hover {
            background-color: #6d4622;
        }

        /* ── STATUS MESSAGE ── */
        .dsa-status-message {
            display: none;
            padding: 10px 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            font-size: 0.9em;
            font-weight: bold;
        }
        .dsa-status-loading { background: #e8f4fd; color: #0275d8; }
        .dsa-status-success { background: #dff0d8; color: #3c763d; }
        .dsa-status-error   { background: #f2dede; color: #a94442; }

        /* ── CARDS ── */
        .dsa-card {
            background: #fff;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            border-left: 5px solid #8b5a2b;
        }

        .dsa-card-header {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
            border-bottom: 2px solid #f0f0f0;
            padding-bottom: 10px;
        }

        .dsa-card-header h3 {
            margin: 0;
            flex: 1;
            font-size: 1.2rem;
            color: #4a3b2c;
        }

        .dsa-card-icon { font-size: 1.5rem; margin-right: 10px; }
        .dsa-card-value { font-weight: bold; font-size: 1.1rem; color: #555; }

        /* ── WATER TANK ── */
        .dsa-tank-wrap { display: flex; align-items: center; gap: 30px; }
        .dsa-tank {
            width: 80px; height: 200px; background: #e0e0e0;
            border-radius: 8px; position: relative; overflow: hidden;
            box-shadow: inset 0 2px 5px rgba(0,0,0,0.2);
            border: 2px solid #ccc;
        }
        .dsa-tank-fill {
            position: absolute; bottom: 0; left: 0; width: 100%;
            transition: height 1.2s cubic-bezier(0.4,0,0.2,1);
        }
        .dsa-tank-label {
            position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%); font-weight: bold;
            color: white; text-shadow: 1px 1px 3px rgba(0,0,0,0.8); z-index: 10;
        }
        .dsa-legend-row { margin-bottom: 8px; color: #aaa; }
        .dsa-legend-row.active { font-weight: bold; color: #333; }

        /* ── PROGRESS BARS ── */
        .dsa-track-section { margin-bottom: 15px; }
        .dsa-track-meta { display: flex; align-items: center; font-size: 0.9rem; margin-bottom: 5px; }
        .dsa-track-title { flex: 1; font-weight: bold; margin-left: 5px; }
        .dsa-track-bar { height: 14px; background: #e0e0e0; border-radius: 7px; position: relative; }
        .dsa-track-fill { height: 100%; border-radius: 7px; width: 0%; }
        .dsa-fill-dist { background: #8e44ad; }
        .dsa-fill-time { background: #e67e22; }
        .dsa-camel {
            position: absolute; top: -26px; font-size: 1.6rem;
            transition: left 1.2s cubic-bezier(0.4,0,0.2,1);
        }
        .dsa-track-labels { display: flex; justify-content: space-between; font-size: 0.75rem; color: #777; margin-top: 4px; }

        /* ── STATS ROW ── */
        .dsa-stat-row {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
            gap: 15px; background: #f9f9f9; padding: 15px; border-radius: 8px; text-align: center;
        }
        .dsa-stat-num { display: block; font-size: 1.3rem; font-weight: bold; color: #333; }
        .dsa-stat-label { font-size: 0.8rem; color: #666; }

        /* ── MINI BAR FOR STAGES ── */
        .dsa-stage-mini-bar { height: 4px; background: #e0e0e0; margin-top: 5px; border-radius: 2px; width: 100%; }
        .dsa-stage-mini-fill { height: 100%; background: #8e44ad; border-radius: 2px; }
        .dsa-active-badge { background-color: #e67e22; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; }
        .dsa-notes-card { border-left-color: #e74c3c; background-color: #fffaf0; }
        
        .dsa-stage-row { display: flex; align-items: center; margin-bottom: 12px; }
        .dsa-stage-icon { margin-right: 12px; font-size: 1.2em; }
        .dsa-stage-info { flex: 1; }
        .dsa-stage-name { font-weight: bold; }
        .dsa-stage-meta { font-size: 0.85em; color: #666; }
    `;
    document.head.appendChild(style);
}

// ─── INIT ────────────────────────────────────────────────────────────────────

export function initDSA() {
    injectStyles();

    const rootEl = document.getElementById('dsa-dashboard');
    if (!rootEl) {
        console.error("DSA Tracker: Element <div id='dsa-dashboard'></div> nicht gefunden.");
        return;
    }

    // Grundstruktur injizieren (damit die User-HTML sauber bleibt)
    rootEl.innerHTML = `
        <div class="dsa-wrapper">
            <div class="dsa-header-controls">
                <h2>🐪 Khôm-Expedition</h2>
                <button id="dsa-internal-btn-refresh" class="dsa-btn-refresh">🔄 Aktualisieren</button>
            </div>
            <div id="dsa-internal-status" class="dsa-status-message"></div>
            <div id="dsa-content-area"></div>
        </div>
    `;

    document.getElementById('dsa-internal-btn-refresh')
        .addEventListener('click', () => fetchAndRender(true));

    fetchAndRender(false);
}

// ─── FETCH ───────────────────────────────────────────────────────────────────

async function fetchAndRender(showSpinner) {
    const statusEl = document.getElementById('dsa-internal-status');
    const contentEl = document.getElementById('dsa-content-area');

    if (showSpinner) setStatus(statusEl, 'loading', '⏳ Lade Daten...');

    try {
        const res = await fetch(DATA_URL + '?_=' + Date.now());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        renderDashboard(contentEl, data);
        setStatus(statusEl, 'success',
            `Synchronisiert: ${new Date().toLocaleTimeString()}` +
            (data.lastUpdated ? `  ·  Stand: ${data.lastUpdated}` : ''));
    } catch (err) {
        setStatus(statusEl, 'error', `⚠️ Fehler beim Laden: ${err.message}`);
        renderDashboard(contentEl, {});
    }
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function renderDashboard(container, d) {
    const water       = d.waterCurrent ?? 0;
    const waterMax    = d.waterMax     ?? 20;
    const waterUnit   = d.waterUnit    ?? 'Einheiten';
    const distUnit    = d.distanceUnit ?? 'Meilen';
    const hoursPerDay = d.hoursPerDay  ?? 8;
    const stages      = d.stages       ??[];
    const groupSize   = d.groupSize    ?? 7;
    
    // Event & Notes Logic
    const event       = d.currentEvent || null;
    const legacyNotes = typeof d.notes === 'string' ? d.notes : null;
    const effect      = event?.effect ?? 1.0;
    
    const effectiveHoursPerDay = +(hoursPerDay * effect).toFixed(1);

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
        ${active ? renderActiveStage(active, distUnit, hoursPerDay, effectiveHoursPerDay) : ''}

        <!-- ══ STAGE LIST ════════════════════════════════════════════════ -->
        ${renderStageList(stages, activeIdx, distUnit)}

        <!-- ══ GM NOTES & EVENTS ═════════════════════════════════════════ -->
        ${renderEventCard(event, legacyNotes, groupSize)}
    `;

    // Kick off CSS transitions after first paint
    requestAnimationFrame(() => {
        const ease = '1.2s cubic-bezier(0.4,0,0.2,1)';
        container.querySelector('.dsa-tank-fill')?.style.setProperty('transition', `height ${ease}`);
        container.querySelector('.dsa-fill-dist')?.style.setProperty('transition', `width ${ease}`);
        container.querySelector('.dsa-fill-time')?.style.setProperty('transition', `width ${ease}`);
        container.querySelector('.dsa-camel')?.style.setProperty('transition', `left ${ease}`);
    });
}

// ─── ACTIVE STAGE CARD ───────────────────────────────────────────────────────

function renderActiveStage(s, distUnit, baseHours, effectiveHours) {
    const traveled = s.distanceTraveled ?? 0;
    const walked   = s.hoursWalked      ?? 0;
    const distPct  = s.distanceTotal > 0 ? Math.min(100, traveled / s.distanceTotal * 100) : 0;
    const hoursPct = s.hoursTotal    > 0 ? Math.min(100, walked   / s.hoursTotal    * 100) : 0;
    const distLeft = +(Math.max(0, s.distanceTotal - traveled)).toFixed(2);
    const hoursLeft = +(Math.max(0, s.hoursTotal - walked)).toFixed(2);
    
    const daysLeft = effectiveHours > 0 ? (hoursLeft / effectiveHours).toFixed(1) : '∞';
    
    let speedStyle = '';
    if (effectiveHours < baseHours) speedStyle = 'color: #c0392b; font-weight: bold;'; 
    if (effectiveHours > baseHours) speedStyle = 'color: #3a9e6e; font-weight: bold;'; 

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
                <span class="dsa-stat-label">Tage noch<br><em style="${speedStyle}">(${effectiveHours}h/Tag)</em></span>
            </div>
        </div>
    </div>`;
}

// ─── EVENT & NOTES CARD ──────────────────────────────────────────────────────

function renderEventCard(event, legacyNotes, groupSize) {
    if (!event && !legacyNotes) return '';

    const title = event?.trigger ? `⚠️ ${esc(event.trigger)}` : `📜 Meisternotiz`;
    const text  = event?.notes ? esc(event.notes) : esc(legacyNotes);
    
    let statsHtml = '';
    
    if (event) {
        const waterMod = event.waterModifier ?? 1.0;
        const effect   = event.effect ?? 1.0;
        
        const reqOptHead = +(5 * waterMod).toFixed(1);
        const reqRatHead = +(3 * waterMod).toFixed(1);
        
        const reqOptGroup = +(reqOptHead * groupSize).toFixed(1);
        const reqRatGroup = +(reqRatHead * groupSize).toFixed(1);
        
        const spdPct = Math.round(effect * 100);

        statsHtml = `
        <div style="display:flex; flex-wrap:wrap; gap:12px; margin-top:16px; padding:12px; background:rgba(0,0,0,0.04); border-radius:6px; font-size:0.95em; border: 1px solid rgba(0,0,0,0.1);">
            <div style="flex:1; min-width:140px;">
                <span style="display:block; font-size:1.1em; margin-bottom:6px;">💧 <strong>Normal</strong></span>
                <span style="font-size:1.1em; color:#333;"><strong>${reqOptHead} L</strong> / Kopf</span><br>
                <span style="color:#666; font-size:0.9em;">Gesamt: ${reqOptGroup} L</span>
            </div>
            <div style="flex:1; min-width:140px;">
                <span style="display:block; font-size:1.1em; margin-bottom:6px;">🏜️ <strong>Rationiert</strong></span>
                <span style="font-size:1.1em; color:#333;"><strong>${reqRatHead} L</strong> / Kopf</span><br>
                <span style="color:#666; font-size:0.9em;">Gesamt: ${reqRatGroup} L</span>
            </div>
            <div style="flex:1; min-width:100px; border-left: 1px solid rgba(0,0,0,0.1); padding-left: 12px;">
                <span style="display:block; font-size:1.1em; margin-bottom:6px;">⏱️ <strong>Tempo</strong></span>
                <span style="font-size:1.2em; color:${spdPct < 100 ? '#c0392b' : spdPct > 100 ? '#3a9e6e' : '#333'};">
                    <strong>${spdPct}%</strong>
                </span>
            </div>
        </div>`;
    }

    return `
    <div class="dsa-card dsa-notes-card">
        <div class="dsa-card-header">
            <h3 style="margin: 0;">${title}</h3>
        </div>
        <p style="margin-bottom:0; margin-top: 10px; line-height: 1.5;">${text}</p>
        ${statsHtml}
    </div>`;
}

// ─── STAGE LIST CARD ─────────────────────────────────────────────────────────

function renderStageList(stages, activeIdx, distUnit) {
    if (!stages.length) return '';

    const rows = stages.map((s, i) => {
        const isDone    = s.done === true;
        const isActive  = i === activeIdx;

        let icon, extra = '';

        if (isDone) {
            icon = '✅';
        } else if (isActive) {
            const pct = s.distanceTotal > 0
                ? Math.round((s.distanceTraveled ?? 0) / s.distanceTotal * 100) : 0;
            icon  = '🐪';
            extra = `<div class="dsa-stage-mini-bar"><div class="dsa-stage-mini-fill" style="width:${pct}%"></div></div>`;
        } else {
            icon = '⬜';
        }

        return `
        <div class="dsa-stage-row">
            <span class="dsa-stage-icon">${icon}</span>
            <div class="dsa-stage-info">
                <div class="dsa-stage-name">${esc(s.name)}</div>
                <div class="dsa-stage-meta">${s.distanceTotal} ${distUnit} · ${s.hoursTotal} Std.</div>
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
        <div style="margin-top: 15px;">${rows}</div>
    </div>`;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function buildTicks(max) {
    return [75, 50, 25].map(pct => `
        <div style="position:absolute; bottom:${pct}%; left:0; width:100%; border-bottom:1px solid rgba(255,255,255,0.5);">
            <span style="position:absolute; left:5px; bottom:2px; font-size:10px; color:#fff; text-shadow: 1px 1px 2px #000;">
                ${Math.round(max * pct / 100)}
            </span>
        </div>`).join('');
}

function esc(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\n/g,'<br>');
}

function setStatus(el, type, msg) {
    if (!el) return;
    el.className = `dsa-status-message dsa-status-${type}`;
    el.textContent = msg;
    el.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => { el.style.display = 'none'; }, 8000);
    }
}