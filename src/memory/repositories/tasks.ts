import { eq, and, desc, lte } from 'drizzle-orm';
import { getDb } from '../database.js';
import { tasks } from '../schema.js';

export async function createTask(userId: string, data: { title: string; description?: string; priority?: string; dueDate?: Date; tags?: string[] }) {
  const db = getDb();
  const [task] = await db.insert(tasks).values({ userId, ...data }).returning();
  return task;
}

export async function getUserTasks(userId: string, status?: string) {
  const db = getDb();
  const conditions = [eq(tasks.userId, userId)];
  if (status) conditions.push(eq(tasks.status, status));
  return db.select().from(tasks).where(and(...conditions)).orderBy(desc(tasks.createdAt));
}

export async function updateTask(taskId: string, data: Partial<{ title: string; status: string; priority: string; completedAt: Date }>) {
  const db = getDb();
  await db.update(tasks).set({ ...data, updatedAt: new Date() }).where(eq(tasks.id, taskId));
}

export async function getOverdueTasks(userId: string) {
  const db = getDb();
  return db.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, 'pending'), lte(tasks.dueDate, new Date())));
}
