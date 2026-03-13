import { describe, it, expect } from 'vitest';
import fs from 'fs';
import vm from 'vm';

function loadBrowserScripts(files, extra = {}) {
  const context = { window: {}, console, ...extra };
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

  it('can send the reviewer request to a review endpoint', async () => {
    const fetchCalls = [];
    const fetchStub = async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        async json() { return { ok: true, review: { summary: 'stub' } }; }
      };
    };
    const win = loadBrowserScripts(['chart-policy.js', 'chart-reviewer.js'], { fetch: fetchStub, window: { fetch: fetchStub } });
    const result = await win.ChartReviewer.requestReview('http://127.0.0.1:8787', { notes: [{ time: 1, type: 'tap' }] }, {});
    expect(fetchCalls[0].url).toContain('/api/chart-review');
    expect(result.review.summary).toBe('stub');
  });
});
