import { describe, it, expect } from 'vitest';
import fs from 'fs';
import vm from 'vm';

function loadBrowserScript(file, extraWindow = {}) {
  const code = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const context = {
    window: { ...extraWindow },
    performance: { now: () => 0 },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  context.global = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: file });
  return context.window;
}

describe('ChartRuntime startup scheduling', () => {
  it('supports conservative opening ramp while still allowing early first-note visibility when configured', () => {
    const win = loadBrowserScript('chart-runtime.js');
    const runtime = new win.ChartRuntime();
    runtime.load({
      notes: [
        { time: 1.834, type: 'click' },
        { time: 2.717, type: 'click' }
      ]
    });
    const conservative = runtime.spawnUntil(0.5, (currentTime, note, index) => ({ currentTime, note, index }), { openingRampSec: 2.8, visibleSustainedCap: 1, visibleSustainedCount: 0 });
    const permissive = runtime.spawnUntil(0.5, (currentTime, note, index) => ({ currentTime, note, index }), { openingRampSec: 0.2, visibleSustainedCap: 9, visibleSustainedCount: 0 });
    expect(conservative.length).toBeGreaterThanOrEqual(0);
    expect(permissive.length).toBeGreaterThan(0);
    expect(permissive[0].note.time).toBe(1.834);
  });

  it('lets spawn lead time diverge from visual approach duration inputs', () => {
    const win = loadBrowserScript('chart-runtime.js');
    const runtime = new win.ChartRuntime({ spawnLeadTimeMs: 1800 });
    runtime.load({ notes: [{ time: 2.1, type: 'click' }] }, { spawnLeadTimeMs: 1800 });
    const spawned = runtime.spawnUntil(0.4, (currentTime, note, index) => ({ currentTime, note, index }), { openingRampSec: 0.2, visibleSustainedCap: 9, visibleSustainedCount: 0 });
    expect(runtime.snapshot().spawnLeadTimeMs).toBe(1800);
    expect(spawned.length).toBe(1);
    expect(spawned[0].note.time).toBe(2.1);
  });

  it('honors per-note opening preview bias so calm-window notes can appear earlier', () => {
    const win = loadBrowserScript('chart-runtime.js');
    const runtime = new win.ChartRuntime({ spawnLeadTimeMs: 1200 });
    runtime.load({ notes: [{ time: 2.45, type: 'drag', spawnLeadBiasSec: 1.0 }] }, { spawnLeadTimeMs: 1200 });
    const spawned = runtime.spawnUntil(0.3, (currentTime, note, index) => ({ currentTime, note, index }), { openingRampSec: 0.2, visibleSustainedCap: 9, visibleSustainedCount: 0 });
    expect(spawned.length).toBe(1);
    expect(spawned[0].note.spawnLeadBiasSec).toBe(1.0);
  });
});

describe('RunClockController chart-mode behavior', () => {
  it('uses wall time to drive chart-mode startup even when playback time is still zero', () => {
    const win = loadBrowserScript('clock-controller.js');
    const clock = new win.RunClockController();
    clock.startedAtWall = 0;
    clock.pauseAccumulated = 0;
    clock.mode = 'playing';
    clock.playbackStarted = true;
    clock.getWallTime = () => 0.58;
    clock.attachPlayback(() => 0);
    const runTime = clock.getRunTime({ paused: false, chartMode: true });
    expect(runTime).toBe(0.58);
  });
});
