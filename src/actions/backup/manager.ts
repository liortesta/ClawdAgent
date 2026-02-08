import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getDb } from '../../memory/database.js';
import logger from '../../utils/logger.js';

const BACKUP_DIR = './backups';

export async function createBackup(): Promise<string> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `clawdagent-backup-${timestamp}.json`;
  const filepath = join(BACKUP_DIR, filename);

  try {
    const db = getDb();
    const data: Record<string, any[]> = {};
    const tables = ['knowledge', 'messages', 'tasks', 'users', 'servers', 'cron_tasks', 'document_chunks', 'usage_logs'];

    for (const table of tables) {
      try {
        const result = await db.execute(`SELECT * FROM ${table}`);
        data[table] = result.rows as any[];
      } catch { data[table] = []; }
    }

    await writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info('Backup created', { filepath, tables: Object.keys(data).length });
    return filepath;
  } catch (err: any) {
    logger.error('Backup failed', { error: err.message });
    throw err;
  }
}

export async function restoreBackup(filepath: string): Promise<{ restored: number }> {
  const content = await readFile(filepath, 'utf-8');
  const data = JSON.parse(content);
  let restored = 0;

  const db = getDb();
  for (const [table, rows] of Object.entries(data)) {
    for (const row of rows as any[]) {
      try {
        const cols = Object.keys(row);
        const vals = Object.values(row);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        await db.execute(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          vals,
        );
        restored++;
      } catch {}
    }
  }

  logger.info('Backup restored', { filepath, rows: restored });
  return { restored };
}
