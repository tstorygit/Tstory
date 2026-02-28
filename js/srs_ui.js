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
    locked: false, // true while an exit animation is running
};

// Swipe thresholds
const SWIPE_THRESHOLD_PX    = 55;   // minimum horizontal travel to commit swipe
const SWIPE_VELOCITY_PX_MS  = 0.35; // OR a fast flick counts too
const AXIS_LOCK_RATIO        = 1.3;  // |dx| must be this × |dy| to count as horizontal

// --- DOM ELEMENTS ---
const flashcardContainer = document.getElementById('flashcard-container');
const flashcard          = document.getElementById('flashcard');
const emptyState         = document.getElementById('srs-empty-state');
const srsCounter         = document.getElementById('srs-counter');

// Card Content Elements
const elFuri       = document.getElementById('fc-furi');
const elWord       = document.getElementById('fc-word');
const elWordBack   = document.getElementById('fc-word-back');
const elTrans      = document.getElementById('fc-trans');
const elStatusBtns = document.querySelectorAll('.fc-btn');

// Elements injected by this module
let swipeOverlay   = null;
let hintRight      = null;
let hintLeft       = null;

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
export function initSRS() {
    const srsTabBtn = document.querySelector('button[data-target="view-srs"]');
    if (srsTabBtn) srsTabBtn.addEventListener('click', loadReviewQueue);

    // ── Inject overlay + hint labels into the flashcard ──────────────────
    swipeOverlay = document.createElement('div');
    swipeOverlay.id = 'swipe-overlay';
    flashcard.appendChild(swipeOverlay);

    hintRight = document.createElement('div');
    hintRight.className = 'swipe-hint-label swipe-hint-right';
    hintRight.textContent = '＋ Know';
    flashcard.appendChild(hintRight);

    hintLeft = document.createElement('div');
    hintLeft.className = 'swipe-hint-label swipe-hint-left';
    hintLeft.textContent = 'Review ＋';
    flashcard.appendChild(hintLeft);

    // ── Card flip on click/tap ────────────────────────────────────────────
    // Only flip if it was a real tap (not a drag attempt)
    flashcardContainer.addEventListener('click', (e) => {
        if (drag.locked) return;
        if (e.target.tagName === 'BUTTON') return;
        if (drag.totalTravel > 6) return; // was a drag, not a tap
        flipCard();
    });

    // ── Status button clicks (back of card) ───────────────────────────────
    elStatusBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newStatus = parseInt(e.target.getAttribute('data-status'));
            commitStatus(newStatus, null);
        });
    });

    // ── Input handlers ────────────────────────────────────────────────────
    initPointerGestures();
    initKeyboardControls();

    loadReviewQueue();
}

// ─────────────────────────────────────────────
// FLIP
// ─────────────────────────────────────────────
function flipCard() {
    // Enable CSS transition just for this flip, then remove it
    // so it doesn't interfere with drag transforms
    flashcard.classList.add('flip-animate');
    flashcard.classList.toggle('flipped');
    flashcard.addEventListener('transitionend', () => {
        flashcard.classList.remove('flip-animate');
    }, { once: true });
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
    // Full reset
    flashcard.classList.remove(
        'flipped', 'flip-animate',
        'swipe-exit-right', 'swipe-exit-left', 'swipe-exit-down',
        'dragging'
    );
    flashcard.style.transform  = '';
    flashcard.style.opacity    = '';
    flashcard.style.transition = '';
    flashcard.style.removeProperty('--card-pre-anim-transform');
    flashcard.style.pointerEvents = '';
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
/**
 * @param {number} newStatus
 * @param {'right'|'left'|'down'|null} direction  null = instant (button click)
 */
function commitStatus(newStatus, direction) {
    if (drag.locked) return;
    drag.locked = true;

    const currentWord = reviewQueue[currentIndex];
    srsDb.updateWordStatus(currentWord.word, newStatus);

    if (direction) {
        // Tell the CSS animation what base transform to start from
        // (preserves flipped state so the exit looks correct from either face)
        const baseTransform = flashcard.classList.contains('flipped')
            ? 'rotateY(180deg)'
            : 'rotateY(0deg)';
        flashcard.style.setProperty('--card-pre-anim-transform', baseTransform);
        // Remove flip class so CSS won't fight the animation
        flashcard.classList.remove('flipped', 'flip-animate');
        flashcard.style.transform = ''; // clear any inline drag transform

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
// OVERLAY (drag colour feedback)
// ─────────────────────────────────────────────
const OVERLAY_BG = {
    right: 'radial-gradient(ellipse at 0% 50%,  rgba(34,197,100,0.5)  0%, transparent 65%)',
    left:  'radial-gradient(ellipse at 100% 50%, rgba(220,50,50,0.5)   0%, transparent 65%)',
    down:  'radial-gradient(ellipse at 50% 0%,   rgba(140,140,140,0.4) 0%, transparent 65%)',
};

function setOverlay(direction, progress) {
    const p = Math.min(progress, 1);
    swipeOverlay.style.background = OVERLAY_BG[direction] || '';
    swipeOverlay.style.opacity    = p.toFixed(3);
    if (hintRight) hintRight.style.opacity = direction === 'right' ? (p * 1.6).toFixed(3) : '0';
    if (hintLeft)  hintLeft.style.opacity  = direction === 'left'  ? (p * 1.6).toFixed(3) : '0';
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
// Unified: mouse, touch, stylus — via Pointer Events API
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

    // Capture so we keep getting events even when pointer leaves the element
    try { flashcardContainer.setPointerCapture(e.pointerId); } catch (_) {}

    // Stop the flip transition from running while we drag
    flashcard.classList.remove('flip-animate');
    flashcard.classList.add('dragging');

    e.preventDefault(); // prevent text selection / scroll
}

function onPointerMove(e) {
    if (!drag.active || drag.locked) return;
    if (e.pointerId !== drag.pointerId) return;

    drag.currentX = e.clientX;
    drag.currentY = e.clientY;

    const dx    = drag.currentX - drag.startX;
    const dy    = drag.currentY - drag.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    drag.totalTravel = Math.hypot(dx, dy);

    if (drag.totalTravel < 4) return; // dead zone

    if (absDx >= absDy) {
        // Horizontal drag
        const dir      = dx > 0 ? 'right' : 'left';
        const progress = absDx / SWIPE_THRESHOLD_PX;
        setOverlay(dir, progress);

        // Tilt card: follow finger horizontally + slight rotation
        const angle     = (dx / (flashcard.offsetWidth  || 300)) * 20;
        const baseFlip  = flashcard.classList.contains('flipped') ? 'rotateY(180deg) ' : '';
        flashcard.style.transform = `${baseFlip}translateX(${dx * 0.28}px) rotate(${angle}deg)`;
    } else {
        // Vertical drag (down = skip)
        if (dy > 0) {
            const progress = absDy / SWIPE_THRESHOLD_PX;
            setOverlay('down', progress);
            const baseFlip = flashcard.classList.contains('flipped') ? 'rotateY(180deg) ' : '';
            flashcard.style.transform = `${baseFlip}translateY(${dy * 0.22}px)`;
        } else {
            // Upward drag — snap back overlay
            clearOverlay();
            const baseFlip = flashcard.classList.contains('flipped') ? 'rotateY(180deg)' : '';
            flashcard.style.transform = baseFlip;
        }
    }
}

function onPointerUp(e) {
    if (!drag.active) return;
    if (e.pointerId !== drag.pointerId) return;
    drag.active = false;
    flashcard.classList.remove('dragging');

    const dx      = drag.currentX - drag.startX;
    const dy      = drag.currentY - drag.startY;
    const absDx   = Math.abs(dx);
    const absDy   = Math.abs(dy);
    const elapsed = Math.max(Date.now() - drag.startTime, 1);
    const velX    = absDx / elapsed;

    const isHorizontal =
        (absDx > SWIPE_THRESHOLD_PX || velX > SWIPE_VELOCITY_PX_MS) &&
        absDx * AXIS_LOCK_RATIO >= absDy;

    const isDown =
        absDy > SWIPE_THRESHOLD_PX &&
        absDy * AXIS_LOCK_RATIO > absDx &&
        dy > 0;

    if (isHorizontal || isDown) {
        resolveSwipe(dx, dy, isHorizontal, isDown);
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
    // Animate back to resting position
    flashcard.classList.add('flip-animate'); // borrow the same transition
    const baseFlip = flashcard.classList.contains('flipped') ? 'rotateY(180deg)' : '';
    flashcard.style.transform = baseFlip;
    clearOverlay();
    flashcard.addEventListener('transitionend', () => {
        flashcard.classList.remove('flip-animate');
    }, { once: true });
}

function resolveSwipe(dx, dy, isHorizontal, isDown) {
    const currentWord = reviewQueue[currentIndex];
    let newStatus = currentWord.status;
    let direction;

    if (isHorizontal && dx > 0) {
        direction = 'right';
        if (newStatus < 5) newStatus++;
    } else if (isHorizontal && dx < 0) {
        direction = 'left';
        if (newStatus > 0) newStatus--;
    } else if (isDown) {
        direction = 'down';
        // Down = skip: status unchanged, just advance
    }

    clearOverlay();
    commitStatus(newStatus, direction);
}

// ─────────────────────────────────────────────
// KEYBOARD CONTROLS
// ArrowRight → +1 status  ArrowLeft → -1 status
// ArrowDown  → skip       Space / Enter → flip
// ─────────────────────────────────────────────
function initKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        if (drag.locked) return;
        if (currentIndex >= reviewQueue.length) return;
        if (flashcardContainer.style.display === 'none') return;

        // Don't steal keys from text inputs
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

        const currentWord = reviewQueue[currentIndex];
        let newStatus = currentWord.status;

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                if (newStatus < 5) newStatus++;
                commitStatus(newStatus, 'right');
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (newStatus > 0) newStatus--;
                commitStatus(newStatus, 'left');
                break;
            case 'ArrowDown':
                e.preventDefault();
                commitStatus(newStatus, 'down');
                break;
            case ' ':
            case 'Enter':
                e.preventDefault();
                flipCard();
                break;
        }
    });
}