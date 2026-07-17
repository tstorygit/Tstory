// js/games/legend/leg_engine.js
import { TILE_SIZE, ROOM_COLS, ROOM_ROWS, TILE } from './leg_map.js';
import { drawTile, prewarmTileCache } from './leg_sprites.js';
import { WEAPONS, ENEMIES, BOSSES } from './leg_entities.js';
import { getMovement, consumeTap } from './leg_input.js';

let ctx, canvas;
let state, mapData;
let activeEnemies = [];
let activeHitboxes = [];
let floatingTexts = [];
let drops = [];
let rafId;
let lastTime = 0;
let _shakeTime = 0;   // screen-shake timer after the player is hit
let _hudAccum  = 0;   // throttled HUD refresh accumulator (MP regen display)
// Loop generation counter. Every scheduled frame carries the generation it was
// created under; a frame whose generation is stale bails out immediately.
// This is the ONLY reliable way to kill the loop when stopEngine()/initEngine()
// is called synchronously from INSIDE a running frame (death, stairs onEmpty →
// startGame): cancelAnimationFrame can't cancel the currently executing
// callback, and its tail would otherwise schedule a zombie/second loop.
let _loopGen = 0;

// ── Shared walkability helpers ───────────────────────────────────────────────
const PLAYER_WALKABLE = new Set([TILE.FLOOR, TILE.STAIRS, TILE.CHEST, TILE.GRASS, TILE.STUMP, TILE.SHRINE]);
const ENEMY_WALKABLE  = new Set([TILE.FLOOR, TILE.GRASS, TILE.STUMP, TILE.STAIRS, TILE.CHEST, TILE.SHRINE]);

// Is the pixel (x,y) on a walkable tile? outOfBounds controls whether pixels
// outside the room count as walkable (true for the player so edge transitions
// can trigger; false for enemies so they can never leave the room).
function _pixelWalkable(room, x, y, walkSet, outOfBounds) {
    const tc = Math.floor(x / TILE_SIZE);
    const tr = Math.floor(y / TILE_SIZE);
    if (tr < 0 || tr >= ROOM_ROWS || tc < 0 || tc >= ROOM_COLS) return outOfBounds;
    return walkSet.has(room.grid[tr][tc]);
}

// AABB check: all four corners of a box of half-extent R centred at (x,y).
function _boxCanMove(room, x, y, R, walkSet, outOfBounds) {
    return _pixelWalkable(room, x - R, y - R, walkSet, outOfBounds) &&
           _pixelWalkable(room, x + R, y - R, walkSet, outOfBounds) &&
           _pixelWalkable(room, x - R, y + R, walkSet, outOfBounds) &&
           _pixelWalkable(room, x + R, y + R, walkSet, outOfBounds);
}

// ── Room-scroll transition ────────────────────────────────────────────────────
// When the player walks off an edge we freeze gameplay and scroll the canvas
// from the old room to the new room, exactly like classic Zelda.
const SCROLL_DURATION = 0.45; // seconds for the full pan
let transition = null;
// transition shape: {
//   fromRoom: {grid, …},  toRoom: {grid, …},
//   dx: -1|0|1,           dy: -1|0|1,   // direction player is travelling
//   progress: 0→1,
//   playerStartX, playerStartY,          // player pos when scroll began
//   playerEndX,   playerEndY,            // landing pos in the new room
// }

let _resizeHandler = null; // kept so stopEngine can remove it

function _fitCanvas() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const scale = Math.min(parent.clientWidth / canvas.width, parent.clientHeight / canvas.height);
    canvas.style.transform = `scale(${scale})`;
}

export function initEngine(cvs, st, map) {
    cancelAnimationFrame(rafId); // kill any previous loop (stage advance / rebirth re-init)
    _loopGen++;                  // invalidate frames already executing/scheduled
    canvas = cvs;
    ctx = canvas.getContext('2d');
    state = st;
    mapData = map;
    transition = null;
    _shakeTime = 0;
    _hudAccum = 0;
    state.grappleTarget = null;
    state.player.kbX = 0; state.player.kbY = 0; state.player.kbTimer = 0;

    canvas.width  = ROOM_COLS * TILE_SIZE;
    canvas.height = ROOM_ROWS * TILE_SIZE;
    // Emoji sprites are positioned by their centre — set alignment once so
    // sprites and hitboxes line up from the very first frame.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    prewarmTileCache(TILE_SIZE);

    // Pre-clear the start room — it never gets enemies, so mark it up-front
    // so the cleared/spawned guards never misfire on it.
    const startR = map.rooms[map.startRoom.y][map.startRoom.x];
    startR.cleared = true;
    startR.spawned = true;
    startR.entered = true;

    _fitCanvas();

    // Re-scale whenever the window or device orientation changes.
    if (_resizeHandler) window.removeEventListener('resize', _resizeHandler);
    _resizeHandler = () => _fitCanvas();
    window.addEventListener('resize', _resizeHandler);

    // ALWAYS enter a fresh map at its start room. state.roomX/Y may hold stale
    // coordinates from a previous (larger) stage — indexing with them crashed
    // on rebirth/stage-advance before this reset existed.
    loadRoom(map.startRoom.x, map.startRoom.y, true);
    lastTime = performance.now();
    const gen = _loopGen;
    rafId = requestAnimationFrame(t => loop(t, gen));
}

export function stopEngine() {
    _loopGen++; // stale-out any frame that is executing right now
    cancelAnimationFrame(rafId);
    if (_resizeHandler) {
        window.removeEventListener('resize', _resizeHandler);
        _resizeHandler = null;
    }
}

// When non-null, the main loop will fire onRoomEnter on the next unpaused frame.
// Using a deferred flag instead of calling onRoomEnter directly from loadRoom
// prevents quizzes from being swallowed (isPaused guard) or double-fired
// (transition loop bypasses isPaused).
let pendingRoomEnter = null; // { room, spawnFn, spawnBuffedFn }

function loadRoom(rx, ry, snapPlayer = false) {
    // Safety net: never index outside the room grid. Fall back to the start
    // room if anything hands us stale/out-of-range coordinates.
    if (ry < 0 || ry >= mapData.rows || rx < 0 || rx >= mapData.cols ||
        !mapData.rooms[ry] || !mapData.rooms[ry][rx]) {
        rx = mapData.startRoom.x;
        ry = mapData.startRoom.y;
        snapPlayer = true;
    }
    state.roomX = rx; state.roomY = ry;
    const room = mapData.rooms[ry][rx];
    activeEnemies = [];
    activeHitboxes = [];
    drops = [];
    pendingRoomEnter = null; // cancel any stale pending from previous room
    state.grappleTarget = null;
    state.player.kbTimer = 0;
    room.visited = true;

    // On initial load (or rebirth/stage-start) place the player on a safe tile
    if (snapPlayer) {
        const [sx, sy] = _safeSpawnPos(room);
        state.player.x = sx;
        state.player.y = sy;
    } else {
        // Post-transition insurance: if the landing spot is somehow inside a
        // solid tile, nudge the player to the nearest safe tile instead of
        // wedging them in a wall.
        if (!_boxCanMove(room, state.player.x, state.player.y, 9, PLAYER_WALKABLE, false)) {
            const [sx, sy] = _nearestSafePos(room, state.player.x, state.player.y);
            state.player.x = sx;
            state.player.y = sy;
        }
    }
    state.player.lastValidX = state.player.x;
    state.player.lastValidY = state.player.y;

    const isStart = (rx === mapData.startRoom.x && ry === mapData.startRoom.y);

    if (!room.cleared && !isStart) {
        if (!room.entered) {
            // First visit — defer the entry quiz; fired from the main loop
            // once the game is unpaused.
            room.entered = true;
            pendingRoomEnter = {
                room,
                spawnFn:       () => _spawnRoom(room),
                spawnBuffedFn: () => _spawnRoomBuffed(room),
            };
        } else {
            // Re-entering a room the player fled — no quiz spam, enemies just
            // respawn (with spawn grace + distance, so no cheap hits).
            _spawnRoom(room);
        }
    }

    if (state.callbacks?.onRoomChange) state.callbacks.onRoomChange();
}

// Nearest walkable tile centre to a pixel position (used as landing insurance).
function _nearestSafePos(room, px, py) {
    let best = null, bestD = Infinity;
    for (let r = 1; r < ROOM_ROWS - 1; r++) {
        for (let c = 1; c < ROOM_COLS - 1; c++) {
            if (!PLAYER_WALKABLE.has(room.grid[r][c])) continue;
            const cx = c * TILE_SIZE + TILE_SIZE / 2;
            const cy = r * TILE_SIZE + TILE_SIZE / 2;
            const d = Math.hypot(cx - px, cy - py);
            if (d < bestD) { bestD = d; best = [cx, cy]; }
        }
    }
    return best || [canvas.width / 2, canvas.height / 2];
}

function _spawnRoom(room) {
    room.spawned = true; // mark so the cleared-check knows enemies were expected
    if (room.isExit && state.stage % 5 === 0) {
        // Boss fight every 5th stage only
        spawnEnemy(BOSSES[0], true);
    } else {
        // Exit rooms on non-boss stages get one extra enemy as a mini-challenge
        const base  = room.isExit ? 3 : 2;
        const count = base + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            spawnEnemy(ENEMIES[Math.floor(Math.random() * ENEMIES.length)], false);
        }
    }
}

// Returns a random safe floor-tile centre position [px, py] in a room.
// Guarantees the spawn tile is walkable so neither player nor enemy appears
// inside a tree, rock, wall, or other collision tile.
// When minPlayerDist > 0, prefers tiles at least that far from the player so
// enemies never materialise on top of them.
function _safeSpawnPos(room, minPlayerDist = 0) {
    const walkable = new Set([TILE.FLOOR, TILE.CHEST, TILE.GRASS, TILE.STUMP, TILE.SHRINE]);
    const candidates = [];
    const farCandidates = [];
    for (let r = 1; r < ROOM_ROWS - 1; r++) {
        for (let c = 1; c < ROOM_COLS - 1; c++) {
            if (walkable.has(room.grid[r][c])) {
                const px = c * TILE_SIZE + TILE_SIZE / 2;
                const py = r * TILE_SIZE + TILE_SIZE / 2;
                candidates.push([px, py]);
                if (minPlayerDist > 0 &&
                    Math.hypot(px - state.player.x, py - state.player.y) >= minPlayerDist) {
                    farCandidates.push([px, py]);
                }
            }
        }
    }
    const pool = farCandidates.length ? farCandidates : candidates;
    if (!pool.length) return [canvas.width / 2, canvas.height / 2]; // fallback
    return pool[Math.floor(Math.random() * pool.length)];
}

const SPAWN_GRACE = 0.7;          // seconds enemies are inert + translucent after spawning
const ENEMY_MIN_SPAWN_DIST = TILE_SIZE * 3; // never spawn closer than 3 tiles to the player

function _enemyHp(template, isBoss) {
    // Stage 1: slime = 8 HP → 1–2 sword hits. Scales ×1.25 per stage.
    // Boss multiplier kept separate so boss feels imposing without becoming a
    // damage sponge (was ×10 — a stage-5 boss took ~90 hits to kill).
    const stageScale = 1 + (state.stage - 1) * 0.25;
    return template.hpMult * 8 * stageScale * (isBoss ? 3.5 : 1);
}

// Shared instance-field initialiser so every spawn path gets the same
// combat-state fields (telegraph machine, grace, stun, flash).
function _makeEnemy(template, x, y, hp, isBoss, speedMult = 1) {
    return {
        ...template,
        x, y,
        hp, maxHp: hp,
        speed: template.speed * speedMult,
        isBoss,
        flashTimer: 0, iFrames: 0, stunTimer: 0,
        spawnGrace: SPAWN_GRACE,
        atkState: null, atkTimer: 0, atkCd: 1.2 + Math.random() * 1.5,
        lungeDX: 0, lungeDY: 0,
        enraged: false,
        wanderTimer: 0, wdx: 0, wdy: 0,
    };
}

function _spawnRoomBuffed(room) {
    room.spawned = true; // mark so the cleared-check knows enemies were expected
    const isBossRoom = room.isExit && state.stage % 5 === 0;
    const base  = room.isExit ? 3 : 2;
    const count = isBossRoom ? 1 : base + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
        const template = isBossRoom ? BOSSES[0] : ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
        const hp = _enemyHp(template, isBossRoom) * 1.4;
        const [sx, sy] = _safeSpawnPos(room, ENEMY_MIN_SPAWN_DIST);
        activeEnemies.push(_makeEnemy(template, sx, sy, hp, isBossRoom, 1.25));
    }
}

function spawnEnemy(template, isBoss) {
    const hp = _enemyHp(template, isBoss);
    const room = mapData.rooms[state.roomY][state.roomX];
    const [sx, sy] = _safeSpawnPos(room, ENEMY_MIN_SPAWN_DIST);
    activeEnemies.push(_makeEnemy(template, sx, sy, hp, isBoss));
}

function loop(time, gen) {
    if (gen !== _loopGen) return; // engine stopped/re-inited since this frame was scheduled
    const dt = Math.min(0.1, (time - lastTime) / 1000);
    lastTime = time;

    if (transition) {
        // Advance scroll
        transition.progress = Math.min(1, transition.progress + dt / SCROLL_DURATION);

        // Move player linearly from their starting edge position to their landing position
        const t = easeInOut(transition.progress);
        state.player.x = transition.playerStartX + (transition.playerEndX - transition.playerStartX) * t;
        state.player.y = transition.playerStartY + (transition.playerEndY - transition.playerStartY) * t;

        drawTransition();

        if (transition.progress >= 1) {
            // Scroll complete — commit new room
            const { newRX, newRY } = transition;
            transition = null;
            loadRoom(newRX, newRY);
        }

        rafId = requestAnimationFrame(t => loop(t, gen));
        return;
    }

    if (state.isPaused) {
        consumeTap(); // discard taps/keys queued while a quiz or menu is open
        lastTime = time;
        rafId = requestAnimationFrame(t => loop(t, gen));
        return;
    }

    // Fire deferred room-enter quiz now that we are guaranteed to be unpaused
    // and outside any transition. This prevents the quiz from being swallowed
    // by the isPaused guard or double-fired during a scroll animation.
    if (pendingRoomEnter) {
        const { room, spawnFn, spawnBuffedFn } = pendingRoomEnter;
        pendingRoomEnter = null;
        state.callbacks.onRoomEnter(room, spawnFn, spawnBuffedFn);
        if (gen !== _loopGen) return; // callback may have re-inited the engine
        rafId = requestAnimationFrame(t => loop(t, gen));
        return; // let the quiz render before processing another frame
    }

    updatePlayer(dt);
    // A callback fired from updatePlayer (stairs onEmpty → startGame, death)
    // can synchronously stop or re-init the engine — don't keep stepping or
    // re-scheduling a stale generation.
    if (gen !== _loopGen) return;
    updateEnemies(dt);
    if (gen !== _loopGen) return; // death inside onTakeDamage
    updateHitboxes(dt);
    if (gen !== _loopGen) return; // death/re-init inside onExpGained
    updateDrops();
    draw(dt);

    // Throttled HUD refresh so passive MP regen is visible without spamming
    // DOM writes every frame.
    _hudAccum += dt;
    if (_hudAccum >= 0.3) {
        _hudAccum = 0;
        if (state.callbacks?.onUIUpdate) state.callbacks.onUIUpdate();
    }

    rafId = requestAnimationFrame(t => loop(t, gen));
}

function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function updatePlayer(dt) {
    // Passive MP regen based on Wisdom
    state.player.mp = Math.min(state.player.maxMp, state.player.mp + (0.5 + state.player.wis * 0.1) * dt);

    // Grapple Hook active
    if (state.grappleTarget) {
        const dx = state.grappleTarget.x - state.player.x;
        const dy = state.grappleTarget.y - state.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 10) { state.grappleTarget = null; }
        else { state.player.x += (dx/dist) * 600 * dt; state.player.y += (dy/dist) * 600 * dt; }
        return;
    }

    if (state.player.invincibility > 0) state.player.invincibility -= dt;
    if (state.player.attackTimer > 0) state.player.attackTimer -= dt;

    const move = getMovement();
    if (move.x !== 0 || move.y !== 0) {
        state.player.dirX = move.x; state.player.dirY = move.y;
    }

    const roomNow = mapData.rooms[state.roomY][state.roomX];
    const R = 9; // player collision half-extent in pixels
    const canMove = (x, y) => _boxCanMove(roomNow, x, y, R, PLAYER_WALKABLE, true);

    // ── Knockback from enemy hits — decays fast, respects collision ────────
    if (state.player.kbTimer > 0) {
        state.player.kbTimer -= dt;
        const kx = state.player.x + state.player.kbX * dt;
        const ky = state.player.y + state.player.kbY * dt;
        if (canMove(kx, ky))                       { state.player.x = kx; state.player.y = ky; }
        else if (canMove(kx, state.player.y))      { state.player.x = kx; }
        else if (canMove(state.player.x, ky))      { state.player.y = ky; }
        state.player.kbX *= Math.max(0, 1 - dt * 8);
        state.player.kbY *= Math.max(0, 1 - dt * 8);
    }

    if (state.player.attackTimer <= 0) {
        const speed = (120 + state.player.agi * 2) * dt;
        const nx = state.player.x + move.x * speed;
        const ny = state.player.y + move.y * speed;

        // Try full move, then slide on each axis independently
        if (canMove(nx, ny)) {
            state.player.x = nx;
            state.player.y = ny;
        } else if (canMove(nx, state.player.y)) {
            state.player.x = nx;         // slide along X
        } else if (canMove(state.player.x, ny)) {
            state.player.y = ny;         // slide along Y
        }
        // else: fully blocked, don't move
    }

    // Track last valid (non-pit, walkable) position for pit rescue
    {
        const cx = Math.floor(state.player.x / TILE_SIZE);
        const cy = Math.floor(state.player.y / TILE_SIZE);
        if (cy >= 0 && cy < ROOM_ROWS && cx >= 0 && cx < ROOM_COLS) {
            if (PLAYER_WALKABLE.has(roomNow.grid[cy][cx])) {
                state.player.lastValidX = state.player.x;
                state.player.lastValidY = state.player.y;
            }
        }
    }

    // ── PIT fall rescue ─────────────────────────────────────────────────────
    // Pits are hard blockers (collision already prevents walking in). The old
    // "pull" mechanic dragged the player through collision into the pit faster
    // than they could walk away — an inescapable death magnet. Now the only way
    // to end up over a pit is knockback or a bad grapple; if the player's
    // centre lands on a pit tile they take fall damage and snap back.
    if (!state.grappleTarget) {
        const pc = Math.floor(state.player.x / TILE_SIZE);
        const pr = Math.floor(state.player.y / TILE_SIZE);
        if (pr >= 0 && pr < ROOM_ROWS && pc >= 0 && pc < ROOM_COLS &&
            roomNow.grid[pr][pc] === TILE.PIT) {
            const fallDmg = Math.max(5, Math.floor(state.player.maxHp * 0.15));
            if (state.player.invincibility <= 0) {
                state.callbacks.onTakeDamage(fallDmg, null);
            }
            state.player.x = state.player.lastValidX ?? (canvas.width / 2);
            state.player.y = state.player.lastValidY ?? (canvas.height / 2);
            state.player.kbTimer = 0;
            state.player.invincibility = Math.max(state.player.invincibility, 1.5);
        }
    }

    // ── Zelda-style scrolling room transitions ────────────────────────────────
    // When the player crosses an edge, start a scroll instead of teleporting.
    const MARGIN = 15;
    let triggerDX = 0, triggerDY = 0;
    if      (state.player.x < 0)            triggerDX = -1;
    else if (state.player.x > canvas.width) triggerDX =  1;
    else if (state.player.y < 0)            triggerDY = -1;
    else if (state.player.y > canvas.height) triggerDY =  1;

    if ((triggerDX !== 0 || triggerDY !== 0) && !transition) {
        const newRX = state.roomX + triggerDX;
        const newRY = state.roomY + triggerDY;

        // Check if the player is actually inside the door opening before allowing
        // the transition. If they hit a wall segment next to a door, bounce back.
        // The carved opening spans tiles [pos-1, pos+1], i.e. tile-units
        // [pos-1, pos+2). Match that range exactly — the old ±1.5 window
        // rejected the outer half of the edge tiles and bounced players who
        // were legitimately walking through the side of a door.
        const curRoom = mapData.rooms[state.roomY][state.roomX];
        let inDoorOpening = false;
        if (triggerDY === -1 && curRoom.doors.n) {
            const dc = curRoom.dpos.n;
            const px = state.player.x / TILE_SIZE;
            inDoorOpening = (px >= dc - 1 && px < dc + 2);
        } else if (triggerDY === 1 && curRoom.doors.s) {
            const dc = curRoom.dpos.s;
            const px = state.player.x / TILE_SIZE;
            inDoorOpening = (px >= dc - 1 && px < dc + 2);
        } else if (triggerDX === -1 && curRoom.doors.w) {
            const dr = curRoom.dpos.w;
            const py = state.player.y / TILE_SIZE;
            inDoorOpening = (py >= dr - 1 && py < dr + 2);
        } else if (triggerDX === 1 && curRoom.doors.e) {
            const dr = curRoom.dpos.e;
            const py = state.player.y / TILE_SIZE;
            inDoorOpening = (py >= dr - 1 && py < dr + 2);
        }

        if (!inDoorOpening) {
            // Hit a wall — push player back inside
            if (triggerDX === -1) state.player.x = MARGIN;
            if (triggerDX ===  1) state.player.x = canvas.width - MARGIN;
            if (triggerDY === -1) state.player.y = MARGIN;
            if (triggerDY ===  1) state.player.y = canvas.height - MARGIN;
        } else if (newRX >= 0 && newRX < mapData.cols &&
            newRY >= 0 && newRY < mapData.rows &&
            mapData.rooms[newRY] && mapData.rooms[newRY][newRX]) {

            // Player X/Y is preserved across the transition — the map guarantees
            // the door opening in the destination room is at the same column/row,
            // so the player walks through seamlessly without any position snap.
            const landX = triggerDX === -1 ? canvas.width - MARGIN
                        : triggerDX ===  1 ? MARGIN
                        : state.player.x;   // N/S: preserve X
            const landY = triggerDY === -1 ? canvas.height - MARGIN
                        : triggerDY ===  1 ? MARGIN
                        : state.player.y;   // E/W: preserve Y

            // Clamp player to just outside the edge so the scroll starts cleanly
            if (triggerDX === -1) state.player.x = 0;
            if (triggerDX ===  1) state.player.x = canvas.width;
            if (triggerDY === -1) state.player.y = 0;
            if (triggerDY ===  1) state.player.y = canvas.height;

            transition = {
                fromRoom: mapData.rooms[state.roomY][state.roomX],
                toRoom:   mapData.rooms[newRY][newRX],
                newRX, newRY,
                dx: triggerDX, dy: triggerDY,
                progress: 0,
                playerStartX: state.player.x,
                playerStartY: state.player.y,
                playerEndX: landX,
                playerEndY: landY,
            };
            activeHitboxes = [];
            floatingTexts  = [];
            return;
        } else {
            // No room there — bounce back
            if (triggerDX === -1) state.player.x = MARGIN;
            if (triggerDX ===  1) state.player.x = canvas.width - MARGIN;
            if (triggerDY === -1) state.player.y = MARGIN;
            if (triggerDY ===  1) state.player.y = canvas.height - MARGIN;
        }
    }

    const room = mapData.rooms[state.roomY][state.roomX];

    // ── Tap dispatch — consume once and route by priority ────────────────────
    // Stairs > Chest > Shrine > Attack. Only one action fires per tap.
    const tapped = consumeTap();

    // Find actual stairs tile position (it's always at midR/midC but let's be exact)
    const stairsMidC = Math.floor(ROOM_COLS / 2) * TILE_SIZE + TILE_SIZE / 2;
    const stairsMidR = Math.floor(ROOM_ROWS / 2) * TILE_SIZE + TILE_SIZE / 2;

    // Exit Stairs — player must TAP while standing on them to descend.
    // Pure proximity was triggering accidentally when walking through the room.
    if (room.isExit && room.cleared && !room.stairsTriggered && tapped &&
        Math.hypot(state.player.x - stairsMidC, state.player.y - stairsMidR) < 48) {
        room.stairsTriggered = true;
        state.callbacks.onStairsReached(() => { room.stairsTriggered = false; });
    }

    // Chest — walk into it to open (no tap needed, proximity is enough).
    else if (room.hasChest && room.cleared && !room.chestTriggered &&
        Math.hypot(state.player.x - stairsMidC, state.player.y - stairsMidR) < 40) {
        room.chestTriggered = true;
        room.hasChest = false;
        _setTile(room, Math.floor(ROOM_ROWS/2), Math.floor(ROOM_COLS/2), TILE.FLOOR);
        const unowned = Object.keys(WEAPONS).filter(w => !state.unlockedWeapons.includes(w));
        state.callbacks.onChestOpen(unowned.length > 0 ? unowned[0] : null);
    }

    // Shrine — walk-into trigger (no tap needed, proximity is sufficient)
    else if (room.hasShrine) {
        for (let r = 1; r < ROOM_ROWS - 1; r++) {
            for (let c = 1; c < ROOM_COLS - 1; c++) {
                if (room.grid[r][c] === TILE.SHRINE &&
                    Math.hypot(state.player.x - (c * TILE_SIZE + TILE_SIZE/2),
                               state.player.y - (r * TILE_SIZE + TILE_SIZE/2)) < 32) {
                    room.hasShrine = false;
                    _setTile(room, r, c, TILE.FLOOR);
                    state.callbacks.onShrineTouch();
                }
            }
        }
        // Shrine did not consume the tap — fall through to attack below
        if (tapped && state.player.attackTimer <= 0) { _doAttack(); }
    }

    // Attack / Magic — only fires if no interactive object was in range
    else if (tapped && state.player.attackTimer <= 0) {
        _doAttack();
    }
}

function _doAttack() {
    const room = mapData.rooms[state.roomY][state.roomX];
    if (state.magicMode) {
        if (state.player.mp >= 10 && state.player.hp < state.player.maxHp) {
            state.player.mp -= 10;
            state.player.hp = Math.min(state.player.maxHp, state.player.hp + 30 + state.player.wis * 5);
            spawnFloat(state.player.x, state.player.y - 20, '✨ HEAL', '#2ecc71');
            state.callbacks.onUIUpdate();
        }
    } else {
        const wpn = WEAPONS[state.player.equippedWeapon];
        state.player.attackTimer = 0.35;

        const faceAngle = Math.atan2(state.player.dirY, state.player.dirX);

        if (wpn.type === 'arc') {
            activeHitboxes.push({
                x: state.player.x, y: state.player.y,
                dirX: state.player.dirX, dirY: state.player.dirY,
                faceAngle, weapon: wpn,
                life: 0.22, duration: 0.22,
                hitList: new Set(), swingProgress: 0, type: 'arc',
            });
        } else if (wpn.type === 'radial') {
            activeHitboxes.push({
                x: state.player.x, y: state.player.y,
                dirX: state.player.dirX, dirY: state.player.dirY,
                faceAngle, weapon: wpn,
                life: 0.3, duration: 0.3,
                hitList: new Set(), swingProgress: 0, type: 'radial',
            });
        } else if (wpn.type === 'linear') {
            activeHitboxes.push({
                x: state.player.x, y: state.player.y,
                dirX: state.player.dirX, dirY: state.player.dirY,
                faceAngle, weapon: wpn,
                life: 0.25, duration: 0.25,
                hitList: new Set(), type: 'linear',
                tipX: state.player.x, tipY: state.player.y,
            });
        } else if (wpn.type === 'projectile') {
            activeHitboxes.push({
                x: state.player.x, y: state.player.y,
                dirX: state.player.dirX, dirY: state.player.dirY,
                faceAngle, weapon: wpn,
                life: 0.5, duration: 0.5,
                hitList: new Set(), type: 'projectile',
                ballX: state.player.x, ballY: state.player.y,
                currentRange: 0,
            });
        }

        // Map Obstacle Interaction
        if (wpn.clear !== null || wpn.grapple) {
            if (wpn.type === 'radial') {
                // Sickle spins 360° — check every tile within its radius,
                // not just the one in facing direction.
                const radiusTiles = Math.ceil(wpn.range / TILE_SIZE);
                const pr = Math.floor(state.player.y / TILE_SIZE);
                const pc = Math.floor(state.player.x / TILE_SIZE);
                for (let dr = -radiusTiles; dr <= radiusTiles; dr++) {
                    for (let dc = -radiusTiles; dc <= radiusTiles; dc++) {
                        const tr = pr + dr, tc = pc + dc;
                        if (tr < 0 || tr >= ROOM_ROWS || tc < 0 || tc >= ROOM_COLS) continue;
                        const tileCX = tc * TILE_SIZE + TILE_SIZE / 2;
                        const tileCY = tr * TILE_SIZE + TILE_SIZE / 2;
                        if (Math.hypot(tileCX - state.player.x, tileCY - state.player.y) > wpn.range) continue;
                        if (room.grid[tr][tc] === wpn.clear) {
                            _setTile(room, tr, tc, TILE.FLOOR);
                            spawnFloat(tileCX, tileCY, 'BAM!', '#fff');
                            tryDropLoot(tileCX, tileCY, 0.3);
                        }
                    }
                }
            } else {
                // Directional ray scan for arc, linear, projectile weapons.
                const maxReach = wpn.type === 'linear' ? wpn.range * 0.55 : TILE_SIZE * 2.5;
                const PROBE_STEPS = 6;
                let clearedObstacle = false;
                for (let s = 1; s <= PROBE_STEPS && !clearedObstacle; s++) {
                    const reach = (s / PROBE_STEPS) * maxReach;
                    const tx = state.player.x + state.player.dirX * reach;
                    const ty = state.player.y + state.player.dirY * reach;
                    const tr = Math.floor(ty / TILE_SIZE);
                    const tc = Math.floor(tx / TILE_SIZE);
                    if (tr >= 0 && tr < ROOM_ROWS && tc >= 0 && tc < ROOM_COLS) {
                        const targetTile = room.grid[tr][tc];
                        if (wpn.clear !== null && wpn.clear === targetTile) {
                            _setTile(room, tr, tc, targetTile === TILE.TREE ? TILE.STUMP : TILE.FLOOR);
                            spawnFloat(tx, ty, 'BAM!', '#fff');
                            tryDropLoot(tx, ty, 0.3);
                            clearedObstacle = true;
                        } else if (wpn.grapple && targetTile === wpn.grapple) {
                            // Land on the walkable tile on the FAR side of the post —
                            // i.e. the neighbour farthest from the player, which is the
                            // tile the player is trying to reach across the pit.
                            const walkableNeighbours = [{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}]
                                .filter(({dr,dc}) => {
                                    const nr=tr+dr, nc=tc+dc;
                                    if (nr<0||nr>=ROOM_ROWS||nc<0||nc>=ROOM_COLS) return false;
                                    const t2 = room.grid[nr][nc];
                                    return t2===TILE.FLOOR||t2===TILE.GRASS||t2===TILE.STUMP;
                                })
                                .map(({dr,dc}) => ({
                                    x: (tc+dc)*TILE_SIZE+TILE_SIZE/2,
                                    y: (tr+dr)*TILE_SIZE+TILE_SIZE/2,
                                    dist: Math.hypot((tc+dc)*TILE_SIZE+TILE_SIZE/2 - state.player.x,
                                                     (tr+dr)*TILE_SIZE+TILE_SIZE/2 - state.player.y),
                                }))
                                .sort((a,b) => b.dist - a.dist); // FARTHEST first = far side of post
                            if (walkableNeighbours.length > 0) {
                                state.grappleTarget = { x: walkableNeighbours[0].x, y: walkableNeighbours[0].y };
                            } else {
                                // No walkable neighbour — don't grapple (post is surrounded by pits)
                                // This shouldn't happen after the map sanity pass in leg_map.js
                            }
                            clearedObstacle = true;
                        }
                    }
                }
            }
        }
    }
}

function tryDropLoot(x, y, chance) {
    if (Math.random() > chance) return;
    
    const unowned = Object.keys(WEAPONS).filter(w => !state.unlockedWeapons.includes(w));
    if (unowned.length > 0 && Math.random() < 0.15) {
        // 15% of drops are missing weapons
        const w = unowned[0];
        drops.push({ x, y, type: 'weapon', weaponId: w, emoji: WEAPONS[w].icon });
    } else {
        drops.push({ x, y, type: 'potion', emoji: '🧪' });
    }
}

// Move an enemy with AABB collision (flying enemies only clamp to the room).
function _enemyMove(e, nx, ny, flying) {
    if (flying) {
        // Flying: ignore tiles but never leave the playfield — an off-screen
        // enemy is unkillable and soft-locks the room-clear check.
        e.x = Math.max(TILE_SIZE * 0.5 + 8, Math.min(canvas.width  - TILE_SIZE * 0.5 - 8, nx));
        e.y = Math.max(TILE_SIZE * 0.5 + 8, Math.min(canvas.height - TILE_SIZE * 0.5 - 8, ny));
        return;
    }
    const room = mapData.rooms[state.roomY][state.roomX];
    const ER = 8;
    const ok = (x, y) => _boxCanMove(room, x, y, ER, ENEMY_WALKABLE, false);
    if (ok(nx, ny))            { e.x = nx; e.y = ny; }
    else if (ok(nx, e.y))      { e.x = nx; }
    else if (ok(e.x, ny))      { e.y = ny; }
    // else fully blocked — stay put
}

function updateEnemies(dt) {
    const spawnQueue = []; // boss adds are queued so we don't mutate mid-iteration
    activeEnemies.forEach(e => {
        if (e.flashTimer > 0) e.flashTimer -= dt;
        if (e.iFrames    > 0) e.iFrames    -= dt;

        // Spawn grace — enemy is inert and translucent; can't move or damage.
        if (e.spawnGrace > 0) { e.spawnGrace -= dt; return; }

        if (e.stunTimer  > 0) { e.stunTimer -= dt; return; } // stunned — skip movement

        const flying = (e.ai === 'chase_fly' || e.ai === 'wander');
        const pdx  = state.player.x - e.x;
        const pdy  = state.player.y - e.y;
        const pdist = Math.hypot(pdx, pdy) || 1;

        // ── Boss enrage: at half HP, speed up and call two adds (once) ─────
        if (e.isBoss && !e.enraged && e.hp <= e.maxHp / 2) {
            e.enraged = true;
            e.speed *= 1.2;
            const room = mapData.rooms[state.roomY][state.roomX];
            for (let i = 0; i < 2; i++) {
                const tpl = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
                const [sx, sy] = _safeSpawnPos(room, ENEMY_MIN_SPAWN_DIST);
                spawnQueue.push(_makeEnemy(tpl, sx, sy, _enemyHp(tpl, false), false));
            }
            spawnFloat(e.x, e.y - 40, 'ENRAGED!', '#e74c3c');
        }

        // ── Telegraphed attack state machine (chase / chase_fly / boss) ────
        let contactMult = 1;                // lunges hit harder than a graze
        if (e.atkState === 'windup') {
            e.atkTimer -= dt;
            if (e.atkTimer <= 0) {
                e.atkState = 'lunge';
                e.atkTimer = e.isBoss ? 0.35 : 0.22;
                e.lungeDX = pdx / pdist;    // direction locked at launch
                e.lungeDY = pdy / pdist;
            }
            // frozen while winding up — this is the dodge window
        } else if (e.atkState === 'lunge') {
            e.atkTimer -= dt;
            const lungeSpeed = e.speed * (e.isBoss ? 5 : 4);
            _enemyMove(e, e.x + e.lungeDX * lungeSpeed * dt, e.y + e.lungeDY * lungeSpeed * dt, flying);
            contactMult = 1.5;
            if (e.atkTimer <= 0) { e.atkState = 'recover'; e.atkTimer = e.isBoss ? 0.9 : 0.7; }
        } else if (e.atkState === 'recover') {
            e.atkTimer -= dt;
            if (e.atkTimer <= 0) { e.atkState = null; e.atkCd = 2.0 + Math.random() * 1.5; }
            // slow drift while recovering — punish window for the player
            if (e.ai !== 'wander') _enemyMove(e, e.x + (pdx / pdist) * e.speed * 0.3 * dt, e.y + (pdy / pdist) * e.speed * 0.3 * dt, flying);
        } else {
            // ── Normal movement ────────────────────────────────────────────
            if (e.ai === 'chase' || e.ai === 'chase_fly') {
                _enemyMove(e, e.x + (pdx / pdist) * e.speed * dt, e.y + (pdy / pdist) * e.speed * dt, flying);
            } else if (e.ai === 'wander') {
                // Pick a heading every ~1–2 s; 45% of the time drift toward the
                // player so bats stay engaged and killable. Bounds-clamped.
                e.wanderTimer -= dt;
                if (e.wanderTimer <= 0) {
                    e.wanderTimer = 0.8 + Math.random() * 1.2;
                    const ang = Math.random() < 0.45
                        ? Math.atan2(pdy, pdx) + (Math.random() - 0.5) * 0.9
                        : Math.random() * Math.PI * 2;
                    e.wdx = Math.cos(ang); e.wdy = Math.sin(ang);
                }
                _enemyMove(e, e.x + e.wdx * e.speed * dt, e.y + e.wdy * e.speed * dt, true);
            }

            // Start a telegraph when close enough and off cooldown
            e.atkCd -= dt;
            if (e.lungeRange > 0 && e.atkCd <= 0 && pdist < e.lungeRange) {
                e.atkState = 'windup';
                e.atkTimer = e.windup || 0.5;
            }
        }

        // ── Contact damage — respects i-frames, gives feedback + knockback ──
        if (Math.hypot(e.x - state.player.x, e.y - state.player.y) < 25) {
            if (state.player.invincibility <= 0) {
                const dmg = Math.max(1, Math.floor(
                    (e.atkMult * 5 * (1 + state.stage * 0.2) - state.player.def) * contactMult
                ));
                // Knockback away from the attacker + hit feedback
                const kdx = state.player.x - e.x, kdy = state.player.y - e.y;
                const kd  = Math.hypot(kdx, kdy) || 1;
                state.player.kbX = (kdx / kd) * 260;
                state.player.kbY = (kdy / kd) * 260;
                state.player.kbTimer = 0.18;
                _shakeTime = 0.25;
                spawnFloat(state.player.x, state.player.y - 22, `-${dmg}`, '#ff5544');
                state.callbacks.onTakeDamage(dmg, e);
            }
        }
    });
    if (spawnQueue.length) activeEnemies.push(...spawnQueue);
}

function updateHitboxes(dt) {
    for (let i = activeHitboxes.length - 1; i >= 0; i--) {
        const hb = activeHitboxes[i];
        hb.life -= dt;
        if (hb.life <= 0) { activeHitboxes.splice(i, 1); continue; }

        // Progress 0→1 over the attack duration
        hb.swingProgress = 1 - hb.life / hb.duration;

        // Always anchor arc/radial/linear to the current player position
        hb.x = state.player.x;
        hb.y = state.player.y;

        // Projectile ball position
        if (hb.type === 'projectile') {
            // Extend then retract
            const half = hb.duration / 2;
            const p    = hb.swingProgress;
            const extP = p < 0.5 ? p * 2 : (1 - p) * 2; // 0→1→0
            hb.currentRange = extP * hb.weapon.range;
            hb.ballX = hb.x + hb.dirX * hb.currentRange;
            hb.ballY = hb.y + hb.dirY * hb.currentRange;
        }

        // Linear thrust tip
        if (hb.type === 'linear') {
            // Thrust out to 55% of range, retract
            const extP = hb.swingProgress < 0.5 ? hb.swingProgress * 2 : (1 - hb.swingProgress) * 2;
            const reach = extP * hb.weapon.range * 0.55;
            hb.tipX = hb.x + hb.dirX * reach;
            hb.tipY = hb.y + hb.dirY * reach;
        }

        activeEnemies.forEach(e => {
            if (hb.hitList.has(e) || e.iFrames > 0) return;
            let isHit = false;

            if (hb.type === 'arc') {
                // OFFSET matches draw code: +15° rightward shift.
                // Arc centre = faceAngle + OFFSET/2.
                const OFFSET   = Math.PI / 12; // 15°
                // bladeLen slightly larger than draw values to close visual gap
                const bladeLen = hb.weapon.id === 'sword' ? 32
                               : hb.weapon.id === 'axe'   ? 35 : 38;
                const pivot = 8;
                const pivX = hb.x + Math.cos(hb.faceAngle) * pivot;
                const pivY = hb.y + Math.sin(hb.faceAngle) * pivot;
                const dist  = Math.hypot(e.x - pivX, e.y - pivY);
                const angle = Math.atan2(e.y - pivY, e.x - pivX);
                let diff = angle - (hb.faceAngle + OFFSET / 2);
                while (diff >  Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                // +0.28 rad (~16°) extra on each side so the visual sweep and
                // hitbox feel consistent even at the outermost swing frames
                isHit = dist < bladeLen && Math.abs(diff) <= hb.weapon.arc / 2 + 0.28;

            } else if (hb.type === 'radial') {
                const dist = Math.hypot(e.x - hb.x, e.y - hb.y);
                isHit = dist < hb.weapon.range;

            } else if (hb.type === 'linear') {
                const reach = hb.weapon.range * 0.55;
                const extP  = hb.swingProgress < 0.5 ? hb.swingProgress * 2 : (1 - hb.swingProgress) * 2;
                const shaftLen = extP * reach;
                if (shaftLen > 2) {
                    const ex = e.x - hb.x, ey = e.y - hb.y;
                    const t  = Math.max(0, Math.min(1, (ex * hb.dirX + ey * hb.dirY) / shaftLen));
                    const cx = hb.x + hb.dirX * shaftLen * t;
                    const cy = hb.y + hb.dirY * shaftLen * t;
                    isHit = Math.hypot(e.x - cx, e.y - cy) < 22;
                }

            } else if (hb.type === 'projectile') {
                isHit = Math.hypot(e.x - hb.ballX, e.y - hb.ballY) < 20;
            }

            if (isHit) {
                hb.hitList.add(e);
                const dmg = Math.max(1, Math.floor(state.player.str * hb.weapon.damage * (1 + Math.random() * 0.2)));
                e.hp -= dmg;
                e.flashTimer = 0.15;
                e.iFrames    = 0.15;

                // Knockback — collision-checked so enemies can't be punched
                // through walls (a knocked-into-a-wall enemy was permanently
                // stuck and could hold the room-clear hostage).
                const kbBase = hb.weapon.id === 'sword' ? 16
                             : hb.weapon.id === 'axe'   ? 13
                             : hb.weapon.id === 'star'  ? 15
                             : hb.weapon.id === 'spear' ? 12
                             : 8;
                const kbDist = e.isBoss ? kbBase * 0.5 : kbBase;
                const flyingKb = (e.ai === 'chase_fly' || e.ai === 'wander');
                _enemyMove(e, e.x + hb.dirX * kbDist, e.y + hb.dirY * kbDist, flyingKb);

                // Getting hit interrupts a windup/lunge (except bosses mid-lunge)
                if (!e.isBoss && e.atkState) { e.atkState = null; e.atkCd = 1.2 + Math.random(); }

                // Stun duration comes from the enemy's own stunTime field
                e.stunTimer = e.stunTime ?? (e.isBoss ? 0.25 : 0.45);

                spawnFloat(e.x, e.y, dmg, '#fff');

                if (e.hp <= 0) {
                    // XP scales with stage so levelling doesn't stall on deep floors
                    const stageXp = 1 + (state.stage - 1) * 0.2;
                    const exp = Math.floor(e.xp * stageXp * (1 + (state.player.expBonus || 0)));
                    state.player.exp += exp;
                    spawnFloat(e.x, e.y - 20, `+${exp}XP`, '#f1c40f');
                    e.dead = true;
                    tryDropLoot(e.x, e.y, 0.15);
                    if (state.callbacks.onKill) state.callbacks.onKill(e.isBoss);
                    state.callbacks.onExpGained();
                }
            }
        });
    }
    activeEnemies = activeEnemies.filter(e => !e.dead);
    if (activeEnemies.length === 0) {
        const room = mapData.rooms[state.roomY][state.roomX];
        // Mark room cleared if:
        // 1. Enemies were spawned and are all dead (normal case), OR
        // 2. The room was already marked spawned (pendingRoomEnter resolved) but
        //    all enemies died before this frame's check ran.
        // We do NOT auto-clear unspawned rooms — those still need the quiz to fire.
        if (!room.cleared && room.spawned) {
            room.cleared = true;
            room.gridVersion = (room.gridVersion ?? 0) + 1; // bust cache for post-clear tile appearance
            // Fire onRoomCleared exactly once, right here when cleared flips true.
            if (state.callbacks.onRoomCleared) state.callbacks.onRoomCleared();
        }
    }
}

function updateDrops() {
    for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        // Collect if the player walks near the drop…
        let collected = Math.hypot(state.player.x - d.x, state.player.y - d.y) < 25;
        // …or if any active hitbox sweeps over it (lets player collect items
        // that landed on impassable tiles by attacking toward them).
        if (!collected) {
            for (const hb of activeHitboxes) {
                let inHitbox = false;
                if (hb.type === 'radial') {
                    inHitbox = Math.hypot(d.x - hb.x, d.y - hb.y) < hb.weapon.range;
                } else if (hb.type === 'arc') {
                    const dist = Math.hypot(d.x - hb.x, d.y - hb.y);
                    const angle = Math.atan2(d.y - hb.y, d.x - hb.x);
                    let diff = angle - hb.faceAngle;
                    while (diff >  Math.PI) diff -= 2 * Math.PI;
                    while (diff < -Math.PI) diff += 2 * Math.PI;
                    inHitbox = dist < hb.weapon.range && Math.abs(diff) <= hb.weapon.arc / 2 + 0.3;
                } else if (hb.type === 'linear') {
                    inHitbox = Math.hypot(d.x - hb.tipX, d.y - hb.tipY) < 20;
                } else if (hb.type === 'projectile') {
                    inHitbox = Math.hypot(d.x - hb.ballX, d.y - hb.ballY) < 20;
                }
                if (inHitbox) { collected = true; break; }
            }
        }
        if (collected) {
            state.callbacks.onItemFound(d.type, d.weaponId);
            spawnFloat(d.x, d.y, '+Item', '#3498db');
            drops.splice(i, 1);
        }
    }
}

function spawnFloat(x, y, text, color) {
    // life starts at 1.0 — the render loop decrements by dt/0.8 each frame
    // so the text drifts upward over exactly 0.8 s and then is filtered out.
    floatingTexts.push({ x, y, text, color, life: 1.0 });
}

// Each room is baked to a full-size offscreen canvas once and re-used every
// frame.  The cache is invalidated whenever room.gridVersion changes — that
// counter is bumped every time any tile in room.grid is mutated (chest picked
// up, tree chopped, shrine used, room cleared, etc.).
const _roomCanvas = new WeakMap(); // room → { canvas, versionWhenBaked }

function _getRoomCanvas(room) {
    const v      = room.gridVersion ?? 0;
    const cached = _roomCanvas.get(room);
    if (cached && cached.versionWhenBaked === v) return cached.canvas;

    const oc  = document.createElement('canvas');
    oc.width  = canvas.width;
    oc.height = canvas.height;
    const octx = oc.getContext('2d');
    for (let r = 0; r < ROOM_ROWS; r++) {
        for (let c = 0; c < ROOM_COLS; c++) {
            drawTile(octx, room.grid[r][c], c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, room.cleared);
        }
    }
    _roomCanvas.set(room, { canvas: oc, versionWhenBaked: v });
    return oc;
}


// Mutate a tile and invalidate the room's canvas cache.
// Always use this instead of writing room.grid[r][c] directly.
function _setTile(room, r, c, tile) {
    room.grid[r][c] = tile;
    room.gridVersion = (room.gridVersion ?? 0) + 1;
}
// draws the player sprite on top (it moves in sync with the scroll).
function drawTransition() {
    const { fromRoom, toRoom, dx, dy, progress } = transition;
    const W = canvas.width;
    const H = canvas.height;
    const t = easeInOut(progress);

    // How many pixels the viewport has panned so far
    const panX = dx * W * t;
    const panY = dy * H * t;

    ctx.clearRect(0, 0, W, H);
    ctx.save();

    // Old room: slides out opposite to travel direction
    ctx.save();
    ctx.translate(-panX, -panY);
    drawRoomTiles(fromRoom);
    ctx.restore();

    // New room: slides in from the travel direction
    ctx.save();
    ctx.translate(dx * W - panX, dy * H - panY);
    drawRoomTiles(toRoom);
    ctx.restore();

    // Player sprite on top, position already updated by loop()
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 1;
    ctx.fillText('🧝', state.player.x, state.player.y);

    ctx.restore();
}

function drawRoomTiles(room) {
    ctx.drawImage(_getRoomCanvas(room), 0, 0);
}

function draw(dt) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const room = mapData.rooms[state.roomY][state.roomX];

    // ── Screen shake on player hit ─────────────────────────────────────────
    ctx.save();
    if (_shakeTime > 0) {
        _shakeTime -= dt;
        const mag = 3 * Math.min(1, _shakeTime / 0.25);
        ctx.translate((Math.random() - 0.5) * 2 * mag, (Math.random() - 0.5) * 2 * mag);
    }

    drawRoomTiles(room);

    // ── Pulsing ▼ beacon above the stairs when the room is cleared ────────
    // Drawn in world-space so it moves with the room but floats above tiles.
    if (room.isExit && room.cleared) {
        const sx = Math.floor(ROOM_COLS / 2) * TILE_SIZE + TILE_SIZE / 2;
        const sy = Math.floor(ROOM_ROWS / 2) * TILE_SIZE;
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 200); // 0.6–1.0
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#fff700';
        ctx.fillText('▼', sx, sy - 2);
        ctx.strokeStyle = '#b7950b';
        ctx.lineWidth = 2;
        ctx.strokeText('▼', sx, sy - 2);
        ctx.globalAlpha = 1;
        ctx.restore();
    }
    ctx.font = '20px Arial';   // was inheriting whatever the last frame left behind
    drops.forEach(d => { ctx.fillText(d.emoji, d.x, d.y); });

    activeEnemies.forEach(e => {
        ctx.font = e.isBoss ? '48px Arial' : '24px Arial';

        // Windup telegraph: sprite shivers + red ! above the head
        let ex = e.x;
        if (e.atkState === 'windup') ex += Math.sin(performance.now() / 25) * 2;

        ctx.globalAlpha = e.spawnGrace > 0 ? 0.4 : (e.flashTimer > 0 ? 0.5 : 1);
        ctx.fillText(e.emoji, ex, e.y);
        ctx.globalAlpha = 1;

        if (e.atkState === 'windup') {
            ctx.font = 'bold 18px Arial';
            ctx.fillStyle = '#e74c3c';
            ctx.fillText('!', e.x, e.y - (e.isBoss ? 44 : 28));
        }

        // HP bar — always visible, wider and taller for bosses
        const barW  = e.isBoss ? 56 : 28;
        const barH  = e.isBoss ? 6  : 4;
        const barX  = e.x - barW / 2;
        const barY  = e.y - (e.isBoss ? 34 : 22);
        const pct   = Math.max(0, e.hp / e.maxHp);
        // background
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
        // red empty portion
        ctx.fillStyle = '#5a0a0a';
        ctx.fillRect(barX, barY, barW, barH);
        // green filled portion — turns yellow below 50%, red below 25%
        ctx.fillStyle = pct > 0.5 ? '#2ecc71' : pct > 0.25 ? '#f1c40f' : '#e74c3c';
        ctx.fillRect(barX, barY, Math.round(barW * pct), barH);
    });

    activeHitboxes.forEach(hb => {
        ctx.save();
        ctx.translate(hb.x, hb.y);

        if (hb.type === 'arc') {
            // ── Pivot is offset FORWARD from player centre so the blade feels
            //    anchored at the hilt, not the belly-button.
            const pivot = 8; // px forward along facing direction (was 10, -20%)
            const pivotX = Math.cos(hb.faceAngle) * pivot;
            const pivotY = Math.sin(hb.faceAngle) * pivot;
            ctx.translate(pivotX, pivotY);

            // ── Swing window shifted toward the right hand (+15°):
            //    startAngle = faceAngle + 60°  (arc/2 + OFFSET, far right)
            //    endAngle   = faceAngle - 30°  (arc/2 - OFFSET, less far left)
            //    total arc stays 90° (π/2).
            const OFFSET = Math.PI / 12; // 15° rightward shift
            const prog       = hb.swingProgress;
            const startAngle = hb.faceAngle + hb.weapon.arc / 2 + OFFSET;
            const sweepAngle = startAngle - hb.weapon.arc * prog;

            // ── Blade length: matched to hitbox collision values
            const bladeLen = hb.weapon.id === 'sword' ? 32
                           : hb.weapon.id === 'axe'   ? 35
                           : 38; // star
            const bladeW   = hb.weapon.id === 'star'  ? 10 : 7;

            ctx.rotate(sweepAngle);

            if (hb.weapon.id === 'axe') {
                // ── Battle Axe — wooden handle + crescent blade ───────────────
                const handleLen = 28, bladeR = 14, bladeRi = 7;
                const hx = 4 + handleLen;

                // Handle
                ctx.fillStyle = 'rgba(120,80,40,0.92)';
                ctx.fillRect(4, -3, handleLen, 6);

                // Crescent head (outer arc minus inner arc)
                ctx.fillStyle = 'rgba(180,200,220,0.95)';
                ctx.beginPath();
                ctx.arc(hx, 0, bladeR,  -Math.PI * 0.65,  Math.PI * 0.65);
                ctx.arc(hx + bladeR - bladeRi + 2, 0, bladeRi, Math.PI * 0.65, -Math.PI * 0.65, true);
                ctx.closePath();
                ctx.fill();

                // Blade highlight
                ctx.strokeStyle = 'rgba(220,240,255,0.75)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(hx, 0, bladeR, -Math.PI * 0.6, Math.PI * 0.6);
                ctx.stroke();

                // Grip nub
                ctx.fillStyle = 'rgba(80,50,20,0.9)';
                ctx.fillRect(-5, -3, 10, 6);

            } else {
                // ── Sword / Morning Star — rectangular blade ──────────────────
                const bLen = hb.weapon.id === 'sword' ? 32 : 38;
                const bW   = hb.weapon.id === 'star'  ? 10 : 7;

                ctx.fillStyle = hb.weapon.id === 'star'
                    ? 'rgba(255,200,50,0.90)'
                    : 'rgba(200,220,255,0.88)';
                ctx.fillRect(6, -bW / 2, bLen, bW);

                if (hb.weapon.id === 'sword') {
                    ctx.fillStyle = 'rgba(200,160,60,0.95)';
                    ctx.fillRect(3, -11, 5, 22);
                    ctx.fillStyle = 'rgba(220,180,80,0.7)';
                    ctx.fillRect(7, -9, 3, 18);
                }

                ctx.fillStyle = 'rgba(100,70,40,0.9)';
                ctx.fillRect(-6, -3, 13, 6);

                ctx.strokeStyle = 'rgba(255,255,255,0.55)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(6, -bW / 2);
                ctx.lineTo(6 + bLen, -bW / 2);
                ctx.stroke();
            }

        } else if (hb.type === 'radial') {
            // Full 360° spinning sickle arc
            const spinAngle = hb.swingProgress * Math.PI * 2;
            const r = hb.weapon.range;
            ctx.rotate(spinAngle);

            // Spinning arc blade — short curved slice
            ctx.strokeStyle = 'rgba(150,230,180,0.9)';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.7, -0.6, 0.6);
            ctx.stroke();

            // Inner glow ring (thinner)
            ctx.strokeStyle = 'rgba(200,255,220,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.7, -1.0, 1.0);
            ctx.stroke();

            // Handle stub
            ctx.fillStyle = 'rgba(100,70,40,0.8)';
            ctx.fillRect(-3, -3, 14, 6);

        } else if (hb.type === 'linear') {
            // Spear thrust — a shaft that extends and retracts
            const extP   = hb.swingProgress < 0.5 ? hb.swingProgress * 2 : (1 - hb.swingProgress) * 2;
            const reach  = extP * hb.weapon.range * 0.55;
            ctx.rotate(hb.faceAngle);

            // Shaft
            ctx.fillStyle = 'rgba(180,140,70,0.85)';
            ctx.fillRect(0, -3, reach, 6);

            // Spearhead triangle
            if (reach > 8) {
                ctx.fillStyle = 'rgba(210,230,255,0.95)';
                ctx.beginPath();
                ctx.moveTo(reach,       0);
                ctx.lineTo(reach - 12, -5);
                ctx.lineTo(reach - 12,  5);
                ctx.closePath();
                ctx.fill();
                // edge highlight
                ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(reach, 0);
                ctx.lineTo(reach - 12, -5);
                ctx.stroke();
            }

        } else if (hb.type === 'projectile') {
            // Draw the chain line from player to ball
            ctx.restore(); // use absolute coords for projectile
            ctx.save();
            ctx.strokeStyle = 'rgba(180,150,255,0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(hb.x, hb.y);
            ctx.lineTo(hb.ballX, hb.ballY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Ball at tip
            ctx.fillStyle = 'rgba(200,170,255,0.95)';
            ctx.beginPath();
            ctx.arc(hb.ballX, hb.ballY, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
            return; // skip the outer ctx.restore() below
        }

        ctx.restore();
    });

    ctx.globalAlpha = state.player.invincibility > 0 && Math.floor(performance.now()/100)%2===0 ? 0.3 : 1;
    ctx.font = '24px Arial';
    ctx.fillText('🧝', state.player.x, state.player.y);
    ctx.globalAlpha = 1;

    floatingTexts.forEach(f => {
        ctx.fillStyle = f.color; ctx.font = 'bold 16px sans-serif';
        ctx.fillText(f.text, f.x, f.y - (1 - f.life) * 30);
        f.life -= dt / 0.8; // life 1→0 over 0.8 s regardless of frame rate
    });
    floatingTexts = floatingTexts.filter(f => f.life > 0);

    ctx.restore(); // end screen-shake translate

    // Red hurt vignette — fades out with the shake timer
    if (_shakeTime > 0) {
        ctx.save();
        ctx.globalAlpha = 0.28 * Math.min(1, _shakeTime / 0.25);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }
}