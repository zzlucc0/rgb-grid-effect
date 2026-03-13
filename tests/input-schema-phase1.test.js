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
  it('normalizes base proposals into mechanic/input schema fields', () => {
    const policy = loadPolicy();
    const [note] = policy.layerABaseChartProposal([
      { time: 1.2, proposalType: 'drag', type: 'tap', laneHint: 1, segmentLabel: 'chorus' }
    ]);
    expect(note.proposalMechanic).toBe('drag');
    expect(note.mechanic).toBe('tap');
    expect(note.inputChannel).toBe('shared');
    expect(note.exclusivity).toBe('normal');
    expect(note.pathVariant).toBeNull();
  });

  it('lets mechanic planner set modern mechanic fields consistently', () => {
    const policy = loadPolicy();
    const [note] = policy.layerBMechanicPlanner(policy.layerABaseChartProposal([
      { time: 8, proposalType: 'drag', type: 'tap', laneHint: 0, segmentLabel: 'chorus' }
    ]), {});
    expect(note.mechanic).toBe(note.type);
    expect(note.noteType).toBe(note.type);
    expect(['mouse', 'shared']).toContain(note.inputChannel);
  });

  it('documents difficulty-scaled keyboard layout and spin constraints', () => {
    const doc = fs.readFileSync(new URL('../docs/input-system-redesign.md', import.meta.url), 'utf8');
    expect(doc).toContain('Normal: 4 keys');
    expect(doc).toContain('Hard: 6 keys');
    expect(doc).toContain('Appears **exactly twice per song**');
    expect(doc).toContain('shared does **not** mean fully mixed from the start');
  });
});
