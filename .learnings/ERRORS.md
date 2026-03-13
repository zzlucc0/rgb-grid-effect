## [ERR-20260311-001] bulk-replace-helper-recursion

**Logged**: 2026-03-11T16:38:00Z
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
A broad text replacement pass accidentally rewrote newly-added helper method bodies into self-recursive calls.

### Error
```text
isPausedPhase() { return this.isPausedPhase(); }
isRunningPhase() { return this.isRunningPhase(); }
isStartingPhase() { return this.isStartingPhase(); }
```

### Context
- Operation attempted: batch string replacement in `game.js`
- Goal: replace repeated `gameState` comparisons with helper methods
- Failure mode: replacement also matched the helper definitions themselves

### Suggested Fix
When introducing helpers and then bulk-replacing usages, protect helper definitions first or use AST/scope-aware refactors instead of global string replacement.

### Metadata
- Reproducible: yes
- Related Files: game.js

### Resolution
- **Resolved**: 2026-03-11T16:39:00Z
- **Commit/PR**: pending current commit
- **Notes**: Restored helper bodies and will avoid blind global replacements for method introduction refactors.

---

## [ERR-20260313-001] vitest-playwright-spec-collection

**Logged**: 2026-03-13T04:35:00Z
**Priority**: medium
**Status**: pending
**Area**: tests

### Summary
`npm test` runs unit tests successfully but then fails because Vitest also collects Playwright e2e spec files under `tests-e2e/`.

### Error
```text
Error: Playwright Test did not expect test() to be called here.
```

### Context
- Operation attempted: `npm test`
- Environment: `/mnt/data/projects/rgb-grid-effect`
- Unit suites passed; failure came from `tests-e2e/youtube-chart.spec.js` and `tests-e2e/youtube-chart-8088.spec.js`

### Suggested Fix
Exclude `tests-e2e/**` from Vitest (or rename/move Playwright specs so unit-test discovery does not import them).

### Metadata
- Reproducible: yes
- Related Files: package.json, playwright.config.js, tests-e2e/youtube-chart.spec.js, tests-e2e/youtube-chart-8088.spec.js

---
