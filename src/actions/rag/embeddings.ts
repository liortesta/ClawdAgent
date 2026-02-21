import config from '../../config.js';
import logger from '../../utils/logger.js';

export async function getEmbedding(text: string): Promise<number[]> {
  // Use local embedding by default — zero memory overhead, instant, no API cost.
  // External APIs (OpenAI/OpenRouter) can be enabled via EMBEDDING_PROVIDER env var.
  const provider = process.env.EMBEDDING_PROVIDER?.toLowerCase();

  if (provider === 'openai' && config.OPENAI_API_KEY) {
    try {
      const baseUrl = config.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
      const res = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        return data.data[0].embedding;
      }
    } catch (err: any) {
      logger.warn('OpenAI embedding failed, falling back to local', { error: err.message });
    }
  }

  if (provider === 'openrouter' && config.OPENROUTER_API_KEY) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.OPENROUTER_API_KEY}` },
        body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: text.slice(0, 8000) }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        return data.data[0].embedding;
      }
    } catch (err: any) {
      logger.warn('OpenRouter embedding failed, falling back to local', { error: err.message });
    }
  }

  // Local embedding — no API key, no memory overhead, instant
  return localEmbedding(text);
}

/** Simple bag-of-words local embedding — no API key required. */
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
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const result: number[] = new Array(DIM);
  for (let i = 0; i < DIM; i++) result[i] = vec[i] / norm;
  return result;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
