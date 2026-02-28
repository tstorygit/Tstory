/**
 * data_ui.js
 * Renders and drives the "Data" tab UI.
 * All button wiring is done via addEventListener — no inline onclick / window globals.
 */

import { getStoryList } from './story_mgr.js';
import * as dataMgr from './data_mgr.js';

// ─── INIT ────────────────────────────────────────────────────────────────────

export function initDataManager() {
    // Populate sync URL from storage/default immediately
    document.getElementById('data-sync-url').value = dataMgr.getSyncUrl();

    // Re-render story list every time the Data tab is opened
    const tab = document.querySelector('button[data-target="view-data"]');
    if (tab) tab.addEventListener('click', renderStoryList);

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
    const checkedIds = [...document.querySelectorAll('.story-checkbox:checked')]
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