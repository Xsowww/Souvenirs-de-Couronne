// Top-down smooth renderer — no tiles, no grid, pure bird's eye view
const Renderer = {
    canvas: null,
    ctx: null,
    _terrainBuffer: null,   // 1px-per-tile small canvas → upscaled with smoothing
    _overlayBuffer: null,   // kingdom territory overlay
    _bufferDirty: true,
    _isoMode: false,        // kept for compat — always false now

    init() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this._bufferDirty = true;
    },

    resize() {
        this.canvas.width  = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this._bufferDirty  = true;
    },

    setIsoMode(enabled) {
        this._isoMode = false; // always top-down
    },

    // ─── Terrain buffer ────────────────────────────────────────────────────────
    // One pixel per tile, drawn bilinearly scaled → smooth colour transitions
    buildTerrainBuffer() {
        const w = GameMap.width;
        const h = GameMap.height;

        this._terrainBuffer = document.createElement('canvas');
        this._terrainBuffer.width  = w;
        this._terrainBuffer.height = h;
        const ctx  = this._terrainBuffer.getContext('2d');
        const imgd = ctx.createImageData(w, h);
        const data = imgd.data;

        for (let ty = 0; ty < h; ty++) {
            for (let tx = 0; tx < w; tx++) {
                const tile = GameMap.tiles[ty][tx];
                const rgb  = GameMap._terrainRGB(tile.terrain, tx, ty);
                const idx  = (ty * w + tx) * 4;
                data[idx]     = rgb[0];
                data[idx + 1] = rgb[1];
                data[idx + 2] = rgb[2];
                data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgd, 0, 0);

        // ── Overlay buffer (territory colours) ───────────────────────────────
        this._overlayBuffer = document.createElement('canvas');
        this._overlayBuffer.width  = w;
        this._overlayBuffer.height = h;
        const octx  = this._overlayBuffer.getContext('2d');
        const oimgd = octx.createImageData(w, h);
        const od    = oimgd.data;

        for (let ty = 0; ty < h; ty++) {
            for (let tx = 0; tx < w; tx++) {
                const tile = GameMap.tiles[ty][tx];
                if (tile.owner < 0) continue;
                const region = GameMap.regions.find(r => r.owner === tile.owner);
                if (!region || !region.color) continue;
                const hex = region.color.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                const idx = (ty * w + tx) * 4;
                od[idx]     = r;
                od[idx + 1] = g;
                od[idx + 2] = b;
                od[idx + 3] = 55; // ~22% alpha
            }
        }
        octx.putImageData(oimgd, 0, 0);

        // ── Quadrant region overlay (4 corners with distinct colors) ─────────
        this._quadrantBuffer = document.createElement('canvas');
        this._quadrantBuffer.width  = w;
        this._quadrantBuffer.height = h;
        const qctx  = this._quadrantBuffer.getContext('2d');
        const qimgd = qctx.createImageData(w, h);
        const qd    = qimgd.data;

        // Corner colors: NW=green(forest), NE=gold(plains), SE=red(rocks), SW=blue(hills)
        const quadrantColors = [
            { r: 34, g: 120, b: 50 },   // NW - vert foret
            { r: 180, g: 160, b: 50 },  // NE - dore plaines
            { r: 160, g: 60, b: 40 },   // SE - rouge roche
            { r: 50, g: 90, b: 160 },   // SW - bleu collines
        ];

        const hw = w / 2, hh = h / 2;
        for (let ty = 0; ty < h; ty++) {
            for (let tx = 0; tx < w; tx++) {
                const tile = GameMap.tiles[ty][tx];
                if (tile.terrain <= CONFIG.TERRAIN.WATER) continue;

                // Determine quadrant: 0=NW, 1=NE, 2=SE, 3=SW
                const qIdx = (tx >= hw ? 1 : 0) + (ty >= hh ? 2 : 0);
                const qc = quadrantColors[qIdx];

                // Fade alpha: stronger at corners, fading toward center
                const dx = Math.abs(tx - hw) / hw;
                const dy = Math.abs(ty - hh) / hh;
                const cornerDist = Math.min(1, Math.sqrt(dx * dx + dy * dy));
                const alpha = Math.round(cornerDist * 28); // max ~28/255 = ~11% opacity

                const idx = (ty * w + tx) * 4;
                qd[idx]     = qc.r;
                qd[idx + 1] = qc.g;
                qd[idx + 2] = qc.b;
                qd[idx + 3] = alpha;
            }
        }
        qctx.putImageData(qimgd, 0, 0);

        this._bufferDirty = false;
    },

    // ─── Main render ──────────────────────────────────────────────────────────
    render() {
        this._renderTopDown();
    },

    _renderTopDown() {
        if (!this._terrainBuffer || this._bufferDirty) {
            this.buildTerrainBuffer();
        }

        const ctx      = this.ctx;
        const cw       = this.canvas.width;
        const ch       = this.canvas.height;
        const zoom     = Camera.zoom;
        const cellSize = CONFIG.CELL_SIZE;

        ctx.fillStyle = '#0a1520';
        ctx.fillRect(0, 0, cw, ch);

        // Src coordinates in tile-space (buffer pixels = tiles)
        const srcX = Camera.x / (cellSize * zoom);
        const srcY = Camera.y / (cellSize * zoom);
        const srcW = cw       / (cellSize * zoom);
        const srcH = ch       / (cellSize * zoom);

        // ── Terrain (bilinear upscale → no visible grid) ─────────────────────
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this._terrainBuffer, srcX, srcY, srcW, srcH, 0, 0, cw, ch);

        // ── Territory overlay (same smooth upscale) ───────────────────────────
        ctx.drawImage(this._overlayBuffer, srcX, srcY, srcW, srcH, 0, 0, cw, ch);

        // ── Quadrant region overlay ─────────────────────────────────────────
        if (this._quadrantBuffer) {
            ctx.drawImage(this._quadrantBuffer, srcX, srcY, srcW, srcH, 0, 0, cw, ch);
        }
        ctx.imageSmoothingEnabled = false; // pixel-sharp for details below

        // ── Visible tile range ────────────────────────────────────────────────
        const startTX = Math.max(0, Math.floor(srcX) - 1);
        const startTY = Math.max(0, Math.floor(srcY) - 1);
        const endTX   = Math.min(GameMap.width,  Math.ceil(srcX + srcW) + 1);
        const endTY   = Math.min(GameMap.height, Math.ceil(srcY + srcH) + 1);

        // ── Trees & rocks ─────────────────────────────────────────────────────
        for (let ty = startTY; ty < endTY; ty++) {
            for (let tx = startTX; tx < endTX; tx++) {
                const tile = GameMap.tiles[ty][tx];
                const sx   = (tx + 0.5) * cellSize * zoom - Camera.x;
                const sy   = (ty + 0.5) * cellSize * zoom - Camera.y;

                if (tile.terrain === CONFIG.TERRAIN.FOREST ||
                    tile.terrain === CONFIG.TERRAIN.DENSE_FOREST) {
                    this._drawTopDownTree(ctx, sx, sy, zoom,
                        tile.terrain === CONFIG.TERRAIN.DENSE_FOREST, tx, ty);
                }
                if (tile.terrain === CONFIG.TERRAIN.HILLS ||
                    tile.terrain === CONFIG.TERRAIN.MOUNTAIN) {
                    this._drawTopDownRock(ctx, sx, sy, zoom,
                        tile.terrain === CONFIG.TERRAIN.MOUNTAIN, tx, ty);
                }
            }
        }

        // ── Buildings ─────────────────────────────────────────────────────────
        if (typeof Game !== 'undefined') {
            for (let i = 0; i < Game.buildings.length; i++) {
                const b  = Game.buildings[i];
                const sx = (b.x + 0.5) * cellSize * zoom - Camera.x;
                const sy = (b.y + 0.5) * cellSize * zoom - Camera.y;
                const s  = cellSize * zoom;

                this._drawTopDownBuilding(ctx, b.type, sx, sy, s);

                // Level badge
                if (b.level > 1) {
                    const r = Math.max(5, s * 0.18);
                    const bx = sx + s * 0.38, by = sy - s * 0.38;
                    ctx.fillStyle = 'rgba(200,168,74,0.95)';
                    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#1a100a';
                    ctx.font = `bold ${Math.round(r * 1.3)}px Cinzel,serif`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(b.level, bx, by);
                }

                // Selection ring
                if (Game._selectedBuilding === i) {
                    ctx.beginPath();
                    ctx.arc(sx, sy, s * 0.52, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(200,168,74,0.85)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }
        }

        // ── Castle ────────────────────────────────────────────────────────────
        if (typeof Game !== 'undefined' && Game._castlePlaced) {
            const s  = cellSize * zoom;
            const sx = (Game._castlePlaced.x + 0.5) * s - Camera.x;
            const sy = (Game._castlePlaced.y + 0.5) * s - Camera.y;
            this._drawTopDownCastle(ctx, sx, sy, s);

            if (Game._selectedBuilding === 'castle') {
                ctx.beginPath();
                ctx.arc(sx, sy, s * 0.68, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(200,168,74,0.85)';
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }
        }
    },

    // ─── Top-down tree (canopy circle from above) ─────────────────────────────
    _drawTopDownTree(ctx, sx, sy, zoom, isDense, tx, ty) {
        const s    = CONFIG.CELL_SIZE * zoom;
        const hash = ((tx * 7919 + ty * 6271) & 0xFFFF) / 0xFFFF;
        const count = isDense ? (hash > 0.35 ? 3 : 2) : (hash > 0.55 ? 2 : 1);

        for (let i = 0; i < count; i++) {
            const h2  = ((tx * (i + 3) * 3571 + ty * 2819) & 0xFFFF) / 0xFFFF;
            const ox  = (h2 - 0.5) * s * 0.55;
            const oy  = (((h2 * 7919) % 1) - 0.5) * s * 0.55;
            const r   = (0.18 + h2 * 0.13) * s;
            const tsx = sx + ox, tsy = sy + oy;

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.beginPath();
            ctx.arc(tsx + r * 0.18, tsy + r * 0.18, r * 0.9, 0, Math.PI * 2);
            ctx.fill();

            // Canopy
            const gr = isDense
                ? `rgb(${Math.round(18 + h2 * 14)},${Math.round(44 + h2 * 18)},${Math.round(20)})`
                : `rgb(${Math.round(34 + h2 * 22)},${Math.round(68 + h2 * 26)},${Math.round(28)})`;
            ctx.fillStyle = gr;
            ctx.beginPath(); ctx.arc(tsx, tsy, r, 0, Math.PI * 2); ctx.fill();

            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.11)';
            ctx.beginPath();
            ctx.arc(tsx - r * 0.22, tsy - r * 0.22, r * 0.38, 0, Math.PI * 2);
            ctx.fill();
        }
    },

    // ─── Top-down rock (ellipse from above) ───────────────────────────────────
    _drawTopDownRock(ctx, sx, sy, zoom, isMtn, tx, ty) {
        const s    = CONFIG.CELL_SIZE * zoom;
        const hash = ((tx * 3571 + ty * 2819) & 0xFFFF) / 0xFFFF;
        if (hash > 0.42) return;
        const r  = (0.13 + hash * 0.11) * s;
        const cr = isMtn ? 88  + hash * 38 : 118 + hash * 28;
        const cg = isMtn ? 82  + hash * 34 : 105 + hash * 24;
        const cb = isMtn ? 78  + hash * 30 : 82  + hash * 18;

        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.beginPath();
        ctx.ellipse(sx + r * 0.18, sy + r * 0.18, r, r * 0.68, 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgb(${Math.round(cr)},${Math.round(cg)},${Math.round(cb)})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy, r, r * 0.68, 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath();
        ctx.ellipse(sx - r * 0.22, sy - r * 0.22, r * 0.32, r * 0.22, 0.3, 0, Math.PI * 2);
        ctx.fill();
    },

    // ─── Building dispatcher ──────────────────────────────────────────────────
    _drawTopDownBuilding(ctx, type, sx, sy, s) {
        switch (type) {
            case 'lumberjack': this._drawTopLumberjack(ctx, sx, sy, s); break;
            case 'house':      this._drawTopHouse(ctx, sx, sy, s);      break;
            case 'mine':       this._drawTopMine(ctx, sx, sy, s);       break;
            case 'warehouse':  this._drawTopWarehouse(ctx, sx, sy, s);  break;
            case 'foundry':    this._drawTopFoundry(ctx, sx, sy, s);    break;
        }
    },

    // ─── Lumberjack (round brown roof + log pile) ─────────────────────────────
    _drawTopLumberjack(ctx, sx, sy, s) {
        const r = s * 0.42;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.arc(sx + s*0.04, sy + s*0.04, r, 0, Math.PI*2); ctx.fill();

        ctx.fillStyle = '#7a3a12';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#4a2208'; ctx.lineWidth = s * 0.04; ctx.stroke();

        ctx.fillStyle = 'rgba(255,190,130,0.14)';
        ctx.beginPath(); ctx.arc(sx - r*0.2, sy - r*0.22, r * 0.38, 0, Math.PI*2); ctx.fill();

        // Log pile
        const lx = sx + r * 1.25, lw = r * 0.55, lh = r * 0.85;
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(lx, sy - lh*0.5, lw, lh);
        ctx.strokeStyle = '#3a2008'; ctx.lineWidth = s*0.02; ctx.strokeRect(lx, sy - lh*0.5, lw, lh);
        for (let i = 1; i < 3; i++) {
            ctx.strokeStyle = '#3a2008'; ctx.lineWidth = s*0.015;
            ctx.beginPath(); ctx.moveTo(lx, sy - lh*0.5 + lh/3*i); ctx.lineTo(lx+lw, sy - lh*0.5 + lh/3*i); ctx.stroke();
        }
    },

    // ─── House (orange-brown thatch roof + chimney) ───────────────────────────
    _drawTopHouse(ctx, sx, sy, s) {
        const r = s * 0.44;
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.arc(sx + s*0.04, sy + s*0.04, r, 0, Math.PI*2); ctx.fill();

        ctx.fillStyle = '#9a7232';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#5a3a12'; ctx.lineWidth = s*0.04; ctx.stroke();

        ctx.fillStyle = 'rgba(255,220,150,0.18)';
        ctx.beginPath(); ctx.arc(sx - r*0.15, sy - r*0.2, r*0.36, 0, Math.PI*2); ctx.fill();

        // Chimney dot
        ctx.fillStyle = '#6a6460';
        ctx.beginPath(); ctx.arc(sx + r*0.45, sy - r*0.45, s*0.065, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#4a4440';
        ctx.beginPath(); ctx.arc(sx + r*0.45, sy - r*0.45, s*0.04, 0, Math.PI*2); ctx.fill();
    },

    // ─── Mine (dark rock with opening) ────────────────────────────────────────
    _drawTopMine(ctx, sx, sy, s) {
        const r = s * 0.46;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath(); ctx.arc(sx + s*0.05, sy + s*0.05, r, 0, Math.PI*2); ctx.fill();

        ctx.fillStyle = '#5a5450';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.fill();

        ctx.fillStyle = '#1a1008';
        ctx.beginPath(); ctx.arc(sx, sy, r*0.44, 0, Math.PI*2); ctx.fill();

        ctx.strokeStyle = '#5a3a18'; ctx.lineWidth = s*0.045;
        ctx.beginPath(); ctx.arc(sx, sy, r*0.44, 0, Math.PI*2); ctx.stroke();

        // Cart
        const cw2 = s*0.12, ch2 = s*0.1;
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(sx + r*0.82, sy - ch2*0.5, cw2, ch2);
    },

    // ─── Warehouse (large flat roof + beam lines) ─────────────────────────────
    _drawTopWarehouse(ctx, sx, sy, s) {
        const r = s * 0.52;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath(); ctx.arc(sx + s*0.05, sy + s*0.05, r, 0, Math.PI*2); ctx.fill();

        ctx.fillStyle = '#5a4a2a';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = s*0.04; ctx.stroke();

        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = s*0.02;
        ctx.beginPath();
        ctx.moveTo(sx - r*0.65, sy - r*0.1); ctx.lineTo(sx + r*0.65, sy - r*0.1);
        ctx.moveTo(sx - r*0.35, sy - r*0.5); ctx.lineTo(sx + r*0.35, sy - r*0.5);
        ctx.stroke();

        // Door
        ctx.fillStyle = '#3a2508';
        ctx.fillRect(sx - s*0.04, sy + r*0.7, s*0.08, s*0.1);
    },

    // ─── Foundry (dark stone + fire glow, animated) ───────────────────────────
    _drawTopFoundry(ctx, sx, sy, s) {
        const r       = s * 0.48;
        const now     = Date.now();
        const flicker = Math.sin(now / 140) * 0.15 + 0.85;

        // Glow halo
        ctx.fillStyle = `rgba(255,75,0,${0.12 * flicker})`;
        ctx.beginPath(); ctx.arc(sx, sy, r * 1.45, 0, Math.PI*2); ctx.fill();

        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        ctx.beginPath(); ctx.arc(sx + s*0.05, sy + s*0.05, r, 0, Math.PI*2); ctx.fill();

        ctx.fillStyle = '#3a3430';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#1a1410'; ctx.lineWidth = s*0.04; ctx.stroke();

        // Fire opening
        ctx.fillStyle = `rgba(255,${Math.round(90*flicker)},0,${0.85*flicker})`;
        ctx.beginPath(); ctx.arc(sx, sy, r*0.42, 0, Math.PI*2); ctx.fill();

        // Chimney
        const chR = s * 0.07;
        ctx.fillStyle = '#3a3430';
        ctx.beginPath(); ctx.arc(sx - r*0.52, sy - r*0.52, chR, 0, Math.PI*2); ctx.fill();

        // Smoke puffs
        for (let i = 0; i < 3; i++) {
            const age  = (now / 600 + i * 1.4) % 5;
            const alpha = Math.max(0, 0.32 - age * 0.065);
            const smR  = (chR * 0.6 + age * chR * 0.35);
            const smX  = sx - r*0.52 + Math.sin(now/500 + i*2) * chR * 0.6;
            const smY  = sy - r*0.52 - age * chR * 1.1;
            ctx.fillStyle = `rgba(130,130,130,${alpha})`;
            ctx.beginPath(); ctx.arc(smX, smY, smR, 0, Math.PI*2); ctx.fill();
        }
    },

    // ─── Castle (top-down stone keep + 4 towers + flag) ──────────────────────
    _drawTopDownCastle(ctx, sx, sy, s) {
        const now = Date.now();
        const r   = s * 0.58;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.arc(sx + s*0.07, sy + s*0.07, r, 0, Math.PI*2); ctx.fill();

        // Stone base
        ctx.fillStyle = '#7a6a60';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#4a3a30'; ctx.lineWidth = s*0.05; ctx.stroke();

        // Brown roof
        ctx.fillStyle = '#8b4513';
        ctx.beginPath(); ctx.arc(sx, sy, r * 0.72, 0, Math.PI*2); ctx.fill();

        // 4 corner towers
        const towerR    = s * 0.1;
        const towerDist = r * 0.84;
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
            const tx2   = sx + Math.cos(angle) * towerDist;
            const ty2   = sy + Math.sin(angle) * towerDist;
            ctx.fillStyle = '#8a7a70';
            ctx.beginPath(); ctx.arc(tx2, ty2, towerR * 1.1, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#7a3a12';
            ctx.beginPath(); ctx.arc(tx2, ty2, towerR, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#4a2208'; ctx.lineWidth = s*0.02; ctx.stroke();
        }

        // Glow ring
        ctx.beginPath(); ctx.arc(sx, sy, r * 1.06, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(200,168,74,0.32)'; ctx.lineWidth = s*0.03; ctx.stroke();

        // Flagpole
        const fpx  = sx - r * 0.12, fpy = sy - r * 0.12;
        const pole = s * 0.38;
        ctx.strokeStyle = '#3a2510'; ctx.lineWidth = s * 0.022;
        ctx.beginPath(); ctx.moveTo(fpx, fpy); ctx.lineTo(fpx, fpy - pole); ctx.stroke();

        // Animated flag
        const wave = Math.sin(now / 380) * s * 0.032;
        ctx.fillStyle = '#3a7ad5';
        ctx.beginPath();
        ctx.moveTo(fpx, fpy - pole);
        ctx.quadraticCurveTo(fpx + s*0.065 + wave, fpy - pole + s*0.042,
                             fpx + s*0.13,           fpy - pole + s*0.032);
        ctx.lineTo(fpx + s*0.12,  fpy - pole + s*0.09);
        ctx.quadraticCurveTo(fpx + s*0.05 + wave*0.5, fpy - pole + s*0.096,
                             fpx,                      fpy - pole + s*0.096);
        ctx.closePath(); ctx.fill();

        // Cross on flag
        ctx.strokeStyle = '#e8d48a'; ctx.lineWidth = s * 0.013;
        const fcx = fpx + s*0.065, fcy = fpy - pole + s*0.063;
        ctx.beginPath();
        ctx.moveTo(fcx, fcy - s*0.022); ctx.lineTo(fcx, fcy + s*0.022);
        ctx.moveTo(fcx - s*0.02,  fcy); ctx.lineTo(fcx + s*0.02, fcy);
        ctx.stroke();
    },

    // ─── Legacy stubs (used nowhere but kept for compat) ─────────────────────
    buildTerrainBuffer_legacy() {},
    _drawKingdomOverlays() {},
    _drawCastle() {},
    _isoScreenPos() { return { sx: 0, sy: 0, zoom: 1 }; },
    _renderIso()   {},
    renderMinimap() {}
};
