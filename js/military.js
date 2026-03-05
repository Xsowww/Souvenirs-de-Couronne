// Military unit management
const Military = {
    units: { warrior: 0, archer: 0, cavalry: 0, siege: 0 },

    canRecruit(unitId) {
        const uDef = CONFIG.UNITS[unitId.toUpperCase()];
        if (!uDef) return false;

        // Check building requirement
        if (!Buildings.hasBuilding(uDef.building)) return false;

        // Check resources
        return Resources.canAfford(uDef.cost);
    },

    recruit(unitId) {
        const uDef = CONFIG.UNITS[unitId.toUpperCase()];
        if (!uDef) return false;

        if (!Buildings.hasBuilding(uDef.building)) {
            Notifications.add(`Construisez d'abord : ${uDef.building}`, 'alert');
            return false;
        }

        if (!Resources.spend(uDef.cost)) {
            Notifications.add('Ressources insuffisantes !', 'alert');
            return false;
        }

        this.units[unitId.toLowerCase()]++;
        Notifications.add(`${uDef.name} recrute !`, 'success');
        return true;
    },

    getTotalUnits() {
        return Object.values(this.units).reduce((a, b) => a + b, 0);
    },

    getArmyStrength(army) {
        let attack = 0, defense = 0, hp = 0;
        for (const [type, count] of Object.entries(army)) {
            const uDef = CONFIG.UNITS[type.toUpperCase()];
            if (!uDef || count <= 0) continue;
            attack += uDef.attack * count;
            defense += uDef.defense * count;
            hp += uDef.hp * count;
        }

        // Tech bonuses
        if (TechTree.isResearched('steel_weapons')) attack = Math.floor(attack * 1.2);
        if (TechTree.isResearched('armor_plating')) defense = Math.floor(defense * 1.2);
        if (TechTree.isResearched('battle_tactics')) {
            attack = Math.floor(attack * 1.1);
            defense = Math.floor(defense * 1.1);
        }

        // Moral bonus
        const moralMod = Population.moral / 100;
        attack = Math.floor(attack * (0.5 + moralMod * 0.5));

        return { attack, defense, hp };
    },

    removeUnits(losses) {
        for (const [type, count] of Object.entries(losses)) {
            this.units[type] = Math.max(0, (this.units[type] || 0) - count);
        }
    },

    serialize() {
        return { ...this.units };
    },

    deserialize(data) {
        this.units = { warrior: 0, archer: 0, cavalry: 0, siege: 0, ...data };
    }
};
