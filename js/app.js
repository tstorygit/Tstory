import { initSettings } from './settings.js';
import { initViewer, rerenderCurrentBlock } from './viewer_ui.js';
import { initSRS } from './srs_ui.js';
import { initWordManager } from './word_manager.js'; 
import { initDataManager } from './data_ui.js';
import { initTrainer } from './trainer_ui.js';
import { initGames } from './games_ui.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Navigation
    const navButtons = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            
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
            .then(() => console.log("Service Worker Registered"));
    }

    // 3. Initialize Modules
    initSettings();
    initViewer();
    initSRS();
    initWordManager();
    initDataManager();
    initTrainer();
    initGames();
});