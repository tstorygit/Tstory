import * as storyMgr from './story_mgr.js';
import * as srsDb from './srs_db.js';
import { settings } from './settings.js';

// --- STATE ---
let currentBlockIndex = 0;
let activeWordData = null; 
let isLibraryView = true;

// --- DOM ELEMENTS ---
const storyContentDiv = document.getElementById('story-content');
const popupOverlay = document.getElementById('word-popup-overlay');
const closePopupBtn = document.getElementById('close-popup-btn');
const statusButtons = document.querySelectorAll('.status-btn');

// --- INITIALIZATION ---
export function initViewer() {
    if (closePopupBtn) {
        closePopupBtn.addEventListener('click', closeWordPopup);
    }
    
    if (popupOverlay) {
        popupOverlay.addEventListener('click', (e) => {
            if (e.target === popupOverlay) closeWordPopup();
        });
    }

    const popupStatusGroup = document.getElementById('popup-status-group');
    if (popupStatusGroup) {
        popupStatusGroup.addEventListener('click', (e) => {
            if (e.target.classList.contains('status-btn')) {
                const newStatus = parseInt(e.target.getAttribute('data-status'));
                handleStatusClick(newStatus);
            }
        });
    }

    // Re-render current block when display settings change (furigana / romaji toggles).
    // We sync the setting value from the DOM immediately so the user doesn't need to
    // press Save first — these are pure visual options with no API side-effects.
    const rerenderTriggers = [
        { id: 'setting-show-furigana',   key: 'showFurigana',       type: 'checkbox' },
        { id: 'setting-show-romaji',     key: 'showRomaji',         type: 'checkbox' },
        { id: 'setting-highlight-style', key: 'textHighlightStyle', type: 'select'   },
        { id: 'setting-sentence-newline',key: 'sentenceNewline',    type: 'checkbox' },
    ];
    rerenderTriggers.forEach(({ id, key, type }) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            // Sync this one setting live so renderBlock picks it up immediately
            settings[key] = type === 'checkbox' ? el.checked : el.value;
            if (!isLibraryView) renderBlock(currentBlockIndex);
        });
    });

    renderLibrary();
}

function renderLibrary() {
    isLibraryView = true;
    storyContentDiv.innerHTML = '';
    const stories = storyMgr.getStoryList();

    const createContainer = document.createElement('div');
    createContainer.style.marginBottom = '30px';
    createContainer.style.padding = '20px';
    createContainer.style.background = 'var(--surface-color)';
    createContainer.style.borderRadius = '8px';
    createContainer.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';

    createContainer.innerHTML = `
        <h3 style="margin-bottom: 10px; color: var(--primary-color);">Create New Story</h3>
        <textarea id="new-story-theme" rows="2" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 10px;" placeholder="e.g. My cat Chi goes to space..."></textarea>
        <button id="btn-create-story" class="primary-btn">Generate</button>
    `;
    storyContentDiv.appendChild(createContainer);

    document.getElementById('btn-create-story').addEventListener('click', async () => {
        const theme = document.getElementById('new-story-theme').value.trim();
        if (!theme) return alert("Please enter a theme!");
        try {
            showLoading(0, "Initializing Story...");
            await storyMgr.createNewStory(theme, updateProgress);
            hideLoading();
            renderReader();
        } catch (error) {
            hideLoading();
            alert("Error: " + error.message);
        }
    });

    if (stories.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'placeholder-text';
        emptyMsg.textContent = "No saved stories.";
        storyContentDiv.appendChild(emptyMsg);
        return;
    }

    const listHeader = document.createElement('h3');
    listHeader.textContent = "Your Library";
    listHeader.style.marginBottom = '15px';
    storyContentDiv.appendChild(listHeader);

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

        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = `
            <div style="font-weight: bold; font-size: 16px;">${story.title}</div>
            <div style="font-size: 12px; color: var(--text-muted);">Blocks: ${story.blocks.length} • ${new Date(story.created).toLocaleDateString()}</div>
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
    if (!storyData) { renderLibrary(); return; }
    currentBlockIndex = storyData.blocks.length - 1;
    renderBlock(currentBlockIndex);
}

function renderWordHtml(wordObj, useBgHighlight) {
    const srsEntry = srsDb.getWord(wordObj.base);
    const status = srsEntry ? srsEntry.status : 'unknown';
    const statusClass = useBgHighlight ? `status-${status}-bg word-tag` : `status-${status}-text`;
    const wordDataStr = encodeURIComponent(JSON.stringify(wordObj));
    const styleExtras = useBgHighlight ? '' : 'border-bottom:1px dashed #ccc;';

    const showFuri = settings.showFurigana && wordObj.furi;
    const showRoma = settings.showRomaji && wordObj.roma;

    if (showFuri || showRoma) {
        // Use a newline inside <rt> with white-space:pre to stack annotations vertically.
        // This is the most reliable cross-browser approach — <span display:block> inside
        // <rt> is ignored by browsers since <rt> is an inline context.
        let rtLines = [];
        if (showFuri) rtLines.push(`<span style="font-size:10px; color:var(--text-muted);">${wordObj.furi}</span>`);
        if (showRoma) rtLines.push(`<span style="font-size:9px; color:var(--primary-color); font-style:italic;">${wordObj.roma}</span>`);
        const rtContent = rtLines.join('<br>');
        return `<ruby><span class="clickable-word ${statusClass}" data-word="${wordDataStr}" style="cursor:pointer; ${styleExtras}">${wordObj.surface}</span><rt style="text-align:center; line-height:1.3;">${rtContent}</rt></ruby>`;
    } else {
        return `<span class="clickable-word ${statusClass}" data-word="${wordDataStr}" style="cursor:pointer; ${styleExtras}">${wordObj.surface}</span>`;
    }
}

function renderBlock(index) {
    const storyData = storyMgr.getActiveStory();
    if (!storyData || !storyData.blocks[index]) return;

    const block = storyData.blocks[index];
    const isLatestBlock = (index === storyData.blocks.length - 1);
    const useBgHighlight = (settings.textHighlightStyle === 'background');
    const useNewLines = settings.sentenceNewline;

    let html = '';

    // HEADER & NAVIGATION
    html += `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                <button id="btn-back-lib" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size: 14px;">&larr; Library</button>
                <span style="font-size: 14px; font-weight: bold; color: var(--primary-color);">Page ${index + 1} / ${storyData.blocks.length}</span>
             </div>`;

    html += `<div class="block-nav" style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 14px;">`;
    html += index > 0 ? `<button id="btn-prev-page" style="background:none; border:none; color:var(--primary-color); cursor:pointer;">&larr; Prev</button>` : `<span></span>`;
    html += !isLatestBlock ? `<button id="btn-next-page" style="background:none; border:none; color:var(--primary-color); cursor:pointer;">Next &rarr;</button>` : `<span></span>`;
    html += `</div>`;

    // IMAGE
    if (block.imageUrl) {
        html += `<div class="manga-image-container" style="margin-bottom: 20px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <img src="${block.imageUrl}" alt="Manga Panel" style="width: 100%; display: block;">
                 </div>`;
    }

    // MAIN TEXT
    html += `<div class="japanese-text" style="font-size: 20px; line-height: 2.2; margin-bottom: 30px; letter-spacing: 1px;">`;
    
    const words = block.enrichedData.words || [];
    const sentences = block.enrichedData.sentences || [];
    let sentenceIndex = 0;

    // Build a flat surface string to find sentence boundaries by matching sentence ja text.
    // This is more robust than scanning punctuation tokens, which breaks for quoted speech.
    // We accumulate surface chars and emit a translation button once the accumulated string
    // contains the full text of the current sentence.
    let accumulated = '';

    // Pre-clean sentence ja strings: strip spaces so matching works regardless of tokenizer spacing
    const sentenceJa = sentences.map(s => s.ja.replace(/\s/g, ''));

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        html += renderWordHtml(w, useBgHighlight);
        accumulated += w.surface;

        // Check if we've just completed the current sentence
        if (sentenceIndex < sentenceJa.length) {
            const target = sentenceJa[sentenceIndex];
            // Use contains rather than exact-end because accumulated may have chars beyond sentence end
            if (accumulated.replace(/\s/g, '').includes(target)) {
                const transText = sentences[sentenceIndex].en.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                html += `<button class="btn-sentence-trans" data-trans="${transText}" style="margin-left: 5px; background: none; border: none; cursor: pointer; font-size: 16px;">🌐</button>
                         <div class="sentence-translation-box hidden" style="font-size: 14px; color: var(--text-muted); background: #f0f0f0; padding: 8px; border-radius: 4px; margin-top: 5px; margin-bottom: 10px;">${transText}</div>`;
                if (useNewLines) html += `<br><br>`;
                // Reset accumulator to only keep chars after this sentence boundary
                const endPos = accumulated.replace(/\s/g, '').indexOf(target) + target.length;
                accumulated = accumulated.replace(/\s/g, '').slice(endPos);
                sentenceIndex++;
            }
        }
    }

    // Flush: if sentence data exists but no matching surface was found (e.g. AI sentence
    // split differs slightly from tokens), emit any remaining translations at the end
    while (sentenceIndex < sentences.length) {
        const transText = sentences[sentenceIndex].en.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
        html += `<button class="btn-sentence-trans" data-trans="${transText}" style="margin-left: 5px; background: none; border: none; cursor: pointer; font-size: 16px;">🌐</button>
                 <div class="sentence-translation-box hidden" style="font-size: 14px; color: var(--text-muted); background: #f0f0f0; padding: 8px; border-radius: 4px; margin-top: 5px; margin-bottom: 10px;">${transText}</div>`;
        sentenceIndex++;
    }
    html += `</div>`;

    // OPTIONS
    if (isLatestBlock) {
        const optionRegex = /\[OPTION ([AB]):\s*(.*?)\]/g;
        let matches = [...block.rawJa.matchAll(optionRegex)];

        if (matches.length >= 2) {
            html += `<div class="options-container" style="display: flex; flex-direction: column; gap: 15px; margin-bottom: 30px;">
                        <h4 style="color: var(--text-muted); text-align: center;">How does the story continue?</h4>`;
            
            matches.forEach((match) => {
                const optLetter = match[1];
                const optTextRaw = match[2];
                
                let optEnrichedHtml = '';
                const optionWordsDict = block.enrichedData.optionWords || {};
                
                // Fallback for old save structures (array instead of object)
                if (Array.isArray(optionWordsDict)) {
                     optEnrichedHtml = optTextRaw;
                } else if (optionWordsDict[optLetter] && optionWordsDict[optLetter].length > 0) {
                     // Render parsed tokens
                     optEnrichedHtml = optionWordsDict[optLetter].map(t => renderWordHtml(t, useBgHighlight)).join('');
                } else {
                     optEnrichedHtml = optTextRaw;
                }

                // Build English gloss from token meanings (particles/punctuation have no meaning, filtered out).
                const optTokens = (!Array.isArray(optionWordsDict) && optionWordsDict[optLetter]) ? optionWordsDict[optLetter] : [];
                const optEnglishGloss = optTokens
                    .map(t => t.trans_context || t.trans_base || '')
                    .filter(m => m.trim() !== '')
                    .join(' ');

                const optTransId = `opt-trans-${optLetter}`;
                html += `
                    <div class="option-row" style="display:flex; align-items:center; gap:10px; background:var(--surface-color); padding:10px; border-radius:8px; border: 2px solid var(--primary-color);">
                        <div style="flex:1;">
                            <div style="font-size:18px; line-height: 2.0;">
                                <strong>${optLetter}:</strong> ${optEnrichedHtml}
                                ${optEnglishGloss ? `<button class="btn-sentence-trans" data-trans="${optEnglishGloss.replace(/'/g, '&#39;').replace(/"/g, '&quot;')}" style="margin-left:5px; background:none; border:none; cursor:pointer; font-size:16px;">🌐</button>` : ''}
                            </div>
                            ${optEnglishGloss ? `<div id="${optTransId}" class="sentence-translation-box hidden" style="font-size:13px; color:var(--text-muted); background:#f0f0f0; padding:6px 8px; border-radius:4px; margin-top:2px;">${optEnglishGloss}</div>` : ''}
                        </div>
                        <button class="option-go-btn primary-btn" data-option="${optLetter}: ${optTextRaw}" style="width: auto; padding: 10px 20px;">Choose</button>
                    </div>
                `;
            });
            
            html += `
                <div style="margin-top: 10px; border-top: 1px dashed var(--border-color); padding-top: 15px;">
                    <label style="font-size: 14px; color: var(--text-muted); margin-bottom: 5px; display:block;">Or perform a custom action:</label>
                    <div style="display: flex; gap: 5px;">
                        <input type="text" id="custom-option-input" placeholder="e.g. Chi decides to take a nap." style="flex:1; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;">
                        <button id="btn-custom-go" class="primary-btn" style="width: auto;">Go</button>
                    </div>
                </div>
            </div>`;
        }
    } else if (block.selectedOption) {
        html += `<div class="past-choice" style="background: #e8f4fd; padding: 15px; border-radius: 8px; text-align: center; color: var(--primary-color); font-weight: bold; margin-bottom: 30px;">
                    You chose: ${block.selectedOption}
                 </div>`;
    }

    if (isLatestBlock) {
        html += `<div style="text-align: center; margin-top: 40px; border-top: 1px solid var(--border-color); padding-top: 20px;">
                    <button id="btn-regenerate" style="background: none; border: 1px solid var(--text-muted); color: var(--text-muted); padding: 8px 15px; border-radius: 6px; cursor: pointer;">🔁 Regenerate This Page</button>
                 </div>`;
    }

    storyContentDiv.innerHTML = html;

    // EVENT LISTENERS
    document.getElementById('btn-back-lib').addEventListener('click', renderLibrary);
    if (document.getElementById('btn-prev-page')) document.getElementById('btn-prev-page').onclick = () => { currentBlockIndex--; renderBlock(currentBlockIndex); };
    if (document.getElementById('btn-next-page')) document.getElementById('btn-next-page').onclick = () => { currentBlockIndex++; renderBlock(currentBlockIndex); };

    // Dictionary popup via event delegation (catches main text AND options text)
    storyContentDiv.addEventListener('click', (e) => {
        const wordEl = e.target.closest('.clickable-word');
        if (wordEl) {
            e.stopPropagation();
            const wordData = JSON.parse(decodeURIComponent(wordEl.getAttribute('data-word')));
            openWordPopup(wordData);
        }
    });

    document.querySelectorAll('.btn-sentence-trans').forEach(btn => {
        btn.onclick = (e) => {
            // The translation box is either the immediate next sibling (story text)
            // or the next sibling of the button's parent div (option rows).
            let transBox = e.currentTarget.nextElementSibling;
            if (!transBox || !transBox.classList.contains('sentence-translation-box')) {
                // Walk up one level and look at parent's next sibling
                transBox = e.currentTarget.parentElement?.nextElementSibling;
            }
            if (transBox && transBox.classList.contains('sentence-translation-box')) {
                const isHidden = transBox.classList.toggle('hidden');
                transBox.style.display = isHidden ? 'none' : 'block';
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
            if (!confirm("Scrap this page and try again?")) return;
            try {
                showLoading(0, "Regenerating...");
                await storyMgr.regenerateLastBlock(updateProgress);
                hideLoading();
                renderBlock(storyMgr.getActiveStory().blocks.length - 1);
            } catch (error) { hideLoading(); alert("Failed: " + error.message); }
        };
    }
    
    injectSRSColors();
}

async function triggerGeneration(choiceText) {
    try {
        showLoading(0, "Writing next chapter...");
        await storyMgr.generateNextBlock(choiceText, updateProgress);
        hideLoading();
        currentBlockIndex = storyMgr.getActiveStory().blocks.length - 1;
        renderBlock(currentBlockIndex);
    } catch (error) { hideLoading(); alert("Failed: " + error.message); }
}

// POPUP LOGIC
function openWordPopup(wordData) {
    activeWordData = wordData;
    document.getElementById('popup-term').textContent = wordData.surface;

    // Furigana line: show furigana if available and enabled, else romaji if enabled
    const furiEl = document.getElementById('popup-furi');
    const romaEl = document.getElementById('popup-roma');

    // Both shown independently — no priority, user controls each via settings
    furiEl.textContent = (settings.showFurigana && wordData.furi) ? wordData.furi : '';
    furiEl.style.display = (settings.showFurigana && wordData.furi) ? 'inline' : 'none';

    if (romaEl) {
        romaEl.textContent = (settings.showRomaji && wordData.roma) ? wordData.roma : '';
        romaEl.style.display = (settings.showRomaji && wordData.roma) ? 'inline' : 'none';
    }

    document.getElementById('popup-base').textContent = wordData.base;
    document.getElementById('popup-trans-base').textContent = wordData.trans_base;
    document.getElementById('popup-trans-context').textContent = wordData.trans_context;
    
    const noteEl = document.getElementById('popup-note');
    if (wordData.note) { noteEl.textContent = wordData.note; noteEl.style.display = 'block'; }
    else { noteEl.style.display = 'none'; }

    const srsEntry = srsDb.getWord(wordData.base);
    const currentStatus = srsEntry ? srsEntry.status : 0;
    
    statusButtons.forEach(btn => {
        btn.style.border = (parseInt(btn.getAttribute('data-status')) === currentStatus) ? '3px solid #333' : 'none';
    });
    popupOverlay.classList.remove('hidden');
}

function closeWordPopup() { popupOverlay.classList.add('hidden'); activeWordData = null; }

function handleStatusClick(newStatus) {
    if (!activeWordData) return;
    srsDb.saveWord({ word: activeWordData.base, furi: activeWordData.furi, translation: activeWordData.trans_base, status: newStatus });
    closeWordPopup();
    if (!isLibraryView) renderBlock(currentBlockIndex);
}

// PROGRESS / LOADING
let loadingOverlay = null;
function showLoading(stepNum, text) {
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div style="background: rgba(255,255,255,0.95); position: absolute; top:0; left:0; right:0; bottom:0; z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center;">
                <div class="spinner" style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
                <h3 id="loading-text" style="color: var(--text-main); margin-bottom: 15px;">${text}</h3>
                <div style="width: 80%; background: #e0e0e0; border-radius: 10px; height: 10px; overflow: hidden;">
                    <div id="loading-bar-fill" style="width: 0%; height: 100%; background: var(--primary-color); transition: width 0.3s ease;"></div>
                </div>
            </div>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>`;
        document.body.appendChild(loadingOverlay);
    } else { loadingOverlay.style.display = 'flex'; loadingOverlay.querySelector('#loading-text').textContent = text; }
    const barEl = loadingOverlay.querySelector('#loading-bar-fill');
    if (barEl) barEl.style.width = `${Math.min(100, Math.max(0, (stepNum / 6) * 100))}%`;
}
function hideLoading() { if (loadingOverlay) loadingOverlay.style.display = 'none'; }
function updateProgress(stepNum, description) { showLoading(stepNum, description); }

function injectSRSColors() {
    if (document.getElementById('dynamic-srs-styles')) return;
    const style = document.createElement('style');
    style.id = 'dynamic-srs-styles';
    style.innerHTML = `
        .status-0-text { color: var(--status-0); } .status-1-text { color: var(--status-1); } .status-2-text { color: var(--status-2); }
        .status-3-text { color: var(--status-3); } .status-4-text { color: var(--status-4); } .status-5-text { color: var(--status-5); }
        .status-unknown-text { color: var(--status-unknown); }
        .status-0-bg { background-color: var(--status-0); color: white; } .status-1-bg { background-color: var(--status-1); color: white; }
        .status-2-bg { background-color: var(--status-2); color: black; } .status-3-bg { background-color: var(--status-3); color: black; }
        .status-4-bg { background-color: var(--status-4); color: white; } .status-5-bg { background-color: var(--status-5); color: white; }
        .status-unknown-bg { background-color: transparent; }
        .word-tag { padding: 0 4px; border-radius: 4px; margin: 0 1px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
        .hidden { display: none !important; }`;
    document.head.appendChild(style);
}