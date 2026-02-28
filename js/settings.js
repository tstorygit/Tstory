export const settings = {
    textApiKey: '',
    textModel: 'gemini-3.1-pro-preview',
    imageModel: 'imagen-3.0-generate-002',
    generateImages: false,
    useFallback: true,
    showFurigana: true,
    showRomaji: false,
    srsMode: 'mix',
    debugMode: false,
    textHighlightStyle: 'background',
    sentenceNewline: true,
    enableSentenceParsing: true,
    requestTimeoutSecs: 120
};

export const TEXT_MODEL_ORDER = [
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-flash-latest"
];

export const IMAGE_MODEL_ORDER = [
    "imagen-3.0-generate-002",
    "gemini-3-pro-image-preview",
    "gemini-2.0-flash-preview-image-generation"
];

export function initSettings() {
    loadSettings();

    const saveBtn = document.getElementById('btn-save-settings');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            settings.textApiKey = document.getElementById('setting-text-key').value;
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

        document.getElementById('setting-text-key').value = settings.textApiKey || '';
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
    }
}

export function getModelStack(type) {
    const order = type === 'text' ? TEXT_MODEL_ORDER : IMAGE_MODEL_ORDER;
    const preferred = type === 'text' ? settings.textModel : settings.imageModel;

    if (!settings.useFallback) return [preferred];

    const startIndex = order.indexOf(preferred);
    return order.slice(startIndex !== -1 ? startIndex : 0);
}