// js/games/chao/chao_nikki_ui.js

import { openPopup, closePopup } from '../../popup_manager.js';
import * as srsDb from '../../srs_db.js';
import { generateNikkiEntry } from './chao_nikki_mgr.js';
import { speakText, stopSpeech } from '../../tts_api.js';

const EYE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const SPEAKER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;

let _sentenceBtnCounter = 0;
let activeSpeakBtn = null;

export function renderNikkiTab(container, stateManager) {
    const chi = stateManager.getActiveChi();
    
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h3 style="margin:0;">📔 ${chi.name}'s Nikki</h3>
            <button id="btn-force-nikki" class="chao-action-btn" style="margin:0; padding: 6px 12px; font-size:12px;">✏️ Force Write Entry</button>
        </div>
        <div id="nikki-status" style="color: #f1fa8c; font-size: 13px; font-weight: bold; height: 20px; margin-bottom: 10px;"></div>
        
        <div class="nikki-layout">
            <div id="nikki-list" class="nikki-sidebar"></div>
            <div id="nikki-reader" class="nikki-content">
                <div class="placeholder-text" style="text-align:center; color:#888; margin-top:40px;">Select an entry to read.</div>
            </div>
        </div>
    `;

    const listEl = container.querySelector('#nikki-list');
    const readerEl = container.querySelector('#nikki-reader');
    const statusEl = container.querySelector('#nikki-status');

    // ─── EVENT DELEGATION FOR THE READER PANE ───
    readerEl.addEventListener('click', (e) => {
        
        // 1. Word Popup
        const wordEl = e.target.closest('.clickable-word');
        if (wordEl) {
            e.stopPropagation();
            try {
                const wordData = JSON.parse(decodeURIComponent(wordEl.getAttribute('data-word')));
                openPopup(wordData, {
                    onSave: (wd, newStatus) => {
                        srsDb.saveWord({ word: wd.base, furi: wd.furi, translation: wd.trans_base, status: newStatus });
                        sessionStorage.setItem('srs-dirty', '1');
                        closePopup(); // <-- BUG FIX: Explicitly close the popup
                        
                        // Re-render current entry
                        const activeBtn = listEl.querySelector('.nikki-entry-btn.active');
                        if (activeBtn) {
                            const entry = chi.diaryEntries.find(x => x.id === activeBtn.getAttribute('data-id'));
                            renderEntry(entry, readerEl, chi, stateManager);
                        }
                    }
                });
            } catch(err) { console.error("Popup data parse error", err); }
            return;
        }

        // 2. Sentence Translation Toggle
        const transBtn = e.target.closest('.btn-sentence-trans');
        if (transBtn) {
            const uid = transBtn.getAttribute('data-target');
            const transBox = document.getElementById(uid);
            if (transBox) transBox.style.display = transBox.style.display === 'none' ? 'block' : 'none';
            return;
        }

        // 3. Sentence TTS
        const speakBtn = e.target.closest('.btn-sentence-speak');
        if (speakBtn) {
            e.stopPropagation();
            const jaText = decodeURIComponent(speakBtn.getAttribute('data-ja') || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

            if (activeSpeakBtn === speakBtn) {
                stopSpeech();
                speakBtn.style.opacity = '0.7';
                speakBtn.style.color = '';
                activeSpeakBtn = null;
                return;
            }

            if (activeSpeakBtn) {
                activeSpeakBtn.style.opacity = '0.7';
                activeSpeakBtn.style.color = '';
            }

            activeSpeakBtn = speakBtn;
            speakBtn.style.opacity = '1';
            speakBtn.style.color = '#50fa7b';

            speakText(jaText, () => {}, () => {
                speakBtn.style.opacity = '0.7';
                speakBtn.style.color = '';
                if (activeSpeakBtn === speakBtn) activeSpeakBtn = null;
            });
            return;
        }

        // 4. Read All Full Text
        const readAllBtn = e.target.closest('#btn-nikki-read-all');
        if (readAllBtn) {
            const label = readAllBtn.querySelector('span');
            if (label.textContent === 'Stop') {
                stopSpeech();
                label.textContent = 'Read All';
                readAllBtn.style.color = '';
            } else {
                label.textContent = 'Stop';
                readAllBtn.style.color = '#50fa7b';
                const textToRead = decodeURIComponent(readAllBtn.getAttribute('data-fulltext'));
                speakText(textToRead, () => {}, () => {
                    label.textContent = 'Read All';
                    readAllBtn.style.color = '';
                });
            }
            return;
        }

        // 5. Advice Interaction Buttons
        const adviceBtn = e.target.closest('.nikki-advice-btn');
        if (adviceBtn) {
            const action = adviceBtn.getAttribute('data-action');
            const activeBtn = listEl.querySelector('.nikki-entry-btn.active');
            if (activeBtn) {
                const entry = chi.diaryEntries.find(x => x.id === activeBtn.getAttribute('data-id'));
                if (!entry.adviceGiven) {
                    applyAdvice(chi, action);
                    entry.adviceGiven = action;
                    stateManager.save();
                    renderEntry(entry, readerEl, chi, stateManager);
                }
            }
        }
    });

    function updateList() {
        if (!chi.diaryEntries || chi.diaryEntries.length === 0) {
            listEl.innerHTML = `<p style="color:#888; font-size:13px; text-align:center;">No entries yet.</p>`;
            return;
        }
        
        const entries = [...chi.diaryEntries].sort((a,b) => b.date - a.date);
        
        listEl.innerHTML = entries.map(entry => {
            const dateObj = new Date(entry.date);
            const dateStr = `${dateObj.getMonth()+1}/${dateObj.getDate()} - ${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
            const checkmark = entry.adviceGiven ? ' ✓' : '';
            return `
                <div class="nikki-entry-btn" data-id="${entry.id}">
                    ${dateStr}${checkmark}
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('.nikki-entry-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                listEl.querySelectorAll('.nikki-entry-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                const id = e.currentTarget.getAttribute('data-id');
                const entry = chi.diaryEntries.find(x => x.id === id);
                renderEntry(entry, readerEl, chi, stateManager);
            });
        });
    }

    container.querySelector('#btn-force-nikki').addEventListener('click', async () => {
        try {
            const btn = container.querySelector('#btn-force-nikki');
            btn.disabled = true;
            btn.textContent = "Writing...";
            
            await generateNikkiEntry(chi, [], (msg) => { statusEl.textContent = msg; });
            
            stateManager.save();
            statusEl.textContent = "Done!";
            setTimeout(() => statusEl.textContent = "", 2500);
            
            updateList();
            
            const firstBtn = listEl.querySelector('.nikki-entry-btn');
            if (firstBtn) firstBtn.click();
            
        } catch(e) {
            statusEl.textContent = "Error: " + e.message;
        } finally {
            const btn = container.querySelector('#btn-force-nikki');
            btn.disabled = false;
            btn.textContent = "✏️ Force Write Entry";
        }
    });

    updateList();
}

function renderEntry(entry, readerEl, chi, stateManager) {
    if (!entry) return;
    
    stopSpeech();
    activeSpeakBtn = null;
    _sentenceBtnCounter = 0;

    const words = entry.enrichedData?.words || [];
    const sentences = entry.enrichedData?.sentences || [];
    const isKanaLevel = chi.stats.wisdom <= 500;
    
    // Calculate sentence boundaries
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

    let html = '';
    let sentIdx = 0;

    for (let i = 0; i < words.length; i++) {
        html += renderWordHtml(words[i]);
        
        // Wakachigaki spacing
        if (isKanaLevel && i < words.length - 1) {
            if (!/^[。、！？\.\!\?]$/.test(words[i+1].surface)) {
                html += '&nbsp;&nbsp;'; 
            }
        }

        // Sentence End Check
        while (sentIdx < sentences.length) {
            const endPos = sentenceEndPos[sentIdx];
            if (endPos === -1 || cumulative[i] >= endPos) {
                const transText = sentences[sentIdx].en.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                const jaText = sentences[sentIdx].ja;
                html += sentenceActionButtons(transText, jaText);
                html += `<br><br>`;
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

    const safeFullText = encodeURIComponent(entry.rawJa);

    // Advice UI
    let adviceHtml = '';
    if (entry.adviceGiven) {
        adviceHtml = `
            <div style="margin-top: 20px; padding: 15px; background: rgba(80, 250, 123, 0.1); border: 1px solid #50fa7b; border-radius: 8px; text-align: center; font-size: 14px; color: #50fa7b;">
                You gave advice: <b>${entry.adviceGiven.toUpperCase()}</b>
            </div>`;
    } else {
        adviceHtml = `
            <div style="margin-top: 20px; padding: 15px; background: #282a36; border: 1px solid #444; border-radius: 8px;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #f1fa8c; text-align: center;">Give advice to ${chi.name}:</p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button class="chao-action-btn nikki-advice-btn" data-action="praise" style="margin:0; flex:1; background:#50fa7b; color:#282a36;">Praise</button>
                    <button class="chao-action-btn nikki-advice-btn" data-action="comfort" style="margin:0; flex:1; background:#8be9fd; color:#282a36;">Comfort</button>
                    <button class="chao-action-btn nikki-advice-btn" data-action="scold" style="margin:0; flex:1; background:#ff5555;">Scold</button>
                </div>
            </div>`;
    }

    readerEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 15px;">
            <div style="font-size: 14px; color: #888; font-weight: bold;">
                ${new Date(entry.date).toLocaleString()}
            </div>
            <button id="btn-nikki-read-all" data-fulltext="${safeFullText}" style="background:none; border:none; cursor:pointer; color:#bbb; display:flex; align-items:center; gap:5px; font-size: 13px;">
                ${SPEAKER_ICON} <span>Read All</span>
            </button>
        </div>
        <div class="japanese-text" style="color: #eee; line-height: 2.2;">${html}</div>
        ${adviceHtml}
    `;
}

function sentenceActionButtons(transText, jaText) {
    const safeJa = jaText.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
    const speakBtn = `<button class="btn-sentence-speak" data-ja="${safeJa}" title="Read aloud" style="margin-left:3px; background:none; border:none; cursor:pointer; color:#888; padding:2px; line-height:1; display:inline-flex; align-items:center; opacity:0.7; transition:opacity 0.15s;">${SPEAKER_ICON}</button>`;
    if (!transText) return speakBtn;
    
    const uid = `strans-${_sentenceBtnCounter++}`;
    const eyeBtn = `<button class="btn-sentence-trans" data-target="${uid}" title="Show translation" style="margin-left:5px; background:none; border:none; cursor:pointer; color:#888; padding:2px; line-height:1; display:inline-flex; align-items:center;">${EYE_ICON}</button>`;
    const transDiv = `<div id="${uid}" style="display:none; font-size:14px; color:#aaa; background:#151520; padding:8px; border-radius:4px; margin-top:5px; margin-bottom:10px; border-left: 3px solid #6272a4;">${transText}</div>`;
    
    return eyeBtn + speakBtn + transDiv;
}

function applyAdvice(chi, action) {
    const clamp = (val) => Math.max(0, Math.min(100, val));
    
    if (action === 'praise') {
        chi.dna.cheerfulness = clamp(chi.dna.cheerfulness + 5);
        chi.connection += 2;
    } else if (action === 'comfort') {
        chi.dna.kindness = clamp(chi.dna.kindness + 5);
        chi.dna.calmness = clamp(chi.dna.calmness + 5);
        chi.connection += 3;
    } else if (action === 'scold') {
        chi.dna.effort = clamp(chi.dna.effort + 10);
        chi.dna.bravery = clamp(chi.dna.bravery + 5);
        chi.connection = Math.max(0, chi.connection - 1);
    }
}

function renderWordHtml(wordObj) {
    const base = wordObj.base || wordObj.surface;
    const srsEntry = srsDb.getWord(base);
    const status = srsEntry ? srsEntry.status : 0;
    
    const statusClass = `status-${status}-text`;
    
    let displayFuri = wordObj.furi;
    if (srsEntry && srsEntry.furi !== undefined) {
        displayFuri = srsEntry.furi;
    }

    const tokenForPopup = { ...wordObj, furi: displayFuri };
    const wordDataStr = encodeURIComponent(JSON.stringify(tokenForPopup));
    
    const styleExtras = 'border-bottom:1px dashed var(--border-color); cursor:pointer;';

    if (displayFuri) {
        return `<ruby><span class="clickable-word ${statusClass}" data-word="${wordDataStr}" style="${styleExtras}">${wordObj.surface}</span><rt style="font-size:11px; color:#aaa; text-align:center;">${displayFuri}</rt></ruby>`;
    } else {
        return `<span class="clickable-word ${statusClass}" data-word="${wordDataStr}" style="${styleExtras}">${wordObj.surface}</span>`;
    }
}