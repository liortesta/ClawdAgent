import logger from '../utils/logger.js';

/** Strategic goal with timeline */
interface StrategicGoal {
  id: string;
  title: string;
  description: string;
  category: 'growth' | 'efficiency' | 'security' | 'quality' | 'cost';
  horizon: '30d' | '60d' | '90d';
  kpis: KPI[];
  status: 'active' | 'completed' | 'stalled' | 'cancelled';
  progress: number;        // 0-100
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  milestones: Milestone[];
  selfInitiatedTasks: SelfTask[];
}

/** Key Performance Indicator */
interface KPI {
  name: string;
  metric: string;        // e.g. "success_rate", "cost_per_task", "response_time"
  target: number;
  current: number;
  unit: string;           // e.g. "%", "$", "ms"
  direction: 'higher_is_better' | 'lower_is_better';
}

/** Goal milestone */
interface Milestone {
  title: string;
  targetDate: number;
  completed: boolean;
  completedAt?: number;
}

/** Self-initiated task */
interface SelfTask {
  id: string;
  goalId: string;
  description: string;
  action: string;          // What to do: 'optimize', 'monitor', 'create_agent', 'fetch_skill'
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  createdAt: number;
  executedAt?: number;
}

/** Market/system monitoring trigger */
interface MonitoringTrigger {
  id: string;
  name: string;
  condition: string;       // Description of what to watch
  metric: string;          // System metric to check
  threshold: number;
  direction: 'above' | 'below';
  action: string;          // What to do when triggered
  enabled: boolean;
  lastChecked: number;
  lastTriggered?: number;
}

const MAX_GOALS = 20;
const MAX_SELF_TASKS = 100;

export class AutonomousGoalEngine {
  private goals: StrategicGoal[] = [];
  private triggers: MonitoringTrigger[] = [];
  private idCounter = 0;

  /** Create a new strategic goal */
  createGoal(params: {
    title: string;
    description: string;
    category: StrategicGoal['category'];
    horizon: StrategicGoal['horizon'];
    kpis: Omit<KPI, 'current'>[];
    milestones?: Array<{ title: string; daysFromNow: number }>;
  }): StrategicGoal {
    const now = Date.now();
    const goal: StrategicGoal = {
      id: `goal_${++this.idCounter}`,
      title: params.title,
      description: params.description,
      category: params.category,
      horizon: params.horizon,
      kpis: params.kpis.map(k => ({ ...k, current: 0 })),
      status: 'active',
      progress: 0,
      createdAt: now,
      updatedAt: now,
      milestones: (params.milestones ?? []).map(m => ({
        title: m.title,
        targetDate: now + m.daysFromNow * 86400000,
        completed: false,
      })),
      selfInitiatedTasks: [],
    };

    this.goals.push(goal);
    if (this.goals.length > MAX_GOALS) {
      // Remove oldest completed goal
      const idx = this.goals.findIndex(g => g.status === 'completed');
      if (idx >= 0) this.goals.splice(idx, 1);
      else this.goals.shift();
    }

    logger.info('Strategic goal created', { id: goal.id, title: goal.title, horizon: goal.horizon });
    return goal;
  }

  /** Update KPI values */
  updateKPI(goalId: string, kpiName: string, currentValue: number): void {
    const goal = this.goals.find(g => g.id === goalId);
    if (!goal) return;

    const kpi = goal.kpis.find(k => k.name === kpiName);
    if (!kpi) return;

    kpi.current = currentValue;
    goal.updatedAt = Date.now();

    // Recalculate progress
    goal.progress = this.calculateProgress(goal);

    // Check completion
    if (goal.progress >= 100 && goal.status === 'active') {
      goal.status = 'completed';
      goal.completedAt = Date.now();
      logger.info('Strategic goal completed', { id: goal.id, title: goal.title });
    }
  }

  /** Generate self-initiated tasks based on goals and current system state */
  generateTasks(systemMetrics: {
    successRate: number;
    avgLatency: number;
    costToday: number;
    errorRate: number;
    skillCount: number;
    agentCount: number;
  }): SelfTask[] {
    const newTasks: SelfTask[] = [];

    for (const goal of this.goals.filter(g => g.status === 'active')) {
      for (const kpi of goal.kpis) {
        const gap = kpi.direction === 'higher_is_better'
          ? kpi.target - kpi.current
          : kpi.current - kpi.target;

        if (gap <= 0) continue; // KPI already met

        const gapPercent = Math.abs(gap) / kpi.target;
        const priority: SelfTask['priority'] = gapPercent > 0.5 ? 'high' : gapPercent > 0.2 ? 'medium' : 'low';

        // Generate task based on KPI type
        let action = 'optimize';
        let description = '';

        if (kpi.metric === 'success_rate' && systemMetrics.successRate < kpi.target) {
          action = 'optimize';
          description = `Improve success rate from ${systemMetrics.successRate.toFixed(1)}% to ${kpi.target}% — analyze failure patterns and adjust strategies`;
        } else if (kpi.metric === 'cost_per_task' && systemMetrics.costToday > kpi.target) {
          action = 'optimize';
          description = `Reduce cost per task — current daily cost $${systemMetrics.costToday.toFixed(2)}, target $${kpi.target}`;
        } else if (kpi.metric === 'response_time' && systemMetrics.avgLatency > kpi.target) {
          action = 'optimize';
          description = `Reduce response time from ${systemMetrics.avgLatency.toFixed(0)}ms to ${kpi.target}ms`;
        } else if (kpi.metric === 'skill_count' && systemMetrics.skillCount < kpi.target) {
          action = 'fetch_skill';
          description = `Acquire more skills — current ${systemMetrics.skillCount}, target ${kpi.target}`;
        } else if (kpi.metric === 'agent_count' && systemMetrics.agentCount < kpi.target) {
          action = 'create_agent';
          description = `Create specialized agents — current ${systemMetrics.agentCount}, target ${kpi.target}`;
        } else if (kpi.metric === 'error_rate') {
          action = 'monitor';
          description = `Monitor and reduce error rate — current ${systemMetrics.errorRate.toFixed(1)}%, target ${kpi.target}%`;
        } else {
          continue; // Unknown metric, skip
        }

        // Avoid duplicates
        const exists = goal.selfInitiatedTasks.some(
          t => t.action === action && t.status === 'pending',
        );
        if (!exists) {
          const task: SelfTask = {
            id: `task_${++this.idCounter}`,
            goalId: goal.id,
            description,
            action,
            priority,
            status: 'pending',
            createdAt: Date.now(),
          };
          goal.selfInitiatedTasks.push(task);
          newTasks.push(task);
          if (goal.selfInitiatedTasks.length > MAX_SELF_TASKS) goal.selfInitiatedTasks.shift();
        }
      }
    }

    if (newTasks.length > 0) {
      logger.info('Self-initiated tasks generated', { count: newTasks.length });
    }
    return newTasks;
  }

  /** Mark a self-initiated task as completed */
  completeTask(taskId: string, result: string): void {
    for (const goal of this.goals) {
      const task = goal.selfInitiatedTasks.find(t => t.id === taskId);
      if (task) {
        task.status = 'completed';
        task.result = result;
        task.executedAt = Date.now();
        break;
      }
    }
  }

  /** Add a monitoring trigger */
  addTrigger(trigger: Omit<MonitoringTrigger, 'id' | 'lastChecked'>): string {
    const id = `trigger_${++this.idCounter}`;
    this.triggers.push({ ...trigger, id, lastChecked: Date.now() });
    return id;
  }

  /** Check all triggers against current metrics */
  checkTriggers(metrics: Record<string, number>): Array<{
    triggerId: string;
    name: string;
    action: string;
    metricValue: number;
    threshold: number;
  }> {
    const triggered: Array<{
      triggerId: string; name: string; action: string;
      metricValue: number; threshold: number;
    }> = [];

    for (const trigger of this.triggers.filter(t => t.enabled)) {
      const value = metrics[trigger.metric];
      if (value === undefined) continue;

      const isTriggered = trigger.direction === 'above'
        ? value > trigger.threshold
        : value < trigger.threshold;

      trigger.lastChecked = Date.now();

      if (isTriggered) {
        trigger.lastTriggered = Date.now();
        triggered.push({
          triggerId: trigger.id,
          name: trigger.name,
          action: trigger.action,
          metricValue: value,
          threshold: trigger.threshold,
        });
      }
    }

    return triggered;
  }

  /** Get all active goals */
  getActiveGoals(): StrategicGoal[] {
    return this.goals.filter(g => g.status === 'active');
  }

  /** Get pending self-initiated tasks */
  getPendingTasks(): SelfTask[] {
    return this.goals.flatMap(g => g.selfInitiatedTasks.filter(t => t.status === 'pending'))
      .sort((a, b) => {
        const prio = { high: 0, medium: 1, low: 2 };
        return prio[a.priority] - prio[b.priority];
      });
  }

  /** Get strategic summary */
  getSummary(): {
    activeGoals: number;
    completedGoals: number;
    pendingTasks: number;
    avgProgress: number;
    triggers: number;
    kpisMet: number;
    kpisTotal: number;
  } {
    const active = this.goals.filter(g => g.status === 'active');
    const completed = this.goals.filter(g => g.status === 'completed');
    const allKpis = active.flatMap(g => g.kpis);
    const kpisMet = allKpis.filter(k =>
      k.direction === 'higher_is_better' ? k.current >= k.target : k.current <= k.target,
    ).length;

    return {
      activeGoals: active.length,
      completedGoals: completed.length,
      pendingTasks: this.getPendingTasks().length,
      avgProgress: active.length > 0 ? active.reduce((s, g) => s + g.progress, 0) / active.length : 0,
      triggers: this.triggers.filter(t => t.enabled).length,
      kpisMet,
      kpisTotal: allKpis.length,
    };
  }

  private calculateProgress(goal: StrategicGoal): number {
    if (goal.kpis.length === 0) return 0;
    const kpiProgress = goal.kpis.map(kpi => {
      if (kpi.direction === 'higher_is_better') {
        return Math.min(100, (kpi.current / kpi.target) * 100);
      }
      return kpi.target > 0 ? Math.min(100, (kpi.target / Math.max(kpi.current, kpi.target)) * 100) : 100;
    });
    return Math.round(kpiProgress.reduce((s, p) => s + p, 0) / kpiProgress.length);
  }
}
