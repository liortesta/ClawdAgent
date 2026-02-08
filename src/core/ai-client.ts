import Anthropic from '@anthropic-ai/sdk';
import config from '../config.js';
import logger from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { ExternalServiceError } from '../utils/errors.js';
import { sanitizeUnicode } from '../utils/helpers.js';
import { convertMessagesToOpenAI } from './model-router.js';

export interface Message {
  role: 'user' | 'assistant';
  content: string | any[];  // string for text, any[] for tool_use/tool_result content blocks
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AIRequest {
  systemPrompt: string;
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
  provider?: 'anthropic' | 'openai' | 'ollama' | 'openrouter';
}

export interface AIResponse {
  content: string;
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string;
  provider: string;
  modelUsed?: string;
}

interface ProviderClient {
  name: string;
  available: boolean;
  chat(request: AIRequest): Promise<AIResponse>;
}

// ── Anthropic Provider ──────────────────────────────────────────────
class AnthropicProvider implements ProviderClient {
  name = 'anthropic';
  available: boolean;
  private client: Anthropic;

  constructor() {
    this.available = !!config.ANTHROPIC_API_KEY;
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }

  async chat(request: AIRequest): Promise<AIResponse> {
    const response = await this.client.messages.create({
      model: request.model ?? config.AI_MODEL,
      max_tokens: request.maxTokens ?? config.AI_MAX_TOKENS,
      temperature: request.temperature ?? 0.7,
      system: request.systemPrompt,
      messages: request.messages,
      ...(request.tools?.length ? { tools: request.tools } : {}),
    });

    const textContent = response.content
      .filter(block => block.type === 'text')
      .map(block => block.type === 'text' ? block.text : '')
      .join('\n');

    const toolCalls = response.content
      .filter(block => block.type === 'tool_use')
      .map(block => {
        if (block.type === 'tool_use') {
          return { id: block.id, name: block.name, input: block.input as Record<string, unknown> };
        }
        return null;
      })
      .filter(Boolean) as AIResponse['toolCalls'];

    return {
      content: textContent,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      stopReason: response.stop_reason ?? 'end_turn',
      provider: 'anthropic',
      modelUsed: request.model ?? config.AI_MODEL,
    };
  }
}

// ── OpenAI Provider ─────────────────────────────────────────────────
class OpenAIProvider implements ProviderClient {
  name = 'openai';
  available: boolean;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = config.OPENAI_API_KEY ?? '';
    this.baseUrl = config.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    this.available = !!this.apiKey;
  }

  async chat(request: AIRequest): Promise<AIResponse> {
    const model = request.model ?? 'gpt-4o';
    const messages = [
      { role: 'system' as const, content: request.systemPrompt },
      ...request.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new ExternalServiceError('OpenAI', `${res.status}: ${error}`);
    }

    const data = await res.json() as any;
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content ?? '',
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      stopReason: choice?.finish_reason ?? 'stop',
      provider: 'openai',
    };
  }
}

// ── Ollama Provider (local) ─────────────────────────────────────────
class OllamaProvider implements ProviderClient {
  name = 'ollama';
  available: boolean;
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.OLLAMA_URL ?? 'http://localhost:11434';
    this.available = !!config.OLLAMA_URL;
  }

  async chat(request: AIRequest): Promise<AIResponse> {
    const model = request.model ?? 'llama3.1';

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          ...request.messages.map(m => ({ role: m.role, content: m.content })),
        ],
        stream: false,
        options: { temperature: request.temperature ?? 0.7 },
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new ExternalServiceError('Ollama', `${res.status}: ${error}`);
    }

    const data = await res.json() as any;

    return {
      content: data.message?.content ?? '',
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
      stopReason: 'stop',
      provider: 'ollama',
    };
  }
}

// ── OpenRouter Provider (400+ models, many free) ────────────────────
class OpenRouterProvider implements ProviderClient {
  name = 'openrouter';
  available: boolean;
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor() {
    this.apiKey = config.OPENROUTER_API_KEY ?? '';
    this.available = !!this.apiKey;
  }

  async chat(request: AIRequest): Promise<AIResponse> {
    const model = request.model ?? config.OPENROUTER_DEFAULT_MODEL ?? 'openrouter/free';

    // Convert Anthropic-format tool messages to OpenAI format
    const convertedMessages = convertMessagesToOpenAI(request.messages, request.systemPrompt);

    const body: Record<string, unknown> = {
      model,
      messages: convertedMessages,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
    };

    if (request.tools?.length) {
      body.tools = request.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://clawdagent.dev',
        'X-Title': 'ClawdAgent',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];
    const message = choice?.message;

    return {
      content: message?.content ?? '',
      toolCalls: message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments ?? '{}'),
      })),
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      stopReason: choice?.finish_reason === 'tool_calls' ? 'tool_use' : (choice?.finish_reason ?? 'end_turn'),
      provider: 'openrouter',
      modelUsed: model,
    };
  }
}

// ── Unified AI Client ───────────────────────────────────────────────
export class AIClient {
  private providers: Map<string, ProviderClient> = new Map();
  private fallbackOrder: string[];
  private totalTokensUsed = { input: 0, output: 0 };

  constructor() {
    const anthropic = new AnthropicProvider();
    const openai = new OpenAIProvider();
    const ollama = new OllamaProvider();
    const openrouter = new OpenRouterProvider();

    if (anthropic.available) this.providers.set('anthropic', anthropic);
    if (openrouter.available) this.providers.set('openrouter', openrouter);
    if (openai.available) this.providers.set('openai', openai);
    if (ollama.available) this.providers.set('ollama', ollama);

    // Fallback order: anthropic → openrouter → openai → ollama
    this.fallbackOrder = ['anthropic', 'openrouter', 'openai', 'ollama'];

    logger.info('AI Client initialized', {
      providers: Array.from(this.providers.keys()),
      primary: this.fallbackOrder.find(p => this.providers.has(p)) ?? 'none',
    });
  }

  async chat(request: AIRequest): Promise<AIResponse> {
    // Sanitize all text to strip lone surrogates (Hebrew + emoji from Telegram)
    const sanitizedRequest: AIRequest = {
      ...request,
      systemPrompt: sanitizeUnicode(request.systemPrompt),
      messages: request.messages.map(m => ({
        ...m,
        content: typeof m.content === 'string'
          ? sanitizeUnicode(m.content)
          : Array.isArray(m.content)
            ? m.content.map((block: any) => {
                if (typeof block === 'string') return sanitizeUnicode(block);
                if (block.text) return { ...block, text: sanitizeUnicode(block.text) };
                if (block.content && typeof block.content === 'string') return { ...block, content: sanitizeUnicode(block.content) };
                return block;
              })
            : m.content,
      })),
    };

    return withRetry(async () => {
      const preferredProvider = sanitizedRequest.provider;
      const providersToTry = preferredProvider
        ? [preferredProvider, ...this.fallbackOrder.filter(p => p !== preferredProvider)]
        : this.fallbackOrder;

      let lastError: Error | null = null;

      for (const providerName of providersToTry) {
        const provider = this.providers.get(providerName);
        if (!provider) continue;

        // If model is OpenRouter-specific (contains '/') and we're falling back to Anthropic,
        // swap to the default Anthropic model instead of sending an unknown model name
        let requestForProvider = sanitizedRequest;
        const modelStr = sanitizedRequest.model ?? '';
        if (providerName === 'anthropic' && modelStr.includes('/')) {
          requestForProvider = { ...sanitizedRequest, model: config.AI_MODEL };
        }

        try {
          const response = await provider.chat(requestForProvider);
          this.totalTokensUsed.input += response.usage.inputTokens;
          this.totalTokensUsed.output += response.usage.outputTokens;
          return response;
        } catch (error: any) {
          lastError = error;
          logger.warn(`Provider ${providerName} failed, trying next`, { error: error.message });
        }
      }

      throw lastError ?? new ExternalServiceError('AI', 'No providers available');
    }, {
      maxRetries: 2,
      retryOn: (error: any) => error?.status === 429 || error?.status >= 500,
    });
  }

  /**
   * Run AI with tool execution loop.
   * The AI calls tools → we execute them → send results back → AI continues.
   * Uses proper Anthropic content blocks (tool_use + tool_result).
   */
  async chatWithTools(
    request: AIRequest,
    toolExecutor: (name: string, input: Record<string, unknown>) => Promise<{ output: string; error?: string; success: boolean }>
  ): Promise<AIResponse & { toolsUsed: string[]; iterations: number }> {
    const messages: Message[] = [...request.messages];
    let lastResponse: AIResponse | null = null;
    let iterations = 0;
    const MAX_TOOL_ITERATIONS = 15;
    const toolsUsed: string[] = [];

    while (iterations < MAX_TOOL_ITERATIONS) {
      lastResponse = await this.chat({ ...request, messages });
      iterations++;

      // If no tool calls → we're done, return the text response
      if (!lastResponse.toolCalls?.length) {
        return { ...lastResponse, toolsUsed, iterations };
      }

      // AI wants to use tools — build proper assistant content blocks
      const assistantContent: any[] = [];
      if (lastResponse.content) {
        assistantContent.push({ type: 'text', text: lastResponse.content });
      }
      for (const tc of lastResponse.toolCalls) {
        assistantContent.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }
      messages.push({ role: 'assistant', content: assistantContent });

      // Execute each tool and build tool_result content blocks
      const toolResultBlocks: any[] = [];
      for (const toolCall of lastResponse.toolCalls) {
        toolsUsed.push(toolCall.name);
        logger.info('AI called tool', { name: toolCall.name, input: JSON.stringify(toolCall.input).slice(0, 200) });

        try {
          const result = await toolExecutor(toolCall.name, toolCall.input);
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: result.success
              ? (result.output || 'Success (no output)')
              : `Error: ${result.error ?? 'Unknown error'}`,
          });
        } catch (error: any) {
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: `Error: ${error.message}`,
            is_error: true,
          });
        }
      }

      // Send tool results back to AI as a user message with tool_result blocks
      messages.push({ role: 'user', content: toolResultBlocks });

      logger.info('Tool loop iteration', {
        iteration: iterations,
        toolsCalled: lastResponse.toolCalls.map(tc => tc.name),
      });
    }

    // Max iterations reached — ensure we always return non-empty content
    logger.warn('Tool loop max iterations reached', { iterations });
    const fallbackContent = lastResponse?.content || `I investigated using ${toolsUsed.length} tool calls but hit the iteration limit. Here's what I found so far — please ask me to continue if you need more.`;
    return {
      ...(lastResponse ?? { content: fallbackContent, usage: { inputTokens: 0, outputTokens: 0 }, stopReason: 'max_iterations', provider: 'unknown' }),
      content: fallbackContent,
      toolsUsed,
      iterations,
    };
  }

  getAvailableProviders(): string[] { return Array.from(this.providers.keys()); }
  getTokensUsed() { return { ...this.totalTokensUsed }; }
}

// Re-export types for backward compatibility
export type { Message as AIMessage, AIRequest as ClaudeRequest, AIResponse as ClaudeResponse };
