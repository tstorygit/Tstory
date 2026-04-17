/**
 * data_ui.js
 * Renders and drives the "Data" tab UI.
 * All button wiring is done via addEventListener — no inline onclick / window globals.
 */

import { getStoryList } from './story_mgr.js';
import * as dataMgr from './data_mgr.js';
import { generateText } from './ai_api.js';
import * as srsDb from './srs_db.js';

// ─── INIT ────────────────────────────────────────────────────────────────────

export function initDataManager() {
    // Populate sync URL from storage/default immediately
    document.getElementById('data-sync-url').value = dataMgr.getSyncUrl();

    // Re-render story list every time the Data tab is opened
    const tab = document.querySelector('button[data-target="view-data"]');
    if (tab) tab.addEventListener('click', renderStoryList);

    // AI Enrich Tool
    document.getElementById('btn-enrich-vocab')?.addEventListener('click', handleEnrichVocab);

    // Merge Duplicates Tool
    document.getElementById('btn-merge-vocab')?.addEventListener('click', handleMergeVocab);

    // Export toolbar
    document.getElementById('btn-select-all').addEventListener('click', () => {
        document.querySelectorAll('.story-checkbox').forEach(cb => cb.checked = true);
    });
    document.getElementById('btn-select-none').addEventListener('click', () => {
        document.querySelectorAll('.story-checkbox').forEach(cb => cb.checked = false);
    });
    document.getElementById('btn-download-zip').addEventListener('click', handleExport);

    // Import
    document.getElementById('data-import-file').addEventListener('change', handleImportFileChange);
    document.getElementById('btn-confirm-import').addEventListener('click', handleImportConfirm);

    // Sync
    document.getElementById('btn-sync-now').addEventListener('click', handleSync);

    // Initial render
    renderStoryList();
}

// ─── AI ENRICH VOCAB ─────────────────────────────────────────────────────────

async function handleEnrichVocab() {
    const btn = document.getElementById('btn-enrich-vocab');
    if (!btn) return;
    
    showStatus('enrich-status', 'loading', 'Fetching words...');
    btn.disabled = true;

    try {
        const wordsToUpdate = srsDb.getWordsNeedingEnrichment(50);
        if (wordsToUpdate.length === 0) {
            showStatus('enrich-status', 'success', 'No words found in SRS.');
            return;
        }

        showStatus('enrich-status', 'loading', `Analyzing ${wordsToUpdate.length} words...`);

        const wordList = wordsToUpdate.map(w => w.word);
        const prompt = JSON.stringify(wordList);
        const sys = `You are a Japanese NLP tool. Return a JSON object mapping each exact input string to its dictionary base form and part-of-speech. Pos categories: "noun", "verb", "adjective", "adverb", "particle", "expression", "other". Example:["食べた", "猫"] -> {"食べた": {"base": "食べる", "pos": "verb"}, "猫": {"base": "猫", "pos": "noun"}}. Return ONLY valid JSON without markdown formatting.`;

        const response = await generateText(prompt, sys, true);
        let cleaned = response.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        const updates = [];
        for (const [key, val] of Object.entries(parsed)) {
            if (typeof val === 'string') {
                updates.push({ key, base: val, pos: 'other' });
            } else {
                updates.push({ key, base: val.base || key, pos: val.pos || 'other' });
            }
        }

        showEnrichReviewModal(updates);
        hideStatus('enrich-status');

    } catch (err) {
        showStatus('enrich-status', 'error', `Error: ${err.message}`);
    } finally {
        btn.disabled = false;
    }
}

function showEnrichReviewModal(updates) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;';
    
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--surface-color);width:100%;max-width:600px;max-height:85vh;border-radius:12px;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,0.5);overflow:hidden;';
    
    const header = document.createElement('div');
    header.style.cssText = 'padding:15px 20px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;';
    header.innerHTML = `<h3 style="margin:0;font-size:18px;color:var(--text-main);">Review Enriched Forms</h3>`;
    
    const list = document.createElement('div');
    list.style.cssText = 'padding:15px 20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:10px;';
    
    const posOptions =["noun", "verb", "adjective", "adverb", "particle", "expression", "other"];
    
    updates.forEach((u, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;background:var(--bg-color);padding:10px;border-radius:8px;border:1px solid var(--border-color);';
        
        const selectHtml = posOptions.map(p => `<option value="${p}" ${u.pos === p ? 'selected' : ''}>${p}</option>`).join('');
        
        row.innerHTML = `
            <div style="flex:1;font-weight:bold;color:var(--text-main);font-size:16px;">${u.key}</div>
            <div style="color:var(--text-muted);">→</div>
            <input type="text" id="enrich-base-${i}" value="${u.base}" style="flex:1;padding:8px;border:1px solid var(--border-color);border-radius:6px;background:var(--surface-color);color:var(--text-main);font-size:14px;">
            <select id="enrich-pos-${i}" style="width:120px;padding:8px;border:1px solid var(--border-color);border-radius:6px;background:var(--surface-color);color:var(--text-main);font-size:14px;">
                ${selectHtml}
            </select>
        `;
        list.appendChild(row);
    });
    
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:15px 20px;border-top:1px solid var(--border-color);display:flex;gap:10px;background:var(--bg-color);';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'flex:1;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:transparent;color:var(--text-main);cursor:pointer;font-weight:bold;';
    cancelBtn.onclick = () => overlay.remove();
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Updates';
    saveBtn.className = 'primary-btn';
    saveBtn.style.flex = '2';
    saveBtn.onclick = () => {
        const finalUpdates = updates.map((u, i) => ({
            key: u.key,
            base: document.getElementById(`enrich-base-${i}`).value.trim() || u.key,
            pos: document.getElementById(`enrich-pos-${i}`).value
        }));
        srsDb.batchUpdateBases(finalUpdates);
        overlay.remove();
        showStatus('enrich-status', 'success', `Successfully enriched and saved ${finalUpdates.length} words!`);
    };
    
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    
    box.appendChild(header);
    box.appendChild(list);
    box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// ─── MERGE DUPLICATES ────────────────────────────────────────────────────────

function handleMergeVocab() {
    const btn = document.getElementById('btn-merge-vocab');
    if (!btn) return;

    const words = Object.values(srsDb.getAllWords());
    const groups = {};

    words.forEach(w => {
        const b = w.base || w.word;
        if (!groups[b]) groups[b] = [];
        groups[b].push(w);
    });

    const dupes = Object.entries(groups).filter(([base, arr]) => arr.length > 1);

    if (dupes.length === 0) {
        showStatus('merge-status', 'success', 'No duplicates found!');
        return;
    }

    showMergeModal(dupes);
}

function showMergeModal(dupes) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;';
    
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--surface-color);width:100%;max-width:600px;max-height:85vh;border-radius:12px;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,0.5);overflow:hidden;';
    
    const header = document.createElement('div');
    header.style.cssText = 'padding:15px 20px;border-bottom:1px solid var(--border-color);';
    header.innerHTML = `<h3 style="margin:0;font-size:18px;color:var(--text-main);">Merge Duplicates</h3><p style="margin:5px 0 0;font-size:13px;color:var(--text-muted);">Select the primary entry to keep. Others in the group will be deleted.</p>`;
    
    const list = document.createElement('div');
    list.style.cssText = 'padding:15px 20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:20px;';
    
    dupes.forEach((group, gIdx) => {
        const baseForm = group[0];
        const variants = group[1];
        
        // sort variants by interval descending
        variants.sort((a, b) => (b.interval || 0) - (a.interval || 0));
        const keeperWord = variants[0].word;
        
        const groupEl = document.createElement('div');
        groupEl.className = 'merge-group';
        groupEl.style.cssText = 'border:1px solid var(--border-color);border-radius:8px;padding:12px;background:var(--bg-color);';
        groupEl.innerHTML = `<div style="font-weight:bold;margin-bottom:10px;font-size:15px;color:var(--primary-color);">Base: ${baseForm}</div>`;
        
        variants.forEach((v, vIdx) => {
            const isSelected = v.word === keeperWord;
            const variantEl = document.createElement('label');
            variantEl.className = `merge-variant ${isSelected ? 'selected' : ''}`;
            variantEl.style.cssText = `display:flex;align-items:center;gap:12px;padding:12px;border:2px solid ${isSelected ? 'var(--primary-color)' : 'transparent'};border-radius:8px;cursor:pointer;transition:all 0.2s;background:var(--surface-color);margin-bottom:8px;`;
            
            const intervalText = v.interval ? `${v.interval.toFixed(1)} days` : '0 days (New)';
            const statusText = `Status ${v.status || 0}`;
            
            variantEl.innerHTML = `
                <input type="radio" name="merge_group_${gIdx}" value="${v.word}" ${isSelected ? 'checked' : ''} style="display:none;">
                <div style="width:20px;height:20px;border-radius:50%;border:2px solid var(--border-color);display:flex;align-items:center;justify-content:center;flex-shrink:0;" class="radio-circle">
                    <div style="width:10px;height:10px;border-radius:50%;background:var(--primary-color);display:${isSelected ? 'block' : 'none'};" class="radio-inner"></div>
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:16px;font-weight:bold;color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${v.word} <span style="font-size:13px;font-weight:normal;color:var(--text-muted);margin-left:6px;">${v.furi || ''}</span></div>
                    <div style="font-size:13px;color:var(--text-muted);margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${v.translation || 'No translation'}</div>
                    <div style="font-size:12px;color:var(--primary-color);margin-top:4px;font-weight:600;">${intervalText} • ${statusText}</div>
                </div>
            `;
            
            variantEl.addEventListener('click', function(e) {
                // Prevent double firing if clicking on the label triggers input
                if(e.target.tagName.toLowerCase() === 'input') return;
                
                groupEl.querySelectorAll('.merge-variant').forEach(el => {
                    el.style.borderColor = 'transparent';
                    el.querySelector('.radio-inner').style.display = 'none';
                    el.querySelector('input').checked = false;
                });
                this.style.borderColor = 'var(--primary-color)';
                this.querySelector('.radio-inner').style.display = 'block';
                this.querySelector('input').checked = true;
            });
            
            groupEl.appendChild(variantEl);
        });
        list.appendChild(groupEl);
    });
    
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:15px 20px;border-top:1px solid var(--border-color);display:flex;gap:10px;background:var(--bg-color);';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'flex:1;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:transparent;color:var(--text-main);cursor:pointer;font-weight:bold;';
    cancelBtn.onclick = () => overlay.remove();
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Confirm Merge';
    saveBtn.className = 'primary-btn';
    saveBtn.style.flex = '2';
    saveBtn.onclick = () => {
        let mergeCount = 0;
        dupes.forEach((group, gIdx) => {
            const keeperInput = list.querySelector(`input[name="merge_group_${gIdx}"]:checked`);
            if (keeperInput) {
                const keeperWord = keeperInput.value;
                const losers = group[1].map(v => v.word).filter(w => w !== keeperWord);
                if (losers.length > 0) {
                    srsDb.mergeWords(keeperWord, losers);
                    mergeCount += losers.length;
                }
            }
        });
        overlay.remove();
        showStatus('merge-status', 'success', `Successfully merged! Removed ${mergeCount} duplicate entries.`);
    };
    
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    
    box.appendChild(header);
    box.appendChild(list);
    box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function renderStoryList() {
    const container = document.getElementById('export-story-list');
    const stories = getStoryList().sort((a, b) => new Date(b.created) - new Date(a.created));

    if (stories.length === 0) {
        container.innerHTML = `<p class="placeholder-text" style="margin:10px 0 4px;">No stories saved yet.</p>`;
        return;
    }

    container.innerHTML = '';
    stories.forEach(story => {
        const row = document.createElement('label');
        row.className = 'story-select-row';
        row.innerHTML = `
            <input type="checkbox" class="story-checkbox" data-id="${story.id}" checked>
            <span class="story-select-title">${story.title}</span>
            <span class="story-select-meta">${story.blocks.length} blocks · ${new Date(story.created).toLocaleDateString()}</span>
        `;
        container.appendChild(row);
    });
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────

async function handleExport() {
    const checkedIds =[...document.querySelectorAll('.story-checkbox:checked')]
        .map(cb => cb.getAttribute('data-id'));

    if (checkedIds.length === 0) {
        return showStatus('export-status', 'error', 'Please select at least one story.');
    }

    const includeVocab = document.getElementById('export-include-vocab').checked;
    showStatus('export-status', 'loading', 'Building zip…');
    try {
        await dataMgr.exportStories(checkedIds, includeVocab);
        showStatus('export-status', 'success', `Exported ${checkedIds.length} story/stories successfully.`);
    } catch (e) {
        showStatus('export-status', 'error', e.message);
    }
}

// ─── IMPORT ───────────────────────────────────────────────────────────────────

let _pendingImportFile = null;

function handleImportFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    _pendingImportFile = file;
    document.getElementById('import-filename').textContent = file.name;
    document.getElementById('btn-confirm-import').style.display = 'inline-block';
    document.getElementById('import-status').style.display = 'none';
}

async function handleImportConfirm() {
    if (!_pendingImportFile) return;
    showStatus('import-status', 'loading', 'Reading zip…');
    try {
        const result = await dataMgr.importFromFile(_pendingImportFile);
        let msg = `Done! Added ${result.added} story/stories`;
        if (result.skipped > 0) msg += `, skipped ${result.skipped} duplicate(s)`;
        if (result.vocabAdded > 0) msg += `, ${result.vocabAdded} new vocab words`;
        msg += '.';
        showStatus('import-status', 'success', msg);
        _pendingImportFile = null;
        document.getElementById('data-import-file').value = '';
        document.getElementById('import-filename').textContent = 'No file chosen';
        document.getElementById('btn-confirm-import').style.display = 'none';
        renderStoryList();
        if (result.added > 0) document.querySelector('button[data-target="view-story"]').click();
    } catch (err) {
        showStatus('import-status', 'error', err.message);
    }
}

// ─── SYNC ─────────────────────────────────────────────────────────────────────

export async function handleSync(opts = {}) {
    // opts.silent = true: skip UI status messages (called from Story tab button)
    const url = dataMgr.getSyncUrl();
    if (!url) {
        if (!opts.silent) showStatus('sync-status', 'error', 'Please enter a sync URL first.');
        throw new Error('No sync URL configured.');
    }

    if (!opts.silent) showStatus('sync-status', 'loading', 'Fetching zip from URL…');
    const result = await dataMgr.syncFromUrl(url);
    let msg = `Synced! Added ${result.added} story/stories`;
    if (result.skipped > 0) msg += `, skipped ${result.skipped} duplicate(s)`;
    if (result.vocabAdded > 0) msg += `, ${result.vocabAdded} vocab words`;
    msg += '.';
    if (!opts.silent) {
        showStatus('sync-status', 'success', msg);
        renderStoryList();
    }
    return result;
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function showStatus(elId, type, message) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.className = `status-message status-${type}`;
    el.textContent = message;
    el.style.display = 'block';
    if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function hideStatus(elId) {
    const el = document.getElementById(elId);
    if (el) el.style.display = 'none';
}
```[MODIFIED FILE] srs_db.js
```javascript
/**
 * srs_db.js
 *
 * SRS Word Object Structure (v2 — SM-2 scheduling):
 * {
 *   word:         "日本語",
 *   furi:         "にほんご",
 *   translation:  "Japanese language",
 *   status:       0,              // LingQ-style 0–5 (still used for reader colouring)
 *   lastUpdated:  "2023-10-27T...",
 *
 *   // SM-2 fields (added v2, undefined on legacy words = treated as new):
 *   interval:     1,              // days until next review
 *   ease:         2.5,            // SM-2 ease factor
 *   dueDate:      "2023-10-28T...",  // ISO date when next due
 *   reviewCount:  0,              // total times reviewed via the SRS deck
 *
 *   // AI Enrichment fields (added for base form matching):
 *   base:         "日本語",
 *   pos:          "noun",         // part of speech: noun, verb, etc. (optional)
 *   aiUpdated:    "2023-10-27T...",
 * }
 *
 * LingQ status ↔ interval thresholds (used when srsAutoStatus is enabled):
 *   0 → not yet scheduled
 *   1 → interval < 3 days
 *   2 → interval < 7 days
 *   3 → interval < 30 days
 *   4 → interval < 180 days (6 months)
 *   5 → interval ≥ 180 days
 */

import { recordReview } from './srs_stats.js';

const STORAGE_KEY = 'ai_reader_srs_data';

// ─── CORE CRUD ───────────────────────────────────────────────────────────────

export function getAllWords() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
}

function _persist(words) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
}

export function saveWord(wordObj) {
    const words = getAllWords();
    const existing = words[wordObj.word] || {};
    words[wordObj.word] = {
        ...existing,
        ...wordObj,
        lastUpdated: new Date().toISOString()
    };
    _persist(words);
}

export function getWord(wordText) {
    const words = getAllWords();
    if (words[wordText]) return words[wordText];
    
    // Fallback: search by baseform if key doesn't match directly
    for (const key in words) {
        if (words[key].base === wordText) {
            return words[key];
        }
    }
    return null;
}

// ─── MERGE DUPLICATES ────────────────────────────────────────────────────────

export function mergeWords(keeperWord, loserWordsArray) {
    const words = getAllWords();
    let changed = false;

    if (!words[keeperWord]) return false;

    for (const loser of loserWordsArray) {
        if (words[loser] && loser !== keeperWord) {
            delete words[loser];
            changed = true;
        }
    }

    if (changed) {
        _persist(words);
        return true;
    }
    return false;
}

// ─── AI ENRICHMENT BATCH PROCESSING ──────────────────────────────────────────

/**
 * Returns a list of words prioritizing those that haven't been enriched yet.
 */
export function getWordsNeedingEnrichment(limit = 50) {
    let words = Object.values(getAllWords());
    words.sort((a, b) => {
        const timeA = a.aiUpdated ? new Date(a.aiUpdated).getTime() : 0;
        const timeB = b.aiUpdated ? new Date(b.aiUpdated).getTime() : 0;
        return timeA - timeB; // Oldest/0 first
    });
    return words.slice(0, limit);
}

/**
 * Applies a batch of base form updates returned by the AI.
 * @param {Array<{key: string, base: string, pos?: string}>} updates
 */
export function batchUpdateBases(updates) {
    const words = getAllWords();
    const now = new Date().toISOString();
    for (const { key, base, pos } of updates) {
        if (words[key]) {
            words[key].base = base;
            if (pos) words[key].pos = pos;
            words[key].aiUpdated = now;
        }
    }
    _persist(words);
}

// ─── STATUS ──────────────────────────────────────────────────────────────────

/**
 * Derive a LingQ 0-5 status from an SRS interval (days).
 * Used when srsAutoStatus is enabled in settings.
 */
export function statusFromInterval(intervalDays) {
    if (!intervalDays || intervalDays < 1) return 1;
    if (intervalDays <   3) return 1;
    if (intervalDays <   7) return 2;
    if (intervalDays <  30) return 3;
    if (intervalDays < 180) return 4;
    return 5;
}

export function updateWordStatus(wordText, newStatus) {
    const words = getAllWords();
    if (words[wordText]) {
        words[wordText].status      = parseInt(newStatus);
        words[wordText].lastUpdated = new Date().toISOString();
        _persist(words);
        recordReview({
            word:   wordText,
            grade:  null,
            lingq:  parseInt(newStatus),
            source: 'lingq',
        });
        return true;
    }
    return false;
}

export function updateWordFuri(wordText, newFuri) {
    const words = getAllWords();
    if (words[wordText]) {
        words[wordText].furi = newFuri;
        words[wordText].lastUpdated = new Date().toISOString();
        _persist(words);
        return true;
    }
    return false;
}

export function deleteWord(wordText) {
    const words = getAllWords();
    if (words[wordText]) {
        delete words[wordText];
        _persist(words);
        return true;
    }
    return false;
}

// ─── SM-2 SCHEDULING ─────────────────────────────────────────────────────────

/**
 * Grade a card using a simplified SM-2 algorithm.
 *
 * grade:
 *   0 = Again  (complete blackout)
 *   1 = Hard   (significant difficulty)
 *   2 = Good   (recalled with effort)
 *   3 = Easy   (recalled perfectly)
 *
 * Returns the updated word object (not persisted yet — caller decides).
 */
export function scheduleReview(wordObj, grade) {
    const MIN_EASE = 1.3;
    const now      = new Date();

    // Initialise SM-2 fields for legacy / newly-added words.
    // Interval is stored in fractional DAYS (e.g. 8s = 8/86400).
    let interval    = wordObj.interval    ?? 1;
    let ease        = wordObj.ease        ?? 2.5;
    let reviewCount = wordObj.reviewCount ?? 0;

    reviewCount++;

    if (grade === 0) {
        // Again — go back to a short re-study interval (10 min) rather than 1 full day,
        // so sub-day words stay sub-day and arent pushed out unnecessarily.
        interval = Math.min(interval, 10 / 1440);   // 10 minutes in fractional days
        ease     = Math.max(MIN_EASE, ease - 0.2);
    } else if (grade === 1) {
        // Hard — grow a little but stay in same order of magnitude
        ease     = Math.max(MIN_EASE, ease - 0.15);
        interval = Math.max(interval, interval * 1.2);
    } else if (grade === 2) {
        // Good — standard SM-2 graduation
        if (reviewCount === 1)      interval = Math.max(interval, 10 / 1440);  // 10 min
        else if (reviewCount === 2) interval = Math.max(interval, 1);          // 1 day
        else                        interval = interval * ease;
        ease = Math.max(MIN_EASE, ease - 0.02);
    } else {
        // Easy (3)
        if (reviewCount === 1)      interval = Math.max(interval, 1);          // 1 day
        else if (reviewCount === 2) interval = Math.max(interval, 4);          // 4 days
        else                        interval = interval * ease * 1.3;
        ease = Math.min(ease + 0.1, 3.5);
    }

    const dueDate = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

    return {
        ...wordObj,
        interval,
        ease,
        reviewCount,
        dueDate:     dueDate.toISOString(),
        lastUpdated: now.toISOString(),
    };
}

/**
 * Commit a review grade to the database.
 * Also optionally updates the LingQ status based on the new interval
 * if autoStatus === true (passed in from settings.srsAutoStatus).
 */
export function gradeWord(wordText, grade, autoStatus = false) {
    const words = getAllWords();
    const word  = words[wordText];
    if (!word) return false;

    const updated = scheduleReview(word, grade);

    if (autoStatus) {
        updated.status = statusFromInterval(updated.interval);
    }

    words[wordText] = updated;
    _persist(words);

    recordReview({
        word:        wordText,
        grade,
        lingq:       null,
        source:      'srs',
        newInterval: updated.interval,
        newEase:     updated.ease,
        reviewCount: updated.reviewCount,
    });

    return updated;
}

// ─── GAME INTEGRATION ────────────────────────────────────────────────────────

/**
 * Specialized grading for Games (TBB, VocabCraft).
 * Prevents interval explosion for non-due words.
 * @param {object} wordData - {word, furi, translation}
 * @param {number} grade - 0-3
 * @param {boolean} autoStatus
 */
export function gradeWordInGame(wordData, grade, autoStatus = false) {
    const words = getAllWords();
    let word = words[wordData.word];

    const now = new Date();
    
    // If word doesn't exist in SRS DB yet, initialize it
    if (!word) {
        word = {
            word: wordData.word,
            furi: wordData.furi || '',
            translation: wordData.trans || wordData.translation || '',
            status: 0,
            interval: 0,
            ease: 2.5,
            reviewCount: 0,
            dueDate: now.toISOString(),
            lastUpdated: now.toISOString()
        };
    }

    const isDue = !word.dueDate || new Date(word.dueDate) <= now;

    // The Safety Valve: Not Due + Correct -> Free Drill, no interval change.
    if (!isDue && grade > 0) {
        // Just update lastUpdated so it cycles to the back of the "Least Recently Seen" fallback queue
        word.lastUpdated = now.toISOString();
        words[word.word] = word;
        _persist(words);
        return word;
    }

    // Otherwise (isDue OR Wrong), perform standard SM-2 update
    const updated = scheduleReview(word, grade);

    if (autoStatus) {
        updated.status = statusFromInterval(updated.interval);
    }

    words[updated.word] = updated;
    _persist(words);

    recordReview({
        word:        updated.word,
        grade,
        lingq:       null,
        source:      'game',
        newInterval: updated.interval,
        newEase:     updated.ease,
        reviewCount: updated.reviewCount,
    });

    return updated;
}

/**
 * Gets the next best word for a game session based on strict priorities.
 * Modes:
 * - 'srs': Strictly prefers Due -> Drill -> New
 * - 'new': Strictly prefers New -> Drill -> Due
 * - 'mixed': Natural order (Due -> Learning Drill (<7d) -> New -> Mature Drill)
 * 
 * @param {Array} sessionQueue - Array of word objects {word, furi, trans} active in the session
 * @param {string} mode - 'srs', 'new', or 'mixed'
 * @returns {Object} { wordObj, type: 'due'|'drill'|'new' }
 */
export function getNextGameWord(sessionQueue, mode = 'mixed') {
    const words = getAllWords();
    const now = new Date();
    const DRILL_THRESHOLD_DAYS = 7;

    let due =[];
    let learningDrill = []; // Not due, interval < 7 days
    let matureDrill =[];   // Not due, interval >= 7 days
    let brandNew =[];

    sessionQueue.forEach(w => {
        const entry = words[w.word];
        if (!entry) {
            brandNew.push(w);
        } else if (!entry.dueDate || new Date(entry.dueDate) <= now) {
            due.push(w);
        } else {
            if ((entry.interval || 0) < DRILL_THRESHOLD_DAYS) {
                learningDrill.push({ wordObj: w, lastUpdated: new Date(entry.lastUpdated).getTime() });
            } else {
                matureDrill.push({ wordObj: w, lastUpdated: new Date(entry.lastUpdated).getTime() });
            }
        }
    });

    // Sort drills by least recently seen first (ascending time)
    learningDrill.sort((a, b) => a.lastUpdated - b.lastUpdated);
    matureDrill.sort((a, b) => a.lastUpdated - b.lastUpdated);

    let selected = null;
    const pickRandom = (arr) => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
    const pickOldest = (arr) => arr.length ? arr[0].wordObj : null;

    if (mode === 'new') {
        selected = pickRandom(brandNew);
        if (selected) return { wordObj: selected, type: 'new' };
        selected = pickOldest(learningDrill);
        if (selected) return { wordObj: selected, type: 'drill' };
        selected = pickOldest(matureDrill);
        if (selected) return { wordObj: selected, type: 'drill' };
        selected = pickRandom(due);
        if (selected) return { wordObj: selected, type: 'due' };
    } 
    else if (mode === 'srs') {
        selected = pickRandom(due);
        if (selected) return { wordObj: selected, type: 'due' };
        selected = pickOldest(learningDrill);
        if (selected) return { wordObj: selected, type: 'drill' };
        selected = pickOldest(matureDrill);
        if (selected) return { wordObj: selected, type: 'drill' };
        selected = pickRandom(brandNew);
        if (selected) return { wordObj: selected, type: 'new' };
    } 
    else {
        // 'mixed' mode
        selected = pickRandom(due);
        if (selected) return { wordObj: selected, type: 'due' };
        selected = pickOldest(learningDrill);
        if (selected) return { wordObj: selected, type: 'drill' };
        selected = pickRandom(brandNew);
        if (selected) return { wordObj: selected, type: 'new' };
        selected = pickOldest(matureDrill);
        if (selected) return { wordObj: selected, type: 'drill' };
    }

    // Ultimate fallback (should never hit unless sessionQueue is empty)
    return { wordObj: sessionQueue[Math.floor(Math.random() * sessionQueue.length)], type: 'due' };
}

// ─── NEKO IMPORT ─────────────────────────────────────────────────────────────

/**
 * Import words from the Neko game's SRS save.
 */
export function importFromNeko(nekoWords, existingPolicy = 'skip') {
    const words = getAllWords();
    let added = 0, skipped = 0;

    for (const w of nekoWords) {
        if (!w.word) continue;

        if (words[w.word]) {
            if (existingPolicy === 'merge') {
                if (!words[w.word].furi        && w.furi)  words[w.word].furi        = w.furi;
                if (!words[w.word].translation && w.trans) words[w.word].translation = w.trans;
            }
            skipped++;
        } else {
            const nekoIntervalSec  = w.nekoInterval    || 0;
            const nekoRemainingMs  = w.nekoRemainingMs || 0;
            const ease             = w.ease            || 2.5;

            let intervalDays, dueDate;
            if (nekoIntervalSec > 0) {
                intervalDays = nekoIntervalSec / 86400;
                dueDate = new Date(Date.now() + nekoRemainingMs).toISOString();
            } else {
                intervalDays = 0;
                dueDate      = new Date().toISOString();
            }

            words[w.word] = {
                word:        w.word,
                furi:        w.furi  || '',
                translation: w.trans || '',
                status:      statusFromInterval(intervalDays),
                interval:    intervalDays,
                ease:        ease,
                reviewCount: 0,
                dueDate:     dueDate,
                lastUpdated: new Date().toISOString(),
            };
            added++;
        }
    }

    _persist(words);
    return { added, skipped };
}

// ─── QUEUE HELPERS ───────────────────────────────────────────────────────────

export function getDueWords(limit = 0) {
    const now  = new Date();
    let words  = Object.values(getAllWords()).filter(w => {
        if (!w.dueDate) return true;            
        return new Date(w.dueDate) <= now;
    });

    words.sort((a, b) => {
        const da = a.dueDate ? new Date(a.dueDate) : new Date(0);
        const db = b.dueDate ? new Date(b.dueDate) : new Date(0);
        return da - db;
    });

    return limit > 0 ? words.slice(0, limit) : words;
}

export function getFilteredWords(criteria = {}) {
    let words = Object.values(getAllWords());

    if (criteria.maxStatus !== undefined) words = words.filter(w => w.status <= criteria.maxStatus);
    if (criteria.minStatus !== undefined) words = words.filter(w => w.status >= criteria.minStatus);

    const sort = criteria.sort || 'oldest';
    if (sort === 'newest') {
        words.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
    } else if (sort === 'az') {
        words.sort((a, b) => (a.word || '').localeCompare(b.word || ''));
    } else {
        words.sort((a, b) => new Date(a.lastUpdated) - new Date(b.lastUpdated));
    }

    if (criteria.limit) words = words.slice(0, criteria.limit);
    return words;
}