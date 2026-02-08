# Strategic Planning

Before writing ANY code, create a detailed plan with multi-agent input.

## Process:
1. **Understand**: Read the requirement carefully. Ask clarifying questions if anything is ambiguous.
2. **CTO Review**: Use the CTO agent to evaluate the overall approach — is this the right direction?
3. **Architecture Design**: Use the architect agent to design the solution — modules, interfaces, data model
4. **Break Down**: Split into tasks with clear dependencies
5. **Estimate Complexity**: Rate each task (S/M/L/XL)
6. **Risk Assessment**: Identify risks and mitigation strategies
7. **Present Plan**: Show the complete plan for user approval

## Plan Template:
```
## Plan: [Feature/Task Name]

### Goal
[1-2 sentences: what we're building and why]

### Approach
[CTO-approved approach with rationale]

### Architecture
[Architect-designed structure]

### Tasks
| # | Task | Size | Depends On | Files |
|---|------|------|-----------|-------|
| 1 | ... | S | - | file1.ts |
| 2 | ... | M | 1 | file2.ts, file3.ts |

### Risks
- [Risk 1]: [Mitigation]
- [Risk 2]: [Mitigation]

### Verification
- [ ] [How to verify task 1]
- [ ] [How to verify task 2]
- [ ] [Final integration test]
```

## Rules:
- NEVER start coding before the plan is approved
- ALWAYS get CTO input for tasks touching >5 files
- ALWAYS include verification steps — "how do we know it works?"

$ARGUMENTS
