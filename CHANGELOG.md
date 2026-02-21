# Changelog

All notable changes to ClawdAgent are documented here.

## [6.0.0] - 2026-02-21

### Added
- **A2A Protocol** (Google/Linux Foundation) — Full Agent-to-Agent communication. Agent Card at `/.well-known/agent.json`, JSON-RPC 2.0, SSE streaming, task lifecycle management.
- **ACP Protocol** (IBM BeeAI/Linux Foundation) — Agent Communication Protocol support. REST-based runs, agent descriptors, async processing.
- **MCP Protocol** (Anthropic) — 9 MCP servers supported via JSON-RPC 2.0.
- **Prometheus Metrics** — `/metrics` endpoint with HTTP, AI, tool, and system metrics in Prometheus text exposition format.
- **Circuit Breaker** — Per-provider circuit breakers for AI services. Prevents cascading failures with CLOSED/OPEN/HALF_OPEN states.
- **Request Timeout Middleware** — 120s timeout on all API routes to prevent resource exhaustion.
- **Auto-Promoter** — Autonomous promotion engine across 9 social platforms + OpenClaw + TikVid. Opt-in via `AUTO_PROMOTE_ENABLED=true`.
- **SSRF Protection** — Browser tool blocks navigation to localhost, private IPs, metadata endpoints, and non-HTTP protocols.
- **SSH Path Validation** — Upload/download file transfer blocks sensitive local paths (.ssh, .env, credentials).
- **Dynamic Tool Creator Gate** — `new Function()` tool creation now requires explicit opt-in via `DYNAMIC_TOOLS_ENABLED=true`.
- **Intelligence Bridge** — Real-time anomaly detection, cost tracking, and behavioral intelligence.
- **Governance Engine** — Kill switch, approval gates, panic mode with auto-detection.
- **Content Guard** — Prompt injection detection, social engineering detection, SHA-256 memory integrity checksums.
- **Proactive Thinker** — Periodic AI-driven analysis of system health and opportunities.
- **Self-Evolution Engine** — Skill fetching, capability learning, crew orchestration, agent factory.
- **18 Specialized Agents** — General, Server Manager, Code Assistant, Researcher, Task Planner, Content Creator, Crypto Trader, Crypto Analyst, Web Agent, AI App Builder, Orchestrator, MRR Strategist, and more.
- **29 Tools** — Bash, File, Search, GitHub, Browser, Social (9 platforms), OpenClaw, Trading, SSH, Email, RAG, Memory, ElevenLabs, Firecrawl, Apify, and more.
- **74 Skills** — Learned and built-in skills across all agent domains.

### Security
- Removed default values for `JWT_SECRET` and `ENCRYPTION_KEY` — must be generated per deployment.
- Approval gate defaults to deny-on-timeout (opt-in for auto-approve via `APPROVAL_AUTO_APPROVE_ON_TIMEOUT`).
- Webhook token comparison uses `crypto.timingSafeEqual()` (timing-attack resistant).
- CSP: removed `unsafe-inline` from `scriptSrc`.
- Docker Compose: PostgreSQL/Redis bound to 127.0.0.1, credentials via env vars.
- `.env.example`: removed realistic-looking placeholder credentials.

### Changed
- Version bumped to 6.0.0.
- `package.json`: added repository, homepage, keywords, license, engines, author fields.
- Docker Compose: removed deprecated `version:` key, uses env var substitution for credentials.

## [5.0.0] - 2026-02-01

### Added
- Multi-model support (Anthropic, OpenRouter, OpenAI, Ollama, Claude Code CLI).
- Provider fallback chain with 402 credit exhaustion handling.
- Model selector UI in dashboard.
- Persistent memory with PostgreSQL + Redis.
- Crew orchestrator for multi-agent teams.
- Trading system with 5 strategies.
- Voice support via ElevenLabs + OpenAI Whisper.
- RTL chat support.

## [4.0.0] - 2026-01-15

### Added
- Self-evolution engine with skill fetching and capability learning.
- Behavior engine for adaptive agent personality.
- Plugin system with YAML configuration.
- MCP client for external tool servers.
- WhatsApp integration.

## [3.0.0] - 2025-12-01

### Added
- Web dashboard with real-time WebSocket updates.
- Cron engine with dead letter queue and retry logic.
- RAG (Retrieval Augmented Generation) with vector search.
- SSH session management for multi-server operations.
- Rate limiting and brute-force protection.

## [2.0.0] - 2025-10-15

### Added
- Multi-platform support (Telegram, Discord, Web).
- Agent routing with intent classification.
- Tool execution framework.
- PostgreSQL persistence with Drizzle ORM.

## [1.0.0] - 2025-08-01

### Added
- Initial release. Single Telegram bot with Claude AI.
- Basic server management via SSH.
- GitHub integration.
- Task scheduling.
