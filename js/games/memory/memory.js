// memory.js — Memory Match entry point (init/launch lifecycle).
import { initSetup, refreshSetupCoins } from './memory_setup.js';
import { startBoard } from './memory_board.js';
import { initShop, openShop } from './memory_shop.js';

let _screens = null;
let _onExitGlobal = null;

// Sub-views created inside the single screen games_ui gives us
let _viewSetup, _viewGame, _viewShop;

function _injectCSS() {
    if (!document.getElementById('memory-styles')) {
        const link = document.createElement('link');
        link.id = 'memory-styles';
        link.rel = 'stylesheet';
        link.href = './js/games/memory/memory.css';
        document.head.appendChild(link);
    }
}

export function init(screens, onExit) {
    _injectCSS();

    const root = screens.setup;

    // The screen div already gets flex:1 / min-height:0 / overflow-y:auto from
    // games_ui. We turn it into a flex column and let each sub-view manage its
    // own scrolling (forcing height:100% here fights the app-shell flexbox).
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.overflow = 'hidden';

    root.innerHTML = `
        <div id="mem-container-setup" style="width:100%; flex:1; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch;"></div>
        <div id="mem-container-game" style="display:none; position:relative; width:100%; flex:1; min-height:0; flex-direction:column; overflow:hidden;"></div>
        <div id="mem-container-shop" class="mem-shop-overlay" style="display:none;"></div>
    `;

    _viewSetup = root.querySelector('#mem-container-setup');
    _viewGame = root.querySelector('#mem-container-game');
    _viewShop = root.querySelector('#mem-container-shop');

    _screens = screens;
    _onExitGlobal = onExit;

    initShop(_viewShop);
    initSetup(_viewSetup, _handleStartGame, _handleOpenShop, _handleExit);
}

function _handleExit() {
    if (_onExitGlobal) _onExitGlobal(); // back to the games list
}

export function launch() {
    _show('setup');
}

function _show(viewName) {
    // games_ui hides all game screens when returning to the list — re-show ours.
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

    if (viewName === 'setup') refreshSetupCoins();
}

function _handleStartGame(validWords, config) {
    _show('game');
    startBoard(_viewGame, validWords, config, () => {
        _show('setup'); // return to setup on quit/finish
    });
}

function _handleOpenShop() {
    openShop(() => {
        refreshSetupCoins(); // coins may have been spent in the shop
    });
}
