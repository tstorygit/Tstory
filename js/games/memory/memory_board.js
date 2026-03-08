// memory_board.js
import { getState, addCoins, getEquippedIcon } from './memory_state.js';

let _container = null;
let _onQuit = null;
let _cards = [];
let _flippedCards = [];
let _matchedPairs = 0;
let _combo = 0;
let _isLocked = false;
let _sessionCoins = 0;
let _config = null;

export function startBoard(container, validWords, config, onQuitCallback) {
    _container = container;
    _config = config;
    _onQuit = onQuitCallback;
    _flippedCards = [];
    _matchedPairs = 0;
    _combo = 0;
    _isLocked = false;
    _sessionCoins = 0;

    _generateDeck(validWords);
    _renderBoard();
}

function _generateDeck(validWords) {
    const subset = [...validWords].sort(() => Math.random() - 0.5).slice(0, _config.layout / 2);
    
    let rawCards = [];
    subset.forEach(w => {
        rawCards.push({ id: w.word, text: w.word, type: 'kanji' });
        const targetText = _config.mode === 'meaning' ? w.trans : w.furi;
        rawCards.push({ id: w.word, text: targetText, type: 'target' });
    });

    _cards = rawCards.sort(() => Math.random() - 0.5).map((c, index) => ({
        ...c,
        instanceId: `card_${index}`,
        isFlipped: false,
        isMatched: false
    }));
}

function _renderBoard() {
    const icon = getEquippedIcon();
    const state = getState();

    let html = `
        <div class="mem-board-header">
            <div>
                <span class="mem-stat-label">Coins</span>
                <span class="mem-stat-val" id="mem-hud-coins">🪙 ${state.coins.toLocaleString()}</span>
            </div>
            <div>
                <span class="mem-stat-label">Combo</span>
                <span class="mem-stat-val mem-combo-text" id="mem-hud-combo">${_combo}x</span>
            </div>
            <button class="caro-back-btn" style="width:auto; padding:4px 10px; margin:0;" id="mem-btn-quit">Quit</button>
        </div>
        
        <div class="mem-grid mem-grid-${_config.layout}" id="mem-grid">
            ${_cards.map(c => `
                <div class="mem-card" data-instance="${c.instanceId}">
                    <div class="mem-card-inner">
                        <div class="mem-face mem-face-down">${icon}</div>
                        <div class="mem-face mem-face-up">
                            <span class="${c.type === 'kanji' ? 'mem-text-large' : 'mem-text-small'}">${c.text}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div id="mem-victory-overlay" style="display:none;" class="mem-victory-overlay">
            <div class="mem-victory-box">
                <h2>🎉 Complete!</h2>
                <p>You matched all pairs.</p>
                <div class="mem-victory-coins">Earned: +<span id="mem-victory-earned">0</span> 🪙</div>
                <button class="primary-btn" id="mem-btn-finish" style="margin-top:15px;">Return</button>
            </div>
        </div>
    `;

    _container.innerHTML = html;

    _container.querySelector('#mem-btn-quit').addEventListener('click', _onQuit);
    
    _container.querySelectorAll('.mem-card').forEach(el => {
        el.addEventListener('click', (e) => _handleCardClick(e, el));
    });
}

function _handleCardClick(event, cardEl) {
    if (_isLocked) return;
    
    const instanceId = cardEl.getAttribute('data-instance');
    const cardData = _cards.find(c => c.instanceId === instanceId);

    if (cardData.isFlipped || cardData.isMatched) return;

    cardData.isFlipped = true;
    cardEl.classList.add('flipped');
    _flippedCards.push({ el: cardEl, data: cardData });

    if (_flippedCards.length === 2) {
        _isLocked = true;
        _checkMatch(event.clientX, event.clientY);
    }
}

function _checkMatch(clickX, clickY) {
    const [c1, c2] = _flippedCards;

    if (c1.data.id === c2.data.id) {
        c1.data.isMatched = true;
        c2.data.isMatched = true;
        _matchedPairs++;
        _combo++;

        const reward = 10 + (_combo * 5);
        _sessionCoins += reward;
        const newTotal = addCoins(reward);
        
        _container.querySelector('#mem-hud-coins').textContent = `🪙 ${newTotal.toLocaleString()}`;
        _container.querySelector('#mem-hud-combo').textContent = `${_combo}x`;
        _container.querySelector('#mem-hud-combo').classList.add('pop');
        setTimeout(() => _container.querySelector('#mem-hud-combo').classList.remove('pop'), 300);

        c1.el.classList.add('matched');
        c2.el.classList.add('matched');
        _spawnFloatingText(clickX, clickY, `+${reward} 🪙`);

        _flippedCards = [];
        _isLocked = false;

        if (_matchedPairs === _config.layout / 2) {
            setTimeout(_showVictory, 600);
        }
    } else {
        _combo = 0;
        _container.querySelector('#mem-hud-combo').textContent = `${_combo}x`;

        setTimeout(() => {
            c1.data.isFlipped = false;
            c2.data.isFlipped = false;
            c1.el.classList.remove('flipped');
            c2.el.classList.remove('flipped');
            
            _flippedCards = [];
            _isLocked = false;
        }, 1000);
    }
}

function _spawnFloatingText(x, y, text) {
    const fx = document.createElement('div');
    fx.className = 'mem-float-text';
    fx.textContent = text;
    fx.style.left = `${x}px`;
    fx.style.top = `${y - 30}px`;
    document.body.appendChild(fx); 
    setTimeout(() => fx.remove(), 1000);
}

function _showVictory() {
    _container.querySelector('#mem-victory-earned').textContent = _sessionCoins;
    _container.querySelector('#mem-victory-overlay').style.display = 'flex';
    _container.querySelector('#mem-btn-finish').addEventListener('click', _onQuit);
}