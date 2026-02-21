<div align="center">

# ClawdAgent

### The Autonomous AI Octopus

**28,500+ lines of TypeScript. 51 core modules. 18 agents. 29 tools. 74 skills. 5 platforms. 3 protocols. 1 brain.**

An open-source autonomous AI agent that thinks, learns, evolves, and never stops.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Claude](https://img.shields.io/badge/AI-Claude%204-purple.svg)](https://anthropic.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Quick Start](#-quick-start) | [Features](#-features) | [Architecture](#-architecture) | [Docs](#-documentation) | [Contributing](#-contributing)

</div>

---

## What is ClawdAgent?

ClawdAgent is a **fully autonomous AI agent system** that runs 24/7 across multiple platforms. It doesn't just respond to commands — it **thinks proactively**, **learns from interactions**, **evolves its own capabilities**, and **manages complex multi-step workflows** autonomously.

Think of it as your personal AI operations center: it manages your servers, writes your code, creates content, trades crypto, automates your phone, monitors your systems — all while learning and getting smarter over time.

```
You: "Check my servers, fix anything broken, and send me a summary on Telegram"
ClawdAgent: ✅ SSH'd into 3 servers → found nginx down on VPS2 → restarted it
            → checked SSL certs (2 expiring soon) → renewed them
            → sent you a full report on Telegram with recommendations
```

---

## Why ClawdAgent?

| Feature | AutoGPT | CrewAI | LangChain | **ClawdAgent** |
|---------|---------|--------|-----------|----------------|
| Persistent Memory | Limited | No | Via plugins | **PostgreSQL + Redis + Memory Hierarchy** |
| Self-Evolution | No | No | No | **Evolution Engine + Self-Repair + Auto-Learn** |
| Proactive Thinking | No | No | No | **Thinks autonomously, spots problems** |
| Multi-Platform Chat | No | No | No | **Telegram + Discord + WhatsApp + Web** |
| Server Management | No | No | No | **SSH + Docker + Health Monitoring** |
| Web Dashboard | Basic | No | Via LangSmith | **Full React Dashboard** |
| Security Hardening | Basic | Basic | Basic | **Defense-in-Depth (12 layers)** |
| Browser Automation | Via plugins | No | Via plugins | **Built-in Playwright (headless)** |
| Content Creation | No | No | No | **AI Video/Image/Music + 9 social platforms** |
| Dynamic Tool Creation | No | No | No | **Creates new tools at runtime** |
| Cost Intelligence | No | No | Via callbacks | **ROI tracking + budget forecasting** |
| Governance Engine | No | No | No | **Risk budgets + autonomy levels** |
| Safety Simulator | No | No | No | **Dry-run testing + impact assessment** |
| Intelligence Bridge | No | No | No | **9 interconnected subsystems** |
| Multi-Agent Teams | No | Yes | No | **Crew Orchestrator + Meta Agent** |
| A2A Protocol | No | No | No | **Full: Agent Card + Tasks + SSE** |
| ACP Protocol | No | No | No | **Full: Runs + Agent Descriptor** |
| MCP Protocol | No | No | No | **Deep: 9 servers, JSON-RPC 2.0** |

---

## Features

### Core Intelligence — 51 Modules
- **Multi-Model AI** — Claude (Anthropic), 400+ models via OpenRouter, local Ollama models
- **Smart Model Router** — Picks the best model per task (complexity, cost, budget)
- **Extended Thinking** — Up to 32K thinking tokens for complex reasoning
- **Streaming Responses** — Real-time token streaming across all platforms
- **Intent Classification** — 45+ intents with multilingual support (Hebrew, Arabic, CJK)
- **Intelligence Bridge** — Central nervous system connecting 9 subsystems (scoring, memory, governance, cost, routing, observability, goals, safety, feedback)
- **Governance Engine** — Risk categorization, autonomy levels, cost/risk budgets, execution approval workflows
- **Safety Simulator** — Dry-run testing of commands before execution, impact assessment, rollback planning
- **Proactive Thinker** — Agent thinks autonomously: spots problems, finds opportunities, sends alerts
- **Behavior Engine** — Multi-language personality variants, adaptive interaction styles

### Agent System — 18 Specialized Agents
| Agent | Purpose |
|-------|---------|
| General Assistant | Chat, help, daily tasks |
| Server Manager | SSH, Docker, monitoring, auto-fix |
| Code Assistant | Write, review, debug code. GitHub PRs |
| Researcher | Web search, summarize, deep analysis |
| Task Planner | Tasks, reminders, cron, workflows |
| Security Guard | Command review, threat detection |
| Desktop Controller | AI vision + mouse/keyboard control |
| Project Builder | Scaffold and build full-stack apps |
| Web Agent | Browser automation, form filling, scraping |
| Content Creator | AI images/video/music generation |
| Orchestrator | Multi-system coordination |
| Device Controller | Android phone automation |
| Crypto Trader | Live/paper trading with strategies |
| Crypto Analyst | Market analysis and signals |
| Market Maker | Automated market making |
| Strategy Lab | Backtest and optimize strategies |
| AI App Builder | Build and deploy AI applications |
| MRR Strategist | SaaS revenue optimization |

### Tool Ecosystem — 29 Integrated Tools
`bash` `file` `search` `github` `task` `db` `browser` `kie` `social` `openclaw` `cron` `memory` `auto` `email` `workflow` `analytics` `claude-code` `device` `elevenlabs` `firecrawl` `rapidapi` `apify` `ssh` `trading` `rag` `whatsapp` `tikvid` `workflow` `auto-tool`

### Memory & Learning — 11 Repositories
- **PostgreSQL** — Persistent storage for conversations, knowledge, tasks, users, servers
- **Redis** — Caching layer + BullMQ job queues (4 job types, 5 parallel, 20 queue max)
- **Memory Hierarchy** — Multi-tier memory with automatic promotion/demotion
- **SHA-256 Integrity** — Every memory entry checksummed; tampered entries quarantined
- **Auto-Learning** — Learns facts, preferences, and patterns from conversations
- **Hybrid Search** — Semantic (vector embeddings) + keyword search combined
- **RAG Engine** — Retrieval-augmented generation for document Q&A
- **Heartbeat System** — 9 alert types: server down, overdue tasks, morning briefing, evening summary, self-repair alerts, proactive tips, goal updates

### Security — 12-Layer Defense in Depth
- **Content Guard** — 20+ regex patterns blocking prompt injection before storage
- **Social Engineering Detection** — 15 patterns detecting manipulation attempts
- **Memory Integrity** — SHA-256 checksums, tampered entries quarantined and deleted
- **Tamper-Evident Audit Chain** — Hash chain on all operations, persisted to disk
- **Command Guard** — Blocks dangerous shell commands + bash sandbox
- **RBAC** — Role-based access control with per-user permissions
- **JWT Authentication** — Secure web dashboard access
- **Rate Limiting** — Per-endpoint and per-user limits
- **Encryption at Rest** — Sensitive data encrypted with key management
- **Key Rotation** — Automatic key rotation with configurable intervals
- **Kill Switch** — Emergency stop for runaway agents (records cost + failure data)
- **Approval Gate** — Human-in-the-loop for critical/irreversible actions (trading, social posting)

### Communication Platforms — 5 Interfaces
- **Telegram** — Full bot with keyboards, media, voice, inline queries
- **Discord** — Bot with slash commands, embeds, reactions
- **WhatsApp** — WhatsApp Web integration with QR pairing
- **Web Dashboard** — React app with real-time WebSocket (Dashboard, Chat, Agents, Tasks, Cron, Servers, Trading, Skills, Knowledge, Intelligence, Graph, Logs, Costs, Settings, History, OpenClaw)
- **Agent Protocols** — A2A + ACP for agent-to-agent communication

### Self-Evolution — The Agent That Improves Itself
- **Evolution Engine** — Autonomous capability improvement cycles
- **Self-Repair** — 9 known fix patterns + AI-powered diagnosis
- **Capability Learner** — Discovers and acquires new capabilities from the web
- **Skill Engine** — 74 pre-loaded skills, dynamically extensible at runtime
- **Dynamic Tool Creation** — Creates new tools at runtime based on needs
- **Feedback Loop** — Pattern recognition, prompt optimization, agent merge candidates
- **Agent Factory** — Spawns new specialized agents on demand (Meta Agent)
- **Crew Orchestrator** — Multi-agent teams that collaborate on complex tasks
- **Autonomous Goal Engine** — Self-initiated 30/60/90-day goals with KPIs and milestones
- **Auto-Upgrade** — Checks for and applies skill/prompt/config upgrades automatically

### Advanced Capabilities
- **Browser Automation** — Headless Playwright (works on servers without GUI)
- **Server Management** — Multi-server SSH, Docker ops, health monitoring, auto-discovery
- **Desktop Control** — AI vision + mouse/keyboard automation with safety bounds
- **Mobile Automation** — Android via ADB/Appium with pre-built app recipes
- **Crypto Trading** — 5 built-in strategies (DCA, Scalping, Swing, Day Trading, Custom) + full TA engine, risk manager, portfolio tracker
- **Content Creation** — AI video, images, music via Kie.ai (60+ models)
- **Social Publishing** — 9 platforms via Blotato (Twitter, Instagram, TikTok, LinkedIn, YouTube, Facebook, Threads, BlueSky, Pinterest)
- **Email** — Gmail API + SMTP dual integration
- **Voice** — Text-to-Speech + Speech-to-Text via ElevenLabs
- **Calendar** — Google Calendar integration
- **Plugin System** — Manifest-based extensibility (tools, behaviors, prompts, config)
- **MCP Support** — Model Context Protocol for external tools (9 servers)
- **YAML Config** — Hot-reloadable configuration with 11+ feature toggles

### Observability & Cost Intelligence
- **Timeline Events** — 9+ event types tracking every agent action, tool call, and evolution step
- **Tool Heatmaps** — Hourly usage patterns and success rates per tool
- **Error Clustering** — Automatic error categorization and severity tracking
- **Cost Tracker** — Per-model, per-action cost tracking with daily budgets
- **ROI Analysis** — Agent return-on-investment per task type
- **Budget Forecasting** — Token burn prediction and smart provider routing
- **System Snapshots** — Dashboard data snapshots for trend analysis

### Agent Interoperability Protocols

ClawdAgent speaks the industry-standard agent protocols, enabling seamless communication with any compliant AI agent:

| Protocol | Standard | Status | Endpoints |
|----------|----------|--------|-----------|
| **MCP** (Model Context Protocol) | Anthropic | Deep integration | 9 MCP servers, JSON-RPC 2.0 |
| **A2A** (Agent-to-Agent) | Google / Linux Foundation | Full support | Agent Card, Tasks, SSE streaming |
| **ACP** (Agent Communication Protocol) | IBM BeeAI / Linux Foundation | Full support | REST runs, agent descriptor |
| **Tool Use** | Anthropic Claude | Native | 29 integrated tools |

#### A2A Endpoints
```
GET  /.well-known/agent.json       — Public Agent Card (no auth)
POST /a2a                          — JSON-RPC 2.0 (tasks/send, tasks/get, tasks/cancel)
POST /a2a/stream                   — SSE streaming (real-time task updates)
GET  /a2a/tasks/:id                — Get task status
GET  /a2a/tasks/:id/subscribe      — SSE subscribe to task events
POST /a2a/tasks/:id/cancel         — Cancel running task
```

#### ACP Endpoints
```
GET  /acp/agent                    — Agent descriptor
POST /acp/runs                     — Create run (start processing)
GET  /acp/runs/:id                 — Get run status
POST /acp/runs/:id/input           — Continue conversation
POST /acp/runs/:id/cancel          — Cancel run
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+ (optional — works without it, queues disabled)
- pnpm 8+

### Setup

```bash
# 1. Clone
git clone https://github.com/liortesta/ClawdAgent.git
cd clawdagent

# 2. Install dependencies
pnpm install

# 3. Configure
cp .env.example .env
# Edit .env — at minimum set: ANTHROPIC_API_KEY, DATABASE_URL

# 4. Start database (using Docker)
docker compose up -d postgres redis

# 5. Run migrations
pnpm db:migrate

# 6. Start
pnpm dev
```

Open `http://localhost:3000` to see the dashboard.

### Minimal Setup (just AI chat)

Only need an API key and PostgreSQL:
```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
DATABASE_URL=postgresql://user:pass@localhost:5432/clawdagent
```

### Docker (Full Stack)

```bash
docker compose up -d
```

This starts ClawdAgent + PostgreSQL + Redis in one command.

---

## Architecture

```
  ┌─ EXTERNAL WORLD ──────────────────────────────────────────────────────────────┐
  │                                                                               │
  │   👤 Users              🤖 AI Agents              🌐 Platforms                │
  │   (Telegram, Discord,   (A2A, ACP, MCP            (GitHub, Kie.ai,            │
  │    WhatsApp, Web)        compatible)                Binance, Gmail...)         │
  │                                                                               │
  └───────────┬──────────────────┬──────────────────────┬─────────────────────────┘
              │                  │                      │
              ▼                  ▼                      ▼
  ╔═══════════════════════════════════════════════════════════════════════════════╗
  ║  PROTOCOL GATEWAY                                                           ║
  ║  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   ║
  ║  │ Telegram │ │ Discord  │ │ WhatsApp │ │ Web/REST │ │ A2A · ACP · MCP  │   ║
  ║  │   Bot    │ │   Bot    │ │  Bridge  │ │ + WebSoc │ │ Agent Protocols  │   ║
  ║  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘   ║
  ╚═══════╪════════════╪════════════╪════════════╪════════════════╪═════════════╝
          └────────────┴────────────┴─────┬──────┴────────────────┘
                                          │
  ╔═ SECURITY PERIMETER ══════════════════╪═══════════════════════════════════════╗
  ║  Content Guard → Rate Limit → JWT Auth → RBAC → Command Guard → Audit Chain ║
  ╚═══════════════════════════════════════╪═══════════════════════════════════════╝
                                          │
                                          ▼
  ┌───────────────────────────────────────────────────────────────────────────────┐
  │                           🧠 BRAIN (Core Engine)                             │
  │                                                                               │
  │   ┌────────────┐  ┌──────────────┐  ┌────────────────┐  ┌───────────────┐    │
  │   │  Intent    │  │ Model Router │  │ Context Builder │  │  Approval     │    │
  │   │  Router    │→ │ (cost-smart) │→ │ (history+RAG)  │→ │  Gate         │    │
  │   │  (45+      │  │ Claude/OR/   │  │                │  │  (human-in-   │    │
  │   │  intents)  │  │ Ollama       │  │                │  │   the-loop)   │    │
  │   └────────────┘  └──────────────┘  └────────────────┘  └───────────────┘    │
  │                                                                               │
  │   ┌─────────────────────────────────────────────────────────────────────┐     │
  │   │                    18 SPECIALIZED AGENTS                            │     │
  │   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐  │     │
  │   │  │ Server  │ │  Code   │ │   Web   │ │ Content  │ │  Crypto    │  │     │
  │   │  │ Manager │ │ Assist  │ │  Agent  │ │ Creator  │ │  Trader    │  │     │
  │   │  └─────────┘ └─────────┘ └─────────┘ └──────────┘ └────────────┘  │     │
  │   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐  │     │
  │   │  │Research │ │  Task   │ │ Desktop │ │ Project  │ │ Orchestr-  │  │     │
  │   │  │   er    │ │ Planner │ │ Control │ │ Builder  │ │   ator     │  │     │
  │   │  └─────────┘ └─────────┘ └─────────┘ └──────────┘ └────────────┘  │     │
  │   │  + Security Guard · Device Controller · Crypto Analyst             │     │
  │   │  + Market Maker · Strategy Lab · AI App Builder · MRR Strategist   │     │
  │   └─────────────────────────────────┬───────────────────────────────────┘     │
  │                                     │                                         │
  │   ┌─────────────────────────────────┴───────────────────────────────────┐     │
  │   │                      29 INTEGRATED TOOLS                            │     │
  │   │  bash · file · ssh · browser · github · db · cron · email · rag    │     │
  │   │  search · trading · kie · social · elevenlabs · firecrawl · apify  │     │
  │   │  rapidapi · device · memory · workflow · analytics · claude-code   │     │
  │   │  whatsapp · openclaw · docker · auto · tikvid · auto-tool          │     │
  │   └─────────────────────────────────────────────────────────────────────┘     │
  │                                                                               │
  │   ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐   │
  │   │ 🧬 Meta Agent       │  │ 👥 Crew Orchestrator │  │ ⚡ Skills Engine │   │
  │   │ (spawns new agents)  │  │ (multi-agent teams)  │  │ (74 skills)      │   │
  │   └──────────────────────┘  └──────────────────────┘  └──────────────────┘   │
  └──────────────────────────────────┬────────────────────────────────────────────┘
                                     │
          ┌──────────────────────────┼────────────────────────────┐
          │                          │                            │
          ▼                          ▼                            ▼
  ┌───────────────┐        ┌─────────────────┐        ┌──────────────────────┐
  │ 💾 MEMORY     │        │ 🔄 EVOLUTION    │        │ 🤖 AI PROVIDERS      │
  │               │        │                 │        │                      │
  │ PostgreSQL    │        │ Self-Evolution  │───┐    │ Claude (Anthropic)   │
  │ Redis Cache   │        │ Self-Repair     │   │    │ OpenRouter (400+)    │
  │ Memory        │        │ Proactive       │   │    │ Ollama (local)       │
  │  Hierarchy    │        │  Thinker        │   │    │                      │
  │ RAG/Vector    │        │ Intelligence    │   │    │ Smart Routing:       │
  │ SHA-256       │        │  Bridge         │   │    │ complexity → model   │
  │  Integrity    │        │ Tool Creator    │   │    │ cost → provider      │
  │               │        │ Auto-Learn      │   │    │ budget → tier        │
  └───────────────┘        └────────┬────────┘   │    └──────────────────────┘
                                    │            │
                                    └────────────┘
                                   ↻ Self-Improvement Loop
                                   (learns → evolves → repeats)
```

### Directory Structure

```
src/
  index.ts              — Entry point
  config.ts             — Zod-validated environment config
  core/                 — Engine, AI client, memory, evolution (51 modules)
  agents/
    prompts/            — 18 agent system prompts
    tools/              — 29 tool implementations
  interfaces/
    telegram/           — Telegram bot
    discord/            — Discord bot
    whatsapp/           — WhatsApp Web integration
    web/                — Express + React dashboard (17 API routes)
  security/             — Content guard, audit, RBAC, encryption
  memory/               — Database schema, repositories, migrations
  queue/                — BullMQ worker, scheduler, jobs
  actions/              — Browser, SSH, desktop, calendar, phone
  services/             — SSH tunnel, OpenClaw sync

web/                    — React dashboard (Vite + Tailwind, 16 pages)
config/                 — YAML configurations
plugins/                — Plugin directory
```

---

## Web Dashboard

The web dashboard provides full control over ClawdAgent:

| Page | Description |
|------|-------------|
| **Dashboard** | System overview, stats, quick actions, activity feed |
| **Chat** | Real-time AI chat with WebSocket streaming |
| **Agents** | View and manage all 18 agents + agent stats |
| **Tasks** | Create and track tasks with status |
| **Cron** | Schedule recurring jobs with cron expressions |
| **Servers** | SSH server management + health monitoring |
| **Trading** | Crypto trading interface + portfolio |
| **Skills** | Browse 74+ skills, search and filter |
| **Knowledge** | Knowledge base explorer + memory search |
| **Intelligence** | Intelligence subsystem visualization + metrics |
| **Graph** | System relationship graph visualization |
| **History** | Conversation history browser |
| **Logs** | System logs viewer with filtering |
| **Costs** | API cost tracking + budget visualization |
| **OpenClaw** | OpenClaw integration management |
| **Settings** | Full configuration UI + model selector |

---

## Environment Variables

See [`.env.example`](.env.example) for the complete list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `REDIS_URL` | No | Redis (queues disabled without it) |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot |
| `DISCORD_BOT_TOKEN` | No | Discord bot |
| `OPENROUTER_API_KEY` | No | 400+ models including free ones |
| `GITHUB_TOKEN` | No | GitHub PRs, issues |
| `KIE_AI_API_KEY` | No | AI content generation |
| `BRAVE_API_KEY` | No | Web search |

---

## Security

ClawdAgent implements **Zero Trust AI Architecture** — no component trusts another:

1. **Input** → Content Guard sanitizes all input (20+ injection patterns)
2. **Processing** → Social engineering detection (15 patterns, auto-block on high severity)
3. **Memory** → SHA-256 checksum on store, verify on retrieve, quarantine on tamper
4. **Audit** → Tamper-evident hash chain on every operation
5. **Execution** → Command guard + bounded concurrency (5 parallel, 20 queue max)
6. **Output** → Response filtering + rate limiting
7. **Access** → JWT + RBAC + per-user permissions
8. **Recovery** → Self-repair + kill switch + approval gate

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## Deployment

### Docker (Recommended)

```bash
docker compose up -d
```

### Manual (VPS/Cloud)

```bash
# Build
pnpm build

# Start with PM2
pm2 start dist/index.js --name clawdagent
pm2 save
```

### Requirements for Production
- Set `NODE_ENV=production`
- Use strong `JWT_SECRET` and `ENCRYPTION_KEY` (32+ characters)
- Set up PostgreSQL with proper credentials
- Configure Redis for full queue support
- Set `CRON_TIMEZONE` to your timezone

---

## Documentation

- [Contributing Guide](CONTRIBUTING.md) — How to contribute
- [Security Policy](SECURITY.md) — Vulnerability reporting
- [Environment Variables](.env.example) — Full configuration reference
- [License](LICENSE) — Apache 2.0

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 18+, TypeScript 5.9 |
| **AI** | Claude (Anthropic), OpenRouter (400+), Ollama (local) |
| **Database** | PostgreSQL 15+, Drizzle ORM |
| **Cache/Queue** | Redis 7+, BullMQ |
| **Web** | Express 5, React, Vite, Tailwind CSS |
| **Automation** | Playwright, ADB/Appium |
| **Communication** | grammy (Telegram), discord.js, whatsapp-web.js |
| **Security** | Helmet, bcrypt, JWT, Zod validation |
| **DevOps** | Docker, PM2, GitHub Actions |

---

## Roadmap

### Near Term
- [ ] Slack integration
- [ ] Matrix/Element support
- [ ] Plugin marketplace
- [ ] Visual workflow builder (drag-and-drop)
- [ ] Mobile companion app (React Native)

### Medium Term
- [ ] Hosted SaaS version (ClawdAgent Cloud)
- [ ] Team collaboration (multi-user workspaces)
- [ ] Fine-tuned agent models
- [ ] Voice-first interface (real-time conversation)
- [ ] Kubernetes operator for scaling

### Long Term
- [ ] Federated agent network (agent-to-agent across instances)
- [ ] On-device inference (WebGPU/WASM)
- [ ] Enterprise SSO & audit compliance
- [ ] Agent marketplace (community-built agents & tools)

See [ROADMAP.md](ROADMAP.md) for the full vision.

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Areas Where Help is Needed
- New tool integrations
- Agent prompt improvements
- Dashboard UI/UX
- Documentation and tutorials
- Test coverage
- Performance optimization
- New platform integrations (Slack, Matrix, etc.)

---

## License

Licensed under the [Apache License 2.0](LICENSE).

```
Copyright 2026 Lior Ben Shimon

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

### Why Apache 2.0?

| Protection | MIT | Apache 2.0 |
|-----------|-----|------------|
| Patent grant | No | **Yes** |
| Trademark protection | No | **Yes** |
| Contributor license | Implicit | **Explicit** |
| Attribution required | Yes | Yes |
| Commercial use | Yes | Yes |
| Modification | Yes | Yes |

Apache 2.0 protects both users and contributors with explicit patent grants and trademark rules, while remaining fully open-source and business-friendly.

---

<div align="center">

**Built with Claude by [Lior Testa - TestaMind](https://github.com/liortesta)**

If this project helps you, please give it a star!

</div>
