// js/games/neko/neko_expeditions.js — Cat Expeditions & Souvenir Album
//
// ADDITIVE side-system for NekoNihongo. Idle cats are sent on timed trips and
// return with small, production-scaled rewards. It deliberately does NOT touch
// the tuned economy curves:
//   - Fish rewards are a fixed number of SECONDS of current idle production
//     (scale-invariant at every stage of the game).
//   - Yarn rewards are a small multiple of one correct Dojo answer's yarn
//     (computed by the same formula the Dojo uses).
//   - Souvenirs are album collectibles: +0.5% global production per UNIQUE
//     souvenir owned (12 total → max +6%). Duplicates convert to a small
//     fish pouch (60s of production).
//
// Vocab-review hooks (into the existing Dojo flow, no parallel quiz):
//   1. Success odds = 60% + 35% × recent Dojo accuracy (last 20 answers).
//   2. Every correct Dojo answer shaves 1% off the remaining travel time of
//      all running expeditions.
//
// All state lives in _g.exped inside the main neko save (see
// expedDefaultState / normalizeExpedState) — old saves load safely because
// neko.js normalises the field with defaults. Timers run on the game clock
// (_gameNow), so pausing / closing the app freezes trips exactly like SRS
// review timers.

let _ctx = null;   // injected by neko.js via initExpeditions()

const CAT_EMOJI = ['🐱', '🐈', '🐈‍⬛', '😼', '😺'];

const RARITY_META = {
    c: { label: 'Common',   color: '#7f8c8d' },
    u: { label: 'Uncommon', color: '#2980b9' },
    r: { label: 'Rare',     color: '#a55eea' },
};

export const EXPED_SOUVENIRS = {
    leaf:    { name: 'Momiji Leaf',     emoji: '🍁', rarity: 'c' },
    pebble:  { name: 'Lucky Pebble',    emoji: '🪨', rarity: 'c' },
    feather: { name: 'Sparrow Feather', emoji: '🪶', rarity: 'c' },
    shell:   { name: 'Harbor Shell',    emoji: '🐚', rarity: 'c' },
    acorn:   { name: 'Autumn Acorn',    emoji: '🌰', rarity: 'c' },
    chime:   { name: 'Wind Chime',      emoji: '🎐', rarity: 'c' },
    lantern: { name: 'Paper Lantern',   emoji: '🏮', rarity: 'u' },
    omamori: { name: 'Omamori Charm',   emoji: '🧧', rarity: 'u' },
    koi:     { name: 'Koi Streamer',    emoji: '🎏', rarity: 'u' },
    mask:    { name: 'Fox Mask',        emoji: '🦊', rarity: 'u' },
    crystal: { name: 'Moon Crystal',    emoji: '🔮', rarity: 'r' },
    crown:   { name: 'Neko Crown',      emoji: '👑', rarity: 'r' },
};

export const EXPED_DESTINATIONS = {
    backyard: {
        name: 'Backyard Stroll', emoji: '🏡', mins: 3, wordsReq: 0,
        fishSec: 45, yarnMult: 0, souvenirChance: 0.15,
        weights: { c: 1, u: 0, r: 0 },
        desc: 'A quick sniff around the garden. Small fish pouch, common trinkets.',
    },
    market: {
        name: 'Harbor Market', emoji: '⚓', mins: 10, wordsReq: 10,
        fishSec: 150, yarnMult: 2, souvenirChance: 0.20,
        weights: { c: 0.8, u: 0.2, r: 0 },
        desc: 'Haggle for fish scraps at the docks. A little yarn on the side.',
    },
    shrine: {
        name: 'Mountain Shrine', emoji: '⛩️', mins: 30, wordsReq: 25,
        fishSec: 480, yarnMult: 5, souvenirChance: 0.30,
        weights: { c: 0.55, u: 0.35, r: 0.10 },
        desc: 'A long climb to pray for good grades. Rare charms live up here.',
    },
    moon: {
        name: 'Moonlight Trail', emoji: '🌙', mins: 120, wordsReq: 60,
        fishSec: 1500, yarnMult: 12, souvenirChance: 0.45,
        weights: { c: 0.35, u: 0.45, r: 0.20 },
        desc: 'An overnight wander under the moon. The best souvenirs come home at dawn.',
    },
};

// ─── State helpers ────────────────────────────────────────────────────────────

export function expedDefaultState() {
    return {
        active: [],        // [{ destId, cat, startTime, endTime, notified }] — game-clock ms
        souvenirs: {},     // { souvenirId: count }
        totalTrips: 0,
        totalSuccess: 0,
        totalFails: 0,
        recent: [],        // last 20 dojo answers (1 = correct, 0 = wrong)
    };
}

/** Merge a possibly-missing / partial save field into a fully valid state. */
export function normalizeExpedState(raw) {
    const d = expedDefaultState();
    if (!raw || typeof raw !== 'object') return d;
    return {
        active: Array.isArray(raw.active)
            ? raw.active
                .filter(e => e && EXPED_DESTINATIONS[e.destId]
                    && typeof e.startTime === 'number' && typeof e.endTime === 'number')
                .slice(0, 3)
            : d.active,
        souvenirs:    (raw.souvenirs && typeof raw.souvenirs === 'object') ? raw.souvenirs : d.souvenirs,
        totalTrips:   raw.totalTrips   || 0,
        totalSuccess: raw.totalSuccess || 0,
        totalFails:   raw.totalFails   || 0,
        recent:       Array.isArray(raw.recent) ? raw.recent.slice(-20) : [],
    };
}

/** Global production multiplier from unique souvenirs: +0.5% each, max +6%. */
export function getAlbumBonus(exped) {
    if (!exped || !exped.souvenirs) return 1;
    let unique = 0;
    for (const k in exped.souvenirs) {
        if (EXPED_SOUVENIRS[k] && exped.souvenirs[k] > 0) unique++;
    }
    return 1 + unique * 0.005;
}

/**
 * Called by the Dojo on every graded answer.
 * Records recent accuracy and — on a correct answer — shaves 1% off the
 * remaining travel time of every running expedition.
 */
export function expedRecordAnswer(exped, isCorrect, now) {
    if (!exped) return;
    exped.recent.push(isCorrect ? 1 : 0);
    if (exped.recent.length > 20) exped.recent.splice(0, exped.recent.length - 20);
    if (isCorrect && Array.isArray(exped.active)) {
        exped.active.forEach(e => {
            const remaining = e.endTime - now;
            if (remaining > 0) e.endTime = now + remaining * 0.99;
        });
    }
}

/** Recent Dojo accuracy 0–1 (neutral 0.75 until 5 answers are recorded). */
export function expedAccuracy(exped) {
    if (!exped || !Array.isArray(exped.recent) || exped.recent.length < 5) return 0.75;
    return exped.recent.reduce((a, b) => a + b, 0) / exped.recent.length;
}

/** Expedition success odds: 60% base + up to 35% from recent accuracy (cap 95%). */
export function expedSuccessChance(exped) {
    return Math.min(0.95, 0.60 + 0.35 * expedAccuracy(exped));
}

/** Slots: 1 base, 2nd at 40 active words, 3rd at 120 (free — no currency cost). */
export function expedMaxSlots(activeWords) {
    return activeWords >= 120 ? 3 : activeWords >= 40 ? 2 : 1;
}

// ─── Wiring ───────────────────────────────────────────────────────────────────

/**
 * ctx = {
 *   getG, gameNow, getFishPerSec, yarnPerAnswer, fmtN, formatTime,
 *   toast, saveGame, getGameEl, getActiveWordCount
 * }
 */
export function initExpeditions(ctx) {
    _ctx = ctx;
    _injectExpedStyles();
}

// ─── Game-loop tick (throttled internally to 4×/sec) ─────────────────────────

let _lastTickAt = 0;

export function tickExpeditions() {
    if (!_ctx) return;
    const real = Date.now();
    if (real - _lastTickAt < 250) return;
    _lastTickAt = real;

    const gameEl = _ctx.getGameEl();
    if (!gameEl) return;
    const g  = _ctx.getG();
    const ex = g && g.exped;
    if (!ex || !Array.isArray(ex.active)) return;
    const now = _ctx.gameNow();

    // Ready count + one-time "cat is back" toast per trip
    let ready = 0;
    ex.active.forEach(e => {
        if (e.endTime <= now) {
            ready++;
            if (!e.notified) {
                e.notified = true;
                const d = EXPED_DESTINATIONS[e.destId];
                _ctx.toast(`🧳 ${e.cat} is back from ${d ? d.name : 'a trip'}! Collect in Trips.`, 'var(--nk-gold)');
            }
        }
    });

    const badge = gameEl.querySelector('#nk-exped-badge');
    if (badge) {
        badge.textContent   = ready;
        badge.style.display = ready > 0 ? 'inline-block' : 'none';
    }

    // Live countdown updates only while the Trips tab is visible
    const tab = gameEl.querySelector('#nk-tab-exped');
    if (!tab || !tab.classList.contains('active')) return;

    let needsRerender = false;
    const slotEls = tab.querySelectorAll('.nk-exped-slot');
    ex.active.forEach((e, i) => {
        const isReady = e.endTime <= now;
        const slotEl  = slotEls[i];
        if (!slotEl) { needsRerender = true; return; }
        const wasReady = slotEl.getAttribute('data-ready') === '1';
        if (isReady !== wasReady) { needsRerender = true; return; }
        if (!isReady) {
            const t = tab.querySelector(`#nk-exped-time-${i}`);
            if (t) t.textContent = _ctx.formatTime((e.endTime - now) / 1000);
            const bar = tab.querySelector(`#nk-exped-bar-${i}`);
            if (bar) {
                const pct = Math.min(100, Math.max(0,
                    ((now - e.startTime) / Math.max(1, e.endTime - e.startTime)) * 100));
                bar.style.width = pct.toFixed(1) + '%';
            }
        }
    });
    if (needsRerender) renderExpedTab();
}

// ─── Actions ──────────────────────────────────────────────────────────────────

function _startExpedition(destId) {
    if (!_ctx) return;
    const g  = _ctx.getG();
    const ex = g.exped;
    const d  = EXPED_DESTINATIONS[destId];
    if (!ex || !d) return;

    const words = _ctx.getActiveWordCount();
    if (words < d.wordsReq) {
        _ctx.toast(`Needs ${d.wordsReq} active words (have ${words})`, '#e17055');
        return;
    }
    if (ex.active.length >= expedMaxSlots(words)) {
        _ctx.toast('All expedition slots are busy!', '#e17055');
        return;
    }

    const now = _ctx.gameNow();
    ex.active.push({
        destId,
        cat:       CAT_EMOJI[Math.floor(Math.random() * CAT_EMOJI.length)],
        startTime: now,
        endTime:   now + d.mins * 60000,
        notified:  false,
    });
    ex.totalTrips++;
    _ctx.saveGame();
    _ctx.toast(`${d.emoji} A cat set off to ${d.name}!`, 'var(--nk-btn)');
    renderExpedTab();
}

function _collectExpedition(idx) {
    if (!_ctx) return;
    const g  = _ctx.getG();
    const ex = g.exped;
    if (!ex) return;
    const e = ex.active[idx];
    if (!e) return;
    const now = _ctx.gameNow();
    if (e.endTime > now) return; // not ready yet

    const d = EXPED_DESTINATIONS[e.destId] || EXPED_DESTINATIONS.backyard;
    ex.active.splice(idx, 1);

    const fps     = _ctx.getFishPerSec();
    const success = Math.random() < expedSuccessChance(ex);

    if (success) {
        ex.totalSuccess++;
        const fish = Math.max(50, fps * d.fishSec);
        g.fish += fish;
        g.stats.fishEarned += fish;
        let msg = `${e.cat} returned from ${d.name}! +${_ctx.fmtN(fish)} 🐟`;

        if (d.yarnMult > 0) {
            const yarn = Math.max(1, Math.ceil(_ctx.yarnPerAnswer() * d.yarnMult));
            g.yarn += yarn;
            g.stats.yarnEarned += yarn;
            msg += ` +${_ctx.fmtN(yarn)} 🧶`;
        }

        if (Math.random() < d.souvenirChance) {
            const sId = _rollSouvenir(d);
            if (sId) {
                const s     = EXPED_SOUVENIRS[sId];
                const owned = (ex.souvenirs[sId] || 0) > 0;
                ex.souvenirs[sId] = (ex.souvenirs[sId] || 0) + 1;
                if (owned) {
                    const dupFish = Math.max(25, fps * 60);
                    g.fish += dupFish;
                    g.stats.fishEarned += dupFish;
                    _ctx.toast(`${s.emoji} Duplicate ${s.name} — traded for ${_ctx.fmtN(dupFish)} 🐟`, '#888');
                } else {
                    _ctx.toast(`✨ New souvenir: ${s.emoji} ${s.name}! (+0.5% production)`, 'var(--nk-gold)');
                }
            }
        }
        _ctx.toast(msg, 'var(--nk-success)');
    } else {
        ex.totalFails++;
        const fish = Math.max(10, fps * d.fishSec * 0.2);
        g.fish += fish;
        g.stats.fishEarned += fish;
        _ctx.toast(`${e.cat} got distracted chasing butterflies… only +${_ctx.fmtN(fish)} 🐟`, '#e17055');
    }

    _ctx.saveGame();
    renderExpedTab();
}

function _rollSouvenir(dest) {
    const w    = dest.weights;
    const roll = Math.random() * (w.c + w.u + w.r);
    const rarity = roll < w.c ? 'c' : (roll < w.c + w.u ? 'u' : 'r');
    const pool = Object.keys(EXPED_SOUVENIRS).filter(k => EXPED_SOUVENIRS[k].rarity === rarity);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Rendering ────────────────────────────────────────────────────────────────

export function renderExpedTab() {
    if (!_ctx) return;
    const root = _ctx.getGameEl()?.querySelector('#nk-exped-root');
    if (!root) return;
    const g  = _ctx.getG();
    const ex = g.exped;
    if (!ex) return;

    const now    = _ctx.gameNow();
    const words  = _ctx.getActiveWordCount();
    const slots  = expedMaxSlots(words);
    const acc    = Math.round(expedAccuracy(ex) * 100);
    const chance = Math.round(expedSuccessChance(ex) * 100);

    // ── Slots ──
    let slotsHtml = '';
    for (let i = 0; i < 3; i++) {
        if (i < ex.active.length) {
            const e = ex.active[i];
            const d = EXPED_DESTINATIONS[e.destId];
            const isReady = e.endTime <= now;
            if (isReady) {
                slotsHtml += `
                <div class="nk-exped-slot nk-exped-ready" data-ready="1">
                    <div class="nk-exped-slot-head">${e.cat} ${d.emoji} <strong>${d.name}</strong></div>
                    <button class="nk-exped-collect-btn" data-idx="${i}">🎁 Welcome back! Collect</button>
                </div>`;
            } else {
                const pct = Math.min(100, Math.max(0,
                    ((now - e.startTime) / Math.max(1, e.endTime - e.startTime)) * 100));
                slotsHtml += `
                <div class="nk-exped-slot" data-ready="0">
                    <div class="nk-exped-slot-head">${e.cat} → ${d.emoji} <strong>${d.name}</strong></div>
                    <div class="nk-exped-bar-wrap"><div class="nk-exped-bar" id="nk-exped-bar-${i}" style="width:${pct.toFixed(1)}%;"></div></div>
                    <div class="nk-exped-slot-sub">Returns in <span id="nk-exped-time-${i}">${_ctx.formatTime((e.endTime - now) / 1000)}</span> · ✅ correct answers speed this up</div>
                </div>`;
            }
        } else if (i < slots) {
            slotsHtml += `<div class="nk-exped-slot nk-exped-slot-empty">😿 Slot open — send a cat below!</div>`;
        } else {
            const req = i === 1 ? 40 : 120;
            slotsHtml += `<div class="nk-exped-slot nk-exped-slot-locked">🔒 Slot ${i + 1} unlocks at ${req} active words (have ${words})</div>`;
        }
    }

    // ── Destinations ──
    const canSend  = ex.active.length < slots;
    const fpsNow   = _ctx.getFishPerSec();
    const destHtml = Object.entries(EXPED_DESTINATIONS).map(([id, d]) => {
        const locked   = words < d.wordsReq;
        const disabled = locked || !canSend;
        const timeLbl  = d.mins < 60 ? `${d.mins} min` : `${d.mins / 60} h`;
        return `
        <div class="nk-exped-dest${locked ? ' nk-exped-dest-locked' : ''}">
            <div class="nk-exped-dest-info">
                <strong>${d.emoji} ${d.name}</strong>
                <span class="nk-exped-dest-time">⏱ ${timeLbl}</span><br>
                <small>${d.desc}</small><br>
                <small class="nk-exped-dest-loot">🐟 ~${_ctx.fmtN(Math.max(50, fpsNow * d.fishSec))}${d.yarnMult > 0 ? ' · 🧶 small bundle' : ''} · 🎁 ${Math.round(d.souvenirChance * 100)}% souvenir</small>
            </div>
            <button class="nk-exped-send-btn" data-dest="${id}"${disabled ? ' disabled' : ''}>${locked ? `🔒 ${d.wordsReq}w` : 'Send'}</button>
        </div>`;
    }).join('');

    // ── Album ──
    let unique = 0;
    for (const k in ex.souvenirs) {
        if (EXPED_SOUVENIRS[k] && ex.souvenirs[k] > 0) unique++;
    }
    const totalKinds = Object.keys(EXPED_SOUVENIRS).length;
    const bonusPct   = (unique * 0.5).toFixed(1);
    const albumHtml  = Object.entries(EXPED_SOUVENIRS).map(([id, s]) => {
        const count = ex.souvenirs[id] || 0;
        const meta  = RARITY_META[s.rarity];
        if (count > 0) {
            return `
            <div class="nk-exped-souvenir" style="border-color:${meta.color};">
                <div class="nk-exped-souvenir-emoji">${s.emoji}</div>
                <div class="nk-exped-souvenir-name">${s.name}</div>
                <div class="nk-exped-souvenir-rarity" style="color:${meta.color};">${meta.label}${count > 1 ? ` ×${count}` : ''}</div>
            </div>`;
        }
        return `
            <div class="nk-exped-souvenir nk-exped-souvenir-unknown">
                <div class="nk-exped-souvenir-emoji">❓</div>
                <div class="nk-exped-souvenir-name">???</div>
                <div class="nk-exped-souvenir-rarity" style="color:${meta.color};">${meta.label}</div>
            </div>`;
    }).join('');

    root.innerHTML = `
        <div class="nk-shop-title">🧳 Cat Expeditions</div>
        <div class="nk-exped-info">
            Send an idle cat on a trip — it comes home with a fish pouch, sometimes yarn,
            and maybe a souvenir for your album.<br>
            🎯 Recent Dojo accuracy <strong>${acc}%</strong> → success odds <strong>${chance}%</strong>.
            Correct answers also make travelling cats walk faster.
        </div>
        <div id="nk-exped-active">${slotsHtml}</div>
        <div class="nk-shop-title" style="margin-top:14px;">Destinations</div>
        ${destHtml}
        <div class="nk-shop-title" style="margin-top:14px;">📔 Souvenir Album — ${unique}/${totalKinds}
            <span class="nk-exped-bonus-label">+${bonusPct}% production</span>
        </div>
        <div class="nk-exped-album">${albumHtml}</div>
    `;

    root.querySelectorAll('.nk-exped-send-btn').forEach(btn => {
        btn.addEventListener('click', () => _startExpedition(btn.getAttribute('data-dest')));
    });
    root.querySelectorAll('.nk-exped-collect-btn').forEach(btn => {
        btn.addEventListener('click', () => _collectExpedition(parseInt(btn.getAttribute('data-idx'), 10)));
    });
}

// ─── Styles (nk- prefixed, mirrors neko.js injection pattern) ─────────────────

function _injectExpedStyles() {
    if (document.getElementById('neko-exped-styles')) return;
    const style = document.createElement('style');
    style.id = 'neko-exped-styles';
    style.textContent = `
.nk-exped-info {
    background: white; border: 1px solid rgba(0,0,0,0.05); border-radius: 8px;
    padding: 10px 12px; font-size: 12px; color: #888; line-height: 1.5;
    margin-bottom: 12px;
}
.nk-exped-slot {
    background: white; border: 1px solid rgba(0,0,0,0.05); border-radius: 8px;
    padding: 10px 12px; margin-bottom: 8px; font-size: 13px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.03);
}
.nk-exped-slot-empty, .nk-exped-slot-locked {
    background: transparent; border: 1px dashed #ccc; box-shadow: none;
    color: #aaa; text-align: center; font-size: 12px; padding: 14px 12px;
}
.nk-exped-ready {
    border-color: var(--nk-gold);
    box-shadow: 0 0 8px rgba(255,211,42,0.35);
}
.nk-exped-slot-head { margin-bottom: 6px; }
.nk-exped-slot-sub  { font-size: 11px; color: #888; margin-top: 4px; }
.nk-exped-bar-wrap {
    height: 6px; background: rgba(0,0,0,0.08); border-radius: 3px; overflow: hidden;
}
.nk-exped-bar {
    height: 100%; background: var(--nk-btn); border-radius: 3px;
    transition: width 0.3s linear;
}
.nk-exped-collect-btn {
    width: 100%; padding: 12px; margin-top: 4px; border: none; border-radius: 10px;
    background: var(--nk-gold); color: #5c4033; font-size: 14px; font-weight: bold;
    cursor: pointer; box-shadow: 0 3px 0 #cc9900;
    animation: nkPulse 2s infinite;
}
.nk-exped-collect-btn:active { transform: translateY(3px); box-shadow: none; }
.nk-exped-dest {
    background: white; padding: 10px; border-radius: 8px; margin-bottom: 8px;
    display: flex; justify-content: space-between; align-items: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.03);
    border: 1px solid rgba(0,0,0,0.05);
}
.nk-exped-dest-locked { opacity: 0.55; }
.nk-exped-dest-info { flex: 1; padding-right: 8px; font-size: 13px; }
.nk-exped-dest-time { font-size: 11px; opacity: 0.6; margin-left: 5px; }
.nk-exped-dest-loot { color: #888; }
.nk-exped-send-btn {
    background: var(--nk-btn); border: none; padding: 10px 12px; border-radius: 6px;
    color: white; font-weight: bold; min-width: 80px; min-height: 40px;
    font-size: 12px; cursor: pointer;
}
.nk-exped-send-btn:disabled { background: #e0e0e0; color: #aaa; }
.nk-exped-album {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    gap: 8px;
}
.nk-exped-souvenir {
    background: white; border: 2px solid #eee; border-radius: 10px;
    padding: 10px 6px; text-align: center;
}
.nk-exped-souvenir-emoji  { font-size: 24px; line-height: 1.2; }
.nk-exped-souvenir-name   { font-size: 10px; font-weight: bold; margin-top: 4px; }
.nk-exped-souvenir-rarity { font-size: 9px; font-weight: bold; margin-top: 2px; }
.nk-exped-souvenir-unknown { opacity: 0.55; filter: grayscale(1); }
.nk-exped-bonus-label {
    color: var(--nk-success); font-size: 11px; margin-left: 6px;
    text-transform: none; letter-spacing: 0;
}
[data-theme="dark"] .nk-exped-info,
[data-theme="dark"] .nk-exped-slot,
[data-theme="dark"] .nk-exped-dest,
[data-theme="dark"] .nk-exped-souvenir { background: #3d2b1a; border-color: #5a3e2b; }
[data-theme="dark"] .nk-exped-slot-empty,
[data-theme="dark"] .nk-exped-slot-locked { background: transparent; border-color: #5a3e2b; }
[data-theme="dark"] .nk-exped-ready { border-color: var(--nk-gold); }
[data-theme="dark"] .nk-exped-bar-wrap { background: rgba(255,255,255,0.1); }
`;
    document.head.appendChild(style);
}
