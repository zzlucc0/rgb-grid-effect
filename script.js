const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// 设置canvas尺寸为窗口大小
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// 网格配置
const config = {
    spacing: 30,      // 网格间距
    dotSize: 2,       // 点的大小
    waveSpeed: 0.02,  // 波浪速度
    waveHeight: 50,   // 波浪高度
    mouseInfluence: 100, // 鼠标影响范围
    mouseHeight: 30   // 鼠标影响高度
};

// 鼠标位置
let mouse = {
    x: 0,
    y: 0
};

// 更新鼠标位置
canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

// 动画帧
let frame = 0;

// 计算点的高度
function getHeight(x, y, time) {
    // 计算到鼠标的距离
    const dx = x - mouse.x;
    const dy = y - mouse.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // 鼠标影响
    let mouseEffect = 0;
    if (distance < config.mouseInfluence) {
        mouseEffect = (1 - distance / config.mouseInfluence) * config.mouseHeight;
    }
    
    // 基础波浪效果
    const wave = Math.sin(x * 0.02 + time * config.waveSpeed) * 
                Math.cos(y * 0.02 + time * config.waveSpeed) * 
                config.waveHeight;
    
    return wave + mouseEffect;
}

// 获取RGB颜色
function getRGBColor(x, y, time, height) {
    const r = Math.sin(x * 0.01 + time * 0.001) * 127 + 128;
    const g = Math.sin(y * 0.01 - time * 0.001) * 127 + 128;
    const b = Math.sin((x + y) * 0.01 + time * 0.002) * 127 + 128;
    
    return `rgb(${r}, ${g}, ${b})`;
}

// 动画循环
function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 绘制网格
    for (let x = 0; x < canvas.width; x += config.spacing) {
        for (let y = 0; y < canvas.height; y += config.spacing) {
            const height = getHeight(x, y, frame);
            const color = getRGBColor(x, y, frame, height);
            
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(
                x + Math.sin(frame * 0.01) * 2,
                y + height,
                config.dotSize + Math.abs(height) * 0.05,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }
    
    frame++;
    requestAnimationFrame(animate);
}

// 启动动画
animate();
