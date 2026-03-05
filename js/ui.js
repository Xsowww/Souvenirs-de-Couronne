// UI management
const UI = {
    init() {
        this.setupBuildButtons();
        this.setupRecruitButtons();
        this.setupEventListeners();
        this.setupMinimapClick();
        this.setupCanvasHover();
    },

    setupBuildButtons() {
        const container = document.getElementById('build-buttons');
        // Keep the label
        const label = container.querySelector('.group-label');
        container.innerHTML = '';
        container.appendChild(label);

        const buildings = Buildings.getAvailableBuildings();
        for (const b of buildings) {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.title = `${b.name}\n${b.desc}\nCout: ${this.formatCost(b.cost)}`;
            btn.textContent = `${b.icon || ''} ${b.name}`;
            btn.dataset.building = b.key;
            btn.addEventListener('click', () => {
                if (Game.buildMode === b.key) {
                    Game.buildMode = null;
                    this.clearBuildSelection();
                } else {
                    Game.buildMode = b.key;
                    this.clearBuildSelection();
                    btn.classList.add('selected');
                }
            });
            container.appendChild(btn);
        }

        // Town hall upgrade button
        const thLevel = Buildings.getTownHallLevel();
        if (thLevel > 0 && thLevel < 5) {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            const cost = { wood: 50 * thLevel, stone: 50 * thLevel, food: 20 * thLevel, gold: 30 * thLevel };
            btn.title = `Ameliorer Hotel de ville (Nv.${thLevel + 1})\nCout: ${this.formatCost(cost)}`;
            btn.textContent = '\u{1F3DB} Ameliorer HdV';
            btn.addEventListener('click', () => {
                Buildings.upgradeTownHall();
                this.setupBuildButtons(); // refresh
            });
            container.appendChild(btn);
        }
    },

    setupRecruitButtons() {
        const container = document.getElementById('recruit-buttons');
        const label = container.querySelector('.group-label');
        container.innerHTML = '';
        container.appendChild(label);

        for (const [key, uDef] of Object.entries(CONFIG.UNITS)) {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.title = `${uDef.name}\nPV:${uDef.hp} ATK:${uDef.attack} DEF:${uDef.defense}\nCout: ${this.formatCost(uDef.cost)}`;
            btn.textContent = `${uDef.icon} ${uDef.name} (${Military.units[key.toLowerCase()] || 0})`;
            btn.disabled = !Military.canRecruit(key.toLowerCase());
            btn.addEventListener('click', () => {
                Military.recruit(key.toLowerCase());
                this.setupRecruitButtons(); // refresh counts
            });
            container.appendChild(btn);
        }

        // Attack button if we have units and adjacent enemies
        if (Military.getTotalUnits() > 0) {
            const enemies = GameMap.getAdjacentEnemyRegions(0);
            if (enemies.length > 0) {
                const btn = document.createElement('button');
                btn.className = 'action-btn';
                btn.style.background = '#5a1a1a';
                btn.textContent = '\u{2694} Attaquer';
                btn.addEventListener('click', () => this.showAttackMenu(enemies));
                container.appendChild(btn);
            }
        }
    },

    showAttackMenu(enemies) {
        // Use battle screen to select target and army composition
        const content = document.getElementById('battle-content');
        const selector = document.getElementById('army-selector');
        const screen = document.getElementById('battle-screen');
        const setup = document.getElementById('battle-setup');
        const result = document.getElementById('battle-result');

        content.innerHTML = '<h3>Choisissez une cible</h3>';

        // Target selection
        let targetHtml = '';
        for (const enemy of enemies) {
            targetHtml += `
                <div class="army-row">
                    <span style="color:${enemy.color}">${enemy.name}</span>
                    <span>(${enemy.tiles.length} tuiles)</span>
                    <button class="action-btn target-btn" data-region="${enemy.id}">Cibler</button>
                </div>
            `;
        }
        content.innerHTML += targetHtml;

        // Army composition
        let armyHtml = '<h4 style="margin-top:12px">Composition de l\'armee</h4>';
        for (const [key, uDef] of Object.entries(CONFIG.UNITS)) {
            const available = Military.units[key.toLowerCase()] || 0;
            if (available > 0) {
                armyHtml += `
                    <div class="army-row">
                        <span>${uDef.icon} ${uDef.name} (${available})</span>
                        <input type="number" min="0" max="${available}" value="${available}" id="send-${key.toLowerCase()}">
                    </div>
                `;
            }
        }
        selector.innerHTML = armyHtml;

        setup.style.display = 'block';
        result.style.display = 'none';
        screen.classList.add('active');

        // Target button handlers
        document.querySelectorAll('.target-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.target-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                Game._selectedTarget = parseInt(btn.dataset.region);
            });
        });

        // Attack button handler
        document.getElementById('btn-attack').onclick = () => {
            if (!Game._selectedTarget && Game._selectedTarget !== 0) {
                Notifications.add('Selectionnez une cible !', 'alert');
                return;
            }
            const army = {};
            for (const key of Object.keys(CONFIG.UNITS)) {
                const input = document.getElementById('send-' + key.toLowerCase());
                if (input) army[key.toLowerCase()] = parseInt(input.value) || 0;
            }
            const totalSent = Object.values(army).reduce((a, b) => a + b, 0);
            if (totalSent === 0) {
                Notifications.add('Envoyez au moins une unite !', 'alert');
                return;
            }
            const targetRegion = GameMap.getRegion(Game._selectedTarget);
            if (targetRegion) {
                Combat.initBattle(targetRegion, army);
                Combat.resolveBattle();
            }
        };

        // Retreat button
        document.getElementById('btn-retreat').onclick = () => {
            Combat.closeBattle();
        };
    },

    setupEventListeners() {
        // Time controls
        document.getElementById('btn-pause').addEventListener('click', () => {
            Game.setSpeed('PAUSED');
            this.updateTimeButtons('btn-pause');
        });
        document.getElementById('btn-normal').addEventListener('click', () => {
            Game.setSpeed('NORMAL');
            this.updateTimeButtons('btn-normal');
        });
        document.getElementById('btn-fast').addEventListener('click', () => {
            Game.setSpeed('FAST');
            this.updateTimeButtons('btn-fast');
        });

        // Tech tree
        document.getElementById('btn-tech-tree').addEventListener('click', () => {
            TechTree.renderTechTree();
            document.getElementById('tech-screen').classList.add('active');
        });
        document.getElementById('btn-tech-close').addEventListener('click', () => {
            document.getElementById('tech-screen').classList.remove('active');
        });

        // Villager management
        document.getElementById('btn-villagers').addEventListener('click', () => {
            this.showVillagerManagement();
        });
        document.getElementById('btn-villager-close').addEventListener('click', () => {
            document.getElementById('villager-overlay').classList.remove('active');
        });

        // Pause menu
        document.getElementById('btn-menu-pause').addEventListener('click', () => {
            Game.setSpeed('PAUSED');
            this.updateTimeButtons('btn-pause');
            document.getElementById('pause-overlay').classList.add('active');
        });
        document.getElementById('btn-resume').addEventListener('click', () => {
            document.getElementById('pause-overlay').classList.remove('active');
            Game.setSpeed('NORMAL');
            this.updateTimeButtons('btn-normal');
        });
        document.getElementById('btn-save').addEventListener('click', () => {
            SaveManager.save();
            Notifications.add('Partie sauvegardee !', 'success');
        });
        document.getElementById('btn-quit').addEventListener('click', () => {
            document.getElementById('pause-overlay').classList.remove('active');
            Game.showScreen('menu-screen');
        });

        // Battle close
        document.getElementById('btn-battle-close').addEventListener('click', () => {
            Combat.closeBattle();
            this.setupRecruitButtons();
            // Check victory
            Game.checkVictory();
        });

        // Victory/Defeat return
        document.getElementById('btn-victory-menu').addEventListener('click', () => {
            Game.showScreen('menu-screen');
        });
        document.getElementById('btn-defeat-menu').addEventListener('click', () => {
            Game.showScreen('menu-screen');
        });
    },

    setupMinimapClick() {
        const minimap = document.getElementById('minimap-canvas');
        minimap.addEventListener('click', (e) => {
            const rect = minimap.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const tileX = Math.floor((mx / minimap.width) * CONFIG.MAP_WIDTH);
            const tileY = Math.floor((my / minimap.height) * CONFIG.MAP_HEIGHT);
            Camera.centerOnTile(tileX, tileY);
        });
    },

    setupCanvasHover() {
        const canvas = document.getElementById('game-canvas');
        canvas.addEventListener('mousemove', (e) => {
            if (Camera.dragging) return;
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            Game._hoverTile = Camera.screenToTile(sx, sy);
        });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    showVillagerManagement() {
        const container = document.getElementById('villager-manage-list');
        container.innerHTML = '';

        if (Population.villagers.length === 0) {
            container.innerHTML = '<p>Aucun villageois.</p>';
        }

        for (const v of Population.villagers) {
            const row = document.createElement('div');
            row.className = 'villager-row';

            const name = document.createElement('span');
            name.className = 'v-name';
            name.textContent = `${v.name} (Moral: ${v.moral})`;

            const select = document.createElement('select');
            for (const role of CONFIG.ROLES) {
                const opt = document.createElement('option');
                opt.value = role;
                opt.textContent = role;
                if (v.role === role) opt.selected = true;
                select.appendChild(opt);
            }
            select.addEventListener('change', () => {
                Population.setRole(v.id, select.value);
            });

            row.appendChild(name);
            row.appendChild(select);
            container.appendChild(row);
        }

        document.getElementById('villager-overlay').classList.add('active');
    },

    updateTimeButtons(activeId) {
        document.querySelectorAll('.time-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(activeId).classList.add('active');
    },

    clearBuildSelection() {
        document.querySelectorAll('#build-buttons .action-btn').forEach(btn => btn.classList.remove('selected'));
    },

    updateInfoPanel(tile) {
        const title = document.getElementById('info-title');
        const content = document.getElementById('info-content');

        if (!tile) {
            title.textContent = 'Selection';
            content.innerHTML = 'Cliquez sur une tuile pour voir ses details.';
            return;
        }

        const terrainName = CONFIG.TERRAIN_NAMES[tile.terrain] || 'Inconnu';
        let ownerName = 'Inexplore';
        if (tile.owner === -1) ownerName = 'Non revendique';
        else if (tile.owner === 0) ownerName = 'Votre Royaume';
        else {
            const region = GameMap.getRegion(tile.owner);
            ownerName = region ? region.name : 'Inconnu';
        }

        let html = `
            <div class="info-row"><span class="info-label">Terrain:</span><span>${terrainName}</span></div>
            <div class="info-row"><span class="info-label">Position:</span><span>${tile.x}, ${tile.y}</span></div>
            <div class="info-row"><span class="info-label">Proprietaire:</span><span>${ownerName}</span></div>
        `;

        if (tile.building) {
            const bDef = CONFIG.BUILDINGS[tile.building.type.toUpperCase()];
            html += `<div class="info-row"><span class="info-label">Batiment:</span><span>${bDef ? bDef.name : tile.building.type}</span></div>`;
            if (tile.building.level > 1) {
                html += `<div class="info-row"><span class="info-label">Niveau:</span><span>${tile.building.level}</span></div>`;
            }
            if (bDef && bDef.production) {
                html += '<div class="info-row"><span class="info-label">Production:</span><span>';
                html += Object.entries(bDef.production).map(([r, a]) => `+${a} ${r}`).join(', ');
                html += '</span></div>';
            }
        }

        // Conquest percentage
        const conquest = GameMap.getConquestPercent(0);
        html += `<hr style="border-color:#3a506b;margin:8px 0">`;
        html += `<div class="info-row"><span class="info-label">Conquete:</span><span>${conquest}%</span></div>`;
        html += `<div class="info-row"><span class="info-label">Armee:</span><span>${Military.getTotalUnits()} unites</span></div>`;

        title.textContent = terrainName + (tile.building ? ' - ' + (CONFIG.BUILDINGS[tile.building.type.toUpperCase()]?.name || '') : '');
        content.innerHTML = html;
    },

    formatCost(cost) {
        return Object.entries(cost)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${v} ${k}`)
            .join(', ');
    },

    refreshAll() {
        this.setupBuildButtons();
        this.setupRecruitButtons();
    }
};
