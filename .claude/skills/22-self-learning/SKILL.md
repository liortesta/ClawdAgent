# Self-Learning Pattern — Inspired by OpenClaw/Larry

> Autonomous self-improvement through conversation analysis, pattern detection, and knowledge accumulation.

## Overview
This skill implements the OpenClaw self-learning pattern where the agent continuously learns from interactions, records successful patterns, identifies mistakes, and evolves its own capabilities over time. The key insight: the agent doesn't just follow rules — it creates and refines its own rules based on experience.

## The Learning Loop
```
User Interaction → Pattern Detection → Knowledge Update → Better Response
       ↑                                                          │
       └──────────────────────────────────────────────────────────┘
```

## Core Learning Mechanisms

### 1. Mistake Detection & Rule Creation
When something goes wrong:
```
Error/Correction → Root Cause Analysis → New Rule → Store in CLAUDE.md
                                                          │
                                               Hook Creation (if automatable)
```

**Process:**
- Detect when user corrects the agent
- Analyze WHY the mistake happened (not just symptoms)
- Create a specific, actionable rule
- Add to Self-Correction Rules in CLAUDE.md with date
- If pattern is code-related, consider creating a hook to auto-enforce

### 2. Success Pattern Recording
When something works well:
```
Successful Outcome → Pattern Extraction → Store as Success Pattern
                                                     │
                                          Promote to Default Behavior
```

**Record when:**
- A complex task completes without corrections
- User explicitly says "good" or "perfect"
- A pattern is reused successfully 3+ times
- An approach significantly outperforms alternatives

### 3. Conversation Pattern Analysis
After each significant interaction:
```
Conversation → Extract Patterns → Update Knowledge
  - What questions were asked?
  - What tools were most useful?
  - What approach worked?
  - What was the user's communication style?
  - What domain knowledge was needed?
```

### 4. Skill Progressive Disclosure
Not all skills are relevant all the time:
```
User Query → Context Analysis → Relevant Skills Only
  - "build a model" → Show: Architecture, Training, Optimization
  - "deploy to prod" → Show: Infrastructure, MLOps, DevOps
  - "security audit" → Show: Security Testing, OSINT, Network
  - "write a paper" → Show: ML Paper Writing, Evaluation
```

## Knowledge Tiers

### Tier 1: Immediate (always active)
- User preferences (language, style, tools)
- Project conventions (file structure, naming)
- Critical rules (security, auth patterns)

### Tier 2: Session (loaded per conversation)
- Current task context
- Recent errors and their fixes
- Active branch and feature scope

### Tier 3: Background (loaded on demand)
- Skill libraries (Orchestra, Security)
- Historical patterns
- Archived decisions

## Self-Evolution Triggers
| Trigger | Action |
|---------|--------|
| User corrects agent | Add Self-Correction Rule |
| Same mistake 2+ times | Create enforcement hook |
| Successful pattern 3+ times | Promote to default |
| New tool/framework discovered | Add skill file |
| Agent fails at task type | Analyze and enhance agent prompt |

## Implementation Notes
- Use CLAUDE.md sections for persistent learning storage
- Use `.claude/skills/` for domain knowledge
- Use memory/knowledge DB for per-user learning
- Learning is cumulative — never delete learned patterns, only supersede them
- All learned rules should include date and context for traceability
