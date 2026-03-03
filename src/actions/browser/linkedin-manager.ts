/**
 * LinkedIn Account Manager — stores accounts, injects cookies, verifies login.
 * Uses JSON file storage in data/linkedin-accounts.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import {
  parseLinkedInCookies,
  validateLinkedInCookies,
  toPlaywrightCookies,
  type LinkedInCookie,
  type ParseResult,
} from './linkedin-cookies.js';
import { BrowserSessionManager } from './session-manager.js';
import logger from '../../utils/logger.js';

export interface LinkedInAccount {
  id: string;
  name: string;
  profileUrl?: string;
  userId?: string;
  cookies: LinkedInCookie[];
  cookieFormat: 'json' | 'plain';
  status: 'untested' | 'active' | 'failed' | 'restricted';
  profileName?: string;
  lastVerified?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = resolve(process.cwd(), 'data');
const ACCOUNTS_FILE = resolve(DATA_DIR, 'linkedin-accounts.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadAccounts(): LinkedInAccount[] {
  ensureDataDir();
  if (!existsSync(ACCOUNTS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveAccounts(accounts: LinkedInAccount[]) {
  ensureDataDir();
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
}

export class LinkedInAccountManager {
  private static instance: LinkedInAccountManager;

  static getInstance(): LinkedInAccountManager {
    if (!LinkedInAccountManager.instance) {
      LinkedInAccountManager.instance = new LinkedInAccountManager();
    }
    return LinkedInAccountManager.instance;
  }

  /** List all stored accounts */
  listAccounts(): LinkedInAccount[] {
    return loadAccounts();
  }

  /** Get a single account by ID */
  getAccount(id: string): LinkedInAccount | undefined {
    return loadAccounts().find(a => a.id === id);
  }

  /**
   * Add a new LinkedIn account from raw cookie input.
   * Parses cookies, validates, and stores.
   */
  addAccount(name: string, cookieInput: string): { account: LinkedInAccount; validation: ReturnType<typeof validateLinkedInCookies>; parseResult: ParseResult } {
    const parseResult = parseLinkedInCookies(cookieInput);

    if (parseResult.error) {
      throw new Error(`Cookie parse error: ${parseResult.error}`);
    }

    if (parseResult.cookies.length === 0) {
      throw new Error('No cookies found in input');
    }

    const validation = validateLinkedInCookies(parseResult.cookies);

    const account: LinkedInAccount = {
      id: crypto.randomUUID(),
      name,
      userId: parseResult.userId,
      cookies: parseResult.cookies,
      cookieFormat: parseResult.format,
      status: validation.valid ? 'untested' : 'failed',
      lastError: validation.valid ? undefined : `Missing required cookies: ${validation.missing.join(', ')}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const accounts = loadAccounts();
    accounts.push(account);
    saveAccounts(accounts);

    logger.info('LinkedIn account added', { id: account.id, name, userId: account.userId, format: parseResult.format, cookieCount: parseResult.cookies.length });

    return { account, validation, parseResult };
  }

  /** Update cookies for an existing account */
  updateCookies(id: string, cookieInput: string): { account: LinkedInAccount; validation: ReturnType<typeof validateLinkedInCookies> } {
    const accounts = loadAccounts();
    const idx = accounts.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Account ${id} not found`);

    const parseResult = parseLinkedInCookies(cookieInput);
    if (parseResult.error) throw new Error(`Cookie parse error: ${parseResult.error}`);
    if (parseResult.cookies.length === 0) throw new Error('No cookies found in input');

    const validation = validateLinkedInCookies(parseResult.cookies);

    accounts[idx].cookies = parseResult.cookies;
    accounts[idx].cookieFormat = parseResult.format;
    accounts[idx].userId = parseResult.userId || accounts[idx].userId;
    accounts[idx].status = validation.valid ? 'untested' : 'failed';
    accounts[idx].lastError = validation.valid ? undefined : `Missing required: ${validation.missing.join(', ')}`;
    accounts[idx].updatedAt = new Date().toISOString();

    saveAccounts(accounts);
    return { account: accounts[idx], validation };
  }

  /** Delete an account */
  deleteAccount(id: string): void {
    const accounts = loadAccounts();
    const filtered = accounts.filter(a => a.id !== id);
    if (filtered.length === accounts.length) throw new Error(`Account ${id} not found`);
    saveAccounts(filtered);
    logger.info('LinkedIn account deleted', { id });
  }

  /**
   * Launch a browser session, inject cookies, navigate to LinkedIn, and verify login.
   * Returns session ID + verification result.
   */
  async verifyAccount(id: string): Promise<{
    success: boolean;
    sessionId: string;
    profileName?: string;
    error?: string;
  }> {
    const accounts = loadAccounts();
    const idx = accounts.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Account ${id} not found`);

    const account = accounts[idx];
    const validation = validateLinkedInCookies(account.cookies);
    if (!validation.valid) {
      throw new Error(`Cannot verify — missing required cookies: ${validation.missing.join(', ')}`);
    }

    const mgr = BrowserSessionManager.getInstance();
    let sessionId: string | null = null;

    try {
      // Create a headless session (no VNC by default — user can attach later)
      const session = await mgr.createSession(undefined, false);
      sessionId = session.id;

      const page = mgr.getPage(sessionId);
      if (!page) throw new Error('Failed to get page from session');

      // Step 1: Navigate to LinkedIn first (cookies need the domain context)
      await page.goto('https://www.linkedin.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Step 2: Inject cookies via Playwright context
      const context = page.context();
      const pwCookies = toPlaywrightCookies(account.cookies);
      await context.addCookies(pwCookies);

      // Step 3: Navigate to the feed to apply cookies
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3000); // Wait for LinkedIn to process session

      // Step 4: Check if we're logged in
      const loginCheck = await page.evaluate(`(() => {
        // Check for sign-in form (means NOT logged in)
        const signInForm = document.querySelector('[data-id="sign-in-form"]');
        if (signInForm) return { loggedIn: false, reason: 'Sign-in form detected' };

        // Check if URL redirected to login page
        if (location.href.includes('/login')) return { loggedIn: false, reason: 'Redirected to login page' };

        // Check for restricted account indicators
        const restricted = document.body.innerText.includes('Your account has been restricted') ||
                          document.body.innerText.includes('account is temporarily restricted');
        if (restricted) return { loggedIn: false, reason: 'Account is restricted' };

        // Check for feed layout (means logged in)
        const scaffoldLayout = document.querySelector('.scaffold-layout');
        const feedControl = document.querySelector('[data-control-name="feed"]');

        // Try to get profile name from nav
        const profileEl = document.querySelector('.feed-identity-module__actor-meta a') ||
                         document.querySelector('[data-control-name="identity_welcome_message"]') ||
                         document.querySelector('.global-nav__me-photo');
        const profileName = profileEl ? (profileEl.textContent || '').trim() : null;

        if (scaffoldLayout || feedControl) return { loggedIn: true, profileName };

        // Fallback: if we're on a non-login page with nav, probably logged in
        const globalNav = document.querySelector('.global-nav') || document.querySelector('#global-nav');
        if (globalNav) return { loggedIn: true, profileName };

        // Final fallback: check URL isn't login page
        if (!location.href.includes('/login') && !location.href.includes('/checkpoint')) {
          return { loggedIn: true, profileName: null };
        }

        return { loggedIn: false, reason: 'Unknown state' };
      })()`);

      // Update account status
      if (loginCheck.loggedIn) {
        accounts[idx].status = 'active';
        accounts[idx].profileName = loginCheck.profileName || undefined;
        accounts[idx].lastVerified = new Date().toISOString();
        accounts[idx].lastError = undefined;
      } else if (loginCheck.reason?.includes('restricted')) {
        accounts[idx].status = 'restricted';
        accounts[idx].lastError = loginCheck.reason;
      } else {
        accounts[idx].status = 'failed';
        accounts[idx].lastError = loginCheck.reason || 'Login failed';
      }

      accounts[idx].updatedAt = new Date().toISOString();
      saveAccounts(accounts);

      // Close the session after verification
      try { await mgr.closeSession(sessionId); } catch { /* best effort */ }

      return {
        success: loginCheck.loggedIn,
        sessionId,
        profileName: loginCheck.profileName || undefined,
        error: loginCheck.loggedIn ? undefined : loginCheck.reason,
      };
    } catch (err: unknown) {
      // Cleanup on error
      if (sessionId) {
        try { await mgr.closeSession(sessionId); } catch { /* */ }
      }

      const message = err instanceof Error ? err.message : String(err);

      accounts[idx].status = 'failed';
      accounts[idx].lastError = message;
      accounts[idx].updatedAt = new Date().toISOString();
      saveAccounts(accounts);

      logger.error('LinkedIn account verification failed', { id, error: message });
      return { success: false, sessionId: sessionId || '', error: message };
    }
  }

  /**
   * Launch a browser session with LinkedIn cookies injected — ready for use.
   * Unlike verify, this keeps the session open for the user/agent to use.
   */
  async launchSession(id: string, withVnc = true): Promise<{ sessionId: string; url: string }> {
    const account = this.getAccount(id);
    if (!account) throw new Error(`Account ${id} not found`);

    const validation = validateLinkedInCookies(account.cookies);
    if (!validation.valid) {
      throw new Error(`Cannot launch — missing required cookies: ${validation.missing.join(', ')}`);
    }

    const mgr = BrowserSessionManager.getInstance();
    const session = await mgr.createSession(undefined, withVnc);

    try {
      const page = mgr.getPage(session.id);
      if (!page) throw new Error('Failed to get page');

      // Navigate to LinkedIn first
      await page.goto('https://www.linkedin.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Inject cookies
      const context = page.context();
      await context.addCookies(toPlaywrightCookies(account.cookies));

      // Reload with cookies — navigate to feed
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

      return { sessionId: session.id, url: 'https://www.linkedin.com/feed/' };
    } catch (err: unknown) {
      try { await mgr.closeSession(session.id); } catch { /* */ }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to launch LinkedIn session: ${message}`);
    }
  }
}
