import { settings, getModelStack } from './settings.js';

// ─── KEY ROTATION STATE ──────────────────────────────────────────────────────
// activeKeyIndex is persisted so rotation survives page reloads.
const KEY_INDEX_STORAGE = 'ai_api_active_key_index';

function getActiveKeyIndex() {
    return parseInt(localStorage.getItem(KEY_INDEX_STORAGE)) || 0;
}

function setActiveKeyIndex(idx) {
    localStorage.setItem(KEY_INDEX_STORAGE, String(idx));
}

/** Returns the ordered array of non-empty API keys from settings. */
export function getKeyList() {
    const keys = (settings.textApiKeys || []).map(k => k.trim()).filter(Boolean);
    // Legacy fallback: single-key setting
    if (keys.length === 0 && settings.textApiKey) keys.push(settings.textApiKey.trim());
    return keys;
}

// ─── MODEL STATE (per-key) ────────────────────────────────────────────────────
// Sticky model index per key so rotation back to a key resumes where it left off.
let modelIndexByKey = {};

function getModelIndex(keyIdx) {
    return modelIndexByKey[keyIdx] ?? 0;
}

function setModelIndex(keyIdx, idx) {
    modelIndexByKey[keyIdx] = idx;
}

// ─── TEXT GENERATION ─────────────────────────────────────────────────────────

export async function generateText(prompt, systemInstruction = "", expectJson = false) {
    const keys = getKeyList();
    if (keys.length === 0) {
        throw new Error("No API key configured. Please add one in Settings.");
    }

    const modelsToTry = getModelStack('text');
    let lastError = null;

    const startKeyIdx = getActiveKeyIndex() % keys.length;

    for (let ki = 0; ki < keys.length; ki++) {
        const keyIdx = (startKeyIdx + ki) % keys.length;
        const apiKey = keys[keyIdx];

        if (getModelIndex(keyIdx) >= modelsToTry.length) {
            setModelIndex(keyIdx, 0);
        }

        const startModelIdx = getModelIndex(keyIdx);

        for (let mi = startModelIdx; mi < modelsToTry.length; mi++) {
            const modelName = modelsToTry[mi];

            if (settings.debugMode) {
                const time = new Date().toLocaleTimeString();
                console.groupCollapsed(`[${time}] 🔵 AI REQUEST — Key #${keyIdx + 1}/${keys.length} · ${modelName}`);
                console.log("%cSystem:", "color:orange;font-weight:bold;", systemInstruction || "(None)");
                console.log("%cPrompt:", "color:#4A90E2;font-weight:bold;", prompt);
                console.groupEnd();
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3 }
            };
            if (systemInstruction) {
                payload.system_instruction = { parts: [{ text: systemInstruction }] };
            }
            if (expectJson) {
                payload.generationConfig.response_mime_type = "application/json";
            }

            const controller = new AbortController();
            const timeoutMs = (settings.requestTimeoutSecs || 120) * 1000;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const status = response.status;
                    const isRateLimit = status === 429 || status === 503 || status >= 500;

                    if (settings.debugMode) {
                        console.warn(`[AI API] Key #${keyIdx + 1} · ${modelName} → HTTP ${status}`);
                    }

                    if (isRateLimit) setModelIndex(keyIdx, mi + 1);
                    else setModelIndex(keyIdx, mi + 1);

                    throw new Error(`Status ${status}: ${errorData.error?.message || 'Server error'}`);
                }

                const data = await response.json();

                if (data.candidates?.[0]?.content?.parts) {
                    const resultText = data.candidates[0].content.parts[0].text;

                    if (settings.debugMode) {
                        const time = new Date().toLocaleTimeString();
                        console.groupCollapsed(`[${time}] 🟢 AI RESPONSE — Key #${keyIdx + 1} · ${modelName}`);
                        console.log("%cOutput:", "color:green;font-weight:bold;", resultText);
                        console.groupEnd();
                    }

                    setActiveKeyIndex(keyIdx);
                    return resultText;
                } else {
                    throw new Error("Unexpected API response structure.");
                }

            } catch (error) {
                clearTimeout(timeoutId);

                const isTimeout = error.name === 'AbortError';

                if (settings.debugMode) {
                    const time = new Date().toLocaleTimeString();
                    if (isTimeout) {
                        console.warn(`[${time}] ⏱️ TIMEOUT — Key #${keyIdx + 1} · ${modelName}`);
                    } else {
                        console.error(`[${time}] 🔴 ERROR — Key #${keyIdx + 1} · ${modelName}`, error.message);
                    }
                }

                // Timeouts: don't sticky-advance model index so next top-level call retries same model
                if (!isTimeout) setModelIndex(keyIdx, mi + 1);

                lastError = error;
                if (!settings.useFallback) break;
            }
        }

        // All models exhausted for this key → rotate to next key
        if (settings.useFallback && keys.length > 1) {
            const nextKeyIdx = (keyIdx + 1) % keys.length;
            setActiveKeyIndex(nextKeyIdx);
            setModelIndex(nextKeyIdx, 0); // fresh model start for new key

            if (settings.debugMode) {
                console.warn(`[AI API] All models exhausted for Key #${keyIdx + 1} → rotating to Key #${nextKeyIdx + 1}`);
            }
        }

        if (!settings.useFallback) break;
    }

    throw new Error(`AI Text Generation failed after trying all keys & models. Last error: ${lastError?.message}`);
}

// ─── IMAGE GENERATION ────────────────────────────────────────────────────────

let activeImageModelIndex = 0;

export async function generateImage(prompt) {
    const keys = getKeyList();
    if (keys.length === 0) throw new Error("No API key configured.");

    const modelsToTry = getModelStack('image');
    let lastError = null;
    const startKeyIdx = getActiveKeyIndex() % keys.length;

    for (let ki = 0; ki < keys.length; ki++) {
        const keyIdx = (startKeyIdx + ki) % keys.length;
        const apiKey = keys[keyIdx];

        if (activeImageModelIndex >= modelsToTry.length) activeImageModelIndex = 0;

        for (let mi = activeImageModelIndex; mi < modelsToTry.length; mi++) {
            const modelName = modelsToTry[mi];

            if (settings.debugMode) {
                console.groupCollapsed(`[${new Date().toLocaleTimeString()}] 🖼️ IMAGE — Key #${keyIdx + 1} · ${modelName}`);
                console.log("Prompt:", prompt);
                console.groupEnd();
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${apiKey}`;
            const payload = { instances: [{ prompt }], parameters: { sampleCount: 1 } };

            const controller = new AbortController();
            const timeoutMs = (settings.requestTimeoutSecs || 120) * 1000;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    activeImageModelIndex = mi + 1;
                    throw new Error(`Status ${response.status}`);
                }

                const data = await response.json();

                if (data.predictions?.[0]?.bytesBase64Encoded) {
                    if (settings.debugMode) console.log(`[${new Date().toLocaleTimeString()}] 🖼️ Image received`);
                    return `data:image/png;base64,${data.predictions[0].bytesBase64Encoded}`;
                } else if (data.candidates?.[0]?.content) {
                    return data.candidates[0].content.parts[0].text;
                } else {
                    throw new Error("Unexpected Image API response structure.");
                }

            } catch (error) {
                clearTimeout(timeoutId);
                activeImageModelIndex = mi + 1;
                lastError = error;
                if (settings.debugMode) console.error("Image Gen Error:", error);
                if (!settings.useFallback) break;
            }
        }

        if (!settings.useFallback) break;
    }

    throw new Error(`AI Image Generation failed. Last error: ${lastError?.message}`);
}