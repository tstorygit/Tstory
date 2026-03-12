import { GEMS, CONSTANTS, gemUpgradeCost, gemDamage, gemFireSpeed, gemRange, gemCritChance, gemCritMult, gemPoisonDps, gemSlowAmount, gemManaDrain, gemArmorTear } from './vc_engine.js';
import { TILE_PATH, TILE_GRASS } from './vc_mapgen.js';

export class VcUI {
    constructor(container, engine, vocabCallbacks) {
        this.container = container;
        this.engine = engine;
        this.vocab = vocabCallbacks;
        this.tileSize = 0;
        this.selectedTile = null;
        this.selectedEnemyId = null;
        this.tiles = [];

        // Zoom state
        this._zoom = 1.0;
        this._minZoom = 0.5;
        this._maxZoom = 3.0;
        this._pinchStartDist = null;
        this._pinchStartZoom = 1.0;

        this.mapEl = container.querySelector('.vc-map-container');
        this.gridEl = container.querySelector('.vc-grid');
        this.bottomBar = container.querySelector('.vc-bottombar');
        this.gridEl.innerHTML = '';

        this.topBar = {
            hp: container.querySelector('#vc-val-hp'),
            mana: container.querySelector('#vc-val-mana'),
            waves: container.querySelector('.vc-wave-tracker')
        };

        setTimeout(() => {
            this.initGrid();
            this.initWaves();
            this.initZoom();

            this.entitiesEl = document.createElement('div');
            this.entitiesEl.className = 'vc-entities';
            this.gridEl.appendChild(this.entitiesEl);

            this.enemyStatEl = document.createElement('div');
            this.enemyStatEl.className = 'vc-enemy-stat-window';
            this.enemyStatEl.style.display = 'none';
            this.mapEl.appendChild(this.enemyStatEl);
        }, 10);
    }

    initGrid() {
        const { cols, rows, grid } = this.engine.map;

        // Use a comfortable fixed tile size. Map scrolls in both directions.
        // Base size fills width at 1x zoom — user can zoom out to see more.
        const containerW = this.mapEl.clientWidth || window.innerWidth;
        this.tileSize = Math.max(36, Math.floor(containerW / cols));

        this.gridEl.style.width  = `${cols * this.tileSize}px`;
        this.gridEl.style.height = `${rows * this.tileSize}px`;
        this.gridEl.style.gridTemplateColumns = `repeat(${cols}, ${this.tileSize}px)`;
        this.gridEl.style.gridTemplateRows    = `repeat(${rows}, ${this.tileSize}px)`;

        this.tiles = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('div');
                cell.className = `vc-tile ${grid[r][c] === TILE_PATH ? 'dirt' : grid[r][c] === TILE_GRASS ? 'grass' : 'rock'}`;
                cell.onclick = () => this.selectTile(r, c, grid[r][c]);
                this.gridEl.appendChild(cell);
                this.tiles.push(cell);
            }
        }

        this.engine.map.waypoints = this.engine.map.path.map(p => ({
            x: p.x * this.tileSize + (this.tileSize / 2),
            y: p.y * this.tileSize + (this.tileSize / 2)
        }));
    }

    initZoom() {
        const mapEl   = this.mapEl;
        const gridEl  = this.gridEl;
        const zoomBtn = this.container.querySelector('#vc-btn-zoom');

        const applyZoom = (z, pivotX, pivotY) => {
            const prev = this._zoom;
            this._zoom = Math.max(this._minZoom, Math.min(this._maxZoom, z));

            // Adjust scroll so the pinch pivot stays under the fingers
            if (pivotX != null) {
                const scaleChange = this._zoom / prev;
                mapEl.scrollLeft = (mapEl.scrollLeft + pivotX) * scaleChange - pivotX;
                mapEl.scrollTop  = (mapEl.scrollTop  + pivotY) * scaleChange - pivotY;
            }

            gridEl.style.transform = `scale(${this._zoom})`;
            // Tell the scroll container how big the scaled content is
            gridEl.style.marginBottom = `${gridEl.offsetHeight * (this._zoom - 1)}px`;
            gridEl.style.marginRight  = `${gridEl.offsetWidth  * (this._zoom - 1)}px`;

            if (zoomBtn) {
                const pct = Math.round(this._zoom * 100);
                zoomBtn.textContent = `🔍${pct}%`;
            }
        };

        // ── Button: cycle 100% → 50% → 200% → 100% ──────────────────────────
        const ZOOM_STEPS = [1.0, 0.5, 2.0];
        if (zoomBtn) {
            zoomBtn.onclick = () => {
                const idx = ZOOM_STEPS.findIndex(s => Math.abs(s - this._zoom) < 0.05);
                const next = ZOOM_STEPS[(idx + 1) % ZOOM_STEPS.length];
                applyZoom(next, null, null);
            };
        }

        // ── Pinch-to-zoom ─────────────────────────────────────────────────────
        mapEl.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const t = e.touches;
                this._pinchStartDist = Math.hypot(
                    t[1].clientX - t[0].clientX,
                    t[1].clientY - t[0].clientY
                );
                this._pinchStartZoom = this._zoom;
                // Pivot = midpoint relative to mapEl
                const rect = mapEl.getBoundingClientRect();
                this._pinchPivotX = ((t[0].clientX + t[1].clientX) / 2) - rect.left + mapEl.scrollLeft;
                this._pinchPivotY = ((t[0].clientY + t[1].clientY) / 2) - rect.top  + mapEl.scrollTop;
            }
        }, { passive: false });

        mapEl.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && this._pinchStartDist) {
                e.preventDefault();
                const t = e.touches;
                const dist = Math.hypot(
                    t[1].clientX - t[0].clientX,
                    t[1].clientY - t[0].clientY
                );
                const newZoom = this._pinchStartZoom * (dist / this._pinchStartDist);
                applyZoom(newZoom, this._pinchPivotX, this._pinchPivotY);
            }
        }, { passive: false });

        mapEl.addEventListener('touchend', () => {
            if (this._pinchStartDist) this._pinchStartDist = null;
        });

        // Apply initial zoom
        applyZoom(this._zoom, null, null);
    }

    initWaves() {
        this.topBar.waves.innerHTML = `
            <button id="vc-btn-start-wave" class="vc-btn">▶ Wave</button>
            <div id="vc-wave-icons" class="vc-wave-icons-container"></div>
        `;

        this.waveIconsContainer = this.topBar.waves.querySelector('#vc-wave-icons');
        const startBtn = this.topBar.waves.querySelector('#vc-btn-start-wave');

        startBtn.onclick = () => {
            if (this.engine.state.status === 'playing' && this.engine.state.wave < this.engine.state.maxWaves) {
                this.engine.spawnWave(false);
                const icons = this.waveIconsContainer.children;
                const wIdx = this.engine.state.wave - 1;
                if (icons[wIdx]) { icons[wIdx].classList.remove('active'); icons[wIdx].classList.add('done'); }
                this.activateNextWaveIcon(this.engine.state.wave);
            }
        };

        for (let i = 0; i < this.engine.state.maxWaves; i++) {
            const icon = document.createElement('div');
            icon.className = 'vc-wave-icon';
            icon.title = 'Tap to Enrage (answer a word)';
            icon.onclick = () => {
                if (this.engine.state.status === 'playing' && i === this.engine.state.wave) {
                    this.engine.pause();
                    this.vocab.showCard('new', (isCorrect) => {
                        if (isCorrect) { icon.classList.add('enraged'); this.engine.spawnWave(true); }
                        else { this.engine.spawnWave(false); }
                        icon.classList.remove('active'); icon.classList.add('done');
                        this.activateNextWaveIcon(i + 1);
                        this.engine.resume();
                    });
                }
            };
            this.waveIconsContainer.appendChild(icon);
        }
        this.activateNextWaveIcon(0);
    }

    activateNextWaveIcon(idx) {
        if (idx < this.waveIconsContainer.children.length)
            this.waveIconsContainer.children[idx].classList.add('active');
    }

    selectTile(r, c, type) {
        this.tiles.forEach(el => el.classList.remove('selected'));
        const idx = r * this.engine.map.cols + c;
        if (this.tiles[idx]) this.tiles[idx].classList.add('selected');

        const x = c * this.tileSize + (this.tileSize / 2);
        const y = r * this.tileSize + (this.tileSize / 2);
        const structRef = this.engine.structures.find(s => s.x === x && s.y === y);

        this.selectedTile = { r, c, type, structRef, x, y };
        this.renderBottomBar();
    }

    renderBottomBar() {
        this.bottomBar.innerHTML = '';
        const st = this.selectedTile;
        if (!st) {
            this.bottomBar.innerHTML = `<div style="color:#7f8c8d;">Select a tile to build.</div>`;
            return;
        }

        const mana = this.engine.state.mana;

        if (!st.structRef) {
            if (st.type === TILE_GRASS) {
                this.createBtn(`🏰 Tower (${CONSTANTS.towerCost})`, mana >= CONSTANTS.towerCost, () => {
                    if (this.engine.addStructure(st.x, st.y, 'tower')) this.selectTile(st.r, st.c, st.type);
                });
            } else if (st.type === TILE_PATH) {
                this.createBtn(`⚙️ Trap (${CONSTANTS.trapCost})`, mana >= CONSTANTS.trapCost, () => {
                    if (this.engine.addStructure(st.x, st.y, 'trap')) this.selectTile(st.r, st.c, st.type);
                });
            } else {
                this.bottomBar.innerHTML = `<div style="color:#7f8c8d;">Cannot build on Rock.</div>`;
            }
            return;
        }

        if (!st.structRef.gem) {
            Object.entries(GEMS).forEach(([color, data]) => {
                const btn = document.createElement('button');
                btn.className = `vc-btn gem-${color}`;
                btn.textContent = `${data.label} (100)`;
                btn.disabled = mana < CONSTANTS.gemBaseCost;
                btn.onclick = () => this.handleVocabAction(CONSTANTS.gemBaseCost, () => {
                    st.structRef.gem = { color, level: 1 };
                    this.selectTile(st.r, st.c, st.type);
                });
                this.bottomBar.appendChild(btn);
            });
            return;
        }

        this._renderGemStats(st.structRef);
    }

    _renderGemStats(structRef) {
        const gem = structRef.gem;
        const gemDef = GEMS[gem.color];
        const isTrap = structRef.type === 'trap';
        const lvl = gem.level;
        // Exponential cost: 100 × 2^(level-1) — doubles each upgrade
        const cost = gemUpgradeCost(lvl);
        const mana = this.engine.state.mana;

        const dmg = gemDamage(gem, gemDef);
        const speed = gemFireSpeed(gem, gemDef);
        const range = gemRange(gem, isTrap);
        const trapMult = isTrap ? 0.3 : 1;

        const stats = [
            { icon: '🏹', label: 'Range',  val: range + 'px' },
            { icon: '⚡', label: 'Fire',   val: speed.toFixed(2) + '/s' },
            { icon: '⚔️', label: 'Damage', val: Math.floor(dmg * trapMult) + (isTrap ? '(trap)' : '') },
        ];

        switch (gemDef.type) {
            case 'crit':
                stats.push({ icon: '💥', label: 'Crit', val: `${(gemCritChance(gem)*100).toFixed(0)}% ×${gemCritMult(gem).toFixed(1)}` });
                break;
            case 'slow':
                stats.push({ icon: '❄️', label: 'Slow', val: `${(gemSlowAmount(gem, gemDef)*100).toFixed(0)}%` });
                break;
            case 'poison':
                stats.push({ icon: '☠️', label: 'Poison', val: `${gemPoisonDps(gem, gemDef).toFixed(1)}/s` });
                break;
            case 'mana':
                stats.push({ icon: '💧', label: 'Leech', val: `${gemManaDrain(gem, gemDef).toFixed(1)}/hit` });
                break;
            case 'armor':
                stats.push({ icon: '🛡️', label: 'Tear', val: `${gemArmorTear(gem, gemDef)}/hit` });
                break;
        }

        // Next level preview
        const nextGem = { color: gem.color, level: lvl + 1 };
        const nextDmg = gemDamage(nextGem, gemDef);
        const nextSpeed = gemFireSpeed(nextGem, gemDef);
        const nextRange = gemRange(nextGem, isTrap);

        const panel = document.createElement('div');
        panel.className = 'vc-tower-stat-panel';
        panel.innerHTML = `
            <div class="vc-stat-panel-title" style="color:${gemDef.color}">
                ${gemDef.label} ${isTrap ? 'Trap' : 'Tower'} — Lv.${lvl}
            </div>
            <div class="vc-stat-panel-rows">
                ${stats.map(s => `<div class="vc-stat-panel-row"><span>${s.icon} ${s.label}</span><span>${s.val}</span></div>`).join('')}
            </div>
            <div class="vc-stat-panel-next">
                Lv.${lvl+1}: ⚔️${Math.floor(nextDmg*trapMult)} ⚡${nextSpeed.toFixed(1)}/s 🏹${nextRange}px
            </div>
        `;
        this.bottomBar.appendChild(panel);

        const btnRow = document.createElement('div');
        btnRow.className = 'vc-stat-panel-btns';

        const upBtn = document.createElement('button');
        upBtn.className = 'vc-btn';
        upBtn.textContent = `▲ Lv.${lvl+1} (${cost} 💧)`;
        upBtn.disabled = mana < cost;
        upBtn.onclick = () => this.handleVocabAction(cost, () => {
            structRef.gem.level++;
            this.selectTile(this.selectedTile.r, this.selectedTile.c, this.selectedTile.type);
        });
        btnRow.appendChild(upBtn);

        const sellBtn = document.createElement('button');
        sellBtn.className = 'vc-btn';
        sellBtn.style.background = '#7f8c8d';
        sellBtn.style.borderColor = '#636e72';
        sellBtn.textContent = '✕ Remove';
        sellBtn.onclick = () => {
            structRef.gem = null;
            this.selectTile(this.selectedTile.r, this.selectedTile.c, this.selectedTile.type);
        };
        btnRow.appendChild(sellBtn);

        this.bottomBar.appendChild(btnRow);
    }

    createBtn(text, enabled, onClick) {
        const btn = document.createElement('button');
        btn.className = 'vc-btn';
        btn.textContent = text;
        btn.disabled = !enabled;
        btn.onclick = onClick;
        this.bottomBar.appendChild(btn);
    }

    handleVocabAction(manaCost, onSuccess) {
        this.engine.pause();
        this.vocab.showCard('review', (isCorrect) => {
            if (isCorrect) {
                this.engine.state.mana -= manaCost;
                this.engine.state.combo++;
                onSuccess();
            } else {
                this.engine.state.mana = Math.max(0, this.engine.state.mana - CONSTANTS.vocabPenalty);
                this.engine.state.combo = 0;
            }
            this.engine.resume();
            this.renderBottomBar();
        });
    }

    draw(engineState, eventMsg) {
        this.topBar.hp.textContent = engineState.state.hp;
        this.topBar.mana.textContent = Math.floor(engineState.state.mana);

        if (!this.entitiesEl) return;
        let html = '';

        // Range indicator using level-scaled range
        if (this.selectedTile?.structRef) {
            const st = this.selectedTile.structRef;
            const radius = st.gem
                ? gemRange(st.gem, st.type === 'trap')
                : (st.type === 'tower' ? CONSTANTS.towerBaseRange : CONSTANTS.trapBaseRange);
            html += `<div class="vc-range-indicator" style="left:${st.x-radius}px;top:${st.y-radius}px;width:${radius*2}px;height:${radius*2}px;"></div>`;
        }

        // Structures
        engineState.structures.forEach(st => {
            const isTower = st.type === 'tower';
            let inner = st.gem ? `<div class="vc-gem" style="background:${GEMS[st.gem.color].color}">${st.gem.level}</div>` : '';
            html += `<div class="vc-structure ${isTower?'vc-tower':'vc-trap'}" style="left:${st.x-this.tileSize/2}px;top:${st.y-this.tileSize/2}px;width:${this.tileSize}px;height:${this.tileSize}px;">${inner}</div>`;
        });

        // Enemies — clickable, type-colored hp bar
        engineState.enemies.forEach(e => {
            const pct = (e.hp / e.maxHp) * 100;
            const isSelected = e.id === this.selectedEnemyId;
            const ring = isSelected ? `<div class="vc-enemy-selected-ring"></div>` : '';
            // Color hp bar based on enemy type
            const hpColor = e.isBoss ? '#e74c3c' : e.typeId === 'armored' ? '#95a5a6' : e.typeId === 'fast' ? '#3498db' : e.typeId === 'healer' ? '#2ecc71' : e.typeId === 'ghost' ? '#9b59b6' : e.typeId === 'swarm' ? '#f39c12' : '#2ecc71';
            html += `<div class="vc-enemy${isSelected?' vc-enemy-focused':''}" data-eid="${e.id}" style="left:${e.x}px;top:${e.y}px;pointer-events:auto;cursor:pointer;">
                ${ring}${e.emoji||'👾'}
                <div class="vc-enemy-hp-bar"><div class="vc-enemy-hp-fill" style="width:${pct}%;background:${hpColor}"></div></div>
                ${e.armor>0?`<div class="vc-enemy-armor">🛡️${e.armor}</div>`:''}
            </div>`;
        });

        // Projectiles
        engineState.projectiles.forEach(p => {
            html += `<div class="vc-projectile" style="left:${p.x}px;top:${p.y}px;background:${p.gemData.color};"></div>`;
        });

        this.entitiesEl.innerHTML = html;

        this.entitiesEl.querySelectorAll('.vc-enemy[data-eid]').forEach(el => {
            el.addEventListener('click', ev => {
                ev.stopPropagation();
                const eid = el.dataset.eid;
                this.selectedEnemyId = (this.selectedEnemyId === eid) ? null : eid;
                this.engine.selectedEnemyId = this.selectedEnemyId;
            });
        });

        this._updateEnemyStatWindow(engineState);

        if (eventMsg) {
            const fl = document.createElement('div');
            fl.className = 'vc-float';
            fl.style.left = eventMsg.x + 'px';
            fl.style.top = eventMsg.y + 'px';
            fl.style.color = GEMS[eventMsg.color].color;
            fl.textContent = eventMsg.amt;
            this.gridEl.appendChild(fl);
            setTimeout(() => fl.remove(), 800);
        }
    }

    _updateEnemyStatWindow(engineState) {
        if (!this.enemyStatEl) return;
        if (!this.selectedEnemyId) { this.enemyStatEl.style.display = 'none'; return; }

        const e = engineState.enemies.find(en => en.id === this.selectedEnemyId);
        if (!e) {
            this.selectedEnemyId = null; this.engine.selectedEnemyId = null;
            this.enemyStatEl.style.display = 'none'; return;
        }

        const hpPct = Math.max(0, Math.floor((e.hp / e.maxHp) * 100));
        const effects = [];
        if (e.effects.slow > 0) effects.push(`❄️ Slowed ${Math.floor(e.effects.slow*100)}%`);
        if (e.effects.poison > 0) effects.push(`☠️ Poison ${Math.floor(e.effects.poison)}/s`);
        if (e.regen > 0) effects.push(`💚 Regen ${(e.regen*100).toFixed(1)}%/s`);

        const immunities = [];
        if (e.immune?.includes('slow')) immunities.push('❄️Slow');
        if (e.immune?.includes('poison')) immunities.push('☠️Poison');

        this.enemyStatEl.style.display = 'block';
        this.enemyStatEl.innerHTML = `
            <div class="vc-stat-title">${e.emoji} ${e.isBoss ? '<span style="color:#e74c3c">BOSS</span>' : (e.label || 'Enemy')}</div>
            <div class="vc-stat-row">❤️ <span>${Math.floor(e.hp)} / ${Math.floor(e.maxHp)}</span></div>
            <div class="vc-stat-hpbar"><div class="vc-stat-hpfill" style="width:${hpPct}%"></div></div>
            ${e.armor > 0 ? `<div class="vc-stat-row">🛡️ Armor <span>${e.armor}</span></div>` : ''}
            ${immunities.length ? `<div class="vc-stat-fx">🚫 Immune: ${immunities.join(' ')}</div>` : ''}
            ${effects.map(fx => `<div class="vc-stat-fx">${fx}</div>`).join('')}
            <div class="vc-stat-hint">🎯 Towers focusing</div>
        `;
    }
}