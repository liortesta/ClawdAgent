import { describe, it, expect } from 'vitest';
import { SSHClient } from '../../src/actions/server-manager/ssh-client.js';

describe('SSHClient', () => {
  it('should create an instance', () => {
    const client = new SSHClient();
    expect(client).toBeDefined();
  });
});
