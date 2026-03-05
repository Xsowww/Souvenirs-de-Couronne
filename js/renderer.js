// Isometric renderer using HTML5 Canvas
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
        ctx.fillStyle = '#0a0e14';
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
                    // Draw fog
                    this.drawFogTile(ctx, sx, sy, tw, th);
                    continue;
                }

                // Draw terrain
                this.drawTerrain(ctx, tile, sx, sy, tw, th);

                // Draw territory color overlay
                if (tile.owner >= 0) {
                    this.drawTerritoryOverlay(ctx, tile, sx, sy, tw, th);
                }

                // Draw decoration
                if (tile.decoration && tile.visible) {
                    this.drawDecoration(ctx, tile.decoration, sx, sy, tw, th);
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

    drawTerrain(ctx, tile, sx, sy, tw, th) {
        const colors = CONFIG.TERRAIN_COLORS[tile.terrain];
        const depth = tile.terrain === CONFIG.TERRAIN.MOUNTAIN ? 8 * Camera.zoom :
                      tile.terrain === CONFIG.TERRAIN.HILLS ? 4 * Camera.zoom :
                      tile.terrain === CONFIG.TERRAIN.WATER ? -2 * Camera.zoom : 2 * Camera.zoom;

        // Side faces (depth)
        if (depth > 0) {
            // Right side
            ctx.beginPath();
            ctx.moveTo(sx, sy + th / 2);
            ctx.lineTo(sx + tw / 2, sy);
            ctx.lineTo(sx + tw / 2, sy - depth);
            ctx.lineTo(sx, sy + th / 2 - depth);
            ctx.closePath();
            ctx.fillStyle = colors.stroke;
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Left side
            ctx.beginPath();
            ctx.moveTo(sx, sy + th / 2);
            ctx.lineTo(sx - tw / 2, sy);
            ctx.lineTo(sx - tw / 2, sy - depth);
            ctx.lineTo(sx, sy + th / 2 - depth);
            ctx.closePath();
            ctx.fillStyle = colors.fill;
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Top face
        const topY = sy - depth;
        this.drawIsoDiamond(ctx, sx, topY, tw, th);
        ctx.fillStyle = colors.top;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Water shimmer
        if (tile.terrain === CONFIG.TERRAIN.WATER) {
            this.drawIsoDiamond(ctx, sx, sy, tw, th);
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fill();
        }
    },

    drawTerritoryOverlay(ctx, tile, sx, sy, tw, th) {
        const region = GameMap.getRegion(tile.owner);
        if (!region) return;
        this.drawIsoDiamond(ctx, sx, sy, tw, th);
        ctx.fillStyle = region.color + '30'; // semi-transparent
        ctx.fill();
        // Territory border
        ctx.strokeStyle = region.color + '60';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    },

    drawDecoration(ctx, type, sx, sy, tw, th) {
        const z = Camera.zoom;
        if (type === 'tree') {
            // Simple cartoon tree
            const treeH = 18 * z;
            const trunkH = 6 * z;
            // Trunk
            ctx.fillStyle = '#6B4226';
            ctx.fillRect(sx - 2 * z, sy - th / 2 - trunkH - treeH + trunkH, 4 * z, trunkH);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx - 2 * z, sy - th / 2 - trunkH - treeH + trunkH, 4 * z, trunkH);
            // Canopy (triangle)
            ctx.beginPath();
            ctx.moveTo(sx, sy - th / 2 - treeH);
            ctx.lineTo(sx + 8 * z, sy - th / 2 - trunkH);
            ctx.lineTo(sx - 8 * z, sy - th / 2 - trunkH);
            ctx.closePath();
            ctx.fillStyle = '#27ae60';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        } else if (type === 'rock') {
            const rz = 6 * z;
            ctx.beginPath();
            ctx.moveTo(sx - rz, sy - th / 4);
            ctx.lineTo(sx - rz / 2, sy - th / 4 - rz);
            ctx.lineTo(sx + rz / 2, sy - th / 4 - rz * 0.8);
            ctx.lineTo(sx + rz, sy - th / 4);
            ctx.closePath();
            ctx.fillStyle = '#7f8c8d';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    },

    drawBuilding(ctx, building, sx, sy, tw, th) {
        const z = Camera.zoom;
        const bDef = CONFIG.BUILDINGS[building.type.toUpperCase()] || {};
        const bh = 20 * z; // building height

        // Building base (cube-like shape)
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
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
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
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Top face
        ctx.beginPath();
        ctx.moveTo(sx, sy - th / 4 - bh);
        ctx.lineTo(sx + bw / 2, sy - th / 4 - bh);
        ctx.lineTo(sx, sy - th / 4 + bd / 2 - bh);
        ctx.lineTo(sx - bw / 2, sy - th / 4 - bh);
        ctx.closePath();
        ctx.fillStyle = this.getBuildingColor(building.type, 'top');
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Building icon/label
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
            town_hall: { left: '#8B7355', right: '#A0855C', top: '#C4A46C' },
            house: { left: '#8B6914', right: '#A07828', top: '#BFA050' },
            farm: { left: '#8B8B00', right: '#9A9A20', top: '#C0C040' },
            sawmill: { left: '#6B4226', right: '#7B5236', top: '#9B7256' },
            mine: { left: '#555', right: '#666', top: '#888' },
            market: { left: '#8B4513', right: '#A0552A', top: '#C08050' },
            barracks: { left: '#4A0E0E', right: '#5A1E1E', top: '#7A3E3E' },
            stable: { left: '#3A5A1E', right: '#4A6A2E', top: '#6A8A4E' },
            siege_workshop: { left: '#3A3A3A', right: '#4A4A4A', top: '#6A6A6A' },
            watchtower: { left: '#5A5A7A', right: '#6A6A8A', top: '#8A8AAA' },
            wall: { left: '#6A6A6A', right: '#7A7A7A', top: '#9A9A9A' }
        };
        const c = colors[type] || { left: '#666', right: '#777', top: '#999' };
        return c[face];
    },

    drawFogTile(ctx, sx, sy, tw, th) {
        this.drawIsoDiamond(ctx, sx, sy, tw, th);
        ctx.fillStyle = '#0a0e14';
        ctx.fill();
        ctx.strokeStyle = '#151a22';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    },

    drawDimOverlay(ctx, sx, sy, tw, th) {
        this.drawIsoDiamond(ctx, sx, sy, tw, th);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
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
        mctx.fillStyle = '#0a0e14';
        mctx.fillRect(0, 0, mw, mh);

        const scaleX = mw / CONFIG.MAP_WIDTH;
        const scaleY = mh / CONFIG.MAP_HEIGHT;

        for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
            for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
                const tile = GameMap.tiles[y][x];
                if (!tile.explored) continue;

                if (tile.owner >= 0) {
                    const region = GameMap.getRegion(tile.owner);
                    mctx.fillStyle = region ? region.color : '#333';
                } else {
                    mctx.fillStyle = CONFIG.TERRAIN_COLORS[tile.terrain].top;
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
