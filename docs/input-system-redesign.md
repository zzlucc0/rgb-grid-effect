# RGB Grid Effect — Input System Redesign

## Goal
Rebuild the game around a clearer keyboard/mouse split for keyboard+mouse players, reduce drag overload, and make mechanic decisions less coupled.

## Confirmed Design

### Core mechanics
- `tap`
- `hold`
- `drag`
- `spin`

### Removed / merged mechanics
- `ribbon` is no longer a separate mechanic family; it becomes a **drag presentation variant**.
- Existing `flick`, `cut`, `gate` should be retired from the modern chart pipeline.

## Input model
Each note should be described by **what the player does** and **which input channel owns it**.

### Note schema target
```js
{
  time: 12.345,
  mechanic: 'tap' | 'hold' | 'drag' | 'spin',
  inputChannel: 'mouse' | 'keyboard' | 'shared',
  keyHint: 'F' | 'G' | 'H' | 'J' | null,
  exclusivity: 'normal' | 'solo-mouse',
  proposalMechanic: 'tap' | 'hold' | 'drag' | 'spin',
  proposalInputChannel: 'mouse' | 'keyboard' | 'shared',
  pathVariant: 'arc' | 'orbit' | 'diamondLoop' | 'starTrace' | null,
  phraseIntent: 'settle' | 'drift' | 'answer' | 'sweep' | 'pivot' | 'suspend',
  segmentLabel: 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro',
  laneHint: 0,
  phrase: 0
}
```

## Mouse mechanics

### Drag
- Only regular mouse mechanic left.
- Must appear less often than before.
- Must support more visually interesting path variants, not just simple arcs.
- Path variants include:
  - `arc`
  - `orbit`
  - `diamondLoop`
  - `starTrace`
- Only one pointer-heavy sustained mouse mechanic should be active at a time.

### Spin
- New dedicated mouse-only event mechanic.
- Appears **exactly twice per song**.
- Placement:
  1. Around the middle of the song.
  2. Near the end, when the last chorus is ending and vocals have dropped out.
- Must appear **alone**:
  - no simultaneous drag
  - no simultaneous other mouse-class mechanic
- Must always be centered on screen.
- Scored by mouse rotation speed / accumulated rotation.
- Duration depends on local musical phrase length.

## Keyboard layout by difficulty
Keyboard lane count must scale with difficulty.

### Suggested defaults
- Easy: 2 keys
- Normal: 4 keys
- Hard: 6 keys
- Expert / future: 8 keys if needed

### Normal layout (confirmed)
- 4 keys at normal difficulty.
- Recommended default set:
  - `F`
  - `G`
  - `H`
  - `J`

## Shared mechanics policy
`tap` and `hold` are shared mechanics, but shared does **not** mean fully mixed from the start.

### Early-game rule
At the start of a chart, a note uses **one single input channel only**.
Examples:
- keyboard tap only
- mouse tap only
- keyboard hold only
- mouse hold only

### Progression rule
As the song progresses, shared mechanics may upgrade into **mixed input design**:
- the chart may alternate mouse/keyboard ownership more aggressively
- later segments can mix both input families in tighter succession
- but still avoid unreadable simultaneous overload

## Layered architecture

### Layer A — Segment intent
Determine phrase/segment role:
- intro
- chime / alert
- vocal phrase
- break
- chorus drive
- outro

### Layer B — Mechanic planner
Choose final mechanic family:
- tap
- hold
- drag
- spin

### Layer C — Input channel planner
Assign input ownership:
- mouse
- keyboard
- shared

### Layer D — Exclusivity / concurrency guard
Apply strict caps:
- spin is `solo-mouse`
- drag cannot overlap other pointer-heavy mouse mechanics
- opening suppresses drag piles
- keyboard prompts must remain readable

### Layer E — Spatial / path resolver
Resolve:
- layout
- lane assignment
- drag path variant
- spin center anchoring

### Layer F — Runtime scoring / audit
Score and audit:
- tap timing
- hold completion
- drag tracing
- spin rotation quality

## Planner rules by phase

### Opening
- Prefer keyboard/shared tap and hold.
- Avoid drag piles entirely.
- No spin.
- Shared mechanics stay single-channel here.

### Mid-song
- First spin may appear in a break / post-chorus / no-vocal transition.
- Drag appears as highlight events, not spam.
- Keyboard density can rise with difficulty.

### Final chorus / outro handoff
- Second spin appears near the tail of the last chorus after vocals drop.
- Drag remains sparse and readable.

## Phase 1 implementation scope
1. Introduce the new schema fields alongside legacy `type`.
2. Treat `type` as compatibility only.
3. Add normalization helpers that derive:
   - `mechanic`
   - `inputChannel`
   - `proposalMechanic`
   - `proposalInputChannel`
   - `exclusivity`
4. Keep runtime behavior mostly compatible while shifting planner authority toward `mechanic`.
5. Do **not** fully implement spin yet in phase 1; create the schema/path for it.

## Phase 2
- Add keyboard planner by difficulty.
- Add persistent key labels.
- Route shared tap/hold through explicit channel ownership.

## Phase 3
- Add spin event generation, rendering, and scoring.
- Add phrase-based placement logic for the two spin events.
