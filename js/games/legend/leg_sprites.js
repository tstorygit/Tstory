// js/games/legend/leg_sprites.js
//
// Tile rendering for the Legend game.
//
// Performance: each unique tile variant is rendered once into a small offscreen
// canvas and cached.  drawTile() then does a single fast drawImage() blit per
// tile instead of re-executing all the path/fill/stroke operations every frame.
//
// Cache key: `${tileType}:${roomCleared ? 1 : 0}`
// Only STAIRS and CHEST have two variants (active / inactive).  All other tiles
// are drawn identically regardless of room state.

import { TILE } from './leg_map.js';

// ── Cache ─────────────────────────────────────────────────────────────────────

const _cache = new Map(); // key → HTMLCanvasElement

function _getCached(key, ts, paintFn) {
    if (_cache.has(key)) return _cache.get(key);
    const oc = document.createElement('canvas');
    oc.width = oc.height = ts;
    paintFn(oc.getContext('2d'), 0, 0, ts);
    _cache.set(key, oc);
    return oc;
}

/**
 * Pre-render every tile variant into the cache.
 * Call once in initEngine() so the first frame never stalls.
 * Safe to call again if ts changes (clears the old cache first).
 */
export function prewarmTileCache(ts) {
    _cache.clear();
    const staticTypes = [TILE.FLOOR, TILE.WALL, TILE.TREE, TILE.GRASS, TILE.ROCK, TILE.PIT, TILE.POST];
    staticTypes.forEach(t => _getCached(`${t}:0`, ts, (c, x, y, s) => _paint(c, t, x, y, s, false)));
    [TILE.STAIRS, TILE.CHEST].forEach(t => {
        _getCached(`${t}:0`, ts, (c, x, y, s) => _paint(c, t, x, y, s, false));
        _getCached(`${t}:1`, ts, (c, x, y, s) => _paint(c, t, x, y, s, true));
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Draw a single tile at pixel position (px, py) using a cached blit.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} tileType      - One of the TILE.* constants
 * @param {number} px            - Left edge of the tile in canvas pixels
 * @param {number} py            - Top edge of the tile in canvas pixels
 * @param {number} ts            - Tile size in pixels (TILE_SIZE)
 * @param {boolean} roomCleared  - Active state for STAIRS / CHEST
 */
export function drawTile(ctx, tileType, px, py, ts, roomCleared = false) {
    const active = (tileType === TILE.STAIRS || tileType === TILE.CHEST) && roomCleared;
    const key    = `${tileType}:${active ? 1 : 0}`;
    const cached = _getCached(key, ts, (c, x, y, s) => _paint(c, tileType, x, y, s, roomCleared));
    ctx.drawImage(cached, px, py);
}

// ── Internal painter — called once per variant, result is cached ──────────────

function _paint(ctx, tileType, px, py, ts, roomCleared) {
    switch (tileType) {
        case TILE.FLOOR:  _drawFloor(ctx, px, py, ts);               break;
        case TILE.WALL:   _drawWall(ctx, px, py, ts);                break;
        case TILE.TREE:   _drawTree(ctx, px, py, ts);                break;
        case TILE.GRASS:  _drawGrass(ctx, px, py, ts);               break;
        case TILE.ROCK:   _drawRock(ctx, px, py, ts);                break;
        case TILE.PIT:    _drawPit(ctx, px, py, ts);                 break;
        case TILE.POST:   _drawPost(ctx, px, py, ts);                break;
        case TILE.STAIRS: _drawStairs(ctx, px, py, ts, roomCleared); break;
        case TILE.CHEST:  _drawChest(ctx, px, py, ts, roomCleared);  break;
        default:          _drawFloor(ctx, px, py, ts);               break;
    }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function _fill(ctx, color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
}

function _stroke(ctx, color, lw, x, y, w, h) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
}

function _tileGrid(ctx, px, py, ts) {
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, ts, ts);
}

// ── Tile painters ─────────────────────────────────────────────────────────────

function _drawFloor(ctx, px, py, ts) {
    _fill(ctx, '#8fa068', px, py, ts, ts);
    _tileGrid(ctx, px, py, ts);
}

function _drawWall(ctx, px, py, ts) {
    _fill(ctx, '#2c3e50', px, py, ts, ts);
    const bh = Math.round(ts / 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let row = 1; row < 3; row++) {
        const ly = py + row * bh;
        ctx.beginPath(); ctx.moveTo(px, ly); ctx.lineTo(px + ts, ly); ctx.stroke();
    }
    for (let row = 0; row < 3; row++) {
        const offset = (row % 2 === 0) ? Math.round(ts / 2) : 0;
        const ly = py + row * bh;
        ctx.beginPath(); ctx.moveTo(px + offset, ly); ctx.lineTo(px + offset, ly + bh); ctx.stroke();
    }
    _tileGrid(ctx, px, py, ts);
}

function _drawGrass(ctx, px, py, ts) {
    _fill(ctx, '#2ecc71', px, py, ts, ts);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(fx => {
        const bx = px + fx * ts;
        ctx.beginPath(); ctx.moveTo(bx, py + ts * 0.75); ctx.lineTo(bx - 2, py + ts * 0.45); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx, py + ts * 0.75); ctx.lineTo(bx + 2, py + ts * 0.42); ctx.stroke();
    });
    _tileGrid(ctx, px, py, ts);
}

function _drawTree(ctx, px, py, ts) {
    _fill(ctx, '#8fa068', px, py, ts, ts);

    const cx = px + ts / 2;
    const cy = py + ts / 2;

    // Trunk
    const tw = Math.round(ts * 0.18);
    const th = Math.round(ts * 0.38);
    _fill(ctx, '#6d4c41', cx - tw / 2, cy + ts * 0.08, tw, th);

    // Crown — main circle
    ctx.fillStyle = '#27ae60';
    ctx.beginPath();
    ctx.arc(cx, cy - ts * 0.08, ts * 0.30, 0, Math.PI * 2);
    ctx.fill();

    // Crown — highlight
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath();
    ctx.arc(cx - ts * 0.07, cy - ts * 0.15, ts * 0.15, 0, Math.PI * 2);
    ctx.fill();

    _tileGrid(ctx, px, py, ts);
}

function _drawRock(ctx, px, py, ts) {
    _fill(ctx, '#8fa068', px, py, ts, ts);

    const cx = px + ts / 2;
    const cy = py + ts / 2;

    ctx.fillStyle = '#7f8c8d';
    ctx.beginPath();
    ctx.ellipse(cx, cy + ts * 0.05, ts * 0.32, ts * 0.26, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#636e72';
    ctx.beginPath();
    ctx.ellipse(cx + ts * 0.04, cy + ts * 0.10, ts * 0.26, ts * 0.16, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#b2bec3';
    ctx.beginPath();
    ctx.ellipse(cx - ts * 0.07, cy - ts * 0.06, ts * 0.12, ts * 0.09, -0.4, 0, Math.PI * 2);
    ctx.fill();

    _tileGrid(ctx, px, py, ts);
}

function _drawPit(ctx, px, py, ts) {
    // Floor rim around the void
    _fill(ctx, '#8fa068', px, py, ts, ts);

    const cx  = px + ts / 2;
    const cy  = py + ts / 2;
    const rim = Math.round(ts * 0.12);

    // Outer rim shadow — slightly darker than floor
    _fill(ctx, '#6d7f50', px + rim * 0.5, py + rim * 0.5, ts - rim, ts - rim);

    // The void
    _fill(ctx, '#0d0d0d', px + rim, py + rim, ts - rim * 2, ts - rim * 2);

    // Inner depth ellipse — sells the "looking down into a hole" feel
    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.ellipse(cx, cy + ts * 0.04, ts * 0.22, ts * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();

    // Top rim highlight
    ctx.strokeStyle = '#aec47a';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + rim, py + rim);
    ctx.lineTo(px + ts - rim, py + rim);
    ctx.stroke();

    // Left side shadow
    ctx.strokeStyle = '#5a6e40';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(px + rim, py + rim + 1.5);
    ctx.lineTo(px + rim, py + ts - rim);
    ctx.stroke();

    _tileGrid(ctx, px, py, ts);
}

function _drawPost(ctx, px, py, ts) {
    _fill(ctx, '#8fa068', px, py, ts, ts);

    const cx = px + ts / 2;

    // Stone base block
    _fill(ctx, '#7f8c8d', cx - ts * 0.22, py + ts * 0.70, ts * 0.44, ts * 0.26);
    _stroke(ctx, '#636e72', 1, cx - ts * 0.22, py + ts * 0.70, ts * 0.44, ts * 0.26);
    // Base highlight
    _fill(ctx, '#95a5a6', cx - ts * 0.22, py + ts * 0.70, ts * 0.44, ts * 0.06);

    // Pole — tapers slightly (two rects side by side for the highlight)
    _fill(ctx, '#8e44ad', cx - ts * 0.09, py + ts * 0.18, ts * 0.18, ts * 0.54);
    _fill(ctx, '#9b59b6', cx - ts * 0.05, py + ts * 0.20, ts * 0.06, ts * 0.50);

    // Grapple ring at top — open circle (the hook target)
    ctx.strokeStyle = '#e8daef';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(cx, py + ts * 0.19, ts * 0.12, 0, Math.PI * 2);
    ctx.stroke();
    // Ring fill (so it's distinct from the pole)
    ctx.fillStyle = '#6c3483';
    ctx.beginPath();
    ctx.arc(cx, py + ts * 0.19, ts * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // Inner ring highlight
    ctx.fillStyle = '#a569bd';
    ctx.beginPath();
    ctx.arc(cx - ts * 0.03, py + ts * 0.16, ts * 0.04, 0, Math.PI * 2);
    ctx.fill();

    _tileGrid(ctx, px, py, ts);
}

function _drawStairs(ctx, px, py, ts, active) {
    _fill(ctx, '#8fa068', px, py, ts, ts);

    const margin = Math.round(ts * 0.10);
    const totalW = ts - margin * 2;
    const stepH  = Math.round((ts - margin * 2) / 3);

    if (!active) {
        // Draw recognisable steps but desaturated/dimmed — locked behind clearing room
        const dimColors = ['#7a7040', '#6b6236', '#5c552e'];
        for (let i = 0; i < 3; i++) {
            const inset = i * Math.round(totalW / 6);
            const sy    = py + margin + i * stepH;
            _fill(ctx, dimColors[i], px + margin + inset, sy, totalW - inset * 2, stepH - 1);
        }
        _stroke(ctx, '#5a5028', 1, px + margin - 1, py + margin - 1, totalW + 2, stepH * 3 + 2);
        _tileGrid(ctx, px, py, ts);
        return;
    }

    // Active — gold steps
    const stepColors = ['#f1c40f', '#d4ac0d', '#b7950b'];
    for (let i = 0; i < 3; i++) {
        const inset = i * Math.round(totalW / 6);
        const sy    = py + margin + i * stepH;
        _fill(ctx, stepColors[i], px + margin + inset, sy, totalW - inset * 2, stepH - 1);
    }
    _stroke(ctx, '#f39c12', 2, px + margin - 1, py + margin - 1, totalW + 2, stepH * 3 + 2);
    _tileGrid(ctx, px, py, ts);
}

function _drawChest(ctx, px, py, ts, active) {
    _fill(ctx, '#8fa068', px, py, ts, ts);

    const margin = Math.round(ts * 0.10);
    const cw     = ts - margin * 2;
    const ch     = Math.round(cw * 0.65);
    const lidH   = Math.round(ch * 0.38);
    const bodyH  = ch - lidH;
    const cx0    = px + margin;
    const cy0    = py + Math.round((ts - ch) / 2);

    if (!active) {
        _fill(ctx, '#784212', cx0, cy0 + lidH, cw, bodyH);
        _stroke(ctx, '#4a2709', 1.5, cx0, cy0 + lidH, cw, bodyH);
        _fill(ctx, '#935116', cx0, cy0, cw, lidH);
        _stroke(ctx, '#4a2709', 1.5, cx0, cy0, cw, lidH);
        _fill(ctx, '#a04000', cx0, cy0, cw, Math.round(lidH * 0.4));
        const lw = Math.round(ts * 0.14), lh = Math.round(ts * 0.16);
        const lx = cx0 + Math.round((cw - lw) / 2);
        const ly = cy0 + lidH - Math.round(lh * 0.4);
        _fill(ctx, '#d4ac0d', lx, ly, lw, lh);
        _stroke(ctx, '#9a7d0a', 1, lx, ly, lw, lh);
        ctx.fillStyle = '#4a2709';
        ctx.beginPath();
        ctx.arc(lx + lw / 2, ly + lh * 0.4, lw * 0.22, 0, Math.PI * 2);
        ctx.fill();
        _tileGrid(ctx, px, py, ts);
        return;
    }

    // Open chest
    _fill(ctx, '#935116', cx0, cy0 + lidH, cw, bodyH);
    _stroke(ctx, '#4a2709', 1.5, cx0, cy0 + lidH, cw, bodyH);
    const ipad = Math.round(cw * 0.08);
    _fill(ctx, '#1a0a00', cx0 + ipad, cy0 + lidH + ipad, cw - ipad * 2, bodyH - ipad);

    const lidY = cy0 - Math.round(lidH * 0.5);
    _fill(ctx, '#b7770d', cx0, lidY, cw, lidH);
    _stroke(ctx, '#4a2709', 1.5, cx0, lidY, cw, lidH);
    _fill(ctx, '#d4ac0d', cx0, lidY, cw, Math.round(lidH * 0.35));

    ctx.fillStyle = '#f1c40f';
    [[0.3, 0.45], [0.55, 0.55], [0.7, 0.38]].forEach(([fx, fy]) => {
        ctx.beginPath();
        ctx.arc(cx0 + fx * cw, cy0 + lidH + fy * bodyH, 2.5, 0, Math.PI * 2);
        ctx.fill();
    });

    _stroke(ctx, '#f1c40f', 1.5, cx0 - 1, lidY - 1, cw + 2, (cy0 + ch) - lidY + 2);
    _tileGrid(ctx, px, py, ts);
}