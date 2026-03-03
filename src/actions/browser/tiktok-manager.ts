/**
 * TikTok Account Manager — stores accounts, injects cookies, verifies login.
 * Uses JSON file storage in data/tiktok-accounts.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import {
  parseTikTokCookies,
  validateTikTokCookies,
  toPlaywrightCookies,
  type TikTokCookie,
  type ParseResult,
} from './tiktok-cookies.js';
import { BrowserSessionManager } from './session-manager.js';
import logger from '../../utils/logger.js';

export interface TikTokAccount {
  id: string;
  name: string;
  handle?: string;
  userId?: string;
  cookies: TikTokCookie[];
  cookieFormat: 'json' | 'plain';
  status: 'untested' | 'active' | 'failed' | 'suspended' | 'locked';
  profileName?: string;
  lastVerified?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = resolve(process.cwd(), 'data');
const ACCOUNTS_FILE = resolve(DATA_DIR, 'tiktok-accounts.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadAccounts(): TikTokAccount[] {
  ensureDataDir();
  if (!existsSync(ACCOUNTS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveAccounts(accounts: TikTokAccount[]) {
  ensureDataDir();
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
}

export class TikTokAccountManager {
  private static instance: TikTokAccountManager;

  static getInstance(): TikTokAccountManager {
    if (!TikTokAccountManager.instance) {
      TikTokAccountManager.instance = new TikTokAccountManager();
    }
    return TikTokAccountManager.instance;
  }

  listAccounts(): TikTokAccount[] {
    return loadAccounts();
  }

  getAccount(id: string): TikTokAccount | undefined {
    return loadAccounts().find(a => a.id === id);
  }

  addAccount(name: string, cookieInput: string): { account: TikTokAccount; validation: ReturnType<typeof validateTikTokCookies>; parseResult: ParseResult } {
    const parseResult = parseTikTokCookies(cookieInput);

    if (parseResult.error) {
      throw new Error(`Cookie parse error: ${parseResult.error}`);
    }

    if (parseResult.cookies.length === 0) {
      throw new Error('No cookies found in input');
    }

    const validation = validateTikTokCookies(parseResult.cookies);

    const account: TikTokAccount = {
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

    logger.info('TikTok account added', { id: account.id, name, userId: account.userId, format: parseResult.format, cookieCount: parseResult.cookies.length });

    return { account, validation, parseResult };
  }

  updateCookies(id: string, cookieInput: string): { account: TikTokAccount; validation: ReturnType<typeof validateTikTokCookies> } {
    const accounts = loadAccounts();
    const idx = accounts.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Account ${id} not found`);

    const parseResult = parseTikTokCookies(cookieInput);
    if (parseResult.error) throw new Error(`Cookie parse error: ${parseResult.error}`);
    if (parseResult.cookies.length === 0) throw new Error('No cookies found in input');

    const validation = validateTikTokCookies(parseResult.cookies);

    accounts[idx].cookies = parseResult.cookies;
    accounts[idx].cookieFormat = parseResult.format;
    accounts[idx].userId = parseResult.userId || accounts[idx].userId;
    accounts[idx].status = validation.valid ? 'untested' : 'failed';
    accounts[idx].lastError = validation.valid ? undefined : `Missing required: ${validation.missing.join(', ')}`;
    accounts[idx].updatedAt = new Date().toISOString();

    saveAccounts(accounts);
    return { account: accounts[idx], validation };
  }

  deleteAccount(id: string): void {
    const accounts = loadAccounts();
    const filtered = accounts.filter(a => a.id !== id);
    if (filtered.length === accounts.length) throw new Error(`Account ${id} not found`);
    saveAccounts(filtered);
    logger.info('TikTok account deleted', { id });
  }

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
    const validation = validateTikTokCookies(account.cookies);
    if (!validation.valid) {
      throw new Error(`Cannot verify — missing required cookies: ${validation.missing.join(', ')}`);
    }

    const mgr = BrowserSessionManager.getInstance();
    let sessionId: string | null = null;

    try {
      const session = await mgr.createSession(undefined, false);
      sessionId = session.id;

      const page = mgr.getPage(sessionId);
      if (!page) throw new Error('Failed to get page from session');

      // Inject cookies BEFORE any navigation (avoid TikTok setting its own fingerprint first)
      const context = page.context();
      const pwCookies = toPlaywrightCookies(account.cookies);
      await context.addCookies(pwCookies);

      // Now navigate — cookies will be sent with the first request
      await page.goto('https://www.tiktok.com/foryou', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(4000);

      // Dismiss GDPR / cookie consent banner (TikTok uses shadow DOM web component)
      await dismissTikTokBanners(page);
      await page.waitForTimeout(2000);

      // Navigate to profile page to definitively check login state
      await page.goto('https://www.tiktok.com/profile', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3000);

      // Check login state — profile page redirects to login if NOT logged in
      const loginCheck = await page.evaluate(`(() => {
        const url = window.location.href;

        // If redirected to login page → not logged in
        if (url.includes('/login') || url.includes('loginType')) {
          return { loggedIn: false, reason: 'Redirected to login page' };
        }

        // If we're on a profile page with a username → logged in
        const urlMatch = url.match(/@([^/?]+)/);
        if (urlMatch) {
          return { loggedIn: true, profileName: null, handle: urlMatch[1] };
        }

        // Check for profile-specific elements
        const profileName = document.querySelector('[data-e2e="user-title"]') ||
                           document.querySelector('[data-e2e="user-subtitle"]') ||
                           document.querySelector('h1[data-e2e="user-title"]') ||
                           document.querySelector('h2[data-e2e="user-subtitle"]');

        // Try to find handle from profile header or any profile link
        let handle = null;
        const subtitleEl = document.querySelector('[data-e2e="user-subtitle"]');
        if (subtitleEl) {
          const text = subtitleEl.textContent || '';
          const match = text.match(/@?([\\w.]+)/);
          if (match) handle = match[1];
        }

        // Also check for profile avatar container (only on own profile page)
        const avatar = document.querySelector('[data-e2e="user-avatar"]') ||
                      document.querySelector('.avatar-wrapper');

        if (profileName || avatar) {
          return { loggedIn: true, profileName: profileName ? profileName.textContent : null, handle };
        }

        // Fallback: check for login prompts in page
        const bodyText = document.body.innerText || '';
        if (bodyText.includes('Log in to TikTok') || bodyText.includes('Sign up for an account')) {
          return { loggedIn: false, reason: 'Login page content detected' };
        }

        // If URL is still /profile and no redirect happened, probably logged in
        if (url.includes('/profile') && !url.includes('foryou')) {
          return { loggedIn: true, profileName: null, handle: null };
        }

        // If redirected to foryou — not logged in (profile redirects to foryou for guests)
        if (url.includes('/foryou')) {
          return { loggedIn: false, reason: 'Profile page redirected to For You — session expired' };
        }

        return { loggedIn: false, reason: 'Unknown state — no profile indicators found' };
      })()`);

      // Update account status
      if (loginCheck.loggedIn) {
        accounts[idx].status = 'active';
        accounts[idx].profileName = loginCheck.profileName || undefined;
        accounts[idx].handle = loginCheck.handle || undefined;
        accounts[idx].lastVerified = new Date().toISOString();
        accounts[idx].lastError = undefined;
      } else {
        accounts[idx].status = 'failed';
        accounts[idx].lastError = loginCheck.reason || 'Login failed';
      }

      accounts[idx].updatedAt = new Date().toISOString();
      saveAccounts(accounts);

      try { await mgr.closeSession(sessionId); } catch { /* best effort */ }

      return {
        success: loginCheck.loggedIn,
        sessionId,
        profileName: loginCheck.profileName || undefined,
        handle: loginCheck.handle || undefined,
        error: loginCheck.loggedIn ? undefined : loginCheck.reason,
      };
    } catch (err: unknown) {
      if (sessionId) {
        try { await mgr.closeSession(sessionId); } catch { /* */ }
      }

      const message = err instanceof Error ? err.message : String(err);

      accounts[idx].status = 'failed';
      accounts[idx].lastError = message;
      accounts[idx].updatedAt = new Date().toISOString();
      saveAccounts(accounts);

      logger.error('TikTok account verification failed', { id, error: message });
      return { success: false, sessionId: sessionId || '', error: message };
    }
  }

  async launchSession(id: string, withVnc = true): Promise<{ sessionId: string; url: string }> {
    const account = this.getAccount(id);
    if (!account) throw new Error(`Account ${id} not found`);

    const validation = validateTikTokCookies(account.cookies);
    if (!validation.valid) {
      throw new Error(`Cannot launch — missing required cookies: ${validation.missing.join(', ')}`);
    }

    const mgr = BrowserSessionManager.getInstance();
    const session = await mgr.createSession(undefined, withVnc);

    try {
      const page = mgr.getPage(session.id);
      if (!page) throw new Error('Failed to get page');

      // Inject cookies BEFORE navigation (TikTok fingerprinting)
      const context = page.context();
      await context.addCookies(toPlaywrightCookies(account.cookies));

      await page.goto('https://www.tiktok.com/foryou', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3000);
      await dismissTikTokBanners(page);

      return { sessionId: session.id, url: 'https://www.tiktok.com/foryou' };
    } catch (err: unknown) {
      try { await mgr.closeSession(session.id); } catch { /* */ }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to launch TikTok session: ${message}`);
    }
  }
}

/**
 * Login to TikTok with email/username + password using Playwright automation.
 * This avoids fingerprint mismatch issues from cookie injection.
 * Returns the session with cookies saved to the account.
 */
export async function loginWithCredentials(opts: {
  email: string;
  password: string;
  username?: string;
  accountName?: string;
  emailPassword?: string;
  profileUrl?: string;
}): Promise<{
  success: boolean;
  accountId?: string;
  sessionId?: string;
  handle?: string;
  error?: string;
}> {
  const mgr = BrowserSessionManager.getInstance();
  let sessionId: string | null = null;

  try {
    // Launch WITH VNC so user can watch and solve CAPTCHAs if needed
    const session = await mgr.createSession(undefined, true);
    sessionId = session.id;

    const page = mgr.getPage(sessionId);
    if (!page) throw new Error('Failed to get page');

    // Navigate to TikTok login page
    await page.goto('https://www.tiktok.com/login/phone-or-email/email', {
      waitUntil: 'domcontentloaded', timeout: 30_000,
    });
    await page.waitForTimeout(4000);

    // Dismiss GDPR banner first
    await dismissTikTokBanners(page);
    await page.waitForTimeout(1500);

    // Strategy: Use Playwright keyboard.type() after clicking the input field.
    // This triggers all native DOM events (keydown, keypress, input, keyup)
    // which React's synthetic event system picks up properly.
    const loginId = opts.email;

    // Step 1: Click on email input to focus it, then clear & type via keyboard
    const emailSelector = 'input[name="username"], input[type="text"][placeholder*="email" i], input[autocomplete="username"], input[type="text"]';
    await page.waitForSelector(emailSelector, { timeout: 10_000 });
    await page.click(emailSelector);
    await page.waitForTimeout(300);

    // Clear any existing text, then type character by character
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);

    for (const char of loginId) {
      await page.keyboard.type(char, { delay: 50 + Math.random() * 80 });
    }
    await page.waitForTimeout(800);

    // Step 2: Click on password input, then type
    await page.click('input[type="password"]');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);

    for (const char of opts.password) {
      await page.keyboard.type(char, { delay: 40 + Math.random() * 60 });
    }
    await page.waitForTimeout(1000);

    // Verify fields were filled
    const fillResult = await page.evaluate(`(() => {
      const emailInput = document.querySelector('input[name="username"]')
                      || document.querySelector('input[type="text"]');
      const pwInput = document.querySelector('input[type="password"]');
      return {
        emailFilled: !!(emailInput && emailInput.value.length > 0),
        pwFilled: !!(pwInput && pwInput.value.length > 0),
        emailValue: emailInput ? emailInput.value.substring(0, 5) + '...' : 'N/A',
      };
    })()`);

    logger.info('TikTok login form fill result', fillResult);

    if (!fillResult?.emailFilled || !fillResult?.pwFilled) {
      throw new Error('Form fill failed — fields not populated');
    }

    await page.waitForTimeout(500);

    // Step 3: Click login button via Playwright click (not evaluate)
    // Try multiple selectors
    const loginBtnSelectors = [
      'button[data-e2e="login-button"]',
      'button[type="submit"]',
    ];

    let clicked = false;
    for (const sel of loginBtnSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          clicked = true;
          break;
        }
      } catch { /* try next */ }
    }

    // Fallback: find by text content
    if (!clicked) {
      await page.evaluate(`(() => {
        const allBtns = document.querySelectorAll('button');
        for (const b of allBtns) {
          const text = (b.textContent || '').trim().toLowerCase();
          if (text === 'log in' || text === 'login' || text === 'sign in') {
            b.click();
            return true;
          }
        }
        return false;
      })()`);
    }
    await page.waitForTimeout(5000);

    // Check for CAPTCHA or verification — wait for user to solve via VNC
    const hasCaptcha = await page.evaluate(`(() => {
      const body = document.body.innerText || '';
      const captchaEl = document.querySelector('[class*="captcha"], [id*="captcha"], [class*="Captcha"], .verify-bar-close, [class*="Verify"], [class*="verify"]');
      const hasVerifyText = body.includes('Verify') || body.includes('captcha') || body.includes('slide') || body.includes('puzzle');
      return !!(captchaEl || hasVerifyText);
    })()`);

    if (hasCaptcha) {
      logger.info('TikTok CAPTCHA/verification detected — waiting for user to solve via VNC (up to 120s)');
      let captchaResolved = false;
      for (let i = 0; i < 24; i++) {
        await page.waitForTimeout(5000);
        // Check if we left the login page (CAPTCHA solved + login succeeded)
        const currentUrl = page.url();
        if (!currentUrl.includes('login')) {
          captchaResolved = true;
          break;
        }
        // Also check if CAPTCHA element is gone
        const stillCaptcha = await page.evaluate(`(() => {
          const el = document.querySelector('[class*="captcha"], [id*="captcha"], [class*="Captcha"], .verify-bar-close, [class*="Verify"]');
          return !!el;
        })()`);
        if (!stillCaptcha) {
          captchaResolved = true;
          break;
        }
      }
      if (!captchaResolved) {
        logger.warn('CAPTCHA not resolved within 120s timeout');
      }
      await page.waitForTimeout(3000);
    }

    // Check for error messages
    const loginError = await page.evaluate(`(() => {
      const errorEl = document.querySelector('[class*="error"], [class*="Error"], [data-e2e="login-error"]');
      if (errorEl) return errorEl.textContent;
      const body = document.body.innerText || '';
      if (body.includes('incorrect password') || body.includes('Wrong password')) return 'Wrong password';
      if (body.includes('too many attempts') || body.includes('Too many')) return 'Too many login attempts';
      if (body.includes("doesn't exist") || body.includes('not found')) return 'Account not found';
      return null;
    })()`);

    if (loginError) {
      try { await mgr.closeSession(sessionId); } catch { /* */ }
      return { success: false, sessionId, error: `Login failed: ${loginError}` };
    }

    // Check if we landed on the feed (successful login)
    let currentUrl = page.url();
    let isLoggedIn = currentUrl.includes('foryou') || currentUrl.includes('/@') || !currentUrl.includes('login');

    if (!isLoggedIn) {
      // Might need email verification or more time — wait up to 120s for user action via VNC
      logger.info('TikTok login may need verification — waiting up to 120s for user action via VNC', { currentUrl });
      for (let i = 0; i < 24; i++) {
        await page.waitForTimeout(5000);
        currentUrl = page.url();
        if (!currentUrl.includes('login')) {
          isLoggedIn = true;
          break;
        }
      }
    }

    // Extract cookies from the browser context
    const context = page.context();
    const allCookies = await context.cookies(['https://www.tiktok.com']);

    const sessionidCookie = allCookies.find((c: any) => c.name === 'sessionid');
    if (!sessionidCookie) {
      // Not logged in — but keep session open for user to finish via VNC
      const finalUrl = page.url();
      // Don't close session — user might still be working on verification via VNC
      return { success: false, sessionId, error: `Login incomplete — session still open for VNC access. Current page: ${finalUrl}` };
    }

    // Convert browser cookies to our format
    const tiktokCookies = allCookies
      .filter((c: any) => c.domain.includes('tiktok'))
      .map((c: any) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        httpOnly: c.httpOnly || false,
        secure: c.secure || true,
        expires: c.expires ? Math.floor(c.expires) : undefined,
        sameSite: c.sameSite === 'None' ? 'None' as const : c.sameSite === 'Strict' ? 'Strict' as const : 'Lax' as const,
      }));

    // Determine handle from profile URL or username
    let handle = opts.username || undefined;
    if (opts.profileUrl) {
      const match = opts.profileUrl.match(/@([^/?]+)/);
      if (match) handle = match[1];
    }

    // Try to get handle from the page
    if (!handle) {
      try {
        await page.goto('https://www.tiktok.com/profile', { waitUntil: 'domcontentloaded', timeout: 15_000 });
        await page.waitForTimeout(2000);
        const profileUrl = page.url();
        const m = profileUrl.match(/@([^/?]+)/);
        if (m) handle = m[1];
      } catch { /* ok */ }
    }

    // Save as account
    const accountName = opts.accountName || handle || opts.email.split('@')[0];

    const account: TikTokAccount = {
      id: crypto.randomUUID(),
      name: accountName,
      handle,
      userId: tiktokCookies.find((c: any) => c.name === 'uid_tt')?.value,
      cookies: tiktokCookies,
      cookieFormat: 'json',
      status: 'active',
      lastVerified: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const accounts = loadAccounts();
    accounts.push(account);
    saveAccounts(accounts);

    logger.info('TikTok account logged in and saved', { id: account.id, handle, cookieCount: tiktokCookies.length });

    // Keep session alive — don't close it, the agent will use it
    return {
      success: true,
      accountId: account.id,
      sessionId,
      handle,
    };
  } catch (err: unknown) {
    if (sessionId) {
      try { await mgr.closeSession(sessionId); } catch { /* */ }
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error('TikTok credential login failed', { error: message });
    return { success: false, sessionId: sessionId || undefined, error: message };
  }
}

/**
 * Parse a credential table (username:password:email:emailpw:profileUrl format)
 * into an array of credential objects.
 */
export function parseCredentialTable(input: string): Array<{
  username: string;
  password: string;
  email: string;
  emailPassword: string;
  profileUrl: string;
}> {
  return input.trim().split('\n')
    .map(line => line.trim())
    .filter(line => line.includes(':'))
    .map(line => {
      // Format: username:password:email:emailpw:profileUrl
      // But password can contain colons, so we need to be smart
      // Profile URL starts with https:// so find it from the end
      const urlIdx = line.indexOf('https://');
      const profileUrl = urlIdx >= 0 ? line.slice(urlIdx) : '';
      const beforeUrl = urlIdx >= 0 ? line.slice(0, urlIdx).replace(/:$/, '') : line;

      const segments = beforeUrl.split(':');
      // segments: [username, ...password parts, email, emailpw]
      // email always contains @, emailpw is before the URL
      let emailIdx = -1;
      for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].includes('@')) { emailIdx = i; break; }
      }

      if (emailIdx < 0) {
        // Fallback: assume simple format
        return {
          username: segments[0] || '',
          password: segments[1] || '',
          email: segments[2] || '',
          emailPassword: segments[3] || '',
          profileUrl,
        };
      }

      const username = segments[0];
      const email = segments[emailIdx];
      const emailPassword = segments.slice(emailIdx + 1).join(':');
      const password = segments.slice(1, emailIdx).join(':');

      return { username, password, email, emailPassword, profileUrl };
    });
}

/**
 * Dismiss TikTok GDPR cookie consent banner (shadow DOM web component)
 * and any data transfer notification banners.
 */
export async function dismissTikTokBanners(page: any): Promise<void> {
  // TikTok uses <tiktok-cookie-banner> web component with shadow DOM
  try {
    await page.evaluate(`(() => {
      const banner = document.querySelector('tiktok-cookie-banner');
      if (banner && banner.shadowRoot) {
        const btns = banner.shadowRoot.querySelectorAll('button');
        for (const btn of btns) {
          if ((btn.textContent || '').toLowerCase().includes('allow all')) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    })()`);
    await page.waitForTimeout(1000);
  } catch { /* banner may not be present */ }

  // Dismiss "Got it" / data transfer notifications (regular DOM)
  try {
    await page.evaluate(`(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        const text = (btn.textContent || '').trim().toLowerCase();
        if (text === 'got it' || text === 'ok') {
          btn.click();
          break;
        }
      }
    })()`);
  } catch { /* ok */ }
}
