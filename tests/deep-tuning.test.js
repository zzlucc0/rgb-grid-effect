import { describe, it, expect } from 'vitest';
import fs from 'fs';
import vm from 'vm';

function loadScript(file, extra = {}) {
  const code = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const context = { window: {}, console, ...extra };
  context.global = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: file });
  return context.window;
}

describe('deep tuning hooks', () => {
  it('lets variety tuning alter mechanic assignment preferences', () => {
    const win = loadScript('chart-policy.js');
    const notes = Array.from({ length: 16 }, (_, i) => ({ time: i + 1, type: 'tap', noteType: 'tap', laneHint: i % 4, segmentLabel: 'chorus' }));
    const base = win.ChartPolicy.assignMechanics(notes.map(n => ({ ...n })), {});
    const tuned = win.ChartPolicy.assignMechanics(notes.map(n => ({ ...n })), { varietyBoost: 0.3, tapPenaltyBoost: 0.6 });
    const baseTaps = base.filter(n => n.type === 'tap').length;
    const tunedTaps = tuned.filter(n => n.type === 'tap').length;
    expect(tunedTaps).toBeLessThanOrEqual(baseTaps);
  });

  it('lets geometry tuning bias template selection away from orbit', () => {
    const win = loadScript('path-templates.js');
    const chosen = win.PathTemplates.chooseTemplate({ noteNumber: 9, segmentLabel: 'chorus', phraseIntent: 'sweep' }, 'normal', {
      recentTemplates: ['orbit'],
      forceGeometryFloor: 3,
      geometryBiasBoost: 0.8
    });
    expect(['diamondLoop', 'starTrace']).toContain(chosen);
  });

  it('wires spatial tuning keys into lane candidate selection', () => {
    const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    expect(game).toContain('const localityBias =');
    expect(game).toContain('const maxJumpBudget =');
    expect(game).toContain('const jumpPenaltyBoost =');
    expect(game).toContain('Math.abs(candidateLane - previousLane) > Math.max(1, maxJumpBudget)');
  });
});
