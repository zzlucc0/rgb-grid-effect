import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('input target selection logic', () => {
  it('selects best keyboard candidate by smallest timingDiff instead of first array entry', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(game).toContain('let bestNote = null');
    expect(game).not.toContain("handleKeyboardAction = (key) => {\n        if (!this.isPlaying || this.isPausedPhase()) return;\n        const currentTime = this.resolveChartClock();\n        for (const note of this.notes)");
  });

  it('selects pointer candidate by best timing/distance instead of first matching note', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(game).toContain('let bestPointerNote = null');
    expect(game).toContain('let bestPointerDiff = Infinity');
    expect(game).toContain('let bestPointerDistance = Infinity');
  });

  it('prefers due or overdue plain notes over future notes when both are in range', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(game).toContain('const deltaMs = (currentTime - note.hitTime) * 1000;');
    expect(game).toContain('const isFuture = deltaMs < 0;');
    expect(game).toContain('(bestFuture && !isFuture) || (bestFuture === isFuture && timingDiff < bestDiff)');
    expect(game).toContain('(bestPointerFuture && !isFuture) || (bestPointerFuture === isFuture && (timingDiff < bestPointerDiff || (timingDiff === bestPointerDiff && distance < bestPointerDistance)))');
  });
});
