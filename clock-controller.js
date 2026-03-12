(function () {
  class RunClockController {
    constructor() {
      this.reset();
    }

    reset() {
      this.startedAtWall = 0;
      this.pauseAccumulated = 0;
      this.pausedAtWall = 0;
      this.frozenTime = 0;
      this.playbackStarted = false;
      this.playbackTimeProvider = null;
      this.mode = 'idle';
    }

    arm() {
      this.startedAtWall = performance.now();
      this.pauseAccumulated = 0;
      this.pausedAtWall = 0;
      this.frozenTime = 0;
      this.playbackStarted = false;
      this.mode = 'armed';
    }

    attachPlayback(provider) {
      this.playbackTimeProvider = typeof provider === 'function' ? provider : null;
    }

    markPlaybackStarted() {
      this.playbackStarted = true;
      if (this.mode !== 'paused') this.mode = 'playing';
    }

    pause() {
      if (this.mode === 'paused') return;
      this.frozenTime = this.getRunTime();
      this.pausedAtWall = performance.now();
      this.mode = 'paused';
    }

    resume() {
      if (this.mode !== 'paused') return;
      if (this.pausedAtWall) {
        this.pauseAccumulated += Math.max(0, (performance.now() - this.pausedAtWall) / 1000);
      }
      this.pausedAtWall = 0;
      this.mode = 'playing';
    }

    getWallTime() {
      if (!this.startedAtWall) return 0;
      return Math.max(0, (performance.now() - this.startedAtWall) / 1000 - (this.pauseAccumulated || 0));
    }

    getPlaybackTime() {
      if (!this.playbackTimeProvider) return 0;
      try {
        return Math.max(0, Number(this.playbackTimeProvider() || 0));
      } catch (_) {
        return 0;
      }
    }

    getRunTime(options = {}) {
      const paused = Boolean(options.paused || this.mode === 'paused');
      const chartMode = Boolean(options.chartMode);
      if (paused) return this.frozenTime || 0;

      const wallT = this.getWallTime();
      const playbackT = this.getPlaybackTime();

      if (chartMode) {
        if (this.playbackStarted) return Math.max(playbackT || 0, wallT || 0);
        return wallT || 0;
      }

      return Math.max(playbackT || 0, wallT || 0);
    }

    snapshot(options = {}) {
      return {
        mode: this.mode,
        playbackStarted: this.playbackStarted,
        wallTime: this.getWallTime(),
        playbackTime: this.getPlaybackTime(),
        runTime: this.getRunTime(options)
      };
    }
  }

  window.RunClockController = RunClockController;
})();
