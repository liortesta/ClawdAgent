import config from './config.js';
import logger from './utils/logger.js';
import { Engine } from './core/engine.js';
import { AIClient } from './core/ai-client.js';
import { Heartbeat } from './core/heartbeat.js';
import { SelfRepair, setSelfRepairAI } from './core/self-repair.js';
import { SelfImprove } from './core/self-improve.js';
import { ProactiveThinker } from './core/proactive-thinker.js';
import { setAutoToolDeps } from './agents/tools/auto-tool.js';
import { AutoUpgrade } from './core/auto-upgrade.js';
import type { MCPClient as _MCPClient } from './core/mcp-client.js';
import { MCPManager } from './core/mcp-manager.js';
import { CronEngine } from './core/cron-engine.js';
import { UsageTracker } from './core/usage-tracker.js';
import { WorkflowEngine } from './core/workflows.js';
import { RAGEngine } from './actions/rag/rag-engine.js';
import { setReminderSender } from './queue/jobs/reminder.js';
import { initDatabase, closeDatabase } from './memory/database.js';
import { initCache, closeCache } from './memory/cache.js';
import { startWorker } from './queue/worker.js';
import { startScheduler } from './queue/scheduler.js';
import { startInterfaces, stopInterfaces } from './interfaces/index.js';
import { findOrCreateUser, autoLinkUsers } from './memory/repositories/users.js';
import { getOrCreateConversation, getCrossPlatformSummary } from './memory/repositories/conversations.js';
import { saveMessage, getRecentMessages } from './memory/repositories/messages.js';
import { getUserKnowledge, learnFact, getKnowledgeCount } from './memory/repositories/knowledge.js';
import { getUserTasks, getOverdueTasks } from './memory/repositories/tasks.js';
import { getUserServers } from './memory/repositories/servers.js';
import { TelegramBot } from './interfaces/telegram/bot.js';
import { createWebhookTunnel, SSHTunnel } from './services/ssh-tunnel.js';
import { setCronToolEngine } from './agents/tools/cron-tool.js';
import { setWorkflowToolDeps } from './agents/tools/workflow-tool.js';
import { setAnalyticsToolDeps } from './agents/tools/analytics-tool.js';
import { setRAGEngineRef } from './agents/tools/rag-tool.js';
import { setClaudeCodeToolProvider } from './agents/tools/claude-code-tool.js';
import { setClaudeCodeSavingsGetter } from './agents/tools/analytics-tool.js';
import { initConfigFiles, loadMainConfig } from './core/config-loader.js';
import { BehaviorEngine } from './core/behavior-engine.js';
import { AgentQueueManager } from './core/agent-queue.js';
import { Updater } from './core/updater.js';
import { OpenClawSync } from './core/openclaw-sync.js';
import { PluginLoader } from './core/plugin-loader.js';
import { initKeyRotation, stopKeyRotation } from './security/key-rotation.js';
// Self-Evolution imports
import { SkillFetcher } from './core/skill-fetcher.js';
import { SkillsEngine } from './core/skills-engine.js';
import { AgentFactory } from './core/agent-factory.js';
import { CapabilityLearner } from './core/capability-learner.js';
import { CrewOrchestrator } from './core/crew-orchestrator.js';
import { EvolutionEngine } from './core/evolution-engine.js';
import { setPluginLoader, setToolCreator } from './core/tool-executor.js';
import { ToolCreator } from './core/tool-creator.js';
import { initBridge, runPeriodicIntelligence, isBridgeReady } from './core/intelligence-bridge.js';
import { registerPromoterCron, setPromoterAI } from './core/auto-promoter.js';
import type { Message } from './core/ai-client.js';
// BaseInterface type used in variable declarations below

// Cache platform ID → DB user ID mapping
const userIdCache = new Map<string, string>();

/**
 * Promote mature patterns from FeedbackLoop into real Skills.
 * Called after every evolution cycle. Patterns that recur 5+ times
 * get turned into learned skills so the agent improves permanently.
 */
async function promoteReadyPatterns(
  evolution: EvolutionEngine,
  aiClient: AIClient,
  skillsEngine: SkillsEngine,
): Promise<number> {
  const feedback = evolution.getFeedbackLoop();
  const candidates = feedback.getPromotionCandidates();
  if (candidates.length === 0) return 0;

  let promoted = 0;
  for (const pattern of candidates) {
    try {
      const response = await aiClient.chat({
        systemPrompt: `You are a skill designer. Given a recurring pattern, create a reusable skill definition.
Return ONLY valid JSON: {"name": "...", "description": "...", "trigger": "regex or keyword pattern", "prompt": "instructions for the agent when this skill triggers"}
Keep the prompt concise but specific. The trigger should match user messages that activate this pattern.`,
        messages: [{ role: 'user', content: `Pattern: ${pattern.description}\nCategory: ${pattern.category}\nOccurrences: ${pattern.occurrences}\nExample inputs: ${pattern.exampleInputs.slice(0, 3).join(' | ')}\nExample outputs: ${pattern.exampleOutputs.slice(0, 2).join(' | ')}` }],
        maxTokens: 500,
        temperature: 0.2,
        isSubAgent: true,
      });

      const skillDef = JSON.parse(response.content.trim());
      if (skillDef.name && skillDef.prompt) {
        await skillsEngine.createSkill({
          name: skillDef.name,
          description: skillDef.description ?? pattern.description,
          trigger: skillDef.trigger ?? pattern.description,
          prompt: skillDef.prompt,
          examples: pattern.exampleInputs.slice(0, 3),
          source: 'learned',
        });

        feedback.promotePattern(pattern.id, `skill:${skillDef.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
        promoted++;
        logger.info('Pattern promoted to skill', {
          patternId: pattern.id,
          skillName: skillDef.name,
          occurrences: pattern.occurrences,
        });
      }
    } catch (err: any) {
      logger.debug('Pattern promotion failed', { patternId: pattern.id, error: err.message });
    }
  }
  return promoted;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

async function resolveUserId(platformId: string, platform: string): Promise<string> {
  const cacheKey = `${platform}:${platformId}`;
  if (userIdCache.has(cacheKey)) return userIdCache.get(cacheKey)!;

  const user = await findOrCreateUser(platformId, platform, platformId);
  // Identity linking: if linked to a master, use the master's ID
  const effectiveId = user.masterUserId ?? user.id;
  userIdCache.set(cacheKey, effectiveId);
  return effectiveId;
}

function findDbUserId(platformUserId: string): string | undefined {
  for (const [key, dbId] of userIdCache) {
    if (key.endsWith(`:${platformUserId}`) || key.startsWith(`${platformUserId}:`)) {
      return dbId;
    }
  }
  return undefined;
}

async function main() {
  logger.info('🐙 Starting ClawdAgent MEGA — The Autonomous Octopus...', { nodeEnv: config.NODE_ENV });

  // 0. YAML Config + Config files
  await initConfigFiles();
  const yamlConfig = await loadMainConfig();
  logger.info('📄 YAML config loaded', { name: yamlConfig.agent.name, version: yamlConfig.agent.version });

  // 1. Database
  await initDatabase();
  logger.info('💾 Database connected');

  // 1b. Auto-link platform identities (single-user mode)
  try {
    const masterId = await autoLinkUsers();
    if (masterId) {
      userIdCache.clear();
      logger.info('🔗 Auto-linked platform identities', { masterUserId: masterId });
    }
  } catch (err: any) {
    logger.debug('Auto-link check skipped', { error: err.message });
  }

  // 2. Cache (optional — app works without Redis)
  initCache();
  // Give Redis 2 seconds to connect before deciding if queues can start
  await new Promise(resolve => setTimeout(resolve, 2000));
  const { isCacheAvailable } = await import('./memory/cache.js');
  if (isCacheAvailable()) {
    logger.info('📦 Redis cache connected');
  } else {
    logger.warn('📦 Redis not available — running without cache (queues disabled)');
  }

  // 2a. Behavior Engine
  const behaviorEngine = new BehaviorEngine();
  await behaviorEngine.init();
  logger.info('🎭 Behavior engine ready', { behaviors: behaviorEngine.getBehaviorCount() });

  // 2b. Plugin Loader
  const pluginLoader = new PluginLoader(yamlConfig.plugins?.directory);
  if (yamlConfig.plugins?.enabled) {
    await pluginLoader.init().catch(err => {
      logger.warn('Plugin loader init failed', { error: err.message });
    });
    logger.info('🔌 Plugin loader ready', { plugins: pluginLoader.getPluginCount(), loaded: pluginLoader.getLoadedCount() });
  }

  // 3. Engine + Skills + Memory Bridge
  const engine = new Engine();

  // Initialize skills engine
  await engine.initSkills();

  engine.setMemoryFunctions({
    getHistory: async (platformUserId: string, platform: string, limit: number, conversationId?: string): Promise<Message[]> => {
      try {
        const dbUserId = await resolveUserId(platformUserId, platform);
        const conversation = await getOrCreateConversation(dbUserId, platform, conversationId);
        const msgs = await getRecentMessages(conversation.id, limit);
        return msgs.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      } catch (err: any) {
        logger.warn('Failed to load history', { error: err.message });
        return [];
      }
    },

    saveMessage: async (platformUserId: string, platform: string, role: string, content: string, metadata?: any): Promise<void> => {
      try {
        const dbUserId = await resolveUserId(platformUserId, platform);
        // Extract _conversationId injected by engine.process() wrapper
        const convId = metadata?._conversationId;
        const conversation = await getOrCreateConversation(dbUserId, platform, convId);
        await saveMessage(conversation.id, dbUserId, role, content, metadata);
      } catch (err: any) {
        logger.warn('Failed to save message', { error: err.message });
      }
    },

    getUserKnowledge: async (platformUserId: string): Promise<string> => {
      try {
        const dbId = findDbUserId(platformUserId);
        if (dbId) return await getUserKnowledge(dbId);
        const dbUserId = await resolveUserId(platformUserId, 'telegram');
        return await getUserKnowledge(dbUserId);
      } catch (err: any) {
        logger.warn('Failed to load knowledge', { error: err.message });
        return '';
      }
    },

    getKnowledgeCount: async (platformUserId: string): Promise<number> => {
      try {
        const dbId = findDbUserId(platformUserId);
        if (dbId) return await getKnowledgeCount(dbId);
        return 0;
      } catch {
        return 0;
      }
    },

    getUserTasks: async (platformUserId: string): Promise<string> => {
      try {
        const dbId = findDbUserId(platformUserId);
        if (!dbId) return '';
        const tasks = await getUserTasks(dbId, 'pending');
        if (tasks.length === 0) return '';
        return tasks.map(t => `- [${t.priority}] ${t.title} (${t.status})${t.dueDate ? ` — due ${t.dueDate.toLocaleDateString()}` : ''}`).join('\n');
      } catch (err: any) {
        logger.warn('Failed to load tasks', { error: err.message });
        return '';
      }
    },

    getUserServers: async (platformUserId: string): Promise<string> => {
      try {
        const parts: string[] = [];
        // DB servers (per-user)
        const dbId = findDbUserId(platformUserId);
        if (dbId) {
          const servers = await getUserServers(dbId);
          parts.push(...servers.map(s => `- ${s.name}: ${s.host}:${s.port} (${s.status})`));
        }
        // Dashboard JSON servers (global — added via web UI)
        try {
          const { getServerListForAgent } = await import('./interfaces/web/routes/servers-api.js');
          const dashServers = getServerListForAgent();
          for (const ds of dashServers) {
            if (!parts.some(p => p.includes(ds.host))) {
              parts.push(`- ${ds.name}: ${ds.host}:${ds.port} [${ds.user}] (${ds.status})`);
            }
          }
        } catch { /* servers-api not available */ }
        return parts.length > 0 ? parts.join('\n') : '';
      } catch (err: any) {
        logger.warn('Failed to load servers', { error: err.message });
        return '';
      }
    },

    learnFromConversation: async (platformUserId: string, userMessage: string, agentResponse: string): Promise<void> => {
      try {
        const dbUserId = findDbUserId(platformUserId);
        if (!dbUserId) return;

        // Use free model for fact extraction (background task)
        const extractionResult = await engine.getAIClient().chat({
          model: config.OPENROUTER_API_KEY
            ? config.OPENROUTER_ECONOMY_MODEL
            : 'claude-haiku-4-5-20251001',
          provider: config.OPENROUTER_API_KEY ? 'openrouter' : 'anthropic',
          systemPrompt: `Extract facts about the user from this conversation exchange. Return a JSON array of objects with "key", "value", and "category" fields.
Categories: personal, project, preference, technology, goal, contact, work, location.
Only extract CONCRETE facts (name, project names, preferences, technologies, goals, contacts, locations, work details).
If no facts to extract, return []. Return ONLY valid JSON, nothing else.`,
          messages: [{ role: 'user', content: `User said: "${userMessage}"\nAssistant replied: "${agentResponse}"` }],
          maxTokens: 500,
          temperature: 0,
        });

        const facts = JSON.parse(extractionResult.content.trim());
        if (Array.isArray(facts)) {
          for (const fact of facts) {
            if (fact.key && fact.value) {
              await learnFact(dbUserId, fact.key, fact.value, fact.category ?? 'auto-learned', 'conversation');
              logger.info('Learned fact', { userId: dbUserId, key: fact.key, value: fact.value, category: fact.category });
            }
          }
        }
      } catch (err: any) {
        logger.debug('Knowledge extraction skipped', { error: err.message });
      }
    },

    getCrossPlatformSummary: async (platformUserId: string, currentPlatform: string): Promise<string> => {
      try {
        const dbUserId = await resolveUserId(platformUserId, currentPlatform);
        const summary = await getCrossPlatformSummary(dbUserId, currentPlatform, 3);
        if (summary.length === 0) return '';

        const lines: string[] = [];
        for (const entry of summary) {
          const lastMsg = entry.msgs[entry.msgs.length - 1];
          const ago = formatTimeAgo(lastMsg.createdAt);
          const preview = entry.msgs.map(m =>
            `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`
          ).join(' | ');
          lines.push(`- ${entry.platform} (${ago}): ${preview}`);
        }
        return lines.join('\n');
      } catch (err: any) {
        logger.warn('Failed to load cross-platform summary', { error: err.message });
        return '';
      }
    },
  });

  logger.info('🧠 Engine initialized with memory + skills + goals');

  // 3a. Claude Code CLI Provider — FREE via Max subscription
  const aiClient = engine.getAIClient();
  await aiClient.initClaudeCode();
  const ccAdapter = aiClient.getClaudeCodeAdapter();
  if (ccAdapter && ccAdapter.available) {
    // Wire into claude-code tool
    setClaudeCodeToolProvider(ccAdapter.getProvider());
    // Wire savings getter into analytics
    setClaudeCodeSavingsGetter(() => ccAdapter.getSavings());
    logger.info('🆓 Claude Code CLI active (FREE — Max subscription)', { provider: 'claude-code' });
  } else {
    logger.info('Claude Code CLI not available, using API providers', {
      enabled: config.CLAUDE_CODE_ENABLED,
    });
  }

  // 4. Heartbeat (proactive monitoring) + Self-Repair + Goals + AutoUpgrade
  const heartbeat = new Heartbeat();
  const selfRepair = new SelfRepair(engine.getMetaAgent());
  const autoUpgrade = new AutoUpgrade(engine.getAIClient(), engine.getSkillsEngine());
  // Shared AI chat helper for subsystems (uses free model)
  const aiChatHelper = async (system: string, message: string): Promise<string> => {
    const response = await engine.getAIClient().chat({
      systemPrompt: system,
      messages: [{ role: 'user', content: message }],
      maxTokens: 500,
      temperature: 0.3,
      model: config.OPENROUTER_API_KEY ? config.OPENROUTER_ECONOMY_MODEL : 'claude-haiku-4-5-20251001',
      provider: config.OPENROUTER_API_KEY ? 'openrouter' : 'anthropic',
    });
    return response.content;
  };

  const selfImprove = new SelfImprove(aiChatHelper);

  // Wire AI into self-repair for smart diagnosis
  setSelfRepairAI(aiChatHelper);

  // Wire auto tool dependencies (pre-Telegram, will be re-wired later)
  setAutoToolDeps({
    aiChat: aiChatHelper,
    alert: async (msg: string) => {
      logger.info('Auto-tool alert (pre-telegram)', { msg: msg.slice(0, 100) });
    },
  });

  // 4a. Self-Evolution Engine + Tool Creator
  setPluginLoader(pluginLoader);
  const toolCreator = new ToolCreator(engine.getAIClient());
  setToolCreator(toolCreator);
  logger.info('🔧 Tool Creator initialized (dynamic tool generation enabled)');
  const skillFetcher = new SkillFetcher(engine.getAIClient(), engine.getSkillsEngine());
  const agentFactory = new AgentFactory(engine.getAIClient(), engine.getSkillsEngine());
  const capabilityLearner = new CapabilityLearner(engine.getAIClient(), engine.getSkillsEngine(), agentFactory);
  const crewOrchestrator = new CrewOrchestrator(engine.getAIClient());
  const evolutionEngine = new EvolutionEngine({
    ai: engine.getAIClient(),
    skillFetcher,
    agentFactory,
    capabilityLearner,
    crewOrchestrator,
    metaAgent: engine.getMetaAgent(),
    selfRepair,
    skills: engine.getSkillsEngine(),
  });
  engine.setEvolutionEngine(evolutionEngine);

  // ── Intelligence Bridge: connect all 9 subsystems to the live pipeline ──
  initBridge(evolutionEngine);

  // ── Wire Crew Orchestrator to Engine ──
  engine.setCrewOrchestrator(crewOrchestrator);

  // ── Persistent Memory: load cross-session data from DB ──
  const memoryHierarchy = evolutionEngine.getMemoryHierarchy();
  await memoryHierarchy.initPersistence();
  // Wire MetaAgent to persistent memory so errors survive restarts
  engine.getMetaAgent().setMemoryHierarchy(memoryHierarchy);
  // Flush memory to DB every 5 minutes
  const memoryFlushInterval = setInterval(() => {
    memoryHierarchy.flush().catch(err => {
      logger.debug('Memory flush error', { error: err.message });
    });
  }, 5 * 60 * 1000);

  logger.info('🧬 Evolution Engine initialized', {
    skillFetcher: true,
    agentFactory: true,
    capabilityLearner: true,
    crewOrchestrator: true,
    pluginsBridged: pluginLoader.getLoadedCount(),
    intelligenceScorer: true,
    memoryHierarchy: true,
    governanceEngine: true,
    costIntelligence: true,
    adaptiveModelRouter: true,
    observability: true,
    autonomousGoals: true,
    safetySimulator: true,
    feedbackLoop: true,
  });

  // Wire subsystems into heartbeat
  heartbeat.setSubsystems({
    meta: engine.getMetaAgent(),
    selfRepair,
    goals: engine.getGoalEngine(),
    planner: engine.getGoalPlanner(),
    autoUpgrade,
    upgradeSources: config.UPGRADE_SOURCES ?? [],
  });

  heartbeat.setDataFunctions({
    getOverdueTasks: async () => {
      const results: Array<{ userId: string; platform: string; title: string; dueDate: Date | null }> = [];
      for (const [key, dbId] of userIdCache) {
        const platform = key.split(':')[0];
        try {
          const overdue = await getOverdueTasks(dbId);
          for (const task of overdue) {
            results.push({ userId: dbId, platform, title: task.title, dueDate: task.dueDate });
          }
        } catch { /* skip */ }
      }
      return results;
    },
    getServerStatuses: async () => {
      const results: Array<{ userId: string; platform: string; name: string; host: string; status: string | null }> = [];
      for (const [key, dbId] of userIdCache) {
        const platform = key.split(':')[0];
        try {
          const servers = await getUserServers(dbId);
          for (const server of servers) {
            results.push({ userId: dbId, platform, name: server.name, host: server.host, status: server.status });
          }
        } catch { /* skip */ }
      }
      return results;
    },
  });

  // 4a-bis. Wire OpenClaw monitoring into heartbeat
  {
    const { executeTool } = await import('./core/tool-executor.js');
    heartbeat.setOpenClawFunctions({
      executor: async (action: string, params?: Record<string, unknown>) => {
        return executeTool('openclaw', { action, ...params });
      },
      sshExecutor: config.DEFAULT_SSH_SERVER ? async (command: string) => {
        const result = await executeTool('bash', { command });
        return result.output || result.error || '';
      } : undefined,
    });
  }

  // 4b. CronEngine + UsageTracker + WorkflowEngine + RAGEngine
  const cronEngine = new CronEngine();
  const usageTracker = new UsageTracker();
  const workflowEngine = new WorkflowEngine();
  const ragEngine = new RAGEngine();

  // Register default cron action handlers
  cronEngine.registerAction('send_message', async (task) => {
    return String(task.actionData.message ?? 'Scheduled reminder');
  });
  cronEngine.registerAction('news_summary', async (task) => {
    try {
      const response = await engine.getAIClient().chat({
        systemPrompt: 'Provide a brief news summary for the given topic.',
        messages: [{ role: 'user', content: `News summary for: ${task.actionData.topic ?? 'tech'}` }],
        maxTokens: 500, temperature: 0.5,
      });
      return response.content;
    } catch { return 'News summary unavailable.'; }
  });

  // Auto-Promoter — continuous promotion across all channels
  setPromoterAI(aiChatHelper);
  registerPromoterCron(cronEngine);

  // Register default workflow action handlers
  workflowEngine.registerHandler('send_message', async (config) => {
    return `Message: ${config.message ?? 'ok'}`;
  });
  workflowEngine.registerHandler('ai_process', async (config) => {
    const response = await engine.getAIClient().chat({
      systemPrompt: 'Execute this automated task.',
      messages: [{ role: 'user', content: String(config.prompt ?? '') }],
      maxTokens: 500, temperature: 0.3,
    });
    return response.content;
  });

  // Load persisted data
  await cronEngine.loadFromDb().catch(() => {});
  await usageTracker.loadFromDb().catch(() => {});
  await ragEngine.init().catch(() => {});

  // Bootstrap auto-promote cron task — opt-in via AUTO_PROMOTE_ENABLED=true
  if (process.env.AUTO_PROMOTE_ENABLED === 'true') {
    const existingPromoTask = cronEngine.listTasks().find(t => t.action === 'auto_promote');
    if (!existingPromoTask) {
      await cronEngine.addTask({
        id: 'auto_promote_system',
        userId: 'system',
        name: 'Auto-Promote',
        expression: process.env.AUTO_PROMOTE_CRON || '0 */6 * * *',
        action: 'auto_promote',
        actionData: {},
        platform: 'web',
        enabled: true,
        createdAt: new Date().toISOString(),
      }).catch(err => logger.warn('Auto-promote cron setup failed', { error: String(err) }));
      logger.info('📢 Auto-promote cron task created');
    }
  }

  // Wire cron tool to engine so AI can manage cron tasks
  setCronToolEngine(cronEngine);

  // Wire modules into engine for intent intercepts
  engine.setCronEngine(cronEngine);
  engine.setUsageTracker(usageTracker);
  engine.setRAGEngine(ragEngine);

  // Wire RAG engine into the RAG tool so agents can use it
  setRAGEngineRef(ragEngine);

  // Now create ProactiveThinker (needs cronEngine)
  const proactiveThinker = new ProactiveThinker({
    aiChat: aiChatHelper,
    getSystemStatus: async () => {
      const uptime = process.uptime();
      const mem = process.memoryUsage();
      return `Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m | Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB | Cron tasks: ${cronEngine.getTaskCount()}`;
    },
    getMemoryContext: async () => {
      try {
        const count = await getKnowledgeCount('system');
        return `Knowledge entries: ${count}`;
      } catch { return 'Knowledge: unavailable'; }
    },
  });

  // Wire workflow + analytics tool deps
  setWorkflowToolDeps({ engine: workflowEngine, aiChat: aiChatHelper });
  setAnalyticsToolDeps(usageTracker);

  logger.info('⏰ Cron + Usage + Workflows + RAG initialized', {
    cronTasks: cronEngine.getTaskCount(),
    workflows: workflowEngine.getWorkflowCount(),
  });

  // 4c. MCP Manager — connect to external tool servers (YAML-based config)
  const mcpManager = new MCPManager(yamlConfig.mcp?.config_path);
  if (yamlConfig.mcp?.enabled) {
    await mcpManager.init().catch(err => {
      logger.warn('MCP Manager init failed', { error: err.message });
    });
  }
  // Fallback: legacy MCP_SERVERS env var
  const mcpClient = mcpManager.getClient();
  if (mcpClient.getServerCount() === 0 && config.MCP_SERVERS && config.MCP_SERVERS.length > 0) {
    try {
      const mcpConfigs = config.MCP_SERVERS.map((s: string) => {
        const [id, command, ...args] = s.split(':');
        return { id, command, args };
      });
      await mcpClient.init(mcpConfigs);
    } catch (err: any) {
      logger.warn('Legacy MCP init failed', { error: err.message });
    }
  }
  logger.info('🔗 MCP ready', { servers: mcpClient.getServerCount(), tools: mcpClient.getToolCount() });

  // 4d. Agent Queue Manager — per-agent BullMQ queues for scaling
  const agentQueue = new AgentQueueManager();
  try {
    const { getAllAgents } = await import('./agents/registry.js');
    const agentIds = getAllAgents().map(a => a.id);
    await agentQueue.init(agentIds);
    logger.info('📊 Agent queues initialized', { queues: agentQueue.getQueueCount() });
  } catch (err: any) {
    logger.warn('Agent queue init failed (non-critical)', { error: err.message });
  }

  // 4e. Auto-Update from GitHub
  const updater = new Updater({ repoOwner: 'clawdagent', repoName: 'clawdagent' });
  await updater.init();

  // 4f. OpenClaw Deep Sync
  const openclawSync = new OpenClawSync();
  if (config.DEFAULT_SSH_SERVER && config.OPENCLAW_GATEWAY_TOKEN) {
    const { executeTool } = await import('./core/tool-executor.js');
    openclawSync.setExecutor(async (action, params) => {
      return executeTool('openclaw', { action, ...params });
    });
    openclawSync.start();
    logger.info('🔄 OpenClaw sync started');
  }

  // 4g. Key Rotation
  initKeyRotation({
    enabled: yamlConfig.security?.rotate_keys ?? false,
    rotateIntervalHours: yamlConfig.security?.rotate_interval_hours ?? 72,
  });

  // 5. Queue (requires Redis — skip gracefully if unavailable)
  try {
    startWorker();
    startScheduler();
    logger.info('📨 Queue worker and scheduler started');
  } catch (err: any) {
    logger.warn('⚠️ Queue system skipped — Redis not available', { error: err.message });
    logger.warn('  Reminders, scheduled jobs, and background tasks will not work until Redis is running');
  }

  // 6. Interfaces
  const interfaces = await startInterfaces(engine);

  // 7. Wire heartbeat alert sender to Telegram (now that interfaces are started)
  const telegramInterface = interfaces.find(i => i.name === 'Telegram') as TelegramBot | undefined;
  heartbeat.setAlertSender(async (alert) => {
    logger.info('🔔 ALERT', { type: alert.type, severity: alert.severity, title: alert.title });

    if (telegramInterface && config.TELEGRAM_ADMIN_IDS.length > 0) {
      const text = `${alert.title}\n\n${alert.message}`;
      for (const adminId of config.TELEGRAM_ADMIN_IDS) {
        try {
          await telegramInterface.sendMessage(adminId, text);
        } catch (err: any) {
          // Markdown parse failed — retry as plain text
          try {
            await telegramInterface.sendMessagePlain(adminId, text);
          } catch (err2: any) {
            logger.warn('Failed to send Telegram alert', { adminId, error: err2.message });
          }
        }
      }
    }
  });

  // 7a. Wire OpenClaw webhook → Telegram forwarding
  {
    const { setWebhookTelegramSender, setWebhookOpenClawExecutor, trackOpenClawMessage } = await import('./interfaces/web/routes/webhook.js');
    const { executeTool } = await import('./core/tool-executor.js');

    // Telegram sender that tracks message IDs for reply detection (plain text — no markdown)
    if (telegramInterface) {
      setWebhookTelegramSender(async (chatId, text) => {
        try {
          const msgId = await telegramInterface.sendMessagePlain(chatId, text);
          trackOpenClawMessage(msgId, { type: 'webhook', source: 'openclaw' });
        } catch (err: any) {
          logger.warn('Webhook Telegram send failed', { error: err.message });
        }
      });
    }

    // OpenClaw executor for reply forwarding
    setWebhookOpenClawExecutor(async (action, params) => {
      return executeTool('openclaw', { action, ...params });
    });

    logger.info('🔗 OpenClaw webhook listener ready on /webhook/openclaw');
  }

  // 7b. Re-wire auto-tool alert + self-improve alert to Telegram
  if (telegramInterface && config.TELEGRAM_ADMIN_IDS.length > 0) {
    const telegramAlert = async (msg: string) => {
      for (const adminId of config.TELEGRAM_ADMIN_IDS) {
        try {
          await telegramInterface.sendMessagePlain(adminId, msg);
        } catch { /* skip */ }
      }
    };

    setAutoToolDeps({ aiChat: aiChatHelper, alert: telegramAlert });
    selfImprove.setAlertSender(telegramAlert);
  }

  // 7c. Wire reminder sender to Telegram
  setReminderSender(async (userId, _platform, text) => {
    if (telegramInterface) {
      await telegramInterface.sendMessage(userId, text);
    }
  });

  // 7c. Wire cron notifier to Telegram
  cronEngine.setNotifier(async (userId, _platform, message) => {
    if (telegramInterface) {
      await telegramInterface.sendMessage(userId, message);
    }
  });

  // 8. SSH Tunnel — reverse tunnel for webhook forwarding (server:13000 → local:3000)
  let sshTunnel: SSHTunnel | null = null;
  if (config.DEFAULT_SSH_SERVER && config.DEFAULT_SSH_KEY_PATH) {
    sshTunnel = createWebhookTunnel();
    if (sshTunnel) {
      sshTunnel.start();
      logger.info('🔐 SSH tunnel started', {
        remote: `${config.DEFAULT_SSH_SERVER}:13000`,
        local: `localhost:${config.PORT}`,
      });
    }
  }

  if (config.HEARTBEAT_ENABLED) {
    heartbeat.start(config.HEARTBEAT_INTERVAL_MS);
  }

  // ── Intelligence: periodic intelligence cycle every 15 minutes ──
  // (reduced from 5min to lower memory pressure)
  const INTEL_INTERVAL_MS = 15 * 60 * 1000;
  setInterval(async () => {
    if (!isBridgeReady()) return;
    try {
      const { getAllAgents } = await import('./agents/registry.js');
      const agents = getAllAgents();
      const health = evolutionEngine.getHealthIndex();
      const result = runPeriodicIntelligence({
        activeAgents: agents.length,
        dynamicAgents: agentFactory.getDynamicAgentCount(),
        totalSkills: engine.getSkillsEngine().getSkillCount(),
        evolutionPhase: 'active',
        costToday: usageTracker.getTodaySummary().totalCost,
        successRate: health.score,
        avgLatency: 0,
        errorRate: health.details.failureRate ?? 0,
      });
      // Take observability snapshot each cycle
      evolutionEngine.takeSnapshot();
      if (result.triggersTriggered > 0 || result.tasksGenerated > 0) {
        logger.info('Intelligence cycle completed', result);
      }
    } catch (err: any) {
      logger.debug('Periodic intelligence error', { error: err.message });
    }
  }, INTEL_INTERVAL_MS);

  // ── Evolution: periodic self-improvement cycle every 2 hours ──
  // (reduced from 30min to lower memory pressure — was a top OOM contributor)
  // Full evolution (with external sources) runs every 12 hours.
  const EVOLUTION_LIGHT_INTERVAL_MS = 2 * 60 * 60 * 1000;
  const EVOLUTION_FULL_INTERVAL_MS = 12 * 60 * 60 * 1000;
  let lastEvolutionAt = 0;
  let lastFullEvolutionAt = 0;
  setInterval(async () => {
    if (Date.now() - lastEvolutionAt < EVOLUTION_LIGHT_INTERVAL_MS) return;
    // Memory guard — skip if heap is too high
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    if (heapUsedMB > 1500) {
      logger.info('🧬 Evolution cycle skipped — memory too high', { heapUsedMB });
      return;
    }
    try {
      const isFull = Date.now() - lastFullEvolutionAt >= EVOLUTION_FULL_INTERVAL_MS;
      logger.info(`🧬 Periodic evolution cycle starting (${isFull ? 'full' : 'light'})...`);
      const result = await evolutionEngine.evolve(isFull);
      lastEvolutionAt = Date.now();
      if (isFull) lastFullEvolutionAt = Date.now();

      // After evolution, promote mature patterns to skills
      await promoteReadyPatterns(evolutionEngine, engine.getAIClient(), engine.getSkillsEngine()).catch(() => {});

      // Flush memory to persist any new learnings immediately
      await memoryHierarchy.flush().catch(() => {});

      logger.info('🧬 Periodic evolution cycle completed', {
        type: isFull ? 'full' : 'light',
        skillsFetched: result.skillsFetched,
        agentsCreated: result.agentsCreated,
        errors: result.errors.length,
        duration: result.duration,
      });
    } catch (err: any) {
      logger.debug('Periodic evolution error', { error: err.message });
    }
  }, EVOLUTION_LIGHT_INTERVAL_MS);
  // Startup evolution delayed to 5 minutes (was 30s — caused OOM on resource-constrained systems)
  setTimeout(async () => {
    try {
      const mem = process.memoryUsage();
      const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
      // Skip if heap already above 1.5GB to avoid OOM
      if (heapUsedMB > 1500) {
        logger.info('🧬 Startup evolution skipped — memory too high', { heapUsedMB });
        return;
      }
      const result = await evolutionEngine.evolve(false);
      lastEvolutionAt = Date.now();
      logger.info('🧬 Startup evolution completed', {
        agentsCreated: result.agentsCreated,
        errors: result.errors.length,
      });
    } catch (err: any) {
      logger.debug('Startup evolution error', { error: err.message });
    }
  }, 5 * 60 * 1000);

  logger.info(`✅ ClawdAgent PRODUCTION v${yamlConfig.agent.version} started with ${interfaces.length} interface(s)`, {
    providers: engine.getAIClient().getAvailableProviders(),
    skills: engine.getSkillsEngine().getSkillCount(),
    behaviors: behaviorEngine.getBehaviorCount(),
    heartbeat: config.HEARTBEAT_ENABLED,
    metaAgent: true,
    goalEngine: true,
    selfRepair: true,
    autoUpgrade: true,
    mcpServers: mcpClient.getServerCount(),
    mcpTools: mcpClient.getToolCount(),
    cronTasks: cronEngine.getTaskCount(),
    workflows: workflowEngine.getWorkflowCount(),
    agentQueues: agentQueue.getQueueCount(),
    plugins: pluginLoader.getLoadedCount(),
    rag: true,
    email: !!(config as any).GMAIL_CLIENT_ID || !!(config as any).SMTP_USER,
    voice: !!config.OPENAI_API_KEY,
    vision: !!(config.ANTHROPIC_API_KEY || config.OPENROUTER_API_KEY),
    sshTunnel: !!sshTunnel,
    selfImprove: true,
    proactiveThinker: true,
    openclawSync: openclawSync.isRunning(),
    updater: updater.getCurrentVersion(),
    claudeCode: ccAdapter?.available ? 'active (FREE)' : 'unavailable',
    evolution: true,
    intelligenceBridge: isBridgeReady(),
    dynamicAgents: agentFactory.getDynamicAgentCount(),
    tools: 19,
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down...`);
    clearInterval(memoryFlushInterval);
    await memoryHierarchy.flush(); // Final persistence before DB close
    heartbeat.stop();
    cronEngine.stopAll();
    updater.stop();
    openclawSync.stop();
    stopKeyRotation();
    if (sshTunnel) sshTunnel.stop();
    await agentQueue.shutdown();
    await mcpManager.shutdown();
    await pluginLoader.shutdown();
    await stopInterfaces(interfaces);
    await closeCache();
    await closeDatabase();
    logger.info('👋 ClawdAgent stopped');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
