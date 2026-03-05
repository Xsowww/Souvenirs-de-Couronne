// Isometric renderer using HTML5 Canvas - realistic terrain colors
const Renderer = {
    canvas: null,
    ctx: null,
    minimapCanvas: null,
    minimapCtx: null,

    init() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.minimapCanvas = document.getElementById('minimap-canvas');
        this.minimapCtx = this.minimapCanvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#1a2a3a';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const bounds = Camera.getVisibleBounds();
        const tw = CONFIG.TILE_WIDTH * Camera.zoom;
        const th = CONFIG.TILE_HEIGHT * Camera.zoom;

        // Render tiles in isometric order (back to front)
        for (let y = bounds.minY; y <= bounds.maxY; y++) {
            for (let x = bounds.minX; x <= bounds.maxX; x++) {
                const tile = GameMap.getTile(x, y);
                if (!tile) continue;

                const screen = Camera.tileToScreen(x, y);
                const sx = screen.x - Camera.x;
                const sy = screen.y - Camera.y;

                // Skip if offscreen
                if (sx < -tw || sx > this.canvas.width + tw ||
                    sy < -th * 3 || sy > this.canvas.height + th) continue;

                if (!tile.explored) {
                    this.drawFogTile(ctx, sx, sy, tw, th);
                    continue;
                }

                // Draw terrain with realistic colors
                this.drawTerrain(ctx, tile, sx, sy, tw, th, x, y);

                // Draw territory color overlay
                if (tile.owner >= 0) {
                    this.drawTerritoryOverlay(ctx, tile, sx, sy, tw, th);
                }

                // Draw decoration
                if (tile.decoration && tile.visible) {
                    this.drawDecoration(ctx, tile, sx, sy, tw, th, x, y);
                }

                // Draw building
                if (tile.building && tile.visible) {
                    this.drawBuilding(ctx, tile.building, sx, sy, tw, th);
                }

                // Fog of war (explored but not visible = dimmed)
                if (tile.explored && !tile.visible) {
                    this.drawDimOverlay(ctx, sx, sy, tw, th);
                }
            }
        }

        // Draw selection highlight
        if (typeof Game !== 'undefined' && Game.selectedTile) {
            const st = Game.selectedTile;
            const screen = Camera.tileToScreen(st.x, st.y);
            const sx = screen.x - Camera.x;
            const sy = screen.y - Camera.y;
            this.drawSelectionHighlight(ctx, sx, sy, tw, th);
        }

        // Draw build preview
        if (typeof Game !== 'undefined' && Game.buildMode) {
            this.drawBuildPreview(ctx, tw, th);
        }
    },

    drawIsoDiamond(ctx, x, y, w, h) {
        ctx.beginPath();
        ctx.moveTo(x, y - h / 2);          // top
        ctx.lineTo(x + w / 2, y);           // right
        ctx.lineTo(x, y + h / 2);           // bottom
        ctx.lineTo(x - w / 2, y);           // left
        ctx.closePath();
    },

    // Get a subtle color variation based on tile position for natural look
    _varColor(baseR, baseG, baseB, x, y, range) {
        // Use a simple hash for deterministic variation
        const hash = ((x * 7919 + y * 6271) & 0xFFFF) / 0xFFFF;
        const offset = (hash - 0.5) * range * 2;
        const r = Math.max(0, Math.min(255, Math.round(baseR + offset)));
        const g = Math.max(0, Math.min(255, Math.round(baseG + offset)));
        const b = Math.max(0, Math.min(255, Math.round(baseB + offset)));
        return `rgb(${r},${g},${b})`;
    },

    drawTerrain(ctx, tile, sx, sy, tw, th, tileX, tileY) {
        const terrain = tile.terrain;
        // Realistic depth per terrain
        const depth = terrain === CONFIG.TERRAIN.MOUNTAIN ? 10 * Camera.zoom :
                      terrain === CONFIG.TERRAIN.HILLS ? 5 * Camera.zoom :
                      terrain === CONFIG.TERRAIN.WATER ? -1 * Camera.zoom : 2 * Camera.zoom;

        // Realistic color palettes
        let topColor, leftColor, rightColor, borderColor;
        switch (terrain) {
            case CONFIG.TERRAIN.WATER:
                topColor = this._varColor(41, 98, 148, tileX, tileY, 12);
                leftColor = '#1a4a6e';
                rightColor = '#245680';
                borderColor = '#1a3a5a';
                break;
            case CONFIG.TERRAIN.PLAINS:
                topColor = this._varColor(168, 190, 82, tileX, tileY, 15);
                leftColor = '#7a8a38';
                rightColor = '#8a9a48';
                borderColor = '#6a7a30';
                break;
            case CONFIG.TERRAIN.GRASS:
                topColor = this._varColor(98, 160, 58, tileX, tileY, 18);
                leftColor = '#3a7a22';
                rightColor = '#4a8a32';
                borderColor = '#2a6a18';
                break;
            case CONFIG.TERRAIN.FOREST:
                topColor = this._varColor(34, 85, 40, tileX, tileY, 14);
                leftColor = '#143a18';
                rightColor = '#1a4a20';
                borderColor = '#0e2e12';
                break;
            case CONFIG.TERRAIN.HILLS:
                topColor = this._varColor(140, 120, 85, tileX, tileY, 12);
                leftColor = '#6a5838';
                rightColor = '#7a6848';
                borderColor = '#5a4828';
                break;
            case CONFIG.TERRAIN.MOUNTAIN:
                topColor = this._varColor(135, 135, 130, tileX, tileY, 15);
                leftColor = '#555555';
                rightColor = '#666666';
                borderColor = '#444444';
                break;
            default:
                topColor = '#666';
                leftColor = '#444';
                rightColor = '#555';
                borderColor = '#333';
        }

        // Side faces (depth)
        if (depth > 0) {
            // Right side
            ctx.beginPath();
            ctx.moveTo(sx, sy + th / 2);
            ctx.lineTo(sx + tw / 2, sy);
            ctx.lineTo(sx + tw / 2, sy - depth);
            ctx.lineTo(sx, sy + th / 2 - depth);
            ctx.closePath();
            ctx.fillStyle = rightColor;
            ctx.fill();
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Left side
            ctx.beginPath();
            ctx.moveTo(sx, sy + th / 2);
            ctx.lineTo(sx - tw / 2, sy);
            ctx.lineTo(sx - tw / 2, sy - depth);
            ctx.lineTo(sx, sy + th / 2 - depth);
            ctx.closePath();
            ctx.fillStyle = leftColor;
            ctx.fill();
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }

        // Top face
        const topY = sy - depth;
        this.drawIsoDiamond(ctx, sx, topY, tw, th);
        ctx.fillStyle = topColor;
        ctx.fill();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Water shimmer effect
        if (terrain === CONFIG.TERRAIN.WATER) {
            this.drawIsoDiamond(ctx, sx, sy, tw, th);
            const shimmer = ((tileX + tileY) % 3 === 0) ? 0.06 : 0.03;
            ctx.fillStyle = `rgba(180,220,255,${shimmer})`;
            ctx.fill();
        }

        // Snow on mountain peaks
        if (terrain === CONFIG.TERRAIN.MOUNTAIN) {
            const hash = ((tileX * 7919 + tileY * 6271) & 0xFFFF) / 0xFFFF;
            if (hash > 0.4) {
                this.drawIsoDiamond(ctx, sx, topY, tw * 0.5, th * 0.5);
                ctx.fillStyle = 'rgba(235,235,240,0.5)';
                ctx.fill();
            }
        }
    },

    drawTerritoryOverlay(ctx, tile, sx, sy, tw, th) {
        const region = GameMap.getRegion(tile.owner);
        if (!region) return;
        this.drawIsoDiamond(ctx, sx, sy, tw, th);
        ctx.fillStyle = region.color + '25';
        ctx.fill();
        ctx.strokeStyle = region.color + '50';
        ctx.lineWidth = 0.8;
        ctx.stroke();
    },

    drawDecoration(ctx, tile, sx, sy, tw, th, tileX, tileY) {
        const type = tile.decoration;
        const z = Camera.zoom;
        const hash = ((tileX * 3571 + tileY * 2819) & 0xFFFF) / 0xFFFF;

        if (type === 'tree') {
            // Draw 1-3 trees per tile for forest density
            const treeCount = tile.terrain === CONFIG.TERRAIN.FOREST ? (hash > 0.5 ? 3 : 2) : 1;
            const offsets = [
                { dx: 0, dy: 0 },
                { dx: -6 * z, dy: -2 * z },
                { dx: 5 * z, dy: 1 * z }
            ];

            for (let i = 0; i < treeCount; i++) {
                const ox = offsets[i].dx;
                const oy = offsets[i].dy;
                const treeH = (14 + hash * 6) * z;
                const trunkH = 4 * z;
                const trunkW = 2.5 * z;
                const canopyW = (6 + hash * 3) * z;
                const baseY = sy - th / 2 + oy;

                // Trunk
                ctx.fillStyle = '#4a3520';
                ctx.fillRect(sx + ox - trunkW / 2, baseY - trunkH, trunkW, trunkH);

                // Canopy - rounded look with two triangles
                const darkGreen = this._varColor(28, 72, 32, tileX + i, tileY, 16);
                const lightGreen = this._varColor(38, 92, 42, tileX + i * 3, tileY, 16);

                // Lower canopy (wider)
                ctx.beginPath();
                ctx.moveTo(sx + ox, baseY - trunkH - treeH * 0.6);
                ctx.lineTo(sx + ox + canopyW, baseY - trunkH);
                ctx.lineTo(sx + ox - canopyW, baseY - trunkH);
                ctx.closePath();
                ctx.fillStyle = darkGreen;
                ctx.fill();

                // Upper canopy (narrower)
                ctx.beginPath();
                ctx.moveTo(sx + ox, baseY - trunkH - treeH);
                ctx.lineTo(sx + ox + canopyW * 0.7, baseY - trunkH - treeH * 0.3);
                ctx.lineTo(sx + ox - canopyW * 0.7, baseY - trunkH - treeH * 0.3);
                ctx.closePath();
                ctx.fillStyle = lightGreen;
                ctx.fill();
            }
        } else if (type === 'rock') {
            // Realistic rocks
            const rz = (5 + hash * 3) * z;
            // Main rock
            ctx.beginPath();
            ctx.moveTo(sx - rz, sy - th / 4);
            ctx.lineTo(sx - rz * 0.6, sy - th / 4 - rz * 1.1);
            ctx.lineTo(sx + rz * 0.3, sy - th / 4 - rz * 0.9);
            ctx.lineTo(sx + rz, sy - th / 4 - rz * 0.2);
            ctx.lineTo(sx + rz * 0.8, sy - th / 4);
            ctx.closePath();
            ctx.fillStyle = this._varColor(110, 105, 100, tileX, tileY, 15);
            ctx.fill();
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Smaller rock beside
            if (hash > 0.4) {
                const srz = rz * 0.5;
                ctx.beginPath();
                ctx.moveTo(sx + rz * 0.5, sy - th / 4 + 1 * z);
                ctx.lineTo(sx + rz * 0.6, sy - th / 4 - srz * 0.8);
                ctx.lineTo(sx + rz * 1.1, sy - th / 4 - srz * 0.3);
                ctx.lineTo(sx + rz * 1.2, sy - th / 4 + 1 * z);
                ctx.closePath();
                ctx.fillStyle = this._varColor(100, 95, 90, tileX + 1, tileY, 10);
                ctx.fill();
            }
        }
    },

    drawBuilding(ctx, building, sx, sy, tw, th) {
        const z = Camera.zoom;
        const bDef = CONFIG.BUILDINGS[building.type.toUpperCase()] || {};
        const bh = 20 * z;

        const bw = tw * 0.6;
        const bd = th * 0.6;

        // Left face
        ctx.beginPath();
        ctx.moveTo(sx - bw / 2, sy - th / 4);
        ctx.lineTo(sx, sy - th / 4 + bd / 2);
        ctx.lineTo(sx, sy - th / 4 + bd / 2 - bh);
        ctx.lineTo(sx - bw / 2, sy - th / 4 - bh);
        ctx.closePath();
        ctx.fillStyle = this.getBuildingColor(building.type, 'left');
        ctx.fill();
        ctx.strokeStyle = '#2a2015';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Right face
        ctx.beginPath();
        ctx.moveTo(sx + bw / 2, sy - th / 4);
        ctx.lineTo(sx, sy - th / 4 + bd / 2);
        ctx.lineTo(sx, sy - th / 4 + bd / 2 - bh);
        ctx.lineTo(sx + bw / 2, sy - th / 4 - bh);
        ctx.closePath();
        ctx.fillStyle = this.getBuildingColor(building.type, 'right');
        ctx.fill();
        ctx.strokeStyle = '#2a2015';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Top face (roof)
        ctx.beginPath();
        ctx.moveTo(sx, sy - th / 4 - bh);
        ctx.lineTo(sx + bw / 2, sy - th / 4 - bh);
        ctx.lineTo(sx, sy - th / 4 + bd / 2 - bh);
        ctx.lineTo(sx - bw / 2, sy - th / 4 - bh);
        ctx.closePath();
        ctx.fillStyle = this.getBuildingColor(building.type, 'top');
        ctx.fill();
        ctx.strokeStyle = '#2a2015';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Building icon
        const fontSize = Math.max(10, 14 * z);
        ctx.font = `${fontSize}px serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        const icon = bDef.icon || '?';
        const iy = sy - th / 4 - bh / 2;
        ctx.strokeText(icon, sx, iy);
        ctx.fillText(icon, sx, iy);

        // Level indicator for town hall
        if (building.type === 'town_hall' && building.level > 1) {
            ctx.font = `bold ${Math.max(8, 10 * z)}px sans-serif`;
            ctx.fillStyle = '#e2b714';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeText('Nv.' + building.level, sx, sy - th / 4 - bh - 4 * z);
            ctx.fillText('Nv.' + building.level, sx, sy - th / 4 - bh - 4 * z);
        }
    },

    getBuildingColor(type, face) {
        const colors = {
            town_hall: { left: '#6B5540', right: '#7D6550', top: '#A08060' },
            house: { left: '#7A5828', right: '#8A6838', top: '#A58050' },
            farm: { left: '#6B6B20', right: '#7A7A30', top: '#9A9A40' },
            sawmill: { left: '#5A3520', right: '#6A4530', top: '#8A6550' },
            mine: { left: '#4A4A4A', right: '#5A5A5A', top: '#707070' },
            market: { left: '#7A3A18', right: '#8A4A28', top: '#AA6A40' },
            barracks: { left: '#4A1010', right: '#5A2020', top: '#7A3838' },
            stable: { left: '#3A5020', right: '#4A6030', top: '#6A8048' },
            siege_workshop: { left: '#3A3A3A', right: '#4A4A4A', top: '#6A6A6A' },
            watchtower: { left: '#5A5A6A', right: '#6A6A7A', top: '#8A8A9A' },
            wall: { left: '#606060', right: '#707070', top: '#909090' }
        };
        const c = colors[type] || { left: '#555', right: '#666', top: '#888' };
        return c[face];
    },

    drawFogTile(ctx, sx, sy, tw, th) {
        this.drawIsoDiamond(ctx, sx, sy, tw, th);
        ctx.fillStyle = '#0e1820';
        ctx.fill();
        ctx.strokeStyle = '#152030';
        ctx.lineWidth = 0.3;
        ctx.stroke();
    },

    drawDimOverlay(ctx, sx, sy, tw, th) {
        this.drawIsoDiamond(ctx, sx, sy, tw, th);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();
    },

    drawSelectionHighlight(ctx, sx, sy, tw, th) {
        this.drawIsoDiamond(ctx, sx, sy, tw + 2, th + 2);
        ctx.strokeStyle = '#e2b714';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        this.drawIsoDiamond(ctx, sx, sy, tw + 2, th + 2);
        ctx.fillStyle = 'rgba(226,183,20,0.15)';
        ctx.fill();
    },

    drawBuildPreview(ctx, tw, th) {
        if (!Game.buildMode || !Game._hoverTile) return;
        const hx = Game._hoverTile.x;
        const hy = Game._hoverTile.y;
        const screen = Camera.tileToScreen(hx, hy);
        const sx = screen.x - Camera.x;
        const sy = screen.y - Camera.y;

        const tile = GameMap.getTile(hx, hy);
        const canPlace = tile && Game.canPlaceBuilding(hx, hy, Game.buildMode);

        this.drawIsoDiamond(ctx, sx, sy, tw, th);
        ctx.fillStyle = canPlace ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)';
        ctx.fill();
        ctx.strokeStyle = canPlace ? '#2ecc71' : '#e74c3c';
        ctx.lineWidth = 2;
        ctx.stroke();
    },

    renderMinimap() {
        const mctx = this.minimapCtx;
        const mw = this.minimapCanvas.width;
        const mh = this.minimapCanvas.height;
        mctx.clearRect(0, 0, mw, mh);
        mctx.fillStyle = '#0e1820';
        mctx.fillRect(0, 0, mw, mh);

        const scaleX = mw / CONFIG.MAP_WIDTH;
        const scaleY = mh / CONFIG.MAP_HEIGHT;

        // Minimap terrain colors (flat, realistic)
        const minimapColors = {
            0: '#296294',  // water
            1: '#a8be52',  // plains
            2: '#62a03a',  // grass
            3: '#225528',  // forest
            4: '#8c7855',  // hills
            5: '#878782',  // mountain
        };

        for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
            for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
                const tile = GameMap.tiles[y][x];
                if (!tile.explored) continue;

                if (tile.owner >= 0) {
                    const region = GameMap.getRegion(tile.owner);
                    mctx.fillStyle = region ? region.color : '#333';
                } else {
                    mctx.fillStyle = minimapColors[tile.terrain] || '#333';
                }
                mctx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
            }
        }

        // Draw camera viewport rectangle
        const topLeft = Camera.screenToTile(0, 0);
        const bottomRight = Camera.screenToTile(this.canvas.width, this.canvas.height);
        mctx.strokeStyle = '#fff';
        mctx.lineWidth = 1;
        mctx.strokeRect(
            topLeft.x * scaleX, topLeft.y * scaleY,
            (bottomRight.x - topLeft.x) * scaleX,
            (bottomRight.y - topLeft.y) * scaleY
        );
    }
};
