import { AIClient } from './ai-client.js';
import { getAgent } from '../agents/registry.js';
import { getToolDefinitions, executeTool } from './tool-executor.js';
import logger from '../utils/logger.js';

type CrewMode = 'sequential' | 'hierarchical' | 'ensemble';

interface CrewMember {
  agentId: string;
  role?: string;       // e.g. "researcher", "reviewer", "writer"
  context?: string;    // Extra context injected into this member's system prompt
}

interface CrewConfig {
  id: string;
  name: string;
  mode: CrewMode;
  leader?: string;         // Agent ID for the leader (hierarchical/ensemble)
  members: CrewMember[];
  task: string;
  timeout?: number;        // Per-crew timeout (ms), default 5min
  memberTimeout?: number;  // Per-member timeout (ms), default 2min
  maxRevisions?: number;   // Max revision rounds for hierarchical, default 2
}

interface CrewResult {
  success: boolean;
  output: string;
  memberOutputs: Array<{ agentId: string; output: string; duration: number }>;
  mode: CrewMode;
  totalDuration: number;
  revisions?: number;
}

const DEFAULT_CREW_TIMEOUT = 5 * 60 * 1000;   // 5min
const DEFAULT_MEMBER_TIMEOUT = 2 * 60 * 1000;  // 2min
const DEFAULT_MAX_REVISIONS = 2;

export class CrewOrchestrator {
  private ai: AIClient;

  constructor(ai: AIClient) {
    this.ai = ai;
  }

  /** Run a crew with the specified configuration */
  async runCrew(config: CrewConfig): Promise<CrewResult> {
    const crewStart = Date.now();
    const crewTimeout = config.timeout ?? DEFAULT_CREW_TIMEOUT;
    logger.info('Crew started', { id: config.id, mode: config.mode, members: config.members.length });

    try {
      const resultPromise = this.executeMode(config);

      // Crew-level timeout
      const result = await Promise.race([
        resultPromise,
        new Promise<CrewResult>((_, reject) =>
          setTimeout(() => reject(new Error(`Crew "${config.id}" timed out after ${crewTimeout / 1000}s`)), crewTimeout)
        ),
      ]);

      result.totalDuration = Date.now() - crewStart;
      logger.info('Crew completed', { id: config.id, mode: config.mode, duration: result.totalDuration, success: result.success });
      return result;
    } catch (err: any) {
      return {
        success: false,
        output: `Crew error: ${err.message}`,
        memberOutputs: [],
        mode: config.mode,
        totalDuration: Date.now() - crewStart,
      };
    }
  }

  private async executeMode(config: CrewConfig): Promise<CrewResult> {
    switch (config.mode) {
      case 'sequential': return this.runSequential(config);
      case 'hierarchical': return this.runHierarchical(config);
      case 'ensemble': return this.runEnsemble(config);
    }
  }

  /** Sequential: Each member gets the previous member's output as context */
  private async runSequential(config: CrewConfig): Promise<CrewResult> {
    const memberOutputs: Array<{ agentId: string; output: string; duration: number }> = [];
    let runningContext = config.task;

    for (const member of config.members) {
      const start = Date.now();
      const output = await this.runMember(member, runningContext, config.memberTimeout);
      memberOutputs.push({ agentId: member.agentId, output, duration: Date.now() - start });
      // Chain output as context for next member
      runningContext = `Original task: ${config.task}\n\nPrevious agent (${member.agentId}) output:\n${output}`;
    }

    const finalOutput = memberOutputs[memberOutputs.length - 1]?.output ?? '';
    return {
      success: true,
      output: finalOutput,
      memberOutputs,
      mode: 'sequential',
      totalDuration: 0, // Set by caller
    };
  }

  /** Hierarchical: Leader delegates, reviews, may request revisions */
  private async runHierarchical(config: CrewConfig): Promise<CrewResult> {
    const leaderId = config.leader ?? config.members[0]?.agentId;
    const workers = config.members.filter(m => m.agentId !== leaderId);
    const maxRevisions = config.maxRevisions ?? DEFAULT_MAX_REVISIONS;
    const memberOutputs: Array<{ agentId: string; output: string; duration: number }> = [];
    let revisions = 0;

    // Step 1: Leader creates delegation plan
    const delegationPlan = await this.runMember(
      { agentId: leaderId, role: 'leader' },
      `You are the LEADER of a crew. Delegate this task to your workers.
Workers: ${workers.map(w => `${w.agentId} (${w.role ?? 'worker'})`).join(', ')}

Task: ${config.task}

For each worker, provide a specific sub-task. Respond with the full task for each worker, separated by "---WORKER: <agentId>---"`,
      config.memberTimeout,
    );

    // Step 2: Parse delegation and run workers
    const workerTasks = this.parseDelegation(delegationPlan, workers);
    const workerResults: Array<{ agentId: string; output: string }> = [];

    for (const wt of workerTasks) {
      const start = Date.now();
      const output = await this.runMember(wt.member, wt.task, config.memberTimeout);
      memberOutputs.push({ agentId: wt.member.agentId, output, duration: Date.now() - start });
      workerResults.push({ agentId: wt.member.agentId, output });
    }

    // Step 3: Leader reviews and synthesizes
    let synthesis = await this.runMember(
      { agentId: leaderId, role: 'leader' },
      `Review these worker outputs for the task: ${config.task}

${workerResults.map(r => `--- ${r.agentId} ---\n${r.output}`).join('\n\n')}

If the outputs are satisfactory, synthesize a final answer.
If revisions are needed, respond with "REVISION NEEDED:" followed by instructions.`,
      config.memberTimeout,
    );

    // Step 4: Revision loop
    while (synthesis.includes('REVISION NEEDED:') && revisions < maxRevisions) {
      revisions++;
      const revisionInstructions = synthesis.split('REVISION NEEDED:')[1]?.trim() ?? '';

      for (const wt of workerTasks) {
        const start = Date.now();
        const output = await this.runMember(
          wt.member,
          `REVISION (round ${revisions}): ${revisionInstructions}\n\nYour previous output:\n${workerResults.find(r => r.agentId === wt.member.agentId)?.output ?? ''}`,
          config.memberTimeout,
        );
        memberOutputs.push({ agentId: wt.member.agentId, output, duration: Date.now() - start });
        const idx = workerResults.findIndex(r => r.agentId === wt.member.agentId);
        if (idx >= 0) workerResults[idx].output = output;
      }

      synthesis = await this.runMember(
        { agentId: leaderId, role: 'leader' },
        `Review revised outputs:\n${workerResults.map(r => `--- ${r.agentId} ---\n${r.output}`).join('\n\n')}`,
        config.memberTimeout,
      );
    }

    return {
      success: true,
      output: synthesis,
      memberOutputs,
      mode: 'hierarchical',
      totalDuration: 0,
      revisions,
    };
  }

  /** Ensemble: All members run concurrently, leader synthesizes best result */
  private async runEnsemble(config: CrewConfig): Promise<CrewResult> {
    const leaderId = config.leader ?? config.members[0]?.agentId;
    const workers = config.members.filter(m => m.agentId !== leaderId);
    const memberOutputs: Array<{ agentId: string; output: string; duration: number }> = [];

    // Run all workers concurrently
    const results = await Promise.allSettled(
      workers.map(async (member) => {
        const start = Date.now();
        const output = await this.runMember(member, config.task, config.memberTimeout);
        return { agentId: member.agentId, output, duration: Date.now() - start };
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        memberOutputs.push(r.value);
      }
    }

    // Leader synthesizes
    const synthesis = await this.runMember(
      { agentId: leaderId, role: 'synthesizer' },
      `Multiple agents worked on this task concurrently. Synthesize the BEST answer.
Task: ${config.task}

${memberOutputs.map(r => `--- ${r.agentId} ---\n${r.output}`).join('\n\n')}

Pick the best parts from each response and create a unified, high-quality answer.`,
      config.memberTimeout,
    );

    return {
      success: true,
      output: synthesis,
      memberOutputs,
      mode: 'ensemble',
      totalDuration: 0,
    };
  }

  /** Run a single member agent with chatWithTools */
  private async runMember(member: CrewMember, task: string, timeout?: number): Promise<string> {
    const agent = getAgent(member.agentId);
    if (!agent) return `Agent ${member.agentId} not found`;

    const memberTimeout = timeout ?? DEFAULT_MEMBER_TIMEOUT;
    const agentTools = agent.tools.filter(t => t !== 'desktop');
    const toolDefs = agentTools.length > 0 ? getToolDefinitions(agentTools) : [];

    let systemPrompt = agent.systemPrompt;
    if (member.role) systemPrompt += `\n\nYour role in this crew: ${member.role}`;
    if (member.context) systemPrompt += `\n\n${member.context}`;

    try {
      const result = await Promise.race([
        toolDefs.length > 0
          ? this.ai.chatWithTools(
              {
                systemPrompt,
                messages: [{ role: 'user', content: task }],
                tools: toolDefs,
                maxTokens: agent.maxTokens,
                temperature: agent.temperature,
                maxToolIterations: agent.maxToolIterations ?? 10,
              },
              async (toolName, toolInput) => executeTool(toolName, toolInput),
            )
          : this.ai.chat({
              systemPrompt,
              messages: [{ role: 'user', content: task }],
              maxTokens: agent.maxTokens,
              temperature: agent.temperature,
            }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Member ${member.agentId} timed out`)), memberTimeout)
        ),
      ]);

      return result.content;
    } catch (err: any) {
      logger.warn('Crew member failed', { agentId: member.agentId, error: err.message });
      return `Error: ${err.message}`;
    }
  }

  /** Parse leader's delegation into per-worker tasks */
  private parseDelegation(plan: string, workers: CrewMember[]): Array<{ member: CrewMember; task: string }> {
    const tasks: Array<{ member: CrewMember; task: string }> = [];
    const sections = plan.split(/---WORKER:\s*/i);

    for (let i = 1; i < sections.length; i++) {
      const lines = sections[i].split('\n');
      const agentId = lines[0]?.replace(/---/g, '').trim();
      const task = lines.slice(1).join('\n').trim();
      const member = workers.find(w => w.agentId === agentId);
      if (member && task) tasks.push({ member, task });
    }

    // Fallback: assign full plan to all workers if parsing failed
    if (tasks.length === 0) {
      for (const worker of workers) {
        tasks.push({ member: worker, task: plan });
      }
    }

    return tasks;
  }
}
