import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/clawdagent_test';
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
  process.env.ENCRYPTION_KEY = 'test-encryption-key-at-least-32-chars';
  process.env.LOG_LEVEL = 'error';
});

afterAll(() => {
  // Cleanup
});
