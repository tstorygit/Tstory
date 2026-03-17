// surv_input.js — WASD + Virtual Joystick
// Supports both touch events (mobile) and pointer events (touch-screen laptops)

let keys = { w: false, a: false, s: false, d: false };
let joystick = { active: false, nx: 0, ny: 0 };
let boundKeydown, boundKeyup;
let touchZone, touchBase, touchKnob;

// ── Debug log visible on-screen ─────────────────────────────────────────────
// A small overlay div appended to document.body.
// Call _log('msg') from anywhere in this file.
let _dbgEl = null;
const _logLines = [];
function _log(msg) {
    console.log('[INPUT]', msg);
    if (!_dbgEl) {
        _dbgEl = document.createElement('div');
        _dbgEl.style.cssText = [
            'position:fixed', 'bottom:8px', 'right:8px', 'z-index:99999',
            'background:rgba(0,0,0,0.82)', 'color:#0f0',
            'font:bold 10px/1.5 monospace', 'padding:6px 8px',
            'border-radius:6px', 'max-width:280px', 'pointer-events:none',
            'white-space:pre-wrap', 'max-height:200px', 'overflow:hidden'
        ].join(';');
        document.body.appendChild(_dbgEl);
    }
    _logLines.push(msg);
    if (_logLines.length > 14) _logLines.shift();
    _dbgEl.textContent = _logLines.join('\n');
}

export function removeInputLog() {
    if (_dbgEl) { _dbgEl.remove(); _dbgEl = null; }
    _logLines.length = 0;
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initInput(container) {
    _log(`initInput called. container=${container?.id || container?.className || container?.tagName || 'null'}`);

    // ── Keyboard ──
    boundKeydown = (e) => {
        const k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) { keys[k] = true; _log(`key↓ ${k}`); }
    };
    boundKeyup = (e) => {
        const k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) { keys[k] = false; }
    };
    document.addEventListener('keydown', boundKeydown);
    document.addEventListener('keyup',   boundKeyup);

    // ── Find joystick elements ──
    touchZone = container.querySelector('#surv-joystick-zone');
    touchBase = container.querySelector('#surv-joystick-base');
    touchKnob = container.querySelector('#surv-joystick-knob');

    _log(`touchZone found: ${!!touchZone}`);
    _log(`touchBase found: ${!!touchBase}`);
    _log(`touchKnob found: ${!!touchKnob}`);

    if (!touchZone) {
        _log('❌ NO JOYSTICK ZONE — touch disabled');
        return;
    }

    // Log computed pointer-events so we can see if CSS is blocking
    const zoneStyle = window.getComputedStyle(touchZone);
    _log(`zone pointer-events: ${zoneStyle.pointerEvents}`);
    _log(`zone size: ${touchZone.offsetWidth}×${touchZone.offsetHeight}`);
    _log(`zone display: ${zoneStyle.display}`);

    let touchId = null;
    let startX = 0, startY = 0;
    const maxRadius = 50;

    // ── Touch Events (mobile browsers + some laptops) ────────────────────────
    touchZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        _log(`touchstart touches:${e.touches.length} changed:${e.changedTouches.length}`);
        if (joystick.active) { _log('joystick already active, ignoring'); return; }
        const touch = e.changedTouches[0];
        touchId = touch.identifier;
        joystick.active = true;

        const rect = touchZone.getBoundingClientRect();
        startX = touch.clientX - rect.left;
        startY = touch.clientY - rect.top;
        _log(`touch start @ ${startX.toFixed(0)},${startY.toFixed(0)} rect=${rect.width.toFixed(0)}×${rect.height.toFixed(0)}`);

        touchBase.style.display = 'block';
        touchBase.style.left = startX + 'px';
        touchBase.style.top  = startY + 'px';
        touchKnob.style.transform = 'translate(-50%,-50%) translate(0px,0px)';
        joystick.nx = 0; joystick.ny = 0;
    }, { passive: false });

    touchZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!joystick.active) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier !== touchId) continue;
            const rect = touchZone.getBoundingClientRect();
            let dx = (touch.clientX - rect.left) - startX;
            let dy = (touch.clientY - rect.top)  - startY;
            const dist = Math.hypot(dx, dy);
            if (dist > maxRadius) { dx = (dx/dist)*maxRadius; dy = (dy/dist)*maxRadius; }
            touchKnob.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px)`;
            const nd = Math.hypot(dx, dy);
            joystick.nx = nd > 0 ? dx / maxRadius : 0;
            joystick.ny = nd > 0 ? dy / maxRadius : 0;
        }
    }, { passive: false });

    const endTouch = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchId) {
                _log('touchend/cancel');
                joystick.active = false;
                touchId = null;
                joystick.nx = 0; joystick.ny = 0;
                touchBase.style.display = 'none';
            }
        }
    };
    touchZone.addEventListener('touchend',    endTouch);
    touchZone.addEventListener('touchcancel', endTouch);

    // ── Pointer Events (touch-screen laptops / stylus / fallback) ────────────
    // Some devices fire pointer events but NOT touch events (e.g. Windows touch,
    // certain Chrome flags). We listen to both — whichever fires first wins.
    let pointerId = null;

    touchZone.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return; // mouse handled by keyboard only
        if (joystick.active && pointerId !== null) return; // already tracking touch
        _log(`pointerdown type=${e.pointerType} id=${e.pointerId}`);
        e.preventDefault();
        touchZone.setPointerCapture(e.pointerId);
        pointerId = e.pointerId;
        joystick.active = true;

        const rect = touchZone.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        _log(`pointer start @ ${startX.toFixed(0)},${startY.toFixed(0)}`);

        touchBase.style.display = 'block';
        touchBase.style.left = startX + 'px';
        touchBase.style.top  = startY + 'px';
        touchKnob.style.transform = 'translate(-50%,-50%) translate(0px,0px)';
        joystick.nx = 0; joystick.ny = 0;
    }, { passive: false });

    touchZone.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pointerId) return;
        if (!joystick.active) return;
        const rect = touchZone.getBoundingClientRect();
        let dx = (e.clientX - rect.left) - startX;
        let dy = (e.clientY - rect.top)  - startY;
        const dist = Math.hypot(dx, dy);
        if (dist > maxRadius) { dx = (dx/dist)*maxRadius; dy = (dy/dist)*maxRadius; }
        touchKnob.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px)`;
        const nd = Math.hypot(dx, dy);
        joystick.nx = nd > 0 ? dx / maxRadius : 0;
        joystick.ny = nd > 0 ? dy / maxRadius : 0;
    }, { passive: false });

    const endPointer = (e) => {
        if (e.pointerId !== pointerId) return;
        _log(`pointerup/cancel type=${e.pointerType}`);
        pointerId = null;
        joystick.active = false;
        joystick.nx = 0; joystick.ny = 0;
        touchBase.style.display = 'none';
    };
    touchZone.addEventListener('pointerup',     endPointer);
    touchZone.addEventListener('pointercancel', endPointer);

    _log('✅ touch + pointer listeners attached');
}

// ── Input read (called every frame by engine) ────────────────────────────────

export function getInputDir() {
    if (joystick.active) {
        return { x: joystick.nx, y: joystick.ny };
    }
    let dx = 0, dy = 0;
    if (keys.w) dy -= 1;
    if (keys.s) dy += 1;
    if (keys.a) dx -= 1;
    if (keys.d) dx += 1;
    const dist = Math.hypot(dx, dy);
    return dist > 0 ? { x: dx/dist, y: dy/dist } : { x: 0, y: 0 };
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export function cleanupInput() {
    document.removeEventListener('keydown', boundKeydown);
    document.removeEventListener('keyup',   boundKeyup);
    keys = { w: false, a: false, s: false, d: false };
    joystick.active = false;
    joystick.nx = 0; joystick.ny = 0;
    if (touchBase) touchBase.style.display = 'none';
    removeInputLog();
}