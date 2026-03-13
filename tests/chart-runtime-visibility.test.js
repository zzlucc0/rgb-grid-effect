import { describe, it, expect } from 'vitest';
import fs from 'fs';
import vm from 'vm';

function loadRuntime() {
  const code = fs.readFileSync(new URL('../chart-runtime.js', import.meta.url), 'utf8');
  const context = { window: {}, console };
  context.global = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'chart-runtime.js' });
  return context.window.ChartRuntime;
}

describe('chart runtime visibility guard', () => {
  it('limits visible sustained notes during opening ramp', () => {
    const Runtime = loadRuntime();
    const runtime = new Runtime();
    runtime.load({ notes: [
      { time: 1.0, type: 'pulseHold' },
      { time: 1.4, type: 'drag' },
      { time: 1.8, type: 'ribbon' },
      { time: 2.2, type: 'tap' }
    ]});
    const spawned = runtime.spawnUntil(0.7, (t, note, idx) => ({ ...note, idx }), { openingRampSec: 2.8, visibleSustainedCap: 1, visibleSustainedCount: 0 });
    const sustained = spawned.filter(n => ['pulseHold','drag','ribbon'].includes(n.type));
    expect(sustained.length).toBeLessThanOrEqual(1);
  });
});
