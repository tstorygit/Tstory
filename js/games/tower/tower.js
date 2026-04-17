// main/js/games/tower/tower.js

import { mountVocabSelector } from '../../vocab_selector.js';
import { GameVocabManager } from '../../game_vocab_mgr.js';
import { showGameQuiz, poolSourceLabel, renderVocabSettings, setGvmTheme } from '../../game_vocab_mgr_ui.js';
import { UPGRADES, LAB_RESEARCH_CATEGORIES, LAB_RESEARCH, RELICS, TOWER_BASES, QUEST_TEMPLATES, CARDS, SLOT_COSTS, getCardLevelInfo, calcStat, calcCost, getMultiBuy, calcLabCost, calcLabTimeMs, getUpgradeMaxLevel } from './tower_data.js';
import { TowerEngine } from './tower_engine.js';

const ACHIEVEMENTS = {
    first_boss: { id: 'first_boss', name: 'First Blood', desc: 'Defeat your first Boss enemy.', title: 'Novice' },
    vocab_100: { id: 'vocab_100', name: 'Linguist', desc: 'Answer 100 vocab questions correctly (Lifetime).', title: 'Linguist' },
    vocab_1000: { id: 'vocab_1000', name: 'Polyglot', desc: 'Answer 1,000 vocab questions correctly (Lifetime).', title: 'Polyglot' },
    wave_50: { id: 'wave_50', name: 'Survivor', desc: 'Reach Wave 50 in any difficulty.', title: 'Survivor' },
    wave_100: { id: 'wave_100', name: 'Centurion', desc: 'Reach Wave 100 in any difficulty.', title: 'Centurion' },
    no_def_30: { id: 'no_def_30', name: 'Glass Cannon', desc: 'Reach Wave 30 without buying any Defense upgrades.', title: 'Glass Cannon' },
    max_cards: { id: 'max_cards', name: 'Collector', desc: 'Unlock all 5 card slots.', title: 'Collector' }
};

let _screens = null;
let _onExit = null;
let _vocabMgr = null;
let _engine = null;

const SAVE_KEY = 'polyglot_tower_save';
let _save = null;
let _speedMult = 1;

// ─── MUSIC ───────────────────────────────────────────────────────────────────
let _audio = null;
const MUSIC_TRACKS = ['tower1.mp3', 'tower2.mp3', 'tower3.mp3'];
const MUSIC_PREF_KEY = 'polyglot_tower_muted';

function _getMuted() {
    return localStorage.getItem(MUSIC_PREF_KEY) === 'true';
}
function _setMuted(val) {
    localStorage.setItem(MUSIC_PREF_KEY, val ? 'true' : 'false');
    if (_audio) _audio.muted = val;
    _updateMuteBtn();
}
function _updateMuteBtn() {
    const btn = document.querySelector('#tw-mute-btn');
    if (!btn) return;
    const muted = _getMuted();
    btn.textContent = muted ? '🔇' : '🔊';
    btn.title = muted ? 'Unmute Music' : 'Mute Music';
}
function _pickRandomTrack(exclude) {
    const available = MUSIC_TRACKS.filter(t => t !== exclude);
    return available[Math.floor(Math.random() * available.length)];
}
function _musicPlay() {
    if (_audio) { _audio.pause(); _audio = null; }
    const basePath = './js/games/tower/bgm/';
    let track = MUSIC_TRACKS[Math.floor(Math.random() * MUSIC_TRACKS.length)];
    _audio = new Audio(basePath + track);
    _audio.muted = _getMuted();
    _audio.volume = 0.5;
    _audio.addEventListener('ended', () => {
        const next = _pickRandomTrack(track);
        track = next;
        _audio.src = basePath + next;
        _audio.play().catch(() => {});
    });
    _audio.play().catch(() => {});
}
function _musicStop() {
    if (_audio) { _audio.pause(); _audio = null; }
}
// ─────────────────────────────────────────────────────────────────────────────

let _run = {
    active: false,
    wave: 1,
    diff: 1,
    cash: 0,
    earnedCoinsDrops: 0,
    earnedCoinsWave: 0,
    knowledgeStacks: 0,
    combo: 0,
    abilityCharge: 0,
    targetMode: 'closest',
    vocabQuestions: 0,
    vocabCorrect: 0,
    failedWords: {},
    boughtDefense: false,
    levels: { offense: {}, defense: {}, utility: {} },
    autoBuy: { offense: false, defense: false, utility: false }
};

function _defaultSave() {
    return {
        coins: 0,
        gems: 0,
        highestWave: 0,
        highestWavePerDiff: {},
        maxDiff: 1,
        currentRun: null,
        workshop: {
            unlocks: {},
            offense: { damage:0, atkSpeed:0, range:0, critChance:0, critMult:0, dmgMeter:0, bounce:0, splashDmg:0 },
            defense: { health:0, regen:0, defAbs:0, defPct:0, lifesteal:0, thorns:0, knockback:0, defyDeath:0 },
            utility: { cashBonus:0, cashWave:0, coinBonus:0, coinsWave:0, interest:0, freeUpgOffense:0, freeUpgDefense:0, freeUpgUtility:0 }
        },
        workshopMults: {},
        runMults: {},
        lab: {
            active: null,
            levels: { damageMult:0, critChance:0, rangeMult:0, vocabMastery:0, healthMult:0, regenMult:0, defPct:0, thornsMult:0, lifesteal:0, knowledge:0, gameSpeed:0, coinYield:0, cashBonusMult:0, startingCash:0, synergy:0, freeUpg:0 }
        },
        bases: { unlocked: ['default'], equipped: 'default', levels: { default: 0, sniper: 0, mage: 0, banker: 0 } },
        ascension: { points: 0, timesAscended: 0 },
        cards: { owned: {}, equipped: [null], unlockedSlots: 1 },
        vocabConfig: GameVocabManager.defaultConfig(),
        stats: { totalCorrect: 0, sessionCorrect: 0, highestStreak: 0, wordsMastered:[], bossesKilled: 0, highestWaveNoDef: 0 },
        relics:[],
        achievements: {},
        equippedTitle: null,
        login: { lastDate: null, streakDays: 0 },
        quests: { date: null, active:[] }
    };
}

export function init(screens, onExit) {
    _screens = screens;
    _onExit = onExit;
    _injectCSS();
    
    _screens.setup.innerHTML = `
        <div class="tw-root">
            <div class="tw-header">
                <div style="display:flex; align-items:center;">
                    <h2 class="tw-header-title" style="margin-right:10px;">Polyglot Tower</h2>
                    <span id="tw-equipped-title" style="font-size:10px; color:#c39bd3; text-transform:uppercase; border:1px solid #c39bd3; padding:2px 4px; border-radius:4px; display:none; white-space:nowrap;"></span>
                    <button id="tw-info-btn" style="background:#333; color:#00ffff; border:1px solid #00ffff; border-radius:50%; width:22px; height:22px; cursor:pointer; font-weight:bold; margin-left:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">i</button>
                </div>
                <div class="tw-header-currencies">
                    <div class="tw-coins">🪙 <span id="tw-hub-coins">0</span></div>
                    <div class="tw-gems">💎 <span id="tw-hub-gems">0</span></div>
                </div>
            </div>
            <div class="tw-tab-bar">
                <button class="tw-tab-btn active" data-tab="tw-hub-play">Play</button>
                <button class="tw-tab-btn" data-tab="tw-hub-workshop">Workshop</button>
                <button class="tw-tab-btn" data-tab="tw-hub-lab">Lab</button>
                <button class="tw-tab-btn" data-tab="tw-hub-towers">Towers</button>
                <button class="tw-tab-btn" data-tab="tw-hub-cards">Cards</button>
                <button class="tw-tab-btn" data-tab="tw-hub-achievements">Trophies</button>
                <button class="tw-tab-btn" data-tab="tw-hub-login">Daily</button>
                <button class="tw-tab-btn" data-tab="tw-hub-quests">Quests</button>
                <button class="tw-tab-btn" data-tab="tw-hub-relics">Relics</button>
                <button class="tw-tab-btn" data-tab="tw-hub-stats">Stats</button>
                <button class="tw-tab-btn" data-tab="tw-hub-data">Data</button>
                <button class="tw-tab-btn" data-tab="tw-hub-vocab">Vocab</button>
            </div>
            
            <div class="tw-screen active tw-scroll-content" id="tw-hub-play">
                <div class="tw-tower-visual">
                    <div class="tw-tower-crystal">🔮</div>
                    <div class="tw-tower-body"><div class="tw-tower-window"></div><div class="tw-tower-window"></div></div>
                    <div class="tw-tower-base"></div>
                </div>
                <div class="tw-stage-card">
                    <div id="tw-new-run-setup">
                        <h3 style="color:#00ffff; margin-top:0;">Select Difficulty</h3>
                        <div class="tw-stage-controls">
                            <button class="tw-diff-btn" id="tw-diff-prev">❮</button>
                            <div class="tw-diff-label">Tier <span id="tw-diff-val">1</span></div>
                            <button class="tw-diff-btn" id="tw-diff-next">❯</button>
                        </div>
                        <div class="tw-target-wave">Complete Wave <span id="tw-target-val">10</span> to unlock next tier.</div>
                        
                        <div style="background:rgba(0,0,0,0.4); border-radius:8px; padding:10px; margin-bottom:15px; font-size:12px; color:#aaa;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span>Highest Wave (Tier <span id="tw-diff-lbl-num">1</span>):</span>
                                <span id="tw-diff-highest" style="color:#fff; font-weight:bold;">0</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span>Coin Multiplier:</span>
                                <div style="display:flex; align-items:center;">
                                    <span style="color:#f1c40f; font-weight:bold;" id="tw-diff-coin-mult">x1.00</span>
                                    <span id="tw-mult-info-btn" style="cursor:pointer; background:#333; color:#fff; border-radius:50%; width:16px; height:16px; display:inline-flex; align-items:center; justify-content:center; font-size:10px; margin-left:6px;">i</span>
                                </div>
                            </div>
                        </div>

                        <button class="tw-play-btn" id="tw-start-run">BATTLE</button>
                    </div>

                    <div id="tw-resume-run-setup" style="display:none; text-align:center;">
                        <h3 style="color:#f1c40f; margin-top:0;">Run in Progress</h3>
                        <div style="font-size:14px; margin-bottom:20px; color:#fff;">Tier <span id="tw-resume-tier" style="font-weight:bold; color:#00ffff;">1</span> - Wave <span id="tw-resume-wave" style="font-weight:bold; color:#00ffff;">1</span></div>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            <button class="tw-play-btn" id="tw-resume-run" style="background:#2ecc71; color:#fff;">RESUME RUN</button>
                            <button class="tw-play-btn" id="tw-abandon-run" style="background:transparent; border:1px solid #e74c3c; color:#e74c3c; font-size:14px; padding:12px;">ABANDON RUN</button>
                        </div>
                    </div>
                </div>
                <button id="tw-exit-game" style="width:100%; padding:12px; background:none; border:1px solid #555; color:#aaa; border-radius:8px; margin-top:20px; cursor:pointer;">Exit to App</button>
            </div>
            
            <div class="tw-screen tw-scroll-content" id="tw-hub-workshop">
                <div class="tw-subtab-bar">
                    <button class="tw-subtab-btn active" data-subtab="tw-ws-offense">Offense</button>
                    <button class="tw-subtab-btn" data-subtab="tw-ws-defense">Defense</button>
                    <button class="tw-subtab-btn" data-subtab="tw-ws-utility">Utility</button>
                </div>
                <div class="tw-subtab-content active" id="tw-ws-offense"></div>
                <div class="tw-subtab-content" id="tw-ws-defense"></div>
                <div class="tw-subtab-content" id="tw-ws-utility"></div>
            </div>
            
            <div class="tw-screen tw-scroll-content" id="tw-hub-lab">
                <div id="tw-lab-active" style="display:none; background:rgba(46,204,113,0.1); border:1px solid #2ecc71; border-radius:8px; padding:12px; margin-bottom:15px; text-align:center;">
                    <div style="font-size:12px; color:#2ecc71; font-weight:bold; margin-bottom:4px;">Researching: <span id="tw-lab-active-name"></span></div>
                    <div style="font-family:monospace; font-size:16px; color:#fff;" id="tw-lab-countdown">00:00:00</div>
                </div>
                <div class="tw-subtab-bar">
                    <button class="tw-subtab-btn active" data-subtab="tw-lab-offense">Offense</button>
                    <button class="tw-subtab-btn" data-subtab="tw-lab-defense">Defense</button>
                    <button class="tw-subtab-btn" data-subtab="tw-lab-utility">Utility</button>
                </div>
                <div class="tw-subtab-content active" id="tw-lab-offense"></div>
                <div class="tw-subtab-content" id="tw-lab-defense"></div>
                <div class="tw-subtab-content" id="tw-lab-utility"></div>
            </div>

            <div class="tw-screen tw-scroll-content" id="tw-hub-towers">
                <h3 style="color:#00ffff; margin-top:0;">Tower Bases</h3>
                <div id="tw-ascension-banner" style="background:rgba(155, 89, 182, 0.2); border:1px solid #9b59b6; border-radius:8px; padding:15px; margin-bottom:15px; text-align:center;">
                    <div style="font-size:14px; color:#c39bd3; font-weight:bold; margin-bottom:5px;">Ascension</div>
                    <div style="font-size:12px; color:#aaa; margin-bottom:10px;">Reach Tier 15 to Ascend. Reset Workshop & Lab progress for Ascension Points (AP) to upgrade your Tower Bases!</div>
                    <div style="font-size:14px; color:#fff; font-weight:bold; margin-bottom:10px;">Your AP: <span id="tw-ap-val">0</span></div>
                    <button id="tw-ascend-btn" class="tw-play-btn" style="background:#9b59b6; color:#fff; width:auto; padding:8px 16px; font-size:14px;">Ascend Now (+<span id="tw-ap-gain">0</span> AP)</button>
                </div>
                <div id="tw-bases-list" style="display:flex; flex-direction:column; gap:10px;"></div>
            </div>

            <div class="tw-screen" id="tw-hub-cards">
                <div class="tw-cards-top">
                    <div class="tw-cards-top-row">
                        <span class="tw-cards-top-label">Equipped</span>
                        <div style="display:flex; gap:6px;">
                            <button id="tw-buy-card-1-btn" class="tw-pull-btn tw-pull-btn-1">Pull 1 · 20 💎</button>
                            <button id="tw-buy-card-10-btn" class="tw-pull-btn tw-pull-btn-10">Pull 10 · 200 💎</button>
                        </div>
                    </div>
                    <div id="tw-cards-slots" class="tw-cards-equipped-row"></div>
                    <button id="tw-unlock-slot-btn" class="tw-unlock-slot-btn" style="display:none;"></button>
                </div>
                <div class="tw-cards-collection">
                    <div id="tw-cards-inv"></div>
                </div>
            </div>

            <div class="tw-screen tw-scroll-content" id="tw-hub-achievements">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="color:#f1c40f; margin-top:0;">Achievements & Titles</h3>
                    <div style="font-size:12px; color:#2ecc71; font-weight:bold;">Global Buff: +<span id="tw-ach-buff-val">0</span>% Damage</div>
                </div>
                <p style="font-size:12px; color:#aaa; margin-bottom:15px;">Unlock achievements to gain a permanent +1% Base Damage per achievement, and collect unique titles!</p>
                <div id="tw-achievements-list" style="display:flex; flex-direction:column; gap:10px;"></div>
            </div>

            <div class="tw-screen tw-scroll-content" id="tw-hub-login">
                <div style="text-align:center; margin-bottom: 20px;">
                    <h3 style="color:#00ffff; margin:0 0 5px 0;">Daily Rewards</h3>
                    <div style="color:#f1c40f; font-weight:bold; font-size:16px;">Total Streak: <span id="tw-login-streak-val">0</span> Days</div>
                </div>
                <div id="tw-login-weeks" style="display:flex; flex-direction:column; gap:15px;"></div>
            </div>

            <div class="tw-screen tw-scroll-content" id="tw-hub-quests">
                <h3 style="color:#00a8ff; margin-top:0;">Daily Quests</h3>
                <p style="font-size:12px; color:#aaa;">Complete missions for Gems and Coins. Resets daily.</p>
                <div id="tw-quests-list"></div>
            </div>

            <div class="tw-screen tw-scroll-content" id="tw-hub-relics">
                <h3 style="color:#f1c40f; margin-top:0;">Relics</h3>
                <p style="font-size:12px; color:#aaa;">Unlock relics by beating target waves on new difficulty tiers.</p>
                <div id="tw-relics-content"></div>
            </div>

            <div class="tw-screen tw-scroll-content" id="tw-hub-stats">
                <h3 style="color:#00ffff; margin-top:0;">Session & Lifetime Stats</h3>
                <div id="tw-stats-content"></div>
            </div>

            <div class="tw-screen tw-scroll-content" id="tw-hub-data">
                <h3 style="color:#e74c3c; margin-top:0;">Wipe Data</h3>
                <p style="font-size:12px; color:#aaa; margin-bottom:20px;">Reset specific parts of your progress. This cannot be undone!</p>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <button class="tw-play-btn" style="background:#e74c3c; font-size:14px;" id="tw-wipe-coins">Reset Coins & Gems</button>
                    <button class="tw-play-btn" style="background:#e74c3c; font-size:14px;" id="tw-wipe-workshop">Reset Workshop</button>
                    <button class="tw-play-btn" style="background:#e74c3c; font-size:14px;" id="tw-wipe-lab">Reset Lab</button>
                    <button class="tw-play-btn" style="background:#e74c3c; font-size:14px;" id="tw-wipe-cards">Reset Cards</button>
                    <button class="tw-play-btn" style="background:#e74c3c; font-size:14px;" id="tw-wipe-stats">Reset Stats & Quests</button>
                    <button class="tw-play-btn" style="background:#c0392b; font-size:16px; margin-top:20px;" id="tw-wipe-all">HARD RESET ALL</button>
                </div>
            </div>
            
            <div class="tw-screen tw-scroll-content" id="tw-hub-vocab">
                <div id="tw-vocab-settings-mount"></div>
                <button id="tw-change-deck-btn" style="width:100%; margin-top:20px; padding:12px; border:1px solid #00ffff; background:rgba(0,255,255,0.05); color:#00ffff; border-radius:8px; font-weight:bold; cursor:pointer;">Change Vocabulary Deck</button>
            </div>
        </div>

        <div id="tw-info-modal" class="tw-modal" style="display:none; position:absolute; inset:0; z-index:1000; padding:20px; background:rgba(0,0,0,0.95);">
            <div style="background:#1a1a2e; padding:20px; border-radius:12px; border:2px solid #00ffff; width:100%; max-width:500px; max-height:80vh; overflow-y:auto; box-sizing:border-box;">
                <h3 style="color:#00ffff; margin-top:0; text-align:center;">Mechanics Guide</h3>
                <div style="color:#ccc; font-size:13px; line-height:1.5;">
                    <h4 style="color:#f1c40f; margin-bottom:5px;">🧠 Knowledge System</h4>
                    <p style="margin-top:0;">Between waves, you'll answer Vocabulary questions. Each correct answer gives you a <b>Knowledge Stack</b>. Knowledge acts as a powerful global multiplier for your Damage, Health, Regen, Cash, and Coins.</p>
                    
                    <h4 style="color:#f1c40f; margin-bottom:5px;">🔥 Combo Multiplier</h4>
                    <p style="margin-top:0;">Consecutive correct answers build your Combo. Higher combos multiply the Knowledge Stacks gained per answer: <br>• 3+ Streak: <b>x1.5</b><br>• 5+ Streak: <b>x2.0</b><br>• 10+ Streak: <b>x3.0</b></p>
                    
                    <h4 style="color:#f1c40f; margin-bottom:5px;">✨ Abilities</h4>
                    <p style="margin-top:0;">Correct answers charge your Abilities. Once fully charged (100%), you can activate powerful skills like Barrage (massive attack speed), Nova (board wipe), or Aegis (blocks next 3 hits).</p>
                    
                    <h4 style="color:#f1c40f; margin-bottom:5px;">🧬 Linguistic Synergy</h4>
                    <p style="margin-top:0;">Unlocked in the Lab, this provides permanent run buffs based on your current Knowledge multiplier:<br>• at <b>x2.0</b> Knowledge: Projectiles Pierce up to 3 enemies.<br>• at <b>x3.0</b> Knowledge: Projectiles Chain to 2 nearby enemies.</p>
                    
                    <h4 style="color:#f1c40f; margin-bottom:5px;">🏆 Achievements & Titles</h4>
                    <p style="margin-top:0;">Unlock achievements to earn permanent global Damage buffs (+1% Base Damage per achievement) and equip unique Titles to show off your prowess!</p>

                    <h4 style="color:#f1c40f; margin-bottom:5px;">🌌 Ascension</h4>
                    <p style="margin-top:0;">Available once you unlock Tier 15. Ascending resets your Workshop, Lab, Highest Wave, and Max Tier back to 1. In return, you earn <b>Ascension Points (AP)</b> which you can use to upgrade the unique modifiers of unlocked Tower Bases!</p>
                </div>
                <button id="tw-info-close" class="tw-play-btn" style="margin-top:20px;">Got it!</button>
            </div>
        </div>

        <div id="tw-daily-popup" class="tw-modal" style="display:none; position:absolute; inset:0; z-index:1000;">
            <div style="background:#1a1a2e; padding:30px; border-radius:12px; text-align:center; border:2px solid #f1c40f; max-width:80%;">
                <h2 style="color:#f1c40f; margin-top:0;">Daily Login Bonus!</h2>
                <div style="font-size:14px; color:#fff; margin-bottom:15px;">Day <span id="tw-login-day" style="font-weight:bold;color:#00ffff;"></span></div>
                <div id="tw-login-reward" style="font-size:24px; font-family:monospace; margin-bottom:20px;"></div>
                <button id="tw-login-claim" class="tw-play-btn">Claim</button>
            </div>
        </div>

        <div id="tw-card-pull-modal" class="tw-modal" style="display:none; position:absolute; inset:0; z-index:1000; background:rgba(0,0,0,0.98);">
            <h2 style="color:#00a8ff; margin-top:20px;">Card Pack Opened!</h2>
            <div id="tw-card-pull-container" class="tw-card-reveal-wrap"></div>
            <button id="tw-card-pull-close" class="tw-play-btn" style="width:200px; margin-top:20px; display:none;">Awesome!</button>
        </div>

        <div id="tw-mult-info-modal" class="tw-modal" style="display:none; position:absolute; inset:0; z-index:1000;">
            <div style="background:#1a1a2e; padding:20px; border-radius:12px; border:2px solid #00ffff; width:80%; max-width:300px;">
                <h3 style="color:#00ffff; margin-top:0; text-align:center;">Multiplier Breakdown</h3>
                <div style="display:flex; flex-direction:column; gap:8px; font-size:13px; color:#ccc; font-family:monospace;">
                    <div style="display:flex; justify-content:space-between;"><span>Base:</span><span>x1.00</span></div>
                    <div style="display:flex; justify-content:space-between;"><span>Tier Difficulty:</span><span id="tw-mi-tier">x1.00</span></div>
                    <div style="display:flex; justify-content:space-between;"><span>Lab Research:</span><span id="tw-mi-lab" style="color:#2ecc71;">+0%</span></div>
                    <div style="display:flex; justify-content:space-between;"><span>Card Bonus:</span><span id="tw-mi-card" style="color:#9b59b6;">+0%</span></div>
                    <hr style="border:0; border-top:1px solid #333; margin:5px 0;">
                    <div style="display:flex; justify-content:space-between; font-weight:bold; color:#f1c40f; font-size:15px;"><span>Total:</span><span id="tw-mi-total">x1.00</span></div>
                </div>
                <button id="tw-mult-info-close" class="tw-play-btn" style="margin-top:20px; font-size:14px; padding:10px;">Close</button>
            </div>
        </div>
    `;
    
    _screens.game.innerHTML = `
        <div class="tw-root">
            <div class="tw-header tw-battle-header" style="flex-direction:column; align-items:stretch; padding: 8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <div class="tw-wave-text">Wave <span id="tw-run-wave">1</span></div>
                    <div style="display:flex; gap:10px; font-family:monospace; font-weight:bold;">
                        <div class="tw-run-cash" style="color:#2ecc71;">$ <span id="tw-run-cash-val">0</span></div>
                        <div class="tw-coins" style="color:#f1c40f;">🪙 <span id="tw-run-coins-val">0</span></div>
                        <div class="tw-gems" style="color:#00a8ff;">💎 <span id="tw-run-gems-val">0</span></div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:4px;">
                    <div style="font-size:12px; font-weight:bold; color:#9b59b6; white-space:nowrap; flex-shrink:0;">🧠 ×<span id="tw-run-know">1.00</span><span id="tw-run-combo" class="tw-combo-text"></span></div>
                    <div style="display:flex; gap:6px; margin-left:auto; flex-wrap:wrap; justify-content:flex-end;">
                        <button class="tw-speed-btn" id="tw-btn-speed">⚡ 1x</button>
                        <button id="tw-mute-btn" style="background:transparent; border:1px solid #555; color:#ccc; border-radius:6px; padding:4px 8px; font-size:16px; cursor:pointer; line-height:1;">🔊</button>
                        <button class="tw-end-run-btn" id="tw-btn-end-run" style="margin-left:0 !important;">Pause / End</button>
                    </div>
                </div>
                <div class="tw-targeting">
                    <button class="tw-target-btn active" data-target="closest">Closest</button>
                    <button class="tw-target-btn" data-target="farthest">Farthest</button>
                    <button class="tw-target-btn" data-target="boss">Boss</button>
                    <button class="tw-target-btn" data-target="fast">Fast</button>
                </div>
                <div class="tw-abilities" style="margin-top:4px;">
                    <button class="tw-abil-btn" id="tw-abil-barrage" disabled>Barrage</button>
                    <button class="tw-abil-btn" id="tw-abil-nova" disabled>Nova</button>
                    <button class="tw-abil-btn" id="tw-abil-aegis" disabled>Aegis</button>
                </div>
                <div class="tw-ability-bar-wrap"><div class="tw-ability-fill" id="tw-abil-bar" style="width:0%;"></div></div>
            </div>
            
            <div class="tw-hp-bar-wrap"><div class="tw-hp-fill" id="tw-run-hp-bar"></div></div>
            
            <div class="tw-canvas-wrap">
                <canvas id="tw-canvas"></canvas>
                <div id="tw-ui-layer"></div>
            </div>
                
            <div class="tw-battle-upgrades">
                <div class="tw-subtab-bar">
                    <button class="tw-subtab-btn active" data-subtab="tw-run-offense">Offense</button>
                    <button class="tw-subtab-btn" data-subtab="tw-run-defense">Defense</button>
                    <button class="tw-subtab-btn" data-subtab="tw-run-utility">Utility</button>
                </div>
                <div class="tw-subtab-content active" id="tw-run-offense"></div>
                <div class="tw-subtab-content" id="tw-run-defense"></div>
                <div class="tw-subtab-content" id="tw-run-utility"></div>
            </div>

            <div id="tw-death-screen" class="tw-screen tw-modal" style="display:none; position:absolute; inset:0; z-index:1000; padding:15px; overflow-y:auto;">
                <h1 style="color:#e74c3c; margin-bottom:5px; margin-top:20px;">Run Ended</h1>
                <div style="font-size:18px; color:#00ffff; margin-bottom:10px;">Reached Wave <span id="tw-ds-wave"></span></div>
                
                <div style="display:flex; gap:10px; margin: 10px 0; width:100%; max-width:600px;">
                    <div style="flex:1; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                        <h4 style="margin:0 0 10px; color:#e74c3c; font-size:13px; text-align:center;">Damage Dealt</h4>
                        <div style="font-size:11px; color:#ccc; display:flex; flex-direction:column; gap:4px; font-family:monospace;">
                            <div style="display:flex; justify-content:space-between;"><span>Base:</span><span id="tw-ds-dmg-base">0</span></div>
                            <div style="display:flex; justify-content:space-between;"><span>Crit:</span><span id="tw-ds-dmg-crit">0</span></div>
                            <div style="display:flex; justify-content:space-between;"><span>Splash:</span><span id="tw-ds-dmg-splash">0</span></div>
                            <div style="display:flex; justify-content:space-between;"><span>Thorns:</span><span id="tw-ds-dmg-thorns">0</span></div>
                            <div style="display:flex; justify-content:space-between;"><span>Ability:</span><span id="tw-ds-dmg-abil">0</span></div>
                            <hr style="border:0; border-top:1px solid #555; margin:4px 0;">
                            <div style="display:flex; justify-content:space-between; font-weight:bold; color:#2ecc71;"><span>Total:</span><span id="tw-ds-dmg-total">0</span></div>
                        </div>
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column; gap:10px;">
                        <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                            <h4 style="margin:0 0 10px; color:#f1c40f; font-size:13px; text-align:center;">Economy</h4>
                            <div style="font-size:11px; color:#ccc; display:flex; flex-direction:column; gap:4px; font-family:monospace;">
                                <div style="display:flex; justify-content:space-between;"><span>Enemy Drops:</span><span id="tw-ds-eco-drops">0</span></div>
                                <div style="display:flex; justify-content:space-between;"><span>Wave Bonus:</span><span id="tw-ds-eco-wave">0</span></div>
                                <hr style="border:0; border-top:1px solid #555; margin:4px 0;">
                                <div style="display:flex; justify-content:space-between; font-weight:bold; color:#f1c40f;"><span>Total Coins:</span><span id="tw-ds-eco-total">0</span></div>
                            </div>
                        </div>
                        <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; text-align:center;">
                            <h4 style="margin:0 0 5px; color:#3498db; font-size:13px;">Vocab Accuracy</h4>
                            <div id="tw-ds-acc" style="font-size:16px; font-weight:bold; color:#3498db;">0%</div>
                        </div>
                    </div>
                </div>

                <div class="tw-death-grid" style="margin:0 0 15px 0;">
                    <div class="tw-death-grid-item">Boss Dmg Taken<div class="tw-death-val" id="tw-ds-bossdmg" style="color:#e74c3c;">0</div></div>
                    <div class="tw-death-grid-item">Mob Dmg Taken<div class="tw-death-val" id="tw-ds-mobdmg" style="color:#e67e22;">0</div></div>
                </div>

                <div style="width:100%; max-width:400px; margin-bottom:20px; background:rgba(0,0,0,0.5); padding:10px; border-radius:8px;">
                    <h4 style="color:#aaa; margin:0 0 10px 0; text-align:center;">Words to Review</h4>
                    <div id="tw-ds-words" style="display:flex; flex-direction:column; gap:5px; font-size:13px; color:#fff;"></div>
                </div>

                <button id="tw-death-return" class="tw-play-btn" style="width:200px;">Return to Hub</button>
            </div>

            <div id="tw-end-run-modal" class="tw-modal" style="display:none; position:absolute; inset:0; z-index:1000;">
                <div style="background:#1a1a2e; padding:30px; border-radius:12px; text-align:center; border:2px solid #e74c3c; max-width:80%;">
                    <h2 style="color:#e74c3c; margin-top:0;">Pause or End Run?</h2>
                    <div style="font-size:14px; color:#aaa; margin-bottom:20px;">Pause to return later, or end now to claim your coins.</div>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <button id="tw-end-run-pause" class="tw-play-btn" style="background:#3498db; color:#fff;">Pause & Leave</button>
                        <button id="tw-end-run-yes" class="tw-play-btn" style="background:#e74c3c; color:#fff;">End Run & Claim</button>
                        <button id="tw-end-run-no" class="tw-play-btn" style="background:#555; color:#fff; margin-top:10px;">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Hub Tab wiring
    _screens.setup.querySelectorAll('.tw-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _screens.setup.querySelectorAll('.tw-tab-btn').forEach(b => b.classList.remove('active'));
            _screens.setup.querySelectorAll('.tw-screen').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            _screens.setup.querySelector(`#${btn.dataset.tab}`).classList.add('active');
            if (btn.dataset.tab === 'tw-hub-stats') _renderStats();
            if (btn.dataset.tab === 'tw-hub-relics') _renderRelics();
            if (btn.dataset.tab === 'tw-hub-quests') _renderQuests();
            if (btn.dataset.tab === 'tw-hub-cards') _renderCards();
            if (btn.dataset.tab === 'tw-hub-login') _renderLoginTab();
            if (btn.dataset.tab === 'tw-hub-achievements') _renderAchievements();
            if (btn.dataset.tab === 'tw-hub-towers') _renderTowers();
        });
    });

    // Subtab wiring (Hub Workshop, Hub Lab, Game)
    const _wireSubtabs = (container) => {
        container.querySelectorAll('.tw-subtab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.tw-subtab-btn').forEach(b => b.classList.remove('active'));
                container.querySelectorAll('.tw-subtab-content').forEach(s => s.classList.remove('active'));
                btn.classList.add('active');
                container.querySelector(`#${btn.dataset.subtab}`).classList.add('active');
            });
        });
    };
    _wireSubtabs(_screens.setup.querySelector('#tw-hub-workshop'));
    _wireSubtabs(_screens.setup.querySelector('#tw-hub-lab'));
    _wireSubtabs(_screens.game.querySelector('.tw-battle-upgrades'));

    _screens.game.querySelectorAll('.tw-target-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _screens.game.querySelectorAll('.tw-target-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _run.targetMode = btn.dataset.target;
            if (_engine) _engine.setTargetMode(_run.targetMode);
        });
    });
    
    _screens.game.querySelector('#tw-btn-speed').addEventListener('click', () => {
        const steps =[1, 2, 3, 5];
        const idx = steps.indexOf(_speedMult);
        _speedMult = steps[(idx + 1) % steps.length];
        _screens.game.querySelector('#tw-btn-speed').textContent = `⚡ ${_speedMult}x`;
        if (_engine) _engine.speedMult = _speedMult;
    });

    _screens.game.querySelector('#tw-mute-btn').addEventListener('click', () => {
        _setMuted(!_getMuted());
    });

    _screens.game.querySelector('#tw-btn-end-run').addEventListener('click', () => {
        _engine.pause();
        const modal = _screens.game.querySelector('#tw-end-run-modal');
        modal.style.display = 'flex';
        
        modal.querySelector('#tw-end-run-pause').onclick = () => {
            modal.style.display = 'none';
            _engine.stop();
            _saveRunSnapshot();
            _showHub();
        };
        modal.querySelector('#tw-end-run-yes').onclick = () => {
            modal.style.display = 'none';
            _engine.stop();
            _handleDeath();
        };
        modal.querySelector('#tw-end-run-no').onclick = () => {
            modal.style.display = 'none';
            _engine.resume();
        };
    });

    ['barrage', 'nova', 'aegis'].forEach(abil => {
        _screens.game.querySelector(`#tw-abil-${abil}`).addEventListener('click', () => {
            if (_run.abilityCharge >= 100) {
                _run.abilityCharge = 0;
                _updateAbilitiesUI();
                if (_engine) _engine.activateAbility(abil);
            }
        });
    });

    // Info Modals
    _screens.setup.querySelector('#tw-info-btn').onclick = () => {
        _screens.setup.querySelector('#tw-info-modal').style.display = 'flex';
    };
    _screens.setup.querySelector('#tw-info-close').onclick = () => {
        _screens.setup.querySelector('#tw-info-modal').style.display = 'none';
    };

    _screens.setup.querySelector('#tw-mult-info-btn').onclick = () => {
        _screens.setup.querySelector('#tw-mult-info-modal').style.display = 'flex';
    };
    _screens.setup.querySelector('#tw-mult-info-close').onclick = () => {
        _screens.setup.querySelector('#tw-mult-info-modal').style.display = 'none';
    };

    // Wipe Data Handlers
    _screens.setup.querySelector('#tw-wipe-coins').onclick = () => {
        if(confirm('Reset Coins & Gems?')) { _save.coins = 0; _save.gems = 0; _saveGame(); _showHub(); }
    };
    _screens.setup.querySelector('#tw-wipe-workshop').onclick = () => {
        if(confirm('Reset Workshop Upgrades?')) { 
            _save.workshop = _defaultSave().workshop; 
            _save.workshopMults = {};
            _saveGame(); _showHub(); 
        }
    };
    _screens.setup.querySelector('#tw-wipe-lab').onclick = () => {
        if(confirm('Reset Lab Research?')) { 
            _save.lab = _defaultSave().lab; 
            _saveGame(); _showHub(); 
        }
    };
    _screens.setup.querySelector('#tw-wipe-cards').onclick = () => {
        if(confirm('Reset Cards & Slots?')) { 
            _save.cards = _defaultSave().cards; 
            _saveGame(); _showHub(); 
        }
    };
    _screens.setup.querySelector('#tw-wipe-stats').onclick = () => {
        if(confirm('Reset Stats, Achievements, Quests & Relics?')) { 
            const def = _defaultSave();
            _save.stats = def.stats; 
            _save.highestWave = def.highestWave;
            _save.highestWavePerDiff = def.highestWavePerDiff;
            _save.maxDiff = def.maxDiff;
            _save.relics = def.relics;
            _save.quests = def.quests;
            _save.achievements = def.achievements;
            _save.equippedTitle = null;
            _saveGame(); _showHub(); 
        }
    };
    _screens.setup.querySelector('#tw-wipe-all').onclick = () => {
        if(confirm('HARD RESET: Delete ALL progress? This cannot be undone.')) { 
            const savedVocab = _save.vocabConfig;
            _save = _defaultSave();
            _save.vocabConfig = savedVocab; 
            _run = {
                active: false, wave: 1, diff: 1, cash: 0, earnedCoinsDrops: 0, earnedCoinsWave: 0,
                knowledgeStacks: 0, combo: 0, abilityCharge: 0, targetMode: 'closest',
                vocabQuestions: 0, vocabCorrect: 0, failedWords: {}, boughtDefense: false,
                levels: { offense: {}, defense: {}, utility: {} },
                autoBuy: { offense: false, defense: false, utility: false }
            };
            _saveGame(); _showHub(); 
        }
    };

    _screens.setup.querySelector('#tw-exit-game').onclick = () => _onExit();
    _screens.setup.querySelector('#tw-start-run').onclick = () => _startRun();
    _screens.setup.querySelector('#tw-resume-run').onclick = () => _resumeRun();
    _screens.setup.querySelector('#tw-abandon-run').onclick = () => {
        if(confirm('Abandon this run? You will lose all unbanked coins!')) {
            _save.currentRun = null;
            _saveGame();
            _showHub();
        }
    };
    _screens.setup.querySelector('#tw-change-deck-btn').onclick = () => _openDeckSelector();

    let selectedDiff = 1;
    const diffVal = _screens.setup.querySelector('#tw-diff-val');
    const targetVal = _screens.setup.querySelector('#tw-target-val');
    const prevBtn = _screens.setup.querySelector('#tw-diff-prev');
    const nextBtn = _screens.setup.querySelector('#tw-diff-next');

    const updateDiffUI = () => {
        diffVal.textContent = selectedDiff;
        _screens.setup.querySelector('#tw-diff-lbl-num').textContent = selectedDiff;
        targetVal.textContent = Math.round(26 * Math.log(selectedDiff) + 10);
        prevBtn.disabled = selectedDiff <= 1;
        nextBtn.disabled = selectedDiff >= (_save ? _save.maxDiff : 1);
        if (_run) _run.diff = selectedDiff;

        if (_save) {
            const hWave = _save.highestWavePerDiff ? (_save.highestWavePerDiff[selectedDiff] || 0) : 0;
            _screens.setup.querySelector('#tw-diff-highest').textContent = hWave;

            let cardCoinBonus = 0;
            if (_save && _save.cards) {
                for (let i = 0; i < _save.cards.unlockedSlots; i++) {
                    const cardId = _save.cards.equipped[i];
                    if (cardId === 'coin') {
                        const count = _save.cards.owned[cardId];
                        const cDef = CARDS[cardId];
                        const lvlInfo = getCardLevelInfo(count, cDef.maxLevel);
                        let actualLvl = lvlInfo.level;
                        if (cDef.maxLevel && actualLvl > cDef.maxLevel) actualLvl = cDef.maxLevel;
                        cardCoinBonus += cDef.base + (actualLvl - 1) * cDef.step;
                    }
                }
            }

            const cBonus = 1 + cardCoinBonus;
            const labYieldBonus = (_save.lab.levels.coinYield || 0) * 0.1;
            const labYield = 1 + labYieldBonus;
            const totalMult = selectedDiff * cBonus * labYield;

            _screens.setup.querySelector('#tw-mi-tier').textContent = `x${selectedDiff.toFixed(2)}`;
            _screens.setup.querySelector('#tw-mi-lab').textContent = `+${Math.round(labYieldBonus * 100)}%`;
            _screens.setup.querySelector('#tw-mi-card').textContent = `+${Math.round(cardCoinBonus * 100)}%`;
            _screens.setup.querySelector('#tw-mi-total').textContent = `x${totalMult.toFixed(2)}`;

            const diffBaseSpan = _screens.setup.querySelector('#tw-diff-base-mult');
            if (diffBaseSpan) diffBaseSpan.textContent = selectedDiff;
            _screens.setup.querySelector('#tw-diff-coin-mult').textContent = 'x' + totalMult.toFixed(2);
        }
    };
    prevBtn.onclick = () => { selectedDiff--; updateDiffUI(); };
    nextBtn.onclick = () => { selectedDiff++; updateDiffUI(); };

    _engine = new TowerEngine(_screens.game.querySelector('#tw-canvas'), {
        onHpUpdate: () => _updateRunHUD(),
        onEnemyKill: (cash, x, y, type) => {
            _run.cash += cash;
            
            let coinDrop = 0;
            if (type === 'boss') {
                coinDrop = 5 * _run.diff;
                _save.stats.bossesKilled = (_save.stats.bossesKilled || 0) + 1;
                _updateQuest('kill_bosses', 1);
            } else {
                let chance = 0.02;
                if (['fast','tank','ranged','healer','shielded','spawner'].includes(type)) chance = 0.05;
                if (Math.random() < chance) coinDrop = 1;
            }
            if (type === 'spawner') {
                _updateQuest('kill_spawners', 1);
            }
            
            if (coinDrop > 0) {
                let finalDrop = Math.floor(coinDrop * (_engine.stats.coinBonus || 1) * (1 + (_save.lab.levels.coinYield || 0) * 0.1));
                if (finalDrop < 1) finalDrop = 1;
                _run.earnedCoinsDrops += finalDrop;
                _engine.spawnFloatText(`+${finalDrop} 🪙`, '#f1c40f', false, x, y - 20);
            }
            
            _checkAchievements();
            _updateRunHUD();
            _renderRunUpgrades();
        },
        onWaveComplete: () => {
            let waveCash = _engine.stats.cashWave || 0;
            let interest = Math.floor(_run.cash * (_engine.stats.interest || 0));
            if (waveCash + interest > 0) {
                _run.cash += waveCash + interest;
                _engine.spawnFloatText(`+$${Math.floor(waveCash + interest)}`, '#2ecc71', true);
            }

            let waveBaseCoins = (_run.wave * _run.diff);
            let waveCoins = Math.floor(waveBaseCoins + (_engine.stats.coinsWave || 0));
            waveCoins = Math.floor(waveCoins * (_engine.stats.coinBonus || 1));
            waveCoins = Math.floor(waveCoins * (1 + (_save.lab.levels.coinYield || 0) * 0.1));
            
            _run.earnedCoinsWave += waveCoins;
            
            if (!_run.boughtDefense) {
                _updateQuest('reach_wave_no_def', _run.wave);
            }

            _run.wave++;
            if (_save && _save.lab.levels.startingCash >= 5) {
                _run.cash = Math.floor(_run.cash * 1.02);
            }
            _checkUnlock();
            _checkAchievements();
            _startNextWave();
        },
        onPlayerDie: () => _handleDeath(),
        hasRelic: (id) => _save && _save.relics.includes(id)
    });

    setInterval(_labTicker, 1000);
    setInterval(_autoBuyTicker, 250);
    init._updateDiffUI = updateDiffUI;
}

export function launch() {
    _save = JSON.parse(localStorage.getItem(SAVE_KEY)) || _defaultSave();
    
    if (!_save.gems) _save.gems = 0;
    if (_save.currentRun === undefined) _save.currentRun = null;
    if (!_save.highestWavePerDiff) {
        _save.highestWavePerDiff = {};
        if (_save.highestWave > 0) {
            _save.highestWavePerDiff[1] = _save.highestWave;
        }
    }
    if (!_save.login) _save.login = { lastDate: null, streakDays: 0 };
    if (!_save.quests) _save.quests = { date: null, active:[] };
    if (!_save.cards) _save.cards = { owned: {}, equipped:[null], unlockedSlots: 1 };
    
    if (!_save.workshop.unlocks) _save.workshop.unlocks = {};
    if (!_save.workshop.offense) _save = _defaultSave();
    if (!_save.workshopMults) _save.workshopMults = {};
    if (!_save.runMults) _save.runMults = {};
    
    if (_save.workshop.offense.dmgMeter === undefined) _save.workshop.offense.dmgMeter = 0;
    if (_save.workshop.offense.bounce === undefined) _save.workshop.offense.bounce = 0;
    if (_save.workshop.offense.splashDmg === undefined) _save.workshop.offense.splashDmg = 0;
    if (_save.workshop.defense.knockback === undefined) _save.workshop.defense.knockback = 0;
    if (_save.workshop.defense.defyDeath === undefined) _save.workshop.defense.defyDeath = 0;
    
    if (_save.workshop.utility) {
        if (_save.workshop.utility.freeUpg !== undefined) {
            _save.workshop.utility.freeUpgOffense = _save.workshop.utility.freeUpg;
            _save.workshop.utility.freeUpgDefense = _save.workshop.utility.freeUpg;
            _save.workshop.utility.freeUpgUtility = _save.workshop.utility.freeUpg;
            delete _save.workshop.utility.freeUpg;
        }
        if (_save.workshop.utility.cashWave === undefined) _save.workshop.utility.cashWave = 0;
        if (_save.workshop.utility.coinBonus === undefined) _save.workshop.utility.coinBonus = 0;
        if (_save.workshop.utility.coinsWave === undefined) _save.workshop.utility.coinsWave = 0;
        if (_save.workshop.utility.cashBonus === undefined) _save.workshop.utility.cashBonus = 0;
        if (_save.workshop.utility.interest === undefined) _save.workshop.utility.interest = 0;
        if (_save.workshop.utility.freeUpgOffense === undefined) _save.workshop.utility.freeUpgOffense = 0;
        if (_save.workshop.utility.freeUpgDefense === undefined) _save.workshop.utility.freeUpgDefense = 0;
        if (_save.workshop.utility.freeUpgUtility === undefined) _save.workshop.utility.freeUpgUtility = 0;
    }

    if (_save.lab.levels.startingCash === undefined) _save.lab.levels.startingCash = 0;
    if (_save.lab.levels.synergy === undefined) _save.lab.levels.synergy = 0;
    if (_save.lab.levels.freeUpg === undefined) _save.lab.levels.freeUpg = 0;
    if (_save.lab.levels.damageMult === undefined) _save.lab.levels.damageMult = 0;
    if (_save.lab.levels.critChance === undefined) _save.lab.levels.critChance = 0;
    if (_save.lab.levels.rangeMult === undefined) _save.lab.levels.rangeMult = 0;
    if (_save.lab.levels.vocabMastery === undefined) _save.lab.levels.vocabMastery = 0;
    if (_save.lab.levels.healthMult === undefined) _save.lab.levels.healthMult = 0;
    if (_save.lab.levels.regenMult === undefined) _save.lab.levels.regenMult = 0;
    if (_save.lab.levels.defPct === undefined) _save.lab.levels.defPct = 0;
    if (_save.lab.levels.thornsMult === undefined) _save.lab.levels.thornsMult = 0;
    if (_save.lab.levels.lifesteal === undefined) _save.lab.levels.lifesteal = 0;
    if (_save.lab.levels.cashBonusMult === undefined) _save.lab.levels.cashBonusMult = 0;

    if (!_save.stats) _save.stats = { totalCorrect: 0, sessionCorrect: 0, highestStreak: 0, wordsMastered:[], bossesKilled: 0, highestWaveNoDef: 0 };
    if (_save.stats.bossesKilled === undefined) _save.stats.bossesKilled = 0;
    if (_save.stats.highestWaveNoDef === undefined) _save.stats.highestWaveNoDef = 0;
    if (!_save.relics) _save.relics =[];
    if (!_save.achievements) _save.achievements = {};
    if (_save.equippedTitle === undefined) _save.equippedTitle = null;

    if (!_save.bases) _save.bases = { unlocked: ['default'], equipped: 'default', levels: { default: 0, sniper: 0, mage: 0, banker: 0 } };
    if (!_save.ascension) _save.ascension = { points: 0, timesAscended: 0 };
    
    _save.stats.sessionCorrect = 0;

    setGvmTheme('dark');

    _vocabMgr = new GameVocabManager(_save.vocabConfig);
    const srsPool = GameVocabManager.loadSrsPool();
    
    if (srsPool.length > 0) {
        _vocabMgr.setPool(srsPool, 'tower_banned', { globalSrs: true });
        _checkDailyLogin();
        _generateDailyQuests();
        _checkAchievements();
        _showHub();
    } else {
        _openDeckSelector();
    }
}

function _saveGame() {
    if (_vocabMgr && !_vocabMgr.isGlobalSrs) {
        _save.vocabState = _vocabMgr.exportState();
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(_save));
}

function _saveRunSnapshot() {
    if (!_run || !_run.active) return;
    _run.currentHp = _engine && _engine.stats ? _engine.stats.currentHp : undefined;
    _save.currentRun = JSON.parse(JSON.stringify(_run));
    _saveGame();
}

function _showHub() {
    // Reset run multipliers for accurate hub stats
    if (_run) {
        _run.knowledgeStacks = 0;
        _run.combo = 0;
        _run.diff = _save.maxDiff || 1;
    }

    _screens.setup.style.display = 'block';
    _screens.game.style.display = 'none';
    _musicStop();
    
    _updateEquippedTitleUI();
    _updateTowerVisual();

    _screens.setup.querySelector('#tw-hub-coins').textContent = Math.floor(_save.coins);
    _screens.setup.querySelector('#tw-hub-gems').textContent = Math.floor(_save.gems);
    
    if (_save.currentRun && _save.currentRun.active) {
        _screens.setup.querySelector('#tw-new-run-setup').style.display = 'none';
        _screens.setup.querySelector('#tw-resume-run-setup').style.display = 'block';
        _screens.setup.querySelector('#tw-resume-tier').textContent = _save.currentRun.diff;
        _screens.setup.querySelector('#tw-resume-wave').textContent = _save.currentRun.wave;
    } else {
        _screens.setup.querySelector('#tw-new-run-setup').style.display = 'block';
        _screens.setup.querySelector('#tw-resume-run-setup').style.display = 'none';
    }

    if (typeof init._updateDiffUI === 'function') init._updateDiffUI();

    _renderWorkshop();
    _renderLab();
    _renderStats();
    _renderRelics();
    _renderQuests();
    _renderCards();
    _renderLoginTab();
    _renderAchievements();
    _renderTowers();
    
    renderVocabSettings(
        _vocabMgr,
        _screens.setup.querySelector('#tw-vocab-settings-mount'),
        (config) => {
            _save.vocabConfig = config;
            _saveGame();
        },
        _vocabMgr.getPoolSource()
    );
}

function _updateEquippedTitleUI() {
    const el = _screens.setup.querySelector('#tw-equipped-title');
    if (_save && _save.equippedTitle) {
        el.textContent = _save.equippedTitle;
        el.style.display = 'inline-block';
    } else {
        el.style.display = 'none';
    }
}

function _checkAchievements() {
    if (!_save.achievements) _save.achievements = {};
    let unlocked = false;

    const check = (id, cond) => {
        if (!_save.achievements[id] && cond()) {
            _save.achievements[id] = true;
            unlocked = true;
            if (_engine) _engine.spawnFloatText('ACHIEVEMENT UNLOCKED!', '#f1c40f', true);
        }
    };

    check('first_boss', () => _save.stats.bossesKilled > 0);
    check('vocab_100', () => _save.stats.totalCorrect >= 100);
    check('vocab_1000', () => _save.stats.totalCorrect >= 1000);
    check('wave_50', () => _save.highestWave >= 50);
    check('wave_100', () => _save.highestWave >= 100);
    check('no_def_30', () => _save.stats.highestWaveNoDef >= 30);
    check('max_cards', () => _save.cards && _save.cards.unlockedSlots >= 5);

    if (unlocked) {
        _saveGame();
        if (typeof init._updateDiffUI === 'function') init._updateDiffUI();
        if (_screens.setup.style.display !== 'none') _renderAchievements();
    }
}

function _getNextBaseCost() {
    let bought = _save.bases.unlocked.length - 1; 
    let mult = Math.pow(2, bought);
    return { coins: 100000 * mult, gems: 125 * mult };
}

function _formatMods(mods) {
    let s = '';
    if (mods.rangeMult) s += `Range: ${mods.rangeMult > 0 ? '+' : ''}${Math.round(mods.rangeMult*100)}%<br>`;
    if (mods.critChanceAdd) s += `Crit Chance: +${Math.round(mods.critChanceAdd*100)}%<br>`;
    if (mods.atkSpeedMult) s += `Atk Speed: ${mods.atkSpeedMult > 0 ? '+' : ''}${Math.round(mods.atkSpeedMult*100)}%<br>`;
    if (mods.splashDmgAdd) s += `Splash Dmg: +${Math.round(mods.splashDmgAdd*100)}%<br>`;
    if (mods.disableBounce) s += `Cannot Bounce<br>`;
    if (mods.damageMult) s += `Damage: ${mods.damageMult > 0 ? '+' : ''}${Math.round(mods.damageMult*100)}%<br>`;
    if (mods.coinCashMult) s += `Coins/Cash: +${Math.round(mods.coinCashMult*100)}%<br>`;
    return s || 'None';
}

function _ascend(apGain) {
    _save.ascension.points += apGain;
    _save.ascension.timesAscended++;
    
    const def = _defaultSave();
    _save.workshop = def.workshop;
    _save.workshopMults = def.workshopMults;
    _save.runMults = def.runMults;
    _save.lab = def.lab;
    _save.highestWave = 0;
    _save.highestWavePerDiff = {};
    _save.maxDiff = 1;
    _save.currentRun = null;
    
    _saveGame();
    _showHub();
    alert(`Ascension Complete! You gained ${apGain} Ascension Points.`);
}

function _updateTowerVisual() {
    const baseId = _save.bases.equipped || 'default';
    const baseDef = TOWER_BASES[baseId];
    if (baseDef) {
        const crystal = _screens.setup.querySelector('.tw-tower-crystal');
        const tBody = _screens.setup.querySelector('.tw-tower-body');
        const tBase = _screens.setup.querySelector('.tw-tower-base');
        
        if (crystal) crystal.style.textShadow = `0 0 25px ${baseDef.color}`;
        if (tBody) {
            tBody.style.borderColor = baseDef.color;
            tBody.style.boxShadow = `inset 0 0 15px ${baseDef.color}33, 0 0 10px ${baseDef.color}1a`;
        }
        if (tBase) {
            tBase.style.borderColor = baseDef.color;
            tBase.style.boxShadow = `0 0 15px ${baseDef.color}4d`;
        }
    }
}

function _renderTowers() {
    const apVal = _screens.setup.querySelector('#tw-ap-val');
    const apGain = _screens.setup.querySelector('#tw-ap-gain');
    const ascendBtn = _screens.setup.querySelector('#tw-ascend-btn');
    const list = _screens.setup.querySelector('#tw-bases-list');

    if (!apVal || !list) return;

    apVal.textContent = _save.ascension.points;
    
    let possibleGain = Math.max(0, _save.maxDiff - 14);
    apGain.textContent = possibleGain;
    ascendBtn.disabled = possibleGain <= 0;
    
    ascendBtn.onclick = () => {
        if (possibleGain > 0) {
            if (confirm(`Ascend now to gain ${possibleGain} Ascension Points?\n\nThis will RESET your Workshop, Lab, Highest Wave, and Max Tier back to 1. You will KEEP your Coins, Gems, Cards, Relics, Stats, and Unlocked Towers.`)) {
                _ascend(possibleGain);
            }
        }
    };

    list.innerHTML = '';
    
    let unlockCost = _getNextBaseCost();

    for (const id in TOWER_BASES) {
        const def = TOWER_BASES[id];
        const isUnlocked = _save.bases.unlocked.includes(id);
        const isEquipped = _save.bases.equipped === id;
        const lvl = _save.bases.levels[id] || 0;
        const isMax = def.maxLevel && lvl >= def.maxLevel;
        
        const mods = def.getModifiers(lvl);
        const nextMods = !isMax && def.maxLevel ? def.getModifiers(lvl + 1) : null;

        const row = document.createElement('div');
        row.style.cssText = `background:rgba(20,20,30,0.8); border:1px solid ${def.color}; border-radius:8px; padding:12px;`;
        
        let html = `<div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
                <div style="font-size:15px; font-weight:bold; color:${def.color};">${def.name} ${isUnlocked && def.maxLevel ? `<span style="font-size:11px; color:#aaa;">Lv${lvl}/${def.maxLevel}</span>` : ''}</div>
                <div style="font-size:11px; color:#bbb; margin-top:4px;">${def.desc}</div>
            </div>
        `;

        if (isUnlocked) {
            html += `<button class="tw-play-btn" style="width:auto; padding:6px 12px; font-size:12px; background:${isEquipped ? '#2ecc71' : 'transparent'}; border:1px solid ${isEquipped ? '#2ecc71' : def.color}; color:${isEquipped ? '#fff' : def.color};">${isEquipped ? 'Equipped' : 'Equip'}</button>`;
        } else {
            html += `<button class="tw-play-btn tw-buy-base-btn" style="width:auto; padding:6px 12px; font-size:12px; background:transparent; border:1px solid #f1c40f; color:#f1c40f;" ${(_save.coins < unlockCost.coins || _save.gems < unlockCost.gems) ? 'disabled' : ''}>Unlock<br><span style="font-size:10px;">🪙${unlockCost.coins} 💎${unlockCost.gems}</span></button>`;
        }
        html += `</div>`;

        if (isUnlocked && def.maxLevel) {
            html += `<div style="margin-top:10px; background:rgba(0,0,0,0.5); padding:8px; border-radius:6px; font-size:11px; color:#ccc; display:flex; justify-content:space-between; align-items:center;">
                <div style="flex:1;">${_formatMods(mods)}</div>
                ${!isMax ? `<div style="flex:1; color:#2ecc71;">Next Lvl:<br>${_formatMods(nextMods)}</div>` : '<div style="flex:1; color:#f1c40f; font-weight:bold; text-align:center;">MAX LEVEL</div>'}
            </div>`;
            
            if (!isMax) {
                html += `<div style="margin-top:10px; text-align:right;">
                    <button class="tw-play-btn tw-upg-base-btn" style="width:auto; padding:6px 12px; font-size:12px; background:#9b59b6; color:#fff;" ${_save.ascension.points < 1 ? 'disabled' : ''}>Upgrade (1 AP)</button>
                </div>`;
            }
        } else if (isUnlocked && !def.maxLevel) {
             html += `<div style="margin-top:10px; font-size:11px; color:#777;">No upgradeable modifiers.</div>`;
        }

        row.innerHTML = html;
        
        if (isUnlocked) {
            const eqBtn = row.querySelector('button');
            if (eqBtn && !eqBtn.classList.contains('tw-upg-base-btn')) {
                eqBtn.onclick = () => {
                    _save.bases.equipped = id;
                    _saveGame();
                    _renderTowers();
                    _updateTowerVisual();
                };
            }
            const upgBtn = row.querySelector('.tw-upg-base-btn');
            if (upgBtn) {
                upgBtn.onclick = () => {
                    if (_save.ascension.points >= 1) {
                        _save.ascension.points -= 1;
                        _save.bases.levels[id]++;
                        _saveGame();
                        _renderTowers();
                    }
                };
            }
        } else {
            const buyBtn = row.querySelector('.tw-buy-base-btn');
            if (buyBtn) {
                buyBtn.onclick = () => {
                    if (_save.coins >= unlockCost.coins && _save.gems >= unlockCost.gems) {
                        _save.coins -= unlockCost.coins;
                        _save.gems -= unlockCost.gems;
                        _save.bases.unlocked.push(id);
                        _save.bases.levels[id] = 0;
                        _saveGame();
                        _screens.setup.querySelector('#tw-hub-coins').textContent = Math.floor(_save.coins);
                        _screens.setup.querySelector('#tw-hub-gems').textContent = Math.floor(_save.gems);
                        _renderTowers();
                    }
                };
            }
        }

        list.appendChild(row);
    }
}

// ─── DAILY LOGIN & QUESTS ───────────────────────────────────────────────────

function _checkDailyLogin() {
    const today = new Date().toDateString();
    if (_save.login.lastDate !== today) {
        _save.login.lastDate = today;
        _save.login.streakDays = (_save.login.streakDays || 0) + 1;
        
        let rewardCoins = 0;
        let rewardGems = 0;

        if (_save.login.streakDays % 28 === 0) rewardGems = 100;
        else if (_save.login.streakDays % 7 === 0) rewardGems = 20;
        else rewardCoins = 50 * ((_save.login.streakDays % 7) || 7);

        const popup = _screens.setup.querySelector('#tw-daily-popup');
        const rwdEl = popup.querySelector('#tw-login-reward');
        popup.querySelector('#tw-login-day').textContent = _save.login.streakDays;
        
        if (rewardGems > 0) {
            rwdEl.innerHTML = `<span style="color:#00a8ff">+${rewardGems} 💎</span>`;
            _save.gems += rewardGems;
        } else {
            rwdEl.innerHTML = `<span style="color:#f1c40f">+${rewardCoins} 🪙</span>`;
            _save.coins += rewardCoins;
        }

        popup.style.display = 'flex';
        popup.querySelector('#tw-login-claim').onclick = () => {
            popup.style.display = 'none';
            _saveGame();
            _showHub();
        };
    }
}

function _renderLoginTab() {
    const streakEl = _screens.setup.querySelector('#tw-login-streak-val');
    const weeksEl = _screens.setup.querySelector('#tw-login-weeks');
    
    streakEl.textContent = _save.login.streakDays || 0;
    
    let html = '';
    const cycle = Math.floor(Math.max(0, (_save.login.streakDays || 1) - 1) / 28);
    
    for (let w = 0; w < 4; w++) {
        html += `<div style="background:rgba(20,20,30,0.8); border:1px solid #333; border-radius:8px; padding:10px;">
            <div style="font-size:11px; color:#888; margin-bottom:8px; font-weight:bold; text-transform:uppercase;">Week ${cycle * 4 + w + 1}</div>
            <div style="display:flex; gap:5px; justify-content:space-between;">`;
        for (let d = 1; d <= 7; d++) {
            const day = cycle * 28 + w * 7 + d;
            let rewGems = 0, rewCoins = 0;
            if (day % 28 === 0) rewGems = 100;
            else if (day % 7 === 0) rewGems = 20;
            else rewCoins = 50 * ((day % 7) || 7); 

            const isPast = day <= _save.login.streakDays;
            const isToday = day === _save.login.streakDays;
            
            let bg = isToday ? 'background:rgba(46,204,113,0.2); border-color:#2ecc71;' : (isPast ? 'background:rgba(255,255,255,0.05); border-color:#555; opacity:0.5;' : 'background:rgba(0,0,0,0.5); border-color:#333;');
            
            let icon = rewGems ? '💎' : '🪙';
            let amt = rewGems || rewCoins;
            let color = rewGems ? '#00a8ff' : '#f1c40f';

            html += `<div style="flex:1; border:1px solid; border-radius:6px; padding:8px 0; text-align:center; ${bg}">
                <div style="font-size:10px; color:#aaa; margin-bottom:4px;">Day ${day}</div>
                <div style="font-size:14px;">${icon}</div>
                <div style="font-size:11px; font-weight:bold; color:${color}; margin-top:2px;">${amt}</div>
                ${isPast ? '<div style="font-size:10px; color:#2ecc71; margin-top:2px;">✓</div>' : ''}
            </div>`;
        }
        html += `</div></div>`;
    }
    weeksEl.innerHTML = html;
}

function _generateDailyQuests() {
    const today = new Date().toDateString();
    if (_save.quests.date !== today) {
        _save.quests.date = today;
        const shuffled =[...QUEST_TEMPLATES].sort(() => 0.5 - Math.random());
        _save.quests.active = shuffled.slice(0, 3).map(q => ({
            id: q.id,
            desc: q.desc,
            max: q.max,
            type: q.type || 'add',
            rewardType: q.rewardType,
            rewardAmount: q.rewardAmount,
            progress: 0,
            claimed: false
        }));
        _saveGame();
    }
}

function _updateQuest(id, val) {
    if (!_save || !_save.quests) return;
    for (let q of _save.quests.active) {
        if (q.id === id && !q.claimed) {
            if (q.type === 'highest_wave') q.progress = Math.max(q.progress, val);
            else q.progress += val;
            
            if (q.progress > q.max) q.progress = q.max;
        }
    }
}

function _renderQuests() {
    const list = _screens.setup.querySelector('#tw-quests-list');
    list.innerHTML = '';
    
    if (!_save.quests || !_save.quests.active) return;
    
    for (let q of _save.quests.active) {
        const row = document.createElement('div');
        row.className = 'tw-quest-card';
        
        let pct = Math.min(100, (q.progress / q.max) * 100);
        let icon = q.rewardType === 'gems' ? '💎' : '🪙';
        
        row.innerHTML = `
            <div class="tw-quest-info">
                <div class="tw-quest-title">${q.desc}</div>
                <div style="font-size:11px; color:#aaa;">${q.progress} / ${q.max}</div>
                <div class="tw-quest-prog-wrap"><div class="tw-quest-prog-fill" style="width:${pct}%"></div></div>
            </div>
            <button class="tw-quest-claim" ${q.claimed || q.progress < q.max ? 'disabled' : ''} style="${q.claimed ? 'background:#2ecc71;' : ''}">
                ${q.claimed ? 'Claimed' : `Claim ${q.rewardAmount} ${icon}`}
            </button>
        `;
        
        const btn = row.querySelector('.tw-quest-claim');
        if (!q.claimed && q.progress >= q.max) {
            btn.onclick = () => {
                q.claimed = true;
                if (q.rewardType === 'gems') _save.gems += q.rewardAmount;
                else _save.coins += q.rewardAmount;
                _saveGame();
                _showHub();
            };
        }
        list.appendChild(row);
    }
}

// ─── CARDS & WORKSHOP ───────────────────────────────────────────────────────

function _pullCards(amount) {
    if (_save.gems < 20 * amount) return;
    
    let availableCards =[];
    for (let id in CARDS) {
        let cDef = CARDS[id];
        let owned = _save.cards.owned[id] || 0;
        let maxLvl = cDef.maxLevel || 7;
        let maxCards = (1 << maxLvl) - 1; 
        if (owned < maxCards) {
            availableCards.push({ id, rarity: cDef.rarity });
        }
    }
    
    if (availableCards.length === 0) {
        alert("All cards are currently maxed out!");
        return;
    }

    _save.gems -= 20 * amount;
    const rarityWeights = { 'common': 50, 'rare': 25, 'epic': 15, 'mythic': 8, 'ssr': 2 };
    
    let pulled =[];
    
    for (let i = 0; i < amount; i++) {
        let currentWeights = { 'common': 0, 'rare': 0, 'epic': 0, 'mythic': 0, 'ssr': 0 };
        let validRarities = new Set(availableCards.map(c => c.rarity));
        let totalWeight = 0;
        
        for (let r of validRarities) {
            currentWeights[r] = rarityWeights[r];
            totalWeight += rarityWeights[r];
        }

        let roll = Math.random() * totalWeight;
        let selectedRarity = 'common';
        let cum = 0;
        for (let r in currentWeights) {
            if (currentWeights[r] > 0) {
                cum += currentWeights[r];
                if (roll <= cum) {
                    selectedRarity = r;
                    break;
                }
            }
        }

        let cardsOfRarity = availableCards.filter(c => c.rarity === selectedRarity);
        let pickedId = cardsOfRarity[Math.floor(Math.random() * cardsOfRarity.length)].id;
        pulled.push(pickedId);
        
        _save.cards.owned[pickedId] = (_save.cards.owned[pickedId] || 0) + 1;
        
        let cDef = CARDS[pickedId];
        let maxLvl = cDef.maxLevel || 7;
        let maxCards = (1 << maxLvl) - 1;
        if (_save.cards.owned[pickedId] >= maxCards) {
            availableCards = availableCards.filter(c => c.id !== pickedId);
            if (availableCards.length === 0 && i < amount - 1) {
                break; 
            }
        }
    }
    
    _saveGame();
    _checkAchievements();
    _showHub();

    const modal = _screens.setup.querySelector('#tw-card-pull-modal');
    const container = modal.querySelector('#tw-card-pull-container');
    const closeBtn = modal.querySelector('#tw-card-pull-close');
    
    container.innerHTML = '';
    closeBtn.style.display = 'none';
    modal.style.display = 'flex';

    pulled.forEach((id, idx) => {
        const cDef = CARDS[id];
        const el = document.createElement('div');
        el.className = 'tw-card-flip-container';
        el.innerHTML = `
            <div class="tw-card-flipper" id="flipper-${idx}">
                <div class="tw-card-back">?</div>
                <div class="tw-card-front tw-card" data-rarity="${cDef.rarity}" style="min-height:100%;">
                    <div class="tw-card-name">${cDef.name}</div>
                    <div class="tw-card-desc">${cDef.desc.replace('%', '')}</div>
                </div>
            </div>
        `;
        container.appendChild(el);
        
        setTimeout(() => {
            el.querySelector(`#flipper-${idx}`).classList.add('flipped');
            if (idx === pulled.length - 1) {
                setTimeout(() => { closeBtn.style.display = 'block'; }, 500);
            }
        }, 300 + (idx * 200));
    });

    closeBtn.onclick = () => {
        modal.style.display = 'none';
        _renderCards();
    };
}

function _renderCards() {
    const slotsEl = _screens.setup.querySelector('#tw-cards-slots');
    const invEl = _screens.setup.querySelector('#tw-cards-inv');
    const btn1 = _screens.setup.querySelector('#tw-buy-card-1-btn');
    const btn10 = _screens.setup.querySelector('#tw-buy-card-10-btn');
    const unlockBtn = _screens.setup.querySelector('#tw-unlock-slot-btn');

    slotsEl.innerHTML = '';
    invEl.innerHTML = '';

    btn1.disabled = _save.gems < 20;
    btn1.onclick = () => _pullCards(1);
    btn10.disabled = _save.gems < 200;
    btn10.onclick = () => _pullCards(10);

    if (_save.cards.unlockedSlots < SLOT_COSTS.length) {
        const cost = SLOT_COSTS[_save.cards.unlockedSlots];
        unlockBtn.style.display = 'block';
        unlockBtn.textContent = `Unlock Slot · 🪙 ${cost.coins}  💎 ${cost.gems}`;
        unlockBtn.disabled = _save.coins < cost.coins || _save.gems < cost.gems;
        unlockBtn.onclick = () => {
            if (_save.coins >= cost.coins && _save.gems >= cost.gems) {
                _save.coins -= cost.coins;
                _save.gems -= cost.gems;
                _save.cards.unlockedSlots++;
                _save.cards.equipped.push(null);
                _saveGame();
                _checkAchievements();
                _showHub();
            }
        };
    } else {
        unlockBtn.style.display = 'none';
    }

    const _makeCardEl = (id, count, isEquippedSlotIdx) => {
        const cDef = CARDS[id];
        const lvlInfo = getCardLevelInfo(count, cDef.maxLevel);
        let actualLvl = lvlInfo.level;
        if (cDef.maxLevel && actualLvl > cDef.maxLevel) actualLvl = cDef.maxLevel;
        let val = cDef.base + (actualLvl - 1) * cDef.step;
        let desc = cDef.isFlat
            ? cDef.desc.replace('X', Math.floor(val))
            : cDef.desc.replace('%', (val * 100).toFixed(0) + '%');

        const isEquipped = isEquippedSlotIdx >= 0;
        const el = document.createElement('div');
        el.className = `tw-card ${isEquipped ? 'equipped' : ''} ${lvlInfo.isMax ? 'maxed' : ''}`;
        el.setAttribute('data-rarity', cDef.rarity);
        el.innerHTML = `
            ${isEquipped ? '<div class="tw-card-equipped-badge">✦</div>' : ''}
            <div class="tw-card-name">${cDef.name}</div>
            <div class="tw-card-desc">${desc}</div>
            <div class="tw-card-lvl">Lv${actualLvl}${lvlInfo.isMax ? ' ★' : ''}</div>
            ${!lvlInfo.isMax ? `<div class="tw-card-prog"><div class="tw-card-prog-fill" style="width:${(lvlInfo.progress/lvlInfo.goal)*100}%"></div></div>` : ''}
        `;
        el.onclick = () => {
            if (isEquipped) {
                _save.cards.equipped[isEquippedSlotIdx] = null;
            } else {
                let firstEmpty = _save.cards.equipped.indexOf(null);
                if (firstEmpty !== -1 && !_save.cards.equipped.includes(id)) {
                    _save.cards.equipped[firstEmpty] = id;
                }
            }
            _saveGame();
            _renderCards();
        };
        return el;
    };

    for (let i = 0; i < _save.cards.unlockedSlots; i++) {
        const id = _save.cards.equipped[i];
        if (id) {
            slotsEl.appendChild(_makeCardEl(id, _save.cards.owned[id], i));
        } else {
            const empty = document.createElement('div');
            empty.className = 'tw-card-slot';
            empty.textContent = '+';
            slotsEl.appendChild(empty);
        }
    }

    const RARITIES =[
        { key: 'ssr',    label: 'SSR',    color: '#ff6ef7' },
        { key: 'mythic', label: 'Mythic', color: '#e74c3c' },
        { key: 'epic',   label: 'Epic',   color: '#9b59b6' },
        { key: 'rare',   label: 'Rare',   color: '#3498db' },
        { key: 'common', label: 'Common', color: '#bdc3c7' }
    ];

    for (const { key, label, color } of RARITIES) {
        const cardsOfRarity = Object.entries(CARDS).filter(([, def]) => def.rarity === key);
        if (cardsOfRarity.length === 0) continue;

        const section = document.createElement('div');
        section.className = 'tw-rarity-section';

        const header = document.createElement('div');
        header.className = 'tw-rarity-header';
        header.innerHTML = `<span style="color:${color}">${label}</span><span class="tw-rarity-count" style="color:${color}"></span>`;
        section.appendChild(header);

        const row = document.createElement('div');
        row.className = 'tw-rarity-row';

        let ownedCount = 0;
        for (const [id, cDef] of cardsOfRarity) {
            const count = _save.cards.owned[id] || 0;
            const equippedIdx = _save.cards.equipped.indexOf(id);
            const isOwned = count > 0;
            ownedCount += isOwned ? 1 : 0;

            if (isOwned) {
                const cardEl = _makeCardEl(id, count, equippedIdx);
                if (equippedIdx >= 0) cardEl.classList.add('tw-card-in-equipped');
                row.appendChild(cardEl);
            } else {
                const ghost = document.createElement('div');
                ghost.className = 'tw-card tw-card-ghost';
                ghost.setAttribute('data-rarity', key);
                ghost.innerHTML = `<div class="tw-card-ghost-q">?</div><div class="tw-card-ghost-name">${cDef.name}</div>`;
                row.appendChild(ghost);
            }
        }

        header.querySelector('.tw-rarity-count').textContent = `${ownedCount}/${cardsOfRarity.length}`;
        section.appendChild(row);
        invEl.appendChild(section);
    }
}

function _renderAchievements() {
    if (!_save.achievements) _save.achievements = {};
    const list = _screens.setup.querySelector('#tw-achievements-list');
    const buffVal = _screens.setup.querySelector('#tw-ach-buff-val');
    
    let unlockedCount = Object.keys(_save.achievements).length;
    if(buffVal) buffVal.textContent = unlockedCount;
    
    if (list) {
        list.innerHTML = '';
        
        for (const key in ACHIEVEMENTS) {
            const ach = ACHIEVEMENTS[key];
            const isUnlocked = !!_save.achievements[key];
            const isEquipped = _save.equippedTitle === ach.title;
            
            const row = document.createElement('div');
            row.style.cssText = `background: rgba(20,20,30,0.8); border: 1px solid ${isUnlocked ? '#f1c40f' : '#333'}; border-radius: 8px; padding: 12px; display:flex; justify-content:space-between; align-items:center; opacity: ${isUnlocked ? '1' : '0.5'}`;
            
            row.innerHTML = `
                <div>
                    <div style="font-size:14px; font-weight:bold; color:${isUnlocked ? '#f1c40f' : '#888'};">${ach.name}</div>
                    <div style="font-size:11px; color:#aaa; margin-top:4px;">${ach.desc}</div>
                    ${isUnlocked ? `<div style="font-size:10px; color:#c39bd3; margin-top:6px; font-weight:bold;">Title: [${ach.title}]</div>` : ''}
                </div>
                ${isUnlocked ? `<button class="tw-play-btn" style="width:auto; padding:6px 12px; font-size:11px; background:${isEquipped ? '#2ecc71' : 'transparent'}; border:1px solid ${isEquipped ? '#2ecc71' : '#c39bd3'}; color:${isEquipped ? '#fff' : '#c39bd3'};">${isEquipped ? 'Equipped' : 'Equip Title'}</button>` : '<div style="font-size:24px;">🔒</div>'}
            `;
            
            if (isUnlocked) {
                const btn = row.querySelector('button');
                btn.onclick = () => {
                    _save.equippedTitle = ach.title;
                    _saveGame();
                    _renderAchievements();
                    _updateEquippedTitleUI();
                };
            }
            list.appendChild(row);
        }
    }
}

function _renderWorkshop() {
    for (const cat of['offense', 'defense', 'utility']) {
        const container = _screens.setup.querySelector(`#tw-ws-${cat}`);
        container.innerHTML = '';
        
        for (const id in UPGRADES[cat]) {
            const def = UPGRADES[cat][id];
            const lvl = _save.workshop[cat][id] || 0;
            const isLocked = def.reqUnlock && !_save.workshop.unlocks[id];
            
            const row = document.createElement('div');
            row.className = 'tw-upg-row';
            
            if (isLocked) {
                row.innerHTML = `
                    <div class="tw-upg-info">
                        <div class="tw-upg-name" style="color:#777;">🔒 ${def.name}</div>
                        <div class="tw-upg-val">Requires Unlock</div>
                    </div>
                    <button class="tw-upg-buy" ${(_save.coins < def.unlockCost) ? 'disabled' : ''}>
                        🪙 ${def.unlockCost}
                    </button>
                `;
                row.querySelector('button').onclick = () => {
                    if (_save.coins >= def.unlockCost) {
                        _save.coins -= def.unlockCost;
                        _save.workshop.unlocks[id] = true;
                        _saveGame();
                        _renderWorkshop(); 
                        _screens.setup.querySelector('#tw-hub-coins').textContent = Math.floor(_save.coins);
                    }
                };
            } else {
                if (def.max !== undefined && lvl >= def.max) continue; 
                
                let reqMult = _save.workshopMults[id] || '1';
                const buyInfo = getMultiBuy(cat, id, lvl, reqMult, _save.coins, true);
                const val = calcStat(cat, id, lvl, 0);
                
                const maxLvl = getUpgradeMaxLevel(cat, id);
                const lvlStr = maxLvl ? `Lvl ${lvl}/${maxLvl}` : `Lvl ${lvl}`;
                
                row.innerHTML = `
                    <div class="tw-upg-info">
                        <div class="tw-upg-name">${def.name} <span style="font-size:10px;color:#777;">${lvlStr}</span></div>
                        <div class="tw-mini-mults" data-id="${id}">
                            <span class="${reqMult==='1'?'active':''}" data-val="1">x1</span>
                            <span class="${reqMult==='5'?'active':''}" data-val="5">x5</span>
                            <span class="${reqMult==='10'?'active':''}" data-val="10">x10</span>
                            <span class="${reqMult==='MAX'?'active':''}" data-val="MAX">Max</span>
                        </div>
                        <div class="tw-upg-val">${def.isPct ? (val*100).toFixed(2)+'%' : val.toFixed(2)}</div>
                    </div>
                    <button class="tw-upg-buy" ${(buyInfo.maxed || _save.coins < buyInfo.cost) ? 'disabled' : ''}>
                        ${buyInfo.maxed ? 'MAX' : `🪙 ${buyInfo.cost}<br><span style="font-size:10px;color:#ccc;">(+${buyInfo.count})</span>`}
                    </button>
                `;
                
                row.querySelectorAll('.tw-mini-mults span').forEach(span => {
                    span.onclick = (e) => {
                        _save.workshopMults[id] = e.target.dataset.val;
                        _saveGame();
                        _renderWorkshop();
                    };
                });

                row.querySelector('.tw-upg-buy').onclick = () => {
                    if (!buyInfo.maxed && _save.coins >= buyInfo.cost && buyInfo.count > 0) {
                        _save.coins -= buyInfo.cost;
                        _save.workshop[cat][id] = lvl + buyInfo.count;
                        _saveGame();
                        _screens.setup.querySelector('#tw-hub-coins').textContent = Math.floor(_save.coins);
                        _renderWorkshop();
                        if (typeof init._updateDiffUI === 'function') init._updateDiffUI();
                    }
                };
            }
            container.appendChild(row);
        }
    }
}

function _renderLab() {
    for (const cat in LAB_RESEARCH_CATEGORIES) {
        const container = _screens.setup.querySelector(`#tw-lab-${cat}`);
        container.innerHTML = '';
        
        LAB_RESEARCH_CATEGORIES[cat].forEach(id => {
            const def = LAB_RESEARCH[id];
            const lvl = _save.lab.levels[id] || 0;
            const cost = calcLabCost(id, lvl);
            const timeMs = calcLabTimeMs(id, lvl);
            const isMax = def.max && lvl >= def.max;
            
            let timeStr = '';
            if (timeMs < 60000) timeStr = `${timeMs/1000}s`;
            else if (timeMs < 3600000) timeStr = `${Math.floor(timeMs/60000)}m`;
            else timeStr = `${(timeMs/3600000).toFixed(1)}h`;

            const row = document.createElement('div');
            row.className = 'tw-lab-row';
            row.innerHTML = `
                <div class="tw-lab-header">
                    <span class="tw-lab-name">${def.name} <span style="font-size:10px;color:#777;">Lvl ${lvl}</span></span>
                    <span class="tw-lab-time">⏱ ${timeStr}</span>
                </div>
                <div class="tw-lab-desc">${def.desc}</div>
                <div class="tw-lab-actions">
                    <span style="font-size:12px;color:#aaa;">Cost: 🪙 ${cost}</span>
                    <button class="tw-lab-buy" ${(_save.coins < cost || isMax || _save.lab.active) ? 'disabled' : ''}>
                        ${isMax ? 'MAX' : 'Research'}
                    </button>
                </div>
            `;
            
            row.querySelector('.tw-lab-buy').onclick = () => {
                if (_save.coins >= cost && !_save.lab.active) {
                    _save.coins -= cost;
                    _save.lab.active = { id: id, endTime: Date.now() + timeMs };
                    _saveGame();
                    _screens.setup.querySelector('#tw-hub-coins').textContent = Math.floor(_save.coins);
                    _renderLab();
                    if (typeof init._updateDiffUI === 'function') init._updateDiffUI();
                }
            };
            container.appendChild(row);
        });
    }
}

function _renderStats() {
    const statsContent = _screens.setup.querySelector('#tw-stats-content');
    statsContent.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
            <div class="tw-upg-row"><div class="tw-upg-name">Session Correct</div><div class="tw-upg-val">${_save.stats.sessionCorrect}</div></div>
            <div class="tw-upg-row"><div class="tw-upg-name">Total Correct</div><div class="tw-upg-val">${_save.stats.totalCorrect}</div></div>
            <div class="tw-upg-row"><div class="tw-upg-name">Highest Streak</div><div class="tw-upg-val">${_save.stats.highestStreak}</div></div>
            <div class="tw-upg-row"><div class="tw-upg-name">Words Mastered</div><div class="tw-upg-val">${_save.stats.wordsMastered.length}</div></div>
            <div class="tw-upg-row"><div class="tw-upg-name">Bosses Defeated</div><div class="tw-upg-val">${_save.stats.bossesKilled || 0}</div></div>
            <div class="tw-upg-row"><div class="tw-upg-name">Highest Wave</div><div class="tw-upg-val">${_save.highestWave}</div></div>
            <div class="tw-upg-row"><div class="tw-upg-name">Max Tier</div><div class="tw-upg-val">${_save.maxDiff}</div></div>
        </div>
    `;
}

function _renderRelics() {
    const relicsContent = _screens.setup.querySelector('#tw-relics-content');
    relicsContent.innerHTML = `<div style="display:flex; flex-direction:column; gap:8px;">`;
    if (_save.relics.length === 0) {
        relicsContent.innerHTML += `<div style="color:#777; font-size:12px;">No relics unlocked. Beat target waves to earn them!</div>`;
    } else {
        for (const tier of _save.relics) {
            const rel = RELICS[tier];
            if (rel) {
                relicsContent.innerHTML += `
                    <div class="tw-upg-row" style="border-color:#f1c40f;">
                        <div class="tw-upg-info">
                            <div class="tw-upg-name" style="color:#f1c40f;">${rel.name} <span style="font-size:10px;color:#aaa;">Tier ${tier}</span></div>
                            <div style="font-size:11px; color:#bbb;">${rel.desc}</div>
                        </div>
                    </div>
                `;
            }
        }
    }
    relicsContent.innerHTML += `</div>`;
}

function _labTicker() {
    if (_screens.setup.style.display === 'none') return;
    if (!_save || !_save.lab.active) {
        const activeDiv = _screens.setup.querySelector('#tw-lab-active');
        if (activeDiv) activeDiv.style.display = 'none';
        return;
    }
    
    const lab = _save.lab.active;
    const remain = lab.endTime - Date.now();
    
    if (remain <= 0) {
        _save.lab.levels[lab.id] = (_save.lab.levels[lab.id] || 0) + 1;
        _save.lab.active = null;
        _saveGame();
        _showHub();
        return;
    }
    
    const activeDiv = _screens.setup.querySelector('#tw-lab-active');
    activeDiv.style.display = 'block';
    const def = LAB_RESEARCH[lab.id];
    _screens.setup.querySelector('#tw-lab-active-name').textContent = def ? def.name : 'Researching...';
    
    const h = Math.floor(remain / 3600000).toString().padStart(2, '0');
    const m = Math.floor((remain % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((remain % 60000) / 1000).toString().padStart(2, '0');
    _screens.setup.querySelector('#tw-lab-countdown').textContent = `${h}:${m}:${s}`;
}

function _getTowerStats() {
    let knowCardBuff = 0;
    if (_save && _save.cards) {
        for (let i = 0; i < _save.cards.unlockedSlots; i++) {
            const cardId = _save.cards.equipped[i];
            if (cardId === 'know') {
                const count = _save.cards.owned[cardId];
                const cDef = CARDS[cardId];
                const lvlInfo = getCardLevelInfo(count, cDef.maxLevel);
                let actualLvl = lvlInfo.level;
                if (cDef.maxLevel && actualLvl > cDef.maxLevel) actualLvl = cDef.maxLevel;
                knowCardBuff += cDef.base + (actualLvl - 1) * cDef.step;
            }
        }
    }

    let kMult = 0.01 + ((_save.lab ? _save.lab.levels.knowledge : 0) * 0.005);
    if (_save.relics.includes(5)) kMult *= 2; 
    kMult *= (1 + knowCardBuff);
    
    const kBuff = 1 + ((_run ? _run.knowledgeStacks : 0) * kMult);
    const masteryBuff = 1 + (_save.stats.wordsMastered.length * 0.0001); 
    
    let achCount = Object.keys(_save.achievements || {}).length;
    let achBuff = 1 + (achCount * 0.01);
    
    let labDmgMult = 1 + ((_save.lab.levels.damageMult || 0) * 0.02);
    let labHpMult = 1 + ((_save.lab.levels.healthMult || 0) * 0.05);

    let stats = {};
    for (const cat of['offense', 'defense', 'utility']) {
        for (const id in UPGRADES[cat]) {
            let val = calcStat(cat, id, _save.workshop[cat][id] || 0, _run ? (_run.levels[cat][id] || 0) : 0);
            
            if (['damage', 'health', 'regen', 'cashBonus', 'cashWave', 'coinBonus', 'coinsWave', 'atkSpeed'].includes(id)) {
                val *= kBuff;
            }
            if (id === 'damage') val *= masteryBuff * labDmgMult * achBuff;
            if (id === 'health') val *= labHpMult;

            if (id === 'atkSpeed') {
                if (_save.relics.includes(4)) val *= 1.2; 
            }
            if (id === 'critChance') val += (_save.lab.levels.critChance || 0) * 0.005;
            if (id === 'range') val *= 1 + ((_save.lab.levels.rangeMult || 0) * 0.01);
            if (id === 'regen') val *= 1 + ((_save.lab.levels.regenMult || 0) * 0.02);
            if (id === 'defPct') val += (_save.lab.levels.defPct || 0) * 0.005;
            if (id === 'thorns') val *= 1 + ((_save.lab.levels.thornsMult || 0) * 0.02);
            if (id === 'lifesteal') val += (_save.lab.levels.lifesteal || 0) * 0.002;
            if (id === 'cashBonus') val *= 1 + ((_save.lab.levels.cashBonusMult || 0) * 0.05);
            if (id === 'freeUpgOffense' || id === 'freeUpgDefense' || id === 'freeUpgUtility') {
                val += (_save.lab.levels.freeUpg || 0) * 0.005;
            }

            stats[id] = val;
        }
    }
    
    stats.enemySpeedMult = 1.0;
    if (_save && _save.cards) {
        for (let i = 0; i < _save.cards.unlockedSlots; i++) {
            const cardId = _save.cards.equipped[i];
            if (cardId) {
                const count = _save.cards.owned[cardId];
                const cDef = CARDS[cardId];
                const lvlInfo = getCardLevelInfo(count, cDef.maxLevel);
                let actualLvl = lvlInfo.level;
                if (cDef.maxLevel && actualLvl > cDef.maxLevel) actualLvl = cDef.maxLevel;
                
                const val = cDef.base + (actualLvl - 1) * cDef.step;
                
                if (cardId === 'dmg') stats.damage *= (1 + val);
                if (cardId === 'spd') stats.atkSpeed *= (1 + val);
                if (cardId === 'hp') stats.health *= (1 + val);
                if (cardId === 'rng') stats.range *= (1 + val);
                if (cardId === 'cash') stats.cashBonus *= (1 + val);
                if (cardId === 'coin') stats.coinBonus *= (1 + val);
                if (cardId === 'slow') stats.enemySpeedMult *= (1 - val);

                if (cardId === 'critC') stats.critChance += val;
                if (cardId === 'critM') stats.critMult += val;
                if (cardId === 'bounce') stats.bounce += val;
                if (cardId === 'splash') stats.splashDmg = (stats.splashDmg || 0) + val;
                if (cardId === 'dmgM') stats.dmgMeter += val;
                if (cardId === 'regen') stats.regen += val;
                if (cardId === 'defA') stats.defAbs += val;
                if (cardId === 'defP') stats.defPct += val;
                if (cardId === 'life') stats.lifesteal += val;
                if (cardId === 'thorns') stats.thorns += val;
                if (cardId === 'kb') stats.knockback += val;
                if (cardId === 'death') stats.defyDeath += val;
                if (cardId === 'cashW') stats.cashWave += val;
                if (cardId === 'coinW') stats.coinsWave += val;
                if (cardId === 'int') stats.interest += val;
                if (cardId === 'freeO') stats.freeUpgOffense += val;
                if (cardId === 'freeD') stats.freeUpgDefense += val;
                if (cardId === 'freeU') stats.freeUpgUtility += val;
            }
        }
    }

    const baseId = _save.bases ? (_save.bases.equipped || 'default') : 'default';
    const baseDef = TOWER_BASES[baseId];
    if (baseDef) {
        const baseLvl = _save.bases.levels[baseId] || 0;
        const mods = baseDef.getModifiers(baseLvl);
        
        if (mods.rangeMult) stats.range *= (1 + mods.rangeMult);
        if (mods.critChanceAdd) stats.critChance += mods.critChanceAdd;
        if (mods.atkSpeedMult) stats.atkSpeed *= (1 + mods.atkSpeedMult);
        if (mods.splashDmgAdd) stats.splashDmg = (stats.splashDmg || 0) + mods.splashDmgAdd;
        if (mods.disableBounce) stats.bounce = 0;
        if (mods.damageMult) stats.damage *= (1 + mods.damageMult);
        if (mods.coinCashMult) {
            stats.coinBonus *= (1 + mods.coinCashMult);
            stats.cashBonus *= (1 + mods.coinCashMult);
        }
        stats.towerColor = baseDef.color || '#00ffff';
    }

    stats.currentHp = _engine && _engine.stats ? (_engine.stats.currentHp || stats.health) : stats.health;
    if (_engine && _engine.stats && stats.health > _engine.stats.health) {
        stats.currentHp += (stats.health - _engine.stats.health);
    }
    stats.gameSpeed = 1 + ((_save.lab ? _save.lab.levels.gameSpeed : 0) * 0.1);
    stats.kBuff = kBuff;
    
    stats.synergyPierce = _save.lab && _save.lab.levels.synergy > 0 && kBuff >= 2.0;
    stats.synergyChain = _save.lab && _save.lab.levels.synergy > 0 && kBuff >= 3.0;
    
    return stats;
}

function _resumeRun() {
    if (!_save.currentRun || !_save.currentRun.active) return;
    
    _run = JSON.parse(JSON.stringify(_save.currentRun));
    _run.active = true;
    if (!_run.autoBuy) _run.autoBuy = { offense: false, defense: false, utility: false };
    
    _screens.setup.style.display = 'none';
    _screens.game.style.display = 'flex';
    _engine._resize();
    _engine.speedMult = _speedMult;

    _musicPlay();
    _updateMuteBtn();

    let stats = _getTowerStats();
    if (_run.currentHp !== undefined) stats.currentHp = _run.currentHp;
    
    _engine.startRun(stats, _run.wave, _run.diff);
    _engine.setTargetMode(_run.targetMode);

    _screens.game.querySelectorAll('.tw-target-btn').forEach(b => {
        b.classList.remove('active');
        if (b.dataset.target === _run.targetMode) b.classList.add('active');
    });

    _updateRunHUD();
    _updateAbilitiesUI();
    _renderRunUpgrades();
    
    _engine.startWave(_run.wave);
}

function _startRun() {
    _run.active = true;
    _run.wave = 1;
    _run.cash = 50 + (50 * _save.lab.levels.startingCash);
    _run.earnedCoinsDrops = 0;
    _run.earnedCoinsWave = 0;
    _run.knowledgeStacks = 0;
    _run.combo = 0;
    _run.abilityCharge = 0;
    _run.vocabQuestions = 0;
    _run.vocabCorrect = 0;
    _run.failedWords = {};
    _run.boughtDefense = false;
    _run.currentHp = undefined; 
    _run.autoBuy = { offense: false, defense: false, utility: false };
    
    for (const cat of['offense', 'defense', 'utility']) {
        for (const id in UPGRADES[cat]) {
            _run.levels[cat][id] = 0;
        }
    }
    
    _screens.setup.style.display = 'none';
    _screens.game.style.display = 'flex';
    _engine._resize();
    _engine.speedMult = _speedMult;

    _musicPlay();
    _updateMuteBtn();

    _vocabMgr.seedInitialWords(5);
    
    if (_engine) _engine.stats = {};
    _engine.startRun(_getTowerStats(), _run.wave, _run.diff);
    _engine.setTargetMode(_run.targetMode);
    
    _updateRunHUD();
    _updateAbilitiesUI();
    _renderRunUpgrades();
    
    _updateQuest('play_runs', 1);
    
    _saveRunSnapshot();
    _startNextWave();
}

function _startNextWave() {
    if (_run.wave === 1 && _save.relics.includes(2)) { 
        _run.knowledgeStacks++;
        _run.wave = 2;
        _engine.spawnFloatText('+1 Knowledge (Relic)!', '#2ecc71', true);
    }

    _updateRunHUD();
    
    _engine.pause();
    _vocabMgr.pause();
    
    const uiLayer = _screens.game.querySelector('#tw-ui-layer');
    
    showGameQuiz(_vocabMgr, {
        container: uiLayer,
        title: `Wave ${_run.wave} Approaching`,
        subtitle: 'Correct answer grants +1 Knowledge Stack & 1 Gem!',
        onAnswer: (isCorrect, wordObj) => {
            _run.vocabQuestions++;
            if (isCorrect) {
                _run.combo++;
                _run.vocabCorrect++;
                _save.stats.totalCorrect++;
                _save.stats.sessionCorrect++;
                _updateQuest('answer_vocab', 1);

                _save.gems += 1; 

                if (_run.combo > _save.stats.highestStreak) _save.stats.highestStreak = _run.combo;
                
                if (_save.lab.levels.vocabMastery > 0 && wordObj && !_save.stats.wordsMastered.includes(wordObj.kanji)) {
                    _save.stats.wordsMastered.push(wordObj.kanji);
                }
                
                let chargeAmt = 20;
                if (_save.relics.includes(3)) chargeAmt = 30; 
                _run.abilityCharge = Math.min(100, _run.abilityCharge + chargeAmt);
                _updateAbilitiesUI();

                let comboMult = 1;
                if (_run.combo >= 10) comboMult = 3;
                else if (_run.combo >= 5) comboMult = 2;
                else if (_run.combo >= 3) comboMult = 1.5;

                const gain = 1 * comboMult;
                _run.knowledgeStacks += gain;
                _engine.spawnFloatText(`+${gain} Knowledge!`, '#2ecc71', true);
            } else {
                _run.combo = 0;
                _engine.spawnFloatText('Missed Buff...', '#e74c3c', true);
                if (wordObj) {
                    const label = wordObj.kanji || wordObj.hiragana;
                    _run.failedWords[label] = (_run.failedWords[label] || 0) + 1;
                }
            }
            
            _engine.stats = _getTowerStats();
            _updateRunHUD();
            _renderRunUpgrades(); 
            
            _vocabMgr.resume();
            _engine.resume();
            
            _checkAchievements();
            _saveRunSnapshot();
            _engine.startWave(_run.wave);
        },
        onEmpty: () => {
            _engine.stats = _getTowerStats(); 
            _updateRunHUD();
            _renderRunUpgrades(); 

            _vocabMgr.resume();
            _engine.resume();
            
            _saveRunSnapshot();
            _engine.startWave(_run.wave);
        }
    });
}

function _checkUnlock() {
    const target = Math.round(26 * Math.log(_run.diff) + 10);
    if (_run.wave > _save.highestWave) _save.highestWave = _run.wave;
    
    if (!_save.highestWavePerDiff) _save.highestWavePerDiff = {};
    if (_run.wave > (_save.highestWavePerDiff[_run.diff] || 0)) {
        _save.highestWavePerDiff[_run.diff] = _run.wave;
    }

    if (_run.wave > target) {
        if (!_save.relics.includes(_run.diff)) {
            _save.relics.push(_run.diff);
            _engine.spawnFloatText('RELIC UNLOCKED!', '#f1c40f', true);
        }
        if (_run.diff >= _save.maxDiff) {
            _save.maxDiff = _run.diff + 1;
            _engine.spawnFloatText('TIER UNLOCKED!', '#00ffff', true);
        }
        _saveGame();
    }
}

function _handleDeath() {
    _run.active = false;
    _save.currentRun = null;
    
    const totalCoins = _run.earnedCoinsDrops + _run.earnedCoinsWave;
    _save.coins += totalCoins;

    if (!_run.boughtDefense && _run.wave > (_save.stats.highestWaveNoDef || 0)) {
        _save.stats.highestWaveNoDef = _run.wave;
    }
    
    if (_vocabMgr && !_vocabMgr.isGlobalSrs) {
        _vocabMgr.exportToAppSrs(null, 'skip');
    }
    
    _checkAchievements();
    _saveGame();
    
    const acc = _run.vocabQuestions > 0 ? Math.round((_run.vocabCorrect / _run.vocabQuestions) * 100) : 0;
    
    const deathScreen = _screens.game.querySelector('#tw-death-screen');
    
    deathScreen.querySelector('#tw-ds-wave').textContent = _run.wave;

    deathScreen.querySelector('#tw-ds-dmg-base').textContent = Math.floor(_engine.runStats.dmgBase || 0).toLocaleString();
    deathScreen.querySelector('#tw-ds-dmg-crit').textContent = Math.floor(_engine.runStats.dmgCrit || 0).toLocaleString();
    deathScreen.querySelector('#tw-ds-dmg-splash').textContent = Math.floor(_engine.runStats.dmgSplash || 0).toLocaleString();
    deathScreen.querySelector('#tw-ds-dmg-thorns').textContent = Math.floor(_engine.runStats.dmgThorns || 0).toLocaleString();
    deathScreen.querySelector('#tw-ds-dmg-abil').textContent = Math.floor(_engine.runStats.dmgAbility || 0).toLocaleString();
    deathScreen.querySelector('#tw-ds-dmg-total').textContent = Math.floor(_engine.runStats.dmgDealt || 0).toLocaleString();
    
    deathScreen.querySelector('#tw-ds-eco-drops').textContent = _run.earnedCoinsDrops.toLocaleString();
    deathScreen.querySelector('#tw-ds-eco-wave').textContent = _run.earnedCoinsWave.toLocaleString();
    deathScreen.querySelector('#tw-ds-eco-total').textContent = (_run.earnedCoinsDrops + _run.earnedCoinsWave).toLocaleString();

    deathScreen.querySelector('#tw-ds-acc').textContent = acc + '%';
    deathScreen.querySelector('#tw-ds-bossdmg').textContent = Math.floor(_engine.runStats.dmgTakenBoss || 0).toLocaleString();
    deathScreen.querySelector('#tw-ds-mobdmg').textContent = Math.floor(_engine.runStats.dmgTakenBasic || 0).toLocaleString();

    const wordsDiv = deathScreen.querySelector('#tw-ds-words');
    wordsDiv.innerHTML = '';
    
    let sortedWords = Object.keys(_run.failedWords).sort((a, b) => _run.failedWords[b] - _run.failedWords[a]);
    if (sortedWords.length === 0) {
        wordsDiv.innerHTML = '<div style="color:#2ecc71;">Perfect Vocabulary Run!</div>';
    } else {
        const top3 = sortedWords.slice(0, 3);
        for (let w of top3) {
            wordsDiv.innerHTML += `<div>• ${w} (Missed ${_run.failedWords[w]}x)</div>`;
        }
    }

    deathScreen.style.display = 'flex';
    
    const returnBtn = deathScreen.querySelector('#tw-death-return');
    returnBtn.onclick = () => {
        deathScreen.style.display = 'none';
        _showHub();
    };
}

function _updateRunHUD() {
    _screens.game.querySelector('#tw-run-wave').textContent = _run.wave;
    _screens.game.querySelector('#tw-run-cash-val').textContent = Math.floor(_run.cash);
    
    const totalCoins = _save.coins + _run.earnedCoinsDrops + _run.earnedCoinsWave;
    _screens.game.querySelector('#tw-run-coins-val').textContent = Math.floor(totalCoins);
    _screens.game.querySelector('#tw-run-gems-val').textContent = Math.floor(_save.gems);
    
    let knowCardBuff = 0;
    if (_save && _save.cards) {
        for (let i = 0; i < _save.cards.unlockedSlots; i++) {
            const cardId = _save.cards.equipped[i];
            if (cardId === 'know') {
                const count = _save.cards.owned[cardId];
                const cDef = CARDS[cardId];
                const lvlInfo = getCardLevelInfo(count, cDef.maxLevel);
                let actualLvl = lvlInfo.level;
                if (cDef.maxLevel && actualLvl > cDef.maxLevel) actualLvl = cDef.maxLevel;
                knowCardBuff += cDef.base + (actualLvl - 1) * cDef.step;
            }
        }
    }

    let kMult = 0.01 + ((_save.lab ? _save.lab.levels.knowledge : 0) * 0.005);
    if (_save.relics.includes(5)) kMult *= 2;
    kMult *= (1 + knowCardBuff);
    
    const kBuff = 1 + (_run.knowledgeStacks * kMult);
    _screens.game.querySelector('#tw-run-know').textContent = kBuff.toFixed(2);
    
    const comboEl = _screens.game.querySelector('#tw-run-combo');
    if (_run.combo >= 3) {
        let text = ' x1.5';
        if (_run.combo >= 10) text = ' x3.0';
        else if (_run.combo >= 5) text = ' x2.0';
        comboEl.textContent = text;
    } else {
        comboEl.textContent = '';
    }
    
    const hpBar = _screens.game.querySelector('#tw-run-hp-bar');
    if (_engine && _engine.stats) {
        const pct = Math.max(0, _engine.stats.currentHp / _engine.stats.health) * 100;
        hpBar.style.width = `${pct}%`;
    }
}

function _updateAbilitiesUI() {
    const bar = _screens.game.querySelector('#tw-abil-bar');
    if (bar) bar.style.width = `${_run.abilityCharge}%`;
    
    const isReady = _run.abilityCharge >= 100;['barrage', 'nova', 'aegis'].forEach(abil => {
        const btn = _screens.game.querySelector(`#tw-abil-${abil}`);
        if (btn) {
            btn.disabled = !isReady;
            if (isReady) btn.classList.add('ready');
            else btn.classList.remove('ready');
        }
    });
}

function _renderRunUpgrades() {
    for (const cat of['offense', 'defense', 'utility']) {
        const container = _screens.game.querySelector(`#tw-run-${cat}`);
        container.innerHTML = '';
        
        const autoWrap = document.createElement('div');
        autoWrap.style.cssText = "display:flex; justify-content:flex-end; margin-bottom:8px;";
        const autoBtn = document.createElement('button');
        autoBtn.className = 'tw-play-btn';
        const isOn = _run.autoBuy && _run.autoBuy[cat];
        autoBtn.style.cssText = `padding: 6px 12px; font-size: 11px; width: auto; background: ${isOn ? '#2ecc71' : 'transparent'}; border: 1px solid ${isOn ? '#2ecc71' : '#555'}; color: ${isOn ? '#000' : '#aaa'};`;
        autoBtn.textContent = isOn ? 'Auto-Upgrade: ON' : 'Auto-Upgrade: OFF';
        autoBtn.onclick = () => {
            if (!_run.autoBuy) _run.autoBuy = {};
            _run.autoBuy[cat] = !_run.autoBuy[cat];
            _saveRunSnapshot();
            _renderRunUpgrades();
        };
        autoWrap.appendChild(autoBtn);
        container.appendChild(autoWrap);
        
        for (const id in UPGRADES[cat]) {
            const def = UPGRADES[cat][id];
            
            if (def.reqUnlock && !_save.workshop.unlocks[id]) continue;

            const runLvl = _run.levels[cat][id] || 0;
            const wsLvl = _save.workshop[cat][id] || 0;

            if (def.max !== undefined) {
                const totalVal = calcStat(cat, id, wsLvl, runLvl);
                if (totalVal >= def.max) continue; 
            }
            
            let reqMult = _save.runMults[id] || '1';
            const buyInfo = getMultiBuy(cat, id, runLvl, reqMult, _run.cash, false);
            const val = calcStat(cat, id, wsLvl, runLvl);
            
            const maxLvl = getUpgradeMaxLevel(cat, id);
            const lvlStr = maxLvl ? `Lvl ${runLvl} (Total: ${runLvl + wsLvl}/${maxLvl})` : `Lvl ${runLvl}`;
            
            let displayVal = def.isPct ? (val*100).toFixed(2)+'%' : parseFloat(val.toFixed(3)).toString();
            
            if (id === 'coinsWave') {
                let base = (_run.wave * _run.diff);
                let coinMult1 = (_engine.stats?.coinBonus || 1);
                let labYield = (1 + (_save.lab.levels.coinYield || 0) * 0.1);
                let mult = coinMult1 * labYield;
                let total = Math.floor(base + val);
                total = Math.floor(total * coinMult1);
                total = Math.floor(total * labYield);
                displayVal = `<span style="color:#f1c40f;font-weight:bold;">${total}</span> <span style="font-size:9px;color:#aaa;">(${base} + ${val.toFixed(0)}) &times;${mult.toFixed(2)}</span>`;
            } else if (id === 'cashWave') {
                let interest = Math.floor(_run.cash * (_engine.stats?.interest || 0));
                let total = val + interest;
                displayVal = `<span style="color:#2ecc71;font-weight:bold;">${total}</span> <span style="font-size:9px;color:#aaa;">(${val.toFixed(0)} + Int:${interest})</span>`;
            } else if (id === 'interest') {
                let interest = Math.floor(_run.cash * val);
                displayVal = `${(val*100).toFixed(2)}% <span style="font-size:9px;color:#aaa;">(= $${interest})</span>`;
            }

            const row = document.createElement('div');
            row.className = 'tw-upg-row';
            row.innerHTML = `
                <div class="tw-upg-info">
                    <div class="tw-upg-name">${def.name} <span style="font-size:10px;color:#777;">${lvlStr}</span></div>
                    <div class="tw-mini-mults" data-id="${id}">
                        <span class="${reqMult==='1'?'active':''}" data-val="1">x1</span>
                        <span class="${reqMult==='5'?'active':''}" data-val="5">x5</span>
                        <span class="${reqMult==='10'?'active':''}" data-val="10">x10</span>
                        <span class="${reqMult==='MAX'?'active':''}" data-val="MAX">Max</span>
                    </div>
                    <div class="tw-upg-val">${displayVal}</div>
                </div>
                <button class="tw-upg-buy" ${(buyInfo.maxed || _run.cash < buyInfo.cost) ? 'disabled' : ''}>
                    ${buyInfo.maxed ? 'MAX' : `$ ${buyInfo.cost}<br><span style="font-size:10px;color:#ccc;">(+${buyInfo.count})</span>`}
                </button>
            `;
            
            row.querySelectorAll('.tw-mini-mults span').forEach(span => {
                span.onclick = (e) => {
                    _save.runMults[id] = e.target.dataset.val;
                    _saveGame();
                    _renderRunUpgrades();
                };
            });

            let freeChance = 0;
            if (cat === 'offense') freeChance = _engine.stats.freeUpgOffense || 0;
            else if (cat === 'defense') freeChance = _engine.stats.freeUpgDefense || 0;
            else if (cat === 'utility') freeChance = _engine.stats.freeUpgUtility || 0;

            row.querySelector('.tw-upg-buy').onclick = () => {
                if (!buyInfo.maxed && _run.cash >= buyInfo.cost && buyInfo.count > 0) {
                    let isFree = Math.random() < freeChance;
                    if (!isFree) {
                        _run.cash -= buyInfo.cost;
                    } else {
                        _engine.spawnFloatText('FREE!', '#f1c40f', true);
                    }
                    _run.levels[cat][id] = runLvl + buyInfo.count;
                    
                    if (cat === 'defense') _run.boughtDefense = true;

                    _engine.stats = _getTowerStats();
                    _updateRunHUD();
                    _saveRunSnapshot();
                    _renderRunUpgrades();
                }
            };
            container.appendChild(row);
        }
    }
}

function _autoBuyTicker() {
    if (!_run || !_run.active || !_run.autoBuy) return;
    if (_engine && _engine.state === 'PAUSED') return;

    let candidates = [];
    for (const cat of['offense', 'defense', 'utility']) {
        if (_run.autoBuy[cat]) {
            for (const id in UPGRADES[cat]) {
                const def = UPGRADES[cat][id];
                if (def.reqUnlock && !_save.workshop.unlocks[id]) continue;

                const runLvl = _run.levels[cat][id] || 0;
                const wsLvl = _save.workshop[cat][id] || 0;

                if (def.max !== undefined) {
                    if (calcStat(cat, id, wsLvl, runLvl) >= def.max) continue; 
                }
                
                let reqMult = _save.runMults[id] || '1';
                const buyInfo = getMultiBuy(cat, id, runLvl, reqMult, _run.cash, false);
                
                if (!buyInfo.maxed && buyInfo.count > 0 && _run.cash >= buyInfo.cost) {
                    let freeChance = 0;
                    if (cat === 'offense') freeChance = _engine.stats.freeUpgOffense || 0;
                    else if (cat === 'defense') freeChance = _engine.stats.freeUpgDefense || 0;
                    else if (cat === 'utility') freeChance = _engine.stats.freeUpgUtility || 0;

                    candidates.push({ cat, id, cost: buyInfo.cost, count: buyInfo.count, freeChance });
                }
            }
        }
    }

    if (candidates.length > 0) {
        candidates.sort((a, b) => a.cost - b.cost);
        let best = candidates[0];
        
        if (_run.cash >= best.cost) {
            let isFree = Math.random() < best.freeChance;
            if (!isFree) {
                _run.cash -= best.cost;
            } else {
                if (_engine) _engine.spawnFloatText('FREE!', '#f1c40f', true);
            }
            _run.levels[best.cat][best.id] = (_run.levels[best.cat][best.id] || 0) + best.count;
            
            if (best.cat === 'defense') _run.boughtDefense = true;

            if (_engine) _engine.stats = _getTowerStats();
            _updateRunHUD();
            _renderRunUpgrades();
        }
    }
}

function _openDeckSelector() {
    const hub = _screens.setup.querySelector('.tw-root');
    if (hub) hub.style.display = 'none';

    let dsWrap = _screens.setup.querySelector('#tw-deck-selector-wrap');
    if (!dsWrap) {
        dsWrap = document.createElement('div');
        dsWrap.id = 'tw-deck-selector-wrap';
        _screens.setup.appendChild(dsWrap);
    }
    dsWrap.style.display = 'block';
    dsWrap.innerHTML = '';

    const selector = mountVocabSelector(dsWrap, {
        bannedKey: 'tower_banned',
        defaultCount: 'All',
        title: 'Tower Defense — Vocabulary'
    });

    const actions = selector.getActionsEl();
    
    const applyBtn = document.createElement('button');
    applyBtn.className = 'tw-play-btn';
    applyBtn.style.marginTop = '10px';
    applyBtn.textContent = 'Apply Deck & Return';
    applyBtn.onclick = async () => {
        const queue = await selector.getQueue();
        if (queue.length > 0) {
            const hasSrs = queue.some(w => w.deckId === 'srs');
            _vocabMgr.setPool(queue, 'tower_banned', { globalSrs: hasSrs });
            _saveGame();
        }
        dsWrap.style.display = 'none';
        if (hub) hub.style.display = 'flex';
        _showHub();
    };

    actions.appendChild(applyBtn);
}

function _injectCSS() {
    if (!document.getElementById('tower-styles')) {
        const link = document.createElement('link');
        link.id = 'tower-styles';
        link.rel = 'stylesheet';
        link.href = './js/games/tower/tower.css';
        document.head.appendChild(link);
    }
}