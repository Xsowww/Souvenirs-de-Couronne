// Save and load system using localStorage
const SaveManager = {
    SAVE_KEY: 'souvenirs_de_couronne_save',
    AUTO_SAVE_KEY: 'souvenirs_de_couronne_autosave',

    save(slot) {
        const key = slot === 'auto' ? this.AUTO_SAVE_KEY : this.SAVE_KEY;
        const data = {
            version: 1,
            seed: Game.seed,
            year: Game.year,
            season: Game.season,
            totalCycles: Game.totalCycles,
            resources: Resources.serialize(),
            population: Population.serialize(),
            military: Military.serialize(),
            buildings: Buildings.serialize(),
            tech: TechTree.serialize(),
            factions: Factions.serialize(),
            map: this.serializeMap(),
            timestamp: Date.now()
        };
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Save failed:', e);
            return false;
        }
    },

    load(slot) {
        const key = slot === 'auto' ? this.AUTO_SAVE_KEY : this.SAVE_KEY;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.error('Load failed:', e);
            return null;
        }
    },

    hasSave() {
        return !!(localStorage.getItem(this.SAVE_KEY) || localStorage.getItem(this.AUTO_SAVE_KEY));
    },

    serializeMap() {
        const tiles = [];
        for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
            tiles[y] = [];
            for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
                const t = GameMap.tiles[y][x];
                tiles[y][x] = {
                    terrain: t.terrain,
                    owner: t.owner,
                    explored: t.explored,
                    decoration: t.decoration
                };
            }
        }
        return {
            tiles,
            regions: GameMap.regions.map(r => ({
                id: r.id,
                name: r.name,
                faction: r.faction,
                color: r.color,
                capital: r.capital,
                isPlayer: r.isPlayer,
                type: r.type,
                tiles: r.tiles
            }))
        };
    },

    deserializeMap(data) {
        for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
            for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
                const saved = data.tiles[y][x];
                GameMap.tiles[y][x] = {
                    x, y,
                    terrain: saved.terrain,
                    building: null,
                    owner: saved.owner,
                    visible: false,
                    explored: saved.explored,
                    decoration: saved.decoration
                };
            }
        }
        GameMap.regions = data.regions;
    }
};
