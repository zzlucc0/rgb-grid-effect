import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('strict tap sequence judgement', () => {
  it('restricts keyboard judgement to the earliest active keyboard note', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(game).toContain('const activeKeyboardNotes = this.notes');
    expect(game).toContain('const activeTarget = activeKeyboardNotes[0];');
  });

  it('marks the current target as miss when the player presses the wrong key', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(game).toContain("if (normalizedKey !== expectedKey) {");
    expect(game).toContain("activeTarget.score = 'miss';");
    expect(game).toContain("this.recordJudgement('miss', activeTarget.x, activeTarget.y);");
  });

  it('does not allow matching a later tap before the earliest one is resolved', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(game).not.toContain('let bestNote = null');
    expect(game).not.toContain('let bestFuture = true');
  });
});
