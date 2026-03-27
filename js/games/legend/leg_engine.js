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
    canvas = cvs;
    ctx = canvas.getContext('2d');
    state = st;
    mapData = map;
    transition = null;

    canvas.width  = ROOM_COLS * TILE_SIZE;
    canvas.height = ROOM_ROWS * TILE_SIZE;
    prewarmTileCache(TILE_SIZE);

    // Pre-clear the start room — it never gets enemies, so mark it up-front
    // so the cleared/spawned guards never misfire on it.
    const startR = map.rooms[map.startRoom.y][map.startRoom.x];
    startR.cleared = true;
    startR.spawned = true;

    _fitCanvas();

    // Re-scale whenever the window or device orientation changes.
    if (_resizeHandler) window.removeEventListener('resize', _resizeHandler);
    _resizeHandler = () => _fitCanvas();
    window.addEventListener('resize', _resizeHandler);

    loadRoom(state.roomX, state.roomY, true);
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
}

export function stopEngine() {
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
    state.roomX = rx; state.roomY = ry;
    const room = mapData.rooms[ry][rx];
    activeEnemies = [];
    activeHitboxes = [];
    drops = [];
    pendingRoomEnter = null; // cancel any stale pending from previous room

    // On initial load (or rebirth/stage-start) place the player on a safe tile
    if (snapPlayer) {
        const [sx, sy] = _safeSpawnPos(room);
        state.player.x = sx;
        state.player.y = sy;
    }

    const isStart = (rx === mapData.startRoom.x && ry === mapData.startRoom.y);

    if (!room.cleared && !isStart) {
        // Defer — fired from the main loop once the game is unpaused
        pendingRoomEnter = {
            room,
            spawnFn:       () => _spawnRoom(room),
            spawnBuffedFn: () => _spawnRoomBuffed(room),
        };
    }
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
function _safeSpawnPos(room) {
    const walkable = new Set([TILE.FLOOR, TILE.STAIRS, TILE.CHEST, TILE.GRASS, TILE.STUMP, TILE.SHRINE]);
    const candidates = [];
    for (let r = 1; r < ROOM_ROWS - 1; r++) {
        for (let c = 1; c < ROOM_COLS - 1; c++) {
            if (walkable.has(room.grid[r][c])) {
                candidates.push([c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2]);
            }
        }
    }
    if (!candidates.length) return [canvas.width / 2, canvas.height / 2]; // fallback
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function _enemyHp(template, isBoss) {
    // Stage 1: slime = 8 HP → 1–2 sword hits. Scales ×1.25 per stage.
    // Boss multiplier kept separate so boss always feels imposing.
    const stageScale = 1 + (state.stage - 1) * 0.25;
    return template.hpMult * 8 * stageScale * (isBoss ? 10 : 1);
}

function _spawnRoomBuffed(room) {
    room.spawned = true; // mark so the cleared-check knows enemies were expected
    const isBossRoom = room.isExit && state.stage % 5 === 0;
    const base  = room.isExit ? 3 : 2;
    const count = isBossRoom ? 1 : base + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
        const template = isBossRoom ? BOSSES[0] : ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
        const hp = _enemyHp(template, isBossRoom) * 1.4;
        const [sx, sy] = _safeSpawnPos(room);
        activeEnemies.push({
            ...template,
            x: sx, y: sy,
            hp, maxHp: hp,
            speed: template.speed * 1.25,
            isBoss: isBossRoom, flashTimer: 0, iFrames: 0,
            stunTimer: 0,
        });
    }
}

function spawnEnemy(template, isBoss) {
    const hp = _enemyHp(template, isBoss);
    const room = mapData.rooms[state.roomY][state.roomX];
    const [sx, sy] = _safeSpawnPos(room);
    activeEnemies.push({
        ...template,
        x: sx, y: sy,
        hp, maxHp: hp,
        isBoss, flashTimer: 0, iFrames: 0,
        stunTimer: 0,
    });
}

function loop(time) {
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

        rafId = requestAnimationFrame(loop);
        return;
    }

    if (state.isPaused) { lastTime = time; rafId = requestAnimationFrame(loop); return; }

    // Fire deferred room-enter quiz now that we are guaranteed to be unpaused
    // and outside any transition. This prevents the quiz from being swallowed
    // by the isPaused guard or double-fired during a scroll animation.
    if (pendingRoomEnter) {
        const { room, spawnFn, spawnBuffedFn } = pendingRoomEnter;
        pendingRoomEnter = null;
        state.callbacks.onRoomEnter(room, spawnFn, spawnBuffedFn);
        rafId = requestAnimationFrame(loop);
        return; // let the quiz render before processing another frame
    }

    updatePlayer(dt);
    updateEnemies(dt);
    updateHitboxes(dt);
    updateDrops();
    draw(dt);

    rafId = requestAnimationFrame(loop);
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

    if (state.player.attackTimer <= 0) {
        const speed = (120 + state.player.agi * 2) * dt;
        let nx = state.player.x + move.x * speed;
        let ny = state.player.y + move.y * speed;

        const room = mapData.rooms[state.roomY][state.roomX];
        const R = 9; // player collision half-extent in pixels

        // Returns true if tile at pixel (x,y) is walkable.
        // Out-of-bounds is allowed so the transition trigger can fire.
        const walkable = (x, y) => {
            const tc = Math.floor(x / TILE_SIZE);
            const tr = Math.floor(y / TILE_SIZE);
            if (tr < 0 || tr >= ROOM_ROWS || tc < 0 || tc >= ROOM_COLS) return true;
            const t = room.grid[tr][tc];
            return t === TILE.FLOOR || t === TILE.STAIRS || t === TILE.CHEST || t === TILE.GRASS || t === TILE.STUMP;
        };

        // Check all four corners of the AABB for a given center position
        const canMove = (x, y) =>
            walkable(x - R, y - R) && walkable(x + R, y - R) &&
            walkable(x - R, y + R) && walkable(x + R, y + R);

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

        // Track last valid (non-pit, walkable) position for pit rescue
        const cx = Math.floor(state.player.x / TILE_SIZE);
        const cy = Math.floor(state.player.y / TILE_SIZE);
        if (cy >= 0 && cy < ROOM_ROWS && cx >= 0 && cx < ROOM_COLS) {
            const curTile = room.grid[cy][cx];
            if (curTile === TILE.FLOOR || curTile === TILE.GRASS || curTile === TILE.STUMP ||
                curTile === TILE.STAIRS || curTile === TILE.CHEST || curTile === TILE.SHRINE) {
                state.player.lastValidX = state.player.x;
                state.player.lastValidY = state.player.y;
            }
        }
    }

    // ── PIT pull mechanic (Zelda-style) ────────────────────────────────────
    // When the player is near a pit, they get pulled toward its centre.
    // If they reach the middle they take damage and snap back to safety.
    // The grapple hook / being airborne while grappling bypasses the pull.
    if (!state.grappleTarget) {
        const room = mapData.rooms[state.roomY][state.roomX];
        const PIT_PULL_RADIUS = TILE_SIZE * 0.85;  // px — outer pull starts here
        const PIT_FALL_RADIUS = TILE_SIZE * 0.22;  // px — fall/damage threshold
        const PIT_PULL_STRENGTH = 180;              // px/s pull speed

        // Find the nearest pit tile centre
        const pc = Math.floor(state.player.x / TILE_SIZE);
        const pr = Math.floor(state.player.y / TILE_SIZE);
        let nearestPitDist = Infinity, nearestPitX = 0, nearestPitY = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const tr = pr + dr, tc = pc + dc;
                if (tr < 0 || tr >= ROOM_ROWS || tc < 0 || tc >= ROOM_COLS) continue;
                if (room.grid[tr][tc] !== TILE.PIT) continue;
                const pitCX = tc * TILE_SIZE + TILE_SIZE / 2;
                const pitCY = tr * TILE_SIZE + TILE_SIZE / 2;
                const d = Math.hypot(state.player.x - pitCX, state.player.y - pitCY);
                if (d < nearestPitDist) {
                    nearestPitDist = d; nearestPitX = pitCX; nearestPitY = pitCY;
                }
            }
        }

        if (nearestPitDist < PIT_PULL_RADIUS) {
            if (nearestPitDist < PIT_FALL_RADIUS) {
                // Fell in — deal damage and teleport back to last valid position
                const fallDmg = Math.max(5, Math.floor(state.player.maxHp * 0.15));
                if (state.player.invincibility <= 0) {
                    state.callbacks.onTakeDamage(fallDmg, null);
                }
                // Snap back to last valid position (before the pit edge)
                state.player.x = state.player.lastValidX ?? (canvas.width / 2);
                state.player.y = state.player.lastValidY ?? (canvas.height / 2);
                state.player.invincibility = Math.max(state.player.invincibility, 1.2);
            } else {
                // Gradually pull toward the pit centre
                const pullFactor = 1 - (nearestPitDist / PIT_PULL_RADIUS); // 0→1 as you approach
                const dx = nearestPitX - state.player.x;
                const dy = nearestPitY - state.player.y;
                const dist = nearestPitDist || 1;
                state.player.x += (dx / dist) * PIT_PULL_STRENGTH * pullFactor * dt;
                state.player.y += (dy / dist) * PIT_PULL_STRENGTH * pullFactor * dt;
            }
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
        const curRoom = mapData.rooms[state.roomY][state.roomX];
        let inDoorOpening = false;
        if (triggerDY === -1 && curRoom.doors.n) {
            const dc = curRoom.dpos.n;
            const px = state.player.x / TILE_SIZE;
            inDoorOpening = (px >= dc - 1.5 && px <= dc + 1.5);
        } else if (triggerDY === 1 && curRoom.doors.s) {
            const dc = curRoom.dpos.s;
            const px = state.player.x / TILE_SIZE;
            inDoorOpening = (px >= dc - 1.5 && px <= dc + 1.5);
        } else if (triggerDX === -1 && curRoom.doors.w) {
            const dr = curRoom.dpos.w;
            const py = state.player.y / TILE_SIZE;
            inDoorOpening = (py >= dr - 1.5 && py <= dr + 1.5);
        } else if (triggerDX === 1 && curRoom.doors.e) {
            const dr = curRoom.dpos.e;
            const py = state.player.y / TILE_SIZE;
            inDoorOpening = (py >= dr - 1.5 && py <= dr + 1.5);
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

    // Exit Stairs — walk into them to trigger the descent quiz.
    // room.cleared is set when all enemies are dead. Also handle the edge case
    // where a room was spawned but enemies died off-screen or quiz was skipped.
    if (room.isExit && room.cleared && !room.stairsTriggered &&
        Math.hypot(state.player.x - stairsMidC, state.player.y - stairsMidR) < 40) {
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
                            // Land on a walkable tile ADJACENT to the post, not the post itself.
                            // Pick the neighbour closest to the player to feel natural.
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
                                .sort((a,b) => a.dist - b.dist);
                            if (walkableNeighbours.length > 0) {
                                state.grappleTarget = { x: walkableNeighbours[0].x, y: walkableNeighbours[0].y };
                            } else {
                                // Fallback: pull toward post (shouldn't happen after map sanity pass)
                                state.grappleTarget = { x: tc * TILE_SIZE + TILE_SIZE / 2, y: tr * TILE_SIZE + TILE_SIZE / 2 };
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

function updateEnemies(dt) {
    activeEnemies.forEach(e => {
        if (e.flashTimer > 0) e.flashTimer -= dt;
        if (e.iFrames    > 0) e.iFrames    -= dt;
        if (e.stunTimer  > 0) { e.stunTimer -= dt; return; } // stunned — skip movement
        
        if (e.ai === 'chase' || e.ai === 'chase_fly') {
            const dx = state.player.x - e.x;
            const dy = state.player.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;

            let nx = e.x + (dx/dist) * e.speed * dt;
            let ny = e.y + (dy/dist) * e.speed * dt;

            if (e.ai !== 'chase_fly') {
                const room = mapData.rooms[state.roomY][state.roomX];
                // Use a small AABB (R=8px) and allow all walkable tiles — not
                // just FLOOR — so enemies don't freeze on grass/stumps or clip
                // through walls when only the centre pixel is tested.
                const ER = 8;
                const enemyWalkable = (x, y) => {
                    const tc = Math.floor(x / TILE_SIZE);
                    const tr = Math.floor(y / TILE_SIZE);
                    if (tr < 0 || tr >= ROOM_ROWS || tc < 0 || tc >= ROOM_COLS) return false;
                    const t = room.grid[tr][tc];
                    return t === TILE.FLOOR || t === TILE.GRASS || t === TILE.STUMP ||
                           t === TILE.STAIRS || t === TILE.CHEST || t === TILE.SHRINE;
                };
                const enemyCanMove = (x, y) =>
                    enemyWalkable(x - ER, y - ER) && enemyWalkable(x + ER, y - ER) &&
                    enemyWalkable(x - ER, y + ER) && enemyWalkable(x + ER, y + ER);

                if (enemyCanMove(nx, ny)) {
                    // full move OK
                } else if (enemyCanMove(nx, e.y)) {
                    ny = e.y; // slide X only
                } else if (enemyCanMove(e.x, ny)) {
                    nx = e.x; // slide Y only
                } else {
                    nx = e.x; ny = e.y; // fully blocked
                }
            }
            e.x = nx; e.y = ny;
        } else if (e.ai === 'wander') {
            e.x += (Math.random() - 0.5) * e.speed * dt * 2;
            e.y += (Math.random() - 0.5) * e.speed * dt * 2;
        }

        // Damage Player
        if (Math.hypot(e.x - state.player.x, e.y - state.player.y) < 25) {
            if (state.player.invincibility <= 0) {
                const dmg = Math.max(1, Math.floor(e.atkMult * 5 * (1 + state.stage * 0.2) - state.player.def));
                state.callbacks.onTakeDamage(dmg, e); 
            }
        }
    });
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

                // Knockback — halved from previous values
                const kbBase = hb.weapon.id === 'sword' ? 16
                             : hb.weapon.id === 'axe'   ? 13
                             : hb.weapon.id === 'star'  ? 15
                             : hb.weapon.id === 'spear' ? 12
                             : 8;
                const kbDist = e.isBoss ? kbBase * 0.5 : kbBase;
                e.x += hb.dirX * kbDist;
                e.y += hb.dirY * kbDist;

                // Stun duration comes from the enemy's own stunTime field
                e.stunTimer = e.stunTime ?? (e.isBoss ? 0.25 : 0.45);

                spawnFloat(e.x, e.y, dmg, '#fff');

                if (e.hp <= 0) {
                    const exp = Math.floor(e.xp * (1 + (state.player.expBonus || 0)));
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

    drawRoomTiles(room);

    ctx.font = '20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    drops.forEach(d => { ctx.fillText(d.emoji, d.x, d.y); });

    ctx.font = '24px Arial'; 
    activeEnemies.forEach(e => {
        if (e.isBoss) ctx.font = '48px Arial'; else ctx.font = '24px Arial';
        ctx.globalAlpha = e.flashTimer > 0 ? 0.5 : 1;
        ctx.fillText(e.emoji, e.x, e.y);
        ctx.globalAlpha = 1;

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
}