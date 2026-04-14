// main/js/games/tower/tower_engine.js

export class TowerEngine {
    constructor(canvas, callbacks) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.callbacks = callbacks;
        
        this.cx = 0;
        this.cy = 0;
        this.enemies = [];
        this.projectiles =[];
        this.floatTexts =[];
        
        this.state = 'STOPPED';
        this.lastTime = 0;
        this.rafId = null;
        
        this.stats = {}; // Populated by tower.js
        this.wave = 1;
        this.diff = 1;
        
        this.spawnTimer = 0;
        this.enemiesToSpawn = 0;
        this.attackCooldown = 0;
        
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
        this.floatTexts =[];
        this.state = 'IDLE';
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
        if (this.state === 'PLAYING') this.state = 'PAUSED';
    }

    resume() {
        if (this.state === 'PAUSED') {
            this.state = 'PLAYING';
            this.lastTime = performance.now();
            this.rafId = requestAnimationFrame((t) => this._loop(t));
        }
    }

    stop() {
        this.state = 'STOPPED';
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    spawnFloatText(text, color, isCenter = false) {
        this.floatTexts.push({
            x: this.cx + (isCenter ? 0 : (Math.random() - 0.5) * 40),
            y: this.cy - 30 + (isCenter ? 0 : (Math.random() - 0.5) * 40),
            text: text,
            color: color,
            life: 1.0,
            vy: -30
        });
    }

    _spawnEnemy() {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.max(this.canvas.width, this.canvas.height) / 2 + 30;
        
        // Determine type based on wave
        let type = 'basic';
        let hpMult = 1, spdMult = 1, dmgMult = 1, cashMult = 1;
        let color = '#FF00FF';

        if (this.wave % 10 === 0 && this.enemiesToSpawn === 1) {
            type = 'boss'; hpMult = 10; spdMult = 0.4; dmgMult = 5; cashMult = 20; color = '#e74c3c';
        } else {
            const rand = Math.random();
            if (rand < 0.2) { type = 'fast'; hpMult = 0.5; spdMult = 1.8; color = '#f1c40f'; }
            else if (rand < 0.35) { type = 'tank'; hpMult = 3.0; spdMult = 0.6; cashMult = 2; color = '#3498db'; }
        }

        const baseHp = 10 * Math.pow(1.08, this.wave) * this.diff;
        const baseDmg = 1 * Math.pow(1.06, this.wave) * this.diff;
        const baseCash = 1 * Math.pow(1.04, this.wave) * this.diff * this.stats.cashBonus;

        this.enemies.push({
            id: Math.random().toString(36),
            type: type,
            x: this.cx + Math.cos(angle) * radius,
            y: this.cy + Math.sin(angle) * radius,
            hp: baseHp * hpMult,
            maxHp: baseHp * hpMult,
            dmg: baseDmg * dmgMult,
            speed: Math.min(80, 20 + this.wave * 0.5) * spdMult,
            cash: baseCash * cashMult,
            color: color,
            radius: type === 'boss' ? 18 : type === 'tank' ? 12 : type === 'fast' ? 8 : 10
        });
    }

    _loop(time) {
        if (this.state !== 'PLAYING') return;

        // Apply Game Speed modifier from lab
        let dt = (time - this.lastTime) / 1000;
        this.lastTime = time;
        if (dt > 0.1) dt = 0.1;
        dt *= this.stats.gameSpeed; 

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
                // Spawn rate increases slightly with wave
                this.spawnTimer = Math.max(0.2, 1.2 - this.wave * 0.01);
            }
        }

        // Tower Attack
        this.attackCooldown -= dt;
        if (this.attackCooldown <= 0 && this.enemies.length > 0) {
            // Find closest enemy in range
            let closest = null;
            let minDist = this.stats.range;
            
            for (const e of this.enemies) {
                const dist = Math.hypot(e.x - this.cx, e.y - this.cy) - e.radius;
                if (dist < minDist) {
                    minDist = dist;
                    closest = e;
                }
            }

            if (closest) {
                // Fire projectile
                const isCrit = Math.random() < this.stats.critChance;
                const dmg = isCrit ? this.stats.damage * this.stats.critMult : this.stats.damage;
                
                this.projectiles.push({
                    x: this.cx, y: this.cy,
                    targetId: closest.id,
                    dmg: dmg,
                    isCrit: isCrit,
                    speed: 400
                });
                
                this.attackCooldown = 1 / this.stats.atkSpeed;
            }
        }

        // Update Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            const target = this.enemies.find(e => e.id === p.targetId);
            
            if (!target) {
                this.projectiles.splice(i, 1);
                continue;
            }

            const dx = target.x - p.x;
            const dy = target.y - p.y;
            const dist = Math.hypot(dx, dy);
            const step = p.speed * dt;

            if (step >= dist) {
                // Hit
                target.hp -= p.dmg;
                if (p.isCrit) this.spawnFloatText(Math.floor(p.dmg), '#f1c40f');
                this.projectiles.splice(i, 1);
            } else {
                p.x += (dx / dist) * step;
                p.y += (dy / dist) * step;
            }
        }

        // Update Enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            
            if (e.hp <= 0) {
                // Die
                this.callbacks.onEnemyKill(e.cash);
                // Lifesteal
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

            // Collision with tower (Tower radius ~15)
            if (dist - e.radius < 15) {
                // Deal damage to tower
                const rawDmg = e.dmg;
                const mitigated = rawDmg * (1 - this.stats.defPct) - this.stats.defAbs;
                const finalDmg = Math.max(1, mitigated);
                
                this.stats.currentHp -= finalDmg;
                this.spawnFloatText(`-${Math.floor(finalDmg)}`, '#e74c3c', true);
                
                // Thorns damage
                if (this.stats.thorns > 0) {
                    e.hp -= rawDmg * this.stats.thorns;
                }

                this.callbacks.onHpUpdate();

                if (this.stats.currentHp <= 0) {
                    this.state = 'STOPPED';
                    this._draw();
                    this.callbacks.onPlayerDie();
                    return; // Stop processing
                }

                // Enemy dies on impact
                this.enemies.splice(i, 1);
            } else {
                e.x += (dx / dist) * step;
                e.y += (dy / dist) * step;
            }
        }

        // Update floating texts
        for (let i = this.floatTexts.length - 1; i >= 0; i--) {
            const ft = this.floatTexts[i];
            ft.y += ft.vy * dt;
            ft.life -= dt;
            if (ft.life <= 0) this.floatTexts.splice(i, 1);
        }

        // Wave End Condition
        if (this.enemiesToSpawn <= 0 && this.enemies.length === 0) {
            this.state = 'IDLE';
            this.callbacks.onWaveComplete();
        }

        this._draw();
        this.rafId = requestAnimationFrame((t) => this._loop(t));
    }

    _drawPolygon(x, y, radius, sides, color, fill = false) {
        this.ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
            this.ctx.lineTo(x + radius * Math.cos(a), y + radius * Math.sin(a));
        }
        this.ctx.closePath();
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = color;
        if (fill) {
            this.ctx.fillStyle = color;
            this.ctx.fill();
        } else {
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
        this.ctx.shadowBlur = 0;
    }

    _draw() {
        this.ctx.fillStyle = '#050510';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Range Circle
        this.ctx.beginPath();
        this.ctx.arc(this.cx, this.cy, this.stats.range, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw Tower (Hexagon)
        this._drawPolygon(this.cx, this.cy, 16, 6, '#00ffff');

        // Draw Enemies
        for (const e of this.enemies) {
            let sides = 4;
            if (e.type === 'fast') sides = 3;
            if (e.type === 'tank') sides = 5;
            if (e.type === 'boss') sides = 8;
            this._drawPolygon(e.x, e.y, e.radius, sides, e.color);
            
            // HP Bar for Boss/Tank
            if (e.type === 'boss' || e.type === 'tank') {
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
            this.ctx.fillStyle = p.isCrit ? '#f1c40f' : '#00ffff';
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = this.ctx.fillStyle;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }

        // Draw Floating Texts
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