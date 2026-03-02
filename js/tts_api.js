/**
 * Uses the free, browser-native Web Speech API for Text-to-Speech playback.
 * Requires no API keys and uses zero storage space.
 */

// Keep a global reference to the utterance to prevent Chrome/Windows 
// from "garbage collecting" it and stopping the audio instantly.
let activeUtterance = null;

export function speakText(text, onStartCallback, onEndCallback) {
    if (!('speechSynthesis' in window)) {
        alert("Your browser does not support native Text-to-Speech.");
        if (onEndCallback) onEndCallback();
        return;
    }

    // Cancel any ongoing speech before starting a new one
    window.speechSynthesis.cancel();

    // Wrap the speak command in a small timeout. 
    // Firing speak() immediately after cancel() causes instant failure on some OS.
    setTimeout(() => {
        const cleanText = text.replace(/[\r\n]+/g, ' ').trim();
        if (!cleanText) {
            if (onEndCallback) onEndCallback();
            return;
        }

        activeUtterance = new SpeechSynthesisUtterance(cleanText);
        activeUtterance.lang = 'ja-JP';
        activeUtterance.rate = 0.9; // Slightly slower for language learners

        // Function to find a Japanese voice and execute speech
        const setVoiceAndSpeak = () => {
            const voices = window.speechSynthesis.getVoices();
            
            // Find all Japanese voices (matches 'ja-JP', 'ja_JP', 'ja')
            const jaVoices = voices.filter(v => v.lang.startsWith('ja'));
            
            if (jaVoices.length > 0) {
                // Prefer high quality or OS-native voices if available
                const preferredVoice = jaVoices.find(v => 
                    /Google|Premium|Siri|Kyoko|Haruka|Nanami/i.test(v.name)
                );
                activeUtterance.voice = preferredVoice || jaVoices[0];
            }

            activeUtterance.onstart = () => {
                if (onStartCallback) onStartCallback();
            };

            activeUtterance.onend = () => {
                activeUtterance = null; // Release from memory
                if (onEndCallback) onEndCallback();
            };

            activeUtterance.onerror = (e) => {
                console.error("Web Speech API TTS Error:", e);
                activeUtterance = null; // Release from memory
                if (onEndCallback) onEndCallback();
            };

            window.speechSynthesis.speak(activeUtterance);
        };

        // Browsers load voices asynchronously. 
        if (window.speechSynthesis.getVoices().length === 0) {
            let hasRun = false;
            window.speechSynthesis.onvoiceschanged = () => {
                if (!hasRun) {
                    hasRun = true;
                    setVoiceAndSpeak();
                }
            };
            // Fallback timeout in case onvoiceschanged never fires
            setTimeout(() => {
                if (!hasRun) {
                    hasRun = true;
                    setVoiceAndSpeak();
                }
            }, 1000);
        } else {
            setVoiceAndSpeak();
        }
    }, 50); // 50ms delay
}

export function stopSpeech() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        activeUtterance = null;
    }
}