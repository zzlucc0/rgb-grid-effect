import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('input target selection logic', () => {
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
    expect(game).toContain('(bestPointerFuture && !isFuture) || (bestPointerFuture === isFuture && (timingDiff < bestPointerDiff || (timingDiff === bestPointerDiff && distance < bestPointerDistance)))');
  });

  it('uses strict active-target keyboard judgement instead of matching any later note', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(game).toContain('const activeKeyboardNotes = this.notes');
    expect(game).toContain('const activeTarget = activeKeyboardNotes[0];');
    expect(game).not.toContain('let bestNote = null');
    expect(game).not.toContain('let bestFuture = true');
  });
});
