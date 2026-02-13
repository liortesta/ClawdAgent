import logger from '../utils/logger.js';

/** Memory layers as defined in the architecture */
type MemoryLayer = 'execution' | 'infrastructure' | 'strategic' | 'skill' | 'error';

/** A memory entry with metadata */
interface MemoryEntry {
  id: string;
  layer: MemoryLayer;
  key: string;
  value: string;
  tags: string[];
  impact: number;       // 0-1: how important this memory is
  accessCount: number;
  createdAt: number;
  lastAccessed: number;
  expiresAt?: number;   // Optional TTL
}

/** Failure pattern for clustering */
interface FailurePattern {
  errorType: string;
  context: string;
  count: number;
  lastSeen: number;
  resolution?: string;
  resolved: boolean;
}

/** Experience record for replay */
interface ExperienceRecord {
  id: string;
  taskType: string;
  input: string;
  output: string;
  success: boolean;
  agentUsed: string;
  toolsUsed: string[];
  duration: number;
  timestamp: number;
}

/** Relevance scoring weights */
const RELEVANCE_WEIGHTS = {
  recency: 0.3,
  impact: 0.3,
  similarity: 0.4,
};

const MAX_ENTRIES_PER_LAYER = 500;
const MAX_FAILURE_PATTERNS = 100;
const MAX_EXPERIENCE_RECORDS = 200;

export class MemoryHierarchy {
  private memories = new Map<string, MemoryEntry>();
  private failurePatterns: FailurePattern[] = [];
  private experiences: ExperienceRecord[] = [];
  private idCounter = 0;

  /** Store a memory entry */
  store(layer: MemoryLayer, key: string, value: string, opts?: {
    tags?: string[];
    impact?: number;
    ttlMs?: number;
  }): string {
    const id = `mem_${layer}_${++this.idCounter}`;
    const now = Date.now();

    const entry: MemoryEntry = {
      id, layer, key, value,
      tags: opts?.tags ?? [],
      impact: opts?.impact ?? 0.5,
      accessCount: 0,
      createdAt: now,
      lastAccessed: now,
      expiresAt: opts?.ttlMs ? now + opts.ttlMs : undefined,
    };

    this.memories.set(id, entry);
    this.enforceLayerLimits(layer);
    return id;
  }

  /** Retrieve relevant memories for a query */
  retrieve(query: string, opts?: {
    layer?: MemoryLayer;
    maxResults?: number;
    minRelevance?: number;
  }): MemoryEntry[] {
    const now = Date.now();
    const maxResults = opts?.maxResults ?? 10;
    const minRelevance = opts?.minRelevance ?? 0.1;

    // Filter by layer and expiry
    let candidates = Array.from(this.memories.values())
      .filter(m => {
        if (m.expiresAt && m.expiresAt < now) return false;
        if (opts?.layer && m.layer !== opts.layer) return false;
        return true;
      });

    // Score each by relevance
    const scored = candidates.map(m => ({
      entry: m,
      relevance: this.computeRelevance(m, query, now),
    }))
      .filter(s => s.relevance >= minRelevance)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxResults);

    // Update access stats
    for (const s of scored) {
      s.entry.accessCount++;
      s.entry.lastAccessed = now;
    }

    return scored.map(s => s.entry);
  }

  /** Record a failure for pattern clustering */
  recordFailure(errorType: string, context: string, resolution?: string): void {
    const existing = this.failurePatterns.find(
      p => p.errorType === errorType && this.contextSimilarity(p.context, context) > 0.7,
    );

    if (existing) {
      existing.count++;
      existing.lastSeen = Date.now();
      if (resolution) {
        existing.resolution = resolution;
        existing.resolved = true;
      }
    } else {
      this.failurePatterns.push({
        errorType, context,
        count: 1,
        lastSeen: Date.now(),
        resolution,
        resolved: !!resolution,
      });
      if (this.failurePatterns.length > MAX_FAILURE_PATTERNS) {
        // Remove oldest resolved patterns first
        const resolvedIdx = this.failurePatterns.findIndex(p => p.resolved);
        if (resolvedIdx >= 0) this.failurePatterns.splice(resolvedIdx, 1);
        else this.failurePatterns.shift();
      }
    }
  }

  /** Find known fix for an error */
  findKnownFix(errorType: string, context: string): string | undefined {
    const match = this.failurePatterns.find(
      p => p.errorType === errorType && p.resolved && this.contextSimilarity(p.context, context) > 0.5,
    );
    return match?.resolution;
  }

  /** Get failure clusters — grouped by error type */
  getFailureClusters(): Array<{
    errorType: string;
    count: number;
    resolved: number;
    unresolved: number;
    lastSeen: number;
  }> {
    const clusters = new Map<string, { count: number; resolved: number; unresolved: number; lastSeen: number }>();

    for (const p of this.failurePatterns) {
      const existing = clusters.get(p.errorType);
      if (existing) {
        existing.count += p.count;
        if (p.resolved) existing.resolved++;
        else existing.unresolved++;
        existing.lastSeen = Math.max(existing.lastSeen, p.lastSeen);
      } else {
        clusters.set(p.errorType, {
          count: p.count,
          resolved: p.resolved ? 1 : 0,
          unresolved: p.resolved ? 0 : 1,
          lastSeen: p.lastSeen,
        });
      }
    }

    return Array.from(clusters.entries())
      .map(([errorType, data]) => ({ errorType, ...data }))
      .sort((a, b) => b.count - a.count);
  }

  /** Record an experience for replay */
  recordExperience(exp: Omit<ExperienceRecord, 'id'>): void {
    this.experiences.push({ ...exp, id: `exp_${++this.idCounter}` });
    if (this.experiences.length > MAX_EXPERIENCE_RECORDS) this.experiences.shift();
  }

  /** Replay similar past experiences for a task */
  replayExperiences(taskType: string, limit = 5): ExperienceRecord[] {
    return this.experiences
      .filter(e => e.taskType === taskType && e.success)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /** Get successful patterns by task type */
  getSuccessPatterns(): Array<{
    taskType: string;
    successRate: number;
    bestAgent: string;
    avgDuration: number;
    count: number;
  }> {
    const grouped = new Map<string, ExperienceRecord[]>();
    for (const exp of this.experiences) {
      const arr = grouped.get(exp.taskType) ?? [];
      arr.push(exp);
      grouped.set(exp.taskType, arr);
    }

    return Array.from(grouped.entries()).map(([taskType, exps]) => {
      const successes = exps.filter(e => e.success);
      const agentCounts = new Map<string, number>();
      for (const e of successes) {
        agentCounts.set(e.agentUsed, (agentCounts.get(e.agentUsed) ?? 0) + 1);
      }
      const bestAgent = Array.from(agentCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';

      return {
        taskType,
        successRate: successes.length / exps.length,
        bestAgent,
        avgDuration: successes.reduce((s, e) => s + e.duration, 0) / (successes.length || 1),
        count: exps.length,
      };
    }).sort((a, b) => b.count - a.count);
  }

  /** Compress context: summarize old memories into fewer entries */
  compress(layer: MemoryLayer): number {
    const entries = Array.from(this.memories.values())
      .filter(m => m.layer === layer)
      .sort((a, b) => a.lastAccessed - b.lastAccessed);

    // Remove bottom 20% least accessed
    const toRemove = Math.floor(entries.length * 0.2);
    let removed = 0;
    for (let i = 0; i < toRemove; i++) {
      this.memories.delete(entries[i].id);
      removed++;
    }

    if (removed > 0) {
      logger.info('Memory compressed', { layer, removed, remaining: entries.length - removed });
    }
    return removed;
  }

  /** Get memory stats per layer */
  getStats(): Record<MemoryLayer, { count: number; avgImpact: number; avgAge: number }> {
    const now = Date.now();
    const layers: MemoryLayer[] = ['execution', 'infrastructure', 'strategic', 'skill', 'error'];
    const result = {} as Record<MemoryLayer, { count: number; avgImpact: number; avgAge: number }>;

    for (const layer of layers) {
      const entries = Array.from(this.memories.values()).filter(m => m.layer === layer);
      result[layer] = {
        count: entries.length,
        avgImpact: entries.length > 0 ? entries.reduce((s, e) => s + e.impact, 0) / entries.length : 0,
        avgAge: entries.length > 0 ? entries.reduce((s, e) => s + (now - e.createdAt), 0) / entries.length / 3600000 : 0, // hours
      };
    }

    return result;
  }

  /** Get full status */
  getStatus(): {
    totalMemories: number;
    layers: Record<MemoryLayer, number>;
    failurePatterns: number;
    experiences: number;
    unresolvedFailures: number;
  } {
    const layers = {} as Record<MemoryLayer, number>;
    for (const m of this.memories.values()) {
      layers[m.layer] = (layers[m.layer] ?? 0) + 1;
    }

    return {
      totalMemories: this.memories.size,
      layers,
      failurePatterns: this.failurePatterns.length,
      experiences: this.experiences.length,
      unresolvedFailures: this.failurePatterns.filter(p => !p.resolved).length,
    };
  }

  private computeRelevance(entry: MemoryEntry, query: string, now: number): number {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const age = now - entry.lastAccessed;
    const recency = 1 - Math.min(age / maxAge, 1);
    const impact = entry.impact;
    const similarity = this.contextSimilarity(entry.key + ' ' + entry.value, query);

    return recency * RELEVANCE_WEIGHTS.recency +
           impact * RELEVANCE_WEIGHTS.impact +
           similarity * RELEVANCE_WEIGHTS.similarity;
  }

  /** Simple keyword-based similarity (no embedding required) */
  private contextSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let overlap = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) overlap++;
    }
    return overlap / Math.max(wordsA.size, wordsB.size);
  }

  private enforceLayerLimits(layer: MemoryLayer): void {
    const entries = Array.from(this.memories.values())
      .filter(m => m.layer === layer)
      .sort((a, b) => a.lastAccessed - b.lastAccessed);

    while (entries.length > MAX_ENTRIES_PER_LAYER) {
      const oldest = entries.shift()!;
      this.memories.delete(oldest.id);
    }
  }
}
