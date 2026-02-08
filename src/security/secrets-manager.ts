import { encrypt, decrypt } from './encryption.js';
import logger from '../utils/logger.js';

const secrets: Map<string, string> = new Map();

export function storeSecret(key: string, value: string): void {
  secrets.set(key, encrypt(value));
  logger.debug('Secret stored', { key });
}

export function retrieveSecret(key: string): string | null {
  const encrypted = secrets.get(key);
  if (!encrypted) return null;
  return decrypt(encrypted);
}

export function deleteSecret(key: string): void {
  secrets.delete(key);
}

export function listSecretKeys(): string[] {
  return Array.from(secrets.keys());
}
