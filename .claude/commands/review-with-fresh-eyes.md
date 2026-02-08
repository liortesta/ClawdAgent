---
context: fork
---

# Fresh-Eyes Code Review

Spawn a NEW subagent with clean context to review the code changes.
The reviewer MUST NOT see the original implementation discussion — only the final code.

## Process:
1. Identify all changed files (git diff)
2. Spawn a subagent with ONLY the following context:
   - The changed files (final version)
   - The test files (if any)
   - The CLAUDE.md project rules
   - NO conversation history, NO implementation reasoning
3. The reviewer should:
   - Read the code as if seeing it for the first time
   - Check for bugs, logic errors, and edge cases
   - Check for security issues
   - Check for anti-patterns and code smells
   - Rate quality 1-10
   - Try to "break" the code mentally — think of inputs that would cause failures
4. If rating is below 7 — list specific issues that need fixing
5. If rating is 7+ — approve with any minor suggestions

## Why Fresh Eyes?
The developer (or Claude) who wrote the code has anchoring bias — they're mentally
committed to their approach. A fresh reviewer with no context will catch things
the author is blind to.

## Output Format:
```
## Fresh-Eyes Review

**Reviewer Context**: Clean (no implementation history)
**Files Reviewed**: [list]

### Quality Rating: X/10

### Bugs Found
- [bug with file:line reference]

### Security Issues
- [issue with severity]

### Anti-Patterns
- [pattern with suggestion]

### Breaking Scenarios
- [input/scenario that could cause failure]

### Verdict: APPROVE / REQUEST CHANGES
```

$ARGUMENTS
