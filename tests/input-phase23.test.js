import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('phase 2/3 input features', () => {
  it('wires keyboard lane keys into runtime input handling and persistent labels', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(game).toContain("['a','s','d','f','g','h','j','k','l']");
    expect(game).toContain("note.keyboardHint || note.keyHint || 'SPACE'");
    expect(game).toContain("note.inputChannel === 'keyboard' || note.inputChannel === 'shared'");
  });

  it('adds spin proposal generation and runtime handling', () => {
    const server = fs.readFileSync(new URL('../server/src/index.js', import.meta.url), 'utf8');
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(server).toContain('function injectSpinProposals');
    expect(server).toContain("proposalType: 'spin'");
    expect(game).toContain('this.currentSpinNote = null');
    expect(game).toContain('note.isSpin');
    expect(game).toContain('note.spinAccum');
  });
});
