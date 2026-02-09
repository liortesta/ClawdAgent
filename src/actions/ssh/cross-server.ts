import { exec } from 'child_process';
import { promisify } from 'util';
import { SSHSessionManager, getSSHManager } from './session-manager.js';
import logger from '../../utils/logger.js';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  server: string;        // Server ID or "local" for local execution
  name: string;          // Step name for display
  command: string;       // Command to execute (supports {{var}} template vars)
  saveOutput?: string;   // Save stdout to this variable name
  onError: 'skip' | 'abort' | 'retry';
  retryCount?: number;   // Max retries (default 2)
  timeout?: number;      // Command timeout ms (default 30000)
}

export interface CrossServerWorkflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  variables: Record<string, string>;  // Template variables
  createdAt: string;
}

export interface WorkflowResult {
  workflowId: string;
  success: boolean;
  stepsCompleted: number;
  totalSteps: number;
  results: Array<{
    step: string;
    server: string;
    success: boolean;
    output: string;
    error?: string;
    durationMs: number;
  }>;
  variables: Record<string, string>;  // Final state of all variables
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Replace `{{key}}` placeholders in a template string with values from the
 * supplied variables map. Unmatched placeholders are left as-is.
 */
export function replaceVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

// ---------------------------------------------------------------------------
// CrossServerExecutor
// ---------------------------------------------------------------------------

export class CrossServerExecutor {
  private workflows: Map<string, CrossServerWorkflow> = new Map();
  private sshManager: SSHSessionManager;

  constructor(sshManager: SSHSessionManager) {
    this.sshManager = sshManager;
  }

  // -----------------------------------------------------------------------
  // Workflow CRUD
  // -----------------------------------------------------------------------

  /**
   * Create and store a new workflow. An `id` and `createdAt` timestamp are
   * generated automatically.
   */
  createWorkflow(
    workflow: Omit<CrossServerWorkflow, 'id' | 'createdAt'>,
  ): CrossServerWorkflow {
    const id = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const full: CrossServerWorkflow = {
      ...workflow,
      id,
      createdAt: new Date().toISOString(),
    };
    this.workflows.set(id, full);
    logger.info('CrossServer: workflow created', { id, name: full.name, steps: full.steps.length });
    return full;
  }

  listWorkflows(): CrossServerWorkflow[] {
    return Array.from(this.workflows.values());
  }

  getWorkflow(id: string): CrossServerWorkflow | undefined {
    return this.workflows.get(id);
  }

  deleteWorkflow(id: string): boolean {
    const existed = this.workflows.delete(id);
    if (existed) {
      logger.info('CrossServer: workflow deleted', { id });
    }
    return existed;
  }

  // -----------------------------------------------------------------------
  // Execution
  // -----------------------------------------------------------------------

  /**
   * Execute a previously stored workflow by its ID.
   * `extraVars` are merged on top of the workflow's own variables.
   */
  async executeWorkflow(
    workflowId: string,
    extraVars?: Record<string, string>,
  ): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`CrossServer: unknown workflow "${workflowId}"`);
    }

    const variables: Record<string, string> = {
      ...workflow.variables,
      ...extraVars,
    };

    logger.info('CrossServer: executing workflow', {
      id: workflowId,
      name: workflow.name,
      steps: workflow.steps.length,
    });

    return this.runSteps(workflowId, workflow.steps, variables);
  }

  /**
   * Execute an ad-hoc list of steps without storing a workflow.
   */
  async executeSteps(
    steps: WorkflowStep[],
    variables?: Record<string, string>,
  ): Promise<WorkflowResult> {
    const adHocId = `adhoc_${Date.now()}`;
    logger.info('CrossServer: executing ad-hoc steps', { id: adHocId, steps: steps.length });
    return this.runSteps(adHocId, steps, { ...variables });
  }

  // -----------------------------------------------------------------------
  // Display
  // -----------------------------------------------------------------------

  /**
   * Format a `WorkflowResult` into a human-readable summary string.
   */
  formatResult(result: WorkflowResult): string {
    const lines: string[] = [];

    lines.push(`Workflow: ${result.workflowId}`);
    lines.push(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    lines.push(`Steps: ${result.stepsCompleted}/${result.totalSteps} completed`);
    lines.push('');

    for (const r of result.results) {
      const icon = r.success ? '\u2705' : '\u274C';
      const duration = `${r.durationMs}ms`;
      lines.push(`${icon} [${r.server}] ${r.step} (${duration})`);
      if (r.output) {
        const preview = r.output.length > 200 ? `${r.output.slice(0, 200)}...` : r.output;
        lines.push(`   Output: ${preview}`);
      }
      if (r.error) {
        lines.push(`   Error: ${r.error}`);
      }
    }

    lines.push('');
    lines.push(`Total duration: ${result.totalDurationMs}ms`);

    if (Object.keys(result.variables).length > 0) {
      lines.push('');
      lines.push('Variables:');
      for (const [key, value] of Object.entries(result.variables)) {
        const preview = value.length > 100 ? `${value.slice(0, 100)}...` : value;
        lines.push(`  ${key} = ${preview}`);
      }
    }

    return lines.join('\n');
  }

  // -----------------------------------------------------------------------
  // Private: step runner
  // -----------------------------------------------------------------------

  private async runSteps(
    workflowId: string,
    steps: WorkflowStep[],
    variables: Record<string, string>,
  ): Promise<WorkflowResult> {
    const workflowStart = Date.now();
    const results: WorkflowResult['results'] = [];
    let stepsCompleted = 0;
    let aborted = false;

    for (const step of steps) {
      if (aborted) break;

      const resolvedCommand = replaceVars(step.command, variables);
      const timeout = step.timeout ?? 30_000;
      const maxRetries = step.retryCount ?? 2;
      const stepStart = Date.now();

      let success = false;
      let output = '';
      let error: string | undefined;

      logger.info('CrossServer: executing step', {
        workflowId,
        step: step.name,
        server: step.server,
        command: resolvedCommand,
      });

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          logger.info('CrossServer: retrying step', {
            workflowId,
            step: step.name,
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
          });
        }

        try {
          if (step.server === 'local') {
            const result = await execAsync(resolvedCommand, { timeout });
            output = result.stdout.trim();
            if (result.stderr) {
              logger.debug('CrossServer: local stderr', {
                step: step.name,
                stderr: result.stderr.trim(),
              });
            }
          } else {
            // Ensure SSH connection is live
            if (!this.sshManager.isConnected(step.server)) {
              await this.sshManager.connect(step.server);
            }

            const result = await this.sshManager.exec(step.server, resolvedCommand, timeout);
            output = result.stdout.trim();

            if (result.code !== 0) {
              throw new Error(
                `Command exited with code ${result.code}${result.stderr ? `: ${result.stderr.trim()}` : ''}`,
              );
            }
          }

          success = true;
          error = undefined;
          break; // No need to retry on success
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          output = '';
          logger.warn('CrossServer: step failed', {
            workflowId,
            step: step.name,
            attempt: attempt + 1,
            error,
          });

          // Only retry if the error policy is 'retry' and we haven't exhausted attempts
          if (step.onError !== 'retry' || attempt >= maxRetries) {
            break;
          }
        }
      }

      const durationMs = Date.now() - stepStart;

      results.push({
        step: step.name,
        server: step.server,
        success,
        output,
        error,
        durationMs,
      });

      if (success) {
        stepsCompleted++;

        // Store output in variables if requested
        if (step.saveOutput) {
          variables[step.saveOutput] = output;
          logger.debug('CrossServer: saved output to variable', {
            variable: step.saveOutput,
            length: output.length,
          });
        }
      } else {
        // Handle error policy
        switch (step.onError) {
          case 'abort':
            logger.error('CrossServer: aborting workflow due to step failure', {
              workflowId,
              step: step.name,
            });
            aborted = true;
            break;
          case 'skip':
            logger.warn('CrossServer: skipping failed step', {
              workflowId,
              step: step.name,
            });
            break;
          case 'retry':
            // Retries already exhausted in the loop above
            logger.warn('CrossServer: step failed after all retries', {
              workflowId,
              step: step.name,
            });
            break;
        }
      }
    }

    const totalDurationMs = Date.now() - workflowStart;
    const allSuccess = results.every((r) => r.success);

    const result: WorkflowResult = {
      workflowId,
      success: allSuccess,
      stepsCompleted,
      totalSteps: steps.length,
      results,
      variables: { ...variables },
      totalDurationMs,
    };

    logger.info('CrossServer: workflow completed', {
      workflowId,
      success: result.success,
      stepsCompleted: result.stepsCompleted,
      totalSteps: result.totalSteps,
      totalDurationMs,
    });

    return result;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getCrossServerExecutor(): CrossServerExecutor {
  return new CrossServerExecutor(getSSHManager());
}
