import { sql } from 'drizzle-orm';
import { getDb } from '../memory/database.js';

interface UsageRecord {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  userId: string;
  action: string;
  timestamp: string;
}

const PRICING: Record<string, { input: number; output: number }> = {
  // 4.6 series (current — Feb 2026)
  'claude-opus-4-6': { input: 0.005, output: 0.025 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  // OpenRouter dot-notation aliases
  'anthropic/claude-opus-4.6': { input: 0.005, output: 0.025 },
  'anthropic/claude-sonnet-4.6': { input: 0.003, output: 0.015 },
  'anthropic/claude-opus-4.5': { input: 0.005, output: 0.025 },
  'anthropic/claude-sonnet-4.5': { input: 0.003, output: 0.015 },
  'anthropic/claude-haiku-4.5': { input: 0.001, output: 0.005 },
  'anthropic/claude-opus-4.1': { input: 0.015, output: 0.075 },
  'anthropic/claude-sonnet-4': { input: 0.003, output: 0.015 },
  'anthropic/claude-opus-4': { input: 0.015, output: 0.075 },
  // 4.5 series (Anthropic IDs)
  'claude-sonnet-4-5-20250929': { input: 0.003, output: 0.015 },
  'claude-opus-4-5-20251101': { input: 0.005, output: 0.025 },
  'claude-haiku-4-5-20251001': { input: 0.001, output: 0.005 },
  // Legacy
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-opus-4-20250514': { input: 0.015, output: 0.075 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'openai/gpt-4o': { input: 0.005, output: 0.015 },
  'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'anthropic/claude-haiku-3.5': { input: 0.0008, output: 0.004 },
  'stepfun/step-3.5-flash:free': { input: 0, output: 0 },
  'nvidia/nemotron-nano-9b-v2:free': { input: 0, output: 0 },
  'nvidia/nemotron-nano-12b-v2-vl:free': { input: 0, output: 0 },
  'upstage/solar-pro-3:free': { input: 0, output: 0 },
  'meta-llama/llama-3.3-70b-instruct:free': { input: 0, output: 0 },
  'mistralai/mistral-small-3.1-24b-instruct:free': { input: 0, output: 0 },
  'deepseek/deepseek-r1-0528:free': { input: 0, output: 0 },
  'arcee-ai/trinity-mini:free': { input: 0, output: 0 },
  // Llama 4 (Apr 2025)
  'meta-llama/llama-4-scout': { input: 0.00011, output: 0.00034 },
  'meta-llama/llama-4-maverick': { input: 0.0005, output: 0.00077 },
  'meta-llama/llama-4-scout:free': { input: 0, output: 0 },
  'meta-llama/llama-4-maverick:free': { input: 0, output: 0 },
  // DeepSeek V3.2 (Dec 2025)
  'deepseek/deepseek-v3.2': { input: 0.00028, output: 0.00041 },
  'deepseek/deepseek-chat-v3.1': { input: 0.00021, output: 0.00079 },
  // Mistral (Dec 2025)
  'mistralai/mistral-large-3': { input: 0.002, output: 0.006 },
  'mistralai/devstral-2:free': { input: 0, output: 0 },
  // Qwen3 (2025-2026)
  'qwen/qwen3-coder:free': { input: 0, output: 0 },
  'qwen/qwen3-next-80b-a3b-instruct:free': { input: 0, output: 0 },
  // Gemma 3 (Mar 2025)
  'google/gemma-3-27b-it:free': { input: 0, output: 0 },
  'google/gemma-3-12b-it:free': { input: 0, output: 0 },
  // Gemini
  'google/gemini-2.5-flash': { input: 0.00015, output: 0.0006 },
  'google/gemini-2.5-pro-preview': { input: 0.00125, output: 0.01 },
  // Qwen3.5 (Feb 2026)
  'qwen/qwen3.5-397b-a17b': { input: 0.00015, output: 0.001 },
  // Other
  'zhipu/glm-5': { input: 0.001, output: 0.004 },
  'minimax/minimax-m2.5': { input: 0.0005, output: 0.002 },
  'zhipu/glm-4.7-flash': { input: 0.0001, output: 0.0004 },
  'whisper-1': { input: 0.006, output: 0 },
  'tts-1': { input: 0.015, output: 0 },
  'text-embedding-3-small': { input: 0.00002, output: 0 },
};

export class UsageTracker {
  private records: UsageRecord[] = [];
  private dailyBudget: number = 0;

  setDailyBudget(usd: number) { this.dailyBudget = usd; }

  async track(record: Omit<UsageRecord, 'cost' | 'timestamp'>): Promise<void> {
    const pricing = PRICING[record.model] ?? { input: 0.001, output: 0.005 };
    const cost = (record.inputTokens / 1000) * pricing.input + (record.outputTokens / 1000) * pricing.output;

    const full: UsageRecord = { ...record, cost, timestamp: new Date().toISOString() };
    this.records.push(full);

    try {
      const db = getDb();
      await db.execute(sql`INSERT INTO usage_logs (provider, model, input_tokens, output_tokens, cost, user_id, action, created_at)
         VALUES (${full.provider}, ${full.model}, ${full.inputTokens}, ${full.outputTokens}, ${full.cost}, ${full.userId}, ${full.action}, ${full.timestamp})`);
    } catch {}
  }

  getTodayCost(): number {
    const today = new Date().toISOString().split('T')[0];
    return this.records.filter(r => r.timestamp.startsWith(today)).reduce((sum, r) => sum + r.cost, 0);
  }

  getTodaySummary(): { totalCost: number; byModel: Record<string, number>; byAction: Record<string, number>; totalCalls: number } {
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = this.records.filter(r => r.timestamp.startsWith(today));

    const byModel: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    for (const r of todayRecords) {
      byModel[r.model] = (byModel[r.model] ?? 0) + r.cost;
      byAction[r.action] = (byAction[r.action] ?? 0) + r.cost;
    }

    return {
      totalCost: todayRecords.reduce((s, r) => s + r.cost, 0),
      byModel, byAction, totalCalls: todayRecords.length,
    };
  }

  getMonthCost(): number {
    const month = new Date().toISOString().slice(0, 7);
    return this.records.filter(r => r.timestamp.startsWith(month)).reduce((s, r) => s + r.cost, 0);
  }

  isOverBudget(): boolean {
    return this.dailyBudget > 0 && this.getTodayCost() >= this.dailyBudget;
  }

  getDailyBudgetLeft(): number {
    if (this.dailyBudget <= 0) return 10; // No budget set, assume $10
    return Math.max(0, this.dailyBudget - this.getTodayCost());
  }

  async loadFromDb(): Promise<void> {
    try {
      const db = getDb();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const rows = await db.execute(sql`SELECT * FROM usage_logs WHERE created_at > ${thirtyDaysAgo}`);
      for (const row of rows.rows as any[]) {
        this.records.push({
          provider: row.provider, model: row.model,
          inputTokens: row.input_tokens, outputTokens: row.output_tokens,
          cost: Number(row.cost), userId: row.user_id,
          action: row.action, timestamp: row.created_at,
        });
      }
    } catch {}
  }
}
