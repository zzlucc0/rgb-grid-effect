# RGB Grid Effect — Bar Arranger Design

## Goal

Add a lightweight but explicit **bar / phrase arrangement layer** between analysis-driven chart candidates and the existing playable finalizer.

This layer should solve three recurring problems together:

1. **Opening / local overload** — too many visible or actionable notes in a short window.
2. **No breathing room** — charts keep emitting events continuously with little rest structure.
3. **Low structural variety** — charts feel like repeated rule execution instead of music-shaped arrangement.

The intent is **not** to replace the current chart runtime or finalizer. The intent is to introduce a middle planning layer so `finalizePlayableChartPipeline(...)` can stop acting as arranger + fixer + safety patch all at once.

---

## Current pipeline

```txt
analysis
-> chart.notes
-> normalize / lead-in shift
-> finalizePlayableChartPipeline
-> runtime spawnUntil
```

## Proposed pipeline

```txt
analysis
-> structural note candidates
-> buildBarPlan
-> arrangeBars
-> materializeBarPlan
-> finalizePlayableChartPipeline
-> runtime spawnUntil
```

---

## Design principles

### 1. Analysis is not arrangement
The server / analysis layer should answer:
- where the music is structurally active
- where strong beats / phrase accents happen
- how sections differ (`intro`, `verse`, `chorus`, `bridge`, `outro`)

It should **not** decide the final human input load for each short window.

### 2. Arrangement happens at bar / phrase scale
The new layer decides:
- whether this bar should be active or sparse
- whether this bar should breathe
- what its primary mechanic family should be
- how much player load is allowed in this bar
- how much variation is allowed vs previous bars

### 3. Finalizer remains the safety and landing layer
The existing `finalizePlayableChartPipeline(...)` should continue to do:
- final mechanic landing
- path conflict resolution
- playability safety filters
- geometry cleanup
- final audit

But it should no longer be the first place where full chart structure gets decided.

---

## New intermediate representation

### Structural note candidate
This is a normalized candidate event before arrangement.

```js
{
  time: 12.345,
  laneHint: 1,
  segmentLabel: 'verse',
  phrase: 3,
  groupSlot: 1,
  proposalType: 'tap',
  proposalMechanic: 'tap',
  phraseIntent: 'answer',
  strength: 0.78,
  accentWeight: 0.82,
  sustainEligible: false,
  ornamentEligible: true,
  barIndex: 14,
  beatIndexInBar: 2,
  downbeatBias: 0.3
}
```

### Bar plan
This is the new planning object.

```js
{
  barIndex: 14,
  startTime: 32.0,
  endTime: 33.846,
  segmentLabel: 'verse',
  phraseIndex: 3,
  energyLevel: 'light',      // rest | light | medium | heavy | climax
  densityBudget: 3.2,        // max effective input actions in this bar
  sustainBudget: 1,          // max sustained notes in this bar
  simultaneousCap: 2,        // max same-window pressure
  mechanicFamily: 'hold-anchor',
  variationSeed: 0.4123,
  repetitionPenalty: 0.35,
  cooldownFlags: {
    recentHoldHeavy: false,
    recentDragHeavy: true
  },
  accentPattern: 'strong-1-3',
  restRatio: 0.35,
  handTravelBudget: 1.8,
  readabilityBudget: 2.4,
  targetInputBias: 'mixed'   // keyboard | mouse | mixed | relaxed
}
```

### Arranged chart draft note
After bar planning, a chosen candidate becomes a draft note.

```js
{
  ...candidate,
  arranged: true,
  arrangedFamily: 'hold-anchor',
  arrangedRole: 'primary',   // primary | support | ornament
  arrangedBarEnergy: 'light',
  arrangedCost: 0.9,
  keepReason: 'bar-accent'
}
```

---

## New functions to add in `chart-policy.js`

The smallest integration path is to add these three functions and call them before `finalizePlayableChartPipeline(...)`.

### 1. `buildBarPlan(notes, options = {})`
Input:
- normalized notes
- timing / bpm / downbeat metadata if available

Output:
- array of `barPlan`

Responsibilities:
- infer bar boundaries
- estimate local energy
- assign density / sustain / travel budgets
- assign initial mechanic family and rest ratio

### 2. `arrangeBars(notes, barPlans, options = {})`
Input:
- structural note candidates
- bar plans

Output:
- per-bar chosen candidate sets with arrangement metadata

Responsibilities:
- choose which candidate notes survive in each bar
- enforce breathing bars
- enforce family repetition penalties
- enforce opening low-load rules
- reduce weak-beat overpopulation

### 3. `materializeBarPlan(arrangedBars, options = {})`
Input:
- arranged notes grouped by bar

Output:
- flattened note list for existing finalizer

Responsibilities:
- emit arranged note draft in time order
- convert family / role choices into actual proposal biases
- preserve metadata for finalizer / runtime audit

---

## Integration point in current frontend flow

Current flow in `game.js` inside `prepareRun()`:

```js
normalize time
lead shift
finalizePlayableChartPipeline(...)
layout audit
```

Proposed flow:

```js
normalize time
lead shift
barPlans = ChartPolicy.buildBarPlan(notes, options)
arranged = ChartPolicy.arrangeBars(notes, barPlans, options)
notes = ChartPolicy.materializeBarPlan(arranged, options)
notes = ChartPolicy.finalizePlayableChartPipeline(notes, options)
layout audit
```

This keeps all later runtime behavior intact.

---

## Hard rules for v1

These are the recommended MVP arrangement rules.

### Rule 1 — Opening 8 bars have hard load caps
Opening bars should not become heavy by accident.

Recommended v1:
- bars `0-1`: only `light`
- bars `2-3`: at most `medium`
- bars `0-3`: no `drag-heavy` or `sustain-heavy`
- bars `0-7`: at most one `heavy` bar total
- no back-to-back high-travel bars in the opening

Effect:
- directly reduces unfinishable openers
- reduces first-visual overload

### Rule 2 — Every 2–4 active bars must introduce breathing
Recommended v1:
- after `2-3` non-rest bars, force one `light` or `rest` leaning bar
- after a `heavy` bar, next bar cannot also be `heavy`
- after `drag-heavy` or `hold-heavy`, next bar gets reduced density and sustain budget

Effect:
- creates natural breathing room
- avoids endless constant-output charts

### Rule 3 — Mechanic family repetition cap
Recommended v1:
- same family may repeat at most `2` bars in a row
- third repeated bar must switch family or become a marked variation
- repeated bars increase repetition penalty and reduce ornamental density

Effect:
- charts stop feeling like one template copy-pasted across a section

### Rule 4 — Budget by player cost, not note count
Budget should reflect human input cost.

Suggested per-note base cost:
- `tap`: `1.0`
- `hold`: `1.35`
- `drag`: `1.65`
- `spin`: `2.2`

Add modifiers:
- `+0.25` if large lane jump / high hand travel
- `+0.35` if sustain overlaps with another accent input
- `+0.30` if note occurs inside an already dense sub-window
- `+0.20` if family switch raises read complexity

Per-bar caps should use **sum of costs**, not raw note count.

### Rule 5 — Strong beats first, weak beats optional
Recommended selection order within a bar:
1. downbeat / strong accent notes
2. phrase-shaping support notes
3. ornaments only if budget remains

If over budget, remove in this order:
1. low-strength ornaments
2. redundant weak-beat taps
3. high-travel supports
4. sustain + tap overlaps that create unneeded pressure

Effect:
- preserves musical shape while reducing overload
- stops the chart from responding equally to every beat

### Rule 6 — Randomness at family level, not note level
Randomness should choose **play pattern family**, not just note-by-note type noise.

Recommended families:
- `rest`
- `single-tap-accent`
- `alternating-taps`
- `hold-anchor`
- `drag-sweep`
- `burst-then-rest`
- `sync-accent`
- `cross-lane-call-response`
- `mixed-light`
- `mixed-heavy`

Then randomize inside the family:
- lane offset
- accent emphasis
- sustain length
- end flourish
- left/right bias

Effect:
- produces structured variety instead of chaos

---

## Bar boundary inference

### Preferred source: downbeats
If analysis provides `downbeats`, use them directly to build bars.

### Fallback source: bpm + 4/4 assumption
If no reliable downbeats exist:
- estimate beat length from bpm
- assume 4 beats per bar
- anchor bar zero near first strong note or phrase start

### Optional phrase merge
If a phrase boundary lands inside a quiet bar, the planner may treat `2 bars` as a shared mini-phrase for family continuity.

---

## Energy classification

Each bar needs a rough energy tier.

Suggested features:
- number of candidate beats in bar
- average candidate strength
- segment label prior (`chorus` > `verse` > `outro`)
- phrase position (entry / middle / release)
- vocal / rhythmic density if available from analysis

Suggested initial mapping:
- `rest`: almost no strong candidates or forced breathing bar
- `light`: 1–2 strong accents, high rest ratio
- `medium`: stable activity, readable continuation bar
- `heavy`: high but still capped action density
- `climax`: limited use in strongest chorus / bridge moments only

Important: `heavy` should not mean “fill the bar”. It means “higher-intensity structure under budget”.

---

## Mechanic family assignment

Suggested family priors by segment:

### Intro
- `rest`
- `single-tap-accent`
- `alternating-taps`
- occasionally `hold-anchor` late in intro

### Verse
- `alternating-taps`
- `hold-anchor`
- `mixed-light`
- `cross-lane-call-response`

### Chorus
- `sync-accent`
- `drag-sweep` (sparse highlight, not spam)
- `mixed-heavy`
- `burst-then-rest`

### Bridge
- `hold-anchor`
- `cross-lane-call-response`
- `drag-sweep`
- structured variation family

### Outro
- `rest`
- `single-tap-accent`
- `hold-anchor`
- sparse signature sweep only if release moment supports it

Assignment should also respect:
- previous family repetition penalty
- recent sustain-heavy cooldowns
- opening safety caps
- per-bar hand travel budget

---

## Candidate selection inside each bar

For each bar:
1. gather candidates in `[startTime, endTime)`
2. rank by:
   - accent weight
   - phrase role
   - downbeat proximity
   - arrangement family compatibility
   - novelty score vs previous bars
3. select while budget remains

Pseudo-order:

```txt
choose primary accent(s)
-> choose one structural support if family allows
-> add sustain highlight if family wants it and sustainBudget allows
-> add ornament only if densityBudget + readabilityBudget remain
```

If family is `rest`, either:
- emit nothing
- or emit one very strong accent note only

---

## Suggested cost model

This does not need to be perfect on day one. It needs to be explicit.

```js
function estimateNoteCost(note, context) {
  let cost = 1.0;
  if (note.proposalType === 'hold') cost = 1.35;
  if (note.proposalType === 'drag') cost = 1.65;
  if (note.proposalType === 'spin') cost = 2.2;

  if (context.largeLaneJump) cost += 0.25;
  if (context.overlapsSustainPressure) cost += 0.35;
  if (context.denseSubWindow) cost += 0.30;
  if (context.familySwitchLoad) cost += 0.20;
  return cost;
}
```

Sub-window checks should be done inside each bar for:
- `600ms` pressure
- `1000ms` pressure
- simultaneous visible sustained count

---

## Interaction with existing finalizer

The new arranger should **bias** and **filter** before the finalizer, not replace it.

### What arranger should do
- choose fewer / better notes
- tag bars and notes with arrangement metadata
- enforce breathing and family variety
- set proposal emphasis (`proposalType`, `input bias`, `accent role`)

### What finalizer should still do
- normalize schema
- final mechanic landing
- opening safety
- spin placement safety
- path conflict resolution
- geometry shaping
- final audit

---

## Minimal API sketch for `chart-policy.js`

```js
function buildBarPlan(notes, options = {}) {
  // returns { bars, stats }
}

function arrangeBars(notes, barPlan, options = {}) {
  // returns { bars, arrangedNotes, stats }
}

function materializeBarPlan(arranged, options = {}) {
  // returns final arranged note draft[]
}
```

Expose through API:

```js
const api = {
  ...,
  buildBarPlan,
  arrangeBars,
  materializeBarPlan,
  finalizePlayableChartPipeline,
  ...
}
```

---

## Suggested options for v1

```js
{
  beatsPerBar: 4,
  openingSafeBars: 8,
  breathingMinEveryBars: 3,
  maxFamilyRepeat: 2,
  maxOpeningHeavyBars: 1,
  denseSubWindowMs: 600,
  pressureWindowMs: 1000,
  defaultDensityBudgetByEnergy: {
    rest: 0.8,
    light: 2.4,
    medium: 3.6,
    heavy: 4.8,
    climax: 5.4
  },
  defaultSustainBudgetByEnergy: {
    rest: 0,
    light: 0,
    medium: 1,
    heavy: 1,
    climax: 1
  },
  simultaneousCapByEnergy: {
    rest: 1,
    light: 1,
    medium: 2,
    heavy: 2,
    climax: 2
  }
}
```

These values should be treated as starting points, not final truth.

---

## How this solves the current three problems

### Problem A — Too many notes at start / local overload
Solved by:
- opening bar caps
- explicit density budget
- sustain budget
- simultaneous cap
- strong-beat-first pruning before runtime

### Problem B — No rest / no breathing
Solved by:
- bar energy tiers
- forced breathing cadence
- fatigue / cooldown logic after heavy bars
- `restRatio` as an explicit planner field

### Problem C — Low randomness / repetitive feel
Solved by:
- family-level pattern selection
- repetition penalty
- structured family variation
- randomness operating inside a family instead of raw note noise

---

## Recommended rollout plan

### Phase 1 — Planning data only
- implement `buildBarPlan(...)`
- log / inspect bars in debug HUD or console
- no chart mutation yet

### Phase 2 — Soft filtering
- implement `arrangeBars(...)`
- prune ornaments and overload candidates
- preserve current finalizer as-is

### Phase 3 — Family-driven drafting
- implement `materializeBarPlan(...)`
- start steering proposal types and note roles by family

### Phase 4 — Finalizer shrink
- move structural responsibilities out of `finalizePlayableChartPipeline(...)`
- keep only safety / landing / audit there

---

## Non-goals for v1

Do **not** try to solve everything in the first arranger version.

v1 should **not** aim for:
- perfect phrase theory
- explicit left-hand / right-hand modeling
- advanced meter changes
- style transfer by genre
- runtime adaptive rearrangement

v1 only needs to make the chart feel:
- less overloaded
- more breathable
- less repetitive
- more bar-shaped

That would already be a large improvement.

---

## Final recommendation

The next major change should be:

```txt
Add bar / phrase arrangement before final playable chart pipeline.
```

This is the smallest architectural change that directly addresses the current chart quality ceiling without rewriting the runtime or server analysis stack.
