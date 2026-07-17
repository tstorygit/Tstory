// js/games/legend/legend.js

import { mountVocabSelector } from '../../vocab_selector.js';
import { GameVocabManager } from '../../game_vocab_mgr.js';
import { showGameQuiz } from '../../game_vocab_mgr_ui.js';
import { generateStage } from './leg_map.js';
import { initEngine, stopEngine } from './leg_engine.js';
import { initInput, cleanupInput } from './leg_input.js';
import { initUI, updateHUD, setVocabMgr, showDeathScreen, updateMinimap } from './leg_ui.js';
import { PERKS } from './leg_entities.js';

let _screens  = null;
let _onExit   = null;
let _vocabMgr = null;
let _runStats = null; // reset each startGame()

let gameState = {
    stage: 1,
    roomX: 0, roomY: 0,
    player: {
        x: 100, y: 100,
        dirX: 1, dirY: 0,
        level: 1, exp: 0, nextExp: 15,
        hp: 100, maxHp: 100, mp: 50, maxMp: 50,
        str: 5, def: 5, agi: 5, wis: 5,
        equippedWeapon: 'sword',
        attackTimer: 0, invincibility: 0,
        potions: 3
    },
    unlockedWeapons: ['sword'],
    magicMode:   false,
    statPoints:  0,
    ap:          0,
    perks:       {},
    isPaused:    false,
    secondWinds:    1,  // per-stage "cheat death via vocab" charges
    maxSecondWinds: 1,
};

export function init(screens, onExit) {
    _screens = screens;
    _onExit  = onExit;
    _injectStyles();

    _screens.setup.innerHTML = `<div id="leg-deck-selector"></div>`;
    _screens.game.innerHTML  = `
        <div id="leg-ui-layer" style="position:absolute;inset:0;pointer-events:none;z-index:20;"></div>
        <div class="leg-canvas-wrap">
            <canvas id="leg-canvas"></canvas>
        </div>
    `;

    initUI(_screens.game.querySelector('#leg-ui-layer'), {
        getState:      () => gameState,
        onPause:       () => { gameState.isPaused = true;  _vocabMgr?.pause();  },
        onResume:      () => { gameState.isPaused = false; _vocabMgr?.resume(); },
        onToggleMagic: () => gameState.magicMode = !gameState.magicMode,
        onEquipWeapon: (w) => gameState.player.equippedWeapon = w,
        onUsePotion:   () => {
            if (gameState.player.potions > 0 && gameState.player.hp < gameState.player.maxHp) {
                gameState.player.potions--;
                gameState.player.hp = Math.min(gameState.player.maxHp, gameState.player.hp + 50);
                _runStats.potionsUsed++;
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
                gameState.perks[p] = (gameState.perks[p] || 0) + 1;
                applyStats();
                saveMeta();
            }
        },
        onVocabConfigSave: (updatedConfig) => {
            // Merge the updated config back into the live manager and persist it.
            // The manager already has the new values applied by renderVocabSettings;
            // we just need to save them so they survive the next launch.
            Object.assign(_vocabMgr.config, updatedConfig);
            gameState._vocabConfig = { ...(_vocabMgr.config) };
            saveMeta();
        },
        onRebirth:   () => doRebirth(),
        onExitGame:  () => {
            stopEngine();
            cleanupInput();
            if (_vocabMgr) {
                gameState._vocabState  = _vocabMgr.exportState();
                gameState._vocabConfig = _vocabMgr.config;
                if (!_vocabMgr.isGlobalSrs) _vocabMgr.exportToAppSrs(null, 'skip');
            }
            saveMeta();
            _onExit();
        },
    }, _vocabMgr);

    initInput(_screens.game.querySelector('.leg-canvas-wrap'));
}

export function launch() {
    loadMeta();
    const sel = mountVocabSelector(
        _screens.setup.querySelector('#leg-deck-selector'),
        { defaultCount: 'All', title: 'Legend of Vocab' }
    );
    const btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.textContent = '▶ Start Quest';
    btn.style.marginTop = '10px';
    btn.onclick = async () => {
        const queue = await sel.getQueue();
        if (!queue.length) return;

        const savedConfig = gameState._vocabConfig || GameVocabManager.defaultConfig();
        _vocabMgr = new GameVocabManager(savedConfig);

        if (gameState._vocabState) _vocabMgr.importState(gameState._vocabState);

        _vocabMgr.setPool(queue, 'leg_banned');
        _vocabMgr.seedInitialWords(5);

        setVocabMgr(_vocabMgr);
        startGame();
    };
    sel.getActionsEl().appendChild(btn);
    _screens.setup.style.display = 'block';
    _screens.game.style.display  = 'none';
}

function startGame() {
    _screens.setup.style.display = 'none';
    _screens.game.style.display  = 'flex';

    // Keep the UI's vocabMgr reference current (matters after rebirth/stage advance)
    setVocabMgr(_vocabMgr);

    // Reset per-run stats
    _runStats = {
        startTime:    Date.now(),
        kills:        0,
        bossKills:    0,
        damageTaken:  0,
        roomsCleared: 0,
        potionsUsed:  0,
    };

    applyStats();
    gameState.player.hp = gameState.player.maxHp;
    gameState.player.mp = gameState.player.maxMp;
    gameState.secondWinds = gameState.maxSecondWinds;
    gameState.isPaused = false;

    // Guard against corrupted/old saves: never start with a locked weapon equipped
    if (!gameState.unlockedWeapons.includes(gameState.player.equippedWeapon)) {
        gameState.player.equippedWeapon = 'sword';
    }

    const map = generateStage(gameState.stage, gameState.unlockedWeapons);

    // IMPORTANT: callbacks must exist BEFORE initEngine — loadRoom fires
    // onRoomChange during engine init.
    gameState.callbacks = {
        onUIUpdate: () => updateHUD(gameState),

        onRoomChange: () => updateMinimap(gameState, map),

        // ── Room entry quiz (Option A) ──────────────────────────────────────
        // Fires after the scroll completes for every uncleared non-start room.
        // The engine has already set up the empty room; we decide who spawns.
        onRoomCleared: () => {
            // engine only fires this after room.cleared transitions false→true,
            // so counting here is safe against double-fires
            _runStats.roomsCleared++;
        },

        onKill: (isBoss) => {
            _runStats.kills++;
            if (isBoss) _runStats.bossKills++;
        },

        onRoomEnter: (room, spawnFn, spawnBuffedFn) => {
            const shown = _quiz({
                title:     '⚔️ Brace yourself!',
                titleColor:'#e74c3c',
                subtitle:  'Answer correctly — wrong answer buffs the enemies!',
                onAnswer:  (isCorrect) => {
                    if (isCorrect) {
                        spawnFn();
                    } else {
                        spawnBuffedFn();
                        _showBanner('❌ Enemies are enraged!', '#e74c3c');
                    }
                },
            });
            // Never let a swallowed quiz leave the room unspawnable (and
            // therefore unclearable) — spawn normally instead.
            if (!shown) spawnFn();
        },

        // ── Chest quiz (Option D) ──────────────────────────────────────────
        onChestOpen: (weaponId) => {
            const shown = _quiz({
                title:     '🎁 Treasure Chest!',
                titleColor:'#f1c40f',
                subtitle:  'Answer correctly to claim the reward!',
                onAnswer:  (isCorrect) => {
                    if (isCorrect) {
                        handleLootDrop(weaponId ? 'weapon' : 'potion', weaponId);
                    } else {
                        // Wrong answer — only a potion consolation prize
                        gameState.player.potions++;
                        _showBanner('Wrong... you found a potion at least.', '#7f8c8d');
                        updateHUD(gameState);
                    }
                },
            });
            if (!shown) { gameState.player.potions++; updateHUD(gameState); } // never lose the chest silently
        },

        // ── Shrine quiz (Option D, player-initiated) ───────────────────────
        onShrineTouch: () => {
            _quiz({
                title:     '🔮 Vocabulary Shrine',
                titleColor:'#9b59b6',
                subtitle:  'Answer correctly for a blessing!',
                onAnswer:  (isCorrect) => {
                    if (isCorrect) {
                        gameState.player.mp = gameState.player.maxMp;
                        gameState.player.invincibility = 3.0;
                        _showBanner('✨ Blessed! MP restored + 3s invincibility', '#9b59b6');
                        updateHUD(gameState);
                    } else {
                        _showBanner('The shrine remains silent.', '#7f8c8d');
                    }
                },
            });
        },

        // ── Stairs quiz (Option D) ─────────────────────────────────────────
        onStairsReached: (resetFn) => {
            const shown = _quiz({
                title:     '🏁 Descend?',
                titleColor:'#f1c40f',
                subtitle:  'Answer correctly to proceed to the next stage!',
                onAnswer:  (isCorrect) => {
                    if (isCorrect) {
                        gameState.stage++;
                        saveMeta();
                        startGame();
                    } else {
                        resetFn(); // allow the player to try again by walking back onto stairs
                        _showBanner('Not yet... answer correctly to descend.', '#e74c3c');
                    }
                },
            });
            if (!shown) resetFn(); // quiz swallowed — re-arm the stairs, never dead-lock them
        },

        // ── Level up (natural pause — keep as-is) ─────────────────────────
        onExpGained: () => checkLevelUp(),

        // ── Damage — with the promised "dodge fatal blows" vocab clutch ──
        // A blow that would kill triggers a Second Wind quiz (limited charges
        // per stage). Correct: survive at 30% HP with i-frames. Wrong: death.
        onTakeDamage: (dmg) => {
            _runStats.damageTaken += dmg;
            gameState.player.invincibility = Math.max(gameState.player.invincibility, 1.0);
            const newHp = gameState.player.hp - dmg;

            if (newHp <= 0 && gameState.secondWinds > 0 && !gameState.isPaused) {
                gameState.secondWinds--;
                gameState.player.hp = 1; // cling to life while the quiz is up
                updateHUD(gameState);
                _quiz({
                    title:     '💀 FATAL BLOW!',
                    titleColor:'#e74c3c',
                    subtitle:  'Answer correctly to twist away from death!',
                    onAnswer:  (isCorrect) => {
                        if (isCorrect) {
                            gameState.player.hp = Math.max(10, Math.ceil(gameState.player.maxHp * 0.3));
                            gameState.player.invincibility = 2.5;
                            _showBanner(`✨ Second Wind! (${gameState.secondWinds} left this stage)`, '#2ecc71');
                        } else {
                            gameState.player.hp = 0;
                            checkDeath();
                        }
                        updateHUD(gameState);
                    },
                });
            } else {
                gameState.player.hp = newHp;
                checkDeath();
            }
            updateHUD(gameState);
        },

        onItemFound: (type, wid) => handleLootDrop(type, wid),
    };

    initEngine(_screens.game.querySelector('#leg-canvas'), gameState, map);

    updateHUD(gameState);
}

// ── Quiz helper — pauses game, shows quiz, resumes ────────────────────────────
// Returns true if the quiz was actually shown. Callers that gate progression
// (room spawns, stairs) MUST provide a fallback when this returns false,
// otherwise a swallowed quiz can soft-lock the run.
function _quiz({ title, titleColor, subtitle, onAnswer }) {
    // Guard: don't stack quizzes
    if (gameState.isPaused) return false;

    gameState.isPaused = true;
    _vocabMgr.pause();

    const shown = showGameQuiz(_vocabMgr, {
        container:  _screens.game.querySelector('#leg-ui-layer'),
        title, titleColor, subtitle,
        onAnswer: (isCorrect, word, res) => {
            _vocabMgr.resume();
            gameState.isPaused = false;
            onAnswer(isCorrect, word, res);
        },
        onEmpty: () => {
            // Pool exhausted / nothing available — unfreeze and treat as correct
            _vocabMgr.resume();
            gameState.isPaused = false;
            onAnswer(true, null, null);
        },
    });

    if (!shown) {
        // showGameQuiz returned null (empty pool) — onEmpty above already ran,
        // but guard the paused flag in case it didn't fire.
        if (gameState.isPaused && !document.querySelector('.gvm-overlay')) {
            _vocabMgr.resume();
            gameState.isPaused = false;
        }
    }
    return true;
}

// ── Banner helper — brief on-screen message ───────────────────────────────────
function _showBanner(text, bg = '#2c3e50') {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `position:fixed;top:50px;left:50%;transform:translateX(-50%);
        background:${bg};color:#fff;padding:8px 16px;border-radius:10px;font-weight:bold;
        z-index:9999;box-shadow:0 5px 15px rgba(0,0,0,0.5);font-size:12px;pointer-events:none;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

let _lvlBusy = false; // prevents stacked level-up overlays on multi-kills

function checkLevelUp() {
    if (!_lvlBusy && !gameState.isPaused &&
        gameState.player.exp >= gameState.player.nextExp && gameState.player.level < 999) {
        _lvlBusy = true;
        gameState.player.exp -= gameState.player.nextExp;

        // Freeze immediately so combat stops
        gameState.isPaused = true;
        _vocabMgr.pause();

        const nextLevel = gameState.player.level + 1;
        const uiLayer   = _screens.game.querySelector('#leg-ui-layer');

        // Build animation element
        const anim = document.createElement('div');
        anim.className = 'leg-levelup';
        anim.innerHTML = `
            <div class="leg-levelup-ring"></div>
            <div class="leg-levelup-ring"></div>
            <div class="leg-levelup-label">Level Up</div>
            <div class="leg-levelup-num">${nextLevel}</div>
        `;
        uiLayer.appendChild(anim);

        // When animation finishes, remove it and show the quiz
        anim.addEventListener('animationend', (e) => {
            // The container has multiple child animations — wait for the outermost fade
            if (e.target !== anim) return;
            anim.remove();

            showGameQuiz(_vocabMgr, {
                container:  uiLayer,
                title:      '✨ Level Up!',
                titleColor: '#f1c40f',
                subtitle:   'Answer perfectly for +3 Stat Points!',
                onAnswer: (isCorrect) => {
                    gameState.player.level++;
                    gameState.player.nextExp = Math.floor(15 * gameState.player.level);
                    gameState.statPoints += isCorrect ? 3 : 1;
                    applyStats(); // maxHp grows with level — recalc BEFORE the refill
                    gameState.player.hp   = gameState.player.maxHp;
                    gameState.player.mp   = gameState.player.maxMp;
                    _vocabMgr.resume();
                    gameState.isPaused = false;
                    _lvlBusy = false;
                    updateHUD(gameState);
                    const menuBtn = document.getElementById('leg-btn-menu');
                    if (menuBtn) {
                        menuBtn.style.borderColor = '#e74c3c';
                        setTimeout(() => menuBtn.style.borderColor = '', 2000);
                    }
                    checkLevelUp(); // catch a second banked level, if any
                },
            });
        }, { once: true });
    }
    updateHUD(gameState);
}

function handleLootDrop(type, weaponId) {
    if (type === 'potion') {
        gameState.player.potions++;
        _showBanner('🧪 You found a Potion!', '#3498db');
    } else if (type === 'weapon') {
        if (!weaponId) {
            const order = ['axe', 'sickle', 'chain', 'spear', 'star'];
            weaponId = order.find(w => !gameState.unlockedWeapons.includes(w));
        }
        if (weaponId && !gameState.unlockedWeapons.includes(weaponId)) {
            gameState.unlockedWeapons.push(weaponId);
            _showBanner(`⚔️ You found the ${weaponId.toUpperCase()}!`, '#f1c40f');
        } else {
            // All weapons already unlocked — give potion instead
            gameState.player.potions++;
            _showBanner('🧪 You found a Potion!', '#3498db');
        }
    }
    updateHUD(gameState);
}

function checkDeath() {
    if (gameState.player.hp > 0) return;

    stopEngine();

    const elapsed = Math.floor((Date.now() - _runStats.startTime) / 1000);
    const vocabStats = _vocabMgr ? _vocabMgr.getStats() : null;
    const apGain = Math.floor(gameState.player.level / 10);

    showDeathScreen(
        {
            elapsed,
            stage:       gameState.stage,
            level:       gameState.player.level,
            kills:       _runStats.kills,
            bossKills:   _runStats.bossKills,
            damageTaken: _runStats.damageTaken,
            roomsCleared:_runStats.roomsCleared,
            potionsUsed: _runStats.potionsUsed,
            apGain,
            vocabCorrect: vocabStats?.correct  ?? 0,
            vocabWrong:   vocabStats?.wrong    ?? 0,
            vocabCombo:   vocabStats?.highestCombo ?? 0,
            vocabLearned: vocabStats?.totalLearned ?? 0,
        },
        gameState,
        {
            onRebirth: () => doRebirth(),
            onExit:    () => {
                cleanupInput();
                if (_vocabMgr) {
                    gameState._vocabState  = _vocabMgr.exportState();
                    gameState._vocabConfig = _vocabMgr.config;
                    if (!_vocabMgr.isGlobalSrs) _vocabMgr.exportToAppSrs(null, 'skip');
                }
                saveMeta();
                _onExit();
            },
        }
    );
}

function doRebirth() {
    const apGain = Math.floor(gameState.player.level / 10);
    gameState.ap += apGain;

    gameState.stage  = 1;
    gameState.player.level   = 1;
    gameState.player.exp     = 0;
    gameState.player.nextExp = 15;
    gameState.player.str = 5; gameState.player.def = 5;
    gameState.player.agi = 5; gameState.player.wis = 5;
    gameState.statPoints = 0;
    gameState.unlockedWeapons       = ['sword'];
    gameState.player.equippedWeapon = 'sword';
    gameState.player.potions        = 3;
    gameState.magicMode             = false;

    saveMeta();
    startGame();
}

function applyStats() {
    const p = gameState.player;
    const perkHp = (gameState.perks.hp  || 0) * 50;
    const perkMp = (gameState.perks.mp  || 0) * 20;

    p.maxHp    = 100 + (p.level * 10) + (p.def * 5) + perkHp;
    p.maxMp    = 50  + (p.wis * 10)   + perkMp;
    p.expBonus = (gameState.perks.exp || 0) * 0.1;
    // Guardian Spirit perk: extra cheat-death charges per stage
    gameState.maxSecondWinds = 1 + (gameState.perks.dodge || 0);
    gameState.secondWinds = Math.min(gameState.secondWinds ?? 1, gameState.maxSecondWinds);
}

function loadMeta() {
    try {
        const raw = localStorage.getItem('leg_meta');
        if (raw) {
            const parsed = JSON.parse(raw);
            gameState.ap    = parsed.ap    || 0;
            gameState.perks = parsed.perks || {};
            if (parsed.unlockedWeapons) gameState.unlockedWeapons = parsed.unlockedWeapons;
            if (parsed.player) Object.assign(gameState.player, parsed.player);
            gameState.stage        = parsed.stage        || 1;
            gameState._vocabState  = parsed.vocabState   || null;
            gameState._vocabConfig = parsed.vocabConfig  || null;
        }
    } catch {}
}

function saveMeta() {
    localStorage.setItem('leg_meta', JSON.stringify({
        ap: gameState.ap,
        perks: gameState.perks,
        unlockedWeapons: gameState.unlockedWeapons,
        player: gameState.player,
        stage:  gameState.stage,
        vocabState:  gameState._vocabState  || null,
        vocabConfig: gameState._vocabConfig || null,
    }));
}

function _injectStyles() {
    if (!document.getElementById('leg-styles')) {
        const link = document.createElement('link');
        link.id = 'leg-styles'; link.rel = 'stylesheet';
        link.href = './js/games/legend/legend.css';
        document.head.appendChild(link);
    }
}