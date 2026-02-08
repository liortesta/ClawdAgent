import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../../src/security/encryption.js';

describe('Encryption', () => {
  it('should encrypt and decrypt text', () => {
    const plaintext = 'my secret data';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext each time', () => {
    const text = 'hello';
    const a = encrypt(text);
    const b = encrypt(text);
    expect(a).not.toBe(b); // Different IVs
  });
});
