class RhythmGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.notes = [];
        this.score = 0;
        this.combo = 0;
        this.isPlaying = false;
        this.audioBuffer = null;
        this.startTime = 0;
        this.lastNoteTime = 0;
        
        this.setupCanvas();
        this.setupEventListeners();
    }

    setupCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        });
    }

    setupEventListeners() {
        const audioUpload = document.getElementById('audioUpload');
        const startButton = document.getElementById('startGame');
        const uploadContainer = document.getElementById('uploadContainer');
        const searchButton = document.getElementById('searchButton');
        const songSearch = document.getElementById('songSearch');
        const searchResults = document.getElementById('searchResults');

        // 音乐搜索功能
        searchButton.addEventListener('click', () => {
            console.log('Search button clicked');
            searchResults.innerHTML = '搜索中...';
            if (songSearch.value) {
                const matchingSongs = Object.keys(defaultSongs).filter(songName => 
                    songName.toLowerCase().includes(songSearch.value.toLowerCase())
                );
                
                searchResults.innerHTML = '';
                
                if (matchingSongs.length > 0) {
                    matchingSongs.forEach(songName => {
                        const resultDiv = document.createElement('div');
                        resultDiv.className = 'song-result';
                        resultDiv.innerHTML = `
                            <div class="song-info">
                                <div class="song-title">${songName}</div>
                            </div>
                        `;
                        
                        resultDiv.addEventListener('click', async () => {
                            try {
                                searchResults.innerHTML = '加载中...';
                                const songUrl = defaultSongs[songName];
                                const response = await fetch(songUrl);
                                if (!response.ok) throw new Error('Failed to load audio file');
                                const arrayBuffer = await response.arrayBuffer();
                                this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                                startButton.disabled = false;
                                searchResults.innerHTML = `已加载: ${songName}`;
                            } catch (error) {
                                console.error('Error loading song:', error);
                                searchResults.innerHTML = '加载歌曲失败，请重试';
                                startButton.disabled = true;
                            }
                        });
                        searchResults.appendChild(resultDiv);
                    });
                } else {
                    searchResults.innerHTML = '未找到匹配的歌曲。可用歌曲：' + 
                        Object.keys(defaultSongs).join(', ');
                }
            }
        });

        // 键盘搜索功能
        songSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchButton.click();
            }
        });

        // 文件上传功能
        audioUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    startButton.disabled = false;
                    searchResults.innerHTML = `已选择文件: ${file.name}`;
                } catch (error) {
                    console.error('Error loading audio file:', error);
                    searchResults.innerHTML = '加载音频文件失败，请尝试其他文件';
                    startButton.disabled = true;
                }
            }
        });

        // 开始游戏按钮
        startButton.addEventListener('click', () => {
            console.log('Start button clicked', this.audioBuffer);
            if (this.audioBuffer) {
                uploadContainer.classList.add('hidden');
                this.startGame();
            } else {
                searchResults.innerHTML = '请先选择或上传一首歌曲';
            }
        });

        // 添加游戏控制事件
        this.canvas.addEventListener('mousedown', (e) => this.handleInput(e.clientX, e.clientY, 'start'));
        this.canvas.addEventListener('mousemove', (e) => this.handleInput(e.clientX, e.clientY, 'move'));
        this.canvas.addEventListener('mouseup', (e) => this.handleInput(e.clientX, e.clientY, 'end'));
        
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.handleInput(touch.clientX, touch.clientY, 'start');
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.handleInput(touch.clientX, touch.clientY, 'move');
        });
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            this.handleInput(touch.clientX, touch.clientY, 'end');
        });
    }

    async startGame() {
        this.isPlaying = true;
        this.score = 0;
        this.combo = 0;
        this.notes = [];
        this.startTime = this.audioContext.currentTime;

        // 创建音频源并连接分析器
        const source = this.audioContext.createBufferSource();
        source.buffer = this.audioBuffer;
        source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        
        // 设置分析器参数
        this.analyser.fftSize = 2048;
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // 开始播放音频
        source.start();
        
        // 开始游戏循环
        this.gameLoop(dataArray);
    }

    gameLoop(dataArray) {
        if (!this.isPlaying) return;

        // 获取音频数据
        this.analyser.getByteFrequencyData(dataArray);

        // 根据音频数据生成音符
        this.generateNotes(dataArray);

        // 更新和绘制音符
        this.updateNotes();
        this.drawNotes();

        // 继续循环
        requestAnimationFrame(() => this.gameLoop(dataArray));
    }

    generateNotes(audioData) {
        const currentTime = this.audioContext.currentTime - this.startTime;
        const timeSinceLastNote = currentTime - this.lastNoteTime;
        
        // 分析音频数据以检测节拍
        const beat = this.detectBeat(audioData);
        
        if (beat && timeSinceLastNote > 0.3) { // 最小音符间隔
            this.lastNoteTime = currentTime;
            
            // 随机生成不同类型的音符
            const noteTypes = ['click', 'hold', 'slider'];
            const type = noteTypes[Math.floor(Math.random() * noteTypes.length)];
            
            const note = {
                type: type,
                x: Math.random() * (this.canvas.width - 100) + 50,
                y: -50, // 从屏幕顶部开始
                speed: 5,
                size: 40,
                hit: false,
                createTime: currentTime
            };

            if (type === 'hold') {
                note.duration = 1; // 1秒的长按
            } else if (type === 'slider') {
                note.endX = Math.random() * (this.canvas.width - 100) + 50;
                note.endY = this.canvas.height - 100;
            }

            this.notes.push(note);
        }
    }

    detectBeat(audioData) {
        // 简单的节拍检测算法
        let sum = 0;
        const sampleSize = 8; // 采样大小
        
        // 计算低频能量
        for (let i = 0; i < sampleSize; i++) {
            sum += audioData[i];
        }
        const average = sum / sampleSize;
        
        return average > 200; // 节拍阈值
    }

    updateNotes() {
        this.notes = this.notes.filter(note => {
            note.y += note.speed;
            
            // 移除超出屏幕的音符
            if (note.y > this.canvas.height + 50) {
                if (!note.hit) {
                    this.combo = 0; // 错过音符，重置连击
                }
                return false;
            }
            return true;
        });
    }

    drawNotes() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.notes.forEach(note => {
            if (note.hit) return;

            this.ctx.beginPath();
            
            if (note.type === 'click') {
                this.ctx.arc(note.x, note.y, note.size / 2, 0, Math.PI * 2);
                this.ctx.fillStyle = '#ff6b6b';
            } else if (note.type === 'hold') {
                this.ctx.fillStyle = '#4ecdc4';
                this.ctx.fillRect(note.x - note.size / 2, note.y - note.size, note.size, note.size * 2);
            } else if (note.type === 'slider') {
                this.ctx.strokeStyle = '#ffd93d';
                this.ctx.lineWidth = 4;
                this.ctx.moveTo(note.x, note.y);
                this.ctx.lineTo(note.endX, note.endY);
                this.ctx.stroke();
            }
            
            this.ctx.fill();
        });

        // 绘制连击数
        if (this.combo > 1) {
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '24px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`${this.combo}x Combo!`, this.canvas.width / 2, 50);
        }
    }

    handleInput(x, y, type) {
        if (!this.isPlaying) return;

        this.notes.forEach(note => {
            if (note.hit) return;

            const distance = Math.sqrt((x - note.x) ** 2 + (y - note.y) ** 2);
            
            if (distance < note.size) {
                if (note.type === 'click' && type === 'start') {
                    this.hitNote(note);
                } else if (note.type === 'hold' && (type === 'start' || type === 'move')) {
                    this.hitNote(note);
                } else if (note.type === 'slider' && type === 'move') {
                    const endDistance = Math.sqrt((x - note.endX) ** 2 + (y - note.endY) ** 2);
                    if (endDistance < note.size) {
                        this.hitNote(note);
                    }
                }
            }
        });
    }

    hitNote(note) {
        note.hit = true;
        this.combo++;
        this.score += 100 * (1 + this.combo * 0.1);
        document.getElementById('score').textContent = Math.floor(this.score);

        // 创建打击效果
        this.createHitEffect(note.x, note.y);
    }

    createHitEffect(x, y) {
        const particles = [];
        for (let i = 0; i < 10; i++) {
            const angle = (Math.PI * 2 * i) / 10;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * 5,
                vy: Math.sin(angle) * 5,
                life: 1
            });
        }

        const animate = () => {
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.life -= 0.02;

                if (p.life > 0) {
                    this.ctx.beginPath();
                    this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                    this.ctx.fillStyle = `rgba(255, 255, 255, ${p.life})`;
                    this.ctx.fill();
                }
            });

            if (particles.some(p => p.life > 0)) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }
}

// 初始化游戏
window.addEventListener('load', () => {
    new RhythmGame();
});
