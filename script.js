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
    spacing: 25,      // 网格间距
    lineWidth: 1,     // 线条宽度
    mouseInfluence: 150, // 鼠标影响范围
    mouseHeight: 40   // 鼠标影响高度
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
function getHeight(x, y) {
    // 计算到鼠标的距离
    const dx = x - mouse.x;
    const dy = y - mouse.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // 只有鼠标影响
    let height = 0;
    if (distance < config.mouseInfluence) {
        height = (1 - distance / config.mouseInfluence) * config.mouseHeight;
    }
    
    return height;
}

// 获取RGB颜色
function getRGBColor(x, y, height) {
    const intensity = Math.min(Math.abs(height) / config.mouseHeight, 1);
    const r = Math.sin(x * 0.01) * 127 + 128;
    const g = Math.sin(y * 0.01) * 127 + 128;
    const b = Math.sin((x + y) * 0.01) * 127 + 128;
    
    return `rgba(${r}, ${g}, ${b}, ${intensity * 0.8 + 0.2})`;
}

// 动画循环
function animate() {
    // 清除画布
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 计算每个点的高度
    const points = [];
    for (let x = 0; x <= canvas.width; x += config.spacing) {
        points[x] = [];
        for (let y = 0; y <= canvas.height; y += config.spacing) {
            points[x][y] = getHeight(x, y);
        }
    }
    
    // 绘制水平线
    for (let y = 0; y <= canvas.height; y += config.spacing) {
        for (let x = 0; x < canvas.width; x += config.spacing) {
            const height1 = points[x][y];
            const height2 = points[x + config.spacing] ? points[x + config.spacing][y] : height1;
            
            ctx.beginPath();
            ctx.moveTo(x, y + height1);
            ctx.lineTo(x + config.spacing, y + height2);
            
            const color = getRGBColor(x, y, (height1 + height2) / 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = config.lineWidth;
            ctx.stroke();
        }
    }
    
    // 绘制垂直线
    for (let x = 0; x <= canvas.width; x += config.spacing) {
        for (let y = 0; y < canvas.height; y += config.spacing) {
            const height1 = points[x][y];
            const height2 = points[x][y + config.spacing] || height1;
            
            ctx.beginPath();
            ctx.moveTo(x, y + height1);
            ctx.lineTo(x, y + config.spacing + height2);
            
            const color = getRGBColor(x, y, (height1 + height2) / 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = config.lineWidth;
            ctx.stroke();
        }
    }
    
    requestAnimationFrame(animate);
}

// 启动动画
animate();
