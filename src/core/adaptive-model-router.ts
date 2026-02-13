// Adaptive Model Router — benchmarking, auto-switching, latency-aware routing

/** Model performance benchmark */
interface ModelBenchmark {
  modelId: string;
  provider: string;
  taskType: string;
  successRate: number;
  avgLatency: number;     // ms
  avgCost: number;        // USD
  avgQuality: number;     // 0-1 estimated quality score
  sampleCount: number;
  lastTested: number;
}

/** Latency record */
interface LatencyRecord {
  modelId: string;
  provider: string;
  latency: number;
  timestamp: number;
}

/** Model selection result */
interface ModelSelection {
  modelId: string;
  provider: string;
  reason: string;
  score: number;
  fallback?: { modelId: string; provider: string };
}

const MAX_BENCHMARKS = 500;
const MAX_LATENCY_RECORDS = 2000;
const BENCHMARK_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class AdaptiveModelRouter {
  private benchmarks: ModelBenchmark[] = [];
  private latencyRecords: LatencyRecord[] = [];

  /** Record a model execution result for benchmarking */
  recordExecution(params: {
    modelId: string;
    provider: string;
    taskType: string;
    success: boolean;
    latency: number;
    cost: number;
    quality?: number;
  }): void {
    // Update or create benchmark
    const existing = this.benchmarks.find(
      b => b.modelId === params.modelId && b.taskType === params.taskType,
    );

    if (existing) {
      const n = existing.sampleCount;
      existing.successRate = (existing.successRate * n + (params.success ? 1 : 0)) / (n + 1);
      existing.avgLatency = (existing.avgLatency * n + params.latency) / (n + 1);
      existing.avgCost = (existing.avgCost * n + params.cost) / (n + 1);
      existing.avgQuality = (existing.avgQuality * n + (params.quality ?? (params.success ? 0.7 : 0.2))) / (n + 1);
      existing.sampleCount++;
      existing.lastTested = Date.now();
    } else {
      this.benchmarks.push({
        modelId: params.modelId,
        provider: params.provider,
        taskType: params.taskType,
        successRate: params.success ? 1 : 0,
        avgLatency: params.latency,
        avgCost: params.cost,
        avgQuality: params.quality ?? (params.success ? 0.7 : 0.2),
        sampleCount: 1,
        lastTested: Date.now(),
      });
      if (this.benchmarks.length > MAX_BENCHMARKS) this.benchmarks.shift();
    }

    // Record latency
    this.latencyRecords.push({
      modelId: params.modelId, provider: params.provider,
      latency: params.latency, timestamp: Date.now(),
    });
    if (this.latencyRecords.length > MAX_LATENCY_RECORDS) this.latencyRecords.shift();
  }

  /** Select best model for a task based on benchmarks */
  selectModel(params: {
    taskType: string;
    requiresTools: boolean;
    maxLatencyMs?: number;
    maxCostUsd?: number;
    preferQuality?: boolean;     // true = prefer quality over cost
    availableModels: Array<{ modelId: string; provider: string; supportsTools: boolean }>;
  }): ModelSelection {
    const candidates = params.availableModels
      .filter(m => !params.requiresTools || m.supportsTools);

    if (candidates.length === 0) {
      const fallback = params.availableModels[0];
      return {
        modelId: fallback?.modelId ?? 'unknown',
        provider: fallback?.provider ?? 'unknown',
        reason: 'No compatible models available',
        score: 0,
      };
    }

    // Score each candidate
    const scored = candidates.map(model => {
      const benchmark = this.getBenchmark(model.modelId, params.taskType);
      const latency = this.getRecentLatency(model.modelId);

      let score = 0.5; // Default for unbenched models

      if (benchmark && benchmark.sampleCount >= 3) {
        const successScore = benchmark.successRate;
        const qualityScore = benchmark.avgQuality;

        // Latency score: 1.0 if fast, 0 if over budget
        const maxLatency = params.maxLatencyMs ?? 30000;
        const actualLatency = latency ?? benchmark.avgLatency;
        const latencyScore = actualLatency < maxLatency ? 1 - (actualLatency / maxLatency) : 0;

        // Cost score: 1.0 if free, decreasing
        const maxCost = params.maxCostUsd ?? 0.1;
        const costScore = benchmark.avgCost < maxCost ? 1 - (benchmark.avgCost / maxCost) : 0;

        if (params.preferQuality) {
          score = successScore * 0.35 + qualityScore * 0.30 + latencyScore * 0.15 + costScore * 0.20;
        } else {
          score = successScore * 0.25 + qualityScore * 0.15 + latencyScore * 0.20 + costScore * 0.40;
        }

        // Freshness penalty: stale benchmarks are less reliable
        const age = Date.now() - benchmark.lastTested;
        if (age > BENCHMARK_STALE_MS) {
          score *= 0.8; // 20% penalty for stale data
        }
      } else {
        // Unknown model: slight exploration bonus
        score = 0.55;
      }

      return { ...model, score, benchmark };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0];
    const fallback = scored.length > 1 ? scored[1] : undefined;

    const reason = best.benchmark && best.benchmark.sampleCount >= 3
      ? `Best for ${params.taskType}: ${(best.benchmark.successRate * 100).toFixed(0)}% success, $${best.benchmark.avgCost.toFixed(4)}/call, ${best.benchmark.avgLatency.toFixed(0)}ms avg`
      : 'Selected based on availability (insufficient benchmark data)';

    return {
      modelId: best.modelId,
      provider: best.provider,
      reason,
      score: best.score,
      fallback: fallback ? { modelId: fallback.modelId, provider: fallback.provider } : undefined,
    };
  }

  /** Get benchmark for a model + task type */
  getBenchmark(modelId: string, taskType: string): ModelBenchmark | undefined {
    return this.benchmarks.find(b => b.modelId === modelId && b.taskType === taskType);
  }

  /** Get recent average latency for a model */
  getRecentLatency(modelId: string): number | undefined {
    const recent = this.latencyRecords
      .filter(r => r.modelId === modelId && r.timestamp > Date.now() - 3600000); // Last hour
    if (recent.length === 0) return undefined;
    return recent.reduce((s, r) => s + r.latency, 0) / recent.length;
  }

  /** Get all benchmarks sorted by quality */
  getAllBenchmarks(): ModelBenchmark[] {
    return [...this.benchmarks].sort((a, b) => b.avgQuality - a.avgQuality);
  }

  /** Get model rankings per task type */
  getRankings(): Record<string, Array<{ modelId: string; score: number; samples: number }>> {
    const taskTypes = [...new Set(this.benchmarks.map(b => b.taskType))];
    const rankings: Record<string, Array<{ modelId: string; score: number; samples: number }>> = {};

    for (const taskType of taskTypes) {
      rankings[taskType] = this.benchmarks
        .filter(b => b.taskType === taskType)
        .map(b => ({
          modelId: b.modelId,
          score: b.successRate * 0.5 + b.avgQuality * 0.3 + (1 - Math.min(b.avgCost, 0.1) / 0.1) * 0.2,
          samples: b.sampleCount,
        }))
        .sort((a, b) => b.score - a.score);
    }

    return rankings;
  }

  /** Get latency stats per provider */
  getLatencyStats(): Record<string, { avg: number; p95: number; samples: number }> {
    const grouped = new Map<string, number[]>();
    for (const r of this.latencyRecords) {
      const arr = grouped.get(r.provider) ?? [];
      arr.push(r.latency);
      grouped.set(r.provider, arr);
    }

    const stats: Record<string, { avg: number; p95: number; samples: number }> = {};
    for (const [provider, latencies] of grouped) {
      const sorted = latencies.sort((a, b) => a - b);
      stats[provider] = {
        avg: sorted.reduce((s, l) => s + l, 0) / sorted.length,
        p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        samples: sorted.length,
      };
    }

    return stats;
  }

  /** Get status summary */
  getStatus(): {
    totalBenchmarks: number;
    taskTypesCovered: number;
    modelsCovered: number;
    latencyRecords: number;
  } {
    return {
      totalBenchmarks: this.benchmarks.length,
      taskTypesCovered: new Set(this.benchmarks.map(b => b.taskType)).size,
      modelsCovered: new Set(this.benchmarks.map(b => b.modelId)).size,
      latencyRecords: this.latencyRecords.length,
    };
  }
}
