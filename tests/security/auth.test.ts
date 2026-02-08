import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken, hashPassword, verifyPassword } from '../../src/security/auth.js';

describe('Auth', () => {
  it('should generate and verify JWT tokens', () => {
    const payload = { userId: 'test', role: 'user', platform: 'web' };
    const token = generateToken(payload);
    expect(token).toBeTruthy();

    const decoded = verifyToken(token);
    expect(decoded.userId).toBe('test');
    expect(decoded.role).toBe('user');
  });

  it('should hash and verify passwords', async () => {
    const hash = await hashPassword('mypassword');
    expect(hash).not.toBe('mypassword');

    const valid = await verifyPassword('mypassword', hash);
    expect(valid).toBe(true);

    const invalid = await verifyPassword('wrong', hash);
    expect(invalid).toBe(false);
  });
});
