import { generateText } from './ai_api.js';

// ─── DECK REGISTRY ───────────────────────────────────────────────────────────

export const TRAINER_DECKS = [
    // ── Interest ──────────────────────────────────────────────────────────────
    { id: 'anime',     category: 'interest', label: '🗡️ Anime',     file: '../data/word_list_1000_anime.js'      },
    { id: 'romance',   category: 'interest', label: '💔 Romance',   file: '../data/word_list_1000_romance.js'    },
    { id: 'gamer',     category: 'interest', label: '🎮 Gamer',     file: '../data/word_list_1000_gamer.js'      },
    { id: 'foodie',    category: 'interest', label: '🍣 Foodie',    file: '../data/word_list_1000_foodie.js'     },
    { id: 'history',   category: 'interest', label: '🏯 History',   file: '../data/word_list_1000_history.js'    },
    // ── Goal ──────────────────────────────────────────────────────────────────
    { id: 'tourist',   category: 'goal',     label: '✈️ Tourist',   file: '../data/word_list_1000_tourist.js'    },
    { id: 'expat',     category: 'goal',     label: '🏢 Expat',     file: '../data/word_list_1000_expat.js'      },
    { id: 'frequency', category: 'goal',     label: '💼 Standard',  file: '../data/word_list_1000_frequency.js'  },
    { id: 'jlpt_n5',   category: 'goal',     label: '🔰 JLPT N5',  file: '../data/word_list_jlpt_n5.js'         },
    { id: 'jlpt_n4',   category: 'goal',     label: '📜 JLPT N4',  file: '../data/word_list_jlpt_n4.js'         },
];

const ACTIVE_DECK_KEY = 'trainer_active_deck';

// In-memory cache for loaded word lists
const _deckCache = {};

/** Load (or return cached) word list for a deck id. Returns Promise<array>. */
export async function loadDeck(deckId) {
    if (_deckCache[deckId]) return _deckCache[deckId];
    const deck = TRAINER_DECKS.find(d => d.id === deckId);
    if (!deck) return [];
    try {
        const mod = await import(deck.file);
        _deckCache[deckId] = mod.wordList || mod.default || [];
    } catch (e) {
        console.error(`[trainer_mgr] Failed to load deck "${deckId}":`, e);
        _deckCache[deckId] = [];
    }
    return _deckCache[deckId];
}

/** Synchronously return already-loaded list, or null if not yet loaded. */
export function getDeckCached(deckId) {
    return _deckCache[deckId] || null;
}

export function getActiveDeckId() {
    return localStorage.getItem(ACTIVE_DECK_KEY) || TRAINER_DECKS[0].id;
}

export function setActiveDeckId(deckId) {
    localStorage.setItem(ACTIVE_DECK_KEY, deckId);
}

// ─── PER-DECK KEYS ────────────────────────────────────────────────────────────

function _progressKey(deckId) { return `trainer_progress_${deckId}`; }
function _dataKey(deckId)     { return `trainer_data_${deckId}`;     }

// ─── STATE ACCESSORS ─────────────────────────────────────────────────────────

export function getProgress(deckId = getActiveDeckId()) {
    // Migrate legacy key (no deck suffix) → frequency deck on first run
    if (deckId === 'frequency' && !localStorage.getItem(_progressKey(deckId))) {
        const legacy = localStorage.getItem('trainer_progress');
        if (legacy) localStorage.setItem(_progressKey(deckId), legacy);
    }
    return parseInt(localStorage.getItem(_progressKey(deckId))) || 1;
}

export function setProgress(rank, deckId = getActiveDeckId()) {
    localStorage.setItem(_progressKey(deckId), String(rank));
}

function _getTrainerData(deckId = getActiveDeckId()) {
    // Migrate legacy cache for frequency deck
    if (deckId === 'frequency' && !localStorage.getItem(_dataKey(deckId))) {
        const legacy = localStorage.getItem('trainer_data');
        if (legacy) localStorage.setItem(_dataKey(deckId), legacy);
    }
    try {
        return JSON.parse(localStorage.getItem(_dataKey(deckId))) || {};
    } catch {
        return {};
    }
}

function _saveTrainerData(data, deckId = getActiveDeckId()) {
    try {
        localStorage.setItem(_dataKey(deckId), JSON.stringify(data));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            const entries = Object.entries(data);
            entries.sort((a, b) => (a[1].cachedAt || 0) - (b[1].cachedAt || 0));
            const evicted = {};
            entries.slice(50).forEach(([k, v]) => { evicted[k] = v; });
            localStorage.setItem(_dataKey(deckId), JSON.stringify(evicted));
        }
    }
}

export function clearCacheForRank(rank, deckId = getActiveDeckId()) {
    const data = _getTrainerData(deckId);
    delete data[String(rank)];
    _saveTrainerData(data, deckId);
}

export function getWordByRank(rank, deckId = getActiveDeckId()) {
    const list = getDeckCached(deckId);
    if (!list) return null;
    return list.find(w => w.rank === rank) || null;
}

export function getTotalWords(deckId = getActiveDeckId()) {
    const list = getDeckCached(deckId);
    return list ? list.length : 0;
}

// ─── GENERATION ─────────────────────────────────────────────────────────────

/**
 * Generate (or return cached) trainer sentences for a given rank.
 * @param {number} rank
 * @param {boolean} forceRegenerate
 * @param {Function} onProgress - optional callback(step, text)
 * @param {Function} onSentencesReady - fired after step 1 with raw sentences before NLP
 * @param {string} [deckId]
 */
export async function generateTrainerSentences(rank, forceRegenerate = false, onProgress = () => {}, onSentencesReady = null, deckId = getActiveDeckId()) {
    const wordList = await loadDeck(deckId);
    const data = _getTrainerData(deckId);
    const key = String(rank);

    if (!forceRegenerate && data[key]) {
        return data[key];
    }

    const targetWordObj = wordList.find(w => w.rank === rank);
    if (!targetWordObj) throw new Error(`Word at rank ${rank} not found in deck "${deckId}".`);

    const allowedWords = wordList
        .filter(w => w.rank <= rank)
        .map(w => w.word)
        .join(', ');

    onProgress(1, `Generating sentences for: ${targetWordObj.word}…`);

    const systemPrompt = `You are a Japanese teacher. Generate exactly 3 simple Japanese sentences. Return JSON format only (no markdown, no explanation): { "sentences": [ { "ja": "...", "en": "..." } ] }`;
    const userPrompt = `Target word: ${targetWordObj.word} (${targetWordObj.furi}, meaning: ${targetWordObj.trans}). Write 3 sentences using this word. STRICT RULE: Try to ONLY use the target word and these allowed words: ${allowedWords}. Keep grammar JLPT N5/N4 level.`;

    onProgress(2, 'Calling AI…');
    const rawResponse = await generateText(userPrompt, systemPrompt, true);

    let parsed;
    try {
        let cleaned = rawResponse.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        parsed = JSON.parse(cleaned);
    } catch (e) {
        throw new Error('AI returned malformed JSON for trainer sentences.');
    }

    const sentences = parsed.sentences || [];
    if (sentences.length === 0) throw new Error('AI returned no sentences.');

    if (onSentencesReady) {
        const partialBlock = {
            rank, deckId,
            targetWord: targetWordObj,
            rawSentences: sentences,
            enrichedData: { words: [], sentences },
            isProcessing: true,
            cachedAt: Date.now()
        };
        data[key] = partialBlock;
        _saveTrainerData(data, deckId);
        onSentencesReady(sentences);
    }

    onProgress(3, 'Analyzing vocabulary…');

    const combinedJa = sentences.map(s => s.ja).join('');

    const nlpSystem = `You are a Japanese NLP tokenizer. Tokenize the input text into an array of token objects.

OUTPUT: JSON only, no markdown — { "tokens": [ ... ] }

Each token object:
- "surface": exact characters as they appear. REQUIRED.
- "base": dictionary/base form. OMIT if identical to surface.
- "furigana": hiragana reading. OMIT if surface has no kanji.
- "romaji": romanized reading. OMIT ONLY for bare punctuation (。！？、…「」『』（）).
- "meaning": English meaning in context. OMIT for grammatical particles (は が を に で と の へ から まで より も) and punctuation.

RULES:
1. Ignore whitespace and newlines. Do not include them in any token's surface. Tokenize all actual Japanese words and punctuation in order. Do not skip any actual characters.
2. A conjugated verb or adjective is ONE token (e.g. 食べられた → one token, base 食べる).
3. No token with empty or whitespace-only surface.`;

    let tokens = [];
    try {
        const nlpRaw = await generateText(combinedJa, nlpSystem, true);
        const nlpCleaned = nlpRaw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        const nlpParsed = JSON.parse(nlpCleaned);
        const raw = nlpParsed.tokens || [];
        tokens = raw
            .filter(t => (t.surface || t.s) && String(t.surface || t.s).trim() !== '')
            .map(t => ({
                surface:       t.surface      ?? t.s ?? '',
                base:          t.base         ?? t.b ?? (t.surface ?? t.s ?? ''),
                furi:          t.furigana     ?? t.f ?? '',
                roma:          t.romaji       ?? t.r ?? '',
                trans_base:    t.meaning      ?? t.t ?? '',
                trans_context: t.meaning      ?? t.t ?? '',
                note: ''
            }));
    } catch (e) {
        throw new Error(`Trainer NLP failed: ${e.message}`);
    }

    // Enrich tokens with rank info from the active deck
    const wordListByWord = {};
    wordList.forEach(w => { wordListByWord[w.word] = w; });

    const enrichedTokens = tokens.map(token => {
        const baseForm = token.base || token.surface;
        const match = wordListByWord[baseForm] || wordListByWord[token.surface];
        if (match) {
            return { ...token, isExternal: match.rank > rank, rank: match.rank };
        }
        return { ...token, isExternal: true };
    });

    const block = {
        rank, deckId,
        targetWord: targetWordObj,
        rawSentences: sentences,
        enrichedData: { words: enrichedTokens, sentences },
        isProcessing: false,
        cachedAt: Date.now()
    };

    data[key] = block;
    _saveTrainerData(data, deckId);

    return block;
}