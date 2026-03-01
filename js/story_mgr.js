import { generateText, generateImage } from './ai_api.js';
import { processTextPipeline } from './text_manager.js';
import { settings } from './settings.js';
import * as srsDb from './srs_db.js';

const STORAGE_KEY = 'ai_reader_stories';
let activeStoryId = null;

export function getStoryList() {
    try {
        const json = localStorage.getItem(STORAGE_KEY);
        return json ? JSON.parse(json) : [];
    } catch (e) {
        console.error("Failed to load stories", e);
        return [];
    }
}

function saveStoryList(stories) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            alert("Storage full! Please delete old stories to continue.");
        } else {
            console.error("Failed to save stories", e);
        }
    }
}

export function getActiveStory() {
    if (!activeStoryId) return null;
    const stories = getStoryList();
    return stories.find(s => s.id === activeStoryId) || null;
}

export function setActiveStory(id) {
    activeStoryId = id;
}

export function deleteStory(id) {
    let stories = getStoryList();
    stories = stories.filter(s => s.id !== id);
    saveStoryList(stories);
    if (activeStoryId === id) activeStoryId = null;
}

export async function createNewStory(theme, onProgress, onRawTextReady) {
    const stories = getStoryList();
    
    const newStory = {
        id: Date.now().toString(),
        title: theme.substring(0, 30) + (theme.length > 30 ? "..." : ""),
        themePrompt: theme,
        created: new Date().toISOString(),
        blocks: []
    };

    stories.push(newStory);
    saveStoryList(stories);
    
    activeStoryId = newStory.id;

    return await generateNextBlock(null, onProgress, onRawTextReady);
}

export async function generateNextBlock(chosenOption, onProgress, onRawTextReady) {
    // 1. Load latest data
    let stories = getStoryList();
    let storyIndex = stories.findIndex(s => s.id === activeStoryId);
    if (storyIndex === -1) throw new Error("Active story not found in storage.");
    
    const storyData = stories[storyIndex];

    onProgress(0, "Drafting the next part of the story...");

    // Build vocabulary hint list based on SRS mode.
    let targetWords = [];
    if (settings.srsMode !== 'none') {
        let srsCriteria = { limit: 5 };
        if (settings.srsMode === 'new') {
            srsCriteria.maxStatus = 2;
        }
        targetWords = srsDb.getFilteredWords(srsCriteria).map(w => w.word);
    }
    
    // --- CONSTRUCT PROMPTS ---
    const customLevel = settings.customPromptParams || 'JLPT N4-N3';
    const systemInstruction = `You are a Japanese visual novel writer.

STRICT RULES:
1. Write exactly 4 to 6 sentences of Japanese text.
2. Language level: ${customLevel}. Focus on dialogue and character actions. Avoid elaborate scene descriptions.
3. After the story sentences, you MUST append exactly two continuation options IN JAPANESE formatted like this:
[OPTION A: 日本語で選択肢の説明]
[OPTION B: 日本語で選択肢の説明]
4. Output ONLY the Japanese story text followed by the two bracketed options. No English commentary, no greetings, no explanations.`;

    let userPrompt = `Theme: ${storyData.themePrompt}`;

    if (targetWords.length > 0) {
        userPrompt += `\nTry to naturally include these vocabulary words: ${targetWords.join(", ")}`;
    }

    if (chosenOption && storyData.blocks.length > 0) {
        const lastBlock = storyData.blocks[storyData.blocks.length - 1];
        lastBlock.selectedOption = chosenOption;

        // Clean the previous story text: Remove the [OPTION A...] lines so the AI
        // doesn't get confused by options that were NOT selected.
        // Regex removes [OPTION X: ...] and anything inside.
        const cleanHistory = lastBlock.rawJa.replace(/\[OPTION [AB]:[\s\S]*?\]/g, '').trim();

        // Strip "A: " or "B: " prefix from the chosen option for the prompt
        // e.g. "A: Go home" becomes "Go home"
        const cleanChoice = chosenOption.replace(/^[AB]:\s*/, '').trim();

        userPrompt += `\n\nPrevious story context:\n${cleanHistory}`;
        userPrompt += `\n\nCRITICAL INSTRUCTION: The story continues from the choice: "${cleanChoice}".`;
        userPrompt += `\nWrite the next 4-6 sentences based on this choice.`;
    } else {
        userPrompt += `\n\nWrite the opening 4-6 sentences.`;
    }

    const rawJaText = await generateText(userPrompt, systemInstruction, false);
    
    // --- CLEANUP ---
    let cleanRawJa = rawJaText.replace(/```.*?\n/g, '').replace(/```/g, '').trim();
    const parts = cleanRawJa.split(/(\[OPTION [AB]:.*?\])/);
    const storyBody = parts[0].replace(/[\n\r\t]+/g, '').trim();
    cleanRawJa = storyBody + (parts.length > 1 ? '\n' + parts.slice(1).join('').trim() : '');

    let optA = "";
    let optB = "";
    const optionRegex = /\[OPTION ([AB]):\s*(.*?)\]/g;
    const matches = [...cleanRawJa.matchAll(optionRegex)];
    if (matches.length >= 2) {
        optA = matches[0][2].trim();
        optB = matches[1][2].trim();
    }

    const cleanStoryText = cleanRawJa.replace(optionRegex, '').trim();
    const tempBlockId = storyData.blocks.length;

    // Create a temporary block
    const tempBlock = {
        id: tempBlockId,
        rawJa: cleanRawJa,
        enrichedData: {
            words: [{ surface: cleanStoryText }],
            sentences: [],
            optionWords: {
                A: [{ surface: optA }],
                B: [{ surface: optB }]
            },
            optionTranslations: {
                A: "",
                B: ""
            }
        },
        imageUrl: null,
        selectedOption: null,
        isProcessing: true
    };

    // --- CRITICAL FIX: SAVE TO STORAGE IMMEDIATELY ---
    // We must update the array and Save to localStorage so viewer_ui can see it
    // when it re-renders.
    storyData.blocks.push(tempBlock);
    stories[storyIndex] = storyData;
    saveStoryList(stories);

    // Alert the UI to render the raw text immediately
    if (onRawTextReady) {
        onRawTextReady();
    }

    try {
        const enrichedData = await processTextPipeline(cleanRawJa, onProgress);

        let imageUrl = null;
        if (settings.generateImages) {
            onProgress(6, "Drawing the manga panel...");
            try {
                imageUrl = await generateImage(enrichedData.imagePrompt);
            } catch (e) {
                console.error("Image generation failed, continuing without image.", e);
            }
        } else {
            console.log("Image generation skipped due to settings.");
        }

        const finalBlock = {
            id: tempBlockId,
            rawJa: cleanRawJa,
            enrichedData: enrichedData,
            imageUrl: imageUrl,
            selectedOption: null
        };

        // Re-fetch list to ensure we rely on fresh state (safe against race conditions)
        stories = getStoryList();
        storyIndex = stories.findIndex(s => s.id === activeStoryId);
        
        if (storyIndex !== -1) {
            const currentStoryData = stories[storyIndex];
            // Find the index of our temp block
            const blockIndex = currentStoryData.blocks.findIndex(b => b.id === tempBlockId);
            
            if (blockIndex !== -1) {
                currentStoryData.blocks[blockIndex] = finalBlock;
                stories[storyIndex] = currentStoryData;
                saveStoryList(stories);
            } else {
                // Fallback if index somehow shifted: append
                currentStoryData.blocks.push(finalBlock);
                stories[storyIndex] = currentStoryData;
                saveStoryList(stories);
            }
        }

        onProgress(100, "Ready!");
        return finalBlock;

    } catch (err) {
        // Rollback: Remove the temporary block if NLP fails so we don't leave a broken block
        stories = getStoryList();
        storyIndex = stories.findIndex(s => s.id === activeStoryId);
        if (storyIndex !== -1) {
            const currentStoryData = stories[storyIndex];
            currentStoryData.blocks = currentStoryData.blocks.filter(b => b.id !== tempBlockId);
            stories[storyIndex] = currentStoryData;
            saveStoryList(stories);
        }
        throw err;
    }
}

export async function regenerateLastBlock(onProgress, onRawTextReady) {
    const stories = getStoryList();
    const storyIndex = stories.findIndex(s => s.id === activeStoryId);
    if (storyIndex === -1) throw new Error("Active story not found.");
    
    const storyData = stories[storyIndex];
    if (storyData.blocks.length === 0) throw new Error("No block to regenerate.");

    storyData.blocks.pop();
    
    let chosenOption = null;
    if (storyData.blocks.length > 0) {
        const previousBlock = storyData.blocks[storyData.blocks.length - 1];
        chosenOption = previousBlock.selectedOption;
    }

    stories[storyIndex] = storyData;
    saveStoryList(stories);

    return await generateNextBlock(chosenOption, onProgress, onRawTextReady);
}