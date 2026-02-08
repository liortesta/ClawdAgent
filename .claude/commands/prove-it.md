# Prove It Works

Before considering this task done, provide concrete proof that everything works.

## Verification Steps:
1. **Tests**: Show the test output — all tests passing with output visible
2. **Type Safety**: Run type checker — zero errors
3. **Before/After**: Compare behavior on main branch vs this branch
4. **Diff Review**: Show the diff is minimal and clean — no unnecessary changes
5. **Security**: Run security audit on changed files using the security-auditor agent
6. **Edge Cases**: Demonstrate at least 3 edge cases are handled correctly

## Output Format:
```
## Proof of Correctness

### Tests
[paste test output]
Status: ALL PASSING / X FAILING

### Type Check
[paste type check output]
Status: CLEAN / X ERRORS

### Diff Summary
- Files changed: X
- Lines added: X
- Lines removed: X
- Unnecessary changes: NONE / [list]

### Security Audit
[security-auditor findings]
Status: CLEAN / X ISSUES

### Edge Cases Verified
1. [edge case]: [result]
2. [edge case]: [result]
3. [edge case]: [result]

### VERDICT: PROVEN / NOT PROVEN
```

## Rules:
- If ANY check fails — fix it immediately, don't ask permission
- Do NOT mark task as done until ALL checks pass
- The diff must be minimal — remove any unrelated changes
- If you can't prove it, say so honestly

$ARGUMENTS
