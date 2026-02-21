/**
 * ACP (Agent Communication Protocol) Handler
 * Lightweight REST agent-to-agent messaging.
 * @see https://agentcommunicationprotocol.dev
 */

import { randomUUID } from 'crypto';
import { getAllAgents } from '../../agents/registry.js';
import type { ACPAgentDescriptor, ACPMessage, ACPRun } from './types.js';
import type { Engine } from '../../core/engine.js';
import logger from '../../utils/logger.js';

/** In-memory run store */
const runs = new Map<string, ACPRun>();
const MAX_RUNS = 500;

/** Evict old completed runs */
function evictOldRuns(): void {
  if (runs.size < MAX_RUNS) return;
  const completed = [...runs.entries()]
    .filter(([, r]) => ['completed', 'failed', 'cancelled'].includes(r.state))
    .sort((a, b) => new Date(a[1].updatedAt).getTime() - new Date(b[1].updatedAt).getTime());
  for (const [id] of completed.slice(0, Math.floor(MAX_RUNS / 4))) {
    runs.delete(id);
  }
}

/** Build ACP agent descriptor from ClawdAgent metadata */
export function buildAgentDescriptor(): ACPAgentDescriptor {
  const agents = getAllAgents();
  return {
    name: 'ClawdAgent',
    description:
      'Autonomous AI agent system — 18 specialized agents, 29 tools, 74 skills. ' +
      'Server management, code generation, content creation, crypto trading, browser automation.',
    version: '6.0.0',
    capabilities: agents.map(a => a.id),
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message/instruction to process' },
        agent: { type: 'string', description: 'Optional: specific agent ID to route to' },
        model: { type: 'string', description: 'Optional: specific model to use' },
      },
      required: ['message'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        response: { type: 'string', description: 'The agent response text' },
        agent: { type: 'string', description: 'Agent that handled the request' },
        toolsUsed: { type: 'array', items: { type: 'string' } },
      },
    },
    metadata: {
      protocol: 'acp',
      protocolVersion: '0.1.0',
      agents: agents.map(a => ({ id: a.id, name: a.name, description: a.description })),
      platforms: ['telegram', 'discord', 'whatsapp', 'web'],
    },
  };
}

/** Create a new run (start processing a message) */
export async function createRun(
  input: ACPMessage[],
  engine: Engine,
  agentId?: string,
): Promise<ACPRun> {
  evictOldRuns();

  const runId = randomUUID();
  const now = new Date().toISOString();
  const run: ACPRun = {
    id: runId,
    agentId: agentId ?? 'auto',
    state: 'created',
    input,
    output: [],
    createdAt: now,
    updatedAt: now,
  };
  runs.set(runId, run);

  // Transition to in-progress
  run.state = 'in-progress';
  run.updatedAt = new Date().toISOString();

  // Process asynchronously
  processRunAsync(run, engine).catch(err => {
    logger.error('ACP run processing failed', { runId, error: String(err) });
    run.state = 'failed';
    run.output.push({
      role: 'assistant',
      content: `Run failed: ${String(err)}`,
      metadata: { error: true },
    });
    run.updatedAt = new Date().toISOString();
  });

  return run;
}

/** Process run via ClawdAgent engine */
async function processRunAsync(run: ACPRun, engine: Engine): Promise<void> {
  // Extract user text from input messages
  const userText = run.input
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');

  try {
    const result = await engine.process({
      platform: 'web',
      userId: `acp:${run.id}`,
      userName: 'ACP Agent',
      chatId: `acp:${run.id}`,
      text: userText,
      metadata: { protocol: 'acp', runId: run.id, targetAgent: run.agentId },
    });

    run.output.push({
      role: 'assistant',
      content: result.text || 'Completed with no output.',
      metadata: {
        agent: result.agentUsed,
        provider: result.provider,
        tokensUsed: result.tokensUsed,
      },
    });
    run.state = 'completed';
    run.updatedAt = new Date().toISOString();
  } catch (err) {
    run.state = 'failed';
    run.output.push({
      role: 'assistant',
      content: `Processing error: ${String(err)}`,
      metadata: { error: true },
    });
    run.updatedAt = new Date().toISOString();
    throw err;
  }
}

/** Get a run by ID */
export function getRun(runId: string): ACPRun | undefined {
  return runs.get(runId);
}

/** List runs */
export function listRuns(limit = 50): ACPRun[] {
  return [...runs.values()]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

/** Cancel a run */
export function cancelRun(runId: string): ACPRun | undefined {
  const run = runs.get(runId);
  if (!run) return undefined;
  if (['completed', 'failed', 'cancelled'].includes(run.state)) return undefined;
  run.state = 'cancelled';
  run.updatedAt = new Date().toISOString();
  return run;
}

/** Add input to an awaiting run (continue conversation) */
export async function addInput(
  runId: string,
  messages: ACPMessage[],
  engine: Engine,
): Promise<ACPRun | undefined> {
  const run = runs.get(runId);
  if (!run) return undefined;
  if (!['awaiting-input', 'completed'].includes(run.state)) return undefined;

  run.input.push(...messages);
  run.state = 'in-progress';
  run.updatedAt = new Date().toISOString();

  processRunAsync(run, engine).catch(err => {
    logger.error('ACP run continuation failed', { runId, error: String(err) });
  });

  return run;
}

/** Get run stats */
export function getRunStats(): Record<string, number> {
  const stats: Record<string, number> = { total: runs.size };
  for (const run of runs.values()) {
    stats[run.state] = (stats[run.state] ?? 0) + 1;
  }
  return stats;
}
