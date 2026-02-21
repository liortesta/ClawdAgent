import { sql } from 'drizzle-orm';
import { getDb } from '../../memory/database.js';
import { getEmbedding, cosineSimilarity } from './embeddings.js';
import { Chunk } from './chunker.js';
import logger from '../../utils/logger.js';

interface StoredChunk extends Chunk {
  embedding: number[];
  userId: string;
}

export class VectorStore {
  /**
   * In-memory cache of chunks, keyed by userId.
   * Loaded lazily per-user (not all at once) to prevent OOM.
   */
  private chunksByUser = new Map<string, StoredChunk[]>();
  private loadedUsers = new Set<string>();

  async addChunks(chunks: Chunk[], userId: string): Promise<void> {
    const userChunks = this.getUserChunks(userId);
    for (const chunk of chunks) {
      try {
        const embedding = await getEmbedding(chunk.text);
        userChunks.push({ ...chunk, embedding, userId });
        await this.persistChunk(chunk, embedding, userId);
      } catch (err: any) {
        logger.warn('Failed to embed chunk', { id: chunk.id, error: err.message });
      }
    }
    logger.info('Chunks stored', { count: chunks.length, userId });
  }

  async search(query: string, userId: string, topK = 5): Promise<Array<Chunk & { score: number }>> {
    await this.ensureUserLoaded(userId);
    const userChunks = this.getUserChunks(userId);

    const queryEmbedding = await getEmbedding(query);

    const scored = userChunks.map(chunk => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).filter(c => c.score > 0.3);
  }

  deleteBySource(source: string, userId: string): void {
    const userChunks = this.getUserChunks(userId);
    this.chunksByUser.set(userId, userChunks.filter(c => c.source !== source));
  }

  listDocuments(userId: string): string[] {
    const userChunks = this.getUserChunks(userId);
    return [...new Set(userChunks.map(c => c.source))];
  }

  getChunkCount(userId: string): number {
    return this.getUserChunks(userId).length;
  }

  /**
   * Initialize — load ONLY chunk counts per user (not the actual data).
   * Individual user chunks are loaded lazily on first access.
   */
  async loadFromDb(): Promise<void> {
    try {
      const db = getDb();
      const result = await db.execute(sql`SELECT user_id, count(*) as cnt FROM document_chunks GROUP BY user_id`);
      const totalChunks = (result.rows as any[]).reduce((sum, r) => sum + Number(r.cnt), 0);
      logger.info('Vector store index ready (lazy load)', { users: result.rows.length, totalChunks });
    } catch { /* table may not exist yet */ }
  }

  /** Load a specific user's chunks from DB */
  private async ensureUserLoaded(userId: string): Promise<void> {
    if (this.loadedUsers.has(userId)) return;
    try {
      const db = getDb();
      const rows = await db.execute(sql`SELECT * FROM document_chunks WHERE user_id = ${userId}`);
      const userChunks = this.getUserChunks(userId);
      for (const row of rows.rows as any[]) {
        if (userChunks.some(c => c.id === row.id)) continue;
        userChunks.push({
          id: row.id, text: row.text, source: row.source,
          index: row.chunk_index, userId: row.user_id,
          embedding: JSON.parse(row.embedding),
        });
      }
      this.loadedUsers.add(userId);
      logger.debug('Loaded chunks for user', { userId, chunks: userChunks.length });
    } catch (err: any) {
      logger.warn('Failed to load user chunks', { userId, error: err.message });
    }
  }

  private getUserChunks(userId: string): StoredChunk[] {
    if (!this.chunksByUser.has(userId)) {
      this.chunksByUser.set(userId, []);
    }
    return this.chunksByUser.get(userId)!;
  }

  private async persistChunk(chunk: Chunk, embedding: number[], userId: string): Promise<void> {
    try {
      const db = getDb();
      const embeddingJson = JSON.stringify(embedding);
      await db.execute(sql`
        INSERT INTO document_chunks (id, user_id, text, source, chunk_index, embedding)
        VALUES (${chunk.id}, ${userId}, ${chunk.text}, ${chunk.source}, ${chunk.index}, ${embeddingJson})
        ON CONFLICT (id) DO NOTHING
      `);
    } catch {}
  }
}
