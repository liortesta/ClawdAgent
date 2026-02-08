import { eq, desc } from 'drizzle-orm';
import { getDb } from '../database.js';
import { auditLog } from '../schema.js';

export async function logAction(userId: string | null, action: string, resource?: string, details?: Record<string, unknown>, platform?: string) {
  const db = getDb();
  await db.insert(auditLog).values({ userId, action, resource, details, platform });
}

export async function getAuditLog(userId: string, limit = 50) {
  const db = getDb();
  return db.select().from(auditLog).where(eq(auditLog.userId, userId)).orderBy(desc(auditLog.createdAt)).limit(limit);
}
