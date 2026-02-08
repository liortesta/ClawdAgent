# Test Setup — Verify Entire Claude Code Configuration

Run a comprehensive verification of the entire MEGA setup.
This is the FIRST thing to run after dropping this template into a new project.

## Tests:

### 1. File Structure Integrity
- Verify ALL agent files exist and have valid YAML frontmatter (name, description, tools, model)
- Verify ALL command files exist
- Verify settings.json is valid JSON with all required sections (hooks, env, permissions)
- Verify .mcp.json is valid JSON with all servers
- Verify .lsp.json is valid JSON
- Verify CLAUDE.md exists and has all required sections

### 2. Agent Consistency
- Every agent mentioned in CLAUDE.md exists as a file
- Every agent file has the correct model tier (opus/sonnet/haiku as documented)
- No agent has tools it shouldn't have (e.g., security-auditor should NOT have Write)
- All agents have an Output Format section

### 3. Command Consistency
- Every command that should have context: fork actually has it
- Expected fork commands: swarm, autopilot, conductor, compete, self-heal, review-with-fresh-eyes, nightly-scan, evolve
- Every command uses $ARGUMENTS at the end
- No command references an agent that doesn't exist

### 4. Hook Verification
- All hooks in settings.json are syntactically valid bash
- Test PreToolUse Bash hook: echo a safe command → should pass
- Test PreToolUse Bash hook: echo "rm -rf /" → should block
- Test PreToolUse Edit hook: simulate main branch → should block
- Verify Setup hook runs without errors

### 5. MCP Server Check
- For each server in .mcp.json: verify the npm package exists (npm view <package>)
- Flag any servers with placeholder tokens (<YOUR_...)
- Report which servers are ready vs need configuration

### 6. Environment Variables
- Verify all env vars in settings.json are documented in CLAUDE.md
- Verify CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 is set

### 7. Cross-Reference Check
- bootstrap.sh mentions same number of agents/commands/MCP as actual files
- SUMMARY.md stats match actual file counts
- .gitignore covers all generated report directories

## Output Format:
```
## Setup Verification Report

| Category | Tests | Passed | Failed |
|----------|-------|--------|--------|
| File Structure | X | X | X |
| Agent Consistency | X | X | X |
| Command Consistency | X | X | X |
| Hook Verification | X | X | X |
| MCP Servers | X | X | X |
| Env Variables | X | X | X |
| Cross-References | X | X | X |

**Overall: READY / X issues found**

### Issues Found (if any):
1. [issue — how to fix]

### MCP Configuration Status:
| Server | Package Valid | Token Set | Ready |
|--------|-------------|-----------|-------|
| context7 | OK | N/A | OK |
| github | OK | needs token | WARN |
| ... | ... | ... | ... |
```

$ARGUMENTS
