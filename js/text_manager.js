import { generateText } from './ai_api.js';
import { settings } from './settings.js';

// --- HELPER FUNCTIONS ---

function cleanAndParseJSON(rawString) {
    try {
        let cleaned = rawString.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Failed to parse JSON. Raw string:", rawString);
        throw new Error("AI returned malformed JSON.");
    }
}

// --- THE PIPELINE ---

export async function processTextPipeline(rawText, onProgress) {
    // 1. EXTRACT OPTIONS
    const optionRegex = /\[OPTION ([AB]):\s*(.*?)\]/g;
    let optA = "";
    let optB = "";

    const matches = [...rawText.matchAll(optionRegex)];
    if (matches.length >= 2) {
        optA = matches[0][2].trim();
        optB = matches[1][2].trim();
    }
    // Remove option tags from story text
    const cleanStoryText = rawText.replace(optionRegex, '').trim();

    // 2. BUILD THE COMBINED PAYLOAD
    const requestPayload = {
        story: cleanStoryText,
        optA: optA,
        optB: optB
    };

    const includeSentences = settings.enableSentenceParsing;
    if (includeSentences) {
        requestPayload.includeSentences = true;
    }

    onProgress(2, "Analyzing text...");

    // 3. SINGLE COMBINED NLP REQUEST
    const sentencesOutputDoc = includeSentences
        ? '\n- "sentences": array of {"ja": "Japanese sentence", "en": "English translation"} objects covering the full story text'
        : '';

    const systemPrompt = `You are a precise Japanese NLP engine. Your job is to tokenize Japanese text and annotate each token.

INPUT: A JSON object with:
- "story": a Japanese story text string
- "optA": a Japanese option A string
- "optB": a Japanese option B string
${includeSentences ? '- "includeSentences": true — means you must also split the story into sentences with translations' : ''}

OUTPUT: A JSON object with:
- "story": array of token objects for the story text
- "optA": array of token objects for option A text
- "optB": array of token objects for option B text${sentencesOutputDoc}

Each token object has these fields:
- "surface": The exact characters of this token as they appear in the input text. REQUIRED. All surface values concatenated must reproduce the input exactly.
- "base": The dictionary/base form of the word (e.g. the infinitive for verbs). OMIT this field entirely when it is identical to surface — do not repeat it.
- "furigana": The hiragana reading of this token. OMIT when surface contains no kanji characters.
- "romaji": The romanized (Latin alphabet) reading of this token. OMIT only for bare punctuation marks (。！？、…「」『』).
- "meaning": The English meaning of this word in context. OMIT for grammatical particles (は、が、を、に、で…) and punctuation.

IMPORTANT RULES:
1. surface values must concatenate exactly to the input — no characters added, skipped, or changed.
2. A conjugated verb or adjective is always ONE token. Example: 食べられた is one token with surface "食べられた", base "食べる", not split into parts.
3. Never produce a token whose surface is a whitespace character, newline, or empty string.
4. Grammatical particles (は、が、を、に、で、と、の、へ、から、まで、より…) are standalone tokens with only surface and romaji.

EXAMPLE:
Input: {"story": "猫が食べた。", "optA": "逃げる", "optB": "寝る"}
Output: {
  "story": [
    {"surface": "猫", "furigana": "ねこ", "romaji": "neko", "meaning": "cat"},
    {"surface": "が", "romaji": "ga"},
    {"surface": "食べた", "base": "食べる", "romaji": "tabeta", "meaning": "ate"},
    {"surface": "。"}
  ],
  "optA": [{"surface": "逃げる", "romaji": "nigeru", "meaning": "to run away"}],
  "optB": [{"surface": "寝る", "romaji": "neru", "meaning": "to sleep"}]
}`;

    const response = await generateText(JSON.stringify(requestPayload), systemPrompt, true);
    const data = cleanAndParseJSON(response);

    // 4. NORMALIZE — map full field names to internal representation
    // Also supports legacy abbreviated keys (s/b/f/r/t) from old saved stories
    const normalize = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr
            .filter(t => (t.surface || t.s) && (t.surface || t.s).trim() !== '')
            .map(t => ({
                surface:       t.surface      ?? t.s ?? '',
                base:          t.base         ?? t.b ?? (t.surface ?? t.s ?? ''),
                furi:          t.furigana      ?? t.f ?? '',
                roma:          t.romaji       ?? t.r ?? '',
                trans_base:    t.meaning      ?? t.t ?? '',
                trans_context: t.meaning      ?? t.t ?? '',
                note: ''
            }));
    };

    // 5. OPTIONAL IMAGE PROMPT
    let imagePrompt = '';
    if (settings.generateImages) {
        onProgress(3, 'Drafting image prompt...');
        const sentences = data.sentences || [];
        const sentText = sentences.length > 0
            ? sentences.map(s => s.en).join(' ')
            : cleanStoryText;
        const imgPromptSys = `Describe this scene for a black-and-white manga panel in 40 words or fewer:`;
        imagePrompt = await generateText(sentText, imgPromptSys, false);
    }

    return {
        originalText: rawText,
        words: normalize(data.story),
        sentences: data.sentences || [],
        imagePrompt,
        optionWords: {
            A: normalize(data.optA),
            B: normalize(data.optB)
        }
    };
}