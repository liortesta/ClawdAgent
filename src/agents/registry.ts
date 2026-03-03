import { AgentDefinition } from './types.js';
import { serverManagerPrompt } from './prompts/server-manager.js';
import { codeAssistantPrompt } from './prompts/code-assistant.js';
import { researcherPrompt } from './prompts/researcher.js';
import { taskPlannerPrompt } from './prompts/task-planner.js';
import { generalPrompt } from './prompts/general.js';
import { securityGuardPrompt } from './prompts/security-guard.js';
import { desktopAgentPrompt } from './prompts/desktop-agent.js';
import { projectBuilderPrompt } from './prompts/project-builder.js';
import { webAgentPrompt } from './prompts/web-agent.js';
import { contentCreatorPrompt } from './prompts/content-creator.js';
import { orchestratorPrompt } from './prompts/orchestrator-agent.js';
import { deviceAgentPrompt } from './prompts/device-agent.js';
import { cryptoTraderPrompt } from './prompts/crypto-trader.js';
import { cryptoAnalystPrompt } from './prompts/crypto-analyst.js';
import { marketMakerPrompt } from './prompts/market-maker.js';
import { strategyLabPrompt } from './prompts/strategy-lab.js';
import { aiAppBuilderPrompt } from './prompts/ai-app-builder.js';
import { mrrStrategistPrompt } from './prompts/mrr-strategist.js';
import { voiceAgentPrompt } from './prompts/voice-agent.js';

const agents: Map<string, AgentDefinition> = new Map();

function register(agent: AgentDefinition) { agents.set(agent.id, agent); }

register({ id: 'server-manager', name: 'Server Manager', description: 'Manages servers via SSH — multi-server sessions, auto-discovery, health monitoring, cross-server workflows.', systemPrompt: serverManagerPrompt, model: 'dynamic', preferredOllamaModel: 'deepseek-v3.1', tools: ['bash', 'ssh', 'docker', 'openclaw', 'deploy', 'memory'], maxTokens: 4096, temperature: 0.3, maxToolIterations: 20 });
register({ id: 'code-assistant', name: 'Code Assistant', description: 'Writes, fixes, and reviews code. Creates GitHub PRs and issues.', systemPrompt: codeAssistantPrompt, model: 'dynamic', preferredOllamaModel: 'qwen3-coder-next', tools: ['github', 'file', 'bash', 'memory'], maxTokens: 8192, temperature: 0.5, maxToolIterations: 15 });
register({ id: 'researcher', name: 'Researcher', description: 'Searches the web, answers questions, summarizes information. Can scrape any site, find APIs, and run scrapers.', systemPrompt: researcherPrompt, model: 'dynamic', preferredOllamaModel: 'deepseek-v3.1', tools: ['search', 'scrape', 'browser', 'memory', 'firecrawl', 'rapidapi', 'apify', 'rag'], maxTokens: 4096, temperature: 0.7, maxToolIterations: 15 });
register({ id: 'task-planner', name: 'Task Planner', description: 'Creates, manages, and schedules tasks and reminders.', systemPrompt: taskPlannerPrompt, model: 'dynamic', preferredOllamaModel: 'minimax-m2.5', tools: ['task', 'reminder', 'cron', 'memory', 'workflow'], maxTokens: 2048, temperature: 0.5, maxToolIterations: 12 });
register({ id: 'general', name: 'General Assistant', description: 'Casual conversation, help, and general knowledge.', systemPrompt: generalPrompt, model: 'dynamic', preferredOllamaModel: 'minimax-m2.5', tools: ['bash', 'search', 'file', 'cron', 'memory', 'email', 'analytics', 'claude-code', 'social', 'kie', 'workflow', 'rag', 'whatsapp', 'deploy'], maxTokens: 8192, temperature: 0.5, maxToolIterations: 12 });
register({ id: 'security-guard', name: 'Security Guard', description: 'Reviews commands and actions for security risks before execution.', systemPrompt: securityGuardPrompt, model: 'dynamic', preferredOllamaModel: 'kimi-k2.5', tools: [], maxTokens: 1024, temperature: 0.1 });
register({ id: 'desktop-controller', name: 'Desktop Controller', description: 'Controls the computer — mouse, keyboard, screenshots, app control via AI vision.', systemPrompt: desktopAgentPrompt, model: 'dynamic', preferredOllamaModel: 'minimax-m2.5', tools: ['desktop', 'memory'], maxTokens: 4096, temperature: 0.3, maxToolIterations: 10 });
register({ id: 'project-builder', name: 'Project Builder', description: 'Scaffolds, builds, dockerizes, and deploys full applications autonomously.', systemPrompt: projectBuilderPrompt, model: 'dynamic', preferredOllamaModel: 'qwen3-coder-next', tools: ['bash', 'file', 'docker', 'deploy', 'memory'], maxTokens: 8192, temperature: 0.4, maxToolIterations: 20 });
register({ id: 'web-agent', name: 'Web Agent', description: 'Signs up for websites, fills forms, scrapes data, web UI interaction via visual browser. Facebook, Twitter/X, and LinkedIn account management and autonomous agents. Sessions appear in Browser View — users can watch the agent work in real time via VNC.', systemPrompt: webAgentPrompt, model: 'dynamic', preferredOllamaModel: 'kimi-k2.5', tools: ['browser', 'facebook', 'twitter', 'linkedin', 'tiktok', 'bash', 'search', 'file', 'memory'], maxTokens: 4096, temperature: 0.3, maxToolIterations: 15 });
register({ id: 'content-creator', name: 'Content Creator', description: 'Creates AI videos, images, music, podcasts, UGC Factory, and publishes everywhere.', systemPrompt: contentCreatorPrompt, model: 'dynamic', preferredOllamaModel: 'kimi-k2.5', tools: ['kie', 'social', 'elevenlabs', 'bash', 'search', 'file', 'memory', 'workflow'], maxTokens: 4096, temperature: 0.7, maxToolIterations: 20 });
register({ id: 'orchestrator', name: 'Orchestrator', description: 'Manages both ClawdAgent and OpenClaw, delegates tasks, content pipeline, site analysis, self-resourceful — finds and uses tools automatically.', systemPrompt: orchestratorPrompt, model: 'dynamic', preferredOllamaModel: 'glm5', tools: ['openclaw', 'kie', 'social', 'elevenlabs', 'firecrawl', 'rapidapi', 'apify', 'bash', 'ssh', 'search', 'db', 'cron', 'memory', 'auto', 'email', 'workflow', 'analytics', 'rag', 'trading'], maxTokens: 4096, temperature: 0.4, maxToolIterations: 20 });
register({ id: 'device-controller', name: 'Device Controller', description: 'Controls Android phones — tap, swipe, type, screenshot, app automation via ADB and Appium.', systemPrompt: deviceAgentPrompt, model: 'dynamic', preferredOllamaModel: 'minimax-m2.5', tools: ['device', 'memory'], maxTokens: 4096, temperature: 0.3, maxToolIterations: 10 });
register({ id: 'crypto-trader', name: 'Crypto Trader', description: 'Executes crypto trades, manages positions, enforces risk rules. Paper trading by default.', systemPrompt: cryptoTraderPrompt, model: 'dynamic', preferredOllamaModel: 'qwen3-next', tools: ['trading', 'memory', 'cron'], maxTokens: 4096, temperature: 0.2, maxToolIterations: 15 });
register({ id: 'crypto-analyst', name: 'Crypto Analyst', description: 'Technical analysis, signals, market scanning, crypto research.', systemPrompt: cryptoAnalystPrompt, model: 'dynamic', preferredOllamaModel: 'qwen3-next', tools: ['trading', 'search', 'memory'], maxTokens: 4096, temperature: 0.5, maxToolIterations: 15 });
register({ id: 'market-maker', name: 'Market Maker', description: 'Two-sided quoting, spread capture, inventory management, adverse selection protection. Paper trading by default.', systemPrompt: marketMakerPrompt, model: 'dynamic', preferredOllamaModel: 'qwen3-next', tools: ['trading', 'memory', 'cron'], maxTokens: 4096, temperature: 0.2, maxToolIterations: 20 });
register({ id: 'strategy-lab', name: 'Strategy Lab', description: 'R&D agent — designs, backtests, and validates new trading strategies with walk-forward optimization.', systemPrompt: strategyLabPrompt, model: 'dynamic', preferredOllamaModel: 'glm5', tools: ['trading', 'search', 'memory'], maxTokens: 8192, temperature: 0.5, maxToolIterations: 20 });
register({ id: 'ai-app-builder', name: 'AI App Builder', description: 'Builds complete revenue-generating AI applications from scratch — market validation via TrustMRR, full-stack development, Stripe payments, deployment, and launch automation.', systemPrompt: aiAppBuilderPrompt, model: 'dynamic', preferredOllamaModel: 'qwen3-coder-next', tools: ['bash', 'file', 'search', 'browser', 'github', 'docker', 'deploy', 'kie', 'social', 'memory', 'firecrawl'], maxTokens: 8192, temperature: 0.4, maxToolIterations: 25 });
register({ id: 'mrr-strategist', name: 'MRR Strategist', description: 'Revenue strategy agent — deep market research via TrustMRR, financial modeling, pricing optimization, competitive intelligence, growth planning, and churn prevention for AI/SaaS products.', systemPrompt: mrrStrategistPrompt, model: 'dynamic', preferredOllamaModel: 'deepseek-v3.1', tools: ['search', 'browser', 'firecrawl', 'file', 'memory', 'analytics', 'social', 'email'], maxTokens: 8192, temperature: 0.5, maxToolIterations: 20 });
register({ id: 'voice-agent', name: 'Voice Agent', description: 'Makes and receives phone calls with AI voice via Twilio + OpenAI Realtime. Call tracking, voice configuration, real-time conversation.', systemPrompt: voiceAgentPrompt, model: 'dynamic', preferredOllamaModel: 'minimax-m2.5', tools: ['voice', 'memory'], maxTokens: 4096, temperature: 0.3, maxToolIterations: 10 });

export function getAgent(id: string): AgentDefinition | undefined { return agents.get(id); }
export function getAllAgents(): AgentDefinition[] { return Array.from(agents.values()); }
export function getAgentIds(): string[] { return Array.from(agents.keys()); }
export function hasAgent(id: string): boolean { return agents.has(id); }

/** Register a new agent at runtime (for dynamic agent creation) */
export function registerAgent(agent: AgentDefinition): void {
  agents.set(agent.id, agent);
}

/** Unregister a dynamic agent */
export function unregisterAgent(id: string): boolean {
  return agents.delete(id);
}

export { type AgentDefinition } from './types.js';
