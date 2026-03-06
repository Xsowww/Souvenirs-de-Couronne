// Top-down continuous map renderer with isometric game view
const Renderer = {
    canvas: null,
    ctx: null,
    // Pre-rendered terrain buffer for performance
    _terrainBuffer: null,
    _bufferDirty: true,
    // Isometric mode
    _isoMode: false,
    _isoBuffer: null,
    _isoBufferDirty: true,

    init() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this._bufferDirty = true;
        this._isoBufferDirty = true;
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this._bufferDirty = true;
        this._isoBufferDirty = true;
    },

    setIsoMode(enabled) {
        this._isoMode = enabled;
        this._isoBufferDirty = true;
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
        this._isoBufferDirty = true;
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
        if (this._isoMode) {
            this._renderIso();
        } else {
            this._renderTopDown();
        }
    },

    _renderTopDown() {
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

    // ==================== ISOMETRIC RENDERING ====================

    _renderIso() {
        if (!this._terrainBuffer || this._bufferDirty) {
            this.buildTerrainBuffer();
        }

        const ctx = this.ctx;
        const cw = this.canvas.width;
        const ch = this.canvas.height;

        // Clear
        ctx.fillStyle = '#0a1520';
        ctx.fillRect(0, 0, cw, ch);

        const cellSize = CONFIG.CELL_SIZE;
        const zoom = Camera.zoom;

        // Iso tile dimensions
        const tileW = cellSize * zoom;
        const tileH = tileW * 0.5; // isometric ratio

        // Calculate visible range from camera
        // In iso mode, camera.x/y still track world position in cell coords
        const camCellX = Camera.x / (cellSize * zoom);
        const camCellY = Camera.y / (cellSize * zoom);

        // How many tiles visible
        const viewTilesX = Math.ceil(cw / tileW) + 4;
        const viewTilesY = Math.ceil(ch / tileH) + 8;

        const startCX = Math.floor(camCellX) - 2;
        const startCY = Math.floor(camCellY) - 2;

        // Iso projection: screen_x = (tx - ty) * tileW/2 + offsetX
        //                 screen_y = (tx + ty) * tileH/2 + offsetY - elevation
        const originX = cw / 2;
        const originY = ch * 0.2;

        // Draw back to front
        const rangeX = viewTilesX;
        const rangeY = viewTilesY;

        for (let row = 0; row < rangeX + rangeY; row++) {
            for (let i = Math.max(0, row - rangeY + 1); i <= Math.min(row, rangeX - 1); i++) {
                const j = row - i;
                const tx = startCX + i;
                const ty = startCY + j;

                if (tx < 0 || ty < 0 || tx >= GameMap.width || ty >= GameMap.height) continue;
                const tile = GameMap.tiles[ty][tx];

                // Iso screen position
                const relX = tx - camCellX;
                const relY = ty - camCellY;
                const sx = originX + (relX - relY) * tileW * 0.5;
                const sy = originY + (relX + relY) * tileH * 0.5;

                // Elevation offset
                const elevOff = tile.elevation * tileH * 1.5;

                // Cull offscreen
                if (sx < -tileW || sx > cw + tileW || sy - elevOff < -tileH * 3 || sy - elevOff > ch + tileH * 2) continue;

                const rgb = GameMap._terrainRGB(tile.terrain, tx, ty);

                // Draw isometric diamond (top face)
                ctx.fillStyle = `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`;
                ctx.beginPath();
                ctx.moveTo(sx, sy - elevOff - tileH * 0.5);  // top
                ctx.lineTo(sx + tileW * 0.5, sy - elevOff);  // right
                ctx.lineTo(sx, sy - elevOff + tileH * 0.5);  // bottom
                ctx.lineTo(sx - tileW * 0.5, sy - elevOff);  // left
                ctx.closePath();
                ctx.fill();

                // Side faces for elevated terrain (gives 3D depth)
                if (tile.elevation > -0.1) {
                    const sideH = Math.max(1, tile.elevation * tileH * 0.8 + tileH * 0.3);
                    // Left side (darker)
                    ctx.fillStyle = `rgb(${Math.round(rgb[0] * 0.65)},${Math.round(rgb[1] * 0.65)},${Math.round(rgb[2] * 0.65)})`;
                    ctx.beginPath();
                    ctx.moveTo(sx - tileW * 0.5, sy - elevOff);
                    ctx.lineTo(sx, sy - elevOff + tileH * 0.5);
                    ctx.lineTo(sx, sy - elevOff + tileH * 0.5 + sideH);
                    ctx.lineTo(sx - tileW * 0.5, sy - elevOff + sideH);
                    ctx.closePath();
                    ctx.fill();

                    // Right side (slightly darker)
                    ctx.fillStyle = `rgb(${Math.round(rgb[0] * 0.8)},${Math.round(rgb[1] * 0.8)},${Math.round(rgb[2] * 0.8)})`;
                    ctx.beginPath();
                    ctx.moveTo(sx + tileW * 0.5, sy - elevOff);
                    ctx.lineTo(sx, sy - elevOff + tileH * 0.5);
                    ctx.lineTo(sx, sy - elevOff + tileH * 0.5 + sideH);
                    ctx.lineTo(sx + tileW * 0.5, sy - elevOff + sideH);
                    ctx.closePath();
                    ctx.fill();
                }

                // Kingdom overlay
                if (tile.owner >= 0) {
                    const region = GameMap.regions.find(r => r.owner === tile.owner && r.owner >= 0);
                    if (region && region.color) {
                        ctx.fillStyle = region.color + '30';
                        ctx.beginPath();
                        ctx.moveTo(sx, sy - elevOff - tileH * 0.5);
                        ctx.lineTo(sx + tileW * 0.5, sy - elevOff);
                        ctx.lineTo(sx, sy - elevOff + tileH * 0.5);
                        ctx.lineTo(sx - tileW * 0.5, sy - elevOff);
                        ctx.closePath();
                        ctx.fill();
                    }
                }

                // Trees on forest tiles
                if (tile.terrain === CONFIG.TERRAIN.FOREST || tile.terrain === CONFIG.TERRAIN.DENSE_FOREST) {
                    const hash = ((tx * 7919 + ty * 6271) & 0xFFFF) / 0xFFFF;
                    const count = tile.terrain === CONFIG.TERRAIN.DENSE_FOREST ? 2 : (hash > 0.5 ? 1 : 0);
                    for (let t = 0; t <= count; t++) {
                        const th = ((tx * (t+3) * 3571 + ty * 2819) & 0xFFFF) / 0xFFFF;
                        const treeH = (3 + th * 4) * zoom;
                        const treeOx = (th - 0.5) * tileW * 0.25;
                        const treeOy = (((th * 7919) % 1) - 0.5) * tileH * 0.25;
                        const treeSx = sx + treeOx;
                        const treeSy = sy - elevOff - tileH * 0.2 + treeOy;

                        // Trunk
                        ctx.fillStyle = '#3a2510';
                        ctx.fillRect(treeSx - 0.5 * zoom, treeSy - treeH * 0.4, 1.5 * zoom, treeH * 0.5);

                        // Canopy
                        const isDense = tile.terrain === CONFIG.TERRAIN.DENSE_FOREST;
                        ctx.fillStyle = isDense ?
                            `rgb(${Math.round(20+th*15)},${Math.round(48+th*20)},${Math.round(22+th*10)})` :
                            `rgb(${Math.round(32+th*20)},${Math.round(72+th*25)},${Math.round(30+th*15)})`;
                        ctx.beginPath();
                        ctx.arc(treeSx, treeSy - treeH * 0.5, treeH * 0.35, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                // Rocks on hills/mountains
                if (tile.terrain === CONFIG.TERRAIN.MOUNTAIN || tile.terrain === CONFIG.TERRAIN.HILLS) {
                    const hash = ((tx * 3571 + ty * 2819) & 0xFFFF) / 0xFFFF;
                    if (hash < 0.35) {
                        const rockSize = (2 + hash * 3) * zoom;
                        const isMtn = tile.terrain === CONFIG.TERRAIN.MOUNTAIN;
                        ctx.fillStyle = isMtn ?
                            `rgb(${Math.round(90+hash*30)},${Math.round(86+hash*30)},${Math.round(80+hash*30)})` :
                            `rgb(${Math.round(120+hash*20)},${Math.round(105+hash*20)},${Math.round(80+hash*20)})`;
                        ctx.beginPath();
                        ctx.moveTo(sx - rockSize, sy - elevOff - tileH*0.1 + rockSize*0.3);
                        ctx.lineTo(sx - rockSize*0.3, sy - elevOff - tileH*0.1 - rockSize);
                        ctx.lineTo(sx + rockSize*0.5, sy - elevOff - tileH*0.1 - rockSize*0.7);
                        ctx.lineTo(sx + rockSize, sy - elevOff - tileH*0.1 + rockSize*0.3);
                        ctx.closePath();
                        ctx.fill();
                    }
                }
            }
        }

        // Draw castle (cabin) on top
        if (typeof Game !== 'undefined' && Game._castlePlaced) {
            this._drawIsoCabin(ctx, Game._castlePlaced.x, Game._castlePlaced.y);
        }
    },

    _drawIsoCabin(ctx, tileX, tileY) {
        const cellSize = CONFIG.CELL_SIZE;
        const zoom = Camera.zoom;
        const tileW = cellSize * zoom;
        const tileH = tileW * 0.5;

        const camCellX = Camera.x / (cellSize * zoom);
        const camCellY = Camera.y / (cellSize * zoom);

        const originX = this.canvas.width / 2;
        const originY = this.canvas.height * 0.2;

        const relX = tileX - camCellX;
        const relY = tileY - camCellY;
        const sx = originX + (relX - relY) * tileW * 0.5;

        const tile = GameMap.getTile(tileX, tileY);
        const elev = tile ? tile.elevation : 0;
        const elevOff = elev * tileH * 1.5;
        const sy = originY + (relX + relY) * tileH * 0.5 - elevOff;

        const scale = zoom * 1.2;
        const cabW = 18 * scale;
        const cabH = 12 * scale;
        const roofH = 10 * scale;
        const baseX = sx - cabW / 2;
        const baseY = sy - cabH - tileH * 0.3;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(sx, sy - tileH * 0.15, cabW * 0.6, cabH * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cabin walls (front)
        ctx.fillStyle = '#5a3d1e';
        ctx.fillRect(baseX, baseY, cabW, cabH);

        // Wood planks detail
        ctx.strokeStyle = '#4a2e14';
        ctx.lineWidth = 0.5 * scale;
        for (let i = 1; i < 4; i++) {
            const py = baseY + (cabH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(baseX, py);
            ctx.lineTo(baseX + cabW, py);
            ctx.stroke();
        }

        // Door
        const doorW = 4 * scale;
        const doorH = 7 * scale;
        ctx.fillStyle = '#3a2510';
        ctx.fillRect(sx - doorW / 2, baseY + cabH - doorH, doorW, doorH);
        // Door handle
        ctx.fillStyle = '#c8a84a';
        ctx.beginPath();
        ctx.arc(sx + doorW * 0.25, baseY + cabH - doorH * 0.4, 0.6 * scale, 0, Math.PI * 2);
        ctx.fill();

        // Window
        ctx.fillStyle = '#a8c8e8';
        const winSize = 3 * scale;
        ctx.fillRect(baseX + cabW * 0.15, baseY + cabH * 0.2, winSize, winSize);
        ctx.fillRect(baseX + cabW - cabW * 0.15 - winSize, baseY + cabH * 0.2, winSize, winSize);
        // Window cross
        ctx.strokeStyle = '#3a2510';
        ctx.lineWidth = 0.4 * scale;
        [baseX + cabW * 0.15, baseX + cabW - cabW * 0.15 - winSize].forEach(wx => {
            ctx.beginPath();
            ctx.moveTo(wx + winSize/2, baseY + cabH * 0.2);
            ctx.lineTo(wx + winSize/2, baseY + cabH * 0.2 + winSize);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(wx, baseY + cabH * 0.2 + winSize/2);
            ctx.lineTo(wx + winSize, baseY + cabH * 0.2 + winSize/2);
            ctx.stroke();
        });

        // Roof (triangle)
        const roofOverhang = 3 * scale;
        ctx.fillStyle = '#8b4513';
        ctx.beginPath();
        ctx.moveTo(baseX - roofOverhang, baseY);
        ctx.lineTo(sx, baseY - roofH);
        ctx.lineTo(baseX + cabW + roofOverhang, baseY);
        ctx.closePath();
        ctx.fill();

        // Roof outline
        ctx.strokeStyle = '#5a2d0a';
        ctx.lineWidth = 1 * scale;
        ctx.beginPath();
        ctx.moveTo(baseX - roofOverhang, baseY);
        ctx.lineTo(sx, baseY - roofH);
        ctx.lineTo(baseX + cabW + roofOverhang, baseY);
        ctx.stroke();

        // Chimney
        const chimW = 3 * scale;
        const chimH = 6 * scale;
        const chimX = sx + cabW * 0.2;
        ctx.fillStyle = '#6a6a6a';
        ctx.fillRect(chimX, baseY - roofH * 0.5 - chimH, chimW, chimH);
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(chimX - 0.5 * scale, baseY - roofH * 0.5 - chimH, chimW + 1 * scale, 1.5 * scale);

        // Smoke particles
        for (let i = 0; i < 3; i++) {
            const smokeY = baseY - roofH * 0.5 - chimH - (4 + i * 5) * scale;
            const smokeX = chimX + chimW / 2 + Math.sin(Date.now() / 800 + i * 2) * 2 * scale;
            const smokeR = (1.5 + i * 0.8) * scale;
            ctx.fillStyle = `rgba(180,180,180,${0.3 - i * 0.08})`;
            ctx.beginPath();
            ctx.arc(smokeX, smokeY, smokeR, 0, Math.PI * 2);
            ctx.fill();
        }

        // Banner/flag
        const flagX = baseX + cabW - 2 * scale;
        const flagY = baseY - roofH * 0.7;
        const poleH = 12 * scale;
        ctx.strokeStyle = '#3a2510';
        ctx.lineWidth = 1 * scale;
        ctx.beginPath();
        ctx.moveTo(flagX, flagY);
        ctx.lineTo(flagX, flagY - poleH);
        ctx.stroke();
        // Flag cloth
        ctx.fillStyle = '#3a7ad5';
        ctx.beginPath();
        ctx.moveTo(flagX, flagY - poleH);
        ctx.lineTo(flagX + 6 * scale + Math.sin(Date.now() / 500) * 1 * scale, flagY - poleH + 2 * scale);
        ctx.lineTo(flagX, flagY - poleH + 5 * scale);
        ctx.closePath();
        ctx.fill();

        // Glow ring around base
        ctx.beginPath();
        ctx.ellipse(sx, sy - tileH * 0.15, cabW * 0.8, cabH * 0.3, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200,168,74,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
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
