import logger from '../utils/logger.js';

export interface WorkflowTrigger {
  type: 'webhook' | 'cron' | 'event' | 'condition';
  config: Record<string, unknown>;
}

export interface WorkflowAction {
  type: 'send_message' | 'run_command' | 'call_api' | 'send_email' | 'restart_container' | 'deploy' | 'ai_process';
  config: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  userId: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  conditions?: Array<{ check: string; onFail: 'stop' | 'skip' | 'alert' }>;
  enabled: boolean;
  lastRun?: string;
  runCount: number;
  createdAt: string;
}

export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private actionHandlers: Map<string, (config: Record<string, unknown>) => Promise<string>> = new Map();

  registerHandler(type: string, handler: (config: Record<string, unknown>) => Promise<string>) {
    this.actionHandlers.set(type, handler);
  }

  async addWorkflow(workflow: Workflow): Promise<void> {
    this.workflows.set(workflow.id, workflow);
    logger.info('Workflow added', { id: workflow.id, name: workflow.name });
  }

  async executeWorkflow(workflowId: string): Promise<{ success: boolean; results: string[] }> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || !workflow.enabled) return { success: false, results: ['Workflow not found or disabled'] };

    const results: string[] = [];
    logger.info('Executing workflow', { id: workflow.id, name: workflow.name });

    for (let i = 0; i < workflow.actions.length; i++) {
      const action = workflow.actions[i];
      const handler = this.actionHandlers.get(action.type);

      if (!handler) {
        results.push(`Step ${i + 1}: No handler for "${action.type}"`);
        continue;
      }

      try {
        const result = await handler(action.config);
        results.push(`Step ${i + 1} (${action.type}): ${result}`);

        if (workflow.conditions?.[i]) {
          const condition = workflow.conditions[i];
          if (result.toLowerCase().includes('error') || result.toLowerCase().includes('failed')) {
            if (condition.onFail === 'stop') { results.push('Stopped due to condition.'); break; }
            if (condition.onFail === 'skip') { results.push('Skipping next step.'); continue; }
          }
        }
      } catch (err: any) {
        results.push(`Step ${i + 1} FAILED: ${err.message}`);
      }
    }

    workflow.lastRun = new Date().toISOString();
    workflow.runCount++;
    return { success: true, results };
  }

  async onEvent(eventType: string, _eventData: Record<string, unknown>): Promise<void> {
    for (const workflow of this.workflows.values()) {
      if (workflow.enabled && workflow.trigger.type === 'event' && workflow.trigger.config.eventType === eventType) {
        await this.executeWorkflow(workflow.id);
      }
    }
  }

  listWorkflows(userId?: string): Workflow[] {
    const all = Array.from(this.workflows.values());
    return userId ? all.filter(w => w.userId === userId) : all;
  }

  getWorkflowCount(): number { return this.workflows.size; }
}
