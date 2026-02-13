import { Router } from 'express';
import os from 'os';
import { getDashboardData, isBridgeReady } from '../../../core/intelligence-bridge.js';
import { getAllAgents } from '../../../agents/registry.js';
import type { Skill } from '../../../core/skills-engine.js';
import type { ModelOption } from '../../../core/model-router.js';

// In-memory activity log (capped at 50 entries)
const activityLog: Array<{ time: string; type: string; message: string; agent?: string; platform?: string }> = [];

export function pushActivity(type: string, message: string, meta?: { agent?: string; platform?: string }) {
  activityLog.unshift({ time: new Date().toISOString(), type, message, ...meta });
  if (activityLog.length > 50) activityLog.length = 50;
}

export function setupDashboardRoutes(deps: {
  getUptime: () => number;
  getCronTasks: () => any[];
  getUsageSummary: () => any;
  getWorkflowCount: () => number;
  getMcpInfo: () => { servers: number; tools: number };
  getSkills?: () => Skill[];
  getModels?: () => ModelOption[];
  getProviders?: () => string[];
  getMcpServers?: () => Array<{ id: string; tools?: string[] }>;
  getSSHServers?: () => Array<{ id: string; name?: string; host: string; status?: string }>;
}): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const mem = process.memoryUsage();
    const cpus = os.cpus();
    const cpuUsage = cpus.length > 0
      ? Math.round(cpus.reduce((acc, cpu) => {
          const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
          return acc + (1 - cpu.times.idle / total) * 100;
        }, 0) / cpus.length)
      : 0;
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const freeMem = Math.round(os.freemem() / 1024 / 1024);

    res.json({
      status: 'online',
      uptime: deps.getUptime(),
      memory: {
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        rss: Math.round(mem.rss / 1024 / 1024),
      },
      system: {
        cpuPercent: cpuUsage,
        memUsedMB: totalMem - freeMem,
        memTotalMB: totalMem,
        memPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
        platform: os.platform(),
        hostname: os.hostname(),
      },
      mcp: deps.getMcpInfo(),
      workflows: deps.getWorkflowCount(),
    });
  });

  router.get('/costs', (_req, res) => {
    res.json(deps.getUsageSummary());
  });

  router.get('/cron', (_req, res) => {
    res.json(deps.getCronTasks());
  });

  // GET /api/dashboard/activity — recent activity feed
  router.get('/activity', (_req, res) => {
    res.json(activityLog.slice(0, 20));
  });

  // GET /api/dashboard/intelligence — full intelligence subsystem data
  router.get('/intelligence', (_req, res) => {
    if (!isBridgeReady()) {
      res.json({ ready: false, message: 'Intelligence bridge not initialized' });
      return;
    }
    res.json({ ready: true, ...getDashboardData() });
  });

  // GET /api/dashboard/graph — network graph data (agents, tools, skills, subsystems)
  router.get('/graph', (_req, res) => {
    const agents = getAllAgents();

    // Collect unique tools and which agents use them
    const toolAgents = new Map<string, string[]>();
    for (const a of agents) {
      for (const t of a.tools) {
        if (!toolAgents.has(t)) toolAgents.set(t, []);
        toolAgents.get(t)!.push(a.name);
      }
    }

    // Intelligence subsystems with descriptions
    const subsystems = [
      { id: 'scorer', name: 'Intelligence Scorer', desc: 'Scores agent and tool performance based on success rate, latency, and cost.' },
      { id: 'memory-hierarchy', name: 'Memory Hierarchy', desc: 'Stores experiences, failure patterns, and learned workflows across sessions.' },
      { id: 'governance', name: 'Governance Engine', desc: 'Risk budget enforcement, approval gates, and operational limits.' },
      { id: 'cost-intel', name: 'Cost Intelligence', desc: 'Tracks cost per workflow, agent ROI, and budget forecasting.' },
      { id: 'model-router', name: 'Adaptive Model Router', desc: 'Benchmarks and selects optimal AI models per task type.' },
      { id: 'observability', name: 'Observability Layer', desc: 'System health monitoring, event timeline, error clustering.' },
      { id: 'goal-engine', name: 'Autonomous Goals', desc: 'Self-initiated goal generation from KPI monitoring and triggers.' },
      { id: 'safety-sim', name: 'Safety Simulator', desc: 'Pre-checks commands for safety risk before execution.' },
      { id: 'feedback-loop', name: 'Feedback Loop', desc: 'Pattern recognition, prompt optimization, and workflow promotion.' },
    ];

    // Evolution & self-improvement subsystems
    const evolutionSystems = [
      { id: 'evolution-engine', name: 'Evolution Engine', desc: 'Central self-improvement brain — gather, analyze, plan, execute, validate cycles.' },
      { id: 'agent-factory', name: 'Agent Factory', desc: 'Creates agents dynamically from needs, skills, templates, or discovered capabilities.' },
      { id: 'crew-orchestrator', name: 'Crew Orchestrator', desc: 'Multi-agent coordination — sequential, hierarchical, and ensemble modes.' },
      { id: 'skill-fetcher', name: 'Skill Fetcher', desc: 'Discovers and imports skills from GitHub and OpenClaw with AI safety review.' },
      { id: 'capability-learner', name: 'Capability Learner', desc: 'Learns capabilities from SSH servers and MCP tools, creates specialized agents.' },
      { id: 'self-repair', name: 'Self-Repair System', desc: 'Three-tier error recovery: known fixes, AI diagnosis, and meta-agent replanning.' },
      { id: 'meta-agent', name: 'Meta Agent', desc: 'Chain-of-thought reasoning, self-reflection, and learning from failures.' },
    ];

    interface GNode { id: string; name: string; group: string; val?: number; desc?: string; details?: Record<string, unknown> }
    interface GLink { source: string; target: string; type: string }
    const nodes: GNode[] = [];
    const links: GLink[] = [];

    // Core engine node
    nodes.push({ id: 'engine', name: 'ClawdAgent Engine', group: 'core', val: 8, desc: 'Central orchestration engine — routes messages, manages agents, and coordinates all subsystems.', details: { agents: agents.length, tools: toolAgents.size, subsystems: subsystems.length } });

    // Agent nodes with descriptions and tool lists
    for (const a of agents) {
      nodes.push({ id: `agent:${a.id}`, name: a.name, group: 'agent', val: 3 + a.tools.length * 0.5, desc: a.description, details: { tools: a.tools, temperature: a.temperature, maxTokens: a.maxTokens } });
      links.push({ source: 'engine', target: `agent:${a.id}`, type: 'manages' });
    }

    // Tool nodes with usage info
    for (const [t, usedBy] of toolAgents) {
      nodes.push({ id: `tool:${t}`, name: t, group: 'tool', val: 1.5 + usedBy.length * 0.3, desc: `Used by ${usedBy.length} agent${usedBy.length > 1 ? 's' : ''}.`, details: { usedBy } });
    }

    // Agent → Tool links
    for (const a of agents) {
      for (const t of a.tools) {
        links.push({ source: `agent:${a.id}`, target: `tool:${t}`, type: 'uses' });
      }
    }

    // Intelligence subsystem nodes
    for (const s of subsystems) {
      nodes.push({ id: `intel:${s.id}`, name: s.name, group: 'intelligence', val: 3, desc: s.desc });
      links.push({ source: 'engine', target: `intel:${s.id}`, type: 'powers' });
    }

    // Intelligence cross-links
    links.push({ source: 'intel:scorer', target: 'intel:feedback-loop', type: 'feeds' });
    links.push({ source: 'intel:observability', target: 'intel:scorer', type: 'feeds' });
    links.push({ source: 'intel:goal-engine', target: 'intel:governance', type: 'requests' });
    links.push({ source: 'intel:safety-sim', target: 'intel:governance', type: 'validates' });
    links.push({ source: 'intel:cost-intel', target: 'intel:model-router', type: 'informs' });
    links.push({ source: 'intel:feedback-loop', target: 'intel:memory-hierarchy', type: 'stores' });

    // Evolution subsystem nodes
    for (const evo of evolutionSystems) {
      nodes.push({ id: `evo:${evo.id}`, name: evo.name, group: 'evolution', val: 3.5, desc: evo.desc });
      links.push({ source: 'engine', target: `evo:${evo.id}`, type: 'evolves-with' });
    }

    // Evolution cross-links
    links.push({ source: 'evo:evolution-engine', target: 'evo:agent-factory', type: 'creates-via' });
    links.push({ source: 'evo:evolution-engine', target: 'evo:skill-fetcher', type: 'fetches-via' });
    links.push({ source: 'evo:evolution-engine', target: 'evo:capability-learner', type: 'learns-via' });
    links.push({ source: 'evo:evolution-engine', target: 'evo:self-repair', type: 'heals-via' });
    links.push({ source: 'evo:evolution-engine', target: 'evo:meta-agent', type: 'reasons-via' });
    links.push({ source: 'evo:crew-orchestrator', target: 'evo:agent-factory', type: 'spawns-from' });
    links.push({ source: 'evo:self-repair', target: 'intel:observability', type: 'monitors' });
    links.push({ source: 'evo:meta-agent', target: 'intel:memory-hierarchy', type: 'reflects-on' });
    links.push({ source: 'evo:agent-factory', target: 'intel:scorer', type: 'evaluates-with' });
    links.push({ source: 'evo:skill-fetcher', target: 'intel:governance', type: 'reviews-with' });
    links.push({ source: 'evo:capability-learner', target: 'evo:agent-factory', type: 'suggests-to' });
    links.push({ source: 'intel:feedback-loop', target: 'evo:evolution-engine', type: 'triggers' });
    links.push({ source: 'intel:goal-engine', target: 'evo:evolution-engine', type: 'drives' });

    // Agent team hierarchy links
    const orchestratorId = agents.find(a => a.id === 'orchestrator') ? 'agent:orchestrator' : null;
    if (orchestratorId) {
      for (const a of agents) {
        if (a.id !== 'orchestrator') {
          links.push({ source: orchestratorId, target: `agent:${a.id}`, type: 'delegates-to' });
        }
      }
    }
    // Crypto trading team internal links
    const cryptoTeam = ['crypto-trader', 'crypto-analyst', 'market-maker', 'strategy-lab'];
    for (let i = 0; i < cryptoTeam.length; i++) {
      for (let j = i + 1; j < cryptoTeam.length; j++) {
        if (agents.some(a => a.id === cryptoTeam[i]) && agents.some(a => a.id === cryptoTeam[j])) {
          links.push({ source: `agent:${cryptoTeam[i]}`, target: `agent:${cryptoTeam[j]}`, type: 'collaborates' });
        }
      }
    }

    // Skills — dynamically loaded from skills engine
    const allSkills = deps.getSkills?.() ?? [];
    for (const sk of allSkills) {
      nodes.push({ id: `skill:${sk.id}`, name: sk.name, group: 'skill', val: 1.5, desc: sk.description, details: { trigger: sk.trigger, source: sk.source, examples: sk.examples } });
      links.push({ source: 'engine', target: `skill:${sk.id}`, type: 'knows' });
    }

    // Agent ↔ Skill domain connections (match skills to agents by domain)
    const skillAgentMap: Record<string, string[]> = {
      'crypto-': ['crypto-trader', 'crypto-analyst', 'market-maker', 'strategy-lab'],
      'market-': ['crypto-analyst', 'market-maker', 'strategy-lab'],
      'defi-': ['crypto-trader', 'market-maker'],
      'execution-': ['crypto-trader', 'market-maker'],
      'portfolio-': ['crypto-trader', 'crypto-analyst'],
      'adaptive-learning': ['strategy-lab'],
      'cross-chain': ['crypto-trader', 'market-maker'],
      'security-': ['security-guard'],
      'enterprise-compliance': ['security-guard'],
      'osint-': ['researcher'],
      'social-media': ['content-creator'],
      'growth-marketing': ['content-creator', 'orchestrator'],
      'competitor-': ['researcher'],
      'mrr-': ['researcher', 'orchestrator'],
      'saas-': ['orchestrator'],
      'api-': ['code-assistant', 'project-builder'],
      'rtl-hebrew': ['code-assistant', 'project-builder'],
      'skill-creator': ['orchestrator'],
      'agent-coordination': ['orchestrator'],
      'huggingface': ['researcher', 'code-assistant'],
      'multi-database': ['code-assistant', 'server-manager'],
    };
    for (const sk of allSkills) {
      for (const [prefix, agentIds] of Object.entries(skillAgentMap)) {
        if (sk.id.startsWith(prefix) || sk.id === prefix) {
          for (const agentId of agentIds) {
            if (agents.some(a => a.id === agentId)) {
              links.push({ source: `agent:${agentId}`, target: `skill:${sk.id}`, type: 'applies' });
            }
          }
        }
      }
    }

    // AI Models & Providers — shows the full model roster
    const providers = deps.getProviders?.() ?? [];
    const models = deps.getModels?.() ?? [];
    // Group models by provider for cleaner visualization
    const providerSet = new Set<string>();
    for (const m of models) providerSet.add(m.provider);
    for (const p of providers) providerSet.add(p);
    for (const prov of providerSet) {
      const provModels = models.filter(m => m.provider === prov);
      nodes.push({
        id: `provider:${prov}`, name: prov.charAt(0).toUpperCase() + prov.slice(1), group: 'provider',
        val: 3 + provModels.length * 0.5,
        desc: `AI provider with ${provModels.length} model${provModels.length !== 1 ? 's' : ''}.`,
        details: { models: provModels.map(m => m.name), available: providers.includes(prov) },
      });
      links.push({ source: 'engine', target: `provider:${prov}`, type: 'routes-to' });
    }
    for (const m of models) {
      nodes.push({
        id: `model:${m.id}`, name: m.name, group: 'model', val: 1.5,
        desc: `${m.tier} tier | ${m.maxContext.toLocaleString()} ctx | ${m.strengths.join(', ')}`,
        details: { tier: m.tier, maxContext: m.maxContext, tools: m.supportsTools, hebrew: m.supportsHebrew, vision: m.supportsVision, cost: { input: m.costPer1kInput, output: m.costPer1kOutput } },
      });
      links.push({ source: `provider:${m.provider}`, target: `model:${m.id}`, type: 'serves' });
    }
    // Link model router intelligence subsystem to providers
    if (providerSet.size > 0) {
      links.push({ source: 'intel:model-router', target: `provider:${[...providerSet][0]}`, type: 'selects' });
    }

    // MCP Servers — external tool servers connected via Model Context Protocol
    const mcpServers = deps.getMcpServers?.() ?? [];
    for (const mcp of mcpServers) {
      const toolCount = mcp.tools?.length ?? 0;
      nodes.push({
        id: `mcp:${mcp.id}`, name: mcp.id, group: 'mcp', val: 2 + toolCount * 0.3,
        desc: `MCP server providing ${toolCount} tool${toolCount !== 1 ? 's' : ''}.`,
        details: { tools: mcp.tools },
      });
      links.push({ source: 'engine', target: `mcp:${mcp.id}`, type: 'connects' });
    }

    // VPS / SSH Servers — remote servers managed via SSH
    const sshServers = deps.getSSHServers?.() ?? [];
    for (const srv of sshServers) {
      nodes.push({
        id: `vps:${srv.id}`, name: srv.name ?? srv.id, group: 'vps', val: 2.5,
        desc: `SSH server at ${srv.host}${srv.status ? ` (${srv.status})` : ''}.`,
        details: { host: srv.host, status: srv.status },
      });
      links.push({ source: 'engine', target: `vps:${srv.id}`, type: 'manages' });
    }

    res.json({ nodes, links });
  });

  router.get('/containers', async (_req, res) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync('docker ps --format "{{.ID}}\\t{{.Names}}\\t{{.Status}}\\t{{.Image}}\\t{{.Ports}}"');
      const containers = stdout.trim().split('\n').filter(Boolean).map(line => {
        const [id, name, status, image, ports] = line.split('\t');
        return { id, name, status, image, ports };
      });
      res.json(containers);
    } catch { res.json([]); }
  });

  return router;
}
