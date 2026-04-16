/**
 * word_manager.js
 * Vocabulary List tab — shows all words currently in srs_db.
 * Pure read/filter/sort view. No import logic here.
 */

import * as srsDb from './srs_db.js';
import { openPopup, closePopup } from './popup_manager.js';

// --- DOM ELEMENTS ---
const listContainer = document.getElementById('vocab-list');
const searchInput   = document.getElementById('vocab-search');
const filterSelect  = document.getElementById('vocab-filter');
const sortSelect    = document.getElementById('vocab-sort');
const countLabel    = document.getElementById('vocab-count');

export function initWordManager() {
    const vocabTabBtn = document.querySelector('button[data-target="view-vocab"]');
    if (vocabTabBtn) vocabTabBtn.addEventListener('click', renderVocabList);

    searchInput.addEventListener('input',  renderVocabList);
    filterSelect.addEventListener('change', renderVocabList);
    sortSelect.addEventListener('change',   renderVocabList);

    document.addEventListener('srs:furi-changed', () => {
        const viewVocab = document.getElementById('view-vocab');
        if (viewVocab && viewVocab.classList.contains('active')) {
            renderVocabList();
        }
    });
}

export function renderVocabList() {
    listContainer.innerHTML = '';

    let words = Object.values(srsDb.getAllWords());

    // Filter
    const filterVal = filterSelect.value;
    const searchVal = searchInput.value.toLowerCase();
    words = words.filter(w => {
        if (filterVal !== 'all' && w.status !== parseInt(filterVal)) return false;
        if (searchVal) {
            const m = w.word.toLowerCase().includes(searchVal)
                   || (w.furi        || '').toLowerCase().includes(searchVal)
                   || (w.translation || '').toLowerCase().includes(searchVal);
            if (!m) return false;
        }
        return true;
    });

    // Sort
    const sortVal = sortSelect.value;
    words.sort((a, b) => {
        if (sortVal === 'newest')      return new Date(b.lastUpdated) - new Date(a.lastUpdated);
        if (sortVal === 'oldest')      return new Date(a.lastUpdated) - new Date(b.lastUpdated);
        if (sortVal === 'az')          return a.word.localeCompare(b.word);
        if (sortVal === 'status_asc')  return a.status - b.status;
        if (sortVal === 'status_desc') return b.status - a.status;
        
        if (sortVal === 'due_asc') {
            const timeA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const timeB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            return timeA - timeB;
        }
        if (sortVal === 'due_desc') {
            const timeA = a.dueDate ? new Date(a.dueDate).getTime() : -Infinity;
            const timeB = b.dueDate ? new Date(b.dueDate).getTime() : -Infinity;
            return timeB - timeA;
        }
        if (sortVal === 'interval_asc') {
            const intA = a.interval ?? Infinity;
            const intB = b.interval ?? Infinity;
            return intA - intB;
        }
        if (sortVal === 'interval_desc') {
            const intA = a.interval ?? -1;
            const intB = b.interval ?? -1;
            return intB - intA;
        }
        if (sortVal === 'ai_updated_asc') {
            const timeA = a.aiUpdated ? new Date(a.aiUpdated).getTime() : 0;
            const timeB = b.aiUpdated ? new Date(b.aiUpdated).getTime() : 0;
            return timeA - timeB;
        }
        
        return 0;
    });

    countLabel.textContent = words.length;

    if (words.length === 0) {
        listContainer.innerHTML = `<div class="placeholder-text">No words found.</div>`;
        return;
    }

    const statusColors = ['var(--status-0)','var(--status-1)','var(--status-2)',
                          'var(--status-3)','var(--status-4)','var(--status-5)'];

    const fragment = document.createDocumentFragment();
    words.forEach(w => {
        const row = document.createElement('div');
        row.className = 'vocab-row';

        // Badge: show interval + time-until-due if the word has SRS scheduling data
        const hasSrs = w.dueDate !== undefined;
        let srsBadge = '';
        if (hasSrs) {
            const interval   = w.interval ?? 0;
            const now        = Date.now();
            const dueMs      = new Date(w.dueDate).getTime();
            const diffMs     = dueMs - now;
            let dueLabel;
            if (diffMs <= 0) {
                dueLabel = 'due now';
            } else {
                const diffMin = Math.round(diffMs / 60000);
                const diffH   = Math.round(diffMs / 3600000);
                const diffD   = Math.round(diffMs / 86400000);
                if (diffMin < 60)      dueLabel = `in ${diffMin}m`;
                else if (diffH < 24)   dueLabel = `in ${diffH}h`;
                else                   dueLabel = `in ${diffD}d`;
            }
            // Format interval in the most readable unit
            const intervalSec = interval * 86400;
            let intLabel;
            if (intervalSec < 60)          intLabel = `${Math.round(intervalSec)}s`;
            else if (intervalSec < 3600)   intLabel = `${Math.round(intervalSec / 60)}m`;
            else if (intervalSec < 86400)  intLabel = `${Math.round(intervalSec / 3600)}h`;
            else                           intLabel = `${Math.round(interval)}d`;
            srsBadge = `<span class="vocab-srs-badge" title="SRS interval ${intLabel} · ${dueLabel}">⏱ ${intLabel} · ${dueLabel}</span>`;
        }

        const aiDateText = w.aiUpdated ? new Date(w.aiUpdated).toLocaleDateString() : 'Unenriched';

        row.innerHTML = `
            <div class="vocab-status-dot" style="background-color:${statusColors[w.status]||'#ccc'}"></div>
            <div class="vocab-info">
                <div class="vocab-main-line">
                    <span class="vocab-word">${w.word}</span>
                    ${w.base && w.base !== w.word ? `<span style="font-size:12px; color:var(--text-muted); font-weight:normal; margin-left:4px;">(${w.base})</span>` : ''}
                    <span class="vocab-furi" style="margin-left:4px;">${w.furi || ''}</span>
                    ${srsBadge}
                </div>
                <div class="vocab-trans">
                    ${w.translation || 'No translation'}
                    <span style="font-size:10px; color:var(--text-muted); margin-left:8px;" title="AI Enriched Date">✨ ${aiDateText}</span>
                </div>
            </div>
            <div class="vocab-actions">
                <button class="vocab-edit-btn" title="Edit Reading" aria-label="Edit Reading">⚙️</button>
                <button class="vocab-delete-btn" title="Delete word" aria-label="Delete ${w.word}">🗑</button>
            </div>
        `;
        
        row.querySelector('.vocab-edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const newFuri = prompt(`Edit reading for ${w.word}:`, w.furi || '');
            if (newFuri !== null) {
                srsDb.updateWordFuri(w.word, newFuri.trim());
                renderVocabList();
            }
        });

        row.querySelector('.vocab-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            _confirmDelete(w.word);
        });
        
        row.addEventListener('click', () => _openPopupForWord(w));
        fragment.appendChild(row);
    });
    listContainer.appendChild(fragment);
}

function _openPopupForWord(wordData) {
    const token = {
        surface:       wordData.word,
        base:          wordData.base || wordData.word,
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

function _confirmDelete(wordText) {
    // Remove any existing confirm banner first
    const existing = listContainer.querySelector('.vocab-delete-confirm');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'vocab-delete-confirm';
    banner.innerHTML = `
        <span>Delete <strong>${wordText}</strong> from your SRS deck?</span>
        <button class="vocab-delete-confirm-yes">Delete</button>
        <button class="vocab-delete-confirm-no">Cancel</button>
    `;

    // Find the row for this word and insert banner right after it
    const rows = [...listContainer.querySelectorAll('.vocab-row')];
    const targetRow = rows.find(r => r.querySelector('.vocab-word')?.textContent === wordText);
    if (targetRow) {
        targetRow.after(banner);
        targetRow.classList.add('vocab-row-pending-delete');
    } else {
        listContainer.prepend(banner);
    }

    banner.querySelector('.vocab-delete-confirm-yes').addEventListener('click', () => {
        srsDb.deleteWord(wordText);
        renderVocabList();
    });
    banner.querySelector('.vocab-delete-confirm-no').addEventListener('click', () => {
        banner.remove();
        targetRow?.classList.remove('vocab-row-pending-delete');
    });
}