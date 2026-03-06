// Top-down continuous map renderer
const Renderer = {
    canvas: null,
    ctx: null,
    // Pre-rendered terrain buffer for performance
    _terrainBuffer: null,
    _bufferDirty: true,

    init() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this._bufferDirty = true;
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this._bufferDirty = true;
    },

    // Build the full terrain as an offscreen image (called once after generation)
    buildTerrainBuffer() {
        const w = GameMap.width;
        const h = GameMap.height;
        const cellSize = CONFIG.CELL_SIZE;
        const bufW = w * cellSize;
        const bufH = h * cellSize;

        this._terrainBuffer = document.createElement('canvas');
        this._terrainBuffer.width = bufW;
        this._terrainBuffer.height = bufH;
        const ctx = this._terrainBuffer.getContext('2d');

        // Render each cell as a colored square
        const imageData = ctx.createImageData(bufW, bufH);
        const data = imageData.data;

        for (let ty = 0; ty < h; ty++) {
            for (let tx = 0; tx < w; tx++) {
                const tile = GameMap.tiles[ty][tx];
                const rgb = GameMap._terrainRGB(tile.terrain, tx, ty);

                const startX = tx * cellSize;
                const startY = ty * cellSize;

                for (let py = startY; py < startY + cellSize; py++) {
                    for (let px = startX; px < startX + cellSize; px++) {
                        const idx = (py * bufW + px) * 4;
                        // Add sub-cell noise for natural look
                        const micro = ((px * 13 + py * 7) & 7) - 3.5;
                        data[idx] = Math.max(0, Math.min(255, rgb[0] + micro));
                        data[idx + 1] = Math.max(0, Math.min(255, rgb[1] + micro));
                        data[idx + 2] = Math.max(0, Math.min(255, rgb[2] + micro));
                        data[idx + 3] = 255;
                    }
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);

        // Draw region borders on the buffer
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        for (let ty = 0; ty < h; ty++) {
            for (let tx = 0; tx < w; tx++) {
                const tile = GameMap.tiles[ty][tx];
                if (tile.regionId < 0) continue;
                const right = GameMap.getTile(tx + 1, ty);
                const bottom = GameMap.getTile(tx, ty + 1);
                if (right && right.regionId >= 0 && right.regionId !== tile.regionId) {
                    const px = (tx + 1) * cellSize;
                    ctx.beginPath();
                    ctx.moveTo(px, ty * cellSize);
                    ctx.lineTo(px, (ty + 1) * cellSize);
                    ctx.stroke();
                }
                if (bottom && bottom.regionId >= 0 && bottom.regionId !== tile.regionId) {
                    const py = (ty + 1) * cellSize;
                    ctx.beginPath();
                    ctx.moveTo(tx * cellSize, py);
                    ctx.lineTo((tx + 1) * cellSize, py);
                    ctx.stroke();
                }
            }
        }

        // Draw tree sprites on forest cells
        this._drawTreesOnBuffer(ctx, cellSize);

        // Draw rocks on mountain cells
        this._drawRocksOnBuffer(ctx, cellSize);

        this._bufferDirty = false;
    },

    _drawTreesOnBuffer(ctx, cellSize) {
        for (let ty = 0; ty < GameMap.height; ty++) {
            for (let tx = 0; tx < GameMap.width; tx++) {
                const tile = GameMap.tiles[ty][tx];
                if (tile.terrain !== CONFIG.TERRAIN.FOREST &&
                    tile.terrain !== CONFIG.TERRAIN.DENSE_FOREST) continue;

                const hash = ((tx * 7919 + ty * 6271) & 0xFFFF) / 0xFFFF;
                const count = tile.terrain === CONFIG.TERRAIN.DENSE_FOREST ? 3 : (hash > 0.4 ? 2 : 1);
                const cx = tx * cellSize;
                const cy = ty * cellSize;

                for (let i = 0; i < count; i++) {
                    const h2 = ((tx * (i + 3) * 3571 + ty * 2819) & 0xFFFF) / 0xFFFF;
                    const ox = cx + h2 * (cellSize - 6) + 3;
                    const oy = cy + ((h2 * 7919) % 1) * (cellSize - 8) + 4;
                    const size = 3 + h2 * 3;

                    // Trunk
                    ctx.fillStyle = '#3a2510';
                    ctx.fillRect(ox - 0.5, oy, 1.5, size * 0.4);

                    // Canopy
                    const green = tile.terrain === CONFIG.TERRAIN.DENSE_FOREST ?
                        `rgb(${20 + h2 * 15},${48 + h2 * 20},${22 + h2 * 10})` :
                        `rgb(${32 + h2 * 20},${72 + h2 * 25},${30 + h2 * 15})`;
                    ctx.fillStyle = green;
                    ctx.beginPath();
                    ctx.arc(ox, oy - size * 0.1, size * 0.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    },

    _drawRocksOnBuffer(ctx, cellSize) {
        for (let ty = 0; ty < GameMap.height; ty++) {
            for (let tx = 0; tx < GameMap.width; tx++) {
                const tile = GameMap.tiles[ty][tx];
                if (tile.terrain !== CONFIG.TERRAIN.MOUNTAIN &&
                    tile.terrain !== CONFIG.TERRAIN.HILLS) continue;

                const hash = ((tx * 3571 + ty * 2819) & 0xFFFF) / 0xFFFF;
                if (hash > 0.4) continue;

                const cx = tx * cellSize + cellSize / 2;
                const cy = ty * cellSize + cellSize / 2;
                const size = 2 + hash * 3;

                ctx.fillStyle = tile.terrain === CONFIG.TERRAIN.MOUNTAIN ?
                    `rgb(${90 + hash * 30},${86 + hash * 30},${80 + hash * 30})` :
                    `rgb(${120 + hash * 20},${105 + hash * 20},${80 + hash * 20})`;
                ctx.beginPath();
                ctx.moveTo(cx - size, cy + size * 0.3);
                ctx.lineTo(cx - size * 0.3, cy - size);
                ctx.lineTo(cx + size * 0.5, cy - size * 0.7);
                ctx.lineTo(cx + size, cy + size * 0.3);
                ctx.closePath();
                ctx.fill();
            }
        }
    },

    render() {
        if (!this._terrainBuffer || this._bufferDirty) {
            this.buildTerrainBuffer();
        }

        const ctx = this.ctx;
        const cw = this.canvas.width;
        const ch = this.canvas.height;

        // Clear
        ctx.fillStyle = '#0a1520';
        ctx.fillRect(0, 0, cw, ch);

        // Draw the terrain buffer with camera transform
        const cellSize = CONFIG.CELL_SIZE;
        const zoom = Camera.zoom;
        const srcX = Camera.x / zoom;
        const srcY = Camera.y / zoom;
        const srcW = cw / zoom;
        const srcH = ch / zoom;

        ctx.imageSmoothingEnabled = zoom < 1;

        ctx.drawImage(
            this._terrainBuffer,
            srcX, srcY, srcW, srcH,
            0, 0, cw, ch
        );

        // Draw kingdom overlays
        this._drawKingdomOverlays(ctx, cw, ch);

        // Draw buildings
        this._drawBuildings(ctx);

        // Draw castle if placed
        if (typeof Game !== 'undefined' && Game._castlePlaced) {
            this._drawCastle(ctx, Game._castlePlaced.x, Game._castlePlaced.y);
        }
    },

    _drawKingdomOverlays(ctx, cw, ch) {
        const cellSize = CONFIG.CELL_SIZE;
        const zoom = Camera.zoom;

        // Calculate visible cell range
        const startX = Math.max(0, Math.floor(Camera.x / (cellSize * zoom)));
        const startY = Math.max(0, Math.floor(Camera.y / (cellSize * zoom)));
        const endX = Math.min(GameMap.width, Math.ceil((Camera.x + cw) / (cellSize * zoom)));
        const endY = Math.min(GameMap.height, Math.ceil((Camera.y + ch) / (cellSize * zoom)));

        for (let ty = startY; ty < endY; ty++) {
            for (let tx = startX; tx < endX; tx++) {
                const tile = GameMap.tiles[ty][tx];
                if (tile.owner < 0) continue;

                const region = GameMap.regions.find(r => r.owner === tile.owner && r.owner >= 0);
                if (!region || !region.color) continue;

                const sx = tx * cellSize * zoom - Camera.x;
                const sy = ty * cellSize * zoom - Camera.y;
                const sw = cellSize * zoom;

                ctx.fillStyle = region.color + '30';
                ctx.fillRect(sx, sy, sw + 0.5, sw + 0.5);
            }
        }
    },

    _drawBuildings(ctx) {
        // Will be used later for building placement
    },

    _drawCastle(ctx, tileX, tileY) {
        const cellSize = CONFIG.CELL_SIZE;
        const zoom = Camera.zoom;
        const sx = tileX * cellSize * zoom - Camera.x + (cellSize * zoom) / 2;
        const sy = tileY * cellSize * zoom - Camera.y + (cellSize * zoom) / 2;
        const iconSize = Math.max(16, cellSize * zoom * 1.5);

        ctx.font = `${iconSize}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 6;
        ctx.fillText('\u{1F3F0}', sx, sy);
        ctx.shadowBlur = 0;

        // Glow ring
        ctx.beginPath();
        ctx.arc(sx, sy, iconSize * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200,168,74,0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
    },

    renderMinimap() {
        // No minimap for now
    }
};
