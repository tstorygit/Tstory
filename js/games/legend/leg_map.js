// js/games/legend/leg_map.js

export const TILE_SIZE = 40;
export const ROOM_COLS = 13;
export const ROOM_ROWS = 9;

export const TILE = {
    FLOOR: 0, WALL: 1, TREE: 2, GRASS: 3, ROCK: 4, PIT: 5, POST: 6, STAIRS: 7, CHEST: 8,
    STUMP: 9,   // felled tree — walkable, purely cosmetic
    SHRINE: 10  // vocabulary shrine — optional quiz trigger, single-use
};

// Carves a 3-tile wide opening into the border wall at the given centre position.
function _carveDoor(grid, side, pos) {
    const R = ROOM_ROWS - 1, C = ROOM_COLS - 1;
    switch (side) {
        case 'n': grid[0][pos-1]=TILE.FLOOR; grid[0][pos]=TILE.FLOOR; grid[0][pos+1]=TILE.FLOOR; break;
        case 's': grid[R][pos-1]=TILE.FLOOR; grid[R][pos]=TILE.FLOOR; grid[R][pos+1]=TILE.FLOOR; break;
        case 'w': grid[pos-1][0]=TILE.FLOOR; grid[pos][0]=TILE.FLOOR; grid[pos+1][0]=TILE.FLOOR; break;
        case 'e': grid[pos-1][C]=TILE.FLOOR; grid[pos][C]=TILE.FLOOR; grid[pos+1][C]=TILE.FLOOR; break;
    }
}

export function generateStage(stageLevel) {
    // Stage 1→2×2  3→3×2  5→3×3  7→4×3  9→4×4  11→5×4  13+→5×5
    const cols = Math.min(5, 2 + Math.floor((stageLevel - 1) / 2));
    const rows = Math.min(5, 2 + Math.floor(stageLevel / 2));
    const rooms = Array(rows).fill(0).map(() => Array(cols).fill(null));

    // 1. Recursive Backtracker
    const stack = [{x:0,y:0}], visited = new Set(['0,0']), paths = [];
    while (stack.length > 0) {
        const curr = stack[stack.length-1];
        const dirs = [{dx:0,dy:-1},{dx:0,dy:1},{dx:-1,dy:0},{dx:1,dy:0}].sort(() => Math.random()-0.5);
        let moved = false;
        for (const d of dirs) {
            const nx = curr.x+d.dx, ny = curr.y+d.dy;
            if (nx>=0 && nx<cols && ny>=0 && ny<rows && !visited.has(`${nx},${ny}`)) {
                visited.add(`${nx},${ny}`); stack.push({x:nx,y:ny});
                paths.push({from:curr, to:{x:nx,y:ny}}); moved=true; break;
            }
        }
        if (!moved) stack.pop();
    }

    // 2. Assign one random door position per shared edge
    // N/S doors: random column in [3, ROOM_COLS-4]
    // E/W doors: random row    in [2, ROOM_ROWS-3]
    function edgeKey(ax,ay,bx,by) {
        return (ay<by||(ay===by&&ax<bx)) ? `${ax},${ay}:${bx},${by}` : `${bx},${by}:${ax},${ay}`;
    }
    function randInt(lo,hi) { return lo + Math.floor(Math.random()*(hi-lo+1)); }

    const edgePos = new Map();
    paths.forEach(p => {
        const key = edgeKey(p.from.x,p.from.y,p.to.x,p.to.y);
        if (!edgePos.has(key)) {
            const dy = p.to.y - p.from.y;
            edgePos.set(key, dy!==0 ? randInt(3,ROOM_COLS-4) : randInt(2,ROOM_ROWS-3));
        }
    });

    // 3. One-directional corridors + doorGrid
    const doorGrid    = Array(rows).fill(0).map(()=>Array(cols).fill(0).map(()=>({n:false,s:false,w:false,e:false})));
    const doorPosGrid = Array(rows).fill(0).map(()=>Array(cols).fill(0).map(()=>({n:0,s:0,w:0,e:0})));

    paths.forEach(p => {
        const dx = p.to.x-p.from.x, dy = p.to.y-p.from.y;
        const key = edgeKey(p.from.x,p.from.y,p.to.x,p.to.y);
        const pos = edgePos.get(key);

        // Every spanning-tree path is always open on BOTH sides.
        // One-way doors caused rooms to be reachable but have no matching exit,
        // leaving the player stuck in a walled room with only the entry door.
        const fx=p.from.x, fy=p.from.y, tx=p.to.x, ty=p.to.y;
        if (dx===1)  { doorGrid[fy][fx].e=true; doorPosGrid[fy][fx].e=pos; doorGrid[ty][tx].w=true; doorPosGrid[ty][tx].w=pos; }
        if (dx===-1) { doorGrid[fy][fx].w=true; doorPosGrid[fy][fx].w=pos; doorGrid[ty][tx].e=true; doorPosGrid[ty][tx].e=pos; }
        if (dy===1)  { doorGrid[fy][fx].s=true; doorPosGrid[fy][fx].s=pos; doorGrid[ty][tx].n=true; doorPosGrid[ty][tx].n=pos; }
        if (dy===-1) { doorGrid[fy][fx].n=true; doorPosGrid[fy][fx].n=pos; doorGrid[ty][tx].s=true; doorPosGrid[ty][tx].s=pos; }
    });

    // 4. Find exit room
    let maxDist=0, endRoom={x:0,y:0};
    visited.forEach(key => {
        const [x,y] = key.split(',').map(Number);
        const dist = x+y;
        if (dist>maxDist) { maxDist=dist; endRoom={x,y}; }
    });

    // 5. Build Micro-Grids
    for (let ry=0; ry<rows; ry++) {
        for (let rx=0; rx<cols; rx++) {
            if (!visited.has(`${rx},${ry}`)) continue;

            const grid  = Array(ROOM_ROWS).fill(0).map(()=>Array(ROOM_COLS).fill(TILE.FLOOR));
            const doors = doorGrid[ry][rx];
            const dpos  = doorPosGrid[ry][rx];
            const midC  = Math.floor(ROOM_COLS/2);
            const midR  = Math.floor(ROOM_ROWS/2);

            // Outer walls
            for (let r=0; r<ROOM_ROWS; r++)
                for (let c=0; c<ROOM_COLS; c++)
                    if (r===0||r===ROOM_ROWS-1||c===0||c===ROOM_COLS-1) grid[r][c]=TILE.WALL;

            // Carve door openings at their shared positions
            if (doors.n) _carveDoor(grid,'n',dpos.n);
            if (doors.s) _carveDoor(grid,'s',dpos.s);
            if (doors.w) _carveDoor(grid,'w',dpos.w);
            if (doors.e) _carveDoor(grid,'e',dpos.e);

            // Base cross-corridor through centre
            for (let c=1; c<ROOM_COLS-1; c++) { grid[midR][c]=TILE.FLOOR; grid[midR-1][c]=TILE.FLOOR; }
            for (let r=1; r<ROOM_ROWS-1; r++) { grid[r][midC]=TILE.FLOOR; grid[r][midC-1]=TILE.FLOOR; }

            // Clear guaranteed corridors from each door to the centre cross.
            // We clear a 2-tile wide column/row from the door opening all the
            // way to the cross, and then an extra horizontal/vertical jog at
            // the cross level if the door column/row doesn't fall on the cross.
            // This guarantees every door is always reachable.
            if (doors.n) {
                for (let r = 1; r <= midR; r++) {
                    grid[r][dpos.n] = TILE.FLOOR;
                    if (dpos.n + 1 < ROOM_COLS - 1) grid[r][dpos.n + 1] = TILE.FLOOR;
                }
                // Horizontal jog at mid row to reach the cross
                const lo = Math.min(dpos.n, midC), hi = Math.max(dpos.n, midC + 1);
                for (let c = lo; c <= hi; c++) grid[midR][c] = TILE.FLOOR;
            }
            if (doors.s) {
                for (let r = midR; r < ROOM_ROWS - 1; r++) {
                    grid[r][dpos.s] = TILE.FLOOR;
                    if (dpos.s + 1 < ROOM_COLS - 1) grid[r][dpos.s + 1] = TILE.FLOOR;
                }
                const lo = Math.min(dpos.s, midC), hi = Math.max(dpos.s, midC + 1);
                for (let c = lo; c <= hi; c++) grid[midR][c] = TILE.FLOOR;
            }
            if (doors.w) {
                for (let c = 1; c <= midC; c++) {
                    grid[dpos.w][c] = TILE.FLOOR;
                    if (dpos.w + 1 < ROOM_ROWS - 1) grid[dpos.w + 1][c] = TILE.FLOOR;
                }
                // Vertical jog at mid col to reach the cross
                const lo = Math.min(dpos.w, midR), hi = Math.max(dpos.w, midR + 1);
                for (let r = lo; r <= hi; r++) grid[r][midC] = TILE.FLOOR;
            }
            if (doors.e) {
                for (let c = midC; c < ROOM_COLS - 1; c++) {
                    grid[dpos.e][c] = TILE.FLOOR;
                    if (dpos.e + 1 < ROOM_ROWS - 1) grid[dpos.e + 1][c] = TILE.FLOOR;
                }
                const lo = Math.min(dpos.e, midR), hi = Math.max(dpos.e, midR + 1);
                for (let r = lo; r <= hi; r++) grid[r][midC] = TILE.FLOOR;
            }

            // Sprinkle obstacles LAST — only on confirmed FLOOR tiles so doors,
            // corridors, and the cross are never blocked.
            // SANITY: we exclude the 3×3 area around the centre tile so stairs/
            // chest are always freely reachable regardless of weapon loadout.
            // Also: start room (0,0) never gets obstacles — it's always a safe spawn.
            const isStartRoom = (rx === 0 && ry === 0);
            if (!isStartRoom) {
                for (let r=2; r<ROOM_ROWS-2; r++)
                    for (let c=2; c<ROOM_COLS-2; c++) {
                        const nearCenter = Math.abs(r-midR)<=1 && Math.abs(c-midC)<=1;
                        if (nearCenter) continue; // always keep centre approach clear
                        if (grid[r][c] === TILE.FLOOR && Math.random()<0.18) {
                            // On stage 1 avoid trees (need axe to clear) so early
                            // game isn't gated behind an unearned weapon unlock.
                            const pool = stageLevel <= 2
                                ? [TILE.GRASS, TILE.ROCK, TILE.PIT, TILE.GRASS] // no TREE
                                : [TILE.TREE, TILE.GRASS, TILE.ROCK, TILE.PIT];
                            grid[r][c] = pool[Math.floor(Math.random()*pool.length)];
                        }
                    }
            }

            // Grapple posts near pits
            for (let r=2; r<ROOM_ROWS-2; r++)
                for (let c=2; c<ROOM_COLS-2; c++)
                    if (grid[r][c]===TILE.PIT && Math.random()<0.2) grid[r][c]=TILE.POST;

            const isExit   = (rx===endRoom.x && ry===endRoom.y);
            const hasChest  = (!isExit && Math.random()<0.2);
            const hasShrine = (!isExit && !hasChest && Math.random()<0.25);

            if (isExit)   grid[midR][midC]=TILE.STAIRS;
            if (hasChest) grid[midR][midC]=TILE.CHEST;
            if (hasShrine) {
                const sc=midC+(Math.random()<0.5?-2:2), sr=midR+(Math.random()<0.5?-2:2);
                if (grid[sr][sc]===TILE.FLOOR) grid[sr][sc]=TILE.SHRINE;
            }

            rooms[ry][rx]={ grid, doors, dpos, cleared:false, isExit, hasChest, hasShrine, x:rx, y:ry };
        }
    }

    return { rooms, startRoom:{x:0,y:0}, cols, rows };
}