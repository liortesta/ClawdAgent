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

const agents: Map<string, AgentDefinition> = new Map();

function register(agent: AgentDefinition) { agents.set(agent.id, agent); }

register({ id: 'server-manager', name: 'Server Manager', description: 'Manages servers via SSH, Docker, monitoring, and auto-fix', systemPrompt: serverManagerPrompt, model: 'dynamic', tools: ['bash', 'ssh', 'docker', 'openclaw', 'memory'], maxTokens: 4096, temperature: 0.3 });
register({ id: 'code-assistant', name: 'Code Assistant', description: 'Writes, fixes, and reviews code. Creates GitHub PRs and issues.', systemPrompt: codeAssistantPrompt, model: 'dynamic', tools: ['github', 'file', 'bash', 'memory'], maxTokens: 8192, temperature: 0.5 });
register({ id: 'researcher', name: 'Researcher', description: 'Searches the web, answers questions, summarizes information. Can scrape any site, find APIs, and run scrapers.', systemPrompt: researcherPrompt, model: 'dynamic', tools: ['search', 'scrape', 'browser', 'memory', 'firecrawl', 'rapidapi', 'apify'], maxTokens: 4096, temperature: 0.7 });
register({ id: 'task-planner', name: 'Task Planner', description: 'Creates, manages, and schedules tasks and reminders.', systemPrompt: taskPlannerPrompt, model: 'dynamic', tools: ['task', 'reminder', 'cron', 'memory', 'workflow'], maxTokens: 2048, temperature: 0.5 });
register({ id: 'general', name: 'General Assistant', description: 'Casual conversation, help, and general knowledge.', systemPrompt: generalPrompt, model: 'dynamic', tools: ['bash', 'search', 'file', 'cron', 'memory', 'email', 'analytics', 'claude-code', 'social', 'kie', 'workflow'], maxTokens: 4096, temperature: 0.5 });
register({ id: 'security-guard', name: 'Security Guard', description: 'Reviews commands and actions for security risks before execution.', systemPrompt: securityGuardPrompt, model: 'dynamic', tools: [], maxTokens: 1024, temperature: 0.1 });
register({ id: 'desktop-controller', name: 'Desktop Controller', description: 'Controls the computer — mouse, keyboard, screenshots, app control via AI vision.', systemPrompt: desktopAgentPrompt, model: 'dynamic', tools: ['desktop', 'memory'], maxTokens: 4096, temperature: 0.3 });
register({ id: 'project-builder', name: 'Project Builder', description: 'Scaffolds, builds, dockerizes, and deploys full applications autonomously.', systemPrompt: projectBuilderPrompt, model: 'dynamic', tools: ['bash', 'file', 'docker', 'memory'], maxTokens: 8192, temperature: 0.4 });
register({ id: 'web-agent', name: 'Web Agent', description: 'Signs up for websites, fills forms, scrapes data, web UI interaction via headless browser.', systemPrompt: webAgentPrompt, model: 'dynamic', tools: ['browser', 'bash', 'search', 'file', 'memory'], maxTokens: 4096, temperature: 0.3 });
register({ id: 'content-creator', name: 'Content Creator', description: 'Creates AI videos, images, music, podcasts, TTS, and publishes everywhere.', systemPrompt: contentCreatorPrompt, model: 'dynamic', tools: ['kie', 'social', 'elevenlabs', 'bash', 'search', 'file', 'memory', 'workflow'], maxTokens: 4096, temperature: 0.7, maxToolIterations: 12 });
register({ id: 'orchestrator', name: 'Orchestrator', description: 'Manages both ClawdAgent and OpenClaw, delegates tasks, content pipeline, self-resourceful — finds and uses tools automatically.', systemPrompt: orchestratorPrompt, model: 'dynamic', tools: ['openclaw', 'kie', 'social', 'elevenlabs', 'firecrawl', 'rapidapi', 'apify', 'bash', 'search', 'db', 'cron', 'memory', 'auto', 'email', 'workflow', 'analytics'], maxTokens: 4096, temperature: 0.4, maxToolIterations: 12 });
register({ id: 'device-controller', name: 'Device Controller', description: 'Controls Android phones — tap, swipe, type, screenshot, app automation via ADB and Appium.', systemPrompt: deviceAgentPrompt, model: 'dynamic', tools: ['device', 'memory'], maxTokens: 4096, temperature: 0.3 });

export function getAgent(id: string): AgentDefinition | undefined { return agents.get(id); }
export function getAllAgents(): AgentDefinition[] { return Array.from(agents.values()); }
export { type AgentDefinition } from './types.js';
