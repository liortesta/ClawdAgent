import { describe, it, expect } from 'vitest';

describe('Orchestrator', () => {
  it('should be importable', async () => {
    const mod = await import('../../src/core/orchestrator.js');
    expect(mod.Orchestrator).toBeDefined();
  });
});
