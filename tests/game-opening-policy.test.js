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
});
