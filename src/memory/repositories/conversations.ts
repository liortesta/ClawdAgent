import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../database.js';
import { conversations } from '../schema.js';

export async function getOrCreateConversation(userId: string, platform: string) {
  const db = getDb();
  const existing = await db.select().from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.platform, platform), eq(conversations.isActive, true)))
    .orderBy(desc(conversations.updatedAt)).limit(1);

  if (existing.length > 0) return existing[0];

  const [created] = await db.insert(conversations).values({ userId, platform }).returning();
  return created;
}

export async function getConversationHistory(userId: string, platform: string, limit = 20) {
  const db = getDb();
  return db.select().from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.platform, platform)))
    .orderBy(desc(conversations.createdAt)).limit(limit);
}
