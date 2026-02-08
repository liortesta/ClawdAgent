---
context: fork
---

# Swarm Mode — Coordinated Agent Team

Launch a coordinated multi-agent team with a shared task board and Leader→Workers pattern.

## Process:

### 1. Task Analysis
- Break the task into independent, parallelizable sub-tasks
- Identify dependencies between sub-tasks
- Assign each sub-task a priority (P0=blocker, P1=critical, P2=normal)

### 2. Team Assembly
Choose the right team pattern:

**Leader→Workers** (default):
- 1 Leader agent (CTO or Architect) coordinates
- 2-5 Worker agents execute in parallel
- Leader reviews all output before merging

**Ensemble** (for review/debugging):
- 3-5 agents work on the SAME problem independently
- Compare results, pick best or synthesize

**Pipeline** (for sequential work):
- Each agent handles one stage, passes output to next
- Stage 1: Design → Stage 2: Implement → Stage 3: Test → Stage 4: Review

### 3. Task Board
Create a shared task board:
```
## SWARM TASK BOARD
| # | Task | Assignee | Status | Branch | Depends On |
|---|------|----------|--------|--------|-----------|
| 1 | ... | agent-1 | pending | feat/task-1 | - |
| 2 | ... | agent-2 | pending | feat/task-2 | - |
| 3 | ... | agent-3 | pending | feat/task-3 | 1,2 |
```

### 4. Execution
- Spawn agents in parallel using subagents or agent teams
- Each agent works in its own git branch (or worktree if available)
- Use @mentions to request help: "@security-auditor review this auth logic"
- Leader monitors progress and resolves conflicts

### 5. Integration
- Leader reviews all completed tasks
- Merge branches in dependency order
- Run /ship to verify everything works together
- Resolve any integration conflicts

## Team Templates:

### Full Stack Feature
```
Leader: CTO
Workers:
  - architect → API design + DB schema
  - dev-backend → API implementation
  - dev-frontend → UI implementation
  - qa-engineer → Tests for all layers
  - security-auditor → Real-time audit
```

### Bug Investigation
```
Pattern: Ensemble (3 investigators)
  - Agent A: Top-down (start from error, trace back)
  - Agent B: Bottom-up (start from data, trace forward)
  - Agent C: Bisect (git bisect to find breaking commit)
  → Compare findings, identify root cause
```

### Major Refactor
```
Leader: Architect
Workers:
  - dev-1 → Refactor module A
  - dev-2 → Refactor module B
  - doc-writer → Update docs in parallel
  - qa-engineer → Update tests in parallel
  → Leader merges and resolves conflicts
```

## TeammateTool Operations (Native Claude Code)
When CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 is enabled, use these NATIVE operations:

### Team Lifecycle
- **spawnTeam**: Create a new team with name and purpose
- **spawn**: Add agent to team with role and task
- **shutdown**: Complete the team's work
- **approveShutdown / rejectShutdown**: Leader approves/rejects team completion

### Communication
- **sendMessage**: Direct message to specific agent (use @mentions)
- **broadcast**: Message all team members
- **checkInbox**: Check for messages from other agents

### Task Management
- **listTasks**: View shared task board
- **updateTask**: Update task status (pending → in_progress → done)

### Discovery
- **discoverTeams**: Find other active teams
- **requestJoin / approveJoin**: Join an existing team

### Directory Structure (auto-created):
```
~/.claude/teams/{team-name}/
├── tasks.json      # Shared task board
├── messages/       # Agent-to-agent messages
└── agents/         # Active agent registry
```

IMPORTANT: Each agent gets its own Git Worktree automatically for isolation.

## Rules:
- Max 5 agents in a swarm (context/cost management)
- Each agent MUST work on separate files when possible
- Leader resolves ALL merge conflicts
- Run /prove-it after swarm completion

Task: $ARGUMENTS
