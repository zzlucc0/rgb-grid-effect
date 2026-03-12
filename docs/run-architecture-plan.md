# RGB Grid Effect — Run Architecture Plan

## Goal
Refactor the game flow from link input to run finish so that:
- UI becomes presentation-only
- playback becomes an adapter, not a state owner
- chart scheduling becomes deterministic
- run phase becomes the only authoritative gameplay lifecycle
- future feature additions stop causing hidden cross-module regressions

## Current Problems
- `game.js` owns too many responsibilities at once: scene, run lifecycle, playback attach, chart runtime, HUD, monitoring, rendering.
- `youtube-client.js` bridges API responses directly into gameplay state.
- Multiple overlapping state concepts exist: `scene`, `gameState`, `isPlaying`, `readyMode`, `liveMode`, `chartMode`.
- Delayed callbacks can still fight with active run state.
- The run clock is implicit and distributed across playback time, wall clock, pause state, and UI lifecycle.

## Target State Model

### App/UI Phase
- `boot`
- `idle-input`
- `preparing-link`
- `ready`
- `starting-run`
- `in-run`
- `run-paused`
- `run-finished`
- `error`

### Run Phase
- `created`
- `arming`
- `countdown`
- `attaching-playback`
- `playing`
- `paused`
- `finished`
- `aborted`
- `failed`

Rules:
- App/UI phase decides what the user sees.
- Run phase decides what the game is allowed to do.
- Only the run orchestrator may transition run phase.

## Module Split

### 1. Prepare Link Client
Input: URL + difficulty + mode + analysis options
Output: `PreparedRunPayload`

```js
{
  source,
  playback,
  chart,
  rules,
  diagnostics
}
```

### 2. Run Orchestrator
Owns the run lifecycle:
- create
- arm
- countdown
- attach playback
- play
- pause
- resume
- finish
- fail

### 3. Clock Controller
Owns the run clock:
- startup wall clock
- playback clock handoff
- pause freeze/resume
- run time resolution

### 4. Playback Controller
Owns media playback abstraction:
- YouTube
- audio element
- HLS
- direct URL

### 5. Chart Runtime
Owns deterministic note scheduling:
- `spawnUntil(time)`
- chart progress
- depletion / completion signal

### 6. Judgement Engine
Owns active note resolution:
- hit
- hold
- drag
- miss
- score/combo deltas

### 7. UI Presenters
Pure projection of state to DOM:
- setup panel
- HUD
- pause overlay
- debug strip
- results screen

### 8. Playback Monitor
Observation only:
- stalled
- seek-back
- unexpected pause
- ended

It emits events; it does not directly rewrite app/run phase.

## Start-to-Finish Flow
1. User enters URL
2. Prepare client submits analysis request
3. Prepare result becomes `PreparedRunPayload`
4. Orchestrator creates run
5. Orchestrator arms run
6. Countdown starts
7. Playback attach begins
8. Run clock becomes authoritative
9. Chart runtime spawns notes from run time
10. Judgement engine resolves notes
11. Playback and chart depletion converge to finish
12. Results / ready reset happen through explicit transition only

## Phase 1 Refactor Scope (start now)
- Add explicit `RunClockController`
- Add explicit `RunOrchestrator`
- Stop using implicit timing logic scattered across `game.js`
- Prepare `game.js` to consume controller state instead of owning all lifecycle transitions inline

## Phase 2 Refactor Scope
- Extract chart runtime
- Move scheduler logic out of `game.js`
- Add completion criteria for analyzed chart runs

## Phase 3 Refactor Scope
- Extract playback adapters and monitor
- Move YouTube/audio/HLS branching out of core gameplay class

## Immediate Debug Focus
The current post-countdown no-notes bug likely lives in one of these boundaries:
- run clock never advances into schedulable chart time
- playback handoff and chart clock disagree
- `spawnChartNotesUpTo()` runs but scheduled notes are immediately skipped or cleared
- active notes are created but never become visible due to lifecycle coupling

## Acceptance Criteria
- Starting a prepared link run never returns to setup unless the run explicitly fails or finishes.
- Countdown completion always produces either visible notes or a surfaced runtime error.
- Clock source is inspectable and deterministic.
- Playback health can no longer silently mutate UI state.
