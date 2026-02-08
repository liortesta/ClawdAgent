---
context: fork
---

# Self-Healing Mode

Run a complete diagnostic and automatic fix cycle.

## Process:
1. **Diagnose** — Run ALL checks and collect ALL failures:
   - Run full test suite → collect failures
   - Run type checker → collect errors
   - Run linter → collect warnings/errors
   - Run build → collect errors

2. **Categorize** — Group issues by type:
   - Type errors
   - Test failures
   - Lint errors
   - Build errors
   - Runtime errors

3. **Fix** — For each category, spawn a subagent to fix issues in parallel:
   - One agent fixes type errors
   - One agent fixes test failures
   - One agent fixes lint issues
   - Coordinate to avoid conflicts

4. **Verify** — After all fixes, run the full diagnostic again

5. **Repeat** — If issues remain, repeat (max 3 cycles)

6. **Report** — Final status report

## Output Format:
```
## Self-Heal Report

### Cycle 1
- Found: X type errors, Y test failures, Z lint errors
- Fixed: A type errors, B test failures, C lint errors
- Remaining: ...

### Cycle 2 (if needed)
- ...

### Final Status
- ALL CLEAR / X issues remain (need manual intervention)
- Total fixes applied: N
- Files modified: [list]
```

## Rules:
- Max 3 cycles — if still broken after 3 cycles, stop and report to user
- NEVER change test expectations to make tests pass — fix the code instead
- ALWAYS verify each fix doesn't introduce new issues
- ALWAYS show what was changed

$ARGUMENTS
