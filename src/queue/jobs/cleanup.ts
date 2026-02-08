import { lte } from 'drizzle-orm';
import { getDb } from '../../memory/database.js';
import { messages } from '../../memory/schema.js';
import logger from '../../utils/logger.js';

export async function handleCleanup(_data: Record<string, unknown>) {
  logger.info('Running data cleanup');

  try {
    const db = getDb();

    // Delete messages older than 90 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    await db.delete(messages).where(lte(messages.createdAt, cutoff));

    logger.info('Cleanup completed', { deletedBefore: cutoff.toISOString() });
  } catch (err: any) {
    logger.error('Cleanup failed', { error: err.message });
  }
}
