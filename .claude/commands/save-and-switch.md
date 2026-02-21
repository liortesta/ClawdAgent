# Save & Switch — Smart Session Handoff

Save the current session context to persistent memory, then tell the user to start a fresh conversation to save costs. The new session will have full access to everything saved here.

## Process:

### Step 1: Gather Session Context
Analyze the current conversation and extract:
- What was accomplished (features, fixes, decisions)
- Current state of the project (what's running, what's pending)
- Any open tasks or loose ends
- Key file paths and line numbers that matter
- Important technical details the next session needs

### Step 2: Save to Memory Graph
Use the Memory MCP server (`mcp__memory__create_entities` and `mcp__memory__create_relations`) to persist:

**Entity: Session Record**
- Name: `session-{YYYY-MM-DD-HHmm}` (use current timestamp)
- Type: `session`
- Observations: accomplished items, decisions, current state, open tasks

**Entity: Active Project Context** (update if exists)
- Name: The project/feature name being worked on
- Type: `project-context`
- Observations: current branch, running servers, key files, pending work

**Relations:**
- session → `continues` → previous session (if known)
- session → `works-on` → project context

### Step 3: Generate Session ID
The session ID is the entity name from Step 2: `session-{YYYY-MM-DD-HHmm}`

### Step 4: Output to User
Print EXACTLY this format (in Hebrew since the user prefers Hebrew):

```
-------------------------------------------
  SESSION SAVED
-------------------------------------------

 Saved:    [bullet list of what was saved]
 Session:  session-{ID}
 Memory:   Persistent (available in all future sessions)

-------------------------------------------
 NEXT STEP
-------------------------------------------

 Start a new conversation and say:

   "Load session session-{ID} and continue from where we left off"

   OR just describe what you want — I remember everything.

 Why switch? This conversation has ~{estimate}K tokens of
 context. A fresh start = faster responses + lower cost.
-------------------------------------------
```

### Step 5: Update CLAUDE.md
Add a one-line entry under "Working Memory" in CLAUDE.md:
```
- [DATE] Session saved: session-{ID} — {one-line summary}
```

## Rules:
- ALWAYS save to Memory MCP — this is what makes cross-session memory work
- ALWAYS include the session ID so the user can reference it
- ALWAYS explain WHY switching saves money (context size = cost per message)
- Keep the output clean and actionable — the user should copy-paste one line
- If Memory MCP is unavailable, fall back to saving a summary in CLAUDE.md Working Memory section

$ARGUMENTS