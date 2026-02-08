import { describe, it, expect } from 'vitest';
import { TaskManager } from '../../src/actions/tasks/manager.js';

describe('TaskManager', () => {
  it('should create an instance', () => {
    const manager = new TaskManager();
    expect(manager).toBeDefined();
  });
});
