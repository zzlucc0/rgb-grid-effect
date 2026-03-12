# RGB Grid Effect — Next Design Plan

## Confirmed Direction
- mechanic-mix-policy
  - tap ratio target <= 45%
  - preserve latter-half special mechanics
  - downgrade tree instead of direct collapse to tap
- mouse-load-guard
  - single sustained pointer-heavy action at a time
- approach-visual-policy
  - separate spawnLeadTime from visualApproachDuration
- tutorial-render-policy
  - larger text
  - high-contrast backing plate
  - marker retreat
  - text/mechanic-color separation
- path-template-registry
  - difficulty-tiered geometry drags
  - start with orbit / diamondLoop / starTrace
- dual-input-design
  - keyboard as secondary channel, not full replacement
  - first MVP: drag/ribbon geometry notes may include lightweight keyboard checkpoints

## MVP for Keyboard Integration
1. Keep core mouse play intact.
2. Add optional keyboard checkpoints to a subset of geometry drags.
3. Use only one simple keyboard lane in MVP:
   - default key: Space
4. Rules:
   - no simultaneous second sustained keyboard requirement
   - no keyboard requirement during another incompatible hold
   - tutorial prompt must teach the key explicitly the first few times

## Testing Goals
- startup flow still works
- tap ratio <= 45% on policy sample
- sustained concurrency <= 1 on policy sample
- geometry note metadata valid
- keyboard checkpoint notes render prompt and accept key input
- 8088 deployment still starts and produces notes
