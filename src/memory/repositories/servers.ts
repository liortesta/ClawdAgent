import { eq } from 'drizzle-orm';
import { getDb } from '../database.js';
import { servers } from '../schema.js';

export async function addServer(userId: string, data: { name: string; host: string; port?: number; username: string; authMethod?: string; encryptedCredential?: string }) {
  const db = getDb();
  const [server] = await db.insert(servers).values({ userId, ...data }).returning();
  return server;
}

export async function getUserServers(userId: string) {
  const db = getDb();
  return db.select().from(servers).where(eq(servers.userId, userId));
}

export async function updateServerStatus(serverId: string, status: string) {
  const db = getDb();
  await db.update(servers).set({ status, lastChecked: new Date() }).where(eq(servers.id, serverId));
}
