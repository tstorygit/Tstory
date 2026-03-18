// js/games/legend/leg_input.js

let input = { x: 0, y: 0, tapFired: false };
let isDragging = false;
let startX = 0, startY = 0;

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
    };

    container.addEventListener('pointerup', endInput);
    container.addEventListener('pointercancel', endInput);
}

export function getMovement() { return { x: input.x, y: input.y }; }
export function consumeTap() { 
    if (input.tapFired) { input.tapFired = false; return true; }
    return false;
}
export function cleanupInput() {
    isDragging = false;
    input = { x: 0, y: 0, tapFired: false };
}