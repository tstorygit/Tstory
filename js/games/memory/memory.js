// memory.js
import { initSetup } from './memory_setup.js';
import { startBoard } from './memory_board.js';
import { initShop, openShop } from './memory_shop.js';

let _screens = null;
let _onExitGlobal = null;

// Dynamically create containers inside the provided main screen
let _viewSetup, _viewGame, _viewShop;

export function init(screens, onExit) {
    const root = screens.setup; 
    root.innerHTML = `
        <div id="mem-container-setup"></div>
        <div id="mem-container-game" style="display:none; height:100%; flex-direction:column;"></div>
        <div id="mem-container-shop" class="mem-shop-overlay" style="display:none;"></div>
    `;

    _viewSetup = root.querySelector('#mem-container-setup');
    _viewGame = root.querySelector('#mem-container-game');
    _viewShop = root.querySelector('#mem-container-shop');
    
    _screens = screens;
    _onExitGlobal = onExit;

    initShop(_viewShop);
    initSetup(_viewSetup, _handleStartGame, _handleOpenShop);
}

export function launch() {
    _show('setup');
    const hdr = document.getElementById('games-header-title');
    if (hdr) hdr.textContent = 'Memory — Setup';
}

function _show(viewName) {
    // CRITICAL FIX: Ensure the outer wrapper is visible
    if (_screens && _screens.setup) {
        _screens.setup.style.display = 'block';
    }

    _viewSetup.style.display = viewName === 'setup' ? 'block' : 'none';
    _viewGame.style.display = viewName === 'game' ? 'flex' : 'none';
    
    const hdr = document.getElementById('games-header-title');
    if (hdr) {
        if (viewName === 'setup') hdr.textContent = 'Memory — Setup';
        if (viewName === 'game') hdr.textContent = 'Memory — Match!';
    }
}

function _handleStartGame(validWords, config) {
    _show('game');
    startBoard(_viewGame, validWords, config, () => {
        _show('setup'); 
    });
}

function _handleOpenShop() {
    openShop(() => {
        // Shop handles its own closing internally
    });
}