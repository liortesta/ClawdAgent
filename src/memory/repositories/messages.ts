import { eq, desc } from 'drizzle-orm';
import { getDb } from '../database.js';
import { messages } from '../schema.js';

export async function saveMessage(conversationId: string, userId: string, role: string, content: string, metadata?: Record<string, unknown>) {
  const db = getDb();
  const [msg] = await db.insert(messages).values({
    conversationId, userId, role, content,
    agentId: metadata?.agent as string,
    intent: metadata?.intent as string,
    tokensUsed: metadata?.tokens,
    metadata,
  }).returning();
  return msg;
}

export async function getRecentMessages(conversationId: string, limit = 20) {
  const db = getDb();
  const msgs = await db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt)).limit(limit);
  return msgs.reverse();
}
