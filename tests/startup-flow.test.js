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
  it('spawns first analyzed notes early enough for run startup', () => {
    const win = loadBrowserScript('chart-runtime.js');
    const runtime = new win.ChartRuntime();
    runtime.load({
      notes: [
        { time: 1.834, type: 'tap' },
        { time: 2.717, type: 'tap' }
      ]
    });
    const spawned = runtime.spawnUntil(0.13, (currentTime, note, index) => ({ currentTime, note, index }));
    expect(spawned.length).toBeGreaterThan(0);
    expect(spawned[0].note.time).toBe(1.834);
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
