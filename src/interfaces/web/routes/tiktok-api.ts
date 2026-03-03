/**
 * TikTok Account API routes — manage TikTok accounts via cookies.
 */
import { Router, Request, Response } from 'express';
import { TikTokAccountManager, loginWithCredentials, parseCredentialTable } from '../../../actions/browser/tiktok-manager.js';
import { parseTikTokCookies, validateTikTokCookies } from '../../../actions/browser/tiktok-cookies.js';
import logger from '../../../utils/logger.js';

export function setupTikTokRoutes(): Router {
  const router = Router();
  const mgr = TikTokAccountManager.getInstance();

  /** GET /api/tiktok/accounts — list all accounts */
  router.get('/accounts', (_req: Request, res: Response) => {
    const accounts = mgr.listAccounts().map(a => ({
      ...a,
      cookies: undefined,
      cookieCount: a.cookies.length,
    }));
    res.json({ accounts });
  });

  /** GET /api/tiktok/accounts/:id — get single account (no cookies) */
  router.get('/accounts/:id', (req: Request, res: Response) => {
    const account = mgr.getAccount(req.params.id as string);
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }
    res.json({
      ...account,
      cookies: undefined,
      cookieCount: account.cookies.length,
    });
  });

  /** POST /api/tiktok/accounts — add a new account from cookies */
  router.post('/accounts', (req: Request, res: Response) => {
    try {
      const { name, cookies } = req.body ?? {};
      if (!name || !cookies) {
        res.status(400).json({ error: 'Name and cookies are required' });
        return;
      }

      const { account, validation, parseResult } = mgr.addAccount(name, cookies);

      res.json({
        account: {
          ...account,
          cookies: undefined,
          cookieCount: account.cookies.length,
        },
        validation,
        format: parseResult.format,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to add TikTok account', { error: message });
      res.status(400).json({ error: message });
    }
  });

  /** PUT /api/tiktok/accounts/:id/cookies — update cookies for an account */
  router.put('/accounts/:id/cookies', (req: Request, res: Response) => {
    try {
      const { cookies } = req.body ?? {};
      if (!cookies) { res.status(400).json({ error: 'Cookies required' }); return; }

      const { account, validation } = mgr.updateCookies(req.params.id as string, cookies);

      res.json({
        account: {
          ...account,
          cookies: undefined,
          cookieCount: account.cookies.length,
        },
        validation,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  /** DELETE /api/tiktok/accounts/:id — delete an account */
  router.delete('/accounts/:id', (req: Request, res: Response) => {
    try {
      mgr.deleteAccount(req.params.id as string);
      res.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(404).json({ error: message });
    }
  });

  /** POST /api/tiktok/accounts/:id/verify — verify cookies work (headless test) */
  router.post('/accounts/:id/verify', async (req: Request, res: Response) => {
    try {
      const result = await mgr.verifyAccount(req.params.id as string);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  /** POST /api/tiktok/accounts/:id/launch — launch a browser session with cookies */
  router.post('/accounts/:id/launch', async (req: Request, res: Response) => {
    try {
      const { withVnc = true } = req.body ?? {};
      const result = await mgr.launchSession(req.params.id as string, withVnc);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  /** POST /api/tiktok/parse-preview — preview cookie parsing without saving */
  router.post('/parse-preview', (req: Request, res: Response) => {
    try {
      const { cookies } = req.body ?? {};
      if (!cookies) { res.status(400).json({ error: 'Cookies required' }); return; }

      const parseResult = parseTikTokCookies(cookies);

      if (parseResult.error) {
        res.json({ valid: false, error: parseResult.error, format: parseResult.format, cookieCount: 0, cookieNames: [] });
        return;
      }

      const validation = validateTikTokCookies(parseResult.cookies);
      const cookieNames = parseResult.cookies.map(c => c.name);

      res.json({
        valid: validation.valid,
        format: parseResult.format,
        cookieCount: parseResult.cookies.length,
        cookieNames,
        userId: parseResult.userId,
        missing: validation.missing,
        warnings: validation.warnings,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  /** POST /api/tiktok/login — login with email+password (automated Playwright login) */
  /** Non-blocking: returns sessionId immediately, login runs in background */
  const loginJobs = new Map<string, { status: string; result?: Record<string, unknown>; error?: string }>();

  router.post('/login', (req: Request, res: Response) => {
    try {
      const { email, password, username, accountName, emailPassword, profileUrl } = req.body ?? {};
      if (!email || !password) {
        res.status(400).json({ error: 'email and password are required' });
        return;
      }

      const jobId = crypto.randomUUID();
      loginJobs.set(jobId, { status: 'running' });

      // Run login in background — don't await
      loginWithCredentials({ email, password, username, accountName, emailPassword, profileUrl })
        .then(result => {
          loginJobs.set(jobId, { status: result.success ? 'success' : 'failed', result: result as unknown as Record<string, unknown> });
        })
        .catch(err => {
          const message = err instanceof Error ? err.message : String(err);
          loginJobs.set(jobId, { status: 'failed', error: message });
        });

      res.json({ jobId, status: 'running', message: 'Login started — check /api/tiktok/login-status/:jobId for result. Watch VNC to solve CAPTCHAs.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('TikTok credential login error', { error: message });
      res.status(500).json({ error: message });
    }
  });

  /** GET /api/tiktok/login-status/:jobId — check login job status */
  router.get('/login-status/:jobId', (req: Request, res: Response) => {
    const job = loginJobs.get(req.params.jobId as string);
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    res.json(job);
  });

  /** POST /api/tiktok/login-bulk — parse credential table and login to multiple accounts */
  router.post('/login-bulk', async (req: Request, res: Response) => {
    try {
      const { credentials } = req.body ?? {};
      if (!credentials) {
        res.status(400).json({ error: 'credentials table required' });
        return;
      }

      const parsed = parseCredentialTable(credentials);
      res.json({ parsed: parsed.map(p => ({ username: p.username, email: p.email, profileUrl: p.profileUrl })), count: parsed.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  return router;
}
