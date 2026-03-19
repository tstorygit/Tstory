// js/games/legend/leg_map.js

export const TILE_SIZE = 40;
export const ROOM_COLS = 13;
export const ROOM_ROWS = 9;

export const TILE = {
    FLOOR: 0, WALL: 1, TREE: 2, GRASS: 3, ROCK: 4, PIT: 5, POST: 6, STAIRS: 7, CHEST: 8,
    STUMP: 9,   // felled tree — walkable, purely cosmetic
    SHRINE: 10  // vocabulary shrine — optional quiz trigger, single-use
};

export function generateStage(stageLevel) {
    // ── Map size progression ───────────────────────────────────────────────────
    // Stage  1 → 2×2   Stage  3 → 3×2   Stage  5 → 3×3
    // Stage  7 → 4×3   Stage  9 → 4×4   Stage 11 → 5×4   Stage 13+ → 5×5
    // To reach a 3×3 in-game: survive to stage 5 (clear stages 1–4).
    // Rebirth resets stage to 1 but the map formula is purely stage-based.
    const cols = Math.min(5, 2 + Math.floor((stageLevel - 1) / 2));
    const rows = Math.min(5, 2 + Math.floor(stageLevel / 2));
    const rooms = Array(rows).fill(0).map(() => Array(cols).fill(null));

    // ── 1. Recursive Backtracker — builds a spanning tree (guarantees all rooms
    //       reachable before we start adding one-way twists) ──────────────────
    const stack = [{x: 0, y: 0}];
    const visited = new Set(['0,0']);
    const paths = []; // bidirectional spanning-tree edges

    while (stack.length > 0) {
        const curr = stack[stack.length - 1];
        const dirs = [
            {dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}
        ].sort(() => Math.random() - 0.5);

        let moved = false;
        for (let d of dirs) {
            const nx = curr.x + d.dx, ny = curr.y + d.dy;
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !visited.has(`${nx},${ny}`)) {
                visited.add(`${nx},${ny}`);
                stack.push({x: nx, y: ny});
                paths.push({from: curr, to: {x: nx, y: ny}});
                moved = true;
                break;
            }
        }
        if (!moved) stack.pop();
    }

    // ── 2. One-directional corridors ─────────────────────────────────────────
    // Every spanning-tree edge is currently bidirectional (both rooms see a door).
    // We randomly flip ~35% of them so the door only appears on ONE side —
    // the player can walk through but can't return (classic Zelda one-way door).
    // Because the spanning tree already guarantees every room is reachable from
    // (0,0), making some passages one-way can never disconnect the graph.
    //
    // Separate from paths: we track which directions each room actually opens.
    // doors[ry][rx] = { n, s, w, e } — true means a walkable opening exists.
    const doorGrid = Array(rows).fill(0).map(() =>
        Array(cols).fill(0).map(() => ({ n: false, s: false, w: false, e: false }))
    );

    paths.forEach(p => {
        const oneWay = Math.random() < 0.35; // 35% chance of one-way passage
        const dx = p.to.x - p.from.x;
        const dy = p.to.y - p.from.y;

        // Decide which "half" to open based on random coin flip when one-way
        const openFrom = !oneWay || Math.random() < 0.5;
        const openTo   = !oneWay || !openFrom;

        // from-room side
        if (openFrom) {
            if (dx ===  1) doorGrid[p.from.y][p.from.x].e = true;
            if (dx === -1) doorGrid[p.from.y][p.from.x].w = true;
            if (dy ===  1) doorGrid[p.from.y][p.from.x].s = true;
            if (dy === -1) doorGrid[p.from.y][p.from.x].n = true;
        }
        // to-room side
        if (openTo) {
            if (dx ===  1) doorGrid[p.to.y][p.to.x].w = true;
            if (dx === -1) doorGrid[p.to.y][p.to.x].e = true;
            if (dy ===  1) doorGrid[p.to.y][p.to.x].n = true;
            if (dy === -1) doorGrid[p.to.y][p.to.x].s = true;
        }

        // ── Guarantee the START room always opens east AND south (if they exist)
        //    so the player can never be trapped at the very beginning.
        //    (Overwrite happens after the loop, see below.)
    });

    // Ensure start room is never sealed — force open any edge that leads to a
    // neighbour it built a path to (the spanning tree guarantees at least one).
    paths.forEach(p => {
        const isFromStart = (p.from.x === 0 && p.from.y === 0);
        const isToStart   = (p.to.x   === 0 && p.to.y   === 0);
        if (isFromStart || isToStart) {
            const fx = p.from.x, fy = p.from.y;
            const tx = p.to.x,   ty = p.to.y;
            const dx = tx - fx, dy = ty - fy;
            // Always open at least the "from" side of start-adjacent edges
            if (isFromStart) {
                if (dx ===  1) doorGrid[fy][fx].e = true;
                if (dx === -1) doorGrid[fy][fx].w = true;
                if (dy ===  1) doorGrid[fy][fx].s = true;
                if (dy === -1) doorGrid[fy][fx].n = true;
            }
            if (isToStart) {
                if (dx ===  1) doorGrid[ty][tx].w = true;
                if (dx === -1) doorGrid[ty][tx].e = true;
                if (dy ===  1) doorGrid[ty][tx].n = true;
                if (dy === -1) doorGrid[ty][tx].s = true;
            }
        }
    });

    // 2. Find furthest room for Exit
    let maxDist = 0;
    let endRoom = {x: 0, y: 0};
    visited.forEach(key => {
        const [x, y] = key.split(',').map(Number);
        const dist = x + y;
        if (dist > maxDist) { maxDist = dist; endRoom = {x, y}; }
    });

    // 3. Build Micro-Grids
    for (let ry = 0; ry < rows; ry++) {
        for (let rx = 0; rx < cols; rx++) {
            if (!visited.has(`${rx},${ry}`)) continue;

            const grid = Array(ROOM_ROWS).fill(0).map(() => Array(ROOM_COLS).fill(TILE.FLOOR));
            const doors = doorGrid[ry][rx];

            // Outer walls
            for (let r = 0; r < ROOM_ROWS; r++) {
                for (let c = 0; c < ROOM_COLS; c++) {
                    if (r === 0 || r === ROOM_ROWS - 1 || c === 0 || c === ROOM_COLS - 1) {
                        grid[r][c] = TILE.WALL;
                    }
                }
            }
            
            const midC = Math.floor(ROOM_COLS / 2);
            const midR = Math.floor(ROOM_ROWS / 2);
            
            // Open doors
            if (doors.n) { grid[0][midC] = TILE.FLOOR; grid[0][midC-1] = TILE.FLOOR; grid[0][midC+1] = TILE.FLOOR; }
            if (doors.s) { grid[ROOM_ROWS-1][midC] = TILE.FLOOR; grid[ROOM_ROWS-1][midC-1] = TILE.FLOOR; grid[ROOM_ROWS-1][midC+1] = TILE.FLOOR; }
            if (doors.w) { grid[midR][0] = TILE.FLOOR; grid[midR-1][0] = TILE.FLOOR; grid[midR+1][0] = TILE.FLOOR; }
            if (doors.e) { grid[midR][ROOM_COLS-1] = TILE.FLOOR; grid[midR-1][ROOM_COLS-1] = TILE.FLOOR; grid[midR+1][ROOM_COLS-1] = TILE.FLOOR; }

            // Sprinkle obstacles
            for (let r = 2; r < ROOM_ROWS - 2; r++) {
                for (let c = 2; c < ROOM_COLS - 2; c++) {
                    if (Math.random() < 0.2) {
                        grid[r][c] = [TILE.TREE, TILE.GRASS, TILE.ROCK, TILE.PIT][Math.floor(Math.random() * 4)];
                    }
                }
            }

            // Cross-shaped clear path
            for (let c = 1; c < ROOM_COLS - 1; c++) { grid[midR][c] = TILE.FLOOR; grid[midR-1][c] = TILE.FLOOR; }
            for (let r = 1; r < ROOM_ROWS - 1; r++) { grid[r][midC] = TILE.FLOOR; grid[r][midC-1] = TILE.FLOOR; }

            // Add Grapple Posts near Pits
            for (let r = 2; r < ROOM_ROWS - 2; r++) {
                for (let c = 2; c < ROOM_COLS - 2; c++) {
                    if (grid[r][c] === TILE.PIT && Math.random() < 0.2) grid[r][c] = TILE.POST;
                }
            }

            const isExit  = (rx === endRoom.x && ry === endRoom.y);
            const hasChest  = (!isExit && Math.random() < 0.2);
            const hasShrine = (!isExit && !hasChest && Math.random() < 0.25);

            if (isExit) grid[midR][midC] = TILE.STAIRS;
            if (hasChest) grid[midR][midC] = TILE.CHEST;
            if (hasShrine) {
                // Place shrine off the centre cross-path so it doesn't block doors
                const sc = midC + (Math.random() < 0.5 ? -2 : 2);
                const sr = midR + (Math.random() < 0.5 ? -2 : 2);
                if (grid[sr][sc] === TILE.FLOOR) grid[sr][sc] = TILE.SHRINE;
            }

            rooms[ry][rx] = { grid, doors, cleared: false, isExit, hasChest, hasShrine, x: rx, y: ry };
        }
    }

    return { rooms, startRoom: {x: 0, y: 0}, cols, rows };
}