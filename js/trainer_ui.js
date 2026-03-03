import * as trainerMgr from './trainer_mgr.js';
import * as srsDb from './srs_db.js';
import { settings } from './settings.js';
import { wordList } from '../data/word_list_1000.js'; // Imported to lookup missing ranks

// ─── ICONS ───────────────────────────────────────────────────────────────────

const EYE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

// ─── STATE ───────────────────────────────────────────────────────────────────

let pregenAbortController = null;

// ─── INIT ────────────────────────────────────────────────────────────────────

export function initTrainer() {
    const tabBtn = document.querySelector('button[data-target="view-trainer"]');
    if (tabBtn) tabBtn.addEventListener('click', renderTrainer);

    // External mode dropdown — re-render immediately on change
    const extModeSelect = document.getElementById('trainer-ext-mode');
    if (extModeSelect) {
        extModeSelect.addEventListener('change', () => {
            settings.trainerExtMode = extModeSelect.value;
            renderTrainer();
        });
    }

    const srsModeSelect = document.getElementById('trainer-srs-mode');
    if (srsModeSelect) {
        srsModeSelect.addEventListener('change', () => {
            settings.trainerSrsMode = srsModeSelect.value;
            renderTrainer();
        });
    }

    // Jump button in popup
    const jumpBtn = document.getElementById('btn-trainer-jump');
    if (jumpBtn) {
        jumpBtn.addEventListener('click', () => {
            const targetRank = parseInt(jumpBtn.getAttribute('data-target-rank'));
            if (!targetRank) return;
            if (confirm(`Jump your progress to word #${targetRank}?`)) {
                trainerMgr.setProgress(targetRank);
                // Close popup
                document.getElementById('word-popup-overlay').classList.add('hidden');
                // Navigate to trainer tab
                document.querySelector('button[data-target="view-trainer"]')?.click();
                renderTrainer();
            }
        });
    }
    
    // Popup Status Button handler (specifically for Trainer)
    const popupStatusGroup = document.getElementById('popup-status-group');
    if (popupStatusGroup) {
        popupStatusGroup.addEventListener('click', (e) => {
            // Only handle if we are currently inside the Trainer view
            if (!document.getElementById('view-trainer').classList.contains('active')) return;
            
            const btn = e.target.closest('.status-btn');
            if (!btn) return;
            
            const newStatus = parseInt(btn.getAttribute('data-status'));
            const wordDataStr = document.getElementById('word-popup').dataset.wordData;
            
            if (wordDataStr) {
                try {
                    const wordData = JSON.parse(wordDataStr);
                    srsDb.saveWord({
                        word: wordData.base || wordData.surface,
                        furi: wordData.furi || '',
                        translation: wordData.trans_base || wordData.trans_context || '',
                        status: newStatus
                    });
                    document.getElementById('word-popup-overlay').classList.add('hidden');
                    renderTrainer();
                } catch (err) {
                    console.error('Failed to parse wordData', err);
                }
            }
        });
    }

    // Pre-generate button
    const pregenBtn = document.getElementById('btn-pregen');
    if (pregenBtn) {
        pregenBtn.addEventListener('click', handlePregen);
    }

    // Word click delegation on trainer content
    const trainerContent = document.getElementById('trainer-content');
    if (trainerContent) {
        trainerContent.addEventListener('click', (e) => {
            const wordEl = e.target.closest('.clickable-word');
            if (!wordEl) return;
            e.stopPropagation();
            const wordData = JSON.parse(decodeURIComponent(wordEl.getAttribute('data-word')));
            openTrainerWordPopup(wordData);
        });
    }

    // Sentence translation buttons in trainer (delegated)
    if (trainerContent) {
        trainerContent.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-sentence-trans');
            if (!btn) return;
            const transBox = btn.closest('.trainer-sentence-card')?.querySelector('.sentence-translation-box');
            if (transBox) {
                const isHidden = transBox.classList.toggle('hidden');
                transBox.style.display = isHidden ? 'none' : 'block';
            }
        });
    }
}

// ─── POPUP ───────────────────────────────────────────────────────────────────

function openTrainerWordPopup(wordData) {
    // Fill standard popup fields
    const popupOverlay = document.getElementById('word-popup-overlay');
    const popupTrainerZone = document.getElementById('popup-trainer-zone');

    document.getElementById('popup-term').textContent = wordData.surface;
    const furiEl = document.getElementById('popup-furi');
    const romaEl = document.getElementById('popup-roma');

    furiEl.textContent = (settings.showFurigana && wordData.furi) ? wordData.furi : '';
    furiEl.style.display = (settings.showFurigana && wordData.furi) ? 'inline' : 'none';
    if (romaEl) {
        romaEl.textContent = (settings.showRomaji && wordData.roma) ? wordData.roma : '';
        romaEl.style.display = (settings.showRomaji && wordData.roma) ? 'inline' : 'none';
    }

    document.getElementById('popup-base').textContent = wordData.base || wordData.surface;
    document.getElementById('popup-trans-base').textContent = wordData.trans_base || '';
    document.getElementById('popup-trans-context').textContent = wordData.trans_context || '';

    const noteEl = document.getElementById('popup-note');
    if (wordData.note) { noteEl.textContent = wordData.note; noteEl.style.display = 'block'; }
    else { noteEl.style.display = 'none'; }

    // SRS status buttons
    const statusButtons = document.querySelectorAll('#popup-status-group .status-btn');
    const srsEntry = srsDb.getWord(wordData.base || wordData.surface);
    const currentStatus = srsEntry ? srsEntry.status : 0;
    statusButtons.forEach(btn => {
        btn.style.border = (parseInt(btn.getAttribute('data-status')) === currentStatus) ? '3px solid var(--text-main)' : 'none';
    });

    // Trainer zone - DYNAMIC RANK LOOKUP
    let displayRank = wordData.rank;
    if (displayRank === undefined) {
        // Fallback: If rank wasn't cached, look it up in the live dictionary right now
        const baseForm = wordData.base || wordData.surface;
        const match = wordList.find(w => w.word === baseForm || w.word === wordData.surface);
        if (match) displayRank = match.rank;
    }

    if (popupTrainerZone) {
        if (displayRank !== undefined) {
            document.getElementById('popup-rank').textContent = displayRank;
            document.getElementById('btn-trainer-jump').setAttribute('data-target-rank', displayRank);
            popupTrainerZone.classList.remove('hidden');
        } else {
            popupTrainerZone.classList.add('hidden');
        }
    }

    // Store word data on popup for status-btn handler
    document.getElementById('word-popup').dataset.activeWord = wordData.base || wordData.surface;
    document.getElementById('word-popup').dataset.wordData = JSON.stringify(wordData);

    popupOverlay.classList.remove('hidden');
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

export async function renderTrainer() {
    const rank = trainerMgr.getProgress();
    const total = trainerMgr.getTotalWords();
    const wordObj = trainerMgr.getWordByRank(rank);

    // Update progress UI
    const progressFill = document.getElementById('trainer-progress-fill');
    const progressLabel = document.getElementById('trainer-progress-label');
    if (progressFill) progressFill.style.width = `${(rank / total) * 100}%`;
    if (progressLabel) progressLabel.textContent = `Word ${rank} / ${total}`;

    // Sync ext mode dropdown with settings
    const extModeSelect = document.getElementById('trainer-ext-mode');
    if (extModeSelect && settings.trainerExtMode) {
        extModeSelect.value = settings.trainerExtMode;
    }

    const content = document.getElementById('trainer-content');
    if (!content) return;

    // Check if data is cached
    const existingData = getCachedBlock(rank);

    if (!existingData) {
        renderStateA(content, wordObj, rank);
    } else {
        renderStateB(content, existingData, rank, total);
    }
}

function getCachedBlock(rank) {
    try {
        const data = JSON.parse(localStorage.getItem('trainer_data')) || {};
        return data[String(rank)] || null;
    } catch {
        return null;
    }
}

function renderStateA(content, wordObj, rank) {
    if (!wordObj) {
        content.innerHTML = `<div class="placeholder-text">No word found at rank ${rank}.</div>`;
        return;
    }

    const total = trainerMgr.getTotalWords();
    const nextWordObj = rank < total ? trainerMgr.getWordByRank(rank + 1) : null;

    content.innerHTML = `
        <div style="max-width: 800px; margin: 0 auto;">
            <!-- Top Area: Rigid Height Container to prevent layout shift entirely -->
            <div style="height: 240px; min-height: 240px; max-height: 240px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; padding-top: 15px; overflow: hidden;">
                
                <div style="height: 20px; min-height: 20px; font-size: 13px; color: var(--text-muted); margin-bottom: 5px; flex-shrink: 0;">Word #${rank}</div>
                
                <!-- Fixed height word container with absolute overflow constraints -->
                <div style="height: 90px; min-height: 90px; width: 100%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <div style="font-size: 56px; font-weight: bold; line-height: 1.2; color: var(--text-main); text-align: center; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; padding: 0 10px;">
                        ${wordObj.word}
                    </div>
                </div>
                
                <div style="height: 30px; min-height: 30px; font-size: 20px; color: var(--text-muted); margin-bottom: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; white-space: nowrap; overflow: hidden; max-width: 100%;">
                    ${wordObj.furi || ''}
                </div>
                
                <div style="height: 40px; min-height: 40px; display: flex; align-items: flex-start; justify-content: center; width: 100%; flex-shrink: 0; overflow: hidden;">
                    <button id="btn-reveal-trans" style="background:none; border:1px dashed var(--border-color); color:var(--text-muted); padding:6px 16px; border-radius:20px; cursor:pointer; font-size:14px; margin-top:2px;">${EYE_ICON} Bedeutung anzeigen</button>
                    <div id="trans-spoiler" style="display:none; font-size:16px; color:var(--primary-color); text-align: center; padding: 0 10px; line-height: 1.2;">${wordObj.trans || ''}</div>
                </div>
            </div>

            <!-- Bottom Area: Buttons container anchored precisely below the header -->
            <div style="max-width: 600px; margin: 0 auto;">
                <button id="btn-generate-sentences" class="primary-btn" style="font-size: 17px; padding: 14px 36px; margin-bottom: 12px; width: 100%;">
                    📖 Sätze generieren
                </button>

                ${rank < total ? `
                <button id="btn-trainer-skip-done" style="width:100%; padding:12px; border-radius:8px; background:var(--primary-color); color:white; border:none; cursor:pointer; font-size:14px; font-weight:bold; margin-bottom:8px; display:flex; align-items:center; justify-content:center; gap:8px;">
                    <span>✓ Kenn ich schon — Weiter gehts mit: ${nextWordObj ? nextWordObj.word : ''}</span>
                    <span style="background:rgba(255,255,255,0.3); font-size:11px; padding:2px 6px; border-radius:10px;">SRS 5</span>
                </button>
                <button id="btn-trainer-skip" style="width:100%; padding:10px; border-radius:8px; background:none; border:1px solid var(--border-color); color:var(--text-muted); cursor:pointer; font-size:14px;">
                    → Überspringen — Weiter gehts mit: ${nextWordObj ? nextWordObj.word : ''}
                </button>` : ''}

                ${rank > 1 ? `
                <div style="text-align:center; margin-top:20px;">
                    <button id="btn-trainer-prev-a" style="background:none; border:none; color:var(--primary-color); cursor:pointer; font-size:13px;">← Zurück</button>
                </div>` : ''}
            </div>
        </div>
    `;

    document.getElementById('btn-reveal-trans')?.addEventListener('click', () => {
        const spoiler = document.getElementById('trans-spoiler');
        const btn = document.getElementById('btn-reveal-trans');
        if (spoiler) spoiler.style.display = 'block';
        if (btn) btn.style.display = 'none';
    });

    document.getElementById('btn-generate-sentences').addEventListener('click', async () => {
        showTrainerLoading(1, 'Generating sentences…');
        try {
            await trainerMgr.generateTrainerSentences(rank, false, (step, text) => showTrainerLoading(step, text));
            hideTrainerLoading();
            renderTrainer();
        } catch (e) {
            hideTrainerLoading();
            content.innerHTML += `<p style="color:var(--status-0); padding:20px;">Error: ${e.message}</p>`;
        }
    });

    // Skip & mark as known (status 5)
    document.getElementById('btn-trainer-skip-done')?.addEventListener('click', () => {
        srsDb.saveWord({ word: wordObj.word, furi: wordObj.furi || '', translation: wordObj.trans || '', status: 5 });
        trainerMgr.setProgress(rank + 1);
        renderTrainer();
    });

    // Skip without marking
    document.getElementById('btn-trainer-skip')?.addEventListener('click', () => {
        trainerMgr.setProgress(rank + 1);
        renderTrainer();
    });

    document.getElementById('btn-trainer-prev-a')?.addEventListener('click', () => {
        trainerMgr.setProgress(rank - 1);
        renderTrainer();
    });

    updatePregenBox(rank, false);
}

function renderStateB(content, block, rank, total) {
    // Ensure SRS highlight CSS exists even if Story tab was never visited
    if (!document.getElementById('dynamic-srs-styles')) {
        const sty = document.createElement('style');
        sty.id = 'dynamic-srs-styles';
        sty.textContent = `.status-0-text{color:var(--status-0)}.status-1-text{color:var(--status-1)}.status-2-text{color:var(--status-2)}.status-3-text{color:var(--status-3)}.status-4-text{color:var(--status-4)}.status-5-text{color:var(--status-5)}.status-unknown-text{color:var(--status-unknown)}.status-0-bg{background-color:var(--status-0);color:white}.status-1-bg{background-color:var(--status-1);color:white}.status-2-bg{background-color:var(--status-2);color:black}.status-3-bg{background-color:var(--status-3);color:black}.status-4-bg{background-color:var(--status-4);color:white}.status-5-bg{background-color:var(--status-5);color:white}.status-unknown-bg{background-color:transparent}.word-tag{padding:0 4px;border-radius:4px;margin:0 1px;box-decoration-break:clone;-webkit-box-decoration-break:clone}`;
        document.head.appendChild(sty);
    }
    const extMode = settings.trainerExtMode || 'highlight';
    const useBg = (settings.textHighlightStyle === 'background');

    let html = '';

    // Target word header — perfectly matches State A's rigid 240px height and layout to prevent UI jumping
    const tw = block.targetWord;
    
    html += `
        <div style="max-width: 800px; margin: 0 auto;">
            <!-- Top Area: Rigid Height Container to prevent layout shift entirely -->
            <div style="height: 240px; min-height: 240px; max-height: 240px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; padding-top: 15px; overflow: hidden;">
                
                <div style="height: 20px; min-height: 20px; font-size: 13px; color: var(--text-muted); margin-bottom: 5px; flex-shrink: 0;">Word #${rank}</div>
                
                <!-- Fixed height word container with absolute overflow constraints -->
                <div style="height: 90px; min-height: 90px; width: 100%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <div class="target-word-rainbow-lg" style="font-size: 56px; font-weight: bold; line-height: 1.2; text-align: center; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; padding: 0 10px;">
                        ${rainbowChars(tw.word)}
                    </div>
                </div>
                
                <div style="height: 30px; min-height: 30px; font-size: 20px; color: var(--text-muted); margin-bottom: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; white-space: nowrap; overflow: hidden; max-width: 100%;">
                    ${tw.furi || ''}
                </div>
                
                <div style="height: 40px; min-height: 40px; font-size: 16px; color: var(--primary-color); display: flex; align-items: flex-start; justify-content: center; text-align: center; padding: 0 10px; flex-shrink: 0; overflow: hidden; width: 100%; line-height: 1.2; padding-top: 2px;">
                    ${tw.trans || ''}
                </div>
            </div>
            
            <!-- Bottom Area: Sentences container anchored precisely below the header -->
            <div>
    `;

    // Sentences
    const sentences = block.rawSentences ||[];
    const words = block.enrichedData?.words ||[];
    const targetWord = tw.word;

    const sentenceTokenGroups = splitTokensIntoSentences(words, sentences);

    sentences.forEach((sentence, idx) => {
        const tokens = sentenceTokenGroups[idx] ||[];
        const tokensHtml = tokens.map(t => renderTrainerWordHtml(t, useBg, extMode, targetWord)).join('');
        const transEscaped = (sentence.en || '').replace(/'/g, "&#39;").replace(/"/g, "&quot;");

        html += `
            <div class="trainer-sentence-card">
                <div style="font-size: 20px; line-height: 2.4; margin-bottom: 8px; color: var(--text-main);">${tokensHtml}
                    <button class="btn-sentence-trans" title="Übersetzung anzeigen" style="margin-left:5px; background:none; border:none; cursor:pointer; color:var(--text-muted); padding:2px; line-height:1; display:inline-flex; align-items:center;">${EYE_ICON}</button>
                </div>
                <div class="sentence-translation-box hidden" style="display:none; font-size:14px; color:var(--text-muted); background:var(--trans-box-bg); padding:8px; border-radius:4px; margin-top:4px;">${transEscaped}</div>
            </div>
        `;
    });

    // Navigation
    const nextWordObj = rank < total ? trainerMgr.getWordByRank(rank + 1) : null;

    const srsBtns = [0,1,2,3,4,5].map(i =>
        `<button class="status-btn btn-trainer-srs" data-srs="${i}" data-status="${i}">${i}</button>`
    ).join('');

    html += `<div style="display:flex; gap:10px; margin-top:14px; align-items:center;">`;
    html += rank > 1
        ? `<button id="btn-trainer-prev" style="padding:10px 18px; border-radius:6px; background:var(--surface-color); border:1px solid var(--border-color); color:var(--text-muted); cursor:pointer; font-size:13px; white-space:nowrap; flex-shrink:0;">← Zurück</button>`
        : `<span style="flex-shrink:0;"></span>`;
    html += `<div class="status-buttons" style="flex:1; margin:0; justify-content:center; gap:8px;">${srsBtns}</div>`;
    html += rank < total
        ? `<button id="btn-trainer-next" style="padding:10px 18px; border-radius:6px; background:var(--surface-color); border:1px solid var(--border-color); color:var(--text-muted); cursor:pointer; font-size:13px; white-space:nowrap; flex-shrink:0;">Überspringen →</button>`
        : `<span style="font-size:14px; color:var(--text-muted); flex-shrink:0;">🎉 All done!</span>`;
    html += `</div>`;

    // Regenerate
    html += `<div style="text-align:center; margin-top:20px;">
        <button id="btn-trainer-regen" style="background:var(--surface-color); border:1px solid var(--border-color); color:var(--text-muted); padding:8px 15px; border-radius:6px; cursor:pointer;">🔁 Regenerate</button>
    </div>`;

    // Close the wrapper div
    html += `</div></div>`;

    content.innerHTML = html;

    // Bind navigation
    document.getElementById('btn-trainer-prev')?.addEventListener('click', () => {
        trainerMgr.setProgress(rank - 1);
        renderTrainer();
    });
    document.getElementById('btn-trainer-next')?.addEventListener('click', () => {
        trainerMgr.setProgress(rank + 1);
        renderTrainer();
    });
    document.querySelectorAll('.btn-trainer-srs').forEach(btn => {
        btn.addEventListener('click', () => {
            const status = parseInt(btn.getAttribute('data-srs'));
            const tw = block.targetWord;
            if (tw) {
                srsDb.saveWord({ word: tw.word, furi: tw.furi || '', translation: tw.trans || '', status });
            }
            trainerMgr.setProgress(rank + 1);
            renderTrainer();
        });
    });
    document.getElementById('btn-trainer-regen')?.addEventListener('click', async () => {
        if (!confirm('Regenerate sentences for this word?')) return;
        trainerMgr.clearCacheForRank(rank);
        showTrainerLoading(1, 'Regenerating…');
        try {
            await trainerMgr.generateTrainerSentences(rank, true, (step, text) => showTrainerLoading(step, text));
            hideTrainerLoading();
            renderTrainer();
        } catch (e) {
            hideTrainerLoading();
            alert('Error: ' + e.message);
        }
    });

    updatePregenBox(rank, true);
}

// Split tokens array back into per-sentence groups based on sentence.ja text
function splitTokensIntoSentences(tokens, sentences) {
    const groups =[];
    let tokenIdx = 0;

    for (const sentence of sentences) {
        const target = sentence.ja.replace(/\s/g, '');
        let accumulated = '';
        const group =[];

        while (tokenIdx < tokens.length && !accumulated.replace(/\s/g, '').includes(target)) {
            group.push(tokens[tokenIdx]);
            accumulated += tokens[tokenIdx].surface;
            tokenIdx++;
        }
        groups.push(group);
    }

    // Any remaining tokens go to the last group
    if (tokenIdx < tokens.length && groups.length > 0) {
        while (tokenIdx < tokens.length) {
            groups[groups.length - 1].push(tokens[tokenIdx]);
            tokenIdx++;
        }
    }

    return groups;
}

// Japanese punctuation characters — never clickable, never highlighted
const PUNCTUATION_RE = /^[。、！？…「」『』（）【】〔〕・～：；―〜•°·\s\.,!?:;()\[\]{}'"]+$/;

function isPunctuation(surface) {
    return PUNCTUATION_RE.test(surface);
}

// Build staggered per-character spans for the rainbow animation (large header)
function rainbowChars(text) {
    return[...text].map((ch, i) =>
        `<span class="tw-char" style="animation-delay:${(i * 0.12).toFixed(2)}s">${ch}</span>`
    ).join('');
}

// Same rainbow, but uses the sentence-safe class (no scale bounce) to prevent
// Chrome from reflowing sibling tokens on every animation frame
function rainbowCharsSentence(text) {
    return[...text].map((ch, i) =>
        `<span class="tw-char-sentence" style="animation-delay:${(i * 0.12).toFixed(2)}s">${ch}</span>`
    ).join('');
}

function renderTrainerWordHtml(token, useBg, extMode, targetWord = null) {
    // Punctuation: render as plain text — no click, no highlight, no furigana
    if (isPunctuation(token.surface)) {
        return `<span style="color: var(--text-main);">${token.surface}</span>`;
    }

    // Check if this token is the target word (match on surface or base)
    const isTarget = targetWord && (
        token.surface === targetWord ||
        token.base    === targetWord ||
        (token.surface === (token.base || '') && token.surface === targetWord)
    );

    const srsEntry = srsDb.getWord(token.base || token.surface);
    const hasSrsStatus = settings.trainerSrsMode !== 'ignore' && srsEntry != null;
    const status = hasSrsStatus ? srsEntry.status : 'unknown';
    
    const isPro5 = settings.proLevel5 && status === 5;
    
    const statusClass = isTarget ? '' : (isPro5 ? '' : (useBg ? `status-${status}-bg word-tag` : `status-${status}-text`));
    const wordDataStr = encodeURIComponent(JSON.stringify(token));
    
    let styleExtras = '';
    if (!useBg && !isTarget && !isPro5) {
        styleExtras = 'border-bottom:1px dashed var(--border-color);';
    }

    const isExt = token.isExternal === true;

    let surfaceDisplay = token.surface;
    let furiDisplay = token.furi;
    let extClass = '';

    if (isExt && !isTarget) {
        // Don't show blue highlight when an SRS colour already marks this word
        if (extMode === 'highlight' && !hasSrsStatus) {
            extClass = 'external-word-bg';
        } else if (extMode === 'replace_word') {
            surfaceDisplay = token.trans_context || token.trans_base || token.surface;
        } else if (extMode === 'replace_furi') {
            furiDisplay = token.trans_context || token.trans_base || '';
        }
    }

    const showFuri = !isPro5 && settings.showFurigana && (furiDisplay || token.furi);
    const showRoma = !isPro5 && settings.showRomaji && token.roma;
    const showAnnotation = showFuri || showRoma;

    const rainbowClass = isTarget ? 'target-word-rainbow' : '';
    const combinedClass =[statusClass, extClass, rainbowClass].filter(Boolean).join(' ');
    const innerContent = isTarget ? rainbowCharsSentence(surfaceDisplay) : surfaceDisplay;

    if (showAnnotation) {
        let rtLines = [];
        if (showFuri) rtLines.push(`<span style="font-size:10px; color:var(--text-muted);">${furiDisplay || token.furi}</span>`);
        if (showRoma) rtLines.push(`<span style="font-size:9px; color:var(--primary-color); font-style:italic;">${token.roma}</span>`);
        return `<ruby><span class="clickable-word ${combinedClass}" data-word="${wordDataStr}" style="cursor:pointer; ${styleExtras}">${innerContent}</span><rt style="text-align:center; line-height:1.3;">${rtLines.join('<br>')}</rt></ruby>`;
    } else {
        return `<span class="clickable-word ${combinedClass}" data-word="${wordDataStr}" style="cursor:pointer; ${styleExtras}">${innerContent}</span>`;
    }
}

// ─── PRE-GEN BOX ─────────────────────────────────────────────────────────────

let _pregenInFlight = false;   // true while a background pregen is running
let _pregenRank = null;        // which rank is being pregenned

function updatePregenBox(rank, show) {
    const box = document.getElementById('trainer-pregen-box');
    const pregenWord = document.getElementById('pregen-word');
    const btn = document.getElementById('btn-pregen');
    if (!box || !pregenWord || !btn) return;

    const total = trainerMgr.getTotalWords();
    if (!show || rank >= total) {
        box.style.display = 'none';
        box.classList.add('hidden');
        return;
    }

    const nextWordObj = trainerMgr.getWordByRank(rank + 1);
    if (!nextWordObj) {
        box.style.display = 'none';
        box.classList.add('hidden');
        return;
    }

    pregenWord.textContent = `${nextWordObj.word}（${nextWordObj.furi || ''}）`;
    btn.setAttribute('data-pregen-rank', String(rank + 1));
    box.classList.remove('hidden');
    box.style.display = 'flex';

    // Don't overwrite button state if pregen for this rank is still running
    if (_pregenInFlight && _pregenRank === rank + 1) return;

    btn.textContent = 'Pre-generate';
    btn.disabled = false;
}

async function handlePregen() {
    const btn = document.getElementById('btn-pregen');
    if (!btn || _pregenInFlight) return;

    const rank = parseInt(btn.getAttribute('data-pregen-rank'));
    if (!rank) return;

    _pregenInFlight = true;
    _pregenRank = rank;
    btn.textContent = 'Generating…';
    btn.disabled = true;

    try {
        await trainerMgr.generateTrainerSentences(rank, false, () => {});
        btn.textContent = '✓ Ready!';
    } catch (e) {
        btn.textContent = 'Failed — retry?';
        btn.disabled = false;
        setTimeout(() => {
            if (btn.textContent === 'Failed — retry?') {
                btn.textContent = 'Pre-generate';
            }
        }, 4000);
    } finally {
        _pregenInFlight = false;
        _pregenRank = null;
    }
}

// ─── LOADING ─────────────────────────────────────────────────────────────────

let trainerLoadingOverlay = null;

function showTrainerLoading(step, text) {
    if (!trainerLoadingOverlay) {
        trainerLoadingOverlay = document.createElement('div');
        trainerLoadingOverlay.id = 'trainer-loading-overlay';
        trainerLoadingOverlay.innerHTML = `
            <div style="background: var(--overlay-bg); position: fixed; top:0; left:0; right:0; bottom:0; z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center;">
                <div style="width: 40px; height: 40px; border: 4px solid var(--border-color); border-top: 4px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
                <h3 id="trainer-loading-text" style="color: var(--text-main); margin-bottom: 15px;">${text}</h3>
                <div style="width: 80%; background: var(--border-color); border-radius: 10px; height: 10px; overflow: hidden;">
                    <div id="trainer-loading-fill" style="width: 0%; height: 100%; background: var(--primary-color); transition: width 0.3s ease;"></div>
                </div>
            </div>`;
        document.body.appendChild(trainerLoadingOverlay);
    } else {
        trainerLoadingOverlay.style.display = 'flex';
        const textEl = document.getElementById('trainer-loading-text');
        if (textEl) textEl.textContent = text;
    }
    const fill = document.getElementById('trainer-loading-fill');
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, (step / 5) * 100))}%`;
}

function hideTrainerLoading() {
    if (trainerLoadingOverlay) trainerLoadingOverlay.style.display = 'none';
}