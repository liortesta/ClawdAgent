import config from '../../config.js';

export async function getEmbedding(text: string): Promise<number[]> {
  if (config.OPENAI_API_KEY) {
    const baseUrl = config.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      return data.data[0].embedding;
    }
  }

  if (config.OPENROUTER_API_KEY) {
    const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.OPENROUTER_API_KEY}` },
      body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: text.slice(0, 8000) }),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      return data.data[0].embedding;
    }
  }

  throw new Error('No embedding provider available');
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
