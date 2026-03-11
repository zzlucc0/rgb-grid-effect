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
