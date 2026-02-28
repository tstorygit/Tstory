import * as srsDb from './srs_db.js';
import { settings } from './settings.js';

// --- STATE ---
let reviewQueue = [];
let currentIndex = 0;

// --- GESTURE STATE ---
let drag = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    startTime: 0,
    totalTravel: 0,
    locked: false,
};

const SWIPE_THRESHOLD_PX   = 55;
const SWIPE_VELOCITY_PX_MS = 0.35;
const AXIS_LOCK_RATIO      = 1.3;

// --- DOM ELEMENTS ---
const flashcardContainer = document.getElementById('flashcard-container');
const flashcard          = document.getElementById('flashcard');
const emptyState         = document.getElementById('srs-empty-state');
const srsCounter         = document.getElementById('srs-counter');

const elFuri       = document.getElementById('fc-furi');
const elWord       = document.getElementById('fc-word');
const elWordBack   = document.getElementById('fc-word-back');
const elTrans      = document.getElementById('fc-trans');
const elStatusBtns = document.querySelectorAll('.fc-btn');

// Injected UI — attached to CONTAINER, not the card, so they're never 3D-transformed
let swipeOverlay = null;
let hintRight    = null;
let hintLeft     = null;

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
export function initSRS() {
    const srsTabBtn = document.querySelector('button[data-target="view-srs"]');
    if (srsTabBtn) srsTabBtn.addEventListener('click', loadReviewQueue);

    // Ensure container is positioned so absolute children work
    if (getComputedStyle(flashcardContainer).position === 'static') {
        flashcardContainer.style.position = 'relative';
    }

    // ── Inject overlay + hints into CONTAINER (not the card!) ────────────
    // This means they never participate in the card's rotateY / drag transform,
    // so text is always readable and positions are always correct.
    swipeOverlay = document.createElement('div');
    swipeOverlay.id = 'swipe-overlay';
    flashcardContainer.appendChild(swipeOverlay);

    hintRight = document.createElement('div');
    hintRight.className = 'swipe-hint-label swipe-hint-right';
    hintRight.textContent = '＋ Know';
    flashcardContainer.appendChild(hintRight);

    hintLeft = document.createElement('div');
    hintLeft.className = 'swipe-hint-label swipe-hint-left';
    hintLeft.textContent = 'Review ＋';
    flashcardContainer.appendChild(hintLeft);

    // ── Card flip on click/tap ────────────────────────────────────────────
    flashcardContainer.addEventListener('click', (e) => {
        if (drag.locked) return;
        if (e.target.tagName === 'BUTTON') return;
        if (drag.totalTravel > 6) return;
        flipCard();
    });

    // ── Status button clicks ──────────────────────────────────────────────
    elStatusBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newStatus = parseInt(e.target.getAttribute('data-status'));
            commitStatus(newStatus, null);
        });
    });

    initPointerGestures();
    initKeyboardControls();
    loadReviewQueue();
}

// ─────────────────────────────────────────────
// FLIP
// ─────────────────────────────────────────────
function flipCard() {
    flashcard.classList.add('flip-animate');
    flashcard.classList.toggle('flipped');
    flashcard.addEventListener('transitionend', () => {
        flashcard.classList.remove('flip-animate');
    }, { once: true });
}

function isFlipped() {
    return flashcard.classList.contains('flipped');
}

// ─────────────────────────────────────────────
// QUEUE + RENDERING
// ─────────────────────────────────────────────
function loadReviewQueue() {
    const allWords = srsDb.getFilteredWords({ sort: 'oldest' });
    reviewQueue = allWords.slice(0, 20);
    currentIndex = 0;
    updateCounter();
    renderCurrentCard();
}

function updateCounter() {
    if (srsCounter) {
        const remaining = reviewQueue.length - currentIndex;
        srsCounter.textContent = remaining > 0 ? `${remaining} Due` : 'Complete';
    }
}

function renderCurrentCard() {
    flashcard.classList.remove(
        'flipped', 'flip-animate',
        'swipe-exit-right', 'swipe-exit-left', 'swipe-exit-down',
        'dragging'
    );
    flashcard.style.transform     = '';
    flashcard.style.opacity       = '';
    flashcard.style.transition    = '';
    flashcard.style.pointerEvents = '';
    flashcard.style.removeProperty('--card-pre-anim-transform');
    clearOverlay();
    drag.locked = false;

    if (currentIndex >= reviewQueue.length) {
        flashcardContainer.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    flashcardContainer.style.display = 'block';
    emptyState.style.display = 'none';

    const wordData = reviewQueue[currentIndex];
    elWord.textContent     = wordData.word;
    elFuri.textContent     = settings.showFurigana ? (wordData.furi || '') : '';
    elWordBack.textContent = wordData.word;
    elTrans.textContent    = wordData.translation;

    elStatusBtns.forEach(btn => {
        const s = parseInt(btn.getAttribute('data-status'));
        btn.style.border    = (s === wordData.status) ? '3px solid #333' : 'none';
        btn.style.transform = (s === wordData.status) ? 'scale(1.1)' : 'scale(1)';
    });
}

// ─────────────────────────────────────────────
// STATUS + EXIT ANIMATION
// ─────────────────────────────────────────────
function commitStatus(newStatus, direction) {
    if (drag.locked) return;
    drag.locked = true;

    const currentWord = reviewQueue[currentIndex];
    srsDb.updateWordStatus(currentWord.word, newStatus);

    if (direction) {
        const baseTransform = isFlipped() ? 'rotateY(180deg)' : 'rotateY(0deg)';
        flashcard.style.setProperty('--card-pre-anim-transform', baseTransform);
        flashcard.classList.remove('flipped', 'flip-animate');
        flashcard.style.transform = '';
        flashcard.classList.add(`swipe-exit-${direction}`);
        flashcard.addEventListener('animationend', nextCard, { once: true });
    } else {
        nextCard();
    }
}

function nextCard() {
    currentIndex++;
    updateCounter();
    renderCurrentCard();
}

// ─────────────────────────────────────────────
// OVERLAY
// Lives on the container — never 3D-rotated, always screen-space correct
// ─────────────────────────────────────────────
const OVERLAY_BG = {
    right: 'radial-gradient(ellipse at 0% 50%,  rgba(34,197,100,0.45) 0%, transparent 65%)',
    left:  'radial-gradient(ellipse at 100% 50%, rgba(220,50,50,0.45)  0%, transparent 65%)',
    down:  'radial-gradient(ellipse at 50% 0%,   rgba(140,140,140,0.38) 0%, transparent 65%)',
};

function setOverlay(direction, progress) {
    const p = Math.min(progress, 1);
    swipeOverlay.style.background = OVERLAY_BG[direction] || '';
    swipeOverlay.style.opacity    = p.toFixed(3);
    if (hintRight) hintRight.style.opacity = direction === 'right' ? Math.min(p * 1.5, 1).toFixed(3) : '0';
    if (hintLeft)  hintLeft.style.opacity  = direction === 'left'  ? Math.min(p * 1.5, 1).toFixed(3) : '0';
}

function clearOverlay() {
    if (!swipeOverlay) return;
    swipeOverlay.style.opacity    = '0';
    swipeOverlay.style.background = '';
    if (hintRight) hintRight.style.opacity = '0';
    if (hintLeft)  hintLeft.style.opacity  = '0';
}

// ─────────────────────────────────────────────
// POINTER GESTURE ENGINE
// ─────────────────────────────────────────────
function initPointerGestures() {
    flashcardContainer.addEventListener('pointerdown',   onPointerDown);
    flashcardContainer.addEventListener('pointermove',   onPointerMove);
    flashcardContainer.addEventListener('pointerup',     onPointerUp);
    flashcardContainer.addEventListener('pointercancel', onPointerCancel);
}

function onPointerDown(e) {
    if (drag.locked) return;
    if (e.target.tagName === 'BUTTON') return;

    drag.active      = true;
    drag.pointerId   = e.pointerId;
    drag.startX      = e.clientX;
    drag.startY      = e.clientY;
    drag.currentX    = e.clientX;
    drag.currentY    = e.clientY;
    drag.startTime   = Date.now();
    drag.totalTravel = 0;

    try { flashcardContainer.setPointerCapture(e.pointerId); } catch (_) {}

    flashcard.classList.remove('flip-animate');
    flashcard.classList.add('dragging');
    e.preventDefault();
}

function onPointerMove(e) {
    if (!drag.active || drag.locked) return;
    if (e.pointerId !== drag.pointerId) return;

    drag.currentX = e.clientX;
    drag.currentY = e.clientY;

    // Screen-space deltas (what the user's finger/mouse actually moved)
    const rawDx = drag.currentX - drag.startX;
    const rawDy = drag.currentY - drag.startY;
    drag.totalTravel = Math.hypot(rawDx, rawDy);

    if (drag.totalTravel < 4) return;

    const absDx = Math.abs(rawDx);
    const absDy = Math.abs(rawDy);

    // ── KEY FIX: when the card is flipped, its local X-axis is mirrored. ──
    // translateX(+N) on a rotateY(180deg) element moves it LEFT on screen.
    // We invert dispDx so the card always follows the finger correctly.
    // The overlay uses rawDx (screen space) and is unaffected.
    const flip   = isFlipped();
    const dispDx = flip ? -rawDx : rawDx;

    if (absDx >= absDy) {
        const screenDir = rawDx > 0 ? 'right' : 'left';
        const progress  = absDx / SWIPE_THRESHOLD_PX;
        setOverlay(screenDir, progress);

        const angle      = (dispDx / (flashcard.offsetWidth || 300)) * 20;
        const baseRotate = flip ? 'rotateY(180deg) ' : '';
        flashcard.style.transform = `${baseRotate}translateX(${dispDx * 0.28}px) rotate(${angle}deg)`;
    } else if (rawDy > 0) {
        const progress = absDy / SWIPE_THRESHOLD_PX;
        setOverlay('down', progress);
        const baseRotate = flip ? 'rotateY(180deg) ' : '';
        flashcard.style.transform = `${baseRotate}translateY(${rawDy * 0.22}px)`;
    } else {
        clearOverlay();
        flashcard.style.transform = flip ? 'rotateY(180deg)' : '';
    }
}

function onPointerUp(e) {
    if (!drag.active) return;
    if (e.pointerId !== drag.pointerId) return;
    drag.active = false;
    flashcard.classList.remove('dragging');

    const rawDx  = drag.currentX - drag.startX;
    const rawDy  = drag.currentY - drag.startY;
    const absDx  = Math.abs(rawDx);
    const absDy  = Math.abs(rawDy);
    const elapsed = Math.max(Date.now() - drag.startTime, 1);
    const velX    = absDx / elapsed;

    const isHorizontal =
        (absDx > SWIPE_THRESHOLD_PX || velX > SWIPE_VELOCITY_PX_MS) &&
        absDx * AXIS_LOCK_RATIO >= absDy;

    const isDown =
        absDy > SWIPE_THRESHOLD_PX &&
        absDy * AXIS_LOCK_RATIO > absDx &&
        rawDy > 0;

    if (isHorizontal || isDown) {
        resolveSwipe(rawDx, rawDy, isHorizontal, isDown);
    } else {
        snapBack();
    }
}

function onPointerCancel(e) {
    if (e.pointerId !== drag.pointerId) return;
    drag.active = false;
    flashcard.classList.remove('dragging');
    snapBack();
}

function snapBack() {
    flashcard.classList.add('flip-animate');
    flashcard.style.transform = isFlipped() ? 'rotateY(180deg)' : '';
    clearOverlay();
    flashcard.addEventListener('transitionend', () => {
        flashcard.classList.remove('flip-animate');
    }, { once: true });
}

function resolveSwipe(rawDx, rawDy, isHorizontal, isDown) {
    const currentWord = reviewQueue[currentIndex];
    let newStatus = currentWord.status;
    let direction;

    // Direction is always in screen space — swipe right = +1, always
    if (isHorizontal && rawDx > 0) {
        direction = 'right';
        if (newStatus < 5) newStatus++;
    } else if (isHorizontal && rawDx < 0) {
        direction = 'left';
        if (newStatus > 0) newStatus--;
    } else if (isDown) {
        direction = 'down';
    }

    clearOverlay();
    commitStatus(newStatus, direction);
}

// ─────────────────────────────────────────────
// KEYBOARD OVERLAY FLASH
// Ramps overlay up then commits — gives the same visual feedback as a swipe
// ─────────────────────────────────────────────
function flashOverlayThenCommit(newStatus, direction) {
    const STEPS    = 8;
    const STEP_MS  = 18;  // total ramp ~144ms, feels snappy
    let   step     = 0;

    const ramp = setInterval(() => {
        step++;
        setOverlay(direction, step / STEPS);
        if (step >= STEPS) {
            clearInterval(ramp);
            clearOverlay();
            commitStatus(newStatus, direction);
        }
    }, STEP_MS);
}

// ─────────────────────────────────────────────
// KEYBOARD CONTROLS
// ─────────────────────────────────────────────
function initKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        if (drag.locked) return;
        if (currentIndex >= reviewQueue.length) return;
        if (flashcardContainer.style.display === 'none') return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

        const currentWord = reviewQueue[currentIndex];
        let newStatus = currentWord.status;

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                if (newStatus < 5) newStatus++;
                flashOverlayThenCommit(newStatus, 'right');
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (newStatus > 0) newStatus--;
                flashOverlayThenCommit(newStatus, 'left');
                break;
            case 'ArrowDown':
                e.preventDefault();
                flashOverlayThenCommit(newStatus, 'down');
                break;
            case ' ':
            case 'Enter':
                e.preventDefault();
                flipCard();
                break;
        }
    });
}