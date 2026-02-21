# Contributing to ClawdAgent

Thank you for your interest in contributing to ClawdAgent! This document provides guidelines for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/clawdagent.git`
3. Install dependencies: `pnpm install`
4. Copy environment: `cp .env.example .env`
5. Set up PostgreSQL and Redis
6. Run migrations: `pnpm db:migrate`
7. Start development: `pnpm dev`

## Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+ (optional, for queues)
- pnpm 8+

### Project Structure
```
src/
  agents/         # AI agent definitions and prompts
    prompts/      # Agent system prompts
    tools/        # 29 specialized tools
  core/           # Core engine, memory, evolution
  interfaces/     # Platform integrations (Telegram, Discord, WhatsApp, Web)
  security/       # Security modules (content-guard, audit, RBAC)
  memory/         # Database, cache, repositories
  actions/        # Action handlers (browser, SSH, desktop)
  services/       # External service integrations
web/              # React dashboard (Vite + Tailwind)
```

## How to Contribute

### Bug Reports
- Use the GitHub issue template
- Include: steps to reproduce, expected vs actual behavior, environment details

### Feature Requests
- Open a discussion first for major features
- Describe the use case, not just the solution

### Pull Requests
1. Create a feature branch: `git checkout -b feature/my-feature`
2. Follow existing code style (TypeScript strict, no `any`)
3. Add tests for new functionality
4. Update docs if needed
5. Run checks: `pnpm type-check && pnpm test`
6. Submit PR with clear description

### Code Style
- TypeScript strict mode
- No `any` types
- JSDoc on all exports
- Max 300 lines per file
- Meaningful variable names
- Error handling: never swallow errors

### Adding a New Tool
1. Create `src/agents/tools/my-tool.ts` extending `BaseTool`
2. Register in `src/core/tool-executor.ts`
3. Add to relevant agent prompts
4. Add tests
5. Document in README

### Adding a New Agent
1. Create prompt in `src/agents/prompts/my-agent.ts`
2. Register in `src/agents/registry.ts`
3. Configure tools and temperature
4. Add tests
5. Document in README

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
