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

function loadPathTemplates() {
  const code = fs.readFileSync(new URL('../path-templates.js', import.meta.url), 'utf8');
  const context = { window: {}, console };
  context.global = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'path-templates.js' });
  return context.window.PathTemplates;
}

describe('space layout policy', () => {
  it('exports modern tutorial labels', () => {
    const p = loadPolicy();
    expect(p.tutorialLabelForType('spin')).toBe('SPIN');
  });

  it('detects footprint overlap between geometry drag path and nearby note', () => {
    const p = loadPolicy();
    const drag = { x: 100, y: 100, endX: 260, endY: 100, noteType: 'drag', pathVariant: 'starTrace' };
    const tap = { x: 180, y: 110, noteType: 'tap' };
    const issues = p.auditFootprints([drag, tap], 36);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('sorts spin and drags ahead of taps for layout priority', () => {
    const p = loadPolicy();
    const sorted = p.sortByLayoutPriority([
      { noteType: 'tap' },
      { noteType: 'drag' },
      { noteType: 'spin' },
      { noteType: 'hold' }
    ]);
    expect(sorted[0].noteType).toBe('spin');
    expect(sorted[1].noteType).toBe('drag');
  });

  it('downgrades later long-path conflicts when footprints overlap badly', () => {
    const p = loadPolicy();
    const notes = [
      { x: 100, y: 100, endX: 260, endY: 100, noteType: 'drag', type: 'drag', pathVariant: 'starTrace' },
      { x: 120, y: 110, endX: 280, endY: 110, noteType: 'drag', type: 'drag', pathVariant: 'starTrace' }
    ];
    const resolved = p.resolvePathConflicts(notes, 36);
    expect(resolved[0].type).toBe('drag');
    expect(['drag', 'tap']).toContain(resolved[1].type);
  });

  it('prefers non-orbit geometry when surfacing guarantee is requested', () => {
    const templates = loadPathTemplates();
    const chosen = templates.chooseTemplate({ noteNumber: 11, segmentLabel: 'chorus', phraseIntent: 'sweep' }, 'normal', {
      recentTemplates: ['orbit', 'orbit'],
      forceGeometry: true
    });
    expect(['diamondLoop', 'starTrace']).toContain(chosen);
  });

  it('avoids repeating the same geometry template when recent history is saturated', () => {
    const templates = loadPathTemplates();
    const chosen = templates.chooseTemplate({ noteNumber: 18, segmentLabel: 'chorus', phraseIntent: 'pivot' }, 'hard', {
      recentTemplates: ['starTrace', 'starTrace', 'diamondLoop']
    });
    expect(chosen).not.toBe('starTrace');
  });

  it('reports spatial jump and center-bias metrics', () => {
    const p = loadPolicy();
    const stats = p.spatialFlowStats([
      { time: 1, laneHint: 0 },
      { time: 2, laneHint: 3 },
      { time: 3, laneHint: 1 },
      { time: 4, laneHint: 2 }
    ]);
    expect(stats.largeJumpCount).toBeGreaterThan(0);
    expect(stats.maxLaneJump).toBeGreaterThanOrEqual(2);
    expect(stats.directionReversalCount).toBeGreaterThan(0);
  });

  it('reports geometry surfacing ratios for non-arc templates', () => {
    const p = loadPolicy();
    const stats = p.geometryTemplateStats([
      { type: 'drag', noteType: 'drag', pathTemplate: 'arc' },
      { type: 'drag', noteType: 'drag', pathTemplate: 'diamondLoop', extraPath: { points: [{x:0,y:0}] } },
      { type: 'drag', noteType: 'drag', pathTemplate: 'starTrace' }
    ]);
    expect(stats.geometryCount).toBe(2);
    expect(stats.geometryRatio).toBeGreaterThan(0.5);
    expect(stats.runtimeVisibleRatio).toBe(1);
  });
});
