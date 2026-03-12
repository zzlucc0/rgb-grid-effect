(function () {
  class RunCompletionController {
    constructor(options = {}) {
      this.chartRuntime = options.chartRuntime || null;
      this.getActiveNotes = typeof options.getActiveNotes === 'function' ? options.getActiveNotes : () => [];
      this.getRunTime = typeof options.getRunTime === 'function' ? options.getRunTime : () => 0;
      this.getPlaybackState = typeof options.getPlaybackState === 'function' ? options.getPlaybackState : () => 'idle';
      this.getChartData = typeof options.getChartData === 'function' ? options.getChartData : () => null;
      this.finishGraceSec = Number(options.finishGraceSec || 1.8);
    }

    shouldFinish() {
      const chart = this.getChartData();
      if (!(chart && Array.isArray(chart.notes) && chart.notes.length)) return { done: false, reason: null };

      const progress = this.chartRuntime?.getProgress ? this.chartRuntime.getProgress() : null;
      const depleted = progress ? progress.depleted : false;
      const activeNotes = this.getActiveNotes() || [];
      const playbackState = String(this.getPlaybackState() || 'idle');
      const runTime = Number(this.getRunTime() || 0);
      const tailTime = Number(chart.notes[chart.notes.length - 1]?.time || 0) + this.finishGraceSec;

      if (!depleted) return { done: false, reason: null };
      if (activeNotes.length > 0) return { done: false, reason: null };
      if (playbackState === 'ended') return { done: true, reason: 'playback-ended' };
      if (runTime >= tailTime) return { done: true, reason: 'chart-depleted' };
      return { done: false, reason: null };
    }
  }

  window.RunCompletionController = RunCompletionController;
})();
