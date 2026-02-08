import { BaseTool, ToolResult } from './base-tool.js';
import type { WorkflowEngine, Workflow, WorkflowAction, WorkflowTrigger } from '../../core/workflows.js';

let workflowEngineRef: WorkflowEngine | null = null;
let aiChatFn: ((system: string, message: string) => Promise<string>) | null = null;

export function setWorkflowToolDeps(deps: {
  engine: WorkflowEngine;
  aiChat: (system: string, message: string) => Promise<string>;
}) {
  workflowEngineRef = deps.engine;
  aiChatFn = deps.aiChat;
}

export class WorkflowTool extends BaseTool {
  name = 'workflow';
  description = 'Automation workflows — chain multiple tools together.';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = String(input.action ?? '');

    if (!workflowEngineRef) {
      return { success: false, output: '', error: 'Workflow engine not configured' };
    }

    switch (action) {
      case 'create': return await this.createWorkflow(input);
      case 'run': return await this.runWorkflow(String(input.workflowId ?? ''));
      case 'list': return this.listWorkflows(String(input.userId ?? ''));
      case 'toggle': return this.toggleWorkflow(String(input.workflowId ?? ''));
      case 'delete': return this.deleteWorkflow(String(input.workflowId ?? ''));
      default:
        return { success: false, output: '', error: `Unknown action: ${action}. Use: create, run, list, toggle, delete` };
    }
  }

  private async createWorkflow(input: Record<string, unknown>): Promise<ToolResult> {
    if (!workflowEngineRef || !aiChatFn) {
      return { success: false, output: '', error: 'Dependencies not configured' };
    }

    const name = String(input.name ?? '');
    const description = String(input.description ?? '');
    const trigger = String(input.trigger ?? 'manual') as WorkflowTrigger['type'];
    const triggerConfig = String(input.triggerConfig ?? '');
    const userId = String(input.userId ?? 'system');
    const stepsJson = input.steps as WorkflowAction[] | undefined;

    if (!name || !description) {
      return { success: false, output: '', error: 'name and description are required' };
    }

    let actions: WorkflowAction[];

    // If the AI provided steps directly, use them (skip AI planning)
    if (stepsJson && Array.isArray(stepsJson) && stepsJson.length > 0) {
      actions = stepsJson;
    } else {
      // AI plans the workflow steps
      try {
        const plan = await aiChatFn(
          `You design automation workflows. Convert a description to a series of action steps.
Available action types: send_message, run_command, call_api, send_email, restart_container, deploy, ai_process.
Respond ONLY with a valid JSON object, no markdown, no extra text:
{"actions":[{"type":"ai_process","config":{"prompt":"..."}},{"type":"send_message","config":{"message":"..."}}]}`,
          `Workflow: ${description}\n\nDesign steps as JSON ONLY (no markdown):`,
        );

        const cleaned = plan.replace(/```json|```/g, '').replace(/^[^{]*/, '').replace(/[^}]*$/, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in AI response');
        actions = JSON.parse(jsonMatch[0]).actions || [];
      } catch (err: any) {
        this.error('Workflow AI planning failed', { name, description, error: err.message });
        // Fallback: create a simple ai_process workflow
        actions = [
          { type: 'ai_process' as any, config: { prompt: description } },
          { type: 'send_message' as any, config: { message: `Workflow "${name}" completed` } },
        ];
      }
    }

    const workflow: Workflow = {
      id: `wf_${Date.now()}`,
      userId,
      name,
      description,
      trigger: { type: trigger, config: triggerConfig ? { expression: triggerConfig } : {} },
      actions,
      enabled: true,
      runCount: 0,
      createdAt: new Date().toISOString(),
    };

    await workflowEngineRef.addWorkflow(workflow);

    const stepList = actions.map((a, i) => `  ${i + 1}. ${a.type}: ${JSON.stringify(a.config).slice(0, 80)}`).join('\n');
    return {
      success: true,
      output: `Workflow "${name}" created (${workflow.id}) with ${actions.length} steps\nTrigger: ${trigger}${triggerConfig ? ` (${triggerConfig})` : ''}\n${stepList}`,
    };
  }

  private async runWorkflow(workflowId: string): Promise<ToolResult> {
    if (!workflowEngineRef) return { success: false, output: '', error: 'Not configured' };
    if (!workflowId) return { success: false, output: '', error: 'workflowId is required' };

    const result = await workflowEngineRef.executeWorkflow(workflowId);
    return {
      success: result.success,
      output: result.results.join('\n'),
      error: result.success ? undefined : 'Workflow execution failed',
    };
  }

  private listWorkflows(userId: string): ToolResult {
    if (!workflowEngineRef) return { success: false, output: '', error: 'Not configured' };

    const workflows = workflowEngineRef.listWorkflows(userId || undefined);
    if (workflows.length === 0) return { success: true, output: 'No workflows.' };

    const list = workflows.map(wf =>
      `${wf.enabled ? 'ON' : 'OFF'} ${wf.id}: ${wf.name} (${wf.actions.length} steps, trigger: ${wf.trigger.type}, runs: ${wf.runCount})`
    ).join('\n');

    return { success: true, output: list };
  }

  private toggleWorkflow(workflowId: string): ToolResult {
    if (!workflowEngineRef) return { success: false, output: '', error: 'Not configured' };

    const workflows = workflowEngineRef.listWorkflows();
    const wf = workflows.find(w => w.id === workflowId);
    if (!wf) return { success: false, output: '', error: 'Workflow not found' };

    wf.enabled = !wf.enabled;
    return { success: true, output: `${wf.enabled ? 'Enabled' : 'Disabled'}: ${wf.name}` };
  }

  private deleteWorkflow(workflowId: string): ToolResult {
    if (!workflowEngineRef) return { success: false, output: '', error: 'Not configured' };

    // WorkflowEngine doesn't have delete method, but we can disable
    const workflows = workflowEngineRef.listWorkflows();
    const wf = workflows.find(w => w.id === workflowId);
    if (!wf) return { success: false, output: '', error: 'Workflow not found' };

    wf.enabled = false;
    return { success: true, output: `Deleted (disabled): ${wf.name}` };
  }
}
