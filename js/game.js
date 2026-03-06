// Main game controller - minimal: map + placement only
const Game = {
    seed: '',
    _running: false,
    _castlePlaced: null, // { x, y } or null

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

        // Placement screen
        document.getElementById('btn-confirm-placement').addEventListener('click', () => this.confirmPlacement());

        // Options
        document.getElementById('opt-map-size').addEventListener('change', (e) => {
            const size = parseInt(e.target.value);
            CONFIG.MAP_WIDTH = size;
            CONFIG.MAP_HEIGHT = size;
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

        setTimeout(() => this._generateMapAsync(), 50);
    },

    _generateMapAsync() {
        const messages = [
            'Les cartographes explorent les terres...',
            'Les oceans se forment...',
            'Les forets prennent racine...',
            'Les montagnes emergent des brumes...',
            'Les regions se dessinent...',
            'Dernieres touches...'
        ];
        let lastMsgIdx = -1;

        GameMap.generateTerrain(this.seed, (progress) => {
            const msgIdx = Math.min(messages.length - 1, Math.floor(progress * messages.length));
            if (msgIdx !== lastMsgIdx) {
                lastMsgIdx = msgIdx;
                this._updateLoadingProgress(progress, messages[msgIdx]);
            }
        });

        this._updateLoadingProgress(1.0, 'La carte est prete !');
        setTimeout(() => this._showPlacementScreen(), 500);
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
            // Only show hover if no castle placed yet
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

            // Place or move the castle
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

        if (tile.terrain <= CONFIG.TERRAIN.WATER) {
            info.textContent = `${terrainName} - Impossible de fonder ici`;
            info.style.color = '#d8a8a8';
        } else if (!valid) {
            info.textContent = `${terrainName} (${tileX}, ${tileY}) - Pas assez de terre cultivable`;
            info.style.color = '#d8a8a8';
        } else {
            info.textContent = `${terrainName} (${tileX}, ${tileY}) - Bon emplacement pour votre royaume`;
            info.style.color = '#a8d8a8';
        }
    },

    confirmPlacement() {
        if (!this._castlePlaced) return;

        // Place kingdoms
        GameMap.placeKingdoms(this._castlePlaced.x, this._castlePlaced.y);

        // Cleanup placement
        const canvas = document.getElementById('placement-canvas');
        canvas.onmousemove = null;
        canvas.onclick = null;

        // Start the map view
        this._startMapView();
    },

    // ==================== MAP VIEW (game) ====================

    _startMapView() {
        this.showScreen('game-screen');
        Renderer.init();
        Camera.init(Renderer.canvas);

        this._running = true;

        // Center on castle
        if (this._castlePlaced) {
            Camera.centerOnCell(this._castlePlaced.x, this._castlePlaced.y);
        }

        this._gameLoop();
    },

    _gameLoop() {
        if (!this._running) return;
        Camera.update();
        Renderer.render();
        requestAnimationFrame(() => this._gameLoop());
    },

    onMapClick(cellX, cellY) {
        // For now, just log the cell clicked
        const tile = GameMap.getTile(cellX, cellY);
        if (!tile) return;
        // Future: building placement, selection, etc.
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Game.init();
});
