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
        const statusText = document.getElementById('statusText');

        // File upload functionality
        audioUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    // Update the file upload button text to show the selected file name
                    const fileUploadBtn = document.querySelector('.file-upload-btn');
                    if (fileUploadBtn) {
                        fileUploadBtn.textContent = file.name.length > 20 ? 
                            file.name.substring(0, 17) + '...' : 
                            file.name;
                    }
                    
                    statusText.innerHTML = `<div class="loading-message">Loading...</div>`;
                    const arrayBuffer = await file.arrayBuffer();
                    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    startButton.disabled = false;
                    statusText.innerHTML = `<div class="success-message">File loaded successfully!</div>`;
                } catch (error) {
                    console.error('Error loading audio file:', error);
                    statusText.innerHTML = '<div class="error-message">Failed to load audio file, please try another file</div>';
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
                statusText.innerHTML = '<div class="error-message">Please select an audio file first</div>';
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
                    const minSafeDistance = this.circleSize * 4; // Increase minimum safe distance to avoid button overlap
                    
                    // Check for overlap with other buttons
                    for (const note of this.notes) {
                        if (note.hit) continue; // Ignore already hit notes
                        
                        // Check the distance to the button itself
                        const dx = note.x - x;
                        const dy = note.y - y;
                        if (Math.sqrt(dx * dx + dy * dy) < minSafeDistance) {
                            return true; // Overlap detected
                        }
                        
                        // Check distance to drag tracks
                        if (note.isDrag && !note.completed) {
                            // Calculate minimum distance from new position to drag path
                            const minDistToDragPath = this.distanceToQuadraticCurve(
                                x, y, 
                                note.x, note.y, 
                                note.controlX, note.controlY,
                                note.endX, note.endY
                            );
                            
                            // If distance is less than the safety distance, consider it overlapping
                            if (minDistToDragPath < minSafeDistance) {
                                return true; // Overlap detected
                            }
                        }
                    }
                    
                    return false; // No overlap
                };

                // Use a grid system to better distribute buttons
                // Divide the screen into a 5x5 grid
                const gridCols = 5;
                const gridRows = 5;
                const gridCellWidth = this.safeArea.width / gridCols;
                const gridCellHeight = this.safeArea.height / gridRows;
                
                // Create grid cells
                const grid = [];
                for (let row = 0; row < gridRows; row++) {
                    for (let col = 0; col < gridCols; col++) {
                        grid.push({
                            col: col,
                            row: row,
                            x: this.safeArea.x + (col + 0.5) * gridCellWidth,
                            y: this.safeArea.y + (row + 0.5) * gridCellHeight,
                            used: false // Mark whether used in current group
                        });
                    }
                }
                
                // Find the grid cell of the previous note
                let lastGridCell = null;
                if (this.noteCount > 0) {
                    const lastNote = this.notes[this.notes.length - 1];
                    const lastCol = Math.floor((lastNote.x - this.safeArea.x) / gridCellWidth);
                    const lastRow = Math.floor((lastNote.y - this.safeArea.y) / gridCellHeight);
                    
                    // Find the corresponding grid cell
                    for (let i = 0; i < grid.length; i++) {
                        if (grid[i].col === lastCol && grid[i].row === lastRow) {
                            lastGridCell = grid[i];
                            grid[i].used = true; // Mark as used
                            break;
                        }
                    }
                }
                
                // Select the next grid cell
                let selectedCell;
                
                if (this.noteCount === 0) {
                    // Start the first note from the center
                    const centerIndex = Math.floor(grid.length / 2);
                    selectedCell = grid[centerIndex];
                } else {
                    // For subsequent notes, select adjacent cells that haven't been used in the current group
                    const adjacentCells = [];
                    const nearCells = [];
                    const otherCells = [];
                    
                    grid.forEach(cell => {
                        if (!cell.used) {
                            // Calculate grid distance from previous cell
                            const colDist = Math.abs(cell.col - lastGridCell.col);
                            const rowDist = Math.abs(cell.row - lastGridCell.row);
                            const maxDist = Math.max(colDist, rowDist);
                            
                            if (maxDist === 1) {
                                // Adjacent cells (up, down, left, right, diagonal)
                                adjacentCells.push(cell);
                            } else if (maxDist === 2) {
                                // Slightly further cells
                                nearCells.push(cell);
                            } else {
                                // Other cells
                                otherCells.push(cell);
                            }
                        }
                    });
                    
                    // Prioritize adjacent cells, then nearby cells, and finally random cells
                    if (adjacentCells.length > 0) {
                        selectedCell = adjacentCells[Math.floor(Math.random() * adjacentCells.length)];
                    } else if (nearCells.length > 0) {
                        selectedCell = nearCells[Math.floor(Math.random() * nearCells.length)];
                    } else if (otherCells.length > 0) {
                        selectedCell = otherCells[Math.floor(Math.random() * otherCells.length)];
                    } else {
                        // If all cells have been used, reset usage status and select a cell different from the last one
                        grid.forEach(cell => cell.used = false);
                        const availableCells = grid.filter(cell => 
                            cell.col !== lastGridCell.col || cell.row !== lastGridCell.row);
                        selectedCell = availableCells[Math.floor(Math.random() * availableCells.length)];
                    }
                }
                
                // Mark the selected cell as used
                selectedCell.used = true;
                
                // Find a non-overlapping position within the selected cell
                let attempts = 0;
                let found = false;
                const maxAttempts = 30; // Increased number of attempts
                
                // Randomly generate positions near the selected cell
                while (!found && attempts < maxAttempts) {
                    // Generate random position within the range around the cell
                    const offsetRange = Math.min(gridCellWidth, gridCellHeight) * 0.4;
                    x = selectedCell.x + (Math.random() - 0.5) * offsetRange;
                    y = selectedCell.y + (Math.random() - 0.5) * offsetRange;
                    
                    // Ensure position is within the safe area
                    x = Math.max(this.safeArea.x + this.circleSize, 
                        Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, x));
                    y = Math.max(this.safeArea.y + this.circleSize, 
                        Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, y));
                    
                    // Check if the new position overlaps with existing notes
                    if (!checkOverlap(x, y)) {
                        found = true;
                        break;
                    }
                    attempts++;
                }
                
                // If still no suitable position found, try generating in the entire safe area
                if (!found) {
                    for (let i = 0; i < 20; i++) {
                        x = this.safeArea.x + Math.random() * this.safeArea.width;
                        y = this.safeArea.y + Math.random() * this.safeArea.height;
                        
                        // Ensure position is within safe area and has some distance from the borders
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
                
                // If no suitable position found in the selected area, use improved spiral search algorithm
                if (!found) {
                    console.log('No suitable position found in the selected area, using spiral search');
                    
                    // Spiral search algorithm - increased attempts and search precision
                    const spiralAttempts = 100; // Increased number of attempts
                    const spiralStep = this.circleSize * 0.5; // Reduced step size for finer search
                    let spiralAngle = Math.random() * Math.PI * 2; // Random starting angle to avoid fixed patterns
                    let spiralRadius = this.circleSize * 2;
                    
                    // Start search from multiple points, not just the screen center
                    const startPoints = [
                        { x: this.canvas.width / 2, y: this.canvas.height / 2 }, // Center
                        { x: this.canvas.width / 4, y: this.canvas.height / 4 }, // Top-left
                        { x: this.canvas.width * 3/4, y: this.canvas.height / 4 }, // Top-right
                        { x: this.canvas.width / 4, y: this.canvas.height * 3/4 }, // Bottom-left
                        { x: this.canvas.width * 3/4, y: this.canvas.height * 3/4 } // Bottom-right
                    ];
                    
                    // Perform spiral search from each starting point
                    for (const startPoint of startPoints) {
                        if (found) break;
                        
                        const centerX = startPoint.x;
                        const centerY = startPoint.y;
                        spiralAngle = Math.random() * Math.PI * 2; // Use random angle for each starting point
                        spiralRadius = this.circleSize * 2;
                        
                        for (let i = 0; i < spiralAttempts; i++) {
                            spiralRadius += spiralStep / (2 * Math.PI);
                            spiralAngle += Math.PI / 12; // Smaller angle increment to get more points
                            
                            x = centerX + Math.cos(spiralAngle) * spiralRadius;
                            y = centerY + Math.sin(spiralAngle) * spiralRadius;
                            
                            // Ensure position is within the safe area
                            if (x >= this.safeArea.x + this.circleSize * 1.5 && 
                                x <= this.safeArea.x + this.safeArea.width - this.circleSize * 1.5 && 
                                y >= this.safeArea.y + this.circleSize * 1.5 && 
                                y <= this.safeArea.y + this.safeArea.height - this.circleSize * 1.5) {
                                    
                                // Check if the position overlaps with other notes
                                if (!checkOverlap(x, y)) {
                                    found = true;
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Last resort: Find the position with least overlap
                    if (!found) {
                        console.log('Spiral search failed, finding best possible position');
                        let bestDistance = 0;
                        let bestX = this.canvas.width / 2;
                        let bestY = this.canvas.height / 2;
                        
                        // Grid sampling across the entire screen to find the best position
                        const gridSize = this.circleSize * 2; // Grid size
                        const cols = Math.floor(this.safeArea.width / gridSize);
                        const rows = Math.floor(this.safeArea.height / gridSize);
                        
                        // Iterate through grid points
                        for (let col = 0; col < cols; col++) {
                            for (let row = 0; row < rows; row++) {
                                const testX = this.safeArea.x + (col + 0.5) * gridSize;
                                const testY = this.safeArea.y + (row + 0.5) * gridSize;
                                
                                // Calculate minimum distance from this position to all active notes and drag tracks
                                let minDistance = Number.MAX_VALUE;
                                
                                for (const note of this.notes) {
                                    if (note.hit || note.completed) continue;
                                    
                                    // Check distance to the button itself
                                    const dx = note.x - testX;
                                    const dy = note.y - testY;
                                    const distance = Math.sqrt(dx*dx + dy*dy);
                                    minDistance = Math.min(minDistance, distance);
                                    
                                    // Check distance to the drag track
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
                                
                                // Update the best position
                                if (minDistance > bestDistance) {
                                    bestDistance = minDistance;
                                    bestX = testX;
                                    bestY = testY;
                                }
                            }
                        }
                        
                        // Add small random offsets to avoid strict grid alignment
                        const offsetRange = gridSize * 0.3;
                        x = bestX + (Math.random() - 0.5) * offsetRange;
                        y = bestY + (Math.random() - 0.5) * offsetRange;
                        
                        // Ensure position is within safe area
                        x = Math.max(this.safeArea.x + this.circleSize * 1.5, 
                            Math.min(this.safeArea.x + this.safeArea.width - this.circleSize * 1.5, x));
                        y = Math.max(this.safeArea.y + this.circleSize * 1.5, 
                            Math.min(this.safeArea.y + this.safeArea.height - this.circleSize * 1.5, y));
                        
                        console.log(`Found optimal position, distance to nearest note: ${bestDistance}px`);
                    }
                }
                
                // Generate note
                const normalizedEnergy = Math.min(1, energy / 255);
                
                // Decide whether to create drag button
                const isDragNote = Math.random() < this.dragNoteFrequency && this.noteCount > 0;
                
                // Basic note properties
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
                    noteNumber: this.noteCount + 1,  // Start counting from 1
                    isDrag: isDragNote,
                    held: false,
                    completed: false,
                    progress: 0
                };
                
                // If it's a drag button, add extra properties
                if (isDragNote) {
                    // Calculate a reasonable endpoint position (small arc)
                    const distance = this.dragNoteMinDistance + Math.random() * (this.dragNoteMaxDistance - this.dragNoteMinDistance);
                    
                    // Generate a more natural angle (avoid overlapping with previous notes)
                    let angle;
                    if (this.notes.length > 0) {
                        // Generate a different direction based on the position of the last note
                        const lastNote = this.notes[this.notes.length - 1];
                        const dirToLastNote = Math.atan2(lastNote.y - y, lastNote.x - x);
                        // Avoid the direction of the previous note, choose opposite or perpendicular direction
                        angle = dirToLastNote + Math.PI * (0.5 + Math.random());
                    } else {
                        angle = Math.random() * Math.PI * 2;
                    }
                    
                    // Ensure endpoint is within safe area
                    let endX = x + Math.cos(angle) * distance;
                    let endY = y + Math.sin(angle) * distance;
                    
                    // Restrict to within safe area
                    endX = Math.max(this.safeArea.x + this.circleSize, 
                        Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, endX));
                    endY = Math.max(this.safeArea.y + this.circleSize, 
                        Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, endY));
                    
                    // Add to note object
                    note.endX = endX;
                    note.endY = endY;
                    
                    // Calculate curve control points
                    const dx = note.endX - note.x;
                    const dy = note.endY - note.y;
                    const pathDistance = Math.sqrt(dx * dx + dy * dy);
                    // Arc height is 15-25% of path length, creating a small arc
                    const arcHeight = pathDistance * (0.15 + Math.random() * 0.1);
                    const midX = (note.x + note.endX) / 2;
                    const midY = (note.y + note.endY) / 2;
                    const perpX = -dy / pathDistance;
                    const perpY = dx / pathDistance;
                    
                    note.controlX = midX + perpX * arcHeight;
                    note.controlY = midY + perpY * arcHeight;
                }
                
                this.noteCount++; // Increment note counter
                
                this.notes.push(note);
                this.lastNoteTime = currentTime;
            }
        }
    }
    detectVocalAndBeat = (audioData) => {
        // Ensure audio data exists
        if (!audioData || !audioData.length) {
            return { beat: false, vocal: false, energy: 0 };
        }

        // 1. Detect vocals
        let vocalEnergy = 0;
        const sampleRate = this.audioContext.sampleRate || 44100;
        const vocalMinBin = Math.floor(this.vocalFreqRange.min * this.analyser.fftSize / sampleRate);
        const vocalMaxBin = Math.floor(this.vocalFreqRange.max * this.analyser.fftSize / sampleRate);
        
        // Ensure index is within valid range
        const minBin = Math.max(0, Math.min(vocalMinBin, audioData.length - 1));
        const maxBin = Math.max(0, Math.min(vocalMaxBin, audioData.length - 1));
        
        // Calculate energy within vocal frequency range
        for (let i = minBin; i <= maxBin; i++) {
            vocalEnergy += audioData[i];
        }
        vocalEnergy /= (maxBin - minBin + 1);
        
        // Update vocal energy history using smoothing factor
        this.vocalEnergyHistory.push(vocalEnergy);
        if (this.vocalEnergyHistory.length > 40) { // Increase history length for smoother results
            this.vocalEnergyHistory.shift();
        }
        
        // Calculate dynamic threshold for vocal energy
        const avgVocalEnergy = this.vocalEnergyHistory.reduce((a, b) => a + b) / this.vocalEnergyHistory.length;
        // Use more sensitive threshold for vocal detection
        const vocalDetected = vocalEnergy > avgVocalEnergy * this.vocalDetectionThreshold;
        
        // 2. Detect beats
        let beatEnergy = 0;
        for (let i = 0; i < 32; i++) {
            beatEnergy += audioData[i];
        }
        beatEnergy /= 32;
        
        this.energyHistory.push(beatEnergy);
        if (this.energyHistory.length > 30) {
            this.energyHistory.shift();
        }
        
        // Store recent beat intensity to adjust number of notes per group
        if (beatEnergy > 0) {
            this.recentBeatStrengths.push(beatEnergy);
            if (this.recentBeatStrengths.length > 20) { // Keep intensity of the 20 most recent beats
                this.recentBeatStrengths.shift();
            }
            
            // Adjust number of notes per group based on recent beat intensity and pre-analyzed data
            if (this.recentBeatStrengths.length >= 5 && !this.isGroupPaused) {
                // Combine real-time beat intensity and pre-analyzed results
                const currentTime = this.audioContext.currentTime - this.startTime;
                let plannedSize = this.notesPerGroup; // Default value
                
                // If pre-analyzed data exists, find planned button count for current time point
                if (this.vocalSections && this.vocalSections.length > 0) {
                    // Find vocal segment containing current time
                    const currentSection = this.vocalSections.find(section => 
                        currentTime >= section.start && currentTime <= section.end);
                    
                    if (currentSection) {
                        // Use pre-analyzed planned button count
                        plannedSize = currentSection.plannedButtonCount;
                    }
                }
                
                // Fine-tune based on real-time beat intensity
                const avgStrength = this.recentBeatStrengths.reduce((a, b) => a + b) / this.recentBeatStrengths.length;
                const normalizedStrength = Math.min(avgStrength / 255, 1); // Normalize to 0-1 range
                
                // Dynamically adjust note count per group, based on pre-analyzed data and fine-tuned by real-time beat intensity
                const adjustment = Math.round(normalizedStrength * 3) - 1; // Adjustment between -1 and 2
                this.currentGroupSize = plannedSize + adjustment;
                
                // Ensure within specified range
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
            // If note has shown score and disappeared, remove it
            if (note.hit && !note.score) return false;
            
            // Special handling for drag buttons
            if (note.isDrag && note.completed) {
                // Completed drag buttons are removed after displaying for a period of time
                if (note.score && (currentTime - note.hitTime > 1)) {
                    return false;
                }
                return true;
            }
            
            // If note has passed the judgment time for too long without being clicked, mark as miss
            if (!note.hit && !note.held && currentTime > note.hitTime + this.goodRange / 1000) {
                note.hit = true;
                note.score = 'miss';
                this.combo = 0;
                return true;
            }
            
            // If drag button was clicked but drag not completed for a long time, also mark as miss
            if (note.isDrag && note.held && !note.completed && currentTime > note.hitTime + 5) { // Timeout after 5 seconds
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
        
        // Debug mode: Display safe area and debug information
        if (this.debugMode) {
            // Draw safe area boundaries
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.strokeRect(
                this.safeArea.x,
                this.safeArea.y,
                this.safeArea.width,
                this.safeArea.height
            );
            
            // Display debug information
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`Beat Count: ${this.beatCount}`, 10, 20);
            this.ctx.fillText(`Notes Count: ${this.notes.length}`, 10, 40);
            this.ctx.fillText(`Vocal Active: ${this.vocalActive ? 'Yes' : 'No'}`, 10, 60);
            this.ctx.fillText(`Group Status: ${this.isGroupPaused ? 'Paused' : 'Active'}`, 10, 80);
            this.ctx.fillText(`Notes in Group: ${this.noteCount} / ${this.notesPerGroup}`, 10, 100);
        }

        // Draw notes and circles
        this.notes.forEach(note => {
            if (note.hit && !note.score) return;

            const currentTime = this.audioContext.currentTime - this.startTime;
            const timeUntilHit = note.hitTime - currentTime;
            note.approachProgress = Math.max(0, Math.min(1, 1 - timeUntilHit / (this.approachRate / 1000)));

            // Draw contracting circle
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



            // If it's a drag button, draw the track
            if (note.isDrag) {
                // Draw curved track
                this.ctx.beginPath();
                this.ctx.lineCap = 'round';
                this.ctx.lineWidth = this.circleSize * 0.8; // Track width is smaller than circle
                this.ctx.strokeStyle = this.colors.track;
                this.ctx.moveTo(note.x, note.y);
                this.ctx.quadraticCurveTo(note.controlX, note.controlY, note.endX, note.endY);
                this.ctx.stroke();
                
                // If currently dragging, draw progress track
                if (note.held) {
                    // Calculate current point position on the curve
                    const t = note.progress;
                    const currentX = Math.pow(1-t, 2) * note.x + 
                                   2 * (1-t) * t * note.controlX + 
                                   Math.pow(t, 2) * note.endX;
                    const currentY = Math.pow(1-t, 2) * note.y + 
                                   2 * (1-t) * t * note.controlY + 
                                   Math.pow(t, 2) * note.endY;
                    
                    // Draw completed track
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
                    
                    // Draw partial path up to current progress
                    this.ctx.beginPath();
                    this.ctx.moveTo(note.x, note.y);
                    this.ctx.lineCap = 'round';
                    this.ctx.lineWidth = this.circleSize * 0.8;
                    this.ctx.strokeStyle = this.colors.progress;
                    
                    for (let i = 1; i <= progressIndex; i++) {
                        this.ctx.lineTo(fullPath[i].x, fullPath[i].y);
                    }
                    
                    this.ctx.stroke();
                    
                    // Draw drag point
                    this.ctx.beginPath();
                    this.ctx.arc(currentX, currentY, this.circleSize * 0.9, 0, Math.PI * 2);
                    this.ctx.fillStyle = this.colors.progress;
                    this.ctx.fill();
                    
                    // Glow effect
                    const pulseSize = this.circleSize * (1.2 + Math.sin(Date.now() / 200) * 0.1);
                    this.ctx.beginPath();
                    this.ctx.arc(currentX, currentY, pulseSize, 0, Math.PI * 2);
                    this.ctx.strokeStyle = this.colors.glow;
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
                
                // Draw endpoint circle
                this.ctx.beginPath();
                this.ctx.arc(note.endX, note.endY, this.circleSize * 0.8, 0, Math.PI * 2);
                this.ctx.fillStyle = note.completed ? this.colors.perfect : 'rgba(255, 255, 255, 0.2)';
                this.ctx.fill();
                this.ctx.strokeStyle = '#fff';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }
            
            // Draw starting circle
            this.ctx.beginPath();
            this.ctx.arc(note.x, note.y, this.circleSize, 0, Math.PI * 2);
            this.ctx.fillStyle = note.score ? this.colors[note.score] : 
                               (note.held ? this.colors.perfect : this.colors.circle);
            this.ctx.fill();
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Show sequence number in circle and draw lines between adjacent numbers
            if (!note.hit) {
                // If there is a previous note and they have consecutive numbers, draw a connecting line
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

                // Display sequence number
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '24px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(note.noteNumber.toString(), note.x, note.y);
            }

            // If there is a score, display the score text
            if (note.score) {
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '20px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(note.score.toUpperCase(), note.x, note.y - 40);
                
                // Remove the note after displaying the score for a period of time
                if (currentTime - note.hitTime > 0.5) {
                    note.hit = true;
                    note.score = null;
                }
            }
        });

        // Draw combo count and score
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        
        if (this.combo > 1) {
            this.ctx.fillText(`${this.combo}x Combo!`, this.canvas.width / 2, 50);
        }
        
        this.ctx.fillText(`Score: ${Math.floor(this.score)}`, this.canvas.width / 2, 90);
        
        // The voice activity indicator is hidden, but the voice detection logic functionality is retained
    }
    handleInput = (x, y, type) => {
        if (!this.isPlaying) return;

        const currentTime = this.audioContext.currentTime - this.startTime;
        
        // If there is a note being dragged
        if (this.currentDragNote) {
            const note = this.currentDragNote;
            
            if (note.held) {
                if (type === 'move') {
                    // Generate points on the curve
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
                    
                    // Find the closest point
                    let minDist = Infinity;
                    let closestPoint = null;
                    
                    curvePoints.forEach(point => {
                        const dist = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
                        if (dist < minDist) {
                            minDist = dist;
                            closestPoint = point;
                        }
                    });
                    
                    // Update progress
                    if (closestPoint) {
                        note.progress = closestPoint.t;
                    } else {
                        // Fall back to linear calculation as an alternative
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
                        this.score += 1500 * (1 + this.combo * 0.1); // More points for completing the drag
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

        // Handle normal clicks
        if (type === 'start') {
            this.notes.forEach(note => {
                if (note.hit || note.completed) return;
    
                // Calculate the distance between click position and note
                const distance = Math.sqrt((x - note.x) ** 2 + (y - note.y) ** 2);
                
                // Only judge clicks within the circle range
                if (distance <= this.circleSize) {
                    const timingDiff = Math.abs(currentTime - note.hitTime) * 1000; // Convert to milliseconds
                    
                    // For drag buttons
                    if (note.isDrag) {
                        note.held = true;
                        note.progress = 0;
                        this.currentDragNote = note;
                        return;
                    }
                    
                    // For normal buttons
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

        // Create hit effect
        this.createHitEffect(note.x, note.y);
    }

    // Calculate the minimum distance from a point to a quadratic Bezier curve
    distanceToQuadraticCurve(px, py, x0, y0, x1, y1, x2, y2) {
        // Project the point onto the curve with parameter range 0 to 1
        const numPoints = 20; // Use 20 points to approximate the curve
        let minDistance = Number.MAX_VALUE;
        
        // Estimate the minimum distance by sampling points on the curve
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            // Parametric equation of the quadratic Bezier curve
            const curveX = Math.pow(1-t, 2) * x0 + 2 * (1-t) * t * x1 + Math.pow(t, 2) * x2;
            const curveY = Math.pow(1-t, 2) * y0 + 2 * (1-t) * t * y1 + Math.pow(t, 2) * y2;
            
            // Calculate the distance from the point to this point on the curve
            const dx = px - curveX;
            const dy = py - curveY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Update the minimum distance
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

// Initialize the game
window.addEventListener('load', () => {
    new RhythmGame();
});