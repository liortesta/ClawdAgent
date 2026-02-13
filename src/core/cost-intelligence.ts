import logger from '../utils/logger.js';

/** Cost record for a workflow/task */
interface CostRecord {
  id: string;
  workflowType: string;
  agentId: string;
  toolsUsed: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  duration: number;       // ms
  success: boolean;
  timestamp: number;
}

/** Agent ROI data */
interface AgentROI {
  agentId: string;
  totalCost: number;
  totalRevenue: number;    // Estimated value generated
  totalTasks: number;
  successfulTasks: number;
  roi: number;             // (revenue - cost) / cost
  avgCostPerTask: number;
  trend: 'profitable' | 'break_even' | 'loss';
}

/** Cost anomaly */
interface CostAnomaly {
  type: 'spike' | 'sustained_increase' | 'unusual_pattern';
  description: string;
  detectedAt: number;
  severity: 'low' | 'medium' | 'high';
  affectedEntity: string;   // agent or workflow ID
  expectedCost: number;
  actualCost: number;
}

/** Token burn forecast */
interface TokenForecast {
  dailyAvgTokens: number;
  dailyAvgCost: number;
  projectedMonthlyCost: number;
  projectedMonthlyTokens: number;
  budgetRunoutDate: string | null;  // ISO date when budget runs out, null if within budget
}

const MAX_RECORDS = 5000;
const ANOMALY_THRESHOLD = 2.0; // 2x standard deviation

export class CostIntelligence {
  private records: CostRecord[] = [];
  private anomalies: CostAnomaly[] = [];
  private revenueEstimates = new Map<string, number>(); // workflow → estimated revenue per execution
  private idCounter = 0;

  /** Log a cost record */
  logCost(record: Omit<CostRecord, 'id'>): void {
    this.records.push({ ...record, id: `cost_${++this.idCounter}` });
    if (this.records.length > MAX_RECORDS) this.records.shift();
    this.detectAnomalies(record);
  }

  /** Set estimated revenue per workflow type (for ROI calculation) */
  setWorkflowRevenue(workflowType: string, revenuePerExecution: number): void {
    this.revenueEstimates.set(workflowType, revenuePerExecution);
  }

  /** Get cost per workflow type */
  getCostPerWorkflow(): Array<{
    workflowType: string;
    totalCost: number;
    avgCost: number;
    count: number;
    successRate: number;
  }> {
    const grouped = new Map<string, CostRecord[]>();
    for (const r of this.records) {
      const arr = grouped.get(r.workflowType) ?? [];
      arr.push(r);
      grouped.set(r.workflowType, arr);
    }

    return Array.from(grouped.entries()).map(([workflowType, recs]) => ({
      workflowType,
      totalCost: recs.reduce((s, r) => s + r.costUsd, 0),
      avgCost: recs.reduce((s, r) => s + r.costUsd, 0) / recs.length,
      count: recs.length,
      successRate: recs.filter(r => r.success).length / recs.length,
    })).sort((a, b) => b.totalCost - a.totalCost);
  }

  /** Get ROI per agent */
  getAgentROI(): AgentROI[] {
    const grouped = new Map<string, CostRecord[]>();
    for (const r of this.records) {
      const arr = grouped.get(r.agentId) ?? [];
      arr.push(r);
      grouped.set(r.agentId, arr);
    }

    return Array.from(grouped.entries()).map(([agentId, recs]) => {
      const totalCost = recs.reduce((s, r) => s + r.costUsd, 0);
      const totalRevenue = recs.reduce((s, r) => {
        return s + (this.revenueEstimates.get(r.workflowType) ?? 0);
      }, 0);
      const successfulTasks = recs.filter(r => r.success).length;
      const roi = totalCost > 0 ? (totalRevenue - totalCost) / totalCost : 0;

      return {
        agentId,
        totalCost,
        totalRevenue,
        totalTasks: recs.length,
        successfulTasks,
        roi,
        avgCostPerTask: totalCost / recs.length,
        trend: roi > 0.1 ? 'profitable' as const :
               roi > -0.1 ? 'break_even' as const : 'loss' as const,
      };
    }).sort((a, b) => b.roi - a.roi);
  }

  /** Detect cost anomalies */
  getAnomalies(): CostAnomaly[] {
    return this.anomalies.slice(-20);
  }

  /** Get token burn forecast */
  getForecast(monthlyBudgetUsd: number): TokenForecast {
    const now = Date.now();
    const last7Days = this.records.filter(r => r.timestamp > now - 7 * 86400000);

    if (last7Days.length === 0) {
      return {
        dailyAvgTokens: 0, dailyAvgCost: 0,
        projectedMonthlyCost: 0, projectedMonthlyTokens: 0,
        budgetRunoutDate: null,
      };
    }

    const daysSpan = Math.max(1, (now - last7Days[0].timestamp) / 86400000);
    const totalTokens = last7Days.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0);
    const totalCost = last7Days.reduce((s, r) => s + r.costUsd, 0);

    const dailyAvgTokens = totalTokens / daysSpan;
    const dailyAvgCost = totalCost / daysSpan;
    const projectedMonthlyCost = dailyAvgCost * 30;
    const projectedMonthlyTokens = dailyAvgTokens * 30;

    // Budget runout
    let budgetRunoutDate: string | null = null;
    if (dailyAvgCost > 0) {
      const monthSpentSoFar = this.records
        .filter(r => r.timestamp > now - (new Date().getDate() - 1) * 86400000)
        .reduce((s, r) => s + r.costUsd, 0);
      const remaining = monthlyBudgetUsd - monthSpentSoFar;
      if (remaining <= 0) {
        budgetRunoutDate = new Date().toISOString().split('T')[0];
      } else {
        const daysLeft = remaining / dailyAvgCost;
        const runout = new Date(now + daysLeft * 86400000);
        if (runout.getMonth() === new Date().getMonth()) {
          budgetRunoutDate = runout.toISOString().split('T')[0];
        }
      }
    }

    return { dailyAvgTokens, dailyAvgCost, projectedMonthlyCost, projectedMonthlyTokens, budgetRunoutDate };
  }

  /** Suggest model switch for cost optimization */
  suggestModelSwitch(): Array<{
    workflowType: string;
    currentAvgCost: number;
    suggestion: string;
    potentialSaving: number;
  }> {
    const suggestions: Array<{ workflowType: string; currentAvgCost: number; suggestion: string; potentialSaving: number }> = [];

    const perWorkflow = this.getCostPerWorkflow();
    for (const wf of perWorkflow) {
      // If simple workflows using expensive models, suggest cheaper
      if (wf.avgCost > 0.01 && wf.successRate > 0.9) {
        suggestions.push({
          workflowType: wf.workflowType,
          currentAvgCost: wf.avgCost,
          suggestion: 'High success rate — consider using a cheaper model',
          potentialSaving: wf.avgCost * 0.5 * wf.count,
        });
      }
      // If low success rate, suggest upgrading model
      if (wf.successRate < 0.5 && wf.count >= 5) {
        suggestions.push({
          workflowType: wf.workflowType,
          currentAvgCost: wf.avgCost,
          suggestion: 'Low success rate — consider upgrading to a more capable model',
          potentialSaving: -wf.avgCost * 0.5 * wf.count, // Negative = will cost more
        });
      }
    }

    return suggestions.sort((a, b) => b.potentialSaving - a.potentialSaving);
  }

  /** Get full report */
  getReport(): {
    totalCost: number;
    totalRecords: number;
    costPerWorkflow: ReturnType<CostIntelligence['getCostPerWorkflow']>;
    agentROI: AgentROI[];
    anomalies: CostAnomaly[];
    forecast: TokenForecast;
    suggestions: ReturnType<CostIntelligence['suggestModelSwitch']>;
  } {
    return {
      totalCost: this.records.reduce((s, r) => s + r.costUsd, 0),
      totalRecords: this.records.length,
      costPerWorkflow: this.getCostPerWorkflow(),
      agentROI: this.getAgentROI(),
      anomalies: this.getAnomalies(),
      forecast: this.getForecast(60), // $60/month default
      suggestions: this.suggestModelSwitch(),
    };
  }

  private detectAnomalies(record: Omit<CostRecord, 'id'>): void {
    // Get historical average for this workflow
    const similar = this.records.filter(r =>
      r.workflowType === record.workflowType && r.timestamp > Date.now() - 7 * 86400000,
    );

    if (similar.length < 5) return; // Not enough data

    const avgCost = similar.reduce((s, r) => s + r.costUsd, 0) / similar.length;
    const stdDev = Math.sqrt(
      similar.reduce((s, r) => s + Math.pow(r.costUsd - avgCost, 2), 0) / similar.length,
    );

    // Spike detection
    if (record.costUsd > avgCost + ANOMALY_THRESHOLD * stdDev && stdDev > 0) {
      const anomaly: CostAnomaly = {
        type: 'spike',
        description: `Cost spike in ${record.workflowType}: $${record.costUsd.toFixed(4)} vs avg $${avgCost.toFixed(4)}`,
        detectedAt: Date.now(),
        severity: record.costUsd > avgCost * 5 ? 'high' : record.costUsd > avgCost * 3 ? 'medium' : 'low',
        affectedEntity: record.workflowType,
        expectedCost: avgCost,
        actualCost: record.costUsd,
      };

      this.anomalies.push(anomaly);
      if (this.anomalies.length > 100) this.anomalies.shift();

      logger.warn('Cost anomaly detected', {
        type: anomaly.type, severity: anomaly.severity,
        workflow: record.workflowType, expected: avgCost, actual: record.costUsd,
      });
    }
  }
}
