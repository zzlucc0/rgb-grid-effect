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
    spacing: 20,      // 网格间距
    lineWidth: 1.5,   // 线条宽度
    mouseInfluence: 200, // 鼠标影响范围
    mouseHeight: 50,  // 鼠标影响高度
    breathSpeed: 0.003, // 呼吸效果速度
    rotationSpeed: 0.0005, // 旋转速度
    colorSpeed: 0.002  // 颜色变化速度
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
    let height = 0;
    if (distance < config.mouseInfluence) {
        const angle = Math.atan2(dy, dx);
        const influenceFactor = 1 - distance / config.mouseInfluence;
        
        // 添加旋转效果
        const rotation = Math.sin(angle + time * config.rotationSpeed);
        height = influenceFactor * config.mouseHeight * (0.8 + rotation * 0.2);
        
        // 添加波纹效果
        height *= 1 + Math.sin(distance * 0.05 - time * config.breathSpeed) * 0.2;
    }
    
    return height;
}

// 获取RGB颜色
function getRGBColor(x, y, height, time) {
    const intensity = Math.min(Math.abs(height) / config.mouseHeight, 1);
    const angle = Math.atan2(y - mouse.y, x - mouse.x);
    const distance = Math.sqrt((x - mouse.x) ** 2 + (y - mouse.y) ** 2);
    
    // 动态颜色计算
    const r = Math.sin(angle + time * config.colorSpeed) * 127 + 128;
    const g = Math.sin(distance * 0.01 + time * config.colorSpeed * 1.5) * 127 + 128;
    const b = Math.sin((x + y) * 0.01 + time * config.colorSpeed * 0.7) * 127 + 128;
    
    // 呼吸效果
    const breath = Math.sin(time * config.breathSpeed) * 0.3 + 0.7;
    const alpha = (intensity * 0.8 + 0.2) * breath;
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 动画循环
function animate() {
    frame++;
    
    // 清除画布，添加轻微的拖尾效果
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 计算每个点的高度
    const points = [];
    for (let x = 0; x <= canvas.width; x += config.spacing) {
        points[x] = [];
        for (let y = 0; y <= canvas.height; y += config.spacing) {
            points[x][y] = getHeight(x, y, frame);
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
            
            const color = getRGBColor(x, y, (height1 + height2) / 2, frame);
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
            
            const color = getRGBColor(x, y, (height1 + height2) / 2, frame);
            ctx.strokeStyle = color;
            ctx.lineWidth = config.lineWidth;
            ctx.stroke();
        }
    }
    
    requestAnimationFrame(animate);
}

// 启动动画
animate();
