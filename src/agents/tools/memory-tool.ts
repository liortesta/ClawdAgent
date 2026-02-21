import { BaseTool, ToolResult } from './base-tool.js';
import { learnFact, getUserKnowledge, searchKnowledge, getKnowledgeByCategory, getKnowledgeCount } from '../../memory/repositories/knowledge.js';
import { hybridSearch, formatSearchResults } from '../../memory/repositories/hybrid-search.js';
import { getDb } from '../../memory/database.js';
import { knowledge } from '../../memory/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Memory tool — lets the AI explicitly manage persistent memories.
 * Wraps the existing PostgreSQL knowledge repository.
 */
export class MemoryTool extends BaseTool {
  name = 'memory';
  description = 'Persistent memory system. Remember facts, recall knowledge, forget things.';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = String(input.action ?? '');
    const userId = String(input.userId ?? '');

    if (!userId) {
      return { success: false, output: '', error: 'userId is required' };
    }

    switch (action) {
      case 'remember': {
        const key = String(input.key ?? '');
        const value = String(input.value ?? '');
        const category = String(input.category ?? 'general');
        if (!key || !value) {
          return { success: false, output: '', error: 'key and value are required for remember' };
        }
        await learnFact(userId, key, value, category, 'explicit');
        this.log('Memory stored', { userId, key, category });
        return { success: true, output: `Remembered: [${category}] ${key} = ${value}` };
      }

      case 'recall': {
        const category = input.category ? String(input.category) : undefined;
        const search = input.search ? String(input.search) : undefined;
        const hybrid = input.hybrid !== false; // default to hybrid

        let result: string;
        if (search && hybrid) {
          // Hybrid search: keyword + full-text across knowledge + memory_entries
          const results = await hybridSearch(search, { userId, limit: 15 });
          result = formatSearchResults(results);
        } else if (search) {
          result = await searchKnowledge(userId, search);
        } else if (category) {
          result = await getKnowledgeByCategory(userId, category);
        } else {
          result = await getUserKnowledge(userId);
        }

        if (!result || result.trim().length === 0) {
          return { success: true, output: 'No memories found.' };
        }
        return { success: true, output: result };
      }

      case 'forget': {
        const key = String(input.key ?? '');
        if (!key) {
          return { success: false, output: '', error: 'key is required for forget' };
        }
        try {
          const db = getDb();
          await db.delete(knowledge).where(
            and(eq(knowledge.userId, userId), eq(knowledge.key, key))
          );
          return { success: true, output: `Forgot: ${key}` };
        } catch (err: any) {
          return { success: false, output: '', error: `Failed to forget: ${err.message}` };
        }
      }

      case 'forget_all': {
        try {
          const db = getDb();
          await db.delete(knowledge).where(eq(knowledge.userId, userId));
          return { success: true, output: 'All memories cleared.' };
        } catch (err: any) {
          return { success: false, output: '', error: `Failed to clear: ${err.message}` };
        }
      }

      case 'stats': {
        const count = await getKnowledgeCount(userId);
        return { success: true, output: `Memory stats: ${count} facts stored for this user.` };
      }

      default:
        return { success: false, output: '', error: `Unknown memory action: ${action}. Use: remember, recall, forget, forget_all, stats` };
    }
  }
}
