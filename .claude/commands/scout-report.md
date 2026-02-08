# Scout Report — Search for New Claude Code Innovations

Run the scout agent to find new tools, MCP servers, agent patterns, and Claude Code features.

## Process:
1. Launch the **scout** agent
2. Search GitHub, npm, and web for:
   - New Claude Code releases and features
   - New MCP servers (official + community)
   - Trending CLAUDE.md configurations
   - New agent orchestration patterns
   - Updates to tools we already use (claude-flow, oh-my-claudecode, etc.)
3. Evaluate each finding (relevance, maturity, effort, impact)
4. Generate Scout Report with integrate/skip recommendations
5. Save report to `docs/scout-reports/[DATE].md`

## What Specifically to Look For:
- GitHub: `claude code` sorted by recently updated
- GitHub: `CLAUDE.md` sorted by stars
- npm: `@modelcontextprotocol` new packages
- GitHub: `anthropics/claude-code` releases page
- Web: "claude code new features 2025/2026"
- GitHub: check if oh-my-claudecode, claude-flow, wshobson/agents have new releases

## Rules:
- Report ONLY — never auto-install or auto-integrate
- Include source URLs for everything
- Flag security concerns
- Prioritize official tools over community

$ARGUMENTS
