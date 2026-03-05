// AI Factions - rival kingdoms, bandits, and empires
const Factions = {
    factionData: {},

    init() {
        this.factionData = {};
        for (const region of GameMap.regions) {
            if (region.isPlayer) continue;
            if (region.faction === -99) continue;

            this.factionData[region.id] = {
                regionId: region.id,
                type: region.type || 'rival',
                strength: this.getInitialStrength(region),
                aggression: region.type === 'bandit' ? 0.6 : (region.type === 'empire' ? 0.3 : 0.4),
                lastAttack: -10,
                growthRate: region.type === 'empire' ? 8 : (region.type === 'bandit' ? 2 : 5)
            };
        }
    },

    getInitialStrength(region) {
        if (region.type === 'bandit') return 20 + Math.floor(Perlin.random() * 30);
        if (region.type === 'empire') return 80 + Math.floor(Perlin.random() * 60);
        return 40 + Math.floor(Perlin.random() * 40);
    },

    processCycle(year, season) {
        for (const [id, data] of Object.entries(this.factionData)) {
            const region = GameMap.getRegion(parseInt(id));
            if (!region || region.faction === -99 || region.tiles.length === 0) continue;

            // Growth
            data.strength += data.growthRate;

            // Expansion: AI tries to claim adjacent unclaimed tiles
            if (Perlin.random() < 0.3) {
                this.expandTerritory(region);
            }

            // Attack player?
            if (this.shouldAttackPlayer(data, year)) {
                this.attackPlayer(region, data);
            }
        }
    },

    expandTerritory(region) {
        // Grab some adjacent unclaimed tiles
        const newTiles = [];
        for (const t of region.tiles) {
            const neighbors = [
                { x: t.x - 1, y: t.y }, { x: t.x + 1, y: t.y },
                { x: t.x, y: t.y - 1 }, { x: t.x, y: t.y + 1 }
            ];
            for (const n of neighbors) {
                const tile = GameMap.getTile(n.x, n.y);
                if (tile && tile.owner === -1 && tile.terrain !== CONFIG.TERRAIN.WATER) {
                    if (Perlin.random() < 0.15) {
                        tile.owner = region.id;
                        newTiles.push({ x: n.x, y: n.y });
                    }
                }
            }
        }
        region.tiles.push(...newTiles);
    },

    shouldAttackPlayer(data, year) {
        if (year < 2) return false; // grace period
        if (year - data.lastAttack < 3) return false; // cooldown
        if (data.strength < 30) return false;

        // Check adjacency with player
        const region = GameMap.getRegion(data.regionId);
        if (!region) return false;

        const playerRegion = GameMap.getPlayerRegion();
        if (!playerRegion) return false;

        // Check if actually adjacent
        let adjacent = false;
        for (const t of region.tiles) {
            const neighbors = [
                { x: t.x - 1, y: t.y }, { x: t.x + 1, y: t.y },
                { x: t.x, y: t.y - 1 }, { x: t.x, y: t.y + 1 }
            ];
            for (const n of neighbors) {
                const tile = GameMap.getTile(n.x, n.y);
                if (tile && tile.owner === playerRegion.id) {
                    adjacent = true;
                    break;
                }
            }
            if (adjacent) break;
        }

        if (!adjacent) return false;

        return Perlin.random() < data.aggression * 0.15;
    },

    attackPlayer(region, data) {
        data.lastAttack = typeof Game !== 'undefined' ? Game.year : 0;

        const attackPower = Math.floor(data.strength * 0.6);
        const playerDefense = Buildings.getDefenseBonus() + Military.getTotalUnits() * 8;

        const roll = (0.85 + Perlin.random() * 0.3);
        const attackScore = attackPower * roll;
        const defendScore = playerDefense * (0.85 + Perlin.random() * 0.3);

        if (attackScore > defendScore) {
            // Enemy wins - steal some border tiles
            const playerRegion = GameMap.getPlayerRegion();
            let stolen = 0;
            const maxSteal = Math.min(5, Math.floor(region.tiles.length * 0.3));

            // Find player border tiles adjacent to this region
            for (const t of [...playerRegion.tiles]) {
                if (stolen >= maxSteal) break;
                const neighbors = [
                    { x: t.x - 1, y: t.y }, { x: t.x + 1, y: t.y },
                    { x: t.x, y: t.y - 1 }, { x: t.x, y: t.y + 1 }
                ];
                for (const n of neighbors) {
                    const tile = GameMap.getTile(n.x, n.y);
                    if (tile && tile.owner === region.id) {
                        // This player tile borders enemy - steal it
                        const pt = GameMap.getTile(t.x, t.y);
                        if (pt && !pt.building) {
                            pt.owner = region.id;
                            region.tiles.push({ x: t.x, y: t.y });
                            playerRegion.tiles = playerRegion.tiles.filter(
                                tt => !(tt.x === t.x && tt.y === t.y)
                            );
                            stolen++;
                            break;
                        }
                    }
                }
            }

            Population.adjustMoral(-8);
            data.strength -= Math.floor(attackPower * 0.3);
            Notifications.add(`${region.name} attaque et prend du territoire !`, 'alert');
        } else {
            // Player defends
            data.strength -= Math.floor(attackPower * 0.5);
            Population.adjustMoral(5);
            Notifications.add(`Attaque de ${region.name} repoussee !`, 'success');
        }
    },

    serialize() {
        return this.factionData;
    },

    deserialize(data) {
        this.factionData = data;
    }
};
