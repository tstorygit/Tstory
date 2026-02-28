/**
 * SRS Word Object Structure:
 * {
 *   word: "日本語",
 *   furi: "にほんご",
 *   translation: "Japanese language",
 *   status: 0, // 0 to 5
 *   lastUpdated: "2023-10-27T..." 
 * }
 */

const STORAGE_KEY = 'ai_reader_srs_data';

export function getAllWords() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
}

export function saveWord(wordObj) {
    const words = getAllWords();
    // Use the word (Japanese text) as the unique key
    words[wordObj.word] = {
        ...wordObj,
        lastUpdated: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
}

export function updateWordStatus(wordText, newStatus) {
    const words = getAllWords();
    if (words[wordText]) {
        words[wordText].status = parseInt(newStatus);
        words[wordText].lastUpdated = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
        return true;
    }
    return false;
}

export function getWord(wordText) {
    const words = getAllWords();
    return words[wordText] || null;
}

/**
 * Filter words for Story generation or SRS review
 * @param {Object} criteria { limit: 10, minStatus: 0, maxStatus: 4, sort: 'oldest' }
 */
export function getFilteredWords(criteria = {}) {
    let words = Object.values(getAllWords());

    if (criteria.maxStatus !== undefined) {
        words = words.filter(w => w.status <= criteria.maxStatus);
    }
    if (criteria.minStatus !== undefined) {
        words = words.filter(w => w.status >= criteria.minStatus);
    }

    // Sort by date (default oldest first for review)
    words.sort((a, b) => new Date(a.lastUpdated) - new Date(b.lastUpdated));

    if (criteria.limit) {
        words = words.slice(0, criteria.limit);
    }

    return words;
}