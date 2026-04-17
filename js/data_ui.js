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