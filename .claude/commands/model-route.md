# Model Router — Agent & Model Recommendation

Analyze the current task and recommend which agent (and therefore which model tier) to use.
Model is set PER AGENT in YAML frontmatter — it cannot change mid-session.

## Agent → Model Mapping:

### Opus Agents ($$$) — Deep Thinking
- **cto** — Strategic decisions, architecture oversight, ADRs
- **architect** — System design, API contracts, DB schemas
- **security-auditor** — OWASP Top 10, CVE scanning, secrets detection
- **data-scientist** — ML pipelines, feature engineering, data validation
- **meta-agent** — Creates new agents on demand
- **swarm-leader** — Coordinates agent teams, manages task boards
- **multi-ai-orchestrator** — Routes tasks, coordinates cross-model workflows

### Sonnet Agents ($$) — Balanced (DEFAULT)
- **qa-engineer** — Tests, edge cases, 90%+ coverage
- **performance-engineer** — Profiling, caching, bundle size
- **devops-engineer** — CI/CD, Docker, K8s, monitoring
- **code-reviewer** — Quality, readability, code smells
- **doc-writer** — README, API docs, Mermaid diagrams

### Haiku Agents ($) — Fast & Cheap
- **model-router** — Task classification, agent recommendation

## Recommendation Logic:
When receiving a task, recommend the appropriate agent:

```
IF task involves security/auth/payments → security-auditor (opus)
IF task involves architecture/design → architect or cto (opus)
IF task failed >2 times → escalate to opus agent
IF task is testing/QA → qa-engineer (sonnet)
IF task is simple fix (<20 lines) → direct edit, no agent needed
IF task is search/navigation → no agent needed (use Glob/Grep)
ELSE → sonnet agent matching the domain
```

## Multi-Agent Orchestration:
For complex tasks, use multiple agents in sequence:
1. **model-router** (haiku): Classify task, recommend agents
2. **Sonnet agent**: Implement the solution
3. **Opus agent**: Review the implementation (if critical)

## Output:
```
TASK: [description]
CLASSIFICATION: [category]
RECOMMENDED AGENT: [agent name]
MODEL TIER: [opus/sonnet/haiku]
REASON: [why this agent]
ALTERNATIVE: [backup agent if first fails]
```

## Rules:
- ALWAYS default to Sonnet agents unless clear reason for Opus
- NEVER skip security-auditor (opus) for security-related tasks
- If agent fails 2+ times → recommend next-tier agent manually
- Track agent usage in /stats for cost optimization

Evaluate: $ARGUMENTS
