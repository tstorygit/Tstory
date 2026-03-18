// js/games/legend/leg_map.js

export const TILE_SIZE = 40;
export const ROOM_COLS = 13;
export const ROOM_ROWS = 9;

export const TILE = {
    FLOOR: 0, WALL: 1, TREE: 2, GRASS: 3, ROCK: 4, PIT: 5, POST: 6, STAIRS: 7, CHEST: 8
};

export function generateStage(stageLevel) {
    // 2x2 up to 5x5 based on stage
    const cols = Math.min(5, 2 + Math.floor((stageLevel - 1) / 2));
    const rows = Math.min(5, 2 + Math.floor(stageLevel / 2));
    const rooms = Array(rows).fill(0).map(() => Array(cols).fill(null));
    
    // 1. Recursive Backtracker for Macro-Grid
    const stack = [{x: 0, y: 0}];
    const visited = new Set(['0,0']);
    const paths = [];

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
            const doors = { n: false, s: false, w: false, e: false };

            paths.forEach(p => {
                if (p.from.x === rx && p.from.y === ry) {
                    if (p.to.y === ry - 1) doors.n = true;
                    if (p.to.y === ry + 1) doors.s = true;
                    if (p.to.x === rx - 1) doors.w = true;
                    if (p.to.x === rx + 1) doors.e = true;
                }
                if (p.to.x === rx && p.to.y === ry) {
                    if (p.from.y === ry - 1) doors.n = true;
                    if (p.from.y === ry + 1) doors.s = true;
                    if (p.from.x === rx - 1) doors.w = true;
                    if (p.from.x === rx + 1) doors.e = true;
                }
            });

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

            const isExit = (rx === endRoom.x && ry === endRoom.y);
            const hasChest = (!isExit && Math.random() < 0.2); 
            
            if (isExit) grid[midR][midC] = TILE.STAIRS;
            if (hasChest) grid[midR][midC] = TILE.CHEST;

            rooms[ry][rx] = { grid, doors, cleared: false, isExit, hasChest, x: rx, y: ry };
        }
    }

    return { rooms, startRoom: {x: 0, y: 0}, cols, rows };
}