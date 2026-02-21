import Anthropic from '@anthropic-ai/sdk';
import config from '../config.js';
import logger from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { ExternalServiceError } from '../utils/errors.js';

export interface Message {
  role: 'user' | 'assistant';
  content: string | any[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeRequest {
  systemPrompt: string;
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface ClaudeResponse {
  content: string;
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string;
}

export class ClaudeClient {
  private client: Anthropic;
  private totalTokensUsed = { input: 0, output: 0 };

  constructor() {
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }

  async chat(request: ClaudeRequest): Promise<ClaudeResponse> {
    return withRetry(async () => {
      try {
        const response = await this.client.messages.create({
          model: request.model ?? config.AI_MODEL,
          max_tokens: request.maxTokens ?? config.AI_MAX_TOKENS,
          temperature: request.temperature ?? 0.7,
          system: request.systemPrompt,
          messages: request.messages,
          ...(request.tools?.length ? { tools: request.tools as any } : {}),
        });

        this.totalTokensUsed.input += response.usage.input_tokens;
        this.totalTokensUsed.output += response.usage.output_tokens;

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
          .filter(Boolean) as ClaudeResponse['toolCalls'];

        return {
          content: textContent,
          toolCalls: toolCalls?.length ? toolCalls : undefined,
          usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
          stopReason: response.stop_reason ?? 'end_turn',
        };
      } catch (error: any) {
        if (error?.status === 429) throw error;
        throw new ExternalServiceError('Claude API', error.message);
      }
    }, {
      maxRetries: 3,
      retryOn: (error: any) => error?.status === 429 || error?.status >= 500,
    });
  }

  async chatWithTools(
    request: ClaudeRequest,
    toolExecutor: (name: string, input: Record<string, unknown>) => Promise<string>
  ): Promise<ClaudeResponse> {
    let messages = [...request.messages];
    let response: ClaudeResponse;
    let iterations = 0;
    const MAX_TOOL_ITERATIONS = 10;

    while (iterations < MAX_TOOL_ITERATIONS) {
      response = await this.chat({ ...request, messages });
      iterations++;

      if (!response.toolCalls?.length) return response;

      messages.push({ role: 'assistant', content: response.content || 'Using tools...' });

      for (const toolCall of response.toolCalls) {
        logger.info('Executing tool', { tool: toolCall.name, input: toolCall.input });
        try {
          const result = await toolExecutor(toolCall.name, toolCall.input);
          messages.push({ role: 'user', content: `Tool "${toolCall.name}" result: ${result}` });
        } catch (error: any) {
          messages.push({ role: 'user', content: `Tool "${toolCall.name}" error: ${error.message}` });
        }
      }
    }
    return response!;
  }

  async *stream(request: ClaudeRequest): AsyncGenerator<string> {
    const stream = await this.client.messages.stream({
      model: config.AI_MODEL,
      max_tokens: request.maxTokens ?? config.AI_MAX_TOKENS,
      system: request.systemPrompt,
      messages: request.messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }

  getTokensUsed() { return { ...this.totalTokensUsed }; }
}
