
import * as srsDb from '../../srs_db.js';

let _activeQueue =[];
let _cardBusy = false;  // prevent re-entrant card showing

export function setVocabQueue(queue) {
    _activeQueue = queue;
}

export function showCard(mode, container, onResolve) {
    if (_activeQueue.length === 0) {
        onResolve(true);
        return;
    }

    // Guard: if a card is already open, don't stack another one.
    // Resolve immediately as success so the engine doesn't get stuck paused.
    if (_cardBusy) {
        onResolve(true);
        return;
    }
    _cardBusy = true;

    // mode corresponds to 'new' (enrage) or 'mixed' (normal review)
    const selectionMode = mode === 'new' ? 'new' : 'mixed';
    const result = srsDb.getNextGameWord(_activeQueue, selectionMode);
    
    const wordObj = result.wordObj;
    const type = result.type;

    if (!wordObj) {
        _cardBusy = false;
        onResolve(true); 
        return;
    }

    let dotClass = 'due';
    let dotTitle = 'Scheduled Review';
    if (type === 'drill') {
        dotClass = 'drill';
        dotTitle = 'Free Drill (Not Due)';
    } else if (type === 'new') {
        dotClass = 'new';
        dotTitle = 'New Word';
    }

    const pool = _activeQueue.filter(w => w.word !== wordObj.word).map(w => w.trans);
    const distractors = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [...distractors, wordObj.trans].sort(() => 0.5 - Math.random());

    const header = container.querySelector('.vc-vocab-header');
    const grid = container.querySelector('.vc-vocab-grid');
    
    header.innerHTML = `
        <div class="vc-status-dot ${dotClass}" title="${dotTitle}"></div>
        <div class="vc-vocab-furi">${wordObj.furi || ''}</div>
        <div class="vc-vocab-kanji">${wordObj.word}</div>
    `;

    grid.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'vc-vocab-opt';
        btn.textContent = opt;
        btn.onclick = () => {
            const isCorrect = opt === wordObj.trans;

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

                srsDb.gradeWordInGame({ word: wordObj.word, furi: wordObj.furi, translation: wordObj.trans }, 2, true);
                [...grid.children].forEach(b => b.disabled = true);

                setTimeout(() => {
                    badge.style.opacity = '0';
                    _hideOverlay(container, () => { badge.remove(); onResolve(true); });
                }, 200);

            } else {
                // Wrong: reveal correct answer, pause so player reads it
                btn.classList.add('wrong');
                const correctBtn = [...grid.children].find(b => b.textContent === wordObj.trans);
                if (correctBtn) correctBtn.classList.add('correct');

                srsDb.gradeWordInGame({ word: wordObj.word, furi: wordObj.furi, translation: wordObj.trans }, 0, true);
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