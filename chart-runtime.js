(function () {
  class ChartRuntime {
    constructor(options = {}) {
      this.approachRateMs = Number(options.approachRateMs || 1250);
      this.goodRangeMs = Number(options.goodRangeMs || 680);
      this.leadInBiasSec = Number(options.leadInBiasSec || 0.55);
      this.reset();
    }

    reset(chart = null) {
      this.chart = chart || null;
      this.nextIndex = 0;
      this.spawnedCount = 0;
      this.lastSpawnTime = 0;
    }

    load(chart, options = {}) {
      if (options.approachRateMs != null) this.approachRateMs = Number(options.approachRateMs || this.approachRateMs);
      if (options.goodRangeMs != null) this.goodRangeMs = Number(options.goodRangeMs || this.goodRangeMs);
      if (options.leadInBiasSec != null) this.leadInBiasSec = Number(options.leadInBiasSec || this.leadInBiasSec);
      this.reset(chart || null);
      return this.snapshot();
    }

    hasChart() {
      return Boolean(this.chart && Array.isArray(this.chart.notes) && this.chart.notes.length);
    }

    getNotes() {
      return this.chart?.notes || [];
    }

    spawnUntil(currentTime, createNote) {
      const chartTime = Number.isFinite(Number(currentTime)) ? Number(currentTime) : 0;
      if (!this.hasChart() || typeof createNote !== 'function') return [];

      const spawned = [];
      const notes = this.getNotes();
      const lookaheadSec = this.approachRateMs / 1000 + Math.max(0, Number(this.leadInBiasSec || 0));
      const missGraceSec = this.goodRangeMs / 1000;

      while (this.nextIndex < notes.length && Number(notes[this.nextIndex]?.time || 0) <= chartTime + lookaheadSec) {
        const chartIndex = this.nextIndex;
        const chartNote = notes[chartIndex];
        const hitTime = Number(chartNote?.time || 0);

        if (hitTime < chartTime - missGraceSec) {
          this.nextIndex += 1;
          continue;
        }

        const note = createNote(chartTime, chartNote, chartIndex);
        if (!note) break;
        this.nextIndex += 1;
        this.spawnedCount += 1;
        this.lastSpawnTime = chartTime;
        spawned.push(note);
      }

      return spawned;
    }

    isDepleted() {
      return !this.hasChart() || this.nextIndex >= this.getNotes().length;
    }

    getProgress() {
      const total = this.getNotes().length;
      return {
        nextIndex: this.nextIndex,
        total,
        spawnedCount: this.spawnedCount,
        depleted: total > 0 ? this.nextIndex >= total : true
      };
    }

    snapshot() {
      return {
        hasChart: this.hasChart(),
        ...this.getProgress(),
        lastSpawnTime: this.lastSpawnTime
      };
    }
  }

  window.ChartRuntime = ChartRuntime;
})();
