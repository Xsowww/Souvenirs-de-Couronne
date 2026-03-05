// Building placement and management
const Buildings = {
    playerBuildings: [],

    getTownHallLevel() {
        for (const b of this.playerBuildings) {
            if (b.type === 'town_hall') return b.level || 1;
        }
        return 0;
    },

    canBuild(buildingId) {
        const bKey = buildingId.toUpperCase();
        const bDef = CONFIG.BUILDINGS[bKey];
        if (!bDef) return false;

        // Check town hall requirement
        if (bDef.requiresTownHall && this.getTownHallLevel() < bDef.requiresTownHall) {
            return false;
        }

        // Check resources
        return Resources.canAfford(bDef.cost);
    },

    getAvailableBuildings() {
        const available = [];
        const thLevel = this.getTownHallLevel();

        for (const [key, bDef] of Object.entries(CONFIG.BUILDINGS)) {
            if (key === 'TOWN_HALL') continue; // only placed once at start
            if (bDef.requiresTownHall && thLevel < bDef.requiresTownHall) continue;
            available.push({ key: key.toLowerCase(), ...bDef });
        }
        return available;
    },

    placeBuilding(x, y, buildingId) {
        const bKey = buildingId.toUpperCase();
        const bDef = CONFIG.BUILDINGS[bKey];
        if (!bDef) return false;

        const tile = GameMap.getTile(x, y);
        if (!tile) return false;

        // Validate terrain
        if (bDef.validTerrain && !bDef.validTerrain.includes(tile.terrain)) {
            Notifications.add(`${bDef.name} ne peut pas etre place sur ce terrain.`, 'alert');
            return false;
        }

        // Can't build on water or existing building
        if (tile.terrain === CONFIG.TERRAIN.WATER) return false;
        if (tile.building) {
            Notifications.add('Il y a deja un batiment ici.', 'alert');
            return false;
        }

        // Must be player territory
        if (tile.owner !== 0) {
            Notifications.add('Vous ne pouvez construire que sur votre territoire.', 'alert');
            return false;
        }

        // Spend resources
        if (!Resources.spend(bDef.cost)) {
            Notifications.add('Ressources insuffisantes !', 'alert');
            return false;
        }

        const building = {
            type: buildingId.toLowerCase(),
            x, y,
            level: 1,
            built: true
        };

        tile.building = building;
        this.playerBuildings.push(building);

        // Increase pop cap for houses
        if (bDef.popIncrease) {
            Population.maxPop += bDef.popIncrease;
        }

        // Vision for watchtower
        if (buildingId === 'watchtower') {
            GameMap.revealArea(x, y, bDef.visionRange + 3);
        }

        Resources.updateRates();
        Notifications.add(`${bDef.name} construit !`, 'success');
        return true;
    },

    placeTownHall(x, y) {
        const tile = GameMap.getTile(x, y);
        if (!tile) return;
        const building = {
            type: 'town_hall',
            x, y,
            level: 1,
            built: true
        };
        tile.building = building;
        this.playerBuildings.push(building);
        GameMap.revealArea(x, y, CONFIG.VISION_RADIUS);
    },

    upgradeTownHall() {
        const th = this.playerBuildings.find(b => b.type === 'town_hall');
        if (!th || th.level >= 5) return false;

        const cost = {
            wood: 50 * th.level,
            stone: 50 * th.level,
            food: 20 * th.level,
            gold: 30 * th.level
        };

        if (!Resources.spend(cost)) {
            Notifications.add('Ressources insuffisantes pour ameliorer !', 'alert');
            return false;
        }

        th.level++;
        Notifications.add(`Hotel de ville ameliore au niveau ${th.level} !`, 'success');
        return true;
    },

    getDefenseBonus() {
        let defense = 0;
        for (const b of this.playerBuildings) {
            if (b.type === 'wall') defense += CONFIG.BUILDINGS.WALL.defense;
        }
        if (TechTree.isResearched('fortifications')) defense += 15;
        return defense;
    },

    hasBuilding(type) {
        return this.playerBuildings.some(b => b.type === type);
    },

    countBuilding(type) {
        return this.playerBuildings.filter(b => b.type === type).length;
    },

    serialize() {
        return this.playerBuildings.map(b => ({
            type: b.type, x: b.x, y: b.y, level: b.level
        }));
    },

    deserialize(data) {
        this.playerBuildings = [];
        for (const bd of data) {
            const tile = GameMap.getTile(bd.x, bd.y);
            if (tile) {
                const building = { type: bd.type, x: bd.x, y: bd.y, level: bd.level || 1, built: true };
                tile.building = building;
                this.playerBuildings.push(building);
            }
        }
    }
};
