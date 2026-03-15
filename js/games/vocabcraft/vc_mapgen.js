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
        desc: 'Enemies enter top-left, sweep down the left side, cross the bottom, then climb back up to exit top-right. Full perimeter exposure.',
        minTier: 1,
        type: 'uturn',
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
            { fx: 0.0,  fy: 0.05 },
            { fx: 1.0,  fy: 0.05 },
            { fx: 0.0,  fy: 0.95 },
            { fx: 1.0,  fy: 0.95 },
        ]
    },
    {
        id: 'spiral',
        name: 'Spiral-In',
        desc: 'Enemies coil inward from the edge. The center tile sees everything — guard it.',
        minTier: 4,
        type: 'spiral',
        skeleton: []
    },
    {
        id: 'figure8',
        name: 'Figure-8',
        desc: 'Two loops share a crossing at the center. One tower there covers the whole map.',
        minTier: 2,
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
        id: 'trident',
        name: 'Trident',
        desc: 'Three spawners in three arms converge on a base in the fourth. Asymmetric pressure — no side is safe.',
        minTier: 3,
        type: 'trident',
        multiPath: true,
        skeleton: []
    },
    {
        id: 'comb',
        name: 'The Comb',
        desc: 'A spine with four teeth. Enemies dip into each tooth and back — short exposure windows.',
        minTier: 1,
        type: 'comb',
        skeleton: []
    },
    {
        id: 'doubleloop',
        name: 'Double Loop',
        desc: 'Two ovals joined by a bridge. Enemies run the full circuit twice — plan for both halves.',
        minTier: 2,
        type: 'doubleloop',
        skeleton: []
    },
    {
        id: 'labyrinth',
        name: 'Labyrinth',
        desc: 'A dense winding maze. The longest path on the smallest space — traps are essential.',
        minTier: 1,
        type: 'labyrinth',
        skeleton: []
    },
    {
        id: 'fourcorners',
        name: 'Four Corners',
        desc: 'Enemies spawn at all four corners and converge on your base at the center. No single approach — total encirclement.',
        minTier: 5,
        type: 'fourcorners',
        multiPath: true,
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


/**
 * Returns hex grid positions for the world map.
 * Pointy-top hexagons arranged in an offset grid.
 * Each entry: { templateId, col, row, tier }
 * Tier 1=easy(green), 2=medium(yellow), 3=hard(orange), 4=vhard(red), 5=extreme(purple)
 */
export function getHexWorldLayout() {
    // Flat-top hex grid. col%2===1 shifts down by half a row.
    // Groups are arranged so same-tier hexes share edges.
    // Tier 1 (6 maps): 2 columns of 3, cols 0-1
    // Tier 2 (4 maps): 2 columns of 2, cols 2-3
    // Tier 3 (2 maps): col 4, rows 0-1
    // Tier 4 (1 map):  col 4, row 2 (or 5, 0)
    // Tier 5 (1 map):  col 5, row 0
    return [
        // Tier 1 — Easy (green) — 6 maps in a 2×3 block
        { id: 'gauntlet',    hexCol: 0, hexRow: 0, tier: 1 },
        { id: 'zigzag',      hexCol: 0, hexRow: 1, tier: 1 },
        { id: 'uturn',       hexCol: 0, hexRow: 2, tier: 1 },
        { id: 'scurve',      hexCol: 1, hexRow: 0, tier: 1 },
        { id: 'labyrinth',   hexCol: 1, hexRow: 1, tier: 1 },
        { id: 'comb',        hexCol: 1, hexRow: 2, tier: 1 },
        // Tier 2 — Medium (yellow) — 4 maps in a 2×2 block
        { id: 'zslash',      hexCol: 2, hexRow: 0, tier: 2 },
        { id: 'doubleloop',  hexCol: 2, hexRow: 1, tier: 2 },
        { id: 'figure8',     hexCol: 3, hexRow: 0, tier: 2 },
        { id: 'delta',       hexCol: 3, hexRow: 1, tier: 2 },
        // Tier 3 — Hard (orange) — 2 maps stacked
        { id: 'siege',       hexCol: 4, hexRow: 0, tier: 3 },
        { id: 'trident',     hexCol: 4, hexRow: 1, tier: 3 },
        // Tier 4 — Very Hard (red)
        { id: 'spiral',      hexCol: 5, hexRow: 0, tier: 4 },
        // Tier 5 — Extreme (purple)
        { id: 'fourcorners', hexCol: 5, hexRow: 1, tier: 5 },
    ];
}

export const HEX_TIER_COLORS = {
    1: { bg: '#1a3d1a', border: '#2ecc71', label: 'Easy' },
    2: { bg: '#3d3200', border: '#f1c40f', label: 'Medium' },
    3: { bg: '#3d1a00', border: '#e67e22', label: 'Hard' },
    4: { bg: '#3d0a0a', border: '#e74c3c', label: 'Very Hard' },
    5: { bg: '#2a0a3d', border: '#9b59b6', label: 'Extreme' },
};

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
        else if (tpl.type === 'trident')    paths = _tridentGenerator(cols, rows);
        else if (tpl.type === 'fourcorners') paths = _fourCornersGenerator(cols, rows);
        else if (tpl.type === 'siege')      paths = _siegeGenerator(cols, rows);
        else if (tpl.type === 'delta')      paths = _deltaGenerator(cols, rows);
        else if (tpl.type === 'uturn')      paths = _uturnGenerator(cols, rows);
        else                                paths = [_skeletonWalk(tpl.skeleton, cols, rows)];

        const allTiles   = paths.flat();
        // Use raw length (not unique) — repeat-visit generators like pinwheel and
        // crossroads intentionally revisit tiles; unique count would undercount them.
        // 15% threshold: all generators pass on first attempt on a 9×13 grid.
        const minLen     = Math.floor(cols * rows * 0.15);

        if (allTiles.length >= minLen) {
            const grid = _buildGrid(allTiles, cols, rows, tier);
            const wallEdges = _buildWallEdges(paths, grid, cols, rows);
            return { grid, paths, cols, rows, templateId: tpl.id, usedFallback: false, wallEdges };
        }
    }

    // Fallback: gauntlet so we never return null.
    // usedFallback:true lets the caller show a warning notification.
    console.warn(`[VocabCraft] Map gen failed after 10 attempts — falling back to gauntlet.`);
    const fallbackPath = _skeletonWalk(TEMPLATES[0].skeleton, cols, rows);
    const grid = _buildGrid(fallbackPath, cols, rows, tier);
    const wallEdges = _buildWallEdges([fallbackPath], grid, cols, rows);
    return { grid, paths: [fallbackPath], cols, rows, templateId: 'gauntlet', usedFallback: true, wallEdges };
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
        // Single U: spawn top-left, down left side, across bottom, up to exit top-right
        const lx  = toX(0.07).toFixed(1), rx = toX(0.93).toFixed(1);
        const topY = String(pad),          botY = toY(0.92).toFixed(1);
        pathD    = `M${lx},${topY} L${lx},${botY} L${rx},${botY} L${rx},${topY}`;
        extraSvg = `
            <circle cx="${lx}" cy="${topY}" r="${dotR}" fill="${entry}"/>
            <circle cx="${rx}" cy="${topY}" r="${dotR+1}" fill="${exit}"/>
            <circle cx="${rx}" cy="${topY}" r="6" fill="none" stroke="${exit}" stroke-width="1.5" opacity="0.6"/>
        `;

    } else if (tpl.type === 'trident') {
        // 3 spawners → base bottom-right
        const bx = (w-pad).toFixed(1), by = (h-pad).toFixed(1);
        const s1x = (pad+iw*0.1).toFixed(1), s1y = String(pad);   // top-left
        const s2x = (w-pad).toFixed(1),       s2y = String(pad);   // top-right
        const s3x = String(pad),               s3y = (h/2).toFixed(1); // left-mid
        extraSvg = `
            <path d="M${s1x},${s1y} L${bx},${by}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
            <path d="M${s2x},${s2y} L${bx},${by}" fill="none" stroke="${stroke2}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
            <path d="M${s3x},${s3y} L${bx},${by}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
            <circle cx="${s1x}" cy="${s1y}" r="${dotR}" fill="${entry}"/>
            <circle cx="${s2x}" cy="${s2y}" r="${dotR}" fill="${entry}"/>
            <circle cx="${s3x}" cy="${s3y}" r="${dotR}" fill="${entry}"/>
            <circle cx="${bx}" cy="${by}" r="${dotR+1}" fill="${exit}"/>
            <circle cx="${bx}" cy="${by}" r="6" fill="none" stroke="${exit}" stroke-width="1.5" opacity="0.6"/>`;

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

    } else if (tpl.type === 'fourcorners') {
        const cx2 = (w/2).toFixed(1), cy2 = (h/2).toFixed(1);
        const tl = [String(pad), String(pad)];
        const tr = [(w-pad).toFixed(1), String(pad)];
        const bl = [String(pad), (h-pad).toFixed(1)];
        const br = [(w-pad).toFixed(1), (h-pad).toFixed(1)];
        extraSvg = `
            <path d="M${tl[0]},${tl[1]} L${cx2},${cy2}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
            <path d="M${tr[0]},${tr[1]} L${cx2},${cy2}" fill="none" stroke="${stroke2}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
            <path d="M${bl[0]},${bl[1]} L${cx2},${cy2}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
            <path d="M${br[0]},${br[1]} L${cx2},${cy2}" fill="none" stroke="${stroke2}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
            <circle cx="${tl[0]}" cy="${tl[1]}" r="${dotR}" fill="${entry}"/>
            <circle cx="${tr[0]}" cy="${tr[1]}" r="${dotR}" fill="${entry}"/>
            <circle cx="${bl[0]}" cy="${bl[1]}" r="${dotR}" fill="${entry}"/>
            <circle cx="${br[0]}" cy="${br[1]}" r="${dotR}" fill="${entry}"/>
            <circle cx="${cx2}" cy="${cy2}" r="${dotR+1}" fill="${exit}"/>
            <circle cx="${cx2}" cy="${cy2}" r="8" fill="none" stroke="${exit}" stroke-width="1.5" opacity="0.6"/>`;

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

// ─── Wall Edge Builder ────────────────────────────────────────────────────────
// Draws a visible wall between two adjacent path tiles ONLY when no path
// EVER traverses the edge between them in either direction.
//
// Tiles visited multiple times (crossroads hub, pinwheel centre, spiral corners)
// are handled correctly because we record every consecutive pair A→B and also
// treat it as B→A via the canonical edge key.
//
// Returns array of { r, c, dir:'E'|'S' }
//   'E' = wall on the RIGHT edge of tile (r,c)
//   'S' = wall on the BOTTOM edge of tile (r,c)

function _buildWallEdges(paths, grid, cols, rows) {
    // Canonical undirected edge key — A↔B and B↔A map to the same string
    const edgeKey = (r1, c1, r2, c2) =>
        (r1 < r2 || (r1 === r2 && c1 < c2))
            ? `${r1},${c1}|${r2},${c2}`
            : `${r2},${c2}|${r1},${c1}`;

    const traversed = new Set();
    for (const path of paths) {
        for (let i = 0; i + 1 < path.length; i++) {
            const a = path[i], b = path[i + 1];
            if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) continue;
            traversed.add(edgeKey(a.y, a.x, b.y, b.x));
        }
    }

    const walls = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] !== TILE_PATH) continue;
            if (c + 1 < cols && grid[r][c + 1] === TILE_PATH &&
                !traversed.has(edgeKey(r, c, r, c + 1))) walls.push({ r, c, dir: 'E' });
            if (r + 1 < rows && grid[r + 1][c] === TILE_PATH &&
                !traversed.has(edgeKey(r, c, r + 1, c))) walls.push({ r, c, dir: 'S' });
        }
    }
    return walls;
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
// Axis-aligned segments use _forceLine (straight, deterministic).
// Diagonal segments use _mathLine (parametric — simple, finite, cardinal-adjacent).

function _skeletonWalk(skeleton, cols, rows) {
    if (skeleton.length < 2) return _fallbackWalk(cols, rows);

    const points = skeleton.map(p => ({
        x: Math.round(Math.max(0, Math.min(cols - 1, p.fx * (cols - 1)))),
        y: Math.round(Math.max(0, Math.min(rows - 1, p.fy * (rows - 1))))
    }));

    const visited = new Set();
    const path    = [];
    const key     = (x, y) => `${x},${y}`;

    for (let seg = 0; seg < points.length - 1; seg++) {
        const { x: sx, y: sy } = points[seg];
        const goal = points[seg + 1];

        if (!visited.has(key(sx, sy))) { visited.add(key(sx, sy)); path.push({ x: sx, y: sy }); }

        const isDiagonal = (goal.x !== sx) && (goal.y !== sy);

        if (isDiagonal) {
            // Parametric math-line: clean, finite, cardinal-adjacent
            _mathLine(sx, sy, goal.x, goal.y, visited, path, cols, rows);
        } else {
            _forceLine(sx, sy, goal.x, goal.y, visited, path, cols, rows);
        }
    }
    return path;
}

// ─── Parametric Math Line ─────────────────────────────────────────────────────
// Follows the mathematically closest axis-aligned (4-way) path to the ideal
// straight line between two points.  At each step we advance whichever axis is
// furthest behind the ideal line — this is the Bresenham "closest to the line"
// rule, guaranteeing every consecutive tile pair is cardinally adjacent and the
// overall route hugs the diagonal as tightly as possible on a grid.
function _mathLine(x0, y0, x1, y1, visited, path, cols, rows) {
    // Classic Bresenham line — every step is strictly cardinal (H or V, never diagonal).
    // err accumulates the fractional offset from the ideal line × 2*absDx.
    // When err crosses zero we take a vertical step; otherwise horizontal.
    // Total steps = |dx| + |dy|, so the loop is always finite.
    const key = (x, y) => `${x},${y}`;
    const absDx = Math.abs(x1 - x0), absDy = Math.abs(y1 - y0);
    const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
    const steps = absDx + absDy;
    if (steps === 0) return;
    let x = x0, y = y0, err = 0;
    for (let i = 0; i < steps; i++) {
        // Move horizontally when doing so stays closest to the ideal line.
        // Standard integer Bresenham decision: pick H if err + absDy < absDx / 2,
        // equivalently 2*(err + absDy) < absDx.  Otherwise pick V.
        if (absDy === 0 || (absDx > 0 && 2 * (err + absDy) < absDx)) {
            x = Math.max(0, Math.min(cols - 1, x + sx));
            err += absDy;
        } else {
            y = Math.max(0, Math.min(rows - 1, y + sy));
            err -= absDx;
        }
        if (!visited.has(key(x, y))) { visited.add(key(x, y)); path.push({ x, y }); }
    }
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
// ─── Cardinal Bridge Post-Pass ────────────────────────────────────────────────
// Any generator may produce a path array with non-adjacent consecutive entries
// (because visited-set deduplication skips tiles already in the path, leaving
// gaps).  This pass inserts the missing intermediate tiles using a simple
// cardinal walk so every consecutive pair in the final path is exactly 1 step
// apart.  Does NOT deduplicate — re-visits are intentional (crossroads hub etc).
function _ensureCardinal(path, cols, rows) {
    const result = [];
    for (let i = 0; i < path.length; i++) {
        result.push(path[i]);
        if (i + 1 >= path.length) break;
        let { x, y } = path[i];
        const { x: tx, y: ty } = path[i + 1];
        while (x !== tx || y !== ty) {
            const dx = tx - x, dy = ty - y;
            if (Math.abs(dx) >= Math.abs(dy) && dx !== 0)
                x += dx > 0 ? 1 : -1;
            else
                y += dy > 0 ? 1 : -1;
            x = Math.max(0, Math.min(cols - 1, x));
            y = Math.max(0, Math.min(rows - 1, y));
            if (x !== tx || y !== ty) result.push({ x, y });
        }
    }
    return result;
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
    return _ensureCardinal(path, cols, rows);
}

// ─── Generator 3: Figure-8 ───────────────────────────────────────────────────

function _figure8Generator(cols, rows) {
    // Two rectangular loops sharing the horizontal center row (cy).
    // Every transition is an explicit cardinal run — no diagonal jumps.
    // Entry: top border at entryX, descends to cy.
    // Top loop:    left along cy → up left wall → right across top → down right wall → back to cy.
    // Crossing:    right-to-left along cy to cx (the shared hub tile).
    // Bottom loop: cx right along cy → down right wall → left across bottom → up left wall → cy.
    // Exit:        right along cy to exitX → down to bottom border.
    const path = [];
    const addPt = (x, y) => path.push({
        x: Math.max(0, Math.min(cols - 1, x)),
        y: Math.max(0, Math.min(rows - 1, y))
    });
    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    const margin = 1;
    const topY = margin, botY = rows - 1 - margin;
    const leftX = margin, rightX = cols - 1 - margin;
    // entryX: midpoint of left half;  exitX: midpoint of right half
    const entryX = leftX + Math.floor((cx - leftX) / 2);
    const exitX  = cx    + Math.floor((rightX - cx) / 2);

    // Entry: top border down to cy
    for (let y = 0; y <= cy; y++) addPt(entryX, y);

    // Top loop (counter-clockwise when viewed normally):
    for (let x = entryX - 1; x >= leftX; x--) addPt(x, cy);    // left along cy
    for (let y = cy - 1; y >= topY; y--)       addPt(leftX, y); // up left wall
    for (let x = leftX + 1; x <= rightX; x++)  addPt(x, topY);  // right across top
    for (let y = topY + 1; y <= cy; y++)        addPt(rightX, y);// down right wall to cy

    // Crossing: right → left along cy back to hub
    for (let x = rightX - 1; x >= cx; x--)    addPt(x, cy);

    // Bottom loop:
    for (let x = cx + 1; x <= rightX; x++)     addPt(x, cy);    // right along cy
    for (let y = cy + 1; y <= botY; y++)        addPt(rightX, y);// down right wall
    for (let x = rightX - 1; x >= leftX; x--) addPt(x, botY);   // left across bottom
    for (let y = botY - 1; y >= cy; y--)        addPt(leftX, y); // up left wall to cy

    // Exit: left → right along cy to exitX, then down to bottom border
    for (let x = leftX + 1; x <= exitX; x++)   addPt(x, cy);
    for (let y = cy + 1; y < rows; y++)         addPt(exitX, y);

    return path;
}
// ─── Generator: Trident (multi-path) ────────────────────────────────────────
// 3 spawners: top-left, top-right, left-middle → base at bottom-right corner.

function _tridentGenerator(cols, rows) {
    const baseX = cols - 2, baseY = rows - 2;
    const spawns = [
        { x: 1,              y: 0 },           // top-left
        { x: cols - 2,       y: 0 },           // top-right
        { x: 0,              y: Math.floor(rows / 2) }  // left-middle
    ];
    return spawns.map(spawn => {
        const path = [], visited = new Set();
        const key = (x, y) => `${x},${y}`;
        const addPt = (x, y) => {
            x = Math.max(0, Math.min(cols - 1, x));
            y = Math.max(0, Math.min(rows - 1, y));
            if (!visited.has(key(x, y))) { visited.add(key(x, y)); path.push({ x, y }); }
        };
        // Walk from spawn to base: first go toward base column, then toward base row
        let cx = spawn.x, cy = spawn.y;
        addPt(cx, cy);
        // Move horizontally toward baseX
        const stepX = cx < baseX ? 1 : -1;
        while (cx !== baseX) { cx += stepX; addPt(cx, cy); }
        // Move vertically toward baseY
        const stepY = cy < baseY ? 1 : -1;
        while (cy !== baseY) { cy += stepY; addPt(cx, cy); }
        return path;
    });
}

// ─── Generator: Four Corners (multi-path) ────────────────────────────────────
// 4 spawners at the four corners → base at center. Total encirclement.

function _fourCornersGenerator(cols, rows) {
    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    const corners = [
        { x: 0,        y: 0 },
        { x: cols - 1, y: 0 },
        { x: 0,        y: rows - 1 },
        { x: cols - 1, y: rows - 1 }
    ];
    return corners.map(corner => {
        const path = [], visited = new Set();
        const key = (x, y) => `${x},${y}`;
        const addPt = (x, y) => {
            x = Math.max(0, Math.min(cols - 1, x));
            y = Math.max(0, Math.min(rows - 1, y));
            if (!visited.has(key(x, y))) { visited.add(key(x, y)); path.push({ x, y }); }
        };
        let px = corner.x, py = corner.y;
        addPt(px, py);
        // Walk diagonally: alternate x then y steps toward center
        while (px !== cx || py !== cy) {
            if (px !== cx) { px += px < cx ? 1 : -1; addPt(px, py); }
            if (py !== cy) { py += py < cy ? 1 : -1; addPt(px, py); }
        }
        return path;
    });
}

// ─── Generator 8: Labyrinth ───────────────────────────────────────────────────
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

// ─── Generator 13: U-Turn (single path) ──────────────────────────────────────
// Spawn top-left, descend left side, sweep across bottom, ascend right side,
// exit top-right. Single path — not multi-lane.

function _uturnGenerator(cols, rows) {
    const path = [], visited = new Set();
    const key = (x, y) => `${x},${y}`;
    const addPt = (x, y) => {
        x = Math.max(0, Math.min(cols - 1, x));
        y = Math.max(0, Math.min(rows - 1, y));
        if (!visited.has(key(x, y))) { visited.add(key(x, y)); path.push({ x, y }); }
    };
    const margin = 1;
    const lx = margin, rx = cols - 1 - margin;
    // Descend left side
    for (let y = 0; y <= rows - 1 - margin; y++) addPt(lx, y);
    // Sweep bottom
    for (let x = lx + 1; x <= rx; x++) addPt(x, rows - 1 - margin);
    // Ascend right side
    for (let y = rows - 2 - margin; y >= 0; y--) addPt(rx, y);
    return [path]; // single-element array keeps paths[] convention
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