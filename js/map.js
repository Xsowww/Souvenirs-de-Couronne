// Map generation and management
const GameMap = {
    tiles: [],
    regions: [],
    width: CONFIG.MAP_WIDTH,
    height: CONFIG.MAP_HEIGHT,

    // Step 1: Generate terrain only (no regions)
    generateTerrain(seed, onProgress) {
        Perlin.seed(seed);
        Perlin.seedRng(seed);
        this.width = CONFIG.MAP_WIDTH;
        this.height = CONFIG.MAP_HEIGHT;
        this.tiles = [];
        this.regions = [];

        const totalRows = this.height;
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = [];
            for (let x = 0; x < this.width; x++) {
                const elevation = Perlin.octave(x * 0.06, y * 0.06, 4, 0.5);
                const moisture = Perlin.octave(x * 0.05 + 100, y * 0.05 + 100, 3, 0.5);

                let terrain;
                if (elevation < -0.25) terrain = CONFIG.TERRAIN.WATER;
                else if (elevation < -0.05) terrain = CONFIG.TERRAIN.PLAINS;
                else if (elevation < 0.15) {
                    terrain = moisture > 0.1 ? CONFIG.TERRAIN.FOREST : CONFIG.TERRAIN.GRASS;
                }
                else if (elevation < 0.35) terrain = CONFIG.TERRAIN.HILLS;
                else terrain = CONFIG.TERRAIN.MOUNTAIN;

                this.tiles[y][x] = {
                    x, y,
                    terrain,
                    building: null,
                    owner: -1,
                    visible: false,
                    explored: false,
                    decoration: null
                };
            }
            if (onProgress) onProgress((y + 1) / totalRows * 0.6);
        }

        // Add decorations
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.tiles[y][x].terrain === CONFIG.TERRAIN.FOREST && Perlin.random() < 0.6) {
                    this.tiles[y][x].decoration = 'tree';
                }
                if (this.tiles[y][x].terrain === CONFIG.TERRAIN.MOUNTAIN && Perlin.random() < 0.3) {
                    this.tiles[y][x].decoration = 'rock';
                }
            }
            if (onProgress) onProgress(0.6 + ((y + 1) / this.height) * 0.2);
        }
    },

    // Step 2: Place regions based on player-chosen position
    generateRegions(playerX, playerY) {
        this.regions = [];

        // Reset all owners
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.tiles[y][x].owner = -1;
            }
        }

        // Player region
        const playerStart = this.findValidSpot(playerX, playerY, 3);
        this.regions.push({
            id: 0,
            name: 'Votre Royaume',
            faction: 0,
            color: CONFIG.FACTION_COLORS[0],
            tiles: [],
            capital: playerStart,
            isPlayer: true
        });

        // Find positions for enemy kingdoms - spread far from player
        const enemyPositions = this._findEnemyPositions(playerStart.x, playerStart.y);
        const factionNames = ['Royaume de Fer', 'Duche de Flamme', 'Comtat des Ombres', 'Empire Dore'];

        for (let i = 0; i < enemyPositions.length; i++) {
            const pos = this.findValidSpot(enemyPositions[i].x, enemyPositions[i].y, 6);
            this.regions.push({
                id: i + 1,
                name: factionNames[i],
                faction: i + 1,
                color: CONFIG.FACTION_COLORS[i + 1],
                tiles: [],
                capital: pos,
                isPlayer: false,
                type: i < 3 ? 'rival' : 'empire'
            });
        }

        // Place bandit camps in gaps between kingdoms
        const banditPositions = this._findBanditPositions(playerStart, enemyPositions);
        for (let b = 0; b < banditPositions.length; b++) {
            const pos = this.findValidSpot(banditPositions[b].x, banditPositions[b].y, 4);
            this.regions.push({
                id: 5 + b,
                name: 'Bandits',
                faction: -2,
                color: '#666',
                tiles: [],
                capital: pos,
                isPlayer: false,
                type: 'bandit'
            });
        }

        // Assign initial territory
        for (const region of this.regions) {
            const radius = region.isPlayer ? 4 : (region.type === 'bandit' ? 2 : 3);
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const tx = region.capital.x + dx;
                    const ty = region.capital.y + dy;
                    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
                    if (this.tiles[ty][tx].terrain === CONFIG.TERRAIN.WATER) continue;
                    if (dx * dx + dy * dy <= radius * radius) {
                        if (this.tiles[ty][tx].owner === -1) {
                            this.tiles[ty][tx].owner = region.id;
                            region.tiles.push({ x: tx, y: ty });
                        }
                    }
                }
            }
        }
    },

    _findEnemyPositions(px, py) {
        // Place 4 enemy kingdoms as far as possible from the player
        // Use corners and edges, adjusting based on where player is
        const w = this.width;
        const h = this.height;
        const margin = Math.floor(Math.min(w, h) * 0.12);
        const candidates = [
            { x: margin, y: margin },
            { x: w - margin, y: margin },
            { x: margin, y: h - margin },
            { x: w - margin, y: h - margin },
            { x: Math.floor(w / 2), y: margin },
            { x: Math.floor(w / 2), y: h - margin },
            { x: margin, y: Math.floor(h / 2) },
            { x: w - margin, y: Math.floor(h / 2) }
        ];

        // Sort by distance from player (farthest first)
        candidates.sort((a, b) => {
            const da = (a.x - px) ** 2 + (a.y - py) ** 2;
            const db = (b.x - px) ** 2 + (b.y - py) ** 2;
            return db - da;
        });

        // Pick 4, ensuring minimum distance between each
        const selected = [];
        const minDist = Math.floor(Math.min(w, h) * 0.25);
        for (const c of candidates) {
            if (selected.length >= 4) break;
            const tooClose = selected.some(s =>
                Math.sqrt((s.x - c.x) ** 2 + (s.y - c.y) ** 2) < minDist
            );
            if (!tooClose) selected.push(c);
        }

        // Fill remaining if needed
        while (selected.length < 4) {
            selected.push(candidates[selected.length]);
        }

        return selected;
    },

    _findBanditPositions(playerPos, enemyPositions) {
        const allKingdoms = [playerPos, ...enemyPositions];
        const bandits = [];
        const minDistFromKingdom = Math.floor(Math.min(this.width, this.height) * 0.1);
        const count = Math.max(4, Math.floor((this.width * this.height) / 800));

        for (let attempt = 0; attempt < count * 10 && bandits.length < count; attempt++) {
            const bx = Math.floor(Perlin.random() * (this.width - 10)) + 5;
            const by = Math.floor(Perlin.random() * (this.height - 10)) + 5;

            // Check terrain
            if (bx >= this.width || by >= this.height) continue;
            const tile = this.tiles[by][bx];
            if (tile.terrain === CONFIG.TERRAIN.WATER || tile.terrain === CONFIG.TERRAIN.MOUNTAIN) continue;

            // Check distance from kingdoms
            const tooClose = allKingdoms.some(k =>
                Math.sqrt((k.x - bx) ** 2 + (k.y - by) ** 2) < minDistFromKingdom
            );
            if (tooClose) continue;

            // Check distance from other bandits
            const tooCloseBandit = bandits.some(b =>
                Math.sqrt((b.x - bx) ** 2 + (b.y - by) ** 2) < minDistFromKingdom * 0.6
            );
            if (tooCloseBandit) continue;

            bandits.push({ x: bx, y: by });
        }

        return bandits;
    },

    // Legacy method for save/load compatibility
    generate(seed) {
        this.generateTerrain(seed);
        this.generateRegions(Math.floor(this.width / 2), Math.floor(this.height / 2));
    },

    // Check if a position is valid for kingdom placement
    isValidKingdomSpot(x, y) {
        const radius = 4;
        let landCount = 0;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy > radius * radius) continue;
                const tx = x + dx;
                const ty = y + dy;
                const tile = this.getTile(tx, ty);
                if (tile && tile.terrain !== CONFIG.TERRAIN.WATER && tile.terrain !== CONFIG.TERRAIN.MOUNTAIN) {
                    landCount++;
                }
            }
        }
        // Need at least 60% land around the spot
        const totalInRadius = Math.PI * radius * radius;
        return landCount >= totalInRadius * 0.5;
    },

    findValidSpot(cx, cy, radius) {
        for (let r = 0; r <= radius; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const x = cx + dx;
                    const y = cy + dy;
                    if (x >= 0 && y >= 0 && x < this.width && y < this.height) {
                        if (this.tiles[y][x].terrain !== CONFIG.TERRAIN.WATER &&
                            this.tiles[y][x].terrain !== CONFIG.TERRAIN.MOUNTAIN) {
                            return { x, y };
                        }
                    }
                }
            }
        }
        return { x: cx, y: cy };
    },

    getTile(x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
        return this.tiles[y][x];
    },

    revealArea(cx, cy, radius) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy > radius * radius) continue;
                const tx = cx + dx;
                const ty = cy + dy;
                if (tx >= 0 && ty >= 0 && tx < this.width && ty < this.height) {
                    this.tiles[ty][tx].visible = true;
                    this.tiles[ty][tx].explored = true;
                }
            }
        }
    },

    updateVisibility(playerRegionId) {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.tiles[y][x].visible = false;
            }
        }
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const tile = this.tiles[y][x];
                if (tile.owner === playerRegionId) {
                    let radius = 3;
                    if (tile.building) {
                        if (tile.building.type === 'watchtower') radius = CONFIG.BUILDINGS.WATCHTOWER.visionRange + 3;
                        else if (tile.building.type === 'town_hall') radius = CONFIG.VISION_RADIUS;
                        else radius = 4;
                    }
                    this.revealArea(x, y, radius);
                }
            }
        }
    },

    getRegion(id) {
        return this.regions.find(r => r.id === id);
    },

    getPlayerRegion() {
        return this.regions.find(r => r.isPlayer);
    },

    getAdjacentEnemyRegions(playerRegionId) {
        const adjacent = new Set();
        const playerRegion = this.getRegion(playerRegionId);
        if (!playerRegion) return [];

        for (const t of playerRegion.tiles) {
            const neighbors = [
                { x: t.x - 1, y: t.y }, { x: t.x + 1, y: t.y },
                { x: t.x, y: t.y - 1 }, { x: t.x, y: t.y + 1 }
            ];
            for (const n of neighbors) {
                const tile = this.getTile(n.x, n.y);
                if (tile && tile.owner !== -1 && tile.owner !== playerRegionId) {
                    adjacent.add(tile.owner);
                }
            }
        }
        return [...adjacent].map(id => this.getRegion(id)).filter(Boolean);
    },

    annexRegion(targetId, newOwnerId) {
        const target = this.getRegion(targetId);
        const newOwner = this.getRegion(newOwnerId);
        if (!target || !newOwner) return;

        for (const t of target.tiles) {
            this.tiles[t.y][t.x].owner = newOwnerId;
            newOwner.tiles.push({ x: t.x, y: t.y });
        }
        target.tiles = [];
        target.faction = -99;
    },

    countTotalLandTiles() {
        let count = 0;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.tiles[y][x].terrain !== CONFIG.TERRAIN.WATER) count++;
            }
        }
        return count;
    },

    countOwnedTiles(regionId) {
        let count = 0;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.tiles[y][x].owner === regionId) count++;
            }
        }
        return count;
    },

    getConquestPercent(regionId) {
        const total = this.countTotalLandTiles();
        const owned = this.countOwnedTiles(regionId);
        return total > 0 ? Math.round((owned / total) * 100) : 0;
    },

    // Render the full map to a canvas (for placement screen)
    renderOverviewToCanvas(canvas, highlightX, highlightY, showValidity) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const scaleX = w / this.width;
        const scaleY = h / this.height;

        const terrainColors = {
            0: '#1e5a8a',
            1: '#a8be52',
            2: '#5a9a32',
            3: '#1e5528',
            4: '#8c7855',
            5: '#787872'
        };

        // Draw terrain
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const tile = this.tiles[y][x];
                ctx.fillStyle = terrainColors[tile.terrain] || '#333';
                ctx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
            }
        }

        // Highlight valid/invalid placement zones if showing
        if (highlightX !== undefined && highlightY !== undefined) {
            const radius = 5;
            const valid = this.isValidKingdomSpot(highlightX, highlightY);

            // Draw kingdom preview radius
            ctx.beginPath();
            ctx.arc(
                (highlightX + 0.5) * scaleX,
                (highlightY + 0.5) * scaleY,
                radius * scaleX,
                0, Math.PI * 2
            );
            ctx.fillStyle = valid ? 'rgba(60,160,80,0.3)' : 'rgba(180,50,50,0.3)';
            ctx.fill();
            ctx.strokeStyle = valid ? '#4a8a3a' : '#8a3a3a';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Castle marker
            ctx.fillStyle = '#c8a84a';
            ctx.font = `${Math.max(16, scaleX * 3)}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('\u{1F3F0}', (highlightX + 0.5) * scaleX, (highlightY + 0.5) * scaleY);
        }
    }
};
