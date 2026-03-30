import { describe, it, expect } from 'vitest';
import fs from 'fs';
import vm from 'vm';

function loadPolicy() {
  const code = fs.readFileSync(new URL('/mnt/data/projects/rgb-grid-effect/chart-policy.js', import.meta.url), 'utf8');
  const context = { window: {}, console };
  context.global = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'chart-policy.js' });
  return context.window.ChartPolicy;
}

describe('click/tap data contract', () => {
  it('keeps final pipeline note type, mechanic, channel, and key metadata consistent', () => {
    const policy = loadPolicy();
    const notes = Array.from({ length: 32 }, (_, i) => ({
      time: 0.8 + i * 0.55,
      type: 'tap',
      proposalType: i % 9 === 0 ? 'spin' : (i % 4 === 0 ? 'drag' : 'tap'),
      laneHint: i % 4,
      segmentLabel: i < 8 ? 'intro' : i < 16 ? 'verse' : i < 24 ? 'chorus' : 'bridge',
      strength: 1
    }));
    const out = policy.finalizePlayableChartPipeline(notes, { difficulty: 'normal', openingSeconds: 12, sustainedCooldownSec: 1.6 });
    for (const note of out) {
      const type = note.type || note.noteType;
      expect(note.noteType).toBe(type);
      expect(note.mechanic).toBe(type);
      if (type === 'click') {
        expect(note.inputChannel).toBe('mouse');
        expect(note.keyHint ?? null).toBeNull();
        expect(note.keyboardKey ?? null).toBeNull();
      } else if (type === 'tap') {
        expect(note.inputChannel).toBe('keyboard');
        expect(typeof note.keyHint).toBe('string');
        expect(note.keyHint.length).toBeGreaterThan(0);
        expect(typeof note.keyboardKey).toBe('string');
        expect(note.keyboardKey.length).toBeGreaterThan(0);
      } else if (type === 'drag' || type === 'spin') {
        expect(note.inputChannel).toBe('mouse');
      }
    }
  });
});
