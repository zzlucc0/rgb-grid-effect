import { describe, it, expect } from 'vitest';
import fs from 'fs';
import vm from 'vm';

function loadBrowserScripts(files) {
  const context = { window: {}, console };
  context.global = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of files) {
    const code = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }
  return context.window;
}

describe('chart reviewer payload builder', () => {
  it('builds a compact payload and prompt for AI review', () => {
    const win = loadBrowserScripts(['chart-policy.js', 'chart-reviewer.js']);
    const chart = {
      notes: [
        { time: 1, type: 'tap', laneHint: 1, segmentLabel: 'intro' },
        { time: 4, type: 'drag', noteType: 'drag', laneHint: 2, pathTemplate: 'diamondLoop', extraPath: { points: [{ x: 0, y: 0 }] }, segmentLabel: 'verse' },
        { time: 8, type: 'ribbon', noteType: 'ribbon', laneHint: 1, pathTemplate: 'starTrace', keyboardCheckpoint: true, segmentLabel: 'chorus' }
      ]
    };
    const request = win.ChartReviewer.buildReviewerRequest(chart, {});
    expect(request.payload.schema).toBe('rgb-grid-review.v1');
    expect(request.payload.audit.geometry.geometryCount).toBe(2);
    expect(request.payload.chart.windows.length).toBeGreaterThan(0);
    expect(request.prompt).toContain('opening buffer');
    expect(request.prompt).toContain('scores');
    expect(request.prompt).toContain('issues');
  });
});
