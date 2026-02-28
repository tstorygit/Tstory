import * as srsDb from './srs_db.js';
import { settings } from './settings.js';

// --- STATE ---
let reviewQueue = [];
let currentIndex = 0;
let touchStartX = 0;
let touchStartY = 0;

// --- DOM ELEMENTS ---
const srsContent = document.getElementById('srs-content');
const flashcardContainer = document.getElementById('flashcard-container');
const flashcard = document.getElementById('flashcard');
const emptyState = document.getElementById('srs-empty-state');
const srsCounter = document.getElementById('srs-counter');

// Card Content Elements
const elFuri = document.getElementById('fc-furi');
const elWord = document.getElementById('fc-word');
const elWordBack = document.getElementById('fc-word-back');
const elTrans = document.getElementById('fc-trans');
const elStatusBtns = document.querySelectorAll('.fc-btn');

export function initSRS() {
    // 1. Hook into the SRS Tab button to reload queue when opened
    const srsTabBtn = document.querySelector('button[data-target="view-srs"]');
    if (srsTabBtn) {
        srsTabBtn.addEventListener('click', loadReviewQueue);
    }

    // 2. Card Flip Interaction (Click/Tap)
    // We bind to container to avoid issues when the card transforms
    flashcardContainer.addEventListener('click', (e) => {
        // Don't flip if clicking a button inside the card
        if (e.target.tagName === 'BUTTON') return;
        flashcard.classList.toggle('flipped');
    });

    // 3. Status Button Interactions (Back of card)
    elStatusBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card flip
            const newStatus = parseInt(e.target.getAttribute('data-status'));
            updateCardStatus(newStatus);
        });
    });

    // 4. Swipe Gesture Handling
    initSwipeGestures();

    // 5. Initial Load
    loadReviewQueue();
}

/**
 * Loads words from DB, filters for review, and sorts by oldest update.
 */
function loadReviewQueue() {
    // Criteria: Get all words, sort by lastUpdated (Oldest first)
    // In a real app, you might filter specific statuses (e.g. exclude status 0 or 5).
    // Here we include everything except "Unknown" (status 0 means not really learned yet, but we can review it)
    // Let's filter: Show me things I have interacted with (Status > 0) OR things marked explicitly as 0.
    
    // Get all words sorted by date
    const allWords = srsDb.getFilteredWords({ sort: 'oldest' });
    
    // For this simple queue, let's take everything that isn't brand new (optional)
    // or just take everything. Let's take the first 20 oldest words.
    reviewQueue = allWords.slice(0, 20);
    currentIndex = 0;

    updateCounter();
    renderCurrentCard();
}

function updateCounter() {
    if (srsCounter) {
        const remaining = reviewQueue.length - currentIndex;
        srsCounter.textContent = remaining > 0 ? `${remaining} Due` : "Complete";
    }
}

function renderCurrentCard() {
    // Clean up previous animations/states
    flashcard.classList.remove('flipped', 'swipe-right-anim', 'swipe-left-anim');
    flashcard.style.display = 'block'; // Reset display if hidden by animation

    if (currentIndex >= reviewQueue.length) {
        // Queue finished
        flashcardContainer.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    // Show Card
    flashcardContainer.style.display = 'block';
    emptyState.style.display = 'none';

    const wordData = reviewQueue[currentIndex];

    // Populate Front
    elWord.textContent = wordData.word;
    elFuri.textContent = settings.showFurigana ? (wordData.furi || '') : '';

    // Populate Back
    elWordBack.textContent = wordData.word;
    elTrans.textContent = wordData.translation;

    // Highlight current status button
    elStatusBtns.forEach(btn => {
        const s = parseInt(btn.getAttribute('data-status'));
        btn.style.border = (s === wordData.status) ? '3px solid #333' : 'none';
        btn.style.transform = (s === wordData.status) ? 'scale(1.1)' : 'scale(1)';
    });
}

/**
 * Updates status, plays animation, moves to next card.
 * @param {number} newStatus 
 * @param {string} animationClass - optional CSS class for swipe animation
 */
function updateCardStatus(newStatus, animationClass = null) {
    const currentWord = reviewQueue[currentIndex];
    
    // Save to DB
    srsDb.updateWordStatus(currentWord.word, newStatus);

    // Play Animation if provided (Swipe)
    if (animationClass) {
        flashcard.classList.add(animationClass);
        // Wait for animation to finish before swapping data
        setTimeout(nextCard, 500); 
    } else {
        // Immediate update if button clicked
        nextCard();
    }
}

function nextCard() {
    currentIndex++;
    updateCounter();
    renderCurrentCard();
}

/**
 * Swipe Logic
 * Swipe Right = Increase Status (+1)
 * Swipe Left = Decrease Status (-1)
 */
function initSwipeGestures() {
    flashcardContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    flashcardContainer.addEventListener('touchend', (e) => {
        if (!flashcard.classList.contains('flipped')) return; // Only allow swipe on BACK of card? 
        // Actually, users usually like swiping the front too. Let's allow swiping ONLY on the BACK to prevent accidental grading while trying to flip.
        // OR: Allow both. Let's allow only on BACK for safety, as swiping the front usually means "I know this" but we want them to see the answer first.
        
        // DECISION: Allow swipe on BACK side only to ensure they checked the answer.
        if (!flashcard.classList.contains('flipped')) {
           // Optional: You can remove this check if you want 'Speed Review' mode
           return; 
        }

        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        
        handleSwipe(touchEndX, touchEndY);
    }, { passive: true });
}

function handleSwipe(endX, endY) {
    const diffX = endX - touchStartX;
    const diffY = endY - touchStartY;

    // We require a horizontal swipe of at least 50px
    // We also check that the horizontal movement is greater than vertical (to ignore scrolling)
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
        const currentWord = reviewQueue[currentIndex];
        let newStatus = currentWord.status;

        if (diffX > 0) {
            // SWIPE RIGHT -> Increase
            if (newStatus < 5) newStatus++;
            updateCardStatus(newStatus, 'swipe-right-anim');
        } else {
            // SWIPE LEFT -> Decrease
            if (newStatus > 0) newStatus--;
            updateCardStatus(newStatus, 'swipe-left-anim');
        }
    }
}