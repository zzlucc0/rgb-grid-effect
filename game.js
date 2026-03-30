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
        this.readyMode = null;
        this.score = 0;
        this.combo = 0;
        this.isPlaying = false;
        this.audioBuffer = null;
        this.startTime = 0;
        this.lastNoteTime = 0;
        this.chartMode = false;
        this.chartData = null;
        this.nextChartIndex = 0;
        this.liveMode = false;
        this.liveConfig = null;
        this.liveLastNote = 0;
        this.readyMode = null;
        this._liveStartWall = 0;
        this.liveEngine = null;
        this.liveMonitorTimer = null;
        this.livePlaybackStarted = false;
        this.livePlaybackState = 'idle';
        this.playbackStartToken = 0;
        this.pendingPlaybackStart = null;
        this.spawnedChartNotes = 0;
        this.playbackViolations = [];
        this.runInvalid = false;
        this.judgementStats = { perfect: 0, good: 0, miss: 0 };
        this.globalNoteSeq = 0;
        this.gameState = 'idle';
        this.scene = 'input';
        this.lastStartError = '';
        this.pauseReason = 'none';
        this.pausedAt = 0;
        this.pauseAccumulated = 0;
        this.frozenGameTime = 0;
        this.playMode = 'casual';
        this.lastPlaybackHealthyAt = 0;
        this.runClock = window.RunClockController ? new window.RunClockController() : null;
        this.runOrchestrator = window.RunOrchestrator ? new window.RunOrchestrator({ clock: this.runClock, onMonitorEvent: (event, meta) => this.handlePlaybackMonitorEvent(event, meta) }) : null;
        this.chartRuntime = window.ChartRuntime ? new window.ChartRuntime() : null;
        this.runCompletion = window.RunCompletionController ? new window.RunCompletionController({
            chartRuntime: this.chartRuntime,
            getActiveNotes: () => (this.notes || []).filter(n => !n.hit && !n.completed),
            getRunTime: () => this.resolveRunClock(),
            getPlaybackState: () => this.livePlaybackState || 'idle',
            getChartData: () => this.chartData || null,
            finishGraceSec: 1.8
        }) : null;
        this.playbackController = window.PlaybackController ? new window.PlaybackController({
            onState: (state) => this.markLivePlaybackState(state),
            getIsPlaying: () => this.isPlaying,
            audioElement: document.getElementById('liveAudio'),
            playerHostId: 'ytPlayer'
        }) : null;
        this.diagnostics = {
            lastChartSpawnAt: null,
            lastChartSpawnCount: 0,
            lastActiveNotes: 0,
            lastRunTime: 0,
            lastPlayerTime: 0,
            lastDiag: 'idle'
        };
        this.runtimeTuning = null;
        this.tutorialSeenCounts = {};
        this.visualBursts = [];
        this.signatureBursts = [];
        this.juiceShake = { x: 0, y: 0, mag: 0 };
        this.perfectStreak = 0;
        this.juiceParticles = [];
        this.feedbackBanners = [];
        this.juiceShake = { x: 0, y: 0, mag: 0 };
        this.perfectStreak = 0;
        this.juiceParticles = [];
        this.countdownFlash = null;
        this.groupHistory = [];
        this.activeGroupState = null;
        this.segmentGroupPalettes = {
            intro: [
                { core: '#ffe4c4', edge: '#ffc47d', glow: 'rgba(255,196,125,.30)' },
                { core: '#ffd8ef', edge: '#ff9bc8', glow: 'rgba(255,155,200,.28)' }
            ],
            verse: [
                { core: '#f5d6ff', edge: '#c89cff', glow: 'rgba(200,156,255,.30)' },
                { core: '#ffd9bf', edge: '#ffb46a', glow: 'rgba(255,180,106,.28)' },
                { core: '#ffe7f1', edge: '#ff99bf', glow: 'rgba(255,153,191,.26)' }
            ],
            pre: [
                { core: '#ffe1b8', edge: '#ffb15f', glow: 'rgba(255,177,95,.30)' },
                { core: '#f3d9ff', edge: '#bf8cff', glow: 'rgba(191,140,255,.28)' }
            ],
            chorus: [
                { core: '#fff0cc', edge: '#ffd36e', glow: 'rgba(255,211,110,.34)' },
                { core: '#ffd8f3', edge: '#ff8dca', glow: 'rgba(255,141,202,.32)' },
                { core: '#e8dcff', edge: '#b48fff', glow: 'rgba(180,143,255,.32)' }
            ],
            bridge: [
                { core: '#d9f0ff', edge: '#8ec5ff', glow: 'rgba(142,197,255,.28)' },
                { core: '#efe0ff', edge: '#bc96ff', glow: 'rgba(188,150,255,.28)' }
            ],
            outro: [
                { core: '#ffe0d6', edge: '#ffab92', glow: 'rgba(255,171,146,.26)' },
                { core: '#f0dcff', edge: '#c093ff', glow: 'rgba(192,147,255,.24)' }
            ],
            live: [
                { core: '#ffe7cc', edge: '#ffbd73', glow: 'rgba(255,189,115,.30)' },
                { core: '#f2deff', edge: '#c39bff', glow: 'rgba(195,155,255,.28)' }
            ]
        };
        
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
        this.minBeatInterval = 0.5; // Minimum beat interval (seconds), slightly slower for readability
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
        this.approachRate = 1250; // Legacy shared approach timing (milliseconds)
        this.spawnLeadTimeMs = this.approachRate; // Spawn lookahead for chart scheduling
        this.visualApproachDurationMs = Math.round(this.approachRate * 0.84); // Visual shrink timing kept separate from scheduling
        this.circleSize = 80; // Target circle size
        this.approachCircleSize = 180; // Initial approach circle size
        this.perfectRange = 430; // Perfect judgment range (milliseconds)
        this.goodRange = 680; // Good judgment range (milliseconds)
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
        this.currentSpinNote = null;
        this.pointerState = { down: false, x: 0, y: 0, startedAt: 0, startX: 0, startY: 0 };
        this.dragNoteMinDistance = this.circleSize * 4; // Minimum distance for drag notes
        this.dragNoteMaxDistance = this.circleSize * 6; // Maximum distance for drag notes
        
        this.setupCanvas();
        this.setupEventListeners();
        const status = document.getElementById('statusText');
        if (status && !status.innerHTML.trim()) {
            status.innerHTML = '<div class="info-message">System idle. Load local audio or prepare a playable link to arm the run.</div>';
        }
        this.syncReadyState();
        this.updatePauseUI();
        this.updateHUD();
    }

    setScene(scene, meta = {}) {
        const nextScene = scene || this.scene || 'input';
        const lockedRunScene = this.isPlaying || this.isStartingPhase() || this.isRunningPhase() || this.isPausedPhase();
        if (lockedRunScene && !meta.force && (nextScene === 'input' || nextScene === 'ready')) {
            this.scene = this.isStartingPhase() ? 'countdown' : 'playing';
        } else {
            this.scene = nextScene;
        }
        if (Object.prototype.hasOwnProperty.call(meta, 'error')) {
            this.lastStartError = meta.error || '';
        }
        this.renderScene();
        this.updateHUD();
    }

    setRunPhase(phase) {
        this.gameState = phase || this.gameState || 'idle';
        if (phase === 'idle' || phase === 'ready' || phase === 'finished' || phase === 'failed') this.isPlaying = false;
        if (phase === 'starting') this.setScene('countdown');
        else if (phase === 'awaiting-playback') this.setScene('countdown');
        else if (phase === 'playing') this.setScene('playing');
        else if (phase === 'paused-user' || phase === 'paused-system') this.setScene('playing');
        else if (phase === 'ready') this.setScene('ready');
        else if (phase === 'idle') this.setScene('input');
        else if (phase === 'finished') {
            this.setScene('ready', { force: true });
            // Result overlay will hide the input container; keep it hidden until player chooses
            const uc = document.getElementById('uploadContainer');
            if (uc) uc.classList.add('hidden');
        }
        else if (phase === 'failed') {
            this.setScene('ready', { force: true });
            const uc = document.getElementById('uploadContainer');
            if (uc) uc.classList.add('hidden');
        }
        else this.updateHUD();
    }

    isPausedPhase() {
        return this.gameState === 'paused-user' || this.gameState === 'paused-system';
    }

    isRunningPhase() {
        return this.gameState === 'playing';
    }

    isStartingPhase() {
        return this.gameState === 'starting' || this.gameState === 'awaiting-playback';
    }

    renderScene() {
        const uploadContainer = document.getElementById('uploadContainer');
        const pauseOverlay = document.getElementById('pauseOverlay');
        const overlayText = document.getElementById('pauseOverlayText');
        const overlaySubtext = document.getElementById('pauseOverlaySubtext');
        const inRun = this.isPlaying || this.isStartingPhase() || this.scene === 'countdown' || this.scene === 'playing' || this.isPausedPhase();
        const showSetup = !inRun && (this.scene === 'input' || this.scene === 'ready');
        if (uploadContainer) uploadContainer.classList.toggle('hidden', !showSetup);
        const scorePanel = document.getElementById('score');
        if (scorePanel) scorePanel.style.display = inRun ? 'block' : 'none';
        if (pauseOverlay && (this.scene === 'countdown' || this.scene === 'playing' || this.scene === 'error' || inRun)) {
            const syncing = this.gameState === 'awaiting-playback';
            const paused = this.isPausedPhase();
            pauseOverlay.classList.toggle('hidden', !(paused || syncing));
            if (syncing) {
                if (overlayText) overlayText.textContent = 'Syncing playback…';
                if (overlaySubtext) {
                    const playbackState = String(this.livePlaybackState || 'loading');
                    const hint = playbackState === 'buffering' || playbackState === 'waiting'
                        ? 'Player is buffering. Run will begin the moment playback is live.'
                        : playbackState === 'ready' || playbackState === 'cued' || playbackState === 'loading'
                            ? 'Preparing hidden player. Run will begin on the first real playback frame.'
                            : 'Waiting for playback to begin…';
                    overlaySubtext.textContent = hint;
                }
            } else if (!paused) {
                if (overlayText) overlayText.textContent = 'Paused';
                if (overlaySubtext) overlaySubtext.textContent = 'Resume will trigger a short countdown.';
            }
        }
    }

    setStatusMessage(type, text, metaHtml = '') {
        const statusText = document.getElementById('statusText');
        if (!statusText) return;
        const cls = type === 'error' ? 'error-message' : (type === 'success' ? 'success-message' : (type === 'info' ? 'info-message' : 'loading-message'));
        statusText.innerHTML = `<div class="${cls}">${text}</div>` + (metaHtml ? `<div class="note-message" style="margin-top:6px;font-size:12px;opacity:0.9;">${metaHtml}</div>` : '');
    }

    setReadySummary(mode, ready, notes, densityLabel) {
        const panel = document.getElementById('readyPanel');
        if (!panel) return;
        const modeBadge = document.getElementById('modeBadge');
        const readyBadge = document.getElementById('readyBadge');
        const notesBadge = document.getElementById('notesBadge');
        const densityBadge = document.getElementById('densityBadge');
        if (modeBadge) modeBadge.textContent = mode || '-';
        if (readyBadge) readyBadge.textContent = ready ? 'yes' : 'no';
        if (notesBadge) notesBadge.textContent = String(notes == null ? '-' : notes);
        if (densityBadge) densityBadge.textContent = densityLabel || '-';
    }

    setupLoadedState(mode) {
        this.readyMode = mode || null;
        if (!this.isPlaying) this.setRunPhase('ready');
        this.syncReadyState();
        this.updateHUD();
    }

    loadOfflineAudioBuffer(audioBuffer) {
        this.audioBuffer = audioBuffer || null;
        this.chartMode = false;
        this.chartData = null;
        this.nextChartIndex = 0;
        if (this.chartRuntime?.reset) this.chartRuntime.reset(null);
        this.liveMode = false;
        this.liveConfig = null;
        this.setScene('ready', { error: '' });
        this.setupLoadedState('offline');
    }

    loadOfflineChartRuntime(chart, audioBuffer = null) {
        this.audioBuffer = audioBuffer || this.audioBuffer || null;
        this.chartMode = true;
        this.chartData = chart || null;
        this.nextChartIndex = 0;
        const _arm = Number(chart?.approachRateMs || 0);
        if (_arm >= 800 && _arm <= 2000) { this.approachRate = _arm; this.spawnLeadTimeMs = _arm; this.visualApproachDurationMs = Math.round(_arm * 0.84); }
        if (this.chartRuntime?.load) this.chartRuntime.load(this.chartData || null, { spawnLeadTimeMs: this.spawnLeadTimeMs, goodRangeMs: this.goodRange });
        this.liveMode = false;
        this.liveConfig = null;
        this.setScene('ready', { error: '' });
        this.setupLoadedState('offline');
    }

    loadOfflineStreamChartRuntime(chart, liveConfig) {
        this.audioBuffer = null;
        this.chartMode = true;
        this.chartData = chart || null;
        this.nextChartIndex = 0;
        const _arm = Number(chart?.approachRateMs || 0);
        if (_arm >= 800 && _arm <= 2000) { this.approachRate = _arm; this.spawnLeadTimeMs = _arm; this.visualApproachDurationMs = Math.round(_arm * 0.84); }
        if (this.chartRuntime?.load) this.chartRuntime.load(this.chartData || null, { spawnLeadTimeMs: this.spawnLeadTimeMs, goodRangeMs: this.goodRange });
        this.liveMode = true;
        this.liveConfig = liveConfig || null;
        this.setScene('ready', { error: '' });
        this.setupLoadedState('offline');
    }

    loadOnlineAnalyzedRuntime(chart, liveConfig) {
        this.audioBuffer = null;
        this.chartMode = true;
        this.chartData = chart || null;
        this.nextChartIndex = 0;
        const _arm = Number(chart?.approachRateMs || 0);
        if (_arm >= 800 && _arm <= 2000) { this.approachRate = _arm; this.spawnLeadTimeMs = _arm; this.visualApproachDurationMs = Math.round(_arm * 0.84); }
        const _fullDur = Number(liveConfig?.analysis?.fullDuration || liveConfig?.analysis?.duration || 0);
        if (_fullDur > 0 && this.chartData) this.chartData.fullDuration = _fullDur;
        if (this.chartRuntime?.load) this.chartRuntime.load(this.chartData || null, { spawnLeadTimeMs: this.spawnLeadTimeMs, goodRangeMs: this.goodRange });
        this.liveMode = true;
        this.liveConfig = liveConfig || null;
        this.setScene('ready', { error: '' });
        this.setupLoadedState('online-analyzed');
    }

    loadOnlineSeedRuntime(liveConfig) {
        this.audioBuffer = null;
        this.chartMode = false;
        this.chartData = null;
        this.nextChartIndex = 0;
        if (this.chartRuntime?.reset) this.chartRuntime.reset(null);
        this.liveMode = true;
        this.liveConfig = liveConfig || null;
        this.setScene('ready', { error: '' });
        this.setupLoadedState('online');
    }

    clearLoadedState(errorMessage = '', options = {}) {
        const lockedRun = this.isPlaying || this.isStartingPhase() || this.isRunningPhase() || this.isPausedPhase();
        if (lockedRun && !options.force) {
            if (errorMessage) this.lastStartError = errorMessage;
            this.captureRuntimeDiagnostics('clear-blocked', { clearError: errorMessage || '', lockedRun: true });
            this.updateHUD();
            return;
        }
        this.audioBuffer = null;
        this.chartData = null;
        this.liveConfig = null;
        this.nextChartIndex = 0;
        if (this.chartRuntime?.reset) this.chartRuntime.reset(null);
        this.chartMode = false;
        this.liveMode = false;
        this.readyMode = null;
        if (!this.isPlaying) this.setRunPhase('idle');
        else this.setScene('input', { error: errorMessage || '' });
        if (errorMessage) this.lastStartError = errorMessage;
        this.syncReadyState();
        this.updateHUD();
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
        const pauseBtn = document.getElementById('pauseGameBtn');
        const resumeBtn = document.getElementById('resumeGameBtn');
        const hudPauseBtn = document.getElementById('hudPauseBtn');
        const overlayResumeBtn = document.getElementById('overlayResumeBtn');
        const difficultySelect = document.getElementById('difficultySelect');
        const playModeSelect = document.getElementById('playModeSelect');

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
                    
                    this.setStatusMessage('loading', 'Loading...');
                    const arrayBuffer = await file.arrayBuffer();
                    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    this.loadOfflineAudioBuffer(audioBuffer);
                    this.setStatusMessage('success', 'File loaded successfully!');
                } catch (error) {
                    console.error('Error loading audio file:', error);
                    this.clearLoadedState('Failed to load audio file');
                    this.setStatusMessage('error', 'Failed to load audio file, please try another file');
                }
            }
        });

        // Start game button
        startButton.addEventListener('click', async () => {
            console.log('Start button clicked', this.audioBuffer);
            if (this.gameState === 'starting' || this.gameState === 'awaiting-playback' || this.pendingPlaybackStart?.promise) {
                this.setStatusMessage('loading', 'Run start already in progress...');
                return;
            }
            if (this.audioBuffer || this.liveMode || this.readyMode) {
                try {
                    this.setScene('countdown', { error: '' });
                    await this.startGame();
                } catch (err) {
                    console.error('startGame failed:', err);
                    if (!(this.liveMode || this.gameState === 'awaiting-playback')) {
                        this.setStatusMessage('error', 'Start failed: ' + (err?.message || 'unknown error'));
                        this.livePlaybackState = 'start-error';
                        this.setScene('ready', { error: err?.message || 'unknown error' });
                    }
                }
            } else {
                this.setStatusMessage('error', 'Please analyze or select media first');
            }
        });

        if (pauseBtn) pauseBtn.addEventListener('click', () => this.pauseGame('user'));
        if (resumeBtn) resumeBtn.addEventListener('click', () => this.resumeGame());
        if (hudPauseBtn) hudPauseBtn.addEventListener('click', () => this.pauseGame('user'));
        if (overlayResumeBtn) overlayResumeBtn.addEventListener('click', () => this.resumeGame());
        if (difficultySelect) difficultySelect.addEventListener('change', () => this.updateHUD());
        if (playModeSelect) playModeSelect.addEventListener('change', () => {
            this.playMode = playModeSelect.value || this.playMode;
            this.updateHUD();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isPlaying && this.isRunningPhase()) this.pauseGame('system');
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (this.isRunningPhase()) this.pauseGame('user');
                else if (this.isPausedPhase()) this.resumeGame();
                return;
            }
            const key = String(e.key || '').toLowerCase();
            if (e.code === 'Space' || e.key === ' ' || ['a','s','d','f','g','h','j','k','l'].includes(key)) {
                e.preventDefault();
                this.handleKeyboardAction(e.code === 'Space' || e.key === ' ' ? 'space' : key);
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
        await this.enterRunStartSequence();
    }

    async enterRunStartSequence() {
        try {
            await this.prepareRun();
            // Sync playback BEFORE countdown so player sees 3·2·1 only after audio is ready
            if (this.liveMode) {
                this.setRunPhase('awaiting-playback');
                this.setStatusMessage('loading', 'Linking playback…');
                await this.startPlaybackAndWaitUntilPlaying();
                // Sync complete — switch phase so sync overlay dismisses before countdown
                this.gameState = 'starting';
                this.updatePauseUI();
            }
            await this.runCountdown();
            const dataArray = this.beginRun();
            if (!this.liveMode) this.startPlaybackBackend();
            this.armGameLoop(dataArray);
        } catch (err) {
            console.error('enterRunStartSequence failed:', err);
            if (this.liveMode || this.gameState === 'awaiting-playback') {
                this.handlePlaybackStartFailure(err);
            }
            throw err;
        }
    }

    armGameLoop(dataArray) {
        this.captureRuntimeDiagnostics('arm-loop');
        requestAnimationFrame(() => this.gameLoop(dataArray));
    }

    async prepareRun() {
        try {
            if (this.audioContext && this.audioContext.state !== 'running') {
                await this.audioContext.resume();
            }
        } catch (e) {
            console.warn('audioContext resume failed:', e);
        }

        this.score = 0;
        this.combo = 0;
        this.notes = [];
        this.beatCount = 0;
        if (this.runOrchestrator?.arm) this.runOrchestrator.arm();
        this.noteCount = 0;
        this.nextChartIndex = 0;
        if (this.chartRuntime?.reset) {
            this.chartRuntime.reset(this.chartData || null);
            this.chartRuntime.spawnLeadTimeMs = this.spawnLeadTimeMs;
            this.chartRuntime.approachRateMs = this.spawnLeadTimeMs;
            this.chartRuntime.goodRangeMs = this.goodRange;
        }
        this.isGroupPaused = false;
        this.playbackViolations = [];
        this.runInvalid = false;
        this.tutorialSeenCounts = {};
        this.judgementStats = { perfect: 0, good: 0, miss: 0 };
        this.globalNoteSeq = 0;
        this.livePlaybackStarted = false;
        this.livePlaybackState = 'idle';
        this.rejectPendingPlaybackStart?.(new Error('superseded by new run'));
        this.spawnedChartNotes = 0;
        this.currentGroupSize = this.notesPerGroup;
        this.setRunPhase('starting');
        this.playMode = (this.liveConfig && this.liveConfig.playMode) || document.getElementById('playModeSelect')?.value || 'casual';
        this.pauseReason = 'none';
        this.pausedAt = 0;
        this.pauseAccumulated = 0;
        this.frozenGameTime = 0;
        this.lastPlaybackHealthyAt = 0;
        this.visualBursts = [];
        this.signatureBursts = [];
        this.groupHistory = [];
        this.activeGroupState = null;
        this.recentBeatStrengths = [];
        this.analyzedSections = [];
        this.updateHUD();

        if (!this.chartMode && !this.liveMode) {
            this.setStatusMessage('loading', 'Analyzing beats (preAnalyzeSong)...');
            await this.preAnalyzeSong();
        } else {
            this.analyzedSections = [];
            this.vocalSections = [];
        }

        if (this.liveMode) {
            this.initLiveEngine();
        }

        if (this.chartMode && this.chartData?.notes?.length) {
            if (this.liveMode) this.applySegmentProfile(0);
            const avgVocalEnergy = (this.vocalSections || []).length
                ? this.vocalSections.reduce((sum, sec) => sum + (sec.avgEnergy || 0), 0) / this.vocalSections.length
                : 120;
            const nudge = avgVocalEnergy > 130 ? -0.02 : 0.01;
            const phraseCounts = new Map();
            this.chartData.notes = this.chartData.notes.map((n, idx) => {
                const rawTime = Number(n?.time);
                const normalizedTime = Number.isFinite(rawTime) ? rawTime : (idx * 0.5 + 0.6);
                const phraseKey = Number.isFinite(n?.phrase) ? n.phrase : Math.floor(idx / 6);
                const inPhraseIndex = phraseCounts.get(phraseKey) || 0;
                phraseCounts.set(phraseKey, inPhraseIndex + 1);
                return {
                    ...n,
                    time: Number(Math.max(0.6, normalizedTime + nudge + (idx % 8 === 0 ? 0.005 : 0)).toFixed(3)),
                    type: n.type || 'click',
                    phrase: phraseKey,
                    groupSlot: inPhraseIndex
                };
            }).sort((a, b) => {
                const ta = Number.isFinite(Number(a?.time)) ? Number(a.time) : Number.POSITIVE_INFINITY;
                const tb = Number.isFinite(Number(b?.time)) ? Number(b.time) : Number.POSITIVE_INFINITY;
                if (ta !== tb) return ta - tb;
                return (Number(a?.phrase) || 0) - (Number(b?.phrase) || 0);
            });
            const firstChartTime = Number(this.chartData.notes[0]?.time || 0);
            const desiredLeadIn = this.liveMode ? 0.92 : 1.05;
            const leadShift = firstChartTime > desiredLeadIn ? Math.min(firstChartTime - desiredLeadIn, 1.25) : 0;
            if (leadShift > 0.01) {
                this.chartData.notes = this.chartData.notes.map((note, idx) => ({
                    ...note,
                    time: Number(Math.max(0.42, Number(note.time || 0) - leadShift - (idx === 0 ? 0.02 : 0)).toFixed(3))
                }));
            }
            if (window.ChartPolicy?.finalizePlayableChartPipeline) {
                const analysisMeta = (this.liveConfig && this.liveConfig.analysis) || {};
                this.chartData.notes = window.ChartPolicy.finalizePlayableChartPipeline(this.chartData.notes, {
                    circleSize: this.circleSize,
                    openingSeconds: 12,
                    sustainedCooldownSec: 1.6,
                    holdCooldownSec: 2.6,
                    minFirst30: 12,
                    minPer10: 3,
                    maxTapRatio: 0.45,
                    minLatterSpecialRatio: 0.4,
                    beats: Array.isArray(analysisMeta.beats) ? analysisMeta.beats : [],
                    downbeats: Array.isArray(analysisMeta.downbeats) ? analysisMeta.downbeats : [],
                    segments: Array.isArray(analysisMeta.segments) ? analysisMeta.segments : []
                });
            } else {
                this.applyMechanicQuotas(this.chartData.notes);
                this.enforceChartPlayability(this.chartData.notes);
                if (window.ChartPolicy?.resolvePathConflicts) {
                    this.chartData.notes = window.ChartPolicy.resolvePathConflicts(this.chartData.notes, this.circleSize);
                }
            }
            // ── Lane shuffle: randomise laneHint within each phrase group ──
            // This makes the same song feel different each play-through while
            // preserving rhythmic structure (timing / mechanics / segments untouched).
            (function shuffleLanes(notes) {
                const LANES = 4;
                // Group note indices by phrase
                const phraseMap = {};
                notes.forEach((n, i) => {
                    const key = String(n.phrase ?? i);
                    if (!phraseMap[key]) phraseMap[key] = [];
                    phraseMap[key].push(i);
                });
                // For each phrase, generate a random lane permutation and apply it
                Object.values(phraseMap).forEach(indices => {
                    if (indices.length < 2) return; // single note — nothing to shuffle
                    // Collect the current lane sequence for this phrase
                    const origLanes = indices.map(i => notes[i].laneHint ?? (i % LANES));
                    // Shuffle with a seeded Knuth/Fisher-Yates using Math.random()
                    const shuffled = origLanes.slice();
                    for (let j = shuffled.length - 1; j > 0; j--) {
                        const k = Math.floor(Math.random() * (j + 1));
                        [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
                    }
                    // Apply shuffled lanes back; also update phraseAnchor consistently
                    indices.forEach((noteIdx, pos) => {
                        notes[noteIdx].laneHint = shuffled[pos];
                        notes[noteIdx].phraseAnchor = shuffled[0]; // anchor = first lane of phrase
                    });
                });
            })(this.chartData.notes);

            const layoutIssues = this.getLayoutAudit(this.chartData.notes.map((n, idx) => ({
                x: this.safeArea.x + (this.safeArea.width / 4) * (((n.laneHint ?? idx % 4) + 0.5)),
                y: this.safeArea.y + this.safeArea.height * ((n.segmentLabel || 'verse') === 'chorus' ? 0.34 : ((n.segmentLabel || 'verse') === 'verse' ? 0.52 : 0.42)),
                endX: Number.isFinite(n.endX) ? n.endX : undefined,
                endY: Number.isFinite(n.endY) ? n.endY : undefined,
                noteType: n.type,

            })));
            this.captureRuntimeDiagnostics('layout-audit', { layoutIssues: layoutIssues.length });
            console.log('Chart timing preview', this.chartData.notes.slice(0, 8).map((n, idx) => ({
                i: idx,
                t: n.time,
                type: n.type,
                seg: n.segmentLabel || 'verse',
                phrase: n.phrase,
                slot: n.groupSlot
            })));
            this.captureRuntimeDiagnostics('chart-normalized', { firstChartTime, desiredLeadIn, leadShift });
            this.setStatusMessage('loading', 'Chart loaded: ' + this.chartData.notes.length + ' notes · first @ ' + this.chartData.notes[0].time + 's');
        }
    }

    async runCountdown() {
        if (this.runOrchestrator?.beginCountdown) this.runOrchestrator.beginCountdown();
        this.setScene('countdown');
        await this.showCountdown(3);
    }

    beginRun() {
        this.isPlaying = true;
        this.captureRuntimeDiagnostics('begin-run', { readyMode: this.readyMode || '-', chartMode: !!this.chartMode, liveMode: !!this.liveMode });
        this.startTime = this.audioContext.currentTime;
        this._liveStartWall = performance.now();
        if (this.runClock?.attachPlayback) this.runClock.attachPlayback(() => this.getLiveCurrentTime());
        if (this.runOrchestrator?.attachPlayback) this.runOrchestrator.attachPlayback();
        this.setRunPhase('playing');
        this.updatePauseUI();

        let dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        if (!this.liveMode) {
            const source = this.audioContext.createBufferSource();
            source.buffer = this.audioBuffer;
            source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            this.analyser.fftSize = 2048;
            dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this._offlineSource = source;
            this._offlinePlayOffset = 0; // seconds into audio when resumed
            source.start(0, 0);
        }
        return dataArray;
    }

    startPlaybackBackend() {
        if (!this.liveMode) return;
        this.captureRuntimeDiagnostics('start-playback-backend');
        try {
            this.startLivePlayback();
        } catch (err) {
            console.error('startLivePlayback failed:', err);
            this.livePlaybackState = 'backend-error';
            this.setStatusMessage('error', 'Playback backend failed: ' + (err?.message || err));
            this.updateHUD();
            throw err;
        }
    }

    async startPlaybackAndWaitUntilPlaying(timeoutMs = 8000) {
        if (!this.liveMode) return;
        if (this.pendingPlaybackStart?.promise) return this.pendingPlaybackStart.promise;

        const token = ++this.playbackStartToken;
        const pending = {};
        pending.token = token;
        pending.promise = new Promise((resolve, reject) => {
            pending.resolve = resolve;
            pending.reject = reject;
            pending.timer = setTimeout(() => {
                if (this.pendingPlaybackStart?.token !== token) return;
                this.rejectPendingPlaybackStart(new Error('Playback did not start in time'), token);
            }, Math.max(1500, Number(timeoutMs) || 8000));
        });
        this.pendingPlaybackStart = pending;

        try {
            this.startPlaybackBackend();
        } catch (err) {
            this.rejectPendingPlaybackStart(err, token);
        }
        return pending.promise;
    }

    clearPendingPlaybackStart(token = null) {
        const pending = this.pendingPlaybackStart;
        if (!pending) return null;
        if (token != null && pending.token !== token) return null;
        if (pending.timer) clearTimeout(pending.timer);
        this.pendingPlaybackStart = null;
        return pending;
    }

    resolvePendingPlaybackStart(token = null) {
        const pending = this.clearPendingPlaybackStart(token);
        if (pending?.resolve) pending.resolve();
    }

    rejectPendingPlaybackStart(err, token = null) {
        const pending = this.clearPendingPlaybackStart(token);
        if (pending?.reject) pending.reject(err || new Error('Playback failed to start'));
    }

    handlePlaybackStartFailure(err) {
        const msg = String(err?.message || err || 'Playback failed to start');
        const autoplayBlocked = /autoplay/i.test(msg) || this.livePlaybackState === 'autoplay-blocked';
        this.rejectPendingPlaybackStart(err);
        this.isPlaying = false;
        this.pauseReason = 'none';
        this.livePlaybackStarted = false;
        this.setRunPhase('ready');
        this.setScene('ready', { force: true, error: msg });
        this.setStatusMessage('error', autoplayBlocked ? 'Autoplay blocked. Click Start again to continue.' : ('Playback failed to start: ' + msg), autoplayBlocked ? 'Browser policy blocked hidden playback before the run could begin.' : 'The chart is still loaded. You can retry Start without re-analyzing.');
        this.syncReadyState();
        this.updatePauseUI();
        this.updateHUD();
    }

    async resumeRunSequence() {
        // Show 3-2-1 countdown WHILE STILL PAUSED so the clock does not advance
        const overlayText = document.getElementById('pauseOverlayText');
        for (const n of [3,2,1]) {
            if (overlayText) overlayText.textContent = 'Resuming in ' + n;
            await new Promise(r => setTimeout(r, 600));
        }

        // Calculate pause duration AFTER countdown — includes countdown time in the pause gap
        const pausedFor = Math.max(0, (performance.now() - (this.pausedAt || performance.now())) / 1000);
        this.pauseAccumulated += pausedFor;

        // NOW resume the orchestrator clock (after countdown, before game loop restarts)
        if (this.runOrchestrator?.resume) this.runOrchestrator.resume({ reason: this.pauseReason || 'resume' });

        this.setRunPhase('playing');
        this.pauseReason = 'none';
        this.resumePlaybackMedia();
        // Offline mode: restart audio from saved offset IMMEDIATELY after countdown
        if (!this.liveMode && this.audioBuffer) {
            const offset = Math.min(this._offlinePlayOffset || 0, this.audioBuffer.duration - 0.05);
            const source = this.audioContext.createBufferSource();
            source.buffer = this.audioBuffer;
            source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            this._offlineSource = source;
            // Ensure AudioContext is running (browser may have suspended it)
            if (this.audioContext.state !== 'running') {
                await this.audioContext.resume().catch(() => {});
            }
            // Recalculate startTime so resolveRunClock() stays accurate
            this.startTime = this.audioContext.currentTime - offset - (this.pauseAccumulated || 0);
            source.start(0, offset);
        }
        this.updatePauseUI();
        this.updateHUD();
        const resumeArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.armGameLoop(resumeArray);
    }
    
    // Pre-analyze the song, identify vocal parts and plan button generation
    async preAnalyzeSong() {
        if (!this.audioBuffer || !this.audioBuffer.duration) {
            this.vocalSections = [];
            this.analyzedSections = [];
            return;
        }
        return new Promise(resolve => {
            // Show analyzing prompt
            // Decay shake
        if (this.juiceShake && this.juiceShake.mag > 0.5) {
            this.juiceShake.mag *= 0.72;
            this.juiceShake.x = (Math.random() * 2 - 1) * this.juiceShake.mag;
            this.juiceShake.y = (Math.random() * 2 - 1) * this.juiceShake.mag;
        } else if (this.juiceShake) {
            this.juiceShake = { x: 0, y: 0, mag: 0 };
        }
        this.ctx.save();
        if (this.juiceShake && this.juiceShake.mag > 0.5) {
            this.ctx.translate(this.juiceShake.x, this.juiceShake.y);
        }
        this.ctx.clearRect(-(Math.abs(this.juiceShake?.x || 0) + 8), -(Math.abs(this.juiceShake?.y || 0) + 8), this.canvas.width + 16, this.canvas.height + 16);
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
            let remaining = Math.max(1, Number(seconds) || 3);

            // Get basic song information for display
            const totalVocalSections = this.vocalSections ? this.vocalSections.length : 'Analyzing';
            const avgButtonsPerGroup = this.vocalSections && this.vocalSections.length > 0 ? 
                Math.round(this.vocalSections.reduce((sum, s) => sum + s.plannedButtonCount, 0) / this.vocalSections.length) : 
                'Analyzing';

            const renderCountdown = (showStart = false) => {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                const panelW = Math.min(620, this.canvas.width * 0.78);
                const panelH = 292;
                const x = this.canvas.width / 2 - panelW / 2;
                const y = this.canvas.height / 2 - panelH / 2;

                this.ctx.fillStyle = 'rgba(6,8,15,.78)';
                this.ctx.beginPath();
                this.ctx.moveTo(x + 18, y);
                this.ctx.lineTo(x + panelW - 24, y);
                this.ctx.lineTo(x + panelW, y + 24);
                this.ctx.lineTo(x + panelW, y + panelH - 18);
                this.ctx.lineTo(x + panelW - 18, y + panelH);
                this.ctx.lineTo(x + 24, y + panelH);
                this.ctx.lineTo(x, y + panelH - 24);
                this.ctx.lineTo(x, y + 18);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.strokeStyle = 'rgba(90,246,255,.28)';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();

                this.ctx.fillStyle = 'rgba(90,246,255,.22)';
                this.ctx.fillRect(x + 24, y + 22, panelW - 48, 4);
                this.ctx.fillStyle = 'rgba(255,79,174,.16)';
                this.ctx.fillRect(x + 42, y + 38, panelW - 84, 2);

                this.ctx.textAlign = 'center';
                this.ctx.fillStyle = 'rgba(255,201,77,.92)';
                this.ctx.font = '700 10px "Press Start 2P", monospace';
                this.ctx.fillText('SYSTEM ARMING', this.canvas.width / 2, y + 52);

                const mainText = showStart ? 'START!' : String(remaining);
                const accent = showStart ? '#ff4fae' : '#5af6ff';
                this.ctx.font = showStart ? '700 54px "Press Start 2P", monospace' : '700 92px "Press Start 2P", monospace';
                for (let i = 0; i < 4; i += 1) {
                    this.ctx.fillStyle = `rgba(255,79,174,${(0.12 - i * 0.02).toFixed(3)})`;
                    this.ctx.fillText(mainText, this.canvas.width / 2 - 18 - i * 8, this.canvas.height / 2 + 8);
                }
                this.ctx.shadowBlur = 24;
                this.ctx.shadowColor = accent;
                this.ctx.fillStyle = accent;
                this.ctx.fillText(mainText, this.canvas.width / 2 + 3, this.canvas.height / 2 + 8);
                this.ctx.shadowBlur = 0;
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillText(mainText, this.canvas.width / 2, this.canvas.height / 2 + 4);

                this.ctx.fillStyle = 'rgba(228,241,248,.88)';
                this.ctx.font = '700 16px Rajdhani';
                this.ctx.fillText(`VOCAL SEGMENTS  ${totalVocalSections}`, this.canvas.width / 2, y + 208);
                this.ctx.fillText(`AVG GROUP LOAD  ${avgButtonsPerGroup}`, this.canvas.width / 2, y + 232);
                this.ctx.fillStyle = 'rgba(228,241,248,.58)';
                this.ctx.font = '700 12px Rajdhani';
                this.ctx.fillText(showStart ? 'Combat shell engaged.' : 'Synchronizing track and gameplay shell...', this.canvas.width / 2, y + 258);
            };

            this.pushCountdownFlash(String(remaining));
            renderCountdown();
            const countdownInterval = setInterval(() => {
                remaining -= 1;
                if (remaining <= 0) {
                    this.pushCountdownFlash('START!', { lifeMs: 900 });
                    // Don't call renderCountdown(true) – that would show a second START! on canvas
                    clearInterval(countdownInterval);
                    setTimeout(resolve, 260);
                    return;
                }
                this.pushCountdownFlash(String(remaining));
                renderCountdown();
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

    syncReadyState() {
        const startButton = document.getElementById('startGame');
        const hasOffline = Boolean(this.audioBuffer && this.readyMode === 'offline');
        const hasLive = Boolean(this.readyMode && (this.liveMode || this.chartMode || this.liveConfig || this.chartData));
        const ready = hasOffline || hasLive;
        const busyStarting = this.gameState === 'starting' || this.gameState === 'awaiting-playback' || Boolean(this.pendingPlaybackStart?.promise);
        if (startButton && !this.isPlaying && !busyStarting) {
            startButton.disabled = !ready;
        } else if (startButton && busyStarting) {
            startButton.disabled = true;
        }
        this.renderScene();
        return ready;
    }

    updateHUD() {
        this.refreshGroupState();
        const scoreNode = document.getElementById('scoreValue');
        const debugStrip = document.getElementById('debugStrip');
        const debugGameClock = document.getElementById('debugGameClock');
        const debugPlayerClock = document.getElementById('debugPlayerClock');
        const debugChartProgress = document.getElementById('debugChartProgress');
        const debugActiveNotes = document.getElementById('debugActiveNotes');
        const debugGroupState = document.getElementById('debugGroupState');
        const debugPlaybackState = document.getElementById('debugPlaybackState');
        const debugDiagState = document.getElementById('debugDiagState');
        const debugReviewScore = document.getElementById('debugReviewScore');
        const debugReviewState = document.getElementById('debugReviewState');
        const debugReviewScoreWrap = document.getElementById('debugReviewScoreWrap');
        const debugReviewStateWrap = document.getElementById('debugReviewStateWrap');
        const comboNode = document.getElementById('comboValue');
        const modeNode = document.getElementById('hudMode');
        const diffNode = document.getElementById('hudDifficulty');
        const accNode = document.getElementById('hudAccuracy');
        const runStateNode = document.getElementById('hudRunState');
        const runStateWrap = document.getElementById('runState');
        const meterFill = document.getElementById('scoreMeterFill');
        const legacyScore = document.getElementById('score');
        const difficultySelect = document.getElementById('difficultySelect');

        const total = this.judgementStats.perfect + this.judgementStats.good + this.judgementStats.miss;
        const accuracy = total ? ((this.judgementStats.perfect + this.judgementStats.good * 0.6) / total) * 100 : null;
        const combo = Math.max(0, Math.floor(this.combo || 0));
        const score = Math.max(0, Math.floor(this.score || 0));
        const difficulty = String((this.liveConfig && this.liveConfig.difficulty) || difficultySelect?.value || 'normal').toUpperCase();
        const mode = String(this.playMode || (this.liveConfig && this.liveConfig.playMode) || 'casual').toUpperCase();
        let runState = 'IDLE';
        let runStateAttr = 'idle';
        if (this.runInvalid) {
            runState = 'INVALID';
            runStateAttr = 'invalid';
        } else if (this.isPausedPhase()) {
            runState = 'PAUSED';
            runStateAttr = 'paused';
        } else if (this.gameState === 'awaiting-playback') {
            runState = 'SYNC';
            runStateAttr = 'arming';
        } else if (this.isStartingPhase()) {
            runState = 'ARMING';
            runStateAttr = 'arming';
        } else if (this.isRunningPhase()) {
            runState = 'LIVE';
            runStateAttr = 'live';
        } else if (this.gameState === 'ready') {
            runState = 'READY';
            runStateAttr = 'ready';
        }

        if (scoreNode) scoreNode.textContent = String(score).padStart(6, '0');
        if (comboNode) comboNode.textContent = `${combo}x`;
        if (modeNode) modeNode.textContent = mode;
        if (diffNode) diffNode.textContent = difficulty;
        if (accNode) accNode.textContent = accuracy == null ? '--' : `${accuracy.toFixed(1)}%`;
        if (runStateNode) runStateNode.textContent = runState;
        if (runStateWrap) runStateWrap.dataset.state = runStateAttr;
        if (meterFill) meterFill.style.width = `${Math.max(12, Math.min(100, (accuracy == null ? 0.12 : accuracy / 100) * 100))}%`;
        if (legacyScore) legacyScore.setAttribute('data-run-state', runStateAttr);
        if (debugStrip) debugStrip.classList.toggle('hidden', !this.isPlaying && this.gameState === 'idle');
        if (debugGameClock) debugGameClock.textContent = this.resolveChartClock().toFixed(2);
        if (debugPlayerClock) debugPlayerClock.textContent = this.resolvePlayerClock().toFixed(2);
        if (debugChartProgress) {
            const progress = this.chartRuntime?.getProgress ? this.chartRuntime.getProgress() : { nextIndex: this.nextChartIndex, total: this.chartData?.notes?.length || 0 };
            debugChartProgress.textContent = `${progress.nextIndex}/${progress.total || 0}`;
        }
        if (debugActiveNotes) debugActiveNotes.textContent = String((this.notes || []).filter(n => !n.hit && !n.completed).length);
        if (debugGroupState) {
            const active = this.activeGroupState;
            debugGroupState.textContent = active ? `${active.pattern}:${active.size}` : '--';
        }
        if (debugPlaybackState) {
            const mode = this.liveMode ? (this.livePlaybackState || 'idle') : 'offline';
            const phase = this.gameState || 'idle';
            const orch = this.runOrchestrator?.phase || '-';
            const clockMode = this.runClock?.mode || '-';
            debugPlaybackState.textContent = `${this.scene || 'input'}:${phase}:${mode}:${orch}:${clockMode}/${this.spawnedChartNotes || 0}`;
        }
        if (debugDiagState) {
            const p = this.chartRuntime?.getProgress ? this.chartRuntime.getProgress() : { nextIndex: this.nextChartIndex || 0, total: this.chartData?.notes?.length || 0, spawnedCount: this.spawnedChartNotes || 0 };
            const diag = this.diagnostics || {};
            debugDiagState.textContent = `${diag.lastDiag || '-'}:rt${Number(diag.lastRunTime || 0).toFixed(1)}:pt${Number(diag.lastPlayerTime || 0).toFixed(1)}:sp${p.spawnedCount || 0}:ac${diag.lastActiveNotes || 0}`;
        }
        const review = this.diagnostics?.reviewResult?.review || null;
        if (debugReviewScore) {
            if (!review?.scores) debugReviewScore.textContent = '--';
            else {
                const avg = (Number(review.scores.opening || 0) + Number(review.scores.variety || 0) + Number(review.scores.spatialFlow || 0) + Number(review.scores.geometrySurfacing || 0)) / 4;
                debugReviewScore.textContent = `${avg.toFixed(1)}/10`;
            }
        }
        if (debugReviewState) {
            const issueCount = Array.isArray(review?.issues) ? review.issues.length : 0;
            const topArea = review?.issues?.[0]?.area || 'clear';
            debugReviewState.textContent = review ? `${topArea}:${issueCount}` : '--';
        }
        if (debugReviewScoreWrap) {
            debugReviewScoreWrap.classList.toggle('warn', Number(review?.scores?.spatialFlow || 10) < 6 || Number(review?.scores?.geometrySurfacing || 10) < 6);
            debugReviewScoreWrap.classList.toggle('good', !!review && Number(review?.scores?.spatialFlow || 0) >= 7 && Number(review?.scores?.geometrySurfacing || 0) >= 7);
        }
        if (debugReviewStateWrap) {
            debugReviewStateWrap.classList.toggle('warn', Array.isArray(review?.issues) && review.issues.length >= 3);
            debugReviewStateWrap.classList.toggle('good', !!review && Array.isArray(review?.issues) && review.issues.length <= 1);
        }
    }

    gameLoop(dataArray) {
        if (!this.isPlaying) return;
        if (this.isPausedPhase()) {
            this.updatePauseUI();
            return;
        }

        this.captureRuntimeDiagnostics('frame-start');
        try {
            if (!this.liveMode) this.analyser.getByteFrequencyData(dataArray);
            this.advanceChartRuntime();
            this.generateNotes(dataArray);
            this.updateNotes();
            this.drawNotes();
            this.updateVisualEffects();
            this.checkRunCompletion();
            this.updateHUD();
        } catch (err) {
            console.error('gameLoop runtime error:', err);
            this.setStatusMessage('error', 'Runtime error: ' + (err?.message || err));
            this.livePlaybackState = 'runtime-error';
            this.failRun(err?.message || err);
            this.updateHUD();
            return;
        }

        requestAnimationFrame(() => this.gameLoop(dataArray));
    }

    resolveRunClock() {
        return this.computeRunClock();
    }

    captureRuntimeDiagnostics(stage = 'tick', extra = {}) {
        const activeNotes = (this.notes || []).filter(n => !n.hit && !n.completed).length;
        const progress = this.chartRuntime?.getProgress ? this.chartRuntime.getProgress() : { spawnedCount: this.spawnedChartNotes || 0, nextIndex: this.nextChartIndex || 0, total: this.chartData?.notes?.length || 0 };
        this.diagnostics = {
            ...(this.diagnostics || {}),
            lastDiag: stage,
            lastRunTime: this.resolveRunClock(),
            lastPlayerTime: this.resolvePlayerClock(),
            lastActiveNotes: activeNotes,
            lastSpawnedCount: progress.spawnedCount || 0,
            lastChartIndex: progress.nextIndex || 0,
            lastChartTotal: progress.total || 0,
            ...extra
        };
        return this.diagnostics;
    }

    finishRun(reason = 'finished') {
        if (this.gameState === 'finished' || this.gameState === 'failed') return;
        this.isPlaying = false;
        this.pauseReason = 'none';
        this.pausePlaybackMedia();
        if (this.liveMonitorTimer) {
            clearInterval(this.liveMonitorTimer);
            this.liveMonitorTimer = null;
        }
        this.setRunPhase('finished');
        if (this.runOrchestrator?.finish) this.runOrchestrator.finish({ reason });
        const totalNotes = this.chartRuntime?.getProgress ? this.chartRuntime.getProgress().spawnedCount : this.spawnedChartNotes;
        this.setStatusMessage('success', `Run finished · ${reason}`, `spawned ${totalNotes || 0} notes`);
        this.showResultOverlay();
    }

    failRun(error) {
        if (this.gameState === 'failed') return;
        this.isPlaying = false;
        this.pauseReason = 'none';
        this.pausePlaybackMedia();
        if (this.liveMonitorTimer) {
            clearInterval(this.liveMonitorTimer);
            this.liveMonitorTimer = null;
        }
        this.setRunPhase('failed');
        if (this.runOrchestrator?.fail) this.runOrchestrator.fail(error || 'run failed');
        this.setStatusMessage('error', 'Run failed: ' + (error || 'unknown error'));
    }

    checkRunCompletion() {
        if (!this.isPlaying || this.isPausedPhase()) return false;
        if (!this.runCompletion?.shouldFinish) return false;
        const result = this.runCompletion.shouldFinish();
        if (!result?.done) return false;
        this.captureRuntimeDiagnostics('finish-check', { finishReason: result.reason || 'finished' });
        this.finishRun(result.reason || 'finished');
        return true;
    }

    handlePlaybackMonitorEvent(event, meta = {}) {
        if (!event) return;
        if (event === 'seek-back') {
            this.runInvalid = true;
            this.playbackViolations.push({ type: 'seek-back', at: Date.now(), ...meta });
            if (this.playMode === 'strict') this.pauseGame('invalid-strict');
            return;
        }
        if (event === 'yt-paused') {
            this.playbackViolations.push({ type: 'paused', at: Date.now(), ...meta });
            if (this.playMode === 'strict') {
                this.runInvalid = true;
                this.pauseGame('invalid-strict');
            } else {
                this.pauseGame('system-yt-paused');
            }
            return;
        }
        if (event === 'stalled') {
            this.playbackViolations.push({ type: 'stalled', at: Date.now(), ...meta });
            this.pauseGame('system-stalled');
            return;
        }
        if (event === 'healthy') {
            this.lastPlaybackHealthyAt = Date.now();
        }
    }

    resolvePlayerClock() {
        return this.liveMode ? this.getLiveCurrentTime() : this.resolveRunClock();
    }

    resolveChartClock() {
        if (this.liveMode && !this.livePlaybackStarted) return 0;
        return this.resolveRunClock();
    }

    advanceChartRuntime() {
        if (!(this.chartMode && this.chartData?.notes?.length)) return 0;
        const chartTime = this.resolveChartClock();
        if (this.liveMode) this.applySegmentProfile(chartTime);
        if (this.chartRuntime?.spawnUntil) {
            const visibleSustainedCount = (this.notes || []).filter(n => !n.hit && !n.completed && ['drag','spin'].includes(n.noteType || n.type)).length;
            const tuning = this.runtimeTuning || {};
            const spawned = this.chartRuntime.spawnUntil(chartTime, (currentTime, chartNote, chartIndex) => this.createChartNoteFromData(currentTime, chartNote, chartIndex), {
                openingRampSec: tuning.openingCalmWindowSec ? Math.max(2.8, Number(tuning.openingCalmWindowSec) + 0.4) : 2.8,
                visibleSustainedCap: chartTime < (tuning.openingHeavyStartSec || 3.2) ? 1 : 2,
                visibleSustainedCount
            });
            if (spawned?.length) {
                this.notes.push(...spawned);
                this.spawnedChartNotes += spawned.length;
                const activeNotes = this.notes.filter(n => !n.hit && !n.completed);
                const chartShapeAudit = window.ChartPolicy?.auditChartShape ? window.ChartPolicy.auditChartShape(activeNotes) : null;
                const reviewerDiagnostics = {
                    lastChartSpawnAt: chartTime,
                    lastChartSpawnCount: spawned.length,
                    lastSpawnedCount: this.spawnedChartNotes,
                    chartShapeAudit
                };
                const reviewerRequest = window.ChartReviewer?.buildReviewerRequest
                    ? window.ChartReviewer.buildReviewerRequest({ notes: activeNotes }, reviewerDiagnostics)
                    : null;
                this.captureRuntimeDiagnostics('chart-spawn', {
                    ...reviewerDiagnostics,
                    reviewerRequest
                });
                const nowMs = performance.now();
                const shouldReview = !!window.ChartReviewer?.requestReview
                    && !!reviewerRequest
                    && !this.reviewRequestInFlight
                    && activeNotes.length >= 8
                    && (!this.lastReviewerAtMs || nowMs - this.lastReviewerAtMs > 2200);
                if (shouldReview) {
                    this.reviewRequestInFlight = true;
                    const apiBase = `${window.location.protocol}//${window.location.hostname}:8787`;
                    window.ChartReviewer.requestReview(apiBase, { notes: activeNotes }, reviewerDiagnostics)
                        .then((reviewResult) => {
                            this.lastReviewerAtMs = performance.now();
                            const tuningPatch = window.ChartReviewer?.deriveTuningPatch ? window.ChartReviewer.deriveTuningPatch(reviewResult) : null;
                            if (tuningPatch && Object.keys(tuningPatch).length) {
                                this.runtimeTuning = { ...(this.runtimeTuning || {}), ...tuningPatch };
                            }
                            this.captureRuntimeDiagnostics('chart-review', { reviewResult, tuningPatch: this.runtimeTuning || tuningPatch || null });
                            this.updateHUD();
                        })
                        .catch((err) => {
                            this.lastReviewerAtMs = performance.now();
                            this.captureRuntimeDiagnostics('chart-review-error', { reviewError: err?.message || String(err) });
                        })
                        .finally(() => {
                            this.reviewRequestInFlight = false;
                        });
                }
            }
            this.nextChartIndex = this.chartRuntime.getProgress().nextIndex;
            return spawned.length;
        }
        return this.spawnChartNotesUpTo(chartTime);
    }

    generateNotes(audioData) {
        const currentTime = this.resolveChartClock();

        if (this.chartMode && this.chartData?.notes?.length) {
            return;
        }

        // Link-play rhythm generation: time-grid based (no download/analyze required)
        if (this.liveMode) {
            this.applySegmentProfile(currentTime);
            this.generateLiveGridNotes(currentTime);
            return;
        }
        
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
                const currentTime = this.resolveChartClock();
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
            
            const currentTime = this.resolveChartClock();
            if (beatEnergy > this.energyThreshold && currentTime - this.lastNoteTime >= this.minBeatInterval) {
                this.beatDetected = true;
                return { beat: true, vocal: vocalDetected, energy: Math.max(beatEnergy, vocalEnergy) };
            }
        }
        
        this.beatDetected = false;
        return { beat: false, vocal: vocalDetected, energy: Math.max(beatEnergy, vocalEnergy) };
    }

    updateNotes = () => {
        const currentTime = this.resolveChartClock();
        
        this.notes = this.notes.filter(note => {
            if (note.hit && !note.score) {
                if (note.groupKey) this.registerGroupCompletion(note.groupKey, note);
                return false;
            }

            if ((note.isDrag || note.noteType === 'drag' && note.pathVariant === 'starTrace') && note.completed) {
                if (note.score && (currentTime - note.hitTime > 1)) {
                    return false;
                }
                return true;
            }


            if (note.isSpin && note.held && !note.completed) {
                const progress = Math.max(0, Math.min(1, (currentTime - (note.spinStartedAt || currentTime)) / Math.max(0.5, note.spinDuration || 2.2)));
                if (progress >= 1) {
                    note.completed = true;
                    note.hit = true;
                    note.score = (note.spinAccum || 0) >= Math.PI * 7 ? 'perfect' : ((note.spinAccum || 0) >= Math.PI * 4.5 ? 'good' : 'miss');
                    if (note.score === 'miss') {
                        this.combo = 0;
                        this.recordJudgement('miss');
                    } else {
                        this.score += (note.score === 'perfect' ? 1600 : 900) * (1 + this.combo * 0.1);
                        this.recordJudgement(note.score);
                        this.combo++;
                        this.createHitEffect(note.x, note.y, note.score);
                    }
                    if (this.currentSpinNote === note) this.currentSpinNote = null;
                    return true;
                }
            }
            
            if (!note.hit && !note.held && currentTime > note.hitTime + this.goodRange / 1000) {
                note.hit = true;
                note.score = 'miss';
                this.combo = 0;
                this.recordJudgement('miss', note.x, note.y);
                return true;
            }
            
            if ((note.isDrag || note.noteType === 'drag' && note.pathVariant === 'starTrace') && note.held && !note.completed && currentTime > note.hitTime + 5) {
                note.hit = true;
                note.held = false;
                note.completed = true;
                note.score = 'miss';
                this.combo = 0;
                this.recordJudgement('miss');
                this.currentDragNote = null;
                return true;
            }

            
            return true;
        });
    }

    drawNotes = () => {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const pulseNow = this.resolveChartClock();
        const bgPulse = 0.08 + (0.04 * (0.5 + 0.5 * Math.sin(pulseNow * 2.4)));
        const bgGrad = this.ctx.createRadialGradient(this.canvas.width / 2, this.canvas.height * 0.58, this.circleSize * 1.5, this.canvas.width / 2, this.canvas.height * 0.58, Math.max(this.canvas.width, this.canvas.height) * 0.6);
        bgGrad.addColorStop(0, `rgba(84,241,255,${bgPulse.toFixed(3)})`);
        bgGrad.addColorStop(0.45, `rgba(198,163,255,${(bgPulse * 0.45).toFixed(3)})`);
        bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
        this.ctx.fillStyle = bgGrad;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
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

        this.drawEnergyBurst();

        // Draw notes and circles
        this.notes.forEach(note => {
            if (note.hit && !note.score) return;

            const currentTime = this.resolveChartClock();
            const timeUntilHit = note.hitTime - currentTime;
            const approachProfiles = {
                click: { lead: 0.72, size: 0.84 },
                tap: { lead: 0.72, size: 0.84 },
                drag: { lead: 0.8, size: 0.88 },
                spin: { lead: 0.78, size: 0.86 }
            };
            const profile = approachProfiles[note.noteType || 'click'] || approachProfiles.click || approachProfiles.tap;
            const visualApproachSec = (this.visualApproachDurationMs / 1000) * profile.lead;
            note.approachProgress = Math.max(0, Math.min(1, 1 - timeUntilHit / Math.max(0.18, visualApproachSec)));
            const palette = this.getNotePalette(note);
            const spawnPop = Math.min(1, Math.max(0, (performance.now() - ((note.spawnedAtWall || performance.now()) || performance.now())) / 220));
            const spawnFlash = 1 - spawnPop;
            const popScale = 0.82 + 0.18 * spawnPop;
            const tighten = timeUntilHit <= 0.15 ? 1 + (0.15 - Math.max(0, timeUntilHit)) * 1.1 : 1;
            const bodyPulse = 1 + Math.sin(performance.now() / 150 + (note.noteNumber || 0)) * 0.034 * Math.max(0, note.approachProgress - 0.2);
            const dangerPulse = timeUntilHit <= 0.22 ? (0.22 - Math.max(0, timeUntilHit)) / 0.22 : 0;

            // Draw contracting pixel shell
            if (!note.hit) {
                const approachSize = Math.max(
                    this.circleSize,
                    this.approachCircleSize * profile.size * (1 - note.approachProgress) + this.circleSize
                );
                if (approachSize > this.circleSize) {
                    const shell = approachSize * 1.02;
                    const rotateT = Math.max(0, Math.min(1, note.approachProgress || 0));
                    const shellRotation = (-Math.PI / 2) + (Math.PI / 2) * rotateT;
                    this.ctx.save();
                    this.ctx.translate(note.x, note.y);
                    this.ctx.rotate(shellRotation);
                    const shellAlpha = 0.28 + (1 - rotateT) * 0.18 + dangerPulse * 0.18;
                    const shellColorMix = Math.min(1, Math.max(0, rotateT * 1.08 + dangerPulse * 0.45));
                    const shellR = Math.round(255 * shellColorMix + 90 * (1 - shellColorMix));
                    const shellG = Math.round(246 * shellColorMix + 246 * (1 - shellColorMix));
                    const shellB = Math.round(255 * shellColorMix + 255 * (1 - shellColorMix));
                    this.ctx.strokeStyle = `rgba(${shellR},${shellG},${shellB},${Math.min(0.92, shellAlpha).toFixed(3)})`;
                    this.ctx.lineWidth = note.isDrag ? 4.8 : 3.8;
                    this.ctx.shadowBlur = 28;
                    this.ctx.shadowColor = `rgba(${shellR},${shellG},${shellB},0.72)`;
                    {
                        const size = shell * 1.38;
                        const hf = size / 2;
                        const arm = Math.max(8, size * 0.22);
                        const th = 3;
                        const alpha = Math.min(0.94, shellAlpha * (0.78 + 0.22 * Math.sin(performance.now() / 240)));
                        this.ctx.fillStyle = `rgba(${shellR},${shellG},${shellB},${alpha.toFixed(3)})`;
                        this.ctx.fillRect(-hf, -hf, arm, th);
                        this.ctx.fillRect(-hf, -hf, th, arm);
                        this.ctx.fillRect(hf - arm, -hf, arm, th);
                        this.ctx.fillRect(hf - th, -hf, th, arm);
                        this.ctx.fillRect(-hf, hf - th, arm, th);
                        this.ctx.fillRect(-hf, hf - arm, th, arm);
                        this.ctx.fillRect(hf - arm, hf - th, arm, th);
                        this.ctx.fillRect(hf - th, hf - arm, th, arm);

                        this.ctx.fillStyle = `rgba(255,96,182,${Math.min(0.62, 0.16 + alpha * (0.28 + rotateT * 0.42)).toFixed(3)})`;
                        const inner = size * 0.74;
                        const ih = inner / 2;
                        this.ctx.fillRect(-ih, -ih, Math.max(6, inner * 0.14), 2);
                        this.ctx.fillRect(-ih, -ih, 2, Math.max(6, inner * 0.14));
                        this.ctx.fillRect(ih - Math.max(6, inner * 0.14), -ih, Math.max(6, inner * 0.14), 2);
                        this.ctx.fillRect(ih - 2, -ih, 2, Math.max(6, inner * 0.14));
                        this.ctx.fillRect(-ih, ih - 2, Math.max(6, inner * 0.14), 2);
                        this.ctx.fillRect(-ih, ih - Math.max(6, inner * 0.14), 2, Math.max(6, inner * 0.14));
                        this.ctx.fillRect(ih - Math.max(6, inner * 0.14), ih - 2, Math.max(6, inner * 0.14), 2);
                        this.ctx.fillRect(ih - 2, ih - Math.max(6, inner * 0.14), 2, Math.max(6, inner * 0.14));
                    }
                    this.ctx.restore();
                }
            }


            if (note.isSpin) {
                const radius = this.circleSize * 1.85;
                this.ctx.beginPath();
                this.ctx.arc(note.x, note.y, radius, 0, Math.PI * 2);
                this.ctx.strokeStyle = 'rgba(255,255,255,0.18)';
                this.ctx.lineWidth = 8;
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.arc(note.x, note.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, (note.spinAccum || 0) / (Math.PI * 7)));
                this.ctx.strokeStyle = palette.edge;
                this.ctx.lineWidth = 10;
                this.ctx.stroke();
            }


            // If it's a drag button, draw the track
            if (note.isDrag) {
                const palette = this.getNotePalette(note);
                const tmpl = note.pathTemplate || note.pathVariant || '';
                const isHeart = tmpl === 'heart';
                const isVortex = tmpl === 'vortex';
                const isGeometry = isHeart || isVortex;

                // Use cached + direction-resolved path if available; fall back to extraPath
                const dragSamples = note._cachedPath?.length
                    ? note._cachedPath
                    : (note.extraPath?.points?.length
                        ? note.extraPath.points
                        : (window.PathTemplates?.samplePathPoints ? window.PathTemplates.samplePathPoints(note, 60) : []));

                const now = performance.now();

                if (dragSamples.length >= 2) {
                    // Build Path2D once per note life; direction-lock happens on first move
                    if (!note._cachedPath2D) {
                        const p = new Path2D();
                        p.moveTo(dragSamples[0].x, dragSamples[0].y);
                        for (let i = 1; i < dragSamples.length; i++) p.lineTo(dragSamples[i].x, dragSamples[i].y);
                        if (isHeart) p.closePath();
                        note._cachedPath2D = p;
                    }
                    const trackPath = note._cachedPath2D;

                    this.ctx.save();
                    this.ctx.lineCap = 'round';
                    this.ctx.lineJoin = 'round';

                    // ── Outer glow (one layer only to save GPU) ──
                    this.ctx.strokeStyle = palette.edge;
                    this.ctx.lineWidth = this.circleSize * 0.38;
                    this.ctx.globalAlpha = 0.09;
                    this.ctx.stroke(trackPath);
                    this.ctx.globalAlpha = 1;

                    // ── Core neon line ──
                    this.ctx.strokeStyle = palette.edge;
                    this.ctx.lineWidth = this.circleSize * 0.10;
                    this.ctx.shadowBlur = 18;
                    this.ctx.shadowColor = palette.edge;
                    this.ctx.stroke(trackPath);
                    this.ctx.shadowBlur = 0;

                    // ── White hot center ──
                    this.ctx.strokeStyle = '#ffffff';
                    this.ctx.lineWidth = this.circleSize * 0.032;
                    this.ctx.globalAlpha = 0.50;
                    this.ctx.stroke(trackPath);
                    this.ctx.globalAlpha = 1;

                    // ── Sparkle dots (reduced count, no per-dot shadowBlur) ──
                    const sparkleCount = isGeometry ? 16 : 10;
                    const step = Math.max(1, Math.floor(dragSamples.length / sparkleCount));
                    for (let pi = 0; pi < dragSamples.length; pi += step) {
                        const pt = dragSamples[pi];
                        if (!pt) continue;
                        const seed = (pi * 173 + (note.noteNumber || 0) * 37) % 1000;
                        const drift = Math.sin(now / 700 + seed * 0.09) * 5;
                        const driftY = Math.cos(now / 550 + seed * 0.11) * 4;
                        const alpha = 0.3 + Math.sin(now / 380 + seed * 0.2) * 0.2;
                        const size = 2 + (seed % 3);
                        this.ctx.fillStyle = seed % 4 === 0 ? '#ffffff' : palette.edge;
                        this.ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                        this.ctx.fillRect(Math.round(pt.x + drift - size / 2), Math.round(pt.y + driftY - size / 2), size, size);
                    }
                    this.ctx.globalAlpha = 1;
                    this.ctx.restore();
                }

                // ── While held: bright progress trail + jet exhaust ──
                if (note.held) {
                    const fullPath = note._cachedPath || (window.PathTemplates?.samplePathPoints ? window.PathTemplates.samplePathPoints(note, 80) : []);
                    const progressIndex = Math.min(fullPath.length - 1, Math.floor(note.progress * Math.max(1, fullPath.length - 1)));
                    const currentX = fullPath[progressIndex]?.x ?? note.x;
                    const currentY = fullPath[progressIndex]?.y ?? note.y;

                    // Bright completed-portion overlay
                    if (fullPath.length > 1) {
                        this.ctx.save();
                        this.ctx.beginPath();
                        this.ctx.moveTo(fullPath[0].x, fullPath[0].y);
                        for (let i = 1; i <= progressIndex; i++) this.ctx.lineTo(fullPath[i].x, fullPath[i].y);
                        this.ctx.strokeStyle = '#ffffff';
                        this.ctx.lineWidth = this.circleSize * 0.13;
                        this.ctx.lineCap = 'round';
                        this.ctx.lineJoin = 'round';
                        this.ctx.shadowBlur = 14;
                        this.ctx.shadowColor = palette.edge;
                        this.ctx.globalAlpha = 0.75;
                        this.ctx.stroke();
                        this.ctx.shadowBlur = 0;
                        this.ctx.globalAlpha = 1;
                        this.ctx.restore();
                    }

                    // ── Jet exhaust: dense continuous spray behind cursor ──
                    if (progressIndex >= 1) {
                        const prev = fullPath[Math.max(0, progressIndex - 3)] || fullPath[0];
                        const baseAngle = Math.atan2(prev.y - currentY, prev.x - currentX);
                        const isHeartTmpl = (note.pathTemplate === 'heart');
                        const jetCount = isHeartTmpl ? (10 + Math.floor(Math.random() * 6)) : (7 + Math.floor(Math.random() * 5));
                        const heartCols = ['#ffffff', '#ff5fa0', '#ffaacc', '#ffe0f0', palette.edge];
                        const vortexCols = ['#ffffff', '#a560ff', '#d4a0ff', '#59efff', palette.edge];
                        const cols = isHeartTmpl ? heartCols : vortexCols;
                        for (let ji = 0; ji < jetCount; ji++) {
                            const spread = (Math.random() - 0.5) * Math.PI * 0.65;
                            const spd = 1.5 + Math.random() * 5.5;
                            const life = 140 + Math.random() * 260;
                            (this.juiceParticles = this.juiceParticles || []).push({
                                x: currentX + (Math.random() - 0.5) * 4,
                                y: currentY + (Math.random() - 0.5) * 4,
                                vx: Math.cos(baseAngle + spread) * spd,
                                vy: Math.sin(baseAngle + spread) * spd,
                                life, lifeMax: life,
                                size: 1.5 + Math.random() * 4,
                                color: cols[Math.floor(Math.random() * cols.length)],
                                at: performance.now()
                            });
                        }
                        // extra side sparkles perpendicular to direction
                        for (let si = 0; si < 3; si++) {
                            const sideAngle = baseAngle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1) + (Math.random() - 0.5) * 0.4;
                            (this.juiceParticles = this.juiceParticles || []).push({
                                x: currentX, y: currentY,
                                vx: Math.cos(sideAngle) * (1 + Math.random() * 2.5),
                                vy: Math.sin(sideAngle) * (1 + Math.random() * 2.5),
                                life: 100 + Math.random() * 120, lifeMax: 220,
                                size: 2 + Math.random() * 2,
                                color: '#ffffff',
                                at: performance.now()
                            });
                        }
                    }

                    // Cursor orb — bright pulsing circle
                    const cursorR = this.circleSize * (0.44 + Math.sin(now / 130) * 0.07);
                    this.ctx.save();
                    this.ctx.beginPath();
                    this.ctx.arc(currentX, currentY, cursorR, 0, Math.PI * 2);
                    const grad = this.ctx.createRadialGradient(currentX, currentY, 2, currentX, currentY, cursorR);
                    grad.addColorStop(0, '#ffffff');
                    grad.addColorStop(0.4, palette.core);
                    grad.addColorStop(1, 'rgba(255,255,255,0)');
                    this.ctx.fillStyle = grad;
                    this.ctx.shadowBlur = 18;
                    this.ctx.shadowColor = palette.edge;
                    this.ctx.fill();
                    this.ctx.shadowBlur = 0;
                    // outer ring
                    this.ctx.beginPath();
                    this.ctx.arc(currentX, currentY, cursorR * 1.55, 0, Math.PI * 2);
                    this.ctx.strokeStyle = palette.edge;
                    this.ctx.lineWidth = 2;
                    this.ctx.globalAlpha = 0.4 + Math.sin(now / 200) * 0.2;
                    this.ctx.stroke();
                    this.ctx.globalAlpha = 1;
                    this.ctx.restore();

                    // Milestone bursts at 25% / 50% / 75%
                    if (!note._milestonesFired) note._milestonesFired = {};
                    for (const ms of [0.25, 0.5, 0.75]) {
                        if (note.progress >= ms && !note._milestonesFired[ms]) {
                            note._milestonesFired[ms] = true;
                            for (let mi = 0; mi < 8; mi++) {
                                const ang = Math.random() * Math.PI * 2;
                                const spd = 2.8 + Math.random() * 4;
                                (this.juiceParticles = this.juiceParticles || []).push({
                                    x: currentX, y: currentY,
                                    vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                                    life: 320, lifeMax: 320,
                                    size: 3 + Math.random() * 4,
                                    color: ms >= 0.75 ? '#ffe95a' : (isHeart ? palette.edge : '#59efff'),
                                    at: performance.now()
                                });
                            }
                            if (this.juiceShake) this.juiceShake.mag = Math.max(this.juiceShake.mag || 0, 3.5);
                        }
                    }
                }

                // Endpoint dot
                if (!isHeart) {
                    this.ctx.save();
                    this.ctx.beginPath();
                    this.ctx.arc(note.endX, note.endY, this.circleSize * 0.40, 0, Math.PI * 2);
                    this.ctx.fillStyle = note.completed ? palette.core : 'rgba(255,255,255,.10)';
                    this.ctx.fill();
                    this.ctx.strokeStyle = palette.edge;
                    this.ctx.lineWidth = 2.5;
                    this.ctx.shadowBlur = 10;
                    this.ctx.shadowColor = palette.edge;
                    this.ctx.stroke();
                    this.ctx.shadowBlur = 0;
                    this.ctx.restore();
                }
            }
            
            // ── 8bit pixel tap (light) ──────────────────────────────────────
            const bodySize = Math.round(this.circleSize * 0.82 * popScale * tighten * bodyPulse);
            const bodyX = Math.round(note.x - bodySize * 0.5);
            const bodyY = Math.round(note.y - bodySize * 0.5);
            const bodyW = bodySize;
            const bodyH = bodySize;
            const pw = Math.max(2, Math.round(bodyW / 16));
            this.ctx.save();
            this.ctx.imageSmoothingEnabled = false;
            // dark fill - semi-transparent
            this.ctx.fillStyle = 'rgba(4,12,20,.72)';
            this.ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
            // neon border
            const bAlpha = 0.70 + dangerPulse * 0.28 + spawnFlash * 0.18;
            this.ctx.fillStyle = palette.edge;
            this.ctx.globalAlpha = bAlpha;
            this.ctx.fillRect(bodyX, bodyY, bodyW, pw);
            this.ctx.fillRect(bodyX, bodyY + bodyH - pw, bodyW, pw);
            this.ctx.fillRect(bodyX, bodyY, pw, bodyH);
            this.ctx.fillRect(bodyX + bodyW - pw, bodyY, pw, bodyH);
            this.ctx.globalAlpha = 1;
            // tiny inner glow
            this.ctx.fillStyle = palette.glow.replace('.38', '.06').replace('.42', '.06').replace('.4', '.06');
            this.ctx.fillRect(bodyX + pw * 2, bodyY + pw * 2, bodyW - pw * 4, bodyH - pw * 4);
            // danger pulse extra ring
            if (dangerPulse > 0.02) {
                this.ctx.fillStyle = palette.edge;
                this.ctx.globalAlpha = dangerPulse * 0.5;
                this.ctx.fillRect(bodyX - pw * 2, bodyY - pw * 2, bodyW + pw * 4, pw);
                this.ctx.fillRect(bodyX - pw * 2, bodyY + bodyH + pw, bodyW + pw * 4, pw);
                this.ctx.fillRect(bodyX - pw * 2, bodyY - pw * 2, pw, bodyH + pw * 4);
                this.ctx.fillRect(bodyX + bodyW + pw, bodyY - pw * 2, pw, bodyH + pw * 4);
                this.ctx.globalAlpha = 1;
            }
            this.ctx.restore();

            // Show sequence number / tutorial prompt in circle and draw lines between adjacent numbers
            if (!note.hit) {
                // If there is a previous note and they have consecutive numbers, draw a connecting line

                // Display tutorial prompt for first encounters, then compact marker
                this.ctx.fillStyle = '#f3fcff';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                const tutorialLimit = note.noteType === 'click' ? 2 : 3;
                const seenCount = this.tutorialSeenCounts?.[note.noteType || 'click'] || 0;
                const tutorialLabel = window.ChartPolicy?.tutorialLabelForType ? window.ChartPolicy.tutorialLabelForType(note.noteType || 'click', note) : String(note.noteType || 'click').toUpperCase();
                const marker = ''; // no number labels on notes
                // Keyboard notes always show their key — no tutorial limit
                const isKbd = note.inputChannel === 'keyboard' && (note.keyHint || note.keyboardHint);
                if (isKbd || seenCount < tutorialLimit || (note.keyboardCheckpoint && !note.keyboardHit)) {
                    // Tutorial label CENTERED on note
                    const displayLabel = note.keyboardCheckpoint && !note.keyboardHit
                        ? String(note.keyboardHint || note.keyboardHint || note.keyHint || 'SPACE').toUpperCase()
                        : isKbd
                            ? String(note.keyboardHint || note.keyHint || 'SPACE').toUpperCase()
                            : tutorialLabel;
                    const labelA = Math.min(1, 0.4 + note.approachProgress * 0.9);
                    const fs = Math.max(11, Math.round(bodySize * 0.36));
                    this.ctx.save();
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'middle';
                    this.ctx.globalAlpha = labelA;
                    this.ctx.font = `900 ${fs}px "Press Start 2P", monospace`;
                    this.ctx.shadowBlur = 12;
                    this.ctx.shadowColor = palette.edge;
                    this.ctx.fillStyle = 'rgba(4,12,20,.65)';
                    this.ctx.fillText(displayLabel, note.x + 2, note.y + 2);
                    this.ctx.fillStyle = '#ffffff';
                    this.ctx.fillText(displayLabel, note.x, note.y);
                    this.ctx.shadowBlur = 0;
                    this.ctx.globalAlpha = 1;
                    this.ctx.restore();
                }
            }

            if (note.groupRole === 'lead' && note.groupSize > 1 && !note.hit) {
                this.ctx.fillStyle = 'rgba(255, 215, 168, .82)';
                this.ctx.font = '700 11px Rajdhani';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(`${String(note.groupPattern || 'group').toUpperCase()} · ${note.groupSize}`, note.x, note.y - this.circleSize - 16);
            }

            // If there is a score, display the score text
            if (note.score) {
                this.ctx.fillStyle = palette.edge;
                this.ctx.font = '700 18px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(note.score.toUpperCase(), note.x, note.y - 40);
                
                // Remove the note after displaying the score for a period of time
                if (currentTime - note.hitTime > 0.5) {
                    note.hit = true;
                    note.score = null;
                }
            }
        });


        // Draw song progress bar
        this.drawSongProgress();

        this.ctx.restore(); // end shake transform

        // Juice particles
        this.drawJuiceParticles();

        // Draw float judge popups at note positions
        this.drawFloatJudges();

        // Draw glow connection lines between same-group tap notes
        this.drawNoteLinks();

        // Draw combo / mode HUD
        this.drawComboHUD();
        
        // The voice activity indicator is hidden, but the voice detection logic functionality is retained
    }
    handleKeyboardAction = (key) => {
        if (!this.isPlaying || this.isPausedPhase()) return;
        const currentTime = this.resolveChartClock();
        const normalizedKey = String(key || '').toLowerCase();

        let bestCheckpoint = null;
        let bestCheckpointDiff = Infinity;
        let bestNote = null;
        let bestDiff = Infinity;

        for (const note of this.notes) {
            if (note.hit || note.completed) continue;
            if (note.inputChannel === 'mouse') continue;
            const timingDiff = Math.abs(currentTime - note.hitTime) * 1000;
            if (timingDiff > this.goodRange) continue;

            if (note.keyboardCheckpoint && !note.keyboardHit && String(note.keyboardKey || 'space') === normalizedKey) {
                if (timingDiff < bestCheckpointDiff) {
                    bestCheckpoint = note;
                    bestCheckpointDiff = timingDiff;
                }
                continue;
            }

            if (note.inputChannel === 'keyboard' && note.keyHint && String(note.keyboardKey || note.keyHint || '').toLowerCase() === normalizedKey) {
                if (timingDiff < bestDiff) {
                    bestNote = note;
                    bestDiff = timingDiff;
                }
            }
        }

        if (bestCheckpoint) {
            bestCheckpoint.keyboardHit = true;
            bestCheckpoint.keyboardHitTime = currentTime;
            this.pushSignatureBurst(bestCheckpoint.x, bestCheckpoint.y, 'drag');
            this.createHitEffect(bestCheckpoint.x, bestCheckpoint.y, bestCheckpointDiff <= this.perfectRange ? 'perfect' : 'good');
            this.updateHUD();
            return;
        }

        if (bestNote) {
            bestNote.score = bestDiff <= this.perfectRange ? 'perfect' : 'good';
            this.score += (bestNote.score === 'perfect' ? 1000 : 500) * (1 + this.combo * 0.1);
            this.recordJudgement(bestNote.score);
            this.combo++;
            bestNote.hit = true;
            this.createHitEffect(bestNote.x, bestNote.y, bestNote.score);
            this.updateHUD();
        }
    }

    handleInput = (x, y, type) => {
        if (!this.isPlaying) return;
        if (this.isPausedPhase()) {
            this.updatePauseUI();
            return;
        }

        const currentTime = this.resolveChartClock();
        if (type === 'start') {
            this.pointerState = { down: true, x, y, startedAt: performance.now(), startX: x, startY: y };
        } else if (type === 'move') {
            this.pointerState.x = x;
            this.pointerState.y = y;
        } else if (type === 'end') {
            this.pointerState.down = false;
            this.pointerState.x = x;
            this.pointerState.y = y;
        }
        
        if (this.currentSpinNote) {
            const note = this.currentSpinNote;
            if (!note.held || note.hit || note.completed) {
                this.currentSpinNote = null;
            } else {
                if (type === 'move' && note.held) {
                    const angle = Math.atan2(y - note.y, x - note.x);
                    if (note.spinLastAngle != null) {
                        let delta = angle - note.spinLastAngle;
                        while (delta > Math.PI) delta -= Math.PI * 2;
                        while (delta < -Math.PI) delta += Math.PI * 2;
                        note.spinAccum += Math.abs(delta);
                    }
                    note.spinLastAngle = angle;
                }
                if (type === 'end') {
                    note.held = false;
                    this.currentSpinNote = null;
                }
            }
        }

        if (this.currentDragNote) {
            const note = this.currentDragNote;
            // If the drag note is no longer held (timed out / completed), clean up
            // and fall through so other notes can be tapped.
            if (!note.held || note.hit || note.completed) {
                this.currentDragNote = null;
            } else if (note.held) {
                if (type === 'move') {
                    // Build cache if not already done (non-heart notes, or fallback)
                    if (!note._cachedPath) {
                        const rawPts = note.extraPath?.points;
                        if (rawPts && rawPts.length >= 2) {
                            const segs = Math.max(1, rawPts.length - 1);
                            note._cachedPath = rawPts.map((p, i) => ({ x: p.x, y: p.y, t: i / segs }));
                        } else {
                            note._cachedPath = window.PathTemplates?.samplePathPoints ? window.PathTemplates.samplePathPoints(note, 80) : [];
                        }
                    }
                    const curvePoints = note._cachedPath;
                    if (curvePoints && curvePoints.length >= 2) {
                        const curProg = note.progress || 0;
                        const isHeartTrack = note.pathTemplate === 'heart';
                        // Heart tracks need a wider forward search and more forgiveness around
                        // the upper lobes / center notch. Keep the exact same geometry; only
                        // make the tracking logic less brittle.
                        const windowSize = isHeartTrack ? 0.34 : 0.18;
                        const backtrackAllowance = isHeartTrack ? 0.045 : 0.02;
                        const startIdx = Math.floor(Math.max(0, curProg - backtrackAllowance) * (curvePoints.length - 1));
                        const endIdx = Math.ceil(Math.min(1, curProg + windowSize) * (curvePoints.length - 1));
                        let minDist = Infinity;
                        let closestPoint = null;
                        let bestForwardPoint = null;
                        let bestForwardDist = Infinity;
                        for (let ci = startIdx; ci <= endIdx; ci++) {
                            const pt = curvePoints[ci];
                            if (!pt) continue;
                            const dist = Math.hypot(x - pt.x, y - pt.y);
                            if (dist < minDist) { minDist = dist; closestPoint = pt; }
                            if (pt.t >= curProg - backtrackAllowance && dist < bestForwardDist) {
                                bestForwardDist = dist;
                                bestForwardPoint = pt;
                            }
                        }
                        const tolerance = this.circleSize * (isHeartTrack ? 1.75 : 1.2);
                        const chosenPoint = bestForwardPoint || closestPoint;
                        if (chosenPoint && ((bestForwardPoint && bestForwardDist <= tolerance) || minDist <= tolerance)) {
                            // Never snap backwards hard; allow tiny local correction only, while
                            // making forward progress feel continuous instead of sticky.
                            const nextProg = Math.max(curProg - (isHeartTrack ? 0.012 : 0), chosenPoint.t);
                            if (nextProg > curProg || (isHeartTrack && Math.abs(nextProg - curProg) <= 0.012)) {
                                note.progress = Math.max(note.progress || 0, nextProg);
                            }
                        }
                    }
                } else if (type === 'end') {
                    if (note.keyboardCheckpoint && !note.keyboardHit) {
                        note.completed = true;
                        note.hit = true;
                        note.held = false;
                        note.score = 'miss';
                        this.combo = 0;
                        this.recordJudgement('miss');
                        this.currentDragNote = null;
                        this.updateHUD();
                        return;
                    }
                    const finishThreshold = note.extraPath?.points?.length ? 0.84 : 0.9;
                    const goodThreshold = note.extraPath?.points?.length ? 0.64 : 0.7;
                    if (note.progress > finishThreshold) {
                        note.completed = true;
                        note.score = 'perfect';
                        const _tmpl = note.pathTemplate || note.pathVariant || '';
                        const _geomBonus = (_tmpl === 'starTrace' || _tmpl === 'heart' || _tmpl === 'vortex') ? 1850 : 1500;
                        this.score += _geomBonus * (1 + this.combo * 0.1);
                        this.combo++;
                        this.recordJudgement('perfect');
                        this.tutorialSeenCounts[note.noteType || 'click'] = (this.tutorialSeenCounts[note.noteType || 'click'] || 0) + 1;
                        this.createHitEffect(note.endX, note.endY, 'perfect');
                        if (_tmpl === 'starTrace' || _tmpl === 'heart' || _tmpl === 'vortex') this.pushSignatureBurst(note.endX, note.endY, 'ribbon');
                    } else if (note.progress > goodThreshold) {
                        note.completed = true;
                        note.score = 'good';
                        this.score += 800 * (1 + this.combo * 0.1);
                        this.combo++;
                        this.recordJudgement('good');
                        this.tutorialSeenCounts[note.noteType || 'click'] = (this.tutorialSeenCounts[note.noteType || 'click'] || 0) + 1;
                        this.createHitEffect(note.endX, note.endY, 'good');
                    } else {
                        note.completed = true;
                        note.score = 'miss';
                        this.combo = 0;
                        this.recordJudgement('miss');
                    }
                    note.held = false;
                    note.hit = true;
                    note._cachedPath = null;
                    note._milestonesFired = null;
                    this.currentDragNote = null;
                    this.updateHUD();
                }
                return;
            }
        }


        if (type === 'start') {
            let bestSpin = null;
            let bestSpinDiff = Infinity;
            let bestSpinDistance = Infinity;
            let bestDrag = null;
            let bestDragDiff = Infinity;
            let bestDragDistance = Infinity;
            let bestPointerNote = null;
            let bestPointerScore = null;
            let bestPointerDiff = Infinity;
            let bestPointerDistance = Infinity;

            for (const note of this.notes) {
                if (note.hit || note.completed) continue;
                const distance = Math.sqrt((x - note.x) ** 2 + (y - note.y) ** 2);
                const hitRadius = note.isDrag ? this.circleSize * 1.5 : this.circleSize;
                if (distance > hitRadius) continue;
                const timingDiff = Math.abs(currentTime - note.hitTime) * 1000;
                if (timingDiff > this.goodRange) continue;

                if (note.isSpin) {
                    if (note.inputChannel === 'keyboard') continue;
                    if (timingDiff < bestSpinDiff || (timingDiff === bestSpinDiff && distance < bestSpinDistance)) {
                        bestSpin = note;
                        bestSpinDiff = timingDiff;
                        bestSpinDistance = distance;
                    }
                    continue;
                }

                if (note.isDrag) {
                    if (note.inputChannel === 'keyboard') continue;
                    if (timingDiff < bestDragDiff || (timingDiff === bestDragDiff && distance < bestDragDistance)) {
                        bestDrag = note;
                        bestDragDiff = timingDiff;
                        bestDragDistance = distance;
                    }
                    continue;
                }

                if (note.inputChannel === 'keyboard') continue;

                if (timingDiff < bestPointerDiff || (timingDiff === bestPointerDiff && distance < bestPointerDistance)) {
                    bestPointerNote = note;
                    bestPointerDiff = timingDiff;
                    bestPointerDistance = distance;
                    bestPointerScore = timingDiff <= this.perfectRange ? 'perfect' : 'good';
                }
            }

            if (bestSpin) {
                bestSpin.held = true;
                bestSpin.spinStartedAt = currentTime;
                bestSpin.spinLastAngle = Math.atan2(y - bestSpin.y, x - bestSpin.x);
                bestSpin.spinAccum = 0;
                this.currentSpinNote = bestSpin;
                return;
            }

            if (bestDrag) {
                bestDrag.held = true;
                bestDrag.progress = 0;
                bestDrag._cachedPath = null;
                bestDrag._cachedPath2D = null;
                bestDrag._milestonesFired = null;
                if (bestDrag.pathTemplate === 'heart' && bestDrag.extraPath?.points?.length) {
                    const rawPts = bestDrag.extraPath.points;
                    const dx = x - bestDrag.x;
                    const orderedPts = dx > 0 ? rawPts.slice().reverse() : rawPts;
                    const segs = Math.max(1, orderedPts.length - 1);
                    bestDrag._cachedPath = orderedPts.map((p, i) => ({ x: p.x, y: p.y, t: i / segs }));
                }
                this.currentDragNote = bestDrag;
                return;
            }

            if (bestPointerNote) {
                bestPointerNote.score = bestPointerScore;
                this.score += (bestPointerScore === 'perfect' ? 1000 : 500) * (1 + this.combo * 0.1);
                this.recordJudgement(bestPointerScore);
                this.combo++;
                bestPointerNote.hit = true;
                this.tutorialSeenCounts[bestPointerNote.noteType || 'click'] = (this.tutorialSeenCounts[bestPointerNote.noteType || 'click'] || 0) + 1;
                this.createHitEffect(bestPointerNote.x, bestPointerNote.y, bestPointerScore);
                this.updateHUD();
            }
        }

    }

    hitNote = (note) => {
        note.hit = true;
        this.combo++;
        this.score += 100 * (1 + this.combo * 0.1);
        this.updateHUD();

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
        // Juice
        const isPerfect = scoreType === 'perfect';
        const shakeAmt = isPerfect ? 5.5 : 2.5;
        if (!this.juiceShake) this.juiceShake = { x: 0, y: 0, mag: 0 };
        this.juiceShake.mag = Math.max(this.juiceShake.mag, shakeAmt);
        if (isPerfect) {
            this.perfectStreak = (this.perfectStreak || 0) + 1;
            const streakBonus = Math.min(this.perfectStreak, 10);
            for (let i = 0; i < 8 + streakBonus * 2; i++) {
                const ang = Math.random() * Math.PI * 2;
                const spd = 2.5 + Math.random() * 4.5 + streakBonus * 0.4;
                const life = 300 + Math.random() * 220;
                const col = Math.random() < 0.5 ? '#59efff' : (Math.random() < 0.5 ? '#ffffff' : '#ff79ae');
                (this.juiceParticles = this.juiceParticles || []).push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life, lifeMax: life, size: 3 + Math.random() * 3, color: col, at: performance.now() });
            }
        } else if (scoreType !== 'miss') {
            this.perfectStreak = 0;
            for (let i = 0; i < 4; i++) {
                const ang = Math.random() * Math.PI * 2;
                const spd = 1.5 + Math.random() * 2.5;
                (this.juiceParticles = this.juiceParticles || []).push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 240, lifeMax: 240, size: 2 + Math.random() * 2, color: '#ff9bb4', at: performance.now() });
            }
        } else {
            this.perfectStreak = 0;
        }
        const flashSize = isPerfect ? this.circleSize * 2.2 : this.circleSize * 1.4;

        const particles = [];
        const particleCount = scoreType === 'perfect' ? 28 : scoreType === 'good' ? 18 : 12;
        const particleSpeed = scoreType === 'perfect' ? 8.6 : scoreType === 'good' ? 5.6 : 4.2;
        let particleColor;

        switch (scoreType) {
            case 'perfect':
                particleColor = '90,246,255';
                break;
            case 'good':
                particleColor = '255,79,174';
                break;
            case 'miss':
                particleColor = '255,90,107';
                break;
            default:
                particleColor = '255,255,255';
        }
        this.pushBurst(x, y, scoreType);

        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const square = i % 3 === 0;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * particleSpeed * (0.7 + Math.random() * 0.85),
                vy: Math.sin(angle) * particleSpeed * (0.7 + Math.random() * 0.85),
                life: 1,
                size: 2 + Math.random() * 6,
                color: particleColor,
                square,
                spin: (Math.random() - 0.5) * 0.35,
                rot: Math.random() * Math.PI
            });
        }

        const animate = () => {
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.rot += p.spin;
                p.vx *= scoreType === 'perfect' ? 0.975 : 0.982;
                p.vy *= scoreType === 'perfect' ? 0.975 : 0.982;
                p.life -= scoreType === 'miss' ? 0.05 : (scoreType === 'good' ? 0.034 : 0.026);

                if (p.life > 0) {
                    this.ctx.save();
                    this.ctx.translate(p.x, p.y);
                    this.ctx.rotate(p.rot);
                    this.ctx.fillStyle = `rgba(${p.color}, ${Math.max(0, p.life)})`;
                    this.ctx.shadowBlur = 18;
                    this.ctx.shadowColor = `rgba(${p.color}, .52)`;
                    if (p.square) this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                    else {
                        this.ctx.beginPath();
                        this.ctx.arc(0, 0, p.size * 0.46, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    this.ctx.restore();
                    this.ctx.shadowBlur = 0;
                }
            });

            if (particles.some(p => p.life > 0)) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }
}



RhythmGame.prototype.getSegmentPalette = function (segmentLabel, groupIndex) {
    const palettes = this.segmentGroupPalettes || {};
    const fallback = Array.isArray(palettes.verse) && palettes.verse.length
        ? palettes.verse
        : [{ core: '#f5d6ff', edge: '#c89cff', glow: 'rgba(200,156,255,.30)' }];
    const requested = segmentLabel && Array.isArray(palettes[segmentLabel]) && palettes[segmentLabel].length
        ? palettes[segmentLabel]
        : null;
    const arr = requested || fallback;
    const idx = Math.abs(Number(groupIndex || 0)) % arr.length;
    return arr[idx] || arr[0] || fallback[0];
};

RhythmGame.prototype.decoratePaletteForNote = function (base, note) {
    const palette = { ...(base || this.segmentGroupPalettes.verse[0]) };
    const mechanicPalettes = {
        click: { core: '#dffcff', edge: '#59efff', glow: 'rgba(89,239,255,.38)' },
        tap: { core: '#fff0d8', edge: '#ffd166', glow: 'rgba(255,209,102,.38)' },
        drag: { core: '#dffcff', edge: '#59efff', glow: 'rgba(89,239,255,.38)' },
        spin: { core: '#dffcff', edge: '#59efff', glow: 'rgba(89,239,255,.38)' }
    };
    const typeKey = note?.noteType || (note?.isDrag ? 'drag' : 'click');
    const mechanic = mechanicPalettes[typeKey];
    if (mechanic) {
        palette.core = mechanic.core;
        palette.edge = mechanic.edge;
        palette.glow = mechanic.glow;
    }
    if (note && note.isDrag) {
        const tmpl = note.pathTemplate || note.pathVariant || '';
        if (tmpl === 'starTrace') {
            palette.core = '#fff5a0';
            palette.edge = '#ffcc00';
            palette.glow = 'rgba(255,204,0,.52)';
        } else if (tmpl === 'heart') {
            palette.core = '#ffd0e8';
            palette.edge = '#ff5fa0';
            palette.glow = 'rgba(255,95,160,.54)';
        } else if (tmpl === 'vortex') {
            palette.core = '#d8c4ff';
            palette.edge = '#a560ff';
            palette.glow = 'rgba(165,96,255,.52)';
        }
        palette.glow = palette.glow.replace('.42', '.46').replace('.38', '.44').replace('.36', '.42').replace('.34', '.4');
    }
    if (note && note.energy >= 0.95) {
        palette.glow = palette.glow.replace('.44', '.48').replace('.42', '.46').replace('.4', '.44').replace('.38', '.42').replace('.36', '.4').replace('.34', '.38');
    }
    return palette;
};

RhythmGame.prototype.getNotePalette = function (note) {
    if (note.score === 'perfect') return { core: '#d0faff', edge: '#59efff', glow: 'rgba(89,239,255,.45)' };
    if (note.score === 'good') return { core: '#ffd9e5', edge: '#ff9bb4', glow: 'rgba(255,155,180,.4)' };
    if (note.score === 'miss') return { core: '#ff899f', edge: '#ff5f76', glow: 'rgba(255,95,118,.35)' };
    const base = note.groupPalette || this.getSegmentPalette(note.segmentLabel || 'verse', note.groupIndex || note.phrase || 0);
    return this.decoratePaletteForNote(base, note);
};

RhythmGame.prototype.drawJuiceParticles = function () {
    if (!this.juiceParticles || !this.juiceParticles.length) return;
    const now = performance.now();
    this.juiceParticles = this.juiceParticles.filter(pt => now - pt.at < pt.lifeMax);
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const pt of this.juiceParticles) {
        const elapsed = (now - pt.at) / 1000;
        const t = (now - pt.at) / pt.lifeMax;
        const alpha = Math.max(0, 1 - t * 1.4);
        pt.x += pt.vx * 0.85;
        pt.y += pt.vy * 0.85 + elapsed * 6;
        pt.vx *= 0.88;
        pt.vy *= 0.88;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = pt.color;
        const s = Math.max(1, pt.size * (1 - t * 0.5));
        ctx.fillRect(Math.round(pt.x - s / 2), Math.round(pt.y - s / 2), Math.round(s), Math.round(s));
    }
    ctx.globalAlpha = 1;
    ctx.restore();
};

RhythmGame.prototype.drawFloatJudges = function () {
    if (!this.floatJudges) return;
    const now = performance.now();
    this.floatJudges = this.floatJudges.filter(j => now - j.at < j.lifeMs);
    const ctx = this.ctx;

    for (const j of this.floatJudges) {
        const t = (now - j.at) / j.lifeMs;
        const alpha = t < 0.08 ? t / 0.08 : Math.max(0, 1 - (t - 0.08) / 0.92);
        const bounceS = t < 0.10 ? (1 + 0.30 * Math.sin(t / 0.10 * Math.PI)) : 1;
        const rise = t * 55;
        // MISS: at note position; PERFECT/GOOD: centered on screen
        const isMiss = j.text === 'MISS';
        const cx = isMiss ? (j.x || this.canvas.width / 2) : this.canvas.width / 2;
        const cy = isMiss
            ? (j.y || this.canvas.height * 0.32) - rise
            : this.canvas.height * 0.32 - rise;

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(cx, cy);
        ctx.globalAlpha = alpha;

        const seed = (j.at | 0) % 97;

        if (j.text === 'PERFECT') {
            const fs = Math.round(j.size * bounceS);
            // ─ rough dark cyan brush-stroke bg (identical structure to MISS) ─
            const bw = fs * 5.2;
            const bh = fs * 1.55;
            const stripCount = 10;
            for (let s = 0; s < stripCount; s++) {
                const sy2 = -bh/2 + (s / stripCount) * bh;
                const sh = bh / stripCount * (0.6 + ((seed + s * 7) % 10) / 15);
                const sw = bw * (0.72 + ((seed * 3 + s * 11) % 28) / 100);
                const soff = ((seed + s * 3) % 14) - 7;
                ctx.fillStyle = s % 3 === 0 ? 'rgba(0,50,60,.90)' : 'rgba(0,70,85,.82)';
                ctx.fillRect(soff - sw/2, sy2, sw, sh);
            }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${fs}px "Press Start 2P", monospace`;
            for (let d = 3; d >= 1; d--) {
                ctx.fillStyle = `rgba(0,50,60,${0.7 - d * 0.18})`;
                ctx.fillText('PERFECT!', d * 2, d * 2);
            }
            ctx.fillStyle = '#0d8899';
            ctx.fillText('PERFECT!', 2, 2);
            ctx.shadowBlur = 16;
            ctx.shadowColor = '#59efff';
            ctx.fillStyle = '#59efff';
            ctx.fillText('PERFECT!', 0, 0);
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(180,250,255,0.50)';
            ctx.fillText('PERFECT!', -1, -3);

        } else if (j.text === 'GOOD') {
            const fs = Math.round(j.size * bounceS);
            // ─ rough dark pink brush-stroke bg (identical structure to MISS) ─
            const bw = fs * 5.2;
            const bh = fs * 1.55;
            const stripCount = 10;
            for (let s = 0; s < stripCount; s++) {
                const sy2 = -bh/2 + (s / stripCount) * bh;
                const sh = bh / stripCount * (0.6 + ((seed + s * 7) % 10) / 15);
                const sw = bw * (0.72 + ((seed * 3 + s * 11) % 28) / 100);
                const soff = ((seed + s * 3) % 14) - 7;
                ctx.fillStyle = s % 3 === 0 ? 'rgba(60,0,40,.90)' : 'rgba(85,0,55,.82)';
                ctx.fillRect(soff - sw/2, sy2, sw, sh);
            }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${fs}px "Press Start 2P", monospace`;
            for (let d = 3; d >= 1; d--) {
                ctx.fillStyle = `rgba(60,0,40,${0.7 - d * 0.18})`;
                ctx.fillText('GOOD!', d * 2, d * 2);
            }
            ctx.fillStyle = '#991160';
            ctx.fillText('GOOD!', 2, 2);
            ctx.shadowBlur = 16;
            ctx.shadowColor = '#ff79ae';
            ctx.fillStyle = '#ff79ae';
            ctx.fillText('GOOD!', 0, 0);
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,200,220,0.50)';
            ctx.fillText('GOOD!', -1, -3);

        } else if (j.text === 'MISS') {
            const fs = Math.round(j.size * bounceS);
            // ─ rough dark red brush-stroke bg ─
            const bw = fs * 5.2;
            const bh = fs * 1.55;
            // jagged dark red bg stripes (simulate rough brush)
            const stripCount = 10;
            for (let s = 0; s < stripCount; s++) {
                const sy2 = -bh/2 + (s / stripCount) * bh;
                const sh = bh / stripCount * (0.6 + ((seed + s * 7) % 10) / 15);
                const sw = bw * (0.72 + ((seed * 3 + s * 11) % 28) / 100);
                const soff = ((seed + s * 3) % 14) - 7;
                ctx.fillStyle = s % 3 === 0 ? 'rgba(60,0,0,.90)' : 'rgba(90,5,5,.82)';
                ctx.fillRect(soff - sw/2, sy2, sw, sh);
            }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${fs}px "Press Start 2P", monospace`;
            // 3D red shadow
            for (let d = 3; d >= 1; d--) {
                ctx.fillStyle = `rgba(80,0,0,${0.7 - d * 0.18})`;
                ctx.fillText('MISS', d * 2, d * 2);
            }
            ctx.fillStyle = '#991111';
            ctx.fillText('MISS', 2, 2);
            ctx.shadowBlur = 16;
            ctx.shadowColor = '#ff2222';
            ctx.fillStyle = '#ff3a3a';
            ctx.fillText('MISS', 0, 0);
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,160,160,0.50)';
            ctx.fillText('MISS', -1, -3);
        }

        ctx.restore();
    }
};

RhythmGame.prototype.drawNoteLinks = function () {
    const ctx = this.ctx;
    const notes = (this.notes || [])
        .filter(n => !n.hit && !n.completed && ['click', 'tap', 'drag'].includes(n.noteType))
        .sort((a, b) => {
            const ta = Number.isFinite(a.hitTime) ? a.hitTime : Number.POSITIVE_INFINITY;
            const tb = Number.isFinite(b.hitTime) ? b.hitTime : Number.POSITIVE_INFINITY;
            if (ta !== tb) return ta - tb;
            return (a.noteNumber || 0) - (b.noteNumber || 0);
        })
        .slice(0, 6);
    if (notes.length < 2) return;
    const now = performance.now();
    ctx.save();
    for (let i = 0; i < notes.length - 1; i++) {
        const a = notes[i];
        const b = notes[i + 1];
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            if (dist > this.circleSize * 12) continue; // skip if too far apart
            const pct = Math.max(a.approachProgress || 0, b.approachProgress || 0);
            const flow = 0.5 + 0.5 * Math.sin(now / 220 + i * 1.3);
            const alpha = Math.min(0.62, 0.12 + pct * 0.62) * flow;
            if (alpha < 0.06) continue;
            const grd = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            grd.addColorStop(0, `rgba(76,238,255,${(alpha * 0.92).toFixed(3)})`);
            grd.addColorStop(0.48, `rgba(255,255,255,${(alpha * 0.95).toFixed(3)})`);
            grd.addColorStop(0.52, `rgba(255,100,180,${(alpha * 0.72).toFixed(3)})`);
            grd.addColorStop(1, `rgba(76,238,255,${(alpha * 0.92).toFixed(3)})`);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = grd;
            ctx.lineWidth = 2.8;
            ctx.setLineDash([10, 8]);
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(76,238,255,0.55)';
            ctx.stroke();
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.42).toFixed(3)})`;
            ctx.setLineDash([2, 14]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;

            // Pixel chevron arrows along connection line
            const lineDx = b.x - a.x;
            const lineDy = b.y - a.y;
            const lineLen = Math.hypot(lineDx, lineDy);
            if (lineLen > 20) {
                const dirX = lineDx / lineLen;
                const dirY = lineDy / lineLen;
                const perpX = -dirY;
                const perpY = dirX;
                const chevronCount = Math.max(1, Math.floor(lineLen / (this.circleSize * 1.8)));
                const travel = (now / 900 + i * 0.17) % 1;
                for (let ci = 1; ci <= chevronCount; ci++) {
                    const baseT = ci / (chevronCount + 1);
                    const ct = (baseT + travel) % 1;
                    const cx = a.x + lineDx * ct;
                    const cy = a.y + lineDy * ct;
                    const ps = 3;
                    const leadBoost = 1 - Math.min(1, Math.abs(ct - travel) * 3.2);
                    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.95, alpha * (0.5 + leadBoost * 0.55)).toFixed(3)})`;
                    // Draw chevron: two angled lines forming >>>
                    for (let chevOff = -1; chevOff <= 1; chevOff += 2) {
                        for (let seg = 0; seg < 3; seg++) {
                            const px = cx - dirX * (seg * ps * 0.7) + perpX * chevOff * (ps + seg * ps * 0.5);
                            const py = cy - dirY * (seg * ps * 0.7) + perpY * chevOff * (ps + seg * ps * 0.5);
                            ctx.fillRect(Math.round(px - ps / 2), Math.round(py - ps / 2), ps, ps);
                        }
                    }
                }
            }

            // Floating particle trail along connection line
            const particleTrailCount = Math.max(2, Math.floor(lineLen / 30));
            for (let pi = 0; pi < particleTrailCount; pi++) {
                const pt = ((now / 800 + pi * 0.15 + i * 0.3) % 1);
                const px = a.x + lineDx * pt;
                const py = a.y + lineDy * pt;
                const driftAmt = Math.sin(now / 350 + pi * 2.1) * 4;
                const perpDx = -(lineDy / (lineLen || 1));
                const perpDyN = (lineDx / (lineLen || 1));
                const pSize = 2 + (pi % 2);
                ctx.fillStyle = `rgba(76,238,255,${Math.min(0.7, alpha * 0.44 + (pi % 3) * 0.07).toFixed(3)})`;
                ctx.fillRect(Math.round(px + perpDx * driftAmt - pSize / 2), Math.round(py + perpDyN * driftAmt - pSize / 2), pSize, pSize);
            }

            // traveling spark
            const sparkT = ((now / 400) + i * 0.4) % 1;
            const sx = a.x + (b.x - a.x) * sparkT;
            const sy = a.y + (b.y - a.y) * sparkT;
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = alpha * 0.9;
            ctx.fillRect(sx - 2, sy - 2, 4, 4);
            ctx.globalAlpha = 1;
    }
    ctx.restore();
};

RhythmGame.prototype.drawSongProgress = function () {
    if (!this.isPlaying) return;
    const chartClock = this.resolveChartClock();

    // Determine total duration
    let totalSec = 0;
    if (this.audioBuffer?.duration > 0) {
        totalSec = this.audioBuffer.duration;
    } else if (this.chartData?.fullDuration > 0) {
        totalSec = this.chartData.fullDuration;
    } else if (this.chartData?.notes?.length) {
        const last = this.chartData.notes[this.chartData.notes.length - 1];
        totalSec = (last?.time || 0) + 3;
    }
    if (totalSec <= 0) return;

    const progress = Math.max(0, Math.min(1, chartClock / totalSec));
    const now = performance.now();

    const cw = this.canvas.width;
    const barY = 10;
    const barH = 10;
    const barX = 56;
    const barW = cw - 112;
    const filled = barW * progress;

    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Background track (pixel blocks)
    const blockW = 6;
    const blockGap = 2;
    const blockStep = blockW + blockGap;
    const totalBlocks = Math.floor(barW / blockStep);
    const filledBlocks = Math.floor(totalBlocks * progress);

    for (let i = 0; i < totalBlocks; i++) {
        const bx = barX + i * blockStep;
        const lit = i < filledBlocks;
        const isNearHead = i === filledBlocks - 1 || i === filledBlocks;
        if (lit) {
            const glow = 0.55 + 0.45 * Math.sin(now / 140 + i * 0.22);
            ctx.fillStyle = `rgba(89,239,255,${glow.toFixed(3)})`;
            ctx.shadowBlur = isNearHead ? 18 : 8;
            ctx.shadowColor = '#59efff';
        } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(89,239,255,0.10)';
        }
        ctx.fillRect(bx, barY, blockW, barH);
    }
    ctx.shadowBlur = 0;

    // Glowing head pixel
    if (progress > 0.01 && progress < 0.999) {
        const headX = barX + filled - 2;
        const pulse = 1 + 0.5 * Math.sin(now / 80);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 20 * pulse;
        ctx.shadowColor = '#59efff';
        ctx.fillRect(headX, barY - 3, 5, barH + 6);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#59efff';
        ctx.fillRect(headX + 1, barY - 1, 3, barH + 2);
    }

    // Time remaining text removed per user request — progress bar only

    ctx.restore();
};

RhythmGame.prototype.drawEnergyBurst = function () {
    const now = performance.now();
    this.visualBursts = this.visualBursts.filter(b => now - b.at < 550);
    this.signatureBursts = this.signatureBursts.filter(b => now - b.at < 900);
    this.feedbackBanners = (this.feedbackBanners || []).filter(b => now - b.at < (b.lifeMs || 720));
    if (this.countdownFlash && now - this.countdownFlash.at > (this.countdownFlash.lifeMs || 900)) this.countdownFlash = null;

    for (const b of this.visualBursts) {
        const t = Math.min(1, (now - b.at) / 550);
        const alpha = (1 - t) * 0.24;
        const radius = (58 + t * 188) * (b.scale || 1);
        this.ctx.beginPath();
        this.ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
        this.ctx.strokeStyle = b.color.replace('ALPHA', alpha.toFixed(3));
        this.ctx.lineWidth = 3.5;
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(b.x, b.y, radius * 0.56, 0, Math.PI * 2);
        this.ctx.strokeStyle = b.inner.replace('ALPHA', (alpha * 0.9).toFixed(3));
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        this.ctx.save();
        this.ctx.globalAlpha = alpha * 0.85;
        this.ctx.fillStyle = b.smear || 'rgba(255,255,255,0.12)';
        this.ctx.fillRect(b.x - radius * 1.2, b.y - 2, radius * 2.4, 4);
        this.ctx.restore();
    }

    for (const b of this.signatureBursts) {
        const t = Math.min(1, (now - b.at) / 900);
        const alpha = (1 - t) * 0.28;
        this.ctx.save();
        this.ctx.translate(b.x, b.y);
        this.ctx.rotate((b.rotate || 0) + t * 0.6);
        this.ctx.strokeStyle = `rgba(255, 230, 183, ${alpha.toFixed(3)})`;
        this.ctx.lineWidth = 2.5;
        this.ctx.strokeRect(-b.size * (0.4 + t * 0.8), -b.size * 0.28, b.size * (0.8 + t * 1.6), b.size * 0.56);
        this.ctx.restore();
    }

    for (const banner of (this.feedbackBanners || [])) {
        this.drawFeedbackBanner(banner, now);
    }

    if (this.countdownFlash) this.drawCountdownFlash(this.countdownFlash, now);
};

RhythmGame.prototype.pushBurst = function (x, y, type) {
    const map = {
        perfect: { color: 'rgba(90,246,255,ALPHA)', inner: 'rgba(255,255,255,ALPHA)', smear: 'rgba(90,246,255,0.18)' },
        good: { color: 'rgba(255,79,174,ALPHA)', inner: 'rgba(255,214,236,ALPHA)', smear: 'rgba(255,79,174,0.16)' },
        miss: { color: 'rgba(255,90,107,ALPHA)', inner: 'rgba(255,184,192,ALPHA)', smear: 'rgba(255,90,107,0.15)' }
    };
    this.visualBursts.push({ x, y, at: performance.now(), scale: type === 'perfect' ? 1.22 : type === 'good' ? 0.96 : 0.82, ...(map[type] || map.perfect) });
    this.updateHUD();
};

RhythmGame.prototype.pushFeedbackBanner = function (type, options = {}) {
    const now = performance.now();
    const palette = {
        perfect: { fill: '#5af6ff', shadow: 'rgba(90,246,255,.42)', accent: '#ffffff', strip: 'rgba(255,79,174,.28)', text: 'PERFECT!' },
        good: { fill: '#ff4fae', shadow: 'rgba(255,79,174,.34)', accent: '#ffd7ef', strip: 'rgba(90,246,255,.24)', text: 'GOOD!' },
        miss: { fill: '#ff5a6b', shadow: 'rgba(255,90,107,.32)', accent: '#ffe4e8', strip: 'rgba(255,255,255,.12)', text: 'MISS' },
        combo: { fill: '#ffc94d', shadow: 'rgba(255,201,77,.32)', accent: '#fff1c5', strip: 'rgba(90,246,255,.22)', text: options.text || 'COMBO' },
        start: { fill: '#ff4fae', shadow: 'rgba(255,79,174,.34)', accent: '#ffffff', strip: 'rgba(90,246,255,.22)', text: options.text || 'START!' },
        count: { fill: '#5af6ff', shadow: 'rgba(90,246,255,.34)', accent: '#ffffff', strip: 'rgba(255,79,174,.22)', text: options.text || '3' }
    }[type] || { fill: '#ffffff', shadow: 'rgba(255,255,255,.24)', accent: '#ffffff', strip: 'rgba(255,255,255,.12)', text: options.text || String(type || '').toUpperCase() };

    this.feedbackBanners.push({
        type,
        at: now,
        lifeMs: options.lifeMs || (type === 'combo' ? 760 : type === 'count' ? 680 : 620),
        text: options.text || palette.text,
        x: options.x || this.canvas.width / 2,
        y: options.y || (type === 'combo' ? this.canvas.height * 0.22 : this.canvas.height * 0.3),
        scale: options.scale || 1,
        fill: palette.fill,
        shadow: palette.shadow,
        accent: palette.accent,
        strip: palette.strip,
        level: options.level || 0
    });
};

RhythmGame.prototype.drawFeedbackBanner = function (banner, now = performance.now()) {
    const age = now - banner.at;
    const life = Math.max(1, banner.lifeMs || 620);
    const t = Math.min(1, age / life);
    const out = 1 - t;
    const slam = Math.max(0, 1 - age / 120);
    const x = banner.x || this.canvas.width / 2;
    const y = (banner.y || this.canvas.height * 0.3) - t * 26;
    const scale = (banner.scale || 1) * (1 + slam * 0.18);
    const text = String(banner.text || '').toUpperCase();
    const w = Math.max(200, 84 + text.length * 26 + (banner.level || 0) * 10);
    const h = banner.type === 'combo' ? 64 : 56;

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.scale(scale, scale);
    this.ctx.globalAlpha = Math.min(1, out * 1.05);

    this.ctx.fillStyle = banner.strip;
    this.ctx.fillRect(-w * (0.7 + slam * 0.4), -2, w * (1.4 + slam * 0.8), 4);
    this.ctx.fillRect(-w * (0.55 + slam * 0.25), 10, w * (1.1 + slam * 0.5), 2);

    this.ctx.shadowBlur = 22;
    this.ctx.shadowColor = banner.shadow;
    this.ctx.fillStyle = 'rgba(7,10,18,.84)';
    this.ctx.beginPath();
    this.ctx.moveTo(-w / 2 + 14, -h / 2);
    this.ctx.lineTo(w / 2 - 18, -h / 2);
    this.ctx.lineTo(w / 2, -h / 2 + 18);
    this.ctx.lineTo(w / 2, h / 2 - 12);
    this.ctx.lineTo(w / 2 - 12, h / 2);
    this.ctx.lineTo(-w / 2 + 18, h / 2);
    this.ctx.lineTo(-w / 2, h / 2 - 18);
    this.ctx.lineTo(-w / 2, -h / 2 + 14);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    this.ctx.strokeStyle = banner.fill;
    this.ctx.lineWidth = 2.4;
    this.ctx.stroke();

    this.ctx.fillStyle = banner.fill;
    this.ctx.fillRect(-w / 2 + 10, -h / 2 + 8, w - 20, 4);

    this.ctx.font = banner.type === 'combo' ? '700 18px "Press Start 2P", monospace' : '700 16px "Press Start 2P", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = banner.fill;
    this.ctx.fillText(text, 3, 1);
    this.ctx.fillStyle = banner.accent;
    this.ctx.fillText(text, 0, -1);

    this.ctx.globalAlpha = out * 0.7;
    this.ctx.fillStyle = banner.shadow;
    this.ctx.fillText(text, -8 - slam * 8, 0);

    this.ctx.restore();
};

RhythmGame.prototype.pushCountdownFlash = function (text, options = {}) {
    const isStart = String(text).toUpperCase() === 'START!';
    // For START! only show the big canvas flash (no feedbackBanner = no double START!)
    // For 3/2/1 show the small banner only (countdownFlash stays null so numbers don't double too)
    if (isStart) {
        this.countdownFlash = {
            at: performance.now(),
            lifeMs: options.lifeMs || 940,
            text: String(text),
            color: options.color || '#ff4fae',
            accent: options.accent || '#ffffff'
        };
    } else {
        this.pushFeedbackBanner('count', {
            text: String(text),
            y: this.canvas.height * 0.32,
            lifeMs: options.lifeMs || 620,
            scale: 1.24
        });
    }
};

RhythmGame.prototype.drawCountdownFlash = function (flash, now = performance.now()) {
    const age = now - flash.at;
    const life = Math.max(1, flash.lifeMs || 760);
    const t = Math.min(1, age / life);
    const out = 1 - t;
    const slam = Math.max(0, 1 - age / 160);
    const text = String(flash.text || '').toUpperCase();
    const x = this.canvas.width / 2;
    const y = this.canvas.height * 0.5 + 8 - t * 8;
    const scale = text === 'START!' ? 1.18 + slam * 0.16 : 1.46 + slam * 0.22;

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.scale(scale, scale);
    this.ctx.globalAlpha = out;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.font = text === 'START!' ? '700 44px "Press Start 2P", monospace' : '700 72px "Press Start 2P", monospace';

    for (let i = 0; i < 4; i += 1) {
        this.ctx.fillStyle = `rgba(255,79,174,${(out * 0.14 * (1 - i * 0.18)).toFixed(3)})`;
        this.ctx.fillText(text, -18 - i * 10, 0);
    }
    this.ctx.shadowBlur = 26;
    this.ctx.shadowColor = flash.color;
    this.ctx.fillStyle = flash.color;
    this.ctx.fillText(text, 4, 2);
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = flash.accent || '#ffffff';
    this.ctx.fillText(text, 0, 0);
    this.ctx.restore();
};

RhythmGame.prototype.pushSignatureBurst = function (x, y, kind = 'click') {
    this.signatureBursts.push({
        x,
        y,
        at: performance.now(),
        kind,
        size: kind === 'ribbon' ? this.circleSize * 2.2 : this.circleSize * 1.9,
        rotate: kind === 'ribbon' ? 0.4 : 0
    });
};

RhythmGame.prototype.drawComboHUD = function () {
    this.updateHUD();
    this.ctx.textAlign = 'center';
    const comboBounce = 1 + Math.min(0.22, (this.combo % 6) * 0.016);
    if (this.combo > 1) {
        const text = `${this.combo}x COMBO`;
        const w = Math.max(220, 110 + text.length * 12);
        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2, 64);
        this.ctx.scale(comboBounce, comboBounce);
        this.ctx.fillStyle = 'rgba(90,246,255,.16)';
        this.ctx.fillRect(-w * 0.62, -4, w * 1.24, 4);
        this.ctx.fillStyle = 'rgba(255,79,174,.12)';
        this.ctx.fillRect(-w * 0.48, 10, w * 0.96, 2);

        this.ctx.beginPath();
        this.ctx.moveTo(-w / 2 + 16, -24);
        this.ctx.lineTo(w / 2 - 18, -24);
        this.ctx.lineTo(w / 2, -6);
        this.ctx.lineTo(w / 2, 22);
        this.ctx.lineTo(w / 2 - 12, 34);
        this.ctx.lineTo(-w / 2 + 18, 34);
        this.ctx.lineTo(-w / 2, 16);
        this.ctx.lineTo(-w / 2, -8);
        this.ctx.closePath();
        this.ctx.fillStyle = 'rgba(7,10,18,.76)';
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = 'rgba(90,246,255,.24)';
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        this.ctx.strokeStyle = this.combo >= 50 ? '#ffc94d' : '#5af6ff';
        this.ctx.lineWidth = 2.2;
        this.ctx.stroke();

        this.ctx.font = this.combo >= 100 ? '700 20px "Press Start 2P", monospace' : '700 16px "Press Start 2P", monospace';
        this.ctx.fillStyle = 'rgba(255,79,174,.34)';
        this.ctx.fillText(text, 5, 4);
        this.ctx.fillStyle = this.combo >= 50 ? '#ffc94d' : '#5af6ff';
        this.ctx.fillText(text, 2, 1);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(text, 0, -1);
        this.ctx.restore();
    }
    this.ctx.fillStyle = this.runInvalid ? 'rgba(255,90,107,.94)' : 'rgba(217,236,255,.86)';
    this.ctx.font = '700 12px "Press Start 2P", monospace';
    const modeText = `${String(this.playMode || 'casual').toUpperCase()}${this.runInvalid ? ' · INVALID RUN' : ''}`;
    this.ctx.fillText(modeText, this.canvas.width / 2, 110);
    const underPulse = 0.26 + 0.14 * (0.5 + 0.5 * Math.sin(performance.now() / 260));
    this.ctx.fillStyle = `rgba(255,201,77,${underPulse.toFixed(3)})`;
    this.ctx.fillRect(this.canvas.width / 2 - 72, 118, 144, 3);
};



RhythmGame.prototype.getChartWallClockTime = function () {
    if (this.runClock?.getWallTime) return this.runClock.getWallTime();
    return Math.max(0, (performance.now() - (this._liveStartWall || performance.now())) / 1000 - (this.pauseAccumulated || 0));
};

RhythmGame.prototype.spawnChartNotesUpTo = function (currentTime) {
    const chartTime = Number.isFinite(Number(currentTime)) ? Number(currentTime) : 0;
    if (!(this.chartMode && this.chartData?.notes?.length)) return 0;
    let spawned = 0;
    while (this.nextChartIndex < this.chartData.notes.length && this.chartData.notes[this.nextChartIndex].time <= chartTime + this.spawnLeadTimeMs / 1000) {
        const chartIndex = this.nextChartIndex;
        const chartNote = this.chartData.notes[chartIndex];

        if (chartNote.time < chartTime - (this.goodRange / 1000)) {
            this.nextChartIndex += 1;
            continue;
        }

        const note = this.createChartNoteFromData(chartTime, chartNote, chartIndex);
        if (!note) break;
        this.nextChartIndex += 1;
        this.notes.push(note);
        this.spawnedChartNotes += 1;
        spawned += 1;
    }
    return spawned;
};

RhythmGame.prototype.computeRunClock = function () {
    if (this.runClock?.getRunTime && this.liveMode) {
        return this.runClock.getRunTime({ paused: this.isPausedPhase(), chartMode: this.chartMode });
    }
    if (this.isPausedPhase()) return this.frozenGameTime || 0;
    if (this.liveMode) {
        const liveT = this.getLiveCurrentTime();
        const wallT = this.getChartWallClockTime();
        if (this.chartMode) {
            if (this.livePlaybackStarted) return Math.max(liveT || 0, wallT || 0);
            return wallT || 0;
        }
        return Math.max(liveT || 0, wallT || 0);
    }
    return Math.max(0, this.audioContext.currentTime - this.startTime - (this.pauseAccumulated || 0));
};

RhythmGame.prototype.getGameClockTime = function () {
    return this.computeRunClock();
};

RhythmGame.prototype.updatePauseUI = function () {
    const pauseBtn = document.getElementById('pauseGameBtn');
    const resumeBtn = document.getElementById('resumeGameBtn');
    const hudPauseBtn = document.getElementById('hudPauseBtn');
    const overlayResumeBtn = document.getElementById('overlayResumeBtn');
    const overlay = document.getElementById('pauseOverlay');
    const overlayText = document.getElementById('pauseOverlayText');
    const overlaySubtext = document.getElementById('pauseOverlaySubtext');
    const paused = this.isPausedPhase();
    if (pauseBtn) pauseBtn.disabled = !this.isPlaying || paused;
    if (hudPauseBtn) {
        hudPauseBtn.disabled = !this.isPlaying || paused;
        hudPauseBtn.textContent = paused ? 'Paused' : 'Pause';
    }
    if (resumeBtn) {
        resumeBtn.disabled = !paused;
        resumeBtn.style.display = paused ? 'inline-block' : 'none';
    }
    if (overlayResumeBtn) {
        overlayResumeBtn.disabled = !paused;
        overlayResumeBtn.style.display = paused ? 'inline-block' : 'none';
    }
    if (overlay) overlay.classList.toggle('hidden', !paused);
    if (overlayText && paused) overlayText.textContent = this.pauseReason === 'system' ? 'Playback paused automatically' : 'Game paused';
    this.updateHUD();
    if (overlaySubtext) {
        if (!paused) overlaySubtext.textContent = 'Resume will trigger a short countdown.';
        else if (this.pauseReason === 'invalid-strict') overlaySubtext.textContent = 'Strict mode detected a forbidden pause/seek. This run is now invalid.';
        else if (this.pauseReason === 'system-yt-paused') overlaySubtext.textContent = 'Hidden YouTube playback paused unexpectedly. Tap resume to continue after countdown.';
        else if (this.pauseReason === 'system-stalled') overlaySubtext.textContent = 'Playback stalled for too long. Tap resume to continue after countdown.';
        else if (this.pauseReason === 'system') overlaySubtext.textContent = 'Playback stalled or tab focus changed. Resume will continue after countdown.';
        else overlaySubtext.textContent = this.playMode === 'strict' ? 'Strict mode pauses will invalidate the run.' : 'Resume will trigger a short countdown.';
    }
};

RhythmGame.prototype.pausePlaybackMedia = function () {
    if (this.playMode === 'strict' && this.pauseReason === 'user') return;
    if (this.playbackController?.pause) return this.playbackController.pause();
    if (this._ytPlayer && this._ytPlayer.pauseVideo) {
        try { this._ytPlayer.pauseVideo(); } catch (_) {}
    }
    const a = document.getElementById('liveAudio');
    if (a && !a.paused) { try { a.pause(); } catch (_) {} }
};

RhythmGame.prototype.resumePlaybackMedia = function () {
    if (this.playbackController?.resume) return this.playbackController.resume();
    if (this._ytPlayer && this._ytPlayer.playVideo) {
        try { this._ytPlayer.playVideo(); } catch (_) {}
    }
    const a = document.getElementById('liveAudio');
    if (a && a.paused) { a.play().catch(() => {}); }
};

RhythmGame.prototype.pauseGame = function (reason = 'user') {
    if (!this.isPlaying || this.isPausedPhase()) return;
    if (this.playMode === 'strict' && reason === 'user') {
        this.runInvalid = true;
        this.pauseReason = 'invalid-strict';
        this.setRunPhase('paused-user');
        this.pausedAt = performance.now();
        this.frozenGameTime = this.resolveRunClock();
        if (this.runOrchestrator?.pause) this.runOrchestrator.pause({ reason: 'invalid-strict' });
        this.updatePauseUI();
        this.updateHUD();
        return;
    }
    this.pauseReason = reason;
    this.setRunPhase(reason === 'system' ? 'paused-system' : 'paused-user');
    this.pausedAt = performance.now();
    this.frozenGameTime = this.resolveRunClock();
    if (this.runOrchestrator?.pause) this.runOrchestrator.pause({ reason });
    this.pausePlaybackMedia();
    // Offline mode: stop bufferSource and record position so resume can seek
    if (!this.liveMode && this._offlineSource) {
        this._offlinePlayOffset = Math.max(0, (this.audioContext.currentTime - this.startTime - (this.pauseAccumulated || 0)));
        try { this._offlineSource.stop(); } catch(_) {}
        this._offlineSource = null;
    }
    this.updatePauseUI();
    this.updateHUD();
};

RhythmGame.prototype.resumeGame = async function () {
    if (!(this.isPausedPhase())) return;
    // NOTE: orchestrator.resume() is deferred until AFTER countdown
    // to prevent the clock from advancing during the 3-2-1 countdown.
    return this.resumeRunSequence();
};

// Live playback helpers (patched)
RhythmGame.prototype.markLivePlaybackState = function (state) {
    this.livePlaybackState = state || this.livePlaybackState || 'idle';
    this.captureRuntimeDiagnostics('playback-state', { playbackState: this.livePlaybackState });

    if (this.gameState === 'awaiting-playback') {
        if (state === 'playing') {
            this.livePlaybackStarted = true;
            this.resolvePendingPlaybackStart?.();
            this.renderScene?.();
            this.updateHUD();
            return;
        }
        if (state === 'error' || state === 'yt-init-error' || state === 'autoplay-blocked') {
            this.rejectPendingPlaybackStart?.(new Error(state || 'playback start failed'));
            this.renderScene?.();
            this.updateHUD();
            return;
        }
        if (state === 'paused') {
            this.rejectPendingPlaybackStart?.(new Error('Playback paused before start'));
            this.renderScene?.();
            this.updateHUD();
            return;
        }
        if (state === 'buffering' || state === 'waiting' || state === 'ready' || state === 'cued' || state === 'loading' || state === 'play') {
            this.renderScene?.();
            this.updateHUD();
            return;
        }
    }

    if (state === 'playing') {
        this.livePlaybackStarted = true;
        if (this.runClock?.markPlaybackStarted) this.runClock.markPlaybackStarted();
        if (this.runOrchestrator?.startPlaying && this.isPlaying) this.runOrchestrator.startPlaying({ playbackStarted: true });
        this.resolvePendingPlaybackStart?.();
    }
    if (state === 'error' || state === 'yt-init-error' || state === 'autoplay-blocked') {
        this.rejectPendingPlaybackStart?.(new Error(state || 'playback start failed'));
    }
    if (state === 'ended') {
        this.checkRunCompletion();
    }
    this.renderScene?.();
    this.updateHUD();
};

RhythmGame.prototype.bindLiveAudioEvents = function (audioEl) {
    if (this.playbackController?.bindAudioEvents) return this.playbackController.bindAudioEvents(audioEl);
    if (!audioEl || audioEl._rgbBound) return;
    audioEl._rgbBound = true;
    audioEl.addEventListener('playing', () => this.markLivePlaybackState('playing'));
    audioEl.addEventListener('play', () => this.markLivePlaybackState('play'));
    audioEl.addEventListener('waiting', () => this.markLivePlaybackState('waiting'));
    audioEl.addEventListener('pause', () => { if (this.isPlaying) this.markLivePlaybackState('paused'); });
    audioEl.addEventListener('ended', () => this.markLivePlaybackState('ended'));
    audioEl.addEventListener('error', () => this.markLivePlaybackState('error'));
    audioEl.addEventListener('timeupdate', () => {
        if ((audioEl.currentTime || 0) > 0.05) this.livePlaybackStarted = true;
    });
};

RhythmGame.prototype.startLivePlayback = function () {
    const holder = document.getElementById("livePlayerHolder");
    if (holder) holder.classList.add("hidden");
    if (!this.liveConfig || !this.liveConfig.player) return;
    const a = document.getElementById("liveAudio");
    if (a) a.controls = false;
    if (this.playbackController?.start) {
        this.playbackController.start(this.liveConfig);
        return;
    }
};

RhythmGame.prototype.getLiveCurrentTime = function () {
    if (this.playbackController?.getCurrentTime) {
        const t = this.playbackController.getCurrentTime(this.liveConfig);
        if (Number.isFinite(Number(t))) return Number(t || 0);
    }
    if (this.liveConfig && this.liveConfig.player && this.liveConfig.player.type === "youtube" && this._ytPlayer && this._ytPlayer.getCurrentTime) {
        return this._ytPlayer.getCurrentTime() || 0;
    }
    const a = document.getElementById("liveAudio");
    if (a) a.controls = false;
    return a ? (a.currentTime || 0) : (this.audioContext.currentTime - this.startTime);
};


RhythmGame.prototype.initLiveEngine = function () {
    const bpm = Math.max(72, Math.min(180, Number((this.liveConfig && this.liveConfig.bpm) || 122)));
    const density = Math.max(0.6, Math.min(1.4, Number((this.liveConfig && this.liveConfig.density) || 1.0)));
    this.liveEngine = {
        bpm,
        beatSec: 60 / bpm,
        density,
        step: 0,
        bar: 0,
        nextTime: 0.8,
        pattern16: [1,0,1,0, 1,1,0,0, 1,0,1,1, 0,1,0,1],
        phrase: { anchorX: this.canvas.width / 2, anchorY: this.canvas.height / 2, radius: 260, left: 0 },
        dragQuotaPerBar: 2,
        dragSpawnedInBar: 0,
        lastWasDrag: false,
        lastSpawnX: null,
        lastSpawnY: null
    };
    this.resetLivePhrase();
    this.watchPlaybackIntegrity();
};

RhythmGame.prototype.resetLivePhrase = function () {
    if (!this.liveEngine) return;
    const cols = 4;
    const rows = 3;
    const c = Math.floor(Math.random() * cols);
    const r = Math.floor(Math.random() * rows);
    const cellW = this.safeArea.width / cols;
    const cellH = this.safeArea.height / rows;
    this.liveEngine.phrase = {
        anchorX: this.safeArea.x + c * cellW + cellW * 0.5,
        anchorY: this.safeArea.y + r * cellH + cellH * 0.5,
        radius: Math.min(300, Math.max(190, Math.min(cellW, cellH) * 0.85)),
        left: 4 + Math.floor(Math.random() * 4)
    };
};

RhythmGame.prototype._activeLiveNotes = function () {
    return this.notes.filter(n => !n.hit && !n.completed);
};

RhythmGame.prototype._distance = function (x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
};

RhythmGame.prototype.pickSpawnPosition = function () {
    const eng = this.liveEngine;
    const phrase = eng.phrase;
    if (!phrase || phrase.left <= 0) this.resetLivePhrase();

    const minGap = this.circleSize * 2.4;
    const minDragGap = this.circleSize * 2.0;
    const minStep = this.circleSize * 1.2;
    const maxStep = this.circleSize * 3.2;
    const active = this._activeLiveNotes();

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let best = null;
    for (let i = 0; i < 80; i++) {
        const pr = this.liveEngine.phrase;
        const angle = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * pr.radius;
        const x = clamp(pr.anchorX + Math.cos(angle) * rr, this.safeArea.x + this.circleSize, this.safeArea.x + this.safeArea.width - this.circleSize);
        const y = clamp(pr.anchorY + Math.sin(angle) * rr, this.safeArea.y + this.circleSize, this.safeArea.y + this.safeArea.height - this.circleSize);

        if (eng.lastSpawnX != null) {
            const d = this._distance(x, y, eng.lastSpawnX, eng.lastSpawnY);
            if (d < minStep || d > maxStep) continue;
        }

        let penalty = 0;
        let ok = true;
        for (const n of active) {
            const d = this._distance(x, y, n.x, n.y);
            if (d < minGap) { ok = false; break; }
            penalty += 1 / Math.max(d, 1);
            if (n.isDrag && !n.completed && Number.isFinite(n.endX) && Number.isFinite(n.endY)) {
                const cdist = this.distanceToQuadraticCurve(x, y, n.x, n.y, n.controlX, n.controlY, n.endX, n.endY);
                if (cdist < minDragGap) { ok = false; break; }
                penalty += 1 / Math.max(cdist, 1);
            }
        }
        if (!ok) continue;
        if (!best || penalty < best.penalty) best = { x, y, penalty };
    }
    return best ? { x: best.x, y: best.y } : null;
};

RhythmGame.prototype.createLiveNote = function (currentTime, hitTime, isDrag) {
    const pos = this.pickSpawnPosition();
    if (!pos) return null;
    this.globalNoteSeq += 1;
    const liveSeg = this.getCurrentSegment(hitTime) || { label: 'live' };
    const liveBar = this.liveEngine ? (this.liveEngine.bar || 0) : 0;
    const noteType = this.pickLiveNoteType(this.globalNoteSeq, liveBar, Boolean(isDrag));
    const note = {
        x: pos.x,
        y: pos.y,
        createTime: currentTime,
        hitTime,
        hit: false,
        score: null,
        approachProgress: 0,
        energy: 0.65,
        beatNumber: this.globalNoteSeq,
        noteNumber: this.globalNoteSeq,
        isDrag: noteType === 'drag' || noteType === 'drag' && note.pathVariant === 'starTrace',
        noteType,
        held: false,
        completed: false,
        progress: 0,
        segmentLabel: liveSeg.label || 'live',
        groupIndex: liveBar,
        groupSlot: this.liveEngine ? ((this.liveEngine.step || 0) % 4) : 0,
        spawnedAtWall: performance.now(),
        holdDuration: 0
    };

    note.groupPalette = this.getSegmentPalette(note.segmentLabel || 'live', note.groupIndex);
    note.groupPattern = this.pickGroupPattern(note.groupIndex, note.segmentLabel || 'live');
    // NOTE: applyGroupMechanics moved to AFTER drag block so pathTemplate is finalized first
    // (applyNoteMechanicProfile inside it must see the final heart/vortex value)

    if (note.isDrag) {
        // Force-remap to heart/vortex before extraPath is generated
        const _liveDragRemap = { starTrace: 'heart', diamondLoop: 'heart', zigzag: 'vortex', spiral: 'vortex', scurve: 'vortex', orbit: 'vortex' };
        if (note.pathTemplate && _liveDragRemap[note.pathTemplate]) {
            note.pathTemplate = _liveDragRemap[note.pathTemplate];
            note.pathVariant = note.pathTemplate;
        }
        // If no template yet, assign one: alternate heart/vortex based on note sequence
        if (!note.pathTemplate) {
            note.pathTemplate = (this.globalNoteSeq % 2 === 0) ? 'heart' : 'vortex';
            note.pathVariant = note.pathTemplate;
        }
        const liveEnergyFactor = 0.85 + Math.min(1, note.energy || 0.65) * 0.35;
        // Heart: small enough to trace quickly solo; vortex can be a bit larger
        const heartRadius = Math.round(this.circleSize * (1.6 + Math.random() * 0.5) * liveEnergyFactor);
        const vortexRadius = Math.round(this.circleSize * (2.2 + Math.random() * 0.8) * liveEnergyFactor);
        const liveShapeRadius = (note.pathTemplate === 'heart') ? heartRadius : vortexRadius;
        note._shapeRadius = liveShapeRadius;
        // Heart closes back on the tap note — end == start
        // Vortex spirals outward, place end away from center
        let note_endX, note_endY;
        if (note.pathTemplate === 'heart') {
            note_endX = note.x;
            note_endY = note.y;
        } else {
            const a = Math.random() * Math.PI * 2;
            const endDist = note.pathTemplate === 'vortex' ? liveShapeRadius * 0.7 : this.circleSize * (3.4 + Math.random() * 1.3);
            note_endX = Math.max(this.safeArea.x + this.circleSize, Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, note.x + Math.cos(a) * endDist));
            note_endY = Math.max(this.safeArea.y + this.circleSize, Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, note.y + Math.sin(a) * endDist));
        }
        note.endX = note_endX;
        note.endY = note_endY;
        const dx = note.endX - note.x;
        const dy = note.endY - note.y;
        const L = Math.sqrt(dx * dx + dy * dy) || 1;
        const midX = (note.x + note.endX) / 2;
        const midY = (note.y + note.endY) / 2;
        note.controlX = midX - dy / L * (L * 0.24);
        note.controlY = midY + dx / L * (L * 0.24);
        if (window.PathTemplates && note.pathTemplate) {
            if (note.pathTemplate === 'orbit') {
                const orbit = window.PathTemplates.sampleOrbit(note.x, note.y, note.endX, note.endY, 1.0);
                note.controlX = orbit.controlX;
                note.controlY = orbit.controlY;
            } else if (note.pathTemplate === 'diamondLoop') {
                note.extraPath = window.PathTemplates.sampleDiamondLoop(note.x, note.y, note.endX, note.endY);
            } else if (note.pathTemplate === 'starTrace') {
                note.extraPath = window.PathTemplates.sampleStarTrace(note.x, note.y, note.endX, note.endY);
            } else if (note.pathTemplate === 'spiral') {
                note.extraPath = window.PathTemplates.sampleSpiral(note.x, note.y, note.endX, note.endY);
            } else if (note.pathTemplate === 'zigzag') {
                note.extraPath = window.PathTemplates.sampleZigzag(note.x, note.y, note.endX, note.endY);
            } else if (note.pathTemplate === 'scurve') {
                note.extraPath = window.PathTemplates.sampleScurve(note.x, note.y, note.endX, note.endY);
            } else if (note.pathTemplate === 'heart') {
                note.extraPath = window.PathTemplates.sampleHeart(note.x, note.y, note.endX, note.endY, liveShapeRadius, this.safeArea);
                // Reposition note to actual tip (may shift if center was clamped)
                if (note.extraPath.tipX !== undefined) {
                    note.x = note.extraPath.tipX;
                    note.y = note.extraPath.tipY;
                    note.endX = note.x;
                    note.endY = note.y;
                }
            } else if (note.pathTemplate === 'vortex') {
                note.extraPath = window.PathTemplates.sampleVortex(note.x, note.y, note.endX, note.endY, liveShapeRadius);
            }
        }
        // For vortex only — clamp stray points; heart is already clamped inside sampleHeart
        if (note.extraPath && note.extraPath.points && note.pathTemplate !== 'heart') {
            const sa = this.safeArea, cs = this.circleSize;
            for (let pi = 0; pi < note.extraPath.points.length; pi++) {
                const pt = note.extraPath.points[pi];
                pt.x = Math.max(sa.x + cs * 0.5, Math.min(sa.x + sa.width - cs * 0.5, pt.x));
                pt.y = Math.max(sa.y + cs * 0.5, Math.min(sa.y + sa.height - cs * 0.5, pt.y));
            }
        }
    }

    // Apply group mechanics AFTER drag/path setup so applyNoteMechanicProfile sees final pathTemplate
    this.applyGroupMechanics([note], { pattern: note.groupPattern, groupIndex: note.groupIndex, segmentLabel: note.segmentLabel || 'live' });

    this.liveEngine.lastSpawnX = note.x;
    this.liveEngine.lastSpawnY = note.y;
    this.liveEngine.phrase.left -= 1;
    return note;
};

RhythmGame.prototype.createChartNoteFromData = function (currentTime, chartNote, chartIndex) {
    const seq = chartIndex + 1;
    const laneCount = 4;
    const laneWidth = this.safeArea.width / laneCount;
    const laneIndex = Number.isFinite(chartNote.laneHint) ? Math.max(0, Math.min(laneCount - 1, chartNote.laneHint)) : (chartIndex % laneCount);
    const phrase = Number.isFinite(chartNote.phrase) ? chartNote.phrase : Math.floor(chartIndex / 6);
    const groupSlot = Number.isFinite(chartNote.groupSlot) ? chartNote.groupSlot : (chartIndex % 4);
    const previousActive = (this.notes || []).filter(n => !n.hit && !n.completed).slice(-4);
    const previousNote = previousActive[previousActive.length - 1] || null;
    const previousLane = previousNote && Number.isFinite(previousNote.laneHint) ? previousNote.laneHint : null;
    const anchorLane = Number.isFinite(chartNote.phraseAnchor) ? chartNote.phraseAnchor : laneIndex;
    const tuning = this.runtimeTuning || {};
    const localityBias = Math.max(0, Math.min(1, Number(tuning.localityBias || 0.72)));
    const maxJumpBudget = Math.max(1, Number(tuning.maxJumpBudget || 2));
    const jumpPenaltyBoost = Number(tuning.jumpPenaltyBoost || 0);
    const rawShifts = previousLane == null ? [0, 1, -1, 2, -2] : [0, previousLane - laneIndex, 1, -1, 2, -2];
    const candidateShifts = [...new Set(rawShifts)]
        .filter(shift => Math.abs(shift) <= Math.max(2, maxJumpBudget + 1))
        .sort((a, b) => {
            const aPenalty = Math.abs(a) * (1 + jumpPenaltyBoost) - (Math.abs(a) <= 1 ? localityBias : 0);
            const bPenalty = Math.abs(b) * (1 + jumpPenaltyBoost) - (Math.abs(b) <= 1 ? localityBias : 0);
            return aPenalty - bPenalty;
        });
    let basePos = null;
    let chosenLane = laneIndex;
    const active = (this.notes || []).filter(n => !n.hit && !n.completed);
    const minNoteSpacing = this.circleSize * 3.2;
    const hudExclusionY = 90;
    for (const shift of candidateShifts) {
        const candidateLane = Math.max(0, Math.min(laneCount - 1, laneIndex + shift));
        if (previousLane != null && Math.abs(candidateLane - previousLane) > Math.max(1, maxJumpBudget)) continue;
        const pos = this.resolveGroupPatternPosition({
            laneIndex: candidateLane,
            laneCount,
            chartIndex,
            phrase,
            groupSlot,
            segmentLabel: chartNote.segmentLabel || 'verse',
            phraseAnchor: anchorLane,
            previousLane,
            phraseIntent: chartNote.phraseIntent || null
        });
        // Apply sub-lane jitter to avoid exact column alignment
        const jitterX = ((chartIndex * 37 + phrase * 71) % 100 - 50) / 50 * (laneWidth * 0.18);
        const jitterY = ((chartIndex * 53 + groupSlot * 89) % 100 - 50) / 50 * (this.safeArea.height * 0.06);
        pos.x = Math.max(this.safeArea.x + this.circleSize * 1.5, Math.min(this.safeArea.x + this.safeArea.width - this.circleSize * 1.5, pos.x + jitterX));
        pos.y = Math.max(this.safeArea.y + this.circleSize * 1.5 + hudExclusionY, Math.min(this.safeArea.y + this.safeArea.height - this.circleSize * 1.5, pos.y + jitterY));
        const probe = { x: pos.x, y: pos.y, type: chartNote.type || 'click' };
        const collides = active.some(existing => {
            if (Math.hypot(probe.x - (existing.x || 0), probe.y - (existing.y || 0)) < minNoteSpacing) return true;
            if (existing.endX !== undefined && Math.hypot(probe.x - (existing.endX || 0), probe.y - (existing.endY || 0)) < minNoteSpacing) return true;
            return false;
        });
        if (!collides) {
            basePos = pos;
            chosenLane = candidateLane;
            break;
        }
    }
    // If all lanes collide, find the position with maximum distance from any active note
    if (!basePos) {
        let bestDist = 0;
        let bestPos = null;
        let bestLane = laneIndex;
        for (let tryLane = 0; tryLane < laneCount; tryLane++) {
            const pos = this.resolveGroupPatternPosition({ laneIndex: tryLane, laneCount, chartIndex, phrase, groupSlot, segmentLabel: chartNote.segmentLabel || 'verse', phraseAnchor: anchorLane, previousLane, phraseIntent: chartNote.phraseIntent || null });
            pos.y = Math.max(this.safeArea.y + this.circleSize * 1.5 + hudExclusionY, pos.y);
            let nearestDist = Infinity;
            for (const existing of active) {
                nearestDist = Math.min(nearestDist, Math.hypot(pos.x - (existing.x || 0), pos.y - (existing.y || 0)));
                if (existing.endX !== undefined) nearestDist = Math.min(nearestDist, Math.hypot(pos.x - (existing.endX || 0), pos.y - (existing.endY || 0)));
            }
            if (nearestDist > bestDist) { bestDist = nearestDist; bestPos = pos; bestLane = tryLane; }
        }
        if (bestPos) { basePos = bestPos; chosenLane = bestLane; }
        else {
            chosenLane = laneIndex;
            basePos = this.resolveGroupPatternPosition({ laneIndex, laneCount, chartIndex, phrase, groupSlot, segmentLabel: chartNote.segmentLabel || 'verse', phraseAnchor: anchorLane, previousLane, phraseIntent: chartNote.phraseIntent || null });
            basePos.y = Math.max(this.safeArea.y + this.circleSize * 1.5 + hudExclusionY, basePos.y);
        }
    }
    const noteType = chartNote.type || 'click';
    const spinCenterX = this.safeArea.x + this.safeArea.width / 2;
    const spinCenterY = this.safeArea.y + this.safeArea.height / 2;
    const x = noteType === 'spin' ? spinCenterX : basePos.x;
    const y = noteType === 'spin' ? spinCenterY : basePos.y;
    const note = {
        x,
        y,
        createTime: currentTime,
        hitTime: chartNote.time,
        hit: false,
        score: null,
        approachProgress: 0,
        energy: chartNote.strength || 0.65,
        beatNumber: seq,
        noteNumber: seq,
        isDrag: noteType === 'drag' || noteType === 'drag' && note.pathVariant === 'starTrace',
        isSpin: noteType === 'spin',
        noteType,
        held: false,
        completed: false,
        progress: 0,
        segmentLabel: chartNote.segmentLabel || null,
        laneHint: chosenLane,
        phrase,
        groupIndex: phrase,
        groupSlot,
        spawnedAtWall: performance.now(),
        holdDuration: 0,
        pathVariant: chartNote.pathVariant || chartNote.pathTemplate || null,
        pathTemplate: chartNote.pathTemplate || chartNote.pathVariant || null,
        groupPattern: basePos.pattern,
        spawnLeadBiasSec: Number(chartNote.spawnLeadBiasSec || 0),
        openingCalmWindow: Boolean(chartNote.openingCalmWindow),
        phraseIntent: chartNote.phraseIntent || null,
        phraseAnchor: anchorLane,
        laneFloat: Number(basePos.laneFloat || chosenLane),
        mechanic: chartNote.mechanic || noteType,
        inputChannel: chartNote.inputChannel || (noteType === 'tap' ? 'keyboard' : 'mouse'),
        keyHint: chartNote.keyHint || null,
        keyboardKey: chartNote.keyboardKey || (chartNote.keyHint ? String(chartNote.keyHint).toLowerCase() : null),
        exclusivity: chartNote.exclusivity || 'normal',
        spinDuration: noteType === 'spin' ? Math.max(1.2, Number(chartNote.duration || 2.2)) : 0,
        spinAccum: 0,
        spinLastAngle: null,
        spinStartedAt: null
    };

    note.groupPalette = this.getSegmentPalette(note.segmentLabel || 'verse', note.groupIndex);
    this.applyGroupMechanics([note], { pattern: basePos.pattern, groupIndex: phrase, segmentLabel: note.segmentLabel || 'verse' });

    if (note.isDrag) {
        const templateBias = (note.pathTemplate === 'starTrace' || note.pathTemplate === 'heart') ? 2 : (note.pathTemplate === 'diamondLoop' || note.pathTemplate === 'vortex') ? 1 : 0;
        const dragLanes = [chosenLane + templateBias, chosenLane - templateBias, chosenLane + 1, chosenLane - 1, chosenLane];
        let endLane = chosenLane;
        for (const candidate of dragLanes) {
            if (candidate >= 0 && candidate < laneCount && Math.abs(candidate - chosenLane) <= 2 && candidate !== laneIndex) {
                endLane = candidate;
                break;
            }
        }
        // Heart: closes back to note origin; vortex/others: standard lane-based end
        if (note.pathTemplate === 'heart') {
            note.endX = note.x;
            note.endY = note.y;
        } else {
            const energyFactor = 0.85 + Math.min(1, note.energy || 0.65) * 0.35;
            const localTravel = note.openingCalmWindow ? 1.1
                : note.pathTemplate === 'vortex' ? 2.0 * energyFactor
                : note.pathTemplate === 'starTrace' ? 1.9
                : note.pathTemplate === 'diamondLoop' ? 1.55
                : 1.35;
            note.endX = Math.max(this.safeArea.x + this.circleSize, Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, this.safeArea.x + laneWidth * (endLane + 0.5)));
            note.endY = Math.max(this.safeArea.y + this.circleSize, Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, y + ((chartIndex % 2 === 0 ? 1 : -1) * this.circleSize * localTravel)));
        }
        const active = (this.notes || []).filter(n => !n.hit && !n.completed);
        const endMinDist = this.circleSize * 2.6;
        for (const existing of active) {
            const tooCloseToStart = Math.hypot((existing.x || 0) - note.endX, (existing.y || 0) - note.endY) < endMinDist;
            const tooCloseToEnd = existing.endX !== undefined &&
                Math.hypot((existing.endX || 0) - note.endX, (existing.endY || 0) - note.endY) < endMinDist;
            if (tooCloseToStart || tooCloseToEnd) {
                const nudgeDir = (chartIndex % 2 === 0) ? 1 : -1;
                note.endY = Math.max(this.safeArea.y + this.circleSize,
                    Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, note.endY + nudgeDir * this.circleSize * 1.8));
                note.endX = Math.max(this.safeArea.x + this.circleSize,
                    Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, note.endX + nudgeDir * this.circleSize * 0.6));
            }
        }
        const dx = note.endX - note.x;
        const dy = note.endY - note.y;
        const L = Math.sqrt(dx * dx + dy * dy) || 1;
        const midX = (note.x + note.endX) / 2;
        const midY = (note.y + note.endY) / 2;
        const curve = Math.min(this.circleSize * 1.6, L * 0.24);
        note.controlX = midX - dy / L * curve;
        note.controlY = midY + dx / L * curve;

        // Apply path template geometry for chart-driven notes
        const chartEnergyFactor = 0.85 + Math.min(1, note.energy || 0.65) * 0.35;
        const chartHeartR = Math.round(this.circleSize * (1.6 + Math.random() * 0.5) * chartEnergyFactor);
        const chartVortexR = Math.round(this.circleSize * (2.2 + Math.random() * 0.8) * chartEnergyFactor);
        const chartShapeRadius = (note.pathTemplate === 'heart') ? chartHeartR : chartVortexR;
        note._shapeRadius = chartShapeRadius;
        // Force-remap legacy templates to the two new visual shapes BEFORE extraPath is generated
        const _chartDragRemap = { starTrace: 'heart', diamondLoop: 'heart', zigzag: 'vortex', spiral: 'vortex', scurve: 'vortex', orbit: 'vortex' };
        if (note.pathTemplate && _chartDragRemap[note.pathTemplate]) {
            note.pathTemplate = _chartDragRemap[note.pathTemplate];
            note.pathVariant = note.pathTemplate;
        }
        if (window.PathTemplates && note.pathTemplate) {
            if (note.pathTemplate === 'orbit') {
                const orbit = window.PathTemplates.sampleOrbit(note.x, note.y, note.endX, note.endY, 1.0);
                note.controlX = orbit.controlX;
                note.controlY = orbit.controlY;
            } else if (note.pathTemplate === 'diamondLoop') {
                note.extraPath = window.PathTemplates.sampleDiamondLoop(note.x, note.y, note.endX, note.endY);
            } else if (note.pathTemplate === 'starTrace') {
                note.extraPath = window.PathTemplates.sampleStarTrace(note.x, note.y, note.endX, note.endY);
            } else if (note.pathTemplate === 'spiral') {
                note.extraPath = window.PathTemplates.sampleSpiral(note.x, note.y, note.endX, note.endY);
            } else if (note.pathTemplate === 'zigzag') {
                note.extraPath = window.PathTemplates.sampleZigzag(note.x, note.y, note.endX, note.endY);
            } else if (note.pathTemplate === 'scurve') {
                note.extraPath = window.PathTemplates.sampleScurve(note.x, note.y, note.endX, note.endY);
            } else if (note.pathTemplate === 'heart') {
                note.extraPath = window.PathTemplates.sampleHeart(note.x, note.y, note.endX, note.endY, chartShapeRadius, this.safeArea);
                if (note.extraPath.tipX !== undefined) {
                    note.x = note.extraPath.tipX;
                    note.y = note.extraPath.tipY;
                    note.endX = note.x;
                    note.endY = note.y;
                }
            } else if (note.pathTemplate === 'vortex') {
                note.extraPath = window.PathTemplates.sampleVortex(note.x, note.y, note.endX, note.endY, chartShapeRadius);
            }
        }
        // Vortex only — heart already clamped inside sampleHeart
        if (note.extraPath && note.extraPath.points && note.pathTemplate !== 'heart') {
            const sa = this.safeArea, cs = this.circleSize;
            for (let pi = 0; pi < note.extraPath.points.length; pi++) {
                const pt = note.extraPath.points[pi];
                pt.x = Math.max(sa.x + cs * 0.5, Math.min(sa.x + sa.width - cs * 0.5, pt.x));
                pt.y = Math.max(sa.y + cs * 0.5, Math.min(sa.y + sa.height - cs * 0.5, pt.y));
            }
        }
    }

    return note;
};

RhythmGame.prototype.spawnBurstCluster = function (anchorNote, clusterSize = 3) {
    if (!anchorNote) return [];
    const notes = [];
    const baseSlot = Number(anchorNote.groupSlot || 0);
    for (let i = 1; i < clusterSize; i++) {
        const slot = (baseSlot + i) % 4;
        const lane = (Number(anchorNote.laneHint || 0) + i) % 4;
        const pos = this.resolveGroupPatternPosition({
            laneIndex: lane,
            laneCount: 4,
            chartIndex: (anchorNote.noteNumber || 0) + i,
            phrase: anchorNote.groupIndex || 0,
            groupSlot: slot,
            segmentLabel: anchorNote.segmentLabel || 'chorus'
        });
        this.globalNoteSeq += 1;
        const type = 'click';
        const note = {
            ...anchorNote,
            x: pos.x,
            y: pos.y,
            beatNumber: this.globalNoteSeq,
            noteNumber: this.globalNoteSeq,
            noteType: type,
            isDrag: false,
            held: false,
            completed: false,
            progress: 0,
            laneHint: lane,
            groupSlot: slot,
            score: null,
            hit: false,
            createTime: this.resolveChartClock(),
            groupPattern: pos.pattern
        };
        notes.push(note);
    }
    return this.applyGroupMechanics(notes, {
        pattern: anchorNote.groupPattern || 'burst',
        groupIndex: anchorNote.groupIndex || 0,
        segmentLabel: anchorNote.segmentLabel || 'chorus'
    });
};

RhythmGame.prototype.generateLiveGridNotes = function (currentTime) {
    if (!this.liveEngine) this.initLiveEngine();
    const eng = this.liveEngine;
    const lookahead = this.approachRate / 1000;

    while (eng.nextTime <= currentTime + lookahead) {
        const idx = eng.step % 16;
        if (idx === 0) {
            eng.dragSpawnedInBar = 0;
            eng.lastWasDrag = false;
        }

        const accTotal = this.judgementStats.perfect + this.judgementStats.good + this.judgementStats.miss;
        const acc = accTotal ? ((this.judgementStats.perfect + this.judgementStats.good * 0.6) / accTotal) : 0.8;
        const adaptiveDensity = Math.max(0.55, Math.min(1.35, eng.density * (0.85 + acc * 0.4)));

        const remainSteps = 15 - idx;
        const needDrag = Math.max(0, eng.dragQuotaPerBar - eng.dragSpawnedInBar);
        const forceDragNow = needDrag > 0 && remainSteps < needDrag;
        const baseSpawn = eng.pattern16[idx] === 1 && Math.random() < adaptiveDensity;
        const spawn = forceDragNow || baseSpawn;

        if (spawn) {
            let wantDrag = false;
            if (forceDragNow) wantDrag = true;
            else if (!eng.lastWasDrag && eng.dragSpawnedInBar < eng.dragQuotaPerBar) {
                const dragChance = idx % 4 === 0 ? 0.45 : 0.2;
                wantDrag = Math.random() < dragChance;
            }

            const note = this.createLiveNote(currentTime, eng.nextTime, wantDrag);
            if (note) {
                note.laneHint = Math.abs(note.groupSlot || 0) % 4;
                let groupNotes = [note];
                const chorusBurst = note.segmentLabel === 'chorus' && (idx === 0 || idx === 8);
                if (chorusBurst) {
                    const extras = this.spawnBurstCluster(note, 3);
                    groupNotes = [note, ...extras];
                }
                this.applyGroupMechanics(groupNotes, {
                    pattern: note.groupPattern,
                    groupIndex: note.groupIndex,
                    segmentLabel: note.segmentLabel || 'live'
                });
                this.notes.push(...groupNotes);
                if (groupNotes.some(n => n.isDrag)) eng.dragSpawnedInBar += 1;
                eng.lastWasDrag = groupNotes.some(n => n.isDrag);
            }
        }

        eng.step += 1;
        if (eng.step % 16 === 0) eng.bar += 1;
        eng.nextTime += eng.beatSec / 2;
    }
};


RhythmGame.prototype.getCurrentSegment = function (timeSec) {
    const segs = (this.liveConfig && this.liveConfig.segments) || (this.liveConfig && this.liveConfig.analysis && this.liveConfig.analysis.segments) || [];
    return segs.find(s => timeSec >= s.start && timeSec < s.end) || null;
};

RhythmGame.prototype.applySegmentProfile = function (timeSec) {
    if (!this.liveEngine) return;
    const seg = this.getCurrentSegment(timeSec);
    if (!seg) return;
    const key = seg.start + ':' + seg.end;
    if (this.liveEngine.segmentKey === key) return;
    this.liveEngine.segmentKey = key;
    this.liveEngine.signatureMode = seg.label === 'chorus' ? 'drag' : (seg.label === 'bridge' ? 'tap' : 'mixed');
    this.liveEngine.density = seg.energy === 'high' ? 1.08 : (seg.energy === 'mid' ? 0.9 : 0.68);
    this.liveEngine.dragQuotaPerBar = seg.dragRatio >= 0.24 ? 2 : 1;
    this.liveEngine.phrase.radius = seg.phraseRadius || (seg.label === 'chorus' ? 260 : seg.label === 'verse' ? 220 : 185);
    this.liveEngine.phrase.left = seg.label === 'chorus' ? 6 : (seg.label === 'verse' ? 5 : 4);
    if (seg.label === 'chorus') {
        this.liveEngine.pattern16 = [1,1,1,0, 1,1,0,1, 1,1,1,0, 1,0,1,1];
    } else if (seg.label === 'verse') {
        this.liveEngine.pattern16 = [1,0,1,0, 1,1,0,0, 1,0,1,0, 0,1,0,1];
    } else {
        this.liveEngine.pattern16 = [1,0,0,0, 1,0,1,0, 0,0,1,0, 1,0,0,0];
    }
};

RhythmGame.prototype.watchPlaybackIntegrity = function () {
    // Playback monitor only: emits observations and lets the orchestrator/game decide how to react.
    if (!this.liveMode || !this.liveConfig) return;
    if (this.liveMonitorTimer) clearInterval(this.liveMonitorTimer);
    let prevT = -1;
    let stagnantTicks = 0;
    let ytPausedTicks = 0;
    this.liveMonitorTimer = setInterval(() => {
        if (!this.isPlaying || !this.liveMode || this.isPausedPhase()) return;
        const t = this.getLiveCurrentTime();
        const runSec = this.getChartWallClockTime();
        const startupGrace = runSec < 6;
        if (prevT >= 0 && t + 0.35 < prevT) {
            this.runOrchestrator?.handleMonitorEvent?.('seek-back', { currentTime: t, previousTime: prevT, runSec });
        }
        if (prevT >= 0 && Math.abs(t - prevT) < 0.02) stagnantTicks += 1; else stagnantTicks = 0;
        prevT = t;
        const ytState = this.playbackController?.getYouTubePlayerState ? this.playbackController.getYouTubePlayerState() : (this._ytPlayer && this._ytPlayer.getPlayerState ? this._ytPlayer.getPlayerState() : null);
        if (ytState != null) {
            const st = ytState;
            if (st === 2) ytPausedTicks += 1; else ytPausedTicks = 0;
            if (!startupGrace && ytPausedTicks >= 4) {
                this.runOrchestrator?.handleMonitorEvent?.('yt-paused', { runSec, ytPausedTicks });
                ytPausedTicks = 0;
                return;
            }
        }
        const audioHealthy = this.playbackController?.isAudioHealthy ? this.playbackController.isAudioHealthy() : (() => {
            const a = document.getElementById('liveAudio');
            return Boolean(a && !a.paused && !a.ended);
        })();
        if (audioHealthy) {
            this.runOrchestrator?.handleMonitorEvent?.('healthy', { runSec, currentTime: t });
        }
        if (!startupGrace && stagnantTicks >= 10) {
            this.runOrchestrator?.handleMonitorEvent?.('stalled', { runSec, stagnantTicks, currentTime: t });
            stagnantTicks = 0;
        }
    }, 500);
};

RhythmGame.prototype.refreshGroupState = function () {
    const activeNotes = (this.notes || []).filter(n => !n.hit && !n.completed);
    if (!activeNotes.length) {
        this.activeGroupState = null;
        return null;
    }
    const groups = new Map();
    for (const note of activeNotes) {
        const key = `${note.segmentLabel || 'none'}:${note.groupIndex || 0}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(note);
    }
    let chosen = null;
    for (const [key, notes] of groups.entries()) {
        if (!chosen || notes.length > chosen.notes.length) chosen = { key, notes };
    }
    if (!chosen) {
        this.activeGroupState = null;
        return null;
    }
    const pattern = chosen.notes[0]?.groupPattern || 'fan';
    this.activeGroupState = {
        key: chosen.key,
        pattern,
        size: chosen.notes.length,
        segmentLabel: chosen.notes[0]?.segmentLabel || 'unknown'
    };
    return this.activeGroupState;
};

RhythmGame.prototype.registerGroupCompletion = function (groupKey, note) {
    if (!groupKey || !note) return;
    const tail = this.groupHistory[this.groupHistory.length - 1];
    if (tail && tail.key === groupKey) return;
    this.groupHistory.push({
        key: groupKey,
        at: performance.now(),
        pattern: note.groupPattern || 'fan',
        segmentLabel: note.segmentLabel || 'unknown',
        size: note.groupSize || 1
    });
    if (this.groupHistory.length > 8) this.groupHistory.shift();
};

RhythmGame.prototype.pickGroupPattern = function (phrase, segmentLabel) {
    const chorusPatterns = ['burst', 'diamond', 'fan', 'ladder'];
    const versePatterns = ['ladder', 'fan', 'diamond', 'burst'];
    const pool = (segmentLabel === 'chorus' || segmentLabel === 'bridge') ? chorusPatterns : versePatterns;
    // Golden-ratio hashing: breaks the mod-4 period, gives period ~200+ before repeating
    const p = Math.abs(Number(phrase || 0));
    const mixed = Math.floor(((p * 0.6180339887) % 1) * pool.length);
    return pool[mixed];
};

RhythmGame.prototype.applyMechanicQuotas = function (notes) {
    if (window.ChartPolicy?.spreadQuotaPromotions) return window.ChartPolicy.spreadQuotaPromotions(notes);
    return notes;
};

RhythmGame.prototype.enforceChartPlayability = function (notes) {
    if (window.ChartPolicy?.enforceChartPlayability) return window.ChartPolicy.enforceChartPlayability(notes);
    return notes;
};

RhythmGame.prototype.getLayoutAudit = function (notes) {
    if (window.ChartPolicy?.auditFootprints) return window.ChartPolicy.auditFootprints(notes, this.circleSize);
    return [];
};

RhythmGame.prototype.applyGroupMechanics = function (notes, context = {}) {
    if (!Array.isArray(notes) || !notes.length) return notes;
    const pattern = context.pattern || this.pickGroupPattern(context.groupIndex || notes[0]?.groupIndex || 0, context.segmentLabel || notes[0]?.segmentLabel || 'verse');
    const size = notes.length;
    notes.forEach((note, idx) => {
        note.groupPattern = pattern;
        note.groupSize = size;
        note.groupRole = idx === 0 ? 'lead' : (idx === size - 1 ? 'accent' : 'body');
        note.groupKey = `${note.segmentLabel || context.segmentLabel || 'none'}:${note.groupIndex || context.groupIndex || 0}`;
        this.applyNoteMechanicProfile(note, { pattern, size, idx, segmentLabel: note.segmentLabel || context.segmentLabel || 'verse' });
    });
    return notes;
};

RhythmGame.prototype.pickChartNoteType = function (note, idx, inPhraseIndex = 0) {
    if (note && note.type) return note.type;
    const segment = note?.segmentLabel || 'verse';
    const cycle = idx % 16;
    if (segment === 'chorus' && (cycle === 11 || cycle === 12)) return 'drag';
    if ((idx + inPhraseIndex) % 6 === 0) return 'drag';
    return 'click';
};

RhythmGame.prototype.pickLiveNoteType = function (seq, groupIndex, preferDrag) {
    if (groupIndex % 4 === 3 && seq % 6 === 0) return 'drag';
    if (preferDrag && seq % 6 === 0) return 'drag';
    return preferDrag ? 'drag' : 'click';
};

RhythmGame.prototype.resolveGroupPatternPosition = function ({ laneIndex, laneCount, chartIndex, phrase, groupSlot, segmentLabel, phraseAnchor = null, previousLane = null, phraseIntent = null }) {
    const laneWidth = this.safeArea.width / laneCount;
    const anchorLane = Number.isFinite(phraseAnchor) ? Math.max(0, Math.min(laneCount - 1, phraseAnchor)) : laneIndex;
    const localizedLane = Number.isFinite(previousLane)
        ? Math.max(0, Math.min(laneCount - 1, previousLane + Math.max(-1, Math.min(1, laneIndex - previousLane))))
        : laneIndex;
    const blendedLane = Number.isFinite(previousLane)
        ? ((anchorLane * 0.3) + (localizedLane * 0.7))
        : ((anchorLane * 0.45) + (laneIndex * 0.55));
    const baseX = this.safeArea.x + laneWidth * (blendedLane + 0.5);
    const rowBand = segmentLabel === 'chorus' ? 0.34 : (segmentLabel === 'verse' ? 0.52 : 0.42);
    const intentYOffset = phraseIntent === 'sweep' ? -0.04 : (phraseIntent === 'pivot' ? 0.03 : 0);
    // Per-phrase golden-ratio Y jitter: avoids all notes piling in the same horizontal row
    const phiJitter = (((Math.abs(Number(phrase || 0)) * 0.6180339887) % 1) - 0.5) * 0.22;
    const baseY = this.safeArea.y + this.safeArea.height * Math.max(0.20, Math.min(0.78, rowBand + intentYOffset + phiJitter));
    const pattern = this.pickGroupPattern(phrase, segmentLabel);
    const offsets = {
        fan: [
            { x: -1.1, y: 0.7 }, { x: -0.38, y: -0.15 }, { x: 0.42, y: -0.72 }, { x: 1.06, y: 0.08 }
        ],
        burst: [
            { x: 0, y: -1.05 }, { x: 1.0, y: -0.1 }, { x: 0, y: 0.95 }, { x: -1.0, y: -0.1 }
        ],
        ladder: [
            { x: -1.12, y: -0.9 }, { x: -0.36, y: -0.3 }, { x: 0.42, y: 0.34 }, { x: 1.1, y: 0.92 }
        ],
        diamond: [
            { x: 0, y: -1.1 }, { x: 1.08, y: 0 }, { x: 0, y: 1.02 }, { x: -1.08, y: 0 }
        ]
    };
    const offset = (offsets[pattern] || offsets.fan)[Math.abs(groupSlot || 0) % 4];
    const compactness = Number.isFinite(previousLane) ? 0.82 : 1;
    const chorusBoost = segmentLabel === 'chorus' ? 1.18 : 1;
    const span = this.circleSize * (segmentLabel === 'chorus' ? 1.35 : 1.05) * compactness * chorusBoost;
    const x = Math.max(this.safeArea.x + this.circleSize, Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, baseX + offset.x * span));
    const y = Math.max(this.safeArea.y + this.circleSize, Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, baseY + offset.y * span));
    return { x, y, pattern, laneFloat: blendedLane, anchorLane };
};

RhythmGame.prototype.applyNoteMechanicProfile = function (note, context = {}) {
    if (!note) return note;
    note.finalMechanicLocked = true;
    note.groupMechanicContext = {
        pattern: context.pattern || note.groupPattern || null,
        size: context.size || note.groupSize || 1,
        idx: context.idx ?? 0,
        segmentLabel: context.segmentLabel || note.segmentLabel || 'verse'
    };

    // Gameplay cleanup: keep only click / tap / drag / spin as core mechanics.
    // Remove gate / flick / cut, and collapse free-standing holds into click.
    if (['gate', 'flick', 'cut', 'hold', 'pulseHold'].includes(note.noteType)) {
        note.noteType = 'click';
        note.type = 'click';
        note.holdDuration = 0;
        note.holdProgress = 0;
        note.gateWidth = null;
        note.flickVector = null;
        note.swipeDistance = null;
        note.keyboardCheckpoint = false;
        note.keyboardHit = false;
    }

    if (note.noteType === 'drag' && note.inputChannel === 'keyboard') {
        note.inputChannel = 'mouse';
        note.keyHint = null;
        note.keyboardHint = null;
        note.keyboardKey = null;
    }
    if (note.noteType === 'spin' && note.inputChannel === 'keyboard') {
        note.inputChannel = 'mouse';
        note.keyHint = null;
        note.keyboardHint = null;
        note.keyboardKey = null;
    }
    if (note.noteType === 'tap') {
        note.inputChannel = 'keyboard';
        if (!note.keyHint) {
            note.keyHint = 'F';
            note.keyboardKey = 'f';
        }
    } else if (note.noteType === 'click') {
        note.inputChannel = 'mouse';
        note.keyHint = null;
        note.keyboardHint = null;
        note.keyboardKey = null;
    }

    if (note.noteType === 'drag' && note.pathVariant === 'starTrace') {
        note.ribbonWidth = this.circleSize * 0.9;
        note.traceStrictness = 0.2;
    }
    if (note.noteType === 'drag' && window.PathTemplates?.chooseTemplate) {
        // If already set to a final shape by the note-creation remap, do NOT override.
        const _finalShapes = { heart: true, vortex: true };
        if (!_finalShapes[note.pathTemplate]) {
            const activeTemplates = (this.notes || []).filter(n => !n.hit && !n.completed).map(n => n.pathTemplate).filter(Boolean).slice(-4);
            const tuning = this.runtimeTuning || {};
            const geometryFloor = Number(tuning.forceGeometryFloor || 2);
            const geometrySeenCount = (this.notes || []).filter(n => ['diamondLoop', 'starTrace'].includes(n.pathTemplate)).length;
            const shouldForceGeometry = (note.segmentLabel === 'chorus' || note.segmentLabel === 'bridge') && geometrySeenCount < geometryFloor;
            const chosen = note.pathTemplate || note.pathVariant || window.PathTemplates.chooseTemplate(note, document.getElementById('difficultySelect')?.value || 'normal', {
                recentTemplates: activeTemplates,
                forceGeometry: shouldForceGeometry,
                forceGeometryFloor: geometryFloor,
                geometryBiasBoost: Number(tuning.geometryBiasBoost || 0)
            });
            const _dragRemap = { starTrace: 'heart', diamondLoop: 'heart', zigzag: 'vortex', spiral: 'vortex', scurve: 'vortex', orbit: 'vortex' };
            note.pathTemplate = _dragRemap[chosen] || chosen || 'heart';
            note.pathVariant = note.pathTemplate;
        }
    }
    note.keyboardCheckpoint = false;
    note.keyboardHit = false;

    // Sync keyboardHint from keyHint — keyHint is the authoritative source set by chart-policy.
    // Do NOT override keyHint/keyboardKey here — chart-policy already set them correctly.
    note.keyboardHint = note.keyHint || null;

    return note;
};

RhythmGame.prototype.recordJudgement = function (score, noteX, noteY) {
    if (!score || !this.judgementStats || !Object.prototype.hasOwnProperty.call(this.judgementStats, score)) return;
    if (score === 'perfect' || score === 'good' || score === 'miss') this.judgementStats[score] += 1;
    const x = (noteX != null) ? noteX : this.canvas.width / 2;
    const y = (noteY != null) ? noteY - this.circleSize * 1.8 : this.canvas.height * 0.3;
    this.pushFloatJudge(score, x, y);
    this.updateHUD();
};

// ─── Result overlay shown after run finishes ─────────────────────────────────
RhythmGame.prototype.showResultOverlay = function () {
    const total = this.judgementStats.perfect + this.judgementStats.good + this.judgementStats.miss;
    const acc = total ? ((this.judgementStats.perfect + this.judgementStats.good * 0.6) / total) * 100 : 0;
    const score = Math.floor(this.score || 0);

    let overlay = document.getElementById('resultOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'resultOverlay';
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:9999',
            'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
            'background:rgba(4,10,20,1)',
            'font-family:"Press Start 2P",monospace',
            'color:#59efff', 'pointer-events:all'
        ].join(';');
        document.body.appendChild(overlay);
    }

    const grade = acc >= 95 ? 'S' : acc >= 85 ? 'A' : acc >= 70 ? 'B' : acc >= 55 ? 'C' : 'D';
    const gradeColor = acc >= 95 ? '#ffe95a' : acc >= 85 ? '#59efff' : acc >= 70 ? '#b892ff' : acc >= 55 ? '#ff9bb4' : '#ff5f76';

    // Hide input UI while result is showing
    const uploadContainer = document.getElementById('uploadContainer');
    if (uploadContainer) uploadContainer.classList.add('hidden');

    const btnStyle = `font-family:'Press Start 2P',monospace;font-size:9px;
        padding:12px 28px;border:2px solid;cursor:pointer;letter-spacing:2px;margin:0 8px;`;
    overlay.innerHTML = `
        <div style="font-size:10px;letter-spacing:4px;color:rgba(89,239,255,.55);margin-bottom:18px">── RESULT ──</div>
        <div style="font-size:52px;color:${gradeColor};text-shadow:0 0 24px ${gradeColor},0 0 8px #fff;margin-bottom:24px">${grade}</div>
        <div style="font-size:22px;color:#fff;text-shadow:0 0 12px #59efff;margin-bottom:32px">${String(score).padStart(7,'0')}</div>
        <div style="display:flex;gap:32px;margin-bottom:36px">
            <div style="text-align:center">
                <div style="font-size:18px;color:#59efff;text-shadow:0 0 10px #59efff">${this.judgementStats.perfect}</div>
                <div style="font-size:7px;color:rgba(89,239,255,.55);margin-top:6px">PERFECT</div>
            </div>
            <div style="text-align:center">
                <div style="font-size:18px;color:#ff9bb4;text-shadow:0 0 10px #ff9bb4">${this.judgementStats.good}</div>
                <div style="font-size:7px;color:rgba(255,155,180,.55);margin-top:6px">GOOD</div>
            </div>
            <div style="text-align:center">
                <div style="font-size:18px;color:#ff5f76;text-shadow:0 0 10px #ff5f76">${this.judgementStats.miss}</div>
                <div style="font-size:7px;color:rgba(255,95,118,.55);margin-top:6px">MISS</div>
            </div>
        </div>
        <div style="font-size:9px;color:rgba(89,239,255,.6);margin-bottom:28px">ACCURACY ${acc.toFixed(1)}%</div>
        <div style="display:flex;align-items:center;justify-content:center">
            <button id="resultRetryBtn" style="${btnStyle}background:rgba(89,239,255,.08);border-color:#59efff;color:#59efff;text-shadow:0 0 10px #59efff;">PLAY AGAIN</button>
            <button id="resultMenuBtn" style="${btnStyle}background:rgba(255,79,174,.08);border-color:#ff4fae;color:#ff4fae;text-shadow:0 0 10px #ff4fae;">BACK TO MENU</button>
        </div>`;
    overlay.style.display = 'flex';

    const hideOverlay = () => { overlay.style.display = 'none'; };

    const retryBtn = document.getElementById('resultRetryBtn');
    if (retryBtn) retryBtn.onclick = () => {
        hideOverlay();
        // Directly restart the game with the same song — skip input page
        this.startGame();
    };

    const menuBtn = document.getElementById('resultMenuBtn');
    if (menuBtn) menuBtn.onclick = () => {
        hideOverlay();
        this.isPlaying = false;
        this.resetRunVisualState();
        this.setRunPhase('idle');
        this.setScene('input', { force: true });
        // Show input UI
        if (uploadContainer) uploadContainer.classList.remove('hidden');
    };
};

// ─── Float judge text at note position ───────────────────────────────────────
RhythmGame.prototype.floatJudges = [];
RhythmGame.prototype.pushFloatJudge = function (type, x, y) {
    const cfg = {
        perfect: { text: 'PERFECT', color: '#59efff', shadow: '#59efff', size: 42 },
        good:    { text: 'GOOD',    color: '#ff9bb4', shadow: '#ff9bb4', size: 36 },
        miss:    { text: 'MISS',    color: '#ff5f76', shadow: '#ff5f76', size: 22 },
    };
    const c = cfg[type] || cfg.good;
    (this.floatJudges = this.floatJudges || []).push({ text: c.text, color: c.color, shadow: c.shadow, size: c.size, x, y: y || (this.canvas.height * 0.3), at: performance.now(), lifeMs: 1100 });
};

RhythmGame.prototype.resetRunVisualState = function () {
    this.combo = 0;
    this.score = 0;
    this.notes = [];
    this.floatJudges = [];
    this.comboBanners = [];
    this.currentDragNote = null;
    this.currentSpinNote = null;
    this.pointerState = { down: false, x: 0, y: 0, startedAt: 0, startX: 0, startY: 0 };
    this.visualBursts = [];
    this.signatureBursts = [];
    this.feedbackBanners = [];
    this.countdownFlash = null;
    if (this.ctx?.clearRect && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width || 0, this.canvas.height || 0);
    }
    const backgroundCanvas = document.getElementById('backgroundCanvas');
    const backgroundCtx = backgroundCanvas?.getContext ? backgroundCanvas.getContext('2d') : null;
    if (backgroundCtx?.clearRect && backgroundCanvas) {
        backgroundCtx.clearRect(0, 0, backgroundCanvas.width || 0, backgroundCanvas.height || 0);
    }
    this.updateHUD();
};

// Initialize the game
window.addEventListener("load", () => {
    window.game = new RhythmGame();
});
