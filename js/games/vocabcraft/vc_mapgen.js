export const TILE_PATH = 0;
export const TILE_GRASS = 1;
export const TILE_ROCK = 2;

export function generateMap(cols, rows, tier) {
    const grid = Array(rows).fill(0).map(() => Array(cols).fill(TILE_ROCK));
    
    // Try to generate a good path; retry up to 10 times if it's too short
    let path = [];
    for (let attempt = 0; attempt < 10; attempt++) {
        path = _generatePath(cols, rows);
        if (path.length >= Math.floor(cols * rows * 0.35)) break;
    }

    path.forEach(p => { grid[p.y][p.x] = TILE_PATH; });

    // Decorate non-path tiles with Grass (buildable) and Rock (blocked)
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] !== TILE_PATH) {
                const rockChance = 0.12 + (tier * 0.015);
                grid[r][c] = Math.random() < rockChance ? TILE_ROCK : TILE_GRASS;
            }
        }
    }

    return { grid, path, cols, rows };
}

function _generatePath(cols, rows) {
    // Pick a random start edge and end edge (opposite sides or adjacent sides for variety)
    const edgeConfigs = [
        { startEdge: 'left',   endEdge: 'right'  },
        { startEdge: 'top',    endEdge: 'bottom'  },
        { startEdge: 'left',   endEdge: 'bottom'  },
        { startEdge: 'top',    endEdge: 'right'   },
        { startEdge: 'left',   endEdge: 'top'     }, // U-turn style
    ];
    const { startEdge, endEdge } = edgeConfigs[Math.floor(Math.random() * edgeConfigs.length)];

    const startPos = _edgeEntry(startEdge, cols, rows);
    const endPos   = _edgeEntry(endEdge,   cols, rows);

    // Run a constrained random walk from start toward end
    const visited = new Set();
    const path = [];
    let { x, y } = startPos;

    const key = (x, y) => `${x},${y}`;
    visited.add(key(x, y));
    path.push({ x, y });

    const maxSteps = cols * rows * 2;

    for (let step = 0; step < maxSteps; step++) {
        // If adjacent to end, go there and stop
        if (Math.abs(x - endPos.x) + Math.abs(y - endPos.y) === 1) {
            path.push({ x: endPos.x, y: endPos.y });
            break;
        }

        // Build candidate moves — weight toward the goal, but allow lateral wander
        const dx = endPos.x - x;
        const dy = endPos.y - y;
        const dist = Math.abs(dx) + Math.abs(dy);

        // Directions: right, left, down, up
        const dirs = [
            { dx: 1,  dy: 0  },
            { dx: -1, dy: 0  },
            { dx: 0,  dy: 1  },
            { dx: 0,  dy: -1 },
        ];

        // Score each candidate
        const candidates = dirs
            .map(d => {
                const nx = x + d.dx, ny = y + d.dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return null;
                if (visited.has(key(nx, ny))) return null;

                // Check adjacency: don't create wide corridors (2-tile-wide path)
                const adjacentPathCount = dirs
                    .filter(od => !(od.dx === -d.dx && od.dy === -d.dy)) // ignore where we came from
                    .filter(od => {
                        const ax = nx + od.dx, ay = ny + od.dy;
                        return ax >= 0 && ax < cols && ay >= 0 && ay < rows && visited.has(key(ax, ay));
                    }).length;
                if (adjacentPathCount > 1) return null; // prevent blob paths

                // Bias toward goal
                const newDist = Math.abs(endPos.x - nx) + Math.abs(endPos.y - ny);
                const towardGoal = newDist < dist ? 3 : 1;
                // Small random jitter for organic feel
                const weight = towardGoal + Math.random() * 1.5;
                return { nx, ny, weight };
            })
            .filter(Boolean);

        if (candidates.length === 0) break; // dead end — accept partial path

        // Pick highest-weighted candidate
        candidates.sort((a, b) => b.weight - a.weight);
        const chosen = candidates[0];
        x = chosen.nx;
        y = chosen.ny;
        visited.add(key(x, y));
        path.push({ x, y });
    }

    return path;
}

function _edgeEntry(edge, cols, rows) {
    switch (edge) {
        case 'left':   return { x: 0,        y: _rand(1, rows - 2) };
        case 'right':  return { x: cols - 1, y: _rand(1, rows - 2) };
        case 'top':    return { x: _rand(1, cols - 2), y: 0         };
        case 'bottom': return { x: _rand(1, cols - 2), y: rows - 1  };
    }
}

function _rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getWaypoints(path, tileSize) {
    return path.map(p => ({
        x: p.x * tileSize + (tileSize / 2),
        y: p.y * tileSize + (tileSize / 2)
    }));
}