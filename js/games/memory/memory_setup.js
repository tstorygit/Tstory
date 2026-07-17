// memory_setup.js — deck picker + game options for Memory Match.
import { mountVocabSelector } from '../../vocab_selector.js';
import { getState, updateState } from './memory_state.js';
import { computePoolSource, mountVocabSettingsPanel } from './memory_vocab.js';

let _container = null;
let _vocabSelector = null;
let _onStart = null;
let _onOpenShop = null;
let _onExit = null;
let _valSeq = 0; // guards against out-of-order async validations

const BANNED_KEY = 'memory_banned_words';

export function initSetup(container, onStartCallback, onOpenShopCallback, onExitCallback) {
    _container = container;
    _onStart = onStartCallback;
    _onOpenShop = onOpenShopCallback;
    _onExit = onExitCallback || null;
    _render();
}

function _statsLine() {
    const s = getState().stats || {};
    if (!s.rounds) return '';
    return `🎮 ${s.rounds} round${s.rounds !== 1 ? 's' : ''} · 🔥 Best combo ${s.bestCombo}x · 🏆 ${s.perfectRounds} perfect`;
}

/** Refreshes the coin pill + stats line (after shop close / returning from a round). */
export function refreshSetupCoins() {
    if (!_container) return;
    const pill = _container.querySelector('#mem-setup-coins');
    if (pill) pill.textContent = `🪙 ${getState().coins.toLocaleString()}`;
    const stats = _container.querySelector('#mem-setup-stats');
    if (stats) stats.textContent = _statsLine();
}

function _render() {
    _vocabSelector = mountVocabSelector(_container, {
        bannedKey: BANNED_KEY,
        showCountPicker: false,
        title: 'Memory — Vocabulary'
    });

    const actionsEl = _vocabSelector.getActionsEl();
    const saved = getState().lastSetup || {};
    const savedMode = saved.mode || 'meaning';
    const savedLayout = saved.layout || 12;

    const modeOpts = [
        { value: 'meaning',         label: 'Kanji ↔ Meaning' },
        { value: 'reading',         label: 'Kanji ↔ Reading' },
        { value: 'reading_meaning', label: 'Kanji+Furi ↔ Meaning' }
    ];
    const layoutOpts = [
        { value: 6,  label: '6 · 2×3'  },
        { value: 12, label: '12 · 3×4' },
        { value: 16, label: '16 · 4×4' },
        { value: 20, label: '20 · 4×5' },
        { value: 24, label: '24 · 4×6' }
    ];

    const configHtml = document.createElement('div');
    configHtml.innerHTML = `
        <div class="mem-setup-box">
            <div class="mem-setup-toprow">
                <strong>Game Mode</strong>
                <span class="mem-coin-pill" id="mem-setup-coins">🪙 ${getState().coins.toLocaleString()}</span>
            </div>
            <div class="mem-radio-group" id="mem-mode-group">
                ${modeOpts.map(o => `
                    <label><input type="radio" name="mem_mode" value="${o.value}" ${o.value === savedMode ? 'checked' : ''}> ${o.label}</label>
                `).join('')}
            </div>

            <label style="margin-top: 15px; display:block;"><strong>Board Size (cards)</strong></label>
            <div class="mem-radio-group" id="mem-layout-group">
                ${layoutOpts.map(o => `
                    <label><input type="radio" name="mem_layout" value="${o.value}" ${o.value === savedLayout ? 'checked' : ''}> ${o.label}</label>
                `).join('')}
            </div>

            <div id="mem-validation-msg" class="mem-validation-msg">Checking vocabulary...</div>
            <div class="mem-setup-stats" id="mem-setup-stats">${_statsLine()}</div>
        </div>

        <div class="mem-setup-actions">
            <button class="primary-btn mem-touch-btn" id="mem-btn-start" disabled>▶ Start Game</button>
            <button class="primary-btn mem-touch-btn mem-btn-secondary" id="mem-btn-shop">🛒 Shop</button>
            <button class="primary-btn mem-touch-btn mem-btn-secondary" id="mem-btn-vocab-cfg" title="Vocabulary settings">⚙️</button>
        </div>
        <button class="caro-back-btn mem-touch-btn" id="mem-btn-back">← Back to Games</button>
    `;

    actionsEl.appendChild(configHtml);

    // Listeners
    _container.addEventListener('change', _onAnyChange);
    _container.querySelector('#mem-btn-start').addEventListener('click', _handleStartClick);
    _container.querySelector('#mem-btn-shop').addEventListener('click', () => _onOpenShop());
    _container.querySelector('#mem-btn-vocab-cfg').addEventListener('click', _openVocabSettings);
    _container.querySelector('#mem-btn-back').addEventListener('click', () => { if (_onExit) _onExit(); });

    validate(); // initial check
}

function _onAnyChange(e) {
    // Persist the game-option choices so they survive reloads.
    const t = e && e.target;
    if (t && (t.name === 'mem_mode' || t.name === 'mem_layout')) {
        updateState({ lastSetup: _getConfig() });
    }
    validate();
}

function _getConfig() {
    const modeEl = _container.querySelector('input[name="mem_mode"]:checked');
    const layoutEl = _container.querySelector('input[name="mem_layout"]:checked');
    return {
        mode: modeEl ? modeEl.value : 'meaning',
        layout: layoutEl ? parseInt(layoutEl.value) : 12
    };
}

/**
 * Filters the selector queue down to words usable on a board for this mode,
 * removing entries that would create broken or ambiguous pairs:
 *  - duplicate front faces (same word from two decks / SRS + deck)
 *  - duplicate target texts (two words sharing one translation or reading
 *    would make pairs visually indistinguishable → false "no match")
 */
function _dedupeForMode(queue, mode) {
    const seenFront = new Set();
    const seenTarget = new Set();
    const out = [];
    for (const w of queue) {
        if (!w || !w.word) continue;
        let target;
        if (mode === 'reading') {
            if (!w.furi || w.furi === w.word) continue; // no distinct reading
            target = w.furi;
        } else {
            if (!w.trans || !w.trans.trim()) continue;  // no translation
            target = w.trans;
        }
        const targetKey = target.trim().toLowerCase();
        if (seenFront.has(w.word) || seenTarget.has(targetKey)) continue;
        seenFront.add(w.word);
        seenTarget.add(targetKey);
        out.push(w);
    }
    return out;
}

async function _getValidWords(mode) {
    const queue = await _vocabSelector.getQueue();
    return _dedupeForMode(queue || [], mode);
}

async function _handleStartClick() {
    const config = _getConfig();
    const validWords = await _getValidWords(config.mode);
    const requiredPairs = config.layout / 2;
    if (validWords.length < requiredPairs) {
        // Re-check at click time — async validation may be stale.
        validate();
        return;
    }
    _onStart(validWords, config);
}

async function _openVocabSettings() {
    const queue = await _vocabSelector.getQueue();
    const poolSource = computePoolSource(queue || []);

    const overlay = document.createElement('div');
    overlay.className = 'mem-vocab-overlay';
    overlay.innerHTML = `
        <div class="mem-vocab-box">
            <div class="mem-vocab-head">
                <strong>Vocabulary Settings</strong>
                <button class="mem-vocab-close" id="mem-vocab-close">✕</button>
            </div>
            <div class="mem-vocab-body" id="mem-vocab-panel"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#mem-vocab-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    mountVocabSettingsPanel(overlay.querySelector('#mem-vocab-panel'), poolSource, () => {
        close();
    });
}

async function validate() {
    const seq = ++_valSeq;
    const config = _getConfig();
    const validWords = await _getValidWords(config.mode);
    if (seq !== _valSeq) return; // a newer validation superseded this one

    const requiredPairs = config.layout / 2;
    const msgEl = _container.querySelector('#mem-validation-msg');
    const startBtn = _container.querySelector('#mem-btn-start');
    if (!msgEl || !startBtn) return;

    if (validWords.length >= requiredPairs) {
        msgEl.textContent = `✓ Ready! ${validWords.length} usable words (${requiredPairs} pairs per round).`;
        msgEl.className = 'mem-validation-msg success';
        startBtn.disabled = false;
    } else {
        msgEl.textContent = `❌ Not enough words! Need ${requiredPairs} unique pairs, found ${validWords.length}. Adjust vocab, mode, or board size.`;
        msgEl.className = 'mem-validation-msg error';
        startBtn.disabled = true;
    }
}
