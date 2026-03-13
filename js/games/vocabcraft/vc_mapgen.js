// vc_mapgen.js — Map generation with named templates
// Supports: skeleton-walk, dedicated spiral, figure-8

export const TILE_PATH  = 0;
export const TILE_GRASS = 1;
export const TILE_ROCK  = 2;

// ─── Template Catalogue ───────────────────────────────────────────────────────
// skeleton: array of { fx, fy } — fractional coords (0..1) of the grid
// type: 'skeleton' | 'spiral' | 'figure8'
// minTier: first tier this template can appear

export const TEMPLATES = [
    {
        id: 'gauntlet',
        name: 'The Gauntlet',
        desc: 'One long winding road. Towers along the full length — no shortcuts.',
        minTier: 1,
        type: 'skeleton',
        // Entry left, snakes right and back, exits right
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
        desc: 'Enemies sweep down one side and back up the other. Cover both lanes.',
        minTier: 1,
        type: 'skeleton',
        skeleton: [
            { fx: 0.15, fy: 0.0  },
            { fx: 0.15, fy: 0.82 },
            { fx: 0.85, fy: 0.82 },
            { fx: 0.85, fy: 0.0  },
        ]
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
        skeleton: [] // handled by dedicated generator
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
        desc: 'Two routes cross at the center. The intersection tile is the most valuable on the map.',
        minTier: 2,
        type: 'skeleton',
        skeleton: [
            { fx: 0.0,  fy: 0.50 },
            { fx: 0.50, fy: 0.50 },
            { fx: 1.0,  fy: 0.50 },
        ]
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
 * @param {string|null} templateId — null = random from valid tier
 * @returns {{ grid, path, cols, rows, templateId }}
 */
export function generateMap(cols, rows, tier, templateId = null) {
    const valid = getValidTemplates(tier);
    let tpl = templateId
        ? TEMPLATES.find(t => t.id === templateId) || valid[0]
        : valid[Math.floor(Math.random() * valid.length)];

    // Retry up to 10 times on degenerate paths
    for (let attempt = 0; attempt < 10; attempt++) {
        let path;
        if      (tpl.type === 'spiral')     path = _spiralGenerator(cols, rows);
        else if (tpl.type === 'figure8')    path = _figure8Generator(cols, rows);
        else if (tpl.type === 'comb')       path = _combGenerator(cols, rows);
        else if (tpl.type === 'doubleloop') path = _doubleLoopGenerator(cols, rows);
        else if (tpl.type === 'labyrinth')  path = _labyrinthGenerator(cols, rows);
        else if (tpl.type === 'pinwheel')   path = _pinwheelGenerator(cols, rows);
        else                                path = _skeletonWalk(tpl.skeleton, cols, rows);

        const minLen = Math.floor(cols * rows * 0.28);
        if (path.length >= minLen) {
            const grid = _buildGrid(path, cols, rows, tier);
            return { grid, path, cols, rows, templateId: tpl.id };
        }
    }

    // Fallback: pure random walk (old behaviour) so we never return null
    const path = _fallbackWalk(cols, rows);
    const grid = _buildGrid(path, cols, rows, tier);
    return { grid, path, cols, rows, templateId: 'gauntlet' };
}

export function getWaypoints(path, tileSize) {
    return path.map(p => ({
        x: p.x * tileSize + tileSize / 2,
        y: p.y * tileSize + tileSize / 2
    }));
}

/**
 * Returns an inline SVG string for the camp-screen minimap preview.
 * @param {string} templateId
 * @param {number} w  SVG width in px
 * @param {number} h  SVG height in px
 */
export function getTemplateMinimap(templateId, w = 70, h = 90) {
    const tpl = TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return '';

    const pad = 8;
    const iw = w - pad * 2;
    const ih = h - pad * 2;
    const toX = fx => pad + fx * iw;
    const toY = fy => pad + fy * ih;

    // ── shared style tokens ───────────────────────────────────────────────────
    const bg     = '#1a252f';
    const stroke = '#3498db';
    const entry  = '#2ecc71';
    const exit   = '#e74c3c';
    const dotR   = 3;

    let pathD = '';
    let extraSvg = '';

    if (tpl.type === 'skeleton' && tpl.skeleton.length >= 2) {
        const pts = tpl.skeleton.map(p => `${toX(p.fx).toFixed(1)},${toY(p.fy).toFixed(1)}`);
        pathD = `M${pts.join('L')}`;

    } else if (tpl.type === 'spiral') {
        // Approximate a clockwise inward spiral with a parametric SVG path
        // We draw ~2 full turns from outer edge to inner centre
        const cx = w / 2, cy = h / 2;
        const turns = 2.2;
        const steps = 80;
        const rMax = Math.min(iw, ih) / 2;
        const points = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const angle = t * turns * 2 * Math.PI - Math.PI / 2;
            const r = rMax * (1 - t * 0.85);
            points.push(`${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`);
        }
        pathD = `M${points[0]}` + points.slice(1).map(p => `L${p}`).join('');
        // For spiral, override entry/exit dots with the actual start/end of the SVG path
        const p0 = points[0].split(',');
        const pN = points[points.length - 1].split(',');
        extraSvg = `
            <circle cx="${p0[0]}" cy="${p0[1]}" r="${dotR}" fill="${entry}"/>
            <circle cx="${pN[0]}" cy="${pN[1]}" r="${dotR}" fill="${exit}"/>
        `;

    } else if (tpl.type === 'figure8') {
        // Two bezier loops sharing centre point
        const cx = (w / 2).toFixed(1);
        const cy = (h / 2).toFixed(1);
        const rx = (iw * 0.38).toFixed(1);
        const ry = (ih * 0.28).toFixed(1);
        const topY  = (h * 0.18).toFixed(1);
        const botY  = (h * 0.82).toFixed(1);
        const leftX = (w * 0.10).toFixed(1);
        pathD = [
            `M${cx},${cy}`,
            `C${w*0.85},${h*0.10} ${w*0.85},${h*0.46} ${cx},${cy}`,
            `C${w*0.15},${h*0.54} ${w*0.15},${h*0.90} ${cx},${cy}`,
        ].join(' ');
        extraSvg = `
            <circle cx="${(w*0.5).toFixed(1)}" cy="${topY}" r="${dotR}" fill="${entry}"/>
            <circle cx="${(w*0.5).toFixed(1)}" cy="${botY}" r="${dotR}" fill="${exit}"/>
        `;

    } else if (tpl.type === 'comb') {
        // Horizontal spine + 4 teeth pointing upward
        const spineY = (h * 0.62).toFixed(1);
        const teethX = [0.15, 0.38, 0.62, 0.85].map(fx => (pad + fx * iw).toFixed(1));
        const toothTop = (pad + 0.08 * ih).toFixed(1);
        const spineL = pad.toFixed(1);
        const spineR = (pad + iw).toFixed(1);
        const teeth = teethX.map(tx =>
            `M${tx},${spineY} L${tx},${toothTop} L${tx},${spineY}`
        ).join(' ');
        pathD = `M${spineL},${spineY} L${spineR},${spineY} ${teeth}`;
        extraSvg = `
            <circle cx="${spineL}" cy="${spineY}" r="${dotR}" fill="${entry}"/>
            <circle cx="${spineR}" cy="${spineY}" r="${dotR}" fill="${exit}"/>
        `;

    } else if (tpl.type === 'doubleloop') {
        // Two ellipses connected by a bridge line at vertical midpoint
        const midY  = (h / 2).toFixed(1);
        const lCx   = (w * 0.27).toFixed(1);
        const rCx   = (w * 0.73).toFixed(1);
        const rx2   = (w * 0.22).toFixed(1);
        const ry2   = (h * 0.32).toFixed(1);
        pathD = [
            `M${lCx},${midY}`,
            `A${rx2},${ry2} 0 1,1 ${lCx},${(h/2+0.01).toFixed(1)}`,  // full left ellipse
            `L${rCx},${midY}`,
            `A${rx2},${ry2} 0 1,0 ${rCx},${(h/2-0.01).toFixed(1)}`,  // full right ellipse
        ].join(' ');
        extraSvg = `
            <circle cx="${(w*0.27).toFixed(1)}" cy="${(h*0.18).toFixed(1)}" r="${dotR}" fill="${entry}"/>
            <circle cx="${(w*0.73).toFixed(1)}" cy="${(h*0.82).toFixed(1)}" r="${dotR}" fill="${exit}"/>
        `;

    } else if (tpl.type === 'labyrinth') {
        // Dense winding polyline approximating a maze feel
        const pts = [
            [0.0,0.1],[0.7,0.1],[0.7,0.3],[0.2,0.3],[0.2,0.5],
            [0.8,0.5],[0.8,0.7],[0.3,0.7],[0.3,0.9],[1.0,0.9]
        ].map(([fx,fy]) => `${toX(fx).toFixed(1)},${toY(fy).toFixed(1)}`);
        pathD = `M${pts.join('L')}`;
        extraSvg = `
            <circle cx="${toX(0.0).toFixed(1)}" cy="${toY(0.1).toFixed(1)}" r="${dotR}" fill="${entry}"/>
            <circle cx="${toX(1.0).toFixed(1)}" cy="${toY(0.9).toFixed(1)}" r="${dotR}" fill="${exit}"/>
        `;

    } else if (tpl.type === 'pinwheel') {
        // 4 arms from center, each going out and back
        const cx2 = (w/2).toFixed(1), cy2 = (h/2).toFixed(1);
        const arms = [
            // N arm: center → top → center
            `M${cx2},${cy2} L${cx2},${(pad).toFixed(1)} L${cx2},${cy2}`,
            // E arm
            `M${cx2},${cy2} L${(w-pad).toFixed(1)},${cy2} L${cx2},${cy2}`,
            // S arm
            `M${cx2},${cy2} L${cx2},${(h-pad).toFixed(1)} L${cx2},${cy2}`,
            // W arm
            `M${cx2},${cy2} L${(pad).toFixed(1)},${cy2} L${cx2},${cy2}`,
        ].join(' ');
        pathD = arms;
        extraSvg = `
            <circle cx="${cx2}" cy="${pad.toFixed(1)}" r="${dotR}" fill="${entry}"/>
            <circle cx="${cx2}" cy="${(h-pad).toFixed(1)}" r="${dotR}" fill="${exit}"/>
            <circle cx="${cx2}" cy="${cy2}" r="4" fill="${stroke}" opacity="0.9"/>
        `;
    }

    // For skeleton types, draw entry/exit dots from first/last skeleton point
    let dotsHtml = extraSvg;
    if (!extraSvg && tpl.skeleton.length >= 2) {
        const s0 = tpl.skeleton[0];
        const sN = tpl.skeleton[tpl.skeleton.length - 1];
        // Waypoint dots along path
        const midDots = tpl.skeleton.slice(1, -1).map(p =>
            `<circle cx="${toX(p.fx).toFixed(1)}" cy="${toY(p.fy).toFixed(1)}" r="2" fill="${stroke}" opacity="0.6"/>`
        ).join('');
        dotsHtml = `
            ${midDots}
            <circle cx="${toX(s0.fx).toFixed(1)}" cy="${toY(s0.fy).toFixed(1)}" r="${dotR}" fill="${entry}"/>
            <circle cx="${toX(sN.fx).toFixed(1)}" cy="${toY(sN.fy).toFixed(1)}" r="${dotR}" fill="${exit}"/>
        `;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <rect width="${w}" height="${h}" rx="4" fill="${bg}"/>
        ${pathD ? `<path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>` : ''}
        ${dotsHtml}
    </svg>`;
}

// ─── Grid builder (shared) ────────────────────────────────────────────────────

function _buildGrid(path, cols, rows, tier) {
    const grid = Array(rows).fill(0).map(() => Array(cols).fill(TILE_ROCK));
    const pathSet = new Set(path.map(p => `${p.x},${p.y}`));
    path.forEach(p => { grid[p.y][p.x] = TILE_PATH; });

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] !== TILE_PATH) {
                const rockChance = 0.12 + tier * 0.015;
                grid[r][c] = Math.random() < rockChance ? TILE_ROCK : TILE_GRASS;
            }
        }
    }
    return grid;
}

// ─── Generator 1: Skeleton Walk ───────────────────────────────────────────────
// Connects skeleton control points with a biased random walk.

function _skeletonWalk(skeleton, cols, rows) {
    if (skeleton.length < 2) return _fallbackWalk(cols, rows);

    // Convert fractional skeleton to grid coords
    const points = skeleton.map(p => ({
        x: Math.round(Math.max(0, Math.min(cols - 1, p.fx * (cols - 1)))),
        y: Math.round(Math.max(0, Math.min(rows - 1, p.fy * (rows - 1))))
    }));

    const visited = new Set();
    const path = [];

    const key = (x, y) => `${x},${y}`;
    const dirs = [{ dx:1,dy:0 },{ dx:-1,dy:0 },{ dx:0,dy:1 },{ dx:0,dy:-1 }];

    // Walk segment by segment
    for (let seg = 0; seg < points.length - 1; seg++) {
        let { x, y } = points[seg];
        const goal = points[seg + 1];

        // Add first point of segment (skip duplicates)
        if (!visited.has(key(x, y))) {
            visited.add(key(x, y));
            path.push({ x, y });
        }

        const manhattan = Math.abs(goal.x - x) + Math.abs(goal.y - y);
        const budget = Math.max(manhattan * 3, 20); // allow wander but cap runaway

        for (let step = 0; step < budget; step++) {
            if (x === goal.x && y === goal.y) break;

            const dist = Math.abs(goal.x - x) + Math.abs(goal.y - y);

            const candidates = dirs
                .map(d => {
                    const nx = x + d.dx, ny = y + d.dy;
                    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return null;
                    if (visited.has(key(nx, ny))) return null;

                    // Blob prevention: no more than 1 visited neighbour (excluding where we came)
                    const adjCount = dirs
                        .filter(od => !(od.dx === -d.dx && od.dy === -d.dy))
                        .filter(od => {
                            const ax = nx + od.dx, ay = ny + od.dy;
                            return ax >= 0 && ax < cols && ay >= 0 && ay < rows && visited.has(key(ax, ay));
                        }).length;
                    if (adjCount > 1) return null;

                    const newDist = Math.abs(goal.x - nx) + Math.abs(goal.y - ny);
                    const towardGoal = newDist < dist ? 4 : 1;
                    const weight = towardGoal + Math.random() * 1.2;
                    return { nx, ny, weight };
                })
                .filter(Boolean);

            if (candidates.length === 0) {
                // Backtrack: try removing last path tile and retrying
                if (path.length > 1) {
                    const removed = path.pop();
                    visited.delete(key(removed.x, removed.y));
                    x = path[path.length - 1].x;
                    y = path[path.length - 1].y;
                }
                continue;
            }

            // Weighted pick: sort descending, pick top with some randomness
            candidates.sort((a, b) => b.weight - a.weight);
            // 80% of the time take the best candidate, 20% the second-best (if exists)
            const pick = (candidates.length > 1 && Math.random() < 0.2)
                ? candidates[1]
                : candidates[0];

            x = pick.nx;
            y = pick.ny;
            visited.add(key(x, y));
            path.push({ x, y });
        }

        // Force-connect to goal if walker stopped short
        _forceLine(x, y, goal.x, goal.y, visited, path, cols, rows);
    }

    return path;
}

// Bresenham-ish straight line to force-connect to goal when walker stalls
function _forceLine(x0, y0, x1, y1, visited, path, cols, rows) {
    let x = x0, y = y0;
    const key = (x, y) => `${x},${y}`;
    while (x !== x1 || y !== y1) {
        const dx = Math.sign(x1 - x);
        const dy = Math.sign(y1 - y);
        // Prefer whichever axis has more distance remaining
        const moveX = Math.abs(x1 - x) >= Math.abs(y1 - y) ? dx : 0;
        const moveY = moveX ? 0 : dy;
        x += moveX;
        y += moveY;
        x = Math.max(0, Math.min(cols - 1, x));
        y = Math.max(0, Math.min(rows - 1, y));
        if (!visited.has(key(x, y))) {
            visited.add(key(x, y));
            path.push({ x, y });
        }
    }
}

// ─── Generator 2: Spiral ─────────────────────────────────────────────────────
// Lays down a mathematical clockwise inward coil, then adds tile-level jitter.

function _spiralGenerator(cols, rows) {
    // Build an ideal spiral as fractional coords first, then snap to grid
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;

    // Number of "rings": how many times we go around
    const rings = Math.floor(Math.min(cols, rows) / 2) - 1;

    const path = [];
    const visited = new Set();
    const key = (x, y) => `${x},${y}`;

    // Walk the spiral layer by layer: each layer is a rectangle shrinking inward
    let left = 1, right = cols - 2, top = 1, bottom = rows - 2;

    // Entry: start at left edge, mid-height
    const entryY = Math.floor(rows / 2);
    // Connect entry point to the spiral start
    for (let x = 0; x <= left; x++) {
        const pt = { x, y: entryY };
        if (!visited.has(key(pt.x, pt.y))) {
            visited.add(key(pt.x, pt.y));
            path.push(pt);
        }
    }

    // Now spiral clockwise inward
    while (left <= right && top <= bottom) {
        // Top row: left → right
        for (let x = left; x <= right; x++) {
            const pt = { x, y: top };
            if (!visited.has(key(pt.x, pt.y))) { visited.add(key(pt.x, pt.y)); path.push(pt); }
        }
        top++;

        // Right col: top → bottom
        for (let y = top; y <= bottom; y++) {
            const pt = { x: right, y };
            if (!visited.has(key(pt.x, pt.y))) { visited.add(key(pt.x, pt.y)); path.push(pt); }
        }
        right--;

        // Bottom row: right → left
        if (top <= bottom) {
            for (let x = right; x >= left; x--) {
                const pt = { x, y: bottom };
                if (!visited.has(key(pt.x, pt.y))) { visited.add(key(pt.x, pt.y)); path.push(pt); }
            }
            bottom--;
        }

        // Left col: bottom → top
        if (left <= right) {
            for (let y = bottom; y >= top; y--) {
                const pt = { x: left, y };
                if (!visited.has(key(pt.x, pt.y))) { visited.add(key(pt.x, pt.y)); path.push(pt); }
            }
            left++;
        }
    }

    // Punch-out: connect inner-most point to bottom exit
    if (path.length > 0) {
        const last = path[path.length - 1];
        const exitX = Math.floor(cols / 2);
        _forceLine(last.x, last.y, exitX, rows - 1, visited, path, cols, rows);
    }

    return path;
}

// ─── Generator 3: Figure-8 ───────────────────────────────────────────────────
// Two rectangular loops sharing a centre crossing tile.

function _figure8Generator(cols, rows) {
    const visited = new Set();
    const path = [];
    const key = (x, y) => `${x},${y}`;

    const addPt = (x, y) => {
        x = Math.max(0, Math.min(cols - 1, x));
        y = Math.max(0, Math.min(rows - 1, y));
        // Figure-8 crossing is intentionally visited twice — don't skip on revisit
        visited.add(key(x, y));
        path.push({ x, y });
    };

    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);

    // Margins for the two loops
    const margin = 1;
    const topY    = margin;
    const botY    = rows - 1 - margin;
    const leftX   = margin;
    const rightX  = cols - 1 - margin;

    // ── Upper loop (clockwise starting from centre, going up) ────────────────
    // Entry: top edge near left-centre
    const entryX = Math.floor(cols * 0.3);
    // Connect entry edge to loop start
    for (let y = 0; y <= topY; y++) addPt(entryX, y);

    // Top-left corner
    for (let x = entryX; x >= leftX; x--) addPt(x, topY);
    // Left side going down to mid
    for (let y = topY; y <= cy; y++) addPt(leftX, y);
    // Mid row going right to centre
    for (let x = leftX; x <= cx; x++) addPt(x, cy);
    // Cross centre — going right through centre to right side
    for (let x = cx; x <= rightX; x++) addPt(x, cy - 1);
    // Right side going up to top
    for (let y = cy - 1; y >= topY; y--) addPt(rightX, y);
    // Top row from right back to entry
    for (let x = rightX; x >= entryX; x--) addPt(x, topY);
    // Back down to centre crossing
    for (let y = topY; y <= cy; y++) addPt(entryX, y);

    // ── Lower loop (clockwise, from centre going down) ───────────────────────
    // We re-enter from centre — path array already has cx,cy
    // Go left-down from centre
    for (let x = cx; x >= leftX; x--) addPt(x, cy + 1);
    // Bottom-left down to botY
    for (let y = cy + 1; y <= botY; y++) addPt(leftX, y);
    // Bottom row right to exit side
    const exitX = Math.floor(cols * 0.7);
    for (let x = leftX; x <= exitX; x++) addPt(x, botY);
    // Right side of lower loop going up to centre
    for (let y = botY; y >= cy + 1; y--) addPt(rightX, y);
    // Back across centre row from right
    for (let x = rightX; x >= cx; x--) addPt(x, cy + 1);
    // Up to centre crossing
    for (let y = cy + 1; y >= cy; y--) addPt(cx, y);

    // Exit to bottom edge
    for (let y = cy; y <= rows - 1; y++) addPt(exitX, y);

    return path;
}

// ─── Generator 4: Zigzag ─────────────────────────────────────────────────────
// Handled by _skeletonWalk — skeleton defined in TEMPLATES above.
// (No dedicated generator needed.)

// ─── Generator 5: Crossroads ─────────────────────────────────────────────────
// Handled by _skeletonWalk — single horizontal pass through center.

// ─── Generator 6: Comb ───────────────────────────────────────────────────────
// Horizontal spine + 4 teeth. Each tooth is walked out and back.

function _combGenerator(cols, rows) {
    const path = [];
    const visited = new Set();
    const key = (x, y) => `${x},${y}`;

    // addPt allows revisit (teeth are walked twice: out and back)
    const addPt = (x, y) => {
        x = Math.max(0, Math.min(cols - 1, x));
        y = Math.max(0, Math.min(rows - 1, y));
        visited.add(key(x, y));
        path.push({ x, y });
    };

    const spineY = Math.floor(rows * 0.65);
    const toothTop = 1;
    // 4 tooth columns evenly spaced, avoiding map edges
    const toothCols = [
        Math.floor(cols * 0.15),
        Math.floor(cols * 0.38),
        Math.floor(cols * 0.62),
        Math.floor(cols * 0.85),
    ];

    // Entry: left edge → spine
    for (let x = 0; x <= toothCols[0]; x++) addPt(x, spineY);

    toothCols.forEach((tx, i) => {
        // Walk up tooth
        for (let y = spineY; y >= toothTop; y--) addPt(tx, y);
        // Walk back down
        for (let y = toothTop; y <= spineY; y++) addPt(tx, y);
        // Walk spine to next tooth (or exit)
        const nextX = i < toothCols.length - 1 ? toothCols[i + 1] : cols - 1;
        const dir = nextX > tx ? 1 : -1;
        for (let x = tx + dir; x !== nextX + dir; x += dir) addPt(x, spineY);
    });

    return path;
}

// ─── Generator 7: Double Loop ─────────────────────────────────────────────────
// Two rectangular ovals joined by a horizontal bridge at vertical midpoint.

function _doubleLoopGenerator(cols, rows) {
    const path = [];
    const key = (x, y) => `${x},${y}`;
    const addPt = (x, y) => {
        x = Math.max(0, Math.min(cols - 1, x));
        y = Math.max(0, Math.min(rows - 1, y));
        path.push({ x, y });
    };

    const midY  = Math.floor(rows / 2);
    const margin = 1;
    const bridgeY = midY;

    // Left loop bounds
    const lLeft  = margin;
    const lRight = Math.floor(cols * 0.45);
    const lTop   = margin;
    const lBot   = rows - 1 - margin;

    // Right loop bounds
    const rLeft  = Math.floor(cols * 0.55);
    const rRight = cols - 1 - margin;
    const rTop   = margin;
    const rBot   = rows - 1 - margin;

    // Entry: top-left of left loop
    addPt(lLeft, lTop);

    // Left loop clockwise: top → right → bottom → left → back to bridge entry
    for (let x = lLeft; x <= lRight; x++) addPt(x, lTop);
    for (let y = lTop; y <= lBot; y++)   addPt(lRight, y);
    for (let x = lRight; x >= lLeft; x--) addPt(x, lBot);
    for (let y = lBot; y >= bridgeY; y--) addPt(lLeft, y);

    // Bridge: left → right
    for (let x = lLeft; x <= rRight; x++) addPt(x, bridgeY);

    // Right loop clockwise: continue from bridge entry on right side
    for (let y = bridgeY; y >= rTop; y--) addPt(rRight, y);
    for (let x = rRight; x >= rLeft; x--) addPt(x, rTop);
    for (let y = rTop; y <= rBot; y++)   addPt(rLeft, y);
    for (let x = rLeft; x <= rRight; x++) addPt(x, rBot);

    // Exit: bottom-right
    addPt(rRight, rows - 1);

    return path;
}

// ─── Generator 8: Labyrinth ───────────────────────────────────────────────────
// Recursive-backtracking maze on a half-resolution cell grid, scaled up.
// Guarantees a single connected path from entry to exit.

function _labyrinthGenerator(cols, rows) {
    // Work in "cell" space: each cell = 2×2 tiles, separated by 1-tile walls
    // Cell grid: cellCols × cellRows
    const cellCols = Math.floor((cols - 1) / 2);
    const cellRows = Math.floor((rows - 1) / 2);

    // DFS maze carving
    const visited = Array(cellRows).fill(0).map(() => Array(cellCols).fill(false));
    const walls   = Array(cellRows).fill(0).map(() => Array(cellCols).fill(0).map(() => ({
        N: true, S: true, E: true, W: true
    })));

    const cellDirs = [
        { dc: 0, dr: -1, wall: 'N', opp: 'S' },
        { dc: 0, dr:  1, wall: 'S', opp: 'N' },
        { dc: 1, dr:  0, wall: 'E', opp: 'W' },
        { dc:-1, dr:  0, wall: 'W', opp: 'E' },
    ];

    function carve(c, r) {
        visited[r][c] = true;
        const dirs = cellDirs.slice().sort(() => Math.random() - 0.5);
        for (const d of dirs) {
            const nc = c + d.dc, nr = r + d.dr;
            if (nc < 0 || nc >= cellCols || nr < 0 || nr >= cellRows) continue;
            if (visited[nr][nc]) continue;
            walls[r][c][d.wall] = false;
            walls[nr][nc][d.opp] = false;
            carve(nc, nr);
        }
    }
    carve(0, 0);

    // Convert cell maze → tile path using BFS to find the actual route
    // Cell (c,r) maps to tile (1 + c*2, 1 + r*2)
    const cellToTile = (c, r) => ({ x: 1 + c * 2, y: 1 + r * 2 });
    const startCell = { c: 0, r: 0 };
    const endCell   = { c: cellCols - 1, r: cellRows - 1 };

    // BFS through the carved maze
    const queue = [{ ...startCell, path: [startCell] }];
    const seen  = new Set([`0,0`]);
    let mazePath = null;

    while (queue.length > 0) {
        const cur = queue.shift();
        if (cur.c === endCell.c && cur.r === endCell.r) { mazePath = cur.path; break; }
        for (const d of cellDirs) {
            const nc = cur.c + d.dc, nr = cur.r + d.dr;
            if (nc < 0 || nc >= cellCols || nr < 0 || nr >= cellRows) continue;
            if (walls[cur.r][cur.c][d.wall]) continue; // wall present
            const k = `${nc},${nr}`;
            if (seen.has(k)) continue;
            seen.add(k);
            queue.push({ c: nc, r: nr, path: [...cur.path, { c: nc, r: nr }] });
        }
    }

    if (!mazePath) mazePath = [startCell, endCell];

    // Expand cell path → tile path (include wall tiles between cells)
    const tilePath = [];
    for (let i = 0; i < mazePath.length; i++) {
        const t = cellToTile(mazePath[i].c, mazePath[i].r);
        tilePath.push(t);
        if (i < mazePath.length - 1) {
            // Add the wall tile between this cell and next
            const nt = cellToTile(mazePath[i + 1].c, mazePath[i + 1].r);
            tilePath.push({ x: (t.x + nt.x) / 2, y: (t.y + nt.y) / 2 });
        }
    }

    // Connect entry (0, startY) → first cell tile, and last cell tile → exit
    const startTile = cellToTile(0, 0);
    const endTile   = cellToTile(endCell.c, endCell.r);
    const fullPath  = [
        { x: 0, y: startTile.y },
        ...tilePath,
        { x: cols - 1, y: endTile.y }
    ];

    return fullPath;
}

// ─── Generator 9: Pinwheel ───────────────────────────────────────────────────
// 4 arms from center, each walks out to near-edge and back.

function _pinwheelGenerator(cols, rows) {
    const path = [];
    const key = (x, y) => `${x},${y}`;
    const addPt = (x, y) => {
        x = Math.max(0, Math.min(cols - 1, x));
        y = Math.max(0, Math.min(rows - 1, y));
        path.push({ x, y });
    };

    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    const margin = 1;

    // Entry from top edge down to center
    for (let y = 0; y <= cy; y++) addPt(cx, y);

    // North arm: already at center from entry — arm tip is at top (done above)
    // East arm: center → right edge → center
    for (let x = cx; x <= cols - 1 - margin; x++) addPt(x, cy);
    for (let x = cols - 1 - margin; x >= cx; x--) addPt(x, cy);

    // South arm: center → bottom edge → center
    for (let y = cy; y <= rows - 1 - margin; y++) addPt(cx, y);
    for (let y = rows - 1 - margin; y >= cy; y--) addPt(cx, y);

    // West arm: center → left edge → center
    for (let x = cx; x >= margin; x--) addPt(x, cy);
    for (let x = margin; x <= cx; x++) addPt(x, cy);

    // Exit center → bottom edge
    for (let y = cy; y <= rows - 1; y++) addPt(cx, y);

    return path;
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

    const visited = new Set();
    const path = [];
    let { x, y } = startPos;
    const key = (x, y) => `${x},${y}`;
    visited.add(key(x, y));
    path.push({ x, y });

    const dirs = [{ dx:1,dy:0 },{ dx:-1,dy:0 },{ dx:0,dy:1 },{ dx:0,dy:-1 }];
    const maxSteps = cols * rows * 2;

    for (let step = 0; step < maxSteps; step++) {
        if (Math.abs(x - endPos.x) + Math.abs(y - endPos.y) === 1) {
            path.push({ x: endPos.x, y: endPos.y });
            break;
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
            const weight = (newDist < dist ? 3 : 1) + Math.random() * 1.5;
            return { nx, ny, weight };
        }).filter(Boolean);

        if (candidates.length === 0) break;
        candidates.sort((a, b) => b.weight - a.weight);
        x = candidates[0].nx;
        y = candidates[0].ny;
        visited.add(key(x, y));
        path.push({ x, y });
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