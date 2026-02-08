---
context: fork
---

# Conductor Workflow — Structured Development Flow

A structured, phase-based development workflow from product vision to deployed feature.
Like a symphony conductor — each instrument plays at the right time.

## Phases:

### Phase 1: CONTEXT (Understanding)
- Read ALL relevant code, docs, and requirements
- Identify existing patterns, utilities, and components to reuse
- Map the dependency graph of affected modules
- List unknowns and assumptions
- Output: Context Document

### Phase 2: SPEC & PLAN (Architecture)
Use CTO + Architect agents:
- Define the feature scope (what's in / what's out)
- Write technical specification:
  - Data model changes
  - API contract (endpoints, request/response)
  - UI components needed
  - Integration points
- Break into development tracks:
  ```
  Track A: Backend (API + DB)
  Track B: Frontend (UI + State)
  Track C: Infrastructure (CI/CD + Config)
  ```
- Define milestones and checkpoints
- Output: Technical Spec + Task Board

### Phase 3: IMPLEMENT (Track-Based)
Execute tracks in parallel where possible:
- **Track A**: Backend
  1. DB migrations / schema changes
  2. Data access layer
  3. Business logic
  4. API endpoints
  5. Backend tests

- **Track B**: Frontend
  1. Component structure
  2. State management
  3. API integration
  4. UI polish
  5. Frontend tests

- **Track C**: Infrastructure
  1. Environment config
  2. CI/CD updates
  3. Monitoring/logging
  4. Documentation

Each track has its own QA checkpoint.

### Phase 4: INTEGRATE (Merge & Test)
- Merge all tracks
- Run integration tests
- Run E2E tests
- Visual verification (/visual-verify)
- Performance check

### Phase 5: VALIDATE (Quality Gates)
- Run /ship to check all quality gates
- Security audit on complete feature
- Code review with fresh eyes
- Documentation is complete

### Phase 6: DELIVER
- Create PR with comprehensive description
- Link to related issues
- Tag reviewers
- Run /wrap-up to update project memory

## Output Format:
```
## Conductor Report — [Feature Name]

### Phase Status
| Phase | Status | Duration |
|-------|--------|----------|
| Context | DONE | ~X min |
| Spec & Plan | DONE | ~X min |
| Track A: Backend | DONE | ~X min |
| Track B: Frontend | DONE | ~X min |
| Track C: Infra | DONE | ~X min |
| Integration | DONE | ~X min |
| Validation | DONE | ~X min |

### Deliverables
- [X] Technical spec
- [X] Implementation (Y files changed)
- [X] Tests (X unit, Y integration, Z E2E)
- [X] Documentation updated
- [X] PR created: #XXX
```

Feature: $ARGUMENTS
