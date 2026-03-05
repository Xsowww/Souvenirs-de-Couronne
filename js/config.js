// Game configuration constants
const CONFIG = {
    MAP_WIDTH: 60,
    MAP_HEIGHT: 60,
    TILE_WIDTH: 64,
    TILE_HEIGHT: 32,

    // Terrain types
    TERRAIN: {
        WATER: 0,
        PLAINS: 1,
        GRASS: 2,
        FOREST: 3,
        HILLS: 4,
        MOUNTAIN: 5
    },

    TERRAIN_NAMES: {
        0: 'Eau',
        1: 'Plaine',
        2: 'Herbe',
        3: 'Foret',
        4: 'Collines',
        5: 'Montagne'
    },

    TERRAIN_COLORS: {
        0: { fill: '#1a4a6e', stroke: '#1a3a5a', top: '#296294' },
        1: { fill: '#7a8a38', stroke: '#6a7a30', top: '#a8be52' },
        2: { fill: '#3a7a22', stroke: '#2a6a18', top: '#62a03a' },
        3: { fill: '#143a18', stroke: '#0e2e12', top: '#225528' },
        4: { fill: '#6a5838', stroke: '#5a4828', top: '#8c7855' },
        5: { fill: '#555555', stroke: '#444444', top: '#878782' }
    },

    // Building types
    BUILDINGS: {
        TOWN_HALL: {
            id: 'town_hall', name: 'Hotel de ville', icon: '\u{1F3DB}',
            cost: { wood: 0, stone: 0, food: 0, gold: 0 },
            size: 1, maxLevel: 5,
            desc: 'Centre du village. Ameliorez pour debloquer des batiments.'
        },
        HOUSE: {
            id: 'house', name: 'Maison', icon: '\u{1F3E0}',
            cost: { wood: 30, stone: 10, food: 0, gold: 0 },
            popIncrease: 5,
            desc: 'Augmente la capacite de population de 5.'
        },
        FARM: {
            id: 'farm', name: 'Ferme', icon: '\u{1F33E}',
            cost: { wood: 20, stone: 5, food: 0, gold: 0 },
            production: { food: 8 },
            validTerrain: [1, 2],
            desc: 'Produit 8 nourriture/cycle. Terrain: plaine ou herbe.'
        },
        SAWMILL: {
            id: 'sawmill', name: 'Scierie', icon: '\u{1FAB5}',
            cost: { wood: 10, stone: 15, food: 0, gold: 0 },
            production: { wood: 6 },
            validTerrain: [3],
            desc: 'Produit 6 bois/cycle. Terrain: foret.'
        },
        MINE: {
            id: 'mine', name: 'Mine', icon: '\u{26CF}',
            cost: { wood: 25, stone: 5, food: 0, gold: 0 },
            production: { stone: 5 },
            validTerrain: [4, 5],
            desc: 'Produit 5 pierre/cycle. Terrain: collines ou montagne.'
        },
        MARKET: {
            id: 'market', name: 'Marche', icon: '\u{1F4B0}',
            cost: { wood: 40, stone: 30, food: 0, gold: 10 },
            production: { gold: 4 },
            desc: 'Genere 4 or/cycle.'
        },
        BARRACKS: {
            id: 'barracks', name: 'Caserne', icon: '\u{2694}',
            cost: { wood: 50, stone: 40, food: 0, gold: 20 },
            desc: 'Permet de recruter guerriers et archers.',
            requiresTownHall: 2
        },
        STABLE: {
            id: 'stable', name: 'Ecurie', icon: '\u{1F40E}',
            cost: { wood: 60, stone: 30, food: 20, gold: 30 },
            desc: 'Permet de recruter des cavaliers.',
            requiresTownHall: 3
        },
        SIEGE_WORKSHOP: {
            id: 'siege_workshop', name: 'Atelier de siege', icon: '\u{1F4A5}',
            cost: { wood: 80, stone: 60, food: 0, gold: 50 },
            desc: 'Permet de construire catapultes et beliers.',
            requiresTownHall: 4
        },
        WATCHTOWER: {
            id: 'watchtower', name: 'Tour de guet', icon: '\u{1F441}',
            cost: { wood: 35, stone: 25, food: 0, gold: 5 },
            visionRange: 5,
            desc: 'Etend la visibilite de 5 tuiles.'
        },
        WALL: {
            id: 'wall', name: 'Muraille', icon: '\u{1F9F1}',
            cost: { wood: 10, stone: 30, food: 0, gold: 0 },
            defense: 10,
            desc: 'Defense passive +10.'
        }
    },

    // Unit types
    UNITS: {
        WARRIOR: {
            id: 'warrior', name: 'Guerrier', icon: '\u{2694}',
            cost: { food: 10, gold: 15 },
            hp: 100, attack: 15, defense: 12, speed: 1,
            building: 'barracks'
        },
        ARCHER: {
            id: 'archer', name: 'Archer', icon: '\u{1F3F9}',
            cost: { food: 8, gold: 12 },
            hp: 70, attack: 18, defense: 6, speed: 1,
            building: 'barracks'
        },
        CAVALRY: {
            id: 'cavalry', name: 'Cavalier', icon: '\u{1F40E}',
            cost: { food: 20, gold: 30 },
            hp: 120, attack: 20, defense: 10, speed: 2,
            building: 'stable'
        },
        SIEGE: {
            id: 'siege', name: 'Machine de siege', icon: '\u{1F4A5}',
            cost: { food: 5, gold: 40, wood: 30 },
            hp: 80, attack: 35, defense: 4, speed: 0.5,
            building: 'siege_workshop'
        }
    },

    // Villager roles
    ROLES: ['Paysan', 'Bucheron', 'Mineur', 'Fermier', 'Marchand', 'Soldat', 'Archer', 'Cavalier', 'Ingenieur'],

    // Names for villagers
    FIRST_NAMES: [
        'Aelric', 'Baudouin', 'Cedric', 'Darius', 'Edmond', 'Faldric', 'Gontran',
        'Henri', 'Isidore', 'Jehan', 'Lothaire', 'Marceau', 'Norbert', 'Osmond',
        'Pierre', 'Raoul', 'Sigebert', 'Thibault', 'Ulric', 'Vivien',
        'Adele', 'Blanche', 'Clotilde', 'Diane', 'Eloise', 'Flore', 'Genevieve',
        'Helene', 'Isabeau', 'Jeanne', 'Louise', 'Margot', 'Ninon', 'Odette',
        'Perrine', 'Rosalie', 'Solene', 'Therese', 'Ursule', 'Violette'
    ],

    // Seasons
    SEASONS: [
        { name: 'Printemps', icon: '\u{1F33F}' },
        { name: 'Ete', icon: '\u{2600}' },
        { name: 'Automne', icon: '\u{1F342}' },
        { name: 'Hiver', icon: '\u{2744}' }
    ],

    // Speed settings (ms per cycle tick)
    SPEED: {
        PAUSED: 0,
        NORMAL: 3000,
        FAST: 1000
    },

    // Faction colors
    FACTION_COLORS: [
        '#3498db', // player - blue
        '#e74c3c', // rival 1 - red
        '#f39c12', // rival 2 - orange
        '#9b59b6', // rival 3 - purple
        '#1abc9c', // bandits - teal
        '#e67e22', // empire - dark orange
    ],

    // Food consumption per person per cycle
    FOOD_PER_POP: 1,

    // Starting resources
    START_RESOURCES: {
        wood: 100,
        stone: 50,
        food: 80,
        gold: 30
    },

    // Fog of war initial vision radius from town hall
    VISION_RADIUS: 6
};
