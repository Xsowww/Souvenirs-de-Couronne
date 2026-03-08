// Smooth isometric renderer - no visible tile grid
const Renderer = {
    canvas: null,
    ctx: null,
    _terrainBuffer: null,
    _bufferDirty: true,
    _isoMode: false,

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

    setIsoMode(enabled) {
        this._isoMode = enabled;
    },

    // Build the full terrain as an offscreen image (for top-down/placement)
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

        // Subtle region borders
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
                    const py2 = (ty + 1) * cellSize;
                    ctx.beginPath();
                    ctx.moveTo(tx * cellSize, py2);
                    ctx.lineTo((tx + 1) * cellSize, py2);
                    ctx.stroke();
                }
            }
        }

        // Trees and rocks on buffer (for top-down mode only)
        this._drawTreesOnBuffer(ctx, cellSize);
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
                    ctx.fillStyle = '#3a2510';
                    ctx.fillRect(ox - 0.5, oy, 1.5, size * 0.4);
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

        ctx.fillStyle = '#0a1520';
        ctx.fillRect(0, 0, cw, ch);

        const zoom = Camera.zoom;
        const srcX = Camera.x / zoom;
        const srcY = Camera.y / zoom;
        const srcW = cw / zoom;
        const srcH = ch / zoom;

        ctx.imageSmoothingEnabled = zoom < 1;
        ctx.drawImage(this._terrainBuffer, srcX, srcY, srcW, srcH, 0, 0, cw, ch);

        this._drawKingdomOverlays(ctx, cw, ch);

        if (typeof Game !== 'undefined' && Game._castlePlaced) {
            this._drawCastle(ctx, Game._castlePlaced.x, Game._castlePlaced.y);
        }
    },

    // ==================== SMOOTH ISOMETRIC RENDERING ====================

    // Get interpolated elevation at fractional world position
    _getElevAt(wx, wy) {
        const ix = Math.floor(wx);
        const iy = Math.floor(wy);
        const fx = wx - ix;
        const fy = wy - iy;

        const e00 = this._tileElev(ix, iy);
        const e10 = this._tileElev(ix + 1, iy);
        const e01 = this._tileElev(ix, iy + 1);
        const e11 = this._tileElev(ix + 1, iy + 1);

        const top = e00 + (e10 - e00) * fx;
        const bot = e01 + (e11 - e01) * fx;
        return top + (bot - top) * fy;
    },

    _tileElev(x, y) {
        const t = GameMap.getTile(x, y);
        return t ? t.elevation : -0.5;
    },

    _renderIso() {
        const ctx = this.ctx;
        const cw = this.canvas.width;
        const ch = this.canvas.height;

        ctx.fillStyle = '#0a1520';
        ctx.fillRect(0, 0, cw, ch);

        const cellSize = CONFIG.CELL_SIZE;
        const zoom = Camera.zoom;
        const tileW = cellSize * zoom;
        const tileH = tileW * 0.5;

        const camCellX = Camera.x / (cellSize * zoom);
        const camCellY = Camera.y / (cellSize * zoom);

        const originX = cw / 2;
        const originY = ch * 0.25;

        // Determine visible range (generous padding)
        const viewRange = Math.ceil(Math.max(cw, ch) / tileH) + 6;
        const startCX = Math.floor(camCellX) - Math.ceil(viewRange / 2);
        const startCY = Math.floor(camCellY) - Math.ceil(viewRange / 2);
        const endCX = startCX + viewRange;
        const endCY = startCY + viewRange;

        // Draw terrain back to front (painter's algorithm via diagonal sweep)
        for (let sum = startCX + startCY; sum <= endCX + endCY; sum++) {
            for (let tx = Math.max(startCX, sum - endCY); tx <= Math.min(endCX, sum - startCY); tx++) {
                const ty = sum - tx;
                if (tx < 0 || ty < 0 || tx >= GameMap.width || ty >= GameMap.height) continue;

                const tile = GameMap.tiles[ty][tx];
                const relX = tx - camCellX;
                const relY = ty - camCellY;

                // Smooth elevation from corners
                const eTopLeft = this._getElevAt(tx, ty);
                const eTopRight = this._getElevAt(tx + 1, ty);
                const eBotRight = this._getElevAt(tx + 1, ty + 1);
                const eBotLeft = this._getElevAt(tx, ty + 1);
                const eCenter = (eTopLeft + eTopRight + eBotRight + eBotLeft) * 0.25;

                const elevScale = tileH * 2.0;

                // Iso corners (no grid lines - smooth)
                const toIso = (rx, ry, elev) => ({
                    x: originX + (rx - ry) * tileW * 0.5,
                    y: originY + (rx + ry) * tileH * 0.5 - elev * elevScale
                });

                const topPt = toIso(relX, relY, eTopLeft);
                const rightPt = toIso(relX + 1, relY, eTopRight);
                const botPt = toIso(relX + 1, relY + 1, eBotRight);
                const leftPt = toIso(relX, relY + 1, eBotLeft);

                // Cull offscreen
                const minSX = Math.min(topPt.x, rightPt.x, botPt.x, leftPt.x);
                const maxSX = Math.max(topPt.x, rightPt.x, botPt.x, leftPt.x);
                const minSY = Math.min(topPt.y, rightPt.y, botPt.y, leftPt.y);
                const maxSY = Math.max(topPt.y, rightPt.y, botPt.y, leftPt.y);
                if (maxSX < -tileW || minSX > cw + tileW || maxSY < -tileH * 4 || minSY > ch + tileH * 4) continue;

                const rgb = GameMap._terrainRGB(tile.terrain, tx, ty);

                // Light based on slope (normal approximation)
                const slopeX = (eTopRight + eBotRight - eTopLeft - eBotLeft) * 0.5;
                const slopeY = (eBotLeft + eBotRight - eTopLeft - eTopRight) * 0.5;
                const light = 1.0 + slopeX * 0.3 - slopeY * 0.2;
                const lr = Math.max(0, Math.min(255, Math.round(rgb[0] * light)));
                const lg = Math.max(0, Math.min(255, Math.round(rgb[1] * light)));
                const lb = Math.max(0, Math.min(255, Math.round(rgb[2] * light)));

                // Draw top face (smooth quad - slightly expanded to prevent seams)
                const fillColor = `rgb(${lr},${lg},${lb})`;
                ctx.fillStyle = fillColor;
                ctx.strokeStyle = fillColor;
                ctx.lineWidth = 1.0;
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(topPt.x, topPt.y);
                ctx.lineTo(rightPt.x, rightPt.y);
                ctx.lineTo(botPt.x, botPt.y);
                ctx.lineTo(leftPt.x, leftPt.y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // Side faces for depth effect (only draw visible sides)
                const sideDepth = tileH * 0.6;

                // Left side (bottom-left edge visible)
                if (eBotLeft > -0.3 || eTopLeft > -0.3) {
                    const sH = Math.max(sideDepth * 0.3, sideDepth + eCenter * sideDepth * 0.5);
                    ctx.fillStyle = `rgb(${Math.round(lr*0.6)},${Math.round(lg*0.6)},${Math.round(lb*0.6)})`;
                    ctx.beginPath();
                    ctx.moveTo(leftPt.x, leftPt.y);
                    ctx.lineTo(botPt.x, botPt.y);
                    ctx.lineTo(botPt.x, botPt.y + sH);
                    ctx.lineTo(leftPt.x, leftPt.y + sH);
                    ctx.closePath();
                    ctx.fill();
                }

                // Right side (bottom-right edge visible)
                if (eBotRight > -0.3 || eTopRight > -0.3) {
                    const sH = Math.max(sideDepth * 0.3, sideDepth + eCenter * sideDepth * 0.5);
                    ctx.fillStyle = `rgb(${Math.round(lr*0.75)},${Math.round(lg*0.75)},${Math.round(lb*0.75)})`;
                    ctx.beginPath();
                    ctx.moveTo(rightPt.x, rightPt.y);
                    ctx.lineTo(botPt.x, botPt.y);
                    ctx.lineTo(botPt.x, botPt.y + sH);
                    ctx.lineTo(rightPt.x, rightPt.y + sH);
                    ctx.closePath();
                    ctx.fill();
                }

                // Kingdom overlay on top face
                if (tile.owner >= 0) {
                    const region = GameMap.regions.find(r => r.owner === tile.owner);
                    if (region && region.color) {
                        ctx.fillStyle = region.color + '25';
                        ctx.beginPath();
                        ctx.moveTo(topPt.x, topPt.y);
                        ctx.lineTo(rightPt.x, rightPt.y);
                        ctx.lineTo(botPt.x, botPt.y);
                        ctx.lineTo(leftPt.x, leftPt.y);
                        ctx.closePath();
                        ctx.fill();
                    }
                }

                // Center point for placing objects
                const centerPt = toIso(relX + 0.5, relY + 0.5, eCenter);

                // Iso trees (semi-3D)
                if (tile.terrain === CONFIG.TERRAIN.FOREST || tile.terrain === CONFIG.TERRAIN.DENSE_FOREST) {
                    this._drawIsoTree(ctx, centerPt.x, centerPt.y, tile, tx, ty, zoom);
                }

                // Iso rocks (semi-3D)
                if (tile.terrain === CONFIG.TERRAIN.MOUNTAIN || tile.terrain === CONFIG.TERRAIN.HILLS) {
                    this._drawIsoRock(ctx, centerPt.x, centerPt.y, tile, tx, ty, zoom);
                }
            }
        }

        // Draw placed buildings
        if (typeof Game !== 'undefined') {
            for (let i = 0; i < Game.buildings.length; i++) {
                const b = Game.buildings[i];
                this._drawIsoBuilding(ctx, b.type, b.x, b.y);

                // Level badge
                if (b.level > 1) {
                    const pos = this._isoScreenPos(b.x, b.y);
                    const badgeS = pos.zoom * 3;
                    ctx.fillStyle = 'rgba(200,168,74,0.9)';
                    ctx.beginPath();
                    ctx.arc(pos.sx + 10 * pos.zoom, pos.sy - 12 * pos.zoom, badgeS, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#1a100a';
                    ctx.font = `bold ${Math.round(badgeS * 1.3)}px Cinzel,serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(b.level, pos.sx + 10 * pos.zoom, pos.sy - 12 * pos.zoom);
                }

                // Selection ring
                if (Game._selectedBuilding === i) {
                    const pos = this._isoScreenPos(b.x, b.y);
                    ctx.beginPath();
                    ctx.ellipse(pos.sx, pos.sy + 1 * pos.zoom, 12 * pos.zoom, 5 * pos.zoom, 0, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(200,168,74,0.7)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }
        }

        // Draw main cabin on top of everything
        if (typeof Game !== 'undefined' && Game._castlePlaced) {
            this._drawIsoCabin(ctx, Game._castlePlaced.x, Game._castlePlaced.y);
            // Castle selection ring
            if (Game._selectedBuilding === 'castle') {
                const pos = this._isoScreenPos(Game._castlePlaced.x, Game._castlePlaced.y);
                ctx.beginPath();
                ctx.ellipse(pos.sx, pos.sy + 1 * pos.zoom, 18 * pos.zoom, 7 * pos.zoom, 0, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(200,168,74,0.7)';
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }
        }
    },

    // Semi-3D tree with trunk, shadow, layered canopy
    _drawIsoTree(ctx, sx, sy, tile, tx, ty, zoom) {
        const hash = ((tx * 7919 + ty * 6271) & 0xFFFF) / 0xFFFF;
        const isDense = tile.terrain === CONFIG.TERRAIN.DENSE_FOREST;
        const count = isDense ? (hash > 0.3 ? 3 : 2) : (hash > 0.5 ? 2 : 1);

        for (let i = 0; i < count; i++) {
            const th = ((tx * (i + 3) * 3571 + ty * 2819) & 0xFFFF) / 0xFFFF;
            const treeH = (5 + th * 6) * zoom;
            const ox = (th - 0.5) * 8 * zoom;
            const oy = (((th * 7919) % 1) - 0.5) * 4 * zoom;
            const treeSx = sx + ox;
            const treeSy = sy + oy;
            const trunkW = 1.5 * zoom;
            const canopyR = treeH * 0.3;

            // Shadow on ground
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.ellipse(treeSx + 2 * zoom, treeSy + 1 * zoom, canopyR * 0.8, canopyR * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();

            // Trunk (3D - front face)
            ctx.fillStyle = '#4a3018';
            ctx.fillRect(treeSx - trunkW * 0.5, treeSy - treeH * 0.5, trunkW, treeH * 0.55);
            // Trunk side highlight
            ctx.fillStyle = '#5a3d1e';
            ctx.fillRect(treeSx - trunkW * 0.5, treeSy - treeH * 0.5, trunkW * 0.4, treeH * 0.55);

            // Canopy layers (bottom to top for depth)
            for (let layer = 0; layer < 3; layer++) {
                const layerY = treeSy - treeH * (0.45 + layer * 0.18);
                const layerR = canopyR * (1.0 - layer * 0.2);
                const shade = layer * 12;

                if (isDense) {
                    ctx.fillStyle = `rgb(${18 + th * 12 + shade},${40 + th * 18 + shade},${20 + th * 8})`;
                } else {
                    ctx.fillStyle = `rgb(${28 + th * 18 + shade},${62 + th * 22 + shade},${26 + th * 12})`;
                }
                ctx.beginPath();
                ctx.ellipse(treeSx, layerY, layerR, layerR * 0.65, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // Highlight on top canopy
            ctx.fillStyle = isDense ? 'rgba(60,100,40,0.3)' : 'rgba(80,130,50,0.3)';
            ctx.beginPath();
            ctx.ellipse(treeSx - canopyR * 0.15, treeSy - treeH * 0.78, canopyR * 0.3, canopyR * 0.2, -0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    },

    // Semi-3D rock with faces and highlights
    _drawIsoRock(ctx, sx, sy, tile, tx, ty, zoom) {
        const hash = ((tx * 3571 + ty * 2819) & 0xFFFF) / 0xFFFF;
        if (hash > 0.45) return;

        const isMtn = tile.terrain === CONFIG.TERRAIN.MOUNTAIN;
        const rockH = (4 + hash * 6) * zoom;
        const rockW = (3 + hash * 4) * zoom;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(sx + 1.5 * zoom, sy + 1 * zoom, rockW * 0.7, rockW * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Base color
        const br = isMtn ? 85 + hash * 35 : 115 + hash * 25;
        const bg = isMtn ? 80 + hash * 35 : 100 + hash * 25;
        const bb = isMtn ? 75 + hash * 30 : 75 + hash * 20;

        // Front face (darker)
        ctx.fillStyle = `rgb(${Math.round(br * 0.8)},${Math.round(bg * 0.8)},${Math.round(bb * 0.8)})`;
        ctx.beginPath();
        ctx.moveTo(sx - rockW, sy);
        ctx.lineTo(sx - rockW * 0.4, sy - rockH);
        ctx.lineTo(sx + rockW * 0.5, sy - rockH * 0.85);
        ctx.lineTo(sx + rockW, sy);
        ctx.closePath();
        ctx.fill();

        // Top face (lighter)
        ctx.fillStyle = `rgb(${Math.round(br)},${Math.round(bg)},${Math.round(bb)})`;
        ctx.beginPath();
        ctx.moveTo(sx - rockW * 0.4, sy - rockH);
        ctx.lineTo(sx + rockW * 0.1, sy - rockH * 1.1);
        ctx.lineTo(sx + rockW * 0.7, sy - rockH * 0.9);
        ctx.lineTo(sx + rockW * 0.5, sy - rockH * 0.85);
        ctx.closePath();
        ctx.fill();

        // Right face
        ctx.fillStyle = `rgb(${Math.round(br * 0.65)},${Math.round(bg * 0.65)},${Math.round(bb * 0.65)})`;
        ctx.beginPath();
        ctx.moveTo(sx + rockW * 0.5, sy - rockH * 0.85);
        ctx.lineTo(sx + rockW * 0.7, sy - rockH * 0.9);
        ctx.lineTo(sx + rockW * 1.05, sy - rockH * 0.1);
        ctx.lineTo(sx + rockW, sy);
        ctx.closePath();
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.moveTo(sx - rockW * 0.3, sy - rockH * 0.9);
        ctx.lineTo(sx, sy - rockH * 1.05);
        ctx.lineTo(sx + rockW * 0.15, sy - rockH * 0.8);
        ctx.closePath();
        ctx.fill();
    },

    // Helper: get iso screen pos for a tile center
    _isoScreenPos(tileX, tileY) {
        const cellSize = CONFIG.CELL_SIZE;
        const zoom = Camera.zoom;
        const tileW = cellSize * zoom;
        const tileH = tileW * 0.5;
        const elevScale = tileH * 2.0;

        const camCellX = Camera.x / (cellSize * zoom);
        const camCellY = Camera.y / (cellSize * zoom);

        const originX = this.canvas.width / 2;
        const originY = this.canvas.height * 0.25;

        const elev = this._getElevAt(tileX + 0.5, tileY + 0.5);
        const relX = tileX + 0.5 - camCellX;
        const relY = tileY + 0.5 - camCellY;
        const sx = originX + (relX - relY) * tileW * 0.5;
        const sy = originY + (relX + relY) * tileH * 0.5 - elev * elevScale;

        return { sx, sy, zoom };
    },

    // Draw a placed building (semi-3D)
    _drawIsoBuilding(ctx, type, tileX, tileY) {
        switch (type) {
            case 'lumberjack': this._drawIsoLumberjack(ctx, tileX, tileY); break;
            case 'house': this._drawIsoHouse(ctx, tileX, tileY); break;
            case 'mine': this._drawIsoMine(ctx, tileX, tileY); break;
            case 'warehouse': this._drawIsoWarehouse(ctx, tileX, tileY); break;
            case 'foundry': this._drawIsoFoundry(ctx, tileX, tileY); break;
        }
    },

    // Semi-3D lumberjack cabin (smaller than main cabin)
    _drawIsoLumberjack(ctx, tileX, tileY) {
        const cellSize = CONFIG.CELL_SIZE;
        const zoom = Camera.zoom;
        const tileW = cellSize * zoom;
        const tileH = tileW * 0.5;
        const elevScale = tileH * 2.0;

        const camCellX = Camera.x / (cellSize * zoom);
        const camCellY = Camera.y / (cellSize * zoom);

        const originX = this.canvas.width / 2;
        const originY = this.canvas.height * 0.25;

        const elev = this._getElevAt(tileX + 0.5, tileY + 0.5);
        const relX = tileX + 0.5 - camCellX;
        const relY = tileY + 0.5 - camCellY;
        const sx = originX + (relX - relY) * tileW * 0.5;
        const sy = originY + (relX + relY) * tileH * 0.5 - elev * elevScale;

        const s = zoom * 0.9;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 1 * s, 9 * s, 3.5 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Left wall (dark wood)
        const wallH = 8 * s;
        const wallTop = sy - wallH;
        ctx.fillStyle = '#4a3018';
        ctx.beginPath();
        ctx.moveTo(sx - 8 * s, sy);
        ctx.lineTo(sx - 8 * s, wallTop);
        ctx.lineTo(sx, wallTop - 2 * s);
        ctx.lineTo(sx, sy);
        ctx.closePath();
        ctx.fill();

        // Plank lines
        ctx.strokeStyle = '#3a2510';
        ctx.lineWidth = 0.3 * s;
        for (let p = 1; p <= 3; p++) {
            const py = wallTop + (wallH / 4) * p;
            ctx.beginPath();
            ctx.moveTo(sx - 8 * s, py);
            ctx.lineTo(sx, py - 2 * s * (p / 4));
            ctx.stroke();
        }

        // Right wall (lighter)
        ctx.fillStyle = '#5a3d1e';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, wallTop - 2 * s);
        ctx.lineTo(sx + 8 * s, wallTop);
        ctx.lineTo(sx + 8 * s, sy);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#4a2e14';
        ctx.lineWidth = 0.3 * s;
        for (let p = 1; p <= 3; p++) {
            const py = wallTop + (wallH / 4) * p;
            ctx.beginPath();
            ctx.moveTo(sx, py - 2 * s * (p / 4));
            ctx.lineTo(sx + 8 * s, py);
            ctx.stroke();
        }

        // Door on right wall
        const doorW = 3 * s;
        const doorH = 5 * s;
        ctx.fillStyle = '#3a2510';
        ctx.fillRect(sx + 3 * s, sy - doorH, doorW, doorH);

        // Roof - left face
        ctx.fillStyle = '#6a3a12';
        ctx.beginPath();
        ctx.moveTo(sx - 10 * s, wallTop);
        ctx.lineTo(sx, wallTop - 7 * s);
        ctx.lineTo(sx + 1 * s, wallTop - 2 * s);
        ctx.lineTo(sx - 8 * s, wallTop);
        ctx.closePath();
        ctx.fill();

        // Roof - right face
        ctx.fillStyle = '#7a4516';
        ctx.beginPath();
        ctx.moveTo(sx, wallTop - 7 * s);
        ctx.lineTo(sx + 10 * s, wallTop);
        ctx.lineTo(sx + 8 * s, wallTop);
        ctx.lineTo(sx + 1 * s, wallTop - 2 * s);
        ctx.closePath();
        ctx.fill();

        // Log pile on the side
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#5a3a18' : '#4a2e12';
            const logY = sy - 1 * s - i * 1.8 * s;
            ctx.beginPath();
            ctx.ellipse(sx - 11 * s, logY, 3 * s, 1 * s, 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#3a2008';
            ctx.lineWidth = 0.3 * s;
            ctx.stroke();
        }

        // Axe leaning on side
        const axeX = sx + 10 * s;
        const axeY = sy;
        ctx.strokeStyle = '#5a3a18';
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        ctx.moveTo(axeX, axeY);
        ctx.lineTo(axeX - 2 * s, axeY - 8 * s);
        ctx.stroke();
        // Axe head
        ctx.fillStyle = '#8a8a8a';
        ctx.beginPath();
        ctx.moveTo(axeX - 2 * s, axeY - 8 * s);
        ctx.lineTo(axeX - 4 * s, axeY - 9 * s);
        ctx.lineTo(axeX - 3 * s, axeY - 6.5 * s);
        ctx.closePath();
        ctx.fill();
    },

    // Semi-3D villager house
    _drawIsoHouse(ctx, tileX, tileY) {
        const { sx, sy, zoom } = this._isoScreenPos(tileX, tileY);
        const s = zoom * 0.85;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 1 * s, 8 * s, 3 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Left wall (warm plaster)
        const wallH = 7 * s;
        const wallTop = sy - wallH;
        ctx.fillStyle = '#c4a872';
        ctx.beginPath();
        ctx.moveTo(sx - 7 * s, sy);
        ctx.lineTo(sx - 7 * s, wallTop);
        ctx.lineTo(sx, wallTop - 2 * s);
        ctx.lineTo(sx, sy);
        ctx.closePath();
        ctx.fill();

        // Right wall (lighter plaster)
        ctx.fillStyle = '#d4b882';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, wallTop - 2 * s);
        ctx.lineTo(sx + 7 * s, wallTop);
        ctx.lineTo(sx + 7 * s, sy);
        ctx.closePath();
        ctx.fill();

        // Door
        ctx.fillStyle = '#4a3018';
        ctx.fillRect(sx + 2 * s, sy - 5 * s, 3 * s, 5 * s);

        // Window on left wall
        ctx.fillStyle = '#a8c8e8';
        ctx.fillRect(sx - 5.5 * s, wallTop + 2 * s, 2.5 * s, 2.5 * s);
        ctx.strokeStyle = '#4a3018';
        ctx.lineWidth = 0.3 * s;
        ctx.strokeRect(sx - 5.5 * s, wallTop + 2 * s, 2.5 * s, 2.5 * s);

        // Roof - thatch style
        ctx.fillStyle = '#8a6a32';
        ctx.beginPath();
        ctx.moveTo(sx - 9 * s, wallTop);
        ctx.lineTo(sx, wallTop - 6 * s);
        ctx.lineTo(sx + 1 * s, wallTop - 2 * s);
        ctx.lineTo(sx - 7 * s, wallTop);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#9a7a3e';
        ctx.beginPath();
        ctx.moveTo(sx, wallTop - 6 * s);
        ctx.lineTo(sx + 9 * s, wallTop);
        ctx.lineTo(sx + 7 * s, wallTop);
        ctx.lineTo(sx + 1 * s, wallTop - 2 * s);
        ctx.closePath();
        ctx.fill();

        // Chimney
        ctx.fillStyle = '#6a6460';
        ctx.fillRect(sx + 5 * s, wallTop - 4 * s, 2 * s, 4 * s);
    },

    // Semi-3D mine entrance
    _drawIsoMine(ctx, tileX, tileY) {
        const { sx, sy, zoom } = this._isoScreenPos(tileX, tileY);
        const s = zoom * 0.9;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 1 * s, 9 * s, 3.5 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rock face / cave mouth
        ctx.fillStyle = '#5a5450';
        ctx.beginPath();
        ctx.moveTo(sx - 8 * s, sy);
        ctx.lineTo(sx - 6 * s, sy - 10 * s);
        ctx.lineTo(sx + 6 * s, sy - 10 * s);
        ctx.lineTo(sx + 8 * s, sy);
        ctx.closePath();
        ctx.fill();

        // Cave entrance (dark)
        ctx.fillStyle = '#1a1008';
        ctx.beginPath();
        ctx.moveTo(sx - 4 * s, sy);
        ctx.lineTo(sx - 3 * s, sy - 6 * s);
        ctx.lineTo(sx + 3 * s, sy - 6 * s);
        ctx.lineTo(sx + 4 * s, sy);
        ctx.closePath();
        ctx.fill();

        // Wooden beams
        ctx.strokeStyle = '#5a3a18';
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.moveTo(sx - 4 * s, sy);
        ctx.lineTo(sx - 3 * s, sy - 6 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx + 4 * s, sy);
        ctx.lineTo(sx + 3 * s, sy - 6 * s);
        ctx.stroke();
        // Top beam
        ctx.beginPath();
        ctx.moveTo(sx - 3.5 * s, sy - 6 * s);
        ctx.lineTo(sx + 3.5 * s, sy - 6 * s);
        ctx.stroke();

        // Cart with ore
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(sx + 5 * s, sy - 2 * s, 5 * s, 2.5 * s);
        // Ore in cart
        ctx.fillStyle = '#8a8a8a';
        ctx.beginPath();
        ctx.arc(sx + 6.5 * s, sy - 2.5 * s, 1.2 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9a7a3a';
        ctx.beginPath();
        ctx.arc(sx + 8 * s, sy - 2.5 * s, 1 * s, 0, Math.PI * 2);
        ctx.fill();
        // Wheel
        ctx.strokeStyle = '#3a2510';
        ctx.lineWidth = 0.8 * s;
        ctx.beginPath();
        ctx.arc(sx + 6.5 * s, sy + 0.5 * s, 1.2 * s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sx + 8.5 * s, sy + 0.5 * s, 1.2 * s, 0, Math.PI * 2);
        ctx.stroke();

        // Pickaxe
        ctx.strokeStyle = '#5a3a18';
        ctx.lineWidth = 0.8 * s;
        ctx.beginPath();
        ctx.moveTo(sx - 7 * s, sy);
        ctx.lineTo(sx - 9 * s, sy - 7 * s);
        ctx.stroke();
        ctx.fillStyle = '#707070';
        ctx.beginPath();
        ctx.moveTo(sx - 9 * s, sy - 7 * s);
        ctx.lineTo(sx - 11 * s, sy - 8 * s);
        ctx.lineTo(sx - 9.5 * s, sy - 5.5 * s);
        ctx.closePath();
        ctx.fill();
    },

    // Semi-3D warehouse
    _drawIsoWarehouse(ctx, tileX, tileY) {
        const { sx, sy, zoom } = this._isoScreenPos(tileX, tileY);
        const s = zoom * 1.0;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 1 * s, 10 * s, 4 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Left wall (stone/wood)
        const wallH = 9 * s;
        const wallTop = sy - wallH;
        ctx.fillStyle = '#6a5a3a';
        ctx.beginPath();
        ctx.moveTo(sx - 10 * s, sy);
        ctx.lineTo(sx - 10 * s, wallTop);
        ctx.lineTo(sx, wallTop - 1 * s);
        ctx.lineTo(sx, sy);
        ctx.closePath();
        ctx.fill();

        // Right wall
        ctx.fillStyle = '#7a6a4a';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, wallTop - 1 * s);
        ctx.lineTo(sx + 10 * s, wallTop);
        ctx.lineTo(sx + 10 * s, sy);
        ctx.closePath();
        ctx.fill();

        // Stone texture lines
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.3 * s;
        for (let p = 1; p <= 3; p++) {
            const py = wallTop + (wallH / 4) * p;
            ctx.beginPath();
            ctx.moveTo(sx - 10 * s, py);
            ctx.lineTo(sx, py - 1 * s * (p / 4));
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx, py - 1 * s * (p / 4));
            ctx.lineTo(sx + 10 * s, py);
            ctx.stroke();
        }

        // Large door on right wall
        ctx.fillStyle = '#4a3018';
        ctx.fillRect(sx + 2 * s, sy - 7 * s, 6 * s, 7 * s);
        ctx.strokeStyle = '#3a2008';
        ctx.lineWidth = 0.4 * s;
        ctx.strokeRect(sx + 2 * s, sy - 7 * s, 6 * s, 7 * s);
        // Door cross
        ctx.beginPath();
        ctx.moveTo(sx + 5 * s, sy - 7 * s);
        ctx.lineTo(sx + 5 * s, sy);
        ctx.stroke();

        // Flat roof
        ctx.fillStyle = '#5a4a2a';
        ctx.beginPath();
        ctx.moveTo(sx - 11 * s, wallTop);
        ctx.lineTo(sx, wallTop - 2.5 * s);
        ctx.lineTo(sx + 11 * s, wallTop);
        ctx.lineTo(sx, wallTop + 1 * s);
        ctx.closePath();
        ctx.fill();

        // Crates inside (visible through door)
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(sx + 3 * s, sy - 3 * s, 2 * s, 2 * s);
        ctx.fillRect(sx + 5.5 * s, sy - 3 * s, 2 * s, 2 * s);
        ctx.fillStyle = '#6a4a28';
        ctx.fillRect(sx + 4 * s, sy - 5 * s, 2 * s, 2 * s);
    },

    // Semi-3D foundry with fire glow
    _drawIsoFoundry(ctx, tileX, tileY) {
        const { sx, sy, zoom } = this._isoScreenPos(tileX, tileY);
        const s = zoom * 0.95;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 1 * s, 9 * s, 3.5 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Left wall (dark stone)
        const wallH = 9 * s;
        const wallTop = sy - wallH;
        ctx.fillStyle = '#4a4440';
        ctx.beginPath();
        ctx.moveTo(sx - 8 * s, sy);
        ctx.lineTo(sx - 8 * s, wallTop);
        ctx.lineTo(sx, wallTop - 2 * s);
        ctx.lineTo(sx, sy);
        ctx.closePath();
        ctx.fill();

        // Right wall
        ctx.fillStyle = '#5a5450';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, wallTop - 2 * s);
        ctx.lineTo(sx + 8 * s, wallTop);
        ctx.lineTo(sx + 8 * s, sy);
        ctx.closePath();
        ctx.fill();

        // Furnace opening (fire glow)
        ctx.fillStyle = '#1a0800';
        ctx.fillRect(sx + 2 * s, sy - 5 * s, 4 * s, 4 * s);

        // Fire glow (animated)
        const now = Date.now();
        const flicker = Math.sin(now / 150) * 0.15 + 0.85;
        ctx.fillStyle = `rgba(255,${Math.round(120 * flicker)},${Math.round(20 * flicker)},${0.7 * flicker})`;
        ctx.beginPath();
        ctx.arc(sx + 4 * s, sy - 3 * s, 1.5 * s, 0, Math.PI * 2);
        ctx.fill();
        // Glow spread
        ctx.fillStyle = `rgba(255,80,10,${0.1 * flicker})`;
        ctx.beginPath();
        ctx.arc(sx + 4 * s, sy - 3 * s, 4 * s, 0, Math.PI * 2);
        ctx.fill();

        // Chimney (tall, with smoke)
        const chimX = sx - 4 * s;
        const chimW = 3 * s;
        const chimH = 12 * s;
        const chimTop = wallTop - 4 * s;
        ctx.fillStyle = '#4a4440';
        ctx.fillRect(chimX, chimTop - chimH + 4 * s, chimW, chimH);
        ctx.fillStyle = '#3a3430';
        ctx.fillRect(chimX + chimW, chimTop - chimH + 4 * s, chimW * 0.35, chimH);
        // Cap
        ctx.fillStyle = '#3a3430';
        ctx.fillRect(chimX - 0.5 * s, chimTop - chimH + 4 * s, chimW + 1.5 * s, 1.5 * s);

        // Smoke
        for (let i = 0; i < 5; i++) {
            const smokeAge = (now / 500 + i * 1.3) % 7;
            const smokeX2 = chimX + chimW * 0.5 + Math.sin(now / 600 + i * 2) * 2.5 * s;
            const smokeY2 = chimTop - chimH + 4 * s - smokeAge * 2.5 * s;
            const smokeR = (1 + smokeAge * 0.5) * s;
            const alpha = Math.max(0, 0.35 - smokeAge * 0.05);
            ctx.fillStyle = `rgba(100,100,100,${alpha})`;
            ctx.beginPath();
            ctx.arc(smokeX2, smokeY2, smokeR, 0, Math.PI * 2);
            ctx.fill();
        }

        // Roof
        ctx.fillStyle = '#3a3430';
        ctx.beginPath();
        ctx.moveTo(sx - 10 * s, wallTop);
        ctx.lineTo(sx, wallTop - 6 * s);
        ctx.lineTo(sx + 1 * s, wallTop - 2 * s);
        ctx.lineTo(sx - 8 * s, wallTop);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#4a3e38';
        ctx.beginPath();
        ctx.moveTo(sx, wallTop - 6 * s);
        ctx.lineTo(sx + 10 * s, wallTop);
        ctx.lineTo(sx + 8 * s, wallTop);
        ctx.lineTo(sx + 1 * s, wallTop - 2 * s);
        ctx.closePath();
        ctx.fill();

        // Anvil near the building
        ctx.fillStyle = '#5a5a5a';
        ctx.beginPath();
        ctx.moveTo(sx + 9 * s, sy - 1 * s);
        ctx.lineTo(sx + 8 * s, sy - 3 * s);
        ctx.lineTo(sx + 12 * s, sy - 3 * s);
        ctx.lineTo(sx + 11 * s, sy - 1 * s);
        ctx.closePath();
        ctx.fill();
        // Anvil top (wider)
        ctx.fillStyle = '#6a6a6a';
        ctx.fillRect(sx + 7.5 * s, sy - 4 * s, 5 * s, 1.2 * s);
    },

    // Semi-3D main cabin with isometric perspective
    _drawIsoCabin(ctx, tileX, tileY) {
        const cellSize = CONFIG.CELL_SIZE;
        const zoom = Camera.zoom;
        const tileW = cellSize * zoom;
        const tileH = tileW * 0.5;
        const elevScale = tileH * 2.0;

        const camCellX = Camera.x / (cellSize * zoom);
        const camCellY = Camera.y / (cellSize * zoom);

        const originX = this.canvas.width / 2;
        const originY = this.canvas.height * 0.25;

        const elev = this._getElevAt(tileX + 0.5, tileY + 0.5);
        const relX = tileX + 0.5 - camCellX;
        const relY = tileY + 0.5 - camCellY;
        const sx = originX + (relX - relY) * tileW * 0.5;
        const sy = originY + (relX + relY) * tileH * 0.5 - elev * elevScale;

        const s = zoom * 1.3;

        // === Shadow ===
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 2 * s, 14 * s, 5 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // === Foundation (stone base) ===
        const foundH = 3 * s;
        ctx.fillStyle = '#6a6460';
        ctx.beginPath();
        ctx.moveTo(sx - 12 * s, sy);
        ctx.lineTo(sx + 12 * s, sy);
        ctx.lineTo(sx + 12 * s, sy + foundH);
        ctx.lineTo(sx - 12 * s, sy + foundH);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#5a5450';
        ctx.beginPath();
        ctx.moveTo(sx + 12 * s, sy);
        ctx.lineTo(sx + 15 * s, sy - 2 * s);
        ctx.lineTo(sx + 15 * s, sy - 2 * s + foundH);
        ctx.lineTo(sx + 12 * s, sy + foundH);
        ctx.closePath();
        ctx.fill();

        // === Left wall (darker) ===
        const wallH = 14 * s;
        const wallTop = sy - wallH;
        ctx.fillStyle = '#5a3d1e';
        ctx.beginPath();
        ctx.moveTo(sx - 12 * s, sy);
        ctx.lineTo(sx - 12 * s, wallTop);
        ctx.lineTo(sx, wallTop - 3 * s);
        ctx.lineTo(sx, sy);
        ctx.closePath();
        ctx.fill();

        // Wood plank lines on left wall
        ctx.strokeStyle = '#4a2e14';
        ctx.lineWidth = 0.4 * s;
        for (let p = 1; p <= 4; p++) {
            const py = wallTop + (wallH / 5) * p;
            ctx.beginPath();
            ctx.moveTo(sx - 12 * s, py);
            ctx.lineTo(sx, py - 3 * s * (p / 5));
            ctx.stroke();
        }

        // === Right wall (lighter) ===
        ctx.fillStyle = '#6a4a28';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, wallTop - 3 * s);
        ctx.lineTo(sx + 12 * s, wallTop);
        ctx.lineTo(sx + 12 * s, sy);
        ctx.closePath();
        ctx.fill();

        // Plank lines on right wall
        ctx.strokeStyle = '#5a3a1c';
        ctx.lineWidth = 0.4 * s;
        for (let p = 1; p <= 4; p++) {
            const py = wallTop + (wallH / 5) * p;
            ctx.beginPath();
            ctx.moveTo(sx, py - 3 * s * (p / 5));
            ctx.lineTo(sx + 12 * s, py);
            ctx.stroke();
        }

        // === Door (on right wall) ===
        const doorW = 4 * s;
        const doorH = 7 * s;
        const doorX = sx + 5 * s;
        ctx.fillStyle = '#3a2510';
        ctx.fillRect(doorX, sy - doorH, doorW, doorH);
        ctx.strokeStyle = '#2a1a08';
        ctx.lineWidth = 0.3 * s;
        ctx.strokeRect(doorX, sy - doorH, doorW, doorH);
        // Handle
        ctx.fillStyle = '#c8a84a';
        ctx.beginPath();
        ctx.arc(doorX + doorW * 0.75, sy - doorH * 0.4, 0.6 * s, 0, Math.PI * 2);
        ctx.fill();

        // === Windows ===
        const winS = 3 * s;
        // Left wall window
        const lwx = sx - 7 * s;
        const lwy = wallTop + wallH * 0.3;
        ctx.fillStyle = '#a8c8e8';
        ctx.fillRect(lwx, lwy, winS, winS);
        ctx.strokeStyle = '#3a2510';
        ctx.lineWidth = 0.3 * s;
        ctx.strokeRect(lwx, lwy, winS, winS);
        ctx.beginPath();
        ctx.moveTo(lwx + winS / 2, lwy);
        ctx.lineTo(lwx + winS / 2, lwy + winS);
        ctx.moveTo(lwx, lwy + winS / 2);
        ctx.lineTo(lwx + winS, lwy + winS / 2);
        ctx.stroke();
        // Window glow
        ctx.fillStyle = 'rgba(200,180,120,0.15)';
        ctx.fillRect(lwx, lwy, winS, winS);

        // === Roof ===
        const roofPeak = wallTop - 10 * s;
        // Left roof face
        ctx.fillStyle = '#7a3a12';
        ctx.beginPath();
        ctx.moveTo(sx - 14 * s, wallTop);
        ctx.lineTo(sx, roofPeak);
        ctx.lineTo(sx + 2 * s, wallTop - 3 * s);
        ctx.lineTo(sx - 12 * s, wallTop);
        ctx.closePath();
        ctx.fill();

        // Right roof face (lighter)
        ctx.fillStyle = '#8b4513';
        ctx.beginPath();
        ctx.moveTo(sx, roofPeak);
        ctx.lineTo(sx + 14 * s, wallTop);
        ctx.lineTo(sx + 12 * s, wallTop);
        ctx.lineTo(sx + 2 * s, wallTop - 3 * s);
        ctx.closePath();
        ctx.fill();

        // Roof ridge
        ctx.strokeStyle = '#5a2d0a';
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        ctx.moveTo(sx, roofPeak);
        ctx.lineTo(sx + 2 * s, wallTop - 3 * s);
        ctx.stroke();

        // === Chimney ===
        const chimW = 3 * s;
        const chimH = 8 * s;
        const chimX = sx + 7 * s;
        const chimY = wallTop - 5 * s;
        ctx.fillStyle = '#6a6460';
        ctx.fillRect(chimX, chimY - chimH, chimW, chimH);
        ctx.fillStyle = '#5a5450';
        ctx.fillRect(chimX + chimW, chimY - chimH, chimW * 0.4, chimH);
        // Cap
        ctx.fillStyle = '#4a4440';
        ctx.fillRect(chimX - 0.5 * s, chimY - chimH, chimW + 1.5 * s, 1.5 * s);

        // Smoke
        const now = Date.now();
        for (let i = 0; i < 4; i++) {
            const smokeAge = (now / 600 + i * 1.5) % 6;
            const smokeX2 = chimX + chimW * 0.5 + Math.sin(now / 700 + i * 2.1) * 2.5 * s;
            const smokeY2 = chimY - chimH - smokeAge * 3 * s;
            const smokeR = (1.2 + smokeAge * 0.6) * s;
            const alpha = Math.max(0, 0.3 - smokeAge * 0.05);
            ctx.fillStyle = `rgba(180,180,180,${alpha})`;
            ctx.beginPath();
            ctx.arc(smokeX2, smokeY2, smokeR, 0, Math.PI * 2);
            ctx.fill();
        }

        // === Flag ===
        const flagX = sx - 10 * s;
        const flagY = wallTop;
        const poleH = 16 * s;
        ctx.strokeStyle = '#3a2510';
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        ctx.moveTo(flagX, flagY);
        ctx.lineTo(flagX, flagY - poleH);
        ctx.stroke();
        // Pole top ball
        ctx.fillStyle = '#c8a84a';
        ctx.beginPath();
        ctx.arc(flagX, flagY - poleH, 1 * s, 0, Math.PI * 2);
        ctx.fill();
        // Flag cloth (animated)
        const wave = Math.sin(now / 400) * 1.5 * s;
        ctx.fillStyle = '#3a7ad5';
        ctx.beginPath();
        ctx.moveTo(flagX, flagY - poleH + 1 * s);
        ctx.quadraticCurveTo(flagX + 4 * s + wave, flagY - poleH + 2.5 * s, flagX + 7 * s + wave * 0.5, flagY - poleH + 2 * s);
        ctx.lineTo(flagX + 6.5 * s + wave, flagY - poleH + 6 * s);
        ctx.quadraticCurveTo(flagX + 3 * s + wave * 0.5, flagY - poleH + 5.5 * s, flagX, flagY - poleH + 6 * s);
        ctx.closePath();
        ctx.fill();
        // Cross on flag
        ctx.strokeStyle = '#e8d48a';
        ctx.lineWidth = 0.5 * s;
        const fcx = flagX + 3.5 * s + wave * 0.5;
        const fcy = flagY - poleH + 3.5 * s;
        ctx.beginPath();
        ctx.moveTo(fcx, fcy - 1.5 * s);
        ctx.lineTo(fcx, fcy + 1.5 * s);
        ctx.moveTo(fcx - 1.5 * s, fcy);
        ctx.lineTo(fcx + 1.5 * s, fcy);
        ctx.stroke();

        // === Glow ring ===
        ctx.beginPath();
        ctx.ellipse(sx, sy + 1 * s, 16 * s, 6 * s, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200,168,74,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    },

    _drawKingdomOverlays(ctx, cw, ch) {
        const cellSize = CONFIG.CELL_SIZE;
        const zoom = Camera.zoom;
        const startX = Math.max(0, Math.floor(Camera.x / (cellSize * zoom)));
        const startY = Math.max(0, Math.floor(Camera.y / (cellSize * zoom)));
        const endX = Math.min(GameMap.width, Math.ceil((Camera.x + cw) / (cellSize * zoom)));
        const endY = Math.min(GameMap.height, Math.ceil((Camera.y + ch) / (cellSize * zoom)));

        for (let ty = startY; ty < endY; ty++) {
            for (let tx = startX; tx < endX; tx++) {
                const tile = GameMap.tiles[ty][tx];
                if (tile.owner < 0) continue;
                const region = GameMap.regions.find(r => r.owner === tile.owner);
                if (!region || !region.color) continue;
                const sx = tx * cellSize * zoom - Camera.x;
                const sy2 = ty * cellSize * zoom - Camera.y;
                const sw = cellSize * zoom;
                ctx.fillStyle = region.color + '30';
                ctx.fillRect(sx, sy2, sw + 0.5, sw + 0.5);
            }
        }
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

        ctx.beginPath();
        ctx.arc(sx, sy, iconSize * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200,168,74,0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
    },

    renderMinimap() {}
};
