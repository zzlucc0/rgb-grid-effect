(function () {
  class ChartRuntime {
    constructor(options = {}) {
      this.spawnLeadTimeMs = Number(options.spawnLeadTimeMs || options.approachRateMs || 1250);
      this.approachRateMs = this.spawnLeadTimeMs;
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
      if (options.spawnLeadTimeMs != null || options.approachRateMs != null) {
        this.spawnLeadTimeMs = Number(options.spawnLeadTimeMs || options.approachRateMs || this.spawnLeadTimeMs);
        this.approachRateMs = this.spawnLeadTimeMs;
      }
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

    spawnUntil(currentTime, createNote, options = {}) {
      const chartTime = Number.isFinite(Number(currentTime)) ? Number(currentTime) : 0;
      if (!this.hasChart() || typeof createNote !== 'function') return [];

      const spawned = [];
      const notes = this.getNotes();
      const fullLookaheadSec = this.spawnLeadTimeMs / 1000 + Math.max(0, Number(this.leadInBiasSec || 0));
      // Longer, steeper ramp: start at 10% lookahead and climb over 4.5s to prevent opening burst
      const openingRampSec = Number(options.openingRampSec || 4.5);
      const openingScale = chartTime < openingRampSec ? (0.10 + 0.90 * (chartTime / Math.max(0.001, openingRampSec))) : 1;
      const lookaheadSec = fullLookaheadSec * Math.max(0.10, Math.min(1, openingScale));
      const inOpeningRamp = chartTime < openingRampSec;
      // Cap to 1 note per frame during opening ramp to prevent burst on countdown end
      const maxPerFrame = inOpeningRamp ? 1 : 3;
      const missGraceSec = this.goodRangeMs / 1000;
      const visibleSustainedCap = Number(options.visibleSustainedCap || 1);
      let visibleSustained = Number(options.visibleSustainedCount || 0);
      const isSustained = (type) => ['pulseHold','drag','ribbon','orbit','diamondLoop','starTrace'].includes(type);

      while (this.nextIndex < notes.length) {
        const chartIndex = this.nextIndex;
        const chartNote = notes[chartIndex];
        const hitTime = Number(chartNote?.time || 0);
        // During opening ramp suppress per-note bias so it can't inflate the lookahead window
        const noteLeadBiasSec = inOpeningRamp ? 0 : Math.max(0, Number(chartNote?.spawnLeadBiasSec || 0));
        const noteLookaheadSec = lookaheadSec + noteLeadBiasSec;
        if (hitTime > chartTime + noteLookaheadSec) break;
        const noteType = chartNote?.type || 'tap';

        if (hitTime < chartTime - missGraceSec) {
          this.nextIndex += 1;
          continue;
        }

        if (isSustained(noteType) && visibleSustained >= visibleSustainedCap) break;
        // Hard cap on notes spawned per frame during opening to guarantee gradual ramp-in
        if (spawned.length >= maxPerFrame) break;

        const note = createNote(chartTime, chartNote, chartIndex);
        if (!note) break;
        this.nextIndex += 1;
        this.spawnedCount += 1;
        this.lastSpawnTime = chartTime;
        if (isSustained(note.noteType || note.type || noteType)) visibleSustained += 1;
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
        lastSpawnTime: this.lastSpawnTime,
        spawnLeadTimeMs: this.spawnLeadTimeMs
      };
    }
  }

  window.ChartRuntime = ChartRuntime;
})();
