import * as srsDb from '../../srs_db.js';

let _activeQueue = [];

export function setVocabQueue(queue) {
    _activeQueue = queue;
}

export function showCard(mode, container, onResolve) {
    if (_activeQueue.length === 0) {
        onResolve(true);
        return;
    }

    // mode corresponds to 'new' (enrage) or 'mixed' (normal review)
    const selectionMode = mode === 'new' ? 'new' : 'mixed';
    const result = srsDb.getNextGameWord(_activeQueue, selectionMode);
    
    const wordObj = result.wordObj;
    const type = result.type;

    if (!wordObj) {
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
            btn.classList.add(isCorrect ? 'correct' : 'wrong');
            
            if (!isCorrect) {
                [...grid.children].find(b => b.textContent === wordObj.trans).classList.add('correct');
            }
            
            // Centralized game grading
            srsDb.gradeWordInGame({
                word: wordObj.word,
                furi: wordObj.furi,
                translation: wordObj.trans
            }, isCorrect ? 2 : 0, true);

            [...grid.children].forEach(b => b.disabled = true);

            setTimeout(() => {
                container.classList.remove('active');
                onResolve(isCorrect);
            }, 600);
        };
        grid.appendChild(btn);
    });

    container.classList.add('active');
}