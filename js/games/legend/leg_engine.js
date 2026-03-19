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

export function initEngine(cvs, st, map) {
    canvas = cvs;
    ctx = canvas.getContext('2d');
    state = st;
    mapData = map;
    transition = null;
    
    const parent = canvas.parentElement;
    canvas.width = ROOM_COLS * TILE_SIZE;
    canvas.height = ROOM_ROWS * TILE_SIZE;
    prewarmTileCache(TILE_SIZE);
    
    const scale = Math.min(parent.clientWidth / canvas.width, parent.clientHeight / canvas.height);
    canvas.style.transform = `scale(${scale})`;
    
    loadRoom(state.roomX, state.roomY);
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
}

export function stopEngine() {
    cancelAnimationFrame(rafId);
}

function loadRoom(rx, ry) {
    state.roomX = rx; state.roomY = ry;
    const room = mapData.rooms[ry][rx];
    activeEnemies = [];
    activeHitboxes = [];
    drops = [];
    
    if (!room.cleared && (rx !== mapData.startRoom.x || ry !== mapData.startRoom.y)) {
        if (room.isExit) {
            spawnEnemy(BOSSES[0], true);
        } else {
            const count = 2 + Math.floor(Math.random() * 3);
            for (let i=0; i<count; i++) spawnEnemy(ENEMIES[Math.floor(Math.random()*ENEMIES.length)], false);
        }
    }
}

function spawnEnemy(template, isBoss) {
    const scale = 1 + (state.stage * 0.15);
    activeEnemies.push({
        ...template,
        x: TILE_SIZE * 2 + Math.random() * (canvas.width - TILE_SIZE*4),
        y: TILE_SIZE * 2 + Math.random() * (canvas.height - TILE_SIZE*4),
        hp: template.hpMult * 20 * scale * (isBoss ? 8 : 1),
        maxHp: template.hpMult * 20 * scale * (isBoss ? 8 : 1),
        isBoss, flashTimer: 0, iFrames: 0
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

        // Only scroll if the neighbouring room exists in the map
        if (newRX >= 0 && newRX < mapData.cols &&
            newRY >= 0 && newRY < mapData.rows &&
            mapData.rooms[newRY] && mapData.rooms[newRY][newRX]) {

            // Player landing position: appear at the opposite edge of the new room
            const landX = triggerDX === -1 ? canvas.width - MARGIN
                        : triggerDX ===  1 ? MARGIN
                        : state.player.x;
            const landY = triggerDY === -1 ? canvas.height - MARGIN
                        : triggerDY ===  1 ? MARGIN
                        : state.player.y;

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
            // Clear combat state so enemies don't fire while we scroll
            activeHitboxes = [];
            floatingTexts  = [];
            return; // hand off to the transition branch in loop()
        } else {
            // No room there — bounce the player back to the edge
            if (triggerDX === -1) state.player.x = MARGIN;
            if (triggerDX ===  1) state.player.x = canvas.width - MARGIN;
            if (triggerDY === -1) state.player.y = MARGIN;
            if (triggerDY ===  1) state.player.y = canvas.height - MARGIN;
        }
    }

    const room = mapData.rooms[state.roomY][state.roomX];
    
    // Exit Stairs Interaction
    if (room.isExit && room.cleared && Math.hypot(state.player.x - (ROOM_COLS/2*TILE_SIZE), state.player.y - (ROOM_ROWS/2*TILE_SIZE)) < 30) {
        state.callbacks.onNextStage();
    }
    
    // Chest Interaction
    if (room.hasChest && room.cleared && Math.hypot(state.player.x - (ROOM_COLS/2*TILE_SIZE), state.player.y - (ROOM_ROWS/2*TILE_SIZE)) < 30) {
        room.hasChest = false;
        room.grid[Math.floor(ROOM_ROWS/2)][Math.floor(ROOM_COLS/2)] = TILE.FLOOR;
        
        const unowned = Object.keys(WEAPONS).filter(w => !state.unlockedWeapons.includes(w));
        if (unowned.length > 0) {
            state.callbacks.onItemFound('weapon', unowned[0]);
        } else {
            state.callbacks.onItemFound('potion', null);
        }
    }

    // Attack / Magic
    if (consumeTap() && state.player.attackTimer <= 0) {
        if (state.magicMode) {
            if (state.player.mp >= 10 && state.player.hp < state.player.maxHp) {
                state.player.mp -= 10;
                state.player.hp = Math.min(state.player.maxHp, state.player.hp + 30 + state.player.wis * 5);
                spawnFloat(state.player.x, state.player.y - 20, '✨ HEAL', '#2ecc71');
                state.callbacks.onUIUpdate();
            }
        } else {
            const wpn = WEAPONS[state.player.equippedWeapon];
            state.player.attackTimer = 0.3; 
            
            activeHitboxes.push({
                x: state.player.x, y: state.player.y,
                dirX: state.player.dirX, dirY: state.player.dirY,
                weapon: wpn, life: 0.15, hitList: new Set(),
                currentRange: wpn.type === 'projectile' ? 0 : wpn.range
            });

            // Map Obstacle Interaction
            const range = wpn.type === 'projectile' || wpn.type === 'linear' ? wpn.range : TILE_SIZE * 1.2;
            const px = state.player.x + state.player.dirX * range;
            const py = state.player.y + state.player.dirY * range;
            const pr = Math.floor(py / TILE_SIZE);
            const pc = Math.floor(px / TILE_SIZE);
            
            if (pr >= 0 && pr < ROOM_ROWS && pc >= 0 && pc < ROOM_COLS) {
                const targetTile = room.grid[pr][pc];
                if (wpn.clear !== null && wpn.clear === targetTile) {
                    // Trees become stumps; other clearable tiles become floor
                    room.grid[pr][pc] = targetTile === TILE.TREE ? TILE.STUMP : TILE.FLOOR;
                    // Invalidate the room's baked canvas so the stump renders next frame
                    spawnFloat(px, py, 'BAM!', '#fff');
                    tryDropLoot(px, py, 0.3);
                } else if (wpn.grapple && targetTile === wpn.grapple) {
                    state.grappleTarget = {x: pc*TILE_SIZE + TILE_SIZE/2, y: pr*TILE_SIZE + TILE_SIZE/2};
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
        if (e.iFrames > 0) e.iFrames -= dt;
        
        if (e.ai === 'chase' || e.ai === 'chase_fly') {
            const dx = state.player.x - e.x;
            const dy = state.player.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;
            
            let nx = e.x + (dx/dist) * e.speed * dt;
            let ny = e.y + (dy/dist) * e.speed * dt;
            
            if (e.ai !== 'chase_fly') {
                const room = mapData.rooms[state.roomY][state.roomX];
                if (room.grid[Math.floor(ny/TILE_SIZE)][Math.floor(nx/TILE_SIZE)] !== TILE.FLOOR) {
                    nx = e.x; ny = e.y; 
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
    for (let i=activeHitboxes.length-1; i>=0; i--) {
        let hb = activeHitboxes[i];
        hb.life -= dt;
        if (hb.life <= 0) { activeHitboxes.splice(i, 1); continue; }
        
        if (hb.weapon.type === 'linear') {
            hb.currentRange += 600 * dt;
            hb.x = state.player.x + hb.dirX * hb.currentRange;
            hb.y = state.player.y + hb.dirY * hb.currentRange;
        } else if (hb.weapon.type === 'projectile') {
            hb.currentRange += 600 * dt;
            hb.x = state.player.x + hb.dirX * hb.currentRange;
            hb.y = state.player.y + hb.dirY * hb.currentRange;
        } else {
            hb.x = state.player.x; hb.y = state.player.y; 
        }

        activeEnemies.forEach(e => {
            if (hb.hitList.has(e) || e.iFrames > 0) return;
            
            let isHit = false;
            
            if (hb.weapon.type === 'radial') {
                isHit = Math.hypot(e.x - hb.x, e.y - hb.y) < hb.weapon.range;
            } 
            else if (hb.weapon.type === 'linear') {
                const hx = hb.x + hb.dirX * hb.weapon.range;
                const hy = hb.y + hb.dirY * hb.weapon.range;
                isHit = Math.hypot(e.x - hx, e.y - hy) < 30; // wider leniency for thrusts
            }
            else if (hb.weapon.type === 'projectile') {
                isHit = Math.hypot(e.x - hb.x, e.y - hb.y) < 25;
            }
            else if (hb.weapon.type === 'arc') {
                const dist = Math.hypot(e.x - hb.x, e.y - hb.y);
                const angle = Math.atan2(e.y - hb.y, e.x - hb.x);
                const faceAngle = Math.atan2(hb.dirY, hb.dirX);
                let diff = Math.abs(angle - faceAngle);
                if (diff > Math.PI) diff = 2 * Math.PI - diff;
                isHit = dist < hb.weapon.range && diff <= hb.weapon.arc/2;
            }
            
            if (isHit) {
                hb.hitList.add(e);
                const dmg = Math.max(1, Math.floor(state.player.str * hb.weapon.damage * (1 + Math.random()*0.2)));
                e.hp -= dmg;
                e.flashTimer = 0.1;
                e.iFrames = 0.1; // Prevent multihit from same swing
                
                e.x += hb.dirX * 15; e.y += hb.dirY * 15; 
                spawnFloat(e.x, e.y, dmg, '#fff');
                
                if (e.hp <= 0) {
                    const exp = Math.floor(e.xp * (1 + state.player.expBonus));
                    state.player.exp += exp;
                    spawnFloat(e.x, e.y-20, `+${exp}XP`, '#f1c40f');
                    e.dead = true;
                    tryDropLoot(e.x, e.y, 0.15); // 15% drop chance from enemies
                    state.callbacks.onExpGained();
                }
            }
        });
    }
    activeEnemies = activeEnemies.filter(e => !e.dead);
    if (activeEnemies.length === 0) mapData.rooms[state.roomY][state.roomX].cleared = true;
}

function updateDrops() {
    for(let i=drops.length-1; i>=0; i--) {
        const d = drops[i];
        if (Math.hypot(state.player.x - d.x, state.player.y - d.y) < 25) {
            state.callbacks.onItemFound(d.type, d.weaponId);
            spawnFloat(d.x, d.y, '+Item', '#3498db');
            drops.splice(i, 1);
        }
    }
}

function spawnFloat(x, y, text, color) {
    floatingTexts.push({ x, y, text, color, life: 0.8 });
}

// ── Room canvas cache ─────────────────────────────────────────────────────────
// Each room is baked to a full-size offscreen canvas once and re-used every
// frame.  This reduces drawRoomTiles from 117 drawImage calls to 1 blit.
// A room is re-baked when its `cleared` state changes (CHEST/STAIRS appearance).
const _roomCanvas  = new WeakMap(); // room object → { canvas, clearedWhenBaked }

function _getRoomCanvas(room) {
    const cached = _roomCanvas.get(room);
    if (cached && cached.clearedWhenBaked === room.cleared) return cached.canvas;

    const oc  = document.createElement('canvas');
    oc.width  = canvas.width;
    oc.height = canvas.height;
    const octx = oc.getContext('2d');
    for (let r = 0; r < ROOM_ROWS; r++) {
        for (let c = 0; c < ROOM_COLS; c++) {
            drawTile(octx, room.grid[r][c], c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, room.cleared);
        }
    }
    _roomCanvas.set(room, { canvas: oc, clearedWhenBaked: room.cleared });
    return oc;
}


// Draws both the old and new room tiles offset by the scroll progress, then
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
    });

    activeHitboxes.forEach(hb => {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
        ctx.beginPath();
        if (hb.weapon.type === 'linear') {
            ctx.moveTo(hb.x, hb.y);
            ctx.lineTo(hb.x + hb.dirX * hb.currentRange, hb.y + hb.dirY * hb.currentRange);
        } else if (hb.weapon.type === 'projectile') {
            ctx.arc(hb.x, hb.y, 8, 0, Math.PI*2);
        } else if (hb.weapon.type === 'radial') {
            ctx.arc(hb.x, hb.y, hb.weapon.range, 0, Math.PI*2);
        } else {
            const angle = Math.atan2(hb.dirY, hb.dirX);
            ctx.arc(hb.x, hb.y, hb.weapon.range, angle - hb.weapon.arc/2, angle + hb.weapon.arc/2);
        }
        ctx.stroke();
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