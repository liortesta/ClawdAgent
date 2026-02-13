import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import config from '../config.js';
import { AuthenticationError } from '../utils/errors.js';

export interface TokenPayload {
  userId: string;
  role: string;
  platform: string;
  jti?: string; // unique token ID for revocation
}

// Token blacklist — O(1) lookup, auto-cleanup
const blacklistedTokens = new Set<string>();
const tokenExpiries = new Map<string, number>();

/**
 * Generate a JWT with a unique ID (jti) for revocation support
 */
export function generateToken(payload: TokenPayload, expiresIn: string | number = '24h'): string {
  const jti = `${payload.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return jwt.sign({ ...payload, jti }, config.JWT_SECRET, { expiresIn: expiresIn as any });
}

/**
 * Verify a JWT — also checks blacklist
 */
export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as TokenPayload & { exp?: number };

    // Check if token has been revoked
    if (decoded.jti && blacklistedTokens.has(decoded.jti)) {
      throw new AuthenticationError('Token has been revoked');
    }

    return decoded;
  } catch (err) {
    if (err instanceof AuthenticationError) throw err;
    throw new AuthenticationError('Invalid or expired token');
  }
}

/**
 * Revoke a token (add to blacklist until it naturally expires)
 */
export function revokeToken(token: string): boolean {
  try {
    // Decode without verification to get jti and exp (token might be valid)
    const decoded = jwt.decode(token) as (TokenPayload & { jti?: string; exp?: number }) | null;
    if (!decoded?.jti) return false;

    blacklistedTokens.add(decoded.jti);
    // Track when to auto-remove from blacklist (when token would expire naturally)
    if (decoded.exp) {
      tokenExpiries.set(decoded.jti, decoded.exp * 1000);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Revoke all tokens for a specific user
 */
export function revokeAllUserTokens(userId: string): void {
  // Since we can't enumerate all tokens, we track a "revoked before" timestamp per user
  userRevokedBefore.set(userId, Date.now());
}

// Track per-user token revocation timestamps
const userRevokedBefore = new Map<string, number>();

/**
 * Check if a token was issued before user's revocation time
 */
export function isTokenRevokedForUser(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as (TokenPayload & { iat?: number }) | null;
    if (!decoded?.userId || !decoded.iat) return false;

    const revokedBefore = userRevokedBefore.get(decoded.userId);
    if (!revokedBefore) return false;

    // Token was issued before revocation — it's invalid
    return (decoded.iat * 1000) < revokedBefore;
  } catch {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Cleanup expired tokens from blacklist every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [jti, expiry] of tokenExpiries) {
    if (now >= expiry) {
      blacklistedTokens.delete(jti);
      tokenExpiries.delete(jti);
    }
  }
}, 10 * 60 * 1000);
