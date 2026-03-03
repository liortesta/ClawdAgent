/**
 * Twitter/X Account API routes — manage Twitter accounts via cookies.
 */
import { Router, Request, Response } from 'express';
import { TwitterAccountManager } from '../../../actions/browser/twitter-manager.js';
import { parseTwitterCookies, validateTwitterCookies } from '../../../actions/browser/twitter-cookies.js';
import logger from '../../../utils/logger.js';

export function setupTwitterRoutes(): Router {
  const router = Router();
  const mgr = TwitterAccountManager.getInstance();

  /** GET /api/twitter/accounts — list all accounts */
  router.get('/accounts', (_req: Request, res: Response) => {
    const accounts = mgr.listAccounts().map(a => ({
      ...a,
      cookies: undefined,        // Never expose raw cookies to frontend
      cookieCount: a.cookies.length,
    }));
    res.json({ accounts });
  });

  /** GET /api/twitter/accounts/:id — get single account (no cookies) */
  router.get('/accounts/:id', (req: Request, res: Response) => {
    const account = mgr.getAccount(req.params.id as string);
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }
    res.json({
      ...account,
      cookies: undefined,
      cookieCount: account.cookies.length,
    });
  });

  /** POST /api/twitter/accounts — add a new account from cookies */
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
    } catch (err: any) {
      logger.warn('Failed to add Twitter account', { error: err.message });
      res.status(400).json({ error: err.message });
    }
  });

  /** PUT /api/twitter/accounts/:id/cookies — update cookies for an account */
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
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /** DELETE /api/twitter/accounts/:id — delete an account */
  router.delete('/accounts/:id', (req: Request, res: Response) => {
    try {
      mgr.deleteAccount(req.params.id as string);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  /** POST /api/twitter/accounts/:id/verify — verify cookies work (headless test) */
  router.post('/accounts/:id/verify', async (req: Request, res: Response) => {
    try {
      const result = await mgr.verifyAccount(req.params.id as string);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /** POST /api/twitter/accounts/:id/launch — launch a browser session with cookies */
  router.post('/accounts/:id/launch', async (req: Request, res: Response) => {
    try {
      const { withVnc = true } = req.body ?? {};
      const result = await mgr.launchSession(req.params.id as string, withVnc);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /** POST /api/twitter/parse-preview — preview cookie parsing without saving */
  router.post('/parse-preview', (req: Request, res: Response) => {
    try {
      const { cookies } = req.body ?? {};
      if (!cookies) { res.status(400).json({ error: 'Cookies required' }); return; }

      const parseResult = parseTwitterCookies(cookies);

      if (parseResult.error) {
        res.json({ valid: false, error: parseResult.error, format: parseResult.format, cookieCount: 0, cookieNames: [] });
        return;
      }

      const validation = validateTwitterCookies(parseResult.cookies);
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
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
