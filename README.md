<div align="center">

# ClawdAgent

### The Autonomous AI Octopus

**v6.3 — 48,000+ lines of TypeScript. 60 core modules. 18 agents. 29 tools. 90 skills. 5 platforms. 3 protocols. 1 brain.**

An open-source autonomous AI agent that thinks, learns, evolves, and never stops.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Claude](https://img.shields.io/badge/AI-Claude%204.6-purple.svg)](https://anthropic.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Quick Start](#-quick-start) | [Features](#-features) | [Architecture](#-architecture) | [Docs](#-documentation) | [Contributing](#-contributing)

</div>

---

## What is ClawdAgent?

ClawdAgent is the **most comprehensive autonomous AI agent system** ever built as open-source. It runs 24/7 across multiple platforms, with **14-layer security**, **9 intelligence subsystems**, **18 specialized agents**, **29 tools**, and **90 skills** — all connected through a unified brain. It can **autonomously manage Facebook accounts**, **browse the web visually** with VNC streaming, and **publish to 9 social platforms** on a daily schedule with AI-generated content.

It doesn't just respond to commands — it **thinks proactively**, **learns from interactions**, **evolves its own capabilities**, **secures itself against attacks**, and **manages complex multi-step workflows** autonomously.

Think of it as your personal AI operations center: it manages your servers, writes your code, creates content, trades crypto, automates your phone, monitors your systems, publishes to 9 social platforms — all while learning and getting smarter over time.

```
You: "Check my servers, fix anything broken, and send me a summary on Telegram"
ClawdAgent: ✅ SSH'd into 3 servers → found nginx down on VPS2 → restarted it
            → checked SSL certs (2 expiring soon) → renewed them
            → generated AI image for the report header
            → sent you a full report on Telegram with recommendations
            → scheduled daily health checks via cron
            → learned the fix pattern for next time
```

```
You: "Create a marketing video about our product and publish it everywhere"
ClawdAgent: ✅ Generated script with AI → created video via Kie.ai
            → generated thumbnail via fal.ai (FLUX)
            → published to Twitter, Instagram, TikTok, LinkedIn, YouTube, Facebook
            → scheduled follow-up posts for peak engagement times
            → tracked publishing costs ($0.12 total)
```

```
You: "Set up DCA trading on Bitcoin — $50 daily, stop if it drops 20%"
ClawdAgent: ✅ Connected to Binance → configured DCA strategy → set risk limits
            → placed first buy order ($50 USDT → 0.00052 BTC)
            → scheduled daily recurring buys via cron
            → set 20% drawdown kill switch → activated portfolio tracker
            → will send Telegram alerts on every trade + daily P&L summary
```

```
You: "Research the top 5 competitors in our space and email me a report"
ClawdAgent: ✅ Searched Brave + scraped competitor websites with Playwright
            → analyzed pricing, features, tech stacks of 5 companies
            → generated a detailed comparison report (3 pages)
            → created competitive positioning matrix
            → emailed the report via Gmail with PDF attachment
            → saved findings to knowledge base for future reference
```

```
You: "My phone isn't syncing emails, fix it"
ClawdAgent: ✅ Connected to your Android via ADB → checked Gmail app status
            → found sync disabled after last OS update → re-enabled sync
            → cleared app cache (was 2.1 GB) → force-synced inbox
            → verified 47 new emails loaded → sent you confirmation on Telegram
            → created a skill "fix-email-sync" for next time
```

### What Makes ClawdAgent Different

Most AI agents are **reactive** — you ask, they answer. ClawdAgent is **autonomous**:

- **It thinks on its own** — The Proactive Thinker spots problems before you do. Server going down? SSL cert expiring? Budget running low? ClawdAgent alerts you before it becomes a crisis.
- **It creates its own tools** — Need a new capability? ClawdAgent builds it at runtime. No waiting for the next release.
- **It spawns its own agents** — The Meta Agent creates new specialized agents on demand. Need a "Legal Document Analyzer"? Ask once and it exists forever.
- **It evolves itself** — The Evolution Engine runs improvement cycles: learns from failures, optimizes prompts, merges redundant agents, discovers new patterns.
- **It secures itself** — 14 layers of Zero Trust defense. Every memory entry is SHA-256 checksummed. Every tool is hash-pinned. Every command is sandboxed. Every security check fails closed.
- **It runs your business** — Not just chat. Crypto trading with 5 strategies. Social publishing to 9 platforms. Server management with auto-repair. Email, calendar, browser automation, mobile control.
- **It speaks every protocol** — MCP (Anthropic), A2A (Google), ACP (IBM). Your agent can talk to any other compliant agent on the internet.
- **It runs anywhere** — Linux VPS, Mac, Windows, Docker, Raspberry Pi. Local models (Ollama) for full privacy. No cloud dependency.

### By The Numbers

| Metric | Count |
|--------|-------|
| Lines of TypeScript | **47,000+** |
| TypeScript Files | **328** |
| Core Modules | **60** |
| Specialized Agents | **18** (+ 17 dev agents) |
| Integrated Tools | **29** + Dynamic Tool Creator |
| Pre-loaded Skills | **90** across 23 categories |
| Security Layers | **14+** |
| Intelligence Subsystems | **9** |
| Communication Platforms | **5** |
| Dashboard Pages | **18** |
| API Routes | **19** |
| Database Tables | **19** |
| Agent Protocols | **3** (MCP + A2A + ACP) |
| AI Providers | **4** (Anthropic + OpenRouter + Ollama + Claude Code) |
| AI Models Configured | **29+** (400+ via OpenRouter) |
| Social Platforms | **9** |
| Crypto Exchanges | **100+** (via CCXT) |
| Trading Strategies | **5** |
| Heartbeat Alert Types | **9** |
| Self-Repair Patterns | **9** |
| Injection Detection Patterns | **20+** |
| Skill Scanner Patterns | **25+** |
| Intent Classifications | **45+** |
| Integrations | **60+** |

---

## Why ClawdAgent?

### Core Capabilities

| Capability | AutoGPT | CrewAI | LangChain | MetaGPT | OpenDevin | **ClawdAgent** |
|-----------|---------|--------|-----------|---------|-----------|----------------|
| Autonomous Execution | Partial | Task-based | Chain-based | Workflow | IDE-focused | **Full 24/7 autonomy** |
| Persistent Memory | Limited | No | Via plugins | Partial | Session | **PostgreSQL + Redis + Memory Hierarchy** |
| Self-Evolution | No | No | No | No | No | **Evolution Engine + Self-Repair + Auto-Learn** |
| Proactive Thinking | No | No | No | No | No | **Autonomous: spots problems, sends alerts** |
| Multi-Platform Chat | No | No | No | No | No | **Telegram + Discord + WhatsApp + Web** |
| Web Dashboard | Basic | No | LangSmith | No | Browser | **Full React Dashboard (18 pages)** |
| Dynamic Tool Creation | No | No | No | No | No | **Creates new tools at runtime** |
| Multi-Agent Teams | No | Yes | No | Yes | No | **Crew Orchestrator + Meta Agent + Factory** |
| Agent-to-Agent Protocols | No | No | No | No | No | **A2A + ACP + MCP (full compliance)** |

### Security Comparison

| Security Feature | AutoGPT | CrewAI | LangChain | MetaGPT | OpenDevin | **ClawdAgent** |
|-----------------|---------|--------|-----------|---------|-----------|----------------|
| Defense Layers | 1 | 1 | 2 | 1 | 2 | **14-layer defense-in-depth** |
| Prompt Injection Guard | No | No | Basic | No | No | **20+ regex patterns + AI detection** |
| Social Engineering Detection | No | No | No | No | No | **15 patterns, auto-block** |
| Memory Integrity | No | No | No | No | No | **SHA-256 checksums + tamper quarantine** |
| Audit Trail | No | No | No | No | No | **Tamper-evident hash chain** |
| Command Sandboxing | No | No | No | No | Docker | **Bash sandbox + command guard** |
| RBAC + JWT Auth | No | No | No | No | No | **Full RBAC + JWT + per-user perms** |
| Kill Switch | No | No | No | No | No | **Emergency stop + cost tracking** |
| Approval Gate | No | No | No | No | No | **Human-in-the-loop for critical ops** |
| Governance Engine | No | No | No | No | No | **Risk budgets + autonomy levels** |
| Fail-Closed Design | No | No | No | No | No | **All security checks fail-closed** |
| Skill Scanning | No | No | No | No | No | **25+ patterns, severity scoring** |
| Tool Integrity Hashing | No | No | No | No | No | **SHA-256 hash-pinning on tools** |
| Encryption at Rest | No | No | No | No | No | **AES encryption + key rotation** |

### Intelligence & AGI Readiness

| Intelligence Feature | AutoGPT | CrewAI | LangChain | MetaGPT | OpenDevin | **ClawdAgent** |
|---------------------|---------|--------|-----------|---------|-----------|----------------|
| Multi-Model Support | GPT only | Multiple | Multiple | GPT-focused | Multiple | **Claude 4.6 + OpenRouter (400+) + Ollama + Claude Code** |
| Smart Model Routing | No | No | No | No | No | **Auto-routes by complexity, cost, budget** |
| Extended Thinking | No | No | No | No | No | **32K thinking tokens for deep reasoning** |
| Intent Classification | Basic | No | No | Role-based | No | **45+ intents, multilingual (Hebrew, Arabic, CJK)** |
| Intelligence Bridge | No | No | No | No | No | **9 subsystems: scoring, memory, governance, cost, routing, observability, goals, safety, feedback** |
| Safety Simulator | No | No | No | No | No | **Dry-run testing + impact assessment + rollback** |
| Cost Intelligence | No | No | Callbacks | No | No | **ROI tracking + budget forecasting + burn prediction** |
| Behavior Adaptation | No | No | No | No | No | **Multi-language personality + adaptive styles** |
| Goal Engine | No | No | No | No | No | **Self-initiated 30/60/90-day goals with KPIs** |
| Feedback Loop | No | No | No | No | No | **Pattern recognition + prompt optimization** |

### Tools & Integrations

| Category | AutoGPT | CrewAI | LangChain | MetaGPT | OpenDevin | **ClawdAgent** |
|----------|---------|--------|-----------|---------|-----------|----------------|
| Built-in Tools | 5-10 | 5-8 | Via plugins | 5-10 | 10-15 | **29 integrated tools** |
| Pre-loaded Skills | No | No | No | No | No | **90 skills across 23 categories, extensible at runtime** |
| Server Management | No | No | No | No | No | **Multi-server SSH + Docker + health monitoring** |
| Browser Automation | Via plugins | No | Via plugins | No | Built-in | **Playwright headless + AI vision** |
| Content Creation | No | No | No | No | No | **AI video/image/music (Kie.ai 60+ models + fal.ai)** |
| Social Publishing | No | No | No | No | No | **9 platforms (Twitter, IG, TikTok, LinkedIn, YT, FB, Threads, BlueSky, Pinterest)** |
| Crypto Trading | No | No | No | No | No | **5 strategies + TA engine + risk manager** |
| Mobile Automation | No | No | No | No | No | **Android via ADB/Appium** |
| Desktop Control | No | No | No | No | No | **AI vision + mouse/keyboard** |
| Email Integration | No | No | No | No | No | **Gmail API + SMTP** |
| Voice (TTS/STT) | No | No | No | No | No | **ElevenLabs integration** |
| Remote Agent Bridge | No | No | No | No | No | **OpenClaw (Ed25519 device auth)** |

### Deployment & Operations

| Feature | AutoGPT | CrewAI | LangChain | MetaGPT | OpenDevin | **ClawdAgent** |
|---------|---------|--------|-----------|---------|-----------|----------------|
| Production-Ready | Partial | Library | Library | Prototype | Beta | **PM2 + Docker + nginx production stack** |
| One-Command Install | No | pip | pip | pip | Docker | **`bash install.sh` (interactive wizard)** |
| Observability | Basic logs | No | LangSmith | No | No | **Timeline events + tool heatmaps + error clustering** |
| Cron Scheduling | No | No | No | No | No | **Built-in cron + recurring tasks** |
| Queue System | No | No | No | No | No | **BullMQ (4 job types, 5 parallel, 20 queue)** |
| Self-Repair | No | No | No | No | No | **9 known fix patterns + AI diagnosis** |
| Config Management | .env | Code | Code | Code | Docker | **Zod-validated .env + YAML hot-reload + Web UI** |
| Open Source | Yes | Yes | Yes | Yes | Yes | **Apache 2.0 (patent + trademark protection)** |

### ClawdAgent vs OpenClaw — The Definitive Comparison

[OpenClaw](https://openclaw.ai) (by Peter Steinberger) is the most well-known personal AI assistant. Here's how ClawdAgent compares on every dimension:

#### Architecture & Intelligence

| Feature | OpenClaw | **ClawdAgent** |
|---------|----------|----------------|
| Architecture | Single agent + skills | **18 specialized agents + Meta Agent + Crew Orchestrator** |
| Agent Brain | Single LLM call | **Intelligence Bridge: 9 subsystems (scoring, memory, governance, cost, routing, observability, goals, safety, feedback)** |
| Multi-Agent Orchestration | No (single thread) | **Crew Orchestrator + Agent Factory + dynamic spawn** |
| Agent Self-Creation | No | **Meta Agent creates new agents at runtime based on need** |
| Dynamic Tool Creation | No | **Creates new tools at runtime + auto-tool discovery** |
| Self-Evolution | Skill creation via chat | **Evolution Engine: autonomous improvement cycles + self-repair (9 fix patterns) + auto-learn** |
| Proactive Thinking | Heartbeats | **Proactive Thinker: spots problems, finds opportunities, sends alerts + 9 alert types** |
| Intent Classification | Basic routing | **45+ intents with multilingual support (Hebrew, Arabic, CJK)** |
| Extended Thinking | No | **32K thinking tokens for deep reasoning** |
| Goal Engine | No | **Self-initiated 30/60/90-day goals with KPIs and milestones** |
| Behavior Adaptation | Persona onboarding | **Multi-language personality variants + adaptive interaction styles** |
| Smart Model Routing | Provider fallback | **Cost-aware routing: complexity → model, cost → provider, budget → tier** |

#### Security & Trust

| Security Feature | OpenClaw | **ClawdAgent** |
|-----------------|----------|----------------|
| Defense Architecture | Sandboxed execution | **14-layer defense-in-depth (Zero Trust)** |
| Prompt Injection Guard | Basic filtering | **20+ regex patterns + AI detection + pre-AI message guard** |
| Social Engineering Detection | No | **15 patterns, auto-block on high severity** |
| Memory Integrity | No | **SHA-256 checksums on every entry, tamper quarantine** |
| Audit Trail | Logs | **Tamper-evident hash chain on ALL operations** |
| Governance Engine | No | **Risk budgets, autonomy levels, cost/risk limits** |
| Fail-Closed Design | No (permissive) | **ALL security checks fail-closed on error** |
| Kill Switch | No | **Emergency stop + cost tracking + failure data** |
| Approval Gate | No | **Human-in-the-loop for critical ops (trading, social, destructive)** |
| Skill Scanning | Basic trust | **25+ static analysis patterns, severity scoring, reputation tracking** |
| Tool Integrity | No | **SHA-256 hash-pinning detects MCP rug-pulls** |
| RBAC + JWT Auth | Basic auth | **Full RBAC + JWT + per-user permissions + rate limiting** |
| Command Sandboxing | Docker sandbox | **Bash sandbox + command guard + bounded concurrency** |
| Encryption at Rest | No | **AES encryption + automatic key rotation** |

#### Platform & Communication

| Platform | OpenClaw | **ClawdAgent** |
|----------|----------|----------------|
| WhatsApp | Yes | **Yes (WhatsApp Web + QR pairing from dashboard)** |
| Telegram | Yes | **Yes (full bot: keyboards, media, voice, inline)** |
| Discord | Yes | **Yes (slash commands, embeds, reactions)** |
| Web Dashboard | No (terminal only) | **Full React Dashboard: 18 pages, real-time WebSocket, charts** |
| Slack | Yes | Roadmap |
| Signal | Yes | Roadmap |
| iMessage | Yes (macOS) | Roadmap |
| A2A Protocol (Google) | No | **Full compliance: Agent Card, Tasks, SSE streaming** |
| ACP Protocol (IBM) | No | **Full compliance: REST runs, agent descriptor** |
| MCP Protocol (Anthropic) | Partial | **Deep integration: 9 MCP servers, JSON-RPC 2.0** |

#### AI Models & Providers

| Provider | OpenClaw | **ClawdAgent** |
|----------|----------|----------------|
| Anthropic (Claude) | Yes | **Yes (Claude 4.6, direct API)** |
| OpenAI (GPT) | Yes | **Yes (via OpenRouter)** |
| OpenRouter | No | **Yes (400+ models, many free)** |
| Ollama (local) | No | **Yes (Llama, Mistral, Qwen — fully offline)** |
| Claude Code CLI | Via Claude Max | **Yes (free AI backend with Max subscription)** |
| MiniMax | Community | **Yes (via OpenRouter)** |
| Google Gemini | No | **Yes (via OpenRouter)** |
| DeepSeek | No | **Yes (via OpenRouter — free)** |
| Provider Fallback | Manual | **Automatic cascade: Anthropic → OpenRouter → Ollama** |
| Cost Intelligence | No | **ROI tracking + budget forecasting + burn prediction** |

#### Tools & Capabilities

| Capability | OpenClaw | **ClawdAgent** |
|-----------|----------|----------------|
| Built-in Tools | ~15 | **29 integrated tools** |
| Pre-loaded Skills | Community-driven | **90 skills across 23 categories (ML, crypto, security, RAG, fine-tuning, inference, agents)** |
| Browser Automation | Yes (Playwright) | **Yes (headless Playwright + AI vision)** |
| Server Management | Shell commands | **Multi-server SSH + Docker ops + health monitoring + auto-discovery** |
| Crypto Trading | No | **5 strategies (DCA, Scalping, Swing, Day Trading, Custom) + TA engine + risk manager** |
| Social Publishing | No | **9 platforms (Twitter, IG, TikTok, LinkedIn, YT, FB, Threads, BlueSky, Pinterest)** |
| AI Video Generation | No | **Kie.ai (60+ models) + fal.ai (FLUX, Kling, Wan, Stable Diffusion)** |
| AI Image Generation | Via skill | **fal.ai (FLUX, SD) + Kie.ai** |
| Desktop Control | Mac (Accessibility) | **AI vision + mouse/keyboard (cross-platform)** |
| Mobile Automation | No | **Android via ADB/Appium with pre-built recipes** |
| Email | Gmail via skill | **Gmail API + SMTP dual integration (native)** |
| Voice (TTS/STT) | ElevenLabs | **ElevenLabs (native integration)** |
| Calendar | Google Calendar | **Google Calendar (native integration)** |
| Code Execution | Claude Code sessions | **Bash tool + GitHub tool + Code Assistant agent** |
| RAG (Document Q&A) | No | **Vector embeddings + keyword hybrid search** |
| Queue System | No | **BullMQ (4 job types, 5 parallel, 20 queue)** |
| Cron Scheduling | Yes | **Yes (built-in + timezone-aware + Web UI)** |

#### Deployment & Operations

| Feature | OpenClaw | **ClawdAgent** |
|---------|----------|----------------|
| Install Complexity | 1-liner (npm) | **1-liner (`bash install.sh`) + interactive wizard** |
| OS Support | Mac, Windows, Linux | **Mac, Windows, Linux (+ Docker)** |
| Production Stack | PM2 / Docker | **PM2 + Docker + nginx + PostgreSQL + Redis** |
| Database | SQLite | **PostgreSQL 15+ (enterprise-grade)** |
| Caching Layer | No | **Redis 7+ (BullMQ queues + session cache)** |
| Observability | Logs | **Timeline events + tool heatmaps + error clustering + cost tracker** |
| Self-Repair | No | **9 known fix patterns + AI diagnosis** |
| Config Management | .env + YAML | **Zod-validated .env + YAML hot-reload + Web UI settings** |
| Scaling | Single instance | **Horizontal via Docker + queue workers** |
| API Endpoints | Webhooks | **Full REST API (19 routes) + WebSocket + A2A + ACP** |

#### Community & Ecosystem

| Metric | OpenClaw | **ClawdAgent** |
|--------|----------|----------------|
| License | MIT | **Apache 2.0 (patent + trademark protection)** |
| Age | ~2 months | **6 months (v6.2)** |
| Codebase | ~10K lines | **45,000+ lines TypeScript (282 files)** |
| Modules | ~20 | **57 core modules** |
| Protocol Support | MCP (partial) | **MCP + A2A + ACP (full compliance)** |
| Target User | Mac power users | **Developers, DevOps, traders, teams, enterprises** |
| Self-Hosting | Required | **Required (+ Docker one-command)** |
| Extensibility | Skills (JavaScript) | **Skills (JSON) + Plugins (manifest) + Tools (TypeScript) + Agents (prompt)** |

> **Bottom line**: OpenClaw is an excellent personal AI assistant for Mac users who want quick automation via chat. ClawdAgent is an **autonomous AI operations center** — a full-stack, multi-agent, self-evolving system with enterprise-grade security, crypto trading, social publishing, 4 AI providers, 3 agent protocols, and a complete React dashboard. If OpenClaw is a smart personal assistant, ClawdAgent is an **AI department**.

---

## Features

### Core Intelligence — 57 Modules
- **Multi-Model AI** — Claude 4.6 (Anthropic), 400+ models via OpenRouter, local Ollama models, Claude Code CLI (free with Max)
- **Smart Model Router** — Picks the best model per task (complexity, cost, budget) with 5 provider modes
- **Extended Thinking** — Up to 32K thinking tokens for complex reasoning
- **Streaming Responses** — Real-time token streaming across all platforms
- **Intent Classification** — 45+ intents with multilingual support (Hebrew, Arabic, CJK)
- **Intelligence Bridge** — Central nervous system connecting 9 subsystems (scoring, memory, governance, cost, routing, observability, goals, safety, feedback)
- **Governance Engine** — Risk categorization, autonomy levels, cost/risk budgets, execution approval workflows
- **Safety Simulator** — Dry-run testing of commands before execution, impact assessment, rollback planning
- **Proactive Thinker** — Agent thinks autonomously: spots problems, finds opportunities, sends alerts
- **Behavior Engine** — Multi-language personality variants, adaptive interaction styles
- **OpenClaw Bridge** — Cryptographic device auth (Ed25519), remote agent execution, cron management

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
`bash` `file` `search` `github` `task` `db` `browser` `kie` `social` `openclaw` `cron` `memory` `auto` `email` `workflow` `analytics` `claude-code` `device` `elevenlabs` `firecrawl` `rapidapi` `apify` `ssh` `trading` `rag` `whatsapp` `tikvid` `fal-ai` `auto-tool`

### Memory & Learning — 11 Repositories
- **PostgreSQL** — Persistent storage for conversations, knowledge, tasks, users, servers
- **Redis** — Caching layer + BullMQ job queues (4 job types, 5 parallel, 20 queue max)
- **Memory Hierarchy** — Multi-tier memory with automatic promotion/demotion
- **SHA-256 Integrity** — Every memory entry checksummed; tampered entries quarantined
- **Auto-Learning** — Learns facts, preferences, and patterns from conversations
- **Hybrid Search** — Semantic (vector embeddings) + keyword search combined
- **RAG Engine** — Retrieval-augmented generation for document Q&A
- **Heartbeat System** — 9 alert types: server down, overdue tasks, morning briefing, evening summary, self-repair alerts, proactive tips, goal updates

### Security — 14-Layer Defense in Depth
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
- **Cisco AI Defense** — Enterprise AI security integration
- **Skill Scanner** — 25+ static analysis patterns with severity scoring and reputation tracking

### Communication Platforms — 5 Interfaces
- **Telegram** — Full bot with keyboards, media, voice, inline queries
- **Discord** — Bot with slash commands, embeds, reactions
- **WhatsApp** — WhatsApp Web integration with QR pairing
- **Web Dashboard** — React app with real-time WebSocket (Dashboard, Chat, Agents, Tasks, Cron, Servers, Trading, Skills, Knowledge, Intelligence, Evolution, Graph, Logs, Costs, Settings, History, OpenClaw, Login)
- **Agent Protocols** — A2A + ACP for agent-to-agent communication

### What ClawdAgent Connects To — 60+ Integrations

ClawdAgent connects to virtually everything. Every integration is built-in or one config line away:

| Category | Services & Platforms |
|----------|---------------------|
| **Chat Platforms** | Telegram, Discord, WhatsApp, Web Dashboard (+ A2A/ACP for any agent) |
| **AI Providers** | Anthropic Claude 4.6, OpenRouter (400+ models), Ollama (local), Claude Code CLI, DeepSeek, Gemini, GPT-4o, Mistral, Llama, Qwen |
| **Social Media** | Twitter/X, Instagram, TikTok, LinkedIn, YouTube, Facebook, Threads, BlueSky, Pinterest (via Blotato) |
| **AI Generation** | fal.ai (FLUX, Stable Diffusion, Kling, Wan), Kie.ai (60+ models: video, image, music, voice) |
| **Code & DevOps** | GitHub (PRs, issues, repos), Docker, SSH (multi-server), PM2, nginx, CI/CD |
| **Databases** | PostgreSQL, Redis, SQLite, any SQL via Drizzle ORM |
| **Email** | Gmail API, SMTP (any provider), Nodemailer |
| **Calendar** | Google Calendar (events, scheduling, reminders) |
| **Voice** | ElevenLabs (TTS, STT, voice cloning) |
| **Browser** | Playwright (headless automation, form filling, scraping, screenshots) |
| **Crypto** | Binance, Bybit, Coinbase, Kraken, KuCoin + 100 exchanges via CCXT |
| **Search** | Brave Search, Firecrawl (web scraping), Apify (data extraction), RapidAPI (1000s of APIs) |
| **Documents** | PDF parsing, DOCX/Word (Mammoth), Excel/XLSX, YAML, JSON |
| **Media** | Sharp (image processing), QR codes, screenshots, video processing |
| **Mobile** | Android via ADB/Appium (app control, SMS, calls, notifications) |
| **Desktop** | AI vision + mouse/keyboard automation (cross-platform) |
| **Remote Agents** | OpenClaw Bridge (Ed25519 device auth), MCP servers (9), A2A, ACP |
| **Monitoring** | Server health checks, SSL cert monitoring, disk/CPU/RAM alerts, uptime tracking |
| **Scheduling** | node-cron (timezone-aware), BullMQ (delayed jobs), recurring workflows |
| **Security** | Helmet, bcrypt, JWT, Zod validation, SHA-256 integrity, AES encryption |

> **If it has an API, ClawdAgent can talk to it.** And if it doesn't have a tool yet, ClawdAgent can **create one at runtime**.

### Self-Evolution — The Agent That Improves Itself
- **Evolution Engine** — Autonomous capability improvement cycles
- **Self-Repair** — 9 known fix patterns + AI-powered diagnosis
- **Capability Learner** — Discovers and acquires new capabilities from the web
- **Skill Engine** — 90 pre-loaded skills across 23 categories, dynamically extensible at runtime
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

### One-Command Install

```bash
git clone https://github.com/liortesta/ClawdAgent.git
cd ClawdAgent
bash install.sh
```

The interactive installer handles everything: prerequisites check, dependencies, environment configuration, security key generation, and build.

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+ (optional — works without it, queues disabled)
- pnpm 8+ (auto-installed if missing)

### Manual Setup

```bash
# 1. Clone
git clone https://github.com/liortesta/ClawdAgent.git
cd ClawdAgent

# 2. Install dependencies
pnpm install && cd web && npm install && cd ..

# 3. Configure
cp .env.example .env
# Edit .env — at minimum set: DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY

# 4. Generate security keys
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# 5. Start database (using Docker)
docker compose up -d postgres redis

# 6. Build
pnpm run build && cd web && npm run build && cd ..

# 7. Start
pnpm start
```

Open `http://localhost:3000` to see the dashboard.

### Minimal Setup (just AI chat)

Only need a database and one AI provider:
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/clawdagent
JWT_SECRET=<generate with: openssl rand -hex 32>
ENCRYPTION_KEY=<generate with: openssl rand -hex 32>

# Option A: Anthropic API key
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Option B: OpenRouter (400+ models, many free)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Option C: Claude Code CLI (FREE with Max subscription)
CLAUDE_CODE_ENABLED=true

# Option D: Ollama (local, free)
OLLAMA_ENABLED=true
OLLAMA_URL=http://localhost:11434
```

### Production with PM2

```bash
pnpm run build
pm2 start dist/index.js --name clawdagent --max-memory-restart 8G
pm2 save
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
  │   │ (spawns new agents)  │  │ (multi-agent teams)  │  │ (90 skills)      │   │
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
  core/                 — Engine, AI client, memory, evolution (57 modules)
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

web/                    — React dashboard (Vite + Tailwind, 18 pages)
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
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | JWT signing key (32+ chars, generate with `openssl rand -hex 32`) |
| `ENCRYPTION_KEY` | **Yes** | Data encryption key (32+ chars) |
| `ANTHROPIC_API_KEY` | At least one AI provider | Claude API key |
| `OPENROUTER_API_KEY` | At least one AI provider | 400+ models including free ones |
| `CLAUDE_CODE_ENABLED` | At least one AI provider | Use Claude Code CLI (free with Max) |
| `OLLAMA_ENABLED` | At least one AI provider | Use local Ollama models |
| `REDIS_URL` | No | Redis (queues disabled without it) |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot |
| `DISCORD_BOT_TOKEN` | No | Discord bot |
| `WHATSAPP_ENABLED` | No | WhatsApp Web (scan QR from dashboard) |
| `FAL_AI_API_KEY` | No | AI image/video generation (FLUX, Kling, Wan) |
| `KIE_AI_API_KEY` | No | AI content generation (60+ models) |
| `BLOTATO_API_KEY` | No | Social media publishing (9 platforms) |
| `ELEVENLABS_API_KEY` | No | Text-to-Speech + voice cloning |
| `BRAVE_API_KEY` | No | Web search |
| `OPENCLAW_GATEWAY_TOKEN` | No | OpenClaw remote agent bridge |

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

## What's New in v6.3

### Chat Experience Overhaul
- **Syntax Highlighting** — Code blocks now feature full syntax highlighting via highlight.js (40+ languages: JS, TS, Python, Bash, SQL, YAML, and more) with a dark theme optimized for readability
- **One-Click Code Copy** — Every code block has a copy button with visual "Copied" feedback — no more manual selection
- **Markdown Tables** — Pipe-delimited tables (`|col|col|`) render as styled, responsive HTML tables with alternating row colors
- **Clipboard Image Paste** — Ctrl+V / Cmd+V pastes images directly from clipboard as file attachments — no drag & drop needed
- **Conversation Export** — Export any conversation as Markdown (human-readable) or JSON (structured data) with one click
- **Message Actions** — Hover over any assistant message to copy its text or retry the previous prompt
- **Mobile-First Sidebar** — Conversation sidebar overlays on mobile instead of pushing content, fully responsive

### Bug Fixes & Stability
- **Streaming Race Condition** — Fixed stale streaming text bleeding between conversations
- **Thinking Toggle** — Fixed dead code in the thinking section collapse/expand logic
- **File Cleanup Leak** — Document uploads now properly clean temp files in all code paths
- **Pending Response Queue** — Added periodic cleanup to prevent unbounded memory growth in WebSocket handler
- **API Client** — Added missing `post()` method that was breaking mobile agent page builds

### Previous (v6.2)

### Browser Automation & VNC Streaming
- **Visual Browser Sessions** — Playwright-powered browser with Xvfb + x11vnc + noVNC. Watch your agent browse the web in real-time from the dashboard
- **Stealth Engine** — Anti-detection fingerprinting for browser automation (WebGL, Canvas, Navigator, WebRTC spoofing)
- **Browser Session Manager** — Multi-session orchestration with automatic process cleanup and orphan killing
- **Browser View Page** — Full VNC streaming in the web dashboard with command panel, quick actions, and AI instruction input

### Autonomous Facebook Agent
- **Facebook Account Manager** — Import cookies, manage multiple accounts, verify login sessions
- **Autonomous Facebook Agent** — Fully autonomous posting, commenting, friend requests, group interactions with human-like behavior
- **Safety Controls** — Rate limiting, active hours scheduling, error-based auto-pause, configurable daily limits per action type
- **Facebook Tool** — 11 chat actions: list accounts, start/stop/pause agent, view logs, open Facebook in VNC, post content, navigate
- **Cookie-Based Auth** — Import Facebook cookies for seamless logged-in sessions without username/password

### Cron & Scheduled Publishing
- **AI-Powered Cron Publishing** — `ai_publish` handler generates content with AI and publishes to social media on schedule
- **Push Notifications** — Bell icon notifications when scheduled automations publish content (green success badge)
- **Manual Trigger API** — `POST /api/cron/:id/trigger` to test cron jobs on demand from the dashboard
- **Dead Letter Queue** — Failed cron tasks retry with exponential backoff (5s → 30s → 2min), then move to DLQ for manual review

### Chat & Routing Improvements
- **Facebook Intent Router** — 10 keyword patterns (Hebrew + English) route Facebook requests to web-agent automatically
- **Browser Session Badges** — Chat shows clickable "Watch in Browser View" links when agents open browser sessions
- **3 New Browser Skills** — `browser-signup`, `browser-scrape`, `browser-form` for common automation patterns
- **System Graph** — Browser infrastructure nodes (Session Manager, Xvfb, VNC, Stealth Engine) visible in architecture graph

### Previous (v6.1)
- **OpenClaw Device Auth** — Ed25519 cryptographic device authentication for secure gateway communication
- **Claude Code CLI Provider** — Use Claude Code as a free AI backend (requires Max subscription)
- **fal.ai Integration** — AI image and video generation via FLUX, Stable Diffusion, Kling, Wan
- **Interactive Installer** — One-command setup with `bash install.sh`
- **4 AI Provider Modes** — Anthropic direct, OpenRouter (400+ models), Ollama (local), Claude Code CLI
- **Security Hardening** — Fail-closed governance, message guard, skill scanner, tool integrity checks

---

## Real-World Use Cases

ClawdAgent isn't a toy — it's a production system. Here's what people use it for:

| Use Case | How It Works |
|----------|-------------|
| **24/7 DevOps** | SSH into servers, restart services, check logs, monitor health, renew SSL certs, alert on issues — all automatic |
| **Crypto Trading** | 5 strategies (DCA, Scalping, Swing, Day Trading, Custom) across 100+ exchanges with risk management and P&L tracking |
| **Social Media Manager** | Create AI content (video/image/text) and publish to 9 platforms on schedule with engagement tracking |
| **Personal Assistant** | Manage calendar, send emails, set reminders, answer questions, remember everything — via WhatsApp or Telegram |
| **Code Assistant** | Write code, create PRs, review changes, run tests, debug issues — orchestrated by Claude Code |
| **Research Analyst** | Deep web research, competitor analysis, market reports, saved to knowledge base with RAG |
| **Server Fleet Management** | Monitor multiple servers, auto-fix common issues, Docker management, health dashboards |
| **Content Pipeline** | Generate scripts → create videos → make thumbnails → publish everywhere → track performance |
| **Mobile Automation** | Control Android apps, automate workflows, handle SMS/calls, manage notifications |
| **Browser Automation** | Fill forms, scrape data, take screenshots, navigate workflows — with VNC streaming so you watch in real-time |
| **Facebook Automation** | Autonomous agent posts, comments, sends friend requests, joins groups — all with human-like delays and safety limits |
| **Business Intelligence** | Cost tracking, ROI analysis, budget forecasting, agent performance metrics |
| **Team Coordination** | Multi-agent crews collaborate on complex tasks, with governance and approval gates |

---

## Deployment

### Docker (Recommended)

```bash
docker compose up -d
```

### Manual (VPS/Cloud)

```bash
# Build
pnpm run build
cd web && npm run build && cd ..

# Start with PM2
pm2 start dist/index.js --name clawdagent --max-memory-restart 8G
pm2 save
```

### Requirements for Production
- Set `NODE_ENV=production`
- Use strong `JWT_SECRET` and `ENCRYPTION_KEY` (generate with `openssl rand -hex 32`)
- Set up PostgreSQL with proper credentials
- Configure Redis for full queue support
- Set `CRON_TIMEZONE` to your timezone
- Set `BIND_HOST=127.0.0.1` behind a reverse proxy (nginx)

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
| **Automation** | Playwright (stealth mode), Xvfb + VNC, ADB/Appium |
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
Copyright 2024-2026 Lior Ben Shimon (TestaMind)

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

If ClawdAgent helps you, please **give it a star** and mention it in your projects!

[![Star on GitHub](https://img.shields.io/github/stars/liortesta/ClawdAgent?style=social)](https://github.com/liortesta/ClawdAgent)

</div>
