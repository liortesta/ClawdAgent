# Comprehensive Code Review

Run a 3-agent review on the current changes.

## Process:
1. First, run `git diff` to identify all changed files
2. Spawn 3 subagents IN PARALLEL:
   - **code-reviewer agent**: Review for quality, readability, maintainability, and best practices
   - **security-auditor agent**: Scan for vulnerabilities, OWASP Top 10, secrets exposure
   - **qa-engineer agent**: Verify test coverage, suggest missing tests, check edge cases
3. Collect all findings from the 3 agents
4. Synthesize into a single prioritized report

## Output Format:
```
## Review Summary
**Verdict**: [APPROVE / REQUEST CHANGES / NEEDS DISCUSSION]

### Critical Issues (must fix before merge)
- [issue with file:line reference]

### Security Concerns
- [finding with severity]

### Test Coverage
- [coverage assessment]
- [missing tests]

### Suggestions (non-blocking)
- [improvement ideas]

### Highlights (things done well)
- [positive feedback]
```

## Rules:
- NEVER approve code with critical security issues
- ALWAYS provide specific file:line references
- ALWAYS suggest the fix, not just the problem

$ARGUMENTS
