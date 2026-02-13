import { BaseTool, ToolResult } from './base-tool.js';
import { RAGEngine } from '../../actions/rag/rag-engine.js';
import { chunkText } from '../../actions/rag/chunker.js';
import logger from '../../utils/logger.js';

// Singleton RAG engine reference — set by the main app
let ragEngineRef: RAGEngine | null = null;

export function setRAGEngineRef(engine: RAGEngine) {
  ragEngineRef = engine;
}

export class RAGTool extends BaseTool {
  name = 'rag';
  description = 'Knowledge base — ingest documents, query for relevant context, list and manage documents.';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input.action as string;
    const userId = (input.userId as string) ?? 'default';

    if (!ragEngineRef) {
      return { success: false, output: '', error: 'RAG engine not initialized' };
    }

    try {
      switch (action) {
        case 'query': {
          const question = input.question as string;
          if (!question) return { success: false, output: '', error: 'Missing question parameter' };
          const results = await ragEngineRef.query(question, userId, (input.topK as number) ?? 5);
          return { success: true, output: results || 'No relevant documents found.' };
        }

        case 'ingest_text': {
          const text = input.text as string;
          const source = (input.source as string) ?? 'agent-input';
          if (!text) return { success: false, output: '', error: 'Missing text parameter' };
          const chunks = chunkText(text, source);
          const vectorStore = (ragEngineRef as any).vectorStore;
          await vectorStore.addChunks(chunks, userId);
          return { success: true, output: `Ingested "${source}": ${chunks.length} chunks stored.` };
        }

        case 'ingest_url': {
          const url = input.url as string;
          if (!url) return { success: false, output: '', error: 'Missing url parameter' };

          const response = await fetch(url, {
            headers: { 'User-Agent': 'ClawdAgent/6.0 RAG' },
            signal: AbortSignal.timeout(30000),
          });
          if (!response.ok) return { success: false, output: '', error: `Failed to fetch: ${response.status}` };

          const html = await response.text();
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          const source = new URL(url).hostname + new URL(url).pathname.slice(0, 50);
          const chunks = chunkText(text, source);
          const vectorStore = (ragEngineRef as any).vectorStore;
          await vectorStore.addChunks(chunks, userId);
          return { success: true, output: `Ingested URL "${source}": ${chunks.length} chunks (${text.length} chars).` };
        }

        case 'list': {
          const docs = ragEngineRef.listDocuments(userId);
          const count = ragEngineRef.getChunkCount(userId);
          if (docs.length === 0) return { success: true, output: 'No documents in knowledge base.' };
          return { success: true, output: `Documents (${count} total chunks):\n${docs.map(d => `- ${d}`).join('\n')}` };
        }

        case 'delete': {
          const source = input.source as string;
          if (!source) return { success: false, output: '', error: 'Missing source parameter' };
          ragEngineRef.deleteDocument(source, userId);
          return { success: true, output: `Deleted document: ${source}` };
        }

        case 'stats': {
          const docs = ragEngineRef.listDocuments(userId);
          const count = ragEngineRef.getChunkCount(userId);
          return { success: true, output: JSON.stringify({ documents: docs.length, chunks: count }) };
        }

        default:
          return { success: false, output: '', error: `Unknown RAG action: ${action}. Available: query, ingest_text, ingest_url, list, delete, stats` };
      }
    } catch (err: any) {
      logger.error('RAG tool error', { action, error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }
}
