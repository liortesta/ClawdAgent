# Project Configuration — Claude Code MEGA Setup

> This file is loaded automatically at the start of every Claude Code session.
> It serves as the "constitution" — all agents and commands follow these rules.

## Architecture
- **Language**: [DETECT_ON_SETUP]
- **Framework**: [DETECT_ON_SETUP]
- **Package Manager**: [DETECT_ON_SETUP]
- **Test Framework**: [DETECT_ON_SETUP]
- **Database**: [DETECT_ON_SETUP]
- **Deployment**: [DETECT_ON_SETUP]

## Key Commands
- `[pkg] run dev` — Start dev server
- `[pkg] run build` — Production build
- `[pkg] run test` — Run tests
- `[pkg] run lint` — Lint check
- `[pkg] run type-check` — Type checking

## Code Standards
- TypeScript strict mode when applicable
- No `any` types — use `unknown` or proper typing
- All exports must have JSDoc/docstrings
- Max file length: 300 lines — split if larger
- Prefer composition over inheritance
- Error handling: never swallow errors silently
- All API endpoints must have input validation
- Environment variables: never hardcode secrets
- Use meaningful variable names — no single-letter vars except loop counters

## Workflow Rules
- For ANY task >50 lines of code: Enter Plan Mode FIRST (Shift+Tab)
- For ANY commit: All tests must pass (enforced by Stop hook)
- For ANY architecture decision: Use the CTO agent for evaluation
- For ANY security-related code: Mandatory security-auditor agent review
- After ANY correction from user: Update this file under "Self-Correction Rules"
- Use subagents for parallel work when tasks are independent
- Use background tasks (Ctrl+B) for long-running processes
- Use Playwright MCP for visual/UI verification when available
- ALWAYS "prove it works" before marking any task done

## Background Task Rules
- ALWAYS run dev servers in background
- ALWAYS run watch processes in background
- Run security scans in background while developing
- Use /tasks to monitor running background agents

## Memory Management
- After each session, run /wrap-up to consolidate learnings
- Update this file with key architectural decisions
- Memory priority: Security rules > Architecture > Code style > Preferences
- When Claude makes a mistake and is corrected, add rule to Self-Correction section

## Agent Team Patterns
Use agent teams for large, parallelizable work:

| Scenario | Team Composition | When to Use |
|----------|-----------------|-------------|
| New Feature | architect + qa-engineer + security-auditor + performance-engineer | Multi-file feature development |
| Code Review | security-auditor + performance-engineer + code-reviewer | Before any merge/deploy |
| Debugging | 3-5 agents with different hypotheses (any combination) | Hard-to-find bugs |
| Refactoring | architect + code-reviewer + doc-writer | Major restructuring |
| Data Pipeline | data-scientist + devops-engineer + qa-engineer | Data-intensive features |

## The Ultimate Development Cycle
```
1. PLAN   → Plan Mode + CTO Agent → Design the solution
2. BUILD  → Act Mode + Agents → Build (parallel when possible)
3. TEST   → QA Agent + Background Tasks → Tests run while you review
4. REVIEW → /review-with-fresh-eyes → Clean-context review
5. SHIP   → /ship → All quality gates must pass
6. LEARN  → /wrap-up → Update this file with learnings
```

## The Self-Healing Loop
```
Code Change → PostToolUse Hook (type check on .ts/.tsx)
           → Stop Hook (build verification)
           → Pre-Commit (all tests must pass)
           → If fail: Claude auto-fixes (up to 3 cycles)
           → If still fail: Alert developer
           → After human fix: /learn-mistake → Rule added here
           → Next time: Hook prevents the mistake entirely
```

## Diagnostic & Power Commands
Built-in commands for troubleshooting and monitoring:
- `/doctor` — Health check on Claude Code installation
- `/debug` — Troubleshoot current session issues
- `/stats` — Session statistics (press `r` to cycle 7d/30d/all-time)
- `/compact [instructions]` — Manual context compaction (e.g., `/compact preserve all function signatures`)
- `/teleport` — Transfer session between claude.ai web and local terminal
- `/add-dir <path>` — Add working directories mid-session (monorepo support)
- `/config` — Settings interface with search functionality
- `/tasks` — Monitor running background agents

## Monorepo & Multi-Directory Support
When working across multiple directories:
- Use `claude --add-dir ../other-project` to include additional directories
- CLAUDE.md files from additional directories are loaded automatically (env: `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`)
- Each directory can have its own `.claude/agents/` and `.claude/commands/`

## Session Management
- `/teleport` — Move sessions between claude.ai and terminal (requires same auth)
- Auto-compact triggers at ~85% context capacity (tuned via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`)
- Session memory auto-records and recalls important decisions across sessions
- Use `/compact preserve [topic]` to protect critical context during compaction

## Environment Variables Reference
Key env vars configured in `.claude/settings.json`:
| Variable | Value | Purpose |
|----------|-------|---------|
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | `1` | Enable multi-agent teams |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | `85` | Auto-compact at 85% context |
| `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` | `1` | Load CLAUDE.md from --add-dir dirs |
| `MAX_THINKING_TOKENS` | `32000` | Extended thinking budget |
| `BASH_MAX_TIMEOUT_MS` | `300000` | 5 min max bash timeout |
| `ENABLE_BACKGROUND_TASKS` | `1` | Enable background task functionality |
| `FORCE_AUTO_BACKGROUND_TASKS` | `1` | Auto-background long tasks |

## Swarm Mode Rules
When using /swarm for multi-agent coordination:
- Max 5 agents per swarm (context/cost management)
- Each agent MUST work on separate files to minimize merge conflicts
- Swarm Leader (opus) resolves all conflicts and reviews output
- Use Leader→Workers pattern for features, Ensemble for debugging, Pipeline for data
- Always run /prove-it after swarm completion
- Log swarm decisions in Architecture Decisions Log

## Autopilot Mode Rules
When using /autopilot for autonomous execution:
- Document ALL assumptions — user must be able to verify after
- NEVER commit directly — leave changes staged for review
- Max 3 self-heal cycles — if still failing, stop and report
- Stop autopilot for: security decisions, destructive ops, external integrations
- Confidence < 70% on any decision → document prominently

## Model Routing Rules
Model is set PER AGENT in YAML frontmatter (cannot change mid-session).
Choose the right agent for the task — the model follows:

- **Opus agents** (CTO, Architect, Security, Data Sci, Meta, Swarm Leader, Multi-AI): Complex reasoning, strategic
- **Sonnet agents** (QA, Perf, DevOps, Review, Docs): Routine tasks, volume work
- **Haiku** (model-router): Task classification, quick recommendations

### Escalation Pattern:
If an agent fails 2+ times, switch to a higher-tier agent manually:
1. Try with sonnet agent first
2. If fails → try with opus agent
3. If still fails → stop and report

## Structured Working Memory
Beyond this CLAUDE.md file, use these memory tiers:

### Priority Context (always loaded, <500 chars)
<!-- Critical info that must NEVER be forgotten during this session.
     Keep this extremely short. Auto-pruned items move to Working Memory.
     Example: "Auth uses JWT with RS256. DB is PostgreSQL 16. API prefix: /api/v2" -->

### Working Memory (session notes)
<!-- Temporary notes for the current session. Auto-pruned after 7 days.
     Use <remember> tags to auto-capture important context.
     Example: "Currently refactoring auth module. UserService moved to src/services/" -->

### Success Patterns (learned from successful executions)
<!-- Not just mistakes — record what WORKS well too.
     Example:
     - [DATE] PATTERN: Using barrel exports (index.ts) keeps imports clean
     - [DATE] PATTERN: Writing tests BEFORE implementation catches design issues early -->

## HUD / Statusline
Monitor session status using built-in tools:
- Run `/stats` to see session statistics (press `r` for 7d/30d/all-time)
- Run `/config` to view and change settings
- Use `/rename <name>` to name sessions for easy lookup (e.g., `/rename auth-refactor`)
- Context usage auto-compacts at 85% (configured via CLAUDE_AUTOCOMPACT_PCT_OVERRIDE)

## Session Management Rules
- Name every significant session: `/rename feature-name`
- Use `--from-pr <number>` to resume work on a specific PR
- Use `/teleport` to move sessions between web and terminal
- Link sessions to PRs: mention PR number in session name
- After rate limit: Claude auto-pauses, resumes when limit resets (no context loss)

## Rate Limit Handling
If rate limited during execution:
- Auto-pause and wait for limit reset
- Resume exactly where stopped — no context loss
- For long tasks: use /autopilot which handles interruptions gracefully
- Track usage in /stats to predict rate limit timing

## Self-Evolution System
This setup includes a self-evolution mechanism that continuously improves itself:

### Evolution Agents
- **scout**: Searches GitHub/npm/web for new Claude Code features, MCP servers, and patterns
- **self-improver**: Audits all agents, commands, hooks, and rules for quality and efficiency
- **evolution-engine**: Orchestrates the full evolution cycle (gather → analyze → plan → execute → validate)

### Evolution Commands
- `/evolve` — Quick self-improvement cycle
- `/evolve --full` — Full evolution with external scanning
- `/scout-report` — Search for new tools and patterns (report only)

### Evolution Schedule
- **After every project**: Run `/evolve` to incorporate learned patterns
- **Weekly**: Run `/scout-report` to check for new tools
- **Monthly**: Run `/evolve --full` for comprehensive evolution
- **After major Claude Code update**: Run `/evolve --full` immediately

### Evolution Rules
- All changes are git-committed with "evolution:" prefix
- Security components are NEVER auto-modified
- Reports saved to docs/evolution-reports/ and docs/scout-reports/
- System version tracked in Architecture Decisions Log

## Project Templates
When dropping this template into a new project, configure these sections:

### Quick Setup Checklist
1. Run `bash scripts/bootstrap.sh` (or `scripts/bootstrap.ps1` on Windows)
2. Run `/quickstart` for interactive guided setup
3. OR run `/setup-project` for automatic detection and configuration

### Template Variables (replace on setup)
| Placeholder | Replace With | Example |
|-------------|-------------|---------|
| `[DETECT_ON_SETUP]` | Auto-detected by /setup-project | `TypeScript`, `React`, `pnpm` |
| `[pkg]` | Your package manager | `npm`, `pnpm`, `yarn` |
| `/path/to/allowed/directory` | Your project root path | `/home/user/my-project` |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | Your GitHub PAT | `ghp_xxxxxxxxxxxx` |
| `DATABASE_URL` | Your PostgreSQL connection string | `postgresql://user:pass@localhost/db` |
| `BRAVE_API_KEY` | Your Brave Search API key | `BSA_xxxxxxxxxxxx` |
| `SLACK_BOT_TOKEN` | Your Slack bot token | `xoxb-xxxxxxxxxxxx` |
| `SLACK_TEAM_ID` | Your Slack team/workspace ID | `T01XXXXXXXX` |

### Adapting for Different Stacks
- **Frontend (React/Vue/Svelte)**: Enable Playwright MCP, add /visual-verify to workflow
- **Backend (Node/Python/Go)**: Enable PostgreSQL MCP, focus on /ship security gates
- **Full-Stack**: Enable all MCP servers, use /conductor for track-based parallel dev
- **Data/ML**: Enable data-scientist agent, add Jupyter/notebook conventions
- **Monorepo**: Use `--add-dir` for sub-packages, enable CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD

### Minimal Setup (just the essentials)
If you only want the core features, copy these files:
- `CLAUDE.md` — master rules
- `.claude/settings.json` — hooks + permissions
- `.claude/agents/cto.md` + `architect.md` + `qa-engineer.md` — core agents
- `.claude/commands/plan.md` + `review.md` + `ship.md` — core commands

## Hooks Reference
All hooks configured in `.claude/settings.json`:

| Hook | Event | What It Does |
|------|-------|-------------|
| PreToolUse → Bash | Before shell command | Blocks dangerous commands (rm -rf, DROP, etc.) |
| PreToolUse → Edit/Write | Before file edit | Blocks edits on main/master branch |
| PostToolUse → Write/Edit | After file edit | Auto type-check on .ts/.tsx files |
| Setup | Session start | Checks deps, .env, git branch |
| SubagentStop | Subagent completes | Logs agent ID and transcript path |
| Stop | Before completion | Build verification, blocks on errors |

## Self-Correction Rules (LEARNED)
<!-- Auto-populated. When Claude makes a mistake and the user corrects it,
     the correction is added here to prevent recurrence. Format:
     - [DATE] RULE: description of what to do/not do
     Example:
     - [2025-01-15] RULE: Always use pnpm, never npm, in this project
     - [2025-01-16] RULE: API routes go in src/app/api/, not src/routes/
-->

## Architecture Decisions Log
<!-- ADRs are logged here with date, decision, and rationale. Format:
     ### ADR-001: [Title] ([DATE])
     **Decision**: What was decided
     **Rationale**: Why this was chosen
     **Alternatives considered**: What else was evaluated
-->

## Project Conventions
<!-- Detected or user-specified conventions. Updated as patterns emerge.
     Examples:
     - File naming: kebab-case for files, PascalCase for components
     - Import order: external → internal → types → styles
     - Error format: { success: boolean, data?: T, error?: string }
-->
