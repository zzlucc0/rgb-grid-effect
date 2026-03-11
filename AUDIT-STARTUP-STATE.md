# Startup / Runtime State Audit

Date: 2026-03-11
Project: `rgb-grid-effect`

## Goal

Stop patching symptoms. Identify the full startup/runtime logic, state collisions, and structural漏洞 before doing a unified refactor.

---

## Current observed behavior

### Fixed symptom
- Countdown ending could bounce the UI back to the input/setup panel.
- This was suppressed by gating setup visibility during runs.

### Remaining symptom
- After countdown, media can play.
- UI stays off the setup panel.
- But no chart spawns.
- Observed debug state from user:
  - `Clock 0.00`
  - `Player 0.00`
  - `Chart 0/324`
  - `Notes 0`

This means:
1. run startup reached media playback,
2. UI scene is no longer the main blocker,
3. gameplay/runtime clock and/or loop progression is still structurally broken.

---

## State inventory

There are currently multiple overlapping state systems.

### 1) UI-ish state
- `scene`
  - values seen: `input`, `ready`, `countdown`, `playing`, `error`

### 2) Run lifecycle state
- `gameState`
  - values seen: `idle`, `ready`, `starting`, `playing`, `paused-user`, `paused-system`

### 3) Boolean execution state
- `isPlaying`

### 4) Content readiness / mode state
- `readyMode`
- `liveMode`
- `chartMode`

### 5) Playback state
- `livePlaybackState`
- `livePlaybackStarted`

### 6) Chart progress state
- `nextChartIndex`
- `spawnedChartNotes`

These are not yet modeled as one state machine. Multiple layers can mutate multiple states.

---

## State write points

### `scene`
In `game.js`:
- constructor initializes `input`
- `setScene(scene, meta)` writes directly
- `syncReadyState()` can auto-switch between `input` and `ready`

In `youtube-client.js`:
- analysis success sets `ready`
- analyze error sets `input`
- cancel sets `input`

### `gameState`
In `game.js`:
- constructor initializes `idle`
- `prepareRun()` -> `starting`
- `beginRun()` -> `playing`
- `syncReadyState()` can set `ready` or `idle`
- pause/resume flows set paused / playing

### `isPlaying`
In `game.js`:
- constructor initializes `false`
- `beginRun()` sets `true`
- no centralized stop/reset path was identified in the audited slices

### `readyMode`
Set from:
- local audio upload path in `game.js`
- multiple analysis result paths in `youtube-client.js`
- reset to `null` on analyze failure/cancel paths

### `liveMode` / `chartMode`
Mostly set by `youtube-client.js` analysis application paths.
These modes are configured outside the core run controller.

### `livePlaybackState`
Set by:
- start button catch -> `start-error`
- `prepareRun()` -> `idle`
- playback backend catch -> `backend-error`
- game loop catch -> `runtime-error`
- `markLivePlaybackState()` and player/media events

---

## Key structural problems

## Problem A — Too many sources of truth
The runtime is currently governed by overlapping state layers:
- `scene`
- `gameState`
- `isPlaying`
- `readyMode`
- `liveMode`
- `chartMode`
- `livePlaybackState`

These are not strictly hierarchical. Some are UI-facing, some are execution-facing, some are content-facing, but they can all influence each other indirectly.

### Impact
- A content readiness update can affect scene rendering.
- A HUD update can call `syncReadyState()` again.
- Playback failures can leak into scene changes.
- Future features will likely reintroduce collisions.

---

## Problem B — `updateHUD()` has side effects through `syncReadyState()`
Current flow:
- `updateHUD()` calls `syncReadyState()` first.
- `syncReadyState()` can mutate:
  - `gameState`
  - `scene`
  - DOM visibility via `renderScene()`

This means a supposedly presentational update path can mutate core runtime state.

### Why this is dangerous
HUD refresh should be pure rendering. Right now it can:
- change scene,
- change readiness state,
- re-run DOM transitions.

This is a major architectural hazard.

**Refactor rule:** `updateHUD()` must become render-only.

---

## Problem C — `youtube-client.js` owns core mode mutations
`youtube-client.js` currently writes directly to core runtime fields:
- `liveMode`
- `chartMode`
- `audioBuffer`
- `chartData`
- `nextChartIndex`
- `liveConfig`
- `readyMode`
- `scene`

### Impact
The analysis/application layer is directly configuring gameplay runtime internals.

This makes the system fragile because startup logic is split across:
- the client bridge (`youtube-client.js`)
- the game engine (`game.js`)

**Refactor rule:** move result application into a single game-side controller API, e.g.:
- `loadOfflineChart(result)`
- `loadOnlineAnalyzedChart(result)`
- `loadOnlineSeededLive(result)`

`youtube-client.js` should only pass data in.

---

## Problem D — Run startup still mixes phases, even after first split
The split into:
- `prepareRun()`
- `runCountdown()`
- `beginRun()`
- `startPlaybackBackend()`

was directionally correct, but the system is still not fully separated because:
- mode configuration is still external,
- chart normalization happens inside run preparation,
- playback attach still updates status/UI directly,
- loop creation is not centrally supervised.

**Refactor rule:** promote this split into a real run controller.

---

## Problem E — No dedicated chart controller
Chart behavior is spread across:
- run preparation (chart normalization)
- `generateNotes()`
- `spawnChartNotesUpTo()`
- `watchPlaybackIntegrity()`
- `getGameClockTime()`

### Impact
Chart advancement currently depends on several loosely coordinated functions.

Observed symptom (`Clock 0.00`, `Chart 0/324`) suggests chart progression still lacks a single authoritative owner.

**Refactor rule:** chart progression should be owned by one controller with:
- chart normalization
- chart clock selection
- spawn progression
- debug exposure

---

## Problem F — Clock model is not explicitly separated
There are at least three conceptual clocks:
1. run wall clock
2. player clock
3. chart/gameplay clock

Current implementation partially uses wall clock fallback for chart mode, but the ownership is still fuzzy.

### Desired model
- `runClock`: monotonic runtime clock from countdown end
- `playerClock`: media clock from YT/audio/hls
- `chartClock`: usually derived from `runClock`

For analyzed online charts, **chart progression should not depend on playback startup success**.

**Refactor rule:** online-analyzed should use:
- `chartClock = runClock`
- `playerClock` only for sync/debug/strict validation

---

## Problem G — No central loop supervision
`gameLoop()` currently self-schedules with `requestAnimationFrame()`.
If it returns early or exits due to runtime state transitions, there is no higher-level controller verifying that the main loop is alive.

Potential hazards:
- paused states returning without rescheduling in the wrong context,
- silent loop death if state transitions become inconsistent,
- multiple loop entry points (`startGame`, `resumeGame`) without centralized ownership.

**Refactor rule:** one loop owner; resume should re-arm through the same run controller path.

---

## Problem H — UI rendering is still scattered
DOM writes are spread across gameplay/business logic:
- `statusText.innerHTML = ...`
- setup visibility in `renderScene()`
- pause overlay in both `renderScene()` and `updatePauseUI()`
- ready panel logic in `youtube-client.js`

**Refactor rule:** centralize UI rendering layers:
- scene rendering
- status rendering
- debug rendering
- pause rendering

---

## Immediate likely cause of the current no-chart symptom
Based on observed behavior:
- audio playback starts,
- setup scene no longer reappears,
- no notes spawn,
- debug clock remains `0.00`.

Most likely causes now:
1. `gameLoop()` is not continuing reliably after run start, or
2. `getGameClockTime()` is still not advancing in the effective runtime path, or
3. chart spawn is being gated by a path that still assumes player/livestate progression.

This should be verified with instrumentation, but the fix should happen inside the larger refactor rather than another isolated patch.

---

## Proposed target architecture

## A. RunController
Owns:
- run phase
- countdown
- begin/pause/resume/end/fail
- loop start/stop

States:
- `idle`
- `ready`
- `preparing`
- `countdown`
- `running`
- `paused`
- `failed`
- `finished`

## B. PlaybackController
Owns:
- YouTube/audio/hls attachment
- player currentTime
- player state
- attach/play/pause/resume/errors

States:
- `detached`
- `attaching`
- `ready`
- `playing`
- `buffering`
- `paused`
- `error`

## C. ChartController
Owns:
- chart normalization
- next chart index
- chart clock
- spawn progression
- chart debug fields

## D. UIController
Owns:
- scene visibility
- status text
- ready panel
- pause overlay
- debug strip

## E. GameCore
Owns:
- note list
- note update/render/judgement
- combo/score
- input handling

---

## Refactor rules (non-negotiable)

1. `updateHUD()` must not mutate runtime state.
2. `youtube-client.js` must not write engine internals directly.
3. Scene transitions must be derived from run state, not arbitrary helper calls.
4. Chart progression must have one owner.
5. Playback attach failure must not control scene transitions.
6. Online-analyzed chart spawn must not depend on playback start success.
7. DOM writes must be funneled through rendering helpers.

---

## Recommended execution order

### Step 1 — freeze behavior and remove further patching
- stop symptom patches
- treat current code as audit baseline

### Step 2 — extract state tables
- define canonical enums for run, scene, playback
- remove shadow meaning between `scene`, `gameState`, `isPlaying`, `readyMode`

### Step 3 — create `load*` APIs on game side
Replace direct runtime mutation from `youtube-client.js` with explicit game APIs.

### Step 4 — move to RunController
- own `start`, `countdown`, `begin`, `pause`, `resume`, `fail`
- own loop arming

### Step 5 — create ChartController
- normalize chart once
- own `nextChartIndex`
- expose `advance(chartClock)`

### Step 6 — create PlaybackController
- abstract player attach/playback state
- expose `getCurrentTime()` and state

### Step 7 — make UI render-only
- no gameplay code directly changing page structure except through UI controller

### Step 8 — add instrumentation
At minimum expose:
- run state
- scene
- playback state
- chart clock
- player clock
- nextChartIndex
- active note count
- last loop tick

---

## Suggested first concrete refactor task

Do **not** patch note spawning first.

Do this first:
1. remove `syncReadyState()` from `updateHUD()`
2. make readiness/scene updates explicit at load/start/cancel boundaries only
3. add one run controller object or equivalent methods that own all phase transitions

This is the smallest move that meaningfully reduces future breakage.

---

## Summary

The current failures are symptoms of a structural issue:
- overlapping states,
- side-effect-heavy render/update paths,
- cross-file ownership leaks,
- no single owner for run/chart/playback lifecycles.

The correct next step is a unified runtime/state refactor, not more symptom patches.
