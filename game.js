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
        this.tutorialSeenCounts = {};
        this.visualBursts = [];
        this.signatureBursts = [];
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
        this.circleSize = 60; // Target circle size
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
        this.currentHoldNote = null;
        this.currentGateNote = null;
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
        else if (phase === 'playing') this.setScene('playing');
        else if (phase === 'paused-user' || phase === 'paused-system') this.setScene('playing');
        else if (phase === 'ready') this.setScene('ready');
        else if (phase === 'idle') this.setScene('input');
        else if (phase === 'finished') this.setScene('ready', { force: true });
        else if (phase === 'failed') this.setScene('ready', { force: true });
        else this.updateHUD();
    }

    isPausedPhase() {
        return this.gameState === 'paused-user' || this.gameState === 'paused-system';
    }

    isRunningPhase() {
        return this.gameState === 'playing';
    }

    isStartingPhase() {
        return this.gameState === 'starting';
    }

    renderScene() {
        const uploadContainer = document.getElementById('uploadContainer');
        const pauseOverlay = document.getElementById('pauseOverlay');
        const inRun = this.isPlaying || this.isStartingPhase() || this.scene === 'countdown' || this.scene === 'playing' || this.isPausedPhase();
        const showSetup = !inRun && (this.scene === 'input' || this.scene === 'ready');
        if (uploadContainer) uploadContainer.classList.toggle('hidden', !showSetup);
        if (pauseOverlay && (this.scene === 'countdown' || this.scene === 'playing' || this.scene === 'error' || inRun)) {
            pauseOverlay.classList.toggle('hidden', !(this.isPausedPhase()));
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
            if (this.audioBuffer || this.liveMode || this.readyMode) {
                try {
                    this.setScene('countdown', { error: '' });
                    await this.startGame();
                } catch (err) {
                    console.error('startGame failed:', err);
                    this.setStatusMessage('error', 'Start failed: ' + (err?.message || 'unknown error'));
                    this.livePlaybackState = 'start-error';
                    this.setScene('ready', { error: err?.message || 'unknown error' });
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
            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault();
                this.handleKeyboardAction('space');
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
        await this.prepareRun();
        await this.runCountdown();
        const dataArray = this.beginRun();
        this.startPlaybackBackend();
        this.armGameLoop(dataArray);
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
                const seededType = this.pickChartNoteType(n, idx, inPhraseIndex);
                return {
                    ...n,
                    time: Number(Math.max(0.6, normalizedTime + nudge + (idx % 8 === 0 ? 0.005 : 0)).toFixed(3)),
                    type: n.type || seededType,
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
                this.chartData.notes = window.ChartPolicy.finalizePlayableChartPipeline(this.chartData.notes, { circleSize: this.circleSize, openingSeconds: 12, sustainedCooldownSec: 1.6, holdCooldownSec: 2.6, minFirst30: 12, minPer10: 3, maxTapRatio: 0.45, minLatterSpecialRatio: 0.4 });
            } else {
                this.applyMechanicQuotas(this.chartData.notes);
                this.enforceChartPlayability(this.chartData.notes);
                if (window.ChartPolicy?.resolvePathConflicts) {
                    this.chartData.notes = window.ChartPolicy.resolvePathConflicts(this.chartData.notes, this.circleSize);
                }
            }
            const layoutIssues = this.getLayoutAudit(this.chartData.notes.map((n, idx) => ({
                x: this.safeArea.x + (this.safeArea.width / 4) * (((n.laneHint ?? idx % 4) + 0.5)),
                y: this.safeArea.y + this.safeArea.height * ((n.segmentLabel || 'verse') === 'chorus' ? 0.34 : ((n.segmentLabel || 'verse') === 'verse' ? 0.52 : 0.42)),
                endX: Number.isFinite(n.endX) ? n.endX : undefined,
                endY: Number.isFinite(n.endY) ? n.endY : undefined,
                noteType: n.type,
                gateWidth: n.gateWidth
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
            source.start();
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
        }
    }

    async resumeRunSequence() {
        const pausedFor = Math.max(0, (performance.now() - (this.pausedAt || performance.now())) / 1000);
        this.pauseAccumulated += pausedFor;
        const overlayText = document.getElementById('pauseOverlayText');
        for (const n of [3,2,1]) {
            if (overlayText) overlayText.textContent = 'Resuming in ' + n;
            await new Promise(r => setTimeout(r, 600));
        }
        this.setRunPhase('playing');
        this.pauseReason = 'none';
        this.resumePlaybackMedia();
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
                const panelW = Math.min(560, this.canvas.width * 0.72);
                const panelH = 270;
                const x = this.canvas.width / 2 - panelW / 2;
                const y = this.canvas.height / 2 - panelH / 2;

                this.ctx.fillStyle = 'rgba(5,8,12,.78)';
                this.ctx.strokeStyle = 'rgba(255,255,255,.1)';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.roundRect(x, y, panelW, panelH, 24);
                this.ctx.fill();
                this.ctx.stroke();

                this.ctx.strokeStyle = 'rgba(84,241,255,.22)';
                this.ctx.beginPath();
                this.ctx.moveTo(x + 24, y + 42);
                this.ctx.lineTo(x + panelW - 24, y + 42);
                this.ctx.stroke();

                this.ctx.fillStyle = 'rgba(255,184,77,.92)';
                this.ctx.font = '700 14px Rajdhani';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('SYSTEM ARMING', this.canvas.width / 2, y + 28);

                this.ctx.fillStyle = '#fff';
                this.ctx.font = '900 110px Archivo';
                this.ctx.fillText(remaining, this.canvas.width / 2, this.canvas.height / 2 + 12);

                this.ctx.fillStyle = 'rgba(228,241,248,.88)';
                this.ctx.font = '700 18px Rajdhani';
                this.ctx.fillText(`VOCAL SEGMENTS  ${totalVocalSections}`, this.canvas.width / 2, y + 174);
                this.ctx.fillText(`AVG GROUP LOAD  ${avgButtonsPerGroup}`, this.canvas.width / 2, y + 202);
                this.ctx.fillStyle = 'rgba(228,241,248,.58)';
                this.ctx.font = '600 14px Rajdhani';
                this.ctx.fillText('Synchronizing track and gameplay shell...', this.canvas.width / 2, y + 232);
                
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

    syncReadyState() {
        const startButton = document.getElementById('startGame');
        const hasOffline = Boolean(this.audioBuffer && this.readyMode === 'offline');
        const hasLive = Boolean(this.readyMode && (this.liveMode || this.chartMode || this.liveConfig || this.chartData));
        const ready = hasOffline || hasLive;
        if (startButton && !this.isPlaying && this.gameState !== 'starting') {
            startButton.disabled = !ready;
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
        return this.resolveRunClock();
    }

    advanceChartRuntime() {
        if (!(this.chartMode && this.chartData?.notes?.length)) return 0;
        const chartTime = this.resolveChartClock();
        if (this.liveMode) this.applySegmentProfile(chartTime);
        if (this.chartRuntime?.spawnUntil) {
            const visibleSustainedCount = (this.notes || []).filter(n => !n.hit && !n.completed && ['pulseHold','drag','ribbon','orbit','diamondLoop','starTrace'].includes(n.noteType || n.type)).length;
            const spawned = this.chartRuntime.spawnUntil(chartTime, (currentTime, chartNote, chartIndex) => this.createChartNoteFromData(currentTime, chartNote, chartIndex), { openingRampSec: 2.8, visibleSustainedCap: chartTime < 3.2 ? 1 : 2, visibleSustainedCount });
            if (spawned?.length) {
                this.notes.push(...spawned);
                this.spawnedChartNotes += spawned.length;
                this.captureRuntimeDiagnostics('chart-spawn', {
                    lastChartSpawnAt: chartTime,
                    lastChartSpawnCount: spawned.length,
                    lastSpawnedCount: this.spawnedChartNotes
                });
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

            if ((note.isDrag || note.noteType === 'ribbon') && note.completed) {
                if (note.score && (currentTime - note.hitTime > 1)) {
                    return false;
                }
                return true;
            }

            if (note.noteType === 'pulseHold' && note.held && !note.completed) {
                note.holdProgress = Math.max(0, Math.min(1, (currentTime - (note.holdStartTime || currentTime)) / Math.max(0.2, note.holdDuration || 0.9)));
                if (note.holdProgress >= 1) {
                    note.completed = true;
                    note.hit = true;
                    note.score = 'perfect';
                    this.score += 1400 * (1 + this.combo * 0.1);
                    this.combo++;
                    this.recordJudgement('perfect');
                    this.createHitEffect(note.x, note.y, 'perfect');
                    if (this.currentHoldNote === note) this.currentHoldNote = null;
                    return true;
                }
            }
            
            if (!note.hit && !note.held && currentTime > note.hitTime + this.goodRange / 1000) {
                note.hit = true;
                note.score = 'miss';
                this.combo = 0;
                this.recordJudgement('miss');
                return true;
            }
            
            if ((note.isDrag || note.noteType === 'ribbon') && note.held && !note.completed && currentTime > note.hitTime + 5) {
                note.hit = true;
                note.held = false;
                note.completed = true;
                note.score = 'miss';
                this.combo = 0;
                this.recordJudgement('miss');
                this.currentDragNote = null;
                return true;
            }

            if (note.noteType === 'pulseHold' && note.held && !note.completed && currentTime > note.hitTime + Math.max(1.6, (note.holdDuration || 0.9) + 1.2)) {
                note.hit = true;
                note.held = false;
                note.completed = true;
                note.score = 'miss';
                this.combo = 0;
                this.recordJudgement('miss');
                if (this.currentHoldNote === note) this.currentHoldNote = null;
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
                tap: { lead: 0.72, size: 0.84 },
                flick: { lead: 0.62, size: 0.8 },
                cut: { lead: 0.58, size: 0.76 },
                pulseHold: { lead: 0.82, size: 0.9 },
                drag: { lead: 0.8, size: 0.88 },
                ribbon: { lead: 0.86, size: 0.92 },
                gate: { lead: 0.74, size: 0.86 }
            };
            const profile = approachProfiles[note.noteType || 'tap'] || approachProfiles.tap;
            const visualApproachSec = (this.visualApproachDurationMs / 1000) * profile.lead;
            note.approachProgress = Math.max(0, Math.min(1, 1 - timeUntilHit / Math.max(0.18, visualApproachSec)));
            const palette = this.getNotePalette(note);
            const spawnPop = Math.min(1, Math.max(0, (performance.now() - ((note.spawnedAtWall || performance.now()) || performance.now())) / 220));
            const popScale = 0.9 + 0.1 * spawnPop;
            const tighten = timeUntilHit <= 0.15 ? 1 + (0.15 - Math.max(0, timeUntilHit)) * 1.1 : 1;
            const bodyPulse = 1 + Math.sin(performance.now() / 150 + (note.noteNumber || 0)) * 0.018 * Math.max(0, note.approachProgress - 0.25);

            // Draw contracting circle
            if (!note.hit) {
                const approachSize = Math.max(
                    this.circleSize,
                    this.approachCircleSize * profile.size * (1 - note.approachProgress) + this.circleSize
                );
                if (approachSize > this.circleSize) {
                    this.ctx.beginPath();
                    this.ctx.arc(note.x, note.y, approachSize, 0, Math.PI * 2);
                    const palette = this.getNotePalette(note);
                    this.ctx.strokeStyle = palette.glow.replace('.45', '.22').replace('.4', '.22').replace('.36', '.22').replace('.26', '.18');
                    this.ctx.lineWidth = note.isDrag ? 3 : 2;
                    this.ctx.shadowBlur = 18;
                    this.ctx.shadowColor = palette.edge;
                    this.ctx.stroke();
                    this.ctx.shadowBlur = 0;
                }
            }

            if (note.noteType === 'gate') {
                const gateWidth = note.gateWidth || this.circleSize * 2.6;
                const gateHeight = this.circleSize * 1.35;
                const gateAlpha = 0.18 + note.approachProgress * 0.18;
                const gatePulse = 1 + Math.sin(performance.now() / 120) * 0.06;
                this.ctx.strokeStyle = palette.glow.replace('.34', `${Math.min(0.4, gateAlpha + 0.12).toFixed(2)}`);
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(note.x - (gateWidth * gatePulse) / 2, note.y - gateHeight / 2, gateWidth * gatePulse, gateHeight);
                this.ctx.beginPath();
                this.ctx.moveTo(note.x, note.y - gateHeight * 0.75);
                this.ctx.lineTo(note.x, note.y + gateHeight * 0.75);
                this.ctx.strokeStyle = palette.edge;
                this.ctx.setLineDash([8, 8]);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }

            if (note.noteType === 'pulseHold') {
                const holdRadius = this.circleSize * (1.1 + (1 - note.approachProgress) * 0.45);
                const pulse = 1 + Math.sin(performance.now() / 140) * 0.08;
                this.ctx.beginPath();
                this.ctx.arc(note.x, note.y, holdRadius * pulse, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (note.held ? (note.holdProgress || 0) : 1));
                this.ctx.strokeStyle = note.held ? palette.edge : palette.glow.replace('.36', '.28').replace('.34', '.28');
                this.ctx.lineWidth = 4.5;
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.arc(note.x, note.y, this.circleSize * 1.38, 0, Math.PI * 2);
                this.ctx.strokeStyle = palette.glow.replace('.36', '.12').replace('.34', '.12');
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }

            if (note.noteType === 'flick' || note.noteType === 'cut') {
                const vec = note.flickVector || { x: 1, y: 0 };
                const len = this.circleSize * (note.noteType === 'cut' ? 1.6 : 1.25);
                this.ctx.beginPath();
                this.ctx.moveTo(note.x - vec.x * len * 0.8, note.y - vec.y * len * 0.8);
                this.ctx.lineTo(note.x + vec.x * len * 0.9, note.y + vec.y * len * 0.9);
                this.ctx.strokeStyle = 'rgba(255,255,255,0.18)';
                this.ctx.lineWidth = 6;
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.moveTo(note.x - vec.x * len * 0.45, note.y - vec.y * len * 0.45);
                this.ctx.lineTo(note.x + vec.x * len * 0.55, note.y + vec.y * len * 0.55);
                this.ctx.strokeStyle = palette.edge;
                this.ctx.lineWidth = note.noteType === 'cut' ? 5 : 3;
                this.ctx.stroke();
                const tipX = note.x + vec.x * len * 0.55;
                const tipY = note.y + vec.y * len * 0.55;
                this.ctx.beginPath();
                this.ctx.moveTo(tipX, tipY);
                this.ctx.lineTo(tipX - vec.x * 12 - vec.y * 7, tipY - vec.y * 12 + vec.x * 7);
                this.ctx.lineTo(tipX - vec.x * 12 + vec.y * 7, tipY - vec.y * 12 - vec.x * 7);
                this.ctx.closePath();
                this.ctx.fillStyle = palette.edge;
                this.ctx.globalAlpha = note.noteType === 'cut' ? 0.92 : 0.8;
                this.ctx.fill();
                this.ctx.globalAlpha = 1;
            }

            // If it's a drag button, draw the track
            if (note.isDrag) {
                // Draw curved track
                const palette = this.getNotePalette(note);
                if (note.noteType === 'ribbon') {
                    const ribbonPts = [];
                    for (let i = 0; i <= 40; i++) {
                        const t = i / 40;
                        const px = Math.pow(1-t, 2) * note.x + 2 * (1-t) * t * note.controlX + Math.pow(t, 2) * note.endX;
                        const py = Math.pow(1-t, 2) * note.y + 2 * (1-t) * t * note.controlY + Math.pow(t, 2) * note.endY;
                        ribbonPts.push({ x: px, y: py, wobble: Math.sin(t * Math.PI * 4 + performance.now() / 220) * this.circleSize * 0.08, flow: Math.sin(performance.now() / 160 + t * 9) * this.circleSize * 0.035 });
                    }
                    this.ctx.beginPath();
                    ribbonPts.forEach((pt, idx) => {
                        const y = pt.y + pt.wobble;
                        const x = pt.x + pt.flow;
                        if (idx === 0) this.ctx.moveTo(x, y);
                        else this.ctx.lineTo(x, y);
                    });
                    this.ctx.strokeStyle = palette.glow.replace('.38', '.20').replace('.36', '.20').replace('.34', '.20');
                    this.ctx.lineWidth = this.circleSize * 0.92;
                    this.ctx.lineCap = 'round';
                    this.ctx.stroke();
                }
                this.ctx.beginPath();
                this.ctx.lineCap = 'round';
                this.ctx.lineWidth = this.circleSize * (note.noteType === 'ribbon' ? 0.82 : 0.55);
                this.ctx.strokeStyle = note.noteType === 'ribbon'
                    ? palette.glow.replace('.38', '.18').replace('.36', '.18').replace('.34', '.18')
                    : palette.glow.replace('.38', '.10').replace('.36', '.10').replace('.34', '.10');
                if (note.extraPath?.points?.length) {
                    this.ctx.moveTo(note.extraPath.points[0].x, note.extraPath.points[0].y);
                    for (let i = 1; i < note.extraPath.points.length; i++) this.ctx.lineTo(note.extraPath.points[i].x, note.extraPath.points[i].y);
                } else {
                    this.ctx.moveTo(note.x, note.y);
                    this.ctx.quadraticCurveTo(note.controlX, note.controlY, note.endX, note.endY);
                }
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.lineCap = 'round';
                this.ctx.lineWidth = this.circleSize * (note.noteType === 'ribbon' ? 0.34 : 0.22);
                this.ctx.strokeStyle = note.noteType === 'ribbon' ? '#ffe6b7' : palette.edge;
                this.ctx.shadowBlur = 16;
                this.ctx.shadowColor = palette.edge;
                if (note.extraPath?.points?.length) {
                    this.ctx.moveTo(note.extraPath.points[0].x, note.extraPath.points[0].y);
                    for (let i = 1; i < note.extraPath.points.length; i++) this.ctx.lineTo(note.extraPath.points[i].x, note.extraPath.points[i].y);
                } else {
                    this.ctx.moveTo(note.x, note.y);
                    this.ctx.quadraticCurveTo(note.controlX, note.controlY, note.endX, note.endY);
                }
                this.ctx.stroke();
                this.ctx.shadowBlur = 0;
                
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
                    const fullPath = window.PathTemplates?.samplePathPoints ? window.PathTemplates.samplePathPoints(note, 100) : [];
                    const progressIndex = Math.min(fullPath.length - 1, Math.floor(note.progress * Math.max(1, fullPath.length - 1)));
                    
                    // Draw partial path up to current progress
                    this.ctx.beginPath();
                    this.ctx.moveTo(fullPath[0]?.x || note.x, fullPath[0]?.y || note.y);
                    this.ctx.lineCap = 'round';
                    this.ctx.lineWidth = this.circleSize * 0.26;
                    this.ctx.strokeStyle = palette.edge;
                    this.ctx.shadowBlur = 18;
                    this.ctx.shadowColor = palette.edge;
                    
                    for (let i = 1; i <= progressIndex; i++) {
                        this.ctx.lineTo(fullPath[i].x, fullPath[i].y);
                    }
                    
                    this.ctx.stroke();
                    this.ctx.shadowBlur = 0;
                    if (note.keyboardCheckpoint && note.keyboardHit) {
                        this.ctx.beginPath();
                        this.ctx.arc(currentX, currentY, this.circleSize * (0.92 + Math.sin(performance.now() / 120) * 0.08), 0, Math.PI * 2);
                        this.ctx.strokeStyle = 'rgba(255,255,255,0.34)';
                        this.ctx.lineWidth = 3;
                        this.ctx.stroke();
                    }
                    
                    // Draw drag point
                    this.ctx.beginPath();
                    this.ctx.arc(currentX, currentY, this.circleSize * 0.55, 0, Math.PI * 2);
                    const grad = this.ctx.createRadialGradient(currentX, currentY, 4, currentX, currentY, this.circleSize * 0.6);
                    grad.addColorStop(0, '#ffffff');
                    grad.addColorStop(.35, palette.core);
                    grad.addColorStop(1, 'rgba(255,255,255,0)');
                    this.ctx.fillStyle = grad;
                    this.ctx.fill();
                    
                    // Glow effect
                    const pulseSize = this.circleSize * (0.9 + Math.sin(Date.now() / 180) * 0.12);
                    this.ctx.beginPath();
                    this.ctx.arc(currentX, currentY, pulseSize, 0, Math.PI * 2);
                    this.ctx.strokeStyle = palette.glow.replace('.45', '.34').replace('.4', '.3').replace('.36', '.28').replace('.26', '.22');
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
                
                // Draw endpoint circle
                this.ctx.beginPath();
                this.ctx.arc(note.endX, note.endY, this.circleSize * 0.52, 0, Math.PI * 2);
                this.ctx.fillStyle = note.completed ? palette.core : 'rgba(255,255,255,.12)';
                this.ctx.fill();
                this.ctx.strokeStyle = palette.edge;
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }
            
            // Draw starting circle
            this.ctx.beginPath();
            this.ctx.arc(note.x, note.y, this.circleSize * 0.82 * popScale * tighten * bodyPulse, 0, Math.PI * 2);
            const noteGrad = this.ctx.createRadialGradient(note.x - 10, note.y - 12, 4, note.x, note.y, this.circleSize);
            noteGrad.addColorStop(0, '#ffffff');
            noteGrad.addColorStop(.28, palette.core);
            noteGrad.addColorStop(.7, 'rgba(16,22,34,.96)');
            noteGrad.addColorStop(1, 'rgba(8,12,18,.96)');
            this.ctx.fillStyle = noteGrad;
            this.ctx.shadowBlur = 24;
            this.ctx.shadowColor = palette.edge;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
            this.ctx.strokeStyle = palette.edge;
            this.ctx.lineWidth = 2.5;
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.arc(note.x, note.y, this.circleSize * (0.98 + Math.max(0, note.approachProgress - 0.85) * 0.12), 0, Math.PI * 2);
            this.ctx.strokeStyle = 'rgba(255,255,255,.08)';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();

            // Show sequence number / tutorial prompt in circle and draw lines between adjacent numbers
            if (!note.hit) {
                // If there is a previous note and they have consecutive numbers, draw a connecting line
                if (note.noteNumber > 1 && !note.isDrag) {
                    const prevNote = this.notes.find(n => !n.hit && n.noteNumber === note.noteNumber - 1);
                    if (prevNote) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(prevNote.x, prevNote.y);
                        this.ctx.lineTo(note.x, note.y);
                        const sameGroup = prevNote.groupKey && prevNote.groupKey === note.groupKey;
                        this.ctx.strokeStyle = sameGroup ? 'rgba(255,215,168,0.30)' : 'rgba(84,241,255,0.14)';
                        this.ctx.lineWidth = sameGroup ? 2.8 : 1.2;
                        if (sameGroup && note.groupPattern === 'diamond') this.ctx.setLineDash([8, 6]);
                        else if (sameGroup && note.groupPattern === 'ladder') this.ctx.setLineDash([2, 7]);
                        else this.ctx.setLineDash([]);
                        this.ctx.stroke();
                        this.ctx.setLineDash([]);
                    }
                }

                // Display tutorial prompt for first encounters, then compact marker
                this.ctx.fillStyle = '#f3fcff';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                const tutorialLimit = note.noteType === 'tap' ? 2 : 3;
                const seenCount = this.tutorialSeenCounts?.[note.noteType || 'tap'] || 0;
                const tutorialLabel = window.ChartPolicy?.tutorialLabelForType ? window.ChartPolicy.tutorialLabelForType(note.noteType || 'tap') : String(note.noteType || 'tap').toUpperCase();
                const marker = note.noteType === 'flick' ? '⇢' : note.noteType === 'cut' ? '✦' : note.noteType === 'pulseHold' ? '◉' : note.noteType === 'ribbon' ? '≈' : note.noteType === 'gate' ? '▣' : note.noteType === 'drag' ? '↘' : note.noteNumber.toString();
                if (seenCount < tutorialLimit || (note.keyboardCheckpoint && !note.keyboardHit)) {
                    const displayLabel = note.keyboardCheckpoint && !note.keyboardHit ? `${tutorialLabel} + ${note.keyboardHint || 'SPACE'}` : tutorialLabel;
                    const labelW = Math.max(this.circleSize * 1.8, displayLabel.length * 12);
                    const labelH = this.circleSize * 0.7;
                    const labelRise = (1 - note.approachProgress) * 6;
                    const labelAlpha = Math.min(1, 0.25 + note.approachProgress * 1.05);
                    this.ctx.globalAlpha = labelAlpha;
                    this.ctx.beginPath();
                    this.ctx.roundRect(note.x - labelW / 2, note.y - labelH / 2 - labelRise, labelW, labelH, 10);
                    this.ctx.fillStyle = 'rgba(10,16,26,0.78)';
                    this.ctx.fill();
                    this.ctx.lineWidth = 2.5;
                    this.ctx.strokeStyle = palette.edge;
                    this.ctx.stroke();
                    this.ctx.shadowBlur = 14;
                    this.ctx.shadowColor = palette.edge;
                    this.ctx.font = '900 20px "Trebuchet MS", "Arial Black", sans-serif';
                    this.ctx.fillStyle = '#f8fcff';
                    this.ctx.fillText(displayLabel, note.x, note.y + 0.5 - labelRise);
                    this.ctx.shadowBlur = 0;
                    this.ctx.globalAlpha = 1;
                } else {
                    this.ctx.font = '700 22px Arial';
                    this.ctx.fillStyle = '#f3fcff';
                    this.ctx.fillText(marker, note.x, note.y);
                }
                if (note.keyboardCheckpoint) {
                    const chipW = this.circleSize * 1.15;
                    const chipH = this.circleSize * 0.42;
                    const chipY = note.y - this.circleSize * 1.18;
                    this.ctx.beginPath();
                    this.ctx.roundRect(note.x - chipW / 2, chipY - chipH / 2, chipW, chipH, 8);
                    this.ctx.fillStyle = 'rgba(14,18,30,0.84)';
                    this.ctx.fill();
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeStyle = '#ffffff';
                    this.ctx.stroke();
                    this.ctx.font = '900 12px "Arial Black", sans-serif';
                    this.ctx.fillStyle = '#ffffff';
                    this.ctx.fillText(note.keyboardHint || 'SPACE', note.x, chipY + 0.5);
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

        // Draw combo / mode HUD
        this.drawComboHUD();
        
        // The voice activity indicator is hidden, but the voice detection logic functionality is retained
    }
    handleKeyboardAction = (key) => {
        if (!this.isPlaying || this.isPausedPhase()) return;
        const currentTime = this.resolveChartClock();
        for (const note of this.notes) {
            if (note.hit || note.completed || !note.keyboardCheckpoint || note.keyboardHit) continue;
            const timingDiff = Math.abs(currentTime - note.hitTime) * 1000;
            if (timingDiff > this.goodRange) continue;
            if (String(note.keyboardKey || 'space') !== String(key || 'space')) continue;
            note.keyboardHit = true;
            note.keyboardHitTime = currentTime;
            this.pushSignatureBurst(note.x, note.y, 'ribbon');
            this.createHitEffect(note.x, note.y, timingDiff <= this.perfectRange ? 'perfect' : 'good');
            this.updateHUD();
            return;
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
        
        if (this.currentDragNote) {
            const note = this.currentDragNote;
            if (note.held) {
                if (type === 'move') {
                    const curvePoints = window.PathTemplates?.samplePathPoints ? window.PathTemplates.samplePathPoints(note, 100) : [];
                    let minDist = Infinity;
                    let closestPoint = null;
                    curvePoints.forEach(point => {
                        const dist = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
                        if (dist < minDist) {
                            minDist = dist;
                            closestPoint = point;
                        }
                    });
                    const tolerance = note.extraPath?.points?.length ? this.circleSize * 1.4 : this.circleSize * 0.95;
                    if (closestPoint && minDist <= tolerance) {
                        note.progress = Math.max(note.progress || 0, closestPoint.t);
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
                        this.score += (note.noteType === 'ribbon' ? 1850 : 1500) * (1 + this.combo * 0.1);
                        this.combo++;
                        this.recordJudgement('perfect');
                        this.tutorialSeenCounts[note.noteType || 'tap'] = (this.tutorialSeenCounts[note.noteType || 'tap'] || 0) + 1;
                        this.createHitEffect(note.endX, note.endY, 'perfect');
                        if (note.noteType === 'ribbon') this.pushSignatureBurst(note.endX, note.endY, 'ribbon');
                    } else if (note.progress > goodThreshold) {
                        note.completed = true;
                        note.score = 'good';
                        this.score += 800 * (1 + this.combo * 0.1);
                        this.combo++;
                        this.recordJudgement('good');
                        this.tutorialSeenCounts[note.noteType || 'tap'] = (this.tutorialSeenCounts[note.noteType || 'tap'] || 0) + 1;
                        this.createHitEffect(note.endX, note.endY, 'good');
                    } else {
                        note.completed = true;
                        note.score = 'miss';
                        this.combo = 0;
                        this.recordJudgement('miss');
                    }
                    note.held = false;
                    note.hit = true;
                    this.currentDragNote = null;
                    this.updateHUD();
                }
                return;
            }
        }

        if (this.currentHoldNote && this.currentHoldNote.held && type === 'end') {
            const note = this.currentHoldNote;
            if ((note.holdProgress || 0) < 0.92) {
                note.hit = true;
                note.completed = true;
                note.held = false;
                note.score = 'miss';
                this.combo = 0;
                this.recordJudgement('miss');
            }
            this.currentHoldNote = null;
            this.updateHUD();
            return;
        }

        if (type === 'move') {
            for (const note of this.notes) {
                if (note.hit || note.completed || !note.held) continue;
                if (note.noteType !== 'flick' && note.noteType !== 'cut') continue;
                const dx = x - (note.swipeStartX || note.x);
                const dy = y - (note.swipeStartY || note.y);
                const primary = note.flickVector || { x: 1, y: 0 };
                const along = dx * primary.x + dy * primary.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist >= (note.swipeDistance || this.circleSize * 1.15) && (note.noteType === 'cut' || along > (note.swipeDistance || this.circleSize) * 0.72)) {
                    note.hit = true;
                    note.completed = true;
                    note.held = false;
                    note.score = dist > (note.swipeDistance || this.circleSize * 1.15) * 1.05 ? 'perfect' : 'good';
                    this.score += (note.score === 'perfect' ? 1250 : 750) * (1 + this.combo * 0.1);
                    this.recordJudgement(note.score);
                    this.combo++;
                    this.tutorialSeenCounts[note.noteType || 'tap'] = (this.tutorialSeenCounts[note.noteType || 'tap'] || 0) + 1;
                    this.createHitEffect(x, y, note.score);
                    this.updateHUD();
                    return;
                }
            }
        }

        if (type === 'start') {
            this.notes.forEach(note => {
                if (note.hit || note.completed) return;
                const distance = Math.sqrt((x - note.x) ** 2 + (y - note.y) ** 2);
                if (distance > this.circleSize) return;
                const timingDiff = Math.abs(currentTime - note.hitTime) * 1000;

                if (note.isDrag) {
                    note.held = true;
                    note.progress = 0;
                    this.currentDragNote = note;
                    return;
                }

                if (note.noteType === 'pulseHold') {
                    note.held = true;
                    note.holdStartTime = currentTime;
                    note.holdProgress = 0;
                    this.currentHoldNote = note;
                    return;
                }

                if (note.noteType === 'gate') {
                    const gateWidth = note.gateWidth || this.circleSize * 2.6;
                    if (Math.abs(x - note.x) <= gateWidth * 0.42) {
                        note.held = true;
                        note.completed = true;
                        note.hit = true;
                        note.score = timingDiff <= this.perfectRange ? 'perfect' : (timingDiff <= this.goodRange ? 'good' : 'miss');
                        if (note.score === 'miss') {
                            this.combo = 0;
                            this.recordJudgement('miss');
                        } else {
                            this.score += (note.score === 'perfect' ? 1450 : 900) * (1 + this.combo * 0.1);
                            this.recordJudgement(note.score);
                            this.combo++;
                            this.tutorialSeenCounts[note.noteType || 'tap'] = (this.tutorialSeenCounts[note.noteType || 'tap'] || 0) + 1;
                            this.createHitEffect(note.x, note.y, note.score);
                            this.pushSignatureBurst(note.x, note.y, 'gate');
                        }
                        this.currentGateNote = null;
                        this.updateHUD();
                        return;
                    }
                }

                if (note.noteType === 'flick' || note.noteType === 'cut') {
                    note.held = true;
                    note.swipeStartX = x;
                    note.swipeStartY = y;
                    return;
                }
                    
                if (timingDiff <= this.perfectRange) {
                    note.score = 'perfect';
                    this.score += 1000 * (1 + this.combo * 0.1);
                    this.recordJudgement('perfect');
                    this.combo++;
                    note.hit = true;
                    this.tutorialSeenCounts[note.noteType || 'tap'] = (this.tutorialSeenCounts[note.noteType || 'tap'] || 0) + 1;
                    this.createHitEffect(note.x, note.y, note.score);
                } else if (timingDiff <= this.goodRange) {
                    note.score = 'good';
                    this.score += 500 * (1 + this.combo * 0.1);
                    this.recordJudgement('good');
                    this.combo++;
                    note.hit = true;
                    this.tutorialSeenCounts[note.noteType || 'tap'] = (this.tutorialSeenCounts[note.noteType || 'tap'] || 0) + 1;
                    this.createHitEffect(note.x, note.y, note.score);
                } else {
                    note.score = 'miss';
                    this.combo = 0;
                    this.recordJudgement('miss');
                    note.hit = true;
                }
                    
                this.updateHUD();
            });
        }

        if (type === 'end') {
            for (const note of this.notes) {
                if (note.hit || note.completed || !note.held) continue;
                if (note.noteType === 'flick' || note.noteType === 'cut') {
                    note.hit = true;
                    note.completed = true;
                    note.held = false;
                    note.score = 'miss';
                    this.combo = 0;
                    this.recordJudgement('miss');
                    this.updateHUD();
                    return;
                }
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
        const particles = [];
        const particleCount = scoreType === 'perfect' ? 22 : scoreType === 'good' ? 12 : 8;
        const particleSpeed = scoreType === 'perfect' ? 7.4 : scoreType === 'good' ? 4.8 : 3.6;
        let particleColor;
        
        switch (scoreType) {
            case 'perfect':
                particleColor = '84,241,255';
                break;
            case 'good':
                particleColor = '255,184,77';
                break;
            case 'miss':
                particleColor = '255,95,118';
                break;
            default:
                particleColor = '255,255,255';
        }
        this.pushBurst(x, y, scoreType);
        
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * particleSpeed * (0.7 + Math.random() * 0.6),
                vy: Math.sin(angle) * particleSpeed * (0.7 + Math.random() * 0.6),
                life: 1,
                size: 2 + Math.random() * 4,
                color: particleColor
            });
        }

        const animate = () => {
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= scoreType === 'perfect' ? 0.978 : 0.985;
                p.vy *= scoreType === 'perfect' ? 0.978 : 0.985;
                p.life -= scoreType === 'miss' ? 0.04 : (scoreType === 'good' ? 0.03 : 0.024);

                if (p.life > 0) {
                    this.ctx.beginPath();
                    this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    this.ctx.fillStyle = `rgba(${p.color}, ${Math.max(0, p.life)})`;
                    this.ctx.shadowBlur = 16;
                    this.ctx.shadowColor = `rgba(${p.color}, .45)`;
                    this.ctx.fill();
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
        tap: { core: '#ffe7cc', edge: '#ffb86b', glow: 'rgba(255,184,107,.34)' },
        drag: { core: '#e5dcff', edge: '#b892ff', glow: 'rgba(184,146,255,.34)' },
        ribbon: { core: '#fff1c7', edge: '#ffd36a', glow: 'rgba(255,211,106,.38)' },
        pulseHold: { core: '#d9fff3', edge: '#5ee6b8', glow: 'rgba(94,230,184,.36)' },
        gate: { core: '#dff4ff', edge: '#7fc9ff', glow: 'rgba(127,201,255,.34)' },
        flick: { core: '#ffd9f1', edge: '#ff7fd1', glow: 'rgba(255,127,209,.36)' },
        cut: { core: '#ffe0e0', edge: '#ff6f88', glow: 'rgba(255,111,136,.38)' }
    };
    const typeKey = note?.noteType || (note?.isDrag ? 'drag' : 'tap');
    const mechanic = mechanicPalettes[typeKey];
    if (mechanic) {
        palette.core = mechanic.core;
        palette.edge = mechanic.edge;
        palette.glow = mechanic.glow;
    }
    if (note && note.isDrag) {
        palette.glow = palette.glow.replace('.38', '.44').replace('.36', '.42').replace('.34', '.4');
    }
    if (note && note.energy >= 0.95) {
        palette.glow = palette.glow.replace('.44', '.48').replace('.42', '.46').replace('.4', '.44').replace('.38', '.42').replace('.36', '.4').replace('.34', '.38');
    }
    return palette;
};

RhythmGame.prototype.getNotePalette = function (note) {
    if (note.score === 'perfect') return { core: '#fff3cf', edge: '#ffd978', glow: 'rgba(255,217,120,.45)' };
    if (note.score === 'good') return { core: '#ffd9e5', edge: '#ff9bb4', glow: 'rgba(255,155,180,.4)' };
    if (note.score === 'miss') return { core: '#ff899f', edge: '#ff5f76', glow: 'rgba(255,95,118,.35)' };
    const base = note.groupPalette || this.getSegmentPalette(note.segmentLabel || 'verse', note.groupIndex || note.phrase || 0);
    return this.decoratePaletteForNote(base, note);
};

RhythmGame.prototype.drawEnergyBurst = function () {
    const now = performance.now();
    this.visualBursts = this.visualBursts.filter(b => now - b.at < 550);
    this.signatureBursts = this.signatureBursts.filter(b => now - b.at < 900);
    for (const b of this.visualBursts) {
        const t = Math.min(1, (now - b.at) / 550);
        const alpha = (1 - t) * 0.22;
        const radius = (60 + t * 180) * (b.scale || 1);
        this.ctx.beginPath();
        this.ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
        this.ctx.strokeStyle = b.color.replace('ALPHA', alpha.toFixed(3));
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(b.x, b.y, radius * 0.58, 0, Math.PI * 2);
        this.ctx.strokeStyle = b.inner.replace('ALPHA', (alpha * 0.9).toFixed(3));
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
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
};

RhythmGame.prototype.pushBurst = function (x, y, type) {
    const map = {
        perfect: { color: 'rgba(84,241,255,ALPHA)', inner: 'rgba(255,255,255,ALPHA)' },
        good: { color: 'rgba(255,184,77,ALPHA)', inner: 'rgba(255,240,196,ALPHA)' },
        miss: { color: 'rgba(255,95,118,ALPHA)', inner: 'rgba(255,170,180,ALPHA)' }
    };
    this.visualBursts.push({ x, y, at: performance.now(), scale: type === 'perfect' ? 1.16 : type === 'good' ? 0.92 : 0.78, ...(map[type] || map.perfect) });
    this.updateHUD();
};

RhythmGame.prototype.pushSignatureBurst = function (x, y, kind = 'gate') {
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
    const comboBounce = 1 + Math.min(0.16, (this.combo % 5) * 0.012);
    if (this.combo > 1) {
        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2, 56);
        this.ctx.scale(comboBounce, comboBounce);
        this.ctx.fillStyle = 'rgba(255,255,255,.92)';
        this.ctx.font = '700 28px Rajdhani';
        this.ctx.fillText(`${this.combo}x COMBO`, 0, 0);
        this.ctx.restore();
        this.ctx.fillStyle = 'rgba(84,241,255,.22)';
        this.ctx.fillRect(this.canvas.width / 2 - 90, 68, 180, 4);
    }
    this.ctx.fillStyle = this.runInvalid ? 'rgba(255,95,118,.92)' : 'rgba(255,255,255,.84)';
    this.ctx.font = '600 18px Rajdhani';
    const modeText = `${String(this.playMode || 'casual').toUpperCase()}${this.runInvalid ? ' · INVALID RUN' : ''}`;
    this.ctx.fillText(modeText, this.canvas.width / 2, 92);
    const underPulse = 0.24 + 0.12 * (0.5 + 0.5 * Math.sin(performance.now() / 260));
    this.ctx.fillStyle = `rgba(255,215,168,${underPulse.toFixed(3)})`;
    this.ctx.fillRect(this.canvas.width / 2 - 64, 100, 128, 2.5);
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
    this.updatePauseUI();
    this.updateHUD();
};

RhythmGame.prototype.resumeGame = async function () {
    if (!(this.isPausedPhase())) return;
    if (this.runOrchestrator?.resume) this.runOrchestrator.resume({ reason: this.pauseReason || 'resume' });
    return this.resumeRunSequence();
};

// Live playback helpers (patched)
RhythmGame.prototype.markLivePlaybackState = function (state) {
    this.livePlaybackState = state || this.livePlaybackState || 'idle';
    this.captureRuntimeDiagnostics('playback-state', { playbackState: this.livePlaybackState });
    if (state === 'playing') {
        this.livePlaybackStarted = true;
        if (this.runClock?.markPlaybackStarted) this.runClock.markPlaybackStarted();
        if (this.runOrchestrator?.startPlaying) this.runOrchestrator.startPlaying({ playbackStarted: false });
    }
    if (state === 'ended') {
        this.checkRunCompletion();
    }
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
        isDrag: noteType === 'drag' || noteType === 'ribbon',
        noteType,
        held: false,
        completed: false,
        progress: 0,
        segmentLabel: liveSeg.label || 'live',
        groupIndex: liveBar,
        groupSlot: this.liveEngine ? ((this.liveEngine.step || 0) % 4) : 0,
        spawnedAtWall: performance.now(),
        holdDuration: noteType === 'pulseHold' ? Math.max(0.55, (this.liveEngine?.beatSec || 0.48) * 1.6) : 0,
        gateWidth: noteType === 'gate' ? this.circleSize * (2.6 + Math.random() * 0.6) : null
    };

    note.groupPalette = this.getSegmentPalette(note.segmentLabel || 'live', note.groupIndex);
    note.groupPattern = this.pickGroupPattern(note.groupIndex, note.segmentLabel || 'live');
    this.applyGroupMechanics([note], { pattern: note.groupPattern, groupIndex: note.groupIndex, segmentLabel: note.segmentLabel || 'live' });

    if (note.isDrag) {
        const d = this.circleSize * (3.4 + Math.random() * 1.3);
        const a = Math.random() * Math.PI * 2;
        note.endX = Math.max(this.safeArea.x + this.circleSize, Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, note.x + Math.cos(a) * d));
        note.endY = Math.max(this.safeArea.y + this.circleSize, Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, note.y + Math.sin(a) * d));
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
            }
        }
    }

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
    const candidateShifts = [0, 1, -1, 2, -2];
    let basePos = null;
    let chosenLane = laneIndex;
    for (const shift of candidateShifts) {
        const candidateLane = Math.max(0, Math.min(laneCount - 1, laneIndex + shift));
        const pos = this.resolveGroupPatternPosition({
            laneIndex: candidateLane,
            laneCount,
            chartIndex,
            phrase,
            groupSlot,
            segmentLabel: chartNote.segmentLabel || 'verse'
        });
        const probe = { x: pos.x, y: pos.y, type: chartNote.type || this.pickChartNoteType(chartNote, chartIndex, groupSlot) };
        const active = (this.notes || []).filter(n => !n.hit && !n.completed);
        const collides = active.some(existing => {
            if (!window.ChartPolicy?.makeFootprint || !window.ChartPolicy?.footprintsOverlap) return false;
            return window.ChartPolicy.footprintsOverlap(window.ChartPolicy.makeFootprint(probe, this.circleSize), window.ChartPolicy.makeFootprint(existing, this.circleSize));
        });
        if (!collides) {
            basePos = pos;
            chosenLane = candidateLane;
            break;
        }
    }
    if (!basePos) {
        basePos = this.resolveGroupPatternPosition({ laneIndex, laneCount, chartIndex, phrase, groupSlot, segmentLabel: chartNote.segmentLabel || 'verse' });
    }
    const x = basePos.x;
    const y = basePos.y;

    const noteType = chartNote.type || this.pickChartNoteType(chartNote, chartIndex, groupSlot);
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
        isDrag: noteType === 'drag' || noteType === 'ribbon',
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
        holdDuration: noteType === 'pulseHold' ? Math.max(0.6, (chartNote.duration || 0.82)) : 0,
        gateWidth: noteType === 'gate' ? this.circleSize * (2.4 + (chartIndex % 3) * 0.2) : null,
        groupPattern: basePos.pattern,
        spawnLeadBiasSec: Number(chartNote.spawnLeadBiasSec || 0),
        openingCalmWindow: Boolean(chartNote.openingCalmWindow)
    };

    note.groupPalette = this.getSegmentPalette(note.segmentLabel || 'verse', note.groupIndex);
    this.applyGroupMechanics([note], { pattern: basePos.pattern, groupIndex: phrase, segmentLabel: note.segmentLabel || 'verse' });

    if (note.isDrag) {
        const dragLanes = [chosenLane - 1, chosenLane + 1, chosenLane + (chartIndex % 2 === 0 ? 1 : -1), chosenLane];
        let endLane = chosenLane;
        for (const candidate of dragLanes) {
            if (candidate >= 0 && candidate < laneCount && candidate !== laneIndex) {
                endLane = candidate;
                break;
            }
        }
        note.endX = Math.max(this.safeArea.x + this.circleSize, Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, this.safeArea.x + laneWidth * (endLane + 0.5)));
        note.endY = Math.max(this.safeArea.y + this.circleSize, Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, y + ((chartIndex % 2 === 0 ? 1 : -1) * this.circleSize * 1.8)));
        const active = (this.notes || []).filter(n => !n.hit && !n.completed);
        for (const existing of active) {
            const tooCloseEnd = Math.hypot((existing.x || 0) - note.endX, (existing.y || 0) - note.endY) < this.circleSize * 2.2;
            if (tooCloseEnd) {
                note.endY = Math.max(this.safeArea.y + this.circleSize, Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, note.endY + this.circleSize * 1.4));
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
        const type = i === clusterSize - 1 && anchorNote.noteType !== 'pulseHold' ? 'cut' : 'tap';
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
                const chorusBurst = note.segmentLabel === 'chorus' && (idx === 0 || idx === 8) && note.noteType !== 'pulseHold';
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
    this.liveEngine.signatureMode = seg.label === 'chorus' ? 'ribbon' : (seg.label === 'bridge' ? 'gate' : 'mixed');
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
    const pool = segmentLabel === 'chorus' ? chorusPatterns : versePatterns;
    return pool[Math.abs(Number(phrase || 0)) % pool.length];
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
        const seg = note.segmentLabel || context.segmentLabel || 'verse';
        if (size >= 3 && pattern === 'burst' && idx === size - 1 && (note.noteType === 'tap' || note.noteType === 'drag') && seg === 'chorus') note.noteType = 'cut';
        if (size >= 3 && pattern === 'diamond' && idx === 1 && (note.noteType === 'tap' || note.noteType === 'drag') && Math.abs(note.groupIndex || 0) % 2 === 0) note.noteType = 'flick';
        if (size >= 4 && pattern === 'ladder' && idx === 0 && (note.noteType === 'tap' || note.noteType === 'drag') && seg !== 'chorus') note.noteType = 'pulseHold';
        if (size >= 4 && pattern === 'fan' && idx === size - 1 && seg === 'bridge' && note.noteType === 'tap') note.noteType = 'gate';
        this.applyNoteMechanicProfile(note);
    });
    return notes;
};

RhythmGame.prototype.pickChartNoteType = function (note, idx, inPhraseIndex = 0) {
    if (note && note.type) return note.type;
    const segment = note?.segmentLabel || 'verse';
    const cycle = idx % 16;
    if (segment === 'chorus' && (cycle === 11 || cycle === 12)) return 'ribbon';
    if ((segment === 'chorus' && (cycle === 5 || cycle === 6) && inPhraseIndex % 2 === 0) || (segment === 'bridge' && (cycle === 7 || cycle === 8))) return 'gate';
    if ((cycle === 9 || cycle === 10) && segment !== 'chorus') return 'pulseHold';
    if ((cycle === 3 || cycle === 4) && inPhraseIndex % 3 !== 2) return 'flick';
    if ((cycle === 13 || cycle === 14) && segment === 'chorus') return 'cut';
    if ((idx + inPhraseIndex) % 6 === 0) return 'drag';
    return 'tap';
};

RhythmGame.prototype.pickLiveNoteType = function (seq, groupIndex, preferDrag) {
    if (groupIndex % 4 === 3 && seq % 6 === 0) return 'ribbon';
    if (groupIndex % 3 === 2 && seq % 8 === 0) return 'gate';
    if (preferDrag && seq % 6 === 0) return seq % 12 === 0 ? 'ribbon' : 'drag';
    if (seq % 15 === 0) return 'gate';
    if (seq % 11 === 0) return 'pulseHold';
    if (seq % 9 === 0) return 'cut';
    if (seq % 7 === 0) return 'flick';
    return preferDrag ? 'drag' : 'tap';
};

RhythmGame.prototype.resolveGroupPatternPosition = function ({ laneIndex, laneCount, chartIndex, phrase, groupSlot, segmentLabel }) {
    const laneWidth = this.safeArea.width / laneCount;
    const baseX = this.safeArea.x + laneWidth * (laneIndex + 0.5);
    const rowBand = segmentLabel === 'chorus' ? 0.34 : (segmentLabel === 'verse' ? 0.52 : 0.42);
    const baseY = this.safeArea.y + this.safeArea.height * rowBand;
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
    const span = this.circleSize * (segmentLabel === 'chorus' ? 1.55 : 1.2);
    const x = Math.max(this.safeArea.x + this.circleSize, Math.min(this.safeArea.x + this.safeArea.width - this.circleSize, baseX + offset.x * span));
    const y = Math.max(this.safeArea.y + this.circleSize, Math.min(this.safeArea.y + this.safeArea.height - this.circleSize, baseY + offset.y * span));
    return { x, y, pattern };
};

RhythmGame.prototype.applyNoteMechanicProfile = function (note) {
    if (!note) return note;
    if (note.noteType === 'flick' || note.noteType === 'cut') {
        const dirs = [
            { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0.8, y: -0.6 }, { x: -0.8, y: -0.6 }
        ];
        note.flickVector = dirs[Math.abs(note.noteNumber || 0) % dirs.length];
        note.swipeDistance = this.circleSize * (note.noteType === 'cut' ? 1.55 : 1.15);
    }
    if (note.noteType === 'pulseHold') {
        note.holdDuration = Math.max(0.5, note.holdDuration || 0.82);
        note.holdProgress = 0;
    }
    if (note.noteType === 'ribbon') {
        note.ribbonWidth = this.circleSize * 0.9;
        note.traceStrictness = 0.2;
    }
    if ((note.noteType === 'drag' || note.noteType === 'ribbon') && window.PathTemplates?.chooseTemplate) {
        note.pathTemplate = window.PathTemplates.chooseTemplate(note, document.getElementById('difficultySelect')?.value || 'normal');
    }
    if (window.ChartPolicy?.assignKeyboardCheckpoints) {
        window.ChartPolicy.assignKeyboardCheckpoints([note, ...(this.notes || []).filter(n => !n.hit && !n.completed)], {
            keyboardCheckpointGapSec: 2.2,
            keyboardCheckpointEarlyGraceSec: 10
        });
    } else if ((note.noteType === 'drag' || note.noteType === 'ribbon') && note.pathTemplate && note.pathTemplate !== 'orbit') {
        note.keyboardCheckpoint = true;
        note.keyboardKey = 'space';
        note.keyboardHint = 'SPACE';
        note.keyboardHit = false;
    }
    if (note.noteType === 'gate') {
        note.gateWidth = note.gateWidth || this.circleSize * 2.3;
        note.gateWindow = this.circleSize * 0.42;
    }
    return note;
};

RhythmGame.prototype.recordJudgement = function (score) {
    if (!score || !this.judgementStats[score] && score !== 'miss') return;
    if (score === 'perfect' || score === 'good' || score === 'miss') this.judgementStats[score] += 1;
    this.updateHUD();
};

// Initialize the game
window.addEventListener("load", () => {
    window.game = new RhythmGame();
});
