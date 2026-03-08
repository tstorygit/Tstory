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
    
    // CRITICAL FIX: Force the root container to take full width and height
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';

    root.innerHTML = `
        <div id="mem-container-setup" style="width: 100%; flex: 1; overflow-y: auto;"></div>
        <div id="mem-container-game" style="display:none; width: 100%; height: 100%; flex-direction: column; flex: 1; overflow: hidden;"></div>
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
    if (_screens && _screens.setup) {
        _screens.setup.style.display = 'flex';
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