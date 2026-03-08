// memory_setup.js
import { mountVocabSelector } from '../../vocab_selector.js';

let _container = null;
let _vocabSelector = null;
let _onStart = null;
let _onOpenShop = null;

const BANNED_KEY = 'memory_banned_words';

export function initSetup(container, onStartCallback, onOpenShopCallback) {
    _container = container;
    _onStart = onStartCallback;
    _onOpenShop = onOpenShopCallback;
    _render();
}

function _render() {
    _vocabSelector = mountVocabSelector(_container, {
        bannedKey: BANNED_KEY,
        showCountPicker: false, // We control count via Layout
        title: 'Memory — Vocabulary'
    });

    const actionsEl = _vocabSelector.getActionsEl();

    const configHtml = document.createElement('div');
    configHtml.innerHTML = `
        <div class="mem-setup-box">
            <label><strong>Game Mode</strong></label>
            <div class="mem-radio-group" id="mem-mode-group">
                <label><input type="radio" name="mem_mode" value="meaning" checked> Kanji ↔ Meaning</label>
                <label><input type="radio" name="mem_mode" value="reading"> Kanji ↔ Reading</label>
            </div>
            
            <label style="margin-top: 15px;"><strong>Layout (Pairs)</strong></label>
            <div class="mem-radio-group" id="mem-layout-group">
                <label><input type="radio" name="mem_layout" value="6"> 6 (3x2)</label>
                <label><input type="radio" name="mem_layout" value="12" checked> 12 (3x4)</label>
                <label><input type="radio" name="mem_layout" value="16"> 16 (4x4)</label>
                <label><input type="radio" name="mem_layout" value="20"> 20 (4x5)</label>
            </div>

            <div id="mem-validation-msg" class="mem-validation-msg">Checking vocabulary...</div>
        </div>
        
        <div style="display:flex; gap:10px; margin-top: 15px;">
            <button class="primary-btn" id="mem-btn-start" style="flex:2;">▶ Start Game</button>
            <button class="primary-btn" id="mem-btn-shop" style="flex:1; background:var(--status-2); color:#333;">🛒 Shop</button>
        </div>
    `;

    actionsEl.appendChild(configHtml);

    // Listeners
    _container.addEventListener('change', validate);
    _container.querySelector('#mem-btn-start').addEventListener('click', () => {
        const config = _getConfig();
        const validWords = _getValidWords(config.mode);
        _onStart(validWords, config);
    });
    _container.querySelector('#mem-btn-shop').addEventListener('click', _onOpenShop);

    validate(); // Initial check
}

function _getConfig() {
    return {
        mode: _container.querySelector('input[name="mem_mode"]:checked').value,
        layout: parseInt(_container.querySelector('input[name="mem_layout"]:checked').value)
    };
}

function _getValidWords(mode) {
    const queue = _vocabSelector.getQueue();
    if (mode === 'reading') {
        // Exclude words where reading is identical to kanji or missing
        return queue.filter(w => w.furi && w.furi !== w.word);
    }
    return queue.filter(w => w.trans && w.trans.trim() !== '');
}

function validate() {
    const config = _getConfig();
    const validWords = _getValidWords(config.mode);
    const requiredPairs = config.layout / 2;
    
    const msgEl = _container.querySelector('#mem-validation-msg');
    const startBtn = _container.querySelector('#mem-btn-start');

    if (validWords.length >= requiredPairs) {
        msgEl.textContent = `✓ Ready! Found ${validWords.length} valid words.`;
        msgEl.className = 'mem-validation-msg success';
        startBtn.disabled = false;
    } else {
        msgEl.textContent = `❌ Not enough words! Need ${requiredPairs}, found ${validWords.length}. Adjust vocab or mode.`;
        msgEl.className = 'mem-validation-msg error';
        startBtn.disabled = true;
    }
}