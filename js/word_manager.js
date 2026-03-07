import * as srsDb from './srs_db.js';
import { openPopup, closePopup } from './popup_manager.js';

// --- DOM ELEMENTS ---
const listContainer = document.getElementById('vocab-list');
const searchInput = document.getElementById('vocab-search');
const filterSelect = document.getElementById('vocab-filter');
const sortSelect = document.getElementById('vocab-sort');
const countLabel = document.getElementById('vocab-count');

let currentList = [];

export function initWordManager() {
    // 1. Hook into the Tab button to reload list when opened
    const vocabTabBtn = document.querySelector('button[data-target="view-vocab"]');
    if (vocabTabBtn) {
        vocabTabBtn.addEventListener('click', renderVocabList);
    }

    // 2. Event Listeners for Controls
    searchInput.addEventListener('input', renderVocabList);
    filterSelect.addEventListener('change', renderVocabList);
    sortSelect.addEventListener('change', renderVocabList);
}

export function renderVocabList() {
    listContainer.innerHTML = '';
    
    // 1. Get all words
    let words = Object.values(srsDb.getAllWords());

    // 2. Filter
    const filterVal = filterSelect.value;
    const searchVal = searchInput.value.toLowerCase();

    words = words.filter(w => {
        // Status Filter
        if (filterVal !== 'all' && w.status !== parseInt(filterVal)) return false;
        
        // Search Filter
        if (searchVal) {
            const matchWord = w.word.toLowerCase().includes(searchVal);
            const matchFuri = (w.furi || '').toLowerCase().includes(searchVal);
            const matchTrans = (w.translation || '').toLowerCase().includes(searchVal);
            if (!matchWord && !matchFuri && !matchTrans) return false;
        }
        return true;
    });

    // 3. Sort
    const sortVal = sortSelect.value;
    words.sort((a, b) => {
        if (sortVal === 'newest') return new Date(b.lastUpdated) - new Date(a.lastUpdated);
        if (sortVal === 'oldest') return new Date(a.lastUpdated) - new Date(b.lastUpdated);
        if (sortVal === 'az') return a.word.localeCompare(b.word);
        if (sortVal === 'status_asc') return a.status - b.status;
        if (sortVal === 'status_desc') return b.status - a.status;
        return 0;
    });

    // 4. Update Count
    countLabel.textContent = words.length;

    // 5. Render
    if (words.length === 0) {
        listContainer.innerHTML = `<div class="placeholder-text">No words found.</div>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    words.forEach(w => {
        const row = document.createElement('div');
        row.className = 'vocab-row';
        
        const statusColors = [
            'var(--status-0)', 
            'var(--status-1)', 
            'var(--status-2)', 
            'var(--status-3)', 
            'var(--status-4)', 
            'var(--status-5)'
        ];

        row.innerHTML = `
            <div class="vocab-status-dot" style="background-color: ${statusColors[w.status] || '#ccc'}"></div>
            <div class="vocab-info">
                <div class="vocab-main-line">
                    <span class="vocab-word">${w.word}</span>
                    <span class="vocab-furi">${w.furi || ''}</span>
                </div>
                <div class="vocab-trans">${w.translation || 'No translation'}</div>
            </div>
        `;

        row.addEventListener('click', () => _openPopupForWord(w));
        fragment.appendChild(row);
    });

    listContainer.appendChild(fragment);
}

function _openPopupForWord(wordData) {
    // Normalise the word_manager word shape into the token shape popup_manager expects
    const token = {
        surface:       wordData.word,
        base:          wordData.word,
        furi:          wordData.furi        || '',
        roma:          '',
        trans_base:    wordData.translation || '',
        trans_context: 'From Vocabulary List',
        note:          '',
        translation:   wordData.translation || '',
    };

    openPopup(token, {
        onSave: (wd, newStatus) => {
            srsDb.updateWordStatus(wd.word || wd.base, newStatus);
            closePopup();
            renderVocabList();
        }
    });
}