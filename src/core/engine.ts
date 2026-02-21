import { AIClient, Message } from './ai-client.js';
import { pushActivity } from '../interfaces/web/routes/dashboard.js';
import { IntentRouter } from './router.js';
import { buildSystemPromptWithContext, FullContext, trimHistoryToFit } from './context-builder.js';
import { SkillsEngine } from './skills-engine.js';
import { getAgent } from '../agents/registry.js';
import { MetaAgent } from './meta-agent.js';
import { GoalEngine } from './goals.js';
import { GoalPlanner } from './goal-planner.js';
import { AutoLearn } from './auto-learn.js';
import { DesktopController } from '../actions/desktop/controller.js';
import { AIDesktopVision } from '../actions/desktop/ai-vision.js';
import { ProjectBuilder } from '../actions/project-builder/builder.js';
import { Intent } from './router.js';
import { CronEngine, parseCronExpression } from './cron-engine.js';
import type { CronTask } from './cron-engine.js';
import { scheduleReminder } from '../queue/scheduler.js';
import { UsageTracker } from './usage-tracker.js';
import { RAGEngine } from '../actions/rag/rag-engine.js';
import { initTools, getToolDefinitions, executeTool, setExecutionContext } from './tool-executor.js';
import { classifyComplexity, selectModel, classifyEffort, mapEffortToThinking, withVariant, findModel } from './model-router.js';
import { resolveOllamaModel } from './ollama-model-registry.js';
import type { CrewOrchestrator } from './crew-orchestrator.js';
import { onMessageProcessed, onError, getIntelligenceContext, isBridgeReady } from './intelligence-bridge.js';
import { getApprovalGate } from './approval-gate.js';
import type { EvolutionEngine } from './evolution-engine.js';
import config from '../config.js';
import { extractJSON } from '../utils/helpers.js';
import logger from '../utils/logger.js';

import { detectSocialEngineering } from '../security/content-guard.js';

// ─── Output Secret Filter ──────────────────────────────────────────
// Prevents LLM from leaking API keys, tokens, or secrets in responses.
const SECRET_PATTERNS = [
  /\b(sk-[a-zA-Z0-9]{20,})\b/g,                          // OpenAI/Anthropic keys
  /\b(ghp_[a-zA-Z0-9]{36,})\b/g,                          // GitHub PAT
  /\b(xox[bpoas]-[a-zA-Z0-9-]{10,})\b/g,                  // Slack tokens
  /\b(AKIA[A-Z0-9]{16})\b/g,                              // AWS access key
  /\b(eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})\b/g,    // JWT tokens
  /\b(BSA_[a-zA-Z0-9]{20,})\b/g,                          // Brave API key
  /\b([a-f0-9]{64})\b/g,                                  // 64-char hex (likely API secret)
];

function redactSecrets(text: unknown): string {
  // Guard: ensure text is always a string (prevents "input.replace is not a function" crash)
  let redacted = typeof text === 'string' ? text : String(text ?? '');
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

export interface ProgressEvent {
  type: 'status' | 'agent' | 'tool' | 'thinking' | 'error';
  message: string;
  agent?: string;
  tool?: string;
}

export interface IncomingMessage {
  platform: 'telegram' | 'discord' | 'whatsapp' | 'web';
  userId: string;
  userName: string;
  chatId: string;
  text: string;
  userRole?: string;
  replyTo?: string;
  conversationId?: string;
  attachments?: Array<{ type: string; url: string }>;
  metadata?: Record<string, unknown>;
  onProgress?: (event: ProgressEvent) => void;
  /** Streaming callback — text tokens as they arrive from the AI */
  onTextChunk?: (text: string) => void;
  /** Called when streaming resets (e.g. new tool iteration) — clear partial text */
  onStreamReset?: () => void;
  responseMode?: ResponseMode;
  model?: string;
}

export interface OutgoingMessage {
  text: string;
  thinking?: string;
  format?: 'text' | 'markdown' | 'html';
  attachments?: Array<{ type: string; data: Buffer; name: string }>;
  agentUsed?: string;
  tokensUsed?: { input: number; output: number };
  provider?: string;
  skillUsed?: string;
}

// ─── Response Mode System ──────────────────────────────────────────────────
// Controls how much processing each message gets. Saves time on simple queries.
export type ResponseMode = 'quick' | 'auto' | 'deep';

// Per-user mode overrides (in-memory, reset on restart)
const userModeOverrides = new Map<string, ResponseMode>();

/**
 * Detect if message is a mode-switch command.
 * Returns the new mode, or null if not a mode command.
 */
function detectModeCommand(text: string): ResponseMode | null {
  const t = text.trim().toLowerCase();
  if (/^(מצב מהיר|quick|fast|מהיר)$/i.test(t)) return 'quick';
  if (/^(מצב אוטומטי|auto|אוטומטי|רגיל)$/i.test(t)) return 'auto';
  if (/^(מצב מעמיק|deep|מעמיק|עמוק)$/i.test(t)) return 'deep';
  return null;
}

/**
 * Auto-detect response mode from message content.
 * Quick: short messages, greetings, simple questions
 * Deep:  long multi-domain tasks, orchestration
 * Auto:  everything else (default)
 */
function autoDetectMode(text: string): ResponseMode {
  const len = text.length;

  // Very short messages → always quick
  if (len < 60) return 'quick';

  // Simple greeting / question patterns — only for short-ish messages
  // Long messages starting with "היי" may contain complex requests after the greeting
  if (len < 150 && /^(היי|שלום|הי|hello|hi|hey|yo|בוקר טוב|ערב טוב|מה נשמע|מה קורה|thanks|תודה|ok|אוקי|כן|לא|good|טוב|בסדר)/i.test(text.trim())) {
    return 'quick';
  }

  // Simple short questions (Hebrew + English)
  if (len < 200 && /^(מה|איך|למה|כמה|האם|יש|what|how|why|when|who|where|is there|can you|do you|tell me|show me)/i.test(text.trim())) {
    return 'quick';
  }

  // Multi-domain / complex → deep
  if (len > 500) {
    const domains = [
      /research|חקור|analyze|נתח/i,
      /build|בנה|create|צור|implement/i,
      /trade|signal|מסחר|סיגנל|crypto/i,
      /secur|audit|אבטח|penetr/i,
      /review|בדוק|test|בדיקה/i,
    ];
    const matchCount = domains.filter(d => d.test(text)).length;
    if (matchCount >= 2) return 'deep';
  }

  return 'auto';
}

export class Engine {
  private ai: AIClient;
  private router: IntentRouter;
  private skills: SkillsEngine;
  private meta: MetaAgent;
  private goals: GoalEngine;
  private planner: GoalPlanner;
  private autoLearn: AutoLearn;
  private desktop: DesktopController;
  private desktopVision: AIDesktopVision | null = null;
  private projectBuilder: ProjectBuilder;
  private cronEngine: CronEngine | null = null;
  private usageTracker: UsageTracker | null = null;
  private ragEngine: RAGEngine | null = null;
  private evolution: EvolutionEngine | null = null;
  private crewOrchestrator: CrewOrchestrator | null = null;

  private getHistory?: (userId: string, platform: string, limit: number, conversationId?: string) => Promise<Message[]>;
  private saveMessage?: (userId: string, platform: string, role: string, content: string, metadata?: any) => Promise<void>;
  private getUserKnowledge?: (userId: string) => Promise<string>;
  private getUserTasks?: (userId: string) => Promise<string>;
  private getUserServers?: (userId: string) => Promise<string>;
  private learnFromConversation?: (userId: string, userMessage: string, agentResponse: string) => Promise<void>;
  private getKnowledgeCount?: (userId: string) => Promise<number>;
  private getCrossPlatformSummary?: (userId: string, platform: string) => Promise<string>;

  constructor() {
    this.ai = new AIClient();
    this.router = new IntentRouter(this.ai);
    this.skills = new SkillsEngine();
    this.meta = new MetaAgent(this.ai);
    this.goals = new GoalEngine();
    this.planner = new GoalPlanner(this.ai);
    this.autoLearn = new AutoLearn(this.ai);
    this.desktop = new DesktopController();
    if (this.desktop.isEnabled()) {
      this.desktopVision = new AIDesktopVision(this.ai, this.desktop);
      logger.info('Desktop control + AI vision enabled');
    }
    this.projectBuilder = new ProjectBuilder();
    initTools();
    logger.info('Project Builder initialized');
  }

  async initSkills() {
    await this.skills.init();
  }

  getSkillsEngine(): SkillsEngine { return this.skills; }
  getAIClient(): AIClient { return this.ai; }
  getMetaAgent(): MetaAgent { return this.meta; }
  getGoalEngine(): GoalEngine { return this.goals; }
  getGoalPlanner(): GoalPlanner { return this.planner; }
  getDesktopController(): DesktopController { return this.desktop; }
  getProjectBuilder(): ProjectBuilder { return this.projectBuilder; }
  setCronEngine(cron: CronEngine) { this.cronEngine = cron; }
  setUsageTracker(tracker: UsageTracker) { this.usageTracker = tracker; }
  setRAGEngine(rag: RAGEngine) { this.ragEngine = rag; }
  getCronEngine(): CronEngine | null { return this.cronEngine; }
  getUsageTracker(): UsageTracker | null { return this.usageTracker; }
  getRAGEngine(): RAGEngine | null { return this.ragEngine; }
  setEvolutionEngine(evo: EvolutionEngine) { this.evolution = evo; }
  getEvolutionEngine(): EvolutionEngine | null { return this.evolution; }
  setCrewOrchestrator(crew: CrewOrchestrator) { this.crewOrchestrator = crew; }
  getCrewOrchestrator(): CrewOrchestrator | null { return this.crewOrchestrator; }

  /**
   * Smart crew detection — decides if multiple agents are needed and WHY.
   * Rules:
   *   1. Short messages (<200 chars) → NEVER crew (single agent handles it)
   *   2. Simple questions/greetings → NEVER crew
   *   3. Only crew when multiple DISTINCT domains are detected
   *   4. Log the reason so user understands why agents were activated
   */
  private shouldUseCrew(intent: string, text: string, _agentId: string): {
    id: string; name: string; mode: 'sequential' | 'hierarchical' | 'ensemble';
    members: Array<{ agentId: string; role?: string }>; task: string;
    reason: string;
  } | null {
    if (!this.crewOrchestrator) return null;

    // Rule 1: Short messages → single agent always
    if (text.length < 200) return null;

    // Rule 2: Simple patterns → single agent
    const isQuestion = /^(מה|יש|תבדוק|איך|למה|כמה|what|is there|check|status|how|why|when|who|where|tell me|show me|explain)/i.test(text.trim());
    if (isQuestion && text.length < 400) return null;

    const lowerText = text.toLowerCase();

    // Rule 3: Detect distinct task domains
    const domains = {
      research: /research|חקור|analyze|analys|נתח|investigate|survey|compare/i.test(lowerText),
      build: /build|בנה|create|צור|implement|develop|write code|תכתוב|תבנה/i.test(lowerText),
      trade: /trade|signal|מסחר|סיגנל|portfolio|crypto|bitcoin|שוק/i.test(lowerText),
      security: /secur|audit|vulnerab|אבטח|penetr|pentest/i.test(lowerText),
      review: /review|בדוק|check|סקור|test|בדיקה/i.test(lowerText),
      content: /write article|כתוב מאמר|blog|presentation|מצגת|document/i.test(lowerText),
    };

    const activeDomains = Object.entries(domains).filter(([, active]) => active);

    // Need at least 2 distinct domains for crew
    if (activeDomains.length < 2) {
      // Special case: explicit orchestrate intent with complex multi-step task
      if (intent === 'orchestrate' && text.length > 400) {
        const hasMultipleSteps = /\d+\.\s|then\s|ואז\s|אחר כך|step\s?\d|first.*then|קודם.*אחר/i.test(text);
        if (hasMultipleSteps) {
          const reason = 'Multi-step orchestration task detected';
          logger.info('Crew activated', { reason, textLength: text.length });
          return {
            id: `crew_${Date.now()}`, name: 'Orchestration Crew', mode: 'hierarchical',
            members: [
              { agentId: 'orchestrator', role: 'leader' },
              { agentId: 'researcher', role: 'research' },
              { agentId: 'code-assistant', role: 'implementation' },
            ],
            task: text, reason,
          };
        }
      }
      return null;
    }

    // Build crew based on detected domains
    const domainNames = activeDomains.map(([name]) => name);
    const reason = `Multi-domain task: ${domainNames.join(' + ')}`;
    logger.info('Crew activated', { reason, domains: domainNames, textLength: text.length });

    // Research + Build → sequential
    if (domains.research && domains.build) {
      return {
        id: `crew_${Date.now()}`, name: 'Research & Build', mode: 'sequential',
        members: [
          { agentId: 'researcher', role: 'research' },
          { agentId: 'code-assistant', role: 'build' },
        ],
        task: text, reason,
      };
    }

    // Research + Trade → sequential
    if (domains.research && domains.trade) {
      return {
        id: `crew_${Date.now()}`, name: 'Research & Trade', mode: 'sequential',
        members: [
          { agentId: 'researcher', role: 'research' },
          { agentId: 'crypto-analyst', role: 'analysis' },
        ],
        task: text, reason,
      };
    }

    // Review + Security → ensemble
    if (domains.review && domains.security) {
      return {
        id: `crew_${Date.now()}`, name: 'Security Review', mode: 'ensemble',
        members: [
          { agentId: 'code-assistant', role: 'code-review' },
          { agentId: 'security-guard', role: 'security-review' },
        ],
        task: text, reason,
      };
    }

    // Generic multi-domain → hierarchical with orchestrator
    return {
      id: `crew_${Date.now()}`, name: `Multi-Domain (${domainNames.join('+')})`, mode: 'hierarchical',
      members: [
        { agentId: 'orchestrator', role: 'leader' },
        ...activeDomains.slice(0, 3).map(([domain]) => ({
          agentId: domain === 'trade' ? 'crypto-analyst'
            : domain === 'security' ? 'security-guard'
            : domain === 'research' ? 'researcher'
            : 'code-assistant',
          role: domain,
        })),
      ],
      task: text, reason,
    };
  }

  /**
   * Quick mode — minimal processing for fast responses.
   * Skips: intent classification (AI call), meta-agent think, crew detection, full context loading.
   * Only loads: recent history + sends directly to AI.
   */
  private async processQuick(incoming: IncomingMessage, startTime: number): Promise<OutgoingMessage> {
    const _origSave = this.saveMessage;
    if (_origSave && incoming.conversationId) {
      this.saveMessage = async (userId, platform, role, content, metadata?) => {
        await _origSave(userId, platform, role, content, { ...metadata, _conversationId: incoming.conversationId });
      };
    }

    try {
      incoming.onProgress?.({ type: 'status', message: 'Quick mode — fast response ⚡' });

      // Load history (enough for conversation continuity)
      const rawHistory = this.getHistory ? await this.getHistory(incoming.userId, incoming.platform, 20, incoming.conversationId) : [];
      const history = rawHistory.filter(m => {
        if (typeof m.content === 'string') return m.content.trim().length > 0;
        if (Array.isArray(m.content)) return m.content.length > 0;
        return false;
      });

      // Use keyword classification (instant, no AI call)
      const keywordRouting = (this.router as any).keywordClassify?.(incoming.text);
      const agentId = keywordRouting?.agentId ?? 'general';
      const agent = getAgent(agentId) ?? getAgent('general')!;

      // Minimal system prompt — no full context loading
      const lastMsgStr = incoming.text;
      const hasHebrew = /[\u0590-\u05FF]/.test(lastMsgStr);
      const minimalPrompt = `${agent.systemPrompt}\n\nUser: ${incoming.userName} | Platform: ${incoming.platform}${hasHebrew ? '\nThe user speaks Hebrew — respond in Hebrew.' : ''}`;

      // Build messages
      const trimmedHistory = trimHistoryToFit(history, 8000);
      const messages: Message[] = [...trimmedHistory, { role: 'user', content: incoming.text }];

      // Select provider (same logic but skip complexity classification)
      const { resolved: resolvedMode } = this.ai.getProviderMode();
      const claudeCodeActive = this.ai.getAvailableProviders().includes('claude-code');
      let selectedProvider: 'anthropic' | 'openrouter' | 'claude-code' | 'ollama' | undefined;
      let selectedModelId: string | undefined;

      // User model override from UI selector
      const userModelOverride = incoming.model && incoming.model !== 'auto'
        ? findModel(incoming.model) : null;

      if (incoming.model === 'claude-code-cli') {
        selectedProvider = 'claude-code';
        selectedModelId = undefined;
      } else if (userModelOverride) {
        selectedProvider = userModelOverride.provider as typeof selectedProvider;
        selectedModelId = userModelOverride.id;
        logger.info('Model override from UI (quick)', { model: userModelOverride.name });
      } else if (resolvedMode === 'local' && config.OLLAMA_ENABLED) {
        selectedProvider = 'ollama';
        selectedModelId = config.OLLAMA_DEFAULT_MODEL;
      } else if (resolvedMode === 'max' && claudeCodeActive) {
        selectedProvider = 'claude-code';
        selectedModelId = undefined;
      } else if (claudeCodeActive) {
        selectedProvider = 'claude-code';
        selectedModelId = undefined;
      } else {
        selectedProvider = 'anthropic';
        selectedModelId = config.AI_MODEL;
      }

      // Direct AI call — no tools, no thinking mode, just fast response
      const response = await this.ai.chat({
        systemPrompt: minimalPrompt,
        messages,
        maxTokens: agent.maxTokens,
        temperature: agent.temperature,
        ...(selectedModelId ? { model: selectedModelId } : {}),
        ...(selectedProvider ? { provider: selectedProvider } : {}),
      });

      // Empty response fallback
      if (!response.content || response.content.trim().length === 0) {
        response.content = 'קיבלתי את ההודעה שלך אבל לא הצלחתי לעבד אותה. נסה שוב 🔄';
      }

      // Save messages
      if (this.saveMessage) {
        if (incoming.text) {
          await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text, { mode: 'quick' });
        }
        if (response.content) {
          await this.saveMessage(incoming.userId, incoming.platform, 'assistant', response.content, {
            agent: agent.id, provider: response.provider, mode: 'quick',
          });
        }
      }

      // Background learning (non-blocking)
      if (this.learnFromConversation) {
        this.learnFromConversation(incoming.userId, incoming.text, response.content).catch(() => {});
      }

      const duration = Date.now() - startTime;
      logger.info('Quick mode response', { agent: agent.id, provider: response.provider, duration });
      pushActivity('response', `[quick:${agent.id}] ${response.content.slice(0, 80)}...`, { agent: agent.id, platform: incoming.platform });

      // ── Social Engineering Detection (Gemini recommendation) ──
      // High severity = block response entirely (Claude's feedback: warn-only is not enough)
      const seCheck = detectSocialEngineering(response.content);
      if (seCheck.detected && seCheck.severity === 'high') {
        logger.error('HIGH social engineering BLOCKED in quick response', { agent: agent.id, patterns: seCheck.patterns });
        return {
          text: '⛔ Response blocked — high-severity social engineering detected. The agent attempted to manipulate you into bypassing security controls.',
          format: 'text',
          agentUsed: `quick:${agent.id}:BLOCKED`,
          provider: response.provider,
        };
      }
      if (seCheck.detected) {
        logger.warn('Social engineering detected in quick response', { agent: agent.id, severity: seCheck.severity, patterns: seCheck.patterns });
      }

      return {
        text: redactSecrets(response.content),
        format: 'markdown',
        agentUsed: `quick:${agent.id}`,
        tokensUsed: response.usage ? { input: response.usage.inputTokens, output: response.usage.outputTokens } : undefined,
        provider: response.provider,
      };
    } catch (error: any) {
      logger.error('Quick mode error', { error: error.message });
      return { text: `❌ שגיאה: ${error.message?.slice(0, 150)}`, format: 'text' };
    } finally {
      if (_origSave) this.saveMessage = _origSave;
    }
  }

  setMemoryFunctions(fns: {
    getHistory: Engine['getHistory'];
    saveMessage: Engine['saveMessage'];
    getUserKnowledge: Engine['getUserKnowledge'];
    getUserTasks?: Engine['getUserTasks'];
    getUserServers?: Engine['getUserServers'];
    learnFromConversation?: Engine['learnFromConversation'];
    getKnowledgeCount?: Engine['getKnowledgeCount'];
    getCrossPlatformSummary?: Engine['getCrossPlatformSummary'];
  }) {
    this.getHistory = fns.getHistory;
    this.saveMessage = fns.saveMessage;
    this.getUserKnowledge = fns.getUserKnowledge;
    this.getUserTasks = fns.getUserTasks;
    this.getUserServers = fns.getUserServers;
    this.learnFromConversation = fns.learnFromConversation;
    this.getKnowledgeCount = fns.getKnowledgeCount;
    this.getCrossPlatformSummary = fns.getCrossPlatformSummary;
  }

  async process(incoming: IncomingMessage): Promise<OutgoingMessage> {
    const startTime = Date.now();
    logger.info('Processing message', { platform: incoming.platform, userId: incoming.userId, textLength: incoming.text.length });
    pushActivity('message', `${incoming.userName}: ${incoming.text.slice(0, 80)}${incoming.text.length > 80 ? '...' : ''}`, { platform: incoming.platform });

    // ── 0. Mode-switch command detection ──
    const modeCmd = detectModeCommand(incoming.text);
    if (modeCmd) {
      userModeOverrides.set(incoming.userId, modeCmd);
      const modeNames: Record<ResponseMode, string> = { quick: 'מהיר (Quick)', auto: 'אוטומטי (Auto)', deep: 'מעמיק (Deep)' };
      const responseText = `מצב ${modeNames[modeCmd]} הופעל.\n\n• **מהיר** — תגובה מהירה בלי סוכנים, מתאים לשיחה רגילה\n• **אוטומטי** — המערכת מחליטה מתי להפעיל סוכנים\n• **מעמיק** — כל הסוכנים פעילים, ניתוח מלא`;
      if (this.saveMessage) {
        await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text);
        await this.saveMessage(incoming.userId, incoming.platform, 'assistant', responseText);
      }
      return { text: responseText, format: 'markdown', agentUsed: 'system', provider: 'local' };
    }

    // ── 0b. Determine response mode ──
    const userMode = incoming.responseMode ?? userModeOverrides.get(incoming.userId) ?? 'auto';
    const effectiveMode = userMode === 'auto' ? autoDetectMode(incoming.text) : userMode;
    logger.info('Response mode', { userMode, effectiveMode, textLength: incoming.text.length });

    // Wrap saveMessage to auto-inject conversationId from the incoming message
    const _origSave = this.saveMessage;
    if (_origSave && incoming.conversationId) {
      this.saveMessage = async (userId, platform, role, content, metadata?) => {
        await _origSave(userId, platform, role, content, { ...metadata, _conversationId: incoming.conversationId });
      };
    }

    try {
      // ── QUICK MODE: Minimal processing — skip intent classification, meta-agent, crew ──
      if (effectiveMode === 'quick') {
        return await this.processQuick(incoming, startTime);
      }

      // 1. Load conversation history (filter out empty messages that would cause API errors)
      const rawHistory = this.getHistory ? await this.getHistory(incoming.userId, incoming.platform, 20, incoming.conversationId) : [];
      const history = rawHistory.filter(m => {
        if (typeof m.content === 'string') return m.content.trim().length > 0;
        if (Array.isArray(m.content)) return m.content.length > 0;
        return false;
      });

      // 2. Classify intent (using history for context)
      const contextSummary = history.slice(-6).map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n');
      const routing = await this.router.classify(incoming.text, contextSummary);
      logger.info('Intent classified', { intent: routing.intent, confidence: routing.confidence, agent: routing.agentId });
      incoming.onProgress?.({ type: 'status', message: `Classifying intent → ${routing.agentId} (${Math.round(routing.confidence * 100)}% confidence)` });

      // 2a. Desktop control — intercept before normal AI flow
      if (
        (routing.intent === Intent.DESKTOP_CONTROL || routing.intent === Intent.DESKTOP_SCREENSHOT) &&
        this.desktopVision
      ) {
        // Approval gate — desktop control is high-risk
        // Auto-approve for authenticated web users (they explicitly typed the command)
        let approved = incoming.platform === 'web';
        if (approved) {
          incoming.onProgress?.({ type: 'status', message: 'Auto-approved desktop control (web user)' });
          logger.info('Approval auto-granted for web user', { userId: incoming.userId, action: `desktop:${routing.intent}` });
        } else {
          const gate = getApprovalGate();
          approved = await gate.requestApproval({
            agentId: routing.agentId ?? 'desktop-controller',
            action: `desktop:${routing.intent}`,
            description: `Desktop control: ${incoming.text.slice(0, 200)}`,
            riskCategory: 'desktop_control',
            riskScore: 0.8,
            timeoutMs: 60_000,
          });
        }
        if (!approved) {
          return {
            text: 'Desktop control action was not approved. The request timed out or was denied.',
            format: 'text',
            agentUsed: 'approval-gate',
          };
        }

        const result = await this.desktopVision.executeTask(incoming.text, incoming.userId);
        const responseText = result.success
          ? `${result.summary}\n\n(${result.steps} step${result.steps !== 1 ? 's' : ''} executed)`
          : `Desktop task failed: ${result.summary}`;

        if (this.saveMessage) {
          await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text, { intent: routing.intent });
          await this.saveMessage(incoming.userId, incoming.platform, 'assistant', responseText, { agent: 'desktop-controller' });
        }

        return {
          text: responseText,
          format: 'markdown',
          agentUsed: 'desktop-controller',
          provider: 'local',
        };
      }

      // 2b. Project Builder — intercept build_project intent
      if (routing.intent === Intent.BUILD_PROJECT) {
        // Approval gate — building projects creates files/directories
        // Auto-approve for authenticated web users (they explicitly typed the command)
        let approved = incoming.platform === 'web';
        if (approved) {
          incoming.onProgress?.({ type: 'status', message: 'Auto-approved project build (web user)' });
          logger.info('Approval auto-granted for web user', { userId: incoming.userId, action: 'build_project' });
        } else {
          const gate = getApprovalGate();
          approved = await gate.requestApproval({
            agentId: routing.agentId ?? 'project-builder',
            action: 'build_project',
            description: `Build project: ${incoming.text.slice(0, 200)}`,
            riskCategory: 'filesystem_write',
            riskScore: 0.6,
            timeoutMs: 120_000,
          });
        }
        if (!approved) {
          return {
            text: 'Project build was not approved. The request timed out or was denied.',
            format: 'text',
            agentUsed: 'approval-gate',
          };
        }

        const templates = this.projectBuilder.getTemplateList();
        const templateList = templates.map(t => `- **${t.id}**: ${t.name} — ${t.description} (${t.stack})`).join('\n');
        const projects = await this.projectBuilder.listProjects();
        const projectList = projects.length > 0 ? `\n\nExisting projects: ${projects.join(', ')}` : '';

        // Use AI to decide what to build based on user request
        const planResponse = await this.ai.chat({
          systemPrompt: `You are ClawdAgent's Project Builder. The user wants to build something. Analyze their request and respond with a JSON plan.

Available templates:
${templateList}
${projectList}

Respond with ONLY valid JSON:
{"action":"scaffold"|"list"|"status"|"logs","templateId":"<id>","projectName":"<name>","description":"<desc>","port":3001}

If the user just wants to see templates or projects, use action "list".
If they want to check a running project, use "status" with projectName.`,
          messages: [{ role: 'user', content: incoming.text }],
          maxTokens: 300,
          temperature: 0.2,
        });

        try {
          const plan = extractJSON(planResponse.content);

          let responseText: string;
          if (plan.action === 'list') {
            responseText = `**Available Templates:**\n${templateList}${projectList}`;
          } else if (plan.action === 'status') {
            const status = await this.projectBuilder.getStatus(plan.projectName);
            responseText = `Project **${plan.projectName}**: ${status}`;
          } else if (plan.action === 'logs') {
            const logs = await this.projectBuilder.getLogs(plan.projectName);
            responseText = `**Logs for ${plan.projectName}:**\n\`\`\`\n${logs}\n\`\`\``;
          } else {
            const result = await this.projectBuilder.fullPipeline(
              plan.templateId, plan.projectName, plan.port ?? 3001,
              { description: plan.description ?? '' },
            );
            const parts = [`**Scaffold:** ${result.scaffold.message}`];
            if (result.install) parts.push(`**Install:** ${result.install.message}`);
            if (result.build) parts.push(`**Build:** ${result.build.message}`);
            if (result.docker) parts.push(`**Docker:** ${result.docker.message}`);
            if (result.deploy) parts.push(`**Deploy:** ${result.deploy.message}`);
            responseText = parts.join('\n');
          }

          if (this.saveMessage) {
            await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text, { intent: routing.intent });
            await this.saveMessage(incoming.userId, incoming.platform, 'assistant', responseText, { agent: 'project-builder' });
          }

          return { text: responseText, format: 'markdown', agentUsed: 'project-builder', provider: 'local' };
        } catch {
          // Fall through to normal AI flow if JSON parsing fails
        }
      }

      // 2c-pre. Reminder — intercept one-time reminders via BullMQ delayed job
      if (routing.intent === Intent.REMINDER_SET) {
        try {
          const parseResponse = await this.ai.chat({
            systemPrompt: `Parse this reminder request. Respond with ONLY valid JSON:\n{"delayMinutes":<number>,"message":"<reminder text>"}\nExamples: "remind me in 5 minutes to call" → {"delayMinutes":5,"message":"Call"}\n"שלח לי הודעה בעוד דקה" → {"delayMinutes":1,"message":"תזכורת"}\n"remind me tomorrow" → {"delayMinutes":1440,"message":"Reminder"}`,
            messages: [{ role: 'user', content: incoming.text }],
            maxTokens: 200, temperature: 0.1,
          });
          const plan = extractJSON<{ delayMinutes: number; message: string }>(parseResponse.content);
          const delayMs = Math.max(1, plan.delayMinutes) * 60 * 1000;
          await scheduleReminder({ userId: incoming.userId, message: plan.message, platform: incoming.platform }, delayMs);
          const responseText = `⏰ תזכורת נקבעה בעוד ${plan.delayMinutes} דקות: "${plan.message}"`;
          if (this.saveMessage) {
            await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text, { intent: routing.intent });
            await this.saveMessage(incoming.userId, incoming.platform, 'assistant', responseText, { agent: 'reminder' });
          }
          return { text: responseText, format: 'markdown' as const, agentUsed: 'reminder', provider: 'local' };
        } catch { /* fall through to normal AI */ }
      }

      // 2c. Schedule / Cron — intercept
      if (routing.intent === Intent.SCHEDULE && this.cronEngine) {
        try {
          const parseResponse = await this.ai.chat({
            systemPrompt: `Parse this scheduling request. Respond with ONLY valid JSON:\n{"action":"add"|"list"|"remove","name":"<task name>","schedule":"<natural language or cron>","message":"<what to send>","taskId":"<id for remove>"}`,
            messages: [{ role: 'user', content: incoming.text }],
            maxTokens: 300, temperature: 0.1,
          });
          const plan = extractJSON(parseResponse.content);
          let responseText: string;
          if (plan.action === 'list') {
            const tasks = this.cronEngine.listTasks();
            responseText = tasks.length === 0 ? 'No scheduled tasks.'
              : tasks.map(t => `- **${t.name}** (\`${t.expression}\`) — ${t.enabled ? '✅' : '⏸️'}`).join('\n');
          } else if (plan.action === 'remove') {
            await this.cronEngine.removeTask(plan.taskId);
            responseText = `Removed scheduled task: ${plan.taskId}`;
          } else {
            const expr = parseCronExpression(plan.schedule) ?? '0 9 * * *';
            const task: CronTask = {
              id: `cron_${Date.now()}`, userId: incoming.userId, name: plan.name ?? 'Scheduled task',
              expression: expr, action: 'send_message',
              actionData: { message: plan.message ?? plan.name ?? 'Reminder' },
              platform: incoming.platform, enabled: true, createdAt: new Date().toISOString(),
            };
            await this.cronEngine.addTask(task);
            responseText = `✅ Scheduled: **${task.name}**\nCron: \`${expr}\``;
          }
          if (this.saveMessage) {
            await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text, { intent: routing.intent });
            await this.saveMessage(incoming.userId, incoming.platform, 'assistant', responseText, { agent: 'scheduler' });
          }
          return { text: responseText, format: 'markdown' as const, agentUsed: 'scheduler', provider: 'local' };
        } catch { /* fall through to normal AI */ }
      }

      // 2d. Email — intercept
      if (routing.intent === Intent.EMAIL) {
        try {
          const parseResponse = await this.ai.chat({
            systemPrompt: `Parse this email request. Respond with ONLY valid JSON:\n{"action":"send"|"list"|"search","to":"<email>","subject":"<subject>","body":"<body>","query":"<search query>","count":5}`,
            messages: [{ role: 'user', content: incoming.text }],
            maxTokens: 300, temperature: 0.1,
          });
          const plan = extractJSON(parseResponse.content);
          let responseText: string;
          if (plan.action === 'send') {
            // Approval gate — sending email is irreversible
            // Auto-approve for authenticated web users (they explicitly typed the command)
            let emailApproved = incoming.platform === 'web';
            if (emailApproved) {
              incoming.onProgress?.({ type: 'status', message: `Auto-approved email send to ${plan.to} (web user)` });
              logger.info('Approval auto-granted for web user', { userId: incoming.userId, action: 'email:send' });
            } else {
              const gate = getApprovalGate();
              emailApproved = await gate.requestApproval({
                agentId: routing.agentId ?? 'email',
                action: `email:send`,
                description: `Send email to ${plan.to}: "${(plan.subject ?? '').slice(0, 100)}"`,
                riskCategory: 'outgoing_communication',
                riskScore: 0.6,
                timeoutMs: 120_000,
              });
            }
            if (!emailApproved) {
              return { text: 'Email send was not approved. Action cancelled.', format: 'text' as const, agentUsed: 'approval-gate' };
            }
            const { sendEmail } = await import('../actions/email/gmail.js');
            await sendEmail(plan.to, plan.subject, plan.body);
            responseText = `✅ Email sent to ${plan.to}: "${plan.subject}"`;
          } else if (plan.action === 'search') {
            const { searchEmails } = await import('../actions/email/gmail.js');
            const emails = await searchEmails(plan.query, plan.count ?? 5);
            responseText = emails.length === 0 ? 'No emails found.'
              : emails.map(e => `- **${e.subject}** from ${e.from} (${e.date})\n  ${e.snippet}`).join('\n\n');
          } else {
            const { listEmails } = await import('../actions/email/gmail.js');
            const emails = await listEmails(plan.count ?? 10);
            responseText = emails.length === 0 ? 'Inbox empty.'
              : emails.map(e => `${e.isUnread ? '🔵' : '⚪'} **${e.subject}** — ${e.from}\n  ${e.snippet}`).join('\n\n');
          }
          if (this.saveMessage) {
            await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text, { intent: routing.intent });
            await this.saveMessage(incoming.userId, incoming.platform, 'assistant', responseText, { agent: 'email' });
          }
          return { text: responseText, format: 'markdown' as const, agentUsed: 'email', provider: 'local' };
        } catch (err: any) {
          logger.warn('Email intercept failed, falling through', { error: err.message });
        }
      }

      // 2e. Document / RAG — intercept
      if (routing.intent === Intent.DOCUMENT && this.ragEngine) {
        if (incoming.attachments?.length) {
          const results: string[] = [];
          for (const att of incoming.attachments) {
            try {
              const result = await this.ragEngine.ingestDocument(att.url, incoming.userId);
              results.push(`✅ **${result.source}** ingested (${result.chunks} chunks)`);
            } catch (err: any) {
              results.push(`❌ Failed: ${err.message}`);
            }
          }
          const responseText = results.join('\n');
          if (this.saveMessage) {
            await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text, { intent: routing.intent });
            await this.saveMessage(incoming.userId, incoming.platform, 'assistant', responseText, { agent: 'rag' });
          }
          return { text: responseText, format: 'markdown' as const, agentUsed: 'rag', provider: 'local' };
        }
        const docs = this.ragEngine.listDocuments(incoming.userId);
        if (incoming.text.match(/list|רשימ|documents|מסמכ/i)) {
          const responseText = docs.length === 0 ? 'No documents stored.'
            : `**Your documents:**\n${docs.map(d => `- ${d}`).join('\n')}\n\n${this.ragEngine.getChunkCount(incoming.userId)} total chunks`;
          if (this.saveMessage) {
            await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text, { intent: routing.intent });
            await this.saveMessage(incoming.userId, incoming.platform, 'assistant', responseText, { agent: 'rag' });
          }
          return { text: responseText, format: 'markdown' as const, agentUsed: 'rag', provider: 'local' };
        }
        // Query RAG for context — inject into message and fall through to normal AI
        if (docs.length > 0) {
          const ragContext = await this.ragEngine.query(incoming.text, incoming.userId);
          if (ragContext) {
            incoming.text = `${incoming.text}\n\n--- Relevant documents ---\n${ragContext}`;
          }
        }
      }

      // 2f. Calendar — intercept
      if (routing.intent === Intent.CALENDAR) {
        try {
          const parseResponse = await this.ai.chat({
            systemPrompt: `Parse this calendar request. Respond with ONLY valid JSON:\n{"action":"list"|"create"|"delete","title":"<event>","start":"<ISO datetime>","end":"<ISO datetime>","description":"","eventId":"<id>"}`,
            messages: [{ role: 'user', content: incoming.text }],
            maxTokens: 300, temperature: 0.1,
          });
          const plan = extractJSON(parseResponse.content);
          const { listEvents, createEvent, deleteEvent } = await import('../actions/calendar/google-calendar.js');
          let responseText: string;
          if (plan.action === 'create') {
            const event = await createEvent(plan.title, plan.start, plan.end, plan.description);
            responseText = `✅ Event created: **${event.title}**\n${event.start} → ${event.end}`;
          } else if (plan.action === 'delete') {
            await deleteEvent(plan.eventId);
            responseText = '✅ Event deleted';
          } else {
            const events = await listEvents();
            responseText = events.length === 0 ? 'No upcoming events.'
              : events.map(e => `- **${e.title}**\n  ${e.start} → ${e.end}${e.location ? `\n  📍 ${e.location}` : ''}`).join('\n\n');
          }
          if (this.saveMessage) {
            await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text, { intent: routing.intent });
            await this.saveMessage(incoming.userId, incoming.platform, 'assistant', responseText, { agent: 'calendar' });
          }
          return { text: responseText, format: 'markdown' as const, agentUsed: 'calendar', provider: 'local' };
        } catch (err: any) {
          logger.warn('Calendar intercept failed, falling through', { error: err.message });
        }
      }

      // 2g. Usage / Costs — intercept
      if (routing.intent === Intent.USAGE && this.usageTracker) {
        const summary = this.usageTracker.getTodaySummary();
        const monthCost = this.usageTracker.getMonthCost();
        const modelBreakdown = Object.entries(summary.byModel)
          .map(([m, c]) => `  - ${m}: $${c.toFixed(4)}`).join('\n');
        const responseText = `**Usage Summary**\nToday: $${summary.totalCost.toFixed(4)} (${summary.totalCalls} calls)\nMonth: $${monthCost.toFixed(4)}${Object.keys(summary.byModel).length > 0 ? `\n\n**By model:**\n${modelBreakdown}` : ''}\n\nBudget: ${this.usageTracker.isOverBudget() ? '⚠️ Over budget!' : '✅ Within budget'}`;
        if (this.saveMessage) {
          await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text, { intent: routing.intent });
          await this.saveMessage(incoming.userId, incoming.platform, 'assistant', responseText, { agent: 'usage' });
        }
        return { text: responseText, format: 'markdown' as const, agentUsed: 'usage', provider: 'local' };
      }

      // 2h. Phone — intercept SMS/call
      if (routing.intent === Intent.PHONE) {
        try {
          const parseResponse = await this.ai.chat({
            systemPrompt: `Parse this phone request. Respond with ONLY valid JSON:\n{"action":"sms"|"call","to":"<phone number with country code>","message":"<message text>"}`,
            messages: [{ role: 'user', content: incoming.text }],
            maxTokens: 200, temperature: 0.1,
          });
          const plan = extractJSON<{ action: string; to: string; message: string }>(parseResponse.content);
          const { getPhoneService } = await import('../actions/phone/twilio.js');
          const phone = await getPhoneService();
          if (!phone.available) throw new Error('Phone service not configured (set TWILIO_* env vars)');
          const result = plan.action === 'call'
            ? await phone.makeCall(plan.to, plan.message)
            : await phone.sendSMS(plan.to, plan.message);
          const responseText = `✅ ${result}`;
          if (this.saveMessage) {
            await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text, { intent: routing.intent });
            await this.saveMessage(incoming.userId, incoming.platform, 'assistant', responseText, { agent: 'phone' });
          }
          return { text: responseText, format: 'markdown' as const, agentUsed: 'phone', provider: 'local' };
        } catch (err: any) {
          logger.warn('Phone intercept failed, falling through', { error: err.message });
        }
      }

      // 2i. Meta-agent think step — skip for simple intents AND auto-mode short messages
      const SIMPLE_INTENTS = new Set([
        Intent.GENERAL_CHAT, Intent.HELP, Intent.SETTINGS, Intent.USAGE,
        Intent.TASK_LIST, Intent.REMINDER_SET, Intent.CALENDAR,
        Intent.QUESTION_ANSWER, Intent.REMEMBER, Intent.WHATSAPP_CONNECT,
        Intent.PHONE, Intent.EMAIL,
      ]);
      let metaThinking = '';
      const skipMeta = SIMPLE_INTENTS.has(routing.intent)
        || (effectiveMode === 'auto' && incoming.text.length < 300);  // auto mode skips meta for short messages
      if (!skipMeta) {
        incoming.onProgress?.({ type: 'thinking', message: 'Thinking deeply about this...' });
        const thought = await this.meta.think(incoming.text, contextSummary);
        metaThinking = thought.situation ?? '';
        if (thought.plan?.length) {
          metaThinking += '\n' + thought.plan.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n');
          incoming.onProgress?.({ type: 'thinking', message: `Plan: ${thought.plan.slice(0, 3).join(' → ')}${thought.plan.length > 3 ? '...' : ''}` });
        }
        logger.info('Meta-agent thought', { situation: thought.situation, confidence: thought.confidence, planSteps: thought.plan?.length ?? 0 });
      } else {
        logger.info('Skipping meta-agent', { intent: routing.intent, mode: effectiveMode, textLength: incoming.text.length });
      }

      // 3. Select agent
      const agent = getAgent(routing.agentId) ?? getAgent('general')!;
      incoming.onProgress?.({ type: 'agent', message: `${agent.name} is handling this`, agent: agent.id });

      // 4. Match skills
      const matchedSkill = this.skills.matchSkill(incoming.text);
      if (matchedSkill) {
        logger.info('Skill matched', { skill: matchedSkill.id, name: matchedSkill.name });
      }

      // 5. Load full context (knowledge, tasks, servers, skills, cross-platform)
      incoming.onProgress?.({ type: 'status', message: 'Loading context & memory...' });
      const [knowledgeStr, tasksStr, serversStr, knowledgeCount, crossPlatformStr] = await Promise.all([
        this.getUserKnowledge ? this.getUserKnowledge(incoming.userId) : '',
        this.getUserTasks ? this.getUserTasks(incoming.userId) : '',
        this.getUserServers ? this.getUserServers(incoming.userId) : '',
        this.getKnowledgeCount ? this.getKnowledgeCount(incoming.userId) : 0,
        this.getCrossPlatformSummary ? this.getCrossPlatformSummary(incoming.userId, incoming.platform) : '',
      ]);

      // ── Intelligence: enrich context with live intelligence data ──
      let evolutionContext: FullContext['evolution'] | undefined;
      if (isBridgeReady() && this.evolution) {
        const intel = getIntelligenceContext();
        evolutionContext = {
          phase: 'active',
          totalSkills: this.skills.getSkillCount(),
          healthIndex: intel.healthIndex,
          governanceBudget: intel.governanceBudget,
          activeGoals: intel.activeGoals,
          pendingSelfTasks: intel.pendingSelfTasks,
          disabledAgents: intel.disabledAgents,
          costToday: intel.costToday,
        };
      }

      const fullContext: FullContext = {
        history,
        knowledge: knowledgeStr,
        pendingTasks: tasksStr,
        servers: serversStr,
        skills: this.skills.getSkillsSummary(),
        activeSkill: matchedSkill ? { name: matchedSkill.name, prompt: matchedSkill.prompt } : null,
        providers: this.ai.getAvailableProviders(),
        knowledgeCount,
        goals: this.goals.getGoalsSummary(incoming.userId),
        crossPlatformActivity: crossPlatformStr || undefined,
        ...(evolutionContext ? { evolution: evolutionContext } : {}),
      };

      // 6. Build system prompt with full context
      const agentTools = agent.tools.filter(t => t !== 'desktop');
      const systemPrompt = buildSystemPromptWithContext(agent.systemPrompt, {
        userName: incoming.userName,
        platform: incoming.platform,
        intent: routing.intent,
        params: routing.extractedParams,
        fullContext,
        activeTools: agentTools,
      });

      // 7. Build message array with history (generous window for continuity)
      const trimmedHistory = trimHistoryToFit(history, 16000);

      // If we had to trim, prepend a summary note so the AI knows there's earlier context
      const messages: Message[] = [];
      if (history.length > trimmedHistory.length) {
        const droppedCount = history.length - trimmedHistory.length;
        messages.push({ role: 'user', content: `[System note: ${droppedCount} earlier messages in this conversation were trimmed for context. The most recent messages follow. If the user references something from earlier, acknowledge you may need them to remind you.]` });
      }
      messages.push(...trimmedHistory, { role: 'user', content: incoming.text });

      // 8. Smart model/provider selection
      //
      // Simple intents (greetings, help, etc.) don't need tools even if the agent has them.
      // This lets us use CLI (FREE) instead of Anthropic API for simple messages.
      const TOOLLESS_INTENTS = new Set([
        Intent.GENERAL_CHAT, Intent.HELP, Intent.SETTINGS,
        Intent.QUESTION_ANSWER, Intent.REMEMBER,
      ]);
      const skipTools = TOOLLESS_INTENTS.has(routing.intent);
      const toolDefs = (!skipTools && agentTools.length > 0) ? getToolDefinitions(agentTools) : [];
      if (skipTools && agentTools.length > 0) {
        logger.info('Skipping tools for simple intent', { intent: routing.intent, agentTools: agentTools.length });
      }

      const lastMsg = messages[messages.length - 1]?.content ?? '';
      const lastMsgStr = typeof lastMsg === 'string' ? lastMsg : '';
      const hasHebrew = /[\u0590-\u05FF]/.test(lastMsgStr);

      let selectedModelId: string | undefined;
      let selectedProvider: 'anthropic' | 'openrouter' | 'claude-code' | 'ollama' | undefined;

      // User model override from UI selector
      const userModelOverride = incoming.model && incoming.model !== 'auto'
        ? findModel(incoming.model) : null;

      // Provider mode drives provider selection
      const { resolved: resolvedMode } = this.ai.getProviderMode();
      const claudeCodeActive = this.ai.getAvailableProviders().includes('claude-code');
      const needsTools = toolDefs.length > 0;

      if (incoming.model === 'claude-code-cli') {
        // Special: user explicitly selected Claude Code CLI
        selectedProvider = 'claude-code';
        selectedModelId = undefined;
        logger.info('Model override from UI', { model: 'Claude Code CLI (Opus 4.6)', provider: 'claude-code' });
      } else if (userModelOverride) {
        selectedModelId = userModelOverride.id;
        selectedProvider = userModelOverride.provider as typeof selectedProvider;
        logger.info('Model override from UI', { model: userModelOverride.name, provider: userModelOverride.provider, tier: userModelOverride.tier });
      } else if (resolvedMode === 'local' && config.OLLAMA_ENABLED) {
        // LOCAL mode: Ollama-first with per-agent model assignment
        const ollamaModel = resolveOllamaModel(agent.id, agent.preferredOllamaModel);
        if (ollamaModel) {
          // Check if model supports tools when needed
          if (needsTools && !ollamaModel.supportsTools) {
            // Fallback to a tool-capable Ollama model
            const toolModel = resolveOllamaModel(agent.id, config.OLLAMA_TOOL_MODEL);
            selectedModelId = toolModel?.ollamaTag ?? config.OLLAMA_TOOL_MODEL;
            logger.info('Ollama model lacks tool support, using tool model', {
              agent: agent.id, original: ollamaModel.id, fallback: selectedModelId,
            });
          } else {
            selectedModelId = ollamaModel.ollamaTag;
          }
          selectedProvider = 'ollama';
          logger.info('Model selected', {
            provider: 'ollama', mode: 'local', model: ollamaModel.displayName,
            agent: agent.id, supportsTools: ollamaModel.supportsTools,
          });
        } else {
          // No Ollama model mapped — use default Ollama model
          selectedModelId = config.OLLAMA_DEFAULT_MODEL;
          selectedProvider = 'ollama';
          logger.info('Model selected', { provider: 'ollama', mode: 'local', model: selectedModelId, reason: 'default' });
        }
      } else if (resolvedMode === 'max' && claudeCodeActive) {
        // MAX mode: Claude Code CLI for ALL requests (FREE — Max subscription)
        // Tools are embedded in the prompt and tool_call tags are parsed from response
        selectedProvider = 'claude-code';
        selectedModelId = undefined;
        logger.info('Model selected', { provider: 'claude-code', mode: 'max', reason: 'FREE — Max subscription', tools: needsTools ? agentTools.length : 0 });
      } else if (resolvedMode === 'pro') {
        // PRO mode: Anthropic API primary
        selectedProvider = 'anthropic';
        selectedModelId = config.AI_MODEL;
        logger.info('Model selected', { provider: 'anthropic', mode: 'pro', model: config.AI_MODEL });
      } else if (resolvedMode === 'economy') {
        // ECONOMY mode: OpenRouter free models → model router for cost optimization
        const modelOverride = config.MODEL_OVERRIDE;
        if (modelOverride) {
          selectedModelId = modelOverride;
          selectedProvider = modelOverride.includes('/') ? 'openrouter' : 'anthropic';
        } else {
          const complexity = classifyComplexity({
            intent: routing.intent,
            messageLength: lastMsgStr.length,
            hasTools: needsTools,
            requiresHebrew: hasHebrew,
            requiresVision: false,
            isMultiStep: toolDefs.length > 3,
          });

          const selectedModel = selectModel({
            complexity,
            requiresTools: needsTools,
            requiresHebrew: hasHebrew,
            requiresVision: false,
            dailyBudgetLeft: this.usageTracker?.getDailyBudgetLeft() ?? 10,
            preferFree: config.PREFER_FREE_MODELS,
            isSubAgent: false, // Main request — always use strong models
          });

          selectedModelId = selectedModel.id;
          selectedProvider = selectedModel.provider;
          logger.info('Model selected', {
            mode: 'economy', complexity, model: selectedModel.name, tier: selectedModel.tier,
            cost: `$${selectedModel.costPer1kInput}/$${selectedModel.costPer1kOutput}`,
          });
        }
      } else {
        // Fallback: CLI if available, else API
        if (claudeCodeActive) {
          selectedProvider = 'claude-code';
          selectedModelId = undefined;
        } else {
          selectedProvider = 'anthropic';
          selectedModelId = config.AI_MODEL;
        }
        logger.info('Model selected', { provider: selectedProvider, mode: resolvedMode, reason: 'fallback' });
      }

      // ── Adaptive Thinking Mode ──
      // Compute effort level → map to thinking config for supported providers
      const effortLevel = classifyEffort({
        intent: routing.intent,
        complexity: classifyComplexity({
          intent: routing.intent,
          messageLength: lastMsgStr.length,
          hasTools: needsTools,
          requiresHebrew: hasHebrew,
          requiresVision: false,
          isMultiStep: toolDefs.length > 3,
        }),
        messageLength: lastMsgStr.length,
      });
      const thinkingConfig = mapEffortToThinking(effortLevel, selectedProvider ?? 'anthropic');

      // ── Intelligence: set execution context so tool-executor tracks agent/intent ──
      setExecutionContext(agent.id, routing.intent);

      // ── Crew Orchestrator: detect multi-agent tasks ──
      const crewConfig = this.shouldUseCrew(routing.intent, incoming.text, agent.id);
      if (crewConfig && this.crewOrchestrator) {
        incoming.onProgress?.({ type: 'status', message: `${crewConfig.reason} → ${crewConfig.mode} crew (${crewConfig.members.map(m => m.agentId).join(', ')})` });
        logger.info('Crew triggered', { reason: crewConfig.reason, mode: crewConfig.mode, members: crewConfig.members.map(m => m.agentId), task: crewConfig.task.slice(0, 80) });
        const crewResult = await this.crewOrchestrator.runCrew(crewConfig);

        if (this.saveMessage) {
          await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text, { intent: routing.intent });
          await this.saveMessage(incoming.userId, incoming.platform, 'assistant', crewResult.output, { agent: 'crew', mode: crewConfig.mode });
        }

        return {
          text: crewResult.output,
          format: 'markdown' as const,
          agentUsed: `crew:${crewConfig.mode}`,
          provider: selectedProvider ?? 'anthropic',
        };
      }

      // ── OpenRouter Enhancements ──
      // Apply thinking variant, plugins, and response-healing when going through OpenRouter
      let orPlugins: Array<{ id: string; [key: string]: unknown }> | undefined;
      if (selectedProvider === 'openrouter') {
        // Thinking variant: append :thinking to model ID for high/critical effort
        if ((thinkingConfig as any).useThinkingVariant && selectedModelId) {
          selectedModelId = withVariant(selectedModelId, 'thinking');
        }
        // Response-healing plugin: auto-fix malformed JSON from tool-calling models
        if (needsTools) {
          orPlugins = [{ id: 'response-healing' }];
        }
        // Web plugin: enable web search for agents that have search tools
        if (agentTools.includes('search')) {
          orPlugins = [...(orPlugins || []), { id: 'web' }];
        }
      }

      const providerLabel = selectedProvider === 'claude-code' ? 'Claude Code' : selectedProvider === 'ollama' ? `Ollama (${selectedModelId ?? 'default'})` : selectedProvider ?? 'Anthropic';
      incoming.onProgress?.({ type: 'status', message: `Generating response via ${providerLabel}${needsTools ? ` with ${toolDefs.length} tools` : ''}...` });
      let response;
      if (toolDefs.length > 0) {
        // Agent HAS tools → use chatWithTools (tool execution loop)
        logger.info('Using tool loop', { agent: agent.id, tools: agentTools, toolDefs: toolDefs.length, model: selectedModelId });
        response = await this.ai.chatWithTools(
          {
            systemPrompt,
            messages,
            tools: toolDefs,
            maxTokens: agent.maxTokens,
            temperature: agent.temperature,
            thinkingMode: thinkingConfig.thinkingMode,
            ...(thinkingConfig.thinkingBudget ? { thinkingBudget: thinkingConfig.thinkingBudget } : {}),
            ...(selectedModelId ? { model: selectedModelId } : {}),
            ...(selectedProvider ? { provider: selectedProvider } : {}),
            ...(agent.maxToolIterations ? { maxToolIterations: agent.maxToolIterations } : {}),
            ...(orPlugins ? { plugins: orPlugins } : {}),
            ...(incoming.onTextChunk ? { onTextChunk: incoming.onTextChunk } : {}),
            ...(incoming.onStreamReset ? { onStreamReset: incoming.onStreamReset } : {}),
          },
          async (toolName, toolInput) => {
            const toolAction = toolInput?.action ? ` → ${toolInput.action}` : '';
            incoming.onProgress?.({ type: 'tool', message: `Running ${toolName}${toolAction}...`, tool: toolName });
            if ((toolName === 'task' || toolName === 'db') && !toolInput.userId) {
              toolInput.userId = incoming.userId;
            }
            // Inject user role for permission checks
            toolInput._userRole = incoming.userRole ?? 'user';
            toolInput._userId = incoming.userId;
            const result = await executeTool(toolName, toolInput);
            const resultStr = String(result ?? '');
            const ok = resultStr.length > 0 && !resultStr.startsWith('Error');
            incoming.onProgress?.({ type: 'status', message: `${toolName}${toolAction} ${ok ? 'done' : 'failed'}`, tool: toolName });
            return result;
          },
        );
        if (response.toolsUsed.length > 0) {
          logger.info('Tools used in response', {
            tools: response.toolsUsed,
            iterations: response.iterations,
          });
        }
      } else {
        // Agent has NO tools → regular text-only AI call
        response = await this.ai.chat({
          systemPrompt,
          messages,
          maxTokens: agent.maxTokens,
          temperature: agent.temperature,
          thinkingMode: thinkingConfig.thinkingMode,
          ...(thinkingConfig.thinkingBudget ? { thinkingBudget: thinkingConfig.thinkingBudget } : {}),
          ...(selectedModelId ? { model: selectedModelId } : {}),
          ...(selectedProvider ? { provider: selectedProvider } : {}),
          ...(orPlugins ? { plugins: orPlugins } : {}),
          ...(incoming.onTextChunk ? { onTextChunk: incoming.onTextChunk } : {}),
        });
      }

      // Empty response fallback — don't send blank messages
      if (!response.content || response.content.trim().length === 0) {
        logger.warn('AI returned empty response, using fallback', { agent: agent.id, intent: routing.intent, provider: response.provider });
        response.content = `\u05E7\u05D9\u05D1\u05DC\u05EA\u05D9 \u05D0\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05DC\u05DA \u05D0\u05D1\u05DC \u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05EA\u05D9 \u05DC\u05E2\u05D1\u05D3 \u05D0\u05D5\u05EA\u05D4. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 \u05D0\u05D5 \u05E0\u05E1\u05D7 \u05D0\u05D7\u05E8\u05EA \u{1F504}\n[\u05E1\u05D5\u05DB\u05DF: ${agent.name} | \u05DB\u05D5\u05D5\u05E0\u05D4: ${routing.intent}]`;
      }

      // Track usage for cost monitoring
      if (this.usageTracker && response.usage) {
        this.usageTracker.track({
          provider: response.provider,
          model: response.modelUsed ?? selectedModelId ?? config.AI_MODEL,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          userId: incoming.userId,
          action: routing.intent,
        }).catch(() => {});
      }

      // 9. Save messages to persistent memory (never save empty content)
      if (this.saveMessage) {
        if (incoming.text) {
          await this.saveMessage(incoming.userId, incoming.platform, 'user', incoming.text, {
            platform: incoming.platform, intent: routing.intent,
          });
        }
        if (response.content) {
          await this.saveMessage(incoming.userId, incoming.platform, 'assistant', response.content, {
            agent: agent.id, tokens: response.usage, provider: response.provider, skill: matchedSkill?.id,
          });
        }
      }

      // 10. Learn from conversation (background — don't block response)
      if (this.learnFromConversation) {
        this.learnFromConversation(incoming.userId, incoming.text, response.content).catch(err =>
          logger.warn('Knowledge learning failed', { error: err.message })
        );
      }

      // 10b. Meta-agent reflection (background — non-blocking)
      this.meta.reflect(incoming.text, response.content, true).catch(err =>
        logger.warn('Meta-agent reflection failed', { error: err.message })
      );

      const duration = Date.now() - startTime;

      // ── Intelligence: feed message result into all subsystems ──
      if (isBridgeReady()) {
        onMessageProcessed({
          agentId: agent.id,
          intent: routing.intent,
          success: true,
          latency: duration,
          cost: 0, // Actual cost tracked by usageTracker
          modelId: response.modelUsed ?? selectedModelId,
          provider: response.provider ?? selectedProvider,
          toolsUsed: (response as any).toolsUsed ?? [],
          inputTokens: response.usage?.inputTokens,
          outputTokens: response.usage?.outputTokens,
          userMessage: incoming.text,
          response: response.content,
        });
      }
      logger.info('Message processed', {
        agent: agent.id, provider: response.provider, skill: matchedSkill?.id,
        duration, tokens: response.usage,
      });

      // Collect thinking from meta-agent + AI response
      const thinkingParts: string[] = [];
      if (metaThinking) thinkingParts.push(metaThinking);
      if (response.thinking) thinkingParts.push(response.thinking);
      const thinking = thinkingParts.length > 0 ? thinkingParts.join('\n\n') : undefined;

      pushActivity('response', `[${agent.id}] ${response.content.slice(0, 80)}${response.content.length > 80 ? '...' : ''}`, { agent: agent.id, platform: incoming.platform });

      // ── Social Engineering Detection (Gemini recommendation) ──
      // Scan agent output for attempts to manipulate user into bypassing security
      // High severity = block entirely (Claude's feedback: warn-only is not enough)
      const seResult = detectSocialEngineering(response.content);
      if (seResult.detected && seResult.severity === 'high') {
        logger.error('HIGH social engineering BLOCKED in agent response', {
          agent: agent.id, patterns: seResult.patterns,
        });
        return {
          text: '⛔ Response blocked — high-severity social engineering detected. The agent attempted to manipulate you into bypassing security controls. This incident has been logged.',
          format: 'text',
          agentUsed: `${agent.id}:BLOCKED`,
          provider: response.provider,
        };
      }
      let finalText = redactSecrets(response.content);
      if (seResult.detected && seResult.severity === 'medium') {
        logger.warn('Social engineering detected in agent response', {
          agent: agent.id, severity: seResult.severity, patterns: seResult.patterns,
        });
        finalText = `⚠️ **Security Warning**: This response contains patterns that may attempt to bypass security controls (severity: ${seResult.severity}).\n\n---\n\n${finalText}`;
      }

      return {
        text: finalText,
        thinking,
        format: 'markdown',
        agentUsed: agent.id,
        tokensUsed: response.usage ? { input: response.usage.inputTokens, output: response.usage.outputTokens } : undefined,
        provider: response.provider,
        skillUsed: matchedSkill?.id,
      };

    } catch (error: any) {
      logger.error('Engine processing error', { error: error.message, stack: error.stack });
      pushActivity('error', `Error: ${error.message?.slice(0, 100)}`, { platform: incoming.platform });

      // Self-heal attempt (non-blocking)
      if (this.evolution) {
        this.evolution.selfHeal(error, `Processing message: ${incoming.text.slice(0, 200)}`).catch(() => {});
      }

      // ── Intelligence: record error into memory + observability ──
      if (isBridgeReady()) {
        onError('engine_processing', error.message ?? 'Unknown engine error', {
          agentId: 'engine',
        });
      }

      // Specific Hebrew error messages per error type
      let errorMsg: string;
      const msg = error.message ?? '';
      if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEOUT') || msg.includes('ENETUNREACH')) {
        errorMsg = '\u{274C} \u05D1\u05E2\u05D9\u05D4 \u05D1\u05D7\u05D9\u05D1\u05D5\u05E8 \u05DC\u05E9\u05E8\u05EA. \u05D1\u05D3\u05D5\u05E7 \u05E9\u05D4\u05E9\u05E8\u05EA \u05E4\u05E2\u05D9\u05DC \u05D5\u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1.';
      } else if (msg.includes('rate limit') || msg.includes('429') || msg.includes('quota')) {
        errorMsg = '\u{26A0}\uFE0F \u05D4\u05D2\u05E2\u05EA\u05D9 \u05DC\u05DE\u05D2\u05D1\u05DC\u05EA \u05E7\u05E6\u05D1 \u05E9\u05DC \u05D4-API. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 \u05D1\u05E2\u05D5\u05D3 \u05D3\u05E7\u05D4.';
      } else if (msg.includes('401') || msg.includes('403') || msg.includes('authentication') || msg.includes('unauthorized')) {
        errorMsg = '\u{1F510} \u05D1\u05E2\u05D9\u05D4 \u05D1\u05D4\u05E8\u05E9\u05D0\u05D5\u05EA. \u05D1\u05D3\u05D5\u05E7 \u05E9\u05DE\u05E4\u05EA\u05D7\u05D5\u05EA \u05D4-API \u05EA\u05E7\u05D9\u05E0\u05D9\u05DD.';
      } else if (msg.includes('timeout') || msg.includes('RESPONSE_TIMEOUT')) {
        errorMsg = '\u{23F3} \u05D4\u05E4\u05E2\u05D5\u05DC\u05D4 \u05DC\u05E7\u05D7\u05D4 \u05D9\u05D5\u05EA\u05E8 \u05DE\u05D3\u05D9. \u05E0\u05E1\u05D4 \u05DC\u05E4\u05E9\u05D8 \u05D0\u05EA \u05D4\u05D1\u05E7\u05E9\u05D4.';
      } else {
        errorMsg = `\u{274C} \u05DE\u05E9\u05D4\u05D5 \u05D4\u05E9\u05EA\u05D1\u05E9. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1.\n\u05E9\u05D2\u05D9\u05D0\u05D4: ${msg.slice(0, 150)}`;
      }

      return { text: errorMsg, format: 'text' };
    } finally {
      // Restore original saveMessage if we wrapped it
      if (_origSave) this.saveMessage = _origSave;
    }
  }
}
