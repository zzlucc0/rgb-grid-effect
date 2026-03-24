/**
 * Cyberpunk City Background — World Layer
 */
class RGBEffect {
    constructor() {
        this.canvas = document.getElementById('backgroundCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.frame = 0;
        this.config = { spacing:40, lineWidth:1.2, mouseInfluence:200, mouseHeight:50, breathSpeed:0.003, rotationSpeed:0.0005, colorSpeed:0.002, gridAlpha:0.22 };
        this.mouse = { x:0, y:0, pressed:false };
        this.buildings = []; this.neonSigns = []; this.raindrops = [];
        this.ambience = { lightSpeed:1, rainAmount:1, gridDistort:0, bloomAlpha:0, tintR:0,tintG:0,tintB:0,tintA:0, noiseAlpha:0, dimFactor:1 };
        this.targetAmbience = { ...this.ambience };
        this.setupCanvas(); this.setupEventListeners(); this.generateCity(); this.animate();
        window.setCityAmbience = (seg) => this.setAmbience(seg);
    }

    setupCanvas() {
        const upd = () => { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; this.generateCity(); };
        window.addEventListener('resize', upd); upd();
    }

    setupEventListeners() {
        window.addEventListener('mousemove', e => { this.mouse.x=e.clientX; this.mouse.y=e.clientY; });
        window.addEventListener('mousedown', () => this.mouse.pressed=true);
        window.addEventListener('mouseup', () => this.mouse.pressed=false);
    }

    generateCity() {
        const W=this.canvas.width, H=this.canvas.height, horizon=H*0.55;
        this.buildings = [];
        let x=-10;
        while (x < W+40) {
            const w=30+Math.random()*80, h=60+Math.random()*(H*0.48);
            const wR=Math.floor(h/14), wC=Math.max(1,Math.floor(w/14));
            const windows=[];
            for(let r=0;r<wR;r++) for(let c=0;c<wC;c++) windows.push({
                rx:(c+.5)/wC, ry:(r+.5)/wR, on:Math.random()>.55,
                flickerRate:.5+Math.random()*3, flickerPhase:Math.random()*Math.PI*2,
                color:Math.random()>.7?(Math.random()>.5?'#28f0ff':'#ff3ca6'):'#ffe066'
            });
            this.buildings.push({x,y:horizon,w,h,windows});
            x+=w+2+Math.random()*12;
        }
        this.neonSigns=[];
        const sT=['CYBER','NEON','GRID','節奏','BYTE','SYNC'], sC=['#28f0ff','#ff3ca6','#8b5cf6'];
        const sc=2+Math.floor(Math.random()*2);
        for(let i=0;i<sc;i++){
            const b=this.buildings[Math.floor(Math.random()*this.buildings.length)];
            if(!b) continue;
            this.neonSigns.push({text:sT[Math.floor(Math.random()*sT.length)],x:b.x+b.w*(.2+Math.random()*.6),y:b.y-b.h*(.3+Math.random()*.4),color:sC[i%sC.length],flickerRate:1.2+Math.random()*2,flickerPhase:Math.random()*Math.PI*2,size:14+Math.random()*10});
        }
        this.raindrops=[]; this.spawnRain(120);
    }

    spawnRain(n) {
        const W=this.canvas.width,H=this.canvas.height;
        for(let i=0;i<n;i++) this.raindrops.push({x:Math.random()*W,y:Math.random()*H,len:6+Math.random()*14,speed:3+Math.random()*6,alpha:.08+Math.random()*.15,angle:.12+Math.random()*.08});
    }

    setAmbience(seg) {
        const P={
            intro:{lightSpeed:.7,rainAmount:.8,gridDistort:0,bloomAlpha:0,tintA:0,noiseAlpha:0,dimFactor:.85},
            verse:{lightSpeed:.8,rainAmount:1,gridDistort:0,bloomAlpha:0,tintA:0,noiseAlpha:0,dimFactor:1},
            pre:{lightSpeed:1.5,rainAmount:1,gridDistort:.3,bloomAlpha:.05,tintA:0,noiseAlpha:.02,dimFactor:1},
            chorus:{lightSpeed:1.8,rainAmount:1.2,gridDistort:.1,bloomAlpha:.12,tintR:255,tintG:60,tintB:166,tintA:.04,noiseAlpha:0,dimFactor:1.1},
            bridge:{lightSpeed:.6,rainAmount:1.6,gridDistort:0,bloomAlpha:.04,tintR:20,tintG:80,tintB:180,tintA:.06,noiseAlpha:.01,dimFactor:.9},
            outro:{lightSpeed:.4,rainAmount:.6,gridDistort:0,bloomAlpha:0,tintA:0,noiseAlpha:.06,dimFactor:.65}
        };
        this.targetAmbience={...this.ambience,...(P[seg]||P.verse)};
    }

    lerpAmbience(dt) {
        const s=2.5*dt;
        for(const k of Object.keys(this.targetAmbience))
            if(typeof this.ambience[k]==='number') this.ambience[k]+=(this.targetAmbience[k]-this.ambience[k])*Math.min(1,s);
    }

    getHeight(x,y,time) {
        const dx=x-this.mouse.x,dy=y-this.mouse.y,dist=Math.sqrt(dx*dx+dy*dy);
        let h=0;
        if(dist<this.config.mouseInfluence){
            const angle=Math.atan2(dy,dx),inf=1-dist/this.config.mouseInfluence;
            h=inf*this.config.mouseHeight*(0.8+Math.sin(angle+time*this.config.rotationSpeed)*0.2);
            h*=1+Math.sin(dist*0.05-time*this.config.breathSpeed)*0.2;
        }
        if(this.ambience.gridDistort>0) h+=Math.sin(x*0.02+time*0.004)*this.ambience.gridDistort*12;
        return h;
    }

    getRGBColor(x,y,height,time) {
        const intensity=Math.min(Math.abs(height)/this.config.mouseHeight,1);
        const dist=Math.sqrt((x-this.mouse.x)**2+(y-this.mouse.y)**2);
        const r=Math.sin((x+y)*.008+time*this.config.colorSpeed)*40+40;
        const g=Math.sin(dist*.012+time*this.config.colorSpeed*1.5)*40+200;
        const b=Math.sin((x-y)*.01+time*this.config.colorSpeed*.7)*40+255;
        const breath=Math.sin(time*this.config.breathSpeed)*.15+.85;
        const alpha=(intensity*.5+.12)*breath*this.config.gridAlpha;
        return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
    }

    drawGrid() {
        const W=this.canvas.width,H=this.canvas.height,sp=this.config.spacing;
        const pts={};
        for(let x=0;x<=W;x+=sp){pts[x]={};for(let y=0;y<=H;y+=sp) pts[x][y]=this.getHeight(x,y,this.frame);}
        this.ctx.lineWidth=this.config.lineWidth;
        for(let y=0;y<=H;y+=sp) for(let x=0;x<W;x+=sp){
            const h1=pts[x]?.[y]||0,h2=pts[x+sp]?.[y]||h1;
            this.ctx.beginPath();this.ctx.moveTo(x,y+h1);this.ctx.lineTo(x+sp,y+h2);
            this.ctx.strokeStyle=this.getRGBColor(x,y,(h1+h2)/2,this.frame);this.ctx.stroke();
            const h3=pts[x]?.[y+sp]||h1;
            this.ctx.beginPath();this.ctx.moveTo(x,y+h1);this.ctx.lineTo(x,y+sp+h3);
            this.ctx.strokeStyle=this.getRGBColor(x,y,(h1+h3)/2,this.frame);this.ctx.stroke();
        }
    }

    drawSky() {
        const W=this.canvas.width,H=this.canvas.height,horizon=H*.55;
        const g=this.ctx.createLinearGradient(0,0,0,horizon);
        g.addColorStop(0,'#010309');g.addColorStop(.6,'#05070d');g.addColorStop(1,'#0a0b18');
        this.ctx.fillStyle=g;this.ctx.fillRect(0,0,W,horizon);
    }

    drawBuildings() {
        const t=this.frame*.016;
        for(const b of this.buildings){
            this.ctx.fillStyle='#070a12';
            this.ctx.fillRect(b.x,b.y-b.h,b.w,b.h);
            for(const w of b.windows){
                if(!w.on||Math.sin(t*w.flickerRate+w.flickerPhase)<0.3) continue;
                const wx=b.x+w.rx*b.w-2,wy=b.y-b.h+w.ry*b.h-3;
                this.ctx.fillStyle=w.color;this.ctx.shadowBlur=6;this.ctx.shadowColor=w.color;
                this.ctx.fillRect(wx,wy,4,5);this.ctx.shadowBlur=0;
            }
        }
    }

    drawNeonSigns() {
        const t=this.frame*.016;
        for(const s of this.neonSigns){
            const alpha=Math.max(0,.6+Math.sin(t*s.flickerRate+s.flickerPhase)*.4);
            if(alpha<.2) continue;
            this.ctx.globalAlpha=alpha;this.ctx.shadowBlur=18;this.ctx.shadowColor=s.color;
            this.ctx.fillStyle=s.color;this.ctx.font=`700 ${Math.round(s.size)}px 'Press Start 2P',monospace`;
            this.ctx.textAlign='center';this.ctx.fillText(s.text,s.x,s.y);
            this.ctx.shadowBlur=0;this.ctx.globalAlpha=1;
        }
    }

    drawRain() {
        const W=this.canvas.width,H=this.canvas.height;
        this.ctx.strokeStyle='rgba(150,200,255,0.12)';this.ctx.lineWidth=.8;
        for(const d of this.raindrops){
            this.ctx.globalAlpha=d.alpha*this.ambience.rainAmount;
            this.ctx.beginPath();this.ctx.moveTo(d.x,d.y);this.ctx.lineTo(d.x+d.len*d.angle,d.y+d.len);this.ctx.stroke();
            d.y+=d.speed;d.x+=d.speed*d.angle*.5;
            if(d.y>H){d.y=-20;d.x=Math.random()*W;}
        }
        this.ctx.globalAlpha=1;
    }

    drawStreet() {
        const W=this.canvas.width,H=this.canvas.height,horizon=H*.55,t=this.frame*.016;
        // Asphalt
        const ag=this.ctx.createLinearGradient(0,horizon,0,H);
        ag.addColorStop(0,'#080c14');ag.addColorStop(.4,'#060910');ag.addColorStop(1,'#030508');
        this.ctx.fillStyle=ag;this.ctx.fillRect(0,horizon,W,H-horizon);
        // Horizon divider
        const ha=.5+Math.sin(t*1.2)*.15;
        const hg=this.ctx.createLinearGradient(0,0,W,0);
        hg.addColorStop(0,'transparent');hg.addColorStop(.2,`rgba(40,240,255,${ha})`);
        hg.addColorStop(.5,`rgba(255,60,166,${ha*.8})`);hg.addColorStop(.8,`rgba(40,240,255,${ha})`);hg.addColorStop(1,'transparent');
        this.ctx.strokeStyle=hg;this.ctx.lineWidth=1.5;
        this.ctx.beginPath();this.ctx.moveTo(0,horizon);this.ctx.lineTo(W,horizon);this.ctx.stroke();
        // Perspective grid — 14 vertical, 7 horizontal
        const vp={x:W/2,y:horizon};
        this.ctx.lineWidth=.8;
        for(let i=0;i<=14;i++){
            const bx=(i/14)*W;
            this.ctx.strokeStyle=`rgba(40,240,255,0.18)`;
            this.ctx.globalAlpha=.22*(1-Math.abs(i/14-.5)*.6);
            this.ctx.beginPath();this.ctx.moveTo(vp.x+(bx-vp.x)*.01,horizon+1);this.ctx.lineTo(bx,H);this.ctx.stroke();
        }
        for(let j=1;j<=7;j++){
            const ly=horizon+(H-horizon)*Math.pow(j/7,2);
            this.ctx.strokeStyle='rgba(40,240,255,0.12)';this.ctx.globalAlpha=.14;
            this.ctx.beginPath();this.ctx.moveTo(0,ly);this.ctx.lineTo(W,ly);this.ctx.stroke();
        }
        this.ctx.globalAlpha=1;
        // Building reflections
        for(const b of this.buildings){
            const rH=Math.min(b.h*.35,H-horizon);
            if(rH<2) continue;
            const rg=this.ctx.createLinearGradient(0,horizon,0,horizon+rH);
            rg.addColorStop(0,'rgba(8,12,20,0.55)');rg.addColorStop(1,'rgba(8,12,20,0)');
            this.ctx.fillStyle=rg;this.ctx.fillRect(b.x,horizon,b.w,rH);
        }
        // Puddles
        for(let p=0;p<4;p++){
            const seed=p*137.508;
            const px=((Math.sin(seed)*.5+.5)*.8+.1)*W;
            const py=horizon+(H-horizon)*(.2+(Math.cos(seed)*.5+.5)*.6);
            const pr=18+p*12,pulsate=.6+Math.sin(t*.8+p*1.2)*.4;
            const cols=['rgba(40,240,255,','rgba(255,60,166,','rgba(139,92,246,','rgba(255,224,102,'];
            const pg=this.ctx.createRadialGradient(px,py,0,px,py,pr);
            pg.addColorStop(0,cols[p%cols.length]+(0.18*pulsate)+')');pg.addColorStop(1,'rgba(0,0,0,0)');
            this.ctx.fillStyle=pg;this.ctx.beginPath();
            this.ctx.ellipse(px,py,pr,pr*.3,0,0,Math.PI*2);this.ctx.fill();
        }
    }

    draw() {
        this.lerpAmbience(1/60);
        this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
        this.drawSky();this.drawBuildings();this.drawNeonSigns();
        this.drawStreet();this.drawGrid();this.drawRain();
        // Scanlines
        this.ctx.fillStyle='rgba(0,0,0,0.04)';
        for(let y=0;y<this.canvas.height;y+=4) this.ctx.fillRect(0,y,this.canvas.width,1);
    }

    animate() { this.frame++; this.draw(); requestAnimationFrame(()=>this.animate()); }
}

window.addEventListener('load',()=>{new RGBEffect();});
