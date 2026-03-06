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

    // Families: [{ name, man, woman, job }]
    families: [],

    // Buildings placed: [{ type, x, y }]
    buildings: [],

    // Build mode
    _buildMode: false,
    _selectedBuild: null,

    // Info panel
    _infoPanelOpen: false,
    _infoTab: 'buildings',

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
                else if (this._infoPanelOpen) this._closeInfoPanel();
            }
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
                    const terrain = GameMap._elevToTerrain(finalElev, moisture);

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

    _updatePlacementInfo(tileX, tileY) {
        const tile = GameMap.getTile(tileX, tileY);
        const info = document.getElementById('placement-info');
        if (!tile) return;

        const terrainName = CONFIG.TERRAIN_NAMES[tile.terrain] || 'Inconnu';
        const valid = GameMap.isValidKingdomSpot(tileX, tileY);
        const isCenter = GameMap.isCenterZone(tileX, tileY);

        if (tile.terrain <= CONFIG.TERRAIN.WATER) {
            info.textContent = `${terrainName} - Impossible de fonder ici`;
            info.style.color = '#d8a8a8';
        } else if (isCenter) {
            info.textContent = `${terrainName} (${tileX}, ${tileY}) - Trop au centre, les ennemis n'auraient pas assez d'espace`;
            info.style.color = '#d8a8a8';
        } else if (!valid) {
            info.textContent = `${terrainName} (${tileX}, ${tileY}) - Pas assez de terre cultivable`;
            info.style.color = '#d8a8a8';
        } else {
            info.textContent = `${terrainName} (${tileX}, ${tileY}) - Bon emplacement pour votre royaume`;
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

        Renderer.setIsoMode(true);
        Camera.zoom = 2.0;

        this._running = true;
        this._worldMapOpen = false;
        this._worldMapBuffer = null;
        this._buildMode = false;
        this._selectedBuild = null;
        this._infoPanelOpen = false;

        // Init resources
        this.resources = { ...CONFIG.START_RESOURCES };
        this.buildings = [];
        this.houses = 0;

        // Start with 1 family
        this.families = [
            this._generateFamily()
        ];

        // Show HUD
        document.getElementById('hud-bar').classList.add('active');
        this._updateHUD();

        // Build the build menu items
        this._buildBuildMenu();

        if (this._castlePlaced) {
            Camera.centerOnCell(this._castlePlaced.x, this._castlePlaced.y);
        }

        this._gameLoop();
    },

    _generateFamily() {
        const manNames = ['Guillaume', 'Henri', 'Robert', 'Arnaud', 'Pierre', 'Jean', 'Thibaut', 'Gaultier', 'Renaud', 'Baudouin'];
        const womanNames = ['Marguerite', 'Isabelle', 'Aliénor', 'Blanche', 'Mathilde', 'Jeanne', 'Adele', 'Beatrice', 'Constance', 'Heloise'];
        const surnames = ['Dupont', 'Leblanc', 'Moreau', 'Lefebvre', 'Chevalier', 'Duval', 'Fontaine', 'Lambert', 'Marchand', 'Beaumont'];
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        const surname = pick(surnames);
        return {
            name: 'Famille ' + surname,
            man: pick(manNames) + ' ' + surname,
            woman: pick(womanNames) + ' ' + surname,
            job: null // unassigned
        };
    },

    _updateHUD() {
        document.getElementById('hud-wood').textContent = this.resources.wood;
        document.getElementById('hud-stone').textContent = this.resources.stone;
        document.getElementById('hud-iron').textContent = this.resources.iron;
        document.getElementById('hud-gold').textContent = this.resources.gold;
        document.getElementById('hud-food').textContent = this.resources.food;
        document.getElementById('hud-houses').textContent = this.houses;
        document.getElementById('hud-families').textContent = this.families.length;
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
            const hint = document.getElementById('build-hint');
            hint.textContent = `${bld.name} - Cliquez sur la carte pour placer`;
            hint.classList.add('active');
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
        if (tile.terrain <= CONFIG.TERRAIN.WATER || tile.terrain >= CONFIG.TERRAIN.MOUNTAIN) return;
        if (tile.building) return;

        // Check it's in the player's region or nearby
        if (tile.owner !== 0) return;

        // Spend resources
        for (const [res, amount] of Object.entries(bld.cost)) {
            this.resources[res] -= amount;
        }

        // Place
        tile.building = type;
        this.buildings.push({ type, x: cellX, y: cellY });

        // Rebuild terrain buffer to clear old state
        Renderer._bufferDirty = true;

        this._updateHUD();
        this._refreshBuildMenu();

        // Exit build mode
        this._closeBuildMenu();
    },

    // ==================== INFO PANEL (cabin click) ====================

    _openInfoPanel() {
        this._infoPanelOpen = true;
        this._closeBuildMenu();
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
        // Count buildings by type
        const counts = {};
        for (const b of this.buildings) {
            counts[b.type] = (counts[b.type] || 0) + 1;
        }

        let html = '';

        // Always show the main cabin
        html += `<div class="info-building-row"><span class="ib-icon">\u{1F3F0}</span><span class="ib-name">Chateau (Cabane de base)</span><span class="ib-count">1</span></div>`;

        for (const [key, bld] of Object.entries(CONFIG.BUILDINGS)) {
            const count = counts[key] || 0;
            html += `<div class="info-building-row"><span class="ib-icon">${bld.icon}</span><span class="ib-name">${bld.name}</span><span class="ib-count">${count}</span></div>`;
        }

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

        // Available jobs based on buildings
        const availableJobs = this._getAvailableJobs();

        let html = '';
        for (let i = 0; i < this.families.length; i++) {
            const fam = this.families[i];
            const jobOptions = this._buildJobOptions(fam.job, availableJobs);

            html += `<div class="info-family-row">
                <div>
                    <div class="info-family-name">${fam.name}</div>
                    <div class="info-family-members">${fam.man} & ${fam.woman}</div>
                </div>
                <select class="info-family-job" data-family="${i}">
                    <option value=""${!fam.job ? ' selected' : ''}>Sans metier</option>
                    ${jobOptions}
                </select>
            </div>`;
        }

        container.innerHTML = html;

        // Add change listeners
        container.querySelectorAll('.info-family-job').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.family);
                const newJob = e.target.value || null;
                this.families[idx].job = newJob;
                // Re-render to update slot counts
                this._renderInfoContent();
            });
        });
    },

    _getAvailableJobs() {
        // Count buildings and how many families are assigned to each job
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

    _gameLoop() {
        if (!this._running) return;
        Camera.update();
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

        // If clicking the castle, open info panel
        if (this._castlePlaced && cellX === this._castlePlaced.x && cellY === this._castlePlaced.y) {
            if (this._infoPanelOpen) this._closeInfoPanel();
            else this._openInfoPanel();
            return;
        }

        // If clicking a building, also open info
        if (tile.building) {
            this._openInfoPanel();
            return;
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
