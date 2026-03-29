import { describe, it, expect } from 'vitest';
import fs from 'fs';
import vm from 'vm';

function loadPolicy() {
  const code = fs.readFileSync(new URL('../chart-policy.js', import.meta.url), 'utf8');
  const context = { window: {}, console };
  context.global = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'chart-policy.js' });
  return context.window.ChartPolicy;
}

describe('phase 1 input schema migration', () => {
  it('normalizes legacy proposals into modern mechanic/input schema fields', () => {
    const policy = loadPolicy();
    const [note] = policy.layerABaseChartProposal([
      { time: 1.2, proposalType: 'ribbon', type: 'tap', laneHint: 1, segmentLabel: 'chorus' }
    ]);
    expect(note.proposalMechanic).toBe('drag');
    expect(note.mechanic).toBe('tap');
    expect(note.inputChannel).toBe('keyboard');
    expect(note.exclusivity).toBe('normal');
    expect(note.pathVariant).toBe('starTrace');
  });

  it('lets mechanic planner emit only modern runtime mechanics', () => {
    const policy = loadPolicy();
    const out = policy.layerBMechanicPlanner(policy.layerABaseChartProposal([
      { time: 8, proposalType: 'drag', type: 'tap', laneHint: 0, segmentLabel: 'chorus' },
      { time: 30, proposalType: 'spin', type: 'tap', laneHint: 1, segmentLabel: 'bridge' }
    ]), {});
    expect(['click', 'tap', 'hold', 'drag', 'spin']).toContain(out[0].mechanic);
    expect(out[1].mechanic).toBe('spin');
    expect(out[1].exclusivity).toBe('solo-mouse');
  });

  it('documents difficulty-scaled keyboard layout and spin constraints', () => {
    const doc = fs.readFileSync(new URL('../docs/input-system-redesign.md', import.meta.url), 'utf8');
    expect(doc).toContain('Easy: 2 keys');
    expect(doc).toContain('Normal: 4 keys');
    expect(doc).toContain('Hard: 6 keys');
    expect(doc).toContain('Appears **exactly twice per song**');
  });

  it('assigns keyboard taps, mouse clicks, and mouse-only drags', () => {
    const policy = loadPolicy();
    const notes = policy.layerCInputChannelPlanner(policy.layerABaseChartProposal([
      { time: 1, type: 'tap', laneHint: 0 },
      { time: 2, type: 'hold', laneHint: 1 },
      { time: 3, type: 'drag', laneHint: 2 },
      { time: 4, type: 'tap', laneHint: 3 },
      { time: 5, type: 'tap', laneHint: 0 },
      { time: 6, type: 'tap', laneHint: 1 },
      { time: 7, type: 'tap', laneHint: 2 },
      { time: 8, type: 'tap', laneHint: 3 }
    ]), { difficulty: 'normal' });
    expect(policy.keyboardLayoutForDifficulty('normal')).toEqual(['F', 'G', 'H', 'J']);
    expect(policy.keyboardLayoutForDifficulty('hard')).toEqual(['A', 'S', 'D', 'J', 'K', 'L']);
    expect(notes[2].inputChannel).toBe('mouse');
    expect(notes[2].keyHint).toBeNull();
    expect(['keyboard', 'mouse']).toContain(notes[1].inputChannel);
    // click/tap split — all plain notes are either keyboard tap or mouse click
    expect(notes.slice(4).every(note => ['keyboard', 'mouse'].includes(note.inputChannel))).toBe(true);
  });
});
