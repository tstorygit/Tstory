// vc_vocab.js — VocabCraft's vocab layer.
//
// All word selection and grading is delegated to GameVocabManager per the
// app-wide contract (Overview.md §4/§7): game modules never touch srs_db or
// vocab localStorage directly.
//
//  • SRS pools (deckId:'srs')  → Global mode: every answer grades the player's
//    real SRS schedule immediately; unscheduled words follow the standard rule
//    (correct = no interval promotion, wrong = counts).
//  • Custom decks              → Local SM-2 engine inside the manager; newly
//    learned words are pushed to the app SRS at session end via
//    endVocabSession() with the safe 'skip' policy.
import { GameVocabManager } from '../../game_vocab_mgr.js';

const BANNED_KEY = 'vocabcraft_banned';

let _mgr = null;
let _cardBusy = false;  // prevent re-entrant card showing

export function setVocabQueue(queue) {
    _mgr = new GameVocabManager(GameVocabManager.defaultConfig());
    _mgr.setPool(queue || [], BANNED_KEY, {
        globalSrs: (queue || []).some(w => w.deckId === 'srs')
    });
    // Local (custom deck) mode: seed a starting batch so 'auto' mode has
    // material to schedule. No-op in Global SRS mode.
    if (!_mgr.isGlobalSrs) _mgr.seedInitialWords(5);
}

/**
 * Flush locally-learned words into the app SRS (custom decks only — a no-op
 * for Global SRS pools where answers are already live). Call at run end.
 */
export function endVocabSession() {
    if (_mgr) _mgr.exportToAppSrs(null, 'skip');
}

export function showCard(mode, container, onResolve) {
    if (!_mgr || _mgr._pool.length === 0) {
        onResolve(true);
        return;
    }

    // Guard: if a card is already open, don't stack another one.
    // Resolve immediately as success so the engine doesn't get stuck paused.
    if (_cardBusy) {
        onResolve(true);
        return;
    }

    const challenge = _mgr.getNextWord(null, 4);
    if (!challenge || !challenge.wordObj) {
        onResolve(true);
        return;
    }
    _cardBusy = true;

    const wordObj = challenge.wordObj; // { id, kanji, kana, eng, pos }

    // Badge dot: real scheduled reviews vs everything else
    let dotClass = 'drill', dotTitle = 'Free Drill (not due)';
    if (challenge.type === 'due' || challenge.type === 'leech') {
        dotClass = 'due';  dotTitle = 'Scheduled Review';
    } else if (challenge.type === 'new') {
        dotClass = 'new';  dotTitle = 'New Word';
    }

    const header = container.querySelector('.vc-vocab-header');
    const grid = container.querySelector('.vc-vocab-grid');

    header.innerHTML = `
        <div class="vc-status-dot ${dotClass}" title="${dotTitle}"></div>
        <div class="vc-vocab-furi">${wordObj.kana !== wordObj.kanji ? (wordObj.kana || '') : ''}</div>
        <div class="vc-vocab-kanji">${wordObj.kanji}</div>
    `;

    grid.innerHTML = '';
    challenge.options.forEach((opt, optIdx) => {
        const btn = document.createElement('button');
        btn.className = 'vc-vocab-opt';
        btn.textContent = opt;
        btn.onclick = () => {
            const isCorrect = optIdx === challenge.correctIdx;
            _mgr.gradeWord(challenge.refId, isCorrect);

            if (isCorrect) {
                // Flash green, show big ✓, close fast
                btn.classList.add('correct');
                const badge = document.createElement('div');
                badge.textContent = '✓';
                badge.style.cssText =[
                    'position:absolute', 'top:50%', 'left:50%',
                    'transform:translate(-50%,-50%) scale(0)',
                    'font-size:52px', 'font-weight:900', 'color:#2ecc71',
                    'text-shadow:0 0 20px #2ecc71, 0 2px 4px #000',
                    'pointer-events:none', 'z-index:9999',
                    'transition:transform 0.12s ease-out, opacity 0.15s ease-in 0.08s'
                ].join(';');
                // Fixed: Do NOT set container.style.position = 'relative'
                // Doing so knocks the fixed modal overlay into standard document flow,
                // causing subsequent modals to render far down the screen.
                container.appendChild(badge);
                requestAnimationFrame(() => { badge.style.transform = 'translate(-50%,-50%) scale(1)'; });

                [...grid.children].forEach(b => b.disabled = true);

                setTimeout(() => {
                    badge.style.opacity = '0';
                    _hideOverlay(container, () => { badge.remove(); onResolve(true); });
                }, 200);

            } else {
                // Wrong: reveal correct answer, pause so player reads it
                btn.classList.add('wrong');
                const correctBtn = grid.children[challenge.correctIdx];
                if (correctBtn) correctBtn.classList.add('correct');

                [...grid.children].forEach(b => b.disabled = true);

                setTimeout(() => {
                    _hideOverlay(container, () => { onResolve(false); });
                }, 900);
            }
        };
        grid.appendChild(btn);
    });

    // Show: make visible (display:flex), then fade in next frame
    container.classList.remove('active');
    container.classList.remove('visible');
    void container.offsetHeight;
    container.classList.add('visible');
    requestAnimationFrame(() => container.classList.add('active'));
}

function _hideOverlay(container, cb) {
    container.classList.remove('active'); // fade out via opacity transition
    setTimeout(() => {
        container.classList.remove('visible'); // then display:none
        _cardBusy = false;
        if (cb) cb();
    }, 200); // matches transition duration
}
