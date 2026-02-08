import { getDb } from '../../memory/database.js';
import { getEmbedding, cosineSimilarity } from './embeddings.js';
import { Chunk } from './chunker.js';
import logger from '../../utils/logger.js';

interface StoredChunk extends Chunk {
  embedding: number[];
  userId: string;
}

export class VectorStore {
  private chunks: StoredChunk[] = [];

  async addChunks(chunks: Chunk[], userId: string): Promise<void> {
    for (const chunk of chunks) {
      try {
        const embedding = await getEmbedding(chunk.text);
        this.chunks.push({ ...chunk, embedding, userId });
        await this.persistChunk(chunk, embedding, userId);
      } catch (err: any) {
        logger.warn('Failed to embed chunk', { id: chunk.id, error: err.message });
      }
    }
    logger.info('Chunks stored', { count: chunks.length, userId });
  }

  async search(query: string, userId: string, topK = 5): Promise<Array<Chunk & { score: number }>> {
    const queryEmbedding = await getEmbedding(query);
    const userChunks = this.chunks.filter(c => c.userId === userId);

    const scored = userChunks.map(chunk => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).filter(c => c.score > 0.3);
  }

  deleteBySource(source: string, userId: string): void {
    this.chunks = this.chunks.filter(c => !(c.source === source && c.userId === userId));
  }

  listDocuments(userId: string): string[] {
    return [...new Set(this.chunks.filter(c => c.userId === userId).map(c => c.source))];
  }

  getChunkCount(userId: string): number {
    return this.chunks.filter(c => c.userId === userId).length;
  }

  async loadFromDb(): Promise<void> {
    try {
      const db = getDb();
      const rows = await db.execute(`SELECT * FROM document_chunks`);
      for (const row of rows.rows as any[]) {
        this.chunks.push({
          id: row.id, text: row.text, source: row.source,
          index: row.chunk_index, userId: row.user_id,
          embedding: JSON.parse(row.embedding),
        });
      }
      logger.info('Vector store loaded from DB', { chunks: this.chunks.length });
    } catch { /* table may not exist yet */ }
  }

  private async persistChunk(chunk: Chunk, embedding: number[], userId: string): Promise<void> {
    try {
      const db = getDb();
      await db.execute(
        `INSERT INTO document_chunks (id, user_id, text, source, chunk_index, embedding)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [chunk.id, userId, chunk.text, chunk.source, chunk.index, JSON.stringify(embedding)],
      );
    } catch {}
  }
}
