import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('layer boundary cleanup', () => {
  it('keeps group mechanics from directly rewriting final note types', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    const block = game.split('RhythmGame.prototype.applyGroupMechanics = function')[1].split('RhythmGame.prototype.pickChartNoteType')[0];
    expect(block).not.toContain("note.noteType = 'cut'");
    expect(block).not.toContain("note.noteType = 'flick'");
    expect(block).not.toContain("note.noteType = 'pulseHold'");
    expect(block).not.toContain("note.noteType = 'gate'");
  });

  it('marks note mechanic profile as post-mechanic decoration only', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(game).toContain('note.finalMechanicLocked = true');
    expect(game).toContain('groupMechanicContext');
  });
});
