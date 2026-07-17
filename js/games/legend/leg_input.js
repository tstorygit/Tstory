// js/games/legend/leg_input.js
//
// Unified input for Legend of Vocab.
//   Touch / mouse : press-and-drag anywhere on the canvas = virtual joystick,
//                   quick tap = attack / interact.
//   Keyboard      : WASD / arrow keys = move, Space / Enter / J = attack.
// Both sources write into the same `input` vector so the engine only ever
// reads getMovement() / consumeTap().

let input = { x: 0, y: 0, tapFired: false };
let isDragging = false;
let startX = 0, startY = 0;

// ── Keyboard state ────────────────────────────────────────────────────────────
const KEY_DIRS = {
    ArrowUp:    [0, -1], KeyW: [0, -1],
    ArrowDown:  [0,  1], KeyS: [0,  1],
    ArrowLeft:  [-1, 0], KeyA: [-1, 0],
    ArrowRight: [ 1, 0], KeyD: [ 1, 0],
};
const _heldKeys = new Set();
// Window-level listeners are kept as module refs so a re-launch of the game
// (initInput is called on every card click) never stacks duplicates.
let _keyDownHandler = null;
let _keyUpHandler   = null;

function _applyKeyVector() {
    let x = 0, y = 0;
    _heldKeys.forEach(code => {
        const d = KEY_DIRS[code];
        if (d) { x += d[0]; y += d[1]; }
    });
    const len = Math.hypot(x, y);
    if (len > 0) {
        input.x = x / len;
        input.y = y / len;
    } else if (!isDragging) {
        input.x = 0;
        input.y = 0;
    }
}

// Ignore key events aimed at form controls / quiz buttons so answering a quiz
// with Enter or typing in a settings field never moves or attacks the player.
function _isUiTarget(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                 t.tagName === 'SELECT' || t.tagName === 'BUTTON' ||
                 t.isContentEditable);
}

export function initInput(container) {
    container.addEventListener('pointerdown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        startX = e.clientX; startY = e.clientY;
        isDragging = true;
        input.tapFired = false;
        try { container.setPointerCapture(e.pointerId); } catch(e){}
    });

    container.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const dist = Math.hypot(dx, dy);

        if (dist > 10) {
            input.x = dx / dist;
            input.y = dy / dist;
        }
    });

    const endInput = (e) => {
        if (!isDragging) return;
        isDragging = false;
        input.x = 0; input.y = 0;

        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (dist <= 10) {
            input.tapFired = true;
        }
        _applyKeyVector(); // restore keyboard movement if keys are still held
    };

    container.addEventListener('pointerup', endInput);
    container.addEventListener('pointercancel', endInput);

    // ── Keyboard (desktop) ────────────────────────────────────────────────────
    if (_keyDownHandler) window.removeEventListener('keydown', _keyDownHandler);
    if (_keyUpHandler)   window.removeEventListener('keyup',   _keyUpHandler);
    _heldKeys.clear();

    _keyDownHandler = (e) => {
        if (_isUiTarget(e.target)) return;
        if (KEY_DIRS[e.code]) {
            _heldKeys.add(e.code);
            if (!isDragging) _applyKeyVector();
            e.preventDefault();
        } else if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ') && !e.repeat) {
            input.tapFired = true;
            e.preventDefault();
        }
    };
    _keyUpHandler = (e) => {
        if (KEY_DIRS[e.code]) {
            _heldKeys.delete(e.code);
            if (!isDragging) _applyKeyVector();
        }
    };
    window.addEventListener('keydown', _keyDownHandler);
    window.addEventListener('keyup',   _keyUpHandler);
}

export function getMovement() { return { x: input.x, y: input.y }; }
export function consumeTap() {
    if (input.tapFired) { input.tapFired = false; return true; }
    return false;
}
export function cleanupInput() {
    isDragging = false;
    input = { x: 0, y: 0, tapFired: false };
    _heldKeys.clear();
    if (_keyDownHandler) { window.removeEventListener('keydown', _keyDownHandler); _keyDownHandler = null; }
    if (_keyUpHandler)   { window.removeEventListener('keyup',   _keyUpHandler);   _keyUpHandler = null; }
}
