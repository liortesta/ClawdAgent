import { readFile, writeFile, stat } from 'fs/promises';
import { resolve, normalize } from 'path';
import { BaseTool, ToolResult } from './base-tool.js';
import { audit } from '../../security/audit-log.js';
import logger from '../../utils/logger.js';

/**
 * ROOT ALLOWLIST — the file tool may ONLY access paths under these directories.
 * This is the primary defense (whitelist). The blocklist below is a secondary layer.
 * Set via FILE_ALLOWED_ROOTS env var (comma-separated), or defaults to cwd + /tmp.
 */
const ALLOWED_ROOTS: string[] = (() => {
  const envRoots = process.env.FILE_ALLOWED_ROOTS;
  if (envRoots) {
    return envRoots.split(',').map(r => resolve(normalize(r.trim())));
  }
  // Default: project directory + /tmp
  return [resolve(process.cwd()), resolve('/tmp')];
})();

/**
 * Forbidden paths — secondary blocklist defense layer.
 * Even within allowed roots, these patterns are blocked.
 */
const FORBIDDEN_PATHS = [
  /^\/etc\//i,
  /^\/root\//i,
  /^\/proc\//i,
  /^\/sys\//i,
  /^\/dev\//i,
  /^\/boot\//i,
  /^\/var\/log\//i,
  /^C:\\Windows\\/i,
  /^C:\\Program Files/i,
  /^C:\\ProgramData/i,
  /[\\/]\.ssh[\\/]/i,
  /[\\/]\.gnupg[\\/]/i,
  /[\\/]\.aws[\\/]/i,
  /[\\/]\.docker[\\/]/i,
  /[\\/]\.kube[\\/]/i,
  /[\\/]id_rsa/i,
  /[\\/]id_ed25519/i,
  /[\\/]\.env$/i,
  /[\\/]\.env\.[^/\\]+$/i,
  /[\\/]credentials\.json$/i,
  /[\\/]service[_-]?account.*\.json$/i,
  /[\\/]\.git[\\/]config$/i,
];

/**
 * Check if a file path is safe to access.
 * Defense-in-depth: allowlist FIRST, then blocklist, then null-byte check.
 */
function isPathSafe(filePath: string): { safe: boolean; resolved: string; reason?: string } {
  // Resolve to absolute to neutralize ../ traversal
  const resolved = resolve(normalize(filePath));

  // Check for null bytes (classic injection)
  if (filePath.includes('\0') || resolved.includes('\0')) {
    return { safe: false, resolved, reason: 'Null byte in path' };
  }

  // PRIMARY: Allowlist check — path must be under an allowed root
  const inAllowedRoot = ALLOWED_ROOTS.some(root =>
    resolved.startsWith(root + '/') || resolved.startsWith(root + '\\') || resolved === root
  );
  if (!inAllowedRoot) {
    return { safe: false, resolved, reason: 'Access denied: path outside allowed directories' };
  }

  // SECONDARY: Blocklist check — even within allowed roots, block sensitive patterns
  for (const pattern of FORBIDDEN_PATHS) {
    if (pattern.test(resolved)) {
      return { safe: false, resolved, reason: 'Access denied: protected path' };
    }
  }

  return { safe: true, resolved };
}

export class FileTool extends BaseTool {
  name = 'file';
  description = 'Read, write, and manage files';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input.action as string;
    const path = input.path as string;
    const userId = (input._userId as string) ?? 'system';

    if (!path) return { success: false, output: '', error: 'No path provided' };

    // Path traversal protection
    const check = isPathSafe(path);
    if (!check.safe) {
      logger.warn('File access blocked', { path, resolved: check.resolved, reason: check.reason, userId });
      await audit(userId, 'file.access_blocked', { path, reason: check.reason });
      return { success: false, output: '', error: check.reason ?? 'Access denied' };
    }

    try {
      switch (action) {
        case 'read': {
          const content = await readFile(check.resolved, 'utf-8');
          return { success: true, output: content };
        }
        case 'write': {
          const content = input.content as string;
          await writeFile(check.resolved, content, 'utf-8');
          return { success: true, output: `Written to ${check.resolved}` };
        }
        case 'stat': {
          const info = await stat(check.resolved);
          return { success: true, output: JSON.stringify({ size: info.size, modified: info.mtime, isDir: info.isDirectory() }) };
        }
        default:
          return { success: false, output: '', error: `Unknown action: ${action}` };
      }
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }
}
