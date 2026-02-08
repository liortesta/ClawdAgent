# Learn From Mistake

The user is telling you about a mistake you just made. This is a learning opportunity.

## Process:
1. **Acknowledge** the specific mistake — be precise about what went wrong
2. **Explain** WHY it was wrong — root cause, not just symptoms
3. **Propose a rule** to prevent recurrence — specific and actionable
4. **Add the rule** to CLAUDE.md under "Self-Correction Rules (LEARNED)" section with today's date
5. **Check if a hook can enforce it** — if the mistake is about code patterns, consider adding a PostToolUse hook that catches it automatically

## Rule Format in CLAUDE.md:
```
- [DATE] RULE: [specific, actionable rule]
  CONTEXT: [what happened that triggered this rule]
```

## Examples:
- `[2025-01-15] RULE: Always use pnpm, never npm, in this project. CONTEXT: Used npm install which created package-lock.json conflict.`
- `[2025-01-16] RULE: API routes go in src/app/api/, not src/routes/. CONTEXT: Created route in wrong directory, 404 error.`
- `[2025-01-17] RULE: Always run tests before committing, even for "trivial" changes. CONTEXT: One-line fix broke 3 tests.`

## Rules:
- NEVER be defensive — own the mistake
- ALWAYS make the rule specific enough to be actionable
- ALWAYS verify the rule is added to CLAUDE.md before completing

Mistake: $ARGUMENTS
