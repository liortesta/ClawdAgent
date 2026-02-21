import { sql } from 'drizzle-orm';
import { getDb } from '../database.js';
import { knowledge, memoryEntries } from '../schema.js';
import logger from '../../utils/logger.js';

/**
 * Hybrid Memory Search — combines keyword ILIKE + PostgreSQL full-text ranking.
 * Searches across both `knowledge` and `memory_entries` tables and returns
 * a unified ranked result set.
 */

interface SearchResult {
  source: 'knowledge' | 'memory';
  id: string;
  key: string;
  value: string;
  category?: string;
  layer?: string;
  tags?: string[];
  score: number;
}

/**
 * Search across knowledge + memory entries using hybrid keyword + full-text ranking.
 * Results are scored and merged, with the top N returned.
 */
export async function hybridSearch(
  query: string,
  opts: { userId?: string; limit?: number; layers?: string[] } = {},
): Promise<SearchResult[]> {
  const limit = opts.limit ?? 20;
  const db = getDb();
  const results: SearchResult[] = [];

  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // Build tsquery from words (AND-joined for full-text)
  const tsQuery = words.map(w => w.replace(/[^a-zA-Z0-9\u0590-\u05FF\u0600-\u06FF]/g, '')).filter(Boolean).join(' & ');
  const ilikePattern = `%${query}%`;

  try {
    // 1. Search knowledge table (keyword ILIKE + full-text rank)
    const knowledgeRows = await db.execute(sql`
      SELECT
        id, key, value, category, confidence,
        COALESCE(ts_rank(
          to_tsvector('simple', COALESCE(key, '') || ' ' || COALESCE(value, '')),
          to_tsquery('simple', ${tsQuery})
        ), 0) AS rank,
        CASE WHEN key ILIKE ${ilikePattern} THEN 2 ELSE 0 END +
        CASE WHEN value ILIKE ${ilikePattern} THEN 1 ELSE 0 END AS keyword_score
      FROM ${knowledge}
      WHERE
        (key ILIKE ${ilikePattern} OR value ILIKE ${ilikePattern} OR category ILIKE ${ilikePattern})
        ${opts.userId ? sql`AND user_id = ${opts.userId}` : sql``}
      ORDER BY rank DESC, keyword_score DESC, confidence DESC
      LIMIT ${limit}
    `);

    for (const r of knowledgeRows.rows as any[]) {
      results.push({
        source: 'knowledge',
        id: r.id,
        key: r.key,
        value: r.value,
        category: r.category,
        score: Number(r.rank) * 10 + Number(r.keyword_score) + (Number(r.confidence ?? 50) / 100),
      });
    }
  } catch (err: any) {
    logger.debug('Knowledge search partial fail', { error: err.message });
  }

  try {
    // 2. Search memory_entries table (keyword ILIKE + full-text rank + tag match)
    const layerFilter = opts.layers?.length
      ? sql`AND layer = ANY(${opts.layers})`
      : sql``;

    const memoryRows = await db.execute(sql`
      SELECT
        id, layer, key, value, tags, impact, access_count,
        COALESCE(ts_rank(
          to_tsvector('simple', COALESCE(key, '') || ' ' || COALESCE(value, '')),
          to_tsquery('simple', ${tsQuery})
        ), 0) AS rank,
        CASE WHEN key ILIKE ${ilikePattern} THEN 2 ELSE 0 END +
        CASE WHEN value ILIKE ${ilikePattern} THEN 1 ELSE 0 END AS keyword_score
      FROM ${memoryEntries}
      WHERE
        (key ILIKE ${ilikePattern} OR value ILIKE ${ilikePattern})
        ${layerFilter}
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY rank DESC, keyword_score DESC, impact DESC
      LIMIT ${limit}
    `);

    for (const r of memoryRows.rows as any[]) {
      const tags = Array.isArray(r.tags) ? r.tags : [];
      const tagBoost = tags.some((t: string) => words.some(w => t.toLowerCase().includes(w.toLowerCase()))) ? 2 : 0;

      results.push({
        source: 'memory',
        id: r.id,
        key: r.key,
        value: r.value,
        layer: r.layer,
        tags,
        score: Number(r.rank) * 10 + Number(r.keyword_score) + tagBoost + (Number(r.impact ?? 0.5) * 2),
      });
    }
  } catch (err: any) {
    logger.debug('Memory search partial fail', { error: err.message });
  }

  // Merge & sort by combined score
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Format hybrid search results as a readable string for AI context injection.
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return 'No relevant memories found.';
  return results.map((r, i) => {
    const prefix = r.source === 'knowledge' ? `[KB:${r.category ?? 'general'}]` : `[MEM:${r.layer ?? '?'}]`;
    const tagStr = r.tags?.length ? ` #${r.tags.join(' #')}` : '';
    return `${i + 1}. ${prefix} ${r.key}: ${r.value}${tagStr}`;
  }).join('\n');
}
