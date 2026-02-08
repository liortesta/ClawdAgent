import { describe, it, expect } from 'vitest';
import { Intent } from '../../src/core/router.js';

describe('Intent', () => {
  it('should have all expected intents', () => {
    expect(Intent.GENERAL_CHAT).toBe('general_chat');
    expect(Intent.SERVER_STATUS).toBe('server_status');
    expect(Intent.CODE_WRITE).toBe('code_write');
    expect(Intent.WEB_SEARCH).toBe('web_search');
    expect(Intent.TASK_CREATE).toBe('task_create');
  });
});
