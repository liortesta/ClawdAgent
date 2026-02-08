import { eq, and } from 'drizzle-orm';
import { getDb } from '../database.js';
import { users } from '../schema.js';

export async function findOrCreateUser(platformId: string, platform: string, name?: string) {
  const db = getDb();
  const existing = await db.select().from(users).where(and(eq(users.platformId, platformId), eq(users.platform, platform))).limit(1);

  if (existing.length > 0) return existing[0];

  const [created] = await db.insert(users).values({ platformId, platform, name }).returning();
  return created;
}

export async function getUserById(id: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function updateUserPreferences(id: string, preferences: Record<string, unknown>) {
  const db = getDb();
  await db.update(users).set({ preferences, updatedAt: new Date() }).where(eq(users.id, id));
}
