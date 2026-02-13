import { Router, Request, Response } from 'express';
import multer from 'multer';
import { resolve as pathResolve } from 'path';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { RAGEngine } from '../../../actions/rag/rag-engine.js';
import { analyzeImage } from '../../../actions/vision/analyze.js';
import { chunkText } from '../../../actions/rag/chunker.js';
import logger from '../../../utils/logger.js';

const UPLOAD_DIR = pathResolve(process.cwd(), 'uploads');

export function setupRAGRoutes(ragEngine: RAGEngine): Router {
  const router = Router();

  // Ensure upload directory exists
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

  // Configure multer for file uploads
  const upload = multer({
    dest: UPLOAD_DIR,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (_req, file, cb) => {
      const allowed = [
        'text/plain', 'text/markdown', 'text/csv', 'application/json',
        'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'text/javascript', 'application/javascript', 'text/x-python',
        'text/typescript', 'application/typescript',
      ];
      // Also allow by extension
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      const allowedExts = ['txt', 'md', 'csv', 'json', 'pdf', 'docx', 'xlsx', 'xls', 'ts', 'js', 'py', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
      if (allowed.includes(file.mimetype) || (ext && allowedExts.includes(ext))) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype} (.${ext})`));
      }
    },
  });

  // POST /api/rag/upload — Upload and ingest a document into RAG
  router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const file = (req as any).file;
      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const ext = file.originalname.split('.').pop()?.toLowerCase();
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext ?? '');

      if (isImage) {
        // For images: analyze with vision AI and store the description as RAG content
        const { readFile } = await import('fs/promises');
        const buffer = await readFile(file.path);
        const mimeType = file.mimetype || 'image/jpeg';
        const description = await analyzeImage(buffer, 'Describe this image in detail. Include all visible text, objects, people, colors, and context.', mimeType);

        // Store image description as RAG chunks
        const chunks = chunkText(description, file.originalname);
        const vectorStore = (ragEngine as any).vectorStore;
        await vectorStore.addChunks(chunks, user.userId);

        // Clean up uploaded file
        try { unlinkSync(file.path); } catch {}

        res.json({
          success: true,
          source: file.originalname,
          type: 'image',
          chunks: chunks.length,
          description: description.slice(0, 200) + (description.length > 200 ? '...' : ''),
        });
      } else {
        // For documents: use RAG engine to ingest
        // Rename to preserve original extension (multer strips it)
        const { renameSync } = await import('fs');
        const newPath = `${file.path}.${ext}`;
        renameSync(file.path, newPath);

        const result = await ragEngine.ingestDocument(newPath, user.userId);

        // Clean up
        try { unlinkSync(newPath); } catch {}

        res.json({
          success: true,
          source: result.source,
          type: 'document',
          chunks: result.chunks,
        });
      }
    } catch (error: any) {
      logger.error('RAG upload failed', { error: error.message });
      res.status(500).json({ error: 'Failed to process file', details: error.message });
    }
  });

  // POST /api/rag/ingest-url — Ingest a web page URL into RAG
  router.post('/ingest-url', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { url } = req.body;
      if (!url) {
        res.status(400).json({ error: 'Missing url field' });
        return;
      }

      // Fetch the URL content
      const response = await fetch(url, {
        headers: { 'User-Agent': 'ClawdAgent/6.0 RAG Ingestion' },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status}`);

      const contentType = response.headers.get('content-type') ?? '';
      let text: string;

      if (contentType.includes('text/html')) {
        // Strip HTML tags for basic text extraction
        const html = await response.text();
        text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();
      } else {
        text = await response.text();
      }

      if (text.length < 50) {
        res.status(400).json({ error: 'URL returned insufficient content' });
        return;
      }

      const source = new URL(url).hostname + new URL(url).pathname.slice(0, 50);
      const chunks = chunkText(text, source);
      const vectorStore = (ragEngine as any).vectorStore;
      await vectorStore.addChunks(chunks, user.userId);

      res.json({
        success: true,
        source,
        type: 'url',
        chunks: chunks.length,
        contentLength: text.length,
      });
    } catch (error: any) {
      logger.error('RAG URL ingest failed', { error: error.message });
      res.status(500).json({ error: 'Failed to ingest URL', details: error.message });
    }
  });

  // POST /api/rag/query — Query the RAG knowledge base
  router.post('/query', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { question, topK } = req.body;
      if (!question) {
        res.status(400).json({ error: 'Missing question field' });
        return;
      }

      const results = await ragEngine.query(question, user.userId, topK ?? 5);
      res.json({
        question,
        answer: results || 'No relevant documents found.',
        documentsSearched: ragEngine.getChunkCount(user.userId),
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to query RAG', details: error.message });
    }
  });

  // GET /api/rag/documents — List all ingested documents
  router.get('/documents', (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const documents = ragEngine.listDocuments(user.userId);
      const chunkCount = ragEngine.getChunkCount(user.userId);
      res.json({ documents, totalChunks: chunkCount });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to list documents', details: error.message });
    }
  });

  // DELETE /api/rag/documents/:source — Delete a document from RAG
  router.delete('/documents/:source', (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const source = decodeURIComponent(req.params.source as string);
      ragEngine.deleteDocument(source, user.userId);
      res.json({ success: true, deleted: source });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete document', details: error.message });
    }
  });

  // GET /api/rag/stats — RAG stats
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      res.json({
        documents: ragEngine.listDocuments(user.userId).length,
        chunks: ragEngine.getChunkCount(user.userId),
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to get RAG stats', details: error.message });
    }
  });

  return router;
}
