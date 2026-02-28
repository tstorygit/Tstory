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

export async function createNewStory(theme, onProgress) {
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

    return await generateNextBlock(null, onProgress);
}

export async function generateNextBlock(chosenOption, onProgress) {
    const stories = getStoryList();
    const storyIndex = stories.findIndex(s => s.id === activeStoryId);
    if (storyIndex === -1) throw new Error("Active story not found in storage.");
    
    const storyData = stories[storyIndex];

    onProgress(0, "Drafting the next part of the story...");

    // Build vocabulary hint list based on SRS mode.
    // 'none'  → disable entirely, no words injected into prompt
    // 'new'   → focus on low-status words (0–2) the user hasn't learned yet
    // 'mix'   → default: oldest-updated words across all statuses
    let targetWords = [];
    if (settings.srsMode !== 'none') {
        let srsCriteria = { limit: 5 };
        if (settings.srsMode === 'new') {
            srsCriteria.maxStatus = 2;
        }
        targetWords = srsDb.getFilteredWords(srsCriteria).map(w => w.word);
    }
    
    // --- CONSTRUCT PROMPTS ---

    // 1. SYSTEM PROMPT — invariant rules only. Keep the user prompt lean.
    const systemInstruction = `You are a Japanese visual novel writer.

STRICT RULES:
1. Write exactly 4 to 6 sentences of Japanese text.
2. Language level: JLPT N4-N3. Focus on dialogue and character actions. Avoid elaborate scene descriptions.
3. After the story sentences, you MUST append exactly two continuation options IN JAPANESE formatted like this:
[OPTION A: 日本語で選択肢の説明]
[OPTION B: 日本語で選択肢の説明]
4. Output ONLY the Japanese story text followed by the two bracketed options. No English commentary, no greetings, no explanations.`;

    // 2. USER PROMPT — dynamic context only
    let userPrompt = `Theme: ${storyData.themePrompt}`;

    if (targetWords.length > 0) {
        userPrompt += `\nTry to naturally include these vocabulary words: ${targetWords.join(", ")}`;
    }

    if (chosenOption && storyData.blocks.length > 0) {
        const lastBlock = storyData.blocks[storyData.blocks.length - 1];
        lastBlock.selectedOption = chosenOption;
        userPrompt += `\n\nPrevious story context:\n${lastBlock.rawJa}\n\nPlayer chose: ${chosenOption}\n\nWrite the next 4-6 sentences.`;
    } else {
        userPrompt += `\n\nWrite the opening 4-6 sentences.`;
    }

    const rawJaText = await generateText(userPrompt, systemInstruction, false);
    
    // --- CLEANUP ---
    // Remove markdown code fences
    let cleanRawJa = rawJaText.replace(/```.*?\n/g, '').replace(/```/g, '').trim();
    
    // Split options away from the Japanese body so we can sanitize each independently.
    // The regex captures the option tags so slice(1) retains them.
    const parts = cleanRawJa.split(/(\[OPTION [AB]:.*?\])/);
    // Strip ALL newlines/whitespace from the story body — the tokenizer must never see \n tokens.
    const storyBody = parts[0].replace(/[\n\r\t]+/g, '').trim();
    // Re-join: story body + options (each option on its own line for the regex in text_manager)
    cleanRawJa = storyBody + '\n' + parts.slice(1).join('\n');

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

    const newBlock = {
        id: storyData.blocks.length,
        rawJa: cleanRawJa,
        enrichedData: enrichedData,
        imageUrl: imageUrl,
        selectedOption: null
    };

    storyData.blocks.push(newBlock);
    
    stories[storyIndex] = storyData;
    saveStoryList(stories);

    onProgress(100, "Ready!");
    return newBlock;
}

export async function regenerateLastBlock(onProgress) {
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

    return await generateNextBlock(chosenOption, onProgress);
}