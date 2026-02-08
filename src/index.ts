import config from './config.js';
import logger from './utils/logger.js';
import { Engine } from './core/engine.js';
import { AIClient } from './core/ai-client.js';
import { Heartbeat } from './core/heartbeat.js';
import { SelfRepair } from './core/self-repair.js';
import { AutoUpgrade } from './core/auto-upgrade.js';
import { MCPClient } from './core/mcp-client.js';
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
import { findOrCreateUser } from './memory/repositories/users.js';
import { getOrCreateConversation } from './memory/repositories/conversations.js';
import { saveMessage, getRecentMessages } from './memory/repositories/messages.js';
import { getUserKnowledge, learnFact, getKnowledgeCount } from './memory/repositories/knowledge.js';
import { getUserTasks, getOverdueTasks } from './memory/repositories/tasks.js';
import { getUserServers } from './memory/repositories/servers.js';
import { TelegramBot } from './interfaces/telegram/bot.js';
import type { Message } from './core/ai-client.js';
import type { BaseInterface } from './interfaces/base.js';

// Cache platform ID → DB user ID mapping
const userIdCache = new Map<string, string>();

async function resolveUserId(platformId: string, platform: string): Promise<string> {
  const cacheKey = `${platform}:${platformId}`;
  if (userIdCache.has(cacheKey)) return userIdCache.get(cacheKey)!;

  const user = await findOrCreateUser(platformId, platform, platformId);
  userIdCache.set(cacheKey, user.id);
  return user.id;
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

  // 1. Database
  await initDatabase();
  logger.info('💾 Database connected');

  // 2. Cache
  initCache();
  logger.info('📦 Redis cache connected');

  // 3. Engine + Skills + Memory Bridge
  const engine = new Engine();

  // Initialize skills engine
  await engine.initSkills();

  engine.setMemoryFunctions({
    getHistory: async (platformUserId: string, platform: string, limit: number): Promise<Message[]> => {
      try {
        const dbUserId = await resolveUserId(platformUserId, platform);
        const conversation = await getOrCreateConversation(dbUserId, platform);
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
        const conversation = await getOrCreateConversation(dbUserId, platform);
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
        const dbId = findDbUserId(platformUserId);
        if (!dbId) return '';
        const servers = await getUserServers(dbId);
        if (servers.length === 0) return '';
        return servers.map(s => `- ${s.name}: ${s.host}:${s.port} (${s.status})`).join('\n');
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
  });

  logger.info('🧠 Engine initialized with memory + skills + goals');

  // 4. Heartbeat (proactive monitoring) + Self-Repair + Goals + AutoUpgrade
  const heartbeat = new Heartbeat();
  const selfRepair = new SelfRepair(engine.getMetaAgent());
  const autoUpgrade = new AutoUpgrade(engine.getAIClient(), engine.getSkillsEngine());

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

  // Wire modules into engine for intent intercepts
  engine.setCronEngine(cronEngine);
  engine.setUsageTracker(usageTracker);
  engine.setRAGEngine(ragEngine);

  logger.info('⏰ Cron + Usage + Workflows + RAG initialized', {
    cronTasks: cronEngine.getTaskCount(),
    workflows: workflowEngine.getWorkflowCount(),
  });

  // 4c. MCP Client — connect to external tool servers
  const mcpClient = new MCPClient();
  if (config.MCP_SERVERS && config.MCP_SERVERS.length > 0) {
    try {
      const mcpConfigs = config.MCP_SERVERS.map((s: string) => {
        const [id, command, ...args] = s.split(':');
        return { id, command, args };
      });
      await mcpClient.init(mcpConfigs);
      logger.info('MCP Client initialized', { servers: mcpClient.getServerCount(), tools: mcpClient.getToolCount() });
    } catch (err: any) {
      logger.warn('MCP Client init failed', { error: err.message });
    }
  }

  // 5. Queue
  startWorker();
  startScheduler();
  logger.info('📨 Queue worker and scheduler started');

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

  // 7b. Wire reminder sender to Telegram
  setReminderSender(async (userId, platform, text) => {
    if (telegramInterface) {
      await telegramInterface.sendMessage(userId, text);
    }
  });

  // 7c. Wire cron notifier to Telegram
  cronEngine.setNotifier(async (userId, platform, message) => {
    if (telegramInterface) {
      await telegramInterface.sendMessage(userId, message);
    }
  });

  if (config.HEARTBEAT_ENABLED) {
    heartbeat.start(config.HEARTBEAT_INTERVAL_MS);
  }

  logger.info(`✅ ClawdAgent MEGA started with ${interfaces.length} interface(s)`, {
    providers: engine.getAIClient().getAvailableProviders(),
    skills: engine.getSkillsEngine().getSkillCount(),
    heartbeat: config.HEARTBEAT_ENABLED,
    metaAgent: true,
    goalEngine: true,
    selfRepair: true,
    autoUpgrade: true,
    mcpServers: mcpClient.getServerCount(),
    mcpTools: mcpClient.getToolCount(),
    cronTasks: cronEngine.getTaskCount(),
    workflows: workflowEngine.getWorkflowCount(),
    rag: true,
    email: !!(config as any).GMAIL_CLIENT_ID || !!(config as any).SMTP_USER,
    voice: !!config.OPENAI_API_KEY,
    vision: !!(config.ANTHROPIC_API_KEY || config.OPENROUTER_API_KEY),
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down...`);
    heartbeat.stop();
    cronEngine.stopAll();
    await mcpClient.shutdown();
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
