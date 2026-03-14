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

  it('does not backfill density by default in finalizer', () => {
    const policy = loadPolicy();
    const notes = Array.from({ length: 20 }, (_, i) => ({
      time: 1 + i,
      type: 'tap',
      noteType: 'tap',
      laneHint: i % 4,
      segmentLabel: i < 10 ? 'verse' : 'chorus'
    }));
    const finalized = policy.finalizePlayableChartPipeline(notes, { maxTapRatio: 0.2, minLatterSpecialRatio: 0.9 });
    const mix = policy.mechanicMixStats(finalized);
    expect(mix.tapRatio).toBeGreaterThan(0.2);
    expect(mix.latterSpecialRatio).toBeLessThan(0.9);
  });

  it('exports pipeline snapshots with per-stage strain stats', () => {
    const policy = loadPolicy();
    const notes = Array.from({ length: 12 }, (_, i) => ({
      time: 0.8 + i * 0.35,
      type: 'tap',
      noteType: 'tap',
      proposalType: i % 3 === 0 ? 'drag' : 'tap',
      laneHint: i % 4,
      segmentLabel: i < 4 ? 'intro' : i < 8 ? 'verse' : 'chorus',
      strength: 1.1,
      accentWeight: 1.0
    }));
    const snapshots = policy.pipelineSnapshots(notes, { downbeats: [0, 2, 4], windowMs: 500 });
    expect(snapshots.candidate.noteCount).toBeGreaterThan(0);
    expect(snapshots.arranged.noteCount).toBeGreaterThan(0);
    expect(snapshots.finalized.strain.maxStrain).toBeGreaterThanOrEqual(0);
  });

  it('enforces preserve-gap ranges and window strain caps during arrangement', () => {
    const policy = loadPolicy();
    const notes = [
      { time: 0.1, proposalType: 'tap', type: 'tap', noteType: 'tap', laneHint: 0, segmentLabel: 'verse', strength: 1.5, accentWeight: 1.4 },
      { time: 0.18, proposalType: 'tap', type: 'tap', noteType: 'tap', laneHint: 1, segmentLabel: 'verse', strength: 1.4, accentWeight: 1.3 },
      { time: 0.26, proposalType: 'tap', type: 'tap', noteType: 'tap', laneHint: 2, segmentLabel: 'verse', strength: 1.3, accentWeight: 1.2 },
      { time: 0.9, proposalType: 'tap', type: 'tap', noteType: 'tap', laneHint: 0, segmentLabel: 'verse', strength: 1.2, accentWeight: 1.1 }
    ];
    const barPlan = { bars: [{
      barIndex: 0,
      startTime: 0,
      endTime: 1.2,
      segmentLabel: 'verse',
      energyLevel: 'light',
      densityBudget: 6,
      sustainBudget: 0,
      simultaneousCap: 1,
      mechanicFamily: 'single-tap-accent',
      repetitionPenalty: 0,
      maxNoteCount: 4,
      maxWindowStrain: 2.0,
      mustPreserveGapRanges: [[0.85, 1.05]]
    }] };
    const arranged = policy.arrangeBars(notes, barPlan, { windowMs: 500 });
    expect(arranged.arrangedNotes.every(n => !(n.time >= 0.85 && n.time <= 1.05))).toBe(true);
    const strain = policy.windowStrainStats(arranged.arrangedNotes, { windowMs: 500 });
    expect(strain.maxStrain).toBeLessThanOrEqual(2.0);
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
    const finalized = policy.finalizePlayableChartPipeline(notes, { circleSize: 36, openingSeconds: 12, sustainedCooldownSec: 1.6, holdCooldownSec: 2.6, minFirst30: 12, minPer10: 3, maxTapRatio: 0.58, minLatterSpecialRatio: 0.22, allowDensityBackfill: true });
    const mix = policy.mechanicMixStats(finalized);
    expect(mix.tapRatio).toBeLessThanOrEqual(0.58);
    expect(mix.latterSpecialRatio).toBeGreaterThanOrEqual(0.22);
  });

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

  it('uses downbeats when building bars instead of only time slicing', () => {
    const policy = loadPolicy();
    const notes = [
      { time: 0.2, type: 'tap', noteType: 'tap', laneHint: 0, segmentLabel: 'intro', strength: 1 },
      { time: 1.0, type: 'tap', noteType: 'tap', laneHint: 1, segmentLabel: 'intro', strength: 1 },
      { time: 4.1, type: 'tap', noteType: 'tap', laneHint: 1, segmentLabel: 'verse', strength: 1 },
      { time: 5.2, type: 'tap', noteType: 'tap', laneHint: 2, segmentLabel: 'verse', strength: 1 },
      { time: 8.05, type: 'tap', noteType: 'tap', laneHint: 2, segmentLabel: 'chorus', strength: 1 }
    ];
    const built = policy.buildBarPlan(notes, { downbeats: [0, 4, 8], beatsPerBar: 4 });
    expect(built.bars[0].startTime).toBe(0);
    expect(built.bars[0].endTime).toBe(4);
    expect(built.bars[1].startTime).toBe(4);
    expect(built.bars[1].endTime).toBe(8);
  });

  it('lets family choice visibly shape arranged output', () => {
    const policy = loadPolicy();
    const notes = [
      { time: 0.5, proposalType: 'hold', type: 'tap', noteType: 'tap', laneHint: 0, segmentLabel: 'verse', strength: 1.5, accentWeight: 1.4 },
      { time: 0.9, proposalType: 'tap', type: 'tap', noteType: 'tap', laneHint: 1, segmentLabel: 'verse', strength: 1.0, accentWeight: 1.0 },
      { time: 1.3, proposalType: 'drag', type: 'tap', noteType: 'tap', laneHint: 2, segmentLabel: 'verse', strength: 0.9, accentWeight: 0.8 },
      { time: 4.2, proposalType: 'drag', type: 'tap', noteType: 'tap', laneHint: 0, segmentLabel: 'chorus', strength: 1.6, accentWeight: 1.4 },
      { time: 4.5, proposalType: 'tap', type: 'tap', noteType: 'tap', laneHint: 1, segmentLabel: 'chorus', strength: 1.0, accentWeight: 1.0 },
      { time: 4.9, proposalType: 'hold', type: 'tap', noteType: 'tap', laneHint: 2, segmentLabel: 'chorus', strength: 0.8, accentWeight: 0.8 }
    ];
    const barPlan = { bars: [
      { barIndex: 0, startTime: 0, endTime: 2, segmentLabel: 'verse', energyLevel: 'medium', densityBudget: 3.6, sustainBudget: 1, simultaneousCap: 2, mechanicFamily: 'hold-anchor', repetitionPenalty: 0 },
      { barIndex: 1, startTime: 4, endTime: 6, segmentLabel: 'chorus', energyLevel: 'medium', densityBudget: 3.6, sustainBudget: 1, simultaneousCap: 2, mechanicFamily: 'drag-sweep', repetitionPenalty: 0 }
    ] };
    const arranged = policy.arrangeBars(notes, barPlan, { pressureWindowMs: 1000 });
    const firstBar = arranged.arrangedNotes.filter(n => n.time < 2);
    const secondBar = arranged.arrangedNotes.filter(n => n.time >= 4 && n.time < 6);
    expect(firstBar.some(n => n.arrangedFamily === 'hold-anchor')).toBe(true);
    expect(firstBar.every(n => n.proposalType !== 'drag')).toBe(true);
    expect(secondBar.some(n => n.arrangedFamily === 'drag-sweep')).toBe(true);
    expect(secondBar.every(n => n.proposalType !== 'hold')).toBe(true);
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
