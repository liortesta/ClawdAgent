/**
 * Content Guard — Sanitization & Detection for Memory Storage
 *
 * Addresses:
 * 1. Stored Injection (Gemini) — clean external content before memory storage
 * 2. Social Engineering Detection (Gemini) — detect when agent manipulates user
 * 3. Memory Integrity (ChatGPT/Gemini) — SHA-256 checksums on stored memories
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import logger from '../utils/logger.js';

// ── Stored Injection Sanitization ──────────────────────────────────────────
// Patterns that should NEVER enter strategic memory from untrusted sources
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+(instructions?|rules?|prompts?)/i,
  /disregard\s+(all\s+)?previous/i,
  /forget\s+(everything|all\s+rules)/i,
  /you\s+are\s+now\s+(a\s+)?new/i,
  /override\s+(system|safety|security)/i,
  /\[SYSTEM\]/i,
  /\[ADMIN\]/i,
  /\[OVERRIDE\]/i,
  /<\/?system>/i,
  /<\/?instruction>/i,
  /<\/?prompt>/i,
  /```system/i,
  /\bDAN\s+mode\b/i,
  /\bjailbreak\b/i,
  /act\s+as\s+(if\s+)?you\s+(have\s+)?no\s+(restrictions?|limits?|rules?)/i,
  /bypass\s+(safety|security|filter|guard|approval|kill.?switch)/i,
  /disable\s+(safety|security|guard|panic|kill.?switch|approval)/i,
  /deactivate\s+(panic|kill.?switch|guard|safety)/i,
  /move\s+(the\s+)?file\s+to\s+(\/tmp|temp|allowed)/i,
  /add\s+.*to\s+(allowed|whitelist|allowlist)/i,
  /expand\s+(the\s+)?(root|allowed|permissions?)/i,
];

// XML/HTML tags that could be injection vectors
const DANGEROUS_TAGS = /<\/?(?:system|instruction|prompt|admin|override|root|sudo|exec|script|eval)[^>]*>/gi;

/**
 * Sanitize content before storing in memory.
 * Removes injection patterns, dangerous tags, and suspicious control sequences.
 * Returns cleaned content + flag indicating if content was modified.
 */
export function sanitizeForMemory(content: unknown, source: string): { cleaned: string; modified: boolean; threats: string[] } {
  // Guard: ensure content is always a string
  let cleaned = typeof content === 'string' ? content : String(content ?? '');
  const threats: string[] = [];

  // 1. Remove dangerous XML/HTML tags
  const tagMatches = cleaned.match(DANGEROUS_TAGS);
  if (tagMatches) {
    cleaned = cleaned.replace(DANGEROUS_TAGS, '[REMOVED_TAG]');
    threats.push(`dangerous_tags: ${tagMatches.length}`);
  }

  // 2. Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, '[INJECTION_BLOCKED]');
      threats.push(`injection: ${pattern.source.slice(0, 40)}`);
    }
  }

  // 3. Strip null bytes and control chars (except newline/tab)
  const beforeNull = cleaned.length;
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (cleaned.length !== beforeNull) {
    threats.push('control_chars');
  }

  // 4. Truncate excessively long values (memory poisoning via size)
  const MAX_MEMORY_VALUE = 10000;
  if (cleaned.length > MAX_MEMORY_VALUE) {
    cleaned = cleaned.slice(0, MAX_MEMORY_VALUE) + '... [TRUNCATED]';
    threats.push('oversized_value');
  }

  if (threats.length > 0) {
    logger.warn('Content sanitized before memory storage', {
      source,
      threats,
      originalLength: typeof content === 'string' ? content.length : 0,
      cleanedLength: cleaned.length,
    });
  }

  return { cleaned, modified: threats.length > 0, threats };
}

// ── Social Engineering Detection ────────────────────────────────────────────
// Detect when agent output tries to manipulate user into bypassing controls
const SOCIAL_ENGINEERING_PATTERNS = [
  /please\s+(move|copy|relocate)\s+(the\s+)?file\s+to\s+(\/tmp|temp|allowed)/i,
  /can\s+you\s+(temporarily\s+)?(disable|deactivate|turn\s+off)\s+(the\s+)?(allowlist|whitelist|guard|safety|panic|kill.?switch)/i,
  /add\s+.*to\s+(the\s+)?(allowed|whitelist|allowlist)\s+(roots?|paths?|directories)/i,
  /expand\s+(the\s+)?(permissions?|access|allowed\s+roots?)/i,
  /run\s+(this\s+)?(as\s+)?(root|admin|sudo)/i,
  /grant\s+(me\s+)?(full|admin|root)\s+(access|permissions?)/i,
  /deactivate\s+panic\s+mode/i,
  /disable\s+approval\s+gate/i,
  /set\s+TOOLS_DISABLED\s*=\s*""/i,
  /remove\s+(the\s+)?(file\s+)?root\s+restriction/i,
  // ChatGPT round-2: urgency patterns + authority spoofing
  /since\s+you\s+are\s+the\s+(system|admin|root)/i,
  /critical\s+override\s+(needed|required|now)/i,
  /immediately\s+(grant|disable|bypass|override)/i,
  /I\s+am\s+(the\s+)?(system\s+)?admin(istrator)?/i,
  /this\s+is\s+an?\s+(emergency|critical|urgent)\s+(override|action)/i,
];

export interface SocialEngineeringResult {
  detected: boolean;
  patterns: string[];
  severity: 'low' | 'medium' | 'high';
}

/**
 * Scan agent output for social engineering attempts.
 * Returns detection result with severity level.
 */
export function detectSocialEngineering(agentOutput: unknown): SocialEngineeringResult {
  // Guard: ensure input is always a string
  const output = typeof agentOutput === 'string' ? agentOutput : String(agentOutput ?? '');
  const patterns: string[] = [];

  for (const pattern of SOCIAL_ENGINEERING_PATTERNS) {
    if (pattern.test(output)) {
      patterns.push(pattern.source.slice(0, 60));
    }
  }

  if (patterns.length === 0) {
    return { detected: false, patterns: [], severity: 'low' };
  }

  const severity = patterns.length >= 3 ? 'high' : patterns.length >= 2 ? 'medium' : 'low';

  logger.warn('Social engineering attempt detected in agent output', {
    patternCount: patterns.length,
    severity,
    patterns,
  });

  return { detected: true, patterns, severity };
}

// ── Memory Integrity — SHA-256 Checksums ────────────────────────────────────

/**
 * Compute SHA-256 checksum for a memory entry's content.
 */
export function computeMemoryChecksum(key: string, value: string, layer: string): string {
  return createHash('sha256')
    .update(`${layer}:${key}:${value}`)
    .digest('hex')
    .slice(0, 16); // 16-char prefix is sufficient for integrity check
}

/**
 * Verify memory entry integrity against stored checksum.
 */
export function verifyMemoryChecksum(key: string, value: string, layer: string, storedChecksum: string): boolean {
  const computed = computeMemoryChecksum(key, value, layer);
  return computed === storedChecksum;
}

// ── Audit Log Integrity — Hash Chain ────────────────────────────────────────
// Chain head is persisted to file so it survives restarts (ChatGPT round-2 feedback)

const CHAIN_HEAD_FILE = join(process.cwd(), 'data', 'audit-chain-head.txt');

function loadChainHead(): string {
  try {
    return readFileSync(CHAIN_HEAD_FILE, 'utf-8').trim() || '0'.repeat(16);
  } catch {
    return '0'.repeat(16);
  }
}

function persistChainHead(hash: string): void {
  try {
    mkdirSync(join(process.cwd(), 'data'), { recursive: true });
    writeFileSync(CHAIN_HEAD_FILE, hash, 'utf-8');
  } catch {
    // Non-critical — chain still works in-memory
  }
}

let lastAuditHash = loadChainHead();

/**
 * Compute chain hash for audit entry (append-only verification).
 * Each entry's hash includes the previous entry's hash, creating a tamper-evident chain.
 * Chain head is persisted to disk so restarts don't break the chain.
 */
export function computeAuditChainHash(action: string, details: string, timestamp: number): string {
  const hash = createHash('sha256')
    .update(`${lastAuditHash}:${action}:${details}:${timestamp}`)
    .digest('hex')
    .slice(0, 16);
  lastAuditHash = hash;
  persistChainHead(hash);
  return hash;
}

/**
 * Get current chain head hash (for verification).
 */
export function getAuditChainHead(): string {
  return lastAuditHash;
}
