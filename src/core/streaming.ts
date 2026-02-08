import { ClaudeClient, ClaudeRequest } from './claude-client.js';
import logger from '../utils/logger.js';

export interface StreamCallbacks {
  onToken: (token: string) => void | Promise<void>;
  onComplete: (fullText: string) => void | Promise<void>;
  onError: (error: Error) => void | Promise<void>;
}

export async function streamResponse(
  claude: ClaudeClient,
  request: ClaudeRequest,
  callbacks: StreamCallbacks
): Promise<string> {
  let fullText = '';

  try {
    for await (const token of claude.stream(request)) {
      fullText += token;
      await callbacks.onToken(token);
    }
    await callbacks.onComplete(fullText);
    return fullText;
  } catch (error: any) {
    logger.error('Streaming error', { error: error.message });
    await callbacks.onError(error);
    throw error;
  }
}

export class StreamBuffer {
  private buffer = '';
  private flushInterval: number;
  private onFlush: (text: string) => void | Promise<void>;
  private timer: NodeJS.Timeout | null = null;

  constructor(onFlush: (text: string) => void | Promise<void>, flushIntervalMs = 500) {
    this.onFlush = onFlush;
    this.flushInterval = flushIntervalMs;
  }

  add(token: string) {
    this.buffer += token;
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.buffer) {
      const text = this.buffer;
      this.buffer = '';
      await this.onFlush(text);
    }
  }
}
