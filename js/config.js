// Game configuration constants
const CONFIG = {
    // Map grid (invisible) - large map
    MAP_WIDTH: 400,
    MAP_HEIGHT: 400,
    CELL_SIZE: 16, // pixels per grid cell at zoom 1

    // Terrain types
    TERRAIN: {
        DEEP_WATER: 0,
        WATER: 1,
        SAND: 2,
        PLAINS: 3,
        GRASS: 4,
        FOREST: 5,
        DENSE_FOREST: 6,
        HILLS: 7,
        MOUNTAIN: 8,
        SNOW_PEAK: 9
    },

    TERRAIN_NAMES: {
        0: 'Eau profonde',
        1: 'Eau',
        2: 'Sable',
        3: 'Plaine',
        4: 'Prairie',
        5: 'Foret',
        6: 'Foret dense',
        7: 'Collines',
        8: 'Montagne',
        9: 'Sommet enneige'
    },

    // Faction colors
    FACTION_COLORS: [
        '#3a7ad5', // player - blue
        '#c43a3a', // rival 1 - red
        '#d4881a', // rival 2 - orange
        '#8a3ab5', // rival 3 - purple
        '#2a8a5a', // rival 4 - green
    ],

    // Speed settings (ms per cycle tick)
    SPEED: {
        PAUSED: 0,
        NORMAL: 3000,
        FAST: 1000
    },

    // Starting resources
    START_RESOURCES: {
        wood: 15,
        stone: 0,
        iron: 0,
        gold: 0,
        food: 5
    },

    // Storage capacity (base + per warehouse)
    STORAGE: {
        BASE_CAPACITY: 50,
        PER_WAREHOUSE: 50
    },

    // Buildings
    BUILDINGS: {
        lumberjack: {
            name: 'Cabane de Bucheron',
            icon: '\u{1FA93}',
            cost: { wood: 10 },
            job: 'Bucheron',
            description: 'Produit du bois. Se place en foret.',
            production: { wood: 3 },
            terrain: [5, 6], // forest and dense forest only
            upgrades: [
                { name: 'Niveau 2', cost: { wood: 15, stone: 5 }, productionBonus: { wood: 2 } },
                { name: 'Niveau 3', cost: { wood: 25, stone: 10, iron: 3 }, productionBonus: { wood: 3 } }
            ]
        },
        house: {
            name: 'Maison de Villageois',
            icon: '\u{1F3E0}',
            cost: { wood: 8 },
            job: null, // no job - provides housing
            description: 'Accueille une famille supplementaire. Se place en plaine.',
            production: null,
            terrain: [2, 3, 4], // sand, plains, grass
            upgrades: [
                { name: 'Niveau 2', cost: { wood: 12, stone: 5 }, bonus: 'Accueille 2 familles' },
                { name: 'Niveau 3', cost: { wood: 20, stone: 12, iron: 3 }, bonus: 'Accueille 3 familles' }
            ]
        },
        mine: {
            name: 'Mine',
            icon: '\u{26CF}',
            cost: { wood: 12 },
            job: 'Mineur',
            description: 'Recolte pierre, lingots de fer et d\'or',
            production: { stone: 2, iron: 1 },
            terrain: [7, 8], // hills and mountains only
            upgrades: [
                { name: 'Niveau 2', cost: { wood: 15, stone: 8 }, productionBonus: { stone: 1, iron: 1 } },
                { name: 'Niveau 3', cost: { wood: 20, stone: 15, iron: 5 }, productionBonus: { stone: 2, iron: 1, gold: 1 } }
            ]
        },
        warehouse: {
            name: 'Entrepot',
            icon: '\u{1F3ED}',
            cost: { wood: 12, stone: 5 },
            job: null,
            description: 'Augmente le stockage de +50. Se place en plaine.',
            production: null,
            terrain: [2, 3, 4], // sand, plains, grass
            upgrades: [
                { name: 'Niveau 2', cost: { wood: 18, stone: 10, iron: 3 }, bonus: '+75 stockage' },
                { name: 'Niveau 3', cost: { wood: 25, stone: 20, iron: 8 }, bonus: '+100 stockage' }
            ]
        },
        foundry: {
            name: 'Fonderie',
            icon: '\u{1F525}',
            cost: { wood: 15, stone: 8 },
            job: 'Fondeur',
            description: 'Fond les lingots en fer ou or brut. Se place en plaine.',
            production: { iron: 2, gold: 1 },
            terrain: [2, 3, 4], // sand, plains, grass
            upgrades: [
                { name: 'Niveau 2', cost: { wood: 20, stone: 12, iron: 5 }, productionBonus: { iron: 1, gold: 1 } },
                { name: 'Niveau 3', cost: { wood: 30, stone: 20, iron: 12, gold: 3 }, productionBonus: { iron: 2, gold: 2 } }
            ]
        },
        market: {
            name: 'Marche',
            icon: '\u{1F3EA}',
            cost: { wood: 15, stone: 10, gold: 2 },
            job: 'Marchand',
            description: 'Augmente la satisfaction. Produit de l\'or via le commerce. Se place en plaine.',
            production: { gold: 2, food: 1 },
            terrain: [2, 3, 4], // sand, plains, grass
            satisfactionBonus: 20,
            upgrades: [
                { name: 'Niveau 2', cost: { wood: 20, stone: 15, gold: 5 }, productionBonus: { gold: 1, food: 1 } },
                { name: 'Niveau 3', cost: { wood: 30, stone: 25, gold: 10 }, productionBonus: { gold: 2, food: 2 } }
            ]
        },
        barracks: {
            name: 'Caserne',
            icon: '\u{2694}',
            cost: { wood: 20, stone: 15, iron: 5 },
            job: 'Soldat',
            description: 'Entraine des soldats. Augmente la securite et la satisfaction. Se place en plaine.',
            production: null,
            terrain: [2, 3, 4], // sand, plains, grass
            satisfactionBonus: 15,
            upgrades: [
                { name: 'Niveau 2', cost: { wood: 25, stone: 20, iron: 10 }, bonus: 'Soldats veterants (+atk/def)' },
                { name: 'Niveau 3', cost: { wood: 35, stone: 30, iron: 20, gold: 5 }, bonus: 'Soldats d\'elite (+atk/def)' }
            ]
        }
    },

    VISION_RADIUS: 6
};
