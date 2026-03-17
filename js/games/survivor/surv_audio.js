// ─── Yōkai Survivor Audio ──────────────────────────────────────────────────
// Lazy-init Web Audio API. All sounds are procedural oscillator beeps.

let _ctx   = null;
let _muted = localStorage.getItem('surv_muted') === 'true';

export function setMuted(val) {
    _muted = !!val;
    localStorage.setItem('surv_muted', _muted);
}
export function isMuted() { return _muted; }

function getCtx() {
    if (_muted) return null;
    if (!_ctx) {
        try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { _ctx = null; }
    }
    if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
}

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
    } catch (e) {}
}

export function playHit()         { tone(130, 0.06, 'square',   0.18); tone(80,   0.12, 'square',   0.12, 0.04); }
export function playEnemyHit()    { tone(440, 0.03, 'square',   0.04); }
export function playCorrect()     { tone(660, 0.1,  'sine',     0.18); tone(880,  0.18, 'sine',     0.18, 0.1);  }
export function playWrong()       { tone(220, 0.18, 'sawtooth', 0.14); tone(160,  0.28, 'sawtooth', 0.10, 0.12); }
export function playLevelUp()     { tone(440, 0.1,  'sine',     0.16); tone(554,  0.1,  'sine',     0.16, 0.12); tone(659, 0.22, 'sine', 0.20, 0.24); }
export function playBossWarning() { tone(55,  0.6,  'square',   0.20); tone(110,  0.4,  'sawtooth', 0.12, 0.2);  tone(40,  0.8,  'square', 0.14, 0.5); }
export function playChestOpen()   { tone(880, 0.07, 'sine',     0.12); tone(1100, 0.07, 'sine',     0.14, 0.07); tone(1320, 0.14, 'sine', 0.18, 0.14); }
export function playUpgradePick() { tone(520, 0.05, 'sine',     0.14); tone(780,  0.10, 'sine',     0.10, 0.05); }
export function playGameOver()    { tone(220, 0.4,  'sawtooth', 0.15); tone(180,  0.5,  'sawtooth', 0.12, 0.35); tone(140, 0.7, 'sawtooth', 0.10, 0.70); }
export function playVictory()     { [440, 554, 659, 880].forEach((f, i) => tone(f, 0.18, 'sine', 0.16, i * 0.13)); }
export function playStormGust()   { tone(180, 0.08, 'sawtooth', 0.06); tone(220, 0.25, 'sawtooth', 0.08, 0.05); tone(160, 0.40, 'sine', 0.05, 0.18); }