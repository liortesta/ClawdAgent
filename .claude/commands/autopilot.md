---
context: fork
---

# Autopilot Mode — Full Autonomous Execution

Execute a complete task from start to finish with ZERO human intervention.
Claude expands the requirements, plans, builds, tests, and validates — autonomously.

## CRITICAL: Do NOT stop until ALL 6 phases are complete
The Stop hook is active during autopilot. You MUST complete all phases:
EXPAND → PLAN → EXECUTE → TEST → VALIDATE → REPORT
If you feel like stopping early — DON'T. Check which phase you're on and continue.
Only stop after the REPORT phase is fully written.

## Pipeline:

### Phase 1: EXPAND (Understand & Clarify)
- Read the task description carefully
- Identify ambiguities and make reasonable assumptions
- Document ALL assumptions made (for user review later)
- Scan codebase for related existing code
- Define acceptance criteria

### Phase 2: PLAN (Design & Break Down)
- Use CTO agent to evaluate approach
- Use Architect agent to design solution
- Break into tasks with dependencies
- Estimate each task (S/M/L/XL)
- Create execution order

### Phase 3: EXECUTE (Build)
- Work through tasks in order
- For independent tasks: spawn subagents in parallel
- After each file change: PostToolUse hook auto-checks types
- If stuck for >3 attempts on same issue: try alternative approach
- Log every decision and assumption

### Phase 4: TEST (Verify)
- Use QA agent to write and run tests
- Minimum 80% coverage on new code
- Test all edge cases identified in Phase 1
- Run integration tests if applicable

### Phase 5: VALIDATE (Quality Gates)
- Run /self-heal if any tests fail (max 3 cycles)
- Run security-auditor on all changed files
- Run code-reviewer for quality check
- Run build to verify no compilation errors
- Run /prove-it to document proof

### Phase 6: REPORT
Generate a complete autopilot report:
```
## Autopilot Report

### Task
[original task description]

### Assumptions Made
- [assumption 1 — rationale]
- [assumption 2 — rationale]

### What Was Built
- [file:line — description of change]

### Tests Written
- [test file — what it covers]

### Quality Gates
| Gate | Status |
|------|--------|
| Tests | PASS/FAIL |
| Types | PASS/FAIL |
| Security | PASS/FAIL |
| Code Review | X/10 |
| Build | PASS/FAIL |

### Decisions Made
- [decision — why]

### Time Spent
- Planning: ~X min
- Execution: ~X min
- Testing: ~X min
- Validation: ~X min
```

## Guardrails:
- NEVER modify files outside the project scope
- NEVER commit directly — leave changes staged for user review
- NEVER skip tests — if tests can't be written, flag it
- If confidence < 70% on any decision: document it prominently in report
- Max 3 self-heal cycles — if still failing, stop and report
- ALWAYS document assumptions — the user must be able to verify

## When to STOP Autopilot:
- Security-critical decisions (auth, encryption, secrets)
- Destructive operations (delete data, drop tables)
- External service integrations (API keys, webhooks)
- Ambiguity that could lead to >1 hour of wasted work

Build: $ARGUMENTS
