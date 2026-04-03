import * as storyMgr from './story_mgr.js';
import { handleSync } from './data_ui.js';
import * as srsDb from './srs_db.js';
import { settings } from './settings.js';
import { speakText, stopSpeech } from './tts_api.js';
import { openPopup, closePopup } from './popup_manager.js';
import { mountStoryVocabSelector } from './story_vocab_selector.js';

// ─── ICONS ───────────────────────────────────────────────────────────────────

const EYE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

const SPEAKER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;


// --- STATE ---
let currentBlockIndex = 0;
let isLibraryView = true;
let isBackgroundProcessing = false;

// Track which sentence-speak button is currently active
let activeSpeakBtn = null;

// --- ERROR MODAL ---
function showErrorModal(message, onRetry) {
    document.getElementById('error-modal-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'error-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card,#1e1e2e);color:var(--text-primary,#cdd6f4);border:1px solid var(--border-color,#45475a);border-radius:12px;padding:28px 24px;max-width:380px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
    box.innerHTML = `<div style="font-size:2rem;margin-bottom:12px;">⚠️</div>
        <div style="font-weight:700;font-size:1.05rem;margin-bottom:8px;">Something went wrong</div>
        <div style="font-size:0.85rem;opacity:0.75;margin-bottom:20px;line-height:1.5;word-break:break-word;">${message}</div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;" id="error-modal-btns"></div>`;
    const btnRow = box.querySelector('#error-modal-btns');
    const menuBtn = document.createElement('button');
    menuBtn.textContent = '← Main Menu';
    menuBtn.style.cssText = 'padding:9px 18px;border-radius:8px;border:1px solid var(--border-color,#45475a);background:transparent;color:var(--text-primary,#cdd6f4);cursor:pointer;font-size:0.9rem;';
    menuBtn.onclick = () => { overlay.remove(); renderLibrary(); };
    btnRow.appendChild(menuBtn);
    if (onRetry) {
        const retryBtn = document.createElement('button');
        retryBtn.textContent = '↺ Try Again';
        retryBtn.style.cssText = 'padding:9px 18px;border-radius:8px;border:none;background:var(--accent-color,#cba6f7);color:#1e1e2e;cursor:pointer;font-weight:700;font-size:0.9rem;';
        retryBtn.onclick = async () => { overlay.remove(); await onRetry(); };
        btnRow.appendChild(retryBtn);
    }
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// --- DOM ELEMENTS ---
const storyContentDiv = document.getElementById('story-content');

// --- INITIALIZATION ---
export function rerenderCurrentBlock() {
    if (!isLibraryView) renderBlock(currentBlockIndex);
}

export function initViewer() {
    const rerenderTriggers =[
        { id: 'setting-show-furigana',   key: 'showFurigana',       type: 'checkbox' },
        { id: 'setting-show-romaji',     key: 'showRomaji',         type: 'checkbox' },
        { id: 'setting-highlight-style', key: 'textHighlightStyle', type: 'select'   },
        { id: 'setting-sentence-newline',key: 'sentenceNewline',    type: 'checkbox' },
        { id: 'setting-pro-level5',      key: 'proLevel5',          type: 'checkbox' },
    ];
    rerenderTriggers.forEach(({ id, key, type }) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            settings[key] = type === 'checkbox' ? el.checked : el.value;
            if (!isLibraryView) renderBlock(currentBlockIndex);
        });
    });

    document.addEventListener('srs:furi-changed', () => {
        if (!isLibraryView) renderBlock(currentBlockIndex);
    });

    renderLibrary();
}

function renderLibrary() {
    stopSpeech(); // Ensure audio stops when going back to library
    isLibraryView = true;
    isBackgroundProcessing = false; // Reset background state when entering library
    storyContentDiv.innerHTML = '';
    const stories = storyMgr.getStoryList();

    // ── Tabbed create/import/vocab panel ────────────────────────────────────────
    const createContainer = document.createElement('div');
    createContainer.style.cssText = 'margin-bottom:30px;background:var(--surface-color);border-radius:10px;box-shadow:0 2px 5px var(--shadow-light);overflow:hidden;';

    createContainer.innerHTML = `
        <!-- Tab bar (2 tabs only) -->
        <div class="lib-tab-bar" style="display:flex;border-bottom:1px solid var(--border-color);">
            <button class="lib-tab active" data-tab="create"
                style="flex:1;padding:11px 8px;border:none;background:transparent;cursor:pointer;
                       font-size:13px;font-weight:600;color:var(--primary-color);
                       border-bottom:2px solid var(--primary-color);transition:all 0.15s;">
                ✨ Create
            </button>
            <button class="lib-tab" data-tab="import"
                style="flex:1;padding:11px 8px;border:none;background:transparent;cursor:pointer;
                       font-size:13px;font-weight:600;color:var(--text-muted);
                       border-bottom:2px solid transparent;transition:all 0.15s;">
                📥 Import
            </button>
        </div>

        <!-- Create tab -->
        <div class="lib-tab-pane" data-pane="create" style="padding:18px 20px;">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;line-height:1.5;">
                Describe a theme or scenario and the AI generates a Japanese story for you.
            </div>
            <textarea id="new-story-theme" rows="2"
                style="width:100%;padding:10px;border-radius:6px;border:1px solid var(--border-color);
                       margin-bottom:10px;background:var(--bg-color);color:var(--text-main);
                       box-sizing:border-box;resize:vertical;"
                placeholder="e.g. My cat Chi goes to space..."></textarea>

            <!-- Vocab Base accordion -->
            <div id="svs-accordion" style="margin-bottom:10px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                <button id="svs-accordion-toggle"
                    style="width:100%;display:flex;align-items:center;justify-content:space-between;
                           padding:9px 13px;border:none;background:var(--bg-color);cursor:pointer;
                           font-size:12px;font-weight:600;color:var(--text-muted);text-align:left;
                           transition:background 0.12s;">
                    <span style="display:flex;align-items:center;gap:6px;">
                        <span>🎯</span>
                        <span id="svs-accordion-label">Vocab Base <span style="font-weight:400;opacity:0.7;">(optional)</span></span>
                    </span>
                    <span id="svs-accordion-arrow" style="font-size:10px;transition:transform 0.2s;">▼</span>
                </button>
                <div id="svs-accordion-body" style="display:none;padding:14px;border-top:1px solid var(--border-color);background:var(--surface-color);">
                    <div id="svs-mount"></div>
                </div>
            </div>

            <button id="btn-create-story" class="primary-btn" style="width:100%;">⚡ Generate Story</button>
        </div>

        <!-- Import tab -->
        <div class="lib-tab-pane" data-pane="import" style="display:none;padding:18px 20px;">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;line-height:1.5;">
                Paste Japanese text to have it tokenized and annotated, or scan a photo.
            </div>
            <textarea id="import-raw-text" rows="4"
                style="width:100%;padding:10px;border-radius:6px;border:1px solid var(--border-color);
                       margin-bottom:10px;background:var(--bg-color);color:var(--text-main);
                       box-sizing:border-box;resize:vertical;"
                placeholder="Paste Japanese text here..."></textarea>
            <div style="display:flex;gap:10px;">
                <button id="btn-import-story" class="primary-btn"
                    style="flex:1;background-color:#9c27b0;">📝 Analyze Text</button>
                <label for="import-photo-upload" class="primary-btn"
                    style="width:auto;background-color:#7b1fa2;cursor:pointer;
                           display:flex;align-items:center;justify-content:center;padding:0 20px;">
                    📷 Scan
                </label>
                <input type="file" id="import-photo-upload" accept="image/*" style="display:none;">
            </div>
        </div>
    `;

    storyContentDiv.appendChild(createContainer);

    // ── Mount vocab selector (lazy: only render when accordion first opens) ──
    const svsMountEl = createContainer.querySelector('#svs-mount');
    let svsController = null;
    let svsReady = false;

    function _ensureSvs() {
        if (!svsReady) {
            svsController = mountStoryVocabSelector(svsMountEl);
            svsReady = true;
        }
    }

    // ── Accordion wiring ─────────────────────────────────────────────────────
    const accordionToggle = createContainer.querySelector('#svs-accordion-toggle');
    const accordionBody   = createContainer.querySelector('#svs-accordion-body');
    const accordionArrow  = createContainer.querySelector('#svs-accordion-arrow');
    const accordionLabel  = createContainer.querySelector('#svs-accordion-label');

    accordionToggle.addEventListener('click', () => {
        const isOpen = accordionBody.style.display !== 'none';
        accordionBody.style.display = isOpen ? 'none' : '';
        accordionArrow.style.transform = isOpen ? '' : 'rotate(180deg)';
        accordionToggle.style.background = isOpen ? 'var(--bg-color)' : 'var(--surface-color)';
        if (!isOpen) {
            _ensureSvs();
            svsController.refresh();
        }
        _updateAccordionLabel();
    });

    function _updateAccordionLabel() {
        if (!svsController) { accordionLabel.innerHTML = `Vocab Base <span style="font-weight:400;opacity:0.7;">(optional)</span>`; return; }
        const hasSel = svsController.hasSelection();
        accordionLabel.innerHTML = hasSel
            ? `Vocab Base <span style="font-weight:400;color:var(--primary-color);">· ${svsController.getSummaryText()}</span>`
            : `Vocab Base <span style="font-weight:400;opacity:0.7;">(optional)</span>`;
    }

    // ── Tab switching ────────────────────────────────────────────────────────
    const tabs  = createContainer.querySelectorAll('.lib-tab');
    const panes = createContainer.querySelectorAll('.lib-tab-pane');

    function switchTab(targetTab) {
        tabs.forEach(t => {
            const active = t.getAttribute('data-tab') === targetTab;
            t.classList.toggle('active', active);
            t.style.color        = active ? 'var(--primary-color)' : 'var(--text-muted)';
            t.style.borderBottom = active ? '2px solid var(--primary-color)' : '2px solid transparent';
        });
        panes.forEach(p => {
            p.style.display = p.getAttribute('data-pane') === targetTab ? '' : 'none';
        });
    }

    tabs.forEach(t => t.addEventListener('click', () => switchTab(t.getAttribute('data-tab'))));

    // ── Create story ─────────────────────────────────────────────────────────
    createContainer.querySelector('#btn-create-story').addEventListener('click', async () => {
        const theme = createContainer.querySelector('#new-story-theme').value.trim();
        if (!theme) return alert("Please enter a theme!");

        // Collect vocab base (null if accordion was never opened — that's fine)
        const vocabBase = (svsController && svsController.hasSelection()) ? svsController.getSelection() : [];

        const _doCreate = async () => {
            isBackgroundProcessing = false;
            showLoading(0, "Initializing Story...");
            await storyMgr.createNewStory(theme, updateProgress, () => {
                hideLoading();
                isBackgroundProcessing = true;
                renderReader();
            }, () => {
                const s = storyMgr.getActiveStory();
                if (s) renderBlock(s.blocks.length - 1);
            }, vocabBase);
            renderReader();
            hideLoading();
            isBackgroundProcessing = false;
        };

        try {
            await _doCreate();
        } catch (error) {
            hideLoading();
            isBackgroundProcessing = false;
            showErrorModal(error.message, async () => {
                try { await _doCreate(); }
                catch (e) { hideLoading(); isBackgroundProcessing = false; showErrorModal(e.message, null); }
            });
        }
    });

    // ── Import text ──────────────────────────────────────────────────────────
    createContainer.querySelector('#btn-import-story').addEventListener('click', async () => {
        const text = createContainer.querySelector('#import-raw-text').value.trim();
        if (!text) return alert("Please paste some text to import!");

        const _doImport = async () => {
            isBackgroundProcessing = false;
            showLoading(0, "Importing & Analyzing...");
            await storyMgr.createStoryFromRawText(text, updateProgress, () => {
                hideLoading();
                isBackgroundProcessing = true;
                renderReader();
            }, 'imported', () => {
                const s = storyMgr.getActiveStory();
                if (s) renderBlock(s.blocks.length - 1);
            });
            renderReader();
            hideLoading();
            isBackgroundProcessing = false;
        };

        try {
            await _doImport();
        } catch (error) {
            hideLoading();
            isBackgroundProcessing = false;
            showErrorModal(error.message, async () => {
                try { await _doImport(); }
                catch (e) { hideLoading(); isBackgroundProcessing = false; showErrorModal(e.message, null); }
            });
        }
    });

    // ── Scan photo ───────────────────────────────────────────────────────────
    createContainer.querySelector('#import-photo-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = event.target.result.split(',')[1];
            const mimeType   = file.type;
            const _doScan    = async () => {
                isBackgroundProcessing = false;
                showLoading(0, "Reading image...");
                await storyMgr.createStoryFromImage(base64Data, mimeType, updateProgress, () => {
                    hideLoading();
                    isBackgroundProcessing = true;
                    renderReader();
                }, () => {
                    const s = storyMgr.getActiveStory();
                    if (s) renderBlock(s.blocks.length - 1);
                });
                renderReader();
                hideLoading();
                isBackgroundProcessing = false;
            };
            try {
                await _doScan();
            } catch (error) {
                hideLoading();
                isBackgroundProcessing = false;
                showErrorModal(error.message, async () => {
                    try { await _doScan(); }
                    catch (e) { hideLoading(); isBackgroundProcessing = false; showErrorModal(e.message, null); }
                });
            }
            e.target.value = '';
        };
        reader.readAsDataURL(file);
    });

    const libraryHeaderRow = document.createElement('div');
    libraryHeaderRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;';
    libraryHeaderRow.innerHTML = `
        <h3 style="margin:0;">Your Library</h3>
        <button id="btn-library-sync" style="display:flex; align-items:center; gap:6px; padding:8px 14px; background:var(--primary-color); color:white; border:none; border-radius:20px; font-size:13px; font-weight:600; cursor:pointer;">
            🔄 Sync
        </button>
    `;
    storyContentDiv.appendChild(libraryHeaderRow);

    if (stories.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'placeholder-text';
        emptyMsg.textContent = "No saved stories. Tap Sync to load shared stories!";
        storyContentDiv.appendChild(emptyMsg);
    }

    document.getElementById('btn-library-sync').addEventListener('click', async () => {
        const btn = document.getElementById('btn-library-sync');
        btn.innerHTML = '⏳ Syncing…';
        btn.disabled = true;
        try {
            const result = await handleSync({ silent: true });
            if (result.added > 0) {
                renderLibrary();
            } else {
                btn.innerHTML = '✓ Up to date';
                setTimeout(() => { btn.innerHTML = '🔄 Sync'; btn.disabled = false; }, 2500);
                return;
            }
        } catch (e) {
            btn.innerHTML = '✗ Failed';
            btn.style.background = 'var(--status-0)';
            setTimeout(() => { btn.innerHTML = '🔄 Sync'; btn.disabled = false; btn.style.background = ''; }, 3000);
            return;
        }
        btn.disabled = false;
        btn.innerHTML = '🔄 Sync';
    });

    stories.sort((a,b) => new Date(b.created) - new Date(a.created)); 
    stories.forEach(story => {
        const card = document.createElement('div');
        card.className = 'story-card';
        card.style.background = 'var(--surface-color)';
        card.style.marginBottom = '15px';
        card.style.padding = '15px';
        card.style.borderRadius = '8px';
        card.style.border = '1px solid var(--border-color)';
        card.style.display = 'flex';
        card.style.justifyContent = 'space-between';
        card.style.alignItems = 'center';

        let badgeClass = 'story-badge-generated';
        let badgeText = 'Generated';
        if (story.type === 'imported') {
            badgeClass = 'story-badge-imported';
            badgeText = 'Imported';
        } else if (story.type === 'imported-photo') {
            badgeClass = 'story-badge-imported-photo';
            badgeText = 'Photo';
        }

        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = `
            <div style="font-weight: bold; font-size: 16px;">
                ${story.title}
                <span class="story-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Blocks: ${story.blocks.length} • ${new Date(story.created).toLocaleDateString()}</div>
        `;

        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '10px';

        const btnContinue = document.createElement('button');
        btnContinue.textContent = "Read";
        btnContinue.className = "primary-btn";
        btnContinue.style.padding = "8px 15px";
        btnContinue.style.fontSize = "14px";
        btnContinue.onclick = () => {
            storyMgr.setActiveStory(story.id);
            renderReader();
        };

        const btnDelete = document.createElement('button');
        btnDelete.textContent = "🗑️";
        btnDelete.style.background = "none";
        btnDelete.style.border = "none";
        btnDelete.style.cursor = "pointer";
        btnDelete.style.fontSize = "18px";
        btnDelete.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Delete "${story.title}"?`)) {
                storyMgr.deleteStory(story.id);
                renderLibrary();
            }
        };

        actionsDiv.appendChild(btnContinue);
        actionsDiv.appendChild(btnDelete);
        card.appendChild(infoDiv);
        card.appendChild(actionsDiv);
        storyContentDiv.appendChild(card);
    });
}

function renderReader() {
    isLibraryView = false;
    const storyData = storyMgr.getActiveStory();
    if (!storyData || storyData.blocks.length === 0) { 
        renderLibrary(); 
        return; 
    }
    currentBlockIndex = storyData.blocks.length - 1;
    renderBlock(currentBlockIndex);
}

function renderWordHtml(wordObj, useBgHighlight) {
    const base = wordObj.base || wordObj.surface;
    const srsEntry = srsDb.getWord(base);
    const status = srsEntry ? srsEntry.status : 'unknown';
    
    const isPro5 = settings.proLevel5 && status === 5;
    
    const statusClass = isPro5 ? '' : (useBgHighlight ? `status-${status}-bg word-tag` : `status-${status}-text`);
    
    // Apply SRS reading if defined (allows user to override NLP reading via popup)
    let displayFuri = wordObj.furi;
    if (srsEntry && srsEntry.furi !== undefined) {
        displayFuri = srsEntry.furi;
    }

    const tokenForPopup = { ...wordObj, furi: displayFuri };
    const wordDataStr = encodeURIComponent(JSON.stringify(tokenForPopup));
    
    const styleExtras = (useBgHighlight || isPro5) ? '' : 'border-bottom:1px dashed var(--border-color);';

    const showFuri = !isPro5 && settings.showFurigana && displayFuri;
    const showRoma = !isPro5 && settings.showRomaji && wordObj.roma;

    if (showFuri || showRoma) {
        let rtLines =[];
        if (showFuri) rtLines.push(`<span style="font-size:10px; color:var(--text-muted);">${displayFuri}</span>`);
        if (showRoma) rtLines.push(`<span style="font-size:9px; color:var(--primary-color); font-style:italic;">${wordObj.roma}</span>`);
        const rtContent = rtLines.join('<br>');
        return `<ruby><span class="clickable-word ${statusClass}" data-word="${wordDataStr}" style="cursor:pointer; ${styleExtras}">${wordObj.surface}</span><rt style="text-align:center; line-height:1.3;">${rtContent}</rt></ruby>`;
    } else {
        return `<span class="clickable-word ${statusClass}" data-word="${wordDataStr}" style="cursor:pointer; ${styleExtras}">${wordObj.surface}</span>`;
    }
}

// Helper: render inline sentence-level action buttons (eye + speaker) + translation box
let _sentenceBtnCounter = 0;
function sentenceActionButtons(transText, jaText) {
    const safeJa = jaText.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
    const speakBtn = `<button class="btn-sentence-speak" data-ja="${safeJa}" title="Read aloud" style="margin-left:3px; background:none; border:none; cursor:pointer; color:var(--text-muted); padding:2px; line-height:1; display:inline-flex; align-items:center; opacity:0.7; transition:opacity 0.15s;">${SPEAKER_ICON}</button>`;
    if (!transText) return speakBtn;
    const uid = `strans-${_sentenceBtnCounter++}`;
    const eyeBtn = `<button class="btn-sentence-trans" data-target="${uid}" title="Show translation" style="margin-left:5px; background:none; border:none; cursor:pointer; color:var(--text-muted); padding:2px; line-height:1; display:inline-flex; align-items:center;">${EYE_ICON}</button>`;
    const transDiv = `<div id="${uid}" class="sentence-translation-box" style="display:none; font-size:14px; color:var(--text-muted); background:var(--trans-box-bg); padding:8px; border-radius:4px; margin-top:5px; margin-bottom:10px;">${transText}</div>`;
    return eyeBtn + speakBtn + transDiv;
}

function renderBlock(index) {
    _sentenceBtnCounter = 0;
    stopSpeech(); // Stop speech when rendering a new block/turning a page
    activeSpeakBtn = null;

    const storyData = storyMgr.getActiveStory();
    if (!storyData || !storyData.blocks[index]) return;

    const block = storyData.blocks[index];
    const isLatestBlock = (index === storyData.blocks.length - 1);
    const useBgHighlight = (settings.textHighlightStyle === 'background');
    const useNewLines = settings.sentenceNewline;
    const isImported = (storyData.type === 'imported' || storyData.type === 'imported-photo');

    let html = '';

    // HEADER & NAVIGATION
    const isProcessingNow = !!block.isProcessing;
    const disabledStyle = isProcessingNow ? 'opacity:0.5; cursor:wait;' : '';
    const disabledProp = isProcessingNow ? 'disabled' : '';
    const regenText = isImported ? "🔁 Re-analyze This Text" : "🔁 Regenerate This Page";

    html += `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                <button id="btn-back-lib" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size: 14px;">&larr; Library</button>
                <span style="font-size: 14px; font-weight: bold; color: var(--primary-color);">Page ${index + 1} / ${storyData.blocks.length}</span>
                <button id="btn-read-all" title="Read everything aloud" style="background:none; border:none; cursor:pointer; color:var(--text-muted); padding:4px 8px; border-radius:20px; font-size:12px; display:inline-flex; align-items:center; gap:5px; transition:color 0.2s, background 0.2s; ${isProcessingNow ? 'opacity:0.4; cursor:wait;' : ''}" ${isProcessingNow ? 'disabled' : ''}>
                    ${SPEAKER_ICON} <span id="read-all-label">Read all</span>
                </button>
             </div>`;

    html += `<div class="block-nav" style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 14px;">`;
    html += index > 0 ? `<button id="btn-prev-page" style="background:none; border:none; color:var(--primary-color); cursor:pointer;">&larr; Prev</button>` : `<span></span>`;
    html += !isLatestBlock ? `<button id="btn-next-page" style="background:none; border:none; color:var(--primary-color); cursor:pointer;">Next &rarr;</button>` : `<span></span>`;
    html += `</div>`;

    // INLINE PROCESSING INDICATOR
    if (block.isProcessing) {
        html += `<div id="inline-processing-indicator" style="background: var(--surface-color); padding: 15px; margin-bottom: 20px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 8px;">
                         <div class="spinner" style="width: 16px; height: 16px; border: 2px solid var(--border-color); border-top: 2px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                         <span id="inline-loading-text" style="font-size: 14px; color: var(--primary-color); font-weight: 500;">Analyzing text...</span>
                    </div>
                    <div style="width: 100%; background: var(--border-color); border-radius: 4px; height: 4px; overflow: hidden;">
                        <div id="inline-loading-bar" style="width: 0%; height: 100%; background: var(--primary-color); transition: width 0.3s ease;"></div>
                    </div>
                 </div>`;
    }

    // IMAGE
    if (block.imageUrl) {
        html += `<div class="manga-image-container" style="margin-bottom: 20px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px var(--shadow-medium);">
                    <img src="${block.imageUrl}" alt="Manga Panel" style="width: 100%; display: block;">
                 </div>`;
    }

    // MAIN TEXT
    html += `<div class="japanese-text" style="font-size: 20px; line-height: 2.2; margin-bottom: 30px; letter-spacing: 1px; ${block.isProcessing ? 'opacity: 0.9;' : ''}">`;

    const words = block.enrichedData?.words || [];
    const sentences = block.enrichedData?.sentences || [];

    const strip = s => s.replace(/[\s\u3000]/g, '');

    const surfaces = words.map(w => strip(w.surface));
    const cumulative = []; 
    let cum = 0;
    for (const s of surfaces) { cum += s.length; cumulative.push(cum); }
    const fullStripped = surfaces.join('');

    const sentenceEndPos = []; 
    let searchFrom = 0;
    for (const sent of sentences) {
        const target = strip(sent.ja);
        const idx = fullStripped.indexOf(target, searchFrom);
        if (idx !== -1) {
            sentenceEndPos.push(idx + target.length);
            searchFrom = idx + target.length;
        } else {
            sentenceEndPos.push(-1);
        }
    }

    let sentIdx = 0;
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        html += renderWordHtml(w, useBgHighlight);

        while (sentIdx < sentences.length) {
            const endPos = sentenceEndPos[sentIdx];
            if (endPos === -1 || cumulative[i] >= endPos) {
                const transText = sentences[sentIdx].en.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                const jaText = sentences[sentIdx].ja;
                html += sentenceActionButtons(transText, jaText);
                if (useNewLines) html += `<br><br>`;
                sentIdx++;
            } else {
                break;
            }
        }
    }

    while (sentIdx < sentences.length) {
        const transText = sentences[sentIdx].en.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
        const jaText = sentences[sentIdx].ja;
        html += sentenceActionButtons(transText, jaText);
        sentIdx++;
    }
    html += `</div>`;

    // OPTIONS
    if (isLatestBlock && !isImported) {
        const optionRegex = /\[OPTION ([AB]):\s*(.*?)\]/g;
        let matches =[...block.rawJa.matchAll(optionRegex)];

        if (matches.length >= 2) {
            html += `<div class="options-container" style="display: flex; flex-direction: column; gap: 15px; margin-bottom: 30px;">
                        <h4 style="color: var(--text-muted); text-align: center;">How does the story continue?</h4>`;

            matches.forEach((match) => {
                const optLetter = match[1];
                const optTextRaw = match[2];
                
                let optEnrichedHtml = '';
                const optionWordsDict = block.enrichedData.optionWords || {};
                
                if (Array.isArray(optionWordsDict)) {
                     optEnrichedHtml = optTextRaw;
                } else if (optionWordsDict[optLetter] && optionWordsDict[optLetter].length > 0) {
                     optEnrichedHtml = optionWordsDict[optLetter].map(t => renderWordHtml(t, useBgHighlight)).join('');
                } else {
                     optEnrichedHtml = optTextRaw;
                }

                const optTranslations = block.enrichedData.optionTranslations || {};
                let optEnglishGloss = "";

                if (optTranslations[optLetter] && optTranslations[optLetter].trim() !== "") {
                    optEnglishGloss = optTranslations[optLetter];
                } else {
                    const optTokens = (!Array.isArray(optionWordsDict) && optionWordsDict[optLetter]) ? optionWordsDict[optLetter] :[];
                    optEnglishGloss = optTokens
                        .map(t => t.trans_context || t.trans_base || '')
                        .filter(m => m.trim() !== '')
                        .join(' ');
                }

                const optTransId = `opt-trans-${optLetter}`;
                const safeOptRaw = optTextRaw.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                html += `
                    <div class="option-row" style="display:flex; align-items:center; gap:10px; background:var(--surface-color); padding:10px; border-radius:8px; border: 2px solid var(--primary-color);">
                        <div style="flex:1;">
                            <div style="font-size:18px; line-height: 2.0;">
                                <strong>${optLetter}:</strong> ${optEnrichedHtml}
                                ${optEnglishGloss ? `<button class="btn-sentence-trans" data-target="${optTransId}" title="Show translation" style="margin-left:5px; background:none; border:none; cursor:pointer; color:var(--text-muted); padding:2px; line-height:1; display:inline-flex; align-items:center;">${EYE_ICON}</button>` : ''}
                                <button class="btn-sentence-speak" data-ja="${safeOptRaw}" title="Read aloud" style="margin-left:3px; background:none; border:none; cursor:pointer; color:var(--text-muted); padding:2px; line-height:1; display:inline-flex; align-items:center; opacity:0.7; transition:opacity 0.15s;">${SPEAKER_ICON}</button>
                            </div>
                            ${optEnglishGloss ? `<div id="${optTransId}" class="sentence-translation-box" style="display:none; font-size:13px; color:var(--text-muted); background:var(--trans-box-bg); padding:6px 8px; border-radius:4px; margin-top:2px;">${optEnglishGloss}</div>` : ''}
                        </div>
                        <button class="option-go-btn primary-btn" data-option="${optLetter}: ${optTextRaw}" style="width: auto; padding: 10px 20px; ${disabledStyle}" ${disabledProp}>Choose</button>
                    </div>
                `;
            });
            
            html += `
                <div style="margin-top: 10px; border-top: 1px dashed var(--border-color); padding-top: 15px;">
                    <label style="font-size: 14px; color: var(--text-muted); margin-bottom: 5px; display:block;">Or perform a custom action:</label>
                    <div style="display: flex; gap: 5px;">
                        <input type="text" id="custom-option-input" placeholder="e.g. Chi decides to take a nap." style="flex:1; padding: 10px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-main); border-radius: 6px;" ${disabledProp}>
                        <button id="btn-custom-go" class="primary-btn" style="width: auto; ${disabledStyle}" ${disabledProp}>Go</button>
                    </div>
                </div>
            </div>`;
        }
    } else if (block.selectedOption) {
        html += `<div class="past-choice" style="background: var(--past-choice-bg); padding: 15px; border-radius: 8px; text-align: center; color: var(--primary-color); font-weight: bold; margin-bottom: 30px;">
                    You chose: ${block.selectedOption}
                 </div>`;
    }

    // ── Edit and Regenerate buttons ───────────────────────────────────────────
    html += `<div style="display: flex; justify-content: center; gap: 10px; margin-top: 40px; border-top: 1px solid var(--border-color); padding-top: 20px;">
                <button id="btn-edit-text" style="background: none; border: 1px solid var(--text-muted); color: var(--text-muted); padding: 8px 15px; border-radius: 6px; cursor: pointer; ${disabledStyle}" ${disabledProp}>✏️ Edit Page</button>
                ${isLatestBlock ? `<button id="btn-regenerate" style="background: none; border: 1px solid var(--text-muted); color: var(--text-muted); padding: 8px 15px; border-radius: 6px; cursor: pointer; ${disabledStyle}" ${disabledProp}>${regenText}</button>` : ''}
             </div>`;

    // Spacer at the bottom
    html += `<div style="height: 80px;"></div>`;

    storyContentDiv.innerHTML = html;

    // ── EVENT LISTENERS ──────────────────────────────────────────────────────

    document.getElementById('btn-back-lib').addEventListener('click', renderLibrary);
    if (document.getElementById('btn-prev-page')) document.getElementById('btn-prev-page').onclick = () => { currentBlockIndex--; renderBlock(currentBlockIndex); };
    if (document.getElementById('btn-next-page')) document.getElementById('btn-next-page').onclick = () => { currentBlockIndex++; renderBlock(currentBlockIndex); };

    // ── "READ ALL" subtle button (story + options) ───────────────────────────
    const btnReadAll = document.getElementById('btn-read-all');
    if (btnReadAll) {
        btnReadAll.onclick = () => {
            const labelEl = document.getElementById('read-all-label');

            if (labelEl && labelEl.textContent === 'Stop') {
                stopSpeech();
                labelEl.textContent = 'Read all';
                btnReadAll.style.color = '';
                return;
            }

            // Build full text: story + option texts
            const optionRegex = /\[OPTION ([AB]):\s*(.*?)\]/g;
            const storyOnly = block.rawJa.replace(/\[OPTION\s+[AB][\s\S]*?\]/gi, '').trim();
            const optMatches = [...block.rawJa.matchAll(optionRegex)];
            let fullText = storyOnly;
            optMatches.forEach(m => { fullText += '　' + m[2]; });

            btnReadAll.style.color = 'var(--primary-color)';
            if (labelEl) labelEl.textContent = 'Stop';

            speakText(fullText,
                () => { /* onStart - already updated above */ },
                () => {
                    if (labelEl) labelEl.textContent = 'Read all';
                    btnReadAll.style.color = '';
                }
            );
        };
    }

    // ── Per-sentence speak buttons ───────────────────────────────────────────
    storyContentDiv.addEventListener('click', (e) => {
        // Sentence speak
        const speakBtn = e.target.closest('.btn-sentence-speak');
        if (speakBtn) {
            e.stopPropagation();
            const jaText = decodeURIComponent(speakBtn.getAttribute('data-ja') || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

            // Toggle: if same button is active, stop
            if (activeSpeakBtn === speakBtn) {
                stopSpeech();
                speakBtn.style.opacity = '0.7';
                speakBtn.style.color = '';
                activeSpeakBtn = null;
                return;
            }

            // Reset previous active button
            if (activeSpeakBtn) {
                activeSpeakBtn.style.opacity = '0.7';
                activeSpeakBtn.style.color = '';
                activeSpeakBtn = null;
            }

            activeSpeakBtn = speakBtn;
            speakBtn.style.opacity = '1';
            speakBtn.style.color = 'var(--primary-color)';

            speakText(jaText,
                () => { /* onStart */ },
                () => {
                    speakBtn.style.opacity = '0.7';
                    speakBtn.style.color = '';
                    if (activeSpeakBtn === speakBtn) activeSpeakBtn = null;
                }
            );
            return;
        }

        // Word click
        const wordEl = e.target.closest('.clickable-word');
        if (wordEl) {
            e.stopPropagation();
            try {
                const wordData = JSON.parse(decodeURIComponent(wordEl.getAttribute('data-word')));
                openPopup(wordData, {
                    onSave: (wd, newStatus) => {
                        srsDb.saveWord({ word: wd.base, furi: wd.furi, translation: wd.trans_base, status: newStatus });
                        closePopup();
                        if (!isLibraryView) renderBlock(currentBlockIndex);
                        sessionStorage.setItem('srs-dirty', '1');
                    }
                });
            } catch(e) {}
        }
    });

    document.querySelectorAll('.btn-sentence-trans').forEach(btn => {
        btn.onclick = (e) => {
            const uid = e.currentTarget.getAttribute('data-target');
            const transBox = uid ? document.getElementById(uid) : null;
            if (transBox) {
                transBox.style.display = transBox.style.display === 'none' || !transBox.style.display ? 'block' : 'none';
            }
        };
    });

    document.querySelectorAll('.option-go-btn').forEach(btn => {
        btn.onclick = () => triggerGeneration(btn.getAttribute('data-option'));
    });

    if (document.getElementById('btn-custom-go')) {
        document.getElementById('btn-custom-go').onclick = () => {
            const val = document.getElementById('custom-option-input').value.trim();
            if (val) triggerGeneration(val);
        };
    }

    if (document.getElementById('btn-regenerate')) {
        document.getElementById('btn-regenerate').onclick = async () => {
            const msg = isImported ? "Re-run AI analysis on this text?" : "Scrap this page and try again?";
            if (!confirm(msg)) return;
            try {
                isBackgroundProcessing = false;
                showLoading(0, "Regenerating...");
                await storyMgr.regenerateLastBlock(updateProgress, () => {
                    hideLoading();
                    isBackgroundProcessing = true;
                    renderBlock(storyMgr.getActiveStory().blocks.length - 1);
                }, () => {
                    const s = storyMgr.getActiveStory();
                    if (s) renderBlock(s.blocks.length - 1);
                });
                renderBlock(storyMgr.getActiveStory().blocks.length - 1);
                hideLoading();
                isBackgroundProcessing = false;
            } catch (error) {
                hideLoading();
                isBackgroundProcessing = false;
                showErrorModal(error.message, async () => {
                    try {
                        showLoading(0, "Regenerating...");
                        await storyMgr.regenerateLastBlock(updateProgress, () => {
                            hideLoading(); isBackgroundProcessing = true;
                            renderBlock(storyMgr.getActiveStory().blocks.length - 1);
                        }, () => { const s = storyMgr.getActiveStory(); if (s) renderBlock(s.blocks.length - 1); });
                        renderBlock(storyMgr.getActiveStory().blocks.length - 1);
                        hideLoading(); isBackgroundProcessing = false;
                    } catch (e) { hideLoading(); isBackgroundProcessing = false; showErrorModal(e.message, null); }
                });
            }
        };
    }

    // ── Edit Page Dual-Mode Modal ───────────────────────────────────────────
    const btnEdit = document.getElementById('btn-edit-text');
    if (btnEdit) {
        btnEdit.addEventListener('click', () => {
            const overlay = document.createElement('div');
            overlay.id = 'edit-page-overlay';
            overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index: 3000; display:flex; flex-direction:column; padding:20px;';
            
            overlay.innerHTML = `
                <div style="background:var(--surface-color); flex:1; border-radius:12px; display:flex; flex-direction:column; padding:20px; max-width:800px; margin:0 auto; width:100%; box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                    
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <h3 style="margin:0;">✏️ Edit Page</h3>
                        <div style="display:flex; background:var(--bg-color); border-radius:8px; border:1px solid var(--border-color); overflow:hidden;">
                            <button id="tab-raw" style="padding:6px 12px; border:none; background:var(--primary-color); color:white; font-size:13px; font-weight:bold; cursor:pointer;">Raw Text</button>
                            <button id="tab-json" style="padding:6px 12px; border:none; background:transparent; color:var(--text-muted); font-size:13px; font-weight:bold; cursor:pointer;">Parsed Data</button>
                        </div>
                    </div>
                    
                    <div id="pane-raw" style="flex:1; display:flex; flex-direction:column;">
                        <p style="font-size:13px; color:var(--text-muted); margin-bottom:10px;">Fix OCR mistakes or add line breaks. Saving will <strong>re-run the AI analysis</strong>.</p>
                        <textarea id="edit-raw-area" style="flex:1; width:100%; padding:12px; font-size:16px; line-height:1.6; border:1px solid var(--border-color); border-radius:8px; resize:none; background:var(--bg-color); color:var(--text-main); font-family:sans-serif;"></textarea>
                    </div>

                    <div id="pane-json" style="flex:1; display:none; flex-direction:column;">
                        <p style="font-size:13px; color:var(--text-muted); margin-bottom:10px;">Directly edit words, furigana, and translations. Must be valid JSON. Saving is <strong>instant</strong> (no AI call).</p>
                        <textarea id="edit-json-area" style="flex:1; width:100%; padding:12px; font-size:13px; line-height:1.4; border:1px solid var(--border-color); border-radius:8px; resize:none; background:var(--bg-color); color:var(--text-main); font-family:monospace; white-space:pre;"></textarea>
                    </div>

                    <div style="display:flex; gap:10px; margin-top:15px;">
                        <button id="btn-edit-cancel" style="flex:1; padding:12px; background:transparent; border:1px solid var(--border-color); color:var(--text-main); border-radius:8px; cursor:pointer; font-weight:bold;">Cancel</button>
                        <button id="btn-edit-save" class="primary-btn" style="flex:2;">Save & Re-analyze</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            // Set up Textareas
            const rawArea = document.getElementById('edit-raw-area');
            const jsonArea = document.getElementById('edit-json-area');
            rawArea.value = block.rawJa;
            jsonArea.value = JSON.stringify(block.enrichedData, null, 2);

            // Set up Tabs
            const tabRaw = document.getElementById('tab-raw');
            const tabJson = document.getElementById('tab-json');
            const paneRaw = document.getElementById('pane-raw');
            const paneJson = document.getElementById('pane-json');
            const btnSave = document.getElementById('btn-edit-save');
            
            let editMode = 'raw';

            tabRaw.onclick = () => {
                editMode = 'raw';
                tabRaw.style.background = 'var(--primary-color)';
                tabRaw.style.color = 'white';
                tabJson.style.background = 'transparent';
                tabJson.style.color = 'var(--text-muted)';
                paneRaw.style.display = 'flex';
                paneJson.style.display = 'none';
                btnSave.textContent = 'Save & Re-analyze';
            };

            tabJson.onclick = () => {
                editMode = 'json';
                tabJson.style.background = 'var(--primary-color)';
                tabJson.style.color = 'white';
                tabRaw.style.background = 'transparent';
                tabRaw.style.color = 'var(--text-muted)';
                paneRaw.style.display = 'none';
                paneJson.style.display = 'flex';
                btnSave.textContent = 'Save Changes (Instant)';
            };

            document.getElementById('btn-edit-cancel').onclick = () => overlay.remove();

            document.getElementById('btn-edit-save').onclick = async () => {
                if (editMode === 'raw') {
                    const newText = rawArea.value.trim();
                    if (!newText) {
                        alert("Text cannot be empty.");
                        return;
                    }
                    overlay.remove();

                    try {
                        isBackgroundProcessing = false;
                        showLoading(0, "Re-analyzing text...");
                        await storyMgr.updateBlockText(currentBlockIndex, newText, updateProgress);
                        hideLoading();
                        renderBlock(currentBlockIndex);
                    } catch (error) {
                        hideLoading();
                        showErrorModal(error.message, null);
                    }
                } else {
                    const newJsonStr = jsonArea.value.trim();
                    let newData;
                    try {
                        newData = JSON.parse(newJsonStr);
                    } catch(e) {
                        alert("Invalid JSON format. Please check your syntax.\n\nError: " + e.message);
                        return;
                    }
                    
                    if (!newData || !Array.isArray(newData.words)) {
                        alert("JSON must contain a 'words' array.");
                        return;
                    }
                    
                    overlay.remove();
                    storyMgr.updateBlockData(currentBlockIndex, newData);
                    renderBlock(currentBlockIndex);
                }
            };
        });
    }
}

// ─── VOCAB BASE MODAL (shown before each continuation) ───────────────────────

let _vocabModalSvsController = null;

function _showVocabModal(choiceText) {
    return new Promise((resolve) => {
        // Backdrop
        const backdrop = document.createElement('div');
        backdrop.style.cssText = `
            position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:3000;
            display:flex;align-items:flex-end;justify-content:center;
            animation:svmFadeIn 0.15s ease;`;

        // Sheet
        const sheet = document.createElement('div');
        sheet.style.cssText = `
            width:100%;max-width:600px;
            background:var(--surface-color);
            border-radius:16px 16px 0 0;
            padding:20px 20px 28px;
            box-shadow:0 -4px 24px rgba(0,0,0,0.18);
            animation:svmSlideUp 0.2s cubic-bezier(0.34,1.56,0.64,1);
            max-height:82vh;overflow-y:auto;`;

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;';
        header.innerHTML = `
            <div>
                <div style="font-size:15px;font-weight:700;color:var(--text-main);">🎯 Vocab Base</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Choose which words to weave into the next block</div>
            </div>
            <button id="svm-close" style="
                border:none;background:var(--bg-color);color:var(--text-muted);
                width:30px;height:30px;border-radius:50%;font-size:16px;cursor:pointer;
                display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>`;

        // Selector mount
        const mount = document.createElement('div');
        mount.id = 'svm-mount';

        // Footer buttons
        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;gap:10px;margin-top:18px;';
        footer.innerHTML = `
            <button id="svm-skip" style="
                flex:1;padding:11px;border-radius:8px;
                border:1.5px solid var(--border-color);background:var(--bg-color);
                color:var(--text-muted);font-size:13px;font-weight:600;cursor:pointer;">
                Skip
            </button>
            <button id="svm-generate" style="
                flex:2;padding:11px;border-radius:8px;border:none;
                background:var(--primary-color);color:#fff;
                font-size:13px;font-weight:700;cursor:pointer;">
                ⚡ Generate
            </button>`;

        sheet.appendChild(header);
        sheet.appendChild(mount);
        sheet.appendChild(footer);
        backdrop.appendChild(sheet);
        document.body.appendChild(backdrop);

        // Inject keyframe animations once
        if (!document.getElementById('svm-styles')) {
            const style = document.createElement('style');
            style.id = 'svm-styles';
            style.textContent = `
                @keyframes svmFadeIn  { from { opacity:0 } to { opacity:1 } }
                @keyframes svmSlideUp { from { transform:translateY(40px);opacity:0 } to { transform:translateY(0);opacity:1 } }`;
            document.head.appendChild(style);
        }

        // Mount selector
        _vocabModalSvsController = mountStoryVocabSelector(mount);

        const _close = (vocab) => {
            backdrop.remove();
            resolve(vocab);
        };

        sheet.querySelector('#svm-close').addEventListener('click', () => _close(null));
        sheet.querySelector('#svm-skip').addEventListener('click', () => _close([]));
        sheet.querySelector('#svm-generate').addEventListener('click', () => {
            const sel = _vocabModalSvsController.hasSelection()
                ? _vocabModalSvsController.getSelection()
                : [];
            _close(sel);
        });
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) _close(null); });
    });
}

async function triggerGeneration(choiceText) {
    // Show vocab modal — null means user dismissed (cancel), [] means skip, array means use vocab
    const vocabChoice = await _showVocabModal(choiceText);
    if (vocabChoice === null) return;   // user hit ✕ or tapped backdrop — cancel generation

    try {
        isBackgroundProcessing = false;
        showLoading(0, "Writing next chapter...");
        await storyMgr.generateNextBlock(choiceText, updateProgress, () => {
            hideLoading();
            isBackgroundProcessing = true;
            currentBlockIndex = storyMgr.getActiveStory().blocks.length - 1;
            renderBlock(currentBlockIndex);
        }, () => {
            const s = storyMgr.getActiveStory();
            if (s) { currentBlockIndex = s.blocks.length - 1; renderBlock(currentBlockIndex); }
        }, vocabChoice.length > 0 ? vocabChoice : null);
        currentBlockIndex = storyMgr.getActiveStory().blocks.length - 1;
        renderBlock(currentBlockIndex);
        hideLoading();
        isBackgroundProcessing = false;
    } catch (error) {
        hideLoading();
        isBackgroundProcessing = false;
        const capturedChoice = choiceText;
        showErrorModal(error.message, async () => {
            await triggerGeneration(capturedChoice);
        });
    }
}

// PROGRESS / LOADING
let loadingOverlay = null;

function showLoading(stepNum, text) {
    if (isBackgroundProcessing) {
        const inlineText = document.getElementById('inline-loading-text');
        const inlineBar = document.getElementById('inline-loading-bar');
        if (inlineText) inlineText.textContent = text;
        if (inlineBar) inlineBar.style.width = `${Math.min(100, Math.max(0, (stepNum / 6) * 100))}%`;
        return; 
    }

    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div style="background: var(--overlay-bg); position: absolute; top:0; left:0; right:0; bottom:0; z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center;">
                <div class="spinner" style="width: 40px; height: 40px; border: 4px solid var(--border-color); border-top: 4px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
                <h3 id="loading-text" style="color: var(--text-main); margin-bottom: 15px;">${text}</h3>
                <div style="width: 80%; background: var(--border-color); border-radius: 10px; height: 10px; overflow: hidden;">
                    <div id="loading-bar-fill" style="width: 0%; height: 100%; background: var(--primary-color); transition: width 0.3s ease;"></div>
                </div>
            </div>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>`;
        document.body.appendChild(loadingOverlay);
    } else { 
        loadingOverlay.style.display = 'flex'; 
        loadingOverlay.querySelector('#loading-text').textContent = text; 
    }
    const barEl = loadingOverlay.querySelector('#loading-bar-fill');
    if (barEl) barEl.style.width = `${Math.min(100, Math.max(0, (stepNum / 6) * 100))}%`;
}

function hideLoading() { 
    if (loadingOverlay) loadingOverlay.style.display = 'none'; 
}

function updateProgress(stepNum, description) { 
    showLoading(stepNum, description); 
}

// ── EXPORTED HELPER: speak a sentence (for use in trainer_ui.js) ─────────────
/**
 * Call this from trainer_ui.js to add a speak button next to a sentence.
 * Returns an HTMLButtonElement ready to be inserted next to the sentence element.
 *
 * Usage in trainer_ui.js:
 *   import { makeSentenceSpeakButton } from './viewer_ui.js';
 *   const btn = makeSentenceSpeakButton(jaText);
 *   sentenceEl.appendChild(btn);
 */
export function makeSentenceSpeakButton(jaText) {
    const btn = document.createElement('button');
    btn.innerHTML = SPEAKER_ICON;
    btn.title = 'Read aloud';
    btn.style.cssText = 'background:none; border:none; cursor:pointer; color:var(--text-muted); padding:2px 4px; line-height:1; display:inline-flex; align-items:center; opacity:0.7; transition:opacity 0.15s, color 0.15s; vertical-align:middle;';

    let isPlaying = false;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();

        if (isPlaying) {
            stopSpeech();
            isPlaying = false;
            btn.style.opacity = '0.7';
            btn.style.color = '';
            return;
        }

        isPlaying = true;
        btn.style.opacity = '1';
        btn.style.color = 'var(--primary-color)';

        speakText(jaText,
            () => { /* onStart */ },
            () => {
                isPlaying = false;
                btn.style.opacity = '0.7';
                btn.style.color = '';
            }
        );
    });

    return btn;
}