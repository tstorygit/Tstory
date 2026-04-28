// main/js/games/tower/tower_engine.js

function fmt(n) {
    n = Math.floor(n);
    if (isNaN(n) || n === null) return '0';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs < 100000) return sign + abs.toString();
    const tiers = [[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']];
    for (const [div, suffix] of tiers) {
        if (abs >= div) {
            const val = abs / div;
            const str = val < 10 ? val.toFixed(2) : val < 100 ? val.toFixed(1) : Math.floor(val).toString();
            return sign + str + suffix;
        }
    }
    return sign + abs.toString();
}

export class TowerEngine {
    constructor(canvas, callbacks) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.callbacks = callbacks;
        
        this.cx = 0;
        this.cy = 0;
        this.enemies =[];
        this.projectiles =[];
        this.enemyProjectiles =[];
        this.floatTexts =[];
        this.explosions =[];
        
        this.state = 'STOPPED';
        this.lastTime = 0;
        this.rafId = null;
        
        this.stats = {}; 
        this.wave = 1;
        this.diff = 1;
        
        this.spawnTimer = 0;
        this.enemiesToSpawn = 0;
        this.attackCooldown = 0;
        
        this.targetMode = 'closest';
        this.buffs = { barrage: 0, aegis: 0 };
        this.speedMult = 1;
        
        this.runStats = {
            dmgDealt: 0,
            dmgTakenBoss: 0,
            dmgTakenBasic: 0,
            dmgBase: 0,
            dmgCrit: 0,
            dmgSplash: 0,
            dmgThorns: 0,
            dmgAbility: 0
        };

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        if (!this.canvas || !this.canvas.parentElement) return;
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;
        this.cx = this.canvas.width / 2;
        this.cy = this.canvas.height / 2;
    }

    startRun(stats, startWave, diff) {
        this.stop();
        this.stats = stats;
        this.wave = startWave;
        this.diff = diff;
        this.enemies =[];
        this.projectiles =[];
        this.enemyProjectiles =[];
        this.floatTexts =[];
        this.explosions =[];
        this.state = 'IDLE';
        this.attackCooldown = 0;
        this.buffs = { barrage: 0, aegis: 0 };
        this.runStats = { 
            dmgDealt: 0, dmgTakenBoss: 0, dmgTakenBasic: 0,
            dmgBase: 0, dmgCrit: 0, dmgSplash: 0, dmgThorns: 0, dmgAbility: 0
        };
    }

    setTargetMode(mode) {
        this.targetMode = mode;
    }

    activateAbility(type) {
        if (type === 'barrage') {
            this.buffs.barrage = 5.0; 
            this.spawnFloatText('BARRAGE!', '#9b59b6');
        } else if (type === 'nova') {
            for (const e of this.enemies) {
                this.runStats.dmgAbility += e.hp;
                this.runStats.dmgDealt += e.hp;
                e.hp = 0;
            }
            this.spawnFloatText('NOVA!', '#9b59b6');
            this.ctx.fillStyle = 'rgba(155, 89, 182, 0.6)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else if (type === 'aegis') {
            this.buffs.aegis = 3;
            this.spawnFloatText('AEGIS SHIELD!', '#3498db');
        }
    }

    activateUltWeapon(type) {
        if (type === 'orbital') {
            // Massive damage to all enemies
            for (const e of this.enemies) {
                const dmg = e.maxHp * 0.9;
                this.runStats.dmgAbility += dmg;
                this.runStats.dmgDealt += dmg;
                e.hp = Math.max(1, e.hp - dmg);
                this.explosions.push({ x: e.x, y: e.y, radius: 60, life: 0.4, color: 'rgba(255,150,0,0.8)' });
            }
            this.spawnFloatText('☄️ ORBITAL STRIKE!', '#ff9900', true);
            this._flashScreen('rgba(255,180,0,0.35)');
        } else if (type === 'blizzard') {
            // Freeze + damage
            for (const e of this.enemies) {
                const dmg = e.maxHp * 0.3;
                this.runStats.dmgAbility += dmg;
                this.runStats.dmgDealt += dmg;
                e.hp = Math.max(1, e.hp - dmg);
                e.frozenTimer = (e.frozenTimer || 0) + 3.0;
                this.explosions.push({ x: e.x, y: e.y, radius: 40, life: 0.5, color: 'rgba(100,200,255,0.7)' });
            }
            this.spawnFloatText('❄️ ARCTIC BLIZZARD!', '#88ddff', true);
            this._flashScreen('rgba(100,200,255,0.25)');
        } else if (type === 'plague') {
            // Apply poison DoT
            for (const e of this.enemies) {
                e.poisonTimer = (e.poisonTimer || 0) + 5.0;
                e.poisonDps = (e.poisonDps || 0) + e.maxHp * 0.12;
            }
            this.spawnFloatText('☠️ PLAGUE CLOUD!', '#88ff44', true);
            this._flashScreen('rgba(80,200,30,0.2)');
        } else if (type === 'lightning') {
            // Chain lightning between enemies
            const shuffled = [...this.enemies].sort(() => Math.random() - 0.5);
            let bounces = Math.min(10, shuffled.length);
            for (let i = 0; i < bounces; i++) {
                const e = shuffled[i];
                const dmg = e.maxHp * 0.35;
                this.runStats.dmgAbility += dmg;
                this.runStats.dmgDealt += dmg;
                e.hp = Math.max(1, e.hp - dmg);
                this.explosions.push({ x: e.x, y: e.y, radius: 30, life: 0.3, color: 'rgba(255,255,100,0.9)' });
            }
            this.spawnFloatText('⚡ THUNDERSTORM!', '#ffff44', true);
            this._flashScreen('rgba(255,255,100,0.2)');
        } else if (type === 'blackhole') {
            // Pull all enemies to center, deal heavy damage
            for (const e of this.enemies) {
                e.x = this.cx + (Math.random() - 0.5) * 20;
                e.y = this.cy + (Math.random() - 0.5) * 20;
                const dmg = e.maxHp * 0.75;
                this.runStats.dmgAbility += dmg;
                this.runStats.dmgDealt += dmg;
                e.hp = Math.max(1, e.hp - dmg);
                this.explosions.push({ x: e.x, y: e.y, radius: 50, life: 0.6, color: 'rgba(180,0,255,0.7)' });
            }
            this.spawnFloatText('🌀 BLACK HOLE!', '#cc44ff', true);
            this._flashScreen('rgba(180,0,255,0.3)');
        }
    }

    _flashScreen(color) {
        const old = this.ctx.fillStyle;
        this.ctx.fillStyle = color;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = old;
    }

    startWave(waveNum) {
        this.wave = waveNum || 1;
        this.enemiesToSpawn = Math.floor(10 + this.wave * 2);
        if (isNaN(this.enemiesToSpawn) || this.enemiesToSpawn <= 0) this.enemiesToSpawn = 10;
        this.spawnTimer = 0;
        this.state = 'PLAYING';
        this.lastTime = performance.now();
        if (!this.rafId) {
            this.rafId = requestAnimationFrame((t) => this._loop(t));
        }
    }

    pause() {
        if (this.state === 'PLAYING' || this.state === 'IDLE') this.state = 'PAUSED';
    }

    resume() {
        if (this.state === 'PAUSED' || this.state === 'IDLE') {
            this.state = 'PLAYING';
            this.lastTime = performance.now();
            if (!this.rafId) {
                this.rafId = requestAnimationFrame((t) => this._loop(t));
            }
        }
    }

    stop() {
        this.state = 'STOPPED';
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    spawnFloatText(text, color, isCenter = false, x = null, y = null) {
        this.floatTexts.push({
            x: x !== null ? x : this.cx + (isCenter ? 0 : (Math.random() - 0.5) * 40),
            y: y !== null ? y : this.cy - 30 + (isCenter ? 0 : (Math.random() - 0.5) * 40),
            text: text,
            color: color,
            life: 1.0,
            vy: -60
        });
    }

    _spawnEnemy() {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.max(this.canvas.width, this.canvas.height) / 2 + 30;
        
        let type = 'basic';
        let hpMult = 1, spdMult = 1, dmgMult = 1, cashMult = 1;
        let color = '#FF00FF';
        let atkSpeed = 1.0;

        if (this.wave % 10 === 0 && this.enemiesToSpawn === 1) {
            type = 'boss'; hpMult = 10; spdMult = 0.4; dmgMult = 5; cashMult = 20; color = '#e74c3c'; atkSpeed = 1.5;
        } else {
            const advChance = Math.min(0.3, this.wave / 100); 
            const rand = Math.random();
            
            if (this.wave > 15 && rand < advChance) {
                let subRand = Math.random();
                if (subRand < 0.33) {
                    type = 'healer'; hpMult = 2.0; spdMult = 0.7; color = '#2ecc71'; cashMult = 3;
                } else if (subRand < 0.66) {
                    type = 'spawner'; hpMult = 3.0; spdMult = 0.3; color = '#e67e22'; cashMult = 4;
                } else {
                    type = 'shielded'; hpMult = 0.1; spdMult = 0.9; color = '#00ffff'; cashMult = 3; atkSpeed = 1.2;
                }
            } else {
                let fastChance = 0.05 + Math.min(0.25, (this.wave / 50) * 0.25);
                let tankChance = 0.05 + Math.min(0.20, (this.wave / 50) * 0.20);
                let rangedChance = 0.05 + Math.min(0.15, (this.wave / 50) * 0.15);
                
                const typeRand = Math.random();
                if (typeRand < fastChance) { type = 'fast'; hpMult = 0.5; spdMult = 1.8; color = '#f1c40f'; atkSpeed = 0.5; }
                else if (typeRand < fastChance + tankChance) { type = 'tank'; hpMult = 3.0; spdMult = 0.6; cashMult = 2; color = '#3498db'; atkSpeed = 2.0; }
                else if (typeRand < fastChance + tankChance + rangedChance) { type = 'ranged'; hpMult = 0.8; spdMult = 0.8; cashMult = 1.5; color = '#9b59b6'; atkSpeed = 2.0; }
            }
        }

        let baseHp = 10 * Math.pow(1.15, this.wave) * this.diff;
        if (type === 'shielded') baseHp = 10 + (2 * this.wave); 
        
        const baseDmg = 2 * Math.pow(1.12, this.wave) * this.diff;
        let relic1Mult = this.callbacks.hasRelic && this.callbacks.hasRelic(1) && type === 'boss' ? 3 : 1;
        const baseCash = 5 * Math.pow(1.08, this.wave) * this.diff * (this.stats.cashBonus || 1) * cashMult * relic1Mult;
        
        const finalSpeed = Math.min(100, 25 + this.wave * 0.8) * spdMult * (this.stats.enemySpeedMult || 1.0);

        let affixes =[];
        let armorStacks = 0;
        let blinkTimer = 0;

        if (this.wave > 10) {
            let affixChance = Math.min(0.5, (this.wave - 10) * 0.02);
            if (type === 'boss') affixChance = 1.0;

            if (Math.random() < affixChance) {
                const possible =['vampiric', 'armored', 'teleporter'];
                const chosen = possible[Math.floor(Math.random() * possible.length)];
                affixes.push(chosen);
                if (chosen === 'armored') armorStacks = 50;
                if (chosen === 'teleporter') blinkTimer = 3.0;

                if (type === 'boss' && this.wave > 30) {
                    const second = possible.filter(p => p !== chosen)[Math.floor(Math.random() * 2)];
                    affixes.push(second);
                    if (second === 'armored') armorStacks = 50;
                    if (second === 'teleporter') blinkTimer = 3.0;
                }
            }
        }

        this.enemies.push({
            id: Math.random().toString(36),
            type: type,
            x: this.cx + Math.cos(angle) * radius,
            y: this.cy + Math.sin(angle) * radius,
            hp: baseHp * hpMult,
            maxHp: baseHp * hpMult,
            dmg: baseDmg * dmgMult,
            speed: finalSpeed,
            _baseSpeed: finalSpeed,
            atkSpeed: atkSpeed,
            attackCooldown: atkSpeed,
            kb: 0,
            cash: baseCash,
            color: color,
            radius: type === 'boss' ? 36 : type === 'tank' || type === 'spawner' ? 28 : type === 'fast' ? 16 : type === 'shielded' ? 24 : 20,
            tickTimer: 0,
            affixes: affixes,
            armorStacks: armorStacks,
            blinkTimer: blinkTimer
        });
    }

    _spawnSwarm(x, y) {
        if (this.enemies.filter(e => e.type === 'swarm').length > 30) return;
        
        const baseDmg = 2 * Math.pow(1.12, this.wave) * this.diff * 0.5;
        const finalSpeed = Math.min(150, 40 + this.wave * 1.5) * (this.stats.enemySpeedMult || 1.0);

        this.enemies.push({
            id: Math.random().toString(36),
            type: 'swarm',
            x: x + (Math.random() - 0.5) * 20,
            y: y + (Math.random() - 0.5) * 20,
            hp: 1, maxHp: 1,
            dmg: baseDmg,
            speed: finalSpeed,
            atkSpeed: 0.5, attackCooldown: 0.5,
            kb: 0, cash: 0, color: '#e74c3c', radius: 10, tickTimer: 0,
            affixes:[], armorStacks: 0, blinkTimer: 0
        });
    }

    _dealDamageToEnemy(e, rawDmg, isCrit, textOffset = 10, source = 'base') {
        let actualDmg = rawDmg;

        if (e.type === 'shielded') actualDmg = 1;

        if (e.affixes && e.affixes.includes('armored')) {
            if (e.armorStacks > 0) {
                e.armorStacks--;
                actualDmg = 1;
            }
        }

        e.hp -= actualDmg;
        this.runStats.dmgDealt += actualDmg;

        if (source === 'base') this.runStats.dmgBase += actualDmg;
        else if (source === 'crit') this.runStats.dmgCrit += actualDmg;
        else if (source === 'splash') this.runStats.dmgSplash += actualDmg;
        else if (source === 'thorns') this.runStats.dmgThorns += actualDmg;
        else if (source === 'ability') this.runStats.dmgAbility += actualDmg;

        if (isCrit && e.type !== 'shielded' && (!e.affixes || !e.affixes.includes('armored') || e.armorStacks <= 0)) {
            this.spawnFloatText(fmt(rawDmg), '#f1c40f', false, e.x, e.y - textOffset);
        } else if (actualDmg === 1 && rawDmg > 1) {
            this.spawnFloatText('1', '#00ffff', false, e.x, e.y - textOffset);
        }

        return actualDmg;
    }

    _dealDamageToTower(rawDmg, enemyType, enemy = null) {
        if (this.buffs.aegis > 0) {
            this.buffs.aegis--;
            this.spawnFloatText('BLOCKED', '#3498db', true);
            return;
        }
        
        const mitigated = rawDmg * (1 - (this.stats.defPct || 0)) - (this.stats.defAbs || 0);
        const finalDmg = Math.max(1, mitigated);
        
        if (enemyType === 'boss') this.runStats.dmgTakenBoss += finalDmg;
        else this.runStats.dmgTakenBasic += finalDmg;

        if (this.stats.currentHp - finalDmg <= 0) {
            if (this.stats.defyDeath > 0 && Math.random() < this.stats.defyDeath) {
                this.stats.currentHp = this.stats.health * 0.3; 
                this.spawnFloatText('DEFY DEATH!', '#f1c40f', true);
                this.callbacks.onHpUpdate();
                return;
            }
        }
        
        this.stats.currentHp -= finalDmg;
        this.spawnFloatText(`-${fmt(finalDmg)}`, '#e74c3c', true);

        if (enemy && enemy.affixes && enemy.affixes.includes('vampiric')) {
            const healAmount = finalDmg * 2;
            enemy.hp = Math.min(enemy.maxHp, enemy.hp + healAmount);
            this.spawnFloatText('+HP', '#e74c3c', false, enemy.x, enemy.y - 20);
        }
        
        this.callbacks.onHpUpdate();

        if (this.stats.currentHp <= 0) {
            this.state = 'STOPPED';
            this._draw(performance.now());
            this.callbacks.onPlayerDie();
        }
    }

    _loop(time) {
        if (this.state !== 'PLAYING') {
            this.rafId = null;
            return;
        }

        let dt = (time - this.lastTime) / 1000;
        this.lastTime = time;
        if (dt > 0.1) dt = 0.1;
        dt *= (this.stats.gameSpeed || 1) * this.speedMult; 

        if (this.stats.regen > 0 && this.stats.currentHp < this.stats.health) {
            this.stats.currentHp = Math.min(this.stats.health, this.stats.currentHp + this.stats.regen * dt);
            this.callbacks.onHpUpdate();
        }

        if (this.enemiesToSpawn > 0) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                this._spawnEnemy();
                this.enemiesToSpawn--;
                this.spawnTimer = Math.max(0.2, 1.2 - this.wave * 0.01);
            }
        }

        let currentAtkSpeed = this.stats.atkSpeed;
        if (this.buffs.barrage > 0) {
            this.buffs.barrage -= dt;
            currentAtkSpeed *= 10;
        }

        this.attackCooldown -= dt;
        if (this.attackCooldown <= 0 && this.enemies.length > 0) {
            let candidates = this.enemies.filter(e => Math.hypot(e.x - this.cx, e.y - this.cy) - e.radius <= this.stats.range);
            
            if (candidates.length > 0) {
                let target = null;
                if (this.targetMode === 'closest') {
                    target = candidates.reduce((a, b) => Math.hypot(a.x - this.cx, a.y - this.cy) < Math.hypot(b.x - this.cx, b.y - this.cy) ? a : b);
                } else if (this.targetMode === 'farthest') {
                    target = candidates.reduce((a, b) => Math.hypot(a.x - this.cx, a.y - this.cy) > Math.hypot(b.x - this.cx, b.y - this.cy) ? a : b);
                } else if (this.targetMode === 'boss') {
                    let bosses = candidates.filter(e => e.type === 'boss');
                    target = bosses.length > 0 ? bosses[0] : candidates[0];
                } else if (this.targetMode === 'fast') {
                    let fasts = candidates.filter(e => e.type === 'fast' || e.type === 'swarm');
                    target = fasts.length > 0 ? fasts[0] : candidates[0];
                }
                
                if (target) {
                    const isCrit = Math.random() < this.stats.critChance;
                    let dmg = isCrit ? this.stats.damage * this.stats.critMult : this.stats.damage;
                    
                    const dist = Math.hypot(target.x - this.cx, target.y - this.cy);
                    const meterMult = 1 + (dist * (this.stats.dmgMeter || 0));
                    dmg *= meterMult;
                    
                    this.projectiles.push({
                        x: this.cx, y: this.cy,
                        targetId: target.id,
                        dmg: dmg,
                        isCrit: isCrit,
                        speed: 500,
                        vx: 0, vy: 0,
                        hitIds:[],
                        chainBounces: this.stats.synergyChain ? 2 : 0,
                        pierces: this.stats.synergyPierce ? 3 : 0,
                        hasBounced: false
                    });
                    
                    this.attackCooldown = 1 / currentAtkSpeed;
                }
            }
        }

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            let hitTarget = null;
            let step = p.speed * dt;

            if (p.targetId) {
                const target = this.enemies.find(e => e.id === p.targetId);
                if (target) {
                    const dx = target.x - p.x;
                    const dy = target.y - p.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > 0) { p.vx = (dx/dist)*p.speed; p.vy = (dy/dist)*p.speed; }

                    if (dist <= step + target.radius) {
                        hitTarget = target;
                    }
                } else {
                    p.targetId = null; 
                }
            }

            if (!hitTarget) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                
                if (Math.hypot(p.x - this.cx, p.y - this.cy) > (this.stats.range || 100) * 2.5) {
                    this.projectiles.splice(i, 1);
                    continue;
                }

                for (const e of this.enemies) {
                    if (p.hitIds.includes(e.id)) continue;
                    if (Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 10) {
                        hitTarget = e;
                        break;
                    }
                }
            }

            if (hitTarget) {
                let source = p.isCrit ? 'crit' : 'base';
                let actualDmg = this._dealDamageToEnemy(hitTarget, p.dmg, p.isCrit, 10, source);
                if (p.isCrit && this.callbacks.onCritHit) this.callbacks.onCritHit();
                
                if (this.stats.splashDmg > 0) {
                    let splashRadius = 50;
                    let splashDamage = p.dmg * this.stats.splashDmg;
                    for (const e of this.enemies) {
                        if (e.id !== hitTarget.id && Math.hypot(e.x - hitTarget.x, e.y - hitTarget.y) <= splashRadius + e.radius) {
                            this._dealDamageToEnemy(e, splashDamage, false, 10, 'splash');
                        }
                    }
                    this.explosions.push({ x: hitTarget.x, y: hitTarget.y, radius: splashRadius, life: 0.2, color: `rgba(243, 156, 18, 0.5)` });
                }
                
                p.hitIds.push(hitTarget.id);

                if (this.stats.knockback > 0 && Math.random() < this.stats.knockback) {
                    hitTarget.kb = hitTarget.type === 'boss' ? 10 : 40;
                }

                let bounceProc = (this.stats.bounce > 0 && Math.random() < this.stats.bounce);

                if (this.stats.synergyChain && p.chainBounces > 0) {
                    p.chainBounces--;
                    let nextTarget = this.enemies.find(en => !p.hitIds.includes(en.id) && Math.hypot(en.x - p.x, en.y - p.y) < 150);
                    if (nextTarget) {
                        p.targetId = nextTarget.id;
                    } else {
                        this.projectiles.splice(i, 1);
                    }
                } else if (bounceProc && p.chainBounces === 0 && !p.hasBounced) {
                    p.hasBounced = true; 
                    let nextTarget = this.enemies.find(en => !p.hitIds.includes(en.id) && Math.hypot(en.x - p.x, en.y - p.y) < 150);
                    if (nextTarget) {
                        p.targetId = nextTarget.id;
                    } else {
                        this.projectiles.splice(i, 1);
                    }
                } else if (this.stats.synergyPierce && p.pierces > 0) {
                    p.pierces--;
                    p.targetId = null;
                } else {
                    this.projectiles.splice(i, 1);
                }
            }
        }

        for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
            const ep = this.enemyProjectiles[i];
            const dx = this.cx - ep.x;
            const dy = this.cy - ep.y;
            const dist = Math.hypot(dx, dy);
            const step = ep.speed * dt;
            
            if (dist <= 15 + step) {
                let shooter = this.enemies.find(en => en.id === ep.sourceId);
                this._dealDamageToTower(ep.dmg, 'ranged', shooter);
                
                if (this.stats.thorns > 0 && shooter) {
                    let thornsDmg = ep.dmg * this.stats.thorns;
                    this._dealDamageToEnemy(shooter, thornsDmg, false, 15, 'thorns');
                }

                this.enemyProjectiles.splice(i, 1);
                if (this.state === 'STOPPED') return;
            } else {
                ep.x += (dx / dist) * step;
                ep.y += (dy / dist) * step;
            }
        }

        for (let i = this.explosions.length - 1; i >= 0; i--) {
            this.explosions[i].life -= dt;
            if (this.explosions[i].life <= 0) {
                this.explosions.splice(i, 1);
            }
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            
            if (e.hp <= 0 && !e.dead) {
                e.dead = true;
                if (e.cash > 0) {
                    this.spawnFloatText(`+$${fmt(e.cash)}`, '#2ecc71', false, e.x, e.y);
                }
                this.callbacks.onEnemyKill(e.cash, e.x, e.y, e.type);
                
                if (this.stats.lifesteal > 0 && this.stats.currentHp < this.stats.health) {
                    const heal = this.stats.damage * this.stats.lifesteal;
                    this.stats.currentHp = Math.min(this.stats.health, this.stats.currentHp + heal);
                    this.callbacks.onHpUpdate();
                }
                this.enemies.splice(i, 1);
                continue;
            }

            // ── Ultimate weapon DoT effects ──────────────────────────────
            if (e.frozenTimer && e.frozenTimer > 0) {
                e.frozenTimer -= dt;
                e.speed = 0; // immobilize while frozen
                if (e.frozenTimer <= 0) e.speed = e._baseSpeed || e.speed;
            } else if (e._baseSpeed && e.speed === 0) {
                e.speed = e._baseSpeed; // restore after freeze
            }
            if (e.poisonTimer && e.poisonTimer > 0) {
                e.poisonTimer -= dt;
                const poisonDmg = (e.poisonDps || 0) * dt;
                this.runStats.dmgAbility += poisonDmg;
                this.runStats.dmgDealt += poisonDmg;
                e.hp -= poisonDmg;
            }
            // ─────────────────────────────────────────────────────────────

            e.tickTimer += dt;
            if (e.type === 'healer' && e.tickTimer > 2.0) {
                e.tickTimer = 0;
                let healed = false;
                for (const other of this.enemies) {
                    if (other.id !== e.id && other.hp < other.maxHp && Math.hypot(other.x - e.x, other.y - e.y) < 200) {
                        other.hp = Math.min(other.maxHp, other.hp + (other.maxHp * 0.1));
                        healed = true;
                    }
                }
                if (healed) this.spawnFloatText('+HP', '#2ecc71', false, e.x, e.y - 40);
            }
            if (e.type === 'spawner' && e.tickTimer > 4.0) {
                e.tickTimer = 0;
                this._spawnSwarm(e.x, e.y);
                this._spawnSwarm(e.x, e.y);
            }

            const dx = this.cx - e.x;
            const dy = this.cy - e.y;
            const dist = Math.hypot(dx, dy);
            const step = e.speed * dt;

            if (e.affixes && e.affixes.includes('teleporter') && dist > e.radius + 15) {
                e.blinkTimer -= dt;
                if (e.blinkTimer <= 0) {
                    e.blinkTimer = 3.0;
                    const blinkDist = Math.min(dist - e.radius - 15, 60); 
                    if (blinkDist > 0) {
                        e.x += (dx / dist) * blinkDist;
                        e.y += (dy / dist) * blinkDist;
                        this.explosions.push({ x: e.x, y: e.y, radius: e.radius + 5, life: 0.2, color: 'rgba(155, 89, 182, 0.5)' }); 
                    }
                }
            }

            if (e.type === 'ranged') {
                if (dist > (this.stats.range || 100) * 0.7) {
                    e.x += (dx / dist) * step;
                    e.y += (dy / dist) * step;
                    e.attackCooldown = e.atkSpeed; 
                } else {
                    e.attackCooldown -= dt;
                    if (e.attackCooldown <= 0) {
                        this.enemyProjectiles.push({ sourceId: e.id, x: e.x, y: e.y, dmg: e.dmg, speed: 150 });
                        e.attackCooldown = e.atkSpeed;
                    }
                }
            } else {
                if (dist - e.radius <= 15) {
                    e.attackCooldown -= dt;
                    if (e.attackCooldown <= 0) {
                        this._dealDamageToTower(e.dmg, e.type, e);
                        if (this.state === 'STOPPED') return;
                        
                        if (this.stats.thorns > 0) {
                            let thornsDmg = e.dmg * this.stats.thorns;
                            this._dealDamageToEnemy(e, thornsDmg, false, 15, 'thorns');
                        }
                        e.attackCooldown = e.atkSpeed;
                    }
                } else {
                    if (e.kb > 0) {
                        const kbStep = 200 * dt; 
                        e.x -= (dx / dist) * kbStep;
                        e.y -= (dy / dist) * kbStep;
                        e.kb -= kbStep;
                        e.attackCooldown = e.atkSpeed;
                        const leashDist = (this.stats.range || 100) * 1.5;
                        if (dist > leashDist) {
                            e.x = this.cx - (dx / dist) * leashDist;
                            e.y = this.cy - (dy / dist) * leashDist;
                            e.kb = 0;
                        }
                    } else {
                        e.x += (dx / dist) * step;
                        e.y += (dy / dist) * step;
                        e.attackCooldown = e.atkSpeed; 
                    }
                }
            }
        }

        for (let i = this.floatTexts.length - 1; i >= 0; i--) {
            const ft = this.floatTexts[i];
            ft.y += ft.vy * dt;
            ft.life -= dt;
            if (ft.life <= 0) this.floatTexts.splice(i, 1);
        }

        if (this.enemiesToSpawn <= 0 && this.enemies.length === 0) {
            this.state = 'IDLE';
            this.callbacks.onWaveComplete();
        }

        this._draw(time);
        
        if (this.state === 'PLAYING') {
            this.rafId = requestAnimationFrame((t) => this._loop(t));
        } else {
            this.rafId = null;
        }
    }

    _drawPolygon(x, y, radius, sides, color, fill = false, lineWidth = 2) {
        this.ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
            this.ctx.lineTo(x + radius * Math.cos(a), y + radius * Math.sin(a));
        }
        this.ctx.closePath();
        if (fill) {
            this.ctx.fillStyle = color;
            this.ctx.fill();
        } else {
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = lineWidth;
            this.ctx.stroke();
        }
    }

    _draw(time) {
        time = time || performance.now();
        this.ctx.fillStyle = '#050510';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const range = this.stats.range || 100;
        const viewRadius = range * 1.1;
        const halfW = this.canvas.width  / 2;
        const halfH = this.canvas.height / 2;
        const fitRadius = Math.min(halfW, halfH);
        this._zoom = fitRadius / viewRadius;
        this.ctx.save();
        this.ctx.translate(halfW - this.cx * this._zoom, halfH - this.cy * this._zoom);
        this.ctx.scale(this._zoom, this._zoom);

        const pulse = Math.abs(Math.sin(time / 250)); 

        const AA =[];
        const B5B =[5, 5];

        this.ctx.beginPath();
        this.ctx.arc(this.cx, this.cy, this.stats.range || 100, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        
        this.ctx['setLineDash'](B5B);
        this.ctx.stroke();
        this.ctx['setLineDash'](AA);

        let glowColor = this.stats.towerColor || '#00ffff';
        let blur = 10;
        if (this.stats.kBuff >= 3.0) { glowColor = '#ffffff'; blur = 30; }
        else if (this.stats.kBuff >= 2.0) { glowColor = '#9b59b6'; blur = 20; }
        
        this.ctx.shadowBlur = blur * (0.5 + pulse * 0.5); 
        this.ctx.shadowColor = glowColor;
        this._drawPolygon(this.cx, this.cy, 32, 6, glowColor);
        
        if (this.buffs.aegis > 0) {
            this.ctx.beginPath();
            this.ctx.arc(this.cx, this.cy, 44, 0, Math.PI * 2);
            this.ctx.strokeStyle = '#3498db';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }
        this.ctx.shadowBlur = 0;

        for (const ex of this.explosions) {
            const alpha = Math.max(0, ex.life * 5) * 0.55; // overall more subtle
            const grad = this.ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, ex.radius);
            // Parse base color from ex.color (rgba string) or use orange default
            const baseRGB = ex.color.startsWith('rgba') ? ex.color : 'rgba(243,156,18,0.5)';
            const rgb = baseRGB.match(/[\d.]+/g) || ['243','156','18','0.5'];
            grad.addColorStop(0,   `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
            grad.addColorStop(0.45, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha * 0.55})`);
            grad.addColorStop(1,   `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
            this.ctx.beginPath();
            this.ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = grad;
            this.ctx.fill();
        }

        for (const e of this.enemies) {
            let sides = 4;
            if (e.type === 'fast') sides = 3;
            if (e.type === 'swarm') sides = 3;
            if (e.type === 'tank') sides = 5;
            if (e.type === 'boss') sides = 8;
            if (e.type === 'ranged') sides = 6;
            if (e.type === 'healer') sides = 12;
            if (e.type === 'spawner') sides = 4;
            if (e.type === 'shielded') sides = 5;
            
            if (e.type === 'healer') {
                this.ctx.beginPath();
                this.ctx.arc(e.x, e.y, 200, 0, Math.PI * 2);
                this.ctx.fillStyle = 'rgba(46, 204, 113, 0.05)';
                this.ctx.fill();
            }

            if (e.hp < e.maxHp || e.type === 'boss') {
                this.ctx.shadowBlur = (e.type === 'boss' ? 15 : 8) * (0.8 + pulse * 0.2);
                this.ctx.shadowColor = e.color;
            }

            if (e.type === 'shielded') {
                this._drawPolygon(e.x, e.y, e.radius, sides, e.color, false, 3);
            } else {
                this._drawPolygon(e.x, e.y, e.radius, sides, e.color);
            }
            this.ctx.shadowBlur = 0;
            
            if (e.hp < e.maxHp ||['boss','tank','spawner','healer'].includes(e.type)) {
                if (e.type !== 'swarm') {
                    const w = e.radius * 2;
                    const hpPct = Math.max(0, e.hp / e.maxHp);
                    this.ctx.fillStyle = '#333';
                    this.ctx.fillRect(e.x - w/2, e.y - e.radius - 8, w, 4);
                    this.ctx.fillStyle = e.color;
                    this.ctx.fillRect(e.x - w/2, e.y - e.radius - 8, w * hpPct, 4);
                }
            }

            if (e.affixes && e.affixes.length > 0) {
                this.ctx.fillStyle = '#fff';
                this.ctx.font = `bold ${Math.round(10 / this._zoom)}px monospace`;
                let affixText = e.affixes.map(a => a === 'vampiric' ? 'V' : a === 'armored' ? 'A' : 'T').join('');
                this.ctx.fillText(affixText, e.x, e.y - e.radius - 18);
            }
        }

        for (const p of this.projectiles) {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            this.ctx.fillStyle = p.isCrit ? '#f1c40f' : (this.stats.synergyPierce || this.stats.synergyChain ? '#9b59b6' : (this.stats.towerColor || '#00ffff'));
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = this.ctx.fillStyle;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }

        for (const ep of this.enemyProjectiles) {
            this.ctx.beginPath();
            this.ctx.arc(ep.x, ep.y, 4, 0, Math.PI * 2);
            this.ctx.fillStyle = '#e74c3c';
            this.ctx.shadowBlur = 6;
            this.ctx.shadowColor = '#e74c3c';
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }

        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        for (const ft of this.floatTexts) {
            this.ctx.font = `bold ${Math.round(12 / this._zoom)}px monospace`;
            this.ctx.fillStyle = ft.color;
            this.ctx.globalAlpha = Math.max(0, ft.life);
            this.ctx.fillText(ft.text, ft.x, ft.y);
        }
        this.ctx.globalAlpha = 1.0;

        this.ctx.restore();
    }
}