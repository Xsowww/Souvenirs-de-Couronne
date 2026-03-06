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
        wood: 0,
        stone: 0,
        iron: 0,
        gold: 0,
        food: 5
    },

    VISION_RADIUS: 6
};
