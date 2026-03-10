// Main game controller
const Game = {
    seed: '',
    _running: false,
    _castlePlaced: null,
    _worldMapOpen: false,
    _worldMapBuffer: null,

    // Resources
    resources: { wood: 10, stone: 0, iron: 0, gold: 0, food: 5 },
    houses: 0,

    // Families: [{ name, man, woman, job, buildingIdx }]
    families: [],

    // Buildings placed: [{ type, x, y, level, familyIdx }]
    buildings: [],

    // Build mode
    _buildMode: false,
    _selectedBuild: null,

    // Info panel
    _infoPanelOpen: false,
    _infoTab: 'buildings',

    // Building detail panel
    _selectedBuilding: null, // index into this.buildings or 'castle'

    // Production timer
    _lastTick: 0,
    _tickInterval: 5000, // ms between production ticks

    // Time system
    _gameMinute: 0,
    _gameHour: 6,
    _gameDay: 1,
    _timeSpeed: 1,  // 0=paused, 1=normal, 2=x2
    _lastTimeUpdate: 0,
    _prevSpeed: 1,

    init() {
        document.getElementById('btn-new-game').addEventListener('click', () => this.newGame());
        document.getElementById('btn-continue').addEventListener('click', () => {});
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

        // Time controls — buttons added when game screen is active, not at init
        // (bound in _startMapView instead)

        // Key bindings
        window.addEventListener('keydown', (e) => {
            if (e.key === 'm' || e.key === 'M') {
                if (this._running && !this._infoPanelOpen) {
                    if (this._worldMapOpen) this._closeWorldMap();
                    else this._openWorldMap();
                }
            }
            if (e.key === 'b' || e.key === 'B') {
                if (this._running && !this._worldMapOpen) {
                    this._toggleBuildMenu();
                }
            }
            if (e.key === 'Escape') {
                if (this._worldMapOpen) this._closeWorldMap();
                else if (this._buildMode) this._closeBuildMenu();
                else if (this._selectedBuilding !== null) this._closeBuildingDetail();
                else if (this._infoPanelOpen) this._closeInfoPanel();
            }
            if (e.key === ' ' && this._running) {
                e.preventDefault();
                this._togglePause();
            }
            if (e.key === '1' && this._running) this._setTimeSpeed(1);
            if (e.key === '2' && this._running) this._setTimeSpeed(2);
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
        this._lastTick = Date.now();

        // Init time system
        this._gameMinute = 0;
        this._gameHour = 6;
        this._gameDay = 1;
        this._timeSpeed = 1;
        this._lastTimeUpdate = Date.now();
        this._prevSpeed = 1;

        // Init resources
        this.resources = { ...CONFIG.START_RESOURCES };
        this.buildings = [];
        this.houses = 0;

        // Start with 1 family
        this.families = [
            this._generateFamily()
        ];

        // Scheduled family arrivals
        this._pendingFamilies = [
            { day: 2, count: 2 }  // 2 families arrive on day 2
        ];
        this._dayTransitionActive = false;

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

        // Build the build menu items
        this._buildBuildMenu();

        if (this._castlePlaced) {
            Camera.centerOnCell(this._castlePlaced.x, this._castlePlaced.y);
        }

        this._gameLoop();
    },

    _generateFamily() {
        const manNames = ['Guillaume', 'Henri', 'Robert', 'Arnaud', 'Pierre', 'Jean', 'Thibaut', 'Gaultier', 'Renaud', 'Baudouin'];
        const womanNames = ['Marguerite', 'Isabelle', 'Alienor', 'Blanche', 'Mathilde', 'Jeanne', 'Adele', 'Beatrice', 'Constance', 'Heloise'];
        const surnames = ['Dupont', 'Leblanc', 'Moreau', 'Lefebvre', 'Chevalier', 'Duval', 'Fontaine', 'Lambert', 'Marchand', 'Beaumont'];
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        const surname = pick(surnames);
        return {
            name: 'Famille ' + surname,
            man: pick(manNames) + ' ' + surname,
            woman: pick(womanNames) + ' ' + surname,
            job: null,
            buildingIdx: -1 // index into this.buildings, -1 = unassigned
        };
    },

    // ==================== STORAGE ====================

    getStorageCapacity() {
        let cap = CONFIG.STORAGE.BASE_CAPACITY;
        for (const b of this.buildings) {
            if (b.type === 'warehouse') {
                const lvl = b.level || 1;
                if (lvl === 1) cap += CONFIG.STORAGE.PER_WAREHOUSE;
                else if (lvl === 2) cap += 75;
                else cap += 100;
            }
        }
        return cap;
    },

    _addResource(res, amount) {
        const cap = this.getStorageCapacity();
        this.resources[res] = Math.min(cap, (this.resources[res] || 0) + amount);
    },

    // ==================== HOUSING ====================

    getMaxFamilies() {
        // 1 base (castle) + houses
        let count = 1;
        for (const b of this.buildings) {
            if (b.type === 'house') {
                const lvl = b.level || 1;
                count += lvl; // lvl 1=1, lvl 2=2, lvl 3=3
            }
        }
        return count;
    },

    // ==================== PRODUCTION TICK ====================

    _productionTick() {
        // No production when paused
        if (this._timeSpeed === 0) return;

        const now = Date.now();
        const multiplier = this._timeSpeed === 2 ? 2 : 1;
        const effectiveInterval = this._tickInterval / multiplier;
        if (now - this._lastTick < effectiveInterval) return;
        this._lastTick = now;

        for (let i = 0; i < this.buildings.length; i++) {
            const b = this.buildings[i];
            const def = CONFIG.BUILDINGS[b.type];
            if (!def || !def.production) continue;

            // Only produce if a family is assigned
            if (b.familyIdx === undefined || b.familyIdx < 0) continue;
            const fam = this.families[b.familyIdx];
            if (!fam) continue;

            // Base production
            for (const [res, amount] of Object.entries(def.production)) {
                this._addResource(res, amount);
            }

            // Upgrade bonuses
            const lvl = b.level || 1;
            if (lvl > 1 && def.upgrades) {
                for (let u = 0; u < lvl - 1 && u < def.upgrades.length; u++) {
                    const bonus = def.upgrades[u].productionBonus;
                    if (bonus) {
                        for (const [res, amount] of Object.entries(bonus)) {
                            this._addResource(res, amount);
                        }
                    }
                }
            }
        }

        this._updateHUD();
    },

    _updateHUD() {
        const cap = this.getStorageCapacity();
        document.getElementById('hud-wood').textContent = this.resources.wood + '/' + cap;
        document.getElementById('hud-stone').textContent = this.resources.stone + '/' + cap;
        document.getElementById('hud-iron').textContent = this.resources.iron + '/' + cap;
        document.getElementById('hud-gold').textContent = this.resources.gold + '/' + cap;
        document.getElementById('hud-food').textContent = this.resources.food;
        document.getElementById('hud-families').textContent = this.families.length;

        // Free houses
        const freeHouses = Math.max(0, this.getMaxFamilies() - this.families.length);
        const freeEl = document.getElementById('hud-free-houses');
        if (freeEl) freeEl.textContent = freeHouses;

        // Idle families
        const idleFamilies = this.families.filter(f => f.buildingIdx < 0).length;
        const idleEl = document.getElementById('hud-idle-families');
        if (idleEl) idleEl.textContent = idleFamilies;

        // Arriving families
        const arrivingCount = this._pendingFamilies ? this._pendingFamilies.reduce((sum, p) => sum + p.count, 0) : 0;
        const arrEl = document.getElementById('hud-arriving');
        if (arrEl) arrEl.textContent = arrivingCount;
    },

    // ==================== BUILD MENU ====================

    _buildBuildMenu() {
        const menu = document.getElementById('build-menu');
        menu.innerHTML = '';

        for (const [key, bld] of Object.entries(CONFIG.BUILDINGS)) {
            const item = document.createElement('div');
            item.className = 'build-item';
            item.dataset.type = key;

            const costStr = Object.entries(bld.cost).map(([r, v]) => `${v} ${r}`).join(', ');
            item.innerHTML = `<span class="build-icon">${bld.icon}</span><span class="build-name">${bld.name}</span><span class="build-cost">${costStr}</span>`;

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
        const menu = document.getElementById('build-menu');
        menu.classList.add('active');
        this._refreshBuildMenu();
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
        const menu = document.getElementById('build-menu');
        for (const item of menu.children) {
            const type = item.dataset.type;
            const bld = CONFIG.BUILDINGS[type];
            const canAfford = this._canAfford(bld.cost);
            item.classList.toggle('disabled', !canAfford);
            item.classList.toggle('selected', this._selectedBuild === type);
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

        // Check terrain restriction
        if (bld.terrain && !bld.terrain.includes(tile.terrain)) return;

        // Check it's in the player's region
        if (tile.owner !== 0) return;

        // Spend resources
        for (const [res, amount] of Object.entries(bld.cost)) {
            this.resources[res] -= amount;
        }

        // Place
        tile.building = type;
        const buildingData = { type, x: cellX, y: cellY, level: 1, familyIdx: -1 };
        this.buildings.push(buildingData);

        // Houses: check if we can recruit a new family
        if (type === 'house') {
            this._checkRecruitFamily();
        }

        // Rebuild terrain buffer to clear old state
        Renderer._bufferDirty = true;

        this._updateHUD();
        this._refreshBuildMenu();

        // Exit build mode
        this._closeBuildMenu();
    },

    _checkRecruitFamily() {
        const maxFam = this.getMaxFamilies();
        if (this.families.length < maxFam) {
            this.families.push(this._generateFamily());
        }
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

        const cap = this.getStorageCapacity();
        html += `<div class="info-building-row" style="margin-top:8px;border-top:1px solid rgba(200,168,74,0.2);padding-top:8px;"><span class="ib-icon">\u{1F4E6}</span><span class="ib-name">Capacite de stockage</span><span class="ib-count">${cap}</span></div>`;

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

            html += `<div class="info-family-row">
                <div>
                    <div class="info-family-name">${fam.name}</div>
                    <div class="info-family-members">${fam.man} & ${fam.woman}</div>
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
            titleEl.textContent = '\u{1F3F0} Chateau';
            let html = '';

            // === GENERAL ===
            html += `<div class="bd-category"><div class="bd-category-title">General</div>`;
            html += `<div class="bd-section"><div class="bd-label">Description</div><div class="bd-value">Le coeur de votre royaume. Centre de commandement.</div></div>`;
            html += `<div class="bd-section"><div class="bd-label">Jour</div><div class="bd-value">Jour ${this._gameDay}</div></div>`;
            html += `</div>`;

            // === POPULATION ===
            html += `<div class="bd-category"><div class="bd-category-title">Population</div>`;
            html += `<div class="bd-section"><div class="bd-label">Familles</div><div class="bd-value">${this.families.length} / ${this.getMaxFamilies()}</div></div>`;
            const idleFamilies = this.families.filter(f => f.buildingIdx < 0).length;
            html += `<div class="bd-section"><div class="bd-label">Sans emploi</div><div class="bd-value" style="color:${idleFamilies > 0 ? '#d8a8a8' : '#a8d8a8'}">${idleFamilies}</div></div>`;
            if (this._pendingFamilies && this._pendingFamilies.length > 0) {
                html += `<div class="bd-section"><div class="bd-label">En route</div><div class="bd-value">${this._pendingFamilies.length} famille(s) attendues</div></div>`;
            }
            html += `</div>`;

            // === ECONOMIE ===
            html += `<div class="bd-category"><div class="bd-category-title">Economie</div>`;
            html += `<div class="bd-section"><div class="bd-label">Stockage</div><div class="bd-value">${this.getStorageCapacity()} max</div></div>`;
            // Calculate total production
            const totalProd = {};
            for (const b of this.buildings) {
                const def = CONFIG.BUILDINGS[b.type];
                if (!def || !def.production || b.familyIdx < 0) continue;
                for (const [r, a] of Object.entries(def.production)) {
                    totalProd[r] = (totalProd[r] || 0) + a;
                }
                const lvl = b.level || 1;
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
            }
            const prodStr = Object.entries(totalProd).map(([r, a]) => `+${a} ${r}`).join(', ') || 'Aucune';
            html += `<div class="bd-section"><div class="bd-label">Production totale / cycle</div><div class="bd-value" style="color:#a8d8a8">${prodStr}</div></div>`;
            html += `</div>`;

            // === CONSTRUCTIONS ===
            html += `<div class="bd-category"><div class="bd-category-title">Constructions</div>`;
            const counts = {};
            for (const b of this.buildings) {
                counts[b.type] = (counts[b.type] || 0) + 1;
            }
            for (const [key, bld] of Object.entries(CONFIG.BUILDINGS)) {
                const count = counts[key] || 0;
                if (count > 0) {
                    html += `<div class="bd-section"><div class="bd-label">${bld.icon} ${bld.name}</div><div class="bd-value">${count}</div></div>`;
                }
            }
            if (Object.keys(counts).length === 0) {
                html += `<div class="bd-section"><div class="bd-value" style="color:#6a5a3a;font-style:italic">Aucune construction. Appuyez sur B.</div></div>`;
            }
            html += `</div>`;

            content.innerHTML = html;
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

        // Production info
        if (def.production) {
            let prodStr = '';
            const totalProd = { ...def.production };
            // Add upgrade bonuses
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
            prodStr = Object.entries(totalProd).map(([r, a]) => `+${a} ${r}`).join(', ');
            const isActive = b.familyIdx >= 0;
            html += `<div class="bd-section"><div class="bd-label">Production (par cycle)</div><div class="bd-value" style="color:${isActive ? '#a8d8a8' : '#d8a8a8'}">${prodStr}${isActive ? '' : ' (INACTIVE - pas de famille)'}</div></div>`;
        }

        // Special info for warehouse
        if (b.type === 'warehouse') {
            const bonusStr = lvl === 1 ? '+50' : lvl === 2 ? '+75' : '+100';
            html += `<div class="bd-section"><div class="bd-label">Bonus stockage</div><div class="bd-value">${bonusStr} capacite</div></div>`;
        }

        // Special info for house
        if (b.type === 'house') {
            html += `<div class="bd-section"><div class="bd-label">Logement</div><div class="bd-value">+${lvl} famille(s)</div></div>`;
        }

        // Assigned family
        const assignedFam = b.familyIdx >= 0 ? this.families[b.familyIdx] : null;
        if (def.job) {
            html += `<div class="bd-section"><div class="bd-label">Famille assignee</div>`;
            html += `<select class="bd-family-select" id="bd-family-select">`;
            html += `<option value="-1"${!assignedFam ? ' selected' : ''}>Aucune</option>`;
            for (let i = 0; i < this.families.length; i++) {
                const f = this.families[i];
                // Show families that are unassigned or assigned to this building
                const isFree = f.buildingIdx < 0 || f.buildingIdx === bIdx;
                if (!isFree) continue;
                html += `<option value="${i}"${b.familyIdx === i ? ' selected' : ''}>${f.name}</option>`;
            }
            html += `</select></div>`;
        }

        // Upgrade
        if (def.upgrades && lvl - 1 < def.upgrades.length) {
            const nextUpgrade = def.upgrades[lvl - 1];
            const costStr = Object.entries(nextUpgrade.cost).map(([r, v]) => `${v} ${r}`).join(', ');
            const canUpgrade = this._canAfford(nextUpgrade.cost);
            html += `<div class="bd-section bd-upgrade"><div class="bd-label">Amelioration : ${nextUpgrade.name}</div><div class="bd-value">Cout : ${costStr}</div>`;
            if (nextUpgrade.productionBonus) {
                const bonusStr = Object.entries(nextUpgrade.productionBonus).map(([r, a]) => `+${a} ${r}`).join(', ');
                html += `<div class="bd-value">Bonus : ${bonusStr}</div>`;
            }
            if (nextUpgrade.bonus) {
                html += `<div class="bd-value">Bonus : ${nextUpgrade.bonus}</div>`;
            }
            html += `<button class="bd-upgrade-btn${canUpgrade ? '' : ' disabled'}" id="bd-upgrade-btn"${canUpgrade ? '' : ' disabled'}>Ameliorer</button></div>`;
        } else {
            html += `<div class="bd-section"><div class="bd-label" style="color:#c8a84a;">Niveau maximum atteint</div></div>`;
        }

        content.innerHTML = html;

        // Bind events
        const famSelect = document.getElementById('bd-family-select');
        if (famSelect) {
            famSelect.addEventListener('change', (e) => {
                const newFamIdx = parseInt(e.target.value);
                // Unassign old family
                if (b.familyIdx >= 0 && this.families[b.familyIdx]) {
                    this.families[b.familyIdx].buildingIdx = -1;
                    this.families[b.familyIdx].job = null;
                }
                // Assign new family
                b.familyIdx = newFamIdx;
                if (newFamIdx >= 0 && this.families[newFamIdx]) {
                    this.families[newFamIdx].buildingIdx = bIdx;
                    this.families[newFamIdx].job = b.type;
                }
                this._renderBuildingDetail();
            });
        }

        const upgradeBtn = document.getElementById('bd-upgrade-btn');
        if (upgradeBtn && !upgradeBtn.disabled) {
            upgradeBtn.addEventListener('click', () => {
                this._upgradeBuilding(bIdx);
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

        // Spend resources
        for (const [res, amount] of Object.entries(upgrade.cost)) {
            this.resources[res] -= amount;
        }

        b.level = lvl + 1;

        // If house was upgraded, check for new family recruitment
        if (b.type === 'house') {
            this._checkRecruitFamily();
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

        // Speed 1 → 1 real second = 1 game minute
        // Speed 2 → 2x faster
        const multiplier = this._timeSpeed === 2 ? 2 : 1;
        this._gameMinute += (deltaMs / 1000) * multiplier;

        while (this._gameMinute >= 60) {
            this._gameMinute -= 60;
            this._gameHour++;
            if (this._gameHour >= 24) {
                this._gameHour = 0;
                this._gameDay++;
                this._onNewDay();
            }
        }

        this._updateTimeHUD();
    },

    _onNewDay() {
        // Process pending family arrivals
        const arrivals = [];
        if (this._pendingFamilies) {
            for (let i = this._pendingFamilies.length - 1; i >= 0; i--) {
                const pending = this._pendingFamilies[i];
                if (pending.day <= this._gameDay) {
                    const maxFam = this.getMaxFamilies();
                    for (let j = 0; j < pending.count && this.families.length < maxFam; j++) {
                        const fam = this._generateFamily();
                        this.families.push(fam);
                        arrivals.push(fam.name);
                    }
                    this._pendingFamilies.splice(i, 1);
                }
            }
        }

        // Show day transition overlay
        this._showDayTransition(arrivals);
    },

    _showDayTransition(arrivals) {
        this._dayTransitionActive = true;
        const overlay = document.getElementById('day-transition-overlay');
        const title = document.getElementById('day-transition-title');
        const summary = document.getElementById('day-transition-summary');

        title.textContent = `Jour ${this._gameDay}`;

        let summaryHtml = `<strong>Resume du jour precedent :</strong><br>`;
        summaryHtml += `Familles : ${this.families.length} / ${this.getMaxFamilies()}<br>`;
        summaryHtml += `Bois : ${this.resources.wood} | Pierre : ${this.resources.stone} | Fer : ${this.resources.iron} | Or : ${this.resources.gold}<br>`;
        summaryHtml += `Constructions : ${this.buildings.length}`;

        if (arrivals.length > 0) {
            summaryHtml += `<br><br><strong style="color:#a8d8a8;">Nouvelles familles arrivees !</strong><br>`;
            for (const name of arrivals) {
                summaryHtml += `- ${name}<br>`;
            }
        }

        summary.innerHTML = summaryHtml;
        overlay.classList.add('active');
    },

    _dismissDayTransition() {
        this._dayTransitionActive = false;
        document.getElementById('day-transition-overlay').classList.remove('active');
        this._updateHUD();
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

    _togglePause() {
        if (this._timeSpeed === 0) {
            this._timeSpeed = this._prevSpeed || 1;
        } else {
            this._prevSpeed = this._timeSpeed;
            this._timeSpeed = 0;
        }
        this._updateTimeHUD();
    },

    // ==================== GAME LOOP ====================

    _gameLoop() {
        if (!this._running) return;
        Camera.update();
        this._updateGameTime();
        this._productionTick();
        Renderer.render();
        requestAnimationFrame(() => this._gameLoop());
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
    Game.init();
});
