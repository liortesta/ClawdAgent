// Observability Layer — dashboard data, heatmaps, error clusters, timeline

/** Timeline event types */
type EventType = 'agent_start' | 'agent_end' | 'tool_call' | 'tool_result' |
  'evolution_cycle' | 'error' | 'self_heal' | 'crew_start' | 'crew_end' |
  'skill_fetched' | 'agent_created' | 'governance_block' | 'anomaly';

/** Timeline event */
interface TimelineEvent {
  id: string;
  type: EventType;
  timestamp: number;
  agentId?: string;
  toolId?: string;
  crewId?: string;
  message: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

/** Tool heatmap data */
interface ToolHeatmapEntry {
  toolId: string;
  hour: number;   // 0-23
  count: number;
  successRate: number;
  avgLatency: number;
}

/** Error cluster */
interface ErrorCluster {
  errorType: string;
  count: number;
  lastSeen: number;
  agents: string[];
  tools: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/** System snapshot for dashboard */
interface SystemSnapshot {
  timestamp: number;
  activeAgents: number;
  dynamicAgents: number;
  totalSkills: number;
  evolutionPhase: string;
  memoryUsageMb: number;
  uptimeHours: number;
  requestsLastHour: number;
  errorsLastHour: number;
  avgLatencyMs: number;
  costToday: number;
}

const MAX_TIMELINE_EVENTS = 2000;
const MAX_SNAPSHOTS = 288; // 24h of 5-minute snapshots

export class ObservabilityLayer {
  private timeline: TimelineEvent[] = [];
  private snapshots: SystemSnapshot[] = [];
  private toolCalls: Array<{
    toolId: string;
    timestamp: number;
    success: boolean;
    latency: number;
    agentId: string;
  }> = [];
  private errors: Array<{
    errorType: string;
    message: string;
    agentId?: string;
    toolId?: string;
    timestamp: number;
  }> = [];
  private startTime = Date.now();
  private idCounter = 0;

  /** Record a timeline event */
  recordEvent(type: EventType, message: string, opts?: {
    agentId?: string;
    toolId?: string;
    crewId?: string;
    duration?: number;
    metadata?: Record<string, unknown>;
  }): string {
    const id = `evt_${++this.idCounter}`;
    this.timeline.push({
      id, type, timestamp: Date.now(), message,
      agentId: opts?.agentId, toolId: opts?.toolId, crewId: opts?.crewId,
      duration: opts?.duration, metadata: opts?.metadata,
    });
    if (this.timeline.length > MAX_TIMELINE_EVENTS) this.timeline.shift();
    return id;
  }

  /** Record a tool call for heatmap tracking */
  recordToolCall(toolId: string, agentId: string, success: boolean, latency: number): void {
    this.toolCalls.push({ toolId, agentId, success, latency, timestamp: Date.now() });
    if (this.toolCalls.length > 5000) this.toolCalls.shift();

    this.recordEvent(
      success ? 'tool_result' : 'error',
      `${toolId}: ${success ? 'success' : 'failed'} (${latency}ms)`,
      { toolId, agentId, duration: latency },
    );
  }

  /** Record an error */
  recordError(errorType: string, message: string, opts?: { agentId?: string; toolId?: string }): void {
    this.errors.push({ errorType, message, ...opts, timestamp: Date.now() });
    if (this.errors.length > 1000) this.errors.shift();

    this.recordEvent('error', `${errorType}: ${message}`, opts);
  }

  /** Take a system snapshot (call periodically, e.g. every 5 minutes) */
  takeSnapshot(data: {
    activeAgents: number;
    dynamicAgents: number;
    totalSkills: number;
    evolutionPhase: string;
    costToday: number;
  }): void {
    const now = Date.now();
    const lastHour = now - 3600000;
    const mem = process.memoryUsage();

    this.snapshots.push({
      timestamp: now,
      activeAgents: data.activeAgents,
      dynamicAgents: data.dynamicAgents,
      totalSkills: data.totalSkills,
      evolutionPhase: data.evolutionPhase,
      memoryUsageMb: Math.round(mem.heapUsed / 1024 / 1024),
      uptimeHours: (now - this.startTime) / 3600000,
      requestsLastHour: this.toolCalls.filter(t => t.timestamp > lastHour).length,
      errorsLastHour: this.errors.filter(e => e.timestamp > lastHour).length,
      avgLatencyMs: this.getAvgLatency(lastHour),
      costToday: data.costToday,
    });

    if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.shift();
  }

  /** Get tool usage heatmap (24h, by hour) */
  getToolHeatmap(): ToolHeatmapEntry[] {
    const now = Date.now();
    const last24h = this.toolCalls.filter(t => t.timestamp > now - 86400000);
    const heatmap = new Map<string, ToolHeatmapEntry>();

    for (const call of last24h) {
      const hour = new Date(call.timestamp).getHours();
      const key = `${call.toolId}_${hour}`;
      const existing = heatmap.get(key);

      if (existing) {
        existing.count++;
        existing.successRate = (existing.successRate * (existing.count - 1) + (call.success ? 1 : 0)) / existing.count;
        existing.avgLatency = (existing.avgLatency * (existing.count - 1) + call.latency) / existing.count;
      } else {
        heatmap.set(key, {
          toolId: call.toolId, hour,
          count: 1,
          successRate: call.success ? 1 : 0,
          avgLatency: call.latency,
        });
      }
    }

    return Array.from(heatmap.values()).sort((a, b) => b.count - a.count);
  }

  /** Get error clusters */
  getErrorClusters(): ErrorCluster[] {
    const clusters = new Map<string, {
      count: number; lastSeen: number;
      agents: Set<string>; tools: Set<string>;
    }>();

    for (const err of this.errors) {
      const existing = clusters.get(err.errorType);
      if (existing) {
        existing.count++;
        existing.lastSeen = Math.max(existing.lastSeen, err.timestamp);
        if (err.agentId) existing.agents.add(err.agentId);
        if (err.toolId) existing.tools.add(err.toolId);
      } else {
        clusters.set(err.errorType, {
          count: 1, lastSeen: err.timestamp,
          agents: new Set(err.agentId ? [err.agentId] : []),
          tools: new Set(err.toolId ? [err.toolId] : []),
        });
      }
    }

    return Array.from(clusters.entries()).map(([errorType, data]) => ({
      errorType,
      count: data.count,
      lastSeen: data.lastSeen,
      agents: Array.from(data.agents),
      tools: Array.from(data.tools),
      severity: data.count > 20 ? 'critical' as const :
                data.count > 10 ? 'high' as const :
                data.count > 3 ? 'medium' as const : 'low' as const,
    })).sort((a, b) => b.count - a.count);
  }

  /** Get evolution timeline (last N events) */
  getTimeline(limit = 50, filter?: EventType): TimelineEvent[] {
    let events = this.timeline;
    if (filter) events = events.filter(e => e.type === filter);
    return events.slice(-limit);
  }

  /** Get recent snapshots for dashboard graphs */
  getSnapshots(limit = 24): SystemSnapshot[] {
    return this.snapshots.slice(-limit);
  }

  /** Get current system health indicators */
  getHealthIndicators(): {
    agentStability: number;      // 0-100
    failureRate: number;         // 0-100 (lower = better)
    costDrift: number;           // % change from baseline
    latencyAnomaly: boolean;
    securityRiskLevel: 'low' | 'medium' | 'high';
    overallScore: number;        // 0-100 System Intelligence Index
  } {
    const now = Date.now();
    const lastHour = now - 3600000;
    const last24h = now - 86400000;

    // Agent stability: success rate of tool calls
    const recentCalls = this.toolCalls.filter(t => t.timestamp > last24h);
    const agentStability = recentCalls.length > 0
      ? Math.round((recentCalls.filter(c => c.success).length / recentCalls.length) * 100)
      : 100;

    // Failure rate: errors per hour
    const errorsPerHour = this.errors.filter(e => e.timestamp > lastHour).length;
    const failureRate = Math.min(100, errorsPerHour * 5); // Scale: 20 errors/hr = 100%

    // Cost drift: compare today vs 7-day avg
    const todaySnapshots = this.snapshots.filter(s => s.timestamp > now - 86400000);
    const weekSnapshots = this.snapshots.filter(s => s.timestamp > now - 7 * 86400000);
    const todayAvgCost = todaySnapshots.length > 0
      ? todaySnapshots.reduce((s, snap) => s + snap.costToday, 0) / todaySnapshots.length
      : 0;
    const weekAvgCost = weekSnapshots.length > 0
      ? weekSnapshots.reduce((s, snap) => s + snap.costToday, 0) / weekSnapshots.length
      : todayAvgCost;
    const costDrift = weekAvgCost > 0 ? ((todayAvgCost - weekAvgCost) / weekAvgCost) * 100 : 0;

    // Latency anomaly
    const recentLatency = this.getAvgLatency(lastHour);
    const baselineLatency = this.getAvgLatency(last24h);
    const latencyAnomaly = baselineLatency > 0 && recentLatency > baselineLatency * 2;

    // Security risk level
    const criticalErrors = this.errors.filter(
      e => e.timestamp > lastHour && (
        e.errorType.includes('auth') || e.errorType.includes('permission') ||
        e.errorType.includes('security') || e.errorType.includes('injection')
      ),
    ).length;
    const securityRiskLevel = criticalErrors > 5 ? 'high' as const :
                              criticalErrors > 0 ? 'medium' as const : 'low' as const;

    // Overall System Intelligence Index
    const overallScore = Math.round(
      agentStability * 0.30 +
      (100 - failureRate) * 0.25 +
      (100 - Math.min(Math.abs(costDrift), 100)) * 0.15 +
      (latencyAnomaly ? 0 : 100) * 0.15 +
      (securityRiskLevel === 'low' ? 100 : securityRiskLevel === 'medium' ? 50 : 0) * 0.15,
    );

    return { agentStability, failureRate, costDrift, latencyAnomaly, securityRiskLevel, overallScore };
  }

  /** Get dashboard data (full summary for UI) */
  getDashboard(): {
    health: ReturnType<ObservabilityLayer['getHealthIndicators']>;
    recentTimeline: TimelineEvent[];
    errorClusters: ErrorCluster[];
    toolHeatmap: ToolHeatmapEntry[];
    snapshots: SystemSnapshot[];
  } {
    return {
      health: this.getHealthIndicators(),
      recentTimeline: this.getTimeline(20),
      errorClusters: this.getErrorClusters(),
      toolHeatmap: this.getToolHeatmap(),
      snapshots: this.getSnapshots(12),
    };
  }

  private getAvgLatency(since: number): number {
    const recent = this.toolCalls.filter(t => t.timestamp > since);
    if (recent.length === 0) return 0;
    return recent.reduce((s, t) => s + t.latency, 0) / recent.length;
  }
}
