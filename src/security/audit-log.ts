import { logAction, getAuditLog } from '../memory/repositories/audit.js';

export async function audit(userId: string | null, action: string, details?: Record<string, unknown>, platform?: string) {
  await logAction(userId, action, undefined, details, platform);
}

export async function getUserAuditLog(userId: string, limit = 50) {
  return getAuditLog(userId, limit);
}
