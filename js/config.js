// Game configuration constants
const CONFIG = {
    // Map grid
    MAP_WIDTH: 400,
    MAP_HEIGHT: 400,
    CELL_SIZE: 16,

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
        0: 'Eau profonde', 1: 'Eau', 2: 'Sable', 3: 'Plaine', 4: 'Prairie',
        5: 'Foret', 6: 'Foret dense', 7: 'Collines', 8: 'Montagne', 9: 'Sommet enneige'
    },

    FACTION_COLORS: [
        '#3a7ad5', '#c43a3a', '#d4881a', '#8a3ab5', '#2a8a5a'
    ],

    // Starting resources
    START_RESOURCES: {
        wood: 150, stone: 0, ironOre: 0, goldOre: 0,
        ironIngot: 0, goldIngot: 0, food: 30, gold: 0
    },

    // Resource display info
    RESOURCE_NAMES: {
        wood: 'Bois', stone: 'Pierre', ironOre: 'Min. Fer', goldOre: 'Min. Or',
        ironIngot: 'Ling. Fer', goldIngot: 'Ling. Or', food: 'Nourriture', gold: 'Or'
    },

    RESOURCE_ICONS: {
        wood: '\u{1FAB5}', stone: '\u{1FAA8}', ironOre: '\u{26CF}', goldOre: '\u{26CF}',
        ironIngot: '\u{1F529}', goldIngot: '\u{1F947}', food: '\u{1F35E}', gold: '\u{1FA99}'
    },

    // Per-resource storage caps (gold has no cap)
    STORAGE: {
        BASE: { wood: 150, stone: 100, ironOre: 50, goldOre: 50, ironIngot: 50, goldIngot: 50, food: 100 },
        // Warehouse bonuses per level [niv1, niv2, niv3]
        WAREHOUSE_BONUS: [
            { wood: 200, stone: 200, ironOre: 100, goldOre: 100, ironIngot: 100, goldIngot: 100, food: 200 },
            { wood: 400, stone: 400, ironOre: 200, goldOre: 200, ironIngot: 200, goldIngot: 200, food: 400 },
            { wood: 800, stone: 800, ironOre: 400, goldOre: 400, ironIngot: 400, goldIngot: 400, food: 800 }
        ]
    },

    // Food consumption: per meal * 2 meals/day = per day. 4 cycles/day → perCycle = perDay/4
    FOOD_PER_MEAL: 4,       // niv1 house
    FOOD_PER_MEAL_NIV2: 6,  // niv2 house (has child)
    MEALS_PER_DAY: 2,

    // Buildings
    BUILDINGS: {
        house: {
            name: 'Maison de Villageois',
            icon: '\u{1F3E0}',
            cost: { wood: 40 },
            job: null,
            description: 'Accueille 1 famille (2 adultes). Conso: 8 nourriture/jour.',
            production: null,
            terrain: [2, 3, 4],
            upgrades: [
                { name: 'Niveau 2', cost: { wood: 60, stone: 20 },
                  bonus: 'Enfant: +25% production, conso 12 nourriture/jour' }
            ]
        },
        lumberjack: {
            name: 'Camp de Bucherons',
            icon: '\u{1FA93}',
            cost: { wood: 50 },
            job: 'Bucheron',
            description: 'Produit du bois. Se place en foret. 8 bois/cycle.',
            production: { wood: 8 },
            terrain: [5, 6],
            upgrades: [
                { name: 'Niveau 2', cost: { wood: 80, stone: 30 }, productionBonus: { wood: 7 } },
                { name: 'Niveau 3', cost: { wood: 120, stone: 80 }, productionBonus: { wood: 10 } }
            ]
        },
        farm: {
            name: 'Ferme',
            icon: '\u{1F33E}',
            cost: { wood: 60 },
            job: 'Fermier',
            description: 'Produit de la nourriture. Se place en plaine. 5 nourriture/cycle.',
            production: { food: 5 },
            terrain: [2, 3, 4],
            upgrades: [
                { name: 'Niveau 2', cost: { wood: 90, stone: 30 }, productionBonus: { food: 4 } },
                { name: 'Niveau 3', cost: { wood: 130, stone: 80 }, productionBonus: { food: 5 } }
            ]
        },
        mine: {
            name: 'Mine',
            icon: '\u{26CF}',
            cost: { wood: 80 },
            job: 'Mineur',
            description: 'Recolte pierre et minerais. Se place sur la roche.',
            production: null, // special mine logic
            terrain: [7, 8],
            mineRates: [
                { stone: 5, ironOreChance: 0.30, goldOreChance: 0.12 },
                { stone: 9, ironOreChance: 0.50, goldOreChance: 0.20 },
                { stone: 12, ironOreChance: 0.75, goldOreChance: 0.30 }
            ],
            upgrades: [
                { name: 'Niveau 2', cost: { wood: 100, stone: 40 }, bonus: '+7 pierre, fer 40%, or 15%' },
                { name: 'Niveau 3', cost: { wood: 150, stone: 80 }, bonus: '+10 pierre, fer 60%, or 25%' }
            ]
        },
        warehouse: {
            name: 'Entrepot',
            icon: '\u{1F3ED}',
            cost: { wood: 80 },
            job: null,
            description: 'Augmente les capacites de stockage. Se place en plaine.',
            production: null,
            terrain: [2, 3, 4],
            upgrades: [
                { name: 'Niveau 2', cost: { wood: 140, stone: 60 }, bonus: 'Capacites doublees' },
                { name: 'Niveau 3', cost: { wood: 220, stone: 120 }, bonus: 'Capacites quadruplees' }
            ]
        },
        foundry: {
            name: 'Fonderie',
            icon: '\u{1F525}',
            cost: { wood: 70, stone: 40 },
            job: 'Fondeur',
            optionalFamily: true,
            description: 'Convertit minerais en lingots. Se place en plaine.',
            production: null, // special foundry logic
            terrain: [2, 3, 4],
            foundryRates: [
                { oreNeeded: 2, ingotProduced: 1 },
                { oreNeeded: 3, ingotProduced: 2 },
                { oreNeeded: 2, ingotProduced: 2 }
            ],
            upgrades: [
                { name: 'Niveau 2', cost: { wood: 100, stone: 80 }, bonus: '3 minerais \u2192 2 lingots' },
                { name: 'Niveau 3', cost: { wood: 140, stone: 120 }, bonus: '2 minerais \u2192 2 lingots (x2)' }
            ]
        },
        barracks: {
            name: 'Camp Militaire',
            icon: '\u{2694}',
            cost: { wood: 120, stone: 80, gold: 50 },
            job: 'Soldat',
            unique: true,
            multiFamily: true,
            description: 'Entraine des familles. Choix: Soldat / Archer / Cavalier.',
            production: null,
            terrain: [2, 3, 4],
            satisfactionBonus: 15,
            trainingCosts: {
                soldier:  { food: 8,  gold: 10, cycles: 4 },
                archer:   { food: 10, gold: 15, cycles: 6 },
                cavalier: { food: 12, gold: 25, cycles: 8 }
            },
            upgrades: []
        },
        comptoir: {
            name: 'Comptoir',
            icon: '\u{1F3EA}',
            cost: { wood: 90, stone: 40 },
            job: null,
            unique: true,
            description: 'Envoie des familles au marche noir. Achete armes et montures.',
            production: null,
            terrain: [2, 3, 4],
            shopItems: {
                simpleWeapon: { name: 'Arme simple', cost: 15, desc: 'Soldats / Archers' },
                heavyWeapon:  { name: 'Arme lourde', cost: 25, desc: 'Cavaliers' },
                cow:          { name: 'Vache', cost: 40, desc: 'Capacite transport +5' },
                horse:        { name: 'Cheval', cost: 80, desc: 'Transport + vitesse' },
                chariot:      { name: 'Chariot', cost: 120, desc: 'Transport maximum' }
            },
            upgrades: []
        }
    },

    // Lingot selling prices (at comptoir)
    LINGOT_PRICES: {
        ironIngot: 10,  // 1 lingot fer = 10 or
        goldIngot: 30   // 1 lingot or = 30 or
    },

    // Demolition refund rate
    DEMOLITION_REFUND: 0.5,

    VISION_RADIUS: 6
};
