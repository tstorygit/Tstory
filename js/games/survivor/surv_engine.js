
import { getInputDir } from './surv_input.js';
import { WEAPONS, ENEMIES, CHARACTERS, PASSIVES } from './surv_entities.js';

let ctx, canvas;
let player, gameState, lastTime;
let activeWeapons = [];
let activePassives = [];

const MAX_ENEMIES = 500;
const MAX_GEMS = 800;
const MAX_PROJECTILES = 300;
const MAX_DMG_TEXTS = 100;
const MAX_CHESTS = 10;

let poolEnemies = Array.from({length: MAX_ENEMIES}, () => ({ active: false }));
let poolGems = Array.from({length: MAX_GEMS}, () => ({ active: false }));
let poolProjectiles = Array.from({length: MAX_PROJECTILES}, () => ({ active: false }));
let poolDmgTexts = Array.from({length: MAX_DMG_TEXTS}, () => ({ active: false }));
let poolChests = Array.from({length: MAX_CHESTS}, () => ({ active: false }));

let camera = { x: 0, y: 0 };
let spawnTimer = 0;
let elapsedTime = 0;
let rafId = null;

let uiCallbacks = null;
let metaStats = null;
let elitesSpawned = { 3: false, 6: false, 9: false, 12: false };

// Spatial Hashing Grid size
const CELL_SIZE = 100;
let spatialHash = new Map();

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
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
}

export function startRun(characterId, metaUpgrades) {
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
            damageMult: 0,
            cooldownMult: 0,
            magnetRadius: 60,
            magnetMult: 0,
            armor: charDef.stats.armor || 0,
            hpMult: 0,
            soulMult: charDef.stats.soulMult || 0
        },
        invincibility: 0
    };

    player.stats.hpMult += (metaUpgrades.vitality || 0) * 0.05;
    player.stats.moveSpeedMult += (metaUpgrades.swiftness || 0) * 0.02;
    player.stats.soulMult += (metaUpgrades.greed || 0) * 0.05;
    player.stats.damageMult += (metaUpgrades.power || 0) * 0.05;

    recalcStats();
    player.hp = player.maxHp;

    activeWeapons = [];
    activePassives = [];
    applyUpgrade({ type: 'weapon', id: charDef.startWeapon });

    poolEnemies.forEach(e => e.active = false);
    poolGems.forEach(g => g.active = false);
    poolProjectiles.forEach(p => p.active = false);
    poolDmgTexts.forEach(t => t.active = false);
    poolChests.forEach(c => c.active = false);

    elitesSpawned = { 3: false, 6: false, 9: false, 12: false };
    elapsedTime = 0;
    spawnTimer = 0;
    gameState = 'PLAYING';
    lastTime = performance.now();
    
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(gameLoop);
}

export function pause() { if (gameState === 'PLAYING') gameState = 'PAUSED'; }
export function resume() { 
    if (gameState === 'PAUSED') {
        lastTime = performance.now();
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

export function getActiveWeapons() { return activeWeapons; }
export function getActivePassives() { return activePassives; }
export function getElapsedTime() { return elapsedTime; }

function recalcStats() {
    const oldMax = player.maxHp;
    player.maxHp = 100 * (1 + player.stats.hpMult);
    if (player.maxHp > oldMax) player.hp += (player.maxHp - oldMax);
}

// ─── GAME LOOP ───

function gameLoop(time) {
    if (gameState !== 'PLAYING') return;

    let dt = (time - lastTime) / 1000;
    lastTime = time;
    if (dt > 0.1) dt = 0.1; // Cap to prevent clipping if tab is backgrounded

    elapsedTime += dt;
    
    // Win condition (15 minutes)
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
    const cdMult = 1 + player.stats.cooldownMult;
    const dmgMult = 1 + player.stats.damageMult;

    activeWeapons.forEach(aw => {
        const def = WEAPONS[aw.id];
        const lvlDef = def.levels[aw.level - 1];
        aw.timer -= dt;

        if (def.type === 'orbital') {
            aw.angle += lvlDef.speed * dt;
            const radius = 80;
            for (let i=0; i<lvlDef.count; i++) {
                const a = aw.angle + (Math.PI * 2 / lvlDef.count) * i;
                const px = player.x + Math.cos(a) * radius;
                const py = player.y + Math.sin(a) * radius;
                
                spawnProjectile({
                    type: 'hitbox', x: px, y: py, radius: 20, 
                    damage: lvlDef.damage * dmgMult, duration: 0.05, pierce: 999, emoji: def.icon
                });
            }
        } 
        else if (def.type === 'aura') {
            if (aw.timer <= 0) {
                aw.timer = lvlDef.cooldown * cdMult;
                spawnProjectile({
                    type: 'aura', x: player.x, y: player.y, radius: 100 * lvlDef.area,
                    damage: lvlDef.damage * dmgMult, duration: 0.2, pierce: 999
                });
            }
        }
        else if (aw.timer <= 0) {
            aw.timer = lvlDef.cooldown * cdMult;
            if (def.type === 'directional') {
                for (let i=0; i<lvlDef.count; i++) {
                    let dirX = player.lastDirX, dirY = player.lastDirY;
                    if (i === 1 && lvlDef.count >= 2) { dirX *= -1; dirY *= -1; } 
                    if (i === 2) { const t=dirX; dirX=-dirY; dirY=t; } 
                    
                    spawnProjectile({
                        type: 'melee', x: player.x + dirX*30, y: player.y + dirY*30,
                        vx: dirX*100, vy: dirY*100, radius: 40 * lvlDef.area,
                        damage: lvlDef.damage * dmgMult, duration: 0.2, pierce: 999, emoji: def.icon
                    });
                }
            } else if (def.type === 'projectile') {
                // Find nearest using spatial hash or simple dist if low count
                let target = null, minDist = 999999;
                for (let i=0; i<poolEnemies.length; i++) {
                    const e = poolEnemies[i];
                    if (!e.active) continue;
                    const d = Math.hypot(e.x - player.x, e.y - player.y);
                    if (d < minDist) { minDist = d; target = e; }
                }
                let dirX = player.lastDirX, dirY = player.lastDirY;
                if (target) {
                    dirX = (target.x - player.x) / minDist;
                    dirY = (target.y - player.y) / minDist;
                }
                for (let i=0; i<lvlDef.count; i++) {
                    const spread = (i - (lvlDef.count-1)/2) * 0.2;
                    const vx = dirX*Math.cos(spread) - dirY*Math.sin(spread);
                    const vy = dirX*Math.sin(spread) + dirY*Math.cos(spread);
                    spawnProjectile({
                        type: 'bullet', x: player.x, y: player.y,
                        vx: vx * lvlDef.speed, vy: vy * lvlDef.speed, radius: 15,
                        damage: lvlDef.damage * dmgMult, duration: 3.0, pierce: 1, emoji: def.icon
                    });
                }
            } else if (def.type === 'random_aoe') {
                for (let i=0; i<lvlDef.count; i++) {
                    const rx = player.x + (Math.random()-0.5)*600;
                    const ry = player.y + (Math.random()-0.5)*600;
                    spawnProjectile({
                        type: 'aoe', x: rx, y: ry, radius: 60 * lvlDef.area,
                        damage: lvlDef.damage * dmgMult, duration: 0.5, pierce: 999, emoji: def.icon
                    });
                }
            }
        }
    });
}

function spawnProjectile(p) {
    const obj = poolProjectiles.find(o => !o.active);
    if (!obj) return;
    Object.assign(obj, p);
    obj.active = true;
    obj.hitList = new Set();
}

function spawnBoss() {
    if (poolEnemies.some(e => e.active && e.def.isBoss)) return; 
    const obj = poolEnemies.find(o => !o.active);
    if (!obj) return;
    obj.active = true;
    obj.def = ENEMIES.boss;
    obj.hp = obj.def.hp;
    obj.x = player.x;
    obj.y = player.y - 400; 
}

function spawnEnemies(dt) {
    spawnTimer += dt;
    const currentMin = Math.floor(elapsedTime / 60);
    
    // Check Elite Spawns at 3, 6, 9, 12
    if ([3, 6, 9, 12].includes(currentMin) && !elitesSpawned[currentMin]) {
        elitesSpawned[currentMin] = true;
        const obj = poolEnemies.find(o => !o.active);
        if (obj) {
            obj.active = true;
            obj.def = { ...ENEMIES.tank, isElite: true, emoji: '👺', hp: 300 * (currentMin/3) };
            obj.hp = obj.def.hp;
            obj.x = player.x + 300;
            obj.y = player.y;
        }
    }

    if (currentMin >= 15) return;

    let spawnRate = Math.max(0.1, 1.0 - (currentMin * 0.08));
    
    if (spawnTimer >= spawnRate) {
        spawnTimer = 0;
        let count = 1 + Math.floor(currentMin / 2);
        
        let type = 'grunt';
        if (currentMin >= 3 && Math.random() < 0.3) type = 'dasher';
        if (currentMin >= 6 && Math.random() < 0.2) type = 'tank';

        for (let i=0; i<count; i++) {
            const obj = poolEnemies.find(o => !o.active);
            if (!obj) break;
            
            const angle = Math.random() * Math.PI * 2;
            const r = 500;
            obj.active = true;
            obj.def = ENEMIES[type];
            obj.hp = obj.def.hp * (1 + currentMin*0.1);
            obj.x = player.x + Math.cos(angle) * r;
            obj.y = player.y + Math.sin(angle) * r;
        }
    }
}

function updateEnemies(dt) {
    for (let i=0; i<poolEnemies.length; i++) {
        const e = poolEnemies[i];
        if (!e.active) continue;

        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 0) {
            e.x += (dx / dist) * e.def.speed * dt;
            e.y += (dy / dist) * e.def.speed * dt;
        }

        if (dist > 1500 && !e.def.isBoss && !e.def.isElite) e.active = false;
    }
}

function updateProjectiles(dt) {
    for (let i=0; i<poolProjectiles.length; i++) {
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
    for (let i=0; i<poolGems.length; i++) {
        const g = poolGems[i];
        if (!g.active) continue;
        
        const dx = player.x - g.x;
        const dy = player.y - g.y;
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
    for (let i=0; i<poolChests.length; i++) {
        const c = poolChests[i];
        if (!c.active) continue;
        const dist = Math.hypot(player.x - c.x, player.y - c.y);
        if (dist < 40) {
            c.active = false;
            gameState = 'PAUSED';
            uiCallbacks.onChest();
        }
    }
}

function buildSpatialHash() {
    spatialHash.clear();
    for (let i=0; i<poolEnemies.length; i++) {
        const e = poolEnemies[i];
        if (!e.active) continue;
        const cx = Math.floor(e.x / CELL_SIZE);
        const cy = Math.floor(e.y / CELL_SIZE);
        const key = `${cx},${cy}`;
        if (!spatialHash.has(key)) spatialHash.set(key, []);
        spatialHash.get(key).push(e);
    }
}

function getEnemiesNear(x, y, radius) {
    const rCells = Math.ceil(radius / CELL_SIZE);
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);
    const result = [];
    
    for (let i = cx - rCells; i <= cx + rCells; i++) {
        for (let j = cy - rCells; j <= cy + rCells; j++) {
            const bucket = spatialHash.get(`${i},${j}`);
            if (bucket) {
                for (let k=0; k<bucket.length; k++) {
                    const e = bucket[k];
                    if (Math.hypot(e.x - x, e.y - y) <= radius) result.push(e);
                }
            }
        }
    }
    return result;
}

function checkCollisions() {
    // Player vs Enemies (Simple distance to all active)
    if (player.invincibility <= 0) {
        for (let i=0; i<poolEnemies.length; i++) {
            const e = poolEnemies[i];
            if (!e.active) continue;
            if (Math.hypot(player.x - e.x, player.y - e.y) < 30) {
                const dmg = Math.max(1, e.def.damage - player.stats.armor);
                player.hp -= dmg;
                player.invincibility = 0.5;
                spawnDmgText(player.x, player.y - 30, dmg, '#e74c3c');
                break; // Take damage from one per frame max
            }
        }
    }

    // Projectiles vs Enemies via Spatial Hash
    for (let j=0; j<poolProjectiles.length; j++) {
        const p = poolProjectiles[j];
        if (!p.active) continue;

        const checkRadius = p.radius + 15;
        const targets = getEnemiesNear(p.x, p.y, checkRadius);
        
        for (let k=0; k<targets.length; k++) {
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
                    if (c) {
                        c.active = true; c.x = e.x; c.y = e.y;
                    }
                } else {
                    const g = poolGems.find(x => !x.active);
                    if (g) {
                        g.active = true; g.x = e.x; g.y = e.y; g.xp = e.def.xp;
                        g.color = g.xp >= 20 ? '#e74c3c' : g.xp >= 5 ? '#2ecc71' : '#3498db';
                    }
                }
            }

            if (p.pierce <= 0) {
                p.active = false;
                break;
            }
        }
    }
}

function spawnDmgText(x, y, text, color) {
    const t = poolDmgTexts.find(x => !x.active);
    if (!t) return;
    t.active = true;
    t.x = x; t.y = y; t.text = text; t.color = color; t.life = 0.5;
}

function updateDmgTexts(dt) {
    for (let i=0; i<poolDmgTexts.length; i++) {
        const t = poolDmgTexts[i];
        if (!t.active) continue;
        t.life -= dt;
        t.y -= 30 * dt;
        if (t.life <= 0) t.active = false;
    }
}

function drawEverything() {
    // Solid background matching app theme
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Tiled Ground Grid (Moves with camera)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    const cw = canvas.width, ch = canvas.height;
    const offsetX = -(camera.x % 100);
    const offsetY = -(camera.y % 100);
    ctx.beginPath();
    for (let x = offsetX; x < cw; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, ch); }
    for (let y = offsetY; y < ch; y += 100) { ctx.moveTo(0, y); ctx.lineTo(cw, y); }
    ctx.stroke();

    // Chests
    ctx.font = "30px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i=0; i<poolChests.length; i++) {
        const c = poolChests[i];
        if (!c.active) continue;
        ctx.fillText("🧰", c.x - camera.x, c.y - camera.y);
    }

    // Gems
    for (let i=0; i<poolGems.length; i++) {
        const g = poolGems[i];
        if (!g.active) continue;
        ctx.fillStyle = g.color;
        ctx.beginPath();
        ctx.arc(g.x - camera.x, g.y - camera.y, 5, 0, Math.PI*2);
        ctx.fill();
    }

    // Player
    ctx.font = "28px Arial";
    if (player.invincibility <= 0 || Math.floor(elapsedTime * 10) % 2 === 0) {
        ctx.fillText(CHARACTERS[metaStats.charId||'ronin'].icon, player.x - camera.x, player.y - camera.y);
    }
    
    const beads = activeWeapons.find(w => w.id === 'beads');
    if (beads) {
        const rad = 40 * WEAPONS.beads.levels[beads.level-1].area;
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.3)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(player.x - camera.x, player.y - camera.y, rad, 0, Math.PI*2);
        ctx.stroke();
    }

    // Projectiles
    for (let i=0; i<poolProjectiles.length; i++) {
        const p = poolProjectiles[i];
        if (!p.active) continue;
        if (p.emoji) {
            ctx.font = `${p.radius*1.5}px Arial`;
            ctx.fillText(p.emoji, p.x - camera.x, p.y - camera.y);
        } else if (p.type === 'aoe') {
            ctx.fillStyle = 'rgba(231, 76, 60, 0.4)';
            ctx.beginPath();
            ctx.arc(p.x - camera.x, p.y - camera.y, p.radius, 0, Math.PI*2);
            ctx.fill();
        }
    }

    // Enemies
    for (let i=0; i<poolEnemies.length; i++) {
        const e = poolEnemies[i];
        if (!e.active) continue;
        const ex = e.x - camera.x;
        const ey = e.y - camera.y;
        
        ctx.font = e.def.isBoss ? "80px Arial" : e.def.isElite ? "40px Arial" : "24px Arial";
        ctx.fillText(e.def.emoji, ex, ey);

        if (e.def.isBoss || e.def.isElite) {
            ctx.fillStyle = '#333';
            const bw = e.def.isBoss ? 100 : 50;
            const by = e.def.isBoss ? 50 : 25;
            ctx.fillRect(ex - bw/2, ey + by, bw, 6);
            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(ex - bw/2, ey + by, bw * (e.hp / e.def.hp), 6);
        }
    }

    // Dmg Texts
    ctx.font = "bold 14px monospace";
    for (let i=0; i<poolDmgTexts.length; i++) {
        const t = poolDmgTexts[i];
        if (!t.active) continue;
        ctx.fillStyle = t.color;
        ctx.globalAlpha = t.life * 2;
        ctx.fillText(t.text, t.x - camera.x, t.y - camera.y);
    }
    ctx.globalAlpha = 1.0;

    uiCallbacks.onDraw(player.hp, player.maxHp, player.xp, player.xpToNext, player.level, elapsedTime);
}