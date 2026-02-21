import Anthropic from '@anthropic-ai/sdk';
import config from '../config.js';
import logger from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { ExternalServiceError } from '../utils/errors.js';
import { sanitizeUnicode } from '../utils/helpers.js';
import { convertMessagesToOpenAI, STRONG_FALLBACK_CHAIN } from './model-router.js';
import { ClaudeCodeProvider } from '../providers/claude-code-provider.js';
import { getCircuitBreaker, CircuitOpenError } from './circuit-breaker.js';
import { trackAICall } from './metrics.js';

export interface Message {
  role: 'user' | 'assistant';
  content: string | any[];  // string for text, any[] for tool_use/tool_result content blocks
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; [key: string]: unknown };
}

export interface AIRequest {
  systemPrompt: string;
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
  provider?: 'anthropic' | 'openai' | 'ollama' | 'openrouter' | 'claude-code';
  maxToolIterations?: number;
  thinkingMode?: 'none' | 'basic' | 'extended' | 'adaptive';
  thinkingBudget?: number;
  /** Effort level for adaptive thinking (4.6 models): low, medium, high, max (Opus only) */
  effort?: 'low' | 'medium' | 'high' | 'max';
  /** Sub-agent requests can use cheaper/free models */
  isSubAgent?: boolean;
  /** OpenRouter plugins (e.g. web search, response-healing) */
  plugins?: Array<{ id: string; [key: string]: unknown }>;
  /** Structured output format — JSON mode or strict JSON schema (GA on 4.5+/Haiku 4.5) */
  responseFormat?: { type: 'json_object' } | { type: 'json_schema'; json_schema: { name: string; strict?: boolean; schema: object } };
  /** OpenRouter native fallback models — tried in order if primary fails */
  fallbackModels?: string[];
  /** OpenRouter provider preferences — control which backends are used */
  providerPreferences?: { order?: string[]; allow_fallbacks?: boolean; require_parameters?: boolean };
  /** Streaming callback — called with each text token as it arrives from the AI */
  onTextChunk?: (text: string) => void;
  /** Called when a new streaming response starts (e.g. new tool iteration) — frontend should clear partial text */
  onStreamReset?: () => void;
  /** Enable citation tracking for RAG source attribution */
  citations?: boolean;
  /** Enable native Anthropic web search tool (direct API only, not OpenRouter) */
  webSearch?: boolean;
  /** Enable 1M context window (beta, 4.6 models only — 2x input pricing over 200K) */
  extendedContext?: boolean;
}

export interface AIResponse {
  content: string;
  thinking?: string;
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number };
  stopReason: string;
  provider: string;
  modelUsed?: string;
  /** Citation sources when citations are enabled */
  citations?: Array<{ text: string; source: string; startIndex?: number; endIndex?: number }>;
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
    const useThinking = request.thinkingMode === 'extended' || request.thinkingMode === 'adaptive';
    const modelId = request.model ?? config.AI_MODEL;

    // ── Thinking configuration ──
    // 4.6 models use adaptive thinking; older use budget_tokens
    const is46Model = ['claude-opus-4-6', 'claude-sonnet-4-6'].some(m => modelId.includes(m));
    const isOpus46 = modelId.includes('claude-opus-4-6');
    const effort = request.effort ?? 'high';
    const thinkingConfig = useThinking
      ? is46Model
        ? {
            thinking: { type: 'adaptive' as const },
            // Effort controls depth: low/medium/high for all 4.6, max for Opus only
            ...(effort !== 'high' || isOpus46 ? { output_config: { effort: (effort === 'max' && !isOpus46) ? 'high' : effort } } : {}),
          }
        : { thinking: { type: 'enabled' as const, budget_tokens: request.thinkingBudget ?? 10000 } }
      : {};

    // ── Structured output (GA on 4.5+/Haiku 4.5) ──
    const outputConfig: Record<string, unknown> = {};
    if (request.responseFormat) {
      if (request.responseFormat.type === 'json_object') {
        outputConfig.output_config = { ...((thinkingConfig as any).output_config ?? {}), format: { type: 'json_object' } };
      } else if (request.responseFormat.type === 'json_schema') {
        outputConfig.output_config = { ...((thinkingConfig as any).output_config ?? {}), format: { type: 'json_schema', json_schema: request.responseFormat.json_schema } };
      }
      // Merge with thinking output_config if present
      if ((thinkingConfig as any).output_config) {
        outputConfig.output_config = { ...(thinkingConfig as any).output_config, ...(outputConfig.output_config as any) };
        delete (thinkingConfig as any).output_config;
      }
    }

    // ── Beta headers for optional features ──
    const betas: string[] = [];
    if (request.extendedContext && is46Model) betas.push('context-1m-2025-08-07');

    // ── Tools — merge user tools with native Anthropic tools ──
    const allTools: any[] = request.tools?.length ? [...request.tools] : [];
    if (request.webSearch) {
      allTools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 5 });
    }

    const params = {
      model: modelId,
      max_tokens: useThinking ? Math.max(request.maxTokens ?? config.AI_MAX_TOKENS, 16000) : (request.maxTokens ?? config.AI_MAX_TOKENS),
      temperature: useThinking ? 1 : (request.temperature ?? 0.7),
      // Prompt caching: wrap system prompt for automatic cache reuse (90% input cost reduction)
      system: request.systemPrompt
        ? [{ type: 'text' as const, text: request.systemPrompt, cache_control: { type: 'ephemeral' as const } }]
        : undefined,
      messages: request.messages,
      ...(allTools.length ? { tools: allTools } : {}),
      ...thinkingConfig,
      ...outputConfig,
      // Citations for RAG source attribution
      ...(request.citations ? { citations: { enabled: true } } : {}),
      // Beta features header
      ...(betas.length ? { betas } : {}),
    };

    // ── Streaming path ──
    if (request.onTextChunk) {
      const stream = this.client.messages.stream(params as any);
      let textContent = '';
      let thinkingContent = '';

      stream.on('text', (text: string) => {
        textContent += text;
        request.onTextChunk!(text);
      });

      const finalMessage = await stream.finalMessage();

      // Extract thinking content
      thinkingContent = finalMessage.content
        .filter((block: any) => block.type === 'thinking')
        .map((block: any) => block.thinking ?? '')
        .join('\n');

      const toolCalls = finalMessage.content
        .filter(block => block.type === 'tool_use')
        .map(block => {
          if (block.type === 'tool_use') {
            return { id: block.id, name: block.name, input: block.input as Record<string, unknown> };
          }
          return null;
        })
        .filter(Boolean) as AIResponse['toolCalls'];

      const streamUsage = finalMessage.usage as any;
      return {
        content: textContent,
        thinking: thinkingContent || undefined,
        toolCalls: toolCalls?.length ? toolCalls : undefined,
        usage: {
          inputTokens: streamUsage.input_tokens,
          outputTokens: streamUsage.output_tokens,
          cacheReadTokens: streamUsage.cache_read_input_tokens,
          cacheWriteTokens: streamUsage.cache_creation_input_tokens,
        },
        stopReason: finalMessage.stop_reason ?? 'end_turn',
        provider: 'anthropic',
        modelUsed: modelId,
      };
    }

    // ── Non-streaming path (original) ──
    const response = await this.client.messages.create(params as any);

    const textContent = response.content
      .filter(block => block.type === 'text')
      .map(block => block.type === 'text' ? block.text : '')
      .join('\n');

    const thinkingContent = response.content
      .filter((block: any) => block.type === 'thinking')
      .map((block: any) => block.thinking ?? '')
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

    // Extract citations if enabled
    const citations = request.citations
      ? response.content
          .filter((block: any) => block.type === 'text' && block.citations?.length)
          .flatMap((block: any) => (block.citations ?? []).map((c: any) => ({
            text: c.cited_text ?? '',
            source: c.document_title ?? c.document_url ?? 'unknown',
            startIndex: c.start_char_index,
            endIndex: c.end_char_index,
          })))
      : undefined;

    const usage = response.usage as any;
    return {
      content: textContent,
      thinking: thinkingContent || undefined,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
        cacheWriteTokens: usage.cache_creation_input_tokens,
      },
      stopReason: response.stop_reason ?? 'end_turn',
      provider: 'anthropic',
      modelUsed: modelId,
      citations: citations?.length ? citations : undefined,
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
      const err = new ExternalServiceError('OpenAI', `${res.status}: ${error}`);
      (err as any).status = res.status;
      throw err;
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

// ── Ollama Provider (local — AGI 2026 models) ──────────────────────
class OllamaProvider implements ProviderClient {
  name = 'ollama';
  available: boolean;
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.OLLAMA_URL ?? 'http://localhost:11434';
    this.available = !!(config.OLLAMA_URL || config.OLLAMA_ENABLED);
  }

  async chat(request: AIRequest): Promise<AIResponse> {
    const model = request.model ?? config.OLLAMA_DEFAULT_MODEL ?? 'llama3.1';

    // Convert messages — handle Anthropic content blocks
    const convertedMessages = this.convertMessages(request);

    // Inject chain-of-thought for basic thinking mode
    let systemPrompt = request.systemPrompt;
    if (request.thinkingMode === 'basic' && systemPrompt) {
      systemPrompt += '\n\nIMPORTANT: Think step-by-step before answering. Show your reasoning process clearly, then provide your final answer.';
    }

    // Override system prompt in messages if present
    if (systemPrompt && convertedMessages.length > 0 && convertedMessages[0].role === 'system') {
      convertedMessages[0].content = systemPrompt;
    }

    const body: Record<string, unknown> = {
      model,
      messages: convertedMessages,
      stream: false,
      options: { temperature: request.temperature ?? 0.7 },
    };

    // Add tools if provided (Ollama supports OpenAI-format tool_calls)
    if (request.tools?.length) {
      body.tools = request.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000), // 2 min timeout for local models
    });

    if (!res.ok) {
      const error = await res.text();
      const err = new ExternalServiceError('Ollama', `${res.status}: ${error}`);
      (err as any).status = res.status;
      throw err;
    }

    const data = await res.json() as any;
    const message = data.message;

    // Parse tool calls from Ollama response (OpenAI-compatible format)
    const toolCalls = message?.tool_calls?.map((tc: any, idx: number) => ({
      id: `ollama_${Date.now()}_${idx}`,
      name: tc.function?.name ?? tc.name,
      input: typeof tc.function?.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : tc.function?.arguments ?? tc.arguments ?? {},
    }));

    return {
      content: message?.content ?? '',
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
      stopReason: toolCalls?.length ? 'tool_use' : 'stop',
      provider: 'ollama',
      modelUsed: model,
    };
  }

  /** Convert Anthropic-format messages to Ollama/OpenAI format */
  private convertMessages(request: AIRequest): any[] {
    const result: any[] = [{ role: 'system', content: request.systemPrompt }];

    for (const msg of request.messages) {
      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content });
        continue;
      }

      if (!Array.isArray(msg.content)) {
        result.push({ role: msg.role, content: String(msg.content ?? '') });
        continue;
      }

      // Handle Anthropic content blocks (tool_use / tool_result)
      const textParts: string[] = [];
      const toolCallsArr: any[] = [];

      for (const block of msg.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'tool_use') {
          toolCallsArr.push({
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: JSON.stringify(block.input) },
          });
        } else if (block.type === 'tool_result') {
          result.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
          });
        }
      }

      if (toolCallsArr.length > 0) {
        result.push({
          role: 'assistant',
          content: textParts.join('\n') || null,
          tool_calls: toolCallsArr,
        });
      } else if (textParts.length > 0) {
        result.push({ role: msg.role, content: textParts.join('\n') });
      }
    }

    return result;
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

    // Tools (OpenAI format)
    if (request.tools?.length) {
      body.tools = request.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
    }

    // Plugins — web search, response-healing, structured outputs
    if (request.plugins?.length) {
      body.plugins = request.plugins;
    }

    // Structured outputs — JSON mode or JSON schema
    if (request.responseFormat) {
      body.response_format = request.responseFormat;
    }

    // Native model fallbacks — let OpenRouter handle failover internally
    if (request.fallbackModels?.length) {
      body.models = [model, ...request.fallbackModels];
      body.route = 'fallback';
    }

    // Provider preferences — control which backends are used
    if (request.providerPreferences) {
      body.provider = request.providerPreferences;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'HTTP-Referer': 'https://clawdagent.dev',
      'X-Title': 'ClawdAgent',
    };

    // ── Streaming path — token-by-token delivery ──
    if (request.onTextChunk) {
      return this.chatStreaming(body, headers, model, request.onTextChunk);
    }

    // ── Non-streaming path (original) ──
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const err = new Error(`OpenRouter error ${response.status}: ${errorText}`);
      (err as any).status = response.status;
      throw err;
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];
    const message = choice?.message;

    // Fire-and-forget generation stats query for cost/latency tracking
    const generationId = data.id as string | undefined;
    if (generationId) {
      this.queryGenerationStats(generationId).catch(() => {});
    }

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
      modelUsed: data.model ?? model,
    };
  }

  /** Query OpenRouter's generation stats API for cost/latency data */
  private async queryGenerationStats(generationId: string): Promise<void> {
    // Wait briefly — stats may not be available immediately
    await new Promise(r => setTimeout(r, 2000));
    try {
      const res = await fetch(`${this.baseUrl}/generation?id=${generationId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const stats = await res.json() as any;
      logger.info('OpenRouter generation stats', {
        id: generationId,
        cost: stats.data?.total_cost,
        latency: stats.data?.latency,
        model: stats.data?.model,
        provider: stats.data?.provider_name,
        promptTokens: stats.data?.tokens_prompt,
        completionTokens: stats.data?.tokens_completion,
      });
    } catch { /* non-critical — don't fail on stats */ }
  }

  /** Streaming chat — reads SSE chunks and forwards text tokens via onTextChunk */
  private async chatStreaming(
    body: Record<string, unknown>,
    headers: Record<string, string>,
    model: string,
    onTextChunk: (text: string) => void,
  ): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, stream: true }),
      signal: AbortSignal.timeout(180000), // 3 min for streaming (tokens arrive gradually)
    });

    if (!response.ok) {
      const errorText = await response.text();
      const err = new Error(`OpenRouter error ${response.status}: ${errorText}`);
      (err as any).status = response.status;
      throw err;
    }

    let content = '';
    const toolCallsRaw: Array<{ id: string; function: { name: string; arguments: string } }> = [];
    let finishReason = '';
    let usage = { prompt_tokens: 0, completion_tokens: 0 };
    let modelUsed = model;
    let generationId = '';

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));
            const choice = data.choices?.[0];

            // Text content delta
            if (choice?.delta?.content) {
              content += choice.delta.content;
              onTextChunk(choice.delta.content);
            }

            // Accumulate tool calls (streamed incrementally)
            if (choice?.delta?.tool_calls) {
              for (const tc of choice.delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (tc.id) {
                  toolCallsRaw[idx] = {
                    id: tc.id,
                    function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '' },
                  };
                } else if (toolCallsRaw[idx]) {
                  toolCallsRaw[idx].function.arguments += tc.function?.arguments ?? '';
                }
              }
            }

            if (choice?.finish_reason) finishReason = choice.finish_reason;
            if (data.usage) usage = data.usage;
            if (data.model) modelUsed = data.model;
            if (data.id) generationId = data.id;
          } catch { /* skip malformed SSE chunks */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Fire-and-forget generation stats
    if (generationId) {
      this.queryGenerationStats(generationId).catch(() => {});
    }

    // Parse accumulated tool calls
    const toolCalls = toolCallsRaw.filter(Boolean).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments || '{}'),
    }));

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
      },
      stopReason: finishReason === 'tool_calls' ? 'tool_use' : (finishReason ?? 'end_turn'),
      provider: 'openrouter',
      modelUsed,
    };
  }
}

// ── Claude Code CLI Provider (FREE via Max subscription) ────────────
class ClaudeCodeProviderAdapter implements ProviderClient {
  name = 'claude-code';
  available = false;
  private provider: ClaudeCodeProvider;
  private savingsUsd = 0; // Track estimated savings vs API

  constructor() {
    const cliPath = (config as any).CLAUDE_CODE_PATH ?? 'claude';
    this.provider = new ClaudeCodeProvider(cliPath);
    this.available = (config as any).CLAUDE_CODE_ENABLED ?? false;
  }

  async init(): Promise<void> {
    if (!this.available) return;
    const ok = await this.provider.checkAvailability();
    this.available = ok;
    if (ok) {
      logger.info('Claude Code CLI provider ready (FREE — Max subscription)');
    } else {
      logger.warn('Claude Code CLI not available, falling back to API providers');
    }
  }

  async chat(request: AIRequest): Promise<AIResponse> {
    // Build system prompt — embed tool definitions when tools are provided
    let system = request.systemPrompt;
    const hasTools = request.tools && request.tools.length > 0;

    if (hasTools) {
      system += this.buildToolSection(request.tools!);
    }

    // Serialize conversation messages (handles text + tool_use/tool_result blocks)
    const message = this.serializeMessages(request.messages);

    const response = await this.provider.chat({
      system,
      message,
      maxTokens: request.maxTokens,
      model: request.model,
    });

    // Parse tool calls from response text (only when tools are available)
    const { text, toolCalls } = hasTools
      ? this.extractToolCalls(response.text)
      : { text: response.text, toolCalls: [] as Array<{ id: string; name: string; input: Record<string, unknown> }> };

    // Estimate savings vs API
    const estimatedApiCost = ((response.usage?.input_tokens ?? 500) * 0.003 + (response.usage?.output_tokens ?? 200) * 0.015) / 1000;
    this.savingsUsd += estimatedApiCost;

    return {
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
      provider: 'claude-code',
      modelUsed: response.model,
    };
  }

  /** Embed tool definitions into system prompt for CLI-based tool calling */
  private buildToolSection(tools: ToolDefinition[]): string {
    const toolList = tools.map((t, i) => {
      const schema = JSON.stringify(t.input_schema, null, 0);
      return `${i + 1}. **${t.name}**: ${t.description}\n   Parameters: ${schema}`;
    }).join('\n');

    return `\n\n## Tools Available — YOU MUST USE THEM
You have access to tools. To call a tool, output a tool_call XML block:

<tool_call>{"name": "tool_name", "input": {"param": "value"}}</tool_call>

RULES:
- You MUST call tools when the user asks you to DO something. NEVER describe what you would do — just DO IT.
- You may call multiple tools in one response (use separate <tool_call> blocks for each).
- After all tool results come back, continue with more tool calls or give your final text answer.
- NEVER ask the user for permission to use a tool. NEVER suggest running shell commands manually. Just call the tool.
- Use <tool_call> tags ONLY for actual tool invocations. Never include them in explanations.

${toolList}`;
  }

  /** Serialize messages including tool_use/tool_result content blocks into text */
  private serializeMessages(messages: Message[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        parts.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (typeof block === 'string') {
            parts.push(block);
          } else if (block.type === 'text') {
            parts.push(block.text);
          } else if (block.type === 'tool_use') {
            parts.push(`<tool_call>\n${JSON.stringify({ name: block.name, input: block.input })}\n</tool_call>`);
          } else if (block.type === 'tool_result') {
            const label = block.is_error ? '[Tool Error]' : '[Tool Result]';
            parts.push(`${label}: ${typeof block.content === 'string' ? block.content : JSON.stringify(block.content)}`);
          }
        }
      }
    }

    return parts.join('\n\n');
  }

  /** Extract <tool_call> blocks from CLI response text.
   *  Handles: complete blocks, unclosed blocks, and mixed text+tool output.
   */
  private extractToolCalls(text: string): { text: string; toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> } {
    const calls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    let idx = 0;

    // 1. Extract complete <tool_call>...</tool_call> blocks
    const completeRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
    let match;

    while ((match = completeRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.name) {
          calls.push({
            id: `cli_${Date.now()}_${idx++}`,
            name: parsed.name,
            input: parsed.input ?? {},
          });
        }
      } catch {
        // Skip malformed tool call JSON
      }
    }

    // 2. Remove complete blocks from text
    let cleanText = text.replace(/<tool_call>\s*[\s\S]*?\s*<\/tool_call>/g, '');

    // 3. Handle unclosed <tool_call> blocks (model started but didn't finish closing tag)
    const unclosedMatch = cleanText.match(/<tool_call>\s*([\s\S]*)$/);
    if (unclosedMatch) {
      try {
        // Try to extract JSON from unclosed block
        const jsonStr = unclosedMatch[1].trim().replace(/<\/?tool_call>?/g, '').trim();
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          if (parsed.name) {
            calls.push({
              id: `cli_${Date.now()}_${idx++}`,
              name: parsed.name,
              input: parsed.input ?? {},
            });
          }
        }
      } catch {
        // Unclosed block with malformed JSON — just strip it
      }
      cleanText = cleanText.replace(/<tool_call>\s*[\s\S]*$/, '');
    }

    // 4. Clean up any remaining XML artifacts
    cleanText = cleanText.replace(/<\/?tool_call>/g, '').trim();

    return { text: cleanText, toolCalls: calls };
  }

  getProvider(): ClaudeCodeProvider { return this.provider; }
  getSavings(): number { return this.savingsUsd; }
  markUnavailable(): void { this.available = false; }
}

// ── Free OpenRouter models for 402 (insufficient credits) fallback ───
const FREE_FALLBACK_MODELS = [
  'meta-llama/llama-4-scout:free',                      // 10M context, tools, vision
  'mistralai/devstral-2:free',                           // best free coding/agentic
  'qwen/qwen3-coder:free',                              // 262K context, coding
  'google/gemma-3-27b-it:free',                          // free vision model
  'meta-llama/llama-3.3-70b-instruct:free',              // proven reliable fallback
  'mistralai/mistral-small-3.1-24b-instruct:free',       // fast general
];

// ── Anthropic → OpenRouter model ID mapping ─────────────────────────
// When an Anthropic-format model ID lands on OpenRouter, swap to the OR equivalent
const ANTHROPIC_TO_OPENROUTER: Record<string, string> = {
  // 4.6 series (current — Feb 2026)
  'claude-opus-4-6':              'anthropic/claude-opus-4.6',
  'claude-sonnet-4-6':            'anthropic/claude-sonnet-4.6',
  // 4.5 series
  'claude-sonnet-4-5-20250929':   'anthropic/claude-sonnet-4.5',
  'claude-opus-4-5-20251101':     'anthropic/claude-opus-4.5',
  'claude-haiku-4-5-20251001':    'anthropic/claude-haiku-4.5',
  // 4.1 / 4.0 legacy
  'claude-opus-4-1-20250805':     'anthropic/claude-opus-4.1',
  'claude-sonnet-4-20250514':     'anthropic/claude-sonnet-4',
  'claude-opus-4-20250514':       'anthropic/claude-opus-4',
  // 3.x deprecated
  'claude-3-5-sonnet-20241022':   'anthropic/claude-3.5-sonnet',
  'claude-3-5-haiku-20241022':    'anthropic/claude-3.5-haiku',
};

// Reverse lookup: OpenRouter dot-notation → also accept as input
const OPENROUTER_ALIASES: Record<string, string> = {
  'anthropic/claude-opus-4.6':    'anthropic/claude-opus-4.6',
  'anthropic/claude-sonnet-4.6':  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-4.5':    'anthropic/claude-opus-4.5',
  'anthropic/claude-sonnet-4.5':  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-haiku-4.5':   'anthropic/claude-haiku-4.5',
  'anthropic/claude-opus-4.1':    'anthropic/claude-opus-4.1',
  'anthropic/claude-sonnet-4':    'anthropic/claude-sonnet-4',
  'anthropic/claude-opus-4':      'anthropic/claude-opus-4',
};

/** Resolve any model ID to OpenRouter-compatible format */
function resolveOpenRouterModel(modelId: string): string {
  // Already an OpenRouter ID
  if (OPENROUTER_ALIASES[modelId]) return modelId;
  // Anthropic ID → map to OpenRouter
  if (ANTHROPIC_TO_OPENROUTER[modelId]) return ANTHROPIC_TO_OPENROUTER[modelId];
  // Already has org/ prefix → pass through
  if (modelId.includes('/')) return modelId;
  // Unknown → pass through and hope for the best
  return modelId;
}

// ── Provider Mode Fallback Chains ────────────────────────────────────
const PROVIDER_FALLBACK_CHAINS: Record<string, string[]> = {
  max:     ['claude-code', 'anthropic', 'openrouter', 'openai', 'ollama'],
  pro:     ['anthropic', 'openrouter', 'openai', 'ollama'],
  economy: ['openrouter', 'ollama', 'anthropic', 'openai'],
  local:   ['ollama', 'openrouter', 'anthropic', 'openai'],  // Ollama-first for local AGI models
  auto:    ['claude-code', 'anthropic', 'openrouter', 'openai', 'ollama'], // resolved at init
};

/**
 * Resolve "auto" mode to the best available mode:
 *   CLI available? → max | API key? → pro | else → economy
 */
function resolveAutoMode(providers: Map<string, ProviderClient>): string {
  if (providers.has('claude-code')) return 'max';
  if (providers.has('anthropic')) return 'pro';
  if (providers.has('ollama') && !providers.has('openrouter')) return 'local';
  return 'economy';
}

// ── Unified AI Client ───────────────────────────────────────────────
export class AIClient {
  private providers: Map<string, ProviderClient> = new Map();
  private fallbackOrder: string[];
  private providerMode: string;
  private resolvedMode: string;
  private totalTokensUsed = { input: 0, output: 0 };
  private claudeCodeAdapter?: ClaudeCodeProviderAdapter;

  constructor() {
    const anthropic = new AnthropicProvider();
    const openai = new OpenAIProvider();
    const ollama = new OllamaProvider();
    const openrouter = new OpenRouterProvider();
    const claudeCode = new ClaudeCodeProviderAdapter();

    this.claudeCodeAdapter = claudeCode;

    if (claudeCode.available) this.providers.set('claude-code', claudeCode);
    if (anthropic.available) this.providers.set('anthropic', anthropic);
    if (openrouter.available) this.providers.set('openrouter', openrouter);
    if (openai.available) this.providers.set('openai', openai);
    if (ollama.available) this.providers.set('ollama', ollama);

    // Provider mode from config
    this.providerMode = config.PROVIDER_MODE ?? 'auto';
    this.resolvedMode = this.providerMode === 'auto' ? resolveAutoMode(this.providers) : this.providerMode;
    this.fallbackOrder = PROVIDER_FALLBACK_CHAINS[this.resolvedMode] ?? PROVIDER_FALLBACK_CHAINS.auto;

    logger.info('AI Client initialized', {
      providers: Array.from(this.providers.keys()),
      providerMode: this.providerMode,
      resolvedMode: this.resolvedMode,
      fallbackOrder: this.fallbackOrder.filter(p => this.providers.has(p)),
      primary: this.fallbackOrder.find(p => this.providers.has(p)) ?? 'none',
    });
  }

  /** Initialize async providers (Claude Code CLI availability check) */
  async initClaudeCode(): Promise<void> {
    if (this.claudeCodeAdapter) {
      await this.claudeCodeAdapter.init();
      if (this.claudeCodeAdapter.available) {
        this.providers.set('claude-code', this.claudeCodeAdapter);
      } else {
        this.providers.delete('claude-code');
      }
      // Re-resolve auto mode now that we know CLI status
      if (this.providerMode === 'auto') {
        this.resolvedMode = resolveAutoMode(this.providers);
        this.fallbackOrder = PROVIDER_FALLBACK_CHAINS[this.resolvedMode] ?? PROVIDER_FALLBACK_CHAINS.auto;
        logger.info('Provider mode resolved after CLI check', {
          providerMode: this.providerMode,
          resolvedMode: this.resolvedMode,
          fallbackOrder: this.fallbackOrder.filter(p => this.providers.has(p)),
        });
      }
    }
  }

  /** Get the Claude Code provider adapter (for status/savings) */
  getClaudeCodeAdapter(): ClaudeCodeProviderAdapter | undefined { return this.claudeCodeAdapter; }

  /** Get current provider mode info */
  getProviderMode(): { mode: string; resolved: string; fallbackOrder: string[] } {
    return {
      mode: this.providerMode,
      resolved: this.resolvedMode,
      fallbackOrder: this.fallbackOrder.filter(p => this.providers.has(p)),
    };
  }

  /** Set provider mode at runtime (e.g. from /provider command) */
  setProviderMode(mode: 'auto' | 'economy' | 'pro' | 'max' | 'local'): void {
    this.providerMode = mode;
    this.resolvedMode = mode === 'auto' ? resolveAutoMode(this.providers) : mode;
    this.fallbackOrder = PROVIDER_FALLBACK_CHAINS[this.resolvedMode] ?? PROVIDER_FALLBACK_CHAINS.auto;
    logger.info('Provider mode changed', {
      mode: this.providerMode,
      resolved: this.resolvedMode,
      fallbackOrder: this.fallbackOrder.filter(p => this.providers.has(p)),
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

        // Smart model swapping per provider — always use strong models on fallback
        let requestForProvider = sanitizedRequest;
        const modelStr = sanitizedRequest.model ?? '';
        if (providerName === 'anthropic' && (modelStr.includes('/') || !modelStr)) {
          // Anthropic: always use configured AI_MODEL (Claude Sonnet 4)
          requestForProvider = { ...sanitizedRequest, model: config.AI_MODEL };
        }
        if (providerName === 'claude-code') {
          // Claude Code CLI: strip model names, let CLI use its default
          requestForProvider = { ...sanitizedRequest, model: undefined };
        }
        if (providerName === 'openrouter') {
          if (!modelStr || modelStr === 'undefined') {
            // OpenRouter fallback: use strong model (Claude Sonnet via OR, not free junk)
            requestForProvider = { ...sanitizedRequest, model: config.OPENROUTER_DEFAULT_MODEL };
          } else {
            // Map any model ID to OpenRouter-compatible format
            const mapped = resolveOpenRouterModel(modelStr);
            if (mapped !== modelStr) {
              requestForProvider = { ...sanitizedRequest, model: mapped };
              logger.info('Mapped model ID to OpenRouter', { from: modelStr, to: mapped });
            }
          }
          // Inject native OpenRouter fallback chain — lets OR handle model failover internally (faster than app-level retry)
          if (!requestForProvider.fallbackModels?.length) {
            const primaryModel = requestForProvider.model ?? config.OPENROUTER_DEFAULT_MODEL ?? '';
            const fallbacks = STRONG_FALLBACK_CHAIN.filter(m => m !== primaryModel).slice(0, 2); // OpenRouter max 3 models total
            requestForProvider = { ...requestForProvider, fallbackModels: fallbacks };
          }
        }

        try {
          const cb = getCircuitBreaker(`ai:${providerName}`, { failureThreshold: 5, cooldownMs: 30_000 });
          const callStart = Date.now();
          const response = await cb.execute(() => provider.chat(requestForProvider));
          this.totalTokensUsed.input += response.usage.inputTokens;
          this.totalTokensUsed.output += response.usage.outputTokens;
          trackAICall(providerName, requestForProvider.model ?? 'default', Date.now() - callStart, response.usage.inputTokens, response.usage.outputTokens, true);
          return response;
        } catch (error: any) {
          if (error instanceof CircuitOpenError) {
            logger.warn(`Circuit breaker open for ${providerName}, skipping`, { retryAfterMs: error.retryAfterMs });
            lastError = error;
            continue; // Skip to next provider
          }
          trackAICall(providerName, requestForProvider.model ?? 'default', 0, 0, 0, false);
          // OpenRouter 402 (insufficient credits) — retry with free models before giving up
          if (providerName === 'openrouter' && error?.status === 402) {
            logger.warn('OpenRouter 402 (insufficient credits) — falling back to free models');
            for (const freeModel of FREE_FALLBACK_MODELS) {
              try {
                const freeRequest = { ...requestForProvider, model: freeModel, fallbackModels: undefined };
                const freeResponse = await provider.chat(freeRequest);
                this.totalTokensUsed.input += freeResponse.usage.inputTokens;
                this.totalTokensUsed.output += freeResponse.usage.outputTokens;
                logger.info(`Free model fallback succeeded`, { model: freeModel });
                return freeResponse;
              } catch (freeError: any) {
                logger.warn(`Free model ${freeModel} also failed`, { error: freeError.message });
              }
            }
          }
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
    const MAX_TOOL_ITERATIONS = request.maxToolIterations ?? 12;
    const toolsUsed: string[] = [];

    while (iterations < MAX_TOOL_ITERATIONS) {
      // Signal stream reset before each AI call (clears partial text in frontend)
      if (iterations > 0 && request.onStreamReset) request.onStreamReset();
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

  /**
   * Compact (summarize) old messages to reduce context size.
   * Keeps the last `keepRecent` messages intact, summarizes the rest.
   * Uses the Anthropic API compaction approach for long conversations.
   */
  async compactMessages(
    messages: Message[],
    _systemPrompt: string,
    keepRecent = 6,
  ): Promise<{ compacted: Message[]; tokensSaved: number }> {
    if (messages.length <= keepRecent + 2) {
      return { compacted: messages, tokensSaved: 0 };
    }

    const oldMessages = messages.slice(0, -keepRecent);
    const recentMessages = messages.slice(-keepRecent);

    // Estimate tokens (rough: 4 chars per token)
    const oldTokensEstimate = oldMessages.reduce((sum, m) => {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return sum + Math.ceil(text.length / 4);
    }, 0);

    // Only compact if we'd save meaningful tokens
    if (oldTokensEstimate < 2000) {
      return { compacted: messages, tokensSaved: 0 };
    }

    try {
      const summaryResponse = await this.chat({
        systemPrompt: 'You are a conversation summarizer. Summarize the key points, decisions, and context from the conversation below. Be concise but preserve all important technical details, code references, and user preferences. Output only the summary.',
        messages: [
          ...oldMessages,
          { role: 'user', content: 'Summarize the conversation above. Preserve all technical details and decisions.' },
        ],
        maxTokens: 2000,
        temperature: 0.3,
        effort: 'low',
      });

      const summaryMessage: Message = {
        role: 'user',
        content: `[Conversation Summary]\n${summaryResponse.content}\n[End Summary — recent messages follow]`,
      };

      const compacted = [summaryMessage, ...recentMessages];
      const savedTokens = oldTokensEstimate - Math.ceil(summaryResponse.content.length / 4);

      logger.info('Messages compacted', {
        originalCount: messages.length,
        compactedCount: compacted.length,
        tokensSaved: savedTokens,
      });

      return { compacted, tokensSaved: Math.max(0, savedTokens) };
    } catch (err: any) {
      logger.warn('Message compaction failed, returning original', { error: err.message });
      return { compacted: messages, tokensSaved: 0 };
    }
  }
}

// Re-export types for backward compatibility
export type { Message as AIMessage, AIRequest as ClaudeRequest, AIResponse as ClaudeResponse };
