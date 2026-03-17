// Handles WASD and Virtual Joystick

let keys = { w: false, a: false, s: false, d: false };
let joystick = { active: false, nx: 0, ny: 0 };
let boundKeydown, boundKeyup;
let touchZone, touchBase, touchKnob;

export function initInput(container) {
    boundKeydown = (e) => {
        const k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) keys[k] = true;
    };
    boundKeyup = (e) => {
        const k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) keys[k] = false;
    };
    document.addEventListener('keydown', boundKeydown);
    document.addEventListener('keyup', boundKeyup);

    // Virtual Joystick
    touchZone = container.querySelector('#surv-joystick-zone');
    touchBase = container.querySelector('#surv-joystick-base');
    touchKnob = container.querySelector('#surv-joystick-knob');

    if (!touchZone) return;

    let touchId = null;
    let startX = 0, startY = 0;
    const maxRadius = 50;

    touchZone.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent scrolling
        if (joystick.active) return;
        const touch = e.changedTouches[0];
        touchId = touch.identifier;
        joystick.active = true;
        
        const rect = touchZone.getBoundingClientRect();
        startX = touch.clientX - rect.left;
        startY = touch.clientY - rect.top;

        touchBase.style.display = 'block';
        touchBase.style.left = startX + 'px';
        touchBase.style.top = startY + 'px';
        touchKnob.style.transform = `translate(-50%, -50%) translate(0px, 0px)`;
        joystick.nx = 0; joystick.ny = 0;
    }, { passive: false });

    touchZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!joystick.active) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === touchId) {
                const rect = touchZone.getBoundingClientRect();
                const curX = touch.clientX - rect.left;
                const curY = touch.clientY - rect.top;

                let dx = curX - startX;
                let dy = curY - startY;
                const dist = Math.hypot(dx, dy);

                if (dist > maxRadius) {
                    dx = (dx / dist) * maxRadius;
                    dy = (dy / dist) * maxRadius;
                }

                touchKnob.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
                
                // Normalize for movement
                const nDist = Math.hypot(dx, dy);
                if (nDist > 0) {
                    joystick.nx = dx / maxRadius;
                    joystick.ny = dy / maxRadius;
                } else {
                    joystick.nx = 0; joystick.ny = 0;
                }
            }
        }
    }, { passive: false });

    const endTouch = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchId) {
                joystick.active = false;
                touchId = null;
                joystick.nx = 0; joystick.ny = 0;
                touchBase.style.display = 'none';
            }
        }
    };
    touchZone.addEventListener('touchend', endTouch);
    touchZone.addEventListener('touchcancel', endTouch);
}

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
    if (dist > 0) {
        return { x: dx / dist, y: dy / dist };
    }
    return { x: 0, y: 0 };
}

export function cleanupInput() {
    document.removeEventListener('keydown', boundKeydown);
    document.removeEventListener('keyup', boundKeyup);
    keys = { w: false, a: false, s: false, d: false };
    joystick.active = false;
    joystick.nx = 0; joystick.ny = 0;
    if (touchBase) touchBase.style.display = 'none';
}
