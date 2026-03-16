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
            mana:       container.querySelector('#vc-val-mana'),
            manaBar:    container.querySelector('#vc-mana-bar-fill'),
            poolLevel:  container.querySelector('#vc-val-pool-level'),
            poolCap:    container.querySelector('#vc-val-pool-cap'),
            combo:      container.querySelector('#vc-val-combo'),
            comboMult:  container.querySelector('#vc-val-combo-mult'),
            comboWrap:  container.querySelector('#vc-combo-wrap'),
            comboInner: container.querySelector('#vc-combo-inner'),
            comboBar:   container.querySelector('#vc-combo-bar'),
            waves:      container.querySelector('.vc-wave-tracker')
        };

        setTimeout(() => {
            this.initGrid();
            this.initWaves();
            this.initZoom();
            this.initDragSwap();

            this.entitiesEl = document.createElement('div');
            this.entitiesEl.className = 'vc-entities';
            this.gridEl.appendChild(this.entitiesEl);

            // Stable layer for structures — rendered once per change, never
            // wiped every frame. This makes pointer/drag events work reliably.
            this.structuresEl = document.createElement('div');
            this.structuresEl.className = 'vc-entities';
            this.structuresEl.style.zIndex = '4'; // below enemies (z-index 6)
            this.gridEl.appendChild(this.structuresEl);

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

        // Layout: topbar (fixed) | map (flex:1, fills gap) | bottombar (fixed).
        // Tile size is calculated from FIXED known heights so browser zoom cannot
        // affect whether the bottom bar is visible — only how much map is shown.
        // Topbar row1+row2 = ~70px, bottombar = 150px (set in CSS as fixed height).
        const TOPBAR_H = 70;
        const BOTTOM_H = 200;
        const availH = Math.max(60, window.innerHeight - TOPBAR_H - BOTTOM_H);
        const availW = this.mapEl.clientWidth || window.innerWidth;

        // Tile size: fit entire grid into available space at zoom=1
        const tileByCols = Math.floor(availW / cols);
        const tileByRows = Math.floor(availH / rows);
        this.tileSize = Math.max(16, Math.min(tileByCols, tileByRows));

        // Map fills the flex gap — overflows/scrolls if grid > container
        this.mapEl.style.flex      = '1 1 0';
        this.mapEl.style.minHeight = '0';
        this.mapEl.style.maxHeight = '';
        this.mapEl.style.overflowX = 'auto';
        this.mapEl.style.overflowY = 'auto';

        // Grid natural size (zoom=1): exactly cols×rows tiles
        this.gridEl.style.width  = `${cols * this.tileSize}px`;
        this.gridEl.style.height = `${rows * this.tileSize}px`;
        this.gridEl.style.gridTemplateColumns = `repeat(${cols}, ${this.tileSize}px)`;
        this.gridEl.style.gridTemplateRows    = `repeat(${rows}, ${this.tileSize}px)`;
        this.gridEl.style.setProperty('--ts', `${this.tileSize}px`);

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
                zoomBtn.title = `Zoom ${pct}%`;
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
            <button id="vc-btn-start-wave" class="vc-icon-btn vc-wave-start-btn" title="Start next wave">▶</button>
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
                    this._showEnrageScreen(icon, i);
                }
            };
            this.waveIconsContainer.appendChild(icon);
        }
        this.activateNextWaveIcon(0);
    }

    initDragSwap() {
        console.log('[DRAG] initDragSwap called');
        this._dragGhost = document.createElement('div');
        this._dragGhost.id = 'vc-drag-ghost';
        this._dragGhost.style.cssText = [
            'position:fixed','pointer-events:none','z-index:9999',
            'display:none','align-items:center','justify-content:center',
            'width:36px','height:36px','border-radius:50%',
            'border:2px solid rgba(255,255,255,0.8)',
            'box-shadow:0 0 12px rgba(0,0,0,0.6)',
            'font-size:14px','font-weight:bold','color:#fff',
            'transform:translate(-50%,-50%)'
        ].join(';');
        document.body.appendChild(this._dragGhost);
        this._dragSource = null;
        console.log('[DRAG] ghost element created and appended to body');

        document.addEventListener('pointermove', (e) => {
            if (!this._dragSource) return;
            e.preventDefault();
            this._dragGhost.style.left = e.clientX + 'px';
            this._dragGhost.style.top  = e.clientY + 'px';
            this.tiles.forEach(t => t.classList.remove('vc-drag-over'));
            const rect = this.gridEl.getBoundingClientRect();
            const zoom = this._zoom || 1;
            const tc = Math.floor((e.clientX - rect.left) / zoom / this.tileSize);
            const tr = Math.floor((e.clientY - rect.top)  / zoom / this.tileSize);
            const idx = tr * this.engine.map.cols + tc;
            if (this.tiles[idx]) this.tiles[idx].classList.add('vc-drag-over');
        }, { passive: false });

        document.addEventListener('pointerup', (e) => {
            if (!this._dragSource) return;
            console.log('[DRAG] pointerup — releasing drag', e.clientX, e.clientY);
            this._dragGhost.style.display = 'none';
            this.tiles.forEach(t => t.classList.remove('vc-drag-over'));
            const rect = this.gridEl.getBoundingClientRect();
            const zoom = this._zoom || 1;
            const tc = Math.floor((e.clientX - rect.left) / zoom / this.tileSize);
            const tr = Math.floor((e.clientY - rect.top)  / zoom / this.tileSize);
            if (tr >= 0 && tc >= 0 && tr < this.engine.map.rows && tc < this.engine.map.cols) {
                const tx = tc * this.tileSize + this.tileSize / 2;
                const ty = tr * this.tileSize + this.tileSize / 2;
                const src = this._dragSource.structRef;
                const target = this.engine.structures.find(s => s.x === tx && s.y === ty);
                console.log('[DRAG] drop target:', target ? `${target.type} at ${tx},${ty}` : 'none');
                if (target && target !== src) {
                    const tmp = target.gem;
                    target.gem = src.gem;
                    src.gem = tmp;
                    if (this.selectedTile?.structRef === src || this.selectedTile?.structRef === target)
                        this.renderBottomBar();
                }
            }
            this._dragSource = null;
        });

        document.addEventListener('pointercancel', () => {
            if (!this._dragSource) return;
            console.log('[DRAG] pointercancel — aborting drag');
            this._dragSource = null;
            this._dragGhost.style.display = 'none';
            this.tiles.forEach(t => t.classList.remove('vc-drag-over'));
        });

        this._attachDragToStructure = (div, stRef) => {
            div.style.cursor = 'grab';
            div.addEventListener('pointerdown', (e) => {
                const live = this.engine.structures.find(s => `${s.x},${s.y}` === div.dataset.skey);
                if (!live?.gem) return;
                e.preventDefault();
                e.stopPropagation();
                this._dragSource = { structRef: live };
                this._dragGhost.style.background = GEMS[live.gem.color]?.color || '#888';
                this._dragGhost.textContent = live.gem.level;
                this._dragGhost.style.left = e.clientX + 'px';
                this._dragGhost.style.top  = e.clientY + 'px';
                this._dragGhost.style.display = 'flex';
                console.log('[DRAG] pointerdown on structure — THIS SHOULD NOT FIRE (old path)');
            });
        };
    }

    activateNextWaveIcon(idx) {
        if (idx < this.waveIconsContainer.children.length) {
            const icon = this.waveIconsContainer.children[idx];
            icon.classList.add('active');
            // Scroll so the newly active icon is visible (handles row overflow)
            icon.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }

    // Persist last gem picker selections across vocab failures and successful builds
    _lastPickedColor = 'red';
    _lastPickedLevel = 1;

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
            const m = Math.floor(this.engine.state.mana);
            const abbr = m >= 1e9 ? (m/1e9).toFixed(1)+'B' : m >= 1e6 ? (m/1e6).toFixed(1)+'M' : m >= 1e4 ? (m/1e3).toFixed(0)+'K' : m >= 1e3 ? (m/1e3).toFixed(1)+'K' : String(m);
            this.topBar.mana.textContent = abbr;
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
        // Restore last selection so vocab failures and successful builds keep state
        let selectedColor = this._lastPickedColor || 'red';
        let selectedLevel = this._lastPickedLevel || 1;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%; display:flex; flex-direction:column; gap:6px; align-items:center;';

        const diamondRow = document.createElement('div');
        diamondRow.style.cssText = 'display:flex; gap:10px; justify-content:center; align-items:center;';

        const gemColors = Object.entries(GEMS);

        // Compute sliding 7-level window anchored to highest affordable level
        const _computeSliderWindow = () => {
            const mana = this.engine.state.mana;
            let maxAffordable = 1;
            for (let lv = 1; lv <= 30; lv++) {
                if (gemTotalCostColor(selectedColor, lv, skills) <= mana) maxAffordable = lv;
                else break;
            }
            const winMax = Math.max(7, maxAffordable);
            const winMin = Math.max(1, winMax - 6);
            return { winMin, winMax: winMin + 6 };
        };

        const updatePriceLabel = () => {
            const cost = gemTotalCostColor(selectedColor, selectedLevel, skills);
            const canAfford = this.engine.state.mana >= cost;
            priceLabel.textContent = `${GEMS[selectedColor].label} Lv.${selectedLevel} — ${cost} 💧`;
            priceLabel.style.color = canAfford ? '#2ecc71' : '#e74c3c';
            confirmBtn.disabled = !canAfford;
            confirmBtn.dataset.manaCost = cost;
            // Update slider window each time mana or color changes
            const { winMin, winMax } = _computeSliderWindow();
            slider.min = winMin;
            slider.max = winMax;
            if (selectedLevel < winMin) { selectedLevel = winMin; slider.value = winMin; }
            if (selectedLevel > winMax) { selectedLevel = winMax; slider.value = winMax; }
            sliderLabel.textContent = `Lv ${winMin}–${winMax}`;
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
            this._lastPickedColor = selectedColor;
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
        sliderLabel.style.cssText = 'font-size:11px; color:#bdc3c7; white-space:nowrap; min-width:56px;';
        sliderLabel.textContent = 'Lv';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = 1; slider.max = 7; slider.value = selectedLevel;
        slider.style.cssText = 'flex:1; accent-color:#f1c40f; cursor:pointer;';
        slider.oninput = () => {
            selectedLevel = +slider.value;
            this._lastPickedLevel = selectedLevel;
            updatePriceLabel();
        };
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
            this._lastPickedColor = selectedColor;
            this._lastPickedLevel = selectedLevel;
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

        const poolMult  = this.engine.buffs?.poolMult || 1;
        const comboMult = this.engine.buffs?.dmgMult  || 1;
        const dmg = gemDamage(gem, gemDef, this.engine.meta.skills) * poolMult * comboMult;
        const speed = gemFireSpeed(gem, gemDef, this.engine.meta.skills);
        const range = gemRange(gem, isTrap, this.tileSize);

        // Accurate trap multipliers for the UI display
        const trapDmgMult = isTrap ? 0.20 + ((this.engine.meta.skills.trapSpecialty || 0) * 0.01) : 1;
        const trapSpecMult = isTrap ? 2.5 + ((this.engine.meta.skills.trapSpecialty || 0) * 0.1) : 1;
        const trapFireMult = isTrap ? 3.0 + ((this.engine.meta.skills.trapSpecialty || 0) * 0.02) : 1;

        const poolLevelDisp = this.engine.state.poolLevel > 1 ? ` ×${poolMult.toFixed(2)}🌊` : '';
        const stats =[
            { icon: '🏹', label: 'Range',  val: range + 'px' },
            { icon: '⚡', label: 'Fire',   val: (speed * trapFireMult).toFixed(2) + '/s' },
            { icon: '⚔️', label: 'Damage', val: Math.max(1, Math.floor(dmg * trapDmgMult)) + poolLevelDisp + (isTrap ? ' (Trap)' : '') },
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
            specialStatHtml += `<div class="vc-stat-panel-row"><span>💧 Mana leeched</span><span id="vc-live-manaLeeched">${Math.floor(sts.manaLeeched)}</span></div>`;
        } else if (gemDef.type === 'slow') {
            specialStatHtml += `<div class="vc-stat-panel-row"><span>❄️ Enemies slowed</span><span id="vc-live-slowApplied">${sts.slowApplied}</span></div>`;
        } else if (gemDef.type === 'poison') {
            specialStatHtml += `<div class="vc-stat-panel-row"><span>☠️ Poison dmg dealt</span><span id="vc-live-poisonDealt">${Math.floor(sts.poisonDealt)}</span></div>`;
        } else if (gemDef.type === 'armor') {
            specialStatHtml += `<div class="vc-stat-panel-row"><span>🛡️ Armor torn off</span><span id="vc-live-armorTorn">${sts.armorTorn.toFixed(1)}</span></div>`;
        } else if (gemDef.type === 'crit') {
            specialStatHtml += `<div class="vc-stat-panel-row"><span>💥 Critical hits</span><span id="vc-live-critHits">${sts.critHits}</span></div>`;
        }

        const nextGem = { color: gem.color, level: lvl + 1 };
        const nextDmg = gemDamage(nextGem, gemDef, this.engine.meta.skills) * poolMult;
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

    _enrageCost(level) {
        // Same formula as gem combine cost: Lv1=60, Lv2=360, Lv3=960...
        let cost = 60;
        for (let l = 1; l < level; l++) cost = 2 * cost + 240;
        return cost;
    }

    _showEnrageScreen(icon, waveIdx) {
        // Remove stale screen
        const stale = this.container.querySelector('#vc-enrage-screen');
        if (stale) stale.remove();

        const screen = document.createElement('div');
        screen.id = 'vc-enrage-screen';
        screen.style.cssText = [
            'position:fixed','inset:0','background:rgba(26,37,47,0.97)',
            'z-index:300','display:flex','flex-direction:column',
            'padding:16px 16px 0','gap:10px','overflow-y:auto',
            '-webkit-overflow-scrolling:touch'
        ].join(';');

        let selectedLevel = 1;
        const MAX_LEVEL = 20;

        const render = () => {
            const cost = this._enrageCost(selectedLevel);
            const canAfford = this.engine.state.mana >= cost;
            const numCards = Math.max(1, Math.round(Math.sqrt(selectedLevel)));
            const enrageMult = (1 + selectedLevel * 0.1).toFixed(1);

            screen.innerHTML = `
                <div style="font-size:18px;font-weight:bold;color:#e74c3c;text-align:center;">⚡ Enrage Wave</div>
                <div style="font-size:11px;color:#bdc3c7;text-align:center;line-height:1.5;">
                    Spend mana to enrage the next wave. Enraged enemies have boosted HP &amp; speed.<br>
                    Answer more correct than wrong to succeed.
                </div>

                <div style="display:flex;flex-direction:column;gap:6px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:12px;color:#bdc3c7;">Enrage Level: <strong style="color:#e74c3c;font-size:16px;">${selectedLevel}</strong></span>
                        <span style="font-size:12px;color:#bdc3c7;">${numCards} vocab card${numCards>1?'s':''}</span>
                    </div>
                    <input type="range" id="vc-enrage-slider" min="1" max="${MAX_LEVEL}" value="${selectedLevel}"
                        style="width:100%;accent-color:#e74c3c;">
                    <div style="display:flex;justify-content:space-between;font-size:10px;color:#7f8c8d;">
                        <span>Lv1 — 60💧</span><span>Lv10 — 153K💧</span><span>Lv20 — 157M💧</span>
                    </div>
                </div>

                <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                    <div style="background:#2c3e50;border-radius:8px;padding:10px 16px;text-align:center;min-width:80px;">
                        <div style="font-size:10px;color:#7f8c8d;">Cost</div>
                        <div style="font-size:14px;font-weight:bold;color:${canAfford?'#f1c40f':'#e74c3c'};">${cost>=1e6?(cost/1e6).toFixed(1)+'M':cost>=1e3?(cost/1e3).toFixed(1)+'K':cost}💧</div>
                    </div>
                    <div style="background:#2c3e50;border-radius:8px;padding:10px 16px;text-align:center;min-width:80px;">
                        <div style="font-size:10px;color:#7f8c8d;">HP ×</div>
                        <div style="font-size:14px;font-weight:bold;color:#e74c3c;">${enrageMult}×</div>
                    </div>
                    <div style="background:#2c3e50;border-radius:8px;padding:10px 16px;text-align:center;min-width:80px;">
                        <div style="font-size:10px;color:#7f8c8d;">Vocab</div>
                        <div style="font-size:14px;font-weight:bold;color:#3498db;">${numCards} card${numCards>1?'s':''}</div>
                    </div>
                    <div style="background:#2c3e50;border-radius:8px;padding:10px 16px;text-align:center;min-width:80px;">
                        <div style="font-size:10px;color:#7f8c8d;">Your mana</div>
                        <div style="font-size:14px;font-weight:bold;color:${canAfford?'#2ecc71':'#e74c3c'};">${Math.floor(this.engine.state.mana)>=1e6?(Math.floor(this.engine.state.mana)/1e6).toFixed(1)+'M':Math.floor(this.engine.state.mana)>=1e3?(Math.floor(this.engine.state.mana)/1e3).toFixed(1)+'K':Math.floor(this.engine.state.mana)}💧</div>
                    </div>
                </div>

                <div style="flex:1;"></div>

                <div style="display:flex;gap:10px;padding-bottom:max(20px,env(safe-area-inset-bottom,20px));">
                    <button id="vc-enrage-cancel" style="flex:1;padding:14px;background:#34495e;border:2px solid #7f8c8d;border-radius:8px;color:white;font-weight:bold;font-size:15px;cursor:pointer;">✕ Cancel</button>
                    <button id="vc-enrage-go" style="flex:2;padding:14px;background:${canAfford?'#e74c3c':'#555'};border:2px solid ${canAfford?'#c0392b':'#444'};border-radius:8px;color:white;font-weight:bold;font-size:15px;cursor:pointer;${canAfford?'':'opacity:0.5;'}"
                        ${canAfford?'':'disabled'}>⚡ Enrage!</button>
                </div>
            `;

            screen.querySelector('#vc-enrage-slider').oninput = (e) => {
                selectedLevel = parseInt(e.target.value);
                render();
            };

            screen.querySelector('#vc-enrage-cancel').onclick = () => {
                screen.remove();
                // Spawn wave without enrage
                this.engine.spawnWave(false);
                this._flashPathTiles();
                icon.classList.remove('active'); icon.classList.add('done');
                this.activateNextWaveIcon(waveIdx + 1);
                this.engine.resume();
            };

            if (canAfford) {
                screen.querySelector('#vc-enrage-go').onclick = () => {
                    screen.remove();
                    this.engine.state.mana -= this._enrageCost(selectedLevel);
                    this._runEnrageVocab(selectedLevel, icon, waveIdx);
                };
            }
        };

        render();
        document.body.appendChild(screen);
    }

    _runEnrageVocab(enrageLevel, icon, waveIdx) {
        const numCards = Math.max(1, Math.round(Math.sqrt(enrageLevel)));
        let correct = 0, wrong = 0, remaining = numCards;

        const onCard = (isCorrect) => {
            if (isCorrect) correct++; else wrong++;
            remaining--;
            if (remaining > 0) {
                // Show next card
                this.vocab.showCard('enrage', onCard);
            } else {
                // Majority correct = enrage succeeds
                const success = correct > wrong;
                if (success) icon.classList.add('enraged');
                // Pass enrageLevel to spawnWave for scaled HP/speed
                this.engine.spawnWave(success, enrageLevel);
                this._flashPathTiles();
                icon.classList.remove('active'); icon.classList.add('done');
                this.activateNextWaveIcon(waveIdx + 1);
                this.engine.resume();
            }
        };

        this.vocab.showCard('enrage', onCard);
    }

    handleVocabAction(manaCost, onSuccess) {
        this.engine.pause();
        this.vocab.showCard('review', (isCorrect) => {
            if (isCorrect) {
                this.engine.state.mana -= manaCost;
                onSuccess();
            } else {
                this.engine.state.mana = Math.max(0, this.engine.state.mana - CONSTANTS.vocabPenalty);
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
        // Abbreviate large numbers so the topbar never wraps: 1234 → 1.2K, 1234567 → 1.2M
        const _abbr = (n) => {
            if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
            if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
            if (n >= 1e4) return (n / 1e3).toFixed(0) + 'K';   // 10K+ → no decimal
            if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
            return String(n);
        };

        const manaVal  = Math.max(0, Math.floor(engineState.state.mana));
        const poolCap  = engineState.state.poolCap  || manaVal || 1;
        const poolLevel= engineState.state.poolLevel || 1;
        // Bar shows mana vs poolCap — fills up to level-up, meaningful at all times
        const manaPct  = Math.max(0, Math.min(100, (manaVal / poolCap) * 100));
        this.topBar.mana.textContent = _abbr(manaVal);
        if (this.topBar.manaBar) {
            this.topBar.manaBar.style.width = manaPct + '%';
            // Colour: danger red when low absolute mana, otherwise gold→green as pool fills
            const absPct = manaVal / (engineState.state.poolCap || 300);
            this.topBar.manaBar.style.background =
                absPct < 0.15 ? '#e74c3c' :
                absPct < 0.35 ? '#f39c12' :
                manaPct > 80  ? '#2ecc71' : '#f1c40f';
        }
        if (this.topBar.poolLevel) {
            this.topBar.poolLevel.textContent = poolLevel;
        }
        if (this.topBar.poolCap) {
            this.topBar.poolCap.textContent = _abbr(poolCap);
        }
        // Combo display: "COMBO / 1000 (×2.38)"
        const combo = engineState.state.combo || 0;
        if (this.topBar.combo) this.topBar.combo.textContent = combo;
        if (this.topBar.comboWrap) {
            this.topBar.comboWrap.style.visibility = combo > 0 ? 'visible' : 'hidden';
            this.topBar.comboWrap.style.opacity = combo > 0 ? '1' : '0';
        }
        if (combo > 0) {
            const divisor = Math.max(1, 5 - ((engineState.meta?.skills?.scholarGrace || 0) * 0.1));
            const mult = (1 + Math.log(combo) / divisor).toFixed(2);
            if (this.topBar.comboMult) this.topBar.comboMult.textContent = `(×${mult})`;
            const col = combo >= 100 ? '#ecf0f1' : combo >= 25 ? '#f1c40f' : '#e67e22';
            if (this.topBar.comboInner) this.topBar.comboInner.style.color = col;
            // Decay bar: full = just killed, empty = about to reset
            if (this.topBar.comboBar) {
                const timer = engineState.state.comboDecayTimer || 0;
                const pct = Math.max(0, Math.min(100, (1 - timer / 5) * 100));
                this.topBar.comboBar.style.width = pct + '%';
                this.topBar.comboBar.style.background = pct > 60 ? '#2ecc71' : pct > 30 ? '#f39c12' : '#e74c3c';
            }
        } else if (this.topBar.comboBar) {
            // Reset bar to full when combo is 0 so it's ready for next streak
            this.topBar.comboBar.style.width = '100%';
            this.topBar.comboBar.style.background = '#e67e22';
        }
        const manaEl = this.topBar.mana?.parentElement?.parentElement;
        if (manaEl) manaEl.classList.toggle('vc-mana-danger', manaVal / poolCap < 0.15);

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

        // --- Structures: render into stable DOM layer (not innerHTML-wiped every frame)
        // so that pointerdown/drag events survive across frames.
        if (this.structuresEl) {
            this._renderStructures(engineState.structures);
        }

        engineState.enemies.forEach(e => {
            const pct = (e.hp / e.maxHp) * 100;
            const isSelected = e.id === this.selectedEnemyId;
            const ring = isSelected ? `<div class="vc-enemy-selected-ring"></div>` : '';
            const hpColor = e.isBoss ? '#e74c3c' : e.typeId === 'armored' ? '#95a5a6' : e.typeId === 'fast' ? '#3498db' : e.typeId === 'healer' ? '#2ecc71' : e.typeId === 'ghost' ? '#9b59b6' : e.typeId === 'swarm' ? '#f39c12' : '#2ecc71';

            // Status icons — shown under HP bar. No CSS filter tinting (unreliable on emoji).
            // Flash: drop-shadow only (no hue shift) for crit=yellow, armor=purple.
            const fx = e.effects || {};
            let flashStyle = '';
            if (fx.flashTimer > 0 && fx.flashColor) {
                flashStyle = fx.flashColor === 'crit'
                    ? 'filter:drop-shadow(0 0 6px #f1c40f);'
                    : 'filter:drop-shadow(0 0 6px #9b59b6);';
            }
            const statusIcons = (fx.slow > 0 ? '<span class="vc-fx-icon">❄️</span>' : '')
                              + (fx.poison > 0 ? '<span class="vc-fx-icon">☠️</span>' : '');

            html += `<div class="vc-enemy${isSelected?' vc-enemy-focused':''}" data-eid="${e.id}" style="left:${e.x}px;top:${e.y}px;pointer-events:auto;cursor:pointer;${flashStyle}">
                ${ring}${e.emoji||'👾'}
                <div class="vc-enemy-hp-bar"><div class="vc-enemy-hp-fill" style="width:${pct}%;background:${hpColor}"></div></div>
                ${statusIcons ? `<div class="vc-fx-icons">${statusIcons}</div>` : ''}
                ${e.armor>0?`<div class="vc-enemy-armor">🛡️${Math.round(e.armor)}</div>`:''}
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
        } else if (eventMsg?.type === 'poolLevelUp') {
            const bar = this.topBar.manaBar;
            if (bar) {
                bar.style.transition = 'none';
                bar.style.background = '#fff';
                setTimeout(() => { bar.style.transition = 'width 0.2s, background 0.3s'; }, 80);
            }
            const fl = document.createElement('div');
            fl.className = 'vc-float';
            fl.style.cssText = 'left:50%;top:20px;transform:translateX(-50%);font-size:14px;color:#f1c40f;text-shadow:0 0 8px #f39c12,1px 1px 0 #000;white-space:nowrap;';
            fl.textContent = `✨ Pool Lv${eventMsg.level} — gems +${(eventMsg.level-1)*5}%`;
            this.gridEl.appendChild(fl);
            setTimeout(() => fl.remove(), 1400);
        } else if (eventMsg?.type === 'manaLeak') {
            const fl = document.createElement('div');
            fl.className = 'vc-float';
            fl.style.left = (eventMsg.x || 50) + 'px';
            fl.style.top  = (eventMsg.y || 50) + 'px';
            fl.style.color = '#e74c3c';
            fl.style.fontSize = '14px';
            fl.textContent = '-' + eventMsg.amt + '💧';
            this.gridEl.appendChild(fl);
            setTimeout(() => fl.remove(), 900);
        } else if (eventMsg?.type === 'waveClear') {
            const fl = document.createElement('div');
            fl.className = 'vc-float';
            fl.style.cssText = 'left:50%;top:30px;transform:translateX(-50%);font-size:15px;color:#f1c40f;text-shadow:0 0 8px #f39c12,1px 1px 0 #000;';
            fl.textContent = `✨ Perfect Wave +${eventMsg.bonus} XP`;
            this.gridEl.appendChild(fl);
            setTimeout(() => fl.remove(), 1200);
        } else if (eventMsg?.type === 'earlyCall') {
            const fl = document.createElement('div');
            fl.className = 'vc-float';
            fl.style.cssText = 'left:50%;top:48px;transform:translateX(-50%);font-size:14px;color:#2ecc71;text-shadow:0 0 8px #27ae60,1px 1px 0 #000;white-space:nowrap;';
            fl.textContent = `⚡ Early Call +${eventMsg.bonus} 💧`;
            this.gridEl.appendChild(fl);
            setTimeout(() => fl.remove(), 1400);
        }
    }

    // Render structures into a stable DOM layer — elements are reused across frames
    // so pointer capture and drag events survive. Only updates what visually changed.
    _renderStructures(structures) {
        const el = this.structuresEl;
        const ts = this.tileSize;
        if (!el) { console.warn('[DRAG] _renderStructures: structuresEl is null!'); return; }
        if (el.children.length !== structures.length) {
            console.log('[DRAG] _renderStructures: count changed →', structures.length, 'DOM children was:', el.children.length);
        }

        // Build a key→existing-element map from current DOM children
        const existing = new Map();
        for (const child of el.children) {
            existing.set(child.dataset.skey, child);
        }

        const seen = new Set();

        for (const st of structures) {
            const isTower = st.type === 'tower';
            const key = `${st.x},${st.y}`;
            seen.add(key);

            const gemKey = st.gem ? `${st.gem.color}:${st.gem.level}` : 'empty';
            const fullKey = `${key}|${st.type}|${gemKey}`;

            let div = existing.get(key);
            if (!div) {
                div = document.createElement('div');
                div.dataset.skey = key;
                div.style.position = 'absolute';
                div.style.left  = `${st.x - ts/2}px`;
                div.style.top   = `${st.y - ts/2}px`;
                div.style.width  = `${ts}px`;
                div.style.height = `${ts}px`;
                el.appendChild(div);
                console.log('[DRAG] new structure element created at key:', key, 'type:', st.type);
                // Attach drag listener once — looks up live struct at event time
                div.addEventListener('pointerdown', (e) => {
                    console.log('[DRAG] pointerdown fired on structure div, skey:', div.dataset.skey, 'e.target:', e.target.className, 'e.target.tagName:', e.target.tagName);
                    const live = this.engine.structures.find(s => `${s.x},${s.y}` === div.dataset.skey);
                    console.log('[DRAG] live struct found:', live ? `${live.type} gem:${live.gem?.color}` : 'NOT FOUND');
                    if (!live?.gem) {
                        console.log('[DRAG] no gem on struct — aborting drag');
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    this._dragSource = { structRef: live };
                    this._dragGhost.style.background = GEMS[live.gem.color]?.color || '#888';
                    this._dragGhost.textContent = live.gem.level;
                    this._dragGhost.style.left = e.clientX + 'px';
                    this._dragGhost.style.top  = e.clientY + 'px';
                    this._dragGhost.style.display = 'flex';
                    console.log('[DRAG] drag started! gem:', live.gem.color, 'lv', live.gem.level, 'ghost display:', this._dragGhost.style.display);
                });
            }

            // Only update innerHTML when something actually changed
            if (div.dataset.fullKey !== fullKey) {
                div.dataset.fullKey = fullKey;
                div.className = `vc-structure ${isTower ? 'vc-tower' : 'vc-trap'}`;
                div.style.left   = `${st.x - ts/2}px`;
                div.style.top    = `${st.y - ts/2}px`;
                div.style.width  = `${ts}px`;
                div.style.height = `${ts}px`;
                div.innerHTML = st.gem
                    ? `<div class="vc-gem" style="background:${GEMS[st.gem.color].color}">${st.gem.level}</div>`
                    : `<div style="opacity:0.45;line-height:1;">${isTower ? '🏰' : '⚙️'}</div>`;
            }
        }

        // Remove stale elements (structure was sold/destroyed)
        for (const [key, child] of existing) {
            if (!seen.has(key)) child.remove();
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