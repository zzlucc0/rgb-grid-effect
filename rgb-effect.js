/**
 * Heavy Pixel Cyberpunk Background — UI-only world layer
 * Visual-only redesign: no gameplay logic touched.
 */
class RGBEffect {
    constructor() {
        this.canvas = document.getElementById('backgroundCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.frame = 0;
        this.mouse = { x: 0, y: 0, pressed: false };
        this.config = {
            spacing: 42,
            lineWidth: 1.1,
            mouseInfluence: 180,
            mouseHeight: 40,
            breathSpeed: 0.003,
            rotationSpeed: 0.00065,
            colorSpeed: 0.002,
            gridAlpha: 0.18
        };
        this.buildings = [];
        this.neonSigns = [];
        this.raindrops = [];
        this.lightBars = [];
        this.pillars = [];
        this.ambience = {
            lightSpeed: 1,
            rainAmount: 1,
            gridDistort: 0,
            bloomAlpha: 0,
            tintR: 0,
            tintG: 0,
            tintB: 0,
            tintA: 0,
            noiseAlpha: 0.06,
            dimFactor: 1,
            streakAlpha: 0.08
        };
        this.targetAmbience = { ...this.ambience };

        this.setupCanvas();
        this.setupEventListeners();
        this.generateWorld();
        this.animate();
        window.setCityAmbience = (seg) => this.setAmbience(seg);
    }

    setupCanvas() {
        const update = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.generateWorld();
        };
        window.addEventListener('resize', update);
        update();
    }

    setupEventListeners() {
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        window.addEventListener('mousedown', () => { this.mouse.pressed = true; });
        window.addEventListener('mouseup', () => { this.mouse.pressed = false; });
    }

    generateWorld() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const horizon = H * 0.56;

        this.buildings = [];
        let x = -16;
        while (x < W + 80) {
            const w = 44 + Math.random() * 92;
            const h = 110 + Math.random() * (H * 0.4);
            const windowCols = Math.max(2, Math.floor(w / 14));
            const windowRows = Math.max(4, Math.floor(h / 16));
            const windows = [];
            for (let r = 0; r < windowRows; r += 1) {
                for (let c = 0; c < windowCols; c += 1) {
                    windows.push({
                        rx: (c + 0.5) / windowCols,
                        ry: (r + 0.5) / windowRows,
                        on: Math.random() > 0.56,
                        flickerRate: 0.6 + Math.random() * 3,
                        flickerPhase: Math.random() * Math.PI * 2,
                        color: Math.random() > 0.75
                            ? (Math.random() > 0.5 ? '#5af6ff' : '#ff4fae')
                            : (Math.random() > 0.5 ? '#ffc94d' : '#d9ecff')
                    });
                }
            }
            this.buildings.push({ x, y: horizon, w, h, windows });
            x += w + 8 + Math.random() * 18;
        }

        const signTexts = ['ZPULSE', 'SYNC', 'OVERDRIVE', 'COMBO', '夜市', 'NEON', 'PULSE', 'STAGE'];
        const signColors = ['#5af6ff', '#ff4fae', '#9c6bff', '#ffc94d'];
        this.neonSigns = Array.from({ length: 5 }, (_, i) => {
            const b = this.buildings[Math.floor(Math.random() * this.buildings.length)];
            return {
                text: signTexts[Math.floor(Math.random() * signTexts.length)],
                x: b.x + b.w * (0.18 + Math.random() * 0.64),
                y: b.y - b.h * (0.3 + Math.random() * 0.4),
                color: signColors[i % signColors.length],
                flickerRate: 0.8 + Math.random() * 2.4,
                flickerPhase: Math.random() * Math.PI * 2,
                size: 12 + Math.random() * 10
            };
        });

        this.raindrops = [];
        const rainCount = Math.floor((W / 10) * 0.85);
        for (let i = 0; i < rainCount; i += 1) {
            this.raindrops.push({
                x: Math.random() * W,
                y: Math.random() * H,
                len: 8 + Math.random() * 18,
                speed: 3 + Math.random() * 7,
                alpha: 0.06 + Math.random() * 0.14,
                angle: 0.11 + Math.random() * 0.11
            });
        }

        this.lightBars = Array.from({ length: 9 }, (_, i) => ({
            x: ((i + 1) / 10) * W,
            width: 1 + Math.random() * 2,
            alpha: 0.05 + Math.random() * 0.08,
            speed: 0.5 + Math.random() * 1.4,
            phase: Math.random() * Math.PI * 2
        }));

        this.pillars = Array.from({ length: 7 }, (_, i) => ({
            x: (i / 6) * W,
            width: 22 + Math.random() * 20,
            top: horizon - (30 + Math.random() * 40),
            bottom: H,
            glow: i % 2 === 0 ? '#5af6ff' : '#ff4fae'
        }));
    }

    setAmbience(seg) {
        const presets = {
            intro: { lightSpeed: 0.7, rainAmount: 0.7, gridDistort: 0.02, bloomAlpha: 0.03, tintA: 0.03, tintR: 50, tintG: 130, tintB: 160, noiseAlpha: 0.08, dimFactor: 0.9, streakAlpha: 0.05 },
            verse: { lightSpeed: 0.9, rainAmount: 1, gridDistort: 0.05, bloomAlpha: 0.05, tintA: 0.02, tintR: 40, tintG: 120, tintB: 180, noiseAlpha: 0.06, dimFactor: 1, streakAlpha: 0.07 },
            pre: { lightSpeed: 1.35, rainAmount: 1.05, gridDistort: 0.14, bloomAlpha: 0.1, tintA: 0.04, tintR: 100, tintG: 80, tintB: 200, noiseAlpha: 0.05, dimFactor: 1.02, streakAlpha: 0.11 },
            chorus: { lightSpeed: 1.8, rainAmount: 1.15, gridDistort: 0.18, bloomAlpha: 0.14, tintA: 0.06, tintR: 255, tintG: 79, tintB: 174, noiseAlpha: 0.04, dimFactor: 1.08, streakAlpha: 0.15 },
            bridge: { lightSpeed: 0.6, rainAmount: 1.3, gridDistort: 0.08, bloomAlpha: 0.08, tintA: 0.05, tintR: 60, tintG: 120, tintB: 255, noiseAlpha: 0.08, dimFactor: 0.9, streakAlpha: 0.09 },
            outro: { lightSpeed: 0.45, rainAmount: 0.6, gridDistort: 0.02, bloomAlpha: 0.02, tintA: 0.02, tintR: 20, tintG: 50, tintB: 80, noiseAlpha: 0.1, dimFactor: 0.72, streakAlpha: 0.04 }
        };
        this.targetAmbience = { ...this.ambience, ...(presets[seg] || presets.verse) };
    }

    lerpAmbience(dt) {
        const speed = 2.5 * dt;
        for (const key of Object.keys(this.targetAmbience)) {
            if (typeof this.ambience[key] === 'number') {
                this.ambience[key] += (this.targetAmbience[key] - this.ambience[key]) * Math.min(1, speed);
            }
        }
    }

    getHeight(x, y, time) {
        const dx = x - this.mouse.x;
        const dy = y - this.mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let h = 0;
        if (dist < this.config.mouseInfluence) {
            const angle = Math.atan2(dy, dx);
            const influence = 1 - dist / this.config.mouseInfluence;
            h = influence * this.config.mouseHeight * (0.85 + Math.sin(angle + time * this.config.rotationSpeed) * 0.18);
            h *= 1 + Math.sin(dist * 0.06 - time * this.config.breathSpeed) * 0.16;
        }
        if (this.ambience.gridDistort > 0) h += Math.sin(x * 0.022 + time * 0.004) * this.ambience.gridDistort * 18;
        return h;
    }

    getGridColor(x, y, height, time) {
        const dist = Math.sqrt((x - this.mouse.x) ** 2 + (y - this.mouse.y) ** 2);
        const intensity = Math.min(Math.abs(height) / this.config.mouseHeight, 1);
        const r = 60 + Math.sin((x + y) * 0.009 + time * this.config.colorSpeed * 1.4) * 40 + this.ambience.tintR * this.ambience.tintA;
        const g = 170 + Math.sin(dist * 0.012 + time * this.config.colorSpeed * 1.8) * 44 + this.ambience.tintG * this.ambience.tintA;
        const b = 240 + Math.sin((x - y) * 0.01 + time * this.config.colorSpeed) * 50 + this.ambience.tintB * this.ambience.tintA;
        const alpha = (0.06 + intensity * 0.5) * this.config.gridAlpha * this.ambience.dimFactor;
        return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
    }

    drawSky() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const horizon = H * 0.56;
        const g = this.ctx.createLinearGradient(0, 0, 0, horizon);
        g.addColorStop(0, '#04050a');
        g.addColorStop(0.45, '#080a14');
        g.addColorStop(1, '#0b1020');
        this.ctx.fillStyle = g;
        this.ctx.fillRect(0, 0, W, horizon);

        const glow = this.ctx.createRadialGradient(W * 0.52, horizon * 0.18, 0, W * 0.52, horizon * 0.18, W * 0.36);
        glow.addColorStop(0, 'rgba(90,246,255,0.12)');
        glow.addColorStop(0.25, 'rgba(255,79,174,0.06)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        this.ctx.fillStyle = glow;
        this.ctx.fillRect(0, 0, W, horizon);
    }

    drawCity() {
        const t = this.frame * 0.016 * this.ambience.lightSpeed;
        for (const b of this.buildings) {
            this.ctx.fillStyle = 'rgba(7,10,18,0.96)';
            this.ctx.fillRect(b.x, b.y - b.h, b.w, b.h);
            this.ctx.fillStyle = 'rgba(255,255,255,0.015)';
            this.ctx.fillRect(b.x + 2, b.y - b.h, 2, b.h);
            for (const w of b.windows) {
                const pulse = Math.sin(t * w.flickerRate + w.flickerPhase);
                if (!w.on || pulse < -0.15) continue;
                const wx = b.x + w.rx * b.w - 2;
                const wy = b.y - b.h + w.ry * b.h - 3;
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = w.color;
                this.ctx.fillStyle = w.color;
                this.ctx.fillRect(wx, wy, 4, 6);
                this.ctx.shadowBlur = 0;
            }
        }
    }

    drawNeonSigns() {
        const t = this.frame * 0.016;
        for (const s of this.neonSigns) {
            const alpha = Math.max(0, 0.45 + Math.sin(t * s.flickerRate + s.flickerPhase) * 0.5);
            if (alpha < 0.15) continue;
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.font = `700 ${Math.round(s.size)}px 'Press Start 2P', monospace`;
            this.ctx.textAlign = 'center';
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = s.color;
            this.ctx.fillStyle = s.color;
            this.ctx.fillText(s.text, s.x, s.y);
            this.ctx.globalAlpha = alpha * 0.18;
            this.ctx.fillRect(s.x - s.text.length * s.size * 0.18, s.y + 4, s.text.length * s.size * 0.36, 3);
            this.ctx.restore();
        }
    }

    drawPillars() {
        for (const p of this.pillars) {
            const g = this.ctx.createLinearGradient(0, p.top, 0, p.bottom);
            g.addColorStop(0, 'rgba(255,255,255,0.02)');
            g.addColorStop(1, 'rgba(0,0,0,0.16)');
            this.ctx.fillStyle = g;
            this.ctx.fillRect(p.x - p.width * 0.5, p.top, p.width, p.bottom - p.top);

            this.ctx.fillStyle = p.glow === '#5af6ff' ? 'rgba(90,246,255,0.18)' : 'rgba(255,79,174,0.16)';
            this.ctx.fillRect(p.x - 1, p.top, 2, p.bottom - p.top);
        }
    }

    drawStreet() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const horizon = H * 0.56;
        const g = this.ctx.createLinearGradient(0, horizon, 0, H);
        g.addColorStop(0, '#0a0e18');
        g.addColorStop(0.55, '#070b14');
        g.addColorStop(1, '#030508');
        this.ctx.fillStyle = g;
        this.ctx.fillRect(0, horizon, W, H - horizon);

        const divider = this.ctx.createLinearGradient(0, 0, W, 0);
        divider.addColorStop(0, 'transparent');
        divider.addColorStop(0.2, 'rgba(90,246,255,0.55)');
        divider.addColorStop(0.5, 'rgba(255,79,174,0.48)');
        divider.addColorStop(0.8, 'rgba(90,246,255,0.55)');
        divider.addColorStop(1, 'transparent');
        this.ctx.strokeStyle = divider;
        this.ctx.lineWidth = 1.6;
        this.ctx.beginPath();
        this.ctx.moveTo(0, horizon);
        this.ctx.lineTo(W, horizon);
        this.ctx.stroke();

        const t = this.frame * 0.016 * this.ambience.lightSpeed;
        for (let i = 0; i < 5; i += 1) {
            const px = (0.12 + i * 0.2 + Math.sin(t * 0.2 + i) * 0.015) * W;
            const py = horizon + (0.18 + (i % 3) * 0.18) * (H - horizon);
            const r = 26 + i * 12;
            const pg = this.ctx.createRadialGradient(px, py, 0, px, py, r);
            const color = i % 2 === 0 ? '90,246,255' : '255,79,174';
            pg.addColorStop(0, `rgba(${color},0.18)`);
            pg.addColorStop(1, 'rgba(0,0,0,0)');
            this.ctx.fillStyle = pg;
            this.ctx.beginPath();
            this.ctx.ellipse(px, py, r, r * 0.28, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    drawPerspectiveGrid() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const horizon = H * 0.56;
        const vp = { x: W / 2, y: horizon };
        const rows = 8;
        const cols = 16;

        this.ctx.lineWidth = this.config.lineWidth;
        for (let i = 0; i <= cols; i += 1) {
            const bx = (i / cols) * W;
            this.ctx.strokeStyle = `rgba(90,246,255,${0.08 + (1 - Math.abs(i / cols - 0.5)) * 0.12})`;
            this.ctx.beginPath();
            this.ctx.moveTo(vp.x + (bx - vp.x) * 0.01, horizon + 1);
            this.ctx.lineTo(bx, H);
            this.ctx.stroke();
        }

        for (let j = 1; j <= rows; j += 1) {
            const y = horizon + (H - horizon) * Math.pow(j / rows, 2);
            this.ctx.strokeStyle = `rgba(90,246,255,${0.03 + (1 - j / rows) * 0.09})`;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(W, y);
            this.ctx.stroke();
        }

        const sp = this.config.spacing;
        const pts = {};
        for (let x = 0; x <= W; x += sp) {
            pts[x] = {};
            for (let y = horizon; y <= H; y += sp) pts[x][y] = this.getHeight(x, y, this.frame);
        }
        for (let y = horizon; y <= H; y += sp) {
            for (let x = 0; x < W; x += sp) {
                const h1 = pts[x]?.[y] || 0;
                const h2 = pts[x + sp]?.[y] || h1;
                this.ctx.beginPath();
                this.ctx.moveTo(x, y + h1);
                this.ctx.lineTo(x + sp, y + h2);
                this.ctx.strokeStyle = this.getGridColor(x, y, (h1 + h2) / 2, this.frame);
                this.ctx.stroke();
            }
        }
    }

    drawLightBars() {
        const H = this.canvas.height;
        const t = this.frame * 0.014;
        for (const bar of this.lightBars) {
            const glow = 0.4 + Math.sin(t * bar.speed + bar.phase) * 0.3;
            this.ctx.fillStyle = `rgba(90,246,255,${bar.alpha * glow})`;
            this.ctx.fillRect(bar.x, 0, bar.width, H);
        }
    }

    drawRain() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        this.ctx.lineWidth = 0.9;
        for (const d of this.raindrops) {
            this.ctx.strokeStyle = `rgba(180,220,255,${d.alpha * this.ambience.rainAmount})`;
            this.ctx.beginPath();
            this.ctx.moveTo(d.x, d.y);
            this.ctx.lineTo(d.x + d.len * d.angle, d.y + d.len);
            this.ctx.stroke();
            d.y += d.speed;
            d.x += d.speed * d.angle * 0.45;
            if (d.y > H) {
                d.y = -20;
                d.x = Math.random() * W;
            }
        }
    }

    drawForegroundSmear() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const alpha = this.ambience.streakAlpha;
        for (let i = 0; i < 6; i += 1) {
            const y = ((Math.sin(this.frame * 0.006 + i * 1.6) * 0.5 + 0.5) * 0.8 + 0.1) * H;
            const w = W * (0.25 + (i % 3) * 0.08);
            const x = ((Math.cos(this.frame * 0.004 + i * 2.4) * 0.5 + 0.5) * 0.7) * W;
            const color = i % 2 === 0 ? '90,246,255' : '255,79,174';
            const g = this.ctx.createLinearGradient(x, y, x + w, y);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(0.4, `rgba(${color},${alpha})`);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            this.ctx.fillStyle = g;
            this.ctx.fillRect(x, y, w, 3);
        }
    }

    drawPixelNoise() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const alpha = this.ambience.noiseAlpha;
        this.ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        for (let i = 0; i < 140; i += 1) {
            const x = (Math.sin(i * 91.3 + this.frame * 0.17) * 0.5 + 0.5) * W;
            const y = (Math.cos(i * 57.1 + this.frame * 0.13) * 0.5 + 0.5) * H;
            this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        }
    }

    drawTintAndBloom() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        if (this.ambience.tintA > 0) {
            this.ctx.fillStyle = `rgba(${Math.round(this.ambience.tintR)},${Math.round(this.ambience.tintG)},${Math.round(this.ambience.tintB)},${this.ambience.tintA})`;
            this.ctx.fillRect(0, 0, W, H);
        }
        if (this.ambience.bloomAlpha > 0) {
            const g = this.ctx.createRadialGradient(W * 0.5, H * 0.55, 0, W * 0.5, H * 0.55, W * 0.45);
            g.addColorStop(0, `rgba(90,246,255,${this.ambience.bloomAlpha * 0.85})`);
            g.addColorStop(0.3, `rgba(255,79,174,${this.ambience.bloomAlpha * 0.45})`);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            this.ctx.fillStyle = g;
            this.ctx.fillRect(0, 0, W, H);
        }
    }

    draw() {
        this.lerpAmbience(1 / 60);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawSky();
        this.drawLightBars();
        this.drawCity();
        this.drawNeonSigns();
        this.drawPillars();
        this.drawStreet();
        this.drawPerspectiveGrid();
        this.drawRain();
        this.drawForegroundSmear();
        this.drawPixelNoise();
        this.drawTintAndBloom();

        this.ctx.fillStyle = 'rgba(0,0,0,0.045)';
        for (let y = 0; y < this.canvas.height; y += 4) {
            this.ctx.fillRect(0, y, this.canvas.width, 1);
        }
    }

    animate() {
        this.frame += 1;
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

window.addEventListener('load', () => {
    new RGBEffect();
});
