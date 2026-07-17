import { initSettings, applyTheme, settings } from './settings.js';
import { initViewer, rerenderCurrentBlock } from './viewer_ui.js';
import { initSRS } from './srs_ui.js';
import { initWordManager } from './word_manager.js'; 
import { initDataManager } from './data_ui.js';
import { initTrainer } from './trainer_ui.js';
import { initGames, suspendAllGames } from './games_ui.js';
import { initPopup } from './popup_manager.js';
import { initDSA } from './dsa_ui.js';
import { stopSpeech } from './tts_api.js';

document.addEventListener('DOMContentLoaded', () => {
    // 0. Quick-apply theme before heavy initialization to prevent flash of wrong theme
    const saved = localStorage.getItem('ai_reader_settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.theme) applyTheme(parsed.theme);
        } catch (e) {}
    } else {
        applyTheme('system');
    }

    // 1. Initialize Navigation
    const navButtons = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');

            // Stop any in-flight TTS audio when leaving a view
            stopSpeech();

            // Suspend running games (rAF loops, autosave timers) when
            // navigating away from the Games tab via the nav menu.
            if (target !== 'view-games') suspendAllGames();

            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            views.forEach(v => {
                v.classList.remove('active');
                v.style.display = '';  // clear any inline style set by trainer_ui or other modules
                if (v.id === target) v.classList.add('active');
            });

            // Re-render reader word colours if SRS grades changed since last visit
            if (target === 'view-story' && sessionStorage.getItem('srs-dirty')) {
                sessionStorage.removeItem('srs-dirty');
                rerenderCurrentBlock();
            }
        });
    });

    // 2. Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log("Service Worker Registered"))
            .catch(err => console.warn("Service Worker registration failed:", err));
    }

    // 3. Initialize Modules
    initPopup();
    initSettings();
    initViewer();
    initSRS();
    initWordManager();
    initDataManager();
    initTrainer();
    initGames();
    initDSA();
});