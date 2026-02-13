import logger from '../utils/logger.js';

/** Tool execution record for performance tracking */
interface ToolExecRecord {
  toolId: string;
  agentId: string;
  success: boolean;
  latency: number;       // ms
  cost: number;           // USD
  risk: 'low' | 'medium' | 'high' | 'critical';
  errorType?: string;
  contextHash: string;
  timestamp: number;
}

/** Agent performance record */
interface AgentPerfRecord {
  agentId: string;
  success: boolean;
  latency: number;
  cost: number;
  taskType: string;
  timestamp: number;
}

/** Performance stats with decay */
interface PerformanceStats {
  totalCalls: number;
  successRate: number;
  avgLatency: number;
  avgCost: number;
  recentTrend: 'improving' | 'stable' | 'degrading';
  lastUsed: number;
  enabled: boolean;
}

/** Tool scoring weights */
const TOOL_SCORE_WEIGHTS = {
  intentMatch: 0.30,
  historicalSuccess: 0.20,
  costEfficiency: 0.15,
  riskAlignment: 0.15,
  latencyScore: 0.10,
  contextMatch: 0.10,
};

const MAX_RECORDS = 1000;
const DECAY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const AUTO_DISABLE_THRESHOLD = 0.3; // Disable if success rate < 30%
const AUTO_DISABLE_MIN_CALLS = 10;   // Need at least 10 calls before auto-disable

export class IntelligenceScorer {
  private toolRecords: ToolExecRecord[] = [];
  private agentRecords: AgentPerfRecord[] = [];
  private disabledTools = new Set<string>();
  private disabledAgents = new Set<string>();

  /** Log a tool execution */
  logToolExecution(record: ToolExecRecord): void {
    this.toolRecords.push(record);
    if (this.toolRecords.length > MAX_RECORDS) this.toolRecords.shift();

    // Check auto-disable
    const stats = this.getToolStats(record.toolId);
    if (stats.totalCalls >= AUTO_DISABLE_MIN_CALLS && stats.successRate < AUTO_DISABLE_THRESHOLD) {
      this.disabledTools.add(record.toolId);
      logger.warn('Tool auto-disabled due to low performance', {
        toolId: record.toolId, successRate: stats.successRate, calls: stats.totalCalls,
      });
    }
  }

  /** Log an agent execution */
  logAgentExecution(record: AgentPerfRecord): void {
    this.agentRecords.push(record);
    if (this.agentRecords.length > MAX_RECORDS) this.agentRecords.shift();

    // Check auto-disable
    const stats = this.getAgentStats(record.agentId);
    if (stats.totalCalls >= AUTO_DISABLE_MIN_CALLS && stats.successRate < AUTO_DISABLE_THRESHOLD) {
      this.disabledAgents.add(record.agentId);
      logger.warn('Agent auto-disabled due to low performance', {
        agentId: record.agentId, successRate: stats.successRate, calls: stats.totalCalls,
      });
    }
  }

  /** Score a tool for a specific task context */
  scoreTool(toolId: string, context: {
    intent: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    latencyBudgetMs: number;
    costBudgetUsd: number;
  }): number {
    if (this.disabledTools.has(toolId)) return 0;

    const stats = this.getToolStats(toolId);
    if (stats.totalCalls === 0) return 0.5; // Unknown tool → neutral score

    // Intent match: based on historical success in similar contexts
    const intentMatch = this.getIntentMatchScore(toolId, context.intent);

    // Historical success with time decay
    const historicalSuccess = stats.successRate;

    // Cost efficiency: lower cost → higher score
    const costEfficiency = stats.avgCost > 0
      ? Math.min(1, context.costBudgetUsd / stats.avgCost)
      : 1;

    // Risk alignment: prefer low-risk tools for low-risk tasks
    const riskAlignment = this.getRiskAlignment(toolId, context.riskLevel);

    // Latency score: faster → higher score
    const latencyScore = stats.avgLatency > 0
      ? Math.min(1, context.latencyBudgetMs / stats.avgLatency)
      : 1;

    // Context match: how well the tool's history matches current context
    const contextMatch = intentMatch * 0.5 + historicalSuccess * 0.5;

    const score =
      intentMatch * TOOL_SCORE_WEIGHTS.intentMatch +
      historicalSuccess * TOOL_SCORE_WEIGHTS.historicalSuccess +
      costEfficiency * TOOL_SCORE_WEIGHTS.costEfficiency +
      riskAlignment * TOOL_SCORE_WEIGHTS.riskAlignment +
      latencyScore * TOOL_SCORE_WEIGHTS.latencyScore +
      contextMatch * TOOL_SCORE_WEIGHTS.contextMatch;

    return Math.max(0, Math.min(1, score));
  }

  /** Rank tools for a given context, return top N */
  rankTools(toolIds: string[], context: {
    intent: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    latencyBudgetMs: number;
    costBudgetUsd: number;
  }, topN = 3): Array<{ toolId: string; score: number }> {
    const scored = toolIds
      .filter(id => !this.disabledTools.has(id))
      .map(toolId => ({ toolId, score: this.scoreTool(toolId, context) }))
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topN);
  }

  /** Get tool performance stats with time decay */
  getToolStats(toolId: string): PerformanceStats {
    const records = this.toolRecords.filter(r => r.toolId === toolId);
    return this.computeDecayedStats(records.map(r => ({
      success: r.success, latency: r.latency, cost: r.cost, timestamp: r.timestamp,
    })), this.disabledTools.has(toolId));
  }

  /** Get agent performance stats with time decay */
  getAgentStats(agentId: string): PerformanceStats {
    const records = this.agentRecords.filter(r => r.agentId === agentId);
    return this.computeDecayedStats(records.map(r => ({
      success: r.success, latency: r.latency, cost: r.cost, timestamp: r.timestamp,
    })), this.disabledAgents.has(agentId));
  }

  /** Re-enable a disabled tool/agent */
  reenable(id: string, type: 'tool' | 'agent'): void {
    if (type === 'tool') this.disabledTools.delete(id);
    else this.disabledAgents.delete(id);
    logger.info(`${type} re-enabled`, { id });
  }

  /** Get all disabled entities */
  getDisabled(): { tools: string[]; agents: string[] } {
    return {
      tools: Array.from(this.disabledTools),
      agents: Array.from(this.disabledAgents),
    };
  }

  /** Get a full performance report */
  getReport(): {
    toolStats: Record<string, PerformanceStats>;
    agentStats: Record<string, PerformanceStats>;
    disabled: { tools: string[]; agents: string[] };
    totalToolCalls: number;
    totalAgentCalls: number;
  } {
    const toolIds = [...new Set(this.toolRecords.map(r => r.toolId))];
    const agentIds = [...new Set(this.agentRecords.map(r => r.agentId))];

    const toolStats: Record<string, PerformanceStats> = {};
    for (const id of toolIds) toolStats[id] = this.getToolStats(id);

    const agentStats: Record<string, PerformanceStats> = {};
    for (const id of agentIds) agentStats[id] = this.getAgentStats(id);

    return {
      toolStats, agentStats,
      disabled: this.getDisabled(),
      totalToolCalls: this.toolRecords.length,
      totalAgentCalls: this.agentRecords.length,
    };
  }

  private computeDecayedStats(
    records: Array<{ success: boolean; latency: number; cost: number; timestamp: number }>,
    disabled: boolean,
  ): PerformanceStats {
    if (records.length === 0) {
      return { totalCalls: 0, successRate: 0, avgLatency: 0, avgCost: 0, recentTrend: 'stable', lastUsed: 0, enabled: !disabled };
    }

    const now = Date.now();
    let weightedSuccess = 0;
    let weightedLatency = 0;
    let weightedCost = 0;
    let totalWeight = 0;

    for (const r of records) {
      const age = now - r.timestamp;
      const weight = Math.pow(0.5, age / DECAY_HALF_LIFE_MS);
      weightedSuccess += (r.success ? 1 : 0) * weight;
      weightedLatency += r.latency * weight;
      weightedCost += r.cost * weight;
      totalWeight += weight;
    }

    // Trend: compare last 5 vs previous 5
    const recentFive = records.slice(-5);
    const prevFive = records.slice(-10, -5);
    const recentRate = recentFive.length > 0 ? recentFive.filter(r => r.success).length / recentFive.length : 0;
    const prevRate = prevFive.length > 0 ? prevFive.filter(r => r.success).length / prevFive.length : recentRate;
    const trend: 'improving' | 'stable' | 'degrading' =
      recentRate > prevRate + 0.1 ? 'improving' :
      recentRate < prevRate - 0.1 ? 'degrading' : 'stable';

    return {
      totalCalls: records.length,
      successRate: totalWeight > 0 ? weightedSuccess / totalWeight : 0,
      avgLatency: totalWeight > 0 ? weightedLatency / totalWeight : 0,
      avgCost: totalWeight > 0 ? weightedCost / totalWeight : 0,
      recentTrend: trend,
      lastUsed: records[records.length - 1]?.timestamp ?? 0,
      enabled: !disabled,
    };
  }

  private getIntentMatchScore(toolId: string, intent: string): number {
    const relevant = this.toolRecords.filter(r => r.toolId === toolId && r.contextHash.includes(intent));
    if (relevant.length === 0) return 0.5;
    return relevant.filter(r => r.success).length / relevant.length;
  }

  private getRiskAlignment(toolId: string, targetRisk: string): number {
    const records = this.toolRecords.filter(r => r.toolId === toolId);
    if (records.length === 0) return 0.5;
    const riskLevels = { low: 0, medium: 1, high: 2, critical: 3 };
    const targetLevel = riskLevels[targetRisk as keyof typeof riskLevels] ?? 1;
    const avgRisk = records.reduce((s, r) => s + (riskLevels[r.risk] ?? 1), 0) / records.length;
    // Lower distance = higher alignment
    return 1 - Math.abs(targetLevel - avgRisk) / 3;
  }
}
