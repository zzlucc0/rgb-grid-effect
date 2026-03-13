import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('review debug UI wiring', () => {
  it('exposes review score and flags fields in the HUD debug strip', () => {
    const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain('debugReviewScore');
    expect(html).toContain('debugReviewState');
    expect(html).toContain('debugReviewScoreWrap');
    expect(html).toContain('debugReviewStateWrap');
  });

  it('wires reviewer request flow into the runtime loop', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(game).toContain('requestReview(apiBase');
    expect(game).toContain('chart-review');
    expect(game).toContain('reviewResult');
  });
});
