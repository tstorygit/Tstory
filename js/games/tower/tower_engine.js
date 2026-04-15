export class TowerEngine {
    constructor(canvas, callbacks) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.callbacks = callbacks;
        
        this.cx = 0;
        this.cy = 0;
        this.enemies =[];
        this.projectiles = [];
        this.enemyProjectiles = [];
        this.floatTexts =[];
        
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
        this.stats = stats;
        this.wave = startWave;
        this.diff = diff;
        this.enemies =[];
        this.projectiles = [];
        this.enemyProjectiles =[];
        this.floatTexts =[];
        this.state = 'IDLE';
        this.attackCooldown = 0;
        this.buffs = { barrage: 0, aegis: 0 };
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

    startWave(waveNum) {
        this.wave = waveNum;
        this.enemiesToSpawn = Math.floor(10 + this.wave * 2);
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
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    spawnFloatText(text, color, isCenter = false, x = null, y = null) {
        this.floatTexts.push({
            x: x !== null ? x : this.cx + (isCenter ? 0 : (Math.random() - 0.5) * 40),
            y: y !== null ? y : this.cy - 30 + (isCenter ? 0 : (Math.random() - 0.5) * 40),
            text: text,
            color: color,
            life: 1.0,
            vy: -30
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
            let fastChance = 0.05 + Math.min(0.25, (this.wave / 50) * 0.25);
            let tankChance = 0.05 + Math.min(0.20, (this.wave / 50) * 0.20);
            let rangedChance = 0.05 + Math.min(0.15, (this.wave / 50) * 0.15);
            
            const rand = Math.random();
            if (rand < fastChance) { type = 'fast'; hpMult = 0.5; spdMult = 1.8; color = '#f1c40f'; atkSpeed = 0.5; }
            else if (rand < fastChance + tankChance) { type = 'tank'; hpMult = 3.0; spdMult = 0.6; cashMult = 2; color = '#3498db'; atkSpeed = 2.0; }
            else if (rand < fastChance + tankChance + rangedChance) { type = 'ranged'; hpMult = 0.8; spdMult = 0.8; cashMult = 1.5; color = '#9b59b6'; atkSpeed = 2.0; }
        }

        const baseHp = 10 * Math.pow(1.15, this.wave) * this.diff;
        const baseDmg = 2 * Math.pow(1.12, this.wave) * this.diff;
        
        let relic1Mult = this.callbacks.hasRelic && this.callbacks.hasRelic(1) && type === 'boss' ? 3 : 1;
        const baseCash = 5 * Math.pow(1.08, this.wave) * this.diff * (this.stats.cashBonus || 1) * cashMult * relic1Mult;

        this.enemies.push({
            id: Math.random().toString(36),
            type: type,
            x: this.cx + Math.cos(angle) * radius,
            y: this.cy + Math.sin(angle) * radius,
            hp: baseHp * hpMult,
            maxHp: baseHp * hpMult,
            dmg: baseDmg * dmgMult,
            speed: Math.min(100, 25 + this.wave * 0.8) * spdMult,
            atkSpeed: atkSpeed,
            attackCooldown: atkSpeed,
            kb: 0,
            cash: baseCash,
            color: color,
            radius: type === 'boss' ? 18 : type === 'tank' ? 12 : type === 'fast' ? 8 : 10
        });
    }

    _dealDamageToTower(rawDmg) {
        if (this.buffs.aegis > 0) {
            this.buffs.aegis--;
            this.spawnFloatText('BLOCKED', '#3498db', true);
            return;
        }
        
        const mitigated = rawDmg * (1 - (this.stats.defPct || 0)) - (this.stats.defAbs || 0);
        const finalDmg = Math.max(1, mitigated);
        
        if (this.stats.currentHp - finalDmg <= 0) {
            if (this.stats.defyDeath > 0 && Math.random() < this.stats.defyDeath) {
                this.stats.currentHp = this.stats.health * 0.3; // Survive with 30% HP
                this.spawnFloatText('DEFY DEATH!', '#f1c40f', true);
                this.callbacks.onHpUpdate();
                return;
            }
        }
        
        this.stats.currentHp -= finalDmg;
        this.spawnFloatText(`-${Math.floor(finalDmg)}`, '#e74c3c', true);
        
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

        // Health Regen
        if (this.stats.regen > 0 && this.stats.currentHp < this.stats.health) {
            this.stats.currentHp = Math.min(this.stats.health, this.stats.currentHp + this.stats.regen * dt);
            this.callbacks.onHpUpdate();
        }

        // Spawning
        if (this.enemiesToSpawn > 0) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                this._spawnEnemy();
                this.enemiesToSpawn--;
                this.spawnTimer = Math.max(0.2, 1.2 - this.wave * 0.01);
            }
        }

        // Abilities
        let currentAtkSpeed = this.stats.atkSpeed;
        if (this.buffs.barrage > 0) {
            this.buffs.barrage -= dt;
            currentAtkSpeed *= 10;
        }

        // Tower Attack
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
                    let fasts = candidates.filter(e => e.type === 'fast');
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

        // Update Projectiles
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
                    p.targetId = null; // target died before hit
                }
            }

            if (!hitTarget) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                
                if (p.x < 0 || p.x > this.canvas.width || p.y < 0 || p.y > this.canvas.height) {
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
                hitTarget.hp -= p.dmg;
                if (p.isCrit) this.spawnFloatText(Math.floor(p.dmg), '#f1c40f', false, hitTarget.x, hitTarget.y - 10);
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

        // Enemy Projectiles
        for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
            const ep = this.enemyProjectiles[i];
            const dx = this.cx - ep.x;
            const dy = this.cy - ep.y;
            const dist = Math.hypot(dx, dy);
            const step = ep.speed * dt;
            
            if (dist <= 15 + step) {
                this._dealDamageToTower(ep.dmg);
                this.enemyProjectiles.splice(i, 1);
                if (this.state === 'STOPPED') return;
            } else {
                ep.x += (dx / dist) * step;
                ep.y += (dy / dist) * step;
            }
        }

        // Update Enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            
            if (e.hp <= 0 && !e.dead) {
                e.dead = true;
                this.spawnFloatText(`+$${Math.floor(e.cash)}`, '#2ecc71', false, e.x, e.y);
                this.callbacks.onEnemyKill(e.cash, e.x, e.y, e.type);
                
                if (this.stats.lifesteal > 0 && this.stats.currentHp < this.stats.health) {
                    const heal = this.stats.damage * this.stats.lifesteal;
                    this.stats.currentHp = Math.min(this.stats.health, this.stats.currentHp + heal);
                    this.callbacks.onHpUpdate();
                }
                this.enemies.splice(i, 1);
                continue;
            }

            const dx = this.cx - e.x;
            const dy = this.cy - e.y;
            const dist = Math.hypot(dx, dy);
            const step = e.speed * dt;

            if (e.type === 'ranged') {
                if (dist > (this.stats.range || 100) * 0.7) {
                    e.x += (dx / dist) * step;
                    e.y += (dy / dist) * step;
                    e.attackCooldown = e.atkSpeed; 
                } else {
                    e.attackCooldown -= dt;
                    if (e.attackCooldown <= 0) {
                        this.enemyProjectiles.push({ x: e.x, y: e.y, dmg: e.dmg, speed: 150 });
                        e.attackCooldown = e.atkSpeed;
                    }
                }
            } else {
                if (dist - e.radius <= 15) {
                    e.attackCooldown -= dt;
                    if (e.attackCooldown <= 0) {
                        this._dealDamageToTower(e.dmg);
                        if (this.state === 'STOPPED') return;
                        
                        if (this.stats.thorns > 0) {
                            e.hp -= e.dmg * this.stats.thorns;
                            this.spawnFloatText(`-${Math.floor(e.dmg * this.stats.thorns)}`, '#e74c3c', false, e.x, e.y - 15);
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
                    } else {
                        e.x += (dx / dist) * step;
                        e.y += (dy / dist) * step;
                        e.attackCooldown = e.atkSpeed; 
                    }
                }
            }
        }

        // Floating texts
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

        const pulse = Math.abs(Math.sin(time / 250)); // 0 to 1

        const AA = [];
        const B5B =[5, 5];

        // Draw Range Circle
        this.ctx.beginPath();
        this.ctx.arc(this.cx, this.cy, this.stats.range || 100, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        
        this.ctx['setLineDash'](B5B);
        this.ctx.stroke();
        this.ctx['setLineDash'](AA);

        // Knowledge Aura Glow
        let glowColor = '#00ffff';
        let blur = 10;
        if (this.stats.kBuff >= 3.0) { glowColor = '#ffffff'; blur = 30; }
        else if (this.stats.kBuff >= 2.0) { glowColor = '#9b59b6'; blur = 20; }
        
        this.ctx.shadowBlur = blur * (0.5 + pulse * 0.5); // Pulsing glow
        this.ctx.shadowColor = glowColor;
        this._drawPolygon(this.cx, this.cy, 16, 6, glowColor);
        
        // Aegis Shield overlay
        if (this.buffs.aegis > 0) {
            this.ctx.beginPath();
            this.ctx.arc(this.cx, this.cy, 22, 0, Math.PI * 2);
            this.ctx.strokeStyle = '#3498db';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }
        this.ctx.shadowBlur = 0;

        // Draw Enemies
        for (const e of this.enemies) {
            let sides = 4;
            if (e.type === 'fast') sides = 3;
            if (e.type === 'tank') sides = 5;
            if (e.type === 'boss') sides = 8;
            if (e.type === 'ranged') sides = 6;
            
            // Pulse effect for enemies taking damage or bosses
            if (e.hp < e.maxHp || e.type === 'boss') {
                this.ctx.shadowBlur = (e.type === 'boss' ? 15 : 8) * (0.8 + pulse * 0.2);
                this.ctx.shadowColor = e.color;
            }

            this._drawPolygon(e.x, e.y, e.radius, sides, e.color);
            this.ctx.shadowBlur = 0;
            
            // HP Bar for ANY damaged enemy or boss/tank
            if (e.hp < e.maxHp || e.type === 'boss' || e.type === 'tank') {
                const w = e.radius * 2;
                const hpPct = Math.max(0, e.hp / e.maxHp);
                this.ctx.fillStyle = '#333';
                this.ctx.fillRect(e.x - w/2, e.y - e.radius - 8, w, 4);
                this.ctx.fillStyle = e.color;
                this.ctx.fillRect(e.x - w/2, e.y - e.radius - 8, w * hpPct, 4);
            }
        }

        // Draw Projectiles
        for (const p of this.projectiles) {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            this.ctx.fillStyle = p.isCrit ? '#f1c40f' : (this.stats.synergyPierce || this.stats.synergyChain ? '#9b59b6' : '#00ffff');
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

        // Floating Texts
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        for (const ft of this.floatTexts) {
            this.ctx.font = 'bold 12px monospace';
            this.ctx.fillStyle = ft.color;
            this.ctx.globalAlpha = Math.max(0, ft.life);
            this.ctx.fillText(ft.text, ft.x, ft.y);
        }
        this.ctx.globalAlpha = 1.0;
    }
}