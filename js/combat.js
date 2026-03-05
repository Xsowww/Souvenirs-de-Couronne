// Combat system - abstract strategic battles
const Combat = {
    currentBattle: null,

    initBattle(targetRegion, army) {
        // Calculate defender strength
        const defenderStrength = this.getDefenderStrength(targetRegion);
        const attackerStrength = Military.getArmyStrength(army);

        this.currentBattle = {
            targetRegion,
            army: { ...army },
            attackerStrength,
            defenderStrength,
            result: null
        };

        this.showBattleSetup();
    },

    getDefenderStrength(region) {
        // Base strength based on region type and size
        let base = region.tiles.length * 2;

        if (region.type === 'bandit') {
            base = 30 + region.tiles.length * 3;
        } else if (region.type === 'empire') {
            base = 100 + region.tiles.length * 5;
        } else {
            // Rival kingdom - scales with game time
            base = 50 + region.tiles.length * 4 + (typeof Game !== 'undefined' ? Game.year * 5 : 0);
        }

        return {
            attack: Math.floor(base * 0.8),
            defense: Math.floor(base),
            hp: Math.floor(base * 3)
        };
    },

    resolveBattle() {
        if (!this.currentBattle) return null;

        const { attackerStrength, defenderStrength, army, targetRegion } = this.currentBattle;

        // Combat resolution with random modifier
        const attackRoll = (attackerStrength.attack + attackerStrength.hp * 0.3) *
                          (0.85 + Perlin.random() * 0.3);
        const defendRoll = (defenderStrength.defense + defenderStrength.hp * 0.3) *
                          (0.85 + Perlin.random() * 0.3);

        // Siege bonus against fortified regions
        if (army.siege > 0) {
            // Siege units are very effective
        }

        const attackerScore = attackRoll;
        const defenderScore = defendRoll;

        const victory = attackerScore > defenderScore;
        const dominance = victory ?
            attackerScore / Math.max(1, defenderScore) :
            defenderScore / Math.max(1, attackerScore);

        // Calculate losses
        const lossFactor = victory ? Math.max(0.1, 1 - dominance * 0.3) : Math.min(0.9, 0.3 + dominance * 0.2);
        const losses = {};
        for (const [type, count] of Object.entries(army)) {
            if (count > 0) {
                losses[type] = Math.max(1, Math.floor(count * lossFactor));
                if (victory && dominance > 2) losses[type] = Math.max(0, Math.floor(count * 0.1));
            }
        }

        this.currentBattle.result = {
            victory,
            losses,
            attackerScore: Math.floor(attackerScore),
            defenderScore: Math.floor(defenderScore)
        };

        // Apply losses
        Military.removeUnits(losses);

        // Apply result
        if (victory) {
            GameMap.annexRegion(targetRegion.id, 0);
            Population.adjustMoral(10);
            Notifications.add(`Victoire ! ${targetRegion.name} conquis !`, 'success');
        } else {
            Population.adjustMoral(-10);
            Notifications.add(`Defaite contre ${targetRegion.name}...`, 'alert');
        }

        this.showBattleResult();
        return this.currentBattle.result;
    },

    showBattleSetup() {
        const screen = document.getElementById('battle-screen');
        const content = document.getElementById('battle-content');
        const setup = document.getElementById('battle-setup');
        const result = document.getElementById('battle-result');

        const battle = this.currentBattle;

        content.innerHTML = `
            <h3>Attaque de : ${battle.targetRegion.name}</h3>
            <div class="battle-forces">
                <div class="battle-side">
                    <h4>Votre Armee</h4>
                    ${this.formatArmy(battle.army)}
                    <div class="unit-line"><strong>Force: ${battle.attackerStrength.attack + battle.attackerStrength.defense}</strong></div>
                </div>
                <div class="battle-side">
                    <h4>Defenseurs</h4>
                    <div class="unit-line">Force estimee: ~${battle.defenderStrength.attack + battle.defenderStrength.defense}</div>
                    <div class="unit-line">Type: ${battle.targetRegion.type || 'rival'}</div>
                </div>
            </div>
        `;

        setup.style.display = 'block';
        result.style.display = 'none';
        screen.classList.add('active');
    },

    showBattleResult() {
        const setup = document.getElementById('battle-setup');
        const result = document.getElementById('battle-result');
        const report = document.getElementById('battle-report');

        const battle = this.currentBattle;
        const r = battle.result;

        let lossText = '';
        for (const [type, count] of Object.entries(r.losses)) {
            if (count > 0) {
                const uDef = CONFIG.UNITS[type.toUpperCase()];
                lossText += `<div>${uDef ? uDef.name : type}: -${count}</div>`;
            }
        }

        report.innerHTML = `
            <h3 style="color:${r.victory ? '#2ecc71' : '#e74c3c'}">${r.victory ? 'VICTOIRE !' : 'DEFAITE...'}</h3>
            <div>Score attaque: ${r.attackerScore} vs Defense: ${r.defenderScore}</div>
            <div style="margin-top:8px"><strong>Pertes:</strong></div>
            ${lossText || '<div>Aucune perte !</div>'}
            ${r.victory ? '<div style="margin-top:8px;color:#2ecc71">Territoire annexe !</div>' : ''}
        `;

        setup.style.display = 'none';
        result.style.display = 'block';
    },

    formatArmy(army) {
        let html = '';
        for (const [type, count] of Object.entries(army)) {
            if (count > 0) {
                const uDef = CONFIG.UNITS[type.toUpperCase()];
                html += `<div class="unit-line">${uDef ? uDef.icon : ''} ${uDef ? uDef.name : type}: ${count}</div>`;
            }
        }
        return html || '<div class="unit-line">Aucune unite</div>';
    },

    closeBattle() {
        document.getElementById('battle-screen').classList.remove('active');
        this.currentBattle = null;
    }
};
