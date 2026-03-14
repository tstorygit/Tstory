/**
 * popup_manager.js
 *
 * Single source of truth for the shared word-detail popup.
 *
 * Replaces duplicated popup logic previously spread across:
 *   viewer_ui.js    — openWordPopup / closeWordPopup / handleStatusClick / listeners
 *   trainer_ui.js   — openTrainerWordPopup / its status-group listener / jump-btn listener
 *   word_manager.js — openPopupForList / global document-click hack
 *
 * ── Public API ───────────────────────────────────────────────────────────────
 *
 *   initPopup()
 *     Wire close-button, overlay-backdrop, and the single status-group listener.
 *     Call ONCE from app.js inside DOMContentLoaded, before any openPopup() call.
 *
 *   openPopup(wordData, options?)
 *     Fill all standard popup fields and show the overlay.
 *
 *     options:
 *       onSave(wordData, newStatus) — void
 *         Called when the user clicks a status button.
 *         The caller is responsible for saving to srsDb AND re-rendering its view.
 *         If omitted, the default handler saves to srsDb and calls closePopup().
 *
 *       extraPanel: HTMLElement | null
 *         A fully-constructed DOM element to inject into the popup's extra slot
 *         (below the Close button).  The caller builds and owns the element —
 *         popup_manager only mounts it when the popup opens and detaches it on close,
 *         so the caller can reuse the same element across multiple opens.
 *         Pass null or omit to hide the slot entirely.
 *
 *   closePopup()
 *     Hide the overlay, detach any extra panel, reset internal state.
 *
 * ── index.html requirement ───────────────────────────────────────────────────
 *
 *   The existing #popup-trainer-zone is reused as the generic injection slot.
 *   popup_manager empties it and re-fills it with whatever extraPanel the caller
 *   passes in.  No new HTML needed — but if you ever want a truly neutral slot
 *   name, add:
 *     <div id="popup-extra-slot"></div>
 *   and update SLOT_ID below.
 *
 * ── Migration quick-reference ────────────────────────────────────────────────
 *
 *   app.js ─────────────────────────────────────────────────────────────────────
 *   + import { initPopup } from './popup_manager.js';
 *   + initPopup();   // inside DOMContentLoaded alongside other inits
 *
 *   viewer_ui.js ───────────────────────────────────────────────────────────────
 *   + import { openPopup, closePopup } from './popup_manager.js';
 *
 *   Replace openWordPopup(wordData):
 *     openPopup(wordData, {
 *       onSave: (wd, status) => {
 *         srsDb.saveWord({ word: wd.base, furi: wd.furi,
 *                          translation: wd.trans_base, status });
 *         closePopup();
 *         if (!isLibraryView) renderBlock(currentBlockIndex);
 *         sessionStorage.setItem('srs-dirty', '1');
 *       }
 *     });
 *
 *   Delete:
 *     closeWordPopup(), handleStatusClick(),
 *     popupStatusGroup.addEventListener(...),
 *     closePopupBtn.addEventListener(...),
 *     statusButtons querySelectorAll
 *
 *   trainer_ui.js ──────────────────────────────────────────────────────────────
 *   + import { openPopup, closePopup } from './popup_manager.js';
 *
 *   Replace openTrainerWordPopup(wordData):
 *     openPopup(wordData, {
 *       extraPanel: _buildTrainerPanel(wordData),   // see helper below
 *       onSave: (wd, status) => {
 *         srsDb.saveWord({ word: wd.base || wd.surface, furi: wd.furi || '',
 *                          translation: wd.trans_base || wd.trans_context || '',
 *                          status });
 *         closePopup();
 *         renderTrainer();
 *       }
 *     });
 *
 *   Add helper (replaces the inline DOM-writing in openTrainerWordPopup):
 *     function _buildTrainerPanel(wordData) {
 *       let rank = wordData.rank;
 *       if (rank === undefined) {
 *         const m = wordList.find(w => w.word === (wordData.base || wordData.surface));
 *         if (m) rank = m.rank;
 *       }
 *       if (rank === undefined) return null;
 *
 *       // Re-use the existing DOM element — just update its contents
 *       const zone   = document.getElementById('popup-trainer-zone');
 *       document.getElementById('popup-rank').textContent = rank;
 *
 *       // Clone the button to avoid stacking listeners across multiple opens
 *       const oldBtn = document.getElementById('btn-trainer-jump');
 *       const newBtn = oldBtn.cloneNode(true);
 *       oldBtn.replaceWith(newBtn);
 *       newBtn.addEventListener('click', () => {
 *         if (confirm(`Jump your progress to word #${rank}?`)) {
 *           trainerMgr.setProgress(rank);
 *           closePopup();
 *           document.querySelector('button[data-target="view-trainer"]')?.click();
 *           renderTrainer();
 *         }
 *       });
 *       zone.classList.remove('hidden');
 *       return zone;    // <-- this element is passed as extraPanel
 *     }
 *
 *   Delete from initTrainer():
 *     jumpBtn listener block, popupStatusGroup listener block
 *
 *   word_manager.js ────────────────────────────────────────────────────────────
 *   + import { openPopup, closePopup } from './popup_manager.js';
 *
 *   Replace openPopupForList(wordData):
 *     openPopup(wordData, {
 *       onSave: (wd, status) => {
 *         srsDb.updateWordStatus(wd.word || wd.base, status);
 *         closePopup();
 *         renderVocabList();
 *       }
 *     });
 *
 *   Delete:
 *     openPopupForList(), the global document.addEventListener('click',...) hack
 */

import * as srsDb   from './srs_db.js';
import { settings } from './settings.js';

// ─── CONFIG ──────────────────────────────────────────────────────────────────

/**
 * ID of the popup element used as the extra-panel injection slot.
 * popup_manager empties this element on each open and appends whatever
 * extraPanel the caller provides (or keeps it hidden when extraPanel is null).
 *
 * Points at the existing trainer zone — no new HTML required.
 * Change to 'popup-extra-slot' if you add a dedicated neutral element instead.
 */
const SLOT_ID = 'popup-extra-slot';

// ─── STATE ───────────────────────────────────────────────────────────────────

const _state = {
    /** @type {object|null}        Current token object */
    wordData:   null,
    /** @type {Function|null}      Caller-supplied save handler */
    onSave:     null,
    /** @type {HTMLElement|null}   Mounted extra panel (owned by caller) */
    extraPanel: null,
};

// ─── LAZY DOM ACCESSORS ──────────────────────────────────────────────────────

const $id      = (id) => document.getElementById(id);
const overlay  = ()   => $id('word-popup-overlay');
const slotEl   = ()   => $id(SLOT_ID);

// ─── PUBLIC ──────────────────────────────────────────────────────────────────

/**
 * Wire all static popup event listeners.
 * Must be called once from app.js inside DOMContentLoaded.
 */
export function initPopup() {
    $id('close-popup-btn')?.addEventListener('click', closePopup);

    overlay()?.addEventListener('click', (e) => {
        if (e.target === overlay()) closePopup();
    });

    // Single delegated status listener — replaces the three separate ones
    $id('popup-status-group')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.status-btn');
        if (btn) _handleStatus(parseInt(btn.getAttribute('data-status'), 10));
    });

    // Edit furigana reading
    $id('popup-edit-furi-btn')?.addEventListener('click', () => {
        const wd = _state.wordData;
        if (!wd) return;
        const newFuri = prompt(`Edit reading for ${wd.surface}:`, wd.furi || "");
        if (newFuri !== null) {
            wd.furi = newFuri.trim();
            _setField('popup-furi', wd.furi, settings.showFurigana);
            
            const base = wd.base || wd.surface;
            let srsEntry = srsDb.getWord(base);
            if (!srsEntry) {
                // If it isn't tracked yet, save it as status 0 so we don't lose the reading
                srsDb.saveWord({
                    word: base,
                    furi: wd.furi,
                    translation: wd.trans_base || wd.trans_context || wd.translation || '',
                    status: 0
                });
            } else {
                srsDb.updateWordFuri(base, wd.furi);
            }
            
            // Notify UI components to re-render using the new reading
            document.dispatchEvent(new CustomEvent('srs:furi-changed'));
        }
    });
}

/**
 * Open the popup for a word token.
 *
 * @param {object}           wordData       Token with surface, base, furi, roma,
 *                                          trans_base, trans_context, note (all optional
 *                                          except surface).
 * @param {object}           [options]
 * @param {Function}         [options.onSave]      (wordData, newStatus) => void
 * @param {HTMLElement|null} [options.extraPanel]  DOM element to inject into the slot
 */
export function openPopup(wordData, options = {}) {
    if (!wordData) return;

    _state.wordData   = wordData;
    _state.onSave     = options.onSave     ?? null;
    _state.extraPanel = options.extraPanel ?? null;

    // ── Standard text fields ──────────────────────────────────────────────────

    $id('popup-term').textContent = wordData.surface ?? '';

    _setField('popup-furi', wordData.furi,  settings.showFurigana);
    _setField('popup-roma', wordData.roma,  settings.showRomaji);

    const base = wordData.base || wordData.surface || '';
    $id('popup-base').textContent          = base;
    $id('popup-trans-base').textContent    = wordData.trans_base    ?? wordData.translation ?? '';
    $id('popup-trans-context').textContent = wordData.trans_context ?? '';

    const noteEl = $id('popup-note');
    if (noteEl) {
        if (wordData.note) { noteEl.textContent = wordData.note; noteEl.style.display = 'block'; }
        else               { noteEl.style.display = 'none'; }
    }

    // ── SRS status button highlight ───────────────────────────────────────────

    const srsEntry  = srsDb.getWord(base);
    const curStatus = srsEntry ? srsEntry.status : 0;
    document.querySelectorAll('#popup-status-group .status-btn').forEach(btn => {
        const s = parseInt(btn.getAttribute('data-status'), 10);
        btn.style.border = (s === curStatus) ? '3px solid var(--text-main)' : 'none';
    });

    // ── Extra panel slot ──────────────────────────────────────────────────────
    // The slot (#popup-extra-slot) is always in the DOM. We simply show it when
    // the caller provides an extraPanel, and hide it otherwise.
    // The caller owns the extraPanel element and manages its own internal
    // visibility (e.g. #popup-trainer-zone is a permanent child of the slot).

    const slot = slotEl();
    if (slot) {
        if (_state.extraPanel) {
            // Ensure the panel is inside the slot (it always is after the HTML change,
            // but guard in case a future caller passes a detached element)
            if (!slot.contains(_state.extraPanel)) {
                slot.appendChild(_state.extraPanel);
            }
            slot.classList.remove('hidden');
        } else {
            slot.classList.add('hidden');
        }
    }

    // ── Legacy dataset (safety shim for any code that still reads these) ──────
    const popupEl = $id('word-popup');
    if (popupEl) {
        popupEl.dataset.activeWord = base;
        popupEl.dataset.wordData   = JSON.stringify(wordData);
    }

    overlay()?.classList.remove('hidden');
}

/**
 * Close the popup, detach extra panel from slot, reset state.
 */
export function closePopup() {
    overlay()?.classList.add('hidden');

    // Just hide the slot — never strip its children, which are permanent DOM nodes
    // owned by their respective callers (e.g. #popup-trainer-zone with its buttons)
    slotEl()?.classList.add('hidden');

    const popupEl = $id('word-popup');
    if (popupEl) {
        delete popupEl.dataset.activeWord;
        delete popupEl.dataset.wordData;
    }

    _state.wordData   = null;
    _state.onSave     = null;
    _state.extraPanel = null;
}

// ─── INTERNAL ────────────────────────────────────────────────────────────────

/** Show/hide a furi or roma field based on a settings flag. */
function _setField(id, value, settingEnabled) {
    const el = $id(id);
    if (!el) return;
    
    if (id === 'popup-furi') {
        // Tie both the furigana text and the gear icon to the setting
        el.textContent = value || '';
        el.style.display = settingEnabled ? 'inline' : 'none';
        const editBtn = $id('popup-edit-furi-btn');
        if (editBtn) editBtn.style.display = settingEnabled ? 'inline-block' : 'none';
    } else {
        const show       = !!(settingEnabled && value);
        el.textContent   = show ? value : '';
        el.style.display = show ? 'inline' : 'none';
    }
}

/** Called by the delegated status-group listener. */
function _handleStatus(newStatus) {
    const wd = _state.wordData;
    if (!wd) return;

    if (_state.onSave) {
        _state.onSave(wd, newStatus);
    } else {
        // Default: persist to srsDb, then close
        srsDb.saveWord({
            word:        wd.base || wd.surface,
            furi:        wd.furi        ?? '',
            translation: wd.trans_base  ?? wd.trans_context ?? wd.translation ?? '',
            status:      newStatus,
        });
        closePopup();
    }
}