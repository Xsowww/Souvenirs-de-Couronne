// Main game controller
const Game = {
    seed: '',
    _running: false,
    _castlePlaced: null,
    _worldMapOpen: false,
    _worldMapBuffer: null,

    // Resources (8 types: wood, stone, ironOre, goldOre, ironIngot, goldIngot, food, gold)
    resources: {},
    houses: 0,

    // Families: [{ name, man, woman, job, buildingIdx, militaryType, stats, training, hasChild, onVoyage, weapon, mount }]
    families: [],

    // Buildings placed: [{ type, x, y, level, familyIdx }]
    buildings: [],

    // Build mode
    _buildMode: false,
    _selectedBuild: null,

    // Pause menu
    _pauseMenuOpen: false,
    _lastSaveTimestamp: 0,

    // Info panel
    _infoPanelOpen: false,
    _infoTab: 'buildings',

    // Building detail panel
    _selectedBuilding: null, // index into this.buildings or 'castle'

    // Production timer — 2 cycles per half-day (every 6 game hours)
    _lastTick: 0,
    _prodCycleGameHours: 0, // tracks game hours for production

    // Time system
    _gameMinute: 0,
    _gameHour: 6,
    _gameDay: 1,
    _timeSpeed: 1,  // 0=paused, 1=normal, 2=x2
    _lastTimeUpdate: 0,
    _prevSpeed: 1,

    init() {
        AudioManager.init();
        document.getElementById('btn-new-game').addEventListener('click', () => {
            AudioManager._ensureContext();
            AudioManager.startMusic();
            this.newGame();
        });
        document.getElementById('btn-dev-test').addEventListener('click', () => {
            AudioManager._ensureContext();
            AudioManager.startMusic();
            this._startDevTest();
        });
        document.getElementById('btn-options').addEventListener('click', () => this.showScreen('options-screen'));
        document.getElementById('btn-options-close').addEventListener('click', () => this.showScreen('menu-screen'));
        document.getElementById('btn-quit-game').addEventListener('click', () => {
            if (confirm('Voulez-vous vraiment quitter ?')) {
                window.close();
                document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:Cinzel,serif;color:#c8a84a;font-size:1.5rem;background:#0e0a06;text-align:center;"><div>Merci d\'avoir joue !<br><span style="font-size:0.9rem;color:#6a5a3a;">Vous pouvez fermer cet onglet.</span></div></div>';
            }
        });

        document.getElementById('btn-confirm-placement').addEventListener('click', () => this.confirmPlacement());
        document.getElementById('btn-wake-up').addEventListener('click', () => this._dismissDayTransition());

        document.getElementById('worldmap-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'worldmap-overlay') this._closeWorldMap();
        });

        document.getElementById('opt-map-size').addEventListener('change', (e) => {
            const size = parseInt(e.target.value);
            CONFIG.MAP_WIDTH = size;
            CONFIG.MAP_HEIGHT = size;
        });

        // Info panel close
        document.getElementById('info-close').addEventListener('click', () => this._closeInfoPanel());

        // Info panel tabs
        document.querySelectorAll('.info-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this._infoTab = tab.dataset.tab;
                document.querySelectorAll('.info-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this._renderInfoContent();
            });
        });

        // Building detail panel close
        document.getElementById('building-detail-close').addEventListener('click', () => this._closeBuildingDetail());

        // Pause menu buttons
        document.getElementById('btn-resume').addEventListener('click', () => this._closePauseMenu());
        document.getElementById('btn-save').addEventListener('click', () => this._openSavePanel());
        document.getElementById('btn-pause-options').addEventListener('click', () => {
            document.querySelector('.pause-buttons').style.display = 'none';
            document.getElementById('pause-options').classList.add('active');
        });
        document.getElementById('btn-pause-options-back').addEventListener('click', () => {
            document.getElementById('pause-options').classList.remove('active');
            document.querySelector('.pause-buttons').style.display = '';
        });
        document.getElementById('btn-save-back').addEventListener('click', () => {
            document.getElementById('save-panel').classList.remove('active');
            document.querySelector('.pause-buttons').style.display = '';
        });
        document.getElementById('btn-quit-to-menu').addEventListener('click', () => this._openQuitConfirm());
        document.getElementById('btn-quit-yes').addEventListener('click', () => this._quitToMenu());
        document.getElementById('btn-quit-no').addEventListener('click', () => {
            document.getElementById('quit-confirm').classList.remove('active');
            document.querySelector('.pause-buttons').style.display = '';
        });

        // Main menu load button
        document.getElementById('btn-continue').addEventListener('click', () => this._showLoadScreen());
        this._updateMainMenuLoadButton();

        // Time controls — buttons added when game screen is active, not at init
        // (bound in _startMapView instead)

        // Key bindings
        window.addEventListener('keydown', (e) => {
            if (e.key === 'm' || e.key === 'M') {
                if (this._running && !this._infoPanelOpen && !this._pauseMenuOpen) {
                    if (this._worldMapOpen) this._closeWorldMap();
                    else this._openWorldMap();
                }
            }
            if (e.key === 'b' || e.key === 'B') {
                if (this._running && !this._worldMapOpen && !this._pauseMenuOpen) {
                    this._toggleBuildMenu();
                }
            }
            if (e.key === 'Escape') {
                if (this._pauseMenuOpen) this._closePauseMenu();
                else if (this._worldMapOpen) this._closeWorldMap();
                else if (this._buildMode) this._closeBuildMenu();
                else if (this._selectedBuilding !== null) this._closeBuildingDetail();
                else if (this._infoPanelOpen) this._closeInfoPanel();
                else if (this._running && !this._dayTransitionActive) this._openPauseMenu();
            }
            if (e.key === ' ' && this._running && !this._pauseMenuOpen) {
                e.preventDefault();
                this._togglePause();
            }
            if (e.key === '1' && this._running && !this._pauseMenuOpen) this._setTimeSpeed(1);
            if (e.key === '2' && this._running && !this._pauseMenuOpen) this._setTimeSpeed(2);
            if (e.key === '3' && this._running && !this._pauseMenuOpen) this._skipDay();
        });
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    },

    // ==================== NEW GAME ====================

    newGame() {
        const seedField = document.getElementById('seed-field');
        this.seed = seedField.value || String(Date.now());
        this._castlePlaced = null;

        this.showScreen('loading-screen');
        this._updateLoadingProgress(0, 'Preparation du parchemin...');

        setTimeout(() => this._generateTerrainChunked(), 50);
    },

    _generateTerrainChunked() {
        const messages = [
            'Les cartographes explorent les terres...',
            'Les oceans se forment...',
            'Les forets prennent racine...',
            'Les montagnes emergent des brumes...',
            'Les regions se dessinent...',
            'Dernieres touches...'
        ];

        Perlin.seed(this.seed);
        Perlin.seedRng(this.seed);
        GameMap.width = CONFIG.MAP_WIDTH;
        GameMap.height = CONFIG.MAP_HEIGHT;
        GameMap.tiles = [];
        GameMap.regions = [];

        const totalRows = GameMap.height;
        let currentRow = 0;
        const chunkSize = 20;

        const processChunk = () => {
            const end = Math.min(currentRow + chunkSize, totalRows);
            for (let y = currentRow; y < end; y++) {
                GameMap.tiles[y] = [];
                for (let x = 0; x < GameMap.width; x++) {
                    const nx = x / GameMap.width;
                    const ny = y / GameMap.height;
                    const elevation = Perlin.octave(x * 0.035, y * 0.035, 6, 0.5);
                    const moisture = Perlin.octave(x * 0.04 + 200, y * 0.04 + 200, 4, 0.5);
                    const dx = (nx - 0.5) * 2;
                    const dy = (ny - 0.5) * 2;
                    const distFromCenter = Math.sqrt(dx * dx + dy * dy);
                    const falloff = Math.max(0, 1 - distFromCenter * 1.1);
                    const finalElev = elevation * 0.7 + falloff * 0.3;
                    const terrain = GameMap._elevToTerrain(finalElev, moisture, x, y);

                    GameMap.tiles[y][x] = {
                        x, y, terrain,
                        elevation: finalElev, moisture,
                        building: null,
                        owner: -1,
                        regionId: -1,
                        visible: true,
                        explored: true,
                    };
                }
            }
            currentRow = end;
            const progress = (currentRow / totalRows) * 0.65;
            const msgIdx = Math.min(messages.length - 1, Math.floor(progress * messages.length));
            this._updateLoadingProgress(progress, messages[msgIdx]);

            if (currentRow < totalRows) {
                setTimeout(processChunk, 0);
            } else {
                this._updateLoadingProgress(0.7, 'Les regions se dessinent...');
                setTimeout(() => {
                    GameMap._generateNaturalRegions();
                    this._updateLoadingProgress(1.0, 'La carte est prete !');
                    setTimeout(() => this._showPlacementScreen(), 400);
                }, 50);
            }
        };

        processChunk();
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
        this._castlePlaced = null;

        const canvas = document.getElementById('placement-canvas');
        const container = document.getElementById('placement-map-area');

        const rect = container.getBoundingClientRect();
        const size = Math.min(rect.width - 40, rect.height - 20);
        canvas.width = size;
        canvas.height = size;

        GameMap.renderOverviewToCanvas(canvas);

        const btn = document.getElementById('btn-confirm-placement');
        btn.disabled = true;
        btn.classList.remove('ready');

        canvas.onmousemove = (e) => {
            if (this._castlePlaced) return;
            const cr = canvas.getBoundingClientRect();
            const mx = e.clientX - cr.left;
            const my = e.clientY - cr.top;
            const tileX = Math.floor((mx / canvas.width) * GameMap.width);
            const tileY = Math.floor((my / canvas.height) * GameMap.height);

            GameMap.renderOverviewToCanvas(canvas, tileX, tileY);
            this._updatePlacementInfo(tileX, tileY);
        };

        canvas.onclick = (e) => {
            const cr = canvas.getBoundingClientRect();
            const mx = e.clientX - cr.left;
            const my = e.clientY - cr.top;
            const tileX = Math.floor((mx / canvas.width) * GameMap.width);
            const tileY = Math.floor((my / canvas.height) * GameMap.height);

            const tile = GameMap.getTile(tileX, tileY);
            if (!tile || tile.terrain <= CONFIG.TERRAIN.WATER) return;
            if (!GameMap.isValidKingdomSpot(tileX, tileY)) return;
            if (GameMap.isCenterZone(tileX, tileY)) return;

            this._castlePlaced = { x: tileX, y: tileY };
            GameMap.renderOverviewToCanvas(canvas, tileX, tileY);
            btn.disabled = false;
            btn.classList.add('ready');

            const info = document.getElementById('placement-info');
            info.textContent = 'Chateau place ! Cliquez ailleurs pour deplacer, ou validez.';
            info.style.color = '#c8a84a';
        };
    },

    _getQuadrantName(tileX, tileY) {
        const hw = GameMap.width / 2, hh = GameMap.height / 2;
        if (tileX < hw && tileY < hh) return 'Sylvanie';
        if (tileX >= hw && tileY < hh) return 'Les Plaines Dorees';
        if (tileX < hw && tileY >= hh) return 'Collines Brumeuses';
        return 'Pics de Fer';
    },

    _updatePlacementInfo(tileX, tileY) {
        const tile = GameMap.getTile(tileX, tileY);
        const info = document.getElementById('placement-info');
        if (!tile) return;

        const terrainName = CONFIG.TERRAIN_NAMES[tile.terrain] || 'Inconnu';
        const valid = GameMap.isValidKingdomSpot(tileX, tileY);
        const isCenter = GameMap.isCenterZone(tileX, tileY);
        const regionName = this._getQuadrantName(tileX, tileY);

        if (tile.terrain <= CONFIG.TERRAIN.WATER) {
            info.textContent = `${terrainName} - Impossible de fonder ici`;
            info.style.color = '#d8a8a8';
        } else if (isCenter) {
            info.textContent = `${regionName} - ${terrainName} (${tileX}, ${tileY}) - Trop au centre`;
            info.style.color = '#d8a8a8';
        } else if (!valid) {
            info.textContent = `${regionName} - ${terrainName} (${tileX}, ${tileY}) - Emplacement non viable (manque de terrain varie)`;
            info.style.color = '#d8a8a8';
        } else {
            info.textContent = `${regionName} - ${terrainName} (${tileX}, ${tileY}) - Bon emplacement !`;
            info.style.color = '#a8d8a8';
        }
    },

    // ==================== 2ND LOADING ====================

    confirmPlacement() {
        if (!this._castlePlaced) return;

        const placementCanvas = document.getElementById('placement-canvas');
        placementCanvas.onmousemove = null;
        placementCanvas.onclick = null;

        this.showScreen('loading-screen');
        this._updateLoadingProgress(0, 'Fondation du royaume...');

        const loadSteps = [
            { progress: 0.15, msg: 'Les seigneurs prennent place...' },
            { progress: 0.35, msg: 'Les royaumes ennemis se forment...' },
            { progress: 0.55, msg: 'Les bandits rodent dans les bois...' },
            { progress: 0.75, msg: 'Preparation du terrain...' },
            { progress: 0.90, msg: 'Construction du chateau...' },
            { progress: 1.00, msg: 'Votre royaume est pret !' },
        ];

        let step = 0;
        const runStep = () => {
            if (step === 0) {
                GameMap.placeKingdoms(this._castlePlaced.x, this._castlePlaced.y);
            }
            if (step === 3) {
                Renderer.init();
                Renderer.buildTerrainBuffer();
            }

            this._updateLoadingProgress(loadSteps[step].progress, loadSteps[step].msg);
            step++;

            if (step < loadSteps.length) {
                setTimeout(runStep, 200);
            } else {
                setTimeout(() => this._startMapView(), 400);
            }
        };

        setTimeout(runStep, 100);
    },

    // ==================== MAP VIEW (game) ====================

    _startMapView() {
        this.showScreen('game-screen');

        if (!Renderer.canvas) {
            Renderer.init();
        }
        Camera.init(Renderer.canvas);

        Renderer.setIsoMode(false);
        Camera.zoom = 4;

        this._running = true;
        this._worldMapOpen = false;
        this._worldMapBuffer = null;
        this._buildMode = false;
        this._selectedBuild = null;
        this._infoPanelOpen = false;
        this._selectedBuilding = null;
        this._pauseMenuOpen = false;
        this._lastSaveTimestamp = 0;
        this._lastTick = Date.now();

        // Init time system
        this._gameMinute = 0;
        this._gameHour = 6;
        this._gameDay = 1;
        this._timeSpeed = 1;
        this._lastTimeUpdate = Date.now();
        this._prevSpeed = 1;

        // Init resources (8 types)
        this.resources = { ...CONFIG.START_RESOURCES };
        this.buildings = [];
        this.houses = 0;

        // Start with 2 families
        this.families = [
            this._generateFamily(),
            this._generateFamily()
        ];

        // Pending families
        this._pendingFamilies = [];
        this._dayTransitionActive = false;

        // Satisfaction system (persistent, event-based, 0-100)
        this._satisfaction = 60;
        this._totalGameHours = 0;

        // Production cycle tracking (fixed hours: 8h, 12h, 16h, 20h)
        this._lastCycleHour = 6; // game starts at 6h, first cycle at 12h (skip 8h on day 1)
        this._firstDayCycleDone = false;
        this._prodCycleGameHours = 0;

        // Commerce voyages: [{ familyIdx, goldCarried, returnGameHours, cart }]
        this._activeVoyages = [];

        // Scouts: [{ familyIdx, targetOwner, returnGameHours }]
        this._activeScouts = [];
        // Scouted intel: { ownerIdx: { soldiers, archers, cavaliers, strength, day } }
        this._scoutedIntel = {};

        // Raids: [{ familyIndices, targetOwner, returnGameHours, strength }]
        this._activeRaids = [];

        // Equipment inventory (shared stock)
        this.inventory = { simpleWeapon: 0, heavyWeapon: 0, cow: 0, horse: 0, chariot: 0 };

        // Show HUD
        document.getElementById('hud-bar').classList.add('active');
        this._updateHUD();
        this._updateTimeHUD();

        // Bind time controls (safe: done after screen is shown)
        const btnPause  = document.getElementById('btn-pause');
        const btnPlay   = document.getElementById('btn-play');
        const btnFast   = document.getElementById('btn-fast');
        if (btnPause)  btnPause.onclick  = () => this._togglePause();
        if (btnPlay)   btnPlay.onclick   = () => this._setTimeSpeed(1);
        if (btnFast)   btnFast.onclick   = () => this._setTimeSpeed(2);
        const btnSkip  = document.getElementById('btn-skip-day');
        if (btnSkip)   btnSkip.onclick   = () => this._skipDay();

        // Auto-place houses for starting families
        if (this._castlePlaced) {
            this._autoPlaceStartingHouses();
        }

        // Build the build menu items
        this._buildBuildMenu();

        if (this._castlePlaced) {
            Camera.centerOnCell(this._castlePlaced.x, this._castlePlaced.y);
        }

        this._updateHUD();
        this._loopGen = (this._loopGen || 0) + 1;
        this._gameLoop(this._loopGen);
    },

    // ==================== DEV TEST MODE ====================
    _startDevTest() {
        // Generate map with random seed
        this.seed = 'devtest_' + Date.now();
        this._castlePlaced = null;

        // Generate terrain synchronously
        Perlin.seed(this.seed);
        Perlin.seedRng(this.seed);
        GameMap.width = CONFIG.MAP_WIDTH;
        GameMap.height = CONFIG.MAP_HEIGHT;
        GameMap.tiles = [];
        GameMap.regions = [];
        for (let y = 0; y < GameMap.height; y++) {
            GameMap.tiles[y] = [];
            for (let x = 0; x < GameMap.width; x++) {
                const elevation = Perlin.octave(x * 0.035, y * 0.035, 6, 0.5);
                const moisture = Perlin.octave(x * 0.04 + 200, y * 0.04 + 200, 4, 0.5);
                const dx = (x / GameMap.width - 0.5) * 2;
                const dy = (y / GameMap.height - 0.5) * 2;
                const distFromCenter = Math.sqrt(dx * dx + dy * dy);
                const falloff = Math.max(0, 1 - distFromCenter * 1.1);
                const finalElev = elevation * 0.7 + falloff * 0.3;
                const terrain = GameMap._elevToTerrain(finalElev, moisture, x, y);
                GameMap.tiles[y][x] = {
                    x, y, terrain, elevation: finalElev, moisture,
                    building: null, owner: -1, regionId: -1,
                    visible: true, explored: true,
                };
            }
        }
        GameMap._generateNaturalRegions();

        // Place castle near center
        const cx = Math.floor(GameMap.width / 2);
        const cy = Math.floor(GameMap.height / 2);
        // Find valid spot near center
        let castleX = cx, castleY = cy;
        for (let r = 0; r < 30; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const tile = GameMap.getTile(cx + dx, cy + dy);
                    if (tile && tile.terrain > 1 && tile.terrain < 6 && GameMap.isValidKingdomSpot(cx + dx, cy + dy)) {
                        castleX = cx + dx;
                        castleY = cy + dy;
                        r = 99; dx = 99; dy = 99; // break all
                    }
                }
            }
        }
        this._castlePlaced = { x: castleX, y: castleY };
        GameMap.placeKingdoms(castleX, castleY);

        // Init renderer
        Renderer.init();
        Renderer.buildTerrainBuffer();

        // Now use normal _startMapView to set up game state
        this.showScreen('game-screen');
        Camera.init(Renderer.canvas);
        Renderer.setIsoMode(false);
        Camera.zoom = 4;

        this._running = true;
        this._worldMapOpen = false;
        this._worldMapBuffer = null;
        this._buildMode = false;
        this._selectedBuild = null;
        this._infoPanelOpen = false;
        this._selectedBuilding = null;
        this._pauseMenuOpen = false;
        this._lastSaveTimestamp = 0;
        this._lastTick = Date.now();

        // Day 20 setup
        this._gameMinute = 0;
        this._gameHour = 8;
        this._gameDay = 20;
        this._timeSpeed = 1;
        this._lastTimeUpdate = Date.now();
        this._prevSpeed = 1;

        // Lots of resources
        this.resources = {
            wood: 800, stone: 600, ironOre: 100, goldOre: 50,
            ironIngot: 30, goldIngot: 15, food: 500, gold: 300
        };
        this.buildings = [];

        // Generate 12 families (7 assigned + 5 free)
        this.families = [];
        for (let i = 0; i < 12; i++) {
            const fam = this._generateFamily();
            // Give some families children
            if (i < 3) fam.hasChild = true;
            this.families.push(fam);
        }

        this._pendingFamilies = [];
        this._dayTransitionActive = false;
        this._satisfaction = 75;
        this._totalGameHours = 0;
        this._lastCycleHour = 8;
        this._firstDayCycleDone = true;
        this._prodCycleGameHours = 0;
        this._activeVoyages = [];
        this._activeScouts = [];
        this._activeRaids = [];
        this._scoutedIntel = {};

        // Equipment inventory for testing
        this.inventory = { simpleWeapon: 3, heavyWeapon: 2, cow: 1, horse: 1, chariot: 0 };

        // Place castle tile
        const castleTile = GameMap.getTile(castleX, castleY);
        if (castleTile) castleTile.building = 'castle';

        // Helper to find and place a building near castle
        const placeNear = (type, maxRadius) => {
            const def = CONFIG.BUILDINGS[type];
            const validTerrain = def.terrain || [2, 3, 4];
            for (let r = 1; r <= (maxRadius || 15); r++) {
                for (let dx = -r; dx <= r; dx++) {
                    for (let dy = -r; dy <= r; dy++) {
                        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                        const tx = castleX + dx;
                        const ty = castleY + dy;
                        const tile = GameMap.getTile(tx, ty);
                        if (!tile || tile.building || tile.owner !== 0) continue;
                        if (!validTerrain.includes(tile.terrain)) continue;
                        tile.building = type;
                        const bd = { type, x: tx, y: ty, level: 1, familyIdx: -1 };
                        if (def.multiFamily) bd.familyIndices = [];
                        this.buildings.push(bd);
                        return this.buildings.length - 1;
                    }
                }
            }
            return -1;
        };

        // Place buildings: 12 houses, 3 lumberjacks, 4 farms, 2 mines, 1 warehouse lv3, 1 barracks, 1 comptoir, 1 foundry
        const houseIndices = [];
        for (let i = 0; i < 12; i++) {
            const idx = placeNear('house');
            if (idx >= 0) houseIndices.push(idx);
        }
        // Upgrade houses with children to lv2
        for (let i = 0; i < 3 && i < houseIndices.length; i++) {
            if (this.buildings[houseIndices[i]]) this.buildings[houseIndices[i]].level = 2;
        }

        const lumberIndices = [];
        for (let i = 0; i < 3; i++) {
            const idx = placeNear('lumberjack');
            if (idx >= 0) lumberIndices.push(idx);
        }

        const farmIndices = [];
        for (let i = 0; i < 4; i++) {
            const idx = placeNear('farm');
            if (idx >= 0) farmIndices.push(idx);
        }

        const mineIndices = [];
        for (let i = 0; i < 2; i++) {
            const idx = placeNear('mine');
            if (idx >= 0) mineIndices.push(idx);
        }

        const warehouseIdx = placeNear('warehouse');
        const barracksIdx = placeNear('barracks');
        placeNear('comptoir');
        const foundryIdx = placeNear('foundry');

        // Upgrade buildings for high production
        for (const idx of lumberIndices) {
            if (this.buildings[idx]) this.buildings[idx].level = 2;
        }
        for (const idx of farmIndices) {
            if (this.buildings[idx]) this.buildings[idx].level = 3; // Max farms for abundant food
        }
        for (const idx of mineIndices) {
            if (this.buildings[idx]) this.buildings[idx].level = 2;
        }
        if (warehouseIdx >= 0 && this.buildings[warehouseIdx]) {
            this.buildings[warehouseIdx].level = 3; // Max storage
        }
        if (foundryIdx >= 0 && this.buildings[foundryIdx]) {
            this.buildings[foundryIdx].level = 2;
        }

        // Assign all 12 families to houses
        for (let i = 0; i < Math.min(12, houseIndices.length); i++) {
            this.buildings[houseIndices[i]].familyIdx = i;
        }

        // Assign 7 families to workplaces
        let famIdx = 0;
        // 3 lumberjacks
        for (const idx of lumberIndices) {
            if (famIdx >= 7) break;
            this.buildings[idx].familyIdx = famIdx;
            this.families[famIdx].buildingIdx = idx;
            this.families[famIdx].job = 'lumberjack';
            famIdx++;
        }
        // 3 farms (4th farm ready but unassigned)
        for (let fi = 0; fi < 3 && fi < farmIndices.length; fi++) {
            if (famIdx >= 7) break;
            const idx = farmIndices[fi];
            this.buildings[idx].familyIdx = famIdx;
            this.families[famIdx].buildingIdx = idx;
            this.families[famIdx].job = 'farm';
            famIdx++;
        }
        // 1 mine (2nd mine ready but unassigned)
        if (mineIndices.length > 0 && famIdx < 7) {
            this.buildings[mineIndices[0]].familyIdx = famIdx;
            this.families[famIdx].buildingIdx = mineIndices[0];
            this.families[famIdx].job = 'mine';
            famIdx++;
        }

        // Families 7-11 are completely free (5 idle families for testing)

        // Show HUD
        document.getElementById('hud-bar').classList.add('active');

        // Bind time controls
        const btnPause = document.getElementById('btn-pause');
        const btnPlay  = document.getElementById('btn-play');
        const btnFast  = document.getElementById('btn-fast');
        const btnSkip  = document.getElementById('btn-skip-day');
        if (btnPause) btnPause.onclick = () => this._togglePause();
        if (btnPlay)  btnPlay.onclick  = () => this._setTimeSpeed(1);
        if (btnFast)  btnFast.onclick  = () => this._setTimeSpeed(2);
        if (btnSkip)  btnSkip.onclick  = () => this._skipDay();

        Renderer._bufferDirty = true;
        Camera.centerOnCell(castleX, castleY);

        this._buildBuildMenu();
        this._updateHUD();
        this._updateTimeHUD();
        this._loopGen = (this._loopGen || 0) + 1;
        this._gameLoop(this._loopGen);

        this._showNotification('Mode Test : Jour 20, 12 familles, 5 libres', '#a8c8d8');
    },

    _autoPlaceStartingHouses() {
        const cx = this._castlePlaced.x;
        const cy = this._castlePlaced.y;
        const houseTerrain = CONFIG.BUILDINGS.house.terrain;
        let placed = 0;
        const needed = this.families.length;

        // Search in expanding rings around castle
        for (let radius = 1; radius <= 10 && placed < needed; radius++) {
            for (let dx = -radius; dx <= radius && placed < needed; dx++) {
                for (let dy = -radius; dy <= radius && placed < needed; dy++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue; // ring only
                    const tx = cx + dx;
                    const ty = cy + dy;
                    const tile = GameMap.getTile(tx, ty);
                    if (!tile) continue;
                    if (tile.building) continue;
                    if (tile.owner !== 0) continue;
                    if (!houseTerrain.includes(tile.terrain)) continue;

                    tile.building = 'house';
                    // familyIdx = which family lives here (not a job assignment)
                    const buildingData = { type: 'house', x: tx, y: ty, level: 1, familyIdx: placed };
                    this.buildings.push(buildingData);
                    // families[].buildingIdx stays -1 (no job, house is not a workplace)
                    placed++;
                }
            }
        }

        if (placed > 0) {
            Renderer._bufferDirty = true;
        }
    },

    // Auto-assign a newly arrived family to an empty house
    _assignFamilyToEmptyHouse(familyIdx) {
        for (const b of this.buildings) {
            if (b.type === 'house' && b.familyIdx < 0) {
                b.familyIdx = familyIdx;
                return true;
            }
        }
        return false;
    },

    _generateFamily() {
        const manNames = ['Guillaume', 'Henri', 'Robert', 'Arnaud', 'Pierre', 'Jean', 'Thibaut', 'Gaultier', 'Renaud', 'Baudouin'];
        const womanNames = ['Marguerite', 'Isabelle', 'Alienor', 'Blanche', 'Mathilde', 'Jeanne', 'Adele', 'Beatrice', 'Constance', 'Heloise'];
        const surnames = ['Dupont', 'Leblanc', 'Moreau', 'Lefebvre', 'Chevalier', 'Duval', 'Fontaine', 'Lambert', 'Marchand', 'Beaumont'];
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        const surname = pick(surnames);
        // Random base stats totaling 10 points
        const totalPts = 10;
        let e = Math.floor(Math.random() * (totalPts + 1));
        let f = Math.floor(Math.random() * (totalPts - e + 1));
        let d = totalPts - e - f;
        return {
            name: 'Famille ' + surname,
            man: pick(manNames) + ' ' + surname,
            woman: pick(womanNames) + ' ' + surname,
            job: null,
            buildingIdx: -1,
            militaryType: null, // 'soldier' | 'archer' | 'cavalier'
            stats: { esquive: e, force: f, defense: d },
            training: null, // { cyclesLeft: N, pendingPoints: N } or null
            trainingHistory: [], // [{type, points, date}]
            hasChild: false,
            onVoyage: false,
            weapon: null, // 'simpleWeapon' | 'heavyWeapon' | null
            mount: null   // 'cow' | 'horse' | 'chariot' | null
        };
    },

    // ==================== FAMILY MANAGEMENT ====================

    // Remove a family and reindex ALL references in one place.
    // Returns the removed family object (or null).
    _removeFamilyAt(idx) {
        if (idx < 0 || idx >= this.families.length) return null;
        const fam = this.families[idx];

        // Notify lost equipment (cosmetic, before splice)
        if (fam.weapon) {
            const weaponName = fam.weapon === 'simpleWeapon' ? 'arme simple' : 'arme lourde';
            this._showNotification(`\u{1F5E1} Son ${weaponName} est perdue avec ${fam.name}`, '#d8a888');
        }
        if (fam.mount) {
            const mountName = fam.mount === 'cow' ? 'vache' : fam.mount === 'horse' ? 'cheval' : 'chariot';
            this._showNotification(`\u{1F40E} Sa ${mountName} est perdue avec ${fam.name}`, '#d8a888');
        }

        // Unassign from buildings (single and multi-family)
        for (const b of this.buildings) {
            if (b.familyIdx === idx) b.familyIdx = -1;
            if (b.familyIndices) {
                b.familyIndices = b.familyIndices.filter(i => i !== idx);
            }
        }

        // Remove from voyages / scouts / raids
        if (this._activeVoyages) {
            this._activeVoyages = this._activeVoyages.filter(v => v.familyIdx !== idx);
        }
        if (this._activeScouts) {
            this._activeScouts = this._activeScouts.filter(s => s.familyIdx !== idx);
        }
        if (this._activeRaids) {
            for (const r of this._activeRaids) {
                if (r.familyIndices) r.familyIndices = r.familyIndices.filter(i => i !== idx);
            }
        }

        // Splice out
        this.families.splice(idx, 1);

        // Shift all indices > idx down by 1
        for (const b of this.buildings) {
            if (b.familyIdx > idx) b.familyIdx--;
            if (b.familyIndices) {
                b.familyIndices = b.familyIndices.map(i => i > idx ? i - 1 : i);
            }
        }
        for (const f of this.families) {
            if (f.buildingIdx > idx) f.buildingIdx--;
        }
        if (this._activeVoyages) {
            for (const v of this._activeVoyages) {
                if (v.familyIdx > idx) v.familyIdx--;
            }
        }
        if (this._activeScouts) {
            for (const s of this._activeScouts) {
                if (s.familyIdx > idx) s.familyIdx--;
            }
        }
        if (this._activeRaids) {
            for (const r of this._activeRaids) {
                if (r.familyIndices) {
                    r.familyIndices = r.familyIndices.map(i => i > idx ? i - 1 : i);
                }
            }
        }

        return fam;
    },

    _adjustSatisfaction(delta) {
        this._satisfaction = Math.max(0, Math.min(100, this._satisfaction + delta));
    },

    // ==================== STORAGE ====================

    getStorageCap(res) {
        if (res === 'gold') return Infinity; // gold (currency) has no cap
        let cap = CONFIG.STORAGE.BASE[res] || 0;
        for (const b of this.buildings) {
            if (b.type === 'warehouse') {
                const lvl = b.level || 1;
                const bonus = CONFIG.STORAGE.WAREHOUSE_BONUS[lvl - 1];
                if (bonus && bonus[res]) cap += bonus[res];
            }
        }
        return cap;
    },

    _addResource(res, amount) {
        const cap = this.getStorageCap(res);
        this.resources[res] = Math.min(cap, (this.resources[res] || 0) + amount);
    },

    // ==================== HOUSING ====================

    getMaxFamilies() {
        // 1 base (castle) + 1 per house (regardless of level)
        let count = 1;
        for (const b of this.buildings) {
            if (b.type === 'house') count += 1;
        }
        return count;
    },

    // ==================== TIME HELPERS ====================

    _formatGameHours(gh) {
        const day = Math.floor(gh / 24) + 1;
        const h = String(Math.floor(gh % 24)).padStart(2, '0');
        const m = String(Math.floor((gh % 1) * 60)).padStart(2, '0');
        return `Jour ${day} a ${h}:${m}`;
    },

    _computeCycleEndGH(fromGH, cyclesCount) {
        const hours = this._CYCLE_HOURS;
        let remaining = cyclesCount;
        let day = Math.floor(fromGH / 24);
        const hourInDay = fromGH % 24;
        let startIdx = 0;
        for (let i = 0; i < hours.length; i++) {
            if (hours[i] > hourInDay) { startIdx = i; break; }
            if (i === hours.length - 1) { startIdx = 0; day++; }
        }
        while (remaining > 0) {
            for (let i = startIdx; i < hours.length && remaining > 0; i++) {
                remaining--;
                if (remaining === 0) return day * 24 + hours[i];
            }
            startIdx = 0;
            day++;
        }
        return fromGH;
    },

    // ==================== PRODUCTION TICK ====================
    // 4 cycles per day at fixed hours: 8h, 12h, 16h, 20h
    // Day 1: first cycle skipped (8h), production starts at 12h

    // Fixed cycle hours: 8h, 12h, 16h, 20h
    _CYCLE_HOURS: [8, 12, 16, 20],

    _productionTick() {
        if (this._timeSpeed === 0 || this._dayTransitionActive) return;

        const hour = this._gameHour + this._gameMinute / 60;

        // Find the next cycle that should have fired
        let cycleTriggered = false;
        for (const ch of this._CYCLE_HOURS) {
            if (hour >= ch && this._lastCycleHour < ch) {
                cycleTriggered = true;
                this._lastCycleHour = ch;
                break;
            }
        }
        if (!cycleTriggered) return;

        // Skip first cycle (8h) on day 1
        if (this._gameDay === 1 && this._lastCycleHour === 8 && !this._firstDayCycleDone) {
            this._firstDayCycleDone = true;
            return;
        }

        this._runProductionCycle();
    },

    _showCycleNotification(produced) {
        // Build production summary
        const parts = [];
        for (const [res, amt] of Object.entries(produced)) {
            if (amt > 0) {
                const name = CONFIG.RESOURCE_NAMES[res] || res;
                parts.push(`+${amt} ${name}`);
            }
        }

        // Food consumption summary (only at meal cycles 12h and 20h)
        let foodConsumed = 0;
        if (this._lastCycleHour === 12 || this._lastCycleHour === 20) {
            for (const fam of this.families) {
                if (fam.onVoyage) continue;
                foodConsumed += fam.hasChild ? 6 : 4;
            }
        }

        if (parts.length > 0 || foodConsumed > 0) {
            let msg = '';
            if (parts.length > 0) {
                msg += parts.join(', ');
            }
            if (foodConsumed > 0) {
                msg += (msg ? ' | ' : '') + `-${foodConsumed} Nourriture`;
            }
            // All families fed?
            const allFed = (this.resources.food || 0) >= 0;
            const color = allFed ? '#a8c8d8' : '#d88888';
            const cycleHour = String(Math.floor(this._lastCycleHour)).padStart(2, '0');
            this._showNotification(`\u{1F4E6} Cycle ${cycleHour}h : ${msg}`, color);
        }
    },

    _consumeFood() {
        // 2 meals/day (12h + 20h), 8 food/day per family = 4 per meal. Niv2 house: 12/day = 6 per meal
        let totalNeeded = 0;
        for (let i = 0; i < this.families.length; i++) {
            const fam = this.families[i];
            if (fam.onVoyage) continue; // travelling families don't eat from village stock
            const perMeal = fam.hasChild ? 6 : 4;
            totalNeeded += perMeal;
        }

        if ((this.resources.food || 0) >= totalNeeded) {
            this.resources.food -= totalNeeded;
        } else {
            // Not enough food — some families go hungry
            const fed = this.resources.food || 0;
            this.resources.food = 0;
            const unfedFamilies = Math.ceil((totalNeeded - fed) / 4);
            // -8% satisfaction per underfed family
            this._adjustSatisfaction(-unfedFamilies * 8);
            if (unfedFamilies > 0) {
                this._showNotification(`\u{26A0} ${unfedFamilies} famille(s) mal nourrie(s) ! -${unfedFamilies * 8}% satisfaction`, '#d88888');
            }
        }
    },

    _tickTraining() {
        for (const fam of this.families) {
            if (fam.training && fam.training.cyclesLeft > 0) {
                fam.training.cyclesLeft--;
                if (fam.training.cyclesLeft <= 0) {
                    // Training complete — earn 4-10 distributable points
                    const earnedPoints = 4 + Math.floor(Math.random() * 7); // 4-10
                    fam.training.pendingPoints = earnedPoints;
                    fam.training.cyclesLeft = 0;
                    if (!fam.trainingHistory) fam.trainingHistory = [];
                    fam.trainingHistory.push({
                        type: fam.militaryType,
                        points: earnedPoints,
                        day: this._gameDay,
                        status: 'pending'
                    });
                    AudioManager.playTrainingComplete();
                    this._showNotification(`\u{2694} ${fam.name} a termine l'entrainement ! +${earnedPoints} points a distribuer`, '#a8d8a8');
                }
            }
        }
    },

    _updateHUD() {
        // Update each resource with its own cap
        const resKeys = ['wood', 'stone', 'ironOre', 'goldOre', 'ironIngot', 'goldIngot', 'food', 'gold'];
        for (const key of resKeys) {
            const el = document.getElementById('hud-' + key);
            if (!el) continue;
            const val = this.resources[key] || 0;
            const cap = this.getStorageCap(key);
            el.textContent = cap === Infinity ? val : val + '/' + cap;
        }
        document.getElementById('hud-families').textContent = this.families.length;

        // Free houses
        const freeHouses = Math.max(0, this.getMaxFamilies() - this.families.length);
        const freeEl = document.getElementById('hud-free-houses');
        if (freeEl) freeEl.textContent = freeHouses;

        // Idle families
        const idleFamilies = this.families.filter(f => f.buildingIdx < 0).length;
        const idleEl = document.getElementById('hud-idle-families');
        if (idleEl) idleEl.textContent = idleFamilies;

        // Arriving families with arrival time
        const arrivingCount = this._pendingFamilies ? this._pendingFamilies.length : 0;
        const arrEl = document.getElementById('hud-arriving');
        if (arrEl) arrEl.textContent = arrivingCount;

        // Arriving tooltip with ETA
        const arrTipEl = document.getElementById('arriving-tooltip');
        if (arrTipEl && this._pendingFamilies) {
            if (this._pendingFamilies.length === 0) {
                arrTipEl.innerHTML = '<div style="color:#6a5a3a;">Aucune famille en route</div>';
            } else {
                let arrHtml = '';
                const currentGH = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
                for (const p of this._pendingFamilies) {
                    const hoursLeft = Math.max(0, p.arrivalGameHours - currentGH);
                    const arrDay = Math.floor(p.arrivalGameHours / 24) + 1;
                    const arrHour = Math.floor(p.arrivalGameHours % 24);
                    const arrMin = Math.floor((p.arrivalGameHours % 1) * 60);
                    const etaStr = hoursLeft < 1
                        ? `< 1h`
                        : `~${Math.floor(hoursLeft)}h`;
                    arrHtml += `<div class="sat-demand"><span>${p.family.name}</span><span style="color:var(--gold-light);">Jour ${arrDay} ${String(arrHour).padStart(2,'0')}:${String(arrMin).padStart(2,'0')} (${etaStr})</span></div>`;
                }
                arrTipEl.innerHTML = `<div style="color:var(--gold);font-family:Cinzel,serif;font-size:0.72rem;margin-bottom:4px;">Familles en route</div>` + arrHtml;
            }
        }

        // Satisfaction
        const sat = this._getSatisfaction();
        this._satisfaction = sat;
        const satEl = document.getElementById('hud-satisfaction');
        if (satEl) {
            satEl.textContent = sat + '%';
            satEl.style.color = sat > 75 ? '#a8d8a8' : sat > 50 ? '#e8d48a' : sat > 25 ? '#d8a888' : '#d88888';
        }
        // Satisfaction tooltip
        const tipEl = document.getElementById('satisfaction-tooltip');
        if (tipEl) {
            const demands = this._getSatisfactionDemands();
            let tipHtml = `<div style="color:var(--gold);font-family:Cinzel,serif;font-size:0.72rem;margin-bottom:4px;">Satisfaction : ${sat}%</div>`;
            for (const d of demands) {
                const cls = d.met ? 'sat-demand-met' : 'sat-demand-unmet';
                tipHtml += `<div class="sat-demand"><span>${d.icon} ${d.text}</span><span class="${cls}">${d.met ? '\u2714' : '\u2718'}</span></div>`;
            }
            tipEl.innerHTML = tipHtml;
        }

        // Refresh build menu if open (event-driven, not per-frame)
        this._refreshBuildMenu();

        // Update resource tooltips
        this._updateResourceTooltips();
    },

    _updateResourceTooltips() {
        const resKeys = ['wood', 'stone', 'ironOre', 'goldOre', 'ironIngot', 'goldIngot', 'food', 'gold'];
        const resNames = CONFIG.RESOURCE_NAMES;

        // Compute production per cycle for each resource
        const prodPerCycle = {};
        for (const k of resKeys) prodPerCycle[k] = 0;

        const sat = this._satisfaction;
        let prodMultiplier = 1.0;
        if (sat >= 80) prodMultiplier = 1.10;
        else if (sat < 40 && sat >= 20) prodMultiplier = 0.90;

        // Track which buildings produce what
        const prodSources = {}; // res → [{name, amount}]
        for (const k of resKeys) prodSources[k] = [];

        for (const b of this.buildings) {
            const def = CONFIG.BUILDINGS[b.type];
            if (!def) continue;

            // Standard production
            if (def.production && b.familyIdx >= 0 && this.families[b.familyIdx]) {
                const fam = this.families[b.familyIdx];
                const childBonus = fam.hasChild ? 1.25 : 1.0;
                const lvl = b.level || 1;
                for (const [res, baseAmt] of Object.entries(def.production)) {
                    let amount = baseAmt;
                    if (lvl > 1 && def.upgrades) {
                        for (let u = 0; u < lvl - 1 && u < def.upgrades.length; u++) {
                            const bonus = def.upgrades[u].productionBonus;
                            if (bonus && bonus[res]) amount += bonus[res];
                        }
                    }
                    const finalAmt = Math.floor(amount * prodMultiplier * childBonus);
                    prodPerCycle[res] += finalAmt;
                    const childNote = fam.hasChild ? ' \u{1F476}' : '';
                    prodSources[res].push({ name: def.name + ' Niv.' + lvl + childNote, amount: finalAmt });
                }
            }

            // Mine production (estimated)
            if (b.type === 'mine' && b.familyIdx >= 0 && this.families[b.familyIdx]) {
                const lvl = b.level || 1;
                const rates = def.mineRates[lvl - 1];
                if (rates) {
                    const fam = this.families[b.familyIdx];
                    const childBonus = fam.hasChild ? 1.25 : 1.0;
                    const stoneAmt = Math.floor(rates.stone * prodMultiplier * childBonus);
                    prodPerCycle.stone += stoneAmt;
                    const childNote = fam.hasChild ? ' \u{1F476}' : '';
                    prodSources.stone.push({ name: 'Mine Niv.' + lvl + childNote, amount: stoneAmt });
                    const ironEst = Math.round(rates.ironOreChance * 100);
                    prodSources.ironOre.push({ name: 'Mine Niv.' + lvl + childNote, amount: ironEst + '% chance' });
                    const goldEst = Math.round(rates.goldOreChance * 100);
                    prodSources.goldOre.push({ name: 'Mine Niv.' + lvl + childNote, amount: goldEst + '% chance' });
                }
            }
        }

        // Food consumption
        let foodPerMeal = 0;
        let eatingFamilies = 0;
        for (const fam of this.families) {
            if (fam.onVoyage) continue;
            foodPerMeal += fam.hasChild ? 6 : 4;
            eatingFamilies++;
        }
        const foodPerDay = foodPerMeal * 2; // 2 meals at 12h and 20h

        // Food production per cycle
        const foodProdPerCycle = prodPerCycle.food || 0;
        const foodProdPerDay = foodProdPerCycle * 4; // 4 cycles/day

        // Storage caps
        const caps = {};
        for (const k of resKeys) caps[k] = this.getStorageCap(k);

        // Build tooltip HTML for each resource
        for (const key of resKeys) {
            const tipEl = document.getElementById('tooltip-' + key);
            if (!tipEl) continue;

            const name = resNames[key] || key;
            const val = this.resources[key] || 0;
            const cap = caps[key];
            let html = `<div style="color:var(--gold);font-family:Cinzel,serif;font-size:0.72rem;margin-bottom:4px;">${name}</div>`;
            html += `<div style="margin-bottom:3px;">Stock : ${val}${cap === Infinity ? '' : ' / ' + cap}</div>`;

            if (key === 'food') {
                html += `<div style="color:#a8d8a8;">Production : +${foodProdPerDay}/jour</div>`;
                for (const src of prodSources.food) {
                    html += `<div style="color:#8a7a5a;padding-left:8px;">- ${src.name} : +${src.amount}</div>`;
                }
                html += `<div style="color:#d8a888;margin-top:3px;">Consommation : -${foodPerDay}/jour</div>`;
                const childFamilies = this.families.filter(f => !f.onVoyage && f.hasChild).length;
                html += `<div style="color:#8a7a5a;padding-left:8px;">- ${eatingFamilies} famille(s)${childFamilies > 0 ? ` dont ${childFamilies} avec enfant` : ''}</div>`;
                const balance = foodProdPerDay - foodPerDay;
                const balColor = balance >= 0 ? '#a8d8a8' : '#d88888';
                html += `<div style="color:${balColor};margin-top:3px;font-weight:700;">Bilan/jour : ${balance >= 0 ? '+' : ''}${balance}</div>`;
            } else if (key === 'gold') {
                html += `<div style="color:#8a7a5a;">L'or s'obtient via le Comptoir</div>`;
            } else if (key === 'ironOre' || key === 'goldOre') {
                if (prodSources[key].length > 0) {
                    for (const src of prodSources[key]) {
                        html += `<div style="color:#a8c8d8;">- ${src.name} : ${src.amount}</div>`;
                    }
                } else {
                    html += `<div style="color:#8a7a5a;">Aucune mine active</div>`;
                }
            } else if (key === 'ironIngot' || key === 'goldIngot') {
                const foundries = this.buildings.filter(b => b.type === 'foundry').length;
                if (foundries > 0) {
                    html += `<div style="color:#a8c8d8;">${foundries} fonderie(s) active(s)</div>`;
                } else {
                    html += `<div style="color:#8a7a5a;">Aucune fonderie</div>`;
                }
            } else {
                // wood, stone
                const perCycle = prodPerCycle[key] || 0;
                const perDay = perCycle * 4;
                if (perDay > 0) {
                    html += `<div style="color:#a8d8a8;">Production : +${perDay}/jour</div>`;
                    for (const src of prodSources[key]) {
                        html += `<div style="color:#8a7a5a;padding-left:8px;">- ${src.name} : +${src.amount}</div>`;
                    }
                } else {
                    html += `<div style="color:#8a7a5a;">Aucune production</div>`;
                }
            }

            tipEl.innerHTML = html;
        }
    },

    // ==================== BUILD MENU ====================

    _buildBuildMenu() {
        const menu = document.getElementById('build-menu');
        menu.innerHTML = '';

        for (const [key, bld] of Object.entries(CONFIG.BUILDINGS)) {
            const item = document.createElement('div');
            item.className = 'build-item';
            item.dataset.type = key;

            const canAfford = this._canAfford(bld.cost);
            const alreadyBuilt = bld.unique && this.buildings.some(b => b.type === key);
            if (!canAfford || alreadyBuilt) item.classList.add('disabled');

            const costStr = alreadyBuilt ? 'Deja construit' :
                Object.entries(bld.cost).map(([r, v]) => `${v} ${CONFIG.RESOURCE_NAMES[r] || r}`).join(', ');
            const costColor = alreadyBuilt ? '#d88888' : '';

            item.innerHTML = `<span class="build-icon">${bld.icon}</span><span class="build-name">${bld.name}</span><span class="build-cost"${costColor ? ` style="color:${costColor}"` : ''}>${costStr}</span>`;

            item.addEventListener('click', () => {
                if (item.classList.contains('disabled')) return;
                this._selectBuild(key);
            });

            menu.appendChild(item);
        }
    },

    _toggleBuildMenu() {
        if (this._buildMode) {
            this._closeBuildMenu();
        } else {
            this._openBuildMenu();
        }
    },

    _openBuildMenu() {
        this._buildMode = true;
        this._selectedBuild = null;
        this._closeInfoPanel();
        this._closeBuildingDetail();
        // Always rebuild from scratch with current resource state
        this._buildBuildMenu();
        document.getElementById('build-menu').classList.add('active');
    },

    _closeBuildMenu() {
        this._buildMode = false;
        this._selectedBuild = null;
        document.getElementById('build-menu').classList.remove('active');
        document.getElementById('build-hint').classList.remove('active');
        document.getElementById('build-hint').textContent = '';
        Renderer.canvas.style.cursor = 'grab';
    },

    _refreshBuildMenu() {
        if (!this._buildMode) return;
        // Rebuild entirely to guarantee correct state
        const wasSelected = this._selectedBuild;
        this._buildBuildMenu();
        // Restore selected state
        if (wasSelected) {
            const menu = document.getElementById('build-menu');
            for (const item of menu.children) {
                if (item.dataset.type === wasSelected) {
                    item.classList.add('selected');
                }
            }
        }
    },

    _canAfford(cost) {
        for (const [res, amount] of Object.entries(cost)) {
            if ((this.resources[res] || 0) < amount) return false;
        }
        return true;
    },

    _selectBuild(type) {
        const bld = CONFIG.BUILDINGS[type];
        if (!this._canAfford(bld.cost)) return;
        if (bld.unique && this.buildings.some(b => b.type === type)) return;

        if (this._selectedBuild === type) {
            this._selectedBuild = null;
            document.getElementById('build-hint').classList.remove('active');
            Renderer.canvas.style.cursor = 'grab';
        } else {
            this._selectedBuild = type;
            let hint = `${bld.name} - Cliquez sur la carte pour placer`;
            if (bld.terrain) {
                const terrNames = bld.terrain.map(t => CONFIG.TERRAIN_NAMES[t]).join(', ');
                hint += ` (${terrNames} uniquement)`;
            }
            const hintEl = document.getElementById('build-hint');
            hintEl.textContent = hint;
            hintEl.classList.add('active');
            Renderer.canvas.style.cursor = 'crosshair';
        }
        this._refreshBuildMenu();
    },

    _placeBuilding(cellX, cellY) {
        const type = this._selectedBuild;
        if (!type) return;

        const bld = CONFIG.BUILDINGS[type];
        if (!this._canAfford(bld.cost)) return;

        const tile = GameMap.getTile(cellX, cellY);
        if (!tile) return;
        if (tile.terrain <= CONFIG.TERRAIN.WATER || tile.terrain >= CONFIG.TERRAIN.SNOW_PEAK) return;
        if (tile.building) return;
        if (bld.terrain && !bld.terrain.includes(tile.terrain)) return;
        if (tile.owner !== 0) return;

        // Check unique buildings (only 1 allowed)
        if (bld.unique && this.buildings.some(b => b.type === type)) {
            this._showNotification(`\u{26A0} Un seul ${bld.name} autorise !`, '#d8a888');
            return;
        }

        // Spend resources
        for (const [res, amount] of Object.entries(bld.cost)) {
            this.resources[res] -= amount;
        }

        // Place
        AudioManager.playBuild();
        tile.building = type;
        const buildingData = { type, x: cellX, y: cellY, level: 1, familyIdx: -1 };

        // Barracks uses familyIndices array for multi-family
        if (bld.multiFamily) {
            buildingData.familyIndices = [];
        }

        this.buildings.push(buildingData);

        if (type === 'house') {
            this._checkRecruitFamily();
        }

        Renderer._bufferDirty = true;
        this._updateHUD();
        this._refreshBuildMenu();
        this._closeBuildMenu();
    },

    // ==================== DEMOLITION ====================

    _demolishBuilding(bIdx) {
        const b = this.buildings[bIdx];
        if (!b) return;
        AudioManager.playDemolish();
        const def = CONFIG.BUILDINGS[b.type];

        // Unassign families
        if (b.familyIndices) {
            for (const fi of b.familyIndices) {
                if (this.families[fi]) {
                    this.families[fi].buildingIdx = -1;
                    this.families[fi].job = null;
                    this.families[fi].militaryType = null;
                    this.families[fi].training = null;
                }
            }
        } else if (b.familyIdx >= 0 && this.families[b.familyIdx]) {
            this.families[b.familyIdx].buildingIdx = -1;
            this.families[b.familyIdx].job = null;
        }

        // If house with family: family leaves, -15% satisfaction
        if (b.type === 'house' && b.familyIdx >= 0) {
            this._adjustSatisfaction(-15);
            this._showNotification(`\u{1F3E0} Maison detruite ! Famille partie, -15% satisfaction`, '#d88888');
        }

        // If house destroyed: cancel a pending family if we now exceed housing capacity
        if (b.type === 'house' && this._pendingFamilies && this._pendingFamilies.length > 0) {
            const maxFamAfterDemolish = this.getMaxFamilies() - 1; // -1 because the house hasn't been removed yet
            const totalOccupied = this.families.length + this._pendingFamilies.length;
            if (totalOccupied > maxFamAfterDemolish) {
                const cancelled = this._pendingFamilies.pop();
                this._showNotification(`\u{1F6AB} ${cancelled.family.name} ne viendra plus (maison detruite)`, '#d8a888');
            }
        }

        // Refund 50% of costs
        if (def && def.cost) {
            for (const [res, amount] of Object.entries(def.cost)) {
                this._addResource(res, Math.floor(amount * CONFIG.DEMOLITION_REFUND));
            }
        }

        // Clear tile
        const tile = GameMap.getTile(b.x, b.y);
        if (tile) tile.building = null;

        // Remove building and fix indices
        this.buildings.splice(bIdx, 1);
        for (let i = 0; i < this.families.length; i++) {
            if (this.families[i].buildingIdx === bIdx) this.families[i].buildingIdx = -1;
            else if (this.families[i].buildingIdx > bIdx) this.families[i].buildingIdx--;
        }

        Renderer._bufferDirty = true;
        this._updateHUD();
        this._closeBuildingDetail();
    },

    _checkRecruitFamily() {
        const maxFam = this.getMaxFamilies();
        const totalOccupied = this.families.length + (this._pendingFamilies ? this._pendingFamilies.length : 0);
        if (totalOccupied < maxFam) {
            // Queue a family with arrival time based on satisfaction
            const sat = this._getSatisfaction();
            let delayHours;
            if (sat > 75)       delayHours = 12;  // half a day
            else if (sat > 50)  delayHours = 24;  // 1 day
            else if (sat > 25)  delayHours = 36;  // 1.5 days
            else                delayHours = 48;  // 2 days

            const currentGameHours = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
            this._pendingFamilies.push({
                arrivalGameHours: currentGameHours + delayHours,
                family: this._generateFamily()
            });
        }
        this._updateHUD();
    },

    // ==================== SATISFACTION SYSTEM (event-based, persistent) ====================

    _getSatisfaction() {
        return Math.max(0, Math.min(100, Math.round(this._satisfaction)));
    },

    _getSatisfactionState() {
        const sat = this._getSatisfaction();
        if (sat >= 80) return { label: 'Eleve', color: '#a8d8a8', bonus: '+10% production' };
        if (sat >= 40) return { label: 'Normal', color: '#e8d48a', bonus: 'Aucun modificateur' };
        if (sat >= 20) return { label: 'Bas', color: '#d8a888', bonus: '-10% production' };
        return { label: 'Critique', color: '#d88888', bonus: 'Familles quittent le village' };
    },

    _dailySatisfactionUpdate() {
        // Natural recovery toward 60 if all families are fed
        if (this._satisfaction < 60 && this.resources.food > 0) {
            this._satisfaction = Math.min(60, this._satisfaction + 3);
        }
        // Barracks bonus: +1 per active barracks
        const hasBarracks = this.buildings.some(b => b.type === 'barracks' && b.familyIndices && b.familyIndices.length > 0);
        if (hasBarracks) this._adjustSatisfaction(1);
    },

    _getSatisfactionDemands() {
        const demands = [];
        const foodOk = (this.resources.food || 0) > 0;
        demands.push({ icon: '\u{1F35E}', text: foodOk ? 'Familles nourries' : 'Nourriture insuffisante', met: foodOk });

        const hasFarm = this.buildings.some(b => b.type === 'farm' && b.familyIdx >= 0);
        demands.push({ icon: '\u{1F33E}', text: hasFarm ? 'Ferme active' : 'Ferme necessaire', met: hasFarm });

        const hasBarracks = this.buildings.some(b => b.type === 'barracks' && b.familyIndices && b.familyIndices.length > 0);
        demands.push({ icon: '\u{2694}', text: hasBarracks ? 'Armee active' : 'Pas de defense', met: hasBarracks });

        const state = this._getSatisfactionState();
        demands.push({ icon: '\u{2764}', text: `Etat: ${state.label} (${state.bonus})`, met: this._satisfaction >= 40 });

        return demands;
    },

    // ==================== INFO PANEL (castle click) ====================

    _openInfoPanel() {
        this._infoPanelOpen = true;
        this._closeBuildMenu();
        this._closeBuildingDetail();
        document.getElementById('info-panel').classList.add('active');
        this._renderInfoContent();
    },

    _closeInfoPanel() {
        this._infoPanelOpen = false;
        document.getElementById('info-panel').classList.remove('active');
    },

    _renderInfoContent() {
        const content = document.getElementById('info-content');
        if (this._infoTab === 'buildings') {
            this._renderBuildingsTab(content);
        } else {
            this._renderFamiliesTab(content);
        }
    },

    _renderBuildingsTab(container) {
        const counts = {};
        for (const b of this.buildings) {
            counts[b.type] = (counts[b.type] || 0) + 1;
        }

        let html = '';
        html += `<div class="info-building-row"><span class="ib-icon">\u{1F3F0}</span><span class="ib-name">Chateau (Cabane de base)</span><span class="ib-count">1</span></div>`;

        for (const [key, bld] of Object.entries(CONFIG.BUILDINGS)) {
            const count = counts[key] || 0;
            html += `<div class="info-building-row"><span class="ib-icon">${bld.icon}</span><span class="ib-name">${bld.name}</span><span class="ib-count">${count}</span></div>`;
        }

        const warehouseCount = this.buildings.filter(b => b.type === 'warehouse').length;
        html += `<div class="info-building-row" style="margin-top:8px;border-top:1px solid rgba(200,168,74,0.2);padding-top:8px;"><span class="ib-icon">\u{1F4E6}</span><span class="ib-name">Entrepots</span><span class="ib-count">${warehouseCount}</span></div>`;

        if (this.buildings.length === 0) {
            html += `<div class="info-empty">Aucune construction supplementaire.<br>Appuyez sur B pour construire.</div>`;
        }

        container.innerHTML = html;
    },

    _renderFamiliesTab(container) {
        if (this.families.length === 0) {
            container.innerHTML = '<div class="info-empty">Aucune famille dans le royaume.</div>';
            return;
        }

        let html = '';
        for (let i = 0; i < this.families.length; i++) {
            const fam = this.families[i];
            const assignedTo = fam.buildingIdx >= 0 ? this.buildings[fam.buildingIdx] : null;
            const jobName = assignedTo ? CONFIG.BUILDINGS[assignedTo.type].job || 'Habitant' : 'Sans emploi';
            const buildName = assignedTo ? CONFIG.BUILDINGS[assignedTo.type].name : '';

            const childStr = fam.hasChild ? '<div class="info-family-members" style="color:#a8c8d8;">\u{1F476} Enfant (+25% production, conso x1.5)</div>' : '';
            html += `<div class="info-family-row">
                <div>
                    <div class="info-family-name">${fam.name}</div>
                    <div class="info-family-members">${fam.man} & ${fam.woman}</div>
                    ${childStr}
                    <div class="info-family-members" style="color:${assignedTo ? '#c8a84a' : '#6a5a3a'}">${jobName}${buildName ? ' - ' + buildName : ''}</div>
                </div>
            </div>`;
        }

        container.innerHTML = html;
    },

    _getAvailableJobs() {
        const jobs = [];
        const buildCounts = {};
        for (const b of this.buildings) {
            buildCounts[b.type] = (buildCounts[b.type] || 0) + 1;
        }

        for (const [key, bld] of Object.entries(CONFIG.BUILDINGS)) {
            const totalSlots = buildCounts[key] || 0;
            const assigned = this.families.filter(f => f.job === key).length;
            if (totalSlots > 0) {
                jobs.push({
                    type: key,
                    name: bld.job,
                    slots: totalSlots,
                    assigned
                });
            }
        }
        return jobs;
    },

    _buildJobOptions(currentJob, availableJobs) {
        let html = '';
        for (const job of availableJobs) {
            const isCurrent = currentJob === job.type;
            const freeSlots = job.slots - job.assigned + (isCurrent ? 1 : 0);
            const disabled = freeSlots <= 0 && !isCurrent;
            html += `<option value="${job.type}"${isCurrent ? ' selected' : ''}${disabled ? ' disabled' : ''}>${job.name} (${job.assigned}/${job.slots})</option>`;
        }
        return html;
    },

    // ==================== BUILDING DETAIL PANEL ====================

    _openBuildingDetail(buildingIdx) {
        AudioManager.playClick();
        this._selectedBuilding = buildingIdx;
        this._closeBuildMenu();
        this._closeInfoPanel();
        document.getElementById('building-detail').classList.add('active');
        this._renderBuildingDetail();
    },

    _closeBuildingDetail() {
        this._selectedBuilding = null;
        document.getElementById('building-detail').classList.remove('active');
    },

    _renderBuildingDetail() {
        const panel = document.getElementById('building-detail');
        const content = document.getElementById('building-detail-content');
        const titleEl = document.getElementById('building-detail-title');

        if (this._selectedBuilding === 'castle') {
            titleEl.textContent = '\u{1F3F0} Vue du Royaume';
            let html = '';

            // === GENERAL ===
            html += `<div class="bd-category"><div class="bd-category-title">Etat du Royaume</div>`;
            html += `<div style="display:flex;justify-content:space-between;padding:4px 8px;"><span class="bd-label">Jour</span><span class="bd-value">${this._gameDay}</span></div>`;
            html += `<div style="display:flex;justify-content:space-between;padding:4px 8px;"><span class="bd-label">Region</span><span class="bd-value">${this._getQuadrantName(this._castlePlaced.x, this._castlePlaced.y)}</span></div>`;
            html += `</div>`;

            // === SATISFACTION ===
            const sat = this._getSatisfaction();
            const satColor = sat > 75 ? '#a8d8a8' : sat > 50 ? '#e8d48a' : sat > 25 ? '#d8a888' : '#d88888';
            html += `<div class="bd-category"><div class="bd-category-title">Satisfaction</div>`;
            html += `<div style="display:flex;justify-content:space-between;padding:4px 8px;"><span class="bd-label">Niveau</span><span class="bd-value" style="color:${satColor};font-weight:700;">${sat}%</span></div>`;
            const demands = this._getSatisfactionDemands();
            for (const d of demands) {
                html += `<div style="display:flex;justify-content:space-between;padding:2px 8px;"><span style="color:#8a7a5a;font-size:0.78rem;">${d.icon} ${d.text}</span><span style="color:${d.met ? '#a8d8a8' : '#d88888'};font-size:0.78rem;">${d.met ? '\u2714' : '\u2718'}</span></div>`;
            }
            html += `</div>`;

            // === POPULATION ===
            html += `<div class="bd-category"><div class="bd-category-title">Population (${this.families.length}/${this.getMaxFamilies()})</div>`;
            const idleFamilies = this.families.filter(f => f.buildingIdx < 0).length;
            if (idleFamilies > 0) {
                html += `<div style="padding:3px 8px;color:#d8a8a8;font-size:0.78rem;">\u{26A0} ${idleFamilies} famille(s) sans emploi</div>`;
            }
            if (this._pendingFamilies && this._pendingFamilies.length > 0) {
                html += `<div style="padding:3px 8px;color:#a8c8d8;font-size:0.78rem;">\u{1F6B6} ${this._pendingFamilies.length} famille(s) en route</div>`;
            }
            for (let i = 0; i < this.families.length; i++) {
                const fam = this.families[i];
                const assigned = fam.buildingIdx >= 0 ? this.buildings[fam.buildingIdx] : null;
                const jobStr = assigned ? CONFIG.BUILDINGS[assigned.type].job : 'Sans emploi';
                const jobColor = assigned ? '#a8d8a8' : '#d8a8a8';
                html += `<div class="bd-castle-family" style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;border-bottom:1px solid rgba(200,168,74,0.06);">`;
                const childTag = fam.hasChild ? ' <span style="color:#a8c8d8;font-size:0.68rem;">\u{1F476}+25%</span>' : '';
                html += `<div><div style="color:var(--parchment);font-size:0.78rem;">${fam.name}${childTag}</div><div style="color:#6a5a3a;font-size:0.68rem;">${fam.man} & ${fam.woman}</div></div>`;
                html += `<span style="color:${jobColor};font-size:0.72rem;font-family:Cinzel,serif;">${jobStr}</span>`;
                html += `</div>`;
            }
            html += `</div>`;

            // === CONSTRUCTIONS (clickable, sorted alphabetically) ===
            html += `<div class="bd-category"><div class="bd-category-title">Constructions (${this.buildings.length})</div>`;
            if (this.buildings.length === 0) {
                html += `<div style="padding:8px;color:#6a5a3a;font-size:0.78rem;font-style:italic;text-align:center;">Aucune construction. Appuyez sur B.</div>`;
            } else {
                // Sort indices alphabetically by building name
                const sortedIndices = this.buildings.map((_, i) => i).sort((a, b) => {
                    const nameA = (CONFIG.BUILDINGS[this.buildings[a].type] || {}).name || '';
                    const nameB = (CONFIG.BUILDINGS[this.buildings[b].type] || {}).name || '';
                    return nameA.localeCompare(nameB);
                });
                for (const i of sortedIndices) {
                    const b = this.buildings[i];
                    const def = CONFIG.BUILDINGS[b.type];
                    if (!def) continue;
                    const lvl = b.level || 1;
                    const hasFam = b.familyIdx >= 0;
                    const statusColor = !def.job ? '#8a7a5a' : (hasFam ? '#a8d8a8' : '#d8a8a8');
                    const statusText = !def.job ? '' : (hasFam ? 'Actif' : 'Inactif');
                    html += `<div class="bd-castle-building" data-bidx="${i}" style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-bottom:1px solid rgba(200,168,74,0.06);cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='rgba(200,168,74,0.08)'" onmouseout="this.style.background='transparent'">`;
                    html += `<div><span style="font-size:1rem;">${def.icon}</span> <span style="color:var(--parchment);font-size:0.78rem;">${def.name}</span><span style="color:var(--gold);font-size:0.72rem;margin-left:4px;">Niv.${lvl}</span></div>`;
                    html += `<div style="display:flex;align-items:center;gap:6px;">`;
                    if (statusText) html += `<span style="color:${statusColor};font-size:0.68rem;">${statusText}</span>`;
                    html += `<span style="color:var(--gold-dark);font-size:0.72rem;" title="Teleporter">\u{1F4CD}</span>`;
                    html += `</div></div>`;
                }
            }
            html += `</div>`;

            content.innerHTML = html;

            // Bind click events on buildings to teleport camera
            content.querySelectorAll('.bd-castle-building').forEach(el => {
                el.addEventListener('click', () => {
                    const bIdx = parseInt(el.dataset.bidx);
                    const b = this.buildings[bIdx];
                    if (b) {
                        Camera.centerOnCell(b.x, b.y);
                        this._closeBuildingDetail();
                        this._openBuildingDetail(bIdx);
                    }
                });
            });

            return;
        }

        const bIdx = this._selectedBuilding;
        if (bIdx === null || bIdx < 0 || bIdx >= this.buildings.length) return;

        const b = this.buildings[bIdx];
        const def = CONFIG.BUILDINGS[b.type];
        if (!def) return;

        const lvl = b.level || 1;
        titleEl.textContent = `${def.icon} ${def.name} (Niv. ${lvl})`;

        let html = '';

        // Description
        html += `<div class="bd-section"><div class="bd-label">Description</div><div class="bd-value">${def.description}</div></div>`;

        // Production info (standard: lumberjack, farm)
        if (def.production) {
            const totalProd = { ...def.production };
            if (lvl > 1 && def.upgrades) {
                for (let u = 0; u < lvl - 1 && u < def.upgrades.length; u++) {
                    const bonus = def.upgrades[u].productionBonus;
                    if (bonus) {
                        for (const [r, a] of Object.entries(bonus)) {
                            totalProd[r] = (totalProd[r] || 0) + a;
                        }
                    }
                }
            }
            const prodStr = Object.entries(totalProd).map(([r, a]) => `+${a} ${CONFIG.RESOURCE_NAMES[r] || r}`).join(', ');
            const isActive = b.familyIdx >= 0;
            html += `<div class="bd-section"><div class="bd-label">Production (par cycle)</div><div class="bd-value" style="color:${isActive ? '#a8d8a8' : '#d8a8a8'}">${prodStr}${isActive ? '' : ' (INACTIVE - pas de famille)'}</div></div>`;
        }

        // Special: mine rates
        if (b.type === 'mine') {
            const rates = def.mineRates[lvl - 1];
            if (rates) {
                const isActive = b.familyIdx >= 0;
                html += `<div class="bd-section"><div class="bd-label">Production (par cycle)</div>`;
                html += `<div class="bd-value" style="color:${isActive ? '#a8d8a8' : '#d8a8a8'}">`;
                html += `+${rates.stone} Pierre (garanti)<br>`;
                html += `Min. Fer: ${Math.round(rates.ironOreChance * 100)}% chance<br>`;
                html += `Min. Or: ${Math.round(rates.goldOreChance * 100)}% chance`;
                html += `${isActive ? '' : '<br>(INACTIVE - pas de famille)'}`;
                html += `</div></div>`;
            }
        }

        // Special: foundry conversion rates
        if (b.type === 'foundry') {
            const rates = def.foundryRates[lvl - 1];
            if (rates) {
                html += `<div class="bd-section"><div class="bd-label">Conversion (par cycle)</div>`;
                html += `<div class="bd-value" style="color:#a8c8d8;">`;
                const isActive = b.familyIdx >= 0;
                html += `<span style="color:${isActive ? '#a8d8a8' : '#d8a8a8'};">${rates.oreNeeded} minerai \u2192 ${rates.ingotProduced} lingot(s)</span><br>`;
                html += `<span style="font-size:0.75rem;color:${isActive ? '#8a7a5a' : '#d8a8a8'};">${isActive ? 'En fonctionnement' : 'INACTIVE - pas de famille assignee'}</span>`;
                html += `</div></div>`;
            }
        }

        // Special: warehouse per-resource caps
        if (b.type === 'warehouse') {
            const bonus = CONFIG.STORAGE.WAREHOUSE_BONUS[lvl - 1];
            if (bonus) {
                html += `<div class="bd-section"><div class="bd-label">Bonus stockage (ce niveau)</div>`;
                html += `<div class="bd-value" style="color:#a8c8d8;">`;
                for (const [res, amt] of Object.entries(bonus)) {
                    html += `+${amt} ${CONFIG.RESOURCE_NAMES[res] || res}<br>`;
                }
                html += `</div></div>`;
            }
        }

        // Special: house info
        if (b.type === 'house') {
            const assignedFam = b.familyIdx >= 0 ? this.families[b.familyIdx] : null;
            const hasChild = assignedFam && assignedFam.hasChild;
            html += `<div class="bd-section"><div class="bd-label">Logement</div>`;
            if (assignedFam) {
                html += `<div class="bd-value" style="color:#a8d8a8;">${assignedFam.name}</div>`;
                html += `<div class="bd-value" style="font-size:0.75rem;color:#8a7a5a;">${assignedFam.man} & ${assignedFam.woman}</div>`;
                if (hasChild) {
                    html += `<div class="bd-value" style="font-size:0.75rem;color:#a8c8d8;">+ enfant (+25% prod, conso x1.5)</div>`;
                }
                // Show family job
                const jobBuilding = assignedFam.buildingIdx >= 0 ? this.buildings[assignedFam.buildingIdx] : null;
                if (jobBuilding && jobBuilding !== b) {
                    const jobDef = CONFIG.BUILDINGS[jobBuilding.type];
                    html += `<div class="bd-value" style="font-size:0.75rem;color:var(--gold);">Travail : ${jobDef ? jobDef.job || jobDef.name : 'Inconnu'}</div>`;
                } else {
                    html += `<div class="bd-value" style="font-size:0.75rem;color:#d8a8a8;">Sans emploi</div>`;
                }
            } else {
                // Check if a pending family is destined for this house
                const houseIdx = bIdx;
                const emptyHouses = this.buildings.filter((bb, i) => bb.type === 'house' && bb.familyIdx < 0).map((bb, i) => this.buildings.indexOf(bb));
                const emptyHouseRank = emptyHouses.indexOf(houseIdx);
                const pendingCount = this._pendingFamilies ? this._pendingFamilies.length : 0;
                if (emptyHouseRank >= 0 && emptyHouseRank < pendingCount) {
                    const pending = this._pendingFamilies[emptyHouseRank];
                    const currentGH = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
                    html += `<div class="bd-value" style="color:#a8c8d8;">${pending.family.name} en route (Arrivee : ${this._formatGameHours(pending.arrivalGameHours)})</div>`;
                } else {
                    html += `<div class="bd-value" style="color:#6a5a3a;">Vide - aucune famille logee</div>`;
                }
            }
            html += `</div>`;
        }

        // === Family assignment (single-family buildings) ===
        if (def.job && !def.multiFamily) {
            const assignedFam = b.familyIdx >= 0 ? this.families[b.familyIdx] : null;
            html += `<div class="bd-section"><div class="bd-label">Famille assignee</div>`;
            html += `<select class="bd-family-select" id="bd-family-select">`;
            html += `<option value="-1"${!assignedFam ? ' selected' : ''}>Aucune</option>`;
            for (let i = 0; i < this.families.length; i++) {
                const f = this.families[i];
                const isFree = f.buildingIdx < 0 || f.buildingIdx === bIdx;
                if (!isFree) continue;
                html += `<option value="${i}"${b.familyIdx === i ? ' selected' : ''}>${f.name}</option>`;
            }
            html += `</select></div>`;
        }


        // === Multi-family building (barracks) — elaborate menu ===
        if (def.multiFamily && b.familyIndices) {
            const _milTypeStr = (t) => t === 'soldier' ? 'Soldat' : t === 'archer' ? 'Archer' : t === 'cavalier' ? 'Cavalier' : 'Non assigne';
            const _weaponStr = (w) => w === 'simpleWeapon' ? 'Arme simple' : w === 'heavyWeapon' ? 'Arme lourde' : 'Aucune';
            const _mountStr = (m) => m === 'cow' ? 'Vache' : m === 'horse' ? 'Cheval' : m === 'chariot' ? 'Chariot' : 'Aucune';

            // ── 1. Vue d'ensemble ──
            const army = this._getPlayerArmyStrength();
            html += `<div class="bd-category bd-category-military"><div class="bd-category-title">⚔ Armee — Vue d'ensemble</div>`;
            html += `<div style="padding:4px 8px;font-size:0.78rem;color:var(--parchment);">Effectifs : ${army.soldiers}S / ${army.archers}A / ${army.cavaliers}C</div>`;
            html += `<div style="padding:2px 8px;font-size:0.78rem;color:var(--gold);">Force totale : ${army.strength}</div>`;
            const inv = this.inventory || {};
            const equipList = [];
            if (inv.simpleWeapon) equipList.push(`${inv.simpleWeapon} arme(s) simple(s)`);
            if (inv.heavyWeapon) equipList.push(`${inv.heavyWeapon} arme(s) lourde(s)`);
            if (inv.cow) equipList.push(`${inv.cow} vache(s)`);
            if (inv.horse) equipList.push(`${inv.horse} cheval(aux)`);
            if (inv.chariot) equipList.push(`${inv.chariot} chariot(s)`);
            html += `<div style="padding:2px 8px;font-size:0.72rem;color:#8a7a5a;">Stock : ${equipList.length > 0 ? equipList.join(', ') : 'Aucun equipement'}</div>`;
            html += `</div>`;

            // ── 2. Familles assignees ──
            html += `<div class="bd-category bd-category-military"><div class="bd-category-title">🛡 Familles assignees (${b.familyIndices.length})</div>`;
            for (const fi of b.familyIndices) {
                const fam = this.families[fi];
                if (!fam) continue;
                const typeStr = _milTypeStr(fam.militaryType);
                const isTraining = fam.training && fam.training.cyclesLeft > 0;
                const hasPending = fam.training && fam.training.pendingPoints > 0;
                let statusTag = '';
                if (isTraining && fam.training.endGameHours) {
                    statusTag = ` <span style="color:#a8c8d8;font-size:0.68rem;">(Fin : ${this._formatGameHours(fam.training.endGameHours)})</span>`;
                } else if (isTraining) {
                    statusTag = ` <span style="color:#a8c8d8;font-size:0.68rem;">(${fam.training.cyclesLeft} cycles)</span>`;
                } else if (hasPending) {
                    statusTag = ` <span style="color:var(--gold);font-size:0.68rem;">(${fam.training.pendingPoints} pts)</span>`;
                }
                const weaponTag = fam.weapon ? ` 🗡${_weaponStr(fam.weapon)}` : '';
                const mountTag = fam.mount ? ` 🐎${_mountStr(fam.mount)}` : '';

                html += `<div style="padding:6px 0;border-bottom:1px solid rgba(200,168,74,0.1);">`;
                html += `<div style="display:flex;justify-content:space-between;align-items:center;">`;
                html += `<span style="font-size:0.78rem;color:var(--parchment);">${fam.name} — ${typeStr}${statusTag}</span>`;
                html += `<button class="bd-barracks-remove" data-fi="${fi}" style="background:none;border:1px solid #d88888;color:#d88888;padding:2px 6px;font-size:0.68rem;cursor:pointer;border-radius:3px;">Retirer</button>`;
                html += `</div>`;
                html += `<div style="display:flex;gap:8px;margin-top:3px;font-size:0.72rem;">`;
                html += `<span style="color:#a8c8d8;">Esq: ${fam.stats.esquive}</span>`;
                html += `<span style="color:#d8a888;">For: ${fam.stats.force}</span>`;
                html += `<span style="color:#a8d8a8;">Def: ${fam.stats.defense}</span>`;
                const totalStats = fam.stats.esquive + fam.stats.force + fam.stats.defense;
                html += `<span style="color:#6a5a3a;">(Total: ${totalStats})</span>`;
                html += `</div>`;
                if (weaponTag || mountTag) {
                    html += `<div style="font-size:0.68rem;color:#a8a0d8;margin-top:2px;">${weaponTag}${mountTag}</div>`;
                }
                if (hasPending) {
                    html += `<div style="margin-top:4px;padding:4px 6px;background:rgba(168,200,216,0.1);border-radius:4px;">`;
                    html += `<div style="font-size:0.72rem;color:var(--gold);margin-bottom:3px;">${fam.training.pendingPoints} point(s) a distribuer</div>`;
                    html += `<div style="display:flex;gap:4px;align-items:center;">`;
                    html += `<button class="bd-dist-btn" data-fi="${fi}" data-stat="esquive" style="flex:1;padding:3px;font-size:0.68rem;background:rgba(168,200,216,0.2);border:1px solid #a8c8d8;color:#a8c8d8;border-radius:3px;cursor:pointer;">+1 Esq</button>`;
                    html += `<button class="bd-dist-btn" data-fi="${fi}" data-stat="force" style="flex:1;padding:3px;font-size:0.68rem;background:rgba(216,168,136,0.2);border:1px solid #d8a888;color:#d8a888;border-radius:3px;cursor:pointer;">+1 For</button>`;
                    html += `<button class="bd-dist-btn" data-fi="${fi}" data-stat="defense" style="flex:1;padding:3px;font-size:0.68rem;background:rgba(168,216,168,0.2);border:1px solid #a8d8a8;color:#a8d8a8;border-radius:3px;cursor:pointer;">+1 Def</button>`;
                    html += `</div></div>`;
                }
                html += `</div>`;
            }
            // Add family selector
            const freeFamilies = this.families.filter((f, i) => f.buildingIdx < 0 && !f.onVoyage);
            if (freeFamilies.length > 0) {
                html += `<div style="margin-top:6px;">`;
                html += `<select class="bd-family-select" id="bd-barracks-add" style="width:65%;display:inline-block;">`;
                html += `<option value="-1">Ajouter une famille...</option>`;
                for (let i = 0; i < this.families.length; i++) {
                    if (this.families[i].buildingIdx < 0 && !this.families[i].onVoyage) {
                        html += `<option value="${i}">${this.families[i].name}</option>`;
                    }
                }
                html += `</select>`;
                html += ` <select class="bd-family-select" id="bd-barracks-type" style="width:30%;display:inline-block;">`;
                html += `<option value="soldier">Soldat</option>`;
                html += `<option value="archer">Archer</option>`;
                html += `<option value="cavalier">Cavalier</option>`;
                html += `</select>`;
                html += `</div>`;
            }
            html += `</div>`;

            // ── 3. Entrainement ──
            html += `<div class="bd-category bd-category-military"><div class="bd-category-title">🏋 Entrainement</div>`;
            if (b.familyIndices.length > 0) {
                const untrained = b.familyIndices.filter(fi => {
                    const f = this.families[fi];
                    return f && f.militaryType && (!f.training || (f.training.cyclesLeft <= 0 && !f.training.pendingPoints));
                });
                if (untrained.length > 0) {
                    html += `<div style="margin-top:4px;">`;
                    html += `<select class="bd-family-select" id="bd-train-select" style="width:58%;display:inline-block;">`;
                    for (const fi of untrained) {
                        const f = this.families[fi];
                        html += `<option value="${fi}">${f.name} (${_milTypeStr(f.militaryType)})</option>`;
                    }
                    html += `</select>`;
                    html += ` <button class="bd-upgrade-btn" id="bd-train-btn" style="width:38%;display:inline-block;padding:4px 8px;font-size:0.72rem;">Entrainer</button>`;
                    html += `</div>`;
                    html += `<div style="font-size:0.68rem;color:#8a7a5a;margin-top:4px;">`;
                    html += `Soldat: 8 🍞 + 10 🪙 (4 cycles) | Archer: 10 🍞 + 15 🪙 (6 cycles) | Cavalier: 12 🍞 + 25 🪙 (8 cycles)`;
                    html += `</div>`;
                } else {
                    html += `<div style="font-size:0.72rem;color:#6a5a3a;padding:4px 0;">Toutes les familles sont en entrainement ou en attente de distribution.</div>`;
                }
                // Currently training
                const inTraining = b.familyIndices.filter(fi => {
                    const f = this.families[fi];
                    return f && f.training && f.training.cyclesLeft > 0;
                });
                if (inTraining.length > 0) {
                    html += `<div style="margin-top:6px;border-top:1px solid rgba(200,168,74,0.1);padding-top:4px;">`;
                    html += `<div style="font-size:0.72rem;color:var(--gold);margin-bottom:3px;">En cours :</div>`;
                    for (const fi of inTraining) {
                        const f = this.families[fi];
                        const endStr = f.training.endGameHours ? this._formatGameHours(f.training.endGameHours) : `${f.training.cyclesLeft} cycles`;
                        html += `<div style="font-size:0.72rem;color:#a8c8d8;padding:1px 0;">⚔ ${f.name} — Fin : ${endStr}</div>`;
                    }
                    html += `</div>`;
                }
            } else {
                html += `<div style="font-size:0.72rem;color:#6a5a3a;padding:4px 0;">Assignez des familles pour les entrainer.</div>`;
            }
            html += `</div>`;

            // ── 4. Equipement ──
            html += `<div class="bd-category bd-category-military"><div class="bd-category-title">🛡 Equipement</div>`;
            const equipableFamilies = b.familyIndices.filter(fi => {
                const f = this.families[fi];
                return f && f.militaryType && !(f.training && f.training.cyclesLeft > 0) && !f.onVoyage;
            });
            if (equipableFamilies.length > 0) {
                for (const fi of equipableFamilies) {
                    const fam = this.families[fi];
                    html += `<div style="padding:5px 0;border-bottom:1px solid rgba(200,168,74,0.06);">`;
                    html += `<div style="font-size:0.78rem;color:var(--parchment);margin-bottom:3px;">${fam.name} (${_milTypeStr(fam.militaryType)})</div>`;

                    // Weapon row
                    const compatWeapon = fam.militaryType === 'cavalier' ? 'heavyWeapon' : 'simpleWeapon';
                    const compatWeaponName = compatWeapon === 'simpleWeapon' ? 'Arme simple' : 'Arme lourde';
                    const hasWeapon = !!fam.weapon;
                    const weaponStock = (this.inventory[compatWeapon] || 0);
                    html += `<div style="display:flex;align-items:center;gap:4px;margin:2px 0;">`;
                    html += `<span style="font-size:0.72rem;color:#8a7a5a;width:45%;">🗡 ${hasWeapon ? _weaponStr(fam.weapon) : 'Aucune'}</span>`;
                    if (hasWeapon) {
                        html += `<button class="bd-unequip-btn" data-fi="${fi}" data-slot="weapon" style="flex:1;padding:2px 4px;font-size:0.68rem;background:none;border:1px solid #d88888;color:#d88888;border-radius:3px;cursor:pointer;">Retirer</button>`;
                    } else if (weaponStock > 0) {
                        html += `<button class="bd-equip-btn" data-fi="${fi}" data-slot="weapon" data-item="${compatWeapon}" style="flex:1;padding:2px 4px;font-size:0.68rem;background:none;border:1px solid #a8d8a8;color:#a8d8a8;border-radius:3px;cursor:pointer;">Equiper ${compatWeaponName} (${weaponStock})</button>`;
                    } else {
                        html += `<span style="flex:1;font-size:0.68rem;color:#6a5a3a;">Stock vide</span>`;
                    }
                    html += `</div>`;

                    // Mount row
                    const hasMount = !!fam.mount;
                    html += `<div style="display:flex;align-items:center;gap:4px;margin:2px 0;">`;
                    html += `<span style="font-size:0.72rem;color:#8a7a5a;width:45%;">🐎 ${hasMount ? _mountStr(fam.mount) : 'Aucune'}</span>`;
                    if (hasMount) {
                        html += `<button class="bd-unequip-btn" data-fi="${fi}" data-slot="mount" style="flex:1;padding:2px 4px;font-size:0.68rem;background:none;border:1px solid #d88888;color:#d88888;border-radius:3px;cursor:pointer;">Retirer</button>`;
                    } else {
                        const mountOptions = ['cow', 'horse', 'chariot'].filter(m => (this.inventory[m] || 0) > 0);
                        if (mountOptions.length > 0) {
                            html += `<select class="bd-family-select bd-mount-select" data-fi="${fi}" style="flex:1;font-size:0.68rem;">`;
                            for (const m of mountOptions) {
                                html += `<option value="${m}">${_mountStr(m)} (${this.inventory[m]})</option>`;
                            }
                            html += `</select>`;
                            html += `<button class="bd-equip-mount-btn" data-fi="${fi}" style="padding:2px 6px;font-size:0.68rem;background:none;border:1px solid #a8d8a8;color:#a8d8a8;border-radius:3px;cursor:pointer;">OK</button>`;
                        } else {
                            html += `<span style="flex:1;font-size:0.68rem;color:#6a5a3a;">Stock vide</span>`;
                        }
                    }
                    html += `</div>`;
                    html += `</div>`;
                }
            } else {
                html += `<div style="font-size:0.72rem;color:#6a5a3a;padding:4px 0;">Aucune famille equipable (en entrainement ou en voyage).</div>`;
            }
            html += `</div>`;

            // ── 5. Reconnaissance ──
            const enemies = this._getEnemyKingdoms();
            if (enemies.length > 0) {
                html += `<div class="bd-category bd-category-military"><div class="bd-category-title">👁 Reconnaissance</div>`;
                const scoutCandidates = this.families.filter((f, i) => f.buildingIdx < 0 && !f.onVoyage);
                if (this._activeScouts && this._activeScouts.length > 0) {
                    for (const s of this._activeScouts) {
                        const fam = this.families[s.familyIdx];
                        const target = GameMap.regions.find(r => r.owner === s.targetOwner);
                        html += `<div style="font-size:0.72rem;color:#a8c8d8;padding:2px 0;">👁 ${fam ? fam.name : '?'} → ${target ? target.name : '?'} (Retour : ${this._formatGameHours(s.returnGameHours)})</div>`;
                    }
                }
                for (const enemy of enemies) {
                    const intel = this._scoutedIntel[enemy.owner];
                    if (intel) {
                        html += `<div style="padding:4px 6px;margin:3px 0;background:rgba(168,200,216,0.08);border-radius:4px;font-size:0.72rem;">`;
                        html += `<div style="color:${enemy.color || 'var(--gold)'};font-weight:700;">${enemy.name}</div>`;
                        html += `<div style="color:#a8c8d8;">${intel.soldiers} soldats, ${intel.archers} archers, ${intel.cavaliers} cavaliers</div>`;
                        html += `<div style="color:var(--gold-dark);">Force : ${intel.strength} (renseigne Jour ${intel.day})</div>`;
                        html += `</div>`;
                    }
                }
                if (scoutCandidates.length > 0) {
                    html += `<div style="margin-top:4px;display:flex;gap:4px;">`;
                    html += `<select class="bd-family-select" id="bd-scout-family" style="flex:1;">`;
                    html += `<option value="-1">Choisir eclaireur...</option>`;
                    for (let i = 0; i < this.families.length; i++) {
                        if (this.families[i].buildingIdx < 0 && !this.families[i].onVoyage) {
                            html += `<option value="${i}">${this.families[i].name}</option>`;
                        }
                    }
                    html += `</select>`;
                    html += `<select class="bd-family-select" id="bd-scout-target" style="flex:1;">`;
                    for (const e of enemies) {
                        html += `<option value="${e.owner}">${e.name}</option>`;
                    }
                    html += `</select>`;
                    html += `</div>`;
                    html += `<button class="bd-upgrade-btn${(this.resources.gold || 0) >= 10 ? '' : ' disabled'}" id="bd-send-scout" style="margin-top:4px;font-size:0.72rem;" ${(this.resources.gold || 0) >= 10 ? '' : 'disabled'}>Envoyer eclaireur (10 or)</button>`;
                } else {
                    html += `<div style="font-size:0.72rem;color:#6a5a3a;margin-top:4px;">Aucune famille libre pour eclairer</div>`;
                }
                html += `</div>`;

                // ── 6. Raid ──
                html += `<div class="bd-category bd-category-military"><div class="bd-category-title">⚔ Raid</div>`;
                html += `<div style="font-size:0.72rem;color:var(--parchment);margin-bottom:4px;">Armee : ${army.soldiers}S / ${army.archers}A / ${army.cavaliers}C (Force: ${army.strength})</div>`;
                if (this._activeRaids && this._activeRaids.length > 0) {
                    for (const r of this._activeRaids) {
                        const target = GameMap.regions.find(reg => reg.owner === r.targetOwner);
                        html += `<div style="font-size:0.72rem;color:#d8a888;padding:2px 0;">⚔ Raid vers ${target ? target.name : '?'} (${r.familyIndices.length} familles, Retour : ${this._formatGameHours(r.returnGameHours)})</div>`;
                    }
                }
                if (army.total > 0 && (!this._activeRaids || this._activeRaids.length === 0)) {
                    html += `<div style="margin-top:4px;">`;
                    html += `<select class="bd-family-select" id="bd-raid-target" style="width:100%;">`;
                    for (const e of enemies) {
                        const intel = this._scoutedIntel[e.owner];
                        const intelStr = intel ? ` (Force: ${intel.strength})` : ' (non reconnu)';
                        html += `<option value="${e.owner}">${e.name}${intelStr}</option>`;
                    }
                    html += `</select>`;
                    const canRaid = (this.resources.gold || 0) >= 20 && (this.resources.food || 0) >= 15;
                    html += `<button class="bd-upgrade-btn${canRaid ? '' : ' disabled'}" id="bd-send-raid" style="margin-top:4px;font-size:0.72rem;" ${canRaid ? '' : 'disabled'}>Lancer le raid (20 or, 15 nourriture)</button>`;
                    html += `<div style="font-size:0.68rem;color:#8a7a5a;margin-top:2px;">Toutes les familles militaires disponibles partiront</div>`;
                    html += `</div>`;
                } else if (this._activeRaids && this._activeRaids.length > 0) {
                    html += `<div style="font-size:0.72rem;color:#6a5a3a;margin-top:4px;">Raid en cours...</div>`;
                } else {
                    html += `<div style="font-size:0.72rem;color:#6a5a3a;margin-top:4px;">Aucun soldat disponible</div>`;
                }
                html += `</div>`;
            }

            // ── 7. Historique ──
            const allHistory = [];
            for (const fi of b.familyIndices) {
                const fam = this.families[fi];
                if (!fam || !fam.trainingHistory) continue;
                for (const h of fam.trainingHistory) {
                    allHistory.push({ ...h, famName: fam.name });
                }
            }
            if (allHistory.length > 0) {
                html += `<div class="bd-category bd-category-military"><div class="bd-category-title">📜 Historique</div>`;
                const recent = allHistory.slice(-10).reverse();
                for (const entry of recent) {
                    const typeStr = entry.type === 'soldier' ? 'Soldat' : entry.type === 'archer' ? 'Archer' : 'Cavalier';
                    const statusStr = entry.status === 'pending' ? '(a distribuer)' : '(distribue)';
                    html += `<div style="font-size:0.68rem;color:#8a7a5a;padding:1px 0;">Jour ${entry.day} — ${entry.famName} (${typeStr}) : +${entry.points} pts ${statusStr}</div>`;
                }
                html += `</div>`;
            }
        }

        // === Comptoir: lingot selling + shopping list + voyages ===
        if (b.type === 'comptoir') {
            // Lingot selling
            html += `<div class="bd-section"><div class="bd-label">Vendre des lingots</div>`;
            const ironCount = this.resources.ironIngot || 0;
            const goldCount = this.resources.goldIngot || 0;
            html += `<div style="display:flex;gap:6px;margin-top:4px;">`;
            html += `<button class="bd-upgrade-btn${ironCount > 0 ? '' : ' disabled'}" id="bd-sell-iron" style="flex:1;padding:6px;font-size:0.72rem;" ${ironCount > 0 ? '' : 'disabled'}>Vendre Ling. Fer (${ironCount}) = ${CONFIG.LINGOT_PRICES.ironIngot} or</button>`;
            html += `<button class="bd-upgrade-btn${goldCount > 0 ? '' : ' disabled'}" id="bd-sell-gold" style="flex:1;padding:6px;font-size:0.72rem;" ${goldCount > 0 ? '' : 'disabled'}>Vendre Ling. Or (${goldCount}) = ${CONFIG.LINGOT_PRICES.goldIngot} or</button>`;
            html += `</div></div>`;

            // Active voyages
            if (this._activeVoyages && this._activeVoyages.length > 0) {
                html += `<div class="bd-section"><div class="bd-label">Voyages en cours</div>`;
                for (const v of this._activeVoyages) {
                    const fam = this.families[v.familyIdx];
                    html += `<div style="padding:4px 0;border-bottom:1px solid rgba(200,168,74,0.06);">`;
                    html += `<div style="font-size:0.78rem;color:var(--parchment);">${fam ? fam.name : '?'} — Retour : ${this._formatGameHours(v.returnGameHours)}</div>`;
                    if (v.cart) {
                        const cartItems = [];
                        for (const [k, qty] of Object.entries(v.cart)) {
                            if (qty > 0) {
                                const names = { simpleWeapon: 'Arme simple', heavyWeapon: 'Arme lourde', cow: 'Vache', horse: 'Cheval', chariot: 'Chariot' };
                                cartItems.push(`${qty}x ${names[k] || k}`);
                            }
                        }
                        if (cartItems.length > 0) {
                            html += `<div style="font-size:0.68rem;color:#a8c8d8;">Panier : ${cartItems.join(', ')}</div>`;
                        }
                    }
                    html += `<div style="font-size:0.68rem;color:#8a7a5a;">Or emporte : ${v.goldCarried}</div>`;
                    html += `</div>`;
                }
                html += `</div>`;
            }

            // Shopping list
            html += `<div class="bd-section"><div class="bd-label">Preparer une liste de course</div>`;
            const availableForVoyage = this.families.filter((f, i) => f.buildingIdx < 0 && !f.onVoyage);
            if (availableForVoyage.length > 0) {
                html += `<select class="bd-family-select" id="bd-voyage-family" style="margin-bottom:6px;">`;
                html += `<option value="-1">Choisir une famille...</option>`;
                for (let i = 0; i < this.families.length; i++) {
                    if (this.families[i].buildingIdx < 0 && !this.families[i].onVoyage) {
                        html += `<option value="${i}">${this.families[i].name}</option>`;
                    }
                }
                html += `</select>`;

                const shopItems = [
                    { key: 'simpleWeapon', name: 'Arme simple', cost: 15 },
                    { key: 'heavyWeapon', name: 'Arme lourde', cost: 25 },
                    { key: 'cow', name: 'Vache', cost: 40 },
                    { key: 'horse', name: 'Cheval', cost: 80 },
                    { key: 'chariot', name: 'Chariot', cost: 120 }
                ];
                for (const item of shopItems) {
                    html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(200,168,74,0.06);">`;
                    html += `<div style="flex:1;"><span style="font-size:0.75rem;color:var(--parchment);">${item.name}</span><br><span style="font-size:0.65rem;color:#8a7a5a;">${item.cost} or/u</span></div>`;
                    html += `<div style="display:flex;align-items:center;gap:3px;">`;
                    html += `<button class="bd-cart-minus" data-key="${item.key}" style="width:22px;height:22px;font-size:0.75rem;background:rgba(200,168,74,0.15);border:1px solid var(--gold-dark);color:var(--parchment);border-radius:3px;cursor:pointer;">−</button>`;
                    html += `<span class="bd-cart-qty" data-key="${item.key}" style="width:20px;text-align:center;font-size:0.75rem;color:var(--gold);">0</span>`;
                    html += `<button class="bd-cart-plus" data-key="${item.key}" data-cost="${item.cost}" style="width:22px;height:22px;font-size:0.75rem;background:rgba(200,168,74,0.15);border:1px solid var(--gold-dark);color:var(--parchment);border-radius:3px;cursor:pointer;">+</button>`;
                    html += `</div></div>`;
                }
                html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding:4px 0;border-top:1px solid rgba(200,168,74,0.15);">`;
                html += `<span style="font-size:0.78rem;color:var(--gold);font-family:Cinzel,serif;">Total : <span id="bd-cart-total">0</span> or</span>`;
                html += `<span style="font-size:0.72rem;color:#8a7a5a;">(Or dispo: ${this.resources.gold || 0})</span>`;
                html += `</div>`;
                html += `<button class="bd-upgrade-btn disabled" id="bd-send-voyage" style="margin-top:4px;" disabled>Envoyer la famille</button>`;
                html += `<div style="font-size:0.68rem;color:#8a7a5a;margin-top:2px;">Duree : 24-48h. Evenements aleatoires possibles.</div>`;
            } else {
                html += `<div style="font-size:0.72rem;color:#6a5a3a;">Aucune famille libre pour faire les courses.</div>`;
            }
            html += `</div>`;
        }

        // Upgrade
        if (def.upgrades && def.upgrades.length > 0 && lvl - 1 < def.upgrades.length) {
            const nextUpgrade = def.upgrades[lvl - 1];
            const costStr = Object.entries(nextUpgrade.cost).map(([r, v]) => `${v} ${CONFIG.RESOURCE_NAMES[r] || r}`).join(', ');
            const canUpgrade = this._canAfford(nextUpgrade.cost);
            html += `<div class="bd-section bd-upgrade"><div class="bd-label">Amelioration : ${nextUpgrade.name}</div><div class="bd-value">Cout : ${costStr}</div>`;
            if (nextUpgrade.productionBonus) {
                const bonusStr = Object.entries(nextUpgrade.productionBonus).map(([r, a]) => `+${a} ${CONFIG.RESOURCE_NAMES[r] || r}`).join(', ');
                html += `<div class="bd-value">Bonus : ${bonusStr}</div>`;
            }
            if (nextUpgrade.bonus) {
                html += `<div class="bd-value">Bonus : ${nextUpgrade.bonus}</div>`;
            }
            html += `<button class="bd-upgrade-btn${canUpgrade ? '' : ' disabled'}" id="bd-upgrade-btn"${canUpgrade ? '' : ' disabled'}>Ameliorer</button></div>`;
        } else if (def.upgrades && def.upgrades.length > 0) {
            html += `<div class="bd-section"><div class="bd-label" style="color:#c8a84a;">Niveau maximum atteint</div></div>`;
        }

        // Demolish button
        html += `<div class="bd-section" style="text-align:center;margin-top:8px;">`;
        html += `<button class="bd-upgrade-btn" id="bd-demolish-btn" style="background:linear-gradient(180deg,#5a2020,#3a1010);border-color:#8a3030;color:#d88888;">Demolir (50% remboursement)</button>`;
        html += `</div>`;

        content.innerHTML = html;

        // === Bind events ===

        // Single-family assignment
        const famSelect = document.getElementById('bd-family-select');
        if (famSelect && !def.multiFamily) {
            famSelect.addEventListener('change', (e) => {
                const newFamIdx = parseInt(e.target.value);
                if (b.familyIdx >= 0 && this.families[b.familyIdx]) {
                    this.families[b.familyIdx].buildingIdx = -1;
                    this.families[b.familyIdx].job = null;
                }
                b.familyIdx = newFamIdx;
                if (newFamIdx >= 0 && this.families[newFamIdx]) {
                    this.families[newFamIdx].buildingIdx = bIdx;
                    this.families[newFamIdx].job = b.type;
                }
                this._updateHUD();
                this._renderBuildingDetail();
            });
        }

        // Barracks: add family
        const barracksAdd = document.getElementById('bd-barracks-add');
        if (barracksAdd) {
            barracksAdd.addEventListener('change', (e) => {
                const fi = parseInt(e.target.value);
                if (fi < 0) return;
                const typeSelect = document.getElementById('bd-barracks-type');
                const milType = typeSelect ? typeSelect.value : 'soldier';
                this.families[fi].buildingIdx = bIdx;
                this.families[fi].job = 'barracks';
                this.families[fi].militaryType = milType;
                b.familyIndices.push(fi);
                this._updateHUD();
                this._renderBuildingDetail();
            });
        }

        // Barracks: remove family
        content.querySelectorAll('.bd-barracks-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const fi = parseInt(btn.dataset.fi);
                if (this.families[fi]) {
                    if (this.families[fi].weapon) {
                        this.inventory[this.families[fi].weapon] = (this.inventory[this.families[fi].weapon] || 0) + 1;
                        this.families[fi].weapon = null;
                    }
                    if (this.families[fi].mount) {
                        this.inventory[this.families[fi].mount] = (this.inventory[this.families[fi].mount] || 0) + 1;
                        this.families[fi].mount = null;
                    }
                    this.families[fi].buildingIdx = -1;
                    this.families[fi].job = null;
                    this.families[fi].militaryType = null;
                    this.families[fi].training = null;
                }
                b.familyIndices = b.familyIndices.filter(i => i !== fi);
                this._updateHUD();
                this._renderBuildingDetail();
            });
        });

        // Barracks: train
        const trainBtn = document.getElementById('bd-train-btn');
        if (trainBtn) {
            trainBtn.addEventListener('click', () => {
                const trainSelect = document.getElementById('bd-train-select');
                if (!trainSelect) return;
                const fi = parseInt(trainSelect.value);
                const fam = this.families[fi];
                if (!fam || !fam.militaryType) return;
                const costs = def.trainingCosts[fam.militaryType];
                if (!costs) return;
                if ((this.resources.food || 0) < costs.food || (this.resources.gold || 0) < costs.gold) {
                    this._showNotification(`\u{26A0} Ressources insuffisantes pour l'entrainement !`, '#d88888');
                    return;
                }
                this.resources.food -= costs.food;
                this.resources.gold -= costs.gold;
                const currentGH = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
                const endGH = this._computeCycleEndGH(currentGH, costs.cycles);
                fam.training = { cyclesLeft: costs.cycles, pendingPoints: 0, endGameHours: endGH };
                this._updateHUD();
                this._renderBuildingDetail();
                this._showNotification(`\u{2694} ${fam.name} commence l'entrainement (Fin : ${this._formatGameHours(endGH)})`, '#a8c8d8');
            });
        }

        // Barracks: distribute points
        content.querySelectorAll('.bd-dist-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fi = parseInt(btn.dataset.fi);
                const stat = btn.dataset.stat;
                const fam = this.families[fi];
                if (!fam || !fam.training || !fam.training.pendingPoints) return;
                fam.stats[stat] = (fam.stats[stat] || 0) + 1;
                fam.training.pendingPoints--;
                this._showNotification(`\u{2694} ${fam.name} : +1 ${stat} (${fam.training.pendingPoints} restant)`, '#a8c8d8');
                if (fam.training.pendingPoints <= 0) {
                    // Mark history entry as distributed
                    if (fam.trainingHistory) {
                        const last = fam.trainingHistory.findLast(h => h.status === 'pending');
                        if (last) last.status = 'distributed';
                    }
                    fam.training = null;
                    this._showNotification(`\u{2694} ${fam.name} : tous les points distribues !`, '#a8d8a8');
                }
                this._updateHUD();
                this._renderBuildingDetail();
            });
        });

        // Barracks: send scout
        const sendScout = document.getElementById('bd-send-scout');
        if (sendScout) {
            sendScout.addEventListener('click', () => {
                const famSelect = document.getElementById('bd-scout-family');
                const targetSelect = document.getElementById('bd-scout-target');
                if (!famSelect || !targetSelect) return;
                const fi = parseInt(famSelect.value);
                const target = parseInt(targetSelect.value);
                if (fi < 0) return;
                this._sendScout(fi, target);
                this._renderBuildingDetail();
            });
        }

        // Barracks: send raid
        const sendRaid = document.getElementById('bd-send-raid');
        if (sendRaid) {
            sendRaid.addEventListener('click', () => {
                const targetSelect = document.getElementById('bd-raid-target');
                if (!targetSelect) return;
                const target = parseInt(targetSelect.value);
                this._sendRaid(target);
                this._renderBuildingDetail();
            });
        }

        // Barracks: equip weapon
        content.querySelectorAll('.bd-equip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fi = parseInt(btn.dataset.fi);
                const item = btn.dataset.item;
                const fam = this.families[fi];
                if (!fam || !this.inventory || (this.inventory[item] || 0) <= 0) return;
                if (fam.weapon) this.inventory[fam.weapon] = (this.inventory[fam.weapon] || 0) + 1;
                fam.weapon = item;
                this.inventory[item]--;
                this._renderBuildingDetail();
            });
        });

        // Barracks: equip mount
        content.querySelectorAll('.bd-equip-mount-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fi = parseInt(btn.dataset.fi);
                const sel = content.querySelector(`.bd-mount-select[data-fi="${fi}"]`);
                if (!sel) return;
                const mountType = sel.value;
                const fam = this.families[fi];
                if (!fam || !this.inventory || (this.inventory[mountType] || 0) <= 0) return;
                if (fam.mount) this.inventory[fam.mount] = (this.inventory[fam.mount] || 0) + 1;
                fam.mount = mountType;
                this.inventory[mountType]--;
                this._renderBuildingDetail();
            });
        });

        // Barracks: unequip
        content.querySelectorAll('.bd-unequip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fi = parseInt(btn.dataset.fi);
                const slot = btn.dataset.slot;
                const fam = this.families[fi];
                if (!fam) return;
                if (slot === 'weapon' && fam.weapon) {
                    this.inventory[fam.weapon] = (this.inventory[fam.weapon] || 0) + 1;
                    fam.weapon = null;
                } else if (slot === 'mount' && fam.mount) {
                    this.inventory[fam.mount] = (this.inventory[fam.mount] || 0) + 1;
                    fam.mount = null;
                }
                this._renderBuildingDetail();
            });
        });

        // Comptoir: sell lingots
        const sellIron = document.getElementById('bd-sell-iron');
        if (sellIron) {
            sellIron.addEventListener('click', () => {
                if ((this.resources.ironIngot || 0) > 0) {
                    this.resources.ironIngot--;
                    this.resources.gold = (this.resources.gold || 0) + CONFIG.LINGOT_PRICES.ironIngot;
                    this._showNotification(`\u{1FA99} Lingot de fer vendu pour ${CONFIG.LINGOT_PRICES.ironIngot} or`, '#a8d8a8');
                    this._updateHUD();
                    this._renderBuildingDetail();
                }
            });
        }
        const sellGold = document.getElementById('bd-sell-gold');
        if (sellGold) {
            sellGold.addEventListener('click', () => {
                if ((this.resources.goldIngot || 0) > 0) {
                    this.resources.goldIngot--;
                    this.resources.gold = (this.resources.gold || 0) + CONFIG.LINGOT_PRICES.goldIngot;
                    this._showNotification(`\u{1FA99} Lingot d'or vendu pour ${CONFIG.LINGOT_PRICES.goldIngot} or`, '#a8d8a8');
                    this._updateHUD();
                    this._renderBuildingDetail();
                }
            });
        }

        // Comptoir: shopping cart system
        const _cart = { simpleWeapon: 0, heavyWeapon: 0, cow: 0, horse: 0, chariot: 0 };
        const _itemCosts = { simpleWeapon: 15, heavyWeapon: 25, cow: 40, horse: 80, chariot: 120 };
        const _updateCartTotal = () => {
            let total = 0;
            for (const [k, qty] of Object.entries(_cart)) {
                total += qty * (_itemCosts[k] || 0);
            }
            const totalEl = document.getElementById('bd-cart-total');
            if (totalEl) totalEl.textContent = total;
            const sendBtn = document.getElementById('bd-send-voyage');
            const famSelect = document.getElementById('bd-voyage-family');
            const famOk = famSelect && parseInt(famSelect.value) >= 0;
            const canSend = total > 0 && famOk && (this.resources.gold || 0) >= total;
            if (sendBtn) {
                sendBtn.disabled = !canSend;
                sendBtn.classList.toggle('disabled', !canSend);
            }
        };
        content.querySelectorAll('.bd-cart-plus').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.key;
                _cart[key] = (_cart[key] || 0) + 1;
                const qtyEl = content.querySelector(`.bd-cart-qty[data-key="${key}"]`);
                if (qtyEl) qtyEl.textContent = _cart[key];
                _updateCartTotal();
            });
        });
        content.querySelectorAll('.bd-cart-minus').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.key;
                if ((_cart[key] || 0) <= 0) return;
                _cart[key]--;
                const qtyEl = content.querySelector(`.bd-cart-qty[data-key="${key}"]`);
                if (qtyEl) qtyEl.textContent = _cart[key];
                _updateCartTotal();
            });
        });
        const voyageFamSelect = document.getElementById('bd-voyage-family');
        if (voyageFamSelect) {
            voyageFamSelect.addEventListener('change', _updateCartTotal);
        }

        // Comptoir: send shopping voyage
        const sendVoyage = document.getElementById('bd-send-voyage');
        if (sendVoyage) {
            sendVoyage.addEventListener('click', () => {
                const voyageSelect = document.getElementById('bd-voyage-family');
                if (!voyageSelect) return;
                const fi = parseInt(voyageSelect.value);
                if (fi < 0 || !this.families[fi]) return;
                let totalCost = 0;
                for (const [k, qty] of Object.entries(_cart)) {
                    totalCost += qty * (_itemCosts[k] || 0);
                }
                if (totalCost <= 0) return;
                if ((this.resources.gold || 0) < totalCost) return;
                this.resources.gold -= totalCost;
                this.families[fi].onVoyage = true;
                const currentGH = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
                const duration = 24 + Math.random() * 24;
                this._activeVoyages.push({
                    familyIdx: fi,
                    goldCarried: totalCost,
                    returnGameHours: currentGH + duration,
                    cart: { ...(_cart) }
                });
                this._showNotification(`\u{1F6B6} ${this.families[fi].name} part faire les courses (${totalCost} or)`, '#a8c8d8');
                this._updateHUD();
                this._renderBuildingDetail();
            });
        }

        // Upgrade button
        const upgradeBtn = document.getElementById('bd-upgrade-btn');
        if (upgradeBtn && !upgradeBtn.disabled) {
            upgradeBtn.addEventListener('click', () => {
                this._upgradeBuilding(bIdx);
            });
        }

        // Demolish button
        const demolishBtn = document.getElementById('bd-demolish-btn');
        if (demolishBtn) {
            demolishBtn.addEventListener('click', () => {
                if (confirm('Demolir ce batiment ? (50% remboursement)')) {
                    this._demolishBuilding(bIdx);
                }
            });
        }
    },

    _upgradeBuilding(bIdx) {
        const b = this.buildings[bIdx];
        const def = CONFIG.BUILDINGS[b.type];
        const lvl = b.level || 1;
        if (!def.upgrades || lvl - 1 >= def.upgrades.length) return;

        const upgrade = def.upgrades[lvl - 1];
        if (!this._canAfford(upgrade.cost)) return;

        AudioManager.playUpgrade();
        // Spend resources
        for (const [res, amount] of Object.entries(upgrade.cost)) {
            this.resources[res] -= amount;
        }

        b.level = lvl + 1;

        // House niv2: family gets a child → +25% production, +50% food consumption
        if (b.type === 'house' && b.level === 2 && b.familyIdx >= 0 && this.families[b.familyIdx]) {
            this.families[b.familyIdx].hasChild = true;
            this._showNotification(`\u{1F476} Enfant ne dans ${this.families[b.familyIdx].name} ! +25% production`, '#a8d8a8');
        }

        Renderer._bufferDirty = true;
        this._updateHUD();
        this._renderBuildingDetail();
    },

    // ==================== TIME SYSTEM ====================

    _updateGameTime() {
        const now = Date.now();
        if (!this._lastTimeUpdate) {
            this._lastTimeUpdate = now;
            return;
        }

        if (this._timeSpeed === 0 || this._dayTransitionActive) {
            this._lastTimeUpdate = now;
            return; // Paused or day transition — freeze clock
        }

        const deltaMs    = now - this._lastTimeUpdate;
        this._lastTimeUpdate = now;

        // Speed 1 → 1 real second = 8 game minutes (days are 50% shorter)
        // Speed 2 → 2x faster (16 game minutes per second)
        const baseSpeed = 8;
        const multiplier = (this._timeSpeed === 2 ? 2 : 1) * baseSpeed;
        this._gameMinute += (deltaMs / 1000) * multiplier;

        while (this._gameMinute >= 60) {
            this._gameMinute -= 60;
            this._gameHour++;
            if (this._gameHour >= 24) {
                this._gameDay++;
                this._onNewDay(); // sets _gameHour=6, _gameMinute=0
                break; // stop advancing time — day transition pauses
            }
        }

        this._updateTimeHUD();
    },

    _onNewDay() {
        // Set wake time to 6:00
        this._gameHour = 6;
        this._gameMinute = 0;
        // Reset cycle tracker for new day (start before first cycle hour)
        this._lastCycleHour = 6;

        // Check pending family arrivals
        const arrivals = [];
        const departures = [];
        const currentGameHours = (this._gameDay - 1) * 24 + this._gameHour;

        if (this._pendingFamilies) {
            for (let i = this._pendingFamilies.length - 1; i >= 0; i--) {
                const pending = this._pendingFamilies[i];
                if (pending.arrivalGameHours <= currentGameHours) {
                    const maxFam = this.getMaxFamilies();
                    if (this.families.length < maxFam) {
                        this.families.push(pending.family);
                        this._assignFamilyToEmptyHouse(this.families.length - 1);
                        arrivals.push(pending.family.name);
                    }
                    this._pendingFamilies.splice(i, 1);
                }
            }
        }

        // Daily satisfaction update (natural recovery, barracks bonus)
        this._dailySatisfactionUpdate();

        // Satisfaction-based departure: <20% (critique) → 10% chance per family
        const sat = this._getSatisfaction();
        if (sat < 20 && this.families.length > 1) {
            for (let i = this.families.length - 1; i >= 1; i--) { // never remove family 0
                if (Math.random() < 0.10) {
                    const fam = this.families[i];
                    // Unassign from building
                    if (fam.buildingIdx >= 0 && this.buildings[fam.buildingIdx]) {
                        this.buildings[fam.buildingIdx].familyIdx = -1;
                    }
                    departures.push(fam.name);
                    this.families.splice(i, 1);
                    // Fix buildingIdx references
                    for (const b of this.buildings) {
                        if (b.familyIdx > i) b.familyIdx--;
                        else if (b.familyIdx === i) b.familyIdx = -1;
                    }
                    for (let j = 0; j < this.families.length; j++) {
                        this.families[j].buildingIdx = this.buildings.findIndex(b => b.familyIdx === j);
                    }
                    break; // max 1 departure per day
                }
            }
        }

        // Auto-queue new family if housing available
        this._checkRecruitFamily();

        // Show day transition overlay
        this._showDayTransition(arrivals, departures);
    },

    _showDayTransition(arrivals, departures) {
        this._dayTransitionActive = true;
        AudioManager.playNewDay();
        const overlay = document.getElementById('day-transition-overlay');
        const title = document.getElementById('day-transition-title');
        const summary = document.getElementById('day-transition-summary');

        title.textContent = `Jour ${this._gameDay}`;

        const sat = this._getSatisfaction();
        const satState = this._getSatisfactionState();
        let summaryHtml = `<strong>Resume du jour precedent :</strong><br>`;
        summaryHtml += `Familles : ${this.families.length} / ${this.getMaxFamilies()}<br>`;
        summaryHtml += `Satisfaction : <span style="color:${satState.color}">${sat}% (${satState.label})</span><br>`;
        summaryHtml += `Bois: ${this.resources.wood} | Pierre: ${this.resources.stone} | Nourriture: ${this.resources.food} | Or: ${this.resources.gold || 0}<br>`;
        if ((this.resources.ironOre || 0) > 0 || (this.resources.goldOre || 0) > 0 || (this.resources.ironIngot || 0) > 0 || (this.resources.goldIngot || 0) > 0) {
            summaryHtml += `Min.Fer: ${this.resources.ironOre || 0} | Min.Or: ${this.resources.goldOre || 0} | Ling.Fer: ${this.resources.ironIngot || 0} | Ling.Or: ${this.resources.goldIngot || 0}<br>`;
        }
        summaryHtml += `Constructions : ${this.buildings.length}`;

        if (arrivals && arrivals.length > 0) {
            summaryHtml += `<br><br><strong style="color:#a8d8a8;">Nouvelles familles arrivees !</strong><br>`;
            for (const name of arrivals) {
                summaryHtml += `- ${name}<br>`;
            }
        }

        if (departures && departures.length > 0) {
            summaryHtml += `<br><br><strong style="color:#d88888;">Familles parties (mecontentement) :</strong><br>`;
            for (const name of departures) {
                summaryHtml += `- ${name}<br>`;
            }
        }

        const pendingCount = this._pendingFamilies ? this._pendingFamilies.length : 0;
        if (pendingCount > 0) {
            summaryHtml += `<br><span style="color:#a8c8d8;">\u{1F6B6} ${pendingCount} famille(s) en route</span>`;
        }

        summary.innerHTML = summaryHtml;
        overlay.classList.add('active');
    },

    _dismissDayTransition() {
        this._dayTransitionActive = false;
        this._lastTimeUpdate = Date.now(); // reset timer so no time jump
        document.getElementById('day-transition-overlay').classList.remove('active');
        this._updateHUD();
        this._updateTimeHUD();
    },

    _updateTimeHUD() {
        const h   = String(Math.floor(this._gameHour)).padStart(2, '0');
        const m   = String(Math.floor(this._gameMinute)).padStart(2, '0');
        const tel = document.getElementById('hud-time');
        const del = document.getElementById('hud-day');
        if (tel) tel.textContent = `${h}:${m}`;
        if (del) del.textContent = `Jour ${this._gameDay}`;

        const paused = this._timeSpeed === 0;
        const fast   = this._timeSpeed === 2;

        const btnPause = document.getElementById('btn-pause');
        const btnPlay  = document.getElementById('btn-play');
        const btnFast  = document.getElementById('btn-fast');
        if (btnPause) btnPause.classList.toggle('time-btn-active', paused);
        if (btnPlay)  btnPlay.classList.toggle('time-btn-active', !paused && !fast);
        if (btnFast)  btnFast.classList.toggle('time-btn-active', fast && !paused);
    },

    _setTimeSpeed(speed) {
        this._timeSpeed = speed;
        this._updateTimeHUD();
    },

    _skipDay() {
        if (this._dayTransitionActive) return;

        // Run all remaining cycles for today
        for (const ch of this._CYCLE_HOURS) {
            if (this._lastCycleHour < ch) {
                // Skip first cycle (8h) on day 1
                if (this._gameDay === 1 && ch === 8 && !this._firstDayCycleDone) {
                    this._firstDayCycleDone = true;
                    this._lastCycleHour = ch;
                    continue;
                }
                this._lastCycleHour = ch;
                this._runProductionCycle();
            }
        }

        // Advance to next day
        this._gameDay++;
        this._onNewDay();
    },

    // Extracted production logic so it can be called from both _productionTick and _skipDay
    _runProductionCycle() {
        // Track produced resources for notification
        const produced = {};
        const addProduced = (res, amt) => { produced[res] = (produced[res] || 0) + amt; };

        // Satisfaction production modifier
        const sat = this._satisfaction;
        let prodMultiplier = 1.0;
        if (sat >= 80) prodMultiplier = 1.10;
        else if (sat < 40 && sat >= 20) prodMultiplier = 0.90;

        // --- Standard production (lumberjack, farm) ---
        for (let i = 0; i < this.buildings.length; i++) {
            const b = this.buildings[i];
            const def = CONFIG.BUILDINGS[b.type];
            if (!def || !def.production) continue;
            if (b.familyIdx === undefined || b.familyIdx < 0) continue;
            if (!this.families[b.familyIdx]) continue;

            const fam = this.families[b.familyIdx];
            const childBonus = fam.hasChild ? 1.25 : 1.0;

            for (const [res, baseAmt] of Object.entries(def.production)) {
                let amount = baseAmt;
                const lvl = b.level || 1;
                if (lvl > 1 && def.upgrades) {
                    for (let u = 0; u < lvl - 1 && u < def.upgrades.length; u++) {
                        const bonus = def.upgrades[u].productionBonus;
                        if (bonus && bonus[res]) amount += bonus[res];
                    }
                }
                const finalAmt = Math.floor(amount * prodMultiplier * childBonus);
                this._addResource(res, finalAmt);
                addProduced(res, finalAmt);
            }
        }

        // --- Mine production ---
        for (const b of this.buildings) {
            if (b.type !== 'mine') continue;
            if (b.familyIdx < 0 || !this.families[b.familyIdx]) continue;
            const lvl = b.level || 1;
            const def = CONFIG.BUILDINGS.mine;
            const rates = def.mineRates[lvl - 1];
            if (!rates) continue;

            const fam = this.families[b.familyIdx];
            const childBonus = fam.hasChild ? 1.25 : 1.0;

            const stoneAmt = Math.floor(rates.stone * prodMultiplier * childBonus);
            this._addResource('stone', stoneAmt);
            addProduced('stone', stoneAmt);
            if (Math.random() < rates.ironOreChance) {
                this._addResource('ironOre', 1);
                addProduced('ironOre', 1);
            }
            if (Math.random() < rates.goldOreChance) {
                this._addResource('goldOre', 1);
                addProduced('goldOre', 1);
            }
        }

        // --- Fonderie conversion ---
        for (const b of this.buildings) {
            if (b.type !== 'foundry') continue;
            if (b.familyIdx < 0) continue; // requires a family to run
            const lvl = b.level || 1;
            const def = CONFIG.BUILDINGS.foundry;
            const rates = def.foundryRates[lvl - 1];
            if (!rates) continue;

            if ((this.resources.ironOre || 0) >= rates.oreNeeded) {
                this.resources.ironOre -= rates.oreNeeded;
                this._addResource('ironIngot', rates.ingotProduced);
                addProduced('ironIngot', rates.ingotProduced);
            }
            if ((this.resources.goldOre || 0) >= rates.oreNeeded) {
                this.resources.goldOre -= rates.oreNeeded;
                this._addResource('goldIngot', rates.ingotProduced);
                addProduced('goldIngot', rates.ingotProduced);
            }
        }

        // --- Food consumption only at meal times ---
        if (this._lastCycleHour === 12 || this._lastCycleHour === 20) {
            this._consumeFood();
        }

        // --- Training progress ---
        this._tickTraining();

        // --- Cycle notification ---
        this._showCycleNotification(produced);

        this._updateHUD();
    },

    _togglePause() {
        if (this._timeSpeed === 0) {
            this._timeSpeed = this._prevSpeed || 1;
        } else {
            this._prevSpeed = this._timeSpeed;
            this._timeSpeed = 0;
        }
        this._updateTimeHUD();
    },

    // ==================== PAUSE MENU ====================

    _openPauseMenu() {
        this._pauseMenuOpen = true;
        // Pause game time
        if (this._timeSpeed !== 0) {
            this._prevSpeed = this._timeSpeed;
            this._timeSpeed = 0;
        }
        this._updateTimeHUD();
        // Close other panels
        this._closeBuildMenu();
        this._closeBuildingDetail();
        this._closeInfoPanel();
        // Reset sub-panels
        document.getElementById('save-panel').classList.remove('active');
        document.getElementById('pause-options').classList.remove('active');
        document.getElementById('quit-confirm').classList.remove('active');
        document.querySelector('.pause-buttons').style.display = '';
        document.getElementById('pause-overlay').classList.add('active');
    },

    _closePauseMenu() {
        this._pauseMenuOpen = false;
        document.getElementById('pause-overlay').classList.remove('active');
        // Resume game time
        this._timeSpeed = this._prevSpeed || 1;
        this._lastTimeUpdate = Date.now();
        this._updateTimeHUD();
    },

    _openSavePanel() {
        document.querySelector('.pause-buttons').style.display = 'none';
        document.getElementById('save-panel').classList.add('active');
        this._renderSaveSlots('save');
    },

    _openLoadPanel() {
        this._renderSaveSlots('load');
    },

    _renderSaveSlots(mode) {
        const container = document.getElementById('save-slots-list');
        let html = '';
        for (let i = 0; i < 3; i++) {
            const key = 'sdc_save_' + i;
            const raw = localStorage.getItem(key);
            let slotInfo = '';
            let isEmpty = true;
            if (raw) {
                try {
                    const data = JSON.parse(raw);
                    isEmpty = false;
                    const date = new Date(data._saveDate);
                    const dateStr = date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
                    slotInfo = `<div style="font-size:0.78rem;color:var(--parchment);">Jour ${data._gameDay} - ${data.families ? data.families.length : '?'} familles</div>`;
                    slotInfo += `<div style="font-size:0.68rem;color:#6a5a3a;">${dateStr}</div>`;
                } catch(e) { /* corrupt save */ }
            }
            if (isEmpty) {
                slotInfo = `<div style="font-size:0.78rem;color:#6a5a3a;">Emplacement vide</div>`;
            }

            if (mode === 'save') {
                html += `<div class="save-slot" data-slot="${i}" style="padding:10px;margin:6px 0;border:1px solid rgba(200,168,74,0.3);border-radius:6px;cursor:pointer;transition:border-color 0.15s;" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='rgba(200,168,74,0.3)'">`;
                html += `<div style="display:flex;justify-content:space-between;align-items:center;">`;
                html += `<div><div style="font-family:Cinzel,serif;color:var(--gold);font-size:0.82rem;">Slot ${i + 1}</div>${slotInfo}</div>`;
                html += `<span style="color:var(--gold-dark);font-size:0.72rem;">${isEmpty ? 'Sauvegarder' : 'Ecraser'}</span>`;
                html += `</div></div>`;
            } else {
                const disabled = isEmpty ? ' style="opacity:0.4;pointer-events:none;"' : '';
                html += `<div class="save-slot" data-slot="${i}"${disabled} style="padding:10px;margin:6px 0;border:1px solid rgba(200,168,74,0.3);border-radius:6px;${isEmpty ? 'opacity:0.4;pointer-events:none;' : 'cursor:pointer;'}transition:border-color 0.15s;"${isEmpty ? '' : ' onmouseover="this.style.borderColor=\'var(--gold)\'" onmouseout="this.style.borderColor=\'rgba(200,168,74,0.3)\'"'}>`;
                html += `<div style="display:flex;justify-content:space-between;align-items:center;">`;
                html += `<div><div style="font-family:Cinzel,serif;color:var(--gold);font-size:0.82rem;">Slot ${i + 1}</div>${slotInfo}</div>`;
                html += `<span style="color:var(--gold-dark);font-size:0.72rem;">Charger</span>`;
                html += `</div></div>`;
            }
        }
        container.innerHTML = html;

        // Bind slot clicks
        container.querySelectorAll('.save-slot').forEach(el => {
            el.addEventListener('click', () => {
                const slot = parseInt(el.dataset.slot);
                if (mode === 'save') {
                    this._saveGame(slot);
                } else {
                    this._loadGame(slot);
                }
            });
        });
    },

    _saveGame(slotIndex) {
        const saveData = {
            _saveDate: Date.now(),
            seed: this.seed,
            _castlePlaced: this._castlePlaced,
            resources: { ...this.resources },
            families: JSON.parse(JSON.stringify(this.families)),
            buildings: JSON.parse(JSON.stringify(this.buildings)),
            _pendingFamilies: JSON.parse(JSON.stringify(this._pendingFamilies || [])),
            _activeVoyages: JSON.parse(JSON.stringify(this._activeVoyages || [])),
            _activeScouts: JSON.parse(JSON.stringify(this._activeScouts || [])),
            _activeRaids: JSON.parse(JSON.stringify(this._activeRaids || [])),
            _scoutedIntel: JSON.parse(JSON.stringify(this._scoutedIntel || {})),
            inventory: JSON.parse(JSON.stringify(this.inventory || {})),
            _satisfaction: this._satisfaction,
            _gameDay: this._gameDay,
            _gameHour: this._gameHour,
            _gameMinute: this._gameMinute,
            _lastCycleHour: this._lastCycleHour,
            _firstDayCycleDone: this._firstDayCycleDone,
            _totalGameHours: this._totalGameHours,
            _prevSpeed: this._prevSpeed,
        };
        try {
            localStorage.setItem('sdc_save_' + slotIndex, JSON.stringify(saveData));
            this._lastSaveTimestamp = Date.now();
            AudioManager.playSave();
            this._showNotification(`Partie sauvegardee (Slot ${slotIndex + 1})`, '#a8d8a8');
            // Refresh slots display
            this._renderSaveSlots('save');
            // Show load button on main menu
            this._updateMainMenuLoadButton();
        } catch(e) {
            this._showNotification(`Erreur de sauvegarde : ${e.message}`, '#d88888');
        }
    },

    _loadGame(slotIndex) {
        const raw = localStorage.getItem('sdc_save_' + slotIndex);
        if (!raw) return;
        try {
            const data = JSON.parse(raw);

            // Regenerate map from seed
            this.seed = data.seed;
            Perlin.seed(this.seed);
            Perlin.seedRng(this.seed);
            GameMap.width = CONFIG.MAP_WIDTH;
            GameMap.height = CONFIG.MAP_HEIGHT;
            GameMap.tiles = [];
            GameMap.regions = [];

            // Regenerate terrain synchronously
            for (let y = 0; y < GameMap.height; y++) {
                GameMap.tiles[y] = [];
                for (let x = 0; x < GameMap.width; x++) {
                    const nx = x / GameMap.width;
                    const ny = y / GameMap.height;
                    const elevation = Perlin.octave(x * 0.035, y * 0.035, 6, 0.5);
                    const moisture = Perlin.octave(x * 0.04 + 200, y * 0.04 + 200, 4, 0.5);
                    const dx = (nx - 0.5) * 2;
                    const dy = (ny - 0.5) * 2;
                    const distFromCenter = Math.sqrt(dx * dx + dy * dy);
                    const falloff = Math.max(0, 1 - distFromCenter * 1.1);
                    const finalElev = elevation * 0.7 + falloff * 0.3;
                    const terrain = GameMap._elevToTerrain(finalElev, moisture, x, y);
                    GameMap.tiles[y][x] = {
                        x, y, terrain,
                        elevation: finalElev, moisture,
                        building: null, owner: -1, regionId: -1,
                        visible: true, explored: true,
                    };
                }
            }
            GameMap._generateNaturalRegions();

            this._castlePlaced = data._castlePlaced;
            GameMap.placeKingdoms(this._castlePlaced.x, this._castlePlaced.y);

            // Restore buildings on map
            for (const b of data.buildings) {
                const tile = GameMap.getTile(b.x, b.y);
                if (tile) tile.building = b.type;
            }

            // Restore game state
            this.resources = data.resources;
            this.families = data.families;
            this.buildings = data.buildings;
            this._pendingFamilies = data._pendingFamilies || [];
            this._activeVoyages = data._activeVoyages || [];
            this._activeScouts = data._activeScouts || [];
            this._activeRaids = data._activeRaids || [];
            this._scoutedIntel = data._scoutedIntel || {};
            this.inventory = data.inventory || { simpleWeapon: 0, heavyWeapon: 0, cow: 0, horse: 0, chariot: 0 };
            // Backward compat: ensure families have mount field
            for (const fam of this.families) {
                if (fam.mount === undefined) fam.mount = null;
                if (fam.weapon === undefined) fam.weapon = null;
            }
            this._satisfaction = data._satisfaction;
            this._gameDay = data._gameDay;
            this._gameHour = data._gameHour;
            this._gameMinute = data._gameMinute;
            this._lastCycleHour = data._lastCycleHour;
            this._firstDayCycleDone = data._firstDayCycleDone;
            this._totalGameHours = data._totalGameHours || 0;
            this._prevSpeed = data._prevSpeed || 1;
            this._lastSaveTimestamp = data._saveDate;

            // Init renderer
            this.showScreen('game-screen');
            if (!Renderer.canvas) Renderer.init();
            else { Renderer.buildTerrainBuffer(); }
            Camera.init(Renderer.canvas);
            Renderer.setIsoMode(false);
            Camera.zoom = 4;

            this._running = true;
            this._loopGen = (this._loopGen || 0) + 1; // invalidate any previous game loop
            this._worldMapOpen = false;
            this._worldMapBuffer = null;
            this._buildMode = false;
            this._selectedBuild = null;
            this._infoPanelOpen = false;
            this._selectedBuilding = null;
            this._dayTransitionActive = false;
            this._pauseMenuOpen = false;
            this._lastTimeUpdate = Date.now();
            this._lastTick = Date.now();
            this._timeSpeed = this._prevSpeed || 1;

            document.getElementById('pause-overlay').classList.remove('active');
            document.getElementById('hud-bar').classList.add('active');

            Renderer._bufferDirty = true;
            Renderer.buildTerrainBuffer();

            Camera.centerOnCell(this._castlePlaced.x, this._castlePlaced.y);

            // Bind time controls
            const btnPause = document.getElementById('btn-pause');
            const btnPlay  = document.getElementById('btn-play');
            const btnFast  = document.getElementById('btn-fast');
            const btnSkip  = document.getElementById('btn-skip-day');
            if (btnPause) btnPause.onclick = () => this._togglePause();
            if (btnPlay)  btnPlay.onclick  = () => this._setTimeSpeed(1);
            if (btnFast)  btnFast.onclick  = () => this._setTimeSpeed(2);
            if (btnSkip)  btnSkip.onclick  = () => this._skipDay();

            this._buildBuildMenu();
            this._updateHUD();
            this._updateTimeHUD();
            this._gameLoop(this._loopGen);

            AudioManager._ensureContext();
            AudioManager.startMusic();
            this._showNotification(`Partie chargee (Slot ${slotIndex + 1})`, '#a8d8a8');
        } catch(e) {
            console.error('Load error:', e);
            this._showNotification(`Erreur de chargement : ${e.message}`, '#d88888');
        }
    },

    _updateMainMenuLoadButton() {
        const hasAnySave = [0, 1, 2].some(i => localStorage.getItem('sdc_save_' + i));
        const btn = document.getElementById('btn-continue');
        if (btn) btn.style.display = hasAnySave ? '' : 'none';
    },

    _openQuitConfirm() {
        document.querySelector('.pause-buttons').style.display = 'none';
        document.getElementById('save-panel').classList.remove('active');
        document.getElementById('pause-options').classList.remove('active');
        const qc = document.getElementById('quit-confirm');
        qc.classList.add('active');

        const warnText = document.getElementById('quit-warn-text');
        if (this._lastSaveTimestamp) {
            const ago = Math.floor((Date.now() - this._lastSaveTimestamp) / 60000);
            if (ago < 1) warnText.textContent = 'Derniere sauvegarde : il y a moins d\'une minute';
            else warnText.textContent = `Derniere sauvegarde : il y a ${ago} minute(s)`;
        } else {
            warnText.textContent = 'Vous n\'avez pas sauvegarde cette partie !';
            warnText.style.color = '#d88888';
        }
    },

    _quitToMenu() {
        this._running = false;
        AudioManager.stopMusic();
        this._pauseMenuOpen = false;
        document.getElementById('pause-overlay').classList.remove('active');
        document.getElementById('hud-bar').classList.remove('active');
        document.getElementById('build-menu').classList.remove('active');
        document.getElementById('build-hint').classList.remove('active');
        document.getElementById('info-panel').classList.remove('active');
        document.getElementById('building-detail').classList.remove('active');
        this._updateMainMenuLoadButton();
        this.showScreen('menu-screen');
    },

    _showLoadScreen() {
        // Show a simple load overlay using the pause overlay structure
        this._pauseMenuOpen = true;
        document.querySelector('.pause-buttons').style.display = 'none';
        // Reset all sub-panels first
        document.getElementById('quit-confirm').classList.remove('active');
        document.getElementById('pause-options').classList.remove('active');
        document.getElementById('save-panel').classList.add('active');
        document.getElementById('save-panel').querySelector('h3').textContent = 'Charger une partie';
        this._renderSaveSlots('load');
        document.getElementById('pause-overlay').classList.add('active');
        // Override back button to go to menu
        document.getElementById('btn-save-back').onclick = () => {
            document.getElementById('pause-overlay').classList.remove('active');
            document.getElementById('save-panel').classList.remove('active');
            document.getElementById('save-panel').querySelector('h3').textContent = 'Choisir un emplacement';
            this._pauseMenuOpen = false;
            // Rebind normal back behavior
            document.getElementById('btn-save-back').onclick = () => {
                document.getElementById('save-panel').classList.remove('active');
                document.querySelector('.pause-buttons').style.display = '';
            };
        };
    },

    // ==================== GAME LOOP ====================

    _gameLoop(gen) {
        if (!this._running) return;
        if (gen !== undefined && gen !== this._loopGen) return; // stale loop
        Camera.update();
        this._updateGameTime();
        this._productionTick();
        this._checkPendingArrivals();
        this._checkVoyageReturns();
        this._checkScoutReturns();
        this._checkRaidReturns();
        Renderer.render();
        const currentGen = this._loopGen;
        requestAnimationFrame(() => this._gameLoop(currentGen));
    },

    _checkPendingArrivals() {
        if (!this._pendingFamilies || this._pendingFamilies.length === 0) return;
        if (this._timeSpeed === 0 || this._dayTransitionActive) return;

        const currentGameHours = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
        let changed = false;

        for (let i = this._pendingFamilies.length - 1; i >= 0; i--) {
            const pending = this._pendingFamilies[i];
            if (pending.arrivalGameHours <= currentGameHours) {
                const maxFam = this.getMaxFamilies();
                if (this.families.length < maxFam) {
                    this.families.push(pending.family);
                    this._assignFamilyToEmptyHouse(this.families.length - 1);
                    this._showNotification(`\u{1F46A} ${pending.family.name} est arrivee au village !`, '#a8d8a8');
                    changed = true;
                }
                this._pendingFamilies.splice(i, 1);
            }
        }

        if (changed) {
            this._updateHUD();
            // Queue more families if housing still available
            this._checkRecruitFamily();
        }
    },

    _checkVoyageReturns() {
        if (!this._activeVoyages || this._activeVoyages.length === 0) return;
        if (this._timeSpeed === 0 || this._dayTransitionActive) return;
        if (!this.inventory) this.inventory = { simpleWeapon: 0, heavyWeapon: 0, cow: 0, horse: 0, chariot: 0 };

        const itemNames = { simpleWeapon: 'arme simple', heavyWeapon: 'arme lourde', cow: 'vache', horse: 'cheval', chariot: 'chariot' };
        const currentGH = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
        for (let i = this._activeVoyages.length - 1; i >= 0; i--) {
            const v = this._activeVoyages[i];
            if (v.returnGameHours <= currentGH) {
                const fam = this.families[v.familyIdx];
                if (fam) {
                    fam.onVoyage = false;
                    const cart = v.cart || {};
                    const roll = Math.random();

                    if (roll < 0.15) {
                        // Attack: lose 50% of items, lose all change gold
                        const delivered = [];
                        for (const [k, qty] of Object.entries(cart)) {
                            const kept = Math.ceil(qty / 2);
                            if (kept > 0) {
                                this.inventory[k] = (this.inventory[k] || 0) + kept;
                                delivered.push(`${kept}x ${itemNames[k] || k}`);
                            }
                        }
                        this._adjustSatisfaction(-5);
                        this._showNotification(`\u{2694} ${fam.name} attaque en route ! Moitie du panier perdu. ${delivered.length > 0 ? 'Recu: ' + delivered.join(', ') : ''}`, '#d88888');
                    } else if (roll < 0.30) {
                        // Great negotiator: all items + 10-20% gold back
                        const delivered = [];
                        for (const [k, qty] of Object.entries(cart)) {
                            if (qty > 0) {
                                this.inventory[k] = (this.inventory[k] || 0) + qty;
                                delivered.push(`${qty}x ${itemNames[k] || k}`);
                            }
                        }
                        const bonusGold = Math.floor(v.goldCarried * (0.10 + Math.random() * 0.10));
                        this.resources.gold = (this.resources.gold || 0) + bonusGold;
                        this._showNotification(`\u{1F4B0} ${fam.name} a bien negocie ! ${delivered.join(', ')} + ${bonusGold} or economise`, '#a8d8a8');
                    } else if (roll < 0.50) {
                        // Bonus: all items + 1 random bonus item
                        const delivered = [];
                        for (const [k, qty] of Object.entries(cart)) {
                            if (qty > 0) {
                                this.inventory[k] = (this.inventory[k] || 0) + qty;
                                delivered.push(`${qty}x ${itemNames[k] || k}`);
                            }
                        }
                        const bonusKeys = Object.keys(cart).filter(k => cart[k] > 0);
                        if (bonusKeys.length > 0) {
                            const bonusKey = bonusKeys[Math.floor(Math.random() * bonusKeys.length)];
                            this.inventory[bonusKey] = (this.inventory[bonusKey] || 0) + 1;
                            delivered.push(`+1 ${itemNames[bonusKey] || bonusKey} bonus`);
                        }
                        this._showNotification(`\u{1F381} ${fam.name} a trouve un bonus ! ${delivered.join(', ')}`, '#a8d8a8');
                    } else {
                        // Normal: all items delivered
                        const delivered = [];
                        for (const [k, qty] of Object.entries(cart)) {
                            if (qty > 0) {
                                this.inventory[k] = (this.inventory[k] || 0) + qty;
                                delivered.push(`${qty}x ${itemNames[k] || k}`);
                            }
                        }
                        this._showNotification(`\u{1F6B6} ${fam.name} revient avec ${delivered.length > 0 ? delivered.join(', ') : 'rien'}.`, '#a8c8d8');
                    }
                }
                this._activeVoyages.splice(i, 1);
                this._updateHUD();
            }
        }
    },

    // ==================== SCOUT SYSTEM ====================

    _getEnemyKingdoms() {
        const enemies = [];
        for (const region of GameMap.regions) {
            if (region.owner > 0 && region.name) {
                enemies.push({ owner: region.owner, name: region.name, color: region.color });
            }
        }
        return enemies;
    },

    _generateEnemyArmy(ownerIdx) {
        // Generate pseudo-random enemy army based on game day and owner
        const seed = ownerIdx * 1000 + this._gameDay;
        const rng = () => {
            const x = Math.sin(seed + rng._c++) * 10000;
            return x - Math.floor(x);
        };
        rng._c = 0;

        const basePower = Math.floor(5 + this._gameDay * 1.5 + ownerIdx * 2);
        const soldiers = Math.floor(basePower * (0.4 + rng() * 0.3));
        const archers = Math.floor(basePower * (0.2 + rng() * 0.2));
        const cavaliers = Math.max(0, basePower - soldiers - archers);

        const strength = soldiers * 3 + archers * 4 + cavaliers * 6;
        return { soldiers, archers, cavaliers, strength };
    },

    _sendScout(familyIdx, targetOwner) {
        const fam = this.families[familyIdx];
        if (!fam) return;

        // Cost: 10 gold
        if ((this.resources.gold || 0) < 10) {
            this._showNotification(`\u{26A0} 10 or necessaires pour envoyer un eclaireur`, '#d88888');
            return;
        }
        this.resources.gold -= 10;
        fam.onVoyage = true;

        const currentGH = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
        const duration = 36 + Math.random() * 36; // 1.5-3 days
        this._activeScouts.push({
            familyIdx,
            targetOwner,
            returnGameHours: currentGH + duration
        });

        const targetRegion = GameMap.regions.find(r => r.owner === targetOwner);
        const targetName = targetRegion ? targetRegion.name : 'Royaume inconnu';
        this._showNotification(`\u{1F441} ${fam.name} part en reconnaissance vers ${targetName}`, '#a8c8d8');
        this._updateHUD();
    },

    _checkScoutReturns() {
        if (!this._activeScouts || this._activeScouts.length === 0) return;
        if (this._timeSpeed === 0 || this._dayTransitionActive) return;

        const currentGH = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
        for (let i = this._activeScouts.length - 1; i >= 0; i--) {
            const s = this._activeScouts[i];
            if (s.returnGameHours <= currentGH) {
                const fam = this.families[s.familyIdx];
                if (fam) {
                    fam.onVoyage = false;

                    // 15% chance scout gets caught
                    if (Math.random() < 0.15) {
                        this._showNotification(`\u{26A0} ${fam.name} a ete repere en eclairant ! Retour sans informations, -5% satisfaction`, '#d88888');
                        this._adjustSatisfaction(-5);
                    } else {
                        // Success: generate and store intel
                        const intel = this._generateEnemyArmy(s.targetOwner);
                        intel.day = this._gameDay;
                        this._scoutedIntel[s.targetOwner] = intel;

                        const targetRegion = GameMap.regions.find(r => r.owner === s.targetOwner);
                        const targetName = targetRegion ? targetRegion.name : 'Royaume inconnu';
                        this._showNotification(`\u{1F441} ${fam.name} revient avec des renseignements sur ${targetName} !`, '#a8d8a8');
                    }
                }
                this._activeScouts.splice(i, 1);
                this._updateHUD();
            }
        }
    },

    // ==================== RAID SYSTEM ====================

    _getPlayerArmyStrength() {
        let soldiers = 0, archers = 0, cavaliers = 0;
        let strength = 0;
        for (const fam of this.families) {
            if (!fam.militaryType || fam.onVoyage) continue;
            if (fam.training && fam.training.cyclesLeft > 0) continue;
            const totalStats = fam.stats.esquive + fam.stats.force + fam.stats.defense;
            let multiplier = 1 + totalStats / 30;
            if (fam.weapon === 'simpleWeapon') multiplier += 0.07;
            if (fam.weapon === 'heavyWeapon') multiplier += 0.10;
            if (fam.mount === 'horse') multiplier += 0.05;
            if (fam.mount === 'chariot') multiplier += 0.08;
            let base = 0;
            if (fam.militaryType === 'soldier') { soldiers++; base = 3; }
            else if (fam.militaryType === 'archer') { archers++; base = 4; }
            else if (fam.militaryType === 'cavalier') { cavaliers++; base = 6; }
            strength += Math.round(base * multiplier);
        }
        return {
            soldiers, archers, cavaliers, strength,
            total: soldiers + archers + cavaliers
        };
    },

    _sendRaid(targetOwner) {
        // Gather all available military families
        const raidFamilies = [];
        for (let i = 0; i < this.families.length; i++) {
            const fam = this.families[i];
            if (!fam.militaryType || fam.onVoyage) continue;
            if (fam.training && fam.training.cyclesLeft > 0) continue;
            if (fam.training && fam.training.pendingPoints > 0) continue;
            raidFamilies.push(i);
        }

        if (raidFamilies.length === 0) {
            this._showNotification(`\u{26A0} Aucun soldat disponible pour un raid !`, '#d88888');
            return;
        }

        // Cost: 20 gold + 15 food
        if ((this.resources.gold || 0) < 20 || (this.resources.food || 0) < 15) {
            this._showNotification(`\u{26A0} 20 or et 15 nourriture necessaires pour un raid`, '#d88888');
            return;
        }
        this.resources.gold -= 20;
        this.resources.food -= 15;

        // Mark all raid families as on voyage
        for (const fi of raidFamilies) {
            this.families[fi].onVoyage = true;
        }

        // Calculate player raid strength (with equipment bonuses)
        let strength = 0;
        let hasCow = false;
        for (const fi of raidFamilies) {
            const fam = this.families[fi];
            const totalStats = fam.stats.esquive + fam.stats.force + fam.stats.defense;
            let multiplier = 1 + totalStats / 30;
            if (fam.weapon === 'simpleWeapon') multiplier += 0.07;
            if (fam.weapon === 'heavyWeapon') multiplier += 0.10;
            if (fam.mount === 'horse') multiplier += 0.05;
            if (fam.mount === 'chariot') multiplier += 0.08;
            if (fam.mount === 'cow') hasCow = true;
            let base = 0;
            if (fam.militaryType === 'soldier') base = 3;
            else if (fam.militaryType === 'archer') base = 4;
            else if (fam.militaryType === 'cavalier') base = 6;
            strength += base * multiplier;
        }
        strength = Math.round(strength);

        const currentGH = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
        const duration = 48 + Math.random() * 48; // 2-4 days
        this._activeRaids.push({
            familyIndices: raidFamilies,
            targetOwner,
            returnGameHours: currentGH + duration,
            strength,
            hasCow
        });

        const targetRegion = GameMap.regions.find(r => r.owner === targetOwner);
        const targetName = targetRegion ? targetRegion.name : 'Royaume inconnu';
        this._showNotification(`\u{2694} Raid lance contre ${targetName} avec ${raidFamilies.length} famille(s) !`, '#d8a888');
        this._updateHUD();
    },

    _checkRaidReturns() {
        if (!this._activeRaids || this._activeRaids.length === 0) return;
        if (this._timeSpeed === 0 || this._dayTransitionActive) return;

        const currentGH = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
        for (let i = this._activeRaids.length - 1; i >= 0; i--) {
            const raid = this._activeRaids[i];
            if (raid.returnGameHours <= currentGH) {
                // Resolve combat
                const enemy = this._generateEnemyArmy(raid.targetOwner);
                const playerStr = raid.strength;
                const enemyStr = enemy.strength;
                const ratio = playerStr / Math.max(1, enemyStr);

                const targetRegion = GameMap.regions.find(r => r.owner === raid.targetOwner);
                const targetName = targetRegion ? targetRegion.name : 'Royaume inconnu';

                // Determine casualties
                let casualties = 0;
                let victory = false;
                const cowBonus = raid.hasCow ? 1.15 : 1;

                if (ratio > 1.5) {
                    // Decisive victory
                    victory = true;
                    casualties = Math.random() < 0.2 ? 1 : 0;
                    const loot = {
                        gold: Math.floor((30 + Math.floor(Math.random() * 40)) * cowBonus),
                        wood: Math.floor((20 + Math.floor(Math.random() * 30)) * cowBonus),
                        food: Math.floor((15 + Math.floor(Math.random() * 20)) * cowBonus)
                    };
                    this.resources.gold = (this.resources.gold || 0) + loot.gold;
                    this._addResource('wood', loot.wood);
                    this._addResource('food', loot.food);
                    this._adjustSatisfaction(8);
                    this._showNotification(`\u{1F3C6} Victoire ecrasante contre ${targetName} ! +${loot.gold} or, +${loot.wood} bois, +${loot.food} nourriture${raid.hasCow ? ' (bonus vache)' : ''}`, '#a8d8a8');
                } else if (ratio > 0.8) {
                    // Close victory
                    victory = true;
                    casualties = 1 + (Math.random() < 0.3 ? 1 : 0);
                    const loot = { gold: Math.floor((15 + Math.floor(Math.random() * 20)) * cowBonus) };
                    this.resources.gold = (this.resources.gold || 0) + loot.gold;
                    this._adjustSatisfaction(3);
                    this._showNotification(`\u{2694} Victoire difficile contre ${targetName}. +${loot.gold} or, ${casualties} perte(s)`, '#e8d48a');
                } else {
                    // Defeat
                    victory = false;
                    casualties = 1 + Math.floor(Math.random() * Math.min(3, raid.familyIndices.length));
                    this._adjustSatisfaction(-10);
                    this._showNotification(`\u{1F480} Defaite contre ${targetName} ! ${casualties} famille(s) perdue(s), -10% satisfaction`, '#d88888');
                }

                // Return surviving families
                const shuffled = [...raid.familyIndices].sort(() => Math.random() - 0.5);
                const dead = shuffled.slice(0, Math.min(casualties, shuffled.length));
                const alive = shuffled.slice(Math.min(casualties, shuffled.length));

                for (const fi of alive) {
                    if (this.families[fi]) {
                        this.families[fi].onVoyage = false;
                    }
                }

                // Remove dead families (in reverse order to keep indices valid)
                // Note: raid.familyIndices is cleaned up by _removeFamilyAt too,
                // but we already captured dead[] above so iteration is stable.
                const deadSorted = dead.sort((a, b) => b - a);
                for (const fi of deadSorted) {
                    if (!this.families[fi]) continue;
                    const deadFam = this.families[fi];
                    this._showNotification(`\u{1F3F4} ${deadFam.name} est tombee au combat...`, '#d88888');
                    this._removeFamilyAt(fi);
                }

                this._activeRaids.splice(i, 1);
                this._updateHUD();
            }
        }
    },

    _showNotification(text, color) {
        const container = document.getElementById('notifications-container');
        if (!container) return;
        const notif = document.createElement('div');
        notif.className = 'notification';
        if (color) notif.style.color = color;
        notif.textContent = text;
        container.appendChild(notif);
        setTimeout(() => {
            notif.classList.add('fade-out');
            setTimeout(() => notif.remove(), 500);
        }, 7000);
    },

    onMapClick(cellX, cellY) {
        const tile = GameMap.getTile(cellX, cellY);
        if (!tile) return;

        // If in build mode and a building is selected, place it
        if (this._buildMode && this._selectedBuild) {
            this._placeBuilding(cellX, cellY);
            return;
        }

        // If clicking the castle, open building detail for castle
        if (this._castlePlaced && cellX === this._castlePlaced.x && cellY === this._castlePlaced.y) {
            if (this._selectedBuilding === 'castle') {
                this._closeBuildingDetail();
            } else {
                this._openBuildingDetail('castle');
            }
            return;
        }

        // If clicking a building, open detail for that building
        if (tile.building) {
            const bIdx = this.buildings.findIndex(b => b.x === cellX && b.y === cellY);
            if (bIdx >= 0) {
                if (this._selectedBuilding === bIdx) {
                    this._closeBuildingDetail();
                } else {
                    this._openBuildingDetail(bIdx);
                }
                return;
            }
        }

        // Clicking empty space closes panels
        if (this._selectedBuilding !== null) {
            this._closeBuildingDetail();
        }
    },

    // ==================== WORLD MAP (M key) ====================

    _openWorldMap() {
        this._worldMapOpen = true;
        const overlay = document.getElementById('worldmap-overlay');
        const canvas = document.getElementById('worldmap-canvas');
        overlay.classList.add('active');

        const maxSize = Math.min(window.innerWidth - 80, window.innerHeight - 120);
        canvas.width = maxSize;
        canvas.height = maxSize;

        this._renderWorldMap(canvas);
    },

    _closeWorldMap() {
        this._worldMapOpen = false;
        document.getElementById('worldmap-overlay').classList.remove('active');
    },

    _renderWorldMap(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const scaleX = w / GameMap.width;
        const scaleY = h / GameMap.height;

        const imageData = ctx.createImageData(w, h);
        const data = imageData.data;

        for (let py = 0; py < h; py++) {
            const ty = Math.floor((py / h) * GameMap.height);
            for (let px = 0; px < w; px++) {
                const tx = Math.floor((px / w) * GameMap.width);
                const tile = GameMap.tiles[ty][tx];
                const c = GameMap._terrainRGB(tile.terrain, tx, ty);
                const idx = (py * w + px) * 4;
                data[idx] = c[0];
                data[idx + 1] = c[1];
                data[idx + 2] = c[2];
                data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);

        for (const region of GameMap.regions) {
            if (region.owner < 0 || !region.color) continue;
            ctx.fillStyle = region.color + '40';
            for (const t of region.tiles) {
                ctx.fillRect(t.x * scaleX, t.y * scaleY, scaleX + 0.5, scaleY + 0.5);
            }
        }

        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 0.3;
        for (let y = 0; y < GameMap.height; y++) {
            for (let x = 0; x < GameMap.width; x++) {
                const tile = GameMap.tiles[y][x];
                if (tile.regionId < 0) continue;
                const right = GameMap.getTile(x + 1, y);
                const bottom = GameMap.getTile(x, y + 1);
                if (right && right.regionId >= 0 && right.regionId !== tile.regionId) {
                    ctx.beginPath();
                    ctx.moveTo((x + 1) * scaleX, y * scaleY);
                    ctx.lineTo((x + 1) * scaleX, (y + 1) * scaleY);
                    ctx.stroke();
                }
                if (bottom && bottom.regionId >= 0 && bottom.regionId !== tile.regionId) {
                    ctx.beginPath();
                    ctx.moveTo(x * scaleX, (y + 1) * scaleY);
                    ctx.lineTo((x + 1) * scaleX, (y + 1) * scaleY);
                    ctx.stroke();
                }
            }
        }

        ctx.strokeStyle = 'rgba(200,168,74,0.5)';
        ctx.lineWidth = 1;
        for (let y = 0; y < GameMap.height; y++) {
            for (let x = 0; x < GameMap.width; x++) {
                const tile = GameMap.tiles[y][x];
                if (tile.owner < 0) continue;
                const right = GameMap.getTile(x + 1, y);
                const bottom = GameMap.getTile(x, y + 1);
                if (right && right.owner !== tile.owner) {
                    ctx.beginPath();
                    ctx.moveTo((x + 1) * scaleX, y * scaleY);
                    ctx.lineTo((x + 1) * scaleX, (y + 1) * scaleY);
                    ctx.stroke();
                }
                if (bottom && bottom.owner !== tile.owner) {
                    ctx.beginPath();
                    ctx.moveTo(x * scaleX, (y + 1) * scaleY);
                    ctx.lineTo((x + 1) * scaleX, (y + 1) * scaleY);
                    ctx.stroke();
                }
            }
        }

        if (this._castlePlaced) {
            const cx = (this._castlePlaced.x + 0.5) * scaleX;
            const cy = (this._castlePlaced.y + 0.5) * scaleY;
            const sz = Math.max(14, scaleX * 3);
            ctx.font = `${sz}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 3;
            ctx.fillText('\u{1F3F0}', cx, cy);
            ctx.shadowBlur = 0;
        }

        const cellPx = CONFIG.CELL_SIZE;
        const zoom = Camera.zoom;
        const vpLeft = (Camera.x / (cellPx * zoom)) * scaleX;
        const vpTop = (Camera.y / (cellPx * zoom)) * scaleY;
        const vpW = (Renderer.canvas.width / (cellPx * zoom)) * scaleX;
        const vpH = (Renderer.canvas.height / (cellPx * zoom)) * scaleY;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(vpLeft, vpTop, vpW, vpH);

        ctx.font = '11px Cinzel, serif';
        ctx.textAlign = 'center';
        for (const region of GameMap.regions) {
            if (region.owner < 0 || !region.name) continue;
            const cx = region.center.x * scaleX;
            const cy = region.center.y * scaleY;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(cx - 40, cy + 8, 80, 14);
            ctx.fillStyle = region.color || '#fff';
            ctx.fillText(region.name, cx, cy + 18);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    try {
        Game.init();
        console.log('[SdC] Game initialized successfully');
    } catch(e) {
        console.error('[SdC] Init error:', e);
        alert('Erreur initialisation: ' + e.message);
    }
});
