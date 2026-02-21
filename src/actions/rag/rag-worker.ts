/**
 * RAG Worker — runs document ingestion in a child process to avoid OOM
 * on the main server (whose V8 heap is already large from all subsystems).
 *
 * Usage: fork this file and send messages via IPC.
 * Messages: { type: 'ingest', filePath, userId, dbUrl }
 * Returns:  { type: 'result', success, chunks?, source?, error? }
 */

import { readFile } from 'fs/promises';

// ── Minimal local embedding (no external deps) ─────────────────────
function localEmbedding(text: string): number[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const DIM = 256;
  const vec = new Float64Array(DIM);
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    const idx = Math.abs(hash) % DIM;
    vec[idx] += 1;
  }
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const result: number[] = new Array(DIM);
  for (let i = 0; i < DIM; i++) result[i] = vec[i] / norm;
  return result;
}

// ── Minimal text extraction (no heavy deps for basic types) ─────────
async function extractText(filePath: string): Promise<string> {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'txt': case 'md': case 'csv': case 'json': case 'ts': case 'js': case 'py':
      return readFile(filePath, 'utf-8');
    case 'pdf': {
      const pdfMod = await import('pdf-parse');
      const pdfParse = (pdfMod as any).default ?? pdfMod;
      const buffer = await readFile(filePath);
      return (await pdfParse(buffer)).text;
    }
    case 'docx': {
      const mammoth = await import('mammoth');
      const buffer = await readFile(filePath);
      return (await mammoth.extractRawText({ buffer })).value;
    }
    case 'xlsx': case 'xls': {
      const XLSX = await import('xlsx');
      const buffer = await readFile(filePath);
      const wb = XLSX.read(buffer, { type: 'buffer' });
      return wb.SheetNames.map(s => `## Sheet: ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`).join('\n\n');
    }
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}

// ── Minimal chunker ──────────────────────────────────────────────────
interface Chunk { id: string; text: string; source: string; index: number; }

function chunkText(text: string, source: string, chunkSize = 1000, overlap = 200): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0, start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunkEnd = end;
    if (end < text.length) {
      const bp = Math.max(text.lastIndexOf('.', end), text.lastIndexOf('\n', end));
      if (bp > start + chunkSize * 0.5) chunkEnd = bp + 1;
    }
    const content = text.slice(start, chunkEnd).trim();
    if (content.length > 50) {
      chunks.push({ id: `${source}-${index}`, text: content, source, index: index++ });
    }
    const nextStart = chunkEnd - overlap;
    start = nextStart <= start ? text.length : nextStart;
  }
  return chunks;
}

// ── Persist to PostgreSQL (raw pg client — no Drizzle, no bloat) ────
async function persistChunks(
  chunks: Array<{ id: string; text: string; source: string; index: number; embedding: number[] }>,
  userId: string,
  dbUrl: string,
): Promise<void> {
  // Dynamic import pg to avoid bundling in main process
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // Ensure table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        source TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        embedding TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO document_chunks (id, user_id, text, source, chunk_index, embedding)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [chunk.id, userId, chunk.text, chunk.source, chunk.index, JSON.stringify(chunk.embedding)],
      );
    }
  } finally {
    await client.end();
  }
}

// ── IPC Message Handler ──────────────────────────────────────────────
process.on('message', async (msg: any) => {
  if (msg.type === 'ingest') {
    try {
      const { filePath, userId, dbUrl } = msg;
      const fileName = filePath.split(/[/\\]/).pop() ?? filePath;

      // 1. Extract text
      const text = await extractText(filePath);

      // 2. Chunk
      const chunks = chunkText(text, fileName);

      // 3. Embed (local)
      const embeddedChunks = chunks.map(c => ({
        ...c,
        embedding: localEmbedding(c.text),
      }));

      // 4. Persist
      await persistChunks(embeddedChunks, userId, dbUrl);

      process.send!({
        type: 'result',
        success: true,
        chunks: chunks.length,
        source: fileName,
      });
    } catch (err: any) {
      process.send!({
        type: 'result',
        success: false,
        error: err.message,
      });
    }
  }
});

// Signal ready
process.send!({ type: 'ready' });
