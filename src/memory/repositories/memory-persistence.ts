import { eq, lt, sql, desc } from 'drizzle-orm';
import { getDb } from '../database.js';
import { memoryEntries, failurePatterns, experienceRecords } from '../schema.js';
import logger from '../../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════
// Memory Persistence Repository — Cross-Session Memory (AGI 2026)
// Bridges in-memory MemoryHierarchy ↔ PostgreSQL for persistence
// ═══════════════════════════════════════════════════════════════════

/** Load memory entries from DB (limited to 500 most recently accessed to prevent OOM) */
export async function loadMemoryEntries(): Promise<Array<{
  id: string; layer: string; key: string; value: string;
  tags: string[]; impact: number; accessCount: number;
  createdAt: number; lastAccessed: number; expiresAt?: number;
}>> {
  try {
    const db = getDb();
    const rows = await db.select().from(memoryEntries).orderBy(desc(memoryEntries.lastAccessed)).limit(500);
    return rows.map(r => ({
      id: r.id,
      layer: r.layer,
      key: r.key,
      value: r.value,
      tags: (r.tags as string[]) ?? [],
      impact: r.impact ?? 0.5,
      accessCount: r.accessCount ?? 0,
      createdAt: r.createdAt.getTime(),
      lastAccessed: r.lastAccessed.getTime(),
      expiresAt: r.expiresAt?.getTime(),
    }));
  } catch (err: any) {
    logger.warn('Failed to load memory entries', { error: err.message });
    return [];
  }
}

/** Upsert a single memory entry */
export async function upsertMemoryEntry(entry: {
  id: string; layer: string; key: string; value: string;
  tags: string[]; impact: number; accessCount: number;
  createdAt: number; lastAccessed: number; expiresAt?: number;
}): Promise<void> {
  try {
    const db = getDb();
    await db.insert(memoryEntries).values({
      id: entry.id,
      layer: entry.layer,
      key: entry.key,
      value: entry.value,
      tags: entry.tags,
      impact: entry.impact,
      accessCount: entry.accessCount,
      createdAt: new Date(entry.createdAt),
      lastAccessed: new Date(entry.lastAccessed),
      expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null,
    }).onConflictDoUpdate({
      target: memoryEntries.id,
      set: {
        value: entry.value,
        tags: entry.tags,
        impact: entry.impact,
        accessCount: entry.accessCount,
        lastAccessed: new Date(entry.lastAccessed),
        expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null,
      },
    });
  } catch (err: any) {
    logger.warn('Failed to upsert memory entry', { id: entry.id, error: err.message });
  }
}

/** Delete a memory entry by ID */
export async function deleteMemoryEntry(id: string): Promise<void> {
  try {
    const db = getDb();
    await db.delete(memoryEntries).where(eq(memoryEntries.id, id));
  } catch (err: any) {
    logger.warn('Failed to delete memory entry', { id, error: err.message });
  }
}

/** Delete expired entries */
export async function deleteExpiredEntries(): Promise<number> {
  try {
    const db = getDb();
    const result = await db.delete(memoryEntries)
      .where(lt(memoryEntries.expiresAt, new Date()))
      .returning({ id: memoryEntries.id });
    return result.length;
  } catch (err: any) {
    logger.warn('Failed to delete expired entries', { error: err.message });
    return 0;
  }
}

/** Load all failure patterns from DB */
export async function loadFailurePatterns(): Promise<Array<{
  errorType: string; context: string; count: number;
  lastSeen: number; resolution?: string; resolved: boolean;
}>> {
  try {
    const db = getDb();
    // Only load most recent 100 patterns to avoid OOM (DB may have tens of thousands)
    const rows = await db.select().from(failurePatterns).orderBy(desc(failurePatterns.lastSeen)).limit(100);
    return rows.map(r => ({
      errorType: r.errorType,
      context: r.context,
      count: r.count,
      lastSeen: r.lastSeen.getTime(),
      resolution: r.resolution ?? undefined,
      resolved: r.resolved,
    }));
  } catch (err: any) {
    logger.warn('Failed to load failure patterns', { error: err.message });
    return [];
  }
}

/** Upsert a failure pattern */
export async function upsertFailurePattern(pattern: {
  errorType: string; context: string; count: number;
  lastSeen: number; resolution?: string; resolved: boolean;
}): Promise<void> {
  try {
    const db = getDb();
    // Use error_type + truncated context as key
    const contextKey = pattern.context.slice(0, 200);
    const existing = await db.select().from(failurePatterns)
      .where(eq(failurePatterns.errorType, pattern.errorType))
      .limit(5);

    const match = existing.find(e => e.context.slice(0, 200) === contextKey);
    if (match) {
      await db.update(failurePatterns).set({
        count: pattern.count,
        lastSeen: new Date(pattern.lastSeen),
        resolution: pattern.resolution ?? null,
        resolved: pattern.resolved,
      }).where(eq(failurePatterns.id, match.id));
    } else {
      await db.insert(failurePatterns).values({
        errorType: pattern.errorType,
        context: pattern.context,
        count: pattern.count,
        lastSeen: new Date(pattern.lastSeen),
        resolution: pattern.resolution ?? null,
        resolved: pattern.resolved,
      });
    }
  } catch (err: any) {
    logger.warn('Failed to upsert failure pattern', { error: err.message });
  }
}

/** Load experience records from DB (limited to 200 most recent to prevent OOM) */
export async function loadExperienceRecords(): Promise<Array<{
  id: string; taskType: string; input: string; output: string;
  success: boolean; agentUsed: string; toolsUsed: string[];
  duration: number; timestamp: number;
}>> {
  try {
    const db = getDb();
    const rows = await db.select().from(experienceRecords).orderBy(desc(experienceRecords.createdAt)).limit(200);
    return rows.map(r => ({
      id: r.id,
      taskType: r.taskType,
      input: r.input,
      output: r.output,
      success: r.success,
      agentUsed: r.agentUsed,
      toolsUsed: (r.toolsUsed as string[]) ?? [],
      duration: r.duration,
      timestamp: r.createdAt!.getTime(),
    }));
  } catch (err: any) {
    logger.warn('Failed to load experience records', { error: err.message });
    return [];
  }
}

/** Insert a new experience record */
export async function insertExperienceRecord(record: {
  id: string; taskType: string; input: string; output: string;
  success: boolean; agentUsed: string; toolsUsed: string[];
  duration: number; timestamp: number;
}): Promise<void> {
  try {
    const db = getDb();
    await db.insert(experienceRecords).values({
      id: record.id,
      taskType: record.taskType,
      input: record.input,
      output: record.output,
      success: record.success,
      agentUsed: record.agentUsed,
      toolsUsed: record.toolsUsed,
      duration: record.duration,
      createdAt: new Date(record.timestamp),
    });
  } catch (err: any) {
    logger.warn('Failed to insert experience record', { id: record.id, error: err.message });
  }
}

/** Get memory entry count for health checks */
export async function getMemoryEntryCount(): Promise<number> {
  try {
    const db = getDb();
    const result = await db.select({ count: sql<number>`count(*)` }).from(memoryEntries);
    return Number(result[0]?.count ?? 0);
  } catch {
    return 0;
  }
}
