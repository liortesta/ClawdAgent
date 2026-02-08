# Full Project Setup

Analyze the project and set up the complete development environment.

## Steps:
1. Scan the entire codebase — identify language, framework, package manager, test framework, database, deployment target
2. Install all dependencies (use the detected package manager)
3. Set up proper .gitignore if not exists
4. Set up linting and formatting (ESLint/Prettier for JS/TS, Black/Ruff for Python)
5. Set up pre-commit hooks (husky + lint-staged for JS/TS, pre-commit for Python)
6. Create .env.example with all required environment variables documented
7. Update CLAUDE.md Architecture section with detected project profile
8. Update CLAUDE.md Key Commands with actual commands
9. Verify the dev server starts successfully
10. Verify tests run successfully
11. Report final status

## Rules:
- NEVER overwrite existing configuration without asking
- ALWAYS preserve existing .env files
- ALWAYS check if tools are already installed before installing

$ARGUMENTS
