---
context: fork
---

# Evolve — Self-Evolution Cycle

Run a complete self-evolution cycle to improve the Claude Code setup.

## Process:

### Quick Evolve (default)
1. Run **self-improver** agent → audit current setup
2. Apply safe improvements (prompt tweaks, rule updates)
3. Report changes

### Full Evolve (with --full flag)
1. Run **scout** agent → search for new tools, patterns, features
2. Run **self-improver** agent → audit current setup
3. Run **evolution-engine** agent → plan and execute evolution
4. Validate all changes
5. Git commit with evolution report

## Usage:
- `/evolve` — Quick self-improvement (5-10 min)
- `/evolve --full` — Full evolution with external scanning (15-30 min)
- `/evolve --scout-only` — Only scan for new tools, don't change anything
- `/evolve --audit-only` — Only audit current setup, don't change anything

## Guardrails:
- ALWAYS git commit current state BEFORE evolving
- NEVER auto-apply changes to security hooks
- NEVER remove agents without logging
- Show diff of all changes before final commit
- Max 10 changes per evolution cycle (keep it manageable)

$ARGUMENTS
