/**
 * Twitter/X Cookie Utilities — parse, validate, and inject Twitter cookies.
 * Supports 2 formats: JSON (Cookie Editor) and plain cookie string.
 */

export interface TwitterCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  expires?: number;
}

export interface ParseResult {
  cookies: TwitterCookie[];
  userId?: string;
  format: 'json' | 'plain';
  error?: string;
}

/** Fields that Playwright doesn't accept — strip these from imported cookies */
/** Essential cookies that must be present for a valid Twitter/X session */
const REQUIRED_COOKIES = ['auth_token', 'ct0'];

/**
 * Detect the format of the cookie input and parse accordingly.
 */
export function parseTwitterCookies(input: string): ParseResult {
  const trimmed = input.trim();

  // Try JSON format first (Cookie Editor export)
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseCookieEditorJson(trimmed);
  }

  // Fall back to plain cookie string
  return parsePlainCookies(trimmed);
}

/**
 * Parse JSON format from Cookie Editor browser extension.
 * Input: [{ "name": "auth_token", "value": "abc", "domain": ".x.com", ... }]
 */
function parseCookieEditorJson(input: string): ParseResult {
  try {
    let parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) parsed = [parsed];

    const cookies: TwitterCookie[] = parsed
      .filter((c: Record<string, unknown>) => c.name && c.value)
      .map((c: Record<string, unknown>) => sanitizeCookie({
        name: String(c.name),
        value: String(c.value),
        domain: (c.domain as string) || '.x.com',
        path: (c.path as string) || '/',
        httpOnly: (c.httpOnly as boolean) ?? false,
        secure: (c.secure as boolean) ?? true,
        expires: c.expirationDate ? Math.floor(Number(c.expirationDate)) : undefined,
      }));

    const userId = extractUserId(cookies);

    return { cookies, userId, format: 'json' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { cookies: [], format: 'json', error: `Invalid JSON: ${message}` };
  }
}

/**
 * Parse plain cookie string format.
 * Input: "auth_token=abc123; ct0=def456; twid=u%3D12345"
 */
function parsePlainCookies(input: string): ParseResult {
  const cookies: TwitterCookie[] = [];

  const pairs = input.split(';').map(s => s.trim()).filter(s => s.includes('='));

  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;

    const name = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();

    if (!name || !value) continue;

    cookies.push(sanitizeCookie({
      name,
      value,
      domain: '.x.com',
      path: '/',
      httpOnly: name === 'auth_token' || name === 'ct0',
      secure: true,
    }));
  }

  const userId = extractUserId(cookies);

  return { cookies, userId, format: 'plain' };
}

/**
 * Extract Twitter user ID from the twid cookie.
 * The twid cookie has the format "u%3D<userId>" (URL-encoded "u=<userId>").
 */
function extractUserId(cookies: TwitterCookie[]): string | undefined {
  const twidCookie = cookies.find(c => c.name === 'twid');
  if (!twidCookie) return undefined;

  const decoded = decodeURIComponent(twidCookie.value);
  const match = decoded.match(/u=(\d+)/);
  return match ? match[1] : undefined;
}

/**
 * Clean up a cookie object for Playwright compatibility.
 */
function sanitizeCookie(cookie: TwitterCookie): TwitterCookie {
  // Ensure domain starts with dot for x.com
  if (cookie.domain && !cookie.domain.startsWith('.') && cookie.domain.includes('x.com')) {
    cookie.domain = '.' + cookie.domain;
  }

  // Also handle twitter.com domain (legacy)
  if (cookie.domain && !cookie.domain.startsWith('.') && cookie.domain.includes('twitter.com')) {
    cookie.domain = '.' + cookie.domain;
  }

  // Default to .x.com if no domain
  if (!cookie.domain) {
    cookie.domain = '.x.com';
  }

  // Set far-future expiry if none
  if (!cookie.expires || cookie.expires < Date.now() / 1000) {
    cookie.expires = Math.floor(Date.now() / 1000) + 365 * 24 * 3600; // 1 year
  }

  return cookie;
}

/**
 * Validate that parsed cookies contain the essential Twitter/X session cookies.
 */
export function validateTwitterCookies(cookies: TwitterCookie[]): { valid: boolean; missing: string[]; warnings: string[] } {
  const names = new Set(cookies.map(c => c.name));
  const missing = REQUIRED_COOKIES.filter(r => !names.has(r));
  const warnings: string[] = [];

  if (!names.has('twid')) {
    warnings.push('Missing "twid" cookie — user ID cannot be extracted; some features may not work');
  }

  if (!names.has('guest_id')) {
    warnings.push('Missing "guest_id" cookie — Twitter/X may flag this session as suspicious');
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Convert cookies to Playwright-compatible format for context.addCookies().
 */
export function toPlaywrightCookies(cookies: TwitterCookie[]): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  expires: number;
}> {
  return cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    httpOnly: c.httpOnly,
    secure: c.secure,
    expires: c.expires || Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
  }));
}
