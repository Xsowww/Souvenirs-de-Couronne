// Resource management
const Resources = {
    wood: 0,
    stone: 0,
    food: 0,
    gold: 0,
    rates: { wood: 0, stone: 0, food: 0, gold: 0 },

    init() {
        this.wood = CONFIG.START_RESOURCES.wood;
        this.stone = CONFIG.START_RESOURCES.stone;
        this.food = CONFIG.START_RESOURCES.food;
        this.gold = CONFIG.START_RESOURCES.gold;
        this.updateRates();
    },

    canAfford(cost) {
        return (!cost.wood || this.wood >= cost.wood) &&
               (!cost.stone || this.stone >= cost.stone) &&
               (!cost.food || this.food >= cost.food) &&
               (!cost.gold || this.gold >= cost.gold);
    },

    spend(cost) {
        if (!this.canAfford(cost)) return false;
        if (cost.wood) this.wood -= cost.wood;
        if (cost.stone) this.stone -= cost.stone;
        if (cost.food) this.food -= cost.food;
        if (cost.gold) this.gold -= cost.gold;
        return true;
    },

    add(type, amount) {
        this[type] = Math.max(0, (this[type] || 0) + amount);
    },

    updateRates() {
        const rates = { wood: 0, stone: 0, food: 0, gold: 0 };

        // Production from buildings
        for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
            for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
                const tile = GameMap.tiles[y][x];
                if (tile.owner !== 0 || !tile.building) continue;
                const bType = tile.building.type.toUpperCase();
                const bDef = CONFIG.BUILDINGS[bType];
                if (bDef && bDef.production) {
                    for (const [res, amt] of Object.entries(bDef.production)) {
                        rates[res] += amt;
                    }
                }
            }
        }

        // Food consumption
        const popCount = Population.villagers.length;
        rates.food -= popCount * CONFIG.FOOD_PER_POP;

        // Tax income from population (small gold per 5 people)
        rates.gold += Math.floor(popCount / 5);

        // Tech bonuses
        if (TechTree.isResearched('better_farms')) rates.food += 4;
        if (TechTree.isResearched('advanced_commerce')) rates.gold += 5;
        if (TechTree.isResearched('forestry')) rates.wood += 3;
        if (TechTree.isResearched('masonry')) rates.stone += 3;

        this.rates = rates;
    },

    processCycle() {
        this.updateRates();
        this.wood = Math.max(0, this.wood + this.rates.wood);
        this.stone = Math.max(0, this.stone + this.rates.stone);
        this.food = Math.max(0, this.food + this.rates.food);
        this.gold = Math.max(0, this.gold + this.rates.gold);

        // Starvation check
        if (this.food <= 0 && this.rates.food < 0) {
            Population.adjustMoral(-15);
            Notifications.add('Famine ! La population souffre de la faim.', 'alert');
        }
    },

    updateUI() {
        document.getElementById('wood-count').textContent = Math.floor(this.wood);
        document.getElementById('stone-count').textContent = Math.floor(this.stone);
        document.getElementById('food-count').textContent = Math.floor(this.food);
        document.getElementById('gold-count').textContent = Math.floor(this.gold);

        const formatRate = (r) => (r >= 0 ? '+' : '') + r;
        document.getElementById('wood-rate').textContent = formatRate(this.rates.wood);
        document.getElementById('stone-rate').textContent = formatRate(this.rates.stone);
        document.getElementById('food-rate').textContent = formatRate(this.rates.food);
        document.getElementById('gold-rate').textContent = formatRate(this.rates.gold);
    },

    serialize() {
        return { wood: this.wood, stone: this.stone, food: this.food, gold: this.gold };
    },

    deserialize(data) {
        this.wood = data.wood;
        this.stone = data.stone;
        this.food = data.food;
        this.gold = data.gold;
        this.updateRates();
    }
};
