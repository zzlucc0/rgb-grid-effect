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

function makeNotes(total = 60) {
  return Array.from({ length: total }, (_, i) => ({
    time: 1 + i * 1.5,
    type: 'tap',
    laneHint: i % 4,
    segmentLabel: i < 15 ? 'intro' : i < 30 ? 'verse' : i < 45 ? 'chorus' : 'bridge'
  }));
}

describe('chart policy quotas', () => {
  it('spreads mechanics across the full song instead of front-loading', () => {
    const policy = loadPolicy();
    const notes = makeNotes(80);
    policy.spreadQuotaPromotions(notes);
    const windows = [0, 0, 0, 0];
    const specials = new Set(['ribbon', 'cut', 'flick', 'gate', 'pulseHold']);
    notes.forEach((note, idx) => {
      if (!specials.has(note.type)) return;
      const bucket = Math.min(3, Math.floor(idx / 20));
      windows[bucket] += 1;
    });
    expect(windows[0]).toBeGreaterThan(0);
    expect(windows[1]).toBeGreaterThan(0);
    expect(windows[2]).toBeGreaterThan(0);
    expect(windows[3]).toBeGreaterThan(0);
  });

  it('reduces nearby heavy overlaps around sustained notes', () => {
    const policy = loadPolicy();
    const notes = [
      { time: 10, type: 'pulseHold', laneHint: 1, segmentLabel: 'verse' },
      { time: 10.2, type: 'flick', laneHint: 1, segmentLabel: 'verse' },
      { time: 10.3, type: 'cut', laneHint: 2, segmentLabel: 'verse' },
      { time: 10.35, type: 'gate', laneHint: 0, segmentLabel: 'verse' },
    ];
    policy.enforceChartPlayability(notes);
    expect(notes[1].type).toBe('tap');
    expect(notes[2].type).toBe('tap');
  });

  it('provides tutorial labels for mechanics', () => {
    const policy = loadPolicy();
    expect(policy.tutorialLabelForType('pulseHold')).toBe('HOLD');
    expect(policy.tutorialLabelForType('ribbon')).toBe('TRACE');
    expect(policy.tutorialLabelForType('cut')).toBe('SLASH');
  });

  it('keeps a density floor in the first 30 seconds', () => {
    const policy = loadPolicy();
    const notes = Array.from({ length: 20 }, (_, i) => ({
      time: 1 + i * 1.2,
      type: i % 2 === 0 ? 'ribbon' : 'gate',
      noteType: i % 2 === 0 ? 'ribbon' : 'gate',
      laneHint: i % 4,
      segmentLabel: 'verse'
    }));
    const resolved = policy.resolvePathConflicts(notes, 36);
    const stats = policy.densityStats(resolved, 10, 30);
    expect(stats.first30).toBeGreaterThanOrEqual(12);
    expect(stats.minWindowCount).toBeGreaterThanOrEqual(3);
  });
});
