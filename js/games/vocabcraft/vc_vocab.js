import * as srsDb from '../../srs_db.js';

let _activeQueue = [];

export function setVocabQueue(queue) {
    _activeQueue = queue;
}

export function showCard(mode, container, onResolve) {
    const isNew = mode === 'new'; 
    let wordObj = null;

    const globalSrsData = srsDb.getAllWords();
    const now = new Date();

    if (isNew) {
        let candidates = _activeQueue.filter(w => {
            const entry = globalSrsData[w.word];
            return !entry || entry.status <= 1;
        });
        
        if (candidates.length === 0) {
            candidates = _activeQueue;
        }
        
        wordObj = candidates[Math.floor(Math.random() * candidates.length)];
            
    } else {
        let dueCandidates = _activeQueue.filter(w => {
            const entry = globalSrsData[w.word];
            if (!entry) return false; 
            if (!entry.dueDate) return true; 
            return new Date(entry.dueDate) <= now; 
        });

        if (dueCandidates.length === 0) {
            dueCandidates = _activeQueue.filter(w => globalSrsData[w.word]);
        }
        
        if (dueCandidates.length === 0) {
            dueCandidates = _activeQueue;
        }

        wordObj = dueCandidates[Math.floor(Math.random() * dueCandidates.length)];
    }

    if (!wordObj) {
        onResolve(true); 
        return;
    }

    const pool = _activeQueue.filter(w => w.word !== wordObj.word).map(w => w.trans);
    const distractors = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [...distractors, wordObj.trans].sort(() => 0.5 - Math.random());

    const header = container.querySelector('.vc-vocab-header');
    const grid = container.querySelector('.vc-vocab-grid');
    
    header.innerHTML = `
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
            
            if (!isNew) {
                srsDb.gradeWord(wordObj.word, isCorrect ? 3 : 0, true);
            } else if (isCorrect) {
                srsDb.gradeWord(wordObj.word, 2, true);
            }

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