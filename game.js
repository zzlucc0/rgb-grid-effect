class RhythmGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Set canvas dimensions first
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
        
        // Spectrum analysis configuration
        this.analyser.fftSize = 2048;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        
        // Vocal frequency range (Hz)
        this.vocalFreqRange = {
            min: 80,  // Low pitch
            max: 1100 // High pitch
        };
        
        // Vocal detection configuration
        this.vocalEnergyHistory = [];
        this.vocalThreshold = 0.8; // Vocal detection threshold
        this.vocalEnergySmoothing = 0.8; // Smoothing coefficient
        this.debugMode = true; // Add debug mode
        
        // Visual effects
        this.visualEffects = {
            vocalDetected: false,
            pulseSize: 0,
            pulseOpacity: 0
        };
        
        // Rhythm analysis configuration
        this.energyHistory = [];
        this.beatThreshold = 0.85; // Beat detection threshold
        this.minBeatInterval = 0.45; // Minimum beat interval (seconds), increase to slow down button generation
        this.currentPattern = 0; // Current note generation pattern
        this.currentPatternIndex = 0; // Current active area index
        this.energyThreshold = 0; // Dynamic energy threshold
        this.beatDetected = false; // Whether a beat is detected
        this.vocalActive = false; // Whether vocals are detected
        this.vocalActiveTime = 0; // Duration of vocal activity
        this.vocalInactiveTime = 0; // Duration of vocal inactivity
        this.vocalDetectionThreshold = 0.65; // Higher vocal detection threshold to reduce button generation
        
        // Song pre-analysis data
        this.analyzedSections = []; // Store pre-analyzed song sections
        this.vocalSections = []; // Store detected vocal segments
        
        // Note generation configuration
        const margin = 80; // Reduced margin to use more screen space
        this.safeArea = {
            x: margin,
            y: margin,
            width: this.canvas.width - margin * 2,
            height: this.canvas.height - margin * 2
        };
        
        // Define multiple areas to spread button generation positions
        this.buttonAreas = [
            { // Top-left
                x: margin + this.circleSize * 2,
                y: margin + this.circleSize * 2,
                width: this.canvas.width / 3 - this.circleSize * 4,
                height: this.canvas.height / 3 - this.circleSize * 4
            },
            { // Top-right
                x: this.canvas.width / 2 + this.circleSize * 2,
                y: margin + this.circleSize * 2,
                width: this.canvas.width / 3 - this.circleSize * 4,
                height: this.canvas.height / 3 - this.circleSize * 4
            },
            { // Bottom-left
                x: margin + this.circleSize * 2,
                y: this.canvas.height / 2 + this.circleSize * 2,
                width: this.canvas.width / 3 - this.circleSize * 4,
                height: this.canvas.height / 3 - this.circleSize * 4
            },
            { // Bottom-right
                x: this.canvas.width / 2 + this.circleSize * 2,
                y: this.canvas.height / 2 + this.circleSize * 2,
                width: this.canvas.width / 3 - this.circleSize * 4,
                height: this.canvas.height / 3 - this.circleSize * 4
            },
            { // Center
                x: this.canvas.width / 3,
                y: this.canvas.height / 3,
                width: this.canvas.width / 3,
                height: this.canvas.height / 3
            }
        ];
        
        // Beat counter
        this.beatCount = 0;
        
        // Note count and grouping configuration
        this.noteCount = 0;
        this.groupPauseTime = 2000; // Group pause time (milliseconds), increased to 2 seconds
        this.lastGroupEndTime = 0; // Last group end time
        this.isGroupPaused = false; // Whether in group pause
        this.notesPerGroup = 5; // Minimum number of notes per group
        this.maxNotesPerGroup = 10; // Maximum number of notes per group
        this.currentGroupSize = 5; // Current group size, dynamically adjusted based on rhythm
        
        // Game configuration
        this.approachRate = 1250; // Approach circle shrink time (milliseconds), a bit slower (added 500ms)
        this.circleSize = 60; // Target circle size
        this.approachCircleSize = 180; // Initial approach circle size
        this.perfectRange = 400; // Perfect judgment range (milliseconds)
        this.goodRange = 600; // Good judgment range (milliseconds)
        this.colors = {
            approach: 'rgba(255, 255, 255, 0.3)',
            circle: '#ff6b6b',
            perfect: '#4ecdc4',
            good: '#ffe66d',
            miss: '#ff6b6b',
            track: 'rgba(255, 255, 255, 0.3)',
            progress: 'rgba(78, 205, 196, 0.8)',
            glow: 'rgba(255, 255, 255, 0.3)'
        };
        this.debugMode = false; // Disable debug mode
        
        // Drag note configuration
        this.dragNoteFrequency = 0.25; // Probability of drag note appearance reduced to 25%
        this.currentDragNote = null; // Currently dragged button
        this.dragNoteMinDistance = this.circleSize * 4; // Minimum distance for drag notes
        this.dragNoteMaxDistance = this.circleSize * 6; // Maximum distance for drag notes
        
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

        // Music search functionality
        searchButton.addEventListener('click', () => {
            console.log('Search button clicked');
            searchResults.innerHTML = 'Searching...';
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
                                searchResults.innerHTML = 'Loading...';
                                const songUrl = defaultSongs[songName];
                                const response = await fetch(songUrl);
                                if (!response.ok) throw new Error('Failed to load audio file');
                                const arrayBuffer = await response.arrayBuffer();
                                this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                                startButton.disabled = false;
                                searchResults.innerHTML = `Loaded: ${songName}`;
                            } catch (error) {
                                console.error('Error loading song:', error);
                                searchResults.innerHTML = 'Failed to load song, please try again';
                                startButton.disabled = true;
                            }
                        });
                        searchResults.appendChild(resultDiv);
                    });
                } else {
                    searchResults.innerHTML = 'No matching songs found. Available songs: ' + 
                        Object.keys(defaultSongs).join(', ');
                }
            }
        });

        // Keyboard search functionality
        songSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchButton.click();
            }
        });

        // File upload functionality
        audioUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    startButton.disabled = false;
                    searchResults.innerHTML = `File selected: ${file.name}`;
                } catch (error) {
                    console.error('Error loading audio file:', error);
                    searchResults.innerHTML = 'Failed to load audio file, please try another file';
                    startButton.disabled = true;
                }
            }
        });

        // Start game button
        startButton.addEventListener('click', () => {
            console.log('Start button clicked', this.audioBuffer);
            if (this.audioBuffer) {
                uploadContainer.classList.add('hidden');
                this.startGame();
            } else {
                searchResults.innerHTML = 'Please select or upload a song first';
            }
        });

        // Add game control events
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
        this.score = 0;
        this.combo = 0;
        this.notes = [];
        this.beatCount = 0; // Reset beat count
        this.noteCount = 0; // Reset note count
        this.isGroupPaused = false; // Reset pause state
        this.currentGroupSize = this.notesPerGroup; // Initialize to minimum value
        this.recentBeatStrengths = []; // Used to store recent beat strengths
        this.analyzedSections = []; // Store pre-analyzed song sections
        
        // Create offline audio context to pre-analyze the song
        await this.preAnalyzeSong();
        
        // Display countdown while showing analysis results
        await this.showCountdown(3); // 3-second countdown
        
        // Start the game after countdown ends
        this.isPlaying = true;
        this.startTime = this.audioContext.currentTime;

        // Create audio source and connect analyzer
        const source = this.audioContext.createBufferSource();
        source.buffer = this.audioBuffer;
        source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        
        // Set analyzer parameters
        this.analyser.fftSize = 2048;
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // Start playing audio
        source.start();
        
        // Start game loop
        this.gameLoop(dataArray);
    }
    
    // Pre-analyze the song, identify vocal parts and plan button generation
    async preAnalyzeSong() {
        return new Promise(resolve => {
            // Show analyzing prompt
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '36px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Analyzing song...', this.canvas.width / 2, this.canvas.height / 2 - 40);
            
            // Create offline audio context for analysis
            const offlineCtx = new OfflineAudioContext({
                numberOfChannels: 2,
                length: 44100 * this.audioBuffer.duration,
                sampleRate: 44100,
            });
            
            // Create audio source
            const source = offlineCtx.createBufferSource();
            source.buffer = this.audioBuffer;
            
            // Create analyzer
            const analyser = offlineCtx.createAnalyser();
            analyser.fftSize = 2048;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            source.connect(analyser);
            analyser.connect(offlineCtx.destination);
            
            // Define analysis interval (seconds)
            const interval = 0.1; // Analyze every 0.1 second
            const duration = this.audioBuffer.duration;
            const sections = [];
            
            // Preparation before starting analysis
            source.start();
            
            // Set callback for analysis at each time point
            for (let time = 0; time < duration; time += interval) {
                const analyzeTime = time;
                offlineCtx.suspend(analyzeTime).then(() => {
                    // Get frequency data
                    analyser.getByteFrequencyData(dataArray);
                    
                    // Calculate vocal energy
                    let vocalEnergy = 0;
                    const sampleRate = offlineCtx.sampleRate;
                    const vocalMinBin = Math.floor(this.vocalFreqRange.min * analyser.fftSize / sampleRate);
                    const vocalMaxBin = Math.floor(this.vocalFreqRange.max * analyser.fftSize / sampleRate);
                    
                    // Ensure index is within valid range
                    const minBin = Math.max(0, Math.min(vocalMinBin, dataArray.length - 1));
                    const maxBin = Math.max(0, Math.min(vocalMaxBin, dataArray.length - 1));
                    
                    // Calculate energy in the vocal frequency range
                    for (let i = minBin; i <= maxBin; i++) {
                        vocalEnergy += dataArray[i];
                    }
                    vocalEnergy /= (maxBin - minBin + 1);
                    
                    // Calculate low frequency energy for beat detection
                    let beatEnergy = 0;
                    for (let i = 0; i < 32; i++) {
                        beatEnergy += dataArray[i];
                    }
                    beatEnergy /= 32;
                    
                    // Store analysis results
                    sections.push({
                        time: analyzeTime,
                        vocalEnergy: vocalEnergy,
                        beatEnergy: beatEnergy,
                        hasVocal: vocalEnergy > 100, // Simple threshold detection
                        hasBeat: beatEnergy > 100    // Simple threshold detection
                    });
                    
                    // Continue analysis
                    offlineCtx.resume();
                });
            }
            
            // Processing after rendering is complete
            offlineCtx.startRendering().then(() => {
                // Sort by time
                sections.sort((a, b) => a.time - b.time);
                
                // Save analysis results
                this.analyzedSections = sections;
                
                // Process analysis results, identify vocal sections and beats
                this.processAnalyzedData();
                
                console.log('Song analysis complete, vocal sections:', this.vocalSections.length);
                resolve();
            });
        });
    }
    
    // Process pre-analyzed data
    processAnalyzedData() {
        // Simplified: Find consecutive vocal segments
        const sections = this.analyzedSections;
        const vocalSections = [];
        let currentSection = null;
        
        // Find consecutive vocal segments
        for (let i = 0; i < sections.length; i++) {
            if (sections[i].hasVocal) {
                if (!currentSection) {
                    currentSection = {
                        start: sections[i].time,
                        end: sections[i].time,
                        avgEnergy: sections[i].vocalEnergy
                    };
                } else {
                    currentSection.end = sections[i].time;
                    currentSection.avgEnergy = (currentSection.avgEnergy + sections[i].vocalEnergy) / 2;
                }
            } else if (currentSection) {
                // If no vocals detected for 0.3 seconds continuously, consider the current vocal segment ended
                if (sections[i].time - sections[i].time >= 0.3) {
                    vocalSections.push(currentSection);
                    currentSection = null;
                }
            }
        }
        
        // Don't forget the last segment
        if (currentSection) {
            vocalSections.push(currentSection);
        }
        
        // Pre-plan button quantities for each vocal segment (based on energy and duration)
        vocalSections.forEach(section => {
            const duration = section.end - section.start;
            const normalizedEnergy = Math.min(1, section.avgEnergy / 200);
            
            // Plan button quantities per group based on beat and vocal energy
            const baseCount = this.notesPerGroup;
            const extraCount = Math.round(normalizedEnergy * (this.maxNotesPerGroup - this.notesPerGroup));
            section.plannedButtonCount = Math.max(baseCount, Math.min(this.maxNotesPerGroup, baseCount + extraCount));
            
            // Estimated number of button groups (groups spaced about 0.5-1 seconds apart)
            section.estimatedGroups = Math.ceil(duration / 1.5);
            
            // Estimated total button count
            section.totalButtons = section.plannedButtonCount * section.estimatedGroups;
        });
        
        this.vocalSections = vocalSections;
    }
    
    // Show countdown
    async showCountdown(seconds) {
        return new Promise(resolve => {
            let remaining = seconds;
            
            // Get basic song information for display
            const totalVocalSections = this.vocalSections ? this.vocalSections.length : 'Analyzing';
            const avgButtonsPerGroup = this.vocalSections && this.vocalSections.length > 0 ? 
                Math.round(this.vocalSections.reduce((sum, s) => sum + s.plannedButtonCount, 0) / this.vocalSections.length) : 
                'Analyzing';
            
            const countdownInterval = setInterval(() => {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                
                // Draw countdown number
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '120px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(remaining, this.canvas.width / 2, this.canvas.height / 2);
                
                // Show analysis results
                this.ctx.font = '24px Arial';
                this.ctx.fillText(`Analyzed: ${totalVocalSections} vocal sections`, this.canvas.width / 2, this.canvas.height / 2 + 80);
                this.ctx.fillText(`Average buttons per group: ${avgButtonsPerGroup}`, this.canvas.width / 2, this.canvas.height / 2 + 120);
                this.ctx.fillText(`Getting ready to start...`, this.canvas.width / 2, this.canvas.height / 2 + 160);
                
                remaining--;
                
                if (remaining < 0) {
                    clearInterval(countdownInterval);
                    resolve();
                }
            }, 1000);
        });
    }

    updateVisualEffects() {
        // Update visual effects for vocal detection
        if (this.vocalActive && !this.visualEffects.vocalDetected) {
            this.visualEffects.vocalDetected = true;
            this.visualEffects.pulseSize = 0;
            this.visualEffects.pulseOpacity = 1;
        } else if (!this.vocalActive && this.visualEffects.vocalDetected) {
            this.visualEffects.vocalDetected = false;
        }
        
        // Remove central pulse effect, only show vocal detection status in the upper right corner
    }

    gameLoop(dataArray) {
        if (!this.isPlaying) return;

        // Get audio data
        this.analyser.getByteFrequencyData(dataArray);

        // Generate notes based on audio data
        this.generateNotes(dataArray);

        // Update and draw notes
        this.updateNotes();
        this.drawNotes();
        
        // Update visual effects
        this.updateVisualEffects();

        // Continue loop
        requestAnimationFrame(() => this.gameLoop(dataArray));
    }

    generateNotes(audioData) {
        const currentTime = this.audioContext.currentTime - this.startTime;
        
        // Detect vocals and beats
        const { beat, vocal, energy } = this.detectVocalAndBeat(audioData);
        
            // Update vocal activity status, using smooth transition
        if (vocal) {
            this.vocalActiveTime += 1/30; // Adapt to potentially unstable frame rates
            this.vocalInactiveTime = Math.max(0, this.vocalInactiveTime - 1/15); // Quickly reduce inactive time
            
            // If vocals are continuously detected for over 0.5 seconds, mark as active (increases stability)
            if (this.vocalActiveTime > 0.5 && !this.vocalActive) {
                this.vocalActive = true;
                console.log('Vocals active');
                // If in pause state and the pause time has already exceeded the minimum time, end pause early
                if (this.isGroupPaused && currentTime - this.lastGroupEndTime >= this.groupPauseTime / 2000) {
                    this.isGroupPaused = false;
                    this.noteCount = 0;
                    this.lastNoteTime = currentTime;
                    this.beatCount = 0;
                }
            }
        } else {
            this.vocalInactiveTime += 1/30;
            this.vocalActiveTime = Math.max(0, this.vocalActiveTime - 1/60); // Slowly reduce active time
            
            // If vocals stop being detected for over 1.2 seconds, mark as inactive (increases stability)
            if (this.vocalInactiveTime > 1.2 && this.vocalActive) {
                this.vocalActive = false;
                console.log('Vocals stopped');
                
                // If current group has notes and is not in pause state, mark as group end
                if (this.noteCount > 0 && !this.isGroupPaused) {
                    this.isGroupPaused = true;
                    this.lastGroupEndTime = currentTime;
                    
                    // Show group completion message after vocals end
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                    this.ctx.font = '36px Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText('Group Complete!', this.canvas.width / 2, this.canvas.height / 2 - 40);
                }
            }
        }        // Check if pause state needs to end
        if (this.isGroupPaused) {
            const remainingPauseTime = Math.ceil(this.groupPauseTime / 1000 - (currentTime - this.lastGroupEndTime));
            
            // Show countdown
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '36px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Preparing next group... ' + remainingPauseTime.toString(), this.canvas.width / 2, this.canvas.height / 2 + 40);
            
            if (currentTime - this.lastGroupEndTime >= this.groupPauseTime / 1000) {
                this.isGroupPaused = false;
                this.noteCount = 0; // Reset counter, start a new group
                this.currentGroupStartTime = currentTime; // Record new group start time
                this.lastNoteTime = currentTime; // Reset time of last note
                this.beatCount = 0; // Reset beat count
                
                // Display estimated note count for the next group
                console.log(`Next group will have ${this.currentGroupSize} notes`);
            }
            return; // Return directly when in pause state
        }
        
        // Generate notes when vocals are active, beat is detected, and not in pause state
        // Remove random generation cases, only generate notes when strong beats are detected
        const shouldGenerateNote = 
            (this.vocalActive && beat && currentTime - this.lastNoteTime >= this.minBeatInterval && !this.isGroupPaused);
            
        if (shouldGenerateNote) {
            this.beatCount++;
            
            // Generate one note every 4 beats (reduce density)
            if (this.beatCount % 4 === 0) { // Remove probability of randomly generating extra notes
                // Check if pause is needed (number of notes in group reaches dynamically calculated limit)
                if (this.noteCount >= this.currentGroupSize) {
                    this.isGroupPaused = true;
                    this.lastGroupEndTime = currentTime;
                    
                    // Show group interval prompt, including current group size information
                    this.ctx.fillStyle = '#fff';
                    this.ctx.font = '36px Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText(`Group Complete (${this.currentGroupSize} notes)`, this.canvas.width / 2, this.canvas.height / 2 - 40);
                    this.ctx.fillText('Preparing next group...', this.canvas.width / 2, this.canvas.height / 2);
                    
                    // Recalculate number of notes for next group
                    const nextGroupSizeChange = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
                    this.currentGroupSize = Math.max(
                        this.notesPerGroup, 
                        Math.min(this.maxNotesPerGroup, this.currentGroupSize + nextGroupSizeChange)
                    );
                    
                    return;
                }

                // Calculate position for new note
                let x, y;
                
                // Check for overlap with other notes or drag tracks
                const checkOverlap = (x, y) => {
                    const minSafeDistance = this.circleSize * 4; // 增加最小安全距离，避免按钮重叠
                    
                    // 检查与其他按钮的重叠
                    for (const note of this.notes) {
                        if (note.hit) continue; // 忽略已经击中的音符
                        
                        // 检查与按钮本身的距离
                        const dx = note.x - x;
                        const dy = note.y - y;
                        if (Math.sqrt(dx * dx + dy * dy) < minSafeDistance) {
                            return true; // 重叠
                        }
                        
                        // 检查与拖拽轨道的距离
                        if (note.isDrag && !note.completed) {
                            // 计算新位置到拖拽轨道的最小距离
                            const minDistToDragPath = this.distanceToQuadraticCurve(
                                x, y, 
                                note.x, note.y, 
                                note.controlX, note.controlY,
                                note.endX, note.endY
                            );
                            
                            // 如果距离小于安全距离，则认为重叠
                            if (minDistToDragPath < minSafeDistance) {
                                return true; // 重叠
                            }
                        }
                    }
                    
                    return false; // 不重叠
                };

                // 使用网格系统来更好地分布按钮
                // 将屏幕分成 5x5 的网格
                const gridCols = 5;
                const gridRows = 5;
                const gridCellWidth = this.safeArea.width / gridCols;
                const gridCellHeight = this.safeArea.height / gridRows;
                
                // 创建网格单元格
                const grid = [];
                for (let row = 0; row < gridRows; row++) {
                    for (let col = 0; col < gridCols; col++) {
                        grid.push({
                            col: col,
                            row: row,
                            x: this.safeArea.x + (col + 0.5) * gridCellWidth,
                            y: this.safeArea.y + (row + 0.5) * gridCellHeight,
                            used: false // 标记是否在当前组中使用过
                        });
                    }
                }
                
                // 查找上一个音符所在的网格单元格
                let lastGridCell = null;
                if (this.noteCount > 0) {
                    const lastNote = this.notes[this.notes.length - 1];
                    const lastCol = Math.floor((lastNote.x - this.safeArea.x) / gridCellWidth);
                    const lastRow = Math.floor((lastNote.y - this.safeArea.y) / gridCellHeight);
                    
                    // 找到对应的网格单元格
                    for (let i = 0; i < grid.length; i++) {
                        if (grid[i].col === lastCol && grid[i].row === lastRow) {
                            lastGridCell = grid[i];
                            grid[i].used = true; // 标记为已使用
                            break;
                        }
                    }
                }
                
                // 选择下一个网格单元格
                let selectedCell;
                
                if (this.noteCount === 0) {
                    // 第一个音符从中心开始
                    const centerIndex = Math.floor(grid.length / 2);
                    selectedCell = grid[centerIndex];
                } else {
                    // 为后续音符选择相邻但没有被当前组使用过的单元格
                    const adjacentCells = [];
                    const nearCells = [];
                    const otherCells = [];
                    
                    grid.forEach(cell => {
                        if (!cell.used) {
                            // 计算与上一个单元格的网格距离
                            const colDist = Math.abs(cell.col - lastGridCell.col);
                            const rowDist = Math.abs(cell.row - lastGridCell.row);
                            const maxDist = Math.max(colDist, rowDist);
                            
                            if (maxDist === 1) {
                                // 相邻单元格（上、下、左、右、对角线）
                                adjacentCells.push(cell);
                            } else if (maxDist === 2) {
                                // 稍远一点的单元格
                                nearCells.push(cell);
                            } else {
                                // 其他单元格
                                otherCells.push(cell);
                            }
                        }
                    });
                    
                    // 优先选择相邻单元格，其次是稍远的，最后是随机单元格
                    if (adjacentCells.length > 0) {
                        selectedCell = adjacentCells[Math.floor(Math.random() * adjacentCells.length)];
                    } else if (nearCells.length > 0) {
                        selectedCell = nearCells[Math.floor(Math.random() * nearCells.length)];
                    } else if (otherCells.length > 0) {
                        selectedCell = otherCells[Math.floor(Math.random() * otherCells.length)];
                    } else {
                        // 如果所有单元格都已使用，重置使用状态并选择一个不同于上一个的单元格
                        grid.forEach(cell => cell.used = false);
                        const availableCells = grid.filter(cell => 
                            cell.col !== lastGridCell.col || cell.row !== lastGridCell.row);
                        selectedCell = availableCells[Math.floor(Math.random() * availableCells.length)];
                    }
                }
                
                // 标记选定的单元格为已使用
                selectedCell.used = true;
                
                // 在选定的单元格内寻找不重叠的位置
                let attempts = 0;
                let found = false;
                const maxAttempts = 30; // 增加尝试次数
                
                // 在选定单元格附近随机生成位置
                while (!found && attempts < maxAttempts) {
                    // 在单元格周围的范围内随机生成位置
                    const offsetRange = Math.min(gridCellWidth, gridCellHeight) * 0.4;
                    x = selectedCell.x + (Math.random() - 0.5) * offsetRange;
                    y = selectedCell.y + (Math.random() - 0.5) * offsetRange;
                    
                    // 确保位置在安全区域内
                    x = Math.max(this.safeArea.x + this.circleSize, 
                        Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, x));
                    y = Math.max(this.safeArea.y + this.circleSize, 
                        Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, y));
                    
                    // 检查新位置是否与现有音符重叠
                    if (!checkOverlap(x, y)) {
                        found = true;
                        break;
                    }
                    attempts++;
                }
                
                // 如果还是没找到合适位置，尝试在整个安全区域内生成
                if (!found) {
                    for (let i = 0; i < 20; i++) {
                        x = this.safeArea.x + Math.random() * this.safeArea.width;
                        y = this.safeArea.y + Math.random() * this.safeArea.height;
                        
                        // 确保在安全区域内且与边界有一定距离
                        x = Math.max(this.safeArea.x + this.circleSize, 
                            Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, x));
                        y = Math.max(this.safeArea.y + this.circleSize, 
                            Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, y));
                            
                        if (!checkOverlap(x, y)) {
                            found = true;
                            break;
                        }
                    }
                }
                
                // 如果在选定区域内没有找到合适位置，使用改进的螺旋搜索算法
                if (!found) {
                    console.log('No suitable position found in the selected area, using spiral search');
                    
                    // 螺旋搜索算法 - 增加尝试次数和搜索精度
                    const spiralAttempts = 100; // 增加尝试次数
                    const spiralStep = this.circleSize * 0.5; // 减小步长以获得更精细的搜索
                    let spiralAngle = Math.random() * Math.PI * 2; // 随机起始角度，避免固定模式
                    let spiralRadius = this.circleSize * 2;
                    
                    // 从多个起点开始搜索，而不仅仅是屏幕中心
                    const startPoints = [
                        { x: this.canvas.width / 2, y: this.canvas.height / 2 }, // 中心
                        { x: this.canvas.width / 4, y: this.canvas.height / 4 }, // 左上
                        { x: this.canvas.width * 3/4, y: this.canvas.height / 4 }, // 右上
                        { x: this.canvas.width / 4, y: this.canvas.height * 3/4 }, // 左下
                        { x: this.canvas.width * 3/4, y: this.canvas.height * 3/4 } // 右下
                    ];
                    
                    // 从每个起点进行螺旋搜索
                    for (const startPoint of startPoints) {
                        if (found) break;
                        
                        const centerX = startPoint.x;
                        const centerY = startPoint.y;
                        spiralAngle = Math.random() * Math.PI * 2; // 每个起点使用随机角度
                        spiralRadius = this.circleSize * 2;
                        
                        for (let i = 0; i < spiralAttempts; i++) {
                            spiralRadius += spiralStep / (2 * Math.PI);
                            spiralAngle += Math.PI / 12; // 更小的角度增量，获得更多点
                            
                            x = centerX + Math.cos(spiralAngle) * spiralRadius;
                            y = centerY + Math.sin(spiralAngle) * spiralRadius;
                            
                            // 确保在安全区域内
                            if (x >= this.safeArea.x + this.circleSize * 1.5 && 
                                x <= this.safeArea.x + this.safeArea.width - this.circleSize * 1.5 && 
                                y >= this.safeArea.y + this.circleSize * 1.5 && 
                                y <= this.safeArea.y + this.safeArea.height - this.circleSize * 1.5) {
                                    
                                // 检查是否与其他音符重叠
                                if (!checkOverlap(x, y)) {
                                    found = true;
                                    break;
                                }
                            }
                        }
                    }
                    
                    // 最后的应急方案：寻找最不重叠的位置
                    if (!found) {
                        console.log('Spiral search failed, finding best possible position');
                        let bestDistance = 0;
                        let bestX = this.canvas.width / 2;
                        let bestY = this.canvas.height / 2;
                        
                        // 在整个屏幕网格化采样，找最佳位置
                        const gridSize = this.circleSize * 2; // 网格大小
                        const cols = Math.floor(this.safeArea.width / gridSize);
                        const rows = Math.floor(this.safeArea.height / gridSize);
                        
                        // 遍历网格点
                        for (let col = 0; col < cols; col++) {
                            for (let row = 0; row < rows; row++) {
                                const testX = this.safeArea.x + (col + 0.5) * gridSize;
                                const testY = this.safeArea.y + (row + 0.5) * gridSize;
                                
                                // 计算此位置到所有活跃音符和拖拽轨道的最小距离
                                let minDistance = Number.MAX_VALUE;
                                
                                for (const note of this.notes) {
                                    if (note.hit || note.completed) continue;
                                    
                                    // 检查与按钮本身的距离
                                    const dx = note.x - testX;
                                    const dy = note.y - testY;
                                    const distance = Math.sqrt(dx*dx + dy*dy);
                                    minDistance = Math.min(minDistance, distance);
                                    
                                    // 检查与拖拽轨道的距离
                                    if (note.isDrag) {
                                        const dragDistance = this.distanceToQuadraticCurve(
                                            testX, testY, 
                                            note.x, note.y, 
                                            note.controlX, note.controlY,
                                            note.endX, note.endY
                                        );
                                        minDistance = Math.min(minDistance, dragDistance);
                                    }
                                }
                                
                                // 更新最佳位置
                                if (minDistance > bestDistance) {
                                    bestDistance = minDistance;
                                    bestX = testX;
                                    bestY = testY;
                                }
                            }
                        }
                        
                        // 添加一些小的随机偏移，避免严格网格对齐
                        const offsetRange = gridSize * 0.3;
                        x = bestX + (Math.random() - 0.5) * offsetRange;
                        y = bestY + (Math.random() - 0.5) * offsetRange;
                        
                        // 确保在安全区域内
                        x = Math.max(this.safeArea.x + this.circleSize * 1.5, 
                            Math.min(this.safeArea.x + this.safeArea.width - this.circleSize * 1.5, x));
                        y = Math.max(this.safeArea.y + this.circleSize * 1.5, 
                            Math.min(this.safeArea.y + this.safeArea.height - this.circleSize * 1.5, y));
                        
                        console.log(`Found optimal position, distance to nearest note: ${bestDistance}px`);
                    }
                }
                
                // 生成音符
                const normalizedEnergy = Math.min(1, energy / 255);
                
                // 决定是否创建拖拽按钮
                const isDragNote = Math.random() < this.dragNoteFrequency && this.noteCount > 0;
                
                // 基础音符属性
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
                    noteNumber: this.noteCount + 1,  // 从1开始计数
                    isDrag: isDragNote,
                    held: false,
                    completed: false,
                    progress: 0
                };
                
                // 如果是拖拽按钮，添加额外属性
                if (isDragNote) {
                    // 计算一个合理的终点位置（小弧线）
                    const distance = this.dragNoteMinDistance + Math.random() * (this.dragNoteMaxDistance - this.dragNoteMinDistance);
                    
                    // 生成更自然的角度（避免与之前的音符重叠）
                    let angle;
                    if (this.notes.length > 0) {
                        // 基于上一个音符的位置生成一个不同的方向
                        const lastNote = this.notes[this.notes.length - 1];
                        const dirToLastNote = Math.atan2(lastNote.y - y, lastNote.x - x);
                        // 避开上一个音符的方向，选择相反或垂直的方向
                        angle = dirToLastNote + Math.PI * (0.5 + Math.random());
                    } else {
                        angle = Math.random() * Math.PI * 2;
                    }
                    
                    // 确保终点在安全区域内
                    let endX = x + Math.cos(angle) * distance;
                    let endY = y + Math.sin(angle) * distance;
                    
                    // 限制在安全区域内
                    endX = Math.max(this.safeArea.x + this.circleSize, 
                        Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, endX));
                    endY = Math.max(this.safeArea.y + this.circleSize, 
                        Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, endY));
                    
                    // 添加到音符对象
                    note.endX = endX;
                    note.endY = endY;
                    
                    // 计算曲线控制点
                    const dx = note.endX - note.x;
                    const dy = note.endY - note.y;
                    const pathDistance = Math.sqrt(dx * dx + dy * dy);
                    // 弧度高度为路径长度的15-25%，产生小弧线
                    const arcHeight = pathDistance * (0.15 + Math.random() * 0.1);
                    const midX = (note.x + note.endX) / 2;
                    const midY = (note.y + note.endY) / 2;
                    const perpX = -dy / pathDistance;
                    const perpY = dx / pathDistance;
                    
                    note.controlX = midX + perpX * arcHeight;
                    note.controlY = midY + perpY * arcHeight;
                }
                
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
        if (this.vocalEnergyHistory.length > 40) { // 增加历史长度以获得更平滑的结果
            this.vocalEnergyHistory.shift();
        }
        
        // 计算人声能量的动态阈值
        const avgVocalEnergy = this.vocalEnergyHistory.reduce((a, b) => a + b) / this.vocalEnergyHistory.length;
        // 使用更敏感的人声检测阈值
        const vocalDetected = vocalEnergy > avgVocalEnergy * this.vocalDetectionThreshold;
        
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
        
        // 存储最近的节拍强度，用于调整每组音符数量
        if (beatEnergy > 0) {
            this.recentBeatStrengths.push(beatEnergy);
            if (this.recentBeatStrengths.length > 20) { // 保留最近20个节拍的强度
                this.recentBeatStrengths.shift();
            }
            
            // 根据最近节拍强度和预分析的数据调整每组音符的数量
            if (this.recentBeatStrengths.length >= 5 && !this.isGroupPaused) {
                // 结合实时节拍强度和预分析结果
                const currentTime = this.audioContext.currentTime - this.startTime;
                let plannedSize = this.notesPerGroup; // 默认值
                
                // 如果有预分析的数据，查找当前时间点对应的计划按钮数量
                if (this.vocalSections && this.vocalSections.length > 0) {
                    // 查找当前时间所在的人声段落
                    const currentSection = this.vocalSections.find(section => 
                        currentTime >= section.start && currentTime <= section.end);
                    
                    if (currentSection) {
                        // 使用预分析的计划按钮数量
                        plannedSize = currentSection.plannedButtonCount;
                    }
                }
                
                // 结合实时节拍强度进行微调
                const avgStrength = this.recentBeatStrengths.reduce((a, b) => a + b) / this.recentBeatStrengths.length;
                const normalizedStrength = Math.min(avgStrength / 255, 1); // 归一化到0-1范围
                
                // 动态调整每组音符数量，以预分析数据为基础，根据实时节拍强度进行微调
                const adjustment = Math.round(normalizedStrength * 3) - 1; // -1到2之间的调整
                this.currentGroupSize = plannedSize + adjustment;
                
                // 确保在指定范围内
                this.currentGroupSize = Math.max(this.notesPerGroup, Math.min(this.maxNotesPerGroup, this.currentGroupSize));
            }
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
            
            // 拖拽按钮的特殊处理
            if (note.isDrag && note.completed) {
                // 已完成的拖拽按钮在显示一段时间后移除
                if (note.score && (currentTime - note.hitTime > 1)) {
                    return false;
                }
                return true;
            }
            
            // 如果音符超过判定时间太久还没有被点击，标记为 miss
            if (!note.hit && !note.held && currentTime > note.hitTime + this.goodRange / 1000) {
                note.hit = true;
                note.score = 'miss';
                this.combo = 0;
                return true;
            }
            
            // 如果拖拽按钮被点击但是很长时间没有完成拖拽，也标记为miss
            if (note.isDrag && note.held && !note.completed && currentTime > note.hitTime + 5) { // 5秒后超时
                note.hit = true;
                note.held = false;
                note.completed = true;
                note.score = 'miss';
                this.combo = 0;
                this.currentDragNote = null;
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
            this.ctx.fillText(`Vocal Active: ${this.vocalActive ? 'Yes' : 'No'}`, 10, 60);
            this.ctx.fillText(`Group Status: ${this.isGroupPaused ? 'Paused' : 'Active'}`, 10, 80);
            this.ctx.fillText(`Notes in Group: ${this.noteCount} / ${this.notesPerGroup}`, 10, 100);
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



            // 如果是拖拽按钮，绘制轨道
            if (note.isDrag) {
                // 绘制弧形轨道
                this.ctx.beginPath();
                this.ctx.lineCap = 'round';
                this.ctx.lineWidth = this.circleSize * 0.8; // 轨道宽度比圆圈小
                this.ctx.strokeStyle = this.colors.track;
                this.ctx.moveTo(note.x, note.y);
                this.ctx.quadraticCurveTo(note.controlX, note.controlY, note.endX, note.endY);
                this.ctx.stroke();
                
                // 如果正在拖拽，绘制进度轨道
                if (note.held) {
                    // 计算当前点在曲线上的位置
                    const t = note.progress;
                    const currentX = Math.pow(1-t, 2) * note.x + 
                                   2 * (1-t) * t * note.controlX + 
                                   Math.pow(t, 2) * note.endX;
                    const currentY = Math.pow(1-t, 2) * note.y + 
                                   2 * (1-t) * t * note.controlY + 
                                   Math.pow(t, 2) * note.endY;
                    
                    // 绘制已完成的轨迹
                    const progressIndex = Math.floor(note.progress * 100);
                    const fullPath = [];
                    
                    for (let i = 0; i <= 100; i++) {
                        const t = i / 100;
                        const ptX = Math.pow(1-t, 2) * note.x + 
                                   2 * (1-t) * t * note.controlX + 
                                   Math.pow(t, 2) * note.endX;
                        const ptY = Math.pow(1-t, 2) * note.y + 
                                   2 * (1-t) * t * note.controlY + 
                                   Math.pow(t, 2) * note.endY;
                        fullPath.push({x: ptX, y: ptY});
                    }
                    
                    // 绘制截至当前进度的部分路径
                    this.ctx.beginPath();
                    this.ctx.moveTo(note.x, note.y);
                    this.ctx.lineCap = 'round';
                    this.ctx.lineWidth = this.circleSize * 0.8;
                    this.ctx.strokeStyle = this.colors.progress;
                    
                    for (let i = 1; i <= progressIndex; i++) {
                        this.ctx.lineTo(fullPath[i].x, fullPath[i].y);
                    }
                    
                    this.ctx.stroke();
                    
                    // 绘制拖动点
                    this.ctx.beginPath();
                    this.ctx.arc(currentX, currentY, this.circleSize * 0.9, 0, Math.PI * 2);
                    this.ctx.fillStyle = this.colors.progress;
                    this.ctx.fill();
                    
                    // 发光效果
                    const pulseSize = this.circleSize * (1.2 + Math.sin(Date.now() / 200) * 0.1);
                    this.ctx.beginPath();
                    this.ctx.arc(currentX, currentY, pulseSize, 0, Math.PI * 2);
                    this.ctx.strokeStyle = this.colors.glow;
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
                
                // 绘制终点圆圈
                this.ctx.beginPath();
                this.ctx.arc(note.endX, note.endY, this.circleSize * 0.8, 0, Math.PI * 2);
                this.ctx.fillStyle = note.completed ? this.colors.perfect : 'rgba(255, 255, 255, 0.2)';
                this.ctx.fill();
                this.ctx.strokeStyle = '#fff';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
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
                if (note.noteNumber > 1 && !note.isDrag) {
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
        
        this.ctx.fillText(`Score: ${Math.floor(this.score)}`, this.canvas.width / 2, 90);
        
        // 人声活跃状态的指示器已隐藏，但保留人声检测的逻辑功能
    }
    handleInput = (x, y, type) => {
        if (!this.isPlaying) return;

        const currentTime = this.audioContext.currentTime - this.startTime;
        
        // 如果有正在拖拽的音符
        if (this.currentDragNote) {
            const note = this.currentDragNote;
            
            if (note.held) {
                if (type === 'move') {
                    // 生成曲线上的点
                    const curvePoints = [];
                    const steps = 100;
                    
                    for (let i = 0; i <= steps; i++) {
                        const t = i / steps;
                        const ptX = Math.pow(1-t, 2) * note.x + 
                                  2 * (1-t) * t * note.controlX + 
                                  Math.pow(t, 2) * note.endX;
                        const ptY = Math.pow(1-t, 2) * note.y + 
                                  2 * (1-t) * t * note.controlY + 
                                  Math.pow(t, 2) * note.endY;
                        curvePoints.push({x: ptX, y: ptY, t: t});
                    }
                    
                    // 找到最近的点
                    let minDist = Infinity;
                    let closestPoint = null;
                    
                    curvePoints.forEach(point => {
                        const dist = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
                        if (dist < minDist) {
                            minDist = dist;
                            closestPoint = point;
                        }
                    });
                    
                    // 更新进度
                    if (closestPoint) {
                        note.progress = closestPoint.t;
                    } else {
                        // 退回到线性计算作为备选
                        const dx = note.endX - note.x;
                        const dy = note.endY - note.y;
                        const totalLength = Math.sqrt(dx * dx + dy * dy);
                        const mouseDx = x - note.x;
                        const mouseDy = y - note.y;
                        const dotProduct = (dx * mouseDx + dy * mouseDy);
                        note.progress = Math.max(0, Math.min(1, dotProduct / (totalLength * totalLength)));
                    }
                } else if (type === 'end') {
                    if (note.progress > 0.9) {
                        note.completed = true;
                        note.score = 'perfect';
                        this.score += 1500 * (1 + this.combo * 0.1); // 拖拽完成给更多分数
                        this.combo++;
                        this.createHitEffect(note.endX, note.endY, 'perfect');
                    } else if (note.progress > 0.7) {
                        note.completed = true;
                        note.score = 'good';
                        this.score += 800 * (1 + this.combo * 0.1);
                        this.combo++;
                        this.createHitEffect(note.endX, note.endY, 'good');
                    } else {
                        note.completed = true;
                        note.score = 'miss';
                        this.combo = 0;
                    }
                    note.held = false;
                    note.hit = true;
                    this.currentDragNote = null;
                    document.getElementById('score').textContent = Math.floor(this.score);
                }
                return;
            }
        }

        // 处理普通点击
        if (type === 'start') {
            this.notes.forEach(note => {
                if (note.hit || note.completed) return;
    
                // 计算点击位置与音符的距离
                const distance = Math.sqrt((x - note.x) ** 2 + (y - note.y) ** 2);
                
                // 只有在圆圈范围内的点击才判定
                if (distance <= this.circleSize) {
                    const timingDiff = Math.abs(currentTime - note.hitTime) * 1000; // 转换为毫秒
                    
                    // 对于拖拽按钮
                    if (note.isDrag) {
                        note.held = true;
                        note.progress = 0;
                        this.currentDragNote = note;
                        return;
                    }
                    
                    // 对于普通按钮
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
    }

    hitNote = (note) => {
        note.hit = true;
        this.combo++;
        this.score += 100 * (1 + this.combo * 0.1);
        document.getElementById('score').textContent = Math.floor(this.score);

        // 创建打击效果
        this.createHitEffect(note.x, note.y);
    }

    // 计算点到二次贝塞尔曲线的最小距离
    distanceToQuadraticCurve(px, py, x0, y0, x1, y1, x2, y2) {
        // 将点投影到曲线上的参数范围为0到1
        const numPoints = 20; // 用20个点来近似曲线
        let minDistance = Number.MAX_VALUE;
        
        // 通过采样曲线上的点来估算最小距离
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            // 二次贝塞尔曲线的参数方程
            const curveX = Math.pow(1-t, 2) * x0 + 2 * (1-t) * t * x1 + Math.pow(t, 2) * x2;
            const curveY = Math.pow(1-t, 2) * y0 + 2 * (1-t) * t * y1 + Math.pow(t, 2) * y2;
            
            // 计算点到曲线上该点的距离
            const dx = px - curveX;
            const dy = py - curveY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 更新最小距离
            if (distance < minDistance) {
                minDistance = distance;
            }
        }
        
        return minDistance;
    }

    createHitEffect = (x, y, scoreType = 'perfect') => {
        const particles = [];
        const particleCount = scoreType === 'perfect' ? 15 : 10;
        const particleSpeed = scoreType === 'perfect' ? 6 : 4;
        let particleColor;
        
        switch (scoreType) {
            case 'perfect':
                particleColor = this.colors.perfect;
                break;
            case 'good':
                particleColor = this.colors.good;
                break;
            default:
                particleColor = 'rgba(255, 255, 255, 0.8)';
        }
        
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * particleSpeed,
                vy: Math.sin(angle) * particleSpeed,
                life: 1,
                color: particleColor
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
                    this.ctx.fillStyle = p.color.replace(')', `, ${p.life})`);
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
