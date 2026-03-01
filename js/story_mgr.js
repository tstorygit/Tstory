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
        blocks: [],
        type: 'generated'
    };

    stories.push(newStory);
    saveStoryList(stories);
    
    activeStoryId = newStory.id;

    return await generateNextBlock(null, onProgress, onRawTextReady);
}

export async function createStoryFromRawText(rawText, onProgress, onRawTextReady, storyType = 'imported') {
    const stories = getStoryList();
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let title = lines.length > 0 ? lines[0] : "Imported Text";
    if (title.length > 30) title = title.substring(0, 30) + "...";

    const newStory = {
        id: Date.now().toString(),
        title: title,
        themePrompt: storyType === 'imported-photo' ? "Imported from Photo" : "Imported Raw Text",
        type: storyType,
        created: new Date().toISOString(),
        blocks: []
    };

    const tempBlockId = 0;
    const tempBlock = {
        id: tempBlockId,
        rawJa: rawText,
        enrichedData: {
            words: [{ surface: rawText }],
            sentences: [],
            optionWords: {},
            optionTranslations: {}
        },
        imageUrl: null,
        selectedOption: null,
        isProcessing: true
    };

    newStory.blocks.push(tempBlock);
    stories.push(newStory);
    saveStoryList(stories);
    
    activeStoryId = newStory.id;

    if (onRawTextReady) {
        onRawTextReady();
    }

    try {
        const enrichedData = await processTextPipeline(rawText, onProgress, true);
        
        let imageUrl = null;
        if (settings.generateImages) {
            onProgress(6, "Drawing illustration...");
            try {
                imageUrl = await generateImage(enrichedData.imagePrompt);
            } catch (e) {
                console.error("Image generation failed, continuing without image.", e);
            }
        }

        const finalBlock = {
            id: tempBlockId,
            rawJa: rawText,
            enrichedData: enrichedData,
            imageUrl: imageUrl,
            selectedOption: null
        };

        let freshStories = getStoryList();
        let storyIndex = freshStories.findIndex(s => s.id === activeStoryId);
        if (storyIndex !== -1) {
            freshStories[storyIndex].blocks[0] = finalBlock;
            saveStoryList(freshStories);
        }

        onProgress(100, "Ready!");
        return finalBlock;

    } catch (err) {
        deleteStory(newStory.id);
        throw err;
    }
}

export async function createStoryFromImage(base64Data, mimeType, onProgress, onRawTextReady) {
    onProgress(0, "Reading Japanese text from image...");
    
    // Explicitly command the AI to preserve layout and structural lines
    const prompt = "Extract all Japanese text from this image. Output ONLY the Japanese text. Do not translate. CRITICAL: Preserve the exact visual layout, including line breaks, paragraphs, and headers. If text is visually separated or on a new line in the image, it MUST be on a new line in your output. Do not add any English text, markdown formatting, or explanations.";
    
    let extractedText = "";
    try {
        extractedText = await generateText(prompt, "", false, { mimeType, data: base64Data });
    } catch (e) {
        throw new Error("Failed to extract text from image: " + e.message);
    }
    
    if (!extractedText || !extractedText.trim()) {
        throw new Error("No text could be found in the image.");
    }
    
    extractedText = extractedText.replace(/```.*?\n/g, '').replace(/```/g, '').trim();
    
    return await createStoryFromRawText(extractedText, onProgress, onRawTextReady, 'imported-photo');
}

export async function generateNextBlock(chosenOption, onProgress, onRawTextReady) {
    let stories = getStoryList();
    let storyIndex = stories.findIndex(s => s.id === activeStoryId);
    if (storyIndex === -1) throw new Error("Active story not found in storage.");
    
    const storyData = stories[storyIndex];

    onProgress(0, "Drafting the next part of the story...");

    let targetWords = [];
    if (settings.srsMode !== 'none') {
        let srsCriteria = { limit: 5 };
        if (settings.srsMode === 'new') {
            srsCriteria.maxStatus = 2;
        }
        targetWords = srsDb.getFilteredWords(srsCriteria).map(w => w.word);
    }
    
    const customLevel = settings.customPromptParams || 'JLPT N4';
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

        const cleanHistory = lastBlock.rawJa.replace(/\[OPTION [AB]:[\s\S]*?\]/g, '').trim();
        const cleanChoice = chosenOption.replace(/^[AB]:\s*/, '').trim();

        userPrompt += `\n\nPrevious story context:\n${cleanHistory}`;
        userPrompt += `\n\nCRITICAL INSTRUCTION: The story continues from the choice: "${cleanChoice}".`;
        userPrompt += `\nWrite the next 4-6 sentences based on this choice.`;
    } else {
        userPrompt += `\n\nWrite the opening 4-6 sentences.`;
    }

    const rawJaText = await generateText(userPrompt, systemInstruction, false);
    
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

    storyData.blocks.push(tempBlock);
    stories[storyIndex] = storyData;
    saveStoryList(stories);

    if (onRawTextReady) {
        onRawTextReady();
    }

    try {
        const enrichedData = await processTextPipeline(cleanRawJa, onProgress, false);

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

        stories = getStoryList();
        storyIndex = stories.findIndex(s => s.id === activeStoryId);
        
        if (storyIndex !== -1) {
            const currentStoryData = stories[storyIndex];
            const blockIndex = currentStoryData.blocks.findIndex(b => b.id === tempBlockId);
            
            if (blockIndex !== -1) {
                currentStoryData.blocks[blockIndex] = finalBlock;
                stories[storyIndex] = currentStoryData;
                saveStoryList(stories);
            } else {
                currentStoryData.blocks.push(finalBlock);
                stories[storyIndex] = currentStoryData;
                saveStoryList(stories);
            }
        }

        onProgress(100, "Ready!");
        return finalBlock;

    } catch (err) {
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

    if (storyData.type === 'imported' || storyData.type === 'imported-photo') {
        const block = storyData.blocks[storyData.blocks.length - 1];
        block.isProcessing = true;
        saveStoryList(stories);
        
        if (onRawTextReady) onRawTextReady();

        try {
            const enrichedData = await processTextPipeline(block.rawJa, onProgress, true);
            let imageUrl = block.imageUrl;
            
            if (!imageUrl && settings.generateImages) {
                onProgress(6, "Drawing illustration...");
                try {
                    imageUrl = await generateImage(enrichedData.imagePrompt);
                } catch (e) {
                    console.error("Image generation failed, continuing without image.", e);
                }
            }
            
            block.enrichedData = enrichedData;
            block.imageUrl = imageUrl;
            block.isProcessing = false;
            
            let freshStories = getStoryList();
            let freshStoryIndex = freshStories.findIndex(s => s.id === activeStoryId);
            if (freshStoryIndex !== -1) {
                freshStories[freshStoryIndex].blocks[freshStories[freshStoryIndex].blocks.length - 1] = block;
                saveStoryList(freshStories);
            }
            
            onProgress(100, "Ready!");
            return block;
        } catch (err) {
            block.isProcessing = false;
            saveStoryList(stories);
            throw err;
        }
    } else {
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
}