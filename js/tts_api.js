import { generateSpeech } from './ai_api.js';
import { settings } from './settings.js';

let activeAudio = null;
let currentSpeechId = 0;

// ─── INDEXEDDB AUDIO CACHE ───────────────────────────────────────────────────
const DB_NAME = 'ai_reader_tts_cache';
const DB_VERSION = 1;
const STORE_NAME = 'audio_clips';

let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // Key is the text, also store timestamp for LRU
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'text' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };

        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
}

async function cacheAudio(text, blob) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const record = {
            text: text,
            blob: blob,
            timestamp: Date.now()
        };

        store.put(record);

        // Commit transaction before pruning (some browsers require it or separate tx)
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });

        // Prune logic
        await pruneCache(settings.ttsCacheLimit || 50);

    } catch (e) {
        console.warn("Failed to cache audio in IndexedDB:", e);
    }
}

async function getAudioFromCache(text) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(text);

        const record = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (record && record.blob) {
            // Update timestamp to mark as recently used? 
            // Optional optimization, but technically "get" makes it recently used.
            // For simple LRU based on creation time, we skip this to avoid write overhead on read.
            return URL.createObjectURL(record.blob);
        }
    } catch (e) {
        console.warn("IndexedDB read error:", e);
    }
    return null;
}

async function pruneCache(limit) {
    const db = await openDB();
    const countTx = db.transaction(STORE_NAME, 'readonly');
    const countReq = countTx.objectStore(STORE_NAME).count();
    
    const count = await new Promise((resolve) => {
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => resolve(0);
    });

    if (count <= limit) return;

    // Need to delete (count - limit) oldest items
    const deleteCount = count - limit;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp'); // Ordered by timestamp ascending (oldest first)

    let deleted = 0;
    const cursorReq = index.openCursor();

    await new Promise((resolve) => {
        cursorReq.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor && deleted < deleteCount) {
                cursor.delete();
                deleted++;
                cursor.continue();
            } else {
                resolve();
            }
        };
        cursorReq.onerror = () => resolve();
    });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function pcm16ToWav(pcmBytes, sampleRate = 24000) {
    const wavHeader = new Uint8Array(44);
    const view = new DataView(wavHeader.buffer);
    const totalDataLen = pcmBytes.length + 36;
    
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, totalDataLen, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    view.setUint32(12, 0x666D7420, false); // "fmt "
    view.setUint32(16, 16, true); 
    view.setUint16(20, 1, true); 
    view.setUint16(22, 1, true); 
    view.setUint32(24, sampleRate, true); 
    view.setUint32(28, sampleRate * 2, true); 
    view.setUint16(32, 2, true); 
    view.setUint16(34, 16, true); 
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, pcmBytes.length, true); 
    
    const wavBytes = new Uint8Array(44 + pcmBytes.length);
    wavBytes.set(wavHeader, 0);
    wavBytes.set(pcmBytes, 44);
    return wavBytes;
}

function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

export async function speakText(text, onStartCallback, onEndCallback) {
    stopSpeech(); 

    const cleanText = text.replace(/[\r\n]+/g, ' ').trim();
    if (!cleanText) {
        if (onEndCallback) onEndCallback();
        return;
    }

    const speechId = ++currentSpeechId;

    // 1. Check IndexedDB Cache
    const cachedUrl = await getAudioFromCache(cleanText);
    if (cachedUrl) {
        if (settings.debugMode) console.log("🔊 TTS IDB Cache Hit");
        // Check if user cancelled while we were reading DB
        if (speechId !== currentSpeechId) return;
        playAudioFromUrl(cachedUrl, onStartCallback, onEndCallback);
        return;
    }

    // 2. Generate New via API
    try {
        const base64Pcm = await generateSpeech(cleanText);
        
        if (speechId !== currentSpeechId) return;

        if (!base64Pcm || base64Pcm.length === 0) {
            throw new Error("Received empty audio data from API.");
        }

        const pcmBuffer = base64ToArrayBuffer(base64Pcm);
        const pcmBytes = new Uint8Array(pcmBuffer);
        
        if (pcmBytes.length === 0) throw new Error("Audio buffer is empty.");

        const wavBytes = pcm16ToWav(pcmBytes, 24000);
        const blob = new Blob([wavBytes], { type: 'audio/wav' });
        
        // Cache it persistently
        await cacheAudio(cleanText, blob);

        // Create URL for immediate playback
        const url = URL.createObjectURL(blob);
        playAudioFromUrl(url, onStartCallback, onEndCallback);

    } catch (e) {
        console.error("Gemini TTS Error:", e);
        if (speechId === currentSpeechId) {
            if (e.message.includes('blocked by AI filter')) {
                alert(e.message);
            } else {
                console.warn("TTS failed silently to prevent spamming alerts.");
            }
            if (onEndCallback) onEndCallback();
        }
    }
}

async function playAudioFromUrl(url, onStartCallback, onEndCallback) {
    activeAudio = new Audio(url);
    activeAudio.preload = 'auto';

    activeAudio.onended = () => {
        // For IDB-derived URLs, we revoke them to free memory since they are transient
        // representations of the Blob stored in DB.
        URL.revokeObjectURL(url); 
        activeAudio = null;
        if (onEndCallback) onEndCallback();
    };

    activeAudio.onerror = (e) => {
        console.error("Audio playback error:", e);
        URL.revokeObjectURL(url);
        activeAudio = null;
        if (onEndCallback) onEndCallback();
    };

    if (onStartCallback) onStartCallback();
    
    try {
        await activeAudio.play();
    } catch (playError) {
        console.error("Browser blocked audio play:", playError);
        if (onEndCallback) onEndCallback();
    }
}

export function stopSpeech() {
    currentSpeechId++;
    if (activeAudio) {
        activeAudio.pause();
        activeAudio.src = "";
        activeAudio = null;
    }
}