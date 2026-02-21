import { Router } from 'express';
import os from 'os';
import { sql } from 'drizzle-orm';
import { getDashboardData, isBridgeReady } from '../../../core/intelligence-bridge.js';
import { getAllAgents } from '../../../agents/registry.js';
import { checkOllamaModels, getAgentModelMapping, OLLAMA_MODELS } from '../../../core/ollama-model-registry.js';
import { getDb } from '../../../memory/database.js';
import { usageLogs, messages, tasks } from '../../../memory/schema.js';
import { getApprovalGate } from '../../../core/approval-gate.js';
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

  // GET /api/dashboard/models — Ollama model status + agent mappings
  router.get('/models', async (_req, res) => {
    try {
      const ollamaStatus = await checkOllamaModels('http://localhost:11434');
      const agentMapping = getAgentModelMapping();
      const providers = deps.getProviders?.() ?? [];

      res.json({
        ollama: {
          available: ollamaStatus.available.length > 0,
          models: ollamaStatus.available,
          missing: ollamaStatus.missing,
          totalRegistered: OLLAMA_MODELS.length,
        },
        cloud: {
          anthropic: providers.includes('anthropic'),
          openrouter: providers.includes('openrouter'),
          claudeCode: providers.includes('claude-code'),
        },
        agentMapping,
      });
    } catch (err: any) {
      res.json({
        ollama: { available: false, models: [], missing: [], error: err.message },
        cloud: { anthropic: false, openrouter: false, claudeCode: false },
        agentMapping: [],
      });
    }
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

  // GET /api/dashboard/kanban — task board grouped by status
  router.get('/kanban', async (_req, res) => {
    try {
      const db = getDb();
      const allTasks = await db
        .select()
        .from(tasks)
        .orderBy(sql`${tasks.priority} ASC, ${tasks.createdAt} DESC`)
        .limit(100);

      const columns: Record<string, typeof allTasks> = {
        pending: [],
        'in-progress': [],
        done: [],
      };
      for (const t of allTasks) {
        const col = t.status === 'completed' ? 'done' : t.status === 'in-progress' ? 'in-progress' : 'pending';
        columns[col].push(t);
      }

      res.json({ columns, total: allTasks.length });
    } catch (err: any) {
      res.json({ columns: { pending: [], 'in-progress': [], done: [] }, total: 0, error: err.message });
    }
  });

  // GET /api/dashboard/heatmap — activity heatmap (7 days × 24 hours)
  router.get('/heatmap', async (_req, res) => {
    try {
      const db = getDb();
      // Query usage_logs grouped by day-of-week (0=Sun) and hour, last 4 weeks
      const rows: Array<{ dow: number; hour: number; count: number }> = await db
        .select({
          dow: sql<number>`EXTRACT(DOW FROM ${usageLogs.createdAt})`.as('dow'),
          hour: sql<number>`EXTRACT(HOUR FROM ${usageLogs.createdAt})`.as('hour'),
          count: sql<number>`COUNT(*)`.as('count'),
        })
        .from(usageLogs)
        .where(sql`${usageLogs.createdAt} >= NOW() - INTERVAL '4 weeks'`)
        .groupBy(
          sql`EXTRACT(DOW FROM ${usageLogs.createdAt})`,
          sql`EXTRACT(HOUR FROM ${usageLogs.createdAt})`,
        );

      // Build a 7×24 grid (default 0)
      const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
      for (const r of rows) {
        grid[Number(r.dow)][Number(r.hour)] = Number(r.count);
      }

      // If usage_logs is empty, fall back to messages table
      const total = rows.reduce((s, r) => s + Number(r.count), 0);
      if (total === 0) {
        const msgRows: Array<{ dow: number; hour: number; count: number }> = await db
          .select({
            dow: sql<number>`EXTRACT(DOW FROM ${messages.createdAt})`.as('dow'),
            hour: sql<number>`EXTRACT(HOUR FROM ${messages.createdAt})`.as('hour'),
            count: sql<number>`COUNT(*)`.as('count'),
          })
          .from(messages)
          .where(sql`${messages.createdAt} >= NOW() - INTERVAL '4 weeks'`)
          .groupBy(
            sql`EXTRACT(DOW FROM ${messages.createdAt})`,
            sql`EXTRACT(HOUR FROM ${messages.createdAt})`,
          );
        for (const r of msgRows) {
          grid[Number(r.dow)][Number(r.hour)] = Number(r.count);
        }
      }

      res.json({ grid, period: '4 weeks' });
    } catch (err: any) {
      // Return empty grid on error (e.g. DB not ready)
      res.json({ grid: Array.from({ length: 7 }, () => Array(24).fill(0)), period: '4 weeks', error: err.message });
    }
  });

  // ── Approval Gate endpoints ────────────────────────────────────────
  router.get('/approvals', (_req, res) => {
    const gate = getApprovalGate();
    res.json({ pending: gate.getPending(), stats: gate.getStats() });
  });

  router.get('/approvals/history', (_req, res) => {
    const gate = getApprovalGate();
    res.json(gate.getHistory());
  });

  router.post('/approvals/:id/approve', (req, res) => {
    const gate = getApprovalGate();
    const ok = gate.approve(req.params.id, 'web-admin');
    res.json({ ok, id: req.params.id, action: 'approved' });
  });

  router.post('/approvals/:id/deny', (req, res) => {
    const gate = getApprovalGate();
    const ok = gate.deny(req.params.id, 'web-admin');
    res.json({ ok, id: req.params.id, action: 'denied' });
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

  // GET /api/dashboard/promoter — auto-promoter stats
  router.get('/promoter', async (_req, res) => {
    try {
      const { getPromotionStats } = await import('../../../core/auto-promoter.js');
      res.json(getPromotionStats());
    } catch { res.json({ error: 'Promoter not initialized' }); }
  });

  // POST /api/dashboard/promoter/run — manually trigger promotion cycle
  router.post('/promoter/run', async (_req, res) => {
    try {
      const { runPromotionCycle } = await import('../../../core/auto-promoter.js');
      const result = await runPromotionCycle();
      pushActivity('promotion', result.split('\n')[0]);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
