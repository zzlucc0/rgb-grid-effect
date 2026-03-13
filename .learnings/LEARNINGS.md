## [LRN-20260313-001] correction

**Logged**: 2026-03-13T17:19:00Z
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
User clarified that the desired opening feel is extra post-countdown buffer before action density, not simply downgrading opening holds into drags.

### Details
Recent implementation reduced opening pressure mostly by converting early sustained mechanics, but the user wants a softer startup cadence: after countdown ends, gameplay should still give the player a short settling window before dense input begins. User also reported that mechanic ordering still feels templated, note positions swing too widely left/right with a fixed central bias, and the designed geometry/path-template notes are rarely or never surfacing in play.

### Suggested Action
Add an explicit post-countdown calm window / startup cadence policy, replace deterministic mechanic grouping with a constrained random planner, narrow jump span with locality-biased spawn selection, and audit why non-orbit path templates are not surviving generation/runtime.

### Metadata
- Source: user_feedback
- Related Files: docs/next-design-plan.md, chart-policy.js, game.js, path-templates.js
- Tags: opening-cadence, randomness, spawn-layout, geometry-notes

---
