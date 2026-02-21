import logger from '../utils/logger.js';

export type GoalStatus = 'active' | 'pursuing' | 'blocked' | 'completed' | 'failed' | 'cancelled';

export interface GoalStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  tool?: string;
  attempts: number;
  maxAttempts: number;
  result?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface Goal {
  id: string;
  userId: string;
  description: string;
  status: GoalStatus;
  priority: 'critical' | 'high' | 'medium' | 'low';
  steps: GoalStep[];
  currentStepIndex: number;
  totalAttempts: number;
  maxTotalAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  deadline?: Date;
  context: Record<string, unknown>;
  strategyHistory: string[];
}

export class GoalEngine {
  private goals: Map<string, Goal> = new Map();

  createGoal(userId: string, description: string, priority: Goal['priority'] = 'medium', deadline?: Date): Goal {
    const goal: Goal = {
      id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      description,
      status: 'active',
      priority,
      steps: [],
      currentStepIndex: 0,
      totalAttempts: 0,
      maxTotalAttempts: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
      deadline,
      context: {},
      strategyHistory: [],
    };
    this.goals.set(goal.id, goal);
    logger.info('🎯 Goal created', { goalId: goal.id, description, priority });
    return goal;
  }

  getGoal(goalId: string): Goal | undefined {
    return this.goals.get(goalId);
  }

  getActiveGoals(userId: string): Goal[] {
    return Array.from(this.goals.values())
      .filter(g => g.userId === userId && !['completed', 'cancelled', 'failed'].includes(g.status));
  }

  getAllGoals(userId: string): Goal[] {
    return Array.from(this.goals.values()).filter(g => g.userId === userId);
  }

  getAllActiveGoals(): Goal[] {
    return Array.from(this.goals.values())
      .filter(g => !['completed', 'cancelled', 'failed'].includes(g.status));
  }

  setSteps(goalId: string, steps: GoalStep[]): void {
    const goal = this.goals.get(goalId);
    if (!goal) return;
    goal.steps = steps;
    goal.currentStepIndex = 0;
    goal.status = 'pursuing';
    goal.updatedAt = new Date();
  }

  startStep(goalId: string, stepIndex: number): void {
    const goal = this.goals.get(goalId);
    if (!goal || !goal.steps[stepIndex]) return;
    goal.steps[stepIndex].status = 'running';
    goal.steps[stepIndex].startedAt = new Date();
    goal.steps[stepIndex].attempts++;
  }

  getCurrentStep(goalId: string): GoalStep | null {
    const goal = this.goals.get(goalId);
    if (!goal || goal.currentStepIndex >= goal.steps.length) return null;
    return goal.steps[goal.currentStepIndex];
  }

  completeStep(goalId: string, stepIndex: number, result: string): void {
    const goal = this.goals.get(goalId);
    if (!goal || !goal.steps[stepIndex]) return;

    goal.steps[stepIndex].status = 'done';
    goal.steps[stepIndex].result = result;
    goal.steps[stepIndex].completedAt = new Date();
    goal.currentStepIndex = stepIndex + 1;
    goal.updatedAt = new Date();

    if (goal.steps.every(s => s.status === 'done')) {
      goal.status = 'completed';
      logger.info('🎯 Goal completed!', { goalId, description: goal.description });
    }
  }

  failStep(goalId: string, stepIndex: number, error: string): 'retry' | 'replan' | 'give_up' {
    const goal = this.goals.get(goalId);
    if (!goal || !goal.steps[stepIndex]) return 'give_up';

    const step = goal.steps[stepIndex];
    step.attempts++;
    step.error = error;
    goal.totalAttempts++;
    goal.updatedAt = new Date();

    // Safety limit reached
    if (goal.totalAttempts >= goal.maxTotalAttempts) {
      goal.status = 'failed';
      logger.warn('Goal failed — max attempts reached', { goalId, totalAttempts: goal.totalAttempts });
      return 'give_up';
    }

    // Step max attempts — need different approach
    if (step.attempts >= step.maxAttempts) {
      step.status = 'failed';
      goal.strategyHistory.push(`Step "${step.description}" failed after ${step.attempts} attempts: ${error}`);
      // Ceiling: prevent unbounded strategy history growth
      if (goal.strategyHistory.length > 20) goal.strategyHistory.shift();
      goal.status = 'blocked';
      return 'replan';
    }

    return 'retry';
  }

  cancelGoal(goalId: string): void {
    const goal = this.goals.get(goalId);
    if (goal) {
      goal.status = 'cancelled';
      goal.updatedAt = new Date();
      logger.info('Goal cancelled', { goalId });
    }
  }

  getGoalsSummary(userId: string): string {
    const active = this.getActiveGoals(userId);
    if (active.length === 0) return '';
    return active.map(g => {
      const done = g.steps.filter(s => s.status === 'done').length;
      const total = g.steps.length;
      const progress = total > 0 ? `${done}/${total} steps` : 'planning';
      return `- 🎯 ${g.description} [${g.status}] (${progress})`;
    }).join('\n');
  }
}
