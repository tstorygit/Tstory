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

            // Re-layout on resize or orientation change (debounced 150ms)
            let _resizeTimer = null;
            this._onResize = () => {
                clearTimeout(_resizeTimer);
                _resizeTimer = setTimeout(() => {
                    this._lastVw = 0; this._lastVh = 0; // force recalc
                    this._bottomBarH = 0; // re-measure for new screen size
                    this.initGrid();
                    this._baseMakerKeys = null;
                    this._placeMapMarkers?.();
                    this.engine.map.waypointSets = getWaypointsForPaths(this.engine.map.paths, this.tileSize);
                    this.engine.tileSize = this.tileSize;
                }, 150);
            };
            window.addEventListener('resize', this._onResize);
            window.addEventListener('orientationchange', this._onResize);

            this.entitiesEl = document.createElement('div');
            this.entitiesEl.className = 'vc-entities';
            this.gridEl.appendChild(this.entitiesEl);

            // Stable layer for structures — rendered once per change, never
            // wiped every frame. This makes pointer/drag events work reliably.
            this.structuresEl = document.createElement('div');
            this.structuresEl.className = 'vc-entities';
            this.structuresEl.style.zIndex = '4';
            this.structuresEl.style.pointerEvents = 'none'; // layer itself transparent
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

            // FPS counter — fixed top-left, always above everything
            this._fpsEl = document.createElement('div');
            this._fpsEl.style.cssText = [
                'position:fixed', 'top:4px', 'left:4px',
                'z-index:99999', 'pointer-events:none',
                'font:bold 11px/1 monospace', 'color:#0f0',
                'text-shadow:0 0 4px #000, 1px 1px 0 #000',
                'opacity:0.85'
            ].join(';');
            this._fpsEl.textContent = 'FPS: --';
            document.body.appendChild(this._fpsEl);
            this._fpsFrames = 0;
            this._fpsLastTime = performance.now();

            if (onReady) onReady();
        }, 10);
    }

    initGrid() {
        const { cols, rows, grid } = this.engine.map;

        const SIDEBAR_W = 240;
        const TILE_MAX  = 52;

        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Measure actual topbar height — both rows — instead of hardcoding 70px.
        // On wide screens (2440px+) the topbar rows can wrap, making the real
        // height larger and causing the grid/enemies to render off-screen.
        const row1 = this.container.querySelector('.vc-topbar-row1');
        const row2 = this.container.querySelector('.vc-topbar-row2');
        const TOPBAR_H = Math.max(
            70,
            (row1 ? row1.getBoundingClientRect().height : 0) +
            (row2 ? row2.getBoundingClientRect().height : 0)
        );

        // Skip if nothing changed
        if (this._lastVw === vw && this._lastVh === vh && this.tileSize > 0) return;
        this._lastVw = vw;
        this._lastVh = vh;

        const isLandscape = vw > vh && vw >= 600;
        this.isLandscape = isLandscape;

        const root = this.container.closest('.vc-root') || this.container;
        root.classList.toggle('vc-layout-landscape', isLandscape);
        root.classList.toggle('vc-layout-portrait',  !isLandscape);

        // Tile size ignores the bottom UI entirely.
        // The bottom UI overlays on top of the map — never pushes it.
        // Add tile padding so the grid has breathing room and the bottom
        // 3 tiles stay visible even when the UI panel is open.
        const PAD_SIDES = 0.5; // padding tiles: top / left / right
        const PAD_BOT   = 4.5;   // padding tiles: bottom (keeps exit visible under UI)

        let availW, availH;
        if (isLandscape) {
            availW = vw - SIDEBAR_W;
            availH = vh - TOPBAR_H;
        } else {
            availW = vw;
            availH = vh - TOPBAR_H; // full height — bottom UI overlays, never shifts map
        }

        const tileByCols = Math.floor(availW / (cols + PAD_SIDES * 2));
        const tileByRows = Math.floor(availH / (rows + PAD_SIDES + PAD_BOT));
        this.tileSize = Math.max(16, Math.min(TILE_MAX, tileByCols, tileByRows));

        // Map container — centered, no scroll, bottom padding keeps exit clear
        this.mapEl.style.flex           = '1 1 0';
        this.mapEl.style.minHeight      = '0';
        this.mapEl.style.minWidth       = '0';
        this.mapEl.style.overflow       = 'hidden';
        this.mapEl.style.display        = 'flex';
        this.mapEl.style.alignItems     = 'flex-start';
        this.mapEl.style.justifyContent = 'center';
        this.mapEl.style.paddingTop     = `${this.tileSize * PAD_SIDES}px`;
        this.mapEl.style.paddingBottom  = `${this.tileSize * PAD_BOT}px`;

        // Grid
        this.gridEl.style.width  = `${cols * this.tileSize}px`;
        this.gridEl.style.height = `${rows * this.tileSize}px`;
        this.gridEl.style.gridTemplateColumns = `repeat(${cols}, ${this.tileSize}px)`;
        this.gridEl.style.gridTemplateRows    = `repeat(${rows}, ${this.tileSize}px)`;
        this.gridEl.style.setProperty('--ts', `${this.tileSize}px`);

        this.tiles =[];
        // Fix #1 & #3: Clear per-frame keyed maps and drag state on grid reinit —
        // old DOM elements were removed when the grid was rebuilt above.
        this._enemyElMap     = new Map();
        this._projElMap      = new Map();
        this._rangeIndicatorEl = null;
        this._dragOverTile   = null;
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

    destroy() {
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            window.removeEventListener('orientationchange', this._onResize);
            this._onResize = null;
        }
        if (this._dragGhost) {
            this._dragGhost.remove();
            this._dragGhost = null;
        }
        if (this._fpsEl) {
            this._fpsEl.remove();
            this._fpsEl = null;
        }
    }

    initDragSwap() {
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
        this._dragSource = null;   // set once threshold crossed — ghost is live
        this._dragPending = null;  // set on pointerdown — waiting for threshold

        // Single global pointermove: upgrades pending→active on threshold, moves ghost
        document.addEventListener('pointermove', (e) => {
            // Prevent scroll as soon as a drag candidate exists — critical on mobile.
            // Without this the browser fires pointercancel before threshold is reached.
            if (this._dragPending || this._dragSource) e.preventDefault();

            if (this._dragPending && !this._dragSource) {
                const dist = Math.hypot(e.clientX - this._dragPending.startX, e.clientY - this._dragPending.startY);
                if (dist >= 4) {
                    // Crossed threshold — commit to drag
                    const live = this._dragPending.live;
                    this._dragSource = { structRef: live };
                    this._dragGhost.style.background = GEMS[live.gem.color]?.color || '#888';
                    this._dragGhost.textContent = live.gem.level;
                    this._dragGhost.style.display = 'flex';
                }
            }
            if (!this._dragSource) return;
            this._dragGhost.style.left = e.clientX + 'px';
            this._dragGhost.style.top  = e.clientY + 'px';
            // Fix #3: track single hovered tile instead of iterating all tiles
            const rect = this.gridEl.getBoundingClientRect();
            const zoom = this._zoom || 1;
            const tc = Math.floor((e.clientX - rect.left) / zoom / this.tileSize);
            const tr = Math.floor((e.clientY - rect.top)  / zoom / this.tileSize);
            const idx = tr * this.engine.map.cols + tc;
            const newHover = this.tiles[idx] || null;
            if (newHover !== this._dragOverTile) {
                if (this._dragOverTile) this._dragOverTile.classList.remove('vc-drag-over');
                this._dragOverTile = newHover;
                if (this._dragOverTile) this._dragOverTile.classList.add('vc-drag-over');
            }
        }, { passive: false });

        // Single global pointerup: performs swap if drag was active, else tap-selects
        document.addEventListener('pointerup', (e) => {
            // Fix #3: clear only the single tracked hover tile
            if (this._dragOverTile) { this._dragOverTile.classList.remove('vc-drag-over'); this._dragOverTile = null; }
            if (this._dragSource) {
                // Drag was active — perform gem swap
                this._dragGhost.style.display = 'none';
                const rect = this.gridEl.getBoundingClientRect();
                const zoom = this._zoom || 1;
                const tc = Math.floor((e.clientX - rect.left) / zoom / this.tileSize);
                const tr = Math.floor((e.clientY - rect.top)  / zoom / this.tileSize);
                if (tr >= 0 && tc >= 0 && tr < this.engine.map.rows && tc < this.engine.map.cols) {
                    const tx = tc * this.tileSize + this.tileSize / 2;
                    const ty = tr * this.tileSize + this.tileSize / 2;
                    const src = this._dragSource.structRef;
                    const target = this.engine.structures.find(s => s.x === tx && s.y === ty);
                    if (target && target !== src) {
                        const tmp = target.gem;
                        target.gem = src.gem;
                        src.gem = tmp;
                        if (this.selectedTile?.structRef === src || this.selectedTile?.structRef === target)
                            this.renderBottomBar();
                    }
                }
                this._dragSource = null;
            } else if (this._dragPending) {
                // No drag — it was a tap, select the tile
                const live = this._dragPending.live;
                if (live) {
                    const ts = this.tileSize;
                    const r = live.r ?? Math.floor((live.y - ts / 2) / ts);
                    const cc = live.c ?? Math.floor((live.x - ts / 2) / ts);
                    const tileType = this.engine.map.grid[r]?.[cc];
                    if (tileType !== undefined) this.selectTile(r, cc, tileType);
                }
            }
            this._dragPending = null;
        });

        document.addEventListener('pointercancel', () => {
            this._dragSource = null;
            this._dragPending = null;
            this._dragGhost.style.display = 'none';
            // Fix #3: clear only the single tracked hover tile
            if (this._dragOverTile) { this._dragOverTile.classList.remove('vc-drag-over'); this._dragOverTile = null; }
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
        this._costButtons = []; // Perf fix 8: reset cached button list — rebuilt below
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
                    if (this.engine.addStructure(st.x, st.y, 'tower')) {
                        const s = this.engine.structures.find(s => s.x === st.x && s.y === st.y);
                        if (s) { s.r = st.r; s.c = st.c; }
                        this.selectTile(st.r, st.c, st.type);
                    }
                });
            } else if (st.type === TILE_PATH) {
                const pCost = this.engine.getBuildCost('trap');
                this.createBtn(`⚙️ Trap (${pCost})`, mana >= pCost, pCost, () => {
                    if (this.engine.addStructure(st.x, st.y, 'trap')) {
                        const s = this.engine.structures.find(s => s.x === st.x && s.y === st.y);
                        if (s) { s.r = st.r; s.c = st.c; }
                        this.selectTile(st.r, st.c, st.type);
                    }
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

        // Always show the clean final damage number. The ℹ️ icon is always
        // rendered so it's tappable even at pool P1 with no combo active.
        // When boosters are active the number turns green; the popover explains why.
        const baseDmgVal  = Math.max(1, Math.floor(gemDamage(gem, gemDef, this.engine.meta.skills) * trapDmgMult));
        const finalDmgVal = Math.max(1, Math.floor(dmg * trapDmgMult));
        const isBoosted   = poolMult > 1.001 || comboMult > 1.001;
        const tooltipParts = [`${baseDmgVal} base`];
        if (poolMult  > 1.001) tooltipParts.push(`×${poolMult.toFixed(2)} pool (P${this.engine.state.poolLevel})`);
        if (comboMult > 1.001) tooltipParts.push(`×${comboMult.toFixed(2)} combo`);
        const dmgTooltip  = tooltipParts.join(' ');
        const trapSuffix  = isTrap ? ' <span style="opacity:0.6;font-size:10px;">(Trap)</span>' : '';
        const dmgNumHtml  = isBoosted
            ? `<span style="color:#2ecc71;font-weight:bold;">${finalDmgVal}</span>`
            : `${finalDmgVal}`;
        const dmgDisplay  = dmgNumHtml +
            `<span data-dmg-tooltip="${dmgTooltip}" style="cursor:pointer;margin-left:4px;font-size:11px;opacity:0.7;">ℹ️</span>` +
            trapSuffix;

        // Max hit: crit ceiling for Citrine, normal hit for all others.
        const maxHitVal = Math.max(1, Math.floor(
            gemDef.type === 'crit' ? finalDmgVal * gemCritMult(gem) : finalDmgVal
        ));

        const stats = [
            { icon: '🏹', label: 'Range',   val: range + 'px' },
            { icon: '⚡', label: 'Fire',    val: (speed * trapFireMult).toFixed(2) + '/s' },
            { icon: '⚔️', label: 'Damage',  val: dmgDisplay },
            { icon: '🔝', label: 'Max hit', val: maxHitVal },
        ];

        switch (gemDef.type) {
            case 'crit':
                stats.push({ icon: '💥', label: `Crit (×${gemCritMult(gem).toFixed(1)})`, val: `${(gemCritChance(gem)*100).toFixed(0)}%` });
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

        // Delegate ℹ️ clicks on the bottomBar so the handler survives re-renders.
        // Only attach once — guard with a flag on the element.
        if (!this.bottomBar._dmgInfoDelegated) {
            this.bottomBar._dmgInfoDelegated = true;
            // Use capture phase — the bottomBar has a bubble-phase listener that calls
            // stopPropagation() on every click, which would kill this handler if we
            // also used the bubble phase. Capture fires before that listener.
            this.bottomBar.addEventListener('click', e => {
                const icon = e.target.closest('[data-dmg-tooltip]');
                if (!icon) return;
                e.stopPropagation();
                const existing = this.bottomBar.querySelector('.vc-dmg-popover');
                if (existing) { existing.remove(); if (existing._src === icon) return; }
                const pop = document.createElement('div');
                pop.className = 'vc-dmg-popover';
                pop._src = icon;
                pop.style.cssText = [
                    'background:#1a2d3d', 'border:1px solid #3498db', 'border-radius:6px',
                    'padding:6px 10px', 'font-size:11px', 'color:#bdc3c7',
                    'margin-top:4px', 'line-height:1.6'
                ].join(';');
                pop.textContent = icon.dataset.dmgTooltip;
                icon.closest('.vc-stat-panel-row').insertAdjacentElement('afterend', pop);
            }, true); // true = capture phase
        }

        const btnRow = document.createElement('div');
        btnRow.className = 'vc-stat-panel-btns';

        const upBtn = document.createElement('button');
        upBtn.className = 'vc-btn';
        upBtn.textContent = `▲ Lv.${lvl+1} (${cost} 💧)`;
        upBtn.disabled = mana < cost;
        upBtn.dataset.manaCost = cost;
        // Perf fix 8: register in cache so _refreshBottomBarButtons needs no DOM query
        if (!this._costButtons) this._costButtons = [];
        this._costButtons.push({ btn: upBtn, cost });
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
        if (cost != null) {
            btn.dataset.manaCost = cost;
            // Perf fix 8: push into cached list so _refreshBottomBarButtons needs no DOM query
            if (!this._costButtons) this._costButtons = [];
            this._costButtons.push({ btn, cost });
        }
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
        // Perf fix 8: iterate pre-cached button list — zero DOM queries at runtime
        if (this._costButtons) {
            for (const { btn, cost } of this._costButtons) {
                btn.disabled = mana < cost;
            }
        }
        if (this._gemPickerRefresh) this._gemPickerRefresh();
    }

    draw(engineState, eventMsg) {
        // FPS counter — averaged over 30 frames to stay readable
        if (this._fpsEl) {
            this._fpsFrames++;
            if (this._fpsFrames >= 30) {
                const now = performance.now();
                const fps = Math.round(this._fpsFrames / ((now - this._fpsLastTime) / 1000));
                this._fpsEl.textContent = `FPS: ${fps}`;
                this._fpsFrames = 0;
                this._fpsLastTime = now;
            }
        }

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

        // Fix #1: Keyed DOM diffing — reuse existing elements instead of
        // destroying and recreating the entire entity layer every frame.
        // This eliminates constant DOM churn, GC pressure, and listener re-attachment.

        // ── Range indicator ──────────────────────────────────────────────────
        // Manage a single reusable range-indicator element.
        if (!this._rangeIndicatorEl) {
            this._rangeIndicatorEl = document.createElement('div');
            this._rangeIndicatorEl.className = 'vc-range-indicator';
            this.entitiesEl.appendChild(this._rangeIndicatorEl);
        }
        const rangeEl = this._rangeIndicatorEl;
        if (this.selectedTile?.structRef) {
            const st = this.selectedTile.structRef;
            const radius = st.gem
                ? gemRange(st.gem, st.type === 'trap', this.tileSize)
                : (st.type === 'tower'
                    ? Math.floor(CONSTANTS.towerBaseRange * this.tileSize)
                    : Math.floor(CONSTANTS.trapBaseRange * this.tileSize));
            rangeEl.style.cssText = `position:absolute;left:${st.x-radius}px;top:${st.y-radius}px;width:${radius*2}px;height:${radius*2}px;display:block;`;
        } else {
            rangeEl.style.display = 'none';
        }

        // ── Structures layer (stable DOM, handled by _renderStructures) ──────
        if (this.structuresEl) {
            this._renderStructures(engineState.structures);
        }

        // ── Enemies: keyed diff ──────────────────────────────────────────────
        // Build a map of currently rendered enemy elements.
        if (!this._enemyElMap) this._enemyElMap = new Map();
        const enemyElMap = this._enemyElMap;

        // Mark all existing elements for potential removal.
        const toRemove = new Set(enemyElMap.keys());

        for (const e of engineState.enemies) {
            toRemove.delete(e.id); // still alive — keep it

            const pct = (e.hp / e.maxHp) * 100;
            const isSelected = e.id === this.selectedEnemyId;
            const fx = e.effects || {};

            let el = enemyElMap.get(e.id);
            if (!el) {
                // New enemy — create element once and attach click listener once.
                el = document.createElement('div');
                el.className = 'vc-enemy';
                el.dataset.eid = e.id;
                el.style.position = 'absolute';
                el.addEventListener('click', ev => {
                    ev.stopPropagation();
                    const eid = el.dataset.eid;
                    this.selectedEnemyId = (this.selectedEnemyId === eid) ? null : eid;
                    this.engine.selectedEnemyId = this.selectedEnemyId;
                    this.tiles.forEach(t => t.classList.remove('selected'));
                    this.selectedTile = null;
                    this.renderBottomBar();
                });

                // Build interior once (emoji + hp bar + status icons + armor).
                // Only the parts that change are patched per frame below.
                el._hpFill   = document.createElement('div');
                el._hpFill.className = 'vc-enemy-hp-fill';
                const hpBar  = document.createElement('div');
                hpBar.className = 'vc-enemy-hp-bar';
                hpBar.appendChild(el._hpFill);

                el._emojiNode = document.createTextNode(e.emoji || '👾');
                el._fxEl      = document.createElement('div');
                el._fxEl.className = 'vc-fx-icons';
                el._armorEl   = document.createElement('div');
                el._armorEl.className = 'vc-enemy-armor';
                el._ringEl    = document.createElement('div');
                el._ringEl.className = 'vc-enemy-selected-ring';

                el.appendChild(el._ringEl);
                el.appendChild(el._emojiNode);
                el.appendChild(hpBar);
                el.appendChild(el._fxEl);
                el.appendChild(el._armorEl);

                this.entitiesEl.appendChild(el);
                enemyElMap.set(e.id, el);
            }

            // ── Per-frame patches (only write to DOM when value changed) ──────
            el.style.left = e.x + 'px';
            el.style.top  = e.y + 'px';

            // Flash / focus class
            const wantFocused = isSelected;
            const hasFocused  = el.classList.contains('vc-enemy-focused');
            if (wantFocused !== hasFocused) el.classList.toggle('vc-enemy-focused', wantFocused);

            // Flash drop-shadow
            let flashStyle = '';
            if (fx.flashTimer > 0 && fx.flashColor) {
                flashStyle = fx.flashColor === 'crit'
                    ? 'filter:drop-shadow(0 0 6px #f1c40f);'
                    : 'filter:drop-shadow(0 0 6px #9b59b6);';
            }
            if (el._lastFlashStyle !== flashStyle) {
                el._lastFlashStyle = flashStyle;
                el.style.filter = flashStyle
                    ? (fx.flashColor === 'crit' ? 'drop-shadow(0 0 6px #f1c40f)' : 'drop-shadow(0 0 6px #9b59b6)')
                    : '';
            }

            // HP bar fill
            const hpColor = e.isBoss ? '#e74c3c' : e.typeId === 'armored' ? '#95a5a6' : e.typeId === 'fast' ? '#3498db' : e.typeId === 'healer' ? '#2ecc71' : e.typeId === 'ghost' ? '#9b59b6' : e.typeId === 'swarm' ? '#f39c12' : '#2ecc71';
            const hpPctStr = pct.toFixed(1) + '%';
            if (el._hpFill._lastPct !== hpPctStr) {
                el._hpFill._lastPct = hpPctStr;
                el._hpFill.style.width = hpPctStr;
                el._hpFill.style.background = hpColor;
            }

            // Status icons (slow / poison)
            const statusKey = (fx.slow > 0 ? '1' : '0') + (fx.poison > 0 ? '1' : '0');
            if (el._fxEl._lastKey !== statusKey) {
                el._fxEl._lastKey = statusKey;
                el._fxEl.innerHTML = (fx.slow > 0 ? '<span class="vc-fx-icon">❄️</span>' : '')
                                   + (fx.poison > 0 ? '<span class="vc-fx-icon">☠️</span>' : '');
                el._fxEl.style.display = statusKey !== '00' ? '' : 'none';
            }

            // Armor badge
            const armorVal = e.armor > 0 ? Math.round(e.armor) : 0;
            if (el._armorEl._lastVal !== armorVal) {
                el._armorEl._lastVal = armorVal;
                if (armorVal > 0) {
                    el._armorEl.textContent = '🛡️' + armorVal;
                    el._armorEl.style.display = '';
                } else {
                    el._armorEl.style.display = 'none';
                }
            }

            // Selection ring visibility
            el._ringEl.style.display = isSelected ? '' : 'none';
        }

        // Remove stale enemy elements (enemies that died or leaked this frame)
        for (const deadId of toRemove) {
            const el = enemyElMap.get(deadId);
            if (el) { el.remove(); }
            enemyElMap.delete(deadId);
        }

        // ── Projectiles: keyed diff ──────────────────────────────────────────
        if (!this._projElMap) this._projElMap = new Map();
        const projElMap = this._projElMap;
        // Perf fix 7: use stable numeric p.id — no string concat, no Set allocation per frame
        const activeProjIds = new Set();

        for (let i = 0; i < engineState.projectiles.length; i++) {
            const p = engineState.projectiles[i];
            activeProjIds.add(p.id);

            let pel = projElMap.get(p.id);
            if (!pel) {
                pel = document.createElement('div');
                pel.className = 'vc-projectile';
                this.entitiesEl.appendChild(pel);
                projElMap.set(p.id, pel);
            }
            pel.style.left       = p.x + 'px';
            pel.style.top        = p.y + 'px';
            pel.style.background = p.gemData.color;
        }
        // Remove stale projectile elements
        for (const [id, el] of projElMap) {
            if (!activeProjIds.has(id)) { el.remove(); projElMap.delete(id); }
        }

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

    // Measure the tallest possible bottombar content by rendering it off-screen,
    // then lock that height so the map never jumps when content changes.
    _measureBottomBarHeight() {
        const probe = document.createElement('div');
        probe.className = 'vc-bottombar';
        probe.style.cssText = [
            'position:fixed', 'left:-9999px', 'top:0',
            'width:' + (this.bottomBar.offsetWidth || 320) + 'px',
            'height:auto', 'max-height:none', 'visibility:hidden',
            'display:flex', 'flex-wrap:wrap'
        ].join(';');

        // Inject the tallest known content: stat panel (5 rows) + 2 buttons
        probe.innerHTML = `
            <div class="vc-tower-stat-panel">
                <div class="vc-stat-panel-title" style="color:#e74c3c">Ruby Tower — Lv.1</div>
                <div class="vc-stat-panel-rows">
                    <div class="vc-stat-panel-row"><span>🏹 Range</span><span>100px</span></div>
                    <div class="vc-stat-panel-row"><span>⚡ Fire</span><span>1.50/s</span></div>
                    <div class="vc-stat-panel-row"><span>⚔️ Damage</span><span>18</span></div>
                    <div class="vc-stat-panel-row"><span>🎯 Total Dmg</span><span>0</span></div>
                    <div class="vc-stat-panel-row"><span>💥 Critical hits</span><span>0</span></div>
                </div>
                <div class="vc-stat-panel-next">Lv.2: ⚔️27 ⚡1.8/s 🏹108px</div>
            </div>
            <div class="vc-stat-panel-btns">
                <button class="vc-btn">▲ Lv.2 (300 💧)</button>
                <button class="vc-btn">✕ Remove</button>
            </div>
        `;
        document.body.appendChild(probe);
        const h = probe.scrollHeight;
        document.body.removeChild(probe);
        // Add padding (top+bottom = 12px) and a small buffer (8px)
        return h + 20;
    }
    // so pointer capture and drag events survive. Only updates what visually changed.
    _renderStructures(structures) {
        const el = this.structuresEl;
        const ts = this.tileSize;
        if (!el) return;
        if (el.children.length !== structures.length) {
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
                div.style.pointerEvents = 'auto'; // override parent's pointer-events:none
                div.style.touchAction   = 'none'; // prevent browser scroll stealing pointer on mobile
                div.style.cursor = 'grab';
                el.appendChild(div);
                // Attach drag listener once.
                // Sets _dragPending; the global handlers in initDragSwap take it from there.
                div.addEventListener('pointerdown', (e) => {
                    const live = this.engine.structures.find(s => `${s.x},${s.y}` === div.dataset.skey);
                    if (!live) return;

                    // No gem — select tile immediately
                    if (!live.gem) {
                        const r = live.r ?? Math.floor((live.y - ts / 2) / ts);
                        const cc = live.c ?? Math.floor((live.x - ts / 2) / ts);
                        const tileType = this.engine.map.grid[r]?.[cc];
                        if (tileType !== undefined) this.selectTile(r, cc, tileType);
                        return;
                    }

                    // Has gem — arm pending drag; global pointermove/up handles threshold + swap
                    e.preventDefault();
                    e.stopPropagation();
                    this._dragPending = { live, startX: e.clientX, startY: e.clientY };
                    this._dragSource = null; // not active yet
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
                div.style.cursor = st.gem ? 'grab' : 'pointer';
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

        // Fix #2: O(1) map lookup instead of O(n) .find() scan
        const e = engineState.enemyById?.get(this.selectedEnemyId);
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