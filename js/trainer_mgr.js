import { wordList } from '../data/word_list_1000.js';
import { generateText } from './ai_api.js';

const PROGRESS_KEY = 'trainer_progress';
const DATA_KEY = 'trainer_data';

// ─── STATE ACCESSORS ────────────────────────────────────────────────────────

export function getProgress() {
    return parseInt(localStorage.getItem(PROGRESS_KEY)) || 1;
}

export function setProgress(rank) {
    localStorage.setItem(PROGRESS_KEY, String(rank));
}

function getTrainerData() {
    try {
        return JSON.parse(localStorage.getItem(DATA_KEY)) || {};
    } catch {
        return {};
    }
}

function saveTrainerData(data) {
    try {
        localStorage.setItem(DATA_KEY, JSON.stringify(data));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            // Evict oldest 50 entries to free space
            const entries = Object.entries(data);
            entries.sort((a, b) => (a[1].cachedAt || 0) - (b[1].cachedAt || 0));
            const evicted = {};
            entries.slice(50).forEach(([k, v]) => { evicted[k] = v; });
            localStorage.setItem(DATA_KEY, JSON.stringify(evicted));
        }
    }
}

export function clearCacheForRank(rank) {
    const data = getTrainerData();
    delete data[String(rank)];
    saveTrainerData(data);
}

export function getWordByRank(rank) {
    return wordList.find(w => w.rank === rank) || null;
}

export function getTotalWords() {
    return wordList.length;
}

// ─── GENERATION ─────────────────────────────────────────────────────────────

/**
 * Generate (or return cached) trainer sentences for a given rank.
 * @param {number} rank
 * @param {boolean} forceRegenerate - Skip cache and regenerate
 * @param {Function} onProgress - optional progress callback(step, text)
 */
export async function generateTrainerSentences(rank, forceRegenerate = false, onProgress = () => {}) {
    const data = getTrainerData();
    const key = String(rank);

    if (!forceRegenerate && data[key]) {
        return data[key];
    }

    const targetWordObj = wordList.find(w => w.rank === rank);
    if (!targetWordObj) throw new Error(`Word at rank ${rank} not found in word list.`);

    // Only allow words up to current rank as "known" vocabulary
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

    onProgress(3, 'Analyzing vocabulary…');

    const combinedJa = sentences.map(s => s.ja).join('');

    // ─── DEDICATED TRAINER NLP ───────────────────────────────────────────────
    // A lean tokenizer prompt — no story options, no image prompt, no sentence
    // re-splitting. Just tokenize the combined sentence text into annotated tokens.
    const nlpSystem = `You are a Japanese NLP tokenizer. Tokenize the input text into an array of token objects.

OUTPUT: JSON only, no markdown — { "tokens": [ ... ] }

Each token object:
- "surface": exact characters as they appear. All surfaces concatenated must reproduce the input exactly. REQUIRED.
- "base": dictionary/base form. OMIT if identical to surface.
- "furigana": hiragana reading. OMIT if surface has no kanji.
- "romaji": romanized reading. OMIT ONLY for bare punctuation (。！？、…「」『』（）).
- "meaning": English meaning in context. OMIT for grammatical particles (は が を に で と の へ から まで より も) and punctuation.

RULES:
1. Surfaces must concatenate to reproduce the input exactly — no characters skipped or added.
2. A conjugated verb or adjective is ONE token (e.g. 食べられた → one token, base 食べる).
3. No token with empty or whitespace-only surface.`;

    const nlpUser = combinedJa;

    let tokens = [];
    try {
        const nlpRaw = await generateText(nlpUser, nlpSystem, true);
        const nlpCleaned = nlpRaw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        const nlpParsed = JSON.parse(nlpCleaned);
        const raw = nlpParsed.tokens || [];
        // Normalize field names (support both full and abbreviated keys from older saves)
        tokens = raw
            .filter(t => (t.surface || t.s) && String(t.surface || t.s).trim() !== '')
            .map(t => ({
                surface:       t.surface      ?? t.s ?? '',
                base:          t.base         ?? t.b ?? (t.surface ?? t.s ?? ''),
                furi:          t.furigana      ?? t.f ?? '',
                roma:          t.romaji       ?? t.r ?? '',
                trans_base:    t.meaning      ?? t.t ?? '',
                trans_context: t.meaning      ?? t.t ?? '',
                note: ''
            }));
    } catch (e) {
        throw new Error(`Trainer NLP failed: ${e.message}`);
    }

    // ─── ENRICH: mark isExternal ─────────────────────────────────────────────
    const wordListByWord = {};
    wordList.forEach(w => { wordListByWord[w.word] = w; });

    const enrichedTokens = tokens.map(token => {
        const baseForm = token.base || token.surface;
        const match = wordListByWord[baseForm] || wordListByWord[token.surface];
        if (match && match.rank <= rank) {
            return { ...token, isExternal: false, rank: match.rank };
        }
        return { ...token, isExternal: true };
    });

    const block = {
        rank,
        targetWord: targetWordObj,
        rawSentences: sentences,
        enrichedData: {
            words: enrichedTokens,
            sentences: sentences   // keep translations accessible for rendering
        },
        cachedAt: Date.now()
    };

    // Save to cache
    data[key] = block;
    saveTrainerData(data);

    return block;
}