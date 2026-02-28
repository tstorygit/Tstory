/**
 * data_mgr.js
 * Handles story export (zip), import (zip), and sync from a remote URL.
 *
 * The zip format is simple:
 *   stories.json  — full array of story objects (same shape as localStorage)
 *   vocab.json    — optional SRS word map
 *
 * We use the JSZip library (loaded via CDN in index.html).
 */

import { getStoryList } from './story_mgr.js';
import * as srsDb from './srs_db.js';

const STORAGE_KEY = 'ai_reader_stories';
const SYNC_URL_KEY = 'ai_reader_sync_url';
const DEFAULT_SYNC_URL = 'https://raw.githubusercontent.com/tstorygit/Tstory/main/shared-stories.zip';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function saveStoryList(stories) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            throw new Error("Storage full! Delete old stories before importing.");
        }
        throw e;
    }
}

async function buildZip(selectedStories, includeVocab = false) {
    const zip = new JSZip(); // eslint-disable-line no-undef
    zip.file('stories.json', JSON.stringify(selectedStories, null, 2));
    if (includeVocab) {
        zip.file('vocab.json', JSON.stringify(srsDb.getAllWords(), null, 2));
    }
    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function readZip(blob) {
    const zip = await JSZip.loadAsync(blob); // eslint-disable-line no-undef
    const result = {};
    if (zip.files['stories.json']) {
        result.stories = JSON.parse(await zip.files['stories.json'].async('string'));
    }
    if (zip.files['vocab.json']) {
        result.vocab = JSON.parse(await zip.files['vocab.json'].async('string'));
    }
    return result;
}

/**
 * Merges imported stories into localStorage.
 * Skips stories whose ID already exists (no overwrite).
 * Returns { added, skipped } counts.
 */
function mergeStories(incoming) {
    const existing = getStoryList();
    const existingIds = new Set(existing.map(s => s.id));
    let added = 0, skipped = 0;

    for (const story of incoming) {
        if (existingIds.has(story.id)) {
            skipped++;
        } else {
            existing.push(story);
            added++;
        }
    }
    saveStoryList(existing);
    return { added, skipped };
}

/**
 * Merges imported vocab into SRS db.
 * Existing words are not overwritten.
 */
function mergeVocab(incoming) {
    const existing = srsDb.getAllWords();
    let added = 0;
    for (const [word, data] of Object.entries(incoming)) {
        if (!existing[word]) {
            srsDb.saveWord(data);
            added++;
        }
    }
    return added;
}

// ─── PUBLIC API ─────────────────────────────────────────────────────────────

export async function exportStories(ids, includeVocab) {
    const all = getStoryList();
    const selected = all.filter(s => ids.includes(s.id));
    if (selected.length === 0) throw new Error("No stories selected.");
    const blob = await buildZip(selected, includeVocab);
    const date = new Date().toISOString().slice(0, 10);
    triggerDownload(blob, `jp-stories-${date}.zip`);
}

export async function importFromFile(file) {
    const blob = await file.arrayBuffer().then(buf => new Blob([buf]));
    const data = await readZip(blob);
    if (!data.stories) throw new Error("Invalid zip: no stories.json found.");
    const storyResult = mergeStories(data.stories);
    let vocabAdded = 0;
    if (data.vocab) {
        vocabAdded = mergeVocab(data.vocab);
    }
    return { ...storyResult, vocabAdded };
}

export function getSyncUrl() {
    return localStorage.getItem(SYNC_URL_KEY) || DEFAULT_SYNC_URL;
}

export function setSyncUrl(url) {
    localStorage.setItem(SYNC_URL_KEY, url);
}

export async function syncFromUrl(url) {
    if (!url) throw new Error("No sync URL configured.");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch: HTTP ${response.status}`);
    const blob = await response.blob();
    const data = await readZip(blob);
    if (!data.stories) throw new Error("Invalid zip: no stories.json found.");
    const storyResult = mergeStories(data.stories);
    let vocabAdded = 0;
    if (data.vocab) {
        vocabAdded = mergeVocab(data.vocab);
    }
    return { ...storyResult, vocabAdded };
}