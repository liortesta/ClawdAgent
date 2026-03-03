/**
 * TikTok Cookie Utilities — parse, validate, and inject TikTok cookies.
 * Supports 2 formats: JSON (Cookie Editor) and plain cookie string.
 */

export interface TikTokCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  expires?: number;
  sameSite?: 'Strict' | 'Lax' | 'None';
  hostOnly?: boolean;
}

export interface ParseResult {
  cookies: TikTokCookie[];
  userId?: string;
  format: 'json' | 'plain';
  error?: string;
}

/** Essential cookies that must be present for a valid TikTok session */
const REQUIRED_COOKIES = ['sessionid'];

/**
 * Detect the format of the cookie input and parse accordingly.
 */
export function parseTikTokCookies(input: string): ParseResult {
  const trimmed = input.trim();

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseCookieEditorJson(trimmed);
  }

  return parsePlainCookies(trimmed);
}

function parseCookieEditorJson(input: string): ParseResult {
  try {
    let parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) parsed = [parsed];

    const cookies: TikTokCookie[] = parsed
      .filter((c: Record<string, unknown>) => c.name && c.value)
      .map((c: Record<string, unknown>) => sanitizeCookie({
        name: String(c.name),
        value: String(c.value),
        domain: (c.domain as string) || '.tiktok.com',
        path: (c.path as string) || '/',
        httpOnly: (c.httpOnly as boolean) ?? false,
        secure: (c.secure as boolean) ?? true,
        expires: c.expirationDate ? Math.floor(Number(c.expirationDate)) : undefined,
        sameSite: mapSameSite(c.sameSite as string | null),
        hostOnly: (c.hostOnly as boolean) ?? false,
      }));

    const userId = extractUserId(cookies);

    return { cookies, userId, format: 'json' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { cookies: [], format: 'json', error: `Invalid JSON: ${message}` };
  }
}

function parsePlainCookies(input: string): ParseResult {
  const cookies: TikTokCookie[] = [];

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
      domain: '.tiktok.com',
      path: '/',
      httpOnly: name === 'sessionid',
      secure: true,
    }));
  }

  const userId = extractUserId(cookies);

  return { cookies, userId, format: 'plain' };
}

/**
 * Extract TikTok user ID from cookies.
 * The sessionid_ss or passport_csrf_token can contain user info,
 * but the most reliable is the `tt_webid` cookie for device tracking.
 */
function extractUserId(cookies: TikTokCookie[]): string | undefined {
  // Try to get UID from uid_tt cookie
  const uidCookie = cookies.find(c => c.name === 'uid_tt');
  if (uidCookie) return uidCookie.value;

  // Fallback: try tt_webid
  const webid = cookies.find(c => c.name === 'tt_webid' || c.name === 'tt_webid_v2');
  if (webid) return webid.value;

  return undefined;
}

/** Map Cookie Editor's sameSite values to Playwright-compatible values */
function mapSameSite(value: string | null | undefined): 'Strict' | 'Lax' | 'None' {
  if (!value || value === 'null' || value === 'unspecified') return 'Lax';
  const lower = String(value).toLowerCase();
  if (lower === 'no_restriction' || lower === 'none') return 'None';
  if (lower === 'strict') return 'Strict';
  if (lower === 'lax') return 'Lax';
  return 'Lax';
}

function sanitizeCookie(cookie: TikTokCookie): TikTokCookie {
  // For hostOnly cookies, keep domain as-is (no leading dot)
  // For domain cookies, ensure domain starts with dot
  if (!cookie.hostOnly) {
    if (cookie.domain && !cookie.domain.startsWith('.') && cookie.domain.includes('tiktok.com')) {
      cookie.domain = '.' + cookie.domain;
    }
  }

  // Default to .tiktok.com if no domain
  if (!cookie.domain) {
    cookie.domain = '.tiktok.com';
  }

  // Set far-future expiry if none or expired
  if (!cookie.expires || cookie.expires < Date.now() / 1000) {
    cookie.expires = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  }

  return cookie;
}

/**
 * Validate that parsed cookies contain the essential TikTok session cookies.
 */
export function validateTikTokCookies(cookies: TikTokCookie[]): { valid: boolean; missing: string[]; warnings: string[] } {
  const names = new Set(cookies.map(c => c.name));
  const missing = REQUIRED_COOKIES.filter(r => !names.has(r));
  const warnings: string[] = [];

  if (!names.has('tt_webid') && !names.has('tt_webid_v2')) {
    warnings.push('Missing "tt_webid" cookie — TikTok may flag this session as suspicious');
  }

  if (!names.has('msToken')) {
    warnings.push('Missing "msToken" cookie — some API calls may fail');
  }

  return { valid: missing.length === 0, missing, warnings };
}

/**
 * Convert cookies to Playwright-compatible format for context.addCookies().
 */
export function toPlaywrightCookies(cookies: TikTokCookie[]): Array<{
  name: string; value: string; domain: string; path: string;
  httpOnly: boolean; secure: boolean; expires: number;
  sameSite: 'Strict' | 'Lax' | 'None';
}> {
  return cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    httpOnly: c.httpOnly,
    secure: c.secure,
    expires: c.expires || Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
    sameSite: c.sameSite || 'Lax',
  }));
}
