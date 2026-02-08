# Quickstart — Interactive Project Onboarding

Guide the user through setting up this Claude Code template in their project.
Ask questions, configure, and verify — step by step.

## Process:

### Step 1: Project Detection
- Scan the current directory
- Detect: language, framework, package manager, test framework, database
- Show findings and ask user to confirm/correct

### Step 2: Configure CLAUDE.md
- Fill in the Architecture section with detected values
- Fill in Key Commands with actual commands (npm/pnpm/yarn)
- Ask: "What are the most important project conventions I should know?"
- Add answers to Project Conventions section

### Step 3: Configure MCP Servers
- Ask which MCP servers to activate:
  - GitHub: "Do you want me to manage GitHub issues/PRs? (need GITHUB_TOKEN)"
  - Playwright: "Do you have a web UI to test?"
  - PostgreSQL: "Do you use PostgreSQL? (need DATABASE_URL)"
  - Brave Search: "Do you want web search capability? (need BRAVE_API_KEY)"
  - Slack: "Do you want Slack notifications? (need SLACK_BOT_TOKEN)"
- For servers with tokens: ask user to provide them
- Disable unused servers (comment out in .mcp.json)

### Step 4: Install Dependencies
- Run bootstrap.sh (or bootstrap.ps1 on Windows)
- Install project dependencies
- Install LSP servers if needed

### Step 5: Verify Setup
- Run /test-setup to verify everything
- Fix any issues found
- Run /setup-project for full project configuration

### Step 6: First Task
- Ask: "What's the first thing you want to build or fix?"
- Recommend the right command to start:
  - New feature → "/plan [feature]"
  - Bug fix → "/self-heal"
  - Code review → "/review"
  - Understand codebase → "/plan analyze the entire codebase"

## Output at End:
```
## Quickstart Complete!

**Project**: [name]
**Stack**: [language + framework]
**Active MCP Servers**: [list]
**Agents Available**: [count]
**Commands Available**: [count]

**Recommended first steps:**
1. `/plan [your first task]`
2. Start building!
```

$ARGUMENTS
