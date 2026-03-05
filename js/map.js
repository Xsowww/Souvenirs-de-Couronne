// Map generation and management
const GameMap = {
    tiles: [],
    regions: [],
    width: CONFIG.MAP_WIDTH,
    height: CONFIG.MAP_HEIGHT,

    generate(seed) {
        Perlin.seed(seed);
        Perlin.seedRng(seed);
        this.tiles = [];
        this.regions = [];

        // Generate terrain using Perlin noise
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
                    owner: -1, // -1 = unclaimed
                    visible: false,
                    explored: false,
                    decoration: null
                };
            }
        }

        // Add some decorations
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.tiles[y][x].terrain === CONFIG.TERRAIN.FOREST && Perlin.random() < 0.6) {
                    this.tiles[y][x].decoration = 'tree';
                }
                if (this.tiles[y][x].terrain === CONFIG.TERRAIN.MOUNTAIN && Perlin.random() < 0.3) {
                    this.tiles[y][x].decoration = 'rock';
                }
            }
        }

        // Generate regions for factions
        this.generateRegions();
    },

    generateRegions() {
        // Divide map into roughly equal regions using a simple grid approach
        // Player starts near center, rivals at edges
        const regionSize = 15; // approximate region side
        this.regions = [];

        // Player region - center area
        const cx = Math.floor(this.width / 2);
        const cy = Math.floor(this.height / 2);

        // Find valid starting position for player near center
        const playerStart = this.findValidSpot(cx, cy, 5);
        this.regions.push({
            id: 0,
            name: 'Votre Royaume',
            faction: 0,
            color: CONFIG.FACTION_COLORS[0],
            tiles: [],
            capital: playerStart,
            isPlayer: true
        });

        // Rival kingdoms at corners/edges
        const rivalPositions = [
            { x: 10, y: 10 },
            { x: this.width - 10, y: 10 },
            { x: 10, y: this.height - 10 },
            { x: this.width - 10, y: this.height - 10 }
        ];

        const factionNames = ['Royaume de Fer', 'Duche de Flamme', 'Comtat des Ombres', 'Empire Dore'];

        for (let i = 0; i < 4; i++) {
            const pos = this.findValidSpot(rivalPositions[i].x, rivalPositions[i].y, 5);
            const fType = i < 3 ? 'rival' : 'empire';
            this.regions.push({
                id: i + 1,
                name: factionNames[i],
                faction: i + 1,
                color: CONFIG.FACTION_COLORS[i + 1],
                tiles: [],
                capital: pos,
                isPlayer: false,
                type: fType
            });
        }

        // Add bandit camps scattered around
        for (let b = 0; b < 6; b++) {
            const bx = Math.floor(Perlin.random() * (this.width - 10)) + 5;
            const by = Math.floor(Perlin.random() * (this.height - 10)) + 5;
            const pos = this.findValidSpot(bx, by, 4);
            this.regions.push({
                id: 5 + b,
                name: 'Bandits',
                faction: -2, // bandit
                color: '#666',
                tiles: [],
                capital: pos,
                isPlayer: false,
                type: 'bandit'
            });
        }

        // Assign initial territory: each faction gets a radius of tiles around capital
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

    findValidSpot(cx, cy, radius) {
        // Find a non-water tile near the given position
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
        // Reset visibility (explored stays)
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.tiles[y][x].visible = false;
            }
        }
        // Reveal around player buildings and territory
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
        target.faction = -99; // defeated
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
    }
};
