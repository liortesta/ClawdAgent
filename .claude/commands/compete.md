---
context: fork
---

# Competing Solutions

For the given task, create 3 DIFFERENT implementations and pick the best one.

## Process:
1. **Understand** the task requirements
2. **Design** 3 different approaches:
   - Approach A: Optimize for simplicity and readability
   - Approach B: Optimize for performance and efficiency
   - Approach C: Optimize for extensibility and maintainability
3. **Implement** each approach using separate subagents in parallel
4. **Test** each implementation — all must pass the same test suite
5. **Benchmark** (if applicable) — compare performance metrics
6. **Evaluate** using the CTO agent criteria:
   - Correctness (does it work?)
   - Code quality (is it clean?)
   - Performance (is it fast?)
   - Maintainability (can we change it later?)
   - Simplicity (is it easy to understand?)
7. **Pick the winner** — merge winning approach, discard others
8. **Document** why the winner was chosen in CLAUDE.md Architecture Decisions

## Output Format:
```
## Competition Results

| Criteria | Approach A | Approach B | Approach C |
|----------|-----------|-----------|-----------|
| Correctness | PASS/FAIL | PASS/FAIL | PASS/FAIL |
| Lines of Code | X | Y | Z |
| Performance | Xms | Yms | Zms |
| Readability | 1-10 | 1-10 | 1-10 |
| Maintainability | 1-10 | 1-10 | 1-10 |

**WINNER**: Approach [X]
**REASON**: [why this one]
**ADR**: Added to CLAUDE.md
```

## Rules:
- All 3 approaches must pass the SAME tests
- The winner must score highest OVERALL, not just in one category
- If all 3 fail tests, go back to planning — don't pick "least broken"

Task: $ARGUMENTS
