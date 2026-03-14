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
    segmentLabel: i < 15 ? 'intro' : i < 30 ? 'verse' : i < 45 ? 'chorus' : 'bridge',
    proposalType: i === 25 || i === 55 ? 'spin' : (i % 7 === 0 ? 'drag' : 'tap')
  }));
}

describe('chart policy quotas', () => {
  it('spreads modern non-tap mechanics across the full song', () => {
    const policy = loadPolicy();
    const notes = policy.spreadQuotaPromotions(makeNotes(80));
    const windows = [0, 0, 0, 0];
    notes.forEach((note, idx) => {
      if ((note.type || note.noteType) === 'tap') return;
      const bucket = Math.min(3, Math.floor(idx / 20));
      windows[bucket] += 1;
    });
    expect(windows[1]).toBeGreaterThan(0);
    expect(windows[2]).toBeGreaterThan(0);
    expect(windows[3]).toBeGreaterThan(0);
  });

  it('keeps spin count capped at two and preserves modern mechanic set', () => {
    const policy = loadPolicy();
    const assigned = policy.assignMechanics(makeNotes(72), {});
    const types = new Set(assigned.map(n => n.type));
    expect([...types].every(type => ['tap', 'hold', 'drag', 'spin'].includes(type))).toBe(true);
    expect(assigned.filter(n => n.type === 'spin').length).toBeLessThanOrEqual(2);
  });

  it('caps first-half drag ratio after opening guard runs', () => {
    const policy = loadPolicy();
    const notes = Array.from({ length: 24 }, (_, i) => ({
      time: 1 + i * 1.1,
      type: i < 12 ? 'drag' : 'tap',
      noteType: i < 12 ? 'drag' : 'tap',
      laneHint: i % 4,
      segmentLabel: i < 8 ? 'intro' : 'verse'
    }));
    const out = policy.applyOpeningWindowPolicy(notes, { firstHalfWindowSec: 18, firstHalfSustainRatioCap: 0.34, openingSustainConcurrencyCap: 1, minOpeningDragGapSec: 1.8 });
    const firstHalf = out.filter(n => Number(n.time) <= 18);
    const sustained = firstHalf.filter(n => (n.type || n.noteType) === 'drag');
    expect(sustained.length / firstHalf.length).toBeLessThanOrEqual(0.34);
  });

  it('isolates spin and reduces nearby sustained overlaps', () => {
    const policy = loadPolicy();
    const notes = [
      { time: 20, type: 'spin', laneHint: 1, segmentLabel: 'bridge' },
      { time: 20.5, type: 'drag', laneHint: 1, segmentLabel: 'bridge' },
      { time: 20.9, type: 'hold', laneHint: 2, segmentLabel: 'bridge' }
    ];
    policy.enforceChartPlayability(notes);
    expect(notes[1].type).toBe('tap');
    expect(notes[2].type).toBe('tap');
  });

  it('provides tutorial labels for modern mechanics', () => {
    const policy = loadPolicy();
    expect(policy.tutorialLabelForType('hold')).toBe('HOLD');
    expect(policy.tutorialLabelForType('hold', { inputChannel: 'keyboard' })).toBe('KEY HOLD');
    expect(policy.tutorialLabelForType('drag')).toBe('DRAG');
    expect(policy.tutorialLabelForType('spin')).toBe('SPIN');
  });

  it('keeps a density floor in the first 30 seconds', () => {
    const policy = loadPolicy();
    const notes = Array.from({ length: 20 }, (_, i) => ({
      time: 1 + i * 1.2,
      type: i % 2 === 0 ? 'drag' : 'hold',
      noteType: i % 2 === 0 ? 'drag' : 'hold',
      laneHint: i % 4,
      segmentLabel: 'verse'
    }));
    const resolved = policy.resolvePathConflicts(notes, 36);
    const stats = policy.densityStats(resolved, 10, 30);
    expect(stats.first30).toBeGreaterThanOrEqual(12);
    expect(stats.minWindowCount).toBeGreaterThanOrEqual(3);
  });

  it('keeps tap ratio under control and preserves latter-half specials', () => {
    const policy = loadPolicy();
    const notes = Array.from({ length: 60 }, (_, i) => ({
      time: 1 + i,
      type: 'tap',
      noteType: 'tap',
      laneHint: i % 4,
      segmentLabel: i < 20 ? 'verse' : i < 40 ? 'chorus' : 'bridge'
    }));
    const finalized = policy.finalizePlayableChartPipeline(notes, { circleSize: 36, openingSeconds: 12, sustainedCooldownSec: 1.6, holdCooldownSec: 2.6, minFirst30: 12, minPer10: 3, maxTapRatio: 0.58, minLatterSpecialRatio: 0.22 });
    const mix = policy.mechanicMixStats(finalized);
    expect(mix.tapRatio).toBeLessThanOrEqual(0.58);
    expect(mix.latterSpecialRatio).toBeGreaterThanOrEqual(0.22);
  });
+
  it('builds bar plans with opening-safe energy caps and breathing structure', () => {
    const policy = loadPolicy();
    const notes = Array.from({ length: 24 }, (_, i) => ({
      time: 0.8 + i * 0.5,
      type: 'tap',
      noteType: 'tap',
      proposalType: i % 5 === 0 ? 'drag' : 'tap',
      laneHint: i % 4,
      segmentLabel: i < 8 ? 'intro' : i < 16 ? 'verse' : 'chorus',
      strength: 1.1
    }));
    const built = policy.buildBarPlan(notes, { beatsPerBar: 4, openingSafeBars: 8, breathingMinEveryBars: 3 });
    expect(built.bars.length).toBeGreaterThan(2);
    expect(built.bars[0].energyLevel).toBe('light');
    expect(['light', 'medium']).toContain(built.bars[1].energyLevel);
    expect(built.bars.some(bar => bar.energyLevel === 'rest' || bar.energyLevel === 'light')).toBe(true);
  });

  it('arranges bars by pruning overload while keeping accents', () => {
    const policy = loadPolicy();
    const notes = Array.from({ length: 18 }, (_, i) => ({
      time: 2 + i * 0.22,
      type: 'tap',
      noteType: 'tap',
      proposalType: i % 4 === 0 ? 'drag' : 'tap',
      laneHint: i % 4,
      segmentLabel: 'chorus',
      strength: i % 3 === 0 ? 1.4 : 0.7,
      accentWeight: i % 3 === 0 ? 1.2 : 0.6
    }));
    const barPlan = policy.buildBarPlan(notes, { beatsPerBar: 4 });
    const arranged = policy.arrangeBars(notes, barPlan, { pressureWindowMs: 1000 });
    expect(arranged.arrangedNotes.length).toBeLessThan(notes.length);
    expect(arranged.arrangedNotes.every(note => note.arranged)).toBe(true);
    expect(arranged.arrangedNotes.some(note => note.keepReason === 'bar-accent')).toBe(true);
  });

  it('disables old keyboard checkpoint path prompts for drag notes', () => {
    const policy = loadPolicy();
    const out = policy.assignKeyboardCheckpoints([
      { time: 11.5, type: 'drag', noteType: 'drag', pathTemplate: 'diamondLoop', segmentLabel: 'verse' },
      { time: 17, type: 'drag', noteType: 'drag', pathTemplate: 'starTrace', segmentLabel: 'chorus' }
    ]);
    expect(out.every(note => !note.keyboardCheckpoint)).toBe(true);
  });

  it('combines mechanic, spatial, and geometry audits into a single chart-shape summary', () => {
    const policy = loadPolicy();
    const audit = policy.auditChartShape([
      { time: 1, type: 'tap', laneHint: 1 },
      { time: 2, type: 'drag', laneHint: 3, noteType: 'drag', pathTemplate: 'diamondLoop', extraPath: { points: [{ x: 0, y: 0 }] } },
      { time: 3, type: 'drag', laneHint: 1, noteType: 'drag', pathTemplate: 'starTrace' },
      { time: 4, type: 'tap', laneHint: 2 }
    ]);
    expect(audit.mechanic.tapRatio).toBeGreaterThanOrEqual(0);
    expect(audit.spatial.maxLaneJump).toBeGreaterThan(0);
    expect(audit.geometry.geometryCount).toBe(2);
  });

  it('exposes layered pipeline helpers for final mechanic decisions', () => {
    const policy = loadPolicy();
    const notes = [
      { time: 1, type: 'tap', laneHint: 0, segmentLabel: 'intro' },
      { time: 2, type: 'tap', laneHint: 1, segmentLabel: 'verse' },
      { time: 25, proposalType: 'spin', type: 'tap', laneHint: 2, segmentLabel: 'chorus' }
    ];
    const a = policy.layerABaseChartProposal(notes);
    const b = policy.layerBMechanicPlanner(a, {});
    const c = policy.layerCInputChannelPlanner(b, { difficulty: 'normal' });
    const d = policy.layerDOpeningGuard(c, {});
    const e = policy.layerEPlayabilityGuard(d, { circleSize: 36 });
    const f = policy.layerFGeometryPrep(e, {});
    const g = policy.layerGRuntimeAudit(f, {});
    expect(g.notes.length).toBe(3);
    expect(g.audit.mechanic.tapRatio).toBeGreaterThanOrEqual(0);
  });
});
