/**
 * Twitter/X Account Manager — stores accounts, injects cookies, verifies login.
 * Uses JSON file storage in data/twitter-accounts.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import {
  parseTwitterCookies,
  validateTwitterCookies,
  toPlaywrightCookies,
  type TwitterCookie,
  type ParseResult,
} from './twitter-cookies.js';
import { BrowserSessionManager } from './session-manager.js';
import logger from '../../utils/logger.js';

export interface TwitterAccount {
  id: string;
  name: string;
  handle?: string;
  userId?: string;
  cookies: TwitterCookie[];
  cookieFormat: 'json' | 'plain';
  status: 'untested' | 'active' | 'failed' | 'suspended' | 'locked';
  profileName?: string;
  lastVerified?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = resolve(process.cwd(), 'data');
const ACCOUNTS_FILE = resolve(DATA_DIR, 'twitter-accounts.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadAccounts(): TwitterAccount[] {
  ensureDataDir();
  if (!existsSync(ACCOUNTS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveAccounts(accounts: TwitterAccount[]) {
  ensureDataDir();
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
}

export class TwitterAccountManager {
  private static instance: TwitterAccountManager;

  static getInstance(): TwitterAccountManager {
    if (!TwitterAccountManager.instance) {
      TwitterAccountManager.instance = new TwitterAccountManager();
    }
    return TwitterAccountManager.instance;
  }

  /** List all stored accounts */
  listAccounts(): TwitterAccount[] {
    return loadAccounts();
  }

  /** Get a single account by ID */
  getAccount(id: string): TwitterAccount | undefined {
    return loadAccounts().find(a => a.id === id);
  }

  /**
   * Add a new Twitter/X account from raw cookie input.
   * Parses cookies, validates, and stores.
   */
  addAccount(name: string, cookieInput: string): { account: TwitterAccount; validation: ReturnType<typeof validateTwitterCookies>; parseResult: ParseResult } {
    const parseResult = parseTwitterCookies(cookieInput);

    if (parseResult.error) {
      throw new Error(`Cookie parse error: ${parseResult.error}`);
    }

    if (parseResult.cookies.length === 0) {
      throw new Error('No cookies found in input');
    }

    const validation = validateTwitterCookies(parseResult.cookies);

    const account: TwitterAccount = {
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

    logger.info('Twitter account added', { id: account.id, name, userId: account.userId, format: parseResult.format, cookieCount: parseResult.cookies.length });

    return { account, validation, parseResult };
  }

  /** Update cookies for an existing account */
  updateCookies(id: string, cookieInput: string): { account: TwitterAccount; validation: ReturnType<typeof validateTwitterCookies> } {
    const accounts = loadAccounts();
    const idx = accounts.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Account ${id} not found`);

    const parseResult = parseTwitterCookies(cookieInput);
    if (parseResult.error) throw new Error(`Cookie parse error: ${parseResult.error}`);
    if (parseResult.cookies.length === 0) throw new Error('No cookies found in input');

    const validation = validateTwitterCookies(parseResult.cookies);

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
    logger.info('Twitter account deleted', { id });
  }

  /**
   * Launch a browser session, inject cookies, navigate to X, and verify login.
   * Returns session ID + verification result.
   */
  async verifyAccount(id: string): Promise<{
    success: boolean;
    sessionId: string;
    profileName?: string;
    handle?: string;
    error?: string;
  }> {
    const accounts = loadAccounts();
    const idx = accounts.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Account ${id} not found`);

    const account = accounts[idx];
    const validation = validateTwitterCookies(account.cookies);
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

      // Step 1: Navigate to X first (cookies need the domain context)
      await page.goto('https://x.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Step 2: Inject cookies via Playwright context
      const context = page.context();
      const pwCookies = toPlaywrightCookies(account.cookies);
      await context.addCookies(pwCookies);

      // Step 3: Reload the page to apply cookies
      await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3000); // Wait for X to process session

      // Step 4: Check if we're logged in
      const loginCheck = await page.evaluate(`(() => {
        // Check for login form (means NOT logged in) — X uses [name="text"] for username input
        const loginForm = document.querySelector('[name="text"]') || document.querySelector('[autocomplete="username"]');
        if (loginForm) return { loggedIn: false, reason: 'Login form detected' };

        // Check for suspended account notice
        const suspended = document.body.innerText.includes('Your account is suspended') ||
                         document.body.innerText.includes('Account suspended');
        if (suspended) return { loggedIn: false, reason: 'Account suspended' };

        // Check for locked account notice
        const locked = document.body.innerText.includes('Your account has been locked') ||
                      document.body.innerText.includes('Verify your identity');
        if (locked) return { loggedIn: false, reason: 'Account locked — identity verification required' };

        // Check for logged-in indicators — X uses data-testid="primaryColumn" for the feed
        const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
        const sidebarColumn = document.querySelector('[data-testid="sidebarColumn"]');

        // Try to get profile name and handle
        const accountSwitcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        let profileName = null;
        let handle = null;

        if (accountSwitcher) {
          const spans = accountSwitcher.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent || '';
            if (text.startsWith('@')) {
              handle = text;
            } else if (text.length > 0 && !text.startsWith('@') && text !== 'More') {
              profileName = text;
            }
          }
        }

        if (primaryColumn) return { loggedIn: true, profileName, handle };

        // Fallback: check URL isn't login page
        if (!location.href.includes('login') && !location.href.includes('/i/flow')) {
          return { loggedIn: true, profileName: null, handle: null };
        }

        return { loggedIn: false, reason: 'Unknown state' };
      })()`);

      // Update account status
      if (loginCheck.loggedIn) {
        accounts[idx].status = 'active';
        accounts[idx].profileName = loginCheck.profileName || undefined;
        accounts[idx].handle = loginCheck.handle || undefined;
        accounts[idx].lastVerified = new Date().toISOString();
        accounts[idx].lastError = undefined;
      } else if (loginCheck.reason?.includes('suspended')) {
        accounts[idx].status = 'suspended';
        accounts[idx].lastError = loginCheck.reason;
      } else if (loginCheck.reason?.includes('locked')) {
        accounts[idx].status = 'locked';
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
        handle: loginCheck.handle || undefined,
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

      logger.error('Twitter account verification failed', { id, error: message });
      return { success: false, sessionId: sessionId || '', error: message };
    }
  }

  /**
   * Launch a browser session with Twitter/X cookies injected — ready for use.
   * Unlike verify, this keeps the session open for the user/agent to use.
   */
  async launchSession(id: string, withVnc = true): Promise<{ sessionId: string; url: string }> {
    const account = this.getAccount(id);
    if (!account) throw new Error(`Account ${id} not found`);

    const validation = validateTwitterCookies(account.cookies);
    if (!validation.valid) {
      throw new Error(`Cannot launch — missing required cookies: ${validation.missing.join(', ')}`);
    }

    const mgr = BrowserSessionManager.getInstance();
    const session = await mgr.createSession(undefined, withVnc);

    try {
      const page = mgr.getPage(session.id);
      if (!page) throw new Error('Failed to get page');

      // Navigate to X first
      await page.goto('https://x.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Inject cookies
      const context = page.context();
      await context.addCookies(toPlaywrightCookies(account.cookies));

      // Reload with cookies
      await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30_000 });

      return { sessionId: session.id, url: 'https://x.com/home' };
    } catch (err: unknown) {
      try { await mgr.closeSession(session.id); } catch { /* */ }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to launch Twitter session: ${message}`);
    }
  }
}
