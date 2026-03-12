(function () {
  class RunOrchestrator {
    constructor(options = {}) {
      this.clock = options.clock || null;
      this.onPhaseChange = typeof options.onPhaseChange === 'function' ? options.onPhaseChange : null;
      this.onMonitorEvent = typeof options.onMonitorEvent === 'function' ? options.onMonitorEvent : null;
      this.phase = 'created';
      this.lastError = null;
      this.lastMonitorEvent = null;
    }

    transition(nextPhase, meta = {}) {
      this.phase = nextPhase;
      if (typeof meta.error !== 'undefined') this.lastError = meta.error || null;
      if (this.onPhaseChange) this.onPhaseChange(nextPhase, meta);
      return this.phase;
    }

    arm(meta = {}) {
      if (this.clock && this.clock.arm) this.clock.arm();
      return this.transition('arming', meta);
    }

    beginCountdown(meta = {}) {
      return this.transition('countdown', meta);
    }

    attachPlayback(meta = {}) {
      return this.transition('attaching-playback', meta);
    }

    startPlaying(meta = {}) {
      if (this.clock && this.clock.markPlaybackStarted && meta.playbackStarted) {
        this.clock.markPlaybackStarted();
      }
      return this.transition('playing', meta);
    }

    pause(meta = {}) {
      if (this.clock && this.clock.pause) this.clock.pause();
      return this.transition('paused', meta);
    }

    resume(meta = {}) {
      if (this.clock && this.clock.resume) this.clock.resume();
      return this.transition('playing', meta);
    }

    finish(meta = {}) {
      return this.transition('finished', meta);
    }

    abort(meta = {}) {
      return this.transition('aborted', meta);
    }

    fail(error, meta = {}) {
      if (this.clock && this.clock.pause) this.clock.pause();
      return this.transition('failed', { ...meta, error: error || meta.error || null });
    }

    handleMonitorEvent(event, meta = {}) {
      this.lastMonitorEvent = { event, meta, at: Date.now() };
      if (this.onMonitorEvent) this.onMonitorEvent(event, meta);
      return this.lastMonitorEvent;
    }

    snapshot() {
      return {
        phase: this.phase,
        lastError: this.lastError,
        lastMonitorEvent: this.lastMonitorEvent
      };
    }
  }

  window.RunOrchestrator = RunOrchestrator;
})();
