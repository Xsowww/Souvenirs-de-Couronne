// Camera for top-down 2D view
const Camera = {
    x: 0,
    y: 0,
    zoom: 1,
    minZoom: 0.3,
    maxZoom: 4,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    camStartX: 0,
    camStartY: 0,
    _dragDist: 0,
    _keys: {},

    init(canvas) {
        this.canvas = canvas;

        // Center on map middle
        const mapPixelW = GameMap.width * CONFIG.CELL_SIZE * this.zoom;
        const mapPixelH = GameMap.height * CONFIG.CELL_SIZE * this.zoom;
        this.x = mapPixelW / 2 - canvas.width / 2;
        this.y = mapPixelH / 2 - canvas.height / 2;

        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        canvas.addEventListener('mouseleave', () => this.dragging = false);
        canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Touch
        canvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
        canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        canvas.addEventListener('touchend', () => this.dragging = false);

        // Keyboard
        window.addEventListener('keydown', (e) => this._keys[e.key] = true);
        window.addEventListener('keyup', (e) => this._keys[e.key] = false);
    },

    update() {
        const speed = 6 / this.zoom;
        if (this._keys['ArrowLeft'] || this._keys['q'] || this._keys['Q']) this.x -= speed;
        if (this._keys['ArrowRight'] || this._keys['d'] || this._keys['D']) this.x += speed;
        if (this._keys['ArrowUp'] || this._keys['z'] || this._keys['Z']) this.y -= speed;
        if (this._keys['ArrowDown'] || this._keys['s'] || this._keys['S']) this.y += speed;

        this._clamp();
    },

    _clamp() {
        const mapW = GameMap.width * CONFIG.CELL_SIZE * this.zoom;
        const mapH = GameMap.height * CONFIG.CELL_SIZE * this.zoom;
        this.x = Math.max(-this.canvas.width / 2, Math.min(mapW - this.canvas.width / 2, this.x));
        this.y = Math.max(-this.canvas.height / 2, Math.min(mapH - this.canvas.height / 2, this.y));
    },

    centerOnCell(cx, cy) {
        const cellSize = CONFIG.CELL_SIZE * this.zoom;
        this.x = (cx + 0.5) * cellSize - this.canvas.width / 2;
        this.y = (cy + 0.5) * cellSize - this.canvas.height / 2;
        this._clamp();
    },

    screenToCell(sx, sy) {
        // Top-down: direct pixel to tile mapping
        const worldX = (sx + this.x) / (CONFIG.CELL_SIZE * this.zoom);
        const worldY = (sy + this.y) / (CONFIG.CELL_SIZE * this.zoom);
        return {
            x: Math.floor(worldX),
            y: Math.floor(worldY)
        };
    },

    onMouseDown(e) {
        if (e.button === 0 || e.button === 2) {
            this.dragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.camStartX = this.x;
            this.camStartY = this.y;
            this._dragDist = 0;
        }
    },

    onMouseMove(e) {
        if (this.dragging) {
            const dx = e.clientX - this.dragStartX;
            const dy = e.clientY - this.dragStartY;
            this._dragDist = Math.abs(dx) + Math.abs(dy);
            this.x = this.camStartX - dx;
            this.y = this.camStartY - dy;
            this._clamp();
        }
    },

    onMouseUp(e) {
        const wasDrag = this._dragDist > 5;
        this.dragging = false;
        if (!wasDrag && e.button === 0) {
            const rect = this.canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const cell = this.screenToCell(sx, sy);
            if (typeof Game !== 'undefined' && Game.onMapClick) {
                Game.onMapClick(cell.x, cell.y);
            }
        }
    },

    onWheel(e) {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const oldZoom = this.zoom;
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomFactor));

        // Zoom toward mouse position
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const worldXBefore = (mx + this.x) / oldZoom;
        const worldYBefore = (my + this.y) / oldZoom;
        this.x = worldXBefore * this.zoom - mx;
        this.y = worldYBefore * this.zoom - my;
        this._clamp();
    },

    onTouchStart(e) {
        if (e.touches.length === 1) {
            this.dragging = true;
            this.dragStartX = e.touches[0].clientX;
            this.dragStartY = e.touches[0].clientY;
            this.camStartX = this.x;
            this.camStartY = this.y;
        }
    },

    onTouchMove(e) {
        e.preventDefault();
        if (this.dragging && e.touches.length === 1) {
            const dx = e.touches[0].clientX - this.dragStartX;
            const dy = e.touches[0].clientY - this.dragStartY;
            this.x = this.camStartX - dx;
            this.y = this.camStartY - dy;
            this._clamp();
        }
    }
};
