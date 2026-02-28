import { initSettings } from './settings.js';
import { initViewer } from './viewer_ui.js';
import { initSRS } from './srs_ui.js';
import { initWordManager } from './word_manager.js'; 

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
                if (v.id === target) v.classList.add('active');
            });
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
});