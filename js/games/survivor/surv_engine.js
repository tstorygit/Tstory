import { getInputDir } from './surv_input.js';
import { WEAPONS, ENEMIES, CHARACTERS, PASSIVES } from './surv_entities.js';

let ctx, canvas;
let player, gameState, lastTime;
let activeWeapons = [];
let activePassives = [];

const MAX_ENEMIES     = 500;
const MAX_GEMS        = 800;
const MAX_PROJECTILES = 300;
const MAX_DMG_TEXTS   = 100;
const MAX_CHESTS      = 10;

let poolEnemies     = Array.from({ length: MAX_ENEMIES     }, () => ({ active: false }));
let poolGems        = Array.from({ length: MAX_GEMS        }, () => ({ active: false }));
let poolProjectiles = Array.from({ length: MAX_PROJECTILES }, () => ({ active: false }));
let poolDmgTexts    = Array.from({ length: MAX_DMG_TEXTS   }, () => ({ active: false }));
let poolChests      = Array.from({ length: MAX_CHESTS      }, () => ({ active: false }));

let camera = { x: 0, y: 0 };
let spawnTimer  = 0;
let elapsedTime = 0;
let rafId = null;

let uiCallbacks = null;
let metaStats   = null;

// ✅ FIX: Store characterId separately — metaStats is the upgrades object, not character data
let currentCharId = 'ronin';

let elitesSpawned = { 3: false, 6: false, 9: false, 12: false };

const CELL_SIZE = 100;
let spatialHash = new Map();

// ── Tile palette for forest ground ──
const TILE_COLORS = [
    'rgba(20,40,20,1)',
    'rgba(18,36,18,1)',
    'rgba(22,44,22,1)',
    'rgba(19,38,19,1)',
];
let tileCache = new Map();

export function initCanvas(canvasEl, callbacks) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d', { alpha: false });
    uiCallbacks = callbacks;
    resize();
    window.addEventListener('resize', resize);
}

function resize() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    canvas.width  = parent.clientWidth;
    canvas.height = parent.clientHeight;
    tileCache.clear();
}

export function startRun(characterId, metaUpgrades) {
    // ✅ FIX: Store characterId in its own variable
    currentCharId = characterId;
    metaStats = metaUpgrades;

    const charDef = CHARACTERS[characterId];

    player = {
        x: 0, y: 0,
        lastDirX: 1, lastDirY: 0,
        level: 1, xp: 0, xpToNext: 10,
        hp: 100, maxHp: 100,
        stats: {
            moveSpeed: 150,
            moveSpeedMult: charDef.stats.moveSpeedMult || 0,
            damageMult:    0,
            cooldownMult:  0,
            magnetRadius:  60,
            magnetMult:    0,
            armor:         charDef.stats.armor || 0,
            hpMult:        0,
            soulMult:      charDef.stats.soulMult || 0
        },
        invincibility: 0
    };

    player.stats.hpMult        += (metaUpgrades.vitality  || 0) * 0.05;
    player.stats.moveSpeedMult += (metaUpgrades.swiftness  || 0) * 0.02;
    player.stats.soulMult      += (metaUpgrades.greed      || 0) * 0.05;
    player.stats.damageMult    += (metaUpgrades.power      || 0) * 0.05;

    recalcStats();
    player.hp = player.maxHp;

    activeWeapons  = [];
    activePassives = [];
    applyUpgrade({ type: 'weapon', id: charDef.startWeapon });

    poolEnemies.forEach(e => e.active = false);
    poolGems.forEach(g => g.active = false);
    poolProjectiles.forEach(p => p.active = false);
    poolDmgTexts.forEach(t => t.active = false);
    poolChests.forEach(c => c.active = false);

    elitesSpawned = { 3: false, 6: false, 9: false, 12: false };
    elapsedTime = 0;
    spawnTimer  = 0;
    gameState   = 'PLAYING';
    lastTime    = performance.now();

    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(gameLoop);
}

export function pause()  { if (gameState === 'PLAYING') gameState = 'PAUSED'; }
export function resume() {
    if (gameState === 'PAUSED') {
        lastTime  = performance.now();
        gameState = 'PLAYING';
        rafId = requestAnimationFrame(gameLoop);
    }
}
export function stop() {
    gameState = 'STOPPED';
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
}

export function applyUpgrade(upg) {
    if (upg.type === 'weapon') {
        let w = activeWeapons.find(aw => aw.id === upg.id);
        if (w) w.level++;
        else {
            w = { id: upg.id, level: 1, timer: 0, angle: 0 };
            activeWeapons.push(w);
        }
    } else {
        let p = activePassives.find(ap => ap.id === upg.id);
        if (p) p.level++;
        else activePassives.push({ id: upg.id, level: 1 });

        const pDef = PASSIVES[upg.id];
        player.stats[pDef.stat] += pDef.value;
        recalcStats();
    }
}

export function applyPenalty() {
    player.stats.hpMult += 0.01;
    recalcStats();
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.1);
}

export function getActiveWeapons()  { return activeWeapons; }
export function getActivePassives() { return activePassives; }
export function getElapsedTime()    { return elapsedTime; }

function recalcStats() {
    const oldMax = player.maxHp;
    player.maxHp = 100 * (1 + player.stats.hpMult);
    if (player.maxHp > oldMax) player.hp += (player.maxHp - oldMax);
}

// ─── GAME LOOP ─────────────────────────────────────────────────────────────

function gameLoop(time) {
    if (gameState !== 'PLAYING') return;

    let dt = (time - lastTime) / 1000;
    lastTime = time;
    if (dt > 0.1) dt = 0.1;

    elapsedTime += dt;

    if (elapsedTime >= 900 && !poolEnemies.some(e => e.active && e.def.isBoss)) {
        spawnBoss();
    }

    updatePlayer(dt);
    updateWeapons(dt);
    spawnEnemies(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateGems(dt);
    updateChests();
    updateDmgTexts(dt);

    buildSpatialHash();
    checkCollisions();

    drawEverything();

    if (player.xp >= player.xpToNext) {
        player.xp -= player.xpToNext;
        player.level++;
        player.xpToNext = Math.floor(player.xpToNext * 1.2 + 10);
        gameState = 'PAUSED';
        uiCallbacks.onLevelUp();
    }

    if (player.hp <= 0) {
        gameState = 'GAME_OVER';
        uiCallbacks.onGameOver(false);
    }

    rafId = requestAnimationFrame(gameLoop);
}

function updatePlayer(dt) {
    const dir = getInputDir();
    if (dir.x !== 0 || dir.y !== 0) {
        player.lastDirX = dir.x;
        player.lastDirY = dir.y;
    }
    const speed = player.stats.moveSpeed * (1 + player.stats.moveSpeedMult);
    player.x += dir.x * speed * dt;
    player.y += dir.y * speed * dt;

    if (player.invincibility > 0) player.invincibility -= dt;

    camera.x = player.x - canvas.width / 2;
    camera.y = player.y - canvas.height / 2;
}

function updateWeapons(dt) {
    const cdMult  = 1 + player.stats.cooldownMult;
    const dmgMult = 1 + player.stats.damageMult;

    activeWeapons.forEach(aw => {
        const def    = WEAPONS[aw.id];
        const lvlDef = def.levels[aw.level - 1];
        aw.timer -= dt;

        if (def.type === 'orbital') {
            aw.angle += lvlDef.speed * dt;
            const radius = 80;
            for (let i = 0; i < lvlDef.count; i++) {
                const a  = aw.angle + (Math.PI * 2 / lvlDef.count) * i;
                const px = player.x + Math.cos(a) * radius;
                const py = player.y + Math.sin(a) * radius;
                spawnProjectile({
                    type: 'hitbox', x: px, y: py, radius: 20,
                    damage: lvlDef.damage * dmgMult, duration: 0.05, pierce: 999, emoji: def.icon
                });
            }
        } else if (def.type === 'aura') {
            if (aw.timer <= 0) {
                aw.timer = lvlDef.cooldown * cdMult;
                spawnProjectile({
                    type: 'aura', x: player.x, y: player.y, radius: 100 * lvlDef.area,
                    damage: lvlDef.damage * dmgMult, duration: 0.2, pierce: 999
                });
            }
        } else if (aw.timer <= 0) {
            aw.timer = lvlDef.cooldown * cdMult;

            if (def.type === 'directional') {
                for (let i = 0; i < lvlDef.count; i++) {
                    let dirX = player.lastDirX, dirY = player.lastDirY;
                    if (i === 1 && lvlDef.count >= 2) { dirX *= -1; dirY *= -1; }
                    if (i === 2) { const t = dirX; dirX = -dirY; dirY = t; }
                    spawnProjectile({
                        type: 'melee', x: player.x + dirX * 30, y: player.y + dirY * 30,
                        vx: dirX * 400, vy: dirY * 400,
                        radius: 30 * (lvlDef.area || 1),
                        damage: lvlDef.damage * dmgMult, duration: 0.25,
                        pierce: 3, emoji: def.icon
                    });
                }
            } else if (def.type === 'projectile') {
                // Find nearest enemies
                const nearest = poolEnemies
                    .filter(e => e.active)
                    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))
                    .slice(0, lvlDef.count);
                nearest.forEach(target => {
                    const dx = target.x - player.x;
                    const dy = target.y - player.y;
                    const d  = Math.hypot(dx, dy) || 1;
                    spawnProjectile({
                        type: 'projectile',
                        x: player.x, y: player.y,
                        vx: (dx / d) * lvlDef.speed,
                        vy: (dy / d) * lvlDef.speed,
                        radius: 10, damage: lvlDef.damage * dmgMult,
                        duration: 2.0, pierce: 1, emoji: def.icon
                    });
                });
            } else if (def.type === 'random_aoe') {
                const targets = poolEnemies.filter(e => e.active);
                for (let i = 0; i < lvlDef.count; i++) {
                    if (!targets.length) break;
                    const t = targets[Math.floor(Math.random() * targets.length)];
                    spawnProjectile({
                        type: 'aoe', x: t.x, y: t.y,
                        radius: 50 * (lvlDef.area || 1),
                        damage: lvlDef.damage * dmgMult,
                        duration: 0.4, pierce: 999, emoji: def.icon
                    });
                }
            }
        }
    });
}

function spawnProjectile(opts) {
    const p = poolProjectiles.find(x => !x.active);
    if (!p) return;
    Object.assign(p, { active: true, hitList: new Set() }, opts);
}

function spawnBoss() {
    const e = poolEnemies.find(x => !x.active);
    if (!e) return;
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.max(canvas.width, canvas.height) * 0.7;
    Object.assign(e, {
        active: true,
        x: player.x + Math.cos(angle) * dist,
        y: player.y + Math.sin(angle) * dist,
        def: { ...ENEMIES.boss },
        hp: ENEMIES.boss.hp
    });
}

function spawnEnemies(dt) {
    spawnTimer -= dt;
    if (spawnTimer > 0) return;

    const wave    = Math.floor(elapsedTime / 60);
    const count   = 3 + wave * 2;
    spawnTimer    = Math.max(0.5, 2.5 - wave * 0.15);

    // Elite spawns at fixed minutes
    const minuteKey = Math.floor(elapsedTime / 60) * 3;
    if ([3, 6, 9, 12].includes(minuteKey) && !elitesSpawned[minuteKey]) {
        elitesSpawned[minuteKey] = true;
        _spawnOne({ ...ENEMIES.tank, isElite: true, hp: ENEMIES.tank.hp * 5, emoji: '👹' });
    }

    const types = wave < 1 ? ['grunt'] :
                  wave < 2 ? ['grunt', 'grunt', 'dasher'] :
                             ['grunt', 'dasher', 'tank'];
    for (let i = 0; i < count; i++) {
        const t = types[Math.floor(Math.random() * types.length)];
        _spawnOne(ENEMIES[t]);
    }
}

function _spawnOne(def) {
    const e = poolEnemies.find(x => !x.active);
    if (!e) return;
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.max(canvas.width, canvas.height) * 0.6 + Math.random() * 100;
    Object.assign(e, { active: true, def, hp: def.hp, x: player.x + Math.cos(angle) * dist, y: player.y + Math.sin(angle) * dist });
}

function updateEnemies(dt) {
    for (let i = 0; i < poolEnemies.length; i++) {
        const e = poolEnemies[i];
        if (!e.active) continue;
        const dx   = player.x - e.x;
        const dy   = player.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        e.x += (dx / dist) * e.def.speed * dt;
        e.y += (dy / dist) * e.def.speed * dt;
    }
}

function updateProjectiles(dt) {
    for (let i = 0; i < poolProjectiles.length; i++) {
        const p = poolProjectiles[i];
        if (!p.active) continue;
        p.duration -= dt;
        if (p.duration <= 0) { p.active = false; continue; }
        if (p.vx) p.x += p.vx * dt;
        if (p.vy) p.y += p.vy * dt;
    }
}

function updateGems(dt) {
    const magRad = player.stats.magnetRadius * (1 + player.stats.magnetMult);
    for (let i = 0; i < poolGems.length; i++) {
        const g    = poolGems[i];
        if (!g.active) continue;
        const dx   = player.x - g.x;
        const dy   = player.y - g.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 30) {
            g.active = false;
            player.xp += g.xp;
        } else if (dist < magRad) {
            g.x += (dx / dist) * 300 * dt;
            g.y += (dy / dist) * 300 * dt;
        }
    }
}

function updateChests() {
    for (let i = 0; i < poolChests.length; i++) {
        const c = poolChests[i];
        if (!c.active) continue;
        if (Math.hypot(player.x - c.x, player.y - c.y) < 40) {
            c.active = false;
            gameState = 'PAUSED';
            uiCallbacks.onChest();
        }
    }
}

function buildSpatialHash() {
    spatialHash.clear();
    for (let i = 0; i < poolEnemies.length; i++) {
        const e = poolEnemies[i];
        if (!e.active) continue;
        const cx  = Math.floor(e.x / CELL_SIZE);
        const cy  = Math.floor(e.y / CELL_SIZE);
        const key = `${cx},${cy}`;
        if (!spatialHash.has(key)) spatialHash.set(key, []);
        spatialHash.get(key).push(e);
    }
}

function getEnemiesNear(x, y, radius) {
    const rCells = Math.ceil(radius / CELL_SIZE);
    const cx     = Math.floor(x / CELL_SIZE);
    const cy     = Math.floor(y / CELL_SIZE);
    const result = [];
    for (let i = cx - rCells; i <= cx + rCells; i++) {
        for (let j = cy - rCells; j <= cy + rCells; j++) {
            const bucket = spatialHash.get(`${i},${j}`);
            if (bucket) {
                for (let k = 0; k < bucket.length; k++) {
                    const e = bucket[k];
                    if (Math.hypot(e.x - x, e.y - y) <= radius) result.push(e);
                }
            }
        }
    }
    return result;
}

function checkCollisions() {
    if (player.invincibility <= 0) {
        for (let i = 0; i < poolEnemies.length; i++) {
            const e = poolEnemies[i];
            if (!e.active) continue;
            if (Math.hypot(player.x - e.x, player.y - e.y) < 30) {
                const dmg = Math.max(1, e.def.damage - player.stats.armor);
                player.hp -= dmg;
                player.invincibility = 0.5;
                spawnDmgText(player.x, player.y - 30, dmg, '#ff4757');
                break;
            }
        }
    }

    for (let j = 0; j < poolProjectiles.length; j++) {
        const p = poolProjectiles[j];
        if (!p.active) continue;

        const checkRadius = p.radius + 15;
        const targets     = getEnemiesNear(p.x, p.y, checkRadius);

        for (let k = 0; k < targets.length; k++) {
            const e = targets[k];
            if (p.hitList && p.hitList.has(e)) continue;

            e.hp -= p.damage;
            if (p.hitList) p.hitList.add(e);
            p.pierce--;
            spawnDmgText(e.x, e.y - 20, Math.floor(p.damage), '#fff');

            if (e.hp <= 0) {
                e.active = false;
                uiCallbacks.onKill();

                if (e.def.isBoss) {
                    gameState = 'GAME_OVER';
                    uiCallbacks.onGameOver(true);
                } else if (e.def.isElite) {
                    const c = poolChests.find(x => !x.active);
                    if (c) { c.active = true; c.x = e.x; c.y = e.y; }
                } else {
                    const g = poolGems.find(x => !x.active);
                    if (g) {
                        g.active = true; g.x = e.x; g.y = e.y; g.xp = e.def.xp;
                        g.color  = g.xp >= 20 ? '#e74c3c' : g.xp >= 5 ? '#2ecc71' : '#3498db';
                        g.glow   = g.xp >= 20 ? 'rgba(231,76,60,0.6)' : g.xp >= 5 ? 'rgba(46,204,113,0.6)' : 'rgba(52,152,219,0.6)';
                    }
                }
            }

            if (p.pierce <= 0) { p.active = false; break; }
        }
    }
}

function spawnDmgText(x, y, text, color) {
    const t = poolDmgTexts.find(x => !x.active);
    if (!t) return;
    t.active = true;
    t.x = x; t.y = y; t.text = text; t.color = color; t.life = 0.7;
    t.vx = (Math.random() - 0.5) * 40;
}

function updateDmgTexts(dt) {
    for (let i = 0; i < poolDmgTexts.length; i++) {
        const t = poolDmgTexts[i];
        if (!t.active) continue;
        t.life -= dt;
        t.y    -= 50 * dt;
        t.x    += (t.vx || 0) * dt;
        if (t.life <= 0) t.active = false;
    }
}

// ─── DRAW ──────────────────────────────────────────────────────────────────

function drawEverything() {
    const cw = canvas.width;
    const ch = canvas.height;

    // ── Forest floor: tiled dark-green cells ──
    ctx.fillStyle = '#0d1f0d';
    ctx.fillRect(0, 0, cw, ch);

    const tileSize = 80;
    const offX = ((-camera.x % tileSize) + tileSize) % tileSize;
    const offY = ((-camera.y % tileSize) + tileSize) % tileSize;
    const startTileX = Math.floor(camera.x / tileSize);
    const startTileY = Math.floor(camera.y / tileSize);

    for (let tx = -1; tx <= Math.ceil(cw / tileSize) + 1; tx++) {
        for (let ty = -1; ty <= Math.ceil(ch / tileSize) + 1; ty++) {
            const worldTX = startTileX + tx;
            const worldTY = startTileY + ty;
            const hash = ((worldTX * 73856093) ^ (worldTY * 19349663)) & 3;
            ctx.fillStyle = TILE_COLORS[hash];
            ctx.fillRect(
                offX + tx * tileSize,
                offY + ty * tileSize,
                tileSize - 1,
                tileSize - 1
            );
        }
    }

    // Subtle grid overlay
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = offX; x < cw; x += tileSize) { ctx.moveTo(x, 0); ctx.lineTo(x, ch); }
    for (let y = offY; y < ch; y += tileSize) { ctx.moveTo(0, y); ctx.lineTo(cw, y); }
    ctx.stroke();

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // ── Chests ──
    for (let i = 0; i < poolChests.length; i++) {
        const c = poolChests[i];
        if (!c.active) continue;
        const cx = c.x - camera.x, cy = c.y - camera.y;
        // Glow
        ctx.shadowColor = 'rgba(241,196,15,0.8)';
        ctx.shadowBlur  = 20;
        ctx.font = '30px Arial';
        ctx.fillText('🧰', cx, cy);
        ctx.shadowBlur = 0;
    }

    // ── XP Gems ──
    for (let i = 0; i < poolGems.length; i++) {
        const g = poolGems[i];
        if (!g.active) continue;
        const gx = g.x - camera.x, gy = g.y - camera.y;
        const r  = g.xp >= 20 ? 7 : g.xp >= 5 ? 6 : 4;

        ctx.shadowColor = g.glow || g.color;
        ctx.shadowBlur  = 10;
        ctx.fillStyle   = g.color;
        ctx.beginPath();
        ctx.arc(gx, gy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // ── Player ──
    const px = player.x - camera.x;
    const py = player.y - camera.y;
    const isBlinking = player.invincibility > 0 && Math.floor(elapsedTime * 10) % 2 === 0;

    if (!isBlinking) {
        // Shadow ring
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(px, py + 14, 16, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Player glow
        ctx.shadowColor = 'rgba(100,200,255,0.5)';
        ctx.shadowBlur  = 18;
        ctx.font = '28px Arial';
        ctx.fillText(CHARACTERS[currentCharId].icon, px, py); // ✅ uses correct char
        ctx.shadowBlur = 0;
    }

    // Beads aura ring
    const beads = activeWeapons.find(w => w.id === 'beads');
    if (beads) {
        const rad = 40 * WEAPONS.beads.levels[beads.level - 1].area;
        ctx.shadowColor = 'rgba(241,196,15,0.5)';
        ctx.shadowBlur  = 12;
        ctx.strokeStyle = 'rgba(241,196,15,0.35)';
        ctx.lineWidth   = 3;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // ── Projectiles ──
    for (let i = 0; i < poolProjectiles.length; i++) {
        const p = poolProjectiles[i];
        if (!p.active) continue;
        const ppx = p.x - camera.x, ppy = p.y - camera.y;

        if (p.emoji) {
            ctx.shadowColor = 'rgba(255,200,50,0.6)';
            ctx.shadowBlur  = 8;
            ctx.font = `${Math.max(14, p.radius * 1.5)}px Arial`;
            ctx.fillText(p.emoji, ppx, ppy);
            ctx.shadowBlur = 0;
        } else if (p.type === 'aoe') {
            ctx.shadowColor = 'rgba(231,76,60,0.5)';
            ctx.shadowBlur  = 20;
            ctx.fillStyle   = 'rgba(231,76,60,0.35)';
            ctx.strokeStyle = 'rgba(231,76,60,0.8)';
            ctx.lineWidth   = 2;
            ctx.beginPath();
            ctx.arc(ppx, ppy, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else if (p.type === 'aura') {
            ctx.strokeStyle = 'rgba(241,196,15,0.25)';
            ctx.lineWidth   = 6;
            ctx.beginPath();
            ctx.arc(ppx, ppy, p.radius, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // ── Enemies ──
    for (let i = 0; i < poolEnemies.length; i++) {
        const e = poolEnemies[i];
        if (!e.active) continue;
        const ex = e.x - camera.x;
        const ey = e.y - camera.y;

        const fontSize = e.def.isBoss ? 80 : e.def.isElite ? 40 : 24;

        if (e.def.isBoss) {
            ctx.shadowColor = 'rgba(231,76,60,0.7)';
            ctx.shadowBlur  = 30;
        } else if (e.def.isElite) {
            ctx.shadowColor = 'rgba(155,89,182,0.6)';
            ctx.shadowBlur  = 15;
        }

        ctx.font = `${fontSize}px Arial`;
        ctx.fillText(e.def.emoji, ex, ey);
        ctx.shadowBlur = 0;

        // Health bar for boss / elite
        if (e.def.isBoss || e.def.isElite) {
            const bw = e.def.isBoss ? 100 : 50;
            const by = e.def.isBoss ? 52 : 26;
            const hpPct = Math.max(0, e.hp / e.def.hp);
            const barColor = hpPct > 0.5 ? '#2ecc71' : hpPct > 0.25 ? '#f39c12' : '#e74c3c';

            // bg
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.beginPath();
            ctx.roundRect(ex - bw / 2, ey + by, bw, 8, 4);
            ctx.fill();
            // fill
            ctx.fillStyle = barColor;
            ctx.beginPath();
            ctx.roundRect(ex - bw / 2, ey + by, bw * hpPct, 8, 4);
            ctx.fill();
        }
    }

    // ── Damage Numbers ──
    for (let i = 0; i < poolDmgTexts.length; i++) {
        const t = poolDmgTexts[i];
        if (!t.active) continue;
        const alpha = Math.min(1, t.life * 2);
        const scale = 1 + (1 - t.life / 0.7) * 0.3;
        ctx.globalAlpha = alpha;
        ctx.font        = `bold ${Math.round(14 * scale)}px monospace`;

        // outline
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.lineWidth   = 3;
        ctx.strokeText(t.text, t.x - camera.x, t.y - camera.y);

        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x - camera.x, t.y - camera.y);
    }
    ctx.globalAlpha = 1.0;

    // ── Vignette ──
    const grad = ctx.createRadialGradient(cw / 2, ch / 2, cw * 0.3, cw / 2, ch / 2, cw * 0.8);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    uiCallbacks.onDraw(player.hp, player.maxHp, player.xp, player.xpToNext, player.level, elapsedTime);
}