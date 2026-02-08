import { extractText } from './extractor.js';
import { chunkText } from './chunker.js';
import { VectorStore } from './vector-store.js';
import logger from '../../utils/logger.js';

export class RAGEngine {
  private vectorStore: VectorStore;

  constructor() {
    this.vectorStore = new VectorStore();
  }

  async init(): Promise<void> {
    await this.vectorStore.loadFromDb();
  }

  async ingestDocument(filePath: string, userId: string): Promise<{ chunks: number; source: string }> {
    const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
    logger.info('Ingesting document', { filePath, userId });

    const text = await extractText(filePath);
    const chunks = chunkText(text, fileName);
    await this.vectorStore.addChunks(chunks, userId);

    return { chunks: chunks.length, source: fileName };
  }

  async query(question: string, userId: string, topK = 5): Promise<string> {
    const results = await this.vectorStore.search(question, userId, topK);
    if (results.length === 0) return '';

    return results.map(r =>
      `[Source: ${r.source}] (relevance: ${(r.score * 100).toFixed(0)}%)\n${r.text}`
    ).join('\n\n---\n\n');
  }

  listDocuments(userId: string): string[] {
    return this.vectorStore.listDocuments(userId);
  }

  deleteDocument(source: string, userId: string): void {
    this.vectorStore.deleteBySource(source, userId);
  }

  getChunkCount(userId: string): number {
    return this.vectorStore.getChunkCount(userId);
  }
}
