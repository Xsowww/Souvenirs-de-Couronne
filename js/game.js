// Main game controller
const Game = {
    seed: '',
    year: 1,
    season: 0,
    totalCycles: 0,
    speed: 'NORMAL',
    buildMode: null,
    selectedTile: null,
    _hoverTile: null,
    _selectedTarget: null,
    _tickTimer: null,
    _lastTick: 0,
    _running: false,
    _placementHover: null,

    init() {
        // Menu setup
        document.getElementById('btn-new-game').addEventListener('click', () => this.newGame());
        document.getElementById('btn-continue').addEventListener('click', () => this.continueGame());
        document.getElementById('btn-options').addEventListener('click', () => this.showScreen('options-screen'));
        document.getElementById('btn-options-close').addEventListener('click', () => this.showScreen('menu-screen'));
        document.getElementById('btn-quit-game').addEventListener('click', () => {
            if (confirm('Voulez-vous vraiment quitter ?')) {
                window.close();
                document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:Cinzel,serif;color:#c8a84a;font-size:1.5rem;background:#0e0a06;text-align:center;"><div>Merci d\'avoir joue !<br><span style="font-size:0.9rem;color:#6a5a3a;">Vous pouvez fermer cet onglet.</span></div></div>';
            }
        });

        // Placement screen
        document.getElementById('btn-confirm-placement').addEventListener('click', () => this.confirmPlacement());

        // Show continue button if save exists
        if (SaveManager.hasSave()) {
            document.getElementById('btn-continue').style.display = 'block';
        }

        // Apply options on map size change
        document.getElementById('opt-map-size').addEventListener('change', (e) => {
            const size = parseInt(e.target.value);
            CONFIG.MAP_WIDTH = size;
            CONFIG.MAP_HEIGHT = size;
        });
    },

    // ==================== NEW GAME FLOW ====================

    newGame() {
        const seedField = document.getElementById('seed-field');
        this.seed = seedField.value || String(Date.now());
        this.year = 1;
        this.season = 0;
        this.totalCycles = 0;
        this.buildMode = null;
        this.selectedTile = null;

        // Show loading screen
        this.showScreen('loading-screen');
        this._updateLoadingProgress(0, 'Preparation du parchemin...');

        // Use setTimeout to allow the UI to render
        setTimeout(() => this._generateMapAsync(), 50);
    },

    _generateMapAsync() {
        const messages = [
            'Les cartographes explorent les terres...',
            'Les forets prennent racine...',
            'Les montagnes emergent des brumes...',
            'Les rivieres tracent leur chemin...',
            'Les decorateurs plantent les arbres...',
            'La carte est presque prete...'
        ];

        let lastMsgIdx = -1;

        // Generate terrain with progress callback
        const onProgress = (progress) => {
            const msgIdx = Math.min(messages.length - 1, Math.floor(progress * messages.length));
            if (msgIdx !== lastMsgIdx) {
                lastMsgIdx = msgIdx;
                this._updateLoadingProgress(progress, messages[msgIdx]);
            }
        };

        GameMap.generateTerrain(this.seed, onProgress);

        this._updateLoadingProgress(0.85, 'Dernieres touches...');

        setTimeout(() => {
            this._updateLoadingProgress(1.0, 'La carte est prete !');
            setTimeout(() => this._showPlacementScreen(), 600);
        }, 200);
    },

    _updateLoadingProgress(progress, message) {
        const fill = document.getElementById('loading-fill');
        const msg = document.getElementById('loading-message');
        const pct = document.getElementById('loading-percent');
        if (fill) fill.style.width = Math.round(progress * 100) + '%';
        if (msg) msg.textContent = message;
        if (pct) pct.textContent = Math.round(progress * 100) + '%';
    },

    // ==================== PLACEMENT SCREEN ====================

    _showPlacementScreen() {
        this.showScreen('placement-screen');
        this._placementHover = null;
        this._placementSelected = null;

        const canvas = document.getElementById('placement-canvas');
        const container = document.getElementById('placement-map-area');

        // Size canvas to fit container
        const rect = container.getBoundingClientRect();
        const size = Math.min(rect.width - 40, rect.height - 20);
        canvas.width = size;
        canvas.height = size;

        // Initial render
        GameMap.renderOverviewToCanvas(canvas);

        // Hover handler
        canvas.onmousemove = (e) => {
            const cr = canvas.getBoundingClientRect();
            const mx = e.clientX - cr.left;
            const my = e.clientY - cr.top;
            const tileX = Math.floor((mx / canvas.width) * GameMap.width);
            const tileY = Math.floor((my / canvas.height) * GameMap.height);

            if (tileX !== this._placementHover?.x || tileY !== this._placementHover?.y) {
                this._placementHover = { x: tileX, y: tileY };
                GameMap.renderOverviewToCanvas(canvas, tileX, tileY, true);

                // Update placement info
                const tile = GameMap.getTile(tileX, tileY);
                const valid = GameMap.isValidKingdomSpot(tileX, tileY);
                const info = document.getElementById('placement-info');
                if (tile) {
                    const terrainName = CONFIG.TERRAIN_NAMES[tile.terrain] || 'Inconnu';
                    info.textContent = `${terrainName} (${tileX}, ${tileY}) - ${valid ? 'Emplacement valide' : 'Terrain inadapte'}`;
                    info.style.color = valid ? '#a8d8a8' : '#d8a8a8';
                }
            }
        };

        // Click handler
        canvas.onclick = (e) => {
            const cr = canvas.getBoundingClientRect();
            const mx = e.clientX - cr.left;
            const my = e.clientY - cr.top;
            const tileX = Math.floor((mx / canvas.width) * GameMap.width);
            const tileY = Math.floor((my / canvas.height) * GameMap.height);

            if (GameMap.isValidKingdomSpot(tileX, tileY)) {
                this._placementSelected = { x: tileX, y: tileY };
                GameMap.renderOverviewToCanvas(canvas, tileX, tileY, true);
                document.getElementById('btn-confirm-placement').disabled = false;
                document.getElementById('btn-confirm-placement').classList.add('ready');
            }
        };

        // Disable confirm until a spot is selected
        document.getElementById('btn-confirm-placement').disabled = true;
        document.getElementById('btn-confirm-placement').classList.remove('ready');
    },

    confirmPlacement() {
        if (!this._placementSelected) return;

        const px = this._placementSelected.x;
        const py = this._placementSelected.y;

        // Generate regions based on player position
        GameMap.generateRegions(px, py);

        // Initialize systems
        Resources.init();
        Population.init();
        Military.units = { warrior: 0, archer: 0, cavalry: 0, siege: 0 };
        Buildings.playerBuildings = [];
        TechTree.researched = {};
        TechTree.currentResearch = null;
        TechTree.researchProgress = 0;

        // Place initial town hall
        const playerRegion = GameMap.getPlayerRegion();
        if (playerRegion) {
            Buildings.placeTownHall(playerRegion.capital.x, playerRegion.capital.y);
            GameMap.updateVisibility(0);
        }

        // Initialize factions
        Factions.init();

        // Start game
        this.startGame();

        if (playerRegion) {
            Camera.centerOnTile(playerRegion.capital.x, playerRegion.capital.y);
        }

        // Clean up placement listeners
        const canvas = document.getElementById('placement-canvas');
        canvas.onmousemove = null;
        canvas.onclick = null;
    },

    // ==================== CONTINUE ====================

    continueGame() {
        const data = SaveManager.load() || SaveManager.load('auto');
        if (!data) {
            Notifications.add('Aucune sauvegarde trouvee.', 'alert');
            return;
        }

        this.seed = data.seed;
        this.year = data.year;
        this.season = data.season;
        this.totalCycles = data.totalCycles;

        GameMap.generate(this.seed);
        SaveManager.deserializeMap(data.map);

        Resources.deserialize(data.resources);
        Population.deserialize(data.population);
        Military.deserialize(data.military);
        Buildings.deserialize(data.buildings);
        TechTree.deserialize(data.tech);
        Factions.deserialize(data.factions);

        GameMap.updateVisibility(0);

        this.startGame();

        const playerRegion = GameMap.getPlayerRegion();
        if (playerRegion) {
            Camera.centerOnTile(playerRegion.capital.x, playerRegion.capital.y);
        }
    },

    // ==================== GAME LOOP ====================

    startGame() {
        this.showScreen('game-screen');
        Renderer.init();
        Camera.init(Renderer.canvas);
        Notifications.init();
        UI.init();

        this.speed = 'NORMAL';
        this._running = true;
        this._lastTick = Date.now();

        this.updateSeasonUI();
        Resources.updateUI();
        Population.updateUI();

        this.gameLoop();
        this.startTickTimer();
    },

    gameLoop() {
        if (!this._running) return;

        Camera.update();
        Renderer.render();
        Renderer.renderMinimap();

        requestAnimationFrame(() => this.gameLoop());
    },

    startTickTimer() {
        if (this._tickTimer) clearInterval(this._tickTimer);
        this._tickTimer = setInterval(() => this.tick(), 100);
    },

    tick() {
        if (this.speed === 'PAUSED') return;

        const now = Date.now();
        const interval = CONFIG.SPEED[this.speed] || CONFIG.SPEED.NORMAL;
        if (now - this._lastTick < interval) return;

        this._lastTick = now;
        this.processCycle();
    },

    processCycle() {
        this.totalCycles++;

        this.season++;
        if (this.season >= 4) {
            this.season = 0;
            this.year++;
        }

        Resources.processCycle();
        Population.processCycle();
        TechTree.processCycle();
        Factions.processCycle(this.year, this.season);

        this.processRandomEvent();

        if (TechTree.isResearched('festivals')) {
            Population.adjustMoral(5);
        }

        GameMap.updateVisibility(0);

        this.updateSeasonUI();
        Resources.updateUI();
        Population.updateUI();
        UI.refreshAll();

        if (this.totalCycles % 4 === 0) {
            SaveManager.save('auto');
        }

        this.checkDefeat();
    },

    processRandomEvent() {
        if (Perlin.random() > 0.15) return;

        const events = [
            {
                name: 'Bonne recolte !',
                effect: () => { Resources.add('food', 30); },
                msg: 'Une recolte exceptionnelle ! +30 nourriture.', type: 'success'
            },
            {
                name: 'Epidemie',
                effect: () => {
                    Population.adjustMoral(-10);
                    if (Population.villagers.length > 1) {
                        Population.villagers.pop();
                    }
                },
                msg: 'Une epidemie frappe le village !', type: 'alert'
            },
            {
                name: 'Marchands itinerants',
                effect: () => { Resources.add('gold', 20); },
                msg: 'Des marchands de passage apportent des richesses ! +20 or.', type: 'success'
            },
            {
                name: 'Tempete',
                effect: () => { Resources.add('wood', -15); },
                msg: 'Une tempete endommage vos reserves ! -15 bois.', type: 'alert'
            },
            {
                name: 'Migration',
                effect: () => {
                    if (Population.villagers.length < Population.maxPop) {
                        const v = Population.addVillager();
                        if (v) Notifications.add(`${v.name} arrive de loin !`, 'success');
                    }
                },
                msg: 'Des migrants cherchent refuge !', type: 'success'
            },
            {
                name: 'Filon d\'or',
                effect: () => { Resources.add('gold', 15); Resources.add('stone', 10); },
                msg: 'Un filon d\'or decouvert ! +15 or, +10 pierre.', type: 'success'
            }
        ];

        const event = events[Math.floor(Perlin.random() * events.length)];
        event.effect();
        Notifications.add(event.msg, event.type);
    },

    onTileClick(tx, ty) {
        const tile = GameMap.getTile(tx, ty);
        if (!tile || !tile.explored) return;

        if (this.buildMode) {
            if (this.canPlaceBuilding(tx, ty, this.buildMode)) {
                Buildings.placeBuilding(tx, ty, this.buildMode);
                GameMap.updateVisibility(0);
                UI.refreshAll();
            }
        } else {
            this.selectedTile = { x: tx, y: ty };
            UI.updateInfoPanel(tile);
        }
    },

    canPlaceBuilding(x, y, buildingId) {
        const tile = GameMap.getTile(x, y);
        if (!tile) return false;
        if (tile.terrain === CONFIG.TERRAIN.WATER) return false;
        if (tile.building) return false;
        if (tile.owner !== 0) return false;

        const bDef = CONFIG.BUILDINGS[buildingId.toUpperCase()];
        if (bDef && bDef.validTerrain && !bDef.validTerrain.includes(tile.terrain)) {
            return false;
        }

        return true;
    },

    setSpeed(speed) {
        this.speed = speed;
    },

    updateSeasonUI() {
        const seasonData = CONFIG.SEASONS[this.season];
        document.getElementById('season-icon').textContent = seasonData.icon;
        document.getElementById('season-name').textContent = seasonData.name;
        document.getElementById('year-count').textContent = this.year;
    },

    checkVictory() {
        const percent = GameMap.getConquestPercent(0);
        if (percent >= 100) {
            this.showVictory();
        }
    },

    checkDefeat() {
        if (Population.villagers.length <= 0) {
            this.showDefeat('Tous vos villageois ont disparu...');
            return;
        }
        const playerRegion = GameMap.getPlayerRegion();
        if (playerRegion) {
            const th = Buildings.playerBuildings.find(b => b.type === 'town_hall');
            if (th) {
                const thTile = GameMap.getTile(th.x, th.y);
                if (thTile && thTile.owner !== 0) {
                    this.showDefeat('Votre capitale a ete conquise !');
                }
            }
        }
    },

    showVictory() {
        this._running = false;
        const stats = document.getElementById('victory-stats');
        stats.innerHTML = `
            <div>Annees ecoulees: ${this.year}</div>
            <div>Cycles totaux: ${this.totalCycles}</div>
            <div>Population finale: ${Population.villagers.length}</div>
            <div>Armee: ${Military.getTotalUnits()} unites</div>
            <div>Technologies: ${Object.keys(TechTree.researched).length}</div>
        `;
        this.showScreen('victory-screen');
    },

    showDefeat(reason) {
        this._running = false;
        document.getElementById('defeat-reason').textContent = reason;
        const stats = document.getElementById('defeat-stats');
        stats.innerHTML = `
            <div>Annees ecoulees: ${this.year}</div>
            <div>Cycles totaux: ${this.totalCycles}</div>
            <div>Conquete: ${GameMap.getConquestPercent(0)}%</div>
        `;
        this.showScreen('defeat-screen');
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    },

    _initKeyShortcuts() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.buildMode) {
                    this.buildMode = null;
                    UI.clearBuildSelection();
                } else if (document.getElementById('tech-screen').classList.contains('active')) {
                    document.getElementById('tech-screen').classList.remove('active');
                } else if (document.getElementById('villager-overlay').classList.contains('active')) {
                    document.getElementById('villager-overlay').classList.remove('active');
                } else if (document.getElementById('battle-screen').classList.contains('active')) {
                    Combat.closeBattle();
                }
            }
            if (e.key === ' ') {
                e.preventDefault();
                if (this.speed === 'PAUSED') {
                    this.setSpeed('NORMAL');
                    UI.updateTimeButtons('btn-normal');
                } else {
                    this.setSpeed('PAUSED');
                    UI.updateTimeButtons('btn-pause');
                }
            }
        });
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Game.init();
    Game._initKeyShortcuts();
});
