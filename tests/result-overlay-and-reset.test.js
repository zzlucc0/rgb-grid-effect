import { describe, it, expect } from 'vitest';
import fs from 'fs';
import vm from 'vm';

function loadRhythmGame() {
  const code = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
  const backgroundCanvas = {
    width: 1280,
    height: 720,
    getContext: () => ({ clearRect: () => {} })
  };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance: { now: () => 0 },
    window: {
      addEventListener: () => {},
      removeEventListener: () => {},
      PathTemplates: null,
      ChartPolicy: null,
      RunClockController: null,
      RunOrchestrator: null,
      ChartRuntime: null,
      RunCompletionController: null,
      PlaybackController: null,
    },
    document: {
      getElementById: (id) => (id === 'backgroundCanvas' ? backgroundCanvas : null),
      createElement: () => ({ style: {}, appendChild: () => {} }),
      body: { appendChild: () => {} },
    },
    AudioContext: function () {},
    webkitAudioContext: function () {},
    Hls: function () {},
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${code}\n;globalThis.__RhythmGame = RhythmGame;`, sandbox, { filename: 'game.js' });
  return { RhythmGame: sandbox.__RhythmGame, sandbox, backgroundCanvas };
}

describe('result stats and menu reset', () => {
  it('counts perfect/good/miss from zero correctly', () => {
    const { RhythmGame } = loadRhythmGame();
    const game = Object.create(RhythmGame.prototype);
    game.judgementStats = { perfect: 0, good: 0, miss: 0 };
    game.canvas = { width: 1280, height: 720 };
    game.circleSize = 80;
    const floats = [];
    let hudUpdates = 0;
    game.pushFloatJudge = (score, x, y) => floats.push({ score, x, y });
    game.updateHUD = () => { hudUpdates += 1; };

    game.recordJudgement('perfect', 100, 200);
    game.recordJudgement('good', 120, 220);
    game.recordJudgement('miss', 140, 240);

    expect(game.judgementStats).toEqual({ perfect: 1, good: 1, miss: 1 });
    expect(floats.map(f => f.score)).toEqual(['perfect', 'good', 'miss']);
    expect(hudUpdates).toBe(3);
  });

  it('clears gameplay canvas state when returning to menu', () => {
    const { RhythmGame } = loadRhythmGame();
    const game = Object.create(RhythmGame.prototype);
    const cleared = [];
    game.canvas = { width: 1280, height: 720 };
    game.ctx = { clearRect: (...args) => cleared.push(['main', ...args]) };
    game.combo = 42;
    game.score = 98765;
    game.notes = [{ id: 1 }];
    game.floatJudges = [{ text: 'PERFECT' }];
    game.comboBanners = [{ text: 'COMBO' }];
    game.currentDragNote = { id: 'drag' };
    game.currentSpinNote = { id: 'spin' };
    game.pointerState = { down: true };
    game.visualBursts = [{ id: 1 }];
    game.signatureBursts = [{ id: 2 }];
    game.feedbackBanners = [{ id: 3 }];
    game.countdownFlash = { text: 'START!' };
    let hudUpdates = 0;
    game.updateHUD = () => { hudUpdates += 1; };

    game.resetRunVisualState();

    expect(game.combo).toBe(0);
    expect(game.score).toBe(0);
    expect(game.notes).toEqual([]);
    expect(game.floatJudges).toEqual([]);
    expect(game.comboBanners).toEqual([]);
    expect(game.visualBursts).toEqual([]);
    expect(game.signatureBursts).toEqual([]);
    expect(game.feedbackBanners).toEqual([]);
    expect(game.countdownFlash).toBe(null);
    expect(game.currentDragNote).toBe(null);
    expect(game.currentSpinNote).toBe(null);
    expect(cleared).toContainEqual(['main', 0, 0, 1280, 720]);
    expect(hudUpdates).toBe(1);
  });
});
