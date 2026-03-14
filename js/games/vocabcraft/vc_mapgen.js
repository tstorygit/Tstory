// vc_mapgen.js — Map generation with named templates
// Multi-path support: generateMap returns { grid, paths[], cols, rows, templateId }
// paths is always an array of path arrays — single-entrance maps have paths.length === 1

export const TILE_PATH  = 0;
export const TILE_GRASS = 1;
export const TILE_ROCK  = 2;

// ─── Template Catalogue ───────────────────────────────────────────────────────
// skeleton: array of { fx, fy } — fractional coords (0..1) of the grid
// multiPath: true if this template has multiple entry lanes
// minTier: first tier this template can appear

export const TEMPLATES = [
    {
        id: 'gauntlet',
        name: 'The Gauntlet',
        desc: 'One long winding road. Towers along the full length — no shortcuts.',
        minTier: 1,
        type: 'skeleton',
        skeleton: [
            { fx: 0.0,  fy: 0.20 },
            { fx: 0.70, fy: 0.18 },
            { fx: 0.70, fy: 0.45 },
            { fx: 0.15, fy: 0.48 },
            { fx: 0.15, fy: 0.75 },
            { fx: 0.75, fy: 0.78 },
            { fx: 1.0,  fy: 0.85 },
        ]
    },
    {
        id: 'uturn',
        name: 'U-Turn',
        desc: 'Enemies charge from both top corners down their respective lanes and converge on the base at the bottom. You must defend both sides.',
        minTier: 1,
        type: 'uturn',
        multiPath: true,
        skeleton: []
    },
    {
        id: 'scurve',
        name: 'S-Curve',
        desc: 'Two sweeping bends. Divide your defense between upper and lower halves.',
        minTier: 1,
        type: 'skeleton',
        skeleton: [
            { fx: 0.0,  fy: 0.18 },
            { fx: 0.72, fy: 0.22 },
            { fx: 0.28, fy: 0.50 },
            { fx: 0.72, fy: 0.78 },
            { fx: 1.0,  fy: 0.82 },
        ]
    },
    {
        id: 'zslash',
        name: 'Z-Slash',
        desc: 'A sharp diagonal cut. Asymmetric coverage — one corner will always feel exposed.',
        minTier: 2,
        type: 'skeleton',
        skeleton: [
            { fx: 0.0,  fy: 0.12 },
            { fx: 0.88, fy: 0.12 },
            { fx: 0.12, fy: 0.88 },
            { fx: 1.0,  fy: 0.88 },
        ]
    },
    {
        id: 'spiral',
        name: 'Spiral-In',
        desc: 'Enemies coil inward from the edge. The center tile sees everything — guard it.',
        minTier: 3,
        type: 'spiral',
        skeleton: []
    },
    {
        id: 'figure8',
        name: 'Figure-8',
        desc: 'Two loops share a crossing at the center. One tower there covers the whole map.',
        minTier: 3,
        type: 'figure8',
        skeleton: []
    },
    {
        id: 'zigzag',
        name: 'Zigzag',
        desc: 'Five horizontal sweeps down the map. Predictable but dense — vertical towers dominate.',
        minTier: 1,
        type: 'skeleton',
        skeleton: [
            { fx: 0.0,  fy: 0.08 },
            { fx: 1.0,  fy: 0.08 },
            { fx: 1.0,  fy: 0.26 },
            { fx: 0.0,  fy: 0.26 },
            { fx: 0.0,  fy: 0.44 },
            { fx: 1.0,  fy: 0.44 },
            { fx: 1.0,  fy: 0.62 },
            { fx: 0.0,  fy: 0.62 },
            { fx: 0.0,  fy: 0.80 },
            { fx: 1.0,  fy: 0.80 },
        ]
    },
    {
        id: 'crossroads',
        name: 'Crossroads',
        desc: 'A proper + intersection. The crossing tile sees every enemy — but you can only build one tower there.',
        minTier: 2,
        type: 'crossroads',
        skeleton: []
    },
    {
        id: 'comb',
        name: 'The Comb',
        desc: 'A spine with four teeth. Enemies dip into each tooth and back — short exposure windows.',
        minTier: 2,
        type: 'comb',
        skeleton: []
    },
    {
        id: 'doubleloop',
        name: 'Double Loop',
        desc: 'Two ovals joined by a bridge. Enemies run the full circuit twice — plan for both halves.',
        minTier: 3,
        type: 'doubleloop',
        skeleton: []
    },
    {
        id: 'labyrinth',
        name: 'Labyrinth',
        desc: 'A dense winding maze. The longest path on the smallest space — traps are essential.',
        minTier: 4,
        type: 'labyrinth',
        skeleton: []
    },
    {
        id: 'pinwheel',
        name: 'Pinwheel',
        desc: 'Four arms radiate from the center. Every enemy passes the hub — place your best gem there.',
        minTier: 4,
        type: 'pinwheel',
        skeleton: []
    },
    // ── Multi-path templates ──────────────────────────────────────────────────
    {
        id: 'siege',
        name: 'The Siege',
        desc: 'Three columns storm your gate. Enemies split across all lanes — no single tower covers everything.',
        minTier: 3,
        type: 'siege',
        multiPath: true,
        skeleton: []
    },
    {
        id: 'delta',
        name: 'River Delta',
        desc: 'Two rivers from opposite corners converge at a bottleneck. Guard the confluence — or be overwhelmed.',
        minTier: 2,
        type: 'delta',
        multiPath: true,
        skeleton: []
    }
];

// ─── Public API ───────────────────────────────────────────────────────────────

export function getValidTemplates(tier) {
    return TEMPLATES.filter(t => t.minTier <= tier);
}

/**
 * Generate a full map for the given template.
 * @param {number} cols
 * @param {number} rows
 * @param {number} tier
 * @param {string|null} templateId
 * @returns {{ grid, paths, cols, rows, templateId }}
 *   paths — array of tile-coord path arrays (one per entrance).
 *   Single-entrance: paths.length === 1.  Multi-entrance: paths.length >= 2.
 */
export function generateMap(cols, rows, tier, templateId = null) {
    const valid = getValidTemplates(tier);
    let tpl = templateId
        ? TEMPLATES.find(t => t.id === templateId) || valid[0]
        : valid[Math.floor(Math.random() * valid.length)];

    for (let attempt = 0; attempt < 10; attempt++) {
        let paths;

        if      (tpl.type === 'spiral')     paths = [_spiralGenerator(cols, rows)];
        else if (tpl.type === 'figure8')    paths = [_figure8Generator(cols, rows)];
        else if (tpl.type === 'comb')       paths = [_combGenerator(cols, rows)];
        else if (tpl.type === 'doubleloop') paths = [_doubleLoopGenerator(cols, rows)];
        else if (tpl.type === 'labyrinth')  paths = [_labyrinthGenerator(cols, rows)];
        else if (tpl.type === 'pinwheel')   paths = [_pinwheelGenerator(cols, rows)];
        else if (tpl.type === 'crossroads') paths = [_crossroadsGenerator(cols, rows)];
        else if (tpl.type === 'siege')      paths = _siegeGenerator(cols, rows);
        else if (tpl.type === 'delta')      paths = _deltaGenerator(cols, rows);
        else if (tpl.type === 'uturn')      paths = _uturnGenerator(cols, rows);
        else                                paths = [_skeletonWalk(tpl.skeleton, cols, rows)];

        const allTiles   = paths.flat();
        const uniqueSize = new Set(allTiles.map(p => `${p.x},${p.y}`)).size;
        const minLen     = Math.floor(cols * rows * 0.25);

        if (uniqueSize >= minLen) {
            const grid = _buildGrid(allTiles, cols, rows, tier);
            return { grid, paths, cols, rows, templateId: tpl.id };
        }
    }

    // Fallback: gauntlet so we never return null
    const fallbackPath = _skeletonWalk(TEMPLATES[0].skeleton, cols, rows);
    const grid = _buildGrid(fallbackPath, cols, rows, tier);
    return { grid, paths: [fallbackPath], cols, rows, templateId: 'gauntlet' };
}

/**
 * Convert all paths to pixel-space waypoint sets.
 * @returns {Array<Array<{x,y}>>} waypointSets — one array per path
 */
export function getWaypointsForPaths(paths, tileSize) {
    return paths.map(path =>
        path.map(p => ({
            x: p.x * tileSize + tileSize / 2,
            y: p.y * tileSize + tileSize / 2
        }))
    );
}

/** @deprecated Use getWaypointsForPaths. */
export function getWaypoints(path, tileSize) {
    return path.map(p => ({
        x: p.x * tileSize + tileSize / 2,
        y: p.y * tileSize + tileSize / 2
    }));
}

/**
 * Returns an inline SVG minimap string for the camp screen.
 */
export function getTemplateMinimap(templateId, w = 70, h = 90) {
    const tpl = TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return '';

    const pad = 8, iw = w - pad * 2, ih = h - pad * 2;
    const toX = fx => pad + fx * iw;
    const toY = fy => pad + fy * ih;

    const bg      = '#1a252f';
    const stroke  = '#3498db';
    const stroke2 = '#e67e22';
    const entry   = '#2ecc71';
    const exit    = '#e74c3c';
    const dotR    = 3;

    let pathD = '', extraSvg = '';

    if (tpl.type === 'skeleton' && tpl.skeleton.length >= 2) {
        const pts = tpl.skeleton.map(p => `${toX(p.fx).toFixed(1)},${toY(p.fy).toFixed(1)}`);
        pathD = `M${pts.join('L')}`;

    } else if (tpl.type === 'spiral') {
        const cx = w / 2, cy = h / 2, turns = 2.2, steps = 80;
        const rMax = Math.min(iw, ih) / 2;
        const points = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const angle = t * turns * 2 * Math.PI - Math.PI / 2;
            const r = rMax * (1 - t * 0.85);
            points.push(`${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`);
        }
        pathD = `M${points[0]}` + points.slice(1).map(p => `L${p}`).join('');
        const p0 = points[0].split(','), pN = points[points.length - 1].split(',');
        extraSvg = `<circle cx="${p0[0]}" cy="${p0[1]}" r="${dotR}" fill="${entry}"/>
            <circle cx="${(w/2).toFixed(1)}" cy="${(h/2).toFixed(1)}" r="${dotR+1}" fill="${exit}"/>
            <circle cx="${(w/2).toFixed(1)}" cy="${(h/2).toFixed(1)}" r="6" fill="none" stroke="${exit}" stroke-width="1.5" opacity="0.6"/>`;

    } else if (tpl.type === 'uturn') {
        // Two lanes from top-left and top-right, down to base at bottom-center
        const baseX = (w/2).toFixed(1), baseY = (h-pad).toFixed(1);
        const lx1 = toX(0.15).toFixed(1), lx2 = toX(0.85).toFixed(1);
        const botY = toY(0.82).toFixed(1);
        extraSvg = `
            <path d="M${lx1},${pad} L${lx1},${botY} L${baseX},${baseY}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>
            <path d="M${lx2},${pad} L${lx2},${botY} L${baseX},${baseY}" fill="none" stroke="${stroke2}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>
            <circle cx="${lx1}" cy="${pad}" r="${dotR}" fill="${entry}"/>
            <circle cx="${lx2}" cy="${pad}" r="${dotR}" fill="${entry}"/>
            <circle cx="${baseX}" cy="${baseY}" r="${dotR+1}" fill="${exit}"/>
            <circle cx="${baseX}" cy="${baseY}" r="6" fill="none" stroke="${exit}" stroke-width="1.5" opacity="0.6"/>
        `;
        const cx = (w/2).toFixed(1), cy = (h/2).toFixed(1);
        pathD = [`M${cx},${cy}`,
            `C${w*0.85},${h*0.10} ${w*0.85},${h*0.46} ${cx},${cy}`,
            `C${w*0.15},${h*0.54} ${w*0.15},${h*0.90} ${cx},${cy}`].join(' ');
        extraSvg = `<circle cx="${(w*0.5).toFixed(1)}" cy="${(h*0.18).toFixed(1)}" r="${dotR}" fill="${entry}"/>
            <circle cx="${(w*0.5).toFixed(1)}" cy="${(h*0.82).toFixed(1)}" r="${dotR}" fill="${exit}"/>`;

    } else if (tpl.type === 'crossroads') {
        const cx2 = (w/2).toFixed(1), cy2 = (h/2).toFixed(1);
        pathD = `M${pad},${cy2} L${(w-pad).toFixed(1)},${cy2} M${cx2},${pad} L${cx2},${(h-pad).toFixed(1)}`;
        extraSvg = `<circle cx="${pad}" cy="${cy2}" r="${dotR}" fill="${entry}"/>
            <circle cx="${cx2}" cy="${cy2}" r="${dotR+1}" fill="${exit}"/>
            <circle cx="${cx2}" cy="${cy2}" r="6" fill="none" stroke="${exit}" stroke-width="1.5" opacity="0.6"/>`;

    } else if (tpl.type === 'comb') {
        const spineY = (h*0.62).toFixed(1), toothTop = (pad+0.08*ih).toFixed(1);
        const teethX = [0.15,0.38,0.62,0.85].map(fx => (pad+fx*iw).toFixed(1));
        const teeth = teethX.map(tx => `M${tx},${spineY} L${tx},${toothTop} L${tx},${spineY}`).join(' ');
        pathD = `M${pad},${spineY} L${(pad+iw).toFixed(1)},${spineY} ${teeth}`;
        extraSvg = `<circle cx="${pad}" cy="${spineY}" r="${dotR}" fill="${entry}"/>
            <circle cx="${(pad+iw).toFixed(1)}" cy="${spineY}" r="${dotR}" fill="${exit}"/>`;

    } else if (tpl.type === 'doubleloop') {
        const midY = (h/2).toFixed(1), lCx = (w*0.27).toFixed(1), rCx = (w*0.73).toFixed(1);
        const rx2 = (w*0.22).toFixed(1), ry2 = (h*0.32).toFixed(1);
        pathD = [`M${lCx},${midY}`, `A${rx2},${ry2} 0 1,1 ${lCx},${(h/2+0.01).toFixed(1)}`,
            `L${rCx},${midY}`, `A${rx2},${ry2} 0 1,0 ${rCx},${(h/2-0.01).toFixed(1)}`].join(' ');
        extraSvg = `<circle cx="${lCx}" cy="${(h*0.18).toFixed(1)}" r="${dotR}" fill="${entry}"/>
            <circle cx="${rCx}" cy="${(h*0.82).toFixed(1)}" r="${dotR}" fill="${exit}"/>`;

    } else if (tpl.type === 'labyrinth') {
        const pts = [[0.0,0.1],[0.7,0.1],[0.7,0.3],[0.2,0.3],[0.2,0.5],
            [0.8,0.5],[0.8,0.7],[0.3,0.7],[0.3,0.9],[1.0,0.9]]
            .map(([fx,fy]) => `${toX(fx).toFixed(1)},${toY(fy).toFixed(1)}`);
        pathD = `M${pts.join('L')}`;
        extraSvg = `<circle cx="${toX(0.0).toFixed(1)}" cy="${toY(0.1).toFixed(1)}" r="${dotR}" fill="${entry}"/>
            <circle cx="${toX(1.0).toFixed(1)}" cy="${toY(0.9).toFixed(1)}" r="${dotR}" fill="${exit}"/>`;

    } else if (tpl.type === 'pinwheel') {
        const cx2 = (w/2).toFixed(1), cy2 = (h/2).toFixed(1);
        pathD = [`M${cx2},${cy2} L${cx2},${pad.toFixed(1)} L${cx2},${cy2}`,
            `M${cx2},${cy2} L${(w-pad).toFixed(1)},${cy2} L${cx2},${cy2}`,
            `M${cx2},${cy2} L${cx2},${(h-pad).toFixed(1)} L${cx2},${cy2}`,
            `M${cx2},${cy2} L${pad.toFixed(1)},${cy2} L${cx2},${cy2}`].join(' ');
        extraSvg = `<circle cx="${cx2}" cy="${pad.toFixed(1)}" r="${dotR}" fill="${entry}"/>
            <circle cx="${cx2}" cy="${cy2}" r="${dotR+1}" fill="${exit}"/>
            <circle cx="${cx2}" cy="${cy2}" r="6" fill="none" stroke="${exit}" stroke-width="1.5" opacity="0.6"/>`;

    } else if (tpl.type === 'siege') {
        const baseX = (w/2).toFixed(1), baseY = (h-pad).toFixed(1), mergeY = (h*0.78).toFixed(1);
        const laneColors = [stroke2, stroke, stroke2];
        const laneSvg = [0.18, 0.50, 0.82].map((fx, i) => {
            const lx = toX(fx).toFixed(1);
            return `<path d="M${lx},${pad} L${lx},${mergeY} L${baseX},${baseY}" fill="none" stroke="${laneColors[i]}" stroke-width="2" stroke-linecap="round" opacity="0.85"/>
                <circle cx="${lx}" cy="${pad}" r="${dotR}" fill="${entry}"/>`;
        }).join('');
        extraSvg = laneSvg + `<circle cx="${baseX}" cy="${baseY}" r="${dotR+1}" fill="${exit}"/>`;

    } else if (tpl.type === 'delta') {
        const baseX = (w/2).toFixed(1), baseY = (h-pad).toFixed(1);
        const neckX = (w/2).toFixed(1), neckY = (h*0.65).toFixed(1);
        const lx1 = toX(0.10).toFixed(1), lx2 = toX(0.90).toFixed(1);
        extraSvg = `<path d="M${lx1},${pad} C${lx1},${neckY} ${neckX},${neckY} ${neckX},${baseY}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>
            <path d="M${lx2},${pad} C${lx2},${neckY} ${neckX},${neckY} ${neckX},${baseY}" fill="none" stroke="${stroke2}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>
            <circle cx="${lx1}" cy="${pad}" r="${dotR}" fill="${entry}"/>
            <circle cx="${lx2}" cy="${pad}" r="${dotR}" fill="${entry}"/>
            <circle cx="${neckX}" cy="${baseY}" r="${dotR+1}" fill="${exit}"/>`;
    }

    // Skeleton types: derive dots from skeleton endpoints
    let dotsHtml = extraSvg;
    if (!extraSvg && tpl.skeleton.length >= 2) {
        const s0 = tpl.skeleton[0], sN = tpl.skeleton[tpl.skeleton.length - 1];
        const midDots = tpl.skeleton.slice(1, -1).map(p =>
            `<circle cx="${toX(p.fx).toFixed(1)}" cy="${toY(p.fy).toFixed(1)}" r="2" fill="${stroke}" opacity="0.6"/>`
        ).join('');
        dotsHtml = `${midDots}
            <circle cx="${toX(s0.fx).toFixed(1)}" cy="${toY(s0.fy).toFixed(1)}" r="${dotR}" fill="${entry}"/>
            <circle cx="${toX(sN.fx).toFixed(1)}" cy="${toY(sN.fy).toFixed(1)}" r="${dotR}" fill="${exit}"/>`;
    }

    const multiLabel = tpl.multiPath
        ? `<text x="${w/2}" y="${h-2}" text-anchor="middle" font-size="7" fill="${stroke2}" opacity="0.9">multi-lane</text>`
        : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <rect width="${w}" height="${h}" rx="4" fill="${bg}"/>
        ${pathD ? `<path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>` : ''}
        ${dotsHtml}
        ${multiLabel}
    </svg>`;
}

// ─── Grid builder ─────────────────────────────────────────────────────────────
// Cellular automata pass clusters rocks into organic blobs instead of static.

function _buildGrid(allPathTiles, cols, rows, tier) {
    const grid   = Array(rows).fill(0).map(() => Array(cols).fill(TILE_ROCK));
    const pathSet = new Set(allPathTiles.map(p => `${p.x},${p.y}`));
    allPathTiles.forEach(p => {
        if (p.y >= 0 && p.y < rows && p.x >= 0 && p.x < cols)
            grid[p.y][p.x] = TILE_PATH;
    });

    // Phase 1 — seed noise
    const rockChance = 0.18 + tier * 0.01;
    const raw = Array(rows).fill(0).map((_, r) =>
        Array(cols).fill(0).map((__, c) =>
            pathSet.has(`${c},${r}`) ? null : (Math.random() < rockChance ? TILE_ROCK : TILE_GRASS)
        )
    );

    // Phase 2 — one cellular automata pass: majority vote in 3×3 window
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (pathSet.has(`${c},${r}`)) continue;
            let rockCount = 0, total = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr, nc = c + dc;
                    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) { rockCount++; total++; continue; }
                    if (pathSet.has(`${nc},${nr}`)) { total++; continue; }
                    if (raw[nr][nc] === TILE_ROCK) rockCount++;
                    total++;
                }
            }
            grid[r][c] = (rockCount > total / 2) ? TILE_ROCK : TILE_GRASS;
        }
    }
    return grid;
}

// ─── Generator 1: Skeleton Walk ───────────────────────────────────────────────
// For axis-aligned segments (pure horizontal or pure vertical) we use _forceLine
// directly — no randomness, guarantees clean rows/columns (critical for zigzag).
// Random walk is only applied to genuinely diagonal segments.

function _skeletonWalk(skeleton, cols, rows) {
    if (skeleton.length < 2) return _fallbackWalk(cols, rows);

    const points = skeleton.map(p => ({
        x: Math.round(Math.max(0, Math.min(cols - 1, p.fx * (cols - 1)))),
        y: Math.round(Math.max(0, Math.min(rows - 1, p.fy * (rows - 1))))
    }));

    const visited = new Set();
    const path    = [];
    const key     = (x, y) => `${x},${y}`;
    const dirs    = [{ dx:1,dy:0 },{ dx:-1,dy:0 },{ dx:0,dy:1 },{ dx:0,dy:-1 }];

    for (let seg = 0; seg < points.length - 1; seg++) {
        let { x, y } = points[seg];
        const goal   = points[seg + 1];

        if (!visited.has(key(x, y))) { visited.add(key(x, y)); path.push({ x, y }); }

        const isDiagonal = (goal.x !== x) && (goal.y !== y);

        // Axis-aligned segments: just draw a straight line, no randomness
        if (!isDiagonal) {
            _forceLine(x, y, goal.x, goal.y, visited, path, cols, rows);
            continue;
        }

        // Diagonal segments: biased random walk toward goal
        const manhattan = Math.abs(goal.x - x) + Math.abs(goal.y - y);
        const budget    = Math.max(manhattan * 2, 16);

        for (let step = 0; step < budget; step++) {
            if (x === goal.x && y === goal.y) break;
            const dist = Math.abs(goal.x - x) + Math.abs(goal.y - y);

            const candidates = dirs.map(d => {
                const nx = x + d.dx, ny = y + d.dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return null;
                if (visited.has(key(nx, ny))) return null;
                const adjCount = dirs
                    .filter(od => !(od.dx === -d.dx && od.dy === -d.dy))
                    .filter(od => {
                        const ax = nx + od.dx, ay = ny + od.dy;
                        return ax >= 0 && ax < cols && ay >= 0 && ay < rows && visited.has(key(ax, ay));
                    }).length;
                if (adjCount > 1) return null;
                const newDist    = Math.abs(goal.x - nx) + Math.abs(goal.y - ny);
                const towardGoal = newDist < dist ? 6 : 1;
                const RANDOM_STRENGTH = 0; // 0 = deterministic; raise to e.g. 1.2 to re-enable jitter
                return { nx, ny, weight: towardGoal + Math.random() * RANDOM_STRENGTH };
            }).filter(Boolean);

            if (candidates.length === 0) {
                if (path.length > 1) {
                    const removed = path.pop();
                    visited.delete(key(removed.x, removed.y));
                    x = path[path.length - 1].x;
                    y = path[path.length - 1].y;
                }
                continue;
            }

            candidates.sort((a, b) => b.weight - a.weight);
            const RANDOM_STRENGTH = 0; // 0 = always pick best; raise to re-enable variance
            const pick = (candidates.length > 1 && Math.random() < 0.2 * RANDOM_STRENGTH) ? candidates[1] : candidates[0];
            x = pick.nx; y = pick.ny;
            visited.add(key(x, y)); path.push({ x, y });
        }

        _forceLine(x, y, goal.x, goal.y, visited, path, cols, rows);
    }
    return path;
}

function _forceLine(x0, y0, x1, y1, visited, path, cols, rows) {
    let x = x0, y = y0;
    const key = (x, y) => `${x},${y}`;
    while (x !== x1 || y !== y1) {
        const dx = Math.sign(x1 - x), dy = Math.sign(y1 - y);
        const moveX = Math.abs(x1 - x) >= Math.abs(y1 - y) ? dx : 0;
        const moveY = moveX ? 0 : dy;
        x = Math.max(0, Math.min(cols - 1, x + moveX));
        y = Math.max(0, Math.min(rows - 1, y + moveY));
        if (!visited.has(key(x, y))) { visited.add(key(x, y)); path.push({ x, y }); }
    }
}

// ─── Generator 2: Spiral ─────────────────────────────────────────────────────

function _spiralGenerator(cols, rows) {
    const path = [], visited = new Set();
    const key = (x, y) => `${x},${y}`;
    let left = 1, right = cols - 2, top = 1, bottom = rows - 2;
    const entryY = Math.floor(rows / 2);
    for (let x = 0; x <= left; x++) {
        const pt = { x, y: entryY };
        if (!visited.has(key(pt.x, pt.y))) { visited.add(key(pt.x, pt.y)); path.push(pt); }
    }
    while (left <= right && top <= bottom) {
        for (let x = left; x <= right; x++) {
            const pt = { x, y: top };
            if (!visited.has(key(pt.x, pt.y))) { visited.add(key(pt.x, pt.y)); path.push(pt); }
        }
        top++;
        for (let y = top; y <= bottom; y++) {
            const pt = { x: right, y };
            if (!visited.has(key(pt.x, pt.y))) { visited.add(key(pt.x, pt.y)); path.push(pt); }
        }
        right--;
        if (top <= bottom) {
            for (let x = right; x >= left; x--) {
                const pt = { x, y: bottom };
                if (!visited.has(key(pt.x, pt.y))) { visited.add(key(pt.x, pt.y)); path.push(pt); }
            }
            bottom--;
        }
        if (left <= right) {
            for (let y = bottom; y >= top; y--) {
                const pt = { x: left, y };
                if (!visited.has(key(pt.x, pt.y))) { visited.add(key(pt.x, pt.y)); path.push(pt); }
            }
            left++;
        }
    }
    if (path.length > 0) {
        const last = path[path.length - 1];
        // Spiral inward to the center — the base is at the heart of the map
        _forceLine(last.x, last.y, Math.floor(cols / 2), Math.floor(rows / 2), visited, path, cols, rows);
    }
    return path;
}

// ─── Generator 3: Figure-8 ───────────────────────────────────────────────────

function _figure8Generator(cols, rows) {
    const visited = new Set(), path = [];
    const key = (x, y) => `${x},${y}`;
    const addPt = (x, y) => {
        x = Math.max(0, Math.min(cols - 1, x));
        y = Math.max(0, Math.min(rows - 1, y));
        visited.add(key(x, y)); path.push({ x, y });
    };
    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    const margin = 1, topY = margin, botY = rows - 1 - margin;
    const leftX = margin, rightX = cols - 1 - margin;
    const entryX = Math.floor(cols * 0.3);
    for (let y = 0; y <= topY; y++) addPt(entryX, y);
    for (let x = entryX; x >= leftX; x--) addPt(x, topY);
    for (let y = topY; y <= cy; y++) addPt(leftX, y);
    for (let x = leftX; x <= cx; x++) addPt(x, cy);
    for (let x = cx; x <= rightX; x++) addPt(x, cy - 1);
    for (let y = cy - 1; y >= topY; y--) addPt(rightX, y);
    for (let x = rightX; x >= entryX; x--) addPt(x, topY);
    for (let y = topY; y <= cy; y++) addPt(entryX, y);
    for (let x = cx; x >= leftX; x--) addPt(x, cy + 1);
    for (let y = cy + 1; y <= botY; y++) addPt(leftX, y);
    const exitX = Math.floor(cols * 0.7);
    for (let x = leftX; x <= exitX; x++) addPt(x, botY);
    for (let y = botY; y >= cy + 1; y--) addPt(rightX, y);
    for (let x = rightX; x >= cx; x--) addPt(x, cy + 1);
    for (let y = cy + 1; y >= cy; y--) addPt(cx, y);
    for (let y = cy; y <= rows - 1; y++) addPt(exitX, y);
    return path;
}

// ─── Generator 5: Crossroads (proper + shape) ────────────────────────────────
// Horizontal run left→right, with a full vertical detour at center column
// (up to row 1, then down to row rows-2) before continuing right.

function _crossroadsGenerator(cols, rows) {
    const path = [], visited = new Set();
    const key = (x, y) => `${x},${y}`;
    const addPt = (x, y) => {
        x = Math.max(0, Math.min(cols - 1, x));
        y = Math.max(0, Math.min(rows - 1, y));
        if (!visited.has(key(x, y))) { visited.add(key(x, y)); path.push({ x, y }); }
    };
    // Re-visits allowed — center tile is visited multiple times
    const addAlways = (x, y) => {
        x = Math.max(0, Math.min(cols - 1, x));
        y = Math.max(0, Math.min(rows - 1, y));
        path.push({ x, y }); visited.add(key(x, y));
    };

    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);

    // Entry: left edge → center
    for (let x = 0; x <= cx; x++) addPt(x, cy);

    // North arm: out to top edge and back to center
    for (let y = cy - 1; y >= 0; y--) addAlways(cx, y);
    for (let y = 0; y <= cy; y++)     addAlways(cx, y);

    // South arm: out to bottom edge and back to center
    for (let y = cy + 1; y <= rows - 1; y++) addAlways(cx, y);
    for (let y = rows - 1; y >= cy; y--)     addAlways(cx, y);

    // East arm: out to right edge and back to center (base)
    for (let x = cx + 1; x <= cols - 1; x++) addAlways(x, cy);
    for (let x = cols - 1; x >= cx; x--)     addAlways(x, cy);

    // Final point is (cx, cy) — the base
    return path;
}

// ─── Generator 6: Comb ───────────────────────────────────────────────────────

function _combGenerator(cols, rows) {
    const path = [], visited = new Set();
    const key = (x, y) => `${x},${y}`;
    const addPt = (x, y) => {
        x = Math.max(0, Math.min(cols - 1, x));
        y = Math.max(0, Math.min(rows - 1, y));
        visited.add(key(x, y)); path.push({ x, y });
    };
    const spineY   = Math.floor(rows * 0.65);
    const toothTop = 1;
    const toothCols = [
        Math.floor(cols * 0.15), Math.floor(cols * 0.38),
        Math.floor(cols * 0.62), Math.floor(cols * 0.85),
    ];
    for (let x = 0; x <= toothCols[0]; x++) addPt(x, spineY);
    toothCols.forEach((tx, i) => {
        for (let y = spineY; y >= toothTop; y--) addPt(tx, y);
        for (let y = toothTop; y <= spineY; y++) addPt(tx, y);
        const nextX = i < toothCols.length - 1 ? toothCols[i + 1] : cols - 1;
        const dir = nextX > tx ? 1 : -1;
        for (let x = tx + dir; x !== nextX + dir; x += dir) addPt(x, spineY);
    });
    return path;
}

// ─── Generator 7: Double Loop ─────────────────────────────────────────────────

function _doubleLoopGenerator(cols, rows) {
    const path = [];
    const addPt = (x, y) => path.push({
        x: Math.max(0, Math.min(cols - 1, x)),
        y: Math.max(0, Math.min(rows - 1, y))
    });
    const midY = Math.floor(rows / 2), margin = 1, bridgeY = midY;
    const lLeft = margin, lRight = Math.floor(cols * 0.45);
    const rLeft = Math.floor(cols * 0.55), rRight = cols - 1 - margin;
    const lTop = margin, lBot = rows - 1 - margin;
    const rTop = margin, rBot = rows - 1 - margin;

    // Entry: left border edge → loop start (so spawn marker is on the border)
    addPt(0, lTop);
    for (let x = lLeft; x <= lRight; x++) addPt(x, lTop);
    for (let y = lTop; y <= lBot; y++)    addPt(lRight, y);
    for (let x = lRight; x >= lLeft; x--) addPt(x, lBot);
    for (let y = lBot; y >= bridgeY; y--) addPt(lLeft, y);
    for (let x = lLeft; x <= rRight; x++) addPt(x, bridgeY);
    for (let y = bridgeY; y >= rTop; y--) addPt(rRight, y);
    for (let x = rRight; x >= rLeft; x--) addPt(x, rTop);
    for (let y = rTop; y <= rBot; y++)    addPt(rLeft, y);
    for (let x = rLeft; x <= rRight; x++) addPt(x, rBot);
    // Exit: right-side loop bottom → bottom border
    addPt(rRight, rows - 1);
    return path;
}

// ─── Generator 8: Labyrinth ───────────────────────────────────────────────────

function _labyrinthGenerator(cols, rows) {
    const cellCols = Math.floor((cols - 1) / 2);
    const cellRows = Math.floor((rows - 1) / 2);
    const visited  = Array(cellRows).fill(0).map(() => Array(cellCols).fill(false));
    const walls    = Array(cellRows).fill(0).map(() =>
        Array(cellCols).fill(0).map(() => ({ N: true, S: true, E: true, W: true }))
    );
    const cellDirs = [
        { dc: 0, dr: -1, wall: 'N', opp: 'S' }, { dc: 0, dr: 1, wall: 'S', opp: 'N' },
        { dc: 1, dr:  0, wall: 'E', opp: 'W' }, { dc:-1, dr: 0, wall: 'W', opp: 'E' },
    ];
    function carve(c, r) {
        visited[r][c] = true;
        for (const d of cellDirs.slice().sort(() => Math.random() - 0.5)) {
            const nc = c + d.dc, nr = r + d.dr;
            if (nc < 0 || nc >= cellCols || nr < 0 || nr >= cellRows || visited[nr][nc]) continue;
            walls[r][c][d.wall] = false; walls[nr][nc][d.opp] = false; carve(nc, nr);
        }
    }
    carve(0, 0);
    const cellToTile = (c, r) => ({ x: 1 + c * 2, y: 1 + r * 2 });
    const startCell = { c: 0, r: 0 }, endCell = { c: cellCols - 1, r: cellRows - 1 };
    const queue = [{ ...startCell, path: [startCell] }], seen = new Set(['0,0']);
    let mazePath = null;
    while (queue.length > 0) {
        const cur = queue.shift();
        if (cur.c === endCell.c && cur.r === endCell.r) { mazePath = cur.path; break; }
        for (const d of cellDirs) {
            const nc = cur.c + d.dc, nr = cur.r + d.dr;
            if (nc < 0 || nc >= cellCols || nr < 0 || nr >= cellRows) continue;
            if (walls[cur.r][cur.c][d.wall]) continue;
            const k = `${nc},${nr}`;
            if (seen.has(k)) continue;
            seen.add(k); queue.push({ c: nc, r: nr, path: [...cur.path, { c: nc, r: nr }] });
        }
    }
    if (!mazePath) mazePath = [startCell, endCell];
    const tilePath = [];
    for (let i = 0; i < mazePath.length; i++) {
        const t = cellToTile(mazePath[i].c, mazePath[i].r); tilePath.push(t);
        if (i < mazePath.length - 1) {
            const nt = cellToTile(mazePath[i+1].c, mazePath[i+1].r);
            tilePath.push({ x: (t.x + nt.x) / 2, y: (t.y + nt.y) / 2 });
        }
    }
    const startTile = cellToTile(0, 0), endTile = cellToTile(endCell.c, endCell.r);
    return [{ x: 0, y: startTile.y }, ...tilePath, { x: cols - 1, y: endTile.y }];
}

// ─── Generator 9: Pinwheel ───────────────────────────────────────────────────

function _pinwheelGenerator(cols, rows) {
    const path = [];
    const addPt = (x, y) => path.push({
        x: Math.max(0, Math.min(cols - 1, x)),
        y: Math.max(0, Math.min(rows - 1, y))
    });
    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2), margin = 1;

    // Entry: top edge down to hub
    for (let y = 0; y < cy; y++) addPt(cx, y);

    // East arm: hub → right edge → back to hub
    for (let x = cx; x <= cols - 1 - margin; x++) addPt(x, cy);
    for (let x = cols - 1 - margin; x >= cx; x--) addPt(x, cy);

    // South arm: hub → bottom edge → back to hub
    for (let y = cy; y <= rows - 1 - margin; y++) addPt(cx, y);
    for (let y = rows - 1 - margin; y >= cy; y--) addPt(cx, y);

    // West arm: hub → left edge → back to hub
    for (let x = cx; x >= margin; x--) addPt(x, cy);
    for (let x = margin; x <= cx; x++) addPt(x, cy);

    // Final point is (cx, cy) — the base, at the hub
    return path;
}

// ─── Generator 11: Siege (multi-path) ────────────────────────────────────────

function _siegeGenerator(cols, rows) {
    const laneXs = [
        Math.floor(cols * 0.18),
        Math.floor(cols * 0.50),
        Math.floor(cols * 0.82),
    ];
    const baseX = Math.floor(cols / 2), baseY = rows - 1, mergeY = rows - 3;

    return laneXs.map(lx => {
        const path = [], visited = new Set();
        const key = (x, y) => `${x},${y}`;
        const addPt = (x, y) => {
            x = Math.max(0, Math.min(cols - 1, x));
            y = Math.max(0, Math.min(rows - 1, y));
            if (!visited.has(key(x, y))) { visited.add(key(x, y)); path.push({ x, y }); }
        };
        for (let y = 0; y <= mergeY; y++) addPt(lx, y);
        const dir = Math.sign(baseX - lx);
        if (dir !== 0)
            for (let x = lx + dir; x !== baseX + dir; x += dir) addPt(x, mergeY);
        for (let y = mergeY + 1; y <= baseY; y++) addPt(baseX, y);
        return path;
    });
}

// ─── Generator 12: River Delta (multi-path) ──────────────────────────────────

function _deltaGenerator(cols, rows) {
    const baseX = Math.floor(cols / 2);
    const neckFx = baseX / (cols - 1);
    const neckY  = Math.floor(rows * 0.62);

    return [{ fx: 0.10, fy: 0.0 }, { fx: 0.90, fy: 0.0 }].map(entry =>
        _skeletonWalk(
            [
                entry,
                { fx: neckFx, fy: neckY / (rows - 1) },
                { fx: neckFx, fy: 1.0 }
            ],
            cols, rows
        )
    );
}

// ─── Fallback Walk ────────────────────────────────────────────────────────────

// ─── Generator 13: U-Turn (multi-path) ───────────────────────────────────────
// Two lanes from top-left and top-right corners descend to a shared base at
// the bottom-center. Returns array of 2 path arrays.

function _uturnGenerator(cols, rows) {
    const laneXs = [
        Math.floor(cols * 0.15),
        Math.floor(cols * 0.85),
    ];
    const baseX  = Math.floor(cols / 2);
    const baseY  = rows - 1;
    const mergeY = rows - 3; // lanes converge 2 rows above base

    return laneXs.map(lx => {
        const path = [], visited = new Set();
        const key = (x, y) => `${x},${y}`;
        const addPt = (x, y) => {
            x = Math.max(0, Math.min(cols - 1, x));
            y = Math.max(0, Math.min(rows - 1, y));
            if (!visited.has(key(x, y))) { visited.add(key(x, y)); path.push({ x, y }); }
        };

        // Descend the lane from top to merge row
        for (let y = 0; y <= mergeY; y++) addPt(lx, y);
        // Converge horizontally toward base column
        const dir = Math.sign(baseX - lx);
        if (dir !== 0)
            for (let x = lx + dir; x !== baseX + dir; x += dir) addPt(x, mergeY);
        // Final descent to base
        for (let y = mergeY + 1; y <= baseY; y++) addPt(baseX, y);

        return path;
    });
}

function _fallbackWalk(cols, rows) {
    const edgeConfigs = [
        { startEdge: 'left', endEdge: 'right' },
        { startEdge: 'top',  endEdge: 'bottom' },
        { startEdge: 'left', endEdge: 'bottom' },
    ];
    const { startEdge, endEdge } = edgeConfigs[Math.floor(Math.random() * edgeConfigs.length)];
    const startPos = _edgeEntry(startEdge, cols, rows);
    const endPos   = _edgeEntry(endEdge,   cols, rows);
    const visited  = new Set(), path = [];
    let { x, y } = startPos;
    const key = (x, y) => `${x},${y}`;
    visited.add(key(x, y)); path.push({ x, y });
    const dirs = [{ dx:1,dy:0 },{ dx:-1,dy:0 },{ dx:0,dy:1 },{ dx:0,dy:-1 }];
    const maxSteps = cols * rows * 2;
    for (let step = 0; step < maxSteps; step++) {
        if (Math.abs(x - endPos.x) + Math.abs(y - endPos.y) === 1) {
            path.push({ x: endPos.x, y: endPos.y }); break;
        }
        const dx = endPos.x - x, dy = endPos.y - y;
        const dist = Math.abs(dx) + Math.abs(dy);
        const candidates = dirs.map(d => {
            const nx = x + d.dx, ny = y + d.dy;
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return null;
            if (visited.has(key(nx, ny))) return null;
            const adjCount = dirs
                .filter(od => !(od.dx === -d.dx && od.dy === -d.dy))
                .filter(od => {
                    const ax = nx + od.dx, ay = ny + od.dy;
                    return ax >= 0 && ax < cols && ay >= 0 && ay < rows && visited.has(key(ax, ay));
                }).length;
            if (adjCount > 1) return null;
            const newDist = Math.abs(endPos.x - nx) + Math.abs(endPos.y - ny);
            return { nx, ny, weight: (newDist < dist ? 3 : 1) + Math.random() * 1.5 };
        }).filter(Boolean);
        if (candidates.length === 0) break;
        candidates.sort((a, b) => b.weight - a.weight);
        x = candidates[0].nx; y = candidates[0].ny;
        visited.add(key(x, y)); path.push({ x, y });
    }
    return path;
}

function _edgeEntry(edge, cols, rows) {
    switch (edge) {
        case 'left':   return { x: 0,        y: _rand(1, rows - 2) };
        case 'right':  return { x: cols - 1, y: _rand(1, rows - 2) };
        case 'top':    return { x: _rand(1, cols - 2), y: 0 };
        case 'bottom': return { x: _rand(1, cols - 2), y: rows - 1 };
    }
}

function _rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}