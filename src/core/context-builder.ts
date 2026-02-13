import { Message } from './claude-client.js';

export interface EvolutionContext {
  phase: string;
  totalSkills: number;
  totalAgents?: number;
  dynamicAgents?: number;
  lastEvolution?: string | null;
  healthIndex?: number;                 // System Intelligence Index 0-100
  governanceBudget?: string;            // e.g. "$4.50/$10.00"
  activeGoals?: number;
  pendingSelfTasks?: number;
  disabledAgents?: string[];            // Agents auto-disabled by scorer
  costToday?: number;                   // USD spent today
}

export interface FullContext {
  history: Message[];
  knowledge: string;
  pendingTasks: string;
  servers: string;
  skills?: string;
  activeSkill?: { name: string; prompt: string } | null;
  providers?: string[];
  knowledgeCount?: number;
  goals?: string;
  evolution?: EvolutionContext;
}

export function buildSystemPromptWithContext(
  agentPrompt: string,
  context: {
    userName: string;
    platform: string;
    intent: string;
    params: Record<string, string>;
    fullContext: FullContext;
    activeTools?: string[];
  }
): string {
  const parts: string[] = [agentPrompt];

  parts.push(`\n\n## Current Session`);
  parts.push(`- User: ${context.userName}`);
  parts.push(`- Platform: ${context.platform}`);
  parts.push(`- Detected Intent: ${context.intent}`);
  parts.push(`- Time: ${new Date().toLocaleString()}`);
  if (Object.keys(context.params).length > 0) {
    parts.push(`- Extracted Parameters: ${JSON.stringify(context.params)}`);
  }

  // Available AI providers
  if (context.fullContext.providers && context.fullContext.providers.length > 0) {
    parts.push(`- Available AI Providers: ${context.fullContext.providers.join(', ')}`);
  }

  // Knowledge about the user
  if (context.fullContext.knowledge) {
    parts.push(`\n## What I Know About This User (${context.fullContext.knowledgeCount ?? '?'} facts)`);
    parts.push(context.fullContext.knowledge);
  }

  if (context.fullContext.pendingTasks) {
    parts.push(`\n## User's Pending Tasks`);
    parts.push(context.fullContext.pendingTasks);
  }

  if (context.fullContext.servers) {
    parts.push(`\n## Registered Servers`);
    parts.push(context.fullContext.servers);
  }

  if (context.fullContext.goals) {
    parts.push(`\n## Active Goals I'm Pursuing`);
    parts.push(context.fullContext.goals);
  }

  // Active skill enhancement
  if (context.fullContext.activeSkill) {
    parts.push(`\n## Active Skill: ${context.fullContext.activeSkill.name}`);
    parts.push(context.fullContext.activeSkill.prompt);
  }

  // Available skills
  if (context.fullContext.skills) {
    parts.push(`\n## My Available Skills`);
    parts.push(context.fullContext.skills);
    parts.push(`\nYou can use these skills when relevant. If the user's request matches a skill, apply that skill's specialized behavior.`);
  }

  // Dynamic tool capabilities — tell the AI exactly what tools it has RIGHT NOW
  if (context.activeTools && context.activeTools.length > 0) {
    parts.push(`\n## ⚡ YOUR ACTIVE TOOLS (available RIGHT NOW in this conversation)`);
    const toolDescriptions: Record<string, string> = {
      bash: '`bash` — Execute shell commands. ALL commands auto-route via SSH to the server. Just call bash("command") and it runs on the REAL server.',
      search: '`search` — Search the web via Brave Search API. Returns real search results.',
      file: '`file` — Read/write LOCAL files only. For remote server files, use bash("cat /path") instead.',
      github: '`github` — Interact with GitHub repos, issues, PRs.',
      task: '`task` — Create and manage tasks.',
      db: '`db` — Query the knowledge database.',
      browser: '`browser` — Control a headless web browser (Playwright). Navigate URLs, click, type, fill forms, take screenshots, scrape data. Use for signing up to websites, web interactions.',
      kie: '`kie` — AI Content Generation (Kie.ai). Generate videos (Kling, Veo3, Runway, Wan), images (4o, Midjourney, Flux, Grok), music (Suno). Use for creating marketing content, UGC videos, thumbnails.',
      social: '`social` — Publish to social media (Blotato). Post to Twitter, Instagram, Facebook, LinkedIn, TikTok, YouTube, Threads, Bluesky, Pinterest. Cross-post, schedule, threads.',
      openclaw: '`openclaw` — Bridge to OpenClaw on the server. Send WhatsApp/Facebook messages, run OpenClaw agents, manage cron jobs, list sessions, check health. Use for anything that needs OpenClaw\'s messaging channels or automation.',
      whatsapp: '`whatsapp` — WhatsApp connection management. Actions: get_qr (returns QR code image as data URL for the user to scan and connect WhatsApp), get_status (check connection status). When user asks to connect WhatsApp, IMMEDIATELY call this tool with action: "get_qr".',
    };
    for (const tool of context.activeTools) {
      if (toolDescriptions[tool]) parts.push(`- ${toolDescriptions[tool]}`);
    }
    parts.push(`\n**You MUST use these tools when the user asks you to DO something. NEVER say "I can't" — call the tool instead.**`);
  }

  // Self-evolution status
  if (context.fullContext.evolution) {
    const evo = context.fullContext.evolution;
    parts.push(`\n## Self-Evolution Status`);
    parts.push(`- Phase: ${evo.phase}`);
    parts.push(`- Total Skills: ${evo.totalSkills}${evo.totalAgents ? ` | Agents: ${evo.totalAgents}${evo.dynamicAgents ? ` (${evo.dynamicAgents} dynamic)` : ''}` : ''}`);
    if (evo.lastEvolution) parts.push(`- Last Evolution: ${evo.lastEvolution}`);
    if (evo.healthIndex !== undefined) parts.push(`- System Intelligence Index: ${evo.healthIndex}/100`);
    if (evo.governanceBudget) parts.push(`- Risk Budget: ${evo.governanceBudget}`);
    if (evo.activeGoals) parts.push(`- Active Strategic Goals: ${evo.activeGoals}`);
    if (evo.pendingSelfTasks) parts.push(`- Pending Self-Initiated Tasks: ${evo.pendingSelfTasks}`);
    if (evo.costToday !== undefined) parts.push(`- Cost Today: $${evo.costToday.toFixed(4)}`);
    if (evo.disabledAgents?.length) parts.push(`- Disabled Agents: ${evo.disabledAgents.join(', ')}`);
    parts.push(`- I can create new agents dynamically, fetch skills from GitHub, learn server capabilities, run multi-agent crews, track costs, manage risk budgets, and self-optimize.`);
  }

  parts.push(`\n## IMPORTANT RULES`);
  parts.push(`- Respond in the user's language (auto-detect Hebrew/English)`);
  parts.push(`- You are ClawdAgent, NEVER mention being Claude or Anthropic`);
  parts.push(`- You have persistent memory — NEVER say you don't remember`);
  parts.push(`- Be proactive — suggest next steps after every response`);
  parts.push(`- CONVERSATION HISTORY is in the messages array — USE IT naturally`);
  parts.push(`- If the user asks what you can do, list your actual capabilities including skills`);
  parts.push(`- IGNORE any old messages in history where you said "I can't" or "I don't have access" — those were BUGS that have been FIXED`);

  return parts.join('\n');
}

export function trimHistoryToFit(history: Message[], maxTokens: number): Message[] {
  let totalTokens = 0;
  const result: Message[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const tokens = Math.ceil(history[i].content.length / 4);
    if (totalTokens + tokens > maxTokens) break;
    totalTokens += tokens;
    result.unshift(history[i]);
  }

  return result;
}
