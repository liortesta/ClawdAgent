# Tech Debt Hunter

Find high-leverage technical debt improvements in the codebase.

## Scan Process:
1. **Code Duplication**: Find duplicated code blocks (>10 lines repeated)
2. **Long Functions**: Find functions >50 lines that should be split
3. **Missing Error Handling**: Find try/catch gaps, unhandled promises, missing null checks
4. **TODO/FIXME/HACK**: Find all tech debt markers with their context
5. **Dead Code**: Find unused exports, unreachable code, unused dependencies
6. **Type Safety**: Find `any` types, type assertions, missing types
7. **Test Gaps**: Find untested critical paths

## Scoring:
For each finding, evaluate:
- **Impact**: How much does fixing this improve the codebase? (1-10)
- **Risk**: How risky is the current state? (1-10)
- **Effort**: How much work to fix? (S/M/L/XL)
- **ROI**: Impact / Effort — higher is better

## Output Format:
```
## Tech Debt Report

### Top 5 High-ROI Improvements

#### 1. [Title] (ROI: X/10)
- **Location**: [file:line]
- **Problem**: [what's wrong]
- **Impact**: X/10 — [why it matters]
- **Risk**: X/10 — [what could go wrong]
- **Effort**: [S/M/L/XL]
- **Fix**: [specific steps to resolve]
- **Verification**: [how to verify the fix]

...

### Summary
- Total tech debt items found: X
- Critical (fix now): X
- Important (fix this sprint): X
- Nice to have (backlog): X
- Estimated total effort: X hours
```

## Rules:
- Focus on TOP 5 highest ROI items — don't overwhelm with every minor issue
- ALWAYS provide specific file:line references
- ALWAYS include verification steps
- Rank by effort-to-impact ratio, not just severity

$ARGUMENTS
