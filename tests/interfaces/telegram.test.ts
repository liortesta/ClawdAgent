import { describe, it, expect } from 'vitest';

describe('Telegram Interface', () => {
  it('should export TelegramBot class', async () => {
    const mod = await import('../../src/interfaces/telegram/bot.js');
    expect(mod.TelegramBot).toBeDefined();
  });
});
