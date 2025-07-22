class RGBEffect {
    constructor() {
        this.canvas = document.getElementById('backgroundCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.frame = 0;
        this.config = {
            spacing: 20,
            lineWidth: 1.5,
            mouseInfluence: 200,
            mouseHeight: 50,
            breathSpeed: 0.003,
            rotationSpeed: 0.0005,
            colorSpeed: 0.002
        };

        this.mouse = {
            x: 0,
            y: 0,
            pressed: false
        };

        this.setupCanvas();
        this.setupEventListeners();
        this.animate();
    }

    setupCanvas() {
        const updateSize = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', updateSize);
        updateSize();
    }

    setupEventListeners() {
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        window.addEventListener('mousedown', () => this.mouse.pressed = true);
        window.addEventListener('mouseup', () => this.mouse.pressed = false);
    }

    getHeight(x, y, time) {
        const dx = x - this.mouse.x;
        const dy = y - this.mouse.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        let height = 0;
        if (distance < this.config.mouseInfluence) {
            const angle = Math.atan2(dy, dx);
            const influenceFactor = 1 - distance / this.config.mouseInfluence;
            
            const rotation = Math.sin(angle + time * this.config.rotationSpeed);
            height = influenceFactor * this.config.mouseHeight * (0.8 + rotation * 0.2);
            
            height *= 1 + Math.sin(distance * 0.05 - time * this.config.breathSpeed) * 0.2;
        }
        
        return height;
    }

    getRGBColor(x, y, height, time) {
        const intensity = Math.min(Math.abs(height) / this.config.mouseHeight, 1);
        const angle = Math.atan2(y - this.mouse.y, x - this.mouse.x);
        const distance = Math.sqrt((x - this.mouse.x) ** 2 + (y - this.mouse.y) ** 2);
        
        const r = Math.sin(angle + time * this.config.colorSpeed) * 100 + 155;
        const g = Math.sin(distance * 0.01 + time * this.config.colorSpeed * 1.5) * 100 + 155;
        const b = Math.sin((x + y) * 0.01 + time * this.config.colorSpeed * 0.7) * 100 + 155;
        
        const breath = Math.sin(time * this.config.breathSpeed) * 0.2 + 0.8;
        const alpha = (intensity * 0.7 + 0.3) * breath;
        
        if (distance < this.config.mouseInfluence * 0.5) {
            const glow = (1 - distance / (this.config.mouseInfluence * 0.5)) * 0.4;
            return `rgba(${Math.min(r + r * glow, 255)}, 
                        ${Math.min(g + g * glow, 255)}, 
                        ${Math.min(b + b * glow, 255)}, 
                        ${alpha})`;
        }
        
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    draw() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        const points = [];
        for (let x = 0; x <= this.canvas.width; x += this.config.spacing) {
            points[x] = [];
            for (let y = 0; y <= this.canvas.height; y += this.config.spacing) {
                points[x][y] = this.getHeight(x, y, this.frame);
            }
        }

        // 绘制水平线和垂直线
        for (let y = 0; y <= this.canvas.height; y += this.config.spacing) {
            for (let x = 0; x < this.canvas.width; x += this.config.spacing) {
                // 水平线
                const height1 = points[x][y];
                const height2 = points[x + this.config.spacing] ? points[x + this.config.spacing][y] : height1;
                
                this.ctx.beginPath();
                this.ctx.moveTo(x, y + height1);
                this.ctx.lineTo(x + this.config.spacing, y + height2);
                
                this.ctx.strokeStyle = this.getRGBColor(x, y, (height1 + height2) / 2, this.frame);
                this.ctx.lineWidth = this.config.lineWidth;
                this.ctx.stroke();

                // 垂直线
                const height3 = points[x][y + this.config.spacing] || height1;
                
                this.ctx.beginPath();
                this.ctx.moveTo(x, y + height1);
                this.ctx.lineTo(x, y + this.config.spacing + height3);
                
                this.ctx.strokeStyle = this.getRGBColor(x, y, (height1 + height3) / 2, this.frame);
                this.ctx.stroke();
            }
        }
    }

    animate() {
        this.frame++;
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

// 初始化RGB效果
window.addEventListener('load', () => {
    new RGBEffect();
});
