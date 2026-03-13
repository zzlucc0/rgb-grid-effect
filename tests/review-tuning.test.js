import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('review-driven tuning runtime wiring', () => {
  it('stores runtime tuning and applies it after review results', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(game).toContain('this.runtimeTuning = null');
    expect(game).toContain('deriveTuningPatch');
    expect(game).toContain('tuningPatch: this.runtimeTuning');
  });

  it('uses runtime tuning to alter chart spawn policy', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(game).toContain('const tuning = this.runtimeTuning || {}');
    expect(game).toContain('openingRampSec: tuning.openingCalmWindowSec');
    expect(game).toContain('visibleSustainedCap: chartTime < (tuning.openingHeavyStartSec || 3.2) ? 1 : 2');
  });
});
