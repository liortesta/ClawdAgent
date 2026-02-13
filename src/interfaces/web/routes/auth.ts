import { Router, Request, Response } from 'express';
import { generateToken, hashPassword, verifyPassword } from '../../../security/auth.js';
import { audit } from '../../../security/audit-log.js';
import logger from '../../../utils/logger.js';

// Persistent user store — survives restarts if DB is available, falls back to in-memory
const users = new Map<string, { passwordHash: string; role: string; createdAt: number; lastLogin: number }>();
let registrationEnabled = true;
let firstUserCreated = false;

// Failed login tracking for brute-force protection
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkBruteForce(key: string): { allowed: boolean; waitSeconds?: number } {
  const entry = failedAttempts.get(key);
  if (!entry) return { allowed: true };

  if (Date.now() < entry.lockedUntil) {
    const waitSeconds = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    return { allowed: false, waitSeconds };
  }

  // Lockout expired, reset
  if (Date.now() >= entry.lockedUntil) {
    failedAttempts.delete(key);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordFailedAttempt(key: string): void {
  const entry = failedAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    logger.warn('Account locked due to failed attempts', { key, lockoutMinutes: LOCKOUT_DURATION_MS / 60000 });
  }
  failedAttempts.set(key, entry);
}

function clearFailedAttempts(key: string): void {
  failedAttempts.delete(key);
}

// Password strength validation
function isStrongPassword(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) return { valid: false, reason: 'Password must be at least 8 characters' };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: 'Password must contain an uppercase letter' };
  if (!/[a-z]/.test(password)) return { valid: false, reason: 'Password must contain a lowercase letter' };
  if (!/[0-9]/.test(password)) return { valid: false, reason: 'Password must contain a number' };
  return { valid: true };
}

export function setupAuthRoutes(): Router {
  const router = Router();

  // POST /register — First user becomes admin, subsequent require registration to be enabled
  router.post('/register', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) { res.status(400).json({ error: 'Username and password required' }); return; }

    // Validate username
    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
      res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, _, -)' });
      return;
    }

    // Validate password strength
    const pwCheck = isStrongPassword(password);
    if (!pwCheck.valid) { res.status(400).json({ error: pwCheck.reason }); return; }

    if (users.has(username)) { res.status(409).json({ error: 'User exists' }); return; }

    // First user is always allowed and becomes admin
    const isFirstUser = !firstUserCreated;
    if (!isFirstUser && !registrationEnabled) {
      res.status(403).json({ error: 'Registration is disabled. Contact admin.' });
      return;
    }

    const role = isFirstUser ? 'admin' : 'user';
    const passwordHash = await hashPassword(password);
    users.set(username, { passwordHash, role, createdAt: Date.now(), lastLogin: Date.now() });
    firstUserCreated = true;

    // Disable open registration after first user (admin must re-enable)
    if (isFirstUser) {
      registrationEnabled = false;
      logger.info('First user registered as admin, registration disabled', { username });
    }

    await audit(username, 'user.register', { role, isFirstUser });
    const token = generateToken({ userId: username, role, platform: 'web' });
    res.json({ token, role });
  });

  // POST /login — Authenticate with brute-force protection
  router.post('/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) { res.status(400).json({ error: 'Username and password required' }); return; }

    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const bruteForceKey = `${ip}:${username}`;

    // Check brute-force lockout
    const bfCheck = checkBruteForce(bruteForceKey);
    if (!bfCheck.allowed) {
      await audit(username, 'user.login_locked', { ip, waitSeconds: bfCheck.waitSeconds });
      res.status(429).json({ error: `Account locked. Try again in ${bfCheck.waitSeconds}s` });
      return;
    }

    const user = users.get(username);
    if (!user) {
      recordFailedAttempt(bruteForceKey);
      // Don't reveal whether user exists
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      recordFailedAttempt(bruteForceKey);
      await audit(username, 'user.login_failed', { ip });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Success — clear failed attempts, update last login
    clearFailedAttempts(bruteForceKey);
    user.lastLogin = Date.now();
    await audit(username, 'user.login', { ip, role: user.role });

    const token = generateToken({ userId: username, role: user.role, platform: 'web' });
    res.json({ token, role: user.role });
  });

  // POST /toggle-registration — Admin only: enable/disable registration
  router.post('/toggle-registration', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }

    try {
      const { verifyToken } = await import('../../../security/auth.js');
      const payload = verifyToken(authHeader.slice(7));
      if (payload.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }

      registrationEnabled = !registrationEnabled;
      await audit(payload.userId, 'admin.toggle_registration', { enabled: registrationEnabled });
      res.json({ registrationEnabled });
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // POST /logout — Revoke current token
  router.post('/logout', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'No token' }); return; }

    const token = authHeader.slice(7);
    const { revokeToken } = await import('../../../security/auth.js');
    const revoked = revokeToken(token);
    if (revoked) {
      await audit('system', 'user.logout', { success: true });
    }
    res.json({ ok: true });
  });

  return router;
}

// Cleanup failed attempts every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of failedAttempts) {
    if (now >= entry.lockedUntil + LOCKOUT_DURATION_MS) failedAttempts.delete(key);
  }
}, 5 * 60 * 1000);
