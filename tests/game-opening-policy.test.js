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
  it('adds preview bias during opening while softening early heavy mechanics', () => {
    const p = loadPolicy();
    const notes = [
      { time: 1.2, type: 'hold', noteType: 'hold', inputChannel: 'keyboard', laneHint: 0, segmentLabel: 'verse' },
      { time: 2.1, type: 'drag', noteType: 'drag', laneHint: 1, segmentLabel: 'chorus' },
      { time: 4.2, type: 'drag', noteType: 'drag', laneHint: 2, segmentLabel: 'bridge' },
      { time: 6.8, type: 'drag', noteType: 'drag', laneHint: 3, segmentLabel: 'chorus' }
    ];
    const out = p.applyOpeningWindowPolicy(notes, { openingSeconds: 12, openingCalmWindowSec: 2.4, openingHeavyStartSec: 4.8, openingPreviewBoostSec: 1.1 });
    expect(out[0].spawnLeadBiasSec).toBeGreaterThan(0.5);
    expect(out[0].type).toBe('click');
    expect(out[1].type).toBe('click');
    expect(['click', 'drag']).toContain(out[2].type);
    expect(['click', 'drag']).toContain(out[3].type);
  });

  it('enforces sustained cooldown for drag-only sustained notes', () => {
    const p = loadPolicy();
    const notes = [
      { time: 5, type: 'hold', noteType: 'hold', laneHint: 0, segmentLabel: 'verse' },
      { time: 5.8, type: 'drag', noteType: 'drag', laneHint: 1, segmentLabel: 'verse' },
      { time: 6.2, type: 'hold', noteType: 'hold', laneHint: 2, segmentLabel: 'chorus' },
      { time: 8.9, type: 'drag', noteType: 'drag', laneHint: 2, segmentLabel: 'chorus' }
    ];
    const out = p.applyMousePlayabilityFilter(notes, { sustainedCooldownSec: 1.6, holdCooldownSec: 2.6 });
    const sustained = out.filter(n => p.isSustainedType(n.type || n.noteType));
    expect(sustained.length).toBeLessThanOrEqual(2);
    expect((out[0].type || out[0].noteType)).toBe('hold');
    expect((out[2].type || out[2].noteType)).toBe('hold');
  });

  it('hard-caps opening sustained density and suppresses early drag piles', () => {
    const p = loadPolicy();
    const notes = [
      { time: 1.0, type: 'drag', noteType: 'drag', laneHint: 0, segmentLabel: 'intro' },
      { time: 1.6, type: 'drag', noteType: 'drag', laneHint: 1, segmentLabel: 'intro' },
      { time: 2.0, type: 'drag', noteType: 'drag', laneHint: 2, segmentLabel: 'intro' },
      { time: 2.5, type: 'drag', noteType: 'drag', laneHint: 3, segmentLabel: 'intro' },
      { time: 4.8, type: 'drag', noteType: 'drag', laneHint: 1, segmentLabel: 'verse' }
    ];
    const out = p.applyOpeningWindowPolicy(notes, { openingCalmWindowSec: 2.4, openingHeavyStartSec: 5.4, openingSustainConcurrencyCap: 1, minOpeningDragGapSec: 1.8 });
    const openingSustained = out.filter(n => Number(n.time) <= 8 && p.isSustainedType(n.type || n.noteType));
    expect(openingSustained.length).toBeLessThanOrEqual(2);
    expect(out[1].type).toBe('click');
    expect(out[2].type).toBe('click');
  });
});
