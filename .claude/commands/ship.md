# Pre-Ship Quality Gates

Before merging or deploying, run ALL of the following checks. Every gate must pass.

## Quality Gates:
1. **Tests**: Run full test suite (unit + integration + E2E) — ZERO failures required
2. **Type Check**: Run type checker (tsc --noEmit / mypy / etc.) — ZERO errors required
3. **Lint**: Run linter — ZERO errors required (warnings acceptable)
4. **Security**: Run dependency audit (npm audit / pip audit) — no critical/high vulnerabilities
5. **Build**: Run production build — must complete successfully
6. **Performance**: Run benchmarks if they exist — no regressions beyond 5%
7. **Docs**: Check that README and API docs reflect current changes
8. **Dependencies**: Invoke the dependency-guardian agent — no critical/high vulnerabilities, no unused deps

## Process:
1. Run all checks above in parallel where possible
2. Collect results from all gates
3. Generate a status report

## Output Format:
```
## Ship Readiness Report

| Gate | Status | Details |
|------|--------|---------|
| Tests | PASS/FAIL | X passed, Y failed |
| Types | PASS/FAIL | X errors |
| Lint | PASS/FAIL | X errors, Y warnings |
| Security | PASS/FAIL | X vulnerabilities |
| Build | PASS/FAIL | Build time: Xs |
| Performance | PASS/FAIL/SKIP | Regression: X% |
| Docs | PASS/WARN | Up to date: yes/no |
| Dependencies | PASS/FAIL | X critical, Y outdated, Z unused |

**VERDICT**: READY TO SHIP / BLOCKED (fix X issues)
```

## Rules:
- BLOCK if ANY critical gate fails — do not proceed
- If blocked, list EXACTLY what needs to be fixed
- Do NOT auto-fix issues here — just report. Use /self-heal to fix.

$ARGUMENTS
