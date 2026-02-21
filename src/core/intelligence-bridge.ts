/**
 * Intelligence Bridge — Central Nervous System
 *
 * Connects ALL 9 intelligence subsystems to the live execution pipeline.
 * This is the ONLY file other modules need to import to feed data into
 * the intelligence layer. No subsystem is theoretical anymore.
 */

import type { EvolutionEngine } from './evolution-engine.js';
import type { IntelligenceScorer } from './intelligence-scorer.js';
import type { MemoryHierarchy } from './memory-hierarchy.js';
import type { GovernanceEngine } from './governance-engine.js';
import type { CostIntelligence } from './cost-intelligence.js';
import type { AdaptiveModelRouter } from './adaptive-model-router.js';
import type { ObservabilityLayer } from './observability.js';
import type { AutonomousGoalEngine } from './autonomous-goals.js';
import type { SafetySimulator } from './safety-simulator.js';
import type { FeedbackLoop } from './feedback-loop.js';
import { recordCostForPanic, recordFailureForPanic } from './kill-switch.js';
import logger from '../utils/logger.js';

/** Result of a pre-execution safety check */
export interface SafetyCheckResult {
  approved: boolean;
  riskCategory: string;
  riskScore: number;
  reason: string;
  requiresSnapshot: boolean;
}

/** Subsystem references — set once at startup */
let scorer: IntelligenceScorer | null = null;
let memory: MemoryHierarchy | null = null;
let governance: GovernanceEngine | null = null;
let costIntel: CostIntelligence | null = null;
let modelRouter: AdaptiveModelRouter | null = null;
let observability: ObservabilityLayer | null = null;
let goalEngine: AutonomousGoalEngine | null = null;
let safety: SafetySimulator | null = null;
let feedback: FeedbackLoop | null = null;

/** Initialize the bridge with all subsystem references from EvolutionEngine */
export function initBridge(evolution: EvolutionEngine): void {
  scorer = evolution.getScorer();
  memory = evolution.getMemoryHierarchy();
  governance = evolution.getGovernance();
  costIntel = evolution.getCostIntelligence();
  modelRouter = evolution.getAdaptiveRouter();
  observability = evolution.getObservability();
  goalEngine = evolution.getAutonomousGoals();
  safety = evolution.getSafetySimulator();
  feedback = evolution.getFeedbackLoop();
  logger.info('Intelligence bridge initialized — all 9 subsystems connected');
}

// ─── TOOL EXECUTION HOOKS ─────────────────────────────────────────────

/**
 * Called AFTER every tool execution in tool-executor.ts.
 * Feeds data into: IntelligenceScorer, ObservabilityLayer, CostIntelligence.
 */
export function onToolExecuted(params: {
  toolId: string;
  agentId: string;
  success: boolean;
  latency: number;
  cost: number;
  risk: 'low' | 'medium' | 'high' | 'critical';
  intent: string;
  inputTokens?: number;
  outputTokens?: number;
  workflowType?: string;
}): void {
  try {
    // 1. Intelligence Scorer — track tool performance
    scorer?.logToolExecution({
      toolId: params.toolId,
      agentId: params.agentId,
      success: params.success,
      latency: params.latency,
      cost: params.cost,
      risk: params.risk,
      contextHash: params.intent,
      timestamp: Date.now(),
    });

    // 2. Observability — tool usage heatmap + timeline
    observability?.recordToolCall(
      params.toolId,
      params.agentId,
      params.success,
      params.latency,
    );

    // 3. Cost Intelligence — per-workflow cost tracking + kill-switch wiring
    if (params.cost > 0 || params.inputTokens) {
      costIntel?.logCost({
        workflowType: params.workflowType ?? params.intent,
        agentId: params.agentId,
        toolsUsed: [params.toolId],
        inputTokens: params.inputTokens ?? 0,
        outputTokens: params.outputTokens ?? 0,
        costUsd: params.cost,
        duration: params.latency,
        success: params.success,
        timestamp: Date.now(),
      });

      // Feed cost to kill-switch auto-panic (triggers if cost > 2x daily budget)
      if (params.cost > 0) {
        recordCostForPanic(params.cost);
      }
    }

    // 4. Memory — record failure for clustering + kill-switch wiring
    if (!params.success) {
      recordFailureForPanic(); // Feed failure to auto-panic (10+ failures/hour = panic)
      memory?.recordFailure(
        `tool_${params.toolId}_failure`,
        `Tool ${params.toolId} failed during ${params.intent}`,
      );
    }
  } catch (err: any) {
    logger.debug('Intelligence bridge: tool hook error', { error: err.message });
  }
}

// ─── COMMAND SAFETY GATE ──────────────────────────────────────────────

/**
 * Called BEFORE bash/ssh command execution.
 * Returns whether the command should proceed.
 */
export function checkCommandSafety(command: string, context?: {
  serverId?: string;
  osType?: string;
  runningServices?: string[];
  agentId?: string;
}): SafetyCheckResult {
  if (!safety || !governance) {
    return { approved: true, riskCategory: 'unknown', riskScore: 0, reason: 'Safety subsystems not initialized', requiresSnapshot: false };
  }

  try {
    const sim = safety.simulate(command, context);
    return {
      approved: sim.approved,
      riskCategory: sim.riskCategory,
      riskScore: sim.riskScore,
      reason: sim.reason,
      requiresSnapshot: sim.rollbackPlan?.requiresSnapshot ?? false,
    };
  } catch (err: any) {
    logger.debug('Intelligence bridge: safety check error', { error: err.message });
    return { approved: true, riskCategory: 'unknown', riskScore: 0, reason: 'Safety check failed — allowing by default', requiresSnapshot: false };
  }
}

// ─── MESSAGE PROCESSING HOOKS ─────────────────────────────────────────

/**
 * Called AFTER every message is processed in engine.ts.
 * Feeds data into: IntelligenceScorer (agent perf), MemoryHierarchy (experience),
 * FeedbackLoop (patterns), AdaptiveModelRouter (model benchmarks).
 */
export function onMessageProcessed(params: {
  agentId: string;
  intent: string;
  success: boolean;
  latency: number;
  cost: number;
  modelId?: string;
  provider?: string;
  toolsUsed: string[];
  inputTokens?: number;
  outputTokens?: number;
  userMessage: string;
  response: string;
  quality?: number;
}): void {
  try {
    // 1. Agent performance scoring
    scorer?.logAgentExecution({
      agentId: params.agentId,
      success: params.success,
      latency: params.latency,
      cost: params.cost,
      taskType: params.intent,
      timestamp: Date.now(),
    });

    // 2. Experience recording for replay
    memory?.recordExperience({
      taskType: params.intent,
      input: params.userMessage.slice(0, 500),
      output: params.response.slice(0, 500),
      success: params.success,
      agentUsed: params.agentId,
      toolsUsed: params.toolsUsed,
      duration: params.latency,
      timestamp: Date.now(),
    });

    // 3. Pattern recognition — record recurring workflows
    feedback?.recordPattern(
      `${params.intent}:${params.agentId}`,
      'workflow',
      { input: params.userMessage.slice(0, 200), output: params.response.slice(0, 200) },
    );

    // 4. Model benchmarking
    if (params.modelId && params.provider) {
      modelRouter?.recordExecution({
        modelId: params.modelId,
        provider: params.provider,
        taskType: params.intent,
        success: params.success,
        latency: params.latency,
        cost: params.cost,
        quality: params.quality,
      });
    }

    // 5. Observability timeline event
    observability?.recordEvent('agent_end', `${params.agentId}: ${params.intent}`, {
      agentId: params.agentId,
      duration: params.latency,
      metadata: {
        success: params.success,
        tools: params.toolsUsed.length,
        cost: params.cost,
      },
    });

    // 6. Error recording
    if (!params.success) {
      observability?.recordError(
        `agent_failure`,
        `Agent ${params.agentId} failed on ${params.intent}`,
        { agentId: params.agentId },
      );
    }
  } catch (err: any) {
    logger.debug('Intelligence bridge: message hook error', { error: err.message });
  }
}

// ─── ERROR HOOKS ──────────────────────────────────────────────────────

/**
 * Called when an error occurs during processing.
 * Feeds into memory (failure clustering) + observability (error tracking).
 */
export function onError(errorType: string, message: string, context?: {
  agentId?: string;
  toolId?: string;
}): void {
  try {
    memory?.recordFailure(errorType, message);
    observability?.recordError(errorType, message, context);
  } catch {
    // Silent — never let intelligence tracking cause failures
  }
}

// ─── PERIODIC INTELLIGENCE (called from heartbeat) ────────────────────

/**
 * Run periodic intelligence tasks. Call every 5 minutes from heartbeat.
 * Takes system snapshot, checks goals, processes patterns.
 */
export function runPeriodicIntelligence(systemData: {
  activeAgents: number;
  dynamicAgents: number;
  totalSkills: number;
  evolutionPhase: string;
  costToday: number;
  successRate: number;
  avgLatency: number;
  errorRate: number;
}): {
  snapshotTaken: boolean;
  triggersTriggered: number;
  patternsReady: number;
  tasksGenerated: number;
} {
  const result = { snapshotTaken: false, triggersTriggered: 0, patternsReady: 0, tasksGenerated: 0 };

  try {
    // 1. System snapshot for dashboard
    observability?.takeSnapshot({
      activeAgents: systemData.activeAgents,
      dynamicAgents: systemData.dynamicAgents,
      totalSkills: systemData.totalSkills,
      evolutionPhase: systemData.evolutionPhase,
      costToday: systemData.costToday,
    });
    result.snapshotTaken = true;

    // 2. Check goal triggers
    const triggers = goalEngine?.checkTriggers({
      success_rate: systemData.successRate,
      avg_latency: systemData.avgLatency,
      cost_today: systemData.costToday,
      error_rate: systemData.errorRate,
      skill_count: systemData.totalSkills,
      agent_count: systemData.activeAgents,
    });
    result.triggersTriggered = triggers?.length ?? 0;

    // 3. Generate self-initiated tasks from goal gaps
    const tasks = goalEngine?.generateTasks({
      successRate: systemData.successRate,
      avgLatency: systemData.avgLatency,
      costToday: systemData.costToday,
      errorRate: systemData.errorRate,
      skillCount: systemData.totalSkills,
      agentCount: systemData.activeAgents,
    });
    result.tasksGenerated = tasks?.length ?? 0;

    // 4. Check for pattern promotion candidates
    const candidates = feedback?.getPromotionCandidates();
    result.patternsReady = candidates?.length ?? 0;

    if (result.triggersTriggered > 0 || result.tasksGenerated > 0 || result.patternsReady > 0) {
      logger.info('Periodic intelligence cycle', result);
    }
  } catch (err: any) {
    logger.debug('Intelligence bridge: periodic error', { error: err.message });
  }

  return result;
}

// ─── GOVERNANCE HOOKS ─────────────────────────────────────────────────

/**
 * Request approval from governance before high-risk operations.
 * Returns whether the operation should proceed.
 */
export function requestGovernanceApproval(params: {
  agentId: string;
  action: string;
  estimatedCost: number;
  riskLevel: 'safe' | 'change' | 'critical' | 'destructive';
}): { approved: boolean; reason: string } {
  if (!governance) return { approved: true, reason: 'Governance not initialized' };

  try {
    return governance.requestApproval(params.agentId, params.action, params.estimatedCost);
  } catch (err: any) {
    logger.debug('Intelligence bridge: governance error', { error: err.message });
    return { approved: true, reason: 'Governance check failed — allowing by default' };
  }
}

// ─── CONTEXT ENRICHMENT ───────────────────────────────────────────────

/**
 * Get intelligence context to inject into system prompts.
 * Provides the AI with awareness of system health, patterns, and goals.
 */
export function getIntelligenceContext(): {
  healthIndex: number;
  governanceBudget: string;
  activeGoals: number;
  pendingSelfTasks: number;
  topPatterns: string[];
  disabledAgents: string[];
  costToday: number;
  anomalyCount: number;
} {
  const health = observability?.getHealthIndicators();
  const goalSummary = goalEngine?.getSummary();
  const feedbackReport = feedback?.getReport();
  const disabled = scorer?.getDisabled();
  const costReport = costIntel?.getReport();
  const budgetStatus = governance?.getRiskBudgetStatus();

  return {
    healthIndex: health?.overallScore ?? 100,
    governanceBudget: budgetStatus
      ? `$${budgetStatus.spentToday.toFixed(2)}/$${budgetStatus.dailyBudgetUsd.toFixed(2)}`
      : '$0.00/$10.00',
    activeGoals: goalSummary?.activeGoals ?? 0,
    pendingSelfTasks: goalSummary?.pendingTasks ?? 0,
    topPatterns: feedbackReport?.topPatterns.slice(0, 3).map(p => p.description) ?? [],
    disabledAgents: disabled?.agents ?? [],
    costToday: costReport?.totalCost ?? 0,
    anomalyCount: costReport?.anomalies.length ?? 0,
  };
}

// ─── DASHBOARD DATA ───────────────────────────────────────────────────

/**
 * Get full intelligence dashboard data for the web UI.
 */
export function getDashboardData(): Record<string, unknown> {
  return {
    health: observability?.getHealthIndicators() ?? {},
    dashboard: observability?.getDashboard() ?? {},
    scorerReport: scorer?.getReport() ?? {},
    memoryStatus: memory?.getStatus() ?? {},
    governanceBudget: governance?.getRiskBudgetStatus() ?? {},
    costReport: costIntel?.getReport() ?? {},
    modelRankings: modelRouter?.getRankings() ?? {},
    latencyStats: modelRouter?.getLatencyStats() ?? {},
    goalSummary: goalEngine?.getSummary() ?? {},
    pendingGoalTasks: goalEngine?.getPendingTasks() ?? [],
    safetyStats: safety?.getStats() ?? {},
    feedbackReport: feedback?.getReport() ?? {},
    successPatterns: memory?.getSuccessPatterns() ?? [],
    failureClusters: memory?.getFailureClusters() ?? [],
  };
}

/** Check if the bridge is initialized */
export function isBridgeReady(): boolean {
  return scorer !== null && observability !== null;
}
