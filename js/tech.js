// Technology tree
const TechTree = {
    researched: {},
    currentResearch: null,
    researchProgress: 0,

    techs: {
        // Economy branch
        better_farms: {
            id: 'better_farms', name: 'Agriculture amelioree', branch: 'economy',
            desc: 'Les fermes produisent +4 nourriture/cycle.',
            cost: { gold: 30 }, cycles: 3, requires: []
        },
        forestry: {
            id: 'forestry', name: 'Sylviculture', branch: 'economy',
            desc: 'Les scieries produisent +3 bois/cycle.',
            cost: { gold: 30 }, cycles: 3, requires: []
        },
        masonry: {
            id: 'masonry', name: 'Maconnerie', branch: 'economy',
            desc: 'Les mines produisent +3 pierre/cycle.',
            cost: { gold: 35 }, cycles: 3, requires: []
        },
        advanced_commerce: {
            id: 'advanced_commerce', name: 'Commerce avance', branch: 'economy',
            desc: 'Les marches generent +5 or/cycle.',
            cost: { gold: 60, stone: 20 }, cycles: 5, requires: ['better_farms']
        },
        trade_routes: {
            id: 'trade_routes', name: 'Routes commerciales', branch: 'economy',
            desc: 'Or +8/cycle supplementaire.',
            cost: { gold: 100, wood: 50 }, cycles: 8, requires: ['advanced_commerce']
        },

        // Military branch
        steel_weapons: {
            id: 'steel_weapons', name: 'Armes en acier', branch: 'military',
            desc: 'Attaque de toutes les unites +20%.',
            cost: { gold: 40, stone: 20 }, cycles: 4, requires: []
        },
        armor_plating: {
            id: 'armor_plating', name: 'Armures renforcees', branch: 'military',
            desc: 'Defense de toutes les unites +20%.',
            cost: { gold: 40, stone: 30 }, cycles: 4, requires: []
        },
        battle_tactics: {
            id: 'battle_tactics', name: 'Tactiques de combat', branch: 'military',
            desc: 'Attaque et defense +10%.',
            cost: { gold: 80 }, cycles: 6, requires: ['steel_weapons']
        },
        fortifications: {
            id: 'fortifications', name: 'Fortifications', branch: 'military',
            desc: 'Defense passive +15.',
            cost: { gold: 50, stone: 40 }, cycles: 5, requires: ['armor_plating']
        },
        elite_training: {
            id: 'elite_training', name: 'Entrainement d\'elite', branch: 'military',
            desc: 'Unites recrutees avec +30% de stats.',
            cost: { gold: 120 }, cycles: 8, requires: ['battle_tactics']
        },

        // Civilization branch
        housing_reform: {
            id: 'housing_reform', name: 'Reforme du logement', branch: 'civilization',
            desc: 'Les maisons logent +3 personnes.',
            cost: { gold: 25, wood: 20 }, cycles: 3, requires: []
        },
        festivals: {
            id: 'festivals', name: 'Festivites', branch: 'civilization',
            desc: 'Moral +5 chaque saison.',
            cost: { gold: 30, food: 20 }, cycles: 3, requires: []
        },
        diplomacy: {
            id: 'diplomacy', name: 'Diplomatie', branch: 'civilization',
            desc: 'Reduit l\'agressivite des factions rivales.',
            cost: { gold: 60 }, cycles: 5, requires: ['festivals']
        },
        great_library: {
            id: 'great_library', name: 'Grande bibliotheque', branch: 'civilization',
            desc: 'Recherche 30% plus rapide.',
            cost: { gold: 100, stone: 50 }, cycles: 8, requires: ['diplomacy']
        },
        golden_age: {
            id: 'golden_age', name: 'Age d\'or', branch: 'civilization',
            desc: 'Toute la production +25%.',
            cost: { gold: 200, food: 100 }, cycles: 12, requires: ['great_library']
        }
    },

    isResearched(techId) {
        return !!this.researched[techId];
    },

    canResearch(techId) {
        const tech = this.techs[techId];
        if (!tech) return false;
        if (this.researched[techId]) return false;
        if (this.currentResearch) return false;

        // Check prerequisites
        for (const req of tech.requires) {
            if (!this.researched[req]) return false;
        }

        return Resources.canAfford(tech.cost);
    },

    startResearch(techId) {
        if (!this.canResearch(techId)) return false;

        const tech = this.techs[techId];
        if (!Resources.spend(tech.cost)) return false;

        this.currentResearch = techId;
        this.researchProgress = 0;
        Notifications.add(`Recherche commencee: ${tech.name}`, 'success');
        return true;
    },

    processCycle() {
        if (!this.currentResearch) return;

        const tech = this.techs[this.currentResearch];
        let progressInc = 1;
        if (this.isResearched('great_library')) progressInc = 1.3;

        this.researchProgress += progressInc;

        if (this.researchProgress >= tech.cycles) {
            this.researched[this.currentResearch] = true;
            Notifications.add(`Recherche terminee: ${tech.name} !`, 'success');

            // Apply immediate effects
            if (this.currentResearch === 'housing_reform') {
                // Each existing house gets +3 pop
                const houseCount = Buildings.countBuilding('house');
                Population.maxPop += houseCount * 3;
            }
            if (this.currentResearch === 'diplomacy') {
                for (const data of Object.values(Factions.factionData)) {
                    data.aggression *= 0.6;
                }
            }

            this.currentResearch = null;
            this.researchProgress = 0;
        }
    },

    renderTechTree() {
        const branches = {
            economy: document.getElementById('eco-nodes'),
            military: document.getElementById('mil-nodes'),
            civilization: document.getElementById('civ-nodes')
        };

        for (const el of Object.values(branches)) {
            el.innerHTML = '';
        }

        for (const tech of Object.values(this.techs)) {
            const container = branches[tech.branch];
            if (!container) continue;

            const node = document.createElement('div');
            node.className = 'tech-node';

            if (this.researched[tech.id]) {
                node.classList.add('researched');
            } else if (this.currentResearch === tech.id) {
                node.classList.add('researching');
            } else if (!this.canResearch(tech.id) && !this.currentResearch) {
                // Check if it's just locked due to prereqs
                const prereqsMet = tech.requires.every(r => this.researched[r]);
                if (!prereqsMet) node.classList.add('locked');
            }

            let costText = Object.entries(tech.cost)
                .map(([r, a]) => `${a} ${r}`)
                .join(', ');

            let statusText = '';
            if (this.researched[tech.id]) statusText = ' [Complete]';
            else if (this.currentResearch === tech.id) {
                statusText = ` [${Math.floor(this.researchProgress)}/${tech.cycles} cycles]`;
            }

            node.innerHTML = `
                <div class="tech-name">${tech.name}${statusText}</div>
                <div class="tech-desc">${tech.desc}</div>
                <div class="tech-cost">Cout: ${costText} | ${tech.cycles} cycles</div>
            `;

            if (!this.researched[tech.id] && this.currentResearch !== tech.id) {
                node.addEventListener('click', () => {
                    if (this.canResearch(tech.id)) {
                        this.startResearch(tech.id);
                        this.renderTechTree(); // refresh
                    }
                });
            }

            container.appendChild(node);
        }
    },

    serialize() {
        return {
            researched: this.researched,
            currentResearch: this.currentResearch,
            researchProgress: this.researchProgress
        };
    },

    deserialize(data) {
        this.researched = data.researched || {};
        this.currentResearch = data.currentResearch;
        this.researchProgress = data.researchProgress || 0;
    }
};
