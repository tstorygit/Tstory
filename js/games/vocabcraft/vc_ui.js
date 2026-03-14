import { GEMS, CONSTANTS, gemTotalCostColor, gemUpgradeCost, gemDamage, gemFireSpeed, gemRange, gemCritChance, gemCritMult, gemPoisonDps, gemSlowAmount, gemManaDrain, gemArmorTear } from './vc_engine.js';
import { TILE_PATH, TILE_GRASS, getWaypointsForPaths } from './vc_mapgen.js';

export class VcUI {
    constructor(container, engine, vocabCallbacks, onReady) {
        this.container = container;
        this.engine = engine;
        this.vocab = vocabCallbacks;
        this.tileSize = 0;
        this.selectedTile = null;
        this.selectedEnemyId = null;
        this.tiles =[];

        // Zoom state
        this._zoom = 1.0;
        this._minZoom = 0.5;
        this._maxZoom = 3.0;
        this._pinchStartDist = null;
        this._pinchStartZoom = 1.0;

        this.mapEl = container.querySelector('.vc-map-container');
        this.gridEl = container.querySelector('.vc-grid');
        this.bottomBar = container.querySelector('.vc-bottombar');
        this.bottomBar.addEventListener('click', e => e.stopPropagation());
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

            // Stable overlay for spawn/base markers — lives above tiles,
            // never touched by the per-frame entitiesEl.innerHTML rewrite
            this.markersEl = document.createElement('div');
            this.markersEl.className = 'vc-entities'; // same positioning rules
            this.markersEl.style.zIndex = '8';        // above enemies (z-index 6)
            this.markersEl.style.pointerEvents = 'none';
            this.gridEl.appendChild(this.markersEl);

            // Place spawn/base markers now that markersEl exists
            this._baseMakerKeys = null;
            this._placeMapMarkers();

            this.enemyStatEl = document.createElement('div');
            this.enemyStatEl.className = 'vc-enemy-stat-window';
            this.enemyStatEl.style.display = 'none';
            this.mapEl.appendChild(this.enemyStatEl);

            if (onReady) onReady();
        }, 10);
    }

    initGrid() {
        const { cols, rows, grid } = this.engine.map;

        // Measure available height: total container minus the two topbars and bottombar
        const battleLayer = this.container.querySelector('#vc-battle-layer') || this.container;
        const topRow1 = battleLayer.querySelector('.vc-topbar-row1');
        const topRow2 = battleLayer.querySelector('.vc-topbar-row2');
        const bottomBarEl = battleLayer.querySelector('.vc-bottombar');
        const topbarsH = (topRow1 ? topRow1.offsetHeight : 42)
                       + (topRow2 ? topRow2.offsetHeight : 36);
        // Use measured bottombar height; fall back to 140 (generous default for auto-height bar)
        const bottomH  = bottomBarEl ? bottomBarEl.offsetHeight : 140;
        const totalH   = battleLayer.clientHeight || window.innerHeight;
        const availH   = Math.max(60, totalH - topbarsH - bottomH);
        const availW   = this.mapEl.clientWidth || window.innerWidth;

        // Tile size: fit all cols×rows into available space at zoom=1
        const tileByCols = Math.floor(availW / cols);
        const tileByRows = Math.floor(availH / rows);
        this.tileSize = Math.max(16, Math.min(tileByCols, tileByRows));

        // Map container: fill remaining vertical space via flex
        this.mapEl.style.flex    = '1 1 0';
        this.mapEl.style.minHeight = '0';
        this.mapEl.style.maxHeight = '';
        this.mapEl.style.overflowX = 'auto';
        this.mapEl.style.overflowY = 'auto';

        // Grid natural size (zoom=1): exactly cols×rows tiles
        this.gridEl.style.width  = `${cols * this.tileSize}px`;
        this.gridEl.style.height = `${rows * this.tileSize}px`;
        this.gridEl.style.gridTemplateColumns = `repeat(${cols}, ${this.tileSize}px)`;
        this.gridEl.style.gridTemplateRows    = `repeat(${rows}, ${this.tileSize}px)`;

        this.tiles =[];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('div');
                cell.className = `vc-tile ${grid[r][c] === TILE_PATH ? 'dirt' : grid[r][c] === TILE_GRASS ? 'grass' : 'rock'}`;
                cell.onclick = () => this.selectTile(r, c, grid[r][c]);
                this.gridEl.appendChild(cell);
                this.tiles.push(cell);
            }
        }

        this.engine.map.waypointSets = getWaypointsForPaths(this.engine.map.paths, this.tileSize);
        this.engine.tileSize = this.tileSize;

        // Draw corridor walls: thin black lines between adjacent path tiles that
        // are NOT consecutive on any path (e.g. spiral parallel corridors).
        this._renderWallEdges();
    }

    _renderWallEdges() {
        // Remove stale overlay if reinitialised
        const old = this.gridEl.querySelector('.vc-wall-edges');
        if (old) old.remove();

        const walls = this.engine.map.wallEdges;
        if (!walls || walls.length === 0) return;

        const ts  = this.tileSize;
        const w   = this.engine.map.cols * ts;
        const h   = this.engine.map.rows * ts;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        svg.classList.add('vc-wall-edges');
        svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;';

        for (const { r, c, dir } of walls) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            if (dir === 'E') {
                // Vertical line on right edge of tile (r,c)
                line.setAttribute('x1', (c + 1) * ts);
                line.setAttribute('y1', r * ts + 1);
                line.setAttribute('x2', (c + 1) * ts);
                line.setAttribute('y2', (r + 1) * ts - 1);
            } else {
                // Horizontal line on bottom edge of tile (r,c)
                line.setAttribute('x1', c * ts + 1);
                line.setAttribute('y1', (r + 1) * ts);
                line.setAttribute('x2', (c + 1) * ts - 1);
                line.setAttribute('y2', (r + 1) * ts);
            }
            line.setAttribute('stroke', '#000');
            line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-linecap', 'square');
            svg.appendChild(line);
        }
        // Insert before the entities layer so enemies render on top
        this.gridEl.insertBefore(svg, this.gridEl.querySelector('.vc-entities'));
    }

    _placeMapMarkers() {
        // Remove any previous markers from the stable markers layer
        if (this.markersEl) this.markersEl.innerHTML = '';
        this._baseMakerKeys = new Set();

        const sets = this.engine.map.waypointSets;

        sets.forEach((wps, i) => {
            const isMulti = sets.length > 1;

            // Spawn marker at path start
            const spawnEl = document.createElement('div');
            spawnEl.className = 'vc-map-marker vc-spawn-marker';
            spawnEl.textContent = isMulti ? `⚔️${i + 1}` : '⚔️';
            spawnEl.style.cssText = `left:${wps[0].x}px;top:${wps[0].y}px;`;
            this.markersEl.appendChild(spawnEl);

            // Base marker at path end — deduplicate by pixel position
            // (convergent multi-path maps share one base tile)
            const last = wps[wps.length - 1];
            const key  = `${Math.round(last.x)},${Math.round(last.y)}`;
            if (!this._baseMakerKeys.has(key)) {
                this._baseMakerKeys.add(key);
                const baseEl = document.createElement('div');
                baseEl.className = 'vc-map-marker vc-base-marker';
                baseEl.textContent = '🏰';
                baseEl.style.cssText = `left:${last.x}px;top:${last.y}px;`;
                this.markersEl.appendChild(baseEl);
            }
        });
    }

    // Show enemy path as SVG polylines for 2 seconds, then fade out.
    // One colored line per path — much clearer than tile glow.
    _flashPathTiles() {
        // Remove any existing preview
        const old = this.gridEl.querySelector('.vc-path-preview');
        if (old) old.remove();

        const sets = this.engine.map.waypointSets;
        const w    = this.engine.map.cols * this.tileSize;
        const h    = this.engine.map.rows * this.tileSize;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width',  w);
        svg.setAttribute('height', h);
        svg.classList.add('vc-path-preview');
        svg.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:9;opacity:1;transition:opacity 0.4s ease;`;

        // Two colours: blue for single/first path, orange for additional lanes
        const colors = ['#3498db', '#e67e22', '#2ecc71'];

        sets.forEach((wps, i) => {
            const pts = wps.map(p => `${p.x},${p.y}`).join(' ');

            // Glow / shadow pass
            const glow = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            glow.setAttribute('points', pts);
            glow.setAttribute('fill', 'none');
            glow.setAttribute('stroke', colors[i % colors.length]);
            glow.setAttribute('stroke-width', '8');
            glow.setAttribute('stroke-linecap', 'round');
            glow.setAttribute('stroke-linejoin', 'round');
            glow.setAttribute('opacity', '0.25');
            svg.appendChild(glow);

            // Main line pass
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            line.setAttribute('points', pts);
            line.setAttribute('fill', 'none');
            line.setAttribute('stroke', colors[i % colors.length]);
            line.setAttribute('stroke-width', '3');
            line.setAttribute('stroke-linecap', 'round');
            line.setAttribute('stroke-linejoin', 'round');
            line.setAttribute('opacity', '0.9');

            // Animated dash — draws the line from start to end
            const totalLen = wps.reduce((acc, p, j) => {
                if (j === 0) return 0;
                return acc + Math.hypot(p.x - wps[j-1].x, p.y - wps[j-1].y);
            }, 0);
            line.style.strokeDasharray  = totalLen;
            line.style.strokeDashoffset = totalLen;
            line.style.animation = `vcPathDraw 0.6s ease-out ${i * 0.15}s forwards`;

            svg.appendChild(line);
        });

        this.gridEl.appendChild(svg);

        // Fade out after 2 s, then remove
        setTimeout(() => { svg.style.opacity = '0'; }, 2000);
        setTimeout(() => { if (svg.parentNode) svg.remove(); }, 2400);
    }

    initZoom() {
        const mapEl   = this.mapEl;
        const gridEl  = this.gridEl;
        const zoomBtn = this.container.querySelector('#vc-btn-zoom');

        const applyZoom = (z, pivotX, pivotY) => {
            const prev = this._zoom;
            this._zoom = Math.max(this._minZoom, Math.min(this._maxZoom, z));

            // Scroll adjustment to keep pivot in place
            if (pivotX != null) {
                const scaleChange = this._zoom / prev;
                mapEl.scrollLeft = (mapEl.scrollLeft + pivotX) * scaleChange - pivotX;
                mapEl.scrollTop  = (mapEl.scrollTop  + pivotY) * scaleChange - pivotY;
            }

            // Only the inner grid scales — top/bottom UI is untouched
            gridEl.style.transform       = `scale(${this._zoom})`;
            gridEl.style.transformOrigin = 'top left';
            // Expand scroll area to match scaled size
            gridEl.style.marginBottom = `${gridEl.offsetHeight * (this._zoom - 1)}px`;
            gridEl.style.marginRight  = `${gridEl.offsetWidth  * (this._zoom - 1)}px`;

            if (zoomBtn) {
                const pct = Math.round(this._zoom * 100);
                zoomBtn.textContent = `🔍${pct}%`;
            }
        };

        // Compute default zoom: path bounding box + 1 tile margin must fit the container.
        // Use paths from engine map for the bounding box.
        const _computeDefaultZoom = () => {
            const { cols, rows, paths } = this.engine.map;
            const ts = this.tileSize;
            let minX = cols, maxX = 0, minY = rows, maxY = 0;
            for (const path of paths) {
                for (const { x, y } of path) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
            // Add 1-tile margin on each side
            const pathW = (maxX - minX + 3) * ts; // +1 on each side = +2 tiles; +1 for tile width = +3 effective
            const pathH = (maxY - minY + 3) * ts;
            const mapW  = mapEl.clientWidth  || cols * ts;
            const mapH  = mapEl.clientHeight || rows * ts;            const zoomToFit = Math.min(mapW / pathW, mapH / pathH);
            return Math.max(this._minZoom, Math.min(1.0, zoomToFit));
        };

        if (zoomBtn) {
            zoomBtn.onclick = () => {
                // Cycle: current → 1.5× → 2× → default-fit
                const defaultZ = _computeDefaultZoom();
                const steps = [defaultZ, 1.0, 1.5, 2.0].filter((v, i, a) => a.indexOf(v) === i);
                const idx = steps.findIndex(s => Math.abs(s - this._zoom) < 0.05);
                const next = steps[(idx + 1) % steps.length];
                applyZoom(next, null, null);
            };
        }

        mapEl.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const t = e.touches;
                this._pinchStartDist = Math.hypot(
                    t[1].clientX - t[0].clientX,
                    t[1].clientY - t[0].clientY
                );
                this._pinchStartZoom = this._zoom;
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

        // Apply default zoom: fit path + 1-tile margin in the available container
        const defaultZ = _computeDefaultZoom();
        this._zoom = defaultZ; // set before applyZoom to avoid prev=0 issues
        applyZoom(defaultZ, null, null);
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
                this._flashPathTiles();
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
                    this.vocab.showCard('enrage', (isCorrect) => {
                        if (isCorrect) { icon.classList.add('enraged'); this.engine.spawnWave(true); }
                        else { this.engine.spawnWave(false); }
                        this._flashPathTiles();
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
        this._gemPickerRefresh = null;
        if (this.topBar?.mana) {
            this.topBar.mana.textContent = Math.floor(this.engine.state.mana);
        }
        const st = this.selectedTile;
        if (!st) {
            this.bottomBar.innerHTML = `<div style="color:#7f8c8d;">Select a tile to build.</div>`;
            return;
        }

        const mana = this.engine.state.mana;

        if (!st.structRef) {
            if (st.type === TILE_GRASS) {
                const tCost = this.engine.getBuildCost('tower');
                this.createBtn(`🏰 Tower (${tCost})`, mana >= tCost, tCost, () => {
                    if (this.engine.addStructure(st.x, st.y, 'tower')) this.selectTile(st.r, st.c, st.type);
                });
            } else if (st.type === TILE_PATH) {
                const pCost = this.engine.getBuildCost('trap');
                this.createBtn(`⚙️ Trap (${pCost})`, mana >= pCost, pCost, () => {
                    if (this.engine.addStructure(st.x, st.y, 'trap')) this.selectTile(st.r, st.c, st.type);
                });
            } else {
                this.bottomBar.innerHTML = `<div style="color:#7f8c8d;">Cannot build on Rock.</div>`;
            }
            return;
        }

        if (!st.structRef.gem) {
            this._renderGemPicker(st);
            return;
        }

        this._renderGemStats(st.structRef);
    }

    _renderGemPicker(st) {
        const skills = this.engine.meta.skills;
        let selectedColor = 'red';
        let selectedLevel = 1;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%; display:flex; flex-direction:column; gap:6px; align-items:center;';

        const diamondRow = document.createElement('div');
        diamondRow.style.cssText = 'display:flex; gap:10px; justify-content:center; align-items:center;';

        const gemColors = Object.entries(GEMS);

        const updatePriceLabel = () => {
            const cost = gemTotalCostColor(selectedColor, selectedLevel, skills);
            const canAfford = this.engine.state.mana >= cost; 
            priceLabel.textContent = `${GEMS[selectedColor].label} Lv.${selectedLevel} — ${cost} 💧`;
            priceLabel.style.color = canAfford ? '#2ecc71' : '#e74c3c';
            confirmBtn.disabled = !canAfford;
            confirmBtn.dataset.manaCost = cost;
        };

        this._gemPickerRefresh = updatePriceLabel;

        const updateDiamonds = () => {
            diamondRow.querySelectorAll('.vc-gem-diamond').forEach(d => {
                const isSelected = d.dataset.color === selectedColor;
                d.style.transform = isSelected ? 'scale(1.25)' : 'scale(1)';
                d.style.filter = isSelected
                    ? `drop-shadow(0 0 6px ${GEMS[d.dataset.color].color})`
                    : 'none';
                d.style.opacity = isSelected ? '1' : '0.65';
            });
            updatePriceLabel();
        };

        gemColors.forEach(([color, data]) => {
            const size = 32;
            const c = data.color;
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', size);
            svg.setAttribute('height', size);
            svg.setAttribute('viewBox', '0 0 32 32');
            svg.setAttribute('class', 'vc-gem-diamond');
            svg.dataset.color = color;
            svg.style.cssText = `cursor:pointer; transition: transform 0.15s, filter 0.15s, opacity 0.15s; flex-shrink:0;`;
            svg.innerHTML = `
                <polygon points="16,2 28,12 16,30 4,12" fill="${c}" opacity="0.9"/>
                <polygon points="16,2 28,12 16,14 4,12" fill="white" opacity="0.25"/>
                <polygon points="16,2 22,12 16,14 10,12" fill="white" opacity="0.15"/>
                <polygon points="16,30 4,12 16,14" fill="black" opacity="0.15"/>
                <polygon points="16,30 28,12 16,14" fill="black" opacity="0.08"/>
            `;
            svg.onclick = () => { selectedColor = color; updateDiamonds(); };
            diamondRow.appendChild(svg);
        });

        const sliderRow = document.createElement('div');
        sliderRow.style.cssText = 'display:flex; align-items:center; gap:8px; width:90%;';
        const sliderLabel = document.createElement('span');
        sliderLabel.style.cssText = 'font-size:11px; color:#bdc3c7; white-space:nowrap;';
        sliderLabel.textContent = 'Lv';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = 1; slider.max = 6; slider.value = 1;
        slider.style.cssText = 'flex:1; accent-color:#f1c40f; cursor:pointer;';
        slider.oninput = () => { selectedLevel = +slider.value; updatePriceLabel(); };
        sliderRow.append(sliderLabel, slider);

        const priceLabel = document.createElement('div');
        priceLabel.style.cssText = 'font-size:13px; font-weight:bold; text-align:center;';

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'vc-btn';
        confirmBtn.style.cssText = 'background:#27ae60; border-color:#1e8449; width:90%; padding:6px;';
        confirmBtn.textContent = '⚡ Forge Gem';
        confirmBtn.onclick = (e) => {
            e.stopPropagation();
            const cost = gemTotalCostColor(selectedColor, selectedLevel, skills);
            this.handleVocabAction(cost, () => {
                st.structRef.gem = { color: selectedColor, level: selectedLevel };
                this.selectTile(st.r, st.c, st.type);
            });
        };

        wrapper.append(diamondRow, sliderRow, priceLabel, confirmBtn);
        this.bottomBar.appendChild(wrapper);
        updateDiamonds();
    }

    _renderGemStats(structRef) {
        const gem = structRef.gem;
        const gemDef = GEMS[gem.color];
        const isTrap = structRef.type === 'trap';
        const lvl = gem.level;
        const cost = gemUpgradeCost(gem.color, lvl, this.engine.meta.skills);
        const mana = this.engine.state.mana;

        const dmg = gemDamage(gem, gemDef, this.engine.meta.skills);
        const speed = gemFireSpeed(gem, gemDef, this.engine.meta.skills);
        const range = gemRange(gem, isTrap, this.tileSize);
        
        // Accurate trap multipliers for the UI display
        const trapDmgMult = isTrap ? 0.20 + ((this.engine.meta.skills.trapSpecialty || 0) * 0.01) : 1;
        const trapSpecMult = isTrap ? 2.5 + ((this.engine.meta.skills.trapSpecialty || 0) * 0.1) : 1;
        const trapFireMult = isTrap ? 3.0 + ((this.engine.meta.skills.trapSpecialty || 0) * 0.02) : 1;

        const stats =[
            { icon: '🏹', label: 'Range',  val: range + 'px' },
            { icon: '⚡', label: 'Fire',   val: (speed * trapFireMult).toFixed(2) + '/s' },
            { icon: '⚔️', label: 'Damage', val: Math.max(1, Math.floor(dmg * trapDmgMult)) + (isTrap ? ' (Trap)' : '') },
        ];

        switch (gemDef.type) {
            case 'crit':
                stats.push({ icon: '💥', label: 'Crit', val: `${(gemCritChance(gem)*100).toFixed(0)}% ×${gemCritMult(gem).toFixed(1)}` });
                break;
            case 'slow':
                stats.push({ icon: '❄️', label: 'Slow', val: `${Math.min(70, gemSlowAmount(gem, gemDef) * trapSpecMult * 100).toFixed(0)}%` });
                break;
            case 'poison':
                stats.push({ icon: '☠️', label: 'Poison', val: `${(gemPoisonDps(gem, gemDef) * trapSpecMult).toFixed(1)}/s` });
                break;
            case 'mana':
                stats.push({ icon: '💧', label: 'Leech', val: `${(gemManaDrain(gem, gemDef) * trapSpecMult).toFixed(2)}/hit` });
                break;
            case 'armor':
                stats.push({ icon: '🛡️', label: 'Tear', val: `${(gemArmorTear(gem, gemDef) * trapSpecMult).toFixed(2)}/hit` });
                break;
        }

        const sts = structRef.stats || { manaLeeched: 0, poisonDealt: 0, slowApplied: 0, armorTorn: 0, critHits: 0, totalDmg: 0 };
        let specialStatHtml = '';
        
        specialStatHtml += `<div class="vc-stat-panel-row"><span>🎯 Total Dmg</span><span id="vc-live-totalDmg">${Math.floor(sts.totalDmg)}</span></div>`;

        if (gemDef.type === 'mana') {
            specialStatHtml += `<div class="vc-stat-panel-row"><span>💧 Leeched</span><span id="vc-live-manaLeeched">${Math.floor(sts.manaLeeched)}</span></div>`;
        } else if (gemDef.type === 'slow') {
            specialStatHtml += `<div class="vc-stat-panel-row"><span>❄️ Slows</span><span id="vc-live-slowApplied">${sts.slowApplied}</span></div>`;
        } else if (gemDef.type === 'poison') {
            specialStatHtml += `<div class="vc-stat-panel-row"><span>☠️ Poison</span><span id="vc-live-poisonDealt">${Math.floor(sts.poisonDealt)}</span></div>`;
        } else if (gemDef.type === 'armor') {
            specialStatHtml += `<div class="vc-stat-panel-row"><span>🛡️ Torn</span><span id="vc-live-armorTorn">${sts.armorTorn.toFixed(1)}</span></div>`;
        } else if (gemDef.type === 'crit') {
            specialStatHtml += `<div class="vc-stat-panel-row"><span>💥 Crits</span><span id="vc-live-critHits">${sts.critHits}</span></div>`;
        }

        const nextGem = { color: gem.color, level: lvl + 1 };
        const nextDmg = gemDamage(nextGem, gemDef, this.engine.meta.skills);
        const nextSpeed = gemFireSpeed(nextGem, gemDef, this.engine.meta.skills);
        const nextRange = gemRange(nextGem, isTrap, this.tileSize);

        const panel = document.createElement('div');
        panel.className = 'vc-tower-stat-panel';
        panel.innerHTML = `
            <div class="vc-stat-panel-title" style="color:${gemDef.color}">
                ${gemDef.label} ${isTrap ? 'Trap' : 'Tower'} — Lv.${lvl}
            </div>
            <div class="vc-stat-panel-rows">
                ${stats.map(s => `<div class="vc-stat-panel-row"><span>${s.icon} ${s.label}</span><span>${s.val}</span></div>`).join('')}
                ${specialStatHtml}
            </div>
            <div class="vc-stat-panel-next">
                Lv.${lvl+1}: ⚔️${Math.max(1, Math.floor(nextDmg*trapDmgMult))} ⚡${(nextSpeed*trapFireMult).toFixed(1)}/s 🏹${nextRange}px
            </div>
        `;
        this.bottomBar.appendChild(panel);

        const btnRow = document.createElement('div');
        btnRow.className = 'vc-stat-panel-btns';

        const upBtn = document.createElement('button');
        upBtn.className = 'vc-btn';
        upBtn.textContent = `▲ Lv.${lvl+1} (${cost} 💧)`;
        upBtn.disabled = mana < cost;
        upBtn.dataset.manaCost = cost;
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

    createBtn(text, enabled, cost, onClick) {
        const btn = document.createElement('button');
        btn.className = 'vc-btn';
        btn.textContent = text;
        btn.disabled = !enabled;
        if (cost != null) btn.dataset.manaCost = cost;
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

    _refreshBottomBarButtons(mana) {
        this.bottomBar.querySelectorAll('button[data-mana-cost]').forEach(btn => {
            const cost = +btn.dataset.manaCost;
            btn.disabled = mana < cost;
        });
        if (this._gemPickerRefresh) this._gemPickerRefresh();
    }

    draw(engineState, eventMsg) {
        this.topBar.hp.textContent = engineState.state.hp;
        this.topBar.mana.textContent = Math.floor(engineState.state.mana);

        const mana = Math.floor(engineState.state.mana);
        if (this._lastMana !== mana) {
            this._lastMana = mana;
            this._refreshBottomBarButtons(mana);
        }

        // Live update stats if a structure is selected
        if (this.selectedTile?.structRef?.stats) {
            const sts = this.selectedTile.structRef.stats;
            const s_dmg = this.bottomBar.querySelector('#vc-live-totalDmg');
            if (s_dmg) s_dmg.textContent = Math.floor(sts.totalDmg);
            
            const s_mana = this.bottomBar.querySelector('#vc-live-manaLeeched');
            if (s_mana) s_mana.textContent = Math.floor(sts.manaLeeched);
            
            const s_slow = this.bottomBar.querySelector('#vc-live-slowApplied');
            if (s_slow) s_slow.textContent = sts.slowApplied;
            
            const s_pois = this.bottomBar.querySelector('#vc-live-poisonDealt');
            if (s_pois) s_pois.textContent = Math.floor(sts.poisonDealt);
            
            const s_arm = this.bottomBar.querySelector('#vc-live-armorTorn');
            if (s_arm) s_arm.textContent = sts.armorTorn.toFixed(1);
            
            const s_crit = this.bottomBar.querySelector('#vc-live-critHits');
            if (s_crit) s_crit.textContent = sts.critHits;
        }

        if (!this.entitiesEl) return;
        let html = '';

        if (this.selectedTile?.structRef) {
            const st = this.selectedTile.structRef;
            const radius = st.gem
                ? gemRange(st.gem, st.type === 'trap', this.tileSize)
                : (st.type === 'tower'
                    ? Math.floor(CONSTANTS.towerBaseRange * this.tileSize)
                    : Math.floor(CONSTANTS.trapBaseRange * this.tileSize));
            html += `<div class="vc-range-indicator" style="left:${st.x-radius}px;top:${st.y-radius}px;width:${radius*2}px;height:${radius*2}px;"></div>`;
        }

        engineState.structures.forEach(st => {
            const isTower = st.type === 'tower';
            let inner = st.gem
                ? `<div class="vc-gem" style="background:${GEMS[st.gem.color].color}">${st.gem.level}</div>`
                : `<div style="font-size:${Math.max(10,this.tileSize*0.38)}px;opacity:0.45;line-height:1;">${isTower ? '🏰' : '⚙️'}</div>`;
            html += `<div class="vc-structure ${isTower?'vc-tower':'vc-trap'}" style="left:${st.x-this.tileSize/2}px;top:${st.y-this.tileSize/2}px;width:${this.tileSize}px;height:${this.tileSize}px;">${inner}</div>`;
        });

        engineState.enemies.forEach(e => {
            const pct = (e.hp / e.maxHp) * 100;
            const isSelected = e.id === this.selectedEnemyId;
            const ring = isSelected ? `<div class="vc-enemy-selected-ring"></div>` : '';
            const hpColor = e.isBoss ? '#e74c3c' : e.typeId === 'armored' ? '#95a5a6' : e.typeId === 'fast' ? '#3498db' : e.typeId === 'healer' ? '#2ecc71' : e.typeId === 'ghost' ? '#9b59b6' : e.typeId === 'swarm' ? '#f39c12' : '#2ecc71';
            html += `<div class="vc-enemy${isSelected?' vc-enemy-focused':''}" data-eid="${e.id}" style="left:${e.x}px;top:${e.y}px;pointer-events:auto;cursor:pointer;">
                ${ring}${e.emoji||'👾'}
                <div class="vc-enemy-hp-bar"><div class="vc-enemy-hp-fill" style="width:${pct}%;background:${hpColor}"></div></div>
                ${e.armor>0?`<div class="vc-enemy-armor">🛡️${e.armor}</div>`:''}
            </div>`;
        });

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
                // Clear tile selection so bottom bar doesn't show stale gem stats
                this.tiles.forEach(t => t.classList.remove('selected'));
                this.selectedTile = null;
                this.renderBottomBar();
            });
        });

        this._updateEnemyStatWindow(engineState);

        if (eventMsg?.type === 'dmg') {
            const fl = document.createElement('div');
            fl.className = 'vc-float';
            fl.style.left = eventMsg.x + 'px';
            fl.style.top = eventMsg.y + 'px';
            fl.style.color = GEMS[eventMsg.color]?.color ?? '#fff';
            fl.textContent = eventMsg.amt;
            this.gridEl.appendChild(fl);
            setTimeout(() => fl.remove(), 800);
        } else if (eventMsg?.type === 'waveClear') {
            const fl = document.createElement('div');
            fl.className = 'vc-float';
            fl.style.cssText = 'left:50%;top:30px;transform:translateX(-50%);font-size:15px;color:#f1c40f;text-shadow:0 0 8px #f39c12,1px 1px 0 #000;';
            fl.textContent = `✨ Perfect Wave +${eventMsg.bonus} XP`;
            this.gridEl.appendChild(fl);
            setTimeout(() => fl.remove(), 1200);
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
        const effects =[];
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