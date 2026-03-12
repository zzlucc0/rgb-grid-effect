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

describe('space layout policy', () => {
  it('exports tutorial labels', () => {
    const p = loadPolicy();
    expect(p.tutorialLabelForType('gate')).toBe('PASS');
  });

  it('detects footprint overlap between ribbon path and nearby note', () => {
    const p = loadPolicy();
    const ribbon = { x: 100, y: 100, endX: 260, endY: 100, noteType: 'ribbon' };
    const tap = { x: 180, y: 110, noteType: 'tap' };
    const issues = p.auditFootprints([ribbon, tap], 36);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('sorts long-path notes ahead of taps for layout priority', () => {
    const p = loadPolicy();
    const sorted = p.sortByLayoutPriority([
      { noteType: 'tap' },
      { noteType: 'drag' },
      { noteType: 'ribbon' },
      { noteType: 'gate' }
    ]);
    expect(sorted[0].noteType).toBe('ribbon');
    expect(sorted[1].noteType).toBe('drag');
  });
});
