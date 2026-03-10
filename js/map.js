// Map generation and management
const GameMap = {
    tiles: [],
    regions: [],
    width: CONFIG.MAP_WIDTH,
    height: CONFIG.MAP_HEIGHT,

    // Generate terrain only (no kingdoms)
    generateTerrain(seed, onProgress) {
        Perlin.seed(seed);
        Perlin.seedRng(seed);
        this.width = CONFIG.MAP_WIDTH;
        this.height = CONFIG.MAP_HEIGHT;
        this.tiles = [];
        this.regions = [];

        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = [];
            for (let x = 0; x < this.width; x++) {
                const nx = x / this.width;
                const ny = y / this.height;

                // Multi-octave elevation
                const elevation = Perlin.octave(x * 0.035, y * 0.035, 6, 0.5);
                const moisture = Perlin.octave(x * 0.04 + 200, y * 0.04 + 200, 4, 0.5);

                // Island falloff - edges tend toward water
                const dx = (nx - 0.5) * 2;
                const dy = (ny - 0.5) * 2;
                const distFromCenter = Math.sqrt(dx * dx + dy * dy);
                const falloff = Math.max(0, 1 - distFromCenter * 1.1);
                const finalElev = elevation * 0.7 + falloff * 0.3;

                const terrain = this._elevToTerrain(finalElev, moisture, x, y);

                this.tiles[y][x] = {
                    x, y,
                    terrain,
                    elevation: finalElev,
                    moisture,
                    building: null,
                    owner: -1, // -1 = unclaimed
                    regionId: -1,
                    visible: true,
                    explored: true,
                };
            }
            if (onProgress) onProgress((y + 1) / this.height * 0.7);
        }

        // Generate natural regions via Voronoi
        this._generateNaturalRegions();
        if (onProgress) onProgress(0.9);

        // Done
        if (onProgress) onProgress(1.0);
    },

    _elevToTerrain(elev, moisture, x, y) {
        if (elev < -0.30) return CONFIG.TERRAIN.DEEP_WATER;
        if (elev < -0.15) return CONFIG.TERRAIN.WATER;
        if (elev < -0.08) return CONFIG.TERRAIN.SAND;

        // Quadrant bias: modify thresholds based on map position
        // NW (top-left): more forest     NE (top-right): more plains
        // SW (bottom-left): more hills   SE (bottom-right): more rocks/mountain
        let plainsBias = 0, forestBias = 0, hillsBias = 0;
        if (x !== undefined && y !== undefined) {
            const nx = x / this.width;   // 0..1
            const ny = y / this.height;  // 0..1
            // How far right (0=left, 1=right) and down (0=top, 1=bottom)
            const rightFactor = (nx - 0.5) * 2;  // -1..1
            const downFactor  = (ny - 0.5) * 2;  // -1..1

            // NE = right+top → more plains, less rock
            // NW = left+top → more forest
            // SE = right+bottom → more rock/mountain
            // SW = left+bottom → more hills
            plainsBias = rightFactor * (1 - Math.abs(downFactor)) * 0.04;   // NE gets +plains
            forestBias = -rightFactor * (1 - Math.abs(downFactor)) * 0.04;  // NW gets +forest
            hillsBias  = downFactor * 0.04;                                  // bottom gets +hills/rocks
        }

        if (elev < 0.02 + plainsBias) return CONFIG.TERRAIN.PLAINS;
        if (elev < 0.15 + forestBias) {
            return moisture > 0.15 - forestBias ? CONFIG.TERRAIN.FOREST :
                   moisture > -0.05 ? CONFIG.TERRAIN.GRASS : CONFIG.TERRAIN.PLAINS;
        }
        if (elev < 0.25 + forestBias * 0.5) {
            return moisture > 0.2 - forestBias ? CONFIG.TERRAIN.DENSE_FOREST : CONFIG.TERRAIN.FOREST;
        }
        if (elev < 0.38 - hillsBias) return CONFIG.TERRAIN.HILLS;
        if (elev < 0.50 - hillsBias * 0.5) return CONFIG.TERRAIN.MOUNTAIN;
        return CONFIG.TERRAIN.SNOW_PEAK;
    },

    _generateNaturalRegions() {
        // Voronoi-style: place seed points, assign each land tile to nearest
        this.regions = [];
        const numRegions = Math.floor((this.width * this.height) / 1200);
        const minSeedDist = Math.max(16, Math.floor(Math.min(this.width, this.height) / 20));
        const seeds = [];

        // Place region seeds on land tiles
        for (let attempt = 0; attempt < numRegions * 30 && seeds.length < numRegions; attempt++) {
            const rx = Math.floor(Perlin.random() * this.width);
            const ry = Math.floor(Perlin.random() * this.height);
            const tile = this.tiles[ry][rx];
            if (tile.terrain <= CONFIG.TERRAIN.WATER) continue;
            const tooClose = seeds.some(s =>
                Math.sqrt((s.x - rx) ** 2 + (s.y - ry) ** 2) < minSeedDist
            );
            if (tooClose) continue;
            seeds.push({ x: rx, y: ry });
        }

        // Create region objects
        for (let i = 0; i < seeds.length; i++) {
            this.regions.push({
                id: i,
                center: seeds[i],
                tiles: [],
                owner: -1, // no kingdom yet
                name: '',
                color: null
            });
        }

        // Assign each land tile to nearest seed
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const tile = this.tiles[y][x];
                if (tile.terrain <= CONFIG.TERRAIN.WATER) continue;

                let minDist = Infinity;
                let closestRegion = -1;
                for (let i = 0; i < seeds.length; i++) {
                    const d = (seeds[i].x - x) ** 2 + (seeds[i].y - y) ** 2;
                    if (d < minDist) {
                        minDist = d;
                        closestRegion = i;
                    }
                }

                if (closestRegion >= 0) {
                    tile.regionId = closestRegion;
                    this.regions[closestRegion].tiles.push({ x, y });
                }
            }
        }

        // Remove tiny regions (< 20 tiles)
        for (let i = this.regions.length - 1; i >= 0; i--) {
            if (this.regions[i].tiles.length < 20) {
                // Merge into nearest valid region
                for (const t of this.regions[i].tiles) {
                    const neighbors = this._getNeighborRegions(t.x, t.y, i);
                    if (neighbors.length > 0) {
                        const newRegion = neighbors[0];
                        this.tiles[t.y][t.x].regionId = newRegion;
                        this.regions[newRegion].tiles.push(t);
                    }
                }
                this.regions[i].tiles = [];
            }
        }
    },

    _getNeighborRegions(x, y, excludeId) {
        const found = [];
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dx, dy] of dirs) {
            const t = this.getTile(x + dx, y + dy);
            if (t && t.regionId >= 0 && t.regionId !== excludeId && !found.includes(t.regionId)) {
                found.push(t.regionId);
            }
        }
        return found;
    },

    // Check if an area is suitable for a kingdom
    // Must have enough land AND access to all key terrain types in the region
    isValidKingdomSpot(x, y) {
        const radius = 6;
        let landCount = 0;
        const terrainTypes = new Set();
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy > radius * radius) continue;
                const tile = this.getTile(x + dx, y + dy);
                if (tile && tile.terrain > CONFIG.TERRAIN.WATER && tile.terrain < CONFIG.TERRAIN.MOUNTAIN) {
                    landCount++;
                }
                if (tile) terrainTypes.add(tile.terrain);
            }
        }
        if (landCount < 60) return false;

        // Check that the wider region (radius 20) has all key terrains
        const wideRadius = 20;
        const wideTerrains = new Set();
        for (let dy = -wideRadius; dy <= wideRadius; dy += 2) {
            for (let dx = -wideRadius; dx <= wideRadius; dx += 2) {
                if (dx * dx + dy * dy > wideRadius * wideRadius) continue;
                const tile = this.getTile(x + dx, y + dy);
                if (tile) wideTerrains.add(tile.terrain);
            }
        }

        // Must have at least: plains/grass (build), forest (wood), hills/mountain (mine)
        const hasPlains = wideTerrains.has(CONFIG.TERRAIN.PLAINS) || wideTerrains.has(CONFIG.TERRAIN.GRASS) || wideTerrains.has(CONFIG.TERRAIN.SAND);
        const hasForest = wideTerrains.has(CONFIG.TERRAIN.FOREST) || wideTerrains.has(CONFIG.TERRAIN.DENSE_FOREST);
        const hasRock = wideTerrains.has(CONFIG.TERRAIN.HILLS) || wideTerrains.has(CONFIG.TERRAIN.MOUNTAIN);

        return hasPlains && hasForest && hasRock;
    },

    // Check if position is too close to map center (forbidden zone)
    isCenterZone(x, y) {
        const cx = this.width / 2;
        const cy = this.height / 2;
        const radius = Math.min(this.width, this.height) * 0.12;
        return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) < radius;
    },

    // Place kingdoms based on player position - evenly distributed
    placeKingdoms(playerX, playerY) {
        // Find player's region
        const playerTile = this.getTile(playerX, playerY);
        if (!playerTile || playerTile.regionId < 0) return;

        const playerRegion = this.regions[playerTile.regionId];
        playerRegion.owner = 0;
        playerRegion.name = 'Votre Royaume';
        playerRegion.color = CONFIG.FACTION_COLORS[0];

        // Claim the player's region tiles
        for (const t of playerRegion.tiles) {
            this.tiles[t.y][t.x].owner = 0;
        }

        // Place 4 enemy kingdoms at roughly equal angular intervals around the player
        const numEnemies = 4;
        const enemyNames = ['Royaume de Fer', 'Duche de Flamme', 'Comtat des Ombres', 'Empire Dore'];
        const idealDist = Math.min(this.width, this.height) * 0.28;
        const minDistBetweenEnemies = Math.min(this.width, this.height) * 0.18;
        const minDistFromPlayer = Math.min(this.width, this.height) * 0.15;

        // Compute ideal target positions at equal angles around the player
        const baseAngle = Perlin.random() * Math.PI * 2; // random start angle
        const targets = [];
        for (let i = 0; i < numEnemies; i++) {
            const angle = baseAngle + (i * Math.PI * 2) / numEnemies;
            targets.push({
                x: playerX + Math.cos(angle) * idealDist,
                y: playerY + Math.sin(angle) * idealDist
            });
        }

        // For each target, find the best candidate region
        const candidates = this.regions.filter(r =>
            r.tiles.length >= 40 && r.owner === -1 &&
            r.center.x > 5 && r.center.x < this.width - 5 &&
            r.center.y > 5 && r.center.y < this.height - 5
        );

        const usedRegions = new Set();
        for (let i = 0; i < numEnemies; i++) {
            const target = targets[i];
            let bestRegion = null;
            let bestScore = Infinity;

            for (const region of candidates) {
                if (usedRegions.has(region.id)) continue;

                // Distance from player
                const distFromPlayer = Math.sqrt(
                    (region.center.x - playerX) ** 2 +
                    (region.center.y - playerY) ** 2
                );
                if (distFromPlayer < minDistFromPlayer) continue;

                // Distance from other placed enemies
                let tooClose = false;
                for (const usedId of usedRegions) {
                    const usedRegion = this.regions[usedId];
                    const d = Math.sqrt(
                        (usedRegion.center.x - region.center.x) ** 2 +
                        (usedRegion.center.y - region.center.y) ** 2
                    );
                    if (d < minDistBetweenEnemies) { tooClose = true; break; }
                }
                if (tooClose) continue;

                // Score: distance from ideal target position
                const score = Math.sqrt(
                    (region.center.x - target.x) ** 2 +
                    (region.center.y - target.y) ** 2
                );

                if (score < bestScore) {
                    bestScore = score;
                    bestRegion = region;
                }
            }

            if (bestRegion) {
                const ownerIdx = i + 1;
                bestRegion.owner = ownerIdx;
                bestRegion.name = enemyNames[i];
                bestRegion.color = CONFIG.FACTION_COLORS[ownerIdx];
                usedRegions.add(bestRegion.id);

                for (const t of bestRegion.tiles) {
                    this.tiles[t.y][t.x].owner = ownerIdx;
                }
            }
        }
    },

    // Legacy compat
    generate(seed) {
        this.generateTerrain(seed);
    },

    getTile(x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
        return this.tiles[y][x];
    },

    getRegion(id) {
        return this.regions[id] || null;
    },

    getPlayerRegion() {
        return this.regions.find(r => r.owner === 0);
    },

    // Render full overview for placement screen
    renderOverviewToCanvas(canvas, castleX, castleY) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        const scaleX = w / this.width;
        const scaleY = h / this.height;

        // Create imagedata for fast pixel rendering
        const imageData = ctx.createImageData(w, h);
        const data = imageData.data;

        for (let py = 0; py < h; py++) {
            const ty = Math.floor((py / h) * this.height);
            for (let px = 0; px < w; px++) {
                const tx = Math.floor((px / w) * this.width);
                const tile = this.tiles[ty][tx];
                const c = this._terrainRGB(tile.terrain, tx, ty);
                const idx = (py * w + px) * 4;
                data[idx] = c[0];
                data[idx + 1] = c[1];
                data[idx + 2] = c[2];
                data[idx + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        // Draw quadrant overlays (4 corners)
        const quadrantColors = [
            'rgba(34,120,50,',   // NW - vert foret
            'rgba(180,160,50,',  // NE - dore plaines
            'rgba(50,90,160,',   // SW - bleu collines
            'rgba(160,60,40,',   // SE - rouge roche
        ];
        const hw2 = w / 2, hh2 = h / 2;
        for (let qi = 0; qi < 4; qi++) {
            const qx = (qi % 2) * hw2;
            const qy = Math.floor(qi / 2) * hh2;
            const grad = ctx.createRadialGradient(
                qi % 2 === 0 ? 0 : w, Math.floor(qi / 2) === 0 ? 0 : h, 0,
                qi % 2 === 0 ? 0 : w, Math.floor(qi / 2) === 0 ? 0 : h, Math.max(hw2, hh2)
            );
            grad.addColorStop(0, quadrantColors[qi] + '0.12)');
            grad.addColorStop(1, quadrantColors[qi] + '0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }

        // Draw region borders (subtle)
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 0.5;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const tile = this.tiles[y][x];
                if (tile.regionId < 0) continue;
                // Check right and bottom neighbors
                const right = this.getTile(x + 1, y);
                const bottom = this.getTile(x, y + 1);
                if (right && right.regionId >= 0 && right.regionId !== tile.regionId) {
                    const px = (x + 1) * scaleX;
                    ctx.beginPath();
                    ctx.moveTo(px, y * scaleY);
                    ctx.lineTo(px, (y + 1) * scaleY);
                    ctx.stroke();
                }
                if (bottom && bottom.regionId >= 0 && bottom.regionId !== tile.regionId) {
                    const py2 = (y + 1) * scaleY;
                    ctx.beginPath();
                    ctx.moveTo(x * scaleX, py2);
                    ctx.lineTo((x + 1) * scaleX, py2);
                    ctx.stroke();
                }
            }
        }

        // Draw center forbidden zone
        const centerRadius = Math.min(this.width, this.height) * 0.12;
        const centerPx = (this.width / 2) * scaleX;
        const centerPy = (this.height / 2) * scaleY;
        const centerRadPx = centerRadius * scaleX;
        ctx.beginPath();
        ctx.arc(centerPx, centerPy, centerRadPx, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(180,50,50,0.12)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(180,50,50,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw castle if placed
        if (castleX !== undefined && castleY !== undefined) {
            const valid = this.isValidKingdomSpot(castleX, castleY) && !this.isCenterZone(castleX, castleY);

            // Highlight kingdom region
            const tile = this.getTile(castleX, castleY);
            if (tile && tile.regionId >= 0) {
                const region = this.regions[tile.regionId];
                ctx.fillStyle = valid ? 'rgba(58,122,213,0.25)' : 'rgba(180,50,50,0.25)';
                for (const t of region.tiles) {
                    ctx.fillRect(t.x * scaleX, t.y * scaleY, scaleX + 0.5, scaleY + 0.5);
                }
            }

            // Castle icon
            const cx = (castleX + 0.5) * scaleX;
            const cy = (castleY + 0.5) * scaleY;
            const iconSize = Math.max(18, scaleX * 4);
            ctx.font = `${iconSize}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.7)';
            ctx.shadowBlur = 4;
            ctx.fillText('\u{1F3F0}', cx, cy);
            ctx.shadowBlur = 0;
        }
    },

    _terrainRGB(terrain, x, y) {
        // Subtle per-tile variation
        const hash = ((x * 7919 + y * 6271) & 0xFFFF) / 0xFFFF;
        const v = (hash - 0.5) * 12;

        switch (terrain) {
            case CONFIG.TERRAIN.DEEP_WATER:  return [22 + v, 62 + v, 110 + v];
            case CONFIG.TERRAIN.WATER:       return [38 + v, 88 + v, 140 + v];
            case CONFIG.TERRAIN.SAND:        return [194 + v, 178 + v, 128 + v];
            case CONFIG.TERRAIN.PLAINS:      return [148 + v, 176 + v, 72 + v];
            case CONFIG.TERRAIN.GRASS:       return [88 + v, 148 + v, 52 + v];
            case CONFIG.TERRAIN.FOREST:      return [42 + v, 92 + v, 38 + v];
            case CONFIG.TERRAIN.DENSE_FOREST:return [24 + v, 62 + v, 26 + v];
            case CONFIG.TERRAIN.HILLS:       return [132 + v, 112 + v, 78 + v];
            case CONFIG.TERRAIN.MOUNTAIN:    return [108 + v, 104 + v, 98 + v];
            case CONFIG.TERRAIN.SNOW_PEAK:   return [210 + v, 215 + v, 220 + v];
            default:                         return [40, 40, 40];
        }
    }
};
