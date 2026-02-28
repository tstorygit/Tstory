import { settings, getModelStack } from './settings.js';

// --- STICKY MODEL STATE ---
// These variables persist between function calls.
// If Model 0 fails, this index increments so the NEXT call starts at Model 1.
let activeTextModelIndex = 0;
let activeImageModelIndex = 0;

// Timeout is configurable in settings (default 120s). Read dynamically per-request.
const DEFAULT_TIMEOUT_MS = 120000;

export async function generateText(prompt, systemInstruction = "", expectJson = false) {
    if (!settings.textApiKey) {
        throw new Error("API Key is missing. Please add it in Settings.");
    }

    const modelsToTry = getModelStack('text');
    let lastError = null;

    // Reset index if out of bounds (e.g. settings changed)
    if (activeTextModelIndex >= modelsToTry.length) {
        activeTextModelIndex = 0;
    }

    // Try models starting from the last known good (or fallback) index
    for (let i = activeTextModelIndex; i < modelsToTry.length; i++) {
        const modelName = modelsToTry[i];
        
        // --- REQUEST LOGGING ---
        if (settings.debugMode) {
            const time = new Date().toLocaleTimeString();
            console.groupCollapsed(`[${time}] 🔵 AI REQUEST: ${modelName}`);
            console.log("%cSystem Instruction:", "color: orange; font-weight: bold;", systemInstruction || "(None)");
            console.log("%cUser Prompt:", "color: #4A90E2; font-weight: bold;", prompt);
            console.groupEnd();
        }
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${settings.textApiKey}`;
        
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
                
                // If Rate Limited (429), Overloaded (503), or Server Error (5xx)
                if (status === 429 || status === 503 || status >= 500) {
                    if (settings.debugMode) console.warn(`[AI API] Model ${modelName} failed (Status ${status}). Switching fallback.`);
                    
                    // CRITICAL: Update global index so next request skips this model
                    activeTextModelIndex = i + 1; 
                    
                    throw new Error(`Status ${status}: Rate Limit/Server Error`);
                } else {
                    // For other errors (400 Bad Request, etc), we usually don't want to skip the model forever,
                    // but if the prompt is valid, it might be a model capability issue.
                    // For safety, we will treat 400s as non-sticky errors, but throw immediately?
                    // No, let's treat it as a failure to try the next model.
                    throw new Error(`Status ${status}: ${errorData.error?.message || 'Unknown error'}`);
                }
            }

            const data = await response.json();
            
            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
                const resultText = data.candidates[0].content.parts[0].text;

                // --- RESPONSE LOGGING ---
                if (settings.debugMode) {
                    const time = new Date().toLocaleTimeString();
                    console.groupCollapsed(`[${time}] 🟢 AI RESPONSE: ${modelName}`);
                    console.log("%cFull Output:", "color: green; font-weight: bold;", resultText);
                    console.groupEnd();
                }
                
                // Success! 'activeTextModelIndex' stays at 'i' (the current working model).
                return resultText;
            } else {
                throw new Error("Unexpected API response structure.");
            }

        } catch (error) {
            clearTimeout(timeoutId);

            const isTimeout = error.name === 'AbortError';
            const isRateLimit = error.message?.includes('Status 429') || error.message?.includes('Status 503') || error.message?.includes('Status 5');

            // LOGGING
            if (settings.debugMode) {
                const time = new Date().toLocaleTimeString();
                if (isTimeout) {
                    // Timeout is expected/transient — log as warning, not error
                    console.warn(`[${time}] ⏱️ TIMEOUT: ${modelName} — trying next model`);
                } else {
                    console.error(`[${time}] 🔴 ERROR: ${modelName}`, error);
                }
            }

            // STICKY vs TRANSIENT fallback:
            // Rate limits (429/503/5xx) → advance global index permanently (model is overloaded).
            // Timeouts → only advance the loop index for this attempt; global index stays
            //            so the next independent request retries the same model (it may just be slow today).
            // Other errors → advance permanently (bad request, auth error, etc).
            if (isRateLimit) {
                activeTextModelIndex = i + 1; // Sticky: skip this model next time too
            } else if (isTimeout) {
                // Non-sticky: loop will try i+1 but activeTextModelIndex is NOT updated,
                // so the next top-level call will still start from this model.
                // (handled implicitly — we don't set activeTextModelIndex here)
            } else {
                activeTextModelIndex = i + 1; // Sticky for other hard errors
            }

            lastError = error;

            // Stop loop if no fallbacks enabled or we reached the end
            if (!settings.useFallback || i === modelsToTry.length - 1) {
                break;
            }
        }
    }

    throw new Error(`AI Text Generation failed. Last error: ${lastError?.message}`);
}


export async function generateImage(prompt) {
    if (!settings.textApiKey) throw new Error("API Key is missing.");

    const modelsToTry = getModelStack('image');
    let lastError = null;

    if (activeImageModelIndex >= modelsToTry.length) {
        activeImageModelIndex = 0;
    }

    for (let i = activeImageModelIndex; i < modelsToTry.length; i++) {
        const modelName = modelsToTry[i];
        
        if (settings.debugMode) {
            const time = new Date().toLocaleTimeString();
            console.groupCollapsed(`[${time}] 🖼️ IMAGE REQUEST: ${modelName}`);
            console.log("Prompt:", prompt);
            console.groupEnd();
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${settings.textApiKey}`;
        
        const payload = {
            instances: [{ prompt: prompt }],
            parameters: { sampleCount: 1 }
        };

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
                const status = response.status;
                // Mark as bad model for future requests
                activeImageModelIndex = i + 1;
                throw new Error(`Status ${status}`);
            }

            const data = await response.json();
            
            if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
                if (settings.debugMode) console.log(`[${new Date().toLocaleTimeString()}] 🖼️ Image Received`);x
                return `data:image/png;base64,${data.predictions[0].bytesBase64Encoded}`;
            } else if (data.candidates && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text; 
            } else {
                throw new Error("Unexpected Image API response structure.");
            }

        } catch (error) {
            clearTimeout(timeoutId);
            
            // On ANY error (Timeout or Network), skip this model next time
            activeImageModelIndex = i + 1;
            lastError = error;

            if (settings.debugMode) console.error("Image Gen Error:", error);

            if (!settings.useFallback || i === modelsToTry.length - 1) {
                break;
            }
        }
    }

    throw new Error(`AI Image Generation failed. Last error: ${lastError?.message}`);
}