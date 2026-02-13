import { logAction, getAuditLog } from '../memory/repositories/audit.js';
import logger from '../utils/logger.js';

export async function audit(userId: string | null, action: string, details?: Record<string, unknown>, platform?: string) {
  try {
    // userId from auth routes is a username string, not a UUID — pass null for non-UUID values
    const safeUserId = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) ? userId : null;
    await logAction(safeUserId, action, undefined, { ...details, originalUserId: userId }, platform);
  } catch (err: unknown) {
    // Audit logging must NEVER crash the calling function
    logger.warn('Audit log failed', { action, userId, error: (err as Error).message });
  }
}

export async function getUserAuditLog(userId: string, limit = 50) {
  return getAuditLog(userId, limit);
}
