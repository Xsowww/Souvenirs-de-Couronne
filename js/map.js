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

                const terrain = this._elevToTerrain(finalElev, moisture);

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

    _elevToTerrain(elev, moisture) {
        if (elev < -0.30) return CONFIG.TERRAIN.DEEP_WATER;
        if (elev < -0.15) return CONFIG.TERRAIN.WATER;
        if (elev < -0.08) return CONFIG.TERRAIN.SAND;
        if (elev < 0.02) return CONFIG.TERRAIN.PLAINS;
        if (elev < 0.15) {
            return moisture > 0.15 ? CONFIG.TERRAIN.FOREST :
                   moisture > -0.05 ? CONFIG.TERRAIN.GRASS : CONFIG.TERRAIN.PLAINS;
        }
        if (elev < 0.25) {
            return moisture > 0.2 ? CONFIG.TERRAIN.DENSE_FOREST : CONFIG.TERRAIN.FOREST;
        }
        if (elev < 0.38) return CONFIG.TERRAIN.HILLS;
        if (elev < 0.50) return CONFIG.TERRAIN.MOUNTAIN;
        return CONFIG.TERRAIN.SNOW_PEAK;
    },

    _generateNaturalRegions() {
        // Voronoi-style: place seed points, assign each land tile to nearest
        this.regions = [];
        const numRegions = Math.floor((this.width * this.height) / 900);
        const seeds = [];

        // Place region seeds on land tiles
        for (let attempt = 0; attempt < numRegions * 20 && seeds.length < numRegions; attempt++) {
            const rx = Math.floor(Perlin.random() * this.width);
            const ry = Math.floor(Perlin.random() * this.height);
            const tile = this.tiles[ry][rx];
            if (tile.terrain <= CONFIG.TERRAIN.WATER) continue;
            // Min distance from other seeds
            const tooClose = seeds.some(s =>
                Math.sqrt((s.x - rx) ** 2 + (s.y - ry) ** 2) < 12
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
    isValidKingdomSpot(x, y) {
        const radius = 6;
        let landCount = 0;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy > radius * radius) continue;
                const tile = this.getTile(x + dx, y + dy);
                if (tile && tile.terrain > CONFIG.TERRAIN.WATER && tile.terrain < CONFIG.TERRAIN.MOUNTAIN) {
                    landCount++;
                }
            }
        }
        return landCount >= 60;
    },

    // Place kingdoms based on player position
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

        // Find spots for 4 enemy kingdoms - far from player
        const candidates = this.regions.filter(r =>
            r.tiles.length >= 40 && r.owner === -1
        );

        candidates.sort((a, b) => {
            const da = (a.center.x - playerX) ** 2 + (a.center.y - playerY) ** 2;
            const db = (b.center.x - playerX) ** 2 + (b.center.y - playerY) ** 2;
            return db - da;
        });

        const enemyNames = ['Royaume de Fer', 'Duche de Flamme', 'Comtat des Ombres', 'Empire Dore'];
        let placed = 0;
        const minDistBetweenEnemies = 30;

        for (const region of candidates) {
            if (placed >= 4) break;

            // Check distance from already placed enemies
            const tooClose = this.regions.some(r =>
                r.owner > 0 && Math.sqrt(
                    (r.center.x - region.center.x) ** 2 +
                    (r.center.y - region.center.y) ** 2
                ) < minDistBetweenEnemies
            );
            if (tooClose) continue;

            placed++;
            region.owner = placed;
            region.name = enemyNames[placed - 1];
            region.color = CONFIG.FACTION_COLORS[placed];

            for (const t of region.tiles) {
                this.tiles[t.y][t.x].owner = placed;
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

        // Draw castle if placed
        if (castleX !== undefined && castleY !== undefined) {
            const valid = this.isValidKingdomSpot(castleX, castleY);

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
