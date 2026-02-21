import { nanoid } from 'nanoid';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';

dayjs.extend(relativeTime);

export function generateId(prefix = ''): string {
  const id = nanoid(12);
  return prefix ? `${prefix}_${id}` : id;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

export function formatDate(date: Date | string): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

export function timeAgo(date: Date | string): string {
  return dayjs(date).fromNow();
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function sanitizeForMarkdown(text: string): string {
  return text
    .replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

export function bytesToHuman(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

/**
 * Strip unpaired UTF-16 surrogates that break JSON serialization.
 * Hebrew + emoji text from Telegram can contain lone surrogates (U+D800–U+DFFF)
 * which cause "no low surrogate in string" errors in the Anthropic API.
 */
export function sanitizeUnicode(text: unknown): string {
  const str = typeof text === 'string' ? text : String(text ?? '');
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

export function parseCommand(text: string): { command: string; args: string } | null {
  const match = text.match(/^\/(\w+)(?:\s+(.*))?$/s);
  if (!match) return null;
  return { command: match[1], args: match[2]?.trim() ?? '' };
}

/**
 * Robustly extract JSON from an AI response that may contain:
 * - Markdown fences: ```json { ... } ```
 * - Trailing text after the JSON
 * - Leading text before the JSON
 */
export function extractJSON<T = any>(text: string): T {
  // 1. Strip markdown code fences
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');

  // 2. Try direct parse first
  try { return JSON.parse(cleaned); } catch {}

  // 3. Find first { and match its closing }
  const start = cleaned.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') { depth--; if (depth === 0) { try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { break; } } }
    }
  }

  // 4. Try array
  const arrStart = cleaned.indexOf('[');
  if (arrStart !== -1) {
    let depth = 0;
    for (let i = arrStart; i < cleaned.length; i++) {
      if (cleaned[i] === '[') depth++;
      else if (cleaned[i] === ']') { depth--; if (depth === 0) { try { return JSON.parse(cleaned.slice(arrStart, i + 1)); } catch { break; } } }
    }
  }

  throw new SyntaxError(`Could not extract JSON from: ${cleaned.slice(0, 200)}`);
}
