import * as srsDb from './srs_db.js';

// --- DOM ELEMENTS ---
const listContainer = document.getElementById('vocab-list');
const searchInput = document.getElementById('vocab-search');
const filterSelect = document.getElementById('vocab-filter');
const sortSelect = document.getElementById('vocab-sort');
const countLabel = document.getElementById('vocab-count');
const popupOverlay = document.getElementById('word-popup-overlay');

// Global Status Buttons (in the popup)
const statusButtons = document.querySelectorAll('.status-btn');

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

    // 3. Status Button Listener (To refresh list if changed in popup)
    // We listen to the popup buttons. If the popup is closed, we should re-render the list
    // to reflect the color change immediately.
    const closePopupBtn = document.getElementById('close-popup-btn');
    if (closePopupBtn) {
        closePopupBtn.addEventListener('click', () => {
            // If we are currently viewing the vocab list, refresh it
            if (document.getElementById('view-vocab').classList.contains('active')) {
                renderVocabList();
            }
        });
    }
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
        
        // Status Dot Color logic matches CSS variables
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

        // Click to Open Popup
        row.addEventListener('click', () => openPopupForList(w));

        fragment.appendChild(row);
    });

    listContainer.appendChild(fragment);
}

// Re-using the Popup logic specifically for this list
function openPopupForList(wordData) {
    // Fill DOM elements (These IDs are global in index.html)
    document.getElementById('popup-term').textContent = wordData.word;
    document.getElementById('popup-furi').textContent = wordData.furi || '';
    document.getElementById('popup-base').textContent = wordData.word; // List usually has base forms
    document.getElementById('popup-trans-base').textContent = wordData.translation;
    document.getElementById('popup-trans-context').textContent = "From Vocabulary List"; 
    document.getElementById('popup-note').style.display = 'none'; // No context note in raw list

    // Highlight Status
    statusButtons.forEach(btn => {
        const s = parseInt(btn.getAttribute('data-status'));
        btn.style.border = (s === wordData.status) ? '3px solid #333' : 'none';
        
        // We need to attach the click listener logic here too, 
        // OR rely on the listener already set in viewer_ui.js?
        // PROBLEM: viewer_ui.js listeners rely on `activeWordData` variable inside viewer_ui.js.
        // SOLUTION: We need to set up our own localized "Save" logic or shared logic.
        // For simplicity: We will piggyback on the DOM.
        
        // To avoid conflict, let's just make sure we save the word when a button is clicked.
        // Since `viewer_ui.js` set up listeners on these exact buttons, 
        // we need to make sure we update the database correctly.
        
        // Actually, `viewer_ui.js` listeners use a module-level variable `activeWordData`.
        // If we click a button now, `viewer_ui.js` won't know what word we are talking about.
        
        // HACK/FIX: We will attach a temporary 'onclick' to the buttons just for this session,
        // or better, we create a specific Save function here.
    });

    // Since viewer_ui.js owns the buttons conceptually, we need to overwrite the behavior 
    // or share the state. 
    // Let's implement a clean "Save" handler here that works for this view.
    
    // We'll set a global property on the DOM element wrapper to store which word is active
    document.getElementById('word-popup').dataset.activeWord = wordData.word;

    popupOverlay.classList.remove('hidden');
}

// We need to listen to status clicks globally to handle saves from the List View
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('status-btn')) {
        // Check if we are in List View
        if (document.getElementById('view-vocab').classList.contains('active')) {
            const activeWordText = document.getElementById('word-popup').dataset.activeWord;
            if (activeWordText) {
                const newStatus = parseInt(e.target.getAttribute('data-status'));
                
                // Update DB
                srsDb.updateWordStatus(activeWordText, newStatus);
                
                // Close popup
                popupOverlay.classList.add('hidden');
                
                // Refresh list
                renderVocabList();
            }
        }
    }
});