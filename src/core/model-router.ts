export type TaskComplexity = 'trivial' | 'simple' | 'medium' | 'complex' | 'critical';

export interface ModelOption {
  id: string;
  provider: 'openrouter' | 'anthropic';
  name: string;
  tier: 'free' | 'cheap' | 'mid' | 'premium' | 'ultra';
  costPer1kInput: number;
  costPer1kOutput: number;
  maxContext: number;
  strengths: string[];
  supportsTools: boolean;
  supportsHebrew: boolean;
  supportsVision: boolean;
}

// ===== STRONG MODELS — Used for main requests and fallbacks =====
// Priority: Anthropic Claude first, then Gemini/DeepSeek
const STRONG_MODELS: ModelOption[] = [
  {
    id: 'anthropic/claude-sonnet-4.6',
    provider: 'openrouter', name: 'Claude Sonnet 4.6 (OpenRouter)',
    tier: 'mid', costPer1kInput: 0.003, costPer1kOutput: 0.015,
    maxContext: 1000000, strengths: ['coding', 'reasoning', 'tool-use', 'hebrew', 'planning', 'adaptive-thinking'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
  {
    id: 'google/gemini-2.5-flash',
    provider: 'openrouter', name: 'Gemini 2.5 Flash',
    tier: 'mid', costPer1kInput: 0.00015, costPer1kOutput: 0.0006,
    maxContext: 1000000, strengths: ['fast', 'general', 'tool-use', 'vision', 'coding', 'large-context'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
  {
    id: 'google/gemini-2.5-pro-preview',
    provider: 'openrouter', name: 'Gemini 2.5 Pro',
    tier: 'premium', costPer1kInput: 0.00125, costPer1kOutput: 0.01,
    maxContext: 1000000, strengths: ['reasoning', 'coding', 'tool-use', 'vision', 'hebrew', 'large-context'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
  {
    id: 'meta-llama/llama-4-maverick',
    provider: 'openrouter', name: 'Llama 4 Maverick (400B MoE)',
    tier: 'mid', costPer1kInput: 0.0005, costPer1kOutput: 0.00077,
    maxContext: 1000000, strengths: ['multimodal', 'vision', 'tool-use', 'coding', 'reasoning', 'large-context'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
  {
    id: 'deepseek/deepseek-v3.2',
    provider: 'openrouter', name: 'DeepSeek V3.2',
    tier: 'cheap', costPer1kInput: 0.00028, costPer1kOutput: 0.00041,
    maxContext: 128000, strengths: ['coding', 'general', 'tool-use', 'reasoning', 'thinking-toggle'],
    supportsTools: true, supportsHebrew: true, supportsVision: false,
  },
  {
    id: 'deepseek/deepseek-r1-0528',
    provider: 'openrouter', name: 'DeepSeek R1 (Reasoning)',
    tier: 'mid', costPer1kInput: 0.00055, costPer1kOutput: 0.00219,
    maxContext: 163840, strengths: ['reasoning', 'math', 'analysis', 'planning', 'coding'],
    supportsTools: false, supportsHebrew: false, supportsVision: false,
  },
];

// ===== NEW MODELS (Feb 2026) =====
const NEW_MODELS: ModelOption[] = [
  {
    id: 'qwen/qwen3.5-397b-a17b',
    provider: 'openrouter', name: 'Qwen3.5 397B (MoE, Vision+Video)',
    tier: 'cheap', costPer1kInput: 0.00015, costPer1kOutput: 0.001,
    maxContext: 262000, strengths: ['reasoning', 'coding', 'vision', 'video', 'tool-use', 'agentic', 'multilingual', 'large-context'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
  {
    id: 'mistralai/mistral-large-3',
    provider: 'openrouter', name: 'Mistral Large 3 (675B MoE)',
    tier: 'mid', costPer1kInput: 0.002, costPer1kOutput: 0.006,
    maxContext: 256000, strengths: ['reasoning', 'coding', 'tool-use', 'vision', 'large-context'],
    supportsTools: true, supportsHebrew: false, supportsVision: true,
  },
  {
    id: 'zhipu/glm-5',
    provider: 'openrouter', name: 'GLM-5 (744B)',
    tier: 'mid', costPer1kInput: 0.001, costPer1kOutput: 0.004,
    maxContext: 128000, strengths: ['reasoning', 'coding', 'agentic', 'systems-engineering'],
    supportsTools: true, supportsHebrew: false, supportsVision: false,
  },
  {
    id: 'minimax/minimax-m2.5',
    provider: 'openrouter', name: 'MiniMax M2.5',
    tier: 'mid', costPer1kInput: 0.0005, costPer1kOutput: 0.002,
    maxContext: 128000, strengths: ['coding', 'productivity', 'general', 'tool-use'],
    supportsTools: true, supportsHebrew: false, supportsVision: false,
  },
  {
    id: 'zhipu/glm-4.7-flash',
    provider: 'openrouter', name: 'GLM 4.7 Flash',
    tier: 'cheap', costPer1kInput: 0.0001, costPer1kOutput: 0.0004,
    maxContext: 128000, strengths: ['fast', 'tool-use', 'thinking', 'general'],
    supportsTools: true, supportsHebrew: false, supportsVision: false,
  },
];

// ===== FREE MODELS — Only for sub-agents and helpers =====
const FREE_MODELS: ModelOption[] = [
  {
    id: 'meta-llama/llama-4-scout:free',
    provider: 'openrouter', name: 'Llama 4 Scout (10M ctx)',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 10000000, strengths: ['tool-use', 'vision', 'multilingual', 'coding', 'large-context'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
  {
    id: 'mistralai/devstral-2:free',
    provider: 'openrouter', name: 'Devstral 2 (Best Free Code)',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 262000, strengths: ['coding', 'agentic', 'tool-use', 'reasoning'],
    supportsTools: true, supportsHebrew: false, supportsVision: false,
  },
  {
    id: 'qwen/qwen3-coder:free',
    provider: 'openrouter', name: 'Qwen3 Coder',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 262000, strengths: ['coding', 'agentic', 'tool-use'],
    supportsTools: true, supportsHebrew: false, supportsVision: false,
  },
  {
    id: 'google/gemma-3-27b-it:free',
    provider: 'openrouter', name: 'Gemma 3 27B (Free Vision)',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 128000, strengths: ['vision', 'general', 'tool-use', 'multilingual'],
    supportsTools: true, supportsHebrew: false, supportsVision: true,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    provider: 'openrouter', name: 'Llama 3.3 70B',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 128000, strengths: ['general', 'tool-use', 'multilingual', 'coding'],
    supportsTools: true, supportsHebrew: true, supportsVision: false,
  },
  {
    id: 'deepseek/deepseek-r1-0528:free',
    provider: 'openrouter', name: 'DeepSeek R1 (Free)',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 163840, strengths: ['reasoning', 'math', 'analysis', 'planning'],
    supportsTools: false, supportsHebrew: false, supportsVision: false,
  },
  {
    id: 'mistralai/mistral-small-3.1-24b-instruct:free',
    provider: 'openrouter', name: 'Mistral Small 3.1',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 128000, strengths: ['general', 'fast', 'tool-use', 'vision'],
    supportsTools: true, supportsHebrew: false, supportsVision: true,
  },
  {
    id: 'nvidia/nemotron-nano-9b-v2:free',
    provider: 'openrouter', name: 'Nemotron Nano 9B',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 128000, strengths: ['fast', 'tool-use', 'general'],
    supportsTools: true, supportsHebrew: false, supportsVision: false,
  },
];

// ===== ANTHROPIC DIRECT =====
const ANTHROPIC_MODELS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic', name: 'Claude Sonnet 4.6',
    tier: 'mid', costPer1kInput: 0.003, costPer1kOutput: 0.015,
    maxContext: 1000000, strengths: ['coding', 'reasoning', 'tool-use', 'hebrew', 'planning', 'adaptive-thinking'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
  {
    id: 'claude-opus-4-6',
    provider: 'anthropic', name: 'Claude Opus 4.6',
    tier: 'ultra', costPer1kInput: 0.005, costPer1kOutput: 0.025,
    maxContext: 1000000, strengths: ['architecture', 'complex-reasoning', 'critical-decisions', 'adaptive-thinking'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'anthropic', name: 'Claude Haiku 4.5',
    tier: 'cheap', costPer1kInput: 0.001, costPer1kOutput: 0.005,
    maxContext: 200000, strengths: ['fast', 'tool-use', 'general', 'hebrew'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
];

const ALL_MODELS = [...STRONG_MODELS, ...NEW_MODELS, ...ANTHROPIC_MODELS, ...FREE_MODELS];

/** Strong fallback models ordered by priority (Claude first) */
export const STRONG_FALLBACK_CHAIN: string[] = [
  'anthropic/claude-sonnet-4.6',
  'google/gemini-2.5-flash',
  'qwen/qwen3.5-397b-a17b',
  'meta-llama/llama-4-maverick',
  'deepseek/deepseek-v3.2',
  'google/gemini-2.5-pro-preview',
  'mistralai/mistral-large-3',
  'zhipu/glm-5',
];

/** Free models for sub-agents only — ordered by capability */
export const SUB_AGENT_MODELS: string[] = [
  'meta-llama/llama-4-scout:free',                      // 10M context, tools, vision
  'mistralai/devstral-2:free',                           // best free coding/agentic
  'qwen/qwen3-coder:free',                              // 262K, strong coding
  'google/gemma-3-27b-it:free',                          // free vision model
  'meta-llama/llama-3.3-70b-instruct:free',              // proven reliable
  'mistralai/mistral-small-3.1-24b-instruct:free',       // fast general
  'deepseek/deepseek-r1-0528:free',                      // reasoning only
];

/**
 * Classify task complexity based on intent, message length, and context.
 */
export function classifyComplexity(params: {
  intent: string;
  messageLength: number;
  hasTools: boolean;
  requiresHebrew: boolean;
  requiresVision: boolean;
  isMultiStep: boolean;
}): TaskComplexity {
  const { intent, messageLength, hasTools, isMultiStep } = params;

  const trivialIntents = ['general_chat'];
  if (trivialIntents.includes(intent) && messageLength < 50 && !hasTools) return 'trivial';

  const simpleIntents = ['reminder_set', 'general_chat', 'help', 'usage'];
  if (simpleIntents.includes(intent) && messageLength < 200) return 'simple';

  const complexIntents = ['code_write', 'code_fix', 'build_project', 'document', 'content_create', 'social_publish', 'orchestrate'];
  if (complexIntents.includes(intent) || isMultiStep) return 'complex';

  const criticalIntents = ['code_review'];
  if (criticalIntents.includes(intent)) return 'critical';

  return 'medium';
}

/**
 * Select the best model for the task.
 * Strategy:
 *   - Main requests: ALWAYS use strong models (Claude → Gemini → DeepSeek)
 *   - Sub-agents: CAN use free/cheap models to save cost
 */
export function selectModel(params: {
  complexity: TaskComplexity;
  requiresTools: boolean;
  requiresHebrew: boolean;
  requiresVision: boolean;
  dailyBudgetLeft: number;
  preferFree: boolean;
  isSubAgent?: boolean;
}): ModelOption {
  const { complexity, requiresTools, requiresHebrew, requiresVision, dailyBudgetLeft, isSubAgent } = params;

  // Filter compatible models
  let candidates = ALL_MODELS.filter(m => {
    if (requiresTools && !m.supportsTools) return false;
    if (requiresVision && !m.supportsVision) return false;
    return true;
  });

  if (candidates.length === 0) candidates = ALL_MODELS;

  // ── Sub-agent mode: CAN use free/cheap models ────────────────
  if (isSubAgent) {
    const free = candidates.filter(m => m.tier === 'free');
    if (free.length > 0) {
      if (requiresHebrew) return free.find(m => m.supportsHebrew) ?? free[0];
      return free[0];
    }
    const cheap = candidates.filter(m => m.tier === 'cheap');
    return cheap[0] ?? candidates[0];
  }

  // ── Main request: ALWAYS use strong models ───────────────────
  // Priority: Anthropic Claude > Gemini > DeepSeek > GLM/Qwen
  const strongCandidates = candidates.filter(m =>
    m.tier === 'mid' || m.tier === 'premium' || m.tier === 'ultra'
  );

  switch (complexity) {
    case 'trivial':
    case 'simple': {
      // Even simple tasks get strong models — use the cheapest strong one
      const cheapStrong = strongCandidates.filter(m => m.tier === 'mid');
      if (requiresHebrew) return cheapStrong.find(m => m.supportsHebrew) ?? cheapStrong[0] ?? candidates[0];
      return cheapStrong[0] ?? candidates[0];
    }

    case 'medium': {
      const mid = strongCandidates.filter(m => m.tier === 'mid' && m.supportsTools);
      if (requiresHebrew) return mid.find(m => m.supportsHebrew) ?? mid[0] ?? candidates[0];
      return mid[0] ?? candidates[0];
    }

    case 'complex': {
      // Prefer Claude Sonnet or Gemini Pro for complex tasks
      const preferred = strongCandidates.filter(m =>
        (m.tier === 'mid' || m.tier === 'premium') && m.supportsTools
      );
      if (requiresHebrew) return preferred.find(m => m.supportsHebrew) ?? preferred[0] ?? candidates[0];
      return preferred[0] ?? candidates[0];
    }

    case 'critical': {
      // Ultra tier if available (Claude Opus)
      const ultra = strongCandidates.filter(m => m.tier === 'ultra');
      if (ultra.length > 0 && dailyBudgetLeft > 2.00) return ultra[0];
      const premium = strongCandidates.filter(m => m.tier === 'premium' || m.tier === 'mid');
      if (requiresHebrew) return premium.find(m => m.supportsHebrew) ?? premium[0] ?? candidates[0];
      return premium[0] ?? candidates[0];
    }
  }

  return strongCandidates[0] ?? candidates[0] ?? ALL_MODELS[0];
}

/**
 * Convert Anthropic-format messages to OpenAI chat format.
 * This is needed when routing tool-loop messages through OpenRouter.
 */
export function convertMessagesToOpenAI(messages: Array<{ role: string; content: string | any[] }>, systemPrompt?: string): any[] {
  const result: any[] = [];
  if (systemPrompt) result.push({ role: 'system', content: systemPrompt });

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    if (!Array.isArray(msg.content)) {
      result.push({ role: msg.role, content: String(msg.content ?? '') });
      continue;
    }

    // Array content — check for Anthropic tool blocks
    const textParts: string[] = [];
    const toolCalls: any[] = [];
    const toolResults: any[] = [];

    for (const block of msg.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        });
      } else if (block.type === 'tool_result') {
        toolResults.push({
          role: 'tool',
          tool_call_id: block.tool_use_id,
          content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
        });
      }
    }

    if (toolCalls.length > 0) {
      // Assistant message with tool calls (OpenAI format)
      result.push({
        role: 'assistant',
        content: textParts.join('\n') || null,
        tool_calls: toolCalls,
      });
    } else if (toolResults.length > 0) {
      // Each tool result is a separate 'tool' message in OpenAI format
      for (const tr of toolResults) {
        result.push(tr);
      }
    } else {
      result.push({ role: msg.role, content: textParts.join('\n') });
    }
  }

  return result;
}

/**
 * Classify effort level based on task complexity.
 * Maps to Claude's Effort Level system: low/medium/high.
 * With Opus 4.6, effort is adaptive — the model adjusts thinking depth automatically.
 * For Haiku/Sonnet, explicitly setting effort level improves cost/speed.
 */
export type EffortLevel = 'low' | 'medium' | 'high' | 'critical';

export function classifyEffort(params: {
  intent: string;
  complexity: TaskComplexity;
  messageLength: number;
}): EffortLevel {
  const { intent, complexity, messageLength } = params;

  // Critical: deployments, security audits, autonomous tasks
  const criticalIntents = ['code_review', 'autonomous_task', 'self_diagnose'];
  if (criticalIntents.includes(intent) || complexity === 'critical') return 'critical';

  // High: multi-tool tasks, content creation, server operations, complex code
  const highIntents = ['code_write', 'code_fix', 'build_project', 'content_create', 'orchestrate', 'server_deploy', 'server_fix'];
  if (highIntents.includes(intent) || complexity === 'complex') return 'high';

  // Low: greetings, simple questions, status checks, help
  const lowIntents = ['general_chat', 'help', 'settings', 'usage'];
  if (lowIntents.includes(intent) && messageLength < 100) return 'low';

  // Medium: everything else — search, tasks, single tool use
  return 'medium';
}

/**
 * Map effort level to thinking mode configuration.
 * Drives adaptive thinking/non-thinking for supported providers.
 * - Anthropic: extended thinking with budget_tokens (requires temperature=1)
 * - Ollama: models with supportsThinking get basic CoT via prompt
 * - Others: basic CoT at most (prompt-injected chain-of-thought)
 */
export function mapEffortToThinking(
  effort: EffortLevel,
  provider: string,
): { thinkingMode: 'none' | 'basic' | 'extended'; thinkingBudget?: number; useThinkingVariant?: boolean } {
  // Anthropic: native extended thinking with budget_tokens
  const supportsExtended = provider === 'anthropic';
  // OpenRouter: use :thinking model variant for deep reasoning
  const supportsThinkingVariant = provider === 'openrouter';

  switch (effort) {
    case 'critical':
      if (supportsExtended) return { thinkingMode: 'extended', thinkingBudget: 32000 };
      if (supportsThinkingVariant) return { thinkingMode: 'basic', useThinkingVariant: true };
      return { thinkingMode: 'basic' };
    case 'high':
      if (supportsExtended) return { thinkingMode: 'extended', thinkingBudget: 16000 };
      if (supportsThinkingVariant) return { thinkingMode: 'basic', useThinkingVariant: true };
      return { thinkingMode: 'basic' };
    case 'medium':
      return { thinkingMode: 'basic' };
    case 'low':
      return { thinkingMode: 'none' };
    default:
      return { thinkingMode: 'none' };
  }
}

/** Get all model options (for debugging/display) */
export function getAllModels(): ModelOption[] { return [...ALL_MODELS]; }

/** Find a model by ID */
export function findModel(id: string): ModelOption | undefined { return ALL_MODELS.find(m => m.id === id); }

/**
 * OpenRouter model variant suffixes.
 * Append to any model ID to get specialized behavior:
 * - thinking: Chain-of-thought reasoning (e.g. anthropic/claude-sonnet-4:thinking)
 * - nitro: Low-latency inference on premium hardware
 * - online: Web access built-in (no need for web search plugin)
 * - extended: Extended context window beyond default
 * - free: Free tier (rate-limited, lower priority)
 */
export type ModelVariant = 'thinking' | 'nitro' | 'online' | 'extended' | 'free';

/** Append a variant suffix to a model ID, stripping any existing variant first */
export function withVariant(modelId: string, variant: ModelVariant): string {
  const base = modelId.replace(/:(thinking|nitro|online|extended|free)$/, '');
  return `${base}:${variant}`;
}

/** Strip any variant suffix from a model ID */
export function stripVariant(modelId: string): string {
  return modelId.replace(/:(thinking|nitro|online|extended|free)$/, '');
}
