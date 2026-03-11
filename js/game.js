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

    // Families: [{ name, man, woman, job, buildingIdx, militaryType, stats, training, hasChild, onVoyage, weapon }]
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

        // Init resources (8 types)
        this.resources = { ...CONFIG.START_RESOURCES };
        this.buildings = [];
        this.houses = 0;

        // Start with 1 family
        this.families = [
            this._generateFamily()
        ];

        // Pending families
        this._pendingFamilies = [];
        this._dayTransitionActive = false;

        // Satisfaction system (persistent, event-based, 0-100)
        this._satisfaction = 60;
        this._totalGameHours = 0;

        // Commerce voyages: [{ familyIdx, goldCarried, returnGameHours, items }]
        this._activeVoyages = [];

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
            buildingIdx: -1,
            militaryType: null, // 'soldier' | 'archer' | 'cavalier'
            stats: { esquive: 0, force: 0, defense: 0 },
            training: null, // { cyclesLeft: N } or null
            hasChild: false,
            onVoyage: false,
            weapon: null // 'simpleWeapon' | 'heavyWeapon' | null
        };
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

    // ==================== PRODUCTION TICK ====================
    // 4 cycles per day = 1 cycle every 6 game hours

    _productionTick() {
        if (this._timeSpeed === 0 || this._dayTransitionActive) return;

        const currentGameHours = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
        const hoursSinceLastProd = currentGameHours - this._prodCycleGameHours;
        if (hoursSinceLastProd < 6) return;
        this._prodCycleGameHours = currentGameHours;

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

            // Child bonus: +25% if family has child (niv2 house)
            const fam = this.families[b.familyIdx];
            const childBonus = fam.hasChild ? 1.25 : 1.0;

            for (const [res, baseAmt] of Object.entries(def.production)) {
                let amount = baseAmt;
                // Upgrade bonuses
                const lvl = b.level || 1;
                if (lvl > 1 && def.upgrades) {
                    for (let u = 0; u < lvl - 1 && u < def.upgrades.length; u++) {
                        const bonus = def.upgrades[u].productionBonus;
                        if (bonus && bonus[res]) amount += bonus[res];
                    }
                }
                this._addResource(res, Math.floor(amount * prodMultiplier * childBonus));
            }
        }

        // --- Mine production (chance-based) ---
        for (const b of this.buildings) {
            if (b.type !== 'mine') continue;
            if (b.familyIdx < 0 || !this.families[b.familyIdx]) continue;
            const lvl = b.level || 1;
            const def = CONFIG.BUILDINGS.mine;
            const rates = def.mineRates[lvl - 1];
            if (!rates) continue;

            const fam = this.families[b.familyIdx];
            const childBonus = fam.hasChild ? 1.25 : 1.0;

            this._addResource('stone', Math.floor(rates.stone * prodMultiplier * childBonus));
            if (Math.random() < rates.ironOreChance) {
                this._addResource('ironOre', 1);
            }
            if (Math.random() < rates.goldOreChance) {
                this._addResource('goldOre', 1);
            }
        }

        // --- Fonderie conversion (minerai → lingot) ---
        for (const b of this.buildings) {
            if (b.type !== 'foundry') continue;
            // Fonderie works with or without family (optionnel)
            const lvl = b.level || 1;
            const def = CONFIG.BUILDINGS.foundry;
            const rates = def.foundryRates[lvl - 1];
            if (!rates) continue;

            // Iron: consume oreNeeded ironOre → produce ingotProduced ironIngot
            if ((this.resources.ironOre || 0) >= rates.oreNeeded) {
                this.resources.ironOre -= rates.oreNeeded;
                this._addResource('ironIngot', rates.ingotProduced);
            }
            // Gold: consume oreNeeded goldOre → produce ingotProduced goldIngot
            if ((this.resources.goldOre || 0) >= rates.oreNeeded) {
                this.resources.goldOre -= rates.oreNeeded;
                this._addResource('goldIngot', rates.ingotProduced);
            }
        }

        // --- Food consumption (2 food/cycle per family, 3 if niv2 house with child) ---
        this._consumeFood();

        // --- Training progress ---
        this._tickTraining();

        this._updateHUD();
    },

    _consumeFood() {
        // 4 cycles/day, 8 food/day per family = 2 per cycle. Niv2 house: 12/day = 3 per cycle
        let totalNeeded = 0;
        for (let i = 0; i < this.families.length; i++) {
            const fam = this.families[i];
            if (fam.onVoyage) continue; // travelling families don't eat from village stock
            const perCycle = fam.hasChild ? 3 : 2;
            totalNeeded += perCycle;
        }

        if ((this.resources.food || 0) >= totalNeeded) {
            this.resources.food -= totalNeeded;
        } else {
            // Not enough food — some families go hungry
            const fed = this.resources.food || 0;
            this.resources.food = 0;
            const unfedFamilies = Math.ceil((totalNeeded - fed) / 2);
            // -8% satisfaction per underfed family
            this._satisfaction = Math.max(0, this._satisfaction - (unfedFamilies * 8));
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
                    // Training complete — +1 to a random relevant stat
                    const statKeys = ['esquive', 'force', 'defense'];
                    const pick = statKeys[Math.floor(Math.random() * statKeys.length)];
                    fam.stats[pick] = (fam.stats[pick] || 0) + 1;
                    fam.training = null;
                    this._showNotification(`\u{2694} ${fam.name} a termine l'entrainement ! +1 ${pick}`, '#a8d8a8');
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
    },

    // ==================== BUILD MENU ====================

    _buildBuildMenu() {
        const menu = document.getElementById('build-menu');
        menu.innerHTML = '';

        for (const [key, bld] of Object.entries(CONFIG.BUILDINGS)) {
            const item = document.createElement('div');
            item.className = 'build-item';
            item.dataset.type = key;

            const costStr = Object.entries(bld.cost).map(([r, v]) => `${v} ${CONFIG.RESOURCE_NAMES[r] || r}`).join(', ');
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
            const alreadyBuilt = bld.unique && this.buildings.some(b => b.type === type);
            const shouldDisable = !canAfford || alreadyBuilt;
            const isSelected = this._selectedBuild === type;
            // Only toggle classes when state actually changes to avoid cursor flicker
            if (item.classList.contains('disabled') !== shouldDisable) {
                item.classList.toggle('disabled', shouldDisable);
            }
            if (item.classList.contains('selected') !== isSelected) {
                item.classList.toggle('selected', isSelected);
            }
            // Update cost text to show "Deja construit" for unique buildings
            const costEl = item.querySelector('.build-cost');
            if (costEl && alreadyBuilt) {
                if (costEl.textContent !== 'Deja construit') {
                    costEl.textContent = 'Deja construit';
                    costEl.style.color = '#d88888';
                }
            } else if (costEl && !alreadyBuilt) {
                const costStr = Object.entries(bld.cost).map(([r, v]) => `${v} ${CONFIG.RESOURCE_NAMES[r] || r}`).join(', ');
                if (costEl.textContent !== costStr) {
                    costEl.textContent = costStr;
                    costEl.style.color = '';
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
            this._satisfaction = Math.max(0, this._satisfaction - 15);
            this._showNotification(`\u{1F3E0} Maison detruite ! Famille partie, -15% satisfaction`, '#d88888');
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
        if (hasBarracks) this._satisfaction = Math.min(100, this._satisfaction + 1);
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
                html += `<div><div style="color:var(--parchment);font-size:0.78rem;">${fam.name}</div><div style="color:#6a5a3a;font-size:0.68rem;">${fam.man} & ${fam.woman}</div></div>`;
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
                html += `${rates.oreNeeded} minerai \u2192 ${rates.ingotProduced} lingot(s)<br>`;
                html += `<span style="font-size:0.75rem;color:#8a7a5a;">Fonctionne sans famille assignee</span>`;
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
            html += `<div class="bd-section"><div class="bd-label">Logement</div><div class="bd-value">1 famille${hasChild ? ' + enfant (+25% prod, conso x1.5)' : ''}</div></div>`;
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

        // === Multi-family building (barracks) ===
        if (def.multiFamily && b.familyIndices) {
            html += `<div class="bd-section"><div class="bd-label">Familles assignees (${b.familyIndices.length})</div>`;
            // List assigned families with remove button
            for (const fi of b.familyIndices) {
                const fam = this.families[fi];
                if (!fam) continue;
                const typeStr = fam.militaryType ? (fam.militaryType === 'soldier' ? 'Soldat' : fam.militaryType === 'archer' ? 'Archer' : 'Cavalier') : 'Non assigne';
                const trainingStr = fam.training ? ` (entrainement: ${fam.training.cyclesLeft} cycles)` : '';
                html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(200,168,74,0.06);">`;
                html += `<span style="font-size:0.78rem;color:var(--parchment);">${fam.name} - ${typeStr}${trainingStr}</span>`;
                html += `<button class="bd-barracks-remove" data-fi="${fi}" style="background:none;border:1px solid #d88888;color:#d88888;padding:2px 6px;font-size:0.68rem;cursor:pointer;border-radius:3px;">Retirer</button>`;
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
                // Military type selector
                html += ` <select class="bd-family-select" id="bd-barracks-type" style="width:30%;display:inline-block;">`;
                html += `<option value="soldier">Soldat</option>`;
                html += `<option value="archer">Archer</option>`;
                html += `<option value="cavalier">Cavalier</option>`;
                html += `</select>`;
                html += `</div>`;
            }
            // Training button
            if (b.familyIndices.length > 0) {
                const untrained = b.familyIndices.filter(fi => this.families[fi] && !this.families[fi].training);
                if (untrained.length > 0) {
                    html += `<div style="margin-top:6px;">`;
                    html += `<select class="bd-family-select" id="bd-train-select" style="width:60%;display:inline-block;">`;
                    for (const fi of untrained) {
                        const f = this.families[fi];
                        const tStr = f.militaryType === 'soldier' ? 'Soldat' : f.militaryType === 'archer' ? 'Archer' : 'Cavalier';
                        html += `<option value="${fi}">${f.name} (${tStr})</option>`;
                    }
                    html += `</select>`;
                    html += ` <button class="bd-upgrade-btn" id="bd-train-btn" style="width:35%;display:inline-block;padding:4px 8px;font-size:0.72rem;">Entrainer</button>`;
                    html += `</div>`;
                    // Show training cost
                    html += `<div style="font-size:0.72rem;color:#8a7a5a;margin-top:4px;">Cout: 8-12 nourriture + 10-25 or (selon type)</div>`;
                }
            }
            html += `</div>`;
        }

        // === Comptoir: shop + lingot selling + voyages ===
        if (b.type === 'comptoir') {
            // Lingot selling
            html += `<div class="bd-section"><div class="bd-label">Vendre des lingots</div>`;
            const ironCount = this.resources.ironIngot || 0;
            const goldCount = this.resources.goldIngot || 0;
            html += `<div style="display:flex;gap:6px;margin-top:4px;">`;
            html += `<button class="bd-upgrade-btn${ironCount > 0 ? '' : ' disabled'}" id="bd-sell-iron" style="flex:1;padding:6px;font-size:0.72rem;" ${ironCount > 0 ? '' : 'disabled'}>Vendre Ling. Fer (${ironCount}) = ${CONFIG.LINGOT_PRICES.ironIngot} or</button>`;
            html += `<button class="bd-upgrade-btn${goldCount > 0 ? '' : ' disabled'}" id="bd-sell-gold" style="flex:1;padding:6px;font-size:0.72rem;" ${goldCount > 0 ? '' : 'disabled'}>Vendre Ling. Or (${goldCount}) = ${CONFIG.LINGOT_PRICES.goldIngot} or</button>`;
            html += `</div></div>`;

            // Shop items
            html += `<div class="bd-section"><div class="bd-label">Boutique</div>`;
            for (const [key, item] of Object.entries(def.shopItems)) {
                const canBuy = (this.resources.gold || 0) >= item.cost;
                html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(200,168,74,0.06);">`;
                html += `<div><span style="color:var(--parchment);font-size:0.78rem;">${item.name}</span><br><span style="color:#8a7a5a;font-size:0.68rem;">${item.desc}</span></div>`;
                html += `<button class="bd-upgrade-btn bd-shop-buy${canBuy ? '' : ' disabled'}" data-item="${key}" style="padding:4px 8px;font-size:0.72rem;width:auto;" ${canBuy ? '' : 'disabled'}>${item.cost} or</button>`;
                html += `</div>`;
            }
            html += `</div>`;

            // Active voyages
            if (this._activeVoyages && this._activeVoyages.length > 0) {
                html += `<div class="bd-section"><div class="bd-label">Voyages en cours</div>`;
                const currentGH = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
                for (const v of this._activeVoyages) {
                    const fam = this.families[v.familyIdx];
                    const hoursLeft = Math.max(0, v.returnGameHours - currentGH);
                    html += `<div style="padding:3px 0;font-size:0.78rem;color:var(--parchment);">${fam ? fam.name : '?'} — retour dans ~${Math.ceil(hoursLeft)}h</div>`;
                }
                html += `</div>`;
            }

            // Send family on voyage
            const availableForVoyage = this.families.filter((f, i) => f.buildingIdx < 0 && !f.onVoyage);
            if (availableForVoyage.length > 0) {
                html += `<div class="bd-section"><div class="bd-label">Envoyer en voyage</div>`;
                html += `<select class="bd-family-select" id="bd-voyage-family">`;
                html += `<option value="-1">Choisir une famille...</option>`;
                for (let i = 0; i < this.families.length; i++) {
                    if (this.families[i].buildingIdx < 0 && !this.families[i].onVoyage) {
                        html += `<option value="${i}">${this.families[i].name}</option>`;
                    }
                }
                html += `</select>`;
                html += `<div style="font-size:0.72rem;color:#8a7a5a;margin-top:2px;">Cout: 20 or. Duree: 24-48h. Evenements aleatoires.</div>`;
                html += `<button class="bd-upgrade-btn${(this.resources.gold || 0) >= 20 ? '' : ' disabled'}" id="bd-send-voyage" style="margin-top:4px;" ${(this.resources.gold || 0) >= 20 ? '' : 'disabled'}>Envoyer (20 or)</button>`;
                html += `</div>`;
            }
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
                fam.training = { cyclesLeft: costs.cycles };
                this._updateHUD();
                this._renderBuildingDetail();
                this._showNotification(`\u{2694} ${fam.name} commence l'entrainement (${costs.cycles} cycles)`, '#a8c8d8');
            });
        }

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

        // Comptoir: shop buy
        content.querySelectorAll('.bd-shop-buy').forEach(btn => {
            if (btn.disabled) return;
            btn.addEventListener('click', () => {
                const itemKey = btn.dataset.item;
                const item = def.shopItems[itemKey];
                if (!item || (this.resources.gold || 0) < item.cost) return;
                this.resources.gold -= item.cost;
                this._showNotification(`\u{1F6D2} ${item.name} achete pour ${item.cost} or`, '#a8c8d8');
                this._updateHUD();
                this._renderBuildingDetail();
            });
        });

        // Comptoir: send voyage
        const sendVoyage = document.getElementById('bd-send-voyage');
        if (sendVoyage) {
            sendVoyage.addEventListener('click', () => {
                const voyageSelect = document.getElementById('bd-voyage-family');
                if (!voyageSelect) return;
                const fi = parseInt(voyageSelect.value);
                if (fi < 0 || !this.families[fi]) return;
                if ((this.resources.gold || 0) < 20) return;
                this.resources.gold -= 20;
                this.families[fi].onVoyage = true;
                const currentGH = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
                const duration = 24 + Math.random() * 24; // 24-48h
                this._activeVoyages.push({
                    familyIdx: fi,
                    goldCarried: 20,
                    returnGameHours: currentGH + duration,
                    items: []
                });
                this._showNotification(`\u{1F6B6} ${this.families[fi].name} part en voyage commercial`, '#a8c8d8');
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

        // Speed 1 → 1 real second = 4 game minutes
        // Speed 2 → 2x faster (8 game minutes per second)
        const baseSpeed = 4;
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
        this._checkPendingArrivals();
        this._checkVoyageReturns();
        // Live-refresh build menu if open
        if (this._buildMode) this._refreshBuildMenu();
        Renderer.render();
        requestAnimationFrame(() => this._gameLoop());
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

        const currentGH = (this._gameDay - 1) * 24 + this._gameHour + this._gameMinute / 60;
        for (let i = this._activeVoyages.length - 1; i >= 0; i--) {
            const v = this._activeVoyages[i];
            if (v.returnGameHours <= currentGH) {
                const fam = this.families[v.familyIdx];
                if (fam) {
                    fam.onVoyage = false;
                    // Random event on return
                    const roll = Math.random();
                    if (roll < 0.3) {
                        // Good: found gold
                        const bonus = 10 + Math.floor(Math.random() * 20);
                        this.resources.gold = (this.resources.gold || 0) + bonus;
                        this._showNotification(`\u{1F4B0} ${fam.name} revient avec ${bonus} or bonus !`, '#a8d8a8');
                    } else if (roll < 0.5) {
                        // Bad: attacked, lost gold
                        this._showNotification(`\u{2694} ${fam.name} a ete attaque en route ! Or perdu.`, '#d88888');
                        this._satisfaction = Math.max(0, this._satisfaction - 5);
                    } else {
                        // Normal return
                        this._showNotification(`\u{1F6B6} ${fam.name} est revenu du voyage.`, '#a8c8d8');
                    }
                }
                this._activeVoyages.splice(i, 1);
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
        }, 3500);
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
