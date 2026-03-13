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

describe('opening policy', () => {
  it('limits sustained mechanics during opening window', () => {
    const p = loadPolicy();
    const notes = Array.from({ length: 12 }, (_, i) => ({
      time: 1 + i * 1.2,
      type: i < 6 ? 'pulseHold' : 'drag',
      noteType: i < 6 ? 'pulseHold' : 'drag',
      laneHint: i % 4,
      segmentLabel: 'verse'
    }));
    const out = p.applyOpeningWindowPolicy(notes, { openingSeconds: 12 });
    const opening = out.filter(n => n.time <= 12);
    const sustained = opening.filter(n => ['pulseHold','drag','ribbon','orbit','diamondLoop','starTrace'].includes(n.type || n.noteType));
    const holds = opening.filter(n => (n.type || n.noteType) === 'pulseHold');
    expect(sustained.length).toBeLessThanOrEqual(3);
    expect(holds.length).toBeLessThanOrEqual(1);
  });

  it('enforces global sustained cooldown for mouse playability', () => {
    const p = loadPolicy();
    const notes = [
      { time: 5, type: 'pulseHold', noteType: 'pulseHold', laneHint: 0, segmentLabel: 'verse' },
      { time: 5.8, type: 'drag', noteType: 'drag', laneHint: 1, segmentLabel: 'verse' },
      { time: 6.2, type: 'ribbon', noteType: 'ribbon', laneHint: 2, segmentLabel: 'chorus' },
      { time: 8.9, type: 'drag', noteType: 'drag', laneHint: 2, segmentLabel: 'chorus' }
    ];
    const out = p.applyMousePlayabilityFilter(notes, { sustainedCooldownSec: 1.6, holdCooldownSec: 2.6 });
    const sustained = out.filter(n => p.isSustainedType(n.type || n.noteType));
    expect(sustained.length).toBeLessThanOrEqual(2);
    expect((out[1].type || out[1].noteType)).toBe('tap');
  });
});
