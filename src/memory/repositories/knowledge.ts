import { eq, and, ilike, or, desc, sql } from 'drizzle-orm';
import { getDb } from '../database.js';
import { knowledge } from '../schema.js';

export async function learnFact(userId: string, key: string, value: string, category = 'general', source?: string) {
  const db = getDb();
  const existing = await db.select().from(knowledge).where(and(eq(knowledge.userId, userId), eq(knowledge.key, key))).limit(1);

  if (existing.length > 0) {
    await db.update(knowledge).set({ value, updatedAt: new Date(), confidence: 90, source }).where(eq(knowledge.id, existing[0].id));
    return existing[0];
  }

  const [fact] = await db.insert(knowledge).values({ userId, key, value, category, source }).returning();
  return fact;
}

export async function getUserKnowledge(userId: string): Promise<string> {
  const db = getDb();
  const facts = await db.select().from(knowledge).where(eq(knowledge.userId, userId)).orderBy(desc(knowledge.updatedAt));
  return facts.map(f => `- ${f.key}: ${f.value}`).join('\n');
}

/**
 * Search knowledge by keyword (semantic-like search using ILIKE)
 */
export async function searchKnowledge(userId: string, query: string): Promise<string> {
  const db = getDb();
  const pattern = `%${query}%`;
  const facts = await db.select().from(knowledge)
    .where(and(
      eq(knowledge.userId, userId),
      or(
        ilike(knowledge.key, pattern),
        ilike(knowledge.value, pattern),
        ilike(knowledge.category, pattern),
      ),
    ))
    .orderBy(desc(knowledge.confidence))
    .limit(20);

  return facts.map(f => `- ${f.key}: ${f.value} [${f.category}]`).join('\n');
}

/**
 * Get knowledge by category
 */
export async function getKnowledgeByCategory(userId: string, category: string): Promise<string> {
  const db = getDb();
  const facts = await db.select().from(knowledge)
    .where(and(eq(knowledge.userId, userId), eq(knowledge.category, category)))
    .orderBy(desc(knowledge.updatedAt));
  return facts.map(f => `- ${f.key}: ${f.value}`).join('\n');
}

/**
 * Get knowledge count for a user
 */
export async function getKnowledgeCount(userId: string): Promise<number> {
  const db = getDb();
  const result = await db.select({ count: sql<number>`count(*)` }).from(knowledge).where(eq(knowledge.userId, userId));
  return Number(result[0]?.count ?? 0);
}
