// js/games/legend/legend.js

import { mountVocabSelector } from '../../vocab_selector.js';
import { GameVocabManager } from '../../game_vocab_mgr.js';
import { showGameQuiz } from '../../game_vocab_mgr_ui.js';
import { generateStage } from './leg_map.js';
import { initEngine, stopEngine } from './leg_engine.js';
import { initInput, cleanupInput } from './leg_input.js';
import { initUI, updateHUD } from './leg_ui.js';
import { PERKS } from './leg_entities.js';

let _screens = null;
let _onExit = null;
let _vocabMgr = null;

let gameState = {
    stage: 1,
    roomX: 0, roomY: 0,
    player: {
        x: 100, y: 100,
        dirX: 0, dirY: 1, 
        level: 1, exp: 0, nextExp: 15, // Fast leveling (Level * 15)
        hp: 100, maxHp: 100, mp: 50, maxMp: 50,
        str: 5, def: 5, agi: 5, wis: 5,
        equippedWeapon: 'sword',
        attackTimer: 0, invincibility: 0,
        potions: 3
    },
    unlockedWeapons: ['sword'], 
    magicMode: false,
    statPoints: 0,
    ap: 0,
    perks: {},
    isPaused: false,
    lastDodgeTime: 0
};

export function init(screens, onExit) {
    _screens = screens; 
    _onExit = onExit;
    _injectStyles();
    
    _screens.setup.innerHTML = `<div id="leg-deck-selector"></div>`;
    _screens.game.innerHTML = `
        <div id="leg-ui-layer" style="position:absolute;inset:0;pointer-events:none;z-index:20;"></div>
        <div class="leg-canvas-wrap">
            <canvas id="leg-canvas"></canvas>
        </div>
    `;
    
    initUI(_screens.game.querySelector('#leg-ui-layer'), {
        getState: () => gameState,
        onPause: () => gameState.isPaused = true,
        onResume: () => gameState.isPaused = false,
        onToggleMagic: () => gameState.magicMode = !gameState.magicMode,
        onEquipWeapon: (w) => gameState.player.equippedWeapon = w,
        onUsePotion: () => {
            if (gameState.player.potions > 0 && gameState.player.hp < gameState.player.maxHp) {
                gameState.player.potions--;
                gameState.player.hp = Math.min(gameState.player.maxHp, gameState.player.hp + 50);
                updateHUD(gameState);
            }
        },
        onAddStat: (s) => { 
            if (gameState.statPoints > 0) {
                gameState.statPoints--; 
                gameState.player[s]++; 
                applyStats(); 
                updateHUD(gameState);
            }
        },
        onBuyPerk: (p) => { 
            if (gameState.ap >= PERKS[p].cost) { 
                gameState.ap -= PERKS[p].cost; 
                gameState.perks[p] = (gameState.perks[p]||0)+1; 
                applyStats(); 
                saveMeta();
            } 
        },
        onRebirth: () => doRebirth(),
        onExitGame: () => {
            stopEngine();
            cleanupInput();
            if (_vocabMgr && !_vocabMgr.isGlobalSrs) {
                _vocabMgr.exportToAppSrs(null, 'skip');
            }
            saveMeta();
            _onExit();
        }
    });
    
    initInput(_screens.game.querySelector('.leg-canvas-wrap'));
}

export function launch() {
    loadMeta();
    const sel = mountVocabSelector(_screens.setup.querySelector('#leg-deck-selector'), { defaultCount: 'All', title: 'Legend of Vocab' });
    const btn = document.createElement('button');
    btn.className = 'primary-btn'; btn.textContent = '▶ Start Quest';
    btn.style.marginTop = '10px';
    btn.onclick = async () => {
        const queue = await sel.getQueue();
        if (!queue.length) return;
        _vocabMgr = new GameVocabManager(GameVocabManager.defaultConfig());
        _vocabMgr.setPool(queue, 'leg_banned');
        startGame();
    };
    sel.getActionsEl().appendChild(btn);
    _screens.setup.style.display = 'block';
    _screens.game.style.display = 'none';
}

function startGame() {
    _screens.setup.style.display = 'none';
    _screens.game.style.display = 'flex';
    
    applyStats();
    gameState.player.hp = gameState.player.maxHp;
    gameState.player.mp = gameState.player.maxMp;
    
    const map = generateStage(gameState.stage);
    initEngine(_screens.game.querySelector('#leg-canvas'), gameState, map);
    
    gameState.callbacks = {
        onUIUpdate: () => updateHUD(gameState),
        onTakeDamage: (dmg, enemy) => handleDamage(dmg, enemy),
        onExpGained: () => checkLevelUp(),
        onItemFound: (type, wid) => handleLootDrop(type, wid),
        onNextStage: () => { gameState.stage++; saveMeta(); startGame(); }
    };
    
    updateHUD(gameState);
}

function handleDamage(baseDamage, enemy) {
    const now = performance.now();
    const dodgeCooldown = Math.max(1000, 5000 - (gameState.perks.dodge || 0) * 500); 
    
    if (now - gameState.lastDodgeTime > dodgeCooldown) {
        gameState.isPaused = true;
        _vocabMgr.pause();
        
        showGameQuiz(_vocabMgr, {
            container: _screens.game.querySelector('#leg-ui-layer'),
            title: '🛡️ Lucky Dodge!',
            titleColor: '#3498db',
            subtitle: 'Answer correctly to parry the attack!',
            onAnswer: (isCorrect, word, res) => {
                if (isCorrect) {
                    gameState.player.invincibility = 2.0; 
                    enemy.x += (enemy.x - gameState.player.x) * 0.5;
                    enemy.y += (enemy.y - gameState.player.y) * 0.5;
                } else {
                    gameState.player.hp -= baseDamage;
                    gameState.player.invincibility = 1.0;
                }
                gameState.lastDodgeTime = performance.now();
                _vocabMgr.resume();
                gameState.isPaused = false;
                checkDeath();
                updateHUD(gameState);
            }
        });
    } else {
        gameState.player.hp -= baseDamage;
        gameState.player.invincibility = 1.0;
        checkDeath();
        updateHUD(gameState);
    }
}

function checkLevelUp() {
    if (gameState.player.exp >= gameState.player.nextExp && gameState.player.level < 999) {
        gameState.player.exp -= gameState.player.nextExp;
        // Fast scaling: 15, 30, 45, 60... Very easy to reach 999 over time.
        gameState.player.nextExp = Math.floor(15 * gameState.player.level); 
        
        gameState.isPaused = true;
        _vocabMgr.pause();
        
        showGameQuiz(_vocabMgr, {
            container: _screens.game.querySelector('#leg-ui-layer'),
            title: '✨ Level Up!',
            titleColor: '#f1c40f',
            subtitle: 'Answer perfectly for +3 Stat Points!',
            onAnswer: (isCorrect, word, res) => {
                gameState.player.level++;
                gameState.statPoints += isCorrect ? 3 : 1;
                gameState.player.hp = gameState.player.maxHp; 
                gameState.player.mp = gameState.player.maxMp;
                _vocabMgr.resume();
                gameState.isPaused = false;
                updateHUD(gameState);
                const menuBtn = document.getElementById('leg-btn-menu');
                if (menuBtn) { menuBtn.style.borderColor = '#e74c3c'; setTimeout(() => menuBtn.style.borderColor='', 2000); }
            }
        });
    }
    updateHUD(gameState);
}

function handleLootDrop(type, weaponId) {
    if (type === 'potion') {
        gameState.player.potions++;
    } else if (type === 'weapon') {
        if (!gameState.unlockedWeapons.includes(weaponId)) {
            gameState.unlockedWeapons.push(weaponId);
            // Non blocking alert for finding a new item so game flows well
            const fx = document.createElement('div');
            fx.textContent = `You found the ${weaponId.toUpperCase()}!`;
            fx.style.cssText = 'position:fixed;top:50px;left:50%;transform:translateX(-50%);background:#f1c40f;color:#000;padding:10px 20px;border-radius:10px;font-weight:bold;z-index:9999;box-shadow:0 5px 15px rgba(0,0,0,0.5);';
            document.body.appendChild(fx);
            setTimeout(() => fx.remove(), 3000);
        }
    }
    updateHUD(gameState);
}

function checkDeath() {
    if (gameState.player.hp <= 0) {
        stopEngine();
        document.getElementById('leg-ap-gain').textContent = Math.floor(gameState.player.level / 10);
        document.getElementById('leg-rebirth-overlay').style.display = 'flex';
    }
}

function doRebirth() {
    const apGain = Math.floor(gameState.player.level / 10);
    gameState.ap += apGain;
    
    gameState.stage = 1;
    gameState.player.level = 1;
    gameState.player.exp = 0;
    gameState.player.nextExp = 15;
    gameState.player.str = 5; gameState.player.def = 5; gameState.player.agi = 5; gameState.player.wis = 5;
    gameState.statPoints = 0;
    gameState.unlockedWeapons = ['sword'];
    gameState.player.equippedWeapon = 'sword';
    gameState.player.potions = 3;
    gameState.magicMode = false;
    
    saveMeta();
    startGame();
}

function applyStats() {
    const p = gameState.player;
    const perkHp = (gameState.perks.hp || 0) * 50;
    const perkMp = (gameState.perks.mp || 0) * 20;
    
    p.maxHp = 100 + (p.level * 10) + (p.def * 5) + perkHp;
    p.maxMp = 50 + (p.wis * 10) + perkMp;
    p.expBonus = (gameState.perks.exp || 0) * 0.1;
}

function loadMeta() {
    try { 
        const raw = localStorage.getItem('leg_meta');
        if (raw) {
            const parsed = JSON.parse(raw);
            gameState.ap = parsed.ap || 0;
            gameState.perks = parsed.perks || {};
            if (parsed.unlockedWeapons) gameState.unlockedWeapons = parsed.unlockedWeapons;
            if (parsed.player) Object.assign(gameState.player, parsed.player);
            gameState.stage = parsed.stage || 1;
        }
    } catch {}
}

function saveMeta() {
    localStorage.setItem('leg_meta', JSON.stringify({ 
        ap: gameState.ap, 
        perks: gameState.perks,
        unlockedWeapons: gameState.unlockedWeapons,
        player: gameState.player,
        stage: gameState.stage
    }));
}

function _injectStyles() {
    if (!document.getElementById('leg-styles')) {
        const link = document.createElement('link');
        link.id = 'leg-styles'; link.rel = 'stylesheet'; link.href = './js/games/legend/legend.css';
        document.head.appendChild(link);
    }
}