import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import config from '../config.js';
import logger from '../utils/logger.js';
import * as schema from './schema.js';

const { Pool } = pg;

let pool: pg.Pool;
let db: ReturnType<typeof drizzle>;

export async function initDatabase() {
  pool = new Pool({ connectionString: config.DATABASE_URL });

  pool.on('error', (err) => {
    logger.error('Database pool error', { error: err.message });
  });

  try {
    const client = await pool.connect();
    client.release();
    logger.info('Database connected');
  } catch (error: any) {
    logger.error('Database connection failed', { error: error.message });
    throw error;
  }

  db = drizzle(pool, { schema });
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    logger.info('Database connection closed');
  }
}
