// ─── Yōkai Survivor Audio ──────────────────────────────────────────────────
// Lazy-init Web Audio API. All sounds are procedural oscillator beeps.
// No files needed; safe to import anywhere.

let _ctx = null;

function getCtx() {
    if (!_ctx) {
        try {
            _ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            _ctx = null;
        }
    }
    // Browsers may suspend context until a user gesture
    if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
}

/**
 * Schedule a single oscillator tone.
 * @param {number}  freq    Hz
 * @param {number}  dur     seconds
 * @param {string}  type    OscillatorType
 * @param {number}  vol     peak gain (0-1)
 * @param {number}  delay   seconds from now
 * @param {number}  attack  ramp-up seconds
 */
function tone(freq, dur, type = 'sine', vol = 0.15, delay = 0, attack = 0.01) {
    const c = getCtx();
    if (!c) return;
    try {
        const osc  = c.createOscillator();
        const gain = c.createGain();
        osc.connect(gain);
        gain.connect(c.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, c.currentTime + delay);
        gain.gain.setValueAtTime(0.0001, c.currentTime + delay);
        gain.gain.linearRampToValueAtTime(vol, c.currentTime + delay + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
        osc.start(c.currentTime + delay);
        osc.stop(c.currentTime + delay + dur + 0.05);
    } catch (e) { /* AudioContext might be in a broken state */ }
}

// ── Public sounds ──────────────────────────────────────────────────────────

/** Player takes a hit — punchy thud */
export function playHit() {
    tone(130, 0.06, 'square', 0.18);
    tone(80,  0.12, 'square', 0.12, 0.04);
}

/** Enemy takes damage — soft tick (called at most every ~80ms via throttle) */
export function playEnemyHit() {
    tone(440, 0.03, 'square', 0.04);
}

/** Correct quiz answer — ascending chime */
export function playCorrect() {
    tone(660, 0.1,  'sine', 0.18);
    tone(880, 0.18, 'sine', 0.18, 0.1);
}

/** Wrong quiz answer — descending buzz */
export function playWrong() {
    tone(220, 0.18, 'sawtooth', 0.14);
    tone(160, 0.28, 'sawtooth', 0.10, 0.12);
}

/** Level-up — triumphant three-note fanfare */
export function playLevelUp() {
    tone(440, 0.1,  'sine', 0.16);
    tone(554, 0.1,  'sine', 0.16, 0.12);
    tone(659, 0.22, 'sine', 0.20, 0.24);
}

/** Boss warning — ominous low rumble */
export function playBossWarning() {
    tone(55,  0.6, 'square',   0.20);
    tone(110, 0.4, 'sawtooth', 0.12, 0.2);
    tone(40,  0.8, 'square',   0.14, 0.5);
}

/** Chest opened — coin sparkle */
export function playChestOpen() {
    tone(880,  0.07, 'sine', 0.12);
    tone(1100, 0.07, 'sine', 0.14, 0.07);
    tone(1320, 0.14, 'sine', 0.18, 0.14);
}

/** Upgrade selected — satisfying click */
export function playUpgradePick() {
    tone(520, 0.05, 'sine', 0.14);
    tone(780, 0.10, 'sine', 0.10, 0.05);
}

/** Game over — descending toll */
export function playGameOver() {
    tone(220, 0.4, 'sawtooth', 0.15);
    tone(180, 0.5, 'sawtooth', 0.12, 0.35);
    tone(140, 0.7, 'sawtooth', 0.10, 0.70);
}

/** Victory fanfare */
export function playVictory() {
    [440, 554, 659, 880].forEach((f, i) => tone(f, 0.18, 'sine', 0.16, i * 0.13));
}
