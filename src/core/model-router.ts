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

// ===== FREE MODELS (OpenRouter :free suffix) =====
// Updated 2026-02-08 — live-tested: tools, system prompt, Hebrew
// Priority: models confirmed working with tool_calls first
const FREE_MODELS: ModelOption[] = [
  // --- Tier 1: Confirmed working with tools (2026-02-08) ---
  {
    id: 'stepfun/step-3.5-flash:free',
    provider: 'openrouter', name: 'Step 3.5 Flash',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 256000, strengths: ['general', 'tool-use', 'fast', 'large-context'],
    supportsTools: true, supportsHebrew: false, supportsVision: false,
  },
  {
    id: 'nvidia/nemotron-nano-9b-v2:free',
    provider: 'openrouter', name: 'Nemotron Nano 9B',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 128000, strengths: ['fast', 'tool-use', 'general'],
    supportsTools: true, supportsHebrew: false, supportsVision: false,
  },
  {
    id: 'nvidia/nemotron-nano-12b-v2-vl:free',
    provider: 'openrouter', name: 'Nemotron Nano 12B VL',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 128000, strengths: ['vision', 'fast', 'tool-use'],
    supportsTools: true, supportsHebrew: false, supportsVision: true,
  },
  {
    id: 'upstage/solar-pro-3:free',
    provider: 'openrouter', name: 'Solar Pro 3',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 128000, strengths: ['general', 'tool-use', 'fast'],
    supportsTools: true, supportsHebrew: false, supportsVision: false,
  },
  // --- Tier 2: Often rate-limited but good when available ---
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    provider: 'openrouter', name: 'Llama 3.3 70B',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 128000, strengths: ['general', 'tool-use', 'multilingual', 'coding'],
    supportsTools: true, supportsHebrew: true, supportsVision: false,
  },
  {
    id: 'mistralai/mistral-small-3.1-24b-instruct:free',
    provider: 'openrouter', name: 'Mistral Small 3.1',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 128000, strengths: ['general', 'fast', 'tool-use', 'vision'],
    supportsTools: true, supportsHebrew: false, supportsVision: true,
  },
  // --- Tier 3: No tool support (reasoning/chat only) ---
  {
    id: 'deepseek/deepseek-r1-0528:free',
    provider: 'openrouter', name: 'DeepSeek R1',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 163840, strengths: ['reasoning', 'math', 'analysis', 'planning'],
    supportsTools: false, supportsHebrew: false, supportsVision: false,
  },
  {
    id: 'arcee-ai/trinity-mini:free',
    provider: 'openrouter', name: 'Trinity Mini',
    tier: 'free', costPer1kInput: 0, costPer1kOutput: 0,
    maxContext: 131072, strengths: ['general', 'fast', 'chat'],
    supportsTools: false, supportsHebrew: false, supportsVision: false,
  },
];

// ===== CHEAP MODELS =====
const CHEAP_MODELS: ModelOption[] = [
  {
    id: 'deepseek/deepseek-chat-v3.1',
    provider: 'openrouter', name: 'DeepSeek V3.1 (Paid)',
    tier: 'cheap', costPer1kInput: 0.0003, costPer1kOutput: 0.0009,
    maxContext: 64000, strengths: ['coding', 'general', 'tool-use'],
    supportsTools: true, supportsHebrew: true, supportsVision: false,
  },
  {
    id: 'anthropic/claude-haiku-3.5',
    provider: 'openrouter', name: 'Claude Haiku 3.5',
    tier: 'cheap', costPer1kInput: 0.0008, costPer1kOutput: 0.004,
    maxContext: 200000, strengths: ['fast', 'general', 'tool-use', 'hebrew'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
  {
    id: 'openai/gpt-4o-mini',
    provider: 'openrouter', name: 'GPT-4o Mini',
    tier: 'cheap', costPer1kInput: 0.00015, costPer1kOutput: 0.0006,
    maxContext: 128000, strengths: ['fast', 'general', 'tool-use'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
];

// ===== MID TIER =====
const MID_MODELS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic', name: 'Claude Sonnet 4',
    tier: 'mid', costPer1kInput: 0.003, costPer1kOutput: 0.015,
    maxContext: 200000, strengths: ['coding', 'reasoning', 'tool-use', 'hebrew', 'planning'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
  {
    id: 'openai/gpt-4o',
    provider: 'openrouter', name: 'GPT-4o',
    tier: 'mid', costPer1kInput: 0.005, costPer1kOutput: 0.015,
    maxContext: 128000, strengths: ['general', 'vision', 'tool-use'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
];

// ===== PREMIUM =====
const PREMIUM_MODELS: ModelOption[] = [
  {
    id: 'claude-opus-4-20250514',
    provider: 'anthropic', name: 'Claude Opus 4',
    tier: 'ultra', costPer1kInput: 0.015, costPer1kOutput: 0.075,
    maxContext: 200000, strengths: ['architecture', 'complex-reasoning', 'critical-decisions'],
    supportsTools: true, supportsHebrew: true, supportsVision: true,
  },
];

const ALL_MODELS = [...FREE_MODELS, ...CHEAP_MODELS, ...MID_MODELS, ...PREMIUM_MODELS];

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

  const complexIntents = ['code_write', 'code_fix', 'build_project', 'document'];
  if (complexIntents.includes(intent) || isMultiStep) return 'complex';

  const criticalIntents = ['code_review'];
  if (criticalIntents.includes(intent)) return 'critical';

  return 'medium';
}

/**
 * Select the best model for the task.
 * Strategy: Use the CHEAPEST model that can handle the task well.
 */
export function selectModel(params: {
  complexity: TaskComplexity;
  requiresTools: boolean;
  requiresHebrew: boolean;
  requiresVision: boolean;
  dailyBudgetLeft: number;
  preferFree: boolean;
}): ModelOption {
  const { complexity, requiresTools, requiresHebrew, requiresVision, dailyBudgetLeft, preferFree } = params;

  // Filter compatible models
  let candidates = ALL_MODELS.filter(m => {
    if (requiresTools && !m.supportsTools) return false;
    if (requiresVision && !m.supportsVision) return false;
    return true;
  });

  if (candidates.length === 0) candidates = ALL_MODELS;

  // Budget check: if low budget, force free models
  if (dailyBudgetLeft < 0.10 || preferFree) {
    const freeCandidates = candidates.filter(m => m.tier === 'free');
    if (freeCandidates.length > 0) candidates = freeCandidates;
  }

  switch (complexity) {
    case 'trivial':
    case 'simple': {
      const free = candidates.filter(m => m.tier === 'free');
      if (free.length > 0) {
        if (requiresVision) return free.find(m => m.supportsVision) ?? free[0];
        if (requiresHebrew) return free.find(m => m.supportsHebrew) ?? free[0];
        return free[0];
      }
      const cheap = candidates.filter(m => m.tier === 'cheap');
      return cheap[0] ?? candidates[0];
    }

    case 'medium': {
      const free = candidates.filter(m => m.tier === 'free' && m.supportsTools);
      if (free.length > 0) return free[0];
      const cheap = candidates.filter(m => m.tier === 'cheap');
      return cheap[0] ?? candidates[0];
    }

    case 'complex': {
      const cheap = candidates.filter(m => m.tier === 'cheap' && m.supportsTools);
      if (cheap.length > 0 && dailyBudgetLeft > 0.50) return cheap[0];
      const mid = candidates.filter(m => m.tier === 'mid');
      if (mid.length > 0 && dailyBudgetLeft > 1.00) return mid[0];
      const free = candidates.filter(m => m.tier === 'free' && m.supportsTools);
      return free[0] ?? candidates[0];
    }

    case 'critical': {
      const premium = candidates.filter(m => m.tier === 'ultra');
      if (premium.length > 0 && dailyBudgetLeft > 5.00) return premium[0];
      const mid = candidates.filter(m => m.tier === 'mid');
      return mid[0] ?? candidates[0];
    }
  }

  return candidates[0] ?? ALL_MODELS[0];
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

/** Get all model options (for debugging/display) */
export function getAllModels(): ModelOption[] { return [...ALL_MODELS]; }

/** Find a model by ID */
export function findModel(id: string): ModelOption | undefined { return ALL_MODELS.find(m => m.id === id); }
