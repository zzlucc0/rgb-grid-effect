class RhythmGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 先设置画布尺寸
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.notes = [];
        this.score = 0;
        this.combo = 0;
        this.isPlaying = false;
        this.audioBuffer = null;
        this.startTime = 0;
        this.lastNoteTime = 0;
        
        // 频谱分析配置
        this.analyser.fftSize = 2048;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        
        // 人声频率范围 (Hz)
        this.vocalFreqRange = {
            min: 80,  // 低音
            max: 1100 // 高音
        };
        
        // 人声检测配置
        this.vocalEnergyHistory = [];
        this.vocalThreshold = 0.8; // 提高人声检测阈值
        this.vocalEnergySmoothing = 0.8; // 平滑系数
        this.debugMode = true; // 添加调试模式
        
        // 节奏分析配置
        this.energyHistory = [];
        this.beatThreshold = 0.85; // 降低节拍检测阈值，使节拍更容易被检测到
        this.minBeatInterval = 0.3; // 增加最小节拍间隔(秒)，使节奏更缓慢
        this.currentPattern = 0; // 当前音符生成模式
        this.currentPatternIndex = 0; // 当前活跃区域索引
        this.energyThreshold = 0; // 动态能量阈值
        this.beatDetected = false; // 是否检测到节拍
        
        // 音符生成配置
        const margin = 100; // 边距
        this.safeArea = {
            x: margin,
            y: margin,
            width: this.canvas.width - margin * 2,
            height: this.canvas.height - margin * 2
        };
        
        // 节拍计数器
        this.beatCount = 0;
        
        // 音符计数和分组配置
        this.noteCount = 0;
        this.groupPauseTime = 3000; // 组间暂停时间(毫秒)
        this.lastGroupEndTime = 0; // 上一组结束时间
        this.isGroupPaused = false; // 是否在组间暂停
        
        // 游戏配置
        this.approachRate = 2000; // 光圈收缩时间(毫秒)，减慢收缩速度
        this.circleSize = 60; // 目标圆圈大小
        this.approachCircleSize = 180; // 光圈初始大小，增大初始大小
        this.perfectRange = 300; // 完美判定范围(毫秒)，增加判定范围
        this.goodRange = 500; // 好判定范围(毫秒)，增加判定范围
        this.colors = {
            approach: 'rgba(255, 255, 255, 0.3)',
            circle: '#ff6b6b',
            perfect: '#4ecdc4',
            good: '#ffe66d',
            miss: '#ff6b6b'
        };
        this.debugMode = false; // 关闭调试模式
        
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
        this.beatCount = 0; // 重置节拍计数
        this.noteCount = 0; // 重置音符计数
        this.isGroupPaused = false; // 重置暂停状态
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
        
        // 检测人声和节拍
        const { beat, vocal, energy } = this.detectVocalAndBeat(audioData);
        
        // 检查是否需要结束暂停状态
        if (this.isGroupPaused) {
            const remainingPauseTime = Math.ceil(this.groupPauseTime / 1000 - (currentTime - this.lastGroupEndTime));
            
            // 显示倒计时
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(remainingPauseTime.toString(), this.canvas.width / 2, this.canvas.height / 2 + 50);
            
            if (currentTime - this.lastGroupEndTime >= this.groupPauseTime / 1000) {
                this.isGroupPaused = false;
                this.noteCount = 0; // 重置计数器，开始新的一组
                this.currentGroupStartTime = currentTime; // 记录新组开始时间
                this.lastNoteTime = currentTime; // 重置最后一个音符的时间
                this.startTime = this.audioContext.currentTime; // 重置时间基准点
                this.beatCount = 0; // 重置节拍计数
            }
            return; // 在暂停状态下直接返回
        }
        
        // 只在检测到节拍且不在暂停状态时处理
        if (beat && currentTime - this.lastNoteTime >= this.minBeatInterval && !this.isGroupPaused) {
            this.beatCount++;
            
            // 每16拍生成一个音符
            if (this.beatCount % 16 === 0) {
                // 检查是否需要暂停（每10个音符一组）
                if (this.noteCount >= 10) {
                    this.isGroupPaused = true;
                    this.lastGroupEndTime = currentTime;
                    
                    // 显示组间提示
                    this.ctx.fillStyle = '#fff';
                    this.ctx.font = '36px Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText('准备下一组...', this.canvas.width / 2, this.canvas.height / 2);
                    
                    return;
                }

                // 计算新音符的位置
                let x, y;
                
                // 检查是否与其他音符重叠
                const checkOverlap = (x, y) => {
                    const minSafeDistance = this.circleSize * 2.2; // 设置最小安全距离
                    return this.notes.some(note => {
                        if (note.hit) return false; // 忽略已经击中的音符
                        const dx = note.x - x;
                        const dy = note.y - y;
                        return Math.sqrt(dx * dx + dy * dy) < minSafeDistance;
                    });
                };

                if (this.noteCount === 0) {
                    // 第一个音符放在中心位置
                    x = this.canvas.width / 2;
                    y = this.canvas.height / 2;
                } else {
                    // 获取上一个音符的位置
                    const lastNote = this.notes[this.notes.length - 1];
                    
                    // 定义基础角度（基于音符序号的螺旋形布局）
                    const baseAngle = (this.noteCount * (Math.PI * 0.5)); // 每个音符旋转90度
                    const minDistance = this.circleSize * 3; // 最小距离
                    const maxDistance = this.circleSize * 4; // 最大距离
                    
                    // 尝试多个位置直到找到不重叠的位置
                    let attempts = 0;
                    let found = false;
                    
                    while (!found && attempts < 12) { // 最多尝试12个不同的位置
                        const angleOffset = (Math.PI * 2 * attempts) / 12; // 在圆周上均匀分布
                        const distance = minDistance + (attempts * (maxDistance - minDistance) / 12);
                        const angle = baseAngle + angleOffset;
                        
                        x = lastNote.x + Math.cos(angle) * distance;
                        y = lastNote.y + Math.sin(angle) * distance;
                    
                        // 确保位置在安全区域内
                        const safeX = Math.max(this.safeArea.x + this.circleSize, 
                            Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, x));
                        const safeY = Math.max(this.safeArea.y + this.circleSize, 
                            Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, y));
                            
                        // 检查新位置是否可用
                        if (!checkOverlap(safeX, safeY)) {
                            x = safeX;
                            y = safeY;
                            found = true;
                            break;
                        }
                        attempts++;
                    }
                    
                    // 如果没有找到合适的位置，尝试在更大的范围内寻找
                    if (!found) {
                        const emergencyDistance = this.circleSize * (4 + this.noteCount); // 随着音符数量增加距离
                        const emergencyAngle = Math.random() * Math.PI * 2;
                        x = this.canvas.width / 2 + Math.cos(emergencyAngle) * emergencyDistance;
                        y = this.canvas.height / 2 + Math.sin(emergencyAngle) * emergencyDistance;
                        
                        // 确保在安全区域内
                        x = Math.max(this.safeArea.x + this.circleSize, 
                            Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, x));
                        y = Math.max(this.safeArea.y + this.circleSize, 
                            Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, y));
                    }
                }
                
                // 生成音符
                const normalizedEnergy = Math.min(1, energy / 255);
                
                const note = {
                    x: x,
                    y: y,
                    createTime: currentTime,
                    hitTime: currentTime + this.approachRate / 1000,
                    hit: false,
                    score: null,
                    approachProgress: 0,
                    energy: normalizedEnergy,
                    beatNumber: this.beatCount,
                    noteNumber: this.noteCount + 1  // 从1开始计数
                };
                this.noteCount++; // 增加音符计数
                
                this.notes.push(note);
                this.lastNoteTime = currentTime;
            }
        }
    }
    detectVocalAndBeat = (audioData) => {
        // 确保有音频数据
        if (!audioData || !audioData.length) {
            return { beat: false, vocal: false, energy: 0 };
        }

        // 1. 检测人声
        let vocalEnergy = 0;
        const sampleRate = this.audioContext.sampleRate || 44100;
        const vocalMinBin = Math.floor(this.vocalFreqRange.min * this.analyser.fftSize / sampleRate);
        const vocalMaxBin = Math.floor(this.vocalFreqRange.max * this.analyser.fftSize / sampleRate);
        
        // 确保索引在有效范围内
        const minBin = Math.max(0, Math.min(vocalMinBin, audioData.length - 1));
        const maxBin = Math.max(0, Math.min(vocalMaxBin, audioData.length - 1));
        
        // 计算人声频率范围内的能量
        for (let i = minBin; i <= maxBin; i++) {
            vocalEnergy += audioData[i];
        }
        vocalEnergy /= (maxBin - minBin + 1);
        
        // 使用平滑系数更新人声能量历史
        this.vocalEnergyHistory.push(vocalEnergy);
        if (this.vocalEnergyHistory.length > 30) {
            this.vocalEnergyHistory.shift();
        }
        
        // 计算人声能量的动态阈值
        const avgVocalEnergy = this.vocalEnergyHistory.reduce((a, b) => a + b) / this.vocalEnergyHistory.length;
        const vocalDetected = vocalEnergy > avgVocalEnergy * this.vocalThreshold;
        
        // 2. 检测节拍
        let beatEnergy = 0;
        for (let i = 0; i < 32; i++) {
            beatEnergy += audioData[i];
        }
        beatEnergy /= 32;
        
        this.energyHistory.push(beatEnergy);
        if (this.energyHistory.length > 30) {
            this.energyHistory.shift();
        }
        
        if (this.energyHistory.length >= 30) {
            const avgBeatEnergy = this.energyHistory.reduce((a, b) => a + b) / this.energyHistory.length;
            this.energyThreshold = avgBeatEnergy * this.beatThreshold;
            
            const currentTime = this.audioContext.currentTime - this.startTime;
            if (beatEnergy > this.energyThreshold && currentTime - this.lastNoteTime >= this.minBeatInterval) {
                this.beatDetected = true;
                return { beat: true, vocal: vocalDetected, energy: Math.max(beatEnergy, vocalEnergy) };
            }
        }
        
        this.beatDetected = false;
        return { beat: false, vocal: vocalDetected, energy: Math.max(beatEnergy, vocalEnergy) };
    }

    updateNotes = () => {
        const currentTime = this.audioContext.currentTime - this.startTime;
        
        this.notes = this.notes.filter(note => {
            // 如果音符已经显示过评分并消失，则移除
            if (note.hit && !note.score) return false;
            
            // 如果音符超过判定时间太久还没有被点击，标记为 miss
            if (!note.hit && currentTime > note.hitTime + this.goodRange / 1000) {
                note.hit = true;
                note.score = 'miss';
                this.combo = 0;
                return true;
            }
            
            return true;
        });
    }

    drawNotes = () => {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Debug模式：显示安全区域和调试信息
        if (this.debugMode) {
            // 绘制安全区域边界
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.strokeRect(
                this.safeArea.x,
                this.safeArea.y,
                this.safeArea.width,
                this.safeArea.height
            );
            
            // 显示调试信息
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`Beat Count: ${this.beatCount}`, 10, 20);
            this.ctx.fillText(`Notes Count: ${this.notes.length}`, 10, 40);
            this.ctx.fillText(`Next Note at Beat: ${Math.ceil(this.beatCount / 4) * 4}`, 10, 60);
        }

        // 绘制音符和光圈
        this.notes.forEach(note => {
            if (note.hit && !note.score) return;

            const currentTime = this.audioContext.currentTime - this.startTime;
            const timeUntilHit = note.hitTime - currentTime;
            note.approachProgress = Math.max(0, Math.min(1, 1 - timeUntilHit / (this.approachRate / 1000)));

            // 绘制收缩光圈
            if (!note.hit) {
                const approachSize = Math.max(
                    this.circleSize,
                    this.approachCircleSize * (1 - note.approachProgress) + this.circleSize
                );
                if (approachSize > this.circleSize) {
                    this.ctx.beginPath();
                    this.ctx.arc(note.x, note.y, approachSize, 0, Math.PI * 2);
                    this.ctx.strokeStyle = this.colors.approach;
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
            }



            // 绘制起点圆圈
            this.ctx.beginPath();
            this.ctx.arc(note.x, note.y, this.circleSize, 0, Math.PI * 2);
            this.ctx.fillStyle = note.score ? this.colors[note.score] : 
                               (note.held ? this.colors.perfect : this.colors.circle);
            this.ctx.fill();
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // 在圆圈中显示序号，并在相邻数字之间画线
            if (!note.hit) {
                // 如果有前一个音符且是连续的数字，画一条连线
                if (note.noteNumber > 1) {
                    const prevNote = this.notes.find(n => !n.hit && n.noteNumber === note.noteNumber - 1);
                    if (prevNote) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(prevNote.x, prevNote.y);
                        this.ctx.lineTo(note.x, note.y);
                        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                        this.ctx.lineWidth = 1;
                        this.ctx.stroke();
                    }
                }

                // 显示序号
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '24px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(note.noteNumber.toString(), note.x, note.y);
            }

            // 如果有评分，显示评分文本
            if (note.score) {
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '20px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(note.score.toUpperCase(), note.x, note.y - 40);
                
                // 评分显示一段时间后移除音符
                if (currentTime - note.hitTime > 0.5) {
                    note.hit = true;
                    note.score = null;
                }
            }
        });

        // 绘制连击数和分数
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        
        if (this.combo > 1) {
            this.ctx.fillText(`${this.combo}x Combo!`, this.canvas.width / 2, 50);
        }
        
        this.ctx.fillText(`分数: ${Math.floor(this.score)}`, this.canvas.width / 2, 90);
    }
    handleInput = (x, y, type) => {
        if (!this.isPlaying || type !== 'start') return;

        const currentTime = this.audioContext.currentTime - this.startTime;
        
        this.notes.forEach(note => {
            if (note.hit) return;

            // 计算点击位置与音符的距离
            const distance = Math.sqrt((x - note.x) ** 2 + (y - note.y) ** 2);
            
            // 只有在圆圈范围内的点击才判定
            if (distance <= this.circleSize) {
                const timingDiff = Math.abs(currentTime - note.hitTime) * 1000; // 转换为毫秒
                
                // 判定点击时机
                if (timingDiff <= this.perfectRange) {
                    note.score = 'perfect';
                    this.score += 1000 * (1 + this.combo * 0.1);
                    this.combo++;
                    note.hit = true;
                    this.createHitEffect(note.x, note.y, note.score);
                } else if (timingDiff <= this.goodRange) {
                    note.score = 'good';
                    this.score += 500 * (1 + this.combo * 0.1);
                    this.combo++;
                    note.hit = true;
                    this.createHitEffect(note.x, note.y, note.score);
                } else {
                    note.score = 'miss';
                    this.combo = 0;
                    note.hit = true;
                }
                
                document.getElementById('score').textContent = Math.floor(this.score);
            }
        });
    }

    hitNote = (note) => {
        note.hit = true;
        this.combo++;
        this.score += 100 * (1 + this.combo * 0.1);
        document.getElementById('score').textContent = Math.floor(this.score);

        // 创建打击效果
        this.createHitEffect(note.x, note.y);
    }

    createHitEffect = (x, y) => {
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
