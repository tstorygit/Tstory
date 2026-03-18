import { getInputDir } from './surv_input.js';
import { WEAPONS, ENEMIES, CHARACTERS, PASSIVES } from './surv_entities.js';
import * as Audio from './surv_audio.js';

let ctx, canvas;
let player, gameState, lastTime;
let activeWeapons  = [];
let activePassives = [];

const MAX_ENEMIES     = 500;
const MAX_GEMS        = 800;
const MAX_PROJECTILES = 600;
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

let uiCallbacks  = null;
let metaStats    = null;
let currentCharId = 'ronin';

// ── Elite / boss state ──
let elitesSpawned = new Set(); // stores minute numbers already spawned
let bossWarned    = false;     // only warn once per run

// ── Screen shake ──

// ── Enemy-hit sound throttle ──
let lastEnemyHitSound = 0;

const CELL_SIZE = 100;
let spatialHash = new Map();

const TILE_COLORS = [
    'rgba(20,40,20,1)',
    'rgba(18,36,18,1)',
    'rgba(22,44,22,1)',
    'rgba(19,38,19,1)',
];

export function initCanvas(canvasEl, callbacks) {
    canvas      = canvasEl;
    ctx         = canvas.getContext('2d', { alpha: false });
    uiCallbacks = callbacks;
    resize();
    window.addEventListener('resize', resize);
}

// Exported so survivor.js can force a re-measure after _show('game') makes the
// screen visible — initCanvas() runs while the screen is display:none, which
// gives clientWidth/clientHeight=0 and produces a 0×0 canvas (red screen).
export function resize() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    canvas.width  = parent.clientWidth;
    canvas.height = parent.clientHeight;
}

export function startRun(characterId, metaUpgrades) {
    currentCharId = characterId;
    metaStats     = metaUpgrades;

    const charDef = CHARACTERS[characterId];

    player = {
        x: 0, y: 0,
        lastDirX: 1, lastDirY: 0,
        level: 1, xp: 0, xpToNext: 10,
        hp: 100, maxHp: 100,
        stats: {
            moveSpeed:          150,
            moveSpeedMult:      charDef.stats.moveSpeedMult || 0,
            damageMult:         charDef.stats.damageMult    || 0,
            cooldownMult:       charDef.stats.cooldownMult  || 0,
            magnetRadius:       60,
            magnetMult:         0,
            armor:              charDef.stats.armor || 0,
            hpMult:             charDef.stats.hpMult || 0,
            soulMult:           charDef.stats.soulMult || 0,
            // New shrine stats
            regenRate:          0,   // % of maxHp restored per second
            xpMult:             0,   // bonus XP multiplier
            invincibilityBonus: 0,   // extra seconds of i-frames after hit
        },
        secondWind:      false,  // once-per-run survive-at-1hp flag
        secondWindUsed:  false,
        invincibility: 0
    };

    // Foundation upgrades
    player.stats.hpMult             += (metaUpgrades.vitality    || 0) * 0.05;
    player.stats.moveSpeedMult      += (metaUpgrades.swiftness   || 0) * 0.02;
    player.stats.soulMult           += (metaUpgrades.greed       || 0) * 0.05;
    player.stats.damageMult         += (metaUpgrades.power       || 0) * 0.05;
    // Survival upgrades
    player.stats.armor              += (metaUpgrades.ironWill    || 0) * 3;
    player.stats.regenRate          += (metaUpgrades.regen       || 0) * 0.0008; // 0.08% maxHp/s per rank
    // Combat upgrades
    player.stats.cooldownMult       -= (metaUpgrades.haste       || 0) * 0.03;
    player.stats.magnetMult         += (metaUpgrades.magnetism   || 0) * 0.20;
    // Mastery upgrades
    player.stats.xpMult             += (metaUpgrades.scholar     || 0) * 0.08;
    player.stats.invincibilityBonus += (metaUpgrades.ghostStep   || 0) * 0.20;
    // Prestige: Second Wind (survive fatal blow once per run)
    player.secondWind     = (metaUpgrades.secondWind   || 0) >= 1;
    player.secondWindUsed = false;
    // Prestige: Ancestral Power — start at higher level (no quiz, just stats advance)
    const startBonus = metaUpgrades.ancestralPower || 0;
    if (startBonus > 0) {
        player.level = 1 + startBonus;
        for (let _i = 0; _i < startBonus; _i++) {
            player.xpToNext = Math.floor(player.xpToNext * 1.2 + 10);
        }
    }

    recalcStats();
    player.hp = player.maxHp;

    activeWeapons  = [];
    activePassives = [];
    applyUpgrade({ type: 'weapon', id: charDef.startWeapon });

    poolEnemies.forEach(e => e.active     = false);
    poolGems.forEach(g    => g.active     = false);
    poolProjectiles.forEach(p => p.active = false);
    poolDmgTexts.forEach(t  => t.active   = false);
    poolChests.forEach(c    => c.active   = false);

    elitesSpawned  = new Set();
    bossWarned     = false;
    elapsedTime    = 0;
    spawnTimer     = 0;
    gameState      = 'PLAYING';
    lastTime       = performance.now();

    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(gameLoop);
}

export function pause()  { if (gameState === 'PLAYING') gameState = 'PAUSED'; }
export function resume() {
    if (gameState === 'PAUSED') {
        lastTime  = performance.now();
        gameState = 'PLAYING';
        rafId     = requestAnimationFrame(gameLoop);
    }
}
export function stop() {
    gameState = 'STOPPED';
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
}

// ── Upgrades & stats ────────────────────────────────────────────────────────

export function applyUpgrade(upg) {
    if (upg.type === 'weapon') {
        let w = activeWeapons.find(aw => aw.id === upg.id);
        if (w) w.level++;
        else activeWeapons.push({ id: upg.id, level: 1, timer: 0, angle: 0 });
    } else {
        let p = activePassives.find(ap => ap.id === upg.id);
        if (p) p.level++;
        else activePassives.push({ id: upg.id, level: 1 });
        const pDef = PASSIVES[upg.id];
        player.stats[pDef.stat] += pDef.value;
        recalcStats();
    }
}

/** ✅ FIX: Proper heal — no longer abuses applyPenalty which also raised maxHp */
export function applyHeal(pct) {
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * pct);
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

// ── Difficulty scaling ──────────────────────────────────────────────────────
// Returns multipliers for enemy HP, speed, damage that ramp smoothly over 15 min.

function getDifficulty() {
    const t = elapsedTime;
    return {
        hp:     Math.min(4.0, 1 + t / 300),        // ×2 at 5 min, ×4 at 15 min
        speed:  Math.min(1.6, 1 + t / 750 * 0.6),  // +40% by 12 min
        damage: Math.min(3.0, 1 + t / 300 * 0.8)   // ×2.6 at 15 min
    };
}

// ─── GAME LOOP ──────────────────────────────────────────────────────────────

function gameLoop(time) {
    if (gameState !== 'PLAYING') return;

    let dt = (time - lastTime) / 1000;
    lastTime = time;
    if (dt > 0.1) dt = 0.1;

    elapsedTime += dt;

    // ── Boss: warn at 14:30, spawn at 15:00 ──
    if (elapsedTime >= 870 && !bossWarned) {
        bossWarned = true;
        uiCallbacks.onBossWarning?.();
        Audio.playBossWarning();
    }
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
        player.xp      -= player.xpToNext;
        player.level++;
        player.xpToNext = Math.floor(player.xpToNext * 1.2 + 10);
        gameState       = 'PAUSED';
        Audio.playLevelUp();
        uiCallbacks.onLevelUp();
    }

    if (player.hp <= 0) {
        gameState = 'GAME_OVER';
        Audio.playGameOver();
        uiCallbacks.onGameOver(false);
    }

    rafId = requestAnimationFrame(gameLoop);
}

// ─── UPDATE ─────────────────────────────────────────────────────────────────

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
    // Passive HP regen from shrine upgrade
    if (player.stats.regenRate > 0 && player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + player.maxHp * player.stats.regenRate * dt);
    }

    camera.x = player.x - canvas.width  / 2;
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
                // Collision-only hitbox — no emoji so it is never drawn by drawEverything.
                // The visual is drawn directly from activeWeapons in drawEverything,
                // which reads the authoritative aw.angle each frame — zero jitter.
                spawnProjectile({
                    type: 'hitbox', x: px, y: py, radius: 20,
                    damage: lvlDef.damage * dmgMult, duration: 0.05, pierce: 999
                    // emoji intentionally omitted — drawn separately
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
                    let dX = player.lastDirX, dY = player.lastDirY;
                    if (i === 1 && lvlDef.count >= 2) { dX *= -1; dY *= -1; }
                    if (i === 2) { const t = dX; dX = -dY; dY = t; }
                    spawnProjectile({
                        type: 'melee',
                        x: player.x + dX * 30, y: player.y + dY * 30,
                        vx: dX * 400, vy: dY * 400,
                        radius: 30 * (lvlDef.area || 1),
                        damage: lvlDef.damage * dmgMult, duration: 0.25, pierce: 3, emoji: def.icon
                    });
                }
            } else if (def.type === 'projectile') {
                const nearest = poolEnemies
                    .filter(e => e.active)
                    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) -
                                    Math.hypot(b.x - player.x, b.y - player.y))
                    .slice(0, lvlDef.count);
                nearest.forEach(target => {
                    const dx = target.x - player.x;
                    const dy = target.y - player.y;
                    const d  = Math.hypot(dx, dy) || 1;
                    spawnProjectile({
                        type: 'projectile',
                        x: player.x, y: player.y,
                        vx: (dx / d) * lvlDef.speed, vy: (dy / d) * lvlDef.speed,
                        radius: 10, damage: lvlDef.damage * dmgMult,
                        duration: 2.0, pierce: 1, emoji: def.icon
                    });
                });

            } else if (def.type === 'soul_strike') {
                // Like projectile but distinct visual + sound
                const nearest = poolEnemies
                    .filter(e => e.active)
                    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) -
                                    Math.hypot(b.x - player.x, b.y - player.y))
                    .slice(0, lvlDef.count);
                nearest.forEach(target => {
                    const dx = target.x - player.x;
                    const dy = target.y - player.y;
                    const d  = Math.hypot(dx, dy) || 1;
                    spawnProjectile({
                        type: 'soul_strike',
                        x: player.x, y: player.y,
                        vx: (dx / d) * lvlDef.speed, vy: (dy / d) * lvlDef.speed,
                        radius: 11, damage: lvlDef.damage * dmgMult,
                        duration: 2.0, pierce: 1,
                    });
                });
                Audio.playSoulStrike();
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
            } else if (def.type === 'storm_gust') {
                // Elliptical AOE centered offsetForward px ahead of the player.
                // The ellipse is large enough that the player is always well inside it.
                const dX  = player.lastDirX;
                const dY  = player.lastDirY;
                const cx  = player.x + dX * lvlDef.offsetForward;
                const cy  = player.y + dY * lvlDef.offsetForward;
                const ang = Math.atan2(dY, dX); // rotation to align long axis with facing
                Audio.playStormGust();
                spawnProjectile({
                    type: 'storm_gust',
                    x: cx, y: cy,
                    angle: ang,
                    radiusX: lvlDef.radiusX,
                    radiusY: lvlDef.radiusY,
                    // Collision radius: use the larger axis for broad hit detection;
                    // fine ellipse check is done per-enemy in checkCollisions.
                    radius: lvlDef.radiusX,
                    damage: lvlDef.damage * dmgMult,
                    duration: 0.55, pierce: 999
                });

            } else if (def.type === 'meteor_storm') {
                // Queue `count` delayed meteor impacts near random enemies.
                // Each impact is spawned as a `meteor_pending` that counts down,
                // then becomes a visible `meteor_impact` AOE for its duration.
                const targets = poolEnemies.filter(e => e.active);
                for (let i = 0; i < lvlDef.count; i++) {
                    const scatter = 80;
                    let tx, ty;
                    if (targets.length) {
                        const t = targets[Math.floor(Math.random() * targets.length)];
                        tx = t.x + (Math.random() - 0.5) * scatter;
                        ty = t.y + (Math.random() - 0.5) * scatter;
                    } else {
                        const a = Math.random() * Math.PI * 2;
                        tx = player.x + Math.cos(a) * (150 + Math.random() * 200);
                        ty = player.y + Math.sin(a) * (150 + Math.random() * 200);
                    }
                    spawnProjectile({
                        type: 'meteor_pending',
                        x: tx, y: ty,
                        radius: 55 * (lvlDef.area || 1),
                        damage: lvlDef.damage * dmgMult,
                        // stagger impacts: delay + small jitter per index
                        duration: lvlDef.delay * (i + 1) + Math.random() * 0.15,
                        impactDuration: 0.45,
                        pierce: 999,
                    });
                }
                Audio.playMeteorStrike();

            } else if (def.type === 'lov') {
                // Spawn a LOV controller projectile that fires boltCount lightning bolts
                // spaced boltInterval seconds apart, each at a random screen position.
                spawnProjectile({
                    type: 'lov_controller',
                    x: player.x, y: player.y,
                    radius: 0,   // controller has no hitbox
                    damage: lvlDef.damage * dmgMult,
                    boltsLeft: lvlDef.boltCount,
                    boltInterval: lvlDef.boltInterval,
                    boltTimer: 0,
                    boltArea: lvlDef.area || 1,
                    duration: lvlDef.boltCount * lvlDef.boltInterval + 0.5,
                    pierce: 0,
                });
                Audio.playLov();

            } else if (def.type === 'heavens_drive') {
                // Spawn `count` earth impact AOEs in a line along facing direction,
                // each slightly delayed so they appear to erupt in sequence.
                const dX  = player.lastDirX;
                const dY  = player.lastDirY;
                const baseDelay = 0.08;
                for (let i = 0; i < lvlDef.count; i++) {
                    const dist = 50 + i * lvlDef.spacing;
                    spawnProjectile({
                        type: 'heavens_drive',
                        x: player.x + dX * dist,
                        y: player.y + dY * dist,
                        radius: 38 * (lvlDef.area || 1),
                        damage: lvlDef.damage * dmgMult,
                        // pending delay then active impact window
                        duration: baseDelay * i + 0.40,
                        pendingFor: baseDelay * i,
                        pierce: 999,
                    });
                }
                Audio.playHeavensDrive();

            } else if (def.type === 'jupitel') {
                // Single fast bolt toward nearest enemy, applies knockback on hit.
                const nearest = poolEnemies
                    .filter(e => e.active)
                    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) -
                                    Math.hypot(b.x - player.x, b.y - player.y))[0];
                if (nearest) {
                    const dx = nearest.x - player.x;
                    const dy = nearest.y - player.y;
                    const d  = Math.hypot(dx, dy) || 1;
                    spawnProjectile({
                        type: 'jupitel',
                        x: player.x, y: player.y,
                        vx: (dx / d) * lvlDef.speed,
                        vy: (dy / d) * lvlDef.speed,
                        radius: 14,
                        damage: lvlDef.damage * dmgMult,
                        knockback: lvlDef.knockback,
                        duration: 2.0, pierce: 1,
                    });
                    Audio.playJupitel();
                }

            } else if (def.type === 'catspaw') {
                // Burst of `count` paw-swipe AOEs evenly spread in a full ring around the player.
                // Each swipe is a short-lived arc hitbox slightly offset from the player.
                Audio.playCatPaw();
                for (let i = 0; i < lvlDef.count; i++) {
                    const a  = (Math.PI * 2 / lvlDef.count) * i + aw.angle;
                    const ox = player.x + Math.cos(a) * lvlDef.radius * 0.55;
                    const oy = player.y + Math.sin(a) * lvlDef.radius * 0.55;
                    spawnProjectile({
                        type: 'catspaw',
                        x: ox, y: oy,
                        angle: a,
                        radius: lvlDef.radius * 0.45,
                        damage: lvlDef.damage * dmgMult,
                        duration: 0.22, pierce: 999,
                    });
                }
                // Rotate offset each burst for visual variety
                aw.angle = (aw.angle || 0) + Math.PI / lvlDef.count;
            }
        }
    });
}

function spawnProjectile(opts) {
    const p = poolProjectiles.find(x => !x.active);
    if (!p) return;
    // Clear fields from previous occupant so stale data never bleeds into new types.
    p.emoji          = null;
    p.radiusX        = null;
    p.radiusY        = null;
    p.angle          = null;
    p.vx             = null;
    p.vy             = null;
    p.knockback      = null;
    p.boltsLeft      = null;
    p.boltInterval   = null;
    p.boltTimer      = null;
    p.boltArea       = null;
    p.pendingFor     = null;
    p.impactDuration = null;
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
        hp:  ENEMIES.boss.hp
    });
    // boss entrance shake removed
}

function spawnEnemies(dt) {
    spawnTimer -= dt;
    if (spawnTimer > 0) return;

    const wave     = Math.floor(elapsedTime / 60);
    const count    = 3 + wave * 2;
    spawnTimer     = Math.max(0.5, 2.5 - wave * 0.15);

    // ✅ FIX: was `Math.floor(elapsed/60) * 3` which hit minutes 1,2,3,4 not 3,6,9,12
    const currentMinute = Math.floor(elapsedTime / 60);
    if ([3, 6, 9, 12].includes(currentMinute) && !elitesSpawned.has(currentMinute)) {
        elitesSpawned.add(currentMinute);
        _spawnOne({ ...ENEMIES.tank, isElite: true, hp: ENEMIES.tank.hp * 5, emoji: '👹' }, true);
    }

    const types = wave < 1 ? ['grunt'] :
                  wave < 2 ? ['grunt', 'grunt', 'dasher'] :
                             ['grunt', 'dasher', 'tank'];
    for (let i = 0; i < count; i++) {
        _spawnOne(ENEMIES[types[Math.floor(Math.random() * types.length)]]);
    }
}

/** ✅ Difficulty scaling applied at spawn time — no shared-object mutation */
function _spawnOne(def, isElite = false) {
    const e = poolEnemies.find(x => !x.active);
    if (!e) return;
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.max(canvas.width, canvas.height) * 0.6 + Math.random() * 100;
    const diff  = getDifficulty();

    // Create a scaled copy of the def, never mutate the shared ENEMIES constant
    const scaledDef = {
        ...def,
        speed:  def.speed  * diff.speed,
        damage: Math.ceil(def.damage * diff.damage)
    };
    const scaledHp = def.hp * diff.hp * (isElite ? 5 : 1);

    Object.assign(e, {
        active: true,
        def: scaledDef,
        hp:  scaledHp,
        x: player.x + Math.cos(angle) * dist,
        y: player.y + Math.sin(angle) * dist
    });
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
        if (p.duration <= 0) {
            // meteor_pending that expires becomes a live impact
            if (p.type === 'meteor_pending') {
                p.type     = 'meteor_impact';
                p.duration = p.impactDuration || 0.45;
                p.hitList  = new Set(); // fresh hit list for the impact
                Audio.playMeteorStrike();
                continue;
            }
            // heavens_drive pending phase ends → becomes active impact
            if (p.type === 'heavens_drive' && p.pendingFor > 0) {
                p.pendingFor = 0;
                p.duration   = 0.35;
                p.hitList    = new Set();
                continue;
            }
            p.active = false;
            continue;
        }
        if (p.vx) p.x += p.vx * dt;
        if (p.vy) p.y += p.vy * dt;

        // LOV controller: fire bolts on its own timer
        if (p.type === 'lov_controller' && p.boltsLeft > 0) {
            p.boltTimer -= dt;
            if (p.boltTimer <= 0) {
                p.boltTimer = p.boltInterval;
                p.boltsLeft--;
                // Pick a random active enemy or scatter randomly on screen
                const enemies = poolEnemies.filter(e => e.active);
                let bx, by;
                if (enemies.length) {
                    const t = enemies[Math.floor(Math.random() * enemies.length)];
                    bx = t.x + (Math.random() - 0.5) * 60 * (p.boltArea || 1);
                    by = t.y + (Math.random() - 0.5) * 60 * (p.boltArea || 1);
                } else {
                    bx = player.x + (Math.random() - 0.5) * canvas.width  * 0.8;
                    by = player.y + (Math.random() - 0.5) * canvas.height * 0.8;
                }
                spawnProjectile({
                    type: 'lov_bolt',
                    x: bx, y: by,
                    radius: 28 * (p.boltArea || 1),
                    damage: p.damage,
                    duration: 0.18,
                    pierce: 999,
                });
                Audio.playLov();
            }
        }
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
            player.xp += g.xp * (1 + player.stats.xpMult);
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
            c.active  = false;
            gameState = 'PAUSED';
            Audio.playChestOpen();
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
                    if (Math.hypot(bucket[k].x - x, bucket[k].y - y) <= radius)
                        result.push(bucket[k]);
                }
            }
        }
    }
    return result;
}

function checkCollisions() {
    // Player vs enemies
    if (player.invincibility <= 0) {
        for (let i = 0; i < poolEnemies.length; i++) {
            const e = poolEnemies[i];
            if (!e.active) continue;
            if (Math.hypot(player.x - e.x, player.y - e.y) < 30) {
                const dmg = Math.max(1, e.def.damage - player.stats.armor);
                // Second Wind: survive fatal blow at 1 HP once per run
                if (player.secondWind && !player.secondWindUsed && player.hp - dmg <= 0) {
                    player.hp = 1;
                    player.secondWindUsed = true;
                    spawnDmgText(player.x, player.y - 50, 'SECOND WIND!', '#f1c40f');
                } else {
                    player.hp -= dmg;
                }
                player.invincibility = 0.5 + player.stats.invincibilityBonus;
                // ── Screenshake on player damage ──
                // screenshake removed — player blink is the damage feedback
                Audio.playHit();
                spawnDmgText(player.x, player.y - 30, dmg, '#ff4757');
                break;
            }
        }
    }

    // Projectiles vs enemies
    const now = performance.now();
    for (let j = 0; j < poolProjectiles.length; j++) {
        const p = poolProjectiles[j];
        if (!p.active) continue;

        const targets = getEnemiesNear(p.x, p.y, p.radius + 15);

        // Types that never deal direct collision damage
        if (p.type === 'lov_controller' || p.type === 'meteor_pending' ||
            (p.type === 'heavens_drive' && p.pendingFor > 0)) continue;

        for (let k = 0; k < targets.length; k++) {
            const e = targets[k];
            if (p.hitList && p.hitList.has(e)) continue;

            // Fine ellipse check for storm_gust (broad circle pass already done above)
            if (p.type === 'storm_gust') {
                const cosA =  Math.cos(-p.angle);
                const sinA =  Math.sin(-p.angle);
                const ldx  =  (e.x - p.x) * cosA - (e.y - p.y) * sinA;
                const ldy  =  (e.x - p.x) * sinA + (e.y - p.y) * cosA;
                if ((ldx / p.radiusX) * (ldx / p.radiusX) + (ldy / p.radiusY) * (ldy / p.radiusY) > 1) continue;
            }

            e.hp -= p.damage;
            if (p.hitList) p.hitList.add(e);
            p.pierce--;
            spawnDmgText(e.x, e.y - 20, Math.floor(p.damage), '#fff');

            // Knockback (Jupitel Thunder)
            if (p.knockback && p.knockback > 0) {
                const kbDx = e.x - p.x, kbDy = e.y - p.y;
                const kbD  = Math.hypot(kbDx, kbDy) || 1;
                e.x += (kbDx / kbD) * p.knockback;
                e.y += (kbDy / kbD) * p.knockback;
            }

            // Throttled enemy-hit sound (max once every 80ms)
            if (now - lastEnemyHitSound > 80) {
                lastEnemyHitSound = now;
                Audio.playEnemyHit();
            }

            if (e.hp <= 0) {
                e.active = false;
                uiCallbacks.onKill();

                if (e.def.isBoss) {
                    gameState = 'GAME_OVER';
                    Audio.playVictory();
                    uiCallbacks.onGameOver(true);
                } else if (e.def.isElite) {
                    const c = poolChests.find(x => !x.active);
                    if (c) { c.active = true; c.x = e.x; c.y = e.y; }
                } else {
                    const g = poolGems.find(x => !x.active);
                    if (g) {
                        g.active = true; g.x = e.x; g.y = e.y; g.xp = e.def.xp;
                        g.color  = g.xp >= 20 ? '#e74c3c' : g.xp >= 5 ? '#2ecc71' : '#3498db';
                        g.glow   = g.xp >= 20 ? 'rgba(231,76,60,0.6)' :
                                   g.xp >= 5  ? 'rgba(46,204,113,0.6)' : 'rgba(52,152,219,0.6)';
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
    Object.assign(t, {
        active: true, x, y, text, color, life: 0.7,
        vx: (Math.random() - 0.5) * 40
    });
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

// ─── DRAW ────────────────────────────────────────────────────────────────────

/** Draw an arrow at the screen edge pointing towards an off-screen world position */
function drawOffScreenArrow(worldX, worldY, icon, color) {
    const cw = canvas.width, ch = canvas.height;
    const scrX = worldX - camera.x;
    const scrY = worldY - camera.y;
    const margin = 38;

    // Already on-screen — nothing to do
    if (scrX > margin && scrX < cw - margin && scrY > margin && scrY < ch - margin) return;

    const angle = Math.atan2(worldY - player.y, worldX - player.x);
    const cosA  = Math.cos(angle), sinA = Math.sin(angle);

    // Intersect ray from screen-centre with screen rectangle
    const cx = cw / 2, cy = ch / 2;
    const tR = cosA > 0  ? (cw - margin - cx) / cosA  : Infinity;
    const tL = cosA < 0  ? (margin - cx)      / cosA  : Infinity;
    const tB = sinA > 0  ? (ch - margin - cy) / sinA  : Infinity;
    const tT = sinA < 0  ? (margin - cy)      / sinA  : Infinity;
    const t  = Math.min(tR, tL, tB, tT);

    const ax = cx + cosA * t;
    const ay = cy + sinA * t;

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.shadowColor = color;
    ctx.shadowBlur  = 14;

    // Arrow head
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(elapsedTime * 6); // gentle pulse
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-4, -7);
    ctx.lineTo(-4, 7);
    ctx.closePath();
    ctx.fill();

    // Icon label
    ctx.rotate(-angle);
    ctx.globalAlpha = 1;
    ctx.font = '14px Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, -12, 0);

    ctx.restore();
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
}

function drawEverything() {
    const cw = canvas.width;
    const ch = canvas.height;

    // ── Forest floor ──
    ctx.fillStyle = '#0d1f0d';
    ctx.fillRect(-20, -20, cw + 40, ch + 40);

    const tileSize  = 80;
    const offX      = ((-camera.x % tileSize) + tileSize) % tileSize;
    const offY      = ((-camera.y % tileSize) + tileSize) % tileSize;
    const startTX   = Math.floor(camera.x / tileSize);
    const startTY   = Math.floor(camera.y / tileSize);

    for (let tx = -1; tx <= Math.ceil(cw / tileSize) + 1; tx++) {
        for (let ty = -1; ty <= Math.ceil(ch / tileSize) + 1; ty++) {
            const hash = (((startTX + tx) * 73856093) ^ ((startTY + ty) * 19349663)) & 3;
            ctx.fillStyle = TILE_COLORS[hash];
            ctx.fillRect(offX + tx * tileSize, offY + ty * tileSize, tileSize - 1, tileSize - 1);
        }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    for (let x = offX; x < cw; x += tileSize) { ctx.moveTo(x, 0); ctx.lineTo(x, ch); }
    for (let y = offY; y < ch; y += tileSize) { ctx.moveTo(0, y); ctx.lineTo(cw, y); }
    ctx.stroke();

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // ── Chests (on-screen) ──
    for (let i = 0; i < poolChests.length; i++) {
        const c = poolChests[i];
        if (!c.active) continue;
        const cx = c.x - camera.x, cy = c.y - camera.y;
        ctx.shadowColor = 'rgba(241,196,15,0.9)';
        ctx.shadowBlur  = 22;
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
    const px         = player.x - camera.x;
    const py         = player.y - camera.y;
    const isBlinking = player.invincibility > 0 && Math.floor(elapsedTime * 10) % 2 === 0;

    if (!isBlinking) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(px, py + 14, 16, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = 'rgba(100,200,255,0.5)';
        ctx.shadowBlur  = 18;
        ctx.font = '28px Arial';
        ctx.fillText(CHARACTERS[currentCharId].icon, px, py);
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

    // ── Orbital weapons — drawn directly from weapon state, no pool jitter ──
    activeWeapons.forEach(aw => {
        const def = WEAPONS[aw.id];
        if (def.type !== 'orbital') return;
        const lvlDef = def.levels[aw.level - 1];
        const radius = 80;
        for (let i = 0; i < lvlDef.count; i++) {
            const a   = aw.angle + (Math.PI * 2 / lvlDef.count) * i;
            const ox  = player.x + Math.cos(a) * radius - camera.x;
            const oy  = player.y + Math.sin(a) * radius - camera.y;
            ctx.shadowColor = 'rgba(255,220,100,0.7)';
            ctx.shadowBlur  = 12;
            ctx.font = '22px Arial';
            ctx.fillText(def.icon, ox, oy);
            ctx.shadowBlur = 0;
        }
    });

    // ── Projectiles ──
    for (let i = 0; i < poolProjectiles.length; i++) {
        const p   = poolProjectiles[i];
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
        } else if (p.type === 'storm_gust') {
            // Ellipse aligned to the player's facing direction
            const lifeRatio = Math.max(0, p.duration / 0.55); // 1→0 as it expires
            const pulse     = 0.7 + 0.3 * Math.sin(elapsedTime * 18);
            ctx.save();
            ctx.translate(ppx, ppy);
            ctx.rotate(p.angle);

            // Outer glow fill
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.radiusX);
            grad.addColorStop(0,   `rgba(120,200,255,${0.22 * lifeRatio * pulse})`);
            grad.addColorStop(0.5, `rgba(60,140,255,${0.18 * lifeRatio})`);
            grad.addColorStop(1,   `rgba(20,80,220,0.05)`);
            ctx.shadowColor = `rgba(80,170,255,${0.8 * lifeRatio})`;
            ctx.shadowBlur  = 28;
            ctx.fillStyle   = grad;
            ctx.beginPath();
            ctx.ellipse(0, 0, p.radiusX, p.radiusY, 0, 0, Math.PI * 2);
            ctx.fill();

            // Inner bright core stroke
            ctx.strokeStyle = `rgba(180,230,255,${0.85 * lifeRatio * pulse})`;
            ctx.lineWidth   = 2.5;
            ctx.beginPath();
            ctx.ellipse(0, 0, p.radiusX * 0.55, p.radiusY * 0.55, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Outer border
            ctx.strokeStyle = `rgba(100,180,255,${0.65 * lifeRatio})`;
            ctx.lineWidth   = 2;
            ctx.setLineDash([8, 5]);
            ctx.beginPath();
            ctx.ellipse(0, 0, p.radiusX, p.radiusY, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Swirl emojis scattered inside the ellipse
            ctx.rotate(-p.angle); // draw emojis upright
            const t0 = (elapsedTime * 2.5) % (Math.PI * 2);
            const spiralPts = [
                { r: 0.35, a: t0 },
                { r: 0.65, a: t0 + 2.1 },
                { r: 0.50, a: t0 + 4.2 },
                { r: 0.75, a: t0 + 1.0 },
            ];
            ctx.globalAlpha = 0.55 * lifeRatio * pulse;
            ctx.font = '16px Arial';
            for (const sp of spiralPts) {
                // Map from circular to elliptical coords
                const ex = Math.cos(sp.a) * p.radiusX * sp.r;
                const ey = Math.sin(sp.a) * p.radiusY * sp.r;
                // Rotate back to world
                const wx = ex * Math.cos(p.angle) - ey * Math.sin(p.angle);
                const wy = ex * Math.sin(p.angle) + ey * Math.cos(p.angle);
                ctx.fillText('🌀', wx, wy);
            }
            ctx.globalAlpha = 1;
            ctx.shadowBlur  = 0;
            ctx.restore();
        } else if (p.type === 'aura') {
            ctx.strokeStyle = 'rgba(241,196,15,0.25)';
            ctx.lineWidth   = 6;
            ctx.beginPath();
            ctx.arc(ppx, ppy, p.radius, 0, Math.PI * 2);
            ctx.stroke();

        } else if (p.type === 'meteor_pending') {
            // Falling shadow / warning circle — pulses as the meteor approaches
            const t = 1 - Math.max(0, p.duration / (p.impactDuration + 0.01));
            const alpha = 0.2 + t * 0.5;
            ctx.shadowColor = 'rgba(255,120,30,0.6)';
            ctx.shadowBlur  = 12;
            ctx.strokeStyle = `rgba(255,160,40,${alpha})`;
            ctx.lineWidth   = 2;
            ctx.beginPath();
            ctx.arc(ppx, ppy, p.radius * (1.2 - t * 0.3), 0, Math.PI * 2);
            ctx.stroke();
            // Crosshair lines
            ctx.beginPath();
            ctx.moveTo(ppx - 12, ppy); ctx.lineTo(ppx + 12, ppy);
            ctx.moveTo(ppx, ppy - 12); ctx.lineTo(ppx, ppy + 12);
            ctx.strokeStyle = `rgba(255,200,80,${alpha * 0.8})`;
            ctx.lineWidth   = 1;
            ctx.stroke();
            ctx.shadowBlur  = 0;

        } else if (p.type === 'meteor_impact') {
            const life = Math.max(0, p.duration / 0.45);
            ctx.save();
            ctx.shadowColor = 'rgba(255,80,0,0.8)';
            ctx.shadowBlur  = 30 * life;
            // Outer fire circle
            ctx.fillStyle   = `rgba(255,60,0,${0.4 * life})`;
            ctx.strokeStyle = `rgba(255,180,40,${0.9 * life})`;
            ctx.lineWidth   = 3;
            ctx.beginPath();
            ctx.arc(ppx, ppy, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Inner core
            ctx.fillStyle = `rgba(255,230,100,${0.7 * life})`;
            ctx.beginPath();
            ctx.arc(ppx, ppy, p.radius * 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = life * 0.8;
            ctx.font = '28px Arial';
            ctx.fillText('☄️', ppx, ppy);
            ctx.globalAlpha = 1;
            ctx.restore();

        } else if (p.type === 'lov_controller') {
            // Invisible — child bolts do all the rendering

        } else if (p.type === 'lov_bolt') {
            const life = Math.max(0, p.duration / 0.18);
            ctx.save();
            ctx.shadowColor = 'rgba(180,100,255,0.9)';
            ctx.shadowBlur  = 24 * life;
            // Jagged lightning circle
            ctx.strokeStyle = `rgba(220,160,255,${0.95 * life})`;
            ctx.fillStyle   = `rgba(160,80,255,${0.35 * life})`;
            ctx.lineWidth   = 2.5;
            ctx.beginPath();
            ctx.arc(ppx, ppy, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle   = `rgba(255,240,255,${0.9 * life})`;
            ctx.beginPath();
            ctx.arc(ppx, ppy, p.radius * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = `${Math.floor(p.radius * 1.1)}px Arial`;
            ctx.globalAlpha = life * 0.7;
            ctx.fillText('⚡', ppx, ppy);
            ctx.globalAlpha = 1;
            ctx.restore();

        } else if (p.type === 'heavens_drive') {
            if (p.pendingFor > 0) {
                // Warning crack on the ground
                ctx.strokeStyle = 'rgba(180,140,60,0.5)';
                ctx.lineWidth   = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(ppx, ppy, p.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            } else {
                const life = Math.max(0, p.duration / 0.35);
                ctx.save();
                ctx.shadowColor = 'rgba(160,110,40,0.8)';
                ctx.shadowBlur  = 18 * life;
                ctx.fillStyle   = `rgba(120,80,20,${0.45 * life})`;
                ctx.strokeStyle = `rgba(200,160,60,${0.9 * life})`;
                ctx.lineWidth   = 3;
                ctx.beginPath();
                ctx.arc(ppx, ppy, p.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // Rock shards — small rectangles scattered in radius
                ctx.fillStyle = `rgba(180,140,60,${0.7 * life})`;
                for (let s = 0; s < 5; s++) {
                    const sa = (s / 5) * Math.PI * 2 + elapsedTime;
                    const sr = p.radius * 0.55;
                    ctx.fillRect(
                        ppx + Math.cos(sa) * sr - 4,
                        ppy + Math.sin(sa) * sr - 3,
                        8, 6
                    );
                }
                ctx.globalAlpha = life * 0.75;
                ctx.font = '22px Arial';
                ctx.fillText('🪨', ppx, ppy);
                ctx.globalAlpha = 1;
                ctx.restore();
            }

        } else if (p.type === 'jupitel') {
            // Fast-moving electric bolt
            ctx.save();
            ctx.shadowColor = 'rgba(100,180,255,0.9)';
            ctx.shadowBlur  = 16;
            ctx.fillStyle   = 'rgba(80,160,255,0.85)';
            ctx.strokeStyle = 'rgba(200,240,255,0.95)';
            ctx.lineWidth   = 2;
            ctx.beginPath();
            ctx.arc(ppx, ppy, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.font = '18px Arial';
            ctx.globalAlpha = 0.9;
            ctx.fillText('🌩️', ppx, ppy);
            ctx.globalAlpha = 1;
            ctx.restore();

        } else if (p.type === 'soul_strike') {
            // Glowing teal/white orb
            ctx.save();
            ctx.shadowColor = 'rgba(80,255,220,0.9)';
            ctx.shadowBlur  = 18;
            ctx.fillStyle   = 'rgba(40,200,180,0.9)';
            ctx.strokeStyle = 'rgba(200,255,245,1.0)';
            ctx.lineWidth   = 2;
            ctx.beginPath();
            ctx.arc(ppx, ppy, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Bright core
            ctx.fillStyle = 'rgba(220,255,250,0.95)';
            ctx.beginPath();
            ctx.arc(ppx, ppy, p.radius * 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

        } else if (p.type === 'catspaw') {
            // Arc-shaped swipe with a paw print emoji
            const life = Math.max(0, p.duration / 0.22);
            ctx.save();
            ctx.globalAlpha = life;
            ctx.shadowColor = 'rgba(255,180,220,0.9)';
            ctx.shadowBlur  = 14 * life;
            // Fan / arc shape
            ctx.fillStyle   = `rgba(255,160,200,${0.35 * life})`;
            ctx.strokeStyle = `rgba(255,200,230,${0.85 * life})`;
            ctx.lineWidth   = 2.5;
            ctx.beginPath();
            ctx.moveTo(ppx, ppy);
            ctx.arc(ppx, ppy, p.radius, p.angle - 0.55, p.angle + 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Paw print at tip
            ctx.font = `${Math.floor(p.radius * 0.55)}px Arial`;
            ctx.globalAlpha = life * 0.85;
            ctx.fillText('🐾', ppx + Math.cos(p.angle) * p.radius * 0.6,
                               ppy + Math.sin(p.angle) * p.radius * 0.6);
            ctx.globalAlpha = 1;
            ctx.restore();
    }

    // ── Enemies ──
    // Reset state before enemy loop so no bleed from projectile/gem draws
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
    for (let i = 0; i < poolEnemies.length; i++) {
        const e = poolEnemies[i];
        if (!e.active) continue;
        const ex = e.x - camera.x, ey = e.y - camera.y;
        const fontSize = e.def.isBoss ? 80 : e.def.isElite ? 40 : 24;

        if (e.def.isBoss)        { ctx.shadowColor = 'rgba(231,76,60,0.7)';  ctx.shadowBlur = 30; }
        else if (e.def.isElite)  { ctx.shadowColor = 'rgba(155,89,182,0.6)'; ctx.shadowBlur = 15; }
        else                     { ctx.shadowBlur = 0; } // explicit reset for regular enemies

        ctx.font = `${fontSize}px Arial`;
        ctx.fillText(e.def.emoji, ex, ey);
        ctx.shadowBlur = 0;

        if (e.def.isBoss || e.def.isElite) {
            const bw     = e.def.isBoss ? 100 : 50;
            const by     = e.def.isBoss ? 52  : 26;
            const hpPct  = Math.max(0, e.hp / e.def.hp);
            const barClr = hpPct > 0.5 ? '#2ecc71' : hpPct > 0.25 ? '#f39c12' : '#e74c3c';
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.beginPath(); ctx.roundRect(ex - bw / 2, ey + by, bw, 8, 4); ctx.fill();
            ctx.fillStyle = barClr;
            ctx.beginPath(); ctx.roundRect(ex - bw / 2, ey + by, bw * hpPct, 8, 4); ctx.fill();
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

    // ── Off-screen chest arrows (drawn after vignette so they're always visible) ──
    for (let i = 0; i < poolChests.length; i++) {
        const c = poolChests[i];
        if (!c.active) continue;
        drawOffScreenArrow(c.x, c.y, '🧰', '#f1c40f');
    }

    uiCallbacks.onDraw(player.hp, player.maxHp, player.xp, player.xpToNext, player.level, elapsedTime);
}