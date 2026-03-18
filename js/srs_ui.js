import * as srsDb from './srs_db.js';
import { settings } from './settings.js';
import { initStatsUI } from './srs_stats_ui.js';

// ─── STATE ────────────────────────────────────────────────────────────────────
let reviewQueue  = [];
let currentIndex = 0;

/**
 * 'lingq' — classic 0-5 status swipe (original behaviour, no scheduling)
 * 'srs'   — SM-2 Again/Hard/Good/Easy with real due-date scheduling
 */
let reviewMode = localStorage.getItem('srs_review_mode') || 'srs';

// ─── GESTURE STATE ────────────────────────────────────────────────────────────
let drag = {
    active: false, pointerId: null,
    startX: 0, startY: 0, currentX: 0, currentY: 0,
    startTime: 0, totalTravel: 0, locked: false,
};

const SWIPE_THRESHOLD_PX   = 55;
const SWIPE_VELOCITY_PX_MS = 0.35;
const AXIS_LOCK_RATIO      = 1.3;

// ─── DOM ─────────────────────────────────────────────────────────────────────
const flashcardContainer = document.getElementById('flashcard-container');
const flashcard          = document.getElementById('flashcard');
const emptyState         = document.getElementById('srs-empty-state');
const srsCounter         = document.getElementById('srs-counter');
const elFuri             = document.getElementById('fc-furi');
const elWord             = document.getElementById('fc-word');
const elWordBack         = document.getElementById('fc-word-back');
const elTrans            = document.getElementById('fc-trans');

let overlayFront = null;
let overlayBack  = null;
let hintRight    = null;
let hintLeft     = null;

// ─── DEBUG SEED ───────────────────────────────────────────────────────────────

const DEBUG_WORDS = [
    { word: 'デバッグ①',  furi: 'でばっぐ',   translation: 'Debug word 1 (due now)'   },
    { word: 'デバッグ②',  furi: 'でばっぐ',   translation: 'Debug word 2 (due now)'   },
    { word: 'デバッグ③',  furi: 'でばっぐ',   translation: 'Debug word 3 (due in 2m)' },
    { word: 'デバッグ④',  furi: 'でばっぐ',   translation: 'Debug word 4 (due in 4m)' },
    { word: 'デバッグ⑤',  furi: 'でばっぐ',   translation: 'Debug word 5 (due in 6m)' },
];

function _seedDebugWords() {
    const now = Date.now();
    const words = [
        // 2 words already due
        { ...DEBUG_WORDS[0], dueDate: new Date(now - 60_000).toISOString() },
        { ...DEBUG_WORDS[1], dueDate: new Date(now - 1_000).toISOString()  },
        // 3 words due in 2, 4, 6 minutes
        { ...DEBUG_WORDS[2], dueDate: new Date(now + 2 * 60_000).toISOString() },
        { ...DEBUG_WORDS[3], dueDate: new Date(now + 4 * 60_000).toISOString() },
        { ...DEBUG_WORDS[4], dueDate: new Date(now + 6 * 60_000).toISOString() },
    ];

    for (const w of words) {
        srsDb.saveWord({
            word:        w.word,
            furi:        w.furi,
            translation: w.translation,
            status:      1,
            interval:    1 / 1440,   // 1 minute in fractional days — clearly a debug card
            ease:        2.5,
            reviewCount: 0,
            dueDate:     w.dueDate,
            lastUpdated: new Date().toISOString(),
        });
    }

    loadReviewQueue();
    updateSrsBadge();
}

function _initDebugButton() {
    // Only show when debug mode is enabled in settings
    if (!settings.debugMode) return;

    const header = document.querySelector('#view-srs header');
    if (!header || document.getElementById('srs-debug-seed-btn')) return;

    const btn = document.createElement('button');
    btn.id          = 'srs-debug-seed-btn';
    btn.textContent = '🐛 Seed';
    btn.title       = 'Debug: add 2 due + 3 upcoming words to the SRS';
    btn.style.cssText = `
        font-size:11px; padding:3px 8px; border-radius:6px; cursor:pointer;
        background:rgba(255,165,0,0.15); color:#f39c12;
        border:1px solid rgba(255,165,0,0.4);
        font-weight:600; letter-spacing:0.3px;
    `;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _seedDebugWords();
        btn.textContent = '✓ Seeded';
        setTimeout(() => { btn.textContent = '🐛 Seed'; }, 2000);
    });

    // Insert into the right side of the header, before the counter
    const counter = document.getElementById('srs-counter');
    const parent  = counter?.parentElement ?? header;
    parent.insertBefore(btn, counter ?? null);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
export function initSRS() {
    const srsTabBtn = document.querySelector('button[data-target="view-srs"]');
    if (srsTabBtn) srsTabBtn.addEventListener('click', loadReviewQueue);

    const readerTabBtn = document.querySelector('button[data-target="view-reader"]');
    if (readerTabBtn) {
        readerTabBtn.addEventListener('click', () => {
            if (sessionStorage.getItem('srs-dirty')) {
                sessionStorage.removeItem('srs-dirty');
                document.dispatchEvent(new CustomEvent('srs:ratings-changed'));
            }
        });
    }

    if (getComputedStyle(flashcardContainer).position === 'static')
        flashcardContainer.style.position = 'relative';

    // Overlays — one per face so gradient sits on the visible face
    const frontFace = flashcard.querySelector('.flashcard-front');
    const backFace  = flashcard.querySelector('.flashcard-back');

    overlayFront = document.createElement('div');
    overlayFront.className = 'swipe-overlay-face';
    if (frontFace) frontFace.appendChild(overlayFront);

    overlayBack = document.createElement('div');
    overlayBack.className = 'swipe-overlay-face swipe-overlay-back';
    if (backFace) backFace.appendChild(overlayBack);

    hintRight = document.createElement('div');
    hintRight.className = 'swipe-hint-label swipe-hint-right';
    flashcardContainer.appendChild(hintRight);

    hintLeft = document.createElement('div');
    hintLeft.className = 'swipe-hint-label swipe-hint-left';
    flashcardContainer.appendChild(hintLeft);

    // Mode toggle dropdown
    const modeToggle = document.getElementById('srs-mode-toggle');
    if (modeToggle) {
        modeToggle.value = reviewMode;
        modeToggle.addEventListener('change', () => {
            reviewMode = modeToggle.value;
            localStorage.setItem('srs_review_mode', reviewMode);
            _applyModeUI();
            loadReviewQueue();
        });
    }

    flashcardContainer.addEventListener('click', (e) => {
        if (drag.locked) return;
        if (e.target.tagName === 'BUTTON') return;
        if (drag.totalTravel > 6) return;
        flipCard();
    });

    _applyModeUI();
    initPointerGestures();
    initKeyboardControls();
    loadReviewQueue();
    updateSrsBadge();
    initStatsUI();
    setInterval(updateSrsBadge, 30000);   // re-check every 30 s (sub-day words)

    _initDebugButton();
}

// ─── SRS NAV BADGE ────────────────────────────────────────────────────────────
export function updateSrsBadge() {
    const btn = document.querySelector('.nav-btn[data-target="view-srs"]');
    if (!btn) return;
    const due = srsDb.getDueWords(1).length > 0;
    btn.classList.toggle('srs-due', due);
}

// ─── MODE UI ──────────────────────────────────────────────────────────────────
// Rebuilds the back-face buttons and hint text to match the current mode.
function _applyModeUI() {
    const statusGroup = document.getElementById('fc-status-group');
    const hintLine    = document.getElementById('fc-hint-line');
    const modeToggle  = document.getElementById('srs-mode-toggle');
    if (modeToggle) modeToggle.value = reviewMode;

    if (reviewMode === 'srs') {
        if (statusGroup) {
            statusGroup.innerHTML = `
                <button class="fc-grade-btn" data-grade="0">😵 Again</button>
                <button class="fc-grade-btn" data-grade="1">😓 Hard</button>
                <button class="fc-grade-btn" data-grade="2">😊 Good</button>
                <button class="fc-grade-btn" data-grade="3">🚀 Easy</button>
            `;
            statusGroup.querySelectorAll('.fc-grade-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    commitGrade(parseInt(btn.getAttribute('data-grade')), null);
                });
            });
        }
        if (hintLine)  hintLine.textContent = '← Again  |  ↓ Hard  |  → Good  |  ↑ Easy';
        if (hintRight) hintRight.textContent = '😊 Good';
        if (hintLeft)  hintLeft.textContent  = '😵 Again';
    } else {
        // LingQ 0-5 buttons
        if (statusGroup) {
            statusGroup.innerHTML = `
                <button class="status-btn fc-btn" data-status="0">0</button>
                <button class="status-btn fc-btn" data-status="1">1</button>
                <button class="status-btn fc-btn" data-status="2">2</button>
                <button class="status-btn fc-btn" data-status="3">3</button>
                <button class="status-btn fc-btn" data-status="4">4</button>
                <button class="status-btn fc-btn" data-status="5">5</button>
            `;
            statusGroup.querySelectorAll('.fc-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    commitLingq(parseInt(btn.getAttribute('data-status')), null);
                });
            });
        }
        if (hintLine)  hintLine.textContent = '← −1 Status   |   Swipe Right +1 →';
        if (hintRight) hintRight.textContent = '+ Know';
        if (hintLeft)  hintLeft.textContent  = 'Review +';
        _highlightLingqStatus();
    }
}

// ─── FLIP ─────────────────────────────────────────────────────────────────────
function flipCard() {
    flashcard.classList.add('flip-animate');
    flashcard.classList.toggle('flipped');
    flashcard.addEventListener('transitionend', () => flashcard.classList.remove('flip-animate'), { once: true });
}
function isFlipped() { return flashcard.classList.contains('flipped'); }

// ─── QUEUE ────────────────────────────────────────────────────────────────────
function loadReviewQueue() {
    if (reviewMode === 'srs') {
        reviewQueue = srsDb.getDueWords(0);          // only words with dueDate <= now
    } else {
        reviewQueue = srsDb.getFilteredWords({ sort: 'oldest' }).slice(0, 20);  // original LingQ behaviour
    }
    currentIndex = 0;
    updateCounter();
    renderCurrentCard();
}

function updateCounter() {
    if (!srsCounter) return;
    const remaining = reviewQueue.length - currentIndex;
    srsCounter.textContent = remaining > 0
        ? `${remaining} ${reviewMode === 'srs' ? 'Due' : 'Cards'}`
        : 'All done!';
}

function renderCurrentCard() {
    flashcard.classList.remove(
        'flipped','flip-animate','dragging',
        'swipe-exit-front-right','swipe-exit-front-left','swipe-exit-front-down',
        'swipe-exit-back-right', 'swipe-exit-back-left', 'swipe-exit-back-down'
    );
    flashcard.style.transform = flashcard.style.opacity = flashcard.style.transition = flashcard.style.pointerEvents = '';
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

    const w = reviewQueue[currentIndex];
    elWord.textContent     = w.word;
    elFuri.textContent     = settings.showFurigana ? (w.furi || '') : '';
    elWordBack.textContent = w.word;
    elTrans.textContent    = w.translation;

    _applyModeUI();          // re-wires buttons + hint text
    _updateCardBadge(w);
}

function _updateCardBadge(w) {
    let badge = flashcard.querySelector('#fc-card-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'fc-card-badge';
        badge.style.cssText = 'position:absolute;bottom:14px;right:16px;font-size:11px;color:var(--text-muted);font-variant-numeric:tabular-nums;';
        const front = flashcard.querySelector('.flashcard-front');
        if (front) front.appendChild(badge);
    }
    if (reviewMode === 'srs') {
        const interval = w.interval ?? 0;
        const count    = w.reviewCount ?? 0;
        if (interval > 0) {
            const sec = interval * 86400;
            let intLabel;
            if (sec < 60)         intLabel = `${Math.round(sec)}s`;
            else if (sec < 3600)  intLabel = `${Math.round(sec / 60)}m`;
            else if (sec < 86400) intLabel = `${Math.round(sec / 3600)}h`;
            else                  intLabel = `${Math.round(interval)}d`;
            badge.textContent = `⏱ ${intLabel} · #${count}`;
        } else {
            badge.textContent = '✨ New';
        }
    } else {
        const s = w.status ?? 0;
        const colors = ['#ff4b4b','#ff8c00','#ffb703','#ffd166','#06d6a0','#118ab2'];
        badge.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colors[s]||'#ccc'};margin-right:4px;vertical-align:middle;"></span>Status ${s}`;
    }
}

function _highlightLingqStatus() {
    if (currentIndex >= reviewQueue.length) return;
    const s = reviewQueue[currentIndex].status ?? 0;
    document.querySelectorAll('#fc-status-group .fc-btn').forEach(btn => {
        const match = parseInt(btn.getAttribute('data-status')) === s;
        btn.style.border    = match ? '3px solid #333' : 'none';
        btn.style.transform = match ? 'scale(1.1)' : 'scale(1)';
    });
}

// ─── COMMIT — LingQ ───────────────────────────────────────────────────────────
function commitLingq(newStatus, direction) {
    if (drag.locked) return;
    drag.locked = true;
    srsDb.updateWordStatus(reviewQueue[currentIndex].word, newStatus);
    sessionStorage.setItem('srs-dirty', '1');
    updateSrsBadge();
    if (direction) exitAnimate(direction, nextCard); else nextCard();
}

// ─── COMMIT — SRS (SM-2) ──────────────────────────────────────────────────────
function commitGrade(grade, direction) {
    if (drag.locked) return;
    drag.locked = true;
    srsDb.gradeWord(reviewQueue[currentIndex].word, grade, settings.srsAutoStatus ?? true);
    sessionStorage.setItem('srs-dirty', '1');
    updateSrsBadge();
    if (direction) exitAnimate(direction, nextCard); else nextCard();
}

function nextCard() { currentIndex++; updateCounter(); renderCurrentCard(); }

// ─── SWIPE RESOLUTION ────────────────────────────────────────────────────────
function resolveSwipe(rawDx, rawDy, isHorizontal, isDown, isUp) {
    clearOverlay();
    if (reviewMode === 'srs') {
        let grade, dir;
        if      (isHorizontal && rawDx > 0) { dir='right'; grade=2; }
        else if (isHorizontal)              { dir='left';  grade=0; }
        else if (isDown)                    { dir='down';  grade=1; }
        else if (isUp)                      { dir='up';    grade=3; }
        commitGrade(grade, dir);
    } else {
        const w = reviewQueue[currentIndex];
        let newStatus = w.status ?? 0;
        let dir;
        if      (isHorizontal && rawDx > 0) { dir='right'; if (newStatus<5) newStatus++; }
        else if (isHorizontal)              { dir='left';  if (newStatus>0) newStatus--; }
        else if (isDown)                    { dir='down'; }  // skip
        commitLingq(newStatus, dir);
    }
}

// ─── EXIT ANIMATION ───────────────────────────────────────────────────────────
function exitAnimate(direction, onDone) {
    const exitClass = `swipe-exit-${isFlipped()?'back':'front'}-${direction}`;
    flashcard.classList.remove('flipped','flip-animate');
    flashcard.style.transform = '';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        flashcard.classList.add(exitClass);
        flashcard.addEventListener('animationend', () => { flashcard.classList.remove(exitClass); onDone(); }, { once: true });
    }));
}

// ─── OVERLAYS ─────────────────────────────────────────────────────────────────
const OV = {
    right: 'radial-gradient(ellipse at 0%   50%,rgba(34,197,100,0.52) 0%,transparent 62%)',
    left:  'radial-gradient(ellipse at 100% 50%,rgba(220,50,50,0.52)  0%,transparent 62%)',
    down:  'radial-gradient(ellipse at 50%  0%  ,rgba(140,140,140,0.42) 0%,transparent 62%)',
    up:    'radial-gradient(ellipse at 50% 100%,rgba(99,179,237,0.52)  0%,transparent 62%)',
};
const OV_BACK = {
    right: 'radial-gradient(ellipse at 100% 50%,rgba(34,197,100,0.52) 0%,transparent 62%)',
    left:  'radial-gradient(ellipse at 0%   50%,rgba(220,50,50,0.52)  0%,transparent 62%)',
    down:  'radial-gradient(ellipse at 50%  0%  ,rgba(140,140,140,0.42) 0%,transparent 62%)',
    up:    'radial-gradient(ellipse at 50% 100%,rgba(99,179,237,0.52)  0%,transparent 62%)',
};

function setOverlay(dir, progress) {
    const p = Math.min(progress,1).toFixed(3);
    if (overlayFront) { overlayFront.style.background=OV[dir]||'';      overlayFront.style.opacity=p; }
    if (overlayBack)  { overlayBack.style.background=OV_BACK[dir]||'';  overlayBack.style.opacity=p;  }
    if (hintRight) hintRight.style.opacity = dir==='right' ? Math.min(p*1.5,1).toFixed(3) : '0';
    if (hintLeft)  hintLeft.style.opacity  = dir==='left'  ? Math.min(p*1.5,1).toFixed(3) : '0';
}
function clearOverlay() {
    if (overlayFront) { overlayFront.style.opacity='0'; overlayFront.style.background=''; }
    if (overlayBack)  { overlayBack.style.opacity='0';  overlayBack.style.background='';  }
    if (hintRight) hintRight.style.opacity='0';
    if (hintLeft)  hintLeft.style.opacity='0';
}

// ─── POINTER ENGINE ───────────────────────────────────────────────────────────
function initPointerGestures() {
    flashcardContainer.addEventListener('pointerdown',   onPointerDown);
    flashcardContainer.addEventListener('pointermove',   onPointerMove);
    flashcardContainer.addEventListener('pointerup',     onPointerUp);
    flashcardContainer.addEventListener('pointercancel', onPointerCancel);
}
function onPointerDown(e) {
    if (drag.locked || e.target.tagName==='BUTTON') return;
    drag.active=true; drag.pointerId=e.pointerId;
    drag.startX=drag.currentX=e.clientX; drag.startY=drag.currentY=e.clientY;
    drag.startTime=Date.now(); drag.totalTravel=0;
    try { flashcardContainer.setPointerCapture(e.pointerId); } catch(_){}
    flashcard.classList.remove('flip-animate');
    flashcard.classList.add('dragging');
}
function onPointerMove(e) {
    if (!drag.active||drag.locked||e.pointerId!==drag.pointerId) return;
    drag.currentX=e.clientX; drag.currentY=e.clientY;
    const rawDx=drag.currentX-drag.startX, rawDy=drag.currentY-drag.startY;
    drag.totalTravel=Math.hypot(rawDx,rawDy);
    if (drag.totalTravel<4) return;
    const absDx=Math.abs(rawDx), absDy=Math.abs(rawDy);
    const flip=isFlipped(), dispDx=flip?-rawDx:rawDx;
    if (absDx>=absDy) {
        setOverlay(rawDx>0?'right':'left', absDx/SWIPE_THRESHOLD_PX);
        const angle=(dispDx/(flashcard.offsetWidth||300))*20;
        flashcard.style.transform=`${flip?'rotateY(180deg) ':''}translateX(${dispDx*0.28}px) rotate(${angle}deg)`;
    } else if (rawDy>0) {
        setOverlay('down', absDy/SWIPE_THRESHOLD_PX);
        flashcard.style.transform=`${flip?'rotateY(180deg) ':''}translateY(${rawDy*0.22}px)`;
    } else if (rawDy<0 && reviewMode==='srs') {
        setOverlay('up', absDy/SWIPE_THRESHOLD_PX);
        flashcard.style.transform=`${flip?'rotateY(180deg) ':''}translateY(${rawDy*0.22}px)`;
    } else {
        clearOverlay();
        flashcard.style.transform=flip?'rotateY(180deg)':'';
    }
}
function onPointerUp(e) {
    if (!drag.active||e.pointerId!==drag.pointerId) return;
    drag.active=false;
    flashcard.classList.remove('dragging');
    const rawDx=drag.currentX-drag.startX, rawDy=drag.currentY-drag.startY;
    const absDx=Math.abs(rawDx), absDy=Math.abs(rawDy);
    const vel=absDx/Math.max(Date.now()-drag.startTime,1);
    const isH  = (absDx>SWIPE_THRESHOLD_PX||vel>SWIPE_VELOCITY_PX_MS) && absDx*AXIS_LOCK_RATIO>=absDy;
    const isDn = absDy>SWIPE_THRESHOLD_PX && absDy*AXIS_LOCK_RATIO>absDx && rawDy>0;
    const isUp = reviewMode==='srs' && absDy>SWIPE_THRESHOLD_PX && absDy*AXIS_LOCK_RATIO>absDx && rawDy<0;
    if (isH||isDn||isUp) resolveSwipe(rawDx,rawDy,isH,isDn,isUp); else snapBack();
}
function onPointerCancel(e) {
    if (e.pointerId!==drag.pointerId) return;
    drag.active=false; flashcard.classList.remove('dragging'); snapBack();
}
function snapBack() {
    flashcard.classList.add('flip-animate');
    flashcard.style.transform=isFlipped()?'rotateY(180deg)':'';
    clearOverlay();
    flashcard.addEventListener('transitionend',()=>flashcard.classList.remove('flip-animate'),{once:true});
}

// ─── KEYBOARD FLASH + COMMIT ──────────────────────────────────────────────────
function flashThenCommit(commitFn, arg, dir) {
    let step=0;
    const ramp=setInterval(()=>{
        step++;
        setOverlay(dir,step/12);
        if (step>=12) { clearInterval(ramp); clearOverlay(); commitFn(arg,dir); }
    },30);
}

// ─── KEYBOARD ─────────────────────────────────────────────────────────────────
function initKeyboardControls() {
    document.addEventListener('keydown', e => {
        if (drag.locked||currentIndex>=reviewQueue.length) return;
        if (flashcardContainer.style.display==='none') return;
        if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
        if (reviewMode==='srs') {
            switch(e.key) {
                case 'ArrowRight': e.preventDefault(); flashThenCommit(commitGrade,2,'right'); break;
                case 'ArrowLeft':  e.preventDefault(); flashThenCommit(commitGrade,0,'left');  break;
                case 'ArrowDown':  e.preventDefault(); flashThenCommit(commitGrade,1,'down');  break;
                case 'ArrowUp':    e.preventDefault(); flashThenCommit(commitGrade,3,'up');    break;
                case ' ': case 'Enter': e.preventDefault(); flipCard(); break;
            }
        } else {
            const w=reviewQueue[currentIndex]; let s=w.status??0;
            switch(e.key) {
                case 'ArrowRight': e.preventDefault(); if(s<5)s++; flashThenCommit(commitLingq,s,'right'); break;
                case 'ArrowLeft':  e.preventDefault(); if(s>0)s--; flashThenCommit(commitLingq,s,'left');  break;
                case 'ArrowDown':  e.preventDefault(); flashThenCommit(commitLingq,s,'down'); break;
                case ' ': case 'Enter': e.preventDefault(); flipCard(); break;
            }
        }
    });
}