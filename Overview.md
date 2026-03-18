# AI Japanese Reader & SRS — Architecture & Context Guide
**Version: 1.1**

This document provides a comprehensive overview of the application's architecture, file structure, and core module responsibilities. It is designed to give a developer full context for working on any part of the app, including the mini-game ecosystem, without needing prior knowledge of the codebase.

---

## 1. Application Purpose & Key Features

AI Japanese Reader & SRS is a comprehensive, browser-based language learning application designed for Japanese students. Its primary goal is to make vocabulary acquisition engaging and effective through a suite of integrated tools.

The application is built around four core user-facing features:

*   **AI Story Reader:** Generates interactive, level-appropriate short stories using AI. As the user reads, they can tap on words to see definitions and save them to their personal study deck. The user's choices influence the direction of the narrative.

*   **Spaced Repetition System (SRS):** A classic, Tinder-style flashcard system for efficiently memorizing vocabulary. It uses a modified SM-2 algorithm to schedule reviews, ensuring words are practiced just before they are forgotten.

*   **Word Trainer:** A curriculum-based mode for building vocabulary from the ground up. Users select themed word lists (e.g., JLPT N5, Anime, Tourist) and learn them in a ranked, sequential order with AI-generated example sentences.

*   **Mini-Games:** A suite of diverse games (Tower Defense, RPG, Idle Clicker, etc.) that use the player's vocabulary as a core game mechanic. These games make reviewing learned vocabulary fun and engaging, providing an alternative to traditional flashcards.

All features are unified by a central vocabulary database (`srs_db.js`), allowing words learned in the Story Reader to appear in the SRS deck and be practiced in the Mini-Games.

---

## 2. File Structure

The project follows a modular structure within the `main/` directory.

```
main/
├── index.html              # Main application shell
├── styles.css              # Global styles for the app shell and views
├── sw.js                   # Service worker for PWA functionality
│
├── data/
│   ├── decksMeta.js        # Metadata for pre-built vocabulary decks
│   └── word_list_*.js      # Data files for each vocabulary deck (e.g., JLPT, Anime)
│
└── js/
    ├── app.js              # Main entry point, view routing, module initialization
    ├── settings.js         # User settings management (API keys, theme, etc.)
    ├── ai_api.js           # Low-level wrapper for Google Gemini text/image APIs
    ├── tts_api.js          # Low-level wrapper for Gemini TTS API with IndexedDB caching
    │
    ├── story_mgr.js        # Logic for creating and managing AI-generated stories
    ├── text_manager.js     # NLP pipeline (tokenization, translation) via AI
    ├── viewer_ui.js        # Renders the Story Reader view and its interactions
    │
    ├── srs_db.js           # Core SRS database (SM-2 logic, word storage)
    ├── srs_ui.js           # Renders the main SRS flashcard review view
    ├── srs_stats.js        # Tracks and calculates all SRS statistics
    ├── srs_stats_ui.js     # Renders the statistics panel
    │
    ├── word_manager.js     # Renders the "Vocabulary List" view (a searchable dictionary)
    ├── popup_manager.js    # Manages the global word detail popup
    │
    ├── trainer_mgr.js      # Logic for the "Word Trainer" curriculum mode
    ├── trainer_ui.js       # Renders the Word Trainer view
    │
    ├── games_ui.js         # Game launcher and main menu for the "Games" tab
    ├── vocab_selector.js   # Reusable UI component for selecting vocab decks in games
    ├── game_vocab_mgr.js   # The core "brain" for game vocabulary logic (see § 4)
    └── game_vocab_mgr_ui.js  # Standardized quiz modal and settings panel components
    │
    └── games/
        ├── caro/           # Caro (Vocab Recall) game files
        ├── memory/         # Memory Match game files
        ├── neko/           # NekoNihongo (Idle Clicker) game files
        ├── tbb/            # Turn-Based Battle RPG game files
        ├── eu/             # Vocab Universalis (Grand Strategy) game files
        ├── vocabcraft/     # VocabCraft (Tower Defense) game files
        └── survivor/       # Yōkai Survivor (Bullet Hell) — canonical reference implementation
```

---

## 3. Architectural Overview

*   **Technology**: Vanilla JavaScript (ES Modules), HTML5, CSS3. No frameworks.
*   **Architecture**: Single Page Application (SPA). `app.js` manages "views" (full-screen sections) by toggling their `display` property.
*   **State Management**: `localStorage` for all user settings, story data, and game saves. `IndexedDB` is used exclusively for caching TTS audio blobs.
*   **AI Backend**: Google Gemini API, accessed directly from the client. `ai_api.js` includes logic for key rotation to handle API rate limits.
*   **Modularity**: Each primary feature is managed by its own set of dedicated modules. UI logic (`_ui.js`) is generally separated from data/state logic (`_mgr.js` or `_db.js`).

---

## 4. Mini-Game Vocabulary System

All mini-games share a common vocabulary layer. No game module ever imports `srs_db.js` directly. The chain is always:

```
game module → GameVocabManager → srs_db
```

### 4.1 Core modules

**`game_vocab_mgr.js` — `GameVocabManager`**
The single vocabulary brain for all games. Responsibilities:
- Selects the next quiz word (`getNextWord()`) using one of three pedagogical modes: `auto`, `manual`, or `random`.
- Records answers and updates SM-2 scheduling state (`gradeWord()`).
- Operates in two scheduling modes transparently: **Local** (self-contained SM-2, progress exportable) and **Global** (delegates directly to `srs_db`, answers affect the player's main flashcard reviews in real time). The mode is set automatically via the `globalSrs` flag in `setPool()`.
- Exposes static helpers that games must use instead of touching storage directly: `loadSrsPool()`, `defaultConfig()`, `configLimits`.

**`game_vocab_mgr_ui.js`**
Drop-in UI components built on top of `GameVocabManager`. Use these unless a game has a deep custom visual theme that would be lost:
- `showStandardQuiz(vocabMgr, options)` — single flashcard question in a modal overlay.
- `showQuizSequence(vocabMgr, count, options)` — multi-question sequence (e.g. a boss chest).
- `renderVocabSettings(vocabMgr, container, onSave)` — full settings panel (mode selector, thresholds, SM-2 params). **Always prefer this over handwriting your own settings UI.** Any new config field added to `GameVocabManager` will appear here automatically.

**`vocab_selector.js`**
Standalone UI for letting the player pick which word deck to use before a game starts. Mount it with `mountVocabSelector(container, options)`, then call `selector.getQueue()` to retrieve the chosen pool and pass it to `vocabMgr.setPool()`.

### 4.2 Standard game lifecycle

```js
// 1. Construct — use GameVocabManager.defaultConfig() as the base
const mgr = new GameVocabManager({ mode: 'auto', ...savedConfig });

// 2. Load pool — never read srs_db or localStorage directly
const pool = GameVocabManager.loadSrsPool();   // player's SRS library
mgr.setPool(pool, 'my_game_banned', { globalSrs: true });

// 3. Seed (auto mode only)
mgr.seedInitialWords(5);

// 4. Quiz loop
const challenge = mgr.getNextWord();           // { refId, wordObj, options, correctIdx }
const result    = mgr.gradeWord(challenge.refId, isCorrect);

// 5. Pause / resume around any blocking UI
mgr.pause();   // freezes the SM-2 clock
mgr.resume();

// 6. Session end — export local progress back to app SRS
mgr.exportToAppSrs(null, 'skip');
```

### 4.3 Config persistence pattern

Games that expose vocab settings should store the config inside their own save object and use `GameVocabManager.defaultConfig()` as the fallback:

```js
_meta.vocabConfig = savedConfig || GameVocabManager.defaultConfig();
const mgr = new GameVocabManager(_meta.vocabConfig);
```

On save, use `renderVocabSettings`'s `onSave` callback to mirror the updated `vocabMgr.config` back into `_meta.vocabConfig`, then persist to `localStorage`. Do not hardcode clamp limits — read them from `GameVocabManager.configLimits`.

### 4.4 Reference implementation

**`games/survivor/survivor.js`** is the canonical example of how to integrate `GameVocabManager` in a full-featured game. It demonstrates:
- Building and rebuilding the manager around a run lifecycle (`_buildVocabMgr` / `returnToCamp`).
- The `globalSrs` flag pattern vs. custom-deck local mode.
- `importState` / `exportState` for persisting SM-2 progress between sessions.
- Delegating the settings panel to `renderVocabSettings` while keeping game-specific settings (audio, deck picker, danger-zone resets) in the game's own overlay.
- Doing the lifetime stat rollup from `vocabMgr.getStats()` once at run-end (`showGameOver`) rather than accumulating per-answer.

**`games/survivor/surv_ui.js`** shows the correct pattern for a game with a **custom quiz UI** that doesn't use `showStandardQuiz` — keeping the `getNextWord → render → gradeWord` call pattern identical to the standard components while preserving game-specific visual theming.

---

## 5. Core Module Breakdown

### 5.1. Application Core & Entry Point

*   **File:** `main/js/app.js`
*   **Purpose:** The application's main entry point.
*   **Key Responsibilities:**
    *   Initializes all core modules on `DOMContentLoaded`.
    *   Handles the top-right `...` navigation menu, switching between views.
    *   Registers the service worker for PWA functionality.

*   **File:** `main/js/settings.js`
*   **Purpose:** Manages all user-configurable settings.
*   **Key Responsibilities:**
    *   Loads and saves settings to `localStorage`.
    *   Provides the global `settings` object.
    *   Manages API key rotation and theme switching.

### 5.2. AI & APIs

*   **File:** `main/js/ai_api.js`
*   **Purpose:** A robust, low-level wrapper for the Gemini API.
*   **Key Methods:** `generateText()`, `generateImage()`, `generateSpeech()`.

*   **File:** `main/js/tts_api.js`
*   **Purpose:** Provides a user-facing Text-to-Speech service with caching.
*   **Key Methods:** `speakText(text, onStart, onEnd)`, `stopSpeech()`.

### 5.3. Story Reading Engine

*   **File:** `main/js/story_mgr.js`
*   **Purpose:** Manages the lifecycle of AI-generated stories.
*   **Key Methods:** `createNewStory()`, `generateNextBlock()`, `createStoryFromRawText()`.

*   **File:** `main/js/text_manager.js`
*   **Purpose:** The core Natural Language Processing (NLP) pipeline.
*   **Key Methods:** `processTextPipeline(rawText)` — tokenizes Japanese text into structured JSON.

*   **File:** `main/js/viewer_ui.js`
*   **Purpose:** Renders the Story Reader interface, coloring words based on SRS status and handling user interactions.

### 5.4. Global Spaced Repetition System (SRS)

*   **File:** `main/js/srs_db.js`
*   **Purpose:** The central database for all learned vocabulary, stored in `localStorage`. This is the single source of truth for a word's SRS state.
*   **Key Methods:**
    *   `saveWord()`, `gradeWord()`: The core SM-2 algorithm implementation and data persistence.
    *   `getNextGameWord()`: Intelligently selects the next word to quiz. Called internally by `GameVocabManager` — games must not call this directly.

*   **File:** `main/js/srs_ui.js`
*   **Purpose:** Renders the primary "SRS" tab with its Tinder-like flashcard interface.

*   **File:** `main/js/srs_stats.js` & `srs_stats_ui.js`
*   **Purpose:** Records every review event to build a detailed history and renders this data into charts and tables.

### 5.5. Vocabulary Management

*   **File:** `main/js/word_manager.js`
*   **Purpose:** Renders the "Vocabulary List" tab, a searchable dictionary of all words in the `srs_db`.

*   **File:** `main/js/popup_manager.js`
*   **Purpose:** Manages the single, global word-detail popup modal, allowing users to grade words from any view.

### 5.6. Word Trainer (Curriculum Mode)

*   **File:** `main/js/trainer_mgr.js` & `trainer_ui.js`
*   **Purpose:** A structured curriculum for learning words from pre-defined lists (e.g., "Anime 1000") in a fixed rank order.

### 5.7. Mini-Game Infrastructure

See **§ 4** for the full vocabulary system architecture. Summary of the infrastructure files:

*   **`games_ui.js`**: The "Games" tab main menu and game loader. Maintains the `GAME_REGISTRY` and handles the `init()` and `launch()` lifecycle of each game.
*   **`vocab_selector.js`**: Reusable deck-picker UI for a game's setup screen.
*   **`game_vocab_mgr.js`** & **`game_vocab_mgr_ui.js`**: The vocabulary brain and its standard UI components. **This is the most important context for a game developer** — read § 4 before touching any game's vocab code.

### 5.8. The Mini-Games (`main/js/games/*`)

*   **`caro/`**: A simple self-rating swipe game.
*   **`memory/`**: A classic card-matching game with a cosmetic shop.
*   **`tbb/`**: **Turn-Based Battle.** An RPG where vocab quizzes are attacks/defenses.
*   **`eu/`**: **Vocab Universalis.** A grand strategy map-painting game.
*   **`vocabcraft/`**: A tower defense game where vocab answers generate resources.
*   **`survivor/`**: **Yōkai Survivor.** A Vampire Survivors clone where leveling up triggers vocab quizzes. **Canonical reference implementation** for `GameVocabManager` integration — see § 4.4.
*   **`neko/`**: **NekoNihongo.** An idle clicker where vocab reviews are timed events that boost production.

### 5.9. Data & Assets

*   **`main/data/*.js`**: Raw JavaScript arrays of vocabulary words.
*   **`main/styles.css`**: Global styles. Games inject their own scoped styles into the `<head>`.
*   **`main/sw.js`**: Minimal service worker to enable PWA installation.

---

## 6. Developer Cheatsheet: Working on a Game

**Example Task: Add a new feature to the "Neko" game.**

1.  **Locate the Files:** The primary logic is in `main/js/games/neko/neko.js`.
2.  **Understand the Lifecycle:** `games_ui.js` calls `neko.init()` once, then `neko.launch()` every time you open it. The game's main loop and UI rendering happen inside `neko.js`.
3.  **Handle Vocabulary:** Follow the standard lifecycle in § 4.2. In brief:
    *   Mount `vocab_selector.js` on the setup screen to let the user pick a deck.
    *   Create a `GameVocabManager` using `GameVocabManager.defaultConfig()` as the config base.
    *   Call `mgr.setPool(queue, 'neko_banned')` with the selected words.
    *   When a quiz moment arrives, call `mgr.getNextWord()` then `mgr.gradeWord(refId, isCorrect)`.
    *   For the settings UI, call `renderVocabSettings(mgr, container, onSave)` — do not write your own.
    *   See `games/survivor/survivor.js` for a complete worked example (§ 4.4).
4.  **Manage State:** Read your game's save data from `localStorage` at the start of `launch()` using a game-specific key (e.g., `neko_nihongo_save`). Call your `saveGame()` function periodically, which should include `savedData.vocabState = vocabMgr.exportState();`.
5.  **Styling:** Inject a `<link>` or `<style>` tag with CSS classes prefixed with your game's abbreviation (e.g., `nk-` for Neko) to prevent collisions with other games or the main app.

---

## 7. GameVocabManager — Full API Reference & Patterns

This section is self-contained. It gives a new game developer everything needed to wire up vocabulary correctly without needing to read `game_vocab_mgr.js` or study survivor's source.

### 7.1 Constructor & config

```js
import { GameVocabManager } from '../../game_vocab_mgr.js';

// Always start from the canonical defaults, then overlay your saved config.
// Never hardcode default values yourself — they may change.
const mgr = new GameVocabManager({
    ...GameVocabManager.defaultConfig(),
    ...savedVocabConfig,   // from your game's localStorage save, may be empty/undefined
});
```

`GameVocabManager.defaultConfig()` returns:

| Field | Default | Meaning |
|---|---|---|
| `mode` | `'auto'` | `'auto'` \| `'manual'` \| `'random'` — see § 7.3 |
| `initialInterval` | `8` | Seconds before a newly introduced word reappears (Local mode) |
| `initialEase` | `1.5` | SM-2 ease multiplier — higher means intervals grow faster |
| `leechThreshold` | `20` | Wrong-answer count before a word is flagged as a leech |
| `autoNewWordBatchSize` | `1` | Words introduced per auto-event |
| `minDueTime` | `10` | Seconds with no due cards before auto-introducing a new word |
| `minAccuracy` | `0.80` | Recent accuracy (0–1) required before auto-introducing |

When clamping user input in a settings UI, use `GameVocabManager.configLimits` instead of hardcoding ranges:

```js
const { min, max } = GameVocabManager.configLimits.autoNewWordBatchSize; // { min: 1, max: 5 }
value = Math.max(min, Math.min(max, rawInput));
```

### 7.2 Loading and setting the vocab pool

```js
// ── Option A: player's own SRS library (most common) ──────────────────────
const pool = GameVocabManager.loadSrsPool(); // reads srs_db; never touch localStorage directly
mgr.setPool(pool, 'mygame_banned', { globalSrs: true });
// globalSrs:true → answers affect the player's main SRS reviews in real time.

// ── Option B: custom deck from vocab_selector ──────────────────────────────
const selector = mountVocabSelector(containerEl, { bannedKey: 'mygame_banned' });
const queue    = await selector.getQueue(); // called when player confirms their selection
mgr.setPool(queue, 'mygame_banned');
// No globalSrs flag → Local SM-2 mode; progress is self-contained and exportable.

// ── After setPool, seed an initial hand (Local / auto mode only) ───────────
// No-op in random mode or globalSrs mode — safe to call unconditionally.
mgr.seedInitialWords(5);
```

`setPool` must be called before any `getNextWord()` call. Calling it again mid-session replaces the pool; existing SM-2 state for words still in the new pool is preserved.

### 7.3 Pedagogical modes

| Mode | Behaviour | When to use |
|---|---|---|
| `'auto'` | SRS-ordered. New words introduced automatically when accuracy and idle-time thresholds are met. | Recommended default. |
| `'manual'` | SRS-ordered. New words only introduced when the player calls `learnNewWord()` explicitly. | Games with a deliberate "study" action (e.g. a library button). |
| `'random'` | Picks any word at random from the full pool. No SRS scheduling; `gradeWord()` still tracks stats but doesn't affect intervals. | Arcade modes, warmup rounds. |

### 7.4 The quiz loop

```js
// ── Pause the manager's SM-2 clock before showing any blocking UI ──────────
mgr.pause();

// ── Get the next challenge ─────────────────────────────────────────────────
const challenge = mgr.getNextWord();
// Returns null if the pool is empty or every word is in-flight.
// challenge shape:
// {
//   refId:      string,      // opaque token — pass back to gradeWord()
//   type:       string,      // 'due' | 'new' | 'drill' | 'leech' | 'random'
//   wordObj:    {            // the word to display
//     kanji:  string,        // the Japanese word (display as the question)
//     kana:   string,        // furigana / reading
//     eng:    string,        // the correct English translation
//   },
//   options:    string[],    // 4 shuffled English choices (includes the correct one)
//   correctIdx: number,      // index of the correct answer in options[]
// }

if (!challenge) { resumeGame(); return; }

showMyQuizUI(challenge.wordObj, challenge.options, challenge.correctIdx, (isCorrect) => {
    // ── Grade the answer ───────────────────────────────────────────────────
    const result = mgr.gradeWord(challenge.refId, isCorrect);
    // result shape:
    // {
    //   isCorrect:      boolean,
    //   combo:          number,   // current correct-answer streak
    //   newInterval:    number,   // seconds until next review (Local) or 0 (Global)
    //   isLeech:        boolean,  // is this word now flagged as a leech?
    //   justBecameLeech:boolean,  // true only on the answer that crossed the threshold
    // }

    mgr.resume(); // always unpause after grading
    continueGame(result);
});
```

`gradeWord` also accepts a numeric SM-2 grade `0–3` instead of a boolean, for games that want finer control (`0`=blackout, `1`=hard, `2`=good, `3`=easy).

### 7.5 Using the standard quiz UI components

For games that don't need a custom visual theme, skip the quiz loop above entirely and use the drop-in components from `game_vocab_mgr_ui.js`:

```js
import { showStandardQuiz, showQuizSequence, renderVocabSettings }
    from '../../game_vocab_mgr_ui.js';

// ── Single question (e.g. on level-up) ────────────────────────────────────
mgr.pause();
showStandardQuiz(mgr, {
    container:    gameOverlayEl,    // overlay is appended here and removed on answer
    title:        '⚔️ Clash!',
    showFurigana: true,
    optionCount:  4,                // 2–9; actual count may be lower if pool is small
    onAnswer: (isCorrect, wordObj, result) => {
        mgr.resume();
        if (isCorrect) showUpgradeScreen();
        else           applyPenalty();
    },
});

// ── Multi-question sequence (e.g. boss chest requiring 3 correct) ──────────
mgr.pause();
showQuizSequence(mgr, 3, {
    container:    gameOverlayEl,
    title:        '🧰 Boss Chest',
    showFurigana: true,
    onComplete: (successes, failures) => {
        mgr.resume();
        if (failures === 0) openChest();
        else                consolationPrize();
    },
});
```

Both functions call `mgr.pause()` / `mgr.resume()` internally around each question, but you should still call `mgr.pause()` before invoking them so the clock stops before the UI appears.

### 7.6 Vocab stats — HUD display and end-of-session rollup

```js
const stats = mgr.getStats();
// {
//   correct:       number,  // total correct answers this session
//   wrong:         number,  // total wrong answers this session
//   combo:         number,  // current streak
//   highestCombo:  number,
//   accuracy:      number,  // recent accuracy (last 20 answers), 0–1
//   totalPoolSize: number,  // all words in pool
//   activeCount:   number,  // words that have been introduced (in SM-2)
//   newCount:      number,  // words not yet introduced
//   dueCount:      number,  // words currently due for review
//   leechCount:    number,  // words flagged as leeches
// }

// ── Example HUD bar ────────────────────────────────────────────────────────
const s = mgr.getStats();
hudEl.textContent =
    `📚 ${s.activeCount} · 🎯 ${Math.round(s.accuracy * 100)}% · `
    + (s.dueCount > 0 ? `📬 ${s.dueCount} due` : '✓');

// ── End-of-session stat rollup ─────────────────────────────────────────────
// Read ONCE at session end, not per-answer. vocabMgr is the source of truth.
const final = mgr.getStats();
save.lifetime.totalCorrect += final.correct;
save.lifetime.totalWrong   += final.wrong;
save.lifetime.bestStreak    = Math.max(save.lifetime.bestStreak, myRunBestStreak);
```

### 7.7 Pause / resume

The manager maintains an internal SM-2 clock. Pausing it prevents words from becoming "due" while the game is blocked. Call `pause()` any time the game stops (overlay shown, app backgrounded, manual pause menu); call `resume()` when it unblocks.

```js
// Around any blocking overlay:
mgr.pause();
showMyOverlay(() => {
    mgr.resume();
});

// Around the entire app lifecycle if needed:
document.addEventListener('visibilitychange', () => {
    if (document.hidden) mgr.pause();
    else                 mgr.resume();
});
```

### 7.8 Manual word mode controls

In `'manual'` mode, new words must be introduced by the player. Expose a button (e.g. in a pause menu) that calls:

```js
const word = mgr.learnNewWord();
// Returns the introduced word object (truthy) if a new word was available.
// Returns false if the pool is exhausted (all words already introduced).
if (word) showFlash(`📖 New word: ${word.kanji}`);

// To show how many are left:
const { newCount } = mgr.getStats();
learnBtn.textContent = `📖 Learn New Word (${newCount} remaining)`;
learnBtn.disabled    = newCount === 0;
```

### 7.9 Saving and restoring state

Call `exportState()` before the session ends and `importState()` at the start of the next one. This preserves SM-2 intervals across sessions in Local mode.

```js
// ── Save (call before nulling the manager or on beforeunload) ─────────────
save.vocabState = mgr.exportState();
localStorage.setItem('mygame_save', JSON.stringify(save));

// ── Restore (call after constructing the manager, before setPool) ──────────
const save = JSON.parse(localStorage.getItem('mygame_save') || '{}');
const mgr  = new GameVocabManager({ ...GameVocabManager.defaultConfig(), ...save.vocabConfig });
if (save.vocabState) mgr.importState(save.vocabState);
mgr.setPool(pool, 'mygame_banned');   // importState must come before setPool

// ── Export to app SRS at session end (Local mode only) ────────────────────
// No-op if globalSrs is active — safe to call unconditionally.
mgr.exportToAppSrs(null, 'skip');
// 'skip'      → only adds words not already in the app SRS (safe default).
// 'overwrite' → updates existing entries; use if your game tracks mature intervals.
```

### 7.10 Settings UI

Always use `renderVocabSettings` rather than building your own panel. It renders into any container element and calls `onSave` when the player confirms:

```js
import { renderVocabSettings } from '../../game_vocab_mgr_ui.js';

// Render into a <div> inside your settings screen:
renderVocabSettings(mgr, settingsContainerEl, () => {
    // onSave: mirror the updated config back into your save object
    save.vocabConfig = { ...mgr.config, ...mgr.config.autoThresholds };
    localStorage.setItem('mygame_save', JSON.stringify(save));
    // If you reconstruct the manager at run start, null it here to force a rebuild:
    mgr = null;
});
```

The panel automatically shows/hides fields based on the current mode, displays the Global SRS notice when `globalSrs` is true, and respects `configLimits` for all inputs. Any new fields added to `GameVocabManager` in the future will appear in it automatically.