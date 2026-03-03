import { generateSpeech } from './ai_api.js';

let activeAudio = null;
let currentSpeechId = 0;

/**
 * Wraps raw 16-bit PCM data (from Gemini) into a playable standard WAV file format.
 */
function pcm16ToWav(pcmBytes, sampleRate = 24000) {
    const wavHeader = new Uint8Array(44);
    const view = new DataView(wavHeader.buffer);
    const totalDataLen = pcmBytes.length + 36;
    
    // RIFF chunk descriptor
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, totalDataLen, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    
    // fmt sub-chunk
    view.setUint32(12, 0x666D7420, false); // "fmt "
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, 1, true); // NumChannels (1 for Mono)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    
    // data sub-chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, pcmBytes.length, true); // Subchunk2Size
    
    // Combine header and PCM data
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

export async function speakText(text, onStartCallback, onEndCallback) {
    stopSpeech();

    const cleanText = text.replace(/[\r\n]+/g, ' ').trim();
    if (!cleanText) {
        if (onEndCallback) onEndCallback();
        return;
    }

    const speechId = ++currentSpeechId;

    try {
        const base64Pcm = await generateSpeech(cleanText);
        
        // Prevent playing if the user navigated away or cancelled the operation
        if (speechId !== currentSpeechId) return;

        const pcmBuffer = base64ToArrayBuffer(base64Pcm);
        const pcmBytes = new Uint8Array(pcmBuffer);
        const wavBytes = pcm16ToWav(pcmBytes, 24000);
        
        const blob = new Blob([wavBytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        
        activeAudio = new Audio(url);
        
        activeAudio.onended = () => {
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
        
        await activeAudio.play();

    } catch (e) {
        console.error("Gemini TTS Error:", e);
        if (speechId === currentSpeechId) {
            alert("Failed to generate speech. Check API limits or console.");
            if (onEndCallback) onEndCallback();
        }
    }
}

export function stopSpeech() {
    currentSpeechId++; // Invalidates any pending fetches
    if (activeAudio) {
        activeAudio.pause();
        activeAudio.src = "";
        activeAudio = null;
    }
}