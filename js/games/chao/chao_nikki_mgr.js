// js/games/chao/chao_nikki_mgr.js

import { generateText } from '../../ai_api.js';
import { processTextPipeline } from '../../text_manager.js';
import { getChiTrueStat } from './chao_state.js';

export async function generateNikkiEntry(chi, recentWords = [], onProgress = () => {}) {
    onProgress("Thinking about today...");
    
    // Scale grammar complexity based on true Wisdom stat (0 to 9999)
    let grammarLevel = "";
    const w = getChiTrueStat(chi, 'wisdom');
    
    if (w <= 500) {
        grammarLevel = "Use ONLY Hiragana and Katakana. DO NOT USE ANY KANJI. Talk like a toddler. Keep it extremely simple. IMPORTANT: Insert spaces between words (Wakachigaki / 分かち書き).";
    } else if (w <= 1500) {
        grammarLevel = "Use mostly Hiragana, with only a few basic grade 1 Kanji (like 一, 日, 木, 猫). Talk like a young child.";
    } else if (w <= 4000) {
        grammarLevel = "Use simple Japanese equivalent to JLPT N5 or N4. Short, basic sentences.";
    } else if (w <= 7000) {
        grammarLevel = "Use conversational Japanese equivalent to JLPT N3.";
    } else {
        grammarLevel = "Use natural, expressive Japanese equivalent to JLPT N2 or N1. You are highly intelligent and eloquent.";
    }

    const dna = chi.dna;
    const topTrait = Object.keys(dna).reduce((a, b) => dna[a] > dna[b] ? a : b);

    let systemPrompt = `You are a virtual pet named ${chi.name}. You live in a virtual garden.
Write a diary entry for today. EXACTLY 3 to 4 sentences in Japanese. No English.
CRITICAL GRAMMAR RULE: ${grammarLevel}
Your personality is defined by your highest genetic trait: ${topTrait} (on a scale of 0-100, your ${topTrait} is ${dna[topTrait]}).
Do not write options, choices, or descriptions of UI elements. Just a simple, emotional, or funny diary entry from your perspective in the first-person.`;

    if (chi.equippedHat) {
        systemPrompt += `\nYou are currently wearing a ${chi.equippedHat} on your head. Mention how much you like it!`;
    }

    let userPrompt = "Write today's diary entry.";
    
    if (recentWords && recentWords.length > 0) {
        userPrompt += ` Today, your owner studied these Japanese words: ${recentWords.join(', ')}. Mention one or two of them naturally if you can. Maybe ask what they mean, or try to use them in a funny context.`;
    }

    const rawJaText = await generateText(userPrompt, systemPrompt, false);
    
    onProgress("Writing it down...");
    
    const enrichedData = await processTextPipeline(rawJaText, onProgress, true);

    const entry = {
        id: 'nikki_' + Date.now() + Math.floor(Math.random() * 1000),
        date: Date.now(),
        rawJa: rawJaText,
        enrichedData: enrichedData
    };

    if (!chi.diaryEntries) chi.diaryEntries = [];
    chi.diaryEntries.push(entry);

    return entry;
}