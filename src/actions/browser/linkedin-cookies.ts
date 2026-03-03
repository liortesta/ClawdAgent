/**
 * LinkedIn Cookie Utilities — parse, validate, and inject LinkedIn cookies.
 * Supports 2 formats: JSON (Cookie Editor) and plain cookie string.
 */

export interface LinkedInCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  expires?: number;
}

export interface ParseResult {
  cookies: LinkedInCookie[];
  userId?: string;
  format: 'json' | 'plain';
  error?: string;
}

/** Fields that Playwright doesn't accept — strip these from imported cookies */
/** Essential cookies that must be present for a valid LinkedIn session */
const REQUIRED_COOKIES = ['li_at'];

/**
 * Detect the format of the cookie input and parse accordingly.
 */
export function parseLinkedInCookies(input: string): ParseResult {
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
 * Input: [{ "name": "li_at", "value": "AQE...", "domain": ".linkedin.com", ... }]
 */
function parseCookieEditorJson(input: string): ParseResult {
  try {
    let parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) parsed = [parsed];

    const cookies: LinkedInCookie[] = parsed
      .filter((c: Record<string, unknown>) => c.name && c.value)
      .map((c: Record<string, unknown>) => sanitizeCookie({
        name: String(c.name),
        value: String(c.value),
        domain: (c.domain as string) || '.linkedin.com',
        path: (c.path as string) || '/',
        httpOnly: (c.httpOnly as boolean) ?? false,
        secure: (c.secure as boolean) ?? true,
        expires: c.expirationDate ? Math.floor(Number(c.expirationDate)) : undefined,
      }));

    // userId is not easily extractable from LinkedIn cookies
    return { cookies, format: 'json' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { cookies: [], format: 'json', error: `Invalid JSON: ${message}` };
  }
}

/**
 * Parse plain cookie string format.
 * Input: "li_at=AQE...; JSESSIONID=ajax:123; bcookie=..."
 */
function parsePlainCookies(input: string): ParseResult {
  const cookies: LinkedInCookie[] = [];

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
      domain: '.linkedin.com',
      path: '/',
      httpOnly: name === 'li_at' || name === 'bscookie',
      secure: true,
    }));
  }

  return { cookies, format: 'plain' };
}

/**
 * Clean up a cookie object for Playwright compatibility.
 */
function sanitizeCookie(cookie: LinkedInCookie): LinkedInCookie {
  // Ensure domain starts with dot for linkedin.com
  if (cookie.domain && !cookie.domain.startsWith('.') && cookie.domain.includes('linkedin.com')) {
    cookie.domain = '.' + cookie.domain;
  }

  // Default to .linkedin.com if no domain
  if (!cookie.domain) {
    cookie.domain = '.linkedin.com';
  }

  // Set far-future expiry if none
  if (!cookie.expires || cookie.expires < Date.now() / 1000) {
    cookie.expires = Math.floor(Date.now() / 1000) + 365 * 24 * 3600; // 1 year
  }

  return cookie;
}

/**
 * Validate that parsed cookies contain the essential LinkedIn session cookies.
 */
export function validateLinkedInCookies(cookies: LinkedInCookie[]): { valid: boolean; missing: string[]; warnings: string[] } {
  const names = new Set(cookies.map(c => c.name));
  const missing = REQUIRED_COOKIES.filter(r => !names.has(r));
  const warnings: string[] = [];

  if (!names.has('JSESSIONID')) {
    warnings.push('Missing "JSESSIONID" cookie — some LinkedIn API requests may fail');
  }

  if (!names.has('bcookie')) {
    warnings.push('Missing "bcookie" cookie — LinkedIn may flag this session as suspicious');
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
export function toPlaywrightCookies(cookies: LinkedInCookie[]): Array<{
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
