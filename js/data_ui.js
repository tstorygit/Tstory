/**
 * data_ui.js
 * Renders and drives the "Data" tab UI:
 *   - Export panel (story selector + download)
 *   - Import panel (file picker + merge)
 *   - Sync panel  (URL config + one-tap pull)
 */

import { getStoryList } from './story_mgr.js';
import * as dataMgr from './data_mgr.js';

// ─── INIT ────────────────────────────────────────────────────────────────────

export function initDataManager() {
    const tab = document.querySelector('button[data-target="view-data"]');
    if (tab) tab.addEventListener('click', renderDataView);

    // Wire up the import file input (outside render so it doesn't dupe)
    document.getElementById('data-import-file').addEventListener('change', handleImportFile);

    // Load saved sync URL into input on startup
    document.getElementById('data-sync-url').value = dataMgr.getSyncUrl();

    renderDataView();
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function renderDataView() {
    renderStoryList();
    // Restore sync URL in case settings changed
    document.getElementById('data-sync-url').value = dataMgr.getSyncUrl();
}

function renderStoryList() {
    const container = document.getElementById('export-story-list');
    const stories = getStoryList().sort((a, b) => new Date(b.created) - new Date(a.created));

    if (stories.length === 0) {
        container.innerHTML = `<p class="placeholder-text" style="margin:10px 0;">No stories saved yet.</p>`;
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

// ─── EVENT HANDLERS ───────────────────────────────────────────────────────────

export function selectAllStories() {
    document.querySelectorAll('.story-checkbox').forEach(cb => cb.checked = true);
}

export function selectNoneStories() {
    document.querySelectorAll('.story-checkbox').forEach(cb => cb.checked = false);
}

export async function handleExport() {
    const checkedIds = [...document.querySelectorAll('.story-checkbox:checked')]
        .map(cb => cb.getAttribute('data-id'));

    if (checkedIds.length === 0) {
        return showStatus('export-status', 'error', 'Please select at least one story.');
    }

    const includeVocab = document.getElementById('export-include-vocab').checked;

    showStatus('export-status', 'loading', 'Building zip…');
    try {
        await dataMgr.exportStories(checkedIds, includeVocab);
        showStatus('export-status', 'success', `Exported ${checkedIds.length} story/stories.`);
    } catch (e) {
        showStatus('export-status', 'error', e.message);
    }
}

function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Show the filename as a preview
    document.getElementById('import-filename').textContent = file.name;
    document.getElementById('btn-confirm-import').style.display = 'inline-block';

    // Store reference for the confirm button
    document.getElementById('btn-confirm-import').onclick = async () => {
        showStatus('import-status', 'loading', 'Reading zip…');
        try {
            const result = await dataMgr.importFromFile(file);
            let msg = `Done! Added ${result.added} story/stories`;
            if (result.skipped > 0) msg += `, skipped ${result.skipped} duplicate(s)`;
            if (result.vocabAdded > 0) msg += `, ${result.vocabAdded} new vocab words`;
            msg += '.';
            showStatus('import-status', 'success', msg);
            document.getElementById('btn-confirm-import').style.display = 'none';
            document.getElementById('import-filename').textContent = '';
            // reset the file input
            e.target.value = '';
            // Re-render story list in export panel
            renderStoryList();
        } catch (err) {
            showStatus('import-status', 'error', err.message);
        }
    };
}

export async function handleSync() {
    const url = document.getElementById('data-sync-url').value.trim();
    if (!url) return showStatus('sync-status', 'error', 'Please enter a sync URL first.');

    dataMgr.setSyncUrl(url);
    showStatus('sync-status', 'loading', 'Fetching zip from URL…');

    try {
        const result = await dataMgr.syncFromUrl(url);
        let msg = `Synced! Added ${result.added} story/stories`;
        if (result.skipped > 0) msg += `, skipped ${result.skipped} duplicate(s)`;
        if (result.vocabAdded > 0) msg += `, ${result.vocabAdded} vocab words`;
        msg += '.';
        showStatus('sync-status', 'success', msg);
        renderStoryList();
    } catch (e) {
        showStatus('sync-status', 'error', e.message);
    }
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function showStatus(elId, type, message) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.className = `status-message status-${type}`;
    el.textContent = message;
    el.style.display = 'block';

    if (type === 'success') {
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    }
}
