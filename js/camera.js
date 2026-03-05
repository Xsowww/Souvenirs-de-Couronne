// Camera / viewport management for isometric view
const Camera = {
    x: 0,
    y: 0,
    zoom: 1,
    minZoom: 0.3,
    maxZoom: 2.5,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    camStartX: 0,
    camStartY: 0,

    init(canvas) {
        this.canvas = canvas;
        this.centerOnTile(Math.floor(CONFIG.MAP_WIDTH / 2), Math.floor(CONFIG.MAP_HEIGHT / 2));

        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        canvas.addEventListener('mouseleave', () => this.dragging = false);
        canvas.addEventListener('wheel', (e) => this.onWheel(e));

        // Touch support
        canvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
        canvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
        canvas.addEventListener('touchend', () => this.dragging = false);

        // Keyboard
        this._keys = {};
        window.addEventListener('keydown', (e) => this._keys[e.key] = true);
        window.addEventListener('keyup', (e) => this._keys[e.key] = false);
    },

    update() {
        const speed = 8 / this.zoom;
        if (this._keys['ArrowLeft'] || this._keys['a']) this.x -= speed;
        if (this._keys['ArrowRight'] || this._keys['d']) this.x += speed;
        if (this._keys['ArrowUp'] || this._keys['w']) this.y -= speed;
        if (this._keys['ArrowDown'] || this._keys['s']) this.y += speed;
    },

    centerOnTile(tx, ty) {
        const iso = this.tileToScreen(tx, ty);
        this.x = iso.x - this.canvas.width / 2;
        this.y = iso.y - this.canvas.height / 2;
    },

    tileToScreen(tx, ty) {
        const tw = CONFIG.TILE_WIDTH * this.zoom;
        const th = CONFIG.TILE_HEIGHT * this.zoom;
        return {
            x: (tx - ty) * (tw / 2),
            y: (tx + ty) * (th / 2)
        };
    },

    screenToTile(sx, sy) {
        const px = sx + this.x;
        const py = sy + this.y;
        const tw = CONFIG.TILE_WIDTH * this.zoom;
        const th = CONFIG.TILE_HEIGHT * this.zoom;
        const tx = Math.floor((px / (tw / 2) + py / (th / 2)) / 2);
        const ty = Math.floor((py / (th / 2) - px / (tw / 2)) / 2);
        return { x: tx, y: ty };
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
        }
    },

    onMouseUp(e) {
        const wasDrag = this._dragDist > 5;
        this.dragging = false;
        if (!wasDrag && e.button === 0) {
            const rect = this.canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const tile = this.screenToTile(sx, sy);
            if (typeof Game !== 'undefined') {
                Game.onTileClick(tile.x, tile.y);
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

        // Adjust camera so the world point under the mouse stays fixed
        const worldXBefore = mx + this.x;
        const worldYBefore = my + this.y;
        const scale = this.zoom / oldZoom;
        this.x = worldXBefore * scale - mx;
        this.y = worldYBefore * scale - my;
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
        }
    },

    getVisibleBounds() {
        const topLeft = this.screenToTile(0, 0);
        const topRight = this.screenToTile(this.canvas.width, 0);
        const bottomLeft = this.screenToTile(0, this.canvas.height);
        const bottomRight = this.screenToTile(this.canvas.width, this.canvas.height);

        return {
            minX: Math.max(0, Math.min(topLeft.x, bottomLeft.x) - 2),
            maxX: Math.min(CONFIG.MAP_WIDTH - 1, Math.max(topRight.x, bottomRight.x) + 2),
            minY: Math.max(0, Math.min(topLeft.y, topRight.y) - 2),
            maxY: Math.min(CONFIG.MAP_HEIGHT - 1, Math.max(bottomLeft.y, bottomRight.y) + 2)
        };
    }
};
