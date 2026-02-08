import { describe, it, expect, vi } from 'vitest';
import { Engine, IncomingMessage } from '../../src/core/engine.js';

describe('Engine', () => {
  it('should create an engine instance', () => {
    const engine = new Engine();
    expect(engine).toBeDefined();
  });

  it('should process a message and return a response', async () => {
    const engine = new Engine();
    const incoming: IncomingMessage = {
      platform: 'telegram',
      userId: 'test-user',
      userName: 'Test User',
      chatId: 'test-chat',
      text: 'Hello!',
    };

    // This will fail without a real API key, but tests the structure
    const response = await engine.process(incoming);
    expect(response).toHaveProperty('text');
    expect(response).toHaveProperty('format');
  });
});
