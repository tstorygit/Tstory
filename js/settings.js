export const settings = {
    textApiKeys: [],       // array of API keys; replaces single textApiKey
    textApiKey: '',        // legacy fallback — kept for compatibility
    textModel: 'gemini-2.5-pro',
    imageModel: 'gemini-2.0-flash-preview-image-generation',
    generateImages: false,
    useFallback: true,
    showFurigana: true,
    showRomaji: false,
    srsMode: 'mix',
    debugMode: false,
    textHighlightStyle: 'background',
    sentenceNewline: true,
    enableSentenceParsing: true,
    requestTimeoutSecs: 120,
    trainerExtMode: 'highlight',
    trainerSrsMode: 'use'
};

export const TEXT_MODEL_ORDER = [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-flash-latest"
];

export const IMAGE_MODEL_ORDER = [
    "gemini-2.0-flash-preview-image-generation"
];

// ─── API KEY LIST UI ─────────────────────────────────────────────────────────

function renderApiKeyInputs(keys) {
    const container = document.getElementById('api-keys-container');
    if (!container) return;
    container.innerHTML = '';
    const list = keys.length > 0 ? keys : [''];
    list.forEach(key => addApiKeyRow(key));
    updateKeyLabels();
}

function addApiKeyRow(value = '') {
    const container = document.getElementById('api-keys-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'api-key-row';

    const badge = document.createElement('span');
    badge.className = 'api-key-badge';
    badge.textContent = '#1';

    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'api-key-input';
    input.placeholder = 'AIzaSy...';
    input.value = value;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'api-key-remove';
    removeBtn.title = 'Remove key';
    removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    removeBtn.addEventListener('click', () => {
        // Keep at least one row
        if (container.querySelectorAll('.api-key-row').length > 1) {
            row.remove();
            updateKeyLabels();
        } else {
            input.value = '';
        }
    });

    row.appendChild(badge);
    row.appendChild(input);
    row.appendChild(removeBtn);
    container.appendChild(row);
}

function updateKeyLabels() {
    const container = document.getElementById('api-keys-container');
    if (!container) return;
    container.querySelectorAll('.api-key-badge').forEach((badge, i) => {
        badge.textContent = `#${i + 1}`;
    });
}

export function initSettings() {
    loadSettings();

    // Wire the "Add Key" button
    const addKeyBtn = document.getElementById('btn-add-api-key');
    if (addKeyBtn) {
        addKeyBtn.addEventListener('click', () => {
            addApiKeyRow('');
            updateKeyLabels();
        });
    }

    const saveBtn = document.getElementById('btn-save-settings');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            // Collect all key inputs
            const keyInputs = document.querySelectorAll('.api-key-input');
            settings.textApiKeys = [...keyInputs]
                .map(i => i.value.trim())
                .filter(Boolean);
            // Keep legacy field in sync with first key
            settings.textApiKey = settings.textApiKeys[0] || '';

            settings.textModel = document.getElementById('setting-text-model').value;
            settings.imageModel = document.getElementById('setting-image-model').value;
            settings.generateImages = document.getElementById('setting-generate-images').checked;
            settings.useFallback = document.getElementById('setting-use-fallback').checked;
            settings.showFurigana = document.getElementById('setting-show-furigana').checked;
            settings.showRomaji = document.getElementById('setting-show-romaji').checked;
            settings.debugMode = document.getElementById('setting-debug-mode').checked;
            settings.srsMode = document.getElementById('setting-srs-mode').value;
            settings.textHighlightStyle = document.getElementById('setting-highlight-style').value;
            settings.sentenceNewline = document.getElementById('setting-sentence-newline').checked;
            settings.enableSentenceParsing = document.getElementById('setting-sentence-parsing').checked;
            settings.requestTimeoutSecs = parseInt(document.getElementById('setting-timeout').value) || 120;

            const extMode = document.getElementById('trainer-ext-mode');
            if (extMode) settings.trainerExtMode = extMode.value;
            const srsModeEl = document.getElementById('trainer-srs-mode');
            if (srsModeEl) settings.trainerSrsMode = srsModeEl.value;

            localStorage.setItem('ai_reader_settings', JSON.stringify(settings));
            alert('Settings Saved!');
        });
    }
}

function loadSettings() {
    const saved = localStorage.getItem('ai_reader_settings');
    if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(settings, parsed);

        // Migrate legacy single-key to array
        if ((!settings.textApiKeys || settings.textApiKeys.length === 0) && settings.textApiKey) {
            settings.textApiKeys = [settings.textApiKey];
        }

        renderApiKeyInputs(settings.textApiKeys || []);

        document.getElementById('setting-text-model').value = settings.textModel;
        document.getElementById('setting-image-model').value = settings.imageModel;
        document.getElementById('setting-generate-images').checked = settings.generateImages || false;
        document.getElementById('setting-use-fallback').checked = settings.useFallback;
        document.getElementById('setting-show-furigana').checked = settings.showFurigana;
        document.getElementById('setting-show-romaji').checked = settings.showRomaji || false;
        document.getElementById('setting-debug-mode').checked = settings.debugMode || false;
        document.getElementById('setting-srs-mode').value = settings.srsMode;

        const hlStyle = document.getElementById('setting-highlight-style');
        if (hlStyle) hlStyle.value = settings.textHighlightStyle || 'background';

        const snLine = document.getElementById('setting-sentence-newline');
        if (snLine) snLine.checked = settings.sentenceNewline || false;

        const sParse = document.getElementById('setting-sentence-parsing');
        if (sParse) sParse.checked = settings.enableSentenceParsing !== false;

        const extMode = document.getElementById('trainer-ext-mode');
        if (extMode) extMode.value = settings.trainerExtMode || 'highlight';
        const srsModeEl = document.getElementById('trainer-srs-mode');
        if (srsModeEl) srsModeEl.value = settings.trainerSrsMode || 'use';

        const timeout = document.getElementById('setting-timeout');
        if (timeout) timeout.value = settings.requestTimeoutSecs || 120;
    } else {
        // No saved settings — render one empty key input
        renderApiKeyInputs([]);
    }
}

export function getModelStack(type) {
    const order = type === 'text' ? TEXT_MODEL_ORDER : IMAGE_MODEL_ORDER;
    const preferred = type === 'text' ? settings.textModel : settings.imageModel;

    if (!settings.useFallback) return [preferred];

    const startIndex = order.indexOf(preferred);
    return order.slice(startIndex !== -1 ? startIndex : 0);
}