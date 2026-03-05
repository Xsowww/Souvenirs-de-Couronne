// Population and villager management
const Population = {
    villagers: [],
    maxPop: 5,
    moral: 100,
    nextId: 1,

    init() {
        this.villagers = [];
        this.maxPop = 5;
        this.moral = 100;
        this.nextId = 1;
        // Start with 3 villagers
        for (let i = 0; i < 3; i++) {
            this.addVillager();
        }
    },

    addVillager(role) {
        if (this.villagers.length >= this.maxPop) return null;

        const name = CONFIG.FIRST_NAMES[Math.floor(Perlin.random() * CONFIG.FIRST_NAMES.length)];
        const villager = {
            id: this.nextId++,
            name: name,
            role: role || 'Paysan',
            moral: 80 + Math.floor(Perlin.random() * 20)
        };
        this.villagers.push(villager);
        return villager;
    },

    removeVillager(id) {
        this.villagers = this.villagers.filter(v => v.id !== id);
    },

    setRole(id, role) {
        const v = this.villagers.find(v => v.id === id);
        if (v) v.role = role;
    },

    getCountByRole(role) {
        return this.villagers.filter(v => v.role === role).length;
    },

    adjustMoral(amount) {
        this.moral = Math.max(0, Math.min(100, this.moral + amount));
    },

    processCycle() {
        // Check housing
        if (this.villagers.length > this.maxPop) {
            // Some leave
            const excess = this.villagers.length - this.maxPop;
            for (let i = 0; i < excess; i++) {
                this.villagers.pop();
            }
            Notifications.add('Des villageois partent faute de logement !', 'alert');
        }

        // Moral adjustments
        if (Resources.food > 0) {
            this.adjustMoral(2); // fed
        }
        if (this.villagers.length < this.maxPop * 0.5) {
            this.adjustMoral(1); // plenty of room
        }

        // Growth: chance to gain a villager if moral is good and there's room
        if (this.villagers.length < this.maxPop && this.moral > 60 && Perlin.random() < 0.25) {
            const v = this.addVillager();
            if (v) Notifications.add(`${v.name} a rejoint votre village !`, 'success');
        }

        // Rebellion at 0 moral
        if (this.moral <= 0) {
            const deserters = Math.ceil(this.villagers.length * 0.3);
            for (let i = 0; i < deserters && this.villagers.length > 0; i++) {
                this.villagers.pop();
            }
            this.moral = 20;
            Notifications.add('Rebellion ! Des villageois desertent !', 'alert');
        }

        // Apply role-based bonuses (workers boost production beyond base building rate)
        // Farmers
        const farmers = this.getCountByRole('Fermier');
        if (farmers > 0) Resources.add('food', farmers * 2);
        // Woodcutters
        const woodcutters = this.getCountByRole('Bucheron');
        if (woodcutters > 0) Resources.add('wood', woodcutters * 2);
        // Miners
        const miners = this.getCountByRole('Mineur');
        if (miners > 0) Resources.add('stone', miners * 2);
        // Merchants
        const merchants = this.getCountByRole('Marchand');
        if (merchants > 0) Resources.add('gold', merchants * 2);
    },

    updateUI() {
        document.getElementById('pop-count').textContent = this.villagers.length;
        document.getElementById('pop-max').textContent = this.maxPop;
        document.getElementById('moral-value').textContent = this.moral;
    },

    serialize() {
        return {
            villagers: this.villagers,
            maxPop: this.maxPop,
            moral: this.moral,
            nextId: this.nextId
        };
    },

    deserialize(data) {
        this.villagers = data.villagers;
        this.maxPop = data.maxPop;
        this.moral = data.moral;
        this.nextId = data.nextId;
    }
};
