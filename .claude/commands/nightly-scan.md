---
context: fork
---

# Nightly Quality Scan

Run a comprehensive project health check and generate a quality report.

## Scan Categories:

### 1. Dependencies
- **Invoke the dependency-guardian agent** to run a full dependency health check
- The agent will: run security audit, check freshness, find unused deps, check licenses
- Include the dependency-guardian's report in the Dependencies section of the quality report

### 2. Code Quality
- Dead code detection (unused exports, unreachable code)
- Unused imports
- Code complexity metrics (cyclomatic complexity)
- File size violations (>300 lines)

### 3. Type Safety
- Type coverage percentage
- Count of `any` types
- Missing return types on exported functions

### 4. Test Health
- Test coverage percentage (if coverage tool configured)
- Flaky test detection (tests that sometimes fail)
- Slow tests (>5 seconds)
- Missing test files for source files

### 5. Security
- SAST scan on all source files
- Secrets detection (API keys, passwords, tokens)
- Dependency vulnerabilities

### 6. Performance
- Bundle size analysis (if applicable)
- Performance regression check (if benchmarks exist)
- Large file detection (>1MB in repo)

## Output Format:
Generate a report as markdown:

```
## Quality Report — [DATE]

### Overall Health: [A/B/C/D/F]

| Category | Score | Status | Key Finding |
|----------|-------|--------|-------------|
| Dependencies | X/10 | OK/WARN/FAIL | ... |
| Code Quality | X/10 | OK/WARN/FAIL | ... |
| Type Safety | X/10 | OK/WARN/FAIL | ... |
| Tests | X/10 | OK/WARN/FAIL | ... |
| Security | X/10 | OK/WARN/FAIL | ... |
| Performance | X/10 | OK/WARN/FAIL | ... |

### Action Items (ordered by priority)
1. [CRITICAL] ...
2. [HIGH] ...
3. [MEDIUM] ...

### Trends (vs previous scan)
- [improved/degraded/stable] ...
```

## Rules:
- Save report to docs/quality-reports/[YYYY-MM-DD].md
- Compare with previous report if it exists
- Flag any category that dropped below 7/10

$ARGUMENTS
